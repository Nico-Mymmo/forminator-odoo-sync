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
// Indexed by model id → { base_fields: [{field, label}], label, ... }
let modelsConfigCache     = {};
let savedSearchesCache      = null;
let sourceSitesCache            = null;
let touchpointFilterValuesCache = null;
// Tijdelijke periode-override per saved search id (niet opgeslagen, enkel in-memory)
const savedSearchPeriodOverrides = {};

// ============================================================================
// MODEL CONFIGURATIE (hardcoded koppelingen)
// ============================================================================
const MODEL_CONFIG = {
  'x_sales_action_sheet': {
    label: 'Actiebladen',
    icon: 'file-text',
    nameField: 'x_name',
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
    submodels: ['crm.lead', 'mail.message', 'mail.activity'],
    extraFilters: ['apartments']
  },
  'mail.message': {
    label: 'Chatter Berichten',
    icon: 'message-square',
    nameField: 'preview',
    dateFields: [{ field: 'date', label: 'Datum' }],
    submodels: [],
    extraFilters: []
  },
  'mail.activity': {
    label: 'Activiteiten',
    icon: 'check-square',
    nameField: 'summary',
    dateFields: [{ field: 'date_deadline', label: 'Deadline' }],
    submodels: [],
    extraFilters: []
  },
  'res.partner': {
    label: "Partners (VME's & Syndici)",
    icon: 'building-2',
    nameField: 'name',
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
    submodels: ['crm.lead', 'x_sales_action_sheet'],
    extraFilters: ['partner_type', 'company_status']
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
    submodels: ['mail.message', 'mail.activity'],
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
    submodels: ['x_ad_touchpoint', 'crm.lead'],
    extraFilters: ['source_site', 'bounce']
  },
  'x_ad_touchpoint': {
    label: 'Ad Touchpoints',
    icon: 'mouse-pointer-click',
    nameField: 'x_name',
    dateFields: [
      { field: 'x_studio_timestamp', label: 'Tijdstip klik' }
    ],
    submodels: ['x_web_visitor'],
    extraFilters: ['ad_filters']
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
    this.submodelSets = {};
    // Sub-submodel selectie: { 'crm.lead': { 'mail.message_enabled': true }, ... }
    this.subSubmodels = {};
    this.partnerFilter = { companyTypes: [], companyStatuses: [] };
    this.aiPresetId = null;
    this._expandedSet = null;
    this._showAddSet = false;
    this._showAddField = null; // set_id of which set is open for adding a field
    this._editingSet = null;        // set_id being edited
    this._editingField = null;      // field id being edited
    this._totalStages = 0;          // total available stages, for 'all selected' detection
    this._saveSearchName = undefined;    // undefined = hidden, string = input visible
    this._renamingSearchId = null;       // id of saved search being renamed
    this._editingFromSavedSearch = null; // { id, name, snapshot } wanneer bezig met bewerken
    // Web visitor filters
    this.webVisitorFilter = { sourceSites: [], possibleBounce: 'include', instantBounce: 'include' };
    this._allSourceSites = [];           // alle beschikbare sites (voor vergelijking in buildPayload)
    this._sourceSitesInitialized = false; // voorkom herinitialisatie na snapshot-load
    // Ad touchpoint filters
    this.adTouchpointFilter = { sources: [], mediums: [], campaigns: [] };
    this._adFilters = { sources: [], mediums: [], campaigns: [] }; // alle beschikbare waarden
    this._adFiltersInitialized = false;
  }

  selectModel(model) {
    this.selectedModel = model;
    this.informationSets = {};
    this.submodelSets = {};
    this.subSubmodels = {};
    // Standaard: VME-types aan, professionals uit; actieve statussen aan, intern/geblokkeerd uit
    this.partnerFilter = {
      companyTypes:    [1, 3],
      companyStatuses: ['Free Trial', 'Active', 'Inactive']
    };
    this.timeFilter.field = MODEL_CONFIG[model]?.dateFields[0]?.field || null;
    // Opt-out: alle won statuses standaard geselecteerd
    this.leadEnrichment.filters.won_status = ['won', 'lost', 'pending'];
    this.leadEnrichment.filters.stage_ids = [];
    this._totalStages = 0;
    // Reset web visitor filter
    this.webVisitorFilter = { sourceSites: [], possibleBounce: 'include', instantBounce: 'include' };
    this._allSourceSites = [];
    this._sourceSitesInitialized = false;
    // Reset ad touchpoint filter
    this.adTouchpointFilter = { sources: [], mediums: [], campaigns: [] };
    this._adFilters = { sources: [], mediums: [], campaigns: [] };
    this._adFiltersInitialized = false;
  }

  // Filter toggle helpers — worden aangeroepen vanuit inline event handlers
  togglePartnerType(v) {
    const cur = this.partnerFilter.companyTypes;
    this.partnerFilter.companyTypes = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
  }
  toggleCompanyStatus(v) {
    const cur = this.partnerFilter.companyStatuses;
    this.partnerFilter.companyStatuses = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
  }
  toggleWonStatus(v) {
    const cur = this.leadEnrichment.filters.won_status;
    this.leadEnrichment.filters.won_status = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
  }
  toggleSourceSite(v) {
    const cur = this.webVisitorFilter.sourceSites;
    this.webVisitorFilter.sourceSites = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
  }
  toggleAdSource(v) {
    const cur = this.adTouchpointFilter.sources;
    this.adTouchpointFilter.sources = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
  }
  toggleAdMedium(v) {
    const cur = this.adTouchpointFilter.mediums;
    this.adTouchpointFilter.mediums = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
  }
  toggleAdCampaign(v) {
    const cur = this.adTouchpointFilter.campaigns;
    this.adTouchpointFilter.campaigns = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
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

  // Serialiseer de wizard-state naar een opslaan-snapshot
  toSnapshot() {
    return {
      selectedModel:    this.selectedModel,
      informationSets:  { ...this.informationSets },
      submodelSets:     { ...this.submodelSets },
      subSubmodels:     JSON.parse(JSON.stringify(this.subSubmodels)),
      timeFilter:       { ...this.timeFilter },
      partnerFilter:    { ...this.partnerFilter },
      leadEnrichment:   JSON.parse(JSON.stringify(this.leadEnrichment)),
      apartmentsFilter: { ...this.apartmentsFilter },
      webVisitorFilter:    { ...this.webVisitorFilter },
      adTouchpointFilter:  { ...this.adTouchpointFilter },
      aiPresetId:          this.aiPresetId
    };
  }

  // Herstel wizard-state vanuit een snapshot
  loadSnapshot(snap) {
    if (!snap) return;
    if (snap.selectedModel) this.selectModel(snap.selectedModel);
    if (snap.informationSets)  this.informationSets  = snap.informationSets;
    if (snap.submodelSets)     this.submodelSets     = snap.submodelSets;
    if (snap.subSubmodels)     this.subSubmodels     = snap.subSubmodels;
    if (snap.timeFilter)       this.timeFilter       = { ...this.timeFilter, ...snap.timeFilter };
    if (snap.partnerFilter)    this.partnerFilter    = snap.partnerFilter;
    if (snap.leadEnrichment)   this.leadEnrichment   = snap.leadEnrichment;
    if (snap.apartmentsFilter) this.apartmentsFilter = snap.apartmentsFilter;
    if (snap.webVisitorFilter) {
      this.webVisitorFilter = { possibleBounce: 'include', instantBounce: 'include', ...snap.webVisitorFilter };
      this._sourceSitesInitialized = true; // Niet overschrijven met defaults
    }
    if (snap.adTouchpointFilter) {
      this.adTouchpointFilter = { ...snap.adTouchpointFilter };
      this._adFiltersInitialized = true;
    }
    if (snap.aiPresetId !== undefined) this.aiPresetId = snap.aiPresetId;
  }

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

    // Base fields: from DB config (if loaded), otherwise fall back to hardcoded nameField
    const dbModel = modelsConfigCache[model];
    const dbBaseFields = dbModel?.base_fields;
    const baseFieldEntries = (Array.isArray(dbBaseFields) && dbBaseFields.length > 0)
      ? dbBaseFields.map(bf => ({ model, field: bf.field }))
      : [{ model, field: modelCfgForPayload.nameField || 'name' }];

    const payload = {
      base_model: model,
      fields: [...baseFieldEntries],
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

    // res.partner filters (altijd is_company=true + opt-out voor type/status)
    if (model === 'res.partner') {
      payload.filters.push({ model, field: 'is_company', operator: '=', value: true });
      // Alleen filter toevoegen als het een SUBSET is (niet alles geselecteerd)
      if (this.partnerFilter.companyTypes.length > 0 && this.partnerFilter.companyTypes.length < 3) {
        payload.filters.push({ model, field: 'x_studio_company_type', operator: 'in', value: this.partnerFilter.companyTypes });
      }
      const allStatuses = ['Free Trial', 'Active', 'Inactive', 'Internal', 'Blocked'];
      if (this.partnerFilter.companyStatuses.length > 0 && this.partnerFilter.companyStatuses.length < allStatuses.length) {
        payload.filters.push({ model, field: 'x_studio_company_status', operator: 'in', value: this.partnerFilter.companyStatuses });
      }
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

    // Chatter enrichment (mail.message submodel)
    if (this.submodelSets['mail.message_enabled']) {
      payload.chatter_enrichment = { enabled: true };
    }

    // Activity enrichment (mail.activity submodel)
    if (this.submodelSets['mail.activity_enabled']) {
      payload.activity_enrichment = { enabled: true, include_done: false };
    }

    // Partner enrichments (res.partner als startmodel)
    if (model === 'res.partner') {
      if (this.submodelSets['crm.lead_enabled']) {
        const pGroups = this.leadEnrichment.property_groups.length
          ? this.leadEnrichment.property_groups : [];
        payload.partner_lead_enrichment = {
          enabled: true,
          property_groups: pGroups,
          filters: {}
        };
        const allWon = ['won', 'lost', 'pending'];
        if (this.leadEnrichment.filters.won_status.length > 0 &&
            this.leadEnrichment.filters.won_status.length < allWon.length) {
          payload.partner_lead_enrichment.filters.won_status = this.leadEnrichment.filters.won_status;
        }
        // L2: sub-enrichments voor leads
        const leadSubs = this.subSubmodels['crm.lead'] || {};
        if (leadSubs['mail.message_enabled']) {
          payload.partner_lead_enrichment.chatter_enrichment = { enabled: true };
        }
        if (leadSubs['mail.activity_enabled']) {
          payload.partner_lead_enrichment.activity_enrichment = { enabled: true };
        }
      }
      if (this.submodelSets['x_sales_action_sheet_enabled']) {
        payload.partner_actionsheet_enrichment = { enabled: true };
        // L2: sub-enrichments voor actiebladen
        const asSubs = this.subSubmodels['x_sales_action_sheet'] || {};
        if (asSubs['mail.message_enabled']) {
          payload.partner_actionsheet_enrichment.chatter_enrichment = { enabled: true };
        }
        if (asSubs['mail.activity_enabled']) {
          payload.partner_actionsheet_enrichment.activity_enrichment = { enabled: true };
        }
        if (asSubs['crm.lead_enabled']) {
          payload.partner_actionsheet_enrichment.lead_enrichment = { enabled: true, filters: {} };
        }
      }
    }

    // x_web_visitor enrichments
    if (model === 'x_web_visitor') {
      // Source site filter (opt-out: alleen als subset geselecteerd)
      const allSites = this._allSourceSites;
      const selectedSites = this.webVisitorFilter.sourceSites;
      if (allSites.length > 0 && selectedSites.length > 0 && selectedSites.length < allSites.length) {
        payload.filters.push({ model, field: 'x_studio_source_site', operator: 'in', value: selectedSites });
      }
      // Bounce filters
      if (this.webVisitorFilter.possibleBounce === 'exclude') {
        payload.filters.push({ model, field: 'x_studio_possible_bounce', operator: '=', value: false });
      } else if (this.webVisitorFilter.possibleBounce === 'only') {
        payload.filters.push({ model, field: 'x_studio_possible_bounce', operator: '=', value: true });
      }
      if (this.webVisitorFilter.instantBounce === 'exclude') {
        payload.filters.push({ model, field: 'x_studio_instant_bounce', operator: '=', value: false });
      } else if (this.webVisitorFilter.instantBounce === 'only') {
        payload.filters.push({ model, field: 'x_studio_instant_bounce', operator: '=', value: true });
      }
      // Touchpoint submodel
      if (this.submodelSets['x_ad_touchpoint_enabled']) {
        payload.visitor_touchpoint_enrichment = { enabled: true };
      }
      // Lead submodel (via x_studio_lead_ids)
      if (this.submodelSets['crm.lead_enabled']) {
        payload.visitor_lead_enrichment = { enabled: true, filters: {} };
        const allWon = ['won', 'lost', 'pending'];
        const selWon = this.leadEnrichment.filters.won_status;
        if (selWon.length > 0 && selWon.length < allWon.length) {
          payload.visitor_lead_enrichment.filters.won_status = selWon;
        }
      }
    }

    // x_ad_touchpoint filters (opt-out: alleen als subset geselecteerd)
    if (model === 'x_ad_touchpoint') {
      const all = this._adFilters;
      const sel = this.adTouchpointFilter;
      if (all.sources.length && sel.sources.length && sel.sources.length < all.sources.length) {
        payload.filters.push({ model, field: 'x_studio_source', operator: 'in', value: sel.sources });
      }
      if (all.mediums.length && sel.mediums.length && sel.mediums.length < all.mediums.length) {
        payload.filters.push({ model, field: 'x_studio_medium', operator: 'in', value: sel.mediums });
      }
      if (all.campaigns.length && sel.campaigns.length && sel.campaigns.length < all.campaigns.length) {
        payload.filters.push({ model, field: 'x_studio_campaign_name', operator: 'in', value: sel.campaigns });
      }
    }

    // x_ad_touchpoint enrichments
    if (model === 'x_ad_touchpoint') {
      if (this.submodelSets['x_web_visitor_enabled']) {
        payload.touchpoint_visitor_enrichment = { enabled: true };
        // L2: leads voor bezoekers
        const visitSubs = this.subSubmodels['x_web_visitor'] || {};
        if (visitSubs['crm.lead_enabled']) {
          payload.touchpoint_visitor_enrichment.lead_enrichment = { enabled: true };
        }
      }
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
    this.leadEnrichment = { enabled: false, mode: 'include', filters: { won_status: ['won', 'lost', 'pending'], stage_ids: [] }, property_groups: [], webActivity: false };
    this.submodelSets = {};
    this.subSubmodels = {};
    this.partnerFilter = {
      companyTypes:    [1, 3],
      companyStatuses: ['Free Trial', 'Active', 'Inactive']
    };
    this.webVisitorFilter = { sourceSites: [], possibleBounce: 'include', instantBounce: 'include' };
    this._allSourceSites = []; this._sourceSitesInitialized = false;
    this.adTouchpointFilter = { sources: [], mediums: [], campaigns: [] };
    this._adFilters = { sources: [], mediums: [], campaigns: [] }; this._adFiltersInitialized = false;
    this.aiPresetId = null; this._expandedSet = null; this._showAddSet = false; this._showAddField = null;
    this._saveSearchName = undefined; this._renamingSearchId = null; this._editingFromSavedSearch = null;
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

async function fetchModelsConfig() {
  if (Object.keys(modelsConfigCache).length > 0) return modelsConfigCache;
  try {
    const res = await fetch('/insights/api/sales-insights/models-config');
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message);
    (data.data.models || []).forEach(m => { modelsConfigCache[m.odoo_model] = m; });
    return modelsConfigCache;
  } catch (e) { console.warn('fetchModelsConfig error:', e.message); return {}; }
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

async function fetchSourceSites() {
  if (sourceSitesCache !== null) return sourceSitesCache;
  try {
    const res = await fetch('/insights/api/sales-insights/source-sites', { credentials: 'include' });
    if (!res.ok) return [];
    const { data } = await res.json();
    sourceSitesCache = data?.sites || [];
    return sourceSitesCache;
  } catch (e) { console.warn('fetchSourceSites error:', e); return []; }
}

async function fetchTouchpointFilterValues() {
  if (touchpointFilterValuesCache !== null) return touchpointFilterValuesCache;
  try {
    const res = await fetch('/insights/api/sales-insights/touchpoint-filter-values', { credentials: 'include' });
    if (!res.ok) return { sources: [], mediums: [], campaigns: [] };
    const { data } = await res.json();
    touchpointFilterValuesCache = {
      sources:   data?.sources   || [],
      mediums:   data?.mediums   || [],
      campaigns: data?.campaigns || []
    };
    return touchpointFilterValuesCache;
  } catch (e) { console.warn('fetchTouchpointFilterValues error:', e); return { sources: [], mediums: [], campaigns: [] }; }
}

// ============================================================================
// SAVED SEARCHES — API helpers
// ============================================================================
async function fetchSavedSearches() {
  if (savedSearchesCache !== null) return savedSearchesCache;
  try {
    const res = await fetch('/insights/api/sales-insights/saved-searches', { credentials: 'include' });
    if (!res.ok) return [];
    const { data } = await res.json();
    savedSearchesCache = data || [];
    return savedSearchesCache;
  } catch (e) { return []; }
}

function invalidateSavedSearches() { savedSearchesCache = null; }

async function saveCurrentSearch() {
  const name = (wizardState._saveSearchName || '').trim();
  if (!name) { alert('Geef een naam op voor deze zoekopdracht.'); return; }
  const snapshot = wizardState.toSnapshot();
  const res = await fetch('/insights/api/sales-insights/saved-searches', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, wizard_state: snapshot })
  });
  if (!res.ok) { alert('Opslaan mislukt.'); return; }
  wizardState._saveSearchName = undefined;
  invalidateSavedSearches();
  renderWizard();
}

async function renameSavedSearch(id, newName) {
  const name = (newName || '').trim();
  if (!name) return;
  await fetch(`/insights/api/sales-insights/saved-searches/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  invalidateSavedSearches();
  wizardState._renamingSearchId = null;
  renderWizard();
}

async function deleteSavedSearch(id) {
  if (!confirm('Zoekopdracht verwijderen?')) return;
  await fetch(`/insights/api/sales-insights/saved-searches/${id}`, {
    method: 'DELETE', credentials: 'include'
  });
  invalidateSavedSearches();
  renderWizard();
}

function editSavedSearch(id) {
  const s = savedSearchesCache?.find(x => x.id === id);
  if (!s) return;
  // Sla rollback-snapshot op zodat de gebruiker kan terugzetten
  wizardState._editingFromSavedSearch = {
    id: s.id,
    name: s.name,
    snapshot: JSON.parse(JSON.stringify(s.wizard_state))
  };
  wizardState.loadSnapshot(s.wizard_state);
  wizardState.currentStep = 1;
  renderWizard();
}

function runSavedSearch(id) {
  const s = savedSearchesCache?.find(x => x.id === id);
  if (!s) return;
  const snapshot = JSON.parse(JSON.stringify(s.wizard_state));
  // Pas eventuele periode-override toe
  const override = savedSearchPeriodOverrides[id];
  if (override !== undefined) {
    if (!snapshot.timeFilter) snapshot.timeFilter = {};
    if (override === null) {
      snapshot.timeFilter.mode = null;
    } else {
      snapshot.timeFilter.mode = 'quick';
      snapshot.timeFilter.quickPeriod = override;
    }
  }
  wizardState.loadSnapshot(snapshot);
  // Direct uitvoeren — geen stap 3 tussenstap nodig
  executeQuery();
}

function setSavedSearchPeriod(id, period) {
  // period = null (geen) | 'week' | 'month' | 'quarter' | 'year'
  savedSearchPeriodOverrides[id] = period;
  renderWizard();
}

async function saveSavedSearchChanges() {
  const editing = wizardState._editingFromSavedSearch;
  if (!editing) return;
  const snapshot = wizardState.toSnapshot();
  const res = await fetch(`/insights/api/sales-insights/saved-searches/${editing.id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wizard_state: snapshot })
  });
  if (!res.ok) { alert('Opslaan mislukt.'); return; }
  invalidateSavedSearches();
  wizardState._editingFromSavedSearch = null;
  renderWizard();
}

function cancelEditSavedSearch() {
  const editing = wizardState._editingFromSavedSearch;
  if (!editing) return;
  wizardState.loadSnapshot(editing.snapshot);
  wizardState._editingFromSavedSearch = null;
  wizardState.currentStep = 1;
  renderWizard();
}

// ============================================================================

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
async function renderStep1() {
  const [modelsConfig, savedSearches] = await Promise.all([fetchModelsConfig(), fetchSavedSearches()]);
  // Toon alleen modellen met can_be_startpoint !== false
  const startpointEntries = Object.entries(MODEL_CONFIG).filter(([key]) => {
    const dbModel = modelsConfig[key];
    if (!dbModel) return true; // Niet in DB → tonen als fallback
    return dbModel.can_be_startpoint !== false;
  });

  const savedSearchesHtml = savedSearches.length > 0 ? `
    <div class="mb-8">
      <h3 class="font-semibold text-base mb-3 flex items-center gap-2">
        <i data-lucide="bookmark" class="w-4 h-4 text-primary"></i>
        Mijn zoekopdrachten
      </h3>
      <div class="space-y-2">
        ${savedSearches.map(s => {
          const modelLabel = MODEL_CONFIG[s.wizard_state?.selectedModel]?.label || s.wizard_state?.selectedModel || '—';
          const isRenaming = wizardState._renamingSearchId === s.id;
          // Effectieve periode: override heeft voorrang op opgeslagen waarde
          const hasOverride = Object.prototype.hasOwnProperty.call(savedSearchPeriodOverrides, s.id);
          const savedPeriod = s.wizard_state?.timeFilter?.mode === 'quick'
            ? s.wizard_state.timeFilter.quickPeriod
            : (s.wizard_state?.timeFilter?.mode ? '—' : null);
          const activePeriod = hasOverride ? savedSearchPeriodOverrides[s.id] : savedPeriod;
          const periodLabels = { null: 'Geen', week: 'Week', month: 'Maand', quarter: 'Kwartaal', year: 'Jaar' };
          const periodOptions = [null, 'week', 'month', 'quarter', 'year'];

          return `
          <div class="px-4 py-3 rounded-xl border border-base-200 bg-base-50 hover:border-primary/20 transition-all">
            ${isRenaming ? `
              <div class="flex gap-2 items-center">
                <input id="rename-input-${s.id}" type="text" class="input input-bordered input-sm flex-1"
                  value="${s.name.replace(/"/g, '&quot;')}"
                  onkeydown="if(event.key==='Enter') renameSavedSearch('${s.id}', this.value); if(event.key==='Escape') { wizardState._renamingSearchId=null; renderWizard(); }" />
                <button class="btn btn-sm btn-primary" onclick="renameSavedSearch('${s.id}', document.getElementById('rename-input-${s.id}').value)">OK</button>
                <button class="btn btn-sm btn-ghost" onclick="wizardState._renamingSearchId=null; renderWizard();">✕</button>
              </div>
            ` : `
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="min-w-0">
                  <div class="font-semibold text-sm truncate">${s.name}</div>
                  <div class="text-xs text-base-content/40 flex items-center gap-1 mt-0.5">
                    <i data-lucide="database" class="w-3 h-3"></i>${modelLabel}
                  </div>
                </div>
                <div class="flex gap-1 shrink-0">
                  <button class="btn btn-xs btn-ghost" title="Naam wijzigen" onclick="wizardState._renamingSearchId='${s.id}'; renderWizard();">
                    <i data-lucide="pencil" class="w-3 h-3"></i>
                  </button>
                  <button class="btn btn-xs btn-ghost" title="Bewerken (volledige wizard)" onclick="editSavedSearch('${s.id}')">
                    <i data-lucide="settings-2" class="w-3 h-3"></i>
                  </button>
                  <button class="btn btn-xs btn-ghost text-error" title="Verwijderen" onclick="deleteSavedSearch('${s.id}')">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex gap-1 flex-wrap flex-1">
                  ${periodOptions.map(p => {
                    const isActive = activePeriod === p;
                    const pStr = p === null ? 'null' : `'${p}'`;
                    return `<button class="btn btn-xs ${isActive ? 'btn-accent' : 'btn-ghost border border-base-300'}"
                      onclick="event.stopPropagation(); setSavedSearchPeriod('${s.id}', ${pStr});">
                      ${periodLabels[p]}
                    </button>`;
                  }).join('')}
                </div>
                <button class="btn btn-sm btn-primary gap-1 shrink-0" onclick="runSavedSearch('${s.id}')">
                  <i data-lucide="play" class="w-3 h-3"></i>Uitvoeren
                </button>
              </div>
            `}
          </div>`;
        }).join('')}
      </div>
      <div class="divider mt-6">Nieuw startpunt</div>
    </div>` : '';

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-2">Stap 1: Startpunt</h2>
        ${savedSearchesHtml}
        <p class="text-base-content/60 mb-6">Kies het model waarvan je wil vertrekken.</p>
        <div class="grid grid-cols-2 gap-4">
          ${startpointEntries.map(([key, cfg]) => {
            const sel = wizardState.selectedModel === key;
            return `
              <button class="group relative flex flex-col items-start gap-3 p-5 rounded-2xl border-2 text-left transition-all cursor-pointer
                ${sel
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-base-200 bg-base-100 hover:border-primary/50 hover:bg-base-200/50 hover:shadow-sm'}"
                onclick="wizardState.selectModel('${key}'); renderWizard();">
                <div class="flex items-center justify-between w-full">
                  <div class="p-2 rounded-xl ${sel ? 'bg-primary/15' : 'bg-base-200 group-hover:bg-primary/10'} transition-colors">
                    <i data-lucide="${cfg.icon}" class="w-5 h-5 ${sel ? 'text-primary' : 'text-base-content/50 group-hover:text-primary/70'}"></i>
                  </div>
                  ${sel ? '<i data-lucide="check-circle" class="w-5 h-5 text-primary"></i>' : '<div class="w-5 h-5"></div>'}
                </div>
                <div>
                  <div class="font-semibold text-sm ${sel ? 'text-primary' : 'text-base-content'}">${cfg.label}</div>
                  <div class="text-xs text-base-content/40 mt-0.5 font-mono">${key}</div>
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
    // isLeadSubmodel: alleen voor x_sales_action_sheet → crm.lead (speciale enrichment-UI)
    const isLeadSubmodel = submodelKey === 'crm.lead' && model === 'x_sales_action_sheet';

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
          ${renderL2Submodels(submodelKey)}
        </div>
      ` : ''}
    `;
  }

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-2">Stap 2: Wat ophalen?</h2>
        ${(() => {
          const dbModel = modelsConfigCache[model];
          const baseFields = dbModel?.base_fields;
          const labels = (Array.isArray(baseFields) && baseFields.length > 0)
            ? baseFields.map(bf => bf.label || bf.field)
            : ['id', MODEL_CONFIG[model]?.nameField || 'naam', 'datum'];
          return `<p class="text-base-content/60 mb-4">Selecteer categorieën voor <strong>${modelCfg.label || model}</strong>. Basisvelden (<span class="font-mono text-xs">${labels.join(', ')}</span>) zijn altijd inbegrepen.</p>`;
        })()}
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

/**
 * Render L2-submodel toggles voor een gegeven L1-submodel.
 * Toont enable/disable knoppen voor elk submodel dat het L1-model zelf heeft.
 * Puur sync — geen DB-ophaling nodig, alleen MODEL_CONFIG.
 *
 * @param {string} parentKey  - bv. 'crm.lead', 'x_sales_action_sheet'
 * @returns {string} HTML
 */
function renderL2Submodels(parentKey) {
  const l2Keys = MODEL_CONFIG[parentKey]?.submodels || [];
  if (!l2Keys.length) return '';

  // Context-aware descriptions: eerst parentKey|l2Key, dan l2Key als fallback
  const L2_DESCRIPTIONS = {
    'mail.message':                    'Notities, emails en veldwijzigingen uit de chatter',
    'mail.activity':                   'Geplande activiteiten (taken, afspraken, herinneringen)',
    'crm.lead':                        'Leads gelinkt aan dit actieblad (via x_studio_as_opportunity_ids)',
    'x_sales_action_sheet':            'Actiebladen gelinkt aan dit record',
    'x_web_visitor|x_ad_touchpoint':   'Advertentie-klikken van deze bezoeker',
    'x_web_visitor|crm.lead':          'Leads gelinkt aan dit bezoekersprofiel (via x_studio_lead_ids)',
    'x_ad_touchpoint|x_web_visitor':   'Bezoeker die op deze advertentie klikte (met optioneel leads als L2)'
  };

  const rows = l2Keys.map(l2Key => {
    const l2Cfg = MODEL_CONFIG[l2Key] || {};
    const isEnabled = !!(wizardState.subSubmodels[parentKey]?.[l2Key + '_enabled']);
    const desc = L2_DESCRIPTIONS[parentKey + '|' + l2Key] || L2_DESCRIPTIONS[l2Key] || '';

    return `
      <label class="label cursor-pointer justify-start gap-3 py-2 hover:bg-base-200 rounded-lg px-2 transition-colors"
             onclick="event.preventDefault(); if(!wizardState.subSubmodels['${parentKey}']) wizardState.subSubmodels['${parentKey}'] = {}; wizardState.subSubmodels['${parentKey}']['${l2Key}_enabled'] = ${!isEnabled}; renderWizard();">
        <input type="checkbox" class="checkbox checkbox-xs checkbox-secondary pointer-events-none"
          ${isEnabled ? 'checked' : ''}
        />
        <div class="flex-1">
          <div class="label-text text-sm font-medium">${l2Cfg.label || l2Key}</div>
          ${desc ? `<div class="label-text-alt text-xs text-base-content/50">${desc}</div>` : ''}
        </div>
        ${isEnabled ? `<span class="badge badge-xs badge-secondary badge-outline">aan</span>` : ''}
      </label>`;
  }).join('');

  return `
    <div class="mt-4 pt-3 border-t border-base-200">
      <div class="text-xs font-semibold text-secondary/60 uppercase tracking-wide mb-2 flex items-center gap-1">
        <i data-lucide="layers" class="w-3 h-3"></i>
        Subdata van ${MODEL_CONFIG[parentKey]?.label || parentKey}
      </div>
      <div class="space-y-1">${rows}</div>
    </div>`;
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
/**
 * Generieke multi-select pill filter.
 * Opt-out: alle opties standaard aan, gebruiker kan uitzetten.
 *
 * @param {Object} cfg
 * @param {string}   cfg.label         - Sectietitel
 * @param {string}   [cfg.hint]        - Kleine hint tekst
 * @param {Array}    cfg.options        - [{ value, label, badge? }]
 * @param {Array}    cfg.state          - Huidig geselecteerde waarden
 * @param {string}   cfg.toggleFn       - JS expressie voor toggle (bijv. 'wizardState.togglePartnerType')
 * @param {string}   cfg.allCode        - JS code om alles te selecteren
 * @param {string}   [cfg.noneCode]     - JS code om alles te deselecteren
 * @returns {string} HTML
 */
function renderMultiPillFilter({ label, hint, options, state, toggleFn, allCode, noneCode }) {
  const allValues = options.map(o => o.value);
  const allSelected = allValues.every(v => state.includes(v));
  const noneSelected = state.length === 0;
  const isFiltered = !allSelected;

  const pills = options.map(opt => {
    const active = state.includes(opt.value);
    const valStr = typeof opt.value === 'string' ? `'${opt.value}'` : opt.value;
    return `
      <button class="btn btn-sm gap-1 transition-all ${active ? 'btn-primary' : 'btn-ghost border border-base-300 opacity-50'}"
        onclick="${toggleFn}(${valStr}); renderWizard();">
        ${opt.badge ? `<span class="badge badge-xs ${opt.badge}"></span>` : ''}
        ${opt.label}
      </button>`;
  }).join('');

  return `
    <div class="bg-base-200/60 rounded-xl p-4 mb-3">
      <div class="flex items-center justify-between mb-3">
        <span class="font-semibold text-sm flex items-center gap-2">
          ${label}
          ${isFiltered ? `<span class="badge badge-xs badge-warning">gefilterd</span>` : `<span class="badge badge-xs badge-ghost">alles</span>`}
        </span>
        <div class="flex gap-1">
          ${isFiltered ? `<button class="btn btn-xs btn-ghost" onclick="${allCode}; renderWizard();">Alles aan</button>` : ''}
          ${!noneSelected && noneCode ? `<button class="btn btn-xs btn-ghost text-error" onclick="${noneCode}; renderWizard();">Alles uit</button>` : ''}
        </div>
      </div>
      ${hint ? `<div class="text-xs text-base-content/50 mb-2">${hint}</div>` : ''}
      <div class="flex flex-wrap gap-2">${pills}</div>
    </div>`;
}

async function renderStep3() {
  const model = wizardState.selectedModel || 'x_sales_action_sheet';
  const modelCfg = MODEL_CONFIG[model] || {};
  const dateFields = modelCfg.dateFields || [{ field: 'create_date', label: 'Aanmaakdatum' }];
  const tf = wizardState.timeFilter;
  const presets = await fetchAiExportPresets();
  let crmStages = [];
  if (wizardState.leadEnrichment.enabled || (modelCfg.extraFilters || []).includes('won_status') || !!wizardState.submodelSets['crm.lead_enabled']) {
    crmStages = await fetchCrmStages();
    // Init stage filter to all stages when first loaded
    if (crmStages.length && !wizardState.leadEnrichment.filters.stage_ids.length) {
      wizardState.leadEnrichment.filters.stage_ids = crmStages.map(s => s.id);
    }
    if (crmStages.length) wizardState._totalStages = crmStages.length;
  }

  // Ad touchpoint filters (source / medium / campaign)
  let adFiltersHtml = '';
  if ((modelCfg.extraFilters || []).includes('ad_filters')) {
    const adVals = await fetchTouchpointFilterValues();
    if (!wizardState._adFiltersInitialized && (adVals.sources.length || adVals.mediums.length || adVals.campaigns.length)) {
      wizardState.adTouchpointFilter.sources   = [...adVals.sources];
      wizardState.adTouchpointFilter.mediums   = [...adVals.mediums];
      wizardState.adTouchpointFilter.campaigns = [...adVals.campaigns];
      wizardState._adFilters = { ...adVals };
      wizardState._adFiltersInitialized = true;
    }
    const adParts = [];
    if (adVals.sources.length) {
      adParts.push(renderMultiPillFilter({
        label: 'Bron (source)',
        options: adVals.sources.map(s => ({ value: s, label: s })),
        state: wizardState.adTouchpointFilter.sources,
        toggleFn: 'wizardState.toggleAdSource',
        allCode:  'wizardState.adTouchpointFilter.sources=[' + adVals.sources.map(s => JSON.stringify(s)).join(',') + ']',
        noneCode: 'wizardState.adTouchpointFilter.sources=[]'
      }));
    }
    if (adVals.mediums.length) {
      adParts.push(renderMultiPillFilter({
        label: 'Medium',
        options: adVals.mediums.map(m => ({ value: m, label: m })),
        state: wizardState.adTouchpointFilter.mediums,
        toggleFn: 'wizardState.toggleAdMedium',
        allCode:  'wizardState.adTouchpointFilter.mediums=[' + adVals.mediums.map(m => JSON.stringify(m)).join(',') + ']',
        noneCode: 'wizardState.adTouchpointFilter.mediums=[]'
      }));
    }
    if (adVals.campaigns.length) {
      adParts.push(renderMultiPillFilter({
        label: 'Campagne',
        options: adVals.campaigns.map(c => ({ value: c, label: c.length > 40 ? c.slice(0, 38) + '…' : c })),
        state: wizardState.adTouchpointFilter.campaigns,
        toggleFn: 'wizardState.toggleAdCampaign',
        allCode:  'wizardState.adTouchpointFilter.campaigns=[' + adVals.campaigns.map(c => JSON.stringify(c)).join(',') + ']',
        noneCode: 'wizardState.adTouchpointFilter.campaigns=[]'
      }));
    }
    adFiltersHtml = adParts.join('');
  }

  // Bounce filter voor x_web_visitor
  let bounceHtml = '';
  if ((modelCfg.extraFilters || []).includes('bounce')) {
    const pb = wizardState.webVisitorFilter.possibleBounce;
    const ib = wizardState.webVisitorFilter.instantBounce;
    const pbFiltered = pb !== 'include';
    const ibFiltered = ib !== 'include';
    const bounceFiltered = pbFiltered || ibFiltered;
    const modeBtn = (field, mode, current, label, style) =>
      `<button class="btn btn-sm ${current === mode ? style : 'btn-ghost border border-base-300 opacity-60'}"
        onclick="wizardState.webVisitorFilter.${field}='${mode}'; renderWizard();">${label}</button>`;
    bounceHtml = `
      <div class="bg-base-200/60 rounded-xl p-4 mb-3">
        <div class="flex items-center justify-between mb-3">
          <span class="font-semibold text-sm flex items-center gap-2">
            Bounces
            ${bounceFiltered ? '<span class="badge badge-xs badge-warning">gefilterd</span>' : '<span class="badge badge-xs badge-ghost">alles</span>'}
          </span>
          ${bounceFiltered ? `<button class="btn btn-xs btn-ghost" onclick="wizardState.webVisitorFilter.possibleBounce='include'; wizardState.webVisitorFilter.instantBounce='include'; renderWizard();">Reset</button>` : ''}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div class="text-xs text-base-content/60 mb-2 font-medium">Possible bounce</div>
            <div class="flex gap-1 flex-wrap">
              ${modeBtn('possibleBounce', 'include', pb, 'Alle', 'btn-neutral')}
              ${modeBtn('possibleBounce', 'exclude', pb, 'Excl. bounces', 'btn-success')}
              ${modeBtn('possibleBounce', 'only',    pb, 'Alleen bounces', 'btn-warning')}
            </div>
          </div>
          <div>
            <div class="text-xs text-base-content/60 mb-2 font-medium">Instant bounce</div>
            <div class="flex gap-1 flex-wrap">
              ${modeBtn('instantBounce', 'include', ib, 'Alle', 'btn-neutral')}
              ${modeBtn('instantBounce', 'exclude', ib, 'Excl. bounces', 'btn-success')}
              ${modeBtn('instantBounce', 'only',    ib, 'Alleen bounces', 'btn-warning')}
            </div>
          </div>
        </div>
      </div>`;
  }

  // Source site filter voor x_web_visitor
  let sourceSiteHtml = '';
  if ((modelCfg.extraFilters || []).includes('source_site')) {
    const sites = await fetchSourceSites();
    if (sites.length && !wizardState._sourceSitesInitialized) {
      wizardState.webVisitorFilter.sourceSites = [...sites];
      wizardState._allSourceSites = [...sites];
      wizardState._sourceSitesInitialized = true;
    }
    if (sites.length) {
      sourceSiteHtml = renderMultiPillFilter({
        label: 'Bron website',
        hint: 'Website waarvan de bezoeker afkomstig is (x_studio_source_site)',
        options: sites.map(s => ({ value: s, label: s })),
        state: wizardState.webVisitorFilter.sourceSites,
        toggleFn: 'wizardState.toggleSourceSite',
        allCode: 'wizardState.webVisitorFilter.sourceSites=[' + sites.map(s => JSON.stringify(s)).join(',') + ']',
        noneCode: 'wizardState.webVisitorFilter.sourceSites=[]'
      });
    }
  }

  const quickPeriods = [
    { key: 'week', label: 'Voorbije week' }, { key: 'month', label: 'Voorbije maand' },
    { key: 'quarter', label: 'Voorbij kwartaal' }, { key: 'year', label: 'Voorbij jaar' }
  ];

  const resolved = wizardState.resolvedTimeFilter();
  const periodLabel = resolved.from ? `${resolved.from} → ${resolved.to}` : '';

  // Show lead filters if:
  // a) actionsheet with lead enrichment enabled, OR
  // b) crm.lead is the direct/primary model, OR
  // c) crm.lead is enabled as a submodel (L1)
  const showLeadFilters = wizardState.leadEnrichment.enabled ||
    (modelCfg.extraFilters || []).includes('won_status') ||
    !!wizardState.submodelSets['crm.lead_enabled'];

  // --- Uniform filter sections via renderMultiPillFilter ---

  // Partner type (res.partner: x_studio_company_type)
  const PARTNER_COMPANY_TYPES = [
    { value: 1, label: "VME's in advies (zelfbeheer)" },
    { value: 3, label: "VME's in beheer (onder professional)" },
    { value: 2, label: 'Professionals' }
  ];
  const PARTNER_COMPANY_STATUSES = [
    { value: 'Free Trial', label: 'Free Trial' },
    { value: 'Active',     label: 'Actief' },
    { value: 'Inactive',   label: 'Inactief' },
    { value: 'Internal',   label: 'Internal' },
    { value: 'Blocked',    label: 'Geblokkeerd' }
  ];

  const partnerTypeHtml = (modelCfg.extraFilters || []).includes('partner_type')
    ? renderMultiPillFilter({
        label: 'Type partner',
        options: PARTNER_COMPANY_TYPES,
        state: wizardState.partnerFilter.companyTypes,
        toggleFn: 'wizardState.togglePartnerType',
        allCode: 'wizardState.partnerFilter.companyTypes=[1,3,2]',
        noneCode: 'wizardState.partnerFilter.companyTypes=[]'
      })
    : '';

  const companyStatusHtml = (modelCfg.extraFilters || []).includes('company_status')
    ? renderMultiPillFilter({
        label: 'Status',
        options: PARTNER_COMPANY_STATUSES,
        state: wizardState.partnerFilter.companyStatuses,
        toggleFn: 'wizardState.toggleCompanyStatus',
        allCode: "wizardState.partnerFilter.companyStatuses=['Free Trial','Active','Inactive','Internal','Blocked']",
        noneCode: 'wizardState.partnerFilter.companyStatuses=[]'
      })
    : '';

  // Won status (crm.lead: won_status) — opt-out
  const wonStatusHtml = showLeadFilters
    ? renderMultiPillFilter({
        label: 'Lead status',
        options: [
          { value: 'won',     label: 'Gewonnen' },
          { value: 'lost',    label: 'Verloren' },
          { value: 'pending', label: 'Lopend'   }
        ],
        state: wizardState.leadEnrichment.filters.won_status,
        toggleFn: 'wizardState.toggleWonStatus',
        allCode: "wizardState.leadEnrichment.filters.won_status=['won','lost','pending']",
        noneCode: "wizardState.leadEnrichment.filters.won_status=[]"
      })
    : '';

  // CRM stages — card met grid (complexere UX, apart gehouden)
  const stagesFiltered = crmStages.length > 0 &&
    wizardState.leadEnrichment.filters.stage_ids.length < crmStages.length;
  const stagesHtml = (showLeadFilters && crmStages.length > 0) ? `
    <div class="bg-base-200/60 rounded-xl p-4 mb-3">
      <div class="flex items-center justify-between mb-3">
        <span class="font-semibold text-sm flex items-center gap-2">
          CRM Stages
          ${stagesFiltered
            ? '<span class="badge badge-xs badge-warning">gefilterd</span>'
            : '<span class="badge badge-xs badge-ghost">alles</span>'}
        </span>
        <div class="flex gap-1">
          ${stagesFiltered ? `<button class="btn btn-xs btn-ghost" onclick="selectStagesUpTo(${crmStages[crmStages.length-1]?.id||0}); renderWizard();">Alles aan</button>` : ''}
          <button class="btn btn-xs btn-ghost text-error" onclick="wizardState.setLeadStageFilter([]); renderWizard();">Wissen</button>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
        ${crmStages.map(s => `
          <label class="label cursor-pointer justify-start gap-2 rounded hover:bg-base-300 px-2 py-1">
            <input type="checkbox" class="checkbox checkbox-sm checkbox-primary"
              ${wizardState.leadEnrichment.filters.stage_ids.includes(s.id) ? 'checked' : ''}
              onchange="handleStageChange(${s.id}, this.checked); renderWizard();" />
            <span class="label-text text-xs"><span class="badge badge-xs mr-1">${s.sequence}</span>${s.name}</span>
          </label>`).join('')}
      </div>
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
        <div class="bg-base-200/60 rounded-xl p-4 mb-2">

          <!-- Veld-selector: altijd zichtbaar -->
          <div class="flex items-center gap-2 mb-4">
            <i data-lucide="calendar" class="w-4 h-4 text-base-content/50 shrink-0"></i>
            <span class="text-sm text-base-content/60">Filteren op datum:</span>
            ${dateFields.length > 1 ? `
              <select class="select select-bordered select-xs font-semibold"
                onchange="wizardState.timeFilter.field = this.value; renderWizard();">
                ${dateFields.map(df => `<option value="${df.field}" ${tf.field === df.field ? 'selected' : ''}>${df.label}</option>`).join('')}
              </select>` : `
              <span class="badge badge-outline badge-sm font-semibold">${dateFields[0]?.label || 'Aanmaakdatum'}</span>`}
          </div>

          <!-- Modus tabs -->
          <div class="flex flex-wrap gap-2 mb-3">
            ${[
              { k: null,    l: 'Geen',         icon: 'x-circle' },
              { k: 'quick', l: 'Snelle keuze', icon: 'zap' },
              { k: 'from',  l: 'Vanaf datum',  icon: 'calendar-arrow-right' },
              { k: 'range', l: 'Eigen bereik', icon: 'calendar-range' }
            ].map(o => `
              <button class="btn btn-sm gap-1 ${tf.mode === o.k ? 'btn-primary' : 'btn-ghost border border-base-300'}"
                onclick="wizardState.timeFilter.mode = ${o.k === null ? 'null' : `'${o.k}'`}; ${o.k === 'quick' ? `wizardState.timeFilter.quickPeriod = wizardState.timeFilter.quickPeriod || 'month';` : ''} renderWizard();">
                <i data-lucide="${o.icon}" class="w-3 h-3"></i>${o.l}
              </button>`).join('')}
          </div>

          <!-- Snelle periode -->
          ${tf.mode === 'quick' ? `
            <div class="flex flex-wrap gap-2 mb-3">
              ${quickPeriods.map(p => `
                <button class="btn btn-sm ${tf.quickPeriod === p.key ? 'btn-accent' : 'btn-outline border-base-300'}"
                  onclick="wizardState.timeFilter.quickPeriod = '${p.key}'; renderWizard();">
                  ${p.label}
                </button>`).join('')}
            </div>` : ''}

          <!-- Vanaf datum -->
          ${tf.mode === 'from' ? `
            <div class="flex items-center gap-3 mb-3">
              <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs font-semibold">Vanaf</span></label>
                <input type="date" class="input input-bordered input-sm" value="${tf.dateFrom||''}"
                  onchange="wizardState.timeFilter.dateFrom = this.value; renderWizard();" />
              </div>
              <div class="self-end pb-2 text-base-content/40 text-sm">→ vandaag</div>
            </div>` : ''}

          <!-- Eigen bereik -->
          ${tf.mode === 'range' ? `
            <div class="flex items-center gap-3 mb-3">
              <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs font-semibold">Van</span></label>
                <input type="date" class="input input-bordered input-sm" value="${tf.dateFrom||''}"
                  onchange="wizardState.timeFilter.dateFrom = this.value; renderWizard();" />
              </div>
              <div class="self-end pb-2 text-base-content/40">→</div>
              <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs font-semibold">Tot en met</span></label>
                <input type="date" class="input input-bordered input-sm" value="${tf.dateTo||''}"
                  onchange="wizardState.timeFilter.dateTo = this.value; renderWizard();" />
              </div>
            </div>` : ''}

          <!-- Samenvatting van actief filter -->
          ${periodLabel ? `
            <div class="flex items-center gap-2 mt-1 pt-3 border-t border-base-300">
              <i data-lucide="check-circle" class="w-4 h-4 text-success shrink-0"></i>
              <span class="text-xs text-base-content/60">Actief filter:</span>
              <span class="badge badge-success badge-sm font-mono">${periodLabel}</span>
            </div>` : `
            <div class="flex items-center gap-2 mt-1 pt-3 border-t border-base-300">
              <i data-lucide="minus-circle" class="w-4 h-4 text-base-content/30 shrink-0"></i>
              <span class="text-xs text-base-content/40">Geen tijdsfilter actief — alle records worden opgehaald.</span>
            </div>`}

        </div>

        ${partnerTypeHtml}
        ${companyStatusHtml}
        ${sourceSiteHtml}
        ${bounceHtml}
        ${adFiltersHtml}
        ${apartmentsHtml}
        ${wonStatusHtml}
        ${stagesHtml}

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

        <!-- Opslaan als zoekopdracht -->
        <div class="divider mt-6">Opslaan</div>
        <div id="save-search-section">
          ${wizardState._saveSearchName !== undefined ? `
            <div class="flex gap-2 items-center">
              <input type="text" class="input input-bordered input-sm flex-1" placeholder="Naam voor deze zoekopdracht…"
                value="${(wizardState._saveSearchName || '').replace(/"/g, '&quot;')}"
                oninput="wizardState._saveSearchName = this.value;"
                onkeydown="if(event.key==='Enter') saveCurrentSearch(); if(event.key==='Escape') { wizardState._saveSearchName=undefined; renderWizard(); }" />
              <button class="btn btn-sm btn-primary" onclick="saveCurrentSearch()">
                <i data-lucide="bookmark-check" class="w-4 h-4"></i>Opslaan
              </button>
              <button class="btn btn-sm btn-ghost" onclick="wizardState._saveSearchName=undefined; renderWizard();">Annuleren</button>
            </div>
          ` : `
            <button class="btn btn-outline btn-sm gap-2" onclick="wizardState._saveSearchName=''; renderWizard();">
              <i data-lucide="bookmark-plus" class="w-4 h-4"></i>Opslaan als zoekopdracht
            </button>
          `}
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
        ${canExecute ? `<button class="btn btn-primary" id="executeBtn" onclick="executeQuery();">Uitvoeren</button>` : ''}
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
  if (wizardState.currentStep === 1) stepContent = await renderStep1();
  else if (wizardState.currentStep === 2) stepContent = await renderStep2();
  else if (wizardState.currentStep === 3) stepContent = await renderStep3();

  // Banner: bezig met bewerken van een opgeslagen zoekopdracht
  const editing = wizardState._editingFromSavedSearch;
  const editingBanner = editing ? `
    <div class="alert bg-warning/10 border border-warning/30 rounded-xl mb-4 flex items-center gap-3 py-3 px-4">
      <i data-lucide="pencil" class="w-4 h-4 text-warning shrink-0"></i>
      <span class="text-sm flex-1">Je bewerkt <strong>${editing.name}</strong></span>
      <button class="btn btn-xs btn-warning gap-1" onclick="saveSavedSearchChanges()">
        <i data-lucide="save" class="w-3 h-3"></i>Wijzigingen opslaan
      </button>
      <button class="btn btn-xs btn-ghost" onclick="cancelEditSavedSearch()">Terugzetten</button>
    </div>` : '';

  container.innerHTML = renderProgressBar() + editingBanner + stepContent + renderActions();
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

// ─── Web activity HTML sanitizer ─────────────────────────────────────────────
// Converts x_studio_merged_kpi_html / x_studio_merged_timeline_html from
// full inline-CSS HTML blobs into compact structured data for AI export.

function _styleOf(el) { return el.getAttribute('style') || ''; }

function _parseKpiHtml(html) {
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = {};
    const allDivs = Array.from(doc.querySelectorAll('div'));

    // KPI cards: border-radius:8px + background:#fff, with label (uppercase) + value (font-size:20px)
    for (const card of allDivs) {
      const cs = _styleOf(card);
      if (!cs.includes('border-radius:8px') || !cs.includes('background:#fff')) continue;
      const children = Array.from(card.children).filter(c => c.tagName === 'DIV');
      if (children.length < 2) continue;
      const labelEl = children[0];
      const valueEl = children[1];
      const labelStyle = _styleOf(labelEl);
      const valueStyle = _styleOf(valueEl);
      // Label must be uppercase/small-caps header; value must be the large numeric/text value
      if (!labelStyle.includes('text-transform:uppercase')) continue;
      // Skip if valueEl is a flex row (that's a page-list block, not a KPI value)
      if (valueStyle.includes('display:flex') || !valueStyle.includes('font-size:20px')) continue;
      const label = labelEl.textContent.trim();
      const value = valueEl.textContent.trim();
      if (!label || !value) continue;
      const key = label.toLowerCase()
        .replace(/['']/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (!result[key]) result[key] = value;
    }

    // Top pages block: first div with child text "Top pagina's"
    const topPagesBlock = allDivs.find(d =>
      d.children[0] && d.children[0].textContent.trim() === "Top pagina's"
    );
    if (topPagesBlock) {
      const rows = Array.from(topPagesBlock.querySelectorAll('div')).filter(d =>
        _styleOf(d).includes('justify-content:space-between')
      );
      const pages = rows.map(r => {
        const spans = Array.from(r.querySelectorAll('span'));
        // First span may have a nested site-label span — get just the first text node
        const firstSpan = spans[0];
        const pageTxt = firstSpan
          ? Array.from(firstSpan.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()
            || firstSpan.textContent.trim()
          : null;
        const countTxt = spans.length > 1 ? spans[spans.length - 1].textContent.trim() : null;
        const siteTxt = firstSpan?.querySelector('span')?.textContent.trim() || null;
        if (!pageTxt) return null;
        const entry = { pagina: pageTxt };
        if (siteTxt) entry.site = siteTxt;
        if (countTxt) entry.bezoeken = countTxt;
        return entry;
      }).filter(Boolean);
      if (pages.length) result.top_paginas = pages;
    }

    // Channels block: first div with child text "Advertenties"
    const adsBlock = allDivs.find(d =>
      d.children[0] && d.children[0].textContent.trim() === 'Advertenties'
    );
    if (adsBlock) {
      const channels = Array.from(adsBlock.querySelectorAll('span')).map(s => s.textContent.trim()).filter(Boolean);
      if (channels.length) result.advertentie_kanalen = channels;
    }

    return Object.keys(result).length ? result : null;
  } catch (e) {
    console.warn('_parseKpiHtml error:', e.message);
    return null;
  }
}

function _extractSessionEvents(eventsDiv) {
  const pages = [], conversies = [], advertenties = [], acties = [], geskimd = [];

  const processBlock = (block) => {
    const s = _styleOf(block);

    // Split row: flex container wrapping a 2/3 page block + 1/3 side block.
    // The flex:2 div is a wrapper — the actual event block is its first child.
    if (s.includes('display:flex') && s.includes('align-items:stretch')) {
      for (const child of block.children) {
        if (_styleOf(child).includes('flex:2')) {
          if (child.children[0]) processBlock(child.children[0]);
          return;
        }
      }
      if (block.children[0]) processBlock(block.children[0]);
      return;
    }

    // Calendly (green)
    if (s.includes('#22c55e') && s.includes('border-left')) {
      const titleEl = Array.from(block.children).find(c => _styleOf(c).includes('font-weight:700'));
      const text = titleEl ? titleEl.textContent.trim().replace(/^✓\s*/, '') : block.textContent.replace(/Conversie/i,'').trim().slice(0, 80);
      if (text) conversies.push(text);
      return;
    }

    // Touchpoint / ad (purple)
    if (s.includes('#9333ea') && s.includes('border-left')) {
      const titleEl = Array.from(block.children).find(c => _styleOf(c).includes('font-weight:700'));
      const detailEls = Array.from(block.children).filter(c => _styleOf(c).includes('font-size:11px') && _styleOf(c).includes('#9333ea'));
      const adName = Array.from(block.children).find(c => _styleOf(c).includes('font-size:12px') && _styleOf(c).includes('font-weight:700'));
      const parts = [];
      if (titleEl) parts.push(titleEl.textContent.trim());
      detailEls.forEach(d => { const t = d.textContent.trim(); if (t) parts.push(t); });
      if (adName && !detailEls.includes(adName)) parts.push(adName.textContent.trim());
      if (parts.length) advertenties.push(parts.join(' | '));
      return;
    }

    // Exit/click (orange)
    if (s.includes('#f97316') && s.includes('border-left')) {
      const titleEl = Array.from(block.children).find(c => _styleOf(c).includes('font-weight:600'));
      if (titleEl) acties.push('exit: ' + titleEl.textContent.trim());
      return;
    }

    // Page block: has border-left but not the above colors
    if (s.includes('border-left')) {
      const children = Array.from(block.children);
      const labelDiv = children[0];
      const pageDiv = children[children.length - 1];
      if (!pageDiv || pageDiv === labelDiv) return;

      // Extract engagement label from the span inside the label div
      let engagement = null;
      if (labelDiv) {
        const span = labelDiv.querySelector('span');
        if (span) {
          // "[grondig bestudeerd — 3m 20s]" or "[gelezen — 45s]" etc.
          engagement = span.textContent.trim().replace(/^\[|\]$/g, '').trim();
        }
      }

      const pageName = pageDiv.textContent.trim();
      if (!pageName) return;
      const entry = { pagina: pageName };
      if (engagement) entry.engagement = engagement;
      pages.push(entry);
      return;
    }
  };

  for (const child of eventsDiv.children) {
    // vt-skimmed pill
    if (_styleOf(child).includes('font-style:italic') || child.className === 'vt-skimmed') {
      const txt = child.textContent.trim();
      if (txt) geskimd.push(txt);
      continue;
    }
    processBlock(child);
  }

  const result = {};
  if (pages.length) result.paginas = pages;
  if (conversies.length) result.conversies = conversies;
  if (advertenties.length) result.advertenties = advertenties;
  if (acties.length) result.acties = acties;
  if (geskimd.length) result.geskimd = geskimd;
  return result;
}

function _parseTimelineHtml(html) {
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrap = doc.querySelector('.vt-wrap');
    if (!wrap) return null;

    const sessions = [];
    let currentDay = null;

    for (const el of wrap.children) {
      // Day header
      if (el.classList.contains('vt-day-header')) {
        currentDay = el.textContent.trim();
        continue;
      }
      // Checkbox toggles and login/partner pills → skip
      if (el.tagName === 'INPUT' || !el.classList.contains('vt-session')) continue;

      const header = el.querySelector('.vt-session-header');
      const eventsDiv = el.querySelector('.vt-events');
      if (!header) continue;

      // Time range — bold span
      const allSpans = Array.from(header.querySelectorAll('span'));
      const timeSpan = allSpans.find(s => _styleOf(s).includes('font-weight:600'));
      if (!timeSpan) continue;
      const session = { datum: currentDay, tijd: timeSpan.textContent.trim() };

      // Duration — span with color:#aaa and font-weight:400
      const durSpan = allSpans.find(s => _styleOf(s).includes('font-weight:400') && _styleOf(s).includes('#aaa'));
      if (durSpan) session.duur = durSpan.textContent.trim();

      // Conversion/intent badges (border-radius:10px spans)
      const badges = allSpans
        .filter(s => _styleOf(s).includes('border-radius:10px'))
        .map(s => s.textContent.trim())
        .filter(Boolean);
      if (badges.length) session.badges = badges;

      // Events within session
      if (eventsDiv) {
        const events = _extractSessionEvents(eventsDiv);
        Object.assign(session, events);
      }

      sessions.push(session);
    }

    if (!sessions.length) return null;
    return { sessies: sessions, totaal: sessions.length };
  } catch (e) {
    console.warn('_parseTimelineHtml error:', e.message);
    return null;
  }
}

function sanitizeWebActivityFields(data) {
  const rowKey = data.records ? 'records' : data.rows ? 'rows' : null;
  if (!rowKey) return data;
  const sanitized = data[rowKey].map(row => {
    if (!row.x_studio_merged_kpi_html && !row.x_studio_merged_timeline_html) return row;
    const out = { ...row };
    if (out.x_studio_merged_kpi_html) {
      const parsed = _parseKpiHtml(out.x_studio_merged_kpi_html);
      if (parsed) out.web_activiteit_kpi = parsed;
      delete out.x_studio_merged_kpi_html;
    }
    if (out.x_studio_merged_timeline_html) {
      const parsed = _parseTimelineHtml(out.x_studio_merged_timeline_html);
      if (parsed) out.web_activiteit_sessies = parsed;
      delete out.x_studio_merged_timeline_html;
    }
    return out;
  });
  return { ...data, [rowKey]: sanitized };
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
  if (payloadDisplay) payloadDisplay.innerHTML = '';

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
  const btn = document.getElementById('executeBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> ' + (msg || 'Bezig...');
  }
  // Also update inline container for sub-operations (web activity etc.)
  const c = document.getElementById('results-container');
  if (c && msg && msg !== 'Bezig met query uitvoeren...') {
    c.innerHTML = `<div class="flex items-center gap-3 py-4 text-sm text-base-content/60"><span class="loading loading-spinner loading-sm"></span>${msg}</div>`;
  }
}
function hideLoading() {
  const btn = document.getElementById('executeBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Uitvoeren'; }
  const c = document.getElementById('results-container');
  if (c && c.querySelector('.loading')) c.innerHTML = '';
}
function showError(error) {
  hideLoading();
  ensureResultsModal();
  const box = document.getElementById('resultsModalBox');
  box.innerHTML = '<div class="flex items-center gap-2 mb-4">'
    + '<h3 class="font-bold text-lg">Fout</h3>'
    + '<button class="btn btn-ghost btn-sm btn-circle ml-auto" onclick="closeResultsModal()">✕</button>'
    + '</div>'
    + '<div class="alert alert-error"><span>❌ ' + error.message + '</span></div>'
    + '<div class="mt-4 flex gap-2 justify-end">'
    + '<button class="btn btn-outline btn-sm gap-2" onclick="refineQuery()"><i data-lucide="sliders-horizontal" class="w-3 h-3"></i>Aanpassen</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="closeAndReset()">Sluiten</button>'
    + '</div>';
  document.getElementById('resultsModal').showModal();
}
// Last fetched data — kept in memory so the modal can re-export
let _lastQueryData = null;

function ensureResultsModal() {
  if (document.getElementById('resultsModal')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'resultsModal';
  dialog.className = 'modal';
  dialog.innerHTML = '<div class="modal-box w-full max-w-lg" id="resultsModalBox"></div>'
    + '<form method="dialog" class="modal-backdrop"><button>close</button></form>';
  document.body.appendChild(dialog);
}

function showResults(data, isPreview) {
  if (!data?.records) { showError({ message: 'No data returned' }); return; }
  _lastQueryData = sanitizeWebActivityFields(data);
  renderResultsModal(_lastQueryData);
}

function renderResultsModal(data) {
  ensureResultsModal();
  const { records } = data;
  const count = records.length;

  // Build preview: first 3 records, only non-internal cols, max 4 cols
  const allCols = count > 0 ? Object.keys(records[0]).filter(k => !k.startsWith('__')) : [];
  const previewCols = allCols.slice(0, 4);
  const previewRows = records.slice(0, 3);

  let previewHtml = '';
  if (previewCols.length > 0 && previewRows.length > 0) {
    previewHtml = '<div class="overflow-x-auto">'
      + '<table class="table table-xs w-full">'
      + '<thead><tr>' + previewCols.map(k => '<th class="text-xs">' + k + '</th>').join('') + (allCols.length > 4 ? '<th class="text-xs text-base-content/30">…</th>' : '') + '</tr></thead>'
      + '<tbody>'
      + previewRows.map(r => '<tr>' + previewCols.map(k => '<td class="text-xs max-w-24 truncate">' + formatValue(r[k]) + '</td>').join('') + (allCols.length > 4 ? '<td></td>' : '') + '</tr>').join('')
      + '</tbody></table>'
      + (count > 3 ? '<p class="text-xs text-base-content/40 text-right mt-1">+ ' + (count - 3) + ' meer rijen</p>' : '')
      + '</div>';
  }

  // AI preset selector
  const presets = aiExportPresetsCache || [];
  const presetOptions = presets.map(p =>
    '<option value="' + p.id + '"' + (wizardState.aiPresetId === p.id ? ' selected' : '') + '>'
    + p.label + (p.description ? ' — ' + p.description : '') + '</option>'
  ).join('');
  const presetHtml = presets.length > 0
    ? '<div class="form-control mb-4">'
      + '<label class="label py-1"><span class="label-text text-xs font-semibold">AI-instructie bij de JSON</span></label>'
      + '<select class="select select-bordered select-sm" id="modalPresetSelect" onchange="wizardState.aiPresetId = this.value ? parseInt(this.value) : null">'
      + presetOptions + '</select>'
      + '</div>'
    : '';

  const box = document.getElementById('resultsModalBox');
  box.innerHTML =
    '<div class="flex items-center gap-3 mb-4">'
    + '<div class="bg-success/10 rounded-full p-2"><i data-lucide="check-circle-2" class="w-6 h-6 text-success"></i></div>'
    + '<div>'
    + '<h3 class="font-bold text-lg leading-tight">Klaar</h3>'
    + '<p class="text-sm text-base-content/60">' + count + ' record' + (count !== 1 ? 's' : '') + ' opgehaald — ' + allCols.length + ' velden</p>'
    + '</div>'
    + '<button class="btn btn-ghost btn-sm btn-circle ml-auto" onclick="closeResultsModal()">✕</button>'
    + '</div>'

    + '<div class="divider my-2 text-xs">Downloaden</div>'
    + presetHtml
    + '<div class="flex gap-2 mb-4">'
    + '<button class="btn btn-primary flex-1 gap-2" onclick="exportSemanticQuery(\'json\')">'
    + '<i data-lucide="download" class="w-4 h-4"></i>JSON downloaden'
    + '</button>'
    + '<button class="btn btn-outline flex-1 gap-2" onclick="exportSemanticQuery(\'xlsx\')">'
    + '<i data-lucide="table-2" class="w-4 h-4"></i>XLSX downloaden'
    + '</button>'
    + '</div>'

    + '<div class="divider my-2 text-xs">Voorbeeld</div>'
    + previewHtml

    + '<div class="mt-4 flex gap-2 justify-end">'
    + '<button class="btn btn-outline btn-sm gap-2" onclick="refineQuery()">'
    + '<i data-lucide="sliders-horizontal" class="w-3 h-3"></i>Aanpassen'
    + '</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="closeAndReset()">Sluiten</button>'
    + '</div>';

  const modal = document.getElementById('resultsModal');
  modal.showModal();
  if (window.lucide) lucide.createIcons();

  // Clear the inline results container (no more scroll-down card)
  const c = document.getElementById('results-container');
  if (c) c.innerHTML = '';
}
// Sluit popup zonder state te wissen (wizard blijft op huidige stap)
function closeResultsModal() {
  document.getElementById('resultsModal')?.close();
}

// Aanpassen: sluit popup, ga naar stap 3 (filters + export)
function refineQuery() {
  document.getElementById('resultsModal')?.close();
  wizardState.currentStep = 3;
  renderWizard();
}

// Sluiten: sluit popup + reset naar startscherm
function closeAndReset() {
  document.getElementById('resultsModal')?.close();
  wizardState.resetState();
  wizardState.currentStep = 1;
  renderWizard();
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
      data = sanitizeWebActivityFields(data);

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

    await Promise.all([fetchAiExportPresets(), fetchModelsConfig()]);
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