/**
 * Mini-apps -- AI-gebruiksrapport (admin-only), rechtstreeks in de module
 *
 * Toont /mini-apps/api/ai-usage (zie lib/ai.js/lib/ai-pricing.js): counts,
 * tokens en een kostenschatting per mini-app en per gebruiker, met een paar
 * grafiekjes (Chart.js, CDN in mini-apps.html). GEEN prompt/antwoord-tekst --
 * die staat nergens opgeslagen (zie mini_app_ai_calls).
 *
 * Enkel zichtbaar/actief voor admins -- de sectie zelf staat default
 * `.hidden` in mini-apps.html en wordt pas getoond + geladen vanuit
 * renderNavbar() in mini-apps-core.js zodra isAdmin === true. De route zelf
 * is OOK server-side admin-gated (403 voor niet-admins), dit is dus geen
 * security-by-obscurity.
 *
 * Platte globale scope (var/function), geen IIFE -- zelfde patroon als de
 * andere mini-apps-*.js-bestanden (zie CLAUDE.md).
 */

var aiUsageRangeDays = 30;
var aiUsageCharts = { byApp: null, byUser: null, daily: null };

function formatUsd(n) {
  var v = Number(n || 0);
  return '$' + v.toFixed(v < 1 ? 4 : 2);
}

function formatTokens(n) {
  return Number(n || 0).toLocaleString('nl-BE');
}

// Aangeroepen vanuit de centrale click-listener in mini-apps-bootstrap.js.
function setMiniAppsAiUsageRange(days) {
  aiUsageRangeDays = days;
  document.querySelectorAll('[data-action="setAiUsageRange"]').forEach(function(btn) {
    btn.classList.toggle('btn-active', parseInt(btn.dataset.days, 10) === days);
  });
  loadMiniAppsAiUsage();
}

function renderAiUsageTable(rows, labelKey, labelHeader) {
  if (!rows.length) {
    return '<p class="text-sm text-base-content/40 py-6 text-center">Geen AI-aanroepen in deze periode.</p>';
  }
  var body = rows.map(function(r) {
    return '<tr>' +
      '<td>' + escapeHtml(String(r[labelKey])) + '</td>' +
      '<td class="text-right">' + r.calls + '</td>' +
      '<td class="text-right' + (r.failed ? ' text-error' : '') + '">' + r.failed + '</td>' +
      '<td class="text-right">' + formatTokens(r.tokensIn) + '</td>' +
      '<td class="text-right">' + formatTokens(r.tokensOut) + '</td>' +
      '<td class="text-right font-semibold">' + formatUsd(r.cost) + '</td>' +
      '</tr>';
  }).join('');

  return '<div class="overflow-x-auto"><table class="table table-sm">' +
    '<thead><tr>' +
    '<th>' + labelHeader + '</th>' +
    '<th class="text-right">Aanroepen</th>' +
    '<th class="text-right">Mislukt</th>' +
    '<th class="text-right">Tokens in</th>' +
    '<th class="text-right">Tokens uit</th>' +
    '<th class="text-right">Kost (schatting)</th>' +
    '</tr></thead>' +
    '<tbody>' + body + '</tbody></table></div>';
}

// Vaste, herbruikbare kleurenset -- niet afhankelijk van het daisyUI-thema
// (Chart.js canvassen lezen geen CSS-variabelen uit zichzelf).
var CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16', '#ec4899'];

function destroyChart(key) {
  if (aiUsageCharts[key]) {
    aiUsageCharts[key].destroy();
    aiUsageCharts[key] = null;
  }
}

function renderTopBarChart(canvasId, key, rows, labelKey) {
  destroyChart(key);
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var top = rows.slice(0, 8);
  aiUsageCharts[key] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map(function(r) { return String(r[labelKey]); }),
      datasets: [{
        label: 'Geschatte kost (USD)',
        data: top.map(function(r) { return Number(r.cost.toFixed(4)); }),
        backgroundColor: top.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length]; })
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function renderDailyChart(daily) {
  destroyChart('daily');
  var canvas = document.getElementById('aiUsageDailyChart');
  if (!canvas || typeof Chart === 'undefined') return;
  aiUsageCharts.daily = new Chart(canvas, {
    type: 'line',
    data: {
      labels: daily.map(function(d) { return d.date; }),
      datasets: [
        {
          label: 'Kost per dag (USD)',
          data: daily.map(function(d) { return Number(d.cost.toFixed(4)); }),
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0] + '33',
          fill: true,
          tension: 0.25,
          yAxisID: 'y'
        },
        {
          label: 'Aanroepen per dag',
          data: daily.map(function(d) { return d.calls; }),
          borderColor: CHART_COLORS[3],
          backgroundColor: 'transparent',
          borderDash: [4, 3],
          tension: 0.25,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'USD' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Aanroepen' } }
      }
    }
  });
}

async function loadMiniAppsAiUsage() {
  var container = document.getElementById('aiUsageAdminReport');
  if (!container) return;
  container.innerHTML = '<div class="flex justify-center py-16"><span class="loading loading-spinner loading-md text-primary"></span></div>';

  try {
    var d = await apiJson('/mini-apps/api/ai-usage?days=' + aiUsageRangeDays);

    var capNote = '<p class="text-xs text-base-content/40 mt-4">' +
      'Platform-brede daglimiet: ' + d.caps.maxGlobalPerDay + ' aanroepen/dag &middot; per app: ' + d.caps.maxPerAppPerDay + ' aanroepen/dag/app.' +
      (d.truncated ? ' <span class="text-warning">Let op: meer dan 20.000 rijen in deze periode, rapport is afgekapt.</span>' : '') +
      '</p>';

    var stats = '<div class="stats stats-vertical sm:stats-horizontal border border-base-200 shadow-sm w-full mb-6">' +
      '<div class="stat py-3"><div class="stat-title text-xs">Aanroepen</div><div class="stat-value text-xl">' + d.totals.calls + '</div>' +
      '<div class="stat-desc">' + d.totals.failed + ' mislukt</div></div>' +
      '<div class="stat py-3"><div class="stat-title text-xs">Geschatte kost</div><div class="stat-value text-xl text-primary">' + formatUsd(d.totals.cost) + '</div>' +
      '<div class="stat-desc">over ' + d.rangeDays + ' dagen</div></div>' +
      '<div class="stat py-3"><div class="stat-title text-xs">Tokens in / uit</div><div class="stat-value text-xl">' + formatTokens(d.totals.tokensIn) + ' / ' + formatTokens(d.totals.tokensOut) + '</div></div>' +
      '</div>';

    var chartsGrid = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">' +
      '<div class="border border-base-200 rounded-box p-3"><p class="text-xs font-semibold text-base-content/60 mb-2">Top mini-apps naar kost</p><div style="height:220px;"><canvas id="aiUsageByAppChart"></canvas></div></div>' +
      '<div class="border border-base-200 rounded-box p-3"><p class="text-xs font-semibold text-base-content/60 mb-2">Top gebruikers naar kost</p><div style="height:220px;"><canvas id="aiUsageByUserChart"></canvas></div></div>' +
      '</div>' +
      '<div class="border border-base-200 rounded-box p-3 mb-6"><p class="text-xs font-semibold text-base-content/60 mb-2">Kost &amp; aanroepen per dag</p><div style="height:240px;"><canvas id="aiUsageDailyChart"></canvas></div></div>';

    var appsHeader = '<h3 class="text-sm font-semibold mb-2">Per mini-app</h3>';
    var usersHeader = '<h3 class="text-sm font-semibold mb-2 mt-6">Per gebruiker</h3>';

    container.innerHTML = stats + chartsGrid +
      appsHeader + renderAiUsageTable(d.byApp, 'title', 'Mini-app') +
      usersHeader + renderAiUsageTable(d.byUser, 'label', 'Gebruiker') +
      capNote;

    renderTopBarChart('aiUsageByAppChart', 'byApp', d.byApp, 'title');
    renderTopBarChart('aiUsageByUserChart', 'byUser', d.byUser, 'label');
    renderDailyChart(d.daily);
  } catch (err) {
    container.innerHTML = '<p class="text-sm text-error py-6 text-center">Ophalen mislukt: ' + escapeHtml(err.message) + '</p>';
  }
}
