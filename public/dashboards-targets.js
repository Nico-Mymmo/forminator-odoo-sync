/**
 * Dashboards — tabblad "Targets" (vervangt Odoo-dashboard 19 "Targets & Funnel 2026-2027").
 *
 * Wat erin zit, en waarom anders dan in Odoo:
 *  - Targets per product en maand, RECHTSTREEKS in de tabel te wijzigen (geen
 *    gele cellen in een spreadsheet in bewerkmodus). Ze staan in dashboard_targets,
 *    dezelfde tabel als de aanvraagdoelen, zodat een target overal hetzelfde is:
 *    het tabblad Verkoop toont de target Assistant + OpenVME Professional bij de
 *    nieuwe abonnementen, en de benodigde MQL's kunnen als aanvraagtarget gezet worden.
 *  - Realisatie per maand, klikbaar tot op de order of de lead.
 *  - Funnel per instroommaand, met de onrijpe maand gearceerd (niet weggelaten).
 *  - Omgekeerde funnel en MQL-dekking, met de ratiokeuze (a/b/c) als knop.
 *
 * Merk- en productregels voor leads: src/modules/dashboards/lib/sales/lead-rules.js
 * (dezelfde als de Odoo-serveractie die de x_dash-velden vult).
 */
(function () {
  'use strict';
  var K = window.OMDash;
  var root = document.querySelector('[data-dash-panel="targets"]');
  if (!K || !root) return;
  var esc = K.esc, nf = K.nf, $ = K.$;
  var A = 'data-tg-action';
  var STORE = 'dashboards.targets.v1';
  var STAGES = ['MQL', 'SQL', 'Demo', 'Follow Up', 'Conversion', 'Won'];
  var RATIO_KEYS = ['mql_sql', 'sql_demo', 'demo_follow', 'follow_conv', 'conv_won'];
  var RATIO_LABELS = ['MQL → SQL', 'SQL → Demo', 'Demo → Follow Up', 'Follow Up → Conversion', 'Conversion → Won'];
  // Leadkolommen (derive.js): [id, aanmaakdatum, merk(1=Syndicoach), product, fase-nr, verloren, wondatum, verkoper, kanaal, herkomst, verliesreden, opportunity, klant,
  //  naam, waarom-dit-merk (dict mw), waarom-dit-product (dict pw)]
  var L = { id: 0, cd: 1, sc: 2, prod: 3, nr: 4, lost: 5, won: 6, user: 7, ch: 8, org: 9, lr: 10, opp: 11, cust: 12, name: 13, mw: 14, pw: 15 };

  var st = { data: null, loading: false, fy: null, f: { merk: '', user: '', ch: '' }, ratio: 'a', unripe: false, prod: 'assistant',
    targets: {}, leadTargets: {}, dirty: {}, edit: false, manual: null };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) { if (saved.f) Object.assign(st.f, saved.f); if (saved.ratio) st.ratio = saved.ratio; st.unripe = !!saved.unripe; if (saved.prod) st.prod = saved.prod; }
  } catch (_) { /* geen opslag */ }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ f: st.f, ratio: st.ratio, unripe: st.unripe, prod: st.prod })); } catch (_) { /* geen opslag */ } }

  function card(id, title, sub) {
    return '<div class="rounded-2xl bg-base-100 border border-base-content/10 p-5" id="' + id + 'Card"><div class="flex flex-wrap items-start justify-between gap-2 mb-3"><div><h2 class="font-semibold">' + title + '</h2>'
      + (sub ? '<p class="text-xs text-base-content/50 mt-0.5" id="' + id + 'Sub">' + sub + '</p>' : '') + '</div><div id="' + id + 'Controls" class="flex flex-wrap items-center gap-2"></div></div><div id="' + id + '"></div></div>';
  }
  root.innerHTML =
    '<div class="flex flex-wrap items-end justify-between gap-3 mb-4">'
    + '<div><h1 class="text-2xl font-bold">Targets</h1><p class="text-sm text-base-content/60">Halen we onze targets, en hoeveel aanvragen hebben we daarvoor nodig?</p></div>'
    + '<div id="tgStatus"></div></div><div id="tgNotice" class="mb-3"></div>'
    + '<div class="grid grid-cols-1 gap-5 items-start lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">'
    + '<aside class="om-scroll space-y-3 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[calc(48px+1rem)] lg:max-h-[calc(100vh-48px-2rem)] lg:overflow-y-auto">'
    +   '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-3 space-y-2"><div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 flex items-center gap-1"><i data-lucide="target" class="w-3 h-3"></i> Je bekijkt</div>'
    +   '<p id="tgSentence" class="text-sm"></p></div><div id="tgFilters"></div></aside>'
    + '<aside class="om-scroll min-w-0 lg:col-start-2 lg:row-start-1 2xl:col-start-3 2xl:sticky 2xl:top-[calc(48px+1rem)] 2xl:max-h-[calc(100vh-48px-2rem)] 2xl:overflow-y-auto">'
    +   '<div class="rounded-2xl bg-base-100 border border-base-content/10 p-5 2xl:p-3"><div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Behaald, tot nu toe</div>'
    +   '<div id="tgKpis" class="grid grid-cols-2 md:grid-cols-3 gap-3 2xl:grid-cols-1 2xl:gap-0 2xl:divide-y om-lijnen"></div></div></aside>'
    + '<div class="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2 2xl:row-start-1">'
    +   card('tgGrid', 'Targets en realisatie', 'Nieuwe aantallen per maand. Klik op een realisatie voor de lijst; "Targets wijzigen" maakt de targetrijen bewerkbaar.')
    +   card('tgCum', 'Cumulatief', 'Target en realisatie opgeteld sinds het begin van het boekjaar.')
    +   card('tgFunnel', 'Funnel per instroommaand', 'N(≥fase) = leads die die fase bereikten, ook als ze nadien verloren gingen. Conversie = N(≥volgende) / N(≥fase).')
    +   card('tgReverse', 'Omgekeerde funnel', 'Hoeveel leads er per fase nodig zijn om de targets te halen, met de gekozen ratio\'s.')
    +   card('tgCoverage', 'MQL-dekking', 'Benodigde MQL\'s per merk tegenover wat er binnenkwam. Rood < 80%, oranje 80–100%, groen ≥ 100%. De lopende maand is nog niet af.')
    +   '<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">' + card('tgUsers', 'Per verkoper', 'Leads van de instroommaanden hierboven.') + card('tgLost', 'Verliesredenen', 'Per merk en de fase waarin de lead verloren ging (top 15).') + '</div>'
    +   card('tgRatios', 'Handmatige doelratio\'s (keuze c)', 'Gebruikt in de omgekeerde funnel als de ratiokeuze op c staat.')
    +   card('tgDq', 'Datakwaliteit', 'Leads die niet of verkeerd meetellen.')
    + '</div></div>';

  function D(kind, i) { return st.data.dict[kind] ? st.data.dict[kind][i] : ''; }
  function fyMonths() { return K.months(st.fy, K.addMonths(st.fy, 11)); }
  function curMonth() { return K.monthOf(st.data.meta.today); }
  function products() { return st.data.meta.products; }
  function prodIdx(key) { return st.data.leadProducts.indexOf(key); }
  function leads() { return st.data.leads; }
  function leadOk(r, skipMerk) {
    var f = st.f;
    if (!skipMerk && f.merk !== '' && String(r[L.sc]) !== f.merk) return false;
    if (f.user !== '' && String(r[L.user]) !== f.user) return false;
    if (f.ch !== '' && String(r[L.ch]) !== f.ch) return false;
    return true;
  }
  function chainUserOk(ch) { return st.f.user === '' || String(ch.user) === st.f.user; }

  // ── Realisatie per product en maand ───────────────────────────────────────
  function realisation() {
    var out = {}, items = {};
    var add = function (key, m, v, it) { (out[key] = out[key] || {})[m] = ((out[key] || {})[m] || 0) + v; (items[key + '|' + m] = items[key + '|' + m] || []).push(it); };
    var assist = st.data.meta.assistantLicenses, pro = st.data.meta.proLicense;
    st.data.chains.forEach(function (ch) {
      if (ch.newSwitch || (ch.end && ch.end <= ch.start) || !chainUserOk(ch)) return;
      var m = K.monthOf(ch.start), p = ch.p[0];
      var it = { kind: 'chain', ch: ch, p: p, d: ch.start };
      if (assist.indexOf(ch.licId) >= 0) add('assistant', m, 1, it);
      if (ch.licId === pro) add('openvme_professional', m, 1, it);
    });
    st.data.trans.forEach(function (r) {
      var g = D('tg', r[3]), m = K.monthOf(r[0]);
      if (!m) return;
      if (g === 'Opstarthulp') add('opstarthulp', m, r[4], { kind: 'trans', r: r });
      if (g === 'Credits') add('expert_uren', m, r[4] / 3, { kind: 'trans', r: r });
    });
    var cap = prodIdx('captain'), ps = prodIdx('prof_syndicus');
    leads().forEach(function (r) {
      if (!r[L.won] || !leadOk(r, true)) return;
      var m = K.monthOf(r[L.won]);
      if (r[L.prod] === cap) add('captain', m, 1, { kind: 'lead', r: r });
      if (r[L.prod] === ps) add('prof_syndici', m, 1, { kind: 'lead', r: r });
    });
    return { v: out, items: items };
  }
  function tgt(metric, m) { var t = st.targets[metric]; var d = st.dirty[metric + '|' + m]; if (d !== undefined) return d === '' ? null : Number(d); return t && t[m] !== undefined ? t[m] : null; }
  function sum(arr) { return arr.reduce(function (s, v) { return s + (v || 0); }, 0); }
  function round(v, d) { var f = Math.pow(10, d || 0); return Math.round(v * f) / f; }

  // ── Funnel ────────────────────────────────────────────────────────────────
  function cohortStart() { return K.monthOf(K.addMonths(st.fy, -2)); }
  function unripeFrom() { return K.addDays(st.data.meta.today, -30); }
  /** N(≥k) voor k = 1..6 over een lijst leads. */
  function nGe(list) { var n = [0, 0, 0, 0, 0, 0]; list.forEach(function (r) { for (var k = 1; k <= 6; k++) if (r[L.nr] >= k) n[k - 1]++; }); return n; }
  function ratiosFrom(n) { return RATIO_KEYS.map(function (_, i) { return n[i] ? n[i + 1] / n[i] : null; }); }
  /** Ratio's per merk: altijd over ALLE leads (geen verkoper/kanaal-filter), zoals in Odoo-dashboard 19. */
  function ratios(sc) {
    var cs = cohortStart(), today = st.data.meta.today, uf = unripeFrom();
    var all = leads().filter(function (r) { return r[L.sc] === sc && r[L.cd] >= cs && r[L.cd] <= today && r[L.nr] > 0; });
    var a = ratiosFrom(nGe(all.filter(function (r) { return st.unripe || r[L.cd] < uf; })));
    // (b): de laatste drie volledige maanden waarvan het einde meer dan 30 dagen voorbij is.
    var lastRipe = K.monthOf(K.addMonths(K.monthOf(uf), -1));
    if (K.monthEnd(K.monthOf(uf)) < uf) lastRipe = K.monthOf(uf);
    var bFrom = K.addMonths(lastRipe, -2);
    var bList = all.filter(function (r) { var m = K.monthOf(r[L.cd]); return m >= bFrom && m <= lastRipe; });
    var b = ratiosFrom(nGe(bList));
    var man = (st.manual || {})[sc ? 'syndicoach' : 'openvme'] || {};
    var c = RATIO_KEYS.map(function (k) { return man[k] === undefined ? null : Number(man[k]); });
    var used = st.ratio === 'b' ? b : st.ratio === 'c' ? c : a;
    var won = function (r) { return r.every(function (x) { return x !== null; }) ? r.reduce(function (p, x) { return p * x; }, 1) : null; };
    return { a: a, b: b, c: c, used: used, won: won(used), wonA: won(a), wonB: won(b), wonC: won(c), bWindow: [bFrom, lastRipe] };
  }

  // ── Tekenen ───────────────────────────────────────────────────────────────
  function renderFilters() {
    var y = Number(st.data.meta.today.slice(0, 4)), cur = K.fyStart(st.data.meta.today, st.data.meta.fyStartMonth);
    var fys = [-1, 0, 1].map(function (d) { var s = K.addMonths(cur, 12 * d); return [s, s.slice(0, 4) + '-' + String(Number(s.slice(0, 4)) + 1).slice(2)]; });
    var counts = function (col) { var m = {}; leads().forEach(function (r) { if (r[L.cd] >= cohortStart()) m[r[col]] = (m[r[col]] || 0) + 1; }); return m; };
    var uc = counts(L.user), cc = counts(L.ch);
    var mk = function (kind, c) { return (st.data.dict[kind] || []).map(function (n, i) { return [String(i), n, c[i] || 0]; }).filter(function (o) { return o[2] > 0; }).sort(function (a, b) { return b[2] - a[2]; }); };
    $('tgFilters').innerHTML = '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-4 space-y-3 lg:p-3">'
      + '<div>' + K.groupLabel('Boekjaar', 'Het boekjaar begint in ' + K.monthLabel(cur, true).split(' ')[0] + '.') + K.pills(A, 'fy', null, fys, st.fy, true) + '</div>'
      + '<div>' + K.groupLabel('Merk', 'Filtert de funnel, de verkopers en de verliesredenen. De realisatie per product heeft haar merk al.')
      + K.pills(A, 'merk', null, [['', 'Alle'], ['0', 'OpenVME'], ['1', 'Syndicoach']], st.f.merk, true) + '</div>'
      + K.select('data-tg-select', 'user', 'Verkoper', mk('user', uc), st.f.user, 'Geldt voor de funnel en voor de realisatie uit orders en leads (niet voor opstarthulp en credits: die hebben geen verkoper).')
      + K.select('data-tg-select', 'ch', 'Kanaal', mk('ch', cc), st.f.ch, 'Kanaal van de lead, ingedeeld zoals in het tabblad Aanvragen (merk-herkomst + x_studio_lead_channel). Geldt voor de funnel.')
      + '<div class="pt-3 border-t border-base-content/10">' + K.groupLabel('Ratiokeuze', '(a) cumulatief sinds het begin van de instroom, (b) de laatste drie rijpe maanden, (c) handmatige doelratio\'s (onderaan).')
      + K.pills(A, 'ratio', null, [['a', 'a · cumulatief'], ['b', 'b · 3 maanden'], ['c', 'c · handmatig']], st.ratio, true) + '</div>'
      + '<div>' + K.groupLabel('Onrijpe leads in ratio (a)', 'Leads van de laatste 30 dagen zijn nog niet doorgestroomd en drukken de ratio\'s. Standaard tellen ze niet mee in de ratio; in de funnel staan ze wel, gearceerd.')
      + K.pills(A, 'unripe', null, [['0', 'Uitsluiten'], ['1', 'Meetellen']], st.unripe ? '1' : '0', true) + '</div>'
      + '</div>';
  }

  function renderKpis(R) {
    var ms = fyMonths(), cm = curMonth(), ytd = ms.filter(function (m) { return m <= cm; });
    var tiles = products().map(function (p) {
      var tY = sum(ytd.map(function (m) { return tgt(p.key, m); })), rY = sum(ytd.map(function (m) { return (R.v[p.key] || {})[m]; }));
      var tAll = sum(ms.map(function (m) { return tgt(p.key, m); }));
      var pc = tY ? rY / tY * 100 : null;
      return K.tile({ attr: A, label: p.label + (p.unit ? ' (' + p.unit + ')' : ''), value: '<span class="' + K.achievedClass(pc) + '">' + (pc === null ? '—' : K.pctTxt(pc, 0)) + '</span>',
        sub: nf(rY, p.decimals ? 1 : 0) + ' van ' + nf(tY, p.decimals ? 1 : 0) + ' tot nu · jaar ' + nf(tAll, p.decimals ? 1 : 0),
        // Mini-verloop: de realisatie per maand van het gekozen boekjaar, dezelfde reeks als in het venster.
        series: ms.map(function (m) { return m > cm ? null : (R.v[p.key] || {})[m] || 0; }), help: p.source, drill: 'kpi:r:' + p.key });
    });
    var cov = coverage(R);
    ['openvme', 'syndicoach'].forEach(function (b) {
      var c = cov[b], need = c.need[cm], got = c.got[cm];
      tiles.push(K.tile({ attr: A, label: 'MQL deze maand · ' + (b === 'openvme' ? 'OpenVME' : 'Syndicoach'),
        value: '<span class="' + K.achievedClass(need ? got / need * 100 : null) + '">' + nf(got) + '</span> / ' + (need === null || need === undefined ? '—' : nf(need)),
        sub: 'binnen / nodig (de maand is nog niet af)', drill: 'kpi:mql:' + b,
        series: ms.map(function (m) { return m > cm ? null : c.got[m]; }) }));
    });
    $('tgKpis').innerHTML = tiles.join('');
  }

  function renderGrid(R) {
    var ms = fyMonths(), cm = curMonth();
    $('tgGridControls').innerHTML = st.edit
      ? '<button class="btn btn-sm btn-primary" ' + A + '="save">Opslaan</button><button class="btn btn-sm btn-ghost" ' + A + '="cancel">Annuleren</button>'
        + '<button class="btn btn-sm btn-ghost" ' + A + '="copy-prev" title="Neem de targets van het vorige boekjaar over in de lege cellen">Vorig jaar overnemen</button>'
      : '<button class="btn btn-sm" ' + A + '="edit"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Targets wijzigen</button>';
    var head = '<tr><th class="sticky left-0 bg-base-100 z-10">Product</th><th></th>' + ms.map(function (m) { return '<th class="text-right ' + (m === cm ? 'text-primary' : '') + '">' + K.monthLabel(m) + '</th>'; }).join('') + '<th class="text-right">Tot nu</th><th class="text-right">Jaar</th></tr>';
    var rowsFor = function (p, virtual) {
      var tv = ms.map(function (m) { return virtual ? virtual.t(m) : tgt(p.key, m); });
      var rv = ms.map(function (m) { return virtual ? virtual.r(m) : ((R.v[p.key] || {})[m] || 0); });
      var ytdIdx = ms.map(function (m, i) { return m <= cm ? i : -1; }).filter(function (i) { return i >= 0; });
      var tY = sum(ytdIdx.map(function (i) { return tv[i]; })), rY = sum(ytdIdx.map(function (i) { return rv[i]; }));
      var d = p.decimals ? 1 : 0, ttl = esc(p.label) + (p.unit ? ' <span class="text-base-content/50">(' + p.unit + ')</span>' : '');
      var tRow = '<tr class="border-t border-base-content/10"><th class="sticky left-0 bg-base-100 z-10 align-top" rowspan="4"><div class="font-semibold">' + ttl + '</div><div class="text-[11px] font-normal text-base-content/50 max-w-[14rem] whitespace-normal">' + esc(p.source) + '</div></th>'
        + '<td class="text-xs text-base-content/60">Target</td>' + ms.map(function (m, i) {
          if (st.edit && !virtual) {
            var key = p.key + '|' + m, dv = st.dirty[key];
            return '<td class="text-right"><input type="number" min="0" step="' + (p.decimals ? '0.25' : '1') + '" class="input input-bordered input-xs w-16 text-right ' + (dv !== undefined ? 'border-primary bg-primary/5' : '') + '" data-tg-input="' + key + '" value="' + (tv[i] === null ? '' : tv[i]) + '"></td>';
          }
          return '<td class="text-right tabular-nums">' + (tv[i] === null ? '<span class="text-base-content/30">—</span>' : nf(tv[i], d)) + '</td>';
        }).join('') + '<td class="text-right tabular-nums">' + nf(tY, d) + '</td><td class="text-right tabular-nums">' + nf(sum(tv), d) + '</td></tr>';
      var rRow = '<tr><td class="text-xs text-base-content/60">Gerealiseerd</td>' + ms.map(function (m, i) {
        if (m > cm) return '<td></td>';
        return '<td class="text-right tabular-nums font-medium"><a class="link link-hover" ' + A + '="drill" data-drill="r:' + p.key + ':' + m + '">' + nf(rv[i], d) + '</a></td>';
      }).join('') + '<td class="text-right tabular-nums font-medium">' + nf(rY, d) + '</td><td class="text-right tabular-nums">' + nf(sum(rv), d) + '</td></tr>';
      var dRow = '<tr><td class="text-xs text-base-content/60">Verschil</td>' + ms.map(function (m, i) {
        if (m > cm || tv[i] === null) return '<td></td>';
        var x = rv[i] - tv[i]; return '<td class="text-right tabular-nums text-xs ' + (x >= 0 ? 'text-success' : 'text-error') + '">' + (x >= 0 ? '+' : '−') + nf(Math.abs(x), d) + '</td>';
      }).join('') + '<td class="text-right tabular-nums text-xs">' + (rY - tY >= 0 ? '+' : '−') + nf(Math.abs(rY - tY), d) + '</td><td></td></tr>';
      var pRow = '<tr><td class="text-xs text-base-content/60">% behaald</td>' + ms.map(function (m, i) {
        if (m > cm || !tv[i]) return '<td></td>';
        var pc = rv[i] / tv[i] * 100; return '<td class="text-right text-xs font-medium ' + K.achievedBg(pc) + ' ' + K.achievedClass(pc) + '">' + K.pctTxt(pc, 0) + '</td>';
      }).join('') + (function () { var pc = tY ? rY / tY * 100 : null; return '<td class="text-right text-xs font-medium ' + K.achievedBg(pc) + ' ' + K.achievedClass(pc) + '">' + K.pctTxt(pc, 0) + '</td>'; })()
        + (function () { var t = sum(tv), pc = t ? rY / t * 100 : null; return '<td class="text-right text-xs ' + K.achievedClass(pc) + '" title="Van de jaartarget">' + K.pctTxt(pc, 0) + '</td>'; })() + '</tr>';
      return tRow + rRow + dRow + pRow;
    };
    var vmes = VMES;
    var virt = { t: function (m) { var a = tgt('assistant', m), c = tgt('captain', m); return a === null && c === null ? null : (a || 0) + (c || 0); },
      r: function (m) { return ((R.v.assistant || {})[m] || 0) + ((R.v.openvme_professional || {})[m] || 0); } };
    $('tgGrid').innerHTML = '<div class="overflow-x-auto"><table class="table table-xs">' + '<thead>' + head + '</thead><tbody>'
      + products().map(function (p) { return rowsFor(p); }).join('') + rowsFor(vmes, virt) + '</tbody></table></div>'
      + (Object.keys(st.dirty).length ? '<p class="text-xs text-primary mt-2">' + nf(Object.keys(st.dirty).length) + ' gewijzigde cel(len), nog niet opgeslagen. Een lege cel = geen target (niet 0).</p>' : '')
      + '<p class="text-[11px] text-base-content/50 mt-2">"Tot nu" = de maanden van het boekjaar tot en met de lopende maand. Een wissel (planwissel of correctie bij een bestaande klant) telt niet als nieuw contract; een contract dat intussen gestopt is, telt wel (het werd in die maand verkocht).</p>';
  }

  function renderCum(R) {
    var ms = fyMonths(), cm = curMonth(), p = products().filter(function (x) { return x.key === st.prod; })[0] || products()[0];
    $('tgCumControls').innerHTML = K.pills(A, 'prod', null, products().map(function (x) { return [x.key, x.label.replace(/ \(.*\)/, '')]; }), p.key);
    var ct = 0, cr = 0, hasT = false;
    var tSeries = ms.map(function (m) { var v = tgt(p.key, m); if (v !== null) hasT = true; ct += v || 0; return round(ct, 2); });
    var rSeries = ms.map(function (m) { if (m > cm) return null; cr += (R.v[p.key] || {})[m] || 0; return round(cr, 2); });
    $('tgCum').innerHTML = '<div style="height:240px"><canvas id="tgCumChart" aria-label="Cumulatieve target en realisatie"></canvas></div>'
      + (hasT ? '' : '<p class="text-xs text-base-content/50 mt-1">Voor dit product staat er nog geen target in dit boekjaar.</p>');
    K.chart('tgCumChart', {
      type: 'line', data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: [
        K.area('Gerealiseerd (cumulatief)', rSeries, '--p', { pointRadius: 3, pointBorderColor: getComputedStyle(document.body).backgroundColor || '#fff', pointBorderWidth: 2 }),
        K.refLine('Target (cumulatief)', tSeries, { pointRadius: 2 })
      ] },
      options: K.baseOptions({ plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (c.parsed.y === null ? '—' : nf(c.parsed.y, p.decimals ? 1 : 0)); } } } },
        onClick: function (evt, els) { if (els.length) openKpi('r', p.key, els[0].index); },
        onHover: function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } })
    });
  }

  function renderFunnel() {
    var cs = cohortStart(), today = st.data.meta.today, uf = unripeFrom();
    var ms = K.months(cs, K.addMonths(st.fy, 11)).filter(function (m) { return m <= today; });
    var brands = st.f.merk === '' ? [[0, 'OpenVME'], [1, 'Syndicoach'], [null, 'Totaal']] : [[Number(st.f.merk), st.f.merk === '1' ? 'Syndicoach' : 'OpenVME']];
    var base = leads().filter(function (r) { return r[L.cd] >= cs && r[L.cd] <= today && r[L.nr] > 0 && leadOk(r, true); });
    var html = '<div class="grid grid-cols-1 ' + (brands.length > 1 ? 'xl:grid-cols-3' : '') + ' gap-4">';
    brands.forEach(function (b) {
      var list = base.filter(function (r) { return b[0] === null || r[L.sc] === b[0]; }), n = nGe(list);
      html += '<div><h3 class="text-sm font-semibold mb-2">' + b[1] + ' <span class="font-normal text-base-content/50">· ' + nf(n[0]) + ' leads</span></h3>'
        + STAGES.map(function (s, k) {
          var w = n[0] ? n[k] / n[0] * 100 : 0, conv = k && n[k - 1] ? n[k] / n[k - 1] * 100 : null;
          return '<button type="button" class="block w-full text-left mb-1 rounded om-hover" ' + A + '="drill" data-drill="fb:' + (b[0] === null ? 'a' : b[0]) + ':' + (k + 1) + '" title="Bekijk de leads die ' + s + ' bereikten">'
            + '<div class="flex justify-between text-xs"><span>' + s + '</span><span class="tabular-nums">' + nf(n[k]) + (conv !== null ? ' <span class="text-base-content/50">(' + K.pctTxt(conv, 0) + ')</span>' : '') + '</span></div>'
            + '<div class="h-2 rounded om-spoor"><div class="h-2 rounded bg-primary" style="width:' + w.toFixed(1) + '%"></div></div></button>';
        }).join('')
        + '<div class="text-xs text-base-content/60 mt-1">MQL → Won: ' + K.pctTxt(n[0] ? n[5] / n[0] * 100 : null, 1) + '</div></div>';
    });
    html += '</div>';
    // Per instroommaand.
    var sc = st.f.merk === '' ? null : Number(st.f.merk);
    var rows = ms.map(function (m) {
      var list = base.filter(function (r) { return K.monthOf(r[L.cd]) === m && (sc === null || r[L.sc] === sc); });
      var n = nGe(list), unripe = K.monthEnd(m) >= uf;
      return { m: m, n: n, unripe: unripe };
    });
    html += '<div class="overflow-x-auto mt-5"><table data-om-sortable class="table table-xs"><thead><tr><th>Instroommaand</th>' + STAGES.map(function (s) { return '<th class="text-right">N≥' + s + '</th>'; }).join('')
      + RATIO_LABELS.map(function (l) { return '<th class="text-right">' + l + '</th>'; }).join('') + '<th class="text-right">MQL → Won</th></tr></thead><tbody>'
      + rows.map(function (r) {
        var rt = ratiosFrom(r.n);
        return '<tr class="' + (r.unripe ? 'om-hatch' : '') + '"><td>' + K.monthLabel(r.m, true) + (r.unripe ? ' <span class="text-[10px] text-base-content/50" title="Bevat leads van de laatste 30 dagen: die zijn nog niet doorgestroomd.">onrijp</span>' : '') + '</td>'
          + r.n.map(function (v, k) { return '<td class="text-right tabular-nums"><a class="link link-hover" ' + A + '="drill" data-drill="f:' + r.m + ':' + (k + 1) + '">' + nf(v) + '</a></td>'; }).join('')
          + rt.map(function (x) { return '<td class="text-right text-xs">' + K.pctTxt(x === null ? null : x * 100, 0) + '</td>'; }).join('')
          + '<td class="text-right text-xs font-medium">' + K.pctTxt(r.n[0] ? r.n[5] / r.n[0] * 100 : null, 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      + '<p class="text-[11px] text-base-content/50 mt-2">Won = trial opgestart of kans op gewonnen gezet, nog geen betalende klant. Gearceerd = onrijp; de cijfers tellen gewoon mee.</p>';
    $('tgFunnel').innerHTML = html;
  }

  function needChain(won, r) {
    // Won -> Conversion -> Follow Up -> Demo -> SQL -> MQL, telkens naar boven afgerond.
    var out = [won], cur = won;
    for (var i = RATIO_KEYS.length - 1; i >= 0; i--) { cur = r[i] ? Math.ceil(cur / r[i]) : null; out.push(cur); if (cur === null) break; }
    return out;
  }
  function renderReverse() {
    var ms = fyMonths(), ro = ratios(0), rs = ratios(1);
    var ratTable = '<table class="table table-xs"><thead><tr><th>Stap</th><th class="text-right">OpenVME (a)</th><th class="text-right">(b)</th><th class="text-right">(c)</th><th class="text-right">Syndicoach (a)</th><th class="text-right">(b)</th><th class="text-right">(c)</th></tr></thead><tbody>'
      + RATIO_LABELS.map(function (l, i) {
        var cell = function (v, used, drill) {
          var txt = K.pctTxt(v === null ? null : v * 100, 0);
          return '<td class="text-right text-xs ' + (used ? 'font-semibold text-primary' : '') + '">' + (drill ? '<a class="link link-hover" ' + A + '="drill" data-drill="' + drill + '">' + txt + '</a>' : txt) + '</td>';
        };
        return '<tr><td>' + l + '</td>' + cell(ro.a[i], st.ratio === 'a', 'ratio:0:a:' + i) + cell(ro.b[i], st.ratio === 'b', 'ratio:0:b:' + i) + cell(ro.c[i], st.ratio === 'c')
          + cell(rs.a[i], st.ratio === 'a', 'ratio:1:a:' + i) + cell(rs.b[i], st.ratio === 'b', 'ratio:1:b:' + i) + cell(rs.c[i], st.ratio === 'c') + '</tr>';
      }).join('')
      + '<tr class="font-medium"><td>MQL → Won</td>' + [ro.wonA, ro.wonB, ro.wonC, rs.wonA, rs.wonB, rs.wonC].map(function (v) { return '<td class="text-right text-xs">' + K.pctTxt(v === null ? null : v * 100, 1) + '</td>'; }).join('') + '</tr></tbody></table>'
      + '<p class="text-[11px] text-base-content/50 mt-1">(a) instroom sinds ' + K.monthLabel(cohortStart(), true) + (st.unripe ? ', onrijpe leads meegeteld' : ', zonder de leads van de laatste 30 dagen') + '. (b) ' + K.monthLabel(ro.bWindow[0], true) + ' t.e.m. ' + K.monthLabel(ro.bWindow[1], true) + '. Ratio\'s rekenen altijd met alle leads van het merk (geen verkoper- of kanaalfilter).</p>';
    var stages = ['Won (= target)', 'Conversion', 'Follow Up', 'Demo', 'SQL', 'MQL'];
    var body = products().filter(function (p) { return p.stream; }).map(function (p) {
      var r = (p.stream === 'syndicoach' ? rs : ro).used;
      var per = ms.map(function (m) { var t = tgt(p.key, m); return t === null ? null : needChain(t, r); });
      return '<tr class="border-t border-base-content/10"><th colspan="' + (ms.length + 2) + '" class="pt-3">' + esc(p.label) + ' <span class="font-normal text-base-content/50">· ' + (p.stream === 'syndicoach' ? 'Syndicoach' : 'OpenVME') + '-ratio\'s</span></th></tr>'
        + stages.map(function (s, k) {
          return '<tr><td class="text-xs">' + s + '</td>' + per.map(function (x) { return '<td class="text-right tabular-nums text-xs ' + (k === 5 ? 'font-semibold' : '') + '">' + (x && x[k] !== undefined && x[k] !== null ? nf(x[k]) : '—') + '</td>'; }).join('')
            + '<td class="text-right tabular-nums text-xs">' + nf(sum(per.map(function (x) { return x ? x[k] : 0; }))) + '</td></tr>';
        }).join('');
    }).join('');
    var ratioVerhouding = function (key) {
      return ms.map(function (m) { var a = tgt('assistant', m), x = tgt(key, m); return a ? round(x / a, 2) : null; });
    };
    $('tgReverse').innerHTML = ratTable
      + '<div class="overflow-x-auto mt-4"><table class="table table-xs"><thead><tr><th>Benodigd</th>' + ms.map(function (m) { return '<th class="text-right">' + K.monthLabel(m) + '</th>'; }).join('') + '<th class="text-right">Totaal</th></tr></thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="overflow-x-auto mt-4"><table class="table table-xs"><thead><tr><th>Zonder eigen leadstroom: verhouding t.o.v. Assistant</th>' + ms.map(function (m) { return '<th class="text-right">' + K.monthLabel(m) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + [['opstarthulp', 'Opstarthulp per Assistant'], ['expert_uren', 'Expert-uren per Assistant']].map(function (x) {
        return '<tr><td class="text-xs">' + x[1] + '</td>' + ratioVerhouding(x[0]).map(function (v) { return '<td class="text-right text-xs">' + (v === null || isNaN(v) ? '—' : nf(v, 2)) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function coverage() {
    var ms = fyMonths(), out = {};
    [['openvme', 0], ['syndicoach', 1]].forEach(function (b) {
      var r = ratios(b[1]), streamProducts = products().filter(function (p) { return p.stream === b[0]; });
      var need = {}, got = {}, needPs = {}, gotPs = {};
      ms.forEach(function (m) {
        var t = sum(streamProducts.map(function (p) { return tgt(p.key, m); }));
        need[m] = r.won ? Math.ceil(t / r.won) : null;
        var tps = tgt('prof_syndici', m);
        needPs[m] = b[0] === 'openvme' && r.won && tps !== null ? Math.ceil(tps / r.won) : null;
        var inc = leads().filter(function (x) { return x[L.sc] === b[1] && K.monthOf(x[L.cd]) === m && x[L.nr] > 0 && leadOk(x, true); });
        got[m] = inc.length;
        gotPs[m] = inc.filter(function (x) { return x[L.prod] === prodIdx('prof_syndicus'); }).length;
      });
      out[b[0]] = { need: need, got: got, needPs: needPs, gotPs: gotPs, ratio: r };
    });
    return out;
  }
  function renderCoverage() {
    var ms = fyMonths(), cm = curMonth(), cov = coverage();
    $('tgCoverageControls').innerHTML = '<button class="btn btn-sm" ' + A + '="apply-mql" title="Zet de benodigde MQL\'s als aanvraagtarget in het tabblad Aanvragen, voor deze en de komende maanden van het boekjaar">Als aanvraagtarget gebruiken</button>';
    var line = function (label, vals, cls, fmt) {
      return '<tr><td class="text-xs">' + label + '</td>' + ms.map(function (m) { var v = vals(m); return '<td class="text-right tabular-nums text-xs ' + (cls ? cls(m) : '') + '">' + (v === null || v === undefined ? '—' : (fmt || nf)(v)) + '</td>'; }).join('') + '</tr>';
    };
    var block = function (key, label) {
      var c = cov[key], started = ms.filter(function (m) { return m <= cm; });
      var pc = function (m) { return c.need[m] ? c.got[m] / c.need[m] * 100 : null; };
      var nY = sum(started.map(function (m) { return c.need[m]; })), gY = sum(started.map(function (m) { return c.got[m]; }));
      return '<tr class="border-t border-base-content/10"><th colspan="' + (ms.length + 1) + '" class="pt-3">' + label + ' <span class="font-normal text-base-content/50">· tot nu ' + nf(gY) + ' van ' + nf(nY) + ' (' + K.pctTxt(nY ? gY / nY * 100 : null, 0) + ')</span></th></tr>'
        + line('Benodigde MQL', function (m) { return c.need[m]; })
        + '<tr><td class="text-xs">Binnengekomen MQL</td>' + ms.map(function (m) { return '<td class="text-right tabular-nums text-xs">' + (m <= cm ? '<a class="link link-hover" ' + A + '="drill" data-drill="mql:' + key + ':' + m + '">' + nf(c.got[m]) + '</a>' : '—') + '</td>'; }).join('') + '</tr>'
        + line('Verschil', function (m) { return m <= cm && c.need[m] !== null ? c.got[m] - c.need[m] : null; }, function (m) { return c.got[m] - c.need[m] >= 0 ? 'text-success' : 'text-error'; }, function (v) { return (v >= 0 ? '+' : '−') + nf(Math.abs(v)); })
        + line('% dekking', function (m) { return m <= cm ? pc(m) : null; }, function (m) { return K.achievedBg(pc(m)) + ' ' + K.achievedClass(pc(m)) + ' font-medium'; }, function (v) { return K.pctTxt(v, 0); })
        + (key === 'openvme' ? line('…waarvan nodig voor prof. syndici', function (m) { return c.needPs[m]; }) + line('…binnengekomen prof.-syndicus-leads', function (m) { return m <= cm ? c.gotPs[m] : null; }) : '');
    };
    $('tgCoverage').innerHTML = '<div class="overflow-x-auto"><table class="table table-xs"><thead><tr><th></th>' + ms.map(function (m) { return '<th class="text-right ' + (m === cm ? 'text-primary' : '') + '">' + K.monthLabel(m) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + block('openvme', 'OpenVME (Assistant + professionele syndici)') + block('syndicoach', 'Syndicoach (Captain)') + '</tbody></table></div>'
      + '<p class="text-[11px] text-base-content/50 mt-2">Benodigd = (som van de targets met die leadstroom) ÷ MQL → Won van dat merk, naar boven afgerond. Binnengekomen = leads aangemaakt in die maand, met de filters verkoper en kanaal.</p>';
    st.coverage = cov;
  }

  function renderUsers() {
    var cs = cohortStart(), today = st.data.meta.today, g = {};
    leads().forEach(function (r) {
      if (r[L.cd] < cs || r[L.cd] > today || r[L.nr] <= 0 || !leadOk(r)) return;
      var k = r[L.user]; g[k] = g[k] || [0, 0, 0, 0]; g[k][0]++; if (r[L.nr] >= 2) g[k][1]++; if (r[L.nr] >= 3) g[k][2]++; if (r[L.nr] >= 6) g[k][3]++;
    });
    var keys = Object.keys(g).sort(function (a, b) { return g[b][0] - g[a][0]; });
    $('tgUsers').innerHTML = '<table data-om-sortable class="table table-xs"><thead><tr><th>Verkoper</th><th class="text-right">Leads</th><th class="text-right">≥SQL</th><th class="text-right">≥Demo</th><th class="text-right">Won</th><th class="text-right">MQL → Won</th></tr></thead><tbody>'
      + keys.map(function (k) { var x = g[k]; return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="u:' + k + '"><td>' + esc(D('user', Number(k))) + '</td>' + x.map(function (v) { return '<td class="text-right tabular-nums">' + nf(v) + '</td>'; }).join('') + '<td class="text-right text-xs">' + K.pctTxt(x[0] ? x[3] / x[0] * 100 : null, 1) + '</td></tr>'; }).join('')
      + '</tbody></table>';
  }

  function renderLost() {
    var cs = cohortStart(), today = st.data.meta.today, g = {};
    leads().forEach(function (r) {
      if (!r[L.lost] || r[L.cd] < cs || r[L.cd] > today || !leadOk(r)) return;
      var k = r[L.lr]; g[k] = g[k] || { o: 0, s: 0, st: [0, 0, 0, 0, 0, 0] }; if (r[L.sc]) g[k].s++; else g[k].o++; if (r[L.nr] > 0) g[k].st[r[L.nr] - 1]++;
    });
    var keys = Object.keys(g).sort(function (a, b) { return (g[b].o + g[b].s) - (g[a].o + g[a].s); }).slice(0, 15);
    $('tgLost').innerHTML = '<div class="overflow-x-auto"><table data-om-sortable class="table table-xs"><thead><tr><th>Reden</th><th class="text-right">OpenVME</th><th class="text-right">Syndicoach</th>' + STAGES.map(function (s) { return '<th class="text-right">in ' + s + '</th>'; }).join('') + '</tr></thead><tbody>'
      + keys.map(function (k) { var x = g[k]; return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="lr:' + k + '"><td>' + esc(D('lost', Number(k)) || '—') + '</td><td class="text-right">' + nf(x.o) + '</td><td class="text-right">' + nf(x.s) + '</td>' + x.st.map(function (v) { return '<td class="text-right text-xs">' + (v ? nf(v) : '') + '</td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div><p class="text-[11px] text-base-content/50 mt-1">Verloren = verliesreden ingevuld of gearchiveerd.</p>';
  }

  function renderRatios() {
    var man = st.manual || {};
    $('tgRatios').innerHTML = '<form id="tgRatioForm"><table class="table table-xs w-auto"><thead><tr><th>Stap</th><th>OpenVME</th><th>Syndicoach</th></tr></thead><tbody>'
      + RATIO_KEYS.map(function (k, i) {
        var inp = function (b) { var v = (man[b] || {})[k]; return '<td><input type="number" min="0" max="100" step="1" class="input input-bordered input-xs w-20 text-right" name="' + b + '.' + k + '" value="' + (v === undefined || v === null ? '' : Math.round(v * 100)) + '"> %</td>'; };
        return '<tr><td>' + RATIO_LABELS[i] + '</td>' + inp('openvme') + inp('syndicoach') + '</tr>';
      }).join('') + '</tbody></table><button class="btn btn-sm mt-2" type="submit">Ratio\'s bewaren</button></form>';
  }

  function renderDq() {
    var items = (st.data.attention || []).filter(function (a) { return /^lead_/.test(a.kind); });
    $('tgDq').innerHTML = items.length ? '<ul class="divide-y om-lijnen">' + items.map(function (a) {
      return '<li class="py-2"><div class="text-sm">' + esc(a.title) + '</div><div class="text-xs text-base-content/60">' + esc(a.detail) + '</div>'
        + (a.refs.length ? '<div class="text-xs mt-1 flex flex-wrap gap-x-3">' + a.refs.map(function (r) { return K.odooLink(r.model, r.id, r.label); }).join('') + '</div>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="text-sm text-base-content/60">Geen leads met een probleem gevonden.</p>';
  }

  // ── Doorklikken: waarom staan ze erin, en wat staaft het per rij ──────────
  // De teksten BESCHRIJVEN lead-rules.js en derive.js; ze beslissen niets.
  var TWHY = {
    merk: 'Merk van een lead: Syndicoach als ze merk-herkomst Syndicoach of Syndicuskiezen heeft, een kanaal dat met "syndicoach" begint, of "syndicoach" of "syndicus kiezen" in de naam of een label. Anders OpenVME: OpenVME heeft geen eigen signaal. Dezelfde regel als de Odoo-serveractie die dashboard 19 voedt.',
    product: 'Product van een lead, in deze volgorde: Expert aangevinkt of een professionele syndicus (bedrijf of contactpersoon) = Professionele syndicus; merk OpenVME = Assistant; Syndicoach met "captain" in de naam, een label of het pakket = Captain; met "opstarthulp" = Opstarthulp; anders Niet toegewezen.',
    fase: 'Fase = de plaats van de fase in de pijplijn (MQL, SQL, Demo, Follow Up, Conversion, Won). Een lead "bereikte" een fase als ze er nu in staat of verder; ook als ze nadien verloren ging.',
    won: 'Gewonnen = een actieve lead in een gewonnen fase. Datum = de sluitdatum, anders de laatste fasewijziging (in Brussel). Won = trial opgestart of kans gewonnen, nog geen betalende klant.',
    verloren: 'Verloren = verliesreden ingevuld, of gearchiveerd.',
    wissel: 'Een wissel (planwissel of correctie bij een klant die in de 30 dagen ervoor nog een abonnement had) telt niet als nieuw contract. Een contract dat intussen gestopt is, telt wel: het werd in die maand verkocht.'
  };
  /** De filters links die de lijst mee bepalen. */
  function selectieWhy(merkToo) {
    var bits = [];
    if (merkToo && st.f.merk !== '') bits.push('merk ' + (st.f.merk === '1' ? 'Syndicoach' : 'OpenVME'));
    if (st.f.user !== '') bits.push('verkoper ' + D('user', Number(st.f.user)));
    if (st.f.ch !== '') bits.push('kanaal ' + D('ch', Number(st.f.ch)));
    return bits.length ? ['Filters: ' + esc(bits.join(' · ')) + '.'] : [];
  }
  var LEAD_HEAD = ['Lead', 'Aangemaakt', 'Merk', 'Waarom dit merk', 'Fase', 'Product', 'Waarom dit product', 'Verkoper', 'Kanaal'];
  function leadName(r) { return r[L.name] || (r[L.cust] >= 0 ? st.data.customers[r[L.cust]].name : '') || ('Lead #' + r[L.id]); }
  function leadCells(r) {
    return [K.odooLink('crm.lead', r[L.id], leadName(r)), K.dayLabel(r[L.cd]), r[L.sc] ? 'Syndicoach' : 'OpenVME', esc(D('mw', r[L.mw])),
      esc(STAGES[r[L.nr] - 1] || 'geen fase') + (r[L.lost] ? ' · verloren (' + esc(D('lost', r[L.lr]) || 'geen reden') + ')' : '') + (r[L.won] ? ' · gewonnen ' + K.dayLabel(r[L.won]) : ''),
      esc(st.data.leadProducts[r[L.prod]]), esc(D('pw', r[L.pw])), esc(D('user', r[L.user])), esc(D('ch', r[L.ch]))];
  }
  /** Leads van de instroommaanden sinds cohortStart(), met de filters (en het merkfilter, tenzij skipMerk). */
  function cohort(skipMerk) {
    var cs = cohortStart(), today = st.data.meta.today;
    return leads().filter(function (r) { return r[L.cd] >= cs && r[L.cd] <= today && r[L.nr] > 0 && leadOk(r, skipMerk); });
  }

  /**
   * Het venster van een tegel: eerst het verloop over het boekjaar in het groot (met
   * het target als lijn), daaronder de records. Een klik op een maand beperkt de lijst
   * tot die maand; nog eens klikken = het hele boekjaar.
   */
  function openKpi(kind, key, idx) {
    var R = st.R, ms = fyMonths(), cm = curMonth(), sel = idx === null || idx === undefined || ms[idx] > cm ? null : idx;
    var labels = ms.map(function (m) { return K.monthLabel(m, true); }), data, ref, label, list, fmt;
    if (kind === 'r') {
      var p = product(key);
      if (!p) return;
      label = p.label + (p.unit ? ' (' + p.unit + ')' : '');
      data = ms.map(function (m) { return m > cm ? null : realised(R, key, m); });
      ref = { label: 'Target', data: ms.map(function (m) { return target(key, m); }) };
      list = 'r:' + key + ':' + (sel === null ? 'ytd' : ms[sel]);
      fmt = function (v, short) { return nf(v, p.decimals && !short ? 1 : 0); };
    } else {
      var c = coverage()[key];
      label = 'MQL ' + (key === 'syndicoach' ? 'Syndicoach' : 'OpenVME');
      data = ms.map(function (m) { return m > cm ? null : c.got[m]; });
      ref = { label: 'Nodig voor de targets', data: ms.map(function (m) { return c.need[m]; }) };
      list = 'mql:' + key + ':' + (sel === null ? 'ytd' : ms[sel]);
      fmt = function (v) { return nf(v); };
    }
    openDrill(list, { keep: true, chart: {
      type: 'bar', labels: labels, data: data, label: label, selected: sel, ref: ref, fmt: fmt,
      onPick: function (i) { openKpi(kind, key, i === sel ? null : i); },
      note: K.fyLabel(st.fy) + '. De lijn is het target van die maand.'
    } });
  }
  // "Totaal VME's" is geen product maar een optelling: target Assistant + Captain, realisatie Assistant + OpenVME Professional.
  var VMES = { key: 'totaal_vmes', label: 'Totaal VME\'s', source: 'Target = Assistant + Captain; gerealiseerd = Assistant + OpenVME Professional (captains starten via OpenVME Professional).' };
  function product(key) { return key === 'totaal_vmes' ? VMES : products().filter(function (x) { return x.key === key; })[0]; }
  function realised(R, key, m) {
    if (key === 'totaal_vmes') return ((R.v.assistant || {})[m] || 0) + ((R.v.openvme_professional || {})[m] || 0);
    return (R.v[key] || {})[m] || 0;
  }
  function target(key, m) {
    if (key !== 'totaal_vmes') return tgt(key, m);
    var a = tgt('assistant', m), c = tgt('captain', m);
    return a === null && c === null ? null : (a || 0) + (c || 0);
  }

  function openDrill(key, extra) {
    var parts = key.split(':'), R = st.R, rows = [], head, title, sub = '', why = [], right = [];
    extra = extra || {};
    if (parts[0] === 'kpi') { openKpi(parts[1], parts[2], null); return; }
    if (parts[0] === 'r') {
      var p = product(parts[1]);
      if (!p) return;
      var ms = parts[2] === 'ytd' ? fyMonths().filter(function (m) { return m <= curMonth(); }) : [parts[2]];
      var keys = parts[1] === 'totaal_vmes' ? ['assistant', 'openvme_professional'] : [parts[1]];
      var its = [];
      keys.forEach(function (k) { ms.forEach(function (m) { its = its.concat((R.items[k + '|' + m] || []).map(function (it) { return { it: it, key: k }; })); }); });
      title = p.label + ' — ' + (parts[2] === 'ytd' ? 'boekjaar tot nu' : K.monthLabel(parts[2], true));
      why = [esc(p.source)];
      var kinds = {}; its.forEach(function (x) { kinds[x.it.kind] = 1; });
      if (kinds.chain || ['assistant', 'openvme_professional', 'totaal_vmes'].indexOf(parts[1]) >= 0) why.push(TWHY.wissel, 'Verkoper = die van de laatste order van het abonnement.');
      if (['opstarthulp', 'expert_uren'].indexOf(parts[1]) >= 0) why.push('Bevestigde verkooporders, op orderdatum. Het verkoperfilter geldt hier niet: die orderlijnen hebben geen verkoper.');
      if (['captain', 'prof_syndici'].indexOf(parts[1]) >= 0) why.push(TWHY.won, TWHY.product, TWHY.merk);
      head = ['Wat', 'Klant / lead', 'Datum', 'Aantal', 'Waarom'];
      right = [3];
      var dOf = function (it) { return String((it.kind === 'chain' ? it.d : it.kind === 'trans' ? it.r[0] : it.r[L.won]) || ''); };
      its.sort(function (a, b) { return dOf(b.it).localeCompare(dOf(a.it)); });
      rows = its.map(function (x) {
        var it = x.it;
        if (it.kind === 'chain') {
          var c = st.data.customers[it.ch.c];
          return [K.odooLink('sale.order', it.p.o, it.p.n), esc(c.name), K.dayLabel(it.d), '1',
            'Eerste contract, licentie ' + esc(D('lic', it.ch.lic)) + ', gestart ' + K.dayLabel(it.d) + ' · verkoper ' + esc(D('user', it.ch.user))
              + (it.ch.end ? ' · intussen gestopt op ' + K.dayLabel(it.ch.end) : ' · loopt nog')];
        }
        if (it.kind === 'trans') {
          var qty = it.r[4];
          return [K.odooLink('sale.order', it.r[7], '#' + it.r[7]), esc(st.data.customers[it.r[6]].name), K.dayLabel(it.r[0]), nf(x.key === 'expert_uren' ? qty / 3 : qty, 2),
            'Orderlijn ' + esc(D('tg', it.r[3])) + ' × ' + nf(qty, 2) + (x.key === 'expert_uren' ? ' credits = ' + nf(qty / 3, 2) + ' uur' : '') + ', order van ' + K.dayLabel(it.r[0])];
        }
        var r = it.r;
        return [K.odooLink('crm.lead', r[L.id], leadName(r)), esc(r[L.cust] >= 0 ? st.data.customers[r[L.cust]].name : D('ch', r[L.ch])), K.dayLabel(r[L.won]), '1',
          'Gewonnen op ' + K.dayLabel(r[L.won]) + ' · ' + esc(D('pw', r[L.pw])) + ' · ' + esc(D('mw', r[L.mw]))];
      });
      why = why.concat(selectieWhy(false));
    } else {
      // Lijsten van leads.
      var list = [], sc;
      if (parts[0] === 'f' || parts[0] === 'mql') {
        var m = parts[0] === 'f' ? parts[1] : parts[2], k = parts[0] === 'f' ? Number(parts[2]) : 1;
        sc = parts[0] === 'mql' ? (parts[1] === 'syndicoach' ? 1 : 0) : (st.f.merk === '' ? null : Number(st.f.merk));
        var inM = {};
        (m === 'ytd' ? fyMonths().filter(function (x) { return x <= curMonth(); }) : [m]).forEach(function (x) { inM[x] = 1; });
        list = leads().filter(function (r) { return inM[K.monthOf(r[L.cd])] && r[L.nr] >= k && (sc === null || r[L.sc] === sc) && leadOk(r, true); });
        title = (parts[0] === 'mql' ? (sc ? 'Syndicoach' : 'OpenVME') + ': leads ' : 'Leads ') + (m === 'ytd' ? 'van het boekjaar tot nu' : K.monthLabel(m, true)) + ' die ' + STAGES[k - 1] + ' bereikten';
        why = [(parts[0] === 'mql' ? 'MQL = een lead met een fase, aangemaakt in die maand (instroom), van dat merk.' : 'Leads aangemaakt in ' + (m === 'ytd' ? 'de maanden van het boekjaar' : 'die maand') + ' die ' + STAGES[k - 1] + ' of verder bereikten.'), TWHY.fase, TWHY.merk];
      } else if (parts[0] === 'fb') {
        var kb = Number(parts[2]);
        sc = parts[1] === 'a' ? null : Number(parts[1]);
        list = cohort(true).filter(function (r) { return r[L.nr] >= kb && (sc === null || r[L.sc] === sc); });
        title = (sc === null ? 'Alle merken' : sc ? 'Syndicoach' : 'OpenVME') + ': leads die ' + STAGES[kb - 1] + ' bereikten';
        why = ['Leads aangemaakt sinds ' + K.monthLabel(cohortStart(), true) + ' die ' + STAGES[kb - 1] + ' of verder bereikten.', TWHY.fase, TWHY.merk];
      } else if (parts[0] === 'u') {
        list = cohort(false).filter(function (r) { return String(r[L.user]) === parts[1]; });
        title = 'Leads van ' + D('user', Number(parts[1]));
        why = ['Leads met een fase, aangemaakt sinds ' + K.monthLabel(cohortStart(), true) + ', met deze verkoper op de lead.', TWHY.fase];
      } else if (parts[0] === 'lr') {
        // Zelfde selectie als de tabel Verliesredenen: ook leads zonder fase.
        var csL = cohortStart(), tdL = st.data.meta.today;
        list = leads().filter(function (r) { return r[L.lost] && r[L.cd] >= csL && r[L.cd] <= tdL && leadOk(r) && String(r[L.lr]) === parts[1]; });
        title = 'Verloren: ' + (D('lost', Number(parts[1])) || '—');
        why = [TWHY.verloren, 'Leads aangemaakt sinds ' + K.monthLabel(cohortStart(), true) + '. De fase is die waarin de lead verloren ging.', TWHY.merk];
      } else if (parts[0] === 'ratio') {
        // ratio:<merk>:<a|b>:<stap>: de leads in de noemer van die ratio, met of ze de volgende fase haalden.
        sc = Number(parts[1]);
        var rr = ratios(sc), i = Number(parts[3]), uf = unripeFrom(), cs = cohortStart(), today = st.data.meta.today;
        list = leads().filter(function (r) { return r[L.sc] === sc && r[L.cd] >= cs && r[L.cd] <= today && r[L.nr] > i; });
        if (parts[2] === 'b') list = list.filter(function (r) { var mm = K.monthOf(r[L.cd]); return mm >= rr.bWindow[0] && mm <= rr.bWindow[1]; });
        else if (!st.unripe) list = list.filter(function (r) { return r[L.cd] < uf; });
        var reached = list.filter(function (r) { return r[L.nr] > i + 1; }).length;
        title = (sc ? 'Syndicoach' : 'OpenVME') + ' · ' + RATIO_LABELS[i] + ' (' + parts[2] + ')';
        sub = nf(reached) + ' van ' + nf(list.length) + ' haalden ' + STAGES[i + 1] + ' = ' + K.pctTxt(list.length ? reached / list.length * 100 : null, 0) + '.';
        why = ['Ratio = leads die ' + STAGES[i + 1] + ' bereikten ÷ leads die ' + STAGES[i] + ' bereikten. Hieronder de leads die ' + STAGES[i] + ' bereikten.',
          parts[2] === 'b' ? '(b) = instroom van ' + K.monthLabel(rr.bWindow[0], true) + ' t.e.m. ' + K.monthLabel(rr.bWindow[1], true) + ': de laatste drie maanden die meer dan 30 dagen voorbij zijn.'
            : '(a) = instroom sinds ' + K.monthLabel(cs, true) + (st.unripe ? ', ook de leads van de laatste 30 dagen.' : ', zonder de leads van de laatste 30 dagen (die zijn nog niet doorgestroomd).'),
          'Altijd met alle leads van het merk: het verkoper- en kanaalfilter geldt hier niet, zoals in dashboard 19.', TWHY.fase, TWHY.merk];
        head = ['Bereikte ' + STAGES[i + 1]].concat(LEAD_HEAD);
        rows = list.map(function (r) { return [r[L.nr] > i + 1 ? 'ja' : 'nee'].concat(leadCells(r)); });
        K.drill(title, sub, head, rows, Object.assign({ right: [] }, extra, { why: why }));
        return;
      } else return;
      head = LEAD_HEAD;
      rows = list.map(leadCells);
      why = why.concat(selectieWhy(['f', 'u', 'lr'].indexOf(parts[0]) >= 0));
    }
    K.drill(title, sub, head, rows, Object.assign({ right: right }, extra, { why: why }));
  }

  function render() {
    if (!st.data) return;
    st.R = realisation();
    renderFilters();
    $('tgSentence').textContent = K.fyLabel(st.fy) + '. Funnel over de instroom sinds ' + K.monthLabel(cohortStart(), true) + ', ratiokeuze ' + st.ratio + '.';
    renderKpis(st.R);
    renderGrid(st.R);
    renderCum(st.R);
    renderFunnel();
    renderReverse();
    renderCoverage();
    renderUsers();
    renderLost();
    renderRatios();
    renderDq();
    K.icons();
    save();
  }

  async function loadTargets() {
    var from = K.addMonths(st.fy, -12), to = K.addMonths(st.fy, 11);
    var res = await K.api('/dashboards/api/sales/targets?from=' + from + '&to=' + to);
    st.targets = {}; st.leadTargets = {};
    res.products.forEach(function (r) { (st.targets[r.metric] = st.targets[r.metric] || {})[r.month] = r.value; });
    res.leads.forEach(function (r) { (st.leadTargets[r.scope] = st.leadTargets[r.scope] || {})[r.month] = r.value; });
  }
  async function load(force) {
    if (st.loading) return;
    st.loading = true;
    $('tgStatus').innerHTML = '<span class="loading loading-spinner loading-sm"></span>';
    try {
      var data = await K.loadSales(force);
      if (!data.configured) { $('tgNotice').innerHTML = '<div class="alert alert-info">De verkoopdatabase (D1 om-sales) is nog niet gekoppeld of nog leeg.</div>'; $('tgStatus').innerHTML = ''; st.loading = false; return; }
      st.data = data;
      if (!st.fy) st.fy = K.fyStart(data.meta.today, data.meta.fyStartMonth);
      if (!st.manual) st.manual = data.manualRatios || {};
      await loadTargets();
      $('tgStatus').innerHTML = K.freshness(data);
      $('tgNotice').innerHTML = '';
      render();
    } catch (err) {
      $('tgNotice').innerHTML = '<div class="alert alert-error">Kon de targets niet laden: ' + esc(err.message) + '</div>';
      $('tgStatus').innerHTML = '';
    }
    st.loading = false;
  }

  async function saveTargets() {
    var items = Object.keys(st.dirty).map(function (k) { var p = k.split('|'); return { metric: p[0], month: p[1], value: st.dirty[k] === '' ? null : Number(st.dirty[k]) }; });
    if (!items.length) { st.edit = false; render(); return; }
    await K.api('/dashboards/api/sales/targets', { method: 'POST', body: JSON.stringify({ items: items }) });
    st.dirty = {}; st.edit = false;
    await loadTargets();
    render();
    document.dispatchEvent(new CustomEvent('om:sales-reloaded'));
  }
  async function applyMql() {
    var ms = fyMonths().filter(function (m) { return m >= curMonth(); }), cov = st.coverage || coverage();
    var items = [], lines = [];
    ms.forEach(function (m) {
      var o = cov.openvme.need[m], s = cov.syndicoach.need[m];
      if (o === null && s === null) return;
      items.push({ metric: 'leads_instroom', scope: 'openvme', month: m, value: o || 0 }, { metric: 'leads_instroom', scope: 'syndicoach', month: m, value: s || 0 },
        { metric: 'leads_instroom', scope: 'all', month: m, value: (o || 0) + (s || 0) });
      lines.push(K.monthLabel(m, true) + ': OpenVME ' + (o || 0) + ', Syndicoach ' + (s || 0));
    });
    if (!items.length) { alert('Er zijn geen targets met een leadstroom voor de komende maanden.'); return; }
    if (!confirm('Deze aanvraagtargets zetten (tabblad Aanvragen), ratiokeuze ' + st.ratio + ':\n\n' + lines.join('\n')
      + '\n\nLet op: Aanvragen deelt de merken in op "Merk-herkomst" van de lead, dit tabblad op de merkregel (ook naam, kanaal en labels). De aantallen kunnen dus licht verschillen.')) return;
    await K.api('/dashboards/api/sales/targets', { method: 'POST', body: JSON.stringify({ items: items }) });
    alert('Aanvraagtargets gezet voor ' + lines.length + ' maand(en).');
  }

  root.addEventListener('click', async function (e) {
    var el = e.target.closest('[' + A + ']');
    if (!el || !st.data) return;
    var a = el.getAttribute(A), v = el.dataset.value;
    try {
      if (a === 'fy') { st.fy = v; st.dirty = {}; await loadTargets(); render(); }
      else if (a === 'merk') { st.f.merk = v; render(); }
      else if (a === 'ratio') { st.ratio = v; render(); }
      else if (a === 'unripe') { st.unripe = v === '1'; render(); }
      else if (a === 'prod') { st.prod = v; renderCum(st.R); save(); }
      else if (a === 'edit') { st.edit = true; renderGrid(st.R); K.icons(); }
      else if (a === 'cancel') { st.edit = false; st.dirty = {}; render(); }
      else if (a === 'save') { el.disabled = true; await saveTargets(); }
      else if (a === 'copy-prev') {
        fyMonths().forEach(function (m) {
          var prev = K.addMonths(m, -12);
          products().forEach(function (p) { var pv = (st.targets[p.key] || {})[prev]; if (pv !== undefined && tgt(p.key, m) === null) st.dirty[p.key + '|' + m] = String(pv); });
        });
        renderGrid(st.R); K.icons();
      }
      else if (a === 'apply-mql') { await applyMql(); }
      else if (a === 'drill') { openDrill(el.dataset.drill); }
    } catch (err) { alert(err.message); el.disabled = false; }
  });
  root.addEventListener('input', function (e) {
    var key = e.target.getAttribute('data-tg-input');
    if (!key) return;
    st.dirty[key] = e.target.value;
    e.target.classList.add('border-primary', 'bg-primary/5');
  });
  root.addEventListener('change', function (e) {
    var el = e.target.closest('[data-tg-select]');
    if (!el) return;
    st.f[el.getAttribute('data-tg-select')] = el.value;
    render();
  });
  root.addEventListener('submit', async function (e) {
    if (e.target.id !== 'tgRatioForm') return;
    e.preventDefault();
    var val = { openvme: {}, syndicoach: {} };
    Array.prototype.forEach.call(e.target.elements, function (inp) {
      if (!inp.name || inp.name.indexOf('.') < 0) return;
      var p = inp.name.split('.');
      if (inp.value !== '') val[p[0]][p[1]] = Math.round(Number(inp.value)) / 100;
    });
    try {
      await K.api('/dashboards/api/sales/settings', { method: 'POST', body: JSON.stringify({ key: 'targets.manual_ratios', value: val }) });
      st.manual = val; render();
    } catch (err) { alert('Bewaren mislukt: ' + err.message); }
  });
  document.addEventListener('om:sales-reloaded', function () { if (st.data && !st.loading) load(false); });
  if (K.COMPACT && K.COMPACT.addEventListener) K.COMPACT.addEventListener('change', function () { if (st.data) render(); });

  function visible() { return !root.classList.contains('hidden'); }
  new MutationObserver(function () { if (visible() && !st.data && !st.loading) load(false); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (visible()) load(false);
})();
