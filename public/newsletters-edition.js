/**
 * Nieuwsbrieven -- de redactietafel van één editie. De BRIEF ZELF is het
 * werkblad: links de mail zoals hij vertrekt (dezelfde renderer als de mail),
 * rechts een paneel. Klik op een blok en het paneel wordt het invulformulier
 * van dat blok; wat je typt, staat meteen op zijn plek in de brief. Zonder
 * gekozen blok toont het paneel wat er voor jou klaarstaat en de blokjes die
 * je kan toevoegen (slepen naar de brief, of klikken en de plek kiezen).
 * Alles wat de hoofdredactie nog niet bevestigde, is in de brief gemarkeerd.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;
  NB.changes = NB.changes || {};

  /**
   * De blokjes die iedereen kan toevoegen. `kind` is de soort uit
   * lib/constants.js (KINDS); `titel` staat als labeltje boven het blok in de
   * mail en mag nadien nog wijzigen.
   */
  var SJABLONEN = [
    { key: 'vooraf', kind: 'intro', titel: 'Woordje vooraf', icoon: 'hand-heart', uitleg: 'Een korte inleiding bovenaan, ondertekend met foto.' },
    { key: 'vraag', kind: 'question', titel: 'Korte vraag', icoon: 'circle-help', uitleg: 'Eén vraag, lezers antwoorden met een klik.' },
    { key: 'stelling', kind: 'statement', titel: 'Stelling', icoon: 'scale', uitleg: 'Eens of oneens? Eén klik volstaat.' },
    { key: 'peiling', kind: 'poll', titel: 'Jij beslist mee', icoon: 'list-checks', uitleg: 'Laat lezers kiezen tussen een paar opties.' },
    { key: 'artikel', kind: 'link', titel: 'Interessant gelezen', icoon: 'newspaper', uitleg: 'Plak een link, titel en beeld komen vanzelf.' },
    { key: 'linkedin', kind: 'linkedin', titel: 'Op LinkedIn', icoon: 'share-2', uitleg: 'Een post die het delen waard is.' },
    { key: 'tekst', kind: 'article', titel: 'Uit het team', icoon: 'file-text', uitleg: 'Een kort verhaal, met foto of tekening.' },
    { key: 'tip', kind: 'article', titel: 'Tip', icoon: 'lightbulb', uitleg: 'Eén tip die tijd bespaart.' },
    { key: 'citaat', kind: 'quote', titel: 'Uit de praktijk', icoon: 'quote', uitleg: 'Wat een klant of collega zei.' },
    { key: 'video', kind: 'video', titel: 'Video', icoon: 'circle-play', uitleg: 'Een filmpje, met een stilstaand beeld.' },
  ];
  var SJ = {};
  SJABLONEN.forEach(function (s) { SJ[s.key] = s; });

  function d() { return NB.state.editie; }
  function ik() { return NB.state.boot.me.id; }
  function actief() { return ['collecting', 'review'].indexOf(d().edition.status) >= 0; }
  function itemVan(id) { return d().items.find(function (i) { return i.id === id; }) || null; }
  function voornaam(naam) { return String(naam || '').split(' ')[0]; }

  // ─── Bovenaan: stand van de editie ────────────────────────────────────────

  function voortgang() {
    var echt = d().items.filter(function (i) { return !NB.isAuto(i.kind); });
    var tel = function (s) { return echt.filter(function (i) { return i.status === s; }).length; };
    return { totaal: echt.length, bevestigd: tel('approved'), ingeleverd: tel('submitted') };
  }

  function standBalk() {
    var ed = d().edition;
    var editor = d().series.is_editor;
    var p = voortgang();
    var t = NB.teller(ed.deadline_at);
    var wanneer = !actief() ? e((NB.EDITIE_STATUS[ed.status] || {}).label || ed.status)
      : t.voorbij ? '<strong>Inleverdatum voorbij</strong> · tijd om na te lezen en te bevestigen'
        : 'Inleveren tegen <strong>' + e(NB.datum(ed.deadline_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + '</strong> · <span class="nb-teller">' + e(NB.tellerTekst(ed.deadline_at)) + '</span>';
    var knoppen = [];
    if (editor && ed.status !== 'sent') {
      knoppen.push('<button class="btn btn-sm btn-outline btn-primary" data-action="test-versturen"><i data-lucide="send" class="w-4 h-4"></i> Testmail</button>');
    }
    if (editor && actief() && d().series.chat_channel) knoppen.push('<button class="btn btn-sm btn-ghost" data-action="herinner">Herinner in de chat</button>');
    if (editor && actief() && d().send_mode === 'live') knoppen.push('<button class="btn btn-sm btn-error" data-action="open-inplannen">Bevestigen en inplannen</button>');
    return '<div class="card bg-base-100 border border-base-content/10 mb-4"><div class="card-body p-4 flex-row flex-wrap items-center gap-x-6 gap-y-3">'
      + '<div class="text-sm">' + wanneer + '<div class="opacity-60 mt-0.5">Verzenden ' + e(NB.datum(ed.send_at)) + (actief() ? ', pas na bevestiging door marketing' : '') + '</div></div>'
      + '<div class="flex-1 min-w-[200px]"><div class="flex justify-between text-sm mb-1.5"><span><strong>' + (p.bevestigd + p.ingeleverd) + ' van ' + p.totaal + '</strong> blokken binnen</span><span class="opacity-60">' + p.bevestigd + ' bevestigd</span></div>' + NB.balk(d().items) + '</div>'
      + (knoppen.length ? '<div class="flex flex-wrap gap-2">' + knoppen.join('') + '</div>' : '')
      + '</div></div>';
  }

  // ─── Het paneel zonder gekozen blok ───────────────────────────────────────

  function kaart(inhoud, extra) {
    return '<div class="card bg-base-100 border border-base-content/10' + (extra || '') + '"><div class="card-body p-4 gap-2">' + inhoud + '</div></div>';
  }

  function blokRij(it, rechts) {
    return '<div class="flex items-center gap-2 py-1.5 border-b border-base-content/10 last:border-0">'
      + '<button class="flex-1 min-w-0 text-left hover:text-primary" data-action="kies-blok" data-id="' + e(it.id) + '">'
      + '<div class="text-sm font-medium truncate">' + e(it.title) + '</div>'
      + '<div class="text-xs opacity-60 truncate">' + e(it.heading && it.heading !== it.title ? it.heading : NB.soort(it.kind)) + '</div></button>'
      + (rechts || NB.statusBadge(it.status)) + '</div>';
  }

  function voorJou() {
    var mijn = d().items.filter(function (i) { return i.owner_user_id === ik() && !NB.isAuto(i.kind); });
    var open = mijn.filter(function (i) { return i.status === 'open' || i.status === 'draft'; });
    var kop = '<h3 class="font-semibold flex items-center gap-2"><i data-lucide="pen-line" class="w-4 h-4"></i> Voor jou</h3>';
    if (!mijn.length) {
      return kaart(kop + '<p class="text-sm opacity-70">Er staat in deze editie niets op jouw naam. Wil je toch iets kwijt? Kies hieronder een blokje.</p>');
    }
    var uitleg = open.length
      ? '<p class="text-sm opacity-70">Klik op een blok, hier of in de brief, en vul het in. Het staat meteen op zijn plek.</p>'
      : '<p class="text-sm opacity-70">Alles van jou is doorgegeven. Dank je!</p>';
    return kaart(kop + uitleg + '<div>' + mijn.map(function (i) { return blokRij(i); }).join('') + '</div>', open.length ? ' border-primary/40' : '');
  }

  function toevoegen() {
    if (!actief()) return '';
    var lijst = SJABLONEN.map(function (s) {
      return '<button class="nb-sjabloon text-left rounded-xl border border-base-content/10 hover:border-primary/50 hover:bg-primary/5 p-2.5 flex gap-2 items-start" draggable="true" data-action="sjabloon" data-sjabloon="' + s.key + '">'
        + '<i data-lucide="' + s.icoon + '" class="w-4 h-4 mt-0.5 text-primary shrink-0"></i>'
        + '<span class="min-w-0"><span class="block text-sm font-medium">' + e(s.titel) + '</span><span class="block text-xs opacity-60 leading-snug">' + e(s.uitleg) + '</span></span></button>';
    }).join('');
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Iets toevoegen</h3>'
      + '<p class="text-sm opacity-70">Sleep een blokje naar de brief, of klik erop en kies daarna de plek. Marketing bevestigt het nog; tot dan staat het als onbevestigd in de brief.</p>'
      + '<div class="grid grid-cols-2 gap-2 mt-1">' + lijst + '</div>');
  }

  function teBevestigen() {
    var lijst = d().items.filter(function (i) { return i.status === 'submitted'; });
    if (!lijst.length) return '';
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="badge-check" class="w-4 h-4"></i> Te bevestigen</h3>'
      + '<div>' + lijst.map(function (i) {
        return blokRij(i, '<span class="text-xs opacity-60 shrink-0">' + e(voornaam(i.owner_name)) + '</span><button class="btn btn-xs btn-success" data-action="keur-goed" data-id="' + e(i.id) + '">Bevestigen</button>');
      }).join('') + '</div>', ' border-warning/50');
  }

  function onderwerp() {
    var ed = d().edition;
    return kaart('<h3 class="font-semibold">Onderwerp en voorbeeldtekst</h3>'
      + '<input id="edOnderwerp" class="input input-bordered input-sm" maxlength="200" placeholder="Onderwerp" value="' + e(ed.subject) + '">'
      + '<input id="edPreheader" class="input input-bordered input-sm" maxlength="200" placeholder="Voorbeeldtekst (grijze regel in de inbox)" value="' + e(ed.preheader) + '">'
      + '<div id="edVoorstellen" class="flex flex-col gap-1"></div>'
      + '<div class="flex gap-2"><button class="btn btn-sm btn-ghost" data-action="ai-onderwerp"><i data-lucide="sparkles" class="w-4 h-4"></i> Stel voor</button>'
      + '<button class="btn btn-sm btn-primary ml-auto" data-action="bewaar-onderwerp">Bewaren</button></div>');
  }

  function datums() {
    if (!actief()) return '';
    var ed = d().edition;
    return kaart('<h3 class="font-semibold">Datums</h3><div class="grid grid-cols-2 gap-2">'
      + '<label class="form-control"><span class="label-text text-xs">Inleveren</span><input id="edDeadline" type="datetime-local" class="input input-bordered input-sm" value="' + e(NB.lokaal(ed.deadline_at)) + '"></label>'
      + '<label class="form-control"><span class="label-text text-xs">Verzenden</span><input id="edSend" type="datetime-local" class="input input-bordered input-sm" value="' + e(NB.lokaal(ed.send_at)) + '"></label></div>'
      + '<button class="btn btn-sm btn-ghost self-end" data-action="bewaar-datums">Bewaren</button>');
  }

  function voorraad() {
    var pool = (d().suggesties && d().suggesties.pool) || [];
    if (!pool.length || !actief()) return '';
    return kaart('<h3 class="font-semibold">Ideeën in de voorraad</h3>'
      + pool.map(function (p) {
        return '<div class="flex items-center gap-2 py-1"><a class="flex-1 min-w-0 text-sm font-medium hover:underline truncate" href="#/stukje/' + e(p.id) + '">' + e(p.title) + '</a>'
          + '<button class="btn btn-xs btn-primary" data-action="neem-op" data-id="' + e(p.id) + '">Opnemen</button></div>';
      }).join(''));
  }

  function activiteit() {
    var lijst = d().activity || [];
    if (!lijst.length) return '';
    return '<details class="collapse collapse-arrow bg-base-100 border border-base-content/10"><summary class="collapse-title font-semibold text-sm min-h-0 py-3">Wat er gebeurde</summary><div class="collapse-content">'
      + lijst.slice(0, 15).map(function (a) {
        return '<div class="text-sm py-1 border-b border-base-content/10 last:border-0">' + (a.user_name ? '<strong>' + e(voornaam(a.user_name)) + '</strong>: ' : '') + e(a.text) + ' <span class="opacity-50 text-xs">' + e(NB.datum(a.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span></div>';
      }).join('') + '</div></details>';
  }

  function paneelOverzicht() {
    var editor = d().series.is_editor;
    return '<div class="flex flex-col gap-4">' + voorJou() + toevoegen()
      + (editor ? teBevestigen() + onderwerp() + voorraad() + datums() : '')
      + activiteit()
      + (editor && actief() ? '<button class="btn btn-xs btn-ghost self-start opacity-60" data-action="annuleer-editie">Editie annuleren</button>' : '')
      + '</div>';
  }

  function paneelPlaatsen() {
    var sj = SJ[NB.state.plaatsen];
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="' + sj.icoon + '" class="w-4 h-4 text-primary"></i> ' + e(sj.titel) + '</h3>'
      + '<p class="text-sm">Klik in de brief op een <strong class="text-primary">blauwe plek</strong>: daar komt het blok. Je vult het daarna meteen in.</p>'
      + '<button class="btn btn-sm btn-ghost self-start" data-action="plaats-annuleer">Annuleren</button>', ' border-primary');
  }

  /** Het paneel zonder gekozen blok (of in de plaatsstand). */
  function toonPaneel() {
    var bak = document.getElementById('nbPaneel');
    if (!bak) return;
    bak.innerHTML = NB.state.plaatsen ? paneelPlaatsen() : paneelOverzicht();
    NB.ikons();
  }

  // ─── De brief ─────────────────────────────────────────────────────────────

  var briefNr = 0;

  /** Wat er nu in het schrijfpaneel staat, ook al is het nog niet bewaard. */
  function ontwerp() {
    var s = NB.state.stukje;
    var c = NB.state.concept;
    if (NB.state.stukjeHost !== 'paneel' || !s || !c) return null;
    return { id: s.item.id, kind: c.kind, title: c.title, content: c.content };
  }

  async function laadBrief() {
    var frame = document.getElementById('edVoorbeeld');
    if (!frame) return;
    var nr = ++briefNr;
    var stand = NB.state.voorbeeldStand === 'test' ? 'test' : 'preview';
    var r;
    try {
      r = await NB.api('/api/editions/' + d().edition.id + '/preview', { method: 'POST', body: { mode: stand, override: ontwerp() } });
    } catch (err) { NB.fout(err); return; }
    // Een trager, ouder antwoord mag een nieuwer niet overschrijven.
    if (nr !== briefNr || !document.body.contains(frame)) return;
    // De hoogte vasthouden tot de nieuwe brief er staat: anders springt de pagina.
    frame.style.minHeight = frame.offsetHeight + 'px';
    frame.onload = function () {
      var doc = frame.contentDocument;
      if (!doc) return;
      frame.style.height = (doc.documentElement.scrollHeight + 16) + 'px';
      frame.style.minHeight = '';
      versier(doc);
      if (NB.state.scrolNa) { scrolNaarBlok(NB.state.scrolNa); NB.state.scrolNa = null; }
    };
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0">' + r.html + '</body></html>';
  }
  NB.vernieuwBrief = laadBrief;

  var BRIEF_CSS = ''
    + '[data-nb-id]{cursor:pointer}'
    + '[data-nb-id]>td{position:relative;transition:box-shadow .15s}'
    + '[data-nb-id]:hover>td{box-shadow:inset 0 0 0 2px #7dd3fc}'
    + '.nb-onbevestigd>td{box-shadow:inset 5px 0 0 #fbbf24}'
    + '.nb-mijn>td{box-shadow:inset 0 0 0 2px #38bdf8}'
    + '.nb-gekozen>td,.nb-gekozen:hover>td{box-shadow:inset 0 0 0 3px #0284c7}'
    + '.nb-label{position:absolute;top:8px;right:10px;z-index:2;pointer-events:none;font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 10px;border-radius:999px;white-space:nowrap}'
    + '.nb-label-mijn{background:#0284c7;color:#fff}'
    + '.nb-label-wacht{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}'
    + '.nb-label-bezig{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}'
    + '.nb-plekken-aan [data-nb-id]{opacity:.55}'
    + '.nb-plek>td{padding:6px 24px}'
    + '.nb-plek div{border:2px dashed #38bdf8;border-radius:10px;padding:9px;text-align:center;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;color:#0369a1;background:#f0f9ff;cursor:pointer}'
    + '.nb-plek:hover div,.nb-plek.nb-over div{background:#0284c7;border-color:#0284c7;color:#fff}';

  /** Wat er op een blok in de brief staat, naast de inhoud. */
  function labelVan(it) {
    if (!it || NB.isAuto(it.kind) || it.status === 'approved') return null;
    var editor = d().series.is_editor;
    if (it.owner_user_id === ik() && (it.status === 'open' || it.status === 'draft')) {
      return { soort: 'mijn', tekst: it.status === 'open' ? 'Voor jou · klik om in te vullen' : 'Voor jou · nog niet doorgegeven' };
    }
    if (it.status === 'submitted') return { soort: 'wacht', tekst: editor ? 'Te bevestigen' : 'Onbevestigd · wacht op marketing' };
    if (it.status === 'draft') return { soort: 'bezig', tekst: 'Onbevestigd · ' + (voornaam(it.owner_name) || 'iemand') + ' schrijft nog' };
    return null;
  }

  function versier(doc) {
    if (!doc.getElementById('nbStijl')) {
      var stijl = doc.createElement('style');
      stijl.id = 'nbStijl';
      stijl.textContent = BRIEF_CSS;
      (doc.head || doc.documentElement).appendChild(stijl);
      doc.addEventListener('click', function (ev) {
        ev.preventDefault();
        var plek = ev.target.closest('.nb-plek');
        if (plek) { plaats(plek.getAttribute('data-na')); return; }
        if (NB.state.plaatsen) return;
        var blok = ev.target.closest('[data-nb-id]');
        if (blok) selecteer(blok.getAttribute('data-nb-id')).catch(NB.fout);
      });
      doc.addEventListener('dragover', function (ev) {
        var plek = ev.target.closest && ev.target.closest('.nb-plek');
        doc.querySelectorAll('.nb-over').forEach(function (x) { if (x !== plek) x.classList.remove('nb-over'); });
        if (!plek || !NB.state.sleep) return;
        ev.preventDefault();
        plek.classList.add('nb-over');
      });
      doc.addEventListener('drop', function (ev) {
        var plek = ev.target.closest && ev.target.closest('.nb-plek');
        if (!plek || !NB.state.sleep) return;
        ev.preventDefault();
        NB.state.plaatsen = NB.state.sleep;
        plaats(plek.getAttribute('data-na'));
      });
    }
    labels(doc);
    if (NB.state.plaatsen || NB.state.sleep) toonPlekken(doc);
  }

  function labels(doc) {
    doc = doc || briefDoc();
    if (!doc) return;
    doc.querySelectorAll('.nb-label').forEach(function (x) { x.remove(); });
    doc.querySelectorAll('[data-nb-id]').forEach(function (rij) {
      var id = rij.getAttribute('data-nb-id');
      var it = itemVan(id);
      rij.classList.remove('nb-onbevestigd', 'nb-mijn', 'nb-gekozen');
      if (!it) return;
      var l = labelVan(it);
      if (!NB.isAuto(it.kind) && it.status !== 'approved') rij.classList.add('nb-onbevestigd');
      if (l && l.soort === 'mijn') rij.classList.add('nb-mijn');
      if (id === NB.state.paneelId) rij.classList.add('nb-gekozen');
      rij.title = NB.isAuto(it.kind) ? 'Vult zichzelf' : '';
      var cel = rij.firstElementChild;
      if (l && cel) {
        var el = doc.createElement('div');
        el.className = 'nb-label nb-label-' + l.soort;
        el.textContent = l.tekst;
        cel.appendChild(el);
      }
    });
  }

  function briefDoc() {
    var frame = document.getElementById('edVoorbeeld');
    return frame && frame.contentDocument;
  }

  function hoogteBij() {
    var frame = document.getElementById('edVoorbeeld');
    var doc = briefDoc();
    if (frame && doc) frame.style.height = (doc.documentElement.scrollHeight + 16) + 'px';
  }

  /** Blauwe plekken tussen de blokken: daar kan een nieuw blok komen. */
  function toonPlekken(doc) {
    doc = doc || briefDoc();
    if (!doc || doc.querySelector('.nb-plek')) return;
    var blokken = Array.prototype.slice.call(doc.querySelectorAll('[data-nb-id]'));
    if (!blokken.length) return;
    var maak = function (na) {
      var tr = doc.createElement('tr');
      tr.className = 'nb-plek';
      tr.setAttribute('data-na', na);
      tr.innerHTML = '<td><div>+ Hier plaatsen</div></td>';
      return tr;
    };
    blokken[0].parentNode.insertBefore(maak(''), blokken[0]);
    blokken.forEach(function (rij) {
      var it = itemVan(rij.getAttribute('data-nb-id'));
      if (it && it.kind === 'closing') return;
      rij.parentNode.insertBefore(maak(rij.getAttribute('data-nb-id')), rij.nextSibling);
    });
    doc.body.classList.add('nb-plekken-aan');
    hoogteBij();
  }

  function verbergPlekken() {
    var doc = briefDoc();
    if (!doc) return;
    doc.querySelectorAll('.nb-plek').forEach(function (x) { x.remove(); });
    doc.body.classList.remove('nb-plekken-aan');
    hoogteBij();
  }

  function scrolNaarBlok(id) {
    var frame = document.getElementById('edVoorbeeld');
    var doc = briefDoc();
    var rij = doc && doc.querySelector('[data-nb-id="' + id + '"]');
    if (!frame || !rij) return;
    var y = frame.getBoundingClientRect().top + rij.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  // ─── Een blok kiezen, sluiten, plaatsen ───────────────────────────────────

  async function bewaarOpen() {
    if (NB.state.vuil && NB.bewaarStukje) await NB.bewaarStukje();
  }

  async function selecteer(id, vooraf) {
    if (NB.state.paneelId === id && NB.state.stukjeHost === 'paneel' && !vooraf) return;
    await bewaarOpen();
    NB.state.paneelId = id;
    labels();
    var bak = document.getElementById('nbPaneel');
    if (!vooraf && bak) bak.innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div>';
    var data = vooraf || await NB.api('/api/contributions/' + id);
    if (NB.state.paneelId !== id) return;
    await NB.stukjeInPaneel(data);
    history.replaceState(null, '', '#/stukje/' + id);
    if (window.innerWidth < 1024 && bak) bak.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function sluitPaneel() {
    await bewaarOpen();
    NB.state.paneelId = null;
    NB.state.stukjeHost = null;
    NB.state.stukje = null;
    NB.state.concept = null;
    history.replaceState(null, '', '#/editie/' + d().edition.id);
    labels();
    toonPaneel();
  }

  async function plaats(na) {
    var sj = SJ[NB.state.plaatsen];
    NB.state.plaatsen = null;
    NB.state.sleep = null;
    verbergPlekken();
    if (!sj) { toonPaneel(); return; }
    try {
      await bewaarOpen();
      var rij = await NB.api('/api/editions/' + d().edition.id + '/contributions', {
        method: 'POST', body: { kind: sj.kind, title: sj.titel, after_id: na || '' },
      });
      NB.toast('Toegevoegd. Vul het in; marketing bevestigt het nog.', 'info');
      NB.state.scrolNa = rij.id;
      await herlaad({ open: rij.id });
    } catch (err) { NB.fout(err); toonPaneel(); }
  }

  /** Na een wijziging in het paneel: de brief en de stand bijwerken zonder herladen. */
  NB.stukjeBijgewerkt = function (item) {
    if (!NB.state.editie || !item) return;
    var it = itemVan(item.id);
    if (!it) return;
    ['status', 'title', 'kind', 'owner_user_id'].forEach(function (k) { if (item[k] !== undefined) it[k] = item[k]; });
    if (item.owner_name !== undefined) it.owner_name = item.owner_name;
    labels();
    var kop = document.getElementById('edStand');
    if (kop) { kop.innerHTML = standBalk(); NB.ikons(); }
  };

  NB.sluitPaneel = function () { return sluitPaneel(); };

  // ─── Het scherm ───────────────────────────────────────────────────────────

  function werkblad() {
    var stand = NB.state.voorbeeldStand === 'test' ? 'test' : 'preview';
    return '<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] items-start">'
      + '<div class="min-w-0">'
      + '<div class="flex flex-wrap items-center gap-3 mb-3">'
      + '<div role="tablist" class="tabs tabs-boxed tabs-sm w-fit">'
      + '<button role="tab" class="tab' + (stand === 'preview' ? ' tab-active' : '') + '" data-action="voorbeeld-stand" data-stand="preview">Werkblad</button>'
      + '<button role="tab" class="tab' + (stand === 'test' ? ' tab-active' : '') + '" data-action="voorbeeld-stand" data-stand="test">Zoals de lezer het ziet</button>'
      + '</div><span class="text-xs opacity-60">' + (stand === 'preview' ? 'Klik op een blok om het in te vullen.' : 'Enkel kijken; ga terug naar het werkblad om iets te wijzigen.') + '</span></div>'
      + '<div class="max-w-[700px] mx-auto"><iframe id="edVoorbeeld" class="nb-voorbeeld" title="De nieuwsbrief"></iframe></div>'
      + '</div>'
      + '<aside id="nbPaneel" class="min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto nb-paneel"></aside>'
      + '</div>';
  }

  async function antwoorden() {
    var bak = document.getElementById('edAntwoorden');
    if (!bak) return;
    try {
      var r = await NB.api('/api/editions/' + d().edition.id + '/answers');
      if (!r.questions.length) { bak.innerHTML = '<p class="opacity-60">Deze editie heeft geen vragen.</p>'; return; }
      var vragen = r.questions.map(function (q) {
        var max = Math.max(1, q.total);
        return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-2">'
          + '<div class="text-xs font-bold uppercase tracking-wide text-primary">' + e(q.title) + '</div>'
          + '<div class="text-lg font-semibold">' + e(q.question) + '</div>'
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
        var odoo = !a.verified ? 'anoniem, niet naar Odoo' : a.push_error ? 'fout: ' + a.push_error : a.pushed_at ? 'naar de koppeling' : 'wacht (10 min)';
        return '<tr><td>' + (a.contact ? '<div class="font-medium">' + e(a.contact.name) + '</div><div class="text-xs opacity-60">' + e(a.contact.email) + '</div>' : '<span class="opacity-60">Anoniem</span>') + '</td>'
          + '<td>' + e(q.title || '') + '</td><td><span class="badge badge-sm">' + e(opt ? opt.label : a.option_value) + '</span></td>'
          + '<td class="max-w-xs">' + e(a.comment || '') + '</td><td class="text-xs whitespace-nowrap">' + e(NB.datum(a.updated_at)) + '</td><td class="text-xs">' + e(odoo) + '</td></tr>';
      }).join('');
      bak.innerHTML = '<div class="grid gap-4 md:grid-cols-2 mb-5">' + vragen + '</div>'
        + (r.integration_id ? '<p class="text-sm mb-3">Antwoorden gaan naar de koppeling van deze reeks (<a class="link" href="/forminator-v2">Koppelingen</a>, "Nieuwsbrief-antwoorden …"). Zolang die uit staat, worden ze bewaard maar gebeurt er niets in Odoo.</p>' : '<p class="text-sm mb-3 opacity-70">Bij het eerste antwoord maakt de OM een koppeling voor deze reeks aan (uitgeschakeld).</p>')
        + '<div class="overflow-x-auto bg-base-100 rounded-xl border border-base-content/10"><table class="table table-sm"><thead><tr><th>Wie</th><th>Vraag</th><th>Antwoord</th><th>Toelichting</th><th>Wanneer</th><th>Odoo</th></tr></thead><tbody>'
        + (rijen || '<tr><td colspan="6" class="opacity-60">Nog geen antwoorden.</td></tr>') + '</tbody></table></div>';
    } catch (err) { NB.fout(err); }
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
    }
    if (NB.state.paneelEditie !== params.id) NB.state.paneelId = null;
    NB.state.paneelEditie = params.id;
    NB.state.plaatsen = null;
    NB.state.sleep = null;
    NB.state.stukjeHost = null;
    var open = params.stukje ? params.stukje.item.id : (params.open || NB.state.paneelId);
    if (open && !itemVan(open)) open = null;
    NB.state.paneelId = null;

    var tab = NB.state.editieTab === 'antwoorden' ? 'antwoorden' : 'redactie';
    var tabKnop = function (naam, label) {
      return '<button role="tab" class="tab' + (tab === naam ? ' tab-active' : '') + '" data-action="editie-tab" data-tab="' + naam + '">' + label + '</button>';
    };
    var stats = data.edition.stats;
    app.innerHTML = '<div class="text-sm opacity-70 mb-1"><a class="hover:underline" href="#/">Nieuwsbrieven</a> / ' + e(data.series.name) + '</div>'
      + '<div class="flex flex-wrap items-center gap-3 mb-4"><h1 class="text-2xl font-bold">' + e(data.edition.title) + '</h1>' + NB.editieBadge(data.edition.status)
      + (stats ? '<span class="text-sm opacity-70">' + (stats.sent || 0) + ' verzonden · ' + Math.round(stats.opened_ratio || 0) + '% geopend · ' + Math.round(stats.clicks_ratio || 0) + '% geklikt</span>' : '')
      + '<div role="tablist" class="tabs tabs-boxed w-fit ml-auto">' + tabKnop('redactie', 'Redactie') + tabKnop('antwoorden', 'Antwoorden') + '</div>'
      + '</div>'
      + '<div id="edStand">' + standBalk() + '</div>'
      + (tab === 'antwoorden' ? '<div id="edAntwoorden"><span class="loading loading-spinner"></span></div>' : werkblad());
    NB.ikons();
    if (tab === 'antwoorden') { antwoorden(); return; }
    if (open) {
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
    var y = window.scrollY;
    await NB.views.editie({ id: d().edition.id, open: open });
    // Blijf staan waar je was, behalve als er naar een nieuw blok gescrold wordt.
    if (!NB.state.scrolNa) window.scrollTo(0, y);
  }
  NB.herlaadEditie = herlaad;

  // ─── Slepen vanuit het paneel naar de brief ───────────────────────────────

  document.addEventListener('dragstart', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-sjabloon]');
    if (!el || !NB.state.editie) return;
    NB.state.sleep = el.dataset.sjabloon;
    try { ev.dataTransfer.setData('text/plain', el.dataset.sjabloon); ev.dataTransfer.effectAllowed = 'copy'; } catch (err) { /* oude browsers */ }
    toonPlekken();
  });

  // Een smaller of breder venster maakt de brief langer of korter.
  var maatTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(maatTimer);
    maatTimer = setTimeout(hoogteBij, 150);
  });

  document.addEventListener('dragend', function () {
    if (!NB.state.sleep) return;
    NB.state.sleep = null;
    if (!NB.state.plaatsen) verbergPlekken();
  });

  // ─── Acties ───────────────────────────────────────────────────────────────

  NB.actions['editie-tab'] = function (el) { NB.state.editieTab = el.dataset.tab; herlaad(); };

  NB.actions['voorbeeld-stand'] = async function (el) {
    NB.state.voorbeeldStand = el.dataset.stand;
    if (el.dataset.stand === 'test' && NB.state.paneelId) await sluitPaneel();
    herlaad({ open: null });
  };

  NB.actions['kies-blok'] = function (el) {
    var id = el.dataset.id;
    return selecteer(id).then(function () { scrolNaarBlok(id); });
  };

  NB.actions['paneel-sluit'] = function () { return sluitPaneel(); };

  NB.actions['sjabloon'] = async function (el) {
    if (NB.state.voorbeeldStand === 'test') NB.state.voorbeeldStand = 'preview';
    await sluitPaneel();
    NB.state.plaatsen = el.dataset.sjabloon;
    toonPaneel();
    toonPlekken();
    var doc = briefDoc();
    var eerste = doc && doc.querySelector('.nb-plek');
    if (eerste && window.innerWidth < 1024) eerste.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  NB.actions['plaats-annuleer'] = function () {
    NB.state.plaatsen = null;
    verbergPlekken();
    toonPaneel();
  };

  NB.actions['test-versturen'] = async function (el) {
    el.disabled = true;
    try {
      await bewaarOpen();
      var r = await NB.api('/api/editions/' + d().edition.id + '/test', { method: 'POST' });
      NB.toast('Testmail ' + (r.queued ? 'in de wachtrij van Odoo' : 'verstuurd') + ' naar ' + r.to.join(', ') + '.');
      if (!r.token_field) NB.toast('Het Studio-veld x_studio_om_token ontbreekt: antwoorden op vragen tellen als anoniem.', 'warning');
      herlaad();
    } catch (err) { NB.fout(err); el.disabled = false; }
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
        body: { deadline_at: NB.vanLokaal(document.getElementById('edDeadline').value), send_at: NB.vanLokaal(document.getElementById('edSend').value) },
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
      if (!NB.state.paneelId) toonPaneel();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['verplaats'] = async function (el) {
    var ids = d().items.map(function (i) { return i.id; });
    var i = ids.indexOf(el.dataset.id);
    var j = i + Number(el.dataset.richting);
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    try {
      await bewaarOpen();
      await NB.api('/api/editions/' + d().edition.id + '/order', { method: 'POST', body: { ids: ids } });
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['blok-weg'] = async function (el) {
    if (!window.confirm('Dit blok uit de brief halen?')) return;
    try {
      NB.state.vuil = false;
      await NB.api('/api/contributions/' + el.dataset.id, { method: 'DELETE' });
      NB.state.paneelId = null;
      NB.state.stukjeHost = null;
      NB.state.stukje = null;
      history.replaceState(null, '', '#/editie/' + d().edition.id);
      herlaad({ open: null });
    } catch (err) { NB.fout(err); }
  };

  NB.actions['neem-op'] = async function (el) {
    try {
      await NB.api('/api/editions/' + d().edition.id + '/contributions', { method: 'POST', body: { from_pool_id: el.dataset.id } });
      NB.toast('Opgenomen in deze editie.');
      herlaad({ open: el.dataset.id });
    } catch (err) { NB.fout(err); }
  };

  NB.actions['annuleer-editie'] = async function () {
    if (!window.confirm('Deze editie annuleren? De stukjes blijven bewaard bij de editie.')) return;
    try {
      await NB.api('/api/editions/' + d().edition.id + '/cancel', { method: 'POST' });
      NB.ga('#/');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['open-inplannen'] = function () {
    var x = d();
    document.getElementById('inplannenTekst').textContent = 'De editie gaat op ' + NB.datum(x.edition.send_at) + ' naar de Odoo-lijst(en) '
      + (x.series.odoo_list_ids || []).join(', ') + ' van ' + x.series.name + '. Dit kan je in de OM niet terugdraaien.';
    document.getElementById('inplannenBevestig').value = '';
    NB.dialoog('dlgInplannen').showModal();
  };

  NB.actions['bevestig-inplannen'] = async function () {
    try {
      await NB.api('/api/editions/' + d().edition.id + '/schedule', {
        method: 'POST', body: { confirm: document.getElementById('inplannenBevestig').value.trim() },
      });
      NB.dialoog('dlgInplannen').close();
      NB.toast('Ingepland in Odoo.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.changes['eigenaar'] = async function (el) {
    try {
      var bij = await NB.api('/api/contributions/' + el.dataset.id, { method: 'PUT', body: { owner_user_id: el.value || null } });
      var u = (NB.state.boot.users || []).find(function (x) { return x.id === bij.owner_user_id; });
      bij.owner_name = u ? u.name : null;
      if (NB.state.stukje && NB.state.stukje.item.id === bij.id) NB.state.stukje.item.owner_user_id = bij.owner_user_id;
      if (NB.state.stukje && NB.state.stukje.item.id === bij.id) NB.state.stukje.item.owner_name = bij.owner_name;
      NB.stukjeBijgewerkt(bij);
      NB.toast(bij.owner_name ? 'Toegewezen aan ' + voornaam(bij.owner_name) + '.' : 'Aan niemand toegewezen.');
      // De naam onder het blok in de brief komt van de schrijver.
      laadBrief();
    } catch (err) { NB.fout(err); }
  };
})();
