/**
 * Event Operations - UI
 * 
 * HTML rendering for Event Operations module.
 * Follows existing module conventions (daisyUI + Tailwind only).
 */

import { navbar } from '../../lib/components/navbar.js';

/**
 * Render Event Operations main page
 * 
 * @param {Object} user - Authenticated user object
 * @returns {string} HTML string
 */
export function eventOperationsUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Operations</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200" style="overflow-y: scroll;">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="pb-8">
        <div class="container mx-auto px-6 max-w-7xl">
          <div class="mb-8">
            <h1 class="text-4xl font-bold mb-2">Event Operations</h1>
            <p class="text-base-content/60">Manage Odoo webinar publication to WordPress</p>
          </div>
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <p class="text-base-content/60">Module loaded. Data integration coming in Phase 3.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script>
      lucide.createIcons();
    </script>
</body>
</html>`;
}
