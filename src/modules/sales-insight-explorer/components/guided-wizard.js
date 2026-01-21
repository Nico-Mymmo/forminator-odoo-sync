/**
 * Guided Wizard Container
 * 
 * Orchestrates 3-staps wizard voor semantic query building
 * Implementeert ITERATION_8_IMPLEMENTATION.md Section 2.4
 * 
 * @module components/guided-wizard
 */

import { renderLayer1Selector } from '/insights/components/layer1-selector.js';
import { renderLayer2Filters } from '/insights/components/layer2-filters.js';
import { renderLayer3Presentation } from '/insights/components/layer3-presentation.js';
import { validateSemanticQuery, SemanticError } from '/insights/lib/semantic-validator.js';
import { translateSemanticQuery, describeSemanticQuery } from '/insights/lib/semantic-translator.js';

/**
 * Guided Wizard State
 */
class GuidedWizardState {
  constructor() {
    this.currentStep = 1;
    this.semanticQuery = {
      layer_id: null,
      sub_option: null,
      context: {},
      presentation: {},
      fields: []
    };
  }

  selectLayer(layerId) {
    this.semanticQuery.layer_id = layerId;
    this.semanticQuery.sub_option = null; // Reset sub-option
  }

  selectSubOption(subOptionId) {
    this.semanticQuery.sub_option = subOptionId;
  }

  updateFilter(filterId, value) {
    this.semanticQuery.context[filterId] = value;
  }

  toggleFilterCheckbox(filterId, optionId, checked) {
    if (!this.semanticQuery.context[filterId]) {
      this.semanticQuery.context[filterId] = [];
    }

    const values = this.semanticQuery.context[filterId];
    
    if (checked && !values.includes(optionId)) {
      values.push(optionId);
    } else if (!checked) {
      const index = values.indexOf(optionId);
      if (index > -1) {
        values.splice(index, 1);
      }
    }
  }

  selectPresentation(presentationType) {
    this.semanticQuery.presentation = {
      type: presentationType
    };
  }

  updatePresentationOption(key, value) {
    this.semanticQuery.presentation[key] = value;
  }

  canProceedToStep(step) {
    switch (step) {
      case 2:
        return !!this.semanticQuery.layer_id;
      case 3:
        return !!this.semanticQuery.layer_id;
      case 4: // Preview
        return !!this.semanticQuery.layer_id && !!this.semanticQuery.presentation.type;
      default:
        return false;
    }
  }

  validate() {
    try {
      const validation = validateSemanticQuery(this.semanticQuery);
      return validation;
    } catch (error) {
      return {
        valid: false,
        message: error.message,
        explanation: error.explanation,
        suggestions: error.suggestions
      };
    }
  }
}

/**
 * Render Guided Wizard
 */
export function renderGuidedWizard() {
  const state = window.semanticBuilderState || new GuidedWizardState();
  window.semanticBuilderState = state;

  // Initialize window.semanticBuilder API
  if (!window.semanticBuilder) {
    window.semanticBuilder = {
      selectLayer: (id) => {
        state.selectLayer(id);
        renderWizard();
      },
      selectSubOption: (id) => {
        state.selectSubOption(id);
        renderWizard();
      },
      updateFilter: (filterId, value) => {
        state.updateFilter(filterId, value);
        renderWizard();
      },
      toggleFilterCheckbox: (filterId, optionId, checked) => {
        state.toggleFilterCheckbox(filterId, optionId, checked);
        renderWizard();
      },
      selectPresentation: (type) => {
        state.selectPresentation(type);
        renderWizard();
      },
      updatePresentationOption: (key, value) => {
        state.updatePresentationOption(key, value);
        renderWizard();
      },
      goToStep: (step) => {
        if (step > state.currentStep && !state.canProceedToStep(step)) {
          alert('Voltooi eerst de huidige stap');
          return;
        }
        state.currentStep = step;
        renderWizard();
      },
      preview: async () => {
        await previewQuery();
      },
      execute: async () => {
        await executeQuery();
      }
    };
  }

  return `
    <div class="guided-wizard">
      ${renderProgressBar(state)}
      ${renderWizardContent(state)}
      ${renderActions(state)}
    </div>
  `;
}

/**
 * Render progress bar
 */
function renderProgressBar(state) {
  const steps = [
    { num: 1, label: 'Wat' },
    { num: 2, label: 'Context' },
    { num: 3, label: 'Presentatie' }
  ];

  return `
    <div class="wizard-progress mb-8">
      <ul class="steps w-full">
        ${steps.map(step => `
          <li class="step ${state.currentStep >= step.num ? 'step-primary' : ''}" 
              onclick="window.semanticBuilder.goToStep(${step.num})">
            ${step.label}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

/**
 * Render wizard content
 */
function renderWizardContent(state) {
  switch (state.currentStep) {
    case 1:
      return renderLayer1Selector(state.semanticQuery.layer_id);
    case 2:
      return renderLayer2Filters(state.semanticQuery.layer_id, state.semanticQuery.context);
    case 3:
      return renderLayer3Presentation(state.semanticQuery.layer_id, state.semanticQuery.presentation);
    default:
      return '<p>Invalid step</p>';
  }
}

/**
 * Render action buttons
 */
function renderActions(state) {
  const canPreview = state.canProceedToStep(4);
  const description = canPreview ? describeSemanticQuery(state.semanticQuery) : '';

  return `
    <div class="wizard-actions mt-8 border-t pt-4">
      ${canPreview ? `
        <div class="bg-base-200 p-4 rounded mb-4">
          <div class="text-sm font-medium mb-1">Je vraag:</div>
          <div class="text-lg">"${description}"</div>
        </div>
      ` : ''}

      <div class="flex justify-between items-center">
        <div>
          ${state.currentStep > 1 ? `
            <button 
              class="btn btn-outline"
              onclick="window.semanticBuilder.goToStep(${state.currentStep - 1})"
            >
              ← Vorige
            </button>
          ` : ''}
        </div>

        <div class="flex gap-2">
          ${state.currentStep < 3 ? `
            <button 
              class="btn btn-primary"
              ${!state.canProceedToStep(state.currentStep + 1) ? 'disabled' : ''}
              onclick="window.semanticBuilder.goToStep(${state.currentStep + 1})"
            >
              Volgende →
            </button>
          ` : ''}

          ${canPreview ? `
            <button 
              class="btn btn-outline btn-info"
              onclick="window.semanticBuilder.preview()"
            >
              Preview (10 rijen)
            </button>
            <button 
              class="btn btn-primary"
              onclick="window.semanticBuilder.execute()"
            >
              Uitvoeren
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Re-render wizard
 */
function renderWizard() {
  const container = document.getElementById('wizard-container');
  if (container) {
    container.innerHTML = renderGuidedWizard();
  }
}

/**
 * Preview query
 */
async function previewQuery() {
  const state = window.semanticBuilderState;
  
  // Validate
  const validation = state.validate();
  if (!validation.valid) {
    showError(validation);
    return;
  }

  try {
    showLoading('Bezig met preview genereren...');

    // Get schema
    const schemaResp = await fetch('/api/sales-insights/schema');
    const { schema } = await schemaResp.json();

    // Translate
    const technicalQuery = translateSemanticQuery(state.semanticQuery, schema);

    // Execute preview
    const response = await fetch('/api/sales-insights/query/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: technicalQuery })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Preview failed');
    }

    showResults(result, true);

  } catch (error) {
    showError({ message: error.message });
  } finally {
    hideLoading();
  }
}

/**
 * Execute query
 */
async function executeQuery() {
  const state = window.semanticBuilderState;
  
  // Validate
  const validation = state.validate();
  if (!validation.valid) {
    showError(validation);
    return;
  }

  try {
    showLoading('Bezig met query uitvoeren...');

    // Get schema
    const schemaResp = await fetch('/api/sales-insights/schema');
    const { schema } = await schemaResp.json();

    // Translate
    const technicalQuery = translateSemanticQuery(state.semanticQuery, schema);

    // Execute
    const response = await fetch('/api/sales-insights/query/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: technicalQuery })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Query failed');
    }

    showResults(result, false);

  } catch (error) {
    showError({ message: error.message });
  } finally {
    hideLoading();
  }
}

/**
 * Show error
 */
function showError(validation) {
  const container = document.getElementById('results-container');
  if (!container) return;

  container.innerHTML = `
    <div class="alert alert-error">
      <div>
        <h3 class="font-bold">${validation.message}</h3>
        ${validation.explanation ? `<p class="text-sm mt-1">${validation.explanation}</p>` : ''}
        ${validation.suggestions ? `
          <div class="mt-2">
            <strong>Suggesties:</strong>
            <ul class="list-disc list-inside">
              ${validation.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Show loading
 */
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

/**
 * Hide loading
 */
function hideLoading() {
  // Handled by showResults or showError
}

/**
 * Show results
 */
function showResults(result, isPreview) {
  const container = document.getElementById('results-container');
  if (!container) return;

  const { records, meta } = result;

  container.innerHTML = `
    <div class="results">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="text-xl font-bold">
            Resultaten ${isPreview ? '(Preview - 10 rijen)' : ''}
          </h3>
          <p class="text-sm text-base-content/70">
            ${records.length} ${records.length === 1 ? 'resultaat' : 'resultaten'} 
            ${meta.execution_path ? `(${meta.execution_path})` : ''}
          </p>
        </div>

        ${!isPreview ? `
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="exportResults('csv')">
              Export CSV
            </button>
            <button class="btn btn-outline btn-sm" onclick="exportResults('json')">
              Export JSON
            </button>
          </div>
        ` : ''}
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead>
            <tr>
              ${records.length > 0 ? Object.keys(records[0]).map(key => `
                <th>${key}</th>
              `).join('') : ''}
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
  `;
}

/**
 * Format value for display
 */
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
