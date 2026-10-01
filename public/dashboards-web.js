// Dashboards — tab "Website-bezoeken"
//
// De server (src/modules/dashboards/lib/web-visits.js) stuurt compacte SESSIES
// voor de gekozen periode en de vorige, even lange periode. Alles hieronder —
// filteren, doorklikken, vergelijken — gebeurt in de browser op die sessies,
// zodat een klik op een kanaal of pagina geen nieuwe query kost.
//
// De definities (sessie, geëngageerd, kanaal) staan in web-visits.js en in
// website-tracker/docs/ontwerp-web-visitor-events.md §5. Hier wordt enkel geteld.

(function () {
  var web = {
    loaded: false,
    period: '30d',
    site: 'all',
    filter: { ch: null, det: null, land: null, dev: null, visit: null },
    data: null,
    charts: {},
    loading: false
  };

  var C = { v: 0, start: 1, dur: 2, site: 3, ch: 4, det: 5, pages: 6, flags: 7, clicks: 8, contact: 9, cal: 10, ev: 11, forms: 12, dev: 13, co: 14, inapp: 15, first: 16, search: 17 };
  var F = { engaged: 1, isNew: 2, historic: 4, previous: 8 };

  var CHANNEL_COLORS = {
    'Betaald zoeken': '#2563eb',
    'Betaalde social': '#7c3aed',
    'Betaald overig': '#a78bfa',
    'E-mail': '#f59e0b',
    'Organisch zoeken': '#059669',
    'Social organisch': '#db2777',
    'AI-assistenten': '#0891b2',
    'Verwijzing': '#65a30d',
    'Eigen sites': '#64748b',
    'Direct / onbekend': '#cbd5e1'
  };

  var PERIOD_LABELS = { '7d': 'laatste 7 dagen', '30d': 'laatste 30 dagen', '90d': 'laatste 90 dagen', '12m': 'laatste 12 maanden' };
  var DEV_LABELS = { desktop: 'Desktop', mobile: 'Mobiel', tablet: 'Tablet' };
  var WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

  // --- helpers --------------------------------------------------------------

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nf(n) { return (n || 0).toLocaleString('nl-BE'); }
  function pct(a, b) { return b > 0 ? (a / b) * 100 : null; }
  function pctTxt(p, digits) { return p === null ? '—' : p.toLocaleString('nl-BE', { maximumFractionDigits: digits === undefined ? 1 : digits }) + '%'; }
  function durTxt(sec) {
    if (!sec) return '0s';
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m ? m + 'm ' + (s < 10 ? '0' : '') + s + 's' : s + 's';
  }
  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function conv(s) { return s[C.cal] + s[C.ev] + s[C.forms]; }
  function dict(kind, i) { return i >= 0 && web.data ? web.data.dict[kind][i] : null; }
  function shortPath(p, max) {
    max = max || 48;
    if (!p) return '—';
    return p.length > max ? p.slice(0, max - 1) + '…' : p;
  }

  var brusselsDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
  var brusselsParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short', hour: '2-digit', hour12: false });
  var WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  function dayKey(unix) { return brusselsDate.format(new Date(unix * 1000)); }
  function weekKey(unix) {
    var d = new Date(dayKey(unix) + 'T00:00:00Z');
    var wd = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - wd);
    return d.toISOString().slice(0, 10);
  }
  function monthKey(unix) { return dayKey(unix).slice(0, 7); }

  async function fetchJson(url) {
    var res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet ingelogd'); }
    var body = await res.json();
    if (!body.success) throw new Error(body.error || ('Fout ' + res.status));
    return body.data;
  }

  // --- selectie -------------------------------------------------------------

  function siteMatches(s) {
    if (web.site === 'all') return true;
    var site = dict('site', s[C.site]) || '';
    return site.indexOf(web.site) !== -1;
  }

  function matches(s) {
    var f = web.filter;
    if (!siteMatches(s)) return false;
    if (f.ch !== null && s[C.ch] !== f.ch) return false;
    if (f.det !== null && s[C.det] !== f.det) return false;
    if (f.land !== null && s[C.pages][0] !== f.land) return false;
    if (f.dev !== null && s[C.dev] !== f.dev) return false;
    if (f.visit === 'new' && !(s[C.flags] & F.isNew)) return false;
    if (f.visit === 'returning' && (s[C.flags] & F.isNew)) return false;
    return true;
  }

  function split() {
    var cur = [], prev = [];
    web.data.sessions.forEach(function (s) {
      if (!matches(s)) return;
      if (s[C.flags] & F.previous) prev.push(s); else cur.push(s);
    });
    return { cur: cur, prev: prev };
  }

  // --- kerncijfers ----------------------------------------------------------

  function kpis(list) {
    var visitors = {}, newVisitors = {}, engaged = 0, convS = 0, cal = 0, ev = 0, forms = 0, contact = 0, pages = 0, durs = [];
    list.forEach(function (s) {
      visitors[s[C.v]] = true;
      if (s[C.flags] & F.isNew) newVisitors[s[C.v]] = true;
      if (s[C.flags] & F.engaged) { engaged++; durs.push(s[C.dur]); }
      if (conv(s) > 0) convS++;
      cal += s[C.cal]; ev += s[C.ev]; forms += s[C.forms];
      if (s[C.contact] > 0) contact++;
      pages += s[C.pages].length;
    });
    var nV = Object.keys(visitors).length;
    return {
      sessions: list.length,
      visitors: nV,
      engagedPct: pct(engaged, list.length),
      engaged: engaged,
      convSessions: convS,
      convRate: pct(convS, list.length),
      cal: cal, ev: ev, forms: forms,
      contact: contact,
      pagesPerSession: list.length ? pages / list.length : 0,
      medianDur: median(durs),
      newPct: pct(Object.keys(newVisitors).length, nV)
    };
  }

  function deltaHtml(cur, prev, opts) {
    opts = opts || {};
    if (prev === null || prev === undefined || cur === null || cur === undefined) return '<span class="text-base-content/40">geen vergelijking</span>';
    var diff;
    if (opts.points) {
      diff = cur - prev;
      if (Math.abs(diff) < 0.05) return '<span class="text-base-content/50">= vorige periode</span>';
      return '<span class="' + (diff > 0 ? 'text-success' : 'text-error') + '">' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff).toLocaleString('nl-BE', { maximumFractionDigits: 1 }) + ' ptn</span>';
    }
    if (!prev) return cur ? '<span class="text-success">nieuw</span>' : '<span class="text-base-content/50">= vorige periode</span>';
    diff = ((cur - prev) / prev) * 100;
    if (Math.abs(diff) < 0.5) return '<span class="text-base-content/50">= vorige periode</span>';
    return '<span class="' + (diff > 0 ? 'text-success' : 'text-error') + '">' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(diff)).toLocaleString('nl-BE') + '%</span>';
  }

  function tile(label, value, delta, sub, help) {
    return '<div class="rounded-box border border-base-300 bg-base-100 p-4" title="' + esc(help || '') + '">'
      + '<div class="text-xs text-base-content/60">' + esc(label) + '</div>'
      + '<div class="text-2xl font-bold mt-1 tabular-nums">' + value + '</div>'
      + '<div class="text-xs mt-1">' + delta + '</div>'
      + (sub ? '<div class="text-xs text-base-content/50 mt-1">' + sub + '</div>' : '')
      + '</div>';
  }

  function renderKpis(cur, prev) {
    var a = kpis(cur), b = kpis(prev);
    var hasPrev = prev.length > 0;
    var P = function (x) { return hasPrev ? x : null; };
    document.getElementById('webKpis').innerHTML = [
      tile('Bezoekers', nf(a.visitors), deltaHtml(a.visitors, P(b.visitors)), pctTxt(a.newPct, 0) + ' nieuw', 'Unieke bezoekers (browser-id) in de periode.'),
      tile('Sessies', nf(a.sessions), deltaHtml(a.sessions, P(b.sessions)), (a.visitors ? (a.sessions / a.visitors).toLocaleString('nl-BE', { maximumFractionDigits: 1 }) : '0') + ' per bezoeker', 'Een sessie eindigt na 30 minuten stilte of bij het verlaten van de site via login of registratie.'),
      tile('Engagement', pctTxt(a.engagedPct), deltaHtml(a.engagedPct, P(b.engagedPct), { points: true }), nf(a.engaged) + ' geëngageerde sessies', 'Geëngageerd: meer dan één pagina, een klik, een conversie, terugkeren naar de tab, meer dan 5 seconden op een pagina of 75% gescrold.'),
      tile('Conversies', nf(a.convSessions), deltaHtml(a.convSessions, P(b.convSessions)), nf(a.cal) + ' afspraken · ' + nf(a.ev) + ' inschrijvingen · ' + nf(a.forms) + ' formulieren', 'Sessies met een Calendly-afspraak, een event-inschrijving of een verstuurd formulier.'),
      tile('Conversieratio', pctTxt(a.convRate, 2), deltaHtml(a.convRate, P(b.convRate), { points: true }), 'van alle sessies', 'Sessies met minstens één conversie, gedeeld door alle sessies.'),
      tile('Contactkliks', nf(a.contact), deltaHtml(a.contact, P(b.contact)), 'klik op telefoon of e-mail', 'Sessies met een klik op een telefoonnummer of e-mailadres: een contactpoging buiten de formulieren om.'),
      tile("Pagina's per sessie", a.pagesPerSession.toLocaleString('nl-BE', { maximumFractionDigits: 1 }), deltaHtml(a.pagesPerSession, P(b.pagesPerSession)), '', ''),
      tile('Mediane sessieduur', durTxt(a.medianDur), deltaHtml(a.medianDur, P(b.medianDur)), 'van geëngageerde sessies', 'De helft van de geëngageerde sessies duurt korter, de andere helft langer.')
    ].join('');
  }

  // --- trechter -------------------------------------------------------------

  function renderFunnel(cur) {
    var steps = [
      { label: 'Sessies', n: cur.length },
      { label: 'Geëngageerd', n: cur.filter(function (s) { return s[C.flags] & F.engaged; }).length },
      { label: 'Interesse (klik of contact)', n: cur.filter(function (s) { return s[C.clicks] > 0 || s[C.contact] > 0 || conv(s) > 0; }).length },
      { label: 'Conversie', n: cur.filter(function (s) { return conv(s) > 0; }).length }
    ];
    var max = steps[0].n || 1;
    document.getElementById('webFunnel').innerHTML = steps.map(function (st, i) {
      var w = Math.max(2, (st.n / max) * 100);
      var rel = i === 0 ? '' : '<span class="text-base-content/50 ml-2">' + pctTxt(pct(st.n, steps[i - 1].n), 1) + ' van vorige stap</span>';
      return '<div class="mb-2">'
        + '<div class="flex justify-between text-xs mb-1"><span class="font-medium">' + esc(st.label) + '</span><span class="tabular-nums">' + nf(st.n) + rel + '</span></div>'
        + '<div class="h-4 bg-base-200 rounded"><div class="h-4 rounded" style="width:' + w + '%;background:' + ['#94a3b8', '#60a5fa', '#2563eb', '#059669'][i] + '"></div></div>'
        + '</div>';
    }).join('');
  }

  // --- trend ----------------------------------------------------------------

  function renderTrend(cur) {
    var days = web.data.days;
    var gran = days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
    var keyFn = gran === 'day' ? dayKey : gran === 'week' ? weekKey : monthKey;

    // Alle emmers van de periode, ook de lege.
    var keys = [];
    var startUnix = Math.floor(Date.parse(web.data.range.start.replace(' ', 'T') + 'Z') / 1000);
    var endUnix = Math.floor(Date.parse(web.data.range.end.replace(' ', 'T') + 'Z') / 1000);
    for (var t = startUnix; t <= endUnix; t += 86400) {
      var k = keyFn(t);
      if (keys.indexOf(k) === -1) keys.push(k);
    }
    var byCh = {}, convs = {};
    web.data.dict.ch.forEach(function (_, ci) { byCh[ci] = {}; });
    cur.forEach(function (s) {
      var k = keyFn(s[C.start]);
      byCh[s[C.ch]][k] = (byCh[s[C.ch]][k] || 0) + 1;
      if (conv(s) > 0) convs[k] = (convs[k] || 0) + 1;
    });
    var datasets = web.data.dict.ch.map(function (name, ci) {
      return {
        type: 'bar', label: name, chIndex: ci, stack: 's',
        data: keys.map(function (k) { return byCh[ci][k] || 0; }),
        backgroundColor: CHANNEL_COLORS[name] || '#94a3b8', yAxisID: 'y', order: 2
      };
    }).filter(function (d) { return d.data.some(function (x) { return x > 0; }); });
    datasets.push({
      type: 'line', label: 'Conversies', data: keys.map(function (k) { return convs[k] || 0; }),
      borderColor: '#111827', backgroundColor: '#111827', yAxisID: 'y2', cubicInterpolationMode: 'monotone', pointRadius: 2, order: 1
    });

    var labels = keys.map(function (k) {
      if (gran === 'month') return k.slice(5) + '/' + k.slice(2, 4);
      var d = new Date(k + 'T00:00:00Z');
      return (gran === 'week' ? 'wk ' : '') + d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
    });
    document.getElementById('webTrendTitle').textContent = 'Sessies per ' + { day: 'dag', week: 'week', month: 'maand' }[gran] + ', per kanaal';

    if (web.charts.trend) web.charts.trend.destroy();
    web.charts.trend = new Chart(document.getElementById('webTrendChart'), {
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'sessies' } },
          y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { precision: 0 }, title: { display: true, text: 'conversies' } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { filter: function (i) { return i.parsed.y > 0; } }
        },
        onClick: function (evt, els) {
          if (!els.length) return;
          var ds = web.charts.trend.data.datasets[els[0].datasetIndex];
          if (ds.chIndex === undefined) return;
          setFilter('ch', web.filter.ch === ds.chIndex ? null : ds.chIndex);
        }
      }
    });
  }

  // --- tabellen -------------------------------------------------------------

  function groupBy(list, keyFn) {
    var m = {};
    list.forEach(function (s) {
      var k = keyFn(s);
      if (k === null || k === undefined || k < 0) return;
      if (!m[k]) m[k] = { key: k, n: 0, eng: 0, conv: 0, contact: 0, v: {}, dur: 0 };
      var g = m[k];
      g.n++;
      if (s[C.flags] & F.engaged) g.eng++;
      if (conv(s) > 0) g.conv++;
      if (s[C.contact] > 0) g.contact++;
      g.v[s[C.v]] = true;
      g.dur += s[C.dur];
    });
    return Object.keys(m).map(function (k) { var g = m[k]; g.visitors = Object.keys(g.v).length; delete g.v; return g; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  function bar(p, color) {
    return '<div class="h-1.5 bg-base-200 rounded mt-1"><div class="h-1.5 rounded" style="width:' + Math.max(1, p || 0) + '%;background:' + (color || '#94a3b8') + '"></div></div>';
  }

  function rateCell(p, ref) {
    // Kleur tegenover het gemiddelde van de selectie: duidelijk beter groen, duidelijk slechter rood.
    var cls = '';
    if (p !== null && ref !== null && ref > 0) {
      if (p >= ref * 1.25) cls = 'text-success font-semibold';
      else if (p <= ref * 0.75) cls = 'text-error';
    }
    return '<td class="text-right tabular-nums ' + cls + '">' + pctTxt(p) + '</td>';
  }

  function renderChannels(cur, prev) {
    var rows = groupBy(cur, function (s) { return s[C.ch]; });
    var prevRows = {};
    groupBy(prev, function (s) { return s[C.ch]; }).forEach(function (g) { prevRows[g.key] = g.n; });
    var tot = cur.length || 1;
    var avgEng = pct(cur.filter(function (s) { return s[C.flags] & F.engaged; }).length, cur.length);
    var avgConv = pct(cur.filter(function (s) { return conv(s) > 0; }).length, cur.length);
    document.getElementById('webChannels').innerHTML = rows.length ? rows.map(function (g) {
      var name = web.data.dict.ch[g.key];
      var active = web.filter.ch === Number(g.key);
      return '<tr class="hover cursor-pointer ' + (active ? 'bg-primary/10' : '') + '" data-web-action="filter" data-kind="ch" data-value="' + g.key + '">'
        + '<td><div class="flex items-center gap-2"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:' + (CHANNEL_COLORS[name] || '#94a3b8') + '"></span>' + esc(name) + '</div>' + bar(pct(g.n, tot), CHANNEL_COLORS[name]) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(g.n) + '<div class="text-xs">' + (prev.length ? deltaHtml(g.n, prevRows[g.key] || 0) : '') + '</div></td>'
        + '<td class="text-right tabular-nums">' + nf(g.visitors) + '</td>'
        + rateCell(pct(g.eng, g.n), avgEng)
        + '<td class="text-right tabular-nums">' + nf(g.conv) + '</td>'
        + rateCell(pct(g.conv, g.n), avgConv)
        + '</tr>';
    }).join('') : '<tr><td colspan="6" class="text-center text-base-content/50">Geen sessies in deze selectie</td></tr>';
  }

  function renderDetails(cur) {
    var rows = groupBy(cur, function (s) { return s[C.det]; })
      .filter(function (g) { return web.data.dict.det[g.key] && web.data.dict.det[g.key] !== '(binnen de site)'; })
      .slice(0, 10);
    var chOf = {};
    cur.forEach(function (s) { if (s[C.det] >= 0 && chOf[s[C.det]] === undefined) chOf[s[C.det]] = s[C.ch]; });
    var avgConv = pct(cur.filter(function (s) { return conv(s) > 0; }).length, cur.length);
    document.getElementById('webDetailsTitle').textContent = web.filter.ch !== null
      ? 'Bronnen en campagnes binnen "' + web.data.dict.ch[web.filter.ch] + '"'
      : 'Bronnen en campagnes';
    document.getElementById('webDetails').innerHTML = rows.length ? rows.map(function (g) {
      var name = web.data.dict.det[g.key];
      var chName = web.data.dict.ch[chOf[g.key]];
      var active = web.filter.det === Number(g.key);
      return '<tr class="hover cursor-pointer ' + (active ? 'bg-primary/10' : '') + '" data-web-action="filter" data-kind="det" data-value="' + g.key + '">'
        + '<td class="max-w-0 w-full"><div class="truncate" title="' + esc(name) + '">' + esc(name) + '</div><div class="text-xs text-base-content/50">' + esc(chName) + '</div></td>'
        + '<td class="text-right tabular-nums">' + nf(g.n) + '</td>'
        + '<td class="text-right tabular-nums">' + pctTxt(pct(g.eng, g.n)) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(g.conv) + '</td>'
        + rateCell(pct(g.conv, g.n), avgConv)
        + '</tr>';
    }).join('') : '<tr><td colspan="5" class="text-center text-base-content/50">Geen getagde bronnen in deze selectie</td></tr>';
  }

  function renderLandings(cur) {
    var rows = groupBy(cur, function (s) { return s[C.pages].length ? s[C.pages][0] : -1; }).slice(0, 10);
    var avgEng = pct(cur.filter(function (s) { return s[C.flags] & F.engaged; }).length, cur.length);
    var avgConv = pct(cur.filter(function (s) { return conv(s) > 0; }).length, cur.length);
    document.getElementById('webLandings').innerHTML = rows.length ? rows.map(function (g) {
      var p = web.data.dict.p[g.key];
      var active = web.filter.land === Number(g.key);
      return '<tr class="hover cursor-pointer ' + (active ? 'bg-primary/10' : '') + '" data-web-action="filter" data-kind="land" data-value="' + g.key + '">'
        + '<td class="font-mono text-xs" title="' + esc(p) + '">' + esc(shortPath(p)) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(g.n) + '</td>'
        + rateCell(pct(g.eng, g.n), avgEng)
        + rateCell(pct(g.conv, g.n), avgConv)
        + '</tr>';
    }).join('') : '<tr><td colspan="4" class="text-center text-base-content/50">Geen landingspagina\'s</td></tr>';
  }

  function renderPages(cur) {
    var m = {};
    cur.forEach(function (s) {
      var seen = {};
      s[C.pages].forEach(function (p) {
        if (!m[p]) m[p] = { views: 0, sessions: 0, conv: 0, v: {} };
        m[p].views++;
        if (!seen[p]) {
          seen[p] = true;
          m[p].sessions++;
          m[p].v[s[C.v]] = true;
          if (conv(s) > 0) m[p].conv++;
        }
      });
    });
    var rows = Object.keys(m).map(function (k) { return { key: k, views: m[k].views, sessions: m[k].sessions, conv: m[k].conv, visitors: Object.keys(m[k].v).length }; })
      .sort(function (a, b) { return b.views - a.views; }).slice(0, 10);
    var avgConv = pct(cur.filter(function (s) { return conv(s) > 0; }).length, cur.length);
    document.getElementById('webPages').innerHTML = rows.length ? rows.map(function (r) {
      var p = web.data.dict.p[r.key];
      return '<tr>'
        + '<td class="font-mono text-xs" title="' + esc(p) + '">' + esc(shortPath(p)) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(r.views) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(r.visitors) + '</td>'
        + rateCell(pct(r.conv, r.sessions), avgConv)
        + '</tr>';
    }).join('') : '<tr><td colspan="4" class="text-center text-base-content/50">Geen pagina\'s</td></tr>';
  }

  // Wat bezoekers in de zoekfunctie van de site typten (?s=). Een zoekterm is de
  // enige plek waar iemand in zijn eigen woorden zegt wat hij zoekt.
  function renderSearches(cur) {
    var m = {};
    cur.forEach(function (s) {
      var terms = s[C.search] || [];
      var seen = {};
      terms.forEach(function (t) {
        if (!m[t]) m[t] = { n: 0, sessions: 0, conv: 0 };
        m[t].n++;
        if (!seen[t]) { seen[t] = true; m[t].sessions++; if (conv(s) > 0) m[t].conv++; }
      });
    });
    var rows = Object.keys(m).map(function (k) { return { key: k, n: m[k].n, sessions: m[k].sessions, conv: m[k].conv }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
    var el = document.getElementById('webSearches');
    el.innerHTML = rows.length ? rows.map(function (r) {
      return '<tr>'
        + '<td><div class="truncate" title="' + esc(web.data.dict.zk[r.key]) + '">' + esc(web.data.dict.zk[r.key]) + '</div></td>'
        + '<td class="text-right tabular-nums">' + nf(r.n) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(r.sessions) + '</td>'
        + '<td class="text-right tabular-nums">' + pctTxt(pct(r.conv, r.sessions), 1) + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="4" class="text-center text-base-content/50">Nog geen zoekopdrachten in deze selectie. Ze worden bijgehouden sinds 29 september 2026.</td></tr>';
  }

  // Welke pagina's zagen bezoekers die converteerden VOOR hun eerste conversie,
  // en hoeveel vaker dan de gemiddelde bezoeker? Dat is de "lift".
  function renderBeforeConversion(cur) {
    var byVisitor = {};
    cur.forEach(function (s) { (byVisitor[s[C.v]] = byVisitor[s[C.v]] || []).push(s); });
    var visitors = Object.keys(byVisitor);
    var seenAll = {}, seenConv = {}, converters = 0;
    visitors.forEach(function (v) {
      var list = byVisitor[v].sort(function (a, b) { return a[C.start] - b[C.start]; });
      var pagesAll = {};
      list.forEach(function (s) { s[C.pages].forEach(function (p) { pagesAll[p] = true; }); });
      Object.keys(pagesAll).forEach(function (p) { seenAll[p] = (seenAll[p] || 0) + 1; });
      var firstConv = -1;
      for (var i = 0; i < list.length; i++) { if (conv(list[i]) > 0) { firstConv = i; break; } }
      if (firstConv === -1) return;
      converters++;
      var before = {};
      for (var j = 0; j <= firstConv; j++) list[j][C.pages].forEach(function (p) { before[p] = true; });
      Object.keys(before).forEach(function (p) { seenConv[p] = (seenConv[p] || 0) + 1; });
    });
    var el = document.getElementById('webBeforeConv');
    if (converters < 2) {
      el.innerHTML = '<tr><td colspan="4" class="text-center text-base-content/50">Te weinig conversies in deze selectie (' + converters + ') om iets te zeggen.</td></tr>';
      return;
    }
    var rows = Object.keys(seenConv)
      .filter(function (p) { return seenConv[p] >= 2 && !/bedankt|merci/.test(web.data.dict.p[p] || ''); })
      .map(function (p) {
        var sc = seenConv[p] / converters;
        var sa = seenAll[p] / visitors.length;
        return { p: p, n: seenConv[p], share: sc, lift: sa > 0 ? sc / sa : 0 };
      })
      .sort(function (a, b) { return b.lift * Math.sqrt(b.n) - a.lift * Math.sqrt(a.n); })
      .slice(0, 10);
    el.innerHTML = rows.length ? rows.map(function (r) {
      var p = web.data.dict.p[r.p];
      return '<tr>'
        + '<td class="font-mono text-xs" title="' + esc(p) + '">' + esc(shortPath(p, 42)) + '</td>'
        + '<td class="text-right tabular-nums">' + nf(r.n) + ' / ' + nf(converters) + '</td>'
        + '<td class="text-right tabular-nums">' + pctTxt(r.share * 100, 0) + '</td>'
        + '<td class="text-right tabular-nums font-semibold ' + (r.lift >= 2 ? 'text-success' : '') + '">' + r.lift.toLocaleString('nl-BE', { maximumFractionDigits: 1 }) + '×</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="4" class="text-center text-base-content/50">Nog geen patroon (elke pagina minstens 2 converteerders)</td></tr>';
  }

  // --- tijd tot conversie ---------------------------------------------------

  function renderTimeToConv(cur) {
    var byVisitor = {};
    cur.forEach(function (s) { (byVisitor[s[C.v]] = byVisitor[s[C.v]] || []).push(s); });
    var dayBuckets = [['Zelfde dag', 0], ['1–7 dagen', 0], ['8–30 dagen', 0], ['31–90 dagen', 0], ['> 90 dagen', 0]];
    var sesBuckets = [['1 sessie', 0], ['2', 0], ['3–5', 0], ['6+', 0]];
    var n = 0;
    Object.keys(byVisitor).forEach(function (v) {
      var list = byVisitor[v].sort(function (a, b) { return a[C.start] - b[C.start]; });
      for (var i = 0; i < list.length; i++) {
        if (conv(list[i]) === 0) continue;
        n++;
        var first = list[i][C.first] || list[0][C.start];
        var d = (list[i][C.start] - first) / 86400;
        dayBuckets[d < 1 ? 0 : d <= 7 ? 1 : d <= 30 ? 2 : d <= 90 ? 3 : 4][1]++;
        var k = i + 1;
        sesBuckets[k === 1 ? 0 : k === 2 ? 1 : k <= 5 ? 2 : 3][1]++;
        break;
      }
    });
    document.getElementById('webTtcNote').textContent = n
      ? n + ' bezoekers converteerden. Tijd gerekend vanaf hun allereerste bezoek; sessies geteld binnen de periode.'
      : 'Geen conversies in deze selectie.';
    function draw(id, key, buckets, color) {
      if (web.charts[key]) web.charts[key].destroy();
      web.charts[key] = new Chart(document.getElementById(id), {
        type: 'bar',
        data: { labels: buckets.map(function (b) { return b[0]; }), datasets: [{ data: buckets.map(function (b) { return b[1]; }), backgroundColor: color, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
      });
    }
    draw('webTtcDays', 'ttcDays', dayBuckets, '#2563eb');
    draw('webTtcSessions', 'ttcSes', sesBuckets, '#059669');
  }

  // --- toestel, land --------------------------------------------------------

  function renderDevices(cur) {
    var known = cur.filter(function (s) { return s[C.dev] >= 0; });
    var rows = groupBy(known, function (s) { return s[C.dev]; });
    var el = document.getElementById('webDevices');
    var note = document.getElementById('webDevicesNote');
    note.textContent = known.length < cur.length
      ? 'Toestel gekend voor ' + nf(known.length) + ' van ' + nf(cur.length) + ' sessies (de oude historiek bewaarde dat niet).'
      : '';
    el.innerHTML = rows.map(function (g) {
      var name = web.data.dict.dev[g.key];
      var active = web.filter.dev === Number(g.key);
      return '<tr class="hover cursor-pointer ' + (active ? 'bg-primary/10' : '') + '" data-web-action="filter" data-kind="dev" data-value="' + g.key + '">'
        + '<td>' + esc(DEV_LABELS[name] || name) + bar(pct(g.n, known.length), '#6366f1') + '</td>'
        + '<td class="text-right tabular-nums">' + nf(g.n) + '</td>'
        + '<td class="text-right tabular-nums">' + pctTxt(pct(g.eng, g.n)) + '</td>'
        + '<td class="text-right tabular-nums">' + pctTxt(pct(g.conv, g.n), 2) + '</td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="4" class="text-center text-base-content/50">Geen toestelgegevens</td></tr>';

    var inapp = groupBy(cur.filter(function (s) { return s[C.inapp] >= 0; }), function (s) { return s[C.inapp]; });
    var countries = groupBy(cur.filter(function (s) { return s[C.co] >= 0; }), function (s) { return s[C.co]; }).slice(0, 6);
    document.getElementById('webDeviceExtra').innerHTML =
      (inapp.length ? '<div class="text-xs text-base-content/60 mt-3 mb-1">In-app-browsers (klik uit een app, vaak advertenties)</div>'
        + inapp.map(function (g) { return '<span class="badge badge-sm badge-outline mr-1 mb-1">' + esc(web.data.dict.ia[g.key]) + ' ' + nf(g.n) + ' · ' + pctTxt(pct(g.eng, g.n), 0) + ' geëngageerd</span>'; }).join('') : '')
      + (countries.length ? '<div class="text-xs text-base-content/60 mt-3 mb-1">Landen</div>'
        + countries.map(function (g) { return '<span class="badge badge-sm badge-ghost mr-1 mb-1">' + esc(web.data.dict.co[g.key]) + ' ' + nf(g.n) + '</span>'; }).join('') : '');
  }

  // --- wanneer --------------------------------------------------------------

  function renderHeatmap(cur) {
    var grid = [];
    for (var d = 0; d < 7; d++) { grid.push([]); for (var h = 0; h < 24; h++) grid[d].push(0); }
    var max = 0;
    cur.forEach(function (s) {
      var parts = brusselsParts.formatToParts(new Date(s[C.start] * 1000));
      var wd = null, hr = null;
      parts.forEach(function (p) { if (p.type === 'weekday') wd = WD[p.value]; if (p.type === 'hour') hr = Number(p.value) % 24; });
      if (wd === null || hr === null) return;
      grid[wd][hr]++;
      if (grid[wd][hr] > max) max = grid[wd][hr];
    });
    var head = '<tr><th></th>' + [0, 3, 6, 9, 12, 15, 18, 21].map(function (h) { return '<th colspan="3" class="text-left font-normal text-base-content/50">' + h + 'u</th>'; }).join('') + '</tr>';
    var body = grid.map(function (row, di) {
      return '<tr><td class="pr-2 text-base-content/60">' + WEEKDAYS[di] + '</td>' + row.map(function (n, hi) {
        var a = max ? n / max : 0;
        return '<td title="' + WEEKDAYS[di] + ' ' + hi + 'u: ' + n + ' sessies" style="width:3.5%;height:18px;background:rgba(37,99,235,' + (n ? 0.08 + a * 0.85 : 0) + ');border:1px solid rgba(0,0,0,.03)"></td>';
      }).join('') + '</tr>';
    }).join('');
    document.getElementById('webHeatmap').innerHTML = '<table class="w-full text-xs border-collapse">' + head + body + '</table>';
  }

  // --- filters & opmaak -----------------------------------------------------

  function renderChips() {
    var f = web.filter, chips = [];
    if (f.ch !== null) chips.push(['ch', 'Kanaal: ' + web.data.dict.ch[f.ch]]);
    if (f.det !== null) chips.push(['det', 'Bron: ' + web.data.dict.det[f.det]]);
    if (f.land !== null) chips.push(['land', 'Landingspagina: ' + web.data.dict.p[f.land]]);
    if (f.dev !== null) chips.push(['dev', 'Toestel: ' + (DEV_LABELS[web.data.dict.dev[f.dev]] || web.data.dict.dev[f.dev])]);
    if (f.visit) chips.push(['visit', f.visit === 'new' ? 'Nieuwe bezoekers' : 'Terugkerende bezoekers']);
    var el = document.getElementById('webChips');
    el.innerHTML = chips.length
      ? chips.map(function (c) { return '<button class="btn btn-xs btn-primary btn-outline" data-web-action="clearFilter" data-kind="' + c[0] + '">' + esc(c[1]) + ' ✕</button>'; }).join('')
        + '<button class="btn btn-xs btn-ghost" data-web-action="clearAll">Alle filters wissen</button>'
      : '<span class="text-xs text-base-content/50">Klik op een kanaal, bron, landingspagina of toestel om het hele dashboard daarop te filteren.</span>';
  }

  function renderNote(cur) {
    var el = document.getElementById('webDataNote');
    var hist = cur.filter(function (s) { return s[C.flags] & F.historic; }).length;
    var live = web.data.oudsteLive ? web.data.oudsteLive.slice(0, 10).split('-').reverse().join('/') : null;
    if (!cur.length || !hist) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<i data-lucide="info" class="w-4 h-4 shrink-0"></i><span>'
      + pctTxt(pct(hist, cur.length), 0) + ' van deze sessies komt uit de oude opslag in Odoo'
      + (live ? ' (volledig gemeten sinds ' + esc(live) + ')' : '') + '. Daar ontbreken verwijzer en toestel, dus "Direct / onbekend" is voor die sessies te groot. '
      + 'Voor bezoekers die later terugkwamen, werden bovendien klikken en korte bezoeken weggecomprimeerd. Conversies en advertentieklikken zijn volledig.</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  // --- wat leidde tot de conversie (server: lib/web-attribution.js) -----------

  async function loadAttribution() {
    var body = document.getElementById('webAttrChannels');
    var paths = document.getElementById('webAttrPaths');
    body.innerHTML = '<tr><td colspan="5"><span class="loading loading-spinner loading-sm"></span></td></tr>';
    paths.innerHTML = '';
    try {
      var a = await fetchJson('/dashboards/api/web-attribution?period=' + encodeURIComponent(web.period));
      if (!a.available || !a.conversies) {
        body.innerHTML = '<tr><td colspan="5" class="text-base-content/60">Geen conversies in deze periode.</td></tr>';
        return;
      }
      var chip = function (ch) {
        return '<span class="inline-flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full" style="background-color:' + (CHANNEL_COLORS[ch] || '#94a3b8') + '"></span>' + esc(ch) + '</span>';
      };
      body.innerHTML = a.kanalen.map(function (k) {
        return '<tr><td>' + chip(k.channel) + '</td><td class="text-right">' + nf(k.eerste) + '</td><td class="text-right">' + nf(k.laatste)
          + '</td><td class="text-right">' + nf(k.assist) + '</td><td class="text-right">' + k.positie.toLocaleString('nl-BE') + '</td></tr>';
      }).join('');
      paths.innerHTML = a.paden.map(function (p) {
        return '<div class="flex justify-between gap-3 text-sm"><span>' + p.pad.split(' → ').map(chip).join(' <span class="text-base-content/40">→</span> ')
          + '</span><span class="text-base-content/60 whitespace-nowrap">' + nf(p.n) + '×</span></div>';
      }).join('');
      var bits = [nf(a.conversies) + ' personen converteerden'];
      if (a.meer_dan_een_bezoek) bits.push(nf(a.meer_dan_een_bezoek) + ' van hen na meer dan één bezoek');
      if (a.mediaan_dagen !== null) bits.push('mediaan ' + a.mediaan_dagen + ' dagen en ' + a.mediaan_bezoeken + ' bezoeken tot de conversie');
      if (a.afgekapt) bits.push(nf(a.afgekapt) + ' personen niet meegeteld (te veel om in één keer te berekenen)');
      paths.insertAdjacentHTML('beforeend', '<p class="text-xs text-base-content/60 mt-3">' + esc(bits.join(' · ')) + '.</p>');
    } catch (err) {
      body.innerHTML = '<tr><td colspan="5" class="text-error">Kon niet laden: ' + esc(err.message) + '</td></tr>';
    }
  }

  function renderButtons() {
    document.querySelectorAll('[data-web-action="period"]').forEach(function (b) { b.classList.toggle('btn-active', b.dataset.value === web.period); });
    document.querySelectorAll('[data-web-action="site"]').forEach(function (b) { b.classList.toggle('btn-active', b.dataset.value === web.site); });
    document.querySelectorAll('[data-web-action="visit"]').forEach(function (b) { b.classList.toggle('btn-active', (b.dataset.value || null) === (web.filter.visit || null) || (!b.dataset.value && !web.filter.visit)); });
  }

  function renderAll() {
    if (!web.data) return;
    var parts = split();
    renderButtons();
    renderChips();
    renderNote(parts.cur);
    renderKpis(parts.cur, parts.prev);
    renderFunnel(parts.cur);
    renderTrend(parts.cur);
    renderChannels(parts.cur, parts.prev);
    renderDetails(parts.cur);
    renderLandings(parts.cur);
    renderPages(parts.cur);
    renderSearches(parts.cur);
    renderBeforeConversion(parts.cur);
    renderTimeToConv(parts.cur);
    renderDevices(parts.cur);
    renderHeatmap(parts.cur);
    document.getElementById('webPeriodLabel').textContent = PERIOD_LABELS[web.period] + ', vergeleken met de ' + PERIOD_LABELS[web.period].replace('laatste ', 'voorgaande ');
  }

  function setFilter(kind, value) {
    web.filter[kind] = value;
    if (kind === 'ch') web.filter.det = null;
    renderAll();
  }

  async function load() {
    if (web.loading) return;
    web.loading = true;
    var status = document.getElementById('webStatus');
    status.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Bezoeken laden…';
    status.classList.remove('hidden');
    try {
      var data = await fetchJson('/dashboards/api/web-visits?period=' + encodeURIComponent(web.period));
      if (!data.available) {
        status.innerHTML = '<div class="alert alert-warning">' + esc(data.reason || 'Nog geen bezoekersdata beschikbaar.') + '</div>';
        web.loading = false;
        return;
      }
      // Een filter op een waarde die in de nieuwe periode niet bestaat, zou alles leeg maken.
      ['det', 'land', 'dev'].forEach(function (k) { web.filter[k] = null; });
      web.data = data;
      status.classList.add('hidden');
      renderAll();
      loadAttribution();
    } catch (err) {
      status.innerHTML = '<div class="alert alert-error">Kon de bezoeken niet laden: ' + esc(err.message) + '</div>';
      console.error('web-visits', err);
    }
    web.loading = false;
  }

  // --- tabs -----------------------------------------------------------------

  function showTab(name) {
    document.querySelectorAll('[data-dash-tab]').forEach(function (t) { t.classList.toggle('tab-active', t.dataset.dashTab === name); });
    document.querySelectorAll('[data-dash-panel]').forEach(function (p) { p.classList.toggle('hidden', p.dataset.dashPanel !== name); });
    try { localStorage.setItem('dashboardsTab', name); } catch (_) { /* geen opslag */ }
    if (name === 'web' && !web.loaded) { web.loaded = true; load(); }
  }

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-dash-tab]');
    if (tab) { showTab(tab.dataset.dashTab); return; }
    var el = e.target.closest('[data-web-action]');
    if (!el) return;
    var action = el.dataset.webAction;
    if (action === 'period') { web.period = el.dataset.value; renderButtons(); load(); }
    else if (action === 'site') { web.site = el.dataset.value; renderAll(); }
    else if (action === 'visit') { web.filter.visit = el.dataset.value || null; renderAll(); }
    else if (action === 'filter') {
      var kind = el.dataset.kind, value = Number(el.dataset.value);
      setFilter(kind, web.filter[kind] === value ? null : value);
    }
    else if (action === 'clearFilter') { setFilter(el.dataset.kind, null); }
    else if (action === 'clearAll') { web.filter = { ch: null, det: null, land: null, dev: null, visit: null }; renderAll(); }
  });

  var saved = null;
  try { saved = localStorage.getItem('dashboardsTab'); } catch (_) { saved = null; }
  if (saved === 'web') showTab('web');
})();
