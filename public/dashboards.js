// Dashboards — Instroom-widget front-end

var state = {
  period: '30d',
  scope: 'all',
  chart: null,
  sparkline: null,
  absoluteSparkline: null
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
  '6m': 'laatste 6 maanden'
};

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

/**
 * Eenvoudig gecentreerd voortschrijdend gemiddelde, puur om de lijn visueel
 * te gladstrijken (het rollend-30-dagen-venster zelf zit al in de data,
 * maar kan van dag tot dag toch nog opspringen -- dit vlakt dat verder af
 * zonder de onderliggende trend te verbergen).
 */
function smoothSeries(values, windowSize) {
  var half = Math.floor(windowSize / 2);
  return values.map(function (_, i) {
    var start = Math.max(0, i - half);
    var end = Math.min(values.length - 1, i + half);
    var sum = 0;
    var count = 0;
    for (var j = start; j <= end; j += 1) {
      if (values[j] !== null && values[j] !== undefined) {
        sum += values[j];
        count += 1;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

function renderTargetSparkline(data) {
  var canvas = document.getElementById('targetSparkline');
  var points = (data.target && data.target.trend) || [];

  if (state.sparkline) {
    state.sparkline.destroy();
    state.sparkline = null;
  }
  // Enkel dagen waar het rollend venster effectief een target had (anders
  // vertekent een lange vlakke 0%-staart aan het begin, vóór er ooit een
  // target werd ingesteld).
  var withTarget = points.filter(function (p) { return p.pct !== null; });
  if (withTarget.length === 0) {
    return; // nog nergens een target ingesteld -- lege canvas, renderTargetProgress toont al de uitleg
  }

  var labels = withTarget.map(function (p) { return p.date; });
  var pctSeries = smoothSeries(withTarget.map(function (p) { return p.pct; }), 7);
  var avgTargetSeries = smoothSeries(withTarget.map(function (p) { return p.avgDailyTarget; }), 7);

  state.sparkline = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '% van target (rollend, 30 dagen)',
          data: pctSeries,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.12)',
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'yPct'
        },
        {
          // De ECHTE voortschrijdende gemiddelde target zelf (niet een vlakke
          // 100%-lijn) -- beweegt mee op en neer met de ingestelde maand-
          // targets, op zijn eigen schaal (yTarget) zodat hij niet plat
          // oogt naast het percentage.
          label: 'Gemiddelde target/dag (rollend, 30 dagen)',
          data: avgTargetSeries,
          borderColor: '#94a3b8',
          borderDash: [4, 3],
          fill: false,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'yTarget'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { display: false },
        yPct: { display: false },
        yTarget: { display: false, position: 'right', beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) {
              return items[0] ? items[0].label : '';
            },
            label: function (item) {
              if (item.datasetIndex === 0) return 'Realisatie: ' + Math.round(item.parsed.y) + '% van target';
              return 'Gem. target: ' + formatNumber(Math.round(item.parsed.y * 10) / 10) + '/dag';
            }
          }
        }
      }
    }
  });
}

function renderTargetAbsoluteSparkline(data) {
  var canvas = document.getElementById('targetAbsoluteSparkline');
  var points = (data.target && data.target.trend) || [];

  if (state.absoluteSparkline) {
    state.absoluteSparkline.destroy();
    state.absoluteSparkline = null;
  }
  var withTarget = points.filter(function (p) { return p.pct !== null; });
  if (withTarget.length === 0) {
    return; // nog nergens een target ingesteld
  }

  var labels = withTarget.map(function (p) { return p.date; });
  // Bewust dezelfde as voor beide lijnen (i.t.t. de %-sparkline rechts) --
  // realisatie en target zijn hier allebei "aantal leads/30 dagen", dus
  // rechtstreeks vergelijkbaar in absolute termen, geen aparte schaal nodig.
  var actualSeries = smoothSeries(withTarget.map(function (p) { return p.actualTrailing; }), 7);
  var targetSeries = smoothSeries(withTarget.map(function (p) { return p.targetTrailing; }), 7);

  state.absoluteSparkline = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Realisatie (30 dagen, absoluut)',
          data: actualSeries,
          borderColor: '#1d4ed8',
          backgroundColor: 'rgba(29, 78, 216, 0.10)',
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4
        },
        {
          label: 'Target (30 dagen, absoluut)',
          data: targetSeries,
          borderColor: '#94a3b8',
          borderDash: [4, 3],
          fill: false,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) { return items[0] ? items[0].label : ''; },
            label: function (item) { return item.dataset.label + ': ' + formatNumber(Math.round(item.parsed.y)); }
          }
        }
      }
    }
  });
}

function renderDailyChart(data) {
  var canvas = document.getElementById('dailyChart');
  var labels = data.daily.map(function (row) { return row.date.slice(5); });
  var brandKeys = Object.keys(data.brandLabels);

  var datasets = brandKeys.map(function (key) {
    return {
      label: data.brandLabels[key],
      data: data.daily.map(function (row) { return row[key] || 0; }),
      backgroundColor: BRAND_COLORS[key] || '#94a3b8',
      stack: 'instroom'
    };
  });

  if (state.chart) {
    state.chart.destroy();
  }
  state.chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      },
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
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
    renderStatCards(data);
    renderTargetProgress(data);
    renderTargetSparkline(data);
    renderTargetAbsoluteSparkline(data);
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
  }
});

(async function init() {
  await initNavbar();
  if (window.lucide) window.lucide.createIcons();
  renderPeriodButtons();
  renderScopeButtons();
  loadInstroom();
})();
