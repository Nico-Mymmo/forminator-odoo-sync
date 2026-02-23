// Admin Dashboard JavaScript
// Industry-standard separation of concerns: HTML, CSS, JS

lucide.createIcons();

let allModules = [];
let allUsers = [];
let allInvites = [];

// Theme management
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

// Render navbar using standard component
async function renderNavbar() {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  const data = await response.json();
  
  if (!data.user) {
    window.location.href = '/';
    return;
  }
  
  // Extract modules from user_modules array
  const userModules = data.user.modules || [];
  const modules = userModules.map(um => um.module || um);
  
  const navbar = document.getElementById('navbar');
  navbar.innerHTML = `
<header class="flex items-center justify-between bg-base-100 shadow-sm px-4" style="position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;">
    <div class="flex items-center gap-4">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span class="text-base font-semibold">OpenVME Operations Manager</span>
      </a>
      ${modules.length > 0 ? `
        <div class="dropdown dropdown-hover">
          <div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="14" rx="1"/>
              <rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
            Modules
          </div>
          <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
            ${modules.map(m => '<li><a href="' + m.route + '">' + m.name + '</a></li>').join('')}
          </ul>
        </div>
      ` : ''}
    </div>
    <div id="saveIndicator" class="flex items-center gap-1 text-sm"></div>
    <div class="flex gap-2 items-center">
        <select id="themeSelector" class="select select-xs select-bordered" onchange="changeTheme(this.value)">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="cupcake">Cupcake</option>
            <option value="bumblebee">Bumblebee</option>
            <option value="emerald">Emerald</option>
            <option value="corporate">Corporate</option>
            <option value="synthwave">Synthwave</option>
            <option value="retro">Retro</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="valentine">Valentine</option>
            <option value="halloween">Halloween</option>
            <option value="garden">Garden</option>
            <option value="forest">Forest</option>
            <option value="aqua">Aqua</option>
            <option value="lofi">Lofi</option>
            <option value="pastel">Pastel</option>
            <option value="fantasy">Fantasy</option>
            <option value="wireframe">Wireframe</option>
            <option value="black">Black</option>
            <option value="luxury">Luxury</option>
            <option value="dracula">Dracula</option>
            <option value="cmyk">CMYK</option>
            <option value="autumn">Autumn</option>
            <option value="business">Business</option>
            <option value="acid">Acid</option>
            <option value="lemonade">Lemonade</option>
            <option value="night">Night</option>
            <option value="coffee">Coffee</option>
            <option value="winter">Winter</option>
        </select>
        <a href="/profile" class="btn btn-ghost btn-xs" title="Profile">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        </a>
        <button onclick="logout()" class="btn btn-error btn-xs">Logout</button>
    </div>
</header>
  `;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
}

// Load modules
async function loadModules() {
  try {
    const response = await fetch('/admin/api/modules', { credentials: 'include' });
    const data = await response.json();
    allModules = data.modules || [];
    renderModuleCheckboxes();
    renderModulesTable();
    document.getElementById('statsModules').textContent = allModules.length;
  } catch (error) {
    console.error('Failed to load modules:', error);
  }
}

function renderModuleCheckboxes() {
  const container = document.getElementById('moduleCheckboxes');
  if (allModules.length === 0) {
    container.innerHTML = '<p class="text-sm text-base-content/60">No modules available</p>';
    return;
  }
  
  const html = allModules.map(m => 
    '<label class="label cursor-pointer gap-2">' +
      '<input type="checkbox" name="modules" value="' + m.code + '" class="checkbox checkbox-sm" />' +
      '<span class="label-text">' + m.name + '</span>' +
    '</label>'
  ).join('');
  
  container.innerHTML = html;
}

function renderModulesTable() {
  const container = document.getElementById('modulesTable');
  
  if (allModules.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No modules available</div>';
    return;
  }
  
  const rows = allModules.map(m => 
    '<div class="flex items-center justify-between p-4 bg-base-200 rounded-lg mb-2">' +
      '<div class="flex items-center gap-4">' +
        '<i data-lucide="' + (m.icon || 'package') + '" class="w-6 h-6 text-primary"></i>' +
        '<div>' +
          '<div class="font-semibold">' + m.name + '</div>' +
          '<div class="text-sm text-base-content/60">' + (m.description || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="badge ' + (m.isActive ? 'badge-success' : 'badge-ghost') + '">' +
        (m.isActive ? 'Active' : 'Inactive') +
      '</div>' +
    '</div>'
  ).join('');
  
  container.innerHTML = rows;
  lucide.createIcons();
}

// Load users
async function loadUsers() {
  try {
    const response = await fetch('/admin/api/users', { credentials: 'include' });
    const data = await response.json();
    allUsers = data.users || [];
    renderUsersTable();
    document.getElementById('statsUsers').textContent = allUsers.filter(u => u.isActive).length;
  } catch (error) {
    console.error('Failed to load users:', error);
    document.getElementById('usersTable').innerHTML = '<div class="alert alert-error">Failed to load users</div>';
  }
}

function renderUsersTable() {
  const container = document.getElementById('usersTable');
  
  if (allUsers.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No users found. Create an invite to add users.</div>';
    return;
  }
  
  const rows = allUsers.map(user => 
    '<tr>' +
      '<td>' + user.email + '</td>' +
      '<td>' +
        '<select class="select select-sm select-bordered" onchange="updateUserRole(\'' + user.id + '\', this.value)">' +
          '<option value="user" ' + (user.role === 'user' ? 'selected' : '') + '>User</option>' +
          '<option value="manager" ' + (user.role === 'manager' ? 'selected' : '') + '>Manager</option>' +
          '<option value="marketing_signature" ' + (user.role === 'marketing_signature' ? 'selected' : '') + '>Marketing Signatures</option>' +
          '<option value="admin" ' + (user.role === 'admin' ? 'selected' : '') + '>Admin</option>' +
        '</select>' +
      '</td>' +
      '<td>' +
        '<div class="flex flex-wrap gap-1">' +
          (user.modules && user.modules.length > 0 
            ? user.modules.map(m => '<span class="badge badge-sm">' + (m.name || m.code || m) + '</span>').join('')
            : '<span class="text-sm text-base-content/60">None</span>'
          ) +
        '</div>' +
      '</td>' +
      '<td>' +
        '<div class="badge ' + (user.isActive ? 'badge-success' : 'badge-error') + ' gap-2">' +
          (user.isActive ? 'Active' : 'Inactive') +
        '</div>' +
      '</td>' +
      '<td>' + new Date(user.createdAt).toLocaleDateString() + '</td>' +
      '<td>' +
        '<div class="join">' +
          '<button class="btn btn-xs btn-ghost join-item" onclick="editUserModules(\'' + user.id + '\')" title="Edit Modules">' +
            '<i data-lucide="package" class="w-3 h-3"></i>' +
          '</button>' +
          '<button class="btn btn-xs btn-ghost join-item" onclick="editUserOdooEmail(\'' + user.email + '\')" title="Odoo e-mail override">' +
            '<i data-lucide="at-sign" class="w-3 h-3"></i>' +
          '</button>' +
          '<button class="btn btn-xs btn-ghost join-item" onclick="toggleUserStatus(\'' + user.id + '\')" title="Toggle Status">' +
            '<i data-lucide="' + (user.isActive ? 'user-x' : 'user-check') + '" class="w-3 h-3"></i>' +
          '</button>' +
        '</div>' +
      '</td>' +
    '</tr>'
  ).join('');
  
  container.innerHTML = 
    '<table class="table table-zebra">' +
      '<thead>' +
        '<tr>' +
          '<th>Email</th>' +
          '<th>Role</th>' +
          '<th>Modules</th>' +
          '<th>Status</th>' +
          '<th>Created</th>' +
          '<th>Actions</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  
  lucide.createIcons();
}

async function updateUserRole(userId, role) {
  try {
    await fetch('/admin/api/users/' + userId + '/role', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role })
    });
    await loadUsers();
  } catch (error) {
    console.error('Failed to update role:', error);
    alert('Failed to update user role');
  }
}

async function toggleUserStatus(userId) {
  try {
    await fetch('/admin/api/users/' + userId + '/toggle', {
      method: 'PUT',
      credentials: 'include'
    });
    await loadUsers();
  } catch (error) {
    console.error('Failed to toggle status:', error);
    alert('Failed to update user status');
  }
}

function editUserModules(userId) {
  const user = allUsers.find(u => u.id === userId);
  const currentModules = user ? (user.modules || []) : [];
  // currentModules may be an array of strings or objects {code, name}
  const currentCodes = currentModules.map(m => typeof m === 'string' ? m : m.code);
  
  const checkboxes = allModules.map(m =>
    '<label class="label cursor-pointer justify-start gap-2">' +
      '<input type="checkbox" value="' + m.code + '" ' +
        (currentCodes.includes(m.code) ? 'checked' : '') +
        ' class="checkbox checkbox-sm">' +
      '<span class="label-text">' + m.name + '</span>' +
    '</label>'
  ).join('');
  
  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  modal.innerHTML =
    '<div class="modal-box">' +
      '<h3 class="font-bold text-lg mb-4">Edit User Modules</h3>' +
      '<div class="space-y-2">' + checkboxes + '</div>' +
      '<div class="modal-action">' +
        '<button class="btn" onclick="this.closest(\'.modal\').remove()">Cancel</button>' +
        '<button class="btn btn-primary" onclick="saveUserModules(\'' + userId + '\', this)">Save</button>' +
      '</div>' +
    '</div>';
  
  document.body.appendChild(modal);
}

async function saveUserModules(userId, btn) {
  const modal = btn.closest('.modal');
  const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
  const modules = Array.from(checkboxes).map(cb => cb.value);
  
  try {
    await fetch('/admin/api/users/' + userId + '/modules', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: modules })
    });
    await loadUsers();
    modal.remove();
  } catch (error) {
    console.error('Failed to update modules:', error);
    alert('Failed to update user modules');
  }
}

async function editUserOdooEmail(userEmail) {
  // Fetch current override from signature settings
  let current = '';
  try {
    const res  = await fetch('/mail-signatures/api/admin/user-settings?email=' + encodeURIComponent(userEmail), { credentials: 'include' });
    const json = await res.json();
    current = json.data?.settings?.odoo_email_override || '';
  } catch (_) {}

  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  modal.innerHTML =
    '<div class="modal-box">' +
      '<h3 class="font-bold text-lg mb-1">Odoo e-mail override</h3>' +
      '<p class="text-sm text-base-content/60 mb-4">Standaard wordt <strong>' + userEmail + '</strong> gebruikt voor de Odoo-koppeling. Vul hieronder een alternatief Odoo work_email in als het afwijkt.</p>' +
      '<div class="form-control">' +
        '<label class="label py-0.5"><span class="label-text text-xs">Odoo work_email (leeg = gebruik login-email)</span></label>' +
        '<input id="odooEmailInput" type="email" class="input input-bordered" placeholder="naam@bedrijf.com" value="' + current + '">' +
      '</div>' +
      '<div class="modal-action">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.modal\').remove()">Annuleren</button>' +
        '<button class="btn btn-sm btn-primary" onclick="saveUserOdooEmail(\'' + userEmail + '\', this)">Opslaan</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  lucide.createIcons();
}

async function saveUserOdooEmail(userEmail, btn) {
  const modal    = btn.closest('.modal');
  const val      = modal.querySelector('#odooEmailInput').value.trim().toLowerCase();
  const override = val || null;
  btn.disabled   = true;
  btn.textContent = 'Opslaan…';
  try {
    const res = await fetch('/mail-signatures/api/admin/user-settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail, settings: { odoo_email_override: override } })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Opslaan mislukt');
    modal.remove();
  } catch (err) {
    alert('Fout: ' + err.message);
    btn.disabled    = false;
    btn.textContent = 'Opslaan';
  }
}

// Handle create user form
document.getElementById('createUserForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const email = formData.get('email');
  const password = formData.get('password');
  const role = formData.get('role');
  const modules = Array.from(document.querySelectorAll('#moduleCheckboxes input:checked')).map(cb => cb.value);
  
  try {
    const response = await fetch('/admin/api/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: email, 
        password: password,
        role: role, 
        modules: modules 
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('User created successfully!');
      e.target.reset();
      document.querySelectorAll('#moduleCheckboxes input:checked').forEach(cb => cb.checked = false);
      await loadUsers();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Failed to create user:', error);
    alert('Failed to create user');
  }
});

// Initialize on page load
initTheme();
renderNavbar();
loadModules();
loadUsers();
