/**
 * Query Builder Application
 * 
 * Client-side logic for schema-driven query building.
 * 
 * RULES:
 * - Schema is single source of truth
 * - No hardcoded models or fields
 * - Backend validation is mandatory
 * - No client-side interpretation
 */

// Application state
const state = {
  schema: null,
  capabilities: null,
  presets: null,
  currentQuery: {
    base_model: '',
    fields: [],
    filters: [],
    relations: [],
    aggregations: [],
    sorting: [],
    limit: 100
  },
  aggregationMode: false,
  lastSavedQueryId: null,
  lastExecutionResult: null
};

// Initialize application
async function init() {
  try {
    // Fetch schema with capabilities and presets
    const response = await fetch('/insights/api/sales-insights/schema', {
      credentials: 'include'
    });
    const result = await response.json();
    
    if (!result.success) {
      // Hide loading, show error prominently
      const loadingState = document.getElementById('loadingState');
      loadingState.innerHTML = `
        <div class="alert alert-error max-w-2xl">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div>
            <div class="font-bold">Failed to load schema</div>
            <div class="text-sm">${result.error?.message || 'Unknown error'}</div>
            ${result.error?.hint ? '<div class="text-xs mt-1">' + result.error.hint + '</div>' : ''}
          </div>
          <button class="btn btn-sm" onclick="location.reload()">Retry</button>
        </div>
      `;
      return;
    }
    
    state.schema = result.data.schema;
    state.capabilities = result.data.capabilities;
    state.presets = result.data.presets || [];
    
    // Populate model selector
    populateModelSelector();
    
    // Show main content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
  } catch (error) {
    // Hide loading, show connection error
    const loadingState = document.getElementById('loadingState');
    loadingState.innerHTML = `
      <div class="alert alert-error max-w-2xl">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <div class="font-bold">Connection error</div>
          <div class="text-sm">${error.message}</div>
        </div>
        <button class="btn btn-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// Populate model selector from schema
function populateModelSelector() {
  const select = document.getElementById('baseModelSelect');
  const models = Object.keys(state.schema.models).sort();
  
  models.forEach(modelName => {
    const option = document.createElement('option');
    option.value = modelName;
    option.textContent = modelName;
    select.appendChild(option);
  });
}

// Handle model selection
function onModelSelect() {
  const modelName = document.getElementById('baseModelSelect').value;
  
  if (!modelName) {
    hideSteps();
    return;
  }
  
  state.currentQuery.base_model = modelName;
  state.currentQuery.fields = [];
  state.currentQuery.filters = [];
  state.currentQuery.relations = [];
  state.currentQuery.aggregations = [];
  
  // Show model info
  showModelInfo(modelName);
  
  // Show field selection
  showFieldSelection(modelName);
  
  // Update query preview
  updateQueryPreview();
}

// Show model information and capabilities
function showModelInfo(modelName) {
  const capabilities = state.capabilities[modelName];
  const modelInfo = document.getElementById('modelInfo');
  const modelNameEl = document.getElementById('modelName');
  const modelCapsEl = document.getElementById('modelCapabilities');
  
  modelNameEl.textContent = modelName;
  
  if (capabilities) {
    const caps = [];
    if (capabilities.supports_read_group) caps.push('Aggregations');
    if (capabilities.max_relation_depth > 0) caps.push(`Relations (depth: ${capabilities.max_relation_depth})`);
    if (capabilities.large_dataset) caps.push('⚠️ Large dataset');
    
    modelCapsEl.textContent = caps.join(' • ') || 'Basic queries only';
  } else {
    modelCapsEl.textContent = 'No capability info available';
  }
  
  modelInfo.style.display = 'flex';
}

// Show field selection
function showFieldSelection(modelName) {
  const fieldList = document.getElementById('fieldList');
  fieldList.innerHTML = '';
  
  const model = state.schema.models[modelName];
  const fields = Object.entries(model.fields).sort(([a], [b]) => a.localeCompare(b));
  
  fields.forEach(([fieldName, fieldInfo]) => {
    const div = document.createElement('div');
    div.className = 'form-control';
    div.innerHTML = `
      <label class="label cursor-pointer justify-start gap-2">
        <input type="checkbox" class="checkbox checkbox-sm" 
               onchange="toggleField('${modelName}', '${fieldName}')"
               data-field="${fieldName}">
        <span class="label-text text-sm">
          <span class="font-medium">${fieldName}</span>
          <span class="text-xs text-base-content/60 ml-1">(${fieldInfo.type})</span>
        </span>
      </label>
    `;
    fieldList.appendChild(div);
  });
  
  document.getElementById('fieldSelectionCard').style.display = 'block';
  document.getElementById('filterCard').style.display = 'block';
  document.getElementById('aggregationCard').style.display = 'block';
  document.getElementById('relationCard').style.display = 'block';
}

// Filter fields by search
function filterFields() {
  const search = document.getElementById('fieldSearch').value.toLowerCase();
  const checkboxes = document.querySelectorAll('#fieldList .form-control');
  
  checkboxes.forEach(control => {
    const text = control.textContent.toLowerCase();
    control.style.display = text.includes(search) ? 'block' : 'none';
  });
}

// Toggle field selection
function toggleField(model, fieldName) {
  const checkbox = document.querySelector(`input[data-field="${fieldName}"]`);
  
  if (checkbox.checked) {
    state.currentQuery.fields.push({
      model: model,
      field: fieldName,
      alias: fieldName
    });
  } else {
    state.currentQuery.fields = state.currentQuery.fields.filter(
      f => f.field !== fieldName
    );
  }
  
  updateSelectedFieldCount();
  updateQueryPreview();
}

// Update selected field count
function updateSelectedFieldCount() {
  document.getElementById('selectedFieldCount').textContent = state.currentQuery.fields.length;
}

// Add filter
function addFilter() {
  const filterList = document.getElementById('filterList');
  const filterId = 'filter_' + Date.now();
  
  const div = document.createElement('div');
  div.className = 'card bg-base-200';
  div.id = filterId;
  div.innerHTML = `
    <div class="card-body p-3">
      <div class="flex gap-2">
        <select class="select select-bordered select-sm flex-1" onchange="updateFilter('${filterId}')">
          <option value="">Select field...</option>
          ${state.currentQuery.fields.map(f => `<option value="${f.field}">${f.field}</option>`).join('')}
        </select>
        <select class="select select-bordered select-sm" onchange="updateFilter('${filterId}')">
          <option value="=">=</option>
          <option value="!=">!=</option>
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value=">=">&gt;=</option>
          <option value="<=">&lt;=</option>
          <option value="like">like</option>
          <option value="in">in</option>
        </select>
        <input type="text" class="input input-bordered input-sm flex-1" placeholder="value" onchange="updateFilter('${filterId}')">
        <button onclick="removeFilter('${filterId}')" class="btn btn-ghost btn-sm btn-square">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `;
  
  filterList.appendChild(div);
  lucide.createIcons();
}

// Update filter
function updateFilter(filterId) {
  const div = document.getElementById(filterId);
  const selects = div.querySelectorAll('select');
  const input = div.querySelector('input');
  
  const field = selects[0].value;
  const operator = selects[1].value;
  const value = input.value;
  
  if (!field || !value) return;
  
  // Remove old filter for this field
  state.currentQuery.filters = state.currentQuery.filters.filter(f => f.field !== field);
  
  // Add new filter
  state.currentQuery.filters.push({
    model: state.currentQuery.base_model,
    field: field,
    operator: operator,
    value: parseValue(value)
  });
  
  updateQueryPreview();
}

// Remove filter
function removeFilter(filterId) {
  const div = document.getElementById(filterId);
  const field = div.querySelector('select').value;
  
  state.currentQuery.filters = state.currentQuery.filters.filter(f => f.field !== field);
  div.remove();
  updateQueryPreview();
}

// Parse filter value
function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (!isNaN(value) && value.trim() !== '') return Number(value);
  return value;
}

// Toggle aggregation mode
function toggleAggregationMode() {
  state.aggregationMode = !state.aggregationMode;
  document.getElementById('aggregationContent').style.display = state.aggregationMode ? 'block' : 'none';
  document.getElementById('aggregationModeText').textContent = state.aggregationMode ? 'Disable' : 'Enable';
}

// Add aggregation
function addAggregation() {
  const aggList = document.getElementById('aggregationList');
  const aggId = 'agg_' + Date.now();
  
  const div = document.createElement('div');
  div.className = 'card bg-base-200';
  div.id = aggId;
  div.innerHTML = `
    <div class="card-body p-3">
      <div class="flex gap-2">
        <select class="select select-bordered select-sm" onchange="updateAggregation('${aggId}')">
          <option value="">Function...</option>
          <option value="count">count</option>
          <option value="sum">sum</option>
          <option value="avg">avg</option>
          <option value="min">min</option>
          <option value="max">max</option>
        </select>
        <select class="select select-bordered select-sm flex-1" onchange="updateAggregation('${aggId}')">
          <option value="">Field...</option>
          ${state.currentQuery.fields.map(f => `<option value="${f.field}">${f.field}</option>`).join('')}
        </select>
        <input type="text" class="input input-bordered input-sm" placeholder="alias" onchange="updateAggregation('${aggId}')">
        <button onclick="removeAggregation('${aggId}')" class="btn btn-ghost btn-sm btn-square">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `;
  
  aggList.appendChild(div);
  lucide.createIcons();
}

// Update aggregation
function updateAggregation(aggId) {
  const div = document.getElementById(aggId);
  const selects = div.querySelectorAll('select');
  const input = div.querySelector('input');
  
  const func = selects[0].value;
  const field = selects[1].value;
  const alias = input.value || `${func}_${field}`;
  
  if (!func) return;
  
  state.currentQuery.aggregations = state.currentQuery.aggregations.filter(a => a.alias !== alias);
  
  state.currentQuery.aggregations.push({
    model: state.currentQuery.base_model,
    function: func,
    field: field || null,
    alias: alias
  });
  
  updateQueryPreview();
}

// Remove aggregation
function removeAggregation(aggId) {
  const div = document.getElementById(aggId);
  const alias = div.querySelector('input').value;
  
  state.currentQuery.aggregations = state.currentQuery.aggregations.filter(a => a.alias !== alias);
  div.remove();
  updateQueryPreview();
}

// Add relation
function addRelation() {
  showInfo('Relation traversal is advanced - ensure field is many2one type');
  const relationList = document.getElementById('relationList');
  const relId = 'rel_' + Date.now();
  
  const div = document.createElement('div');
  div.className = 'card bg-base-200';
  div.id = relId;
  div.innerHTML = `
    <div class="card-body p-3">
      <div class="flex gap-2 mb-2">
        <input type="text" class="input input-bordered input-sm flex-1" placeholder="from_model" value="${state.currentQuery.base_model}" readonly>
        <input type="text" class="input input-bordered input-sm flex-1" placeholder="field (many2one)" onchange="updateRelation('${relId}')">
      </div>
      <div class="flex gap-2">
        <input type="text" class="input input-bordered input-sm flex-1" placeholder="to_model" onchange="updateRelation('${relId}')">
        <button onclick="removeRelation('${relId}')" class="btn btn-ghost btn-sm btn-square">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `;
  
  relationList.appendChild(div);
  lucide.createIcons();
}

// Update relation
function updateRelation(relId) {
  const div = document.getElementById(relId);
  const inputs = div.querySelectorAll('input');
  
  const fromModel = inputs[0].value;
  const field = inputs[1].value;
  const toModel = inputs[2].value;
  
  if (!field || !toModel) return;
  
  state.currentQuery.relations = state.currentQuery.relations.filter(r => r.field !== field);
  
  state.currentQuery.relations.push({
    from_model: fromModel,
    field: field,
    to_model: toModel
  });
  
  updateQueryPreview();
}

// Remove relation
function removeRelation(relId) {
  const div = document.getElementById(relId);
  const field = div.querySelectorAll('input')[1].value;
  
  state.currentQuery.relations = state.currentQuery.relations.filter(r => r.field !== field);
  div.remove();
  updateQueryPreview();
}

// Update query preview
function updateQueryPreview() {
  const preview = document.getElementById('queryPreview');
  preview.value = JSON.stringify(state.currentQuery, null, 2);
}

// Validate query
async function validateQuery() {
  if (!state.currentQuery.base_model || state.currentQuery.fields.length === 0) {
    showError('Please select a base model and at least one field');
    return;
  }
  
  showInfo('Validating query...');
  
  try {
    const response = await fetch('/insights/api/sales-insights/query/validate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: state.currentQuery })
    });
    
    const result = await response.json();
    
    if (result.success && result.data.valid) {
      showSuccess('✓ Query is valid! You can now save or run it.');
      document.getElementById('saveBtn').disabled = false;
      document.getElementById('runBtn').disabled = false;
      document.getElementById('previewBtn').disabled = false;
    } else {
      const errors = result.data?.validation_errors || [];
      showError('Validation failed:\\n' + errors.map(e => `• ${e.message}`).join('\\n'));
      document.getElementById('saveBtn').disabled = true;
      document.getElementById('runBtn').disabled = true;
      document.getElementById('previewBtn').disabled = true;
    }
  } catch (error) {
    showError('Validation request failed: ' + error.message);
  }
}

// Save query
async function saveQuery() {
  const name = prompt('Enter a name for this query:');
  if (!name) return;
  
  const description = prompt('Enter a description (optional):');
  
  showInfo('Saving query...');
  
  try {
    const response = await fetch('/insights/api/sales-insights/query/save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        description: description,
        query: state.currentQuery
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      state.lastSavedQueryId = result.data.id;
      showSuccess(`✓ Query saved! ID: ${result.data.id}`);
      document.getElementById('exportJsonBtn').disabled = false;
      document.getElementById('exportCsvBtn').disabled = false;
    } else {
      showError('Save failed: ' + (result.error?.message || 'Unknown error'));
    }
  } catch (error) {
    showError('Save request failed: ' + error.message);
  }
}

// Run query
async function runQuery(previewMode = false) {
  showInfo(previewMode ? 'Running preview...' : 'Executing query...');
  
  try {
    const response = await fetch('/insights/api/sales-insights/query/run', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: state.currentQuery,
        mode: previewMode ? 'preview' : 'full'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      state.lastExecutionResult = result.data;
      showSuccess(`✓ Query executed! ${result.data.records.length} records returned.`);
      showResults(result.data);
      document.getElementById('exportJsonBtn').disabled = false;
      document.getElementById('exportCsvBtn').disabled = false;
    } else {
      showError('Execution failed: ' + (result.error?.message || 'Unknown error'));
    }
  } catch (error) {
    showError('Execution request failed: ' + error.message);
  }
}

// Show results
function showResults(data) {
  const modal = document.getElementById('resultsModal');
  const content = document.getElementById('resultsContent');
  
  if (!data.records || data.records.length === 0) {
    content.innerHTML = '<div class="alert">No records found</div>';
  } else {
    // Build table
    const firstRecord = data.records[0];
    const columns = Object.keys(firstRecord);
    
    let html = '<table class="table table-zebra table-sm"><thead><tr>';
    columns.forEach(col => {
      html += `<th class="text-xs">${col}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    data.records.slice(0, 100).forEach(record => {
      html += '<tr>';
      columns.forEach(col => {
        const value = record[col];
        const display = value !== null && value !== undefined ? String(value) : '';
        html += `<td class="text-xs">${display}</td>`;
      });
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    if (data.records.length > 100) {
      html += `<div class="alert alert-info mt-2">Showing first 100 of ${data.records.length} records</div>`;
    }
    
    content.innerHTML = html;
  }
  
  modal.showModal();
}

// Export query
async function exportQuery(format) {
  if (!state.lastSavedQueryId) {
    showError('Please save the query first');
    return;
  }
  
  showInfo(`Exporting to ${format.toUpperCase()}...`);
  
  try {
    const response = await fetch(`/api/sales-insights/query/run/${state.lastSavedQueryId}/export`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: format })
    });
    
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `query_export_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showSuccess(`✓ Exported to ${format.toUpperCase()}`);
    } else {
      const result = await response.json();
      showError('Export failed: ' + (result.error?.message || 'Unknown error'));
    }
  } catch (error) {
    showError('Export request failed: ' + error.message);
  }
}

// Load saved queries
async function loadSavedQueries() {
  try {
    const response = await fetch('/insights/api/sales-insights/query/list', {
      credentials: 'include'
    });
    const result = await response.json();
    
    if (result.success) {
      const list = document.getElementById('savedQueriesList');
      list.innerHTML = '';
      
      if (result.data.queries.length === 0) {
        list.innerHTML = '<div class="alert">No saved queries</div>';
      } else {
        result.data.queries.forEach(query => {
          const div = document.createElement('div');
          div.className = 'card bg-base-200';
          div.innerHTML = `
            <div class="card-body p-3">
              <div class="flex justify-between items-start">
                <div>
                  <h4 class="font-bold">${query.name}</h4>
                  <p class="text-xs text-base-content/60">${query.description || ''}</p>
                  <p class="text-xs text-base-content/60 mt-1">Model: ${query.base_model}</p>
                </div>
                <button onclick="loadQuery('${query.id}')" class="btn btn-sm btn-primary">Load</button>
              </div>
            </div>
          `;
          list.appendChild(div);
        });
      }
      
      document.getElementById('savedQueriesModal').showModal();
    }
  } catch (error) {
    showError('Failed to load saved queries: ' + error.message);
  }
}

// Load specific query
async function loadQuery(queryId) {
  try {
    const response = await fetch(`/api/sales-insights/query/list`, {
      credentials: 'include'
    });
    const result = await response.json();
    
    if (result.success) {
      const query = result.data.queries.find(q => q.id === queryId);
      if (query && query.query_definition) {
        state.currentQuery = query.query_definition;
        state.lastSavedQueryId = query.id;
        
        // Update UI
        document.getElementById('baseModelSelect').value = state.currentQuery.base_model;
        onModelSelect();
        
        // Check fields
        state.currentQuery.fields.forEach(field => {
          const checkbox = document.querySelector(`input[data-field="${field.field}"]`);
          if (checkbox) checkbox.checked = true;
        });
        
        updateSelectedFieldCount();
        updateQueryPreview();
        
        document.getElementById('savedQueriesModal').close();
        showSuccess('✓ Query loaded');
      }
    }
  } catch (error) {
    showError('Failed to load query: ' + error.message);
  }
}

// Load presets
function loadPresets() {
  const list = document.getElementById('presetsList');
  list.innerHTML = '';
  
  if (!state.presets || state.presets.length === 0) {
    list.innerHTML = '<div class="alert">No presets available</div>';
  } else {
    state.presets.forEach(preset => {
      const div = document.createElement('div');
      div.className = 'card bg-base-200';
      div.innerHTML = `
        <div class="card-body p-3">
          <div class="flex justify-between items-start">
            <div>
              <div class="flex gap-2 items-center mb-1">
                <h4 class="font-bold">${preset.name}</h4>
                <span class="badge badge-sm">${preset.category}</span>
              </div>
              <p class="text-xs text-base-content/60">${preset.description}</p>
              <p class="text-xs text-base-content/60 mt-1">Model: ${preset.base_model}</p>
            </div>
            <button onclick="loadPreset('${preset.id}')" class="btn btn-sm btn-primary">Use</button>
          </div>
        </div>
      `;
      list.appendChild(div);
    });
  }
  
  document.getElementById('presetsModal').showModal();
}

// Load preset
function loadPreset(presetId) {
  const preset = state.presets.find(p => p.id === presetId);
  if (preset && preset.query) {
    state.currentQuery = JSON.parse(JSON.stringify(preset.query));
    
    // Update UI
    document.getElementById('baseModelSelect').value = state.currentQuery.base_model;
    onModelSelect();
    
    // Check fields
    state.currentQuery.fields.forEach(field => {
      const checkbox = document.querySelector(`input[data-field="${field.field}"]`);
      if (checkbox) checkbox.checked = true;
    });
    
    updateSelectedFieldCount();
    updateQueryPreview();
    
    document.getElementById('presetsModal').close();
    showSuccess('✓ Preset loaded');
  }
}

// Copy query to clipboard
function copyQuery() {
  const textarea = document.getElementById('queryPreview');
  textarea.select();
  document.execCommand('copy');
  showSuccess('✓ Copied to clipboard');
}

// UI helpers
function showError(message) {
  showStatus(message, 'alert-error');
}

function showSuccess(message) {
  showStatus(message, 'alert-success');
}

function showInfo(message) {
  showStatus(message, 'alert-info');
}

function showStatus(message, type) {
  const area = document.getElementById('statusArea');
  area.innerHTML = `
    <div class="alert ${type}">
      <span>${message}</span>
    </div>
  `;
  setTimeout(() => {
    area.innerHTML = '';
  }, 5000);
}

function hideSteps() {
  document.getElementById('modelInfo').style.display = 'none';
  document.getElementById('fieldSelectionCard').style.display = 'none';
  document.getElementById('filterCard').style.display = 'none';
  document.getElementById('aggregationCard').style.display = 'none';
  document.getElementById('relationCard').style.display = 'none';
}

// Initialize on load
init();
