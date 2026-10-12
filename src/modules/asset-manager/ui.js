/**
 * Asset Manager — UI
 *
 * Server-side HTML skeleton ONLY.
 * Alle dynamische logica zit in /asset-manager-client.js
 *
 * Layout: container-gebaseerd, consistent met overige modules (Signature Designer).
 * Geen full-height overrides, geen drawer-app-in-app gevoel.
 *
 * Mappen: zelfde opzet als de mappen in Koppelingen -- links een vaste
 * zijbalk "Mappen" met de volledige boom (Alle bestanden, dan de top-level
 * mappen Banners/Events/Logos/Overige/+ zelf aangemaakte, met hun submappen),
 * rechts enkel de bestanden van de gekozen map. De boom komt client-side uit
 * GET /api/assets/folders (zie renderFolderSidebar() in asset-manager-client.js).
 *
 * Regels:
 *  - Exact één return `...` template literal
 *  - Nul backticks in <script> blokken
 *  - Geen inline business JS
 *  - ${navbar(user)} geïnjecteerd
 *  - ${JSON.stringify(...)} voor minimale server→client state
 */

import { navbar } from '../../lib/components/navbar.js';

export function assetManagerUI(user, env) {
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'asset_manager';
  const isAdmin = user?.role === 'admin';
  // Vaste basis-URL voor asset-links (env.APP_BASE_URL), i.p.v. window.location.origin
  // client-side. Nodig sinds operations.openvme.be als los domein naar deze Worker
  // doorwijst: window.location.origin gaf dan operations.openvme.be als prefix, wat
  // niet correct naar de R2-assets doorroutet. Val terug op lege string zodat de
  // client zelf window.location.origin gebruikt als APP_BASE_URL niet gezet is.
  //
  // BEWUST NIET link.openvme.be hier: dat domein is enkel een 302-doorstuurlaag
  // (zie public-routes.js) en serveert zelf geen bytes -- de bytes blijven altijd
  // via dit (workers.dev / operations.openvme.be) adres lopen. Alle bestaande,
  // reeds gedeelde /assets/-links blijven zo werken; link.openvme.be/assets/... is
  // een extra, kortere/gebrande ALIAS erbovenop, geen vervanging.
  const assetBaseUrl = env?.APP_BASE_URL || '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Asset Library</title>

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
      userRole:     user?.role || 'user',
      userId:       user?.id   || '',
      canUpload:    isAdminOrManager,
      canAdmin:     isAdmin,
      assetBaseUrl: assetBaseUrl,
    })};
  </script>

  <div style="padding-top:48px;">
    <div class="container mx-auto px-4 md:px-6 py-6 max-w-7xl">

      <!-- ── PAGINAKOP ──────────────────────────────────────────────────── -->
      <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold mb-1">Asset Library</h1>
          <p class="text-base-content/60 text-sm">Beheer afbeeldingen, banners en overige bestanden</p>
        </div>
        ${isAdminOrManager ? `
        <button id="asset-upload-btn" class="btn btn-primary gap-2">
          <i data-lucide="upload" class="w-4 h-4"></i>
          Uploaden
        </button>` : ''}
      </div>

      <!-- ── ALERT ─────────────────────────────────────────────────────── -->
      <div id="asset-alert" class="mb-4" style="display:none;"></div>

      <!-- ── HOOFD LAYOUT: mappen-zijbalk + content (zelfde opzet als Koppelingen) -->
      <div class="flex flex-col lg:flex-row gap-6 items-start">

        <!-- ── Mappen-zijbalk ─────────────────────────────────────────── -->
        <aside class="w-full lg:w-60 shrink-0">
          <div class="flex items-center justify-between mb-2 px-1">
            <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Mappen</p>
            ${isAdmin ? `<button id="asset-add-root-folder-btn" class="btn btn-ghost btn-xs" title="Nieuwe map">
              <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>
            </button>` : ''}
          </div>
          <!-- Gevuld door renderFolderSidebar() -->
          <div id="asset-folder-tree" class="space-y-0.5 text-sm">
            <div class="flex justify-center py-4"><span class="loading loading-spinner loading-sm text-base-content/30"></span></div>
          </div>
        </aside>

        <!-- ── Content zone ───────────────────────────────────────────── -->
        <section id="asset-content-section" class="flex-1 min-w-0 w-full">

          <!-- Huidige map: pad + link-domein -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 min-h-[1.75rem]">
            <div class="text-sm breadcrumbs p-0 min-w-0 max-w-full">
              <ul id="asset-breadcrumb-list"></ul>
            </div>
            <span id="asset-brand-info" class="badge badge-ghost badge-sm gap-1 text-base-content/60" style="display:none;"></span>
          </div>

          <!-- Toolbar: zoek + sort + view toggle + count -->
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <div class="flex items-center gap-2 input input-sm input-bordered flex-1 min-w-[160px] max-w-xs px-3">
              <i data-lucide="search" class="w-3.5 h-3.5 opacity-50 shrink-0"></i>
              <input id="asset-search" type="text" placeholder="Zoeken op naam..." class="grow bg-transparent outline-none text-sm min-w-0" />
            </div>

            <select id="sort-select" class="select select-sm select-bordered">
              <option value="date-desc" selected>Nieuwste eerst</option>
              <option value="date-asc">Oudste eerst</option>
              <option value="name-asc">Naam A–Z</option>
              <option value="name-desc">Naam Z–A</option>
              <option value="size-desc">Grootst eerst</option>
              <option value="size-asc">Kleinst eerst</option>
            </select>

            <div class="join">
              <button id="view-grid-btn" class="join-item btn btn-sm btn-ghost btn-active" title="Grid weergave">
                <i data-lucide="layout-grid" class="w-4 h-4"></i>
              </button>
              <button id="view-list-btn" class="join-item btn btn-sm btn-ghost" title="Lijstweergave">
                <i data-lucide="list" class="w-4 h-4"></i>
              </button>
            </div>

            <span id="asset-count" class="badge badge-ghost text-xs ml-auto"></span>
          </div>

          <!-- Laadstatus / leeg -->
          <div id="asset-list-loading" class="flex items-center justify-center py-20">
            <span class="loading loading-spinner loading-md text-primary"></span>
          </div>
          <div id="asset-list-empty" class="flex flex-col items-center justify-center py-20 text-base-content/30 gap-3" style="display:none;">
            <i data-lucide="inbox" class="w-12 h-12 opacity-40"></i>
            <p id="asset-list-empty-text" class="text-sm text-center">Geen bestanden in deze map.</p>
          </div>

          <!-- ─ Grid view (default) ───────────────────────────────────── -->
          <div id="asset-grid-view"
               class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            <!-- gevuld door client JS -->
          </div>

          <!-- ─ List view ─────────────────────────────────────────────── -->
          <div id="asset-list-view" class="card bg-base-100 shadow-sm" style="display:none;">
            <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th class="w-10"></th>
                  <th>Naam</th>
                  <th class="hidden sm:table-cell w-24">Type</th>
                  <th class="hidden md:table-cell w-20">Grootte</th>
                  <th class="hidden lg:table-cell w-36">Datum</th>
                  <th class="w-12 text-right"></th>
                </tr>
              </thead>
              <tbody id="asset-list-body">
                <!-- gevuld door client JS -->
              </tbody>
            </table>
            </div>
          </div>

          <!-- Paginering -->
          <div id="asset-pagination" class="flex justify-between items-center mt-5" style="display:none;">
            <span id="asset-pagination-info" class="text-sm text-base-content/60"></span>
            <button id="asset-next-btn" class="btn btn-sm btn-outline gap-2">
              <i data-lucide="chevron-down" class="w-4 h-4"></i> Meer laden
            </button>
          </div>

        </section>
      </div><!-- /main layout -->
    </div><!-- /container -->
  </div>

  <!-- ════════════════════════════════════════════════════════════════════
       MODALS
       ════════════════════════════════════════════════════════════════ -->

  <!-- Upload modal -->
  <dialog id="asset-upload-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
        <i data-lucide="upload" class="w-5 h-5"></i> Bestand uploaden
      </h3>
      <div class="flex flex-col gap-4">
        <label class="form-control">
          <div class="label"><span class="label-text">Bestand selecteren</span></div>
          <input id="upload-file-input" type="file" multiple
                 class="file-input file-input-bordered file-input-sm w-full" />
        </label>
        <label class="form-control">
          <div class="label"><span class="label-text">Map</span></div>
          <!-- Opties (mappenboom, ingesprongen) gevuld door fillFolderSelect() -->
          <select id="upload-folder-select" class="select select-bordered select-sm w-full"></select>
        </label>
        <label class="label cursor-pointer justify-start gap-3 py-0">
          <input id="upload-overwrite-input" type="checkbox" class="checkbox checkbox-sm" />
          <span class="label-text text-sm">Overschrijven als bestand al bestaat</span>
        </label>
      </div>
      <div id="upload-progress" class="mt-4" style="display:none;">
        <progress class="progress progress-primary w-full"></progress>
        <p class="text-xs text-center mt-1 text-base-content/50">Bezig met uploaden...</p>
      </div>
      <div class="modal-action">
        <button id="upload-confirm-btn" class="btn btn-primary btn-sm gap-1">
          <i data-lucide="upload" class="w-3.5 h-3.5"></i> Uploaden
        </button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Delete modal -->
  <dialog id="asset-delete-modal" class="modal">
    <div class="modal-box max-w-sm">
      <h3 class="font-bold text-lg mb-2 flex items-center gap-2">
        <i data-lucide="trash-2" class="w-5 h-5 text-error"></i> Verwijderen?
      </h3>
      <p class="text-sm text-base-content/60 mb-2">Dit kan niet ongedaan worden gemaakt.</p>
      <p id="delete-modal-filename"
         class="text-sm font-mono bg-base-200 rounded-lg px-3 py-2 mb-4 break-all"></p>
      <div class="modal-action">
        <button id="delete-confirm-btn" class="btn btn-error btn-sm">Verwijderen</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Rename modal -->
  <dialog id="asset-rename-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
        <i data-lucide="pencil" class="w-5 h-5"></i> Hernoemen
      </h3>
      <label class="form-control">
        <div class="label"><span class="label-text">Nieuwe volledige key</span></div>
        <input id="rename-newkey-input" type="text"
               class="input input-bordered input-sm w-full font-mono" />
      </label>
      <div class="modal-action">
        <button id="rename-confirm-btn" class="btn btn-primary btn-sm">Opslaan</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Move modal -->
  <dialog id="asset-move-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
        <i data-lucide="folder-input" class="w-5 h-5"></i> Verplaatsen
      </h3>
      <p id="move-modal-filename"
         class="text-xs font-mono text-base-content/50 mb-3 break-all"></p>
      <label class="form-control">
        <div class="label"><span class="label-text">Naar map</span></div>
        <!-- Opties (mappenboom, ingesprongen) gevuld door fillFolderSelect() -->
        <select id="move-folder-select" class="select select-bordered select-sm w-full"></select>
      </label>
      <div class="modal-action">
        <button id="move-confirm-btn" class="btn btn-primary btn-sm">Verplaatsen</button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Nieuwe map modal -->
  <dialog id="asset-folder-modal" class="modal">
    <div class="modal-box max-w-md">
      <h3 id="folder-modal-title" class="font-bold text-lg mb-1 flex items-center gap-2">
        <i data-lucide="folder-plus" class="w-5 h-5"></i> Nieuwe map
      </h3>
      <p id="folder-modal-location" class="text-xs text-base-content/50 mb-3" style="display:none;"></p>
      <label class="form-control">
        <div class="label"><span class="label-text">Naam</span></div>
        <input id="folder-label-input" type="text" placeholder="Contracten"
               class="input input-bordered input-sm w-full" maxlength="80" />
        <div class="label">
          <span class="label-text-alt text-base-content/40">Prefix: <span id="folder-slug-preview" class="font-mono">-</span></span>
        </div>
      </label>
      <p id="folder-modal-error" class="text-error text-xs mt-1" style="display:none;"></p>
      <div class="modal-action">
        <button id="folder-confirm-btn" class="btn btn-primary btn-sm gap-1">
          <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i> Aanmaken
        </button>
        <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- Preview modal -->
  <dialog id="preview-modal" class="modal">
    <div class="modal-box max-w-2xl w-full">
      <div id="preview-modal-content" class="mb-4">
        <!-- gevuld door client JS -->
      </div>
      <div class="modal-action">
        <form method="dialog">
          <button class="btn btn-ghost btn-sm">Sluiten</button>
        </form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <script src="/asset-manager-client.js"></script>
</body>
</html>`;
}
