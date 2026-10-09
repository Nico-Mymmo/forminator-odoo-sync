/**
 * Gedeelde bouwstenen voor de tabbladen Verkoop (dashboards-sales.js), Targets
 * (dashboards-targets.js) en Aanvragen (dashboard-aanvragen/aanvragen.js): het
 * geraamte met drie kolommen, opmaak van getallen, de filterknoppen en
 * kerncijfers in de stijl van Webgedrag, een mini-verloop, de kleuren, de
 * arcering voor minder betrouwbare periodes, en het venster "wat zit hierachter".
 *
 * VANGRAIL: Aanvragen is het terrein van David (src/modules/dashboards/lib/
 * aanvragen/CLAUDE.md). Wat hier staat, bepaalt hoe dat tabblad eruitziet, en
 * wijzigt dus enkel met een review van Nico (.github/CODEOWNERS).
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
  /**
   * EEN kleur per kanaal (merk + kanaal, src/modules/dashboards/lib/lead-kanalen.js), voor
   * Aanvragen en voor "Kanaal (lead)" in Verkoop. Per merk een kleurfamilie: blauw voor
   * Syndicoach, groen voor OpenVME, grijs voor wat geen merk heeft. Tot 2026-10-09 stond
   * dit als BRAND_COLORS in dashboards.js. Een kanaal erbij = een kleur hier.
   */
  var KANAAL_KLEUREN = {
    syndicoach_vme_check: '#1d4ed8',
    syndicoach_meta_lead_ad: '#3b82f6',
    syndicoach_contact_form: '#60a5fa',
    syndicoach_syndicus_kiezen: '#93c5fd',
    syndicoach_telefoon: '#1e3a8a',
    syndicoach_email: '#38bdf8',
    syndicoach_overig: '#bfdbfe',
    openvme_contact_form: '#0d9488',
    openvme_opstarters: '#059669',
    openvme_telefoon: '#065f46',
    openvme_email: '#2dd4bf',
    openvme_meta_lead_ad: '#10b981',
    openvme_overig: '#99f6e4',
    manual_overig: '#94a3b8'
  };
  /** De kleur van een kanaal als functie (alpha -> kleur), zoals area() en bars() die willen. */
  function kanaalKleur(key) {
    var hex = KANAAL_KLEUREN[key] || REF, n = parseInt(hex.slice(1), 16);
    return function (a) { return a === undefined ? hex : 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  }
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
    var f = colorFnOf(c), gewoon = gradient(f, 0.35, 0), sterk = gradient(f, 0.65, 0.25), zwak = gradient(f, 0.1, 0);
    // Wijst de muis een vlak aan (bandHoverPlugin), dan licht DAT vlak op en vallen de andere
    // terug: 1 = aangewezen, -1 = een ander, 0 = niets aangewezen (of geen gestapelde grafiek).
    var stand = bandStand;
    return Object.assign({ label: label, data: data, fill: true, tension: 0.3, pointRadius: 0, spanGaps: true,
      backgroundColor: function (ctx) { var s = stand(ctx); return (s > 0 ? sterk : s < 0 ? zwak : gewoon)(ctx); },
      borderColor: function (ctx) { return stand(ctx) < 0 ? f(0.35) : f(); },
      borderWidth: function (ctx) { return stand(ctx) > 0 ? 3 : 2; },
      // Het bolletje heeft de kleur van zijn lijn. Zonder pointHover*Color leidt Chart.js
      // de hoverkleur af van het verloop van het vlak, en dan is elk bolletje zwart.
      pointBackgroundColor: f(), pointBorderColor: f(), pointHoverBackgroundColor: f(), pointHoverBorderColor: pageBg(), pointHoverBorderWidth: 2,
      // Wijst de muis een vlak aan (bandHover hieronder), dan is dat bolletje groot en de rest klein.
      pointHoverRadius: function (ctx) { var b = ctx.chart.$omBand; return b === undefined || b < 0 ? 5 : b === ctx.datasetIndex ? 7 : 3; } }, extra || {});
  }
  function pageBg() { try { return getComputedStyle(document.body).backgroundColor || '#fff'; } catch (_) { return '#fff'; } }
  /** 1 = dit vlak of stuk wordt aangewezen, -1 = een ander wel, 0 = niets (of geen bandHoverPlugin). */
  function bandStand(ctx) { var b = ctx.chart.$omBand; return b === undefined || b < 0 ? 0 : b === ctx.datasetIndex ? 1 : -1; }

  /**
   * Gestapelde vlakken waarin je er een aanklikt: welk vlak ligt onder (x, y)?
   * band = datasetindex, -1 = boven de stapel of buiten de grafiek. Verborgen reeksen
   * en vergelijkingslijnen (omRef) tellen niet mee. EEN berekening voor het oplichten
   * en voor de klik, zodat wat oplicht ook is wat opent.
   */
  function bandAt(ch, x, y) {
    if (ch.config.type === 'bar') return barAt(ch, x, y);
    var xs = ch.scales.x, ys = ch.scales.y, a = ch.chartArea, n = ch.data.labels.length;
    if (!xs || !ys || !a || !n || x < a.left || x > a.right || y < a.top || y > a.bottom) return { i: -1, band: -1 };
    var i = Math.max(0, Math.min(n - 1, Math.round(xs.getValueForPixel(x))));
    var v = ys.getValueForPixel(y), cum = 0, sets = ch.data.datasets;
    for (var k = 0; k < sets.length; k++) {
      if (sets[k].omRef || !ch.isDatasetVisible(k)) continue;
      var val = sets[k].data[i];
      if (val === null || val === undefined) continue;
      cum += val;
      if (v <= cum) return { i: i, band: k };
    }
    return { i: i, band: -1 };
  }
  /**
   * Hetzelfde voor gestapelde STAVEN (boven en onder nul): welk stuk ligt onder (x, y)?
   * Een dun stuk krijgt 6 px speling, anders is het niet aan te wijzen. Naast de staaf
   * (wel in die maand) = band -1: dan gaat het over de hele maand.
   */
  function barAt(ch, x, y) {
    var xs = ch.scales.x, a = ch.chartArea, n = ch.data.labels.length;
    if (!xs || !a || !n || x < a.left || x > a.right || y < a.top || y > a.bottom) return { i: -1, band: -1 };
    var i = Math.max(0, Math.min(n - 1, Math.round(xs.getValueForPixel(x)))), best = -1, afstand = Infinity;
    ch.data.datasets.forEach(function (ds, k) {
      if (ds.omRef || ds.type === 'line' || !ch.isDatasetVisible(k)) return;
      var v = ds.data[i], el = ch.getDatasetMeta(k).data[i];
      if (!el || !v) return;
      var p = el.getProps(['x', 'y', 'base', 'width'], true);
      if (Math.abs(x - p.x) > p.width / 2 + 4) return;
      var top = Math.min(p.y, p.base), bot = Math.max(p.y, p.base), d = y < top ? top - y : y > bot ? y - bot : 0;
      if (d < afstand) { afstand = d; best = k; }
    });
    return { i: i, band: afstand <= 6 ? best : -1 };
  }
  /**
   * Plugin: zet chart.$omBand VOOR Chart.js de hoverstijl bepaalt (anders loopt het een
   * beweging achter), en tekent opnieuw zodra het aangewezen vlak verandert. Dat laatste
   * doet Chart.js zelf niet: blijf je in dezelfde maand en schuif je op of neer, dan
   * veranderen de actieve punten niet, dus kwam er geen nieuwe tooltip en geen nieuwe
   * stijl -- het oplichten volgde de muis niet. update() speelt de laatste muisbeweging
   * opnieuw af; $omBezig houdt die herhaling uit een kringetje.
   */
  var bandHoverPlugin = {
    id: 'omBandHover',
    beforeEvent: function (ch, args) {
      var e = args.event, b;
      if (e.type === 'mouseout') b = -1;
      else if (e.type === 'mousemove' || e.type === 'click') b = bandAt(ch, e.x, e.y).band;
      else return;
      if (b !== ch.$omBand) { ch.$omBand = b; ch.$omNieuw = true; }
    },
    afterEvent: function (ch) {
      if (!ch.$omNieuw || ch.$omBezig) return;
      ch.$omNieuw = false;
      ch.$omBezig = true;
      try { ch.update('none'); } finally { ch.$omBezig = false; }
    }
  };
  /** Tooltip bij aangewezen vlakken: die regel helder, de rest gedimd, en onderaan wat een klik opent. */
  var bandTooltip = {
    labelTextColor: function (c) { var b = c.chart.$omBand; return b === undefined || b < 0 || b === c.datasetIndex ? '#fff' : 'rgba(255,255,255,0.5)'; },
    footer: function (items) {
      var ch = items.length ? items[0].chart : null;
      if (!ch) return '';
      return ch.$omBand >= 0 ? 'Klik: lijst van ' + ch.data.datasets[ch.$omBand].label : 'Klik: alles van die maand';
    }
  };
  /** Staven met een zacht verloop. */
  function bars(label, data, c, extra) {
    var f = colorFnOf(c), gewoon = gradient(f, 0.9, 0.45);
    // Zelfde oplichten als bij area(): het aangewezen stuk vol, de andere bleek. Ook de
    // hoverkleur: bij mode 'index' zijn alle stukken van die maand "actief".
    return Object.assign({ label: label, data: data,
      backgroundColor: function (ctx) { var s = bandStand(ctx); return s > 0 ? f(0.95) : s < 0 ? f(0.18) : gewoon(ctx); },
      hoverBackgroundColor: function (ctx) { var s = bandStand(ctx); return s > 0 ? f(1) : s < 0 ? f(0.22) : f(0.95); },
      borderRadius: 4, borderSkipped: false, maxBarThickness: 34 }, extra || {});
  }
  /** Vergelijkings- of targetlijn: grijs, gestippeld. */
  function refLine(label, data, extra) {
    return Object.assign({ type: 'line', label: label, data: data, borderColor: REF, borderWidth: 1.5, borderDash: [5, 4], tension: 0.3,
      pointRadius: 0, pointHoverRadius: 4, fill: false, spanGaps: true, omRef: true }, extra || {});
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
  /**
   * @param {string} [vs] waarmee vergeleken wordt, voluit: "t.o.v. 31 dec 2025" (een stand) of
   *   "t.o.v. 1 jan – 6 okt 2025" (een periode). Zonder: "vs vorige" -- maar dan weet niemand
   *   of dat een maand, een kwartaal of een jaar is. Geef het dus altijd mee.
   */
  function delta(cur, prev, upIsGood, kind, vs) {
    if (cur === null || cur === undefined) return '';
    if (prev === null || prev === undefined) return '<span class="text-xs text-base-content/40">' + esc(vs || 'vorige periode') + ': niets om mee te vergelijken</span>';
    var diff, txt;
    if (kind === 'pct') { diff = cur - prev; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 1) + ' ptn'; }
    else if (kind === 'abs') { diff = cur - prev; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff)); }
    else {
      if (!prev) return '<span class="text-xs text-base-content/40">' + esc(vs || 'vorige periode') + ': 0</span>';
      diff = (cur - prev) / Math.abs(prev) * 100; txt = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff), 0) + '%';
    }
    if (Math.abs(diff) < (kind === 'pct' ? 0.5 : kind === 'abs' ? 0.5 : 2)) return '<span class="text-xs text-base-content/50">gelijk, ' + esc(vs || 'vs vorige') + '</span>';
    var good = (diff > 0) === upIsGood;
    return '<span class="text-xs font-medium ' + (good ? 'text-success' : 'text-error') + '">' + (diff > 0 ? '▲ ' : '▼ ') + txt + '</span><span class="text-xs text-base-content/50"> ' + esc(vs || 'vs vorige') + '</span>';
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

  // ── Het geraamte: drie kolommen ────────────────────────────────────────────
  /**
   * EEN geraamte voor Verkoop, Targets en Aanvragen (Marketing heeft het in de HTML,
   * met dezelfde klassen): links "Je bekijkt" en de filters, in het midden de kaarten,
   * rechts de kerncijfers. Drie kolommen vanaf 2xl, twee vanaf lg (de kerncijfers staan
   * dan bovenaan het midden), een op een telefoon. Beide zijkolommen plakken (sticky) en
   * schuiven zelf als ze niet passen.
   *
   * Ids in het geraamte: <prefix>Status, -Notice, -Sentence, -Filters en -Kpis. Vul ze met
   * status(), melding(), zin(), filters() en kpis() hieronder.
   *
   * @param {object} o
   *   prefix   voorvoegsel van de ids ('sl', 'tg', 'av')
   *   titel, uitleg  de kop van het tabblad (tekst, wordt ge-escaped)
   *   icoon    lucide-icoon bij "Je bekijkt" (standaard filter)
   *   zinExtra HTML onder de zin in "Je bekijkt" (bv. wie er buiten valt)
   *   kpiTitel opschrift boven de kerncijfers (standaard Kerncijfers)
   *   midden   HTML van de middenkolom: kaart() na kaart()
   *   vensters HTML van de <dialog>s van het tabblad (achteraan, binnen het tabblad)
   * @returns {string} HTML voor het paneel van het tabblad
   */
  function geraamte(o) {
    var p = o.prefix;
    return '<div class="flex flex-wrap items-end justify-between gap-3 mb-4">'
      + '<div><h1 class="text-2xl font-bold">' + esc(o.titel) + '</h1><p class="text-sm text-base-content/60">' + esc(o.uitleg) + '</p></div>'
      + '<div id="' + p + 'Status"></div></div>'
      + '<div id="' + p + 'Notice" class="mb-3"></div>'
      + '<div class="grid grid-cols-1 gap-5 items-start lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">'
      + '<aside class="om-scroll space-y-3 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[calc(48px+1rem)] lg:max-h-[calc(100vh-48px-2rem)] lg:overflow-y-auto">'
      +   '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-3 space-y-2">'
      +     '<div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 flex items-center gap-1"><i data-lucide="' + esc(o.icoon || 'filter') + '" class="w-3 h-3"></i> Je bekijkt</div>'
      +     '<p id="' + p + 'Sentence" class="text-sm"></p>' + (o.zinExtra || '') + '</div>'
      +   '<div id="' + p + 'Filters"></div></aside>'
      + '<aside class="om-scroll min-w-0 lg:col-start-2 lg:row-start-1 2xl:col-start-3 2xl:sticky 2xl:top-[calc(48px+1rem)] 2xl:max-h-[calc(100vh-48px-2rem)] 2xl:overflow-y-auto">'
      +   '<div class="rounded-2xl bg-base-100 border border-base-content/10 p-5 2xl:p-3">'
      +     '<div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">' + esc(o.kpiTitel || 'Kerncijfers') + '</div>'
      +     '<div id="' + p + 'Kpis" class="grid grid-cols-2 md:grid-cols-3 gap-3 2xl:grid-cols-1 2xl:gap-0 2xl:divide-y om-lijnen"></div></div></aside>'
      + '<div class="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2 2xl:row-start-1">' + (o.midden || '') + '</div></div>'
      + (o.vensters || '');
  }
  /**
   * Een kaart in de middenkolom. `titel` en `uitleg` zijn HTML. Ids: <id>Card, <id>Title,
   * <id>Sub, <id>Controls (knoppen rechtsboven) en <id> (de inhoud).
   */
  function kaart(id, titel, uitleg, extra) {
    return '<div class="rounded-2xl bg-base-100 border border-base-content/10 p-5" id="' + id + 'Card">'
      + '<div class="flex flex-wrap items-start justify-between gap-2 mb-3"><div><h2 class="font-semibold" id="' + id + 'Title">' + titel + '</h2>'
      + (uitleg ? '<p class="text-xs text-base-content/50 mt-0.5" id="' + id + 'Sub">' + uitleg + '</p>' : '') + '</div>'
      + '<div id="' + id + 'Controls" class="flex flex-wrap items-center gap-2">' + (extra || '') + '</div></div>'
      + '<div id="' + id + '"></div></div>';
  }
  /** Rechtsboven het tabblad: hoe vers, laden, een knop. */
  function status(prefix, html) { var el = $(prefix + 'Status'); if (el) el.innerHTML = html || ''; }
  /** Boven de kolommen: een melding (alert) of niets. */
  function melding(prefix, html) { var el = $(prefix + 'Notice'); if (el) el.innerHTML = html || ''; }
  /** "Je bekijkt": EEN zin die zegt wat de cijfers zijn (tekst, geen HTML). */
  function zin(prefix, tekst) { var el = $(prefix + 'Sentence'); if (el) el.textContent = tekst || ''; }
  /** De filters in de linkerkolom: `groepen` = HTML per groep (groupLabel + pills of select). */
  function filters(prefix, groepen) {
    var el = $(prefix + 'Filters');
    if (el) el.innerHTML = '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-4 space-y-3 lg:p-3">' + groepen.join('') + '</div>';
  }
  /** De kerncijfers in de rechterkolom: `tegels` = objecten voor tile(), niet HTML. */
  function kpis(prefix, tegels) { var el = $(prefix + 'Kpis'); if (el) el.innerHTML = tegels.map(tile).join(''); }

  // ── Chart.js ───────────────────────────────────────────────────────────────
  var charts = {};
  /**
   * Tooltip-positie 'omZij': NAAST de aangewezen maand, bovenaan de grafiek, aan de kant
   * met de meeste ruimte. Gecentreerd op het punt lag de tooltip precies over het vlak
   * dat je aanwees.
   */
  function registreerZij() {
    var T = window.Chart && window.Chart.Tooltip;
    if (!T || !T.positioners || T.positioners.omZij) return;
    T.positioners.omZij = function (items) {
      if (!items.length) return false;
      var a = this.chart.chartArea, x = items[0].element.x, rechts = x < (a.left + a.right) / 2;
      return { x: x + (rechts ? 14 : -14), y: a.top, xAlign: rechts ? 'left' : 'right', yAlign: 'top' };
    };
  }
  function chart(id, config) {
    var el = $(id);
    if (!el || !window.Chart) return null;
    registreerZij();
    if (charts[id]) charts[id].destroy();
    // Wat iemand in de legende wegklikte, blijft weg na een hertekening (andere periode,
    // filter of maat) -- zolang die reeksen nog bestaan.
    var weg = verborgen[id];
    if (weg && config.data && config.data.datasets) {
      var labels = config.data.datasets.map(function (ds) { return ds.label; });
      var blijft = config.data.datasets.some(function (ds) { return !ds.omRef && !weg[ds.label]; });
      if (blijft) config.data.datasets.forEach(function (ds) { if (!ds.omRef && weg[ds.label]) ds.hidden = true; });
      else delete verborgen[id];
      if (!labels.length) delete verborgen[id];
    }
    charts[id] = new window.Chart(el, config);
    return charts[id];
  }
  var verborgen = {};
  /**
   * Klik op een item in de legende: eerst ENKEL dat item tonen; daarna klik je andere
   * erbij of weer weg. Valt het laatste weg, dan staat alles weer aan. Een
   * vergelijkingslijn ("Een jaar eerder", een target) gaat gewoon aan en uit.
   * Gebruik: options.plugins.legend.onClick = K.soloLegend.
   */
  function soloLegend(e, item, legend) {
    var ch = legend.chart, i = item.datasetIndex, sets = ch.data.datasets;
    if (sets[i].omRef) { ch.setDatasetVisibility(i, !ch.isDatasetVisible(i)); ch.update(); return; }
    var groep = sets.map(function (ds, k) { return ds.omRef ? -1 : k; }).filter(function (k) { return k >= 0; });
    var alles = groep.every(function (k) { return ch.isDatasetVisible(k); });
    if (alles) groep.forEach(function (k) { ch.setDatasetVisibility(k, k === i); });
    else if (ch.isDatasetVisible(i)) {
      ch.setDatasetVisibility(i, false);
      if (!groep.some(function (k) { return ch.isDatasetVisible(k); })) groep.forEach(function (k) { ch.setDatasetVisibility(k, true); });
    } else ch.setDatasetVisibility(i, true);
    ch.update();
    var weg = {};
    groep.forEach(function (k) { if (!ch.isDatasetVisible(k)) weg[sets[k].label] = 1; });
    if (Object.keys(weg).length) verborgen[ch.canvas.id] = weg; else delete verborgen[ch.canvas.id];
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
  /**
   * Klanttype als badge: in een lange lijst moeten de drie soorten klanten meteen uit
   * elkaar te houden zijn. Elk ander klanttype staat als gewone tekst.
   */
  var CT_KLEUR = { 'VME in advies': 'badge-info', 'VME in beheer': 'badge-secondary', 'Professionele syndicus': 'badge-accent' };
  function ctBadge(label) {
    if (!label) return '<span class="text-base-content/40">—</span>';
    return CT_KLEUR[label] ? '<span class="badge badge-sm badge-outline whitespace-nowrap ' + CT_KLEUR[label] + '">' + esc(label) + '</span>' : esc(label);
  }
  /** De adviserend expert; "Geen" in de woordenlijst = geen expert. */
  function expertCel(label) { return !label || label === 'Geen' ? '<span class="text-base-content/40">geen expert</span>' : esc(label); }
  /** main: dit is HET record van de rij; in een doorklik wordt dat de Odoo-knop achteraan (anders de eerste link). */
  function odooLink(model, id, label, main) {
    return '<a class="link link-hover inline-flex items-center gap-1"' + (main ? ' data-om-main' : '') + ' target="_blank" rel="noopener" href="' + esc(odooUrl(model, id)) + '">' + esc(label) + '<i data-lucide="external-link" class="w-3 h-3 opacity-60"></i></a>';
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
   *          bepalen, in gewone zinnen (HTML, de aanroeper escapet wat uit gegevens komt).
   *          Achter het vraagteken naast de titel. Elke rij hoort daarnaast een kolom
   *          "Waarom" te hebben (of "Waarom dit ...") met wat het voor DIE rij staaft:
   *          zo'n kolom komt NIET in de tabel maar achter een vraagteken achteraan de rij,
   *          in zinnen (<p> per zin). De Odoo-links in de cellen worden gewone tekst; er
   *          staat EEN Odoo-knop achteraan, naar de link met data-om-main, anders de eerste.
   *   chart.color: de kleur van het vlak in de hoofdgrafiek waarop geklikt werd (paletindex,
   *          CSS-variabele of functie, zoals bij area()); zonder = primair.
   */
  function drill(title, sub, head, rows, opts) {
    opts = opts || {};
    var dlg = $('omDrill');
    if (!dlg) return;
    var prev = dr;
    // Een kolom "Waarom..." komt niet in de tabel: die tekst drukte alles uiteen. Ze gaat
    // achter het vraagteken achteraan de rij (rowOf).
    var whyCols = [], vis = [];
    head.forEach(function (h, i) { (WHY_COL.test(h) ? whyCols : vis).push(i); });
    var visHead = vis.map(function (i) { return head[i]; });
    dr = { head: visHead, right: (opts.right || []).map(function (i) { return vis.indexOf(i); }).filter(function (i) { return i >= 0; }),
      rows: rows.map(function (r, k) { return rowOf(r, head, vis, whyCols, k); }),
      sort: null, dir: 1, q: '', f: {}, chart: opts.chart || null, rules: opts.why || [] };
    if (opts.keep && prev && prev.head.join('|') === visHead.join('|')) { dr.sort = prev.sort; dr.dir = prev.dir; dr.q = prev.q; dr.f = prev.f; }
    $('omDrillTitle').textContent = title;
    $('omDrillSub').innerHTML = sub || '';
    verbergTip();
    var wb = $('omDrillWhyBtn');
    if (wb) wb.classList.toggle('hidden', !dr.rules.length);
    renderDrillChart();
    renderDrillTools();
    renderDrillTable();
    // Opnieuw bovenaan beginnen: een vorige lijst kan ver naar beneden gescrold zijn.
    if (!opts.keep) { var box = dlg.querySelector('.modal-box'); if (box) box.scrollTop = 0; }
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
    // In de kleur van wat je in de hoofdgrafiek aanklikte; anders de primaire kleur.
    var kleur = ch.color === undefined || ch.color === null ? '--p' : ch.color, kf = colorFnOf(kleur);
    var main = ch.type === 'line'
      ? area(ch.label, ch.data, kleur, { pointRadius: ch.data.map(function (v, i) { return i === sel ? 6 : ch.onPick ? 3 : 0; }), pointHoverRadius: 7,
        pointBorderColor: getComputedStyle(document.body).backgroundColor || '#fff', pointBorderWidth: 2 })
      : bars(ch.label, ch.data, kleur, sel === null ? {} : { backgroundColor: function (cx) { return cx.dataIndex === sel ? kf(0.95) : kf(0.25); } });
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
  /**
   * Drie lagen plakken boven elkaar: de kop (titel + sluitkruisje), de filterbalk eronder
   * (--om-drill-balk) en de kolomkoppen met de totaalrij daaronder (--om-drill-stick).
   * De kop plakt met een negatieve top (over de opvulling van het venster); de andere
   * rekenen vanaf dezelfde lijn, dus die top telt mee.
   */
  function stickHoogte() {
    var kop = $('omDrillKop'), s = $('omDrillStick'), dlg = $('omDrill');
    if (!kop || !s || !dlg) return;
    var balk = kop.offsetHeight + (parseFloat(getComputedStyle(kop).top) || 0);
    dlg.style.setProperty('--om-drill-balk', balk + 'px');
    dlg.style.setProperty('--om-drill-stick', (balk + s.offsetHeight) + 'px');
  }
  (function () {
    // Kop en balk worden hoger bij een lange titel of filters over twee regels.
    if (!window.ResizeObserver) return;
    var ro = new window.ResizeObserver(stickHoogte);
    ['omDrillKop', 'omDrillStick'].forEach(function (id) { var el = $(id); if (el) ro.observe(el); });
  })();
  // ── Een rij: zichtbare cellen, de uitleg erachter, en EEN Odoo-knop ─────────
  var WHY_COL = /^Waarom/;
  var LINK_RE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  function zonderLinks(h) {
    return String(h === undefined || h === null ? '' : h).replace(/<i data-lucide="external-link"[^>]*><\/i>/g, '').replace(/<a\b[^>]*>/g, '').replace(/<\/a>/g, '');
  }
  function rowOf(r, head, vis, whyCols, k) {
    var html = vis.map(function (i) { return r[i]; }).join(' '), m, main = null, first = null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(html))) {
      if (m[1].indexOf(ODOO) !== 0) continue;
      var l = { href: m[1], label: textOf(m[2]) };
      if (!first) first = l;
      if (!main && /data-om-main/.test(m[0])) main = l;
    }
    var row = vis.map(function (i) { var h = zonderLinks(r[i]), t = textOf(h); return { h: h, t: t, s: parseSort(t) }; });
    row.odoo = main || first;
    row.why = whyCols.map(function (i) { return { kop: head[i] === 'Waarom' ? '' : head[i], h: zonderLinks(r[i]) }; }).filter(function (x) { return textOf(x.h); });
    row.wt = row.why.map(function (x) { return textOf(x.h); }).join(' ').toLowerCase();
    row.k = k;
    return row;
  }
  function actiesCel(r) {
    return '<div class="flex items-center justify-end gap-0.5">'
      + (r.why.length ? '<button type="button" class="btn btn-ghost btn-xs btn-square" data-om-tip="' + r.k + '" aria-label="Waarom staat dit erin?"><i data-lucide="help-circle" class="w-4 h-4 pointer-events-none"></i></button>' : '')
      + (r.odoo ? '<a class="btn btn-ghost btn-xs btn-square" target="_blank" rel="noopener" href="' + r.odoo.href + '" title="Openen in Odoo: ' + esc(r.odoo.label) + '" aria-label="Openen in Odoo"><i data-lucide="external-link" class="w-4 h-4 pointer-events-none"></i></a>' : '')
      + '</div>';
  }

  // ── Het vraagteken: uitleg die je LEEST door aan te wijzen ─────────────────
  // Eén zwevend vak (#omTip, in de dialog). Naast de titel: wie in de lijst staat en
  // waarom; achteraan een rij: wat het voor die rij staaft.
  var tipVan = null;
  function tipHtml(sleutel) {
    if (!dr) return '';
    if (sleutel === 'regels') {
      return dr.rules.length ? '<div class="font-semibold mb-2">Wie staat in deze lijst, en waarom?</div>'
        + '<ul class="list-disc pl-4 space-y-1.5">' + dr.rules.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '';
    }
    var r = dr.rows[Number(sleutel)];
    if (!r || !r.why.length) return '';
    return '<div class="font-semibold mb-2">' + esc(r[0] ? r[0].t : '') + '</div>'
      + r.why.map(function (x) {
        return (x.kop ? '<div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 mt-3 mb-1">' + esc(x.kop) + '</div>' : '')
          + '<div class="space-y-1.5">' + x.h + '</div>';
      }).join('');
  }
  function toonTip(knop) {
    var t = $('omTip'), html = tipHtml(knop.getAttribute('data-om-tip'));
    if (!t || !html) return;
    t.innerHTML = html;
    t.classList.remove('hidden');
    tipVan = knop;
    var b = knop.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    // Rechts uitgelijnd op het vraagteken (dat staat achteraan de rij); past dat niet, dan vanaf het vraagteken.
    var left = b.right - w;
    if (left < 8) left = Math.min(b.left, vw - w - 8);
    var top = b.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, b.top - h - 6);
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = top + 'px';
  }
  function verbergTip() { var t = $('omTip'); if (t) t.classList.add('hidden'); tipVan = null; }
  document.addEventListener('mouseover', function (e) {
    var k = e.target.closest ? e.target.closest('[data-om-tip]') : null;
    if (k && k !== tipVan) toonTip(k);
  });
  document.addEventListener('mouseout', function (e) {
    var k = e.target.closest ? e.target.closest('[data-om-tip]') : null;
    if (k && !(e.relatedTarget && k.contains(e.relatedTarget))) verbergTip();
  });
  // Enkel bij focus met het TOETSENBORD (Tab): een focus die het venster zelf zet, opent niets.
  document.addEventListener('focusin', function (e) {
    var k = e.target.closest && e.target.closest('[data-om-tip]'), zichtbaar = false;
    try { zichtbaar = !!k && k.matches(':focus-visible'); } catch (_) { zichtbaar = false; }
    if (zichtbaar) toonTip(k);
  });
  document.addEventListener('focusout', function (e) { if (e.target.closest && e.target.closest('[data-om-tip]')) verbergTip(); });
  // Schuiven zet het vraagteken ergens anders: dan weg met het vak.
  document.addEventListener('scroll', function () { if (tipVan) verbergTip(); }, true);
  (function () { var d = $('omDrill'); if (d) d.addEventListener('close', verbergTip); })();

  function drillRows() {
    var q = dr.q.toLowerCase();
    var out = dr.rows.filter(function (r) {
      if (q && !r.some(function (c) { return c.t.toLowerCase().indexOf(q) >= 0; }) && r.wt.indexOf(q) < 0) return false;
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
    var rows = drillRows(), right = dr.right, acties = dr.rows.some(function (r) { return r.why.length || r.odoo; });
    var sums = dr.head.map(function (h, i) {
      if (right.indexOf(i) < 0 || !SUM_COL.test(h) || /Dagen|graad|%/.test(h)) return null;
      var s = 0, ok = false;
      rows.forEach(function (r) { var v = r[i] && r[i].s; if (v && v.n !== undefined) { s += v.n; ok = true; } });
      return ok ? s : null;
    });
    var isEur = function (i) { return rows.some(function (r) { return r[i] && r[i].t.indexOf('€') >= 0; }); };
    $('omDrillBody').innerHTML = rows.length
      ? '<table class="table table-sm om-drill-tabel"><thead class="sticky z-10" style="top: var(--om-drill-stick, 0px)"><tr>' + dr.head.map(function (h, i) {
          var on = dr.sort === i;
          return '<th class="cursor-pointer select-none whitespace-nowrap ' + (right.indexOf(i) >= 0 ? 'text-right' : '') + '" data-om-drill-sort="' + i + '" title="Sorteren">' + esc(h)
            + (on ? '<span class="text-primary"> ' + (dr.dir === 1 ? '▲' : '▼') + '</span>' : '<span class="opacity-30"> ↕</span>') + '</th>';
        }).join('') + (acties ? '<th class="w-px"></th>' : '') + '</tr>'
        // De totaalrij staat BOVENAAN, onder de kolomkoppen, en plakt mee: onderaan zag je ze pas
        // na het hele lijstje, en net daar wil je ze tijdens het schuiven.
        + (sums.some(function (s) { return s !== null; })
          ? '<tr class="om-totaal">' + dr.head.map(function (h, i) { return '<td class="' + (right.indexOf(i) >= 0 ? 'text-right tabular-nums' : '') + ' font-semibold">' + (i === 0 ? 'Totaal' : sums[i] === null ? '' : isEur(i) ? eur(sums[i]) : nf(sums[i], 2)) + '</td>'; }).join('') + (acties ? '<td></td>' : '') + '</tr>' : '')
        + '</thead><tbody>'
        + rows.map(function (r) { return '<tr class="om-hover">' + r.map(function (c, i) { return '<td class="' + (right.indexOf(i) >= 0 ? 'text-right tabular-nums' : '') + '">' + c.h + '</td>'; }).join('')
          + (acties ? '<td class="w-px whitespace-nowrap">' + actiesCel(r) + '</td>' : '') + '</tr>'; }).join('')
        + '</tbody></table>'
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
    // Op een aanraakscherm is er geen aanwijzen: tikken toont het vak.
    var tk = e.target.closest('[data-om-tip]');
    if (tk) { toonTip(tk); return; }
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
    chart: chart, hatchPlugin: hatchPlugin, baseOptions: baseOptions, soloLegend: soloLegend,
    bandAt: bandAt, bandHoverPlugin: bandHoverPlugin, bandTooltip: bandTooltip,
    colorOf: function (c, a) { return colorFnOf(c)(a); }, ctBadge: ctBadge, expertCel: expertCel,
    odooUrl: odooUrl, odooLink: odooLink, drill: drill, parseSort: parseSort, api: api, loadSales: loadSales, freshness: freshness,
    geraamte: geraamte, kaart: kaart, status: status, melding: melding, zin: zin, filters: filters, kpis: kpis,
    KANAAL_KLEUREN: KANAAL_KLEUREN, kanaalKleur: kanaalKleur
  };
})();
