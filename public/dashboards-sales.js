/**
 * Dashboards — tabblad "Verkoop" (vervangt Looker "Top KPIs").
 *
 * Zelfde opbouw als Gedrag in Webgedrag: links wat je bekijkt + de filters,
 * in het midden de analyse, rechts de kerncijfers. Elk cijfer opent de lijst
 * erachter, met een link naar de order in Odoo.
 *
 * De REGELS (wat een abonnement, periode, wissel of stopzetting is) staan op de
 * server, in src/modules/dashboards/lib/sales/derive.js. Hier wordt enkel
 * geteld en gefilterd. ARR = 12 x MRR (recurring_monthly van Odoo).
 *
 * Gedeelde bouwstenen: public/dashboards-kit.js (window.OMDash).
 */
(function () {
  'use strict';
  var K = window.OMDash;
  var root = document.querySelector('[data-dash-panel="verkoop"]');
  if (!K || !root) return;
  var esc = K.esc, nf = K.nf, eur = K.eur, $ = K.$;
  var A = 'data-sl-action';
  var STORE = 'dashboards.verkoop.v1';

  var DEFAULTS = { seg: 'vme', merk: '', ct: '', plan: '', lic: '', user: '', ch: '', org: '', syn: '', plots: '', inv: '', expert: '' };
  var PERIODS = { '30d': 'laatste 30 dagen', '90d': 'laatste 90 dagen', fy: 'dit boekjaar', '12m': 'laatste 12 maanden', '24m': 'laatste 24 maanden' };
  var st = { data: null, loading: false, period: '12m', f: Object.assign({}, DEFAULTS), split: 'ct', basis: 'order', renewWin: 90 };

  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) {
      if (PERIODS[saved.period]) st.period = saved.period;
      if (saved.f) Object.keys(DEFAULTS).forEach(function (k) { if (saved.f[k] !== undefined) st.f[k] = saved.f[k]; });
      if (saved.split) st.split = saved.split;
      if (saved.basis) st.basis = saved.basis;
    }
  } catch (_) { /* geen opslag */ }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ period: st.period, f: st.f, split: st.split, basis: st.basis })); } catch (_) { /* geen opslag */ }
  }

  // ── Het geraamte ──────────────────────────────────────────────────────────
  function card(id, title, sub, extra) {
    return '<div class="rounded-2xl bg-base-100 border border-base-content/10 p-5" id="' + id + 'Card">'
      + '<div class="flex flex-wrap items-start justify-between gap-2 mb-3"><div><h2 class="font-semibold">' + title + '</h2>'
      + (sub ? '<p class="text-xs text-base-content/50 mt-0.5" id="' + id + 'Sub">' + sub + '</p>' : '') + '</div>'
      + '<div id="' + id + 'Controls" class="flex flex-wrap items-center gap-2">' + (extra || '') + '</div></div>'
      + '<div id="' + id + '"></div></div>';
  }
  root.innerHTML =
    '<div class="flex flex-wrap items-end justify-between gap-3 mb-4">'
    + '<div><h1 class="text-2xl font-bold">Verkoop</h1><p class="text-sm text-base-content/60">Abonnementen, verlengingen, stopzettingen en omzet, rechtstreeks uit Odoo.</p></div>'
    + '<div id="slStatus"></div></div>'
    + '<div id="slNotice" class="mb-3"></div>'
    + '<div class="grid grid-cols-1 gap-5 items-start lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">'
    + '<aside class="om-scroll space-y-3 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[calc(48px+1rem)] lg:max-h-[calc(100vh-48px-2rem)] lg:overflow-y-auto">'
    +   '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-3 space-y-2">'
    +     '<div class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 flex items-center gap-1"><i data-lucide="filter" class="w-3 h-3"></i> Je bekijkt</div>'
    +     '<p id="slSentence" class="text-sm"></p><p id="slExcluded" class="text-xs text-base-content/50 empty:hidden"></p></div>'
    +   '<div id="slFilters"></div></aside>'
    + '<aside class="om-scroll min-w-0 lg:col-start-2 lg:row-start-1 2xl:col-start-3 2xl:sticky 2xl:top-[calc(48px+1rem)] 2xl:max-h-[calc(100vh-48px-2rem)] 2xl:overflow-y-auto">'
    +   '<div class="rounded-2xl bg-base-100 border border-base-content/10 p-5 2xl:p-3">'
    +     '<div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Kerncijfers</div>'
    +     '<div id="slKpis" class="grid grid-cols-2 md:grid-cols-3 gap-3 2xl:grid-cols-1 2xl:gap-0 2xl:divide-y om-lijnen"></div></div></aside>'
    + '<div class="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2 2xl:row-start-1">'
    +   card('slArr', 'ARR-verloop', 'Jaarlijks terugkerende omzet (12 × MRR) op het einde van elke maand. Klik op een vlak voor wie erin zit en waarom.')
    +   card('slBridge', 'Wat veranderde', 'Per maand: nieuwe klanten, uitbreidingen, verlagingen, wissels en verloren klanten, in ARR. Klik op een staaf voor de lijst.')
    +   '<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">'
    +     card('slNew', 'Nieuwe abonnementen', 'Eerste contract van een klant (een wissel bij een bestaande klant telt niet als nieuw).')
    +     card('slRenew', 'Verlengingen', 'Jaarabonnementen waarvan de periode afliep: verlengd, gestopt of nog open.')
    +   '</div>'
    +   card('slChurn', 'Verloren', 'Abonnementen die stopten zonder dat de klant binnen de wisselperiode een ander abonnement had.')
    +   card('slTrans', 'Transactionele inkomsten', 'Producten zonder abonnement (credits, opstarthulp, ...).')
    +   card('slRev', 'Gefactureerde omzet', 'Geboekte facturen min creditnota\'s, per bron, op factuurdatum.')
    +   card('slPro', 'Professionele syndici', 'Lopende professionele abonnementen (maandelijks, per kavel), en wie gepland is maar nog niet in Odoo staat.')
    +   card('slAtt', 'Na te kijken', 'Wat de regels opvallend vonden. Niets hiervan wordt stil weggelaten: het telt mee zoals beschreven.')
    + '</div></div>';

  // ── Hulpjes op de feiten ──────────────────────────────────────────────────
  function D(kind, i) { return st.data && st.data.dict[kind] ? st.data.dict[kind][i] : ''; }
  function cust(ch) { return st.data.customers[ch.c]; }
  function alive(ch) { return !ch.end || ch.end > ch.start; }
  function periodAt(ch, d) {
    for (var i = ch.p.length - 1; i >= 0; i--) { var p = ch.p[i]; if (p.s <= d && (!p.e || p.e > d)) return p; }
    return null;
  }
  function mrrAt(ch, d) {
    var p = periodAt(ch, d); if (!p) return 0;
    var m = p.m; (p.u || []).forEach(function (u) { if (u[0] > d) m -= u[1]; });
    return m;
  }
  function isYearly(ch) { return /year|jaar/i.test(D('plan', ch.plan)); }

  function win() {
    var to = st.data.meta.today, from;
    if (st.period === '30d') from = K.addDays(to, -30);
    else if (st.period === '90d') from = K.addDays(to, -90);
    else if (st.period === 'fy') from = K.addDays(K.fyStart(to, st.data.meta.fyStartMonth), -1);
    else if (st.period === '24m') from = K.addMonths(to, -24);
    else from = K.addMonths(to, -12);
    var len = Math.round((Date.parse(to) - Date.parse(from)) / 86400e3);
    return { from: from, to: to, prevFrom: K.addDays(from, -len), prevTo: from };
  }
  function inWin(d, a, b) { return d && d > a && d <= b; }
  /**
   * De maanden van ELKE grafiek en elk mini-verloop (en dus ook van het venster dat
   * een tegel opent). Boekjaar = het volledige boekjaar, ook de komende maanden (leeg,
   * de targets staan er wel); 12 en 24 m = die maanden; 30 en 90 d = zes maanden als
   * context, met de gekozen periode als band. Eerst had de ARR-grafiek een eigen
   * venster (altijd 12 maanden) en de rest "de periode, minstens zes": bij Boekjaar
   * begon de ene in okt '25 en de andere in mei '26.
   */
  function chartMonths(w) {
    var cm = K.monthOf(w.to);
    if (st.period === 'fy') { var s = K.fyStart(w.to, st.data.meta.fyStartMonth); return K.months(s, K.addMonths(s, 11)); }
    if (st.period === '24m') return K.months(K.addMonths(cm, -23), cm);
    if (st.period === '12m') return K.months(K.addMonths(cm, -11), cm);
    return K.months(K.addMonths(cm, -5), cm);
  }
  function isFuture(m) { return m > K.monthOf(st.data.meta.today); }
  function bandPlugin(ms, w) {
    if (st.period !== '30d' && st.period !== '90d') return { id: 'slBand' };
    var a = Math.max(0, ms.indexOf(K.monthOf(K.addDays(w.from, 1))));
    return {
      id: 'slBand',
      beforeDatasetsDraw: function (ch) {
        var x = ch.scales.x, area = ch.chartArea, n = ch.data.labels.length;
        if (!x || !area || !n) return;
        var half = n > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : (area.right - area.left) / 2;
        var left = Math.max(area.left, x.getPixelForValue(a) - half);
        var ctx = ch.ctx; ctx.save();
        ctx.fillStyle = K.C.primary(0.07); ctx.fillRect(left, area.top, area.right - left, area.bottom - area.top);
        ctx.fillStyle = K.C.primary(0.8); ctx.font = '11px sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(PERIODS[st.period], left + 4, area.top + 2);
        ctx.restore();
      }
    };
  }

  var CUST_KEYS = ['merk', 'ct', 'ch', 'org', 'syn', 'plots', 'expert'];
  function custOk(c, skip) {
    var f = st.f;
    if (skip !== 'seg') { if (f.seg === 'vme' && c.ctId === 2) return false; if (f.seg === 'pro' && c.ctId !== 2) return false; }
    for (var i = 0; i < CUST_KEYS.length; i++) {
      var k = CUST_KEYS[i];
      if (k !== skip && f[k] !== '' && String(c[k]) !== String(f[k])) return false;
    }
    if (skip !== 'inv' && f.inv !== '' && String(c.inv) !== f.inv) return false;
    return true;
  }
  function chainOk(ch, skip) {
    if (!alive(ch)) return false;
    if (!custOk(cust(ch), skip)) return false;
    var f = st.f;
    if (skip !== 'plan' && f.plan !== '' && String(ch.plan) !== String(f.plan)) return false;
    if (skip !== 'lic' && f.lic !== '' && String(ch.licNow) !== String(f.lic)) return false;
    if (skip !== 'user' && f.user !== '' && String(ch.user) !== String(f.user)) return false;
    return true;
  }
  function chains(skip) { return st.data.chains.filter(function (ch) { return chainOk(ch, skip); }); }

  function events(ch) {
    var ev = [{ d: ch.start, t: ch.newSwitch ? 'switch' : 'new', v: mrrAt(ch, ch.start), ch: ch }];
    ch.p.forEach(function (p, k) {
      (p.u || []).forEach(function (u) { ev.push({ d: u[0], t: u[1] >= 0 ? 'expand' : 'contract', v: u[1], ch: ch, up: true }); });
      if (k > 0) {
        var dv = mrrAt(ch, p.s) - ch.p[k - 1].m;
        ev.push({ d: p.s, t: dv > 0.005 ? 'expand' : dv < -0.005 ? 'contract' : 'renew', v: dv, ch: ch, renew: true, p: p });
      }
    });
    if (ch.end) ev.push({ d: ch.end, t: ch.endSwitch ? 'switch' : 'churn', v: -ch.p[ch.p.length - 1].m, ch: ch });
    return ev;
  }
  function arrAt(list, d) { return 12 * list.reduce(function (s, ch) { return s + mrrAt(ch, d); }, 0); }
  function activeAt(list, d) { return list.filter(function (ch) { return periodAt(ch, d); }); }

  // ── Filters ───────────────────────────────────────────────────────────────
  function opts(kind, key, counts) {
    return (st.data.dict[kind] || []).map(function (name, i) { return [String(i), name || '(leeg)', counts[i] || 0]; })
      .filter(function (o) { return o[2] > 0 || String(st.f[key]) === o[0]; })
      .sort(function (a, b) { return b[2] - a[2]; });
  }
  function countBy(key, fromChain) {
    var m = {}, now = st.data.meta.today;
    chains(key).forEach(function (ch) {
      if (!periodAt(ch, now)) return;
      var v = fromChain ? ch[fromChain] : cust(ch)[key];
      m[v] = (m[v] || 0) + 1;
    });
    return m;
  }
  var CHIP = { seg: 'Segment', merk: 'Merk', ct: 'Klanttype', plan: 'Plan', lic: 'Licentie', user: 'Verkoper', ch: 'Kanaal', org: 'Herkomst', syn: 'Huidig beheer', plots: 'Kavels', inv: 'Facturatie via expert', expert: 'Adviserend expert' };
  function chipValue(k) {
    var v = st.f[k];
    if (k === 'seg') return { vme: "VME's", pro: 'Professionals', all: 'Alles' }[v];
    if (k === 'inv') return v === '1' ? 'ja' : 'nee';
    var kind = { lic: 'lic', plan: 'plan', user: 'user' }[k] || k;
    return D(kind, Number(v));
  }
  function renderFilters() {
    var active = Object.keys(DEFAULTS).filter(function (k) { return st.f[k] !== DEFAULTS[k]; });
    $('slFilters').innerHTML =
      '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-4 space-y-3 lg:p-3">'
      + '<div>' + K.groupLabel('Periode', 'Waarover nieuw, verlengd, verloren en omzet geteld worden. ARR en actieve abonnementen zijn de stand op vandaag.')
      + K.pills(A, 'period', null, [['30d', '30 d'], ['90d', '90 d'], ['fy', 'Boekjaar'], ['12m', '12 m'], ['24m', '24 m']], st.period, true) + '</div>'
      + '<div>' + K.groupLabel('Segment', 'VME = VME en VME in beheer (ook zonder klanttype). Professionals = klanttype Professioneel Syndicus.')
      + K.pills(A, 'seg', 'seg', [['vme', "VME's"], ['pro', 'Professionals'], ['all', 'Alles']], st.f.seg, true) + '</div>'
      + '<div>' + K.groupLabel('Merk', WHY.merk)
      + K.pills(A, 'merk', 'merk', [['', 'Alle']].concat((st.data.dict.merk || []).map(function (m, i) { return [String(i), m]; })), st.f.merk, true) + '</div>'
      + '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 pt-3 border-t border-base-content/10">'
      + K.select('data-sl-select', 'ct', 'Klanttype', opts('ct', 'ct', countBy('ct')), st.f.ct)
      + K.select('data-sl-select', 'lic', 'Licentie', opts('lic', 'lic', countBy('lic', 'licNow')), st.f.lic, 'De licentie van de lopende periode.')
      + K.select('data-sl-select', 'plan', 'Plan', opts('plan', 'plan', countBy('plan', 'plan')), st.f.plan)
      + K.select('data-sl-select', 'user', 'Verkoper', opts('user', 'user', countBy('user', 'user')), st.f.user)
      + K.select('data-sl-select', 'ch', 'Kanaal (lead)', opts('ch', 'ch', countBy('ch')), st.f.ch)
      + K.select('data-sl-select', 'org', 'Merk-herkomst (lead)', opts('org', 'org', countBy('org')), st.f.org)
      + K.select('data-sl-select', 'syn', 'Huidig beheer', opts('syn', 'syn', countBy('syn')), st.f.syn, 'Uit het actieblad van het gebouw, anders van de partner.')
      + K.select('data-sl-select', 'plots', 'Aantal kavels', opts('plots', 'plots', countBy('plots')), st.f.plots, 'Actieblad of partner, anders het aantal op de licentielijn.')
      + K.select('data-sl-select', 'expert', 'Adviserend expert', opts('expert', 'expert', countBy('expert')), st.f.expert)
      + '</div>'
      + '<div>' + K.groupLabel('Facturatie via expert') + K.pills(A, 'inv', 'inv', [['', 'Alle'], ['1', 'Ja'], ['0', 'Nee']], st.f.inv, true) + '</div>'
      + (active.length ? '<div class="flex flex-wrap items-center gap-2 pt-3 border-t border-base-content/10"><span class="text-xs text-base-content/60">Actief:</span>'
        + active.map(function (k) {
          return '<span class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-xs pl-2.5 pr-1 py-0.5">' + esc(CHIP[k] + ': ' + chipValue(k))
            + '<button type="button" class="rounded-full w-4 h-4 inline-flex items-center justify-center hover:bg-primary/20" ' + A + '="clear" data-key="' + k + '" aria-label="Filter weghalen">✕</button></span>';
        }).join('') + '<button type="button" class="btn btn-ghost btn-xs" ' + A + '="reset">Alles wissen</button></div>' : '')
      + '</div>';
  }

  // ── Kerncijfers ───────────────────────────────────────────────────────────
  function tile(t) { t.attr = A; return K.tile(t); }
  function stats(list, a, b) {
    var ev = [];
    list.forEach(function (ch) { events(ch).forEach(function (e) { if (inWin(e.d, a, b) && e.d <= st.data.meta.today) ev.push(e); }); });
    var sum = function (t) { return ev.filter(function (e) { return e.t === t; }); };
    var news = sum('new'), churn = sum('churn');
    var renews = ev.filter(function (e) { return e.renew; });
    var r = renewalOutcomes(list, a, b);
    return {
      newN: news.length, newArr: 12 * news.reduce(function (s, e) { return s + e.v; }, 0),
      churnN: churn.length, churnArr: -12 * churn.reduce(function (s, e) { return s + e.v; }, 0),
      renewN: renews.length, rate: r.renewed + r.churned ? r.renewed / (r.renewed + r.churned) * 100 : null, outcomes: r
    };
  }
  function renewalOutcomes(list, a, b) {
    var out = { renewed: 0, churned: 0, switched: 0, waiting: 0, open: 0, rows: [] };
    list.forEach(function (ch) {
      if (!isYearly(ch)) return;
      ch.p.forEach(function (p, k) {
        var due = K.addMonths(p.s, 12);
        if (!inWin(due, a, b) || due > st.data.meta.today) return;
        var res = k < ch.p.length - 1 ? 'renewed' : ch.end ? (ch.endSwitch ? 'switched' : 'churned') : ch.pend ? 'waiting' : 'open';
        out[res]++;
        out.rows.push({ ch: ch, p: p, due: due, res: res });
      });
    });
    return out;
  }
  /**
   * Het mini-verloop van elk kerncijfer, op de maanden van chartMonths(): per maand de
   * stand op het einde van de maand, of wat er in die maand gebeurde. Komende maanden
   * zijn leeg. Exact deze reeks staat in het groot in het venster van de tegel.
   */
  function sparks(list, w) {
    var now = w.to, ms = chartMonths(w), cm = K.monthOf(now);
    var at = function (m) { return m === cm ? now : K.monthEnd(m); };
    var idx = {}; ms.forEach(function (m, i) { idx[m] = i; });
    var zero = function () { return ms.map(function (m) { return isFuture(m) ? null : 0; }); };
    var nw = zero(), renew = zero(), churn = zero();
    list.forEach(function (ch) {
      events(ch).forEach(function (e) {
        if (e.d > now) return;
        var i = idx[K.monthOf(e.d)]; if (i === undefined) return;
        if (e.t === 'new') nw[i]++;
        if (e.t === 'churn') churn[i]++;
        if (e.renew) renew[i]++;
      });
    });
    var arr = ms.map(function (m) { return isFuture(m) ? null : arrAt(list, at(m)); });
    var act = ms.map(function (m) { return isFuture(m) ? null : activeAt(list, at(m)).length; });
    var prevArr = arrAt(list, K.addDays(ms[0], -1));
    var ids = {}; list.forEach(function (ch) { ids[ch.id] = 1; });
    // Momentopname: per DAG (de historiek begint pas bij de eerste sync), de laatste 90 dagen.
    var snapDays = {}, from90 = K.addDays(now, -90);
    (st.data.pendHist || []).forEach(function (r) { if (r[0] > from90 && r[0] <= now) snapDays[r[0]] = (snapDays[r[0]] || 0) + (ids[r[1]] ? 1 : 0); });
    var trans = zero(), rev = zero();
    st.data.trans.forEach(function (r) { var d = basisDate(r), i = d ? idx[K.monthOf(d)] : undefined; if (i !== undefined && d <= now && custOk(st.data.customers[r[6]])) trans[i] += r[5]; });
    st.data.revenue.forEach(function (r) { var i = idx[K.monthOf(r[0])]; if (i !== undefined && r[0] <= now && custOk(st.data.customers[r[3]])) rev[i] += r[2]; });
    var pros = st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg'); });
    var days = Object.keys(snapDays).sort();
    return {
      months: ms, pendDays: days,
      arr: arr, act: act,
      arpa: ms.map(function (m, i) { return act[i] ? arr[i] / act[i] : null; }),
      nw: nw, renew: renew, churn: churn,
      net: arr.map(function (v, i) { return v === null ? null : v - (i ? arr[i - 1] : prevArr); }),
      pend: days.map(function (d) { return snapDays[d]; }),
      trans: trans, rev: rev,
      pro: ms.map(function (m) { return isFuture(m) ? null : arrAt(pros, at(m)); })
    };
  }

  function renderKpis(list, w) {
    var now = w.to, act = activeAt(list, now), actFrom = activeAt(list, w.from);
    var arr = arrAt(list, now), arrFrom = arrAt(list, w.from);
    var custN = {}; act.forEach(function (ch) { custN[ch.c] = 1; });
    var s = stats(list, w.from, w.to), sp = stats(list, w.prevFrom, w.prevTo);
    var pend = act.filter(function (ch) { return ch.pend; });
    var sp12 = sparks(list, w);
    st.sp = sp12;
    var tr = transRows(w.from, w.to), trPrev = transRows(w.prevFrom, w.prevTo);
    var rv = revRows(w.from, w.to), rvPrev = revRows(w.prevFrom, w.prevTo);
    var pros = st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg') && periodAt(ch, now); });
    var proArr = arrAt(pros, now), proK = pros.reduce(function (t, ch) { var p = periodAt(ch, now); return t + (p.k || 0) + (p.c || 0) + (p.h || 0); }, 0);
    var churnPct = arrFrom ? s.churnArr / arrFrom * 100 : null, churnPctPrev = arrAt(list, w.prevFrom) ? sp.churnArr / arrAt(list, w.prevFrom) * 100 : null;
    $('slKpis').innerHTML = [
      tile({ label: 'ARR', value: eur(arr, true), delta: K.delta(arr, arrFrom, true), sub: 'begin periode ' + eur(arrFrom, true), series: sp12.arr, drill: 'kpi:arr',
        help: 'Som van 12 × MRR van de lopende periode van elk actief abonnement, vandaag.' }),
      tile({ label: 'Actieve abonnementen', value: nf(act.length), delta: K.delta(act.length, actFrom.length, true, 'abs'), sub: 'bij ' + nf(Object.keys(custN).length) + ' klanten', series: sp12.act, drill: 'kpi:act' }),
      tile({ label: 'Gem. ARR per abonnement', value: eur(act.length ? arr / act.length : 0), delta: K.delta(act.length ? arr / act.length : 0, actFrom.length ? arrFrom / actFrom.length : null, true), series: sp12.arpa, drill: 'kpi:arpa',
        help: 'ARR / actieve abonnementen. Het oude dashboard toonde hier het gemiddelde over alle rijen van de sheet, ook upsells en verloren periodes.' }),
      tile({ label: 'Nieuw', value: nf(s.newN), delta: K.delta(s.newN, sp.newN, true, 'abs'), sub: eur(s.newArr, true) + ' ARR', series: sp12.nw, drill: 'kpi:nw' }),
      tile({ label: 'Verlengd', value: nf(s.renewN), delta: K.delta(s.renewN, sp.renewN, true, 'abs'),
        sub: 'verlengingsgraad ' + K.pctTxt(s.rate) + (s.outcomes.waiting + s.outcomes.open ? ' · ' + nf(s.outcomes.waiting + s.outcomes.open) + ' nog open' : ''), series: sp12.renew, drill: 'kpi:renew',
        help: 'Verlengingsgraad = verlengd / (verlengd + gestopt), over de jaarperiodes die in deze periode afliepen. Wissels tellen niet mee.' }),
      tile({ label: 'Verloren', value: nf(s.churnN), delta: K.delta(s.churnN, sp.churnN, false, 'abs'), sub: eur(s.churnArr, true) + ' ARR · ' + K.pctTxt(churnPct) + ' van de ARR', series: sp12.churn, drill: 'kpi:churn',
        help: 'Churn = verloren ARR / ARR bij het begin van de periode.' }),
      tile({ label: 'Netto ARR-groei', value: (arr - arrFrom >= 0 ? '+' : '−') + eur(Math.abs(arr - arrFrom), true), delta: '', sub: K.pctTxt(arrFrom ? (arr - arrFrom) / arrFrom * 100 : null) + ' t.o.v. begin periode', series: sp12.net, drill: 'kpi:net' }),
      tile({ label: 'Wachten op betaling', value: nf(pend.length), sub: eur(arrAt(pend, now), true) + ' ARR', series: sp12.pend, drill: 'kpi:pend',
        help: 'Lopend abonnement met een open verlengingsofferte. Telt mee als actief tegen de lopende prijs. Het verloop (per dag, laatste 90 dagen) komt uit de dagelijkse momentopname sinds 5 oktober 2026: Odoo bewaart het niet.' }),
      tile({ label: 'Transactioneel', value: eur(sumAmt(tr), true), delta: K.delta(sumAmt(tr), sumAmt(trPrev), true), sub: basisLabel(), series: sp12.trans, drill: 'kpi:trans' }),
      tile({ label: 'Gefactureerde omzet', value: eur(sumRev(rv), true), delta: K.delta(sumRev(rv), sumRev(rvPrev), true), sub: 'facturen min creditnota\'s', series: sp12.rev, drill: 'kpi:rev' }),
      tile({ label: 'Professionele ARR', value: eur(proArr, true), sub: nf(pros.length) + ' professionals · ' + nf(proK) + ' kavels', series: sp12.pro, drill: 'kpi:pro',
        help: 'Alle lopende professionele abonnementen, los van het segment hierboven.' })
    ].join('');
  }

  // ── Grafieken en lijsten ──────────────────────────────────────────────────
  var SPLITS = { ct: ['ct', 'Klanttype'], lic: ['licNow', 'Licentie'], merk: ['merk', 'Merk'], plan: ['plan', 'Plan'], none: [null, 'Totaal'] };
  function splitValue(ch) {
    var s = SPLITS[st.split][0]; if (!s) return 'Totaal';
    if (s === 'licNow') return D('lic', ch.licNow);
    if (s === 'plan') return D('plan', ch.plan);
    return D(s, cust(ch)[s]);
  }
  function renderArr(list, w) {
    $('slArrControls').innerHTML = K.pills(A, 'split', null, Object.keys(SPLITS).map(function (k) { return [k, SPLITS[k][1]]; }), st.split);
    var ms = chartMonths(w);
    var groups = {};
    list.forEach(function (ch) { groups[splitValue(ch)] = groups[splitValue(ch)] || []; groups[splitValue(ch)].push(ch); });
    var keys = Object.keys(groups).sort(function (a, b) { return arrAt(groups[b], w.to) - arrAt(groups[a], w.to); });
    st.arrKeys = keys;
    var at = function (m) { return m === K.monthOf(w.to) ? w.to : K.monthEnd(m); };
    var sets = keys.map(function (k, i) {
      // Gestapeld: de eerste vult tot de as, elke volgende tot de vorige.
      return K.area(k, ms.map(function (m) { return isFuture(m) ? null : Math.round(arrAt(groups[k], at(m))); }), i, { stack: 'a', fill: i === 0 ? 'origin' : '-1' });
    });
    if (keys.length === 1) {
      // Zoals de trend in Webgedrag: de vergelijking in grijs, hier een jaar eerder.
      sets.push(K.refLine('Een jaar eerder', ms.map(function (m) { return Math.round(arrAt(list, K.addMonths(at(m), -12))); }), { stack: 'b', borderDash: [] }));
    }
    $('slArr').innerHTML = '<div style="height:260px"><canvas id="slArrChart" aria-label="ARR per maand"></canvas></div>';
    K.chart('slArrChart', {
      type: 'line', plugins: [bandPlugin(ms, w)], data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: sets },
      options: K.baseOptions({ scales: { y: { stacked: true, ticks: { callback: function (v) { return eur(v, true); } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + eur(c.parsed.y); } } } },
        // Welk vlak: de hoogte van de klik tegen de gestapelde waarden (de tooltip toont alle vlakken van die maand).
        onClick: function (evt, els, chart) {
          if (!els.length) return;
          var i = els[0].index, gi = '';
          if (isFuture(ms[i])) return;
          if (st.split !== 'none') {
            var v = chart.scales.y.getValueForPixel(evt.y), cum = 0;
            for (var k = 0; k < keys.length; k++) {
              if (!chart.isDatasetVisible(k)) continue;
              var val = sets[k].data[i] || 0;
              if (v <= cum + val) { gi = k; break; }
              cum += val;
            }
          }
          openDrill('arrsplit:' + ms[i] + ':' + gi);
        },
        onHover: function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } })
    });
  }

  // [soort, label, kleur]: kleur = CSS-variabele van het thema of een functie alpha -> kleur.
  var BRIDGE = [['new', 'Nieuw', '--su'], ['expand', 'Uitbreiding', function (a) { return K.C.good((a === undefined ? 1 : a) * 0.5); }],
    ['switch', 'Wissel', function (a) { return 'rgba(148,163,184,' + (a === undefined ? 1 : a) + ')'; }], ['contract', 'Verlaging', '--wa'], ['churn', 'Verloren', '--er']];
  function bridgeData(list, ms) {
    var rows = ms.map(function (m) { var o = { m: m }; BRIDGE.forEach(function (b) { o[b[0]] = 0; }); o.ev = []; return o; });
    var idx = {}; ms.forEach(function (m, i) { idx[m] = i; });
    list.forEach(function (ch) {
      events(ch).forEach(function (e) {
        if (e.d > st.data.meta.today) return;
        var i = idx[K.monthOf(e.d)]; if (i === undefined || e.t === 'renew') return;
        rows[i][e.t] += 12 * e.v; rows[i].ev.push(e);
      });
    });
    return rows;
  }
  function renderBridge(list, w) {
    var ms = chartMonths(w), rows = bridgeData(list, ms);
    st.bridgeRows = rows;
    $('slBridge').innerHTML = '<div style="height:240px"><canvas id="slBridgeChart" aria-label="ARR-brug per maand"></canvas></div>'
      + '<div class="overflow-x-auto mt-3"><table data-om-sortable class="table table-xs"><thead><tr><th>Maand</th>' + BRIDGE.map(function (b) { return '<th class="text-right">' + b[1] + '</th>'; }).join('') + '<th class="text-right">Netto</th></tr></thead><tbody>'
      + rows.filter(function (r) { return !isFuture(r.m); }).reverse().map(function (r) {
        var net = BRIDGE.reduce(function (s, b) { return s + r[b[0]]; }, 0);
        return '<tr><td>' + K.monthLabel(r.m, true) + '</td>' + BRIDGE.map(function (b) {
          var v = r[b[0]];
          return '<td class="text-right tabular-nums">' + (Math.abs(v) >= 1 ? '<a class="link link-hover" ' + A + '="drill" data-drill="bridge:' + r.m + ':' + b[0] + '">' + (v > 0 ? '+' : '−') + eur(Math.abs(v)) + '</a>' : '<span class="text-base-content/30">—</span>') + '</td>';
        }).join('') + '<td class="text-right tabular-nums font-medium ' + (net >= 0 ? 'text-success' : 'text-error') + '">' + (net >= 0 ? '+' : '−') + eur(Math.abs(net)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    K.chart('slBridgeChart', {
      type: 'bar', plugins: [bandPlugin(ms, w)],
      data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: BRIDGE.map(function (b) {
        return K.bars(b[1], rows.map(function (r) { return isFuture(r.m) ? null : Math.round(r[b[0]]); }), b[2], { stack: 's' });
      }) },
      options: K.baseOptions({
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: false, ticks: { callback: function (v) { return eur(v, true); } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + eur(c.parsed.y); } } } },
        onClick: function (evt, els) { if (!els.length) return; var e = els[0]; openDrill('bridge:' + ms[e.index] + ':' + BRIDGE[e.datasetIndex][0]); }
      })
    });
  }

  function targetFor(metric, m) {
    var t = st.targets && st.targets[metric]; return t && t[m] !== undefined ? t[m] : null;
  }
  function renderNew(list, w) {
    var ms = chartMonths(w);
    var news = list.filter(function (ch) { return !ch.newSwitch && ch.start <= w.to; });
    var byM = ms.map(function (m) { return news.filter(function (ch) { return K.monthOf(ch.start) === m; }); });
    var assist = st.data.meta.assistantLicenses || [];
    var tgt = ms.map(function (m) { var a = targetFor('assistant', m), p = targetFor('openvme_professional', m); return a === null && p === null ? null : (a || 0) + (p || 0); });
    var hasTgt = tgt.some(function (v) { return v !== null; });
    var inW = news.filter(function (ch) { return inWin(ch.start, w.from, w.to); });
    var byLic = {}; inW.forEach(function (ch) { var k = ch.lic; byLic[k] = byLic[k] || { n: 0, arr: 0, still: 0 }; byLic[k].n++; byLic[k].arr += 12 * mrrAt(ch, ch.start); if (!ch.end || ch.end > w.to) byLic[k].still++; });
    $('slNew').innerHTML = '<div style="height:200px"><canvas id="slNewChart" aria-label="Nieuwe abonnementen per maand"></canvas></div>'
      + '<table data-om-sortable class="table table-xs mt-3"><thead><tr><th>Licentie (eerste periode)</th><th class="text-right">Aantal</th><th class="text-right">Nog lopend</th><th class="text-right">ARR bij start</th></tr></thead><tbody>'
      + Object.keys(byLic).sort(function (a, b) { return byLic[b].n - byLic[a].n; }).map(function (k) {
        return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="newlic:' + k + '"><td>' + esc(D('lic', Number(k))) + '</td><td class="text-right">' + nf(byLic[k].n) + '</td><td class="text-right">' + nf(byLic[k].still) + '</td><td class="text-right">' + eur(byLic[k].arr) + '</td></tr>';
      }).join('') + '</tbody></table>'
      + (hasTgt ? '<p class="text-[11px] text-base-content/50 mt-2">De lijn is de target Assistant + OpenVME Professional uit het tabblad Targets; die telt enkel de licenties Basic, Smart, Unlimited, Coached en OpenVME Professional.</p>' : '');
    var dsTarget = hasTgt ? [K.refLine('Target (Assistant + OpenVME Professional)', tgt, { pointRadius: 2 })] : [];
    var dsAssist = K.bars('Assistant / OpenVME Professional', byM.map(function (l, i) { return isFuture(ms[i]) ? null : l.filter(function (ch) { return assist.indexOf(ch.licId) >= 0 || ch.licId === st.data.meta.proLicense; }).length; }), '--p', { stack: 'n' });
    var dsOther = K.bars('Andere licenties', byM.map(function (l, i) { return isFuture(ms[i]) ? null : l.length - dsAssist.data[i]; }), function (a) { return K.C.primary((a === undefined ? 1 : a) * 0.4); }, { stack: 'n' });
    K.chart('slNewChart', {
      type: 'bar', plugins: [bandPlugin(ms, w)], data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: [dsAssist, dsOther].concat(dsTarget) },
      options: K.baseOptions({ scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } },
        onClick: function (evt, els) { if (els.length) openKpi('nw', els[0].index); } })
    });
  }

  function renderRenew(list, w) {
    var o = renewalOutcomes(list, w.from, w.to), now = w.to, horizon = K.addDays(now, st.renewWin);
    var up = [];
    activeAt(list, now).forEach(function (ch) {
      if (!isYearly(ch)) return;
      var p = periodAt(ch, now), due = K.addMonths(p.s, 12);
      if (due > now && due <= horizon) up.push({ ch: ch, p: p, due: due });
    });
    up.sort(function (a, b) { return a.due.localeCompare(b.due); });
    $('slRenewControls').innerHTML = K.pills(A, 'renewWin', null, [[30, '30 d'], [60, '60 d'], [90, '90 d']], st.renewWin);
    var bar = function (n, label, cls, res) { return '<button type="button" class="flex-1 min-w-[5rem] rounded-lg ' + cls + ' p-2 text-left om-hover" ' + A + '="drill" data-drill="renewout:' + res + '"><div class="text-lg font-semibold">' + nf(n) + '</div><div class="text-[11px]">' + label + '</div></button>'; };
    $('slRenew').innerHTML = '<div class="flex flex-wrap gap-2">' + bar(o.renewed, 'verlengd', 'bg-success/15', 'renewed') + bar(o.churned, 'gestopt', 'bg-error/15', 'churned')
      + bar(o.switched, 'gewisseld', 'bg-base-200', 'switched') + bar(o.waiting, 'wachten op betaling', 'bg-warning/20', 'waiting') + bar(o.open, 'nog niet verlengd, geen offerte', 'bg-base-200', 'open') + '</div>'
      + '<p class="text-xs text-base-content/60 mt-2">Verlengingsgraad ' + K.pctTxt(o.renewed + o.churned ? o.renewed / (o.renewed + o.churned) * 100 : null) + ' over ' + nf(o.rows.length) + ' jaarperiodes die afliepen in de ' + PERIODS[st.period] + '. <a class="link" ' + A + '="drill" data-drill="renewout">Lijst</a></p>'
      + '<h3 class="text-sm font-semibold mt-4 mb-1">Te verlengen in de komende ' + st.renewWin + ' dagen</h3>'
      + (up.length ? '<table data-om-sortable class="table table-xs"><thead><tr><th>Klant</th><th>Vervalt</th><th class="text-right">ARR</th><th></th></tr></thead><tbody>'
        + up.slice(0, 40).map(function (r) {
          return '<tr><td>' + esc(cust(r.ch).name) + '</td><td>' + K.dayLabel(r.due) + '</td><td class="text-right tabular-nums">' + eur(12 * mrrAt(r.ch, now)) + '</td><td>'
            + (r.ch.pend ? '<span class="badge badge-warning badge-sm">offerte</span>' : '') + ' ' + K.odooLink('sale.order', r.p.o, r.p.n) + '</td></tr>';
        }).join('') + '</tbody></table>' + (up.length > 40 ? '<p class="text-xs text-base-content/50">en nog ' + (up.length - 40) + '…</p>' : '')
        + '<p class="text-xs text-base-content/60 mt-1">Samen ' + eur(12 * up.reduce(function (s, r) { return s + mrrAt(r.ch, now); }, 0)) + ' ARR.</p>'
        : '<p class="text-sm text-base-content/60">Geen jaarabonnementen die in die periode vervallen.</p>');
  }

  function renderChurn(list, w) {
    var lost = list.filter(function (ch) { return ch.end && !ch.endSwitch && inWin(ch.end, w.from, w.to) && ch.end <= w.to; });
    var planned = list.filter(function (ch) { return ch.end && !ch.endSwitch && ch.end > w.to; });
    var switched = list.filter(function (ch) { return ch.end && ch.endSwitch && inWin(ch.end, w.from, w.to); });
    var byR = {};
    lost.forEach(function (ch) { var k = ch.reason; byR[k] = byR[k] || { n: 0, arr: 0 }; byR[k].n++; byR[k].arr += 12 * ch.p[ch.p.length - 1].m; });
    $('slChurn').innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div><table data-om-sortable class="table table-xs"><thead><tr><th>Reden</th><th class="text-right">Aantal</th><th class="text-right">ARR</th></tr></thead><tbody>'
      + Object.keys(byR).sort(function (a, b) { return byR[b].arr - byR[a].arr; }).map(function (k) {
        return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="churnr:' + k + '"><td>' + esc(Number(k) >= 0 ? D('reason', Number(k)) : 'Geen reden') + '</td><td class="text-right">' + nf(byR[k].n) + '</td><td class="text-right tabular-nums">' + eur(byR[k].arr) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Totaal</td><td class="text-right">' + nf(lost.length) + '</td><td class="text-right">' + eur(12 * lost.reduce(function (s, ch) { return s + ch.p[ch.p.length - 1].m; }, 0)) + '</td></tr></tfoot></table>'
      + '<p class="text-xs text-base-content/60 mt-2"><a class="link" ' + A + '="drill" data-drill="churn">Bekijk de ' + nf(lost.length) + ' abonnementen</a> · '
      + nf(switched.length) + ' wissels in dezelfde periode tellen niet als verloren (<a class="link" ' + A + '="drill" data-drill="switch">lijst</a>).</p></div>'
      + '<div><h3 class="text-sm font-semibold mb-1">Aangekondigd</h3>'
      + (planned.length ? '<table data-om-sortable class="table table-xs"><thead><tr><th>Klant</th><th>Stopt op</th><th class="text-right">ARR</th></tr></thead><tbody>' + planned.map(function (ch) {
        var p = ch.p[ch.p.length - 1];
        return '<tr><td>' + esc(cust(ch).name) + '</td><td>' + K.dayLabel(ch.end) + '</td><td class="text-right tabular-nums">' + eur(12 * p.m) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="text-sm text-base-content/60">Geen stopzettingen met een einddatum in de toekomst.</p>')
      + '</div></div>';
  }

  // Transactioneel: [orderdatum, factuurdatum, betaald, groep, aantal, bedrag, klant, order, product]
  function basisDate(r) { return st.basis === 'order' ? r[0] : st.basis === 'invoice' ? r[1] : (r[2] ? r[1] : ''); }
  function basisLabel() { return { order: 'verkocht (orderdatum)', invoice: 'gefactureerd (factuurdatum)', paid: 'betaald (factuurdatum)' }[st.basis]; }
  function transRows(a, b) {
    return st.data.trans.filter(function (r) { var d = basisDate(r); return inWin(d, a, b) && custOk(st.data.customers[r[6]]); });
  }
  function sumAmt(rows) { return rows.reduce(function (s, r) { return s + r[5]; }, 0); }
  function renderTrans(w) {
    $('slTransControls').innerHTML = K.pills(A, 'basis', null, [['order', 'Verkocht'], ['invoice', 'Gefactureerd'], ['paid', 'Betaald']], st.basis);
    var rows = transRows(w.from, w.to), g = {};
    rows.forEach(function (r) { var k = r[3]; g[k] = g[k] || { lines: 0, qty: 0, amt: 0 }; g[k].lines++; g[k].qty += r[4]; g[k].amt += r[5]; });
    var keys = Object.keys(g).sort(function (a, b) { return g[b].amt - g[a].amt; });
    var credits = keys.filter(function (k) { return D('tg', Number(k)) === 'Credits'; })[0];
    $('slTrans').innerHTML = (keys.length ? '<table data-om-sortable class="table table-sm"><thead><tr><th>Product</th><th class="text-right">Aantal</th><th class="text-right">Orderlijnen</th><th class="text-right">Gemiddeld</th><th class="text-right">Totaal ex btw</th></tr></thead><tbody>'
      + keys.map(function (k) {
        var x = g[k];
        return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="trans:' + k + '"><td>' + esc(D('tg', Number(k))) + '</td><td class="text-right tabular-nums">' + nf(x.qty, 2) + '</td><td class="text-right">' + nf(x.lines)
          + '</td><td class="text-right tabular-nums">' + eur(x.amt / x.lines) + '</td><td class="text-right tabular-nums font-medium">' + eur(x.amt) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Totaal</td><td></td><td class="text-right">' + nf(rows.length) + '</td><td></td><td class="text-right">' + eur(sumAmt(rows)) + '</td></tr></tfoot></table>'
      : '<p class="text-sm text-base-content/60">Geen transactionele verkoop in deze selectie.</p>')
      + '<p class="text-xs text-base-content/50 mt-2">' + esc(basisLabel()) + ' in de ' + PERIODS[st.period] + '. '
      + (credits !== undefined ? 'Expert-uren = credits ÷ 3: ' + nf(g[credits].qty / 3, 1) + ' uur. ' : '')
      + 'Enkel bevestigde verkooporders; "Betaald" = de factuur van die lijn is betaald.' + '</p>';
  }

  // Omzet: [factuurdatum, bron, bedrag, klant, factuur, betaald, naam]
  function revRows(a, b) { return st.data.revenue.filter(function (r) { return inWin(r[0], a, b) && custOk(st.data.customers[r[3]]); }); }
  function sumRev(rows) { return rows.reduce(function (s, r) { return s + r[2]; }, 0); }
  function renderRev(w) {
    var ms = chartMonths(w), bron = st.data.bron;
    var rows = st.data.revenue.filter(function (r) { return r[0] >= ms[0] && r[0] <= w.to && custOk(st.data.customers[r[3]]); });
    var sets = bron.map(function (b, i) {
      return K.bars(b, ms.map(function (m) { return isFuture(m) ? null : Math.round(rows.filter(function (r) { return r[1] === i && K.monthOf(r[0]) === m; }).reduce(function (s, r) { return s + r[2]; }, 0)); }), i, { stack: 'r' });
    }).filter(function (s) { return s.data.some(function (v) { return v; }); });
    $('slRev').innerHTML = '<div style="height:220px"><canvas id="slRevChart" aria-label="Gefactureerde omzet per maand"></canvas></div>'
      + '<p class="text-xs text-base-content/50 mt-2">Professionele abonnementen = abonnementsproducten van klanten met klanttype Professioneel Syndicus. Syndicoach-omzet komt er later bij als eigen bron.</p>';
    K.chart('slRevChart', {
      type: 'bar', plugins: [bandPlugin(ms, w)], data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: sets },
      options: K.baseOptions({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: false, ticks: { callback: function (v) { return eur(v, true); } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + eur(c.parsed.y); } } } },
        onClick: function (evt, els) { if (els.length) openKpi('rev', els[0].index); } })
    });
  }

  function renderPro(w) {
    var now = w.to;
    var pros = st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg') && periodAt(ch, now); });
    pros.sort(function (a, b) { return mrrAt(b, now) - mrrAt(a, now); });
    var tot = { m: 0, k: 0, c: 0, h: 0, bank: 0, peppol: 0 };
    var rows = pros.map(function (ch) {
      var p = periodAt(ch, now), m = mrrAt(ch, now);
      tot.m += m; tot.k += p.k || 0; tot.c += p.c || 0; tot.h += p.h || 0; tot.bank += p.bank || 0; tot.peppol += p.peppol || 0;
      return '<tr><td>' + esc(cust(ch).name) + '</td><td>' + K.dayLabel(ch.start) + '</td><td class="text-right tabular-nums">' + eur(m) + '</td><td class="text-right tabular-nums">' + eur(12 * m)
        + '</td><td class="text-right">' + nf(p.k) + '</td><td class="text-right">' + nf(p.c) + '</td><td class="text-right">' + nf(p.h) + '</td><td class="text-right">' + nf(p.bank) + '</td><td class="text-right">' + nf(p.peppol)
        + '</td><td>' + K.odooLink('sale.order', p.o, p.n) + '</td></tr>';
    });
    var ms = chartMonths(w);
    var at = function (m, f) { if (isFuture(m)) return null; var d = m === K.monthOf(now) ? now : K.monthEnd(m); return st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg'); }).reduce(function (s, ch) { var p = periodAt(ch, d); return s + (p ? f(p) : 0); }, 0); };
    var planned = st.data.planned || [];
    $('slPro').innerHTML = '<div class="overflow-x-auto"><table data-om-sortable class="table table-xs"><thead><tr><th>Professional</th><th>Sinds</th><th class="text-right">MRR</th><th class="text-right">ARR</th><th class="text-right" title="Appartementen/kavels">Kavels</th><th class="text-right" title="Commerciële units">Comm.</th><th class="text-right">Huizen</th><th class="text-right">Bank</th><th class="text-right">Peppol</th><th></th></tr></thead><tbody>'
      + (rows.join('') || '<tr><td colspan="10" class="text-base-content/60">Geen lopende professionele abonnementen in deze selectie.</td></tr>')
      + '</tbody><tfoot><tr><td>Totaal</td><td></td><td class="text-right">' + eur(tot.m) + '</td><td class="text-right">' + eur(12 * tot.m) + '</td><td class="text-right">' + nf(tot.k) + '</td><td class="text-right">' + nf(tot.c) + '</td><td class="text-right">' + nf(tot.h) + '</td><td class="text-right">' + nf(tot.bank) + '</td><td class="text-right">' + nf(tot.peppol) + '</td><td></td></tr></tfoot></table></div>'
      + '<div style="height:200px" class="mt-3"><canvas id="slProChart" aria-label="Kavels, bankkoppelingen en peppol per maand"></canvas></div>'
      + '<h3 class="text-sm font-semibold mt-4 mb-1">Gepland, nog niet in Odoo</h3>'
      + '<table data-om-sortable class="table table-xs"><thead><tr><th>Professional</th><th>Vanaf</th><th class="text-right">Kavels</th><th class="text-right">MRR</th><th class="text-right">ARR</th><th></th></tr></thead><tbody>'
      + planned.map(function (pl) {
        return '<tr class="' + (pl.inOdoo ? 'opacity-50' : '') + '"><td>' + esc(pl.name) + (pl.inOdoo ? ' <span class="badge badge-success badge-sm">staat nu in Odoo</span>' : '') + '</td><td>' + K.monthLabel(pl.start, true)
          + '</td><td class="text-right">' + nf(pl.plots) + '</td><td class="text-right">' + eur(pl.mrr) + '</td><td class="text-right">' + eur(12 * pl.mrr) + '</td>'
          + '<td class="text-right"><button type="button" class="btn btn-ghost btn-xs" ' + A + '="planned-edit" data-id="' + esc(pl.id) + '">Wijzig</button>'
          + '<button type="button" class="btn btn-ghost btn-xs text-error" ' + A + '="planned-del" data-id="' + esc(pl.id) + '">Weg</button></td></tr>';
      }).join('') + '</tbody></table>'
      + '<form id="slPlannedForm" class="grid grid-cols-2 md:grid-cols-6 gap-2 items-end mt-2">'
      // Bewust geen name="id"/"name": die overschaduwen form.id en form.name.
      + '<input type="hidden" name="pid"><label class="col-span-2"><span class="text-[11px] text-base-content/60">Naam</span><input name="pname" class="input input-bordered input-sm w-full" required></label>'
      + '<label><span class="text-[11px] text-base-content/60">Vanaf (maand)</span><input name="pstart" type="month" class="input input-bordered input-sm w-full" required></label>'
      + '<label><span class="text-[11px] text-base-content/60">Kavels</span><input name="pplots" type="number" min="0" class="input input-bordered input-sm w-full"></label>'
      + '<label><span class="text-[11px] text-base-content/60">MRR €</span><input name="pmrr" type="number" min="0" step="0.01" class="input input-bordered input-sm w-full"></label>'
      + '<button class="btn btn-sm btn-primary" type="submit">Bewaren</button></form>'
      + '<p class="text-[11px] text-base-content/50 mt-1">Was de sheet "Datacheck" in Looker. Een rij met een Odoo-partner verdwijnt vanzelf uit de telling zodra die professional een lopend abonnement heeft.</p>';
    K.chart('slProChart', {
      type: 'line', plugins: [bandPlugin(ms, w)],
      data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: [
        K.area('Kavels', ms.map(function (m) { return at(m, function (p) { return (p.k || 0) + (p.c || 0) + (p.h || 0); }); }), 0, { yAxisID: 'y' }),
        K.area('Bankkoppelingen', ms.map(function (m) { return at(m, function (p) { return p.bank || 0; }); }), 1, { yAxisID: 'y1', fill: false }),
        K.area('Peppol', ms.map(function (m) { return at(m, function (p) { return p.peppol || 0; }); }), 2, { yAxisID: 'y1', fill: false })
      ] },
      options: K.baseOptions({ scales: { y: { title: { display: true, text: 'kavels', color: K.ink() } }, y1: { display: true, ticks: { precision: 0 }, title: { display: true, text: 'koppelingen', color: K.ink() } } },
        onClick: function (evt, els) { if (els.length && !isFuture(ms[els[0].index])) openDrill('pro@' + ms[els[0].index], { kavels: true }); },
        onHover: function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } })
    });
  }

  function renderAttention() {
    var items = st.data.attention || [];
    var warn = items.filter(function (a) { return a.sev === 'warn'; }), info = items.filter(function (a) { return a.sev !== 'warn'; });
    var one = function (a) {
      return '<li class="py-2"><div class="flex items-start gap-2"><i data-lucide="' + (a.sev === 'warn' ? 'alert-triangle' : 'info') + '" class="w-4 h-4 mt-0.5 shrink-0 ' + (a.sev === 'warn' ? 'text-warning' : 'text-base-content/40') + '"></i>'
        + '<div class="min-w-0"><div class="text-sm">' + esc(a.title) + '</div><div class="text-xs text-base-content/60">' + esc(a.detail) + '</div>'
        + (a.refs && a.refs.length ? '<div class="text-xs mt-1 flex flex-wrap gap-x-3">' + a.refs.map(function (r) { return K.odooLink(r.model, r.id, r.label); }).join('') + '</div>' : '') + '</div></div></li>';
    };
    $('slAttSub').textContent = nf(warn.length) + ' om na te kijken, ' + nf(info.length) + ' ter info. Niets hiervan wordt weggelaten: het telt mee zoals beschreven.';
    $('slAtt').innerHTML = items.length ? '<ul class="divide-y om-lijnen">' + warn.concat(info).map(one).join('') + '</ul>' : '<p class="text-sm text-base-content/60">Niets opvallends.</p>';
  }

  // ── Doorklikken ───────────────────────────────────────────────────────────
  // Elke lijst zegt WAAROM de records erin staan (de regels, bovenaan het venster) en
  // per rij WAT dat staaft (kolom "Waarom": periodes, orders, de lead). De teksten
  // BESCHRIJVEN derive.js; ze beslissen niets. Wijzig je daar een regel, pas ze hier aan.
  function W() { return st.data.meta.switchWindowDays; }
  var WHY = {
    keten: 'Eén abonnement = alle orders in Odoo met hetzelfde eerste contract. De klant is de commerciële partner: een order op een contactpersoon telt bij zijn VME of bedrijf.',
    actief: function (d) { return 'Actief op ' + K.dayLabel(d) + ' = er loopt een bevestigde periode: ze is gestart, en de volgende periode of het einde is nog niet begonnen. Een verlengingsofferte die nog niet bevestigd is, is geen periode: het lopende contract blijft gelden tegen zijn prijs.'; },
    arr: 'ARR = 12 × de maandprijs (MRR) van die periode in Odoo. Een upsell telt pas vanaf zijn eigen startdatum.',
    nieuw: function () { return 'Nieuw = het eerste contract van een abonnement, op zijn startdatum. Een wissel telt niet als nieuw: de klant had in de ' + W() + ' dagen ervoor nog een ander abonnement lopen.'; },
    verloren: function () { return 'Verloren = de laatste periode eindigt (einddatum, of de volgende factuurdatum als die vroeger valt) en de klant heeft binnen ' + W() + ' dagen erna geen ander abonnement, lopend of nieuw. De reden is de stopzettingsreden op de laatste order.'; },
    wissel: function () { return 'Wissel = het abonnement stopt of start terwijl de klant binnen ' + W() + ' dagen een ander abonnement heeft. Geen verloren en geen nieuwe klant.'; },
    wijziging: 'Uitbreiding of verlaging = de nieuwe periode bij een verlenging kost meer of minder dan de vorige, of een upsell op zijn startdatum.',
    merk: 'Merk = uit één lead van de klant: de kans van het eerste contract, anders zijn oudste gewonnen lead, anders zijn oudste lead. Syndicoach als die lead merk-herkomst Syndicoach of Syndicuskiezen heeft, een kanaal dat met "syndicoach" begint, of "syndicoach" of "syndicus kiezen" in de naam of een label. Anders OpenVME: OpenVME heeft geen eigen signaal. Onbekend = er is geen enkele lead van die klant (geen kans op zijn orders, geen lead op de klant of een contactpersoon ervan).',
    lead: 'Kanaal en merk-herkomst komen van dezelfde lead als het merk.',
    ct: 'Klanttype = het klanttype van de klant (commerciële partner) in Odoo, anders dat van de order.',
    lic: 'Licentie = het licentieproduct op de orderlijnen van de lopende periode.',
    plan: 'Plan = het abonnementsplan van de laatste order.'
  };
  /** De selectie waarbinnen de lijst geldt: segment, de filters links en wat altijd buiten valt. */
  function selectieWhy() {
    var bits = ['segment ' + { vme: "VME's (VME en VME in beheer)", pro: 'professionele syndici', all: 'alle klanttypes' }[st.f.seg]];
    Object.keys(DEFAULTS).forEach(function (k) { if (k !== 'seg' && st.f[k] !== DEFAULTS[k]) bits.push(CHIP[k].toLowerCase() + ' ' + chipValue(k)); });
    var ex = (st.data.excluded || {}).items || [];
    var out = ['Selectie: ' + esc(bits.join(' · ')) + '.' + (ex.length ? ' Altijd buiten de cijfers: ' + esc(ex.map(function (e) { return e.label || (e.kind + ' ' + e.record_id); }).join(', ')) + '.' : '')];
    if (st.f.merk !== '') out.push(WHY.merk);
    if (st.f.ch !== '' || st.f.org !== '') out.push(WHY.lead);
    return out;
  }

  // Wat elke rij staaft.
  function otherChains(ch) { return st.data.chains.filter(function (o) { return o !== ch && o.c === ch.c; }); }
  function chainRef(o) {
    var p = o.p[o.p.length - 1];
    return K.odooLink('sale.order', p.o, p.n) + ' (' + K.dayLabel(o.start) + ' → ' + (o.end ? K.dayLabel(o.end) : 'lopend') + ')';
  }
  function periodTxt(p) { return K.odooLink('sale.order', p.o, p.n) + ' ' + K.dayLabel(p.s) + ' → ' + (p.e ? K.dayLabel(p.e) : 'open'); }
  /** Waarom dit abonnement nieuw is, of een wissel. */
  function startWhy(ch) {
    var from = K.addDays(ch.start, -W()), oth = otherChains(ch);
    var prev = oth.filter(function (o) { return o.start < ch.start && (!o.end || o.end >= from); });
    if (prev.length) return 'Wissel: de klant had al ' + prev.map(chainRef).join(', ');
    var older = oth.filter(function (o) { return o.start < ch.start; });
    return older.length ? 'Eerder klant, maar meer dan ' + W() + ' dagen ervoor gestopt: ' + older.map(chainRef).join(', ') : 'Eerste abonnement van deze klant';
  }
  /** Waarom deze stopzetting verloren is, of een wissel. */
  function endWhy(ch) {
    var last = ch.p[ch.p.length - 1], to = K.addDays(ch.end, W()), oth = otherChains(ch);
    var succ = oth.filter(function (o) { return o.start <= to && (!o.end || o.end > ch.end); });
    var kop = 'Laatste periode ' + periodTxt(last) + '. ';
    if (succ.length) return kop + 'Ander abonnement: ' + succ.map(chainRef).join(', ');
    var later = oth.filter(function (o) { return o.start > to; });
    return kop + 'Geen ander abonnement binnen ' + W() + ' dagen' + (later.length ? '; later wel: ' + later.map(chainRef).join(', ') : '');
  }
  var LEAD_HOW = ['kans van het eerste contract', 'oudste gewonnen lead', 'oudste lead'];
  /** Waarom deze klant bij dit merk staat: welke lead, hoe gekozen, welk signaal. */
  function merkWhy(c) {
    return (c.lead ? K.odooLink('crm.lead', c.lead, 'Lead #' + c.lead) + ' <span class="text-base-content/50">(' + (LEAD_HOW[c.lh] || 'lead') + ')</span>: ' : '') + esc(D('mw', c.mw));
  }
  /** Een maandgrafiek voor een venster; stand = een stand op het einde van de maand (geen "hele periode"). */
  function monthChart(ms, data, label, money, sel, pick, stand) {
    return { type: stand ? 'line' : 'bar', labels: ms.map(function (m) { return K.monthLabel(m, true); }), data: data, label: label,
      selected: sel === null || sel < 0 ? null : sel, zero: stand ? false : undefined, stand: !!stand, onPick: pick,
      fmt: function (v, short) { return money ? eur(v, short) : nf(v, short ? 0 : 1); } };
  }

  // Wat een tegel in het groot toont, en welke lijst eronder (alles, of één maand).
  var KPIS = {
    arr: { label: 'ARR', type: 'line', money: true, all: 'active', at: 'active@', zero: false, ref: 'arr', stand: true },
    act: { label: 'Actieve abonnementen', type: 'line', all: 'active', at: 'active@', zero: false, ref: 'act', stand: true },
    arpa: { label: 'Gem. ARR per abonnement', type: 'line', money: true, all: 'active', at: 'active@', zero: false, stand: true },
    nw: { label: 'Nieuwe abonnementen', type: 'bar', all: 'new', at: 'newm:' },
    renew: { label: 'Verlengingen', type: 'bar', all: 'renew', at: 'renewm:' },
    churn: { label: 'Verloren abonnementen', type: 'bar', all: 'churn', at: 'churnm:' },
    net: { label: 'Netto ARR-groei', type: 'bar', money: true, all: 'bridge:all', at: 'bridge:' },
    pend: { label: 'Wachten op betaling', type: 'line', all: 'pend', days: true },
    trans: { label: 'Transactioneel', type: 'bar', money: true, all: 'trans', at: 'transm:' },
    rev: { label: 'Gefactureerde omzet', type: 'bar', money: true, all: 'rev', at: 'revm:' },
    pro: { label: 'Professionele ARR', type: 'line', money: true, all: 'pro', at: 'pro@', zero: false, stand: true }
  };
  function openKpi(name, idx) {
    var k = KPIS[name], sp = st.sp;
    if (!k || !sp) return;
    var w = win(), sel = idx === null || idx === undefined || !k.at ? null : idx, m = sel === null ? null : sp.months[sel];
    var labels = k.days ? sp.pendDays.map(function (d) { return K.dayLabel(d); }) : sp.months.map(function (mm) { return K.monthLabel(mm, true); });
    var ref = null;
    if (k.ref) {
      var list = chains();
      ref = { label: 'Een jaar eerder', data: sp.months.map(function (mm) {
        var d = K.addMonths(mm === K.monthOf(w.to) ? w.to : K.monthEnd(mm), -12);
        return k.ref === 'arr' ? Math.round(arrAt(list, d)) : activeAt(list, d).length;
      }) };
    }
    openDrill(m ? k.at + m : k.all, {
      keep: true,
      chart: {
        type: k.type, labels: labels, data: sp[name], label: k.label, selected: sel, zero: k.zero, ref: ref, stand: !!k.stand,
        fmt: function (v, short) { return k.money ? eur(v, short) : nf(v, short ? 0 : 1); },
        onPick: k.at ? function (i) { openKpi(name, i === sel ? null : i); } : null,
        note: k.days ? 'Per dag, uit de dagelijkse momentopname (sinds 5 oktober 2026): Odoo bewaart dit niet.' : ''
      }
    });
  }

  var CH_HEAD = ['Klant', 'Order', 'Licentie', 'Klanttype', 'Merk', 'Klant sinds', 'ARR'];
  function chainRow(ch, d, extra) {
    var p = periodAt(ch, d) || ch.p[ch.p.length - 1], c = cust(ch);
    return [esc(c.name), K.odooLink('sale.order', p.o, p.n), esc(D('lic', ch.licNow)), esc(D('ct', c.ct)), esc(D('merk', c.merk)), K.dayLabel(ch.start),
      eur(12 * (periodAt(ch, d) ? mrrAt(ch, d) : p.m))].concat(extra || []);
  }
  function openDrill(key, extra) {
    var w = win(), list = chains(), parts = key.split(':');
    if (parts[0] === 'kpi') { openKpi(parts[1], null); return; }
    extra = extra || {};
    var rows, head = CH_HEAD.slice(), title, sub = '', why = [], merkOn = st.f.merk !== '';
    var mOf = function (prefix) { return key.indexOf(prefix) === 0 ? key.slice(prefix.length) : null; };
    var endOf = function (m) { var d = K.monthEnd(m); return d > w.to ? w.to : d; };
    var monthTitle = function (m) { return m ? ' — ' + K.monthLabel(m, true) : ''; };
    // De kolom "Merk volgens" (welke lead, welk signaal) staat erbij zodra het merk de lijst mee bepaalt.
    var withMerk = function (x, cells) { return merkOn ? cells.concat([merkWhy(x && x.p ? cust(x) : x)]) : cells; };
    if (key === 'active' || mOf('active@') || parts[0] === 'arrsplit') {
      // arrsplit:<maand of leeg>:<groep of leeg> = een vlak van het ARR-verloop.
      var am = parts[0] === 'arrsplit' ? parts[1] : mOf('active@'), d = am ? endOf(am) : w.to;
      var gi = parts[0] === 'arrsplit' && parts[2] !== '' && parts[2] !== undefined ? Number(parts[2]) : null;
      var grp = gi === null ? null : (st.arrKeys || [])[gi];
      var src = grp === null || grp === undefined ? list : list.filter(function (ch) { return splitValue(ch) === grp; });
      var act = activeAt(src, d).sort(function (a, b) { return mrrAt(b, d) - mrrAt(a, d); });
      title = (grp ? 'ARR · ' + SPLITS[st.split][1].toLowerCase() + ' ' + grp : 'Actieve abonnementen') + (am ? ' — eind ' + K.monthLabel(am, true) : ' — vandaag');
      sub = 'Stand op ' + K.dayLabel(d) + '.';
      why = [WHY.actief(d), WHY.arr, WHY.keten];
      if (grp && WHY[st.split] && typeof WHY[st.split] === 'string') why.push(WHY[st.split]);
      if (grp && st.split === 'merk') merkOn = true;
      head.push('Status', 'Waarom');
      rows = act.map(function (ch) {
        var p = periodAt(ch, d), stt = d !== w.to ? 'actief' : ch.pend ? 'wacht op betaling' : ch.paused ? 'gepauzeerd' : 'actief';
        var bewijs = 'Periode ' + periodTxt(p) + ' · MRR ' + eur(mrrAt(ch, d))
          + (d === w.to && ch.pend ? ' · verlengingsofferte ' + K.odooLink('sale.order', ch.pend.o, ch.pend.n) + ' staat open' : '');
        return withMerk(ch, chainRow(ch, d, [stt === 'wacht op betaling' ? '<span class="badge badge-warning badge-sm">wacht op betaling</span>' : stt, bewijs]));
      });
      if (parts[0] === 'arrsplit' && !extra.chart) {
        var msA = chartMonths(w), atA = function (m) { return m === K.monthOf(w.to) ? w.to : K.monthEnd(m); }, selA = am ? msA.indexOf(am) : -1;
        extra = Object.assign({}, extra, { keep: true, chart: monthChart(msA, msA.map(function (m) { return isFuture(m) ? null : Math.round(arrAt(src, atA(m))); }),
          'ARR' + (grp ? ' · ' + grp : ''), true, selA, function (i) { openDrill('arrsplit:' + (i === selA ? '' : msA[i]) + ':' + (gi === null ? '' : gi)); }, true) });
      }
    } else if (key === 'new' || parts[0] === 'newm' || parts[0] === 'newlic') {
      var nw = list.filter(function (ch) {
        return !ch.newSwitch && ch.start <= w.to && (parts[0] === 'newm' ? K.monthOf(ch.start) === parts[1] : inWin(ch.start, w.from, w.to))
          && (parts[0] !== 'newlic' || String(ch.lic) === parts[1]);
      });
      title = 'Nieuwe abonnementen' + (parts[0] === 'newlic' ? ' — ' + D('lic', Number(parts[1])) : '') + monthTitle(parts[0] === 'newm' ? parts[1] : null);
      sub = 'ARR = bij de start.';
      why = [WHY.nieuw(), WHY.keten, WHY.arr].concat(parts[0] === 'newlic' ? ['Licentie = die van de eerste periode.'] : []);
      head.push('Nu', 'Waarom');
      rows = nw.map(function (ch) { return withMerk(ch, chainRow(ch, ch.start, [ch.end && ch.end <= w.to ? 'gestopt ' + K.dayLabel(ch.end) : 'lopend', startWhy(ch)])); });
    } else if (key === 'churn' || parts[0] === 'churnm' || parts[0] === 'churnr') {
      var lost = list.filter(function (ch) {
        return ch.end && !ch.endSwitch && ch.end <= w.to && (parts[0] === 'churnm' ? K.monthOf(ch.end) === parts[1] : inWin(ch.end, w.from, w.to))
          && (parts[0] !== 'churnr' || String(ch.reason) === parts[1]);
      });
      title = 'Verloren abonnementen' + (parts[0] === 'churnr' ? ' — ' + (Number(parts[1]) >= 0 ? D('reason', Number(parts[1])) : 'geen reden') : '') + monthTitle(parts[0] === 'churnm' ? parts[1] : null);
      why = [WHY.verloren(), WHY.keten, 'ARR = die van de laatste periode.'];
      head.push('Gestopt', 'Reden', 'Waarom');
      rows = lost.map(function (ch) { return withMerk(ch, chainRow(ch, ch.end, [K.dayLabel(ch.end), esc(ch.reason >= 0 ? D('reason', ch.reason) : '—'), endWhy(ch)])); });
    } else if (key === 'switch') {
      var sw = list.filter(function (ch) { return ch.end && ch.endSwitch && inWin(ch.end, w.from, w.to); });
      title = 'Wissels';
      why = [WHY.wissel(), WHY.keten];
      head.push('Gestopt', 'Reden', 'Waarom');
      rows = sw.map(function (ch) { return withMerk(ch, chainRow(ch, ch.end, [K.dayLabel(ch.end), esc(ch.reason >= 0 ? D('reason', ch.reason) : '—'), endWhy(ch)])); });
    } else if (key === 'renew' || parts[0] === 'renewm') {
      var rn = [];
      list.forEach(function (ch) {
        ch.p.forEach(function (p, k) {
          if (!k || p.s > w.to) return;
          if (parts[0] === 'renewm' ? K.monthOf(p.s) === parts[1] : inWin(p.s, w.from, w.to)) rn.push({ ch: ch, p: p, prev: ch.p[k - 1] });
        });
      });
      title = 'Verlengingen' + monthTitle(parts[0] === 'renewm' ? parts[1] : null);
      why = ['Verlenging = een nieuwe, bevestigde periode van een bestaand abonnement, geteld op de startdatum van die periode. Een verlengingsofferte telt pas als ze bevestigd is.',
        'Δ = de ARR van de nieuwe periode tegenover die van de vorige.', WHY.keten];
      head = ['Klant', 'Vorige periode', 'Nieuwe periode', 'Plan', 'Merk', 'ARR vorige', 'ARR nieuw', 'Δ ARR'];
      rows = rn.sort(function (a, b) { return a.p.s.localeCompare(b.p.s); }).map(function (x) {
        var nm = mrrAt(x.ch, x.p.s), dv = 12 * (nm - x.prev.m);
        return withMerk(x.ch, [esc(cust(x.ch).name), periodTxt(x.prev), periodTxt(x.p), esc(D('plan', x.ch.plan)), esc(D('merk', cust(x.ch).merk)),
          eur(12 * x.prev.m), eur(12 * nm), (dv >= 0 ? '+' : '−') + eur(Math.abs(dv))]);
      });
    } else if (parts[0] === 'renewout') {
      var o = renewalOutcomes(list, w.from, w.to), res = parts[1] || '';
      var LBL = { renewed: 'verlengd', churned: 'gestopt', switched: 'gewisseld', waiting: 'wacht op betaling', open: 'nog niet verlengd' };
      title = 'Afgelopen jaarperiodes' + (res ? ' — ' + LBL[res] : '');
      why = ['Jaarabonnementen (plan met "jaar" in de naam) waarvan een periode van 12 maanden afliep in de ' + PERIODS[st.period] + '. Vervaldag = start van die periode + 12 maanden.',
        'Verlengd = er volgt een bevestigde periode. Gestopt = het abonnement eindigde en de klant heeft geen ander. Gewisseld = het eindigde, maar de klant heeft binnen ' + W() + ' dagen een ander. '
          + 'Wacht op betaling = er staat een verlengingsofferte open. Nog niet verlengd = geen van die: geen volgende periode, geen offerte en niet stopgezet.',
        'Verlengingsgraad = verlengd ÷ (verlengd + gestopt).'];
      head = ['Klant', 'Periode', 'Vervaldag', 'Merk', 'ARR', 'Uitkomst', 'Waarom'];
      rows = o.rows.filter(function (r) { return !res || r.res === res; }).map(function (r) {
        var nxt = r.ch.p[r.ch.p.indexOf(r.p) + 1];
        var bewijs = r.res === 'renewed' ? 'Volgende periode ' + periodTxt(nxt)
          : r.res === 'waiting' ? 'Verlengingsofferte ' + K.odooLink('sale.order', r.ch.pend.o, r.ch.pend.n) + ' staat open'
          : r.res === 'open' ? 'Geen volgende periode, geen offerte en niet stopgezet'
          : endWhy(r.ch);
        return withMerk(r.ch, [esc(cust(r.ch).name), periodTxt(r.p), K.dayLabel(r.due), esc(D('merk', cust(r.ch).merk)), eur(12 * r.p.m), LBL[r.res], bewijs]);
      });
    } else if (key === 'pend') {
      var pd = activeAt(list, w.to).filter(function (ch) { return ch.pend; });
      title = 'Wachten op betaling';
      why = ['Lopend abonnement waarvoor een verlengingsofferte nog niet bevestigd is. Het telt als actief, tegen de prijs van het lopende contract.',
        'Dagen over = dagen sinds de vervaldag (de volgende factuurdatum van het lopende contract).'];
      head = ['Klant', 'Lopend contract', 'Offerte', 'Vervaldag', 'Dagen over', 'ARR nu', 'ARR offerte'];
      rows = pd.map(function (ch) {
        return withMerk(ch, [esc(cust(ch).name), periodTxt(periodAt(ch, w.to)), K.odooLink('sale.order', ch.pend.o, ch.pend.n), K.dayLabel(ch.pend.due), nf(ch.pend.overdue),
          eur(12 * mrrAt(ch, w.to)), eur(12 * ch.pend.m)]);
      });
    } else if (parts[0] === 'bridge') {
      var ms = chartMonths(w), br = bridgeData(list, ms), evs = [];
      br.forEach(function (r) {
        r.ev.forEach(function (e) {
          if (parts[1] === 'all' ? !inWin(e.d, w.from, w.to) : r.m !== parts[1]) return;
          if (!parts[2] || e.t === parts[2]) evs.push(e);
        });
      });
      var TL = { new: 'Nieuw', expand: 'Uitbreiding', switch: 'Wissel', contract: 'Verlaging', churn: 'Verloren' };
      title = (parts[2] ? TL[parts[2]] : 'Alle veranderingen') + (parts[1] !== 'all' ? monthTitle(parts[1]) : ' — ' + PERIODS[st.period]);
      sub = 'Verschil in ARR.';
      var tw = { new: [WHY.nieuw()], expand: [WHY.wijziging], contract: [WHY.wijziging], switch: [WHY.wissel()], churn: [WHY.verloren()] };
      why = parts[2] ? tw[parts[2]].concat([WHY.arr]) : [WHY.nieuw(), WHY.wijziging, WHY.wissel(), WHY.verloren(), WHY.arr];
      head = ['Klant', 'Order', 'Datum', 'Soort', 'Merk', 'Δ ARR', 'Waarom'];
      rows = evs.sort(function (a, b) { return a.d.localeCompare(b.d); }).map(function (e) {
        var p = e.p || periodAt(e.ch, e.d) || e.ch.p[e.ch.p.length - 1];
        var bewijs;
        if (e.up) bewijs = 'Upsell vanaf ' + K.dayLabel(e.d) + ' op ' + periodTxt(p);
        else if (e.renew) bewijs = 'Vorige periode ' + periodTxt(e.ch.p[e.ch.p.indexOf(e.p) - 1]) + ' → nieuwe ' + periodTxt(e.p);
        else if (e.t === 'churn' || (e.t === 'switch' && e.d === e.ch.end)) bewijs = endWhy(e.ch);
        else bewijs = startWhy(e.ch);
        return withMerk(e.ch, [esc(cust(e.ch).name), K.odooLink('sale.order', p.o, p.n), K.dayLabel(e.d), TL[e.t] + (e.up ? ' (upsell)' : e.renew ? ' (verlenging)' : ''),
          esc(D('merk', cust(e.ch).merk)), (e.v >= 0 ? '+' : '−') + eur(Math.abs(12 * e.v)), bewijs]);
      });
      if (!extra.chart) {
        var selB = parts[1] === 'all' ? -1 : ms.indexOf(parts[1]);
        var valB = function (r) { return parts[2] ? r[parts[2]] : BRIDGE.reduce(function (s, b) { return s + r[b[0]]; }, 0); };
        extra = Object.assign({}, extra, { keep: true, chart: monthChart(ms, br.map(function (r) { return isFuture(r.m) ? null : Math.round(valB(r)); }),
          parts[2] ? TL[parts[2]] : 'Netto', true, selB, function (i) { openDrill('bridge:' + (i === selB ? 'all' : ms[i]) + (parts[2] ? ':' + parts[2] : '')); }) });
      }
    } else if (key === 'trans' || parts[0] === 'trans' || parts[0] === 'transm') {
      var tr = parts[0] === 'transm'
        ? st.data.trans.filter(function (r) { var dd = basisDate(r); return dd && dd <= w.to && K.monthOf(dd) === parts[1] && custOk(st.data.customers[r[6]]); })
        : transRows(w.from, w.to).filter(function (r) { return parts[0] !== 'trans' || parts[1] === undefined || String(r[3]) === parts[1]; });
      title = 'Transactioneel' + (parts[0] === 'trans' && parts[1] !== undefined ? ' — ' + D('tg', Number(parts[1])) : '') + monthTitle(parts[0] === 'transm' ? parts[1] : null);
      why = ['Bevestigde verkooporders met een product zonder abonnement (credits, opstarthulp, import, ...).',
        'Datum = ' + esc(basisLabel()) + '. Gefactureerd en betaald gaan over de eerste geboekte factuur van die orderlijn.', 'Expert-uren = credits ÷ 3.'];
      head = ['Klant', 'Order', 'Product', 'Orderdatum', 'Factuur', 'Aantal', 'Bedrag'];
      rows = tr.sort(function (a, b) { return String(b[0]).localeCompare(String(a[0])); }).map(function (r) {
        return withMerk(st.data.customers[r[6]], [esc(st.data.customers[r[6]].name), K.odooLink('sale.order', r[7], '#' + r[7]), esc(D('tg', r[3])), K.dayLabel(r[0]), r[1] ? K.dayLabel(r[1]) + (r[2] ? ' · betaald' : ' · open') : 'nog niet gefactureerd', nf(r[4], 2), eur(r[5])]);
      });
    } else if (key === 'rev' || parts[0] === 'revm') {
      var rv = parts[0] === 'revm' ? st.data.revenue.filter(function (r) { return K.monthOf(r[0]) === parts[1] && r[0] <= w.to && custOk(st.data.customers[r[3]]); }) : revRows(w.from, w.to);
      title = 'Gefactureerde omzet' + monthTitle(parts[0] === 'revm' ? parts[1] : null);
      why = ['Geboekte klantfacturen en creditnota\'s (negatief), bedrag ex btw, op factuurdatum.',
        'Bron per factuurlijn: product met abonnement = Abonnementen, of Professionele abonnementen als de klant een professionele syndicus is; product zonder abonnement = Transactioneel; lijn zonder product = Overig. Eén factuur kan dus in meer bronnen staan.'];
      head = ['Klant', 'Factuur', 'Datum', 'Bron', 'Betaald', 'Bedrag'];
      rows = rv.sort(function (a, b) { return b[0].localeCompare(a[0]); }).map(function (r) {
        return withMerk(st.data.customers[r[3]], [esc(st.data.customers[r[3]].name), K.odooLink('account.move', r[4], r[6] || ('#' + r[4])), K.dayLabel(r[0]), esc(st.data.bron[r[1]]), r[5] ? 'ja' : 'nee', eur(r[2])]);
      });
    } else if (key === 'pro' || mOf('pro@')) {
      var pm = mOf('pro@'), d2 = pm ? endOf(pm) : w.to;
      var prosAll = st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg'); });
      var pros = prosAll.filter(function (ch) { return periodAt(ch, d2); }).sort(function (a, b) { return mrrAt(b, d2) - mrrAt(a, d2); });
      title = 'Professionele abonnementen' + (pm ? ' — eind ' + K.monthLabel(pm, true) : ' — vandaag');
      sub = 'Stand op ' + K.dayLabel(d2) + '.';
      why = ['Klanten met klanttype Professioneel Syndicus en een lopende periode op ' + K.dayLabel(d2) + '. Het segmentfilter geldt hier niet, de andere filters wel.',
        'Kavels = appartementen/kavels + commerciële units + huizen op de orderlijnen van die periode; bank en Peppol = de aantallen van die koppelingen.', WHY.arr];
      head = ['Professional', 'Periode', 'Klant sinds', 'Merk', 'MRR', 'ARR', 'Kavels', 'Bank', 'Peppol'];
      rows = pros.map(function (ch) {
        var p = periodAt(ch, d2), mm = mrrAt(ch, d2);
        return withMerk(ch, [esc(cust(ch).name), periodTxt(p), K.dayLabel(ch.start), esc(D('merk', cust(ch).merk)), eur(mm), eur(12 * mm), nf((p.k || 0) + (p.c || 0) + (p.h || 0)), nf(p.bank), nf(p.peppol)]);
      });
      if (extra.kavels) {
        // Uit de grafiek "kavels" in het tabblad: dezelfde maanden, het aantal kavels per maand.
        var msP = chartMonths(w), selP = pm ? msP.indexOf(pm) : -1;
        var kav = msP.map(function (m) { if (isFuture(m)) return null; var dd = endOf(m); return prosAll.reduce(function (s, ch) { var q = periodAt(ch, dd); return s + (q ? (q.k || 0) + (q.c || 0) + (q.h || 0) : 0); }, 0); });
        extra = Object.assign({}, extra, { keep: true, chart: monthChart(msP, kav, 'Kavels', false, selP, function (i) { openDrill(i === selP ? 'pro' : 'pro@' + msP[i], { kavels: true }); }, true) });
      }
    } else return;
    if (merkOn) { head.push('Merk volgens'); }
    why = why.concat(selectieWhy());
    if (merkOn) why.push(WHY.merk);
    why = why.filter(function (x, i) { return why.indexOf(x) === i; });
    var right = head.map(function (h, i) { return /ARR|MRR|Bedrag|Aantal|Dagen|Δ|Kavels|Bank|Peppol/.test(h) ? i : -1; }).filter(function (i) { return i >= 0; });
    K.drill(title, sub, head, rows, Object.assign({ right: right }, extra, { why: why }));
  }

  // ── Alles tekenen ─────────────────────────────────────────────────────────
  function sentence(list, w) {
    var act = activeAt(list, w.to), cs = {};
    act.forEach(function (ch) { cs[ch.c] = 1; });
    var seg = { vme: "VME's", pro: 'professionals', all: 'alle klanttypes' }[st.f.seg];
    return nf(act.length) + ' lopende abonnementen bij ' + nf(Object.keys(cs).length) + ' klanten (' + seg + '). Nieuw, verlengd en verloren over de ' + PERIODS[st.period]
      + ' (' + K.dayLabel(K.addDays(w.from, 1)) + ' t.e.m. ' + K.dayLabel(w.to) + ').';
  }
  function render() {
    if (!st.data) return;
    var w = win(), list = chains();
    renderFilters();
    $('slSentence').textContent = sentence(list, w);
    var ex = st.data.excluded || {};
    $('slExcluded').innerHTML = (ex.items || []).length
      ? 'Buiten de cijfers: ' + ex.items.map(function (e) { return '<span title="' + esc(e.reason) + '">' + esc(e.label || (e.kind + ' ' + e.record_id)) + (e.scope !== 'all' ? ' (' + esc(e.scope) + ')' : '') + '</span>'; }).join(', ')
        + (ex.subscriptions ? ' — ' + nf(ex.subscriptions) + ' lopend abonnement' + (ex.subscriptions === 1 ? '' : 'en') + ', ' + eur(12 * ex.mrr, true) + ' ARR' : '') + '.'
      : '';
    renderKpis(list, w);
    renderArr(list, w);
    renderBridge(list, w);
    renderNew(list, w);
    renderRenew(list, w);
    renderChurn(list, w);
    renderTrans(w);
    renderRev(w);
    renderPro(w);
    renderAttention();
    K.icons();
    save();
  }

  async function load(force) {
    if (st.loading) return;
    st.loading = true;
    $('slStatus').innerHTML = '<span class="loading loading-spinner loading-sm"></span>';
    try {
      var data = await K.loadSales(force);
      if (!data.configured) {
        $('slNotice').innerHTML = '<div class="alert alert-info">De verkoopdatabase (D1 om-sales) is nog niet gekoppeld of nog leeg. Na de deploy vult de eerste sync ze binnen een kwartier.</div>';
        $('slStatus').innerHTML = ''; st.loading = false; return;
      }
      st.data = data;
      try { await loadTargets(); } catch (err) { st.targets = null; }
      $('slStatus').innerHTML = K.freshness(data);
      $('slNotice').innerHTML = (data.settingsErrors || []).length ? '<div class="alert alert-warning text-sm">Instellingen konden niet gelezen worden: ' + esc(data.settingsErrors.join('; ')) + '. Er wordt niemand uitgesloten.</div>' : '';
      render();
    } catch (err) {
      $('slNotice').innerHTML = '<div class="alert alert-error">Kon de verkoopgegevens niet laden: ' + esc(err.message) + '</div>';
      $('slStatus').innerHTML = '';
    }
    st.loading = false;
  }
  async function loadTargets() {
    var t = st.data.meta.today, from = K.monthOf(K.addMonths(t, -24)), to = K.monthOf(K.addMonths(t, 12));
    var res = await K.api('/dashboards/api/sales/targets?from=' + from + '&to=' + to);
    st.targets = {};
    res.products.forEach(function (r) { (st.targets[r.metric] = st.targets[r.metric] || {})[r.month] = r.value; });
  }

  // ── Interactie ────────────────────────────────────────────────────────────
  root.addEventListener('click', async function (e) {
    var el = e.target.closest('[' + A + ']');
    if (!el || !st.data) return;
    var a = el.getAttribute(A), v = el.dataset.value;
    if (a === 'period') { st.period = v; render(); }
    else if (a === 'seg' || a === 'merk' || a === 'inv') { st.f[el.dataset.key] = v; render(); }
    else if (a === 'clear') { st.f[el.dataset.key] = DEFAULTS[el.dataset.key]; render(); }
    else if (a === 'reset') { st.f = Object.assign({}, DEFAULTS); render(); }
    else if (a === 'split') { st.split = v; renderArr(chains(), win()); save(); }
    else if (a === 'basis') { st.basis = v; render(); }
    else if (a === 'renewWin') { st.renewWin = Number(v); renderRenew(chains(), win()); K.icons(); }
    else if (a === 'drill') { openDrill(el.dataset.drill); }
    else if (a === 'planned-edit') {
      var pl = (st.data.planned || []).filter(function (x) { return String(x.id) === el.dataset.id; })[0], f = $('slPlannedForm');
      if (!pl || !f) return;
      var fe = f.elements;
      fe.pid.value = pl.id; fe.pname.value = pl.name; fe.pstart.value = pl.start.slice(0, 7); fe.pplots.value = pl.plots; fe.pmrr.value = pl.mrr; fe.pname.focus();
    } else if (a === 'planned-del') {
      if (!confirm('Deze geplande professional weghalen?')) return;
      try { await K.api('/dashboards/api/sales/planned/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' }); await load(true); } catch (err) { alert(err.message); }
    }
  });
  root.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[' + A + '="drill"]')) { e.preventDefault(); openDrill(e.target.dataset.drill); }
  });
  root.addEventListener('change', function (e) {
    var el = e.target.closest('[data-sl-select]');
    if (!el) return;
    st.f[el.getAttribute('data-sl-select')] = el.value;
    render();
  });
  root.addEventListener('submit', async function (e) {
    if (e.target.id !== 'slPlannedForm') return;
    e.preventDefault();
    var fe = e.target.elements;
    try {
      await K.api('/dashboards/api/sales/planned', { method: 'POST', body: JSON.stringify({
        id: fe.pid.value || undefined, name: fe.pname.value, start_month: fe.pstart.value + '-01', plots: fe.pplots.value, mrr: fe.pmrr.value
      }) });
      await load(true);
    } catch (err) { alert('Bewaren mislukt: ' + err.message); }
  });
  document.addEventListener('om:sales-reloaded', function () { if (st.data) load(false); });
  if (K.COMPACT && K.COMPACT.addEventListener) K.COMPACT.addEventListener('change', function () { if (st.data) render(); });

  // Laden zodra het tabblad zichtbaar wordt (dashboards-web.js wisselt de tabbladen).
  function visible() { return !root.classList.contains('hidden'); }
  new MutationObserver(function () { if (visible() && !st.data && !st.loading) load(false); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (visible()) load(false);
  window.OMSales = { reload: function () { return load(true); } };
})();
