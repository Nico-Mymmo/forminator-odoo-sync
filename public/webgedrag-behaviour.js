/**
 * Webgedrag — tabblad "Gedrag": trends en flows over ALLE bezoeken (ook anoniem).
 *
 * De server (src/modules/web-story/lib/behaviour.js) stuurt compacte sessies
 * voor de periode en de vorige; alles hieronder -- segmenteren, de padverkenner,
 * de tabel per pagina -- gebeurt in de browser op die sessies. Een filter of een
 * klik kost dus geen nieuwe query.
 *
 * Het segment (filters bovenaan) geldt voor ALLES op dit tabblad. De padverkenner
 * heeft daarbovenop "spelden": een pagina op een bepaalde stap vastzetten toont
 * wie daar langskwam -- waar ze vandaan kwamen en waar ze heen gingen.
 *
 * In de padverkenner is een ACTIE (formulier, afspraak, event, nieuwsbrief,
 * academy, registratie) een eigen stap, direct na de pagina waarop ze gebeurde
 * (kolom `acts`, zie lib/behaviour.js). Drie standen: vooruit vanaf de instap;
 * "rond een pagina": uitgelijnd op de eerste keer dat een gekozen pagina bekeken
 * werd, met stappen ervoor en erna, zodat een pagina in het midden staat wat haar
 * plaats in het bezoek ook was; of "naar het doel toe": uitgelijnd op de eerste
 * keer dat het gekozen doel gebeurde, zodat een lange weg ernaartoe niet wegvalt
 * achter de laatste kolom. Staat er een pagina in focus (een speld, of die in het
 * midden), dan legt "Pagina onder de loep" uit hoe ze scoort en wie er stopt.
 *
 * REGEL 3: één centrale listener, data-bh-*-attributen. Individuele trajecten
 * opent window.WebGedrag.open() (webgedrag.js).
 */

(function () {
  'use strict';

  var C = { v: 0, start: 1, dur: 2, site: 3, ch: 4, det: 5, pages: 6, offs: 7, flags: 8, dev: 9, scroll: 10, clicks: 11, acts: 12, reo: 13, fun: 14 };
  // Een AANVRAAG = formulier (64) of Calendly-boeking (128). Events, nieuwsbrief,
  // academy en registratie zijn eigen acties (zie de vlaggen in lib/behaviour.js).
  var CONV = 64 | 128;
  var ALLE_ACTIES = 64 | 128 | 256 | 4096 | 8192 | 16384;
  var TOP_PER_STEP = 5;
  var MIN_STEPS = 2, MAX_STEPS = 12;
  // Stand "rond een pagina": stappen voor en na de pagina, elk apart in te stellen.
  var MIN_SIDE = 1, MAX_SIDE = 6;
  // "Komt binnen": in de uitgelijnde standen het moment net VOOR de eerste stap van
  // een bezoek. Geen pagina (>= 0) en geen actie (-1 .. -10), dus een eigen waarde.
  var ENTRY = -100;
  // Acties als STAP in het pad. Dezelfde codes als ACT_KINDS in lib/behaviour.js
  // (1 formulier ... 6 registratie); wijzig ze samen. In een pad (steps()) staat
  // een pagina als haar volgnummer (>= 0) en een actie als -code.
  var ACT = {
    1: { label: 'Formulier verstuurd', short: 'Formulier', icon: 'send' },
    2: { label: 'Afspraak geboekt', short: 'Afspraak', icon: 'calendar-check' },
    3: { label: 'Ingeschreven voor een event', short: 'Event', icon: 'ticket' },
    4: { label: 'Ingeschreven op de nieuwsbrief', short: 'Nieuwsbrief', icon: 'mail' },
    5: { label: 'Ingeschreven in de academy', short: 'Academy', icon: 'graduation-cap' },
    6: { label: 'Registratie gestart', short: 'Registratie', icon: 'user-plus' },
    // Een OFFERTE: een aanvraag die apart zichtbaar is (web_action 'offerte' op de koppeling).
    7: { label: 'Offerte aangevraagd', short: 'Offerte', icon: 'file-text' },
    // Gestart maar in dat bezoek niet verstuurd (ACT_KINDS 8-10 in lib/behaviour.js).
    // In de padverkenner smelten ze samen met 1 en 7 (mergeTok): "4 gestart · 2 verstuurd".
    8: { label: 'Formulier gestart', short: 'Formulier', icon: 'pencil-line' },
    9: { label: 'Offerte gestart', short: 'Offerte', icon: 'pencil-line' },
    10: { label: 'Offerte gestart (geschat)', short: 'Offerte', icon: 'pencil-line' }
  };
  /** Gestart-maar-niet-verstuurd hoort in dezelfde kaart als verstuurd. */
  function mergeTok(t) { return t === -8 ? -1 : (t === -9 || t === -10) ? -7 : t; }
  // Het DOEL van de padverkenner. `kinds` = de acties hierboven, `flags` = de
  // vlaggen uit lib/behaviour.js (om per doel te tellen zonder elk pad te lezen).
  var GOALS = {
    aanvraag: { label: 'Aanvraag', kort: 'een aanvraag', naam: 'aanvraag', kinds: [1, 2, 7], flags: ['form', 'calendly'] },
    of: { label: 'Offerte aangevraagd', kort: 'een offerteaanvraag', naam: 'offerte', kinds: [7], flags: ['offerte'] },
    reg: { label: 'Registratie gestart', kort: 'een registratie', naam: 'registratie', kinds: [6], flags: ['register'] },
    nb: { label: 'Nieuwsbrief', kort: 'een nieuwsbriefinschrijving', naam: 'nieuwsbrief', kinds: [4], flags: ['newsletter'] },
    ev: { label: 'Event', kort: 'een event-inschrijving', naam: 'event', kinds: [3], flags: ['event'] },
    ac: { label: 'Academy', kort: 'een academy-inschrijving', naam: 'academy', kinds: [5], flags: ['academy'] },
    any: { label: 'Elke actie', kort: 'een actie', naam: 'actie', kinds: [1, 2, 3, 4, 5, 6, 7], flags: ['form', 'calendly', 'register', 'newsletter', 'event', 'academy'] }
  };
  var GOAL_ORDER = ['aanvraag', 'of', 'reg', 'nb', 'ev', 'ac', 'any'];
  // De successkleur van het thema: alles wat een actie is, staat in het groen.
  var GOOD = 'oklch(var(--su))';
  // De primaire kleur van het daisyUI-THEMA, niet een vaste kleur: zo volgt alles
  // het thema (ook donker). In HTML/SVG rechtstreeks als CSS-variabele; voor de
  // canvas van Chart.js moet de waarde uitgelezen worden (canvas kent geen var()).
  // daisyUI 4 bewaart --p als "L C H" (oklch-componenten).
  var ACCENT = 'oklch(var(--p))';
  function themeColor(alpha) {
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue('--p').trim(); } catch (_) { v = ''; }
    if (!v) return alpha === undefined ? '#2563eb' : 'rgba(37,99,235,' + alpha + ')';
    return 'oklch(' + v + (alpha === undefined ? '' : ' / ' + alpha) + ')';
  }
  /** Vlak onder de lijn: de themakleur bovenaan, naar transparant onderaan. */
  function areaGradient(context) {
    var chart = context.chart, area = chart.chartArea;
    if (!area) return themeColor(0.15);
    var g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, themeColor(0.35));
    g.addColorStop(1, themeColor(0));
    return g;
  }
  var sparkId = 0;
  var DEV_LABELS = { desktop: 'Desktop', mobile: 'Mobiel', tablet: 'Tablet' };
  var PERIODS = { '7d': 'laatste 7 dagen', '30d': 'laatste 30 dagen', '90d': 'laatste 90 dagen', '12m': 'laatste 12 maanden' };

  var st = {
    period: '30d', data: null, F: null, loading: false, chart: null, metric: 'sessions', showTable: false,
    // purpose: 'prospect' (standaard) | 'customer' | 'all'. Klant = vanaf de eerste login (web-visits.js).
    f: { site: null, ch: null, det: null, land: null, visited: null, dev: null, who: 'all', conv: 'all', visit: 'all', purpose: 'prospect' },
    pins: {},           // vooruit: stap (0-based) -> token (pagina >= 0, actie < 0)
    bpins: {},          // naar het doel: afstand (1 = vlak ervoor, 0 = het doel, -1 = daarna) -> token
    ppins: {},          // rond een pagina: afstand (1 = vlak ervoor, 0 = de pagina, -1 = vlak erna) -> token
    focusV: null,       // vooruit: de stap van de vastgezette pagina onder de loep (leeg = de diepste)
    // mode: 'fwd' | 'back' | 'page'. page = de pagina in het midden, op NAAM (het ruwe
    // pad): het volgnummer verschilt per geladen periode. pb/pa = stappen ervoor en erna.
    flow: { mode: 'fwd', goal: 'aanvraag', n: 4, page: null, pb: 2, pa: 2 },
    sort: { key: 'n', dir: -1 }, pageQuery: '', pageLimit: 20,
    // De lijst onderaan: per bezoek of per persoon, de sortering, de zoekopdracht en hoeveel er staan.
    ses: { view: 'visits', sort: 'recent', q: '', limit: 25 }
  };

  // ── Filters bewaren (per gebruiker, in deze browser) ─────────────────────────
  // Bij herladen of een later bezoek staat alles terug zoals je het liet, ook de
  // periode. De cache van de server bepaalt enkel hoe SNEL dat laadt, niet wat.
  // Keuzelijsten bewaren een NAAM ("Betaald zoeken", "/syndicus-gent/"), geen
  // volgnummer: dat nummer verschilt per geladen periode. Na het laden wordt de
  // naam opnieuw opgezocht; bestaat ze in die periode niet, dan valt die ene filter
  // weg in plaats van alles leeg te maken. Spelden in de padverkenner worden niet
  // bewaard: dat is verkennen, geen instelling. De STAND van de padverkenner
  // (richting, doel, aantal stappen, de pagina in het midden) wel.
  // localStorage kan ontbreken (privévenster, geblokkeerde site-data): dan werkt
  // alles gewoon, enkel zonder geheugen.
  var STORE_KEY = 'webgedrag.gedrag.v1';
  var NAMED = { site: 'site', ch: 'ch', det: 'det', dev: 'dev', land: 'p', visited: 'p' };
  var SCALAR = ['purpose', 'who', 'conv', 'visit'];
  var pendingNames = null;

  function namesOf() {
    var out = {};
    Object.keys(NAMED).forEach(function (k) {
      if (st.f[k] !== null && st.data) out[k] = st.data.dict[NAMED[k]][st.f[k]];
    });
    return out;
  }

  function applyNames(names) {
    if (!names || !st.data) return;
    Object.keys(NAMED).forEach(function (k) {
      if (names[k] === undefined) { st.f[k] = null; return; }
      var i = st.data.dict[NAMED[k]].indexOf(names[k]);
      st.f[k] = i >= 0 ? i : null;
    });
  }

  function saveState() {
    try {
      var f = {};
      SCALAR.forEach(function (k) { f[k] = st.f[k]; });
      localStorage.setItem(STORE_KEY, JSON.stringify({ period: st.period, metric: st.metric, sort: st.sort, f: f, names: namesOf(), flow: st.flow, ses: { view: st.ses.view, sort: st.ses.sort } }));
    } catch (_) { /* geen opslag beschikbaar */ }
  }

  function restoreState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      if (PERIODS[s.period]) st.period = s.period;
      if (['sessions', 'eng', 'conv'].indexOf(s.metric) >= 0) st.metric = s.metric;
      if (s.sort && typeof s.sort.key === 'string') st.sort = { key: s.sort.key, dir: s.sort.dir < 0 ? -1 : 1 };
      SCALAR.forEach(function (k) { if (s.f && typeof s.f[k] === 'string') st.f[k] = s.f[k]; });
      pendingNames = s.names || null;
      if (s.ses) {
        if (s.ses.view === 'visits' || s.ses.view === 'persons') st.ses.view = s.ses.view;
        if (SES_SORTS[st.ses.view].some(function (c) { return c[0] === s.ses.sort; })) st.ses.sort = s.ses.sort;
      }
      if (s.flow) {
        if (s.flow.mode === 'fwd' || s.flow.mode === 'back' || s.flow.mode === 'page') st.flow.mode = s.flow.mode;
        if (GOALS[s.flow.goal]) st.flow.goal = s.flow.goal;
        var n = Math.round(Number(s.flow.n));
        if (n >= MIN_STEPS && n <= MAX_STEPS) st.flow.n = n;
        if (typeof s.flow.page === 'string' && s.flow.page) st.flow.page = s.flow.page;
        ['pb', 'pa'].forEach(function (k) {
          var x = Math.round(Number(s.flow[k]));
          if (x >= MIN_SIDE && x <= MAX_SIDE) st.flow[k] = x;
        });
      }
    } catch (_) { /* kapotte of geen opslag: met de standaard beginnen */ }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nf(n, d) { return (n || 0).toLocaleString('nl-BE', { maximumFractionDigits: d === undefined ? 0 : d }); }
  function pct(a, b) { return b > 0 ? a / b * 100 : null; }
  function pctTxt(p) { return p === null ? '—' : nf(p, p < 10 ? 1 : 0) + '%'; }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function durTxt(sec) {
    if (sec === null || sec === undefined) return '—';
    sec = Math.round(sec);
    if (sec < 60) return sec + 's';
    var m = Math.floor(sec / 60), r = sec % 60;
    return m < 60 ? m + 'm' + (r ? ' ' + r + 's' : '') : Math.floor(m / 60) + 'u ' + (m % 60) + 'm';
  }
  function d(kind, i) { return i >= 0 && st.data ? st.data.dict[kind][i] : null; }
  // "/" heet overal Homepage: een losse slash leest niet als een pagina. Het pad is
  // over de sites heen gedeeld (dict.p), dus met twee sites zijn dat beide homepages.
  function pageName(i) { var p = d('p', i) || '?'; return p === '/' ? 'Homepage' : p; }
  function siteName(i) { return String(d('site', i) || '').replace(/^www\./, ''); }
  function short(p, max) { p = String(p || ''); max = max || 34; return p.length > max ? '…' + p.slice(p.length - max + 1) : p; }
  function chColor(ch) { return (window.WebGedrag && window.WebGedrag.colors && window.WebGedrag.colors[ch]) || '#94a3b8'; }
  function dot(color) { return '<span class="inline-block w-2 h-2 rounded-full shrink-0" style="background-color:' + color + '"></span>'; }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  /** Pagina's van een sessie zonder opeenvolgende herhalingen (herladen, terugkeren naar dezelfde tab). */
  function path(s) {
    if (s._p) return s._p;
    var out = [], offs = [], pg = s[C.pages], of = s[C.offs];
    for (var i = 0; i < pg.length; i++) {
      if (out.length && out[out.length - 1] === pg[i]) continue;
      out.push(pg[i]); offs.push(of[i]);
    }
    s._p = out; s._o = offs;
    return out;
  }
  function converted(s) { return (s[C.flags] & CONV) !== 0; }

  // ── Personen (lib/behaviour.js: `persons` + dict.pe) ───────────────────────
  // Een persoon = het eerste adres dat een browser gebruikte; een anonieme browser
  // telt als eigen persoon. "7 bezoeken" leest als zeven mensen, terwijl het één
  // persoon kan zijn die zeven keer langskwam: daarom staat het aantal personen
  // overal naast het aantal bezoeken.
  function personIdx(s) { return st.data && st.data.persons ? st.data.persons[s[C.v]] : -1; }
  function personKey(s) { var p = personIdx(s); return p >= 0 ? 'p' + p : 'v' + s[C.v]; }
  function personLabel(s) { var p = personIdx(s); return p >= 0 ? d('pe', p) : null; }
  function personCount(list) { var m = {}; list.forEach(function (s) { m[personKey(s)] = 1; }); return Object.keys(m).length; }
  function personWord(n) { return n === 1 ? 'persoon' : 'personen'; }
  function dayTxt(unix) { return new Date(unix * 1000).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' }); }

  /**
   * Het pad MET de acties erin: pagina's als volgnummer (>= 0), acties als -code,
   * elke actie direct na de pagina waarop ze gebeurde. Herladen telt niet als stap
   * (zelfde regel als path(), ook niet na een actie: na versturen landt een
   * formulier vaak terug op dezelfde pagina), en dezelfde actie twee keer na
   * elkaar ook niet. s._so = seconden na de start, per stap.
   */
  function steps(s) {
    if (s._s) return s._s;
    var pg = s[C.pages], of = s[C.offs], acts = s[C.acts] || [], out = [], so = [], at = {};
    acts.forEach(function (a) { (at[a[0]] = at[a[0]] || []).push(a); });
    var lastPage, lastTok;
    function addAct(a) {
      var t = -a[1];
      if (t === lastTok) return;
      out.push(t); so.push(a[2]); lastTok = t;
    }
    (at[-1] || []).forEach(addAct);
    for (var i = 0; i < pg.length; i++) {
      if (pg[i] !== lastPage) { out.push(pg[i]); so.push(of[i]); lastPage = pg[i]; lastTok = pg[i]; }
      (at[i] || []).forEach(addAct);
    }
    s._s = out; s._so = so;
    return out;
  }
  /** Waar in steps() het gekozen doel de EERSTE keer gebeurt; -1 = niet. */
  function goalIdx(s) {
    var p = steps(s), kinds = GOALS[st.flow.goal].kinds;
    for (var i = 0; i < p.length; i++) if (p[i] < 0 && kinds.indexOf(-p[i]) >= 0) return i;
    return -1;
  }
  function tokName(t) { return t === ENTRY ? 'Komt binnen' : t < 0 ? (ACT[-t] ? ACT[-t].label : 'Actie') : pageName(t); }
  function stepWord(n) { return n === 1 ? 'stap' : 'stappen'; }

  /**
   * De pagina in het midden (stand "rond een pagina") als volgnummer in de geladen
   * periode; -1 = geen gekozen, of ze komt in deze periode niet voor. st.flow.page is
   * het RUWE pad uit dict.p ("/" en niet "Homepage"), net als de filters op naam.
   * Onthouden per dataset: anders loopt elke sessie bij elke render dezelfde lijst af.
   */
  var focusMemo = { data: null, page: null, idx: -1 };
  function focusPage() {
    if (!st.data || !st.flow.page) return -1;
    if (focusMemo.data !== st.data || focusMemo.page !== st.flow.page) {
      focusMemo = { data: st.data, page: st.flow.page, idx: st.data.dict.p.indexOf(st.flow.page) };
    }
    return focusMemo.idx;
  }
  /** Het pad zoals het in st.flow.page staat, leesbaar ("/" heet Homepage). */
  function rawPageText(p) { return p === '/' ? 'Homepage' : String(p || ''); }
  /** Waarop een bezoek uitgelijnd wordt: de eerste keer het doel, of de eerste keer de pagina in het midden. -1 = niet. */
  function alignIdx(s) {
    if (st.flow.mode === 'back') return goalIdx(s);
    var t = focusPage();
    return t < 0 ? -1 : steps(s).indexOf(t);
  }
  /** Het token op positie k van een pad: ENTRY net voor de eerste stap (daar begint het bezoek), undefined nog daarvoor. */
  function tokAt(p, k) { return k >= 0 ? p[k] : k === -1 ? ENTRY : undefined; }
  function curPins() { return st.flow.mode === 'back' ? st.bpins : st.flow.mode === 'page' ? st.ppins : st.pins; }

  /**
   * Het hoeveelste bezoek van die bezoeker (s._vn, 0 = het eerste dat we ZIEN).
   * Telt alleen wat in de geladen gegevens zit: de periode en de periode daarvoor.
   * Een bezoek met _vn 0 dat niet "nieuw" is, had dus eerdere bezoeken die langer
   * geleden zijn. s._vx = het eerste geladen bezoek van die bezoeker IS zijn eerste
   * bezoek ooit: enkel dan klopt een nummer als "3e bezoek".
   */
  function numberVisits(data) {
    var by = {};
    data.sessions.forEach(function (s) { (by[s[C.v]] = by[s[C.v]] || []).push(s); });
    Object.keys(by).forEach(function (v) {
      var list = by[v].sort(function (a, b) { return a[C.start] - b[C.start]; });
      var exact = !!(list[0][C.flags] & data.flags.isNew);
      list.forEach(function (s, i) { s._vn = i; s._vx = exact; });
    });
  }

  // ── Segment ────────────────────────────────────────────────────────────────

  function matches(s, ignorePurpose) { return matchesF(s, st.f, ignorePurpose); }
  function matchesF(s, f, ignorePurpose) {
    var fl = s[C.flags], F = st.F;
    if (!ignorePurpose && f.purpose === 'prospect' && (fl & F.customer)) return false;
    if (!ignorePurpose && f.purpose === 'customer' && !(fl & F.customer)) return false;
    if (f.site !== null && s[C.site] !== f.site) return false;
    if (f.ch !== null && s[C.ch] !== f.ch) return false;
    if (f.det !== null && s[C.det] !== f.det) return false;
    if (f.dev !== null && s[C.dev] !== f.dev) return false;
    if (f.land !== null && path(s)[0] !== f.land) return false;
    if (f.visited !== null && path(s).indexOf(f.visited) < 0) return false;
    if (f.who === 'anon' && (fl & F.known)) return false;
    if (f.who === 'known' && !(fl & F.known)) return false;
    if (f.who === 'lead' && !(fl & F.linked)) return false;
    if (f.conv === 'yes' && !converted(s)) return false;
    if (f.conv === 'of' && !(fl & F.offerte)) return false;
    if (f.conv === 'reg' && !(fl & F.register)) return false;
    if (f.conv === 'nb' && !(fl & F.newsletter)) return false;
    if (f.conv === 'ev' && !(fl & F.event)) return false;
    if (f.conv === 'ac' && !(fl & F.academy)) return false;
    if (f.conv === 'no' && (fl & ALLE_ACTIES)) return false;
    if (f.visit === 'new' && !(fl & F.isNew)) return false;
    if (f.visit === 'return' && (fl & F.isNew)) return false;
    return true;
  }
  function pinned(s) {
    var mode = st.flow.mode, p = steps(s), k;
    if (mode === 'fwd') {
      for (k in st.pins) if (mergeTok(p[k]) !== st.pins[k]) return false;
      return true;
    }
    // Naar het doel toe zonder spelden: alles (buildFlow neemt zelf enkel de bezoeken
    // met het doel). Rond een pagina is de pagina zelf al een speld: ook de paden, per
    // pagina en de recente bezoeken tonen dan enkel bezoeken die ze bekeken.
    var pins = mode === 'back' ? st.bpins : st.ppins;
    if (mode === 'back' && !Object.keys(pins).length) return true;
    var a = alignIdx(s);
    if (a < 0) return false;
    for (k in pins) if (mergeTok(tokAt(p, a - Number(k))) !== pins[k]) return false;
    return true;
  }
  function split() {
    var cur = [], prev = [];
    st.data.sessions.forEach(function (s) {
      if (!matches(s)) return;
      (s[C.flags] & st.F.previous ? prev : cur).push(s);
    });
    return { cur: cur, prev: prev };
  }

  // ── Kerncijfers ────────────────────────────────────────────────────────────

  function stats(list) {
    var n = list.length, eng = 0, bounce = 0, conv = 0, pages = 0, durs = [], scroll = 0;
    list.forEach(function (s) {
      var p = path(s).length;
      pages += p;
      durs.push(s[C.dur]);
      if (s[C.flags] & st.F.engaged) eng++;
      else if (p <= 1) bounce++;
      if (converted(s)) conv++;
      if (s[C.scroll] >= 75) scroll++;
    });
    var acties = { reg: 0, nb: 0, ev: 0, ac: 0, of: 0 };
    list.forEach(function (s) {
      var fl = s[C.flags];
      if (fl & st.F.offerte) acties.of++;
      if (fl & st.F.register) acties.reg++;
      if (fl & st.F.newsletter) acties.nb++;
      if (fl & st.F.event) acties.ev++;
      if (fl & st.F.academy) acties.ac++;
    });
    return { n: n, dur: median(durs), pages: n ? pages / n : null, eng: pct(eng, n), bounce: pct(bounce, n), conv: pct(conv, n), scroll: pct(scroll, n), convN: conv,
      reg: pct(acties.reg, n), nb: pct(acties.nb, n), ev: pct(acties.ev, n), ac: pct(acties.ac, n),
      regN: acties.reg, nbN: acties.nb, evN: acties.ev, acN: acties.ac,
      of: pct(acties.of, n), ofN: acties.of };
  }

  function delta(cur, prev, kind, upIsGood) {
    if (cur === null) return '';
    // Geen bezoeken in de vorige, even lange periode (bv. een segment dat pas sinds de
    // zomer bestaat): zeggen, niet zwijgen -- een lege plek leest als een fout.
    var leeg = '<span class="text-xs text-base-content/40" title="In de vorige, even lange periode waren er geen bezoeken in dit segment: er is niets om mee te vergelijken.">vorige periode: geen bezoeken</span>';
    if (prev === null || prev === undefined) return leeg;
    var diff, txt;
    if (kind === 'pct') { diff = cur - prev; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 1) + ' ptn'; }
    else { if (!prev) return leeg; diff = (cur - prev) / prev * 100; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 0) + '%'; }
    if (Math.abs(diff) < (kind === 'pct' ? 0.5 : 2)) return '<span class="text-xs text-base-content/50">gelijk aan vorige periode</span>';
    var good = (diff > 0) === upIsGood;
    return '<span class="text-xs font-medium ' + (good ? 'text-success' : 'text-error') + '">' + (diff > 0 ? '▲ ' : '▼ ') + txt + '</span>'
      + '<span class="text-xs text-base-content/50"> vs vorige</span>';
  }

  /**
   * Een vloeiende lijn door de punten, zonder overschot: monotone kubische
   * interpolatie (Fritsch-Carlson). Een gewone Bezier-golf schiet tussen twee punten
   * onder het laagste of boven het hoogste uit, en dan toont een mini-verloop een dal
   * onder nul dat er niet is.
   */
  function smoothPath(p) {
    var f = function (v) { return v.toFixed(1); };
    var d = 'M' + f(p[0][0]) + ',' + f(p[0][1]), n = p.length, i;
    if (n < 3) { for (i = 1; i < n; i++) d += 'L' + f(p[i][0]) + ',' + f(p[i][1]); return d; }
    var dx = [], m = [], t = [];
    for (i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var tau = 3 / Math.sqrt(s); t[i] = tau * a * m[i]; t[i + 1] = tau * b * m[i]; }
    }
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += 'C' + f(p[i][0] + h) + ',' + f(p[i][1] + t[i] * h) + ' ' + f(p[i + 1][0] - h) + ',' + f(p[i + 1][1] - t[i + 1] * h)
        + ' ' + f(p[i + 1][0]) + ',' + f(p[i + 1][1]);
    }
    return d;
  }

  /**
   * Een mini-verloop: enkel de vorm, geen as. Het is EXACT de reeks die het venster
   * opent (de gekozen periode, per dag/week/maand, lege emmers als 0 of als gat).
   */
  function sparkline(values) {
    var pts = values.map(function (v, i) { return [i, v]; }).filter(function (p) { return p[1] !== null && p[1] !== undefined; });
    if (pts.length < 2) return '';
    var w = 72, h = 24, max = Math.max.apply(null, pts.map(function (p) { return p[1]; })), min = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    var n = values.length - 1 || 1, span = max - min || 1;
    var xy = pts.map(function (p) { return [p[0] / n * (w - 4) + 2, h - 3 - (p[1] - min) / span * (h - 6)]; });
    var line = smoothPath(xy);
    var area = line + 'L' + xy[xy.length - 1][0].toFixed(1) + ',' + (h - 1) + 'L' + xy[0][0].toFixed(1) + ',' + (h - 1) + 'Z';
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">'
      // Eigen id per lijntje: zes tegels op een pagina, dus zes verlopen.
      + '<defs><linearGradient id="bhSpark' + (++sparkId) + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" style="stop-color:' + ACCENT + ';stop-opacity:0.35"></stop>'
      + '<stop offset="1" style="stop-color:' + ACCENT + ';stop-opacity:0"></stop></linearGradient></defs>'
      + '<path d="' + area + '" fill="url(#bhSpark' + sparkId + ')"></path>'
      + '<path d="' + line + '" fill="none" style="stroke:' + ACCENT + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg>';
  }

  // Vanaf 2xl staan de kerncijfers in een smalle kolom rechts. Daar is een tegel te
  // hoog (tien onder elkaar gaven een schuifbalk): dan een lijstregel, met het label,
  // de waarde en het verschil links en het mini-verloop rechts. Wisselt het scherm
  // over die grens, dan tekent render() opnieuw (luisteraar onderaan).
  var KPI_COMPACT = window.matchMedia ? window.matchMedia('(min-width: 1536px)') : null;
  function tile(label, value, deltaHtml, help, metric, series) {
    var spark = series ? sparkline(series) : '';
    if (KPI_COMPACT && KPI_COMPACT.matches) {
      return '<div class="flex items-center gap-2 py-2">'
        + '<div class="min-w-0 flex-1">'
        +   '<div class="text-xs text-base-content/60 truncate" title="' + esc(help || label) + '">' + esc(label) + '</div>'
        +   '<div class="flex flex-wrap items-baseline gap-x-2"><span class="text-lg font-semibold leading-tight">' + value + '</span>'
        +   '<span class="leading-tight">' + deltaHtml + '</span></div>'
        + '</div>'
        + (spark ? '<button type="button" class="shrink-0 rounded-md p-1 om-hover focus:outline-none focus:ring-2 focus:ring-primary/40" '
          + 'data-bh-action="kpi-chart" data-metric="' + metric + '" title="' + esc(sparkTitle()) + '" aria-label="Toon het verloop van ' + esc(label) + '">' + spark + '</button>' : '')
        + '</div>';
    }
    return '<div class="relative rounded-xl border border-base-content/10 bg-base-100 p-4">'
      + (spark ? '<button type="button" class="absolute top-2 right-2 rounded-md p-1 om-hover focus:outline-none focus:ring-2 focus:ring-primary/40" '
        + 'data-bh-action="kpi-chart" data-metric="' + metric + '" title="' + esc(sparkTitle()) + '" aria-label="Toon het verloop van ' + esc(label) + '">' + spark + '</button>' : '')
      + '<div class="text-xs text-base-content/60 pr-20" title="' + esc(help || '') + '">' + esc(label) + '</div>'
      + '<div class="text-2xl font-semibold mt-1">' + value + '</div>'
      + '<div class="mt-1 min-h-[1rem]">' + deltaHtml + '</div></div>';
  }

  // De zes kerncijfers, op een plek: tegel, mini-verloop en venster lezen hier.
  var METRICS = [
    { key: 'n', label: 'Bezoeken', fmt: function (v) { return nf(v); } },
    { key: 'dur', label: 'Duur (mediaan)', fmt: durTxt },
    { key: 'pages', label: 'Pagina\'s per bezoek', fmt: function (v) { return v === null ? '—' : nf(v, 1); } },
    { key: 'eng', label: 'Doet er iets mee', fmt: pctTxt, pct: true },
    { key: 'bounce', label: 'Haakt meteen af', fmt: pctTxt, pct: true },
    { key: 'conv', label: 'Aanvraag', fmt: pctTxt, pct: true },
    { key: 'of', label: 'Offerte', fmt: pctTxt, pct: true },
    { key: 'reg', label: 'Registratie gestart', fmt: pctTxt, pct: true },
    { key: 'nb', label: 'Nieuwsbrief', fmt: pctTxt, pct: true },
    { key: 'ev', label: 'Event', fmt: pctTxt, pct: true },
    { key: 'ac', label: 'Academy', fmt: pctTxt, pct: true }
  ];
  function metricOf(key) { return METRICS.filter(function (m) { return m.key === key; })[0]; }

  /** Per metriek de waarden per dag/week/maand van de gekozen periode (zelfde indeling als de trend). */
  // Alle emmers van de periode, ook de lege: een week zonder bezoeken is een 0 (of
  // een gat bij een percentage), net als in het venster. Eerst vielen lege emmers weg,
  // en dan had het mini-verloop een andere vorm dan de grafiek die het opent.
  function sparkSeries(cur) {
    var groups = {}, keys = periodKeys();
    cur.forEach(function (s) { var k = bucketOf(s[C.start]); (groups[k] = groups[k] || []).push(s); });
    var per = keys.map(function (k) { return stats(groups[k] || []); });
    var out = {};
    METRICS.forEach(function (m) { out[m.key] = per.map(function (x) { return x[m.key]; }); });
    return out;
  }

  function renderSummary(cur, prev) {
    var a = stats(cur), b = stats(prev);
    // Het gemiddelde bezoek, in gewone taal.
    var land = {};
    cur.forEach(function (s) { var p = path(s)[0]; if (p !== undefined) land[p] = (land[p] || 0) + 1; });
    var top = Object.keys(land).sort(function (x, y) { return land[y] - land[x]; })[0];
    // Een pad is over de sites heen gedeeld: met twee sites in het segment is "de
    // homepage" die van beide. Dan staat erbij op welke site die instap lag, met
    // aandelen van ALLE bezoeken, zodat ze optellen tot het totaal ervoor.
    var topTxt = '', topSites = '';
    if (top !== undefined) {
      var perSite = {}, siteSet = {};
      cur.forEach(function (s) {
        if (s[C.site] >= 0) siteSet[s[C.site]] = 1;
        if (String(path(s)[0]) === top && s[C.site] >= 0) perSite[s[C.site]] = (perSite[s[C.site]] || 0) + 1;
      });
      var waar = Object.keys(perSite).sort(function (x, y) { return perSite[y] - perSite[x]; });
      topTxt = pageName(top) === 'Homepage' ? 'de homepage' : esc(short(pageName(top), 48));
      if (Object.keys(siteSet).length > 1 && waar.length === 1) topTxt += ' van ' + esc(siteName(Number(waar[0])));
      else if (Object.keys(siteSet).length > 1 && waar.length > 1) {
        topSites = ': ' + waar.map(function (k) { return esc(siteName(Number(k))) + ' ' + pctTxt(pct(perSite[k], a.n)); }).join(', ');
      }
    }
    var hero = $('bhHero');
    if (!a.n) {
      hero.innerHTML = '<p class="text-base-content/70">Geen bezoeken in dit segment. Maak het segment ruimer.</p>';
    } else {
      hero.innerHTML = '<p class="text-lg 2xl:text-sm leading-relaxed">Het gemiddelde bezoek duurt <strong>' + durTxt(a.dur) + '</strong>, '
        + 'bekijkt <strong>' + nf(a.pages, 1) + ' pagina\'s</strong>'
        + (top !== undefined ? ' en begint het vaakst op <a class="link link-primary" data-bh-action="filter" data-key="land" data-value="' + top + '">' + topTxt + '</a> (' + pctTxt(pct(land[top], a.n)) + topSites + ')' : '')
        + '. <strong>' + pctTxt(a.eng) + '</strong> doet er iets mee; <strong>' + pctTxt(a.conv) + '</strong> eindigt in een aanvraag.</p>';
    }
    var sp = sparkSeries(cur);
    $('bhTiles').innerHTML =
      tile('Bezoeken', nf(a.n) + '<span class="text-sm font-normal text-base-content/50"> · ' + nf(personCount(cur)) + ' ' + personWord(personCount(cur)) + '</span>',
        delta(a.n, b.n, 'n', true), 'Bezoeken (sessies) in dit segment, en door hoeveel personen. Een persoon = een e-mailadres; een anonieme browser telt apart.', 'n', sp.n) +
      tile('Duur (mediaan)', durTxt(a.dur), delta(a.dur, b.dur, 'n', true), 'De helft van de bezoeken duurt korter, de helft langer', 'dur', sp.dur) +
      tile('Pagina\'s per bezoek', a.pages === null ? '—' : nf(a.pages, 1), delta(a.pages, b.pages, 'n', true), 'Herladen van dezelfde pagina telt niet', 'pages', sp.pages) +
      tile('Doet er iets mee', pctTxt(a.eng), delta(a.eng, b.eng, 'pct', true), 'Meer dan één pagina, een klik, scrollen, of langer dan 5 seconden', 'eng', sp.eng) +
      tile('Haakt meteen af', pctTxt(a.bounce), delta(a.bounce, b.bounce, 'pct', false), 'Eén pagina en verder niets', 'bounce', sp.bounce) +
      tile('Aanvraag', pctTxt(a.conv), delta(a.conv, b.conv, 'pct', true), nf(a.convN) + ' contact- of offerteformulieren en Calendly-afspraken', 'conv', sp.conv);
    // Andere belangrijke acties: geen aanvraag, maar wel een stap. Met het aantal erbij.
    var aantal = function (x) { return ' <span class="text-sm font-normal text-base-content/50">(' + nf(x) + ')</span>'; };
    $('bhActions').innerHTML =
      tile('Offerte aangevraagd', pctTxt(a.of) + aantal(a.ofN), delta(a.of, b.of, 'pct', true), 'Een offerteaanvraag: een inzending van een koppeling die op "Offerte" staat. Telt ook mee in Aanvraag.', 'of', sp.of) +
      tile('Registratie gestart', pctTxt(a.reg) + aantal(a.regN), delta(a.reg, b.reg, 'pct', true), 'Klik op een knop naar het platform (Start gratis op, Start je gebouwscan, Registreer ...). Of de registratie daar afgerond werd, zien we (nog) niet.', 'reg', sp.reg) +
      tile('Nieuwsbrief', pctTxt(a.nb) + aantal(a.nbN), delta(a.nb, b.nb, 'pct', true), 'Inschrijving op een nieuwsbrief', 'nb', sp.nb) +
      tile('Event', pctTxt(a.ev) + aantal(a.evN), delta(a.ev, b.ev, 'pct', true), 'Inschrijving voor een event', 'ev', sp.ev) +
      tile('Academy', pctTxt(a.ac) + aantal(a.acN), delta(a.ac, b.ac, 'pct', true), 'Inschrijving in de academy', 'ac', sp.ac);
  }

  // ── Trend ──────────────────────────────────────────────────────────────────

  var fmtDay = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short' });
  var keyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' });

  function bucketOf(unix) {
    var dt = new Date(unix * 1000), k = keyDay.format(dt);
    if (st.period === '12m') return k.slice(0, 7);
    if (st.period === '90d') {
      var x = new Date(k + 'T00:00:00Z'), wd = (x.getUTCDay() + 6) % 7;
      x.setUTCDate(x.getUTCDate() - wd);
      return x.toISOString().slice(0, 10);
    }
    return k;
  }

  /** Alle emmers (dag/week/maand) van de gekozen periode, ook de lege. */
  function periodKeys() {
    var keys = [], t = Date.parse(st.data.range.start + 'Z') / 1000, end = Date.parse(st.data.range.end + 'Z') / 1000;
    for (; t <= end; t += 86400) { var k = bucketOf(t); if (keys.indexOf(k) < 0) keys.push(k); }
    return keys;
  }
  function unitName() { return st.period === '12m' ? 'maand' : st.period === '90d' ? 'week' : 'dag'; }
  function bucketLabel(k) {
    var unit = unitName();
    return unit === 'maand' ? new Date(k + '-01T12:00:00Z').toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' })
      : (unit === 'week' ? 'wk ' : '') + fmtDay.format(new Date(k + 'T12:00:00Z'));
  }
  function sparkTitle() { return 'Verloop over de ' + PERIODS[st.period] + ', per ' + unitName() + '. Klik voor de grafiek.'; }

  function renderTrend(cur, prev) {
    var unit = unitName();
    var shift = st.data.days * 86400;
    function series(list, offset) {
      var m = {};
      list.forEach(function (s) {
        var k = bucketOf(s[C.start] + offset);
        var g = m[k] || (m[k] = { n: 0, eng: 0, conv: 0 });
        g.n++;
        if (s[C.flags] & st.F.engaged) g.eng++;
        if (converted(s)) g.conv++;
      });
      return m;
    }
    var a = series(cur, 0), b = series(prev, shift);
    var keys = periodKeys();
    var val = function (g) {
      if (!g) return st.metric === 'sessions' ? 0 : null;
      if (st.metric === 'sessions') return g.n;
      return g.n ? Math.round((st.metric === 'eng' ? g.eng : g.conv) / g.n * 1000) / 10 : null;
    };
    var labels = keys.map(bucketLabel);
    var cur_ = keys.map(function (k) { return val(a[k]); }), prev_ = keys.map(function (k) { return val(b[k]); });
    var label = { sessions: 'Bezoeken', eng: 'Doet er iets mee (%)', conv: 'Aanvraag (%)' }[st.metric];
    $('bhTrendTitle').textContent = label + ' per ' + unit;

    var cs = getComputedStyle(document.body);
    var ink = cs.color || '#374151';
    if (st.chart) st.chart.destroy();
    st.chart = new Chart($('bhTrendChart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Deze periode', data: cur_, borderColor: themeColor(), backgroundColor: areaGradient, fill: true, borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: themeColor(), spanGaps: true },
          { label: 'Vorige periode', data: prev_, borderColor: '#94a3b8', borderWidth: 1.5, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, fill: false, spanGaps: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(127,127,127,0.12)' }, border: { display: false },
            ticks: { color: ink, precision: 0, font: { size: 11 }, callback: function (v) { return st.metric === 'sessions' ? nf(v) : v + '%'; } } }
        },
        plugins: {
          legend: { position: 'bottom', align: 'end', labels: { color: ink, boxWidth: 12, boxHeight: 2, font: { size: 11 } } },
          tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (c.parsed.y === null ? '—' : st.metric === 'sessions' ? nf(c.parsed.y) : nf(c.parsed.y, 1) + '%'); } } }
        }
      }
    });
    // Tabelweergave: elke waarde is ook zonder hover leesbaar.
    $('bhTrendTable').innerHTML = st.showTable
      ? '<table class="table table-xs mt-3"><thead><tr><th>' + unit + '</th><th class="text-right">Deze periode</th><th class="text-right">Vorige</th></tr></thead><tbody>'
        + labels.map(function (l, i) { return '<tr><td>' + esc(l) + '</td><td class="text-right">' + (cur_[i] === null ? '—' : nf(cur_[i], 1)) + '</td><td class="text-right">' + (prev_[i] === null ? '—' : nf(prev_[i], 1)) + '</td></tr>'; }).join('')
        + '</tbody></table>' : '';
    document.querySelectorAll('[data-bh-action="metric"]').forEach(function (b) { b.classList.toggle('btn-active', b.dataset.value === st.metric); });
  }

  // ── Venster: het verloop van een kerncijfer over een langere periode ───────
  // Welke periode bij welke keuze hoort. `data` is de serverperiode waaruit we
  // lezen: elke serverperiode levert ook de vorige, even lange mee, dus 90d dekt
  // 6 maanden en 12m dekt 24 maanden. Zo is er geen nieuwe route nodig.
  var LONG = {
    '7d': { data: '90d', unit: 'week', count: 8, label: 'voorbije 8 weken, per week' },
    '30d': { data: '90d', unit: 'week', count: 13, label: 'voorbije 3 maanden, per week' },
    '90d': { data: '12m', unit: 'month', count: 12, label: 'voorbije 12 maanden, per maand' },
    '12m': { data: '12m', unit: 'month', count: 12, label: 'voorbije 12 maanden, per maand' }
  };
  var longCache = {};
  // range: 'periode' = dezelfde reeks als het mini-verloop (zo opent het venster),
  //        'lang' = de ruimere context uit LONG. Eerst opende het venster meteen op
  //        die langere reeks, en dan leek het aangeklikte mini-verloop niet te kloppen.
  var kpi = { metric: 'n', chart: null, table: false, range: 'periode' };

  function weekKey(unix) {
    var x = new Date(keyDay.format(new Date(unix * 1000)) + 'T00:00:00Z'), wd = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - wd);
    return x.toISOString().slice(0, 10);
  }
  function monthKey(unix) { return keyDay.format(new Date(unix * 1000)).slice(0, 7); }

  /** Dezelfde filters, maar met de volgnummers van een ANDERE dataset (op naam omgezet). */
  function filtersFor(ds) {
    var f = Object.assign({}, st.f);
    Object.keys(NAMED).forEach(function (k) {
      if (st.f[k] === null) return;
      var name = st.data.dict[NAMED[k]][st.f[k]];
      var i = ds.dict[NAMED[k]].indexOf(name);
      f[k] = i >= 0 ? i : -2;   // -2 = bestaat daar niet: niets past
    });
    return f;
  }

  async function longData(period) {
    if (period === st.period && st.data) return st.data;
    if (longCache[period]) return longCache[period];
    var res = await fetch('/webgedrag/api/behaviour?period=' + period, { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var j = await res.json();
    if (!j.success || !j.data.available) throw new Error(j.error || (j.data && j.data.reason) || 'Geen gegevens');
    longCache[period] = j.data;
    return j.data;
  }

  async function openKpi(metric, range) {
    kpi.metric = metric;
    if (range) kpi.range = range;
    var dlg = $('bhKpiDialog');
    if (!dlg.open) dlg.showModal();
    $('bhKpiBody').style.opacity = '0.5';
    $('bhKpiStatus').innerHTML = '<span class="loading loading-spinner loading-sm"></span> Verloop laden…';
    try {
      if (kpi.range === 'lang' && st.period !== '12m') {
        var cfg = LONG[st.period];
        renderKpi(await longData(cfg.data), longSpec(cfg));
      } else {
        renderKpi(st.data, periodSpec());
      }
      $('bhKpiStatus').innerHTML = '';
    } catch (e) {
      $('bhKpiStatus').innerHTML = '<div class="alert alert-error text-sm">Kon het verloop niet laden: ' + esc(e.message) + '</div>';
    }
    $('bhKpiBody').style.opacity = '1';
  }

  function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /** Dezelfde reeks als het mini-verloop: de gekozen periode, dezelfde emmers. */
  function periodSpec() {
    return { keys: periodKeys(), keyOf: bucketOf, label: bucketLabel, currentOnly: true,
      sub: PERIODS[st.period] + ', per ' + unitName(), head: capFirst(unitName()) };
  }
  /** De ruimere context (LONG), uit een andere serverperiode. */
  function longSpec(cfg) {
    var keyOf = cfg.unit === 'week' ? weekKey : monthKey;
    var now = Date.now() / 1000, keys = [];
    for (var i = cfg.count - 1; i >= 0; i--) {
      var t;
      if (cfg.unit === 'week') t = now - i * 7 * 86400;
      else { var d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); t = d.getTime() / 1000; }
      var k = keyOf(t);
      if (keys.indexOf(k) < 0) keys.push(k);
    }
    return {
      keys: keys, keyOf: keyOf, currentOnly: false, sub: cfg.label, head: cfg.unit === 'week' ? 'Week' : 'Maand',
      label: function (k) {
        return cfg.unit === 'week' ? 'wk ' + fmtDay.format(new Date(k + 'T12:00:00Z'))
          : new Date(k + '-15T12:00:00Z').toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' });
      }
    };
  }

  function renderKpi(ds, spec) {
    var m = metricOf(kpi.metric), f = filtersFor(ds), keys = spec.keys;
    // De reeks perioden, ook die zonder bezoeken: een gat hoort zichtbaar te zijn.
    var groups = {};
    keys.forEach(function (k) { groups[k] = []; });
    ds.sessions.forEach(function (s) {
      // Bij de gekozen periode enkel DEZE periode: een week die vóór het begin start,
      // zou anders ook bezoeken van de vorige periode meetellen (het mini-verloop niet).
      if (spec.currentOnly && (s[C.flags] & st.F.previous)) return;
      if (!matchesF(s, f)) return;
      var k = spec.keyOf(s[C.start]);
      if (groups[k]) groups[k].push(s);
    });
    var vals = keys.map(function (k) { var x = stats(groups[k]); return kpi.metric === 'n' ? x.n : x[kpi.metric]; });
    var labels = keys.map(function (k, i) {
      var lbl = spec.label(k);
      return i === keys.length - 1 ? lbl + ' (lopend)' : lbl;
    });

    $('bhKpiTitle').textContent = m.label;
    $('bhKpiSub').textContent = spec.sub + (active() ? ' · met het segment van hierboven' : ' · alle bezoeken van prospecten');
    $('bhKpiRange').innerHTML = st.period === '12m' ? '' : pills('kpi-range', null,
      [['periode', capFirst(PERIODS[st.period])], ['lang', capFirst(LONG[st.period].label.split(',')[0])]], kpi.range);
    $('bhKpiMetrics').innerHTML = pills('kpi-metric', null, METRICS.map(function (x) { return [x.key, x.label]; }), kpi.metric);

    var ink = getComputedStyle(document.body).color || '#374151';
    if (kpi.chart) kpi.chart.destroy();
    kpi.chart = new Chart($('bhKpiChart'), {
      type: 'line',
      data: { labels: labels, datasets: [{ label: m.label, data: vals, borderColor: themeColor(), backgroundColor: areaGradient, fill: true,
        borderWidth: 2, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: themeColor(),
        pointBorderColor: getComputedStyle(document.body).backgroundColor || '#fff', pointBorderWidth: 2, spanGaps: true }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: ink, maxRotation: 0, autoSkip: true, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(127,127,127,0.12)' }, border: { display: false },
            ticks: { color: ink, font: { size: 11 }, callback: function (v) { return m.pct ? v + '%' : kpi.metric === 'dur' ? durTxt(v) : nf(v, kpi.metric === 'pages' ? 1 : 0); } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ' ' + m.label + ': ' + (c.parsed.y === null ? '—' : m.fmt(c.parsed.y)); },
            afterLabel: function (c) { return ' ' + nf(groups[keys[c.dataIndex]].length) + ' bezoeken'; } } }
        }
      }
    });
    $('bhKpiTable').innerHTML = kpi.table
      ? '<table class="table table-xs mt-3"><thead><tr><th>' + esc(spec.head) + '</th><th class="text-right">' + esc(m.label)
        + '</th><th class="text-right">Bezoeken</th></tr></thead><tbody>'
        + labels.map(function (l, i) { return '<tr><td>' + esc(l) + '</td><td class="text-right">' + (vals[i] === null ? '—' : m.fmt(vals[i])) + '</td><td class="text-right">' + nf(groups[keys[i]].length) + '</td></tr>'; }).join('')
        + '</tbody></table>' : '';
  }

  // ── Padverkenner ───────────────────────────────────────────────────────────
  // Twee vragen: WAT WERKT en WAAR STOKT HET. Daarom:
  //   - bovenaan het antwoord: de pagina's waar meer bezoekers stoppen dan bij de
  //     rest van die stap, en die het vaakst tot het doel leiden;
  //   - op elke paginakaart een UITKOMSTBALK over haar EIGEN bezoeken (groen: doet
  //     daarna het doel, blauw: gaat verder, grijs: stopt na het doel, rood: stopt
  //     hier). Die balk is altijd even breed, dus 4 bezoeken zijn even leesbaar als
  //     400; het aantal staat ernaast. Een balk "deel van alle bezoeken" was vanaf
  //     stap 2 overal een streepje van 0,3%, en dat las als "onbelangrijk";
  //   - een RASTER met vaste banen (acties, pagina's, andere) en vaste kaarthoogtes:
  //     dezelfde soort rij staat in elke kolom op dezelfde hoogte. Geen subtekst op
  //     de kaart; de uitleg staat in de tooltip;
  //   - LINTEN tussen de kolommen (een Sankey met kaarten als knopen), berekend NA
  //     het tekenen uit de plaats van de kaarten (drawRibbons). De dikte is per
  //     tussenruimte geschaald op de bronkolom: op het geheel zijn alle linten na
  //     stap 2 haarfijn. Geen linten naar "verlaat de site": dat zegt het rood al.
  // Drie standen:
  //   - vooruit: vanaf de instap;
  //   - rond een pagina: uitgelijnd op de EERSTE keer dat een gekozen pagina in een
  //     bezoek bekeken werd, met stappen ervoor (hoe ze er komen) en erna (wat eruit
  //     voortvloeit). Zo staat een pagina in het midden, wat haar plaats in het bezoek
  //     ook was: instap, tussenpagina of laatste. De filter "Instappagina" kan dat niet;
  //   - naar het doel toe: uitgelijnd op de EERSTE keer dat het doel gebeurde, om te
  //     zien langs welke wegen het lukt.
  // In de twee uitgelijnde standen staat in een kolom ervoor ook "Komt binnen": de
  // bezoeken die daar beginnen (hun eerste stap staat in de kolom erna). Zonder die
  // kaart lijkt het alsof iedereen van een andere pagina kwam.

  var CARD_H = 60, ACT_H = 44, REST_H = 34;   // vaste hoogtes: de rijen lijnen uit
  var RIBBON_MAX = 34;                         // dikte van een lint dat de hele bronkolom draagt
  var BAD = 'oklch(var(--er))', DONE = 'oklch(var(--bc) / 0.28)', MOVE = 'oklch(var(--p) / 0.55)';
  var flowModel = null, flowHl = null, ribbonFrame = 0;

  /** De naam op een kaart: het laatste stuk van het pad ("/syndicus-gids/vergoeding/" -> "vergoeding"). Het volledige pad staat in de tooltip. */
  function pageLabel(i) {
    var p = String(pageName(i)).split('?')[0];
    if (p === '/' || p === '') return 'Homepage';
    var segs = p.split('/').filter(Boolean);
    return segs.length ? segs[segs.length - 1] : p;
  }
  function tokLabel(t) { return t === ENTRY ? 'Komt binnen' : t < 0 ? (ACT[-t] ? ACT[-t].label : 'Actie') : pageLabel(t); }
  /** Een afstand in de uitgelijnde standen: positief = ervoor, 0 = het doel of de pagina, negatief = erna. */
  function distLabel(d, page) {
    if (page) return d === 0 ? 'de pagina' : d > 0 ? d + ' ' + stepWord(d) + ' ervoor' : (-d) + ' ' + stepWord(-d) + ' erna';
    return d === 0 ? 'het doel' : d < 0 ? 'daarna' : d + ' ' + stepWord(d) + ' ervoor';
  }
  function whereLabel(m, v) { return m.aligned ? distLabel(v, m.page) : v === 0 ? 'instap' : 'stap ' + (v + 1); }
  function fx(x) { return x.toFixed(1); }
  /** Ondergrens van een Wilson-interval (90%): 1 op 1 wint zo niet van 20 op 400. */
  function wilsonLow(k, n) {
    if (!n) return 0;
    var z = 1.64, z2 = z * z, q = k / n;
    return (q + z2 / (2 * n) - z * Math.sqrt(q * (1 - q) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  }

  /**
   * Het model: per kolom de knopen, en per knoop wat er met die bezoeken gebeurde
   * (goal / more / done / stop telt samen op tot n); plus de linten tussen twee
   * opeenvolgende kolommen. Enkel getoonde knopen krijgen linten.
   */
  function buildFlow(cur) {
    var mode = st.flow.mode, back = mode === 'back', page = mode === 'page', aligned = back || page;
    var goal = GOALS[st.flow.goal], n = st.flow.n, defs = [], c, j, i, d;
    var view = aligned ? cur.filter(function (s) { return alignIdx(s) >= 0; }).filter(pinned) : cur.filter(pinned);
    var total = view.length, gi = view.map(goalIdx), al = aligned ? view.map(alignIdx) : null, P = view.map(steps);
    // Kolommen voor en na het ankerpunt. Naar het doel toe: n ervoor en één erna ("daarna").
    var before = back ? n : page ? st.flow.pb : 0, after = back ? 1 : page ? st.flow.pa : 0;
    if (aligned) { for (d = before; d >= -after; d--) defs.push(d); } else { for (i = 0; i < n; i++) defs.push(i); }
    // De positie in steps() van bezoek j in kolom c. Ligt ze buiten het pad, dan is
    // het bezoek daar (nog) niet of niet meer; -1 = het begint in de kolom erna.
    function pos(j, c) { return aligned ? al[j] - defs[c] : defs[c]; }
    /** Wat bezoek j in kolom c doet: een stap (samengesmolten, zie mergeTok), ENTRY, of undefined. */
    function tokOf(j, c) {
      var k = pos(j, c);
      if (k >= 0) return k < P[j].length ? mergeTok(P[j][k]) : undefined;
      return aligned && k === -1 ? ENTRY : undefined;
    }
    var pins = curPins();
    var cols = defs.map(function (v, c) {
      var nodes = {}, reached = 0, entry = null;
      for (var j = 0; j < total; j++) {
        var k = pos(j, c), g = gi[j];
        if (aligned && k === -1) {
          // "Komt binnen": alles wat volgt ligt nog voor hen. Groen = haalt het doel
          // later in het bezoek; de rest gaat per definitie verder.
          entry = entry || { tok: ENTRY, n: 0, goal: 0, more: 0, done: 0, stop: 0, times: [], ch: {} };
          entry.n++;
          if (g >= 0) entry.goal++; else entry.more++;
          var ch = view[j][C.ch];
          entry.ch[ch] = (entry.ch[ch] || 0) + 1;
          continue;
        }
        if (k < 0 || k >= P[j].length) continue;
        reached++;
        var t0 = P[j][k], t = mergeTok(t0);
        var e = nodes[t] || (nodes[t] = { tok: t, n: 0, goal: 0, more: 0, done: 0, stop: 0, times: [], started: 0, geschat: 0 });
        e.n++;
        if (t0 !== t) { e.started++; if (t0 === -10) e.geschat++; }
        if (g > k) e.goal++;                         // haalt het doel nog, later in het bezoek
        else if (k + 1 < P[j].length) e.more++;      // gaat verder
        else if (g >= 0) e.done++;                   // stopt, maar had het doel al
        else e.stop++;                               // stopt hier, zonder het doel
        // Tijd tot het doel (naar het doel toe), of tot / na de pagina (rond een pagina).
        if ((back && v > 0) || (page && v !== 0)) e.times.push(Math.abs(view[j]._so[al[j]] - view[j]._so[k]));
      }
      var list = Object.keys(nodes).map(function (t) { return nodes[t]; }).sort(function (a, b) { return b.n - a.n; });
      var acts = list.filter(function (e) { return e.tok < 0; });
      var pages = list.filter(function (e) { return e.tok >= 0; });
      var pinHere = pins[v];
      var shown = pages.slice(0, TOP_PER_STEP);
      if (pinHere !== undefined && pinHere >= 0 && !shown.some(function (e) { return e.tok === pinHere; })) {
        shown = shown.concat(pages.filter(function (e) { return e.tok === pinHere; }));
      }
      var rest = pages.filter(function (e) { return shown.indexOf(e) < 0; });
      var shownSet = {};
      acts.concat(shown, entry ? [entry] : []).forEach(function (e) { e.id = 'c' + c + ':t' + e.tok; e.isPin = pinHere === e.tok; shownSet[e.tok] = e; });
      return {
        v: v, reached: reached, entry: entry, acts: acts, pages: shown, allPages: pages, shownSet: shownSet,
        // Waartegen een lint zijn dikte meet: wie in deze kolom op de site is, plus wie hier binnenkomt.
        base: reached + (entry ? entry.n : 0),
        rest: rest.length ? { count: rest.length, n: rest.reduce(function (s, e) { return s + e.n; }, 0) } : null
      };
    });
    var L = {}, kinds = {};
    for (j = 0; j < total; j++) {
      for (c = 0; c + 1 < cols.length; c++) {
        var t0 = tokOf(j, c), t1 = tokOf(j, c + 1);
        if (t0 === undefined || t1 === undefined) continue;
        var a = cols[c].shownSet[t0], b = cols[c + 1].shownSet[t1];
        if (!a || !b) continue;
        var key = a.id + '>' + b.id;
        L[key] = (L[key] || 0) + 1;
        kinds[key] = t0 === ENTRY ? 'in' : (t0 < 0 || t1 < 0) ? 'act' : 'page';
      }
    }
    var links = Object.keys(L).map(function (key) {
      var ab = key.split('>');
      return { a: ab[0], b: ab[1], n: L[key], kind: kinds[key], c: Number(ab[0].slice(1, ab[0].indexOf(':'))) };
    });
    // Wie buiten de getoonde kolommen valt: meer stappen ervoor, of verder erna.
    var moreBefore = 0, moreAfter = 0;
    for (j = 0; j < total; j++) {
      if (aligned && al[j] > before) moreBefore++;
      if (aligned ? P[j].length - 1 - al[j] > after : P[j].length > n) moreAfter++;
    }
    return { mode: mode, back: back, page: page, aligned: aligned, n: n, before: before, after: after, focus: page ? focusPage() : -1,
      goal: goal, view: view, total: total, gi: gi, al: al, P: P, cols: cols, links: links, moreBefore: moreBefore, moreAfter: moreAfter };
  }

  // ── Bovenaan: het antwoord ─────────────────────────────────────────────────

  function rateOf(x, k) { return x && x.n ? x[k] / x.n : 0; }

  /**
   * De rol van pagina t in een lijst bezoeken, telkens de EERSTE keer dat ze in een
   * bezoek voorkomt: als instap (het bezoek begon erop) of later in het bezoek. Per
   * rol: hoeveel, hoeveel stopten er zonder het doel, hoeveel haalden daarna het
   * doel. `base` = hetzelfde voor ELKE pagina: het gemiddelde om tegen te meten. Een
   * instappagina verliest van nature meer bezoekers dan een pagina waar iemand bewust
   * naartoe klikte; daarom per rol vergelijken en nooit tegen één gemiddelde.
   */
  function pageRoles(list, t) {
    function z() { return { n: 0, stop: 0, goal: 0 }; }
    var page = { entry: z(), later: z() }, base = { entry: z(), later: z() };
    list.forEach(function (s) {
      var p = steps(s), g = goalIdx(s), seen = {};
      for (var k = 0; k < p.length; k++) {
        var x = p[k];
        if (x < 0 || seen[x]) continue;
        seen[x] = 1;
        var role = k === 0 ? 'entry' : 'later', stop = k === p.length - 1 && g < 0, goal = g > k;
        base[role].n++; if (stop) base[role].stop++; if (goal) base[role].goal++;
        if (x === t) { page[role].n++; if (stop) page[role].stop++; if (goal) page[role].goal++; }
      }
    });
    return { page: page, base: base };
  }

  /** Stokt het: meer stoppers dan je op die plaats mag verwachten? 'few' = te weinig bezoeken om iets te zeggen. */
  var VERDICT_PTS = 0.02;
  function verdictState(n, stop, expected) {
    if (n < 5) return 'few';
    var diff = stop - expected;
    if (diff >= 2 && diff / n >= VERDICT_PTS) return 'bad';
    if (-diff >= 2 && -diff / n >= VERDICT_PTS) return 'good';
    return 'avg';
  }

  /**
   * Het oordeel over de pagina('s) in focus, met een vergelijking van BUITEN het
   * vastgezette pad. Vooruit: per vastgezette pagina op stap v, tegen alle pagina's
   * op stap v bij dezelfde spelden ERVOOR -- spelden erna gaan over de toekomst en
   * maken stoppen onmogelijk. Rond een pagina: tegen elke pagina op dezelfde plaats in
   * een bezoek (instap of later), gewogen naar haar eigen mix (pageRoles).
   */
  function pinVerdicts(cur, m) {
    if (m.page) {
      if (m.focus < 0) return [];
      var R = pageRoles(cur, m.focus), r = R.page;
      var n = r.entry.n + r.later.n, stop = r.entry.stop + r.later.stop;
      if (!n) return [];
      var exp = r.entry.n * rateOf(R.base.entry, 'stop') + r.later.n * rateOf(R.base.later, 'stop');
      var ent = r.entry.n / n;
      return [{ t: m.focus, v: 0, n: n, stop: stop, rate: stop / n, avg: exp / n, avgLabel: 'verwacht',
        where: ent >= 0.9 ? 'bijna altijd instap' : ent <= 0.1 ? 'meestal later in het bezoek' : pctTxt(ent * 100) + ' instap',
        state: verdictState(n, stop, exp) }];
    }
    if (m.back) return [];
    return Object.keys(st.pins).map(Number).sort(function (a, b) { return a - b; }).filter(function (v) { return st.pins[v] >= 0; }).map(function (v) {
      var t = st.pins[v], N = 0, S = 0, n = 0, stop = 0;
      cur.forEach(function (s) {
        var p = steps(s);
        if (v >= p.length || p[v] < 0) return;
        for (var q in st.pins) if (Number(q) < v && mergeTok(p[q]) !== st.pins[q]) return;
        var isStop = v === p.length - 1 && goalIdx(s) < 0;
        N++; if (isStop) S++;
        if (p[v] === t) { n++; if (isStop) stop++; }
      });
      var avg = N ? S / N : 0;
      return { t: t, v: v, n: n, stop: stop, rate: n ? stop / n : 0, avg: avg, avgLabel: 'gem.',
        where: v === 0 ? 'instap' : 'stap ' + (v + 1), state: verdictState(n, stop, n * avg) };
    }).filter(function (x) { return x.n > 0; });
  }

  /**
   * Vooruit en rond een pagina: "Waar het stokt" en "Wat werkt". Stokken = meer
   * stoppers dan de rest van die stap (gerangschikt op het OVERSCHOT, dus volume telt
   * mee); werken = het deel dat daarna het doel haalt, gerangschikt op de
   * Wilson-ondergrens. Naar het doel toe: hoeveel pagina's, hoeveel tijd, in welk bezoek.
   *
   * De pagina in FOCUS staat in "Waar het stokt" altijd bovenaan, met haar oordeel
   * (fv, zie pinVerdicts). Eerst verdween ze daar zodra je ze vastzette: in haar kolom
   * staat ze dan alleen, dus ze is haar eigen gemiddelde. "Waar het stokt" werd leeg
   * terwijl "Wat werkt" bleef staan, en dat las als goed nieuws.
   */
  function renderFlowAnswers(m, fv) {
    var el = $('bhFlowAnswers');
    if (!m.total) { el.innerHTML = ''; return; }
    if (m.back) { el.innerHTML = flowSummaryHtml(m); return; }
    var stalls = [], works = [];
    m.cols.forEach(function (c) {
      if (m.page && c.v === 0) return;   // de pagina zelf: haar oordeel staat bovenaan
      var sumN = 0, sumStop = 0;
      c.allPages.forEach(function (e) { sumN += e.n; sumStop += e.stop; });
      var avg = sumN ? sumStop / sumN : 0;
      c.pages.forEach(function (e) {
        var judged = fv.some(function (x) { return x.v === c.v && x.t === e.tok; });
        var excess = e.stop - e.n * avg;
        if (!judged && e.n >= 5 && e.stop >= 2 && excess >= 1) stalls.push({ e: e, c: c, rate: e.stop / e.n, avg: avg, score: excess });
        if (e.goal > 0) works.push({ e: e, c: c, rate: e.goal / e.n, score: wilsonLow(e.goal, e.n) });
      });
    });
    var byScore = function (a, b) { return b.score - a.score; };
    stalls = stalls.sort(byScore).slice(0, 3);
    works = works.sort(byScore).slice(0, 3);
    function row(x, bad) {
      var where = whereLabel(m, x.c.v);
      return '<button type="button" class="w-full grid grid-cols-[1fr_auto] gap-x-3 items-center rounded-lg px-2 py-1.5 text-left om-hover"'
        + ' ' + pinAttrs(m, x.c.v, x.e.tok)
        + ' title="' + esc(pageName(x.e.tok) + ' (' + where + '): ' + outcomeText(x.e, m.goal) + (bad ? ' Gemiddeld in die stap: ' + pctTxt(x.avg * 100) + ' stopt.' : '') + ' Klik om dit pad vast te zetten.') + '">'
        + '<span class="min-w-0"><span class="block text-[13px] font-medium truncate">' + esc(tokLabel(x.e.tok)) + '</span>'
        + '<span class="block text-[11px] text-base-content/55 tabular-nums">' + esc(where) + ' · ' + nf(x.e.n) + ' bezoeken</span></span>'
        + '<span class="text-right"><span class="block text-base font-semibold tabular-nums leading-5" style="color:' + (bad ? BAD : GOOD) + '">' + pctTxt(x.rate * 100) + '</span>'
        + '<span class="block text-[11px] text-base-content/50 tabular-nums">' + (bad ? 'gem. ' + pctTxt(x.avg * 100) : nf(x.e.goal) + '×') + '</span></span></button>';
    }
    // Het oordeel over de pagina in focus: blijft staan, ook als ze niet slechter doet dan verwacht.
    function verdictRow(x) {
      var color = x.state === 'bad' ? BAD : x.state === 'good' ? GOOD : 'oklch(var(--bc) / 0.7)';
      var word = { bad: 'stokt hier', good: 'beter dan verwacht', avg: 'rond het gemiddelde', few: 'te weinig bezoeken' }[x.state];
      return '<button type="button" class="w-full grid grid-cols-[1fr_auto] gap-x-3 items-center rounded-lg px-2 py-1.5 text-left bg-primary/5 om-hover"'
        + ' data-bh-action="focus-scroll"' + (m.page ? '' : ' data-step="' + x.v + '"')
        + ' title="' + esc(pageName(x.t) + ' (' + x.where + '): ' + pctTxt(x.rate * 100) + ' stopt hier, ' + x.avgLabel + ' ' + pctTxt(x.avg * 100)
          + '. Klik voor de uitleg: wie stopt er, hoe lang bleven ze, waar komen ze vandaan.') + '">'
        + '<span class="min-w-0"><span class="flex items-center gap-1 text-[13px] font-medium"><i data-lucide="' + (m.page ? 'crosshair' : 'pin') + '" class="w-3 h-3 shrink-0 text-primary"></i>'
        + '<span class="truncate">' + esc(tokLabel(x.t)) + '</span></span>'
        + '<span class="block text-[11px] text-base-content/55 tabular-nums">' + esc(x.where) + ' · ' + nf(x.n) + ' bezoeken · ' + word + ' · <span class="underline">waarom?</span></span></span>'
        + '<span class="text-right"><span class="block text-base font-semibold tabular-nums leading-5" style="color:' + color + '">' + pctTxt(x.rate * 100) + '</span>'
        + '<span class="block text-[11px] text-base-content/50 tabular-nums">' + x.avgLabel + ' ' + pctTxt(x.avg * 100) + '</span></span></button>';
    }
    function box(icon, color, title, metric, rows, empty) {
      return '<div class="rounded-xl border border-base-content/10 p-2">'
        + '<div class="flex items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">'
        + '<span class="inline-flex items-center gap-1.5 text-sm font-semibold"><i data-lucide="' + icon + '" class="w-4 h-4 self-center" style="color:' + color + '"></i>' + title + '</span>'
        + '<span class="text-[11px] text-base-content/50">' + metric + '</span></div>'
        + (rows.length ? rows.join('') : '<p class="text-xs text-base-content/60 px-2 pb-2">' + empty + '</p>') + '</div>';
    }
    el.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">'
      + box('trending-down', BAD, 'Waar het stokt', 'stopt hier', fv.map(verdictRow).concat(stalls.map(function (x) { return row(x, true); })),
          'Geen pagina waar duidelijk meer bezoekers stoppen dan bij de rest van die stap.')
      + box('trending-up', GOOD, 'Wat werkt', 'doet daarna ' + esc(m.goal.kort), works.map(function (x) { return row(x, false); }),
          'Geen enkele pagina in deze stappen leidde tot ' + esc(m.goal.kort) + '.')
      + '</div>';
  }

  /** Een kleine verdeling: titel, kerngetal, een balk per groep. */
  function miniDist(title, headline, rows, total, note) {
    return '<div class="rounded-xl border border-base-content/10 p-3">'
      + '<div class="flex items-baseline justify-between gap-2"><span class="text-xs text-base-content/60">' + esc(title) + '</span><span class="text-sm font-semibold whitespace-nowrap">' + esc(headline) + '</span></div>'
      + rows.map(function (r) {
          return '<div class="flex items-center gap-2 mt-1.5 text-xs"><span class="w-32 shrink-0 truncate text-base-content/70" title="' + esc(r[0]) + '">' + esc(r[0]) + '</span>'
            + '<div class="h-1.5 rounded-full om-spoor flex-1 overflow-hidden"><div class="h-full rounded-full" style="width:' + (r[1] / total * 100) + '%;background-color:' + ACCENT + '"></div></div>'
            + '<span class="w-10 text-right tabular-nums text-base-content/60">' + pctTxt(pct(r[1], total)) + '</span></div>';
        }).join('')
      + (note ? '<div class="text-[11px] text-base-content/50 mt-2">' + esc(note) + '</div>' : '')
      + '</div>';
  }

  /** "Naar het doel toe": hoeveel pagina's, hoeveel tijd en in welk bezoek. */
  function flowSummaryHtml(m) {
    var goal = m.goal, total = m.total;
    var pages = [], times = [], pb = [0, 0, 0, 0, 0, 0], tb = [0, 0, 0, 0, 0], vb = [0, 0, 0, 0, 0];
    m.view.forEach(function (s, j) {
      var p = m.P[j], g = m.gi[j], k = 0;
      for (var i = 0; i < g; i++) if (p[i] >= 0) k++;
      pages.push(k);
      pb[k <= 1 ? 0 : k === 2 ? 1 : k === 3 ? 2 : k <= 5 ? 3 : k <= 9 ? 4 : 5]++;
      var t = s._so[g] || 0;
      times.push(t);
      tb[t < 60 ? 0 : t < 180 ? 1 : t < 600 ? 2 : t < 1800 ? 3 : 4]++;
      var vn = s._vn || 0;
      vb[vn >= 3 ? 3 : vn === 2 ? 2 : vn === 1 ? 1 : (s[C.flags] & st.F.isNew) ? 0 : 4]++;
    });
    var lbl = function (labels, counts) { return labels.map(function (l, i) { return [l, counts[i]]; }); };
    return '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">'
      + miniDist('Pagina\'s tot ' + goal.kort, 'mediaan ' + nf(median(pages), 1),
          lbl(['1 pagina', '2 pagina\'s', '3 pagina\'s', '4 à 5 pagina\'s', '6 à 9 pagina\'s', '10 of meer'], pb), total,
          'In dat bezoek, de pagina waarop het gebeurde meegeteld.')
      + miniDist('Tijd tot ' + goal.kort, 'mediaan ' + durTxt(median(times)),
          lbl(['minder dan 1 min', '1 à 3 min', '3 à 10 min', '10 à 30 min', '30 min of meer'], tb), total,
          'Vanaf de eerste pagina van dat bezoek.')
      + miniDist('In welk bezoek', pctTxt(pct(vb[0], total)) + ' in het eerste',
          lbl(['Eerste bezoek', '2e bezoek', '3e bezoek', '4e of later', 'Terugkerend, eerder langer geleden'], vb), total,
          'Eerdere bezoeken geteld binnen de ' + PERIODS[st.period] + ' en de periode daarvoor.')
      + '</div>';
  }

  // ── Het raster ─────────────────────────────────────────────────────────────

  function outcomeBar(e) {
    var seg = function (k, color) { return e[k] ? '<div class="h-full" style="width:' + (e[k] / e.n * 100) + '%;background-color:' + color + '"></div>' : ''; };
    return '<div class="flex h-1.5 rounded-full overflow-hidden om-spoor">' + seg('goal', GOOD) + seg('more', MOVE) + seg('done', DONE) + seg('stop', BAD) + '</div>';
  }
  function outcomeText(e, goal) {
    var bits = [];
    if (e.goal) bits.push(pctTxt(pct(e.goal, e.n)) + ' doet daarna ' + goal.kort);
    if (e.more) bits.push(pctTxt(pct(e.more, e.n)) + ' gaat verder');
    if (e.done) bits.push(pctTxt(pct(e.done, e.n)) + ' stopt na ' + goal.kort);
    if (e.stop) bits.push(pctTxt(pct(e.stop, e.n)) + ' stopt hier');
    return bits.join(', ') + '.';
  }
  function pinAttrs(m, v, t) {
    var a = m.page ? 'data-bh-action="ppin" data-dist="' + v + '"' : m.back ? 'data-bh-action="bpin" data-dist="' + v + '"' : 'data-bh-action="pin" data-step="' + v + '"';
    return a + ' data-page="' + t + '"';
  }

  function headCell(m, c, col) {
    var v = c.v, share = c.reached / m.total, color = ACCENT, title, help;
    if (m.back) {
      title = v > 0 ? v + ' ' + stepWord(v) + ' ervoor' : v === 0 ? m.goal.label : 'Daarna';
      if (v === 0) color = GOOD;
      help = v > 0 ? pctTxt(share * 100) + ' was toen al op de site; de rest kwam pas later binnen.'
        : v === 0 ? 'Alle bezoeken met ' + m.goal.kort + '.' : pctTxt(share * 100) + ' bleef daarna nog op de site.';
    } else if (m.page) {
      title = v > 0 ? v + ' ' + stepWord(v) + ' ervoor' : v === 0 ? 'De pagina' : (-v) + ' ' + stepWord(-v) + ' erna';
      help = v > 0 ? pctTxt(share * 100) + ' was toen al op de site. "Komt binnen" = bezoeken die daar beginnen.'
        : v === 0 ? 'Alle bezoeken met ' + pageName(m.focus) + ', op de eerste keer dat ze die pagina bekeken.'
        : pctTxt(share * 100) + ' is dan nog op de site.';
    } else {
      title = v === 0 ? 'Instap' : 'Stap ' + (v + 1);
      help = v === 0 ? 'Alle bezoeken in het segment.' : pctTxt(share * 100) + ' van de bezoeken is hier nog op de site.';
    }
    return '<div class="px-1 pb-1" style="grid-row:1;grid-column:' + col + '" title="' + esc(help) + '">'
      + '<div class="flex items-baseline justify-between gap-2"><span class="text-xs font-semibold uppercase tracking-wide text-base-content/60 truncate">' + esc(title) + '</span>'
      + '<span class="text-xs tabular-nums text-base-content/50">' + pctTxt(share * 100) + '</span></div>'
      + '<div class="text-lg font-semibold tabular-nums leading-tight mt-0.5">' + nf(c.reached) + ' <span class="text-xs font-normal text-base-content/50">bezoeken</span></div>'
      + '<div class="h-1.5 rounded-full om-spoor mt-1.5 overflow-hidden"><div class="h-full rounded-full" style="width:' + (share * 100) + '%;background-color:' + color + '"></div></div></div>';
  }

  function pageCard(m, c, e, row, col) {
    var where = whereLabel(m, c.v), help = pageName(e.tok) + ' (' + where + '): ' + nf(e.n) + ' bezoeken';
    var bar, tm = e.times.length ? median(e.times) : null;
    if (m.back) {
      help += ', ' + pctTxt(pct(e.n, m.total)) + ' van de bezoeken met ' + m.goal.kort + (tm !== null ? '. Mediaan ' + durTxt(tm) + ' tot ' + m.goal.kort : '') + '.';
      bar = '<div class="h-1.5 rounded-full om-spoor overflow-hidden"><div class="h-full rounded-full" style="width:' + Math.max(e.n / m.total * 100, 2) + '%;background-color:' + ACCENT + '"></div></div>';
    } else {
      help += ' (' + pctTxt(pct(e.n, m.total)) + ' van ' + (m.page ? 'de bezoeken met deze pagina' : 'het segment') + '). ' + outcomeText(e, m.goal)
        + (m.page && tm !== null ? ' Mediaan ' + durTxt(tm) + (c.v > 0 ? ' tot' : ' na') + ' de pagina.' : '');
      bar = outcomeBar(e);
    }
    // De pagina in het midden: vastzetten zou niets filteren (iedereen staat erop). Een
    // klik brengt je naar "Pagina onder de loep".
    var center = m.page && c.v === 0;
    var cls = center || e.isPin ? 'bg-primary/10 border-primary ring-1 ring-primary' : 'bg-base-100 border-base-content/10 om-hover';
    return '<button type="button" class="w-full text-left rounded-lg border px-2.5 py-2 flex flex-col justify-between transition-colors ' + cls + '"'
      + ' style="grid-row:' + row + ';grid-column:' + col + ';height:' + CARD_H + 'px" data-flow-node="' + e.id + '" '
      + (center ? 'data-bh-action="focus-scroll"' : pinAttrs(m, c.v, e.tok))
      + ' title="' + esc(help + (center ? ' Klik voor de uitleg eronder.' : ' Klik om dit pad vast te zetten.')) + '">'
      + '<div class="flex items-start gap-2 min-w-0"><span class="flex-1 min-w-0 text-[13px] font-medium leading-4 line-clamp-2" style="overflow-wrap:anywhere">' + esc(tokLabel(e.tok)) + '</span>'
      + '<span class="text-sm font-semibold tabular-nums leading-4">' + nf(e.n) + '</span></div>'
      + bar + '</button>';
  }

  /** "Komt binnen": de bezoeken die hier beginnen. Hun eerste stap staat in de kolom erna. */
  function entryCard(m, c, e, row, col) {
    var chs = Object.keys(e.ch).map(Number).sort(function (a, b) { return e.ch[b] - e.ch[a]; }).slice(0, 4)
      .map(function (ch) { return d('ch', ch) + ' ' + pctTxt(pct(e.ch[ch], e.n)); }).join(', ');
    var help = nf(e.n) + ' bezoeken beginnen hier: hun eerste stap staat in de kolom erna' + (chs ? '. Binnen via ' + chs : '') + '.'
      + (m.back ? '' : ' ' + outcomeText(e, m.goal));
    var style = 'grid-row:' + row + ';grid-column:' + col + ';height:' + ACT_H + 'px;' + (e.isPin ? 'box-shadow:0 0 0 1px oklch(var(--p));' : '');
    return '<button type="button" class="w-full text-left rounded-lg border border-dashed px-2.5 flex items-center gap-2 '
      + (e.isPin ? 'border-primary bg-primary/10' : 'border-base-content/25 om-hover') + '" style="' + style + '"'
      + ' data-flow-node="' + e.id + '" ' + pinAttrs(m, c.v, ENTRY)
      + ' title="' + esc(help + ' Klik om enkel die bezoeken te zien.') + '">'
      + '<i data-lucide="log-in" class="w-4 h-4 shrink-0 text-base-content/50"></i>'
      + '<span class="flex-1 min-w-0 text-[13px] font-medium leading-4 line-clamp-2">Komt binnen</span>'
      + '<span class="text-sm font-semibold tabular-nums">' + nf(e.n) + '</span></button>';
  }

  function actCard(m, c, e, row, col) {
    var a = ACT[-e.tok];
    if (e.started) return formCard(m, c, e, row, col, a);
    var style = 'grid-row:' + row + ';grid-column:' + col + ';height:' + ACT_H + 'px;'
      + 'background-color:oklch(var(--su) / ' + (e.isPin ? '0.24' : '0.12') + ');border-color:oklch(var(--su) / 0.55);'
      + (e.isPin ? 'box-shadow:0 0 0 1px oklch(var(--su));' : '');
    return '<button type="button" class="w-full text-left rounded-lg border px-2.5 flex items-center gap-2 hover:brightness-95" style="' + style + '"'
      + ' data-flow-node="' + e.id + '" ' + pinAttrs(m, c.v, e.tok)
      + ' title="' + esc(tokName(e.tok) + ' (' + whereLabel(m, c.v) + '): ' + nf(e.n) + ' bezoeken. Klik om dit pad vast te zetten.') + '">'
      + '<i data-lucide="' + (a ? a.icon : 'check') + '" class="w-4 h-4 shrink-0" style="color:oklch(var(--su))"></i>'
      + '<span class="flex-1 min-w-0 text-[13px] font-medium leading-4 line-clamp-2">' + esc(tokLabel(e.tok)) + '</span>'
      + '<span class="text-sm font-semibold tabular-nums">' + nf(e.n) + '</span></button>';
  }

  /**
   * Een formulierkaart met wie eraan BEGON en wie VERSTUURDE, in één bubbel: zo zie je
   * dat meer bezoekers de popup openden en invulden dan er verstuurden. "Gestart" telt
   * ook wie verstuurde (dat is per definitie begonnen).
   */
  function formCard(m, c, e, row, col, a) {
    var verstuurd = e.n - e.started;
    var style = 'grid-row:' + row + ';grid-column:' + col + ';height:' + ACT_H + 'px;'
      + 'background-color:oklch(var(--su) / ' + (e.isPin ? '0.24' : '0.12') + ');border-color:oklch(var(--su) / 0.55);'
      + (e.isPin ? 'box-shadow:0 0 0 1px oklch(var(--su));' : '');
    var naam = a ? a.short : 'Formulier';
    var uitleg = naam + ' (' + whereLabel(m, c.v) + '): ' + nf(e.n) + ' bezoeken begonnen eraan, ' + nf(verstuurd) + ' verstuurden'
      + (e.geschat ? ' (' + nf(e.geschat) + ' begonnen geschat uit klikken, van voor de popup zelf iets meldde)' : '') + '. Klik om dit pad vast te zetten.';
    return '<button type="button" class="w-full text-left rounded-lg border px-2.5 flex items-center gap-2 hover:brightness-95" style="' + style + '"'
      + ' data-flow-node="' + e.id + '" ' + pinAttrs(m, c.v, e.tok) + ' title="' + esc(uitleg) + '">'
      + '<i data-lucide="' + (a ? a.icon : 'check') + '" class="w-4 h-4 shrink-0" style="color:oklch(var(--su))"></i>'
      + '<span class="flex-1 min-w-0 text-[13px] font-medium leading-4 truncate">' + esc(naam) + (e.geschat ? '<span class="text-base-content/50">*</span>' : '') + '</span>'
      + '<span class="text-right leading-4 tabular-nums shrink-0"><span class="block text-[11px] text-base-content/70">' + nf(e.n) + ' gestart</span>'
      + '<span class="block text-[13px] font-semibold">' + nf(verstuurd) + ' verstuurd</span></span></button>';
  }

  function restCard(r, row, col) {
    return '<div class="rounded-lg border border-dashed border-base-content/15 px-2.5 flex items-center justify-between gap-2 text-xs text-base-content/60"'
      + ' style="grid-row:' + row + ';grid-column:' + col + ';height:' + REST_H + 'px" title="Pagina\'s buiten de top ' + TOP_PER_STEP + ' van deze stap">'
      + '<span class="truncate">+ ' + nf(r.count) + ' andere pagina\'s</span><span class="tabular-nums">' + nf(r.n) + '</span></div>';
  }

  function laneLabel(text, row) {
    return '<div class="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-base-content/40" style="grid-row:' + row + ';grid-column:1 / -1">'
      + '<span>' + text + '</span><span class="flex-1 border-t border-base-content/10"></span></div>';
  }

  /** Wie buiten de getoonde kolommen valt, met een knop voor een stap meer. In de koprij, zodat de banen eronder niet verschuiven. */
  function moreCell(m, col, side) {
    var before = side === 'before', cnt = before ? m.moreBefore : m.moreAfter;
    var lim = m.page ? (before ? m.before : m.after) : m.n, max = m.page ? MAX_SIDE : MAX_STEPS;
    var title = before ? (m.back ? 'Langer' : 'Eerder') : 'Verder';
    var txt = m.back ? 'had meer dan ' + lim + ' ' + stepWord(lim) + ' nodig'
      : m.page ? (before ? 'had meer dan ' + lim + ' ' + stepWord(lim) + ' ervoor' : 'gaat meer dan ' + lim + ' ' + stepWord(lim) + ' verder')
      : 'gaat verder dan stap ' + lim;
    var act = m.page ? 'data-bh-action="flow-side" data-side="' + (before ? 'pb' : 'pa') + '"' : 'data-bh-action="flow-steps"';
    return '<div class="px-1" style="grid-row:1 / span 2;grid-column:' + col + '">'
      + '<div class="text-xs font-semibold uppercase tracking-wide text-base-content/60">' + title + '</div>'
      + '<div class="text-[11px] text-base-content/55 mt-0.5 leading-4">' + pctTxt(pct(cnt, m.total)) + ' ' + esc(txt) + '</div>'
      + (lim < max ? '<button type="button" class="btn btn-xs btn-outline mt-1.5 gap-1" ' + act + ' data-value="1"><i data-lucide="plus" class="w-3 h-3"></i> stap erbij</button>' : '')
      + '</div>';
  }

  function renderFlowGrid(m) {
    var A = 0, Pn = 0, hasRest = false, hasIn = false;
    m.cols.forEach(function (c) { A = Math.max(A, c.acts.length); Pn = Math.max(Pn, c.pages.length); if (c.rest) hasRest = true; if (c.entry) hasIn = true; });
    // De banen, van boven naar onder. Een baan heeft in elke kolom dezelfde rijen.
    var r = 2, rows = {};
    if (hasIn) { rows.inLabel = r++; rows.entry = r++; }
    if (A) { rows.actLabel = r++; rows.act = r; r += A; }
    if ((A || hasIn) && Pn) rows.pageLabel = r++;
    rows.page = r; r += Pn;
    if (hasRest) rows.rest = r++;
    var COL = 'minmax(10.5rem, 1fr)', GAP = 'minmax(3rem, 0.5fr)', SEP = '1.25rem', MORE = 'minmax(8rem, 9rem)';
    var tracks = [], at = [], moreLeft = 0, moreRight = 0, minW = 0;
    if (m.aligned && m.moreBefore) { tracks.push(MORE, SEP); moreLeft = 1; minW += 128 + 20; }
    m.cols.forEach(function (c, i) {
      if (i) { tracks.push(GAP); minW += 48; }
      tracks.push(COL); at.push(tracks.length); minW += 168;
    });
    if (!m.back && m.moreAfter) { tracks.push(SEP, MORE); moreRight = tracks.length; minW += 20 + 128; }
    var cells = [];
    if (rows.inLabel) cells.push(laneLabel('Binnenkomst', rows.inLabel));
    if (rows.actLabel) cells.push(laneLabel('Acties', rows.actLabel));
    if (rows.pageLabel) cells.push(laneLabel('Pagina\'s', rows.pageLabel));
    m.cols.forEach(function (c, i) {
      cells.push(headCell(m, c, at[i]));
      if (i) cells.push('<div class="flex justify-center pt-0.5 text-base-content/25" style="grid-row:1;grid-column:' + (at[i] - 1) + '"><i data-lucide="chevron-right" class="w-4 h-4"></i></div>');
      if (c.entry) cells.push(entryCard(m, c, c.entry, rows.entry, at[i]));
      c.acts.forEach(function (e, k) { cells.push(actCard(m, c, e, rows.act + k, at[i])); });
      c.pages.forEach(function (e, k) { cells.push(pageCard(m, c, e, rows.page + k, at[i])); });
      if (c.rest) cells.push(restCard(c.rest, rows.rest, at[i]));
    });
    if (moreLeft) cells.push(moreCell(m, moreLeft, 'before'));
    if (moreRight) cells.push(moreCell(m, moreRight, 'after'));
    $('bhFlow').innerHTML = '<div id="bhFlowGrid" class="relative grid gap-y-1.5" style="grid-template-columns:' + tracks.join(' ') + ';min-width:' + minW + 'px">'
      + '<svg id="bhFlowRibbons" class="absolute left-0 top-0 pointer-events-none" aria-hidden="true"></svg>'
      + cells.join('') + '</div>';
  }

  // ── Linten ─────────────────────────────────────────────────────────────────
  // Gerekend uit de plaats van de kaarten zoals de browser ze tekende: de
  // breedtes zijn fr-kolommen, dus vooraf weet je niet waar een kaart staat.
  // Opnieuw bij elke render, bij resize en bij het tonen van het tabblad (een
  // verborgen tabblad heeft geen maten).

  function scheduleRibbons() {
    if (ribbonFrame) cancelAnimationFrame(ribbonFrame);
    ribbonFrame = requestAnimationFrame(function () { ribbonFrame = 0; drawRibbons(); });
  }

  function drawRibbons() {
    var grid = $('bhFlowGrid'), svg = $('bhFlowRibbons');
    if (!grid || !svg || !flowModel) return;
    var box = grid.getBoundingClientRect();
    if (!box.width) return;
    var R = {};
    Array.prototype.forEach.call(grid.querySelectorAll('[data-flow-node]'), function (el) {
      var q = el.getBoundingClientRect();
      R[el.getAttribute('data-flow-node')] = { l: q.left - box.left, r: q.right - box.left, t: q.top - box.top, h: q.height };
    });
    if (flowHl && !R[flowHl]) flowHl = null;
    var links = flowModel.links.filter(function (k) { return R[k.a] && R[k.b]; }).map(function (k) {
      var base = flowModel.cols[k.c].base || 1;
      return { a: k.a, b: k.b, n: k.n, kind: k.kind, w: Math.max(1.5, k.n / base * RIBBON_MAX) };
    });
    // Stapelen zoals in een Sankey: uit een kaart op volgorde van de doelen, in
    // een kaart op volgorde van de bronnen, telkens rond het midden van de kaart.
    function stack(own, other, key) {
      var groups = {};
      links.forEach(function (k) { (groups[k[own]] = groups[k[own]] || []).push(k); });
      Object.keys(groups).forEach(function (id) {
        var list = groups[id].sort(function (x, y) { return R[x[other]].t - R[y[other]].t; });
        var sum = list.reduce(function (s, k) { return s + k.w; }, 0), y = R[id].t + (R[id].h - sum) / 2;
        list.forEach(function (k) { k[key] = y; y += k.w; });
      });
    }
    stack('a', 'b', 'y0');
    stack('b', 'a', 'y1');
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
    svg.setAttribute('viewBox', '0 0 ' + fx(box.width) + ' ' + fx(box.height));
    svg.innerHTML = links.sort(function (x, y) { return y.n - x.n; }).map(function (k) {
      var x0 = R[k.a].r, x1 = R[k.b].l, xm = (x0 + x1) / 2, y0 = k.y0, y1 = k.y1, w = k.w;
      var op = k.kind === 'act' ? 0.34 : k.kind === 'in' ? 0.16 : 0.2;
      var fill = k.kind === 'act' ? GOOD : k.kind === 'in' ? 'oklch(var(--bc))' : ACCENT;
      var d = 'M' + fx(x0) + ',' + fx(y0) + 'C' + fx(xm) + ',' + fx(y0) + ' ' + fx(xm) + ',' + fx(y1) + ' ' + fx(x1) + ',' + fx(y1)
        + 'L' + fx(x1) + ',' + fx(y1 + w) + 'C' + fx(xm) + ',' + fx(y1 + w) + ' ' + fx(xm) + ',' + fx(y0 + w) + ' ' + fx(x0) + ',' + fx(y0 + w) + 'Z';
      return '<path d="' + d + '" data-a="' + k.a + '" data-b="' + k.b + '" data-o="' + op + '" style="fill:' + fill + ';opacity:' + op + '"></path>';
    }).join('');
    applyHighlight();
  }

  /** Met de muis (of de focus) op een kaart: haar linten naar voren, de rest naar achteren. */
  function applyHighlight() {
    var svg = $('bhFlowRibbons');
    if (!svg) return;
    Array.prototype.forEach.call(svg.querySelectorAll('path'), function (el) {
      var base = Number(el.getAttribute('data-o'));
      var on = flowHl && (el.getAttribute('data-a') === flowHl || el.getAttribute('data-b') === flowHl);
      el.style.opacity = !flowHl ? base : on ? Math.min(0.85, base * 2.6) : base * 0.25;
    });
  }
  function hoverFlow(e) {
    var el = e.target && e.target.closest ? e.target.closest('#bhFlowGrid [data-flow-node]') : null;
    var id = el ? el.getAttribute('data-flow-node') : null;
    if (id === flowHl) return;
    flowHl = id;
    applyHighlight();
  }
  document.addEventListener('mouseover', hoverFlow);
  document.addEventListener('focusin', hoverFlow);
  window.addEventListener('resize', scheduleRibbons);

  // ── Bediening, spelden, legende ────────────────────────────────────────────

  var UNPIN = { fwd: ['unpin', 'step'], back: ['bunpin', 'dist'], page: ['punpin', 'dist'] };
  function pinLabel(mode, k) { return mode === 'fwd' ? 'stap ' + (Number(k) + 1) : distLabel(Number(k), mode === 'page'); }
  /** De spelden in leesvolgorde: vooruit op stap, uitgelijnd van ver ervoor naar erna. */
  function pinKeys(mode, pins) { return Object.keys(pins).sort(function (a, b) { return mode === 'fwd' ? a - b : b - a; }); }

  function renderPinsLine(total, persons) {
    var mode = st.flow.mode, pins = curPins(), keys = pinKeys(mode, pins), u = UNPIN[mode];
    if (!keys.length) { $('bhPins').innerHTML = ''; return; }
    $('bhPins').innerHTML = '<span class="text-xs text-base-content/60">Vastgezet:</span> ' + keys.map(function (k) {
        return '<span class="badge badge-primary badge-outline gap-1">' + esc(pinLabel(mode, k)) + ': ' + esc(tokLabel(pins[k]))
          + '<button data-bh-action="' + u[0] + '" data-' + u[1] + '="' + k + '" aria-label="Losmaken">✕</button></span>';
      }).join(' ') + ' <button class="btn btn-ghost btn-xs" data-bh-action="unpin-all">alles losmaken</button>'
      + '<span class="text-xs text-base-content/60 ml-2">' + nf(total) + ' bezoeken'
      + (persons ? ' van ' + nf(persons) + ' ' + personWord(persons) : '') + ' volgen dit pad</span>';
  }

  function stepper(label, action, side, value, min, max, help) {
    var attr = 'data-bh-action="' + action + '"' + (side ? ' data-side="' + side + '"' : '');
    return '<div>' + groupLabel(label, help) + '<div class="join">'
      + '<button type="button" class="btn btn-sm join-item" ' + attr + ' data-value="-1"' + (value <= min ? ' disabled' : '') + ' aria-label="Een stap minder">−</button>'
      + '<span class="btn btn-sm join-item pointer-events-none tabular-nums">' + value + '</span>'
      + '<button type="button" class="btn btn-sm join-item" ' + attr + ' data-value="1"' + (value >= max ? ' disabled' : '') + ' aria-label="Een stap meer">+</button>'
      + '</div></div>';
  }

  /** De pagina's van het segment, op aantal bezoeken: de keuzelijst van "rond een pagina". */
  function focusOptions(cur) {
    var m = {};
    cur.forEach(function (s) {
      var seen = {};
      path(s).forEach(function (p) { if (!seen[p]) { seen[p] = 1; m[p] = (m[p] || 0) + 1; } });
    });
    return Object.keys(m).map(Number).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 200).map(function (p) { return [p, m[p]]; });
  }

  function renderFlowControls(cur) {
    var F = st.F, mode = st.flow.mode, counts = {};
    GOAL_ORDER.forEach(function (g) { counts[g] = 0; });
    cur.forEach(function (s) {
      var fl = s[C.flags];
      GOAL_ORDER.forEach(function (g) { if (GOALS[g].flags.some(function (x) { return fl & F[x]; })) counts[g]++; });
    });
    var html = '<div class="flex flex-wrap items-end gap-x-6 gap-y-3">'
      + '<div>' + groupLabel('Bekijk', 'Vanaf de instap: de eerste stappen van een bezoek. Rond een pagina: een pagina in het midden, met hoe bezoekers er komen en wat ze daarna doen, waar ze ook in het bezoek stond. Naar het doel toe: enkel bezoeken met het doel, uitgelijnd op de eerste keer dat het gebeurde.')
      + pills('flow-mode', null, [['fwd', 'Vanaf de instap'], ['page', 'Rond een pagina'], ['back', 'Naar het doel toe']], mode) + '</div>';
    if (mode === 'page') {
      var t = focusPage(), opts = focusOptions(cur), has = opts.some(function (o) { return o[0] === t; });
      html += '<label class="block min-w-0">' + groupLabel('Pagina', 'De pagina in het midden. Ook te kiezen met het vizier in de tabel "Per pagina", of met "Zet in het midden" bij "Pagina onder de loep".')
        + '<select class="select select-bordered select-sm max-w-[24rem] border-primary bg-primary/5 font-medium" data-bh-flow-page>'
        + (has ? '' : '<option value="" selected>' + esc(st.flow.page ? short(rawPageText(st.flow.page), 40) + ' (niet in dit segment)' : 'Kies een pagina') + '</option>')
        + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === t ? ' selected' : '') + '>' + esc(short(pageName(o[0]), 60)) + ' (' + nf(o[1]) + ')</option>'; }).join('')
        + '</select></label>';
    }
    html += '<label class="block">' + groupLabel('Doel', 'Vooruit en rond een pagina tonen bij elke pagina hoeveel bezoeken daarna dit doel haalden (groen). "Naar het doel toe" toont enkel bezoeken met dit doel, uitgelijnd op de eerste keer dat het gebeurde.')
      + '<select class="select select-bordered select-sm" data-bh-flow-goal>' + GOAL_ORDER.map(function (g) {
          return '<option value="' + g + '"' + (st.flow.goal === g ? ' selected' : '') + '>' + esc(GOALS[g].label) + ' (' + nf(counts[g]) + ')</option>';
        }).join('') + '</select></label>';
    html += mode === 'page'
      ? stepper('Ervoor', 'flow-side', 'pb', st.flow.pb, MIN_SIDE, MAX_SIDE, 'Hoeveel stappen voor de pagina: hoe bezoekers er komen.')
        + stepper('Erna', 'flow-side', 'pa', st.flow.pa, MIN_SIDE, MAX_SIDE, 'Hoeveel stappen na de pagina: wat eruit voortvloeit.')
      : stepper('Stappen', 'flow-steps', null, st.flow.n, MIN_STEPS, MAX_STEPS);
    $('bhFlowControls').innerHTML = html + '</div>';
  }

  function renderFlowLegend(m) {
    if (!m.total) { $('bhFlowLegend').innerHTML = ''; return; }
    var sw = function (color, label) {
      return '<span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-1.5 rounded-full" style="background-color:' + color + '"></span>' + label + '</span>';
    };
    var hasIn = m.cols.some(function (c) { return c.entry; });
    $('bhFlowLegend').innerHTML = '<div class="flex flex-wrap items-center gap-x-4 gap-y-1">'
      + (m.back
        ? '<span>Balk = deel van de bezoeken met ' + esc(m.goal.kort) + '.</span>'
        : '<span>Balk = wat die bezoekers daarna deden:</span>' + sw(GOOD, esc(m.goal.naam)) + sw(MOVE, 'gaat verder') + sw(DONE, 'stopt na ' + esc(m.goal.naam)) + sw(BAD, 'stopt hier'))
      + (hasIn ? '<span class="text-base-content/45">Komt binnen = het bezoek begint daar; de eerste stap staat in de kolom erna.</span>' : '')
      + '<span class="text-base-content/45">Linten = wie van de ene stap naar de volgende ging. Klik een kaart om dat pad vast te zetten.</span></div>';
  }

  function renderFlow(cur) {
    // Rond een pagina zonder gekozen pagina (eerste keer, of kapotte opslag): de drukst bezochte.
    if (st.flow.mode === 'page' && !st.flow.page) { var o = focusOptions(cur)[0]; if (o) st.flow.page = d('p', o[0]); }
    renderFlowControls(cur);
    var m = buildFlow(cur), fv = m.total ? pinVerdicts(cur, m) : [];
    flowModel = m.total ? m : null;
    renderPinsLine(m.total, m.view ? personCount(m.view) : 0);
    renderFlowAnswers(m, fv);
    renderFlowLegend(m);
    renderFocus(cur, m);
    if (!m.total) {
      var msg = m.back
        ? 'Geen bezoeken met ' + esc(m.goal.kort) + (Object.keys(st.bpins).length ? ' langs dit pad' : ' in dit segment') + '.'
        : m.page
          ? (m.focus < 0
            ? (st.flow.page ? 'De pagina ' + esc(short(rawPageText(st.flow.page), 60)) + ' komt in deze periode niet voor. Kies hierboven een andere pagina.' : 'Kies hierboven een pagina.')
            : 'Geen bezoeken met ' + esc(pageLabel(m.focus)) + (Object.keys(st.ppins).length ? ' langs dit pad.' : ' in dit segment.'))
          : 'Geen bezoeken met dit pad.';
      $('bhFlow').innerHTML = '<p class="text-sm text-base-content/60 p-4">' + msg + '</p>';
      return;
    }
    renderFlowGrid(m);
  }

  // ── Pagina onder de loep ───────────────────────────────────────────────────
  // Verschijnt zodra er een pagina in focus staat: een vastgezette pagina, of die in
  // het midden. "Waar het stokt" zegt DAT een pagina stokt; dit zegt waarom, met wat
  // de sessies weten: hoe de pagina het doet als instap en later in het bezoek, wie er
  // stopt (kanaal, bron, toestel, eerste of terugkerend), hoe lang stoppers bleven, en
  // waar bezoekers vandaan komen en heen gaan.

  /** De pagina onder de loep: die in het midden, anders de laatst aangeklikte of de diepste vastgezette pagina. */
  function focusOf(m) {
    if (m.page) return m.focus >= 0 ? { t: m.focus, v: 0 } : null;
    var pins = m.back ? st.bpins : st.pins, list = [];
    Object.keys(pins).forEach(function (k) { if (pins[k] >= 0) list.push({ t: pins[k], v: Number(k) }); });
    if (!list.length) return null;
    if (m.back) return list.sort(function (a, b) { return (a.v > 0 ? a.v : 99) - (b.v > 0 ? b.v : 99); })[0];
    return list.filter(function (x) { return x.v === st.focusV; })[0] || list.sort(function (a, b) { return b.v - a.v; })[0];
  }

  /**
   * De bezoeken waarover de uitleg gaat, telkens met de positie van de pagina.
   * Vooruit: wie met dezelfde spelden tot en met die stap daar staat (spelden erna
   * tellen niet: wie stopt, kan ze niet volgen). Rond een pagina: wat de padverkenner
   * toont. Naar het doel toe haalt iedereen in het pad het doel, dus stoppen bestaat
   * daar niet: dan alle bezoeken met de pagina.
   */
  function focusPairs(cur, m, f) {
    var out = [];
    if (m.page) return { pairs: m.view.map(function (s, j) { return [s, m.al[j]]; }), scope: Object.keys(st.ppins).length ? 'path' : 'all' };
    if (!m.back) {
      cur.forEach(function (s) {
        var p = steps(s);
        for (var q in st.pins) if (Number(q) <= f.v && mergeTok(p[q]) !== st.pins[q]) return;
        out.push([s, f.v]);
      });
      return { pairs: out, scope: Object.keys(st.pins).length > 1 ? 'path' : 'step',
        later: Object.keys(st.pins).some(function (q) { return Number(q) > f.v; }) };
    }
    cur.forEach(function (s) { var k = steps(s).indexOf(f.t); if (k >= 0) out.push([s, k]); });
    return { pairs: out, scope: 'all' };
  }

  function verdictBanner(state, n, stop, exp) {
    var rate = n ? stop / n : 0, er = n ? exp / n : 0, diff = Math.round(Math.abs(stop - exp));
    var cls = state === 'bad' ? 'border-error/40 bg-error/10' : state === 'good' ? 'border-success/40 bg-success/10' : 'border-base-content/10';
    var icon = state === 'bad' ? 'trending-down' : state === 'good' ? 'trending-up' : 'minus';
    var color = state === 'bad' ? BAD : state === 'good' ? GOOD : 'oklch(var(--bc) / 0.6)';
    var txt = state === 'few' ? 'Te weinig bezoeken om te zeggen of het hier stokt.'
      : '<strong>' + pctTxt(rate * 100) + '</strong> van de bezoeken stopt op deze pagina. Op dezelfde plaats in een bezoek stopt gemiddeld <strong>' + pctTxt(er * 100) + '</strong>'
        + (state === 'bad' ? ': ongeveer ' + nf(diff) + ' bezoeken meer dan verwacht. Hier stokt het.'
          : state === 'good' ? ': ongeveer ' + nf(diff) + ' bezoeken minder dan verwacht. Deze pagina houdt bezoekers beter vast dan gemiddeld.'
          : '. Deze pagina doet het ongeveer gemiddeld.');
    return '<div class="rounded-xl border ' + cls + ' p-3 mt-3 flex items-start gap-2 text-sm">'
      + '<i data-lucide="' + icon + '" class="w-4 h-4 mt-0.5 shrink-0" style="color:' + color + '"></i>'
      + '<p>' + txt + ' <span class="text-xs text-base-content/55">Over het hele segment: als instap vergeleken met de andere instappagina\'s, later in het bezoek met de andere pagina\'s op die plaats.</span></p></div>';
  }

  /** Instap / later in het bezoek / samen, elk met het gemiddelde ernaast. */
  function roleTable(r, b, exp, goal) {
    function line(label, help, x, base) {
      var sr = rateOf(x, 'stop'), sb = rateOf(base, 'stop'), gr = rateOf(x, 'goal'), gb = rateOf(base, 'goal');
      var sc = x.n >= 5 ? (sr - sb >= 0.03 ? BAD : sb - sr >= 0.03 ? GOOD : '') : '';
      var gc = x.n >= 20 ? (x.goal >= 2 && gr >= gb * 1.5 && gr - gb >= 0.005 ? GOOD : gb > 0 && gr <= gb * 0.5 ? BAD : '') : '';
      var col = function (c) { return c ? ' style="color:' + c + '"' : ''; };
      return '<tr><td><span title="' + esc(help) + '">' + label + '</span></td>'
        + '<td class="text-right tabular-nums">' + nf(x.n) + '</td>'
        + '<td class="text-right tabular-nums font-semibold"' + col(sc) + '>' + (x.n ? pctTxt(sr * 100) : '—') + '</td>'
        + '<td class="text-right tabular-nums text-base-content/50">' + (base.n ? pctTxt(sb * 100) : '—') + '</td>'
        + '<td class="text-right tabular-nums font-semibold"' + col(gc) + '>' + (x.n ? pctTxt(gr * 100) : '—') + '</td>'
        + '<td class="text-right tabular-nums text-base-content/50">' + (base.n ? pctTxt(gb * 100) : '—') + '</td></tr>';
    }
    var sum = { n: r.entry.n + r.later.n, stop: r.entry.stop + r.later.stop, goal: r.entry.goal + r.later.goal };
    return '<div class="overflow-x-auto mt-3"><table class="table table-sm">'
      + '<thead><tr><th>Plaats in het bezoek</th><th class="text-right">Bezoeken</th><th class="text-right">Stopt hier</th><th class="text-right font-normal">gem.</th>'
      + '<th class="text-right">Doet daarna ' + esc(goal.kort) + '</th><th class="text-right font-normal">gem.</th></tr></thead><tbody>'
      + line('Instap', 'Het bezoek begon op deze pagina. Vergeleken met elke andere instappagina.', r.entry, b.entry)
      + line('Later in het bezoek', 'De bezoeker kwam hier via een andere pagina (de eerste keer in dat bezoek). Vergeleken met elke andere pagina op die plaats.', r.later, b.later)
      + line('<strong>Samen</strong>', 'Het gemiddelde is gewogen naar de mix van deze pagina: zoveel als instap, zoveel later in het bezoek.', sum, exp)
      + '</tbody></table></div>';
  }

  /** Wie stopt hier: per groep, hoe lang ze bleven, en wat ze deden als ze enkel deze pagina zagen. */
  function stopSection(rows, fp, f, m) {
    var n = rows.length, F = st.F, goal = m.goal;
    var stops = rows.filter(function (x) { return x.stop; }), avg = stops.length / n;
    var scopeTxt = fp.scope === 'all' ? nf(n) + ' bezoeken met deze pagina'
      : fp.scope === 'step' ? (f.v === 0 ? nf(n) + ' bezoeken die hier binnenkwamen' : nf(n) + ' bezoeken met deze pagina op stap ' + (f.v + 1))
      : nf(n) + ' bezoeken in het vastgezette pad';
    var html = '<div class="border-t border-base-content/10 mt-4 pt-4">'
      + '<h3 class="font-semibold text-sm">Wie stopt hier?</h3>'
      + '<p class="text-xs text-base-content/60 mt-0.5">Van de ' + scopeTxt + ' stopt <strong style="color:' + BAD + '">' + pctTxt(avg * 100) + '</strong> hier, zonder ' + esc(goal.kort) + '.'
      + (fp.later ? ' Spelden verder in het pad tellen hier niet mee: wie stopt, kan ze niet volgen.' : '')
      + (stops.length ? ' Per groep; klik een groep om het segment erop te filteren.' : '') + '</p>';
    if (!stops.length) return html + '<p class="text-sm text-base-content/60 mt-2">Niemand stopt hier zonder ' + esc(goal.kort) + '.</p></div>';

    var dims = [
      { title: 'Per kanaal', of: function (s) { return s[C.ch]; }, dot: true,
        label: function (v) { return d('ch', v) || 'Onbekend'; },
        phrase: function (v) { return 'via ' + (d('ch', v) || 'een onbekend kanaal'); },
        attrs: function (v) { return 'data-bh-action="filter" data-key="ch" data-value="' + v + '"'; } },
      { title: 'Per bron of campagne', of: function (s) { return s[C.det]; },
        label: function (v) { return v >= 0 ? d('det', v) : '(geen bron)'; },
        phrase: function (v) { return v >= 0 ? 'bron "' + d('det', v) + '"' : 'zonder bron'; },
        attrs: function (v) { return v >= 0 ? 'data-bh-action="filter" data-key="det" data-value="' + v + '"' : ''; } },
      { title: 'Per toestel', of: function (s) { return s[C.dev]; },
        label: function (v) { return v >= 0 ? (DEV_LABELS[d('dev', v)] || d('dev', v)) : 'Onbekend'; },
        phrase: function (v) { return 'op ' + String(v >= 0 ? (DEV_LABELS[d('dev', v)] || d('dev', v)) : 'een onbekend toestel').toLowerCase(); },
        attrs: function (v) { return v >= 0 ? 'data-bh-action="filter" data-key="dev" data-value="' + v + '"' : ''; } },
      { title: 'Eerste of terugkerend', of: function (s) { return s[C.flags] & F.isNew ? 'new' : 'return'; },
        label: function (v) { return v === 'new' ? 'Eerste bezoek' : 'Terugkerend'; },
        phrase: function (v) { return v === 'new' ? 'bij een eerste bezoek' : 'bij terugkerende bezoekers'; },
        attrs: function (v) { return 'data-bh-action="seg" data-key="visit" data-value="' + v + '"'; } }
    ];
    function group(of) {
      var g = {};
      rows.forEach(function (x) { var v = of(x.s); var e = g[v] || (g[v] = { v: v, n: 0, stop: 0 }); e.n++; if (x.stop) e.stop++; });
      return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.n - a.n; });
    }
    function dimRow(dm, e) {
      var r = e.stop / e.n, diff = r - avg, attrs = dm.attrs(e.v);
      var col = e.n >= 5 && diff >= 0.05 ? BAD : e.n >= 5 && diff <= -0.05 ? GOOD : '';
      var tag = attrs ? 'button' : 'div';
      return '<' + tag + (attrs ? ' type="button" ' + attrs : '') + ' class="w-full grid grid-cols-[minmax(0,1fr)_2.75rem_4rem_2.75rem] items-center gap-2 rounded px-1.5 py-1 text-xs text-left' + (attrs ? ' om-hover' : '') + '"'
        + ' title="' + esc(dm.label(e.v) + ': ' + nf(e.n) + ' bezoeken, ' + pctTxt(r * 100) + ' stopt hier (gemiddeld ' + pctTxt(avg * 100) + ').' + (attrs ? ' Klik om het segment hierop te filteren.' : '')) + '">'
        + '<span class="flex items-center gap-1.5 min-w-0">' + (dm.dot ? dot(chColor(d('ch', e.v))) : '') + '<span class="truncate">' + esc(dm.label(e.v)) + '</span></span>'
        + '<span class="text-right tabular-nums text-base-content/55">' + nf(e.n) + '</span>'
        + '<span class="block h-1.5 rounded-full om-spoor overflow-hidden"><span class="block h-full rounded-full" style="width:' + (r * 100).toFixed(1) + '%;background-color:' + BAD + ';opacity:0.75"></span></span>'
        + '<span class="text-right tabular-nums font-medium"' + (col ? ' style="color:' + col + '"' : '') + '>' + pctTxt(r * 100) + '</span>'
        + '</' + tag + '>';
    }
    function dimBox(dm) {
      return '<div class="rounded-xl border border-base-content/10 p-2">'
        + '<div class="flex items-baseline justify-between gap-2 px-1.5 pb-1"><span class="text-xs font-semibold">' + esc(dm.title) + '</span>'
        + '<span class="text-[10px] text-base-content/45">bezoeken · stopt hier</span></div>'
        + group(dm.of).slice(0, 5).map(function (e) { return dimRow(dm, e); }).join('') + '</div>';
    }
    // De groep die het meest bijdraagt aan het stokken: het grootste OVERSCHOT aan
    // stoppers, niet het hoogste percentage (3 op 3 zegt weinig).
    var worst = null;
    dims.forEach(function (dm) {
      group(dm.of).forEach(function (e) {
        var rr = e.stop / e.n, score = e.stop - e.n * avg;
        if (e.n >= 10 && rr - avg >= 0.05 && score >= 2 && (!worst || score > worst.score)) worst = { dm: dm, e: e, r: rr, score: score };
      });
    });
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">' + dims.map(dimBox).join('') + '</div>'
      + (worst ? '<p class="text-sm mt-3">Het meest boven het gemiddelde: <strong>' + esc(worst.dm.phrase(worst.e.v)) + '</strong> stopt ' + pctTxt(worst.r * 100)
        + ' hier (' + nf(worst.e.n) + ' bezoeken), tegenover ' + pctTxt(avg * 100) + ' gemiddeld.</p>' : '');

    // Hoe lang: van het openen van de pagina tot het laatste signaal van het bezoek.
    var times = stops.map(function (x) { return Math.max(0, x.s[C.dur] - (x.s._so[x.k] || 0)); });
    var tb = [0, 0, 0, 0];
    times.forEach(function (x) { tb[x < 10 ? 0 : x < 30 ? 1 : x < 120 ? 2 : 3]++; });
    // Scrollen en klikken gelden voor het hele BEZOEK: enkel betrouwbaar bij wie niets
    // anders bekeek. De oude historiek heeft geen klikken, die telt niet mee.
    var solo = stops.filter(function (x) { return path(x.s).length === 1 && !(x.s[C.flags] & F.historic); });
    var deep = solo.filter(function (x) { return x.s[C.scroll] >= 75; }).length;
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">'
      + miniDist('Hoe lang ze bleven voor ze weggingen', 'mediaan ' + durTxt(median(times)),
          [['minder dan 10 s', tb[0]], ['10 à 30 s', tb[1]], ['30 s à 2 min', tb[2]], ['2 min of meer', tb[3]]], stops.length,
          'Van het openen van de pagina tot het laatste signaal van het bezoek.')
      + (solo.length ? miniDist('Wie enkel deze pagina zag', nf(solo.length) + ' bezoeken', [
          ['scrolde voorbij ¾', deep],
          ['bleef bovenaan (< ¼)', solo.filter(function (x) { return x.s[C.scroll] < 25; }).length],
          ['klikte ergens', solo.filter(function (x) { return x.s[C.clicks] > 0; }).length]
        ], solo.length, 'Scrollen en klikken gelden voor het hele bezoek, dus enkel hier betrouwbaar. De oude historiek telt niet mee.') : '')
      + '</div>';

    // Een voorzichtige lezing, pas vanaf 10 stoppers: snel weg wijst op de verwachting
    // (bron, zoekterm, advertentie), lang lezen en dan weg op een ontbrekende volgende stap.
    var lezing = '';
    if (stops.length >= 10) {
      var fast = tb[0] / stops.length, slow = (tb[2] + tb[3]) / stops.length;
      if (fast >= 0.6) lezing = pctTxt(fast * 100) + ' van wie hier stopt, is binnen 10 seconden weg. Dat wijst eerder op een verwachting die niet klopt (de zoekterm, de advertentie of de link waarlangs ze kwamen) dan op wat er verderop de pagina staat.';
      else if (slow >= 0.5) lezing = pctTxt(slow * 100) + ' van wie hier stopt, bleef langer dan 30 seconden'
        + (solo.length >= 10 && deep / solo.length >= 0.4 ? ', en veel van hen scrolden tot onderaan' : '')
        + ': ze lezen, maar vinden geen volgende stap. Kijk naar de knoppen en links op de pagina: is duidelijk wat ze nu kunnen doen?';
    }
    if (lezing) {
      html += '<div class="rounded-xl border border-info/30 bg-info/10 p-3 mt-3 flex items-start gap-2 text-sm">'
        + '<i data-lucide="lightbulb" class="w-4 h-4 mt-0.5 shrink-0"></i><p><strong>Lezing:</strong> ' + esc(lezing) + '</p></div>';
    }
    return html + '</div>';
  }

  /** Waar ze vandaan komen en heen gaan, met vastzetten waar die kolom in beeld is. */
  function flowLists(rows, f, m) {
    var n = rows.length, goal = m.goal, entryN = 0, entryCh = {}, prev = {}, next = {}, stopN = 0, goalN = 0;
    rows.forEach(function (x) {
      if (x.k === 0) { entryN++; entryCh[x.s[C.ch]] = (entryCh[x.s[C.ch]] || 0) + 1; }
      else { var pt = x.p[x.k - 1]; prev[pt] = (prev[pt] || 0) + 1; }
      if (x.k + 1 < x.p.length) { var nt = x.p[x.k + 1]; next[nt] = (next[nt] || 0) + 1; }
      if (x.stop) stopN++;
      if (x.goal) goalN++;
    });
    var prevAttr = m.page ? function (tk) { return pinAttrs(m, 1, tk); }
      : (!m.back && f.v >= 1 && st.pins[f.v - 1] === undefined) ? function (tk) { return pinAttrs(m, f.v - 1, tk); } : null;
    var nextAttr = m.page ? function (tk) { return pinAttrs(m, -1, tk); }
      : (!m.back && f.v + 1 < m.n) ? function (tk) { return pinAttrs(m, f.v + 1, tk); } : null;
    var entryAttr = m.page ? pinAttrs(m, 1, ENTRY) : '';
    function tokRows(map, attrOf) {
      return Object.keys(map).map(Number).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 5).map(function (tk) {
        var attrs = attrOf ? attrOf(tk) : '', tag = attrs ? 'button' : 'div';
        return '<' + tag + (attrs ? ' type="button" ' + attrs : '') + ' class="w-full flex items-center gap-2 rounded px-1.5 py-1 text-xs text-left' + (attrs ? ' om-hover' : '') + '"'
          + ' title="' + esc(tokName(tk) + (attrs ? '. Klik om vast te zetten.' : '')) + '">'
          + '<span class="flex-1 min-w-0 flex items-center gap-1 truncate">' + tokChip(tk) + '</span>'
          + '<span class="tabular-nums text-base-content/60">' + pctTxt(pct(map[tk], n)) + '</span></' + tag + '>';
      }).join('');
    }
    var chs = Object.keys(entryCh).map(Number).sort(function (a, b) { return entryCh[b] - entryCh[a]; }).slice(0, 3)
      .map(function (ch) { return esc(d('ch', ch)) + ' ' + pctTxt(pct(entryCh[ch], entryN)); }).join(' · ');
    var entryTag = entryAttr ? 'button' : 'div';
    var come = '<div class="rounded-xl border border-base-content/10 p-2"><div class="text-xs font-semibold px-1.5 pb-1">Hoe ze er komen</div>'
      + (entryN ? '<' + entryTag + (entryAttr ? ' type="button" ' + entryAttr : '') + ' class="w-full text-left rounded px-1.5 py-1 text-xs' + (entryAttr ? ' om-hover' : '') + '"'
          + ' title="' + esc('Het bezoek begon op deze pagina.' + (entryAttr ? ' Klik om enkel die bezoeken te zien.' : '')) + '">'
          + '<span class="flex items-center gap-2"><i data-lucide="log-in" class="w-3.5 h-3.5 text-base-content/50"></i><span class="flex-1">Begon op deze pagina</span>'
          + '<span class="tabular-nums text-base-content/60">' + pctTxt(pct(entryN, n)) + '</span></span>'
          + (chs ? '<span class="block text-[11px] text-base-content/50 pl-5">via ' + chs + '</span>' : '') + '</' + entryTag + '>' : '')
      + (n - entryN ? '<div class="text-[11px] text-base-content/50 px-1.5 pt-1">Van een andere pagina of actie (' + pctTxt(pct(n - entryN, n)) + '):</div>' + tokRows(prev, prevAttr) : '')
      + '</div>';
    var go = '<div class="rounded-xl border border-base-content/10 p-2"><div class="text-xs font-semibold px-1.5 pb-1">Wat ze daarna doen</div>'
      + tokRows(next, nextAttr)
      + '<div class="flex items-center gap-2 px-1.5 py-1 text-xs"><span class="flex-1">Stopt hier, zonder ' + esc(goal.kort) + '</span>'
      + '<span class="tabular-nums font-medium" style="color:' + BAD + '">' + pctTxt(pct(stopN, n)) + '</span></div>'
      + '<div class="flex items-center gap-2 px-1.5 py-1 text-xs"><span class="flex-1">Doet later in het bezoek ' + esc(goal.kort) + '</span>'
      + '<span class="tabular-nums font-medium" style="color:' + GOOD + '">' + pctTxt(pct(goalN, n)) + '</span></div>'
      + '</div>';
    return '<div class="border-t border-base-content/10 mt-4 pt-4"><h3 class="font-semibold text-sm">Waar ze vandaan komen en heen gaan</h3>'
      + '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">' + come + go + '</div></div>';
  }

  function renderFocus(cur, m) {
    var card = $('bhFocusCard');
    if (!card) return;
    var f = m.total ? focusOf(m) : null;
    if (!f) { card.innerHTML = ''; card.classList.add('hidden'); return; }
    var t = f.t, fp = focusPairs(cur, m, f);
    var R = pageRoles(cur, t), r = R.page, b = R.base, all = r.entry.n + r.later.n;
    var expStop = r.entry.n * rateOf(b.entry, 'stop') + r.later.n * rateOf(b.later, 'stop');
    var expGoal = r.entry.n * rateOf(b.entry, 'goal') + r.later.n * rateOf(b.later, 'goal');
    var pn = personCount(cur.filter(function (s) { return steps(s).indexOf(t) >= 0; }));
    var rows = fp.pairs.map(function (x) {
      var s = x[0], k = x[1], p = steps(s), g = goalIdx(s);
      return { s: s, k: k, p: p, stop: k === p.length - 1 && g < 0, goal: g > k };
    });
    var html = '<div class="flex flex-wrap items-start justify-between gap-3">'
      + '<div class="min-w-0"><div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 flex items-center gap-1"><i data-lucide="search" class="w-3 h-3"></i> Pagina onder de loep</div>'
      + '<h2 class="text-lg font-semibold mt-0.5" style="overflow-wrap:anywhere">' + esc(pageLabel(t)) + '</h2>'
      + '<div class="text-xs text-base-content/55 break-all">' + esc(pageName(t)) + '</div></div>'
      + (m.page ? '' : '<button type="button" class="btn btn-sm btn-outline gap-1" data-bh-action="focus-page" data-page="' + t + '"'
        + ' title="Bekijk deze pagina in het midden van de padverkenner: hoe bezoekers er komen en wat ze daarna doen, waar ze ook in het bezoek stond.">'
        + '<i data-lucide="crosshair" class="w-4 h-4"></i> Zet in het midden</button>')
      + '</div>'
      + '<p class="text-sm mt-2">Bekeken in <strong>' + nf(all) + ' bezoeken</strong> door ' + nf(pn) + ' ' + personWord(pn) + ' (' + pctTxt(pct(all, cur.length)) + ' van het segment).</p>'
      + verdictBanner(verdictState(all, r.entry.stop + r.later.stop, expStop), all, r.entry.stop + r.later.stop, expStop)
      + roleTable(r, b, { n: all, stop: expStop, goal: expGoal }, m.goal);
    if (rows.length) html += stopSection(rows, fp, f, m) + flowLists(rows, f, m);
    card.innerHTML = html;
    card.classList.remove('hidden');
  }

  // ── Meest gevolgde paden ───────────────────────────────────────────────────

  /** Een stap in een pad als tekst: een pagina, of een actie als groen etiket. strong = de pagina in het midden. */
  function tokChip(t, strong) {
    if (t === ENTRY) return '<span class="text-base-content/50">Komt binnen</span>';
    if (t < 0) {
      var a = ACT[-t];
      return '<span class="inline-flex items-center gap-1 rounded-md bg-success/20 px-1.5 font-medium" title="' + esc(tokName(t)) + '">'
        + '<i data-lucide="' + (a ? a.icon : 'check') + '" class="w-3 h-3"></i>' + esc(a ? a.short : 'Actie') + '</span>';
    }
    return '<span class="truncate max-w-[14rem]' + (strong ? ' font-semibold text-primary' : '') + '" title="' + esc(pageName(t)) + '">' + esc(pageLabel(t)) + '</span>';
  }

  function renderPaths(cur) {
    var mode = st.flow.mode, back = mode === 'back', page = mode === 'page', n = st.flow.n, goal = GOALS[st.flow.goal], m = {};
    var ft = page ? focusPage() : -1;
    var view = back || page ? cur.filter(function (s) { return alignIdx(s) >= 0; }).filter(pinned) : cur.filter(pinned);
    view.forEach(function (s) {
      var full = steps(s), g = goalIdx(s), a = page ? alignIdx(s) : g, from, to;
      if (back) { from = Math.max(0, g - n); to = g + 1; }
      else if (page) { from = Math.max(0, a - st.flow.pb); to = a + st.flow.pa + 1; }
      else { from = 0; to = n; }
      var seq = full.slice(from, to);
      if (!seq.length) return;
      var k = (from > 0 ? '…>' : '') + seq.join('>');
      var e = m[k] || (m[k] = { p: seq, n: 0, conv: 0, more: 0, cut: from > 0, anchor: a - from });
      e.n++;
      if (g >= 0) e.conv++;
      if (!back && full.length > to) e.more++;
    });
    var rows = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var max = rows.length ? rows[0].n : 1;
    $('bhPathsTitle').textContent = back ? 'Meest gevolgde wegen naar ' + goal.kort
      : page ? 'Meest gevolgde wegen langs ' + (ft >= 0 ? pageLabel(ft) : 'de pagina') : 'Meest gevolgde paden';
    $('bhPathsSub').textContent = back
      ? 'De laatste ' + n + ' ' + stepWord(n) + ' voor ' + goal.kort + ' (de eerste keer in dat bezoek). Klik om de weg vast te zetten.'
      : page
        ? 'Tot ' + st.flow.pb + ' ' + stepWord(st.flow.pb) + ' ervoor en ' + st.flow.pa + ' erna; de pagina staat vet. Klik om de weg vast te zetten.'
        : 'De eerste ' + n + ' ' + stepWord(n) + ' van een bezoek; acties staan in het groen. Klik om het pad vast te zetten.';
    $('bhPaths').innerHTML = rows.length ? rows.map(function (r) {
      var act = back ? 'bpin-path' : page ? 'ppin-path' : 'pin-path';
      var ended = page ? r.p.length - 1 - r.anchor < st.flow.pa : r.p.length === 1;
      return '<button type="button" class="w-full text-left rounded-lg px-2 py-2 om-hover" data-bh-action="' + act + '" data-path="' + r.p.join(',') + '"'
        + (page ? ' data-anchor="' + r.anchor + '" data-cut="' + (r.cut ? 1 : 0) + '"' : '') + '>'
        + '<div class="flex flex-wrap items-center gap-1 text-sm">' + (r.cut ? '<span class="text-base-content/40">… →</span>' : '')
        + r.p.map(function (t, i) { return tokChip(t, page && i === r.anchor); }).join('<span class="text-base-content/30">→</span>')
        + (!back && ended ? ' <span class="text-xs text-base-content/50">(en weg)</span>' : '') + (r.more ? ' <span class="text-xs text-base-content/50">→ …</span>' : '') + '</div>'
        + '<div class="flex items-center gap-3 mt-1"><div class="h-1.5 rounded-full om-spoor flex-1 overflow-hidden"><div class="h-full rounded-full" style="width:' + (r.n / max * 100) + '%;background-color:' + ACCENT + '"></div></div>'
        + '<span class="text-xs text-base-content/60 tabular-nums w-28 text-right">' + nf(r.n) + ' · ' + pctTxt(pct(r.n, view.length)) + '</span>'
        + (back ? '' : '<span class="text-xs text-success tabular-nums w-14 text-right" title="Deel van deze bezoeken met ' + esc(goal.kort) + '">' + (r.conv ? '✓ ' + pctTxt(pct(r.conv, r.n)) : '') + '</span>')
        + '</div></button>';
    }).join('') : '<p class="text-sm text-base-content/60">' + (back ? 'Geen bezoeken met ' + esc(goal.kort) + '.' : page ? 'Geen bezoeken met deze pagina.' : 'Geen paden.') + '</p>';
  }

  // ── Per pagina ─────────────────────────────────────────────────────────────

  function renderPages(cur) {
    var view = cur.filter(pinned), m = {};
    view.forEach(function (s) {
      var p = path(s), o = s._o, seen = {};
      for (var i = 0; i < p.length; i++) {
        var g = m[p[i]] || (m[p[i]] = { k: p[i], n: 0, entry: 0, exit: 0, conv: 0, times: [] });
        if (!seen[p[i]]) { g.n++; if (converted(s)) g.conv++; seen[p[i]] = true; }
        if (i === 0) g.entry++;
        if (i === p.length - 1) g.exit++;
        if (i < p.length - 1) { var t = o[i + 1] - o[i]; if (t >= 0 && t < 1800) g.times.push(t); }
      }
    });
    var q = st.pageQuery.toLowerCase();
    var rows = Object.keys(m).map(function (k) {
      var g = m[k];
      return { k: g.k, name: pageName(g.k), n: g.n, entry: pct(g.entry, g.n), exit: pct(g.exit, g.n), time: median(g.times), conv: pct(g.conv, g.n) };
    }).filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0; });
    var key = st.sort.key, dir = st.sort.dir;
    rows.sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x === null) return 1; if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    var head = function (k, label, help) {
      var arrow = st.sort.key === k ? (st.sort.dir < 0 ? ' ↓' : ' ↑') : '';
      return '<th class="' + (k === 'name' ? '' : 'text-right') + '"><button class="hover:underline" data-bh-action="sort" data-key="' + k + '" title="' + esc(help) + '">' + label + arrow + '</button></th>';
    };
    var max = rows.reduce(function (mx, r) { return Math.max(mx, r.n); }, 1);
    $('bhPages').innerHTML = '<table class="table table-sm"><thead><tr>'
      + head('name', 'Pagina', 'Sorteer op naam') + head('n', 'Bezoeken', 'Bezoeken waarin deze pagina voorkwam')
      + head('entry', 'Instap', 'Hoe vaak het bezoek hier begon') + head('exit', 'Laatste', 'Hoe vaak het bezoek hier eindigde')
      + head('time', 'Tijd', 'Mediane tijd tot de volgende pagina (de laatste pagina van een bezoek heeft geen tijd)')
      + head('conv', 'Aanvraag', 'Deel van de bezoeken met deze pagina dat in een aanvraag eindigde') + '</tr></thead><tbody>'
      + rows.slice(0, st.pageLimit).map(function (r) {
        var active = st.f.visited === r.k, inMidden = st.flow.mode === 'page' && focusPage() === r.k;
        return '<tr class="hover cursor-pointer ' + (active ? 'bg-primary/10' : '') + '" data-bh-action="filter" data-key="visited" data-value="' + r.k + '" title="Alleen bezoeken met deze pagina">'
          + '<td class="max-w-[22rem]"><div class="flex items-center gap-1 min-w-0">'
          + '<button type="button" class="btn btn-ghost btn-xs btn-square shrink-0 ' + (inMidden ? 'text-primary' : 'text-base-content/40') + '" data-bh-action="focus-page" data-page="' + r.k + '"'
          + ' title="Zet deze pagina in het midden van de padverkenner: hoe bezoekers er komen en wat ze daarna doen." aria-label="Zet in het midden"><i data-lucide="crosshair" class="w-3.5 h-3.5"></i></button>'
          + '<span class="truncate" title="' + esc(r.name) + '">' + esc(r.name) + '</span></div>'
          + '<div class="h-1 rounded-full om-spoor mt-1"><div class="h-full rounded-full" style="width:' + (r.n / max * 100) + '%;background-color:' + ACCENT + '"></div></div></td>'
          + '<td class="text-right tabular-nums">' + nf(r.n) + '</td><td class="text-right tabular-nums">' + pctTxt(r.entry) + '</td>'
          + '<td class="text-right tabular-nums">' + pctTxt(r.exit) + '</td><td class="text-right tabular-nums">' + durTxt(r.time) + '</td>'
          + '<td class="text-right tabular-nums">' + pctTxt(r.conv) + '</td></tr>';
      }).join('') + '</tbody></table>'
      + (rows.length > st.pageLimit ? '<button class="btn btn-ghost btn-sm w-full" data-bh-action="more-pages">Toon meer (' + nf(rows.length - st.pageLimit) + ')</button>' : '');
  }

  // ── Wat je bekijkt: het segment, het vastgezette pad, en wie het kleurt ─────
  // In een klein segment kan één persoon alles bepalen (7 van de 7 bezoeken). Dan
  // lees je het gedrag van die persoon, niet dat van "de bezoeker" -- en dat moet je
  // zien vóór je er iets uit besluit. Vanaf 3 bezoeken en een kwart van het geheel.
  // TWEE niveaus, elk met hun eigen waarschuwing, onder elkaar in de zijkolom:
  //   het SEGMENT (kerncijfers, trend) en het VASTGEZETTE PAD (padverkenner, paden,
  //   per pagina, recente bezoeken). De eerste versie zette een waarschuwing over het
  //   pad bovenaan de pagina, onder de zin over het segment: "7 van de 7" naast
  //   "31 bezoeken door 18 prospecten" las als een tegenspraak.
  // Uitsluiten opent het venster van webgedrag.js (window.WebGedrag.exclude).
  var DOMINANT_MIN = 3, DOMINANT_SHARE = 0.25;
  function dominant(list) {
    var per = {};
    list.forEach(function (s) { var k = personKey(s); (per[k] = per[k] || { n: 0, s: s }).n++; });
    return Object.keys(per).map(function (k) { return per[k]; })
      .filter(function (x) { return x.n >= DOMINANT_MIN && x.n / list.length >= DOMINANT_SHARE; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 2);
  }
  function warnHtml(x, total) {
    var label = personLabel(x.s), uuid = d('v', x.s[C.v]);
    var wie = label ? esc(label) : 'een anonieme bezoeker (browser ' + esc(String(uuid).slice(0, 8)) + ')';
    var admin = !!(window.WebGedrag && window.WebGedrag.canExclude && window.WebGedrag.canExclude());
    return '<div class="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-2">'
      + '<p class="text-sm"><strong>' + nf(x.n) + ' van de ' + nf(total) + ' bezoeken</strong> (' + pctTxt(pct(x.n, total)) + ') komen van één persoon: '
      + '<strong class="break-all">' + wie + '</strong>. Wat je ziet, is vooral het gedrag van die persoon.</p>'
      + '<div class="flex flex-wrap gap-1"><button class="btn btn-xs" data-bh-action="visitor" data-uuid="' + esc(uuid) + '">Bekijk traject</button>'
      + (admin ? '<button class="btn btn-xs btn-ghost" data-bh-action="exclude" data-uuid="' + esc(uuid) + '" data-norm="' + esc(label || '') + '">Uitsluiten uit de cijfers</button>' : '')
      + '</div></div>';
  }
  function renderScope(cur) {
    $('bhConcentration').innerHTML = dominant(cur).map(function (x) { return warnHtml(x, cur.length); }).join('');
    var mode = st.flow.mode, pins = curPins(), keys = pinKeys(mode, pins), page = mode === 'page';
    // Rond een pagina filtert altijd (enkel bezoeken met die pagina), ook zonder spelden: zeggen.
    if (!keys.length && !page) { $('bhPinSummary').innerHTML = ''; return; }
    var view = cur.filter(pinned), pn = personCount(view), ft = page ? focusPage() : -1;
    var title = page ? 'Rond een pagina' : 'Vastgezet pad' + (mode === 'back' ? ' · naar ' + esc(GOALS[st.flow.goal].kort) : '');
    $('bhPinSummary').innerHTML = '<div class="border-t border-base-content/10 pt-3 space-y-2">'
      + '<div class="flex items-center justify-between gap-2">'
      +   '<span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50">' + title + '</span>'
      +   (page ? '<button class="btn btn-ghost btn-xs" data-bh-action="flow-mode" data-value="fwd">terug naar de instap</button>'
             : '<button class="btn btn-ghost btn-xs" data-bh-action="unpin-all">losmaken</button>') + '</div>'
      + '<div class="flex flex-wrap gap-1">'
      + (page ? '<span class="badge badge-primary max-w-full" title="' + esc(rawPageText(st.flow.page)) + '"><span class="truncate">'
          + esc(ft >= 0 ? pageLabel(ft) : short(rawPageText(st.flow.page), 30)) + '</span></span>' : '')
      + keys.map(function (k) {
          return '<span class="badge badge-primary badge-outline max-w-full" title="' + esc(tokLabel(pins[k])) + '"><span class="truncate">'
            + esc(pinLabel(mode, k)) + ': ' + esc(tokLabel(pins[k])) + '</span></span>';
        }).join('') + '</div>'
      + '<p class="text-sm"><strong>' + nf(view.length) + ' bezoeken</strong> van ' + nf(pn) + ' ' + personWord(pn)
      + (page ? ' bekeken deze pagina' + (keys.length ? ' langs dit pad' : '') : ' volgen dit pad') + '.</p>'
      + '<p class="text-xs text-base-content/60">' + (page
          ? 'De padverkenner, de paden, per pagina en de bezoekerslijst tonen enkel bezoeken met deze pagina. De kerncijfers en de trend gaan over het hele segment.'
          : 'Dit geldt voor de padverkenner, de paden, per pagina en de bezoekerslijst. De kerncijfers en de trend gaan over het hele segment.') + '</p>'
      + (page && keys.length ? '<button class="btn btn-ghost btn-xs" data-bh-action="unpin-all">spelden losmaken</button>' : '')
      + dominant(view).map(function (x) { return warnHtml(x, view.length); }).join('')
      + '</div>';
  }

  // ── Formulieren en popups: de trechter per formulier ───────────────────────
  // Uit kolom 14 (funnelVan in lib/behaviour.js): per bezoek en per formulier
  // geopend, gestart, een poging, verstuurd en de verste stap. Over het SEGMENT, niet
  // over het vastgezette pad: de vraag is hoe het formulier het doet. Wat uit klikken
  // GESCHAT is (van voor de popup zelf iets meldde), staat er altijd bij.
  function formLabel(key) {
    var fu = st.data.funnel || {};
    if (key === 'calendly') return 'Plan een gesprek (Calendly)';
    if ((fu.offerte || []).indexOf(key) >= 0 || key === 'offerte') return 'Offerte';
    var s = String(key || '').replace(/-/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function stapNaam(key, i) {
    var namen = ((st.data.funnel || {}).stapNamen || {})[key] || [];
    var n = namen[i];
    return n ? String(n).replace(/-/g, ' ') : null;
  }
  function funnelRow(label, n, total, sub, warn) {
    var p = total ? n / total * 100 : 0;
    return '<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-baseline">'
      + '<span class="text-sm truncate" title="' + esc(label) + '">' + esc(label) + (sub ? ' <span class="text-xs text-base-content/50">' + esc(sub) + '</span>' : '') + '</span>'
      + '<span class="text-sm tabular-nums"><strong>' + nf(n) + '</strong> <span class="text-xs text-base-content/50">' + pctTxt(total ? p : null) + '</span></span>'
      + '<div class="col-span-2 h-1.5 rounded-full om-spoor overflow-hidden mt-0.5 mb-1.5"><div class="h-full rounded-full" style="width:' + p.toFixed(1) + '%;background-color:' + (warn ? 'oklch(var(--er) / 0.7)' : ACCENT) + '"></div></div>'
      + '</div>';
  }
  function renderForms(cur) {
    var el = $('bhForms');
    if (!el) return;
    var fu = st.data.funnel, B = fu && fu.bits;
    if (!B || C.fun === undefined) { el.innerHTML = ''; return; }
    var per = {};
    cur.forEach(function (s) {
      (s[C.fun] || []).forEach(function (f) {
        var key = d('fm', f[0]), b = f[1];
        if (!key || !(b & (B.open | B.verstuurd))) return;
        var x = per[key] || (per[key] = { key: key, open: 0, start: 0, poging: 0, verstuurd: 0, geschat: 0, stappen: 0, reach: {}, stop: {}, pers: {} });
        x.open++;
        x.pers[personKey(s)] = 1;
        if (b & B.geschat) x.geschat++;
        if (b & (B.start | B.verstuurd)) x.start++;
        if (b & B.poging) x.poging++;
        if (f[3] > x.stappen) x.stappen = f[3];
        // Wie verstuurde, kwam per definitie door alle stappen.
        var mx = (b & B.verstuurd) ? 99 : f[2];
        for (var i = 1; i <= Math.min(mx, 20); i++) x.reach[i] = (x.reach[i] || 0) + 1;
        if (b & B.verstuurd) x.verstuurd++;
        else { var k = mx >= 0 ? mx : 0; x.stop[k] = (x.stop[k] || 0) + 1; }
      });
    });
    var lijst = Object.keys(per).map(function (k) { return per[k]; }).sort(function (a, b) { return b.open - a.open; });
    if (!lijst.length) {
      el.innerHTML = '<p class="text-sm text-base-content/60">Geen formulier geopend in dit segment.</p>';
      return;
    }
    var vanaf = fu.exactVanaf ? new Date(Date.parse(String(fu.exactVanaf).replace(' ', 'T') + 'Z')).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long' }) : null;
    el.innerHTML = '<div class="grid grid-cols-1 2xl:grid-cols-2 gap-4">' + lijst.map(function (x) {
      var namen = ((fu.stapNamen || {})[x.key] || []);
      var stappen = Math.max(x.stappen, namen.length);
      var pn = Object.keys(x.pers).length;
      var rows = funnelRow('Geopend', x.open, x.open, nf(pn) + ' ' + personWord(pn));
      if (x.key !== 'calendly') rows += funnelRow('Gestart', x.start, x.open, stappen > 1 ? 'naar stap 2, of iets ingevuld' : 'iets ingevuld');
      for (var i = 1; i < stappen; i++) {
        if (i === 1 && stappen > 1 && (x.reach[1] || 0) === x.start) continue;   // zelfde als Gestart
        var nm = stapNaam(x.key, i);
        rows += funnelRow('Stap ' + (i + 1) + (nm ? ': ' + nm : ''), x.reach[i] || 0, x.open);
      }
      rows += funnelRow(x.key === 'calendly' ? 'Afspraak geboekt' : 'Verstuurd', x.verstuurd, x.open);
      // Waar haken ze af? De verste stap van wie NIET verstuurde.
      var weg = x.open - x.verstuurd, uitleg = '';
      if (weg > 0 && stappen > 1) {
        var top = Object.keys(x.stop).map(Number).sort(function (a, b) { return x.stop[b] - x.stop[a]; })[0];
        var nmTop = stapNaam(x.key, top);
        uitleg = 'Van de ' + nf(weg) + ' die niet verstuurden, haakten de meesten af bij <strong>stap ' + (top + 1) + (nmTop ? ' (' + esc(nmTop) + ')' : '') + '</strong>: ' + nf(x.stop[top]) + '.';
      } else if (weg > 0 && x.key !== 'calendly') {
        uitleg = nf(x.start - x.verstuurd > 0 ? x.start - x.verstuurd : 0) + ' begonnen eraan zonder te versturen; ' + nf(x.open - x.start) + ' openden het enkel.';
      }
      if (x.poging > x.verstuurd) uitleg += (uitleg ? ' ' : '') + nf(x.poging - x.verstuurd) + ' keer op Versturen geklikt zonder dat er een inzending binnenkwam (een fout, of een geweigerde controle).';
      var geschat = x.geschat
        ? '<p class="text-xs text-base-content/80 bg-warning/15 rounded-lg px-2 py-1 mt-2">' + nf(x.geschat) + ' van de ' + nf(x.open) + ' bezoeken zijn GESCHAT uit klikken'
          + (vanaf ? ' (van voor ' + esc(vanaf) + ', toen de popup zelf nog niets meldde)' : ' (de popup meldt nog niets zelf: plugin 1.22 staat nog niet op de site)') + '.</p>' : '';
      return '<div class="rounded-xl border border-base-content/10 p-4">'
        + '<div class="flex items-baseline justify-between gap-2 mb-2"><h3 class="font-semibold text-sm">' + esc(formLabel(x.key)) + '</h3>'
        + '<span class="text-[11px] text-base-content/40 truncate" title="' + esc(x.key) + '">' + esc(x.key) + '</span></div>'
        + rows
        + (uitleg ? '<p class="text-xs text-base-content/70 mt-1">' + uitleg + '</p>' : '')
        + geschat + '</div>';
    }).join('') + '</div>';
  }

  // ── Bezoeken en personen in dit segment (doorklikken naar het traject) ─────
  //
  // Om snel de MENSEN achter de cijfers te vinden: wie het was (anoniem, gekend,
  // lead), wat die deed, of die aan een formulier begon en hoe ver die kwam. Per rij
  // staat enkel wat voor DAT bezoek iets zegt: wie geen popup opende, krijgt geen
  // regel "niet gestart", en wie niets deed krijgt de signalen die er wel zijn
  // (scroll, klikken) of "meteen weg". Twee weergaven op dezelfde bezoeken: per
  // bezoek, of per persoon (alle bezoeken van een persoon samen, zelfde personKey()
  // als de rest van dit tabblad). Alles komt uit kolommen die er al waren (vlaggen,
  // acties, de popup-trechter): geen extra vraag aan de server.

  // Hoe ver kwam een bezoek: het hoogste niveau van wat er gebeurde. Bepaalt het
  // streepje links en de sortering "Verst gekomen". Begonnen-niet-verstuurd staat
  // BOVEN een nieuwsbrief: het is een onafgemaakte aanvraag, en die zoek je hier.
  // Kleuren als inline stijl uit het thema: welke opacity-varianten het CDN-bestand
  // van daisyUI kent, is niet zeker, een CSS-variabele wel.
  var LVL = { weg: 0, gekeken: 1, geopend: 2, actie: 3, gestart: 4, aanvraag: 5 };
  var LVL_STYLE = [
    null, null,
    { color: 'oklch(var(--in) / 0.6)', bg: 'oklch(var(--in) / 0.14)', label: 'Popup of agenda geopend, niets ingevuld' },
    { color: 'oklch(var(--su) / 0.45)', bg: 'oklch(var(--su) / 0.1)', label: 'Andere actie (registratie, nieuwsbrief, event, telefoon of e-mail)' },
    { color: 'oklch(var(--wa))', bg: 'oklch(var(--wa) / 0.25)', label: 'Begonnen aan een formulier, niet verstuurd' },
    { color: GOOD, bg: 'oklch(var(--su) / 0.22)', label: 'Aanvraag' }
  ];
  var DEV_ICONS = { desktop: 'monitor', mobile: 'smartphone', tablet: 'tablet' };
  var SES_SORTS = {
    visits: [['recent', 'Recentst'], ['warm', 'Verst gekomen']],
    persons: [['recent', 'Recentst'], ['warm', 'Verst gekomen'], ['visits', 'Meeste bezoeken']]
  };
  var SES_STEP = 25;

  function whenTxt(unix) { return new Date(unix * 1000).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function dayShort(unix) { return new Date(unix * 1000).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short' }); }
  function pagesWord(n) { return n === 1 ? 'pagina' : 'pagina\'s'; }
  function isOfferte(key) {
    var fu = st.data.funnel || {};
    return key === 'offerte' || key === fu.offKey || (fu.offerte || []).indexOf(key) >= 0;
  }
  /** Tot waar een formulier kwam: max = de verste stap (0 = de eerste), stappen = het aantal (0 = onbekend). */
  function stapTxt(key, max, stappen) {
    if (!(max >= 1)) return stappen > 1 ? 'iets ingevuld op stap 1' : 'iets ingevuld';
    var nm = stapNaam(key, max);
    return 'tot stap ' + (max + 1) + (stappen > max ? ' van ' + stappen : '') + (nm ? ' (' + nm + ')' : '');
  }
  /** Het hoeveelste bezoek van deze BROWSER; s._vx = we zien zijn allereerste bezoek, dus het nummer klopt. */
  function visitNoTxt(s) {
    if (s[C.flags] & st.F.isNew) return 'eerste bezoek';
    if (s._vx && s._vn > 0) return (s._vn + 1) + 'e bezoek';
    return 'terugkerend';
  }

  /**
   * Wat er in een bezoek gebeurde: etiketten met hun niveau (LVL), het hoogste
   * niveau van het bezoek, en de losse signalen. Onthouden op de sessie.
   * Een actie die verstuurd werd, komt uit kolom 12; wat gestart of enkel geopend
   * werd uit de popup-trechter (kolom 14), want die weet ook tot welke stap.
   */
  function visitFacts(s) {
    if (s._fx) return s._fx;
    var fl = s[C.flags], F = st.F, facts = [], seen = {};
    var lvl = fl & F.engaged ? LVL.gekeken : LVL.weg;
    function add(f) {
      if (seen[f.key]) return;
      seen[f.key] = 1;
      f.i = facts.length;
      facts.push(f);
      if (f.lvl > lvl) lvl = f.lvl;
    }
    (s[C.acts] || []).forEach(function (a) {
      var k = a[1], def = ACT[k];
      if (!def || k >= 8) return;
      add({ key: 'a' + k, lvl: k === 1 || k === 2 || k === 7 ? LVL.aanvraag : LVL.actie, icon: def.icon, label: def.label,
        title: def.label + ', ' + durTxt(a[2]) + ' na het begin van het bezoek.' });
    });
    if (fl & F.contact) {
      add({ key: 'ct', lvl: LVL.actie, icon: 'phone', label: 'Klikte op telefoon of e-mail', title: 'Klikte op een telefoonnummer of e-mailadres op de site.' });
    }
    var fu = st.data.funnel, B = fu && fu.bits;
    (B ? s[C.fun] || [] : []).forEach(function (f) {
      var key = d('fm', f[0]), b = f[1];
      if (!key || (b & B.verstuurd)) return;   // verstuurd staat al bij de acties
      var naam = formLabel(key), off = isOfferte(key);
      var gesch = b & B.geschat ? ' Geschat uit de klikken: van voor de popup zelf iets meldde.' : '';
      var pre = b & B.geschat ? '≈ ' : '';
      if (key === 'calendly') {
        if ((b & B.open) && !(fl & F.calendly)) {
          add({ key: 'fo:calendly', form: key, lvl: LVL.geopend, icon: 'calendar', label: pre + 'Agenda geopend', sub: 'niet geboekt',
            title: 'Opende de agenda maar boekte in dit bezoek geen afspraak.' + gesch });
        }
        return;
      }
      if (b & (B.start | B.poging)) {
        var tot = stapTxt(key, f[2], f[3]), mislukt = (b & B.poging) ? ', versturen mislukt' : '';
        add({ key: 'fs:' + key, form: key, off: off, step: f[2], lvl: LVL.gestart, icon: 'pencil-line', label: pre + naam + ' gestart', sub: tot + mislukt,
          title: 'Begon aan ' + naam + ' en verstuurde het in dit bezoek niet: ' + tot + '.'
            + (mislukt ? ' Klikte op Versturen, maar er kwam geen inzending binnen (een fout, of een geweigerde controle).' : '') + gesch });
      } else if (b & B.open) {
        add({ key: 'fo:' + key, form: key, off: off, lvl: LVL.geopend, icon: 'mouse-pointer-click', label: pre + naam + ' geopend', sub: 'niets ingevuld',
          title: 'Opende ' + naam + ' maar vulde niets in.' + gesch });
      }
    });
    facts.sort(function (a, b) { return b.lvl - a.lvl || a.i - b.i; });
    var sig = [];
    if (fl & F.loginOnly) sig.push('enkel om in te loggen');
    if (fl & F.historic) sig.push('oude historiek: klikken en scroll niet bewaard');
    else {
      if (s[C.scroll] >= 25) sig.push('tot ' + nf(Math.min(100, s[C.scroll])) + '% gescrold');
      if (s[C.clicks] > 0) sig.push(nf(s[C.clicks]) + (s[C.clicks] === 1 ? ' klik' : ' klikken'));
    }
    if (lvl === LVL.weg) sig.unshift('meteen weg');
    s._fx = { lvl: lvl, facts: facts, sig: sig };
    return s._fx;
  }

  function factChip(f, n) {
    var sty = LVL_STYLE[f.lvl] || LVL_STYLE[LVL.geopend];
    return '<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs' + (f.lvl === LVL.aanvraag ? ' font-medium' : '') + '"'
      + ' style="background-color:' + sty.bg + '" title="' + esc(f.title) + '">'
      + '<i data-lucide="' + f.icon + '" class="w-3 h-3 shrink-0"></i>'
      + '<span>' + esc(f.label) + (f.sub ? ' <span class="font-normal text-base-content/60">' + esc(f.sub) + '</span>' : '')
      + (n > 1 ? ' <span class="font-normal text-base-content/60">×' + n + '</span>' : '') + '</span></span>';
  }

  /** Lead = de browser hangt aan een lead (visitor_links), gekend = er is een e-mailadres. */
  function whoBadges(lead, known, customer, hideAnon) {
    return (lead ? '<span class="badge badge-sm badge-info shrink-0" title="Deze bezoeker hangt aan een lead in Odoo">lead</span>'
      : known ? '<span class="badge badge-sm badge-outline shrink-0" title="Het e-mailadres is bekend, maar er hangt (nog) geen lead aan">gekend</span>'
      : hideAnon ? '' : '<span class="badge badge-sm badge-ghost text-base-content/50 shrink-0" title="Geen e-mailadres bekend">anoniem</span>')
      + (customer ? '<span class="badge badge-sm badge-ghost shrink-0" title="Bezoek van een klant: op of na de eerste keer inloggen">klant</span>' : '');
  }

  function kanaalHtml(s) {
    var ch = d('ch', s[C.ch]), det = d('det', s[C.det]);
    // Een heropende advertentielink is GEEN nieuwe klik (channelOf in web-visits.js):
    // de bezoeker opende dezelfde link opnieuw. Bij de oude historiek is dat niet na
    // te gaan, en dat staat er dan bij.
    if (s[C.reo]) {
      return dot(chColor(ch)) + '<span class="truncate" title="' + esc('Zelfde klik-id als de advertentieklik van ' + dayTxt(s[C.reo]) + '. Geen nieuwe klik: dezelfde link werd opnieuw geopend (bladwijzer, adresbalk, herstelde tab). Telt als Direct.') + '">'
        + 'Direct · heropende advertentielink, geklikt op ' + esc(dayTxt(s[C.reo])) + '</span>';
    }
    return dot(chColor(ch)) + '<span class="truncate">' + esc(ch) + (det ? ' · ' + esc(short(det, 30)) : '') + '</span>'
      + (s[C.flags] & st.F.klikOnbekend ? ' <span class="badge badge-xs badge-ghost shrink-0" title="Van vóór 29 september: of dit een nieuwe advertentieklik was of dezelfde link opnieuw geopend, is niet bewaard.">oude historiek</span>' : '');
  }

  /** Een stap van de route: een pagina als tekst, een actie als klein icoon (de uitleg staat in de etiketten eronder). */
  function routeTok(t) {
    if (t < 0) {
      var a = ACT[-t], started = -t >= 8;
      return '<span class="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0" style="background-color:'
        + (started ? LVL_STYLE[LVL.gestart].bg : LVL_STYLE[LVL.aanvraag].bg) + '" title="' + esc(tokName(t)) + '">'
        + '<i data-lucide="' + (a ? a.icon : 'check') + '" class="w-3 h-3"></i></span>';
    }
    return '<span class="truncate max-w-[16rem]" title="' + esc(pageName(t)) + '">' + esc(short(pageName(t), 34)) + '</span>';
  }
  /** De hele route met de acties erin; bij meer dan zes stappen de eerste twee en de laatste drie. */
  function routeHtml(s) {
    var p = steps(s), arrow = '<span class="text-base-content/30">→</span>';
    if (!p.length) return '<span class="text-base-content/40">geen pagina</span>';
    var idx = p.length <= 6 ? p.map(function (t, i) { return i; }) : [0, 1, -1, p.length - 3, p.length - 2, p.length - 1];
    return idx.map(function (i) {
      if (i >= 0) return routeTok(p[i]);
      var mid = p.slice(2, p.length - 3);
      return '<span class="text-xs text-base-content/40" title="' + esc(mid.map(tokName).join(' → ')) + '">… ' + mid.length + ' ' + stepWord(mid.length) + ' …</span>';
    }).join(arrow);
  }

  function visitRow(s) {
    var fx = visitFacts(s), fl = s[C.flags], F = st.F, sty = LVL_STYLE[fx.lvl];
    var email = personLabel(s), dev = d('dev', s[C.dev]), n = path(s).length;
    var detail = fx.facts.map(function (f) { return factChip(f); }).join('')
      + (fx.sig.length ? '<span class="text-xs text-base-content/50">' + esc(fx.sig.join(' · ')) + '</span>' : '');
    return '<button type="button" class="w-full text-left grid grid-cols-[6.5rem_minmax(0,1fr)] md:grid-cols-[6.5rem_minmax(0,1fr)_minmax(9rem,16rem)] gap-x-3 gap-y-1 items-start px-2 py-2.5 rounded-lg om-hover"'
      + ' data-bh-action="visitor" data-uuid="' + esc(d('v', s[C.v])) + '"' + (sty ? ' style="box-shadow:inset 3px 0 0 ' + sty.color + '"' : '') + '>'
      + '<span class="text-xs text-base-content/60 leading-snug">'
      +   '<span class="block">' + whenTxt(s[C.start]) + '</span>'
      +   '<span class="flex items-center gap-1 text-base-content/50" title="' + esc((DEV_LABELS[dev] || dev || 'Onbekend toestel') + '. Het nummer telt de bezoeken van deze browser in de geladen periode en die daarvoor.') + '">'
      +     (DEV_ICONS[dev] ? '<i data-lucide="' + DEV_ICONS[dev] + '" class="w-3 h-3 shrink-0"></i>' : '') + esc(visitNoTxt(s)) + '</span>'
      +   (st.data.dict.site.length > 1 && s[C.site] >= 0 ? '<span class="block truncate text-base-content/40">' + esc(siteName(s[C.site])) + '</span>' : '')
      + '</span>'
      + '<span class="min-w-0">'
      +   '<span class="flex items-center gap-1.5 text-xs text-base-content/70 min-w-0">' + kanaalHtml(s) + '</span>'
      +   '<span class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm mt-0.5">' + routeHtml(s) + '</span>'
      +   (detail ? '<span class="flex flex-wrap items-center gap-1 mt-1.5">' + detail + '</span>' : '')
      + '</span>'
      + '<span class="col-start-2 md:col-start-auto flex flex-col md:items-end gap-1 min-w-0">'
      +   '<span class="flex items-center md:justify-end gap-1 min-w-0 max-w-full">' + whoBadges(!!(fl & F.linked), !!((fl & F.known) || email), !!(fl & F.customer))
      +     (email ? '<span class="text-xs truncate min-w-0" title="' + esc(email) + '">' + esc(email) + '</span>' : '') + '</span>'
      +   '<span class="text-xs text-base-content/60 tabular-nums">' + durTxt(s[C.dur]) + ' · ' + nf(n) + ' ' + pagesWord(n) + '</span>'
      + '</span></button>';
  }

  /** Het eerste bezoek van elke persoon in ALLE geladen gegevens, ook buiten het segment: sinds wanneer we die zien. */
  var firstMemo = { data: null, map: null };
  function personFirst() {
    if (firstMemo.data !== st.data) {
      var m = {};
      st.data.sessions.forEach(function (s) {
        var k = personKey(s);
        if (!m[k] || s[C.start] < m[k][C.start]) m[k] = s;
      });
      firstMemo = { data: st.data, map: m };
    }
    return firstMemo.map;
  }
  function loadedFrom() { return Math.round(Date.parse(String(st.data.range.prevStart).replace(' ', 'T') + 'Z') / 1000); }

  /**
   * Alle bezoeken per persoon samen. Wat in een ANDER bezoek alsnog verstuurd werd,
   * telt niet meer als "gestart" of "geopend": dat was dan geen afhaken. Van een
   * formulier dat meermaals gestart werd, blijft de verste stap staan.
   */
  function personsOf(list) {
    var by = {}, out = [];
    list.forEach(function (s) {
      var k = personKey(s), p = by[k], fl = s[C.flags], F = st.F;
      if (!p) { p = by[k] = { key: k, list: [], last: -1, latest: null, lead: false, known: false, customer: false, dur: 0, pages: {}, browsers: {} }; out.push(p); }
      p.list.push(s);
      if (s[C.start] > p.last) { p.last = s[C.start]; p.latest = s; }
      if (fl & F.linked) p.lead = true;
      if ((fl & F.known) || personLabel(s)) p.known = true;
      if (fl & F.customer) p.customer = true;
      p.dur += s[C.dur] || 0;
      p.browsers[s[C.v]] = 1;
      var seen = {};
      path(s).forEach(function (t) { if (!seen[t]) { seen[t] = 1; p.pages[t] = (p.pages[t] || 0) + 1; } });
    });
    out.forEach(function (p) {
      p.list.sort(function (a, b) { return a[C.start] - b[C.start]; });
      var facts = {}, order = [];
      p.lvl = 0;
      p.list.forEach(function (s) {
        var fx = visitFacts(s);
        if (fx.lvl > p.lvl) p.lvl = fx.lvl;
        fx.facts.forEach(function (f) {
          var e = facts[f.key];
          if (!e) { facts[f.key] = { f: f, n: 1 }; order.push(f.key); }
          else { e.n++; if ((f.step || 0) > (e.f.step || 0)) e.f = f; }
        });
      });
      var achterhaald = function (f) {
        if (!f.form) return false;
        if (f.form === 'calendly') return !!facts.a2;
        if (f.key.indexOf('fo:') === 0 && facts['fs:' + f.form]) return true;
        return !!(f.off ? facts.a7 : facts.a1);
      };
      p.facts = order.map(function (k) { return facts[k]; }).filter(function (e) { return !achterhaald(e.f); })
        .sort(function (a, b) { return b.f.lvl - a.f.lvl || a.f.i - b.f.i; });
    });
    return out;
  }

  function personRow(p) {
    var s = p.latest, F = st.F, sty = LVL_STYLE[p.lvl], email = personLabel(s), n = p.list.length;
    var nb = Object.keys(p.browsers).length, first = personFirst()[p.key], sinds = '';
    if (first && !(first[C.flags] & F.isNew)) sinds = 'al bezoeker vóór ' + dayShort(loadedFrom());
    else if (first && (n > 1 || first[C.start] < p.list[0][C.start])) sinds = 'eerste bezoek ' + dayShort(first[C.start]);
    var ident = email
      ? '<span class="text-sm font-medium truncate min-w-0" title="' + esc(email) + '">' + esc(email) + '</span>'
      : '<span class="text-sm text-base-content/60 shrink-0">' + (p.known ? 'Gekende bezoeker' : 'Anonieme bezoeker') + '</span><span class="text-xs text-base-content/40 truncate">' + esc(String(d('v', s[C.v]) || '').slice(0, 8)) + '</span>';
    // Elk bezoek een bolletje in de kleur van zijn kanaal, oudste eerst; een ring = er begon of gebeurde iets.
    var dots = p.list.slice(-10).map(function (x) {
      var fx = visitFacts(x), ch = d('ch', x[C.ch]), ring = fx.lvl >= LVL.actie ? ';box-shadow:0 0 0 2px oklch(var(--b1)),0 0 0 3.5px ' + LVL_STYLE[fx.lvl].color : '';
      return '<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background-color:' + chColor(ch) + ring + '"'
        + ' title="' + esc(whenTxt(x[C.start]) + ' · ' + ch + ' · ' + durTxt(x[C.dur]) + (fx.facts.length ? ' · ' + fx.facts.map(function (f) { return f.label; }).join(', ') : '')) + '"></span>';
    }).join('');
    var start = p.list[0], via = d('ch', start[C.ch]), det = d('det', start[C.det]);
    var top = Object.keys(p.pages).map(Number).sort(function (a, b) { return p.pages[b] - p.pages[a]; });
    var bekeek = top.slice(0, 3).map(function (t) {
      return '<span class="truncate max-w-[14rem]" title="' + esc(pageName(t) + ' (in ' + p.pages[t] + ' ' + (p.pages[t] === 1 ? 'bezoek' : 'bezoeken') + ')') + '">' + esc(short(pageName(t), 30)) + '</span>';
    }).join('<span class="text-base-content/30">·</span>') + (top.length > 3 ? '<span class="text-base-content/40">+' + (top.length - 3) + '</span>' : '');
    var facts = p.facts.map(function (e) { return factChip(e.f, e.n); }).join('')
      || '<span class="text-xs text-base-content/50">' + (p.lvl === LVL.weg ? (n > 1 ? 'telkens meteen weg' : 'meteen weg') : 'enkel rondgekeken') + '</span>';
    return '<button type="button" class="w-full text-left grid grid-cols-[6.5rem_minmax(0,1fr)] md:grid-cols-[6.5rem_minmax(0,1fr)_minmax(8rem,12rem)] gap-x-3 gap-y-1 items-start px-2 py-2.5 rounded-lg om-hover"'
      + ' data-bh-action="visitor" data-uuid="' + esc(d('v', s[C.v])) + '"'
      + ' title="' + esc(nb > 1 ? 'Opent het traject van de laatst gebruikte browser; deze persoon gebruikte er ' + nb + '.' : 'Opent het volledige traject van deze bezoeker.') + '"'
      + (sty ? ' style="box-shadow:inset 3px 0 0 ' + sty.color + '"' : '') + '>'
      + '<span class="text-xs text-base-content/60 leading-snug">'
      +   '<span class="block" title="Laatste bezoek">' + whenTxt(p.last) + '</span>'
      +   '<span class="block text-base-content/50">' + nf(n) + ' ' + (n === 1 ? 'bezoek' : 'bezoeken') + '</span>'
      +   (nb > 1 ? '<span class="block text-base-content/40">' + nb + ' browsers</span>' : '')
      + '</span>'
      + '<span class="min-w-0">'
      +   '<span class="flex items-center gap-1.5 min-w-0">' + ident + whoBadges(p.lead, p.known, p.customer, true) + '</span>'
      +   '<span class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-base-content/60 mt-1">'
      +     (n > 10 ? '<span class="text-base-content/40">+' + (n - 10) + '</span>' : '') + dots
      +     '<span class="ml-1 min-w-0 truncate">kwam binnen via ' + esc(via || 'een onbekend kanaal') + (det ? ' · ' + esc(short(det, 30)) : '') + (sinds ? ' · ' + esc(sinds) : '') + '</span></span>'
      +   '<span class="flex flex-wrap items-center gap-1 mt-1.5">' + facts + '</span>'
      +   (bekeek ? '<span class="flex flex-wrap items-center gap-x-1 text-xs text-base-content/60 mt-1"><span class="text-base-content/40">Bekeek</span>' + bekeek + '</span>' : '')
      + '</span>'
      + '<span class="col-start-2 md:col-start-auto flex md:flex-col md:items-end gap-x-2 gap-y-1 text-xs text-base-content/60 tabular-nums">'
      +   '<span>' + durTxt(p.dur) + ' in totaal</span>'
      +   '<span>' + nf(top.length) + ' ' + pagesWord(top.length) + '</span>'
      + '</span></button>';
  }

  /** Zoeken in de lijst: e-mailadres, een pagina uit de route, het kanaal of de bron/campagne. */
  function sesMatch(s, q) {
    var hay = [personLabel(s) || '', d('ch', s[C.ch]) || '', d('det', s[C.det]) || ''];
    path(s).forEach(function (t) { hay.push(d('p', t) || ''); });
    for (var i = 0; i < hay.length; i++) if (String(hay[i]).toLowerCase().indexOf(q) >= 0) return true;
    return false;
  }
  function setHtml(id, html) { var el = $(id); if (el) el.innerHTML = html; }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }

  function renderSessions(cur) {
    if (!$('bhSessions')) return;
    var all = cur.filter(pinned), raw = String(st.ses.q || '').trim(), q = raw.toLowerCase();
    var persons = st.ses.view === 'persons', sort = st.ses.sort, total, shown, rows, visits;
    var hit = q ? all.filter(function (s) { return sesMatch(s, q); }) : all;
    if (persons) {
      // Wie past bij de zoekopdracht, komt erin met AL zijn bezoeken: ook die waarin hij die pagina niet bekeek.
      var keys = {};
      hit.forEach(function (s) { keys[personKey(s)] = 1; });
      var list = personsOf(q ? all.filter(function (s) { return keys[personKey(s)]; }) : all);
      list.sort(function (a, b) {
        if (sort === 'warm' && b.lvl !== a.lvl) return b.lvl - a.lvl;
        if (sort === 'visits' && b.list.length !== a.list.length) return b.list.length - a.list.length;
        return b.last - a.last;
      });
      total = list.length;
      visits = list.reduce(function (sum, p) { return sum + p.list.length; }, 0);
      rows = list.slice(0, st.ses.limit).map(personRow);
    } else {
      var vis = hit.slice().sort(function (a, b) {
        if (sort === 'warm') { var dl = visitFacts(b).lvl - visitFacts(a).lvl; if (dl) return dl; }
        return b[C.start] - a[C.start];
      });
      total = vis.length;
      rows = vis.slice(0, st.ses.limit).map(visitRow);
    }
    shown = rows.length;
    setText('bhSessionsTitle', persons ? 'Personen in dit segment' : 'Bezoeken in dit segment');
    setText('bhSessionsSub', persons
      ? 'Alle bezoeken van een persoon samen: wie het is, hoe die binnenkwam en wat die in totaal deed. Klik voor het traject.'
      : 'Wie het was, wat die deed en hoe ver die in een formulier kwam. Klik een bezoek voor het volledige traject.');
    var txt = '';
    if (all.length) {
      var pn = personCount(hit);
      txt = persons ? nf(total) + ' ' + personWord(total) + ' · ' + nf(visits) + ' bezoeken'
        : nf(hit.length) + ' bezoeken van ' + nf(pn) + ' ' + personWord(pn);
      if (q) txt += ' met "' + raw + '"';
      if (total > shown) txt += ' · ' + nf(shown) + ' getoond';
    }
    setText('bhSessionsCount', txt);
    setHtml('bhSessionsTools', pills('ses-view', null, [['visits', 'Per bezoek'], ['persons', 'Per persoon']], st.ses.view)
      + pills('ses-sort', null, SES_SORTS[st.ses.view], sort));
    setHtml('bhSessionsLegend', [LVL.aanvraag, LVL.gestart, LVL.actie, LVL.geopend].map(function (l) {
      return '<span class="inline-flex items-center gap-1.5"><span class="inline-block w-1 h-3.5 rounded-full" style="background-color:' + LVL_STYLE[l].color + '"></span>' + esc(LVL_STYLE[l].label) + '</span>';
    }).join(''));
    $('bhSessions').innerHTML = shown ? rows.join('')
      : '<p class="text-sm text-base-content/60 py-2">' + (q && all.length ? 'Geen bezoeken met "' + esc(raw) + '".' : 'Geen bezoeken.') + '</p>';
    setHtml('bhSessionsMore', total > shown
      ? '<button type="button" class="btn btn-ghost btn-sm w-full mt-1" data-bh-action="ses-more">Toon meer (' + nf(total - shown) + ')</button>' : '');
  }
  /** Enkel de lijst opnieuw (weergave, sortering, zoeken, meer): de rest van het tabblad verandert daar niet door. */
  function renderSessionsOnly() {
    if (!st.data) return;
    renderSessions(split().cur);
    icons();
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  function options(key) {
    var m = {};
    st.data.sessions.forEach(function (s) {
      if (s[C.flags] & st.F.previous) return;
      var v = key === 'land' ? path(s)[0] : s[C[key] !== undefined ? C[key] : C.det];
      if (key === 'det' && st.f.ch !== null && s[C.ch] !== st.f.ch) return;
      if (v === undefined || v < 0) return;
      m[v] = (m[v] || 0) + 1;
    });
    return Object.keys(m).map(Number).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 60).map(function (v) { return [v, m[v]]; });
  }

  // De filterkaart. Drie regels, elk met een duidelijke rol:
  //   1. WANNEER en WAAR (periode, website)
  //   2. WIE bekijk je (vier gelabelde keuzes -- de gekozen optie in de primaire kleur)
  //   3. VERFIJN (vier keuzelijsten, elk met een eigen titel)
  // en daaronder de actieve filters als chips die je met een kruisje weghaalt.
  // Er staat nooit twee keer hetzelfde woord zonder label erboven: dat was het
  // probleem van de eerste versie ("Iedereen" stond er twee keer, in twee groepen).

  var DEFAULTS = { site: null, ch: null, det: null, land: null, visited: null, dev: null, who: 'all', conv: 'all', visit: 'all', purpose: 'prospect' };

  function groupLabel(text, help) {
    return '<div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 mb-1 flex items-center gap-1">' + esc(text)
      // Een gewone title, geen daisyUI-tooltip: de filters staan in een zijkolom met
      // overflow-y:auto, en die snijdt een tooltip aan de rand af.
      + (help ? ' <span class="cursor-help normal-case font-normal tracking-normal" title="' + esc(help) + '" aria-label="' + esc(help) + '"><i data-lucide="info" class="w-3 h-3"></i></span>' : '')
      + '</div>';
  }

  /** Segmentknop: de gekozen optie is gevuld in de primaire kleur, de rest neutraal. */
  /** side = in de zijkolom met de filters: vanaf lg compact en over de volle breedte. */
  function pills(action, key, choices, current, side) {
    return '<div class="inline-flex flex-wrap rounded-lg bg-base-200 p-0.5 gap-0.5' + (side ? ' lg:flex lg:w-full' : '') + '" role="group">' + choices.map(function (c) {
      var on = current === c[0];
      return '<button type="button" aria-pressed="' + on + '" class="px-3 py-1 text-sm rounded-md transition-colors '
        + (side ? 'lg:flex-1 lg:px-2 lg:py-0.5 lg:text-xs lg:whitespace-nowrap ' : '')
        + (on ? 'bg-primary text-primary-content font-medium shadow-sm' : 'text-base-content/70 hover:bg-base-300/70 hover:text-base-content')
        + '" data-bh-action="' + action + '"' + (key ? ' data-key="' + key + '"' : '') + ' data-value="' + c[0] + '">' + esc(c[1]) + '</button>';
    }).join('') + '</div>';
  }

  function seg(key, label, choices, help) {
    return '<div>' + groupLabel(label, help) + pills('seg', key, choices, st.f[key], true) + '</div>';
  }

  function select(key, label, kind) {
    var cur = st.f[key];
    var opts = options(key).map(function (o) {
      var name = kind === 'dev' ? (DEV_LABELS[d('dev', o[0])] || d('dev', o[0])) : kind === 'p' ? short(pageName(o[0]), 50) : d(kind, o[0]);
      return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(name) + ' (' + nf(o[1]) + ')</option>';
    }).join('');
    return '<label class="block min-w-0">' + groupLabel(label)
      + '<select class="select select-bordered select-sm w-full lg:text-xs ' + (cur !== null ? 'border-primary bg-primary/5 font-medium' : '') + '" data-bh-select="' + key + '">'
      + '<option value="">Alle</option>' + opts + '</select></label>';
  }

  function chipLabel(key) {
    var f = st.f;
    switch (key) {
      case 'site': return 'Website: ' + d('site', f.site);
      case 'ch': return 'Kanaal: ' + d('ch', f.ch);
      case 'det': return 'Bron: ' + short(d('det', f.det) || '', 36);
      case 'land': return 'Instap: ' + short(pageName(f.land), 36);
      case 'visited': return 'Bekeken: ' + short(pageName(f.visited), 36);
      case 'dev': return 'Toestel: ' + (DEV_LABELS[d('dev', f.dev)] || d('dev', f.dev));
      case 'purpose': return f.purpose === 'customer' ? 'Enkel klanten' : 'Prospecten + klanten';
      case 'who': return { anon: 'Anoniem', known: 'Met e-mailadres', lead: 'Gekoppeld aan een lead' }[f.who];
      case 'conv': return { yes: 'Met aanvraag', of: 'Met offerteaanvraag', reg: 'Registratie gestart', nb: 'Nieuwsbrief', ev: 'Event', ac: 'Academy', no: 'Zonder actie' }[f.conv];
      case 'visit': return f.visit === 'new' ? 'Nieuwe bezoekers' : 'Terugkerende bezoekers';
    }
    return key;
  }

  function activeKeys() {
    return Object.keys(DEFAULTS).filter(function (k) { return st.f[k] !== DEFAULTS[k]; });
  }

  function renderFilters() {
    var sites = st.data.dict.site;
    var siteControl = sites.length <= 3
      ? pills('site', null, [['', 'Beide']].concat(sites.map(function (s, i) { return [String(i), s]; })), st.f.site === null ? '' : String(st.f.site), true)
      : '<select class="select select-bordered select-sm" data-bh-select="site"><option value="">Alle websites</option>'
        + sites.map(function (s, i) { return '<option value="' + i + '"' + (st.f.site === i ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>';
    var keys = activeKeys();

    $('bhFilters').innerHTML =
      '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-4 space-y-4 lg:p-3 lg:space-y-3">'
      // 1. wanneer en waar
      + '<div class="flex flex-wrap items-end gap-x-8 gap-y-3 lg:flex-col lg:items-stretch lg:gap-y-2.5">'
      // "1 jaar" en niet "12 maanden": in de zijkolom past die vierde knop anders niet op de regel.
      +   '<div>' + groupLabel('Periode') + pills('period', null, [['7d', '7 dagen'], ['30d', '30 dagen'], ['90d', '90 dagen'], ['12m', '1 jaar']], st.period, true) + '</div>'
      +   '<div>' + groupLabel('Website') + siteControl + '</div>'
      + '</div>'
      // 2. wie
      + '<div class="flex flex-wrap items-end gap-x-8 gap-y-3 pt-4 border-t border-base-content/10 lg:flex-col lg:items-stretch lg:gap-y-2.5 lg:pt-3">'
      +   seg('purpose', 'Wie', [['prospect', 'Prospecten'], ['customer', 'Klanten'], ['all', 'Allebei']],
            'Klant = wie inlogt op het platform, vanaf de eerste keer dat hij inlogt. Zijn bezoeken daarvoor tellen als prospect.')
      +   seg('who', 'Herkend', [['all', 'Alle'], ['anon', 'Anoniem'], ['known', 'Met e-mail'], ['lead', 'Met lead']],
            'Met e-mail = de bezoeker liet ooit een adres achter. Met lead = hij hangt aan een lead in Odoo.')
      +   seg('conv', 'Actie', [['all', 'Alle'], ['yes', 'Aanvraag'], ['of', 'Offerte'], ['reg', 'Registratie'], ['nb', 'Nieuwsbrief'], ['ev', 'Event'], ['ac', 'Academy'], ['no', 'Geen actie']],
            'Een formulier, een afspraak of een inschrijving in dat bezoek.')
      +   seg('visit', 'Bezoek', [['all', 'Alle'], ['new', 'Eerste bezoek'], ['return', 'Terugkerend']])
      + '</div>'
      // 3. verfijn
      + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-base-content/10 lg:gap-2 lg:pt-3">'
      +   select('ch', 'Kanaal', 'ch') + select('det', 'Bron of campagne', 'det') + select('land', 'Instappagina', 'p') + select('dev', 'Toestel', 'dev')
      + '</div>'
      // 4. wat staat er aan
      + (keys.length
        ? '<div class="flex flex-wrap items-center gap-2 pt-3 border-t border-base-content/10">'
          + '<span class="text-xs text-base-content/60">Actief:</span>'
          + keys.map(function (k) {
              return '<span class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-sm pl-3 pr-1 py-0.5">' + esc(chipLabel(k))
                + '<button type="button" class="rounded-full w-5 h-5 inline-flex items-center justify-center hover:bg-primary/20" data-bh-action="clear" data-key="' + k + '" aria-label="Filter weghalen">✕</button></span>';
            }).join('')
          + '<button type="button" class="btn btn-ghost btn-xs ml-1" data-bh-action="reset">Alles wissen</button>'
          + '</div>'
        : '')
      + '</div>';
  }

  function active() { return activeKeys().length > 0; }

  /** Het segment in één zin, zodat je altijd weet waar je naar kijkt. */
  function sentence(n, p) {
    var f = st.f, bits = [];
    if (f.who === 'anon') bits.push('anonieme'); else if (f.who === 'known') bits.push('gekende'); else if (f.who === 'lead') bits.push('aan een lead gekoppelde');
    if (f.visit === 'new') bits.push('nieuwe'); else if (f.visit === 'return') bits.push('terugkerende');
    var wie = f.purpose === 'prospect' ? (p === 1 ? 'prospect' : 'prospecten')
      : f.purpose === 'customer' ? (p === 1 ? 'klant' : 'klanten') : personWord(p);
    var s = nf(n) + ' ' + bits.join(', ') + (bits.length ? ' ' : '') + 'bezoeken door ' + nf(p) + ' ' + wie
      + ' in de ' + PERIODS[st.period];
    var w = [];
    if (f.site !== null) w.push('op ' + d('site', f.site));
    else if (st.data.dict.site.length > 1) w.push(st.data.dict.site.length === 2 ? 'op beide websites' : 'op alle ' + st.data.dict.site.length + ' websites');
    if (f.ch !== null) w.push('via ' + d('ch', f.ch));
    if (f.det !== null) w.push('(' + d('det', f.det) + ')');
    if (f.land !== null) w.push('die begonnen op ' + short(pageName(f.land), 40));
    if (f.visited !== null) w.push('die ' + short(pageName(f.visited), 40) + ' bekeken');
    if (f.dev !== null) w.push('op ' + (DEV_LABELS[d('dev', f.dev)] || d('dev', f.dev)).toLowerCase());
    var actieZin = { yes: 'met een aanvraag', of: 'met een offerteaanvraag', reg: 'waarin een registratie gestart werd', nb: 'met een inschrijving op de nieuwsbrief',
      ev: 'met een inschrijving voor een event', ac: 'met een inschrijving in de academy', no: 'zonder enige actie' };
    if (actieZin[f.conv]) w.push(actieZin[f.conv]);
    return s + (w.length ? ' ' + w.join(' ') : '') + '.';
  }

  // ── Alles tekenen ──────────────────────────────────────────────────────────

  function render() {
    if (!st.data) return;
    var p = split();
    renderFilters();
    $('bhSentence').textContent = sentence(p.cur.length, personCount(p.cur));
    $('bhVisited').innerHTML = '';
    renderSummary(p.cur, p.prev);
    renderTrend(p.cur, p.prev);
    renderFlow(p.cur);
    renderPaths(p.cur);
    renderPages(p.cur);
    renderSessions(p.cur);
    renderForms(p.cur);
    renderScope(p.cur);
    var notes = [];
    if (st.f.purpose === 'prospect') {
      var klant = 0, login = 0;
      st.data.sessions.forEach(function (s) {
        if ((s[C.flags] & st.F.previous) || !(s[C.flags] & st.F.customer) || !matches(s, true)) return;
        klant++;
        if (s[C.flags] & st.F.loginOnly) login++;
      });
      if (klant) notes.push(nf(klant) + ' bezoeken van klanten tellen hier niet mee, waarvan ' + nf(login) + ' enkel om in te loggen. Kies "Klanten" of "Iedereen" om ze te zien.');
    }
    if (st.data.sessions.some(function (s) { return s[C.flags] & st.F.historic; })) {
      notes.push('Bezoeken van vóór 29 september 2026 komen uit de oude historiek: daar is de bron vaak niet bewaard ("Direct / onbekend") en ontbreken klikken.');
    }
    var excluded = st.f.purpose === 'prospect' && notes.length && notes[0].indexOf('klanten') >= 0 ? notes.shift() : '';
    // Wie op de lijst Uitgesloten staat (lib/exclusions.js), haalt de server eruit.
    // Zeggen hoeveel, nooit stil: anders lijkt het segment gewoon kleiner.
    var uit = st.data.excluded, uitTxt = '';
    if (uit && uit.sessions) {
      uitTxt = esc(nf(uit.sessions) + ' bezoeken van ' + nf(uit.persons) + ' uitgesloten ' + personWord(uit.persons) + ' tellen in deze periode niet mee.')
        + ' <a class="link" data-story-tab="excluded">Bekijk de lijst</a>';
    } else if (uit && uit.error) {
      uitTxt = esc('De lijst met uitgesloten personen kon niet gelezen worden: iedereen telt mee.');
    }
    $('bhExcluded').innerHTML = [excluded ? esc(excluded) : '', uitTxt].filter(Boolean).join('<br>');
    $('bhNote').innerHTML = notes.map(esc).join('<br>');
    icons();
    scheduleRibbons();
    saveState();
  }

  async function load() {
    if (st.loading) return;
    st.loading = true;
    // Wat er nu gekozen is, op NAAM -- de volgnummers van de nieuwe periode zijn anders.
    var names = st.data ? namesOf() : pendingNames;
    // De analyse en de kerncijfers staan in twee kolommen: allebei vervagen.
    var body = [$('bhBody'), $('bhKpiCol')].filter(Boolean);
    body.forEach(function (el) { el.style.opacity = st.data ? '0.5' : '1'; });   // vorige weergave houden, geen flits
    if (!st.data) $('bhStatus').innerHTML = '<span class="loading loading-spinner loading-sm"></span> Bezoeken laden…';
    try {
      var res = await fetch('/webgedrag/api/behaviour?period=' + st.period, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var j = await res.json();
      if (!j.success) throw new Error(j.error || 'Fout');
      if (!j.data.available) throw new Error(j.data.reason || 'Geen gegevens');
      st.data = j.data;
      st.F = j.data.flags;
      // Filters terugzetten op naam; wat in deze periode niet bestaat, valt weg.
      applyNames(names);
      pendingNames = null;
      clearPins();
      numberVisits(st.data);
      $('bhStatus').innerHTML = '';
      render();
    } catch (e) {
      $('bhStatus').innerHTML = '<div class="alert alert-error text-sm">Kon de bezoeken niet laden: ' + esc(e.message) + '</div>';
    }
    body.forEach(function (el) { el.style.opacity = '1'; });
    st.loading = false;
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-bh-action]');
    if (!el) return;
    var a = el.dataset.bhAction, v = el.dataset.value;
    if (a === 'period') { st.period = v; load(); return; }
    if (a === 'kpi-chart') { openKpi(el.dataset.metric, 'periode'); return; }
    if (a === 'kpi-range') { openKpi(kpi.metric, v); return; }
    if (a === 'kpi-metric') { openKpi(v); return; }
    if (a === 'kpi-table') { kpi.table = !kpi.table; openKpi(kpi.metric); return; }
    if (a === 'focus-scroll') {
      // Een oordeel bovenaan "Waar het stokt", of de pagina in het midden: naar de uitleg.
      if (el.dataset.step !== undefined) { st.focusV = Number(el.dataset.step); render(); }
      scrollToEl('bhFocusCard');
      return;
    }
    if (a === 'focus-page') {
      // Het RUWE pad bewaren ("/" en niet "Homepage"): zo zoekt focusPage() het terug.
      st.flow.mode = 'page'; st.flow.page = d('p', Number(el.dataset.page)); clearPins();
      render(); scrollToEl('bhFlowCard');
      return;
    }
    // De lijst onderaan: enkel die lijst opnieuw, de rest van het tabblad verandert niet.
    if (a === 'ses-view' || a === 'ses-sort' || a === 'ses-more') {
      if (a === 'ses-view') {
        st.ses.view = v === 'persons' ? 'persons' : 'visits';
        if (!SES_SORTS[st.ses.view].some(function (c) { return c[0] === st.ses.sort; })) st.ses.sort = 'recent';
      }
      if (a === 'ses-sort' && SES_SORTS[st.ses.view].some(function (c) { return c[0] === v; })) st.ses.sort = v;
      st.ses.limit = a === 'ses-more' ? st.ses.limit + SES_STEP : SES_STEP;
      renderSessionsOnly();
      if (a !== 'ses-more') saveState();
      return;
    }
    // Vastzetten gebeurt altijd met het samengesmolten token (mergeTok): een kaart
    // "Formulier" telt ook wie enkel begon, en een pad uit de lijst kan -8 bevatten.
    if (a === 'seg') { st.f[el.dataset.key] = v; }
    else if (a === 'filter') { var k = el.dataset.key, n = Number(v); st.f[k] = st.f[k] === n ? null : n; }
    else if (a === 'reset') { st.f = Object.assign({}, DEFAULTS); clearPins(); }
    else if (a === 'clear') { st.f[el.dataset.key] = DEFAULTS[el.dataset.key]; if (el.dataset.key === 'ch') st.f.det = null; }
    else if (a === 'site') { st.f.site = v === '' ? null : Number(v); }
    else if (a === 'pin') {
      // Wat je net vastzette, komt onder de loep; losmaken geeft de diepste speld terug.
      var s = el.dataset.step, pg = mergeTok(Number(el.dataset.page));
      if (st.pins[s] === pg) { delete st.pins[s]; if (st.focusV === Number(s)) st.focusV = null; }
      else { st.pins[s] = pg; st.focusV = Number(s); }
    }
    else if (a === 'pin-path') { st.pins = {}; st.focusV = null; el.dataset.path.split(',').forEach(function (x, i) { st.pins[i] = mergeTok(Number(x)); }); }
    else if (a === 'unpin') { delete st.pins[el.dataset.step]; if (st.focusV === Number(el.dataset.step)) st.focusV = null; }
    else if (a === 'unpin-all') { clearPins(); }
    else if (a === 'bpin') { var dd = el.dataset.dist, tk = mergeTok(Number(el.dataset.page)); if (st.bpins[dd] === tk) delete st.bpins[dd]; else st.bpins[dd] = tk; }
    else if (a === 'bpin-path') { st.bpins = {}; var bp = el.dataset.path.split(','); bp.forEach(function (x, i) { st.bpins[bp.length - 1 - i] = mergeTok(Number(x)); }); }
    else if (a === 'bunpin') { delete st.bpins[el.dataset.dist]; }
    else if (a === 'ppin') { var pd = el.dataset.dist, pt = mergeTok(Number(el.dataset.page)); if (st.ppins[pd] === pt) delete st.ppins[pd]; else st.ppins[pd] = pt; }
    else if (a === 'ppin-path') {
      st.ppins = {};
      var pp = el.dataset.path.split(','), an = Number(el.dataset.anchor);
      pp.forEach(function (x, i) { var dist = an - i; if (dist !== 0) st.ppins[dist] = mergeTok(Number(x)); });
      // Zonder "…" begon het bezoek op de eerste stap van die weg: dat hoort erbij, als die kolom te zien is.
      if (el.dataset.cut !== '1' && an + 1 <= st.flow.pb) st.ppins[an + 1] = ENTRY;
    }
    else if (a === 'punpin') { delete st.ppins[el.dataset.dist]; }
    else if (a === 'flow-mode') { if (st.flow.mode !== v) { if (v === 'page') adoptFocus(); st.flow.mode = v; clearPins(); } }
    else if (a === 'flow-steps') { setSteps(st.flow.n + Number(v)); }
    else if (a === 'flow-side') { setSide(el.dataset.side, st.flow[el.dataset.side] + Number(v)); }
    else if (a === 'metric') { st.metric = v; }
    else if (a === 'trend-table') { st.showTable = !st.showTable; }
    else if (a === 'sort') { var key = el.dataset.key; st.sort = { key: key, dir: st.sort.key === key ? -st.sort.dir : (key === 'name' ? 1 : -1) }; }
    else if (a === 'more-pages') { st.pageLimit += 30; }
    else if (a === 'visitor') { if (window.WebGedrag) window.WebGedrag.open('visitor', el.dataset.uuid); return; }
    else if (a === 'exclude') {
      if (window.WebGedrag && window.WebGedrag.exclude) {
        window.WebGedrag.exclude({ uuid: el.dataset.uuid, norms: el.dataset.norm ? [el.dataset.norm] : [],
          label: el.dataset.norm || ('browser ' + String(el.dataset.uuid).slice(0, 8)) });
      }
      return;
    }
    else return;
    render();
  });

  function clearPins() { st.pins = {}; st.bpins = {}; st.ppins = {}; st.focusV = null; }
  function scrollToEl(id) { var x = $(id); if (x && x.scrollIntoView) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /** Naar "rond een pagina": een vastgezette pagina komt in het midden; anders blijft de vorige keuze staan. */
  function adoptFocus() {
    var back = st.flow.mode === 'back', pins = back ? st.bpins : st.pins, best = null;
    Object.keys(pins).forEach(function (k) {
      var t = pins[k], kv = Number(k);
      if (t < 0) return;
      var rank = back ? (kv > 0 ? kv : 99) : (st.focusV === kv ? -1000 : -kv);
      if (!best || rank < best.rank) best = { rank: rank, t: t };
    });
    if (best) st.flow.page = d('p', best.t);
  }

  /** Een speld op een stap die niet meer getoond wordt, zou onzichtbaar blijven filteren: weg ermee. */
  function setSteps(n) {
    n = Math.max(MIN_STEPS, Math.min(MAX_STEPS, n));
    st.flow.n = n;
    Object.keys(st.pins).forEach(function (k) { if (Number(k) >= n) delete st.pins[k]; });
    Object.keys(st.bpins).forEach(function (k) { if (Number(k) > n) delete st.bpins[k]; });
  }
  /** Rond een pagina: stappen ervoor (pb) of erna (pa). Zelfde regel voor spelden buiten beeld. */
  function setSide(side, n) {
    if (side !== 'pb' && side !== 'pa') return;
    st.flow[side] = Math.max(MIN_SIDE, Math.min(MAX_SIDE, n));
    Object.keys(st.ppins).forEach(function (k) { var dist = Number(k); if (dist > st.flow.pb || -dist > st.flow.pa) delete st.ppins[k]; });
  }

  document.addEventListener('change', function (e) {
    var goalSel = e.target.closest('[data-bh-flow-goal]');
    if (goalSel) {
      // Een ander doel = een andere uitlijning: de spelden van "naar het doel toe" kloppen niet meer.
      if (GOALS[goalSel.value]) { st.flow.goal = goalSel.value; st.bpins = {}; render(); }
      return;
    }
    var pageSel = e.target.closest('[data-bh-flow-page]');
    if (pageSel) {
      // Een andere pagina in het midden = een andere uitlijning: de spelden vallen weg.
      if (pageSel.value !== '') { st.flow.page = d('p', Number(pageSel.value)); st.ppins = {}; render(); }
      return;
    }
    var el = e.target.closest('[data-bh-select]');
    if (!el) return;
    var k = el.dataset.bhSelect;
    st.f[k] = el.value === '' ? null : Number(el.value);
    if (k === 'ch') st.f.det = null;
    render();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'bhSessionsQuery') {
      st.ses.q = e.target.value;
      st.ses.limit = SES_STEP;
      renderSessionsOnly();
      return;
    }
    if (e.target.id !== 'bhPageQuery') return;
    st.pageQuery = e.target.value;
    st.pageLimit = 20;
    if (st.data) renderPages(split().cur);
  });

  if (KPI_COMPACT) {
    var opnieuw = function () { if (st.data) render(); };
    if (KPI_COMPACT.addEventListener) KPI_COMPACT.addEventListener('change', opnieuw);
    else if (KPI_COMPACT.addListener) KPI_COMPACT.addListener(opnieuw);
  }

  restoreState();
  window.WebGedragBehaviour = {
    load: function () { if (!st.data) load(); else scheduleRibbons(); },
    // Na uitsluiten of weer laten meetellen: opnieuw ophalen (de server filtert NA de cache).
    reload: function () { if (st.data) load(); },
  };
})();
