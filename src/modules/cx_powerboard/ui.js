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

  const settingsBtn = isManager
    ? '<a href="/cx-powerboard/settings" class="btn btn-sm btn-ghost gap-1">'
    + '<i data-lucide="settings" class="w-4 h-4"></i> Settings</a>'
    : '';

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
  </style>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <script>
    window.__PB_IS_MANAGER__ = ${isManagerJS};
  </script>

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-6xl">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-3xl font-bold">CX Powerboard</h1>
          <p class="text-base-content/60 text-sm">Jouw prioriteitenlijst voor vandaag</p>
        </div>
        ${settingsBtn}
      </div>

      <!-- Odoo UID missing warning -->
      <div id="uidMissingAlert" class="alert alert-warning mb-4" style="display:none;">
        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
        <span>Jouw Odoo-account is niet gekoppeld. Vraag een beheerder om jouw Odoo UID in te stellen via het admin dashboard.</span>
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

        <!-- Stats bar -->
        <div class="stats shadow w-full mb-6">
          <div class="stat place-items-center">
            <div class="stat-title">Open</div>
            <div class="stat-value text-2xl" id="statTotal">—</div>
          </div>
          <div class="stat place-items-center">
            <div class="stat-title">Achterstallig</div>
            <div class="stat-value text-2xl text-error" id="statOverdue">—</div>
          </div>
          <div class="stat place-items-center">
            <div class="stat-title">Vandaag</div>
            <div class="stat-value text-2xl text-warning" id="statToday">—</div>
          </div>
          <div class="stat place-items-center">
            <div class="stat-title">Wins (week)</div>
            <div class="stat-value text-2xl text-success" id="statWins">—</div>
          </div>
        </div>

        <!-- Activity type cards -->
        <div id="dashboardCards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="flex justify-center items-center py-16 col-span-full">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </div>

      </div>

      <!-- ── Calendar tab ──────────────────────────────────────────────────── -->
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

      // Group activities by activity_type_id
      var byType = {};
      for (var i = 0; i < allActivities.length; i++) {
        var a   = allActivities[i];
        var tid = String(a.activity_type_id);
        if (!byType[tid]) byType[tid] = { name: a.activity_type_name, total: 0, overdue: 0, today: 0 };
        byType[tid].total++;
        var uc = urgencyClass(a.date_deadline);
        if (uc === 'urgency-overdue')    byType[tid].overdue++;
        else if (uc === 'urgency-today') byType[tid].today++;
      }

      var html      = '';
      var cardCount = 0;
      for (var m = 0; m < mappingsData.length; m++) {
        var mapping = mappingsData[m];
        if (!mapping.show_on_dashboard) continue;

        var tid2  = String(mapping.odoo_activity_type_id);
        var stats = byType[tid2] || { total: 0, overdue: 0, today: 0 };
        var open  = stats.total - stats.overdue - stats.today;
        if (open < 0) open = 0;

        var thOv = mapping.danger_threshold_overdue != null ? mapping.danger_threshold_overdue : 1;
        var thTd = mapping.danger_threshold_today   != null ? mapping.danger_threshold_today   : 3;

        var isSuccess = stats.overdue === 0 && stats.today === 0;
        var isDanger  = !isSuccess && (stats.overdue >= thOv || stats.today >= thTd);
        var pct       = stats.total > 0 ? Math.round(100 * open / stats.total) : 100;
        var typeIntId = mapping.odoo_activity_type_id;
        cardUrls[cardCount] = {
          all:     buildOdooUrl(typeIntId, 'all'),
          overdue: buildOdooUrl(typeIntId, 'overdue'),
          today:   buildOdooUrl(typeIntId, 'today'),
          open:    buildOdooUrl(typeIntId, 'open'),
        };

        html += buildTypeCard(escHtml(mapping.odoo_activity_type_name), stats, open, isSuccess, isDanger, pct, cardCount);
        cardCount++;
      }

      if (!cardCount) {
        container.innerHTML = '<div class="text-center py-16 col-span-full text-base-content/50">'
          + '<i data-lucide="layout-dashboard" class="w-10 h-10 mx-auto mb-2"></i>'
          + '<p class="text-sm">Geen dashboard kaarten geconfigureerd.</p>'
          + '<p class="text-xs mt-1">Zet &quot;Dashboard kaart&quot; aan in de instellingen.</p>'
          + '</div>';
        lucide.createIcons();
        return;
      }

      container.innerHTML = html;
      lucide.createIcons();
    }

    function buildOdooUrl(typeId, filter) {
      if (!odooUid || !odooBaseUrl) return '#';
      var today  = new Date().toISOString().slice(0, 10);
      var domain = [['activity_type_id', '=', typeId], ['user_id', '=', odooUid]];
      if      (filter === 'overdue') domain.push(['date_deadline', '<', today]);
      else if (filter === 'today')   domain.push(['date_deadline', '=', today]);
      else if (filter === 'open')    domain.push(['date_deadline', '>', today]);
      return odooBaseUrl + '/web#model=mail.activity&view_type=list&domain=' + encodeURIComponent(JSON.stringify(domain));
    }

    function openPbCard(idx, filter, evt) {
      if (evt) evt.stopPropagation();
      var urls = cardUrls[idx];
      if (!urls) return;
      var url = filter ? urls[filter] : urls.all;
      if (url && url !== '#') window.open(url, '_blank');
    }

    function buildTypeCard(name, stats, open, isSuccess, isDanger, pct, cardIdx) {
      var cardBg, cardBorder, numCls, barCls, statusHtml;
      if (isSuccess) {
        cardBg     = 'bg-success/10';
        cardBorder = 'border border-success/30';
        numCls     = 'text-success';
        barCls     = 'bg-success';
        statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-success shrink-0">'
          + '<i data-lucide="check-circle-2" class="w-3 h-3 shrink-0"></i>Klaar</span>';
      } else if (isDanger) {
        cardBg     = 'bg-error/10';
        cardBorder = 'border border-error/25';
        numCls     = 'text-error';
        barCls     = 'bg-error';
        statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-error shrink-0">'
          + '<i data-lucide="alert-circle" class="w-3 h-3 shrink-0"></i>Aandacht</span>';
      } else {
        cardBg     = 'bg-base-100';
        cardBorder = 'border border-base-200';
        numCls     = 'text-base-content';
        barCls     = 'bg-primary';
        statusHtml = '';
      }

      var progressLabel = isSuccess
        ? 'Alles op schema'
        : (open + ' van ' + stats.total + ' op schema');

      var ovPillBase = 'inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] cursor-pointer transition-opacity hover:opacity-80';
      var tdPillBase = ovPillBase;
      var opPillBase = ovPillBase;
      var ovPillCls  = stats.overdue > 0
        ? ovPillBase + ' bg-error/15 text-error font-semibold'
        : ovPillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
      var tdPillCls  = stats.today > 0
        ? tdPillBase + ' bg-warning/15 text-warning font-semibold'
        : tdPillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
      var opPillCls  = open > 0
        ? opPillBase + ' bg-base-200 text-base-content/60 font-medium'
        : opPillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';

      var idx = cardIdx;

      return '<div class="rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ' + cardBg + ' ' + cardBorder + '" onclick="openPbCard(' + idx + ')">'
        + '<div class="flex items-start justify-between gap-2 mb-3">'
        + '<p class="font-semibold text-sm leading-snug text-base-content/80">' + name + '</p>'
        + statusHtml
        + '</div>'
        + '<div class="mb-3">'
        + '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + stats.total + '</span>'
        + '<p class="text-[0.6rem] font-medium uppercase tracking-widest text-base-content/40 mt-2">activiteiten</p>'
        + '</div>'
        + '<div class="mb-3">'
        + '<div class="flex items-center justify-between mb-1">'
        + '<span class="text-[0.65rem] text-base-content/50">' + progressLabel + '</span>'
        + '<span class="text-[0.65rem] font-semibold ' + numCls + '">' + pct + '%</span>'
        + '</div>'
        + '<div class="h-1.5 rounded-full bg-base-200 overflow-hidden">'
        + '<div class="h-full rounded-full transition-all duration-500 ' + barCls + '" style="width:' + pct + '%"></div>'
        + '</div>'
        + '</div>'
        + '<div class="flex flex-wrap gap-1.5">'
        + '<span class="' + ovPillCls + '" onclick="openPbCard(' + idx + ',&quot;overdue&quot;,event)">' + stats.overdue + '\u00a0achterstallig</span>'
        + '<span class="' + tdPillCls + '" onclick="openPbCard(' + idx + ',&quot;today&quot;,event)">' + stats.today + '\u00a0vandaag</span>'
        + '<span class="' + opPillCls + '" onclick="openPbCard(' + idx + ',&quot;open&quot;,event)">' + open + '\u00a0open</span>'
        + '</div>'
        + '</div>';
    }

    // ── Wins ──────────────────────────────────────────────────────────────────
    function renderWins() {
      if (winsRendered) return;
      winsRendered = true;
      var container = document.getElementById('winsContent');
      if (!container) return;

      if (!winsData.length) {
        container.innerHTML = '<div class="text-center py-16">'
          + '<i data-lucide="trophy" class="w-12 h-12 text-base-content/30 mx-auto mb-3"></i>'
          + '<h3 class="text-lg font-semibold mb-1">Nog geen wins</h3>'
          + '<p class="text-base-content/60">Jouw eerste win komt eraan!</p>'
          + '</div>';
        lucide.createIcons();
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
          var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
          var rows = '';
          for (var i = 0; i < team.length; i++) {
            var m     = team[i];
            var medal = medals[i] || '';
            var name  = escHtml(m.name || m.email || '—');
            rows += '<tr>'
              + '<td class="text-lg">' + medal + '</td>'
              + '<td class="font-medium">' + name + '</td>'
              + '<td class="text-center text-success font-bold">' + (m.winsThisWeek || 0) + '</td>'
              + '<td class="text-center">' + (m.openActivities || 0) + '</td>'
              + '<td class="text-center text-error">' + (m.overdue || 0) + '</td>'
              + '</tr>';
          }
          container.innerHTML = '<div class="card bg-base-100 shadow-sm">'
            + '<div class="card-body">'
            + '<h2 class="card-title mb-4">Team Leaderboard</h2>'
            + '<table class="table table-sm">'
            + '<thead><tr>'
            + '<th></th><th>Naam</th>'
            + '<th class="text-center text-success">Wins/week</th>'
            + '<th class="text-center">Open</th>'
            + '<th class="text-center text-error">Achterstallig</th>'
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

    // ── Boot ──────────────────────────────────────────────────────────────────
    fetch('/cx-powerboard/api/activities', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.odooUidMissing) {
          document.getElementById('uidMissingAlert').style.display = '';
          var cardsEl = document.getElementById('dashboardCards');
          if (cardsEl) cardsEl.innerHTML = '';
          lucide.createIcons();
          return;
        }

        var s = data.stats || {};
        document.getElementById('statTotal').textContent   = s.total        != null ? s.total        : 0;
        document.getElementById('statOverdue').textContent = s.overdue      != null ? s.overdue      : 0;
        document.getElementById('statToday').textContent   = s.dueToday     != null ? s.dueToday     : 0;
        document.getElementById('statWins').textContent    = s.winsThisWeek != null ? s.winsThisWeek : 0;

        allActivities = data.activities || [];
        winsData      = data.wins       || [];
        mappingsData  = data.mappings   || [];
        if (data.odooUid)     odooUid     = data.odooUid;
        if (data.odooBaseUrl) odooBaseUrl = data.odooBaseUrl;
        dataReady     = true;

        renderDashboard();

        // init calendar now if user already navigated to that tab
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
        <div>
          <h1 class="text-2xl font-bold">Activiteitstype mapping</h1>
          <p class="text-base-content/60 text-sm">Koppel Odoo activiteitstypes aan prioriteitgewichten</p>
        </div>
      </div>

      <!-- Add mapping form -->
      <div class="card bg-base-100 shadow-sm mb-6">
        <div class="card-body">
          <h2 class="card-title text-base mb-3">Mapping toevoegen</h2>

          <div class="flex flex-wrap gap-3 mb-3">
            <div class="form-control flex-1 min-w-48">
              <label class="label pb-1"><span class="label-text text-xs">Activiteitstype (Odoo)</span></label>
              <select id="typeSelect" class="select select-sm select-bordered">
                <option value="">Laden…</option>
              </select>
            </div>
            <div class="form-control w-28">
              <label class="label pb-1"><span class="label-text text-xs">Prioriteit (0–100)</span></label>
              <input type="number" id="newWeight" min="0" max="100" value="10" class="input input-sm input-bordered" />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 mb-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="newIsWin" class="checkbox checkbox-sm" />
              <span class="text-sm">Telt als win</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="newShowDashboard" class="checkbox checkbox-sm" checked />
              <span class="text-sm">Dashboard kaart</span>
            </label>
          </div>

          <div class="flex gap-3 mb-3">
            <div class="form-control flex-1">
              <label class="label pb-1"><span class="label-text text-xs">Drempel achterstallig</span></label>
              <input type="number" id="newThreshOv" min="0" value="1" class="input input-sm input-bordered" />
            </div>
            <div class="form-control flex-1">
              <label class="label pb-1"><span class="label-text text-xs">Drempel vandaag</span></label>
              <input type="number" id="newThreshTd" min="0" value="3" class="input input-sm input-bordered" />
            </div>
          </div>

          <div class="form-control mb-3">
            <label class="label pb-1"><span class="label-text text-xs">Notities (optioneel)</span></label>
            <input type="text" id="newNotes" class="input input-sm input-bordered" placeholder="bijv. alleen voor priority accounts" />
          </div>

          <button class="btn btn-primary btn-sm" onclick="addMapping()">
            <i data-lucide="plus" class="w-4 h-4"></i> Toevoegen
          </button>
          <div id="addError" class="text-error text-xs mt-2" style="display:none;"></div>
        </div>
      </div>

      <!-- Mappings table -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title text-base mb-3">Bestaande mappings</h2>
          <div id="mappingsLoading" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-md"></span>
          </div>
          <div id="mappingsTableWrap" style="display:none;">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Activiteitstype</th>
                  <th class="text-center">Prioriteit</th>
                  <th class="text-center">Win</th>
                  <th class="text-center">Dashboard</th>
                  <th>Notities</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="mappingsTableBody"></tbody>
            </table>
            <div id="mappingsEmpty" class="text-base-content/50 text-sm py-4 text-center" style="display:none;">
              Nog geen mappings.
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- Edit modal -->
  <dialog id="editModal" class="modal">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">Mapping bewerken</h3>
      <input type="hidden" id="editId" />
      <div class="form-control mb-3">
        <label class="label pb-1"><span class="label-text text-xs">Activiteitstype</span></label>
        <input type="text" id="editTypeName" class="input input-sm input-bordered" readonly />
      </div>
      <div class="flex gap-3 mb-3">
        <div class="form-control w-32">
          <label class="label pb-1"><span class="label-text text-xs">Prioriteit (0–100)</span></label>
          <input type="number" id="editWeight" min="0" max="100" class="input input-sm input-bordered" />
        </div>
        <div class="form-control flex-1 flex items-end pb-1">
          <label class="flex items-center gap-2 cursor-pointer mb-1">
            <input type="checkbox" id="editIsWin" class="checkbox checkbox-sm" />
            <span class="text-sm">Telt als win</span>
          </label>
        </div>
      </div>
      <div class="form-control mb-3">
        <label class="label pb-1"><span class="label-text text-xs">Notities</span></label>
        <input type="text" id="editNotes" class="input input-sm input-bordered" />
      </div>
      <div class="flex flex-wrap items-center gap-4 mb-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="editShowDashboard" class="checkbox checkbox-sm" />
          <span class="text-sm">Dashboard kaart</span>
        </label>
      </div>
      <div class="flex gap-3 mb-4">
        <div class="form-control flex-1">
          <label class="label pb-1"><span class="label-text text-xs">Drempel achterstallig</span></label>
          <input type="number" id="editThreshOv" min="0" class="input input-sm input-bordered" />
        </div>
        <div class="form-control flex-1">
          <label class="label pb-1"><span class="label-text text-xs">Drempel vandaag</span></label>
          <input type="number" id="editThreshTd" min="0" class="input input-sm input-bordered" />
        </div>
      </div>
      <div id="editError" class="text-error text-xs mb-2" style="display:none;"></div>
      <div class="modal-action">
        <button class="btn btn-sm" onclick="document.getElementById('editModal').close()">Annuleren</button>
        <button class="btn btn-primary btn-sm" onclick="saveEdit()">Opslaan</button>
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

    // ── State ────────────────────────────────────────────────────────────────
    var activityTypes = [];
    var mappings      = [];

    // ── Load data ────────────────────────────────────────────────────────────
    function loadAll() {
      Promise.all([
        fetch('/cx-powerboard/api/activity-types', { credentials: 'include' }).then(function(r) { return r.json(); }),
        fetch('/cx-powerboard/api/mappings',        { credentials: 'include' }).then(function(r) { return r.json(); })
      ]).then(function(results) {
        activityTypes = results[0] || [];
        mappings      = results[1] || [];
        renderTypeSelect();
        renderMappingsTable();
      }).catch(function(e) {
        document.getElementById('mappingsLoading').innerHTML =
          '<div class="alert alert-error">' + escHtml(e.message) + '</div>';
      });
    }

    function renderTypeSelect() {
      var sel  = document.getElementById('typeSelect');
      var html = '<option value="">Kies een type…</option>';
      // Only show types not yet mapped
      var mappedIds = {};
      for (var i = 0; i < mappings.length; i++) {
        mappedIds[mappings[i].odoo_activity_type_id] = true;
      }
      for (var j = 0; j < activityTypes.length; j++) {
        var t = activityTypes[j];
        if (!mappedIds[t.id]) {
          html += '<option value="' + escHtml(String(t.id)) + '" data-name="' + escHtml(t.name) + '">'
               + escHtml(t.name) + '</option>';
        }
      }
      sel.innerHTML = html;
    }

    function renderMappingsTable() {
      var loadingEl = document.getElementById('mappingsLoading');
      var wrapEl    = document.getElementById('mappingsTableWrap');
      var tbody     = document.getElementById('mappingsTableBody');
      var emptyEl   = document.getElementById('mappingsEmpty');

      loadingEl.style.display = 'none';
      wrapEl.style.display    = '';

      if (!mappings.length) {
        tbody.innerHTML    = '';
        emptyEl.style.display = '';
        return;
      }

      emptyEl.style.display = 'none';
      var rows = '';
      for (var i = 0; i < mappings.length; i++) {
        var m      = mappings[i];
        var winBadge = m.is_win
          ? '<span class="badge badge-success badge-sm">Win</span>'
          : '<span class="text-base-content/30">—</span>';
        rows += '<tr>'
          + '<td class="font-medium">' + escHtml(m.odoo_activity_type_name) + '</td>'
          + '<td class="text-center">' + escHtml(String(m.priority_weight)) + '</td>'
          + '<td class="text-center">' + winBadge + '</td>'
          + '<td class="text-center">' + (m.show_on_dashboard !== false ? '<span class="badge badge-sm badge-primary badge-outline">Ja</span>' : '<span class="text-base-content/30">—</span>') + '</td>'
          + '<td class="text-xs text-base-content/60">' + escHtml(m.notes || '') + '</td>'
          + '<td class="text-right">'
          + '<button class="btn btn-xs btn-ghost mr-1" onclick="openEdit(&quot;' + escHtml(String(m.id)) + '&quot;)">'
          + '<i data-lucide="pencil" class="w-3 h-3"></i></button>'
          + '<button class="btn btn-xs btn-ghost text-error" onclick="deleteMapping(&quot;' + escHtml(String(m.id)) + '&quot;)">'
          + '<i data-lucide="trash-2" class="w-3 h-3"></i></button>'
          + '</td>'
          + '</tr>';
      }
      tbody.innerHTML = rows;
      lucide.createIcons();
    }

    // ── Add mapping ──────────────────────────────────────────────────────────
    function addMapping() {
      var sel      = document.getElementById('typeSelect');
      var typeId   = parseInt(sel.value, 10);
      var typeName = sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].getAttribute('data-name') || '') : '';
      var weight   = parseInt(document.getElementById('newWeight').value, 10);
      var isWin    = document.getElementById('newIsWin').checked;
      var showDash  = document.getElementById('newShowDashboard').checked;
      var threshOv  = parseInt(document.getElementById('newThreshOv').value, 10);
      var threshTd  = parseInt(document.getElementById('newThreshTd').value, 10);
      var notes    = document.getElementById('newNotes').value.trim();
      var errEl    = document.getElementById('addError');

      errEl.style.display = 'none';

      if (!typeId || !typeName) { errEl.textContent = 'Kies een activiteitstype.'; errEl.style.display = ''; return; }
      if (isNaN(weight) || weight < 0 || weight > 100) { errEl.textContent = 'Prioriteit moet tussen 0 en 100 liggen.'; errEl.style.display = ''; return; }

      fetch('/cx-powerboard/api/mappings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odoo_activity_type_id: typeId, odoo_activity_type_name: typeName, priority_weight: weight, is_win: isWin, notes: notes || null, show_on_dashboard: showDash, danger_threshold_overdue: isNaN(threshOv) ? 1 : threshOv, danger_threshold_today: isNaN(threshTd) ? 3 : threshTd })
      })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(d) { throw new Error(d.error || 'Opslaan mislukt'); }); })
        .then(function(record) {
          mappings.push(record);
          document.getElementById('newWeight').value = '10';
          document.getElementById('newIsWin').checked = false;
          document.getElementById('newShowDashboard').checked = true;
          document.getElementById('newThreshOv').value = '1';
          document.getElementById('newThreshTd').value = '3';
          document.getElementById('newNotes').value = '';
          renderTypeSelect();
          renderMappingsTable();
        })
        .catch(function(e) { errEl.textContent = escHtml(e.message); errEl.style.display = ''; });
    }

    // ── Edit mapping ─────────────────────────────────────────────────────────
    function openEdit(id) {
      var m = null;
      for (var i = 0; i < mappings.length; i++) {
        if (String(mappings[i].id) === id) { m = mappings[i]; break; }
      }
      if (!m) return;
      document.getElementById('editId').value       = id;
      document.getElementById('editTypeName').value = m.odoo_activity_type_name;
      document.getElementById('editWeight').value   = m.priority_weight;
      document.getElementById('editIsWin').checked  = !!m.is_win;
      document.getElementById('editNotes').value    = m.notes || '';
      document.getElementById('editShowDashboard').checked = m.show_on_dashboard !== false;
      document.getElementById('editThreshOv').value = m.danger_threshold_overdue != null ? m.danger_threshold_overdue : 1;
      document.getElementById('editThreshTd').value = m.danger_threshold_today   != null ? m.danger_threshold_today   : 3;
      document.getElementById('editError').style.display = 'none';
      document.getElementById('editModal').showModal();
    }

    function saveEdit() {
      var id        = document.getElementById('editId').value;
      var weight    = parseInt(document.getElementById('editWeight').value, 10);
      var isWin     = document.getElementById('editIsWin').checked;
      var notes     = document.getElementById('editNotes').value.trim();
      var showDash  = document.getElementById('editShowDashboard').checked;
      var threshOv  = parseInt(document.getElementById('editThreshOv').value, 10);
      var threshTd  = parseInt(document.getElementById('editThreshTd').value, 10);
      var errEl  = document.getElementById('editError');

      errEl.style.display = 'none';
      if (isNaN(weight) || weight < 0 || weight > 100) {
        errEl.textContent = 'Prioriteit moet tussen 0 en 100 liggen.';
        errEl.style.display = '';
        return;
      }

      fetch('/cx-powerboard/api/mappings/' + encodeURIComponent(id), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority_weight: weight, is_win: isWin, notes: notes || null, show_on_dashboard: showDash, danger_threshold_overdue: isNaN(threshOv) ? 1 : threshOv, danger_threshold_today: isNaN(threshTd) ? 3 : threshTd })
      })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(d) { throw new Error(d.error || 'Opslaan mislukt'); }); })
        .then(function(record) {
          for (var i = 0; i < mappings.length; i++) {
            if (String(mappings[i].id) === id) { mappings[i] = record; break; }
          }
          document.getElementById('editModal').close();
          renderMappingsTable();
        })
        .catch(function(e) { errEl.textContent = escHtml(e.message); errEl.style.display = ''; });
    }

    // ── Delete mapping ───────────────────────────────────────────────────────
    function deleteMapping(id) {
      if (!confirm('Weet je zeker dat je deze mapping wilt verwijderen?')) return;
      fetch('/cx-powerboard/api/mappings/' + encodeURIComponent(id), {
        method: 'DELETE',
        credentials: 'include'
      })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(d) { throw new Error(d.error || 'Verwijderen mislukt'); }); })
        .then(function() {
          mappings = mappings.filter(function(m) { return String(m.id) !== id; });
          renderTypeSelect();
          renderMappingsTable();
        })
        .catch(function(e) { alert('Fout: ' + e.message); });
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
