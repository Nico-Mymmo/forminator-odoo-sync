/**
 * CX Powerboard — UI
 *
 * SSR page skeletons. Dynamic data loaded client-side via fetch().
 * Follows platform conventions: DaisyUI 4.12.14, Tailwind CDN, Lucide,
 * navbar component, padding-top: 48px, theme init script.
 */

import { navbar } from '../../lib/components/navbar.js';

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
