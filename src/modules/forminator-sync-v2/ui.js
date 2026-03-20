/**
 * Forminator Sync V2 — UI
 *
 * Server-side HTML skeleton only.
 * ALL dynamic logic lives in ./public/client.js (embedded inline).
 *
 * Layout follows the Event Operations pattern:
 *   - Persistent header with title + Settings dropdown + primary CTA
 *   - Four toggled views: list | connections | wizard | detail
 */

import { navbar } from '../../lib/components/navbar.js';

/** Cache-busting version — bump whenever any of the 5 public FSV2 files change. */
const FSV2_ASSET_VERSION = '20260304j';

export function forminatorSyncV2UI(user) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Forminator Sync</title>

  <!-- Early theme init (matches Event Operations pattern) -->
  <script>
    (function() {
      try {
        var theme = localStorage.getItem('selectedTheme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch(_) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>

  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />

  <!-- Suppress Tailwind CDN warning -->
  <script>
    (function() {
      var orig = console.warn;
      console.warn = function() {
        if (arguments[0] && String(arguments[0]).includes('cdn.tailwindcss.com')) return;
        orig.apply(console, arguments);
      };
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-6xl">

      <!-- ─── PAGE HEADER ─────────────────────────────────────────────── -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-3xl font-bold">Forminator Sync</h1>
            <span class="badge badge-primary badge-sm font-mono">v2</span>
          </div>
          <p class="text-base-content/55 text-sm">WordPress formulieren &rarr; Odoo &mdash; automatisch gesynchroniseerd</p>
        </div>
        <div class="flex items-center gap-2">

          <!-- Settings dropdown (visible on list view only) -->
          <div class="dropdown dropdown-end" id="settingsDropdown">
            <button class="btn btn-sm btn-ghost border border-base-300" tabindex="0" type="button">
              <i data-lucide="settings-2" class="w-4 h-4"></i>
              <span class="hidden sm:inline">Instellingen</span>
            </button>
            <ul tabindex="0" class="dropdown-content z-[10] menu p-2 shadow-lg bg-base-100 rounded-xl w-56 mt-1 border border-base-200">
              <li class="menu-title text-xs opacity-50">Configuratie</li>
              <li>
                <a data-action="goto-connections" class="flex items-center gap-2.5 py-2">
                  <i data-lucide="wifi" class="w-4 h-4 text-primary"></i>
                  Verbindingen
                  <span class="text-xs text-base-content/40 ml-auto">Sites</span>
                </a>
              </li>
              <li>
                <a data-action="goto-defaults" class="flex items-center gap-2.5 py-2">
                  <i data-lucide="sliders-horizontal" class="w-4 h-4 text-primary"></i>
                  Standaard velden
                </a>
              </li>
              <li>
                <a data-action="goto-links" class="flex items-center gap-2.5 py-2">
                  <i data-lucide="git-merge" class="w-4 h-4 text-primary"></i>
                  Model-koppelingen
                  <span class="badge badge-xs badge-primary ml-auto">Nieuw</span>
                </a>
              </li>
            </ul>
          </div>

          <!-- New integration CTA (visible on list view only) -->
          <button id="btnNewIntegration" class="btn btn-sm btn-primary" data-action="goto-wizard" type="button">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Nieuwe integratie</span>
            <span class="sm:hidden">Nieuw</span>
          </button>
        </div>
      </div>

      <!-- ─── GLOBAL ALERT ────────────────────────────────────────────── -->
      <div id="statusAlert" class="alert mb-6" style="display:none;"></div>

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- VIEW: LIST                                                       -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div id="view-list">

        <!-- Loading spinner -->
        <div id="listLoading" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg text-base-content/60">Laden...</span>
        </div>

        <!-- Empty state -->
        <div id="listEmpty" class="card bg-base-100 shadow-xl" style="display:none;">
          <div class="card-body items-center text-center py-16">
            <div class="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center mb-4">
              <i data-lucide="link-2" class="w-8 h-8 text-base-content/30"></i>
            </div>
            <h2 class="card-title text-2xl mb-2">Nog geen integraties</h2>
            <p class="text-base-content/60 mb-6">Maak je eerste koppeling aan in drie stappen.</p>
            <button class="btn btn-primary" data-action="goto-wizard" type="button">
              <i data-lucide="plus" class="w-4 h-4"></i>
              Nieuwe integratie
            </button>
          </div>
        </div>

        <!-- Integration cards grid -->
        <div id="listCards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style="display:none;"></div>

      </div><!-- /view-list -->


      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- VIEW: CONNECTIONS                                                -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div id="view-connections" style="display:none;">

        <button class="btn btn-ghost btn-sm mb-6" data-action="goto-list" type="button">
          <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i>
          Terug naar overzicht
        </button>

        <div class="mb-6">
          <h2 class="text-3xl font-bold mb-1">Verbindingen</h2>
          <p class="text-base-content/60">Geconfigureerde WordPress sites via Cloudflare secrets</p>
        </div>

        <!-- Populated by client.js renderConnections() -->
        <div id="connectionsList"></div>

      </div><!-- /view-connections -->


      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- VIEW: DEFAULTS                                                   -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div id="view-defaults" style="display:none;">

        <button class="btn btn-ghost btn-sm mb-6" data-action="goto-list" type="button">
          <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i>
          Terug naar overzicht
        </button>

        <div class="mb-6">
          <h2 class="text-3xl font-bold mb-1">Standaard velden</h2>
          <p class="text-base-content/60">Stel per Odoo model in welke velden standaard als rijen verschijnen in de wizard</p>
        </div>

        <!-- Populated by client.js renderDefaults() -->
        <div id="defaultsList"></div>

      </div><!-- /view-defaults -->


      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- VIEW: LINKS (model link registry)                               -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div id="view-links" style="display:none;">

        <div class="flex items-center gap-2 mb-6">
          <button class="btn btn-ghost btn-sm" data-action="goto-list" type="button">
            <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i>
            Overzicht
          </button>
          <div class="divider divider-horizontal m-0"></div>
          <nav class="flex items-center gap-1 text-sm text-base-content/60">
            <a class="hover:text-base-content cursor-pointer" data-action="goto-connections">Verbindingen</a>
            <span>/</span>
            <a class="hover:text-base-content cursor-pointer" data-action="goto-defaults">Standaard velden</a>
            <span>/</span>
            <span class="font-semibold text-base-content">Model-koppelingen</span>
          </nav>
        </div>

        <div class="mb-6">
          <h2 class="text-2xl font-bold mb-1 flex items-center gap-2">
            <i data-lucide="git-merge" class="w-6 h-6 text-primary"></i>
            Model-koppelingen
          </h2>
          <p class="text-sm text-base-content/60 max-w-prose">
            Definieer welke many2one-velden twee Odoo-modellen verbinden. De pipeline-assistent
            gebruikt deze koppelingen om automatisch suggesties te geven wanneer je een
            multi-stap integratie bouwt.
          </p>
        </div>

        <!-- Populated by forminator-sync-v2-settings.js renderLinks() -->
        <div id="linksList"></div>

      </div><!-- /view-links -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div id="view-wizard" style="display:none;">

        <button class="btn btn-ghost btn-sm mb-6" data-action="goto-list" type="button">
          <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i>
          Terug naar overzicht
        </button>

        <div class="mb-6">
          <h2 class="text-3xl font-bold mb-1">Nieuwe integratie</h2>
          <p class="text-base-content/60">Koppel een formulier aan Odoo in drie stappen</p>
        </div>

        <!-- Step indicator -->
        <ul class="steps w-full mb-10 text-sm">
          <li id="wizardStep1" class="step step-primary">Website</li>
          <li id="wizardStep2" class="step">Formulier</li>
          <li id="wizardStep3" class="step">Actie</li>
          <li id="wizardStep4" class="step">Koppeling</li>
          <li id="wizardStep5" class="step">Notitie</li>
        </ul>

        <!-- ── Step 1: Choose site ──────────────────────────────────── -->
        <div id="wizard-section-sites">
          <div class="mb-4">
            <h3 class="text-lg font-semibold">Kies een website</h3>
            <p class="text-sm text-base-content/60">Selecteer de WordPress site waarvan het formulier afkomstig is.</p>
          </div>
          <div id="wizardSitesGrid" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
        </div>

        <!-- ── Step 2: Choose form (hidden until site selected) ─────── -->
        <div id="wizard-section-forms" style="display:none;" class="mt-10">
          <div class="divider mb-6"></div>
          <div class="mb-4">
            <h3 class="text-lg font-semibold">Kies een formulier</h3>
            <p class="text-sm text-base-content/60">Selecteer het Forminator-formulier dat je wilt koppelen.</p>
          </div>
          <div id="wizardFormsGrid" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
        </div>

        <!-- ── Step 3: Choose action (hidden until form selected) ────── -->
        <div id="wizard-section-actions" style="display:none;" class="mt-10">
          <div class="divider mb-6"></div>
          <div class="mb-4">
            <h3 class="text-lg font-semibold">Wat wil je doen in Odoo?</h3>
            <p class="text-sm text-base-content/60">Kies wat er in Odoo moet gebeuren wanneer dit formulier wordt ingevuld.</p>
          </div>
          <!-- actions-grid is filled by renderWizardActions() -->
          <div class="actions-grid grid grid-cols-1 md:grid-cols-3 gap-4"></div>
        </div>

        <!-- ── Step 4: Mapping + create (hidden until action selected) ── -->
        <div id="wizard-section-mapping" style="display:none;" class="mt-10">
          <div class="divider mb-6"></div>

          <div class="mb-6">
            <h3 class="text-lg font-semibold mb-1">Veldkoppelingen</h3>
            <p class="text-sm text-base-content/60">
              Kies voor elk Odoo-veld welk formulierveld de waarde levert.
              Voorgestelde koppelingen zijn automatisch ingevuld op basis van veldnamen.
            </p>
          </div>

          <!-- Integration name -->
          <div class="card bg-base-100 shadow mb-6">
            <div class="card-body p-5">
              <div class="form-control">
                <label class="label"><span class="label-text font-semibold">Naam van deze integratie</span></label>
                <input
                  id="wizardName"
                  type="text"
                  class="input input-bordered"
                  placeholder="bijv. OpenVME — Contactformulier — Lead aanmaken"
                  required
                />
              </div>
            </div>
          </div>

          <!-- Mapping table (built by renderWizardMapping()) -->
          <div class="card bg-base-100 shadow mb-6">
            <div class="card-body p-5">
              <div id="wizardMappingTable"></div>
            </div>
          </div>

          <!-- Submit -->
          <button
            id="btnCreateIntegration"
            data-action="submit-wizard"
            class="btn btn-primary w-full"
            type="button"
          >
            <i data-lucide="check" class="w-4 h-4"></i>
            Integratie aanmaken
          </button>
        </div>

        <!-- ── Step 5: Optional chatter step (shown after successful submit) ── -->
        <div id="wizard-section-chatter" style="display:none;" class="mt-10">
          <div class="divider mb-6"></div>
          <div class="mb-6 text-center">
            <div class="text-4xl mb-3">✉️</div>
            <h3 class="text-lg font-semibold mb-1">Integratie aangemaakt!</h3>
            <p class="text-sm text-base-content/60">Wil je ook een notitie in de Odoo-chatter plaatsen bij elke nieuwe indiening?</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button type="button" class="btn btn-outline w-full gap-2" data-action="wizard-skip-chatter">
              <i data-lucide="skip-forward" class="w-5 h-5"></i>
              Overslaan — afronden
            </button>
            <button type="button" class="btn btn-primary w-full gap-2" data-action="wizard-add-chatter">
              <i data-lucide="message-square-plus" class="w-5 h-5"></i>
              Ja, voeg chatter-notitie toe
            </button>
          </div>
        </div>

      </div><!-- /view-wizard -->


      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- VIEW: DETAIL (edit existing integration)                        -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div id="view-detail" style="display:none;">

        <button class="btn btn-ghost btn-sm mb-6" data-action="goto-list" type="button">
          <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i>
          Terug naar overzicht
        </button>

        <!-- Header card — rendered by renderDetail() -->
        <div id="detailHeader"></div>

        <!-- Mappings card -->
        <div class="card bg-base-100 shadow mb-6">
          <div class="card-body p-6">
            <h3 class="font-bold text-lg mb-4">Veldkoppelingen</h3>
            <!-- Table + add form rendered by renderDetailMappings() -->
            <div id="detailMappingsContainer"></div>
          </div>
        </div>

        <!-- Form fields overview -->
        <div class="card bg-base-100 shadow mb-6">
          <div class="card-body p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-lg">
                <i data-lucide="layout-list" class="w-4 h-4 inline mr-2 -mt-0.5"></i>Formulier velden
              </h3>
              <button class="btn btn-xs btn-outline gap-1" data-action="refresh-form-fields"
                title="Velden opnieuw ophalen van WordPress">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Verversen
              </button>
            </div>
            <div id="detailFormFields"></div>
          </div>
        </div>

        <!-- Submission history (collapsible) -->
        <div class="collapse collapse-arrow bg-base-100 shadow mb-6">
          <input type="checkbox" />
          <div class="collapse-title font-semibold">
            <i data-lucide="clock" class="w-4 h-4 inline mr-2 -mt-0.5"></i>
            Indieningen &amp; geschiedenis
          </div>
          <div class="collapse-content">
            <div id="detailHistory" class="pt-2"></div>
          </div>
        </div>

      </div><!-- /view-detail -->

    </div><!-- /container -->
  </div><!-- /padding-top -->

  <!-- ─── Initialise Lucide icons ──────────────────────────────────────── -->
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    });
  </script>

  <!-- ─── FSV2 public assets (load order is significant — no async/defer) ── -->
  <script src="/field-picker-component.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-html-utils.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-core.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-flow-builder.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-mapping-table.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-wizard.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-detail.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-settings.js?v=${FSV2_ASSET_VERSION}"></script>
  <script src="/forminator-sync-v2-bootstrap.js?v=${FSV2_ASSET_VERSION}"></script>

  <!-- ─── Dialogs ──────────────────────────────────────────────────────────── -->
  <dialog id="addTargetDialog" class="modal">
    <div class="modal-box max-w-lg">
      <h3 class="font-bold text-lg mb-1">Stap toevoegen</h3>
      <p class="text-sm opacity-70 mb-4">Kies welk type stap je wilt toevoegen.</p>
      <div id="addTargetTypeCards" class="grid gap-3">
        <!-- 4 kaarten gegenereerd door renderAddTargetDialog() -->
      </div>
      <div id="addTargetModelRow" class="mt-4" style="display:none">
        <label class="label label-text text-sm">Odoo-model</label>
        <select id="addTargetModelPicker" class="select select-bordered w-full"></select>
      </div>
      <div class="modal-action">
        <button class="btn" data-action="close-add-target-dialog">Annuleren</button>
        <button class="btn btn-primary" id="confirmAddTargetBtn"
                data-action="confirm-add-target" disabled>Toevoegen</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Sluiten</button></form>
  </dialog>

  <dialog id="htmlSummaryModal" class="modal">
    <div class="modal-box max-w-lg">
      <h3 class="font-bold text-lg mb-1">Formuliersamenvatting</h3>
      <p class="text-sm text-base-content/60 mb-4">
        Genereert een HTML-tabel van formuliervelden en schrijft die naar een Odoo-veld.
      </p>
      <div class="form-control mb-4">
        <label class="label"><span class="label-text font-medium">Odoo-veld (type HTML of Text)</span></label>
        <div id="htmlSummaryOdooFieldPicker"></div>
      </div>
      <div class="form-control mb-4">
        <label class="label"><span class="label-text font-medium">Welke formuliervelden?</span></label>
        <label class="flex items-center gap-2 cursor-pointer mb-1">
          <input type="radio" name="htmlSummaryScope" value="all" class="radio radio-sm" checked>
          <span class="text-sm">Alle velden</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="htmlSummaryScope" value="selected" class="radio radio-sm">
          <span class="text-sm">Selecteer velden:</span>
        </label>
        <div id="htmlSummaryFieldChecks"
             class="ml-6 mt-2 grid grid-cols-2 gap-x-4 gap-y-1"
             style="display:none"></div>
      </div>
      <div class="form-control mb-4">
        <label class="label"><span class="label-text font-medium">Voorvertoning</span></label>
        <iframe id="htmlSummaryPreviewFrame"
                sandbox="allow-same-origin"
                style="width:100%;min-height:80px;border:1px solid hsl(var(--b3));border-radius:0.5rem;background:#fff"
                scrolling="no"></iframe>
      </div>
      <div class="modal-action">
        <button class="btn" data-action="close-html-summary-modal">Annuleren</button>
        <button class="btn btn-primary" id="confirmHtmlSummaryBtn"
                data-action="confirm-html-summary" disabled>Toevoegen</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Sluiten</button></form>
  </dialog>

</body>
</html>`;
}
