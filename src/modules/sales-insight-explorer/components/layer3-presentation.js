/**
 * Laag 3: Presentation Mode Component
 * 
 * Presentation options met disabled states voor incompatible opties
 * Implementeert ITERATION_8_IMPLEMENTATION.md Section 2.3
 * 
 * @module components/layer3-presentation
 */

import { getAllPresentationModes, isPresentationModeAvailable } from '../config/presentation-modes.js';

/**
 * Render Layer 3 presentation selector
 */
export function renderLayer3Presentation(selectedLayerId, presentationConfig = {}) {
  if (!selectedLayerId) {
    return `
      <div class="layer3-presentation opacity-50">
        <h3 class="text-lg font-semibold mb-4">Hoe wil je het zien?</h3>
        <p class="text-sm text-base-content/60">Selecteer eerst een laag in stap 1</p>
      </div>
    `;
  }

  const modes = getAllPresentationModes();

  return `
    <div class="layer3-presentation">
      <h3 class="text-lg font-semibold mb-4">Hoe wil je het zien?</h3>
      
      <div class="space-y-4">
        ${modes.map(mode => renderPresentationMode(mode, selectedLayerId, presentationConfig)).join('')}
      </div>
    </div>
  `;
}

/**
 * Render individual presentation mode
 */
function renderPresentationMode(mode, selectedLayerId, presentationConfig) {
  const isAvailable = isPresentationModeAvailable(mode.id, selectedLayerId);
  const isSelected = presentationConfig.type === mode.id;

  return `
    <div class="presentation-mode">
      <label class="flex items-start p-3 border rounded cursor-pointer ${!isAvailable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-base-200'} ${isSelected && isAvailable ? 'border-primary bg-primary/10' : 'border-base-300'}">
        <input 
          type="radio" 
          name="presentation-mode" 
          value="${mode.id}"
          class="radio radio-primary mt-1"
          ${!isAvailable ? 'disabled' : ''}
          ${isSelected ? 'checked' : ''}
          onchange="window.semanticBuilder.selectPresentation('${mode.id}')"
        />
        <div class="ml-3 flex-1">
          <div class="font-medium">${mode.label}</div>
          
          ${!isAvailable ? `
            <div class="text-xs text-error mt-1">
              ❌ Niet beschikbaar voor deze laag
              ${getUnavailableReason(mode.id, selectedLayerId)}
            </div>
          ` : ''}

          ${isAvailable && isSelected ? renderModeOptions(mode, selectedLayerId, presentationConfig) : ''}
        </div>
      </label>
    </div>
  `;
}

/**
 * Render mode-specific options
 */
function renderModeOptions(mode, selectedLayerId, presentationConfig) {
  switch (mode.id) {
    case 'group_by':
      return renderGroupByOptions(mode, selectedLayerId, presentationConfig);
    
    case 'compare':
      return renderCompareOptions(mode, presentationConfig);
    
    case 'trend':
      return renderTrendOptions(mode, presentationConfig);
    
    case 'top_bottom':
      return renderTopBottomOptions(mode, presentationConfig);
    
    case 'summarize':
      return renderSummarizeOptions(mode, presentationConfig);
    
    default:
      return '';
  }
}

/**
 * Render group_by options
 */
function renderGroupByOptions(mode, selectedLayerId, presentationConfig) {
  const fields = mode.getAvailableFields(selectedLayerId);

  return `
    <div class="mt-3 ml-6">
      <select 
        class="select select-sm select-bordered w-full max-w-xs"
        onchange="window.semanticBuilder.updatePresentationOption('group_by', this.value)"
      >
        <option value="">Kies groepering...</option>
        ${fields.map(field => `
          <option value="${field.value}" ${presentationConfig.group_by === field.value ? 'selected' : ''}>
            ${field.label}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

/**
 * Render compare options
 */
function renderCompareOptions(mode, presentationConfig) {
  return `
    <div class="mt-3 ml-6 space-y-2">
      ${mode.options.map(option => `
        <label class="flex items-center cursor-pointer">
          <input 
            type="radio" 
            name="compare-type" 
            value="${option.id}"
            class="radio radio-sm radio-primary"
            ${presentationConfig.comparison_type === option.id ? 'checked' : ''}
            onchange="window.semanticBuilder.updatePresentationOption('comparison_type', '${option.id}')"
          />
          <span class="ml-2 text-sm">${option.label}</span>
        </label>
      `).join('')}
    </div>
  `;
}

/**
 * Render trend options
 */
function renderTrendOptions(mode, presentationConfig) {
  return `
    <div class="mt-3 ml-6">
      <select 
        class="select select-sm select-bordered w-full max-w-xs"
        onchange="window.semanticBuilder.updatePresentationOption('interval', this.value)"
      >
        ${mode.options.map(option => `
          <option value="${option.id}" ${presentationConfig.interval === option.id ? 'selected' : ''}>
            ${option.label}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

/**
 * Render top/bottom options
 */
function renderTopBottomOptions(mode, presentationConfig) {
  return `
    <div class="mt-3 ml-6 flex gap-4">
      <select 
        class="select select-sm select-bordered"
        onchange="window.semanticBuilder.updatePresentationOption('limit', parseInt(this.value))"
      >
        ${mode.options.map(option => `
          <option value="${option.value}" ${presentationConfig.limit === option.value ? 'selected' : ''}>
            ${option.label}
          </option>
        `).join('')}
      </select>
      
      <select 
        class="select select-sm select-bordered"
        onchange="window.semanticBuilder.updatePresentationOption('direction', this.value)"
      >
        ${mode.direction_options.map(option => `
          <option value="${option.value}" ${presentationConfig.direction === option.value ? 'selected' : ''}>
            ${option.label}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

/**
 * Render summarize options
 */
function renderSummarizeOptions(mode, presentationConfig) {
  return `
    <div class="mt-3 ml-6">
      <select 
        class="select select-sm select-bordered w-full max-w-xs"
        onchange="window.semanticBuilder.updatePresentationOption('function', this.value)"
      >
        ${mode.options.map(option => `
          <option value="${option.value}" ${presentationConfig.function === option.value ? 'selected' : ''}>
            ${option.label}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

/**
 * Get reason why mode is unavailable
 */
function getUnavailableReason(modeId, layerId) {
  const reasons = {
    'trend_stage_distribution': 'Categorische data kan niet als trend getoond worden',
    'trend_building_context': 'Gebouw-context heeft geen inherente tijdsdimensie'
  };

  const key = `${modeId}_${layerId}`;
  const reason = reasons[key];

  return reason ? `<br/><span class="text-xs">(${reason})</span>` : '';
}
