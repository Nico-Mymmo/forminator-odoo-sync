/**
 * Semantic Wizard - Client-Side Bundle
 * 
 * All-in-one script for guided semantic query building
 * Implements ITERATION_8_IMPLEMENTATION.md Fase 2 + 3
 * 
 * No ES6 modules - direct browser execution
 */

// ============================================================================
// CONFIG: Semantic Layers
// ============================================================================

const SEMANTIC_LAYERS = {
  pain_points: {
    id: 'pain_points',
    label: 'Pijnpunten & Obstakels',
    description: 'Welke obstakels ervaren klanten?',
    icon: '⚠️',
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_action_sheet_pain_points.score', 'x_user_painpoints.name'],
    relations: ['x_action_sheet_pain_points', 'x_user_painpoints'],
    execution_hint: 'read_group',
    sub_options: [
      { id: 'most_common', label: 'Meest voorkomend', aggregation: 'COUNT' },
      { id: 'most_severe', label: 'Meest ernstig', aggregation: 'AVG_score' },
      { id: 'biggest_impact', label: 'Grootste impact', aggregation: 'SUM_score' }
    ],
    incompatible_with: ['stage_distribution']
  },
  
  meeting_evolution: {
    id: 'meeting_evolution',
    label: 'Meeting-Evolutie',
    description: 'Hoe ontwikkelt klantcontact zich?',
    icon: '📅',
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_as_meetings.x_date', 'x_as_meetings.x_meeting_type'],
    relations: ['x_as_meetings'],
    execution_hint: 'multi_pass',
    sub_options: [
      { id: 'frequency', label: 'Frequentie per periode' },
      { id: 'timing', label: 'Eerste vs laatste contact' },
      { id: 'conversion', label: 'Voor/na conversie' },
      { id: 'type_distribution', label: 'Type-verdeling' }
    ],
    incompatible_with: ['stage_distribution']
  },
  
  stage_distribution: {
    id: 'stage_distribution',
    label: 'Fase-Verdeling',
    description: 'Waar zitten deals in het proces?',
    icon: '📊',
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_support_stage.name', 'x_support_stage.sequence'],
    relations: ['x_support_stage'],
    execution_hint: 'read_group',
    sub_options: [
      { id: 'distribution', label: 'Verdeling per fase' },
      { id: 'conversion', label: 'Conversie-percentage' },
      { id: 'dropoff', label: 'Drop-off punten' }
    ],
    incompatible_with: ['pain_points', 'meeting_evolution']
  },
  
  building_context: {
    id: 'building_context',
    label: 'Gebouw & VME Context',
    description: 'Welk type vastgoed behandelen we?',
    icon: '🏢',
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['res.partner.name'],
    relations: ['res.partner'],
    execution_hint: 'read_group',
    sub_options: [
      { id: 'basic', label: 'Basis (snel)', execution: 'read_group' },
      { id: 'technical', label: 'Technisch (langzaam)', execution: 'multi_pass' }
    ],
    incompatible_with: []
  },
  
  sales_outcome: {
    id: 'sales_outcome',
    label: 'Salesuitkomst',
    description: 'Wat zijn de resultaten?',
    icon: '🎯',
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_support_stage.x_stage_type'],
    relations: ['x_support_stage', 'crm.lead'],
    execution_hint: 'read_group',
    sub_options: [
      { id: 'win_rate', label: 'Win rate' },
      { id: 'revenue', label: 'Omzet' },
      { id: 'conversion_time', label: 'Conversietijd' }
    ],
    incompatible_with: []
  },
  
  basic_info: {
    id: 'basic_info',
    label: 'Basisinfo',
    description: 'Algemene actieblad-details',
    icon: '📋',
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_name'],
    relations: [],
    execution_hint: 'search_read',
    sub_options: [
      { id: 'list', label: 'Lijst' },
      { id: 'summary', label: 'Samenvatting' }
    ],
    incompatible_with: []
  }
};

// ============================================================================
// CONFIG: Context Filters
// ============================================================================

const CONTEXT_FILTERS = {
  building_size: {
    id: 'building_size',
    label: 'Gebouwgrootte',
    type: 'radio',
    options: [
      { id: 'all', label: 'Alle' },
      { id: 'small', label: 'Klein (<20 units)' },
      { id: 'medium', label: 'Middel (20-100)' },
      { id: 'large', label: 'Groot (>100)' }
    ]
  },
  
  stage_type: {
    id: 'stage_type',
    label: 'Fase-status',
    type: 'radio',
    options: [
      { id: 'all', label: 'Alle' },
      { id: 'in_progress', label: 'Actief' },
      { id: 'won', label: 'Gewonnen' },
      { id: 'lost', label: 'Verloren' }
    ]
  },
  
  time_period: {
    id: 'time_period',
    label: 'Tijdsperiode',
    type: 'radio',
    options: [
      { id: 'all', label: 'Altijd' },
      { id: 'last_30', label: 'Laatste 30 dagen' },
      { id: 'last_90', label: 'Laatste 90 dagen' },
      { id: 'this_year', label: 'Dit jaar' },
      { id: 'custom', label: 'Aangepast bereik' }
    ]
  },
  
  owner: {
    id: 'owner',
    label: 'Eigenaar',
    type: 'radio',
    options: [
      { id: 'all', label: 'Alle' },
      { id: 'me', label: 'Mij' },
      { id: 'my_team', label: 'Mijn team' }
    ]
  },
  
  lead_status: {
    id: 'lead_status',
    label: 'Lead status',
    type: 'checkbox',
    options: [
      { id: 'new', label: 'Nieuw' },
      { id: 'qualified', label: 'Gekwalificeerd' },
      { id: 'proposition', label: 'Voorstel' }
    ]
  },
  
  tags: {
    id: 'tags',
    label: 'Tags',
    type: 'checkbox',
    options: [
      { id: 'urgent', label: 'Urgent' },
      { id: 'follow_up', label: 'Follow-up' },
      { id: 'high_value', label: 'Hoge waarde' }
    ]
  }
};

// ============================================================================
// CONFIG: Presentation Modes
// ============================================================================

const PRESENTATION_MODES = {
  group_by: {
    id: 'group_by',
    label: 'Groeperen',
    description: 'Groepeer resultaten op een veld',
    execution: 'read_group',
    supports: ['pain_points', 'stage_distribution', 'building_context', 'sales_outcome'],
    options: {
      group_field: { type: 'dropdown', label: 'Groepeer op', required: true }
    }
  },
  
  compare: {
    id: 'compare',
    label: 'Vergelijken',
    description: 'Vergelijk twee filters naast elkaar',
    execution: 'multi_pass',
    supports: ['meeting_evolution', 'sales_outcome'],
    options: {
      compare_dimension: { type: 'dropdown', label: 'Vergelijk', values: ['time_period', 'stage_type', 'owner'] }
    }
  },
  
  trend: {
    id: 'trend',
    label: 'Trend',
    description: 'Toon ontwikkeling over tijd',
    execution: 'multi_pass',
    supports: ['meeting_evolution', 'sales_outcome'],
    options: {
      interval: { type: 'dropdown', label: 'Interval', values: ['day', 'week', 'month', 'quarter'] }
    }
  },
  
  top_bottom: {
    id: 'top_bottom',
    label: 'Top/Bottom',
    description: 'Hoogste/laagste resultaten',
    execution: 'search_read',
    supports: ['pain_points', 'building_context', 'sales_outcome'],
    options: {
      limit: { type: 'number', label: 'Aantal', default: 10 },
      direction: { type: 'radio', label: 'Richting', values: ['top', 'bottom'] }
    }
  },
  
  summarize: {
    id: 'summarize',
    label: 'Samenvatten',
    description: 'Aggregeer tot totalen',
    execution: 'read_group',
    supports: ['pain_points', 'sales_outcome', 'basic_info'],
    options: {
      function: { type: 'dropdown', label: 'Functie', values: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] }
    }
  }
};

// ============================================================================
// WIZARD STATE
// ============================================================================

class WizardState {
  constructor() {
    this.currentStep = 1;
    this.query = {
      layer_id: null,
      sub_option: null,
      context: {},
      presentation: {}
    };
  }

  selectLayer(layerId) {
    this.query.layer_id = layerId;
    this.query.sub_option = null;
  }

  selectSubOption(subOptionId) {
    this.query.sub_option = subOptionId;
  }

  updateContext(filterId, value) {
    this.query.context[filterId] = value;
  }

  toggleContextCheckbox(filterId, optionId, checked) {
    if (!this.query.context[filterId]) {
      this.query.context[filterId] = [];
    }
    const values = this.query.context[filterId];
    if (checked && !values.includes(optionId)) {
      values.push(optionId);
    } else if (!checked) {
      const idx = values.indexOf(optionId);
      if (idx > -1) values.splice(idx, 1);
    }
  }

  selectPresentation(type) {
    this.query.presentation = { type };
  }

  updatePresentationOption(key, value) {
    this.query.presentation[key] = value;
  }

  goToStep(step) {
    this.currentStep = step;
    renderWizard();
  }

  canProceed(toStep) {
    if (toStep === 2) return !!this.query.layer_id;
    if (toStep === 3) return !!this.query.layer_id;
    if (toStep === 4) return !!this.query.layer_id && !!this.query.presentation.type;
    return false;
  }
}

const wizardState = new WizardState();

// ============================================================================
// RENDERING
// ============================================================================

function renderLayer1() {
  const layers = Object.values(SEMANTIC_LAYERS);
  const selected = wizardState.query.layer_id;

  return `
    <div class="space-y-3">
      <h3 class="text-lg font-semibold mb-4">Wat wil je weten over je salesacties?</h3>
      ${layers.map(layer => `
        <div class="form-control">
          <label class="label cursor-pointer flex justify-start gap-3 border rounded-lg p-4 ${selected === layer.id ? 'border-primary bg-primary/10' : 'border-base-300'}">
            <input 
              type="radio" 
              name="layer" 
              class="radio radio-primary" 
              ${selected === layer.id ? 'checked' : ''}
              onchange="wizardState.selectLayer('${layer.id}'); renderWizard();"
            />
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-2xl">${layer.icon}</span>
                <span class="font-semibold">${layer.label}</span>
              </div>
              <p class="text-sm text-base-content/60">${layer.description}</p>
            </div>
          </label>
          
          ${selected === layer.id && layer.sub_options ? `
            <div class="ml-12 mt-2 space-y-2">
              ${layer.sub_options.map(sub => `
                <label class="label cursor-pointer justify-start gap-2">
                  <input 
                    type="radio" 
                    name="sub_option" 
                    class="radio radio-sm"
                    ${wizardState.query.sub_option === sub.id ? 'checked' : ''}
                    onchange="wizardState.selectSubOption('${sub.id}'); renderWizard();"
                  />
                  <span class="text-sm">${sub.label}</span>
                </label>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderLayer2() {
  const filters = Object.values(CONTEXT_FILTERS);

  return `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold mb-4">Over welke actiebladen?</h3>
      ${filters.map(filter => {
        if (filter.type === 'radio') {
          return `
            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">${filter.label}</span>
              </label>
              <div class="space-y-1">
                ${filter.options.map(opt => `
                  <label class="label cursor-pointer justify-start gap-2">
                    <input 
                      type="radio" 
                      name="${filter.id}" 
                      class="radio radio-sm"
                      ${wizardState.query.context[filter.id] === opt.id ? 'checked' : ''}
                      onchange="wizardState.updateContext('${filter.id}', '${opt.id}'); renderWizard();"
                    />
                    <span class="text-sm">${opt.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        } else {
          return `
            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">${filter.label}</span>
              </label>
              <div class="space-y-1">
                ${filter.options.map(opt => {
                  const values = wizardState.query.context[filter.id] || [];
                  return `
                    <label class="label cursor-pointer justify-start gap-2">
                      <input 
                        type="checkbox" 
                        class="checkbox checkbox-sm"
                        ${values.includes(opt.id) ? 'checked' : ''}
                        onchange="wizardState.toggleContextCheckbox('${filter.id}', '${opt.id}', this.checked); renderWizard();"
                      />
                      <span class="text-sm">${opt.label}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }
      }).join('')}
    </div>
  `;
}

function renderLayer3() {
  const modes = Object.values(PRESENTATION_MODES);
  const layerId = wizardState.query.layer_id;
  const selected = wizardState.query.presentation.type;

  return `
    <div class="space-y-3">
      <h3 class="text-lg font-semibold mb-4">Hoe wil je het zien?</h3>
      ${modes.map(mode => {
        const supported = mode.supports.includes(layerId);
        return `
          <div class="form-control">
            <label class="label cursor-pointer flex justify-start gap-3 border rounded-lg p-4 ${selected === mode.id ? 'border-primary bg-primary/10' : 'border-base-300'} ${!supported ? 'opacity-50' : ''}">
              <input 
                type="radio" 
                name="presentation" 
                class="radio radio-primary" 
                ${selected === mode.id ? 'checked' : ''}
                ${!supported ? 'disabled' : ''}
                onchange="wizardState.selectPresentation('${mode.id}'); renderWizard();"
              />
              <div class="flex-1">
                <span class="font-semibold">${mode.label}</span>
                <p class="text-sm text-base-content/60">${mode.description}</p>
              </div>
            </label>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderProgressBar() {
  const step = wizardState.currentStep;
  return `
    <ul class="steps w-full mb-6">
      <li class="step ${step >= 1 ? 'step-primary' : ''}" onclick="wizardState.goToStep(1)">Wat</li>
      <li class="step ${step >= 2 ? 'step-primary' : ''}" onclick="if(wizardState.canProceed(2)) wizardState.goToStep(2)">Context</li>
      <li class="step ${step >= 3 ? 'step-primary' : ''}" onclick="if(wizardState.canProceed(3)) wizardState.goToStep(3)">Presentatie</li>
    </ul>
  `;
}

function renderActions() {
  const step = wizardState.currentStep;
  const canPreview = wizardState.canProceed(4);

  return `
    <div class="flex justify-between items-center mt-6 pt-4 border-t">
      <div>
        ${step > 1 ? `
          <button class="btn btn-outline" onclick="wizardState.goToStep(${step - 1})">
            ← Vorige
          </button>
        ` : ''}
      </div>
      <div class="flex gap-2">
        ${step < 3 ? `
          <button 
            class="btn btn-primary" 
            ${!wizardState.canProceed(step + 1) ? 'disabled' : ''}
            onclick="wizardState.goToStep(${step + 1})"
          >
            Volgende →
          </button>
        ` : ''}
        ${canPreview ? `
          <button class="btn btn-outline btn-info" onclick="previewQuery()">
            Preview (10 rijen)
          </button>
          <button class="btn btn-primary" onclick="executeQuery()">
            Uitvoeren
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderWizard() {
  const container = document.getElementById('wizard-container');
  if (!container) return;

  let content = '';
  switch (wizardState.currentStep) {
    case 1:
      content = renderLayer1();
      break;
    case 2:
      content = renderLayer2();
      break;
    case 3:
      content = renderLayer3();
      break;
  }

  container.innerHTML = renderProgressBar() + content + renderActions();
  
  // Refresh icons
  if (window.lucide) lucide.createIcons();
}

// ============================================================================
// API CALLS
// ============================================================================

async function previewQuery() {
  showLoading('Bezig met preview genereren...');

  try {
    const response = await fetch('/insights/api/sales-insights/semantic/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: wizardState.query })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      showError(result.error || { message: 'Preview failed' });
      return;
    }

    showResults(result.data, true);

  } catch (error) {
    showError({ message: error.message });
  } finally {
    hideLoading();
  }
}

async function executeQuery() {
  showLoading('Bezig met query uitvoeren...');

  try {
    const response = await fetch('/insights/api/sales-insights/semantic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: wizardState.query })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      showError(result.error || { message: 'Query failed' });
      return;
    }

    showResults(result.data, false);

  } catch (error) {
    showError({ message: error.message });
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
        <h3 class="font-bold">${error.message}</h3>
        ${error.explanation ? `<p class="text-sm mt-1">${error.explanation}</p>` : ''}
        ${error.suggestions ? `
          <ul class="list-disc list-inside mt-2">
            ${error.suggestions.map(s => `<li>${s}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    </div>
  `;
}

function showResults(data, isPreview) {
  const container = document.getElementById('results-container');
  if (!container) return;

  const { records, meta } = data;

  container.innerHTML = `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="text-xl font-bold">
              Resultaten ${isPreview ? '(Preview - 10 rijen)' : ''}
            </h3>
            ${meta.semantic_description ? `
              <p class="text-sm text-base-content/70 mt-1">"${meta.semantic_description}"</p>
            ` : ''}
            <p class="text-sm text-base-content/60">
              ${records.length} ${records.length === 1 ? 'resultaat' : 'resultaten'}
              ${meta.execution_path ? `(${meta.execution_path})` : ''}
            </p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-zebra w-full">
            <thead>
              <tr>
                ${records.length > 0 ? Object.keys(records[0]).map(key => `<th>${key}</th>`).join('') : ''}
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

        ${meta.capability_warnings && meta.capability_warnings.length > 0 ? `
          <div class="alert alert-warning mt-4">
            <div>
              <strong>Waarschuwingen:</strong>
              <ul class="list-disc list-inside">
                ${meta.capability_warnings.map(w => `<li>${w}</li>`).join('')}
              </ul>
            </div>
          </div>
        ` : ''}
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
    return value.join(', ');
  }
  return String(value);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load schema
    const response = await fetch('/insights/api/sales-insights/schema');
    const { success } = await response.json();

    if (!success) {
      throw new Error('Failed to load schema');
    }

    console.log('✅ Schema loaded');

    // Hide loading, show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

    // Render wizard
    renderWizard();

    // Initialize lucide icons
    if (window.lucide) lucide.createIcons();

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    document.getElementById('loadingState').innerHTML = `
      <div class="alert alert-error">
        <div>
          <h3 class="font-bold">Laden mislukt</h3>
          <p class="text-sm">${error.message}</p>
        </div>
      </div>
    `;
  }
});
