/**
 * Sales Insight Explorer - Query Builder UI
 * 
 * Schema-driven query builder interface.
 * Follows existing module conventions (daisyUI + Tailwind only).
 * 
 * RULES:
 * - No hardcoded models or fields
 * - No interpretation or analysis
 * - UI only assembles QueryDefinition JSON
 * - Backend validation is mandatory
 */

import { navbar } from '../../lib/components/navbar.js';

export function queryBuilderUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sales Insight Explorer</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-5xl">
        
        <!-- Header -->
        <div class="mb-8 text-center">
          <h1 class="text-4xl font-bold mb-2">Sales Insight Explorer</h1>
          <p class="text-base-content/60">Beantwoord je sales vragen met begeleide data-analyse</p>
        </div>

        <!-- Loading State -->
        <div id="loadingState" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Bezig met laden...</span>
        </div>

        <!-- Main Content (hidden until schema loads) -->
        <div id="mainContent" style="display: none;">
          
          <!-- Guided Wizard Container -->
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div id="wizard-container">
                <!-- Wizard rendered here -->
              </div>
            </div>
          </div>

          <!-- Payload Display -->
          <div id="payload-display">
            <!-- Payload will be shown here before execution -->
          </div>

          <!-- Results Container -->
          <div id="results-container">
            <!-- Results rendered here -->
          </div>

        </div>

      </div>
    </div>

    <script src="/semantic-wizard.js"></script>
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
      
      async function syncProdData() {
        if (!confirm('This will sync production data to dev. Continue?')) return;
        try {
          const response = await fetch('/api/admin/sync-prod', {
            method: 'POST',
            credentials: 'include'
          });
          const result = await response.json();
          if (result.success) {
            alert('Sync complete!');
          } else {
            alert('Sync failed: ' + (result.error || 'Unknown error'));
          }
        } catch (err) {
          console.error('Sync error:', err);
          alert('Sync failed: ' + err.message);
        }
      }
      
      // Initialize on load
      initTheme();
      lucide.createIcons();
    </script>
</body>
</html>`;
}
