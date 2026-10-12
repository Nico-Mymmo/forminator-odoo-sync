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

  // seg = klanttype (VME in advies / in beheer / professionele syndicus); free '0' = zonder gratis licenties.
  var DEFAULTS = { seg: 'all', pack: '', beg: '', free: '0', merk: '', lic: '', user: '', ch: '', org: '', syn: '', plots: '', expert: '' };
  var SEGS = { all: 'alle klanttypes', advies: "VME's in advies", beheer: "VME's in beheer", pro: 'professionele syndici' };
  var SEG_CT = { advies: 1, beheer: 3, pro: 2 };
  // YTD = sinds 1 januari (vergeleken met dezelfde dagen vorig jaar), LTM = de laatste 12 maanden.
  // Geen "Boekjaar" meer: dat was dubbelzinnig (welk jaar, en tot vandaag of het hele jaar?).
  var PERIODS = { '30d': 'laatste 30 dagen', '90d': 'laatste 90 dagen', ytd: 'dit jaar (YTD)', ltm: 'laatste 12 maanden (LTM)', '24m': 'laatste 24 maanden' };
  var PKORT = { '30d': '30 d', '90d': '90 d', ytd: 'YTD', ltm: 'LTM', '24m': '24 m' };
  var st = { data: null, loading: false, period: 'ltm', f: Object.assign({}, DEFAULTS), split: 'ct', measure: 'n', bridgeMeasure: 'arr', basis: 'order', renewWin: 30 };

  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) {
      var oud = { fy: 'ytd', '12m': 'ltm' }[saved.period];
      if (PERIODS[saved.period] || oud) st.period = oud || saved.period;
      if (saved.f) Object.keys(DEFAULTS).forEach(function (k) { if (saved.f[k] !== undefined) st.f[k] = saved.f[k]; });
      if (saved.split) st.split = saved.split;
      if (saved.measure) st.measure = saved.measure;
      if (saved.bridgeMeasure === 'n' || saved.bridgeMeasure === 'arr') st.bridgeMeasure = saved.bridgeMeasure;
      if (saved.basis) st.basis = saved.basis;
    }
    // Een oude bewaarde keuze ("vme") bestaat niet meer.
    if (!SEGS[st.f.seg]) st.f.seg = DEFAULTS.seg;
  } catch (_) { /* geen opslag */ }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ period: st.period, f: st.f, split: st.split, measure: st.measure, bridgeMeasure: st.bridgeMeasure, basis: st.basis })); } catch (_) { /* geen opslag */ }
  }

  // ── Het geraamte ──────────────────────────────────────────────────────────
  // Het geraamte (drie kolommen) en de kaarten komen uit dashboards-kit.js: EEN vorm voor
  // Verkoop, Targets en Aanvragen.
  function card(id, title, sub, extra) { return K.kaart(id, title, sub, extra); }
  root.innerHTML = K.geraamte({
    prefix: 'sl', titel: 'Verkoop', uitleg: 'Abonnementen, verlengingen, stopzettingen en omzet, rechtstreeks uit Odoo.',
    zinExtra: '<p id="slExcluded" class="text-xs text-base-content/50 empty:hidden"></p>',
    midden: ''
    +   card('slArr', 'Verloop', 'Op het einde van elke maand. Klik op een vlak voor wie erin zit en waarom.')
    +   card('slBridge', 'Wat veranderde', 'Per maand: nieuwe klanten, upsells, duurder en goedkoper verlengde abonnementen, wissels, overgangen naar facturatie via de expert en verloren klanten.')
    +   '<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">'
    +     card('slNew', 'Nieuwe abonnementen', 'Eerste contract van een klant (een wissel bij een bestaande klant telt niet als nieuw).')
    +     card('slRenew', 'Verlengingen', 'Jaarabonnementen waarvan de periode afliep: verlengd, gestopt of nog open.')
    +   '</div>'
    +   card('slChurn', 'Verloren', 'Abonnementen die stopten zonder dat de klant binnen de wisselperiode een ander abonnement had, en zonder dat hij naar facturatie via zijn expert ging.')
    +   card('slTrans', 'Transactionele inkomsten', 'Producten zonder abonnement (credits, opstarthulp, ...).')
    +   card('slRev', 'Gefactureerde omzet', 'Geboekte facturen min creditnota\'s, per bron, op factuurdatum.')
    +   card('slKav', 'Kavels en prijs per kavel', 'Per manier van factureren: hoeveel kavels lopen er, en wat brengt een kavel per maand op. Klik op een rij voor de abonnementen.')
    +   card('slPro', 'Professionele syndici', 'Lopende professionele abonnementen (maandelijks, per kavel), en wie gepland is maar nog niet in Odoo staat.')
    +   card('slAtt', 'Na te kijken', 'Wat de regels opvallend vonden. Niets hiervan wordt stil weggelaten: het telt mee zoals beschreven.')
  });

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

  /**
   * Het venster: van `from` (exclusief: de stand OP die dag is het vertrekpunt) t.e.m. `to`.
   * Vorige periode: bij YTD dezelfde dagen vorig jaar (1 jan t.e.m. vandaag min een jaar),
   * anders de even lange periode ervoor (LTM: de 12 maanden daarvoor).
   */
  function win() {
    var to = st.data.meta.today, from;
    if (st.period === '30d') from = K.addDays(to, -30);
    else if (st.period === '90d') from = K.addDays(to, -90);
    else if (st.period === 'ytd') from = (Number(to.slice(0, 4)) - 1) + '-12-31';
    else if (st.period === '24m') from = K.addMonths(to, -24);
    else from = K.addMonths(to, -12);
    if (st.period === 'ytd') return { from: from, to: to, prevFrom: K.addMonths(from, -12), prevTo: K.addMonths(to, -12) };
    var len = Math.round((Date.parse(to) - Date.parse(from)) / 86400e3);
    return { from: from, to: to, prevFrom: K.addDays(from, -len), prevTo: from };
  }
  /** "1 jan – 6 okt 2025": de vorige periode voluit, zodat je ziet of het een maand of een jaar is. */
  function bereik(a, b) {
    var la = K.dayLabel(a), lb = K.dayLabel(b);
    return (a.slice(0, 4) === b.slice(0, 4) ? la.replace(/ \d{4}$/, '') : la) + ' – ' + lb;
  }
  function inWin(d, a, b) { return d && d > a && d <= b; }
  /**
   * De maanden van ELKE grafiek en elk mini-verloop (en dus ook van het venster dat
   * een tegel opent). YTD = januari t.e.m. deze maand, maar minstens zes maanden (vroeg in
   * het jaar met de maanden ervoor als context, YTD als band); LTM en 24 m = die maanden;
   * 30 en 90 d = zes maanden als context, met de gekozen periode als band. Eerst had de
   * ARR-grafiek een eigen venster (altijd 12 maanden) en de rest "de periode, minstens
   * zes": bij Boekjaar begon de ene in okt '25 en de andere in mei '26.
   */
  function chartMonths(w) {
    var cm = K.monthOf(w.to);
    if (st.period === 'ytd') { var jan = cm.slice(0, 4) + '-01-01', zes = K.addMonths(cm, -5); return K.months(jan < zes ? jan : zes, cm); }
    if (st.period === '24m') return K.months(K.addMonths(cm, -23), cm);
    if (st.period === 'ltm') return K.months(K.addMonths(cm, -11), cm);
    return K.months(K.addMonths(cm, -5), cm);
  }
  function isFuture(m) { return m > K.monthOf(st.data.meta.today); }
  function bandPlugin(ms, w) {
    // Een band enkel als de grafiek VOOR de periode begint (30/90 d, en YTD vroeg in het jaar).
    var start = K.monthOf(K.addDays(w.from, 1));
    if (!(ms[0] < start)) return { id: 'slBand' };
    var a = Math.max(0, ms.indexOf(start));
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

  var CUST_KEYS = ['pack', 'beg', 'merk', 'ch', 'org', 'syn', 'plots', 'expert'];
  function custOk(c, skip) {
    var f = st.f;
    if (skip !== 'seg' && f.seg !== 'all' && c.ctId !== SEG_CT[f.seg]) return false;
    if (skip !== 'free' && f.free !== '' && String(c.free || 0) !== f.free) return false;
    for (var i = 0; i < CUST_KEYS.length; i++) {
      var k = CUST_KEYS[i];
      if (k !== skip && f[k] !== '' && String(c[k]) !== String(f[k])) return false;
    }
    return true;
  }
  function chainOk(ch, skip) {
    if (!alive(ch)) return false;
    if (!custOk(cust(ch), skip)) return false;
    var f = st.f;
    if (skip !== 'lic' && f.lic !== '' && String(ch.licNow) !== String(f.lic)) return false;
    if (skip !== 'user' && f.user !== '' && String(ch.user) !== String(f.user)) return false;
    return true;
  }
  function chains(skip) { return st.data.chains.filter(function (ch) { return chainOk(ch, skip); }); }

  function events(ch) {
    var ev = [{ d: ch.start, t: ch.newSwitch ? 'switch' : 'new', v: mrrAt(ch, ch.start), ch: ch }];
    ch.p.forEach(function (p, k) {
      // Een upsell is altijd 'upsell', ook als hij iets weghaalt (negatief, zelden).
      (p.u || []).forEach(function (u) { ev.push({ d: u[0], t: 'upsell', v: u[1], ch: ch, up: true }); });
      if (k > 0) {
        var dv = mrrAt(ch, p.s) - ch.p[k - 1].m;
        ev.push({ d: p.s, t: dv > 0.005 ? 'duurder' : dv < -0.005 ? 'goedkoper' : 'renew', v: dv, ch: ch, renew: true, p: p });
      }
    });
    if (ch.end) ev.push({ d: ch.end, t: ch.endSwitch ? 'switch' : ch.endVia ? 'expert' : 'churn', v: -ch.p[ch.p.length - 1].m, ch: ch });
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
  /** Knoppen uit een woordenlijst: enkel de waarden die bij een klant voorkomen (of nu gekozen zijn). */
  function dictPills(kind, rename) {
    var used = {};
    st.data.customers.forEach(function (c) { used[c[kind]] = 1; });
    return (st.data.dict[kind] || []).map(function (m, i) { return [String(i), rename[m] || m, m]; })
      .filter(function (o) { return used[Number(o[0])] || st.f[kind] === o[0]; });
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
  var CHIP = { seg: 'Klanttype', pack: 'Syndicoach-pakket', beg: 'Begeleiding', free: 'Licenties', merk: 'Merk (lead)', lic: 'Licentie', user: 'Verkoper', ch: 'Kanaal', org: 'Herkomst', syn: 'Huidig beheer', plots: 'Kavels', expert: 'Adviserend expert' };
  function chipValue(k) {
    var v = st.f[k];
    if (k === 'seg') return { advies: 'VME in advies', beheer: 'VME in beheer', pro: 'professionele syndici', all: 'alle' }[v];
    if (k === 'free') return { '0': 'zonder gratis', '1': 'enkel gratis', '': 'betalend en gratis' }[v];
    var kind = { lic: 'lic', user: 'user' }[k] || k;
    return D(kind, Number(v));
  }
  function renderFilters() {
    var active = Object.keys(DEFAULTS).filter(function (k) { return st.f[k] !== DEFAULTS[k]; });
    $('slFilters').innerHTML =
      '<div class="rounded-2xl bg-base-100 border border-base-content/10 shadow-sm p-4 space-y-3 lg:p-3">'
      + '<div>' + K.groupLabel('Periode', 'Waarover nieuw, verlengd, verloren en omzet geteld worden, en waarmee ze vergeleken worden (dat staat bij elk kerncijfer). ARR, actieve abonnementen en kavels zijn de stand op vandaag, vergeleken met de stand op de dag voor de periode.')
      + K.pills(A, 'period', null, [['30d', '30 d', 'De laatste 30 dagen, tegenover de 30 dagen ervoor'], ['90d', '90 d', 'De laatste 90 dagen, tegenover de 90 dagen ervoor'],
        ['ytd', 'YTD', 'Sinds 1 januari, tegenover dezelfde dagen vorig jaar'], ['ltm', 'LTM', 'De laatste 12 maanden, tegenover de 12 maanden ervoor'],
        ['24m', '24 m', 'De laatste 24 maanden, tegenover de 24 maanden ervoor']], st.period, true) + '</div>'
      + '<div>' + K.groupLabel('Klanttype', WHY.seg)
      + K.pills(A, 'seg', 'seg', [['all', 'Alle'], ['advies', 'Advies', 'VME in advies: beheert zelf, ondersteund door een expert'], ['beheer', 'Beheer', 'VME in beheer: een professionele syndicus beheert het gebouw'], ['pro', 'Prof.', 'Professionele syndici']], st.f.seg, true) + '</div>'
      + '<div>' + K.groupLabel('Syndicoach-pakket', WHY.pack)
      + K.pills(A, 'pack', 'pack', [['', 'Alle']].concat(dictPills('pack', { 'Geen pakket': 'Geen' })), st.f.pack, true) + '</div>'
      + '<div>' + K.groupLabel('Begeleiding', WHY.beg)
      + K.pills(A, 'beg', 'beg', [['', 'Alle']].concat(dictPills('beg', { 'Andere expert': 'Andere', 'Geen expert': 'Geen', 'Professionele syndicus': 'Pro' })), st.f.beg, true) + '</div>'
      + '<div>' + K.groupLabel('Merk (herkomst lead)', WHY.merk)
      + K.pills(A, 'merk', 'merk', [['', 'Alle']].concat((st.data.dict.merk || []).map(function (m, i) { return [String(i), m]; })), st.f.merk, true) + '</div>'
      + '<div>' + K.groupLabel('Licenties', WHY.free)
      + K.pills(A, 'free', 'free', [['0', 'Betalend'], ['1', 'Gratis'], ['', 'Alle']], st.f.free, true) + '</div>'
      + '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 pt-3 border-t border-base-content/10">'
      + K.select('data-sl-select', 'lic', 'Licentie', opts('lic', 'lic', countBy('lic', 'licNow')), st.f.lic, 'De licentie van de lopende periode.')
      + K.select('data-sl-select', 'user', 'Verkoper', opts('user', 'user', countBy('user', 'user')), st.f.user)
      + K.select('data-sl-select', 'ch', 'Kanaal (lead)', opts('ch', 'ch', countBy('ch')), st.f.ch, 'Zelfde indeling als het tabblad Aanvragen: merk-herkomst + kanaal van de lead.')
      + K.select('data-sl-select', 'org', 'Merk-herkomst (lead)', opts('org', 'org', countBy('org')), st.f.org)
      + K.select('data-sl-select', 'syn', 'Huidig beheer', opts('syn', 'syn', countBy('syn')), st.f.syn, 'Uit het actieblad van het gebouw, anders van de partner.')
      + K.select('data-sl-select', 'plots', 'Aantal kavels', opts('plots', 'plots', countBy('plots')), st.f.plots, 'Actieblad of partner, anders het aantal op de licentielijn.')
      + K.select('data-sl-select', 'expert', 'Adviserend expert', opts('expert', 'expert', countBy('expert')), st.f.expert, 'De expert op het gebouw in Odoo (x_studio_parent_expert).')
      + '</div>'
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
    var out = { renewed: 0, churned: 0, switched: 0, expert: 0, waiting: 0, open: 0, rows: [] };
    list.forEach(function (ch) {
      if (!isYearly(ch)) return;
      ch.p.forEach(function (p, k) {
        var due = K.addMonths(p.s, 12);
        if (!inWin(due, a, b) || due > st.data.meta.today) return;
        var res = k < ch.p.length - 1 ? 'renewed' : ch.end ? (ch.endSwitch ? 'switched' : ch.endVia ? 'expert' : 'churned') : ch.pend ? 'waiting' : 'open';
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
      pro: ms.map(function (m) { return isFuture(m) ? null : arrAt(pros, at(m)); }),
      kav: ms.map(function (m) { return isFuture(m) ? null : kavAt(list, at(m)).kav; })
    };
  }
  function kavOf(p) { return p ? (p.k || 0) + (p.c || 0) + (p.h || 0) : 0; }
  /** Kavels en licentie-MRR op een dag. Per kavel telt enkel wat kavels heeft (geen vaste prijs zoals Unlimited). */
  function kavAt(list, d) {
    var o = { kav: 0, lic: 0, kavLic: 0, zonder: 0 };
    list.forEach(function (ch) {
      var p = periodAt(ch, d); if (!p) return;
      var k = kavOf(p), lm = mrrAt(ch, d) * (p.lf === undefined ? 1 : p.lf);
      o.lic += lm;
      if (k > 0) { o.kav += k; o.kavLic += lm; } else o.zonder++;
    });
    o.perKav = o.kav ? o.kavLic / o.kav : null;
    return o;
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
    // Een STAND (ARR, actief, kavels) vergelijkt met de stand op de dag voor de periode;
    // een STROOM (nieuw, verlengd, omzet) met de vorige periode. Beide voluit, met datums.
    var sinds = 't.o.v. ' + K.dayLabel(w.from), vorige = 't.o.v. ' + bereik(K.addDays(w.prevFrom, 1), w.prevTo), pk = ' · ' + PKORT[st.period];
    $('slKpis').innerHTML = [
      tile({ label: 'ARR', value: eur(arr, true), delta: K.delta(arr, arrFrom, true, null, sinds), sub: 'was ' + eur(arrFrom, true), series: sp12.arr, drill: 'kpi:arr',
        help: 'Som van 12 × MRR van de lopende periode van elk actief abonnement, vandaag; vergeleken met de stand op ' + K.dayLabel(w.from) + '.' }),
      tile({ label: 'Actieve abonnementen', value: nf(act.length), delta: K.delta(act.length, actFrom.length, true, 'abs', sinds), sub: Object.keys(custN).length === act.length ? 'elk bij een andere klant' : 'bij ' + nf(Object.keys(custN).length) + ' klanten', series: sp12.act, drill: 'kpi:act' }),
      tile({ label: 'Gem. ARR per abonnement', value: eur(act.length ? arr / act.length : 0), delta: K.delta(act.length ? arr / act.length : 0, actFrom.length ? arrFrom / actFrom.length : null, true, null, sinds), series: sp12.arpa, drill: 'kpi:arpa',
        help: 'ARR / actieve abonnementen. Het oude dashboard toonde hier het gemiddelde over alle rijen van de sheet, ook upsells en verloren periodes.' }),
      (function () {
        var kn = kavAt(list, now), kf = kavAt(list, w.from);
        return tile({ label: 'Kavels', value: nf(kn.kav), delta: K.delta(kn.kav, kf.kav, true, 'abs', sinds),
          sub: kn.perKav === null ? 'geen abonnementen met kavels' : eur(kn.perKav) + ' per kavel per maand', series: sp12.kav, drill: 'kpi:kav', help: WHY.kav + ' ' + WHY.kavPrijs });
      })(),
      tile({ label: 'Nieuw' + pk, value: nf(s.newN), delta: K.delta(s.newN, sp.newN, true, 'abs', vorige), sub: eur(s.newArr, true) + ' ARR', series: sp12.nw, drill: 'kpi:nw' }),
      tile({ label: 'Verlengd' + pk, value: nf(s.renewN), delta: K.delta(s.renewN, sp.renewN, true, 'abs', vorige),
        sub: 'verlengingsgraad ' + K.pctTxt(s.rate) + (s.outcomes.waiting + s.outcomes.open ? ' · ' + nf(s.outcomes.waiting + s.outcomes.open) + ' nog open' : ''), series: sp12.renew, drill: 'kpi:renew',
        help: 'Verlengingsgraad = verlengd / (verlengd + gestopt), over de jaarperiodes die in deze periode afliepen. Wissels en overgangen naar facturatie via de expert tellen niet mee.' }),
      tile({ label: 'Verloren' + pk, value: nf(s.churnN), delta: K.delta(s.churnN, sp.churnN, false, 'abs', vorige), sub: eur(s.churnArr, true) + ' ARR · ' + K.pctTxt(churnPct) + ' van de ARR', series: sp12.churn, drill: 'kpi:churn',
        help: 'Churn = verloren ARR / ARR bij het begin van de periode.' }),
      tile({ label: 'Netto ARR-groei' + pk, value: (arr - arrFrom >= 0 ? '+' : '−') + eur(Math.abs(arr - arrFrom), true), delta: '', sub: K.pctTxt(arrFrom ? (arr - arrFrom) / arrFrom * 100 : null) + ' ' + sinds, series: sp12.net, drill: 'kpi:net' }),
      tile({ label: 'Wachten op betaling', value: nf(pend.length), sub: eur(arrAt(pend, now), true) + ' ARR, vandaag', series: sp12.pend, drill: 'kpi:pend',
        help: 'Lopend abonnement met een open verlengingsofferte. Telt mee als actief tegen de lopende prijs. Het verloop (per dag, laatste 90 dagen) komt uit de dagelijkse momentopname sinds 5 oktober 2026: Odoo bewaart het niet.' }),
      tile({ label: 'Transactioneel' + pk, value: eur(sumAmt(tr), true), delta: K.delta(sumAmt(tr), sumAmt(trPrev), true, null, vorige), sub: basisLabel(), series: sp12.trans, drill: 'kpi:trans' }),
      tile({ label: 'Gefactureerde omzet' + pk, value: eur(sumRev(rv), true), delta: K.delta(sumRev(rv), sumRev(rvPrev), true, null, vorige), sub: 'facturen min creditnota\'s', series: sp12.rev, drill: 'kpi:rev' }),
      tile({ label: 'Professionele ARR', value: eur(proArr, true), sub: nf(pros.length) + ' professionals · ' + nf(proK) + ' kavels, vandaag', series: sp12.pro, drill: 'kpi:pro',
        help: 'Alle lopende professionele abonnementen, los van het segment hierboven.' })
    ].join('');
  }

  // ── Grafieken en lijsten ──────────────────────────────────────────────────
  // Geen "Plan" (iedereen heeft een jaarplan) en geen "Totaal" (de legende toont er EEN door erop te klikken).
  var SPLITS = { ct: ['ct', 'Klanttype'], pack: ['pack', 'Pakket'], beg: ['beg', 'Begeleiding'], lic: ['licNow', 'Licentie'], ch: ['ch', 'Kanaal (lead)'] };
  // Een expert krijgt een eigen vlak vanaf zoveel lopende abonnementen; de rest staat samen.
  var BEG_MIN = 5;
  function splitValue(ch) {
    var s = SPLITS[st.split][0]; if (!s) return 'Totaal';
    if (s === 'licNow') return D('lic', ch.licNow);
    if (s === 'beg') {
      // Een professionele syndicus heeft geen adviserend expert: hij IS de expert. Apart,
      // zodat "Geen expert" enkel de VME's zonder expert toont (een fout in Odoo).
      if (D('beg', cust(ch).beg) === 'Professionele syndicus') return 'Professionele syndici';
      var ex = D('expert', cust(ch).expert);
      return ex === 'Geen' ? 'Geen expert' : (st.begBig && st.begBig[ex]) ? ex : 'Andere experts';
    }
    return D(s, cust(ch)[s]);
  }
  /**
   * Wat het verloop meet: EEN definitie per maat, gebruikt door de grafiek, de
   * vergelijking met een jaar eerder en het venster dat een klik opent. Links staat
   * altijd ARR, rechts `n` of `kav` (st.measure).
   */
  var MEASURES = {
    arr: { label: 'ARR', money: true, sub: 'Jaarlijks terugkerende omzet (12 × MRR) op het einde van elke maand.',
      at: function (l, d) { return Math.round(arrAt(l, d)); } },
    n: { label: 'Abonnementen', sub: 'Aantal lopende abonnementen op het einde van elke maand.',
      at: function (l, d) { return activeAt(l, d).length; } },
    kav: { label: 'Kavels', sub: 'Kavels in de lopende abonnementen op het einde van elke maand (appartementen/kavels + commerciële units + huizen). Een licentie met een vaste prijs heeft er geen.',
      at: function (l, d) { return kavAt(l, d).kav; } }
  };
  /**
   * "Kanaal (lead)" volgt het tabblad Aanvragen: per merk gegroepeerd in de volgorde
   * van BRAND_KEYS (lib/lead-kanalen.js, via meta.kanalen) en in de kleuren van
   * K.KANAAL_KLEUREN in dashboards-kit.js (blauw = Syndicoach, groen = OpenVME, grijs = de
   * rest). "Geen lead" staat achteraan, in lichtgrijs. Zonder meta.kanalen (een
   * oudere gecachete versie) wordt er op het voorvoegsel van het merk gegroepeerd.
   */
  function kanaalInfo(label) {
    var lijst = (st.data.meta && st.data.meta.kanalen) || [];
    for (var i = 0; i < lijst.length; i++) if (lijst[i].label === label) return { i: i, key: lijst[i].key };
    return null;
  }
  function kanaalRang(label) {
    var info = kanaalInfo(label);
    if (info) return info.i;
    if (label === 'Geen lead') return 1000;
    return /^Syndicoach/.test(label) ? 100 : /^OpenVME/.test(label) ? 200 : 300;
  }
  function hexAlpha(hex, a) {
    var n = parseInt(String(hex).slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function kanaalKleur(label, i) {
    var info = kanaalInfo(label);
    var hex = label === 'Geen lead' ? '#cbd5e1' : (info ? K.KANAAL_KLEUREN[info.key] : null);
    if (!hex) return i;
    return function (a) { return a === undefined ? hex : hexAlpha(hex, a); };
  }
  /**
   * Het verloop: TWEE grafieken naast elkaar met dezelfde opsplitsing en dezelfde
   * kleuren -- links altijd ARR, rechts abonnementen of kavels (st.measure). Eén
   * knoppenrij kiest de opsplitsing voor beide, en de legende eronder (st.arrHidden)
   * geldt ook voor beide: anders tonen ze elk een ander stuk.
   */
  function renderArr(list, w) {
    // Een bewaarde keuze die niet meer bestaat (ARR rechts, Plan, Totaal, Klanten) valt terug.
    if (st.measure !== 'n' && st.measure !== 'kav') st.measure = 'n';
    if (!SPLITS[st.split]) st.split = 'ct';
    // Begeleiding: welke experts een eigen vlak krijgen (genoeg lopende abonnementen in deze selectie).
    var perEx = {};
    activeAt(list, w.to).forEach(function (ch) {
      if (D('beg', cust(ch).beg) === 'Professionele syndicus') return;
      var ex = D('expert', cust(ch).expert); perEx[ex] = (perEx[ex] || 0) + 1;
    });
    st.begBig = {}; Object.keys(perEx).forEach(function (ex) { if (perEx[ex] >= BEG_MIN) st.begBig[ex] = 1; });
    var R = MEASURES[st.measure], ms = chartMonths(w), groups = {};
    $('slArrControls').innerHTML = K.pills(A, 'split', null, Object.keys(SPLITS).map(function (k) { return [k, SPLITS[k][1]]; }), st.split);
    $('slArrSub').textContent = 'Op het einde van elke maand, per ' + SPLITS[st.split][1].toLowerCase() + '. Klik op een vlak voor wie erin zit en waarom; klik in de legende om enkel die te tonen (in beide grafieken).';
    list.forEach(function (ch) { var v = splitValue(ch); (groups[v] = groups[v] || []).push(ch); });
    var keys = Object.keys(groups).sort(function (a, b) { return MEASURES.arr.at(groups[b], w.to) - MEASURES.arr.at(groups[a], w.to); });
    if (st.split === 'ch') keys.sort(function (a, b) { return kanaalRang(a) - kanaalRang(b) || a.localeCompare(b, 'nl'); });
    st.arrKeys = keys;
    st.arrColors = keys.map(function (k, i) { return st.split === 'ch' ? kanaalKleur(k, i) : i; });
    // Wat in de legende weggeklikt is, blijft weg zolang er nog iets zichtbaar overblijft.
    st.arrHidden = st.arrHidden || {};
    if (!keys.some(function (k) { return !st.arrHidden[k]; })) st.arrHidden = {};
    var kop = function (titel, rechts) { return '<div class="flex flex-wrap items-center justify-between gap-2 mb-2 min-h-[2rem]"><div class="text-sm font-medium">' + esc(titel) + '</div>' + (rechts || '') + '</div>'; };
    $('slArr').innerHTML = '<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">'
      + '<div class="min-w-0">' + kop('ARR') + '<div style="height:240px"><canvas id="slArrChart" aria-label="ARR per maand"></canvas></div></div>'
      + '<div class="min-w-0">' + kop(R.label, K.pills(A, 'measure', null, [['n', 'Abonnementen'], ['kav', 'Kavels']], st.measure))
      +   '<div style="height:240px"><canvas id="slArrChart2" aria-label="' + esc(R.label) + ' per maand"></canvas></div></div>'
      + '</div><div id="slArrLegend" class="flex flex-wrap justify-end gap-x-4 gap-y-1 mt-3"></div>';
    tekenVerloop('slArrChart', 'arr', MEASURES.arr, list, groups, keys, ms, w);
    tekenVerloop('slArrChart2', st.measure, R, list, groups, keys, ms, w);
    tekenLegende();
  }
  /** Een van de twee verloopgrafieken. `mk` gaat mee in de doorklik: het venster toont dezelfde maat. */
  function tekenVerloop(id, mk, M, list, groups, keys, ms, w) {
    var fmtM = function (v, short) { return M.money ? eur(v, short) : nf(v); };
    var at = function (m) { return m === K.monthOf(w.to) ? w.to : K.monthEnd(m); };
    var sets = keys.map(function (k, i) {
      // Gestapeld: de eerste vult tot de as, elke volgende tot de vorige.
      return K.area(k, ms.map(function (m) { return isFuture(m) ? null : M.at(groups[k], at(m)); }), st.arrColors[i],
        { stack: 'a', fill: i === 0 ? 'origin' : '-1', hidden: !!st.arrHidden[k] });
    });
    if (keys.length === 1) {
      // Zoals de trend in Webgedrag: de vergelijking in grijs, hier een jaar eerder.
      sets.push(K.refLine('Een jaar eerder', ms.map(function (m) { return M.at(list, K.addMonths(at(m), -12)); }), { stack: 'b', borderDash: [] }));
    }
    K.chart(id, {
      type: 'line', plugins: [bandPlugin(ms, w), K.bandHoverPlugin], data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: sets },
      options: K.baseOptions({ scales: { y: { stacked: true, ticks: { precision: 0, callback: function (v) { return fmtM(v, true); } } } },
        // De legende staat EEN keer onder de twee grafieken (tekenLegende).
        // De tooltip staat naast de maand (K: 'omZij'), niet over het vlak dat je aanwijst; dat vlak krijgt een pijltje.
        plugins: { legend: { display: false }, tooltip: { position: 'omZij', caretSize: 0, footerColor: 'rgba(255,255,255,0.75)', footerFont: { weight: 'normal', size: 11 }, callbacks: {
          label: function (c) { return (c.chart.$omBand === c.datasetIndex ? '▶ ' : '   ') + c.dataset.label + ': ' + fmtM(c.parsed.y); },
          labelTextColor: K.bandTooltip.labelTextColor, footer: K.bandTooltip.footer } } },
        onClick: function (evt, els, chart) {
          if (!els.length) return;
          var i = els[0].index;
          if (isFuture(ms[i])) return;
          // Hetzelfde vlak dat bij het aanwijzen oplichtte (K.bandAt); boven de stapel = alles.
          var b = keys.length > 1 ? K.bandAt(chart, evt.x, evt.y).band : -1;
          openDrill('arrsplit:' + ms[i] + ':' + (b >= 0 && b < keys.length ? b : '') + ':' + mk);
        },
        onHover: function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } })
    });
  }
  /**
   * De gedeelde legende. Een klik toont EERST enkel die groep, daarna zet je er andere
   * bij of af; valt de laatste weg, dan staat alles weer aan -- hetzelfde gedrag als
   * K.soloLegend, maar voor beide grafieken tegelijk.
   */
  function tekenLegende() {
    var el = $('slArrLegend'), keys = st.arrKeys || [];
    if (!el) return;
    var swatch = function (kleur) { return '<span class="inline-block w-3 h-0.5 rounded" style="background-color:' + esc(kleur) + '"></span>'; };
    el.innerHTML = keys.length === 1
      ? '<span class="inline-flex items-center gap-1.5 text-xs text-base-content/80">' + swatch(K.colorOf(st.arrColors[0])) + esc(keys[0]) + '</span>'
        + '<span class="inline-flex items-center gap-1.5 text-xs text-base-content/80">' + swatch(K.REF) + 'Een jaar eerder</span>'
      : keys.map(function (k, i) {
        var uit = !!st.arrHidden[k];
        return '<button type="button" class="inline-flex items-center gap-1.5 text-xs ' + (uit ? 'text-base-content/35 line-through' : 'text-base-content/80 hover:text-base-content') + '" '
          + A + '="arrlegend" data-value="' + esc(k) + '" aria-pressed="' + !uit + '">' + swatch(K.colorOf(st.arrColors[i])) + esc(k) + '</button>';
      }).join('');
  }
  function legendeKlik(k) {
    var keys = st.arrKeys || [], h = st.arrHidden || {};
    if (keys.every(function (x) { return !h[x]; })) { h = {}; keys.forEach(function (x) { if (x !== k) h[x] = 1; }); }
    else if (!h[k]) { h[k] = 1; if (keys.every(function (x) { return h[x]; })) h = {}; }
    else delete h[k];
    st.arrHidden = h;
    ['slArrChart', 'slArrChart2'].forEach(function (id) {
      var ch = window.Chart && window.Chart.getChart ? window.Chart.getChart(id) : null;
      if (!ch) return;
      ch.data.datasets.forEach(function (ds, i) { if (!ds.omRef) ch.setDatasetVisibility(i, !h[ds.label]); });
      ch.update();
    });
    tekenLegende();
  }

  // [soort, label, kleur]: kleur = CSS-variabele van het thema of een functie alpha -> kleur.
  // Upsell en "duurder verlengd" staan apart: een upsell voegt iets toe tijdens een
  // lopende periode; een duurdere verlenging kan meer kavels zijn, maar ook een korting
  // die afliep. Een verlenging aan dezelfde prijs staat hier niet in.
  var BRIDGE = [['new', 'Nieuw', '--su'], ['upsell', 'Upsell', function (a) { return K.C.good((a === undefined ? 1 : a) * 0.5); }],
    ['duurder', 'Duurder verlengd', '--in'], ['switch', 'Wissel', function (a) { return 'rgba(148,163,184,' + (a === undefined ? 1 : a) + ')'; }],
    ['goedkoper', 'Goedkoper verlengd', '--wa'], ['expert', 'Naar expert', '--s'], ['churn', 'Verloren', '--er']];
  /**
   * Aantallen in de brug: nieuw en duurder verlengd +1, goedkoper verlengd en verloren -1,
   * een upsell +1 (of -1 als hij iets weghaalt). Een wissel telt EEN keer, bij het nieuwe
   * abonnement: het einde van het oude is dezelfde wissel. Naar expert telt -1: het eigen
   * abonnement van de VME is weg (de klant niet; die zit nu bij haar expert).
   */
  function telt(e) {
    if (e.t === 'upsell') return e.v >= 0 ? 1 : -1;
    if (e.t === 'new' || e.t === 'duurder') return 1;
    if (e.t === 'goedkoper' || e.t === 'churn' || e.t === 'expert') return -1;
    return e.t === 'switch' && e.d === e.ch.start ? 1 : 0;
  }
  function bridgeData(list, ms) {
    var rows = ms.map(function (m) { var o = { m: m }; BRIDGE.forEach(function (b) { o[b[0]] = 0; o['#' + b[0]] = 0; }); o.ev = []; return o; });
    var idx = {}; ms.forEach(function (m, i) { idx[m] = i; });
    list.forEach(function (ch) {
      events(ch).forEach(function (e) {
        if (e.d > st.data.meta.today) return;
        var i = idx[K.monthOf(e.d)]; if (i === undefined || e.t === 'renew') return;
        rows[i][e.t] += 12 * e.v; rows[i]['#' + e.t] += telt(e); rows[i].ev.push(e);
      });
    });
    return rows;
  }
  /**
   * Wat veranderde: grafiek links, tabel rechts (de tabel neemt haar eigen breedte, de
   * grafiek de rest; bij 24 m blijft de grafiek bovenaan staan). In ARR of in aantallen
   * (st.bridgeMeasure). Een klik op een STUK van een staaf opent die soort in die maand,
   * een klik naast de staaf alles van die maand (K.bandAt kent ook staven).
   */
  function renderBridge(list, w) {
    var ms = chartMonths(w), rows = bridgeData(list, ms), cnt = st.bridgeMeasure === 'n', pre = cnt ? '#' : '';
    st.bridgeRows = rows;
    var fmt = function (v, short) { return cnt ? nf(v) : eur(v, short); };
    var teken = function (v) { return (v > 0 ? '+' : '−') + fmt(Math.abs(v)); };
    $('slBridgeControls').innerHTML = K.pills(A, 'bridgeMeasure', null, [['arr', 'ARR'], ['n', 'Aantallen']], cnt ? 'n' : 'arr');
    $('slBridgeSub').textContent = (cnt
      ? 'Per maand: hoeveel abonnementen er bijkwamen, een upsell kregen, duurder of goedkoper verlengd werden, wisselden, naar facturatie via de expert gingen of stopten. Een wissel telt één keer, in de maand van het nieuwe abonnement.'
      : 'Per maand: wat nieuwe klanten, upsells, duurder en goedkoper verlengde abonnementen, wissels, overgangen naar facturatie via de expert en verloren klanten aan ARR betekenden. Een verlenging aan dezelfde prijs staat er niet in.')
      + ' Klik op een stuk van een staaf voor die lijst, of naast de staaf voor alles van die maand.';
    $('slBridge').innerHTML = '<div class="grid grid-cols-1 gap-6 items-start xl:grid-cols-[minmax(0,1fr)_auto]">'
      + '<div class="min-w-0 xl:sticky xl:top-[calc(48px+1rem)]"><div style="height:280px"><canvas id="slBridgeChart" aria-label="Wat veranderde per maand"></canvas></div></div>'
      + '<div class="min-w-0 overflow-x-auto"><table data-om-sortable class="table table-xs whitespace-nowrap"><thead><tr><th>Maand</th>' + BRIDGE.map(function (b) { return '<th class="text-right">' + b[1] + '</th>'; }).join('') + '<th class="text-right">Netto</th></tr></thead><tbody>'
      + rows.filter(function (r) { return !isFuture(r.m); }).reverse().map(function (r) {
        var net = BRIDGE.reduce(function (s, b) { return s + r[pre + b[0]]; }, 0);
        return '<tr><td>' + K.monthLabel(r.m) + '</td>' + BRIDGE.map(function (b) {
          var v = r[pre + b[0]];
          return '<td class="text-right tabular-nums">' + ((cnt ? v !== 0 : Math.abs(v) >= 1) ? '<a class="link link-hover" ' + A + '="drill" data-drill="bridge:' + r.m + ':' + b[0] + '">' + teken(v) + '</a>' : '<span class="text-base-content/30">—</span>') + '</td>';
        }).join('') + '<td class="text-right tabular-nums font-medium ' + (net >= 0 ? 'text-success' : 'text-error') + '">' + (net === 0 ? '0' : teken(net)) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    K.chart('slBridgeChart', {
      type: 'bar', plugins: [bandPlugin(ms, w), K.bandHoverPlugin],
      data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: BRIDGE.map(function (b) {
        return K.bars(b[1], rows.map(function (r) { return isFuture(r.m) ? null : Math.round(r[pre + b[0]]); }), b[2], { stack: 's' });
      }) },
      options: K.baseOptions({
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: false, ticks: { precision: 0, callback: function (v) { return fmt(v, true); } } } },
        // Naast de maand (K: 'omZij'), niet over het stuk dat je aanwijst; dat krijgt een pijltje. Lege soorten weg.
        plugins: { legend: { onClick: K.soloLegend }, tooltip: { position: 'omZij', caretSize: 0, footerColor: 'rgba(255,255,255,0.75)', footerFont: { weight: 'normal', size: 11 },
          filter: function (it) { return it.parsed.y !== 0 && it.parsed.y !== null; },
          callbacks: {
            label: function (c) { return (c.chart.$omBand === c.datasetIndex ? '▶ ' : '   ') + c.dataset.label + ': ' + teken(c.parsed.y); },
            labelTextColor: K.bandTooltip.labelTextColor, footer: K.bandTooltip.footer } } },
        onClick: function (evt, els, chart) {
          var hit = K.bandAt(chart, evt.x, evt.y);
          if (hit.i < 0 || isFuture(ms[hit.i])) return;
          openDrill('bridge:' + ms[hit.i] + (hit.band >= 0 ? ':' + BRIDGE[hit.band][0] : ''));
        },
        onHover: function (evt, els, chart) { evt.native.target.style.cursor = K.bandAt(chart, evt.x, evt.y).i >= 0 ? 'pointer' : 'default'; }
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

  /** Lopende jaarabonnementen waarvan de jaarperiode afloopt binnen st.renewWin dagen. */
  function komendeVerlengingen(list, now) {
    var horizon = K.addDays(now, st.renewWin), up = [];
    activeAt(list, now).forEach(function (ch) {
      if (!isYearly(ch)) return;
      var p = periodAt(ch, now), due = K.addMonths(p.s, 12);
      if (due > now && due <= horizon) up.push({ ch: ch, p: p, due: due });
    });
    return up.sort(function (a, b) { return a.due.localeCompare(b.due); });
  }
  /** Naam met daaronder klanttype en expert: in een smalle kaart is dat leesbaarder dan twee kolommen. */
  function klantNaamCel(c) {
    return '<div>' + esc(c.name) + '</div><div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-base-content/60">' + K.ctBadge(D('ct', c.ct)) + '<span>' + K.expertCel(D('expert', c.expert)) + '</span></div>';
  }
  var RENEW_TOON = 10;
  function renderRenew(list, w) {
    var o = renewalOutcomes(list, w.from, w.to), now = w.to, up = komendeVerlengingen(list, now);
    $('slRenewControls').innerHTML = K.pills(A, 'renewWin', null, [[30, '30 d'], [60, '60 d'], [90, '90 d']], st.renewWin);
    var bar = function (n, label, cls, res) { return '<button type="button" class="flex-1 min-w-[5rem] rounded-lg ' + cls + ' p-2 text-left om-hover" ' + A + '="drill" data-drill="renewout:' + res + '"><div class="text-lg font-semibold">' + nf(n) + '</div><div class="text-[11px]">' + label + '</div></button>'; };
    $('slRenew').innerHTML = '<div class="flex flex-wrap gap-2">' + bar(o.renewed, 'verlengd', 'bg-success/15', 'renewed') + bar(o.churned, 'gestopt', 'bg-error/15', 'churned')
      + bar(o.switched, 'gewisseld', 'bg-base-200', 'switched') + (o.expert ? bar(o.expert, 'naar expert', 'bg-base-200', 'expert') : '') + bar(o.waiting, 'wachten op betaling', 'bg-warning/20', 'waiting') + bar(o.open, 'nog niet verlengd, geen offerte', 'bg-base-200', 'open') + '</div>'
      + '<p class="text-xs text-base-content/60 mt-2">Verlengingsgraad ' + K.pctTxt(o.renewed + o.churned ? o.renewed / (o.renewed + o.churned) * 100 : null) + ' over ' + nf(o.rows.length) + ' jaarperiodes die afliepen in de ' + PERIODS[st.period] + '. <a class="link" ' + A + '="drill" data-drill="renewout">Lijst</a></p>'
      + '<h3 class="text-sm font-semibold mt-4 mb-1">Te verlengen in de komende ' + st.renewWin + ' dagen</h3>'
      + (up.length ? '<table data-om-sortable class="table table-xs"><thead><tr><th>Klant</th><th>Vervalt</th><th class="text-right">ARR</th><th></th></tr></thead><tbody>'
        + up.slice(0, RENEW_TOON).map(function (r) {
          return '<tr><td>' + klantNaamCel(cust(r.ch)) + '</td><td class="whitespace-nowrap">' + K.dayLabel(r.due) + '</td><td class="text-right tabular-nums">' + eur(12 * mrrAt(r.ch, now)) + '</td><td class="whitespace-nowrap">'
            + (r.ch.pend ? '<span class="badge badge-warning badge-sm">offerte</span>' : '') + ' ' + K.odooLink('sale.order', r.p.o, r.p.n) + '</td></tr>';
        }).join('') + '</tbody></table>'
        + '<div class="flex flex-wrap items-center justify-between gap-2 mt-1"><p class="text-xs text-base-content/60">' + (up.length > RENEW_TOON ? 'De eerste ' + RENEW_TOON + ' van ' + nf(up.length) + '. ' : '')
        + 'Samen ' + eur(12 * up.reduce(function (s, r) { return s + mrrAt(r.ch, now); }, 0)) + ' ARR.</p>'
        + (up.length > RENEW_TOON ? '<button type="button" class="btn btn-xs btn-outline" ' + A + '="drill" data-drill="renewup">Meer zien (' + nf(up.length) + ')</button>' : '') + '</div>'
        : '<p class="text-sm text-base-content/60">Geen jaarabonnementen die in die periode vervallen.</p>');
  }

  function renderChurn(list, w) {
    var lost = list.filter(function (ch) { return ch.end && !ch.endSwitch && !ch.endVia && inWin(ch.end, w.from, w.to) && ch.end <= w.to; });
    var planned = list.filter(function (ch) { return ch.end && !ch.endSwitch && !ch.endVia && ch.end > w.to; });
    var switched = list.filter(function (ch) { return ch.end && ch.endSwitch && inWin(ch.end, w.from, w.to); });
    var viaExp = list.filter(function (ch) { return ch.end && ch.endVia && inWin(ch.end, w.from, w.to); });
    var byR = {};
    lost.forEach(function (ch) { var k = ch.reason; byR[k] = byR[k] || { n: 0, arr: 0 }; byR[k].n++; byR[k].arr += 12 * ch.p[ch.p.length - 1].m; });
    $('slChurn').innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div><table data-om-sortable class="table table-xs"><thead><tr><th>Reden</th><th class="text-right">Aantal</th><th class="text-right">ARR</th></tr></thead><tbody>'
      + Object.keys(byR).sort(function (a, b) { return byR[b].arr - byR[a].arr; }).map(function (k) {
        return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="churnr:' + k + '"><td>' + esc(Number(k) >= 0 ? D('reason', Number(k)) : 'Geen reden') + '</td><td class="text-right">' + nf(byR[k].n) + '</td><td class="text-right tabular-nums">' + eur(byR[k].arr) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Totaal</td><td class="text-right">' + nf(lost.length) + '</td><td class="text-right">' + eur(12 * lost.reduce(function (s, ch) { return s + ch.p[ch.p.length - 1].m; }, 0)) + '</td></tr></tfoot></table>'
      + '<p class="text-xs text-base-content/60 mt-2"><a class="link" ' + A + '="drill" data-drill="churn">Bekijk de ' + nf(lost.length) + ' abonnementen</a> · '
      + nf(switched.length) + ' wissels' + (viaExp.length ? ' en ' + nf(viaExp.length) + ' overgangen naar facturatie via de expert' : '') + ' in dezelfde periode tellen niet als verloren (<a class="link" ' + A + '="drill" data-drill="switch">'
      + (viaExp.length ? 'wissels</a>, <a class="link" ' + A + '="drill" data-drill="expert">naar expert</a>' : 'lijst</a>') + ').</p></div>'
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
      + '<p class="text-xs text-base-content/50 mt-2">Professionele abonnementen = abonnementsproducten van klanten met klanttype Professioneel Syndicus. Syndicoach (de pakketten Assistant, Captain en Coach) factureert nog niet in Odoo; die omzet komt er als eigen bron bij zodra dat wel zo is.</p>';
    K.chart('slRevChart', {
      type: 'bar', plugins: [bandPlugin(ms, w)], data: { labels: ms.map(function (m) { return K.monthLabel(m); }), datasets: sets },
      options: K.baseOptions({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: false, ticks: { callback: function (v) { return eur(v, true); } } } },
        plugins: { legend: { onClick: K.soloLegend }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + eur(c.parsed.y); } } } },
        onClick: function (evt, els) { if (els.length) openKpi('rev', els[0].index); } })
    });
  }

  var ROUTES = [['advies', 'VME in advies', 'eigen licentie (Basic, Smart, Unlimited, ...)'], ['beheer', 'VME in beheer, gefactureerd door OpenVME', 'eigen abonnement OpenVME Professional'],
    ['pro', 'Professionele syndici', 'alle kavels van hun gebouwen, eigen prijs'], ['onbekend', 'Zonder klanttype', '']];
  function routeOf(ch) { var t = cust(ch).ctId; return t === 1 ? 'advies' : t === 3 ? 'beheer' : t === 2 ? 'pro' : 'onbekend'; }
  /** Per expert: [id, naam, klantindex, gebouwen, via expert, kavels via, via zonder kavelaantal]. */
  function experts() { return (st.data.experts || []).filter(function (e) { return e[4] > 0; }); }
  /** Staat deze partner in de lijst test- en interne partners (op de naam gevonden)? */
  function isTest(id) { return (st.data.tests || []).some(function (t) { return t[0] === id && !t[4]; }); }
  var TEST_BADGE = ' <span class="badge badge-warning badge-sm" title="Op de naam gevonden als test- of interne partner: zie Na te kijken">test?</span>';
  function renderKav(w) {
    // Alle klanttypes naast elkaar (het klanttypefilter geldt hier niet, de andere filters wel).
    var list = chains('seg'), now = w.to;
    var rows = ROUTES.map(function (r) {
      var sub = list.filter(function (ch) { return routeOf(ch) === r[0]; }), k = kavAt(sub, now);
      return { r: r, n: activeAt(sub, now).length, k: k };
    }).filter(function (x) { return x.n > 0 || x.r[0] !== 'onbekend'; });
    var via = experts().reduce(function (s, e) { s.n += e[4]; s.k += e[5]; s.unk += e[6]; return s; }, { n: 0, k: 0, unk: 0 });
    var td = function (v, cls) { return '<td class="text-right tabular-nums ' + (cls || '') + '">' + v + '</td>'; };
    $('slKav').innerHTML = '<div class="overflow-x-auto"><table data-om-sortable class="table table-sm"><thead><tr><th>Wie</th><th class="text-right">Abonnementen</th><th class="text-right">Kavels</th>'
      + '<th class="text-right" title="Abonnementen met een vaste prijs, zonder kavelaantal">Zonder kavels</th><th class="text-right">Licentie-MRR</th><th class="text-right">Per kavel / maand</th></tr></thead><tbody>'
      + rows.map(function (x) {
        var on = st.f.seg === x.r[0];
        return '<tr class="cursor-pointer om-hover ' + (on ? 'bg-primary/5 font-medium' : '') + '" ' + A + '="drill" data-drill="kavr:' + x.r[0] + '"><td>' + esc(x.r[1])
          + (x.r[2] ? '<div class="text-[11px] text-base-content/50 font-normal">' + esc(x.r[2]) + '</div>' : '') + '</td>'
          + td(nf(x.n)) + td(nf(x.k.kav)) + td(x.k.zonder ? nf(x.k.zonder) : '—', 'text-base-content/60') + td(eur(x.k.lic)) + td(x.k.perKav === null ? '—' : eur(x.k.perKav), 'font-medium') + '</tr>';
      }).join('')
      + '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="via:all"><td>VME in beheer, gefactureerd door hun expert<div class="text-[11px] text-base-content/50">geen eigen abonnement; de kavels horen bij de professional hierboven</div></td>'
      + td(nf(via.n) + ' gebouwen', 'text-base-content/70') + td(nf(via.k), 'text-base-content/70') + td(via.unk ? nf(via.unk) + ' onbekend' : '—', 'text-base-content/60') + td('—') + td('—') + '</tr>'
      + '</tbody></table></div>'
      + '<p class="text-[11px] text-base-content/50 mt-2">' + esc(WHY.kavPrijs) + ' De laatste rij komt uit de gebouwen in Odoo ("Facturatie via expert"), los van de filters links: die gebouwen zijn geen klant van OpenVME.</p>';
  }

  function renderPro(w) {
    var now = w.to;
    var pros = st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg') && periodAt(ch, now); });
    pros.sort(function (a, b) { return mrrAt(b, now) - mrrAt(a, now); });
    var tot = { m: 0, k: 0, c: 0, h: 0, bank: 0, peppol: 0 };
    var expByCust = {}; experts().forEach(function (e) { if (e[2] >= 0) expByCust[e[2]] = e; });
    var running = {}; pros.forEach(function (ch) { running[ch.c] = 1; });
    // Experts die gebouwen via zich laten factureren, maar zelf geen lopend abonnement hebben.
    var zonder = experts().filter(function (e) { return e[2] < 0 || !running[e[2]]; }).sort(function (a, b) { return b[4] - a[4]; });
    var rows = pros.map(function (ch) {
      var p = periodAt(ch, now), m = mrrAt(ch, now);
      tot.m += m; tot.k += p.k || 0; tot.c += p.c || 0; tot.h += p.h || 0; tot.bank += p.bank || 0; tot.peppol += p.peppol || 0;
      var kv = kavOf(p), pk = kv ? m * (p.lf === undefined ? 1 : p.lf) / kv : null, e = expByCust[ch.c];
      // Factureert de professional minder kavels dan zijn gebouwen "via expert" volgens Odoo hebben?
      var minder = e && e[5] > kv;
      return '<tr><td>' + esc(cust(ch).name) + '</td><td>' + K.dayLabel(ch.start) + '</td><td class="text-right tabular-nums">' + eur(m) + '</td><td class="text-right tabular-nums">' + eur(12 * m)
        + '</td><td class="text-right">' + nf(p.k) + '</td><td class="text-right">' + nf(p.c) + '</td><td class="text-right">' + nf(p.h)
        + '</td><td class="text-right tabular-nums font-medium">' + (pk === null ? '—' : eur(pk)) + '</td><td class="text-right">' + nf(p.bank) + '</td><td class="text-right">' + nf(p.peppol)
        + '</td><td class="text-right">' + (e ? '<a class="link link-hover ' + (minder ? 'text-warning font-medium' : '') + '" ' + A + '="drill" data-drill="via:' + e[0] + '" title="'
          + esc(nf(e[4]) + ' gebouwen met "Facturatie via expert" en deze professional als expert, samen ' + nf(e[5]) + ' kavels volgens Odoo' + (e[6] ? ' (' + nf(e[6]) + ' zonder kavelaantal)' : '') + '. Het abonnement factureert er ' + nf(kv) + '.') + '">'
          + nf(e[4]) + ' · ' + nf(e[5]) + ' kv</a>' : '<span class="text-base-content/30">—</span>')
        + '</td><td>' + K.odooLink('sale.order', p.o, p.n) + '</td></tr>';
    });
    var ms = chartMonths(w);
    var at = function (m, f) { if (isFuture(m)) return null; var d = m === K.monthOf(now) ? now : K.monthEnd(m); return st.data.chains.filter(function (ch) { return alive(ch) && cust(ch).ctId === 2 && custOk(cust(ch), 'seg'); }).reduce(function (s, ch) { var p = periodAt(ch, d); return s + (p ? f(p) : 0); }, 0); };
    var planned = st.data.planned || [];
    $('slPro').innerHTML = '<div class="overflow-x-auto"><table data-om-sortable class="table table-xs"><thead><tr><th>Professional</th><th>Sinds</th><th class="text-right">MRR</th><th class="text-right">ARR</th><th class="text-right" title="Appartementen/kavels">Kavels</th><th class="text-right" title="Commerciële units">Comm.</th><th class="text-right">Huizen</th><th class="text-right" title="Licentie-MRR gedeeld door de kavels (bank en Peppol eraf)">Per kavel</th><th class="text-right">Bank</th><th class="text-right">Peppol</th>'
      + '<th class="text-right" title="Gebouwen met Facturatie via expert en deze professional als expert, en hun kavels volgens Odoo. Oranje = meer dan het abonnement factureert.">Via hen gefactureerd</th><th></th></tr></thead><tbody>'
      + (rows.join('') || '<tr><td colspan="12" class="text-base-content/60">Geen lopende professionele abonnementen in deze selectie.</td></tr>')
      + '</tbody><tfoot><tr><td>Totaal</td><td></td><td class="text-right">' + eur(tot.m) + '</td><td class="text-right">' + eur(12 * tot.m) + '</td><td class="text-right">' + nf(tot.k) + '</td><td class="text-right">' + nf(tot.c) + '</td><td class="text-right">' + nf(tot.h) + '</td><td></td><td class="text-right">' + nf(tot.bank) + '</td><td class="text-right">' + nf(tot.peppol) + '</td><td></td><td></td></tr></tfoot></table></div>'
      + (zonder.length ? '<h3 class="text-sm font-semibold mt-4 mb-1">Laten gebouwen via zich factureren, zonder lopend abonnement</h3>'
        + '<table data-om-sortable class="table table-xs"><thead><tr><th>Expert</th><th class="text-right">Gebouwen via hen</th><th class="text-right">Kavels (Odoo)</th></tr></thead><tbody>'
        + zonder.map(function (e) {
          return '<tr class="cursor-pointer om-hover" ' + A + '="drill" data-drill="via:' + e[0] + '"><td>' + esc(e[1]) + (isTest(e[0]) ? TEST_BADGE : '') + '</td><td class="text-right">' + nf(e[4]) + '</td><td class="text-right">' + nf(e[5]) + (e[6] ? ' <span class="text-base-content/50">(' + nf(e[6]) + ' onbekend)</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table><p class="text-[11px] text-base-content/50 mt-1">Hun gebouwen staan in Odoo op "Facturatie via expert", maar er loopt geen professioneel abonnement dat die kavels factureert. Gepland, een test, of iets dat ontbreekt?</p>' : '')
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
        + (a.drill ? '<div class="text-xs mt-1"><a class="link link-primary" ' + A + '="drill" data-drill="' + esc(a.drill) + '">Bekijk de volledige lijst</a></div>'
          : a.refs && a.refs.length ? '<div class="text-xs mt-1 flex flex-wrap gap-x-3">' + a.refs.map(function (r) { return K.odooLink(r.model, r.id, r.label); }).join('') + '</div>' : '') + '</div></div></li>';
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
    keten: 'Elke verlenging is in Odoo een nieuwe order. Al die orders samen zijn één abonnement. De klant is het bedrijf of de VME, ook als de order op een contactpersoon staat.',
    actief: function (d) { return 'In deze lijst staat elk abonnement dat op ' + K.dayLabel(d) + ' liep: een bevestigde order die toen al begonnen was en nog niet afgelopen.'; },
    offerte: 'Staat er een verlengingsofferte open, dan telt de vorige order nog, tegen de oude prijs, tot de offerte bevestigd is.',
    arr: 'ARR = de maandprijs (MRR) van die order × 12. Een upsell telt pas mee vanaf de dag dat hij ingaat.',
    nieuw: function () { return 'Nieuw = de eerste order van een abonnement, geteld op de dag dat ze begint. Uitzondering: had dezelfde klant in de ' + W() + ' dagen daarvoor nog een ander abonnement, dan is het een wissel (bijvoorbeeld naar een andere licentie) en geen nieuwe klant.'; },
    verloren: function () { return 'Verloren = het abonnement is gestopt en de klant nam binnen ' + W() + ' dagen geen ander abonnement. Gestopt op = de einddatum van de laatste order, of de volgende factuurdatum als die vroeger valt. De reden komt uit Odoo.'; },
    wissel: function () { return 'Wissel = een abonnement stopt of begint terwijl dezelfde klant binnen ' + W() + ' dagen een ander abonnement heeft (bijvoorbeeld een andere licentie). De klant is gebleven: dat telt niet als verloren en niet als nieuw.'; },
    expert: 'Naar expert = het laatste abonnement van een VME stopte, maar in Odoo staat nu "facturatie via expert" aan, met een expert, en haar status is nog Actief. Haar kavels worden voortaan door haar expert gefactureerd, in zijn eigen abonnement en tegen zijn prijs: geen verloren klant. Odoo bewaart niet wanneer dat vinkje aanging, dus dit volgt de stand van vandaag.',
    upsell: 'Upsell = in Odoo een order met status "Upsell": tijdens een lopende periode komt er iets bij een lopend abonnement (meer kavels, een extra product). Telt vanaf de dag dat hij ingaat. Een upsell die iets weghaalt (zelden) telt hier negatief.',
    duurder: 'Duurder verlengd = bij de verlenging kost de nieuwe order meer dan de vorige: meer kavels, een andere prijs, of een korting die afliep. Een verlenging aan dezelfde prijs staat hier niet in.',
    goedkoper: 'Goedkoper verlengd = bij de verlenging kost de nieuwe order minder dan de vorige: minder kavels, een lagere prijs of een nieuwe korting.',
    merk: 'Merk = via welk merk de klant binnenkwam. Dat komt uit één lead van de klant: de lead die tot zijn eerste contract leidde, anders zijn oudste gewonnen lead, anders zijn oudste lead. Syndicoach als die lead Syndicoach of Syndicuskiezen als herkomst heeft, via een Syndicoach-kanaal kwam, of "syndicoach" of "syndicus kiezen" in zijn naam of een label heeft. Anders OpenVME. Onbekend = de klant heeft geen enkele lead in Odoo.',
    lead: 'Kanaal en merk komen uit dezelfde lead.',
    ct: 'Klanttype = het veld "Company type" op de klant in Odoo. "VME in advies" heet daar kortweg "VME".',
    seg: 'VME in advies = de VME beheert zelf (eigenaar-syndicus), met hulp van een adviserend expert. VME in beheer = een professionele syndicus beheert het gebouw, soms Syndicoach zelf. Professionele syndicus = gebruikt het platform voor al zijn gebouwen en betaalt per kavel.',
    pack: 'Syndicoach-pakket = de dienst die Syndicoach aan het gebouw levert, naast de software: Assistant, Captain (Syndicoach is de syndicus) of Coach. Uit het veld "Syndicoach Pakket" in Odoo. Syndicoach factureert nog niet in Odoo: hier staat enkel het OpenVME-abonnement van die gebouwen.',
    beg: 'Begeleiding = de adviserend expert van het gebouw in Odoo: Syndicoach, een andere expert, of niemand. Een professionele syndicus staat apart: hij heeft geen adviserend expert, hij is zelf de expert van zijn gebouwen. "Geen expert" is dus een VME zonder expert, en dat is een fout in Odoo. In de grafiek krijgt een expert met minstens 5 lopende abonnementen een eigen kleur; de rest staat samen onder "Andere experts".',
    free: 'Gratis = in Odoo is "Niet gefactureerde klant" aangevinkt: interne gebruikers met een gratis licentie. Standaard tellen die niet mee.',
    kav: 'Kavels = appartementen of kavels + commerciële units + huizen op de licentie van de lopende order. Een licentie met een vaste prijs (Unlimited, early adopter) heeft geen kavels.',
    kavPrijs: 'Prijs per kavel = wat de klant per maand voor zijn licentie betaalt (zonder bank- en Peppol-koppelingen), gedeeld door zijn kavels. Een VME betaalt de standaardprijs (ongeveer € 4), een professionele syndicus vaak een eigen prijs (meestal € 1).',
    via: 'Facturatie via expert = in Odoo aangevinkt op het gebouw: de expert (een professionele syndicus) betaalt voor dit gebouw. Het gebouw heeft dan geen eigen abonnement; zijn kavels zitten in het abonnement van de expert.',
    lic: 'Licentie = het licentieproduct op de lopende order. Vandaag verkopen we Basic, Smart en Coached. Unlimited is uitgefaseerd. OpenVME Professional = een VME in beheer die via OpenVME betaalt; Professional = een professionele syndicus. Oudere licenties (early adopter, Solo/Team, All in, ...) staan samen onder "Legacy en overig".',
    ch: 'Kanaal = via welk kanaal de lead van de klant binnenkwam, ingedeeld zoals op het tabblad Aanvragen. "Geen lead" = de klant heeft geen lead in Odoo.'
  };
  /** De selectie waarbinnen de lijst geldt: segment, de filters links en wat altijd buiten valt. */
  function selectieWhy() {
    var bits = [SEGS[st.f.seg], st.f.free === '0' ? 'zonder gratis licenties' : st.f.free === '1' ? 'enkel gratis licenties' : 'betalend en gratis'];
    Object.keys(DEFAULTS).forEach(function (k) { if (k !== 'seg' && k !== 'free' && st.f[k] !== DEFAULTS[k]) bits.push(CHIP[k].toLowerCase() + ' ' + chipValue(k)); });
    var ex = (st.data.excluded || {}).items || [];
    var out = ['Je bekijkt: ' + esc(bits.join(', ')) + '.' + (ex.length ? ' Nooit meegeteld: ' + esc(ex.map(function (e) { return e.label || (e.kind + ' ' + e.record_id); }).join(', ')) + '.' : '')];
    if (st.f.merk !== '') out.push(WHY.merk);
    if (st.f.ch !== '' || st.f.org !== '') out.push(WHY.lead);
    if (st.f.seg !== 'all') out.push(WHY.seg);
    if (st.f.pack !== '') out.push(WHY.pack);
    if (st.f.beg !== '') out.push(WHY.beg);
    if (st.f.free !== '0') out.push(WHY.free);
    return out;
  }

  // Wat elke rij staaft, in ZINNEN: het staat achter het vraagteken en moet zonder
  // uitleg te lezen zijn. Elke zin een <p>; lege zinnen vallen weg.
  function zinnen() { return Array.prototype.slice.call(arguments).filter(Boolean).map(function (z) { return '<p>' + z + '</p>'; }).join(''); }
  function otherChains(ch) { return st.data.chains.filter(function (o) { return o !== ch && o.c === ch.c; }); }
  /** "van 1 jan 2026 tot 31 dec 2026" / "sinds 1 jan 2026, zonder einddatum". */
  function looptijd(s, e, open) { return e ? 'van ' + K.dayLabel(s) + ' tot ' + K.dayLabel(e) : 'sinds ' + K.dayLabel(s) + ', ' + (open || 'zonder einddatum'); }
  /** Een ander abonnement van dezelfde klant, in woorden. */
  function chainZin(o) { return 'abonnement ' + esc(o.p[o.p.length - 1].n) + ' (' + looptijd(o.start, o.end, 'loopt nog') + ')'; }
  function orderZin(p) { return 'order ' + esc(p.n) + ' (' + looptijd(p.s, p.e) + ')'; }
  /** Een periode als cel; main = de Odoo-knop van de rij wijst naar deze order. */
  function periodTxt(p, main) { return K.odooLink('sale.order', p.o, p.n, main) + ' ' + K.dayLabel(p.s) + ' → ' + (p.e ? K.dayLabel(p.e) : 'open'); }
  /** Waarom dit abonnement nieuw is, of een wissel. */
  function startWhy(ch) {
    var from = K.addDays(ch.start, -W()), oth = otherChains(ch);
    var prev = oth.filter(function (o) { return o.start < ch.start && (!o.end || o.end >= from); });
    if (prev.length) return zinnen('Telt als <strong>wissel</strong>, niet als nieuw: deze klant had in de ' + W() + ' dagen voor ' + K.dayLabel(ch.start) + ' nog een ander abonnement: ' + prev.map(chainZin).join(', ') + '.');
    var older = oth.filter(function (o) { return o.start < ch.start; });
    if (older.length) return zinnen('Telt als <strong>nieuw</strong>, begonnen op ' + K.dayLabel(ch.start) + '.',
      'De klant had vroeger al een abonnement (' + older.map(chainZin).join(', ') + '), maar dat stopte meer dan ' + W() + ' dagen voordien.');
    return zinnen('Telt als <strong>nieuw</strong>: het eerste abonnement van deze klant, begonnen op ' + K.dayLabel(ch.start) + '.');
  }
  /** Waarom deze stopzetting verloren is, of een wissel. */
  function endWhy(ch) {
    var last = ch.p[ch.p.length - 1], to = K.addDays(ch.end, W()), oth = otherChains(ch);
    var succ = oth.filter(function (o) { return o.start <= to && (!o.end || o.end > ch.end); });
    var kop = 'De laatste order (' + esc(last.n) + ') eindigde op ' + K.dayLabel(ch.end) + '.';
    if (ch.endVia) {
      var vi = ch.endVia, vl = vi[2];
      return zinnen(kop, 'Telt als <strong>naar expert</strong>, niet als verloren: in Odoo staat "facturatie via expert" aan op deze klant, met ' + esc(vi[1]) + ' als expert, en haar status is nog Actief. Haar kavels worden voortaan door de expert gefactureerd, in zijn eigen abonnement.',
        vl ? esc(vi[1]) + ' heeft abonnement ' + esc(vl[1]) + ', sinds ' + K.dayLabel(vl[3]) + ' (' + eur(12 * vl[2]) + ' ARR, voor al zijn gebouwen samen).'
          : esc(vi[1]) + ' heeft in Odoo geen lopend abonnement: kijk na hoe deze kavels gefactureerd worden.');
    }
    if (succ.length) return zinnen(kop, 'Telt als <strong>wissel</strong>, niet als verloren: de klant heeft binnen ' + W() + ' dagen een ander abonnement: ' + succ.map(chainZin).join(', ') + '.');
    var later = oth.filter(function (o) { return o.start > to; });
    return zinnen(kop, 'Telt als <strong>verloren</strong>: de klant nam binnen ' + W() + ' dagen geen ander abonnement.',
      later.length ? 'Later kwam hij wel terug: ' + later.map(chainZin).join(', ') + '.' : '');
  }
  var LEAD_HOW = ['de lead die tot zijn eerste contract leidde', 'zijn oudste gewonnen lead', 'zijn oudste lead'];
  /** Waarom deze klant bij dit merk staat: welke lead, hoe gekozen, welk signaal. */
  function merkWhy(c) {
    if (!c.lead) return zinnen(esc(D('mw', c.mw)));
    return zinnen('Gekozen lead: #' + c.lead + ', ' + (LEAD_HOW[c.lh] || 'een lead van de klant') + '.', esc(D('mw', c.mw)));
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
    pro: { label: 'Professionele ARR', type: 'line', money: true, all: 'pro', at: 'pro@', zero: false, stand: true },
    kav: { label: 'Kavels', type: 'line', all: 'kav', at: 'kav@', zero: false, stand: true }
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

  // Elke lijst zet klanttype (als badge: VME in advies / in beheer / professionele syndicus)
  // en expert vlak achter de klant: dat is het eerste wat je wil weten van een rij.
  function klantCel(c) { return [K.ctBadge(D('ct', c.ct)), K.expertCel(D('expert', c.expert))]; }
  var CH_HEAD = ['Klant', 'Klanttype', 'Expert', 'Order', 'Licentie', 'Pakket', 'Merk', 'Klant sinds', 'ARR'];
  function chainRow(ch, d, extra) {
    var p = periodAt(ch, d) || ch.p[ch.p.length - 1], c = cust(ch);
    return [esc(c.name)].concat(klantCel(c), [K.odooLink('sale.order', p.o, p.n), esc(D('lic', ch.licNow)), esc(D('pack', c.pack)), esc(D('merk', c.merk)), K.dayLabel(ch.start),
      eur(12 * (periodAt(ch, d) ? mrrAt(ch, d) : p.m))]).concat(extra || []);
  }
  function openDrill(key, extra) {
    var w = win(), list = chains(), parts = key.split(':');
    if (parts[0] === 'kpi') { openKpi(parts[1], null); return; }
    extra = extra || {};
    var rows, head = CH_HEAD.slice(), title, sub = '', why = [], merkOn = st.f.merk !== '';
    var mOf = function (prefix) { return key.indexOf(prefix) === 0 ? key.slice(prefix.length) : null; };
    var endOf = function (m) { var d = K.monthEnd(m); return d > w.to ? w.to : d; };
    var monthTitle = function (m) { return m ? ' — ' + K.monthLabel(m, true) : ''; };
    // "Waarom dit merk" (welke lead, welk signaal) staat erbij zodra het merk de lijst mee bepaalt; de kit zet het achter het vraagteken.
    var withMerk = function (x, cells) { return merkOn ? cells.concat([merkWhy(x && x.p ? cust(x) : x)]) : cells; };
    if (key === 'active' || mOf('active@') || parts[0] === 'arrsplit') {
      // arrsplit:<maand of leeg>:<groep of leeg> = een vlak van het ARR-verloop.
      var am = parts[0] === 'arrsplit' ? parts[1] : mOf('active@'), d = am ? endOf(am) : w.to;
      var gi = parts[0] === 'arrsplit' && parts[2] !== '' && parts[2] !== undefined ? Number(parts[2]) : null;
      var grp = gi === null ? null : (st.arrKeys || [])[gi];
      var src = grp === null || grp === undefined ? list : list.filter(function (ch) { return splitValue(ch) === grp; });
      var act = activeAt(src, d).sort(function (a, b) { return mrrAt(b, d) - mrrAt(a, d); });
      // Uit het verloop: de maat die daar gekozen is. Uit een tegel: altijd ARR.
      // arrsplit:<maand>:<groep>:<maat> -- de maat van de grafiek waarop geklikt werd.
      var M = parts[0] === 'arrsplit' ? (MEASURES[parts[3]] || MEASURES.arr) : MEASURES.arr, metKav = parts[0] === 'arrsplit' && parts[3] === 'kav';
      var klantenA = {}; act.forEach(function (ch) { klantenA[ch.c] = 1; });
      title = (grp ? M.label + ' · ' + SPLITS[st.split][1].toLowerCase() + ' ' + grp : parts[0] === 'arrsplit' ? M.label : 'Actieve abonnementen') + (am ? ' — eind ' + K.monthLabel(am, true) : ' — vandaag');
      sub = 'Stand op ' + K.dayLabel(d) + ': ' + nf(act.length) + ' abonnementen bij ' + nf(Object.keys(klantenA).length) + ' klanten'
        + (metKav ? ', ' + nf(kavAt(act, d).kav) + ' kavels' : parts[0] === 'arrsplit' ? ', ' + eur(arrAt(act, d)) + ' ARR' : '') + '.';
      why = [WHY.actief(d), WHY.offerte, WHY.arr, WHY.keten].concat(metKav ? [WHY.kav] : []);
      if (grp && WHY[st.split] && typeof WHY[st.split] === 'string') why.push(WHY[st.split]);
      if (grp && st.split === 'merk') merkOn = true;
      if (metKav) head.push('Kavels');
      head.push('Status', 'Waarom');
      rows = act.map(function (ch) {
        var p = periodAt(ch, d), stt = d !== w.to ? 'actief' : ch.pend ? 'wacht op betaling' : ch.paused ? 'gepauzeerd' : 'actief';
        var bewijs = zinnen('Telt mee: op ' + K.dayLabel(d) + ' liep ' + orderZin(p) + '.',
          'Maandprijs ' + eur(mrrAt(ch, d)) + ', dus ' + eur(12 * mrrAt(ch, d)) + ' ARR.',
          d === w.to && ch.pend ? 'Er staat een verlengingsofferte open (' + esc(ch.pend.n) + '). Tot die bevestigd is, telt deze order nog, tegen zijn huidige prijs.' : '');
        var cellen = (metKav ? [nf(kavOf(p))] : []).concat([stt === 'wacht op betaling' ? '<span class="badge badge-warning badge-sm">wacht op betaling</span>' : stt, bewijs]);
        return withMerk(ch, chainRow(ch, d, cellen));
      });
      if (parts[0] === 'arrsplit' && !extra.chart) {
        var msA = chartMonths(w), atA = function (m) { return m === K.monthOf(w.to) ? w.to : K.monthEnd(m); }, selA = am ? msA.indexOf(am) : -1;
        extra = Object.assign({}, extra, { keep: true, chart: Object.assign(monthChart(msA, msA.map(function (m) { return isFuture(m) ? null : M.at(src, atA(m)); }),
          M.label + (grp ? ' · ' + grp : ''), !!M.money, selA, function (i) { openDrill('arrsplit:' + (i === selA ? '' : msA[i]) + ':' + (gi === null ? '' : gi) + ':' + (parts[3] || 'arr')); }, true),
          // In de kleur van het vlak waarop je klikte.
          { color: gi === null ? null : (st.arrColors || [])[gi] }) });
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
        return ch.end && !ch.endSwitch && !ch.endVia && ch.end <= w.to && (parts[0] === 'churnm' ? K.monthOf(ch.end) === parts[1] : inWin(ch.end, w.from, w.to))
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
    } else if (key === 'expert') {
      var ve = list.filter(function (ch) { return ch.end && ch.endVia && inWin(ch.end, w.from, w.to); });
      title = 'Naar facturatie via de expert';
      why = [WHY.expert, WHY.via, WHY.keten];
      head.push('Gestopt', 'Reden', 'Waarom');
      rows = ve.map(function (ch) { return withMerk(ch, chainRow(ch, ch.end, [K.dayLabel(ch.end), esc(ch.reason >= 0 ? D('reason', ch.reason) : '—'), endWhy(ch)])); });
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
      head = ['Klant', 'Klanttype', 'Expert', 'Vorige periode', 'Nieuwe periode', 'Plan', 'Merk', 'ARR vorige', 'ARR nieuw', 'Δ ARR'];
      rows = rn.sort(function (a, b) { return a.p.s.localeCompare(b.p.s); }).map(function (x) {
        var nm = mrrAt(x.ch, x.p.s), dv = 12 * (nm - x.prev.m);
        return withMerk(x.ch, [esc(cust(x.ch).name)].concat(klantCel(cust(x.ch)), [periodTxt(x.prev), periodTxt(x.p, true), esc(D('plan', x.ch.plan)), esc(D('merk', cust(x.ch).merk)),
          eur(12 * x.prev.m), eur(12 * nm), (dv >= 0 ? '+' : '−') + eur(Math.abs(dv))]));
      });
    } else if (key === 'renewup') {
      var upAll = komendeVerlengingen(list, w.to);
      title = 'Te verlengen in de komende ' + st.renewWin + ' dagen';
      sub = nf(upAll.length) + ' jaarabonnementen, samen ' + eur(12 * upAll.reduce(function (s, r) { return s + mrrAt(r.ch, w.to); }, 0)) + ' ARR.';
      why = ['Lopende jaarabonnementen (plan met "jaar" in de naam) waarvan de jaarperiode afloopt tussen ' + K.dayLabel(w.to) + ' en ' + K.dayLabel(K.addDays(w.to, st.renewWin)) + '. Vervaldag = de start van de lopende periode + 12 maanden.', WHY.offerte];
      head = ['Klant', 'Klanttype', 'Expert', 'Vervalt', 'Order', 'Merk', 'ARR', 'Waarom'];
      rows = upAll.map(function (r) {
        return withMerk(r.ch, [esc(cust(r.ch).name)].concat(klantCel(cust(r.ch)), [K.dayLabel(r.due), K.odooLink('sale.order', r.p.o, r.p.n, true), esc(D('merk', cust(r.ch).merk)), eur(12 * mrrAt(r.ch, w.to)),
          zinnen('De lopende periode is ' + orderZin(r.p) + '; ze vervalt op ' + K.dayLabel(r.due) + ', 12 maanden na de start.',
            r.ch.pend ? 'Er staat al een verlengingsofferte open (' + esc(r.ch.pend.n) + ').' : 'Er staat nog geen verlengingsofferte.')]));
      });
    } else if (parts[0] === 'renewout') {
      var o = renewalOutcomes(list, w.from, w.to), res = parts[1] || '';
      var LBL = { renewed: 'verlengd', churned: 'gestopt', switched: 'gewisseld', expert: 'naar expert', waiting: 'wacht op betaling', open: 'nog niet verlengd' };
      title = 'Afgelopen jaarperiodes' + (res ? ' — ' + LBL[res] : '');
      why = ['Jaarabonnementen (plan met "jaar" in de naam) waarvan een periode van 12 maanden afliep in de ' + PERIODS[st.period] + '. Vervaldag = start van die periode + 12 maanden.',
        'Verlengd = er volgt een bevestigde periode. Gestopt = het abonnement eindigde en de klant heeft geen ander. Gewisseld = het eindigde, maar de klant heeft binnen ' + W() + ' dagen een ander. '
          + 'Naar expert = het eindigde, maar de klant wordt nu via zijn expert gefactureerd. '
          + 'Wacht op betaling = er staat een verlengingsofferte open. Nog niet verlengd = geen van die: geen volgende periode, geen offerte en niet stopgezet.',
        'Verlengingsgraad = verlengd ÷ (verlengd + gestopt).'];
      head = ['Klant', 'Klanttype', 'Expert', 'Periode', 'Vervaldag', 'Merk', 'ARR', 'Uitkomst', 'Waarom'];
      rows = o.rows.filter(function (r) { return !res || r.res === res; }).map(function (r) {
        var nxt = r.ch.p[r.ch.p.indexOf(r.p) + 1], kopR = 'De jaarperiode van ' + orderZin(r.p) + ' liep af op ' + K.dayLabel(r.due) + '.';
        var bewijs = r.res === 'renewed' ? zinnen(kopR, '<strong>Verlengd</strong>: de volgende order is ' + orderZin(nxt) + '.')
          : r.res === 'waiting' ? zinnen(kopR, '<strong>Wacht op betaling</strong>: verlengingsofferte ' + esc(r.ch.pend.n) + ' is nog niet bevestigd.')
          : r.res === 'open' ? zinnen(kopR, '<strong>Nog niet verlengd</strong>: er is geen volgende order en geen verlengingsofferte, en het abonnement is ook niet stopgezet.')
          : zinnen(kopR) + endWhy(r.ch);
        return withMerk(r.ch, [esc(cust(r.ch).name)].concat(klantCel(cust(r.ch)), [periodTxt(r.p), K.dayLabel(r.due), esc(D('merk', cust(r.ch).merk)), eur(12 * r.p.m), LBL[r.res], bewijs]));
      });
    } else if (key === 'pend') {
      var pd = activeAt(list, w.to).filter(function (ch) { return ch.pend; });
      title = 'Wachten op betaling';
      why = ['Lopend abonnement waarvoor een verlengingsofferte nog niet bevestigd is. Het telt als actief, tegen de prijs van het lopende contract.',
        'Dagen over = dagen sinds de vervaldag (de volgende factuurdatum van het lopende contract).'];
      head = ['Klant', 'Klanttype', 'Expert', 'Lopend contract', 'Offerte', 'Vervaldag', 'Dagen over', 'ARR nu', 'ARR offerte'];
      rows = pd.map(function (ch) {
        return withMerk(ch, [esc(cust(ch).name)].concat(klantCel(cust(ch)), [periodTxt(periodAt(ch, w.to)), K.odooLink('sale.order', ch.pend.o, ch.pend.n), K.dayLabel(ch.pend.due), nf(ch.pend.overdue),
          eur(12 * mrrAt(ch, w.to)), eur(12 * ch.pend.m)]));
      });
    } else if (parts[0] === 'bridge') {
      var ms = chartMonths(w), br = bridgeData(list, ms), evs = [];
      br.forEach(function (r) {
        r.ev.forEach(function (e) {
          if (parts[1] === 'all' ? !inWin(e.d, w.from, w.to) : r.m !== parts[1]) return;
          if (!parts[2] || e.t === parts[2]) evs.push(e);
        });
      });
      var TL = {}; BRIDGE.forEach(function (b) { TL[b[0]] = b[1]; });
      title = (parts[2] ? TL[parts[2]] : 'Alle veranderingen') + (parts[1] !== 'all' ? monthTitle(parts[1]) : ' — ' + PERIODS[st.period]);
      sub = 'Verschil in ARR.';
      var tw = { new: [WHY.nieuw()], upsell: [WHY.upsell], duurder: [WHY.duurder], goedkoper: [WHY.goedkoper], switch: [WHY.wissel()], expert: [WHY.expert], churn: [WHY.verloren()] };
      why = parts[2] && tw[parts[2]] ? tw[parts[2]].concat([WHY.arr]) : [WHY.nieuw(), WHY.upsell, WHY.duurder, WHY.goedkoper, WHY.wissel(), WHY.expert, WHY.verloren(), WHY.arr];
      head = ['Klant', 'Klanttype', 'Expert', 'Order', 'Datum', 'Soort', 'Merk', 'Δ ARR', 'Waarom'];
      rows = evs.sort(function (a, b) { return a.d.localeCompare(b.d); }).map(function (e) {
        var p = e.p || periodAt(e.ch, e.d) || e.ch.p[e.ch.p.length - 1];
        var bewijs;
        if (e.up) bewijs = zinnen('<strong>Upsell</strong>: op ' + K.dayLabel(e.d) + ' ging een upsell in op ' + orderZin(p) + '.', 'De ARR ' + (e.v >= 0 ? 'stijgt' : 'daalt') + ' daardoor met ' + eur(Math.abs(12 * e.v)) + '.');
        else if (e.renew) {
          var vp = e.ch.p[e.ch.p.indexOf(e.p) - 1];
          bewijs = zinnen('<strong>' + (e.v >= 0 ? 'Duurder' : 'Goedkoper') + ' verlengd</strong>: de nieuwe order kost ' + (e.v >= 0 ? 'meer' : 'minder') + ' dan de vorige.', vp ? 'Vorige: ' + orderZin(vp) + '.' : '', 'Nieuwe: ' + orderZin(e.p) + '.',
            'Verschil: ' + (e.v >= 0 ? '+' : '−') + eur(Math.abs(12 * e.v)) + ' ARR.');
        }
        else if (e.t === 'churn' || e.t === 'expert' || (e.t === 'switch' && e.d === e.ch.end)) bewijs = endWhy(e.ch);
        else bewijs = startWhy(e.ch);
        return withMerk(e.ch, [esc(cust(e.ch).name)].concat(klantCel(cust(e.ch)), [K.odooLink('sale.order', p.o, p.n), K.dayLabel(e.d), TL[e.t],
          esc(D('merk', cust(e.ch).merk)), (e.v >= 0 ? '+' : '−') + eur(Math.abs(12 * e.v)), bewijs]));
      });
      if (!extra.chart) {
        var selB = parts[1] === 'all' ? -1 : ms.indexOf(parts[1]);
        var preB = st.bridgeMeasure === 'n' ? '#' : '';
        var valB = function (r) { return parts[2] ? r[preB + parts[2]] : BRIDGE.reduce(function (s, b) { return s + r[preB + b[0]]; }, 0); };
        extra = Object.assign({}, extra, { keep: true, chart: Object.assign(monthChart(ms, br.map(function (r) { return isFuture(r.m) ? null : Math.round(valB(r)); }),
          (parts[2] ? TL[parts[2]] : 'Netto') + (preB ? ' (aantal)' : ''), !preB, selB, function (i) { openDrill('bridge:' + (i === selB ? 'all' : ms[i]) + (parts[2] ? ':' + parts[2] : '')); }),
          // In de kleur van die soort in "Wat veranderde".
          { color: parts[2] ? (BRIDGE.filter(function (b) { return b[0] === parts[2]; })[0] || [])[2] : null }) });
      }
    } else if (key === 'trans' || parts[0] === 'trans' || parts[0] === 'transm') {
      var tr = parts[0] === 'transm'
        ? st.data.trans.filter(function (r) { var dd = basisDate(r); return dd && dd <= w.to && K.monthOf(dd) === parts[1] && custOk(st.data.customers[r[6]]); })
        : transRows(w.from, w.to).filter(function (r) { return parts[0] !== 'trans' || parts[1] === undefined || String(r[3]) === parts[1]; });
      title = 'Transactioneel' + (parts[0] === 'trans' && parts[1] !== undefined ? ' — ' + D('tg', Number(parts[1])) : '') + monthTitle(parts[0] === 'transm' ? parts[1] : null);
      why = ['Bevestigde verkooporders met een product zonder abonnement (credits, opstarthulp, import, ...).',
        'Datum = ' + esc(basisLabel()) + '. Gefactureerd en betaald gaan over de eerste geboekte factuur van die orderlijn.', 'Expert-uren = credits ÷ 3.'];
      head = ['Klant', 'Klanttype', 'Expert', 'Order', 'Product', 'Orderdatum', 'Factuur', 'Aantal', 'Bedrag'];
      rows = tr.sort(function (a, b) { return String(b[0]).localeCompare(String(a[0])); }).map(function (r) {
        return withMerk(st.data.customers[r[6]], [esc(st.data.customers[r[6]].name)].concat(klantCel(st.data.customers[r[6]])).concat([K.odooLink('sale.order', r[7], '#' + r[7]), esc(D('tg', r[3])), K.dayLabel(r[0]), r[1] ? K.dayLabel(r[1]) + (r[2] ? ' · betaald' : ' · open') : 'nog niet gefactureerd', nf(r[4], 2), eur(r[5])]));
      });
    } else if (key === 'rev' || parts[0] === 'revm') {
      var rv = parts[0] === 'revm' ? st.data.revenue.filter(function (r) { return K.monthOf(r[0]) === parts[1] && r[0] <= w.to && custOk(st.data.customers[r[3]]); }) : revRows(w.from, w.to);
      title = 'Gefactureerde omzet' + monthTitle(parts[0] === 'revm' ? parts[1] : null);
      why = ['Geboekte klantfacturen en creditnota\'s (negatief), bedrag ex btw, op factuurdatum.',
        'Bron per factuurlijn: product met abonnement = Abonnementen, of Professionele abonnementen als de klant een professionele syndicus is; product zonder abonnement = Transactioneel; lijn zonder product = Overig. Eén factuur kan dus in meer bronnen staan.'];
      head = ['Klant', 'Klanttype', 'Expert', 'Factuur', 'Datum', 'Bron', 'Betaald', 'Bedrag'];
      rows = rv.sort(function (a, b) { return b[0].localeCompare(a[0]); }).map(function (r) {
        return withMerk(st.data.customers[r[3]], [esc(st.data.customers[r[3]].name)].concat(klantCel(st.data.customers[r[3]]), [K.odooLink('account.move', r[4], r[6] || ('#' + r[4])), K.dayLabel(r[0]), esc(st.data.bron[r[1]]), r[5] ? 'ja' : 'nee', eur(r[2])]));
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
    } else if (key === 'kav' || mOf('kav@') || parts[0] === 'kavr') {
      // kav@<maand> = de stand op het einde van die maand; kavr:<route> = een rij van de kaart Kavels.
      var km = mOf('kav@'), dk = km ? endOf(km) : w.to, route = parts[0] === 'kavr' ? parts[1] : null;
      var srcK = route ? chains('seg').filter(function (ch) { return routeOf(ch) === route; }) : list;
      var actK = activeAt(srcK, dk).sort(function (a, b) { return kavOf(periodAt(b, dk)) - kavOf(periodAt(a, dk)); });
      title = route ? 'Kavels · ' + ROUTES.filter(function (r) { return r[0] === route; })[0][1] : 'Kavels' + (km ? ' — eind ' + K.monthLabel(km, true) : ' — vandaag');
      sub = 'Stand op ' + K.dayLabel(dk) + '.';
      why = [WHY.actief(dk), WHY.kav, WHY.kavPrijs, WHY.seg];
      head = ['Klant', 'Klanttype', 'Expert', 'Order', 'Licentie', 'Pakket', 'Kavels', 'MRR', 'Licentie-MRR', 'Per kavel / maand', 'Waarom'];
      rows = actK.map(function (ch) {
        var p = periodAt(ch, dk), kv = kavOf(p), mm = mrrAt(ch, dk), lf = p.lf === undefined ? 1 : p.lf, c2 = cust(ch);
        var delen = [p.k ? nf(p.k) + ' appartementen/kavels' : '', p.c ? nf(p.c) + ' commerciële units' : '', p.h ? nf(p.h) + ' huizen' : ''].filter(Boolean);
        var koppel = [p.bank ? nf(p.bank) + (p.bank === 1 ? ' bankkoppeling' : ' bankkoppelingen') : '', p.peppol ? nf(p.peppol) + (p.peppol === 1 ? ' Peppol-koppeling' : ' Peppol-koppelingen') : ''].filter(Boolean);
        var bewijs = zinnen(
          delen.length ? 'Op de licentie van ' + orderZin(p) + ': ' + delen.join(' + ') + (delen.length > 1 ? ' = ' + nf(kv) + ' kavels' : '') + '.'
            : 'Geen kavels op de licentie van ' + orderZin(p) + ': die heeft een vaste prijs.',
          koppel.length ? 'Van de maandprijs ' + eur(mm) + ' is ' + eur(mm * lf) + ' voor de licentie; de rest is voor ' + koppel.join(' en ') + '.' : 'De volledige maandprijs (' + eur(mm) + ') is voor de licentie.',
          kv ? 'Per kavel: ' + eur(mm * lf) + ' ÷ ' + nf(kv) + ' = ' + eur(mm * lf / kv) + ' per maand.' : '');
        return withMerk(ch, [esc(c2.name)].concat(klantCel(c2), [K.odooLink('sale.order', p.o, p.n), esc(D('lic', ch.licNow)), esc(D('pack', c2.pack)), nf(kv), eur(mm), eur(mm * lf),
          kv ? eur(mm * lf / kv) : '—', bewijs]));
      });
      if (route) {
        extra = Object.assign({}, extra, { keep: true, chart: (function () {
          var msR = chartMonths(w), atR = function (m) { return m === K.monthOf(w.to) ? w.to : K.monthEnd(m); };
          return monthChart(msR, msR.map(function (m) { return isFuture(m) ? null : kavAt(srcK, atR(m)).kav; }), 'Kavels', false, -1, null, true);
        })() });
      }
    } else if (key === 'tests') {
      // Om op te ruimen in Odoo: per partner wat eraan hangt. Telt gewoon mee in de cijfers.
      var tests = st.data.tests || [], tName = {};
      tests.forEach(function (t) { tName[t[0]] = t[1]; });
      var CTN = { 1: 'VME in advies', 3: 'VME in beheer', 2: 'Professionele syndicus', 0: 'geen klanttype' };
      var eigenT = tests.filter(function (t) { return !t[4]; }).length;
      title = 'Test- en interne partners';
      sub = nf(eigenT) + ' op de naam gevonden, ' + nf(tests.length - eigenT) + ' gebouwen die eraan hangen.';
      why = ['Gevonden op de NAAM van het bedrijf in Odoo: een woord dat begint met test, demo, dummy, proef of fictief, of een naam die met "Mymmo" begint. Een suggestie, geen regel: kijk elk record na.',
        'Daaronder ook de gebouwen die zo\'n partner als adviserend expert of als bovenliggend bedrijf hebben, ook als hun eigen naam er niet op lijkt.',
        'Ze tellen gewoon mee in de cijfers tot ze in Odoo opgeruimd zijn: archiveren, of "Niet gefactureerde klant" aanvinken. Na de volgende synchronisatie zijn ze hier weg.'];
      head = ['Partner', 'Klanttype', 'Hoort bij', 'Gebouwen eraan', 'Waarvan via expert', 'Leads', 'Lopend abonnement', 'Waarom'];
      // Elke partner gevolgd door de gebouwen die eraan hangen.
      var volgorde = [];
      tests.filter(function (t) { return !t[4]; }).sort(function (a, b) { return (b[5] + b[7]) - (a[5] + a[7]) || a[1].localeCompare(b[1]); }).forEach(function (t) {
        volgorde.push(t);
        tests.filter(function (k) { return k[4] === t[0]; }).forEach(function (k) { volgorde.push(k); });
      });
      rows = volgorde.map(function (t) {
        var reden = t[3] === 'naam' ? zinnen('De naam "' + esc(t[1]) + '" lijkt op een test- of interne partner.', 'Dat is een suggestie op de naam: kijk het record na in Odoo.')
          : zinnen('Hangt aan testpartner ' + esc(tName[t[4]] || '#' + t[4]) + ': die is zijn ' + (t[3] === 'expert' ? 'adviserend expert' : 'bovenliggend bedrijf') + '.');
        return [K.odooLink('res.partner', t[0], t[1]), K.ctBadge(CTN[t[2]] || '#' + t[2]), t[4] ? esc(tName[t[4]] || '#' + t[4]) : '—',
          t[5] ? nf(t[5]) : '—', t[6] ? nf(t[6]) : '—', t[7] ? nf(t[7]) : '—',
          t[8] ? K.odooLink('sale.order', t[8][0], t[8][1]) + ' · ' + eur(12 * t[8][2]) + ' ARR' : '—', reden];
      });
      K.drill(title, sub, head, rows, Object.assign({ right: [3, 4, 5] }, extra, { why: why }));
      return;
    } else if (parts[0] === 'via') {
      var exId = parts[1] === 'all' ? null : Number(parts[1]);
      var exName = {}; (st.data.experts || []).forEach(function (e) { exName[e[0]] = e[1]; });
      var custById = {}; st.data.customers.forEach(function (cc, i) { custById[cc.id] = i; });
      var eigen = {}; st.data.chains.forEach(function (ch) { if (!ch.end) eigen[ch.c] = periodAt(ch, w.to) || ch.p[ch.p.length - 1]; });
      var vb = (st.data.viaBuildings || []).filter(function (b) { return exId === null || b[0] === exId; });
      title = 'Gefactureerd via de expert' + (exId === null ? '' : ' — ' + (exName[exId] || '#' + exId));
      sub = nf(vb.length) + ' gebouwen, samen ' + nf(vb.reduce(function (s, b) { return s + b[3]; }, 0)) + ' kavels volgens Odoo.';
      why = [WHY.via, 'Kavels volgens Odoo = het aantal kavels op het gebouw, anders het aantal appartementen. "—" = niet ingevuld in Odoo.',
        'Los van de filters links: deze gebouwen zijn geen klant van OpenVME, hun expert is dat.'];
      head = ['Gebouw', 'Expert', 'Kavels (Odoo)', 'Eigen abonnement', 'Waarom'];
      rows = vb.sort(function (a, b) { return b[3] - a[3]; }).map(function (b) {
        var ci = custById[b[1]], own = ci === undefined ? null : eigen[ci];
        return [K.odooLink('res.partner', b[1], b[2]) + (isTest(b[1]) ? TEST_BADGE : ''), esc(exName[b[0]] || '#' + b[0]) + (isTest(b[0]) ? TEST_BADGE : ''), b[3] ? nf(b[3]) : '—',
          own ? '<span class="text-warning font-medium">ja</span> ' + K.odooLink('sale.order', own.o, own.n) : 'nee',
          zinnen('In Odoo staat "Facturatie via expert" aangevinkt, met ' + esc(exName[b[0]] || '#' + b[0]) + ' als adviserend expert: die betaalt voor dit gebouw.',
            own ? '<strong>Let op</strong>: dit gebouw heeft toch ook een eigen lopend abonnement (' + esc(own.n) + '). Wordt het dubbel aangerekend, of staat het vinkje verkeerd?' : '')];
      });
      K.drill(title, sub, head, rows, Object.assign({ right: [2] }, extra, { why: why }));
      return;
    } else return;
    if (merkOn) { head.push('Waarom dit merk'); }
    why = why.concat(selectieWhy());
    if (merkOn) why.push(WHY.merk);
    why = why.filter(function (x, i) { return why.indexOf(x) === i; });
    var right = head.map(function (h, i) { return /ARR|MRR|Bedrag|Aantal|Dagen|Δ|Kavels|Bank|Peppol|Per kavel/.test(h) ? i : -1; }).filter(function (i) { return i >= 0; });
    K.drill(title, sub, head, rows, Object.assign({ right: right }, extra, { why: why }));
  }

  // ── Alles tekenen ─────────────────────────────────────────────────────────
  function sentence(list, w) {
    var act = activeAt(list, w.to), cs = {};
    act.forEach(function (ch) { cs[ch.c] = 1; });
    var seg = SEGS[st.f.seg] + (st.f.free === '0' ? ', zonder gratis licenties' : '');
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
    renderKav(w);
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
    else if (a === 'seg' || a === 'merk' || a === 'pack' || a === 'beg' || a === 'free') { st.f[el.dataset.key] = v; render(); }
    else if (a === 'clear') { st.f[el.dataset.key] = DEFAULTS[el.dataset.key]; render(); }
    else if (a === 'reset') { st.f = Object.assign({}, DEFAULTS); render(); }
    else if (a === 'split') { st.split = v; st.arrHidden = {}; renderArr(chains(), win()); save(); }
    else if (a === 'arrlegend') { legendeKlik(v); }
    else if (a === 'measure') { st.measure = v; renderArr(chains(), win()); save(); }
    else if (a === 'basis') { st.basis = v; render(); }
    else if (a === 'bridgeMeasure') { st.bridgeMeasure = v; renderBridge(chains(), win()); save(); }
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
