/**
 * Forminator Sync V2 — Client Script
 *
 * Full UX overhaul: intuitive 3-step wizard, no internal V2 terminology.
 * Only Cloudflare secrets used for WordPress auth. No X-OpenVME-Secret in UI.
 *
 * Views: list | connections | wizard | detail
 */
export const forminatorSyncV2ClientScript = String.raw`
(() => {
'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CONFIG — maps user-facing choices to internal V2 model config
// ═══════════════════════════════════════════════════════════════════════════
var ACTIONS = {
  contact: {
    label: 'Contact aanmaken / updaten',
    description: 'Formuliergegevens opslaan of bijwerken als contact in Odoo.',
    icon: 'user',
    badge: 'res.partner',
    badgeClass: 'badge-info',
    resolver_type: 'partner_by_email',
    input_source_field: 'email',
    create_if_missing: true,
    output_context_key: 'context.partner_id',
    odoo_model: 'res.partner',
    identifier_type: 'single_email',
    update_policy: 'always_overwrite',
    odooFields: [
      { field: 'name',   label: 'Naam',     required: false },
      { field: 'email',  label: 'E-mail',   required: false },
      { field: 'phone',  label: 'Telefoon', required: false },
      { field: 'mobile', label: 'Mobiel',   required: false },
      { field: 'street', label: 'Straat',   required: false },
      { field: 'city',   label: 'Stad',     required: false },
      { field: 'zip',    label: 'Postcode', required: false },
    ],
  },
  lead: {
    label: 'Lead aanmaken',
    description: 'Maak een nieuwe verkooplead aan in Odoo CRM.',
    icon: 'trending-up',
    badge: 'crm.lead',
    badgeClass: 'badge-success',
    resolver_type: 'partner_by_email',
    input_source_field: 'email',
    create_if_missing: true,
    output_context_key: 'context.partner_id',
    odoo_model: 'crm.lead',
    identifier_type: 'single_email',
    update_policy: 'always_overwrite',
    odooFields: [
      { field: 'partner_name', label: 'Naam',               required: false },
      { field: 'email_from',   label: 'E-mail',             required: true  },
      { field: 'phone',        label: 'Telefoon',           required: false },
      { field: 'description',  label: 'Bericht / Notities', required: false },
    ],
  },
  webinar: {
    label: 'Webinaarinschrijving',
    description: 'Registreer de contactpersoon voor een webinar in Odoo.',
    icon: 'video',
    badge: 'x_webinar',
    badgeClass: 'badge-warning',
    resolver_type: 'webinar_by_external_id',
    input_source_field: 'webinar_id',
    create_if_missing: false,
    output_context_key: 'context.webinar_id',
    odoo_model: 'x_webinarregistrations',
    identifier_type: 'registration_composite',
    update_policy: 'always_overwrite',
    odooFields: [
      { field: 'partner_id', label: 'Contact',          required: true  },
      { field: 'webinar_id', label: 'Webinar',          required: true  },
      { field: 'x_name',     label: 'Naam deelnemer',   required: false },
      { field: 'x_email',    label: 'E-mail deelnemer', required: false },
    ],
  },
};

var SKIP_TYPES = ['page-break', 'group', 'html', 'section', 'captcha'];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
var S = {
  view: 'list',
  sites: [],
  integrations: [],
  wizard: {
    step: 1,
    site: null,
    form: null,
    action: null,
    forms: [],
    formsLoading: false,
  },
  activeId: null,
  detail: null,
  testStatus: null,
  submissions: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function api(path, opts) {
  opts = opts || {};
  var res = await fetch('/forminator-v2/api' + path, Object.assign(
    { headers: { 'Content-Type': 'application/json' } },
    opts
  ));
  var body = await res.json().catch(function() { return {}; });
  if (!res.ok || body.success === false) throw new Error(body.error || 'Request mislukt');
  return body;
}

function showAlert(message, type) {
  type = type || 'info';
  var el = document.getElementById('statusAlert');
  if (!el) return;
  el.className = 'alert mb-6';
  if (type === 'error')   el.classList.add('alert-error');
  else if (type === 'success') el.classList.add('alert-success');
  else if (type === 'warning') el.classList.add('alert-warning');
  else el.classList.add('alert-info');
  el.innerHTML = '<span>' + esc(message) + '</span>';
  el.style.display = 'flex';
  if (type !== 'error') {
    setTimeout(function() { el.style.display = 'none'; }, 5000);
  }
}

function showView(name) {
  S.view = name;
  ['list', 'connections', 'wizard', 'detail'].forEach(function(v) {
    var el = document.getElementById('view-' + v);
    if (el) el.style.display = (v === name) ? '' : 'none';
  });
  // show/hide header action buttons
  var btnNew = document.getElementById('btnNewIntegration');
  var settingsDd = document.getElementById('settingsDropdown');
  var showHeaderDd = (name === 'list');
  if (btnNew) btnNew.style.display = showHeaderDd ? '' : 'none';
  if (settingsDd) settingsDd.style.display = showHeaderDd ? '' : 'none';
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function fmt(v) {
  if (!v) return '-';
  var d = new Date(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('nl-BE');
}

function shortId(v) {
  return String(v || '').slice(0, 8);
}

function resetWizard() {
  S.wizard = { step: 1, site: null, form: null, action: null, forms: [], formsLoading: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SUGGEST: match form field to odoo field by keyword similarity
// ═══════════════════════════════════════════════════════════════════════════
var FIELD_KEYWORDS = {
  email:        ['email', 'mail', 'emai'],
  email_from:   ['email', 'mail', 'emai'],
  name:         ['name', 'naam', 'voornaam', 'achternaam', 'fullname'],
  partner_name: ['name', 'naam', 'voornaam', 'fullname'],
  phone:        ['phone', 'telefoon', 'tel', 'gsm'],
  mobile:       ['mobile', 'mobiel', 'gsm', 'cel'],
  street:       ['street', 'straat', 'adres', 'address'],
  city:         ['city', 'stad', 'gemeente'],
  zip:          ['zip', 'postcode', 'postal'],
  description:  ['message', 'bericht', 'opmerking', 'comment', 'note', 'tekst', 'vraag'],
};

function suggestFormField(odooField, formFields) {
  var clean = function(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var kws = FIELD_KEYWORDS[odooField] || [clean(odooField)];
  var haystack = formFields.filter(function(f) { return !SKIP_TYPES.includes(f.type); });
  for (var i = 0; i < kws.length; i++) {
    var kw = kws[i];
    var match = haystack.find(function(f) {
      return clean(f.field_id).includes(kw) || clean(f.label || '').includes(kw);
    });
    if (match) return match.field_id;
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER: LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════
function renderList() {
  var loading = document.getElementById('listLoading');
  var empty   = document.getElementById('listEmpty');
  var cards   = document.getElementById('listCards');
  if (!loading || !empty || !cards) return;

  loading.style.display = 'none';

  if (S.integrations.length === 0) {
    empty.style.display  = '';
    cards.style.display = 'none';
    return;
  }

  empty.style.display  = 'none';
  cards.style.display = '';

  cards.innerHTML = S.integrations.map(function(row) {
    var isActive = row.is_active;
    // Try to find action label from resolver_type
    var actionLabel = '';
    var actionBadgeClass = 'badge-ghost';
    var actionKeys = Object.keys(ACTIONS);
    for (var i = 0; i < actionKeys.length; i++) {
      var cfg = ACTIONS[actionKeys[i]];
      if (cfg.resolver_type === row.resolver_type || cfg.odoo_model === row.odoo_model) {
        actionLabel = cfg.label;
        actionBadgeClass = cfg.badgeClass;
        break;
      }
    }

    return '<div class="card bg-base-100 shadow hover:shadow-md transition-shadow">' +
      '<div class="card-body p-5">' +
        '<div class="flex items-start justify-between gap-2 mb-2">' +
          '<h3 class="font-bold text-base leading-tight">' + esc(row.name || 'Integratie') + '</h3>' +
          (isActive
            ? '<span class="badge badge-success badge-sm shrink-0">Actief</span>'
            : '<span class="badge badge-ghost badge-sm shrink-0">Inactief</span>') +
        '</div>' +
        '<p class="text-xs text-base-content/60 mb-1 font-mono">' + esc(row.forminator_form_id || '—') + '</p>' +
        (actionLabel ? '<div class="mb-3"><span class="badge ' + actionBadgeClass + ' badge-sm">' + esc(actionLabel) + '</span></div>' : '<div class="mb-3"></div>') +
        '<div class="flex gap-2 pt-3 border-t border-base-200">' +
          '<button class="btn btn-xs btn-primary flex-1" data-action="open-detail" data-id="' + esc(row.id) + '">Beheren</button>' +
          '<button class="btn btn-xs btn-error btn-outline" data-action="delete-integration" data-id="' + esc(row.id) + '" data-name="' + esc(row.name || 'Integratie') + '" title="Verwijderen">' +
            '<i data-lucide="trash-2" class="w-3 h-3"></i>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER: CONNECTIONS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function renderConnections() {
  var el = document.getElementById('connectionsList');
  if (!el) return;

  if (S.sites.length === 0) {
    el.innerHTML = '<div class="alert alert-warning mt-4">' +
      '<i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>' +
      '<span>Geen WordPress sites geconfigureerd. Voeg <code class="bg-base-200 px-1 rounded">WORDPRESS_URL_SITE_1</code> en <code class="bg-base-200 px-1 rounded">WP_API_TOKEN_SITE_1</code> toe als Cloudflare secrets.</span>' +
      '</div>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  el.innerHTML = '<div class="space-y-3 mt-4">' +
    S.sites.map(function(s) {
      return '<div class="card bg-base-100 shadow">' +
        '<div class="card-body p-4 flex-row items-center gap-4">' +
          '<div class="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center shrink-0">' +
            '<i data-lucide="globe" class="w-5 h-5 text-base-content/50"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="font-semibold truncate">' + esc(s.label) + '</p>' +
            '<p class="text-sm text-base-content/60 truncate">' + esc(s.url) + '</p>' +
          '</div>' +
          (s.has_token
            ? '<div class="flex items-center gap-1.5 text-success text-sm shrink-0"><i data-lucide="check-circle" class="w-4 h-4"></i><span>Actief</span></div>'
            : '<div class="flex items-center gap-1.5 text-error text-sm shrink-0"><i data-lucide="alert-circle" class="w-4 h-4"></i><span>Geen token</span></div>') +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>' +
  '<div class="alert alert-info mt-6">' +
    '<i data-lucide="shield" class="w-4 h-4 shrink-0"></i>' +
    '<span>Credentials worden beheerd via Cloudflare secrets. Geen wachtwoorden of API-sleutels zichtbaar in de interface.</span>' +
  '</div>';

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER: WIZARD
// ═══════════════════════════════════════════════════════════════════════════
function renderWizard() {
  renderWizardSteps();
  renderWizardSites();
  renderWizardForms();
  renderWizardActions();
  renderWizardMapping();
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function renderWizardSteps() {
  var step = S.wizard.step;
  [1, 2, 3, 4].forEach(function(n) {
    var el = document.getElementById('wizardStep' + n);
    if (!el) return;
    el.className = 'step' + (n <= step ? ' step-primary' : '');
  });
}

function renderWizardSites() {
  var grid = document.getElementById('wizardSitesGrid');
  if (!grid) return;

  if (S.sites.length === 0) {
    grid.innerHTML = '<div class="alert alert-warning col-span-full"><span>Geen WordPress sites gevonden in Cloudflare secrets.</span></div>';
    return;
  }

  grid.innerHTML = S.sites.map(function(s) {
    var selected = S.wizard.site && S.wizard.site.key === s.key;
    return '<button type="button" class="card bg-base-100 shadow text-left hover:shadow-md transition-all border-2 ' +
      (selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-base-300') +
      '" data-action="wizard-select-site"' +
      ' data-key="' + esc(s.key) + '"' +
      ' data-url="' + esc(s.url) + '"' +
      ' data-label="' + esc(s.label) + '">' +
      '<div class="card-body p-4">' +
        '<div class="flex items-center gap-2 mb-1">' +
          (selected
            ? '<i data-lucide="check-circle" class="w-4 h-4 text-primary shrink-0"></i>'
            : '<i data-lucide="globe" class="w-4 h-4 text-base-content/40 shrink-0"></i>') +
          '<p class="font-semibold text-sm">' + esc(s.label) + '</p>' +
        '</div>' +
        '<p class="text-xs text-base-content/60 truncate">' + esc(s.url) + '</p>' +
        (s.has_token ? '' : '<p class="text-xs text-error mt-1">Geen token geconfigureerd</p>') +
      '</div>' +
    '</button>';
  }).join('');
}

function renderWizardForms() {
  var section = document.getElementById('wizard-section-forms');
  var grid    = document.getElementById('wizardFormsGrid');
  if (!section || !grid) return;

  if (!S.wizard.site) { section.style.display = 'none'; return; }
  section.style.display = '';

  if (S.wizard.formsLoading) {
    grid.innerHTML = '<div class="flex items-center gap-3 col-span-full py-8 text-base-content/60">' +
      '<span class="loading loading-spinner loading-sm"></span><span>Formulieren ophalen...</span></div>';
    return;
  }

  if (S.wizard.forms.length === 0) {
    grid.innerHTML = '<div class="alert alert-warning col-span-full"><span>Geen formulieren gevonden op ' + esc(S.wizard.site.url) + '.</span></div>';
    return;
  }

  grid.innerHTML = S.wizard.forms.map(function(form) {
    var selected = S.wizard.form && String(S.wizard.form.form_id) === String(form.form_id);
    var fields = Array.isArray(form.fields) ? form.fields : [];
    var mappable = fields.filter(function(f) { return !SKIP_TYPES.includes(f.type); }).length;

    return '<button type="button" class="card bg-base-100 shadow text-left hover:shadow-md transition-all border-2 ' +
      (selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-base-300') +
      '" data-action="wizard-select-form"' +
      ' data-form-id="' + esc(String(form.form_id)) + '"' +
      ' data-form-name="' + esc(String(form.form_name || form.form_id)) + '"' +
      ' data-fields="' + esc(JSON.stringify(fields)) + '">' +
      '<div class="card-body p-4">' +
        '<div class="flex items-start gap-2">' +
          (selected
            ? '<i data-lucide="check-circle" class="w-4 h-4 text-primary shrink-0 mt-0.5"></i>'
            : '<i data-lucide="file-text" class="w-4 h-4 text-base-content/40 shrink-0 mt-0.5"></i>') +
          '<div class="min-w-0">' +
            '<p class="font-semibold text-sm">' + esc(String(form.form_name || form.form_id)) + '</p>' +
            '<p class="text-xs text-base-content/60">ID: ' + esc(String(form.form_id)) + ' &middot; ' + mappable + ' velden</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</button>';
  }).join('');
}

function renderWizardActions() {
  var section = document.getElementById('wizard-section-actions');
  if (!section) return;

  if (!S.wizard.form) { section.style.display = 'none'; return; }
  section.style.display = '';

  var grid = section.querySelector('.actions-grid');
  if (!grid) return;

  grid.innerHTML = Object.keys(ACTIONS).map(function(key) {
    var cfg = ACTIONS[key];
    var selected = S.wizard.action === key;
    return '<button type="button" class="card bg-base-100 shadow text-left hover:shadow-md transition-all border-2 ' +
      (selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-base-300') +
      '" data-action="wizard-select-action" data-key="' + esc(key) + '">' +
      '<div class="card-body p-5">' +
        '<div class="flex items-center gap-3 mb-3">' +
          (selected
            ? '<div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">' +
              '<i data-lucide="check" class="w-5 h-5 text-primary-content"></i></div>'
            : '<div class="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center shrink-0">' +
              '<i data-lucide="' + esc(cfg.icon) + '" class="w-5 h-5 text-base-content/60"></i></div>') +
          '<p class="font-bold">' + esc(cfg.label) + '</p>' +
        '</div>' +
        '<p class="text-sm text-base-content/60 mb-3">' + esc(cfg.description) + '</p>' +
        '<span class="badge ' + esc(cfg.badgeClass) + ' badge-sm">' + esc(cfg.badge) + '</span>' +
      '</div>' +
    '</button>';
  }).join('');
}

function buildFieldOptions(formFields) {
  return '<option value="">— niet koppelen —</option>' +
    formFields.map(function(f) {
      var label = String(f.label || f.field_id);
      var id    = String(f.field_id);
      return '<option value="' + esc(id) + '">' + esc(label) + ' [' + esc(id) + ']</option>';
    }).join('');
}

function renderWizardMapping() {
  var section = document.getElementById('wizard-section-mapping');
  if (!section) return;

  if (!S.wizard.action) { section.style.display = 'none'; return; }
  section.style.display = '';

  var cfg = ACTIONS[S.wizard.action];
  if (!cfg) return;

  var allFields   = (S.wizard.form && S.wizard.form.fields) ? S.wizard.form.fields : [];
  var formFields  = allFields.filter(function(f) { return !SKIP_TYPES.includes(f.type); });
  var fieldOpts   = buildFieldOptions(formFields);

  // Auto-fill name input once
  var nameInput = document.getElementById('wizardName');
  if (nameInput && !nameInput.value) {
    var sitePart = (S.wizard.site && S.wizard.site.label) ? S.wizard.site.label : 'Site';
    var formPart = (S.wizard.form && S.wizard.form.form_name) ? S.wizard.form.form_name : (S.wizard.form ? String(S.wizard.form.form_id) : 'Formulier');
    nameInput.value = sitePart + ' \u2014 ' + formPart + ' \u2014 ' + cfg.label;
  }

  var table = document.getElementById('wizardMappingTable');
  if (!table) return;

  var rows = cfg.odooFields.map(function(of_) {
    var suggested = suggestFormField(of_.field, formFields);
    // Build options with suggested selected
    var opts = '<option value="">— niet koppelen —</option>' +
      formFields.map(function(f) {
        var id = String(f.field_id);
        var label = String(f.label || f.field_id);
        var sel = (id === suggested) ? ' selected' : '';
        return '<option value="' + esc(id) + '"' + sel + '>' + esc(label) + ' [' + esc(id) + ']</option>';
      }).join('');

    return '<tr>' +
      '<td class="align-middle py-3">' +
        '<span class="font-medium text-sm">' + esc(of_.label) + '</span>' +
        (of_.required ? ' <span class="badge badge-error badge-xs">verplicht</span>' : '') +
        '<br><span class="font-mono text-xs text-base-content/40">' + esc(of_.field) + '</span>' +
      '</td>' +
      '<td class="py-2">' +
        '<select class="select select-bordered select-sm w-full" name="map-form-' + esc(of_.field) + '">' +
          opts +
        '</select>' +
      '</td>' +
      '<td class="py-2">' +
        '<input class="input input-bordered input-sm w-full" name="map-static-' + esc(of_.field) + '" placeholder="Vaste waarde..." />' +
      '</td>' +
    '</tr>';
  }).join('');

  table.innerHTML = '<div class="overflow-x-auto">' +
    '<table class="table">' +
      '<thead><tr>' +
        '<th>Odoo veld</th>' +
        '<th>Formulier veld</th>' +
        '<th>Of vaste waarde</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
  '</div>' +
  '<p class="text-xs text-base-content/40 mt-3">Rij zonder selectie en zonder vaste waarde wordt overgeslagen.</p>';
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER: DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════
function renderDetail() {
  if (!S.detail) return;
  var integration = S.detail.integration;
  var resolvers   = S.detail.resolvers || [];
  var targets     = S.detail.targets   || [];

  // Determine action config from resolver
  var resolver = resolvers[0];
  var target   = targets[0];
  var actionCfg = null;
  var actionKeys = Object.keys(ACTIONS);
  for (var i = 0; i < actionKeys.length; i++) {
    var cfg = ACTIONS[actionKeys[i]];
    if (resolver && cfg.resolver_type === resolver.resolver_type) { actionCfg = cfg; break; }
    if (target   && cfg.odoo_model    === target.odoo_model)      { actionCfg = cfg; break; }
  }

  // Header card
  var headerEl = document.getElementById('detailHeader');
  if (headerEl) {
    headerEl.innerHTML =
      '<div class="card bg-base-100 shadow mb-6">' +
        '<div class="card-body p-6">' +
          '<div class="flex flex-wrap items-start justify-between gap-4">' +
            '<div class="min-w-0">' +
              '<h2 class="text-2xl font-bold mb-1 truncate">' + esc(integration.name || 'Integratie') + '</h2>' +
              '<p class="text-sm text-base-content/60 mb-2">Formulier: <span class="font-mono">' + esc(integration.forminator_form_id || '—') + '</span></p>' +
              (actionCfg
                ? '<span class="badge ' + esc(actionCfg.badgeClass) + '">' + esc(actionCfg.label) + '</span>'
                : '') +
            '</div>' +
            '<label class="flex items-center gap-3 cursor-pointer">' +
              '<span class="font-semibold text-sm">' + (integration.is_active ? 'Actief' : 'Inactief') + '</span>' +
              '<input id="detailActiveToggle" type="checkbox" class="toggle toggle-success"' + (integration.is_active ? ' checked' : '') + '>' +
            '</label>' +
          '</div>' +
          '<div id="detailTestStatus" class="mt-4 text-sm"></div>' +
        '</div>' +
      '</div>';

    var toggle = document.getElementById('detailActiveToggle');
    if (toggle) {
      toggle.addEventListener('change', function(e) {
        handleToggleActive(e.target.checked).catch(function(err) { showAlert(err.message, 'error'); });
      });
    }
  }

  updateDetailTestStatus();
  renderDetailMappings();
  renderDetailSubmissions();

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function updateDetailTestStatus() {
  var el = document.getElementById('detailTestStatus');
  if (!el) return;
  var tested = S.testStatus && S.testStatus.has_successful_test;
  if (tested) {
    el.innerHTML = '<span class="text-success flex items-center gap-1.5">' +
      '<i data-lucide="check-circle" class="w-4 h-4"></i> Test geslaagd &mdash; integratie kan worden geactiveerd.' +
    '</span>';
  } else {
    el.innerHTML = '<span class="text-warning flex items-center gap-1.5">' +
      '<i data-lucide="alert-triangle" class="w-4 h-4"></i> Nog geen geslaagde test. Activatie is nog niet mogelijk.' +
    '</span>' +
    '<button class="btn btn-xs btn-outline mt-2" id="btnRunTest">Test uitvoeren</button>';
    var testBtn = document.getElementById('btnRunTest');
    if (testBtn) {
      testBtn.addEventListener('click', function() {
        handleRunTest().catch(function(err) { showAlert(err.message, 'error'); });
      });
    }
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function renderDetailMappings() {
  var container = document.getElementById('detailMappingsContainer');
  if (!container) return;

  var targets = (S.detail && S.detail.targets) ? S.detail.targets : [];
  var firstTarget = targets[0];

  if (!firstTarget) {
    container.innerHTML = '<p class="text-sm text-base-content/60">Geen schrijfdoel gevonden voor deze integratie.</p>';
    return;
  }

  // Collect all mappings across all targets
  var allMappings = [];
  targets.forEach(function(t) {
    var mappings = (S.detail.mappingsByTarget && S.detail.mappingsByTarget[t.id]) ? S.detail.mappingsByTarget[t.id] : [];
    mappings.forEach(function(m) { allMappings.push(Object.assign({}, m, { _targetId: t.id })); });
  });

  var tableHtml;
  if (allMappings.length === 0) {
    tableHtml = '<p class="text-sm text-base-content/60 py-2">Nog geen veldkoppelingen &mdash; voeg er hieronder toe.</p>';
  } else {
    tableHtml =
      '<div class="overflow-x-auto">' +
        '<table class="table table-sm">' +
          '<thead><tr><th>Odoo veld</th><th>Bron</th><th>Waarde</th><th>Verplicht</th><th></th></tr></thead>' +
          '<tbody>' +
          allMappings.map(function(m) {
            return '<tr>' +
              '<td class="font-mono text-sm">' + esc(m.odoo_field) + '</td>' +
              '<td><span class="badge badge-outline badge-sm">' + esc(m.source_type) + '</span></td>' +
              '<td class="text-sm max-w-xs truncate">' + esc(m.source_value) + '</td>' +
              '<td>' + (m.is_required ? '<span class="badge badge-error badge-xs">verplicht</span>' : '') + '</td>' +
              '<td>' +
                '<button class="btn btn-ghost btn-xs text-error" data-action="delete-mapping" data-id="' + esc(m.id) + '" title="Verwijder koppeling">' +
                  '<i data-lucide="x" class="w-3 h-3"></i>' +
                '</button>' +
              '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  // Add-mapping form
  var addFormHtml =
    '<div class="divider text-xs text-base-content/40">Koppeling toevoegen</div>' +
    '<form id="addMappingForm" data-target-id="' + esc(String(firstTarget.id)) + '" class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1"><span class="label-text text-xs">Odoo veld</span></label>' +
        '<input name="odoo_field" class="input input-bordered input-sm" placeholder="bijv. email_from" required />' +
      '</div>' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1"><span class="label-text text-xs">Bron</span></label>' +
        '<select name="source_type" class="select select-bordered select-sm">' +
          '<option value="form">Formulier veld</option>' +
          '<option value="static">Vaste waarde</option>' +
          '<option value="context">Context</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1"><span class="label-text text-xs">Waarde / veld-ID</span></label>' +
        '<input name="source_value" class="input input-bordered input-sm" placeholder="bijv. email" required />' +
      '</div>' +
      '<div class="flex items-end gap-2 pb-0.5">' +
        '<label class="flex items-center gap-1.5 cursor-pointer">' +
          '<input name="is_required" type="checkbox" class="checkbox checkbox-sm" />' +
          '<span class="text-xs">Verplicht</span>' +
        '</label>' +
        '<button type="submit" class="btn btn-primary btn-sm">+ Voeg toe</button>' +
      '</div>' +
    '</form>';

  container.innerHTML = tableHtml + addFormHtml;

  // Attach submit listener directly to avoid delegation issues after re-render
  var addForm = container.querySelector('#addMappingForm');
  if (addForm) {
    addForm.addEventListener('submit', function(e) {
      e.preventDefault();
      handleAddMapping(addForm).catch(function(err) { showAlert(err.message, 'error'); });
    });
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function renderDetailSubmissions() {
  var el = document.getElementById('detailHistory');
  if (!el) return;

  if (!S.submissions || S.submissions.length === 0) {
    el.innerHTML = '<p class="text-sm text-base-content/60 py-4">Nog geen indieningen.</p>';
    return;
  }

  var statusBadge = function(status) {
    var classes = {
      success: 'badge-success', processed: 'badge-success',
      partial_failed: 'badge-warning', retry_scheduled: 'badge-warning',
      permanent_failed: 'badge-error', retry_exhausted: 'badge-error',
      running: 'badge-info', retry_running: 'badge-info',
      duplicate_ignored: 'badge-neutral', duplicate_inflight: 'badge-neutral',
    };
    return '<span class="badge badge-sm ' + (classes[status] || 'badge-ghost') + '">' + esc(status || '-') + '</span>';
  };

  el.innerHTML =
    '<div class="overflow-x-auto">' +
      '<table class="table table-xs">' +
        '<thead><tr><th>ID</th><th>Status</th><th>Retries</th><th>Aangemaakt</th><th>Actie</th></tr></thead>' +
        '<tbody>' +
        S.submissions.map(function(sub) {
          var replayAllowed = ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(sub.status || ''));
          return '<tr>' +
            '<td class="font-mono">' + esc(shortId(sub.id)) + '</td>' +
            '<td>' + statusBadge(sub.status) + '</td>' +
            '<td>' + esc(String(sub.retry_count != null ? sub.retry_count : 0)) + '</td>' +
            '<td class="text-xs">' + esc(fmt(sub.created_at)) + '</td>' +
            '<td>' + (replayAllowed
              ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '">Replay</button>'
              : '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════
async function loadSites() {
  var body = await api('/forminator/sites');
  S.sites = body.data || [];
}

async function loadIntegrations() {
  var body = await api('/integrations');
  S.integrations = body.data || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD ACTIONS
// ═══════════════════════════════════════════════════════════════════════════
async function wizardSelectSite(siteKey, siteUrl, siteLabel) {
  S.wizard.site = { key: siteKey, url: siteUrl, label: siteLabel };
  S.wizard.form = null;
  S.wizard.action = null;
  S.wizard.step = 2;
  S.wizard.forms = [];
  S.wizard.formsLoading = true;
  renderWizard();

  try {
    var body = await api('/forminator/forms?site=' + encodeURIComponent(siteKey));
    S.wizard.forms = body.data || [];
  } catch (err) {
    S.wizard.forms = [];
    showAlert('Formulieren ophalen mislukt: ' + err.message, 'error');
  } finally {
    S.wizard.formsLoading = false;
    renderWizard();
  }
}

function wizardSelectForm(formId, formName, fields) {
  S.wizard.form   = { form_id: formId, form_name: formName, fields: fields };
  S.wizard.action = null;
  S.wizard.step   = 3;
  // Reset name suggestion
  var nameInput = document.getElementById('wizardName');
  if (nameInput) nameInput.value = '';
  renderWizard();
  // Scroll to action section
  var sec = document.getElementById('wizard-section-actions');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wizardSelectAction(actionKey) {
  S.wizard.action = actionKey;
  S.wizard.step   = 4;
  renderWizard();
  var sec = document.getElementById('wizard-section-mapping');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitWizard() {
  var btn = document.getElementById('btnCreateIntegration');
  if (btn) { btn.disabled = true; btn.textContent = 'Aanmaken...'; }

  try {
    var name = ((document.getElementById('wizardName') || {}).value || '').trim();
    if (!name) throw new Error('Geef de integratie een naam.');

    var cfg = ACTIONS[S.wizard.action];
    if (!cfg) throw new Error('Geen actie geselecteerd.');
    if (!S.wizard.form) throw new Error('Geen formulier geselecteerd.');

    // Step 1 — create integration
    var intRes = await api('/integrations', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        forminator_form_id: String(S.wizard.form.form_id),
        odoo_connection_id: 'default',
      }),
    });
    var integrationId = intRes.data.id;

    // Step 2 — create resolver
    await api('/integrations/' + integrationId + '/resolvers', {
      method: 'POST',
      body: JSON.stringify({
        resolver_type:       cfg.resolver_type,
        input_source_field:  cfg.input_source_field,
        create_if_missing:   cfg.create_if_missing,
        output_context_key:  cfg.output_context_key,
        order_index: 0,
      }),
    });

    // Step 3 — create target
    var targetRes = await api('/integrations/' + integrationId + '/targets', {
      method: 'POST',
      body: JSON.stringify({
        odoo_model:      cfg.odoo_model,
        identifier_type: cfg.identifier_type,
        update_policy:   cfg.update_policy,
        order_index: 0,
      }),
    });
    var targetId = targetRes.data.id;

    // Step 4 — create mappings
    var mappingSection = document.getElementById('wizard-section-mapping');
    var mappingPromises = [];
    var orderIdx = 0;

    cfg.odooFields.forEach(function(of_) {
      if (!mappingSection) return;
      var formSel   = mappingSection.querySelector('[name="map-form-' + of_.field + '"]');
      var staticInp = mappingSection.querySelector('[name="map-static-' + of_.field + '"]');
      var formVal   = formSel   ? (formSel.value   || '') : '';
      var staticVal = staticInp ? ((staticInp.value || '').trim()) : '';

      if (formVal) {
        mappingPromises.push(api('/targets/' + targetId + '/mappings', {
          method: 'POST',
          body: JSON.stringify({
            odoo_field:   of_.field,
            source_type:  'form',
            source_value: formVal,
            is_required:  of_.required,
            order_index:  orderIdx++,
          }),
        }));
      } else if (staticVal) {
        mappingPromises.push(api('/targets/' + targetId + '/mappings', {
          method: 'POST',
          body: JSON.stringify({
            odoo_field:   of_.field,
            source_type:  'static',
            source_value: staticVal,
            is_required:  of_.required,
            order_index:  orderIdx++,
          }),
        }));
      }
    });

    await Promise.all(mappingPromises);

    // Step 5 — run test stub (non-blocking)
    try {
      await api('/integrations/' + integrationId + '/test-stub', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (_) { /* test stub failure is non-critical */ }

    showAlert('Integratie "' + name + '" succesvol aangemaakt!', 'success');
    await loadIntegrations();
    resetWizard();
    showView('list');
    renderList();

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Integratie aanmaken'; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════
async function openDetail(id) {
  S.activeId = id;
  showView('detail');

  var headerEl = document.getElementById('detailHeader');
  if (headerEl) {
    headerEl.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>';
  }

  try {
    var results = await Promise.all([
      api('/integrations/' + id),
      api('/integrations/' + id + '/test-status'),
      api('/integrations/' + id + '/submissions'),
    ]);
    S.detail      = results[0].data;
    S.testStatus  = results[1].data;
    S.submissions = results[2].data || [];
    renderDetail();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function handleToggleActive(checked) {
  try {
    await api('/integrations/' + S.activeId, {
      method: 'PUT',
      body: JSON.stringify({ is_active: checked }),
    });
    showAlert(checked ? 'Integratie geactiveerd.' : 'Integratie gedeactiveerd.', 'success');
    await openDetail(S.activeId);
  } catch (err) {
    showAlert(err.message, 'error');
    // Revert toggle
    var toggle = document.getElementById('detailActiveToggle');
    if (toggle) toggle.checked = !checked;
  }
}

async function handleRunTest() {
  await api('/integrations/' + S.activeId + '/test-stub', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  showAlert('Test geslaagd. Activatie is nu toegestaan.', 'success');
  var testBody = await api('/integrations/' + S.activeId + '/test-status');
  S.testStatus = testBody.data;
  updateDetailTestStatus();
}

async function handleAddMapping(form) {
  var targetId    = form.dataset.targetId;
  var odooField   = ((form.querySelector('[name="odoo_field"]') || {}).value || '').trim();
  var sourceType  = (form.querySelector('[name="source_type"]') || {}).value || 'form';
  var sourceValue = ((form.querySelector('[name="source_value"]') || {}).value || '').trim();
  var isRequired  = !!((form.querySelector('[name="is_required"]') || {}).checked);

  if (!odooField || !sourceValue) {
    showAlert('Odoo veld en waarde zijn beide verplicht.', 'error');
    return;
  }

  await api('/targets/' + targetId + '/mappings', {
    method: 'POST',
    body: JSON.stringify({ odoo_field: odooField, source_type: sourceType, source_value: sourceValue, is_required: isRequired, order_index: 0 }),
  });
  showAlert('Veldkoppeling toegevoegd.', 'success');
  form.reset();
  await openDetail(S.activeId);
}

async function handleDeleteMapping(mappingId) {
  await api('/mappings/' + mappingId, { method: 'DELETE' });
  showAlert('Veldkoppeling verwijderd.', 'success');
  await openDetail(S.activeId);
}

async function handleDeleteIntegration(id, name) {
  if (!confirm('Integratie "' + name + '" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
  await api('/integrations/' + id, { method: 'DELETE' });
  showAlert('Integratie verwijderd.', 'success');
  await loadIntegrations();
  renderList();
}

async function handleReplay(submissionId) {
  var body = await api('/submissions/' + submissionId + '/replay', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  showAlert('Replay gestart: ' + shortId((body.data || {}).replay_submission_id), 'success');
  await openDetail(S.activeId);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT DELEGATION
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('click', function(event) {
  var btn = event.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;

  var run = async function() {
    if (action === 'goto-connections') {
      renderConnections();
      showView('connections');
      return;
    }
    if (action === 'goto-list') {
      await loadIntegrations();
      showView('list');
      renderList();
      return;
    }
    if (action === 'goto-wizard') {
      resetWizard();
      showView('wizard');
      renderWizard();
      return;
    }
    if (action === 'open-detail') {
      await openDetail(btn.dataset.id);
      return;
    }
    if (action === 'delete-integration') {
      await handleDeleteIntegration(btn.dataset.id, btn.dataset.name || 'Integratie');
      return;
    }
    if (action === 'wizard-select-site') {
      await wizardSelectSite(btn.dataset.key, btn.dataset.url, btn.dataset.label);
      return;
    }
    if (action === 'wizard-select-form') {
      var fields = [];
      try { fields = JSON.parse(btn.dataset.fields || '[]'); } catch (_) {}
      wizardSelectForm(btn.dataset.formId, btn.dataset.formName, fields);
      return;
    }
    if (action === 'wizard-select-action') {
      wizardSelectAction(btn.dataset.key);
      return;
    }
    if (action === 'submit-wizard') {
      await submitWizard();
      return;
    }
    if (action === 'delete-mapping') {
      await handleDeleteMapping(btn.dataset.id);
      return;
    }
    if (action === 'replay-submission') {
      await handleReplay(btn.dataset.id);
      return;
    }
  };

  run().catch(function(err) { showAlert(err.message, 'error'); });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════
async function bootstrap() {
  try {
    await Promise.all([loadSites(), loadIntegrations()]);
    showView('list');
    renderList();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

bootstrap();

})();
`;
