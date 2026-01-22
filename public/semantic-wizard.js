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
// GLOBAL STATE
// ============================================================================

// Cache for CRM stages (fetched from Odoo via schema)
let crmStagesCache = null;

// ============================================================================
// INFORMATION SETS (HARD-CODED, EXTENSIBLE)
// ============================================================================

const INFORMATION_SETS = {
  intake_open_vragen: {
    label: 'Intake & Open vragen',
    fields: [
      'x_studio_open_question_reason_for_contact',
      'x_studio_open_question_current_situation',
      'x_studio_open_question_expected_solution',
      'x_studio_open_question_running_costs',
      'x_studio_open_question_self_management'
    ]
  },
  communicatie: {
    label: 'Communicatie',
    fields: [
      'x_studio_contact_id',
      'x_studio_communication_methods',
      'x_studio_communication_skill_level',
      'x_studio_digital_skill_level',
      'x_studio_legal_skill_level',
      'x_studio_interpersonal_relationship',
      'x_studio_job_description'
    ]
  },
  huidig_beheer_werking: {
    label: 'Huidig beheer en werking',
    fields: [
      'x_studio_current_syndic',
      'x_studio_current_syndic_type',
      'x_studio_current_way_of_working',
      'x_studio_has_doubly_entry_accounting',
      'x_studio_has_operating_account',
      'x_studio_has_reserve_account',
      'x_studio_has_registration_number',
      'x_studio_has_insurance'
    ]
  },
  financieel_administratief: {
    label: 'Financieel en Administratief gedrag',
    fields: [
      'x_studio_has_annual_statement',
      'x_studio_has_allocation_keys',
      'x_studio_has_advance_payments'
    ]
  },
  gebouw_context: {
    label: 'Gebouw en Context',
    fields: [
      'x_studio_for_company_id',
      'x_studio_hoa_established',
      'x_studio_number_of_plots',
      'x_studio_number_of_apartments',
      'x_studio_number_of_co_owners',
      'x_studio_has_commercial_plots',
      'x_studio_average_tenant_age',
      'x_studio_age_group'
    ]
  }
};

// ============================================================================
// WIZARD STATE
// ============================================================================

class WizardState {
  constructor() {
    this.currentStep = 1;
    this.informationSets = {
      intake_open_vragen: false,
      communicatie: false,
      huidig_beheer_werking: false,
      financieel_administratief: false,
      gebouw_context: false
    };
    this.timeFilter = {
      from: null,
      to: null
    };
    // Lead enrichment state (TWO-PHASE ARCHITECTURE)
    this.leadEnrichment = {
      enabled: false,
      mode: 'include',  // 'include' | 'exclude' | 'only_without_lead'
      filters: {
        won_status: [],        // Array of selected values: 'won', 'lost', 'pending'
        stage_ids: []          // Array of selected stage IDs
      },
      property_groups: []      // Array of enabled property groups: 'time_flow', 'origin_marketing', 'business_signals'
    };
  }

  toggleInformationSet(key, value) {
    this.informationSets[key] = value;
  }

  toggleLeadEnrichment(enabled) {
    this.leadEnrichment.enabled = enabled;
    // Reset filters when disabling
    if (!enabled) {
      this.leadEnrichment.filters.won_status = [];
      this.leadEnrichment.filters.stage_ids = [];
    }
  }

  setLeadEnrichmentMode(mode) {
    this.leadEnrichment.mode = mode;
  }

  setLeadWonStatusFilter(statusArray) {
    this.leadEnrichment.filters.won_status = statusArray;
  }

  setLeadStageFilter(stageIdsArray) {
    this.leadEnrichment.filters.stage_ids = stageIdsArray;
  }

  toggleLeadPropertyGroup(groupId, enabled) {
    if (enabled && !this.leadEnrichment.property_groups.includes(groupId)) {
      this.leadEnrichment.property_groups.push(groupId);
    } else if (!enabled) {
      this.leadEnrichment.property_groups = this.leadEnrichment.property_groups.filter(g => g !== groupId);
    }
  }

  setTimeFilter(from, to) {
    this.timeFilter.from = from;
    this.timeFilter.to = to;
  }

  setApartmentsFilter(min, max, includeZero) {
    this.apartmentsFilter.min = min;
    this.apartmentsFilter.max = max;
    this.apartmentsFilter.include_zero = includeZero;
  }

  buildPayload() {
    // Minimal payload - ONLY what user explicitly selected
    const payload = {
      base_model: 'x_sales_action_sheet',
      fields: [
        { model: 'x_sales_action_sheet', field: 'id' },
        { model: 'x_sales_action_sheet', field: 'x_name' },
        { model: 'x_sales_action_sheet', field: 'create_date' }
      ],
      filters: []
    };

    // Add time filter if provided
    if (this.timeFilter.from && this.timeFilter.to) {
      payload.filters.push({
        model: 'x_sales_action_sheet',
        field: 'create_date',
        operator: '>=',
        value: this.timeFilter.from
      });
      payload.filters.push({
        model: 'x_sales_action_sheet',
        field: 'create_date',
        operator: '<=',
        value: this.timeFilter.to
      });
    }

    // Add apartments filter if any value is set
    if (this.apartmentsFilter.min !== null || this.apartmentsFilter.max !== null || this.apartmentsFilter.include_zero === false) {
      // Min filter
      if (this.apartmentsFilter.min !== null) {
        payload.filters.push({
          model: 'x_sales_action_sheet',
          field: 'x_studio_number_of_apartments',
          operator: '>=',
          value: parseInt(this.apartmentsFilter.min, 10)
        });
      }
      
      // Max filter
      if (this.apartmentsFilter.max !== null) {
        payload.filters.push({
          model: 'x_sales_action_sheet',
          field: 'x_studio_number_of_apartments',
          operator: '<=',
          value: parseInt(this.apartmentsFilter.max, 10)
        });
      }
      
      // Zero exclusion (only if explicitly disabled)
      if (this.apartmentsFilter.include_zero === false) {
        payload.filters.push({
          model: 'x_sales_action_sheet',
          field: 'x_studio_number_of_apartments',
          operator: '>',
          value: 0
        });
      }
    }

    // Add fields from enabled information sets
    for (const [setKey, isEnabled] of Object.entries(this.informationSets)) {
      if (isEnabled && INFORMATION_SETS[setKey]) {
        for (const field of INFORMATION_SETS[setKey].fields) {
          payload.fields.push({
            model: 'x_sales_action_sheet',
            field: field
          });
        }
      }
    }

    // Add lead enrichment if enabled (TWO-PHASE ARCHITECTURE)
    if (this.leadEnrichment.enabled) {
      payload.lead_enrichment = {
        enabled: true,
        mode: this.leadEnrichment.mode,
        filters: {}
      };

      // Add won_status filter if selected
      if (this.leadEnrichment.filters.won_status.length > 0) {
        payload.lead_enrichment.filters.won_status = this.leadEnrichment.filters.won_status;
      }

      // Add stage_id filter if selected
      if (this.leadEnrichment.filters.stage_ids.length > 0) {
        payload.lead_enrichment.filters.stage_ids = this.leadEnrichment.filters.stage_ids;
      }

      // Add property_groups if any are selected
      if (this.leadEnrichment.property_groups.length > 0) {
        payload.lead_enrichment.property_groups = this.leadEnrichment.property_groups;
      }
    }

    return payload;
  }

  resetState() {
    this.currentStep = 1;
    this.informationSets = {
      intake_open_vragen: false,
      communicatie: false,
      huidig_beheer_werking: false,
      financieel_administratief: false,
      gebouw_context: false
    };
    this.timeFilter = {
      from: null,
      to: null
    };
    this.apartmentsFilter = {
      min: null,
      max: null,
      include_zero: true
    };
    this.leadEnrichment = {
      enabled: false,
      mode: 'include',
      filters: {
        won_status: [],
        stage_ids: []
      },
      property_groups: []
    };
  }
}

// Global state instance
const wizardState = new WizardState();

// ============================================================================
// CRM STAGE FETCHING
// ============================================================================

/**
 * Fetch CRM stages from Odoo, ordered by sequence.
 * Uses schema introspection to maintain strict schema-driven approach.
 */
async function fetchCrmStages() {
  if (crmStagesCache) {
    return crmStagesCache;
  }

  try {
    // Fetch via schema introspection endpoint
    const response = await fetch('/insights/api/sales-insights/stages', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Failed to fetch CRM stages:', response.status);
      return [];
    }

    const result = await response.json();
    
    if (result.success && result.data && Array.isArray(result.data.stages)) {
      crmStagesCache = result.data.stages;
      return crmStagesCache;
    }

    console.error('Invalid stages response:', result);
    return [];
    
  } catch (error) {
    console.error('Error fetching CRM stages:', error);
    return [];
  }
}

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
  const setToggles = Object.entries(INFORMATION_SETS).map(([setKey, setConfig]) => `
    <div class="form-control">
      <label class="label cursor-pointer justify-start gap-4">
        <input 
          type="checkbox" 
          class="checkbox checkbox-primary"
          ${wizardState.informationSets[setKey] ? 'checked' : ''}
          onchange="wizardState.toggleInformationSet('${setKey}', this.checked); renderWizard();"
        />
        <div>
          <div class="label-text font-bold">${setConfig.label}</div>
          <div class="label-text-alt text-base-content/60">
            ${setConfig.fields.length} velden
          </div>
        </div>
      </label>
    </div>
  `).join('');

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-4">Stap 1: Wat wil je ophalen?</h2>
        <p class="text-base-content/70 mb-6">
          Selecteer expliciet welke informatiesets je wilt ophalen. 
          <strong>x_sales_action_sheet is altijd inbegrepen.</strong>
        </p>

        <div class="space-y-4">
          ${setToggles}
        </div>

        <!-- CRM Leads Toggle -->
        <div class="divider mt-8">CRM Leads (Optioneel)</div>
        
        <div class="form-control">
          <label class="label cursor-pointer justify-start gap-4">
            <input 
              type="checkbox" 
              class="checkbox checkbox-secondary"
              ${wizardState.leadEnrichment.enabled ? 'checked' : ''}
              onchange="wizardState.toggleLeadEnrichment(this.checked); renderWizard();"
            />
            <div>
              <div class="label-text font-bold">Include CRM Leads (Two-Phase Enrichment)</div>
              <div class="label-text-alt text-base-content/60">
                Voeg lead informatie toe via two-phase set operations: id, name, stage_id, active, won_status
              </div>
            </div>
          </label>
        </div>

        <!-- Property Groups (only shown when CRM Leads is enabled) -->
        ${wizardState.leadEnrichment.enabled ? `
          <div class="ml-12 mt-4 space-y-2">
            <div class="text-sm font-semibold text-base-content/80 mb-2">Selecteer extra lead velden:</div>
            
            <label class="label cursor-pointer justify-start gap-3">
              <input 
                type="checkbox" 
                class="checkbox checkbox-xs checkbox-accent"
                ${wizardState.leadEnrichment.property_groups.includes('time_flow') ? 'checked' : ''}
                onchange="wizardState.toggleLeadPropertyGroup('time_flow', this.checked); renderWizard();"
              />
              <div class="flex-1">
                <div class="label-text">⏱️ Time Flow</div>
                <div class="label-text-alt text-base-content/50">create_date, write_date, date_open, date_closed</div>
              </div>
            </label>

            <label class="label cursor-pointer justify-start gap-3">
              <input 
                type="checkbox" 
                class="checkbox checkbox-xs checkbox-accent"
                ${wizardState.leadEnrichment.property_groups.includes('origin_marketing') ? 'checked' : ''}
                onchange="wizardState.toggleLeadPropertyGroup('origin_marketing', this.checked); renderWizard();"
              />
              <div class="flex-1">
                <div class="label-text">📍 Origin & Marketing</div>
                <div class="label-text-alt text-base-content/50">source_id, medium_id, campaign_id, referred</div>
              </div>
            </label>

            <label class="label cursor-pointer justify-start gap-3">
              <input 
                type="checkbox" 
                class="checkbox checkbox-xs checkbox-accent"
                ${wizardState.leadEnrichment.property_groups.includes('business_signals') ? 'checked' : ''}
                onchange="wizardState.toggleLeadPropertyGroup('business_signals', this.checked); renderWizard();"
              />
              <div class="flex-1">
                <div class="label-text">💼 Business Signals</div>
                <div class="label-text-alt text-base-content/50">priority, type, expected_revenue, probability</div>
              </div>
            </label>

            <div class="alert alert-sm mt-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info shrink-0 w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="text-xs">Status velden (id, name, stage_id, active, won_status) worden altijd opgehaald.</span>
            </div>
          </div>
        ` : ''}

        <div class="alert alert-info mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>
            Als je CRM Leads inschakelt, worden de 5 standaard lead velden opgehaald. 
            In de volgende stap kun je lead-specifieke filters toepassen.
          </span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// RENDERING: Step 2 - Time Filter
// ============================================================================

async function renderStep2() {
  // Ensure apartmentsFilter exists (for backward compatibility)
  if (!wizardState.apartmentsFilter) {
    wizardState.apartmentsFilter = { min: null, max: null, include_zero: true };
  }

  // Fetch CRM stages if CRM leads are enabled
  let crmStages = [];
  if (wizardState.leadEnrichment.enabled) {
    crmStages = await fetchCrmStages();
  }

  // Build lead filters UI
  const leadFiltersUI = wizardState.leadEnrichment.enabled ? `
    <!-- Lead Filters Section -->
    <div class="divider mt-8">Lead Filters (Optioneel)</div>

    <div class="alert alert-warning mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>Lead filters zijn optioneel. Laat leeg voor alle leads.</span>
    </div>

    <!-- Won Status Filter -->
    <div class="form-control mb-4">
      <label class="label">
        <span class="label-text font-semibold">Won Status (multi-select)</span>
      </label>
      <div class="flex gap-4">
        ${['won', 'lost', 'pending'].map(status => `
          <label class="label cursor-pointer gap-2">
            <input 
              type="checkbox" 
              class="checkbox checkbox-sm"
              value="${status}"
              ${wizardState.leadEnrichment.filters.won_status.includes(status) ? 'checked' : ''}
              onchange="handleWonStatusChange('${status}', this.checked); renderWizard();"
            />
            <span class="label-text capitalize">${status}</span>
          </label>
        `).join('')}
      </div>
    </div>

    <!-- Stage Filter -->
    <div class="form-control mb-4">
      <label class="label">
        <span class="label-text font-semibold">CRM Stages (multi-select, ordered by sequence)</span>
      </label>
      ${crmStages.length > 0 ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 border border-base-300 rounded">
          ${crmStages.map(stage => `
            <label class="label cursor-pointer justify-start gap-2">
              <input 
                type="checkbox" 
                class="checkbox checkbox-sm"
                value="${stage.id}"
                ${wizardState.leadEnrichment.filters.stage_ids.includes(stage.id) ? 'checked' : ''}
                onchange="handleStageChange(${stage.id}, this.checked); renderWizard();"
              />
              <span class="label-text text-xs">
                <span class="badge badge-xs mr-1">${stage.sequence}</span>
                ${stage.name}
              </span>
            </label>
          `).join('')}
        </div>
        <div class="mt-2">
          <button 
            class="btn btn-xs btn-ghost"
            onclick="selectStagesUpTo(${crmStages.length > 0 ? crmStages[crmStages.length - 1].id : 0}); renderWizard();"
          >
            Select all stages
          </button>
          <button 
            class="btn btn-xs btn-ghost"
            onclick="wizardState.setLeadStageFilter([]); renderWizard();"
          >
            Clear stages
          </button>
        </div>
      ` : `
        <div class="alert alert-error">
          <span>Failed to load CRM stages. Please refresh the page.</span>
        </div>
      `}
    </div>
  ` : '';

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-4">Stap 2: Context filters</h2>
        <p class="text-base-content/70 mb-6">
          Filter op datum en aantal appartementen. Laat leeg voor alle records.
        </p>

        <!-- Time filter section -->
        <div class="divider">Tijdsfilter</div>

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

        <!-- Apartments filter section -->
        <div class="divider mt-8">Aantal appartementen</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Minimum</span>
            </label>
            <input 
              type="number" 
              class="input input-bordered w-full"
              placeholder="Geen minimum"
              value="${wizardState.apartmentsFilter.min || ''}"
              onchange="wizardState.setApartmentsFilter(this.value || null, wizardState.apartmentsFilter.max, wizardState.apartmentsFilter.include_zero); renderWizard();"
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Maximum</span>
            </label>
            <input 
              type="number" 
              class="input input-bordered w-full"
              placeholder="Geen maximum"
              value="${wizardState.apartmentsFilter.max || ''}"
              onchange="wizardState.setApartmentsFilter(wizardState.apartmentsFilter.min, this.value || null, wizardState.apartmentsFilter.include_zero); renderWizard();"
            />
          </div>
        </div>

        <div class="form-control mt-4">
          <label class="label cursor-pointer justify-start gap-4">
            <input 
              type="checkbox" 
              class="checkbox checkbox-primary"
              ${wizardState.apartmentsFilter.include_zero ? 'checked' : ''}
              onchange="wizardState.setApartmentsFilter(wizardState.apartmentsFilter.min, wizardState.apartmentsFilter.max, this.checked); renderWizard();"
            />
            <span class="label-text">Gebouwen met 0 appartementen meenemen</span>
          </label>
        </div>

        <div class="alert alert-info mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Filter wordt toegepast op <strong>x_studio_number_of_apartments</strong></span>
        </div>

        ${leadFiltersUI}
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

// Helper functions for lead filters
function handleWonStatusChange(status, checked) {
  const currentStatuses = wizardState.leadEnrichment.filters.won_status;
  if (checked && !currentStatuses.includes(status)) {
    wizardState.setLeadWonStatusFilter([...currentStatuses, status]);
  } else if (!checked && currentStatuses.includes(status)) {
    wizardState.setLeadWonStatusFilter(currentStatuses.filter(s => s !== status));
  }
}

function handleStageChange(stageId, checked) {
  const currentStages = wizardState.leadEnrichment.filters.stage_ids;
  if (checked && !currentStages.includes(stageId)) {
    wizardState.setLeadStageFilter([...currentStages, stageId]);
  } else if (!checked && currentStages.includes(stageId)) {
    wizardState.setLeadStageFilter(currentStages.filter(id => id !== stageId));
  }
}

async function selectStagesUpTo(maxStageId) {
  const stages = await fetchCrmStages();
  const selectedIds = [];
  for (const stage of stages) {
    selectedIds.push(stage.id);
    if (stage.id === maxStageId) break;
  }
  wizardState.setLeadStageFilter(selectedIds);
}

async function renderWizard() {
  const container = document.getElementById('wizard-container');
  if (!container) return;

  let stepContent = '';
  if (wizardState.currentStep === 1) {
    stepContent = renderStep1();
  } else if (wizardState.currentStep === 2) {
    stepContent = await renderStep2();
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
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="text-xl font-bold">✅ Resultaten</h3>
            <p class="text-sm text-base-content/60">
              ${records.length} ${records.length === 1 ? 'resultaat' : 'resultaten'}
            </p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" onclick="exportSemanticQuery('xlsx')">
              📈 Export XLSX
            </button>
            <button class="btn btn-sm btn-outline" onclick="exportSemanticQuery('json')">
              📄 Export JSON
            </button>
          </div>
        </div>

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

async function exportSemanticQuery(format) {
  if (format !== 'xlsx' && format !== 'json') {
    console.error('Invalid export format:', format);
    return;
  }

  try {
    // Build payload with export format
    const payload = wizardState.buildPayload();
    payload.export = format;

    console.log('📤 Exporting as', format);
    console.log('📦 Payload:', payload);

    const response = await fetch('/insights/api/sales-insights/semantic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status} ${response.statusText}`);
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `export_${format}_${Date.now()}.${format}`;
    
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?(.+?)"?$/);
      if (match) filename = match[1];
    }

    // Download file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    console.log('✅ Export downloaded:', filename);

  } catch (error) {
    console.error('❌ Export failed:', error);
    alert(`Export failed: ${error.message}`);
  }
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
