/**
 * Koppelingen — tabblad "Formulier": de formulierbouwer.
 *
 * OPZET: een canvas met het echte formulier links, een inspecteur rechts.
 * Je klikt op een veld in het voorbeeld en typt erin; alles wat je niet kan
 * typen (veldtype, veldnaam, verplicht, breedte, keuzes, Odoo-type) staat in
 * de inspecteur van het geselecteerde veld. Selecteer je niets, dan toont de
 * inspecteur de instellingen van het formulier zelf plus de stijl.
 *
 * DE EERSTE VERSIE VAN DIT BESTAND WAS EEN LIJST MET RUWE VELDEN naast elkaar.
 * Dat was precies de fout die CLAUDE.md al beschrijft voor de maileditor van
 * event-operations-v2 ("Je bewerkt IN het voorbeeld, niet in een blokkenlijst
 * ernaast... Voer geen tweede bewerkscherm in naast dit ene"). Voer die lijst
 * niet opnieuw in.
 *
 * VIER REGELS DIE JE NIET MAG OMDRAAIEN:
 *
 * 1. TYPEN HERTEKENT NIET. Tekst wijzigen werkt de toestand bij en verandert
 *    hoogstens één tekstknoop; het canvas wordt alleen opnieuw opgebouwd bij
 *    STRUCTURELE wijzigingen (veld erbij, weg, verplaatst, ander type, keuze
 *    erbij/weg, breedte, verplicht). Hertekenen tijdens het typen gooit de
 *    cursor weg -- zelfde les als bij de maileditor.
 *
 * 2. HET CANVAS LEEFT IN EEN IFRAME met public/mymmo-forms.css -- dezelfde
 *    stylesheet die de WordPress-plugin gebruikt. Zonder iframe lekken Tailwind
 *    en daisyUI van het beheerscherm erdoorheen en is het voorbeeld een leugen.
 *    De bewerklaag (omlijning, sleepgreep) zit OOK in het iframe, zodat ze
 *    vanzelf meebeweegt met de layout.
 *
 * 3. DE VELDSLEUTEL ligt vast zodra het formulier een inzending heeft. De
 *    server dwingt dat af; de inspecteur zet het veld op slot met de reden.
 *
 * 4. HET IFRAME SCROLLT NIET ZELF. Het groeit mee met de inhoud en de
 *    ouderpagina scrollt, anders staat alles na een scroll op de verkeerde plek.
 *
 * Alle HTML via ES6 template literals (moduleregel); acties via data-attributen
 * op de centrale listener in -bootstrap.js (REGEL 3).
 */

(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };

  // window.FSV2.S is de state als OBJECT, niet als functie.
  function S() { return window.FSV2.S; }

  var B = {
    integrationId: null,
    form: null,        // null = deze koppeling heeft nog geen formulier
    fields: [],
    lockedKeys: [],
    meta: null,
    sel: null,         // index van het geselecteerde veld, of null
    taal: 'nl',        // de taal die je NU bewerkt (niet noodzakelijk de standaardtaal)
  };

  var TALEN = [
    { code: 'nl', naam: 'Nederlands', kort: 'NL' },
    { code: 'fr', naam: 'Frans',      kort: 'FR' },
    { code: 'en', naam: 'Engels',     kort: 'EN' }
  ];

  var LEEG_FORMULIER = {
    name: '',
    slug: '',
    description: '',
    status: 'draft',
    submit_label: 'Versturen',
    success_mode: 'message',
    success_message: 'Bedankt, we hebben je bericht goed ontvangen.',
    redirect_url: '',
    theme: {},
    allowed_sites: [],
    languages: ['nl'],
    default_language: 'nl',
    i18n: {},
  };

  // Stalen voor de accentkleur. Een vrije kleurkiezer geeft onleesbare
  // combinaties; deze zijn gekozen op contrast met witte knoptekst.
  var KLEUREN = [
    { waarde: '#2563eb', naam: 'Blauw' },
    { waarde: '#0f766e', naam: 'Petrol' },
    { waarde: '#15803d', naam: 'Groen' },
    { waarde: '#b45309', naam: 'Oker' },
    { waarde: '#b91c1c', naam: 'Rood' },
    { waarde: '#7e22ce', naam: 'Paars' },
    { waarde: '#1f2937', naam: 'Antraciet' }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // LADEN
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadMeta() {
    if (B.meta) return B.meta;
    var res = await window.FSV2.api('/forms/meta');
    B.meta = res.data;
    return B.meta;
  }

  async function renderDetailForm() {
    var host = document.getElementById('detailFormBuilder');
    if (!host) return;

    var integrationId = S().activeId;
    host.innerHTML = '<span class="loading loading-spinner loading-sm"></span>';

    try {
      await loadMeta();
      var res = await window.FSV2.api('/integrations/' + integrationId + '/form');

      B.integrationId = integrationId;
      B.sel = null;

      if (res.data) {
        B.form = Object.assign({}, LEEG_FORMULIER, res.data.form);
        if (!Array.isArray(B.form.languages) || !B.form.languages.length) B.form.languages = [B.form.default_language || 'nl'];
        if (!B.form.i18n || typeof B.form.i18n !== 'object') B.form.i18n = {};
        B.fields = (res.data.fields || []).map(normalizeVeld);
        B.lockedKeys = res.data.locked_keys || [];
        // Bij het openen altijd in de standaardtaal beginnen: dat is de taal
        // waarin het formulier bestaat, de andere zijn vertalingen ervan.
        B.taal = B.form.default_language || 'nl';
      } else {
        B.form = null;
        B.fields = [];
        B.lockedKeys = [];
      }
    } catch (err) {
      host.innerHTML = '<div class="alert alert-error text-sm">' + esc(err.message) + '</div>';
      return;
    }

    tekenAlles();
  }

  function normalizeVeld(rij) {
    return {
      field_key: rij.field_key || '',
      field_type: rij.field_type || 'text',
      label: rij.label || '',
      help_text: rij.help_text || '',
      placeholder: rij.placeholder || '',
      is_required: !!rij.is_required,
      default_value: rij.default_value || '',
      options: Array.isArray(rij.options) ? rij.options.map(function (o) {
        return { value: o.value || '', label: o.label || '' };
      }) : [],
      width: rij.width || 'full',
      validation: rij.validation || {},
      odoo_field_type: rij.odoo_field_type || 'text',
      i18n: (rij.i18n && typeof rij.i18n === 'object') ? rij.i18n : {}
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAAL
  //
  // Eén formulier, meerdere talen. De VELDNAAM en de OPTIEWAARDEN vertalen
  // nooit: die zijn de linkerkant van een mapping naar Odoo. Vertaal je die
  // wel, dan heb je per taal een aparte koppeling nodig, en dan onderhoud je
  // alles dubbel. Alleen wat een bezoeker LEEST verschilt per taal.
  //
  // De bouwer werkt met PROJECTIE: het formulier wordt eerst omgezet naar de
  // taal die je bewerkt, en dan door dezelfde tekenfunctie gehaald als altijd.
  // Zo hoeft de voorbeeldrenderer niets van talen te weten en blijft hij
  // vormgelijk aan field.php -- de pariteitstest bewaakt precies dat.
  // ═══════════════════════════════════════════════════════════════════════════

  function standaardTaal() {
    return (B.form && B.form.default_language) || 'nl';
  }

  function bewerktStandaardtaal() {
    return B.taal === standaardTaal();
  }

  function taalNaam(code) {
    for (var i = 0; i < TALEN.length; i += 1) if (TALEN[i].code === code) return TALEN[i].naam;
    return code;
  }

  /** Een tekst van een veld in de taal die NU bewerkt wordt. */
  function leesVeld(veld, sleutel) {
    if (bewerktStandaardtaal()) return veld[sleutel] || '';
    var vertaling = (veld.i18n || {})[B.taal] || {};
    return vertaling[sleutel] || '';
  }

  function schrijfVeld(veld, sleutel, waarde) {
    if (bewerktStandaardtaal()) {
      veld[sleutel] = waarde;
      return;
    }
    veld.i18n = veld.i18n || {};
    veld.i18n[B.taal] = veld.i18n[B.taal] || {};
    veld.i18n[B.taal][sleutel] = waarde;
  }

  function leesForm(sleutel) {
    if (bewerktStandaardtaal()) return B.form[sleutel] || '';
    var vertaling = (B.form.i18n || {})[B.taal] || {};
    return vertaling[sleutel] || '';
  }

  function schrijfForm(sleutel, waarde) {
    if (bewerktStandaardtaal()) {
      B.form[sleutel] = waarde;
      return;
    }
    B.form.i18n = B.form.i18n || {};
    B.form.i18n[B.taal] = B.form.i18n[B.taal] || {};
    B.form.i18n[B.taal][sleutel] = waarde;
  }

  function leesOptieLabel(veld, index) {
    var optie = veld.options[index];
    if (!optie) return '';
    if (bewerktStandaardtaal()) return optie.label || '';
    var opties = ((veld.i18n || {})[B.taal] || {}).options || {};
    return opties[optie.value] || '';
  }

  function schrijfOptieLabel(veld, index, waarde) {
    var optie = veld.options[index];
    if (!optie) return;
    if (bewerktStandaardtaal()) {
      optie.label = waarde;
      return;
    }
    // Op de WAARDE en niet op de index: opties herschikken in het Nederlands
    // mag de Franse labels niet door elkaar gooien.
    veld.i18n = veld.i18n || {};
    veld.i18n[B.taal] = veld.i18n[B.taal] || {};
    veld.i18n[B.taal].options = veld.i18n[B.taal].options || {};
    veld.i18n[B.taal].options[optie.value] = waarde;
  }

  /**
   * Het formulier zoals het er in de bewerkte taal uitziet.
   *
   * De `_leeg*`-sleutels zijn de plaatsaanduiding voor lege tekst. In een
   * vertaling is dat de ORIGINELE tekst: dan zie je grijs staan wat je moet
   * vertalen, in plaats van het woord "Label".
   */
  function projecteerForm() {
    if (bewerktStandaardtaal()) return B.form;

    return Object.assign({}, B.form, {
      name: leesForm('name'),
      description: leesForm('description'),
      submit_label: leesForm('submit_label'),
      _leegName: B.form.name || 'Naam van het formulier',
      _leegDescription: B.form.description || 'Introtekst (optioneel)',
      _leegSubmit: B.form.submit_label || 'Versturen'
    });
  }

  function projecteerVelden() {
    if (bewerktStandaardtaal()) return B.fields;

    return B.fields.map(function (veld) {
      return Object.assign({}, veld, {
        label: leesVeld(veld, 'label'),
        help_text: leesVeld(veld, 'help_text'),
        placeholder: leesVeld(veld, 'placeholder'),
        options: veld.options.map(function (optie, i) {
          return { value: optie.value, label: leesOptieLabel(veld, i) };
        }),
        _leegLabel: veld.label || 'Label',
        _leegHelp: veld.help_text || 'Hulptekst (optioneel)',
        _leegOptions: veld.options.map(function (o) { return o.label || o.value; })
      });
    });
  }

  /**
   * Wat er in deze taal nog ontbreekt. Alleen wat een bezoeker MOET lezen --
   * een hulptekst mag ontbreken. Dezelfde regel als validateFormDefinition()
   * in schema.js, die publiceren tegenhoudt zolang dit niet leeg is.
   */
  function ontbrekendeVertalingen(code) {
    if (!B.form || code === standaardTaal()) return [];

    var vertaling = (B.form.i18n || {})[code] || {};
    var mist = [];
    if (!(vertaling.name || '').trim()) mist.push('naam');
    if (!(vertaling.submit_label || '').trim()) mist.push('knoptekst');
    if (!(vertaling.success_message || '').trim()) mist.push('bedanktekst');

    var velden = 0;
    B.fields.forEach(function (veld) {
      if (veld.field_type === 'hidden') return;
      var v = (veld.i18n || {})[code] || {};
      if (!(v.label || '').trim()) velden += 1;
    });
    if (velden) mist.push(velden + (velden === 1 ? ' label' : ' labels'));

    return mist;
  }

  function specVoor(type) {
    var lijst = (B.meta && B.meta.field_types) || [];
    for (var i = 0; i < lijst.length; i += 1) {
      if (lijst[i].type === type) return lijst[i];
    }
    return { type: type, label: type, input: true, options: false, multi: false, odoo_type: 'text' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHIL
  // ═══════════════════════════════════════════════════════════════════════════

  function tekenAlles() {
    var host = document.getElementById('detailFormBuilder');
    if (!host) return;

    if (!B.form) {
      host.innerHTML = renderLeegScherm();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: host });
      return;
    }

    host.innerHTML = `
      ${renderKopbalk()}
      <div class="flex flex-col lg:flex-row gap-5 items-start">
        <div class="flex-1 min-w-0 w-full">
          <div class="bg-base-200/30 border border-base-200 rounded-box overflow-hidden">
            <iframe id="fbCanvas" title="Voorbeeld van het formulier"
                    class="w-full block border-0" style="height:320px;"></iframe>
          </div>
          ${renderPalet()}
        </div>
        <aside class="w-full lg:w-80 shrink-0" id="fbInspector"></aside>
      </div>`;

    tekenCanvas();
    tekenInspector();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: host });
  }

  function renderLeegScherm() {
    return `
      <div class="text-center py-10">
        <i data-lucide="clipboard-list" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
        <h3 class="text-base font-semibold mb-1">Nog geen formulier</h3>
        <p class="text-sm text-base-content/60 max-w-lg mx-auto mb-1">
          Bouw hier het formulier zelf. De veldnamen die je kiest zijn meteen de namen
          die je in het tabblad Koppeling ziet — geen <code>text-1</code> of
          <code>select-3</code> meer.
        </p>
        <p class="text-xs text-base-content/50 max-w-lg mx-auto mb-5">
          Het formulier werkt op elke site waar de Mymmo Forms-plugin staat, en de
          bestaande Forminator-webhook van deze koppeling blijft gewoon werken.
        </p>
        <button class="btn btn-sm btn-primary gap-1" data-action="form-builder-create">
          <i data-lucide="plus" class="w-4 h-4"></i> Formulier maken
        </button>
      </div>`;
  }

  /**
   * De taalbalk. Staat er alleen als het formulier meer dan één taal heeft --
   * bij één taal zou het een tabblad zijn waar niets naast staat.
   */
  function renderTaalbalk() {
    var talen = B.form.languages || [];
    if (talen.length < 2) return '';

    var standaard = standaardTaal();

    return `
      <div class="flex flex-wrap items-center gap-1.5 mb-3 pb-3 border-b border-base-200">
        <span class="text-xs text-base-content/50 mr-1">Taal</span>
        ${talen.map(function (code) {
          var actief = code === B.taal;
          var mist = ontbrekendeVertalingen(code);
          return `<button class="btn btn-xs gap-1 ${actief ? 'btn-primary' : 'btn-ghost'}"
                          data-action="form-builder-lang" data-lang="${esc(code)}"
                          title="${esc(taalNaam(code))}${mist.length ? ' — nog aan te vullen: ' + mist.join(', ') : ''}">
                    ${esc(code.toUpperCase())}
                    ${code === standaard ? '<span class="opacity-60 font-normal">basis</span>' : ''}
                    ${mist.length ? `<span class="badge badge-warning badge-xs">${mist.length}</span>` : ''}
                  </button>`;
        }).join('')}
        ${bewerktStandaardtaal() ? '' : `
          <span class="text-xs text-base-content/50 ml-1">
            Je bewerkt de ${esc(taalNaam(B.taal).toLowerCase())}e vertaling. Veldnamen en keuzewaarden blijven ongewijzigd.
          </span>`}
      </div>`;
  }

  function renderKopbalk() {
    var gepubliceerd = B.form.status === 'published';

    return renderTaalbalk() + `
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <span class="badge ${gepubliceerd ? 'badge-success' : 'badge-ghost'} badge-sm">
          ${gepubliceerd ? 'Gepubliceerd' : 'Concept'}
        </span>
        ${B.form.version ? `<span class="text-xs text-base-content/50">Versie ${esc(B.form.version)}</span>` : ''}
        <div class="flex-1"></div>
        <button class="btn btn-sm btn-primary gap-1" data-action="form-builder-save">
          <i data-lucide="save" class="w-4 h-4"></i> Opslaan
        </button>
        ${gepubliceerd
          ? `<button class="btn btn-sm btn-outline gap-1" data-action="form-builder-unpublish">
               <i data-lucide="eye-off" class="w-4 h-4"></i> Naar concept
             </button>`
          : `<button class="btn btn-sm btn-success gap-1" data-action="form-builder-publish">
               <i data-lucide="globe" class="w-4 h-4"></i> Publiceren
             </button>`}
        <button class="btn btn-sm btn-ghost text-error px-2" data-action="form-builder-delete"
                title="Formulier verwijderen">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>`;
  }

  /** Het palet staat ONDER het canvas: daar eindigt het formulier, en daar wil je het volgende veld. */
  function renderPalet() {
    return `
      <div class="mt-3">
        <p class="text-xs text-base-content/50 mb-1.5">Veld toevoegen</p>
        <div class="flex flex-wrap gap-1.5">
          ${((B.meta && B.meta.field_types) || []).map(function (spec) {
            return `<button class="btn btn-xs btn-outline gap-1" data-action="form-builder-add-field"
                            data-type="${esc(spec.type)}">
                      <i data-lucide="plus" class="w-3 h-3"></i> ${esc(spec.label)}
                    </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANVAS
  // ═══════════════════════════════════════════════════════════════════════════

  function themaStijl() {
    var t = B.form.theme || {};
    var regels = [];
    if (t.accent) regels.push('--mf-accent:' + t.accent);
    if (t.radius) regels.push('--mf-radius:' + t.radius);
    if (t.max_width) regels.push('--mf-max-width:' + t.max_width);
    return regels.length ? '.mymmo-form-wrap{' + regels.join(';') + '}' : '';
  }

  /**
   * Het canvas volledig opnieuw opbouwen. ALLEEN bij structurele wijzigingen —
   * zie regel 1 bovenaan dit bestand.
   */
  function tekenCanvas() {
    var frame = document.getElementById('fbCanvas');
    if (!frame) return;

    // lang op het document: de spellingcontrole van de browser in het canvas
    // volgt die, en dat scheelt een scherm vol rode kringels bij het vertalen.
    var html = '<!doctype html><html lang="' + esc(B.taal) + '"><head><meta charset="utf-8">' +
      '<link rel="stylesheet" href="/mymmo-forms.css">' +
      '<link rel="stylesheet" href="/form-builder-canvas.css">' +
      '<style>' + themaStijl() + '</style>' +
      '</head><body>' +
      window.FSV2.renderFormPreview(projecteerForm(), projecteerVelden(), { editable: true }) +
      '</body></html>';

    frame.onload = function () {
      bindCanvas();
      markeerSelectie();
      pasHoogteAan();
      // De stylesheets laden asynchroon; pas daarna klopt de hoogte echt.
      setTimeout(pasHoogteAan, 120);
      setTimeout(pasHoogteAan, 400);
    };
    frame.srcdoc = html;
  }

  function canvasDoc() {
    var frame = document.getElementById('fbCanvas');
    return frame && frame.contentDocument ? frame.contentDocument : null;
  }

  function pasHoogteAan() {
    var frame = document.getElementById('fbCanvas');
    var doc = canvasDoc();
    if (!frame || !doc || !doc.body) return;
    frame.style.height = Math.max(220, doc.body.scrollHeight + 8) + 'px';
  }

  function bindCanvas() {
    var doc = canvasDoc();
    if (!doc) return;

    // ── Selecteren ───────────────────────────────────────────────────────────
    doc.addEventListener('mousedown', function (event) {
      var veld = event.target.closest('[data-om-field]');
      selecteer(veld ? Number(veld.dataset.omField) : null);
    });

    // ── Tekst bewerken ───────────────────────────────────────────────────────
    // Op input en niet op blur: zo loopt de inspecteur mee terwijl je typt. Er
    // wordt NIETS hertekend — alleen de toestand en hoogstens één veld rechts.
    doc.addEventListener('input', function (event) {
      var el = event.target.closest('[data-om-edit]');
      if (!el) return;
      neemTekstOver(el);
      pasHoogteAan();
    });

    // Enter in een label maakt anders een tweede regel binnen hetzelfde veld;
    // dat is bij een label of een knoptekst nooit de bedoeling.
    doc.addEventListener('keydown', function (event) {
      var bewerkbaar = event.target.closest('[data-om-edit]');
      if (event.key !== 'Enter' || !bewerkbaar) return;
      var isAlinea = !!event.target.closest('.mymmo-form-paragraph');
      if (!isAlinea) {
        event.preventDefault();
        bewerkbaar.blur();
      }
    });

    // Plakken als platte tekst: anders komt de opmaak van Word of een webpagina
    // mee de labels in.
    doc.addEventListener('paste', function (event) {
      var el = event.target.closest('[data-om-edit]');
      if (!el) return;
      event.preventDefault();
      var klembord = event.clipboardData || doc.defaultView.clipboardData;
      var tekst = klembord ? klembord.getData('text/plain') : '';
      doc.execCommand('insertText', false, String(tekst).replace(/\s+/g, ' '));
    });

    bindSlepen(doc);
  }

  /**
   * De getypte tekst overnemen in de toestand.
   *
   * textContent en niet innerHTML: in een label hoort geen opmaak, en zo kan er
   * ook geen HTML uit een plakactie in de definitie belanden.
   */
  function neemTekstOver(el) {
    var sleutel = el.dataset.omEdit;
    var waarde = el.textContent.replace(/ /g, ' ').trim();

    if (sleutel.indexOf('form:') === 0) {
      var formVeld = sleutel.slice('form:'.length);
      schrijfForm(formVeld, waarde);
      werkInspecteurBij('[data-fb-form="' + formVeld + '"]', waarde);
      return;
    }

    var kaart = el.closest('[data-om-field]');
    if (!kaart) return;
    var index = Number(kaart.dataset.omField);
    var veld = B.fields[index];
    if (!veld) return;

    if (sleutel.indexOf('option:') === 0) {
      var oIndex = Number(sleutel.slice('option:'.length));
      if (veld.options[oIndex]) {
        schrijfOptieLabel(veld, oIndex, waarde);
        // De waarde VOLGT het label tot je hem zelf aanpast. Alleen bij de
        // eerste toetsaanslag afleiden gaf "j" voor "Ja" -- zelfde valkuil als
        // bij de veldnaam.
        //
        // In een VERTALING gebeurt dat niet: de waarde is de sleutel die naar
        // Odoo gaat en die hoort in alle talen dezelfde te zijn. Zou "Oui" hier
        // de waarde "oui" maken, dan kwam er uit het Franse formulier iets
        // binnen dat geen enkele mapping kent.
        if (bewerktStandaardtaal() && veld.options[oIndex]._autoValue !== false) {
          veld.options[oIndex].value = slugAchtig(waarde);
        }
        if (index === B.sel) {
          werkInspecteurBij('[data-fb-option="' + oIndex + '"] [data-fb-option-field="label"]', waarde);
          werkInspecteurBij('[data-fb-option="' + oIndex + '"] [data-fb-option-field="value"]', veld.options[oIndex].value);
        }
      }
      return;
    }

    schrijfVeld(veld, sleutel, waarde);

    // De veldnaam VOLGT het label zolang je hem niet zelf aangepast hebt.
    // Alleen bij de eerste toetsaanslag afleiden zou "T" opleveren voor "Type
    // gebouw"; pas op blur zou je hem tijdens het typen niet zien meegroeien.
    //
    // Uitsluitend in de standaardtaal: een Frans label mag de veldnaam niet
    // veranderen, want die staat in de veldkoppelingen van deze koppeling.
    if (bewerktStandaardtaal() && sleutel === 'label' && veld._autoKey !== false && B.lockedKeys.indexOf(veld.field_key) === -1) {
      veld.field_key = veldnaamUitLabel(waarde, index);
      if (index === B.sel) werkInspecteurBij('[data-fb-field="field_key"]', veld.field_key);
    }
    if (index === B.sel) werkInspecteurBij('[data-fb-field="' + sleutel + '"]', waarde);
  }

  function werkInspecteurBij(selector, waarde) {
    var el = document.querySelector('#fbInspector ' + selector);
    if (el && el !== document.activeElement) el.value = waarde;
  }

  function slugAchtig(waarde) {
    return String(waarde || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 40);
  }

  /**
   * Wat iemand in het veldnaam-vak typt omzetten naar een geldige veldnaam.
   *
   * TERWIJL JE TYPT, niet pas bij het opslaan. Zonder dit accepteert het vak
   * "Waar kunnen we je mee helpen?" zonder morren en krijg je bij het opslaan
   * een foutmelding over een veld dat je allang uit het oog verloren bent.
   *
   * De regel "moet met een letter beginnen" wordt hier NIET afgedwongen: dan
   * zou "2" tijdens het typen meteen "veld_2" worden en springt de cursor.
   * Die guard staat in beveiligVeldnaam(), vlak voor het opslaan.
   */
  function normaliseerVeldnaamInvoer(waarde) {
    return String(waarde || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Onderstrepen blijven staan waar ze staan, ook aan het einde: anders kan
      // je "voor_naam" niet typen zonder dat het streepje telkens wegvalt.
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+/, '')
      .slice(0, 60);
  }

  /** De laatste guard vlak voor het opslaan: beginnen met een letter. */
  function beveiligVeldnaam(waarde) {
    var v = normaliseerVeldnaamInvoer(waarde).replace(/_+$/, '');
    if (!v) return '';
    return /^[a-z]/.test(v) ? v : 'veld_' + v;
  }

  function veldnaamUitLabel(label, eigenIndex) {
    var basis = slugAchtig(label);
    if (!basis) return '';
    if (!/^[a-z]/.test(basis)) basis = 'veld_' + basis;

    // Botsingen vermijden: twee velden met dezelfde naam weigert de server.
    // Het veld zelf telt niet mee, anders botst het met zijn eigen vorige naam.
    var bestaand = {};
    B.fields.forEach(function (v, i) {
      if (v.field_key && i !== eigenIndex) bestaand[v.field_key] = true;
    });
    if (!bestaand[basis]) return basis;
    for (var n = 2; n < 50; n += 1) {
      if (!bestaand[basis + '_' + n]) return basis + '_' + n;
    }
    return basis + '_' + Date.now();
  }

  /** Eén tekstknoop in het canvas bijwerken, zonder te hertekenen. */
  function werkCanvasTekstBij(index, sleutel, waarde) {
    var doc = canvasDoc();
    if (!doc) return;

    var wortel = index === null
      ? doc.querySelector('.mymmo-form-wrap')
      : doc.querySelector('[data-om-field="' + index + '"]');
    if (!wortel) return;

    var el = wortel.querySelector('[data-om-edit="' + sleutel + '"]');
    if (!el || el === doc.activeElement) return;  // nooit overschrijven waar de cursor staat

    var leegEl = el.querySelector('.om-leeg');
    var leegTekst = leegEl ? leegEl.textContent : '';

    if (String(waarde).trim() === '' && leegTekst) {
      el.innerHTML = '<span class="om-leeg">' + esc(leegTekst) + '</span>';
    } else {
      el.textContent = waarde;
    }
    pasHoogteAan();
  }

  function markeerSelectie() {
    var doc = canvasDoc();
    if (!doc) return;
    doc.querySelectorAll('[data-om-field]').forEach(function (el) {
      el.classList.toggle('om-geselecteerd', Number(el.dataset.omField) === B.sel);
    });
  }

  function selecteer(index) {
    if (B.sel === index) return;
    B.sel = index;
    markeerSelectie();
    tekenInspector();
  }

  // ── Slepen ────────────────────────────────────────────────────────────────

  function bindSlepen(doc) {
    var sleepIndex = null;

    // draggable staat NIET vast in de HTML: contenteditable binnen een
    // draggable element maakt tekstselectie stroef. Pas als je de greep
    // vastpakt wordt het veld sleepbaar.
    doc.addEventListener('mousedown', function (event) {
      var greep = event.target.closest('.om-greep');
      var kaart = event.target.closest('[data-om-field]');
      if (greep && kaart) kaart.draggable = true;
    });

    doc.addEventListener('mouseup', function () {
      doc.querySelectorAll('[data-om-field]').forEach(function (el) { el.draggable = false; });
    });

    doc.addEventListener('dragstart', function (event) {
      var kaart = event.target.closest('[data-om-field]');
      if (!kaart) return;
      sleepIndex = Number(kaart.dataset.omField);
      kaart.classList.add('om-sleept');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        // Firefox start geen sleepactie zonder data.
        try { event.dataTransfer.setData('text/plain', String(sleepIndex)); } catch (_) {}
      }
    });

    doc.addEventListener('dragover', function (event) {
      if (sleepIndex === null) return;
      event.preventDefault();
      wisMarkeringen(doc);
      var kaart = event.target.closest('[data-om-field]');
      if (!kaart) return;
      var rect = kaart.getBoundingClientRect();
      var onderhelft = (event.clientY - rect.top) > rect.height / 2;
      kaart.classList.add(onderhelft ? 'om-drop-na' : 'om-drop-voor');
    });

    doc.addEventListener('drop', function (event) {
      if (sleepIndex === null) return;
      event.preventDefault();
      var kaart = event.target.closest('[data-om-field]');
      if (kaart) {
        var doel = Number(kaart.dataset.omField);
        var rect = kaart.getBoundingClientRect();
        var onderhelft = (event.clientY - rect.top) > rect.height / 2;
        verplaats(sleepIndex, onderhelft ? doel + 1 : doel);
      }
      wisMarkeringen(doc);
      sleepIndex = null;
    });

    doc.addEventListener('dragend', function () {
      wisMarkeringen(doc);
      doc.querySelectorAll('[data-om-field]').forEach(function (el) {
        el.classList.remove('om-sleept');
        el.draggable = false;
      });
      sleepIndex = null;
    });
  }

  function wisMarkeringen(doc) {
    doc.querySelectorAll('.om-drop-voor, .om-drop-na').forEach(function (el) {
      el.classList.remove('om-drop-voor', 'om-drop-na');
    });
  }

  function verplaats(van, naar) {
    if (van === naar || van + 1 === naar) return;
    var veld = B.fields.splice(van, 1)[0];
    B.fields.splice(van < naar ? naar - 1 : naar, 0, veld);
    B.sel = B.fields.indexOf(veld);
    tekenCanvas();
    tekenInspector();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSPECTEUR
  // ═══════════════════════════════════════════════════════════════════════════

  function tekenInspector() {
    var host = document.getElementById('fbInspector');
    if (!host) return;

    host.innerHTML = (B.sel !== null && B.fields[B.sel])
      ? renderVeldPaneel(B.fields[B.sel], B.sel)
      : renderFormulierPaneel();

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: host });
    markeerSelectie();
  }

  function paneelKop(titel, extra) {
    return `
      <div class="flex items-center gap-1 mb-3">
        <h4 class="text-sm font-semibold flex-1">${esc(titel)}</h4>
        ${extra || ''}
      </div>`;
  }

  function renderVeldPaneel(veld, index) {
    var spec = specVoor(veld.field_type);
    // In een vertaling ligt de veldnaam VAST. Hij is de linkerkant van een
    // mapping naar Odoo en hoort in alle talen dezelfde te zijn; hem hier
    // kunnen wijzigen zou betekenen dat het Franse formulier onder een andere
    // sleutel binnenkomt dan het Nederlandse.
    var opSlot = B.lockedKeys.indexOf(veld.field_key) !== -1 || !bewerktStandaardtaal();
    var opSlotDoorTaal = !bewerktStandaardtaal();

    return `
      <div class="bg-base-100 border border-base-200 rounded-box p-4 lg:sticky lg:top-4">
        ${paneelKop(spec.label, `
          <button class="btn btn-ghost btn-xs px-1" data-action="form-builder-duplicate"
                  data-index="${index}" title="Dupliceren">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn btn-ghost btn-xs px-1 text-error" data-action="form-builder-remove-field"
                  data-index="${index}" title="Verwijderen">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn btn-ghost btn-xs px-1" data-action="form-builder-deselect" title="Sluiten">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>`)}

        <label class="form-control mb-2">
          <span class="label label-text text-xs">Soort veld</span>
          <select class="select select-bordered select-sm" data-fb-change="type">
            ${((B.meta && B.meta.field_types) || []).map(function (s) {
              return `<option value="${esc(s.type)}" ${s.type === veld.field_type ? 'selected' : ''}>${esc(s.label)}</option>`;
            }).join('')}
          </select>
        </label>

        ${spec.input ? `
          <label class="form-control mb-2">
            <span class="label label-text text-xs">
              Veldnaam <span class="text-base-content/50">— zo heet het in de koppeling</span>
            </span>
            <input type="text" class="input input-bordered input-sm font-mono text-xs ${opSlot ? 'input-disabled' : ''}"
                   data-fb-field="field_key" value="${esc(veld.field_key)}"
                   placeholder="veldnaam" ${opSlot ? 'disabled' : ''}>
          </label>
          ${opSlot ? '' : `
            <p class="text-xs text-base-content/50 -mt-1 mb-2">
              ${veld._autoKey === false
                ? 'Loopt niet meer mee met het label. Maak het vak leeg om dat weer aan te zetten.'
                : 'Volgt het label. Typ hier iets om zelf een naam te kiezen.'}
            </p>`}
          ${opSlotDoorTaal ? `
            <p class="text-xs text-base-content/50 -mt-1 mb-2 flex items-start gap-1">
              <i data-lucide="lock" class="w-3 h-3 mt-0.5 shrink-0"></i>
              <span>De veldnaam is voor alle talen dezelfde — dat is precies waarom
              één koppeling volstaat. Aanpassen doe je in het ${esc(taalNaam(standaardTaal()).toLowerCase())}.</span>
            </p>`
          : opSlot ? `
            <p class="text-xs text-warning -mt-1 mb-2 flex items-start gap-1">
              <i data-lucide="lock" class="w-3 h-3 mt-0.5 shrink-0"></i>
              <span>Dit veld heeft al inzendingen. De naam staat in de veldkoppelingen en in
              bewaarde payloads — hernoemen zou een stap stil laten leeglopen.</span>
            </p>` : ''}

          ${veld.field_type === 'hidden' ? `
            ${bewerktStandaardtaal() ? `
              <label class="form-control mb-2">
                <span class="label label-text text-xs">Vaste waarde</span>
                <input type="text" class="input input-bordered input-sm" data-fb-field="default_value"
                       value="${esc(veld.default_value)}" placeholder="bijv. website">
              </label>` : ''}`
          : `
            <label class="form-control mb-2">
              <span class="label label-text text-xs">Placeholder</span>
              <input type="text" class="input input-bordered input-sm" data-fb-field="placeholder"
                     value="${esc(leesVeld(veld, 'placeholder'))}"
                     placeholder="${esc(bewerktStandaardtaal() ? 'Grijze voorbeeldtekst' : (veld.placeholder || 'Grijze voorbeeldtekst'))}">
            </label>`}

          <div class="grid grid-cols-2 gap-2 mb-2" ${bewerktStandaardtaal() ? '' : 'hidden'}>
            <label class="form-control">
              <span class="label label-text text-xs">Breedte</span>
              <select class="select select-bordered select-sm" data-fb-change="width">
                <option value="full" ${veld.width === 'full' ? 'selected' : ''}>Volle breedte</option>
                <option value="half" ${veld.width === 'half' ? 'selected' : ''}>Halve breedte</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label label-text text-xs" title="Hoe de waarde naar Odoo geschreven wordt">Odoo-type</span>
              <select class="select select-bordered select-sm" data-fb-field="odoo_field_type">
                ${((B.meta && B.meta.odoo_field_types) || []).map(function (t) {
                  return `<option value="${esc(t)}" ${t === veld.odoo_field_type ? 'selected' : ''}>${esc(t)}</option>`;
                }).join('')}
              </select>
            </label>
          </div>

          <label class="flex items-center gap-2 text-sm cursor-pointer w-fit" ${bewerktStandaardtaal() ? '' : 'hidden'}>
            <input type="checkbox" class="checkbox checkbox-sm" data-fb-change="required"
                   ${veld.is_required ? 'checked' : ''}>
            Verplicht in te vullen
          </label>
        ` : `
          <p class="text-xs text-base-content/50">
            Dit is opmaak, geen invoerveld. Het levert niets aan de koppeling — typ de
            tekst rechtstreeks in het voorbeeld.
          </p>`}

        ${spec.options ? renderOpties(veld, index) : ''}
      </div>`;
  }

  function renderOpties(veld, index) {
    return `
      <div class="mt-3 pt-3 border-t border-base-200">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-semibold flex-1">Keuzes</span>
          ${bewerktStandaardtaal() ? `
            <button class="btn btn-xs btn-ghost gap-1" data-action="form-builder-add-option" data-index="${index}">
              <i data-lucide="plus" class="w-3 h-3"></i> Keuze
            </button>` : ''}
        </div>
        <p class="text-xs text-base-content/50 mb-2">
          ${bewerktStandaardtaal()
            ? 'Links wat naar Odoo gaat, rechts wat de bezoeker leest — dat laatste kan je ook in het voorbeeld typen.'
            : 'Links de waarde die naar Odoo gaat: die is in elke taal dezelfde. Alleen rechts vertaal je.'}
        </p>
        <div class="flex flex-col gap-1">
          ${veld.options.map(function (optie, oIndex) {
            return `
              <div class="flex items-center gap-1" data-fb-option="${oIndex}">
                <input type="text" class="input input-bordered input-xs w-24 font-mono ${bewerktStandaardtaal() ? '' : 'input-disabled'}"
                       data-fb-option-field="value" value="${esc(optie.value)}" placeholder="waarde"
                       ${bewerktStandaardtaal() ? '' : 'disabled'}>
                <input type="text" class="input input-bordered input-xs flex-1"
                       data-fb-option-field="label" value="${esc(leesOptieLabel(veld, oIndex))}"
                       placeholder="${esc(bewerktStandaardtaal() ? 'label' : (optie.label || 'label'))}">
                ${bewerktStandaardtaal() ? `
                  <button class="btn btn-ghost btn-xs px-1 text-error" data-action="form-builder-remove-option"
                          data-index="${index}" data-option="${oIndex}" title="Verwijderen">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>` : ''}
              </div>`;
          }).join('') || '<p class="text-xs text-base-content/40">Nog geen keuzes.</p>'}
        </div>
      </div>`;
  }

  /**
   * Welke talen dit formulier heeft.
   *
   * De standaardtaal kan niet uitgezet worden -- dat is de taal waarin het
   * formulier bestaat; de rest zijn vertalingen ervan. Een taal uitzetten laat
   * de al ingetypte vertaling staan (ze wordt bij het opslaan opgeschoond,
   * niet hier): iemand die per ongeluk klikt, verliest zo geen half uur werk
   * zolang hij niet opslaat.
   */
  function renderTalenBlok() {
    var talen = B.form.languages || [];
    var standaard = standaardTaal();

    return `
      <div class="pt-3 mt-3 border-t border-base-200">
        <span class="text-xs font-semibold">Talen</span>
        <p class="text-xs text-base-content/50 mb-2">
          Eén formulier, meerdere talen. De veldnamen en de keuzewaarden blijven overal
          hetzelfde, dus je houdt één koppeling en één set veldkoppelingen naar Odoo.
        </p>
        <div class="flex flex-col gap-1">
          ${TALEN.map(function (taal) {
            var aan = talen.indexOf(taal.code) !== -1;
            var isStandaard = taal.code === standaard;
            var mist = aan && !isStandaard ? ontbrekendeVertalingen(taal.code) : [];
            return `
              <label class="flex items-center gap-2 text-sm ${isStandaard ? 'opacity-70' : 'cursor-pointer'}">
                <input type="checkbox" class="checkbox checkbox-sm" data-fb-change="language"
                       data-lang="${esc(taal.code)}" ${aan ? 'checked' : ''} ${isStandaard ? 'disabled' : ''}>
                <span class="flex-1">${esc(taal.naam)}</span>
                ${isStandaard ? '<span class="badge badge-ghost badge-xs">basistaal</span>' : ''}
                ${mist.length ? `<span class="badge badge-warning badge-xs" title="${esc(mist.join(', '))}">${mist.length} te doen</span>` : ''}
              </label>`;
          }).join('')}
        </div>
        ${talen.length > 1 ? `
          <p class="text-xs text-base-content/50 mt-2">
            Publiceren lukt pas als elke taal volledig is. Een half vertaald formulier valt
            stil terug op het ${esc(taalNaam(standaard).toLowerCase())} — zonder foutmelding,
            en dus zonder dat iemand het merkt.
          </p>` : ''}
      </div>`;
  }

  function renderFormulierPaneel() {
    var isRedirect = B.form.success_mode === 'redirect';
    var thema = B.form.theme || {};

    return `
      <div class="bg-base-100 border border-base-200 rounded-box p-4 lg:sticky lg:top-4">
        ${paneelKop('Formulier')}
        <p class="text-xs text-base-content/50 mb-3">
          Klik een veld in het voorbeeld aan om het aan te passen.
        </p>

        <label class="form-control mb-2">
          <span class="label label-text text-xs">Naam</span>
          <input type="text" class="input input-bordered input-sm" data-fb-form="name"
                 value="${esc(leesForm('name'))}"
                 placeholder="${esc(bewerktStandaardtaal() ? 'Offerte aanvragen' : (B.form.name || 'Offerte aanvragen'))}">
        </label>

        ${bewerktStandaardtaal() ? `
          <label class="form-control mb-2">
            <span class="label label-text text-xs">
              Slug <span class="text-base-content/50">— staat in de shortcode</span>
            </span>
            <div class="join">
              <input type="text" class="input input-bordered input-sm join-item w-full font-mono text-xs"
                     data-fb-form="slug" value="${esc(B.form.slug)}" placeholder="offerte-aanvragen">
              <button class="btn btn-sm join-item" data-action="form-builder-slug-from-name" title="Uit de naam maken">
                <i data-lucide="wand-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </label>`
        : `
          <p class="text-xs text-base-content/50 mb-3 flex items-start gap-1">
            <i data-lucide="info" class="w-3 h-3 mt-0.5 shrink-0"></i>
            <span>De slug staat in de shortcode en is voor alle talen dezelfde. Wil je een
            andere taal op een pagina, dan zet je <code>lang="${esc(B.taal)}"</code> op de shortcode.</span>
          </p>`}

        <label class="form-control mb-2">
          <span class="label label-text text-xs">Na het verzenden</span>
          <select class="select select-bordered select-sm" data-fb-change="success-mode">
            <option value="message" ${!isRedirect ? 'selected' : ''}>Melding tonen</option>
            <option value="redirect" ${isRedirect ? 'selected' : ''}>Doorsturen</option>
          </select>
        </label>

        ${isRedirect ? `
          <label class="form-control mb-3">
            <span class="label label-text text-xs">Doorstuur-URL <span class="text-base-content/50">— https</span></span>
            <input type="url" class="input input-bordered input-sm" data-fb-form="redirect_url"
                   value="${esc(B.form.redirect_url)}" placeholder="https://openvme.be/bedankt/">
          </label>`
        : `
          <label class="form-control mb-3">
            <span class="label label-text text-xs">Bedanktekst</span>
            <textarea class="textarea textarea-bordered textarea-sm" rows="2"
                      data-fb-form="success_message"
                      placeholder="${esc(bewerktStandaardtaal() ? '' : (B.form.success_message || ''))}">${esc(leesForm('success_message'))}</textarea>
          </label>`}

        ${renderTalenBlok()}

        <div class="pt-3 border-t border-base-200">
          <span class="text-xs font-semibold">Stijl</span>
          <p class="text-xs text-base-content/50 mb-2">Geldt alleen voor dit formulier.</p>

          <span class="label label-text text-xs">Accentkleur</span>
          <div class="flex flex-wrap gap-1.5 mb-3" id="fbKleuren">
            ${KLEUREN.map(function (k) {
              var actief = String(thema.accent || '#2563eb').toLowerCase() === k.waarde.toLowerCase();
              return `<button type="button" title="${esc(k.naam)}"
                        class="w-6 h-6 rounded-full border-2 ${actief ? 'border-base-content' : 'border-base-300'}"
                        style="background:${esc(k.waarde)}"
                        data-action="form-builder-theme" data-key="accent" data-value="${esc(k.waarde)}"></button>`;
            }).join('')}
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="form-control">
              <span class="label label-text text-xs">Hoeken</span>
              <select class="select select-bordered select-sm" data-fb-change="theme" data-key="radius">
                ${[['0px', 'Recht'], ['4px', 'Licht'], ['10px', 'Rond'], ['999px', 'Pil']].map(function (r) {
                  return `<option value="${r[0]}" ${String(thema.radius || '10px') === r[0] ? 'selected' : ''}>${r[1]}</option>`;
                }).join('')}
              </select>
            </label>
            <label class="form-control">
              <span class="label label-text text-xs">Breedte</span>
              <select class="select select-bordered select-sm" data-fb-change="theme" data-key="max_width">
                ${[['520px', 'Smal'], ['720px', 'Normaal'], ['960px', 'Breed']].map(function (r) {
                  return `<option value="${r[0]}" ${String(thema.max_width || '720px') === r[0] ? 'selected' : ''}>${r[1]}</option>`;
                }).join('')}
              </select>
            </label>
          </div>
        </div>

        ${B.form.id ? `
          <div class="pt-3 mt-3 border-t border-base-200">
            <span class="text-xs font-semibold">Op de website</span>
            <div class="join w-full mt-1.5">
              <input id="fbShortcode" type="text" readonly
                     class="input input-bordered input-xs join-item w-full font-mono"
                     value="[mymmo_form slug=&quot;${esc(B.form.slug)}&quot;]">
              <button class="btn btn-xs join-item" data-action="form-builder-copy-shortcode" title="Kopiëren">
                <i data-lucide="copy" class="w-3 h-3"></i>
              </button>
            </div>
            <p class="text-xs text-base-content/50 mt-1">Werkt op elke site met de Mymmo Forms-plugin.</p>
          </div>` : ''}
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIES
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleFormBuilderAction(action, btn) {
    if (action === 'form-builder-lang') {
      var code = btn.dataset.lang;
      if (!code || code === B.taal) return;
      B.taal = code;
      // De selectie loslaten: het inspecteurspaneel ziet er per taal anders uit
      // (veldnaam op slot, geen breedte), en dat halverwege omwisselen terwijl
      // de cursor in een vak staat is verwarrend.
      B.sel = null;
      tekenAlles();
      return;
    }

    var index = btn.dataset.index !== undefined ? Number(btn.dataset.index) : null;

    if (action === 'form-builder-create') {
      B.form = Object.assign({}, LEEG_FORMULIER);
      B.fields = [];
      // De naam van de koppeling voorvullen: die heeft de gebruiker net getypt
      // in de dialoog, en hem opnieuw laten intypen is nodeloos werk.
      var kop = S().detail && S().detail.integration;
      if (kop && kop.name) B.form.name = kop.name;
      voegVeldToe('text', 'Naam');
      voegVeldToe('email', 'E-mailadres');
      B.sel = null;
      tekenAlles();
      return;
    }

    if (action === 'form-builder-add-field') {
      voegVeldToe(btn.dataset.type);
      B.sel = B.fields.length - 1;
      tekenCanvas();
      tekenInspector();
      return;
    }

    if (action === 'form-builder-duplicate') {
      var bron = B.fields[index];
      if (!bron) return;
      var kopie = normalizeVeld(JSON.parse(JSON.stringify(bron)));
      kopie.field_key = veldnaamUitLabel(bron.field_key || bron.label);
      B.fields.splice(index + 1, 0, kopie);
      B.sel = index + 1;
      tekenCanvas();
      tekenInspector();
      return;
    }

    if (action === 'form-builder-remove-field') {
      var teVerwijderen = B.fields[index];
      if (teVerwijderen && B.lockedKeys.indexOf(teVerwijderen.field_key) !== -1) {
        window.FSV2.showAlert(
          'Dit veld heeft al inzendingen en kan niet verwijderd worden. Zet het desnoods op "Verborgen veld".',
          'error'
        );
        return;
      }
      B.fields.splice(index, 1);
      B.sel = null;
      tekenCanvas();
      tekenInspector();
      return;
    }

    if (action === 'form-builder-deselect') {
      selecteer(null);
      return;
    }

    if (action === 'form-builder-add-option') {
      if (B.fields[index]) B.fields[index].options.push({ value: '', label: '' });
      tekenCanvas();
      tekenInspector();
      return;
    }

    if (action === 'form-builder-remove-option') {
      if (B.fields[index]) B.fields[index].options.splice(Number(btn.dataset.option), 1);
      tekenCanvas();
      tekenInspector();
      return;
    }

    if (action === 'form-builder-theme') {
      B.form.theme = Object.assign({}, B.form.theme);
      B.form.theme[btn.dataset.key] = btn.dataset.value;
      pasThemaToe();
      tekenInspector();
      return;
    }

    if (action === 'form-builder-slug-from-name') {
      // De slug door de SERVER laten maken, met dezelfde regels als de
      // validatie. Een tweede kopie in JavaScript zou daarvan afwijken.
      var res = await window.FSV2.api('/forms/slugify', {
        method: 'POST',
        body: JSON.stringify({ value: B.form.name }),
      });
      B.form.slug = res.data.slug;
      tekenInspector();
      return;
    }

    if (action === 'form-builder-save')      { await bewaar(B.form.status); return; }
    if (action === 'form-builder-publish')   { await bewaar('published');  return; }
    if (action === 'form-builder-unpublish') { await bewaar('draft');      return; }

    if (action === 'form-builder-copy-shortcode') {
      var inp = document.getElementById('fbShortcode');
      if (!inp) return;
      try {
        await navigator.clipboard.writeText(inp.value);
        window.FSV2.showAlert('Shortcode gekopieerd.', 'success');
      } catch (_) {
        inp.select();
        window.FSV2.showAlert('Kopiëren lukte niet — de shortcode staat geselecteerd.', 'warning');
      }
      return;
    }

    if (action === 'form-builder-delete') {
      if (!window.confirm('Het formulier verwijderen? De koppeling en haar stappen blijven bestaan; alleen de formulierdefinitie verdwijnt, en de shortcode toont niets meer.')) {
        return;
      }
      await window.FSV2.api('/integrations/' + B.integrationId + '/form', { method: 'DELETE' });
      window.FSV2.showAlert('Formulier verwijderd.', 'success');
      await renderDetailForm();
      return;
    }
  }

  /** Alleen de CSS-variabelen vervangen — daarvoor hoeft het canvas niet opnieuw. */
  function pasThemaToe() {
    var doc = canvasDoc();
    if (!doc) return;
    var stijl = doc.querySelector('style');
    if (stijl) stijl.textContent = themaStijl();
    pasHoogteAan();
  }

  function voegVeldToe(type, label) {
    var spec = specVoor(type);
    var veld = normalizeVeld({
      field_type: type,
      label: label || '',
      odoo_field_type: spec.odoo_type,
      // Een keuzeveld zonder opties wordt door de server geweigerd; geef het er
      // meteen een, anders is de eerste save altijd een foutmelding.
      options: spec.options ? [{ value: '', label: '' }] : [],
    });
    if (label) veld.field_key = veldnaamUitLabel(label);
    B.fields.push(veld);
  }

  /**
   * Wijzigingen uit de INSPECTEUR verwerken.
   *
   * Geeft true als de gebeurtenis hier hoorde. Structurele wijzigingen
   * hertekenen het canvas; tekst niet — die werkt hoogstens één knoop bij.
   */
  /**
   * @param {Element} inp
   * @param {'input'|'change'} gebeurtenis  'change' = het veld is verlaten
   *
   * LET OP: de parameter heet bewust NIET 'soort'. Die naam is verderop al in
   * gebruik voor data-fb-change (het soort WIJZIGING: type, width, theme...),
   * en een `var` met dezelfde naam overschrijft een parameter zonder enige
   * waarschuwing -- de waarde was twee regels na binnenkomst al undefined.
   */
  function handleFormBuilderChange(inp, gebeurtenis) {
    var veld = B.sel !== null ? B.fields[B.sel] : null;
    var soort = inp.dataset.fbChange;

    // ── Tekstvelden van het formulier zelf ───────────────────────────────────
    if (inp.dataset.fbForm) {
      // slug en redirect_url zijn NIET taalgevoelig: de slug staat in de
      // shortcode en de doorstuur-URL hoort bij het formulier, niet bij een
      // taal. schrijfForm() weet dat niet, dus die twee gaan er expliciet langs.
      if (inp.dataset.fbForm === 'slug' || inp.dataset.fbForm === 'redirect_url') {
        B.form[inp.dataset.fbForm] = inp.value;
        return true;
      }
      schrijfForm(inp.dataset.fbForm, inp.value);
      if (inp.dataset.fbForm === 'name') werkCanvasTekstBij(null, 'form:name', inp.value);
      if (inp.dataset.fbForm === 'description') werkCanvasTekstBij(null, 'form:description', inp.value);
      return true;
    }

    // ── Tekstvelden van het geselecteerde veld ───────────────────────────────
    // LET OP: label en hulptekst staan hier bewust NIET bij. Die typ je in het
    // voorbeeld zelf; ze hier nog eens als invoerveld zetten zou het tweede
    // bewerkscherm zijn dat we juist kwijt wilden.
    if (inp.dataset.fbField && veld) {
      if (inp.dataset.fbField === 'field_key') {
        // Wat je typt meteen omzetten naar een geldige veldnaam. De cursor
        // blijft staan door te tellen hoeveel tekens er vóór de cursor
        // overblijven na het normaliseren -- gewoon naar het einde springen
        // maakt het onmogelijk om iets in het midden te verbeteren.
        var ruw = inp.value;
        var cursor = inp.selectionStart;
        var schoon = normaliseerVeldnaamInvoer(ruw);
        if (schoon !== ruw) {
          var voorCursor = normaliseerVeldnaamInvoer(ruw.slice(0, cursor)).length;
          inp.value = schoon;
          try { inp.setSelectionRange(voorCursor, voorCursor); } catch (_) {}
        }

        // Het vak leegmaken betekent: laat de naam weer meelopen met het label.
        // Zonder die uitweg zit je vast aan een naam die je ooit per ongeluk
        // typte, zonder dat iets vertelt hoe je terugkomt.
        if (schoon === '') {
          veld._autoKey = true;
          veld.field_key = veldnaamUitLabel(veld.label, B.sel);
          inp.value = veld.field_key;
          tekenInspector();
          return true;
        }

        veld.field_key = schoon;
        veld._autoKey = false;

        // Bij het VERLATEN van het vak pas afronden: liggende streepjes aan het
        // eind weghalen en zorgen dat het met een letter begint. Tijdens het
        // typen mag dat niet -- dan kan je "voor_naam" niet intikken zonder dat
        // het streepje telkens onder je vingers wegvalt.
        if (gebeurtenis === 'change') {
          veld.field_key = beveiligVeldnaam(veld.field_key);
          inp.value = veld.field_key;
          // Hertekenen zodat de regel eronder klopt ("volgt het label" of niet).
          tekenInspector();
        }
        return true;
      }

      // odoo_field_type is techniek, geen tekst: die hoort nooit per taal te
      // verschillen.
      if (inp.dataset.fbField === 'odoo_field_type' || inp.dataset.fbField === 'default_value') {
        veld[inp.dataset.fbField] = inp.value;
        return true;
      }

      schrijfVeld(veld, inp.dataset.fbField, inp.value);

      if (inp.dataset.fbField === 'placeholder') {
        // De placeholder zit in een attribuut, niet in een tekstknoop.
        var doc = canvasDoc();
        var kaart = doc && doc.querySelector('[data-om-field="' + B.sel + '"]');
        var invoer = kaart && kaart.querySelector('.mymmo-form-input');
        if (invoer) invoer.setAttribute('placeholder', inp.value);
      }
      return true;
    }

    // ── Keuzes ───────────────────────────────────────────────────────────────
    if (inp.dataset.fbOptionField && veld) {
      var rij = inp.closest('[data-fb-option]');
      if (!rij) return true;
      var oIndex = Number(rij.dataset.fbOption);
      if (veld.options[oIndex]) {
        if (inp.dataset.fbOptionField === 'value') {
          // De waarde is nooit taalgevoelig; het invoerveld staat in een
          // vertaling ook op disabled, dit is het vangnet.
          if (!bewerktStandaardtaal()) return true;
          veld.options[oIndex].value = inp.value;
          veld.options[oIndex]._autoValue = false;
        }
        if (inp.dataset.fbOptionField === 'label') {
          schrijfOptieLabel(veld, oIndex, inp.value);
          werkCanvasTekstBij(B.sel, 'option:' + oIndex, inp.value);
          // Ook hier de waarde afleiden. Bij een KEUZELIJST is dit de enige
          // plek waar je opties kan bewerken -- de opties van een <select>
          // zijn native elementen en niet contenteditable. Zonder deze regel
          // blijft de waarde leeg, gooit validateFormDefinition de optie weg
          // en weigert de server het formulier met "minstens een optie".
          if (bewerktStandaardtaal() && veld.options[oIndex]._autoValue !== false) {
            veld.options[oIndex].value = slugAchtig(inp.value);
            werkInspecteurBij('[data-fb-option="' + oIndex + '"] [data-fb-option-field="value"]',
                              veld.options[oIndex].value);
          }
          // De <option>-tekst in het voorbeeld bijwerken.
          var doc = canvasDoc();
          var kaart = doc && doc.querySelector('[data-om-field="' + B.sel + '"]');
          var keuze = kaart && kaart.querySelectorAll('select option')[oIndex + 1];
          if (keuze) keuze.textContent = inp.value;
        }
      }
      return true;
    }

    // ── Structureel: het canvas moet opnieuw ─────────────────────────────────
    if (soort === 'type' && veld) {
      var spec = specVoor(inp.value);
      veld.field_type = inp.value;
      veld.odoo_field_type = spec.odoo_type;
      if (spec.options && veld.options.length === 0) veld.options = [{ value: '', label: '' }];
      if (!spec.options) veld.options = [];
      tekenCanvas();
      tekenInspector();
      return true;
    }

    if (soort === 'width' && veld) {
      veld.width = inp.value;
      tekenCanvas();
      return true;
    }

    if (soort === 'required' && veld) {
      veld.is_required = inp.checked;
      tekenCanvas();
      return true;
    }

    if (soort === 'theme') {
      B.form.theme = Object.assign({}, B.form.theme);
      B.form.theme[inp.dataset.key] = inp.value;
      pasThemaToe();
      return true;
    }

    if (soort === 'success-mode') {
      B.form.success_mode = inp.value;
      tekenInspector();
      return true;
    }

    if (soort === 'language') {
      var code = inp.dataset.lang;
      var talen = (B.form.languages || []).slice();
      var standaard = standaardTaal();

      if (code === standaard) return true; // de basistaal kan niet weg

      if (inp.checked) {
        if (talen.indexOf(code) === -1) talen.push(code);
      } else {
        talen = talen.filter(function (t) { return t !== code; });
        // De al ingetypte vertaling blijft in B.form.i18n staan. Bij het
        // opslaan gooit normalizeI18n() in schema.js weg wat niet bij een
        // actieve taal hoort. Hier meteen wissen zou betekenen dat één
        // verkeerde klik een half uur vertaalwerk kost, zonder waarschuwing
        // en zonder ongedaan maken.
        if (B.taal === code) B.taal = standaard;
      }

      // De volgorde vastzetten op die van TALEN, zodat de tabs niet
      // verspringen naargelang de volgorde waarin je ze aanvinkte.
      B.form.languages = TALEN
        .map(function (t) { return t.code; })
        .filter(function (c) { return talen.indexOf(c) !== -1; });

      tekenAlles();
      return true;
    }

    return false;
  }

  async function bewaar(status) {
    B.form.status = status;

    try {
      var res = await window.FSV2.api('/integrations/' + B.integrationId + '/form', {
        method: 'PUT',
        // De interne _autoKey-vlag hoort niet in de payload: de server kent
        // hem niet en hij zegt niets over de definitie.
        body: JSON.stringify({
          form: B.form,
          fields: B.fields.map(function (v) {
            var kopie = {};
            Object.keys(v).forEach(function (k) { if (k.charAt(0) !== '_') kopie[k] = v[k]; });
            // "Moet met een letter beginnen" wordt hier pas afgedwongen, niet
            // tijdens het typen -- zie normaliseerVeldnaamInvoer().
            if (kopie.field_key) kopie.field_key = beveiligVeldnaam(kopie.field_key);
            kopie.options = (v.options || []).map(function (o) {
              return { value: o.value, label: o.label };
            });
            return kopie;
          }),
        }),
      });

      B.form = Object.assign({}, LEEG_FORMULIER, res.data.form);
      B.fields = (res.data.fields || []).map(normalizeVeld);
      B.lockedKeys = res.data.locked_keys || [];

      var extra = res.data.transforms_seeded
        ? ' ' + res.data.transforms_seeded + ' veldtype(s) doorgegeven aan de veldtransformaties.'
        : '';
      window.FSV2.showAlert(
        (status === 'published' ? 'Formulier gepubliceerd.' : 'Formulier bewaard.') + extra,
        'success'
      );

      tekenAlles();

      // De veldenlijst van het KOPPELINGSTABBLAD meteen bijwerken.
      //
      // Zonder dit moet je na het toevoegen van een veld eerst de koppeling
      // opnieuw openen voor het in de keuzelijst bij de veldkoppelingen
      // verschijnt -- en niets op het scherm vertelt je dat. Je zoekt dan naar
      // een veld dat je net zelf hebt aangemaakt.
      if (window.FSV2.fetchOmFormFields) {
        window.FSV2.fetchOmFormFields(B.integrationId).catch(function () {});
      }
    } catch (err) {
      // De server geeft de eerste fout als bericht; alleen die tonen, want een
      // toast met acht regels leest niemand.
      window.FSV2.showAlert(err.message, 'error');
    }
  }

  Object.assign(window.FSV2, {
    renderDetailForm: renderDetailForm,
    handleFormBuilderAction: handleFormBuilderAction,
    handleFormBuilderChange: handleFormBuilderChange,
  });
}());
