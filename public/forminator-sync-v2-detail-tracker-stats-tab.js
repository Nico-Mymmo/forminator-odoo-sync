/**
 * Forminator Sync V2 -- Detail -- Statistieken-tab voor trackers
 *
 * Trackbare korte links/QR-codes (source_type = 'tracker') hebben geen
 * formuliervelden/koppeling/indieningen — in plaats daarvan tonen we hier
 * totaal-tellingen, een dag-grafiek en een origin/device-uitsplitsing.
 *
 * Volgt het bestaande cross-file-exportpatroon van deze module: functies
 * gaan naar buiten via Object.assign(window.FSV2, { ... }) onderaan dit
 * bestand, en worden elders alleen via window.FSV2.naam() aangeroepen
 * (nooit een bare call — dit bestand is zijn eigen IIFE).
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2, window.FSV2.api/esc/showAlert).
 */
(function () {
  'use strict';

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  var DEVICE_LABELS = {
    mobile: 'Mobiel',
    desktop: 'Desktop',
    tablet: 'Tablet',
    unknown: 'Onbekend',
  };

  function buildDailyBarSvg(dailyStats) {
    var days = Array.isArray(dailyStats) ? dailyStats : [];
    var maxVal = days.reduce(function (m, d) { return Math.max(m, d.total || 0); }, 0) || 1;
    var W = 300, H = 64, gap = 1;
    var barW = (W / (days.length || 1)) - gap;

    var bars = days.map(function (d, i) {
      var v = d.total || 0;
      var h = v > 0 ? Math.max(2, Math.round((v / maxVal) * (H - 2))) : 1;
      var x = (i * (barW + gap)).toFixed(1);
      var y = H - h;
      return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${h}" rx="1"><title>${esc(d.date)}: ${v}</title></rect>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-16 block text-info" preserveAspectRatio="none" fill="currentColor">${bars}</svg>`;
  }

  function buildOriginBar(originBreakdown) {
    var qr = (originBreakdown && originBreakdown.qr) || 0;
    var link = (originBreakdown && originBreakdown.link) || 0;
    var total = qr + link;
    var qrPct = total > 0 ? Math.round((qr / total) * 100) : 0;
    var linkPct = 100 - qrPct;

    return `
      <div class="mb-1 flex items-center justify-between text-xs text-base-content/60">
        <span><i data-lucide="qr-code" class="w-3 h-3 inline align-text-bottom"></i> QR-scan: ${qr} (${qrPct}%)</span>
        <span>Directe link: ${link} (${linkPct}%)</span>
      </div>
      <div class="w-full h-2.5 rounded-full bg-base-200 overflow-hidden flex">
        <div class="h-full bg-info" style="width:${qrPct}%"></div>
        <div class="h-full bg-base-300" style="width:${linkPct}%"></div>
      </div>`;
  }

  function buildDeviceBreakdown(deviceBreakdown) {
    var db = deviceBreakdown || {};
    var order = ['mobile', 'desktop', 'tablet', 'unknown'];
    var total = order.reduce(function (s, k) { return s + (db[k] || 0); }, 0);

    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${order.map(function (key) {
          var count = db[key] || 0;
          var pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return `<div class="rounded-box border border-base-200 p-2 text-center">
            <p class="text-lg font-bold">${count}</p>
            <p class="text-xs text-base-content/60">${DEVICE_LABELS[key] || key} (${pct}%)</p>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderDetailTrackerStatsLoading() {
    var el = document.getElementById('detailTrackerStats');
    if (!el) return;
    el.innerHTML = `<div class="flex items-center gap-3 py-8 text-base-content/60">
      <span class="loading loading-spinner loading-sm"></span>
      <span>Statistieken laden…</span>
    </div>`;
  }

  async function renderDetailTrackerStats() {
    var el = document.getElementById('detailTrackerStats');
    if (!el) return;

    var integrationId = S().activeId;
    if (!integrationId) return;

    renderDetailTrackerStatsLoading();

    var stats;
    try {
      var res = await window.FSV2.api('/integrations/' + integrationId + '/tracker-stats');
      stats = res.data || {};
    } catch (err) {
      el.innerHTML = `<div class="alert alert-error text-sm"><span>Kon statistieken niet laden: ${esc(err.message)}</span></div>`;
      return;
    }

    var totalAllTime = stats.total_all_time || 0;
    var total30d = stats.total_30d || 0;
    var dailyStats = Array.isArray(stats.daily_stats) ? stats.daily_stats : [];
    var originBreakdown = stats.origin_breakdown || { qr: 0, link: 0 };
    var deviceBreakdown = stats.device_breakdown || {};

    el.innerHTML = `
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="rounded-box border border-base-200 p-4 text-center">
          <p class="text-3xl font-bold">${totalAllTime}</p>
          <p class="text-xs text-base-content/60 mt-1">Totaal aantal kliks/scans (all-time)</p>
        </div>
        <div class="rounded-box border border-base-200 p-4 text-center">
          <p class="text-3xl font-bold">${total30d}</p>
          <p class="text-xs text-base-content/60 mt-1">Laatste 30 dagen</p>
        </div>
      </div>

      <div class="mb-6">
        <p class="text-xs uppercase tracking-wide text-base-content/40 font-medium mb-2">Per dag (laatste 30 dagen)</p>
        <div class="rounded-box border border-base-200 p-3">
          ${buildDailyBarSvg(dailyStats)}
        </div>
      </div>

      <div class="mb-6">
        <p class="text-xs uppercase tracking-wide text-base-content/40 font-medium mb-2">Herkomst</p>
        <div class="rounded-box border border-base-200 p-3">
          ${buildOriginBar(originBreakdown)}
        </div>
      </div>

      <div>
        <p class="text-xs uppercase tracking-wide text-base-content/40 font-medium mb-2">Apparaat</p>
        ${buildDeviceBreakdown(deviceBreakdown)}
      </div>
    `;

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });
  }

  Object.assign(window.FSV2, {
    renderDetailTrackerStats: renderDetailTrackerStats,
  });
})();
