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
 * REGEL 3: één centrale listener, data-bh-*-attributen. Individuele trajecten
 * opent window.WebGedrag.open() (webgedrag.js).
 */

(function () {
  'use strict';

  var C = { v: 0, start: 1, dur: 2, site: 3, ch: 4, det: 5, pages: 6, offs: 7, flags: 8, dev: 9, scroll: 10, clicks: 11 };
  var CONV = 64 | 128 | 256;
  var STEPS = 4;
  var TOP_PER_STEP = 5;
  var ACCENT = '#2563eb';
  var DEV_LABELS = { desktop: 'Desktop', mobile: 'Mobiel', tablet: 'Tablet' };
  var PERIODS = { '7d': 'laatste 7 dagen', '30d': 'laatste 30 dagen', '90d': 'laatste 90 dagen', '12m': 'laatste 12 maanden' };

  var st = {
    period: '30d', data: null, F: null, loading: false, chart: null, metric: 'sessions', showTable: false,
    // purpose: 'prospect' (standaard) | 'customer' | 'all'. Klant = vanaf de eerste login (web-visits.js).
    f: { site: null, ch: null, det: null, land: null, visited: null, dev: null, who: 'all', conv: 'all', visit: 'all', purpose: 'prospect' },
    pins: {},           // stap (0-based) -> pagina-index
    sort: { key: 'n', dir: -1 }, pageQuery: '', pageLimit: 20
  };

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

  // ── Segment ────────────────────────────────────────────────────────────────

  function matches(s, ignorePurpose) {
    var f = st.f, fl = s[C.flags], F = st.F;
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
    if (f.conv === 'no' && converted(s)) return false;
    if (f.visit === 'new' && !(fl & F.isNew)) return false;
    if (f.visit === 'return' && (fl & F.isNew)) return false;
    return true;
  }
  function pinned(s) {
    var p = path(s);
    for (var k in st.pins) if (p[k] !== st.pins[k]) return false;
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
    return { n: n, dur: median(durs), pages: n ? pages / n : null, eng: pct(eng, n), bounce: pct(bounce, n), conv: pct(conv, n), scroll: pct(scroll, n), convN: conv };
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

  function tile(label, value, deltaHtml, help) {
    return '<div class="rounded-xl border border-base-300 bg-base-100 p-4" title="' + esc(help || '') + '">'
      + '<div class="text-xs text-base-content/60">' + esc(label) + '</div>'
      + '<div class="text-2xl font-semibold mt-1">' + value + '</div>'
      + '<div class="mt-1 min-h-[1rem]">' + deltaHtml + '</div></div>';
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
    $('bhTiles').innerHTML =
      tile('Bezoeken', nf(a.n), delta(a.n, b.n, 'n', true), 'Sessies in dit segment') +
      tile('Duur (mediaan)', durTxt(a.dur), delta(a.dur, b.dur, 'n', true), 'De helft van de bezoeken duurt korter, de helft langer') +
      tile('Pagina\'s per bezoek', a.pages === null ? '—' : nf(a.pages, 1), delta(a.pages, b.pages, 'n', true), 'Herladen van dezelfde pagina telt niet') +
      tile('Doet er iets mee', pctTxt(a.eng), delta(a.eng, b.eng, 'pct', true), 'Meer dan één pagina, een klik, scrollen, of langer dan 5 seconden') +
      tile('Haakt meteen af', pctTxt(a.bounce), delta(a.bounce, b.bounce, 'pct', false), 'Eén pagina en verder niets') +
      tile('Aanvraag', pctTxt(a.conv), delta(a.conv, b.conv, 'pct', true), nf(a.convN) + ' formulieren, afspraken of inschrijvingen');
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
          { label: 'Deze periode', data: cur_, borderColor: ACCENT, backgroundColor: ACCENT + '1a', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, spanGaps: true },
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

  // ── Padverkenner ───────────────────────────────────────────────────────────

  function renderFlow(cur) {
    var view = cur.filter(pinned);
    var total = view.length;
    var pinKeys = Object.keys(st.pins);
    $('bhPins').innerHTML = pinKeys.length
      ? '<span class="text-xs text-base-content/60">Vastgezet:</span> ' + pinKeys.sort().map(function (k) {
          return '<span class="badge badge-primary badge-outline gap-1">stap ' + (Number(k) + 1) + ': ' + esc(short(pageName(st.pins[k]), 30))
            + '<button data-bh-action="unpin" data-step="' + k + '" aria-label="Losmaken">✕</button></span>';
        }).join(' ') + ' <button class="btn btn-ghost btn-xs" data-bh-action="unpin-all">alles losmaken</button>'
        + '<span class="text-xs text-base-content/60 ml-2">' + nf(total) + ' bezoeken volgen dit pad</span>'
      : '<span class="text-xs text-base-content/60">Klik een pagina om ze vast te zetten: je ziet dan waar die bezoekers vandaan kwamen en waar ze heen gingen.</span>';

    if (!total) { $('bhFlow').innerHTML = '<p class="text-sm text-base-content/60 p-4">Geen bezoeken met dit pad.</p>'; return; }

    var cols = [];
    for (var step = 0; step < STEPS; step++) {
      var counts = {}, conv = {}, reached = 0;
      view.forEach(function (s) {
        var p = path(s)[step];
        if (p === undefined) return;
        reached++;
        counts[p] = (counts[p] || 0) + 1;
        if (converted(s)) conv[p] = (conv[p] || 0) + 1;
      });
      var keys = Object.keys(counts).map(Number).sort(function (a, b) { return counts[b] - counts[a]; });
      var pinnedHere = st.pins[step];
      var shown = keys.slice(0, TOP_PER_STEP);
      if (pinnedHere !== undefined && shown.indexOf(pinnedHere) < 0 && counts[pinnedHere]) shown.push(pinnedHere);
      var rest = keys.filter(function (k) { return shown.indexOf(k) < 0; });
      var restN = rest.reduce(function (n, k) { return n + counts[k]; }, 0);
      var left = total - reached;

      var nodes = shown.map(function (k) {
        var w = counts[k] / total * 100, isPin = pinnedHere === k;
        return '<button class="group w-full text-left rounded-lg px-2 py-1.5 hover:bg-base-200 ' + (isPin ? 'bg-primary/10 ring-1 ring-primary' : '') + '"'
          + ' data-bh-action="pin" data-step="' + step + '" data-page="' + k + '" title="' + esc(pageName(k)) + '">'
          + '<div class="flex justify-between gap-2 text-sm"><span class="truncate">' + esc(short(pageName(k))) + '</span>'
          + '<span class="text-base-content/60 shrink-0 tabular-nums">' + pctTxt(pct(counts[k], total)) + '</span></div>'
          + '<div class="h-1.5 rounded-full bg-base-200 mt-1 overflow-hidden"><div class="h-full rounded-full" style="width:' + Math.max(w, 1.5) + '%;background-color:' + (isPin ? '#1d4ed8' : ACCENT) + '"></div></div>'
          + '<div class="text-[11px] text-base-content/50 mt-0.5">' + nf(counts[k]) + ' bezoeken' + (conv[k] ? ' · ' + pctTxt(pct(conv[k], counts[k])) + ' aanvraag' : '') + '</div>'
          + '</button>';
      }).join('');
      if (restN) {
        nodes += '<div class="px-2 py-1.5 text-sm text-base-content/60">'
          + '<div class="flex justify-between"><span>' + rest.length + ' andere pagina\'s</span><span class="tabular-nums">' + pctTxt(pct(restN, total)) + '</span></div>'
          + '<div class="h-1.5 rounded-full bg-base-200 mt-1 overflow-hidden"><div class="h-full rounded-full bg-base-content/20" style="width:' + Math.max(restN / total * 100, 1.5) + '%"></div></div></div>';
      }
      if (step > 0 && left > 0) {
        nodes += '<div class="px-2 py-1.5 text-sm text-base-content/60 border-t border-base-300 mt-1">'
          + '<div class="flex justify-between"><span class="inline-flex items-center gap-1"><i data-lucide="log-out" class="w-3 h-3"></i> verlaat de site</span><span class="tabular-nums">' + pctTxt(pct(left, total)) + '</span></div>'
          + '<div class="h-1.5 rounded-full bg-base-200 mt-1 overflow-hidden"><div class="h-full rounded-full bg-base-content/25" style="width:' + Math.max(left / total * 100, 1.5) + '%"></div></div></div>';
      }
      cols.push('<div class="min-w-[13rem] flex-1">'
        + '<div class="flex items-baseline justify-between px-2 mb-1"><span class="text-xs font-semibold uppercase tracking-wide text-base-content/60">'
        + (step === 0 ? 'Instap' : 'Stap ' + (step + 1)) + '</span>'
        + '<span class="text-[11px] text-base-content/50">' + (step === 0 ? nf(total) + ' bezoeken' : pctTxt(pct(reached, total)) + ' nog op de site') + '</span></div>'
        + nodes + '</div>');
    }
    $('bhFlow').innerHTML = cols.join('<div class="hidden md:flex items-start pt-8 text-base-content/30"><i data-lucide="chevron-right" class="w-4 h-4"></i></div>');
  }

  function renderPaths(cur) {
    var view = cur.filter(pinned), m = {};
    view.forEach(function (s) {
      var p = path(s).slice(0, STEPS);
      if (!p.length) return;
      var k = p.join('>');
      var g = m[k] || (m[k] = { p: p, n: 0, conv: 0, more: 0 });
      g.n++;
      if (converted(s)) g.conv++;
      if (path(s).length > STEPS) g.more++;
    });
    var rows = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var max = rows.length ? rows[0].n : 1;
    $('bhPaths').innerHTML = rows.length ? rows.map(function (r) {
      return '<button class="w-full text-left rounded-lg px-2 py-2 hover:bg-base-200" data-bh-action="pin-path" data-path="' + r.p.join(',') + '">'
        + '<div class="flex flex-wrap items-center gap-1 text-sm">' + r.p.map(function (x) { return '<span class="truncate max-w-[14rem]" title="' + esc(pageName(x)) + '">' + esc(short(pageName(x), 28)) + '</span>'; }).join('<span class="text-base-content/30">→</span>')
        + (r.p.length === 1 ? ' <span class="text-xs text-base-content/50">(en weg)</span>' : '') + (r.more ? ' <span class="text-xs text-base-content/50">→ …</span>' : '') + '</div>'
        + '<div class="flex items-center gap-3 mt-1"><div class="h-1.5 rounded-full bg-base-200 flex-1 overflow-hidden"><div class="h-full rounded-full" style="width:' + (r.n / max * 100) + '%;background-color:' + ACCENT + '"></div></div>'
        + '<span class="text-xs text-base-content/60 tabular-nums w-28 text-right">' + nf(r.n) + ' · ' + pctTxt(pct(r.n, view.length)) + '</span>'
        + '<span class="text-xs text-base-content/60 tabular-nums w-20 text-right">' + (r.conv ? pctTxt(pct(r.conv, r.n)) + ' aanvr.' : '') + '</span></div></button>';
    }).join('') : '<p class="text-sm text-base-content/60">Geen paden.</p>';
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

  // ── Bezoeken in dit segment (doorklikken naar het individuele traject) ─────

  function renderSessions(cur) {
    var view = cur.filter(pinned).slice().sort(function (a, b) { return b[C.start] - a[C.start]; }).slice(0, 25);
    $('bhSessions').innerHTML = view.length ? view.map(function (s) {
      var p = path(s), ch = d('ch', s[C.ch]), det = d('det', s[C.det]), fl = s[C.flags];
      var badges = (fl & st.F.linked ? '<span class="badge badge-sm badge-info badge-outline">lead</span>' : fl & st.F.known ? '<span class="badge badge-sm badge-outline">gekend</span>' : '')
        + (converted(s) ? '<span class="badge badge-sm badge-success badge-outline">aanvraag</span>' : '');
      var route = p.length ? esc(short(pageName(p[0]), 26)) + (p.length > 2 ? ' <span class="text-base-content/40">→ ' + (p.length - 2) + ' →</span> ' : p.length === 2 ? ' <span class="text-base-content/40">→</span> ' : '') + (p.length > 1 ? esc(short(pageName(p[p.length - 1]), 26)) : '') : '<span class="text-base-content/40">geen pagina</span>';
      return '<button class="w-full text-left grid grid-cols-[6.5rem_1fr_auto] gap-3 items-center px-2 py-2 rounded-lg hover:bg-base-200" data-bh-action="visitor" data-uuid="' + esc(d('v', s[C.v])) + '">'
        + '<span class="text-xs text-base-content/60">' + new Date(s[C.start] * 1000).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span>'
        + '<span class="min-w-0"><span class="flex items-center gap-1.5 text-xs text-base-content/70">' + dot(chColor(ch)) + esc(ch) + (det ? ' · ' + esc(short(det, 30)) : '') + '</span>'
        + '<span class="block text-sm truncate">' + route + '</span></span>'
        + '<span class="flex items-center gap-1 justify-end"><span class="text-xs text-base-content/60 mr-1">' + durTxt(s[C.dur]) + '</span>' + badges + '</span></button>';
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
      case 'conv': return f.conv === 'yes' ? 'Met aanvraag' : 'Zonder aanvraag';
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
      +   seg('conv', 'Aanvraag', [['all', 'Alle'], ['yes', 'Met aanvraag'], ['no', 'Zonder']],
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
  function sentence(n) {
    var f = st.f, bits = [];
    if (f.who === 'anon') bits.push('anonieme'); else if (f.who === 'known') bits.push('gekende'); else if (f.who === 'lead') bits.push('aan een lead gekoppelde');
    if (f.visit === 'new') bits.push('nieuwe'); else if (f.visit === 'return') bits.push('terugkerende');
    var s = nf(n) + ' ' + bits.join(', ') + (bits.length ? ' ' : '') + 'bezoeken'
      + (f.purpose === 'prospect' ? ' van prospecten' : f.purpose === 'customer' ? ' van klanten' : '')
      + ' in de ' + PERIODS[st.period];
    var w = [];
    if (f.site !== null) w.push('op ' + d('site', f.site));
    if (f.ch !== null) w.push('via ' + d('ch', f.ch));
    if (f.det !== null) w.push('(' + d('det', f.det) + ')');
    if (f.land !== null) w.push('die begonnen op ' + short(pageName(f.land), 40));
    if (f.visited !== null) w.push('die ' + short(pageName(f.visited), 40) + ' bekeken');
    if (f.dev !== null) w.push('op ' + (DEV_LABELS[d('dev', f.dev)] || d('dev', f.dev)).toLowerCase());
    if (f.conv === 'yes') w.push('met een aanvraag'); else if (f.conv === 'no') w.push('zonder aanvraag');
    return s + (w.length ? ' ' + w.join(' ') : '') + '.';
  }

  // ── Alles tekenen ──────────────────────────────────────────────────────────

  function render() {
    if (!st.data) return;
    var p = split();
    renderFilters();
    $('bhSentence').textContent = sentence(p.cur.length);
    $('bhVisited').innerHTML = '';
    renderSummary(p.cur, p.prev);
    renderTrend(p.cur, p.prev);
    renderFlow(p.cur);
    renderPaths(p.cur);
    renderPages(p.cur);
    renderSessions(p.cur);
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
    $('bhExcluded').textContent = excluded;
    $('bhNote').innerHTML = notes.map(esc).join('<br>');
    icons();
  }

  async function load() {
    if (st.loading) return;
    st.loading = true;
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
      // Een filter op een waarde die in de nieuwe periode niet bestaat, zou alles leeg maken.
      ['det', 'land', 'visited'].forEach(function (k) { st.f[k] = null; });
      st.pins = {};
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
    if (a === 'seg') { st.f[el.dataset.key] = v; }
    else if (a === 'filter') { var k = el.dataset.key, n = Number(v); st.f[k] = st.f[k] === n ? null : n; }
    else if (a === 'reset') { st.f = Object.assign({}, DEFAULTS); st.pins = {}; }
    else if (a === 'clear') { st.f[el.dataset.key] = DEFAULTS[el.dataset.key]; if (el.dataset.key === 'ch') st.f.det = null; }
    else if (a === 'site') { st.f.site = v === '' ? null : Number(v); }
    else if (a === 'pin') { var s = el.dataset.step, pg = Number(el.dataset.page); if (st.pins[s] === pg) delete st.pins[s]; else st.pins[s] = pg; }
    else if (a === 'pin-path') { st.pins = {}; el.dataset.path.split(',').forEach(function (x, i) { st.pins[i] = Number(x); }); }
    else if (a === 'unpin') { delete st.pins[el.dataset.step]; }
    else if (a === 'unpin-all') { st.pins = {}; }
    else if (a === 'metric') { st.metric = v; }
    else if (a === 'trend-table') { st.showTable = !st.showTable; }
    else if (a === 'sort') { var key = el.dataset.key; st.sort = { key: key, dir: st.sort.key === key ? -st.sort.dir : (key === 'name' ? 1 : -1) }; }
    else if (a === 'more-pages') { st.pageLimit += 30; }
    else if (a === 'visitor') { if (window.WebGedrag) window.WebGedrag.open('visitor', el.dataset.uuid); return; }
    else return;
    render();
  });

  document.addEventListener('change', function (e) {
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

  window.WebGedragBehaviour = { load: function () { if (!st.data) load(); } };
})();
