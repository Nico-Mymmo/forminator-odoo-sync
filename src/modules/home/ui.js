/**
 * Home Dashboard UI
 */

import { navbar } from '../../lib/components/navbar.js';

export function loginPageUI() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - OpenVME Operations Manager</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    <div class="flex items-center justify-center min-h-screen">
      <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl justify-center mb-4">🔐 Login</h2>
          <p class="text-center text-sm text-base-content/60 mb-4">OpenVME Operations Manager</p>
          <div class="form-control mb-2">
            <label class="label">
              <span class="label-text">Email</span>
            </label>
            <input type="email" id="emailInput" placeholder="admin@mymmo.com" class="input input-bordered" autocomplete="username">
          </div>
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Password</span>
            </label>
            <input type="password" id="passwordInput" placeholder="••••••••" class="input input-bordered" autocomplete="current-password" onkeypress="if(event.key==='Enter') login()">
          </div>
          <div id="loginError" class="alert alert-error mb-2" style="display: none;">
            <span id="loginErrorMessage"></span>
          </div>
          <button onclick="login()" class="btn btn-primary w-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" x2="3" y1="12" y2="12"/>
            </svg>
            Login
          </button>
        </div>
      </div>
    </div>
    
    <script>
      async function login() {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        const errorDiv = document.getElementById('loginError');
        const errorMsg = document.getElementById('loginErrorMessage');
        
        if (!email || !password) {
          errorMsg.textContent = 'Please enter email and password';
          errorDiv.style.display = 'flex';
          return;
        }
        
        try {
          errorDiv.style.display = 'none';
          
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          
          const result = await response.json();
          
          if (result.success && result.token) {
            localStorage.setItem('adminToken', result.token);
            window.location.href = '/';
          } else {
            errorMsg.textContent = result.error || 'Login failed';
            errorDiv.style.display = 'flex';
          }
        } catch (err) {
          errorMsg.textContent = 'Connection error: ' + err.message;
          errorDiv.style.display = 'flex';
        }
      }
      
      lucide.createIcons();
    </script>
</body>
</html>`;
}

export function homeDashboardUI(user) {
  // Get user's modules - extract module objects from user_modules array
  const userModules = user.modules || [];
  const modules = userModules.map(um => um.module || um);
  
  // Add admin module if user is admin
  const allModules = [...modules];
  if (user.role === 'admin') {
    allModules.push({
      code: 'admin',
      name: 'Administration',
      description: 'Manage users, invites, and module access',
      route: '/admin',
      icon: 'settings'
    });
  }
  
  // Icon mapping
  const iconMap = {
    'forminator': 'file-text',
    'project-generator': 'briefcase',
    'admin': 'settings',
    'settings': 'settings',
    'home': 'home'
  };
  
  const moduleCards = allModules.map(module => {
    const icon = iconMap[module.icon] || iconMap[module.code] || 'box';
    return `
      <a href="${module.route}" class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all cursor-pointer group">
        <div class="card-body items-center text-center">
          <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <i data-lucide="${icon}" class="w-8 h-8 text-primary"></i>
          </div>
          <h2 class="card-title">${module.name}</h2>
          <p class="text-sm text-base-content/60">${module.description || ''}</p>
        </div>
      </a>
    `;
  }).join('');
  
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - OpenVME Operations Manager</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-7xl">
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-4xl font-bold mb-2">Welcome, ${user.username || user.full_name || user.email}</h1>
          <p class="text-base-content/60">Select a module to get started</p>
        </div>

        <!-- Module Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${moduleCards}
        </div>
        
        ${allModules.length === 0 ? `
          <div class="alert alert-info">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>No modules assigned yet. Contact your administrator.</span>
          </div>
        ` : ''}
      </div>
    </div>
    
    <script>
      // Initialize theme
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
      
      initTheme();
      lucide.createIcons();
    </script>
</body>
</html>`;
}
