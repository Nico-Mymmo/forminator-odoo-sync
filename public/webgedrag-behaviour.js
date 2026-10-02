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
 * (kolom `acts`, zie lib/behaviour.js). Twee standen: vooruit vanaf de instap,
 * of "naar het doel toe": uitgelijnd op de eerste keer dat het gekozen doel
 * gebeurde, zodat een lange weg ernaartoe niet wegvalt achter de laatste kolom.
 *
 * REGEL 3: één centrale listener, data-bh-*-attributen. Individuele trajecten
 * opent window.WebGedrag.open() (webgedrag.js).
 */

(function () {
  'use strict';

  var C = { v: 0, start: 1, dur: 2, site: 3, ch: 4, det: 5, pages: 6, offs: 7, flags: 8, dev: 9, scroll: 10, clicks: 11, acts: 12, reo: 13 };
  // Een AANVRAAG = formulier (64) of Calendly-boeking (128). Events, nieuwsbrief,
  // academy en registratie zijn eigen acties (zie de vlaggen in lib/behaviour.js).
  var CONV = 64 | 128;
  var ALLE_ACTIES = 64 | 128 | 256 | 4096 | 8192 | 16384;
  var TOP_PER_STEP = 5;
  var MIN_STEPS = 2, MAX_STEPS = 12;
  // Acties als STAP in het pad. Dezelfde codes als ACT_KINDS in lib/behaviour.js
  // (1 formulier ... 6 registratie); wijzig ze samen. In een pad (steps()) staat
  // een pagina als haar volgnummer (>= 0) en een actie als -code.
  var ACT = {
    1: { label: 'Formulier verstuurd', short: 'Formulier', icon: 'send' },
    2: { label: 'Afspraak geboekt', short: 'Afspraak', icon: 'calendar-check' },
    3: { label: 'Ingeschreven voor een event', short: 'Event', icon: 'ticket' },
    4: { label: 'Ingeschreven op de nieuwsbrief', short: 'Nieuwsbrief', icon: 'mail' },
    5: { label: 'Ingeschreven in de academy', short: 'Academy', icon: 'graduation-cap' },
    6: { label: 'Registratie gestart', short: 'Registratie', icon: 'user-plus' }
  };
  // Het DOEL van de padverkenner. `kinds` = de acties hierboven, `flags` = de
  // vlaggen uit lib/behaviour.js (om per doel te tellen zonder elk pad te lezen).
  var GOALS = {
    aanvraag: { label: 'Aanvraag', kort: 'een aanvraag', naam: 'aanvraag', kinds: [1, 2], flags: ['form', 'calendly'] },
    reg: { label: 'Registratie gestart', kort: 'een registratie', naam: 'registratie', kinds: [6], flags: ['register'] },
    nb: { label: 'Nieuwsbrief', kort: 'een nieuwsbriefinschrijving', naam: 'nieuwsbrief', kinds: [4], flags: ['newsletter'] },
    ev: { label: 'Event', kort: 'een event-inschrijving', naam: 'event', kinds: [3], flags: ['event'] },
    ac: { label: 'Academy', kort: 'een academy-inschrijving', naam: 'academy', kinds: [5], flags: ['academy'] },
    any: { label: 'Elke actie', kort: 'een actie', naam: 'actie', kinds: [1, 2, 3, 4, 5, 6], flags: ['form', 'calendly', 'register', 'newsletter', 'event', 'academy'] }
  };
  var GOAL_ORDER = ['aanvraag', 'reg', 'nb', 'ev', 'ac', 'any'];
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
    flow: { mode: 'fwd', goal: 'aanvraag', n: 4 },   // richting, doel en aantal stappen
    sort: { key: 'n', dir: -1 }, pageQuery: '', pageLimit: 20
  };

  // ── Filters bewaren (per gebruiker, in deze browser) ─────────────────────────
  // Bij herladen of een later bezoek staat alles terug zoals je het liet, ook de
  // periode. De cache van de server bepaalt enkel hoe SNEL dat laadt, niet wat.
  // Keuzelijsten bewaren een NAAM ("Betaald zoeken", "/syndicus-gent/"), geen
  // volgnummer: dat nummer verschilt per geladen periode. Na het laden wordt de
  // naam opnieuw opgezocht; bestaat ze in die periode niet, dan valt die ene filter
  // weg in plaats van alles leeg te maken. Spelden in de padverkenner worden niet
  // bewaard: dat is verkennen, geen instelling. De STAND van de padverkenner
  // (richting, doel, aantal stappen) wel.
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
      localStorage.setItem(STORE_KEY, JSON.stringify({ period: st.period, metric: st.metric, sort: st.sort, f: f, names: namesOf(), flow: st.flow }));
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
      if (s.flow) {
        if (s.flow.mode === 'fwd' || s.flow.mode === 'back') st.flow.mode = s.flow.mode;
        if (GOALS[s.flow.goal]) st.flow.goal = s.flow.goal;
        var n = Math.round(Number(s.flow.n));
        if (n >= MIN_STEPS && n <= MAX_STEPS) st.flow.n = n;
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
  function pageName(i) { return d('p', i) || '?'; }
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
  function tokName(t) { return t < 0 ? (ACT[-t] ? ACT[-t].label : 'Actie') : pageName(t); }
  function stepWord(n) { return n === 1 ? 'stap' : 'stappen'; }

  /**
   * Het hoeveelste bezoek van die bezoeker (s._vn, 0 = het eerste dat we ZIEN).
   * Telt alleen wat in de geladen gegevens zit: de periode en de periode daarvoor.
   * Een bezoek met _vn 0 dat niet "nieuw" is, had dus eerdere bezoeken die langer
   * geleden zijn.
   */
  function numberVisits(data) {
    var by = {};
    data.sessions.forEach(function (s) { (by[s[C.v]] = by[s[C.v]] || []).push(s); });
    Object.keys(by).forEach(function (v) {
      by[v].sort(function (a, b) { return a[C.start] - b[C.start]; }).forEach(function (s, i) { s._vn = i; });
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
    var p = steps(s), k;
    if (st.flow.mode === 'back') {
      if (!Object.keys(st.bpins).length) return true;
      var g = goalIdx(s);
      if (g < 0) return false;
      for (k in st.bpins) if (p[g - Number(k)] !== st.bpins[k]) return false;
      return true;
    }
    for (k in st.pins) if (p[k] !== st.pins[k]) return false;
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
    var acties = { reg: 0, nb: 0, ev: 0, ac: 0 };
    list.forEach(function (s) {
      var fl = s[C.flags];
      if (fl & st.F.register) acties.reg++;
      if (fl & st.F.newsletter) acties.nb++;
      if (fl & st.F.event) acties.ev++;
      if (fl & st.F.academy) acties.ac++;
    });
    return { n: n, dur: median(durs), pages: n ? pages / n : null, eng: pct(eng, n), bounce: pct(bounce, n), conv: pct(conv, n), scroll: pct(scroll, n), convN: conv,
      reg: pct(acties.reg, n), nb: pct(acties.nb, n), ev: pct(acties.ev, n), ac: pct(acties.ac, n),
      regN: acties.reg, nbN: acties.nb, evN: acties.ev, acN: acties.ac };
  }

  function delta(cur, prev, kind, upIsGood) {
    if (cur === null || prev === null || prev === undefined) return '';
    var diff, txt;
    if (kind === 'pct') { diff = cur - prev; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 1) + ' ptn'; }
    else { if (!prev) return ''; diff = (cur - prev) / prev * 100; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 0) + '%'; }
    if (Math.abs(diff) < (kind === 'pct' ? 0.5 : 2)) return '<span class="text-xs text-base-content/50">gelijk aan vorige periode</span>';
    var good = (diff > 0) === upIsGood;
    return '<span class="text-xs font-medium ' + (good ? 'text-success' : 'text-error') + '">' + (diff > 0 ? '▲ ' : '▼ ') + txt + '</span>'
      + '<span class="text-xs text-base-content/50"> vs vorige</span>';
  }

  /** Een mini-verloop: enkel de vorm, geen as. Een klik opent het venster met de echte grafiek. */
  function sparkline(values) {
    var pts = values.map(function (v, i) { return [i, v]; }).filter(function (p) { return p[1] !== null && p[1] !== undefined; });
    if (pts.length < 2) return '';
    var w = 72, h = 24, max = Math.max.apply(null, pts.map(function (p) { return p[1]; })), min = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    var n = values.length - 1 || 1, span = max - min || 1;
    var xy = pts.map(function (p) { return [(p[0] / n * (w - 4) + 2).toFixed(1), (h - 3 - (p[1] - min) / span * (h - 6)).toFixed(1)]; });
    var line = xy.map(function (p) { return p.join(','); }).join(' ');
    var area = xy[0][0] + ',' + (h - 1) + ' ' + line + ' ' + xy[xy.length - 1][0] + ',' + (h - 1);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">'
      // Eigen id per lijntje: zes tegels op een pagina, dus zes verlopen.
      + '<defs><linearGradient id="bhSpark' + (++sparkId) + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" style="stop-color:' + ACCENT + ';stop-opacity:0.35"></stop>'
      + '<stop offset="1" style="stop-color:' + ACCENT + ';stop-opacity:0"></stop></linearGradient></defs>'
      + '<polygon points="' + area + '" fill="url(#bhSpark' + sparkId + ')"></polygon>'
      + '<polyline points="' + line + '" fill="none" style="stroke:' + ACCENT + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline></svg>';
  }

  function tile(label, value, deltaHtml, help, metric, series) {
    var spark = series ? sparkline(series) : '';
    return '<div class="relative rounded-xl border border-base-300 bg-base-100 p-4">'
      + (spark ? '<button type="button" class="absolute top-2 right-2 rounded-md p-1 hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-primary/40" '
        + 'data-bh-action="kpi-chart" data-metric="' + metric + '" title="Toon het verloop" aria-label="Toon het verloop van ' + esc(label) + '">' + spark + '</button>' : '')
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
    { key: 'reg', label: 'Registratie gestart', fmt: pctTxt, pct: true },
    { key: 'nb', label: 'Nieuwsbrief', fmt: pctTxt, pct: true },
    { key: 'ev', label: 'Event', fmt: pctTxt, pct: true },
    { key: 'ac', label: 'Academy', fmt: pctTxt, pct: true }
  ];
  function metricOf(key) { return METRICS.filter(function (m) { return m.key === key; })[0]; }

  /** Per metriek de waarden per dag/week/maand van de gekozen periode (zelfde indeling als de trend). */
  function sparkSeries(cur) {
    var groups = {}, keys = [];
    cur.forEach(function (s) { var k = bucketOf(s[C.start]); if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(s); });
    keys.sort();
    var per = keys.map(function (k) { return stats(groups[k]); });
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
    var hero = $('bhHero');
    if (!a.n) {
      hero.innerHTML = '<p class="text-base-content/70">Geen bezoeken in dit segment. Maak het segment ruimer.</p>';
    } else {
      hero.innerHTML = '<p class="text-lg leading-relaxed">Het gemiddelde bezoek duurt <strong>' + durTxt(a.dur) + '</strong>, '
        + 'bekijkt <strong>' + nf(a.pages, 1) + ' pagina\'s</strong>'
        + (top !== undefined ? ' en begint het vaakst op <a class="link link-primary" data-bh-action="filter" data-key="land" data-value="' + top + '">' + esc(short(pageName(top), 48)) + '</a> (' + pctTxt(pct(land[top], a.n)) + ')' : '')
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

  function renderTrend(cur, prev) {
    var unit = st.period === '12m' ? 'maand' : st.period === '90d' ? 'week' : 'dag';
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
    var keys = [], t = Date.parse(st.data.range.start + 'Z') / 1000, end = Date.parse(st.data.range.end + 'Z') / 1000;
    for (; t <= end; t += 86400) { var k = bucketOf(t); if (keys.indexOf(k) < 0) keys.push(k); }
    var val = function (g) {
      if (!g) return st.metric === 'sessions' ? 0 : null;
      if (st.metric === 'sessions') return g.n;
      return g.n ? Math.round((st.metric === 'eng' ? g.eng : g.conv) / g.n * 1000) / 10 : null;
    };
    var labels = keys.map(function (k) { return unit === 'maand' ? new Date(k + '-01T12:00:00Z').toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' }) : (unit === 'week' ? 'wk ' : '') + fmtDay.format(new Date(k + 'T12:00:00Z')); });
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
  var kpi = { metric: 'n', chart: null, table: false };

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

  async function openKpi(metric) {
    kpi.metric = metric;
    var dlg = $('bhKpiDialog');
    if (!dlg.open) dlg.showModal();
    $('bhKpiBody').style.opacity = '0.5';
    $('bhKpiStatus').innerHTML = '<span class="loading loading-spinner loading-sm"></span> Verloop laden…';
    try {
      var cfg = LONG[st.period];
      var ds = await longData(cfg.data);
      renderKpi(ds, cfg);
      $('bhKpiStatus').innerHTML = '';
    } catch (e) {
      $('bhKpiStatus').innerHTML = '<div class="alert alert-error text-sm">Kon het verloop niet laden: ' + esc(e.message) + '</div>';
    }
    $('bhKpiBody').style.opacity = '1';
  }

  function renderKpi(ds, cfg) {
    var m = metricOf(kpi.metric), f = filtersFor(ds);
    var keyOf = cfg.unit === 'week' ? weekKey : monthKey;
    // De reeks perioden, ook die zonder bezoeken: een gat hoort zichtbaar te zijn.
    var now = Date.now() / 1000, keys = [];
    for (var i = cfg.count - 1; i >= 0; i--) {
      var t;
      if (cfg.unit === 'week') t = now - i * 7 * 86400;
      else { var d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); t = d.getTime() / 1000; }
      var k = keyOf(t);
      if (keys.indexOf(k) < 0) keys.push(k);
    }
    var groups = {};
    keys.forEach(function (k) { groups[k] = []; });
    ds.sessions.forEach(function (s) {
      if (!matchesF(s, f)) return;
      var k = keyOf(s[C.start]);
      if (groups[k]) groups[k].push(s);
    });
    var vals = keys.map(function (k) { var x = stats(groups[k]); return kpi.metric === 'n' ? x.n : x[kpi.metric]; });
    var labels = keys.map(function (k, i) {
      var lbl = cfg.unit === 'week' ? 'wk ' + fmtDay.format(new Date(k + 'T12:00:00Z'))
        : new Date(k + '-15T12:00:00Z').toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' });
      return i === keys.length - 1 ? lbl + ' (lopend)' : lbl;
    });

    $('bhKpiTitle').textContent = m.label;
    $('bhKpiSub').textContent = cfg.label + (active() ? ' · met het segment van hierboven' : ' · alle bezoeken van prospecten');
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
      ? '<table class="table table-xs mt-3"><thead><tr><th>' + (cfg.unit === 'week' ? 'Week' : 'Maand') + '</th><th class="text-right">' + esc(m.label)
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
  // Vooruit = vanaf de instap; "naar het doel toe" = uitgelijnd op de EERSTE keer
  // dat het doel gebeurde, om te zien langs welke wegen het lukt.

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
  function tokLabel(t) { return t < 0 ? (ACT[-t] ? ACT[-t].label : 'Actie') : pageLabel(t); }
  function distLabel(d) { return d === 0 ? 'het doel' : d < 0 ? 'daarna' : d + ' ' + stepWord(d) + ' ervoor'; }
  function whereLabel(m, v) { return m.back ? distLabel(v) : v === 0 ? 'instap' : 'stap ' + (v + 1); }
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
    var back = st.flow.mode === 'back', n = st.flow.n, goal = GOALS[st.flow.goal];
    var view = back ? cur.filter(function (s) { return goalIdx(s) >= 0; }).filter(pinned) : cur.filter(pinned);
    var total = view.length, gi = view.map(goalIdx), P = view.map(steps), defs = [], c, j, i;
    if (back) { for (var d = n; d >= -1; d--) defs.push(d); } else { for (i = 0; i < n; i++) defs.push(i); }
    // De positie in steps() van bezoek j in kolom c; -1 = (nog) niet of niet meer op de site.
    function idx(j, c) {
      var k = back ? gi[j] - defs[c] : defs[c];
      return k >= 0 && k < P[j].length ? k : -1;
    }
    var cols = defs.map(function (v, c) {
      var nodes = {}, reached = 0;
      for (var j = 0; j < total; j++) {
        var k = idx(j, c);
        if (k < 0) continue;
        reached++;
        var t = P[j][k], g = gi[j];
        var e = nodes[t] || (nodes[t] = { tok: t, n: 0, goal: 0, more: 0, done: 0, stop: 0, times: [] });
        e.n++;
        if (g > k) e.goal++;                         // haalt het doel nog, later in het bezoek
        else if (k + 1 < P[j].length) e.more++;      // gaat verder
        else if (g >= 0) e.done++;                   // stopt, maar had het doel al
        else e.stop++;                               // stopt hier, zonder het doel
        if (back && v > 0) e.times.push(view[j]._so[g] - view[j]._so[k]);
      }
      var list = Object.keys(nodes).map(function (t) { return nodes[t]; }).sort(function (a, b) { return b.n - a.n; });
      var acts = list.filter(function (e) { return e.tok < 0; });
      var pages = list.filter(function (e) { return e.tok >= 0; });
      var pinHere = (back ? st.bpins : st.pins)[v];
      var shown = pages.slice(0, TOP_PER_STEP);
      if (pinHere !== undefined && pinHere >= 0 && !shown.some(function (e) { return e.tok === pinHere; })) {
        shown = shown.concat(pages.filter(function (e) { return e.tok === pinHere; }));
      }
      var rest = pages.filter(function (e) { return shown.indexOf(e) < 0; });
      var shownSet = {};
      acts.concat(shown).forEach(function (e) { e.id = 'c' + c + ':t' + e.tok; e.isPin = pinHere === e.tok; shownSet[e.tok] = e; });
      return {
        v: v, reached: reached, acts: acts, pages: shown, allPages: pages, shownSet: shownSet,
        rest: rest.length ? { count: rest.length, n: rest.reduce(function (s, e) { return s + e.n; }, 0) } : null
      };
    });
    var L = {};
    for (j = 0; j < total; j++) {
      for (c = 0; c + 1 < cols.length; c++) {
        var i0 = idx(j, c), i1 = idx(j, c + 1);
        if (i0 < 0 || i1 < 0) continue;
        var a = cols[c].shownSet[P[j][i0]], b = cols[c + 1].shownSet[P[j][i1]];
        if (!a || !b) continue;
        L[a.id + '>' + b.id] = (L[a.id + '>' + b.id] || 0) + 1;
      }
    }
    var links = Object.keys(L).map(function (key) {
      var ab = key.split('>');
      return { a: ab[0], b: ab[1], n: L[key], c: Number(ab[0].slice(1, ab[0].indexOf(':'))) };
    });
    var more = 0;
    for (j = 0; j < total; j++) if (back ? gi[j] > n : P[j].length > n) more++;
    return { back: back, n: n, goal: goal, view: view, total: total, gi: gi, P: P, cols: cols, links: links, more: more };
  }

  // ── Bovenaan: het antwoord ─────────────────────────────────────────────────

  /**
   * Vooruit: "Waar het stokt" en "Wat werkt". Stokken = meer stoppers dan de rest
   * van die stap (gerangschikt op het OVERSCHOT, dus volume telt mee); werken =
   * het deel dat daarna het doel haalt, gerangschikt op de Wilson-ondergrens.
   * Naar het doel toe: hoeveel pagina's, hoeveel tijd, in welk bezoek.
   */
  function renderFlowAnswers(m) {
    var el = $('bhFlowAnswers');
    if (!m.total) { el.innerHTML = ''; return; }
    if (m.back) { el.innerHTML = flowSummaryHtml(m); return; }
    var stalls = [], works = [];
    m.cols.forEach(function (c) {
      var sumN = 0, sumStop = 0;
      c.allPages.forEach(function (e) { sumN += e.n; sumStop += e.stop; });
      var avg = sumN ? sumStop / sumN : 0;
      c.pages.forEach(function (e) {
        var excess = e.stop - e.n * avg;
        if (e.n >= 5 && e.stop >= 2 && excess >= 1) stalls.push({ e: e, c: c, rate: e.stop / e.n, avg: avg, score: excess });
        if (e.goal > 0) works.push({ e: e, c: c, rate: e.goal / e.n, score: wilsonLow(e.goal, e.n) });
      });
    });
    var byScore = function (a, b) { return b.score - a.score; };
    stalls = stalls.sort(byScore).slice(0, 3);
    works = works.sort(byScore).slice(0, 3);
    function row(x, bad) {
      var where = whereLabel(m, x.c.v);
      return '<button type="button" class="w-full grid grid-cols-[1fr_auto] gap-x-3 items-center rounded-lg px-2 py-1.5 text-left hover:bg-base-200"'
        + ' data-bh-action="pin" data-step="' + x.c.v + '" data-page="' + x.e.tok + '"'
        + ' title="' + esc(pageName(x.e.tok) + ' (' + where + '): ' + outcomeText(x.e, m.goal) + (bad ? ' Gemiddeld in die stap: ' + pctTxt(x.avg * 100) + ' stopt.' : '') + ' Klik om dit pad vast te zetten.') + '">'
        + '<span class="min-w-0"><span class="block text-[13px] font-medium truncate">' + esc(tokLabel(x.e.tok)) + '</span>'
        + '<span class="block text-[11px] text-base-content/55 tabular-nums">' + esc(where) + ' · ' + nf(x.e.n) + ' bezoeken</span></span>'
        + '<span class="text-right"><span class="block text-base font-semibold tabular-nums leading-5" style="color:' + (bad ? BAD : GOOD) + '">' + pctTxt(x.rate * 100) + '</span>'
        + '<span class="block text-[11px] text-base-content/50 tabular-nums">' + (bad ? 'gem. ' + pctTxt(x.avg * 100) : nf(x.e.goal) + '×') + '</span></span></button>';
    }
    function box(icon, color, title, metric, rows, empty) {
      return '<div class="rounded-xl border border-base-300 p-2">'
        + '<div class="flex items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">'
        + '<span class="inline-flex items-center gap-1.5 text-sm font-semibold"><i data-lucide="' + icon + '" class="w-4 h-4 self-center" style="color:' + color + '"></i>' + title + '</span>'
        + '<span class="text-[11px] text-base-content/50">' + metric + '</span></div>'
        + (rows.length ? rows.join('') : '<p class="text-xs text-base-content/60 px-2 pb-2">' + empty + '</p>') + '</div>';
    }
    el.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">'
      + box('trending-down', BAD, 'Waar het stokt', 'stopt hier', stalls.map(function (x) { return row(x, true); }),
          'Geen pagina waar duidelijk meer bezoekers stoppen dan bij de rest van die stap.')
      + box('trending-up', GOOD, 'Wat werkt', 'doet daarna ' + esc(m.goal.kort), works.map(function (x) { return row(x, false); }),
          'Geen enkele pagina in deze stappen leidde tot ' + esc(m.goal.kort) + '.')
      + '</div>';
  }

  /** Een kleine verdeling: titel, kerngetal, een balk per groep. */
  function miniDist(title, headline, rows, total, note) {
    return '<div class="rounded-xl border border-base-300 p-3">'
      + '<div class="flex items-baseline justify-between gap-2"><span class="text-xs text-base-content/60">' + esc(title) + '</span><span class="text-sm font-semibold whitespace-nowrap">' + esc(headline) + '</span></div>'
      + rows.map(function (r) {
          return '<div class="flex items-center gap-2 mt-1.5 text-xs"><span class="w-32 shrink-0 truncate text-base-content/70" title="' + esc(r[0]) + '">' + esc(r[0]) + '</span>'
            + '<div class="h-1.5 rounded-full bg-base-200 flex-1 overflow-hidden"><div class="h-full rounded-full" style="width:' + (r[1] / total * 100) + '%;background-color:' + ACCENT + '"></div></div>'
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
    return '<div class="flex h-1.5 rounded-full overflow-hidden bg-base-200">' + seg('goal', GOOD) + seg('more', MOVE) + seg('done', DONE) + seg('stop', BAD) + '</div>';
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
    return (m.back ? 'data-bh-action="bpin" data-dist="' + v + '"' : 'data-bh-action="pin" data-step="' + v + '"') + ' data-page="' + t + '"';
  }

  function headCell(m, c, col) {
    var v = c.v, share = c.reached / m.total, color = ACCENT, title, help;
    if (m.back) {
      title = v > 0 ? v + ' ' + stepWord(v) + ' ervoor' : v === 0 ? m.goal.label : 'Daarna';
      if (v === 0) color = GOOD;
      help = v > 0 ? pctTxt(share * 100) + ' was toen al op de site; de rest kwam pas later binnen.'
        : v === 0 ? 'Alle bezoeken met ' + m.goal.kort + '.' : pctTxt(share * 100) + ' bleef daarna nog op de site.';
    } else {
      title = v === 0 ? 'Instap' : 'Stap ' + (v + 1);
      help = v === 0 ? 'Alle bezoeken in het segment.' : pctTxt(share * 100) + ' van de bezoeken is hier nog op de site.';
    }
    return '<div class="px-1 pb-1" style="grid-row:1;grid-column:' + col + '" title="' + esc(help) + '">'
      + '<div class="flex items-baseline justify-between gap-2"><span class="text-xs font-semibold uppercase tracking-wide text-base-content/60 truncate">' + esc(title) + '</span>'
      + '<span class="text-xs tabular-nums text-base-content/50">' + pctTxt(share * 100) + '</span></div>'
      + '<div class="text-lg font-semibold tabular-nums leading-tight mt-0.5">' + nf(c.reached) + ' <span class="text-xs font-normal text-base-content/50">bezoeken</span></div>'
      + '<div class="h-1.5 rounded-full bg-base-200 mt-1.5 overflow-hidden"><div class="h-full rounded-full" style="width:' + (share * 100) + '%;background-color:' + color + '"></div></div></div>';
  }

  function pageCard(m, c, e, row, col) {
    var where = whereLabel(m, c.v), help = pageName(e.tok) + ' (' + where + '): ' + nf(e.n) + ' bezoeken';
    var bar;
    if (m.back) {
      var tm = e.times.length ? median(e.times) : null;
      help += ', ' + pctTxt(pct(e.n, m.total)) + ' van de bezoeken met ' + m.goal.kort + (tm !== null ? '. Mediaan ' + durTxt(tm) + ' tot ' + m.goal.kort : '') + '.';
      bar = '<div class="h-1.5 rounded-full bg-base-200 overflow-hidden"><div class="h-full rounded-full" style="width:' + Math.max(e.n / m.total * 100, 2) + '%;background-color:' + ACCENT + '"></div></div>';
    } else {
      help += ' (' + pctTxt(pct(e.n, m.total)) + ' van het segment). ' + outcomeText(e, m.goal);
      bar = outcomeBar(e);
    }
    var cls = e.isPin ? 'bg-primary/10 border-primary ring-1 ring-primary' : 'bg-base-100 border-base-300 hover:bg-base-200';
    return '<button type="button" class="w-full text-left rounded-lg border px-2.5 py-2 flex flex-col justify-between transition-colors ' + cls + '"'
      + ' style="grid-row:' + row + ';grid-column:' + col + ';height:' + CARD_H + 'px" data-flow-node="' + e.id + '" ' + pinAttrs(m, c.v, e.tok)
      + ' title="' + esc(help + ' Klik om dit pad vast te zetten.') + '">'
      + '<div class="flex items-start gap-2 min-w-0"><span class="flex-1 min-w-0 text-[13px] font-medium leading-4 line-clamp-2" style="overflow-wrap:anywhere">' + esc(tokLabel(e.tok)) + '</span>'
      + '<span class="text-sm font-semibold tabular-nums leading-4">' + nf(e.n) + '</span></div>'
      + bar + '</button>';
  }

  function actCard(m, c, e, row, col) {
    var a = ACT[-e.tok];
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

  function restCard(r, row, col) {
    return '<div class="rounded-lg border border-dashed border-base-300 px-2.5 flex items-center justify-between gap-2 text-xs text-base-content/60"'
      + ' style="grid-row:' + row + ';grid-column:' + col + ';height:' + REST_H + 'px" title="Pagina\'s buiten de top ' + TOP_PER_STEP + ' van deze stap">'
      + '<span class="truncate">+ ' + nf(r.count) + ' andere pagina\'s</span><span class="tabular-nums">' + nf(r.n) + '</span></div>';
  }

  function laneLabel(text, row) {
    return '<div class="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-base-content/40" style="grid-row:' + row + ';grid-column:1 / -1">'
      + '<span>' + text + '</span><span class="flex-1 border-t border-base-200"></span></div>';
  }

  /** Wie verder gaat dan de getoonde kolommen, met een knop voor een stap meer. In de koprij, zodat de banen eronder niet verschuiven. */
  function moreCell(m, col) {
    var txt = m.back ? 'had meer dan ' + m.n + ' ' + stepWord(m.n) + ' nodig' : 'gaat verder dan stap ' + m.n;
    return '<div class="px-1" style="grid-row:1 / span 2;grid-column:' + col + '">'
      + '<div class="text-xs font-semibold uppercase tracking-wide text-base-content/60">' + (m.back ? 'Langer' : 'Verder') + '</div>'
      + '<div class="text-[11px] text-base-content/55 mt-0.5 leading-4">' + pctTxt(pct(m.more, m.total)) + ' ' + esc(txt) + '</div>'
      + (m.n < MAX_STEPS ? '<button type="button" class="btn btn-xs btn-outline mt-1.5 gap-1" data-bh-action="flow-steps" data-value="1"><i data-lucide="plus" class="w-3 h-3"></i> stap erbij</button>' : '')
      + '</div>';
  }

  function renderFlowGrid(m) {
    var A = 0, Pn = 0, hasRest = false;
    m.cols.forEach(function (c) { A = Math.max(A, c.acts.length); Pn = Math.max(Pn, c.pages.length); if (c.rest) hasRest = true; });
    // De banen, van boven naar onder. Een baan heeft in elke kolom dezelfde rijen.
    var r = 2, rows = {};
    if (A) { rows.actLabel = r++; rows.act = r; r += A; }
    if (A && Pn) rows.pageLabel = r++;
    rows.page = r; r += Pn;
    if (hasRest) rows.rest = r++;
    var COL = 'minmax(10.5rem, 1fr)', GAP = 'minmax(3rem, 0.5fr)', SEP = '1.25rem', MORE = 'minmax(8rem, 9rem)';
    var tracks = [], at = [], moreAt = 0, minW = 0;
    if (m.back && m.more) { tracks.push(MORE, SEP); moreAt = 1; minW += 128 + 20; }
    m.cols.forEach(function (c, i) {
      if (i) { tracks.push(GAP); minW += 48; }
      tracks.push(COL); at.push(tracks.length); minW += 168;
    });
    if (!m.back && m.more) { tracks.push(SEP, MORE); moreAt = tracks.length; minW += 20 + 128; }
    var cells = [];
    if (rows.actLabel) cells.push(laneLabel('Acties', rows.actLabel));
    if (rows.pageLabel) cells.push(laneLabel('Pagina\'s', rows.pageLabel));
    m.cols.forEach(function (c, i) {
      cells.push(headCell(m, c, at[i]));
      if (i) cells.push('<div class="flex justify-center pt-0.5 text-base-content/25" style="grid-row:1;grid-column:' + (at[i] - 1) + '"><i data-lucide="chevron-right" class="w-4 h-4"></i></div>');
      c.acts.forEach(function (e, k) { cells.push(actCard(m, c, e, rows.act + k, at[i])); });
      c.pages.forEach(function (e, k) { cells.push(pageCard(m, c, e, rows.page + k, at[i])); });
      if (c.rest) cells.push(restCard(c.rest, rows.rest, at[i]));
    });
    if (moreAt) cells.push(moreCell(m, moreAt));
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
      var base = flowModel.cols[k.c].reached || 1;
      return { a: k.a, b: k.b, n: k.n, w: Math.max(1.5, k.n / base * RIBBON_MAX) };
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
      var act = /:t-/.test(k.a) || /:t-/.test(k.b);
      var op = act ? 0.34 : 0.2;
      var d = 'M' + fx(x0) + ',' + fx(y0) + 'C' + fx(xm) + ',' + fx(y0) + ' ' + fx(xm) + ',' + fx(y1) + ' ' + fx(x1) + ',' + fx(y1)
        + 'L' + fx(x1) + ',' + fx(y1 + w) + 'C' + fx(xm) + ',' + fx(y1 + w) + ' ' + fx(xm) + ',' + fx(y0 + w) + ' ' + fx(x0) + ',' + fx(y0 + w) + 'Z';
      return '<path d="' + d + '" data-a="' + k.a + '" data-b="' + k.b + '" data-o="' + op + '" style="fill:' + (act ? GOOD : ACCENT) + ';opacity:' + op + '"></path>';
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

  function renderPinsLine(total, persons) {
    var back = st.flow.mode === 'back', pins = back ? st.bpins : st.pins;
    var keys = Object.keys(pins).sort(function (a, b) { return back ? b - a : a - b; });
    if (!keys.length) { $('bhPins').innerHTML = ''; return; }
    $('bhPins').innerHTML = '<span class="text-xs text-base-content/60">Vastgezet:</span> ' + keys.map(function (k) {
        var where = back ? distLabel(Number(k)) : 'stap ' + (Number(k) + 1);
        return '<span class="badge badge-primary badge-outline gap-1">' + esc(where) + ': ' + esc(tokLabel(pins[k]))
          + '<button data-bh-action="' + (back ? 'bunpin' : 'unpin') + '" data-' + (back ? 'dist' : 'step') + '="' + k + '" aria-label="Losmaken">✕</button></span>';
      }).join(' ') + ' <button class="btn btn-ghost btn-xs" data-bh-action="unpin-all">alles losmaken</button>'
      + '<span class="text-xs text-base-content/60 ml-2">' + nf(total) + ' bezoeken'
      + (persons ? ' van ' + nf(persons) + ' ' + personWord(persons) : '') + ' volgen dit pad</span>';
  }

  function renderFlowControls(cur) {
    var F = st.F, n = st.flow.n, counts = {};
    GOAL_ORDER.forEach(function (g) { counts[g] = 0; });
    cur.forEach(function (s) {
      var fl = s[C.flags];
      GOAL_ORDER.forEach(function (g) { if (GOALS[g].flags.some(function (x) { return fl & F[x]; })) counts[g]++; });
    });
    $('bhFlowControls').innerHTML = '<div class="flex flex-wrap items-end gap-x-6 gap-y-3">'
      + '<div>' + groupLabel('Richting') + pills('flow-mode', null, [['fwd', 'Vanaf de instap'], ['back', 'Naar het doel toe']], st.flow.mode) + '</div>'
      + '<label class="block">' + groupLabel('Doel', 'Vooruit toont bij elke pagina hoeveel bezoeken daarna dit doel haalden (groen). "Naar het doel toe" toont enkel bezoeken met dit doel, uitgelijnd op de eerste keer dat het gebeurde.')
      + '<select class="select select-bordered select-sm" data-bh-flow-goal>' + GOAL_ORDER.map(function (g) {
          return '<option value="' + g + '"' + (st.flow.goal === g ? ' selected' : '') + '>' + esc(GOALS[g].label) + ' (' + nf(counts[g]) + ')</option>';
        }).join('') + '</select></label>'
      + '<div>' + groupLabel('Stappen') + '<div class="join">'
      + '<button type="button" class="btn btn-sm join-item" data-bh-action="flow-steps" data-value="-1"' + (n <= MIN_STEPS ? ' disabled' : '') + ' aria-label="Een stap minder">−</button>'
      + '<span class="btn btn-sm join-item pointer-events-none tabular-nums">' + n + '</span>'
      + '<button type="button" class="btn btn-sm join-item" data-bh-action="flow-steps" data-value="1"' + (n >= MAX_STEPS ? ' disabled' : '') + ' aria-label="Een stap meer">+</button>'
      + '</div></div></div>';
  }

  function renderFlowLegend(m) {
    if (!m.total) { $('bhFlowLegend').innerHTML = ''; return; }
    var sw = function (color, label) {
      return '<span class="inline-flex items-center gap-1"><span class="inline-block w-3 h-1.5 rounded-full" style="background-color:' + color + '"></span>' + label + '</span>';
    };
    $('bhFlowLegend').innerHTML = '<div class="flex flex-wrap items-center gap-x-4 gap-y-1">'
      + (m.back
        ? '<span>Balk = deel van de bezoeken met ' + esc(m.goal.kort) + '.</span>'
        : '<span>Balk = wat die bezoekers daarna deden:</span>' + sw(GOOD, esc(m.goal.naam)) + sw(MOVE, 'gaat verder') + sw(DONE, 'stopt na ' + esc(m.goal.naam)) + sw(BAD, 'stopt hier'))
      + '<span class="text-base-content/45">Linten = wie van de ene stap naar de volgende ging. Klik een kaart om dat pad vast te zetten.</span></div>';
  }

  function renderFlow(cur) {
    renderFlowControls(cur);
    var m = buildFlow(cur);
    flowModel = m.total ? m : null;
    renderPinsLine(m.total, m.view ? personCount(m.view) : 0);
    renderFlowAnswers(m);
    renderFlowLegend(m);
    if (!m.total) {
      $('bhFlow').innerHTML = '<p class="text-sm text-base-content/60 p-4">' + (m.back
        ? 'Geen bezoeken met ' + esc(m.goal.kort) + (Object.keys(st.bpins).length ? ' langs dit pad' : ' in dit segment') + '.'
        : 'Geen bezoeken met dit pad.') + '</p>';
      return;
    }
    renderFlowGrid(m);
  }

  // ── Meest gevolgde paden ───────────────────────────────────────────────────

  /** Een stap in een pad als tekst: een pagina, of een actie als groen etiket. */
  function tokChip(t) {
    if (t < 0) {
      var a = ACT[-t];
      return '<span class="inline-flex items-center gap-1 rounded-md bg-success/20 px-1.5 font-medium" title="' + esc(tokName(t)) + '">'
        + '<i data-lucide="' + (a ? a.icon : 'check') + '" class="w-3 h-3"></i>' + esc(a ? a.short : 'Actie') + '</span>';
    }
    return '<span class="truncate max-w-[14rem]" title="' + esc(pageName(t)) + '">' + esc(pageLabel(t)) + '</span>';
  }

  function renderPaths(cur) {
    var back = st.flow.mode === 'back', n = st.flow.n, goal = GOALS[st.flow.goal], m = {};
    var view = back ? cur.filter(function (s) { return goalIdx(s) >= 0; }).filter(pinned) : cur.filter(pinned);
    view.forEach(function (s) {
      var full = steps(s), g = goalIdx(s), from = back ? Math.max(0, g - n) : 0;
      var seq = back ? full.slice(from, g + 1) : full.slice(0, n);
      if (!seq.length) return;
      var k = (from > 0 ? '…>' : '') + seq.join('>');
      var e = m[k] || (m[k] = { p: seq, n: 0, conv: 0, more: 0, cut: from > 0 });
      e.n++;
      if (g >= 0) e.conv++;
      if (!back && full.length > n) e.more++;
    });
    var rows = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var max = rows.length ? rows[0].n : 1;
    $('bhPathsTitle').textContent = back ? 'Meest gevolgde wegen naar ' + goal.kort : 'Meest gevolgde paden';
    $('bhPathsSub').textContent = back
      ? 'De laatste ' + n + ' ' + stepWord(n) + ' voor ' + goal.kort + ' (de eerste keer in dat bezoek). Klik om de weg vast te zetten.'
      : 'De eerste ' + n + ' ' + stepWord(n) + ' van een bezoek; acties staan in het groen. Klik om het pad vast te zetten.';
    $('bhPaths').innerHTML = rows.length ? rows.map(function (r) {
      return '<button type="button" class="w-full text-left rounded-lg px-2 py-2 hover:bg-base-200" data-bh-action="' + (back ? 'bpin-path' : 'pin-path') + '" data-path="' + r.p.join(',') + '">'
        + '<div class="flex flex-wrap items-center gap-1 text-sm">' + (r.cut ? '<span class="text-base-content/40">… →</span>' : '')
        + r.p.map(tokChip).join('<span class="text-base-content/30">→</span>')
        + (!back && r.p.length === 1 ? ' <span class="text-xs text-base-content/50">(en weg)</span>' : '') + (r.more ? ' <span class="text-xs text-base-content/50">→ …</span>' : '') + '</div>'
        + '<div class="flex items-center gap-3 mt-1"><div class="h-1.5 rounded-full bg-base-200 flex-1 overflow-hidden"><div class="h-full rounded-full" style="width:' + (r.n / max * 100) + '%;background-color:' + ACCENT + '"></div></div>'
        + '<span class="text-xs text-base-content/60 tabular-nums w-28 text-right">' + nf(r.n) + ' · ' + pctTxt(pct(r.n, view.length)) + '</span>'
        + (back ? '' : '<span class="text-xs text-success tabular-nums w-14 text-right" title="Deel van deze bezoeken met ' + esc(goal.kort) + '">' + (r.conv ? '✓ ' + pctTxt(pct(r.conv, r.n)) : '') + '</span>')
        + '</div></button>';
    }).join('') : '<p class="text-sm text-base-content/60">' + (back ? 'Geen bezoeken met ' + esc(goal.kort) + '.' : 'Geen paden.') + '</p>';
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
        var active = st.f.visited === r.k;
        return '<tr class="hover cursor-pointer ' + (active ? 'bg-primary/10' : '') + '" data-bh-action="filter" data-key="visited" data-value="' + r.k + '" title="Alleen bezoeken met deze pagina">'
          + '<td class="max-w-[22rem]"><div class="truncate" title="' + esc(r.name) + '">' + esc(r.name) + '</div>'
          + '<div class="h-1 rounded-full bg-base-200 mt-1"><div class="h-full rounded-full" style="width:' + (r.n / max * 100) + '%;background-color:' + ACCENT + '"></div></div></td>'
          + '<td class="text-right tabular-nums">' + nf(r.n) + '</td><td class="text-right tabular-nums">' + pctTxt(r.entry) + '</td>'
          + '<td class="text-right tabular-nums">' + pctTxt(r.exit) + '</td><td class="text-right tabular-nums">' + durTxt(r.time) + '</td>'
          + '<td class="text-right tabular-nums">' + pctTxt(r.conv) + '</td></tr>';
      }).join('') + '</tbody></table>'
      + (rows.length > st.pageLimit ? '<button class="btn btn-ghost btn-sm w-full" data-bh-action="more-pages">Toon meer (' + nf(rows.length - st.pageLimit) + ')</button>' : '');
  }

  // ── Eén persoon kleurt het segment ─────────────────────────────────────────
  // In een klein segment kan één persoon alles bepalen (7 van de 7 bezoeken). Dan
  // lees je het gedrag van die persoon, niet dat van "de bezoeker" -- en dat moet je zien vóór je
  // er iets uit besluit. Vanaf 3 bezoeken en een kwart van wat er getoond wordt.
  // Uitsluiten opent het venster van webgedrag.js (window.WebGedrag.exclude).
  var DOMINANT_MIN = 3, DOMINANT_SHARE = 0.25;
  function renderConcentration(view) {
    var el = $('bhConcentration');
    if (!el) return;
    var per = {};
    view.forEach(function (s) { var k = personKey(s); (per[k] = per[k] || { n: 0, s: s }).n++; });
    var top = Object.keys(per).map(function (k) { return per[k]; })
      .filter(function (x) { return x.n >= DOMINANT_MIN && x.n / view.length >= DOMINANT_SHARE; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 3);
    if (!top.length) { el.innerHTML = ''; return; }
    var waar = Object.keys(st.flow.mode === 'back' ? st.bpins : st.pins).length ? ' op dit pad' : ' in dit segment';
    var admin = !!(window.WebGedrag && window.WebGedrag.isAdmin && window.WebGedrag.isAdmin());
    el.innerHTML = '<div class="rounded-2xl border border-warning/40 bg-warning/10 p-4 space-y-2">' + top.map(function (x) {
      var label = personLabel(x.s), uuid = d('v', x.s[C.v]);
      var wie = label ? esc(label) : 'een anonieme bezoeker (browser ' + esc(String(uuid).slice(0, 8)) + ')';
      return '<div class="flex flex-wrap items-center gap-x-3 gap-y-2">'
        + '<i data-lucide="user-round" class="w-4 h-4 shrink-0"></i>'
        + '<p class="text-sm flex-1 min-w-[16rem]"><strong>' + nf(x.n) + ' van de ' + nf(view.length) + ' bezoeken</strong> (' + pctTxt(pct(x.n, view.length)) + ')'
        + waar + ' komen van één persoon: <strong>' + wie + '</strong>. Wat je hier ziet, is vooral het gedrag van die persoon.</p>'
        + '<button class="btn btn-xs" data-bh-action="visitor" data-uuid="' + esc(uuid) + '">Bekijk traject</button>'
        + (admin ? '<button class="btn btn-xs btn-ghost" data-bh-action="exclude" data-uuid="' + esc(uuid) + '" data-norm="' + esc(label || '') + '">Uitsluiten uit de cijfers</button>' : '')
        + '</div>';
    }).join('') + '</div>';
  }

  // ── Bezoeken in dit segment (doorklikken naar het individuele traject) ─────

  function renderSessions(cur) {
    var all = cur.filter(pinned), view = all.slice().sort(function (a, b) { return b[C.start] - a[C.start]; }).slice(0, 25);
    var pn = personCount(all);
    if ($('bhSessionsCount')) {
      $('bhSessionsCount').textContent = all.length
        ? nf(all.length) + ' bezoeken van ' + nf(pn) + ' ' + personWord(pn) + (all.length > view.length ? ' · de ' + view.length + ' meest recente' : '') : '';
    }
    $('bhSessions').innerHTML = view.length ? view.map(function (s) {
      var p = path(s), ch = d('ch', s[C.ch]), det = d('det', s[C.det]), fl = s[C.flags];
      var wie = personLabel(s);
      // Een heropende advertentielink is GEEN nieuwe klik (channelOf in web-visits.js):
      // de bezoeker opende dezelfde link opnieuw. Bij de oude historiek is dat niet na
      // te gaan, en dat staat er dan bij.
      var kanaal = s[C.reo]
        ? dot(chColor(ch)) + '<span title="' + esc('Zelfde klik-id als de advertentieklik van ' + dayTxt(s[C.reo]) + '. Geen nieuwe klik: dezelfde link werd opnieuw geopend (bladwijzer, adresbalk, herstelde tab). Telt als Direct.') + '">'
          + 'Direct · heropende advertentielink, geklikt op ' + esc(dayTxt(s[C.reo])) + '</span>'
        : dot(chColor(ch)) + esc(ch) + (det ? ' · ' + esc(short(det, 30)) : '')
          + (fl & st.F.klikOnbekend ? ' <span class="badge badge-xs badge-ghost" title="Van vóór 29 september: of dit een nieuwe advertentieklik was of dezelfde link opnieuw geopend, is niet bewaard.">oude historiek</span>' : '');
      var badges = (fl & st.F.linked ? '<span class="badge badge-sm badge-info badge-outline">lead</span>' : fl & st.F.known ? '<span class="badge badge-sm badge-outline">gekend</span>' : '')
        + (converted(s) ? '<span class="badge badge-sm badge-success badge-outline">aanvraag</span>' : '');
      var route = p.length ? esc(short(pageName(p[0]), 26)) + (p.length > 2 ? ' <span class="text-base-content/40">→ ' + (p.length - 2) + ' →</span> ' : p.length === 2 ? ' <span class="text-base-content/40">→</span> ' : '') + (p.length > 1 ? esc(short(pageName(p[p.length - 1]), 26)) : '') : '<span class="text-base-content/40">geen pagina</span>';
      return '<button class="w-full text-left grid grid-cols-[6.5rem_1fr_auto] gap-3 items-center px-2 py-2 rounded-lg hover:bg-base-200" data-bh-action="visitor" data-uuid="' + esc(d('v', s[C.v])) + '">'
        + '<span class="text-xs text-base-content/60">' + new Date(s[C.start] * 1000).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span>'
        + '<span class="min-w-0"><span class="flex items-center gap-1.5 text-xs text-base-content/70">' + kanaal + '</span>'
        + '<span class="block text-sm truncate">' + route + '</span></span>'
        + '<span class="flex items-center gap-1 justify-end">'
        + (wie ? '<span class="text-xs text-base-content/60 truncate max-w-[12rem] mr-1" title="' + esc(wie) + '">' + esc(wie) + '</span>' : '')
        + '<span class="text-xs text-base-content/60 mr-1">' + durTxt(s[C.dur]) + '</span>' + badges + '</span></button>';
    }).join('') : '<p class="text-sm text-base-content/60">Geen bezoeken.</p>';
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
      + (help ? ' <span class="tooltip tooltip-bottom normal-case font-normal tracking-normal" data-tip="' + esc(help) + '"><i data-lucide="info" class="w-3 h-3"></i></span>' : '')
      + '</div>';
  }

  /** Segmentknop: de gekozen optie is gevuld in de primaire kleur, de rest neutraal. */
  function pills(action, key, choices, current) {
    return '<div class="inline-flex flex-wrap rounded-lg bg-base-200 p-0.5 gap-0.5" role="group">' + choices.map(function (c) {
      var on = current === c[0];
      return '<button type="button" aria-pressed="' + on + '" class="px-3 py-1 text-sm rounded-md transition-colors '
        + (on ? 'bg-primary text-primary-content font-medium shadow-sm' : 'text-base-content/70 hover:bg-base-300/70 hover:text-base-content')
        + '" data-bh-action="' + action + '"' + (key ? ' data-key="' + key + '"' : '') + ' data-value="' + c[0] + '">' + esc(c[1]) + '</button>';
    }).join('') + '</div>';
  }

  function seg(key, label, choices, help) {
    return '<div>' + groupLabel(label, help) + pills('seg', key, choices, st.f[key]) + '</div>';
  }

  function select(key, label, kind) {
    var cur = st.f[key];
    var opts = options(key).map(function (o) {
      var name = kind === 'dev' ? (DEV_LABELS[d('dev', o[0])] || d('dev', o[0])) : kind === 'p' ? short(pageName(o[0]), 50) : d(kind, o[0]);
      return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(name) + ' (' + nf(o[1]) + ')</option>';
    }).join('');
    return '<label class="block min-w-0">' + groupLabel(label)
      + '<select class="select select-bordered select-sm w-full ' + (cur !== null ? 'border-primary bg-primary/5 font-medium' : '') + '" data-bh-select="' + key + '">'
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
      case 'conv': return { yes: 'Met aanvraag', reg: 'Registratie gestart', nb: 'Nieuwsbrief', ev: 'Event', ac: 'Academy', no: 'Zonder actie' }[f.conv];
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
      ? pills('site', null, [['', 'Beide']].concat(sites.map(function (s, i) { return [String(i), s]; })), st.f.site === null ? '' : String(st.f.site))
      : '<select class="select select-bordered select-sm" data-bh-select="site"><option value="">Alle websites</option>'
        + sites.map(function (s, i) { return '<option value="' + i + '"' + (st.f.site === i ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>';
    var keys = activeKeys();

    $('bhFilters').innerHTML =
      '<div class="rounded-2xl bg-base-100 border border-base-300 shadow-sm p-4 space-y-4">'
      // 1. wanneer en waar
      + '<div class="flex flex-wrap items-end gap-x-8 gap-y-3">'
      +   '<div>' + groupLabel('Periode') + pills('period', null, [['7d', '7 dagen'], ['30d', '30 dagen'], ['90d', '90 dagen'], ['12m', '12 maanden']], st.period) + '</div>'
      +   '<div>' + groupLabel('Website') + siteControl + '</div>'
      + '</div>'
      // 2. wie
      + '<div class="flex flex-wrap items-end gap-x-8 gap-y-3 pt-4 border-t border-base-200">'
      +   seg('purpose', 'Wie', [['prospect', 'Prospecten'], ['customer', 'Klanten'], ['all', 'Allebei']],
            'Klant = wie inlogt op het platform, vanaf de eerste keer dat hij inlogt. Zijn bezoeken daarvoor tellen als prospect.')
      +   seg('who', 'Herkend', [['all', 'Alle'], ['anon', 'Anoniem'], ['known', 'Met e-mail'], ['lead', 'Met lead']],
            'Met e-mail = de bezoeker liet ooit een adres achter. Met lead = hij hangt aan een lead in Odoo.')
      +   seg('conv', 'Actie', [['all', 'Alle'], ['yes', 'Aanvraag'], ['reg', 'Registratie'], ['nb', 'Nieuwsbrief'], ['ev', 'Event'], ['ac', 'Academy'], ['no', 'Geen actie']],
            'Een formulier, een afspraak of een inschrijving in dat bezoek.')
      +   seg('visit', 'Bezoek', [['all', 'Alle'], ['new', 'Eerste bezoek'], ['return', 'Terugkerend']])
      + '</div>'
      // 3. verfijn
      + '<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-4 border-t border-base-200">'
      +   select('ch', 'Kanaal', 'ch') + select('det', 'Bron of campagne', 'det') + select('land', 'Instappagina', 'p') + select('dev', 'Toestel', 'dev')
      + '</div>'
      // 4. wat staat er aan
      + (keys.length
        ? '<div class="flex flex-wrap items-center gap-2 pt-3 border-t border-base-200">'
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
    if (f.ch !== null) w.push('via ' + d('ch', f.ch));
    if (f.det !== null) w.push('(' + d('det', f.det) + ')');
    if (f.land !== null) w.push('die begonnen op ' + short(pageName(f.land), 40));
    if (f.visited !== null) w.push('die ' + short(pageName(f.visited), 40) + ' bekeken');
    if (f.dev !== null) w.push('op ' + (DEV_LABELS[d('dev', f.dev)] || d('dev', f.dev)).toLowerCase());
    var actieZin = { yes: 'met een aanvraag', reg: 'waarin een registratie gestart werd', nb: 'met een inschrijving op de nieuwsbrief',
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
    renderConcentration(p.cur.filter(pinned));
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
    var body = $('bhBody');
    body.style.opacity = st.data ? '0.5' : '1';   // vorige weergave houden, geen flits
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
      st.pins = {}; st.bpins = {};
      numberVisits(st.data);
      $('bhStatus').innerHTML = '';
      render();
    } catch (e) {
      $('bhStatus').innerHTML = '<div class="alert alert-error text-sm">Kon de bezoeken niet laden: ' + esc(e.message) + '</div>';
    }
    body.style.opacity = '1';
    st.loading = false;
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-bh-action]');
    if (!el) return;
    var a = el.dataset.bhAction, v = el.dataset.value;
    if (a === 'period') { st.period = v; load(); return; }
    if (a === 'kpi-chart') { openKpi(el.dataset.metric); return; }
    if (a === 'kpi-metric') { openKpi(v); return; }
    if (a === 'kpi-table') { kpi.table = !kpi.table; openKpi(kpi.metric); return; }
    if (a === 'seg') { st.f[el.dataset.key] = v; }
    else if (a === 'filter') { var k = el.dataset.key, n = Number(v); st.f[k] = st.f[k] === n ? null : n; }
    else if (a === 'reset') { st.f = Object.assign({}, DEFAULTS); st.pins = {}; st.bpins = {}; }
    else if (a === 'clear') { st.f[el.dataset.key] = DEFAULTS[el.dataset.key]; if (el.dataset.key === 'ch') st.f.det = null; }
    else if (a === 'site') { st.f.site = v === '' ? null : Number(v); }
    else if (a === 'pin') { var s = el.dataset.step, pg = Number(el.dataset.page); if (st.pins[s] === pg) delete st.pins[s]; else st.pins[s] = pg; }
    else if (a === 'pin-path') { st.pins = {}; el.dataset.path.split(',').forEach(function (x, i) { st.pins[i] = Number(x); }); }
    else if (a === 'unpin') { delete st.pins[el.dataset.step]; }
    else if (a === 'unpin-all') { st.pins = {}; st.bpins = {}; }
    else if (a === 'bpin') { var dd = el.dataset.dist, tk = Number(el.dataset.page); if (st.bpins[dd] === tk) delete st.bpins[dd]; else st.bpins[dd] = tk; }
    else if (a === 'bpin-path') { st.bpins = {}; var bp = el.dataset.path.split(','); bp.forEach(function (x, i) { st.bpins[bp.length - 1 - i] = Number(x); }); }
    else if (a === 'bunpin') { delete st.bpins[el.dataset.dist]; }
    else if (a === 'flow-mode') { if (st.flow.mode !== v) { st.flow.mode = v; st.pins = {}; st.bpins = {}; } }
    else if (a === 'flow-steps') { setSteps(st.flow.n + Number(v)); }
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

  /** Een speld op een stap die niet meer getoond wordt, zou onzichtbaar blijven filteren: weg ermee. */
  function setSteps(n) {
    n = Math.max(MIN_STEPS, Math.min(MAX_STEPS, n));
    st.flow.n = n;
    Object.keys(st.pins).forEach(function (k) { if (Number(k) >= n) delete st.pins[k]; });
    Object.keys(st.bpins).forEach(function (k) { if (Number(k) > n) delete st.bpins[k]; });
  }

  document.addEventListener('change', function (e) {
    var goalSel = e.target.closest('[data-bh-flow-goal]');
    if (goalSel) {
      // Een ander doel = een andere uitlijning: de spelden van "naar het doel toe" kloppen niet meer.
      if (GOALS[goalSel.value]) { st.flow.goal = goalSel.value; st.bpins = {}; render(); }
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
    if (e.target.id !== 'bhPageQuery') return;
    st.pageQuery = e.target.value;
    st.pageLimit = 20;
    if (st.data) renderPages(split().cur);
  });

  restoreState();
  window.WebGedragBehaviour = {
    load: function () { if (!st.data) load(); else scheduleRibbons(); },
    // Na uitsluiten of weer laten meetellen: opnieuw ophalen (de server filtert NA de cache).
    reload: function () { if (st.data) load(); },
  };
})();
