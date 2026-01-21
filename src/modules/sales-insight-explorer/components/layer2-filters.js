/**
 * Laag 2: Context Filters Component
 * 
 * Context-aware filters afhankelijk van Laag 1
 * Implementeert ITERATION_8_IMPLEMENTATION.md Section 2.2
 * 
 * @module components/layer2-filters
 */

import { getAllContextFilters, getDefaultFilterValues } from '../config/context-filters.js';

/**
 * Render Layer 2 filters
 */
export function renderLayer2Filters(selectedLayerId, filterValues = {}) {
  const filters = getAllContextFilters();
  const defaults = getDefaultFilterValues();
  
  // Merge defaults with current values
  const values = { ...defaults, ...filterValues };

  return `
    <div class="layer2-filters">
      <h3 class="text-lg font-semibold mb-4">Over welke actiebladen?</h3>
      
      <div class="space-y-6">
        ${filters.map(filter => renderFilter(filter, values[filter.id])).join('')}
      </div>
    </div>
  `;
}

/**
 * Render individual filter
 */
function renderFilter(filter, selectedValue) {
  if (filter.type === 'radio') {
    return renderRadioFilter(filter, selectedValue);
  } else if (filter.type === 'checkboxes') {
    return renderCheckboxFilter(filter, selectedValue || []);
  }
  return '';
}

/**
 * Render radio filter
 */
function renderRadioFilter(filter, selectedValue) {
  return `
    <div class="filter-group">
      <label class="text-sm font-medium block mb-2">${filter.label}</label>
      <div class="space-y-1">
        ${filter.options.map(option => `
          <label class="flex items-center cursor-pointer hover:bg-base-200 p-2 rounded">
            <input 
              type="radio" 
              name="filter-${filter.id}" 
              value="${option.id}"
              class="radio radio-sm radio-primary"
              ${selectedValue === option.id ? 'checked' : ''}
              onchange="window.semanticBuilder.updateFilter('${filter.id}', '${option.id}')"
            />
            <span class="ml-2 text-sm">${option.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render checkbox filter
 */
function renderCheckboxFilter(filter, selectedValues) {
  const values = Array.isArray(selectedValues) ? selectedValues : [];

  return `
    <div class="filter-group">
      <label class="text-sm font-medium block mb-2">${filter.label}</label>
      
      ${filter.dynamic_options ? `
        <div class="text-sm text-base-content/60 mb-2">
          Tags worden geladen van Odoo...
        </div>
      ` : ''}
      
      <div class="space-y-1">
        ${filter.options.map(option => `
          <label class="flex items-center cursor-pointer hover:bg-base-200 p-2 rounded">
            <input 
              type="checkbox" 
              name="filter-${filter.id}" 
              value="${option.id}"
              class="checkbox checkbox-sm checkbox-primary"
              ${values.includes(option.id) ? 'checked' : ''}
              onchange="window.semanticBuilder.toggleFilterCheckbox('${filter.id}', '${option.id}', this.checked)"
            />
            <span class="ml-2 text-sm">${option.label}</span>
          </label>
        `).join('')}
      </div>
      
      ${filter.requires_multi_pass ? `
        <div class="text-xs text-warning mt-2">
          ⚠️ Dit filter vereist uitgebreide verwerking (2-3s)
        </div>
      ` : ''}
    </div>
  `;
}
