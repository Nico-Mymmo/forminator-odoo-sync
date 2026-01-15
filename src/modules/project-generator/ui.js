/**
 * Project Generator Module - UI
 */

import { navbar } from '../../lib/components/navbar.js';

export function projectGeneratorUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Generator</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200" style="overflow-y: scroll;">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="pb-8">
        <div class="container mx-auto px-6 max-w-7xl">
          <!-- Header -->
          <div class="mb-8">
            <h1 class="text-4xl font-bold mb-2">Project Generator</h1>
            <p class="text-base-content/60">Generate project structures and boilerplate code</p>
          </div>

          <!-- Stats Cards -->
          <div class="stats shadow w-full mb-8">
            <div class="stat">
              <div class="stat-figure text-primary">
                <i data-lucide="layout-template" class="w-8 h-8"></i>
              </div>
              <div class="stat-title">Available Templates</div>
              <div class="stat-value text-primary">3</div>
              <div class="stat-desc">Ready to use</div>
            </div>
            
            <div class="stat">
              <div class="stat-figure text-secondary">
                <i data-lucide="folder" class="w-8 h-8"></i>
              </div>
              <div class="stat-title">Projects Generated</div>
              <div class="stat-value text-secondary">0</div>
              <div class="stat-desc">Coming soon</div>
            </div>
          </div>

          <!-- Templates Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Cloudflare Worker Template -->
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
              <div class="card-body">
                <div class="flex items-start justify-between mb-4">
                  <div class="p-3 bg-primary/10 rounded-lg">
                    <i data-lucide="cloud" class="w-8 h-8 text-primary"></i>
                  </div>
                  <div class="badge badge-primary">Popular</div>
                </div>
                <h2 class="card-title">Cloudflare Worker</h2>
                <p class="text-sm text-base-content/60 flex-grow">
                  Modern edge computing template with TypeScript, testing setup, and deployment configuration.
                </p>
                <div class="card-actions justify-end mt-4">
                  <button class="btn btn-primary btn-sm" disabled>
                    <i data-lucide="download" class="w-4 h-4 mr-1"></i>
                    Coming Soon
                  </button>
                </div>
              </div>
            </div>

            <!-- Next.js Template -->
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
              <div class="card-body">
                <div class="flex items-start justify-between mb-4">
                  <div class="p-3 bg-secondary/10 rounded-lg">
                    <i data-lucide="layout-dashboard" class="w-8 h-8 text-secondary"></i>
                  </div>
                  <div class="badge badge-secondary">New</div>
                </div>
                <h2 class="card-title">Next.js App</h2>
                <p class="text-sm text-base-content/60 flex-grow">
                  Next.js 14 with App Router, Tailwind CSS, DaisyUI, and authentication setup.
                </p>
                <div class="card-actions justify-end mt-4">
                  <button class="btn btn-secondary btn-sm" disabled>
                    <i data-lucide="download" class="w-4 h-4 mr-1"></i>
                    Coming Soon
                  </button>
                </div>
              </div>
            </div>

            <!-- Node.js API Template -->
            <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
              <div class="card-body">
                <div class="flex items-start justify-between mb-4">
                  <div class="p-3 bg-accent/10 rounded-lg">
                    <i data-lucide="server" class="w-8 h-8 text-accent"></i>
                  </div>
                </div>
                <h2 class="card-title">Node.js API</h2>
                <p class="text-sm text-base-content/60 flex-grow">
                  Express.js REST API with PostgreSQL, authentication, and OpenAPI documentation.
                </p>
                <div class="card-actions justify-end mt-4">
                  <button class="btn btn-accent btn-sm" disabled>
                    <i data-lucide="download" class="w-4 h-4 mr-1"></i>
                    Coming Soon
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Info Alert -->
          <div class="alert alert-info mt-8">
            <i data-lucide="info" class="w-5 h-5"></i>
            <div>
              <h3 class="font-bold">Under Development</h3>
              <div class="text-sm">
                The Project Generator module is currently being built. Check back soon for updates!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script>
      // Initialize Lucide icons
      lucide.createIcons();
      
      // Theme switcher
      function changeTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
      }
      
      // Load saved theme
      const savedTheme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', savedTheme);
      const themeSelector = document.getElementById('themeSelector');
      if (themeSelector) {
        themeSelector.value = savedTheme;
      }
      
      // Logout
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
      
      // Sync prod (placeholder for projects)
      function syncProdData() {
        alert('Sync functionality not available for Project Generator');
      }
    </script>
</body>
</html>`;
}
