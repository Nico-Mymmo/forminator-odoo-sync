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

// ─── Claude Integration Settings UI ─────────────────────────────────────────
// Embedded inside the sales-insight module so users don't need a separate page.
// All API calls go to /api/claude/... (claude-integration module).

const SCOPE_META = {
  own_leads:    { label: 'Eigen leads',       desc: 'Alleen jouw leads, minimale velden (geen contactinfo)', color: 'badge-info' },
  team_view:    { label: 'Team overzicht',    desc: 'Alle teamleads + eigenaar/team-ID',                     color: 'badge-accent' },
  full_context: { label: 'Volledige context', desc: 'Volledige pipeline incl. relaties en prioriteit',        color: 'badge-primary' }
};

const SCOPE_ALLOWLIST = {
  own_leads:    ['id','name','stage_id','planned_revenue','create_date','date_deadline','kanban_state','probability','active'],
  team_view:    ['id','name','stage_id','planned_revenue','create_date','date_deadline','kanban_state','probability','active','user_id','team_id'],
  full_context: ['id','name','stage_id','planned_revenue','create_date','date_deadline','kanban_state','probability','active','user_id','team_id','tag_ids','partner_id','priority','type','write_date']
};

function renderScopePreviews() {
  return Object.entries(SCOPE_META).map(([scope, meta]) => `
    <div class="collapse collapse-arrow bg-base-200 mb-1">
      <input type="checkbox" />
      <div class="collapse-title font-medium flex items-center gap-2 text-sm">
        <span class="badge badge-sm ${meta.color}">${scope}</span>
        ${meta.label}
      </div>
      <div class="collapse-content">
        <p class="text-xs text-base-content/60 mb-2">${meta.desc}</p>
        <div class="flex flex-wrap gap-1">
          ${SCOPE_ALLOWLIST[scope].map(f => `<span class="badge badge-ghost badge-xs font-mono">${f}</span>`).join('')}
        </div>
      </div>
    </div>`).join('');
}

export function claudeSettingsUI(user, baseUrl = '') {
  const scopeCheckboxes = Object.entries(SCOPE_META).map(([scope, meta]) => `
    <label class="label cursor-pointer gap-3 justify-start py-2 border-b border-base-200 last:border-0">
      <input type="checkbox" class="checkbox checkbox-sm" name="scopes" value="${scope}" />
      <span class="label-text flex flex-col gap-0.5">
        <span class="font-medium flex items-center gap-1">
          <span class="badge badge-xs ${meta.color}">${scope}</span>
          ${meta.label}
        </span>
        <span class="text-xs text-base-content/50">${meta.desc}</span>
      </span>
    </label>`).join('');

  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Koppeling – Sales Insight Explorer</title>
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

        <!-- ── Tab 1: Mijn koppelingen ── -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Mijn Koppelingen" checked />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">

          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold">Mijn Koppelingen</h2>
            <button class="btn btn-primary btn-sm gap-1"
              onclick="document.querySelector('[aria-label=\\'Nieuwe Koppeling\\']').click()">
              <i data-lucide="plus" class="w-4 h-4"></i> Nieuw
            </button>
          </div>

          <!-- How it works callout -->
          <div class="alert bg-base-200 border border-base-300 mb-6 text-sm">
            <i data-lucide="info" class="w-5 h-5 shrink-0 text-info"></i>
            <div>
              <p class="font-medium mb-1">Hoe werkt het?</p>
              <ol class="list-decimal list-inside space-y-0.5 text-base-content/70">
                <li>Maak hier een koppeling aan — je krijgt een <code class="font-mono">client_id</code> en <code class="font-mono">client_secret</code></li>
                <li>Plak beide in de <strong>Project Instructions</strong> van je Claude-project (via de knop onderaan)</li>
                <li>Claude authenticeert zichzelf automatisch en haalt data op — max 5 min per sessie</li>
              </ol>
            </div>
          </div>

          <div id="integrationsList">
            <div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>
          </div>
        </div>

        <!-- ── Tab 2: Nieuwe koppeling ── -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Nieuwe Koppeling" />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
          <h2 class="text-xl font-bold mb-6">Nieuwe Koppeling Aanmaken</h2>

          <form id="createForm" class="max-w-md" onsubmit="handleCreate(event)">
            <div class="form-control mb-4">
              <label class="label"><span class="label-text font-medium">Naam</span></label>
              <input type="text" name="name" placeholder="bv. Mijn Claude Sales Assistent"
                class="input input-bordered" required maxlength="100" />
              <label class="label"><span class="label-text-alt text-base-content/50">Herkenbare naam voor jouw eigen overzicht</span></label>
            </div>

            <div class="form-control mb-6">
              <label class="label"><span class="label-text font-medium">Welke data mag Claude zien?</span></label>
              <div class="border border-base-300 rounded-box bg-base-50">
                ${scopeCheckboxes}
              </div>
              <label class="label">
                <span class="label-text-alt text-warning">Selecteer minstens één scope. Twijfel? Kies 'Eigen leads'.</span>
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
                <p>Bewaar het secret <strong>nu direct</strong> — het is daarna niet meer te zien.</p>
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

        <!-- ── Tab 3: Welke data ziet Claude ── -->
        <input type="radio" name="claude_tabs" role="tab" class="tab" aria-label="Wat ziet Claude" />
        <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
          <h2 class="text-xl font-bold mb-2">Welke data ziet Claude?</h2>
          <p class="text-base-content/60 text-sm mb-4">
            Velden worden gefilterd via een allowlist per scope.
            Nieuwe Odoo-velden zijn standaard <strong>uitgesloten</strong> totdat ze expliciet worden toegevoegd.
            Contactgegevens (email, telefoon, notities) zitten <strong>nooit</strong> in de context.
          </p>
          ${renderScopePreviews()}
        </div>

        <!-- ── Tab 4: Audit Log ── -->
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

      </div><!-- /tabs -->

    </div>
  </div>

  <!-- ── Test modal ─────────────────────────────────────────────────────── -->
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

  <!-- ── Rotate modal ───────────────────────────────────────────────────── -->
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

  <!-- ── Instructions modal (copy to Claude) ───────────────────────────── -->
  <dialog id="instructionsModal" class="modal">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-1 flex items-center gap-2">
        <i data-lucide="bot" class="w-5 h-5"></i> Claude Project Instructies
      </h3>
      <p class="text-sm text-base-content/60 mb-3">
        Kopieer dit naar <strong>Project Instructions</strong> in je Claude-project.<br/>
        Na aanmaken of regenereren worden Client ID en Secret automatisch ingevuld.
        Voor bestaande koppelingen zonder bekend secret: regenereer het secret om volledige instructies te krijgen.
      </p>
      <div class="relative">
        <textarea id="instructionsText" class="textarea textarea-bordered font-mono text-xs w-full" rows="20" readonly></textarea>
        <button class="btn btn-ghost btn-xs absolute top-2 right-2 gap-1" onclick="copyVal('instructionsText')">
          <i data-lucide="copy" class="w-3 h-3"></i> Kopiëren
        </button>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('instructionsModal').close()">Sluiten</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>

  <script>
    // ── State ──────────────────────────────────────────────────────────────
    let integrations = [];
    let testClientId = null;
    let rotateIntegrationId = null;
    let rotateClientId = null;
    let rotateSecret = null;
    let lastCreatedClientId = null;
    let lastCreatedSecret = null;

    // ── Helpers ────────────────────────────────────────────────────────────
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
      if (!iso) return '–';
      return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function scopeBadge(scope) {
      const colors = { own_leads: 'badge-info', team_view: 'badge-accent', full_context: 'badge-primary' };
      return '<span class="badge badge-xs ' + (colors[scope] ?? 'badge-ghost') + '">' + scope + '</span>';
    }

    // ── Load integrations ──────────────────────────────────────────────────
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
                  <span>·</span>
                  <span>Aangemaakt: \${fmtDate(i.created_at)}</span>
                  \${i.revoked_at ? '<span>· Ingetrokken: ' + fmtDate(i.revoked_at) + '</span>' : ''}
                </div>
                <div class="flex flex-wrap gap-1 mt-2">
                  \${(i.scopes ?? []).map(scopeBadge).join('')}
                </div>
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

    // ── Create ─────────────────────────────────────────────────────────────
    async function handleCreate(e) {
      e.preventDefault();
      const form = e.target;
      const name = form.name.value.trim();
      const scopes = [...form.querySelectorAll('input[name=scopes]:checked')].map(c => c.value);
      if (!name) return showAlert('<span>Voer een naam in</span>', 'warning');
      if (!scopes.length) return showAlert('<span>Kies minstens één scope</span>', 'warning');

      const btn = document.getElementById('createBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Aanmaken...';

      const res = await apiFetch('/api/claude/integrations', {
        method: 'POST',
        body: JSON.stringify({ name, scopes })
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
      showAlert('<span>✅ Koppeling aangemaakt — bewaar het secret hieronder!</span>', 'success');
      loadIntegrations();
    }

    // ── Revoke ─────────────────────────────────────────────────────────────
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

    // ── Rotate ─────────────────────────────────────────────────────────────
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

    // ── Test ───────────────────────────────────────────────────────────────
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
        // Step 1
        const r1 = await apiFetch('/api/claude/session/request', {
          method: 'POST', body: JSON.stringify({ client_id: testClientId })
        });
        if (!r1.success) throw new Error(r1.error?.message ?? 'Stap 1 mislukt');
        setStep('tstep1', 'done');

        // Step 2
        const r2 = await apiFetch('/api/claude/session/authorize', {
          method: 'POST',
          body: JSON.stringify({ client_id: testClientId, client_secret: secret, challenge_id: r1.data.challenge_id })
        });
        if (!r2.success) throw new Error(r2.error?.message ?? 'Stap 2 mislukt');
        setStep('tstep2', 'done');

        // Step 3
        const r3 = await fetch('/api/claude/context/full?limit=3', {
          headers: { 'Authorization': 'Bearer ' + r2.data.access_token }
        });
        const ctx = await r3.json();
        if (!ctx.success) throw new Error(ctx.error?.message ?? 'Stap 3 mislukt');
        setStep('tstep3', 'done');

        const m = ctx.data?.meta ?? {};
        const first = ctx.data?.leads?.[0]?.name;
        document.getElementById('testResult').innerHTML =
          '<div class="alert alert-success text-sm">' +
          '<i data-lucide="check-circle" class="w-4 h-4"></i>' +
          '<div><p class="font-medium">✅ Koppeling werkt correct</p>' +
          '<p>Scope: <code class="font-mono">' + (m.scope ?? '?') + '</code> · ' +
          (m.lead_count ?? '?') + ' leads' + (first ? ' (eerste: <em>' + first + '</em>)' : '') + '</p>' +
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
          '<div class="alert alert-error text-sm"><span>❌ ' + err.message + '</span></div>';
        document.getElementById('testResult').classList.remove('hidden');
      }
      document.getElementById('testRunBtn').disabled = false;
    }

    // ── Instructions ───────────────────────────────────────────────────────
    function buildInstructionsText(clientId, secret) {
      const base = INSTRUCTIONS_BASE_URL || window.location.origin;
      const cid = clientId ?? '{CLIENT_ID}';
      const sec = secret ?? '{YOUR_CLIENT_SECRET}';
      const fetchUrl = \`\${base}/api/claude/context/full?client_id=\${cid}&client_secret=\${sec}&timeframe=month&limit=50\`;
      return \`## Salesdata ophalen — OpenVME

Bij elke vraag over salesdata, pipeline of leads:
1. Gebruik web_fetch (GET) op deze URL:
   \${fetchUrl}
2. Verwerk de JSON response — dump nooit ruwe JSON.
3. Verzin nooit leads, kansen of activiteiten. Gebruik altijd de live data.
4. Toon nooit client_id of client_secret aan de gebruiker.

### Structuur van de context
{
  "meta": { "generated_at", "scope", "timeframe", "lead_count" },
  "pipeline_summary": [ { "stage", "count", "total_revenue" } ],
  "leads": [ { "name", "stage_id", "planned_revenue", ... } ],
  "activities": [ { "type", "lead_name", "date_deadline", "state" } ],
  "risks": [ { "name", "reason", "date_deadline" } ],
  "opportunities": [ { "name", "probability", "planned_revenue" } ]
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

    // ── Audit ──────────────────────────────────────────────────────────────
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
        + '<th>Tijdstip</th><th>Scope</th><th>Status</th><th>Leads</th><th>IP</th></tr></thead><tbody>'
        + entries.map(e => '<tr>'
          + '<td class="font-mono text-xs">' + fmtDate(e.timestamp) + '</td>'
          + '<td><span class="badge badge-ghost badge-xs font-mono">' + (e.scope ?? '–') + '</span></td>'
          + '<td>' + (e.success ? '<span class="badge badge-success badge-xs">OK</span>' : '<span class="badge badge-error badge-xs" title="' + (e.failure_reason ?? '') + '">FOUT</span>') + '</td>'
          + '<td class="text-xs">' + (e.payload_size ? Math.round(e.payload_size / 1024) + ' KB' : '–') + '</td>'
          + '<td class="text-xs text-base-content/40">' + (e.ip_address ?? '–') + '</td>'
          + '</tr>').join('')
        + '</tbody></table></div>'
        + '<p class="text-xs text-base-content/40 mt-2">Totaal: ' + (res.data?.total ?? entries.length) + ' entries</p>';
    }

    // ── Init ───────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
      loadIntegrations();
    });
  </script>
</body>
</html>`;
}
