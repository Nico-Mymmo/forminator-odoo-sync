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
    extraFilters: ['apartments']
  },
  'mail.message': {
    label: 'Chatter Berichten',
    icon: 'message-square',
    nameField: 'preview',
    dateFields: [{ field: 'date', label: 'Datum' }],
    extraFilters: []
  },
  'mail.activity': {
    label: 'Activiteiten',
    icon: 'check-square',
    nameField: 'summary',
    dateFields: [{ field: 'date_deadline', label: 'Deadline' }],
    extraFilters: []
  },
  'res.partner': {
    label: "Partners (VME's & Syndici)",
    icon: 'building-2',
    nameField: 'name',
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
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
    extraFilters: ['source_site', 'bounce']
  },
  'x_ad_touchpoint': {
    label: 'Ad Touchpoints',
    icon: 'mouse-pointer-click',
    nameField: 'x_name',
    dateFields: [
      { field: 'x_studio_timestamp', label: 'Tijdstip klik' }
    ],
    extraFilters: ['ad_filters']
  }
};

// ============================================================================
// MODEL GRAPH — één centrale definitie van alle koppelingen (bidirectioneel)
// ============================================================================
// Elke edge geldt in beide richtingen. a/b zijn symmetrisch — volgorde is irrelevant.
// COMM_MODELS (mail.message, mail.activity) worden altijd onder hun parent getoond.
const GRAPH_EDGES = [
  // Data-koppelingen
  { a: 'x_ad_touchpoint',      b: 'x_web_visitor',        via: 'x_studio_visitor',            type: 'many2one'  },
  { a: 'x_web_visitor',        b: 'crm.lead',             via: 'x_studio_lead_ids',           type: 'many2many' },
  { a: 'crm.lead',             b: 'x_sales_action_sheet', via: 'x_studio_as_opportunity_ids', type: 'many2many' },
  { a: 'crm.lead',             b: 'res.partner',          via: 'partner_id',                  type: 'many2one'  },
  { a: 'x_sales_action_sheet', b: 'res.partner',          via: 'x_studio_for_company_id',     type: 'many2one'  },
  // Comm-koppelingen (mail.message + mail.activity hangen aan elk data-model)
  { a: 'x_ad_touchpoint',      b: 'mail.message',         via: 'message_ids',                 type: 'one2many'  },
  { a: 'x_ad_touchpoint',      b: 'mail.activity',        via: 'activity_ids',                type: 'one2many'  },
  { a: 'x_web_visitor',        b: 'mail.message',         via: 'message_ids',                 type: 'one2many'  },
  { a: 'x_web_visitor',        b: 'mail.activity',        via: 'activity_ids',                type: 'one2many'  },
  { a: 'crm.lead',             b: 'mail.message',         via: 'message_ids',                 type: 'one2many'  },
  { a: 'crm.lead',             b: 'mail.activity',        via: 'activity_ids',                type: 'one2many'  },
  { a: 'x_sales_action_sheet', b: 'mail.message',         via: 'message_ids',                 type: 'one2many'  },
  { a: 'x_sales_action_sheet', b: 'mail.activity',        via: 'activity_ids',                type: 'one2many'  },
  { a: 'res.partner',          b: 'mail.message',         via: 'message_ids',                 type: 'one2many'  },
  { a: 'res.partner',          b: 'mail.activity',        via: 'activity_ids',                type: 'one2many'  },
];

/**
 * Geeft alle directe buren van een model terug vanuit de graph.
 * @param {string} model - het model waarvoor je buren wilt
 * @param {string[]} exclude - modellen die uitgesloten moeten worden
 * @returns {string[]}
 */
function getNeighbors(model, exclude = []) {
  const excSet = new Set(exclude);
  const result = [];
  for (const e of GRAPH_EDGES) {
    if (e.a === model && !excSet.has(e.b)) result.push(e.b);
    else if (e.b === model && !excSet.has(e.a)) result.push(e.a);
  }
  return result;
}



// Relatie-metadata: welk Odoo-veld koppelt elk submodel (voor labels op verbindingslijnen)
const RELATION_META = {
  'x_sales_action_sheet': {
    'crm.lead':       { via: 'x_studio_as_opportunity_ids',   type: 'many2many', short: 'm↔m' },
    'mail.message':   { via: 'message_ids',                   type: 'one2many',  short: '1→n' },
    'mail.activity':  { via: 'activity_ids',                  type: 'one2many',  short: '1→n' }
  },
  'res.partner': {
    'crm.lead':             { via: 'partner_id (inverse)',              type: 'one2many',  short: '1→n' },
    'x_sales_action_sheet': { via: 'x_studio_for_company_id (inverse)', type: 'one2many',  short: '1→n' },
    'mail.message':         { via: 'message_ids',                       type: 'one2many',  short: '1→n' },
    'mail.activity':        { via: 'activity_ids',                      type: 'one2many',  short: '1→n' }
  },
  'crm.lead': {
    'x_sales_action_sheet': { via: 'x_studio_as_opportunity_ids (inverse)', type: 'many2many', short: 'm↔m' },
    'mail.message':   { via: 'message_ids',        type: 'one2many',  short: '1→n' },
    'mail.activity':  { via: 'activity_ids',        type: 'one2many',  short: '1→n' }
  },
  'x_web_visitor': {
    'x_ad_touchpoint': { via: 'x_studio_visitor (inverse)', type: 'one2many',  short: '1→n' },
    'crm.lead':        { via: 'x_studio_lead_ids',          type: 'many2many', short: 'm↔m' },
    'mail.message':    { via: 'message_ids',                type: 'one2many',  short: '1→n' },
    'mail.activity':   { via: 'activity_ids',               type: 'one2many',  short: '1→n' }
  },
  'x_ad_touchpoint': {
    'x_web_visitor': { via: 'x_studio_visitor', type: 'many2one', short: 'n→1' }
  }
};

// Spider diagram: global state
const COMM_MODELS = new Set(['mail.message', 'mail.activity']);
let _spiderPan = { x: 0, y: 0 };
let _spiderScale = 1;
let _spiderModel = null;
let _nodePositions = {};
let _spiderPanCleanup = null;
let _spiderLastCx = null; // bijhouden voor pan-compensatie bij canvas-resize
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
      property_groups: []
    };
    this.submodelSets = {};
    this.submodelPaths = {}; // { modelKey: 'direct' | parentL1Key } — welk pad een submodel gebruikt
    // Sub-submodel selectie: { 'crm.lead': { 'mail.message_enabled': true }, ... }
    this.subSubmodels = {};
    this.partnerFilter = { companyTypes: [], companyStatuses: [] };
    this.aiPresetId = null;
    this._expandedSet = null;
    this._showAddSet = false;
    this._showAddField = null; // set_id of which set is open for adding a field
    this._adminOpen = false;     // beheermodal open
    this._editingSet = null;        // set_id being edited
    this._previewSet = null;         // set_id currently previewed (eye icon)
    this._editingField = null;      // field id being edited
    this._totalStages = 0;          // total available stages, for 'all selected' detection
    this._saveSearchName = undefined;    // undefined = hidden, string = input visible
    this._renamingSearchId = null;       // id of saved search being renamed
    this._editingFromSavedSearch = null; // { id, name, snapshot } wanneer bezig met bewerken
    // Web visitor filters
    this.webVisitorFilter = { sourceSites: [], possibleBounce: 'exclude', instantBounce: 'exclude' };
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
    this.submodelPaths = {};
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
    this.webVisitorFilter = { sourceSites: [], possibleBounce: 'exclude', instantBounce: 'exclude' };
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
    if (!enabled) { this.leadEnrichment.filters.won_status = []; this.leadEnrichment.filters.stage_ids = []; }
  }
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
      submodelPaths:    { ...this.submodelPaths },
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
    if (snap.submodelPaths)    this.submodelPaths    = snap.submodelPaths;
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

    // Lead enrichment: alleen als leads als DIRECT L1-node actief is (niet omgeleid via partner)
    const _leadIsViaPartner = model === 'x_sales_action_sheet' && this.submodelPaths['crm.lead'] === 'res.partner';
    if (this.leadEnrichment.enabled && !_leadIsViaPartner) {
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
      // Web Visitors (L2) en Ad Touchpoints (L3) — backend visitor enrichment
      if (this.submodelSets['x_web_visitor_enabled'] || this.submodelSets['x_ad_touchpoint_enabled']) {
        const veFilters = {};
        if (this.webVisitorFilter.possibleBounce !== 'include') veFilters.possible_bounce = this.webVisitorFilter.possibleBounce;
        if (this.webVisitorFilter.instantBounce  !== 'include') veFilters.instant_bounce  = this.webVisitorFilter.instantBounce;
        payload.lead_enrichment.visitor_enrichment = {
          enabled: true,
          touchpoint_enrichment: { enabled: !!this.submodelSets['x_ad_touchpoint_enabled'] },
          ...(Object.keys(veFilters).length ? { filters: veFilters } : {})
        };
      }
      // Partners als L2 van leads (partner_enrichment binnen lead_enrichment)
      const _partnerIsViaLead = model === 'x_sales_action_sheet'
        && this.submodelSets['res.partner_enabled']
        && this.submodelPaths['res.partner'] === 'crm.lead';
      if (_partnerIsViaLead) {
        const _pSets = informationSetsCache['res.partner'] || [];
        const _pAny = _pSets.some(function(s) { return !!wizardState.submodelSets[s.id]; });
        const _pFields = [];
        _pSets.forEach(function(set) {
          if (!_pAny || wizardState.submodelSets[set.id]) {
            (set.information_set_fields || []).forEach(function(f) {
              if (!_pFields.includes(f.field_key)) _pFields.push(f.field_key);
            });
          }
        });
        payload.lead_enrichment.partner_enrichment = { enabled: true, link_field: 'partner_id', fields: _pFields };
      }
    }

    // Chatter enrichment (mail.message submodel)
    if (this.submodelSets['mail.message_enabled']) {
      payload.chatter_enrichment = { enabled: true };
    }

    // Activity enrichment (mail.activity submodel)
    if (this.submodelSets['mail.activity_enabled']) {
      payload.activity_enrichment = { enabled: true, include_done: false };
    }

    // Actieblad → Partner enrichment
    if (model === 'x_sales_action_sheet' && this.submodelSets['res.partner_enabled']) {
      const _partnerVia = this.submodelPaths['res.partner'] || 'direct';
      if (_partnerVia === 'direct') {
        // Directe koppeling actieblad → partner
        // Partner-velden komen uit informationSetsCache['res.partner'], geselecteerd via submodelSets.
        // Fallback: als geen enkele set individueel geselecteerd is, neem alle sets.
        const partnerSets = informationSetsCache['res.partner'] || [];
        const anySetsSelected = partnerSets.some(function(s) { return !!wizardState.submodelSets[s.id]; });
        const partnerFields = [];
        partnerSets.forEach(function(set) {
          if (!anySetsSelected || wizardState.submodelSets[set.id]) {
            (set.information_set_fields || []).forEach(function(f) {
              if (!partnerFields.includes(f.field_key)) partnerFields.push(f.field_key);
            });
          }
        });
        payload.actionsheet_partner_enrichment = { enabled: true, fields: partnerFields };
        // Leads als L2 van partners (crm.lead omgeleid via res.partner)
        if (this.submodelPaths['crm.lead'] === 'res.partner' && this.leadEnrichment.enabled) {
          payload.actionsheet_partner_enrichment.lead_enrichment = { enabled: true, filters: {} };
          const allWonAP = ['won', 'lost', 'pending'];
          if (this.leadEnrichment.filters.won_status.length > 0 && this.leadEnrichment.filters.won_status.length < allWonAP.length) {
            payload.actionsheet_partner_enrichment.lead_enrichment.filters.won_status = this.leadEnrichment.filters.won_status;
          }
        }
      }
      // Als _partnerVia === 'crm.lead': partner_enrichment zit al in lead_enrichment hierboven
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
        if (this.submodelPaths['x_sales_action_sheet'] === 'crm.lead') {
          // Actiebladen via leads (partner → lead → actieblad via x_studio_as_opportunity_ids)
          if (!payload.partner_lead_enrichment) {
            payload.partner_lead_enrichment = { enabled: true, property_groups: [], filters: {} };
          }
          payload.partner_lead_enrichment.lead_actionsheet_enrichment = { enabled: true };
        } else {
          // Directe link: partner → actieblad (via x_studio_for_company_id)
          payload.partner_actionsheet_enrichment = { enabled: true };
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
      // Partner submodel (via e-mail: x_studio_email → res.partner.email)
      if (this.submodelSets['res.partner_enabled']) {
        const partnerSets = informationSetsCache['res.partner'] || [];
        const anySetsSelected = partnerSets.some(s => !!this.submodelSets[s.id]);
        const partnerFields = [];
        partnerSets.forEach(set => {
          if (!anySetsSelected || this.submodelSets[set.id]) {
            (set.information_set_fields || []).forEach(f => {
              if (!partnerFields.includes(f.field_key)) partnerFields.push(f.field_key);
            });
          }
        });
        payload.visitor_partner_enrichment = { enabled: true, fields: partnerFields };
      }
    }

    // crm.lead → Actiebladen enrichment
    if (model === 'crm.lead' && this.submodelSets['x_sales_action_sheet_enabled']) {
      payload.lead_actionsheet_enrichment = { enabled: true };
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
        // L2: leads voor bezoekers (flat state)
        if (this.submodelSets['crm.lead_enabled']) {
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
    this.leadEnrichment = { enabled: false, mode: 'include', filters: { won_status: ['won', 'lost', 'pending'], stage_ids: [] }, property_groups: [] };
    this.submodelSets = {};
    this.subSubmodels = {};
    this.partnerFilter = {
      companyTypes:    [1, 3],
      companyStatuses: ['Free Trial', 'Active', 'Inactive']
    };
    this.webVisitorFilter = { sourceSites: [], possibleBounce: 'exclude', instantBounce: 'exclude' };
    this._allSourceSites = []; this._sourceSitesInitialized = false;
    this.adTouchpointFilter = { sources: [], mediums: [], campaigns: [] };
    this._adFilters = { sources: [], mediums: [], campaigns: [] }; this._adFiltersInitialized = false;
    this.aiPresetId = null; this._expandedSet = null; this._showAddSet = false; this._showAddField = null; this._previewSet = null; this._adminOpen = false;
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

async function runSavedSearch(id) {
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

  // Zorg dat informationSetsCache gevuld is voor alle benodigde modellen
  // vóór buildPayload() wordt aangeroepen — anders zijn submodel-velden leeg.
  // In de wizard gebeurt dit tijdens het renderen van de submodel-stap;
  // bij direct uitvoeren slaan we die stap over en moeten we prefetchen.
  const modelsToFetch = new Set([snapshot.selectedModel || 'x_sales_action_sheet']);
  Object.entries(snapshot.submodelSets || {}).forEach(function([key, val]) {
    if (!val || !key.endsWith('_enabled')) return;
    const model = key.slice(0, -'_enabled'.length);
    // Alleen echte Odoo-modelnames (bevatten punt of beginnen met x_)
    if (model.includes('.') || model.startsWith('x_')) modelsToFetch.add(model);
  });
  await Promise.all(Array.from(modelsToFetch).map(function(m) { return fetchInformationSets(m); }));

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

async function deleteField(fieldId) {
  const res = await fetch(`/insights/api/sales-insights/information-set-fields/${fieldId}`, {
    method: 'DELETE', credentials: 'include'
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  informationSetsCache = {};
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
                onclick="wizardState.selectModel('${key}'); wizardState.currentStep = 2; renderWizard();">
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
// ============================================================================
// ============================================================================
// ============================================================================
// RENDERING: Step 2 — Spider Diagram
// ============================================================================

function toSafeId(k)  { return k.replace(/[^a-z0-9]/gi, '_'); }

function getCurrentNodePos(key) {
  if (_nodePositions[key]) return _nodePositions[key];
  const el = document.getElementById('sn-' + toSafeId(key));
  if (!el) return null;
  return { x: parseInt(el.style.left), y: parseInt(el.style.top) };
}

function updateSpiderLines() {
  const svg = document.querySelector('#spider-canvas svg');
  if (!svg) return;
  svg.querySelectorAll('line[data-s]').forEach(line => {
    const sp = getCurrentNodePos(line.dataset.s);
    const dp = getCurrentNodePos(line.dataset.d);
    if (sp && dp) { line.setAttribute('x1',sp.x); line.setAttribute('y1',sp.y); line.setAttribute('x2',dp.x); line.setAttribute('y2',dp.y); }
  });
  svg.querySelectorAll('circle[data-s]').forEach(c => {
    const sp = getCurrentNodePos(c.dataset.s);
    const dp = getCurrentNodePos(c.dataset.d);
    if (sp && dp) { c.setAttribute('cx', Math.round((sp.x+dp.x)/2)); c.setAttribute('cy', Math.round((sp.y+dp.y)/2)); }
  });
}

/** Data-submodellen links en rechts van het center. */
function dataLRPositions(cx, cy, dataKeys, R) {
  const N = dataKeys.length;
  if (!N) return [];
  if (N === 1) return [{ key: dataKeys[0], x: Math.round(cx + R), y: cy }];
  if (N === 2) return [
    { key: dataKeys[0], x: Math.round(cx - R), y: cy },
    { key: dataKeys[1], x: Math.round(cx + R), y: cy }
  ];
  return dataKeys.map((key, i) => {
    const frac = i / (N - 1);
    const angle = Math.PI + frac * Math.PI;
    return { key, x: Math.round(cx + R * Math.cos(angle)), y: Math.round(cy + R * 0.55 * Math.sin(angle)) };
  });
}

/** Comm-submodellen (chatter/activiteiten) gecentreerd onder de ouder. */
function commBelowPositions(px, py, commKeys, dy, spacing) {
  const N = commKeys.length;
  if (!N) return [];
  const totalW = (N - 1) * spacing;
  return commKeys.map((key, i) => ({
    key, x: Math.round(px - totalW / 2 + i * spacing), y: py + dy
  }));
}

/** Chips voor center-model: oog-knop + geen afkapping. */
function renderCenterInfoChips(sets) {
  if (!sets.length) return '<div class="text-xs text-base-content/30 italic py-1">Geen categorieën geconfigureerd</div>';
  return sets.map(set => {
    const active = !!wizardState.informationSets[set.id];
    const previewing = wizardState._previewSet === set.id;
    const fields = set.information_set_fields || [];
    if (IS_ADMIN && wizardState._editingSet === set.id) {
      return `<div class="p-1.5 bg-info/5 border border-info/20 rounded mb-1 text-xs">
        <input id="es-label-${set.id}" type="text" value="${set.label.replace(/"/g,'&quot;')}" class="input input-bordered input-xs w-full mb-1" />
        <input id="es-desc-${set.id}" type="text" value="${(set.description||'').replace(/"/g,'&quot;')}" class="input input-bordered input-xs w-full mb-1" placeholder="AI-beschrijving" />
        <div class="flex gap-1"><button class="btn btn-xs btn-info" onclick="submitEditSet('${set.id}')">OK</button><button class="btn btn-xs btn-ghost" onclick="wizardState._editingSet=null; renderWizard();">✕</button></div>
      </div>`;
    }
    return `<div class="mb-1">
      <div class="flex items-start gap-0.5">
        <button class="btn btn-xs flex-1 justify-start gap-1.5 min-h-0 h-auto py-1.5 text-left overflow-hidden ${active ? 'btn-primary' : 'btn-ghost border border-base-300 text-base-content/55 hover:text-base-content'}"
          onclick="wizardState.toggleSet('${set.id}', ${!active}); renderWizard();"
          title="${(set.description||'').replace(/"/g,'&quot;')}">
          <i data-lucide="${active ? 'check-circle' : 'circle'}" class="w-3.5 h-3.5 shrink-0 mt-px"></i>
          <span class="text-xs leading-snug" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1">${set.label}</span>
        </button>
        <button class="btn btn-xs btn-ghost min-h-0 h-auto py-1.5 px-1 shrink-0 ${previewing ? 'text-info' : 'opacity-25 hover:opacity-70'}"
          onclick="event.stopPropagation(); wizardState._previewSet = wizardState._previewSet==='${set.id}' ? null : '${set.id}'; renderWizard();"
          title="Bekijk velden"><i data-lucide="eye" class="w-3.5 h-3.5"></i></button>

      </div>
      ${previewing && fields.length ? `
        <div class="mx-0.5 mt-0.5 mb-1 bg-base-200/60 border border-base-300/60 rounded-lg px-2 py-1.5">
          <div class="text-xs text-base-content/40 font-semibold uppercase tracking-wide mb-1">Velden</div>
          <div class="flex flex-wrap gap-1">
            ${fields.map(f => `<span class="badge badge-sm badge-ghost font-mono text-xs">${f.label || f.field_key}</span>`).join('')}
          </div>
        </div>` : ''}
    </div>`;
  }).join('');
}

/** Chips voor sub-model: oog-knop + lead-special-case. */
function renderSubInfoChips(parentModel, submodelKey, sets, chipActiveClass = 'btn-secondary') {
  const isLeadSub = submodelKey === 'crm.lead' && parentModel === 'x_sales_action_sheet';
  return sets.map(set => {
    const previewKey = submodelKey + ':' + set.id;
    const previewing = wizardState._previewSet === previewKey;
    const fields = set.information_set_fields || [];
    let active, toggleCode;
    if (isLeadSub) {
      active = wizardState.leadEnrichment.property_groups.includes(set.id);
      toggleCode = `wizardState.toggleLeadPropertyGroup('${set.id}', ${!active}); renderWizard();`;
    } else {
      active = !!wizardState.submodelSets[set.id];
      toggleCode = `wizardState.submodelSets['${set.id}'] = ${!active}; renderWizard();`;
    }
    return `<div class="mb-0.5">
      <div class="flex items-start gap-0.5">
        <button class="btn btn-xs flex-1 flex-row items-center justify-start gap-1 min-h-0 h-7 py-0 text-left overflow-hidden ${active ? chipActiveClass : 'btn-ghost border border-base-200 text-base-content/45 hover:text-base-content/80'}"
          onclick="event.stopPropagation(); ${toggleCode}"
          title="${(set.description||'').replace(/"/g,'&quot;')}">
          <i data-lucide="${active ? 'check-circle' : 'circle'}" class="w-3 h-3 shrink-0 pointer-events-none"></i>
          <span class="text-xs truncate min-w-0">${set.label}</span>
        </button>
        <button class="btn btn-xs btn-ghost min-h-0 h-auto py-1 px-1 shrink-0 ${previewing ? 'text-info' : 'opacity-20 hover:opacity-60'}"
          onclick="event.stopPropagation(); wizardState._previewSet = wizardState._previewSet==='${previewKey}' ? null : '${previewKey}'; renderWizard();"
          title="Bekijk velden"><i data-lucide="eye" class="w-3 h-3"></i></button>
      </div>
      ${previewing && fields.length ? `
        <div class="mx-0.5 mt-0.5 mb-0.5 bg-base-200/50 rounded px-1.5 py-1 flex flex-wrap gap-0.5">
          ${fields.map(f => `<span class="badge badge-xs badge-ghost font-mono">${f.label || f.field_key}</span>`).join('')}
        </div>` : ''}
    </div>`;
  }).join('');
}

async function renderStep2() {
  const model = wizardState.selectedModel || 'x_sales_action_sheet';
  const modelCfg = MODEL_CONFIG[model] || {};

  // Reset spider wanneer een ander model geselecteerd wordt
  if (_spiderModel !== model) {
    _spiderPan = { x: 0, y: 0 };
    _spiderScale = 1;
    _nodePositions = {};
    _spiderModel = model;
    _spiderLastCx = null;
  }

  // Bereken L1-buren vanuit de centrale graph (excl. comm-modellen — die staan in de node-header)
  const l1Neighbors = getNeighbors(model);
  const dataL1 = l1Neighbors.filter(k => !COMM_MODELS.has(k));

  const shownModels = new Set([model, ...dataL1]);

  // Bepaal welke L1-nodes "direct enabled" zijn (niet omgeleid via een ander pad)
  const isEnabledDirect = k => {
    const path = wizardState.submodelPaths[k];
    if (path && path !== 'direct') return false; // expliciet omgeleid via een ander pad
    if (k === 'crm.lead' && model === 'x_sales_action_sheet') return wizardState.leadEnrichment.enabled;
    return !!wizardState.submodelSets[k + '_enabled'];
  };
  const enabledDirectL1 = dataL1.filter(isEnabledDirect);

  // L2 exclusie: alleen center + enabled-direct L1 nodes uitsluiten.
  // Uitgeschakelde of omgeleide L1-nodes mogen als L2 verschijnen bij enabled-direct L1-parents.
  const excludeFromL2 = new Set([model, ...enabledDirectL1]);

  // L2 data-nodes: alleen van enabled-direct L1-parents
  const l2DataMap = {}; // { l1key: [l2key, ...] }
  for (const l1k of enabledDirectL1) {
    const l2d = getNeighbors(l1k, [...excludeFromL2]).filter(k => !COMM_MODELS.has(k));
    if (l2d.length) {
      l2DataMap[l1k] = l2d;
      l2d.forEach(k => excludeFromL2.add(k));
      l2d.forEach(k => shownModels.add(k));
    }
  }

  // Welke L1-nodes zijn "geclaimd als L2" van een andere L1-node?
  // (= verschijnen in L2DataMap én zijn ook in dataL1)
  const claimedAsL2 = {}; // { modelKey: parentL1Key }
  for (const [l1k, l2list] of Object.entries(l2DataMap)) {
    for (const k of l2list) {
      if (dataL1.includes(k)) claimedAsL2[k] = l1k;
    }
  }

  // L3 data-nodes: data-buren van L2 data-nodes
  const l3DataMap = {}; // { l2key: [l3key, ...] }
  for (const [l1k, l2list] of Object.entries(l2DataMap)) {
    for (const l2k of l2list) {
      const l3d = getNeighbors(l2k, [...shownModels]).filter(k => !COMM_MODELS.has(k));
      if (l3d.length) {
        l3DataMap[l2k] = l3d;
        l3d.forEach(k => shownModels.add(k));
      }
    }
  }

  // Concurrent fetch voor alle modellen incl. L2 en L3 data-nodes
  const l2DataAll = [...new Set(Object.values(l2DataMap).flat())];
  const l3DataAll = [...new Set(Object.values(l3DataMap).flat())];
  const fetchKeys = [...new Set([model, ...dataL1, ...l2DataAll, ...l3DataAll])];
  const fetchResults = await Promise.all(fetchKeys.map(k => fetchInformationSets(k)));
  const allSets = {};
  fetchKeys.forEach((k, i) => { allSets[k] = fetchResults[i] || []; });
  window._currentSets = allSets[model];

  const centerSets = allSets[model];
  const hasSubmodels = dataL1.length > 0;
  const hasL2Data = Object.keys(l2DataMap).length > 0;
  const hasL3Data = Object.keys(l3DataMap).length > 0;

  // Layout
  const R_DATA    = 340;
  const R_L2_DATA = 290;
  const NODE_W    = 270;
  const SUB_W     = 255;
  const L2D_W     = 220;
  const W = hasSubmodels ? (hasL2Data || hasL3Data ? 3600 : 2800) : 560;
  const H = hasSubmodels ? 2000 : 370;
  const cx = Math.round(W / 2);
  const cy = hasSubmodels ? 295 : Math.round(H / 2);

  // Override positions als de user nodes heeft gesleept
  function nodePos(key, defaultX, defaultY) {
    return _nodePositions[key] || { x: defaultX, y: defaultY };
  }

  const dataPositions = dataLRPositions(cx, cy, dataL1, R_DATA).map(p => ({
    ...p, ...nodePos(p.key, p.x, p.y)
  }));

  // L2 data-node posities: verder in dezelfde richting als center→L1
  const dataL2Positions = {}; // { l1key: [{key, x, y}, ...] }
  for (const { key: l1k, x: l1x, y: l1y } of dataPositions) {
    if (!l2DataMap[l1k]?.length) continue;
    const l2keys = l2DataMap[l1k];
    const dx = l1x - cx, dy = l1y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const perp = { x: -uy, y: ux };
    const spread = (l2keys.length - 1) * 220;
    dataL2Positions[l1k] = l2keys.map((key, i) => {
      const offset = l2keys.length > 1 ? (i / (l2keys.length - 1) - 0.5) * spread : 0;
      const defX = Math.round(l1x + ux * R_L2_DATA + perp.x * offset);
      const defY = Math.round(l1y + uy * R_L2_DATA + perp.y * offset);
      return { key, ...nodePos(l1k + ':data:' + key, defX, defY) };
    });
  }

  // L3 data-node posities: verder in dezelfde richting als center→L1→L2
  const dataL3Positions = {}; // { l2key: [{key, x, y}, ...] }
  for (const { key: l1k, x: l1x, y: l1y } of dataPositions) {
    for (const { key: l2k, x: l2x, y: l2y } of (dataL2Positions[l1k] || [])) {
      if (!l3DataMap[l2k]?.length) continue;
      const l3keys = l3DataMap[l2k];
      const dx = l2x - l1x, dy = l2y - l1y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const perp = { x: -uy, y: ux };
      const spread = (l3keys.length - 1) * 220;
      dataL3Positions[l2k] = l3keys.map((key, i) => {
        const offset = l3keys.length > 1 ? (i / (l3keys.length - 1) - 0.5) * spread : 0;
        const defX = Math.round(l2x + ux * R_L2_DATA + perp.x * offset);
        const defY = Math.round(l2y + uy * R_L2_DATA + perp.y * offset);
        return { key, ...nodePos(l2k + ':data:' + key, defX, defY) };
      });
    }
  }

  // Center node position
  const centerPosActual = nodePos('__center__', cx, cy);

  // Base fields
  const dbModel = modelsConfigCache[model];
  const baseFieldsArr = dbModel?.base_fields;
  const baseLabels = (Array.isArray(baseFieldsArr) && baseFieldsArr.length)
    ? baseFieldsArr.map(bf => bf.label || bf.field)
    : [modelCfg.nameField || 'naam'];

  // ── SVG ──
  let svgLines = '';
  function addLine(sx, sy, dx, dy, srcKey, dstKey, on, colorOn, colorOff) {
    const col = on ? colorOn : colorOff;
    const lw  = on ? '2.5' : '1.5';
    const dash = on ? '' : 'stroke-dasharray="6 4"';
    svgLines += `<line x1="${sx}" y1="${sy}" x2="${dx}" y2="${dy}" stroke="${col}" stroke-width="${lw}" ${dash} stroke-linecap="round" data-s="${srcKey}" data-d="${dstKey}"/>`;
    const mx = Math.round((sx + dx) / 2);
    const my = Math.round((sy + dy) / 2);
    if (on) svgLines += `<circle cx="${mx}" cy="${my}" r="4" fill="${colorOn}" opacity="0.35" data-s="${srcKey}" data-d="${dstKey}"/>`;
    const meta = (RELATION_META[srcKey] || {})[dstKey]
               || (RELATION_META[dstKey] || {})[srcKey]
               || null;
    if (meta) {
      const labelOpacity = on ? '0.55' : '0.22';
      svgLines += `<text x="${mx}" y="${my - (on ? 12 : 10)}" text-anchor="middle" fill="${col}" font-size="9" font-family="monospace" opacity="${labelOpacity}" style="pointer-events:none;user-select:none;">${meta.short}</text>`;
    }
  }

  const cpX = centerPosActual.x, cpY = centerPosActual.y;
  for (const { key, x, y } of dataPositions) {
    const isLead = key === 'crm.lead' && model === 'x_sales_action_sheet';
    const on = isLead ? wizardState.leadEnrichment.enabled : !!wizardState.submodelSets[key + '_enabled'];
    addLine(cpX, cpY, x, y, '__center__', key, on, '#6366f1', '#d1d5db');
  }
  // L2 data-node lijnen (l1 → l2 data)
  for (const { key: l1k, x: l1x, y: l1y } of dataPositions) {
    for (const { key: l2k, x: l2x, y: l2y } of (dataL2Positions[l1k] || [])) {
      const isL1On = !!wizardState.submodelSets[l1k + '_enabled'];
      const on = isL1On && !!wizardState.submodelSets[l2k + '_enabled'];
      addLine(l1x, l1y, l2x, l2y, l1k, l1k + ':data:' + l2k, on, '#f59e0b', '#d1d5db');
    }
  }
  // L3 data-node lijnen (l2 → l3 data)
  for (const { key: l1k } of dataPositions) {
    for (const { key: l2k, x: l2x, y: l2y } of (dataL2Positions[l1k] || [])) {
      for (const { key: l3k, x: l3x, y: l3y } of (dataL3Positions[l2k] || [])) {
        const isL2On = !!wizardState.submodelSets[l2k + '_enabled'];
        const on = isL2On && !!wizardState.submodelSets[l3k + '_enabled'];
        addLine(l2x, l2y, l3x, l3y, l1k + ':data:' + l2k, l2k + ':data:' + l3k, on, '#0ea5e9', '#d1d5db');
      }
    }
  }

  const svgLayer = `<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:visible;" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg>`;

  // ── Node renderers ──
  // (SOLID_BG merged directly into node style attrs below)

  // ─────────────────────────────────────────────────────────────────────────
  // Één universele node-renderer voor alle niveaus (center / l1 / l2+).
  //
  // opts {
  //   level      : 'center' | 'l1' | 'l2'
  //   nodeKey    : DOM-id suffix (bijv. '__center__', 'crm.lead', 'l1k:data:l2k')
  //   modelKey   : echte Odoo-modelnaam (voor state-lookups en cache)
  //   parentKey  : alleen voor level='l2' — de L1-sleutel
  //   x, y, w    : positie + breedte in px
  //   zIndex     : z-index
  //   sets       : array van categorieën voor dit model
  //   on         : boolean — staat het model aan?
  //   toggleCode : inline JS voor de aan/uit-knop
  //   chipsFn    : functie() → HTML van categorieën
  //   alwaysFn   : functie() → HTML van "Altijd opgehaald" of null/''
  // }
  function renderSpiderNode(opts) {
    const {
      level, nodeKey, modelKey, parentKey,
      x, y, w, zIndex,
      sets, on, toggleCode, chipsFn, alwaysFn,
    } = opts;
    const cfg = MODEL_CONFIG[modelKey] || {};
    const enabledCount = sets.filter(s => !!wizardState.submodelSets[s.id]).length;
    const isCenter = level === 'center';

    // ── Kleurpalet per niveau ──
    let accent, accentSub, borderCol, headerBg, iconBg, headerTextCls, subTextCls;
    if (isCenter) {
      // Palet wordt volledig via Tailwind-klassen geregeld voor center
      accent = accentSub = borderCol = headerBg = iconBg = null; // n.v.t.
    } else if (level === 'l1') {
      accent    = on ? 'oklch(var(--s,55% 0.22 280))'       : 'oklch(var(--bc,20% 0 0)/0.45)';
      accentSub = on ? 'oklch(var(--s,55% 0.22 280)/0.6)'   : 'oklch(var(--bc,20% 0 0)/0.30)';
      borderCol = on ? 'oklch(var(--s,55% 0.22 280))'       : 'oklch(var(--b3,85% 0 0))';
      headerBg  = on ? 'oklch(var(--s,55% 0.22 280)/0.10)'  : 'oklch(var(--b2,96% 0 0))';
      iconBg    = on ? 'oklch(var(--s,55% 0.22 280)/0.20)'  : 'oklch(var(--b3,85% 0 0))';
    } else if (level === 'l2') {
      // amber
      accent    = on ? 'oklch(68% 0.18 85)'            : 'oklch(var(--bc,20% 0 0)/0.45)';
      accentSub = on ? 'oklch(68% 0.18 85/0.65)'       : 'oklch(var(--bc,20% 0 0)/0.30)';
      borderCol = on ? 'oklch(68% 0.18 85/0.65)'       : 'oklch(var(--b3,85% 0 0))';
      headerBg  = on ? 'oklch(82% 0.16 85/0.13)'       : 'oklch(var(--b2,96% 0 0))';
      iconBg    = on ? 'oklch(82% 0.16 85/0.20)'       : 'oklch(var(--b3,85% 0 0))';
    } else {
      // l3+: teal/info
      accent    = on ? 'oklch(65% 0.15 200)'            : 'oklch(var(--bc,20% 0 0)/0.45)';
      accentSub = on ? 'oklch(65% 0.15 200/0.65)'       : 'oklch(var(--bc,20% 0 0)/0.30)';
      borderCol = on ? 'oklch(65% 0.15 200/0.65)'       : 'oklch(var(--b3,85% 0 0))';
      headerBg  = on ? 'oklch(85% 0.10 200/0.13)'       : 'oklch(var(--b2,96% 0 0))';
      iconBg    = on ? 'oklch(85% 0.10 200/0.20)'       : 'oklch(var(--b3,85% 0 0))';
    }

    // ── Header ──
    const headerHtml = isCenter
      ? `<div class="sn-header bg-primary px-3 py-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none" data-node-key="${nodeKey}" data-drag-key="${nodeKey}">
          <div class="bg-white/20 rounded-xl p-1.5 shrink-0">
            <i data-lucide="${cfg.icon||'database'}" class="w-4 h-4 text-white"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-sm text-white leading-tight">${cfg.label || modelKey}</div>
            <div class="text-xs text-white/60 font-mono leading-tight">${modelKey}</div>
          </div>
          <div class="badge badge-xs bg-white/20 text-white border-0 shrink-0">${enabledCount}/${sets.length}</div>
        </div>`
      : `<div class="sn-header px-2.5 py-2.5 flex items-center gap-2 select-none cursor-grab active:cursor-grabbing" data-node-key="${nodeKey}" data-drag-key="${nodeKey}"
             style="background:${headerBg}">
          <div class="rounded-md p-1.5 shrink-0" style="background:${iconBg}">
            <i data-lucide="${cfg.icon||'database'}" class="w-4 h-4" style="color:${accent}"></i>
          </div>
          <div class="flex-1 min-w-0 overflow-hidden">
            <div class="font-semibold text-sm leading-tight truncate" style="color:${accent}">${cfg.label || modelKey}</div>
            <div class="text-xs leading-tight" style="color:${accentSub}">${on ? enabledCount+'/'+sets.length+' categorieën' : modelKey}</div>
          </div>
          <button class="btn btn-xs btn-ghost min-h-0 h-7 w-7 p-0 shrink-0 rounded-lg" onclick="${toggleCode}"
                  title="${on ? 'Uitschakelen' : 'Inschakelen'}">
            <i data-lucide="${on?'check-circle-2':'plus-circle'}" class="w-4 h-4 pointer-events-none" style="color:${accent}"></i>
          </button>
        </div>`;

    // ── Altijd opgehaald ──
    const alwaysRaw = alwaysFn ? alwaysFn() : '';
    const alwaysHtml = alwaysRaw ? (isCenter
      ? `<div class="px-3 pt-2 pb-2 border-b border-base-200">
          <div class="text-xs font-semibold text-base-content/35 uppercase tracking-wide mb-0.5">Altijd opgehaald</div>
          <div class="text-xs text-base-content/45 leading-snug">${alwaysRaw}</div>
        </div>`
      : `<div class="px-2.5 pt-1.5 pb-1.5" style="border-bottom:1px solid oklch(var(--b3,85% 0 0))">
          <div class="text-xs font-semibold uppercase tracking-wide mb-0.5" style="color:${accentSub}">Altijd opgehaald</div>
          <div class="text-xs" style="color:${accentSub}">${alwaysRaw}</div>
        </div>`)
      : '';

    // ── Toevoegen (comm pills) ──
    // Voor center: stateKey = null (submodelSets direct).
    // Voor data-nodes: stateKey = modelKey, en pills zijn disabled als model uit staat.
    const commStateKey = isCenter ? null : modelKey;
    const toevoegenHtml = isCenter
      ? `<div class="px-3 py-1 flex items-center gap-1 border-b border-base-200">
          <span class="text-xs text-base-content/40">Toevoegen</span>
          ${renderCommPills(commStateKey, true)}
        </div>`
      : `<div class="px-2.5 py-1 flex items-center gap-1" style="border-bottom:1px solid ${on?borderCol.replace(')','/ 0.3)').replace('/0.65','/ 0.3'):'oklch(var(--b3,85% 0 0))'};">
          <span class="text-xs" style="color:${accentSub}">Toevoegen</span>
          ${renderCommPills(commStateKey, on)}
        </div>`;

    // ── Categorieën ──
    const catsHtml = (on && sets.length) ? chipsFn() : '';

    // ── Outer wrapper stijl ──
    const wrapperStyle = isCenter
      ? `rounded-2xl border-2 border-primary overflow-hidden shadow-xl bg-base-100`
      : `rounded-xl border-2 overflow-hidden ${level==='l1'?'shadow-md':'shadow-sm'} bg-base-100`;
    const wrapperExtra = isCenter ? '' : `style="border-color:${borderCol}"`;

    return `<div id="sn-${toSafeId(nodeKey)}" style="position:absolute; left:${x}px; top:${y}px; transform:translate(-50%,-50%); z-index:${zIndex}; width:${w}px;">
      <div class="${wrapperStyle}" ${wrapperExtra}>
        ${headerHtml}
        ${alwaysHtml}
        ${toevoegenHtml}
        ${catsHtml}
      </div>
    </div>`;
  }

  // ── Comm pills helper (ongewijzigd) ──
  function renderCommPills(stateKey, modelActive) {
    const isCenter = stateKey === null;
    const commKeys = ['mail.message', 'mail.activity'];
    const icons    = { 'mail.message': 'message-square', 'mail.activity': 'check-square' };
    const labels   = { 'mail.message': 'Chatterberichten', 'mail.activity': 'Activiteiten' };
    const colOn    = { 'mail.message': '#8b5cf6', 'mail.activity': '#10b981' };
    return commKeys.map(ck => {
      const on = isCenter
        ? !!wizardState.submodelSets[ck + '_enabled']
        : !!(wizardState.subSubmodels[stateKey]?.[ck + '_enabled']);
      const active = modelActive !== false;
      const toggle = (active && !isCenter)
        ? `event.stopPropagation(); if(!wizardState.subSubmodels['${stateKey}'])wizardState.subSubmodels['${stateKey}']={};wizardState.subSubmodels['${stateKey}']['${ck}_enabled']=!wizardState.subSubmodels['${stateKey}']['${ck}_enabled']; renderWizard();`
        : `event.stopPropagation(); wizardState.submodelSets['${ck}_enabled']=!wizardState.submodelSets['${ck}_enabled']; renderWizard();`;
      const col = (on && active) ? colOn[ck] : 'oklch(var(--bc,20% 0 0)/0.15)';
      const disabledAttr = !active ? 'disabled' : '';
      const title = !active ? `${labels[ck]} (schakel het model eerst in)` : `${labels[ck]} ${on?'(aan)':'(uit)'}`;
      return `<button class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 rounded shrink-0" onclick="${toggle}" title="${title}" ${disabledAttr}>
        <i data-lucide="${icons[ck]}" class="w-3 h-3 pointer-events-none" style="color:${col}"></i>
      </button>`;
    }).join('');
  }

  // ── Center node ──
  const enabledCount = centerSets.filter(s => !!wizardState.informationSets[s.id]).length;
  const centerNodeHtml = renderSpiderNode({
    level: 'center', nodeKey: '__center__', modelKey: model,
    x: cpX, y: cpY, w: NODE_W, zIndex: 10,
    sets: centerSets, on: true,
    toggleCode: '',
    alwaysFn: () => baseLabels.join(' · '),
    chipsFn: () => `
      <div class="px-2.5 pt-2 pb-2.5">
        <div class="flex items-center justify-between mb-1.5">
          <div class="text-xs font-semibold text-base-content/35 uppercase tracking-wide">Categorieën</div>
          <div class="flex gap-0.5">
            <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5" onclick="event.stopPropagation(); wizardState.selectAllSets(window._currentSets||[]); renderWizard();" title="Alles">✓</button>
            <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5" onclick="event.stopPropagation(); wizardState.deselectAllSets(window._currentSets||[]); renderWizard();" title="Geen">✕</button>
          </div>
        </div>
        <div style="max-height:220px; overflow-y:auto;">
          ${renderCenterInfoChips(centerSets)}
        </div>
      </div>`,
  });

  // ── L1 data-nodes ──
  function buildL1Node(key, x, y) {
    const sets = allSets[key] || [];
    const isLead = key === 'crm.lead' && model === 'x_sales_action_sheet';
    const on = isLead ? wizardState.leadEnrichment.enabled : !!wizardState.submodelSets[key + '_enabled'];
    // Selecteer alle categorieën alleen bij eerste activatie (geen enkele geselecteerd).
    // Bij her-activatie worden bestaande categoriekeuzes bewaard.
    const hasSomeSelected = sets.some(s => !!wizardState.submodelSets[s.id]);
    const toggleOn  = isLead
      ? `wizardState.submodelPaths['crm.lead']='direct'; wizardState.toggleLeadEnrichment(true); renderWizard();`
      : `wizardState.submodelPaths['${key}']='direct'; wizardState.submodelSets['${key}_enabled']=true; ${hasSomeSelected ? 'renderWizard()' : `selectAllSubSets('${key}')`};`;
    const toggleOff = isLead
      ? `wizardState.submodelPaths['crm.lead']=null; wizardState.toggleLeadEnrichment(false); renderWizard();`
      : `wizardState.submodelPaths['${key}']=null; wizardState.submodelSets['${key}_enabled']=false; renderWizard();`;
    const dbModel = modelsConfigCache[key];
    const baseStr = Array.isArray(dbModel?.base_fields) && dbModel.base_fields.length
      ? dbModel.base_fields.map(bf => bf.label || bf.field).join(' · ')
      : (MODEL_CONFIG[key]?.nameField || '');
    return renderSpiderNode({
      level: 'l1', nodeKey: key, modelKey: key,
      x, y, w: SUB_W, zIndex: 5,
      sets, on,
      toggleCode: `event.stopPropagation(); ${on ? toggleOff : toggleOn}`,
      alwaysFn: () => baseStr,
      chipsFn: () => `
        <div class="px-2.5 pt-2 pb-2">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide" style="color:oklch(var(--bc,20% 0 0)/0.35)">Categorieën</span>
            <div class="flex gap-0.5">
              <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5 opacity-60 hover:opacity-100" onclick="event.stopPropagation(); selectAllSubSets('${key}');" title="Alles">✓</button>
              <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5 opacity-60 hover:opacity-100" onclick="event.stopPropagation(); deselectAllSubSets('${key}');" title="Geen">✕</button>
            </div>
          </div>
          <div style="max-height:200px; overflow-y:auto;">
            ${renderSubInfoChips(model, key, sets, 'btn-secondary')}
          </div>
        </div>`,
    });
  }

  // ── L2+ data-nodes ──
  // isReroutedL1=true: deze L2-node is ook een L1-neighbor (bv. partners als L2 van leads).
  // In dat geval gebruikt de toggle submodelPaths en enable-logica aangepast voor cross-paden.
  function buildL2Node(key, parentL1Key, x, y, isReroutedL1 = false) {
    const nodeKey = parentL1Key + ':data:' + key;
    const sets = allSets[key] || [];
    // on-state: voor een rerouted L1-node hangt dit af van submodelPaths
    const nodeIsLead = key === 'crm.lead';
    const on = nodeIsLead
      ? (wizardState.leadEnrichment.enabled && wizardState.submodelPaths['crm.lead'] === parentL1Key)
      : (!!wizardState.submodelSets[key + '_enabled'] && (!isReroutedL1 || wizardState.submodelPaths[key] === parentL1Key));

    let toggleCode;
    if (isReroutedL1) {
      // Pad-bewuste toggle voor rerouted L1-nodes
      const parentIsLead = parentL1Key === 'crm.lead';
      // Enable de parent als direct L1
      const enableParent = parentIsLead
        ? `wizardState.submodelPaths['crm.lead']='direct'; wizardState.toggleLeadEnrichment(true);`
        : `wizardState.submodelPaths['${parentL1Key}']='direct'; wizardState.submodelSets['${parentL1Key}_enabled']=true;`;
      const disableParent = ''; // parent uitschakelen bij disable van L2-node: bewust niet — onafhankelijk
      if (nodeIsLead) {
        // crm.lead als L2 van res.partner
        toggleCode = `event.stopPropagation();
          const _on = wizardState.leadEnrichment.enabled && wizardState.submodelPaths['crm.lead']==='${parentL1Key}';
          if(!_on) {
            wizardState.submodelPaths['crm.lead']='${parentL1Key}';
            wizardState.toggleLeadEnrichment(true);
            ${enableParent}
          } else {
            wizardState.submodelPaths['crm.lead']=null;
            wizardState.toggleLeadEnrichment(false);
          }
          renderWizard();`;
      } else {
        // Regulier model (bv. res.partner) als L2 van een L1-node
        toggleCode = `event.stopPropagation();
          const _on = !!wizardState.submodelSets['${key}_enabled'] && wizardState.submodelPaths['${key}']==='${parentL1Key}';
          if(!_on) {
            wizardState.submodelPaths['${key}']='${parentL1Key}';
            wizardState.submodelSets['${key}_enabled']=true;
            ${enableParent}
          } else {
            wizardState.submodelPaths['${key}']=null;
            wizardState.submodelSets['${key}_enabled']=false;
          }
          renderWizard();`;
      }
    } else {
      toggleCode = `event.stopPropagation();
        const nextOn = !wizardState.submodelSets['${key}_enabled'];
        wizardState.submodelSets['${key}_enabled'] = nextOn;
        if(nextOn) wizardState.submodelSets['${parentL1Key}_enabled'] = true;
        renderWizard();`;
    }
    const dbModel = modelsConfigCache[key];
    const baseStr = Array.isArray(dbModel?.base_fields) && dbModel.base_fields.length
      ? dbModel.base_fields.map(bf => bf.label || bf.field).join(' · ')
      : (MODEL_CONFIG[key]?.nameField || '');
    return renderSpiderNode({
      level: 'l2', nodeKey, modelKey: key, parentKey: parentL1Key,
      x, y, w: L2D_W, zIndex: 4,
      sets, on, toggleCode,
      alwaysFn: () => baseStr,
      chipsFn: () => `
        <div class="px-2.5 pt-2 pb-2">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide" style="color:oklch(var(--bc,20% 0 0)/0.35)">Categorieën</span>
            <div class="flex gap-0.5">
              <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5 opacity-60 hover:opacity-100" onclick="event.stopPropagation(); selectAllSubSets('${key}');" title="Alles">✓</button>
              <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5 opacity-60 hover:opacity-100" onclick="event.stopPropagation(); deselectAllSubSets('${key}');" title="Geen">✕</button>
            </div>
          </div>
          <div style="max-height:200px; overflow-y:auto;">
            ${renderSubInfoChips(model, key, sets, 'btn-warning')}
          </div>
        </div>`,
    });
  }

  // ── L1-node omgeleid via een L2-pad (ghost visual) ──
  // Toont dat het model via de parentL1Key bereikbaar is; geeft de optie om terug te schakelen naar direct.
  function buildL1NodeRerouted(key, parentL1Key, x, y) {
    const cfg = MODEL_CONFIG[key] || {};
    const parentCfg = MODEL_CONFIG[parentL1Key] || {};
    const modelLabel = cfg.label || key;
    const parentLabel = parentCfg.label || parentL1Key;
    // Terug naar direct koppelen: pad wissen + model direct inschakelen
    const nodeIsLead = key === 'crm.lead';
    const _reclaimHasSome = (allSets[key] || []).some(s => !!wizardState.submodelSets[s.id]);
    const reclaimCode = nodeIsLead
      ? `event.stopPropagation(); wizardState.submodelPaths['crm.lead']='direct'; wizardState.toggleLeadEnrichment(true); renderWizard();`
      : `event.stopPropagation(); wizardState.submodelPaths['${key}']='direct'; wizardState.submodelSets['${key}_enabled']=true; ${_reclaimHasSome ? 'renderWizard()' : `selectAllSubSets('${key}')`};`;
    // Uitschakelen van het omgeleide pad
    const disableCode = nodeIsLead
      ? `event.stopPropagation(); wizardState.submodelPaths['crm.lead']=null; wizardState.toggleLeadEnrichment(false); renderWizard();`
      : `event.stopPropagation(); wizardState.submodelPaths['${key}']=null; wizardState.submodelSets['${key}_enabled']=false; renderWizard();`;
    // Ghost-node HTML (geen chips, lichtgekleurd, informatief)
    const accent = 'oklch(68% 0.04 240)'; // grijsblauw
    return `<div id="sn-${toSafeId(key)}" style="position:absolute; left:${x}px; top:${y}px; transform:translate(-50%,-50%); z-index:5; width:${SUB_W}px; pointer-events:auto;">
      <div class="rounded-xl border-2 border-dashed" style="border-color:${accent}; background:oklch(97% 0.01 240); opacity:0.72;">
        <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" onclick="${disableCode}" title="Uitschakelen">
          <i data-lucide="git-branch" class="w-4 h-4 shrink-0" style="color:${accent}"></i>
          <span class="font-semibold text-sm truncate" style="color:${accent}">${modelLabel}</span>
        </div>
        <div class="px-3 pb-2.5 text-xs" style="color:${accent}">
          <div class="flex items-center gap-1 mb-1.5 opacity-75">
            <i data-lucide="corner-down-right" class="w-3 h-3 shrink-0"></i>
            <span>Verbonden via <strong>${parentLabel}</strong></span>
          </div>
          <button class="btn btn-xs btn-ghost w-full h-6 min-h-0 border border-current opacity-60 hover:opacity-100" onclick="${reclaimCode}" title="Zet dit model terug als directe koppeling (verwijdert het als submodel van ${parentLabel})">
            <i data-lucide="arrow-left" class="w-3 h-3"></i> Direct koppelen
          </button>
        </div>
      </div>
    </div>`;
  }

  // ── L3 data-nodes ──
  function buildL3Node(key, parentL2Key, parentL1Key, x, y) {
    const nodeKey = parentL2Key + ':data:' + key;
    const sets = allSets[key] || [];
    const on  = !!wizardState.submodelSets[key + '_enabled'];
    const toggleCode = `event.stopPropagation();
    const nextOn = !wizardState.submodelSets['${key}_enabled'];
    wizardState.submodelSets['${key}_enabled'] = nextOn;
    if(nextOn) {
      wizardState.submodelSets['${parentL2Key}_enabled'] = true;
      if('${parentL1Key}' === 'crm.lead') wizardState.toggleLeadEnrichment(true);
      else wizardState.submodelSets['${parentL1Key}_enabled'] = true;
    }
    renderWizard();`;
    const L3D_W = 200;
    const dbModel = modelsConfigCache[key];
    const baseStr = Array.isArray(dbModel?.base_fields) && dbModel.base_fields.length
      ? dbModel.base_fields.map(bf => bf.label || bf.field).join(' · ')
      : (MODEL_CONFIG[key]?.nameField || '');
    return renderSpiderNode({
      level: 'l3', nodeKey, modelKey: key, parentKey: parentL2Key,
      x, y, w: L3D_W, zIndex: 3,
      sets, on, toggleCode,
      alwaysFn: () => baseStr,
      chipsFn: () => `
        <div class="px-2.5 pt-2 pb-2">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide" style="color:oklch(var(--bc,20% 0 0)/0.35)">Categorieën</span>
            <div class="flex gap-0.5">
              <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5 opacity-60 hover:opacity-100" onclick="event.stopPropagation(); selectAllSubSets('${key}');" title="Alles">✓</button>
              <button class="btn btn-xs btn-ghost min-h-0 h-5 px-1.5 opacity-60 hover:opacity-100" onclick="event.stopPropagation(); deselectAllSubSets('${key}');" title="Geen">✕</button>
            </div>
          </div>
          <div style="max-height:200px; overflow-y:auto;">
            ${renderSubInfoChips(model, key, sets, 'btn-info')}
          </div>
        </div>`,
    });
  }

  let allNodesHtml = centerNodeHtml;
  // L1-nodes: omgeleide nodes krijgen een ghost-visual
  for (const { key, x, y } of dataPositions) {
    if (claimedAsL2[key]) {
      allNodesHtml += buildL1NodeRerouted(key, claimedAsL2[key], x, y);
    } else {
      allNodesHtml += buildL1Node(key, x, y);
    }
  }
  // L2-nodes: itereer over enabled-direct L1s (l2DataMap bevat alleen die)
  for (const l1k of Object.keys(l2DataMap)) {
    for (const { key, x, y } of (dataL2Positions[l1k] || [])) {
      const isReroutedL1 = !!claimedAsL2[key]; // deze L2 is ook een L1-neighbor
      allNodesHtml += buildL2Node(key, l1k, x, y, isReroutedL1);
    }
  }
  for (const l1k of dataL1) {
    for (const { key: l2k, x: l2x, y: l2y } of (dataL2Positions[l1k] || [])) {
      for (const { key: l3k, x: l3x, y: l3y } of (dataL3Positions[l2k] || []))
        allNodesHtml += buildL3Node(l3k, l2k, l1k, l3x, l3y);
    }
  }

  const vpH = hasSubmodels ? 700 : 370;
  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body pb-3">
        <h2 class="card-title text-2xl mb-1">Stap 2: Wat ophalen?</h2>
        <p class="text-base-content/60 mb-3 text-sm">
          Klik op een model om te koppelen. Scroll om in/uit te zoomen. <span class="opacity-50">Drag om te bewegen.</span>
        </p>
        <div id="spider-viewport" style="overflow:hidden; cursor:grab; height:${vpH}px; border-radius:12px; position:relative; border:1px solid oklch(var(--b3,90% 0 0)); background:oklch(var(--b2,97% 0 0));">
          <div id="spider-canvas" style="position:absolute; width:${W}px; height:${H}px; top:0; left:0; transform-origin:0 0;" data-w="${W}" data-h="${H}" data-cx="${cx}" data-cy="${cy}">
            ${svgLayer}
            ${allNodesHtml}
          </div>
        </div>
        <div class="flex justify-between items-center mt-1.5 px-0.5">
          <div class="text-xs text-base-content/30 flex items-center gap-1">
            <i data-lucide="move" class="w-3 h-3"></i>Header slepen = verplaatsen · ⊕/✓ knop = aan/uit · Scroll = zoom
          </div>
          <div class="flex gap-1">
            <button class="btn btn-xs btn-ghost gap-1 opacity-50 hover:opacity-90" onclick="recenterSpider()" title="Hercentreer de view (behoudt selecties)">
              <i data-lucide="maximize-2" class="w-3 h-3"></i>Hercentreer
            </button>
            <button class="btn btn-xs btn-ghost gap-1 opacity-35 hover:opacity-80 hover:text-error" onclick="if(confirm('Alle submodel-selecties wissen?')) resetSpider();" title="Wis alle submodel-selecties en hercentreer">
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>Wis alles
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function recenterSpider() {
  _spiderPan = { x: 0, y: 0 };
  _spiderScale = 1;
  _nodePositions = {};
  renderWizard();
  requestAnimationFrame(() => {
    const cv2 = document.getElementById('spider-canvas');
    const vp2 = document.getElementById('spider-viewport');
    if (cv2 && vp2) {
      const vpW = vp2.offsetWidth || 700;
      const cvCx = parseInt(cv2.dataset.cx) || 600;
      _spiderPan.x = Math.round(vpW / 2 - cvCx);
      _spiderPan.y = 24;
      cv2.style.transform = `translate(${_spiderPan.x}px,${_spiderPan.y}px) scale(1)`;
    }
  });
}

function resetSpider() {
  wizardState.submodelSets = {};
  wizardState.submodelPaths = {};
  wizardState.subSubmodels = {};
  if (wizardState.leadEnrichment) {
    wizardState.leadEnrichment.enabled = false;
    wizardState.leadEnrichment.property_groups = [];
  }
  recenterSpider();
}

function initSpiderPan() {
  if (_spiderPanCleanup) { _spiderPanCleanup(); _spiderPanCleanup = null; }
  const vp = document.getElementById('spider-viewport');
  const cv = document.getElementById('spider-canvas');
  if (!vp || !cv) return;

  cv.style.transformOrigin = '0 0';

  const vpW  = vp.offsetWidth || 700;
  const cvCx = parseInt(cv.dataset.cx) || 600;

  if (_spiderPan.x === 0 && _spiderPan.y === 0 && _spiderScale === 1) {
    // Initieel centreren bij het eerste laden
    _spiderPan.x = Math.round(vpW / 2 - cvCx);
    _spiderPan.y = 24;
  } else if (_spiderLastCx !== null && _spiderLastCx !== cvCx) {
    // Canvas cx verschoof (bijv. 2800→3600 na eerste L1 met L2-buren).
    // Compenseer zodat de visuele positie van de inhoud hetzelfde blijft.
    _spiderPan.x -= Math.round((cvCx - _spiderLastCx) * _spiderScale);
  }
  _spiderLastCx = cvCx;

  cv.style.transform = `translate(${_spiderPan.x}px,${_spiderPan.y}px) scale(${_spiderScale})`;

  let mode = null; // 'pan' | 'node'
  let dragKey = null;
  let sx = 0, sy = 0;
  let _edgePanRaf = null;
  let _lastMouseX = 0, _lastMouseY = 0;

  function canvasCoords(clientX, clientY) {
    const r = vp.getBoundingClientRect();
    return { x: (clientX - r.left - _spiderPan.x) / _spiderScale,
             y: (clientY - r.top  - _spiderPan.y) / _spiderScale };
  }

  function applyNodePos(key, nx, ny) {
    _nodePositions[key] = { x: nx, y: ny };
    const el = document.getElementById('sn-' + toSafeId(key));
    if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
    // Vergroot canvas dynamisch
    const PAD = 300;
    let cw = parseInt(cv.dataset.w) || 1420;
    let ch = parseInt(cv.dataset.h) || 800;
    const needW = nx + PAD;
    const needH = ny + PAD;
    if (needW > cw || needH > ch) {
      cw = Math.max(cw, needW);
      ch = Math.max(ch, needH);
      cv.dataset.w = cw; cv.dataset.h = ch;
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    }
    updateSpiderLines();
  }

  function startEdgePan() {
    if (_edgePanRaf) return;
    const EDGE = 80;  // px vanaf rand
    const MAX_SPEED = 18;
    function tick() {
      if (mode !== 'node') { _edgePanRaf = null; return; }
      const r = vp.getBoundingClientRect();
      let dx = 0, dy = 0;
      const lx = _lastMouseX, ly = _lastMouseY;
      if (lx < r.left + EDGE)        dx =  MAX_SPEED * (1 - (lx - r.left)  / EDGE);
      else if (lx > r.right - EDGE)  dx = -MAX_SPEED * (1 - (r.right - lx) / EDGE);
      if (ly < r.top + EDGE)         dy =  MAX_SPEED * (1 - (ly - r.top)   / EDGE);
      else if (ly > r.bottom - EDGE) dy = -MAX_SPEED * (1 - (r.bottom - ly) / EDGE);
      if (dx || dy) {
        _spiderPan.x += dx;
        _spiderPan.y += dy;
        cv.style.transform = `translate(${_spiderPan.x}px,${_spiderPan.y}px) scale(${_spiderScale})`;
        // Herbereken node positie na pan
        const cc = canvasCoords(lx, ly);
        applyNodePos(dragKey, Math.round(cc.x + sx), Math.round(cc.y + sy));
      }
      _edgePanRaf = requestAnimationFrame(tick);
    }
    _edgePanRaf = requestAnimationFrame(tick);
  }

  function stopEdgePan() {
    if (_edgePanRaf) { cancelAnimationFrame(_edgePanRaf); _edgePanRaf = null; }
  }

  function onDown(e) {
    // Buttons/inputs inside a header are interactive — don't drag
    if (e.target.closest('button') || e.target.closest('input')) return;
    const header = e.target.closest('[data-drag-key]');
    if (header) {
      mode = 'node';
      dragKey = header.dataset.dragKey;
      const pos = getCurrentNodePos(dragKey);
      const cc  = canvasCoords(e.clientX, e.clientY);
      sx = (pos?.x ?? 0) - cc.x;
      sy = (pos?.y ?? 0) - cc.y;
      _lastMouseX = e.clientX;
      _lastMouseY = e.clientY;
      e.preventDefault();
    } else {
      mode = 'pan';
      sx = e.clientX - _spiderPan.x;
      sy = e.clientY - _spiderPan.y;
      vp.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  function onMove(e) {
    if (!mode) return;
    _lastMouseX = e.clientX;
    _lastMouseY = e.clientY;
    if (mode === 'pan') {
      _spiderPan.x = e.clientX - sx;
      _spiderPan.y = e.clientY - sy;
      cv.style.transform = `translate(${_spiderPan.x}px,${_spiderPan.y}px) scale(${_spiderScale})`;
    } else if (mode === 'node') {
      const cc = canvasCoords(e.clientX, e.clientY);
      applyNodePos(dragKey, Math.round(cc.x + sx), Math.round(cc.y + sy));
      startEdgePan();
    }
  }

  function onUp(e) {
    if (mode === 'pan') vp.style.cursor = 'grab';
    mode = null;
    dragKey = null;
    stopEdgePan();
  }

  function onWheel(e) {
    // Als de cursor boven een scrollbare container in een node staat → scroll de node, niet zoom
    let el = e.target;
    while (el && el !== vp) {
      const oy = window.getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return;
      el = el.parentElement;
    }
    e.preventDefault();
    const zf = e.deltaY < 0 ? 1.12 : 0.893;
    const ns = Math.max(0.2, Math.min(3, _spiderScale * zf));
    const r  = vp.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    _spiderPan.x = Math.round(mx - (mx - _spiderPan.x) * (ns / _spiderScale));
    _spiderPan.y = Math.round(my - (my - _spiderPan.y) * (ns / _spiderScale));
    _spiderScale = ns;
    cv.style.transform = `translate(${_spiderPan.x}px,${_spiderPan.y}px) scale(${_spiderScale})`;
  }

  // Touch pan
  let tSx = 0, tSy = 0;
  function onTouchStart(e) { if (!e.target.closest('button')) { tSx = e.touches[0].clientX - _spiderPan.x; tSy = e.touches[0].clientY - _spiderPan.y; } }
  function onTouchMove(e)  { _spiderPan.x = e.touches[0].clientX - tSx; _spiderPan.y = e.touches[0].clientY - tSy; cv.style.transform = `translate(${_spiderPan.x}px,${_spiderPan.y}px) scale(${_spiderScale})`; e.preventDefault(); }

  vp.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  vp.addEventListener('wheel', onWheel, { passive: false });
  vp.addEventListener('touchstart', onTouchStart, { passive: true });
  vp.addEventListener('touchmove', onTouchMove, { passive: false });

  _spiderPanCleanup = () => {
    stopEdgePan();
    vp.removeEventListener('mousedown', onDown);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    vp.removeEventListener('wheel', onWheel);
    vp.removeEventListener('touchstart', onTouchStart);
    vp.removeEventListener('touchmove', onTouchMove);
  };
}

function toggleSetExpand(setId) {
  wizardState._expandedSet = wizardState._expandedSet === setId ? null : setId;
  renderWizard();
}

function selectAllSubSets(submodelKey) {
  const parentModel = wizardState.selectedModel;
  if (submodelKey === 'crm.lead' && parentModel === 'x_sales_action_sheet') {
    selectAllLeadSets(); return;
  }
  (informationSetsCache[submodelKey] || []).forEach(s => {
    wizardState.submodelSets[s.id] = true;
  });
  renderWizard();
}

function deselectAllSubSets(submodelKey) {
  const parentModel = wizardState.selectedModel;
  if (submodelKey === 'crm.lead' && parentModel === 'x_sales_action_sheet') {
    deselectAllLeadSets(); return;
  }
  (informationSetsCache[submodelKey] || []).forEach(s => {
    wizardState.submodelSets[s.id] = false;
  });
  renderWizard();
}

function selectAllLeadSets() {
  (informationSetsCache['crm.lead'] || []).forEach(s => {
    wizardState.toggleLeadPropertyGroup(s.id, true);
  });
  renderWizard();
}

function deselectAllLeadSets() {
  wizardState.leadEnrichment.property_groups = [];
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
function renderL2Submodels(parentKey, excludeKeys = []) {
  const l2Keys = (MODEL_CONFIG[parentKey]?.submodels || []).filter(k => !excludeKeys.includes(k));
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
// ============================================================================
// ADMIN BEHEERMODAL — categorieën + properties
// ============================================================================

/**
 * Render de admin beheermodal als overlay op de pagina.
 * Toont alle info sets voor het geselecteerde model + velden per set.
 */
async function renderAdminModal() {
  const model = wizardState.selectedModel || 'x_sales_action_sheet';
  // Force-refresh cache
  delete informationSetsCache[model];
  const sets = await fetchInformationSets(model);

  const rows = sets.map(set => {
    const fields = set.information_set_fields || [];
    const fieldRows = fields.map(f => `
      <tr id="afield-row-${f.id}">
        <td class="py-1 px-2 font-mono text-xs text-base-content/60">${f.field_key}</td>
        <td class="py-1 px-2">
          <input type="text" value="${(f.label||'').replace(/"/g,'&quot;')}" placeholder="${f.field_key}"
            class="input input-xs input-bordered w-full" id="afl-${f.id}" />
        </td>
        <td class="py-1 px-2">
          <input type="text" value="${(f.description||'').replace(/"/g,'&quot;')}" placeholder="Omschrijving"
            class="input input-xs input-bordered w-full" id="afd-${f.id}" />
        </td>
        <td class="py-1 px-1 text-right whitespace-nowrap">
          <button class="btn btn-xs btn-ghost text-success px-1" onclick="adminSaveField('${f.id}')" title="Opslaan">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
          <button class="btn btn-xs btn-ghost text-error px-1" onclick="adminDeleteField('${f.id}', '${set.id}')" title="Verwijderen">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </td>
      </tr>`).join('');

    const addRow = `
      <tr id="afield-add-${set.id}">
        <td class="py-1.5 px-2"><input type="text" placeholder="field_key *" class="input input-xs input-bordered w-full font-mono" id="anf-key-${set.id}" /></td>
        <td class="py-1.5 px-2"><input type="text" placeholder="Label" class="input input-xs input-bordered w-full" id="anf-lbl-${set.id}" /></td>
        <td class="py-1.5 px-2"><input type="text" placeholder="Omschrijving" class="input input-xs input-bordered w-full" id="anf-dsc-${set.id}" /></td>
        <td class="py-1.5 px-1 text-right">
          <button class="btn btn-xs btn-success px-2" onclick="adminAddField('${set.id}', '${model}')">+ Toevoegen</button>
        </td>
      </tr>`;

    return `
      <div class="collapse collapse-arrow border border-base-300 rounded-lg mb-2" id="acollapse-${set.id}">
        <input type="checkbox" class="peer" />
        <div class="collapse-title py-2.5 px-3 flex items-center gap-2 min-h-0">
          <span class="font-semibold text-sm flex-1">${set.label}</span>
          <span class="badge badge-sm badge-ghost">${fields.length} velden</span>
          <div class="flex gap-1 z-10" onclick="event.stopPropagation()">
            <button class="btn btn-xs btn-ghost opacity-50 hover:opacity-100" onclick="adminEditSet('${set.id}')" title="Naam/omschrijving bewerken">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
          <span class="text-xs text-base-content/30 font-mono ml-1">${set.id}</span>
        </div>
        <div class="collapse-content px-0 pt-0">
          <div id="aset-edit-${set.id}" class="hidden px-3 pb-2 pt-1 bg-info/5 border-b border-base-200">
            <div class="flex gap-2 items-end">
              <div class="flex-1"><label class="label label-text text-xs">Label</label>
                <input type="text" id="ase-lbl-${set.id}" value="${set.label.replace(/"/g,'&quot;')}" class="input input-bordered input-xs w-full" /></div>
              <div class="flex-1"><label class="label label-text text-xs">Omschrijving</label>
                <input type="text" id="ase-dsc-${set.id}" value="${(set.description||'').replace(/"/g,'&quot;')}" class="input input-bordered input-xs w-full" /></div>
              <button class="btn btn-xs btn-info mb-0.5" onclick="adminSaveSet('${set.id}')">Opslaan</button>
              <button class="btn btn-xs btn-ghost mb-0.5" onclick="document.getElementById('aset-edit-${set.id}').classList.add('hidden')">✕</button>
            </div>
          </div>
          ${fields.length ? `
          <div class="overflow-x-auto">
            <table class="table table-xs w-full">
              <thead><tr class="text-base-content/40">
                <th class="py-1 px-2 w-36">Veldsleutel</th>
                <th class="py-1 px-2 w-36">Label</th>
                <th class="py-1 px-2">Omschrijving</th>
                <th class="py-1 px-1 w-16"></th>
              </tr></thead>
              <tbody>${fieldRows}</tbody>
            </table>
          </div>` : '<div class="px-3 py-2 text-xs text-base-content/30 italic">Nog geen velden</div>'}
          <div class="border-t border-base-200 mt-1">
            <table class="table table-xs w-full">
              <thead><tr class="text-base-content/40 bg-success/5">
                <th class="py-1 px-2 w-36">Veldsleutel *</th>
                <th class="py-1 px-2 w-36">Label</th>
                <th class="py-1 px-2">Omschrijving</th>
                <th class="py-1 px-1 w-16"></th>
              </tr></thead>
              <tbody>${addRow}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }).join('');

  const newSetForm = `
    <div class="border border-dashed border-primary/40 rounded-lg p-3 mt-3 bg-primary/3">
      <div class="text-xs font-semibold text-primary mb-2 uppercase tracking-wide">Nieuwe categorie</div>
      <div class="flex gap-2">
        <div><label class="label label-text text-xs">ID (uniek) *</label>
          <input type="text" id="ams-id" placeholder="bijv. nieuwe_cat" class="input input-xs input-bordered font-mono w-36" /></div>
        <div class="flex-1"><label class="label label-text text-xs">Label *</label>
          <input type="text" id="ams-lbl" placeholder="Zichtbare naam" class="input input-xs input-bordered w-full" /></div>
        <div class="flex-1"><label class="label label-text text-xs">Omschrijving</label>
          <input type="text" id="ams-dsc" placeholder="AI-context" class="input input-xs input-bordered w-full" /></div>
        <div class="flex items-end"><button class="btn btn-xs btn-primary mb-0.5" onclick="adminAddSet('${model}')">+ Aanmaken</button></div>
      </div>
    </div>`;

  const html = `
    <div id="admin-modal-overlay" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onclick="if(event.target===this)closeAdminModal()">
      <div class="bg-base-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div class="flex items-center gap-3 px-5 py-4 border-b border-base-200 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          <div class="flex-1">
            <div class="font-bold text-base">Categorieën & properties beheren</div>
            <div class="text-xs text-base-content/45 font-mono">${model}</div>
          </div>
          <button class="btn btn-sm btn-ghost btn-circle" onclick="closeAdminModal()">✕</button>
        </div>
        <div class="overflow-y-auto flex-1 p-4">
          ${rows || '<div class="text-sm text-base-content/40 italic">Geen categorieën gevonden voor dit model.</div>'}
          ${newSetForm}
        </div>
      </div>
    </div>`;

  // Verwijder eventuele eerdere modal
  document.getElementById('admin-modal-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) lucide.createIcons({ nodes: [document.getElementById('admin-modal-overlay')] });
}

function closeAdminModal() {
  document.getElementById('admin-modal-overlay')?.remove();
}

function adminEditSet(setId) {
  const el = document.getElementById(`aset-edit-${setId}`);
  if (el) el.classList.toggle('hidden');
}

async function adminSaveSet(setId) {
  const label = document.getElementById(`ase-lbl-${setId}`)?.value?.trim();
  const desc  = document.getElementById(`ase-dsc-${setId}`)?.value?.trim();
  if (!label) { alert('Label is verplicht'); return; }
  try {
    await updateSet(setId, { label, description: desc || null });
    await renderAdminModal();
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function adminSaveField(fieldId) {
  const label = document.getElementById(`afl-${fieldId}`)?.value?.trim();
  const desc  = document.getElementById(`afd-${fieldId}`)?.value?.trim();
  try {
    await updateField(fieldId, { label: label || null, description: desc || null });
    // Inline feedback
    const btn = document.querySelector(`#afield-row-${fieldId} button.text-success`);
    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'; }, 1200); }
    informationSetsCache = {};
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function adminDeleteField(fieldId, setId) {
  if (!confirm('Veld verwijderen?')) return;
  try {
    await deleteField(fieldId);
    document.getElementById(`afield-row-${fieldId}`)?.remove();
    informationSetsCache = {};
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function adminAddField(setId, model) {
  const key   = document.getElementById(`anf-key-${setId}`)?.value?.trim();
  const label = document.getElementById(`anf-lbl-${setId}`)?.value?.trim();
  const desc  = document.getElementById(`anf-dsc-${setId}`)?.value?.trim();
  if (!key) { alert('Field key is verplicht'); return; }
  try {
    await saveNewField({ set_id: setId, field_key: key, label: label || null, description: desc || null });
    await renderAdminModal();
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

async function adminAddSet(model) {
  const id    = document.getElementById('ams-id')?.value?.trim();
  const label = document.getElementById('ams-lbl')?.value?.trim();
  const desc  = document.getElementById('ams-dsc')?.value?.trim();
  if (!id || !label) { alert('ID en label zijn verplicht'); return; }
  try {
    await saveNewSet({ id, label, description: desc || null, model, sort_order: 99 });
    await renderAdminModal();
    renderWizard();
  } catch (e) { alert('Fout: ' + e.message); }
}

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
              { k: 'from',  l: 'Vanaf datum',  icon: 'calendar-days' },
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
  initSpiderPan();
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
    // Web activity hangt aan de lead, niet aan het hoofdrecord
    const enriched = rows.map(row => {
      const leads = row.__leads || [];
      if (!leads.length) return row;
      const enrichedLeads = leads.map(lead => {
        const wa = waMap.get(lead.id);
        if (!wa) return lead;
        return {
          ...lead,
          x_has_web_activity: wa.x_has_web_activity || false,
          x_studio_brand_origin: wa.x_studio_brand_origin || lead.x_studio_brand_origin || null,
          x_studio_merged_kpi_html: wa.x_studio_merged_kpi_html || null,
          x_studio_merged_timeline_html: wa.x_studio_merged_timeline_html || null
        };
      });
      return { ...row, __leads: enrichedLeads };
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
    if (!Array.isArray(row.__leads)) return row;
    const sanitizedLeads = row.__leads.map(lead => {
      if (!lead.x_studio_merged_kpi_html && !lead.x_studio_merged_timeline_html) return lead;
      const out = { ...lead };
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
    return { ...row, __leads: sanitizedLeads };
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
        includes_web_activity: !!wizardState.submodelSets['x_web_visitor_enabled'] || !!wizardState.submodelSets['x_ad_touchpoint_enabled']
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
  const hintHtml = error.hint
    ? '<div class="alert alert-warning mt-3"><span>💡 ' + error.hint + '</span></div>'
    : '';
  box.innerHTML = '<div class="flex items-center gap-2 mb-4">'
    + '<h3 class="font-bold text-lg">Fout</h3>'
    + '<button class="btn btn-ghost btn-sm btn-circle ml-auto" onclick="closeResultsModal()">✕</button>'
    + '</div>'
    + '<div class="alert alert-error"><span>❌ ' + error.message + '</span></div>'
    + hintHtml
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
    + '<button class="btn btn-primary w-full gap-2 mb-2" onclick="exportSemanticQuery(\'md\')">'
    + '<i data-lucide="bot" class="w-4 h-4"></i>MD downloaden — voor AI <span class="badge badge-xs badge-primary-content ml-1">met instructie</span>'
    + '</button>'
    + '<div class="flex gap-2 mb-1">'
    + '<button class="btn btn-outline btn-sm flex-1 gap-1" onclick="exportSemanticQuery(\'json\')">'
    + '<i data-lucide="braces" class="w-3 h-3"></i>JSON'
    + '</button>'
    + '<button class="btn btn-outline btn-sm flex-1 gap-1" onclick="exportSemanticQuery(\'xlsx\')">'
    + '<i data-lucide="table-2" class="w-3 h-3"></i>XLSX'
    + '</button>'
    + '</div>'
    + '<p class="text-xs text-base-content/40 mb-3">JSON en XLSX zijn ruwe data — geen AI-instructie</p>'
    + (IS_ADMIN
      ? '<button class="btn btn-warning btn-sm w-full gap-2 mb-4" onclick="exportVerifyData()">'
        + '<i data-lucide="shield-check" class="w-4 h-4"></i>Verifieer data — laatste 25 records + AI-schema'
        + '</button>'
      : '<div class="mb-4"></div>')

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

async function exportVerifyData() {
  if (!IS_ADMIN) return;
  const btn = document.querySelector('[onclick="exportVerifyData()"]');
  const origText = btn ? btn.innerHTML : '';
  try {
    const payload = wizardState.buildPayload();
    const tf = wizardState.resolvedTimeFilter();
    const tfField = tf?.field || 'create_date';

    const originalTimeFilters = (payload.filters || []).filter(function(f) { return f.field === tfField; });
    payload.filters = (payload.filters || []).filter(function(f) { return f.field !== tfField; });
    payload._verify_mode = true;

    if (btn) btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Ophalen...';

    const response = await fetch('/insights/api/sales-insights/semantic/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Fetch failed: ' + response.status);
    const result = await response.json();
    if (!result.success) throw new Error(result.error?.message || 'Query mislukt');

    const processedData = result.data || { records: [] };
    const records = processedData.records || [];
    const model = payload.base_model || 'data';
    const modelCfg = MODEL_CONFIG[model] || {};

    // Hoofd-velden (geen __ prefix)
    const allRecordKeys = records.length ? Object.keys(records[0]).filter(function(k) { return !k.startsWith('__'); }) : [];
    // L2 submodel-sleutels (__ prefix op hoofdrecord) — bijv. __leads, __messages
    const subModelKeys = records.length ? Object.keys(records[0]).filter(function(k) { return k.startsWith('__'); }) : [];

    // L3 detectie: scan __ sleutels binnen L2-arrays
    const l3Detected = {}; // { l2key: [l3key, ...] }
    subModelKeys.forEach(function(l2key) {
      records.forEach(function(r) {
        var items = Array.isArray(r[l2key]) ? r[l2key] : (r[l2key] ? [r[l2key]] : []);
        items.forEach(function(item) {
          if (item && typeof item === 'object') {
            Object.keys(item).filter(function(k) { return k.startsWith('__'); }).forEach(function(k) {
              if (!l3Detected[l2key]) l3Detected[l2key] = [];
              if (!l3Detected[l2key].includes(k)) l3Detected[l2key].push(k);
            });
          }
        });
      });
    });

    // Fill-stats voor hoofd-velden
    const fieldFillStats = allRecordKeys.map(function(field) {
      const total = records.length;
      const empty = records.filter(function(r) {
        const v = r[field];
        return v === false || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === '';
      }).length;
      return { field: field, total: total, empty: empty, fill_pct: total ? Math.round((total - empty) / total * 100) + '%' : '0%' };
    });

    // Fill-stats voor L2 submodels + L3
    subModelKeys.forEach(function(l2key) {
      const total = records.length;
      const emptyL2 = records.filter(function(r) {
        const v = r[l2key];
        return !v || (Array.isArray(v) && v.length === 0);
      }).length;
      fieldFillStats.push({
        field: l2key,
        total: total,
        empty: emptyL2,
        fill_pct: total ? Math.round((total - emptyL2) / total * 100) + '%' : '0%',
        note: 'L2 submodel — % records met minstens 1 gekoppeld object'
      });
      // Per-veld fill-stats voor velden binnen L2-items (bijv. web_activiteit_kpi op leads)
      // Gebaseerd op totaal aantal L2-items (niet hoofdrecords)
      var allL2Items = [];
      records.forEach(function(r) {
        var items = Array.isArray(r[l2key]) ? r[l2key] : (r[l2key] ? [r[l2key]] : []);
        allL2Items = allL2Items.concat(items);
      });
      if (allL2Items.length) {
        var l2FieldNames = [];
        allL2Items.forEach(function(item) {
          if (item && typeof item === 'object') {
            Object.keys(item).filter(function(k) { return !k.startsWith('__'); }).forEach(function(k) {
              if (!l2FieldNames.includes(k)) l2FieldNames.push(k);
            });
          }
        });
        l2FieldNames.forEach(function(f) {
          var emptyF = allL2Items.filter(function(item) {
            var v = item ? item[f] : undefined;
            return v === false || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === '';
          }).length;
          fieldFillStats.push({
            field: l2key + '.' + f,
            total: allL2Items.length,
            empty: emptyF,
            fill_pct: Math.round((allL2Items.length - emptyF) / allL2Items.length * 100) + '%',
            note: 'veld op ' + l2key + '-items'
          });
        });
      }
      // L3 fill-stats
      (l3Detected[l2key] || []).forEach(function(l3key) {
        const emptyL3 = records.filter(function(r) {
          const l2items = Array.isArray(r[l2key]) ? r[l2key] : (r[l2key] ? [r[l2key]] : []);
          return !l2items.some(function(item) {
            const v = item ? item[l3key] : undefined;
            return v !== null && v !== false && v !== undefined && !(Array.isArray(v) && v.length === 0);
          });
        }).length;
        fieldFillStats.push({
          field: l2key + '.' + l3key,
          total: total,
          empty: emptyL3,
          fill_pct: total ? Math.round((total - emptyL3) / total * 100) + '%' : '0%',
          note: 'L3 submodel — % records met minstens 1 gekoppeld object via ' + l2key
        });
      });
    });

    // Geselecteerde veldcategorieën (hoofdmodel)
    const selectedSets = (informationSetsCache[model] || [])
      .filter(function(s) { return wizardState.informationSets[s.id]; })
      .map(function(s) { return { id: s.id, label: s.label, description: s.description }; });

    // Gevraagde modellen: hoofdmodel + L2 + L3
    const subModelMeta = {
      '__leads':       { model: 'crm.lead',             label: 'Leads' },
      '__messages':    { model: 'mail.message',          label: 'Chatberichten' },
      '__activities':  { model: 'mail.activity',         label: 'Activiteiten' },
      '__partners':    { model: 'res.partner',           label: 'Partners (direct)' },
      '__partner':     { model: 'res.partner',           label: 'Partner' },
      '__visitors':    { model: 'x_web_visitor',         label: 'Web Visitors' },
      '__touchpoints': { model: 'x_ad_touchpoint',       label: 'Ad Touchpoints' },
      '__actionsheets':{ model: 'x_sales_action_sheet',  label: 'Actiebladen' }
    };
    const requestedModels = [{ model: model, label: modelCfg.label || model, fields: allRecordKeys }];
    subModelKeys.forEach(function(l2key) {
      const meta = subModelMeta[l2key] || { model: l2key, label: l2key };
      const subFields = [];
      records.forEach(function(r) {
        var items = Array.isArray(r[l2key]) ? r[l2key] : (r[l2key] ? [r[l2key]] : []);
        items.forEach(function(item) {
          if (item && typeof item === 'object') {
            Object.keys(item).filter(function(f) { return !f.startsWith('__'); }).forEach(function(f) {
              if (!subFields.includes(f)) subFields.push(f);
            });
          }
        });
      });
      requestedModels.push({ model: meta.model, label: meta.label, source_key: l2key, fields: subFields });
      // L3 modellen
      (l3Detected[l2key] || []).forEach(function(l3key) {
        const l3meta = subModelMeta[l3key] || { model: l3key, label: l3key };
        const l3Fields = [];
        records.forEach(function(r) {
          var l2items = Array.isArray(r[l2key]) ? r[l2key] : (r[l2key] ? [r[l2key]] : []);
          l2items.forEach(function(item) {
            if (!item) return;
            const l3val = item[l3key];
            var l3items = Array.isArray(l3val) ? l3val : (l3val && typeof l3val === 'object' ? [l3val] : []);
            l3items.forEach(function(l3item) {
              if (l3item && typeof l3item === 'object') {
                Object.keys(l3item).forEach(function(f) { if (!l3Fields.includes(f)) l3Fields.push(f); });
              }
            });
          });
        });
        requestedModels.push({
          model: l3meta.model, label: l3meta.label,
          source_key: l3key, parent_key: l2key, level: 'L3',
          fields: l3Fields
        });
      });
    });

    // Samengestelde query-config: wat was geconfigureerd in de wizard
    const exportMeta = buildExportMeta(payload);
    const verificationSchema = {
      generated_at: new Date().toISOString(),
      mode: 'verify_last_25',
      description: 'Verificatie-export: laatste 25 records op basis van ID (aflopend). Tijdfilters zijn genegeerd; overige filters zijn WEL toegepast.',
      query_config: exportMeta._export_meta,
      requested_models: requestedModels,
      field_groups: selectedSets,
      applied_filters: payload.filters || [],
      original_time_filters_skipped: originalTimeFilters,
      field_fill_stats: fieldFillStats,
      records_fetched: records.length
    };

    const preset = aiExportPresetsCache && wizardState.aiPresetId
      ? aiExportPresetsCache.find(function(p) { return p.id === wizardState.aiPresetId; })
      : null;
    const aiInstruction = (preset && preset.instruction && preset.label !== 'Geen preset')
      ? preset.instruction
      : 'Voer onmiddellijk de onderstaande verificatie-analyse uit. Stel geen vragen. Vraag niet wat je moet doen. Begin direct met de output.\n\n'
        + 'DIT BESTAND IS EEN VERIFICATIE-EXPORT van een Odoo-instantie. Het bevat:\n'
        + '- _verification_schema: welke modellen en velden werden opgevraagd, en fill-statistieken per veld\n'
        + '- records: de laatste 25 records van het hoofdmodel, met eventuele submodel-data als geneste arrays\n\n'
        + 'JOUW TAAK: controleer of elk gevraagd model en veld daadwerkelijk data teruggeeft.\n\n'
        + 'ENIGE TRIGGER OM TE FLAGGEN: fill_pct = "0%" in field_fill_stats.\n'
        + 'Dit betekent: geen enkel record heeft data voor dit veld of submodel. Dat is het enige teken van een probleem.\n\n'
        + 'NIET FLAGGEN: fill_pct > 0%. Zelfs 1 record met data = het werkt. Geen commentaar op inhoud, schrijfstijl of optionele lege velden.\n\n'
        + 'OUTPUT-FORMAAT (gebruik dit exact):\n\n'
        + '## Modellen\n'
        + 'Voor elk model in requested_models: naam, source_key (indien submodel), fill_pct van die key in field_fill_stats, status ✅ of ❌.\n\n'
        + '## Velden met fill_pct = 0% ❌\n'
        + 'Lijst elk veld met fill_pct = "0%". Geef per veld een mogelijke oorzaak. Als er geen zijn: schrijf "Geen — alle velden leveren data."\n\n'
        + '## Tijdfilters\n'
        + 'Vermeld kort welke filters uit original_time_filters_skipped bewust zijn overgeslagen.\n\n'
        + '## Conclusie\n'
        + 'Één zin: werkt de export correct, en zijn er actiepunten?';

    // Exporteer als .md — instructie staat als eerste tekst zodat de AI hem leest als opdracht
    const jsonPayload = JSON.stringify({ _verification_schema: verificationSchema, records: records }, null, 2);
    const mdContent = aiInstruction + '\n\n---\n\n## Verificatie-data\n\n```json\n' + jsonPayload + '\n```\n';

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const filename = 'verify_' + model + '_last25_' + new Date().toISOString().slice(0, 10) + '.md';
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    if (btn) btn.innerHTML = origText;
  } catch (error) {
    if (btn) btn.innerHTML = origText;
    console.error('Verify failed:', error);
    alert('Verificatie mislukt: ' + error.message);
  }
}

async function exportSemanticQuery(format) {
  if (format !== 'xlsx' && format !== 'json' && format !== 'md') return;
  try {
    const payload = wizardState.buildPayload();

    if (format === 'json' || format === 'md') {
      showLoading('Bezig met exporteren...');
      const response = await fetch('/insights/api/sales-insights/semantic/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error?.message || 'Query failed');
      const data = result.data;

      const exportMeta = buildExportMeta(payload);
      const exportData = { ...exportMeta, ...data };

      const model = payload.base_model;
      const tf = wizardState.resolvedTimeFilter();
      const periodStr = tf.from ? `_${tf.from}_${tf.to}` : '';
      const preset = aiExportPresetsCache?.find(p => p.id === wizardState.aiPresetId);
      const presetStr = preset && preset.label !== 'Geen preset' ? `_${preset.label.replace(/\s+/g,'-')}` : '';

      if (format === 'md') {
        // MD-export: AI-instructie als eerste tekst, dan data als JSON-codeblok
        const aiInstruction = preset?.instruction && preset.label !== 'Geen preset'
          ? preset.instruction
          : 'Analyseer de JSON-data in dit bestand en geef een beknopte samenvatting van de inhoud. '
            + 'Gebruik de _export_meta voor context over het model, de geselecteerde veldcategorieën en eventuele filters. '
            + 'Bespreek patronen, opvallende waarden en ontbrekende data.';
        const jsonStr = JSON.stringify(exportData, null, 2);
        const mdContent = aiInstruction + '\n\n---\n\n## Export-data\n\n```json\n' + jsonStr + '\n```\n';
        const filename = model + periodStr + presetStr + '_' + new Date().toISOString().slice(0,10) + '.md';
        const blob = new Blob([mdContent], { type: 'text/markdown' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
        hideLoading();
        return;
      }

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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      credentials: 'include'
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
    console.log('\u2705 Semantic Wizard loaded \u2014 role:', USER_ROLE);
  } catch (error) {
    console.error('\u274c Init failed:', error);
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) loadingEl.innerHTML = `<div class="alert alert-error"><div><h3 class="font-bold">Laden mislukt</h3><p>${error.message}</p></div></div>`;
  }
});
