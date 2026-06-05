import { navbar } from '../../lib/components/navbar.js';

export function queryBuilderAdminUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sales Insight Explorer — Beheer</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
  ${navbar(user)}
  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-4xl">

      <div class="mb-6 flex items-center gap-4">
        <a href="/insights" class="btn btn-ghost btn-sm gap-2">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>Terug
        </a>
        <div>
          <h1 class="text-3xl font-bold">Sales Insight Explorer — Beheer</h1>
          <p class="text-base-content/60">Moduletoegang en beheersrechten per gebruiker</p>
        </div>
      </div>

      <div class="alert mb-6">
        <i data-lucide="info" class="w-5 h-5 shrink-0"></i>
        <div class="text-sm">
          <strong>Module toegang</strong> geeft een gebruiker toegang tot de Sales Insight Explorer.
          <strong>Sales Insight Admin</strong> geeft bovenop die toegang het recht om informatiecategorieën
          en velden te beheren. Wijzigingen hier zijn direct actief na herlogin van de gebruiker.
        </div>
      </div>

      <!-- Zoek -->
      <div class="form-control mb-4 max-w-sm">
        <input type="text" id="searchInput" placeholder="Zoek op naam of email..."
          class="input input-bordered input-sm w-full"
          oninput="filterTable(this.value)" />
      </div>

      <!-- Tabel -->
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body p-0">
          <div id="loadingUsers" class="flex items-center gap-3 p-6">
            <span class="loading loading-spinner loading-sm"></span>
            <span class="text-sm text-base-content/60">Laden...</span>
          </div>
          <div id="errorMsg" class="alert alert-error m-4" style="display:none;"></div>
          <div id="usersTableWrap" class="overflow-x-auto" style="display:none;">
            <table class="table table-sm w-full">
              <thead>
                <tr class="border-b border-base-200">
                  <th>Gebruiker</th>
                  <th>Globale rol</th>
                  <th class="text-center">Module toegang</th>
                  <th class="text-center">SI Admin</th>
                </tr>
              </thead>
              <tbody id="usersTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Toast container -->
      <div id="toastContainer" class="toast toast-end z-50"></div>

    </div>
  </div>

  <script>
    let allRows = [];

    // ── Load ──────────────────────────────────────────────────────────────────
    async function loadUsers() {
      try {
        const res = await fetch('/insights/api/sales-insights/admin/users');
        const data = await res.json();
        document.getElementById('loadingUsers').style.display = 'none';
        if (!data.success) throw new Error(data.error?.message);
        allRows = data.data.users;
        renderTable(allRows);
        document.getElementById('usersTableWrap').style.display = 'block';
      } catch (e) {
        document.getElementById('loadingUsers').style.display = 'none';
        const err = document.getElementById('errorMsg');
        err.textContent = 'Fout bij laden: ' + e.message;
        err.style.display = 'flex';
      }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderTable(rows) {
      const tbody = document.getElementById('usersTableBody');
      tbody.innerHTML = rows.map(row => {
        const u = row.user;
        const isGlobalAdmin = u.role === 'admin';
        const hasAccess     = row.has_module_access || isGlobalAdmin;
        const isSIAdmin     = Array.isArray(row.permissions) && row.permissions.includes('admin');
        const roleLabel     = { admin: 'Admin', manager: 'Manager', marketing_signature: 'Marketing', user: 'Gebruiker' }[u.role] || u.role;

        // Module access toggle
        const accessCell = isGlobalAdmin
          ? '<span class="badge badge-sm badge-primary">Altijd</span>'
          : \`<input type="checkbox" class="toggle toggle-sm toggle-success"
               \${hasAccess ? 'checked' : ''}
               onchange="toggleAccess('\${u.id}', this.checked, this)" />\`;

        // SI Admin toggle — only meaningful when user has access
        const adminCell = isGlobalAdmin
          ? '<span class="text-xs text-base-content/40">Globale admin</span>'
          : !hasAccess
            ? '<span class="text-xs text-base-content/30">—</span>'
            : \`<input type="checkbox" class="toggle toggle-sm toggle-primary"
                 \${isSIAdmin ? 'checked' : ''}
                 onchange="toggleSIAdmin('\${row.user_module_id}', this.checked, this)" />\`;

        return \`<tr class="hover" data-name="\${(u.full_name||'').toLowerCase()}" data-email="\${u.email.toLowerCase()}">
          <td>
            <div class="font-semibold text-sm">\${u.full_name || '—'}</div>
            <div class="text-xs text-base-content/50">\${u.email}</div>
          </td>
          <td><span class="badge badge-sm badge-ghost">\${roleLabel}</span></td>
          <td class="text-center">\${accessCell}</td>
          <td class="text-center">\${adminCell}</td>
        </tr>\`;
      }).join('');

      if (window.lucide) lucide.createIcons();
    }

    // ── Filter ────────────────────────────────────────────────────────────────
    function filterTable(query) {
      const q = query.toLowerCase();
      renderTable(q ? allRows.filter(r =>
        (r.user.full_name||'').toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q)
      ) : allRows);
    }

    // ── Toggle module access ──────────────────────────────────────────────────
    async function toggleAccess(userId, enable, toggleEl) {
      try {
        const res = await fetch(\`/insights/api/sales-insights/admin/users/\${userId}/module-access\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);

        // Update local state and re-render
        const row = allRows.find(r => r.user.id === userId);
        if (row) {
          row.has_module_access = enable;
          // If disabling, also clear SI admin (no access = no admin)
          if (!enable) row.permissions = [];
        }
        toast(enable ? 'Toegang verleend' : 'Toegang ingetrokken', enable ? 'success' : 'warning');
        renderTable(allRows);
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
        toggleEl.checked = !enable; // reset
      }
    }

    // ── Toggle SI Admin ───────────────────────────────────────────────────────
    async function toggleSIAdmin(userModuleId, isAdmin, toggleEl) {
      if (!userModuleId) {
        toast('Geef eerst module toegang aan deze gebruiker', 'warning');
        toggleEl.checked = false;
        return;
      }
      const permissions = isAdmin ? ['admin'] : [];
      try {
        const res = await fetch(\`/insights/api/sales-insights/admin/users/\${userModuleId}/permissions\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        const row = allRows.find(r => r.user_module_id === userModuleId);
        if (row) row.permissions = permissions;
        toast(isAdmin ? 'SI Admin toegekend' : 'SI Admin ingetrokken', 'success');
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
        toggleEl.checked = !isAdmin;
      }
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    function toast(msg, type = 'success') {
      const el = document.createElement('div');
      el.className = \`alert alert-\${type} py-2 text-sm shadow-lg\`;
      el.textContent = msg;
      const container = document.getElementById('toastContainer');
      container.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }

    document.addEventListener('DOMContentLoaded', () => {
      loadUsers();
      if (window.lucide) lucide.createIcons();
    });
  </script>
</body>
</html>`;
}