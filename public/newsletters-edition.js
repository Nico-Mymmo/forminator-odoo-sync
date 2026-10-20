/**
 * Nieuwsbrieven -- de redactietafel van één editie.
 *
 * Wat de lezer ziet, maak je IN de brief; wat de lezer niet ziet, staat
 * rechts (de regie). De tafel vult het scherm: bovenaan een vaste kop (de
 * stappen, testen, inplannen), links de brief in een eigen vak dat scrolt,
 * rechts het paneel in een eigen vak dat scrolt (newsletters.html).
 *
 *   - klik op een blok: het paneel toont zijn instellingen, en in de brief
 *     worden titel, tekst, vraag, ... bewerkbaar, met een zwevende werkbalk
 *     boven het blok (AI, beeld, soort vraag; voor de hoofdredactie ook
 *     omhoog/omlaag, kleur, inhoudstafel, weghalen)
 *   - een "+"-lijn tussen twee blokken: daar iets toevoegen (blokjes, een
 *     bericht uit Nieuws & updates, een idee uit de voorraad)
 *   - de hoofdredactie sleept blokken aan hun handvat
 *   - het oogje toont de brief zoals de lezer hem ziet, zonder lege blokken
 *     en markeringen; dan is er niets bewerkbaar
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  /**
   * De blokjes die iedereen kan toevoegen. Een interessant artikel komt ALTIJD
   * uit Nieuws & updates: niemand typt dat zelf over. `kind` is de soort uit
   * lib/constants.js (KINDS); `titel` staat als labeltje boven het blok in de
   * mail en mag nadien nog wijzigen.
   */
  var SJABLONEN = [
    { key: 'titel', groep: 'opbouw', kind: 'heading', naam: 'Titel', titel: 'Titel', icoon: 'heading', uitleg: 'Een kop boven een reeks blokken; komt in de inhoudstafel.', enkelRedactie: true },
    { key: 'tekstblok', groep: 'opbouw', kind: 'article', naam: 'Tekstblok', titel: '', icoon: 'align-left', uitleg: 'Titel, subtitel, alinea\'s en een beeld.' },
    { key: 'bericht', groep: 'nieuws', kind: 'snippet', naam: 'Eén bericht', titel: 'Interessant voor jou', icoon: 'rss', uitleg: 'Een bericht uit Nieuws & updates, groot in beeld.' },
    { key: 'kortnieuws', groep: 'nieuws', kind: 'news', naam: 'Kort nieuws', titel: 'Kort nieuws', icoon: 'newspaper', uitleg: 'Twee of drie kleinere berichten naast elkaar.', inhoud: { vorm: 'kolommen', heading: '' } },
    { key: 'vraag', groep: 'lezer', kind: 'question', naam: 'Vraag aan de lezer', titel: 'Korte vraag', icoon: 'message-circle-question', uitleg: 'Een vraag, stelling of keuze; antwoorden met één klik.' },
    { key: 'tekst', groep: 'verhaal', kind: 'article', naam: 'Uit het team', titel: 'Uit het team', icoon: 'users', uitleg: 'Een kort verhaal, met foto of tekening.' },
    { key: 'tip', groep: 'verhaal', kind: 'article', naam: 'Tip', titel: 'Tip', icoon: 'lightbulb', uitleg: 'Eén tip die tijd bespaart.' },
    { key: 'citaat', groep: 'verhaal', kind: 'quote', naam: 'Uit de praktijk', titel: 'Uit de praktijk', icoon: 'quote', uitleg: 'Wat een klant of collega zei.' },
    { key: 'afbeelding', groep: 'media', kind: 'image', naam: 'Afbeelding', titel: 'Afbeelding', icoon: 'image', uitleg: 'Een beeld over de volle tekstbreedte.' },
    { key: 'video', groep: 'media', kind: 'video', naam: 'Video', titel: 'Video', icoon: 'circle-play', uitleg: 'Een filmpje, met een stilstaand beeld.' },
    { key: 'linkedin', groep: 'media', kind: 'linkedin', naam: 'Op LinkedIn', titel: 'Op LinkedIn', icoon: 'share-2', uitleg: 'Een post die het delen waard is.' },
    // Blokken die de OM zelf vult: één per mailing, enkel de hoofdredactie (een nieuwsbrief heeft ze al, een blanco mailing niet).
    // Vaste plek: één per mailing, altijd op dezelfde plaats (VASTE_PLEK in lib/constants.js); aan/uit ook in het paneel.
    { key: 'vooraf', groep: 'vast', kind: 'intro', naam: 'Woordje vooraf', titel: 'Woordje vooraf', icoon: 'hand-heart', uitleg: 'Altijd bovenaan, ondertekend met foto.', enkelRedactie: true, eenmalig: true },
    { key: 'inhoudstafel', groep: 'vast', kind: 'toc', naam: 'Inhoudstafel', titel: 'In deze editie', icoon: 'list-ordered', uitleg: 'Altijd onder het woordje vooraf; vult zichzelf.', enkelRedactie: true, eenmalig: true },
    { key: 'agenda', groep: 'vanzelf', kind: 'events', naam: 'Agenda', titel: 'Agenda', icoon: 'calendar-days', uitleg: 'De komende events uit Eventbeheer; vult zichzelf.', enkelRedactie: true, eenmalig: true, inhoud: { heading: 'Kom ons ontmoeten', exclude_ids: [] } },
    { key: 'afsluiting', groep: 'vast', kind: 'closing', naam: 'Afsluiting', titel: 'Tot de volgende', icoon: 'hand', uitleg: 'Altijd onderaan; het slotwoord met wie meeschreef.', enkelRedactie: true, eenmalig: true, inhoud: { text: '', button_label: '', button_url: '' } },
  ];
  var GROEPEN = [
    { key: 'opbouw', naam: 'Opbouw' },
    { key: 'nieuws', naam: 'Uit Nieuws & updates' },
    { key: 'lezer', naam: 'De lezer laten reageren' },
    { key: 'verhaal', naam: 'Verhalen' },
    { key: 'media', naam: 'Beeld en media' },
    { key: 'vanzelf', naam: 'Vult zichzelf' },
    { key: 'vast', naam: 'Vaste plek (bovenaan of onderaan)' },
  ];
  var SJ = {};
  SJABLONEN.forEach(function (s) { SJ[s.key] = s; });

  var VRAAG_KINDS = ['question', 'statement', 'poll'];

  /** Woordje vooraf en inhoudstafel bovenaan, afsluiting onderaan: aan of uit, nooit ergens anders (zelfde regel als VASTE_PLEK op de server). */
  var VAST = { intro: 'boven', toc: 'boven', closing: 'onder' };
  function isVast(kind) { return Object.prototype.hasOwnProperty.call(VAST, kind); }
  function vastBoven(it) { return !!it && VAST[it.kind] === 'boven'; }
  function staatUit(it) { return !!it && isVast(it.kind) && !!(it.content && it.content.uit); }

  /** Een vast blok aan of uit zetten (werkbalk of paneel). Uit = bewaard, niet verstuurd. */
  async function zetAan(id, aan) {
    try {
      await bewaarOpen();
      await NB.api('/api/contributions/' + id + '/aan', { method: 'POST', body: { aan: aan } });
      NB.toast(aan ? 'Aangezet.' : 'Uitgezet: het blijft bewaard, maar komt niet in de mail.', 'info');
      await herlaad({ open: id });
    } catch (err) { NB.fout(err); }
  }

  function d() { return NB.state.editie; }
  function ik() { return NB.state.boot.me.id; }
  function editor() { return Boolean(d() && d().series.is_editor); }
  function actief() { return ['collecting', 'review'].indexOf(d().edition.status) >= 0; }
  /**
   * Drie modi (2026-10-20), bovenaan te kiezen:
   *   layout  enkel de hoofdredactie: blokken toevoegen en verslepen, opmaak,
   *           schrijvers toewijzen, inhoudstafel, kop en voet, verzendklaar maken
   *   schrijf iedereen: enkel je eigen (toegewezen) blokken invullen
   *   lees    de mail zoals de lezer ze ziet, met opmerkingen per blok
   */
  function modus() {
    var m = NB.state.modus;
    if (m === 'layout' && !editor()) m = null;
    return m || (editor() ? 'layout' : 'schrijf');
  }
  function lezer() { return modus() === 'lees'; }
  function layout() { return modus() === 'layout'; }
  function schrijver() { return modus() === 'schrijf'; }
  NB.isLayout = function () { return !!d() && layout(); };
  NB.isSchrijver = function () { return !!d() && schrijver(); }
  function itemVan(id) { return d().items.find(function (i) { return i.id === id; }) || null; }
  function vak() { return document.getElementById('nbBriefvak'); }

  // ─── De kop: naam, stappen, knoppen ───────────────────────────────────────

  function voortgang() {
    var echt = d().items.filter(function (i) { return !NB.isAuto(i.kind); });
    var tel = function (s) { return echt.filter(function (i) { return i.status === s; }).length; };
    return { totaal: echt.length, bevestigd: tel('approved'), ingeleverd: tel('submitted') };
  }

  /** Verzamelen → Nalezen → Testen → Inplannen → Verzonden, met de huidige stap. */
  function stappen() {
    var ed = d().edition;
    if (ed.status === 'cancelled') return '';
    var nu = ed.status === 'collecting' ? 0 : ed.status === 'review' ? (ed.last_test_at ? 3 : 2) : ed.status === 'scheduled' ? 3 : 4;
    var klaar = function (i) { return i < nu || ed.status === 'sent' || (ed.status === 'scheduled' && i <= 3); };
    var blanco = NB.isBlanco(ed);
    if (blanco && ed.status === 'review') {
      var bev = ((d().checklist || {}).items || []).filter(function (x) { return x.key === 'bevestigd'; })[0];
      if (bev && !bev.ok) nu = 1;
    }
    return '<div class="nb-stappen" title="Waar deze editie staat">' + NB.STAPPEN.map(function (s, i) {
      if (blanco && s.key === 'collecting') return '';
      if (blanco && s.key === 'review') { var kr = klaar(i) ? 'nb-stap-klaar' : i === nu ? 'nb-stap-nu' : ''; return '<span class="nb-stap ' + kr + '"><i data-lucide="' + (klaar(i) ? 'check' : 'layout-list') + '" class="w-3.5 h-3.5"></i>Opbouwen</span>'; }
      var k = klaar(i) ? 'nb-stap-klaar' : i === nu ? 'nb-stap-nu' : '';
      var label = s.key === 'scheduled' && ed.status === 'scheduled' ? 'Vertrekt ' + NB.datum(ed.send_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : s.label;
      return (i ? '<i data-lucide="chevron-right" class="w-3 h-3 nb-pijl"></i>' : '')
        + '<span class="nb-stap ' + k + '"><i data-lucide="' + (klaar(i) ? 'check' : s.icoon) + '" class="w-3.5 h-3.5"></i>' + e(label) + '</span>';
    }).join('') + '</div>';
  }

  function blokkades() {
    var cl = d().checklist;
    return cl ? cl.items.filter(function (p) { return p.blokkeert && !p.ok; }) : [];
  }

  function kop() {
    var ed = d().edition;
    var p = voortgang();
    var stats = ed.stats;
    var t = NB.teller(ed.deadline_at);
    var wanneer = ed.status === 'scheduled'
      ? (ed.odoo_mailing_id ? '<span class="font-semibold">Aan Odoo gegeven</span> · vertrekt of is vertrokken' : 'Vertrekt op <strong>' + e(NB.datum(ed.send_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + '</strong> · tot dan kan je terughalen')
      : !actief() ? ''
      : NB.isBlanco(ed) ? '<span class="font-semibold">Blanco mailing</span> · zelf opgebouwd, geen inleverdag'
      : t.voorbij ? '<span class="text-warning font-semibold">Inleverdatum voorbij</span> · nalezen en bevestigen'
        : 'Inleverdatum ' + e(NB.datum(ed.deadline_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' · <span class="nb-teller">' + e(NB.tellerTekst(ed.deadline_at)) + '</span>';
    var knoppen = [];
    var weergave = [];
    weergave.push('<div class="join">'
      + '<button class="btn btn-sm btn-square join-item' + (NB.state.toestel !== 'gsm' ? ' btn-active' : '') + '" data-action="toestel" data-toestel="desktop" title="Op een computer"><i data-lucide="monitor" class="w-4 h-4"></i></button>'
      + '<button class="btn btn-sm btn-square join-item' + (NB.state.toestel === 'gsm' ? ' btn-active' : '') + '" data-action="toestel" data-toestel="gsm" title="Op een gsm"><i data-lucide="smartphone" class="w-4 h-4"></i></button></div>');
    if (actief() && layout()) knoppen.push('<button class="btn btn-sm btn-outline" data-action="toevoegen-open" title="Iets toevoegen aan de brief (of klik op een + tussen twee blokken)"><i data-lucide="plus" class="w-4 h-4"></i> Blok</button>');
    if (layout() && ed.status !== 'sent' && ed.status !== 'cancelled') {
      knoppen.push('<button class="btn btn-sm btn-outline btn-primary" data-action="test-versturen"><i data-lucide="send" class="w-4 h-4"></i> Testmail</button>');
    }
    if (layout() && actief()) {
      var tegen = blokkades();
      var kan = !tegen.length;
      knoppen.push('<button class="btn btn-sm btn-error" data-action="open-inplannen"' + (kan ? '' : ' disabled title="' + e('Nog niet klaar: ' + tegen.map(function (x) { return x.label; }).join('; ')) + '"') + '><i data-lucide="send" class="w-4 h-4"></i> Verzenden</button>');
    }
    if (layout() && ed.status === 'scheduled' && !ed.odoo_mailing_id) {
      knoppen.push('<button class="btn btn-sm btn-outline" data-action="open-moment"><i data-lucide="calendar-clock" class="w-4 h-4"></i> Moment wijzigen</button>');
      knoppen.push('<button class="btn btn-sm btn-warning" data-action="terughalen"><i data-lucide="undo-2" class="w-4 h-4"></i> Terughalen</button>');
    }
    // Dezelfde kop als de kalender (newsletters-overview.js): titel met icoon,
    // een regel uitleg eronder, de acties rechts. Daaronder de stappen en de weergave.
    var info = [];
    info.push(e(d().series.name));
    if (wanneer) info.push(wanneer);
    if (actief()) {
      info.push('verzenddag ' + e(NB.datum(ed.send_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
      info.push(NB.isBlanco(ed) ? '<strong>' + p.totaal + '</strong> ' + (p.totaal === 1 ? 'blok' : 'blokken') : '<strong>' + (p.bevestigd + p.ingeleverd) + ' van ' + p.totaal + '</strong> binnen');
    }
    if (stats) info.push((stats.sent || 0) + ' verzonden · ' + Math.round(stats.opened_ratio || 0) + '% geopend · ' + Math.round(stats.clicks_ratio || 0) + '% geklikt');
    return '<div class="flex flex-wrap items-center justify-between gap-3">'
      + '<div class="min-w-0"><a href="#/" data-action="ga" data-hash="#/" class="btn btn-sm btn-ghost -ml-3 mb-1 gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Kalender</a>'
      + '<h1 class="text-2xl font-bold flex flex-wrap items-center gap-2"><i data-lucide="newspaper" class="w-6 h-6 text-primary"></i>'
      + '<span class="min-w-0 truncate">' + e(ed.title) + '</span>' + NB.editieBadge(ed.status) + '</h1>'
      + '<p class="text-sm opacity-60 mt-0.5">' + info.join(' · ') + '</p></div>'
      + '<div class="flex flex-wrap items-center gap-2 shrink-0">' + knoppen.join('') + '</div></div>'
      + '<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">' + modusSchakel()
      + '<div class="flex flex-wrap items-center gap-3">' + (layout() ? stappen() : '') + weergave.join('') + '</div></div>';
  }

  /** De drie modi: tekst met een streepje onder de gekozen modus, geen vlakken. */
  function modusSchakel() {
    var nu = modus();
    var knop = function (key, icoon, label, uitleg, uit) {
      return '<button type="button" role="tab" class="nb-modus' + (nu === key ? ' nb-modus-aan' : '') + '" data-action="modus" data-modus="' + key + '"'
        + (uit ? ' disabled title="Enkel voor de hoofdredactie"' : ' title="' + e(uitleg) + '"') + ' aria-selected="' + (nu === key) + '">'
        + '<i data-lucide="' + icoon + '" class="w-4 h-4"></i>' + label + '</button>';
    };
    return '<div class="nb-modi" role="tablist" aria-label="Modus">'
      + knop('layout', 'layout-dashboard', 'Layouter', 'Blokken schikken, opmaak, schrijvers, inhoudstafel en verzenden', !editor())
      + knop('schrijf', 'pen-line', 'Schrijver', 'Je eigen blokken invullen')
      + knop('lees', 'eye', 'Lezer', 'De mail zoals de lezer ze ziet, met opmerkingen per blok')
      + '</div>';
  }

  function tekenKop() {
    var el = document.getElementById('nbKop');
    if (el) { el.innerHTML = kop(); NB.ikons(); }
  }

  // ─── Het paneel zonder gekozen blok: de regie van de editie ───────────────

  function kaart(inhoud, extra) {
    return '<div class="card bg-base-100 border border-base-content/10' + (extra || '') + '"><div class="card-body p-4 gap-2">' + inhoud + '</div></div>';
  }

  function blokRij(it, rechts) {
    return '<div class="flex items-center gap-2 py-1.5 border-b border-base-content/10 last:border-0">'
      + '<button class="flex-1 min-w-0 text-left hover:text-primary" data-action="kies-blok" data-id="' + e(it.id) + '">'
      + '<div class="text-sm font-medium truncate">' + e(NB.blokNaam(it)) + '</div>'
      + '<div class="text-xs opacity-60 truncate">' + e(it.heading && it.heading !== it.title ? it.heading : NB.soort(it.kind)) + '</div></button>'
      + (rechts || NB.statusBadge(it.status)) + '</div>';
  }

  /** Klaar om te verzenden? Dezelfde lijst als op de server; klik en je springt ernaar. */
  function checklistKaart() {
    var cl = d().checklist;
    if (!cl || !actief()) return '';
    var rijen = cl.items.map(function (p) {
      var icoon = p.ok ? 'circle-check' : p.blokkeert ? 'circle' : 'triangle-alert';
      var kleur = p.ok ? 'text-success' : p.blokkeert ? 'text-error' : 'text-warning';
      var klik = (p.ids && p.ids.length) ? ' data-action="kies-blok" data-id="' + e(p.ids[0]) + '"'
        : p.key === 'onderwerp' || p.key === 'voorbeeldtekst' ? ' data-action="focus-onderwerp"'
          : p.key === 'test' && !p.ok ? ' data-action="test-versturen"'
            : p.key === 'ontvangers' ? ' data-action="ga" data-hash="#/reeks/' + e(d().series.id) + '"' : '';
      var tag = klik ? 'button' : 'div';
      return '<' + tag + ' class="flex items-start gap-2 text-sm text-left w-full py-1' + (klik ? ' hover:text-primary' : '') + '"' + klik + '>'
        + '<i data-lucide="' + icoon + '" class="w-4 h-4 shrink-0 mt-0.5 ' + kleur + '"></i>'
        + '<span class="min-w-0"><span>' + e(p.label) + '</span>' + (p.uitleg && !p.ok ? '<span class="block text-xs opacity-60 truncate">' + e(p.uitleg) + '</span>' : '') + '</span></' + tag + '>';
    }).join('');
    var slot = cl.ok ? '<p class="text-xs text-success font-semibold">Alles klaar: je kan inplannen.</p>'
      : cl.klaar_op_live_na ? '<p class="text-xs opacity-70">Alles klaar, enkel de echte verzending staat nog uit (teststand).</p>' : '';
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="list-checks" class="w-4 h-4"></i> Klaar om te verzenden?</h3><div>' + rijen + '</div>' + slot, cl.ok ? ' border-success/50' : '');
  }

  function lijstNamen() {
    var ids = (d().series.odoo_list_ids || []).map(Number);
    var lijsten = NB.state.lijsten || [];
    if (!ids.length) return '<span class="text-warning">Geen Odoo-lijst gekozen.</span>';
    return ids.map(function (id) {
      var l = lijsten.find(function (x) { return Number(x.id) === id; });
      return l ? e(l.name) + (l.contacts !== null && l.contacts !== undefined ? ' (' + l.contacts + ')' : '') : 'lijst ' + id;
    }).join(', ');
  }

  function editieKaart() {
    var ed = d().edition;
    var mag = actief();
    var sm = d().send_mode;
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="mail" class="w-4 h-4"></i> Editie</h3>'
      + '<label class="form-control"><span class="label-text text-xs">Onderwerp</span><input id="edOnderwerp" class="input input-bordered input-sm" maxlength="200" placeholder="Onderwerp" value="' + e(ed.subject) + '"' + (mag ? '' : ' disabled') + '></label>'
      + '<label class="form-control"><span class="label-text text-xs">Voorbeeldtekst (de grijze regel in de inbox)</span><input id="edPreheader" class="input input-bordered input-sm" maxlength="200" placeholder="Voorbeeldtekst" value="' + e(ed.preheader) + '"' + (mag ? '' : ' disabled') + '></label>'
      + '<div id="edVoorstellen" class="flex flex-col gap-1"></div>'
      + (mag && editor() ? '<button class="btn btn-sm btn-ghost self-start" data-action="open-kop"><i data-lucide="image" class="w-4 h-4"></i> Logo en teksten van de mail</button>' : '')
      + (mag ? '<div class="flex gap-2"><button class="btn btn-sm btn-ghost" data-action="ai-onderwerp"><i data-lucide="sparkles" class="w-4 h-4"></i> Stel voor</button>'
        + '<button class="btn btn-sm btn-primary ml-auto" data-action="bewaar-onderwerp">Bewaren</button></div>' : '')
      + '<div class="divider my-1"></div>'
      + '<div class="grid grid-cols-2 gap-2">'
      + (NB.isBlanco(ed) ? '<div class="text-xs opacity-60 self-end pb-2">Blanco mailing: geen inleverdag.</div>' : '<label class="form-control"><span class="label-text text-xs">Inleverdatum</span><input id="edDeadline" type="datetime-local" class="input input-bordered input-sm" value="' + e(NB.lokaal(ed.deadline_at)) + '"' + (mag ? '' : ' disabled') + '></label>')
      + '<label class="form-control"><span class="label-text text-xs">Verzenddag</span><input id="edSend" type="datetime-local" class="input input-bordered input-sm" value="' + e(NB.lokaal(ed.send_at)) + '"' + (mag ? '' : ' disabled') + '></label></div>'
      + (mag ? '<div class="flex gap-2 items-center"><span class="text-xs opacity-60">Verzenden gebeurt pas na "Inplannen".</span><button class="btn btn-sm btn-ghost ml-auto" data-action="bewaar-datums">Bewaren</button></div>' : '')
      + (ed.status === 'scheduled' ? '<div class="alert alert-info text-sm py-2"><i data-lucide="calendar-clock" class="w-4 h-4"></i><span>Vertrekt op <strong>' + e(NB.datum(ed.send_at)) + '</strong>. Tot dan: Terughalen of Moment wijzigen, bovenaan.</span></div>' : '')
      + '<div class="divider my-1"></div>'
      + '<div class="text-sm"><span class="text-xs opacity-60 block">Ontvangers</span>' + (sm === 'live' ? lijstNamen() : '<span class="opacity-80">Teststand: een testmail gaat enkel naar de collega\'s die je aanvinkt.</span><span class="block text-xs opacity-60">Bij een echte verzending: ' + lijstNamen() + '</span>') + '</div>'
      + (d().series.chat_channel && mag ? '<button class="btn btn-sm btn-ghost self-start" data-action="herinner"><i data-lucide="bell" class="w-4 h-4"></i> Herinner iedereen in de chat</button>' : '')
      + (mag ? '<button class="btn btn-xs btn-ghost self-start opacity-60" data-action="annuleer-editie">Editie annuleren</button>' : ''));
  }

  /** Aan/uit voor de blokken met een vaste plek (enkel de hoofdredactie). */
  function vasteBlokken() {
    if (!editor() || !actief()) return '';
    var rij = function (kind, naam, waar) {
      var aan = d().items.some(function (i) { return i.kind === kind && !staatUit(i); });
      return '<label class="flex items-center gap-3 py-1.5 cursor-pointer"><input type="checkbox" class="toggle toggle-sm toggle-primary" data-change="vast-blok" data-kind="' + kind + '"' + (aan ? ' checked' : '') + '>'
        + '<span class="flex-1 min-w-0"><span class="block text-sm font-medium">' + e(naam) + '</span><span class="block text-xs opacity-60">' + e(waar) + '</span></span></label>';
    };
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="pin" class="w-4 h-4"></i> Vaste blokken</h3>'
      + '<div>' + rij('intro', 'Woordje vooraf', 'Altijd bovenaan') + rij('toc', 'Inhoudstafel', 'Altijd onder het woordje vooraf') + rij('closing', 'Tot de volgende', 'Altijd onderaan') + '</div>');
  }

  function voorJou() {
    var mijn = d().items.filter(function (i) { return i.owner_user_id === ik() && !NB.isAuto(i.kind); });
    var open = mijn.filter(function (i) { return i.status === 'open' || i.status === 'draft'; });
    var kopje = '<h3 class="font-semibold flex items-center gap-2"><i data-lucide="pen-line" class="w-4 h-4"></i> Voor jou</h3>';
    if (!mijn.length) {
      return kaart(kopje + '<p class="text-sm opacity-70">Er staat in deze editie niets op jouw naam. Wil je toch iets kwijt? Klik op een <strong>+</strong> tussen twee blokken in de brief.</p>');
    }
    var uitleg = open.length
      ? '<p class="text-sm opacity-70">Klik op een blok, hier of in de brief, en typ erin. Klaar? Dan "Inleveren".</p>'
      : '<p class="text-sm opacity-70">Alles van jou is ingeleverd. Dank je!</p>';
    return kaart(kopje + uitleg + '<div>' + mijn.map(function (i) { return blokRij(i); }).join('') + '</div>', open.length ? ' border-primary/40' : '');
  }

  function teBevestigen() {
    var lijst = d().items.filter(function (i) { return i.status === 'submitted'; });
    if (!lijst.length) return '';
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="badge-check" class="w-4 h-4"></i> Te bevestigen</h3>'
      + '<div>' + lijst.map(function (i) {
        return blokRij(i, '<span class="text-xs opacity-60 shrink-0">' + e(NB.voornaam(i.owner_name)) + '</span><button class="btn btn-xs btn-success" data-action="keur-goed" data-id="' + e(i.id) + '">Bevestigen</button>');
      }).join('') + '</div>', ' border-warning/50');
  }

  function verloop() {
    var ed = d().edition;
    var lijst = d().activity || [];
    var vragen = d().items.some(function (i) { return NB.isVraag(i.kind); });
    var delen = [];
    if (ed.last_test_at) delen.push('<div class="text-xs opacity-70">Laatste testmail: ' + e(NB.datum(ed.last_test_at)) + '</div>');
    if (vragen) delen.push('<button class="btn btn-sm btn-outline self-start" data-action="open-antwoorden"><i data-lucide="message-circle-question" class="w-4 h-4"></i> Antwoorden op de vragen</button>');
    delen.push(lijst.length
      ? '<div>' + lijst.slice(0, 20).map(function (a) {
        return '<div class="text-xs py-1 border-b border-base-content/10 last:border-0">' + (a.user_name ? '<strong>' + e(NB.voornaam(a.user_name)) + '</strong>: ' : '') + e(a.text) + ' <span class="opacity-50">' + e(NB.datum(a.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span></div>';
      }).join('') + '</div>'
      : '<p class="text-xs opacity-60">Nog niets gebeurd.</p>');
    return '<details class="collapse collapse-arrow bg-base-100 border border-base-content/10"' + (ed.status === 'sent' ? ' open' : '') + '><summary class="collapse-title font-semibold text-sm min-h-0 py-3">Verloop</summary><div class="collapse-content flex flex-col gap-2">' + delen.join('') + '</div></details>';
  }

  function paneelOverzicht() {
    if (lezer()) return leesPaneel();
    if (layout()) {
      return '<div class="flex flex-col gap-3">' + teBevestigen() + checklistKaart() + voorJou() + vasteBlokken() + editieKaart() + verloop() + '</div>';
    }
    return '<div class="flex flex-col gap-3">' + voorJou() + verloop() + '</div>';
  }

  function toonPaneel() {
    var bak = document.getElementById('nbPaneel');
    if (!bak) return;
    bak.innerHTML = paneelOverzicht();
    NB.ikons();
    if (lezer()) koppelNoemen();
  }

  // ─── De brief ─────────────────────────────────────────────────────────────

  var briefNr = 0;

  /** Wat er nu in het paneel staat, ook al is het nog niet bewaard. */
  function ontwerp() {
    var s = NB.state.stukje;
    var c = NB.state.concept;
    if (!s || !c) return null;
    return { id: s.item.id, kind: c.kind, title: c.title, content: c.content };
  }

  async function laadBrief() {
    var frame = document.getElementById('edVoorbeeld');
    if (!frame) return;
    var nr = ++briefNr;
    var r;
    try {
      r = await NB.api('/api/editions/' + d().edition.id + '/preview', { method: 'POST', body: { mode: lezer() ? 'test' : 'preview', lees: lezer(), override: ontwerp() } });
    } catch (err) { NB.fout(err); return; }
    // Een trager, ouder antwoord mag een nieuwer niet overschrijven.
    if (nr !== briefNr || !document.body.contains(frame)) return;
    // Staat de brief er al, dan enkel de inhoud vervangen: geen witte flits,
    // de stijl en de luisteraars blijven, en het vak springt niet.
    var bestaand = frame.contentDocument;
    if (bestaand && bestaand.body && bestaand.getElementById('nbStijl')) {
      var hoogte = frame.offsetHeight;
      frame.style.minHeight = hoogte + 'px';
      bestaand.body.innerHTML = r.html;
      frame.style.height = (bestaand.documentElement.scrollHeight + 16) + 'px';
      frame.style.minHeight = '';
      versier(bestaand);
      if (NB.state.scrolNa) { scrolNaarBlok(NB.state.scrolNa); NB.state.scrolNa = null; NB.state.vakScroll = null; }
      if (NB.state.vakScroll !== null && NB.state.vakScroll !== undefined && vak()) { vak().scrollTop = NB.state.vakScroll; NB.state.vakScroll = null; }
      kolomPassen(bestaand);
      return;
    }
    // De hoogte vasthouden tot de nieuwe brief er staat: anders springt het vak.
    frame.style.minHeight = frame.offsetHeight + 'px';
    frame.onload = function () {
      var doc = frame.contentDocument;
      if (!doc) return;
      frame.style.height = (doc.documentElement.scrollHeight + 16) + 'px';
      frame.style.minHeight = '';
      versier(doc);
      if (NB.state.scrolNa) { scrolNaarBlok(NB.state.scrolNa); NB.state.scrolNa = null; NB.state.vakScroll = null; }
      if (NB.state.vakScroll !== null && NB.state.vakScroll !== undefined && vak()) { vak().scrollTop = NB.state.vakScroll; NB.state.vakScroll = null; }
      kolomPassen(doc);
    };
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0">' + r.html + '</body></html>';
  }
  NB.vernieuwBrief = laadBrief;

  var BRIEF_CSS = ''
    // Geen randen rond blokken (2026-10-20). Wat een ander nog moet schrijven
    // is grijs; het gekozen blok staat in de focus: de rest van de brief dimt.
    + '[data-nb-id]{cursor:pointer}'
    + '[data-nb-id]>td{position:relative}'
    + '[data-nb-id]>td>*{transition:opacity .2s,filter .2s}'
    + '.nb-ander>td>*:not(.nb-label){opacity:.4;filter:grayscale(1)}'
    + 'body.nb-focus [data-nb-id]:not(.nb-gekozen)>td>*:not(.nb-label),body.nb-focus [data-nb-kop],body.nb-focus [data-nb-voet]{opacity:.3}'
    + 'body.nb-focus [data-nb-id]:not(.nb-gekozen):hover>td>*:not(.nb-label){opacity:.65}'
    + 'body.nb-focus .nb-plus-lijn{visibility:hidden}'
    + '.nb-gekozen>td>*{opacity:1!important;filter:none!important}'
    // Lezer: blokken zijn aanklikbaar om te reageren, met een labeltje bij het aanwijzen.
    + '[data-nb-lees]{cursor:pointer}[data-nb-lees]>td{position:relative}[data-nb-lees]>td>*{transition:opacity .2s}'
    + '[data-nb-lees]:hover>td::after,[data-nb-lees].nb-gekozen>td::after{content:"\\1F4AC  Opmerking plaatsen";position:absolute;top:8px;right:10px;font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 10px;border-radius:999px;background:#fff;color:#0369a1;border:1px solid #bae6fd;box-shadow:0 1px 3px rgba(0,0,0,.08);pointer-events:none}'
    + '[data-nb-lees].nb-gekozen>td::after,[data-nb-lees].nb-gekozen:hover>td::after{content:"\\1F4AC  Je reageert op dit blok";background:#0284c7;color:#fff;border-color:#0284c7}'
    + '.nb-opm{position:absolute;top:8px;left:10px;z-index:3;font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 9px;border-radius:999px;background:#fff;color:#334155;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer}'
    + '.nb-opm:hover{border-color:#0284c7;color:#0369a1}'
    + '.nb-label{position:absolute;top:8px;right:10px;z-index:2;pointer-events:none;font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 10px;border-radius:999px;white-space:nowrap}'
    + '.nb-label-mijn{background:#0284c7;color:#fff}'
    + '.nb-label-wacht{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}'
    + '.nb-label-bezig{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}'
    // Typen in de brief
    + '[data-nb-veld]:empty::before{content:attr(data-placeholder);color:#9ca3af;font-style:italic}'
    + '[data-nb-optioneel]:empty{display:none!important}'
    + '.nb-gekozen [data-nb-optioneel]:empty{display:block!important}'
    + '.nb-gekozen span[data-nb-optioneel]:empty{display:inline-block!important}'
    // Een veld dat je zelf toevoegt (bv. de subtitel): leeg enkel na de knop in de werkbalk.
    + '.nb-gekozen [data-nb-op-vraag]:empty:not(.nb-open){display:none!important}'
    // Het tekstveld omvat een beeld ernaast, en een lege alinea toont waar je typt.
    + '[data-nb-veld="text"]{display:flow-root}'
    + '[data-nb-veld] p[data-nb-leeg]:empty::before{content:"Typ hier je tekst.";color:#9ca3af;font-style:italic}'
    + '[data-nb-veld][contenteditable]{outline:none;border-radius:6px;cursor:text;transition:box-shadow .15s;min-width:1em}'
    + '[data-nb-veld][contenteditable]:focus{caret-color:#0284c7}'
    + '[data-nb-veld="text"] p{margin:0 0 14px!important}[data-nb-veld="text"] p:last-child{margin-bottom:0!important}'
    // De zwevende werkbalk boven het gekozen blok
    + '.nb-werkbalk{position:absolute;top:-16px;left:14px;z-index:5;display:flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:#fff;border:1px solid #bae6fd;box-shadow:0 2px 8px rgba(0,0,0,.12)}'
    + '.nb-werkbalk button{font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;border-radius:999px;padding:7px 10px;cursor:pointer;border:0;background:transparent;color:#0369a1;white-space:nowrap}'
    + '.nb-werkbalk button:hover,.nb-werkbalk button.nb-aan{background:#0284c7;color:#fff}'
    + '.nb-werkbalk button.nb-weg:hover{background:#b91c1c}'
    + '.nb-werkbalk button.nb-schakel{display:inline-flex;align-items:center;gap:7px;padding:5px 10px 5px 6px}'
    + '.nb-werkbalk button.nb-schakel:hover{background:#f0f9ff;color:#0369a1}'
    + '.nb-schakel i{position:relative;display:inline-block;width:30px;height:18px;border-radius:999px;background:#cbd5e1;transition:background .15s}'
    + '.nb-schakel i::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}'
    + '.nb-schakel.nb-op i{background:#0284c7}.nb-schakel.nb-op i::after{left:14px}'
    + '[data-nb-toc-schakel]{display:inline-flex;cursor:pointer;vertical-align:middle}'
    + '.nb-toc-eigen{margin-left:6px;padding:2px 7px;border-radius:999px;background:#fef3c7;color:#92400e;font:600 11px/1.4 system-ui,sans-serif;text-decoration:none}'
    + '.nb-toc-eigen:hover{background:#92400e;color:#fff}'
    + '[data-nb-toc-titel][contenteditable]{outline:none;border-radius:4px;cursor:text}'
    + '[data-nb-toc-titel][contenteditable]:hover{text-decoration:underline dotted #94a3b8;text-underline-offset:4px}'
    + '[data-nb-toc-titel][contenteditable]:focus{text-decoration:none;caret-color:#0284c7}'
    + '[data-nb-uit]:hover>td{box-shadow:none}[data-nb-uit]:hover div{border-color:#94a3b8}'
    + '.nb-werkbalk .nb-scheid{width:1px;height:18px;background:#e5e7eb;margin:0 2px}'
    + '.nb-werkbalk .nb-greep{cursor:grab;color:#64748b;padding:7px 6px;touch-action:none;user-select:none}'
    + '.nb-werkbalk .nb-greep:active{cursor:grabbing}'
    + '.nb-werkbalk .nb-kleurbol{width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(3,105,161,.5);display:inline-block;vertical-align:middle}'
    + '.nb-soorten{display:flex;gap:0}.nb-soorten button{border-radius:0;padding:7px 9px}.nb-soorten button:first-child{border-radius:999px 0 0 999px}.nb-soorten button:last-child{border-radius:0 999px 999px 0}'
    + '.nb-optie-weg{display:inline-block;margin-left:10px;width:20px;height:20px;line-height:18px;text-align:center;border-radius:50%;background:#fff;color:#b91c1c;border:1px solid #fecaca;font:700 14px/18px system-ui,sans-serif;cursor:pointer;vertical-align:middle}'
    + '.nb-optie-weg:hover{background:#b91c1c;color:#fff}'
    + '.nb-antwoord-bij{margin-top:4px;border:2px dashed rgba(125,211,252,.9);border-radius:8px;padding:10px;text-align:center;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;color:#0369a1;background:rgba(255,255,255,.85);cursor:pointer}'
    + '.nb-antwoord-bij:hover{background:#0284c7;border-color:#0284c7;color:#fff}'
    + '[data-nb-beeld][data-nb-knop]{cursor:pointer}[data-nb-beeld][data-nb-knop]:hover img{filter:brightness(.92)}'
    + '[data-nb-eiland]{user-select:none}'
    // Kop en voet: geen rand, wel een labeltje bij het aanwijzen.
    + '[data-nb-kop],[data-nb-voet]{cursor:pointer;position:relative}'
    + '[data-nb-kop]:hover::after,[data-nb-voet]:hover::after{content:"\\270E  Aanpassen";position:absolute;top:8px;right:10px;font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 10px;border-radius:999px;background:#fff;color:#0369a1;border:1px solid #bae6fd;box-shadow:0 1px 3px rgba(0,0,0,.08)}'
    + '.nb-werkbalk button.nb-klaar{background:#0284c7;color:#fff;padding:7px 12px}.nb-werkbalk button.nb-klaar:hover{background:#0369a1}'
    // Het handvat op elk ander blok (hoofdredactie): enkel zichtbaar als je erover gaat
    + '.nb-greep-rij{position:absolute;left:10px;top:8px;z-index:4;opacity:0;transition:opacity .15s}'
    + '[data-nb-id]:hover .nb-greep-rij{opacity:1}'
    + '.nb-greep-los{font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;background:#0369a1;color:#fff;border-radius:8px;padding:7px 10px;cursor:grab;touch-action:none;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.25);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.nb-greep-los:active{cursor:grabbing}'
    + '.nb-sleept>td{opacity:.3}'
    + '.nb-lijn>td{padding:0 24px}.nb-lijn div{height:5px;border-radius:3px;background:#0284c7;box-shadow:0 0 0 4px rgba(2,132,199,.18)}'
    // De "+"-lijn tussen twee blokken: verschijnt als je erover gaat
    + '.nb-plus-lijn td{padding:0 24px;height:16px;cursor:default}'
    + '.nb-plus-in{position:relative;height:16px;opacity:0;transition:opacity .15s}'
    + '.nb-plus-lijn:hover .nb-plus-in,.nb-plus-lijn.nb-altijd .nb-plus-in{opacity:1}'
    + '.nb-plus-in::before{content:"";position:absolute;left:0;right:0;top:7px;height:2px;background:#38bdf8;border-radius:1px}'
    + '.nb-plus-knop{position:absolute;left:50%;top:-6px;transform:translateX(-50%);width:28px;height:28px;line-height:26px;border-radius:50%;background:#0284c7;color:#fff;border:2px solid #fff;text-align:center;font:700 18px/26px system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)}'
    + '.nb-plus-knop:hover{background:#0369a1}';

  /** Wat er op een blok in de brief staat, naast de inhoud. */
  function labelVan(it) {
    if (!it || NB.isAuto(it.kind) || it.status === 'approved' || staatUit(it)) return null;
    if (it.owner_user_id === ik() && (it.status === 'open' || it.status === 'draft')) {
      return { soort: 'mijn', tekst: it.status === 'open' ? 'Voor jou · klik om in te vullen' : 'Voor jou · nog niet ingeleverd' };
    }
    if (it.status === 'submitted') return { soort: 'wacht', tekst: editor() ? 'Ingeleverd · te bevestigen' : 'Ingeleverd · wacht op marketing' };
    if (it.status === 'draft') return { soort: 'bezig', tekst: 'Bezig · ' + (NB.voornaam(it.owner_name) || 'iemand') + ' schrijft nog' };
    if (it.status === 'open') return { soort: 'bezig', tekst: it.owner_user_id ? 'Open · voor ' + (NB.voornaam(it.owner_name) || 'een collega') : 'Open · nog niemand' };
    return null;
  }

  function eenRegel(veld) {
    return ['title', '@title', 'question', 'heading', 'subtitle', 'quote', 'person', 'role', 'button_label', 'bijschrift'].indexOf(veld) >= 0 || /^options\.\d+\.label$/.test(veld);
  }

  function versier(doc) {
    if (!doc.getElementById('nbStijl')) {
      var stijl = doc.createElement('style');
      stijl.id = 'nbStijl';
      stijl.textContent = BRIEF_CSS;
      (doc.head || doc.documentElement).appendChild(stijl);
      doc.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (NB.kleur) NB.kleur.sluit();
        var knop = ev.target.closest('[data-nb-knop]');
        if (knop) { blokKnop(knop.getAttribute('data-nb-knop'), knop); return; }
        if (ev.target.closest('[data-nb-kop]') || ev.target.closest('[data-nb-voet]')) { openKop(ev.target.closest('[data-nb-voet]') ? 'voet' : 'kop'); return; }
        var plus = ev.target.closest('.nb-plus-knop');
        if (plus) { openToevoegen(plus.closest('.nb-plus-lijn').getAttribute('data-na')); return; }
        if (ev.target.closest('.nb-werkbalk') || ev.target.closest('.nb-greep-rij')) return;
        if (lezer()) {
          // Een link werkt zoals in de mail, in een nieuw tabblad.
          var link = ev.target.closest('a[href]');
          var href = link && link.getAttribute('href');
          if (href && /^(https?:|mailto:|tel:)/i.test(href)) { window.open(href, '_blank', 'noopener'); return; }
          var lb = ev.target.closest('[data-nb-lees]');
          if (lb) kiesLees(lb.getAttribute('data-nb-lees')); else kiesLees(null);
          return;
        }
        var blok = ev.target.closest('[data-nb-id]');
        if (blok) selecteer(blok.getAttribute('data-nb-id')).catch(NB.fout);
        else stapUit();
      });
      doc.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && !ev.defaultPrevented) stapUit();
      });
      // Een beeld dat later laadt, maakt de brief langer.
      doc.addEventListener('load', function () { hoogteBij(); }, true);
      doc.addEventListener('input', function (ev) {
        var el = ev.target.closest && ev.target.closest('[data-nb-veld][contenteditable]');
        if (!el || !NB.stukjeZet) return;
        var veld = el.getAttribute('data-nb-veld');
        var waarde = eenRegel(veld) ? el.textContent.replace(/\s+/g, ' ').trim() : htmlNaarTekst(el);
        NB.state.inlineVuil = true;
        // `@naam` = een veld van het stukje zelf (bv. het labeltje), anders de inhoud.
        NB.stukjeZet(veld.charAt(0) === '@' ? veld.slice(1) : 'content.' + veld, waarde, { stil: true });
        // Een beeld tussen de tekst schuift mee: tel de alinea's ervoor.
        var eiland = veld === 'text' && el.querySelector('[data-nb-eiland]');
        if (eiland && NB.stukjeLees('content.beeld')) {
          var n = 0;
          for (var x = eiland.previousSibling; x; x = x.previousSibling) {
            if (x.nodeType === 1 ? x.textContent.trim() : String(x.nodeValue || '').trim()) n++;
          }
          if (n !== NB.stukjeLees('content.beeld.na_alinea')) NB.stukjeZet('content.beeld.na_alinea', n, { stil: true });
        }
        hoogteBij();
      });
      // Plakken = gewone tekst: geen opmaak van een andere site in de mail.
      doc.addEventListener('paste', function (ev) {
        if (!ev.target.closest || !ev.target.closest('[data-nb-veld][contenteditable]')) return;
        ev.preventDefault();
        var tekst = (ev.clipboardData && ev.clipboardData.getData('text/plain')) || '';
        doc.execCommand('insertText', false, tekst);
      });
      // Een titel, een vraag en het opschrift van een knop zijn één regel.
      doc.addEventListener('keydown', function (ev) {
        var el = ev.target.closest && ev.target.closest('[data-nb-veld][contenteditable]');
        if (el && ev.key === 'Enter' && eenRegel(el.getAttribute('data-nb-veld'))) ev.preventDefault();
      });
      koppelHerordenen(doc);
      if (NB.opmaak) NB.opmaak.koppel(doc);
      doc.addEventListener('keydown', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-nb-toc-titel][contenteditable]');
        if (!t) return;
        if (ev.key === 'Enter') { ev.preventDefault(); t.blur(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); t.setAttribute('data-nb-annuleer', '1'); t.blur(); }
      });
      doc.addEventListener('focusout', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-nb-toc-titel][contenteditable]');
        if (!t) return;
        var id = t.getAttribute('data-nb-toc-titel');
        var it = itemVan(id);
        var nu = String((it && it.content && it.content.toc_titel) || '').trim() || t.getAttribute('data-origineel');
        if (t.hasAttribute('data-nb-annuleer')) { t.removeAttribute('data-nb-annuleer'); t.textContent = nu; return; }
        var nieuw = t.textContent.replace(/\s+/g, ' ').trim();
        if (nieuw === nu) return;
        zetTocTitel(id, nieuw === t.getAttribute('data-origineel') ? '' : nieuw);
      });
    }
    labels(doc);
    plusLijnen(doc);
    markeerLees(doc);
    // Erin/eruit in de inhoudstafel: enkel de layouter.
    if (!layout() || !actief()) doc.querySelectorAll('[data-nb-toc-schakel]').forEach(function (x) { x.remove(); });
    // De kop en de voet zijn enkel klikbaar voor de layouter.
    if (!layout() || !actief()) {
      doc.querySelectorAll('[data-nb-kop],[data-nb-voet]').forEach(function (x) { x.removeAttribute('data-nb-kop'); x.removeAttribute('data-nb-voet'); x.removeAttribute('title'); });
    }
  }

  /** Het venster Logo en teksten: de kop van deze mailing, de voet van het soort. */
  var kopLogoUrl = null; // null = niets gewijzigd; '' = terug naar de standaard
  function openKop(deel) {
    if (!layout() || !actief()) return;
    var k = d().kop || {}, v = d().voet || {}, s = d().series, h = d().edition.header || {};
    var std = k.standaard || {};
    kopLogoUrl = null;
    document.getElementById('kopLogo').src = k.logo || '';
    var titel = document.getElementById('kopTitel');
    titel.value = typeof h.titel === 'string' ? h.titel : '';
    titel.placeholder = std.titel || '';
    var onder = document.getElementById('kopOndertitel');
    onder.value = typeof h.ondertitel === 'string' ? h.ondertitel : '';
    onder.placeholder = std.ondertitel || '';
    var vs = v.standaard || {};
    document.getElementById('voetReden').value = s.footer_reason || '';
    document.getElementById('voetReden').placeholder = vs.reden || '';
    document.getElementById('voetRegel').value = s.footer_line || '';
    document.getElementById('voetRegel').placeholder = vs.regel || '';
    NB.ikons();
    NB.dialoog('dlgKop').showModal();
    (deel === 'voet' ? document.getElementById('voetReden') : titel).focus();
  }
  NB.actions['open-kop'] = function () { openKop('kop'); };

  NB.changes['kop-logo'] = async function (el) {
    var bestand = el.files && el.files[0];
    if (!bestand) return;
    try {
      // Een logo gaat ongewijzigd op (PNG met doorzichtige achtergrond blijft zo); andere soorten zet het scherm om naar PNG.
      var blob = /^image\/(png|jpeg|gif)$/.test(bestand.type) ? bestand : await naarPng(bestand);
      var r = await NB.upload('/api/upload', blob);
      kopLogoUrl = r.url;
      document.getElementById('kopLogo').src = r.url;
    } catch (err) { NB.fout(err); }
    el.value = '';
  };
  NB.actions['kop-logo-standaard'] = function () {
    kopLogoUrl = '';
    document.getElementById('kopLogo').src = ((d().kop || {}).standaard || {}).logo || '';
  };
  function naarPng(bestand) {
    return new Promise(function (ok, nee) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(function (b) { b ? ok(b) : nee(new Error('Het beeld kon niet omgezet worden.')); }, 'image/png');
      };
      img.onerror = function () { nee(new Error('Dit bestand is geen beeld dat de browser kan lezen.')); };
      img.src = URL.createObjectURL(bestand);
    });
  }

  NB.actions['kop-bewaar'] = async function () {
    try {
      var h = Object.assign({}, d().edition.header || {});
      var titel = document.getElementById('kopTitel').value.trim();
      var onder = document.getElementById('kopOndertitel').value.trim();
      var std = (d().kop || {}).standaard || {};
      // Leeg gelaten of gelijk aan de standaard = geen eigen tekst.
      if (titel && titel !== std.titel) h.titel = titel; else delete h.titel;
      if (onder && onder !== std.ondertitel) h.ondertitel = onder; else delete h.ondertitel;
      if (kopLogoUrl !== null) { if (kopLogoUrl) h.logo_url = kopLogoUrl; else delete h.logo_url; }
      await NB.api('/api/editions/' + d().edition.id, { method: 'PUT', body: { header: h } });
      var reden = document.getElementById('voetReden').value.trim();
      var regel = document.getElementById('voetRegel').value.trim();
      var s = d().series;
      if (reden !== (s.footer_reason || '') || regel !== (s.footer_line || '')) {
        await NB.api('/api/series/' + s.id, { method: 'PUT', body: { footer_reason: reden, footer_line: regel } });
      }
      NB.dialoog('dlgKop').close();
      NB.toast('Logo en teksten bewaard.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  function labels(doc) {
    doc = doc || briefDoc();
    if (!doc) return;
    doc.querySelectorAll('.nb-label,.nb-opm').forEach(function (x) { x.remove(); });
    doc.querySelectorAll('[data-nb-id]').forEach(function (rij) {
      var id = rij.getAttribute('data-nb-id');
      var it = itemVan(id);
      rij.classList.remove('nb-ander', 'nb-gekozen');
      if (!it) return;
      var l = labelVan(it);
      // Schrijver: enkel je eigen blokken zijn actief, de rest staat grijs.
      // De hoofdredactie mag elk blok schrijven (om voor te bereiden): niets grijs.
      if (schrijver() && !editor() && it.owner_user_id !== ik()) rij.classList.add('nb-ander');
      if (id === NB.state.paneelId) rij.classList.add('nb-gekozen');
      rij.title = NB.isAuto(it.kind) ? 'Vult zichzelf' : '';
      var cel = rij.firstElementChild;
      if (l && cel) {
        var el = doc.createElement('div');
        el.className = 'nb-label nb-label-' + l.soort;
        el.textContent = l.tekst;
        cel.appendChild(el);
      }
      opmTeller(doc, it, cel);
    });
    if (doc.body) doc.body.classList.toggle('nb-focus', !!NB.state.paneelId && !lezer());
    // Niet opnieuw opbouwen terwijl iemand in de brief typt: dan valt de cursor weg.
    var a = doc.activeElement;
    if (!(a && a.hasAttribute && a.hasAttribute('contenteditable'))) bewerkbaar(doc);
    handvatten(doc);
  }

  // ─── Hoofdredactie: slepen om te herordenen ──────────────────────────────

  /** Elk NIET gekozen blok een handvat (zichtbaar als je erover gaat); het gekozen blok heeft het in zijn werkbalk. */
  function handvatten(doc) {
    doc.querySelectorAll('.nb-greep-rij').forEach(function (x) { x.remove(); });
    if (!layout() || !actief()) return;
    doc.querySelectorAll('[data-nb-id]').forEach(function (rij) {
      var it = itemVan(rij.getAttribute('data-nb-id'));
      var cel = rij.firstElementChild;
      if (!it || !cel || it.id === NB.state.paneelId || isVast(it.kind)) return;
      var balk = doc.createElement('div');
      balk.className = 'nb-greep-rij';
      var g = doc.createElement('div');
      g.className = 'nb-greep-los';
      g.setAttribute('data-nb-greep', it.id);
      g.title = 'Sleep om te verplaatsen';
      var wie = !NB.isAuto(it.kind) && it.owner_name ? ' · ' + NB.voornaam(it.owner_name) : '';
      g.textContent = '⠿  ' + NB.blokNaam(it) + wie;
      balk.appendChild(g);
      cel.appendChild(balk);
    });
  }

  /**
   * Slepen met de muis (of een vinger) aan een handvat. Een blauwe lijn toont
   * waar het blok terechtkomt; loslaten bewaart de nieuwe volgorde. Aan de
   * rand van het vak scrolt het vak mee.
   */
  function koppelHerordenen(doc) {
    var sleep = null;
    var frame = function () { return document.getElementById('edVoorbeeld'); };
    var rol = function () {
      if (!sleep) return;
      var v = vak();
      var top = frame().getBoundingClientRect().top + sleep.y;
      if (v) {
        var r = v.getBoundingClientRect();
        if (top < r.top + 60) v.scrollTop -= 16;
        else if (top > r.bottom - 60) v.scrollTop += 16;
      }
      sleep.raf = requestAnimationFrame(rol);
    };
    doc.addEventListener('pointerdown', function (ev) {
      var g = ev.target.closest && ev.target.closest('[data-nb-greep]');
      if (!g || !layout()) return;
      ev.preventDefault();
      var rij = g.closest('[data-nb-id]');
      var lijn = doc.createElement('tr');
      lijn.className = 'nb-lijn';
      lijn.innerHTML = '<td><div></div></td>';
      sleep = { id: rij.getAttribute('data-nb-id'), rij: rij, lijn: lijn, voor: undefined, y: ev.clientY };
      rij.classList.add('nb-sleept');
      try { g.setPointerCapture(ev.pointerId); } catch (err) { /* niet erg */ }
      sleep.raf = requestAnimationFrame(rol);
    });
    doc.addEventListener('pointermove', function (ev) {
      if (!sleep) return;
      sleep.y = ev.clientY;
      var rijen = Array.prototype.filter.call(doc.querySelectorAll('[data-nb-id]'), function (r) { return r !== sleep.rij && !isVast((itemVan(r.getAttribute('data-nb-id')) || {}).kind); });
      var doel = null;
      for (var i = 0; i < rijen.length; i++) {
        var r = rijen[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { doel = rijen[i]; break; }
      }
      if (doel) doel.parentNode.insertBefore(sleep.lijn, doel);
      else if (rijen.length) rijen[rijen.length - 1].parentNode.insertBefore(sleep.lijn, rijen[rijen.length - 1].nextSibling);
      sleep.voor = doel ? doel.getAttribute('data-nb-id') : null;
      hoogteBij();
    });
    var los = async function () {
      if (!sleep) return;
      var s = sleep;
      sleep = null;
      cancelAnimationFrame(s.raf);
      s.rij.classList.remove('nb-sleept');
      s.lijn.remove();
      if (s.voor === undefined) return;
      var oud = d().items.map(function (i) { return i.id; });
      var ids = oud.filter(function (id) { return id !== s.id; });
      var plek = s.voor ? ids.indexOf(s.voor) : ids.length;
      ids.splice(plek < 0 ? ids.length : plek, 0, s.id);
      if (ids.join() === oud.join()) return;
      try {
        await NB.api('/api/editions/' + d().edition.id + '/order', { method: 'POST', body: { ids: ids } });
        herlaad();
      } catch (err) { NB.fout(err); }
    };
    doc.addEventListener('pointerup', los);
    doc.addEventListener('pointercancel', los);
  }

  // ─── Het gekozen blok: typen in de brief en de zwevende werkbalk ──────────

  function bewerkbaar(doc) {
    doc.querySelectorAll('[contenteditable]').forEach(function (x) { x.removeAttribute('contenteditable'); });
    doc.querySelectorAll('.nb-werkbalk,.nb-optie-weg,.nb-antwoord-bij').forEach(function (x) { x.remove(); });
    doc.querySelectorAll('[data-nb-beeld][data-nb-knop]').forEach(function (x) { x.removeAttribute('data-nb-knop'); });
    var s = NB.state.stukje;
    if (!s || !NB.state.concept || lezer() || !actief()) return;
    var rij = doc.querySelector('[data-nb-id="' + s.item.id + '"]');
    if (!rij) return;
    var soort = NB.state.concept.kind;
    var isVraag = VRAAG_KINDS.indexOf(soort) >= 0;
    // Schrijver: je eigen blokken (de hoofdredactie: elk blok). Layouter: geen tekst, wel een Titel-blok (structuur).
    var mag = s.can_edit && (schrijver() ? (editor() || s.item.owner_user_id === ik()) : soort === 'heading');
    var cel = rij.firstElementChild;

    if (mag) {
      try { doc.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) { /* oude browsers */ }
      rij.querySelectorAll('[data-nb-veld]').forEach(function (x) { x.setAttribute('contenteditable', 'true'); x.setAttribute('spellcheck', 'true'); });
      if (NB.kanBeeld(soort)) {
        rij.querySelectorAll('[data-nb-beeld]').forEach(function (x) { x.setAttribute('data-nb-knop', 'beeld'); x.title = 'Klik om het beeld aan te passen'; });
      }
      // Een video zonder beeld: de lege plek opent de videokiezer.
      rij.querySelectorAll('[data-nb-video]').forEach(function (x) { x.setAttribute('data-nb-knop', 'video'); x.style.cursor = 'pointer'; });
      if (isVraag) {
        var aantal = ((NB.state.concept.content || {}).options || []).length;
        var antwoorden = rij.querySelector('[data-nb-antwoorden]');
        if (antwoorden && aantal < 6) {
          var bij = doc.createElement('div');
          bij.className = 'nb-antwoord-bij';
          bij.setAttribute('data-nb-knop', 'optie-bij');
          bij.textContent = '+ Antwoord toevoegen';
          antwoorden.appendChild(bij);
        }
        if (aantal > 2) {
          rij.querySelectorAll('[data-nb-veld^="options."]').forEach(function (x) {
            var m = /^options\.(\d+)\.label$/.exec(x.getAttribute('data-nb-veld'));
            if (!m) return;
            var weg = doc.createElement('span');
            weg.className = 'nb-optie-weg';
            weg.setAttribute('data-nb-knop', 'optie-weg:' + m[1]);
            weg.setAttribute('contenteditable', 'false');
            weg.title = 'Dit antwoord weghalen';
            weg.textContent = '×';
            x.parentNode.insertBefore(weg, x.nextSibling);
          });
        }
      }
    }

    // De inhoudstafel gekozen: elke regel is typbaar (eigen titel voor die regel).
    if (soort === 'toc' && layout()) {
      rij.querySelectorAll('[data-nb-toc-titel]').forEach(function (x) { x.setAttribute('contenteditable', 'true'); x.setAttribute('spellcheck', 'true'); });
    }

    // De werkbalk: wat je snel doet met dit blok.
    var knoppen = [];
    // Layouter op een eigen blok: een snelle weg naar het schrijven.
    if (layout() && s.can_edit && soort !== 'heading' && !NB.isAuto(soort) && !(isVast(soort) && (NB.state.concept.content || {}).uit)) knoppen.push('<button type="button" data-nb-knop="schrijf" title="Naar de modus Schrijver om dit blok in te vullen">✎ Schrijven</button>');
    if (layout() && !isVast(soort)) knoppen.push('<span class="nb-greep" data-nb-greep="' + e(s.item.id) + '" title="Sleep om te verplaatsen">⠿</span>');
    if (mag && NB.kanAI(soort)) knoppen.push('<button type="button" data-nb-knop="ai">✨ Schrijf met AI</button>');
    if (mag && soort === 'heading') {
      var nuNiveau = (NB.state.concept.content || {}).niveau || 'h1';
      knoppen.push('<span class="nb-soorten">' + (NB.state.boot.titel_niveaus || []).map(function (n) {
        return '<button type="button" data-nb-knop="niveau:' + n.key + '"' + (n.key === nuNiveau ? ' class="nb-aan"' : '') + ' title="' + e(n.uitleg) + '">' + e(n.label) + '</button>';
      }).join('') + '</span>');
      knoppen.push('<button type="button" data-nb-knop="icoon">' + ((NB.state.concept.content || {}).icoon ? '\u270E Tekening' : '+ Tekening') + '</button>');
    }
    var subVeld = mag && rij.querySelector('[data-nb-op-vraag]:empty');
    if (subVeld) knoppen.push('<button type="button" data-nb-knop="subtitel">+ Subtitel</button>');
    if (mag && soort === 'video') knoppen.push('<button type="button" data-nb-knop="video">\u25B6 ' + (NB.state.concept.content && NB.state.concept.content.video_url ? 'Andere video' : 'Video kiezen') + '</button>');
    if (mag && NB.kanBeeld(soort) && (soort !== 'video' || (NB.state.concept.content && NB.state.concept.content.video_url))) knoppen.push('<button type="button" data-nb-knop="beeld">' + (rij.querySelector('[data-nb-beeld] img') ? '\u{1F5BC} Beeld' : '+ Beeld') + '</button>');
    if (mag && isVraag) {
      knoppen.push('<span class="nb-soorten">' + (NB.state.boot.vraag_soorten || []).map(function (v) {
        return '<button type="button" data-nb-knop="soort:' + v.kind + '"' + (v.kind === soort ? ' class="nb-aan"' : '') + ' title="' + e(v.uitleg) + '">' + e(v.label) + '</button>';
      }).join('') + '</span>');
    }
    if (layout()) {
      if (knoppen.length > 1) knoppen.push('<span class="nb-scheid"></span>');
      if (!isVast(soort)) {
        var lijst = d().items;
        var i = lijst.map(function (x) { return x.id; }).indexOf(s.item.id);
        var hoger = i > 0 && !vastBoven(lijst[i - 1]);
        var lager = i >= 0 && i < lijst.length - 1 && lijst[i + 1].kind !== 'closing';
        knoppen.push('<button type="button" data-nb-knop="omhoog" title="Hoger"' + (hoger ? '' : ' disabled') + '>↑</button>');
        knoppen.push('<button type="button" data-nb-knop="omlaag" title="Lager"' + (lager ? '' : ' disabled') + '>↓</button>');
      }
      var bg = (NB.state.concept.content || {}).achtergrond;
      knoppen.push('<button type="button" data-nb-knop="kleur" title="Achtergrondkleur van dit blok"><span class="nb-kleurbol" style="background:' + e(bg || '#ffffff') + '"></span></button>');
      // Elk blok kan weg, ook een dat zichzelf vult (agenda); enkel de vaste blokken hebben een schakelaar.
      if (!isVast(soort)) knoppen.push('<button type="button" class="nb-weg" data-nb-knop="weg" title="Uit de brief halen">\u{1F5D1}</button>');
    }
    // Een vast blok: een schakelaar aan/uit. Staat het uit, dan is dat het enige.
    if (isVast(soort) && layout()) {
      var aanStaat = !(NB.state.concept.content || {}).uit;
      if (!aanStaat) knoppen = [];
      else if (knoppen.length) knoppen.push('<span class="nb-scheid"></span>');
      knoppen.push('<button type="button" class="nb-schakel' + (aanStaat ? ' nb-op' : '') + '" data-nb-knop="aanuit" title="' + (aanStaat ? 'Staat aan: klik om uit te zetten (het blijft bewaard)' : 'Staat uit: klik om aan te zetten') + '"><i></i>' + (aanStaat ? 'Aan' : 'Uit') + '</button>');
    }
    if (knoppen.length) knoppen.push('<span class="nb-scheid"></span>');
    knoppen.push('<button type="button" class="nb-klaar" data-nb-knop="klaar" title="Klaar met dit blok (of klik ernaast, of Esc)">Klaar</button>');
    if (knoppen.length && cel) {
      var bar = doc.createElement('div');
      bar.className = 'nb-werkbalk';
      bar.innerHTML = knoppen.join('');
      cel.appendChild(bar);
    }
  }

  /**
   * Van bewerkte HTML terug naar de bewaarde tekst: **vet**, _cursief_,
   * ~~doorgehaald~~, [link](https://...), en per blok "- " / "1. " (lijst),
   * "> " (citaat), "### " (tussenkop) of "---" (lijn). Dezelfde vorm die
   * alineas() in render.js tekent; de opmaak zelf komt uit newsletters-opmaak.js.
   */
  function omhul(v, teken) {
    if (!v.trim()) return v;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(v);
    return m[1] + teken + m[2] + teken + m[3];
  }
  function inlineTekst(node) {
    var uit = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { uit += n.nodeValue.replace(/ /g, ' '); return; }
      if (n.nodeType !== 1) return;
      if (n.hasAttribute('data-nb-eiland')) return;
      var t = n.tagName;
      var stijl = (n.getAttribute('style') || '').toLowerCase();
      if (t === 'BR') uit += '\n';
      else if (t === 'STRONG' || t === 'B') uit += omhul(inlineTekst(n), '**');
      else if (t === 'EM' || t === 'I') uit += omhul(inlineTekst(n), '_');
      else if (t === 'S' || t === 'STRIKE' || t === 'DEL' || (t === 'SPAN' && /line-through/.test(stijl))) uit += omhul(inlineTekst(n), '~~');
      else if (t === 'A') { var h = n.getAttribute('href') || ''; var l = inlineTekst(n); uit += /^https?:\/\//.test(h) ? '[' + l + '](' + h + ')' : l; }
      else if (t === 'UL' || t === 'OL') {
        var nr = Number(n.getAttribute('start')) || 1;
        var regels = [];
        n.querySelectorAll('li').forEach(function (li) {
          var tekst = inlineTekst(li).replace(/\s*\n+\s*/g, ' ').trim();
          if (tekst) regels.push((t === 'UL' ? '- ' : (nr++) + '. ') + tekst);
        });
        uit += '\n\n' + regels.join('\n') + '\n\n';
      }
      else if (t === 'BLOCKQUOTE') {
        var q = inlineTekst(n).split('\n').map(function (r) { return r.trim(); }).filter(Boolean);
        if (q.length) uit += '\n\n' + q.map(function (r) { return '> ' + r; }).join('\n') + '\n\n';
      }
      else if (/^H[1-6]$/.test(t)) { var k = inlineTekst(n).replace(/\s+/g, ' ').trim(); if (k) uit += '\n\n### ' + k + '\n\n'; }
      else if (t === 'HR') uit += '\n\n---\n\n';
      else if (t === 'P' || t === 'DIV' || t === 'LI') uit += '\n\n' + inlineTekst(n) + '\n\n';
      else uit += inlineTekst(n);
    });
    return uit;
  }

  function htmlNaarTekst(el) {
    return inlineTekst(el).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * "Halve blok": de foto moet even hoog zijn als het hele blok, en dat hangt
   * af van de lengte van de tekst. Een mail kan niet zelf bijsnijden, dus na
   * elke nieuwe brief meten we de hoogte van de tekstkolom en snijden de foto
   * opnieuw bij als het verschil zichtbaar is. Enkel voor wie het blok bewerkt.
   */
  var kolomBezig = false;
  async function kolomPassen(doc) {
    var s = NB.state.stukje;
    var c = NB.state.concept;
    if (kolomBezig || !s || !c || !s.can_edit || c.kind !== 'intro') return;
    var b = c.content && c.content.beeld;
    if (!b || b.thingie || b.vulling !== 'vullen' || String(b.plaats).indexOf('kolom') !== 0) return;
    var rij = doc.querySelector('[data-nb-id="' + s.item.id + '"]');
    var beeldCel = rij && rij.querySelector('[data-nb-beeld]');
    var img = beeldCel && beeldCel.querySelector('img');
    if (!img) return;
    if (!img.complete) await new Promise(function (ok) { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', ok, { once: true }); });
    var tekstCel = Array.prototype.find.call(beeldCel.parentNode.children, function (x) { return x !== beeldCel; });
    if (!tekstCel || !img.offsetHeight) return;
    var h = tekstCel.offsetHeight;
    if (Math.abs(h - img.offsetHeight) < 16) return;
    var k = (NB.state.boot.beeld_kaders || {})[b.plaats];
    if (!k) return;
    kolomBezig = true;
    try {
      var url = await NB.beeld.snij(JSON.parse(JSON.stringify(b)), Math.max(0.35, Math.min(1.2, k.breedte / h)));
      if (NB.state.concept === c) NB.stukjeZet('content.beeld.uitsnede', url);
    } catch (err) { /* stil: dan blijft de vorige uitsnede staan */ }
    kolomBezig = false;
  }

  /** Waar een element in de brief op het scherm staat (de brief is een iframe). */
  function opScherm(el) {
    var f = document.getElementById('edVoorbeeld').getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { x: f.left + r.left, y: f.top + r.bottom };
  }

  function blokKnop(wat, anker) {
    var s = NB.state.stukje;
    if (wat === 'ai') NB.openAI();
    else if (wat === 'beeld') NB.openBeeld();
    else if (wat === 'video') NB.openVideo();
    else if (wat === 'subtitel') toonSubtitel(anker);
    else if (wat.indexOf('niveau:') === 0 && NB.zetNiveau) NB.zetNiveau(wat.slice(7));
    else if (wat === 'icoon' && NB.openIcoon) NB.openIcoon();
    else if (wat.indexOf('soort:') === 0 && NB.wisselVraagSoort) NB.wisselVraagSoort(wat.slice(6));
    else if (wat === 'optie-bij' && NB.vraagOptieBij) NB.vraagOptieBij();
    else if (wat.indexOf('optie-weg:') === 0 && NB.vraagOptieWeg) NB.vraagOptieWeg(Number(wat.slice(10)));
    else if (wat === 'omhoog' || wat === 'omlaag') verplaats(s.item.id, wat === 'omhoog' ? -1 : 1);
    else if (wat === 'kleur') kiesBlokKleur(s.item.id, anker);
    else if (wat === 'klaar') stapUit();
    else if (wat === 'schrijf') { var sid = s.item.id; NB.actions['modus']({ dataset: { modus: 'schrijf' } }).then(function () { return selecteer(sid); }).catch(NB.fout); }
    else if (wat.indexOf('opm:') === 0) { var oid = wat.slice(4); if (lezer()) kiesLees(oid); else NB.actions['modus']({ dataset: { modus: 'lees' } }).then(function () { kiesLees(oid); }); }
    else if (wat.indexOf('toclijn:') === 0) zetInToc(wat.slice(8));
    else if (wat.indexOf('toctitel-terug:') === 0) zetTocTitel(wat.slice(15), '');
    else if (wat === 'weg') NB.actions['blok-weg']({ dataset: { id: s.item.id } });
    else if (wat === 'aanuit') zetAan(s.item.id, !!(NB.state.concept.content || {}).uit);
  }

  /** "+ Subtitel": het lege veld tonen en erin zetten; leeg verlaten = weer weg. */
  function toonSubtitel(anker) {
    var rij = anker.closest('[data-nb-id]');
    var veld = rij && rij.querySelector('[data-nb-op-vraag]');
    if (!veld) return;
    veld.classList.add('nb-open');
    anker.remove();
    veld.focus();
    veld.addEventListener('blur', function () {
      if (!veld.textContent.trim()) veld.classList.remove('nb-open');
    }, { once: true });
    hoogteBij();
  }

  function kiesBlokKleur(id, anker) {
    var it = itemVan(id);
    if (!it) return;
    var p = opScherm(anker);
    NB.kleur.open({
      x: p.x, y: p.y, huidige: it.content && it.content.achtergrond,
      opKies: async function (kleur) {
        try {
          var bij = await NB.api('/api/contributions/' + id + '/achtergrond', { method: 'POST', body: { kleur: kleur } });
          it.content = bij.content;
          if (NB.state.stukje && NB.state.stukje.item.id === id) {
            NB.state.stukje.item.content = bij.content;
            if (NB.state.concept) NB.state.concept.content.achtergrond = bij.content.achtergrond;
          }
          laadBrief();
        } catch (err) { NB.fout(err); }
      },
    });
  }

  async function zetInToc(id) {
    var it = itemVan(id);
    if (!it) return;
    var aan = !NB.inToc(it, it.content);
    try {
      var bij = await NB.api('/api/contributions/' + id + '/in-toc', { method: 'POST', body: { in_toc: aan } });
      it.content = bij.content;
      if (NB.state.stukje && NB.state.stukje.item.id === id) {
        NB.state.stukje.item.content = bij.content;
        if (NB.state.concept) NB.state.concept.content.in_toc = aan;
      }
      laadBrief();
    } catch (err) { NB.fout(err); }
  }

  /** Eigen titel voor een regel in de inhoudstafel; '' = terug naar het origineel. */
  async function zetTocTitel(id, titel) {
    var it = itemVan(id);
    if (!it) return;
    try {
      var bij = await NB.api('/api/contributions/' + id + '/toc-titel', { method: 'POST', body: { titel: titel } });
      it.content = bij.content;
      if (NB.state.stukje && NB.state.stukje.item.id === id) {
        NB.state.stukje.item.content = bij.content;
        if (NB.state.concept) {
          if (bij.content.toc_titel) NB.state.concept.content.toc_titel = bij.content.toc_titel;
          else delete NB.state.concept.content.toc_titel;
        }
      }
      laadBrief();
    } catch (err) { NB.fout(err); }
  }

  async function verplaats(id, richting) {
    var ids = d().items.map(function (i) { return i.id; });
    var i = ids.indexOf(id);
    var j = i + richting;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    try {
      await bewaarOpen();
      await NB.api('/api/editions/' + d().edition.id + '/order', { method: 'POST', body: { ids: ids } });
      NB.state.scrolNa = id;
      herlaad();
    } catch (err) { NB.fout(err); }
  }

  // ─── Vak, hoogte, scrollen ────────────────────────────────────────────────

  function briefDoc() {
    var frame = document.getElementById('edVoorbeeld');
    return frame && frame.contentDocument;
  }

  function hoogteBij() {
    var frame = document.getElementById('edVoorbeeld');
    var doc = briefDoc();
    if (frame && doc) frame.style.height = (doc.documentElement.scrollHeight + 16) + 'px';
  }

  /** De "+"-lijnen tussen de blokken (en bovenaan): daar kan een nieuw blok komen. */
  function plusLijnen(doc) {
    doc.querySelectorAll('.nb-plus-lijn').forEach(function (x) { x.remove(); });
    if (!actief() || !layout()) return;
    var blokken = Array.prototype.slice.call(doc.querySelectorAll('[data-nb-id]'));
    var maak = function (na, altijd) {
      var tr = doc.createElement('tr');
      tr.className = 'nb-plus-lijn' + (altijd ? ' nb-altijd' : '');
      tr.setAttribute('data-na', na);
      tr.innerHTML = '<td><div class="nb-plus-in"><span class="nb-plus-knop" title="Hier iets toevoegen">+</span></div></td>';
      return tr;
    };
    if (!blokken.length) {
      var tabel = doc.querySelector('table table');
      if (tabel) (tabel.tBodies[0] || tabel).appendChild(maak('', true));
      hoogteBij();
      return;
    }
    // Niets boven of tussen de vaste blokken bovenaan, en niets na de afsluiting.
    if (!vastBoven(itemVan(blokken[0].getAttribute('data-nb-id')))) blokken[0].parentNode.insertBefore(maak(''), blokken[0]);
    blokken.forEach(function (rij, i) {
      var it = itemVan(rij.getAttribute('data-nb-id'));
      if (it && it.kind === 'closing') return;
      var volgende = blokken[i + 1] && itemVan(blokken[i + 1].getAttribute('data-nb-id'));
      if (vastBoven(it) && vastBoven(volgende)) return;
      rij.parentNode.insertBefore(maak(rij.getAttribute('data-nb-id')), rij.nextSibling);
    });
    hoogteBij();
  }

  function scrolNaarBlok(id) {
    var frame = document.getElementById('edVoorbeeld');
    var doc = briefDoc();
    var rij = doc && doc.querySelector('[data-nb-id="' + id + '"]');
    var v = vak();
    if (!frame || !rij) return;
    if (!v || window.innerWidth < 1024) {
      var y = frame.getBoundingClientRect().top + rij.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      return;
    }
    var top = frame.getBoundingClientRect().top + rij.getBoundingClientRect().top - v.getBoundingClientRect().top + v.scrollTop - 60;
    v.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ─── Een blok kiezen, sluiten, plaatsen ───────────────────────────────────

  async function bewaarOpen() {
    if (NB.state.vuil && NB.bewaarStukje) await NB.bewaarStukje();
    if (NB.state.inlineVuil) { NB.state.inlineVuil = false; laadBrief(); }
  }

  async function selecteer(id, vooraf) {
    if (NB.state.paneelId === id && NB.state.stukje && !vooraf) return;
    if (lezer()) { kiesLees(id); return; }
    var gekozen = itemVan(id);
    if (schrijver() && !editor() && gekozen && gekozen.owner_user_id !== ik()) {
      NB.toast(gekozen.owner_user_id ? 'Dit blok schrijft ' + (NB.voornaam(gekozen.owner_name) || 'een collega') + '. Kies "Lezer" om een opmerking te plaatsen.' : 'Dit blok is nog aan niemand toegewezen.', 'info');
      return;
    }
    await bewaarOpen();
    NB.state.paneelId = id;
    labels();
    var bak = document.getElementById('nbPaneel');
    if (!vooraf && bak) bak.innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div>';
    var data = vooraf || await NB.api('/api/contributions/' + id);
    if (NB.state.paneelId !== id) return;
    await NB.stukjeInPaneel(data);
    // Nu het stukje er is: bewerkbaar maken in de brief, met de werkbalk.
    labels();
    history.replaceState(null, '', '#/stukje/' + id);
    if (window.innerWidth < 1024 && bak) bak.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Uit het gekozen blok stappen (klik ernaast, Esc of "Klaar"). Wat getypt is, wordt bewaard. */
  function stapUit() {
    if (lezer()) { kiesLees(null); return; }
    if (!NB.state.paneelId) return;
    var doc = briefDoc();
    var a = doc && doc.activeElement;
    if (a && a.blur) a.blur();
    sluitPaneel().catch(NB.fout);
  }

  async function sluitPaneel() {
    await bewaarOpen();
    NB.state.paneelId = null;
    NB.state.stukje = null;
    NB.state.concept = null;
    history.replaceState(null, '', '#/editie/' + d().edition.id);
    labels();
    toonPaneel();
  }
  NB.sluitPaneel = sluitPaneel;

  /** Een nieuw blok op een gekozen plek (`na` = het blok waarna, '' = bovenaan). */
  async function plaats(body, na) {
    try {
      await bewaarOpen();
      body.after_id = na || '';
      var rij = await NB.api('/api/editions/' + d().edition.id + '/contributions', { method: 'POST', body: body });
      NB.state.scrolNa = rij.id;
      NB.toast(editor() ? 'Toegevoegd.' : 'Toegevoegd. Vul het in; marketing bevestigt het nog.', 'info');
      await herlaad({ open: rij.id });
    } catch (err) { NB.fout(err); }
  }

  /** Na een wijziging in het paneel: de brief en de stand bijwerken zonder herladen. */
  NB.stukjeBijgewerkt = function (item) {
    if (!NB.state.editie || !item) return;
    var it = itemVan(item.id);
    if (!it) return;
    ['status', 'title', 'kind', 'owner_user_id', 'content'].forEach(function (k) { if (item[k] !== undefined) it[k] = item[k]; });
    if (item.owner_name !== undefined) it.owner_name = item.owner_name;
    labels();
    tekenKop();
  };

  /** De stand van de editie (checklist, stappen, voortgang) opnieuw ophalen, zonder de brief te hertekenen. */
  NB.vernieuwStand = async function () {
    if (!d()) return;
    try {
      var data = await NB.api('/api/editions/' + d().edition.id);
      d().edition = data.edition;
      d().checklist = data.checklist;
      d().activity = data.activity;
      data.items.forEach(function (n) {
        var it = itemVan(n.id);
        if (it) ['status', 'title', 'owner_user_id', 'owner_name', 'kind'].forEach(function (k) { it[k] = n[k]; });
      });
      tekenKop();
      labels();
      if (!NB.state.paneelId) toonPaneel();
    } catch (err) { /* de stand is geen reden om te storen */ }
  };

  // ─── Iets toevoegen (het venster bij de "+"-lijn) ─────────────────────────

  function openToevoegen(na) {
    NB.state.plaatsNa = na === undefined || na === null ? laatstePlek() : na;
    NB.state.toevoegTab = NB.state.toevoegTab || 'blokken';
    tekenToevoegen();
    NB.dialoog('dlgToevoegen').showModal();
  }

  /** Zonder gekozen plek: net voor de afsluiting. */
  function laatstePlek() {
    var zonder = d().items.filter(function (i) { return i.kind !== 'closing'; });
    return zonder.length ? zonder[zonder.length - 1].id : '';
  }

  function tekenToevoegen() {
    var bak = document.getElementById('dlgToevoegenInhoud');
    var tab = NB.state.toevoegTab;
    var tabs = [['blokken', 'Blokken', 'layout-grid'], ['nieuws', 'Nieuws & updates', 'rss'], ['events', 'Events', 'calendar-days'], ['features', 'Productfeatures', 'blocks']];
    if (editor()) tabs.push(['voorraad', 'Voorraad', 'lightbulb']);
    var tabHtml = '<div role="tablist" class="tabs tabs-boxed w-fit mb-3">' + tabs.map(function (t) {
      return '<button role="tab" class="tab gap-1' + (tab === t[0] ? ' tab-active' : '') + '" data-action="toevoeg-tab" data-tab="' + t[0] + '"><i data-lucide="' + t[2] + '" class="w-3.5 h-3.5"></i> ' + e(t[1]) + '</button>';
    }).join('') + '</div>';
    var inhoud = '';
    if (tab === 'blokken') {
      var zichtbaar = SJABLONEN.filter(function (s) {
        if (s.enkelRedactie && !editor()) return false;
        if (s.eenmalig && d().items.some(function (i) { return i.kind === s.kind; })) return false;
        return true;
      });
      inhoud = GROEPEN.map(function (g) {
        var lijst = zichtbaar.filter(function (s) { return s.groep === g.key; });
        if (!lijst.length) return '';
        return '<div class="mb-3"><div class="text-[11px] font-semibold uppercase tracking-wide opacity-50 mb-1.5">' + e(g.naam) + '</div>'
          + '<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">' + lijst.map(function (s) {
            return '<button class="text-left rounded-lg border border-base-content/10 hover:border-primary/50 hover:bg-primary/5 px-2.5 py-2 flex gap-2 items-center min-w-0" data-action="toevoeg-blok" data-sjabloon="' + s.key + '">'
              + '<i data-lucide="' + s.icoon + '" class="w-4 h-4 text-primary shrink-0"></i>'
              + '<span class="min-w-0"><span class="block text-sm font-medium leading-tight truncate">' + e(s.naam) + '</span><span class="block text-[11px] opacity-60 leading-tight">' + e(s.uitleg) + '</span></span></button>';
          }).join('') + '</div></div>';
      }).join('');
    } else if (tab === 'nieuws') {
      if (NB.state.berichtenFout) {
        inhoud = '<div class="alert alert-warning text-sm flex-col items-start gap-2"><span><strong>De berichten konden niet geladen worden.</strong><br>' + e(NB.state.berichtenFout) + '</span><button class="btn btn-sm" data-action="toevoeg-berichten-opnieuw">Opnieuw proberen</button></div>';
      } else if (!NB.state.berichten) {
        inhoud = '<div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>';
        NB.laadBerichten().then(function () { if (NB.dialoog('dlgToevoegen').open) tekenToevoegen(); });
      } else {
        var al = d().items.filter(function (i) { return i.kind === 'snippet' && i.content && i.content.snippet_id; }).map(function (i) { return Number(i.content.snippet_id); });
        inhoud = NB.state.berichten.length
          ? '<p class="text-xs opacity-60 mb-2">Gepubliceerde berichten, nieuwste eerst. Eén klik zet het bericht groot in de brief; voor "Kort nieuws" kies je het blok bij Blokken.</p><div class="max-h-[50vh] overflow-y-auto">'
            + NB.state.berichten.map(function (b) {
              var erin = al.indexOf(Number(b.id)) >= 0;
              return '<div class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0"><div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">' + e(b.title) + '</div><div class="text-xs opacity-60">' + e(b.published_on ? NB.datum(b.published_on, { day: 'numeric', month: 'short', year: 'numeric' }) : '') + (b.type ? ' · ' + e(b.type) : '') + '</div></div>'
                + (erin ? '<span class="text-xs opacity-60">staat erin</span>' : '<button class="btn btn-xs btn-primary" data-action="toevoeg-bericht" data-id="' + b.id + '">In de brief</button>') + '</div>';
            }).join('') + '</div>'
          : '<p class="text-sm opacity-60">Geen gepubliceerde berichten gevonden.</p>';
      }
    } else if (tab === 'features') {
      if (NB.state.featuresFout) {
        inhoud = '<div class="alert alert-warning text-sm"><span><strong>De bibliotheek kon niet geladen worden.</strong><br>' + e(NB.state.featuresFout) + '</span></div>';
      } else if (!NB.state.features) {
        inhoud = '<div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>';
        NB.laadFeatures().then(function () { if (NB.dialoog('dlgToevoegen').open) tekenToevoegen(); });
      } else {
        var inBriefF = d().items.filter(function (i) { return i.kind === 'feature' && i.content && i.content.feature_id; }).map(function (i) { return i.content.feature_id; });
        var cats = (NB.state.boot.feature_categorieen || []);
        inhoud = NB.state.features.length
          ? '<p class="text-xs opacity-60 mb-2">Uit de bibliotheek Productfeatures: feitelijk, van globaal naar fijn. Eén klik zet de feature als kaart in de brief; de vorm kies je daarna in het paneel.</p><div class="max-h-80 overflow-y-auto">'
            + NB.state.features.map(function (f) {
              var erin = inBriefF.indexOf(f.id) >= 0;
              var cat = cats.filter(function (x) { return x.key === f.category; })[0];
              return '<div class="flex items-center gap-3 py-1.5 border-b border-base-content/10 last:border-0" style="padding-left:' + (f.diepte * 16) + 'px">'
                + '<span class="w-2 h-2 rounded-full shrink-0" style="background:' + (cat ? cat.kleur : '#9ca3af') + '" title="' + e(cat ? cat.label : '') + '"></span>'
                + '<div class="flex-1 min-w-0"><div class="text-sm ' + (f.diepte ? '' : 'font-semibold') + ' truncate">' + e(f.name) + '</div>' + (f.summary ? '<div class="text-xs opacity-60 truncate">' + e(f.summary) + '</div>' : '') + '</div>'
                + (erin ? '<span class="text-xs opacity-60">staat erin</span>' : '<button class="btn btn-xs btn-primary" data-action="toevoeg-feature" data-id="' + e(f.id) + '">In de brief</button>') + '</div>';
            }).join('') + '</div>'
          : '<p class="text-sm opacity-60">De bibliotheek is leeg. <a class="link" href="/productfeatures" target="_blank" rel="noopener">Open Productfeatures</a> om features toe te voegen.</p>';
      }
    } else if (tab === 'events') {
      var events = (d().suggesties && d().suggesties.events) || [];
      var inBrief = d().items.filter(function (i) { return i.kind === 'link' && i.content && i.content.event_id; }).map(function (i) { return Number(i.content.event_id); });
      inhoud = events.length
        ? '<p class="text-xs opacity-60 mb-2">Gepubliceerde events vanaf de verzenddag. <strong>Groot</strong> = een kaart met beeld, tekst en knop. Vink er meerdere aan voor kleine kaartjes <strong>naast elkaar</strong> (max. 3). De agenda-lijst kies je bij Blokken.</p>'
          + '<div class="max-h-80 overflow-y-auto">' + events.map(function (ev) {
            var erin = inBrief.indexOf(Number(ev.id)) >= 0;
            return '<label class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0 cursor-pointer"><input type="checkbox" class="checkbox checkbox-sm" data-change="event-vink" value="' + e(ev.id) + '">'
              + '<span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">' + e(ev.title) + '</span><span class="block text-xs opacity-60">' + e(NB.datum(ev.starts_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + (ev.location ? ' · ' + e(ev.location) : '') + '</span></span>'
              + (erin ? '<span class="text-xs opacity-60">staat erin</span>' : '<button type="button" class="btn btn-xs btn-primary" data-action="toevoeg-event" data-id="' + e(ev.id) + '">Groot</button>') + '</label>';
          }).join('') + '</div>'
          + '<div class="mt-3"><button class="btn btn-sm btn-primary" id="eventsNaast" data-action="toevoeg-events-naast" disabled><i data-lucide="columns-3" class="w-4 h-4"></i> Gekozen naast elkaar</button></div>'
        : '<p class="text-sm opacity-60">Geen gepubliceerde events in de zes weken na de verzenddag.</p>';
    } else {
      var pool = (d().suggesties && d().suggesties.pool) || [];
      inhoud = pool.length
        ? '<p class="text-xs opacity-60 mb-2">Ideeën van collega\'s die nog in geen editie staan.</p>' + pool.map(function (p) {
          return '<div class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0"><div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">' + e(p.title) + '</div>' + (p.raw_notes ? '<div class="text-xs opacity-60 truncate">' + e(p.raw_notes) + '</div>' : '') + '</div>'
            + '<button class="btn btn-xs btn-primary" data-action="toevoeg-idee" data-id="' + e(p.id) + '">Opnemen</button></div>';
        }).join('')
        : '<p class="text-sm opacity-60">De voorraad is leeg.</p>';
    }
    bak.innerHTML = '<h3 class="font-bold text-lg mb-1">Iets toevoegen</h3><p class="text-sm opacity-70 mb-3">Het komt op de plek van de "+" die je aanklikte. Verplaatsen kan nadien.</p>'
      + tabHtml + inhoud
      + '<div class="modal-action mt-3"><button class="btn btn-ghost btn-sm" data-action="sluit-dialoog" data-dialoog="dlgToevoegen">Sluiten</button></div>';
    NB.ikons();
  }

  NB.actions['toevoegen-open'] = function () { openToevoegen(undefined); };
  NB.actions['toevoeg-tab'] = function (el) { NB.state.toevoegTab = el.dataset.tab; tekenToevoegen(); };
  NB.actions['toevoeg-berichten-opnieuw'] = async function () { await NB.laadBerichten(true); tekenToevoegen(); };

  NB.actions['toevoeg-blok'] = function (el) {
    var sj = SJ[el.dataset.sjabloon];
    if (!sj) return;
    NB.dialoog('dlgToevoegen').close();
    return plaats({ kind: sj.kind, title: sj.titel, content: sj.inhoud || undefined }, NB.state.plaatsNa);
  };

  /** Een event als inhoud voor een kaart: datum, plaats en samenvatting, met het hero-beeld en de knop van het event. */
  function eventInhoud(ev) {
    var wanneer = NB.datum(ev.starts_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return {
      event_id: Number(ev.id), title: ev.title, url: ev.url, site_name: 'Event',
      text: wanneer + (ev.location ? ' · ' + ev.location : '') + (ev.summary ? '\n\n' + ev.summary : ''),
      image_url: ev.image_url || '', link_label: ev.cta || 'Inschrijven',
      beeld: ev.image_url ? { url: ev.image_url, plaats: 'link', vulling: 'vullen', focus: { x: 0.5, y: 0.5 } } : undefined,
    };
  }
  function eventVan(id) { return ((d().suggesties && d().suggesties.events) || []).filter(function (x) { return Number(x.id) === Number(id); })[0]; }

  /** Vaste blokken aan of uit (paneel): aan = op zijn vaste plek, uit = weghalen. */
  NB.changes['vast-blok'] = async function (el) {
    var kind = el.dataset.kind;
    var it = d().items.filter(function (i) { return i.kind === kind; })[0];
    if (it) await zetAan(it.id, el.checked);
    else if (el.checked) {
      var sj = SJABLONEN.filter(function (x) { return x.kind === kind && x.groep === 'vast'; })[0];
      if (sj) await plaats({ kind: kind, title: sj.titel, content: sj.inhoud || undefined }, '');
    }
  };

  NB.changes['event-vink'] = function () {
    var n = document.querySelectorAll('#dlgToevoegen input[data-change="event-vink"]:checked').length;
    var knop = document.getElementById('eventsNaast');
    if (knop) { knop.disabled = n < 2 || n > 3; knop.title = n > 3 ? 'Hoogstens drie naast elkaar' : ''; }
  };

  NB.actions['toevoeg-event'] = async function (el) {
    var ev = eventVan(el.dataset.id);
    if (!ev) return;
    el.disabled = true;
    NB.dialoog('dlgToevoegen').close();
    await plaats({ kind: 'link', title: 'Event in de kijker', content: eventInhoud(ev) }, NB.state.plaatsNa);
  };

  NB.actions['toevoeg-events-naast'] = async function () {
    var gekozen = Array.prototype.slice.call(document.querySelectorAll('#dlgToevoegen input[data-change="event-vink"]:checked')).map(function (x) { return eventVan(x.value); }).filter(Boolean).slice(0, 3);
    if (gekozen.length < 2) return;
    NB.dialoog('dlgToevoegen').close();
    await plaats({
      kind: 'news', title: 'Kom ons ontmoeten',
      content: { vorm: 'kolommen', heading: 'Kom ons ontmoeten', items: gekozen.map(function (ev) {
        return { title: ev.title, url: ev.url, source: NB.datum(ev.starts_at, { day: 'numeric', month: 'short' }), note: NB.datum(ev.starts_at, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (ev.location ? ' · ' + ev.location : ''), beeld_url: ev.image_url || '' };
      }) },
    }, NB.state.plaatsNa);
  };

  /** Een productfeature als blok: een kopie van de bibliotheek, in een vorm die nog niet in de brief staat. */
  NB.actions['toevoeg-feature'] = async function (el) {
    var f = (NB.state.features || []).filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!f) return;
    el.disabled = true;
    var gebruikt = d().items.filter(function (i) { return i.kind === 'feature'; }).map(function (i) { return (i.content || {}).vorm || 'kaart'; });
    var vormen = ((NB.state.boot.feature_vormen || []).map(function (v) { return v.key; })).filter(function (v) { return v !== 'lijst'; });
    var vorm = vormen.filter(function (v) { return gebruikt.indexOf(v) < 0; })[0] || vormen[gebruikt.length % Math.max(1, vormen.length)] || 'kaart';
    NB.dialoog('dlgToevoegen').close();
    await plaats({
      kind: 'feature', title: f.eyebrow || 'Functionaliteit',
      content: {
        feature_id: f.id, vorm: vorm, eyebrow: f.eyebrow || '', title: f.name, summary: f.summary || '', why: f.why || '',
        usps: f.usps || [], url: f.url || '', link_label: 'Meer over deze functie', image_url: f.image_url || '',
        toon_usps: true, toon_why: Boolean(f.why),
      },
    }, NB.state.plaatsNa);
  };

  NB.actions['toevoeg-bericht'] = async function (el) {
    el.disabled = true;
    try {
      var vermijd = d().items.filter(function (i) { return i.kind === 'snippet'; }).map(function (i) { return (i.content && i.content.tag) || i.title; }).filter(Boolean);
      var inhoud = await NB.berichtInhoud(el.dataset.id, vermijd);
      var gebruikt = d().items.filter(function (i) { return i.kind === 'snippet' && i.content && i.content.snippet_id; }).map(function (i) { return i.content.vorm || 'klassiek'; });
      var vormen = ['klassiek', 'kaart', 'compact', 'uitgelicht'];
      inhoud.vorm = vormen.find(function (v) { return gebruikt.indexOf(v) < 0; }) || vormen[gebruikt.length % vormen.length];
      NB.dialoog('dlgToevoegen').close();
      await plaats({ kind: 'snippet', title: 'Interessant voor jou', content: inhoud }, NB.state.plaatsNa);
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  NB.actions['toevoeg-idee'] = function (el) {
    NB.dialoog('dlgToevoegen').close();
    return plaats({ from_pool_id: el.dataset.id }, NB.state.plaatsNa);
  };

  // ─── De antwoorden op de vragen (venster) ─────────────────────────────────

  NB.actions['open-antwoorden'] = async function () {
    var bak = document.getElementById('dlgAntwoordenInhoud');
    bak.innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div>';
    NB.dialoog('dlgAntwoorden').showModal();
    try {
      var r = await NB.api('/api/editions/' + d().edition.id + '/answers');
      var vragen = r.questions.map(function (q) {
        var max = Math.max(1, q.total);
        return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-2">'
          + '<div class="text-xs font-bold uppercase tracking-wide text-primary">' + e(q.title) + '</div>'
          + '<div class="font-semibold">' + e(q.question) + '</div>'
          + q.options.map(function (o) {
            var n = q.counts[o.value] || 0;
            var pct = Math.round((n / max) * 100);
            return '<div><div class="flex justify-between text-sm"><span>' + e(o.label) + '</span><span class="opacity-60">' + n + ' · ' + pct + '%</span></div>'
              + '<progress class="progress progress-primary w-full" value="' + pct + '" max="100"></progress></div>';
          }).join('')
          + '<div class="text-xs opacity-60">' + q.total + ' antwoorden · ' + q.with_comment + ' met toelichting · ' + q.anonymous + ' anoniem</div>'
          + '</div></div>';
      }).join('');
      var titels = {};
      r.questions.forEach(function (q) { titels[q.id] = q; });
      var rijen = r.answers.map(function (a) {
        var q = titels[a.contribution_id] || { options: [] };
        var opt = (q.options || []).find(function (o) { return o.value === a.option_value; });
        var odoo = !a.verified ? 'anoniem, niet naar Odoo' : a.push_error ? 'fout: ' + a.push_error : a.pushed_at ? (r.integration_active ? 'naar Odoo via de koppeling' : 'bewaard; de koppeling staat uit, niets in Odoo') : 'wacht (10 min)';
        return '<tr><td>' + (a.contact ? '<div class="font-medium">' + e(a.contact.name) + '</div><div class="text-xs opacity-60">' + e(a.contact.email) + '</div>' : '<span class="opacity-60">Anoniem</span>') + '</td>'
          + '<td>' + e(q.title || '') + '</td><td><span class="badge badge-sm">' + e(opt ? opt.label : a.option_value) + '</span></td>'
          + '<td class="max-w-xs">' + e(a.comment || '') + '</td><td class="text-xs whitespace-nowrap">' + e(NB.datum(a.updated_at)) + '</td><td class="text-xs">' + e(odoo) + '</td></tr>';
      }).join('');
      bak.innerHTML = '<h3 class="font-bold text-lg mb-3">Antwoorden op de vragen in de mail</h3>'
        + (r.questions.length
          ? '<div class="grid gap-3 md:grid-cols-2 mb-4">' + vragen + '</div>'
            + '<p class="text-xs opacity-70 mb-3">Elk antwoord wordt hier geteld en bewaard. ' + (r.integration_id
              ? 'Wat er in Odoo mee gebeurt, regel je in <a class="link" href="/forminator-v2" target="_blank" rel="noopener">Koppelingen</a>, tabblad "Nieuwsbrief-antwoorden"' + (r.integration_active ? ' (staat aan).' : ' (staat uit: er gebeurt niets in Odoo).')
              : 'Bij het eerste antwoord komt er in Koppelingen een koppeling "Nieuwsbrief-antwoorden" bij, die uit staat tot marketing ze aanzet.') + '</p>'
            + '<div class="overflow-x-auto bg-base-100 rounded-xl border border-base-content/10"><table class="table table-sm"><thead><tr><th>Wie</th><th>Vraag</th><th>Antwoord</th><th>Toelichting</th><th>Wanneer</th><th>Odoo</th></tr></thead><tbody>'
            + (rijen || '<tr><td colspan="6" class="opacity-60">Nog geen antwoorden.</td></tr>') + '</tbody></table></div>'
          : '<p class="opacity-60">Deze editie heeft geen vragen.</p>')
        + '<div class="modal-action"><button class="btn btn-ghost btn-sm" data-action="sluit-dialoog" data-dialoog="dlgAntwoorden">Sluiten</button></div>';
    } catch (err) { bak.innerHTML = '<div class="alert alert-error text-sm">' + e(err.message) + '</div>'; }
  };

  // ─── Het scherm ───────────────────────────────────────────────────────────

  function laadLijsten() {
    if (NB.state.lijsten !== undefined) return Promise.resolve();
    return NB.api('/api/mailing-lists').then(function (r) { NB.state.lijsten = r; }).catch(function () { NB.state.lijsten = null; });
  }

  /**
   * params.id     de editie
   * params.stukje (optioneel) een al geladen stukje om meteen te openen
   * params.open   (optioneel) id van een stukje om meteen te openen
   */
  NB.views.editie = async function (params) {
    var app = document.getElementById('app');
    var data = await NB.api('/api/editions/' + params.id);
    NB.state.editie = data;
    if (data.series.is_editor) {
      try { data.suggesties = await NB.api('/api/editions/' + params.id + '/suggestions'); } catch (err) { data.suggesties = null; }
      laadLijsten().then(function () { if (!NB.state.paneelId) toonPaneel(); });
    }
    if (NB.state.paneelEditie !== params.id) { NB.state.paneelId = null; NB.state.modus = null; NB.state.leesId = null; }
    NB.state.paneelEditie = params.id;
    NB.state.stukje = null;
    NB.state.concept = null;
    var open = params.stukje ? params.stukje.item.id : (params.open || NB.state.paneelId);
    if (open && !itemVan(open)) open = null;
    // Een eigen blok openen (bv. vanuit "Voor jou"): meteen in de modus Schrijver.
    if (!NB.state.modus && open && itemVan(open).owner_user_id === ik()) NB.state.modus = 'schrijf';
    NB.state.paneelId = null;

    // Dezelfde editie staat er al (na een wijziging): niets afbreken, enkel bijwerken.
    if (document.getElementById('edVoorbeeld') && document.getElementById('nbKop')) {
      tekenKop();
      if (open && !lezer()) await selecteer(open, params.stukje || null).catch(function (err) { NB.fout(err); toonPaneel(); });
      else toonPaneel();
      laadBrief();
      return;
    }
    app.innerHTML = '<div class="nb-werkvenster">'
      + '<header id="nbKop" class="nb-kop">' + kop() + '</header>'
      + '<div class="nb-werkvlak">'
      + '<div id="nbBriefvak" class="nb-briefvak"><div id="nbBriefkader" class="nb-briefkader' + (NB.state.toestel === 'gsm' ? ' nb-gsm' : '') + '"><iframe id="edVoorbeeld" class="nb-voorbeeld" title="De nieuwsbrief"></iframe></div></div>'
      + '<aside id="nbPaneel" class="nb-regie"></aside>'
      + '</div></div>';
    NB.ikons();
    // Klikken in de lege ruimte naast de brief = uit het blok stappen.
    document.getElementById('nbBriefvak').addEventListener('click', function (ev) {
      if (ev.target.id === 'nbBriefvak' || ev.target.id === 'nbBriefkader') stapUit();
    });
    if (open && !lezer()) {
      await selecteer(open, params.stukje || null).catch(function (err) { NB.fout(err); toonPaneel(); });
    } else {
      toonPaneel();
    }
    laadBrief();
  };

  async function herlaad(opties) {
    opties = opties || {};
    await bewaarOpen();
    var open = opties.open !== undefined ? opties.open : NB.state.paneelId;
    var v = vak();
    if (v && !NB.state.scrolNa) NB.state.vakScroll = v.scrollTop;
    await NB.views.editie({ id: d().edition.id, open: open });
  }
  NB.herlaadEditie = herlaad;

  // Een smaller of breder venster maakt de brief langer of korter.
  var maatTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(maatTimer);
    maatTimer = setTimeout(hoogteBij, 150);
  });

  // ─── Acties ───────────────────────────────────────────────────────────────

  NB.actions['ga'] = function (el) { NB.ga(el.dataset.hash); };

  NB.actions['modus'] = async function (el) {
    var m = el.dataset.modus;
    if (m === 'layout' && !editor()) return;
    if (m === modus()) return;
    await bewaarOpen();
    NB.state.modus = m;
    NB.state.leesId = null;
    NB.state.paneelId = null;
    NB.state.stukje = null;
    NB.state.concept = null;
    history.replaceState(null, '', '#/editie/' + d().edition.id);
    tekenKop();
    toonPaneel();
    laadBrief();
  };

  // ─── Lezer: opmerkingen per blok ─────────────────────────────────────────

  /** Opmerkingen zijn zichtbaar voor iedereen met de module (2026-10-20). */
  function ziet(it) { return !!it; }

  /** Een klein bolletje met het aantal opmerkingen (enkel voor wie ze mag zien). */
  function opmTeller(doc, it, cel) {
    var n = it && it.comment_count;
    if (!n || !cel || !ziet(it)) return;
    var b = doc.createElement('div');
    b.className = 'nb-opm';
    b.setAttribute('data-nb-knop', 'opm:' + it.id);
    b.title = n + (n === 1 ? ' open opmerking' : ' open opmerkingen') + ': klik om te lezen';
    b.textContent = '💬 ' + n;
    cel.appendChild(b);
  }

  /** Lezer: het gekozen blok in de focus, en de tellers op de blokken. */
  function markeerLees(doc) {
    if (!doc || !doc.body) return;
    doc.querySelectorAll('.nb-opm').forEach(function (x) { if (lezer()) x.remove(); });
    if (!lezer()) return;
    // Lezer: nooit iets grijs, ook niet tijdens het reageren; het gekozen blok krijgt enkel een labeltje.
    doc.body.classList.remove('nb-focus');
    doc.querySelectorAll('[data-nb-lees]').forEach(function (rij) {
      var id = rij.getAttribute('data-nb-lees');
      rij.classList.toggle('nb-gekozen', id === NB.state.leesId);
      opmTeller(doc, itemVan(id), rij.firstElementChild);
    });
  }

  async function kiesLees(id) {
    if (!lezer()) return;
    if (!id && !NB.state.leesId) return;
    NB.state.leesId = id || null;
    NB.state.leesOpm = null;
    markeerLees(briefDoc());
    toonPaneel();
    if (!id) return;
    try {
      NB.state.leesOpm = await NB.api('/api/contributions/' + id + '/comments');
    } catch (err) { NB.state.leesOpm = []; NB.fout(err); }
    if (NB.state.leesId === id) toonPaneel();
  }

  function leesPaneel() {
    var id = NB.state.leesId;
    var it = id && itemVan(id);
    if (!it) {
      var met = d().items.filter(function (i) { return i.comment_count && ziet(i); });
      return '<div class="flex flex-col gap-3">' + kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="message-square" class="w-4 h-4"></i> Lezen en reageren</h3>'
        + '<p class="text-sm opacity-70">Je ziet de mail zoals de lezer ze krijgt. Klik op een blok om er een opmerking bij te plaatsen. Je opmerking zien de hoofdredactie en wie het blok schrijft.</p>'
        + (met.length ? '<div>' + met.map(function (i) { return blokRij(i, '<span class="badge badge-sm badge-ghost">💬 ' + i.comment_count + '</span>').replace('data-action="kies-blok"', 'data-action="lees-blok"'); }).join('') + '</div>' : '')) + '</div>';
    }
    var lijst = NB.state.leesOpm;
    var eenOpm = function (m) {
      var af = !!m.resolved_at;
      return '<div class="flex gap-2' + (af ? ' opacity-50' : '') + '">' + NB.gezicht(m.user_name)
        + '<div class="bg-base-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-0"><div class="flex items-start gap-2"><div class="flex-1 min-w-0"><strong>' + e(NB.voornaam(m.user_name)) + '</strong> <span class="opacity-50 text-xs">' + e(NB.datum(m.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span></div>'
        + '<label class="flex items-center gap-1 text-xs cursor-pointer shrink-0" title="' + (af ? 'Terug openzetten' : 'Afvinken als opgelost') + '"><input type="checkbox" class="checkbox checkbox-xs checkbox-success" data-change="opm-opgelost" data-id="' + e(m.id) + '"' + (af ? ' checked' : '') + '>Opgelost</label></div>'
        + '<div class="whitespace-pre-line break-words' + (af ? ' line-through' : '') + '">' + metVermeldingen(m.body) + '</div>'
        + (af && m.resolved_name ? '<div class="text-xs opacity-70 mt-1">Afgevinkt door ' + e(NB.voornaam(m.resolved_name)) + '</div>' : '') + '</div></div>';
    };
    var open = (lijst || []).filter(function (m) { return !m.resolved_at; });
    var af = (lijst || []).filter(function (m) { return m.resolved_at; });
    var opm = lijst === null || lijst === undefined
      ? '<div class="flex justify-center py-4"><span class="loading loading-spinner loading-sm"></span></div>'
      : lijst.length
        ? open.map(eenOpm).join('') + (af.length ? '<details class="text-sm"' + (open.length ? '' : ' open') + '><summary class="cursor-pointer text-xs opacity-60 py-1">' + af.length + ' opgelost</summary><div class="flex flex-col gap-3 mt-2">' + af.map(eenOpm).join('') + '</div></details>' : '')
        : '<p class="text-sm opacity-60">Nog geen opmerkingen bij dit blok.</p>';
    return '<div class="flex flex-col gap-3">' + kaart('<div class="flex items-center gap-2"><h3 class="font-semibold flex-1 min-w-0 truncate">' + e(NB.blokNaam(it)) + '</h3><button class="btn btn-ghost btn-xs btn-square" data-action="lees-sluit" title="Sluiten (Esc)"><i data-lucide="x" class="w-4 h-4"></i></button></div>'
      + '<p class="text-xs opacity-60">Iedereen ziet de opmerkingen en kan ze afvinken. Typ <strong>@</strong> om een collega te vermelden: die krijgt een taak in Projecten.</p>'
      + '<div class="flex flex-col gap-3">' + opm + '</div>'
      + '<div class="relative"><textarea id="leesOpmerking" class="textarea textarea-bordered textarea-sm w-full mt-1" rows="3" placeholder="Wat valt je op? Een vraag, een fout, een idee… (@ om iemand te vermelden)"></textarea>'
      + '<div id="leesNoem" class="hidden absolute left-0 right-0 z-20 mt-1 bg-base-100 border border-base-content/10 rounded-xl shadow-lg p-1 max-h-56 overflow-y-auto"></div></div>'
      + '<button class="btn btn-sm btn-primary self-end" data-action="lees-plaats">Plaatsen</button>') + '</div>';
  }

  /** "@Naam" in een opmerking in het blauw, als die naam een collega is. */
  function metVermeldingen(tekst) {
    var html = e(tekst);
    var namen = (NB.state.boot.users || []).map(function (u) { return String(u.name || '').trim(); }).filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; });
    namen.forEach(function (n) {
      var veilig = e(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp('@' + veilig, 'gi'), function (m) { return '<span class="text-primary font-semibold">' + m + '</span>'; });
    });
    return html;
  }

  /** De keuzelijst bij "@": collega's die beginnen met wat je typt. */
  var noemKeuze = 0;
  function noemZoek() {
    var ta = document.getElementById('leesOpmerking');
    var bak = document.getElementById('leesNoem');
    if (!ta || !bak) return null;
    var voor = ta.value.slice(0, ta.selectionStart);
    var m = /(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/.exec(voor);
    if (!m) { bak.classList.add('hidden'); return null; }
    var q = m[2].toLowerCase();
    var lijst = (NB.state.boot.users || []).filter(function (u) {
      var n = String(u.name || '').toLowerCase();
      return n && (n.indexOf(q) === 0 || n.split(/\s+/).some(function (w) { return w.indexOf(q) === 0; }));
    }).slice(0, 6);
    if (!lijst.length) { bak.classList.add('hidden'); return null; }
    if (noemKeuze >= lijst.length) noemKeuze = 0;
    bak.innerHTML = lijst.map(function (u, i) {
      return '<button type="button" class="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm' + (i === noemKeuze ? ' bg-base-200' : ' hover:bg-base-200') + '" data-action="lees-noem" data-naam="' + e(u.name) + '">' + NB.gezicht(u.name) + '<span class="truncate">' + e(u.name) + '</span></button>';
    }).join('');
    bak.classList.remove('hidden');
    return { start: voor.length - m[2].length - 1, lijst: lijst };
  }
  function noemKies(naam) {
    var ta = document.getElementById('leesOpmerking');
    if (!ta) return;
    var z = noemZoek();
    if (!z) return;
    var na = ta.value.slice(ta.selectionStart);
    ta.value = ta.value.slice(0, z.start) + '@' + naam + ' ' + na;
    var pos = z.start + naam.length + 2;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    document.getElementById('leesNoem').classList.add('hidden');
  }
  function koppelNoemen() {
    var ta = document.getElementById('leesOpmerking');
    if (!ta || ta.dataset.gekoppeld) return;
    ta.dataset.gekoppeld = '1';
    ta.addEventListener('input', function () { noemKeuze = 0; noemZoek(); });
    ta.addEventListener('keydown', function (ev) {
      var bak = document.getElementById('leesNoem');
      if (!bak || bak.classList.contains('hidden')) return;
      var z = noemZoek();
      if (!z) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); noemKeuze = (noemKeuze + (ev.key === 'ArrowDown' ? 1 : z.lijst.length - 1)) % z.lijst.length; noemZoek(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); noemKies(z.lijst[noemKeuze].name); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); bak.classList.add('hidden'); }
    });
    ta.addEventListener('blur', function () { setTimeout(function () { var bak = document.getElementById('leesNoem'); if (bak) bak.classList.add('hidden'); }, 150); });
  }
  NB.actions['lees-noem'] = function (el) { noemKies(el.dataset.naam); };

  NB.changes['opm-opgelost'] = async function (el) {
    var id = el.dataset.id;
    try {
      var bij = await NB.api('/api/comments/' + id + '/opgelost', { method: 'POST', body: { opgelost: el.checked } });
      (NB.state.leesOpm || []).forEach(function (m) { if (m.id === id) { m.resolved_at = bij.resolved_at; m.resolved_by = bij.resolved_by; m.resolved_name = bij.resolved_name; } });
      var it = itemVan(NB.state.leesId);
      if (it) it.comment_count = (NB.state.leesOpm || []).filter(function (m) { return !m.resolved_at; }).length;
      toonPaneel();
      markeerLees(briefDoc());
    } catch (err) { el.checked = !el.checked; NB.fout(err); }
  };

  NB.actions['lees-blok'] = function (el) { kiesLees(el.dataset.id); };
  NB.actions['lees-sluit'] = function () { kiesLees(null); };
  NB.actions['lees-plaats'] = async function () {
    var veld = document.getElementById('leesOpmerking');
    var tekst = veld ? veld.value.trim() : '';
    var id = NB.state.leesId;
    if (!tekst || !id) return;
    try {
      var c = await NB.api('/api/contributions/' + id + '/comments', { method: 'POST', body: { body: tekst } });
      (NB.state.leesOpm = NB.state.leesOpm || []).push(c);
      var it = itemVan(id);
      if (it) it.comment_count = (it.comment_count || 0) + 1;
      var n = (c.vermeld || []).length;
      NB.toast(n ? 'Opmerking geplaatst. ' + (n === 1 ? 'De vermelde collega krijgt' : 'De ' + n + ' vermelde collega\'s krijgen') + ' een taak in Projecten.' : 'Opmerking geplaatst.', 'info');
      toonPaneel();
      markeerLees(briefDoc());
    } catch (err) { NB.fout(err); }
  };

  NB.actions['toestel'] = function (el) {
    NB.state.toestel = el.dataset.toestel === 'gsm' ? 'gsm' : 'desktop';
    var kader = document.getElementById('nbBriefkader');
    if (kader) kader.classList.toggle('nb-gsm', NB.state.toestel === 'gsm');
    tekenKop();
    setTimeout(hoogteBij, 250);
  };

  NB.actions['kies-blok'] = function (el) {
    var id = el.dataset.id;
    return selecteer(id).then(function () { scrolNaarBlok(id); });
  };

  NB.actions['focus-onderwerp'] = function () {
    var inp = document.getElementById('edOnderwerp');
    if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  NB.actions['paneel-sluit'] = function () { return sluitPaneel(); };

  /** Testmail: eerst kiezen welke collega's ze krijgen (onthouden per browser). */
  NB.actions['test-versturen'] = async function () {
    var bak = document.getElementById('testOntvangers');
    bak.innerHTML = '<div class="flex justify-center py-6"><span class="loading loading-spinner"></span></div>';
    NB.dialoog('dlgTest').showModal();
    try {
      var lijst = await NB.api('/api/test-ontvangers');
      var onthouden = null;
      try { onthouden = JSON.parse(localStorage.getItem('nbTestAdressen') || 'null'); } catch (err) { onthouden = null; }
      var aan = function (x) { return onthouden ? onthouden.indexOf(x.email) >= 0 : (x.standaard || x.mij); };
      bak.innerHTML = lijst.length ? lijst.map(function (x) {
        return '<label class="label cursor-pointer justify-start gap-3 py-1.5"><input type="checkbox" class="checkbox checkbox-sm" value="' + e(x.email) + '"' + (aan(x) ? ' checked' : '') + '>'
          + '<span class="label-text">' + e(x.name) + (x.mij ? ' (jij)' : '') + '</span><span class="text-xs opacity-50 truncate">' + e(x.email) + '</span></label>';
      }).join('') : '<p class="text-sm opacity-60">Geen collega\'s gevonden.</p>';
    } catch (err) { bak.innerHTML = '<div class="alert alert-error text-sm">' + e(err.message) + '</div>'; }
  };

  NB.actions['test-bevestig'] = async function (el) {
    var emails = Array.prototype.slice.call(document.querySelectorAll('#testOntvangers input:checked')).map(function (i) { return i.value; });
    if (!emails.length) { NB.toast('Vink minstens één collega aan.', 'warning'); return; }
    try { localStorage.setItem('nbTestAdressen', JSON.stringify(emails)); } catch (err) { /* geen opslag */ }
    el.disabled = true;
    el.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Versturen…';
    try {
      await bewaarOpen();
      var r = await NB.api('/api/editions/' + d().edition.id + '/test', { method: 'POST', body: { emails: emails } });
      NB.dialoog('dlgTest').close();
      NB.toast('Testmail ' + (r.queued ? 'in de wachtrij van Odoo' : 'verstuurd') + ' naar ' + r.to.join(', ') + '.');
      if (!r.token_field) NB.toast('Het Studio-veld x_studio_om_token ontbreekt: antwoorden op vragen tellen als anoniem.', 'warning');
      if (r.beeld_problemen && r.beeld_problemen.length) NB.toast(r.beeld_problemen.length + ' beeld(en) konden niet klaargezet worden en staan misschien gebroken in de mail. Laad ze opnieuw op als PNG of JPEG.', 'warning');
      NB.vernieuwStand();
    } catch (err) { NB.fout(err); }
    el.disabled = false;
    el.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Versturen';
    NB.ikons();
  };

  NB.actions['herinner'] = async function () {
    try {
      await NB.api('/api/editions/' + d().edition.id + '/remind', { method: 'POST' });
      NB.toast('Herinnering in de chat gezet.');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['bewaar-datums'] = async function () {
    try {
      await NB.api('/api/editions/' + d().edition.id, {
        method: 'PUT',
        body: NB.isBlanco(d().edition)
          ? { send_at: NB.vanLokaal(document.getElementById('edSend').value) }
          : { deadline_at: NB.vanLokaal(document.getElementById('edDeadline').value), send_at: NB.vanLokaal(document.getElementById('edSend').value) },
      });
      NB.toast('Datums bewaard.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['bewaar-onderwerp'] = async function () {
    try {
      var bij = await NB.api('/api/editions/' + d().edition.id, {
        method: 'PUT',
        body: { subject: document.getElementById('edOnderwerp').value, preheader: document.getElementById('edPreheader').value },
      });
      Object.assign(d().edition, { subject: bij.subject, preheader: bij.preheader });
      NB.toast('Onderwerp bewaard.');
      NB.vernieuwStand();
      laadBrief();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['ai-onderwerp'] = async function (el) {
    el.disabled = true;
    var bak = document.getElementById('edVoorstellen');
    bak.innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    try {
      var r = await NB.api('/api/editions/' + d().edition.id + '/ai-subject', { method: 'POST' });
      NB.state.onderwerpVoorstel = r;
      bak.innerHTML = r.subjects.map(function (s, i) {
        return '<button class="btn btn-xs btn-ghost justify-start h-auto py-1 text-left normal-case font-normal" data-action="kies-onderwerp" data-i="' + i + '">' + e(s) + '</button>';
      }).join('') + (r.preheader ? '<div class="text-xs opacity-60">Voorbeeldtekst: ' + e(r.preheader) + '</div>' : '');
    } catch (err) { bak.innerHTML = ''; NB.fout(err); }
    el.disabled = false;
  };

  NB.actions['kies-onderwerp'] = function (el) {
    var r = NB.state.onderwerpVoorstel;
    document.getElementById('edOnderwerp').value = r.subjects[Number(el.dataset.i)] || '';
    if (r.preheader && !document.getElementById('edPreheader').value) document.getElementById('edPreheader').value = r.preheader;
  };

  NB.actions['keur-goed'] = async function (el) {
    try {
      var bij = await NB.api('/api/contributions/' + el.dataset.id + '/status', { method: 'POST', body: { status: 'approved' } });
      NB.toast('Bevestigd.');
      NB.stukjeBijgewerkt(bij);
      NB.vernieuwStand();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['blok-weg'] = async function (el) {
    var it = itemVan(el.dataset.id);
    var vast = it && isVast(it.kind);
    var ja = await NB.bevestig(vast
      ? { titel: 'Uitzetten?', tekst: '"' + NB.blokNaam(it) + '" verdwijnt uit deze editie, met wat erin getypt is. Weer aanzetten kan onder Vaste blokken (dan begin je leeg).', knop: 'Uitzetten' }
      : { titel: 'Uit de brief halen?', tekst: '"' + NB.blokNaam(it) + '" verdwijnt uit deze editie, met wat erin getypt is.', knop: 'Weghalen' });
    if (!ja) return false;
    try {
      NB.state.vuil = false;
      await NB.api('/api/contributions/' + el.dataset.id, { method: 'DELETE' });
      NB.state.paneelId = null;
      NB.state.stukje = null;
      NB.state.concept = null;
      history.replaceState(null, '', '#/editie/' + d().edition.id);
      herlaad({ open: null });
    } catch (err) { NB.fout(err); }
  };

  NB.actions['annuleer-editie'] = async function () {
    var ja = await NB.bevestig({ titel: 'Editie annuleren?', tekst: 'De editie verdwijnt uit het overzicht. De stukjes blijven bewaard bij de editie.', knop: 'Annuleren' });
    if (!ja) return;
    try {
      await NB.api('/api/editions/' + d().edition.id + '/cancel', { method: 'POST' });
      NB.ga('#/');
    } catch (err) { NB.fout(err); }
  };

  /** Het venster Verzenden: kies het moment; tot dan kan je nog terughalen. */
  NB.actions['open-inplannen'] = function () {
    var x = d();
    NB.state.inplanStand = 'verzenden';
    document.getElementById('inplannenKop').textContent = 'Verzenden';
    document.getElementById('inplannenTekst').textContent = 'De editie gaat naar ' + lijstNamen().replace(/<[^>]+>/g, '') + ' van ' + x.series.name
      + '. Tot het gekozen moment staat ze klaar in de OM en kan je ze terughalen; daarna vertrekt ze via Odoo en is er geen weg terug.';
    document.getElementById('inplannenMoment').value = NB.lokaal(x.voorgesteld_moment || x.edition.send_at);
    document.getElementById('inplannenBevestigVeld').classList.remove('hidden');
    document.getElementById('inplannenBevestig').value = '';
    document.getElementById('inplannenKnop').textContent = 'Verzenden';
    NB.dialoog('dlgInplannen').showModal();
  };

  /** Hetzelfde venster om enkel het moment te verplaatsen (ingepland). */
  NB.actions['open-moment'] = function () {
    var x = d();
    NB.state.inplanStand = 'moment';
    document.getElementById('inplannenKop').textContent = 'Moment wijzigen';
    document.getElementById('inplannenTekst').textContent = 'Kies wanneer ' + x.series.name + ' ' + x.edition.title + ' vertrekt.';
    document.getElementById('inplannenMoment').value = NB.lokaal(x.edition.send_at);
    document.getElementById('inplannenBevestigVeld').classList.add('hidden');
    document.getElementById('inplannenKnop').textContent = 'Bewaren';
    NB.dialoog('dlgInplannen').showModal();
  };

  NB.actions['bevestig-inplannen'] = async function () {
    var moment = NB.vanLokaal(document.getElementById('inplannenMoment').value);
    if (!moment) { NB.toast('Kies een verzendmoment.', 'warning'); return; }
    try {
      if (NB.state.inplanStand === 'moment') {
        await NB.api('/api/editions/' + d().edition.id, { method: 'PUT', body: { send_at: moment } });
        NB.toast('Verzendmoment verplaatst.');
      } else {
        await NB.api('/api/editions/' + d().edition.id + '/schedule', {
          method: 'POST', body: { confirm: document.getElementById('inplannenBevestig').value.trim(), send_at: moment },
        });
        NB.toast('Klaargezet. Vertrekt op ' + NB.datum(moment) + '; tot dan kan je terughalen.');
      }
      NB.dialoog('dlgInplannen').close();
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['terughalen'] = async function () {
    var ja = await NB.bevestig({ titel: 'Terughalen?', tekst: 'De editie vertrekt dan niet en gaat terug naar Nalezen. Je kan ze nadien opnieuw verzenden.', knop: 'Terughalen', soort: 'primary' });
    if (!ja) return;
    try {
      await NB.api('/api/editions/' + d().edition.id + '/unschedule', { method: 'POST' });
      NB.toast('Teruggehaald.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.changes['eigenaar'] = async function (el) {
    try {
      var bij = await NB.api('/api/contributions/' + el.dataset.id, { method: 'PUT', body: { owner_user_id: el.value || null } });
      var u = (NB.state.boot.users || []).find(function (x) { return x.id === bij.owner_user_id; });
      bij.owner_name = u ? u.name : null;
      if (NB.state.stukje && NB.state.stukje.item.id === bij.id) {
        NB.state.stukje.item.owner_user_id = bij.owner_user_id;
        NB.state.stukje.item.owner_name = bij.owner_name;
      }
      NB.stukjeBijgewerkt(bij);
      NB.toast(bij.owner_name ? 'Toegewezen aan ' + NB.voornaam(bij.owner_name) + '.' : 'Aan niemand toegewezen.');
      // De naam onder het blok in de brief komt van de schrijver.
      laadBrief();
    } catch (err) { NB.fout(err); }
  };
})();
