/**
 * Gedeelde bouwstenen voor de tabbladen Verkoop (dashboards-sales.js) en
 * Targets (dashboards-targets.js): opmaak van getallen, de filterknoppen en
 * kerncijfers in de stijl van Webgedrag, een mini-verloop, de arcering voor
 * minder betrouwbare periodes, en het venster "wat zit hierachter".
 *
 * window.OMDash. Laadt de verkoopfeiten één keer voor beide tabbladen.
 */
(function () {
  'use strict';

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nf(n, d) { return (Number(n) || 0).toLocaleString('nl-BE', { maximumFractionDigits: d === undefined ? 0 : d, minimumFractionDigits: 0 }); }
  /** € 123.769 of, kort, € 123,8K. */
  function eur(n, short) {
    n = Number(n) || 0;
    if (short && Math.abs(n) >= 10000) return '€ ' + nf(n / 1000, 1) + 'K';
    return '€ ' + nf(n, Math.abs(n) < 100 && n % 1 ? 2 : 0);
  }
  function pct(a, b) { return b > 0 ? a / b * 100 : null; }
  function pctTxt(p, d) { return p === null || p === undefined || !isFinite(p) ? '—' : nf(p, d === undefined ? (Math.abs(p) < 10 ? 1 : 0) : d) + '%'; }
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  function $(id) { return document.getElementById(id); }

  // ── Datums (alles als 'YYYY-MM-DD', Brussel) ───────────────────────────────
  var fmtBru = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
  function today() { return fmtBru.format(new Date()); }
  function addDays(iso, n) { return new Date(Date.parse(iso) + n * 86400e3).toISOString().slice(0, 10); }
  function addMonths(iso, n) {
    var y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + n, d = Number(iso.slice(8, 10)) || 1;
    var t = new Date(Date.UTC(y, m, 1));
    var last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(d, last));
    return t.toISOString().slice(0, 10);
  }
  function monthOf(iso) { return iso ? iso.slice(0, 7) + '-01' : null; }
  function monthEnd(m) { return addDays(addMonths(m, 1), -1); }
  /** Alle maanden (YYYY-MM-01) van `from` t.e.m. `to`. */
  function months(from, to) {
    var out = [], m = monthOf(from), last = monthOf(to);
    while (m <= last) { out.push(m); m = addMonths(m, 1); }
    return out;
  }
  var MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function monthLabel(m, long) { return MONTHS_NL[Number(m.slice(5, 7)) - 1] + (long ? ' ' + m.slice(0, 4) : " '" + m.slice(2, 4)); }
  function dayLabel(iso) {
    if (!iso) return '—';
    return Number(iso.slice(8, 10)) + ' ' + MONTHS_NL[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
  }
  function fyStart(iso, startMonth) {
    var y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
    return (m >= startMonth ? y : y - 1) + '-' + String(startMonth).padStart(2, '0') + '-01';
  }
  function fyLabel(startIso) { return 'boekjaar ' + monthLabel(startIso, true) + ' – ' + monthLabel(monthOf(addMonths(startIso, 11)), true); }

  // ── Kleuren (canvas kent geen var(); daisyUI 4 bewaart "L C H") ──────────
  function cssVar(name) { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (_) { return ''; } }
  function themeColor(varName, alpha) {
    var v = cssVar(varName || '--p');
    if (!v) return alpha === undefined ? '#2563eb' : 'rgba(37,99,235,' + alpha + ')';
    return 'oklch(' + v + (alpha === undefined ? '' : ' / ' + alpha) + ')';
  }
  var C = {
    primary: function (a) { return themeColor('--p', a); },
    good: function (a) { return themeColor('--su', a); },
    bad: function (a) { return themeColor('--er', a); },
    warn: function (a) { return themeColor('--wa', a); },
    info: function (a) { return themeColor('--in', a); },
    muted: function (a) { return themeColor('--bc', a === undefined ? 0.35 : a); }
  };
  // Reeksen in de kleuren van het THEMA (primair, secundair, accent, info, ...): zo
  // volgen de grafieken het daisyUI-thema, ook donker, net als in Webgedrag.
  var PALETTE = ['--p', '--s', '--a', '--in', '--su', '--wa', '--er', '--n'];
  function palette(i, alpha) { return themeColor(PALETTE[i % PALETTE.length], alpha); }
  var REF = '#94a3b8'; // vergelijkingslijn (vorige periode, target): grijs, zoals in Webgedrag
  function ink() { try { return getComputedStyle(document.body).color || '#374151'; } catch (_) { return '#374151'; } }
  /** Verloop van boven naar onder in een kleur (functie alpha -> kleur), als Chart.js-scriptable. */
  function gradient(colorFn, top, bottom) {
    return function (context) {
      var ch = context.chart, area = ch.chartArea;
      if (!area) return colorFn(top);
      var g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, colorFn(top));
      g.addColorStop(1, colorFn(bottom));
      return g;
    };
  }
  function colorFnOf(c) { return typeof c === 'function' ? c : typeof c === 'number' ? function (a) { return palette(c, a); } : function (a) { return themeColor(c, a); }; }
  /** Vlak onder een lijn, zoals de trend in Webgedrag. `c` = paletindex, CSS-variabele of functie. */
  function area(label, data, c, extra) {
    var f = colorFnOf(c);
    return Object.assign({ label: label, data: data, borderColor: f(), backgroundColor: gradient(f, 0.35, 0), fill: true, borderWidth: 2,
      tension: 0.3, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: f(), spanGaps: true }, extra || {});
  }
  /** Staven met een zacht verloop. */
  function bars(label, data, c, extra) {
    var f = colorFnOf(c);
    return Object.assign({ label: label, data: data, backgroundColor: gradient(f, 0.9, 0.45), hoverBackgroundColor: f(0.95),
      borderRadius: 4, borderSkipped: false, maxBarThickness: 34 }, extra || {});
  }
  /** Vergelijkings- of targetlijn: grijs, gestippeld. */
  function refLine(label, data, extra) {
    return Object.assign({ type: 'line', label: label, data: data, borderColor: REF, borderWidth: 1.5, borderDash: [5, 4], tension: 0.3,
      pointRadius: 0, pointHoverRadius: 4, fill: false, spanGaps: true }, extra || {});
  }

  // ── Filterbediening (zelfde vorm als Webgedrag) ───────────────────────────
  function groupLabel(text, help) {
    return '<div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 mb-1 flex items-center gap-1">' + esc(text)
      + (help ? ' <span class="cursor-help normal-case font-normal tracking-normal" title="' + esc(help) + '" aria-label="' + esc(help) + '"><i data-lucide="info" class="w-3 h-3"></i></span>' : '')
      + '</div>';
  }
  /** Knoppenrij. `attr` = naam van het data-attribuut (bv. 'data-sl-action'). */
  function pills(attr, action, key, choices, current, side) {
    return '<div class="inline-flex flex-wrap rounded-lg bg-base-200 p-0.5 gap-0.5' + (side ? ' lg:flex lg:w-full' : '') + '" role="group">' + choices.map(function (c) {
      var on = String(current) === String(c[0]);
      return '<button type="button" aria-pressed="' + on + '" class="px-3 py-1 text-sm rounded-md transition-colors '
        + (side ? 'lg:flex-1 lg:px-2 lg:py-0.5 lg:text-xs lg:whitespace-nowrap ' : '')
        + (on ? 'bg-primary text-primary-content font-medium shadow-sm' : 'text-base-content/70 hover:bg-base-300/70 hover:text-base-content')
        + '" ' + attr + '="' + action + '"' + (key ? ' data-key="' + key + '"' : '') + ' data-value="' + esc(c[0]) + '"'
        + (c[2] ? ' title="' + esc(c[2]) + '"' : '') + '>' + esc(c[1]) + '</button>';
    }).join('') + '</div>';
  }
  /** Keuzelijst met tellingen; `opts` = [[waarde, naam, aantal]]. */
  function select(attrSel, key, label, opts, current, help) {
    return '<label class="block min-w-0">' + groupLabel(label, help)
      + '<select class="select select-bordered select-sm w-full lg:text-xs ' + (current !== null && current !== undefined && current !== '' ? 'border-primary bg-primary/5 font-medium' : '') + '" ' + attrSel + '="' + key + '">'
      + '<option value="">Alle</option>' + opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(current) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + (o[2] !== undefined ? ' (' + nf(o[2]) + ')' : '') + '</option>';
      }).join('') + '</select></label>';
  }

  // ── Mini-verloop (monotoon, schiet niet onder nul) ─────────────────────────
  var sparkId = 0;
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
      d += 'C' + f(p[i][0] + h) + ',' + f(p[i][1] + t[i] * h) + ' ' + f(p[i + 1][0] - h) + ',' + f(p[i + 1][1] - t[i + 1] * h) + ' ' + f(p[i + 1][0]) + ',' + f(p[i + 1][1]);
    }
    return d;
  }
  function sparkline(values) {
    var pts = values.map(function (v, i) { return [i, v]; }).filter(function (p) { return p[1] !== null && p[1] !== undefined && isFinite(p[1]); });
    if (pts.length < 2) return '';
    var w = 72, h = 24;
    var max = Math.max.apply(null, pts.map(function (p) { return p[1]; })), min = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    var n = values.length - 1 || 1, span = max - min || 1;
    var xy = pts.map(function (p) { return [p[0] / n * (w - 4) + 2, h - 3 - (p[1] - min) / span * (h - 6)]; });
    var line = smoothPath(xy);
    var area = line + 'L' + xy[xy.length - 1][0].toFixed(1) + ',' + (h - 1) + 'L' + xy[0][0].toFixed(1) + ',' + (h - 1) + 'Z';
    var id = 'omSpark' + (++sparkId), col = 'oklch(var(--p))';
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">'
      + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + col + ';stop-opacity:0.35"></stop>'
      + '<stop offset="1" style="stop-color:' + col + ';stop-opacity:0"></stop></linearGradient></defs>'
      + '<path d="' + area + '" fill="url(#' + id + ')"></path><path d="' + line + '" fill="none" style="stroke:' + col + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg>';
  }

  // ── Kerncijfers: tegel in een raster, lijstregel in de smalle kolom ────────
  var COMPACT = window.matchMedia ? window.matchMedia('(min-width: 1536px)') : null;
  function compact() { return !!(COMPACT && COMPACT.matches); }
  /**
   * @param {object} t {label, value, sub, delta, help, series, drill, attr}
   *   drill: waarde voor data-*-action="drill" + data-drill (opent de lijst erachter)
   */
  function tile(t) {
    var spark = t.series ? sparkline(t.series) : '';
    var drillAttrs = t.drill ? ' ' + t.attr + '="drill" data-drill="' + esc(t.drill) + '" role="button" tabindex="0" title="' + esc((t.help ? t.help + ' ' : '') + 'Klik voor de lijst erachter.') + '"' : (t.help ? ' title="' + esc(t.help) + '"' : '');
    if (compact()) {
      return '<div class="flex items-center gap-2 py-2 ' + (t.drill ? 'cursor-pointer om-hover rounded-md px-1 -mx-1' : '') + '"' + drillAttrs + '>'
        + '<div class="min-w-0 flex-1"><div class="text-xs text-base-content/60 truncate">' + esc(t.label) + '</div>'
        + '<div class="flex flex-wrap items-baseline gap-x-2"><span class="text-lg font-semibold leading-tight">' + t.value + '</span>'
        + (t.delta ? '<span class="leading-tight">' + t.delta + '</span>' : '') + '</div>'
        + (t.sub ? '<div class="text-[11px] text-base-content/50 leading-tight">' + t.sub + '</div>' : '') + '</div>'
        + (spark ? '<span class="shrink-0">' + spark + '</span>' : '') + '</div>';
    }
    return '<div class="relative rounded-xl border border-base-content/10 bg-base-100 p-4 ' + (t.drill ? 'cursor-pointer om-hover' : '') + '"' + drillAttrs + '>'
      + (spark ? '<span class="absolute top-2 right-2">' + spark + '</span>' : '')
      + '<div class="text-xs text-base-content/60 pr-20">' + esc(t.label) + '</div>'
      + '<div class="text-2xl font-semibold mt-1">' + t.value + '</div>'
      + '<div class="mt-1 min-h-[1rem]">' + (t.delta || '') + '</div>'
      + (t.sub ? '<div class="text-xs text-base-content/50">' + t.sub + '</div>' : '') + '</div>';
  }
  /** Verschil met de vorige, even lange periode. kind 'pct' = procentpunten. */
  function delta(cur, prev, upIsGood, kind) {
    if (cur === null || cur === undefined) return '';
    if (prev === null || prev === undefined) return '<span class="text-xs text-base-content/40">vorige periode: niets om mee te vergelijken</span>';
    var diff, txt;
    if (kind === 'pct') { diff = cur - prev; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 1) + ' ptn'; }
    else if (kind === 'abs') { diff = cur - prev; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff)); }
    else {
      if (!prev) return '<span class="text-xs text-base-content/40">vorige periode: 0</span>';
      diff = (cur - prev) / Math.abs(prev) * 100; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 0) + '%';
    }
    if (Math.abs(diff) < (kind === 'pct' ? 0.5 : kind === 'abs' ? 0.5 : 2)) return '<span class="text-xs text-base-content/50">gelijk aan vorige periode</span>';
    var good = (diff > 0) === upIsGood;
    return '<span class="text-xs font-medium ' + (good ? 'text-success' : 'text-error') + '">' + (diff > 0 ? '▲ ' : '▼ ') + txt + '</span><span class="text-xs text-base-content/50"> vs vorige</span>';
  }
  /** Rood < 80%, oranje 80-100%, groen >= 100% (zo stond het in Odoo-dashboard 19). */
  function achievedClass(p) {
    if (p === null || p === undefined || !isFinite(p)) return 'text-base-content/40';
    return p >= 100 ? 'text-success' : p >= 80 ? 'text-warning' : 'text-error';
  }
  function achievedBg(p) {
    if (p === null || p === undefined || !isFinite(p)) return '';
    return p >= 100 ? 'bg-success/15' : p >= 80 ? 'bg-warning/20' : 'bg-error/15';
  }

  // ── Chart.js ───────────────────────────────────────────────────────────────
  var charts = {};
  function chart(id, config) {
    var el = $(id);
    if (!el || !window.Chart) return null;
    if (charts[id]) charts[id].destroy();
    charts[id] = new window.Chart(el, config);
    return charts[id];
  }
  /** Arceert de eerste `n` emmers: de cijfers blijven staan (nooit weglaten), met een label. */
  function hatchPlugin(n, label) {
    return {
      id: 'omHatch',
      beforeDatasetsDraw: function (ch) {
        var area = ch.chartArea, x = ch.scales.x, total = ch.data.labels.length;
        if (!n || !area || !x || !total) return;
        var end = n >= total ? area.right : (x.getPixelForValue(n - 1) + x.getPixelForValue(n)) / 2;
        var c = document.createElement('canvas'); c.width = 8; c.height = 8;
        var g = c.getContext('2d'); g.strokeStyle = 'rgba(127,127,127,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
        var ctx = ch.ctx; ctx.save(); ctx.fillStyle = ctx.createPattern(c, 'repeat');
        ctx.fillRect(area.left, area.top, end - area.left, area.bottom - area.top);
        if (label && end - area.left > 80) { ctx.fillStyle = 'rgba(127,127,127,0.95)'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(label, area.left + 6, area.top + 4); }
        ctx.restore();
      }
    };
  }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function'; }
  function merge(a, b) {
    Object.keys(b || {}).forEach(function (k) { a[k] = isObj(a[k]) && isObj(b[k]) ? merge(Object.assign({}, a[k]), b[k]) : b[k]; });
    return a;
  }
  /** Dezelfde opmaak als de trend in Webgedrag: tekstkleur van het thema, lichte rasterlijnen, geen randen. */
  function baseOptions(extra) {
    var t = ink(), axis = function () { return { grid: { color: 'rgba(127,127,127,0.12)' }, border: { display: false }, ticks: { color: t, font: { size: 11 } } }; };
    var o = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', align: 'end', labels: { color: t, boxWidth: 12, boxHeight: 2, font: { size: 11 } } },
        tooltip: { padding: 8 }
      },
      scales: {
        x: merge(axis(), { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }),
        y: merge(axis(), { beginAtZero: true }),
        y1: merge(axis(), { display: false, position: 'right', grid: { display: false } })
      }
    };
    o = merge(o, extra || {});
    // Een rechteras verschijnt enkel als een reeks hem gebruikt.
    if (!(extra && extra.scales && extra.scales.y1)) delete o.scales.y1;
    return o;
  }

  // ── "Wat zit hierachter": één venster voor elke lijst ──────────────────────
  var ODOO = 'https://mymmo.odoo.com';
  function odooUrl(model, id) { return ODOO + '/web#id=' + id + '&model=' + model + '&view_type=form'; }
  function odooLink(model, id, label) {
    return '<a class="link link-hover inline-flex items-center gap-1" target="_blank" rel="noopener" href="' + esc(odooUrl(model, id)) + '">' + esc(label) + '<i data-lucide="external-link" class="w-3 h-3 opacity-60"></i></a>';
  }
  // ── Sorteren: een tekst zoals hij op het scherm staat omzetten naar iets vergelijkbaars ──
  var MON = { jan: 1, feb: 2, mrt: 3, apr: 4, mei: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };
  /** "10 jul 2026" -> datum, "€ 1.234,5" / "+12" / "84%" / "€ 3,4K" -> getal, anders tekst. Leeg en "—" sorteren achteraan. */
  function parseSort(t) {
    t = String(t || '').trim();
    if (!t || t === '—' || t === '-') return null;
    var m = t.match(/^(\d{1,2}) (jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\.? (\d{4})/i);
    if (m) return { d: m[3] + '-' + String(MON[m[2].toLowerCase()]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0') };
    m = t.match(/^(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\.? '?(\d{2,4})$/i);
    if (m) return { d: (m[2].length === 2 ? '20' + m[2] : m[2]) + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') + '-01' };
    var n = t.replace(/[€\s\u00a0]/g, '').replace(/^\+/, '').replace(/^[−–]/, '-');
    m = n.match(/^(-?)([\d.]+(?:,\d+)?)(K|%)?$/);
    if (m) {
      var v = Number(m[2].replace(/\./g, '').replace(',', '.'));
      if (isFinite(v)) return { n: (m[1] ? -1 : 1) * v * (m[3] === 'K' ? 1000 : 1) };
    }
    return { s: t.toLowerCase() };
  }
  function cmpSort(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a.n !== undefined && b.n !== undefined) return a.n - b.n;
    if (a.d !== undefined && b.d !== undefined) return a.d < b.d ? -1 : a.d > b.d ? 1 : 0;
    var x = a.s !== undefined ? a.s : String(a.n !== undefined ? a.n : a.d), y = b.s !== undefined ? b.s : String(b.n !== undefined ? b.n : b.d);
    return x.localeCompare(y, 'nl');
  }
  function textOf(html) {
    return String(html == null ? '' : html).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  }

  // Elke tabel met data-om-sortable: klik op een kolomkop sorteert (nog eens: omgekeerd).
  document.addEventListener('click', function (e) {
    var th = e.target.closest('table[data-om-sortable] thead th');
    if (!th || e.target.closest('a,button,input,select')) return;
    var table = th.closest('table'), tb = table.tBodies[0];
    if (!tb) return;
    var col = Array.prototype.indexOf.call(th.parentNode.children, th);
    var dir = table.dataset.omSortCol === String(col) && table.dataset.omSortDir === 'asc' ? 'desc' : 'asc';
    var rows = Array.prototype.slice.call(tb.rows);
    rows.sort(function (r1, r2) {
      var a = parseSort(r1.cells[col] ? r1.cells[col].textContent : ''), b = parseSort(r2.cells[col] ? r2.cells[col].textContent : '');
      var c = cmpSort(a, b);
      return a === null || b === null ? c : dir === 'asc' ? c : -c;
    });
    rows.forEach(function (r) { tb.appendChild(r); });
    table.dataset.omSortCol = String(col); table.dataset.omSortDir = dir;
    Array.prototype.forEach.call(th.parentNode.children, function (h) { var i = h.querySelector('.om-sort-ind'); if (i) i.remove(); });
    th.insertAdjacentHTML('beforeend', '<span class="om-sort-ind text-primary"> ' + (dir === 'asc' ? '▲' : '▼') + '</span>');
  });

  // ── "Wat zit hierachter": eerst het verloop in het groot, dan de records ────
  var dr = null;
  var SUM_COL = /ARR|MRR|Bedrag|Aantal|Δ|Kavels|Bank|Peppol|Leads|Won|≥/;
  /**
   * @param {string} title
   * @param {string} sub   uitleg: wat telt mee, wat niet
   * @param {string[]} head kolomkoppen
   * @param {Array<Array<string>>} rows  al opgemaakte HTML-cellen
   * @param {object} [opts]
   *   right: kolomindexen rechts uitgelijnd (en opgeteld in de voetregel)
   *   chart: {type:'bar'|'line', labels, data, label, fmt, selected, onPick(i), ref:{label, data}, note, stand}
   *          stand: de reeks is een STAND op het einde van de maand (ARR, actief), geen
   *          optelling: een maand kiezen toont dan de stand van toen, zonder kiezen die van vandaag.
   *   keep:  zoekterm, filters en sortering van de vorige lijst behouden (klik op een maand)
   *   why:   ["regel", ...] -- WAAROM deze records erin staan: de regels die de lijst
   *          bepalen, in mensentaal (HTML, de aanroeper escapet wat uit gegevens komt).
   *          Staat boven de grafiek. Elke rij hoort daarnaast een kolom "Waarom" te
   *          hebben met de gegevens die dat voor DIE rij staven (datums, order, lead).
   */
  function drill(title, sub, head, rows, opts) {
    opts = opts || {};
    var dlg = $('omDrill');
    if (!dlg) return;
    var prev = dr;
    dr = { head: head, right: opts.right || [], rows: rows.map(function (r) { return r.map(function (h) { var t = textOf(h); return { h: h, t: t, s: parseSort(t) }; }); }),
      sort: null, dir: 1, q: '', f: {}, chart: opts.chart || null };
    if (opts.keep && prev && prev.head.join('|') === head.join('|')) { dr.sort = prev.sort; dr.dir = prev.dir; dr.q = prev.q; dr.f = prev.f; }
    $('omDrillTitle').textContent = title;
    $('omDrillSub').innerHTML = sub || '';
    var why = $('omDrillWhy'), lines = opts.why || [];
    if (why) {
      why.classList.toggle('hidden', !lines.length);
      why.innerHTML = lines.length ? '<div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 mb-1 flex items-center gap-1"><i data-lucide="help-circle" class="w-3 h-3"></i> Waarom staan ze erin</div>'
        + '<ul class="list-disc pl-5 space-y-0.5 text-xs text-base-content/80">' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '';
    }
    renderDrillChart();
    renderDrillTools();
    renderDrillTable();
    icons();
    if (!dlg.open) dlg.showModal();
  }
  function renderDrillChart() {
    var wrap = $('omDrillChartWrap'), ch = dr.chart;
    if (!wrap) return;
    wrap.classList.toggle('hidden', !ch);
    if (!ch) return;
    var sel = ch.selected === undefined ? null : ch.selected;
    var fmt = ch.fmt || function (v) { return nf(v); };
    var main = ch.type === 'line'
      ? area(ch.label, ch.data, '--p', { pointRadius: ch.data.map(function (v, i) { return i === sel ? 6 : ch.onPick ? 3 : 0; }), pointHoverRadius: 7,
        pointBorderColor: getComputedStyle(document.body).backgroundColor || '#fff', pointBorderWidth: 2 })
      : bars(ch.label, ch.data, '--p', sel === null ? {} : { backgroundColor: function (cx) { return cx.dataIndex === sel ? C.primary(0.95) : C.primary(0.25); } });
    var sets = [main];
    if (ch.ref) sets.push(refLine(ch.ref.label, ch.ref.data));
    chart('omDrillCanvas', {
      type: ch.type === 'line' ? 'line' : 'bar',
      data: { labels: ch.labels, datasets: sets },
      options: baseOptions({
        scales: { y: { beginAtZero: ch.type !== 'line' || ch.zero !== false, ticks: { callback: function (v) { return fmt(v, true); } } } },
        plugins: { legend: { display: !!ch.ref }, tooltip: { callbacks: { label: function (cx) { return ' ' + cx.dataset.label + ': ' + (cx.parsed.y === null ? '—' : fmt(cx.parsed.y)); } } } },
        onClick: ch.onPick ? function (evt, els) { if (els.length) ch.onPick(els[0].index); } : undefined,
        onHover: ch.onPick ? function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } : undefined
      })
    });
    $('omDrillChartNote').innerHTML = (ch.note ? esc(ch.note) + ' ' : '')
      + (!ch.onPick ? '' : ch.stand
        ? (sel === null ? 'De lijst toont de stand van vandaag. Klik op een maand voor de stand op het einde van die maand.'
          : 'De lijst toont de stand op het einde van <strong>' + esc(ch.labels[sel]) + '</strong>. <button type="button" class="link" data-om-drill-all>Terug naar vandaag</button>')
        : (sel === null ? 'Klik op een maand om enkel die in de lijst te zien.'
          : 'De lijst toont enkel <strong>' + esc(ch.labels[sel]) + '</strong>. <button type="button" class="link" data-om-drill-all>Toon de hele periode</button>'));
  }
  /** Zoekveld + een keuzelijst per kolom met weinig verschillende waarden (licentie, klanttype, status, ...). */
  function renderDrillTools() {
    var tools = $('omDrillTools');
    if (!tools) return;
    var sel = dr.head.map(function (h, i) {
      if (i === 0) return '';
      var vals = {};
      dr.rows.forEach(function (r) { var c = r[i]; if (c && c.t && (!c.s || c.s.s !== undefined)) vals[c.t] = (vals[c.t] || 0) + 1; });
      var keys = Object.keys(vals);
      if (keys.length < 2 || keys.length > 25 || keys.length >= dr.rows.length) return '';
      keys.sort(function (a, b) { return vals[b] - vals[a]; });
      var cur = dr.f[i] || '';
      return '<label class="min-w-0"><span class="block text-[11px] text-base-content/60">' + esc(h) + '</span><select class="select select-bordered select-xs ' + (cur ? 'border-primary bg-primary/5' : '') + '" data-om-drill-f="' + i + '">'
        + '<option value="">Alle</option>' + keys.map(function (k) { return '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(k) + ' (' + vals[k] + ')</option>'; }).join('') + '</select></label>';
    }).join('');
    tools.innerHTML = '<label class="min-w-0"><span class="block text-[11px] text-base-content/60">Zoeken</span><input type="search" class="input input-bordered input-xs w-56" placeholder="Klant, order, …" data-om-drill-q value="' + esc(dr.q) + '"></label>'
      + sel + '<button type="button" class="btn btn-ghost btn-xs" data-om-drill-reset>Wissen</button>';
  }
  function drillRows() {
    var q = dr.q.toLowerCase();
    var out = dr.rows.filter(function (r) {
      if (q && !r.some(function (c) { return c.t.toLowerCase().indexOf(q) >= 0; })) return false;
      return Object.keys(dr.f).every(function (i) { return !dr.f[i] || (r[i] && r[i].t === dr.f[i]); });
    });
    if (dr.sort !== null) {
      var col = dr.sort;
      out = out.slice().sort(function (a, b) {
        var x = a[col] ? a[col].s : null, y = b[col] ? b[col].s : null, c = cmpSort(x, y);
        return x === null || y === null ? c : c * dr.dir;
      });
    }
    return out;
  }
  function renderDrillTable() {
    var rows = drillRows(), right = dr.right;
    var sums = dr.head.map(function (h, i) {
      if (right.indexOf(i) < 0 || !SUM_COL.test(h) || /Dagen|graad|%/.test(h)) return null;
      var s = 0, ok = false;
      rows.forEach(function (r) { var v = r[i] && r[i].s; if (v && v.n !== undefined) { s += v.n; ok = true; } });
      return ok ? s : null;
    });
    var isEur = function (i) { return rows.some(function (r) { return r[i] && r[i].t.indexOf('€') >= 0; }); };
    $('omDrillBody').innerHTML = rows.length
      ? '<table class="table table-sm"><thead class="sticky top-0 bg-base-100 z-10"><tr>' + dr.head.map(function (h, i) {
          var on = dr.sort === i;
          return '<th class="cursor-pointer select-none whitespace-nowrap ' + (right.indexOf(i) >= 0 ? 'text-right' : '') + '" data-om-drill-sort="' + i + '" title="Sorteren">' + esc(h)
            + (on ? '<span class="text-primary"> ' + (dr.dir === 1 ? '▲' : '▼') + '</span>' : '<span class="opacity-30"> ↕</span>') + '</th>';
        }).join('') + '</tr></thead><tbody>'
        + rows.map(function (r) { return '<tr class="om-hover">' + r.map(function (c, i) { return '<td class="' + (right.indexOf(i) >= 0 ? 'text-right tabular-nums' : '') + '">' + c.h + '</td>'; }).join('') + '</tr>'; }).join('')
        + '</tbody>' + (sums.some(function (s) { return s !== null; })
          ? '<tfoot><tr>' + dr.head.map(function (h, i) { return '<td class="' + (right.indexOf(i) >= 0 ? 'text-right tabular-nums' : '') + ' font-semibold">' + (i === 0 ? 'Totaal' : sums[i] === null ? '' : isEur(i) ? eur(sums[i]) : nf(sums[i], 2)) + '</td>'; }).join('') + '</tr></tfoot>' : '')
        + '</table>'
      : '<p class="text-sm text-base-content/60 py-4">Niets in deze selectie.</p>';
    $('omDrillCount').textContent = nf(rows.length) + (rows.length !== dr.rows.length ? ' van ' + nf(dr.rows.length) : '') + ' ' + (dr.rows.length === 1 ? 'rij' : 'rijen');
    icons();
  }
  document.addEventListener('input', function (e) {
    if (!dr || !e.target.matches('[data-om-drill-q]')) return;
    dr.q = e.target.value; renderDrillTable();
  });
  document.addEventListener('change', function (e) {
    if (!dr || !e.target.matches('[data-om-drill-f]')) return;
    dr.f[e.target.getAttribute('data-om-drill-f')] = e.target.value;
    e.target.classList.toggle('border-primary', !!e.target.value); e.target.classList.toggle('bg-primary/5', !!e.target.value);
    renderDrillTable();
  });
  document.addEventListener('click', function (e) {
    if (!dr) return;
    var th = e.target.closest('[data-om-drill-sort]');
    if (th) { var i = Number(th.getAttribute('data-om-drill-sort')); if (dr.sort === i) dr.dir = -dr.dir; else { dr.sort = i; dr.dir = dr.right.indexOf(i) >= 0 ? -1 : 1; } renderDrillTable(); return; }
    if (e.target.closest('[data-om-drill-reset]')) { dr.q = ''; dr.f = {}; dr.sort = null; renderDrillTools(); renderDrillTable(); return; }
    if (e.target.closest('[data-om-drill-all]') && dr.chart && dr.chart.onPick) dr.chart.onPick(dr.chart.selected);
  });

  // ── De gedeelde aanvraag ──────────────────────────────────────────────────
  var salesPromise = null;
  async function api(path, opts) {
    var res = await fetch(path, Object.assign({ credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' } }, opts || {}));
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet ingelogd'); }
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok || body.success === false) throw new Error(body.error || ('HTTP ' + res.status));
    return body.data;
  }
  function loadSales(force) {
    if (!salesPromise || force) salesPromise = api('/dashboards/api/sales');
    return salesPromise;
  }

  /** Statusregel boven een tabblad: hoe vers, en wat er misliep bij de laatste sync. */
  function freshness(data) {
    if (!data || !data.configured) return '';
    var m = data.meta || {}, bits = [];
    if (m.syncedAt) {
      var d = new Date(m.syncedAt.replace(' ', 'T') + 'Z');
      bits.push('Gegevens uit Odoo van ' + d.toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '.');
    } else bits.push('Nog geen sync gelopen.');
    var errs = (m.syncErrors || []);
    return '<div class="text-xs text-base-content/50 flex flex-wrap items-center gap-2">' + esc(bits.join(' '))
      + (errs.length ? ' <span class="text-error" title="' + esc(errs.map(function (e) { return e.model + ': ' + e.error; }).join('\n')) + '">' + errs.length + ' model(len) gaven een fout bij de laatste sync.</span>' : '')
      + (data.me && data.me.is_admin ? ' <button type="button" class="btn btn-ghost btn-xs" data-om-sync title="Nu opnieuw ophalen uit Odoo">Nu synchroniseren</button>' : '')
      + '</div>';
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-om-sync]');
    if (!b) return;
    b.disabled = true; b.textContent = 'Bezig…';
    try {
      await api('/dashboards/api/sales/sync', { method: 'POST', body: JSON.stringify({ full: e.shiftKey }) });
      await loadSales(true);
      document.dispatchEvent(new CustomEvent('om:sales-reloaded'));
    } catch (err) { alert('Synchroniseren mislukt: ' + err.message); }
    b.disabled = false; b.textContent = 'Nu synchroniseren';
  });

  window.OMDash = {
    esc: esc, nf: nf, eur: eur, pct: pct, pctTxt: pctTxt, icons: icons, $: $,
    today: today, addDays: addDays, addMonths: addMonths, monthOf: monthOf, monthEnd: monthEnd, months: months, monthLabel: monthLabel, dayLabel: dayLabel,
    fyStart: fyStart, fyLabel: fyLabel,
    C: C, palette: palette, gradient: gradient, area: area, bars: bars, refLine: refLine, REF: REF, ink: ink, groupLabel: groupLabel, pills: pills, select: select, sparkline: sparkline, tile: tile, delta: delta, compact: compact, COMPACT: COMPACT,
    achievedClass: achievedClass, achievedBg: achievedBg,
    chart: chart, hatchPlugin: hatchPlugin, baseOptions: baseOptions,
    odooUrl: odooUrl, odooLink: odooLink, drill: drill, parseSort: parseSort, api: api, loadSales: loadSales, freshness: freshness
  };
})();
