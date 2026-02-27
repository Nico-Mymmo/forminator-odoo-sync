/**
 * Forminator Sync V2 \u2014 Core
 *
 * Defines window.FSV2 with: ACTIONS, SKIP_TYPES, S (state), utilities,
 * auto-suggest logic, Odoo field cache loaders, model-defaults loader,
 * renderList, renderConnections, renderDefaults, loadSites, loadIntegrations.
 *
 * Dependencies: field-picker-component.js (OpenVME.FieldPicker)
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION CONFIG \u2014 maps user-facing choices to internal V2 model config
  // ═══════════════════════════════════════════════════════════════════════════
  var ACTIONS = {
    contact: {
      label: 'Contact aanmaken / updaten',
      description: 'Formuliergegevens opslaan of bijwerken als contact in Odoo.',
      icon: 'user',
      badge: 'res.partner',
      badgeClass: 'badge-info',
      odoo_model: 'res.partner',
      identifier_type: 'mapped_fields',
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
      odoo_model: 'crm.lead',
      identifier_type: 'mapped_fields',
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
    detailFormFields: null,  // null=not fetched, 'loading'=busy, [{...}]=done
    webhookConfig: null,     // cached result of GET /api/webhook-config
    odooFieldsCache: {},
    modelDefaultsCache: {},   // model → [{name, label, required, order_index}]
    modelDefaultsEditors: {}, // model → {open, pendingFields}
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
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok || body.success === false) throw new Error(body.error || 'Request mislukt');
    return body;
  }

  function showAlert(message, type) {
    type = type || 'info';
    var el = document.getElementById('statusAlert');
    if (!el) return;
    el.className = 'alert mb-6';
    if (type === 'error')        el.classList.add('alert-error');
    else if (type === 'success') el.classList.add('alert-success');
    else if (type === 'warning') el.classList.add('alert-warning');
    else                         el.classList.add('alert-info');
    el.innerHTML = '<span>' + esc(message) + '</span>';
    el.style.display = 'flex';
    if (type !== 'error') {
      setTimeout(function () { el.style.display = 'none'; }, 5000);
    }
  }

  function showView(name) {
    S.view = name;
    ['list', 'connections', 'wizard', 'detail', 'defaults'].forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.style.display = (v === name) ? '' : 'none';
    });
    var btnNew     = document.getElementById('btnNewIntegration');
    var settingsDd = document.getElementById('settingsDropdown');
    var showHeaderDd = (name === 'list');
    if (btnNew)     btnNew.style.display     = showHeaderDd ? '' : 'none';
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
    S.wizard = { step: 1, site: null, form: null, action: null, forms: [], formsLoading: false, extraMappings: [] };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-SUGGEST: match form field to Odoo field by keyword similarity
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
    var clean = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var kws = FIELD_KEYWORDS[odooField] || [clean(odooField)];
    var haystack = formFields.filter(function (f) { return !SKIP_TYPES.includes(f.type); });
    for (var i = 0; i < kws.length; i++) {
      var kw = kws[i];
      var match = haystack.find(function (f) {
        return clean(f.field_id).includes(kw) || clean(f.label || '').includes(kw);
      });
      if (match) return match.field_id;
    }
    return '';
  }

  function suggestOdooField(formFieldId, formFieldLabel, model) {
    var clean = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var haystack = S.odooFieldsCache[model] || [];
    if (!haystack.length) return '';
    var fClean = clean(formFieldId);
    var lClean = clean(formFieldLabel);
    var odooKeys = Object.keys(FIELD_KEYWORDS);
    for (var i = 0; i < odooKeys.length; i++) {
      var odooFieldName = odooKeys[i];
      var kws = FIELD_KEYWORDS[odooFieldName];
      for (var j = 0; j < kws.length; j++) {
        var kw = kws[j];
        if (fClean.includes(kw) || lClean.includes(kw)) {
          if (haystack.find(function (f) { return f.name === odooFieldName; })) {
            return odooFieldName;
          }
        }
      }
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ODOO FIELD CACHE
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadOdooFieldsForModel(model) {
    if (S.odooFieldsCache[model]) return S.odooFieldsCache[model];
    try {
      var body = await api('/odoo/fields?model=' + encodeURIComponent(model));
      S.odooFieldsCache[model] = body.data || [];
    } catch (_) {
      S.odooFieldsCache[model] = [];
    }
    return S.odooFieldsCache[model];
  }

  async function loadModelDefaultsForModel(model) {
    if (S.modelDefaultsCache[model] !== undefined) return S.modelDefaultsCache[model];
    try {
      var body = await api('/settings/model-defaults?model=' + encodeURIComponent(model));
      S.modelDefaultsCache[model] = body.data || [];
    } catch (_) {
      S.modelDefaultsCache[model] = [];
    }
    return S.modelDefaultsCache[model];
  }

  /** Returns saved DB defaults for an action's model, or falls back to hardcoded cfg.odooFields. */
  function getDefaultFieldsForAction(actionKey) {
    var cfg  = ACTIONS[actionKey];
    if (!cfg) return [];
    var saved = S.modelDefaultsCache[cfg.odoo_model];
    if (saved && saved.length > 0) {
      return saved.map(function (f) {
        return { field: f.name, label: f.label || f.name, required: !!f.required };
      });
    }
    return cfg.odooFields;
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
  // RENDER: LIST VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  function renderList() {
    var loading = document.getElementById('listLoading');
    var empty   = document.getElementById('listEmpty');
    var cards   = document.getElementById('listCards');
    if (!loading || !empty || !cards) return;

    loading.style.display = 'none';

    if (S.integrations.length === 0) {
      empty.style.display = '';
      cards.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    cards.style.display = '';

    cards.innerHTML = S.integrations.map(function (row) {
      var isActive = row.is_active;
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
          '<p class="text-xs text-base-content/60 mb-1 font-mono">' + esc(row.forminator_form_id || '\u2014') + '</p>' +
          (actionLabel
            ? '<div class="mb-3"><span class="badge ' + actionBadgeClass + ' badge-sm">' + esc(actionLabel) + '</span></div>'
            : '<div class="mb-3"></div>') +
          '<div class="flex gap-2 pt-3 border-t border-base-200">' +
            '<button class="btn btn-xs btn-primary flex-1" data-action="open-detail" data-id="' + esc(row.id) + '">Beheren</button>' +
            '<button class="btn btn-xs btn-error btn-outline" data-action="delete-integration"' +
              ' data-id="' + esc(row.id) + '" data-name="' + esc(row.name || 'Integratie') + '" title="Verwijderen">' +
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

    var sitesHtml;
    if (S.sites.length === 0) {
      sitesHtml =
        '<div class="alert alert-warning mt-4">' +
          '<i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>' +
          '<span>Geen WordPress sites geconfigureerd. Voeg <code class="bg-base-200 px-1 rounded">WORDPRESS_URL_SITE_1</code>' +
          ' en <code class="bg-base-200 px-1 rounded">WP_API_TOKEN_SITE_1</code> toe als Cloudflare secrets.</span>' +
        '</div>';
    } else {
      sitesHtml =
        '<div class="space-y-3 mt-4">' +
          S.sites.map(function (s) {
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
    }

    el.innerHTML = sitesHtml;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: DEFAULTS
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDefaults() {
    var el = document.getElementById('defaultsList');
    if (!el) return;

    var html =
      '<p class="text-sm text-base-content/60 mb-5">Stel per Odoo model in welke velden standaard als rijen verschijnen in de wizard.</p>' +
      '<div class="space-y-4">' +
      Object.keys(ACTIONS).map(function (actionKey) {
        var cfg      = ACTIONS[actionKey];
        var model    = cfg.odoo_model;
        var editor   = S.modelDefaultsEditors[model] || {};
        var saved    = S.modelDefaultsCache[model];
        var modelKey = model.replace(/\./g, '_');

        // ── Closed state: summary ──
        var summaryHtml = '';
        if (!editor.open) {
          if (saved === undefined || saved === null) {
            summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Laden\u2026</p>';
          } else if (saved.length === 0) {
            summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Geen standaarden opgeslagen.</p>';
          } else {
            summaryHtml =
              '<div class="flex flex-wrap gap-1.5 mt-2">' +
              saved.map(function (f) {
                return '<span class="badge badge-outline badge-sm">' +
                  esc(f.label || f.name) +
                  (f.required ? ' <span class="text-error">*</span>' : '') +
                '</span>';
              }).join('') +
              '</div>';
          }
        }

        // ── Open state: editor ──
        var editorHtml = '';
        if (editor.open) {
          var pending    = editor.pendingFields || [];
          var odooFields = S.odooFieldsCache[model] || [];

          var rowsHtml = pending.length === 0
            ? '<tr><td colspan="3" class="text-xs text-base-content/40 italic py-2">Leeg \u2014 wizard valt terug op ingebouwde defaults.</td></tr>'
            : pending.map(function (f, i) {
                return '<tr>' +
                  '<td class="py-1.5">' +
                    '<span class="font-medium text-sm">' + esc(f.label || f.name) + '</span>' +
                    '<span class="font-mono text-xs text-base-content/40 ml-1.5">' + esc(f.name) + '</span>' +
                  '</td>' +
                  '<td class="py-1.5">' +
                    '<label class="flex items-center gap-1.5 cursor-pointer">' +
                      '<input type="checkbox" class="checkbox checkbox-xs defaults-req-toggle"' +
                        ' data-model="' + esc(model) + '" data-idx="' + i + '"' + (f.required ? ' checked' : '') + ' />' +
                      '<span class="text-xs">Verplicht</span>' +
                    '</label>' +
                  '</td>' +
                  '<td class="py-1.5 text-right">' +
                    '<button type="button" class="btn btn-ghost btn-xs text-error"' +
                      ' data-action="remove-default-field" data-model="' + esc(model) + '" data-idx="' + i + '">' +
                      '<i data-lucide="x" class="w-3 h-3"></i>' +
                    '</button>' +
                  '</td>' +
                '</tr>';
              }).join('');

          var addRowHtml =
            '<div class="flex flex-wrap items-end gap-2 mt-3">' +
              '<div class="form-control flex-1 min-w-40">' +
                '<label class="label py-0 pb-1">' +
                  '<span class="label-text text-xs">Odoo veld</span>' +
                  '<span class="label-text-alt text-xs text-base-content/40">' +
                    (odooFields.length > 0
                      ? odooFields.length + ' velden beschikbaar'
                      : '<span class="loading loading-xs loading-spinner"></span> laden\u2026') +
                  '</span>' +
                '</label>' +
                (odooFields.length > 0
                  ? window.OpenVME.FieldPicker.render('defaults-add-' + modelKey, '--unused--', odooFields, '')
                  : '<div class="input input-bordered input-sm flex items-center gap-2 text-base-content/40"><span class="loading loading-spinner loading-xs"></span><span class="text-xs">Velden laden\u2026</span></div>') +
              '</div>' +
              '<label class="flex items-center gap-1.5 shrink-0 pb-0.5">' +
                '<input type="checkbox" id="defaults-new-req-' + esc(modelKey) + '" class="checkbox checkbox-xs" />' +
                '<span class="text-xs">Verplicht</span>' +
              '</label>' +
              '<button type="button" class="btn btn-sm btn-outline shrink-0"' +
                ' data-action="add-default-field" data-model="' + esc(model) + '">+ Voeg toe</button>' +
            '</div>';

          editorHtml =
            '<div class="mt-4 border-t border-base-200 pt-4">' +
              '<div class="overflow-x-auto mb-2">' +
                '<table class="table table-sm"><tbody>' + rowsHtml + '</tbody></table>' +
              '</div>' +
              addRowHtml +
              '<div class="flex gap-2 justify-end mt-5">' +
                '<button type="button" class="btn btn-ghost btn-sm"' +
                  ' data-action="toggle-model-defaults" data-model="' + esc(model) + '">Annuleer</button>' +
                '<button type="button" class="btn btn-primary btn-sm"' +
                  ' data-action="save-model-defaults" data-model="' + esc(model) + '">Opslaan</button>' +
              '</div>' +
            '</div>';
        }

        return '<div class="card bg-base-100 shadow">' +
          '<div class="card-body p-4">' +
            '<div class="flex items-start justify-between gap-4">' +
              '<div>' +
                '<p class="font-semibold">' + esc(cfg.label) + '</p>' +
                '<p class="text-xs font-mono text-base-content/50">' + esc(model) + '</p>' +
              '</div>' +
              '<button type="button" class="btn btn-ghost btn-xs shrink-0"' +
                ' data-action="toggle-model-defaults" data-model="' + esc(model) + '">' +
                (editor.open ? 'Sluiten' : 'Bewerken') +
              '</button>' +
            '</div>' +
            summaryHtml + editorHtml +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>';

    el.innerHTML = html;

    // Bind required-toggle checkboxes
    el.querySelectorAll('.defaults-req-toggle').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var ed = S.modelDefaultsEditors[cb.dataset.model];
        if (ed && ed.pendingFields && ed.pendingFields[parseInt(cb.dataset.idx, 10)]) {
          ed.pendingFields[parseInt(cb.dataset.idx, 10)].required = cb.checked;
        }
      });
    });

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════
  window.FSV2 = {
    // Config
    ACTIONS: ACTIONS,
    SKIP_TYPES: SKIP_TYPES,
    // State (shared mutable reference)
    S: S,
    // Utilities
    esc: esc,
    api: api,
    showAlert: showAlert,
    showView: showView,
    fmt: fmt,
    shortId: shortId,
    resetWizard: resetWizard,
    // Auto-suggest
    FIELD_KEYWORDS: FIELD_KEYWORDS,
    suggestFormField: suggestFormField,
    suggestOdooField: suggestOdooField,
    // Loaders
    loadOdooFieldsForModel: loadOdooFieldsForModel,
    loadModelDefaultsForModel: loadModelDefaultsForModel,
    getDefaultFieldsForAction: getDefaultFieldsForAction,
    loadSites: loadSites,
    loadIntegrations: loadIntegrations,
    // Renders
    renderList: renderList,
    renderConnections: renderConnections,
    renderDefaults: renderDefaults,
  };

}());
