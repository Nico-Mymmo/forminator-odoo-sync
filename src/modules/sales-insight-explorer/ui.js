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

          <!-- Results Container -->
          <div id="results-container">
            <!-- Results rendered here -->
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Results Container -->
          <div id="results-container">
            <!-- Results rendered here -->
          </div>

        </div>

      </div>
    </div>

    <script src="/semantic-wizard.js"></script>
    <script>
      lucide.createIcons();
    </script>
</body>
</html>`;
}
