/**
 * Asset Manager — UI
 *
 * Server-side HTML skeleton ONLY.
 * Alle dynamische logica zit in /asset-manager-client.js
 *
 * Regels:
 *  - Exact één return `...` template literal
 *  - Nul backticks in <script> blokken
 *  - Geen inline business JS
 *  - ${navbar(user)} geïnjecteerd
 *  - ${JSON.stringify(...)} voor minimale server→client state
 */

import { navbar } from '../../lib/components/navbar.js';

export function assetManagerUI(user) {
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'asset_manager';
  const isAdmin = user?.role === 'admin';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Asset Manager</title>

  <script>
    (function initThemeEarly() {
      try {
        var localTheme = localStorage.getItem('selectedTheme');
        var cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
        var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        var theme = localTheme || cookieTheme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>

  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />

  <script>
    (function suppressTailwindCdnWarning() {
      var _w = console.warn;
      console.warn = function() {
        if (arguments[0] && typeof arguments[0] === 'string' &&
            arguments[0].indexOf('cdn.tailwindcss.com should not be used in production') !== -1) return;
        return _w.apply(console, arguments);
      };
    })();
  </script>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <script>
    window.__ASSET_STATE__ = ${JSON.stringify({
      userRole:  user?.role || 'user',
      userId:    user?.id   || '',
      canUpload: isAdminOrManager,
      canAdmin:  isAdmin,
    })};
  </script>

  <div style="padding-top: 48px;" class="p-4">

    <!-- Breadcrumb / folder navigatie -->
    <div id="asset-breadcrumb" class="text-sm breadcrumbs mb-3">
      <ul><li id="breadcrumb-root"><a href="#">/</a></li></ul>
    </div>

    <!-- Alert / feedback -->
    <div id="asset-alert" class="mb-3" style="display:none;"></div>

    <!-- Toolbar: zoek + upload knop (role-gated) -->
    <div class="flex items-center gap-2 mb-3">
      <input id="asset-search" type="text" placeholder="Zoeken in huidige pagina..." class="input input-sm input-bordered flex-1" />
      ${isAdminOrManager ? '<button id="asset-upload-btn" class="btn btn-sm btn-primary gap-1"><span>Upload</span></button>' : ''}
    </div>

    <!-- Bestandslijst -->
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body p-0">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Type</th>
              <th>Grootte</th>
              <th>Datum</th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody id="asset-list-body">
            <!-- gevuld door asset-manager-client.js -->
          </tbody>
        </table>
        <div id="asset-list-empty" class="p-8 text-center text-base-content/50" style="display:none;">
          Geen bestanden gevonden.
        </div>
        <div id="asset-list-loading" class="p-8 text-center">
          <span class="loading loading-spinner loading-sm"></span>
        </div>
      </div>
    </div>

    <!-- Paginering -->
    <div id="asset-pagination" class="flex justify-between items-center mt-3" style="display:none !important;">
      <span id="asset-pagination-info" class="text-sm text-base-content/60"></span>
      <button id="asset-next-btn" class="btn btn-sm btn-ghost">Volgende pagina</button>
    </div>

    <!-- Upload zone (modal) -->
    <dialog id="asset-upload-modal" class="modal">
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Bestand uploaden</h3>
        <div class="form-control mb-3">
          <label class="label"><span class="label-text">Bestand</span></label>
          <input id="upload-file-input" type="file" class="file-input file-input-bordered file-input-sm w-full" />
        </div>
        <div class="form-control mb-3">
          <label class="label"><span class="label-text">Map (prefix)</span></label>
          <input id="upload-prefix-input" type="text" value="uploads/" class="input input-bordered input-sm w-full" />
        </div>
        <div id="upload-progress" class="mb-3" style="display:none;">
          <progress class="progress progress-primary w-full"></progress>
        </div>
        <div class="modal-action">
          <button id="upload-confirm-btn" class="btn btn-primary btn-sm">Uploaden</button>
          <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <!-- Verwijder bevestiging (modal) -->
    <dialog id="asset-delete-modal" class="modal">
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-2">Bestand verwijderen</h3>
        <p id="delete-modal-filename" class="text-sm text-base-content/70 mb-4"></p>
        <div class="modal-action">
          <button id="delete-confirm-btn" class="btn btn-error btn-sm">Verwijderen</button>
          <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <!-- Rename modal -->
    <dialog id="asset-rename-modal" class="modal">
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Bestand hernoemen</h3>
        <div class="form-control mb-4">
          <label class="label"><span class="label-text">Nieuwe naam (volledige key)</span></label>
          <input id="rename-newkey-input" type="text" class="input input-bordered input-sm w-full" />
        </div>
        <div class="modal-action">
          <button id="rename-confirm-btn" class="btn btn-primary btn-sm">Hernoemen</button>
          <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

  </div>

  <script src="/asset-manager-client.js"></script>
</body>
</html>`;
}
