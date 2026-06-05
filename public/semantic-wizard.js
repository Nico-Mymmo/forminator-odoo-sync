/**
 * Semantic Wizard
 *
 * Stap 1: Startpunt kiezen (model)
 * Stap 2: Velden ophalen (field groups uit Supabase, beheer voor admins)
 * Stap 3: Filters & Export (tijdsfilter, AI preset)
 */

// ============================================================================
// ROLE
// ============================================================================
const USER_ROLE          = window.__SALES_INSIGHT__?.userRole || 'user';
const MODULE_PERMISSIONS = window.__SALES_INSIGHT__?.modulePermissions || [];
const IS_ADMIN = USER_ROLE === 'admin' || MODULE_PERMISSIONS.includes('admin');

// ============================================================================
// CACHE
// ============================================================================
let crmStagesCache        = null;
let informationSetsCache  = {};
let aiExportPresetsCache  = null;

// ============================================================================
// MODEL CONFIGURATIE (hardcoded koppelingen)
// ============================================================================
const MODEL_CONFIG = {
  'x_sales_action_sheet': {
    label: 'Actiebladen',
    icon: 'file-text',
    nameField: 'x_name',
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
    submodels: ['crm.lead'],
    // Model-specifieke filters getoond in stap 3
    extraFilters: ['apartments']
  },
  'crm.lead': {
    label: 'Leads',
    icon: 'users',
    nameField: 'name',
    dateFields: [
      { field: 'create_date',            label: 'Aanmaakdatum' },
      { field: 'date_last_stage_update', label: 'Laatste stage update' },
      { field: 'date_closed',            label: 'Afsluitdatum' }
    ],
    submodels: [],
    extraFilters: ['won_status', 'stages']
  },
  'x_web_visitor': {
    label: 'Web Visitors',
    icon: 'globe',
    nameField: 'x_name',
    dateFields: [
      { field: 'x_studio_first_seen', label: 'Eerste bezoek' },
      { field: 'x_studio_last_seen',  label: 'Laatste bezoek' }
    ],
    submodels: ['x_ad_touchpoint'],
    extraFilters: ['bounce']
  },
  'x_ad_touchpoint': {
    label: 'Ad Touchpoints',
    icon: 'mouse-pointer-click',
    nameField: 'x_name',
    dateFields: [
      { field: 'x_studio_timestamp', label: 'Tijdstip klik' }
    ],
    submodels: [],
    extraFilters: []
  }
};

// ============================================================================
// WIZARD STATE
// ============================================================================
class WizardState {
  constructor() {
    this.currentStep = 1;
    this.selectedModel = null;
    this.informationSets = {};
    this.timeFilter = { mode: null, quickPeriod: null, dateFrom: null, dateTo: null, field: null };
    this.apartmentsFilter = { min: null, max: null, include_zero: true };
    this.leadEnrichment = {
      enabled: false, mode: 'include',
      filters: { won_status: [], stage_ids: [] },
      property_groups: [], webActivity: false
    };
    this.aiPresetId = null;
    this._expandedSet = null;
    this._showAddSet = false;
    this._showAddField = null; // set_id of which set is open for adding a field
    this._editingSet = null;   // set_id being edited
    this._editingField = null; // field id being edited
    this._totalStages = 0;     // total available stages, for 'all selected' detection
  }

  selectModel(model) {
    this.selectedModel = model;
    this.informationSets = {};
    this.timeFilter.field = MODEL_CONFIG[model]?.dateFields[0]?.field || null;
    // Default: all won statuses selected
    this.leadEnrichment.filters.won_status = ['won', 'lost', 'pending'];
    this.leadEnrichment.filters.stage_ids = [];
    this._totalStages = 0;
  }

  toggleSet(setId, value) { this.informationSets[setId] = value; }

  selectAllSets(sets) { sets.forEach(s => { this.informationSets[s.id] = true; }); }
  deselectAllSets(sets) { sets.forEach(s => { this.informationSets[s.id] = false; }); }

  toggleLeadEnrichment(enabled) {
    this.leadEnrichment.enabled = enabled;
    if (!enabled) { this.leadEnrichment.filters.won_status = []; this.leadEnrichment.filters.stage_ids = []; this.leadEnrichment.webActivity = false; }
  }
  toggleWebActivity(v) { this.leadEnrichment.webActivity = v; }
  toggleLeadPropertyGroup(id, v) {
    if (v && !this.leadEnrichment.property_groups.includes(id)) this.leadEnrichment.property_groups.push(id);
    else if (!v) this.leadEnrichment.property_groups = this.leadEnrichment.property_groups.filter(g => g !== id);
  }
  setLeadWonStatusFilter(a) { this.leadEnrichment.filters.won_status = a; }
  setLeadStageFilter(a)      { this.leadEnrichment.filters.stage_ids = a; }
  setTimeFilter(from, to)    { this.timeFilter.dateFrom = from; this.timeFilter.dateTo = to; }
  setApartmentsFilter(min, max, zero) { this.apartmentsFilter = { min, max, include_zero: zero }; }

  resolvedTimeFilter() {
    const today = new Date();
    const fmt = d => d.toISOString().slice(0,10);
    const field = this.timeFilter.field || 'create_date';
    if (this.timeFilter.mode === 'quick' && this.timeFilter.quickPeriod) {
      const from = new Date(today);
      if (this.timeFilter.quickPeriod === 'week')    from.setDate(today.getDate()-7);
      if (this.timeFilter.quickPeriod === 'month')   from.setMonth(today.getMonth()-1);
      if (this.timeFilter.quickPeriod === 'quarter') from.setMonth(today.getMonth()-3);
      if (this.timeFilter.quickPeriod === 'year')    from.setFullYear(today.getFullYear()-1);
      return { from: fmt(from), to: fmt(today), field };
    }
    if (this.timeFilter.mode === 'from' && this.timeFilter.dateFrom) return { from: this.timeFilter.dateFrom, to: fmt(today), field };
    if (this.timeFilter.mode === 'range') return { from: this.timeFilter.dateFrom, to: this.timeFilter.dateTo, field };
    return { from: null, to: null, field };
  }

  buildPayload() {
    const model = this.selectedModel || 'x_sales_action_sheet';
    const modelCfgForPayload = MODEL_CONFIG[model] || {};
    const nameField = modelCfgForPayload.nameField || 'name';
    const payload = {
      base_model: model,
      fields: [
        { model, field: 'id' },
        { model, field: nameField },
        { model, field: 'create_date' }
      ],
      filters: []
    };

    const sets = informationSetsCache[model] || [];
    sets.forEach(set => {
      if (this.informationSets[set.id]) {
        (set.information_set_fields || []).forEach(f => {
          payload.fields.push({ model, field: f.field_key });
        });
      }
    });

    const tf = this.resolvedTimeFilter();
    if (tf.from && tf.field) payload.filters.push({ model, field: tf.field, operator: '>=', value: tf.from });
    if (tf.to   && tf.field) payload.filters.push({ model, field: tf.field, operator: '<=', value: tf.to });

    if ((modelCfgForPayload.extraFilters || []).includes('apartments')) {
      if (this.apartmentsFilter.min !== null) payload.filters.push({ model, field: 'x_studio_number_of_apartments', operator: '>=', value: parseInt(this.apartmentsFilter.min, 10) });
      if (this.apartmentsFilter.max !== null) payload.filters.push({ model, field: 'x_studio_number_of_apartments', operator: '<=', value: parseInt(this.apartmentsFilter.max, 10) });
      if (this.apartmentsFilter.include_zero === false) payload.filters.push({ model, field: 'x_studio_number_of_apartments', operator: '>', value: 0 });
    }

    // Direct lead filters (when crm.lead is the root model)
    if ((modelCfgForPayload.extraFilters || []).includes('won_status')) {
      // Always filter on type = opportunity for crm.lead
      payload.filters.push({ model, field: 'type', operator: '=', value: 'opportunity' });
      const allWon = ['won', 'lost', 'pending'];
      const selectedWon = this.leadEnrichment.filters.won_status;
      // Only add filter if not all statuses selected
      if (selectedWon.length > 0 && selectedWon.length < allWon.length) {
        payload.filters.push({ model, field: 'won_status', operator: 'in', value: selectedWon });
      }
      // Only add stage filter if not all stages selected
      const totalStages = this._totalStages || 0;
      const selectedStages = this.leadEnrichment.filters.stage_ids;
      if (selectedStages.length > 0 && (totalStages === 0 || selectedStages.length < totalStages)) {
        payload.filters.push({ model, field: 'stage_id', operator: 'in', value: selectedStages });
      }
    }

    if (this.leadEnrichment.enabled) {
      payload.lead_enrichment = { enabled: true, mode: this.leadEnrichment.mode, filters: {} };
      const allWonSub = ['won', 'lost', 'pending'];
      if (this.leadEnrichment.filters.won_status.length > 0 && this.leadEnrichment.filters.won_status.length < allWonSub.length) {
        payload.lead_enrichment.filters.won_status = this.leadEnrichment.filters.won_status;
      }
      const totalStagesSub = this._totalStages || 0;
      const selectedStagesSub = this.leadEnrichment.filters.stage_ids;
      if (selectedStagesSub.length > 0 && (totalStagesSub === 0 || selectedStagesSub.length < totalStagesSub)) {
        payload.lead_enrichment.filters.stage_ids = selectedStagesSub;
      }
      if (this.leadEnrichment.property_groups.length)      payload.lead_enrichment.property_groups    = this.leadEnrichment.property_groups;
      if (this.leadEnrichment.webActivity)                 payload.lead_enrichment.web_activity       = true;
    }

    if (this.aiPresetId && aiExportPresetsCache) {
      const preset = aiExportPresetsCache.find(p => p.id === this.aiPresetId);
      if (preset?.instruction) {
        payload.ai_context = { preset_id: preset.id, preset_label: preset.label, instruction: preset.instruction };
      }
    }

    return payload;
  }

  resetState() {
    this.currentStep = 1; this.selectedModel = null; this.informationSets = {};
    this.timeFilter = { mode: null, quickPeriod: null, dateFrom: null, dateTo: null, field: null };
    this.apartmentsFilter = { min: null, max: null, include_zero: true };
    this.leadEnrichment = { enabled: false, mode: 'include', filters: { won_status: [], stage_ids: [] }, property_groups: [], webActivity: false };
    this.aiPresetId = null; this._expandedSet = null; this._showAddSet = false; this._showAddField = null;
  }
}
const wizardState = new WizardState();

// ============================================================================
// SUPABASE DATA FETCHING
// ============================================================================
async function fetchInformationSets(model) {
  if (informationSetsCache[model]) return informationSetsCache[model];
  try {
    const res = await fetch(`/insights/api/sales-insights/information-sets?model=${encodeURIComponent(model)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    informationSetsCache[model] = data.data.sets;
    return data.data.sets;
  } catch (e) { console.warn('fetchInformationSets error:', e.message); return []; }
}

async function fetchAiExportPresets() {
  if (aiExportPresetsCache) return aiExportPresetsCache;
  try {
    const res = await fetch('/insights/api/sales-insights/ai-export-presets');
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    aiExportPresetsCache = data.data.presets;
    return aiExportPresetsCache;
  } catch (e) { console.warn('fetchAiExportPresets error:', e.message); return []; }
}

async function fetchCrmStages() {
  if (crmStagesCache) return crmStagesCache;
  try {
    const res = await fetch('/insights/api/sales-insights/stages');
    const data = await res.json();
    if (data.success) { crmStagesCache = data.data.stages; return crmStagesCache; }
    return [];
  } catch (e) { return []; }
}

async function saveNewSet(formData) {
  const res = await fetch('/insights/api/sales-insights/information-sets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  // Invalidate cache for this model
  delete informationSetsCache[formData.model];
  return data.data;
}

async function updateSet(setId, updates) {
  const res = await fetch(`/insights/api/sales-insights/information-sets/${setId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  // Invalidate cache
  informationSetsCache = {};
  return data.data;
}

async function updateField(fieldId, updates) {
  const res = await fetch(`/insights/api/sales-insights/information-set-fields/${fieldId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  informationSetsCache = {};
  return data.data;
}

async function saveNewField(formData) {
  const res = await fetch('/insights/api/sales-insights/information-set-fields', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  delete informationSetsCache[wizardState.selectedModel];
  return data.data;
}

// ============================================================================
// RENDERING: Progress bar
// ============================================================================
function renderProgressBar() {
  const steps = [{ num:1, label:'Startpunt' }, { num:2, label:'Wat ophalen' }, { num:3, label:'Filters & Export' }];
  return `<div class="mb-8"><ul class="steps steps-horizontal w-full">${steps.map(s => `<li class="step ${wizardState.currentStep >= s.num ? 'step-primary' : ''}">${s.label}</li>`).join('')}</ul></div>`;
}

// ============================================================================
// RENDERING: Step 1 — Startpunt
// ============================================================================
function renderStep1() {
  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-2">Stap 1: Startpunt</h2>
        <p class="text-base-content/60 mb-6">Kies het model waarvan je wil vertrekken.</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${Object.entries(MODEL_CONFIG).map(([key, cfg]) => {
            const sel = wizardState.selectedModel === key;
            return `
              <button class="card border-2 text-left transition-all cursor-pointer hover:border-primary ${sel ? 'border-primary bg-primary/5' : 'border-base-300 bg-base-100'}"
                onclick="wizardState.selectModel('${key}'); renderWizard();">
                <div class="card-body py-4 px-5">
                  <div class="flex items-center gap-3">
                    <i data-lucide="${cfg.icon}" class="w-6 h-6 ${sel ? 'text-primary' : 'text-base-content/50'}"></i>
                    <div class="flex-1">
                      <div class="font-bold text-base">${cfg.label}</div>
                      <div class="text-xs text-base-content/40">${key}</div>
                    </div>
                    ${sel ? '<i data-lucide="check-circle" class="w-5 h-5 text-primary"></i>' : ''}
                  </div>
                </div>
              </button>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ============================================================================
// RENDERING: Step 2 — Wat ophalen
// ============================================================================
async function renderStep2() {
  const model = wizardState.selectedModel || 'x_sales_action_sheet';
  const sets = await fetchInformationSets(model);
  const modelCfg = MODEL_CONFIG[model] || {};

  const setsHtml = sets.map(set => {
    const checked = !!wizardState.informationSets[set.id];
    const fields = set.information_set_fields || [];
    const expanded = wizardState._expandedSet === set.id;
    const showAddField = IS_ADMIN && wizardState._showAddField === set.id;
    const editingSet = IS_ADMIN && wizardState._editingSet === set.id;

    return `
      <div class="border border-base-300 rounded-lg overflow-hidden">
        ${editingSet ? `
          <div class="px-4 py-3 bg-info/5 border-b border-info/20">
            <div class="text-xs font-semibold mb-2 text-info">Categorie bewerken</div>
            <div class="space-y-2">
              <input id="es-label-${set.id}" type="text" value="${set.label.replace(/"/g,'&quot;')}" placeholder="Label" class="input input-bordered input-xs w-full" />
              <input id="es-desc-${set.id}" type="text" value="${(set.description||'').replace(/"/g,'&quot;')}" placeholder="Beschrijving voor AI" class="input input-bordered input-xs w-full" />
              <div class="flex gap-2">
                <button class="btn btn-xs btn-info" onclick="submitEditSet('${set.id}')">Opslaan</button>
                <button class="btn btn-xs btn-ghost" onclick="wizardState._editingSet = null; renderWizard();">Annuleren</button>
              </div>
            </div>
          </div>
        ` : ''}
        <div class="flex items-center gap-3 px-4 py-3 hover:bg-base-200 cursor-pointer transition-colors"
             onclick="wizardState.toggleSet('${set.id}', !wizardState.informationSets['${set.id}']); renderWizard();">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-sm"
            ${checked ? 'checked' : ''}
            onclick="event.stopPropagation(); wizardState.toggleSet('${set.id}', this.checked); renderWizard();"
          />
          <div class="flex-1">
            <div class="font-semibold text-sm">${set.label}</div>
            ${set.description ? `<div class="text-xs text-base-content/50 mt-0.5">${set.description}</div>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <span class="badge badge-sm badge-ghost">${fields.length} velden</span>
            ${IS_ADMIN ? `
              <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation(); wizardState._editingSet = wizardState._editingSet === '${set.id}' ? null : '${set.id}'; wizardState._showAddField = null; renderWizard();" title="Bewerken">
                <i data-lucide="pencil" class="w-3 h-3"></i>
              </button>
              <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation(); wizardState._showAddField = wizardState._showAddField === '${set.id}' ? null : '${set.id}'; renderWizard();" title="Veld toevoegen">+</button>
            ` : ''}
            <button class="btn btn-xs btn-ghost btn-circle" onclick="event.stopPropagation(); toggleSetExpand('${set.id}');" title="Toon velden">
              <i data-lucide="${expanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-base-content/40"></i>
            </button>
          </div>
        </div>
        ${expanded || showAddField ? `
          <div class="border-t border-base-200 px-4 py-3 bg-base-50/50">
            ${fields.map(f => {
              const editingThisField = IS_ADMIN && wizardState._editingField === f.id;
              return editingThisField ? `
                <div class="mb-2 p-2 bg-info/5 border border-info/20 rounded">
                  <div class="text-xs font-mono text-primary/80 mb-1">${f.field_key}</div>
                  <div class="space-y-1">
                    <input id="ef-label-${f.id}" type="text" value="${(f.label||'').replace(/"/g,'&quot;')}" placeholder="Label" class="input input-bordered input-xs w-full" />
                    <input id="ef-desc-${f.id}" type="text" value="${(f.description||'').replace(/"/g,'&quot;')}" placeholder="Beschrijving voor AI" class="input input-bordered input-xs w-full" />
                    <div class="flex gap-2">
                      <button class="btn btn-xs btn-info" onclick="submitEditField(${f.id})">Opslaan</button>
                      <button class="btn btn-xs btn-ghost" onclick="wizardState._editingField = null; renderWizard();">Annuleren</button>
                    </div>
                  </div>
                </div>
              ` : `
                <div class="text-xs mb-1 flex items-start gap-2 group">
                  <div class="flex-1">
                    <span class="font-mono text-primary/80">${f.field_key}</span>
                    ${f.label ? `<span class="text-base-content/60"> — ${f.label}</span>` : ''}
                    ${f.description ? `<div class="text-base-content/40 ml-4">${f.description}</div>` : ''}
                  </div>
                  ${IS_ADMIN ? `<button class="btn btn-xs btn-ghost opacity-0 group-hover:opacity-100 shrink-0" onclick="wizardState._editingField = ${f.id}; renderWizard();" title="Bewerken"><i data-lucide="pencil" class="w-3 h-3"></i></button>` : ''}
                </div>
              `;
            }).join('')}
            ${showAddField ? `
              <div class="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                <div class="text-xs font-semibold mb-2">Veld toevoegen aan "${set.label}"</div>
                <div class="space-y-2">
                  <input id="nf-key-${set.id}" type="text" placeholder="field_key (bv. x_studio_mijn_veld)" class="input input-bordered input-xs w-full font-mono" />
                  <input id="nf-label-${set.id}" type="text" placeholder="Label (leesbare naam)" class="input input-bordered input-xs w-full" />
                  <input id="nf-desc-${set.id}" type="text" placeholder="Beschrijving voor AI (optioneel)" class="input input-bordered input-xs w-full" />
                  <div class="flex gap-2">
                    <button class="btn btn-xs btn-warning" onclick="submitNewField('${set.id}')">Opslaan</button>
                    <button class="btn btn-xs btn-ghost" onclick="wizardState._showAddField = null; renderWizard();">Annuleren</button>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>`;
  }).join('');

  // Add Set form (admin only)
  const addSetHtml = IS_ADMIN ? `
    <div class="mt-4">
      ${wizardState._showAddSet ? `
        <div class="p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <div class="text-sm font-semibold mb-3">Nieuwe categorie toevoegen</div>
          <div class="space-y-2">
            <input id="ns-id" type="text" placeholder="id (bv. mijn_categorie, geen spaties)" class="input input-bordered input-sm w-full font-mono" />
            <input id="ns-label" type="text" placeholder="Label (getoond in de UI)" class="input input-bordered input-sm w-full" />
            <textarea id="ns-desc" placeholder="Beschrijving voor AI (optioneel)" class="textarea textarea-bordered textarea-sm w-full" rows="2"></textarea>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-warning" onclick="submitNewSet('${model}')">Opslaan</button>
              <button class="btn btn-sm btn-ghost" onclick="wizardState._showAddSet = false; renderWizard();">Annuleren</button>
            </div>
          </div>
        </div>
      ` : `
        <button class="btn btn-sm btn-ghost gap-2 border border-dashed border-base-300 w-full"
          onclick="wizardState._showAddSet = true; renderWizard();">
          <i data-lucide="plus" class="w-4 h-4"></i> Categorie toevoegen
        </button>
      `}
    </div>
  ` : '';

  // Submodel sectie — generiek voor elk model met submodels
  let submodelHtml = '';
  const submodelKeys = modelCfg.submodels || [];

  for (const submodelKey of submodelKeys) {
    const subCfg = MODEL_CONFIG[submodelKey] || {};
    const subSets = await fetchInformationSets(submodelKey);
    const isLeadSubmodel = submodelKey === 'crm.lead';

    // State: reuse leadEnrichment for crm.lead, use generic submodelSets for others
    const isSubEnabled = isLeadSubmodel
      ? wizardState.leadEnrichment.enabled
      : !!wizardState.submodelSets[submodelKey + '_enabled'];

    const toggleEnable = isLeadSubmodel
      ? `wizardState.toggleLeadEnrichment(this.checked); renderWizard();`
      : `wizardState.submodelSets['${submodelKey}_enabled'] = this.checked; renderWizard();`;

    const subSetToggles = subSets.map(set => {
      const isWebActivity = set.id === 'lead_web_activity';
      let checked, toggleOn, toggleOff;
      if (isLeadSubmodel) {
        checked = isWebActivity ? wizardState.leadEnrichment.webActivity : wizardState.leadEnrichment.property_groups.includes(set.id);
        toggleOn  = isWebActivity ? `wizardState.toggleWebActivity(true)` : `wizardState.toggleLeadPropertyGroup('${set.id}', true)`;
        toggleOff = isWebActivity ? `wizardState.toggleWebActivity(false)` : `wizardState.toggleLeadPropertyGroup('${set.id}', false)`;
      } else {
        checked = !!wizardState.submodelSets[set.id];
        toggleOn  = `wizardState.submodelSets['${set.id}'] = true`;
        toggleOff = `wizardState.submodelSets['${set.id}'] = false`;
      }
      const fields = set.information_set_fields || [];
      const expanded = wizardState._expandedSet === submodelKey + '_' + set.id;
      return `
        <div class="border border-base-300 rounded-lg overflow-hidden">
          <div class="flex items-center gap-3 px-4 py-3 hover:bg-base-200 cursor-pointer transition-colors"
               onclick="${checked ? toggleOff : toggleOn}; renderWizard();">
            <input type="checkbox" class="checkbox checkbox-xs checkbox-accent"
              ${checked ? 'checked' : ''}
              onclick="event.stopPropagation(); ${checked ? toggleOff : toggleOn}; renderWizard();"
            />
            <div class="flex-1">
              <div class="label-text text-sm">${set.label}</div>
              ${set.description ? `<div class="label-text-alt text-xs text-base-content/50">${set.description}</div>` : ''}
            </div>
            <div class="flex items-center gap-2">
              ${isWebActivity ? '<span class="badge badge-xs badge-warning">2e call</span>' : ''}
              <span class="badge badge-sm badge-ghost">${fields.length} velden</span>
              <button class="btn btn-xs btn-ghost btn-circle" onclick="event.stopPropagation(); toggleSetExpand('${submodelKey}_${set.id}');">
                <i data-lucide="${expanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-base-content/40"></i>
              </button>
            </div>
          </div>
          ${expanded ? `<div class="border-t border-base-200 px-4 py-3 bg-base-50/50">
            ${fields.map(f => `<div class="text-xs mb-1"><span class="font-mono text-primary/80">${f.field_key}</span>${f.label ? ` — <span class="text-base-content/60">${f.label}</span>` : ''}</div>`).join('')}
          </div>` : ''}
        </div>`;
    }).join('');

    submodelHtml += `
      <div class="divider mt-8">${subCfg.label || submodelKey} (Optioneel)</div>
      <label class="label cursor-pointer justify-start gap-4 mb-3">
        <input type="checkbox" class="checkbox checkbox-secondary checkbox-sm"
          ${isSubEnabled ? 'checked' : ''}
          onchange="${toggleEnable}"
        />
        <div>
          <div class="label-text font-bold">${subCfg.label || submodelKey} koppelen</div>
          <div class="label-text-alt text-base-content/60">
            Enkel ${subCfg.label?.toLowerCase() || submodelKey} gelinkt aan de opgehaalde records (cascade).
          </div>
        </div>
      </label>
      ${isSubEnabled ? `
        <div class="ml-6 space-y-2">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-base-content/70">${subCfg.label} velden</span>
            <div class="flex gap-2">
              <button class="btn btn-xs btn-ghost" onclick="${isLeadSubmodel ? 'selectAllLeadSets()' : `selectAllSubSets('${submodelKey}')` }">Alles</button>
              <button class="btn btn-xs btn-ghost" onclick="${isLeadSubmodel ? 'deselectAllLeadSets()' : `deselectAllSubSets('${submodelKey}')`}">Wissen</button>
            </div>
          </div>
          ${subSetToggles}
          ${isLeadSubmodel ? `
            <div class="alert alert-sm py-2 mt-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info shrink-0 w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span class="text-xs">id, name, stage_id, active, won_status worden altijd opgehaald.</span>
            </div>` : ''}
        </div>
      ` : ''}
    `;
  }

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-2">Stap 2: Wat ophalen?</h2>
        <p class="text-base-content/60 mb-4">Selecteer categorieën voor <strong>${modelCfg.label || model}</strong>. Basisvelden (id, naam, datum) zijn altijd inbegrepen.</p>
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm text-base-content/60">${sets.length} categorieën</span>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-ghost" onclick="wizardState.selectAllSets(window._currentSets||[]); renderWizard();">Alles selecteren</button>
            <button class="btn btn-sm btn-ghost" onclick="wizardState.deselectAllSets(window._currentSets||[]); renderWizard();">Wissen</button>
          </div>
        </div>
        <div class="space-y-2">${(window._currentSets = sets, setsHtml)}</div>
        ${addSetHtml}
        ${submodelHtml}
      </div>
    </div>`;
}

function toggleSetExpand(setId) {
  wizardState._expandedSet = wizardState._expandedSet === setId ? null : setId;
  renderWizard();
}

function selectAllSubSets(submodelKey) {
  (informationSetsCache[submodelKey] || []).forEach(s => {
    wizardState.submodelSets[s.id] = true;
  });
  renderWizard();
}

function deselectAllSubSets(submodelKey) {
  (informationSetsCache[submodelKey] || []).forEach(s => {
    wizardState.submodelSets[s.id] = false;
  });
  renderWizard();
}

function selectAllLeadSets() {
  (informationSetsCache['crm.lead'] || []).forEach(s => {
    if (s.id === 'lead_web_activity') wizardState.leadEnrichment.webActivity = true;
    else wizardState.toggleLeadPropertyGroup(s.id, true);
  });
  renderWizard();
}

function deselectAllLeadSets() {
  wizardState.leadEnrichment.property_groups = [];
  wizardState.leadEnrichment.webActivity = false;
  renderWizard();
}

async function submitEditSet(setId) {
  const label = document.getElementById(`es-label-${setId}`)?.value?.trim();
  const desc  = document.getElementById(`es-desc-${setId}`)?.value?.trim();
  if (!label) { alert('Label is verplicht'); return; }
  try {
    await updateSet(setId, { label, description: desc || null });
    wizardState._editingSet = null;
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function submitEditField(fieldId) {
  const label = document.getElementById(`ef-label-${fieldId}`)?.value?.trim();
  const desc  = document.getElementById(`ef-desc-${fieldId}`)?.value?.trim();
  try {
    await updateField(fieldId, { label: label || null, description: desc || null });
    wizardState._editingField = null;
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function submitNewSet(model) {
  const id    = document.getElementById('ns-id')?.value?.trim();
  const label = document.getElementById('ns-label')?.value?.trim();
  const desc  = document.getElementById('ns-desc')?.value?.trim();
  if (!id || !label) { alert('ID en label zijn verplicht'); return; }
  try {
    await saveNewSet({ id, label, description: desc || null, model, sort_order: 99 });
    wizardState._showAddSet = false;
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function submitNewField(setId) {
  const key   = document.getElementById(`nf-key-${setId}`)?.value?.trim();
  const label = document.getElementById(`nf-label-${setId}`)?.value?.trim();
  const desc  = document.getElementById(`nf-desc-${setId}`)?.value?.trim();
  if (!key) { alert('Field key is verplicht'); return; }
  try {
    await saveNewField({ set_id: setId, field_key: key, label: label || null, description: desc || null });
    wizardState._showAddField = null;
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

// ============================================================================
// RENDERING: Step 3 — Filters & Export
// ============================================================================
async function renderStep3() {
  const model = wizardState.selectedModel || 'x_sales_action_sheet';
  const modelCfg = MODEL_CONFIG[model] || {};
  const dateFields = modelCfg.dateFields || [{ field: 'create_date', label: 'Aanmaakdatum' }];
  const tf = wizardState.timeFilter;
  const presets = await fetchAiExportPresets();
  let crmStages = [];
  if (wizardState.leadEnrichment.enabled || (modelCfg.extraFilters || []).includes('won_status')) {
    crmStages = await fetchCrmStages();
    // Init stage filter to all stages when first loaded
    if (crmStages.length && !wizardState.leadEnrichment.filters.stage_ids.length) {
      wizardState.leadEnrichment.filters.stage_ids = crmStages.map(s => s.id);
    }
    if (crmStages.length) wizardState._totalStages = crmStages.length;
  }

  const quickPeriods = [
    { key: 'week', label: 'Voorbije week' }, { key: 'month', label: 'Voorbije maand' },
    { key: 'quarter', label: 'Voorbij kwartaal' }, { key: 'year', label: 'Voorbij jaar' }
  ];

  const resolved = wizardState.resolvedTimeFilter();
  const periodLabel = resolved.from ? `${resolved.from} → ${resolved.to}` : '';

  // Show lead filters if:
  // a) actionsheet with lead enrichment enabled, OR
  // b) crm.lead is the direct model
  const showLeadFilters = wizardState.leadEnrichment.enabled ||
    (modelCfg.extraFilters || []).includes('won_status');
  const leadFiltersHtml = showLeadFilters ? `
    <div class="divider mt-6">Lead filters (Optioneel)</div>
    <div class="form-control mb-4">
      <label class="label">
        <span class="label-text font-semibold">Won Status</span>
        <span class="label-text-alt text-base-content/40">Vink uit om te excluderen</span>
      </label>
      <div class="flex gap-4">
        ${['won','lost','pending'].map(s => `
          <label class="label cursor-pointer gap-2">
            <input type="checkbox" class="checkbox checkbox-sm"
              ${wizardState.leadEnrichment.filters.won_status.includes(s) ? 'checked' : ''}
              onchange="handleWonStatusChange('${s}', this.checked); renderWizard();" />
            <span class="label-text capitalize">${s}</span>
          </label>`).join('')}
      </div>
    </div>
    <div class="form-control">
      <label class="label"><span class="label-text font-semibold">CRM Stages</span><span class="label-text-alt text-base-content/40">Vink uit om te excluderen</span></label>
      ${crmStages.length > 0 ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-base-300 rounded">
          ${crmStages.map(s => `
            <label class="label cursor-pointer justify-start gap-2">
              <input type="checkbox" class="checkbox checkbox-sm" ${wizardState.leadEnrichment.filters.stage_ids.includes(s.id) ? 'checked' : ''}
                onchange="handleStageChange(${s.id}, this.checked); renderWizard();" />
              <span class="label-text text-xs"><span class="badge badge-xs mr-1">${s.sequence}</span>${s.name}</span>
            </label>`).join('')}
        </div>
        <div class="flex gap-2 mt-2">
          <button class="btn btn-xs btn-ghost" onclick="selectStagesUpTo(${crmStages[crmStages.length-1]?.id||0}); renderWizard();">Alles</button>
          <button class="btn btn-xs btn-ghost" onclick="wizardState.setLeadStageFilter([]); renderWizard();">Wissen</button>
        </div>
      ` : '<div class="text-sm text-error">Stages konden niet geladen worden.</div>'}
    </div>` : '';

  const apartmentsHtml = (modelCfg.extraFilters || []).includes('apartments') ? `
    <div class="divider mt-6">Aantal appartementen</div>
    <div class="grid grid-cols-2 gap-4">
      <div class="form-control">
        <label class="label"><span class="label-text font-semibold">Minimum</span></label>
        <input type="number" class="input input-bordered input-sm" placeholder="Geen minimum"
          value="${wizardState.apartmentsFilter.min || ''}"
          onchange="wizardState.setApartmentsFilter(this.value||null, wizardState.apartmentsFilter.max, wizardState.apartmentsFilter.include_zero); renderWizard();" />
      </div>
      <div class="form-control">
        <label class="label"><span class="label-text font-semibold">Maximum</span></label>
        <input type="number" class="input input-bordered input-sm" placeholder="Geen maximum"
          value="${wizardState.apartmentsFilter.max || ''}"
          onchange="wizardState.setApartmentsFilter(wizardState.apartmentsFilter.min, this.value||null, wizardState.apartmentsFilter.include_zero); renderWizard();" />
      </div>
    </div>
    <label class="label cursor-pointer justify-start gap-4 mt-2">
      <input type="checkbox" class="checkbox checkbox-primary checkbox-sm"
        ${wizardState.apartmentsFilter.include_zero ? 'checked' : ''}
        onchange="wizardState.setApartmentsFilter(wizardState.apartmentsFilter.min, wizardState.apartmentsFilter.max, this.checked); renderWizard();" />
      <span class="label-text">Gebouwen met 0 appartementen meenemen</span>
    </label>` : '';

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-4">Stap 3: Filters & Export</h2>

        <!-- Tijdsfilter -->
        <div class="divider">Tijdsfilter</div>
        ${dateFields.length > 1 ? `
          <div class="form-control mb-3">
            <label class="label"><span class="label-text font-semibold">Filter op</span></label>
            <select class="select select-bordered select-sm w-full max-w-xs"
              onchange="wizardState.timeFilter.field = this.value; renderWizard();">
              ${dateFields.map(df => `<option value="${df.field}" ${tf.field === df.field ? 'selected' : ''}>${df.label}</option>`).join('')}
            </select>
          </div>` : ''}

        <div class="flex flex-wrap gap-2 mb-3">
          ${[{k:null,l:'Geen filter'},{k:'quick',l:'Snelle periode'},{k:'from',l:'Vanaf datum'},{k:'range',l:'Specifieke periode'}].map(o => `
            <button class="btn btn-sm ${tf.mode === o.k ? 'btn-primary' : 'btn-outline'}"
              onclick="wizardState.timeFilter.mode = ${o.k === null ? 'null' : `'${o.k}'`}; ${o.k === 'quick' ? `wizardState.timeFilter.quickPeriod = wizardState.timeFilter.quickPeriod || 'month';` : ''} renderWizard();">
              ${o.l}
            </button>`).join('')}
        </div>

        ${tf.mode === 'quick' ? `
          <div class="flex flex-wrap gap-2 mb-2">
            ${quickPeriods.map(p => `<button class="btn btn-sm ${tf.quickPeriod === p.key ? 'btn-primary' : 'btn-outline'}" onclick="wizardState.timeFilter.quickPeriod = '${p.key}'; renderWizard();">${p.label}</button>`).join('')}
          </div>
          <div class="text-xs text-base-content/50">${periodLabel}</div>` : ''}

        ${tf.mode === 'from' ? `
          <div class="form-control max-w-xs">
            <label class="label"><span class="label-text font-semibold">Vanaf</span></label>
            <input type="date" class="input input-bordered input-sm" value="${tf.dateFrom||''}"
              onchange="wizardState.timeFilter.dateFrom = this.value; renderWizard();" />
            <label class="label"><span class="label-text-alt text-base-content/50">Tot en met vandaag</span></label>
          </div>` : ''}

        ${tf.mode === 'range' ? `
          <div class="grid grid-cols-2 gap-4">
            <div class="form-control">
              <label class="label"><span class="label-text font-semibold">Van</span></label>
              <input type="date" class="input input-bordered input-sm" value="${tf.dateFrom||''}"
                onchange="wizardState.timeFilter.dateFrom = this.value; renderWizard();" />
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text font-semibold">Tot en met</span></label>
              <input type="date" class="input input-bordered input-sm" value="${tf.dateTo||''}"
                onchange="wizardState.timeFilter.dateTo = this.value; renderWizard();" />
            </div>
          </div>` : ''}

        ${apartmentsHtml}
        ${leadFiltersHtml}

        <!-- AI Preset -->
        <div class="divider mt-6">AI instructie</div>
        <div class="form-control">
          <label class="label"><span class="label-text font-semibold">Wat moet de AI doen met deze data?</span></label>
          <select class="select select-bordered"
            onchange="wizardState.aiPresetId = this.value ? parseInt(this.value) : null; renderWizard();">
            ${presets.map(p => `<option value="${p.id}" ${wizardState.aiPresetId === p.id ? 'selected' : ''}>${p.label}${p.description ? ' — ' + p.description : ''}</option>`).join('')}
          </select>
          ${(() => { const p = presets.find(p => p.id === wizardState.aiPresetId); return p?.instruction ? `<div class="mt-2 p-3 bg-base-200 rounded text-xs text-base-content/60 italic">"${p.instruction.slice(0,180)}${p.instruction.length>180?'...':''}"</div>` : ''; })()}
        </div>

      </div>
    </div>`;
}

// ============================================================================
// RENDERING: Actions
// ============================================================================
function renderActions() {
  const canGoBack = wizardState.currentStep > 1;
  const canGoNext = wizardState.currentStep < 3;
  const canExecute = wizardState.currentStep === 3;
  return `
    <div class="flex justify-between mt-6">
      <div>${canGoBack ? `<button class="btn btn-outline" onclick="wizardState.currentStep--; renderWizard();">← Vorige</button>` : ''}</div>
      <div class="flex gap-2">
        ${wizardState.currentStep > 1 ? `<button class="btn btn-ghost" onclick="wizardState.resetState(); renderWizard();">Reset</button>` : ''}
        ${canGoNext ? `<button class="btn btn-primary" ${!wizardState.selectedModel ? 'disabled' : ''} onclick="wizardState.currentStep++; renderWizard();">Volgende →</button>` : ''}
        ${canExecute ? `<button class="btn btn-primary" onclick="executeQuery();">Uitvoeren</button>` : ''}
      </div>
    </div>`;
}

// ============================================================================
// MAIN RENDER
// ============================================================================
function handleWonStatusChange(status, checked) {
  const cur = wizardState.leadEnrichment.filters.won_status;
  wizardState.setLeadWonStatusFilter(checked ? [...cur, status] : cur.filter(s => s !== status));
}
function handleStageChange(stageId, checked) {
  const cur = wizardState.leadEnrichment.filters.stage_ids;
  wizardState.setLeadStageFilter(checked ? [...cur, stageId] : cur.filter(id => id !== stageId));
}
async function selectStagesUpTo(maxId) {
  const stages = await fetchCrmStages();
  const ids = [];
  for (const s of stages) { ids.push(s.id); if (s.id === maxId) break; }
  wizardState.setLeadStageFilter(ids);
}

async function renderWizard() {
  const container = document.getElementById('wizard-container');
  if (!container) return;
  let stepContent = '';
  if (wizardState.currentStep === 1) stepContent = renderStep1();
  else if (wizardState.currentStep === 2) stepContent = await renderStep2();
  else if (wizardState.currentStep === 3) stepContent = await renderStep3();
  container.innerHTML = renderProgressBar() + stepContent + renderActions();
  if (window.lucide) lucide.createIcons();
}

// ============================================================================
// API CALLS + EXPORT
// ============================================================================
async function enrichWithWebActivity(data) {
  const rowKey = data.records ? 'records' : data.rows ? 'rows' : null;
  if (!rowKey || !data[rowKey].length) return data;
  const rows = data[rowKey];
  const leadIds = [...new Set(rows.flatMap(r => (r.__leads||[]).map(l=>l.id).filter(id=>id&&typeof id==='number')))];
  if (!leadIds.length) return data;
  showLoading(`Web activiteit ophalen voor ${leadIds.length} leads...`);
  try {
    const res = await fetch('/insights/api/sales-insights/leads/web-activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_ids: leadIds, include_brand: true, include_kpi: true, include_timeline: true })
    });
    const waResult = await res.json();
    if (!waResult.success) { console.warn('Web activity failed:', waResult.error); return data; }
    const waMap = new Map(waResult.data.results.map(r => [r.lead_id, r]));
    const enriched = rows.map(row => {
      const leads = row.__leads || [];
      if (!leads.length) return row;
      const wa = waMap.get(leads[0].id);
      if (!wa) return row;
      return { ...row, x_has_web_activity: wa.x_has_web_activity||false, x_studio_brand_origin: wa.x_studio_brand_origin||null, x_studio_merged_kpi_html: wa.x_studio_merged_kpi_html||null, x_studio_merged_timeline_html: wa.x_studio_merged_timeline_html||null };
    });
    return { ...data, [rowKey]: enriched };
  } catch (e) { console.warn('Web activity error:', e.message); return data; }
}

function buildExportMeta(payload) {
  const model = payload.base_model;
  const modelCfg = MODEL_CONFIG[model] || {};
  const tf = wizardState.resolvedTimeFilter();
  const selectedSets = (informationSetsCache[model] || [])
    .filter(s => wizardState.informationSets[s.id])
    .map(s => ({ id: s.id, label: s.label, description: s.description }));

  const preset = aiExportPresetsCache?.find(p => p.id === wizardState.aiPresetId);

  return {
    _export_meta: {
      generated_at: new Date().toISOString(),
      model: { id: model, label: modelCfg.label || model },
      period: tf.from ? { from: tf.from, to: tf.to, field: tf.field } : null,
      field_groups: selectedSets,
      lead_enrichment: wizardState.leadEnrichment.enabled ? {
        enabled: true,
        won_status_filter: wizardState.leadEnrichment.filters.won_status,
        stage_filter: wizardState.leadEnrichment.filters.stage_ids,
        includes_web_activity: wizardState.leadEnrichment.webActivity
      } : null,
      ai_instruction: preset?.instruction || null,
      ai_preset: preset ? { id: preset.id, label: preset.label } : null
    }
  };
}

async function executeQuery() {
  const payload = wizardState.buildPayload();
  const payloadDisplay = document.getElementById('payload-display');
  if (payloadDisplay) payloadDisplay.innerHTML = `<div class="card bg-base-200 shadow-xl mb-4"><div class="card-body"><h3 class="card-title text-lg">📦 Query Payload</h3><pre class="bg-base-300 p-4 rounded overflow-x-auto text-sm"><code>${JSON.stringify(payload, null, 2)}</code></pre></div></div>`;

  showLoading('Bezig met query uitvoeren...');
  try {
    const response = await fetch('/insights/api/sales-insights/semantic/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.success) { showError(result.error || { message: 'Query failed' }); return; }
    let data = result.data;
    if (wizardState.leadEnrichment.enabled && wizardState.leadEnrichment.webActivity) data = await enrichWithWebActivity(data);
    showResults(data, false);
  } catch (error) { showError({ message: error.message }); }
  finally { hideLoading(); }
}

function showLoading(msg) {
  const c = document.getElementById('results-container');
  if (c) c.innerHTML = `<div class="flex items-center justify-center py-8"><span class="loading loading-spinner loading-lg"></span><span class="ml-4">${msg}</span></div>`;
}
function hideLoading() {
  const c = document.getElementById('results-container');
  if (c && c.querySelector('.loading')) c.innerHTML = '';
}
function showError(error) {
  const c = document.getElementById('results-container');
  if (c) c.innerHTML = `<div class="alert alert-error"><div><h3 class="font-bold">❌ ${error.message}</h3></div></div>`;
}
function showResults(data, isPreview) {
  const c = document.getElementById('results-container');
  if (!c) return;
  if (!data?.records) { showError({ message: 'No data returned' }); return; }
  const { records } = data;
  c.innerHTML = `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <div><h3 class="text-xl font-bold">✅ Resultaten</h3><p class="text-sm text-base-content/60">${records.length} resultaten</p></div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" onclick="exportSemanticQuery('xlsx')">📈 XLSX</button>
            <button class="btn btn-sm btn-outline" onclick="exportSemanticQuery('json')">📄 JSON</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead><tr>${records.length > 0 ? Object.keys(records[0]).map(k=>`<th>${k}</th>`).join('') : '<th>Geen data</th>'}</tr></thead>
            <tbody>${records.slice(0,50).map(r=>`<tr>${Object.values(r).map(v=>`<td>${formatValue(v)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          ${records.length > 50 ? `<div class="text-center py-2 text-sm text-base-content/50">Toont 50 van ${records.length} — export JSON voor volledig bestand.</div>` : ''}
        </div>
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}
function formatValue(v) {
  if (v === null || v === undefined) return '<span class="text-base-content/40">—</span>';
  if (typeof v === 'boolean') return v ? '✅' : '❌';
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v)) return v.length ? v.join(', ') : '<span class="text-base-content/40">[]</span>';
  const s = String(v);
  return s.length > 100 ? `<span title="${s.replace(/"/g,'&quot;')}">${s.slice(0,100)}…</span>` : s;
}

async function exportSemanticQuery(format) {
  if (format !== 'xlsx' && format !== 'json') return;
  try {
    const payload = wizardState.buildPayload();
    const needsWebActivity = wizardState.leadEnrichment.enabled && wizardState.leadEnrichment.webActivity;

    if (format === 'json') {
      showLoading('Bezig met exporteren...');
      const response = await fetch('/insights/api/sales-insights/semantic/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error?.message || 'Query failed');
      let data = result.data;
      if (needsWebActivity) data = await enrichWithWebActivity(data);

      // Add rich export meta + AI instruction at top level
      const exportMeta = buildExportMeta(payload);
      const exportData = { ...exportMeta, ...data };

      const model = payload.base_model;
      const tf = wizardState.resolvedTimeFilter();
      const periodStr = tf.from ? `_${tf.from}_${tf.to}` : '';
      const preset = aiExportPresetsCache?.find(p => p.id === wizardState.aiPresetId);
      const presetStr = preset && preset.label !== 'Geen preset' ? `_${preset.label.replace(/\s+/g,'-')}` : '';
      const filename = `${model}${periodStr}${presetStr}_${new Date().toISOString().slice(0,10)}.json`;

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      hideLoading();
      return;
    }

    payload.export = format;
    const response = await fetch('/insights/api/sales-insights/semantic/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    const cd = response.headers.get('Content-Disposition');
    let filename = `export_${Date.now()}.${format}`;
    if (cd) { const m = cd.match(/filename="?(.+?)"?$/); if (m) filename = m[1]; }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    window.URL.revokeObjectURL(url); document.body.removeChild(a);
  } catch (error) { console.error('Export failed:', error); alert(`Export failed: ${error.message}`); }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const loadingEl = document.getElementById('loadingState');
    const mainEl    = document.getElementById('mainContent');
    if (loadingEl) loadingEl.style.display = 'none';
    if (mainEl)    mainEl.style.display    = 'block';

    await fetchAiExportPresets();
    if (aiExportPresetsCache?.length > 0) {
      const geen = aiExportPresetsCache.find(p => p.label === 'Geen preset');
      if (geen) wizardState.aiPresetId = geen.id;
    }

    renderWizard();
    if (window.lucide) lucide.createIcons();
    console.log('✅ Semantic Wizard loaded — role:', USER_ROLE);
  } catch (error) {
    console.error('❌ Init failed:', error);
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) loadingEl.innerHTML = `<div class="alert alert-error"><div><h3 class="font-bold">Laden mislukt</h3><p>${error.message}</p></div></div>`;
  }
});