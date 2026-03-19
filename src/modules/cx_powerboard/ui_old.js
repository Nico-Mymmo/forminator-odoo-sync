/**
 * CX Powerboard — UI
 *
 * Static HTML shell only. ALL dynamic rendering happens in the inline
 * <script> block via string concatenation (no nested template literals).
 *
 * Follows exact conventions of existing modules:
 *  - event-operations/ui.js
 *  - project-generator/ui.js
 *  - sales-insight-explorer/ui.js
 */

import { navbar } from '../../lib/components/navbar.js';

// ── Shared theme IIFE (matches event-operations pattern exactly) ────────────
const THEME_INIT_SCRIPT = `(function initThemeEarly() {
  try {
    var localTheme = localStorage.getItem('selectedTheme');
    var cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
    var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    var theme = localTheme || cookieTheme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();`;

// ── Tailwind CDN warning suppressor (matches event-operations pattern) ──────
const TAILWIND_SUPPRESS = `(function suppressTailwindCdnWarning() {
  var originalWarn = console.warn;
  console.warn = function patchedConsoleWarn() {
    var args = Array.prototype.slice.call(arguments);
    var firstArg = typeof args[0] === 'string' ? args[0] : '';
    if (firstArg.indexOf('cdn.tailwindcss.com should not be used in production') !== -1) return;
    return originalWarn.apply(this, args);
  };
})();`;

// ── Standard page script helpers ────────────────────────────────────────────
const PAGE_HELPERS = `
  function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('selectedTheme', theme);
  }
  function initTheme() {
    var saved = localStorage.getItem('selectedTheme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    var sel = document.getElementById('themeSelector');
    if (sel) sel.value = saved;
  }
  function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .catch(function() {})
      .finally(function() { window.location.href = '/'; });
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
`;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function cxPowerboardDashboardUI(user) {
  // Precompute all conditional blocks BEFORE template literal
  var isManager = user.role === 'admin' || user.role === 'cx_powerboard_manager';

  var settingsLink = isManager
    ? '<a href="/cx-powerboard/settings" class="btn btn-sm btn-ghost gap-1 shrink-0"><i data-lucide="settings" class="w-4 h-4"></i><span class="hidden sm:inline">Instellingen</span></a>'
    : '';

  var teamTab = isManager
    ? '<a class="tab" id="tabBtnTeam" onclick="switchTab(\'team\')"><i data-lucide="users" class="w-4 h-4 mr-1.5"></i>Team</a>'
    : '';

  var teamPanel = isManager
    ? '<div id="tabTeam" style="display:none"><div id="teamLoading" class="flex justify-center py-16"><span class="loading loading-spinner loading-lg"></span></div><div id="teamContent" style="display:none"><div class="card bg-base-100 shadow-xl overflow-hidden"><div class="card-body p-0"><table class="table"><thead><tr class="border-b border-base-200"><th class="w-10 text-center">#</th><th>Naam</th><th class="text-center text-warning">Wins/week</th><th class="text-center">Open</th><th class="text-center text-error">Achterstallig</th></tr></thead><tbody id="teamBody"></tbody></table></div></div></div></div>'
    : '';

  var isManagerJs = isManager ? 'true' : 'false';

  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CX Powerboard</title>
    <script>${THEME_INIT_SCRIPT}</script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script>${TAILWIND_SUPPRESS}</script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
      .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    </style>
</head>
<body class="bg-base-200 min-h-screen">
    ${navbar(user)}

    <div style="padding-top: 48px;">

      <!-- Loading -->
      <div id="loadingState" class="flex flex-col items-center justify-center min-h-screen">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="mt-4 text-base-content/50">Activiteiten ophalen…</p>
      </div>

      <!-- Odoo not linked -->
      <div id="linkError" class="container mx-auto px-6 py-16 max-w-lg text-center" style="display: none;">
        <div class="alert alert-warning shadow-lg">
          <i data-lucide="alert-triangle" class="w-6 h-6 shrink-0"></i>
          <div class="text-left">
            <h3 class="font-bold">Odoo-account niet gekoppeld</h3>
            <p class="text-sm mt-1">Vraag je beheerder om jouw Odoo UID in te stellen via Admin → gebruiker → # knop.</p>
          </div>
        </div>
      </div>

      <!-- App shell -->
      <div id="appShell" style="display: none;">

        <!-- Stats bar -->
        <div class="bg-base-100 border-b border-base-200 sticky top-12 z-30 shadow-sm">
          <div class="container mx-auto px-4 sm:px-6 max-w-5xl">
            <div class="flex items-center gap-5 h-14 overflow-x-auto">
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="statTotal" class="text-2xl font-black leading-none">—</span>
                <span class="text-xs text-base-content/40">open</span>
              </div>
              <div class="w-px h-6 bg-base-300 shrink-0"></div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="statOverdue" class="text-2xl font-black text-error leading-none">—</span>
                <span class="text-xs text-base-content/40">achterstallig</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="statToday" class="text-2xl font-black text-warning leading-none">—</span>
                <span class="text-xs text-base-content/40">vandaag</span>
              </div>
              <div class="w-px h-6 bg-base-300 shrink-0"></div>
              <div class="flex items-center gap-1.5 shrink-0">
                <i data-lucide="trophy" class="w-4 h-4 text-warning shrink-0"></i>
                <span id="statWins" class="text-2xl font-black text-warning leading-none">—</span>
                <span class="text-xs text-base-content/40">wins/week</span>
              </div>
            </div>
          </div>
        </div>

        <div class="container mx-auto px-4 sm:px-6 py-6 max-w-5xl">

          <!-- Tab bar -->
          <div class="flex items-center justify-between mb-5 gap-4">
            <div class="tabs tabs-boxed bg-base-100 shadow-sm">
              <a class="tab tab-active" id="tabBtnQueue" onclick="switchTab('queue')">
                <i data-lucide="list-checks" class="w-4 h-4 mr-1.5"></i>
                Queue
                <span id="tabQueueCount" class="badge badge-sm badge-neutral ml-2">0</span>
              </a>
              <a class="tab" id="tabBtnWins" onclick="switchTab('wins')">
                <i data-lucide="trophy" class="w-4 h-4 mr-1.5"></i>
                Wins
                <span id="tabWinsCount" class="badge badge-sm badge-warning ml-2">0</span>
              </a>
              ${teamTab}
            </div>
            ${settingsLink}
          </div>

          <!-- Model filter chips (queue only) -->
          <div id="modelFilters" class="flex flex-wrap gap-2 mb-5"></div>

          <!-- QUEUE TAB -->
          <div id="tabQueue">
            <div id="emptyQueue" class="text-center py-20" style="display: none;">
              <div class="text-7xl mb-4">🎉</div>
              <h2 class="text-2xl font-bold mb-2">Queue leeg!</h2>
              <p class="text-base-content/50">Helemaal bij — uitstekend werk.</p>
            </div>

            <div id="sectionOverdue" class="mb-8" style="display: none;">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-error font-bold text-xs uppercase tracking-widest">Achterstallig</span>
                <span id="badgeOverdue" class="badge badge-error badge-sm font-bold">0</span>
              </div>
              <div id="cardsOverdue" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

            <div id="sectionToday" class="mb-8" style="display: none;">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-warning font-bold text-xs uppercase tracking-widest">Vandaag</span>
                <span id="badgeToday" class="badge badge-warning badge-sm font-bold">0</span>
              </div>
              <div id="cardsToday" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

            <div id="sectionUpcoming" class="mb-8" style="display: none;">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-success font-bold text-xs uppercase tracking-widest">Ingepland</span>
                <span id="badgeUpcoming" class="badge badge-success badge-sm font-bold">0</span>
              </div>
              <div id="cardsUpcoming" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

            <div id="sectionNoDue" class="mb-8" style="display: none;">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-base-content/40 font-bold text-xs uppercase tracking-widest">Geen deadline</span>
                <span id="badgeNoDue" class="badge badge-ghost badge-sm">0</span>
              </div>
              <div id="cardsNoDue" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>
          </div>

          <!-- WINS TAB -->
          <div id="tabWins" style="display: none;">
            <div class="text-center py-10 mb-6">
              <div id="winsHeroNumber" class="text-8xl font-black text-warning leading-none">0</div>
              <p class="text-base-content/50 mt-3 text-lg">wins deze week</p>
              <div class="flex justify-center gap-8 mt-5">
                <div class="text-center">
                  <div id="winsTotalNum" class="text-3xl font-bold">0</div>
                  <div class="text-xs text-base-content/40 mt-0.5">totaal ooit</div>
                </div>
              </div>
            </div>
            <div id="emptyWins" class="text-center py-10 text-base-content/40" style="display: none;">
              <div class="text-5xl mb-4">🌱</div>
              <p class="font-semibold text-lg">Nog geen wins geregistreerd.</p>
              <p class="text-sm mt-2 max-w-sm mx-auto">Activiteiten in Odoo afvinken detecteert automatisch wins.</p>
            </div>
            <div id="winsCards" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"></div>
          </div>

          <!-- TEAM TAB (manager only) -->
          ${teamPanel}

        </div>
      </div>

    </div>

    <script>
      ${PAGE_HELPERS}

      var IS_MANAGER   = ${isManagerJs};
      var allActivities = [];
      var activeModel   = 'all';
      var teamLoaded    = false;

      var MODEL_META = {
        'crm.lead':        { label: 'CRM Lead',    icon: 'target',        color: 'badge-primary'   },
        'sale.order':      { label: 'Sales Order', icon: 'shopping-cart', color: 'badge-secondary' },
        'res.partner':     { label: 'Contact',      icon: 'user',          color: 'badge-accent'    },
        'account.move':    { label: 'Factuur',      icon: 'file-text',     color: 'badge-warning'   },
        'helpdesk.ticket': { label: 'Ticket',       icon: 'help-circle',   color: 'badge-info'      },
        'project.task':    { label: 'Taak',         icon: 'check-square',  color: 'badge-success'   }
      };

      // ── Tab switching ───────────────────────────────────────────────────
      function switchTab(name) {
        var tabs = ['queue', 'wins', 'team'];
        for (var i = 0; i < tabs.length; i++) {
          var t   = tabs[i];
          var cap = t.charAt(0).toUpperCase() + t.slice(1);
          var el  = document.getElementById('tab' + cap);
          var btn = document.getElementById('tabBtn' + cap);
          if (el)  el.style.display = (t === name) ? 'block' : 'none';
          if (btn) {
            if (t === name) btn.classList.add('tab-active');
            else            btn.classList.remove('tab-active');
          }
        }
        var mf = document.getElementById('modelFilters');
        if (mf) mf.style.display = (name === 'queue') ? 'flex' : 'none';
        if (name === 'team' && !teamLoaded) { teamLoaded = true; loadTeam(); }
        lucide.createIcons();
      }

      // ── Helpers ─────────────────────────────────────────────────────────
      function priorityBadge(w) {
        if (!w)   return '<span class="badge badge-ghost badge-xs text-base-content/25">—</span>';
        if (w >= 8) return '<span class="badge badge-error badge-sm font-bold">P' + w + '</span>';
        if (w >= 5) return '<span class="badge badge-warning badge-sm font-bold">P' + w + '</span>';
        return '<span class="badge badge-neutral badge-sm">P' + w + '</span>';
      }

      function modelBadge(model) {
        var m = MODEL_META[model];
        if (!m) {
          var short = (model || '').split('.').pop() || '?';
          return '<span class="badge badge-ghost badge-xs capitalize">' + escHtml(short) + '</span>';
        }
        return '<span class="badge ' + m.color + ' badge-xs">' + escHtml(m.label) + '</span>';
      }

      function activityIcon(name) {
        if (!name) return 'zap';
        var n = name.toLowerCase();
        if (n.indexOf('call') !== -1 || n.indexOf('bel') !== -1 || n.indexOf('phone') !== -1) return 'phone-call';
        if (n.indexOf('email') !== -1 || n.indexOf('mail') !== -1) return 'mail';
        if (n.indexOf('meeting') !== -1 || n.indexOf('vergadering') !== -1 || n.indexOf('afspraak') !== -1) return 'users';
        if (n.indexOf('task') !== -1 || n.indexOf('taak') !== -1 || n.indexOf('todo') !== -1) return 'check-square';
        if (n.indexOf('document') !== -1 || n.indexOf('contract') !== -1) return 'file-text';
        if (n.indexOf('herinner') !== -1 || n.indexOf('reminder') !== -1 || n.indexOf('follow') !== -1) return 'bell';
        return 'zap';
      }

      function urgencyOf(deadline) {
        if (!deadline) return 'nodue';
        var d = new Date(deadline);
        var t = new Date(); t.setHours(0, 0, 0, 0);
        var diff = Math.round((d - t) / 86400000);
        if (diff < 0)   return 'overdue';
        if (diff === 0) return 'today';
        return 'upcoming';
      }

      function deadlineLabel(deadline) {
        if (!deadline) return '';
        var d    = new Date(deadline);
        var t    = new Date(); t.setHours(0, 0, 0, 0);
        var diff = Math.round((d - t) / 86400000);
        if (diff < 0)   return '<span class="text-error text-xs font-bold">' + Math.abs(diff) + 'd te laat</span>';
        if (diff === 0) return '<span class="text-warning text-xs font-bold">Vandaag</span>';
        if (diff === 1) return '<span class="text-warning text-xs">Morgen</span>';
        return '<span class="text-base-content/40 text-xs">' + d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + '</span>';
      }

      function borderColor(urgency) {
        if (urgency === 'overdue')  return 'border-l-error';
        if (urgency === 'today')    return 'border-l-warning';
        if (urgency === 'upcoming') return 'border-l-success';
        return 'border-l-base-300';
      }

      function formatWonAt(ts) {
        var d  = new Date(ts);
        var ms = Date.now() - d;
        if (ms < 3600000)   return Math.round(ms / 60000) + ' min geleden';
        if (ms < 86400000)  return Math.round(ms / 3600000) + ' uur geleden';
        if (ms < 604800000) return Math.round(ms / 86400000) + 'd geleden';
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
      }

      // ── Activity card (string concatenation — no nested template literals) ──
      function activityCard(a) {
        var urgency    = urgencyOf(a.date_deadline);
        var border     = borderColor(urgency);
        var pBadge     = priorityBadge(a.priority_weight);
        var mBadge     = modelBadge(a.res_model);
        var dLabel     = deadlineLabel(a.date_deadline);
        var icon       = activityIcon(a.activity_type_name);
        var recordName = escHtml(a.res_name || '—');
        var typeName   = escHtml(a.activity_type_name);
        var note       = (a.summary || a.note) ? escHtml(a.summary || a.note) : '';

        var html = '<div class="card bg-base-100 shadow-sm hover:shadow-md border border-base-200 border-l-[3px] ' + border + '">';
        html    += '<div class="card-body p-4 gap-0">';
        html    += '<div class="flex items-start justify-between gap-2 mb-2">';
        html    += '<div class="flex flex-wrap gap-1.5">' + pBadge + mBadge + '</div>';
        html    += '<div class="shrink-0">' + dLabel + '</div>';
        html    += '</div>';
        html    += '<div class="font-bold text-[15px] leading-snug">' + recordName + '</div>';
        html    += '<div class="flex items-center gap-1.5 mt-2">';
        html    += '<i data-lucide="' + icon + '" class="w-3 h-3 text-primary/70 shrink-0"></i>';
        html    += '<span class="text-xs text-primary font-semibold">' + typeName + '</span>';
        html    += '</div>';
        if (note) html += '<p class="text-xs text-base-content/50 mt-2 line-clamp-2">' + note + '</p>';
        html    += '</div></div>';
        return html;
      }

      // ── Win card ─────────────────────────────────────────────────────────
      function winCard(w) {
        var typeName = escHtml(w.activity_type_name);
        var time     = formatWonAt(w.won_at);
        var pBadge   = (w.priority_weight >= 5) ? priorityBadge(w.priority_weight) : '';

        var html  = '<div class="card bg-base-100 shadow-sm border border-warning/20 hover:shadow-md">';
        html     += '<div class="card-body p-4">';
        html     += '<div class="flex items-center gap-3">';
        html     += '<div class="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">';
        html     += '<i data-lucide="trophy" class="w-5 h-5 text-warning"></i>';
        html     += '</div>';
        html     += '<div class="min-w-0 flex-1">';
        html     += '<div class="font-bold text-sm leading-snug">' + typeName + '</div>';
        html     += '<div class="text-xs text-base-content/40 mt-0.5">' + time + '</div>';
        html     += '</div>';
        if (pBadge) html += pBadge;
        html     += '</div></div></div>';
        return html;
      }

      // ── Model filter chips ───────────────────────────────────────────────
      function renderModelFilters(activities) {
        var container = document.getElementById('modelFilters');
        var models    = [];
        for (var i = 0; i < activities.length; i++) {
          var m = activities[i].res_model;
          if (m && models.indexOf(m) === -1) models.push(m);
        }
        if (models.length <= 1) { container.innerHTML = ''; return; }

        var allClass = 'badge badge-md cursor-pointer ' + (activeModel === 'all' ? 'badge-neutral' : 'badge-outline');
        var html = '<button class="' + allClass + '" onclick="filterModel(\'all\')">Alles (' + activities.length + ')</button>';

        for (var j = 0; j < models.length; j++) {
          var mod   = models[j];
          var meta  = MODEL_META[mod];
          var label = meta ? meta.label : mod.split('.').pop();
          var count = 0;
          for (var k = 0; k < activities.length; k++) { if (activities[k].res_model === mod) count++; }
          var active = (activeModel === mod);
          var cls    = 'badge badge-md cursor-pointer ' + (active ? (meta ? meta.color : 'badge-neutral') : 'badge-outline');
          html += '<button class="' + cls + '" onclick="filterModel(\'' + escHtml(mod) + '\')">' + escHtml(label) + ' (' + count + ')</button>';
        }
        container.innerHTML = html;
      }

      function filterModel(model) {
        activeModel = model;
        renderModelFilters(allActivities);
        renderQueue(allActivities);
      }

      // ── Render queue ─────────────────────────────────────────────────────
      function renderQueue(activities) {
        var filtered = [];
        for (var i = 0; i < activities.length; i++) {
          if (activeModel === 'all' || activities[i].res_model === activeModel) filtered.push(activities[i]);
        }
        document.getElementById('tabQueueCount').textContent = filtered.length;

        var groups = { overdue: [], today: [], upcoming: [], nodue: [] };
        for (var j = 0; j < filtered.length; j++) {
          var u = urgencyOf(filtered[j].date_deadline);
          groups[u].push(filtered[j]);
        }

        document.getElementById('emptyQueue').style.display = filtered.length === 0 ? 'block' : 'none';

        function renderGroup(key, sectionId, cardsId, badgeId) {
          var items = groups[key];
          var sec   = document.getElementById(sectionId);
          if (!items.length) { sec.style.display = 'none'; return; }
          sec.style.display = 'block';
          document.getElementById(badgeId).textContent = items.length;
          var html = '';
          for (var k = 0; k < items.length; k++) html += activityCard(items[k]);
          document.getElementById(cardsId).innerHTML = html;
        }

        renderGroup('overdue',  'sectionOverdue',  'cardsOverdue',  'badgeOverdue');
        renderGroup('today',    'sectionToday',    'cardsToday',    'badgeToday');
        renderGroup('upcoming', 'sectionUpcoming', 'cardsUpcoming', 'badgeUpcoming');
        renderGroup('nodue',    'sectionNoDue',    'cardsNoDue',    'badgeNoDue');
        lucide.createIcons();
      }

      // ── Render wins ──────────────────────────────────────────────────────
      function renderWins(wins, stats) {
        var weekWins = (stats && stats.winsThisWeek) ? stats.winsThisWeek : 0;
        document.getElementById('winsHeroNumber').textContent = weekWins;
        document.getElementById('winsTotalNum').textContent   = wins.length;
        document.getElementById('tabWinsCount').textContent   = weekWins;

        if (!wins.length) {
          document.getElementById('emptyWins').style.display = 'block';
          document.getElementById('winsCards').innerHTML = '';
        } else {
          document.getElementById('emptyWins').style.display = 'none';
          var html = '';
          for (var i = 0; i < wins.length; i++) html += winCard(wins[i]);
          document.getElementById('winsCards').innerHTML = html;
        }
        lucide.createIcons();
      }

      // ── Render stats bar ─────────────────────────────────────────────────
      function renderStats(stats) {
        document.getElementById('statTotal').textContent   = (stats && stats.total        != null) ? stats.total        : '—';
        document.getElementById('statOverdue').textContent = (stats && stats.overdue      != null) ? stats.overdue      : '—';
        document.getElementById('statToday').textContent   = (stats && stats.dueToday     != null) ? stats.dueToday     : '—';
        document.getElementById('statWins').textContent    = (stats && stats.winsThisWeek != null) ? stats.winsThisWeek : '—';
      }

      // ── Team tab (manager only) ───────────────────────────────────────────
      function loadTeam() {
        fetch('/cx-powerboard/api/team', { credentials: 'include' })
          .then(function(r) { return r.json(); })
          .then(function(data) { renderTeam(data.team || []); })
          .catch(function(e) {
            var el = document.getElementById('teamLoading');
            if (el) el.innerHTML = '<div class="alert alert-error m-4"><span>Laden mislukt: ' + escHtml(e.message) + '</span></div>';
          });
      }

      function renderTeam(team) {
        var loadEl    = document.getElementById('teamLoading');
        var contentEl = document.getElementById('teamContent');
        if (loadEl)    loadEl.style.display    = 'none';
        if (contentEl) contentEl.style.display = 'block';

        var medals = ['🥇', '🥈', '🥉'];
        if (!team.length) {
          document.getElementById('teamBody').innerHTML =
            '<tr><td colspan="5" class="text-center py-8 text-base-content/40">Geen teamleden met Odoo-koppeling gevonden.</td></tr>';
          return;
        }

        var html = '';
        for (var i = 0; i < team.length; i++) {
          var m          = team[i];
          var rankCell   = i < 3 ? medals[i] : '<span class="text-base-content/30 text-sm">' + (i + 1) + '</span>';
          var winsCell   = m.winsThisWeek > 0 ? '<span class="text-warning font-black text-xl">' + m.winsThisWeek + '</span>' : '<span class="text-base-content/25">—</span>';
          var openCell   = m.openActivities || '—';
          var overdueCell = m.overdue > 0 ? '<span class="text-error font-bold">' + m.overdue + '</span>' : '<span class="text-base-content/25">—</span>';
          var rowClass   = i === 0 ? 'bg-warning/5' : '';
          html += '<tr class="' + rowClass + '">';
          html += '<td class="text-center text-lg">' + rankCell + '</td>';
          html += '<td><div class="font-semibold">' + escHtml(m.name) + '</div><div class="text-xs text-base-content/40">' + escHtml(m.email) + '</div></td>';
          html += '<td class="text-center">' + winsCell + '</td>';
          html += '<td class="text-center text-base-content/60">' + openCell + '</td>';
          html += '<td class="text-center">' + overdueCell + '</td>';
          html += '</tr>';
        }
        document.getElementById('teamBody').innerHTML = html;
        lucide.createIcons();
      }

      // ── Main load ─────────────────────────────────────────────────────────
      function loadDashboard() {
        fetch('/cx-powerboard/api/activities', { credentials: 'include' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            document.getElementById('loadingState').style.display = 'none';

            if (data.odooUidMissing) {
              document.getElementById('linkError').style.display = 'block';
              lucide.createIcons();
              return;
            }

            document.getElementById('appShell').style.display = 'block';
            allActivities = data.activities || [];
            renderStats(data.stats || {});
            renderModelFilters(allActivities);
            renderQueue(allActivities);
            renderWins(data.wins || [], data.stats || {});
          })
          .catch(function(err) {
            document.getElementById('loadingState').innerHTML =
              '<div class="container mx-auto px-6 py-16 max-w-lg">' +
              '<div class="alert alert-error"><span>Laden mislukt: ' + escHtml(err.message) + '</span></div></div>';
          });
      }

      initTheme();
      lucide.createIcons();
      loadDashboard();
    </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export function cxPowerboardSettingsUI(user) {
  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CX Powerboard — Instellingen</title>
    <script>${THEME_INIT_SCRIPT}</script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script>${TAILWIND_SUPPRESS}</script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}

    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-4xl">

        <!-- Header -->
        <div class="flex items-center gap-4 mb-8">
          <a href="/cx-powerboard" class="btn btn-sm btn-ghost">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
          </a>
          <div>
            <h1 class="text-3xl font-bold mb-1">Activiteitsmapping</h1>
            <p class="text-base-content/50 text-sm">Welke Odoo-activiteitstypes worden bijgehouden, met welke prioriteit, en welke tellen als win.</p>
          </div>
        </div>

        <!-- Loading -->
        <div id="loadingState" class="flex justify-center items-center py-16">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4">Laden…</span>
        </div>

        <!-- Main content -->
        <div id="mainContent" style="display: none;">
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div class="flex justify-between items-center mb-4">
                <h2 class="card-title">Mappings</h2>
                <button id="addBtn" class="btn btn-primary btn-sm">
                  <i data-lucide="plus" class="w-4 h-4 mr-1"></i>
                  Toevoegen
                </button>
              </div>

              <div id="emptyState" class="text-center py-8 text-base-content/40" style="display: none;">
                <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3"></i>
                <p>Nog geen mappings. Voeg een activiteitstype toe.</p>
              </div>

              <div class="overflow-x-auto" id="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Activiteitstype (Odoo)</th>
                      <th class="text-center">Prioriteit</th>
                      <th class="text-center">Is Win</th>
                      <th class="text-right">Acties</th>
                    </tr>
                  </thead>
                  <tbody id="mappingsBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal -->
        <dialog id="mappingModal" class="modal">
          <div class="modal-box max-w-lg">
            <h3 id="modalTitle" class="font-bold text-lg mb-4">Mapping toevoegen</h3>

            <div id="typePickerWrap" class="form-control mb-4">
              <label class="label"><span class="label-text">Odoo activiteitstype</span></label>
              <select id="odooTypeSelect" class="select select-bordered">
                <option value="">Laden…</option>
              </select>
            </div>

            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Prioriteitsgewicht</span>
                <span class="label-text-alt text-base-content/40">1 = laag · 10 = hoogst</span>
              </label>
              <input type="number" id="weightInput" class="input input-bordered" min="1" max="10" value="5" />
            </div>

            <div class="form-control mb-6">
              <label class="label cursor-pointer justify-start gap-4">
                <input type="checkbox" id="isWinCheck" class="checkbox checkbox-success" />
                <span class="label-text">Telt als win wanneer afgevinkt in Odoo</span>
              </label>
            </div>

            <div id="modalError" class="alert alert-error mb-4" style="display: none;"></div>

            <div class="modal-action">
              <button class="btn btn-ghost" onclick="document.getElementById('mappingModal').close()">Annuleren</button>
              <button id="saveBtn" class="btn btn-primary">Opslaan</button>
            </div>
          </div>
        </dialog>

      </div>
    </div>

    <script>
      ${PAGE_HELPERS}

      var odooTypes = [];
      var mappings  = [];
      var editingId = null;

      function loadAll() {
        Promise.all([
          fetch('/cx-powerboard/api/mappings',       { credentials: 'include' }).then(function(r) { return r.json(); }),
          fetch('/cx-powerboard/api/activity-types', { credentials: 'include' }).then(function(r) { return r.json(); })
        ]).then(function(results) {
          mappings  = results[0];
          odooTypes = results[1];
          document.getElementById('loadingState').style.display = 'none';
          document.getElementById('mainContent').style.display  = 'block';
          renderMappings();
          lucide.createIcons();
        }).catch(function(e) {
          document.getElementById('loadingState').innerHTML =
            '<div class="alert alert-error"><span>Laden mislukt: ' + escHtml(e.message) + '</span></div>';
        });
      }

      function renderMappings() {
        if (!mappings.length) {
          document.getElementById('emptyState').style.display = 'block';
          document.getElementById('tableWrap').style.display  = 'none';
          return;
        }
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('tableWrap').style.display  = 'block';

        var html = '';
        for (var i = 0; i < mappings.length; i++) {
          var m       = mappings[i];
          var winBadge = m.is_win
            ? '<span class="badge badge-success gap-1"><i data-lucide="trophy" class="w-3 h-3"></i>Win</span>'
            : '<span class="badge badge-ghost text-base-content/30">—</span>';

          html += '<tr>';
          html += '<td class="font-medium">' + escHtml(m.odoo_activity_type_name) + '</td>';
          html += '<td class="text-center font-mono">' + m.priority_weight + '</td>';
          html += '<td class="text-center">' + winBadge + '</td>';
          html += '<td class="text-right">';
          html += '<button class="btn btn-ghost btn-xs mr-1" onclick="openEdit(\'' + escHtml(m.id) + '\')">';
          html += '<i data-lucide="pencil" class="w-3 h-3"></i></button>';
          html += '<button class="btn btn-ghost btn-xs text-error" onclick="confirmDelete(\'' + escHtml(m.id) + '\')">';
          html += '<i data-lucide="trash-2" class="w-3 h-3"></i></button>';
          html += '</td></tr>';
        }
        document.getElementById('mappingsBody').innerHTML = html;
        lucide.createIcons();
      }

      function openAdd() {
        editingId = null;
        document.getElementById('modalTitle').textContent  = 'Mapping toevoegen';
        document.getElementById('weightInput').value       = 5;
        document.getElementById('isWinCheck').checked      = false;
        document.getElementById('modalError').style.display = 'none';

        // Build used-type set
        var usedIds = {};
        for (var i = 0; i < mappings.length; i++) usedIds[mappings[i].odoo_activity_type_id] = true;

        var available = [];
        for (var j = 0; j < odooTypes.length; j++) { if (!usedIds[odooTypes[j].id]) available.push(odooTypes[j]); }

        var opts = '';
        if (!available.length) {
          opts = '<option value="" disabled>Alle types zijn al gemapped</option>';
        } else {
          for (var k = 0; k < available.length; k++) {
            opts += '<option value="' + available[k].id + '" data-name="' + escHtml(available[k].name) + '">' + escHtml(available[k].name) + '</option>';
          }
        }

        document.getElementById('typePickerWrap').innerHTML =
          '<label class="label"><span class="label-text">Odoo activiteitstype</span></label>' +
          '<select id="odooTypeSelect" class="select select-bordered">' + opts + '</select>';

        document.getElementById('mappingModal').showModal();
      }

      function openEdit(id) {
        var m = null;
        for (var i = 0; i < mappings.length; i++) { if (mappings[i].id === id) { m = mappings[i]; break; } }
        if (!m) return;
        editingId = id;
        document.getElementById('modalTitle').textContent   = 'Mapping bewerken';
        document.getElementById('weightInput').value        = m.priority_weight;
        document.getElementById('isWinCheck').checked       = m.is_win;
        document.getElementById('modalError').style.display = 'none';
        document.getElementById('typePickerWrap').innerHTML =
          '<label class="label"><span class="label-text">Odoo activiteitstype</span></label>' +
          '<input class="input input-bordered bg-base-200" value="' + escHtml(m.odoo_activity_type_name) + '" disabled />';
        document.getElementById('mappingModal').showModal();
      }

      document.getElementById('addBtn').addEventListener('click', openAdd);

      document.getElementById('saveBtn').addEventListener('click', function() {
        var errEl  = document.getElementById('modalError');
        var weight = parseInt(document.getElementById('weightInput').value, 10);
        var isWin  = document.getElementById('isWinCheck').checked;
        errEl.style.display = 'none';

        if (!weight || weight < 1 || weight > 10) {
          errEl.textContent   = 'Prioriteitsgewicht moet tussen 1 en 10 liggen.';
          errEl.style.display = 'flex';
          return;
        }

        var url, method, body;
        if (editingId) {
          url    = '/cx-powerboard/api/mappings/' + editingId;
          method = 'PUT';
          body   = { priority_weight: weight, is_win: isWin };
        } else {
          var sel      = document.getElementById('odooTypeSelect');
          var typeId   = parseInt(sel ? sel.value : '', 10);
          var typeName = (sel && sel.options && sel.options[sel.selectedIndex]) ? (sel.options[sel.selectedIndex].dataset.name || '') : '';
          if (!typeId) {
            errEl.textContent   = 'Selecteer een activiteitstype.';
            errEl.style.display = 'flex';
            return;
          }
          url    = '/cx-powerboard/api/mappings';
          method = 'POST';
          body   = { odoo_activity_type_id: typeId, odoo_activity_type_name: typeName, priority_weight: weight, is_win: isWin };
        }

        var btn = document.getElementById('saveBtn');
        btn.disabled = true;
        fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body)
        })
          .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
          .then(function(res) {
            if (!res.ok) throw new Error(res.data.error || 'Opslaan mislukt');
            document.getElementById('mappingModal').close();
            loadAll();
          })
          .catch(function(e) {
            errEl.textContent   = e.message;
            errEl.style.display = 'flex';
          })
          .finally(function() { btn.disabled = false; });
      });

      function confirmDelete(id) {
        if (!confirm('Mapping verwijderen?')) return;
        fetch('/cx-powerboard/api/mappings/' + id, { method: 'DELETE', credentials: 'include' })
          .then(function(r) { if (r.ok) loadAll(); });
      }

      initTheme();
      lucide.createIcons();
      loadAll();
    </script>
</body>
</html>`;
}


const THEME_INIT = `(function initThemeEarly() {
  try {
    const localTheme = localStorage.getItem('selectedTheme');
    const cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
    const cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    const theme = localTheme || cookieTheme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();`;

const COMMON_JS = `
  function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('selectedTheme', theme);
  }
  function initTheme() {
    const saved = localStorage.getItem('selectedTheme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const sel = document.getElementById('themeSelector');
    if (sel) sel.value = saved;
  }
  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
    window.location.href = '/';
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
`;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function cxPowerboardDashboardUI(user) {
  const isManager = user.role === 'admin' || user.role === 'cx_powerboard_manager';

  const MODEL_META_JSON = JSON.stringify({
    'crm.lead':         { label: 'CRM Lead',     icon: 'target',        color: 'badge-primary'   },
    'sale.order':       { label: 'Sales Order',  icon: 'shopping-cart', color: 'badge-secondary' },
    'res.partner':      { label: 'Contact',       icon: 'user',          color: 'badge-accent'    },
    'account.move':     { label: 'Factuur',       icon: 'file-text',     color: 'badge-warning'   },
    'helpdesk.ticket':  { label: 'Ticket',        icon: 'help-circle',   color: 'badge-info'      },
    'project.task':     { label: 'Taak',          icon: 'check-square',  color: 'badge-success'   },
    'project.project':  { label: 'Project',       icon: 'folder',        color: 'badge-ghost'     },
    'stock.picking':    { label: 'Levering',      icon: 'truck',         color: 'badge-neutral'   },
    'purchase.order':   { label: 'Aankoop',       icon: 'package',       color: 'badge-neutral'   },
  });

  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CX Powerboard</title>
    <script>${THEME_INIT}</script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
    <script>
      (function() {
        const w = console.warn;
        console.warn = function(...a) {
          if (typeof a[0] === 'string' && a[0].includes('cdn.tailwindcss.com')) return;
          w.apply(this, a);
        };
      })();
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
      .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .tabular-nums { font-variant-numeric: tabular-nums; }
      .activity-card { transition: box-shadow 0.15s, transform 0.1s; }
      .activity-card:hover { transform: translateY(-1px); }
    </style>
</head>
<body class="bg-base-200 min-h-screen">
    ${navbar(user)}

    <div style="padding-top: 48px;">

      <!-- Loading -->
      <div id="loadingState" class="flex flex-col items-center justify-center min-h-[70vh]">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="mt-4 text-base-content/50">Activiteiten ophalen…</p>
      </div>

      <!-- Odoo not linked -->
      <div id="linkError" class="container mx-auto px-6 py-16 max-w-lg text-center" style="display:none">
        <div class="alert alert-warning shadow-lg">
          <i data-lucide="alert-triangle" class="w-6 h-6 shrink-0"></i>
          <div class="text-left">
            <h3 class="font-bold">Odoo-account niet gekoppeld</h3>
            <p class="text-sm mt-1">Vraag je beheerder om jouw Odoo UID in te stellen via de gebruikersinstellingen (Admin → # knop naast jouw naam).</p>
          </div>
        </div>
      </div>

      <!-- App shell (populated by JS) -->
      <div id="appShell" style="display:none">

        <!-- Stats bar — sticky below navbar -->
        <div class="bg-base-100 border-b border-base-200 sticky top-12 z-30 shadow-sm">
          <div class="container mx-auto px-4 sm:px-6 max-w-5xl">
            <div class="flex items-center gap-5 h-14 overflow-x-auto scrollbar-none">
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="statTotal" class="text-2xl font-black tabular-nums leading-none">—</span>
                <span class="text-xs text-base-content/40 leading-tight">open</span>
              </div>
              <div class="w-px h-6 bg-base-300 shrink-0"></div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="statOverdue" class="text-2xl font-black text-error tabular-nums leading-none">—</span>
                <span class="text-xs text-base-content/40 leading-tight">achter&shy;stallig</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span id="statToday" class="text-2xl font-black text-warning tabular-nums leading-none">—</span>
                <span class="text-xs text-base-content/40 leading-tight">vandaag</span>
              </div>
              <div class="w-px h-6 bg-base-300 shrink-0"></div>
              <div class="flex items-center gap-1.5 shrink-0">
                <i data-lucide="trophy" class="w-4 h-4 text-warning shrink-0"></i>
                <span id="statWins" class="text-2xl font-black text-warning tabular-nums leading-none">—</span>
                <span class="text-xs text-base-content/40 leading-tight">wins<br>deze week</span>
              </div>
            </div>
          </div>
        </div>

        <div class="container mx-auto px-4 sm:px-6 py-6 max-w-5xl">

          <!-- Tab nav + settings button -->
          <div class="flex items-center justify-between mb-5 gap-4">
            <div class="tabs tabs-boxed bg-base-100 shadow-sm">
              <a class="tab tab-active" id="tabBtnQueue" onclick="switchTab('queue')">
                <i data-lucide="list-checks" class="w-4 h-4 mr-1.5"></i>
                Queue
                <span id="tabQueueCount" class="badge badge-sm badge-neutral ml-2 tabular-nums">0</span>
              </a>
              <a class="tab" id="tabBtnWins" onclick="switchTab('wins')">
                <i data-lucide="trophy" class="w-4 h-4 mr-1.5"></i>
                Wins
                <span id="tabWinsCount" class="badge badge-sm badge-warning ml-2 tabular-nums">0</span>
              </a>
              ${isManager ? `
              <a class="tab" id="tabBtnTeam" onclick="switchTab('team')">
                <i data-lucide="users" class="w-4 h-4 mr-1.5"></i>
                Team
              </a>` : ''}
            </div>
            ${isManager ? `
            <a href="/cx-powerboard/settings" class="btn btn-sm btn-ghost gap-1 shrink-0">
              <i data-lucide="settings" class="w-4 h-4"></i>
              <span class="hidden sm:inline">Instellingen</span>
            </a>` : ''}
          </div>

          <!-- ── QUEUE TAB ── -->
          <div id="tabQueue">

            <!-- Model filter chips -->
            <div id="modelFilters" class="flex flex-wrap gap-2 mb-5"></div>

            <!-- All clear -->
            <div id="emptyQueue" class="text-center py-20" style="display:none">
              <div class="text-7xl mb-4">🎉</div>
              <h2 class="text-2xl font-bold mb-2">Queue leeg!</h2>
              <p class="text-base-content/50">Helemaal bij — uitstekend werk.</p>
            </div>

            <!-- Overdue -->
            <div id="sectionOverdue" class="mb-8" style="display:none">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-error font-bold text-xs uppercase tracking-widest">Achterstallig</span>
                <span id="badgeOverdue" class="badge badge-error badge-sm font-bold tabular-nums">0</span>
              </div>
              <div id="cardsOverdue" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

            <!-- Today -->
            <div id="sectionToday" class="mb-8" style="display:none">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-warning font-bold text-xs uppercase tracking-widest">Vandaag</span>
                <span id="badgeToday" class="badge badge-warning badge-sm font-bold tabular-nums">0</span>
              </div>
              <div id="cardsToday" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

            <!-- Upcoming -->
            <div id="sectionUpcoming" class="mb-8" style="display:none">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-success font-bold text-xs uppercase tracking-widest">Ingepland</span>
                <span id="badgeUpcoming" class="badge badge-success badge-sm font-bold tabular-nums">0</span>
              </div>
              <div id="cardsUpcoming" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

            <!-- No deadline -->
            <div id="sectionNoDue" class="mb-8" style="display:none">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-base-content/40 font-bold text-xs uppercase tracking-widest">Geen deadline</span>
                <span id="badgeNoDue" class="badge badge-ghost badge-sm tabular-nums">0</span>
              </div>
              <div id="cardsNoDue" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"></div>
            </div>

          </div>

          <!-- ── WINS TAB ── -->
          <div id="tabWins" style="display:none">

            <!-- Hero -->
            <div class="text-center py-10 mb-6">
              <div id="winsHeroNumber" class="text-8xl font-black text-warning tabular-nums leading-none">0</div>
              <p class="text-base-content/50 mt-3 text-lg">wins deze week</p>
              <div class="flex justify-center gap-8 mt-5">
                <div class="text-center">
                  <div id="winsTotalNum" class="text-3xl font-bold tabular-nums">0</div>
                  <div class="text-xs text-base-content/40 mt-0.5">totaal ooit</div>
                </div>
              </div>
            </div>

            <div id="emptyWins" class="text-center py-10 text-base-content/40" style="display:none">
              <div class="text-5xl mb-4">🌱</div>
              <p class="font-semibold text-lg">Nog geen wins geregistreerd.</p>
              <p class="text-sm mt-2 max-w-sm mx-auto">Activiteiten in Odoo afvinken detecteert automatisch wins — zorg eerst dat de activiteitstypes ingesteld zijn.</p>
            </div>

            <div id="winsCards" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"></div>

          </div>

          ${isManager ? `
          <!-- ── TEAM TAB ── -->
          <div id="tabTeam" style="display:none">
            <div id="teamLoading" class="flex justify-center py-16">
              <span class="loading loading-spinner loading-lg"></span>
            </div>
            <div id="teamContent" style="display:none">
              <div class="card bg-base-100 shadow-xl overflow-hidden">
                <div class="card-body p-0">
                  <table class="table">
                    <thead>
                      <tr class="border-b border-base-200">
                        <th class="w-10 text-center">#</th>
                        <th>Naam</th>
                        <th class="text-center text-warning">🏆 Wins/week</th>
                        <th class="text-center">Open</th>
                        <th class="text-center text-error">Achterstallig</th>
                      </tr>
                    </thead>
                    <tbody id="teamBody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          ` : ''}

        </div>
      </div>
    </div>

    <script>
      ${COMMON_JS}

      const MODEL_META = ${MODEL_META_JSON};
      const IS_MANAGER = ${isManager};

      let allActivities = [];
      let activeModel   = 'all';
      let teamLoaded    = false;

      // ── Tab switching ─────────────────────────────────────────────────────
      function switchTab(name) {
        ['queue', 'wins', 'team'].forEach(t => {
          const cap = t.charAt(0).toUpperCase() + t.slice(1);
          const el  = document.getElementById('tab' + cap);
          const btn = document.getElementById('tabBtn' + cap);
          if (el)  el.style.display  = t === name ? 'block' : 'none';
          if (btn) btn.classList.toggle('tab-active', t === name);
        });
        document.getElementById('modelFilters').style.display = name === 'queue' ? 'flex' : 'none';
        if (name === 'team' && !teamLoaded) { teamLoaded = true; loadTeam(); }
        lucide.createIcons();
      }

      // ── Helpers ───────────────────────────────────────────────────────────
      function priorityBadge(w) {
        if (!w) return '<span class="badge badge-ghost badge-xs text-base-content/25 font-mono">—</span>';
        if (w >= 8) return '<span class="badge badge-error badge-sm font-bold font-mono">P' + w + '</span>';
        if (w >= 5) return '<span class="badge badge-warning badge-sm font-bold font-mono">P' + w + '</span>';
        return '<span class="badge badge-neutral badge-sm font-mono">P' + w + '</span>';
      }

      function modelBadge(model) {
        const m = MODEL_META[model];
        if (!m) {
          const short = (model || '').split('.').pop() || model || '?';
          return '<span class="badge badge-ghost badge-xs capitalize">' + escHtml(short) + '</span>';
        }
        return '<span class="badge ' + m.color + ' badge-xs">' + escHtml(m.label) + '</span>';
      }

      function activityIcon(name) {
        if (!name) return 'zap';
        const n = name.toLowerCase();
        if (n.includes('call') || n.includes('bel') || n.includes('phone') || n.includes('telefoon')) return 'phone-call';
        if (n.includes('email') || n.includes('mail')) return 'mail';
        if (n.includes('meeting') || n.includes('vergadering') || n.includes('afspraak')) return 'users';
        if (n.includes('task') || n.includes('taak') || n.includes('todo') || n.includes('actie')) return 'check-square';
        if (n.includes('document') || n.includes('upload') || n.includes('contract')) return 'file-text';
        if (n.includes('visit') || n.includes('bezoek') || n.includes('demo')) return 'map-pin';
        if (n.includes('voorstel') || n.includes('proposal') || n.includes('offert')) return 'clipboard';
        if (n.includes('herinner') || n.includes('reminder') || n.includes('follow')) return 'bell';
        return 'zap';
      }

      function urgencyOf(deadline) {
        if (!deadline) return 'nodue';
        const d = new Date(deadline);
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const diff = Math.round((d - t) / 86400000);
        if (diff < 0)  return 'overdue';
        if (diff === 0) return 'today';
        return 'upcoming';
      }

      function deadlineLabel(deadline) {
        if (!deadline) return '';
        const d = new Date(deadline);
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const diff = Math.round((d - t) / 86400000);
        if (diff < 0)  return '<span class="text-error text-xs font-bold">' + Math.abs(diff) + 'd te laat</span>';
        if (diff === 0) return '<span class="text-warning text-xs font-bold">Vandaag</span>';
        if (diff === 1) return '<span class="text-warning text-xs font-semibold">Morgen</span>';
        if (diff <= 6) {
          const days = ['zo','ma','di','wo','do','vr','za'];
          return '<span class="text-success text-xs">' + days[d.getDay()] + ' ' + d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + '</span>';
        }
        return '<span class="text-base-content/40 text-xs">' + d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + '</span>';
      }

      function borderClass(urgency) {
        if (urgency === 'overdue')  return 'border-l-[3px] border-l-error';
        if (urgency === 'today')    return 'border-l-[3px] border-l-warning';
        if (urgency === 'upcoming') return 'border-l-[3px] border-l-success';
        return 'border-l-[3px] border-l-base-300';
      }

      function formatWonAt(ts) {
        const d = new Date(ts), ms = Date.now() - d;
        if (ms < 3600000)   return Math.round(ms / 60000) + ' min geleden';
        if (ms < 86400000)  return Math.round(ms / 3600000) + ' uur geleden';
        if (ms < 604800000) return Math.round(ms / 86400000) + 'd geleden';
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
      }

      // ── Activity card ─────────────────────────────────────────────────────
      function activityCard(a) {
        const urgency  = urgencyOf(a.date_deadline);
        const note     = a.summary || a.note;
        const icon     = activityIcon(a.activity_type_name);
        return \`
          <div class="activity-card card bg-base-100 shadow-sm hover:shadow-md border border-base-200 \${borderClass(urgency)}">
            <div class="card-body p-4 gap-0">
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex flex-wrap gap-1.5 min-w-0">
                  \${priorityBadge(a.priority_weight)}
                  \${modelBadge(a.res_model)}
                </div>
                <div class="shrink-0 mt-0.5">\${deadlineLabel(a.date_deadline)}</div>
              </div>
              <div class="font-bold text-[15px] leading-snug">\${escHtml(a.res_name || '—')}</div>
              <div class="flex items-center gap-1.5 mt-2">
                <i data-lucide="\${icon}" class="w-3 h-3 text-primary/70 shrink-0"></i>
                <span class="text-xs text-primary font-semibold">\${escHtml(a.activity_type_name)}</span>
              </div>
              \${note ? '<p class="text-xs text-base-content/50 mt-2 line-clamp-2">' + escHtml(note) + '</p>' : ''}
            </div>
          </div>
        \`;
      }

      // ── Win card ──────────────────────────────────────────────────────────
      function winCard(w) {
        return \`
          <div class="card bg-base-100 shadow-sm border border-warning/20 hover:shadow-md transition-shadow">
            <div class="card-body p-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                  <i data-lucide="trophy" class="w-5 h-5 text-warning"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-sm leading-snug">\${escHtml(w.activity_type_name)}</div>
                  <div class="text-xs text-base-content/40 mt-0.5">\${formatWonAt(w.won_at)}</div>
                </div>
                \${w.priority_weight >= 5 ? priorityBadge(w.priority_weight) : ''}
              </div>
            </div>
          </div>
        \`;
      }

      // ── Model filter chips ────────────────────────────────────────────────
      function renderModelFilters(activities) {
        const models = [...new Set(activities.map(a => a.res_model).filter(Boolean))];
        const container = document.getElementById('modelFilters');
        if (models.length <= 1) { container.innerHTML = ''; return; }

        const allBtn = \`<button class="badge badge-md cursor-pointer transition-all \${activeModel === 'all' ? 'badge-neutral' : 'badge-outline hover:badge-neutral'}" onclick="filterModel('all')">Alles (\${activities.length})</button>\`;

        const chips = models.map(m => {
          const meta   = MODEL_META[m];
          const label  = meta ? meta.label : m.split('.').pop();
          const count  = activities.filter(a => a.res_model === m).length;
          const active = activeModel === m;
          const cls    = active ? (meta ? meta.color.replace('badge-','badge-') : 'badge-neutral') : 'badge-outline hover:badge-neutral';
          return \`<button class="badge badge-md cursor-pointer transition-all \${cls}" onclick="filterModel('\${escHtml(m)}')">\${escHtml(label)} (\${count})</button>\`;
        });

        container.innerHTML = [allBtn, ...chips].join('');
      }

      function filterModel(model) {
        activeModel = model;
        renderModelFilters(allActivities);
        renderQueue(allActivities);
      }

      // ── Render queue ──────────────────────────────────────────────────────
      function renderQueue(activities) {
        const filtered = activeModel === 'all' ? activities : activities.filter(a => a.res_model === activeModel);
        document.getElementById('tabQueueCount').textContent = filtered.length;

        const groups = { overdue: [], today: [], upcoming: [], nodue: [] };
        for (const a of filtered) groups[urgencyOf(a.date_deadline)].push(a);

        document.getElementById('emptyQueue').style.display = filtered.length === 0 ? 'block' : 'none';

        function renderGroup(key, sectionId, cardsId, badgeId) {
          const items = groups[key];
          const sec   = document.getElementById(sectionId);
          if (!items.length) { sec.style.display = 'none'; return; }
          sec.style.display = 'block';
          document.getElementById(badgeId).textContent = items.length;
          document.getElementById(cardsId).innerHTML = items.map(activityCard).join('');
        }
        renderGroup('overdue',  'sectionOverdue',  'cardsOverdue',  'badgeOverdue');
        renderGroup('today',    'sectionToday',    'cardsToday',    'badgeToday');
        renderGroup('upcoming', 'sectionUpcoming', 'cardsUpcoming', 'badgeUpcoming');
        renderGroup('nodue',    'sectionNoDue',    'cardsNoDue',    'badgeNoDue');
        lucide.createIcons();
      }

      // ── Render wins ───────────────────────────────────────────────────────
      function renderWins(wins, stats) {
        const weekWins = stats?.winsThisWeek ?? 0;
        document.getElementById('winsHeroNumber').textContent = weekWins;
        document.getElementById('winsTotalNum').textContent   = wins.length;
        document.getElementById('tabWinsCount').textContent   = weekWins;

        if (!wins.length) {
          document.getElementById('emptyWins').style.display = 'block';
          document.getElementById('winsCards').innerHTML = '';
        } else {
          document.getElementById('emptyWins').style.display = 'none';
          document.getElementById('winsCards').innerHTML = wins.map(winCard).join('');
        }
        lucide.createIcons();
      }

      // ── Render stats bar ──────────────────────────────────────────────────
      function renderStats(stats) {
        document.getElementById('statTotal').textContent   = stats.total        ?? '—';
        document.getElementById('statOverdue').textContent = stats.overdue      ?? '—';
        document.getElementById('statToday').textContent   = stats.dueToday     ?? '—';
        document.getElementById('statWins').textContent    = stats.winsThisWeek ?? '—';
      }

      // ── Team tab ──────────────────────────────────────────────────────────
      async function loadTeam() {
        try {
          const res  = await fetch('/cx-powerboard/api/team', { credentials: 'include' });
          const data = await res.json();
          renderTeam(data.team || []);
        } catch (e) {
          document.getElementById('teamLoading').innerHTML =
            '<div class="alert alert-error m-4"><span>Laden mislukt: ' + escHtml(e.message) + '</span></div>';
        }
      }

      function renderTeam(team) {
        document.getElementById('teamLoading').style.display = 'none';
        document.getElementById('teamContent').style.display = 'block';

        const medals = ['🥇', '🥈', '🥉'];
        if (!team.length) {
          document.getElementById('teamBody').innerHTML =
            '<tr><td colspan="5" class="text-center py-8 text-base-content/40">Geen teamleden met Odoo-koppeling gevonden.</td></tr>';
          return;
        }

        document.getElementById('teamBody').innerHTML = team.map((m, i) => \`
          <tr class="\${i === 0 ? 'bg-warning/5' : ''}">
            <td class="text-center text-lg">
              \${i < 3 ? medals[i] : '<span class="text-base-content/30 text-sm">' + (i + 1) + '</span>'}
            </td>
            <td>
              <div class="font-semibold">\${escHtml(m.name)}</div>
              <div class="text-xs text-base-content/40">\${escHtml(m.email)}</div>
            </td>
            <td class="text-center">
              \${m.winsThisWeek > 0
                ? '<span class="text-warning font-black text-xl tabular-nums">' + m.winsThisWeek + '</span>'
                : '<span class="text-base-content/25">—</span>'}
            </td>
            <td class="text-center text-base-content/60 tabular-nums">\${m.openActivities || '—'}</td>
            <td class="text-center tabular-nums">
              \${m.overdue > 0
                ? '<span class="text-error font-bold">' + m.overdue + '</span>'
                : '<span class="text-base-content/25">—</span>'}
            </td>
          </tr>
        \`).join('');
        lucide.createIcons();
      }

      // ── Main load ─────────────────────────────────────────────────────────
      async function loadDashboard() {
        try {
          const res  = await fetch('/cx-powerboard/api/activities', { credentials: 'include' });
          const data = await res.json();

          document.getElementById('loadingState').style.display = 'none';

          if (data.odooUidMissing) {
            document.getElementById('linkError').style.display = 'block';
            lucide.createIcons();
            return;
          }

          document.getElementById('appShell').style.display = 'block';

          allActivities = data.activities || [];
          renderStats(data.stats || {});
          renderModelFilters(allActivities);
          renderQueue(allActivities);
          renderWins(data.wins || [], data.stats || {});

        } catch (err) {
          document.getElementById('loadingState').innerHTML =
            '<div class="container mx-auto px-6 py-16 max-w-lg"><div class="alert alert-error"><span>Laden mislukt: ' +
            escHtml(err.message) + '</span></div></div>';
        }
        lucide.createIcons();
      }

      initTheme();
      lucide.createIcons();
      loadDashboard();
    </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Settings page (mapping config — manager / admin only)
// ---------------------------------------------------------------------------

export function cxPowerboardSettingsUI(user) {
  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CX Powerboard — Instellingen</title>
    <script>${THEME_INIT}</script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
    <script>
      (function() {
        const w = console.warn;
        console.warn = function(...a) {
          if (typeof a[0] === 'string' && a[0].includes('cdn.tailwindcss.com')) return;
          w.apply(this, a);
        };
      })();
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}

    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-4xl">

        <div class="flex items-center gap-4 mb-8">
          <a href="/cx-powerboard" class="btn btn-sm btn-ghost">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
          </a>
          <div>
            <h1 class="text-3xl font-bold mb-1">Activiteitsmapping</h1>
            <p class="text-base-content/50 text-sm">Welke Odoo-activiteitstypes worden bijgehouden, met welke prioriteit, en welke tellen als win.</p>
          </div>
        </div>

        <div id="loadingState" class="flex justify-center items-center py-16">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4">Laden…</span>
        </div>

        <div id="mainContent" style="display:none">
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div class="flex justify-between items-center mb-4">
                <h2 class="card-title">Mappings</h2>
                <button id="addBtn" class="btn btn-primary btn-sm">
                  <i data-lucide="plus" class="w-4 h-4 mr-1"></i>
                  Toevoegen
                </button>
              </div>

              <div id="emptyState" class="text-center py-8 text-base-content/40" style="display:none">
                <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3"></i>
                <p>Nog geen mappings. Voeg een activiteitstype toe.</p>
              </div>

              <div class="overflow-x-auto" id="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Activiteitstype (Odoo)</th>
                      <th class="text-center">Prioriteit (1–10)</th>
                      <th class="text-center">Is Win</th>
                      <th class="text-right">Acties</th>
                    </tr>
                  </thead>
                  <tbody id="mappingsBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Add / Edit modal -->
        <dialog id="mappingModal" class="modal">
          <div class="modal-box max-w-lg">
            <h3 id="modalTitle" class="font-bold text-lg mb-4">Mapping toevoegen</h3>

            <div id="typePickerWrap" class="form-control mb-4">
              <label class="label"><span class="label-text">Odoo activiteitstype</span></label>
              <select id="odooTypeSelect" class="select select-bordered">
                <option value="">Laden…</option>
              </select>
            </div>

            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Prioriteitsgewicht</span>
                <span class="label-text-alt text-base-content/40">1 = laag · 10 = hoogst</span>
              </label>
              <input type="number" id="weightInput" class="input input-bordered" min="1" max="10" value="5" />
            </div>

            <div class="form-control mb-6">
              <label class="label cursor-pointer justify-start gap-4">
                <input type="checkbox" id="isWinCheck" class="checkbox checkbox-success" />
                <span class="label-text">Telt als win wanneer afgevinkt in Odoo</span>
              </label>
            </div>

            <div id="modalError" class="alert alert-error mb-4" style="display:none"></div>

            <div class="modal-action">
              <button class="btn btn-ghost" onclick="document.getElementById('mappingModal').close()">Annuleren</button>
              <button id="saveBtn" class="btn btn-primary">Opslaan</button>
            </div>
          </div>
        </dialog>

      </div>
    </div>

    <script>
      ${COMMON_JS}

      let odooTypes = [];
      let mappings  = [];
      let editingId = null;

      async function loadAll() {
        const [mRes, tRes] = await Promise.all([
          fetch('/cx-powerboard/api/mappings',        { credentials: 'include' }),
          fetch('/cx-powerboard/api/activity-types',  { credentials: 'include' }),
        ]);
        mappings  = await mRes.json();
        odooTypes = await tRes.json();
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('mainContent').style.display  = 'block';
        renderMappings();
        lucide.createIcons();
      }

      function renderMappings() {
        if (!mappings.length) {
          document.getElementById('emptyState').style.display = 'block';
          document.getElementById('tableWrap').style.display  = 'none';
          return;
        }
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('tableWrap').style.display  = 'block';
        document.getElementById('mappingsBody').innerHTML = mappings.map(m => \`
          <tr>
            <td class="font-medium">\${escHtml(m.odoo_activity_type_name)}</td>
            <td class="text-center font-mono">\${m.priority_weight}</td>
            <td class="text-center">
              \${m.is_win
                ? '<span class="badge badge-success gap-1"><i data-lucide="trophy" class="w-3 h-3"></i>Win</span>'
                : '<span class="badge badge-ghost text-base-content/30">—</span>'}
            </td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs mr-1" onclick="openEdit('\${escHtml(m.id)}')">
                <i data-lucide="pencil" class="w-3 h-3"></i>
              </button>
              <button class="btn btn-ghost btn-xs text-error" onclick="confirmDelete('\${escHtml(m.id)}')">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </td>
          </tr>
        \`).join('');
        lucide.createIcons();
      }

      function openAdd() {
        editingId = null;
        document.getElementById('modalTitle').textContent = 'Mapping toevoegen';
        document.getElementById('weightInput').value      = 5;
        document.getElementById('isWinCheck').checked     = false;
        document.getElementById('modalError').style.display = 'none';

        const usedIds = new Set(mappings.map(m => m.odoo_activity_type_id));
        const available = odooTypes.filter(t => !usedIds.has(t.id));
        document.getElementById('typePickerWrap').innerHTML =
          '<label class="label"><span class="label-text">Odoo activiteitstype</span></label>' +
          '<select id="odooTypeSelect" class="select select-bordered">' +
          (available.length
            ? available.map(t => \`<option value="\${t.id}" data-name="\${escHtml(t.name)}">\${escHtml(t.name)}</option>\`).join('')
            : '<option value="" disabled>Alle types zijn al gemapped</option>'
          ) + '</select>';

        document.getElementById('mappingModal').showModal();
      }

      function openEdit(id) {
        const m = mappings.find(x => x.id === id);
        if (!m) return;
        editingId = id;
        document.getElementById('modalTitle').textContent = 'Mapping bewerken';
        document.getElementById('weightInput').value      = m.priority_weight;
        document.getElementById('isWinCheck').checked     = m.is_win;
        document.getElementById('modalError').style.display = 'none';
        document.getElementById('typePickerWrap').innerHTML =
          '<label class="label"><span class="label-text">Odoo activiteitstype</span></label>' +
          '<input class="input input-bordered bg-base-200" value="' + escHtml(m.odoo_activity_type_name) + '" disabled />';
        document.getElementById('mappingModal').showModal();
      }

      document.getElementById('addBtn').addEventListener('click', openAdd);

      document.getElementById('saveBtn').addEventListener('click', async () => {
        const errEl  = document.getElementById('modalError');
        const weight = parseInt(document.getElementById('weightInput').value, 10);
        const isWin  = document.getElementById('isWinCheck').checked;
        errEl.style.display = 'none';

        if (!weight || weight < 1 || weight > 10) {
          errEl.textContent = 'Prioriteitsgewicht moet tussen 1 en 10 liggen.';
          errEl.style.display = 'flex';
          return;
        }

        let url, method, body;
        if (editingId) {
          url = '/cx-powerboard/api/mappings/' + editingId;
          method = 'PUT';
          body = { priority_weight: weight, is_win: isWin };
        } else {
          const sel      = document.getElementById('odooTypeSelect');
          const typeId   = parseInt(sel?.value, 10);
          const typeName = sel?.options[sel.selectedIndex]?.dataset?.name || '';
          if (!typeId) {
            errEl.textContent = 'Selecteer een activiteitstype.';
            errEl.style.display = 'flex';
            return;
          }
          url    = '/cx-powerboard/api/mappings';
          method = 'POST';
          body   = { odoo_activity_type_id: typeId, odoo_activity_type_name: typeName, priority_weight: weight, is_win: isWin };
        }

        const btn = document.getElementById('saveBtn');
        btn.disabled = true;
        try {
          const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Opslaan mislukt');
          document.getElementById('mappingModal').close();
          await loadAll();
        } catch (e) {
          errEl.textContent   = e.message;
          errEl.style.display = 'flex';
        } finally {
          btn.disabled = false;
        }
      });

      async function confirmDelete(id) {
        if (!confirm('Mapping verwijderen?')) return;
        const res = await fetch('/cx-powerboard/api/mappings/' + id, { method: 'DELETE', credentials: 'include' });
        if (res.ok) await loadAll();
      }

      initTheme();
      lucide.createIcons();
      loadAll();
    </script>
</body>
</html>`;
}


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const THEME_INIT = `(function initThemeEarly() {
  try {
    const localTheme = localStorage.getItem('selectedTheme');
    const cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
    const cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    const theme = localTheme || cookieTheme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();`;

const COMMON_JS = `
  function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('selectedTheme', theme);
  }
  function initTheme() {
    const saved = localStorage.getItem('selectedTheme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const sel = document.getElementById('themeSelector');
    if (sel) sel.value = saved;
  }
  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
    window.location.href = '/';
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
`;

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export function cxPowerboardDashboardUI(user) {
  const isManager = user.role === 'admin' || user.role === 'cx_powerboard_manager';

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CX Powerboard</title>
    <script>${THEME_INIT}</script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script>
      (function suppressTailwindCdnWarning() {
        const originalWarn = console.warn;
        console.warn = function(...args) {
          if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com should not be used in production')) return;
          return originalWarn.apply(this, args);
        };
      })();
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}

    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-5xl">

        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
          <div>
            <h1 class="text-4xl font-bold mb-2">CX Powerboard</h1>
            <p class="text-base-content/60">Your activity queue and wins</p>
          </div>
          ${isManager ? `
          <a href="/cx-powerboard/settings" class="btn btn-sm btn-outline">
            <i data-lucide="settings" class="w-4 h-4 mr-1"></i>
            Settings
          </a>` : ''}
        </div>

        <!-- Loading state -->
        <div id="loadingState" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Loading your activities…</span>
        </div>

        <!-- Odoo UID not linked -->
        <div id="linkError" class="alert alert-warning mb-6" style="display: none;">
          <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>
          <span>Your Odoo account is not linked yet. Contact your administrator to connect your account.</span>
        </div>

        <!-- Main content -->
        <div id="mainContent" style="display: none;">

          <!-- Open Activities -->
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <h2 class="card-title mb-4">
                <i data-lucide="list-checks" class="w-5 h-5"></i>
                Open Activities
                <span id="activityCount" class="badge badge-neutral ml-2">0</span>
              </h2>

              <div id="emptyActivities" class="text-center py-8 text-base-content/40" style="display: none;">
                <i data-lucide="check-circle-2" class="w-12 h-12 mx-auto mb-3"></i>
                <p>No open activities — all clear!</p>
              </div>

              <div class="overflow-x-auto" id="activitiesWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="w-20">Priority</th>
                      <th>Activity Type</th>
                      <th>Record</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody id="activitiesBody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Recent Wins -->
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <h2 class="card-title mb-4">
                <i data-lucide="trophy" class="w-5 h-5 text-warning"></i>
                Recent Wins
                <span id="winsCount" class="badge badge-neutral ml-2">0</span>
              </h2>

              <div id="emptyWins" class="text-center py-8 text-base-content/40" style="display: none;">
                <i data-lucide="trophy" class="w-12 h-12 mx-auto mb-3"></i>
                <p>No wins recorded yet — keep going!</p>
              </div>

              <div class="overflow-x-auto" id="winsWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="w-20">Priority</th>
                      <th>Activity Type</th>
                      <th>Won</th>
                    </tr>
                  </thead>
                  <tbody id="winsBody"></tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <script>
      ${COMMON_JS}

      function priorityBadge(w) {
        if (w >= 8) return '<span class="badge badge-error">' + w + '</span>';
        if (w >= 5) return '<span class="badge badge-warning">' + w + '</span>';
        if (w > 0)  return '<span class="badge badge-neutral">' + w + '</span>';
        return '<span class="badge badge-ghost text-base-content/30">—</span>';
      }

      function formatDeadline(d) {
        if (!d) return '<span class="text-base-content/30">—</span>';
        const date = new Date(d);
        const today = new Date(); today.setHours(0,0,0,0);
        const diff = Math.round((date - today) / 86400000);
        if (diff < 0)  return '<span class="text-error font-medium">Overdue (' + Math.abs(diff) + 'd)</span>';
        if (diff === 0) return '<span class="text-warning font-medium">Today</span>';
        if (diff === 1) return '<span class="text-warning">Tomorrow</span>';
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }

      function formatWonAt(ts) {
        const d = new Date(ts), now = new Date(), ms = now - d;
        if (ms < 3600000)    return Math.round(ms / 60000) + 'm ago';
        if (ms < 86400000)   return Math.round(ms / 3600000) + 'h ago';
        if (ms < 604800000)  return Math.round(ms / 86400000) + 'd ago';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }

      async function loadDashboard() {
        try {
          const res = await fetch('/cx-powerboard/api/activities', { credentials: 'include' });
          const data = await res.json();

          document.getElementById('loadingState').style.display = 'none';

          if (data.odooUidMissing) {
            document.getElementById('linkError').style.display = 'flex';
            lucide.createIcons();
            return;
          }

          document.getElementById('mainContent').style.display = 'block';

          // Activities
          const acts = data.activities || [];
          document.getElementById('activityCount').textContent = acts.length;
          if (acts.length === 0) {
            document.getElementById('emptyActivities').style.display = 'block';
            document.getElementById('activitiesWrap').style.display = 'none';
          } else {
            document.getElementById('activitiesBody').innerHTML = acts.map(a => \`
              <tr>
                <td>\${priorityBadge(a.priority_weight)}</td>
                <td class="font-medium">\${escHtml(a.activity_type_name)}</td>
                <td class="text-sm text-base-content/70">\${escHtml(a.res_name || a.res_model || '—')}</td>
                <td>\${formatDeadline(a.date_deadline)}</td>
              </tr>
            \`).join('');
          }

          // Wins
          const wins = data.wins || [];
          document.getElementById('winsCount').textContent = wins.length;
          if (wins.length === 0) {
            document.getElementById('emptyWins').style.display = 'block';
            document.getElementById('winsWrap').style.display = 'none';
          } else {
            document.getElementById('winsBody').innerHTML = wins.map(w => \`
              <tr>
                <td>\${priorityBadge(w.priority_weight)}</td>
                <td class="font-medium">\${escHtml(w.activity_type_name)}</td>
                <td class="text-sm text-base-content/70">\${formatWonAt(w.won_at)}</td>
              </tr>
            \`).join('');
          }

        } catch (err) {
          document.getElementById('loadingState').style.display = 'none';
          document.getElementById('mainContent').innerHTML =
            '<div class="alert alert-error"><span>Failed to load: ' + escHtml(err.message) + '</span></div>';
          document.getElementById('mainContent').style.display = 'block';
        }

        lucide.createIcons();
      }

      initTheme();
      lucide.createIcons();
      loadDashboard();
    </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Settings page (manager / admin only)
// ---------------------------------------------------------------------------

export function cxPowerboardSettingsUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CX Powerboard — Settings</title>
    <script>${THEME_INIT}</script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script>
      (function suppressTailwindCdnWarning() {
        const originalWarn = console.warn;
        console.warn = function(...args) {
          if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com should not be used in production')) return;
          return originalWarn.apply(this, args);
        };
      })();
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}

    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-4xl">

        <!-- Header -->
        <div class="flex items-center gap-4 mb-8">
          <a href="/cx-powerboard" class="btn btn-sm btn-ghost">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
          </a>
          <div>
            <h1 class="text-4xl font-bold mb-1">Activity Mapping</h1>
            <p class="text-base-content/60">Configure which Odoo activity types are tracked and which count as wins</p>
          </div>
        </div>

        <!-- Loading -->
        <div id="loadingState" class="flex justify-center items-center py-16">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Loading mappings…</span>
        </div>

        <div id="mainContent" style="display: none;">

          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div class="flex justify-between items-center mb-4">
                <h2 class="card-title">Activity Type Mappings</h2>
                <button id="addBtn" class="btn btn-primary btn-sm">
                  <i data-lucide="plus" class="w-4 h-4 mr-1"></i>
                  Add Mapping
                </button>
              </div>

              <div id="emptyState" class="text-center py-8 text-base-content/40" style="display: none;">
                <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3"></i>
                <p>No mappings configured yet. Add your first activity type.</p>
              </div>

              <div class="overflow-x-auto" id="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Activity Type</th>
                      <th class="text-center">Priority (1–10)</th>
                      <th class="text-center">Is Win</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="mappingsBody"></tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        <!-- Add / Edit Modal -->
        <dialog id="mappingModal" class="modal">
          <div class="modal-box max-w-lg">
            <h3 id="modalTitle" class="font-bold text-lg mb-4">Add Activity Mapping</h3>

            <div id="typePickerWrap" class="form-control mb-4">
              <label class="label"><span class="label-text">Odoo Activity Type</span></label>
              <select id="odooTypeSelect" class="select select-bordered">
                <option value="">Loading Odoo types…</option>
              </select>
            </div>

            <div class="form-control mb-4">
              <label class="label"><span class="label-text">Priority Weight</span><span class="label-text-alt text-base-content/50">1 = lowest · 10 = highest</span></label>
              <input type="number" id="weightInput" class="input input-bordered" min="1" max="10" value="5" />
            </div>

            <div class="form-control mb-6">
              <label class="label cursor-pointer justify-start gap-4">
                <input type="checkbox" id="isWinCheck" class="checkbox checkbox-success" />
                <span class="label-text">Count as Win when completed</span>
              </label>
            </div>

            <div id="modalError" class="alert alert-error mb-4" style="display: none;"></div>

            <div class="modal-action">
              <button class="btn btn-ghost" onclick="document.getElementById('mappingModal').close()">Cancel</button>
              <button id="saveBtn" class="btn btn-primary">Save</button>
            </div>
          </div>
        </dialog>

      </div>
    </div>

    <script>
      ${COMMON_JS}

      let odooTypes = [];
      let mappings = [];
      let editingId = null;

      async function loadAll() {
        const [mRes, tRes] = await Promise.all([
          fetch('/cx-powerboard/api/mappings', { credentials: 'include' }),
          fetch('/cx-powerboard/api/activity-types', { credentials: 'include' }),
        ]);
        mappings = await mRes.json();
        odooTypes = await tRes.json();
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        renderMappings();
        lucide.createIcons();
      }

      function renderMappings() {
        const body = document.getElementById('mappingsBody');
        if (!mappings.length) {
          document.getElementById('emptyState').style.display = 'block';
          document.getElementById('tableWrap').style.display = 'none';
          return;
        }
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('tableWrap').style.display = 'block';
        body.innerHTML = mappings.map(m => \`
          <tr>
            <td class="font-medium">\${escHtml(m.odoo_activity_type_name)}</td>
            <td class="text-center">\${m.priority_weight}</td>
            <td class="text-center">\${m.is_win
              ? '<span class="badge badge-success gap-1"><i data-lucide="trophy" class="w-3 h-3"></i>Win</span>'
              : '<span class="badge badge-ghost">—</span>'
            }</td>
            <td class="text-right">
              <button class="btn btn-ghost btn-xs mr-1" onclick="openEdit('\${escHtml(m.id)}')">
                <i data-lucide="pencil" class="w-3 h-3"></i>
              </button>
              <button class="btn btn-ghost btn-xs text-error" onclick="confirmDelete('\${escHtml(m.id)}')">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </td>
          </tr>
        \`).join('');
        lucide.createIcons();
      }

      function openAdd() {
        editingId = null;
        document.getElementById('modalTitle').textContent = 'Add Activity Mapping';
        document.getElementById('weightInput').value = 5;
        document.getElementById('isWinCheck').checked = false;
        document.getElementById('modalError').style.display = 'none';

        // Populate type select (exclude already-mapped types)
        const usedIds = new Set(mappings.map(m => m.odoo_activity_type_id));
        const tw = document.getElementById('typePickerWrap');
        tw.innerHTML = '<label class="label"><span class="label-text">Odoo Activity Type</span></label>' +
          '<select id="odooTypeSelect" class="select select-bordered">' +
          odooTypes.filter(t => !usedIds.has(t.id))
            .map(t => \`<option value="\${t.id}" data-name="\${escHtml(t.name)}">\${escHtml(t.name)}</option>\`)
            .join('') +
          '</select>';

        document.getElementById('mappingModal').showModal();
      }

      function openEdit(id) {
        const m = mappings.find(x => x.id === id);
        if (!m) return;
        editingId = id;
        document.getElementById('modalTitle').textContent = 'Edit Mapping';
        document.getElementById('weightInput').value = m.priority_weight;
        document.getElementById('isWinCheck').checked = m.is_win;
        document.getElementById('modalError').style.display = 'none';

        // Show type name read-only (type cannot be changed after creation)
        document.getElementById('typePickerWrap').innerHTML =
          '<label class="label"><span class="label-text">Odoo Activity Type</span></label>' +
          '<input class="input input-bordered bg-base-200" value="' + escHtml(m.odoo_activity_type_name) + '" disabled />';

        document.getElementById('mappingModal').showModal();
      }

      document.getElementById('addBtn').addEventListener('click', openAdd);

      document.getElementById('saveBtn').addEventListener('click', async () => {
        const errEl = document.getElementById('modalError');
        errEl.style.display = 'none';

        const weight = parseInt(document.getElementById('weightInput').value, 10);
        const isWin  = document.getElementById('isWinCheck').checked;

        if (!weight || weight < 1 || weight > 10) {
          errEl.textContent = 'Priority weight must be between 1 and 10.';
          errEl.style.display = 'flex';
          return;
        }

        let url, method, body;
        if (editingId) {
          url = '/cx-powerboard/api/mappings/' + editingId;
          method = 'PUT';
          body = { priority_weight: weight, is_win: isWin };
        } else {
          const sel = document.getElementById('odooTypeSelect');
          const typeId = parseInt(sel?.value, 10);
          const typeName = sel?.options[sel.selectedIndex]?.dataset?.name || '';
          if (!typeId) {
            errEl.textContent = 'Please select an activity type.';
            errEl.style.display = 'flex';
            return;
          }
          url = '/cx-powerboard/api/mappings';
          method = 'POST';
          body = { odoo_activity_type_id: typeId, odoo_activity_type_name: typeName, priority_weight: weight, is_win: isWin };
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Save failed');
          document.getElementById('mappingModal').close();
          await loadAll();
        } catch (e) {
          errEl.textContent = e.message;
          errEl.style.display = 'flex';
        } finally {
          saveBtn.disabled = false;
        }
      });

      async function confirmDelete(id) {
        if (!confirm('Delete this mapping?')) return;
        const res = await fetch('/cx-powerboard/api/mappings/' + id, { method: 'DELETE', credentials: 'include' });
        if (res.ok) await loadAll();
      }

      initTheme();
      lucide.createIcons();
      loadAll();
    </script>
</body>
</html>`;
}
