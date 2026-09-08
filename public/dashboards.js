// Dashboards — Instroom-widget front-end

var state = {
  period: '30d',
  chart: null
};

// --- API helpers -------------------------------------------------------

async function apiFetch(url, options) {
  var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
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

var BRAND_COLORS = {
  syndicoach: '#2563eb',
  openvme: '#0d9488',
  onbekend: '#94a3b8'
};

var PERIOD_LABELS = {
  '30d': 'laatste 30 dagen',
  '6m': 'laatste 6 maanden'
};

// --- Rendering -------------------------------------------------------------

function renderStatCards(data) {
  document.getElementById('statCurrentLabel').textContent = 'Totaal aanvragen, ' + PERIOD_LABELS[data.period];
  document.getElementById('statCurrentValue').textContent = formatNumber(data.totals.current.count);
  document.getElementById('statCurrentDelta').textContent = formatDelta(data.totals.deltaPct);

  var brandsEl = document.getElementById('statCurrentBrands');
  brandsEl.innerHTML = '';
  Object.keys(data.brandLabels).forEach(function (key) {
    var count = data.totals.current.byBrand[key] || 0;
    var pct = data.totals.current.count > 0 ? Math.round((count / data.totals.current.count) * 100) : 0;
    var badge = document.createElement('span');
    badge.className = 'badge badge-outline badge-sm';
    badge.textContent = data.brandLabels[key] + ' ' + formatNumber(count) + ' (' + pct + '%)';
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

// --- Data loading ------------------------------------------------------

async function loadInstroom() {
  try {
    var data = await apiJson('/dashboards/api/leads-instroom?period=' + encodeURIComponent(state.period));
    renderStatCards(data);
    renderDailyChart(data);
  } catch (err) {
    console.error('Instroom-widget kon niet laden:', err);
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
  }
});

(async function init() {
  await initNavbar();
  if (window.lucide) window.lucide.createIcons();
  renderPeriodButtons();
  loadInstroom();
})();
