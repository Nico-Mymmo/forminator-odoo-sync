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
  webhookConfig: null,      // cached result of GET /api/webhook-config
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
  ['list', 'connections', 'wizard', 'detail', 'defaults'].forEach(function(v) {
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
  S.wizard = { step: 1, site: null, form: null, action: null, forms: [], formsLoading: false, extraMappings: [] };
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

/**
 * Given a form field ID + label, suggest the matching Odoo field name (reverse of suggestFormField).
 * Returns '' if no match found.
 */
function suggestOdooField(formFieldId, formFieldLabel, model) {
  var clean = function(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var haystack = S.odooFieldsCache[model] || [];
  if (!haystack.length) return '';
  var fClean  = clean(formFieldId);
  var lClean  = clean(formFieldLabel);
  var odooKeys = Object.keys(FIELD_KEYWORDS);
  for (var i = 0; i < odooKeys.length; i++) {
    var odooFieldName = odooKeys[i];
    var kws = FIELD_KEYWORDS[odooFieldName];
    for (var j = 0; j < kws.length; j++) {
      var kw = kws[j];
      if (fClean.includes(kw) || lClean.includes(kw)) {
        if (haystack.find(function(f) { return f.name === odooFieldName; })) {
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

/** Returns saved DB defaults for an action’s model, or falls back to hardcoded cfg.odooFields. */
function getDefaultFieldsForAction(actionKey) {
  var cfg  = ACTIONS[actionKey];
  if (!cfg) return [];
  var saved = S.modelDefaultsCache[cfg.odoo_model];
  if (saved && saved.length > 0) {
    return saved.map(function(f) {
      return { field: f.name, label: f.label || f.name, required: !!f.required };
    });
  }
  return cfg.odooFields;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATIC VALUE INPUT — renders the right control based on Odoo field type
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Returns an <input> or <select> HTML string for a mapping's "static value" cell.
 * @param {string|null} name   - name attribute value (null = omit name attr)
 * @param {object|null} meta   - Odoo field meta: {type, selection} (null = plain text input)
 * @param {string}      value  - Current value
 * @param {string}      [extraAttrs] - Extra HTML attribute string, e.g. ' id="foo"'
 */
function renderStaticInput(name, meta, value, extraAttrs) {
  var type     = (meta && meta.type) || '';
  var nameAttr = name ? (' name="' + esc(name) + '"') : '';
  var extra    = extraAttrs || '';
  var selCls   = 'select select-bordered select-sm w-full';
  var inpCls   = 'input input-bordered input-sm w-full';

  if (type === 'boolean') {
    var ja  = (value === '1' || value === 'true')  ? ' selected' : '';
    var nee = (value === '0' || value === 'false') ? ' selected' : '';
    return '<select class="' + selCls + '"' + nameAttr + extra + '>' +
      '<option value="">— geen —</option>' +
      '<option value="1"' + ja  + '>Ja</option>' +
      '<option value="0"' + nee + '>Nee</option>' +
    '</select>';
  }
  if (type === 'selection' && meta.selection && meta.selection.length) {
    return '<select class="' + selCls + '"' + nameAttr + extra + '>' +
      '<option value="">— geen —</option>' +
      meta.selection.map(function(opt) {
        var k = String(opt[0]);
        var l = String(opt[1]);
        return '<option value="' + esc(k) + '"' + (value === k ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('') +
    '</select>';
  }
  return '<input class="' + inpCls + '"' + nameAttr + extra + ' value="' + esc(value || '') + '" placeholder="Vaste waarde..." />';
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM FIELD PICKER COMBOBOX (replaces native <datalist>)
// Fixed height • scrollbar • searchbox • full field metadata visible
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Renders a custom searchable field picker.
 * @param {string} id          - Unique ID for this picker instance.
 * @param {string} inputName   - name attr for the hidden value input (‘--unused--’ = no name).
 * @param {Array}  allFields   - [{name, label, type}] from Odoo fields cache.
 * @param {string} selectedName - Currently selected field name (or empty string).
 */
function renderFieldPicker(id, inputName, allFields, selectedName) {
  var sf      = allFields.find(function(f) { return f.name === selectedName; });
  var selLbl  = sf ? (sf.label || sf.name) : (selectedName || '');
  var isEmpty = !selectedName;

  var items = allFields.map(function(f) {
    var isSel = f.name === selectedName;
    return '<li class="fsp-item flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-base-200' +
      (isSel ? ' bg-primary/10 font-semibold' : '') + '"' +
      ' data-fsp-id="' + esc(id) + '" data-fsp-name="' + esc(f.name) + '" data-fsp-label="' + esc(f.label || f.name) + '">' +
      '<div class="min-w-0">' +
        '<span class="font-medium">' + esc(f.label || f.name) + '</span>' +
        '<span class="font-mono text-xs text-base-content/40 ml-1.5">' + esc(f.name) + '</span>' +
      '</div>' +
      '<span class="badge badge-ghost badge-xs shrink-0">' + esc(f.type || '') + '</span>' +
    '</li>';
  }).join('');

  return (
    '<div class="fsp-wrap relative w-full" id="fsp-' + esc(id) + '">' +
      '<button type="button"' +
        ' class="input input-bordered input-sm w-full flex items-center gap-2 cursor-pointer fsp-trigger text-left"' +
        ' data-fsp-id="' + esc(id) + '">' +
        '<span class="fsp-display flex-1 text-sm truncate' + (isEmpty ? ' text-base-content/50 italic' : '') + '">' +
          esc(isEmpty ? '— kies veld —' : selLbl) +
        '</span>' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-40"><path d="m6 9 6 6 6-6"/></svg>' +
      '</button>' +
      '<input type="hidden"' +
        (inputName !== '--unused--' ? ' name="' + esc(inputName) + '"' : '') +
        ' id="fsp-val-' + esc(id) + '" value="' + esc(selectedName || '') + '" />' +
      '<div class="fsp-panel absolute z-50 w-full mt-1 rounded-lg shadow-xl bg-base-100 border border-base-300 hidden"' +
        ' id="fsp-panel-' + esc(id) + '" style="min-width:260px;">' +
        '<div class="p-2 border-b border-base-200 bg-base-100 sticky top-0">' +
          '<input class="input input-sm input-bordered w-full fsp-search"' +
            ' data-fsp-id="' + esc(id) + '" placeholder="Zoeken op veldnaam of label…" autocomplete="off" />' +
        '</div>' +
        '<ul class="overflow-y-auto" style="max-height:220px;" id="fsp-list-' + esc(id) + '">' +
          '<li class="fsp-item px-3 py-2 text-sm cursor-pointer hover:bg-base-200 text-base-content/50 italic"' +
            ' data-fsp-id="' + esc(id) + '" data-fsp-name="" data-fsp-label="">— niet koppelen —</li>' +
          items +
        '</ul>' +
      '</div>' +
    '</div>'
  );
}

function closeAllFspPanels() {
  document.querySelectorAll('.fsp-panel:not(.hidden)').forEach(function(p) { p.classList.add('hidden'); });
}

function filterFspList(fspId, query) {
  var list = document.getElementById('fsp-list-' + fspId);
  if (!list) return;
  var q = (query || '').toLowerCase().trim();
  list.querySelectorAll('.fsp-item').forEach(function(li) {
    var name  = (li.dataset.fspName  || '').toLowerCase();
    var label = (li.dataset.fspLabel || '').toLowerCase();
    li.style.display = (!q || name.includes(q) || label.includes(q)) ? '' : 'none';
  });
}

function selectFspItem(fspId, name, label) {
  var valEl = document.getElementById('fsp-val-' + fspId);
  var dispEl = document.querySelector('#fsp-' + fspId + ' .fsp-display');
  var panel  = document.getElementById('fsp-panel-' + fspId);
  if (valEl)  {
    valEl.value = name;
    valEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (dispEl) {
    dispEl.textContent = name ? (label || name) : '— kies veld —';
    if (name) { dispEl.classList.remove('text-base-content/50', 'italic'); }
    else      { dispEl.classList.add('text-base-content/50', 'italic'); }
  }
  if (panel) panel.classList.add('hidden');
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

  // ── WP sites ────────────────────────────────────────────────────────────
  var sitesHtml;
  if (S.sites.length === 0) {
    sitesHtml =
      '<div class="alert alert-warning mt-4">' +
        '<i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i>' +
        '<span>Geen WordPress sites geconfigureerd. Voeg <code class="bg-base-200 px-1 rounded">WORDPRESS_URL_SITE_1</code> en <code class="bg-base-200 px-1 rounded">WP_API_TOKEN_SITE_1</code> toe als Cloudflare secrets.</span>' +
      '</div>';
  } else {
    sitesHtml =
      '<div class="space-y-3 mt-4">' +
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
    Object.keys(ACTIONS).map(function(actionKey) {
      var cfg      = ACTIONS[actionKey];
      var model    = cfg.odoo_model;
      var editor   = S.modelDefaultsEditors[model] || {};
      var saved    = S.modelDefaultsCache[model];  // undefined = not yet fetched, [] = fetched but empty
      var modelKey = model.replace(/\./g, '_');

      // ── Closed state: summary of saved defaults ──────────────────────
      var summaryHtml = '';
      if (!editor.open) {
        if (saved === undefined || saved === null) {
          summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Laden…</p>';
        } else if (saved.length === 0) {
          summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Geen standaarden opgeslagen.</p>';
        } else {
          summaryHtml =
            '<div class="flex flex-wrap gap-1.5 mt-2">' +
            saved.map(function(f) {
              return '<span class="badge badge-outline badge-sm">' +
                esc(f.label || f.name) +
                (f.required ? ' <span class="text-error">*</span>' : '') +
              '</span>';
            }).join('') +
            '</div>';
        }
      }

      // ── Open state: editable list + field picker ─────────────────────
      var editorHtml = '';
      if (editor.open) {
        var pending    = editor.pendingFields || [];
        var odooFields = S.odooFieldsCache[model] || [];

        var rowsHtml = pending.length === 0
          ? '<tr><td colspan="3" class="text-xs text-base-content/40 italic py-2">Leeg — wizard valt terug op ingebouwde defaults.</td></tr>'
          : pending.map(function(f, i) {
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
                  (odooFields.length > 0 ? odooFields.length + ' velden beschikbaar' : '<span class="loading loading-xs loading-spinner"></span> laden…') +
                '</span>' +
              '</label>' +
              (odooFields.length > 0
                ? renderFieldPicker('defaults-add-' + modelKey, '--unused--', odooFields, '')
                : '<div class="input input-bordered input-sm flex items-center gap-2 text-base-content/40"><span class="loading loading-spinner loading-xs"></span><span class="text-xs">Velden laden…</span></div>') +
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

  // Bind required-toggle checkboxes (change = update pendingFields in-memory, no re-render needed)
  el.querySelectorAll('.defaults-req-toggle').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var ed = S.modelDefaultsEditors[cb.dataset.model];
      if (ed && ed.pendingFields && ed.pendingFields[parseInt(cb.dataset.idx, 10)]) {
        ed.pendingFields[parseInt(cb.dataset.idx, 10)].required = cb.checked;
      }
    });
  });

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

  var allFields  = (S.wizard.form && S.wizard.form.fields) ? S.wizard.form.fields : [];
  var formFields = allFields.filter(function(f) { return !SKIP_TYPES.includes(f.type); });

  // Include sub-fields (e.g. address sub-fields stored in f.sub_fields array)
  var flatFields = [];
  formFields.forEach(function(f) {
    flatFields.push(f);
    if (Array.isArray(f.sub_fields)) {
      f.sub_fields.forEach(function(sf) {
        if (!SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
      });
    }
  });

  // Auto-fill name input once
  var nameInput = document.getElementById('wizardName');
  if (nameInput && !nameInput.value) {
    var sitePart = (S.wizard.site && S.wizard.site.label) ? S.wizard.site.label : 'Site';
    var formPart = (S.wizard.form && S.wizard.form.form_name) ? S.wizard.form.form_name : (S.wizard.form ? String(S.wizard.form.form_id) : 'Formulier');
    nameInput.value = sitePart + ' \u2014 ' + formPart + ' \u2014 ' + cfg.label;
  }

  var table = document.getElementById('wizardMappingTable');
  if (!table) return;

  var cachedFields = S.odooFieldsCache[cfg.odoo_model] || [];
  var fieldsLoaded = cachedFields.length > 0;

  // ── Build the Odoo field <select> for a form field row ────────────────────
  function buildOdooOpts(suggested) {
    var opts = '<option value="">\u2014 niet koppelen \u2014</option>';
    if (!fieldsLoaded) {
      opts += '<option disabled>\u2026 Odoo velden laden \u2026</option>';
    } else {
      opts += cachedFields.map(function(f) {
        var sel = (f.name === suggested) ? ' selected' : '';
        return '<option value="' + esc(f.name) + '"' + sel + '>' + esc(f.label || f.name) + ' (' + esc(f.name) + ')</option>';
      }).join('');
    }
    return opts;
  }

  // ── Placeholder chips for a template input ────────────────────────────────
  function placeholderChips(targetName) {
    if (!flatFields.length) return '';
    return '<div class="flex flex-wrap gap-1 mt-1.5 items-center">' +
      '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>' +
      flatFields.map(function(f) {
        var fid = String(f.field_id);
        return '<button type="button"' +
          ' class="badge badge-outline badge-xs cursor-pointer hover:badge-primary insert-placeholder font-mono"' +
          ' data-field="' + esc(fid) + '" data-target="' + esc(targetName) + '"' +
          ' title="' + esc(f.label || fid) + '">' +
          esc(fid) +
          '</button>';
      }).join('') +
    '</div>';
  }

  /**
   * Renders a type-aware value input for an "extra Odoo field" row or the add-form.
   * - boolean   → Ja/Nee select
   * - selection → dropdown with Odoo options
   * - many2one  → text input with numeric-ID hint
   * - others    → template text input with placeholder chips
   *
   * @param {string}      fieldName  - Odoo field name (empty = no field selected yet)
   * @param {string}      value      - Current / initial value
   * @param {string|null} nameAttr   - HTML name attribute value (null = omit)
   * @param {string}      idStr      - Extra HTML attrs, e.g. ' id="foo"'
   */
  function renderExtraValueInput(fieldName, value, nameAttr, idStr) {
    var meta  = fieldName
      ? ((cachedFields).find(function(f) { return f.name === fieldName; }) || null)
      : null;
    var ftype = (meta && meta.type) || '';
    idStr = idStr || '';

    // boolean & selection: delegate entirely to renderStaticInput
    if (ftype === 'boolean' || (ftype === 'selection' && meta && meta.selection && meta.selection.length)) {
      return renderStaticInput(nameAttr, meta, value, idStr);
    }

    // many2one: plain text input but with a hint about numeric IDs
    var nameA = nameAttr ? ' name="' + esc(nameAttr) + '"' : '';
    if (ftype === 'many2one') {
      return '<div>' +
        '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
          ' value="' + esc(value || '') + '"' +
          ' placeholder="Numeriek Odoo-record ID\u2026" />' +
        '<p class="text-xs text-base-content/40 mt-1">' +
          '<i data-lucide="info" class="w-3 h-3 inline -mt-0.5 mr-0.5"></i>' +
          'Geef het numerieke ID op van het gekoppelde record.' +
        '</p>' +
      '</div>';
    }

    // integer / float: numeric hint
    if (ftype === 'integer' || ftype === 'float') {
      return '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' type="number"' +
        ' value="' + esc(value || '') + '"' +
        ' placeholder="Getal\u2026" />';
    }

    // Default: template text input with placeholder chips
    // Extract the id value from idStr so we can pass the correct target to chips
    var idMatch = idStr.match(/id="([^"]+)"/);
    var chipTarget = idMatch ? idMatch[1] : null;
    return '<div>' +
      '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' value="' + esc(value || '') + '"' +
        ' placeholder="Vaste waarde of {veld-id} sjabloon\u2026" />' +
      (chipTarget ? placeholderChips(chipTarget) : '') +
    '</div>';
  }

  // ── Section 1: map form fields → Odoo fields ─────────────────────────────
  var formRows = flatFields.map(function(f) {
    var fid       = String(f.field_id);
    var suggested = suggestOdooField(fid, f.label || '', cfg.odoo_model);
    var isSubField = !formFields.find(function(pf) { return String(pf.field_id) === fid; });
    // Auto-check identifier when the suggested Odoo field looks like an email/key field
    var identifierFields = ['email', 'email_from', 'x_email', 'vat', 'ref'];
    var autoIdentifier = identifierFields.includes(suggested);
    return '<tr' + (isSubField ? ' class="bg-base-200/30"' : '') + '>' +
      '<td class="align-middle py-2">' +
        (isSubField ? '<span class="text-base-content/40 mr-1">↳</span>' : '') +
        '<span class="font-medium text-sm">' + esc(f.label || fid) + '</span>' +
        '<br><span class="font-mono text-xs text-base-content/40">' + esc(fid) + '</span>' +
      '</td>' +
      '<td class="py-1"><span class="badge badge-ghost badge-xs">' + esc(f.type || '') + '</span></td>' +
      '<td class="py-1.5 min-w-52">' +
        '<select class="select select-bordered select-sm w-full wizard-ff-select" name="ff-odoo-' + esc(fid) + '">' +
          buildOdooOpts(suggested) +
        '</select>' +
      '</td>' +
      '<td class="text-center py-2">' +
        '<input type="checkbox" class="checkbox checkbox-xs wizard-ff-id-check" ' +
          'name="ff-identifier-' + esc(fid) + '" ' +
          'title="Gebruik als identifier (record opzoeken / matchen)"' +
          (autoIdentifier ? ' checked' : '') +
        '>' +
      '</td>' +
    '</tr>';
  }).join('');

  // ── Section 2: extra static/template Odoo fields ─────────────────────────
  var extraRows = (S.wizard.extraMappings || []).map(function(em, idx) {
    var targetName = 'extra-static-' + idx;
    var meta = cachedFields.find(function(f) { return f.name === em.odooField; }) || null;
    var ftype = meta ? meta.type : '';
    var typeBadge = ftype
      ? ' <span class="badge badge-ghost badge-xs font-mono ml-1 align-middle">' + esc(ftype) + '</span>'
      : '';
    return '<tr class="bg-warning/5">' +
      '<td class="align-middle py-2 whitespace-nowrap">' +
        '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' + typeBadge +
        '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
      '</td>' +
      '<td class="py-2">' +
        renderExtraValueInput(em.odooField, em.staticValue || '', targetName, ' id="inp-' + esc(targetName) + '"') +
      '</td>' +
      '<td class="py-2 text-right">' +
        '<button type="button" class="btn btn-ghost btn-xs text-error" data-action="wizard-remove-extra-row" data-idx="' + idx + '" title="Verwijder">' +
          '<i data-lucide="x" class="w-3 h-3"></i>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  // ── Add extra row form ─────────────────────────────────────────────────────
  var addExtraHtml =
    '<div class="divider text-xs text-base-content/40 mt-4">Extra Odoo-veld toevoegen (vaste waarde / sjabloon)</div>' +
    '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1">' +
          '<span class="label-text text-xs">Odoo veld</span>' +
          '<span class="label-text-alt text-xs text-base-content/40">' +
            (fieldsLoaded ? cachedFields.length + ' velden beschikbaar' : '<span class="loading loading-xs loading-spinner"></span> laden\u2026') +
          '</span>' +
        '</label>' +
        renderFieldPicker('wizard-extra-add', '--unused--', cachedFields, '') +
      '</div>' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1"><span class="label-text text-xs">Waarde</span></label>' +
        '<div id="wizardExtraStaticWrap">' +
          renderExtraValueInput('', '', null, ' id="wizardExtraStaticValue"') +
        '</div>' +
      '</div>' +
      '<div class="pt-5">' +
        '<button type="button" class="btn btn-outline btn-sm w-full" data-action="wizard-add-extra-row">+ Voeg toe</button>' +
      '</div>' +
    '</div>';

  table.innerHTML =
    // ── Section 1 ──────────────────────────────────────────────────────────
    '<div class="mb-6">' +
      '<h4 class="font-semibold text-sm mb-3 flex items-center gap-2">' +
        '<i data-lucide="link" class="w-4 h-4 text-primary"></i>' +
        ' Formuliervelden koppelen aan Odoo' +
        (!fieldsLoaded ? ' <span class="loading loading-xs loading-spinner ml-1"></span>' : '') +
      '</h4>' +
      '<div class="overflow-x-auto">' +
        '<table class="table table-sm">' +
          '<thead><tr>' +
            '<th>Formulier veld</th><th>Type</th><th>Koppelen aan Odoo veld</th>' +
            '<th class="text-center" title="Vink aan welk veld gebruikt wordt om bestaande records op te zoeken">' +
              '<i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i>' +
            '</th>' +
          '</tr></thead>' +
          '<tbody>' +
            (flatFields.length
              ? formRows
              : '<tr><td colspan="4" class="text-sm text-base-content/40 italic py-3">Geen formuliervelden gevonden voor dit formulier.</td></tr>') +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<p class="text-xs text-base-content/40 mt-2">Rijen zonder geselecteerd Odoo veld worden genegeerd.</p>' +
    '</div>' +
    // ── Section 2 ──────────────────────────────────────────────────────────
    '<div>' +
      '<h4 class="font-semibold text-sm mb-2 flex items-center gap-2">' +
        '<i data-lucide="tag" class="w-4 h-4 text-warning"></i>' +
        ' Extra Odoo-velden met vaste waarde' +
      '</h4>' +
      ((S.wizard.extraMappings || []).length > 0
        ? '<div class="overflow-x-auto mb-3">' +
            '<table class="table table-sm">' +
              '<thead><tr><th>Odoo veld</th><th>Vaste waarde / sjabloon</th><th></th></tr></thead>' +
              '<tbody>' + extraRows + '</tbody>' +
            '</table>' +
          '</div>'
        : '') +
      addExtraHtml +
    '</div>';

  // Reactive: when the user picks an Odoo field in the add-extra form,
  // rebuild the value input to match the field type (boolean/selection/many2one/…)
  var fspExtraVal = document.getElementById('fsp-val-wizard-extra-add');
  if (fspExtraVal) {
    fspExtraVal.addEventListener('change', function() {
      var wrap = document.getElementById('wizardExtraStaticWrap');
      if (!wrap) return;
      var fieldName = fspExtraVal.value || '';
      wrap.innerHTML = renderExtraValueInput(fieldName, '', null, ' id="wizardExtraStaticValue"');
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    });
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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
    var wc = S.webhookConfig;
    var webhookBlock = '';
    if (wc && wc.webhook_url) {
      webhookBlock =
        '<div class="mt-4 pt-4 border-t border-base-200">' +
          '<p class="text-xs font-semibold text-base-content/60 mb-1.5 flex items-center gap-1.5">' +
            '<i data-lucide="webhook" class="w-3.5 h-3.5"></i> Webhook URL (plak in WordPress Forminator)' +
          '</p>' +
          '<div class="flex items-center gap-2">' +
            '<code class="flex-1 text-xs bg-base-200 rounded px-2 py-1.5 break-all select-all">' + esc(wc.webhook_url) + '</code>' +
            '<button type="button" class="btn btn-xs btn-ghost shrink-0" id="btnCopyWebhook" title="Kopi\u00ebren">' +
              '<i data-lucide="copy" class="w-3.5 h-3.5"></i>' +
            '</button>' +
          '</div>' +
        '</div>';
    } else if (wc && !wc.secret_configured) {
      webhookBlock =
        '<div class="alert alert-warning mt-4 py-2 text-xs">' +
          '<i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>' +
          '<span>Stel de Cloudflare secret <code>FORMINATOR_WEBHOOK_SECRET</code> in en deploy opnieuw.</span>' +
        '</div>';
    }
    headerEl.innerHTML =
      '<div class="card bg-base-100 shadow mb-6">' +
        '<div class="card-body p-6">' +
          '<div class="flex flex-wrap items-start justify-between gap-4">' +
            '<div class="min-w-0">' +
              '<h2 class="text-2xl font-bold mb-1 truncate">' + esc(integration.name || 'Integratie') + '</h2>' +
              '<p class="text-sm text-base-content/60 mb-2">Formulier: <span class="font-mono">' + esc(integration.forminator_form_id || '\u2014') + '</span></p>' +
              (actionCfg
                ? '<span class="badge ' + esc(actionCfg.badgeClass) + '">' + esc(actionCfg.label) + '</span>'
                : '') +
            '</div>' +
            '<label class="flex items-center gap-3 cursor-pointer">' +
              '<span class="font-semibold text-sm">' + (integration.is_active ? 'Actief' : 'Inactief') + '</span>' +
              '<input id="detailActiveToggle" type="checkbox" class="toggle toggle-success"' + (integration.is_active ? ' checked' : '') + '>' +
            '</label>' +
          '</div>' +
          webhookBlock +
          '<div id="detailTestStatus" class="mt-4 text-sm"></div>' +
        '</div>' +
      '</div>';

    // Copy webhook URL
    var copyBtn = document.getElementById('btnCopyWebhook');
    if (copyBtn && wc && wc.webhook_url) {
      copyBtn.addEventListener('click', function() {
        navigator.clipboard.writeText(wc.webhook_url).then(function() {
          showAlert('Webhook URL gekopi\u00eberd.', 'success');
        }).catch(function() {
          showAlert('Kopi\u00ebren mislukt \u2014 selecteer de URL handmatig.', 'warning');
        });
      });
    }

    var toggle = document.getElementById('detailActiveToggle');
    if (toggle) {
      toggle.addEventListener('change', function(e) {
        handleToggleActive(e.target.checked).catch(function(err) { showAlert(err.message, 'error'); });
      });
    }
  }

  updateDetailTestStatus();
  renderDetailMappings();
  renderDetailFormFields();
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

  var model     = firstTarget.odoo_model;
  var odooCache = S.odooFieldsCache[model] || [];
  var odooLoaded = odooCache.length > 0;

  // Build flat form fields list (including sub_fields)
  var rawFf = Array.isArray(S.detailFormFields) ? S.detailFormFields : [];
  var flatFields = [];
  rawFf.forEach(function(f) {
    if (!SKIP_TYPES.includes(f.type)) flatFields.push(f);
    if (Array.isArray(f.sub_fields)) {
      f.sub_fields.forEach(function(sf) {
        if (!SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
      });
    }
  });

  // Collect existing mappings from state
  var allMappings = [];
  targets.forEach(function(t) {
    var ms = (S.detail.mappingsByTarget && S.detail.mappingsByTarget[t.id]) || [];
    ms.forEach(function(m) { allMappings.push(Object.assign({}, m, { _targetId: t.id })); });
  });

  // Split: form mappings (source_type=form) vs extra (static/template/context)
  var formMappingsByField = {};
  var initialExtraRows = [];
  allMappings.forEach(function(m) {
    if (m.source_type === 'form') {
      formMappingsByField[m.source_value] = m;
    } else {
      initialExtraRows.push(m);
    }
  });

  // _extraRows is sticky within a session (survives re-renders when Odoo fields load)
  if (!S.detail._extraRows) {
    S.detail._extraRows = initialExtraRows.map(function(m) {
      var meta = odooCache.find(function(f) { return f.name === m.odoo_field; });
      return {
        odooField:    m.odoo_field,
        odooLabel:    (meta && meta.label) || m.odoo_field,
        staticValue:  m.source_value,
        sourceType:   m.source_type,
        isIdentifier: !!m.is_identifier,
        isUpdateField: m.is_update_field !== false,
      };
    });
  }

  // ── Local helpers ──────────────────────────────────────────────────────────
  function detBuildOdooOpts(suggested, preselected) {
    var sel = preselected || suggested || '';
    var opts = '<option value="">— niet koppelen —</option>';
    if (!odooLoaded) {
      opts += '<option disabled>… Odoo velden laden …</option>';
    } else {
      opts += odooCache.map(function(f) {
        var isSel = (f.name === sel) ? ' selected' : '';
        return '<option value="' + esc(f.name) + '"' + isSel + '>' + esc(f.label || f.name) + ' (' + esc(f.name) + ')</option>';
      }).join('');
    }
    return opts;
  }

  function detChips(targetId) {
    if (!flatFields.length) return '';
    return '<div class="flex flex-wrap gap-1 mt-1.5 items-center">' +
      '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>' +
      flatFields.map(function(f) {
        var fid = String(f.field_id);
        return '<button type="button" class="badge badge-outline badge-xs cursor-pointer hover:badge-primary insert-placeholder font-mono"' +
          ' data-field="' + esc(fid) + '" data-target="' + esc(targetId) + '"' +
          ' title="' + esc(f.label || fid) + '">' + esc(fid) + '</button>';
      }).join('') + '</div>';
  }

  function detValueInput(fieldName, value, nameAttr, idStr) {
    var meta  = fieldName ? (odooCache.find(function(f) { return f.name === fieldName; }) || null) : null;
    var ftype = (meta && meta.type) || '';
    idStr = idStr || '';
    if (ftype === 'boolean' || (ftype === 'selection' && meta && meta.selection && meta.selection.length)) {
      return renderStaticInput(nameAttr, meta, value, idStr);
    }
    var nameA = nameAttr ? ' name="' + esc(nameAttr) + '"' : '';
    if (ftype === 'many2one') {
      return '<div><input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' value="' + esc(value || '') + '" placeholder="Numeriek Odoo-record ID…" />' +
        '<p class="text-xs text-base-content/40 mt-1"><i data-lucide="info" class="w-3 h-3 inline -mt-0.5 mr-0.5"></i>Geef het numerieke ID op van het gekoppelde record.</p></div>';
    }
    if (ftype === 'integer' || ftype === 'float') {
      return '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' type="number" value="' + esc(value || '') + '" placeholder="Getal…" />';
    }
    var idMatch = idStr.match(/id="([^"]+)"/);
    var chipTarget = idMatch ? idMatch[1] : null;
    return '<div><input class="input input-bordered input-sm w-full"' + nameA + idStr +
      ' value="' + esc(value || '') + '" placeholder="Vaste waarde of {veld-id} sjabloon…" />' +
      (chipTarget ? detChips(chipTarget) : '') + '</div>';
  }

  // ── Section 1: form fields → Odoo field select + identifier/update checkboxes ─────
  var AUTO_IDENTIFIERS = ['email', 'email_from', 'x_email', 'vat', 'ref'];
  var formRowsHtml;
  if (flatFields.length === 0) {
    var ffMsg = (S.detailFormFields === null || S.detailFormFields === 'loading')
      ? 'Formuliervelden worden opgehaald\u2026'
      : 'Geen formuliervelden gevonden.';
    formRowsHtml = '<tr><td colspan="5" class="text-sm text-base-content/40 italic py-3">' + esc(ffMsg) + '</td></tr>';
  } else {
    formRowsHtml = flatFields.map(function(f) {
      var fid = String(f.field_id);
      var existing = formMappingsByField[fid] || null;
      var preselected = existing ? existing.odoo_field : null;
      var suggested = preselected || suggestOdooField(fid, f.label || '', model);
      var isIdentifier  = existing ? !!existing.is_identifier  : AUTO_IDENTIFIERS.includes(suggested);
      var isUpdateField = existing ? existing.is_update_field !== false : true;
      var isSubField = !rawFf.find(function(pf) { return String(pf.field_id) === fid; });
      return '<tr' + (isSubField ? ' class="bg-base-200/30"' : '') + '>' +
        '<td class="align-middle py-2">' +
          (isSubField ? '<span class="text-base-content/40 mr-1">\u21b3</span>' : '') +
          '<span class="font-medium text-sm">' + esc(f.label || fid) + '</span>' +
          '<br><span class="font-mono text-xs text-base-content/40">' + esc(fid) + '</span>' +
        '</td>' +
        '<td class="py-1"><span class="badge badge-ghost badge-xs">' + esc(f.type || '') + '</span></td>' +
        '<td class="py-1.5 min-w-52">' +
          '<select class="select select-bordered select-sm w-full detail-ff-select" name="det-ff-odoo-' + esc(fid) + '">' +
            detBuildOdooOpts(suggested, preselected) +
          '</select>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs detail-ff-id-check"' +
          ' name="det-identifier-' + esc(fid) + '"' +
          ' title="Identifier: gebruikt om bestaand record op te zoeken voor update"' +
          (isIdentifier ? ' checked' : '') + '>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs detail-ff-upd-check"' +
          ' name="det-update-' + esc(fid) + '"' +
          ' title="Bijwerken: schrijf dit veld ook bij updates (uitvinken = alleen bij aanmaken)"' +
          (isUpdateField ? ' checked' : '') + '>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // ── Section 2: extra static/template rows ─────────────────────────────────
  var extraRowsHtml = S.detail._extraRows.map(function(em, idx) {
    var tname = 'det-extra-' + idx;
    var meta = odooCache.find(function(f) { return f.name === em.odooField; }) || null;
    var ftype = meta ? meta.type : '';
    var typeBadge = ftype ? ' <span class="badge badge-ghost badge-xs font-mono ml-1">' + esc(ftype) + '</span>' : '';
    return '<tr class="bg-warning/5">' +
      '<td class="align-middle py-2 whitespace-nowrap">' +
        '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' + typeBadge +
        '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
      '</td>' +
      '<td class="py-1"><span class="badge badge-ghost badge-xs">vast/sjabloon</span></td>' +
      '<td class="py-1.5">' + detValueInput(em.odooField, em.staticValue || '', tname, ' id="det-inp-' + esc(tname) + '"') + '</td>' +
      '<td class="text-center py-2">' +
        '<input type="checkbox" class="checkbox checkbox-xs detail-extra-id-check"' +
        ' name="det-extra-identifier-' + idx + '"' +
        ' title="Identifier: gebruik als zoekcriterium"' +
        (em.isIdentifier ? ' checked' : '') + '>' +
      '</td>' +
      '<td class="text-center py-2">' +
        '<input type="checkbox" class="checkbox checkbox-xs detail-extra-upd-check"' +
        ' name="det-extra-update-' + idx + '"' +
        ' title="Bijwerken: schrijf dit veld ook bij updates"' +
        (em.isUpdateField !== false ? ' checked' : '') + '>' +
      '</td>' +
      '<td class="text-center py-2">' +
        '<button type="button" class="btn btn-ghost btn-xs text-error" data-action="detail-remove-extra-row" data-idx="' + idx + '" title="Verwijder">' +
          '<i data-lucide="x" class="w-3 h-3"></i></button>' +
      '</td>' +
    '</tr>';
  }).join('');

  var addExtraFooterRow =
    '<tr class="border-t-2 border-base-300">' +
      '<td class="py-2 min-w-40">' +
        renderFieldPicker('det-extra-add', '--unused--', odooCache, '') +
        '<span class="text-xs text-base-content/40 mt-0.5 block">' +
          (odooLoaded ? odooCache.length + ' velden beschikbaar' : '<span class="loading loading-xs loading-spinner inline-block"></span>') +
        '</span>' +
      '</td>' +
      '<td class="py-2 text-center"><span class="badge badge-ghost badge-xs">nieuw</span></td>' +
      '<td class="py-2 min-w-52">' +
        '<div id="detExtraStaticWrap">' + detValueInput('', '', null, ' id="detExtraStaticValue"') + '</div>' +
      '</td>' +
      '<td class="text-center py-2">' +
        '<input type="checkbox" id="detExtraIsIdentifier" class="checkbox checkbox-xs" title="Identifier: gebruik als zoekcriterium" />' +
      '</td>' +
      '<td class="text-center py-2">' +
        '<input type="checkbox" id="detExtraIsUpdateField" class="checkbox checkbox-xs" title="Bijwerken: schrijf ook bij updates" checked />' +
      '</td>' +
      '<td class="py-2 text-right">' +
        '<button type="button" class="btn btn-outline btn-xs" data-action="detail-add-extra-row">+ Voeg toe</button>' +
      '</td>' +
    '</tr>';

  container.innerHTML =
    '<div id="detailMappingEditor" data-target-id="' + esc(String(firstTarget.id)) + '">' +
      '<div class="mb-6">' +
        '<h4 class="font-semibold text-sm mb-3 flex items-center gap-2">' +
          '<i data-lucide="link" class="w-4 h-4 text-primary"></i> Formuliervelden koppelen aan Odoo' +
          (!odooLoaded ? ' <span class="loading loading-xs loading-spinner ml-1"></span>' : '') +
        '</h4>' +
        '<div class="overflow-x-auto">' +
          '<table class="table table-sm">' +
            '<thead><tr>' +
              '<th>Formulier veld</th><th>Type</th><th>Koppelen aan Odoo veld</th>' +
              '<th class="text-center" title="Identifier: gebruik als zoekcriterium bij record matching"><i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i></th>' +
              '<th class="text-center" title="Bijwerken: schrijf dit veld ook wanneer een bestaand record wordt bijgewerkt"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block"></i></th>' +
            '</tr></thead>' +
            '<tbody>' + formRowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="text-xs text-base-content/40 mt-2"><i data-lucide="key" class="w-3 h-3 inline -mt-0.5"></i> Identifier = record opzoeken. <i data-lucide="pencil" class="w-3 h-3 inline -mt-0.5"></i> Bijwerken = ook schrijven bij update (uitvinken = alleen bij aanmaken).</p>' +
      '</div>' +
      '<div>' +
        '<h4 class="font-semibold text-sm mb-2 flex items-center gap-2">' +
          '<i data-lucide="tag" class="w-4 h-4 text-warning"></i> Extra Odoo-velden met vaste waarde' +
        '</h4>' +
        '<div class="overflow-x-auto">' +
          '<table class="table table-sm">' +
            '<thead><tr>' +
              '<th>Odoo veld</th><th>Type</th><th>Waarde / sjabloon</th>' +
              '<th class="text-center" title="Identifier"><i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i></th>' +
              '<th class="text-center" title="Bijwerken bij update"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block"></i></th>' +
              '<th></th>' +
            '</tr></thead>' +
            '<tbody>' + (extraRowsHtml || '<tr><td colspan="6" class="text-xs text-base-content/40 italic py-2">Nog geen extra velden toegevoegd.</td></tr>') + '</tbody>' +
            '<tfoot>' + addExtraFooterRow + '</tfoot>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div class="mt-6 flex justify-end">' +
        '<button type="button" class="btn btn-primary" data-action="save-detail-mappings">' +
          '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Koppelingen opslaan' +
        '</button>' +
      '</div>' +
    '</div>';

  // Reactive: field picker for extra field changes → rebuild value input
  var fspDetExtraVal = document.getElementById('fsp-val-det-extra-add');
  if (fspDetExtraVal) {
    fspDetExtraVal.addEventListener('change', function() {
      var wrap = document.getElementById('detExtraStaticWrap');
      if (!wrap) return;
      wrap.innerHTML = detValueInput(fspDetExtraVal.value || '', '', null, ' id="detExtraStaticValue"');
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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

  // Build list of identifier mappings (source_type=form, is_identifier=true) across all targets
  var identifierFields = []; // [{source_value, odoo_field, label}]
  var targets = (S.detail && S.detail.targets) || [];
  targets.forEach(function(t) {
    var mappings = (S.detail.mappingsByTarget && S.detail.mappingsByTarget[t.id]) || [];
    mappings.forEach(function(m) {
      if (m.is_identifier && m.source_type === 'form') {
        var alreadyAdded = identifierFields.some(function(f) { return f.source_value === m.source_value; });
        if (!alreadyAdded) identifierFields.push({ source_value: String(m.source_value), odoo_field: m.odoo_field });
      }
    });
  });

  // Fuzzy form value lookup: normalise dashes/underscores, then try prefix match
  function normalizeKey(k) { return String(k || '').toLowerCase().replace(/[-_\s]+/g, '_'); }
  function lookupPayloadValue(payload, sourceValue) {
    if (!payload || !sourceValue) return '';
    var normSource = normalizeKey(sourceValue);
    var keys = Object.keys(payload);
    // 1. exact
    if (payload[sourceValue] !== undefined && payload[sourceValue] !== '') return String(payload[sourceValue]);
    // 2. normalised match (email-1 == email_1)
    var match = keys.find(function(k) { return normalizeKey(k) === normSource && payload[k]; });
    if (match) return String(payload[match]);
    // 3. prefix (email → email_1)
    var prefix = keys.find(function(k) { return normalizeKey(k).startsWith(normSource + '_') && payload[k]; });
    if (prefix) return String(payload[prefix]);
    return '';
  }

  // Parse source_payload once per submission
  function parsePayload(sub) {
    try { return JSON.parse(sub.source_payload || '{}'); } catch(e) { return {}; }
  }

  function submitterInfo(sub) {
    if (!identifierFields.length) return '';
    var payload = parsePayload(sub);
    var parts = identifierFields.map(function(f) {
      var val = lookupPayloadValue(payload, f.source_value);
      return val ? '<span class="font-medium">' + esc(val) + '</span>' : '';
    }).filter(Boolean);
    return parts.length ? parts.join(' &middot; ') : '<span class="text-base-content/30">onbekend</span>';
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

  // Sort: originals first, then replays under their parent
  var originals = S.submissions.filter(function(s) { return !s.replay_of_submission_id; });
  var replays   = S.submissions.filter(function(s) { return !!s.replay_of_submission_id; });
  var ordered = [];
  originals.forEach(function(orig) {
    ordered.push({ sub: orig, isReplay: false });
    replays.filter(function(r) { return r.replay_of_submission_id === orig.id; })
      .forEach(function(r) { ordered.push({ sub: r, isReplay: true }); });
  });
  // Any orphaned replays at the end
  replays.filter(function(r) { return !originals.find(function(o) { return o.id === r.replay_of_submission_id; }); })
    .forEach(function(r) { ordered.push({ sub: r, isReplay: true }); });

  var showIndiener = identifierFields.length > 0;

  function actionBadge(sub) {
    try {
      var ctx = JSON.parse(sub.resolved_context || '{}');
      var actions = ctx.target_actions || [];
      if (!actions.length) return '';
      var labels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt' };
      var colors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error' };
      return actions.map(function(a) {
        return '<span class="badge badge-xs ' + (colors[a.action] || 'badge-ghost') + ' ml-1">' + (labels[a.action] || esc(a.action)) + '</span>';
      }).join('');
    } catch(e) { return ''; }
  }

  el.innerHTML =
    '<div class="overflow-x-auto">' +
      '<table class="table table-xs">' +
        '<thead><tr><th>ID</th>' + (showIndiener ? '<th>Indiener</th>' : '') + '<th>Status</th><th>Fout</th><th>Aangemaakt</th><th>Actie</th></tr></thead>' +
        '<tbody>' +
        ordered.map(function(item) {
          var sub = item.sub;
          var isReplay = item.isReplay;
          var replayAllowed = !isReplay && ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(sub.status || ''));
          var errorCell = sub.last_error
            ? '<span class="text-xs text-error/80 font-mono" title="' + esc(sub.last_error) + '">' + esc(sub.last_error.slice(0, 60)) + (sub.last_error.length > 60 ? '\u2026' : '') + '</span>'
            : '<span class="text-base-content/30">—</span>';
          return '<tr' + (isReplay ? ' class="bg-success/5"' : '') + '>' +
            '<td class="font-mono text-xs">' +
              (isReplay ? '<span class="text-base-content/40 mr-1">↳</span>' : '') +
              esc(shortId(sub.id)) +
            '</td>' +
            (showIndiener ? '<td class="text-xs">' + submitterInfo(sub) + '</td>' : '') +
            '<td>' + statusBadge(sub.status) + actionBadge(sub) + '</td>' +
            '<td class="max-w-xs truncate">' + errorCell + '</td>' +
            '<td class="text-xs whitespace-nowrap">' + esc(fmt(sub.created_at)) + '</td>' +
            '<td>' + (replayAllowed
              ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '">Replay</button>'
              : '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table>' +
    '</div>';
}

function renderDetailFormFields() {
  var el = document.getElementById('detailFormFields');
  if (!el) return;

  var integration = S.detail && S.detail.integration;
  var siteKey     = integration && integration.site_key;

  if (!siteKey) {
    el.innerHTML =
      '<p class="text-sm text-base-content/60 py-2">' +
        '<i data-lucide="info" class="w-4 h-4 inline mr-1 -mt-0.5"></i>' +
        'Site-sleutel niet opgeslagen voor deze integratie — veldoverzicht niet beschikbaar. ' +
        'Nieuwe integraties bewaren de site-sleutel automatisch.' +
      '</p>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  if (S.detailFormFields === null) {
    el.innerHTML = '<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">' +
      '<span class="loading loading-spinner loading-xs"></span> Formuliervelden worden opgehaald\u2026</div>';
    return;
  }

  if (S.detailFormFields === 'loading') {
    el.innerHTML = '<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">' +
      '<span class="loading loading-spinner loading-xs"></span> Bezig met ophalen…</div>';
    return;
  }

  // Build lookup: formFieldId → odoo_field for mapped form fields
  var mappedLookup = {}; // formFieldId → [odoo_field, ...]
  var targets = (S.detail && S.detail.targets) || [];
  targets.forEach(function(t) {
    var mappings = (S.detail.mappingsByTarget && S.detail.mappingsByTarget[t.id]) || [];
    mappings.forEach(function(m) {
      if (m.source_type === 'form') {
        var key = String(m.source_value);
        if (!mappedLookup[key]) mappedLookup[key] = [];
        mappedLookup[key].push(m.odoo_field);
      }
    });
  });

  var fields = S.detailFormFields;
  if (!fields.length) {
    el.innerHTML = '<p class="text-sm text-base-content/60 py-2">Geen velden gevonden voor dit formulier.</p>';
    return;
  }

  el.innerHTML =
    '<div class="overflow-x-auto">' +
      '<table class="table table-xs">' +
        '<thead><tr>' +
          '<th>Veld-ID</th><th>Label</th><th>Type</th><th>Gekoppeld aan Odoo</th>' +
        '</tr></thead>' +
        '<tbody>' +
        fields.map(function(f) {
          var fid      = String(f.field_id || '');
          var coupled  = mappedLookup[fid];
          var badge    = coupled && coupled.length
            ? coupled.map(function(of_) {
                return '<span class="badge badge-success badge-xs font-mono">' + esc(of_) + '</span>';
              }).join(' ')
            : '<span class="text-base-content/30 text-xs">—</span>';
          return '<tr>' +
            '<td class="font-mono text-xs">' + esc(fid) + '</td>' +
            '<td class="text-sm">' + esc(f.label || f.field_id || '—') + '</td>' +
            '<td><span class="badge badge-outline badge-xs">' + esc(f.type || '—') + '</span></td>' +
            '<td>' + badge + '</td>' +
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
  S.wizard.extraMappings = S.wizard.extraMappings || [];
  renderWizard();
  var sec = document.getElementById('wizard-section-mapping');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Pre-fetch Odoo fields for this model (non-blocking); re-render mapping table when ready
  var actionCfg = ACTIONS[actionKey];
  if (actionCfg && (!S.odooFieldsCache[actionCfg.odoo_model] || !S.odooFieldsCache[actionCfg.odoo_model].length)) {
    loadOdooFieldsForModel(actionCfg.odoo_model).then(function() {
      if (S.wizard.action !== actionKey) return;
      // Re-render so the Odoo field selects are populated with actual options
      renderWizardMapping();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    });
  }
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
        site_key: S.wizard.site ? S.wizard.site.key : null,
      }),
    });
    var integrationId = intRes.data.id;

    // Step 2 — create resolver (only for actions that need one, e.g. webinar)
    if (cfg.resolver_type) {
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
    }

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

    // Step 4 — create mappings from form fields → Odoo fields
    var mappingSection = document.getElementById('wizard-section-mapping');
    var mappingPromises = [];
    var orderIdx = 0;

    // Iterate over all form fields (flat, including sub-fields) and read the Odoo field selects
    var allWizardFields = (S.wizard.form && S.wizard.form.fields) ? S.wizard.form.fields : [];
    var flatWizardFields = [];
    allWizardFields.forEach(function(f) {
      if (!SKIP_TYPES.includes(f.type)) flatWizardFields.push(f);
      if (Array.isArray(f.sub_fields)) {
        f.sub_fields.forEach(function(sf) {
          if (!SKIP_TYPES.includes(sf.type)) flatWizardFields.push(sf);
        });
      }
    });

    flatWizardFields.forEach(function(ff) {
      if (!mappingSection) return;
      var fid    = String(ff.field_id);
      // querySelector with attribute selector handles special chars in name safely:
      var selEl  = Array.from(mappingSection.querySelectorAll('select.wizard-ff-select')).find(function(el) {
        return el.getAttribute('name') === 'ff-odoo-' + fid;
      });
      var odooField = selEl ? (selEl.value || '') : '';
      if (!odooField) return; // not coupled → skip

      var idCheckEl = Array.from(mappingSection.querySelectorAll('input.wizard-ff-id-check')).find(function(el) {
        return el.getAttribute('name') === 'ff-identifier-' + fid;
      });
      var isIdentifier = idCheckEl ? idCheckEl.checked : false;

      mappingPromises.push(api('/targets/' + targetId + '/mappings', {
        method: 'POST',
        body: JSON.stringify({
          odoo_field:    odooField,
          source_type:   'form',
          source_value:  fid,
          is_required:   false,
          is_identifier: isIdentifier,
          order_index:   orderIdx++,
        }),
      }));
    });

    // Extra rows: always static / template values
    (S.wizard.extraMappings || []).forEach(function(em, idx) {
      var targetName = 'extra-static-' + idx;
      var inpEl = document.getElementById('inp-' + targetName);
      // Fallback to stored value if DOM not found (shouldn't happen normally)
      var staticVal = inpEl ? ((inpEl.value || '').trim()) : (em.staticValue || '');
      if (!staticVal) return;
      // Use source_type 'template' when placeholders like {field_id} are present
      var sourceType = /\{[^}]+\}/.test(staticVal) ? 'template' : 'static';
      mappingPromises.push(api('/targets/' + targetId + '/mappings', {
        method: 'POST',
        body: JSON.stringify({
          odoo_field:   em.odooField,
          source_type:  sourceType,
          source_value: staticVal,
          is_required:  false,
          order_index:  orderIdx++,
        }),
      }));
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
    S.detail._extraRows = null; // reset on each open so it rebuilds from saved mappings
    S.testStatus  = results[1].data;
    S.submissions = results[2].data || [];
    S.detailFormFields = null; // reset on each open
    // Fetch webhook config non-blocking (don't let it break the detail view)
    if (!S.webhookConfig) {
      api('/webhook-config').then(function(r) {
        S.webhookConfig = r.data || null;
        // Re-render header to show webhook URL
        if (S.activeId === id) renderDetail();
      }).catch(function() { /* webhook-config not critical */ });
    }
    // Auto-fetch form fields non-blocking — needed for mapping editor
    var detailIntegration = S.detail && S.detail.integration;
    var detailSiteKey = detailIntegration && detailIntegration.site_key;
    var detailFormId  = detailIntegration && detailIntegration.forminator_form_id;
    if (detailSiteKey && detailFormId) {
      fetchDetailFormFields(detailSiteKey, detailFormId).catch(function() {});
    }
    // Pre-fetch Odoo fields for the target model (non-blocking; re-renders add-mapping form when done)
    var detailTargets = (S.detail && S.detail.targets) ? S.detail.targets : [];
    if (detailTargets.length > 0 && detailTargets[0].odoo_model) {
      var detailModel = detailTargets[0].odoo_model;
      if (!S.odooFieldsCache[detailModel] || !S.odooFieldsCache[detailModel].length) {
        loadOdooFieldsForModel(detailModel).then(function() {
          if (S.activeId !== id) return;
          renderDetailMappings();
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        });
      }
    }
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
  var isRequired   = !!((form.querySelector('[name="is_required"]') || {}).checked);
  var isIdentifier  = !!((form.querySelector('[name="is_identifier"]') || {}).checked);

  if (!odooField || !sourceValue) {
    showAlert('Odoo veld en waarde zijn beide verplicht.', 'error');
    return;
  }

  await api('/targets/' + targetId + '/mappings', {
    method: 'POST',
    body: JSON.stringify({ odoo_field: odooField, source_type: sourceType, source_value: sourceValue, is_required: isRequired, is_identifier: isIdentifier, order_index: 0 }),
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

async function handleSaveMappings() {
  var editor = document.getElementById('detailMappingEditor');
  if (!editor) { showAlert('Editor niet gevonden.', 'error'); return; }
  var targetId = editor.dataset.targetId;
  if (!targetId) { showAlert('Geen doel gevonden.', 'error'); return; }

  var targets = (S.detail && S.detail.targets) ? S.detail.targets : [];
  var firstTarget = targets[0];
  var model = firstTarget ? firstTarget.odoo_model : '';

  var rawFf = Array.isArray(S.detailFormFields) ? S.detailFormFields : [];
  var flatFields = [];
  rawFf.forEach(function(f) {
    if (!SKIP_TYPES.includes(f.type)) flatFields.push(f);
    if (Array.isArray(f.sub_fields)) {
      f.sub_fields.forEach(function(sf) {
        if (!SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
      });
    }
  });

  var newMappings = [];
  var orderIdx = 0;
  flatFields.forEach(function(ff) {
    var fid = String(ff.field_id);
    var selEl = Array.from(editor.querySelectorAll('select.detail-ff-select')).find(function(el) {
      return el.getAttribute('name') === 'det-ff-odoo-' + fid;
    });
    var odooField = selEl ? (selEl.value || '') : '';
    if (!odooField) return;
    var idCheckEl = Array.from(editor.querySelectorAll('input.detail-ff-id-check')).find(function(el) {
      return el.getAttribute('name') === 'det-identifier-' + fid;
    });
    var updCheckEl = Array.from(editor.querySelectorAll('input.detail-ff-upd-check')).find(function(el) {
      return el.getAttribute('name') === 'det-update-' + fid;
    });
    var isIdentifier  = idCheckEl  ? idCheckEl.checked  : false;
    var isUpdateField = updCheckEl ? updCheckEl.checked : true;
    newMappings.push({ odoo_field: odooField, source_type: 'form', source_value: fid, is_identifier: isIdentifier, is_update_field: isUpdateField, is_required: false, order_index: orderIdx++ });
  });

  (S.detail._extraRows || []).forEach(function(em, idx) {
    var inpEl = document.getElementById('det-inp-det-extra-' + idx);
    var val = inpEl ? (inpEl.value || '').trim() : (em.staticValue || '');
    if (!val) return;
    var sourceType = /\{[^}]+\}/.test(val) ? 'template' : 'static';
    var extraIdChk = editor.querySelector('input[name="det-extra-identifier-' + idx + '"]');
    var extraUpdChk = editor.querySelector('input[name="det-extra-update-' + idx + '"]');
    var extraIsIdentifier  = extraIdChk  ? extraIdChk.checked  : false;
    var extraIsUpdateField = extraUpdChk ? extraUpdChk.checked : true;
    newMappings.push({ odoo_field: em.odooField, source_type: sourceType, source_value: val, is_identifier: extraIsIdentifier, is_update_field: extraIsUpdateField, is_required: false, order_index: orderIdx++ });
  });

  await api('/targets/' + targetId + '/mappings', { method: 'DELETE' });
  await Promise.all(newMappings.map(function(m) {
    return api('/targets/' + targetId + '/mappings', { method: 'POST', body: JSON.stringify(m) });
  }));

  showAlert('Koppelingen opgeslagen.', 'success');
  S.detail._extraRows = null;
  await openDetail(S.activeId);
}

async function handleToggleIdentifier(mappingId) {
  // find mapping in state
  var m = null;
  if (S.detail && S.detail.mappingsByTarget) {
    Object.values(S.detail.mappingsByTarget).forEach(function(list) {
      list.forEach(function(x) { if (x.id === mappingId) m = x; });
    });
  }
  if (!m) return;
  await api('/mappings/' + mappingId, {
    method: 'PUT',
    body: JSON.stringify({
      odoo_field:    m.odoo_field,
      source_type:   m.source_type,
      source_value:  m.source_value,
      is_required:   m.is_required,
      is_identifier: !m.is_identifier,
      order_index:   m.order_index || 0,
    }),
  });
  await openDetail(S.activeId);
}

async function fetchDetailFormFields(sk, fid) {
  S.detailFormFields = 'loading';
  renderDetailFormFields();
  renderDetailMappings();
  try {
    var ffBody = await api('/forminator/forms?site=' + encodeURIComponent(sk));
    var ffForms = ffBody.data || [];
    var ffMatch = ffForms.find(function(f) { return String(f.form_id) === String(fid); });
    S.detailFormFields = ffMatch && ffMatch.fields ? ffMatch.fields : [];
  } catch (e) {
    S.detailFormFields = [];
    showAlert('Formuliervelden ophalen mislukt: ' + e.message, 'error');
  }
  renderDetailFormFields();
  renderDetailMappings();
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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
  // ── Custom field picker ──────────────────────────────────────────────────
  var fspTrigger = event.target.closest('.fsp-trigger');
  var fspItem    = event.target.closest('.fsp-item');
  if (fspTrigger) {
    var fspId = fspTrigger.dataset.fspId;
    var panel = document.getElementById('fsp-panel-' + fspId);
    if (panel) {
      var isOpen = !panel.classList.contains('hidden');
      closeAllFspPanels();
      if (!isOpen) {
        panel.classList.remove('hidden');
        var srch = panel.querySelector('.fsp-search');
        if (srch) { srch.value = ''; filterFspList(fspId, ''); srch.focus(); }
      }
    }
    return;
  }
  if (fspItem) {
    selectFspItem(fspItem.dataset.fspId, fspItem.dataset.fspName || '', fspItem.dataset.fspLabel || '');
    return;
  }
  if (!event.target.closest('.fsp-wrap')) closeAllFspPanels();

  // ── Insert placeholder chips ─────────────────────────────────────────────
  var phChip = event.target.closest('.insert-placeholder');
  if (phChip) {
    var fieldToken = '{' + (phChip.dataset.field || '') + '}';
    var targetId2  = phChip.dataset.target;
    var targetEl   = targetId2 ? document.getElementById(targetId2) : null;
    if (targetEl && (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA')) {
      var start = targetEl.selectionStart || 0;
      var end   = targetEl.selectionEnd   || 0;
      var val   = targetEl.value || '';
      targetEl.value = val.slice(0, start) + fieldToken + val.slice(end);
      var newPos = start + fieldToken.length;
      targetEl.setSelectionRange(newPos, newPos);
      targetEl.focus();
    }
    return;
  }
  // ── data-action delegation ───────────────────────────────────────────────
  var btn = event.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;

  var run = async function() {
    if (action === 'goto-connections') {
      showView('connections');
      renderConnections();
      return;
    }
    if (action === 'goto-defaults') {
      showView('defaults');
      renderDefaults();
      // Pre-load Odoo fields for all action models (non-blocking, for the field picker)
      Object.keys(ACTIONS).forEach(function(key) {
        var m = ACTIONS[key].odoo_model;
        if (!S.odooFieldsCache[m] || !S.odooFieldsCache[m].length) {
          loadOdooFieldsForModel(m).then(function() { if (S.view === 'defaults') renderDefaults(); });
        }
      });
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
    if (action === 'toggle-identifier') {
      await handleToggleIdentifier(btn.dataset.id);
      return;
    }
    if (action === 'replay-submission') {
      await handleReplay(btn.dataset.id);
      return;
    }
    if (action === 'save-detail-mappings') {
      await handleSaveMappings();
      return;
    }
    if (action === 'detail-add-extra-row') {
      var detFieldInput = document.getElementById('fsp-val-det-extra-add');
      var detExtraStatic = document.getElementById('detExtraStaticValue');
      var detFieldName = detFieldInput ? detFieldInput.value.trim() : '';
      if (!detFieldName) { showAlert('Kies een Odoo veld uit de lijst.', 'error'); return; }
      var detModel = S.detail && S.detail.targets && S.detail.targets[0] ? S.detail.targets[0].odoo_model : '';
      var detCached = S.odooFieldsCache[detModel] || [];
      var detMatched = detCached.find(function(f) { return f.name === detFieldName; });
      var detIsIdentifier  = !!(document.getElementById('detExtraIsIdentifier')  || {}).checked;
      var detIsUpdateField = (document.getElementById('detExtraIsUpdateField') || { checked: true }).checked;
      S.detail._extraRows = S.detail._extraRows || [];
      S.detail._extraRows.push({
        odooField:    detFieldName,
        odooLabel:    detMatched ? detMatched.label : detFieldName,
        staticValue:  detExtraStatic ? detExtraStatic.value.trim() : '',
        sourceType:   'static',
        isIdentifier: detIsIdentifier,
        isUpdateField: detIsUpdateField,
      });
      renderDetailMappings();
      return;
    }
    if (action === 'detail-remove-extra-row') {
      var detRemIdx = parseInt(btn.dataset.idx, 10);
      if (!isNaN(detRemIdx) && S.detail && S.detail._extraRows) {
        S.detail._extraRows.splice(detRemIdx, 1);
        renderDetailMappings();
      }
      return;
    }
    if (action === 'fetch-form-fields') {
      var integration2 = S.detail && S.detail.integration;
      var sk2 = integration2 && integration2.site_key;
      var fid2 = integration2 && integration2.forminator_form_id;
      if (!sk2 || !fid2) return;
      await fetchDetailFormFields(sk2, fid2);
      return;
    }
    if (action === 'toggle-model-defaults') {
      var mdModel = btn.dataset.model;
      var mdEd    = S.modelDefaultsEditors[mdModel] || { open: false, pendingFields: [] };
      if (!mdEd.open) {
        var saved2 = S.modelDefaultsCache[mdModel] || [];
        mdEd.pendingFields = saved2.map(function(f) { return Object.assign({}, f); });
        mdEd.open = true;
        S.modelDefaultsEditors[mdModel] = mdEd;
        renderDefaults();
        // Load Odoo fields if not yet cached
        if (!S.odooFieldsCache[mdModel] || !S.odooFieldsCache[mdModel].length) {
          loadOdooFieldsForModel(mdModel).then(function() { if (S.view === 'defaults') renderDefaults(); });
        }
      } else {
        mdEd.open = false;
        S.modelDefaultsEditors[mdModel] = mdEd;
        renderDefaults();
      }
      return;
    }
    if (action === 'add-default-field') {
      var addModel  = btn.dataset.model;
      var addMKey   = addModel.replace(/\./g, '_');
      var fspValEl  = document.getElementById('fsp-val-defaults-add-' + addMKey);
      var reqCbEl   = document.getElementById('defaults-new-req-' + addMKey);
      var addName   = fspValEl ? fspValEl.value.trim() : '';
      if (!addName) { showAlert('Kies een Odoo veld.', 'error'); return; }
      var allF      = S.odooFieldsCache[addModel] || [];
      var matchF    = allF.find(function(f) { return f.name === addName; });
      var addEd     = S.modelDefaultsEditors[addModel] || { open: true, pendingFields: [] };
      if (addEd.pendingFields.find(function(f) { return f.name === addName; })) {
        showAlert('Veld "' + addName + '" staat al in de lijst.', 'warning');
        return;
      }
      addEd.pendingFields.push({
        name:        addName,
        label:       matchF ? matchF.label : addName,
        required:    reqCbEl ? reqCbEl.checked : false,
        order_index: addEd.pendingFields.length,
      });
      S.modelDefaultsEditors[addModel] = addEd;
      renderDefaults();
      return;
    }
    if (action === 'remove-default-field') {
      var rmModel = btn.dataset.model;
      var rmIdx   = parseInt(btn.dataset.idx, 10);
      var rmEd    = S.modelDefaultsEditors[rmModel];
      if (rmEd && !isNaN(rmIdx)) {
        rmEd.pendingFields.splice(rmIdx, 1);
        renderDefaults();
      }
      return;
    }
    if (action === 'save-model-defaults') {
      var saveModel  = btn.dataset.model;
      var saveEd     = S.modelDefaultsEditors[saveModel];
      if (!saveEd) return;
      var saveFields = (saveEd.pendingFields || []).map(function(f, i) {
        return { name: f.name, label: f.label, required: !!f.required, order_index: i };
      });
      await api('/settings/model-defaults', {
        method: 'PUT',
        body: JSON.stringify({ model: saveModel, fields: saveFields }),
      });
      S.modelDefaultsCache[saveModel]  = saveFields;
      S.modelDefaultsEditors[saveModel] = { open: false, pendingFields: [] };
      showAlert('Standaard velden opgeslagen.', 'success');
      renderDefaults();
      return;
    }
    if (action === 'wizard-add-extra-row') {
      var fieldInput  = document.getElementById('fsp-val-wizard-extra-add');
      var extraStatic = document.getElementById('wizardExtraStaticValue');
      var fieldName   = fieldInput ? fieldInput.value.trim() : '';
      if (!fieldName) { showAlert('Kies een Odoo veld uit de lijst.', 'error'); return; }
      var actionCfg2 = ACTIONS[S.wizard.action];
      var cached2    = actionCfg2 ? (S.odooFieldsCache[actionCfg2.odoo_model] || []) : [];
      var matched    = cached2.find(function(f) { return f.name === fieldName; });
      S.wizard.extraMappings = S.wizard.extraMappings || [];
      S.wizard.extraMappings.push({
        odooField:   fieldName,
        odooLabel:   matched ? matched.label : fieldName,
        staticValue: extraStatic ? extraStatic.value.trim() : '',
      });
      renderWizard();
      return;
    }
    if (action === 'wizard-remove-extra-row') {
      var removeIdx = parseInt(btn.dataset.idx, 10);
      if (!isNaN(removeIdx) && S.wizard.extraMappings) {
        // Persist any changed input values before splicing
        S.wizard.extraMappings.forEach(function(em, i) {
          var inpEl = document.getElementById('inp-extra-static-' + i);
          if (inpEl) em.staticValue = (inpEl.value || '').trim();
        });
        S.wizard.extraMappings.splice(removeIdx, 1);
        renderWizard();
      }
      return;
    }
  };

  run().catch(function(err) { showAlert(err.message, 'error'); });
});

// Filter field picker list on search input
document.addEventListener('input', function(event) {
  var srch = event.target.closest('.fsp-search');
  if (!srch) return;
  filterFspList(srch.dataset.fspId, srch.value);
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════
async function bootstrap() {
  try {
    await Promise.all(
      [loadSites(), loadIntegrations()].concat(
        Object.keys(ACTIONS).map(function(key) {
          return loadModelDefaultsForModel(ACTIONS[key].odoo_model);
        })
      )
    );
    showView('list');
    renderList();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

bootstrap();

})();
`;
