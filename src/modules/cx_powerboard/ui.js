/**
 * CX Powerboard — UI
 *
 * Rules (STRICT — do not violate):
 *  1. Theme IIFE is the FIRST script in <head>
 *  2. Tailwind CDN warning suppressor before Tailwind <script src>
 *  3. ${navbar(user)} is the first child of <body>
 *  4. ALL conditional / list HTML is precomputed as a JS variable BEFORE
 *     the outer template literal begins.
 *  5. Inside <script> blocks: ZERO backticks — only ' strings and + concat.
 *  6. escHtml() on every dynamic value written to innerHTML.
 *  7. initTheme(), changeTheme(), logout() at the bottom of the inline script.
 *  8. lucide.createIcons() called after every innerHTML mutation.
 */

import { navbar } from '../../lib/components/navbar.js';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function cxPowerboardDashboardUI(user) {
  const isManager = user.role === 'admin' || user.role === 'cx_powerboard_manager';

  // ── Precompute all conditional HTML blocks ────────────────────────────────

  const settingsBtn = '<a href="/cx-powerboard/settings" class="btn btn-sm btn-ghost gap-1">'
    + '<i data-lucide="settings" class="w-4 h-4"></i> Instellingen</a>';

  // First name for greeting (server-side, safe)
  const rawName = (user.full_name || user.name || user.email || '');
  const firstName = rawName.split(' ')[0].replace(/[<>&"']/g, '') || 'je';

  const teamTab = isManager
    ? '<button role="tab" class="tab" id="tabBtnTeam" onclick="switchTab(\'team\')">'
    + '<i data-lucide="users" class="w-4 h-4 mr-1"></i> Team</button>'
    : '';

  const teamPanel = isManager
    ? '<div id="tabTeam" style="display:none;"></div>'
    : '';

  // Scalar values passed to client JS — safe because isManager is server-determined
  const isManagerJS = isManager ? 'true' : 'false';

  // ── Template (ONE outer template literal, simple ${variable} injections only) ─

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CX Powerboard</title>

  <script>
    (function initThemeEarly() {
      try {
        var localTheme = localStorage.getItem('selectedTheme');
        var cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
        var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        var theme = localTheme || cookieTheme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>

  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />

  <script>
    (function suppressTailwindCdnWarning() {
      var _w = console.warn;
      console.warn = function() {
        if (arguments[0] && typeof arguments[0] === 'string' &&
            arguments[0].indexOf('cdn.tailwindcss.com should not be used in production') !== -1) return;
        return _w.apply(console, arguments);
      };
    })();
  </script>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"></script>

  <style>
    /* Urgency borders */
    .urgency-overdue  { border-left: 4px solid oklch(var(--er)); }
    .urgency-today    { border-left: 4px solid oklch(var(--wa)); }
    .urgency-upcoming { border-left: 4px solid oklch(var(--in)); }
    .urgency-none     { border-left: 4px solid oklch(var(--bc) / 0.15); }

    /* FullCalendar × DaisyUI */
    .fc {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: oklch(var(--b1));
      --fc-border-color: oklch(var(--bc) / 0.06);
      --fc-today-bg-color: oklch(var(--p) / 0.03);
    }
    .fc .fc-scrollgrid { border-color: oklch(var(--bc) / 0.08); }
    .fc .fc-view-harness { min-height: 30rem; }
    .fc .fc-toolbar { padding: 0.625rem 0; margin-bottom: 0.75rem; }
    .fc-toolbar-title { font-size: 1rem; font-weight: 600; color: oklch(var(--bc)); }
    .fc .fc-button {
      background-color: oklch(var(--b1)) !important;
      border: 1px solid oklch(var(--bc) / 0.2) !important;
      color: oklch(var(--bc)) !important;
      text-transform: none !important;
      font-weight: 500 !important;
      font-size: 0.8125rem !important;
      padding: 0.3rem 0.6rem !important;
      border-radius: var(--rounded-btn, 0.5rem) !important;
      box-shadow: none !important;
      transition: all 0.15s ease !important;
      outline: none !important;
      height: 1.875rem !important;
      line-height: 1 !important;
    }
    .fc .fc-button:hover { background-color: oklch(var(--bc) / 0.08) !important; border-color: oklch(var(--bc) / 0.3) !important; }
    .fc .fc-button:focus { outline: none !important; box-shadow: none !important; }
    .fc .fc-button:disabled { opacity: 0.4 !important; cursor: not-allowed !important; }
    .fc .fc-button-primary:not(:disabled).fc-button-active,
    .fc .fc-button-primary:not(:disabled):active {
      background-color: oklch(var(--p)) !important; border-color: oklch(var(--p)) !important;
      color: oklch(var(--pc)) !important; font-weight: 600 !important;
    }
    .fc .fc-button-group { gap: 0 !important; }
    .fc .fc-button-group > .fc-button { border-radius: 0 !important; }
    .fc .fc-button-group > .fc-button:first-child {
      border-top-left-radius: var(--rounded-btn, 0.5rem) !important;
      border-bottom-left-radius: var(--rounded-btn, 0.5rem) !important;
    }
    .fc .fc-button-group > .fc-button:last-child {
      border-top-right-radius: var(--rounded-btn, 0.5rem) !important;
      border-bottom-right-radius: var(--rounded-btn, 0.5rem) !important;
    }
    .fc .fc-button-group > .fc-button:not(:last-child) { border-right-width: 0 !important; }
    .fc .fc-today-button {
      background-color: oklch(var(--p)) !important; border-color: oklch(var(--p)) !important;
      color: oklch(var(--pc)) !important; font-weight: 600 !important;
    }
    .fc .fc-today-button:hover:not(:disabled) {
      background-color: oklch(var(--p) / 0.85) !important; border-color: oklch(var(--p) / 0.85) !important;
    }
    .fc .fc-today-button:disabled {
      background-color: oklch(var(--p) / 0.5) !important; border-color: oklch(var(--p) / 0.5) !important;
      color: oklch(var(--pc)) !important; opacity: 0.5 !important;
    }
    .fc .fc-col-header { background-color: oklch(var(--b2)); }
    .fc-col-header-cell {
      border-bottom: 1px solid oklch(var(--bc) / 0.1);
      font-weight: 600; text-transform: uppercase; font-size: 0.6875rem;
      color: oklch(var(--bc) / 0.6); padding: 0.4rem 0.25rem; background-color: oklch(var(--b2));
    }
    .fc .fc-col-header-cell-cushion { color: oklch(var(--bc) / 0.72); }
    .fc-daygrid-day-frame { padding: 0.25rem; min-height: 4.5rem; }
    .fc .fc-daygrid-day-events { min-height: 2.25rem; margin-bottom: 0 !important; }
    .fc .fc-day-other { background-color: oklch(var(--b2) / 0.5); }
    .fc .fc-day-other .fc-daygrid-day-number { color: oklch(var(--bc) / 0.45); }
    .fc .fc-day-past:not(.fc-day-today) { background-color: oklch(var(--bc) / 0.03); }
    .fc .fc-day-past:not(.fc-day-today) .fc-daygrid-day-number { color: oklch(var(--bc) / 0.55); }
    .fc-daygrid-day.fc-day-today { background-color: oklch(var(--p) / 0.03) !important; }
    .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
      background-color: oklch(var(--p)); color: oklch(var(--pc));
      border-radius: 0.375rem; font-weight: 600;
    }
    .fc .fc-daygrid-day-number { font-size: 0.75rem; padding: 0.25rem 0.375rem; color: oklch(var(--bc) / 0.7); }
    .fc-event {
      cursor: pointer;
      border: none !important;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.25rem 0.375rem !important;
      margin-bottom: 0.125rem !important;
      border-radius: var(--rounded-btn, 0.5rem) !important;
      box-shadow: 0 1px 3px oklch(var(--bc) / 0.1);
      transition: all 0.15s ease;
      text-align: center;
    }
    .fc-event:hover { transform: translateY(-1px); box-shadow: 0 3px 8px oklch(var(--bc) / 0.15); }
    .fc-daygrid-event-dot { display: none !important; }
    .fc-daygrid-block-event .fc-event-main { padding: 0 !important; }
    .fc-day-selected { background-color: oklch(var(--p) / 0.08) !important; }
    #panel-content { max-height: calc(100vh - 14rem); overflow-y: auto; }

    /* CX Powerboard V6 animations */
    @keyframes cx-pop {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    .cx-stat-complete { animation: cx-pop 0.4s ease; }
    .cx-stats-done { background-color: oklch(var(--su) / 0.08) !important; }
    @keyframes cx-card-in {
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <script>
    window.__PB_IS_MANAGER__ = ${isManagerJS};
    window.__CX_USER_ID__    = '${user.id}';
  </script>

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-6xl">

      <!-- Header -->
      <div class="flex items-start justify-between mb-5">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-base-content/35 mb-0.5">CX Powerboard</p>
          <h1 class="text-2xl font-bold leading-tight">Goedemorgen, ${firstName}.</h1>
          <div class="flex items-center gap-3 mt-1.5">
            <span id="streakChip" style="display:none;"
                  class="inline-flex items-center gap-1 text-xs font-semibold text-warning bg-warning/10 px-2.5 py-0.5 rounded-full"></span>
            <span id="refreshedAt" class="text-xs text-base-content/30"></span>
          </div>
          <div id="viewAsSwitcher" class="mt-2 flex items-center gap-2" style="display:none;">
            <span class="text-xs text-base-content/40">Bekijk als:</span>
            <select id="viewAsSelect" class="select select-xs select-bordered text-sm max-w-52"
                    onchange="switchViewAs(this.value)"></select>
          </div>
        </div>
        ${settingsBtn}
      </div>

      <!-- Focus signal -->
      <div id="focusSignalBar" style="display:none;" class="mb-5">
        <p id="focusSignalText"
           class="text-sm text-base-content/55 border-l-2 border-primary/30 pl-3 py-0.5 italic"></p>
      </div>


      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-boxed mb-6 w-fit">
        <button role="tab" class="tab tab-active" id="tabBtnDashboard" onclick="switchTab('dashboard')">
          <i data-lucide="layout-dashboard" class="w-4 h-4 mr-1"></i> Dashboard
        </button>
        <button role="tab" class="tab" id="tabBtnCalendar" onclick="switchTab('calendar')">
          <i data-lucide="calendar" class="w-4 h-4 mr-1"></i> Kalender
        </button>
        <button role="tab" class="tab" id="tabBtnWins" onclick="switchTab('wins')">
          <i data-lucide="trophy" class="w-4 h-4 mr-1"></i> Wins
        </button>
        ${teamTab}
      </div>

      <!-- ── Dashboard tab ─────────────────────────────────────────────────── -->
      <div id="tabDashboard">

        <!-- Done banner (shown only when isDoneForToday) -->
        <div id="doneBanner" style="display:none;"
             class="alert bg-success/10 border border-success/20 text-success mb-4 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i data-lucide="check-circle-2" class="w-5 h-5 shrink-0"></i>
            <span id="doneBannerText" class="text-sm font-medium"></span>
          </div>
          <button onclick="document.getElementById('doneBanner').style.display='none'"
                  class="btn btn-xs btn-ghost btn-circle ml-2 shrink-0">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </div>

        <!-- Stats bar: Gedaan first, Achterstallig last -->
        <div id="statsBar" class="stats shadow w-full mb-5">
          <div class="stat place-items-center">
            <div class="stat-title">Gedaan vandaag</div>
            <div class="stat-value text-2xl text-success" id="statCompletedToday">—</div>
            <div class="stat-desc" id="volumeBadge" style="display:none;"></div>
          </div>
          <div class="stat place-items-center">
            <div class="stat-title">Te doen</div>
            <div class="stat-value text-2xl" id="statRemainingToday">—</div>
          </div>
          <div class="stat place-items-center">
            <div class="stat-title">Wins (week)</div>
            <div class="stat-value text-2xl text-success" id="statWins">—</div>
          </div>
          <div class="stat place-items-center">
            <div class="stat-title">Achterstallig</div>
            <div class="stat-value text-2xl" id="statOverdue">—</div>
          </div>
        </div>

        <!-- Activity type cards -->
        <div id="dashboardCards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="flex justify-center items-center py-16 col-span-full">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </div>

      </div>

      <!-- ── Card detail modal ────────────────────────────────────────────── -->
      <dialog id="cardDetailModal" class="modal">
        <div class="modal-box max-w-2xl">
          <div class="flex items-center justify-between mb-1">
            <h3 class="font-bold text-lg" id="cardDetailTitle"></h3>
            <form method="dialog"><button class="btn btn-sm btn-circle btn-ghost"><i data-lucide="x" class="w-4 h-4"></i></button></form>
          </div>
          <div id="cardDetailCounts" class="flex flex-wrap gap-1.5 mb-4"></div>
          <div id="cardDetailContent" class="max-h-[32rem] overflow-y-auto space-y-1 pr-1"></div>
          <div class="modal-action border-t border-base-300 pt-3 mt-4">
            <button id="cardDetailExportBtn" type="button"
               class="btn btn-sm btn-ghost gap-1.5 text-base-content/60 hover:text-base-content">
              <i data-lucide="sheet" class="w-3.5 h-3.5"></i>Exporteer naar Sheets
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button></button></form>
      </dialog>
      <div id="tabCalendar" style="display:none;">
        <div class="grid grid-cols-12 gap-6">

          <!-- Calendar column (left 7) -->
          <div class="col-span-12 lg:col-span-7">
            <div class="card bg-base-100 shadow-xl">
              <div class="card-body p-4 relative min-h-[32rem]">

                <!-- Loading skeleton -->
                <div id="calendarLoadingState">
                  <div class="flex items-center gap-2 mb-4">
                    <span class="loading loading-dots loading-sm text-primary"></span>
                    <span class="text-sm text-base-content/60">Kalender laden…</span>
                  </div>
                  <div class="grid grid-cols-7 gap-1 mb-1">
                    <div class="skeleton h-5 rounded"></div><div class="skeleton h-5 rounded"></div><div class="skeleton h-5 rounded"></div><div class="skeleton h-5 rounded"></div><div class="skeleton h-5 rounded"></div><div class="skeleton h-5 rounded"></div><div class="skeleton h-5 rounded"></div>
                  </div>
                  <div class="grid grid-cols-7 gap-1 mb-1">
                    <div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div>
                  </div>
                  <div class="grid grid-cols-7 gap-1 mb-1">
                    <div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div>
                  </div>
                  <div class="grid grid-cols-7 gap-1 mb-1">
                    <div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div>
                  </div>
                  <div class="grid grid-cols-7 gap-1">
                    <div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div><div class="skeleton h-16 rounded"></div>
                  </div>
                </div>

                <!-- Calendar mount point -->
                <div id="fullcalendar" style="display:none;"></div>
              </div>

              <!-- Model filter chips -->
              <div class="border-t border-base-300 px-4 py-3">
                <div id="filterChipsWrap" class="flex flex-wrap items-center gap-2">
                  <span class="text-xs text-base-content/40">Laden…</span>
                </div>
              </div>
            </div>

            <!-- No-deadline section (collapsible) -->
            <div id="noDeadlineSection" class="mt-4" style="display:none;">
              <details class="collapse collapse-arrow bg-base-100 shadow-sm">
                <summary class="collapse-title text-xs font-bold uppercase tracking-wider text-base-content/50 min-h-10 py-3">
                  <span class="flex items-center gap-2">
                    <i data-lucide="clock" class="w-4 h-4"></i>
                    Geen deadline
                    <span id="noDeadlineBadge" class="badge badge-sm badge-ghost">0</span>
                  </span>
                </summary>
                <div class="collapse-content pt-1">
                  <div id="noDeadlineList"></div>
                </div>
              </details>
            </div>
          </div>

          <!-- Detail panel column (right 5) -->
          <div class="col-span-12 lg:col-span-5">
            <div class="card bg-base-100 shadow-xl sticky top-4">
              <div class="card-body">
                <!-- Empty state -->
                <div id="panel-empty-state" class="text-center py-16">
                  <i data-lucide="mouse-pointer-click" class="w-12 h-12 mx-auto text-base-content/20 mb-3"></i>
                  <p class="text-base-content/50 text-sm">Klik op een dag om de taken te bekijken</p>
                </div>
                <!-- Content -->
                <div id="panel-content" class="hidden"></div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ── Wins tab ─────────────────────────────────────────────────────── -->
      <div id="tabWins" style="display:none;">
        <div id="winsContent">
          <div class="flex justify-center py-16">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>

      <!-- ── Team tab (manager only) ──────────────────────────────────────── -->
      ${teamPanel}

    </div>
  </div>

  <script>
    // ── Helpers ──────────────────────────────────────────────────────────────
    function escHtml(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function stripHtml(html) {
      if (!html) return '';
      return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function urgencyClass(deadline) {
      if (!deadline) return 'urgency-none';
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var tomorrow = new Date(today.getTime() + 86400000);
      var d = new Date(deadline + 'T00:00:00');
      if (d < today) return 'urgency-overdue';
      if (d < tomorrow) return 'urgency-today';
      return 'urgency-upcoming';
    }

    var MODEL_META = {
      'crm.lead':        { label: 'CRM Lead',      badgeClass: 'badge-primary'   },
      'sale.order':      { label: 'Verkooporder',  badgeClass: 'badge-secondary' },
      'res.partner':     { label: 'Contact',        badgeClass: 'badge-accent'    },
      'account.move':    { label: 'Factuur',        badgeClass: 'badge-warning'   },
      'helpdesk.ticket': { label: 'Ticket',         badgeClass: 'badge-info'      },
      'project.task':    { label: 'Taak',           badgeClass: 'badge-success'   }
    };

    function modelBadge(model) {
      var meta  = MODEL_META[model];
      var label = meta ? meta.label : escHtml(model || '—');
      var cls   = meta ? meta.badgeClass : 'badge-neutral';
      return '<span class="badge badge-sm ' + cls + '">' + label + '</span>';
    }

    function priorityBadge(w) {
      if (!w || w <= 0) return '';
      return '<span class="badge badge-xs badge-neutral ml-1">P' + escHtml(String(w)) + '</span>';
    }

    // ── App state ─────────────────────────────────────────────────────────────
    var allActivities      = [];
    var completedTodayData = [];
    var winsData           = [];
    var mappingsData       = [];
    var excludedModels     = [];
    var selectedDate       = null;
    var calInst            = null;
    var winsRendered       = false;
    var teamLoaded         = false;
    var dashboardRendered  = false;
    var dataReady          = false;
    var calendarPendingInit = false;
    var odooUid            = null;
    var odooBaseUrl        = 'https://mymmo.odoo.com';
    var cardUrls           = {};
    var cardMappings       = {};
    var perTypeData        = {};
    var isTeamViewData     = false;
    var sparklineData      = {}; // keyed by odoo_activity_type_id string → [{date, completed, remaining}]
    var _modalExportData   = { typeName: '', rows: [] }; // for CSV export from modal

    // Restore model exclusions from localStorage
    try {
      var _pbSaved = localStorage.getItem('pb_excluded_models');
      if (_pbSaved) excludedModels = JSON.parse(_pbSaved);
    } catch (_) {}

    // ── Tab switching ─────────────────────────────────────────────────────────
    function switchTab(tab) {
      var ids = ['dashboard', 'calendar', 'wins', 'team'];
      for (var i = 0; i < ids.length; i++) {
        var t   = ids[i];
        var cap = t.charAt(0).toUpperCase() + t.slice(1);
        var panel = document.getElementById('tab' + cap);
        var btn   = document.getElementById('tabBtn' + cap);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
        if (btn)   btn.classList[t === tab ? 'add' : 'remove']('tab-active');
      }
      if (tab === 'dashboard') renderDashboard();
      if (tab === 'calendar') {
        if (dataReady && !calInst) {
          initCalendar();
          refreshCalendarEvents();
          buildFilterChips();
          renderNoDeadline();
        } else if (!dataReady) {
          calendarPendingInit = true;
        }
      }
      if (tab === 'wins') renderWins();
      if (tab === 'team') loadTeam();
    }

    // ── Calendar ──────────────────────────────────────────────────────────────
    function getTodayStr() {
      return new Date().toISOString().split('T')[0];
    }

    function getFilteredActivities() {
      return allActivities.filter(function(a) {
        return excludedModels.indexOf(a.res_model) === -1;
      });
    }

    function buildCalendarEvents(activities) {
      var td = getTodayStr();
      var byDate = {};
      for (var i = 0; i < activities.length; i++) {
        var a = activities[i];
        if (!a.date_deadline) continue;
        byDate[a.date_deadline] = (byDate[a.date_deadline] || 0) + 1;
      }
      var events = [];
      var dates = Object.keys(byDate);
      for (var j = 0; j < dates.length; j++) {
        var date  = dates[j];
        var count = byDate[date];
        var isOv  = date < td;
        var isTd  = date === td;
        var bg = isOv ? 'oklch(var(--er))' : isTd ? 'oklch(var(--wa))' : 'oklch(var(--in))';
        events.push({
          id: 'day-' + date,
          title: String(count),
          start: date,
          allDay: true,
          backgroundColor: bg,
          textColor: 'oklch(var(--b1))',
          borderColor: 'transparent',
          extendedProps: { count: count }
        });
      }
      return events;
    }

    function initCalendar() {
      var el = document.getElementById('fullcalendar');
      if (!el || !window.FullCalendar) return;

      calInst = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        locale: 'nl',
        firstDay: 1,
        height: 'auto',
        fixedWeekCount: false,
        dayMaxEvents: 1,
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: ''
        },
        buttonText: { today: 'Vandaag' },
        eventContent: function(renderProps) {
          var count = renderProps.event.extendedProps.count || 0;
          var label = count === 1 ? 'taak' : 'taken';
          return {
            html: '<div style="text-align:center; line-height:1.2; padding:0.125rem 0;">'
              + '<span style="font-size:1rem; font-weight:700; display:block;">' + count + '</span>'
              + '<span style="font-size:0.5625rem; text-transform:uppercase; letter-spacing:0.04em; opacity:0.9; display:block;">' + label + '</span>'
              + '</div>'
          };
        },
        dateClick: function(info) {
          highlightDay(info.dateStr);
          showTasksForDate(info.dateStr);
        },
        eventClick: function(info) {
          info.jsEvent.preventDefault();
          highlightDay(info.event.startStr);
          showTasksForDate(info.event.startStr);
        }
      });

      calInst.render();

      var loadEl = document.getElementById('calendarLoadingState');
      if (loadEl) loadEl.style.display = 'none';
      el.style.display = '';
    }

    function highlightDay(dateStr) {
      var prev = document.querySelector('.fc-day-selected');
      if (prev) prev.classList.remove('fc-day-selected');
      var cell = document.querySelector('[data-date="' + dateStr + '"]');
      if (cell) cell.classList.add('fc-day-selected');
    }

    function refreshCalendarEvents() {
      if (!calInst) return;
      var events = buildCalendarEvents(getFilteredActivities());
      calInst.removeAllEvents();
      calInst.addEventSource(events);
    }

    // ── Detail panel ──────────────────────────────────────────────────────────
    function showTasksForDate(dateStr) {
      selectedDate = dateStr;
      var filtered  = getFilteredActivities();
      var acts      = filtered.filter(function(a) { return a.date_deadline === dateStr; });
      var emptyEl   = document.getElementById('panel-empty-state');
      var contentEl = document.getElementById('panel-content');
      if (!emptyEl || !contentEl) return;

      var d         = new Date(dateStr + 'T00:00:00');
      var dateLabel = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      var td        = getTodayStr();
      var isOv      = dateStr < td;
      var isTd      = dateStr === td;
      var hdCls     = isOv ? 'text-error' : isTd ? 'text-warning' : 'text-info';

      var html = '<div class="flex items-center justify-between mb-3">'
        + '<h3 class="font-semibold capitalize ' + hdCls + '">' + escHtml(dateLabel) + '</h3>'
        + '<span class="badge badge-sm badge-ghost">' + acts.length + (acts.length === 1 ? ' taak' : ' taken') + '</span>'
        + '</div>';

      if (acts.length === 0) {
        html += '<div class="text-center py-10 text-base-content/50">'
          + '<i data-lucide="check-circle-2" class="w-10 h-10 mx-auto mb-2 text-success"></i>'
          + '<p class="text-sm">Geen taken op deze dag</p>'
          + '</div>';
      } else {
        for (var i = 0; i < acts.length; i++) {
          html += buildPanelCard(acts[i]);
        }
      }

      contentEl.innerHTML = html;
      emptyEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
      lucide.createIcons();
    }

    function buildPanelCard(a) {
      var recordName  = escHtml(a.res_name || '—');
      var actType     = escHtml(a.activity_type_name || '');
      var noteRaw     = stripHtml(a.note || '');
      var summaryTxt  = escHtml(a.summary || '');
      var pwHtml      = priorityBadge(a.priority_weight);
      var uc          = urgencyClass(a.date_deadline);

      var summaryHtml = summaryTxt
        ? '<p class="text-xs font-medium text-base-content/80 mt-0.5">' + summaryTxt + '</p>'
        : '';
      var noteHtml = noteRaw
        ? '<p class="text-xs text-base-content/55 mt-1 leading-relaxed">' + escHtml(noteRaw) + '</p>'
        : '';
      var excludeBtn = '<button class="btn btn-ghost btn-xs text-base-content/25 hover:text-error shrink-0 mt-0.5" '
        + 'onclick="toggleExcludeModel(&quot;' + escHtml(a.res_model || '') + '&quot;)" '
        + 'title="Model verbergen">'
        + '<i data-lucide="eye-off" class="w-3 h-3"></i>'
        + '</button>';

      return '<div class="card bg-base-200 mb-2 ' + uc + '">'
        + '<div class="card-body py-2.5 px-3">'
        + '<div class="flex items-start gap-2">'
        + '<div class="flex-1 min-w-0">'
        + '<div class="flex flex-wrap items-center gap-1 mb-0.5">'
        + modelBadge(a.res_model) + ' '
        + '<span class="text-xs text-base-content/60">' + actType + '</span>'
        + pwHtml
        + '</div>'
        + '<p class="font-semibold text-sm leading-snug">' + recordName + '</p>'
        + summaryHtml
        + noteHtml
        + '</div>'
        + excludeBtn
        + '</div>'
        + '</div></div>';
    }

    // ── Model exclusion ────────────────────────────────────────────────────────
    function toggleExcludeModel(model) {
      var idx = excludedModels.indexOf(model);
      if (idx === -1) {
        excludedModels.push(model);
      } else {
        excludedModels.splice(idx, 1);
      }
      try { localStorage.setItem('pb_excluded_models', JSON.stringify(excludedModels)); } catch (_) {}
      buildFilterChips();
      refreshCalendarEvents();
      renderNoDeadline();
      if (selectedDate) showTasksForDate(selectedDate);
    }

    function buildFilterChips() {
      var wrap = document.getElementById('filterChipsWrap');
      if (!wrap) return;

      var seenModels = {};
      for (var i = 0; i < allActivities.length; i++) {
        if (allActivities[i].res_model) seenModels[allActivities[i].res_model] = true;
      }
      var models = Object.keys(seenModels);
      if (!models.length) { wrap.innerHTML = ''; return; }

      var html = '<span class="text-xs text-base-content/50 font-medium">Toon:</span>';
      for (var j = 0; j < models.length; j++) {
        var model  = models[j];
        var meta   = MODEL_META[model];
        var label  = meta ? meta.label : escHtml(model);
        var isEx   = excludedModels.indexOf(model) !== -1;
        var btnCls = isEx ? 'btn-ghost opacity-40' : 'btn-outline';
        html += '<button class="btn btn-xs ' + btnCls + '" onclick="toggleExcludeModel(&quot;' + escHtml(model) + '&quot;)">'
          + label + '</button>';
      }
      wrap.innerHTML = html;
    }

    // ── No-deadline section ────────────────────────────────────────────────────
    function buildActivityCard(a) {
      var uc         = urgencyClass(a.date_deadline);
      var recordName = escHtml(a.res_name || '—');
      var actType    = escHtml(a.activity_type_name || '');
      var pwHtml     = priorityBadge(a.priority_weight);
      return '<div class="card bg-base-100 shadow-sm mb-2 ' + uc + '">'
        + '<div class="card-body py-2 px-3">'
        + '<div class="flex flex-wrap items-center gap-1 mb-0.5">'
        + modelBadge(a.res_model) + ' '
        + '<span class="text-xs text-base-content/60">' + actType + '</span>'
        + pwHtml
        + '</div>'
        + '<p class="text-sm font-medium leading-snug">' + recordName + '</p>'
        + '</div></div>';
    }

    function renderNoDeadline() {
      var noDate  = getFilteredActivities().filter(function(a) { return !a.date_deadline; });
      var section = document.getElementById('noDeadlineSection');
      var badgeEl = document.getElementById('noDeadlineBadge');
      var listEl  = document.getElementById('noDeadlineList');
      if (!section) return;

      if (!noDate.length) { section.style.display = 'none'; return; }

      if (badgeEl) badgeEl.textContent = String(noDate.length);
      var html = '';
      for (var i = 0; i < noDate.length; i++) html += buildActivityCard(noDate[i]);
      if (listEl) { listEl.innerHTML = html; lucide.createIcons(); }
      section.style.display = '';
    }

    // ── Dashboard cards ───────────────────────────────────────────────────────
    function renderDashboard() {
      if (dashboardRendered) return;
      dashboardRendered = true;

      var container = document.getElementById('dashboardCards');
      if (!container) return;

      // Only cards with show_on_dashboard (treat null/undefined as true — same as settings badge behaviour)
      var visibleMappings = mappingsData.filter(function(m) { return m.show_on_dashboard !== false; });

      // Sort: danger(0) → normal(1) → done(2) → idle(3); within group: most remaining first
      function cardPriority(m) {
        var tid = String(m.odoo_activity_type_id);
        var pt  = perTypeData[tid] || {};
        var ov  = pt.overdue    || 0;
        var td  = pt.dueToday   || 0;
        var co  = pt.completedToday || 0;
        var rem = ov + td;
        var thOv = m.danger_threshold_overdue != null ? m.danger_threshold_overdue : 1;
        var thTd = m.danger_threshold_today   != null ? m.danger_threshold_today   : 3;
        if (rem === 0 && co === 0)              return 3; // idle
        if (rem === 0 && co > 0)               return 2; // done
        if (ov >= thOv || td >= thTd)          return 0; // danger
        return 1;                                         // normal
      }
      visibleMappings.sort(function(a, b) {
        var pa = cardPriority(a), pb = cardPriority(b);
        if (pa !== pb) return pa - pb;
        var remA = (perTypeData[String(a.odoo_activity_type_id)] || {});
        var remB = (perTypeData[String(b.odoo_activity_type_id)] || {});
        return ((remB.overdue || 0) + (remB.dueToday || 0)) - ((remA.overdue || 0) + (remA.dueToday || 0));
      });

      if (!visibleMappings.length) {
        container.innerHTML = '<div class="text-center py-16 col-span-full text-base-content/50">'
          + '<i data-lucide="layout-dashboard" class="w-10 h-10 mx-auto mb-2"></i>'
          + '<p class="text-sm">Geen dashboard kaarten geconfigureerd.</p>'
          + '<p class="text-xs mt-1">Zet &quot;Dashboard kaart&quot; aan in de instellingen.</p>'
          + '</div>';
        lucide.createIcons();
        return;
      }

      var html = '';

      if (!isTeamViewData) {
        // Individual view: group by section only when both personal AND team sources exist
        var hasPersonalSrc = visibleMappings.some(function(m) { return m._source === 'personal'; });
        var hasTeamSrc     = visibleMappings.some(function(m) { return m._source === 'team'; });
        var showSections   = hasPersonalSrc && hasTeamSrc;

        if (showSections) {
          // Build ordered section list preserving sort order within each section
          var sectionOrder = [];
          var sectionMap   = {};
          for (var ci = 0; ci < visibleMappings.length; ci++) {
            var m   = visibleMappings[ci];
            var key = m._source === 'personal' ? '__personal__' : ('team:' + (m._team_name || ''));
            if (!sectionMap[key]) {
              sectionMap[key] = [];
              sectionOrder.push(key);
            }
            sectionMap[key].push(ci);
          }

          var globalIdx = 0; // track cardUrls index across sections
          for (var si = 0; si < sectionOrder.length; si++) {
            var skey     = sectionOrder[si];
            var isPersonalSection = skey === '__personal__';
            var sLabel   = isPersonalSection ? 'Persoonlijk' : skey.slice(5); // remove 'team:'
            html += '<div class="col-span-full ' + (si > 0 ? 'mt-4' : '') + '">'
              + '<p class="text-xs font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-1.5">'
              + (isPersonalSection
                  ? '<i data-lucide="user" class="w-3 h-3"></i>'
                  : '<i data-lucide="users" class="w-3 h-3"></i>')
              + escHtml(sLabel)
              + '</p>'
              + '</div>';
            var indices = sectionMap[skey];
            for (var ii = 0; ii < indices.length; ii++) {
              var mapping   = visibleMappings[indices[ii]];
              var tid       = String(mapping.odoo_activity_type_id);
              var pt        = computePtForMapping(mapping);
              var typeIntId = mapping.odoo_activity_type_id;
              cardUrls[globalIdx] = {
                all:       buildOdooUrl(typeIntId, 'all'),
                overdue:   buildOdooUrl(typeIntId, 'overdue'),
                today:     buildOdooUrl(typeIntId, 'today'),
                completed: buildOdooUrl(typeIntId, 'completed'),
              };
              cardMappings[globalIdx] = mapping;
              html += buildTypeCard(escHtml(mapping.odoo_activity_type_name), pt, mapping, globalIdx, computeLeaderboard(mapping));
              globalIdx++;
            }
          }
        } else {
          // Single source (team-only or global fallback): flat grid, same as team view
          for (var ci = 0; ci < visibleMappings.length; ci++) {
            var mapping   = visibleMappings[ci];
            var tid       = String(mapping.odoo_activity_type_id);
            var pt        = computePtForMapping(mapping);
            var typeIntId = mapping.odoo_activity_type_id;
            cardUrls[ci] = {
              all:       buildOdooUrl(typeIntId, 'all'),
              overdue:   buildOdooUrl(typeIntId, 'overdue'),
              today:     buildOdooUrl(typeIntId, 'today'),
              completed: buildOdooUrl(typeIntId, 'completed'),
            };
            cardMappings[ci] = mapping;
            html += buildTypeCard(escHtml(mapping.odoo_activity_type_name), pt, mapping, ci, computeLeaderboard(mapping));
          }
        }
      } else {
        // Team view: flat grid (cumulative)
        for (var ci = 0; ci < visibleMappings.length; ci++) {
          var mapping   = visibleMappings[ci];
          var tid       = String(mapping.odoo_activity_type_id);
          var pt        = computePtForMapping(mapping);
          var typeIntId = mapping.odoo_activity_type_id;
          cardUrls[ci] = {
            all:       buildOdooUrl(typeIntId, 'all'),
            overdue:   buildOdooUrl(typeIntId, 'overdue'),
            today:     buildOdooUrl(typeIntId, 'today'),
            completed: buildOdooUrl(typeIntId, 'completed'),
          };
          cardMappings[ci] = mapping;
          html += buildTypeCard(escHtml(mapping.odoo_activity_type_name), pt, mapping, ci, computeLeaderboard(mapping));
        }
      }

      container.innerHTML = html;
      lucide.createIcons();
      animateBars();
    }

    function buildOdooUrl(typeId, filter) {
      if (!odooUid || !odooBaseUrl) return '#';
      var today  = new Date().toISOString().slice(0, 10);
      var domain = [['activity_type_id', '=', typeId], ['user_id', '=', odooUid]];
      if      (filter === 'overdue')   domain.push(['date_deadline', '<', today]);
      else if (filter === 'today')     domain.push(['date_deadline', '=', today]);
      else if (filter === 'open')      domain.push(['date_deadline', '>', today]);
      else if (filter === 'completed') domain.push(['active', '=', false], ['date_done', '=', today]);
      return odooBaseUrl + '/web#model=mail.activity&view_type=list&domain=' + encodeURIComponent(JSON.stringify(domain));
    }

    // Pretty-print Odoo model names
    function _fmtModel(m) {
      var map = {
        'crm.lead': 'Lead', 'sale.order': 'Offerte', 'sale.order.line': 'Offerteregel',
        'account.move': 'Factuur', 'project.task': 'Taak', 'project.project': 'Project',
        'res.partner': 'Contact', 'helpdesk.ticket': 'Ticket', 'purchase.order': 'Inkoop',
        'stock.picking': 'Levering', 'mrp.production': 'Productie',
      };
      return map[m] || m;
    }

    function openPbCard(idx, filter, evt) {
      if (evt) evt.stopPropagation();
      var mapping = cardMappings[idx];
      if (!mapping) return;

      var typeId   = mapping.odoo_activity_type_id;
      var typeName = mapping.odoo_activity_type_name;
      var _mf      = mapping.card_model_filter;

      // Fix: activity_type_id from Odoo is [id, name] array; also apply card_model_filter
      function matchType(a) {
        var tid = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
        if (tid !== typeId) return false;
        if (_mf && _mf.length && _mf.indexOf(a.res_model) === -1) return false;
        return true;
      }

      // Bucket by a.state (fetched from Odoo, no date math)
      var openForType = allActivities.filter(matchType);
      var doneForType = completedTodayData.filter(matchType);
      var overdue     = openForType.filter(function(a) { return a.state === 'overdue'; });
      var dueToday    = openForType.filter(function(a) { return a.state === 'today'; });
      var future      = openForType.filter(function(a) { return a.state === 'planned' || (!a.state && a.state !== 'overdue' && a.state !== 'today'); });

      // Determine which sections to show
      var showOverdue   = !filter || filter === 'all' || filter === 'overdue';
      var showToday     = !filter || filter === 'all' || filter === 'today';
      var showFuture    = !filter || filter === 'all';
      var showCompleted = !filter || filter === 'all' || filter === 'completed';

      // Count badges
      var _pb = 'inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] font-semibold';
      var countHtml = '';
      if (overdue.length)     countHtml += '<span class="' + _pb + ' bg-error/15 text-error">'     + overdue.length     + '\u00a0achterstallig</span>';
      if (dueToday.length)    countHtml += '<span class="' + _pb + ' bg-warning/15 text-warning">'  + dueToday.length    + '\u00a0vandaag</span>';
      if (future.length)      countHtml += '<span class="' + _pb + ' bg-info/15 text-info">'        + future.length      + '\u00a0gepland</span>';
      if (doneForType.length) countHtml += '<span class="' + _pb + ' bg-success/15 text-success">'  + doneForType.length + '\u00a0gedaan</span>';
      if (!countHtml) countHtml = '<span class="text-xs text-base-content/40">Geen taken gevonden</span>';

      function buildRow(a, rowType) {
        var stateColor = rowType === 'done' ? 'border-success/50'
          : a.state === 'overdue'  ? 'border-error'
          : a.state === 'today'    ? 'border-warning'
          : 'border-info';
        var userName = Array.isArray(a.user_id) ? a.user_id[1] : '';
        var dateStr  = rowType === 'done'
          ? (a.date_done     ? new Date(a.date_done     + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '')
          : (a.date_deadline ? new Date(a.date_deadline + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '\u2014');
        var modelBadge = a.res_model
          ? '<span class="text-[0.6rem] px-1.5 py-0.5 rounded bg-base-300 text-base-content/50 shrink-0">' + escHtml(_fmtModel(a.res_model)) + '</span>'
          : '';
        return '<div class="rounded-lg bg-base-200/60 px-3 py-2 border-l-2 ' + stateColor + '">' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium leading-snug truncate">' + escHtml(a.res_name || '\u2014') + '</p>' +
              (a.summary ? '<p class="text-xs text-base-content/55 mt-0.5 truncate">' + escHtml(a.summary) + '</p>' : '') +
            '</div>' +
            '<div class="flex flex-col items-end gap-0.5 shrink-0">' +
              '<span class="text-xs text-base-content/40">' + escHtml(dateStr) + '</span>' +
              (userName ? '<span class="text-[0.65rem] text-base-content/35 leading-none">' + escHtml(userName) + '</span>' : '') +
            '</div>' +
          '</div>' +
          (modelBadge ? '<div class="mt-1">' + modelBadge + '</div>' : '') +
          '</div>';
      }

      var html = '';
      function section(label, items, type) {
        if (!items.length) return '';
        return '<p class="text-[0.6rem] font-bold uppercase tracking-widest text-base-content/40 mt-3 mb-1.5">' + label + '</p>' +
          items.map(function(a) { return buildRow(a, type); }).join('');
      }

      if (showOverdue)   html += section('Achterstallig (' + overdue.length   + ')', overdue,   'open');
      if (showToday)     html += section('Vandaag ('      + dueToday.length   + ')', dueToday,  'open');
      if (showFuture)    html += section('Gepland ('      + future.length     + ')', future,    'open');
      if (showCompleted) html += section('Gedaan vandaag (' + doneForType.length + ')', doneForType, 'done');
      if (!html) html = '<div class="text-center py-8 text-base-content/40 text-sm">Geen taken in deze categorie</div>';

      // Collect all currently visible activities for export
      var _exportRows = [];
      function collectForExport(items, statusLabel) {
        items.forEach(function(a) {
          _exportRows.push([
            typeName,
            a.res_name   || '',
            _fmtModel(a.res_model || ''),
            a.summary    || '',
            statusLabel,
            a.date_deadline || '',
            a.date_done     || '',
            Array.isArray(a.user_id) ? a.user_id[1] : '',
          ]);
        });
      }
      if (showOverdue)   collectForExport(overdue,   'Achterstallig');
      if (showToday)     collectForExport(dueToday,  'Vandaag');
      if (showFuture)    collectForExport(future,    'Gepland');
      if (showCompleted) collectForExport(doneForType, 'Gedaan vandaag');
      _modalExportData = { typeName: typeName, rows: _exportRows };

      // Populate modal
      var titleEl   = document.getElementById('cardDetailTitle');
      var countsEl  = document.getElementById('cardDetailCounts');
      var contentEl = document.getElementById('cardDetailContent');
      if (!titleEl || !countsEl || !contentEl) return;

      titleEl.textContent = typeName;
      countsEl.innerHTML  = countHtml;
      contentEl.innerHTML = html;

      // Wire export button
      var exportBtn = document.getElementById('cardDetailExportBtn');
      if (exportBtn) {
        exportBtn.onclick = function() {
          var header = ['Type', 'Record', 'Model', 'Samenvatting', 'Status', 'Deadline', 'Gedaan op', 'Medewerker'];
          var csvRows = [header].concat(_modalExportData.rows);
          var _nl = String.fromCharCode(10);
          var csv = csvRows.map(function(row) {
            return row.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
          }).join(_nl);
          var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
          var url  = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href     = url;
          link.download = 'activiteiten-' + _modalExportData.typeName.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.csv';
          link.click();
          URL.revokeObjectURL(url);
        };
      }

      var dlg = document.getElementById('cardDetailModal');
      if (dlg) { dlg.showModal(); lucide.createIcons(); }
    }

    // ── Sparkline (SVG area chart — no library needed) ────────────────────────
    function buildSparklineSvg(odooTypeId, colorName) {
      var W = 200, H = 42, pad = 2;
      var history = sparklineData[String(odooTypeId)] || [];
      if (history.length === 0) {
        return '<div class="mt-2 h-10 flex items-center">'
          + '<span class="text-[0.6rem] text-base-content/20 italic">Nog geen historische data</span>'
          + '</div>';
      }
      var colorCls = 'text-' + (colorName || 'primary');
      if (history.length === 1) {
        var v1 = history[0].completed || 0;
        var barH = Math.max(6, Math.min(H - 4, v1 * 5));
        return '<div class="mt-2 flex items-end h-10 ' + colorCls + '" title="' + v1 + ' voltooid">'
          + '<div class="w-full rounded-sm" style="background:currentColor;opacity:0.5;height:' + barH + 'px"></div>'
          + '</div>';
      }
      var values = history.map(function(h) { return h.completed || 0; });
      var maxV = Math.max.apply(null, values);
      if (maxV === 0) maxV = 1;
      var points = values.map(function(v, i) {
        var x = pad + (i / (values.length - 1)) * (W - 2 * pad);
        var y = (H - pad) - (v / maxV) * (H - 2 * pad - 2);
        return [x, y];
      });
      var linePath = points.map(function(p, i) {
        return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }).join(' ');
      var areaPath = linePath
        + ' L' + points[points.length - 1][0].toFixed(1) + ',' + (H - pad).toFixed(1)
        + ' L' + points[0][0].toFixed(1) + ',' + (H - pad).toFixed(1)
        + ' Z';
      return '<div class="mt-2 -mx-1 ' + colorCls + '" onclick="event.stopPropagation()" title="Voltooide taken afgelopen 14 dagen">'
        + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-10" preserveAspectRatio="none">'
        + '<path d="' + areaPath + '" fill="currentColor" opacity="0.15" />'
        + '<path d="' + linePath + '" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />'
        + '</svg></div>';
    }

    function computePtForMapping(mapping) {
      var tid = String(mapping.odoo_activity_type_id);
      var mf  = mapping.card_model_filter;
      if (!mf || !mf.length) {
        return perTypeData[tid] || { overdue: 0, dueToday: 0, future: 0, completedToday: 0 };
      }
      var pt = { overdue: 0, dueToday: 0, future: 0, completedToday: 0 };
      for (var i = 0; i < allActivities.length; i++) {
        var a = allActivities[i];
        var atid = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
        if (String(atid) !== tid || mf.indexOf(a.res_model) === -1) continue;
        if      (a.state === 'overdue') pt.overdue++;
        else if (a.state === 'today')   pt.dueToday++;
        else                            pt.future++;
      }
      for (var j = 0; j < completedTodayData.length; j++) {
        var ca = completedTodayData[j];
        var catid = Array.isArray(ca.activity_type_id) ? ca.activity_type_id[0] : ca.activity_type_id;
        if (String(catid) === tid && mf.indexOf(ca.res_model) !== -1) pt.completedToday++;
      }
      return pt;
    }

    function computeLeaderboard(mapping) {
      var tid = String(mapping.odoo_activity_type_id);
      var mf  = mapping.card_model_filter;
      var users = {};
      for (var i = 0; i < allActivities.length; i++) {
        var a = allActivities[i];
        var atid = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
        if (String(atid) !== tid) continue;
        if (mf && mf.length && mf.indexOf(a.res_model) === -1) continue;
        var uid   = Array.isArray(a.user_id) ? a.user_id[0] : a.user_id;
        var uname = Array.isArray(a.user_id) ? a.user_id[1] : String(uid);
        if (!users[uid]) users[uid] = { id: uid, name: uname, open: 0, done: 0 };
        users[uid].open++;
      }
      for (var j = 0; j < completedTodayData.length; j++) {
        var ca = completedTodayData[j];
        var catid = Array.isArray(ca.activity_type_id) ? ca.activity_type_id[0] : ca.activity_type_id;
        if (String(catid) !== tid) continue;
        if (mf && mf.length && mf.indexOf(ca.res_model) === -1) continue;
        var cuid   = Array.isArray(ca.user_id) ? ca.user_id[0] : ca.user_id;
        var cuname = Array.isArray(ca.user_id) ? ca.user_id[1] : String(cuid);
        if (!users[cuid]) users[cuid] = { id: cuid, name: cuname, open: 0, done: 0 };
        users[cuid].done++;
      }
      var result = [];
      var ukeys = Object.keys(users);
      for (var k = 0; k < ukeys.length; k++) {
        var u = users[ukeys[k]];
        var total = u.open + u.done;
        var pct   = total > 0 ? Math.round(100 * u.done / total) : 0;
        var badge = (u.open === 0 && u.done > 0) ? '\uD83C\uDFC6'
                  : (pct >= 50 && u.done > 0)    ? '\u26A1'
                  : (u.done >= 1)                 ? '\uD83C\uDF31'
                  : '';
        result.push({ id: ukeys[k], name: u.name, open: u.open, done: u.done, total: total, pct: pct, badge: badge });
      }
      result.sort(function(a, b) { return b.pct - a.pct || b.done - a.done; });
      return result;
    }

    function buildTypeCard(name, pt, mapping, cardIdx, leaderboard) {
      // ── Data ────────────────────────────────────────────────────────────────
      var overdueCnt   = pt.overdue        || 0;
      var dueTodayCnt  = pt.dueToday       || 0;
      var futureCnt    = pt.future         || 0;
      var completedCnt = pt.completedToday || 0;
      var remaining    = overdueCnt + dueTodayCnt;
      var total        = remaining + completedCnt;
      var cardTitle    = (mapping.card_title_override ? escHtml(mapping.card_title_override) : name);

      // ── Legacy thresholds (used as fallback when card_threshold_steps is absent) ──
      var thOv = mapping.danger_threshold_overdue != null ? mapping.danger_threshold_overdue : 1;
      var thTd = mapping.danger_threshold_today   != null ? mapping.danger_threshold_today   : 3;

      // ── Base state ─────────────────────────────────────────────────────────
      var isIdle = remaining === 0 && completedCnt === 0;
      var isDone = remaining === 0 && completedCnt > 0;

      // ── Resolve color ──────────────────────────────────────────────────────
      // idle → no tint | done → always success | active → use card_color_mode
      var resolvedColor; // DaisyUI color name or null
      if (isIdle) {
        resolvedColor = null;
      } else if (isDone) {
        resolvedColor = 'success';
      } else {
        var colorMode  = mapping.card_color_mode  || 'auto';
        var fixedColor = mapping.card_fixed_color || null;
        if (colorMode === 'fixed') {
          resolvedColor = fixedColor; // may be null → neutral/no tint
        } else {
          // auto: use threshold steps if present, else legacy thresholds
          var steps = mapping.card_threshold_steps;
          if (steps && steps.length > 0) {
            // sort steps highest-value-first; first match wins
            var sortedSteps = steps.slice().sort(function(a, b) { return b.value - a.value; });
            resolvedColor = null;
            for (var si = 0; si < sortedSteps.length; si++) {
              var step = sortedSteps[si];
              var fieldVal = step.field === 'overdue' ? overdueCnt
                           : step.field === 'today'   ? dueTodayCnt
                           : remaining; // 'remaining'
              if (fieldVal >= step.value) { resolvedColor = step.color; break; }
            }
          } else {
            // legacy fallback
            resolvedColor = (overdueCnt >= thOv || dueTodayCnt >= thTd) ? 'error' : null;
          }
        }
      }

      // ── Theme map ─────────────────────────────────────────────────────────
      var cardBg, cardBorder, numCls, barCls, statusHtml;
      if (isIdle) {
        cardBg = 'bg-base-100'; cardBorder = 'border border-base-200';
        numCls = 'text-base-content/25'; barCls = 'bg-base-300'; statusHtml = '';
      } else {
        var _cmap = {
          success:   ['bg-success/10',   'border border-success/30',   'text-success',   'bg-success'],
          error:     ['bg-error/10',     'border border-error/30',     'text-error',     'bg-error'],
          warning:   ['bg-warning/10',   'border border-warning/30',   'text-warning',   'bg-warning'],
          primary:   ['bg-primary/10',   'border border-primary/30',   'text-primary',   'bg-primary'],
          secondary: ['bg-secondary/10', 'border border-secondary/30', 'text-secondary', 'bg-secondary'],
          info:      ['bg-info/10',      'border border-info/30',      'text-info',      'bg-info'],
          accent:    ['bg-accent/10',    'border border-accent/30',    'text-accent',    'bg-accent'],
          neutral:   ['bg-neutral/10',   'border border-neutral/30',   'text-neutral',   'bg-neutral'],
        };
        var cv = (resolvedColor && _cmap[resolvedColor]) ? _cmap[resolvedColor] : null;
        if (cv) {
          cardBg = cv[0]; cardBorder = cv[1]; numCls = cv[2]; barCls = cv[3];
          if (resolvedColor === 'success') {
            statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-success shrink-0"><i data-lucide="check-circle-2" class="w-3 h-3 shrink-0"></i>Klaar</span>';
          } else if (resolvedColor === 'error') {
            statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-error shrink-0"><i data-lucide="alert-circle" class="w-3 h-3 shrink-0"></i>Aandacht</span>';
          } else if (resolvedColor === 'warning') {
            statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-warning shrink-0"><i data-lucide="alert-triangle" class="w-3 h-3 shrink-0"></i>Opgelet</span>';
          } else {
            statusHtml = '';
          }
        } else {
          cardBg = 'bg-base-100'; cardBorder = 'border border-base-200';
          numCls = 'text-base-content'; barCls = 'bg-primary'; statusHtml = '';
        }
      }

      // ── Progress ──────────────────────────────────────────────────────────
      var progressPct  = total > 0 ? Math.round(100 * completedCnt / total) : 0;
      var targetWidth  = progressPct + '%';
      var showProgress = total > 0;

      // ── Hero metric ───────────────────────────────────────────────────────
      var heroMode = mapping.card_hero_metric || 'auto';
      var bigEl, heroSublabel;
      if (isIdle) {
        // Idle always shows an em-dash regardless of setting
        bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">\u2014</span>';
        heroSublabel = futureCnt > 0 ? 'Niets voor vandaag gepland' : 'Geen open taken';
      } else if (heroMode === 'completed') {
        if (isDone) {
          bigEl        = '<i data-lucide="check-circle-2" class="w-10 h-10 ' + numCls + ' mb-0.5"></i>';
          heroSublabel = completedCnt + ' afgerond vandaag';
        } else {
          bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + completedCnt + '</span>';
          heroSublabel = 'afgerond vandaag';
        }
      } else if (heroMode === 'remaining') {
        bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + remaining + '</span>';
        heroSublabel = overdueCnt > 0 && dueTodayCnt > 0
          ? 'nog te gaan (w.v. ' + overdueCnt + ' ach.)'
          : 'nog te gaan';
      } else if (heroMode === 'overdue') {
        bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + overdueCnt + '</span>';
        heroSublabel = 'achterstallig';
      } else if (heroMode === 'today') {
        bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + dueTodayCnt + '</span>';
        heroSublabel = 'te doen vandaag';
      } else {
        // 'auto' — smart branch based on progress state
        if (isDone) {
          bigEl        = '<i data-lucide="check-circle-2" class="w-10 h-10 ' + numCls + ' mb-0.5"></i>';
          heroSublabel = completedCnt + ' afgerond vandaag';
        } else if (progressPct >= 50 && completedCnt > 0) {
          bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + remaining + '</span>';
          heroSublabel = 'nog te gaan';
        } else if (completedCnt > 0) {
          bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + completedCnt + '</span>';
          heroSublabel = 'afgerond vandaag';
        } else {
          bigEl        = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + remaining + '</span>';
          heroSublabel = overdueCnt > 0 && dueTodayCnt > 0
            ? 'waarvan ' + overdueCnt + ' achterstallig'
            : overdueCnt > 0 ? 'achterstallig' : 'te doen vandaag';
        }
      }

      // ── Guidance ──────────────────────────────────────────────────────────
      var guidanceLine = computeCardGuidance(overdueCnt, dueTodayCnt, completedCnt, progressPct, isDone, isIdle);

      // ── Pills ─────────────────────────────────────────────────────────────
      var pillsHtml = '';
      var compactPills = !!mapping.card_compact_pills;
      if (!isIdle) {
        var _pb = 'inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] cursor-pointer transition-opacity hover:opacity-80';
        if (compactPills) {
          // Compact: single "actief" pill (remaining) + gedaan pill
          var urgentPillCls = overdueCnt > 0
            ? _pb + ' bg-error/15 text-error font-semibold'
            : remaining > 0
              ? _pb + ' bg-warning/15 text-warning font-semibold'
              : _pb + ' bg-base-200/60 text-base-content/25 pointer-events-none';
          var donePillCls = completedCnt > 0
            ? _pb + ' bg-success/15 text-success font-medium'
            : _pb + ' bg-base-200/60 text-base-content/25 pointer-events-none';
          pillsHtml = '<div class="flex flex-wrap gap-1.5 mt-3">'
            + '<span class="' + urgentPillCls + '" onclick="openPbCard(' + cardIdx + ',&quot;overdue&quot;,event)">'
            + remaining + '\u00a0actief'
            + (overdueCnt > 0 ? '\u00a0<span class="opacity-60 text-[0.6rem]">(' + overdueCnt + '\u00a0ach.)</span>' : '')
            + '</span>'
            + '<span class="' + donePillCls + '" onclick="openPbCard(' + cardIdx + ',&quot;completed&quot;,event)">'
            + completedCnt + '\u00a0gedaan</span>'
            + '</div>';
        } else {
          // Standard: 3 separate pills
          var ovPillCls = overdueCnt > 0
            ? _pb + ' bg-error/15 text-error font-semibold'
            : _pb + ' bg-base-200/60 text-base-content/25 pointer-events-none';
          var tdPillCls = dueTodayCnt > 0
            ? _pb + ' bg-warning/15 text-warning font-semibold'
            : _pb + ' bg-base-200/60 text-base-content/25 pointer-events-none';
          var doCls = completedCnt > 0
            ? _pb + ' bg-success/15 text-success font-medium'
            : _pb + ' bg-base-200/60 text-base-content/25 pointer-events-none';
          pillsHtml = '<div class="flex flex-wrap gap-1.5 mt-3">'
            + '<span class="' + ovPillCls + '" onclick="openPbCard(' + cardIdx + ',&quot;overdue&quot;,event)">' + overdueCnt + '\u00a0achterstallig</span>'
            + '<span class="' + tdPillCls + '" onclick="openPbCard(' + cardIdx + ',&quot;today&quot;,event)">'   + dueTodayCnt + '\u00a0vandaag</span>'
            + '<span class="' + doCls     + '" onclick="openPbCard(' + cardIdx + ',&quot;completed&quot;,event)">' + completedCnt + '\u00a0gedaan</span>'
            + '</div>';
        }
      }

      // ── Future tasks line ─────────────────────────────────────────────────
      var futureLine = (!isDone && resolvedColor !== 'error' && futureCnt > 0)
        ? '<p class="text-[0.65rem] text-base-content/35 mt-2">Komende: ' + futureCnt + ' gepland</p>'
        : '';

      // ── Sparkline ─────────────────────────────────────────────────────────
      var sparkHtml = mapping.card_show_sparkline
        ? buildSparklineSvg(mapping.odoo_activity_type_id, resolvedColor || 'primary')
        : '';

      // ── Stagger animation ─────────────────────────────────────────────────
      var delay = (cardIdx * 50) + 'ms';

      // ── Leaderboard view ─────────────────────────────────────────────────
      if (mapping.card_view_mode === 'leaderboard') {
        var lb     = leaderboard || [];
        var lbRows = '';
        for (var li = 0; li < lb.length; li++) {
          var lu         = lb[li];
          var lbInitial  = lu.name ? lu.name.slice(0, 1).toUpperCase() : '?';
          var lbAvatarBg = lu.open === 0 && lu.done > 0
            ? 'bg-success/25 text-success'
            : lu.done > 0 ? 'bg-primary/25 text-primary' : 'bg-base-300 text-base-content/40';
          lbRows += '<div class="flex items-center gap-2.5 py-1.5">'
            + '<div class="w-7 h-7 rounded-full ' + lbAvatarBg + ' text-xs font-bold flex items-center justify-center shrink-0 select-none">'
            + escHtml(lbInitial) + '</div>'
            + '<div class="flex-1 min-w-0">'
              + '<div class="flex items-center gap-1 mb-0.5">'
                + '<span class="text-xs font-medium truncate leading-tight">' + escHtml(lu.name) + '</span>'
                + (lu.badge ? '<span class="text-sm leading-none">' + lu.badge + '</span>' : '')
              + '</div>'
              + '<div class="flex items-center gap-1.5">'
                + '<div class="flex-1 h-1.5 rounded-full bg-base-200 overflow-hidden">'
                  + '<div class="h-full rounded-full bg-success transition-all duration-700" data-target-width="' + lu.pct + '%" style="width:0%"></div>'
                + '</div>'
                + '<span class="text-[0.6rem] text-base-content/40 shrink-0 tabular-nums">' + lu.done + '/' + lu.total + '</span>'
              + '</div>'
            + '</div>'
          + '</div>';
        }
        var lbDoneP = 0;
        for (var li2 = 0; li2 < lb.length; li2++) {
          if (lb[li2].open === 0 && lb[li2].done > 0) lbDoneP++;
        }
        var lbBadgeHtml = lbDoneP > 0
          ? '<span class="text-[0.625rem] font-bold uppercase tracking-wider text-success">\uD83C\uDFC6 ' + lbDoneP + '/' + lb.length + '</span>'
          : statusHtml;
        return '<div class="rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer min-h-44 flex flex-col ' + cardBg + ' ' + cardBorder + '" '
          + 'style="opacity:0;transform:translateY(6px);animation:cx-card-in 0.25s ease forwards;animation-delay:' + delay + ';" '
          + 'onclick="openPbCard(' + cardIdx + ')">'
          + '<div class="flex items-start justify-between gap-2 mb-2">'
          + '<p class="font-semibold text-sm leading-snug text-base-content/80">' + cardTitle + '</p>'
          + lbBadgeHtml
          + '</div>'
          + (lb.length > 0
              ? '<div class="divide-y divide-base-200/60">' + lbRows + '</div>'
              : '<p class="text-sm text-base-content/40 italic mt-2">Geen actieve activiteiten</p>')
          + sparkHtml
          + '</div>';
      }

      return '<div class="rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer min-h-44 flex flex-col justify-between ' + cardBg + ' ' + cardBorder + '" '
          + 'style="opacity:0;transform:translateY(6px);animation:cx-card-in 0.25s ease forwards;animation-delay:' + delay + ';" '
          + 'onclick="openPbCard(' + cardIdx + ')">'
        + '<div>'
        + '<div class="flex items-start justify-between gap-2 mb-3">'
        + '<p class="font-semibold text-sm leading-snug text-base-content/80">' + cardTitle + '</p>'
        + statusHtml
        + '</div>'
        + '<div class="mb-1">'
        + bigEl
        + '<p class="text-[0.6rem] font-medium uppercase tracking-widest text-base-content/40 mt-1.5">' + escHtml(heroSublabel) + '</p>'
        + '</div>'
        + (showProgress
            ? '<div class="mt-3 mb-1">'
              + '<div class="flex items-center justify-between mb-1">'
              + '<span class="text-[0.65rem] text-base-content/45">' + completedCnt + ' van ' + total + ' afgerond</span>'
              + '<span class="text-[0.65rem] font-semibold ' + numCls + '">' + progressPct + '%</span>'
              + '</div>'
              + '<div class="h-1.5 rounded-full bg-base-200 overflow-hidden">'
              + '<div class="h-full rounded-full transition-all duration-500 ' + barCls + '" style="width:0%" data-target-width="' + targetWidth + '"></div>'
              + '</div>'
              + '</div>'
            : '')
        + '</div>'
        + '<div>'
        + pillsHtml
        + futureLine
        + (guidanceLine ? '<p class="text-[0.65rem] text-base-content/40 italic mt-2 leading-snug">' + escHtml(guidanceLine) + '</p>' : '')
        + sparkHtml
        + '</div>'
        + '</div>';
    }

    function animateBars() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          var bars = document.querySelectorAll('[data-target-width]');
          for (var i = 0; i < bars.length; i++) {
            bars[i].style.width = bars[i].getAttribute('data-target-width');
          }
        });
      });
    }

    // ── Wins ──────────────────────────────────────────────────────────────────
    function renderWins() {
      if (winsRendered) return;
      winsRendered = true;
      var container = document.getElementById('winsContent');
      if (!container) return;

      if (!winsData.length) {
        container.innerHTML = '<div class="text-center py-16 text-base-content/40">'
          + '<p class="text-4xl mb-3" aria-hidden="true">\uD83C\uDFC6</p>'
          + '<p class="text-sm font-medium">Nog geen wins deze week.</p>'
          + '<p class="text-xs mt-1">Rond je eerste activiteit af om te starten.</p>'
          + '</div>';
        return;
      }

      var weekAgo  = Date.now() - 7 * 86400000;
      var weekWins = 0;
      for (var i = 0; i < winsData.length; i++) {
        if (new Date(winsData[i].won_at).getTime() >= weekAgo) weekWins++;
      }

      var heroHtml = '<div class="text-center mb-8">'
        + '<div class="text-7xl font-black text-success mb-2">' + weekWins + '</div>'
        + '<p class="text-base-content/60 text-sm font-medium">Wins deze week \uD83C\uDFC6</p>'
        + '</div>';

      var cardsHtml = '';
      for (var j = 0; j < winsData.length; j++) {
        var w       = winsData[j];
        var wonDate = new Date(w.won_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
        var actType = escHtml(w.activity_type_name || '');
        var pw      = w.priority_weight ? ' <span class="badge badge-xs badge-neutral">P' + escHtml(String(w.priority_weight)) + '</span>' : '';
        cardsHtml += '<div class="card bg-base-100 shadow-sm mb-2">'
          + '<div class="card-body py-3 px-4">'
          + '<div class="flex items-center justify-between">'
          + '<p class="font-semibold text-sm">' + actType + pw + '</p>'
          + '<div class="flex items-center gap-2">'
          + '<i data-lucide="trophy" class="w-4 h-4 text-success"></i>'
          + '<span class="text-xs text-base-content/60">' + wonDate + '</span>'
          + '</div></div></div></div>';
      }

      container.innerHTML = heroHtml + cardsHtml;
      lucide.createIcons();
    }

    // ── Team leaderboard ──────────────────────────────────────────────────────
    function loadTeam() {
      if (teamLoaded) return;
      teamLoaded = true;
      var container = document.getElementById('tabTeam');
      if (!container) return;

      container.innerHTML = '<div class="flex justify-center items-center py-16">'
        + '<span class="loading loading-spinner loading-lg"></span></div>';

      fetch('/cx-powerboard/api/team', { credentials: 'include' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var team = data.team || [];
          if (!team.length) {
            container.innerHTML = '<div class="text-center py-12">'
              + '<p class="text-base-content/60">Geen teamdata beschikbaar.</p></div>';
            lucide.createIcons();
            return;
          }
          var rows = '';
          for (var i = 0; i < team.length; i++) {
            var m          = team[i];
            var name       = escHtml(m.name || m.email || '\u2014');
            var status     = m.clearedToday ? '\u2705' : '\u23F3';
            var streak     = (m.streak || m.currentStreak || 0);
            var streakCell = streak >= 2 ? '\uD83D\uDD25\u00A0' + streak : '\u2014';
            rows += '<tr>'
              + '<td class="font-medium">' + name + '</td>'
              + '<td class="text-center text-success font-bold">' + (m.winsThisWeek || 0) + '</td>'
              + '<td class="text-center text-lg leading-none">' + status + '</td>'
              + '<td class="text-center text-sm">' + streakCell + '</td>'
              + '</tr>';
          }
          container.innerHTML = '<div class="card bg-base-100 shadow-sm">'
            + '<div class="card-body">'
            + '<h2 class="card-title">Je team vandaag</h2>'
            + '<p class="text-sm text-base-content/50 mb-4">Wie heeft zijn dag afgerond, wie is nog bezig.</p>'
            + '<table class="table table-sm">'
            + '<thead><tr>'
            + '<th>Naam</th>'
            + '<th class="text-center text-success">Wins/week</th>'
            + '<th class="text-center">Status</th>'
            + '<th class="text-center">Streak</th>'
            + '</tr></thead>'
            + '<tbody>' + rows + '</tbody>'
            + '</table></div></div>';
          lucide.createIcons();
        })
        .catch(function() {
          container.innerHTML = '<div class="alert alert-error">Fout bij laden van teamdata.</div>';
        });
    }

    // ── Theme / auth ──────────────────────────────────────────────────────────
    function initTheme() {
      var saved = localStorage.getItem('selectedTheme') || 'light';
      document.documentElement.setAttribute('data-theme', saved);
      var sel = document.getElementById('themeSelector');
      if (sel) sel.value = saved;
    }

    function changeTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('selectedTheme', theme);
    }

    async function logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_) {}
      window.location.href = '/';
    }

    // ── Focus signal (Phase 1 — rule-based) ──────────────────────────────────

    function computeFocusSignal(s, ptData, mappings) {
      if (s.isDoneForToday) return null;
      var totalOverdue   = s.overdue        || 0;
      var totalRemaining = s.remainingToday || 0;
      var totalCompleted = s.completedToday || 0;

      if (totalOverdue > 0) {
        // Find the type with the most overdue
        var topName = null, topCount = 0;
        for (var i = 0; i < mappings.length; i++) {
          var pt = ptData[String(mappings[i].odoo_activity_type_id)] || {};
          if ((pt.overdue || 0) > topCount) {
            topCount = pt.overdue;
            topName  = mappings[i].odoo_activity_type_name;
          }
        }
        if (topName) {
          return totalOverdue === 1
            ? 'Begin met ' + topName + ' \u2014 die taak is achterstallig.'
            : totalOverdue + ' taken vragen aandacht. Begin met ' + topName + '.';
        }
        return 'Begin met de oudste taak \u2014 ' + totalOverdue + ' achterstallig.';
      }
      if (totalRemaining > 0 && totalCompleted > 0) {
        var pct = Math.round(100 * totalCompleted / (totalCompleted + totalRemaining));
        if (pct >= 50) return 'Je bent al verder dan halverwege. Nog ' + totalRemaining + ' te gaan.';
        return totalCompleted + ' gedaan, nog ' + totalRemaining + ' te gaan.';
      }
      if (totalRemaining > 0) {
        return 'Je hebt ' + totalRemaining + ' ' + (totalRemaining === 1 ? 'taak' : 'taken') + ' klaarstaan voor vandaag.';
      }
      return null;
    }

    // ── Card guidance (Phase 1 — rule-based) ─────────────────────────────────
    // AI hook (Phase 2): replace body with fetch('/cx-powerboard/api/ai/card-guidance?typeId=X')
    function computeCardGuidance(overdueCnt, dueTodayCnt, completedCnt, pct, isDone, isIdle) {
      if (isDone || isIdle) return null;
      if (overdueCnt >= 1 && completedCnt === 0) return 'Pak de oudste taak als eerste aan.';
      if (overdueCnt >= 1 && completedCnt > 0)   return 'Nog ' + overdueCnt + ' achterstallig \u2014 pak die eerst.';
      if ((overdueCnt + dueTodayCnt) === 1)        return 'Nog \u00e9\u00e9n \u2014 bijna klaar!';
      if (pct >= 50 && pct < 100)                  return 'Je bent al meer dan halverwege. Doorzetten.';
      if (dueTodayCnt > 0 && completedCnt === 0)   return 'Begin wanneer je klaar bent \u2014 ' + dueTodayCnt + ' staan klaar.';
      return null;
    }

    // ── Done banner ───────────────────────────────────────────────────────────
    function showDoneBanner(s) {
      var bannerEl = document.getElementById('doneBanner');
      var textEl   = document.getElementById('doneBannerText');
      if (!bannerEl || !textEl) return;
      var now = new Date();
      var t   = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      var msg;
      if (s.streak >= 20) msg = 'Dag afgerond. Al ' + s.streak + ' dagen op rij \u2014 dat is discipline.';
      else if (s.streak >= 5) msg = 'Dag afgerond om ' + t + ' \u2014 al ' + s.streak + ' dagen op rij.';
      else if (s.streak >= 2) msg = 'Dag afgerond om ' + t + ' \u2014 ' + s.streak + ' dagen op rij.';
      else msg = 'Dag afgerond om ' + t + ' \u2014 goed gewerkt.';
      textEl.textContent = msg;
      bannerEl.style.display = '';
      lucide.createIcons();
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    // viewAs in the URL is the single source of truth.
    // If it is missing, redirect to ?viewAs={self} so the dropdown always matches.
    var viewAsParam = new URLSearchParams(window.location.search).get('viewAs') || '';
    if (!viewAsParam) {
      var _u = new URL(window.location.href);
      _u.searchParams.set('viewAs', window.__CX_USER_ID__);
      window.location.replace(_u.toString());
    }

    // Load users + teams for context-switcher
    Promise.all([
      fetch('/cx-powerboard/api/users',  { credentials: 'include' }).then(function(r) { return r.json(); }),
      fetch('/cx-powerboard/api/teams',  { credentials: 'include' }).then(function(r) { return r.json(); })
    ]).then(function(results) {
      var users      = results[0] || [];
      var teamsList  = results[1] || [];
      var sel        = document.getElementById('viewAsSelect');
      if (!sel) return;
      sel.innerHTML  = '';
      // Optgroup: Teams
      if (teamsList.length) {
        var grpT = document.createElement('optgroup');
        grpT.label = 'Teams';
        for (var t = 0; t < teamsList.length; t++) {
          var topt       = document.createElement('option');
          topt.value     = 'team:' + teamsList[t].id;
          topt.textContent = teamsList[t].name;
          if (viewAsParam === 'team:' + teamsList[t].id) topt.selected = true;
          grpT.appendChild(topt);
        }
        sel.appendChild(grpT);
      }
      // Optgroup: Personen
      if (users.length) {
        var grpU = document.createElement('optgroup');
        grpU.label = 'Personen';
        for (var i = 0; i < users.length; i++) {
          var u   = users[i];
          var opt = document.createElement('option');
          opt.value       = u.id;
          opt.textContent = (u.full_name || u.email) + (u.id === window.__CX_USER_ID__ ? ' (jij)' : '');
          if (u.id === viewAsParam) opt.selected = true;
          grpU.appendChild(opt);
        }
        sel.appendChild(grpU);
      }
      // viewAsParam is always set (redirect above), so no fallback needed.
      if (users.length > 1 || teamsList.length) {
        document.getElementById('viewAsSwitcher').style.display = 'flex';
      }
    }).catch(function() {}); // non-fatal

    function switchViewAs(value) {
      var url = new URL(window.location.href);
      url.searchParams.set('viewAs', value);
      window.location.href = url.toString();
    }

    var activitiesUrl = '/cx-powerboard/api/activities-raw';
    if (viewAsParam) activitiesUrl += '?viewAs=' + encodeURIComponent(viewAsParam);

    fetch(activitiesUrl, { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var openActivities      = data.openActivities      || [];
        var completedActivities = data.completedActivities || [];

        // ── Debug breakdown helpers ───────────────────────────────────────
        function buildOpenBreakdown(activities) {
          var result = {};
          activities.forEach(function(a) {
            var typeId   = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
            var typeName = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
            var model    = a.res_model || '(unknown)';
            if (!result[typeId]) result[typeId] = { name: typeName, total: 0, models: {} };
            result[typeId].total += 1;
            result[typeId].models[model] = (result[typeId].models[model] || 0) + 1;
          });
          return result;
        }
        function buildCompletedBreakdown(activities) {
          var result = {};
          activities.forEach(function(a) {
            var typeId   = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
            var typeName = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
            var model    = a.res_model || '(unknown)';
            var day      = a.date_done ? a.date_done.slice(0, 10) : 'unknown';
            if (!result[typeId]) result[typeId] = { name: typeName, total: 0, models: {}, perDay: {} };
            result[typeId].total += 1;
            result[typeId].models[model] = (result[typeId].models[model] || 0) + 1;
            result[typeId].perDay[day]   = (result[typeId].perDay[day]   || 0) + 1;
          });
          return result;
        }
        function logBreakdown(title, breakdown) {
          console.group('%c' + title, 'color:#2563eb;font-weight:bold;');
          Object.keys(breakdown).forEach(function(typeId) {
            var d = breakdown[typeId];
            console.group('%c' + d.name + ' (type ' + typeId + ') • total ' + d.total, 'color:#059669;font-weight:bold;');
            if (d.models) console.log('%cPer model', 'color:#d97706;font-weight:bold;', d.models);
            if (d.perDay)  console.log('%cPer day',   'color:#7c3aed;font-weight:bold;', d.perDay);
            console.groupEnd();
          });
          console.groupEnd();
        }

        var _qc = data.queryConfig || {};
        console.log('%c[CX QUERY]', 'color:#111827;font-weight:bold;', _qc);
        console.log('%c[CX INIT] openActivities',      'color:#2563eb;font-weight:bold;', openActivities.length);
        console.log('%c[CX INIT] completedActivities', 'color:#2563eb;font-weight:bold;', completedActivities.length);
        function buildOpenBreakdownWithState(activities) {
          var result = {};
          activities.forEach(function(a) {
            var typeId   = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
            var typeName = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
            var state    = a.state || 'unknown';
            var userName = Array.isArray(a.user_id) ? a.user_id[1] : String(a.user_id || '?');
            if (!result[typeId]) result[typeId] = { name: typeName, total: 0, states: {} };
            result[typeId].total += 1;
            if (!result[typeId].states[state]) result[typeId].states[state] = { total: 0, users: {} };
            result[typeId].states[state].total += 1;
            result[typeId].states[state].users[userName] = (result[typeId].states[state].users[userName] || 0) + 1;
          });
          return result;
        }
        function logOpenStateBreakdown(breakdown) {
          console.group('%c[CX OPEN STATE]', 'color:#2563eb;font-weight:bold;');
          Object.keys(breakdown).forEach(function(typeId) {
            var d = breakdown[typeId];
            console.group('%c' + d.name + ' (type ' + typeId + ') → ' + d.total, 'color:#059669;font-weight:bold;');
            Object.keys(d.states).forEach(function(state) {
              var s = d.states[state];
              console.group('%c' + state + ' → ' + s.total, 'color:#d97706;font-weight:bold;');
              Object.keys(s.users).forEach(function(user) {
                console.log(user + ': ' + s.users[user]);
              });
              console.groupEnd();
            });
            console.groupEnd();
          });
          console.groupEnd();
        }

        logBreakdown('[CX OPEN]',      buildOpenBreakdown(openActivities));
        logOpenStateBreakdown(buildOpenBreakdownWithState(openActivities));
        logBreakdown('[CX COMPLETED]', buildCompletedBreakdown(completedActivities));

        // No mappings = nothing configured
        if (!data.mappings || data.mappings.length === 0) {
          var cardsEl = document.getElementById('dashboardCards');
          if (cardsEl) {
            cardsEl.innerHTML = '<div class="col-span-full flex flex-col items-center py-16 text-base-content/40">'
              + '<p class="text-4xl mb-3" aria-hidden="true">\uD83D\uDCCB</p>'
              + '<p class="text-sm font-medium">Geen activiteiten geconfigureerd.</p>'
              + '<p class="text-xs mt-1">Ga naar <a href="/cx-powerboard/settings" class="link">Instellingen</a> om teams en activiteiten in te stellen.</p>'
              + '</div>';
          }
          return;
        }

        // No Odoo UIDs found
        if (data.error) {
          var cardsEl = document.getElementById('dashboardCards');
          if (cardsEl) {
            cardsEl.innerHTML = '<div class="col-span-full flex flex-col items-center py-16 text-base-content/40">'
              + '<p class="text-4xl mb-3" aria-hidden="true">\uD83D\uDD17</p>'
              + '<p class="text-sm font-medium">Geen Odoo-koppeling gevonden.</p>'
              + '</div>';
          }
          return;
        }

        // ── Derive todayStr from server or local fallback ───────────────────
        var todayStr   = data.today || new Date().toLocaleDateString('en-CA');
        var todayLocal = new Date(todayStr + 'T00:00:00');

        // ── Derive perTypeData from raw arrays ──────────────────────────────
        var _pt = {};
        for (var mi = 0; mi < data.mappings.length; mi++) {
          _pt[String(data.mappings[mi].odoo_activity_type_id)] = { overdue: 0, dueToday: 0, future: 0, completedToday: 0 };
        }
        openActivities.forEach(function(a) {
          var tid = String(Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id);
          if (!_pt[tid]) return;
          var dl = a.date_deadline ? new Date(a.date_deadline + 'T00:00:00') : null;
          if (!dl)                                              _pt[tid].future++;
          else if (dl < todayLocal)                             _pt[tid].overdue++;
          else if (dl.getTime() === todayLocal.getTime())       _pt[tid].dueToday++;
          else                                                  _pt[tid].future++;
        });
        completedActivities.forEach(function(a) {
          if (!a.date_done || a.date_done.slice(0, 10) !== todayStr) return;
          var tid = String(Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id);
          if (_pt[tid]) _pt[tid].completedToday++;
        });

        // ── Derive stats ────────────────────────────────────────────────────
        var _overdue = 0, _dueToday = 0, _completedToday = 0;
        Object.keys(_pt).forEach(function(k) {
          _overdue        += _pt[k].overdue;
          _dueToday       += _pt[k].dueToday;
          _completedToday += _pt[k].completedToday;
        });
        var _remainingToday = _overdue + _dueToday;
        var _isDoneForToday = _remainingToday === 0 && _completedToday > 0;
        var _winsThisWeek   = (data.wins || []).length;
        var s = {
          overdue: _overdue, dueToday: _dueToday,
          remainingToday: _remainingToday, completedToday: _completedToday,
          isDoneForToday: _isDoneForToday, winsThisWeek: _winsThisWeek, streak: 0,
        };

        // ── Derive sparkline data from completedActivities ──────────────────
        var _sd = {};
        completedActivities.forEach(function(a) {
          var d   = a.date_done ? a.date_done.slice(0, 10) : null;
          if (!d) return;
          var tid = String(Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id);
          if (!_sd[tid]) _sd[tid] = [];
          var existing = null;
          for (var si = 0; si < _sd[tid].length; si++) { if (_sd[tid][si].date === d) { existing = _sd[tid][si]; break; } }
          if (existing) existing.completed++;
          else _sd[tid].push({ date: d, completed: 1, remaining: 0 });
        });

        // ── Set app state ───────────────────────────────────────────────────
        allActivities      = openActivities;
        completedTodayData = completedActivities.filter(function(a) { return a.date_done && a.date_done.slice(0, 10) === todayStr; });
        winsData           = data.wins     || [];
        mappingsData       = data.mappings || [];
        perTypeData        = _pt;
        sparklineData      = _sd;
        isTeamViewData     = !!data.isTeamView;
        if (data.odooUid)     odooUid     = data.odooUid;
        if (data.odooBaseUrl) odooBaseUrl = data.odooBaseUrl;
        dataReady = true;

        console.group('%c[CX UI DATA]', 'color:#dc2626;font-weight:bold;');
        logBreakdown('[CX UI OPEN]',      buildOpenBreakdown(openActivities));
        logBreakdown('[CX UI COMPLETED]', buildCompletedBreakdown(completedActivities));
        console.groupEnd();

        // ── Stats bar ───────────────────────────────────────────────────────
        var compEl = document.getElementById('statCompletedToday');
        if (compEl) compEl.textContent = s.completedToday;

        var VOLUME_THRESHOLD = 10;
        var volEl = document.getElementById('volumeBadge');
        if (volEl && s.completedToday >= VOLUME_THRESHOLD) {
          volEl.textContent = '\u26A1 ' + s.completedToday + ' vandaag';
          volEl.style.display = '';
        }

        var remEl = document.getElementById('statRemainingToday');
        if (remEl) {
          var newRemVal = s.remainingToday;
          var oldRemVal = parseInt(remEl.textContent, 10);
          remEl.textContent = newRemVal;
          if (!isNaN(oldRemVal) && oldRemVal > 0 && newRemVal === 0) {
            remEl.classList.add('cx-stat-complete');
            setTimeout(function() { remEl.classList.remove('cx-stat-complete'); }, 500);
          }
        }

        var winsEl = document.getElementById('statWins');
        if (winsEl) winsEl.textContent = s.winsThisWeek;

        var ovEl = document.getElementById('statOverdue');
        if (ovEl) {
          ovEl.textContent = s.overdue;
          if (s.overdue > 0) ovEl.classList.add('text-error');
          else               ovEl.classList.remove('text-error');
        }

        // ── isDoneForToday banner ───────────────────────────────────────────
        if (s.isDoneForToday) {
          var statsBarEl = document.getElementById('statsBar');
          if (statsBarEl) statsBarEl.classList.add('cx-stats-done');
          showDoneBanner(s);
        }

        // ── Focus signal ────────────────────────────────────────────────────
        var fsText = computeFocusSignal(s, perTypeData, mappingsData);
        if (fsText) {
          var fsEl  = document.getElementById('focusSignalText');
          var fsBar = document.getElementById('focusSignalBar');
          if (fsEl)  fsEl.textContent = fsText;
          if (fsBar) fsBar.style.display = '';
        }

        // ── Refreshed timestamp ─────────────────────────────────────────────
        var rAt = document.getElementById('refreshedAt');
        if (rAt) {
          var now2 = new Date();
          rAt.textContent = 'Vernieuwd om '
            + String(now2.getHours()).padStart(2, '0') + ':'
            + String(now2.getMinutes()).padStart(2, '0');
        }

        dashboardRendered = false;
        renderDashboard();
        if (calendarPendingInit) {
          calendarPendingInit = false;
          initCalendar();
          refreshCalendarEvents();
          buildFilterChips();
          renderNoDeadline();
        }
      })
      .catch(function(e) {
        var cardsEl = document.getElementById('dashboardCards');
        if (cardsEl) cardsEl.innerHTML = '<div class="alert alert-error col-span-full">Fout bij laden: ' + escHtml(e.message) + '</div>';
        lucide.createIcons();
      });

    initTheme();
    lucide.createIcons();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Settings (manager / admin only)
// ---------------------------------------------------------------------------

export function cxPowerboardSettingsUI(user) {
  const isManager = user.role === 'admin' || user.role === 'cx_powerboard_manager';
  const isManagerJS = isManager ? 'true' : 'false';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CX Powerboard – Settings</title>

  <script>
    (function initThemeEarly() {
      try {
        var localTheme = localStorage.getItem('selectedTheme');
        var cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
        var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        var theme = localTheme || cookieTheme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>

  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />

  <script>
    (function suppressTailwindCdnWarning() {
      var _w = console.warn;
      console.warn = function() {
        if (arguments[0] && typeof arguments[0] === 'string' &&
            arguments[0].indexOf('cdn.tailwindcss.com should not be used in production') !== -1) return;
        return _w.apply(console, arguments);
      };
    })();
  </script>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-3xl">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-8">
        <a href="/cx-powerboard" class="btn btn-sm btn-ghost">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
        </a>
        <div class="flex-1">
          <h1 class="text-2xl font-bold">Instellingen</h1>
          <p class="text-base-content/60 text-sm">Stel teams samen en koppel activiteitstypen aan teamleden.</p>
        </div>
        <button class="btn btn-sm btn-ghost btn-circle" onclick="document.getElementById('helpModal').showModal()" title="Uitleg">
          <i data-lucide="info" class="w-4.5 h-4.5"></i>
        </button>
      </div>

      <!-- ── Teams & Activiteiten ───────────────────────────────────────────── -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">

          <!-- Header row -->
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="card-title text-base">Teams &amp; activiteiten</h2>
              <p class="text-xs text-base-content/50">Kies een team of persoon, beheer dan de leden en activiteitstypen.</p>
            </div>
            <button class="btn btn-sm btn-outline" onclick="openNewTeam()">
              <i data-lucide="plus" class="w-4 h-4"></i> Nieuw team
            </button>
          </div>

          <!-- Entity tabs (teams + Persoonlijk) -->
          <div id="entityTabsLoading" class="flex justify-center py-4">
            <span class="loading loading-spinner loading-sm"></span>
          </div>
          <div id="entityTabs" class="flex flex-wrap gap-2 mb-5" style="display:none !important;"></div>

          <!-- Entity detail panel (shown when a tab is selected) -->
          <div id="entityPanel" style="display:none;">

            <!-- Members section (teams only) -->
            <div id="membersSection">
              <p class="text-sm font-semibold mb-2">Leden</p>
              <div id="membersList" class="flex flex-wrap gap-2 mb-2 min-h-6"></div>
              <div class="flex gap-2 mt-2">
                <select id="addMemberSelect" class="select select-xs select-bordered flex-1">
                  <option value="">Gebruiker toevoegen\u2026</option>
                </select>
                <button class="btn btn-xs btn-primary" onclick="addMember()">Toevoegen</button>
              </div>
              <div class="divider my-4"></div>
            </div>

            <!-- Activities section -->
            <div class="flex items-center justify-between mb-3">
              <p class="text-sm font-semibold">Activiteitstypen</p>
              <button class="btn btn-xs btn-outline" onclick="toggleAddActivityForm()">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> Type toevoegen
              </button>
            </div>

            <!-- Inline add form (hidden by default) -->
            <div id="addActivityForm" class="bg-base-200/60 rounded-xl p-3 mb-3" style="display:none;">
              <p class="text-xs font-semibold text-base-content/60 mb-2">Nieuw activiteitstype toevoegen</p>
              <div class="flex flex-wrap gap-3 mb-2">
                <div class="form-control flex-1 min-w-40">
                  <label class="label pb-1"><span class="label-text text-xs">Activiteitstype</span></label>
                  <select id="addEntityActivitySelect" class="select select-xs select-bordered">
                    <option value="">Kies een type\u2026</option>
                  </select>
                </div>
                <div class="form-control w-24">
                  <label class="label pb-1"><span class="label-text text-xs">Prioriteit (0\u2013100)</span></label>
                  <input type="number" id="addActivityWeight" min="0" max="100" value="10" class="input input-xs input-bordered" />
                </div>
              </div>
              <div class="flex flex-wrap gap-4 mb-2">
                <label class="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" id="addActivityIsWin" class="checkbox checkbox-xs" />
                  Telt als win
                  <span class="tooltip tooltip-right" data-tip="Voltooide activiteiten gaan naar het winslogboek en de weekteller op de Wins-tab.">
                    <i data-lucide="help-circle" class="w-3 h-3 text-base-content/25 cursor-help"></i>
                  </span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" id="addActivityDashboard" class="checkbox checkbox-xs" checked />
                  Dashboard kaart
                  <span class="tooltip tooltip-right" data-tip="Toont een kaart op het dashboard.">
                    <i data-lucide="help-circle" class="w-3 h-3 text-base-content/25 cursor-help"></i>
                  </span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" id="addActivityStreak" class="checkbox checkbox-xs" checked />
                  Telt mee voor streak
                  <span class="tooltip tooltip-right" data-tip="Uit = opportunistisch type. Ontbrekende activiteiten breken dan je dagstreak niet.">
                    <i data-lucide="help-circle" class="w-3 h-3 text-base-content/25 cursor-help"></i>
                  </span>
                </label>
              </div>
              <div class="flex gap-3 mb-3">
                <div class="form-control flex-1">
                  <label class="label pb-1">
                    <span class="label-text text-xs">Drempel achterstallig</span>
                    <span class="label-text-alt tooltip tooltip-left" data-tip="Kaart wordt rood zodra dit aantal (of meer) items de deadline heeft overschreden.">
                      <i data-lucide="help-circle" class="w-3 h-3 text-base-content/30 cursor-help"></i>
                    </span>
                  </label>
                  <input type="number" id="addActivityThreshOv" min="0" value="1" class="input input-xs input-bordered" />
                </div>
                <div class="form-control flex-1">
                  <label class="label pb-1">
                    <span class="label-text text-xs">Drempel vandaag</span>
                    <span class="label-text-alt tooltip tooltip-left" data-tip="Kaart wordt rood zodra dit aantal (of meer) items vandaag op de planning staan.">
                      <i data-lucide="help-circle" class="w-3 h-3 text-base-content/30 cursor-help"></i>
                    </span>
                  </label>
                  <input type="number" id="addActivityThreshTd" min="0" value="3" class="input input-xs input-bordered" />
                </div>
              </div>
              <div class="form-control mb-3">
                <label class="label pb-1"><span class="label-text text-xs">Notities (optioneel)</span></label>
                <input type="text" id="addActivityNotes" class="input input-xs input-bordered" placeholder="bijv. alleen voor priority accounts" />
              </div>
              <div class="flex gap-2">
                <button class="btn btn-xs btn-primary" onclick="saveNewEntityActivity()">
                  <i data-lucide="plus" class="w-3.5 h-3.5"></i> Toevoegen
                </button>
                <button class="btn btn-xs btn-ghost" onclick="toggleAddActivityForm()">Annuleren</button>
              </div>
              <div id="addActivityError" class="text-error text-xs mt-2" style="display:none;"></div>
            </div>

            <!-- Activity list -->
            <div id="entityActivitiesList"></div>
          </div>

          <!-- No teams empty state -->
          <div id="entityEmpty" class="text-base-content/50 text-sm py-4 text-center" style="display:none;">
            Nog geen teams. Maak een team aan of gebruik &ldquo;Persoonlijk&rdquo;.
          </div>
        </div>
      </div>



    </div>
  </div>

  <!-- Help / info modal -->
  <dialog id="helpModal" class="modal">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
        <i data-lucide="info" class="w-5 h-5 text-primary"></i>
        Uitleg &mdash; hoe werkt de configuratie?
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div class="bg-base-200 rounded-lg p-3">
          <p class="font-semibold text-xs mb-1">Wat is een activiteitstype?</p>
          <p class="text-xs text-base-content/70">Alleen geconfigureerde types worden getrackt. Alle andere types in Odoo worden genegeerd &mdash; ze tellen niet mee in statistieken, streak of wins.</p>
        </div>
        <div class="bg-base-200 rounded-lg p-3">
          <p class="font-semibold text-xs mb-1">Prioriteit (0&ndash;100)</p>
          <p class="text-xs text-base-content/70">Sorteervolgorde in de takenlijst. Hoger getal = eerder weergegeven. Heeft geen effect op streaks, drempels of wins.</p>
        </div>
        <div class="bg-base-200 rounded-lg p-3">
          <p class="font-semibold text-xs mb-1">Telt als win</p>
          <p class="text-xs text-base-content/70">Elke voltooide activiteit van dit type wordt opgeslagen in het winslogboek en telt mee in de weekteller op de Wins-tab.</p>
        </div>
        <div class="bg-base-200 rounded-lg p-3">
          <p class="font-semibold text-xs mb-1">Dashboard kaart</p>
          <p class="text-xs text-base-content/70">Toont een kaart op het hoofddashboard. Uit = type wordt wel getrackt (voor streak/wins) maar zonder zichtbare kaart.</p>
        </div>
        <div class="bg-base-200 rounded-lg p-3">
          <p class="font-semibold text-xs mb-1">Telt mee voor streak</p>
          <p class="text-xs text-base-content/70">Aan = type blokkeert je dagstreak zolang er openstaande items zijn. Uit = opportunistisch type: ontbrekende activiteiten breken je streak niet.</p>
        </div>
        <div class="bg-base-200 rounded-lg p-3">
          <p class="font-semibold text-xs mb-1">Drempels achterstallig / vandaag</p>
          <p class="text-xs text-base-content/70">Bepalen wanneer de dashboardkaart rood wordt. Standaard: rood bij &ge;1 achterstallig of &ge;3 gepland voor vandaag.</p>
        </div>
        <div class="bg-base-200 rounded-lg p-3 sm:col-span-2">
          <p class="font-semibold text-xs mb-1">keep_done &mdash; wat is dat?</p>
          <p class="text-xs text-base-content/70">Bij het toevoegen van een type wordt automatisch <code class="bg-base-300 px-1 rounded">keep_done = true</code> ingesteld in Odoo. Dit zorgt ervoor dat voltooide activiteiten bewaard blijven. <strong>&#x2714;</strong> = correct ingesteld. <strong>&#x26A0;</strong> = mislukt &mdash; verwijder het type en voeg opnieuw toe. Zonder &#x2714; kloppen de afgerond-tellingen en streaks niet.</p>
        </div>
      </div>
      <div class="modal-action">
        <button class="btn btn-sm" onclick="document.getElementById('helpModal').close()">Sluiten</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- New team modal -->
  <dialog id="newTeamModal" class="modal">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">Nieuw team</h3>
      <div class="form-control mb-3">
        <label class="label pb-1"><span class="label-text text-xs">Naam</span></label>
        <input type="text" id="newTeamName" class="input input-sm input-bordered" placeholder="bijv. CX Team" />
      </div>
      <div class="form-control mb-4">
        <label class="label pb-1"><span class="label-text text-xs">Omschrijving (optioneel)</span></label>
        <input type="text" id="newTeamDesc" class="input input-sm input-bordered" />
      </div>
      <div id="newTeamError" class="text-error text-xs mb-2" style="display:none;"></div>
      <div class="modal-action">
        <button class="btn btn-sm" onclick="document.getElementById('newTeamModal').close()">Annuleren</button>
        <button class="btn btn-primary btn-sm" onclick="saveNewTeam()">Aanmaken</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>



  <script>
    // ── Helpers ──────────────────────────────────────────────────────────────
    function escHtml(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    window.__PB_IS_MANAGER__ = ${isManagerJS};

    // ── State ────────────────────────────────────────────────────────────────
    var activityTypes = [];
    var mappings      = [];
    var allUsers      = [];
    var allMappings   = [];
    var teams         = [];
    var activeTeamId  = null;

    // ── Load data ────────────────────────────────────────────────────────────
    function loadAll() {
      Promise.all([
        fetch('/cx-powerboard/api/activity-types', { credentials: 'include' }).then(function(r) { return r.json(); }),
        fetch('/cx-powerboard/api/mappings',        { credentials: 'include' }).then(function(r) { return r.json(); }),
        fetch('/cx-powerboard/api/users',           { credentials: 'include' }).then(function(r) { return r.json(); }),
        fetch('/cx-powerboard/api/teams',           { credentials: 'include' }).then(function(r) { return r.json(); })
      ]).then(function(results) {
        activityTypes = results[0] || [];
        allMappings   = results[1] || [];
        mappings      = allMappings;
        allUsers      = results[2] || [];
        teams         = results[3] || [];
        renderEntityTabs();
      }).catch(function(e) {
        var ta = document.getElementById('entityTabsLoading');
        if (ta) ta.innerHTML = '<div class="alert alert-error">' + escHtml(e.message) + '</div>';
      });
    }

    // ── Teams ────────────────────────────────────────────────────────────────
    // activeEntity: { type: 'team'|'personal', id: teamId|null, name: string }
    var activeEntity     = null;
    var entityActivities = [];  // current activities for the selected entity
    var entityMembers    = [];  // current members (teams only)

    // ── Threshold-steps editor state ─────────────────────────────────────────
    var _editSteps = {}; // { [mappingId]: [{field, value, color}] }

    function renderStepsEditor(mid) {
      var container = document.getElementById('steps-' + mid);
      if (!container) return;
      var steps = _editSteps[mid] || [];
      var colorOptions = [
        {v:'error',     l:'Rood (fout)'},
        {v:'warning',   l:'Oranje (waarschuwing)'},
        {v:'info',      l:'Blauw (info)'},
        {v:'success',   l:'Groen'},
        {v:'primary',   l:'Primair'},
        {v:'secondary', l:'Secundair'},
        {v:'accent',    l:'Accent'},
        {v:'neutral',   l:'Grijs'},
      ];
      var fieldOptions = [
        {v:'remaining', l:'Totaal actief'},
        {v:'overdue',   l:'Achterstallig'},
        {v:'today',     l:'Vandaag'},
      ];
      var html = '';
      if (!steps.length) {
        html += '<p class="text-[0.65rem] text-base-content/40 italic mb-1">Geen stappen \u2014 eenvoudige drempel hieronder wordt gebruikt.</p>';
      }
      for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        var fOpts = fieldOptions.map(function(o) {
          return '<option value="' + o.v + '"' + (s.field === o.v ? ' selected' : '') + '>' + o.l + '</option>';
        }).join('');
        var cOpts = colorOptions.map(function(o) {
          return '<option value="' + o.v + '"' + (s.color === o.v ? ' selected' : '') + '>' + o.l + '</option>';
        }).join('');
        var qMid = mid.replace(/"/g, '\\"');
        html += '<div class="flex items-center gap-1 mb-1">'
          + '<select class="select select-xs select-bordered flex-1" onchange="_editSteps[&quot;' + qMid + '&quot;][' + i + '].field=this.value">' + fOpts + '</select>'
          + '<span class="text-[0.7rem] text-base-content/50 shrink-0">&ge;</span>'
          + '<input type="number" min="0" value="' + s.value + '" class="input input-xs input-bordered w-14 shrink-0" onchange="_editSteps[&quot;' + qMid + '&quot;][' + i + '].value=+this.value" />'
          + '<select class="select select-xs select-bordered w-28 shrink-0" onchange="_editSteps[&quot;' + qMid + '&quot;][' + i + '].color=this.value">' + cOpts + '</select>'
          + '<button class="btn btn-xs btn-ghost text-error px-1 shrink-0" onclick="_removeStep(&quot;' + qMid + '&quot;,' + i + ')" title="Verwijder stap"><i data-lucide="x" class="w-3 h-3"></i></button>'
          + '</div>';
      }
      html += '<button class="btn btn-xs btn-outline mt-0.5" onclick="_addStep(&quot;' + mid.replace(/"/g, '\\"') + '&quot;)">'
        + '<i data-lucide="plus" class="w-3 h-3 mr-1"></i>Stap toevoegen</button>';
      container.innerHTML = html;
      lucide.createIcons();
    }

    function _addStep(mid) {
      if (!_editSteps[mid]) _editSteps[mid] = [];
      _editSteps[mid].push({ field: 'overdue', value: 1, color: 'error' });
      renderStepsEditor(mid);
      updateCardPreview(mid);
    }

    function _removeStep(mid, idx) {
      if (!_editSteps[mid]) return;
      _editSteps[mid].splice(idx, 1);
      renderStepsEditor(mid);
      updateCardPreview(mid);
    }

    function _toggleColorMode(mid, mode) {
      var autoSec  = document.getElementById('ecm-auto-section-' + mid);
      var fixedSec = document.getElementById('ecm-fixed-section-' + mid);
      if (autoSec)  autoSec.style.display  = mode === 'auto'  ? '' : 'none';
      if (fixedSec) fixedSec.style.display = mode === 'fixed' ? '' : 'none';
      updateCardPreview(mid);
    }

    // ── Card preview (settings) ───────────────────────────────────────────────
    function buildCardPreviewHtml(mid) {
      // Read current form values
      var colorModeEl = document.querySelector('input[name="ecm-' + mid + '"]:checked');
      var colorMode   = colorModeEl ? colorModeEl.value : 'auto';
      var fcEl        = document.getElementById('efc-' + mid);
      var fixedColor  = (fcEl && fcEl.value) ? fcEl.value : null;
      var cpEl        = document.getElementById('ecp-' + mid);
      var compPills   = cpEl ? cpEl.checked : false;
      var hmEl        = document.getElementById('ehm-' + mid);
      var heroMetric  = hmEl ? hmEl.value : 'auto';
      var thOvEl      = document.getElementById('eo-' + mid);
      var thTdEl      = document.getElementById('et-' + mid);
      var thOv        = thOvEl ? parseInt(thOvEl.value, 10) || 1 : 1;
      var thTd        = thTdEl ? parseInt(thTdEl.value, 10) || 3 : 3;

      // Activity name from entity state
      var name = 'Activiteitstype';
      for (var i = 0; i < entityActivities.length; i++) {
        var a = entityActivities[i];
        if ((a.mapping_id || a.id) === mid) {
          name = (a.cx_activity_mapping && a.cx_activity_mapping.odoo_activity_type_name) || name;
          break;
        }
      }

      // Sample data — representative but non-trivial
      var overdueCnt   = 3;
      var dueTodayCnt  = 5;
      var completedCnt = 2;
      var remaining    = overdueCnt + dueTodayCnt;
      var total        = remaining + completedCnt;
      var progressPct  = Math.round(100 * completedCnt / total);

      // Resolve color
      var resolvedColor = null;
      if (colorMode === 'fixed') {
        resolvedColor = fixedColor || null;
      } else {
        var rawSteps = _editSteps[mid];
        if (rawSteps && rawSteps.length) {
          var sorted = rawSteps.slice().sort(function(a, b) { return b.value - a.value; });
          for (var si = 0; si < sorted.length; si++) {
            var step = sorted[si];
            var val  = step.field === 'overdue' ? overdueCnt : step.field === 'today' ? dueTodayCnt : remaining;
            if (val >= step.value) { resolvedColor = step.color; break; }
          }
        } else {
          if (overdueCnt >= thOv)        resolvedColor = 'error';
          else if (dueTodayCnt >= thTd)  resolvedColor = 'warning';
        }
      }

      // Card styling
      var cardBg = 'bg-base-100'; var cardBorder = 'border border-base-300'; var numCls = 'text-base-content'; var barCls = 'bg-primary';
      if (resolvedColor === 'error')   { cardBg = 'bg-error/5';   cardBorder = 'border border-error/20';   numCls = 'text-error';   barCls = 'bg-error'; }
      else if (resolvedColor === 'warning') { cardBg = 'bg-warning/5'; cardBorder = 'border border-warning/20'; numCls = 'text-warning'; barCls = 'bg-warning'; }
      else if (resolvedColor === 'success') { cardBg = 'bg-success/5'; cardBorder = 'border border-success/20'; numCls = 'text-success'; barCls = 'bg-success'; }
      else if (resolvedColor && resolvedColor !== '') { cardBg = 'bg-' + resolvedColor + '/5'; cardBorder = 'border border-' + resolvedColor + '/20'; numCls = 'text-' + resolvedColor; barCls = 'bg-' + resolvedColor; }

      // Hero metric
      var bigVal, heroLabel;
      if      (heroMetric === 'completed') { bigVal = completedCnt; heroLabel = 'afgerond vandaag'; }
      else if (heroMetric === 'remaining') { bigVal = remaining;    heroLabel = 'nog te gaan'; }
      else if (heroMetric === 'overdue')   { bigVal = overdueCnt;   heroLabel = 'achterstallig'; }
      else if (heroMetric === 'today')     { bigVal = dueTodayCnt;  heroLabel = 'te doen vandaag'; }
      else { // auto
        if (progressPct >= 50 && completedCnt > 0) { bigVal = remaining;    heroLabel = 'nog te gaan'; }
        else if (completedCnt > 0)                  { bigVal = completedCnt; heroLabel = 'afgerond vandaag'; }
        else                                        { bigVal = remaining;    heroLabel = 'waarvan ' + overdueCnt + ' achterstallig'; }
      }

      // Pills
      var _pb = 'inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem]';
      var pillsHtml;
      if (compPills) {
        pillsHtml = '<div class="flex flex-wrap gap-1.5 mt-3">'
          + '<span class="' + _pb + ' bg-error/15 text-error font-semibold">' + remaining + '\u00a0actief</span>'
          + '<span class="' + _pb + ' bg-success/15 text-success font-medium">' + completedCnt + '\u00a0gedaan</span>'
          + '</div>';
      } else {
        pillsHtml = '<div class="flex flex-wrap gap-1.5 mt-3">'
          + '<span class="' + _pb + ' bg-error/15 text-error font-semibold">'   + overdueCnt   + '\u00a0achterstallig</span>'
          + '<span class="' + _pb + ' bg-warning/15 text-warning font-semibold">' + dueTodayCnt   + '\u00a0vandaag</span>'
          + '<span class="' + _pb + ' bg-success/15 text-success font-medium">' + completedCnt + '\u00a0gedaan</span>'
          + '</div>';
      }

      return '<div class="rounded-xl p-4 shadow-sm ' + cardBg + ' ' + cardBorder + ' pointer-events-none select-none">'
        + '<div class="flex items-start justify-between gap-2 mb-3">'
        + '<p class="font-semibold text-sm leading-snug text-base-content/80">' + escHtml(name) + '</p>'
        + '<span class="badge badge-xs badge-ghost opacity-60">voorbeeld</span>'
        + '</div>'
        + '<div class="mb-1">'
        + '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + bigVal + '</span>'
        + '<p class="text-[0.6rem] font-medium uppercase tracking-widest text-base-content/40 mt-1.5">' + heroLabel + '</p>'
        + '</div>'
        + '<div class="mt-3 mb-1">'
        + '<div class="flex items-center justify-between mb-1">'
        + '<span class="text-[0.65rem] text-base-content/45">' + completedCnt + ' van ' + total + ' afgerond</span>'
        + '<span class="text-[0.65rem] font-semibold ' + numCls + '">' + progressPct + '%</span>'
        + '</div>'
        + '<div class="h-1.5 rounded-full bg-base-200 overflow-hidden">'
        + '<div class="h-full rounded-full ' + barCls + '" style="width:' + progressPct + '%"></div>'
        + '</div>'
        + '</div>'
        + pillsHtml
        + '</div>';
    }

    function updateCardPreview(mid) {
      var el = document.getElementById('card-preview-' + mid);
      if (!el) return;
      el.innerHTML = buildCardPreviewHtml(mid);
    }

    // Build entity tab bar from loaded teams + Personal tab
    function renderEntityTabs() {
      var loading = document.getElementById('entityTabsLoading');
      var tabsEl  = document.getElementById('entityTabs');
      var emptyEl = document.getElementById('entityEmpty');
      if (loading) loading.style.display = 'none';

      var tabs = [];
      for (var i = 0; i < teams.length; i++) tabs.push(teams[i]);

      if (!tabs.length && false) { // keep Personal always visible, never show empty state
        if (emptyEl) emptyEl.style.display = '';
        if (tabsEl)  { tabsEl.style.display = 'none'; tabsEl.style.removeProperty('display'); tabsEl.style.display = 'none'; }
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      tabsEl.style.cssText = 'display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.25rem;';

      var html = '';
      for (var j = 0; j < tabs.length; j++) {
        var t = tabs[j];
        var isActive = activeEntity && activeEntity.type === 'team' && activeEntity.id === t.id;
        html += '<button class="btn btn-sm ' + (isActive ? 'btn-primary' : 'btn-outline') + '"'
          + ' data-type="team" data-id="' + escHtml(t.id) + '" data-name="' + escHtml(t.name) + '"'
          + ' onclick="selectEntity(this.dataset.type, this.dataset.id, this.dataset.name)">'
          + escHtml(t.name)
          + '</button>';
      }
      // Personal tab
      var isPersonal = activeEntity && activeEntity.type === 'personal';
      html += '<button class="btn btn-sm ' + (isPersonal ? 'btn-primary' : 'btn-ghost') + '"'
        + ' data-type="personal" data-id="" data-name="Persoonlijk"'
        + ' onclick="selectEntity(this.dataset.type, this.dataset.id, this.dataset.name)">'
        + 'Persoonlijk</button>';

      // Delete-team button (shown next to active team tab, not for personal)
      if (activeEntity && activeEntity.type === 'team') {
        html += '<button class="btn btn-xs btn-ghost text-error self-center ml-1"'
          + ' data-id="' + escHtml(activeEntity.id) + '" data-name="' + escHtml(activeEntity.name) + '"'
          + ' onclick="deleteTeam(this.dataset.id, this.dataset.name)" title="Team verwijderen">'
          + '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>';
      }

      tabsEl.innerHTML = html;
      lucide.createIcons();

      // Show or hide panel
      var panel = document.getElementById('entityPanel');
      if (panel) panel.style.display = activeEntity ? '' : 'none';

      // Show or hide members section
      var membersSection = document.getElementById('membersSection');
      if (membersSection) membersSection.style.display = (activeEntity && activeEntity.type === 'team') ? '' : 'none';
    }

    function selectEntity(type, id, name) {
      activeEntity = { type: type, id: id || null, name: name };
      renderEntityTabs();
      loadEntityDetails();
    }

    function loadEntityDetails() {
      if (!activeEntity) return;
      entityActivities = [];
      entityMembers    = [];
      renderEntityActivities();
      renderEntityMembers();

      if (activeEntity.type === 'team') {
        // Load activities + members in parallel
        Promise.all([
          fetch('/cx-powerboard/api/teams/' + activeEntity.id + '/activities', { credentials: 'include' }).then(function(r) { return r.json(); }),
          fetch('/cx-powerboard/api/teams/' + activeEntity.id + '/members',    { credentials: 'include' }).then(function(r) { return r.json(); })
        ]).then(function(results) {
          entityActivities = results[0] || [];
          entityMembers    = results[1] || [];
          renderEntityActivities();
          renderEntityMembers();
          populateAddMemberSelect();
        });
      } else {
        // Personal
        fetch('/cx-powerboard/api/personal-activities', { credentials: 'include' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            entityActivities = data || [];
            renderEntityActivities();
          });
      }
      populateAddActivitySelect();
    }

    function renderEntityActivities() {
      var el = document.getElementById('entityActivitiesList');
      if (!el) return;
      if (!entityActivities.length) {
        el.innerHTML = '<div class="text-xs text-base-content/40 py-2">Nog geen activiteitstypen. Klik op &lsquo;Type toevoegen&rsquo; om te starten.</div>';
        return;
      }
      // Sort descending by priority_weight so display order matches dashboard order
      entityActivities.sort(function(a, b) {
        return ((b.priority_weight !== undefined ? b.priority_weight : 10) -
                (a.priority_weight !== undefined ? a.priority_weight : 10));
      });
      var n    = entityActivities.length;
      var html = '';
      for (var i = 0; i < n; i++) {
        var a        = entityActivities[i];
        var lbl      = a.cx_activity_mapping ? a.cx_activity_mapping.odoo_activity_type_name : a.mapping_id;
        var mid      = a.mapping_id || a.id;
        var prio     = a.priority_weight !== undefined ? a.priority_weight : 10;
        var dash     = a.show_on_dashboard !== false;
        var streak   = a.include_in_streak !== false;
        var threshOv = a.danger_threshold_overdue !== undefined ? a.danger_threshold_overdue : 1;
        var threshTd = a.danger_threshold_today   !== undefined ? a.danger_threshold_today   : 3;
        var isWin    = a.cx_activity_mapping ? !!a.cx_activity_mapping.is_win : false;
        var keepDone = a.cx_activity_mapping ? !!a.cx_activity_mapping.keep_done_confirmed_at : false;
        var notes    = (a.cx_activity_mapping && a.cx_activity_mapping.notes) ? a.cx_activity_mapping.notes : '';
        var colorMode  = a.card_color_mode   || 'auto';
        var fixedColor = a.card_fixed_color  || '';
        var compPills  = !!a.card_compact_pills;
        var showSpark  = !!a.card_show_sparkline;
        var heroMetric = a.card_hero_metric  || 'auto';
        var titleOver  = a.card_title_override || '';
        var modelFilt  = (a.card_model_filter || []).join(', ');
        var pillsMode  = a.card_pills_mode || (a.card_compact_pills ? 'compact' : 'standard');
        var viewMode   = a.card_view_mode   || 'stats';
        var colorOpts  = [
          {v:'',          l:'Geen (neutraal)'},
          {v:'error',     l:'Rood'},
          {v:'warning',   l:'Oranje'},
          {v:'success',   l:'Groen'},
          {v:'info',      l:'Blauw'},
          {v:'primary',   l:'Primair'},
          {v:'secondary', l:'Secundair'},
          {v:'accent',    l:'Accent'},
          {v:'neutral',   l:'Grijs'},
        ];
        var colorOptsHtml = colorOpts.map(function(o) {
          return '<option value="' + o.v + '"' + (fixedColor === o.v ? ' selected' : '') + '>' + escHtml(o.l) + '</option>';
        }).join('');
        html += '<div class="border border-base-300 rounded-lg p-3 mb-2">'
          + '<div class="flex items-center gap-2">'
          + '<div class="flex flex-col shrink-0 -ml-1 mr-0.5">'
          +   '<button class="btn btn-xs btn-ghost px-1 py-0 h-5 min-h-0" ' + (i === 0 ? 'disabled' : '') + ' data-idx="' + i + '" data-dir="up" onclick="moveEntityActivity(+this.dataset.idx, this.dataset.dir)" title="Omhoog"><i data-lucide="chevron-up" class="w-3 h-3"></i></button>'
          +   '<button class="btn btn-xs btn-ghost px-1 py-0 h-5 min-h-0" ' + (i === n - 1 ? 'disabled' : '') + ' data-idx="' + i + '" data-dir="down" onclick="moveEntityActivity(+this.dataset.idx, this.dataset.dir)" title="Omlaag"><i data-lucide="chevron-down" class="w-3 h-3"></i></button>'
          + '</div>'
          + '<span class="font-medium text-sm flex-1">' + escHtml(lbl) + '</span>'
          + (dash   ? '<span class="badge badge-xs badge-ghost">Dashboard</span>' : '')
          + (streak ? '<span class="badge badge-xs badge-ghost">Streak</span>' : '')
          + (isWin  ? '<span class="badge badge-xs badge-success text-success-content">Win</span>' : '')
          + (keepDone ? '<span class="badge badge-xs badge-ghost text-success" title="keep_done ingesteld in Odoo">✔ keep_done</span>'
                      : '<span class="badge badge-xs badge-ghost text-warning" title="keep_done niet bevestigd — verwijder en voeg opnieuw toe">⚠️ keep_done</span>')
          + '<button class="btn btn-xs btn-ghost" data-id="' + escHtml(mid) + '" onclick="editEntityActivity(this.dataset.id)" title="Bewerken">'
          +   '<i data-lucide="pencil" class="w-3 h-3"></i>'
          + '</button>'
          + '<button class="btn btn-xs btn-ghost text-error" data-id="' + escHtml(mid) + '" onclick="removeEntityActivity(this.dataset.id)" title="Verwijderen">'
          +   '<i data-lucide="x" class="w-3 h-3"></i>'
          + '</button>'
          + '</div>'
          + (notes ? '<p class="text-xs text-base-content/50 mt-1 pl-0">' + escHtml(notes) + '</p>' : '')
          + '<div id="edit-act-' + escHtml(mid) + '" class="mt-3 pt-3 border-t border-base-300" style="display:none;">'
          +   '<div class="flex flex-wrap gap-3 mb-2">'
          +     '<div class="form-control w-24"><label class="label pb-1"><span class="label-text text-xs">Prioriteit</span></label>'
          +     '<input type="number" id="ep-' + escHtml(mid) + '" min="0" max="100" value="' + escHtml(prio) + '" class="input input-xs input-bordered" /></div>'
          +   '</div>'
          +   '<div class="flex flex-wrap gap-4 mb-2">'
          +     '<label class="flex items-center gap-2 cursor-pointer text-sm">'
          +       '<input type="checkbox" id="ew-' + escHtml(mid) + '" class="checkbox checkbox-xs"' + (isWin ? ' checked' : '') + ' /> Telt als win'
          +     '</label>'
          +     '<label class="flex items-center gap-2 cursor-pointer text-sm">'
          +       '<input type="checkbox" id="ed-' + escHtml(mid) + '" class="checkbox checkbox-xs"' + (dash ? ' checked' : '') + ' /> Dashboard kaart'
          +     '</label>'
          +     '<label class="flex items-center gap-2 cursor-pointer text-sm">'
          +       '<input type="checkbox" id="es-' + escHtml(mid) + '" class="checkbox checkbox-xs"' + (streak ? ' checked' : '') + ' /> Telt mee voor streak'
          +     '</label>'
          +   '</div>'
          // ── Kaart weergave ────────────────────────────────────────────────
          +   '<div class="divider text-xs my-2">Kaartkleur</div>'
          +   '<div class="flex gap-4 mb-2 flex-wrap">'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="ecm-' + escHtml(mid) + '" value="auto" class="radio radio-xs"' + (colorMode === 'auto' ? ' checked' : '') + ' onchange="_toggleColorMode(&quot;' + escHtml(mid) + '&quot;,&quot;auto&quot;)" /> Auto (drempelwaarden)</label>'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="ecm-' + escHtml(mid) + '" value="fixed" class="radio radio-xs"' + (colorMode === 'fixed' ? ' checked' : '') + ' onchange="_toggleColorMode(&quot;' + escHtml(mid) + '&quot;,&quot;fixed&quot;)" /> Vaste kleur</label>'
          +   '</div>'
          +   '<div id="ecm-auto-section-' + escHtml(mid) + '"' + (colorMode !== 'auto' ? ' style="display:none"' : '') + '>'
          +     '<p class="text-xs font-medium mb-1">Kleurstappen <span class="text-base-content/40 font-normal">(hoogste drempel eerst geëvalueerd)</span></p>'
          +     '<div id="steps-' + escHtml(mid) + '"></div>'
          +     '<div class="mt-2 flex gap-3">'
          +       '<div class="form-control flex-1"><label class="label pb-1"><span class="label-text text-xs">Fallback: drempel achterstallig</span></label>'
          +       '<input type="number" id="eo-' + escHtml(mid) + '" min="0" value="' + escHtml(threshOv) + '" class="input input-xs input-bordered" onchange="updateCardPreview(&quot;' + escHtml(mid) + '&quot;)" /></div>'
          +       '<div class="form-control flex-1"><label class="label pb-1"><span class="label-text text-xs">Fallback: drempel vandaag</span></label>'
          +       '<input type="number" id="et-' + escHtml(mid) + '" min="0" value="' + escHtml(threshTd) + '" class="input input-xs input-bordered" onchange="updateCardPreview(&quot;' + escHtml(mid) + '&quot;)" /></div>'
          +     '</div>'
          +   '</div>'
          +   '<div id="ecm-fixed-section-' + escHtml(mid) + '"' + (colorMode !== 'fixed' ? ' style="display:none"' : '') + '>'
          +     '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Vaste kleur</span></label>'
          +     '<select id="efc-' + escHtml(mid) + '" class="select select-xs select-bordered" onchange="updateCardPreview(&quot;' + escHtml(mid) + '&quot;)">' + colorOptsHtml + '</select></div>'
          +   '</div>'
          +   '<div class="divider text-xs my-2">Kaartweergave</div>'
          +   '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Groot getal (hero metric)</span></label>'
          +   '<select id="ehm-' + escHtml(mid) + '" class="select select-xs select-bordered" onchange="updateCardPreview(&quot;' + escHtml(mid) + '&quot;)">'
          +     '<option value="auto"'      + (heroMetric === 'auto'      ? ' selected' : '') + '>Auto (slim – op basis van voortgang)</option>'
          +     '<option value="remaining"' + (heroMetric === 'remaining' ? ' selected' : '') + '>Totaal actief (achterstallig + vandaag)</option>'
          +     '<option value="overdue"'   + (heroMetric === 'overdue'   ? ' selected' : '') + '>Alleen achterstallig</option>'
          +     '<option value="today"'     + (heroMetric === 'today'     ? ' selected' : '') + '>Alleen vandaag</option>'
          +     '<option value="completed"' + (heroMetric === 'completed' ? ' selected' : '') + '>Afgerond vandaag</option>'
          +   '</select></div>'
          +   '<div class="flex flex-wrap gap-4 mb-3">'  
          +     '<label class="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" id="esk-' + escHtml(mid) + '" class="checkbox checkbox-xs"' + (showSpark ? ' checked' : '') + ' /> Toon historiegrafiek</label>'
          +   '</div>'
          +   '<div class="divider text-xs my-2">Kaartpersonalisatie</div>'
          +   '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Kaarttitel (laat leeg voor standaard)</span></label>'
          +   '<input type="text" id="etl-' + escHtml(mid) + '" value="' + escHtml(titleOver) + '" placeholder="' + escHtml(lbl) + '" class="input input-xs input-bordered" /></div>'
          +   '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Model filter <span class="text-base-content/40 font-normal">(komma-gescheiden, bijv. crm.lead, sale.order — leeg = alles)</span></span></label>'
          +   '<input type="text" id="emf-' + escHtml(mid) + '" value="' + escHtml(modelFilt) + '" placeholder="crm.lead" class="input input-xs input-bordered font-mono" /></div>'
          +   '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Pills weergave</span></label>'
          +   '<div class="flex gap-3">'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="epm-' + escHtml(mid) + '" value="standard" class="radio radio-xs"' + (pillsMode === 'standard' ? ' checked' : '') + ' /> Standaard</label>'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="epm-' + escHtml(mid) + '" value="compact"  class="radio radio-xs"' + (pillsMode === 'compact'  ? ' checked' : '') + ' /> Compact</label>'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="epm-' + escHtml(mid) + '" value="hidden"  class="radio radio-xs"' + (pillsMode === 'hidden'  ? ' checked' : '') + ' /> Verborgen</label>'
          +   '</div></div>'
          +   '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Kaartmodus</span></label>'
          +   '<div class="flex gap-3">'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="evm-' + escHtml(mid) + '" value="stats"       class="radio radio-xs"' + (viewMode === 'stats'       ? ' checked' : '') + ' /> \uD83D\uDCCA Stats</label>'
          +     '<label class="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="evm-' + escHtml(mid) + '" value="leaderboard" class="radio radio-xs"' + (viewMode === 'leaderboard' ? ' checked' : '') + ' /> \uD83C\uDFC6 Leaderboard</label>'
          +   '</div></div>'
          +   '<div class="divider text-xs my-2">Kaartvoorbeeld</div>'
          +   '<div id="card-preview-' + escHtml(mid) + '" class="mb-3"></div>'
          +   '<div class="form-control mb-2"><label class="label pb-1"><span class="label-text text-xs">Notities</span></label>'
          +   '<input type="text" id="en-' + escHtml(mid) + '" value="' + escHtml(notes) + '" class="input input-xs input-bordered" /></div>'
          +   '<div class="flex gap-2">'
          +     '<button class="btn btn-xs btn-primary" data-id="' + escHtml(mid) + '" onclick="saveEntityActivityEdit(this.dataset.id)">Opslaan</button>'
          +     '<button class="btn btn-xs btn-ghost" data-id="' + escHtml(mid) + '" onclick="cancelEntityActivityEdit(this.dataset.id)">Annuleren</button>'
          +   '</div>'
          + '</div>'
          + '</div>';
      }
      el.innerHTML = html;
      lucide.createIcons();
    }

    function renderEntityMembers() {
      var el = document.getElementById('membersList');
      if (!el) return;
      if (!entityMembers.length) {
        el.innerHTML = '<span class="text-xs text-base-content/40">Nog geen leden.</span>';
        return;
      }
      var html = '';
      for (var i = 0; i < entityMembers.length; i++) {
        var u = entityMembers[i];
        var lbl = u.full_name || u.email;
        html += '<span class="badge badge-outline gap-1 py-3 px-2">'
          + escHtml(lbl)
          + ' <button class="ml-1 opacity-50 hover:opacity-100 text-base leading-none"'
          + ' data-id="' + escHtml(u.id) + '" onclick="removeMember(this.dataset.id)">&times;</button>'
          + '</span>';
      }
      el.innerHTML = html;
    }

    function populateAddMemberSelect() {
      var sel = document.getElementById('addMemberSelect');
      if (!sel) return;
      sel.innerHTML = '<option value="">Gebruiker toevoegen\u2026</option>';
      var memberIds = {};
      for (var i = 0; i < entityMembers.length; i++) memberIds[entityMembers[i].id] = true;
      for (var j = 0; j < allUsers.length; j++) {
        var u = allUsers[j];
        if (memberIds[u.id]) continue;
        var opt = document.createElement('option');
        opt.value       = u.id;
        opt.textContent = u.full_name || u.email;
        sel.appendChild(opt);
      }
    }

    function populateAddActivitySelect() {
      var sel = document.getElementById('addEntityActivitySelect');
      if (!sel) return;
      sel.innerHTML = '<option value="">Kies een type\u2026</option>';
      // Build set of already-configured Odoo type IDs for this entity
      var existOdooIds = {};
      for (var i = 0; i < entityActivities.length; i++) {
        var ea = entityActivities[i];
        var oId = ea.cx_activity_mapping ? ea.cx_activity_mapping.odoo_activity_type_id
                : (ea.odoo_activity_type_id || null);
        if (oId) existOdooIds[oId] = true;
      }
      // Prefer live Odoo types; fall back to registered mappings
      var useOdoo  = activityTypes.length > 0;
      var source   = useOdoo ? activityTypes : allMappings;
      for (var j = 0; j < source.length; j++) {
        var item    = source[j];
        var odooId  = useOdoo ? item.id : item.odoo_activity_type_id;
        var label   = useOdoo ? item.name : item.odoo_activity_type_name;
        if (existOdooIds[odooId]) continue;
        var opt = document.createElement('option');
        opt.value          = odooId;
        opt.dataset.name   = label;
        opt.textContent    = label;
        sel.appendChild(opt);
      }
    }

    function addMember() {
      var userId = document.getElementById('addMemberSelect').value;
      if (!userId || !activeEntity || activeEntity.type !== 'team') return;
      fetch('/cx-powerboard/api/teams/' + activeEntity.id + '/members', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      }).then(function() { return fetch('/cx-powerboard/api/teams/' + activeEntity.id + '/members', { credentials: 'include' }).then(function(r) { return r.json(); }); })
        .then(function(data) {
          entityMembers = data || [];
          renderEntityMembers();
          populateAddMemberSelect();
          document.getElementById('addMemberSelect').value = '';
        });
    }

    function removeMember(userId) {
      if (!activeEntity || activeEntity.type !== 'team') return;
      fetch('/cx-powerboard/api/teams/' + activeEntity.id + '/members/' + userId, {
        method: 'DELETE', credentials: 'include'
      }).then(function() {
        entityMembers = entityMembers.filter(function(u) { return u.id !== userId; });
        renderEntityMembers();
        populateAddMemberSelect();
      });
    }

    function toggleAddActivityForm() {
      var form   = document.getElementById('addActivityForm');
      if (!form) return;
      var hidden = form.style.display === 'none' || form.style.display === '';
      form.style.display = hidden ? '' : 'none';
      if (hidden) { populateAddActivitySelect(); lucide.createIcons(); }
    }

    function removeEntityActivity(mappingId) {
      if (!activeEntity) return;
      var url = activeEntity.type === 'team'
        ? '/cx-powerboard/api/teams/' + activeEntity.id + '/activities/' + mappingId
        : '/cx-powerboard/api/personal-activities/' + mappingId;
      fetch(url, { method: 'DELETE', credentials: 'include' }).then(function() {
        entityActivities = entityActivities.filter(function(a) {
          return (a.mapping_id || a.id) !== mappingId;
        });
        renderEntityActivities();
        populateAddActivitySelect();
      });
    }

    function saveNewEntityActivity() {
      var sel        = document.getElementById('addEntityActivitySelect');
      var odooTypeId = sel ? sel.value : '';
      if (!odooTypeId || !activeEntity) return;
      var errEl    = document.getElementById('addActivityError');
      errEl.style.display = 'none';
      var selOpt   = sel.options[sel.selectedIndex];
      var odooName = selOpt ? (selOpt.dataset.name || selOpt.textContent) : odooTypeId;
      var prio     = parseInt(document.getElementById('addActivityWeight').value || '10', 10);
      var isWin    = document.getElementById('addActivityIsWin').checked;
      var dash     = document.getElementById('addActivityDashboard').checked;
      var streak   = document.getElementById('addActivityStreak').checked;
      var threshOv = parseInt(document.getElementById('addActivityThreshOv').value || '1', 10);
      var threshTd = parseInt(document.getElementById('addActivityThreshTd').value || '3', 10);
      var notes    = document.getElementById('addActivityNotes').value.trim();
      var url = activeEntity.type === 'team'
        ? '/cx-powerboard/api/teams/' + activeEntity.id + '/activities/by-odoo-type'
        : '/cx-powerboard/api/personal-activities/by-odoo-type';
      fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          odoo_activity_type_id: parseInt(odooTypeId, 10), odoo_activity_type_name: odooName,
          priority_weight: prio, is_win: isWin, show_on_dashboard: dash, include_in_streak: streak,
          danger_threshold_overdue: threshOv, danger_threshold_today: threshTd, notes: notes
        })
      }).then(function(r) { return r.json(); }).then(function(a) {
        if (a.error) { errEl.textContent = a.error; errEl.style.display = ''; return; }
        entityActivities.push(a);
        renderEntityActivities();
        populateAddActivitySelect();
        document.getElementById('addActivityForm').style.display = 'none';
        sel.value = '';
      }).catch(function(e) { errEl.textContent = e.message; errEl.style.display = ''; });
    }

    function moveEntityActivity(idx, dir) {
      var newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= entityActivities.length) return;
      var tmp = entityActivities[idx];
      entityActivities[idx]    = entityActivities[newIdx];
      entityActivities[newIdx] = tmp;
      // Redistribute priority_weight: index 0 gets highest (n*10), descending
      var n = entityActivities.length;
      var toSave = [];
      for (var i = 0; i < n; i++) {
        var newW = (n - i) * 10;
        if (entityActivities[i].priority_weight !== newW) {
          entityActivities[i].priority_weight = newW;
          toSave.push(entityActivities[i]);
        }
      }
      renderEntityActivities(); // instant feedback
      // Persist changed weights
      Promise.all(toSave.map(function(a) {
        var mid = a.mapping_id || a.id;
        var url = activeEntity.type === 'team'
          ? '/cx-powerboard/api/teams/' + activeEntity.id + '/activities/' + mid
          : '/cx-powerboard/api/personal-activities/' + mid;
        return fetch(url, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority_weight: a.priority_weight })
        });
      })).catch(function(e) { console.warn('Volgorde opslaan mislukt:', e.message); });
    }

    function editEntityActivity(mappingId) {
      var el = document.getElementById('edit-act-' + mappingId);
      if (!el) return;
      // Initialise threshold-steps edit state from activity data
      var activity = null;
      for (var i = 0; i < entityActivities.length; i++) {
        var a2 = entityActivities[i];
        if ((a2.mapping_id || a2.id) === mappingId) { activity = a2; break; }
      }
      var existingSteps = (activity && activity.card_threshold_steps) ? activity.card_threshold_steps : [];
      _editSteps[mappingId] = existingSteps.map(function(s) {
        return { field: s.field || 'overdue', value: +(s.value || 0), color: s.color || 'error' };
      });
      el.style.display = '';
      renderStepsEditor(mappingId);
      updateCardPreview(mappingId);
      lucide.createIcons();
    }

    function cancelEntityActivityEdit(mappingId) {
      var el = document.getElementById('edit-act-' + mappingId);
      if (el) el.style.display = 'none';
    }

    function saveEntityActivityEdit(mappingId) {
      if (!activeEntity) return;
      var prio     = parseInt(document.getElementById('ep-' + mappingId).value, 10);
      var isWin    = document.getElementById('ew-' + mappingId).checked;
      var dash     = document.getElementById('ed-' + mappingId).checked;
      var streak   = document.getElementById('es-' + mappingId).checked;
      var threshOv = parseInt(document.getElementById('eo-' + mappingId).value, 10);
      var threshTd = parseInt(document.getElementById('et-' + mappingId).value, 10);
      var notes    = document.getElementById('en-' + mappingId).value.trim();
      // Card display settings
      var colorModeEl      = document.querySelector('input[name="ecm-' + mappingId + '"]:checked');
      var cardColorMode    = colorModeEl ? colorModeEl.value : 'auto';
      var fcEl             = document.getElementById('efc-' + mappingId);
      var cardFixedColor   = (fcEl && fcEl.value) ? fcEl.value : null;
      var rawSteps         = _editSteps[mappingId];
      var cardThreshSteps  = (rawSteps && rawSteps.length > 0) ? rawSteps : null;
      var cpEl             = document.getElementById('ecp-' + mappingId);
      var skEl             = document.getElementById('esk-' + mappingId);
      var hmEl             = document.getElementById('ehm-' + mappingId);
      var tlEl             = document.getElementById('etl-' + mappingId);
      var mfEl             = document.getElementById('emf-' + mappingId);
      var pmEl             = document.querySelector('input[name="epm-' + mappingId + '"]:checked');
      var vmEl             = document.querySelector('input[name="evm-' + mappingId + '"]:checked');
      var cardCompactPills = cpEl ? cpEl.checked : false;
      var cardShowSpark    = skEl ? skEl.checked  : false;
      var cardHeroMetric   = hmEl ? hmEl.value    : 'auto';
      var cardTitleOver    = tlEl ? tlEl.value.trim() : null;
      var cardModelFilter  = mfEl && mfEl.value.trim()
        ? mfEl.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
        : null;
      var cardPillsMode    = pmEl ? pmEl.value : 'standard';
      var cardViewMode     = vmEl ? vmEl.value : 'stats';

      var url = activeEntity.type === 'team'
        ? '/cx-powerboard/api/teams/' + activeEntity.id + '/activities/' + mappingId
        : '/cx-powerboard/api/personal-activities/' + mappingId;
      var p1 = fetch(url, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority_weight:          prio,
          show_on_dashboard:        dash,
          include_in_streak:        streak,
          danger_threshold_overdue: threshOv,
          danger_threshold_today:   threshTd,
          card_color_mode:          cardColorMode,
          card_fixed_color:         cardFixedColor,
          card_threshold_steps:     cardThreshSteps,
          card_compact_pills:       cardCompactPills,
          card_show_sparkline:      cardShowSpark,
          card_hero_metric:         cardHeroMetric,
          card_title_override:      cardTitleOver  || null,
          card_model_filter:        cardModelFilter || null,
          card_pills_mode:          cardPillsMode,
          card_view_mode:           cardViewMode,
        })
      }).then(function(r) { return r.json(); });
      var p2 = fetch('/cx-powerboard/api/mappings/' + mappingId, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority_weight: prio, is_win: isWin, notes: notes })
      }).then(function(r) { return r.json(); });
      Promise.all([p1, p2]).then(function(results) {
        if (results[0].error) { alert(results[0].error); return; }
        for (var i = 0; i < entityActivities.length; i++) {
          if ((entityActivities[i].mapping_id || entityActivities[i].id) === mappingId) {
            entityActivities[i].priority_weight          = prio;
            entityActivities[i].show_on_dashboard        = dash;
            entityActivities[i].include_in_streak        = streak;
            entityActivities[i].danger_threshold_overdue = threshOv;
            entityActivities[i].danger_threshold_today   = threshTd;
            entityActivities[i].card_color_mode          = cardColorMode;
            entityActivities[i].card_fixed_color         = cardFixedColor;
            entityActivities[i].card_threshold_steps     = cardThreshSteps;
            entityActivities[i].card_compact_pills       = cardCompactPills;
            entityActivities[i].card_show_sparkline      = cardShowSpark;
            entityActivities[i].card_hero_metric         = cardHeroMetric;
            entityActivities[i].card_title_override      = cardTitleOver  || null;
            entityActivities[i].card_model_filter        = cardModelFilter || null;
            entityActivities[i].card_pills_mode          = cardPillsMode;
            entityActivities[i].card_view_mode           = cardViewMode;
            if (entityActivities[i].cx_activity_mapping) {
              entityActivities[i].cx_activity_mapping.is_win = isWin;
              entityActivities[i].cx_activity_mapping.notes  = notes;
            }
            break;
          }
        }
        renderEntityActivities();
      });
    }

    function openNewTeam() {
      document.getElementById('newTeamName').value = '';
      document.getElementById('newTeamDesc').value = '';
      document.getElementById('newTeamError').style.display = 'none';
      document.getElementById('newTeamModal').showModal();
    }

    function saveNewTeam() {
      var name  = document.getElementById('newTeamName').value.trim();
      var desc  = document.getElementById('newTeamDesc').value.trim();
      var errEl = document.getElementById('newTeamError');
      if (!name) { errEl.textContent = 'Naam is verplicht.'; errEl.style.display = ''; return; }
      errEl.style.display = 'none';
      fetch('/cx-powerboard/api/teams', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, description: desc || null })
      }).then(function(r) { return r.json(); }).then(function(t) {
        if (t.error) { errEl.textContent = t.error; errEl.style.display = ''; return; }
        teams.push(t);
        document.getElementById('newTeamModal').close();
        selectEntity('team', t.id, t.name);
      }).catch(function(e) { errEl.textContent = e.message; errEl.style.display = ''; });
    }

    function deleteTeam(teamId, teamName) {
      if (!confirm('Team "' + teamName + '" verwijderen?')) return;
      fetch('/cx-powerboard/api/teams/' + teamId, { method: 'DELETE', credentials: 'include' })
        .then(function() {
          teams = teams.filter(function(t) { return t.id !== teamId; });
          if (activeEntity && activeEntity.id === teamId) activeEntity = null;
          renderEntityTabs();
        });
    }

    // ── Theme / auth ─────────────────────────────────────────────────────────
    function initTheme() {
      var saved = localStorage.getItem('selectedTheme') || 'light';
      document.documentElement.setAttribute('data-theme', saved);
      var sel = document.getElementById('themeSelector');
      if (sel) sel.value = saved;
    }

    function changeTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('selectedTheme', theme);
    }

    async function logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_) {}
      window.location.href = '/';
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    initTheme();
    lucide.createIcons();
    loadAll();
  </script>
</body>
</html>`;
}
