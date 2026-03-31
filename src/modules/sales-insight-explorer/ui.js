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
        <div class="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 class="text-4xl font-bold mb-2">Sales Insight Explorer</h1>
            <p class="text-base-content/60">Beantwoord je sales vragen met begeleide data-analyse</p>
          </div>
          <a href="/insights/claude" class="btn btn-ghost btn-sm gap-2 shrink-0 mt-1 border border-base-300">
            <i data-lucide="bot" class="w-4 h-4"></i>
            Claude Koppeling
          </a>
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

// â”€â”€â”€ Claude Integration Settings UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Embedded inside the sales-insight module so users don't need a separate page.
// All API calls go to /api/claude/... (claude-integration module).

export function claudeSettingsUI(user, baseUrl = '') {
  const isAdmin = user?.role === 'admin';

  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Koppeling â€“ Sales Insight Explorer</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
  <script>const INSTRUCTIONS_BASE_URL = ${JSON.stringify(baseUrl)};</script>
  ${navbar(user)}

  <div style="padding-top:48px;">
    <div class="container mx-auto px-6 py-8 max-w-5xl">

      <!-- Header -->
      <div class="mb-8 flex items-center gap-4">
        <a href="/insights" class="btn btn-ghost btn-sm gap-1">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Terug
        </a>
        <div>
          <h1 class="text-3xl font-bold flex items-center gap-2">
            <i data-lucide="bot" class="w-8 h-8 text-primary"></i>
            Claude Koppeling
          </h1>
          <p class="text-base-content/60 text-sm mt-0.5">
            Verbind Claude AI met jouw salesdata via een beveiligde short-lived token koppeling.
          </p>
        </div>
      </div>

      <!-- Alert zone -->
      <div id="alertZone" class="mb-4 hidden">
        <div class="alert" id="alertContent"></div>
      </div>

      <!-- Main tabs -->
      <div role="tablist" class="tabs tabs-lifted tabs-lg mb-4">

        <!-- â”€â”€ Tab 1: Mijn koppelingen â”€â”€ -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Mijn Koppelingen" checked />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">

          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold">Mijn Koppelingen</h2>
            <button class="btn btn-primary btn-sm gap-1"
              onclick="document.querySelector('[aria-label=\\'Nieuwe Koppeling\\']').click()">
              <i data-lucide="plus" class="w-4 h-4"></i> Nieuw
            </button>
          </div>

          <div class="alert bg-base-200 border border-base-300 mb-6 text-sm">
            <i data-lucide="info" class="w-5 h-5 shrink-0 text-info"></i>
            <div>
              <p class="font-medium mb-1">Hoe werkt het?</p>
              <ol class="list-decimal list-inside space-y-0.5 text-base-content/70">
                <li>Maak hier een koppeling aan â€” je krijgt een <code class="font-mono">client_id</code> en <code class="font-mono">client_secret</code></li>
                <li>Plak beide in de <strong>Project Instructions</strong> van je Claude-project (via de knop onderaan)</li>
                <li>Claude authenticeert zichzelf automatisch en haalt data op â€” max 5 min per sessie</li>
              </ol>
            </div>
          </div>

          <div id="integrationsList">
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>
          </div>
        </div>

        <!-- â”€â”€ Tab 2: Nieuwe koppeling â”€â”€ -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Nieuwe Koppeling" />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
          <h2 class="text-xl font-bold mb-6">Nieuwe Koppeling Aanmaken</h2>

          <form id="createForm" class="max-w-lg" onsubmit="handleCreate(event)">
            <div class="form-control mb-4">
              <label class="label"><span class="label-text font-medium">Naam</span></label>
              <input type="text" name="name" placeholder="bv. Mijn Claude Sales Assistent"
                class="input input-bordered" required maxlength="100" />
              <label class="label"><span class="label-text-alt text-base-content/50">Herkenbare naam voor jouw eigen overzicht</span></label>
            </div>

            <div class="form-control mb-6">
              <label class="label"><span class="label-text font-medium">Dataset</span></label>
              <div id="templateSelector" class="space-y-2">
                <div class="flex justify-center py-4"><span class="loading loading-spinner loading-sm"></span></div>
              </div>
              <label class="label">
                <span class="label-text-alt text-base-content/50">Selecteer welke data Claude mag zien. Twijfel? Kies de standaard.</span>
              </label>
            </div>

            <button type="submit" id="createBtn" class="btn btn-primary w-full gap-2">
              <i data-lucide="key" class="w-4 h-4"></i> Koppeling aanmaken
            </button>
          </form>

          <!-- Secret reveal (shown once after create) -->
          <div id="secretPanel" class="hidden mt-8 max-w-md">
            <div class="alert alert-success mb-4 text-sm">
              <i data-lucide="check-circle" class="w-5 h-5"></i>
              <div>
                <p class="font-medium">Koppeling aangemaakt!</p>
                <p>Bewaar het secret <strong>nu direct</strong> â€” het is daarna niet meer te zien.</p>
              </div>
            </div>

            <div class="card bg-base-200 border border-success/30">
              <div class="card-body p-4 gap-3">
                <div>
                  <p class="text-xs text-base-content/50 uppercase font-medium tracking-wide mb-1">Client ID</p>
                  <div class="flex items-center gap-2">
                    <code id="revealClientId" class="font-mono text-sm bg-base-100 px-2 py-1.5 rounded flex-1 break-all select-all"></code>
                    <button class="btn btn-ghost btn-xs" onclick="copyVal('revealClientId')">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                    </button>
                  </div>
                </div>
                <div>
                  <p class="text-xs text-base-content/50 uppercase font-medium tracking-wide mb-1">
                    Client Secret <span class="text-error normal-case">(eenmalig zichtbaar)</span>
                  </p>
                  <div class="flex items-center gap-2">
                    <code id="revealSecret" class="font-mono text-sm bg-warning/10 border border-warning/30 px-2 py-1.5 rounded flex-1 break-all select-all"></code>
                    <button class="btn btn-ghost btn-xs" onclick="copyVal('revealSecret')">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                    </button>
                  </div>
                </div>
                <div class="pt-2">
                  <button class="btn btn-outline btn-sm w-full gap-2" onclick="openInstructions()">
                    <i data-lucide="clipboard-copy" class="w-4 h-4"></i>
                    Kopieer Claude Project Instructies
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- â”€â”€ Tab 3: Gebruik Log â”€â”€ -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Gebruik Log" />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="text-xl font-bold">Gebruik Log</h2>
              <p class="text-sm text-base-content/50">Elke context-aanvraag door Claude wordt hier gelogd.</p>
            </div>
            <button class="btn btn-ghost btn-sm gap-1" onclick="loadAudit()">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Laden
            </button>
          </div>
          <div id="auditList">
            <div class="text-center py-8 text-base-content/30 text-sm">Klik op "Laden" om de log te tonen.</div>
          </div>
        </div>

        ${isAdmin ? `
        <!-- â”€â”€ Tab 4: Datasets (admin only) â”€â”€ -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Datasets" />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h2 class="text-xl font-bold">Dataset Templates</h2>
              <p class="text-sm text-base-content/50">Bepaal welke Odoo-data Claude per model ontvangt.</p>
            </div>
            <button class="btn btn-primary btn-sm gap-1" onclick="openDatasetWizard()">
              <i data-lucide="plus" class="w-4 h-4"></i> Nieuw template
            </button>
          </div>
          <div id="datasetTemplateList">
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>
          </div>
        </div>
        ` : ''}

      </div><!-- /tabs -->

    </div>
  </div>

  <!-- â”€â”€ Test modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
  <dialog id="testModal" class="modal">
    <div class="modal-box max-w-sm">
      <h3 class="font-bold text-lg mb-1">Koppeling Testen</h3>
      <p class="text-sm text-base-content/60 mb-4">
        Voer het secret in om de volledige auth-flow te testen. Het wordt niet opgeslagen.
      </p>
      <div class="form-control mb-4">
        <label class="label"><span class="label-text">Client Secret</span></label>
        <input type="password" id="testSecret" class="input input-bordered input-sm font-mono"
          placeholder="sk-..." autocomplete="off" />
      </div>
      <ul id="testSteps" class="steps steps-vertical w-full text-sm mb-4 hidden">
        <li class="step" id="tstep1">Challenge aanvragen</li>
        <li class="step" id="tstep2">Autoriseren</li>
        <li class="step" id="tstep3">Context ophalen</li>
      </ul>
      <div id="testResult" class="hidden mb-2"></div>
      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('testModal').close()">Sluiten</button>
        <button id="testRunBtn" class="btn btn-primary btn-sm gap-1" onclick="runTest()">
          <i data-lucide="play" class="w-4 h-4"></i> Testen
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- â”€â”€ Rotate modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
  <dialog id="rotateModal" class="modal">
    <div class="modal-box max-w-sm">
      <h3 class="font-bold text-lg mb-1">Secret Regenereren</h3>
      <p class="text-sm text-base-content/60 mb-4">
        Het huidige secret wordt direct ongeldig. Alle actieve Claude-sessies stoppen.
        Werk nadien je Claude Project Instructions bij.
      </p>
      <div id="rotateNewSecret" class="hidden card bg-base-200 p-3 mb-4">
        <p class="text-xs text-base-content/50 uppercase font-medium mb-1">Nieuw Secret <span class="text-error">(eenmalig)</span></p>
        <div class="flex items-center gap-2">
          <code id="newSecretVal" class="font-mono text-sm break-all flex-1 select-all"></code>
          <button class="btn btn-ghost btn-xs" onclick="copyVal('newSecretVal')"><i data-lucide="copy" class="w-3 h-3"></i></button>
        </div>
        <div class="pt-2">
          <button class="btn btn-outline btn-sm w-full gap-2" onclick="openInstructionsAfterRotate()">
            <i data-lucide="clipboard-copy" class="w-4 h-4"></i>
            Kopieer Project Instructies
          </button>
        </div>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rotateModal').close()">Sluiten</button>
        <button id="rotateBtn" class="btn btn-warning btn-sm gap-1">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Regenereer
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <!-- â”€â”€ Instructions modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
  <dialog id="instructionsModal" class="modal">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-1 flex items-center gap-2">
        <i data-lucide="bot" class="w-5 h-5"></i> Claude Project Instructies
      </h3>
      <p class="text-sm text-base-content/60 mb-3">
        Kopieer dit naar <strong>Project Instructions</strong> in je Claude-project.<br/>
        Na aanmaken of regenereren worden Client ID en Secret automatisch ingevuld.
      </p>
      <div class="relative">
        <textarea id="instructionsText" class="textarea textarea-bordered font-mono text-xs w-full" rows="20" readonly></textarea>
        <button class="btn btn-ghost btn-xs absolute top-2 right-2 gap-1" onclick="copyVal('instructionsText')">
          <i data-lucide="copy" class="w-3 h-3"></i> KopiÃ«ren
        </button>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('instructionsModal').close()">Sluiten</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  ${isAdmin ? `
  <!-- â”€â”€ Dataset wizard modal (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
  <dialog id="datasetWizardModal" class="modal">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
        <i data-lucide="database" class="w-5 h-5"></i>
        <span id="wizardTitle">Nieuw Dataset Template</span>
      </h3>

      <!-- Step indicator -->
      <ul class="steps steps-horizontal w-full mb-6 text-xs">
        <li class="step" id="wstep0">Basisinfo</li>
        <li class="step" id="wstep1">Model</li>
        <li class="step" id="wstep2">Velden</li>
      </ul>

      <!-- Step 0: name + description -->
      <div id="wizardStep0">
        <div class="form-control mb-4">
          <label class="label"><span class="label-text font-medium">Naam *</span></label>
          <input type="text" id="wizardName" class="input input-bordered" placeholder="bv. Actiebladen 2025" maxlength="100" />
        </div>
        <div class="form-control mb-4">
          <label class="label"><span class="label-text font-medium">Omschrijving</span></label>
          <textarea id="wizardDesc" class="textarea textarea-bordered" rows="2"
            placeholder="Optionele toelichting voor gebruikers"></textarea>
        </div>
        <div class="form-control mb-4">
          <label class="label"><span class="label-text font-medium">Primair Odoo-model</span></label>
          <input type="text" id="wizardModel" class="input input-bordered font-mono" placeholder="x_sales_action_sheet" value="x_sales_action_sheet" />
          <label class="label"><span class="label-text-alt text-base-content/50">Technische modelnaam, bijv. crm.lead of x_sales_action_sheet</span></label>
        </div>
      </div>

      <!-- Step 1: model confirmation + field loader -->
      <div id="wizardStep1" class="hidden">
        <p class="text-sm mb-3">Model: <code id="wizardModelPreview" class="font-mono bg-base-200 px-1.5 py-0.5 rounded"></code></p>
        <div id="wizardFieldsLoader" class="flex justify-center py-8">
          <span class="loading loading-spinner loading-md"></span>
        </div>
      </div>

      <!-- Step 2: field picker -->
      <div id="wizardStep2" class="hidden">
        <p class="text-sm text-base-content/60 mb-3">Selecteer de velden die Claude mag zien en geef optioneel een alias of instructie op.</p>
        <div id="wizardFieldList" class="space-y-1 max-h-96 overflow-y-auto pr-1"></div>
      </div>

      <div id="wizardError" class="alert alert-error text-sm mt-3 hidden"></div>

      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('datasetWizardModal').close()">Annuleren</button>
        <button id="wizardPrevBtn" class="btn btn-ghost btn-sm hidden" onclick="wizardPrev()">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Vorige
        </button>
        <button id="wizardNextBtn" class="btn btn-primary btn-sm" onclick="wizardNext()">
          Volgende <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
        <button id="wizardSaveBtn" class="btn btn-success btn-sm hidden" onclick="wizardSave()">
          <i data-lucide="save" class="w-4 h-4"></i> Opslaan
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>
  ` : ''}

  <script>
    // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let integrations = [];
    let templates = [];
    let testClientId = null;
    let rotateIntegrationId = null;
    let rotateClientId = null;
    let rotateSecret = null;
    let lastCreatedClientId = null;
    let lastCreatedSecret = null;
    // wizard state
    let wizardStep = 0;
    let wizardOdooFields = {};

    // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function showAlert(msg, type = 'info') {
      const z = document.getElementById('alertZone');
      const c = document.getElementById('alertContent');
      const cls = { success: 'alert-success', error: 'alert-error', warning: 'alert-warning', info: 'alert-info' }[type] ?? 'alert-info';
      c.className = 'alert ' + cls;
      c.innerHTML = msg;
      z.classList.remove('hidden');
      setTimeout(() => z.classList.add('hidden'), 5000);
    }

    async function apiFetch(path, opts = {}) {
      const r = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
        credentials: 'include',
        ...opts
      });
      return r.json();
    }

    function copyVal(elId) {
      const el = document.getElementById(elId);
      navigator.clipboard.writeText((el.value ?? el.textContent).trim())
        .then(() => showAlert('<span>Gekopieerd!</span>', 'success'));
    }

    function fmtDate(iso) {
      if (!iso) return 'â€“';
      return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // â”€â”€ Load templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function loadTemplates() {
      const res = await apiFetch('/insights/api/sales-insights/dataset-templates');
      if (res.success) {
        templates = res.data ?? [];
      }
      renderTemplateSelector();
    }

    function renderTemplateSelector() {
      const el = document.getElementById('templateSelector');
      if (!el) return;
      if (!templates.length) {
        el.innerHTML = '<p class="text-sm text-base-content/40">Geen templates beschikbaar. Vraag een admin om een template aan te maken.</p>';
        return;
      }
      el.innerHTML = templates.map(t => \`
        <label class="flex items-start gap-3 p-3 border border-base-300 rounded-box cursor-pointer hover:bg-base-200 has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
          <input type="radio" name="dataset_template_id" value="\${t.id}" class="radio radio-sm radio-primary mt-0.5"
            \${t.is_default ? 'checked' : ''} required />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 font-medium text-sm">
              \${t.name}
              \${t.is_default ? '<span class="badge badge-primary badge-xs">standaard</span>' : ''}
            </div>
            \${t.description ? '<p class="text-xs text-base-content/50 mt-0.5">' + t.description + '</p>' : ''}
          </div>
        </label>\`).join('');
    }

    // â”€â”€ Load integrations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function loadIntegrations() {
      const el = document.getElementById('integrationsList');
      el.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>';
      const res = await apiFetch('/api/claude/integrations');
      if (!res.success) {
        el.innerHTML = '<div class="alert alert-error text-sm">' + (res.error?.message ?? 'Laden mislukt') + '</div>';
        return;
      }
      integrations = res.data ?? [];
      renderIntegrations();
    }

    function templateName(templateId) {
      if (!templateId) return null;
      const t = templates.find(t => t.id === templateId);
      return t?.name ?? null;
    }

    function renderIntegrations() {
      const el = document.getElementById('integrationsList');
      if (!integrations.length) {
        el.innerHTML = \`<div class="text-center py-12 text-base-content/40">
          <i data-lucide="bot" class="w-12 h-12 mx-auto mb-3 opacity-20"></i>
          <p class="font-medium">Nog geen koppelingen</p>
          <p class="text-sm mt-1">Maak je eerste koppeling aan via het tabblad "Nieuwe Koppeling".</p>
        </div>\`;
        lucide.createIcons();
        return;
      }

      const rows = integrations.map(i => {
        const active = i.is_active;
        const tName = templateName(i.dataset_template_id);
        return \`<div class="card bg-base-50 border border-base-300 mb-3">
          <div class="card-body p-4">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold">\${i.name ?? ''}</span>
                  \${active ? '<span class="badge badge-success badge-xs">Actief</span>' : '<span class="badge badge-error badge-xs">Ingetrokken</span>'}
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/50">
                  <code class="font-mono bg-base-200 px-1.5 py-0.5 rounded">\${i.client_id ?? ''}</code>
                  <span>Â·</span>
                  <span>Aangemaakt: \${fmtDate(i.created_at)}</span>
                  \${i.revoked_at ? '<span>Â· Ingetrokken: ' + fmtDate(i.revoked_at) + '</span>' : ''}
                </div>
                \${tName ? '<div class="mt-1"><span class="badge badge-ghost badge-xs font-mono">' + tName + '</span></div>' : ''}
              </div>
              \${active ? \`<div class="flex gap-1 shrink-0">
                <button class="btn btn-ghost btn-xs gap-1" onclick="openTest('\${i.client_id}')" title="Test koppeling">
                  <i data-lucide="play" class="w-3 h-3"></i> Test
                </button>
                <button class="btn btn-ghost btn-xs gap-1" onclick="openInstructionsFor('\${i.client_id}')" title="Kopieer Claude instructies">
                  <i data-lucide="clipboard-copy" class="w-3 h-3"></i>
                </button>
                <button class="btn btn-ghost btn-xs gap-1" onclick="openRotate('\${i.id}')" title="Regenereer secret">
                  <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                </button>
                <button class="btn btn-ghost btn-xs text-error gap-1" onclick="revokeIntegration('\${i.id}')" title="Intrekken">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
              </div>\` : ''}
            </div>
          </div>
        </div>\`;
      }).join('');

      el.innerHTML = rows;
      lucide.createIcons();
    }

    // â”€â”€ Create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function handleCreate(e) {
      e.preventDefault();
      const form = e.target;
      const name = form.name.value.trim();
      const templateRadio = form.querySelector('input[name=dataset_template_id]:checked');
      const dataset_template_id = templateRadio?.value ?? null;

      if (!name) return showAlert('<span>Voer een naam in</span>', 'warning');

      const btn = document.getElementById('createBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Aanmaken...';

      const res = await apiFetch('/api/claude/integrations', {
        method: 'POST',
        body: JSON.stringify({ name, dataset_template_id })
      });

      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="key" class="w-4 h-4"></i> Koppeling aanmaken';
      lucide.createIcons();

      if (!res.success) {
        showAlert('<span>' + (res.error?.message ?? 'Aanmaken mislukt') + '</span>', 'error');
        return;
      }

      lastCreatedClientId = res.data.integration.client_id;
      lastCreatedSecret   = res.data.client_secret;

      document.getElementById('revealClientId').textContent = lastCreatedClientId;
      document.getElementById('revealSecret').textContent   = lastCreatedSecret;
      document.getElementById('secretPanel').classList.remove('hidden');
      form.reset();
      renderTemplateSelector(); // re-render to restore default selection
      showAlert('<span>âœ… Koppeling aangemaakt â€” bewaar het secret hieronder!</span>', 'success');
      loadIntegrations();
    }

    // â”€â”€ Revoke â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function revokeIntegration(id) {
      if (!confirm('Koppeling intrekken? Alle actieve Claude-sessies stoppen direct.')) return;
      const res = await apiFetch('/api/claude/integrations/' + id, { method: 'DELETE' });
      if (res.success) {
        showAlert('<span>Koppeling ingetrokken</span>', 'success');
        loadIntegrations();
      } else {
        showAlert('<span>' + (res.error?.message ?? 'Intrekken mislukt') + '</span>', 'error');
      }
    }

    // â”€â”€ Rotate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function openRotate(id) {
      rotateIntegrationId = id;
      rotateClientId = null;
      rotateSecret = null;
      document.getElementById('rotateNewSecret').classList.add('hidden');
      document.getElementById('newSecretVal').textContent = '';
      const btn = document.getElementById('rotateBtn');
      btn.disabled = false;
      btn.onclick = confirmRotate;
      document.getElementById('rotateModal').showModal();
    }

    async function confirmRotate() {
      if (!rotateIntegrationId) return;
      const btn = document.getElementById('rotateBtn');
      btn.disabled = true;
      const res = await apiFetch('/api/claude/integrations/' + rotateIntegrationId + '/rotate', { method: 'POST' });
      btn.disabled = false;
      if (res.success) {
        rotateClientId = res.data.integration?.client_id ?? null;
        rotateSecret = res.data.client_secret;
        document.getElementById('newSecretVal').textContent = rotateSecret;
        document.getElementById('rotateNewSecret').classList.remove('hidden');
        lucide.createIcons();
        loadIntegrations();
      } else {
        showAlert('<span>' + (res.error?.message ?? 'Regenereren mislukt') + '</span>', 'error');
        document.getElementById('rotateModal').close();
      }
    }

    // â”€â”€ Test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function openTest(clientId) {
      testClientId = clientId;
      document.getElementById('testSecret').value = '';
      document.getElementById('testSteps').classList.add('hidden');
      document.getElementById('testResult').classList.add('hidden');
      document.getElementById('testRunBtn').disabled = false;
      ['tstep1','tstep2','tstep3'].forEach(s => document.getElementById(s).className = 'step');
      document.getElementById('testModal').showModal();
    }

    function setStep(id, state) {
      document.getElementById(id).className = { done: 'step step-primary', error: 'step step-error' }[state] ?? 'step';
    }

    async function runTest() {
      const secret = document.getElementById('testSecret').value.trim();
      if (!secret) return showAlert('<span>Voer het secret in</span>', 'warning');
      document.getElementById('testRunBtn').disabled = true;
      document.getElementById('testSteps').classList.remove('hidden');
      document.getElementById('testResult').classList.add('hidden');

      try {
        const r1 = await apiFetch('/api/claude/session/request', {
          method: 'POST', body: JSON.stringify({ client_id: testClientId })
        });
        if (!r1.success) throw new Error(r1.error?.message ?? 'Stap 1 mislukt');
        setStep('tstep1', 'done');

        const r2 = await apiFetch('/api/claude/session/authorize', {
          method: 'POST',
          body: JSON.stringify({ client_id: testClientId, client_secret: secret, challenge_id: r1.data.challenge_id })
        });
        if (!r2.success) throw new Error(r2.error?.message ?? 'Stap 2 mislukt');
        setStep('tstep2', 'done');

        const r3 = await fetch('/api/claude/context/full?limit=3', {
          headers: { 'Authorization': 'Bearer ' + r2.data.access_token }
        });
        const ctx = await r3.json();
        if (!ctx.success) throw new Error(ctx.error?.message ?? 'Stap 3 mislukt');
        setStep('tstep3', 'done');

        const m = ctx.data?.meta ?? {};
        const firstKey = Object.keys(ctx.data ?? {}).find(k => k !== 'meta' && k !== 'schema');
        const firstRecord = firstKey ? ctx.data[firstKey]?.[0] : null;
        document.getElementById('testResult').innerHTML =
          '<div class="alert alert-success text-sm">' +
          '<i data-lucide="check-circle" class="w-4 h-4"></i>' +
          '<div><p class="font-medium">âœ… Koppeling werkt correct</p>' +
          '<p>Template: <code class="font-mono">' + (m.template_name ?? '?') + '</code></p>' +
          '<p>Records: ' + JSON.stringify(m.record_counts ?? {}) + '</p>' +
          '<p>Token geldig tot: ' + new Date(r2.data.expires_at).toLocaleTimeString('nl-BE') + '</p>' +
          '</div></div>';
        document.getElementById('testResult').classList.remove('hidden');
        lucide.createIcons();
      } catch (err) {
        ['tstep1','tstep2','tstep3'].forEach(s => {
          if (document.getElementById(s).className.includes('step') && !document.getElementById(s).className.includes('primary')) {
            setStep(s, 'error');
          }
        });
        document.getElementById('testResult').innerHTML =
          '<div class="alert alert-error text-sm"><span>âŒ ' + err.message + '</span></div>';
        document.getElementById('testResult').classList.remove('hidden');
      }
      document.getElementById('testRunBtn').disabled = false;
    }

    // â”€â”€ Instructions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function buildInstructionsText(clientId, secret) {
      const base = INSTRUCTIONS_BASE_URL || window.location.origin;
      const cid = clientId ?? '{CLIENT_ID}';
      const sec = secret ?? '{YOUR_CLIENT_SECRET}';
      const fetchUrl = \`\${base}/api/claude/context/full?client_id=\${cid}&client_secret=\${sec}&timeframe=month&limit=50\`;
      return \`## Salesdata ophalen â€” OpenVME

Bij elke vraag over salesdata, pipeline of leads:
1. Gebruik web_fetch (GET) op deze URL:
   \${fetchUrl}
2. Verwerk de JSON response â€” dump nooit ruwe JSON.
3. Verzin nooit data. Gebruik altijd de live data.
4. Toon nooit client_id of client_secret aan de gebruiker.

### Structuur van de context
{
  "meta": { "generated_at", "template_name", "timeframe", "record_counts": {} },
  // Dynamische keys per dataset-template, bijv.:
  "primary": [ { ... } ],
  "schema": { "primary": { "fieldName": { "alias": "...", "instruction": "..." } } }
}\`;
    }

    async function openInstructions() {
      let text;
      if (lastCreatedClientId) {
        const res = await apiFetch('/insights/api/sales-insights/claude-instructions?client_id=' + lastCreatedClientId);
        if (res.success) {
          text = lastCreatedSecret
            ? res.data.instructions.replace('{YOUR_CLIENT_SECRET}', lastCreatedSecret)
            : res.data.instructions;
        } else {
          text = buildInstructionsText(lastCreatedClientId, lastCreatedSecret);
        }
      } else {
        text = buildInstructionsText(null, null);
      }
      document.getElementById('instructionsText').value = text;
      document.getElementById('instructionsModal').showModal();
    }

    async function openInstructionsFor(clientId) {
      const res = await apiFetch('/insights/api/sales-insights/claude-instructions?client_id=' + clientId);
      if (!res.success) {
        showAlert('<span>' + (res.error?.message ?? 'Instructies ophalen mislukt') + '</span>', 'error');
        return;
      }
      document.getElementById('instructionsText').value = res.data.instructions;
      document.getElementById('instructionsModal').showModal();
    }

    async function openInstructionsAfterRotate() {
      if (!rotateClientId) return;
      document.getElementById('rotateModal').close();
      const res = await apiFetch('/insights/api/sales-insights/claude-instructions?client_id=' + rotateClientId);
      let text;
      if (res.success) {
        text = rotateSecret
          ? res.data.instructions.replace('{YOUR_CLIENT_SECRET}', rotateSecret)
          : res.data.instructions;
      } else {
        text = buildInstructionsText(rotateClientId, rotateSecret);
      }
      document.getElementById('instructionsText').value = text;
      document.getElementById('instructionsModal').showModal();
    }

    // â”€â”€ Audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function loadAudit() {
      const el = document.getElementById('auditList');
      el.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>';
      const res = await apiFetch('/api/claude/audit');
      if (!res.success) {
        el.innerHTML = '<div class="alert alert-error text-sm">' + (res.error?.message ?? 'Laden mislukt') + '</div>';
        return;
      }
      const entries = res.data?.entries ?? [];
      if (!entries.length) {
        el.innerHTML = '<p class="text-center py-8 text-base-content/30 text-sm">Nog geen entries.</p>';
        return;
      }
      el.innerHTML = '<div class="overflow-x-auto"><table class="table table-xs"><thead><tr>'
        + '<th>Tijdstip</th><th>Template</th><th>Status</th><th>Grootte</th><th>IP</th></tr></thead><tbody>'
        + entries.map(e => '<tr>'
          + '<td class="font-mono text-xs">' + fmtDate(e.timestamp) + '</td>'
          + '<td><span class="badge badge-ghost badge-xs font-mono">' + (e.scope ?? 'â€“') + '</span></td>'
          + '<td>' + (e.success ? '<span class="badge badge-success badge-xs">OK</span>' : '<span class="badge badge-error badge-xs" title="' + (e.failure_reason ?? '') + '">FOUT</span>') + '</td>'
          + '<td class="text-xs">' + (e.payload_size ? Math.round(e.payload_size / 1024) + ' KB' : 'â€“') + '</td>'
          + '<td class="text-xs text-base-content/40">' + (e.ip_address ?? 'â€“') + '</td>'
          + '</tr>').join('')
        + '</tbody></table></div>'
        + '<p class="text-xs text-base-content/40 mt-2">Totaal: ' + (res.data?.total ?? entries.length) + ' entries</p>';
    }

    ${isAdmin ? `
    // â”€â”€ Dataset template management (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async function loadDatasetTemplates() {
      const el = document.getElementById('datasetTemplateList');
      if (!el) return;
      el.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>';
      const res = await apiFetch('/insights/api/sales-insights/dataset-templates');
      if (!res.success) {
        el.innerHTML = '<div class="alert alert-error text-sm">' + (res.error?.message ?? 'Laden mislukt') + '</div>';
        return;
      }
      const list = res.data ?? [];
      // Also refresh templates for the selector
      templates = list.filter(t => t.is_active);
      renderTemplateSelector();

      if (!list.length) {
        el.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm">Nog geen templates. Maak er een aan.</div>';
        return;
      }
      el.innerHTML = list.map(t => \`
        <div class="card bg-base-50 border border-base-300 mb-3">
          <div class="card-body p-4">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold">\${t.name}</span>
                  \${t.is_default ? '<span class="badge badge-primary badge-xs">standaard</span>' : ''}
                  \${t.is_active ? '<span class="badge badge-success badge-xs">Actief</span>' : '<span class="badge badge-warning badge-xs">Inactief</span>'}
                </div>
                \${t.description ? '<p class="text-xs text-base-content/50">' + t.description + '</p>' : ''}
                <p class="text-xs text-base-content/40 mt-1">
                  \${(t.model_config ?? []).length} model(len) Â·
                  Aangemaakt: \${fmtDate(t.created_at)}
                </p>
              </div>
              <div class="flex gap-1 shrink-0">
                \${t.is_active && !t.is_default ? '<button class="btn btn-ghost btn-xs" onclick="setDefaultTemplate(\\''+t.id+'\\')"><i data-lucide=\\"star\\" class=\\"w-3 h-3\\"></i> Standaard</button>' : ''}
                \${t.is_active ? '<button class="btn btn-ghost btn-xs text-error" onclick="deactivateTemplate(\\''+t.id+'\\')"><i data-lucide=\\"trash-2\\" class=\\"w-3 h-3\\"></i></button>' : ''}
              </div>
            </div>
          </div>
        </div>\`).join('');
      lucide.createIcons();
    }

    async function setDefaultTemplate(id) {
      const res = await apiFetch('/insights/api/sales-insights/dataset-templates/' + id + '/set-default', { method: 'POST' });
      if (res.success) { showAlert('<span>Standaard template ingesteld</span>', 'success'); loadDatasetTemplates(); }
      else showAlert('<span>' + (res.error?.message ?? 'Mislukt') + '</span>', 'error');
    }

    async function deactivateTemplate(id) {
      if (!confirm('Template deactiveren? Bestaande koppelingen met dit template blijven werken tot ze opnieuw worden aangemaakt.')) return;
      const res = await apiFetch('/insights/api/sales-insights/dataset-templates/' + id, { method: 'DELETE' });
      if (res.success) { showAlert('<span>Template gedeactiveerd</span>', 'success'); loadDatasetTemplates(); }
      else showAlert('<span>' + (res.error?.message ?? 'Mislukt') + '</span>', 'error');
    }

    // â”€â”€ Dataset wizard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function openDatasetWizard() {
      wizardStep = 0;
      wizardOdooFields = {};
      document.getElementById('wizardName').value = '';
      document.getElementById('wizardDesc').value = '';
      document.getElementById('wizardModel').value = 'x_sales_action_sheet';
      document.getElementById('wizardError').classList.add('hidden');
      showWizardStep(0);
      document.getElementById('datasetWizardModal').showModal();
    }

    function showWizardStep(step) {
      wizardStep = step;
      [0,1,2].forEach(i => {
        document.getElementById('wizardStep'+i)?.classList.toggle('hidden', i !== step);
        document.getElementById('wstep'+i).className = 'step' + (i <= step ? ' step-primary' : '');
      });
      document.getElementById('wizardPrevBtn').classList.toggle('hidden', step === 0);
      document.getElementById('wizardNextBtn').classList.toggle('hidden', step === 2);
      document.getElementById('wizardSaveBtn').classList.toggle('hidden', step !== 2);
      lucide.createIcons();
    }

    function wizardPrev() { if (wizardStep > 0) showWizardStep(wizardStep - 1); }

    async function wizardNext() {
      document.getElementById('wizardError').classList.add('hidden');
      if (wizardStep === 0) {
        const name = document.getElementById('wizardName').value.trim();
        const model = document.getElementById('wizardModel').value.trim();
        if (!name) { showWizardError('Voer een naam in'); return; }
        if (!model) { showWizardError('Voer een modelnaam in'); return; }
        // Load fields for step 1
        document.getElementById('wizardModelPreview').textContent = model;
        document.getElementById('wizardFieldsLoader').classList.remove('hidden');
        document.getElementById('wizardStep2').classList.add('hidden');
        showWizardStep(1);
        const res = await apiFetch('/insights/api/sales-insights/dataset-templates/model-fields?model=' + encodeURIComponent(model));
        document.getElementById('wizardFieldsLoader').classList.add('hidden');
        if (!res.success) { showWizardError(res.error?.message ?? 'Velden laden mislukt'); return; }
        wizardOdooFields = res.data ?? {};
        renderWizardFields();
        showWizardStep(2);
      }
    }

    function showWizardError(msg) {
      const el = document.getElementById('wizardError');
      el.textContent = msg;
      el.classList.remove('hidden');
    }

    function renderWizardFields() {
      const container = document.getElementById('wizardFieldList');
      const entries = Object.entries(wizardOdooFields).slice(0, 200);
      if (!entries.length) { container.innerHTML = '<p class="text-sm text-base-content/40">Geen velden gevonden.</p>'; return; }
      container.innerHTML = entries.map(([fname, fmeta]) => \`
        <label class="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-base-200 cursor-pointer group">
          <input type="checkbox" class="checkbox checkbox-xs" data-field="\${fname}" />
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium mr-1">\${fmeta.string ?? fname}</span>
            <code class="text-xs text-base-content/40 font-mono">\${fname}</code>
            <span class="badge badge-ghost badge-xs ml-1">\${fmeta.type ?? ''}</span>
          </div>
          <input type="text" class="input input-xs input-ghost w-28 hidden group-has-[:checked]:block"
            placeholder="alias" data-alias="\${fname}" />
        </label>\`).join('');
    }

    async function wizardSave() {
      const name = document.getElementById('wizardName').value.trim();
      const description = document.getElementById('wizardDesc').value.trim() || null;
      const model = document.getElementById('wizardModel').value.trim();

      const checked = [...document.querySelectorAll('#wizardFieldList input[type=checkbox]:checked')];
      const fields = checked.map(cb => {
        const fname = cb.dataset.field;
        const aliasEl = document.querySelector('input[data-alias="' + fname + '"]');
        const alias = aliasEl?.value?.trim() || (wizardOdooFields[fname]?.string ?? fname);
        return { name: fname, alias, include_in_output: true };
      });

      const model_config = [{
        key: 'primary',
        model,
        is_primary: true,
        fields,
        domain: [],
        order: 'id desc',
        limit: 50
      }];

      const btn = document.getElementById('wizardSaveBtn');
      btn.disabled = true;
      const res = await apiFetch('/insights/api/sales-insights/dataset-templates', {
        method: 'POST',
        body: JSON.stringify({ name, description, model_config })
      });
      btn.disabled = false;
      if (res.success) {
        document.getElementById('datasetWizardModal').close();
        showAlert('<span>âœ… Template aangemaakt</span>', 'success');
        loadDatasetTemplates();
      } else {
        showWizardError(res.error?.message ?? 'Opslaan mislukt');
      }
    }
    ` : ''}

    // â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
      loadTemplates();
      loadIntegrations();
      ${isAdmin ? 'loadDatasetTemplates();' : ''}
    });
  </script>
</body>
</html>`;
}
