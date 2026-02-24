/**
 * Asset Manager — UI
 *
 * Server-side HTML skeleton ONLY.
 * Alle dynamische logica zit in /asset-manager-client.js
 *
 * Layout: 3-pane (folder tree | file list | preview) via DaisyUI drawer
 * Responsive: drawer collapsible op mobile, always-open op lg+
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
<html lang="nl">
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
<body class="bg-base-200 overflow-hidden" style="height:100vh;">

  ${navbar(user)}

  <!-- State mag geen backticks bevatten — JSON.stringify garandeert dat -->
  <script>
    window.__ASSET_STATE__ = ${JSON.stringify({
      userRole:  user?.role || 'user',
      userId:    user?.id   || '',
      canUpload: isAdminOrManager,
      canAdmin:  isAdmin,
    })};
  </script>

  <!-- Drawer layout — lg:drawer-open = sidebar altijd zichtbaar op desktop -->
  <div class="drawer lg:drawer-open" style="height:calc(100vh - 48px);margin-top:48px;overflow:hidden;">
    <input id="drawer-toggle" type="checkbox" class="drawer-toggle" />

    <!-- ═══ MAIN CONTENT ══════════════════════════════════════════════════ -->
    <div class="drawer-content flex flex-col h-full overflow-hidden">

      <!-- Top toolbar -->
      <div class="flex items-center gap-2 px-3 py-2 bg-base-100 border-b border-base-300 shrink-0 min-w-0">
        <!-- Mobile: hamburger to open drawer -->
        <label for="drawer-toggle" class="btn btn-ghost btn-sm btn-square lg:hidden shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </label>

        <!-- Breadcrumb -->
        <div id="asset-breadcrumb" class="text-sm breadcrumbs flex-1 min-w-0 overflow-hidden">
          <ul><li><a href="#">Alle bestanden</a></li></ul>
        </div>

        <!-- Search -->
        <input id="asset-search" type="text" placeholder="Zoeken..." class="input input-sm input-bordered w-28 sm:w-48 lg:w-64 shrink-0" />

        <!-- Upload knop (role-gated) -->
        ${isAdminOrManager ? `
        <button id="asset-upload-btn" class="btn btn-sm btn-primary shrink-0 gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span class="hidden sm:inline">Upload</span>
        </button>` : ''}
      </div>

      <!-- Alert banner -->
      <div id="asset-alert" class="px-3 pt-2 shrink-0" style="display:none;"></div>

      <!-- Sort bar -->
      <div class="flex items-center gap-1 px-4 py-1 bg-base-100 border-b border-base-300 shrink-0 text-xs text-base-content/50">
        <span id="asset-count" class="mr-2"></span>
        <div class="flex-1"></div>
        <button id="sort-name-btn" class="btn btn-ghost btn-xs gap-1">Naam<span id="sort-name-icon"></span></button>
        <button id="sort-size-btn" class="btn btn-ghost btn-xs gap-1 hidden sm:flex">Grootte<span id="sort-size-icon"></span></button>
        <button id="sort-date-btn" class="btn btn-ghost btn-xs gap-1 hidden md:flex">Datum<span id="sort-date-icon"></span></button>
      </div>

      <!-- Content row: file list + preview pane -->
      <div class="flex flex-1 min-h-0 overflow-hidden">

        <!-- File list -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div class="flex-1 overflow-auto">
            <table class="table table-sm table-pin-rows w-full">
              <thead>
                <tr class="bg-base-200">
                  <th class="w-8"></th>
                  <th>Naam</th>
                  <th class="hidden sm:table-cell w-24">Type</th>
                  <th class="hidden md:table-cell w-20">Grootte</th>
                  <th class="hidden lg:table-cell w-32">Datum</th>
                  <th class="w-28 text-right">Acties</th>
                </tr>
              </thead>
              <tbody id="asset-list-body">
                <!-- gevuld door client JS -->
              </tbody>
            </table>

            <div id="asset-list-empty" class="flex flex-col items-center justify-center py-20 text-base-content/30" style="display:none;">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mb-3 opacity-40"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <div class="text-sm">Geen bestanden in dit pad.</div>
            </div>

            <div id="asset-list-loading" class="flex items-center justify-center py-20">
              <span class="loading loading-spinner loading-md text-primary"></span>
            </div>
          </div>

          <!-- Pagination footer -->
          <div id="asset-pagination" class="flex justify-between items-center px-4 py-2 border-t border-base-300 bg-base-100 shrink-0" style="display:none;">
            <span id="asset-pagination-info" class="text-xs text-base-content/50"></span>
            <button id="asset-next-btn" class="btn btn-sm btn-outline gap-1">
              Meer laden
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        <!-- ── Preview pane (desktop, lg+) ─────────────────────────────── -->
        <div id="preview-pane" class="hidden w-72 shrink-0 border-l border-base-300 bg-base-100 flex-col overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-base-300 shrink-0">
            <span class="font-semibold text-sm">Preview</span>
            <button id="preview-close-btn" class="btn btn-ghost btn-xs btn-square" title="Sluiten">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div id="preview-content" class="flex-1 overflow-y-auto p-4">
            <div class="flex flex-col items-center justify-center h-full text-base-content/30 gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              <span class="text-sm">Selecteer een bestand</span>
            </div>
          </div>
        </div>

      </div>
    </div><!-- /drawer-content -->

    <!-- ═══ SIDEBAR — Folder tree ═════════════════════════════════════════ -->
    <div class="drawer-side" style="z-index:40;">
      <label for="drawer-toggle" class="drawer-overlay"></label>
      <div class="w-56 min-h-full bg-base-100 border-r border-base-300 flex flex-col">
        <div class="px-3 py-2 border-b border-base-300 text-xs font-semibold text-base-content/50 uppercase tracking-wider shrink-0">
          Mappen
        </div>
        <ul id="folder-tree" class="menu menu-sm p-2 overflow-y-auto flex-1">
          <li id="folder-root-item">
            <a id="folder-root-link" href="#" class="gap-2 font-medium active">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Alle bestanden
            </a>
          </li>
        </ul>
      </div>
    </div>

  </div><!-- /drawer -->

  <!-- ═══ MODALS ════════════════════════════════════════════════════════════ -->

  <!-- Upload -->
  <dialog id="asset-upload-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4">Bestand uploaden</h3>
      <div class="flex flex-col gap-3">
        <label class="form-control">
          <div class="label"><span class="label-text">Bestand selecteren</span></div>
          <input id="upload-file-input" type="file" class="file-input file-input-bordered file-input-sm w-full" />
        </label>
        <label class="form-control">
          <div class="label"><span class="label-text">Map (prefix)</span></div>
          <input id="upload-prefix-input" type="text" value="uploads/" class="input input-bordered input-sm w-full font-mono" />
          <div class="label"><span class="label-text-alt text-base-content/40">bijv. uploads/ of public/img/</span></div>
        </label>
        <label class="label cursor-pointer justify-start gap-3 py-1">
          <input id="upload-overwrite-input" type="checkbox" class="checkbox checkbox-sm" />
          <span class="label-text text-sm">Overschrijven als bestand al bestaat</span>
        </label>
      </div>
      <div id="upload-progress" class="mt-4" style="display:none;">
        <progress class="progress progress-primary w-full"></progress>
        <div class="text-xs text-center mt-1 text-base-content/50">Bezig met uploaden...</div>
      </div>
      <div class="modal-action">
        <button id="upload-confirm-btn" class="btn btn-primary btn-sm">Uploaden</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Delete -->
  <dialog id="asset-delete-modal" class="modal">
    <div class="modal-box max-w-sm">
      <h3 class="font-bold text-lg mb-2">Bestand verwijderen?</h3>
      <p class="text-sm text-base-content/60 mb-2">Dit kan niet ongedaan worden gemaakt.</p>
      <p id="delete-modal-filename" class="text-sm font-mono bg-base-200 rounded px-3 py-2 mb-4 break-all"></p>
      <div class="modal-action">
        <button id="delete-confirm-btn" class="btn btn-error btn-sm">Verwijderen</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Rename -->
  <dialog id="asset-rename-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4">Bestand hernoemen</h3>
      <label class="form-control">
        <div class="label"><span class="label-text">Nieuwe volledige key</span></div>
        <input id="rename-newkey-input" type="text" class="input input-bordered input-sm w-full font-mono" />
      </label>
      <div class="modal-action">
        <button id="rename-confirm-btn" class="btn btn-primary btn-sm">Hernoemen</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Move -->
  <dialog id="asset-move-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4">Bestand verplaatsen</h3>
      <p id="move-modal-filename" class="text-xs font-mono text-base-content/50 mb-3 break-all"></p>
      <label class="form-control">
        <div class="label"><span class="label-text">Doelmap (prefix)</span></div>
        <input id="move-prefix-input" type="text" placeholder="uploads/" class="input input-bordered input-sm w-full font-mono" />
        <div class="label"><span class="label-text-alt text-base-content/40">bijv. uploads/archief/</span></div>
      </label>
      <div class="modal-action">
        <button id="move-confirm-btn" class="btn btn-primary btn-sm">Verplaatsen</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Preview modal (mobile/tablet) -->
  <dialog id="preview-modal" class="modal modal-bottom sm:modal-middle">
    <div class="modal-box max-w-lg">
      <h3 id="preview-modal-title" class="font-semibold text-sm mb-4 font-mono break-all"></h3>
      <div id="preview-modal-content" class="mb-4"></div>
      <div class="modal-action">
        <form method="dialog"><button class="btn btn-sm btn-ghost">Sluiten</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <script src="/asset-manager-client.js"></script>
</body>
</html>`;
}
