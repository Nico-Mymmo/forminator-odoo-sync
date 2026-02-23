/**
 * Profile UI
 */

import { navbar } from '../../lib/components/navbar.js';

export function profileUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile - OpenVME Operations Manager</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-4xl">
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-4xl font-bold mb-2">Profile Settings</h1>
          <p class="text-base-content/60">Manage your account settings</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- User Info Card -->
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <h2 class="card-title">
                <i data-lucide="user" class="w-5 h-5"></i>
                Account Information
              </h2>
              <form id="profileForm" class="space-y-3">
                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Username</span>
                  </label>
                  <input type="text" id="username" value="${user.username || ''}" class="input input-bordered" placeholder="Enter a username" maxlength="50">
                  <label class="label">
                    <span class="label-text-alt">This will be shown in the app instead of your email</span>
                  </label>
                </div>
                <div>
                  <label class="text-sm text-base-content/60">Email</label>
                  <p class="font-medium">${user.email}</p>
                </div>
                <div>
                  <label class="text-sm text-base-content/60">Full Name</label>
                  <p class="font-medium">${user.full_name || 'Not set'}</p>
                </div>
                <div>
                  <label class="text-sm text-base-content/60">Role</label>
                  <div class="badge badge-${user.role === 'admin' ? 'primary' : 'secondary'}">${user.role}</div>
                </div>
                <div id="profileError" class="alert alert-error" style="display: none;">
                  <span id="profileErrorMessage"></span>
                </div>
                <div id="profileSuccess" class="alert alert-success" style="display: none;">
                  <span>Profile updated successfully!</span>
                </div>
                <button type="submit" class="btn btn-primary w-full">
                  Update Profile
                </button>
              </form>
            </div>
          </div>

          <!-- Change Password Card -->
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <h2 class="card-title">
                <i data-lucide="key" class="w-5 h-5"></i>
                Change Password
              </h2>
              <form id="passwordForm" class="space-y-3">
                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Current Password</span>
                  </label>
                  <input type="password" id="currentPassword" class="input input-bordered" required>
                </div>
                <div class="form-control">
                  <label class="label">
                    <span class="label-text">New Password</span>
                  </label>
                  <input type="password" id="newPassword" class="input input-bordered" required minlength="8">
                </div>
                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Confirm New Password</span>
                  </label>
                  <input type="password" id="confirmPassword" class="input input-bordered" required>
                </div>
                <div id="passwordError" class="alert alert-error" style="display: none;">
                  <span id="passwordErrorMessage"></span>
                </div>
                <div id="passwordSuccess" class="alert alert-success" style="display: none;">
                  <span>Password updated successfully!</span>
                </div>
                <button type="submit" class="btn btn-primary w-full">
                  Update Password
                </button>
              </form>
            </div>
          </div>
        </div>

      <!-- Odoo e-mail koppeling -->
      <div class="card bg-base-100 shadow-xl mt-6">
        <div class="card-body">
          <h2 class="card-title">
            <i data-lucide="at-sign" class="w-5 h-5"></i>
            Odoo e-mailkoppeling
          </h2>
          <p class="text-sm text-base-content/60 mb-2">
            Standaard wordt <strong>${user.email}</strong> gebruikt om jouw gegevens (functie, telefoon) op te halen uit Odoo.
            Als jouw Odoo-account een ander e-mailadres gebruikt, geef dat hier in.
          </p>
          <div class="form-control">
            <label class="label py-0.5">
              <span class="label-text text-sm">Odoo work_email (leeg = gebruik login-email)</span>
            </label>
            <input type="email" id="odooEmailOverride" class="input input-bordered" placeholder="naam@bedrijf.com">
          </div>
          <div id="odooEmailStatus" class="text-xs mt-1 hidden"></div>
          <div class="card-actions justify-end mt-2">
            <button onclick="saveOdooEmailOverride()" class="btn btn-primary btn-sm">Opslaan</button>
          </div>
        </div>
      </div>
    </div>
  </div>

      function changeTheme(theme) {
        document.elementElement.setAttribute('data-theme', theme);
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
      
      async function logout() {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });
        } catch (err) {
          console.error('Logout error:', err);
        }
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      }
      
      // Profile form handling
      document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const errorDiv = document.getElementById('profileError');
        const errorMsg = document.getElementById('profileErrorMessage');
        const successDiv = document.getElementById('profileSuccess');
        
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        
        try {
          const response = await fetch('/profile/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: username || null })
          });
          
          const result = await response.json();
          
          if (result.success) {
            successDiv.style.display = 'flex';
            // Reload page to update navbar
            setTimeout(() => window.location.reload(), 1000);
          } else {
            errorMsg.textContent = result.error || 'Failed to update profile';
            errorDiv.style.display = 'flex';
          }
        } catch (err) {
          errorMsg.textContent = 'Connection error: ' + err.message;
          errorDiv.style.display = 'flex';
        }
      });
      
      // Password form handling
      document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorDiv = document.getElementById('passwordError');
        const errorMsg = document.getElementById('passwordErrorMessage');
        const successDiv = document.getElementById('passwordSuccess');
        
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        
        if (newPassword !== confirmPassword) {
          errorMsg.textContent = 'Passwords do not match';
          errorDiv.style.display = 'flex';
          return;
        }
        
        if (newPassword.length < 8) {
          errorMsg.textContent = 'Password must be at least 8 characters';
          errorDiv.style.display = 'flex';
          return;
        }
        
        try {
          const response = await fetch('/profile/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
          });
          
          const result = await response.json();
          
          if (result.success) {
            successDiv.style.display = 'flex';
            document.getElementById('passwordForm').reset();
          } else {
            errorMsg.textContent = result.error || 'Failed to update password';
            errorDiv.style.display = 'flex';
          }
        } catch (err) {
          errorMsg.textContent = 'Connection error: ' + err.message;
          errorDiv.style.display = 'flex';
        }
      });
      
      // Odoo e-mail override
      async function loadOdooEmailOverride() {
        try {
          const res  = await fetch('/mail-signatures/api/my-settings', { credentials: 'include' });
          const json = await res.json();
          const override = json.data?.settings?.odoo_email_override || '';
          document.getElementById('odooEmailOverride').value = override;
        } catch (_) {}
      }

      async function saveOdooEmailOverride() {
        const val      = document.getElementById('odooEmailOverride').value.trim().toLowerCase();
        const override = val || null;
        const status   = document.getElementById('odooEmailStatus');
        status.className = 'text-xs mt-1';
        status.textContent = 'Opslaan…';
        try {
          const res = await fetch('/mail-signatures/api/my-settings', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: { odoo_email_override: override } })
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'Opslaan mislukt');
          status.className = 'text-xs mt-1 text-success';
          status.textContent = override ? 'Odoo-email opgeslagen: ' + override : 'Override gewist — login-email wordt gebruikt.';
        } catch (err) {
          status.className = 'text-xs mt-1 text-error';
          status.textContent = 'Fout: ' + err.message;
        }
      }

      initTheme();
      lucide.createIcons();
      loadOdooEmailOverride();
    </script>
</body>
</html>`;
}
