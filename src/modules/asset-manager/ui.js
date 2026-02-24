/**
 * Asset Manager — UI
 *
 * Server-side HTML skeleton ONLY.
 * Alle dynamische logica zit in /asset-manager-client.js
 *
 * Layout: container-gebaseerd, consistent met overige modules (Signature Designer).
 * Geen full-height overrides, geen drawer-app-in-app gevoel.
 *
 * Categorieën (prefix-based, uitbreidbaar):
 *   Alles → ''        (alle assets)
 *   Banners → 'banners/'
 *   Events  → 'events/'
 *   Logos   → 'logos/'
 *   Overige → 'uploads/'
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
      userRole:  user?.role || 'user',
      userId:    user?.id   || '',
      canUpload: isAdminOrManager,
      canAdmin:  isAdmin,
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

      <!-- ── HOOFD LAYOUT: sidebar + content ───────────────────────────── -->
      <div class="flex gap-6 items-start">

        <!-- ─ Categorie-menu ──────────────────────────────────────────── -->
        <aside class="w-44 shrink-0 hidden sm:block">
          <ul id="category-menu" class="menu bg-base-100 rounded-box shadow-sm p-2 gap-0.5">
            <li class="menu-title text-xs">Categorieën</li>
            <li>
              <a data-prefix="" class="gap-2 active" id="cat-alles">
                <i data-lucide="layout-grid" class="w-4 h-4"></i> Alles
              </a>
            </li>
            <li>
              <a data-prefix="banners/" class="gap-2" id="cat-banners">
                <i data-lucide="image" class="w-4 h-4"></i> Banners
              </a>
            </li>
            <li>
              <a data-prefix="events/" class="gap-2" id="cat-events">
                <i data-lucide="calendar" class="w-4 h-4"></i> Events
              </a>
            </li>
            <li>
              <a data-prefix="logos/" class="gap-2" id="cat-logos">
                <i data-lucide="star" class="w-4 h-4"></i> Logos
              </a>
            </li>
            <li>
              <a data-prefix="uploads/" class="gap-2" id="cat-uploads">
                <i data-lucide="folder" class="w-4 h-4"></i> Overige
              </a>
            </li>
          </ul>
        </aside>

        <!-- ─ Content zone ────────────────────────────────────────────── -->
        <section class="flex-1 min-w-0">

          <!-- Mobile: categorie tabs -->
          <div id="mobile-category-tabs" class="flex gap-1 overflow-x-auto pb-1 sm:hidden mb-3">
            <button data-prefix="" class="btn btn-sm btn-primary cat-tab">Alles</button>
            <button data-prefix="banners/" class="btn btn-sm btn-ghost cat-tab">Banners</button>
            <button data-prefix="events/" class="btn btn-sm btn-ghost cat-tab">Events</button>
            <button data-prefix="logos/" class="btn btn-sm btn-ghost cat-tab">Logos</button>
            <button data-prefix="uploads/" class="btn btn-sm btn-ghost cat-tab">Overige</button>
          </div>

          <!-- Toolbar: zoek + sort + view toggle + count -->
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <!-- Zoekbalk -->
            <div class="flex items-center gap-2 input input-sm input-bordered flex-1 min-w-[160px] max-w-xs px-3">
              <i data-lucide="search" class="w-3.5 h-3.5 opacity-50 shrink-0"></i>
              <input id="asset-search" type="text" placeholder="Zoeken..." class="grow bg-transparent outline-none text-sm min-w-0" />
            </div>

            <!-- Sort select -->
            <select id="sort-select" class="select select-sm select-bordered">
              <option value="name-asc">Naam A–Z</option>
              <option value="name-desc">Naam Z–A</option>
              <option value="date-desc" selected>Nieuwste eerst</option>
              <option value="date-asc">Oudste eerst</option>
              <option value="size-desc">Grootst eerst</option>
              <option value="size-asc">Kleinst eerst</option>
            </select>

            <!-- View toggle -->
            <div class="join">
              <button id="view-grid-btn" class="join-item btn btn-sm btn-ghost btn-active" title="Grid weergave">
                <i data-lucide="layout-grid" class="w-4 h-4"></i>
              </button>
              <button id="view-list-btn" class="join-item btn btn-sm btn-ghost" title="Lijstweergave">
                <i data-lucide="list" class="w-4 h-4"></i>
              </button>
            </div>

            <!-- Bestandsteller -->
            <span id="asset-count" class="badge badge-ghost text-xs ml-auto"></span>
          </div>

          <!-- Laadstatus / leeg -->
          <div id="asset-list-loading" class="flex items-center justify-center py-20">
            <span class="loading loading-spinner loading-md text-primary"></span>
          </div>
          <div id="asset-list-empty" class="flex flex-col items-center justify-center py-20 text-base-content/30 gap-3" style="display:none;">
            <i data-lucide="inbox" class="w-12 h-12 opacity-40"></i>
            <p class="text-sm">Geen bestanden in deze categorie.</p>
          </div>

          <!-- ─ Grid view (default) ───────────────────────────────────── -->
          <div id="asset-grid-view"
               class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            <!-- gevuld door client JS -->
          </div>

          <!-- ─ List view ─────────────────────────────────────────────── -->
          <div id="asset-list-view" class="card bg-base-100 shadow-sm overflow-x-auto" style="display:none;">
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
          <div class="label"><span class="label-text">Categorie</span></div>
          <select id="upload-category-select" class="select select-bordered select-sm w-full">
            <option value="banners/">Banners</option>
            <option value="events/">Events</option>
            <option value="logos/">Logos</option>
            <option value="uploads/" selected>Overige</option>
            <option value="_custom">Aangepast pad...</option>
          </select>
        </label>
        <label id="upload-custom-wrap" class="form-control" style="display:none;">
          <div class="label"><span class="label-text">Aangepast pad (prefix)</span></div>
          <input id="upload-prefix-input" type="text" placeholder="mijn-map/"
                 class="input input-bordered input-sm w-full font-mono" />
          <div class="label">
            <span class="label-text-alt text-base-content/40">Eindig altijd op /</span>
          </div>
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
        <div class="label"><span class="label-text">Doelcategorie</span></div>
        <select id="move-category-select" class="select select-bordered select-sm w-full">
          <option value="banners/">Banners</option>
          <option value="events/">Events</option>
          <option value="logos/">Logos</option>
          <option value="uploads/">Overige</option>
          <option value="_custom">Aangepast pad...</option>
        </select>
      </label>
      <label id="move-custom-wrap" class="form-control mt-2" style="display:none;">
        <input id="move-prefix-input" type="text" placeholder="mijn-map/"
               class="input input-bordered input-sm w-full font-mono" />
      </label>
      <div class="modal-action">
        <button id="move-confirm-btn" class="btn btn-primary btn-sm">Verplaatsen</button>
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
