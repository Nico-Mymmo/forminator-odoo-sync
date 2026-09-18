/**
 * Mymmo Forms — het levende voorbeeld in de shortcode-bouwer.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * De bouwer was een tabel met vijftien invoervelden en onderaan een shortcode.
 * Om te zien wat je gemaakt had, moest je die shortcode kopiëren, op een pagina
 * plakken, publiceren en kijken — en bij elke correctie opnieuw. Dat is geen
 * bouwer, dat is een formulier waarvan je het resultaat pas elders ziet.
 *
 * Nu staat het venster bovenaan de pagina, open, in het echt, en typ je de
 * teksten er rechtstreeks in. Zelfde uitgangspunt als de formulierbouwer en de
 * maileditor in de Operations Manager: JE BEWERKT IN HET VOORBEELD, niet in een
 * lijst met velden ernaast. Wat je niet kan typen (welk formulier, welke agenda,
 * de kleur, de afbeelding) blijft een veld eronder.
 *
 * HET VOORBEELD KAN NIET LIEGEN
 * -----------------------------
 * De HTML komt van de SERVER, uit exact dezelfde aanroep die de shortcode op een
 * pagina doet (`wp_ajax_mymmo_forms_preview` → `render_button()`). En ze wordt
 * getoond in een iframe met precies mymmo-forms.css + mymmo-forms-modal.css +
 * mymmo-forms-modal.js — de bestanden van de bezoeker, niet een kopie. Er is dus
 * geen tweede renderer die kan afdrijven. Dezelfde afweging als het
 * voorbeeld-iframe in de formulierbouwer van de OM.
 *
 * TYPEN HERTEKENT HET CANVAS NIET
 * -------------------------------
 * Een tekstwijziging past één tekstknoop aan en werkt het verborgen invoerveld
 * bij; opnieuw renderen gebeurt alleen bij een STRUCTURELE wijziging (ander
 * formulier, agenda erbij of weg, afbeelding, kleur, een punt erbij of weg).
 * Zou elke toetsaanslag hertekenen, dan springt de cursor weg en flikkert het
 * scherm — precies waarom dezelfde regel in de mailstudio staat.
 *
 * DE BRON VAN DE WAARHEID BLIJVEN DE INVOERVELDEN.
 * Het canvas leest ze en schrijft erin terug; mymmo-forms-admin.js bouwt daar
 * onveranderd de shortcode uit op. Het canvas is dus een VENSTER op die velden,
 * geen tweede opslag — anders zou de shortcode iets anders kunnen zeggen dan het
 * voorbeeld toont, en dan is het voorbeeld waardeloos.
 *
 * Zonder JavaScript gebeurt hier niets: het canvas staat `hidden` in de HTML en
 * de velden die het overneemt blijven dan gewoon staan.
 */

(function () {
  'use strict';

  var C = window.MymmoFormsPreview || {};
  var B = null; // window.MymmoFormsBouwer, gezet door mymmo-forms-admin.js

  var canvas, frame, stage, statusEl, schaalEl;

  /**
   * De breedte die het iframe INWENDIG aanhoudt, per weergave.
   *
   * 1100 en niet "wat er past": de mediaquery's van het venster slaan om bij
   * 900px, en bij een smallere kolom zou het voorbeeld de gestapelde weergave
   * tonen terwijl een bezoeker op een desktop twee kolommen krijgt.
   */
  var BREEDTES = { desktop: 1100, mobiel: 390 };
  var laatsteStructuur = null;
  var wachtend = null;
  var vanCanvas = false;

  /* Staat de tekening op haar echte laag (achter alles), of vooraan zodat je ze
     kan vastpakken? De keuze leeft HIER en niet in het iframe: dat wordt bij
     elke structurele wijziging opnieuw opgebouwd, en dan zou de stand telkens
     terugspringen midden in het werk. */
  var figuurAchter = false;

  /* Staat het dankjewelscherm open in plaats van het formulier? Zelfde reden
     als hierboven: de stand leeft buiten het iframe. */
  var toonDank = false;

  /**
   * Welke tekst in het venster bij welk invoerveld hoort.
   *
   * Op KLASSE en niet op een eigen data-attribuut in modal.php: zo hoeft dat
   * sjabloon niets van dit scherm te weten en staat er in de HTML van een
   * bezoeker geen enkel spoor van de bouwer.
   */
  var TEKSTEN = [
    { sel: '.mymmo-modal-button', veld: 'mymmoFormsLabel' },
    { sel: '.mymmo-modal-title', veld: 'mymmoFormsHeading' },
    { sel: '.mymmo-modal-lead', veld: 'mymmoFormsIntro' },
    { sel: '[data-mymmo-tab="form"] .mymmo-modal-tab-label', veld: 'mymmoFormsTabForm' },
    { sel: '[data-mymmo-tab="form"] .mymmo-modal-tab-sub', veld: 'mymmoFormsTabFormSub', leeg: 'Regeltje uitleg' },
    { sel: '[data-mymmo-tab="calendly"] .mymmo-modal-tab-label', veld: 'mymmoFormsTabCalendly' },
    { sel: '[data-mymmo-tab="calendly"] .mymmo-modal-tab-sub', veld: 'mymmoFormsTabCalendlySub', leeg: 'Regeltje uitleg' },
    { sel: '[data-mymmo-tab="extra"] .mymmo-modal-tab-label', veld: 'mymmoFormsTabExtra' },
    { sel: '[data-mymmo-tab="extra"] .mymmo-modal-tab-sub', veld: 'mymmoFormsTabExtraSub', leeg: 'Regeltje uitleg' },

    /*
     * De kop boven de LAATSTE stap -- het formulier. Die hoort bij de
     * PLAATSING en niet bij een stap, dus hij gaat als gewoon attribuut de
     * shortcode in, net als de tabbladen hierboven.
     *
     * De selector is bewust gebonden aan `.mymmo-stap--formulier`: dezelfde
     * twee klassen staan ook boven een HTML-stap, en die horen bij de STAP en
     * worden dus heel ergens anders bewaard (zie maakStapTekstBewerkbaar).
     */
    { sel: '.mymmo-stap--formulier [data-mymmo-kop="form-titel"]', veld: 'mymmoFormsFormTitle' },
    { sel: '.mymmo-stap--formulier [data-mymmo-kop="form-sub"]', veld: 'mymmoFormsFormSub' },

    /*
     * Het dankjewelscherm per tabblad (1.16). Het staat als verborgen sjabloon
     * in elk paneel; de knop "Dankjewelscherm" boven het voorbeeld zet het
     * zichtbaar. Een lege tekst toont de standaard (de bedanktekst uit de OM),
     * dus hier typen overschrijft die pas vanaf de eerste letter.
     */
    { sel: '[data-mymmo-dank-scherm="form"] [data-mymmo-dank="titel"]', veld: 'mymmoFormsThanksFormTitle', leeg: 'Titel (optioneel)' },
    { sel: '[data-mymmo-dank-scherm="form"] [data-mymmo-dank="tekst"]', veld: 'mymmoFormsThanksFormText', leeg: 'Tekst' },
    { sel: '[data-mymmo-dank-scherm="extra"] [data-mymmo-dank="titel"]', veld: 'mymmoFormsThanksExtraTitle', leeg: 'Titel (optioneel)' },
    { sel: '[data-mymmo-dank-scherm="extra"] [data-mymmo-dank="tekst"]', veld: 'mymmoFormsThanksExtraText', leeg: 'Tekst' },
    { sel: '[data-mymmo-dank-scherm="calendly"] [data-mymmo-dank="titel"]', veld: 'mymmoFormsThanksCalendlyTitle', leeg: 'Titel (optioneel)' },
    { sel: '[data-mymmo-dank-scherm="calendly"] [data-mymmo-dank="tekst"]', veld: 'mymmoFormsThanksCalendly', leeg: 'Tekst' }
  ];

  /**
   * De laag die van een voorbeeld een editor maakt, IN het iframe.
   *
   * Hij staat hier en niet in mymmo-forms-admin.css, want daar kan hij niet bij
   * de inhoud van het iframe. En hij staat niet in mymmo-forms-modal.css, want
   * dat bestand gaat mee naar elke bezoeker.
   *
   * Het venster wordt hier UIT ZIJN OVERLAY gehaald (position:static, geen
   * achtergrondvlak). Niet uit gemak: als overlay ligt het venster over de knop
   * heen, en dan is de knoptekst — een van de dingen die je hier komt zetten —
   * niet aan te klikken. Het PANEEL zelf blijft ongewijzigd; dat is wat je
   * ontwerpt.
   */
  var CANVAS_CSS = [
    'html{background:#eef2f7}',
    'body{margin:0;padding:20px;font:16px/1.5 -apple-system,system-ui,"Segoe UI",sans-serif}',
    '.mymmo-modal{position:static;display:flex;padding:0;z-index:auto}',
    /* Geen open-animatie in het voorbeeld: dat hertekent bij elke structurele
       wijziging, en dan springt het venster telkens opnieuw in beeld. */
    '.mymmo-modal .mymmo-modal-panel{animation:none}',
    '.mymmo-modal-backdrop{display:none}',
    '.mymmo-modal-panel{margin:0 auto}',
    /* De wikkel is op een pagina een inline-block, want daar staat er een knop
       in de lopende tekst. Hier zit het VENSTER erin (het is uit zijn overlay
       gehaald), en een inline-block krimpt naar zijn inhoud -- dan viel de
       inhoudskolom weg en bleef er een venster ter breedte van de zijkolom
       over. Als overlay speelt dat niet: position:fixed staat buiten de
       stroom. */
    '.mymmo-modal-launch{display:block;margin-bottom:18px}',
    /* Het bijschrift tussen de knop en het venster. */
    '.mf-uitleg{max-width:1060px;margin:0 auto 10px;color:#64748b;font-size:12px;text-align:center}',
    /* Bewerkbare tekst. Enkel een omlijning bij aanwijzen en focus -- een
       permanent kader zou het voorbeeld onbruikbaar maken als voorbeeld. */
    '[data-mf-edit]{outline-offset:2px;border-radius:3px}',
    '[data-mf-edit]:hover{outline:1px dashed rgba(37,99,235,.55)}',
    '[data-mf-edit]:focus{outline:2px solid #2563eb;background:rgba(37,99,235,.07)}',
    /* Lege tekst: een CSS-::before op een LEEG element, nooit echte tekst.
       Stond de plaatsaanduiding als tekst in het element, dan typ je ertussen
       en krijg je "Regelrtje" in plaats van "Regeltje". Een leeg inline-element
       heeft bovendien geen afmetingen, dus het krijgt er hier zelf. */
    '[data-mf-leeg]:empty::before{content:attr(data-mf-leeg);opacity:.45}',
    '[data-mf-leeg]:empty{display:inline-block;min-width:7em;min-height:1em}',
    /* De knopjes bij de opsomming. */
    '.mymmo-modal-punt{position:relative}',
    '.mf-knop{font:inherit;font-size:11px;line-height:1;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:4px;padding:3px 6px}',
    '.mf-knop:hover{border-color:#2563eb;color:#2563eb}',
    '.mf-punt-weg{margin-left:auto;flex:0 0 auto}',
    '.mf-punt-erbij{margin-top:2px;align-self:flex-start}',
    /* Vastpakken en slepen. Alleen in de bouwer: op een pagina staat er
       pointer-events:none op, want daar is het decoratie.

       De figuur staat op een pagina ACHTER alles (z-index:-1). Hier moet ze
       vast te pakken zijn, dus hier komt ze naar voren -- enkel in het canvas.

       Dat is bewust de STANDAARD en niet de waarheid: wie de tekening komt
       verplaatsen, moet ze kunnen aanwijzen. De knop "Tekening achteraan" zet
       ze terug op haar echte laag, zodat je kan zien wat een bezoeker ziet --
       en dan is ze ook niet meer vast te pakken, net als op een pagina. */
    '.mymmo-modal-figuur{z-index:auto}',
    'html.mf-figuur-achter .mymmo-modal-figuur{z-index:-1}',
    '[data-mymmo-greep]{pointer-events:auto;cursor:move}',
    '[data-mymmo-greep]:hover{outline:1px dashed rgba(37,99,235,.6);outline-offset:4px}',
    '[data-mymmo-greep].mf-sleept{outline:1px solid #2563eb;outline-offset:4px}',
    /* Vier grepen om te schalen. Met er een zou die na een verplaatsing naar
       links of naar boven buiten beeld kunnen vallen. */
    '.mf-greep{position:absolute;width:14px;height:14px;background:#fff;',
    'border:2px solid #2563eb;border-radius:3px;opacity:0;transition:opacity .12s;z-index:5}',
    '.mf-greep--nw{left:-7px;top:-7px;cursor:nwse-resize}',
    '.mf-greep--ne{right:-7px;top:-7px;cursor:nesw-resize}',
    '.mf-greep--sw{left:-7px;bottom:-7px;cursor:nesw-resize}',
    '.mf-greep--se{right:-7px;bottom:-7px;cursor:nwse-resize}',
    '[data-mymmo-greep]:hover .mf-greep,[data-mymmo-greep].mf-sleept .mf-greep{opacity:1}',
    /* Het dankjewelscherm in plaats van de inhoud van elk paneel. */
    'html.mf-toon-dank .mymmo-modal-paneel > *:not(.mymmo-modal-paneel-titel):not(.mymmo-dank){display:none!important}',
    'html.mf-toon-dank .mymmo-dank[hidden]{display:flex!important}',
    'html.mf-toon-dank .mymmo-dank [data-mf-leeg]:empty{display:block!important;min-width:10em}',
    '[data-mf-kies]{cursor:pointer}',
    '[data-mf-kies]:hover{outline:1px dashed rgba(37,99,235,.6);outline-offset:4px}',
    /* Een melding in het agendapaneel: de echte kalender laden we hier niet. */
    '.mf-agenda-noot{margin:0;padding:22px;color:#64748b;font-size:13px}',
    /* Onder 640px is het venster op een echte telefoon een VOL scherm. De
       opvulling van het canvas zou er hier 40px afhalen, en dan toont het
       voorbeeld iets smallers dan wat een bezoeker krijgt -- precies het soort
       verschil waarvoor je het voorbeeld hebt. */
    '@media (max-width:640px){body{padding:0}',
    '.mymmo-modal-launch{margin:16px 16px 12px}',
    '.mf-uitleg{padding:0 16px}}'
  ].join('');

  // ── Hulpjes ───────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function zetStatus(tekst, fout) {
    if (!statusEl) return;
    statusEl.textContent = tekst || '';
    statusEl.classList.toggle('is-fout', !!fout);
  }

  /**
   * Een waarde in een invoerveld zetten alsof iemand het typte.
   *
   * De input- en change-gebeurtenissen zijn nodig: mymmo-forms-admin.js hangt
   * daaraan en bouwt de shortcode opnieuw. Zonder dat staat het voorbeeld
   * bijgewerkt en de shortcode niet -- het ergst mogelijke resultaat van een
   * voorbeeld.
   */
  function schrijf(id, tekst) {
    var e = el(id);
    if (!e || e.value === tekst) return;
    e.value = tekst;
    vanCanvas = true;
    try {
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      vanCanvas = false;
    }
  }

  /**
   * De opvulling meteen toepassen, zonder opnieuw te renderen.
   *
   * Ze is niets anders dan twee CSS-variabelen, dus een ronde langs de server
   * zou hier alleen vertraging zijn -- en bij een schuifje dat je met de
   * pijltjes bedient, flikkert het scherm dan bij elke stap. Zelfde regel als
   * bij tekst: hertekenen alleen wanneer de STRUCTUUR verandert.
   */
  function pasOpvullingToe(doc, atts) {
    // BEIDE: de wikkel van het venster en die van het formulier.
    // .mymmo-form-wrap declareert deze variabelen zelf, en een eigen declaratie
    // wint van een geërfde -- op de wikkel van het venster alleen zou de
    // tussenruimte de velden dus nooit bereiken. Server-side gebeurt hetzelfde
    // (zie 'extra_style' in modal.php).
    var dragers = [];
    var venster = doc.querySelector('.mymmo-modal-launch');
    var formulier = doc.querySelector('.mymmo-form-wrap');
    if (venster) dragers.push(venster);
    if (formulier) dragers.push(formulier);
    if (!dragers.length) return;

    // Alles wat niets anders is dan een CSS-variabele kan hier meteen gezet
    // worden. Een ronde langs de server zou alleen vertraging zijn, en bij een
    // schuifje dat je met de pijltjes bedient flikkert het scherm dan bij elke
    // stap.
    var VARIABELEN = [
      ['gap', '--mf-gap'],
      ['image_scale', '--mf-fig-scale'],
      ['image_x', '--mf-fig-x'],
      ['image_y', '--mf-fig-y'],
      ['image_calendly_scale', '--mf-fig2-scale'],
      ['image_calendly_x', '--mf-fig2-x'],
      ['image_calendly_y', '--mf-fig2-y'],
      ['watermark_scale', '--mf-wm-scale'],
      ['watermark_x', '--mf-wm-x'],
      ['watermark_y', '--mf-wm-y'],
      ['watermark_rotate', '--mf-wm-rotate']
    ];

    dragers.forEach(function (drager) {
      VARIABELEN.forEach(function (paar) {
        if (atts[paar[0]]) drager.style.setProperty(paar[1], atts[paar[0]]);
        else drager.style.removeProperty(paar[1]);
      });
    });

    // De hoogte verandert mee, dus het iframe ook.
    meetHoogte(doc);
  }

  /**
   * Het iframe zo hoog maken als zijn inhoud.
   *
   * Zonder dit staan er in het voorbeeld drie scrollbalken over elkaar: een van
   * het venster, een van het tabblad en een van de zijkolom. Op een pagina
   * hoort het venster te scrollen (het is dan ook maar 88% van het scherm hoog),
   * maar in een ONTWERPWEERGAVE wil je alles in één keer zien -- anders ontwerp
   * je door een kier.
   */
  function meetHoogte(doc) {
    var paneel = doc.querySelector('.mymmo-modal-panel');
    var lijf = doc.querySelector('[data-mymmo-modal-body]');

    if (paneel) {
      paneel.style.height = 'auto';
      paneel.style.maxHeight = 'none';
    }

    var zijkolom = doc.querySelector('.mymmo-modal-aside');
    if (zijkolom) zijkolom.style.overflowY = 'visible';

    // Met tabbladen liggen de panelen over elkaar (position:absolute) en heeft
    // de houder dus geen eigen hoogte: die moet van het zichtbare paneel komen.
    if (lijf) {
      var actief = doc.querySelector('.mymmo-modal-paneel.is-actief')
        || doc.querySelector('.mymmo-modal-paneel');
      if (actief && lijf.classList.contains('mymmo-modal-body--tabs')) {
        actief.style.overflowY = 'visible';
        lijf.style.height = actief.scrollHeight + 'px';
      }
    }

    if (frame) {
      frame.style.height = Math.max(240, doc.documentElement.scrollHeight) + 'px';
    }

    pasSchaalToe();
  }

  /**
   * Het voorbeeld verkleinen tot het in zijn kolom past.
   *
   * transform en geen width: zie BREEDTES. De houder krijgt de GESCHAALDE
   * hoogte, anders blijft er onder het voorbeeld een gat staan ter grootte van
   * het verschil.
   */
  function pasSchaalToe() {
    if (!frame || !stage) return;

    var welk = stage.getAttribute('data-mymmo-device') === 'mobiel' ? 'mobiel' : 'desktop';
    var breedte = BREEDTES[welk];
    var beschikbaar = stage.clientWidth - 32; /* de opvulling van het podium */

    // Nooit vergroten: een voorbeeld op 140% is even onbruikbaar als een
    // afgesneden voorbeeld.
    var schaal = Math.min(1, beschikbaar > 0 ? beschikbaar / breedte : 1);

    frame.style.width = breedte + 'px';
    frame.style.transform = schaal < 1 ? 'scale(' + schaal + ')' : '';

    var hoogte = parseFloat(frame.style.height) || frame.offsetHeight;
    stage.style.height = Math.round(hoogte * schaal) + 'px';

    if (schaalEl) {
      schaalEl.textContent = schaal < 0.995 ? Math.round(schaal * 100) + '%' : '';
    }
  }

  /** De punten uit het tekstvak, als lijst. */
  function punten() {
    var e = el('mymmoFormsPunten');
    if (!e) return [];
    return String(e.value || '').split(/\r?\n/).map(function (r) {
      return r.trim();
    }).filter(Boolean);
  }

  function zetPunten(lijst) {
    schrijf('mymmoFormsPunten', lijst.filter(Boolean).slice(0, 6).join('\n'));
  }

  /**
   * Waar het voorbeeld van MOET hertekenen.
   *
   * Bewust zonder de teksten: die worden ter plaatse bijgewerkt. Stond de
   * knoptekst hierin, dan hertekende het canvas bij elke toetsaanslag en sprong
   * de cursor telkens naar het begin.
   */
  function structuur(r) {
    var a = r.atts;
    return [
      r.soort,
      a.slug || '',
      a.lang || '',
      a.calendly ? '1' : '0',
      a.image || '',
      a.image_alt ? '1' : '0',
      a.accent || '',
      a.variant || '',
      a.button || '',
      a.tab || '',
      a.title === 'no' ? 'geen-kop' : 'kop',
      a.background || '',
      a.icon_color || '',
      a.accent_text || '',
      a.image_calendly || '',
      a.watermark || '',
      a.extra_steps || '',
      a.extra_slug || '',
      a.tab_order || '',
      a.thanks_form_image || '',
      a.thanks_extra_image || '',
      a.thanks_calendly_image || '',
      punten().length
    ].join('');
  }

  // ── Renderen ──────────────────────────────────────────────────────────────

  function bouwDocument(html) {
    var css = (C.css || []).map(function (u) {
      return '<link rel="stylesheet" href="' + u + '">';
    }).join('');
    var js = (C.js || []).map(function (u) {
      return '<scr' + 'ipt src="' + u + '"></scr' + 'ipt>';
    }).join('');

    return '<!doctype html><html lang="nl"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<base target="_blank">'
      + css
      + '<style>' + CANVAS_CSS + '</style>'
      + '</head><body>' + html + js + '</body></html>';
  }

  function render() {
    if (!B || !frame) return;

    var r = B.attributen();
    if (!r.atts.slug) {
      zetStatus('Kies eerst een formulier.', false);
      return;
    }

    var body = new URLSearchParams();
    body.set('action', 'mymmo_forms_preview');
    body.set('nonce', C.nonce || '');
    body.set('soort', r.soort);
    Object.keys(r.atts).forEach(function (naam) {
      body.set(naam, r.atts[naam]);
    });

    zetStatus('Bezig met ophalen…', false);

    fetch(C.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    }).then(function (res) {
      return res.json();
    }).then(function (antwoord) {
      if (!antwoord || !antwoord.success) {
        var reden = antwoord && antwoord.data && antwoord.data.message;
        throw new Error(reden || 'Het voorbeeld kon niet opgehaald worden.');
      }
      frame.srcdoc = bouwDocument(antwoord.data.html);
      zetStatus('');
    }).catch(function (fout) {
      // Het oude voorbeeld laten staan is hier het minst erge: het is verouderd,
      // maar een leeg grijs vlak zegt niet eens dát er iets misging.
      zetStatus(fout.message + ' Het voorbeeld hierboven is van vóór je laatste wijziging.', true);
    });
  }

  /** Hertekenen, maar niet bij elke toetsaanslag. */
  function plan() {
    window.clearTimeout(wachtend);
    wachtend = window.setTimeout(render, 250);
  }

  /**
   * De laag van de tekening op het canvas zetten.
   *
   * Enkel een klasse omzetten, nooit hertekenen: hertekenen haalt het venster
   * opnieuw op, zet de cursor uit een tekst die je aan het bewerken was, en
   * laat het scherm springen. Zelfde regel als bij het typen.
   */
  function pasDankToe() {
    var doc = frame && frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.classList.toggle('mf-toon-dank', toonDank);
    meetHoogte(doc);
  }

  /**
   * Klik op het vinkje of de afbeelding van een dankjewelscherm: de
   * mediabibliotheek, via dezelfde knop als het veld eronder. Geen tweede
   * kiezer -- die zou net iets anders doen.
   */
  function maakDankBeeldKiesbaar(doc) {
    var VELDEN = {
      form: 'mymmoFormsThanksFormImage',
      extra: 'mymmoFormsThanksExtraImage',
      calendly: 'mymmoFormsThanksCalendlyImage'
    };
    Array.prototype.forEach.call(doc.querySelectorAll('[data-mymmo-dank-scherm]'), function (scherm) {
      var veld = VELDEN[scherm.getAttribute('data-mymmo-dank-scherm')];
      var beeld = scherm.querySelector('[data-mymmo-dank="beeld"]');
      var knop = veld ? document.querySelector('[data-mymmo-media="' + veld + '"]') : null;
      if (!beeld || !knop || knop.hidden) return;
      beeld.setAttribute('data-mf-kies', '1');
      beeld.setAttribute('title', 'Klik om een afbeelding te kiezen');
      beeld.addEventListener('click', function (e) {
        e.preventDefault();
        knop.click();
      });
    });
  }

  function pasFiguurLaagToe() {
    var doc = frame && frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.classList.toggle('mf-figuur-achter', figuurAchter);
  }

  // ── Na elke render: er een editor van maken ───────────────────────────────

  function naRender() {
    var doc = frame.contentDocument;
    if (!doc || !doc.body) return;

    var venster = doc.querySelector('[data-mymmo-modal]');
    // Bij een CALLOUT gaat het voorbeeld over wat er in de pagina staat. Het
    // venster hoort daar dicht te zijn -- dat ontwerp je bij de opstelling van
    // dat venster, niet hier -- en de knop van de callout opent het gewoon,
    // zodat je in het voorbeeld kan zien dat de stap meeverhuist.
    var callout = doc.querySelector('.mymmo-callout');

    if (venster && callout) {
      doc.documentElement.classList.add('mymmo-modal-js');

      var uitlegCallout = doc.createElement('p');
      uitlegCallout.className = 'mf-uitleg';
      uitlegCallout.textContent = 'Klik op de knop: het venster dat je bij die opstelling maakte '
        + 'gaat open, met deze vraag vooraan en al ingevuld.';
      callout.parentNode.insertBefore(uitlegCallout, callout.nextSibling);
    }

    if (venster && !callout) {
      // Openzetten en open HOUDEN. De sluitknop en de achtergrond blijven staan
      // -- ze horen bij het venster -- maar doen hier niets: sluiten zou het
      // canvas leeg achterlaten en de enige uitweg zou een herlaadknop zijn.
      venster.classList.add('is-open');
      doc.documentElement.classList.add('mymmo-modal-js');

      Array.prototype.forEach.call(doc.querySelectorAll('[data-mymmo-modal-close]'), function (knop) {
        knop.removeAttribute('data-mymmo-modal-close');
        knop.setAttribute('title', 'In het voorbeeld blijft het venster open staan.');
        knop.addEventListener('click', function (e) { e.preventDefault(); });
      });

      // De kalender van Calendly NIET ophalen in wp-admin: dat is een verzoek
      // naar een derde partij vanuit een beheerscherm, en wat je hier komt
      // controleren is de indeling, niet of Calendly het doet. Het vlak leegmaken
      // laat de terugvallink staan; daar zetten we uitleg bij.
      var agenda = doc.querySelector('[data-mymmo-calendly]');
      if (agenda) {
        agenda.setAttribute('data-mymmo-calendly', '');
        var noot = doc.createElement('p');
        noot.className = 'mf-agenda-noot';
        noot.textContent = 'Hier komt de kalender van Calendly te staan. Die wordt in dit '
          + 'voorbeeld niet opgehaald — op de pagina zelf vult ze dit hele vlak.';
        agenda.appendChild(noot);
      }

      var uitleg = doc.createElement('p');
      uitleg.className = 'mf-uitleg';
      uitleg.textContent = doc.querySelector('.mymmo-modal-button')
        ? 'Dit venster gaat open zodra iemand op de knop hierboven klikt.'
        : 'Dit venster gaat open vanuit een knop die al op je pagina staat.';
      venster.parentNode.insertBefore(uitleg, venster);
    }

    // Niets in het voorbeeld mag echt verstuurd worden.
    doc.addEventListener('submit', function (e) {
      e.preventDefault();
      zetStatus('Dit is een voorbeeld — er wordt niets verstuurd.', false);
    }, true);

    maakTekstenBewerkbaar(doc);
    maakStapTekstBewerkbaar(doc);
    maakPuntenBewerkbaar(doc);
    maakSleepbaar(doc);
    maakDankBeeldKiesbaar(doc);
    pasFiguurLaagToe();
    pasDankToe();

    // Van tabblad wisselen verandert de hoogte; opnieuw meten na de wissel.
    doc.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.mymmo-modal-tab')) {
        window.setTimeout(function () { meetHoogte(doc); }, 0);
      }
    });

    if (B) pasOpvullingToe(doc, B.attributen().atts);
    meetHoogte(doc);

    // Een afbeelding die pas later binnenkomt, maakt de zijkolom hoger.
    Array.prototype.forEach.call(doc.images, function (img) {
      if (!img.complete) img.addEventListener('load', function () { meetHoogte(doc); });
    });
  }

  /**
   * De twee schuifjes in de werkbalk en de twee tekstvelden eronder gelijk
   * houden. Het tekstveld is de opslag (daar staat de eenheid in); het schuifje
   * is de snelle weg voor pixels.
   */
  function koppelOpvulling() {
    [
      ['mymmoCanvasGap', 'mymmoFormsGap', '18']
    ].forEach(function (paar) {
      var schuif = el(paar[0]);
      var veld = el(paar[1]);
      if (!schuif || !veld) return;

      var uitVeld = function () {
        var m = String(veld.value || '').match(/^(\d+(?:\.\d+)?)px$/i);
        schuif.value = m ? m[1] : '';
        schuif.placeholder = paar[2];
      };
      uitVeld();

      schuif.addEventListener('input', function () {
        veld.value = schuif.value === '' ? '' : (parseFloat(schuif.value) || 0) + 'px';
        vanCanvas = true;
        try {
          veld.dispatchEvent(new Event('input', { bubbles: true }));
        } finally {
          vanCanvas = false;
        }
        var doc = frame && frame.contentDocument;
        if (doc && B) pasOpvullingToe(doc, B.attributen().atts);
      });

      // Typt iemand in het tekstveld een waarde met een andere eenheid, dan
      // leegt het schuifje: pixels kan het wel, 1.5rem niet.
      veld.addEventListener('input', function () {
        if (!vanCanvas) {
          uitVeld();
          var doc = frame && frame.contentDocument;
          if (doc && B) pasOpvullingToe(doc, B.attributen().atts);
        }
      });
    });
  }

  function maakTekstenBewerkbaar(doc) {
    TEKSTEN.forEach(function (regel) {
      var node = doc.querySelector(regel.sel);

      // Een regeltje uitleg dat leeg is, bestaat niet in de HTML -- dan valt er
      // ook niets aan te klikken. Er hier een lege meezetten is de enige manier
      // om het te kunnen invullen zonder een apart invoerveld.
      if (!node && regel.leeg) {
        node = maakLegeSub(doc, regel.sel);
      }
      if (!node) return;

      node.setAttribute('data-mf-edit', regel.veld);
      if (regel.leeg) node.setAttribute('data-mf-leeg', regel.leeg);
      node.setAttribute('contenteditable', 'true');
      node.setAttribute('spellcheck', 'false');

      node.addEventListener('input', function () {
        schrijf(regel.veld, node.textContent.trim());
      });

      // Enter zou hier een nieuwe regel of een <div> maken; dit zijn allemaal
      // velden van één regel.
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          node.blur();
        }
      });

      // Plakken als PLATTE tekst: anders komt de opmaak van Word of van een
      // webpagina mee het venster in, en die belandt vervolgens in de shortcode.
      node.addEventListener('paste', function (e) {
        e.preventDefault();
        var tekst = (e.clipboardData || window.clipboardData).getData('text');
        doc.execCommand('insertText', false, String(tekst || '').replace(/\s+/g, ' '));
      });
    });
  }

  /**
   * De teksten van een STAP bewerkbaar maken.
   *
   * WAAROM DIT ANDERS WERKT DAN TEKSTEN HIERBOVEN
   * ---------------------------------------------
   * Alles in TEKSTEN is een attribuut van de shortcode: je typt het hier, het
   * belandt in de code die je straks in een pagina plakt, en het geldt voor DEZE
   * plaatsing. Een stap werkt niet zo. Die staat één keer in wp-admin en kan in
   * meerdere formulieren gebruikt worden -- de copy hoort dus bij de stap, en
   * gaat mee naar elk formulier waar hij in staat.
   *
   * Vandaar dat dit rechtstreeks naar de server gaat en meteen bewaard wordt,
   * niet in een invoerveld hiernaast. Server-side komt het NIET in de HTML van
   * de stap terecht maar in een aparte lijst `origineel => nieuw`; laad je het
   * bestand later opnieuw in, dan grijpt je copy gewoon weer. Zie
   * class-steps.php.
   *
   * WAT BEWERKBAAR IS
   * -----------------
   * De titel en de regel eronder (die staan op het stap-record), en elk
   * BLAD-element in de stap dat één tekst bevat: een <p>, een <span>, een
   * <label>. Een element met kinderen wordt overgeslagen -- daar zou je bij het
   * typen de opmaak eromheen kapotmaken.
   *
   * Getallen blijven met rust. Een `8` of een `60+` is meestal een waarde die de
   * stap zelf bijwerkt (de teller naast een schuifbalk), en die overschrijven
   * levert een zin op die bij de volgende beweging weer weg is. Vandaar de eis
   * van minstens één letter.
   */
  function maakStapTekstBewerkbaar(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('.mymmo-stap--html'), function (stap) {
      var naam = stap.getAttribute('data-mymmo-stap-naam') || '';
      if (!naam) return;

      // De kop en de regel eronder: die staan op het stap-record zelf.
      Array.prototype.forEach.call(stap.querySelectorAll('[data-mymmo-kop]'), function (node) {
        maakBewerkbaar(doc, node, naam, node.getAttribute('data-mymmo-kop'));
      });

      var inhoud = stap.querySelector('[data-mymmo-stap-inhoud]');
      if (!inhoud) return;

      Array.prototype.forEach.call(inhoud.querySelectorAll('*'), function (node) {
        if (node.children.length) return;
        if (/^(script|style|input|textarea|select|img|svg|br|hr)$/i.test(node.tagName)) return;

        var tekst = (node.textContent || '').trim();
        if (tekst.length < 2 || !/[a-zA-ZÀ-ɏ]/.test(tekst)) return;

        maakBewerkbaar(doc, node, naam, 'tekst');
      });
    });
  }

  /**
   * Eén element bewerkbaar maken en de wijziging bewaren.
   *
   * `origineel` wordt bij het FOCUSSEN vastgelegd, niet bij het laden: staat er
   * al een eerdere aanpassing, dan is wat je nu ziet de waarde van die
   * aanpassing, en de server herkent dat en werkt dezelfde regel bij in plaats
   * van er een tweede naast te zetten die nooit meer grijpt.
   */
  function maakBewerkbaar(doc, node, stap, wat) {
    if (node.getAttribute('data-mf-stap-edit') === '1') return;
    node.setAttribute('data-mf-stap-edit', '1');
    node.setAttribute('data-mf-edit', wat);
    node.setAttribute('contenteditable', 'true');
    node.setAttribute('spellcheck', 'false');
    node.setAttribute('title', 'Deze tekst hoort bij de stap en geldt overal waar de stap gebruikt wordt.');

    var origineel = '';

    node.addEventListener('focus', function () {
      origineel = (node.textContent || '').trim();
    });

    // Bij blur en niet bij elke toetsaanslag: dit is een ronde langs de server
    // die iets BEWAART. Per letter opslaan zou tientallen schrijfacties op
    // dezelfde option geven voor één zin.
    node.addEventListener('blur', function () {
      var nieuw = (node.textContent || '').trim();
      if (nieuw === origineel) return;
      bewaarStapTekst(stap, wat, origineel, nieuw);
      origineel = nieuw;
    });

    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        node.blur();
      }
    });

    node.addEventListener('paste', function (e) {
      e.preventDefault();
      var tekst = (e.clipboardData || window.clipboardData).getData('text');
      doc.execCommand('insertText', false, String(tekst || '').replace(/\s+/g, ' '));
    });
  }

  function bewaarStapTekst(stap, wat, origineel, nieuw) {
    if (!C.ajaxUrl) return;

    var body = new URLSearchParams();
    body.set('action', 'mymmo_forms_step_tekst');
    body.set('nonce', C.nonce || '');
    body.set('stap', stap);
    body.set('wat', wat);
    body.set('origineel', origineel);
    body.set('nieuw', nieuw);

    zetStatus('Bezig met bewaren…', false);

    fetch(C.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    }).then(function (res) {
      return res.json();
    }).then(function (antwoord) {
      if (!antwoord || !antwoord.success) {
        throw new Error((antwoord && antwoord.data && antwoord.data.bericht) || 'Niet bewaard.');
      }
      // Expliciet zeggen dat dit verder reikt dan dit scherm: je hebt zonet een
      // stap gewijzigd die in meer formulieren kan staan.
      zetStatus('Bewaard bij de stap — geldt overal waar deze stap gebruikt wordt.', false);
    }).catch(function (fout) {
      // Hard falen en niet stil: wat op het scherm staat is nu iets anders dan
      // wat er bewaard is, en dat merk je pas als je de pagina herlaadt.
      zetStatus('Niet bewaard: ' + fout.message + ' Herlaad de pagina en probeer opnieuw.', true);
    });
  }

  /**
   * Welke invoervelden bij welk beeld horen.
   *
   * De sleutel is het data-mymmo-beeld-attribuut uit modal.php; het tabblad
   * "form" en "calendly" hebben elk hun eigen stand, het watermerk ook.
   */
  var BEELDVELDEN = {
    form: { x: 'mymmoFormsImageX', y: 'mymmoFormsImageY', scale: 'mymmoFormsImageScale' },
    calendly: { x: 'mymmoFormsImageCalX', y: 'mymmoFormsImageCalY', scale: 'mymmoFormsImageCalScale' },
    watermerk: { x: 'mymmoFormsWmX', y: 'mymmoFormsWmY', scale: 'mymmoFormsWmScale' }
  };

  function getalVan(id, standaard) {
    var e = el(id);
    if (!e) return standaard;
    var waarde = parseFloat(e.value);
    return isNaN(waarde) ? standaard : waarde;
  }

  /**
   * De beelden vastpakbaar maken.
   *
   * Slepen verplaatst; de greep in de hoek schaalt. Allebei schrijven ze in de
   * invoervelden -- die blijven de opslag, zodat de shortcode en wat je ziet
   * niet uit elkaar kunnen lopen.
   */
  function maakSleepbaar(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-mymmo-greep]'), function (beeld) {
      var soort = beeld.getAttribute('data-mymmo-greep');
      var velden = BEELDVELDEN[soort];
      if (!velden || beeld.getAttribute('data-mf-sleepbaar') === '1') return;
      beeld.setAttribute('data-mf-sleepbaar', '1');

      // Een greep in elke hoek. De twee getallen zeggen welke kant "groter"
      // is: naar buiten toe, weg van het midden.
      var grepen = [];
      [['nw', -1], ['ne', 1], ['sw', -1], ['se', 1]].forEach(function (hoek) {
        var greep = doc.createElement('span');
        greep.className = 'mf-greep mf-greep--' + hoek[0];
        greep.title = 'Slepen om te schalen';
        greep.setAttribute('data-mf-richting', String(hoek[1]));
        beeld.appendChild(greep);
        grepen.push(greep);
      });

      var bezig = null;

      var begin = function (event, wat, richting) {
        // Alleen de linkermuisknop; rechts hoort het contextmenu te geven.
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        bezig = {
          wat: wat,
          richting: richting || 1,
          startX: event.clientX,
          startY: event.clientY,
          x: getalVan(velden.x, 0),
          y: getalVan(velden.y, 0),
          schaal: getalVan(velden.scale, 100),
          breedte: beeld.offsetWidth || 200
        };
        beeld.classList.add('mf-sleept');
        try { beeld.setPointerCapture(event.pointerId); } catch (_) { /* oudere browser */ }
      };

      var beweeg = function (event) {
        if (!bezig) return;
        event.preventDefault();

        var dx = event.clientX - bezig.startX;
        var dy = event.clientY - bezig.startY;

        if (bezig.wat === 'verplaats') {
          schrijf(velden.x, String(Math.round(bezig.x + dx)));
          schrijf(velden.y, String(Math.round(bezig.y + dy)));
          return;
        }

        // Schalen: de horizontale beweging afgezet tegen de breedte van het
        // beeld. Zo voelt een sleep van 50px bij een klein beeld even sterk als
        // bij een groot -- met een vaste stap per pixel schiet een klein beeld
        // meteen door. De richting hangt van de hoek af: aan de linkerkant is
        // naar links naar buiten, en dus groter.
        var nieuw = bezig.schaal * (1 + (dx * bezig.richting * 2) / bezig.breedte);
        schrijf(velden.scale, String(Math.round(Math.min(400, Math.max(10, nieuw)))));
      };

      var einde = function (event) {
        if (!bezig) return;
        bezig = null;
        beeld.classList.remove('mf-sleept');
        try { beeld.releasePointerCapture(event.pointerId); } catch (_) { /* idem */ }
      };

      beeld.addEventListener('pointerdown', function (e) {
        if (grepen.indexOf(e.target) !== -1) return;
        begin(e, 'verplaats');
      });

      grepen.forEach(function (greep) {
        greep.addEventListener('pointerdown', function (e) {
          begin(e, 'schaal', parseInt(greep.getAttribute('data-mf-richting'), 10) || 1);
        });
      });
      beeld.addEventListener('pointermove', beweeg);
      beeld.addEventListener('pointerup', einde);
      beeld.addEventListener('pointercancel', einde);

      // Met het toetsenbord: pijltjes verplaatsen per pixel, met Shift per tien.
      beeld.setAttribute('tabindex', '0');
      beeld.addEventListener('keydown', function (e) {
        var stap = e.shiftKey ? 10 : 1;
        var dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -stap;
        else if (e.key === 'ArrowRight') dx = stap;
        else if (e.key === 'ArrowUp') dy = -stap;
        else if (e.key === 'ArrowDown') dy = stap;
        else return;
        e.preventDefault();
        if (dx) schrijf(velden.x, String(getalVan(velden.x, 0) + dx));
        if (dy) schrijf(velden.y, String(getalVan(velden.y, 0) + dy));
      });
    });
  }

  /** Een leeg regeltje-uitleg naast het opschrift van een tabblad zetten. */
  function maakLegeSub(doc, sel) {
    var tabSel = sel.split(' ')[0];
    var tab = doc.querySelector(tabSel);
    if (!tab) return null;
    var houder = tab.querySelector('.mymmo-modal-tab-tekst');
    if (!houder) return null;

    var span = doc.createElement('span');
    span.className = 'mymmo-modal-tab-sub';
    houder.appendChild(span);
    return span;
  }

  function maakPuntenBewerkbaar(doc) {
    var lijst = doc.querySelectorAll('.mymmo-modal-punt');

    Array.prototype.forEach.call(lijst, function (punt, i) {
      var tekst = punt.querySelector('span');
      if (tekst) {
        tekst.setAttribute('data-mf-edit', 'punt-' + i);
        tekst.setAttribute('contenteditable', 'true');
        tekst.setAttribute('spellcheck', 'false');
        tekst.addEventListener('input', function () {
          var alles = punten();
          alles[i] = tekst.textContent.trim();
          // NIET via zetPunten(): dat haalt lege regels weg, en wie een punt
          // helemaal leegmaakt om iets anders te typen zou dan halverwege zijn
          // punt kwijtspelen. Opruimen gebeurt bij het hertekenen.
          schrijf('mymmoFormsPunten', alles.join('\n'));
        });
        tekst.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); tekst.blur(); }
        });
      }

      var weg = doc.createElement('button');
      weg.type = 'button';
      weg.className = 'mf-knop mf-punt-weg';
      weg.textContent = '×';
      weg.title = 'Deze regel weghalen';
      weg.addEventListener('click', function () {
        var alles = punten();
        alles.splice(i, 1);
        zetPunten(alles);
        render();
      });
      punt.appendChild(weg);
    });

    // De "erbij"-knop moet er ook staan als er NUL punten zijn -- anders is een
    // opsomming die je één keer helemaal leeghaalt, nooit meer terug te krijgen
    // zonder het tekstvak eronder.
    var aside = doc.querySelector('.mymmo-modal-aside');
    if (!aside || punten().length >= 6) return;

    var erbij = doc.createElement('button');
    erbij.type = 'button';
    erbij.className = 'mf-knop mf-punt-erbij';
    erbij.textContent = '+ geruststelling';
    erbij.addEventListener('click', function () {
      var alles = punten();
      alles.push('Nieuwe regel');
      zetPunten(alles);
      render();
    });

    var punten_lijst = aside.querySelector('.mymmo-modal-punten');
    var figuur = aside.querySelector('.mymmo-modal-figuur');
    if (punten_lijst) {
      punten_lijst.parentNode.insertBefore(erbij, punten_lijst.nextSibling);
    } else if (figuur) {
      aside.insertBefore(erbij, figuur);
    } else {
      aside.appendChild(erbij);
    }
  }

  // ── De afbeelding: mediabibliotheek in plaats van een URL overtypen ───────

  /**
   * De mediabibliotheek voor elk veld met data-mymmo-media.
   *
   * Eén afhandeling voor alle drie de afbeeldingen. Bij drie losse kopieën van
   * dit blok zou de derde vroeg of laat net iets anders doen dan de eerste.
   */
  function mediaKiezer() {
    // Alleen tonen als wp.media er echt is; een knop die niets doet is erger
    // dan geen knop.
    if (!window.wp || !window.wp.media) return;

    Array.prototype.forEach.call(document.querySelectorAll('[data-mymmo-media]'), function (knop) {
      var veldId = knop.getAttribute('data-mymmo-media');
      if (!el(veldId)) return;
      knop.hidden = false;

      var kiezer = null;
      knop.addEventListener('click', function () {
        if (!kiezer) {
          kiezer = window.wp.media({
            title: 'Afbeelding kiezen',
            button: { text: 'Gebruik deze' },
            library: { type: 'image' },
            multiple: false
          });
          kiezer.on('select', function () {
            var keuze = kiezer.state().get('selection').first().toJSON();
            schrijf(veldId, keuze.url || '');
            // De beschrijving overnemen als het veld ernaast bestaat en leeg is.
            var altId = veldId + 'Alt';
            if (keuze.alt && el(altId) && !el(altId).value) schrijf(altId, keuze.alt);
          });
        }
        kiezer.open();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-mymmo-media-wis]'), function (knop) {
      var veldId = knop.getAttribute('data-mymmo-media-wis');
      if (!el(veldId)) return;
      knop.hidden = false;
      knop.addEventListener('click', function () {
        schrijf(veldId, '');
        if (el(veldId + 'Alt')) schrijf(veldId + 'Alt', '');
      });
    });
  }

  // ── Opstarten ─────────────────────────────────────────────────────────────

  function start() {
    canvas = el('mymmoFormsCanvas');
    frame = el('mymmoFormsPreviewFrame');
    B = window.MymmoFormsBouwer;

    // Geen canvas op deze pagina, of mymmo-forms-admin.js is niet geladen: dan
    // blijven de velden staan zoals ze waren. Nooit half overnemen.
    if (!canvas || !frame || !B || !C.ajaxUrl) return;

    stage = canvas.querySelector('[data-mymmo-stage]');
    statusEl = canvas.querySelector('[data-mymmo-canvas-status]');
    schaalEl = canvas.querySelector('[data-mymmo-schaal]');
    canvas.hidden = false;

    // Vanaf hier is het canvas de plek waar deze teksten getypt worden. De
    // velden blijven in de DOM staan (ze zijn de opslag), ze gaan enkel uit het
    // zicht.
    Array.prototype.forEach.call(document.querySelectorAll('[data-mymmo-canvas="1"]'), function (rij) {
      rij.setAttribute('data-mymmo-canvas-overgenomen', '1');
    });

    frame.addEventListener('load', naRender);

    canvas.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-mymmo-device]');
      if (!knop || !stage) return;
      var welk = knop.getAttribute('data-mymmo-device');
      stage.setAttribute('data-mymmo-device', welk);
      Array.prototype.forEach.call(canvas.querySelectorAll('[data-mymmo-device]'), function (k) {
        var actief = k === knop;
        k.classList.toggle('is-actief', actief);
        k.setAttribute('aria-pressed', actief ? 'true' : 'false');
      });

      // Van weergave wisselen verandert de inwendige breedte en dus de schaal,
      // en daarna pas de hoogte: eerst schalen, dan opnieuw meten.
      pasSchaalToe();
      var doc = frame && frame.contentDocument;
      if (doc) meetHoogte(doc);
    });

    // De tekening naar voren of naar achteren. Geen hertekening: enkel een
    // klasse in het canvas.
    canvas.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-mymmo-figuur-laag]');
      if (!knop) return;
      figuurAchter = !figuurAchter;
      knop.classList.toggle('is-actief', figuurAchter);
      knop.setAttribute('aria-pressed', figuurAchter ? 'true' : 'false');
      knop.textContent = figuurAchter ? 'Tekening vooraan' : 'Tekening achteraan';
      knop.title = figuurAchter
        ? 'De tekening staat nu zoals een bezoeker ze ziet. Zet ze vooraan om ze te kunnen verplaatsen.'
        : 'De tekening staat vooraan zodat je ze kan vastpakken. Zet ze achteraan om te zien wat een bezoeker ziet.';
      pasFiguurLaagToe();
    });

    // Het dankjewelscherm tonen of weer het formulier. Geen hertekening.
    canvas.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-mymmo-dank-toon]');
      if (!knop) return;
      toonDank = !toonDank;
      knop.classList.toggle('is-actief', toonDank);
      knop.setAttribute('aria-pressed', toonDank ? 'true' : 'false');
      knop.textContent = toonDank ? 'Formulier tonen' : 'Dankjewelscherm';
      pasDankToe();
    });

    // Het beheerscherm kan van breedte veranderen: een venster dat versleept
    // wordt, of het inklappen van het WordPress-menu.
    window.addEventListener('resize', pasSchaalToe);

    // Elke wijziging in de velden: alleen hertekenen als de STRUCTUUR wijzigde.
    // Een tekstwijziging vanuit het canvas heeft het voorbeeld al bij.
    document.addEventListener('input', bekijkWijziging);
    document.addEventListener('change', bekijkWijziging);

    mediaKiezer();
    koppelOpvulling();

    laatsteStructuur = structuur(B.attributen());
    render();
  }

  function bekijkWijziging() {
    if (!B) return;

    var resultaat = B.attributen();

    // ELKE wijziging past eerst de variabelen toe. Schaal, verschuiving,
    // opvulling en tussenruimte zijn niets dan CSS-variabelen; die horen
    // meteen te bewegen, zonder ronde langs de server.
    //
    // Dit stond alleen in de afhandeling van de opvullingsschuifjes. Gevolg:
    // aan de schaal of de nudge van een tekening draaien deed zichtbaar niets
    // -- de shortcode veranderde wel, het voorbeeld niet. En je kan niets
    // precies positioneren wat je niet ziet bewegen.
    var doc = frame && frame.contentDocument;
    if (doc && doc.body) pasOpvullingToe(doc, resultaat.atts);

    var nu = structuur(resultaat);
    if (nu === laatsteStructuur) return;
    laatsteStructuur = nu;
    if (vanCanvas) {
      // Structurele wijziging die uit het canvas zelf komt (een punt erbij of
      // weg): die roept render() al zelf aan op het juiste moment.
      return;
    }
    plan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
