// Admin Dashboard — Beheer
// Vanilla JS (ES6+), data-action + centrale event-listeners, geen inline handlers.

lucide.createIcons();

let allModules = [];
let allUsers = [];

const ROLE_LABELS = {
  user: 'Gebruiker',
  manager: 'Manager',
  marketing_signature: 'Marketing Signatures',
  admin: 'Admin'
};

// ====== Helpers ======

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  var cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
  var toast = document.createElement('div');
  toast.className = 'alert ' + cls + ' text-sm py-2 px-4';
  var span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  if (type === 'error') {
    var close = document.createElement('button');
    close.className = 'btn btn-ghost btn-xs';
    close.setAttribute('data-action', 'dismissToast');
    close.textContent = '✕';
    toast.appendChild(close);
  }
  container.appendChild(toast);
  if (type !== 'error') setTimeout(function() { toast.remove(); }, 3000);
}

async function apiFetch(url, options) {
  const res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Niet ingelogd');
  }
  return res;
}

function userDisplayName(user) {
  return user.full_name || user.fullName || user.email;
}

// ====== Bevestigingsmodal ======

let confirmCallback = null;
let pendingRoleRevert = null;

function openConfirm(opts) {
  document.getElementById('confirmTitle').textContent = opts.title;
  document.getElementById('confirmBody').textContent = opts.body;
  const ok = document.getElementById('confirmOkBtn');
  ok.className = 'btn btn-sm ' + (opts.danger ? 'btn-error' : 'btn-primary');
  ok.textContent = opts.okLabel || 'Bevestigen';
  ok.disabled = false;
  confirmCallback = opts.onConfirm;
  document.getElementById('confirmModal').showModal();
}

document.getElementById('confirmModal').addEventListener('close', function() {
  // Annuleren of backdrop: openstaande rolwijziging terugdraaien
  if (pendingRoleRevert) {
    pendingRoleRevert();
    pendingRoleRevert = null;
  }
  confirmCallback = null;
});

// ====== Thema ======

function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('selectedTheme', theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('selectedTheme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const selector = document.getElementById('themeSelector');
  if (selector) {
    selector.value = savedTheme;
  }
}

// ====== Navbar ======

async function renderNavbar() {
  const response = await apiFetch('/api/auth/me');
  const data = await response.json();
  if (!data.user) { window.location.href = '/'; return; }
  if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
}

// ====== Modules ======

async function loadModules() {
  try {
    const response = await apiFetch('/admin/api/modules');
    const data = await response.json();
    allModules = data.modules || [];
    renderModuleCheckboxes();
    renderModulesTable();
    document.getElementById('statsModules').textContent = allModules.length;
  } catch (error) {
    console.error('Modules laden mislukt:', error);
    document.getElementById('statsModules').textContent = '—';
    showToast('Modules laden mislukt. Probeer het opnieuw', 'error');
  }
}

function renderModuleCheckboxes() {
  const container = document.getElementById('moduleCheckboxes');
  if (allModules.length === 0) {
    container.innerHTML = '<p class="text-sm text-base-content/60">Geen modules beschikbaar</p>';
    return;
  }

  container.innerHTML = allModules.map(m =>
    '<label class="label cursor-pointer justify-start gap-2 py-1">' +
      '<input type="checkbox" name="modules" value="' + escapeHtml(m.code) + '" class="checkbox checkbox-sm" />' +
      '<span class="label-text text-sm">' + escapeHtml(m.name) + '</span>' +
    '</label>'
  ).join('');
}

function renderModulesTable() {
  const container = document.getElementById('modulesTable');

  if (allModules.length === 0) {
    container.innerHTML =
      '<div class="flex flex-col items-center justify-center py-20 text-center">' +
        '<i data-lucide="package-open" class="w-12 h-12 text-base-content/40 mb-4"></i>' +
        '<p class="text-sm text-base-content/40">Geen modules beschikbaar.</p>' +
      '</div>';
    lucide.createIcons();
    return;
  }

  container.innerHTML = allModules.map(m =>
    '<div class="flex items-center justify-between gap-4 p-3 border border-base-200 rounded-lg mb-2' + (!m.inRegistry ? ' opacity-60' : '') + '">' +
      '<div class="flex items-center gap-3 min-w-0">' +
        '<div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">' +
          '<i data-lucide="' + escapeHtml(m.icon || 'package') + '" class="w-4 h-4 text-primary"></i>' +
        '</div>' +
        '<div class="min-w-0">' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-sm font-semibold truncate">' + escapeHtml(m.name) + '</span>' +
            (!m.inRegistry ? '<span class="badge badge-xs badge-warning">Verouderd</span>' : '') +
          '</div>' +
          '<div class="text-xs text-base-content/50 truncate">' + escapeHtml(m.description || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-center gap-2 shrink-0">' +
        '<span class="badge badge-sm ' + (m.isActive ? 'badge-success' : 'badge-ghost') + '">' +
          (m.isActive ? 'Actief' : 'Inactief') +
        '</span>' +
        '<button class="btn btn-ghost btn-xs" data-action="editModuleUsers" data-id="' + escapeHtml(String(m.id)) + '" data-name="' + escapeHtml(m.name) + '" title="Gebruikers beheren">' +
          '<i data-lucide="users" class="w-4 h-4"></i>' +
        '</button>' +
        (m.inRegistry
          ? '<button class="btn btn-ghost btn-xs" data-action="toggleModule" data-id="' + escapeHtml(String(m.id)) + '" data-active="' + (m.isActive ? '1' : '0') + '" title="' + (m.isActive ? 'Deactiveren' : 'Activeren') + '">' +
              '<i data-lucide="' + (m.isActive ? 'toggle-right' : 'toggle-left') + '" class="w-4 h-4"></i>' +
            '</button>'
          : '<button class="btn btn-ghost btn-xs text-error" data-action="deleteModule" data-id="' + escapeHtml(String(m.id)) + '" data-name="' + escapeHtml(m.name) + '" title="Verwijderen">' +
              '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
            '</button>'
        ) +
      '</div>' +
    '</div>'
  ).join('');
  lucide.createIcons();
}

// ====== Gebruikers ======

async function loadUsers() {
  try {
    const response = await apiFetch('/admin/api/users');
    const data = await response.json();
    allUsers = data.users || [];
    renderUsersTable();
    document.getElementById('statsUsers').textContent = allUsers.filter(u => u.isActive).length;
  } catch (error) {
    console.error('Gebruikers laden mislukt:', error);
    document.getElementById('statsUsers').textContent = '—';
    document.getElementById('usersTable').innerHTML =
      '<div class="alert alert-error text-sm"><span>Gebruikers laden mislukt. Vernieuw de pagina of probeer het later opnieuw.</span></div>';
  }
}

function roleSelectHtml(user) {
  const opts = Object.keys(ROLE_LABELS).map(r =>
    '<option value="' + r + '"' + (user.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>'
  ).join('');
  return '<select class="select select-sm select-bordered" data-action="changeRole" data-id="' + escapeHtml(user.id) + '">' + opts + '</select>';
}

function renderUsersTable() {
  const container = document.getElementById('usersTable');

  if (allUsers.length === 0) {
    container.innerHTML =
      '<div class="flex flex-col items-center justify-center py-20 text-center">' +
        '<i data-lucide="users" class="w-12 h-12 text-base-content/40 mb-4"></i>' +
        '<p class="text-base font-semibold text-base-content/60 mb-1">Nog geen gebruikers</p>' +
        '<p class="text-sm text-base-content/40">Maak de eerste gebruiker aan via het tabblad ‘Gebruiker aanmaken’.</p>' +
      '</div>';
    lucide.createIcons();
    return;
  }

  const rows = allUsers.map(user => {
    const searchText = ((user.email || '') + ' ' + (user.full_name || user.fullName || '')).toLowerCase();
    return '<tr data-user-email="' + escapeHtml(user.email) + '" data-search="' + escapeHtml(searchText) + '">' +
      '<td class="font-medium">' + escapeHtml(user.email) + '</td>' +
      '<td>' + roleSelectHtml(user) + '</td>' +
      '<td>' +
        '<div class="flex flex-wrap gap-1">' +
          (user.modules && user.modules.length > 0
            ? user.modules.map(m => '<span class="badge badge-sm badge-ghost">' + escapeHtml(m.name || m.code || m) + '</span>').join('')
            : '<span class="text-xs text-base-content/40">Geen</span>'
          ) +
        '</div>' +
      '</td>' +
      '<td>' +
        '<span class="badge badge-sm ' + (user.isActive ? 'badge-success' : 'badge-ghost') + '">' +
          (user.isActive ? 'Actief' : 'Inactief') +
        '</span>' +
      '</td>' +
      '<td class="text-sm text-base-content/60">' + new Date(user.createdAt).toLocaleDateString('nl-NL') + '</td>' +
      '<td class="text-sm text-base-content/60">' +
        (user.lastLoginAt
          ? new Date(user.lastLoginAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })
          : '<span class="text-base-content/30">Nooit</span>'
        ) +
      '</td>' +
      '<td>' +
        '<div class="join">' +
          '<button class="btn btn-ghost btn-xs join-item" data-action="editModules" data-id="' + escapeHtml(user.id) + '" title="Modules bewerken">' +
            '<i data-lucide="package" class="w-3.5 h-3.5"></i>' +
          '</button>' +
          '<button class="btn btn-ghost btn-xs join-item" data-action="editOdooEmail" data-email="' + escapeHtml(user.email) + '" title="Odoo e-mail-overrides">' +
            '<i data-lucide="at-sign" class="w-3.5 h-3.5"></i>' +
          '</button>' +
          '<button class="btn btn-ghost btn-xs join-item" data-action="editOdooUid" data-id="' + escapeHtml(user.id) + '" data-uid="' + (user.odooUid ?? '') + '" title="Odoo UID">' +
            '<i data-lucide="hash" class="w-3.5 h-3.5"></i>' +
          '</button>' +
          '<button class="btn btn-ghost btn-xs join-item" data-action="editUsername" data-id="' + escapeHtml(user.id) + '" data-username="' + escapeHtml(user.username ?? '') + '" title="Gebruikersnaam">' +
            '<i data-lucide="user-round-pen" class="w-3.5 h-3.5"></i>' +
          '</button>' +
          '<button class="btn btn-ghost btn-xs join-item" data-action="editPassword" data-id="' + escapeHtml(user.id) + '" data-email="' + escapeHtml(user.email) + '" title="Wachtwoord opnieuw instellen">' +
            '<i data-lucide="key-round" class="w-3.5 h-3.5"></i>' +
          '</button>' +
          '<button class="btn btn-ghost btn-xs join-item' + (user.isActive ? ' text-error' : '') + '" data-action="toggleStatus" data-id="' + escapeHtml(user.id) + '" title="Status wisselen">' +
            '<i data-lucide="' + (user.isActive ? 'user-x' : 'user-check') + '" class="w-3.5 h-3.5"></i>' +
          '</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  container.innerHTML =
    '<table class="table table-zebra table-sm">' +
      '<thead>' +
        '<tr>' +
          '<th>E-mailadres</th>' +
          '<th>Rol</th>' +
          '<th>Modules</th>' +
          '<th>Status</th>' +
          '<th>Aangemaakt</th>' +
          '<th>Laatste login</th>' +
          '<th>Acties</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';

  lucide.createIcons();
  applyUserSearch();
}

// Client-side zoekfilter: verbergt niet-matchende rijen
function applyUserSearch() {
  const q = (document.getElementById('userSearch').value || '').trim().toLowerCase();
  document.querySelectorAll('#usersTable tbody tr').forEach(tr => {
    tr.classList.toggle('hidden', q !== '' && !(tr.dataset.search || '').includes(q));
  });
}

function highlightUserRow(email) {
  const tr = document.querySelector('#usersTable tbody tr[data-user-email="' + CSS.escape(email) + '"]');
  if (!tr) return;
  tr.classList.add('bg-success/20');
  setTimeout(function() { tr.classList.remove('bg-success/20'); }, 3000);
}

// ====== Rolwijziging (met bevestiging) ======

function requestRoleChange(selectEl, userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  const newRole = selectEl.value;
  const oldRole = user.role;
  if (newRole === oldRole) return;

  pendingRoleRevert = function() { selectEl.value = oldRole; };

  const name = userDisplayName(user);
  let body = 'Rol wijzigen van ' + (ROLE_LABELS[oldRole] || oldRole) + ' naar ' + (ROLE_LABELS[newRole] || newRole) + ' voor ' + name + '?';
  if (newRole === 'admin') {
    body += ' Deze gebruiker krijgt toegang tot het beheerpaneel.';
  }

  openConfirm({
    title: 'Rol wijzigen',
    body: body,
    okLabel: 'Rol wijzigen',
    danger: newRole === 'admin',
    onConfirm: async function() {
      pendingRoleRevert = null;
      try {
        const res = await apiFetch('/admin/api/users/' + userId + '/role', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole })
        });
        if (!res.ok) throw new Error('Serverfout');
        showToast('Rol van ' + name + ' gewijzigd naar ' + (ROLE_LABELS[newRole] || newRole), 'success');
        await loadUsers();
      } catch (error) {
        console.error('Rol bijwerken mislukt:', error);
        selectEl.value = oldRole;
        showToast('Rol bijwerken mislukt. Probeer het opnieuw', 'error');
      }
    }
  });
}

// ====== Status wisselen (met bevestiging) ======

function requestStatusToggle(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  const name = userDisplayName(user);
  const deactivating = user.isActive;

  openConfirm({
    title: deactivating ? 'Gebruiker deactiveren' : 'Gebruiker activeren',
    body: deactivating
      ? 'Weet je zeker dat je ' + name + ' (' + user.email + ') wilt deactiveren? De gebruiker kan niet meer inloggen.'
      : 'Weet je zeker dat je ' + name + ' (' + user.email + ') wilt activeren? De gebruiker kan hierna weer inloggen.',
    okLabel: deactivating ? 'Deactiveren' : 'Activeren',
    danger: deactivating,
    onConfirm: async function() {
      try {
        const res = await apiFetch('/admin/api/users/' + userId + '/toggle', { method: 'PUT' });
        if (!res.ok) throw new Error('Serverfout');
        showToast(name + (deactivating ? ' gedeactiveerd' : ' geactiveerd'), 'success');
        await loadUsers();
      } catch (error) {
        console.error('Status bijwerken mislukt:', error);
        showToast('Status bijwerken mislukt. Probeer het opnieuw', 'error');
      }
    }
  });
}

// ====== Modules bewerken (modal) ======

let modulesModalUserId = null;
let moduleUsersModalId = null;
let moduleUsersCache = []; // laatst opgehaalde { id, email, fullName, isActive, hasAccess }[] voor de open modal

function openModulesModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  modulesModalUserId = userId;

  const currentCodes = (user.modules || []).map(m => typeof m === 'string' ? m : m.code);

  document.getElementById('modulesModalSub').textContent = 'Moduletoegang voor ' + user.email;
  document.getElementById('modulesModalList').innerHTML = allModules.map(m =>
    '<label class="label cursor-pointer justify-start gap-3 py-1.5 rounded hover:bg-base-200 px-2">' +
      '<input type="checkbox" value="' + escapeHtml(m.code) + '" class="checkbox checkbox-sm"' + (currentCodes.includes(m.code) ? ' checked' : '') + ' />' +
      '<span class="label-text text-sm">' + escapeHtml(m.name) + '</span>' +
    '</label>'
  ).join('');

  document.getElementById('modulesModal').showModal();
}

async function saveUserModules() {
  if (!modulesModalUserId) return;
  const user = allUsers.find(u => u.id === modulesModalUserId);
  const btn = document.getElementById('saveModulesBtn');
  const modules = Array.from(document.querySelectorAll('#modulesModalList input[type="checkbox"]:checked')).map(cb => cb.value);

  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Opslaan…';

  try {
    const res = await apiFetch('/admin/api/users/' + modulesModalUserId + '/modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: modules })
    });
    if (!res.ok) throw new Error('Serverfout');
    document.getElementById('modulesModal').close();
    showToast('Modules van ' + (user ? user.email : 'gebruiker') + ' bijgewerkt', 'success');
    await loadUsers();
  } catch (error) {
    console.error('Modules bijwerken mislukt:', error);
    showToast('Modules bijwerken mislukt. Probeer het opnieuw', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Opslaan';
    modulesModalUserId = null;
  }
}

// ====== Module-gebruikers bewerken (modal, vanuit de Modules-tab) ======

async function openModuleUsersModal(moduleId, moduleName) {
  moduleUsersModalId = moduleId;
  document.getElementById('moduleUsersModalSub').textContent = 'Wie mag "' + moduleName + '" gebruiken?';
  document.getElementById('moduleUsersSearch').value = '';
  document.getElementById('moduleUsersModalList').innerHTML =
    '<div class="flex justify-center py-6"><span class="loading loading-spinner loading-sm"></span></div>';
  document.getElementById('moduleUsersModal').showModal();

  try {
    const res = await apiFetch('/admin/api/modules/' + moduleId + '/users');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Serverfout');
    moduleUsersCache = data.users || [];
    renderModuleUsersList();
  } catch (err) {
    document.getElementById('moduleUsersModalList').innerHTML =
      '<div class="alert alert-error text-sm"><span>Gebruikers laden mislukt. Probeer het opnieuw.</span></div>';
    console.error('Module-gebruikers laden mislukt:', err);
  }
}

function renderModuleUsersList() {
  const list = document.getElementById('moduleUsersModalList');
  if (moduleUsersCache.length === 0) {
    list.innerHTML = '<p class="text-sm text-base-content/40 py-2">Geen gebruikers gevonden.</p>';
    return;
  }
  list.innerHTML = moduleUsersCache.map(u => {
    const label = u.fullName ? (u.fullName + ' (' + u.email + ')') : u.email;
    const searchText = ((u.email || '') + ' ' + (u.fullName || '')).toLowerCase();
    return '<label class="label cursor-pointer justify-start gap-3 py-1.5 rounded hover:bg-base-200 px-2" data-search="' + escapeHtml(searchText) + '">' +
      '<input type="checkbox" value="' + escapeHtml(u.id) + '" class="checkbox checkbox-sm"' + (u.hasAccess ? ' checked' : '') + ' />' +
      '<span class="label-text text-sm' + (u.isActive ? '' : ' text-base-content/40') + '">' + escapeHtml(label) + (u.isActive ? '' : ' (inactief)') + '</span>' +
    '</label>';
  }).join('');
}

function applyModuleUsersSearch() {
  const q = (document.getElementById('moduleUsersSearch').value || '').trim().toLowerCase();
  document.querySelectorAll('#moduleUsersModalList label').forEach(label => {
    label.classList.toggle('hidden', q !== '' && !(label.dataset.search || '').includes(q));
  });
}

async function saveModuleUsers() {
  if (!moduleUsersModalId) return;
  const btn = document.getElementById('saveModuleUsersBtn');
  const userIds = Array.from(document.querySelectorAll('#moduleUsersModalList input[type="checkbox"]:checked')).map(cb => cb.value);

  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Opslaan\u2026';

  try {
    const res = await apiFetch('/admin/api/modules/' + moduleUsersModalId + '/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: userIds })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Serverfout');
    document.getElementById('moduleUsersModal').close();
    showToast('Toegang bijgewerkt (' + userIds.length + ' gebruiker' + (userIds.length === 1 ? '' : 's') + ')', 'success');
    await loadUsers();
  } catch (err) {
    console.error('Module-gebruikers bijwerken mislukt:', err);
    showToast('Opslaan mislukt: ' + err.message + '. Probeer het opnieuw', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Opslaan';
    moduleUsersModalId = null;
  }
}

// ====== Odoo e-mail-overrides (dynamische modal) ======

async function editUserOdooEmail(userEmail) {
  let odooCurrent = '', googleCurrent = '';
  try {
    const res = await apiFetch('/mail-signatures/api/admin/user-settings?email=' + encodeURIComponent(userEmail));
    const json = await res.json();
    odooCurrent = json.data?.settings?.odoo_email_override || '';
    googleCurrent = json.data?.settings?.google_email_override || '';
  } catch (_) {}

  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  modal.innerHTML =
    '<div class="modal-box">' +
      '<h3 class="font-bold text-lg mb-1">E-mail-overrides</h3>' +
      '<p class="text-sm text-base-content/60 mb-4">Standaard wordt <strong>' + escapeHtml(userEmail) + '</strong> gebruikt. Vul hieronder alternatieven in als het afwijkt.</p>' +
      '<div class="space-y-3">' +
        '<label class="form-control w-full">' +
          '<div class="label py-0.5"><span class="label-text text-xs font-semibold">Odoo work_email</span><span class="label-text-alt text-xs">voor ophalen functie &amp; telefoonnummer</span></div>' +
          '<input id="adminOdooEmailInput" type="email" class="input input-bordered input-sm w-full" placeholder="naam@bedrijf.com" value="' + escapeHtml(odooCurrent) + '">' +
        '</label>' +
        '<label class="form-control w-full">' +
          '<div class="label py-0.5"><span class="label-text text-xs font-semibold">Google Workspace e-mail</span><span class="label-text-alt text-xs">voor Gmail-handtekening pushen</span></div>' +
          '<input id="adminGoogleEmailInput" type="email" class="input input-bordered input-sm w-full" placeholder="naam@bedrijf.com" value="' + escapeHtml(googleCurrent) + '">' +
        '</label>' +
      '</div>' +
      '<p class="text-xs text-base-content/50 mt-2">Leeg laten = login-e-mailadres wordt gebruikt.</p>' +
      '<div class="modal-action">' +
        '<button class="btn btn-primary btn-sm" data-action="saveOdooEmails" data-email="' + escapeHtml(userEmail) + '">Opslaan</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="closeDynModal">Annuleren</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

async function saveUserEmailOverrides(userEmail, btn) {
  const modal = btn.closest('.modal');
  const odooVal = modal.querySelector('#adminOdooEmailInput').value.trim().toLowerCase();
  const googleVal = modal.querySelector('#adminGoogleEmailInput').value.trim().toLowerCase();
  btn.disabled = true;
  btn.textContent = 'Opslaan…';
  try {
    const res = await apiFetch('/mail-signatures/api/admin/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail,
        settings: {
          odoo_email_override: odooVal || null,
          google_email_override: googleVal || null
        }
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Opslaan mislukt');
    modal.remove();
    showToast('E-mail-overrides opgeslagen', 'success');
  } catch (err) {
    showToast('Opslaan mislukt: ' + err.message + '. Probeer het opnieuw', 'error');
    btn.disabled = false;
    btn.textContent = 'Opslaan';
  }
}

// ====== Wachtwoord opnieuw instellen (dynamische modal) ======

function editUserPassword(userId, email) {
  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  modal.innerHTML =
    '<div class="modal-box max-w-sm">' +
      '<h3 class="font-bold text-lg mb-1">Wachtwoord opnieuw instellen</h3>' +
      '<p class="text-sm text-base-content/60 mb-4">Voor <strong>' + escapeHtml(email) + '</strong>. Bestaande sessies van deze gebruiker worden meteen ongeldig gemaakt.</p>' +
      '<div class="flex flex-col gap-2 mb-3">' +
        '<label class="flex items-center gap-2 text-sm cursor-pointer">' +
          '<input type="radio" name="pwMode" value="generate" class="radio radio-sm" checked />' +
          'Automatisch genereren (aanbevolen)' +
        '</label>' +
        '<label class="flex items-center gap-2 text-sm cursor-pointer">' +
          '<input type="radio" name="pwMode" value="manual" class="radio radio-sm" />' +
          'Zelf een wachtwoord instellen' +
        '</label>' +
      '</div>' +
      '<label class="form-control w-full mb-1 hidden" id="manualPwWrap">' +
        '<div class="label"><span class="label-text text-xs font-semibold">Nieuw wachtwoord</span></div>' +
        '<input id="adminNewPasswordInput" type="text" class="input input-bordered input-sm w-full" placeholder="Minimaal 8 tekens" autocomplete="new-password">' +
      '</label>' +
      '<div class="modal-action">' +
        '<button class="btn btn-primary btn-sm" data-action="saveUserPassword" data-id="' + escapeHtml(userId) + '">Wachtwoord instellen</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="closeDynModal">Annuleren</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  modal.addEventListener('change', function(e) {
    if (e.target.name === 'pwMode') {
      modal.querySelector('#manualPwWrap').classList.toggle('hidden', e.target.value !== 'manual');
    }
  });
}

async function saveUserPassword(userId, btn) {
  const modal = btn.closest('.modal');
  const mode = modal.querySelector('input[name="pwMode"]:checked').value;
  const manualValue = modal.querySelector('#adminNewPasswordInput').value.trim();

  if (mode === 'manual' && !manualValue) {
    showToast('Vul een wachtwoord in, of kies automatisch genereren', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig\u2026';
  try {
    const res = await apiFetch('/admin/api/users/' + userId + '/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'manual' ? { newPassword: manualValue } : {})
    });
    const json = await res.json();
    if (!json.success) {
      const detailMsg = Array.isArray(json.details) && json.details.length > 0
        ? ': ' + json.details.join(', ')
        : '';
      throw new Error((json.error || 'Instellen mislukt') + detailMsg);
    }

    if (json.generated && json.newPassword) {
      showGeneratedPassword(modal, json.newPassword);
    } else {
      modal.remove();
      showToast('Wachtwoord bijgewerkt', 'success');
    }
  } catch (err) {
    showToast('Wachtwoord instellen mislukt: ' + err.message + '. Probeer het opnieuw', 'error');
    btn.disabled = false;
    btn.textContent = 'Wachtwoord instellen';
  }
}

function showGeneratedPassword(modal, password) {
  modal.querySelector('.modal-box').innerHTML =
    '<h3 class="font-bold text-lg mb-1">Nieuw wachtwoord</h3>' +
    '<p class="text-sm text-base-content/60 mb-3">Kopieer dit nu en geef het door \u2014 het wordt hierna niet meer getoond.</p>' +
    '<div class="join w-full mb-4">' +
      '<input id="generatedPasswordField" type="text" readonly class="input input-bordered input-sm join-item w-full font-mono" value="' + escapeHtml(password) + '">' +
      '<button class="btn btn-sm join-item" data-action="copyGeneratedPassword">Kopieer</button>' +
    '</div>' +
    '<div class="modal-action">' +
      '<button class="btn btn-primary btn-sm" data-action="closeDynModal">Sluiten</button>' +
    '</div>';
  lucide.createIcons();
}

// ====== Odoo UID (dynamische modal) ======

function editUserOdooUid(userId, currentUid) {
  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  modal.innerHTML =
    '<div class="modal-box max-w-sm">' +
      '<h3 class="font-bold text-lg mb-1">Odoo UID</h3>' +
      '<p class="text-sm text-base-content/60 mb-4">Direct Odoo <code>res.users.id</code> koppelen. Leeg laten om te wissen (bij de volgende login wordt opnieuw gezocht).</p>' +
      '<label class="form-control w-full">' +
        '<div class="label"><span class="label-text text-xs font-semibold">Odoo UID</span></div>' +
        '<input id="adminOdooUidInput" type="number" min="1" class="input input-bordered input-sm w-full" placeholder="bijv. 42" value="' + escapeHtml(currentUid ?? '') + '">' +
      '</label>' +
      '<div class="modal-action">' +
        '<button class="btn btn-primary btn-sm" data-action="saveOdooUid" data-id="' + escapeHtml(userId) + '">Opslaan</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="closeDynModal">Annuleren</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

async function saveUserOdooUid(userId, btn) {
  const modal = btn.closest('.modal');
  const raw = modal.querySelector('#adminOdooUidInput').value.trim();
  const uid = raw === '' ? null : parseInt(raw, 10);
  btn.disabled = true;
  btn.textContent = 'Opslaan…';
  try {
    const res = await apiFetch('/admin/api/users/' + userId + '/odoo-uid', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odoo_uid: uid })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Opslaan mislukt');
    modal.remove();
    showToast('Odoo UID opgeslagen', 'success');
    await loadUsers();
  } catch (err) {
    showToast('Opslaan mislukt: ' + err.message + '. Probeer het opnieuw', 'error');
    btn.disabled = false;
    btn.textContent = 'Opslaan';
  }
}

// ====== Gebruikersnaam (dynamische modal) ======

function editUserUsername(userId, currentUsername) {
  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  modal.innerHTML =
    '<div class="modal-box max-w-sm">' +
      '<h3 class="font-bold text-lg mb-1">Gebruikersnaam</h3>' +
      '<p class="text-sm text-base-content/60 mb-4">Stel de gebruikersnaam in voor deze gebruiker. Leeg laten om te wissen.</p>' +
      '<label class="form-control w-full">' +
        '<div class="label"><span class="label-text text-xs font-semibold">Gebruikersnaam</span></div>' +
        '<input id="adminUsernameInput" type="text" class="input input-bordered input-sm w-full" placeholder="bijv. jdoe" value="' + escapeHtml(currentUsername ?? '') + '">' +
      '</label>' +
      '<div class="modal-action">' +
        '<button class="btn btn-primary btn-sm" data-action="saveUsername" data-id="' + escapeHtml(userId) + '">Opslaan</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="closeDynModal">Annuleren</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

async function saveUserUsername(userId, btn) {
  const modal = btn.closest('.modal');
  const raw = modal.querySelector('#adminUsernameInput').value.trim();
  const username = raw === '' ? null : raw;
  btn.disabled = true;
  btn.textContent = 'Opslaan…';
  try {
    const res = await apiFetch('/admin/api/users/' + userId + '/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Opslaan mislukt');
    modal.remove();
    showToast('Gebruikersnaam opgeslagen', 'success');
    await loadUsers();
  } catch (err) {
    showToast('Opslaan mislukt: ' + err.message + '. Probeer het opnieuw', 'error');
    btn.disabled = false;
    btn.textContent = 'Opslaan';
  }
}

// ====== Gebruiker aanmaken ======

document.getElementById('createUserForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const email = (formData.get('email') || '').trim();
  const password = formData.get('password') || '';
  const role = formData.get('role');
  const modules = Array.from(document.querySelectorAll('#moduleCheckboxes input:checked')).map(cb => cb.value);

  if (password.length < 8) {
    showToast('Het wachtwoord moet minstens 8 tekens lang zijn', 'error');
    return;
  }

  const btn = document.getElementById('createUserBtn');
  const label = btn.querySelector('[data-role="createBtnLabel"]');
  btn.disabled = true;
  label.textContent = 'Aanmaken…';

  try {
    const response = await apiFetch('/admin/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, role: role, modules: modules })
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Gebruiker aangemaakt', 'success');
      form.reset();
      document.querySelectorAll('#moduleCheckboxes input:checked').forEach(cb => { cb.checked = false; });
      // Terug naar Gebruikers-tab, lijst herladen en nieuwe rij markeren
      document.getElementById('tabUsers').checked = true;
      await loadUsers();
      highlightUserRow(email);
    } else {
      showToast('Gebruiker aanmaken mislukt: ' + (data.error || 'onbekende fout') + '. Probeer het opnieuw', 'error');
    }
  } catch (error) {
    console.error('Gebruiker aanmaken mislukt:', error);
    showToast('Gebruiker aanmaken mislukt. Probeer het opnieuw', 'error');
  } finally {
    btn.disabled = false;
    label.textContent = 'Gebruiker aanmaken';
  }
});

// ====== Zoekveld ======

document.getElementById('userSearch').addEventListener('input', applyUserSearch);
document.getElementById('moduleUsersSearch').addEventListener('input', applyModuleUsersSearch);

// ====== Centrale event-listeners ======

document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'logout') {
    logout();
  } else if (action === 'editModules') {
    openModulesModal(el.dataset.id);
  } else if (action === 'saveUserModules') {
    saveUserModules();
  } else if (action === 'closeModulesModal') {
    modulesModalUserId = null;
    document.getElementById('modulesModal').close();
  } else if (action === 'editModuleUsers') {
    openModuleUsersModal(el.dataset.id, el.dataset.name);
  } else if (action === 'saveModuleUsers') {
    saveModuleUsers();
  } else if (action === 'closeModuleUsersModal') {
    moduleUsersModalId = null;
    document.getElementById('moduleUsersModal').close();
  } else if (action === 'toggleStatus') {
    requestStatusToggle(el.dataset.id);
  } else if (action === 'confirmOk') {
    const cb = confirmCallback;
    confirmCallback = null;
    pendingRoleRevert = null;
    document.getElementById('confirmModal').close();
    if (cb) cb();
  } else if (action === 'closeConfirm') {
    document.getElementById('confirmModal').close();
  } else if (action === 'editOdooEmail') {
    editUserOdooEmail(el.dataset.email);
  } else if (action === 'editOdooUid') {
    editUserOdooUid(el.dataset.id, el.dataset.uid || null);
  } else if (action === 'saveOdooEmails') {
    saveUserEmailOverrides(el.dataset.email, el);
  } else if (action === 'saveOdooUid') {
    saveUserOdooUid(el.dataset.id, el);
  } else if (action === 'editUsername') {
    editUserUsername(el.dataset.id, el.dataset.username || null);
  } else if (action === 'saveUsername') {
    saveUserUsername(el.dataset.id, el);
  } else if (action === 'editPassword') {
    editUserPassword(el.dataset.id, el.dataset.email);
  } else if (action === 'saveUserPassword') {
    saveUserPassword(el.dataset.id, el);
  } else if (action === 'copyGeneratedPassword') {
    const field = document.getElementById('generatedPasswordField');
    if (field) {
      navigator.clipboard.writeText(field.value).then(function() {
        showToast('Gekopieerd naar klembord', 'success');
      });
    }
  } else if (action === 'closeDynModal') {
    const m = el.closest('.modal');
    if (m) m.remove();
  } else if (action === 'dismissToast') {
    const t = el.closest('.alert');
    if (t) t.remove();
  } else if (action === 'toggleModule') {
    requestModuleToggle(el.dataset.id, el.dataset.active === '1');
  } else if (action === 'deleteModule') {
    requestModuleDelete(el.dataset.id, el.dataset.name);
  }
});

document.addEventListener('change', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'changeRole') {
    requestRoleChange(el, el.dataset.id);
  }
});

// ====== Module toggle / delete ======

function requestModuleToggle(moduleId, isCurrentlyActive) {
  openConfirm({
    title: isCurrentlyActive ? 'Module deactiveren' : 'Module activeren',
    body: isCurrentlyActive
      ? 'Gebruikers kunnen deze module niet meer openen totdat je hem weer activeert.'
      : 'Gebruikers met toegang kunnen deze module weer openen.',
    okLabel: isCurrentlyActive ? 'Deactiveren' : 'Activeren',
    danger: isCurrentlyActive,
    onConfirm: async function() {
      try {
        const res = await apiFetch('/admin/api/modules/' + moduleId + '/toggle', { method: 'PUT' });
        if (!res.ok) throw new Error('Serverfout');
        showToast('Module ' + (isCurrentlyActive ? 'gedeactiveerd' : 'geactiveerd'), 'success');
        await loadModules();
      } catch (err) {
        showToast('Module bijwerken mislukt. Probeer het opnieuw', 'error');
      }
    }
  });
}

function requestModuleDelete(moduleId, moduleName) {
  openConfirm({
    title: 'Module verwijderen',
    body: 'Verwijder "' + moduleName + '" uit de database? Deze module staat niet meer in de code. Moduletoegang van gebruikers wordt ook verwijderd.',
    okLabel: 'Verwijderen',
    danger: true,
    onConfirm: async function() {
      try {
        const res = await apiFetch('/admin/api/modules/' + moduleId, { method: 'DELETE' });
        if (!res.ok) throw new Error('Serverfout');
        showToast('"' + moduleName + '" verwijderd', 'success');
        await loadModules();
      } catch (err) {
        showToast('Verwijderen mislukt. Probeer het opnieuw', 'error');
      }
    }
  });
}

// ====== Init ======

initTheme();
renderNavbar();
loadModules();
loadUsers();
lucide.createIcons();
