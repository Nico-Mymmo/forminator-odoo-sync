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
          <p class="text-base-content/60">Gebruikers, modellen en rechten beheren</p>
        </div>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-bordered mb-6">
        <a role="tab" class="tab tab-active" data-tab="users" onclick="switchTab('users', this)">Gebruikers</a>
        <a role="tab" class="tab" data-tab="models" onclick="switchTab('models', this)">Modellen</a>
        <a role="tab" class="tab" data-tab="categories" onclick="switchTab('categories', this)">Categorieën</a>
      </div>

      <!-- Toast container -->
      <div id="toastContainer" class="toast toast-end z-50"></div>

      <!-- TAB: GEBRUIKERS -->
      <div id="tab-users">
        <div class="alert mb-6">
          <i data-lucide="info" class="w-5 h-5 shrink-0"></i>
          <div class="text-sm">
            <strong>Module toegang</strong> geeft een gebruiker toegang tot de Sales Insight Explorer.
            <strong>Sales Insight Admin</strong> geeft bovenop die toegang het recht om informatiecategorieën
            en velden te beheren. Wijzigingen zijn direct actief na herlogin van de gebruiker.
          </div>
        </div>

        <div class="form-control mb-4 max-w-sm">
          <input type="text" id="searchInput" placeholder="Zoek op naam of email..."
            class="input input-bordered input-sm w-full"
            oninput="filterTable(this.value)" />
        </div>

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
      </div>

      <!-- TAB: MODELLEN -->
      <div id="tab-models" style="display:none;">
        <div class="flex justify-between items-center mb-4">
          <p class="text-sm text-base-content/60">Odoo-modellen die beschikbaar zijn als startpunt of submodel in de wizard.</p>
          <button class="btn btn-sm btn-primary gap-2" onclick="openModelModal(null)">
            <i data-lucide="plus" class="w-4 h-4"></i>Nieuw model
          </button>
        </div>

        <div class="card bg-base-100 shadow-xl">
          <div class="card-body p-0">
            <div id="loadingModels" class="flex items-center gap-3 p-6">
              <span class="loading loading-spinner loading-sm"></span>
              <span class="text-sm text-base-content/60">Laden...</span>
            </div>
            <div id="modelsErrorMsg" class="alert alert-error m-4" style="display:none;"></div>
            <div id="modelsTableWrap" class="overflow-x-auto" style="display:none;">
              <table class="table table-sm w-full">
                <thead>
                  <tr class="border-b border-base-200">
                    <th>ID / Odoo model</th>
                    <th>Label</th>
                    <th>Omschrijving</th>
                    <th class="text-center">Startpunt</th>
                    <th class="text-center">Submodel</th>
                    <th class="text-center">Volgorde</th>
                    <th class="text-center">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="modelsTableBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: CATEGORIEËN -->
      <div id="tab-categories" style="display:none;">
        <div class="flex gap-3 items-end mb-5">
          <div class="form-control flex-1 max-w-xs">
            <label class="label pb-1"><span class="label-text font-semibold text-sm">Model</span></label>
            <select id="catModelSelect" class="select select-bordered select-sm" onchange="loadCategories()">
              <option value="">— Kies een model —</option>
            </select>
          </div>
          <button class="btn btn-sm btn-primary gap-2" onclick="openNewCategoryForm()">
            <i data-lucide="plus" class="w-4 h-4"></i>Nieuwe categorie
          </button>
        </div>

        <!-- New category form (hidden by default) -->
        <div id="newCategoryForm" class="card bg-base-100 border border-primary/30 shadow mb-4" style="display:none;">
          <div class="card-body py-3 px-4">
            <div class="font-semibold text-sm mb-2">Nieuwe categorie</div>
            <div class="grid grid-cols-3 gap-3 mb-2">
              <div>
                <label class="label py-0.5"><span class="label-text text-xs">ID (uniek) *</span></label>
                <input type="text" id="newCatId" class="input input-bordered input-xs w-full font-mono" placeholder="bijv. new_cat" />
              </div>
              <div>
                <label class="label py-0.5"><span class="label-text text-xs">Label *</span></label>
                <input type="text" id="newCatLabel" class="input input-bordered input-xs w-full" placeholder="Zichtbare naam" />
              </div>
              <div>
                <label class="label py-0.5"><span class="label-text text-xs">Omschrijving</span></label>
                <input type="text" id="newCatDesc" class="input input-bordered input-xs w-full" placeholder="AI-context" />
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-primary" onclick="saveNewCategory()">Aanmaken</button>
              <button class="btn btn-sm btn-ghost" onclick="document.getElementById('newCategoryForm').style.display='none'">Annuleren</button>
            </div>
          </div>
        </div>

        <div id="categoriesLoading" class="text-sm text-base-content/50 py-4" style="display:none;">Laden...</div>
        <div id="categoriesList" class="space-y-3"></div>
      </div>

    </div>
  </div>

  <!-- MODAL: model aanmaken / bewerken -->
  <dialog id="modelModal" class="modal">
    <div class="modal-box w-full max-w-lg">
      <h3 class="font-bold text-lg mb-4" id="modelModalTitle">Model</h3>
      <form id="modelForm" onsubmit="saveModel(event)">
        <input type="hidden" id="modelId" />

        <div class="form-control mb-3" id="newModelIdWrap">
          <label class="label"><span class="label-text font-semibold">ID <span class="text-error">*</span></span></label>
          <input type="text" id="modelFieldId" class="input input-bordered input-sm" placeholder="bv. crm_lead" />
          <label class="label"><span class="label-text-alt text-base-content/50">Slug: lowercase, cijfers en underscores</span></label>
        </div>

        <div class="form-control mb-3" id="newModelOdooWrap">
          <label class="label"><span class="label-text font-semibold">Odoo model <span class="text-error">*</span></span></label>
          <input type="text" id="modelFieldOdoo" class="input input-bordered input-sm" placeholder="bv. crm.lead" />
        </div>

        <div class="form-control mb-3">
          <label class="label"><span class="label-text font-semibold">Label <span class="text-error">*</span></span></label>
          <input type="text" id="modelFieldLabel" class="input input-bordered input-sm" placeholder="bv. Leads" required />
        </div>

        <div class="form-control mb-3">
          <label class="label"><span class="label-text font-semibold">Omschrijving</span></label>
          <textarea id="modelFieldDesc" class="textarea textarea-bordered text-sm" rows="3"
            placeholder="AI-context: wat stelt dit model voor?"></textarea>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3">
          <div class="form-control">
            <label class="label"><span class="label-text font-semibold">Volgorde</span></label>
            <input type="number" id="modelFieldSort" class="input input-bordered input-sm" value="0" min="0" />
          </div>
          <div class="form-control items-center">
            <label class="label"><span class="label-text font-semibold">Startpunt</span></label>
            <input type="checkbox" id="modelFieldStartpoint" class="toggle toggle-sm toggle-success" checked />
          </div>
          <div class="form-control items-center">
            <label class="label"><span class="label-text font-semibold">Submodel</span></label>
            <input type="checkbox" id="modelFieldSubmodel" class="toggle toggle-sm toggle-primary" />
          </div>
        </div>

        <!-- Base fields -->
        <div class="divider text-xs">Standaardvelden</div>
        <div class="mb-3">
          <p class="text-xs text-base-content/60 mb-2">Deze velden worden <strong>altijd</strong> opgehaald, ongeacht de geselecteerde categorieën.</p>
          <div id="baseFieldsList" class="space-y-1 mb-2"></div>
          <div class="flex gap-2">
            <input type="text" id="newBaseFieldKey" class="input input-bordered input-xs flex-1" placeholder="Veldnaam in Odoo (bv. won_status)" />
            <input type="text" id="newBaseFieldLabel" class="input input-bordered input-xs w-32" placeholder="Label" />
            <button type="button" class="btn btn-xs btn-outline" onclick="addBaseField()">+ Voeg toe</button>
          </div>
        </div>

        <div class="modal-action mt-4">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('modelModal').close()">Annuleren</button>
          <button type="submit" class="btn btn-primary btn-sm" id="modelSaveBtn">Opslaan</button>
        </div>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <script>
    let allRows       = [];
    let allModels     = [];
    let currentBaseFields = [];
    let allCatModels  = [];

    // ── Tabs ──────────────────────────────────────────────────────────────────
    function switchTab(tab, el) {
      document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('tab-active'));
      el.classList.add('tab-active');
      document.getElementById('tab-users').style.display      = tab === 'users'      ? '' : 'none';
      document.getElementById('tab-models').style.display     = tab === 'models'     ? '' : 'none';
      document.getElementById('tab-categories').style.display = tab === 'categories' ? '' : 'none';
      if (tab === 'models' && allModels.length === 0) loadModels();
      if (tab === 'categories') initCategoriesTab();
    }

    // ── Load users ────────────────────────────────────────────────────────────
    async function loadUsers() {
      try {
        const res  = await fetch('/insights/api/sales-insights/admin/users');
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

    function renderTable(rows) {
      const tbody = document.getElementById('usersTableBody');
      tbody.innerHTML = rows.map(row => {
        const u = row.user;
        const isGlobalAdmin = u.role === 'admin';
        const hasAccess     = row.has_module_access || isGlobalAdmin;
        const isSIAdmin     = Array.isArray(row.permissions) && row.permissions.includes('admin');
        const roleLabel     = { admin: 'Admin', manager: 'Manager', marketing_signature: 'Marketing', user: 'Gebruiker' }[u.role] || u.role;

        const accessCell = isGlobalAdmin
          ? '<span class="badge badge-sm badge-primary">Altijd</span>'
          : \`<input type="checkbox" class="toggle toggle-sm toggle-success"
               \${hasAccess ? 'checked' : ''}
               onchange="toggleAccess('\${u.id}', this.checked, this)" />\`;

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

    function filterTable(query) {
      const q = query.toLowerCase();
      renderTable(q ? allRows.filter(r =>
        (r.user.full_name||'').toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q)
      ) : allRows);
    }

    async function toggleAccess(userId, enable, toggleEl) {
      try {
        const res = await fetch(\`/insights/api/sales-insights/admin/users/\${userId}/module-access\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        const row = allRows.find(r => r.user.id === userId);
        if (row) {
          row.has_module_access = enable;
          if (!enable) row.permissions = [];
        }
        toast(enable ? 'Toegang verleend' : 'Toegang ingetrokken', enable ? 'success' : 'warning');
        renderTable(allRows);
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
        toggleEl.checked = !enable;
      }
    }

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

    // ── Load models ───────────────────────────────────────────────────────────
    async function loadModels() {
      document.getElementById('loadingModels').style.display = 'flex';
      document.getElementById('modelsTableWrap').style.display = 'none';
      try {
        const res  = await fetch('/insights/api/sales-insights/models-config');
        const data = await res.json();
        document.getElementById('loadingModels').style.display = 'none';
        if (!data.success) throw new Error(data.error?.message);
        allModels = data.data.models;
        renderModels(allModels);
        document.getElementById('modelsTableWrap').style.display = 'block';
      } catch (e) {
        document.getElementById('loadingModels').style.display = 'none';
        const err = document.getElementById('modelsErrorMsg');
        err.textContent = 'Fout bij laden: ' + e.message;
        err.style.display = 'flex';
      }
    }

    function renderModels(models) {
      const tbody = document.getElementById('modelsTableBody');
      if (!models.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-base-content/40 py-6">Geen modellen gevonden</td></tr>';
        return;
      }
      tbody.innerHTML = models.map(m => {
        const desc = m.description ? m.description.slice(0, 60) + (m.description.length > 60 ? '…' : '') : '';
        const descHtml = desc ? desc : '<span class="opacity-40">—</span>';
        const startBadge = m.can_be_startpoint ? '<span class="badge badge-xs badge-success">ja</span>' : '<span class="badge badge-xs badge-ghost">nee</span>';
        const subBadge   = m.can_be_submodel   ? '<span class="badge badge-xs badge-primary">ja</span>' : '<span class="badge badge-xs badge-ghost">nee</span>';
        const statusBadge = m.is_active !== false ? '<span class="badge badge-xs badge-success">actief</span>' : '<span class="badge badge-xs badge-error">inactief</span>';
        const editBtn = '<button class="btn btn-xs btn-ghost" data-action="editModel" data-id="' + m.id + '" title="Bewerken"><i data-lucide="pencil" class="w-3 h-3"></i></button>';
        const delBtn  = m.is_active !== false ? '<button class="btn btn-xs btn-ghost text-error" data-action="deactivateModel" data-id="' + m.id + '" title="Deactiveren"><i data-lucide="trash-2" class="w-3 h-3"></i></button>' : '';
        return '<tr class="hover">'
          + '<td><div class="font-mono text-xs font-semibold">' + m.id + '</div><div class="text-xs text-base-content/50">' + m.odoo_model + '</div></td>'
          + '<td class="text-sm">' + m.label + '</td>'
          + '<td class="text-xs text-base-content/60 max-w-xs">' + descHtml + '</td>'
          + '<td class="text-center">' + startBadge + '</td>'
          + '<td class="text-center">' + subBadge + '</td>'
          + '<td class="text-center text-sm">' + m.sort_order + '</td>'
          + '<td class="text-center">' + statusBadge + '</td>'
          + '<td class="text-right"><div class="flex gap-1 justify-end">' + editBtn + delBtn + '</div></td>'
          + '</tr>';
      }).join('');
      if (window.lucide) lucide.createIcons();
    }

    // ── Base fields helpers ───────────────────────────────────────────────────
    function renderBaseFieldsList() {
      const list = document.getElementById('baseFieldsList');
      if (!list) return;
      if (!currentBaseFields.length) {
        list.innerHTML = '<p class="text-xs text-base-content/40 italic">Geen standaardvelden — voeg er minstens één toe.</p>';
        return;
      }
      list.innerHTML = currentBaseFields.map((bf, i) =>
        '<div class="flex items-center gap-2 bg-base-200 rounded px-2 py-1">'
        + '<span class="font-mono text-xs w-40 shrink-0">' + bf.field + '</span>'
        + '<input type="text" class="input input-xs input-ghost flex-1 min-w-0" value="' + (bf.label || '').replace(/"/g, '&quot;') + '" placeholder="Label" data-action="baseFieldLabel" data-idx="' + i + '" />'
        + '<button type="button" class="btn btn-xs btn-ghost text-error shrink-0" data-action="removeBaseField" data-idx="' + i + '">✕</button>'
        + '</div>'
      ).join('');
    }

    // Live label editing via event delegation
    document.addEventListener('input', e => {
      const el = e.target.closest('[data-action="baseFieldLabel"]');
      if (!el) return;
      currentBaseFields[parseInt(el.dataset.idx, 10)].label = el.value;
    });

    function addBaseField() {
      const fieldKey   = document.getElementById('newBaseFieldKey').value.trim();
      const fieldLabel = document.getElementById('newBaseFieldLabel').value.trim();
      if (!fieldKey) { toast('Veldnaam is verplicht', 'warning'); return; }
      if (currentBaseFields.find(bf => bf.field === fieldKey)) { toast('Veld staat er al in', 'warning'); return; }
      currentBaseFields.push({ field: fieldKey, label: fieldLabel || fieldKey });
      document.getElementById('newBaseFieldKey').value   = '';
      document.getElementById('newBaseFieldLabel').value = '';
      renderBaseFieldsList();
    }

    // Central click also handles removeBaseField
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const { action, id, idx } = el.dataset;
      if (action === 'editModel')       { const m = allModels.find(x => x.id === id); if (m) openModelModal(m); }
      if (action === 'deactivateModel') deactivateModel(id);
      if (action === 'removeBaseField') {
        currentBaseFields.splice(parseInt(idx, 10), 1);
        renderBaseFieldsList();
      }
      if (action === 'toggleCatEdit')  toggleCatEdit(id);
      if (action === 'catSaveSet')     catSaveSet(id);
      if (action === 'catDeleteSet')   catDeleteSet(id);
      if (action === 'catMoveUp')      catMoveOrder(id, -1);
      if (action === 'catMoveDown')    catMoveOrder(id, 1);
      if (action === 'catSaveField')   catSaveField(id);
      if (action === 'catDeleteField') catDeleteField(id);
      if (action === 'catAddField')    catAddField(id);
      if (action === 'openNewCategoryForm') openNewCategoryForm();
      if (action === 'saveNewCategory')    saveNewCategory();
    });

    // ── Model modal ───────────────────────────────────────────────────────────
    function openModelModal(model) {
      const isNew = !model;
      document.getElementById('modelModalTitle').textContent    = isNew ? 'Nieuw model' : 'Model bewerken';
      document.getElementById('modelId').value                  = model ? model.id : '';
      document.getElementById('modelFieldLabel').value          = model ? model.label : '';
      document.getElementById('modelFieldDesc').value           = model ? (model.description || '') : '';
      document.getElementById('modelFieldSort').value           = model ? model.sort_order : 0;
      document.getElementById('modelFieldStartpoint').checked   = model ? !!model.can_be_startpoint : true;
      document.getElementById('modelFieldSubmodel').checked     = model ? !!model.can_be_submodel   : false;
      document.getElementById('newModelIdWrap').style.display   = isNew ? '' : 'none';
      document.getElementById('newModelOdooWrap').style.display = isNew ? '' : 'none';
      if (isNew) {
        document.getElementById('modelFieldId').value   = '';
        document.getElementById('modelFieldOdoo').value = '';
      }
      // Base fields
      currentBaseFields = model?.base_fields ? JSON.parse(JSON.stringify(model.base_fields)) : [];
      renderBaseFieldsList();
      document.getElementById('newBaseFieldKey').value   = '';
      document.getElementById('newBaseFieldLabel').value = '';
      document.getElementById('modelModal').showModal();
    }

    async function saveModel(e) {
      e.preventDefault();
      const id     = document.getElementById('modelId').value;
      const isNew  = !id;
      const body   = {
        label:             document.getElementById('modelFieldLabel').value.trim(),
        description:       document.getElementById('modelFieldDesc').value.trim() || null,
        sort_order:        parseInt(document.getElementById('modelFieldSort').value) || 0,
        can_be_startpoint: document.getElementById('modelFieldStartpoint').checked,
        can_be_submodel:   document.getElementById('modelFieldSubmodel').checked,
        base_fields:       currentBaseFields
      };
      if (isNew) {
        body.id         = document.getElementById('modelFieldId').value.trim();
        body.odoo_model = document.getElementById('modelFieldOdoo').value.trim();
      }
      const btn = document.getElementById('modelSaveBtn');
      btn.disabled = true; btn.textContent = 'Opslaan...';
      try {
        const url    = isNew ? '/insights/api/sales-insights/models' : '/insights/api/sales-insights/models/' + id;
        const method = isNew ? 'POST' : 'PATCH';
        const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data   = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast(isNew ? 'Model aangemaakt' : 'Model bijgewerkt', 'success');
        document.getElementById('modelModal').close();
        allModels = [];
        loadModels();
      } catch (err) {
        toast('Fout: ' + err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Opslaan';
      }
    }

    async function deactivateModel(id) {
      if (!confirm('Model deactiveren?')) return;
      try {
        const res  = await fetch('/insights/api/sales-insights/models/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast('Model gedeactiveerd', 'warning');
        allModels = [];
        loadModels();
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
      }
    }

    function toast(msg, type) {
      const t = document.createElement('div');
      t.className = 'alert alert-' + (type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'error') + ' py-2 px-4 text-sm shadow-lg';
      t.textContent = msg;
      document.getElementById('toastContainer').appendChild(t);
      setTimeout(() => t.remove(), 3500);
    }

    // ── Categories tab ────────────────────────────────────────────────────────
    async function initCategoriesTab() {
      const sel = document.getElementById('catModelSelect');
      if (sel.options.length <= 1) {
        try {
          const res  = await fetch('/insights/api/sales-insights/models-config');
          const data = await res.json();
          if (data.success) {
            allCatModels = data.data.models;
            allCatModels.forEach(m => {
              const opt = document.createElement('option');
              opt.value = m.id;
              opt.textContent = m.label + ' (' + m.id + ')';
              sel.appendChild(opt);
            });
          }
        } catch (e) { /* ignore */ }
      }
      if (sel.value) loadCategories();
    }

    async function loadCategories() {
      const model = document.getElementById('catModelSelect').value;
      const list  = document.getElementById('categoriesList');
      const spin  = document.getElementById('categoriesLoading');
      list.innerHTML = '';
      if (!model) return;
      spin.style.display = '';
      try {
        const res  = await fetch('/insights/api/sales-insights/information-sets?model=' + encodeURIComponent(model));
        const data = await res.json();
        spin.style.display = 'none';
        if (!data.success) throw new Error(data.error?.message);
        renderCategories(data.data.sets);
      } catch (e) {
        spin.style.display = 'none';
        list.innerHTML = '<div class="alert alert-error text-sm">' + e.message + '</div>';
      }
    }

    // Track loaded sets for order operations
    let _loadedSets = [];

    function renderCategories(sets) {
      _loadedSets = sets;
      const list = document.getElementById('categoriesList');
      if (!sets.length) {
        list.innerHTML = '<p class="text-sm text-base-content/40 italic">Geen categorieën voor dit model.</p>';
        return;
      }
      list.innerHTML = sets.map((s, idx) => {
        const fields = s.information_set_fields || [];
        const isFirst = idx === 0;
        const isLast  = idx === sets.length - 1;
        const fieldsHtml = fields.map(f =>
          '<div class="flex items-center gap-2 py-0.5" id="field-row-' + f.id + '">'
          + '<span class="font-mono text-xs w-36 shrink-0">' + f.field_key + '</span>'
          + '<input type="text" class="input input-xs input-bordered flex-1 min-w-0" id="field-label-' + f.id + '" value="' + (f.label || '').replace(/"/g, '&quot;') + '" placeholder="Label" />'
          + '<button class="btn btn-xs btn-ghost text-primary shrink-0" data-action="catSaveField" data-id="' + f.id + '" title="Opslaan">&#10003;</button>'
          + '<button class="btn btn-xs btn-ghost text-error shrink-0" data-action="catDeleteField" data-id="' + f.id + '" title="Verwijder">&#x2715;</button>'
          + '</div>'
        ).join('');
        const addFieldRow = '<div class="flex gap-2 mt-2">'
          + '<input type="text" class="input input-xs input-bordered w-36" id="new-field-key-' + s.id + '" placeholder="Veldnaam (Odoo)" />'
          + '<input type="text" class="input input-xs input-bordered flex-1" id="new-field-label-' + s.id + '" placeholder="Label" />'
          + '<button class="btn btn-xs btn-outline" data-action="catAddField" data-id="' + s.id + '">+ Voeg toe</button>'
          + '</div>';
        return '<div class="card bg-base-100 shadow border border-base-200">'
          + '<div class="card-body py-3 px-4">'
          + '<div class="flex items-center gap-2 mb-1">'
          + '<div class="flex flex-col gap-0 shrink-0">'
          + '<button class="btn btn-xs btn-ghost h-4 min-h-0 px-1 opacity-40 hover:opacity-80' + (isFirst ? ' invisible' : '') + '" data-action="catMoveUp" data-id="' + s.id + '" title="Omhoog">&#9650;</button>'
          + '<button class="btn btn-xs btn-ghost h-4 min-h-0 px-1 opacity-40 hover:opacity-80' + (isLast ? ' invisible' : '') + '" data-action="catMoveDown" data-id="' + s.id + '" title="Omlaag">&#9660;</button>'
          + '</div>'
          + '<span class="font-semibold text-sm">' + s.label + '</span>'
          + '<span class="badge badge-xs badge-ghost font-mono">' + s.id + '</span>'
          + '<span class="ml-auto flex gap-1">'
          + '<button class="btn btn-xs btn-ghost" data-action="toggleCatEdit" data-id="' + s.id + '" title="Bewerken"><i data-lucide="pencil" class="w-3 h-3"></i></button>'
          + '<button class="btn btn-xs btn-ghost text-error" data-action="catDeleteSet" data-id="' + s.id + '" title="Verwijder categorie"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
          + '</span>'
          + '</div>'
          + (s.description ? '<p class="text-xs text-base-content/50 mb-2">' + s.description + '</p>' : '')
          + '<div id="cat-edit-' + s.id + '" style="display:none;">'
          + '<div class="form-control mb-1"><input type="text" class="input input-xs input-bordered w-full" id="cat-label-' + s.id + '" value="' + s.label.replace(/"/g, '&quot;') + '" placeholder="Label" /></div>'
          + '<div class="form-control mb-2"><input type="text" class="input input-xs input-bordered w-full" id="cat-desc-' + s.id + '" value="' + (s.description || '').replace(/"/g, '&quot;') + '" placeholder="Omschrijving" /></div>'
          + '<button class="btn btn-xs btn-primary mb-3" data-action="catSaveSet" data-id="' + s.id + '">Opslaan</button>'
          + '</div>'
          + '<div class="space-y-0.5">' + fieldsHtml + '</div>'
          + addFieldRow
          + '</div>'
          + '</div>';
      }).join('');
      if (window.lucide) lucide.createIcons();
    }

    function openNewCategoryForm() {
      document.getElementById('newCategoryForm').style.display = '';
      document.getElementById('newCatId').value    = '';
      document.getElementById('newCatLabel').value = '';
      document.getElementById('newCatDesc').value  = '';
    }

    async function saveNewCategory() {
      const model = document.getElementById('catModelSelect').value;
      if (!model) { toast('Kies eerst een model', 'warning'); return; }
      const id    = document.getElementById('newCatId').value.trim();
      const label = document.getElementById('newCatLabel').value.trim();
      const desc  = document.getElementById('newCatDesc').value.trim();
      if (!id || !label) { toast('ID en label zijn verplicht', 'warning'); return; }
      try {
        const res  = await fetch('/insights/api/sales-insights/information-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, label, description: desc || null, model })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast('Categorie aangemaakt', 'success');
        document.getElementById('newCategoryForm').style.display = 'none';
        loadCategories();
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
      }
    }

    function toggleCatEdit(setId) {
      const el = document.getElementById('cat-edit-' + setId);
      if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
    }

    async function catSaveSet(setId) {
      const label = document.getElementById('cat-label-' + setId)?.value?.trim();
      const desc  = document.getElementById('cat-desc-' + setId)?.value?.trim();
      if (!label) { toast('Label is verplicht', 'warning'); return; }
      try {
        const res  = await fetch('/insights/api/sales-insights/information-sets/' + setId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, description: desc || null })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast('Categorie bijgewerkt', 'success');
        loadCategories();
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
      }
    }

    async function catDeleteSet(setId) {
      if (!confirm('Categorie verwijderen? De velden worden ook verwijderd.')) return;
      try {
        const res  = await fetch('/insights/api/sales-insights/information-sets/' + setId, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) {
          const msg = data.error?.message || ('HTTP ' + res.status);
          throw new Error(msg);
        }
        toast('Categorie verwijderd', 'warning');
        loadCategories();
      } catch (e) {
        toast('Fout bij verwijderen: ' + e.message, 'error');
      }
    }

    async function catMoveOrder(setId, direction) {
      const idx = _loadedSets.findIndex(s => s.id === setId);
      if (idx < 0) return;
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= _loadedSets.length) return;
      // Bouw de nieuwe volgorde door de twee items te wisselen
      const newOrder = [..._loadedSets];
      const tmp = newOrder[idx]; newOrder[idx] = newOrder[swapIdx]; newOrder[swapIdx] = tmp;
      // Hernoem ALLE items met sequentiële sort_orders zodat duplicaten
      // nooit meer voor kunnen komen (ook na eerdere duplicaten in de DB).
      try {
        const responses = await Promise.all(newOrder.map(function(s, i) {
          return fetch('/insights/api/sales-insights/information-sets/' + s.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: (i + 1) * 10 })
          }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); });
        }));
        const failed = responses.find(function(r) { return !r.ok || !r.data.success; });
        if (failed) throw new Error(failed.data?.error?.message || 'PATCH mislukt');
        loadCategories();
      } catch (e) {
        toast('Fout bij rangschikken: ' + e.message, 'error');
      }
    }

    async function catSaveField(fieldId) {
      const label = document.getElementById('field-label-' + fieldId)?.value?.trim();
      try {
        const res  = await fetch('/insights/api/sales-insights/information-set-fields/' + fieldId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label || null })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast('Veld opgeslagen', 'success');
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
      }
    }

    async function catDeleteField(fieldId) {
      if (!confirm('Veld verwijderen?')) return;
      try {
        const res  = await fetch('/insights/api/sales-insights/information-set-fields/' + fieldId, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast('Veld verwijderd', 'warning');
        loadCategories();
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
      }
    }

    async function catAddField(setId) {
      const fieldKey   = document.getElementById('new-field-key-' + setId)?.value?.trim();
      const fieldLabel = document.getElementById('new-field-label-' + setId)?.value?.trim();
      if (!fieldKey) { toast('Veldnaam is verplicht', 'warning'); return; }
      try {
        const res  = await fetch('/insights/api/sales-insights/information-set-fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set_id: setId, field_key: fieldKey, label: fieldLabel || null })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message);
        toast('Veld toegevoegd', 'success');
        loadCategories();
      } catch (e) {
        toast('Fout: ' + e.message, 'error');
      }
    }

    loadUsers();
  </script>
</body>
</html>`;
}
