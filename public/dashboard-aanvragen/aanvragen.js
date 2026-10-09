/**
 * Dashboards — tabblad "Aanvragen": van aanvraag tot actief gebouw.
 *
 * TERREIN VAN DAVID. Lees eerst het regelboek:
 * src/modules/dashboards/lib/aanvragen/CLAUDE.md. Kort: het geraamte (drie
 * kolommen), de filterknoppen, de kerncijfers, de kleuren en het venster "wat zit
 * hierachter" komen uit public/dashboards-kit.js (window.OMDash). Hier staat enkel
 * WAT er in die kolommen komt. De controle: node scripts/vangrails/aanvragen.mjs
 *
 * Data: GET /dashboards/api/aanvragen (src/modules/dashboards/lib/aanvragen/index.js).
 * Targets: GET /dashboards/api/targets en POST /dashboards/api/targets/batch --
 * dezelfde tabel als het tabblad Targets (metric leads_instroom, per merk).
 */
(function () {
  'use strict';
  var K = window.OMDash;
  var root = document.querySelector('[data-dash-panel="instroom"]');
  if (!K || !root) return;
  var esc = K.esc, nf = K.nf, $ = K.$;
  var A = 'data-av-action';
  var P = 'av';
  var STORE = 'dashboards.aanvragen.v1';

  // De granulariteit hoort bij de periode en wordt op de server bepaald
  // (PERIOD_GRANULARITY in lib/aanvragen/instroom.js).
  var PERIODES = [
    ['30d', '30 d', 'De laatste 30 dagen, per dag, tegenover de 30 dagen ervoor'],
    ['3m', '3 m', 'De laatste 3 maanden, per week, tegenover de 3 maanden ervoor'],
    ['6m', '6 m', 'De laatste 6 maanden, per week, tegenover de 6 maanden ervoor'],
    ['12m', '12 m', 'De laatste 12 maanden, per maand, tegenover de 12 maanden ervoor']
  ];
  var PERIODE_TEKST = { '30d': 'de laatste 30 dagen', '3m': 'de laatste 3 maanden', '6m': 'de laatste 6 maanden', '12m': 'de laatste 12 maanden' };
  var MERKEN = [
    ['all', 'Alle', 'Alle aanvragen'],
    ['syndicoach', 'Syndicoach', 'Merk-herkomst Syndicoach of Syndicus kiezen'],
    ['openvme', 'OpenVME', 'Merk-herkomst OpenVME, of een directe registratie (zelfstarters)'],
    ['onbekend', 'Onbekend', 'Geen gekend merk: in de praktijk vrijwel altijd manueel aangemaakt']
  ];
  var MERK_TEKST = { all: 'alle merken', syndicoach: 'Syndicoach', openvme: 'OpenVME', onbekend: 'een onbekend merk' };
  var EENHEID = { day: 'dag', week: 'week', month: 'maand' };
  // De legende onder de grafiek: drie kolommen, een per merk. Een kanaal hoort bij de
  // kolom van zijn merk; alles zonder merkvoorvoegsel (manueel) staat onder "Andere".
  var GROEPEN = [
    { key: 'syndicoach', label: 'Syndicoach', hoort: function (k) { return k.indexOf('syndicoach') === 0; } },
    { key: 'openvme', label: 'OpenVME', hoort: function (k) { return k.indexOf('openvme') === 0; } },
    { key: 'andere', label: 'Andere', hoort: function (k) { return k.indexOf('syndicoach') !== 0 && k.indexOf('openvme') !== 0; } }
  ];

  // verborgen: kanalen die in de legende uitgezet zijn. Blijft staan bij een andere
  // periode of een ander merk, anders moet je na elke klik opnieuw filteren.
  var st = { period: '30d', scope: 'all', data: null, bezig: false, verborgen: {}, grafiek: null };
  try {
    var bewaard = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (bewaard) {
      if (PERIODE_TEKST[bewaard.period]) st.period = bewaard.period;
      if (MERK_TEKST[bewaard.scope]) st.scope = bewaard.scope;
    }
  } catch (_) { /* geen opslag */ }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ period: st.period, scope: st.scope })); } catch (_) { /* geen opslag */ } }

  // ── Het geraamte ──────────────────────────────────────────────────────────
  var TARGETS_VENSTER =
    '<dialog id="avTargetsVenster" class="modal">'
    + '<div class="modal-box max-w-3xl">'
    +   '<h3 class="font-bold text-lg mb-1">Aanvraagtargets <span class="text-base-content/50 font-normal" id="avTargetsMerk"></span></h3>'
    +   '<p class="text-sm text-base-content/60 mb-4">Een target per kalendermaand, per merk. Voorbije en komende maanden zijn instelbaar; de realisatie toont enkel een percentage voor maanden met een target. '
    +   'Het tabblad Targets kan ze ook zetten, vanuit de benodigde MQL\'s. Wijzig wat je nodig hebt en druk een keer op Opslaan. Een leeg vak verandert niets.</p>'
    +   '<div id="avTargetsRijen" class="grid grid-cols-2 sm:grid-cols-4 gap-3"></div>'
    +   '<div class="modal-action">'
    +     '<span id="avTargetsStatus" class="text-sm text-base-content/60 self-center"></span>'
    +     '<form method="dialog"><button class="btn">Sluiten</button></form>'
    +     '<button type="button" class="btn btn-primary" ' + A + '="targets-bewaar">Opslaan</button>'
    +   '</div></div>'
    + '<form method="dialog" class="modal-backdrop"><button>Sluiten</button></form>'
    + '</dialog>';

  root.innerHTML = K.geraamte({
    prefix: P,
    titel: 'Aanvragen',
    uitleg: 'Van aanvraag tot actief gebouw: de aanvragen die als lead in Odoo binnenkomen, per merk en kanaal, tegenover de target.',
    midden: K.kaart('avKanalen', 'Aanvragen per dag', 'Per kanaal, gestapeld. Klik in de legende op een kanaal om het uit of aan te zetten, of op een merk voor de hele kolom.')
      + K.kaart('avTarget', 'Realisatie tegen target', 'Altijd per maand van 30 dagen, eindigend op vandaag: een target per dag of per week schommelt te veel om iets te zeggen.',
        '<button type="button" class="btn btn-sm" ' + A + '="targets-open"><i data-lucide="settings" class="w-3.5 h-3.5"></i> Targets instellen</button>'),
    vensters: TARGETS_VENSTER
  });

  // ── Hulpjes ───────────────────────────────────────────────────────────────
  /** '2026-09-09 14:02:11' (UTC, uit Odoo) -> '2026-09-09' */
  function dag(odooTijd) { return odooTijd ? odooTijd.slice(0, 10) : ''; }
  /** "10 aug – 9 sep 2026": voluit, zodat je ziet over welke dagen het gaat. */
  function bereik(van, tot) {
    var a = K.dayLabel(van);
    if (van.slice(0, 4) === tot.slice(0, 4)) a = a.slice(0, a.lastIndexOf(' '));
    return a + ' – ' + K.dayLabel(tot);
  }
  /** "+14 boven target" / "−9 onder target" */
  function verschil(totaal, target) {
    var d = totaal - target;
    if (d === 0) return 'precies op target';
    return (d > 0 ? '+' : '−') + nf(Math.abs(d)) + (d > 0 ? ' boven target' : ' onder target');
  }
  /** Tooltip-titel uit het vak zelf ("Week 36 (1 sep – 7 sep)"), niet uit het korte aslabel. */
  function titelVan(vakken) {
    return function (items) { var v = items[0] && vakken[items[0].dataIndex]; return v ? v.title : ''; };
  }
  /** Rood < 80%, oranje 80-100%, groen >= 100%: dezelfde drempels als het tabblad Targets. */
  function kleurVoor(p, alpha) { return p === null || p === undefined ? K.C.muted(alpha) : p >= 100 ? K.C.good(alpha) : p >= 80 ? K.C.warn(alpha) : K.C.bad(alpha); }
  /** "Syndicoach 12 (60%) · OpenVME 8 (40%)": de drie merkgroepen, zonder de lege. */
  function perMerk(d) {
    var tel = { Syndicoach: 0, OpenVME: 0, Overig: 0 }, totaal = d.totals.current.count;
    Object.keys(d.brandLabels).forEach(function (k) {
      tel[k.indexOf('syndicoach') === 0 ? 'Syndicoach' : k.indexOf('openvme') === 0 ? 'OpenVME' : 'Overig'] += d.totals.current.byBrand[k] || 0;
    });
    return Object.keys(tel).filter(function (m) { return tel[m] > 0; }).map(function (m) {
      return esc(m) + ' ' + nf(tel[m]) + (totaal ? ' (' + K.pctTxt(tel[m] / totaal * 100, 0) + ')' : '');
    }).join(' · ');
  }

  // ── Links: je bekijkt + filters ───────────────────────────────────────────
  function renderFilters() {
    K.filters(P, [
      '<div>' + K.groupLabel('Periode', 'Waarover de aanvragen geteld worden, en waarmee ze vergeleken worden (de even lange periode ervoor). De grafiek volgt: 30 dagen per dag, 3 en 6 maanden per week, 12 maanden per maand.')
        + K.pills(A, 'period', null, PERIODES, st.period, true) + '</div>',
      '<div>' + K.groupLabel('Merk', 'Merk-herkomst van de lead (x_studio_brand_origin). De target volgt het merk: elk merk heeft een eigen target.')
        + K.pills(A, 'scope', null, MERKEN, st.scope, true) + '</div>'
    ]);
  }
  function renderZin(d) {
    K.zin(P, 'Aanvragen van ' + MERK_TEKST[d.scope] + ' in ' + PERIODE_TEKST[d.period] + ' (' + bereik(dag(d.range.start), dag(d.range.end)) + '), per '
      + (EENHEID[d.granularity] || 'dag') + ', tegenover de periode ervoor. Enkel opportunities; leads die nadien verloren gingen, tellen mee.');
  }

  // ── Rechts: kerncijfers ───────────────────────────────────────────────────
  function renderKpis(d) {
    var nu = d.totals.current.count, vorig = d.totals.previous.count;
    var vorige = bereik(dag(d.range.prevStart), dag(d.range.prevEnd));
    var t = d.target && d.target.value, pc = t ? nu / t * 100 : null, ratio = d.wonRatio.ratioPct;
    K.kpis(P, [
      { label: 'Aanvragen', value: nf(nu), delta: K.delta(nu, vorig, true, null, 't.o.v. ' + vorige), sub: perMerk(d),
        series: (d.series || []).map(function (v) { return v.total; }),
        help: 'Nieuwe opportunities in Odoo, aangemaakt in de gekozen periode, ook als ze nadien verloren gingen.' },
      { label: 'Target gehaald', value: t ? '<span class="' + K.achievedClass(pc) + '">' + K.pctTxt(pc, 0) + '</span>' : '—',
        sub: t ? nf(nu) + ' van ' + nf(t) + (d.target.complete ? '' : ' · niet elke maand heeft een target') : 'Nog geen target voor deze periode',
        series: (d.targetWindows || []).map(function (w) { return w.pct; }),
        help: 'Realisatie tegen de target over exact dezelfde dagen: de target van een maand wordt over haar dagen verdeeld.' },
      { label: 'Vorige periode', value: nf(vorig), sub: vorige, help: 'Dezelfde telling over de even lange periode ervoor.' },
      { label: 'Won-ratio', value: ratio === null ? '—' : K.pctTxt(ratio, 1), sub: nf(d.wonRatio.won) + ' gewonnen van ' + nf(d.wonRatio.total) + ' aangemaakt',
        help: 'Van de aanvragen die in de periode aangemaakt zijn: hoeveel staan nu op gewonnen. Recente aanvragen hebben nog geen tijd gehad, dus deze ratio is voor een korte periode laag.' },
      { label: 'Sinds de start', value: nf(d.totals.allTime.count), sub: 'alle aanvragen in Odoo' + (d.scope === 'all' ? '' : ' van ' + esc(MERK_TEKST[d.scope])) }
    ]);
  }

  // ── Midden: aanvragen per kanaal ──────────────────────────────────────────
  function renderKanalen(d) {
    var vakken = d.series || [], keys = Object.keys(d.brandLabels);
    $('avKanalenTitle').textContent = 'Aanvragen per ' + (EENHEID[d.granularity] || 'dag');
    if (!$('avKanalenChart')) {
      $('avKanalen').innerHTML = '<div style="height: 320px;"><canvas id="avKanalenChart" aria-label="Aanvragen per kanaal"></canvas></div>'
        + '<div id="avLegende" class="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 mt-4"></div>';
    }
    st.grafiek = K.chart('avKanalenChart', {
      type: 'bar',
      data: {
        labels: vakken.map(function (v) { return v.label; }),
        datasets: keys.map(function (k) {
          return K.bars(d.brandLabels[k], vakken.map(function (v) { return v.byChannel[k] || 0; }), K.kanaalKleur(k),
            { stack: 'instroom', kanaal: k, hidden: st.verborgen[k] === true, borderRadius: 2 });
        })
      },
      options: K.baseOptions({
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } },
        plugins: {
          // Eigen legende in drie kolommen (renderLegende): de ingebouwde van Chart.js kan
          // niet groeperen en geen hele kolom tegelijk omzetten.
          legend: { display: false },
          tooltip: { filter: function (it) { return it.parsed.y > 0; }, callbacks: { title: titelVan(vakken) } }
        }
      })
    });
    renderLegende(d);
  }
  /** "Syndicoach: overig/onbekend" -> "Overig/onbekend" (het merk staat al boven de kolom). */
  function kortLabel(label) {
    var s = String(label).replace(/^[^:]+:\s*/, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function renderLegende(d) {
    var el = $('avLegende');
    if (!el) return;
    var keys = Object.keys(d.brandLabels), tel = d.totals.current.byBrand;
    el.innerHTML = GROEPEN.map(function (g) {
      var eigen = keys.filter(g.hoort);
      if (!eigen.length) return '';
      var totaal = eigen.reduce(function (s, k) { return s + (tel[k] || 0); }, 0);
      var allesUit = eigen.every(function (k) { return st.verborgen[k]; });
      return '<div>'
        + '<button type="button" ' + A + '="merk" data-value="' + esc(g.key) + '" title="Klik om de hele kolom uit of aan te zetten"'
        + ' class="flex items-center gap-2 w-full text-left text-sm font-semibold border-b border-base-content/10 pb-1 mb-1 hover:text-primary ' + (allesUit ? 'opacity-40' : '') + '">'
        + '<span>' + esc(g.label) + '</span><span class="ml-auto text-base-content/50 font-normal tabular-nums">' + nf(totaal) + '</span></button>'
        + eigen.map(function (k) {
          var uit = st.verborgen[k] === true;
          return '<button type="button" ' + A + '="kanaal" data-value="' + esc(k) + '"'
            + ' class="flex items-center gap-2 w-full text-left text-xs py-0.5 rounded om-hover ' + (uit ? 'opacity-40 line-through' : '') + '">'
            + '<span class="inline-block w-3 h-3 rounded-sm shrink-0" style="background-color:' + esc(K.kanaalKleur(k)()) + '"></span>'
            + '<span class="truncate">' + esc(kortLabel(d.brandLabels[k])) + '</span>'
            + '<span class="ml-auto text-base-content/50 tabular-nums">' + nf(tel[k] || 0) + '</span></button>';
        }).join('')
        + '</div>';
    }).join('');
  }
  function zetZichtbaarheid() {
    var ch = st.grafiek;
    if (!ch) return;
    ch.data.datasets.forEach(function (ds, i) { ch.setDatasetVisibility(i, !st.verborgen[ds.kanaal]); });
    ch.update();
    if (st.data) renderLegende(st.data);
  }
  /** Staat er in de kolom nog iets aan, dan gaat alles uit; anders gaat alles weer aan. */
  function wisselMerk(groep) {
    var g = GROEPEN.filter(function (x) { return x.key === groep; })[0];
    if (!g || !st.data) return;
    var eigen = Object.keys(st.data.brandLabels).filter(g.hoort);
    var ietsAan = eigen.some(function (k) { return !st.verborgen[k]; });
    eigen.forEach(function (k) { st.verborgen[k] = ietsAan; });
    zetZichtbaarheid();
  }

  // ── Midden: realisatie tegen target ───────────────────────────────────────
  /**
   * Altijd per MAAND (nooit per dag of week): 30 dagen = 1 blok, 3 maanden = 3 blokken
   * naast elkaar, 6 en 12 maanden = twee grafieken. Links het aantal tegen een target die
   * mee op en neer gaat; rechts het percentage tegen een vlakke 100%-lijn: gehaald of niet.
   */
  function renderTarget(d) {
    var ws = d.targetWindows || [], el = $('avTarget');
    if (d.period === '30d' || d.period === '3m') {
      el.innerHTML = '<div class="grid gap-3 ' + (ws.length > 1 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 max-w-md') + '">' + ws.map(function (w) {
        var kop = ws.length === 1 ? PERIODE_TEKST[d.period] + ' (' + w.title + ')' : w.title;
        return vensterBlok(w, kop.charAt(0).toUpperCase() + kop.slice(1));
      }).join('') + '</div>';
      return;
    }
    el.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">'
      + '<div><p class="text-xs text-base-content/60 mb-1">Aanvragen per maand, tegenover de target (stippellijn)</p><div style="height: 200px;"><canvas id="avTargetAbs" aria-label="Aanvragen per maand tegenover de target"></canvas></div></div>'
      + '<div><p class="text-xs text-base-content/60 mb-1" id="avTargetPctUitleg"></p><div style="height: 200px;"><canvas id="avTargetPct" aria-label="Percentage van de target per maand"></canvas></div></div>'
      + '</div>';
    tekenAantal(ws);
    tekenProcent(ws);
  }
  function vensterBlok(w, kop) {
    var heeft = w.target !== null && w.pct !== null, cls = K.achievedClass(heeft ? w.pct : null);
    var balk = !heeft ? '' : w.pct >= 100 ? 'bg-success' : w.pct >= 80 ? 'bg-warning' : 'bg-error';
    return '<div class="rounded-xl border border-base-content/10 p-3">'
      + '<div class="text-xs text-base-content/60">' + esc(kop) + '</div>'
      + '<div class="flex items-end gap-5 mt-1">'
      +   '<div><div class="text-xs text-base-content/50">Target</div><div class="text-xl font-semibold">' + (heeft ? nf(w.target) : '—') + '</div></div>'
      +   '<div><div class="text-xs text-base-content/50">Gehaald</div><div class="text-xl font-semibold">' + nf(w.total) + '</div></div>'
      +   (heeft
          ? '<div class="ml-auto text-right"><div class="text-2xl font-bold ' + cls + '">' + K.pctTxt(w.pct, 0) + '</div><div class="text-xs ' + cls + '">' + esc(verschil(w.total, w.target)) + '</div></div>'
          : '<div class="ml-auto text-right text-xs text-base-content/50 self-center">Geen target ingesteld</div>')
      + '</div>'
      + (heeft ? '<div class="h-2 rounded om-spoor mt-2"><div class="h-2 rounded ' + balk + '" style="width: ' + Math.min(w.pct, 100).toFixed(1) + '%;"></div></div>' : '')
      + '</div>';
  }
  function tekenAantal(ws) {
    var sets = [K.bars('Gehaald', ws.map(function (w) { return w.total; }), '--p', { order: 2 })];
    if (ws.some(function (w) { return w.target !== null; })) sets.push(K.refLine('Target', ws.map(function (w) { return w.target; }), { pointRadius: 3, order: 1 }));
    K.chart('avTargetAbs', {
      type: 'bar',
      data: { labels: ws.map(function (w) { return w.label; }), datasets: sets },
      options: K.baseOptions({
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: titelVan(ws),
            label: function (c) { return ' ' + c.dataset.label + ': ' + nf(c.parsed.y); },
            footer: function (items) { var w = items[0] && ws[items[0].dataIndex]; return w && w.pct !== null ? K.pctTxt(w.pct, 0) + ' van de target' : ''; }
          } }
        }
      })
    });
  }
  function tekenProcent(ws) {
    var heeft = ws.some(function (w) { return w.pct !== null; });
    $('avTargetPctUitleg').textContent = heeft
      ? '% van de target per maand (stippellijn = 100%)'
      : '% van de target per maand: nog geen target ingesteld voor deze periode';
    if (!heeft) return;
    K.chart('avTargetPct', {
      type: 'bar',
      data: {
        labels: ws.map(function (w) { return w.label; }),
        datasets: [
          K.bars('% van de target', ws.map(function (w) { return w.pct; }), '--p', {
            order: 2,
            backgroundColor: ws.map(function (w) { return kleurVoor(w.pct, 0.8); }),
            hoverBackgroundColor: ws.map(function (w) { return kleurVoor(w.pct, 1); })
          }),
          K.refLine('Target', ws.map(function () { return 100; }), { order: 1 })
        ]
      },
      options: K.baseOptions({
        scales: { y: { ticks: { callback: function (v) { return v + '%'; } } } },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: function (it) { return it.datasetIndex === 0; },
            callbacks: {
              title: titelVan(ws),
              label: function (c) { var w = ws[c.dataIndex]; return !w || w.pct === null ? ' Geen target' : ' ' + K.pctTxt(w.pct, 0) + ' van de target (' + verschil(w.total, w.target) + ')'; },
              afterLabel: function (c) { var w = ws[c.dataIndex]; return w && w.target !== null ? 'Target ' + nf(w.target) + ' · gehaald ' + nf(w.total) : ''; }
            }
          }
        }
      })
    });
  }

  // ── Targets instellen ─────────────────────────────────────────────────────
  // Eén raster en één knop Opslaan die alle ingevulde maanden in één keer wegschrijft.
  function zetStatus(tekst, kleur) {
    var el = $('avTargetsStatus');
    el.textContent = tekst;
    el.className = 'text-sm self-center ' + kleur;
  }
  async function openTargets() {
    var rijen = $('avTargetsRijen');
    zetStatus('', 'text-base-content/60');
    $('avTargetsMerk').textContent = '— ' + MERK_TEKST[st.scope];
    rijen.innerHTML = '<div class="skeleton h-16 w-full rounded col-span-full"></div>';
    $('avTargetsVenster').showModal();
    try {
      var d = await K.api('/dashboards/api/targets?monthsBack=17&monthsAhead=6&scope=' + encodeURIComponent(st.scope));
      rijen.innerHTML = d.months.map(function (m) {
        var v = m.targetValue === null || m.targetValue === undefined ? '' : String(m.targetValue);
        return '<label class="form-control"><span class="label-text text-xs">' + esc(K.monthLabel(m.periodMonth, true)) + '</span>'
          + '<input type="number" min="0" class="input input-bordered input-sm w-full mt-1" placeholder="—" data-av-maand="' + esc(m.periodMonth) + '" value="' + esc(v) + '"></label>';
      }).join('');
    } catch (err) {
      rijen.innerHTML = '<p class="text-error text-sm col-span-full">Kon de targets niet laden: ' + esc(err.message) + '</p>';
    }
  }
  async function bewaarTargets(knop) {
    var items = [], fout = false;
    root.querySelectorAll('[data-av-maand]').forEach(function (inp) {
      inp.classList.remove('input-error');
      if (inp.value === '') return; // leeg = niet wijzigen, geen 0 forceren
      var v = Number.parseInt(inp.value, 10);
      if (!Number.isFinite(v) || v < 0) { inp.classList.add('input-error'); fout = true; return; }
      items.push({ periodMonth: inp.getAttribute('data-av-maand'), targetValue: v });
    });
    if (fout) { zetStatus('Corrigeer de gemarkeerde vakken.', 'text-error'); return; }
    if (!items.length) { zetStatus('Niets om op te slaan.', 'text-base-content/60'); return; }
    knop.disabled = true;
    try {
      await K.api('/dashboards/api/targets/batch', { method: 'POST', body: JSON.stringify({ scope: st.scope, items: items }) });
      zetStatus(items.length + (items.length === 1 ? ' maand' : ' maanden') + ' opgeslagen.', 'text-success');
      load();
    } catch (err) {
      zetStatus('Opslaan mislukt: ' + err.message, 'text-error');
    }
    knop.disabled = false;
  }

  // ── Laden en tekenen ──────────────────────────────────────────────────────
  function render() {
    renderFilters();
    var d = st.data;
    if (!d) return;
    renderZin(d);
    renderKpis(d);
    renderKanalen(d);
    renderTarget(d);
    K.icons();
  }
  // Wie snel na elkaar klikt, krijgt het antwoord van de LAATSTE klik: een trager
  // antwoord op een vorige keuze wordt weggegooid.
  var volgnr = 0;
  async function load() {
    var mijn = ++volgnr;
    st.bezig = true;
    K.status(P, '<span class="loading loading-spinner loading-sm"></span>');
    try {
      var d = await K.api('/dashboards/api/aanvragen?period=' + encodeURIComponent(st.period) + '&scope=' + encodeURIComponent(st.scope));
      if (mijn !== volgnr) return;
      st.data = d;
      K.melding(P, '');
      render();
      K.status(P, '<span class="text-xs text-base-content/50">Live uit Odoo, opgehaald om '
        + esc(new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })) + '.</span>');
    } catch (err) {
      if (mijn !== volgnr) return;
      K.melding(P, '<div class="alert alert-error text-sm">Kon de aanvragen niet laden: ' + esc(err.message) + '</div>');
      K.status(P, '');
      console.error('aanvragen', err);
    } finally {
      if (mijn === volgnr) st.bezig = false;
    }
  }

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[' + A + ']');
    if (!el) return;
    var a = el.getAttribute(A), v = el.dataset.value;
    if (a === 'period') { st.period = v; save(); renderFilters(); load(); }
    else if (a === 'scope') { st.scope = v; save(); renderFilters(); load(); }
    else if (a === 'kanaal') { st.verborgen[v] = !st.verborgen[v]; zetZichtbaarheid(); }
    else if (a === 'merk') { wisselMerk(v); }
    else if (a === 'targets-open') { openTargets(); }
    else if (a === 'targets-bewaar') { bewaarTargets(el); }
  });
  // Kerncijfers zijn tegels in een raster, of lijstregels in de smalle kolom (vanaf 2xl).
  if (K.COMPACT && K.COMPACT.addEventListener) K.COMPACT.addEventListener('change', function () { if (st.data) renderKpis(st.data); });

  // Laden zodra het tabblad zichtbaar wordt (dashboards-web.js wisselt de tabbladen).
  function zichtbaar() { return !root.classList.contains('hidden'); }
  new MutationObserver(function () { if (zichtbaar() && !st.data && !st.bezig) load(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  renderFilters();
  if (zichtbaar()) load();
})();
