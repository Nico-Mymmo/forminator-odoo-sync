/**
 * Semantic Wizard - HARD SIMPLIFIED VERSION
 * 
 * TWO STEPS ONLY:
 * 1. What to fetch (explicit toggles)
 * 2. Time filter (create_date only)
 * 
 * NO INFERENCE. NO DEFAULTS. NO GUESSING.
 */

// ============================================================================
// WIZARD STATE
// ============================================================================

class WizardState {
  constructor() {
    this.currentStep = 1;
    this.includes = {
      pain_points: false,
      res_partner: false,
      crm_lead: false
    };
    this.timeFilter = {
      from: null,
      to: null
    };
  }

  toggleInclude(key, value) {
    this.includes[key] = value;
  }

  setTimeFilter(from, to) {
    this.timeFilter.from = from;
    this.timeFilter.to = to;
  }

  buildPayload() {
    // Minimal payload - ONLY what user explicitly selected
    const payload = {
      base_model: 'x_sales_action_sheet',
      fields: ['id', 'x_name', 'create_date'],
      filters: []
    };

    // Add time filter if provided
    if (this.timeFilter.from && this.timeFilter.to) {
      payload.filters.push({
        field: 'create_date',
        operator: '>=',
        value: this.timeFilter.from
      });
      payload.filters.push({
        field: 'create_date',
        operator: '<=',
        value: this.timeFilter.to
      });
    }

    // Add explicit joins ONLY if toggled
    if (this.includes.pain_points) {
      payload.fields.push('x_action_sheet_pain_points', 'x_user_painpoints');
    }
    
    if (this.includes.res_partner) {
      payload.fields.push('partner_id');
    }
    
    if (this.includes.crm_lead) {
      payload.fields.push('x_lead_id');
    }

    return payload;
  }

  resetState() {
    this.currentStep = 1;
    this.includes = {
      pain_points: false,
      res_partner: false,
      crm_lead: false
    };
    this.timeFilter = {
      from: null,
      to: null
    };
  }
}

// Global state instance
const wizardState = new WizardState();

// ============================================================================
// RENDERING: Step Progress
// ============================================================================

function renderProgressBar() {
  const steps = [
    { num: 1, label: 'Wat ophalen' },
    { num: 2, label: 'Tijdsfilter' }
  ];

  return `
    <div class="mb-8">
      <ul class="steps steps-horizontal w-full">
        ${steps.map(step => `
          <li class="step ${wizardState.currentStep >= step.num ? 'step-primary' : ''}">
            ${step.label}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

// ============================================================================
// RENDERING: Step 1 - What to Fetch
// ============================================================================

function renderStep1() {
  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-4">Stap 1: Wat wil je ophalen?</h2>
        <p class="text-base-content/70 mb-6">
          Selecteer expliciet welke gegevens je wilt ophalen. 
          <strong>x_sales_action_sheet is altijd inbegrepen.</strong>
        </p>

        <div class="space-y-4">
          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-4">
              <input 
                type="checkbox" 
                class="checkbox checkbox-primary"
                ${wizardState.includes.pain_points ? 'checked' : ''}
                onchange="wizardState.toggleInclude('pain_points', this.checked); renderWizard();"
              />
              <div>
                <div class="label-text font-bold">Pijnpunten & Obstakels</div>
                <div class="label-text-alt text-base-content/60">
                  Voegt toe: x_action_sheet_pain_points, x_user_painpoints
                </div>
              </div>
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-4">
              <input 
                type="checkbox" 
                class="checkbox checkbox-primary"
                ${wizardState.includes.res_partner ? 'checked' : ''}
                onchange="wizardState.toggleInclude('res_partner', this.checked); renderWizard();"
              />
              <div>
                <div class="label-text font-bold">Partner/Klant gegevens</div>
                <div class="label-text-alt text-base-content/60">
                  Voegt toe: res.partner (naam, adres, etc.)
                </div>
              </div>
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-4">
              <input 
                type="checkbox" 
                class="checkbox checkbox-primary"
                ${wizardState.includes.crm_lead ? 'checked' : ''}
                onchange="wizardState.toggleInclude('crm_lead', this.checked); renderWizard();"
              />
              <div>
                <div class="label-text font-bold">CRM Lead gegevens</div>
                <div class="label-text-alt text-base-content/60">
                  Voegt toe: crm.lead (pipeline, verwachte omzet, etc.)
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// RENDERING: Step 2 - Time Filter
// ============================================================================

function renderStep2() {
  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-4">Stap 2: Tijdsfilter</h2>
        <p class="text-base-content/70 mb-6">
          Filter op aanmaakdatum (create_date). Laat leeg voor alle records.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Van datum</span>
            </label>
            <input 
              type="date" 
              class="input input-bordered w-full"
              value="${wizardState.timeFilter.from || ''}"
              onchange="wizardState.setTimeFilter(this.value, wizardState.timeFilter.to); renderWizard();"
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Tot datum</span>
            </label>
            <input 
              type="date" 
              class="input input-bordered w-full"
              value="${wizardState.timeFilter.to || ''}"
              onchange="wizardState.setTimeFilter(wizardState.timeFilter.from, this.value); renderWizard();"
            />
          </div>
        </div>

        <div class="alert alert-info mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Filter wordt toegepast op <strong>x_sales_action_sheet.create_date</strong></span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// RENDERING: Actions (Navigation + Execute)
// ============================================================================

function renderActions() {
  const canGoNext = wizardState.currentStep < 2;
  const canGoBack = wizardState.currentStep > 1;
  const canExecute = wizardState.currentStep === 2;

  return `
    <div class="flex justify-between mt-6">
      <div>
        ${canGoBack ? `
          <button 
            class="btn btn-outline"
            onclick="wizardState.currentStep--; renderWizard();"
          >
            ← Vorige
          </button>
        ` : ''}
      </div>

      <div class="flex gap-2">
        ${wizardState.currentStep > 1 ? `
          <button 
            class="btn btn-ghost"
            onclick="wizardState.resetState(); renderWizard();"
          >
            Reset
          </button>
        ` : ''}

        ${canGoNext ? `
          <button 
            class="btn btn-primary"
            onclick="wizardState.currentStep++; renderWizard();"
          >
            Volgende →
          </button>
        ` : ''}

        ${canExecute ? `
          <button 
            class="btn btn-primary"
            onclick="executeQuery();"
          >
            Uitvoeren
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// MAIN RENDER
// ============================================================================

function renderWizard() {
  const container = document.getElementById('wizard-container');
  if (!container) return;

  let stepContent = '';
  if (wizardState.currentStep === 1) {
    stepContent = renderStep1();
  } else if (wizardState.currentStep === 2) {
    stepContent = renderStep2();
  }

  container.innerHTML = renderProgressBar() + stepContent + renderActions();

  if (window.lucide) lucide.createIcons();
}

// ============================================================================
// API CALLS
// ============================================================================

async function executeQuery() {
  const payload = wizardState.buildPayload();

  // MANDATORY: Show payload before execution
  console.log('📦 PAYLOAD TO BE SENT:', JSON.stringify(payload, null, 2));
  
  const payloadDisplay = document.getElementById('payload-display');
  if (payloadDisplay) {
    payloadDisplay.innerHTML = `
      <div class="card bg-base-200 shadow-xl mb-4">
        <div class="card-body">
          <h3 class="card-title text-lg">📦 Query Payload</h3>
          <pre class="bg-base-300 p-4 rounded overflow-x-auto text-sm"><code>${JSON.stringify(payload, null, 2)}</code></pre>
        </div>
      </div>
    `;
  }

  showLoading('Bezig met query uitvoeren...');

  try {
    const response = await fetch('/insights/api/sales-insights/semantic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      showError(result.error || { message: 'Query failed', details: result });
      return;
    }

    showResults(result.data, false);

  } catch (error) {
    showError({ message: error.message, stack: error.stack });
  } finally {
    hideLoading();
  }
}

function showLoading(message) {
  const container = document.getElementById('results-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center py-8">
      <span class="loading loading-spinner loading-lg"></span>
      <span class="ml-4">${message}</span>
    </div>
  `;
}

function hideLoading() {
  // Handled by showResults/showError
}

function showError(error) {
  const container = document.getElementById('results-container');
  if (!container) return;

  container.innerHTML = `
    <div class="alert alert-error">
      <div>
        <h3 class="font-bold">❌ Error: ${error.message}</h3>
        ${error.details ? `<pre class="text-xs mt-2 bg-base-300 p-2 rounded overflow-x-auto">${JSON.stringify(error.details, null, 2)}</pre>` : ''}
        ${error.stack ? `<pre class="text-xs mt-2 bg-base-300 p-2 rounded overflow-x-auto">${error.stack}</pre>` : ''}
      </div>
    </div>
  `;
}

function showResults(data, isPreview) {
  const container = document.getElementById('results-container');
  if (!container) return;

  if (!data || !data.records) {
    showError({ message: 'No data returned', details: data });
    return;
  }

  const { records } = data;

  container.innerHTML = `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h3 class="text-xl font-bold mb-4">✅ Resultaten</h3>
        <p class="text-sm text-base-content/60 mb-4">
          ${records.length} ${records.length === 1 ? 'resultaat' : 'resultaten'}
        </p>

        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead>
              <tr>
                ${records.length > 0 ? Object.keys(records[0]).map(key => `<th class="font-bold">${key}</th>`).join('') : '<th>Geen data</th>'}
              </tr>
            </thead>
            <tbody>
              ${records.map(record => `
                <tr>
                  ${Object.values(record).map(value => `
                    <td>${formatValue(value)}</td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '<span class="text-base-content/40">null</span>';
  }
  if (typeof value === 'boolean') {
    return value ? '✅' : '❌';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '<span class="text-base-content/40">[]</span>';
  }
  return String(value);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Hide loading, show content
    const loadingEl = document.getElementById('loadingState');
    const mainEl = document.getElementById('mainContent');
    
    if (loadingEl) loadingEl.style.display = 'none';
    if (mainEl) mainEl.style.display = 'block';

    // Render wizard
    renderWizard();

    // Initialize lucide icons
    if (window.lucide) lucide.createIcons();

    console.log('✅ Simplified Semantic Wizard loaded');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div class="alert alert-error">
          <div>
            <h3 class="font-bold">Laden mislukt</h3>
            <p class="text-sm">${error.message}</p>
          </div>
        </div>
      `;
    }
  }
});
