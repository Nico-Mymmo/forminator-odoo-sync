// Dashboards — Instroom-widget front-end

var state = {
  period: '30d',
  scope: 'all',
  chart: null,
  sparkline: null,
  absoluteSparkline: null,
  // Kanalen die de gebruiker in de legende uitzette -- blijft staan bij het
  // wisselen van periode of merk, anders moet je na elke klik opnieuw filteren.
  hiddenKeys: {},
  lastData: null
};

var SCOPE_LABELS = {
  all: 'Alles',
  syndicoach: 'Syndicoach',
  openvme: 'OpenVME',
  onbekend: 'Onbekend'
};

// --- API helpers -------------------------------------------------------

async function apiFetch(url, options) {
  // cache: 'no-store' -- dit zijn live cijfers, de browser mag nooit een
  // eerder antwoord hergebruiken (zie ook de Cache-Control-header server-side).
  var res = await fetch(url, Object.assign({ credentials: 'include', cache: 'no-store' }, options || {}));
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Niet ingelogd');
  }
  return res;
}

async function apiJson(url, options) {
  var res = await apiFetch(url, options);
  var body = await res.json();
  if (!body.success) throw new Error(body.error || ('Fout ' + res.status));
  return body.data;
}

// --- Auth / navbar ---------------------------------------------------------

async function initNavbar() {
  var res = await apiFetch('/api/auth/me');
  var data = await res.json();
  if (!data.user) { window.location.href = '/'; return; }
  if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
}

// --- Formatting ----------------------------------------------------------

function formatNumber(n) {
  return (n || 0).toLocaleString('nl-BE');
}

function formatDelta(pct) {
  if (pct === null || pct === undefined) return 'Geen vergelijking beschikbaar';
  var arrow = pct >= 0 ? '▲' : '▼';
  return arrow + ' ' + Math.abs(pct).toLocaleString('nl-BE') + '% t.o.v. vorige periode';
}

// Eén kleur per kanaal-categorie (merk + kanaal, zie lib/leads-instroom.js).
// Per merk een kleurfamilie: blauwtinten voor Syndicoach, groentinten voor
// OpenVME, grijstinten voor de "overig"-vangnetten en de merken waar we nog
// geen kanaaldetail van hebben (Syndicus Kiezen als apart merk, Manueel).
var BRAND_COLORS = {
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
  syndicuskiezen_overig: '#d97706',
  manual_overig: '#94a3b8'
};

var PERIOD_LABELS = {
  '30d': 'laatste 30 dagen',
  '3m': 'laatste 3 maanden',
  '6m': 'laatste 6 maanden',
  '12m': 'laatste 12 maanden'
};

var GRANULARITY_LABELS = { day: 'dag', week: 'week', month: 'maand' };

// Drie kolommen in de legende. Een kanaal hoort bij de kolom van zijn merk;
// alles wat geen merkvoorvoegsel heeft (Manueel/overig) staat onder "Andere".
var LEGEND_GROUPS = [
  { key: 'syndicoach', label: 'Syndicoach', match: function (k) { return k.indexOf('syndicoach') === 0; } },
  { key: 'openvme', label: 'OpenVME', match: function (k) { return k.indexOf('openvme') === 0; } },
  { key: 'andere', label: 'Andere', match: function (k) { return k.indexOf('syndicoach') !== 0 && k.indexOf('openvme') !== 0; } }
];

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];

/** '2026-09-01' -> 'september 2026' */
function formatMonthKey(periodMonth) {
  var parts = periodMonth.split('-');
  var year = parts[0];
  var monthIndex = Number.parseInt(parts[1], 10) - 1;
  return MONTH_NAMES[monthIndex] + ' ' + year;
}

// --- Rendering -------------------------------------------------------------

function renderStatCards(data) {
  document.getElementById('statCurrentLabel').textContent = 'Totaal aanvragen, ' + PERIOD_LABELS[data.period];
  document.getElementById('statCurrentValue').textContent = formatNumber(data.totals.current.count);
  document.getElementById('statCurrentDelta').textContent = formatDelta(data.totals.deltaPct);

  var brandsEl = document.getElementById('statCurrentBrands');
  brandsEl.innerHTML = '';
  // Bovenaan de KPI-kaart tonen we bewust enkel de 3 hoofdgroepen (Syndicoach /
  // OpenVME / Overig) -- de volledige fijnmazige kanaal-opsplitsing (15
  // categorieën, zie lib/leads-instroom.js) staat al in de dagelijkse
  // staafgrafiek eronder; hier zou dat de kaart onleesbaar maken.
  var rollup = { syndicoach: 0, openvme: 0, overig: 0 };
  Object.keys(data.brandLabels).forEach(function (key) {
    var count = data.totals.current.byBrand[key] || 0;
    if (key.indexOf('syndicoach') === 0) rollup.syndicoach += count;
    else if (key.indexOf('openvme') === 0) rollup.openvme += count;
    else rollup.overig += count;
  });
  var rollupLabels = { syndicoach: 'Syndicoach', openvme: 'OpenVME', overig: 'Overig' };
  ['syndicoach', 'openvme', 'overig'].forEach(function (key) {
    var count = rollup[key];
    var pct = data.totals.current.count > 0 ? Math.round((count / data.totals.current.count) * 100) : 0;
    var badge = document.createElement('span');
    badge.className = 'badge badge-outline badge-sm';
    badge.textContent = rollupLabels[key] + ' ' + formatNumber(count) + ' (' + pct + '%)';
    brandsEl.appendChild(badge);
  });

  document.getElementById('statPreviousValue').textContent = formatNumber(data.totals.previous.count);
  document.getElementById('statPreviousDesc').textContent = 'Voorgaande ' + PERIOD_LABELS[data.period].replace('laatste ', '');

  document.getElementById('statAllTimeValue').textContent = formatNumber(data.totals.allTime.count);

  var ratio = data.wonRatio.ratioPct;
  document.getElementById('statWonRatioValue').textContent = ratio === null ? '—' : ratio.toLocaleString('nl-BE') + '%';
  document.getElementById('statWonRatioDesc').textContent =
    formatNumber(data.wonRatio.won) + ' gewonnen op ' + formatNumber(data.wonRatio.total) + ' aangemaakt';
}

function renderTargetProgress(data) {
  var progressEl = document.getElementById('targetProgress');
  var pctEl = document.getElementById('targetPct');
  var descEl = document.getElementById('targetDesc');
  var current = data.totals.current.count;
  var target = data.target && data.target.value;

  if (!target) {
    progressEl.removeAttribute('value');
    progressEl.classList.remove('progress-success', 'progress-warning');
    pctEl.textContent = '—';
    descEl.textContent = 'Nog geen target ingesteld voor ' + PERIOD_LABELS[data.period] + '. Klik op "Targets instellen" om er één toe te voegen.';
    return;
  }

  var pct = target > 0 ? Math.round((current / target) * 100) : 0;
  progressEl.setAttribute('value', String(Math.min(pct, 100)));
  progressEl.setAttribute('max', '100');
  progressEl.classList.toggle('progress-success', pct >= 100);
  progressEl.classList.toggle('progress-warning', pct < 100);
  pctEl.textContent = pct + '%';

  var note = data.target.complete ? '' : ' (target nog niet voor elke maand in deze periode ingesteld)';
  descEl.textContent = formatNumber(current) + ' van het target ' + formatNumber(target) + ' voor ' + PERIOD_LABELS[data.period] + note;
}

function renderChartCaptions(data) {
  var unit = GRANULARITY_LABELS[data.granularity] || 'dag';
  document.getElementById('dailyChartTitle').textContent = 'Aanvragen per ' + unit;
}

/** Tooltip-titel uit de bucket zelf (bv. "Week 36 (1 sep – 7 sep)"), niet uit het korte aslabel. */
function bucketTitleCallback(buckets) {
  return function (items) {
    var bucket = items[0] && buckets[items[0].dataIndex];
    return bucket ? bucket.title : '';
  };
}

/** "+14 boven target" / "-9 onder target" */
function formatTargetDiff(total, target) {
  var diff = total - target;
  if (diff === 0) return 'Precies op target';
  return (diff > 0 ? '+' : '−') + formatNumber(Math.abs(diff)) + (diff > 0 ? ' boven target' : ' onder target');
}

function kpiTileHtml(w, heading) {
  var hasTarget = w.target !== null && w.pct !== null;
  var reached = hasTarget && w.pct >= 100;
  var tone = reached ? 'text-success' : 'text-error';
  var right = hasTarget
    ? `<div class="ml-auto text-right">
         <div class="text-2xl font-bold ${tone}">${Math.round(w.pct)}%</div>
         <div class="text-xs ${tone}">${esc(formatTargetDiff(w.total, w.target))}</div>
       </div>`
    : '<div class="ml-auto text-right text-xs text-base-content/50 self-center">Geen target ingesteld</div>';
  var bar = hasTarget
    ? `<progress class="progress ${reached ? 'progress-success' : 'progress-error'} w-full mt-2" value="${Math.min(Math.round(w.pct), 100)}" max="100"></progress>`
    : '';
  return `<div class="rounded-box border border-base-content/10 bg-base-100 p-3">
      <div class="text-xs text-base-content/60">${esc(heading)}</div>
      <div class="flex items-end gap-5 mt-1">
        <div><div class="text-xs text-base-content/50">Target</div><div class="text-xl font-bold">${hasTarget ? formatNumber(w.target) : '—'}</div></div>
        <div><div class="text-xs text-base-content/50">Gehaald</div><div class="text-xl font-bold">${formatNumber(w.total)}</div></div>
        ${right}
      </div>
      ${bar}
    </div>`;
}

function destroyTargetCharts() {
  if (state.absoluteSparkline) { state.absoluteSparkline.destroy(); state.absoluteSparkline = null; }
  if (state.sparkline) { state.sparkline.destroy(); state.sparkline = null; }
}

/**
 * Realisatie tegen target, altijd per MAAND (nooit per dag of week):
 * 30 dagen = 1 KPI, 3 maanden = 3 KPI's naast elkaar, 6 en 12 maanden = de
 * twee grafieken. Links het absolute aantal tegen een target die mee op en neer
 * gaat; rechts het percentage tegen een vlakke 100%-lijn -- daar gaat het enkel
 * om: gehaald of niet.
 */
function renderTargetBreakdown(data) {
  var windows = data.targetWindows || [];
  var kpisEl = document.getElementById('targetKpis');
  var chartsEl = document.getElementById('targetCharts');
  destroyTargetCharts();

  if (data.period === '30d' || data.period === '3m') {
    chartsEl.classList.add('hidden');
    kpisEl.classList.remove('hidden');
    kpisEl.className = 'grid gap-3 ' + (windows.length > 1 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 max-w-md');
    kpisEl.innerHTML = windows.map(function (w) {
      var heading = windows.length === 1 ? PERIOD_LABELS[data.period] + ' (' + w.title + ')' : w.title;
      return kpiTileHtml(w, heading.charAt(0).toUpperCase() + heading.slice(1));
    }).join('');
    return;
  }

  kpisEl.classList.add('hidden');
  kpisEl.innerHTML = '';
  chartsEl.classList.remove('hidden');
  renderTargetAbsoluteChart(windows);
  renderTargetPctChart(windows);
}

function renderTargetAbsoluteChart(windows) {
  var hasTarget = windows.some(function (w) { return w.target !== null; });
  var datasets = [
    {
      type: 'bar',
      label: 'Gehaald',
      data: windows.map(function (w) { return w.total; }),
      backgroundColor: '#3b82f6',
      borderRadius: 4,
      order: 2
    }
  ];
  if (hasTarget) {
    datasets.push({
      type: 'line',
      label: 'Target',
      data: windows.map(function (w) { return w.target; }),
      borderColor: '#475569',
      backgroundColor: '#475569',
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      order: 1
    });
  }

  state.absoluteSparkline = new Chart(document.getElementById('targetAbsoluteChart'), {
    type: 'bar',
    data: { labels: windows.map(function (w) { return w.label; }), datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: bucketTitleCallback(windows),
            label: function (item) { return item.dataset.label + ': ' + formatNumber(item.parsed.y); },
            footer: function (items) {
              var w = items[0] && windows[items[0].dataIndex];
              return w && w.pct !== null ? Math.round(w.pct) + '% van target' : '';
            }
          }
        }
      }
    }
  });
}

function renderTargetPctChart(windows) {
  var captionEl = document.getElementById('targetPctCaption');
  var withTarget = windows.some(function (w) { return w.pct !== null; });
  captionEl.textContent = withTarget
    ? '% van target per maand (stippellijn = 100%)'
    : '% van target per maand -- nog geen target ingesteld voor deze periode';
  if (!withTarget) return;

  state.sparkline = new Chart(document.getElementById('targetPctChart'), {
    type: 'bar',
    data: {
      labels: windows.map(function (w) { return w.label; }),
      datasets: [
        {
          type: 'bar',
          label: '% van target',
          data: windows.map(function (w) { return w.pct; }),
          backgroundColor: windows.map(function (w) { return w.pct !== null && w.pct >= 100 ? '#059669' : '#f87171'; }),
          borderRadius: 4,
          order: 2
        },
        {
          type: 'line',
          label: 'Target',
          data: windows.map(function () { return 100; }),
          borderColor: '#475569',
          borderDash: [5, 4],
          borderWidth: 2,
          pointRadius: 0,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { font: { size: 11 }, callback: function (v) { return v + '%'; } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: function (item) { return item.datasetIndex === 0; },
          callbacks: {
            title: bucketTitleCallback(windows),
            label: function (item) {
              var w = windows[item.dataIndex];
              if (!w || w.pct === null) return 'Geen target';
              return Math.round(w.pct) + '% van target (' + formatTargetDiff(w.total, w.target) + ')';
            },
            afterLabel: function (item) {
              var w = windows[item.dataIndex];
              return w && w.target !== null ? 'Target ' + formatNumber(w.target) + ' · gehaald ' + formatNumber(w.total) : '';
            }
          }
        }
      }
    }
  });
}

function renderDailyChart(data) {
  var canvas = document.getElementById('dailyChart');
  var series = data.series || [];
  var brandKeys = Object.keys(data.brandLabels);

  var datasets = brandKeys.map(function (key) {
    return {
      label: data.brandLabels[key],
      channelKey: key,
      data: series.map(function (b) { return b.byChannel[key] || 0; }),
      backgroundColor: BRAND_COLORS[key] || '#94a3b8',
      stack: 'instroom',
      hidden: state.hiddenKeys[key] === true
    };
  });

  if (state.chart) {
    state.chart.destroy();
  }
  state.chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: series.map(function (b) { return b.label; }), datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      },
      plugins: {
        // Eigen legende in drie kolommen (renderLegend) -- de ingebouwde van
        // Chart.js kan niet groeperen en geen hele kolom tegelijk omzetten.
        legend: { display: false },
        tooltip: {
          filter: function (item) { return item.parsed.y > 0; },
          callbacks: { title: bucketTitleCallback(series) }
        }
      }
    }
  });
  renderLegend(data);
}

/** "Syndicoach: overig/onbekend" -> "Overig/onbekend" (het merk staat al boven de kolom). */
function shortChannelLabel(label) {
  var s = String(label).replace(/^[^:]+:\s*/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderLegend(data) {
  var el = document.getElementById('dailyChartLegend');
  var keys = Object.keys(data.brandLabels);
  var totals = {};
  keys.forEach(function (k) { totals[k] = data.totals.current.byBrand[k] || 0; });

  el.innerHTML = LEGEND_GROUPS.map(function (group) {
    var groupKeys = keys.filter(group.match);
    if (groupKeys.length === 0) return '';
    var groupTotal = groupKeys.reduce(function (sum, k) { return sum + totals[k]; }, 0);
    var allHidden = groupKeys.every(function (k) { return state.hiddenKeys[k]; });

    var items = groupKeys.map(function (k) {
      var hidden = state.hiddenKeys[k] === true;
      return `<button type="button" data-action="toggleLegendKey" data-key="${esc(k)}"
          class="flex items-center gap-2 w-full text-left text-xs py-0.5 rounded hover:bg-base-200 ${hidden ? 'opacity-40 line-through' : ''}">
          <span class="inline-block w-3 h-3 rounded-sm shrink-0" style="background:${esc(BRAND_COLORS[k] || '#94a3b8')}"></span>
          <span class="truncate">${esc(shortChannelLabel(data.brandLabels[k]))}</span>
          <span class="ml-auto text-base-content/50 tabular-nums">${formatNumber(totals[k])}</span>
        </button>`;
    }).join('');

    return `<div>
        <button type="button" data-action="toggleLegendGroup" data-group="${esc(group.key)}"
          title="Klik om de hele kolom aan of uit te zetten"
          class="flex items-center gap-2 w-full text-left text-sm font-semibold border-b border-base-content/10 pb-1 mb-1 hover:text-primary ${allHidden ? 'opacity-40' : ''}">
          <span>${esc(group.label)}</span>
          <span class="ml-auto text-base-content/50 font-normal tabular-nums">${formatNumber(groupTotal)}</span>
        </button>
        ${items}
      </div>`;
  }).join('');
}

function applyLegendVisibility() {
  if (!state.chart) return;
  state.chart.data.datasets.forEach(function (ds, i) {
    state.chart.setDatasetVisibility(i, !state.hiddenKeys[ds.channelKey]);
  });
  state.chart.update();
  if (state.lastData) renderLegend(state.lastData);
}

function toggleLegendKey(key) {
  state.hiddenKeys[key] = !state.hiddenKeys[key];
  applyLegendVisibility();
}

/** Staat er in de kolom nog iets aan, dan gaat alles uit; anders gaat alles weer aan. */
function toggleLegendGroup(groupKey) {
  if (!state.chart) return;
  var group = LEGEND_GROUPS.filter(function (g) { return g.key === groupKey; })[0];
  if (!group) return;
  var keys = state.chart.data.datasets.map(function (ds) { return ds.channelKey; }).filter(group.match);
  var anyVisible = keys.some(function (k) { return !state.hiddenKeys[k]; });
  keys.forEach(function (k) { state.hiddenKeys[k] = anyVisible; });
  applyLegendVisibility();
}

function renderPeriodButtons() {
  document.querySelectorAll('[data-action="setPeriod"]').forEach(function (btn) {
    var isActive = btn.dataset.period === state.period;
    btn.classList.toggle('btn-active', isActive);
  });
}

function renderScopeButtons() {
  document.querySelectorAll('[data-action="setScope"]').forEach(function (btn) {
    var isActive = btn.dataset.scope === state.scope;
    btn.classList.toggle('btn-active', isActive);
  });
}

// --- Data loading ------------------------------------------------------

async function loadInstroom() {
  try {
    var url = '/dashboards/api/leads-instroom?period=' + encodeURIComponent(state.period) + '&scope=' + encodeURIComponent(state.scope);
    var data = await apiJson(url);
    state.lastData = data;
    renderChartCaptions(data);
    renderStatCards(data);
    renderTargetProgress(data);
    renderTargetBreakdown(data);
    renderDailyChart(data);
  } catch (err) {
    console.error('Instroom-widget kon niet laden:', err);
  }
}

// --- Targets-modal -----------------------------------------------------
// Eén overzichtelijk grid (geen scrollbars) + één globale "Opslaan"-knop
// die alle ingevulde maanden in één keer wegschrijft, i.p.v. een aparte
// opslaan-knop per maandrij.

async function loadTargetsModal() {
  var rowsEl = document.getElementById('targetsRows');
  var scopeLabelEl = document.getElementById('targetsModalScope');
  var statusEl = document.getElementById('targetsSaveStatus');
  statusEl.textContent = '';
  scopeLabelEl.textContent = '— ' + SCOPE_LABELS[state.scope];
  rowsEl.innerHTML = '<div class="skeleton h-16 w-full rounded col-span-3"></div>';
  try {
    var data = await apiJson('/dashboards/api/targets?monthsBack=17&monthsAhead=6&scope=' + encodeURIComponent(state.scope));
    rowsEl.innerHTML = '';
    data.months.forEach(function (month) {
      var cell = document.createElement('label');
      cell.className = 'form-control';

      var span = document.createElement('span');
      span.className = 'label-text text-xs capitalize';
      span.textContent = formatMonthKey(month.periodMonth);

      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.className = 'input input-bordered input-sm w-full mt-1';
      input.placeholder = '—';
      if (month.targetValue !== null && month.targetValue !== undefined) {
        input.value = String(month.targetValue);
      }
      input.dataset.month = month.periodMonth;

      cell.appendChild(span);
      cell.appendChild(input);
      rowsEl.appendChild(cell);
    });
  } catch (err) {
    rowsEl.innerHTML = '<p class="text-error text-sm col-span-3">Kon targets niet laden: ' + err.message + '</p>';
  }
}

async function saveAllTargets(btnEl) {
  var statusEl = document.getElementById('targetsSaveStatus');
  var inputs = document.querySelectorAll('#targetsRows input[data-month]');
  var items = [];
  var hasError = false;

  inputs.forEach(function (input) {
    input.classList.remove('input-error');
    if (input.value === '') return; // leeg = niet wijzigen, geen 0 forceren
    var value = Number.parseInt(input.value, 10);
    if (!Number.isFinite(value) || value < 0) {
      input.classList.add('input-error');
      hasError = true;
      return;
    }
    items.push({ periodMonth: input.dataset.month, targetValue: value });
  });

  if (hasError) {
    statusEl.textContent = 'Corrigeer de gemarkeerde velden.';
    statusEl.className = 'text-sm text-error self-center';
    return;
  }
  if (items.length === 0) {
    statusEl.textContent = 'Niets om op te slaan.';
    statusEl.className = 'text-sm text-base-content/60 self-center';
    return;
  }

  var originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Bezig...';
  try {
    await apiJson('/dashboards/api/targets/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: state.scope, items: items })
    });
    statusEl.textContent = items.length + ' maand(en) opgeslagen.';
    statusEl.className = 'text-sm text-success self-center';
    loadInstroom(); // benchmark-balk meteen verversen
  } catch (err) {
    statusEl.textContent = 'Opslaan mislukt: ' + err.message;
    statusEl.className = 'text-sm text-error self-center';
    console.error('Targets batch-opslaan mislukt:', err);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

// --- Init ------------------------------------------------------------------

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;
  if (action === 'setPeriod') {
    state.period = el.dataset.period;
    renderPeriodButtons();
    loadInstroom();
  } else if (action === 'setScope') {
    state.scope = el.dataset.scope;
    renderScopeButtons();
    loadInstroom();
  } else if (action === 'openTargets') {
    document.getElementById('targetsModal').showModal();
    loadTargetsModal();
  } else if (action === 'saveAllTargets') {
    saveAllTargets(el);
  } else if (action === 'toggleLegendKey') {
    toggleLegendKey(el.dataset.key);
  } else if (action === 'toggleLegendGroup') {
    toggleLegendGroup(el.dataset.group);
  }
});

(async function init() {
  await initNavbar();
  if (window.lucide) window.lucide.createIcons();
  renderPeriodButtons();
  renderScopeButtons();
  loadInstroom();
})();
