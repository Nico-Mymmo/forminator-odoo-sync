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
  if (valEl)  valEl.value = name;
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

  // ── Standaard veldmapping per model ────────────────────────────────────
  var defaultsSectionHtml =
    '<div class="divider mt-10">Standaard veldmapping</div>' +
    '<p class="text-sm text-base-content/60 mb-5">Stel per Odoo model in welke velden standaard als rijen verschijnen in de wizard. Leeg = gebruik de ingebouwde veldlijst.</p>' +
    '<div class="space-y-4">' +
    Object.keys(ACTIONS).map(function(actionKey) {
      var cfg    = ACTIONS[actionKey];
      var model  = cfg.odoo_model;
      var editor = S.modelDefaultsEditors[model] || {};
      var saved  = S.modelDefaultsCache[model];  // undefined = not yet fetched, [] = fetched but empty
      var modelKey = model.replace(/\./g, '_');

      // ── Closed state: summary of saved defaults ──────────────────────
      var summaryHtml = '';
      if (!editor.open) {
        if (saved === undefined || saved === null) {
          summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Laden…</p>';
        } else if (saved.length === 0) {
          summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Geen aangepaste standaarden — wizard gebruikt ingebouwde veldlijst.</p>';
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

  el.innerHTML = sitesHtml + defaultsSectionHtml;

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

  // Auto-fill name input once
  var nameInput = document.getElementById('wizardName');
  if (nameInput && !nameInput.value) {
    var sitePart = (S.wizard.site && S.wizard.site.label) ? S.wizard.site.label : 'Site';
    var formPart = (S.wizard.form && S.wizard.form.form_name) ? S.wizard.form.form_name : (S.wizard.form ? String(S.wizard.form.form_id) : 'Formulier');
    nameInput.value = sitePart + ' \u2014 ' + formPart + ' \u2014 ' + cfg.label;
  }

  var table = document.getElementById('wizardMappingTable');
  if (!table) return;

  function buildFormOpts(selectedId) {
    return '<option value="">\u2014 niet koppelen \u2014</option>' +
      formFields.map(function(f) {
        var id  = String(f.field_id);
        var lbl = String(f.label || f.field_id);
        var sel = (id === selectedId) ? ' selected' : '';
        return '<option value="' + esc(id) + '"' + sel + '>' + esc(lbl) + ' [' + esc(id) + ']</option>';
      }).join('');
  }

  // Default field rows (from Supabase model defaults, or hardcoded ACTIONS fallback)
  var defaultFieldDefs = getDefaultFieldsForAction(S.wizard.action);
  var defaultRows = defaultFieldDefs.map(function(of_) {
    var suggested = suggestFormField(of_.field, formFields);
    return '<tr>' +
      '<td class="align-middle py-3">' +
        '<span class="font-medium text-sm">' + esc(of_.label) + '</span>' +
        (of_.required ? ' <span class="badge badge-error badge-xs">verplicht</span>' : '') +
        '<br><span class="font-mono text-xs text-base-content/40">' + esc(of_.field) + '</span>' +
      '</td>' +
      '<td class="py-2">' +
        '<select class="select select-bordered select-sm w-full" name="map-form-' + esc(of_.field) + '">' +
          buildFormOpts(suggested) +
        '</select>' +
      '</td>' +
      '<td class="py-2">' +
        '<input class="input input-bordered input-sm w-full" name="map-static-' + esc(of_.field) + '" placeholder="Vaste waarde..." />' +
      '</td>' +
      '<td></td>' +
    '</tr>';
  }).join('');

  // Extra rows added by the user
  var extraRows = (S.wizard.extraMappings || []).map(function(em, idx) {
    return '<tr class="bg-base-200/40">' +
      '<td class="align-middle py-3">' +
        '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' +
        '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
      '</td>' +
      '<td class="py-2">' +
        '<select class="select select-bordered select-sm w-full" name="extra-form-' + idx + '">' +
          buildFormOpts(em.formField || '') +
        '</select>' +
      '</td>' +
      '<td class="py-2">' +
        '<input class="input input-bordered input-sm w-full" name="extra-static-' + idx + '" value="' + esc(em.staticValue || '') + '" placeholder="Vaste waarde..." />' +
      '</td>' +
      '<td class="py-2">' +
        '<button type="button" class="btn btn-ghost btn-xs text-error" data-action="wizard-remove-extra-row" data-idx="' + idx + '" title="Verwijder">' +
          '<i data-lucide="x" class="w-3 h-3"></i>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  // Odoo fields datalist (from cache; populated async if empty)
  var cachedFields = S.odooFieldsCache[cfg.odoo_model] || [];
  var datalistHtml =
    '<datalist id="wizardOdooFieldsList">' +
      cachedFields.map(function(f) {
        return '<option value="' + esc(f.name) + '">' + esc(f.label) + ' [' + esc(f.type) + ']</option>';
      }).join('') +
    '</datalist>';

  var addExtraHtml =
    '<div class="divider text-xs text-base-content/40 mt-2">Extra Odoo-veld toevoegen</div>' +
    datalistHtml +
    '<div class="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1">' +
          '<span class="label-text text-xs">Odoo veld</span>' +
          '<span id="wizardOdooFieldsCount" class="label-text-alt text-xs text-base-content/40">' +
            (cachedFields.length > 0 ? cachedFields.length + ' velden' : 'laden\u2026') +
          '</span>' +
        '</label>' +
        '<input id="wizardExtraOdooField" list="wizardOdooFieldsList" class="input input-bordered input-sm" placeholder="bv. x_mijn_veld" autocomplete="off" />' +
      '</div>' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1"><span class="label-text text-xs">Formulier veld</span></label>' +
        '<select id="wizardExtraFormField" class="select select-bordered select-sm">' +
          '<option value="">\u2014 niet koppelen \u2014</option>' +
          formFields.map(function(f) {
            return '<option value="' + esc(String(f.field_id)) + '">' + esc(String(f.label || f.field_id)) + ' [' + esc(String(f.field_id)) + ']</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="form-control">' +
        '<label class="label py-0 pb-1"><span class="label-text text-xs">Of vaste waarde</span></label>' +
        '<input id="wizardExtraStaticValue" class="input input-bordered input-sm" placeholder="Vaste waarde..." />' +
      '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" data-action="wizard-add-extra-row">+ Voeg toe</button>' +
    '</div>';

  table.innerHTML =
    '<div class="overflow-x-auto">' +
      '<table class="table">' +
        '<thead><tr>' +
          '<th>Odoo veld</th><th>Formulier veld</th><th>Of vaste waarde</th><th></th>' +
        '</tr></thead>' +
        '<tbody>' + defaultRows + extraRows + '</tbody>' +
      '</table>' +
    '</div>' +
    addExtraHtml +
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
        (function() {
          var targets2  = (S.detail && S.detail.targets) ? S.detail.targets : [];
          var model2    = targets2.length > 0 ? targets2[0].odoo_model : null;
          var detFields = model2 ? (S.odooFieldsCache[model2] || []) : [];
          return renderFieldPicker('detail-odoo-field', 'odoo_field', detFields, '');
        })() +
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
  S.wizard.extraMappings = S.wizard.extraMappings || [];
  renderWizard();
  var sec = document.getElementById('wizard-section-mapping');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Pre-fetch Odoo fields for this model (non-blocking, populates datalist)
  var actionCfg = ACTIONS[actionKey];
  if (actionCfg && !S.odooFieldsCache[actionCfg.odoo_model]) {
    loadOdooFieldsForModel(actionCfg.odoo_model).then(function() {
      if (S.wizard.action !== actionKey) return;
      var dl = document.getElementById('wizardOdooFieldsList');
      var counter = document.getElementById('wizardOdooFieldsCount');
      var fields = S.odooFieldsCache[actionCfg.odoo_model] || [];
      if (dl) {
        dl.innerHTML = fields.map(function(f) {
          return '<option value="' + esc(f.name) + '">' + esc(f.label) + ' [' + esc(f.type) + ']</option>';
        }).join('');
      }
      if (counter) counter.textContent = fields.length + ' velden';
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

    // Also process extra rows added by the user
    (S.wizard.extraMappings || []).forEach(function(em, idx) {
      var formSel   = mappingSection ? mappingSection.querySelector('[name="extra-form-' + idx + '"]') : null;
      var staticInp = mappingSection ? mappingSection.querySelector('[name="extra-static-' + idx + '"]') : null;
      var formVal   = formSel   ? (formSel.value   || '') : '';
      var staticVal = staticInp ? ((staticInp.value || '').trim()) : '';
      if (formVal) {
        mappingPromises.push(api('/targets/' + targetId + '/mappings', {
          method: 'POST',
          body: JSON.stringify({
            odoo_field:   em.odooField,
            source_type:  'form',
            source_value: formVal,
            is_required:  false,
            order_index:  orderIdx++,
          }),
        }));
      } else if (staticVal) {
        mappingPromises.push(api('/targets/' + targetId + '/mappings', {
          method: 'POST',
          body: JSON.stringify({
            odoo_field:   em.odooField,
            source_type:  'static',
            source_value: staticVal,
            is_required:  false,
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
  // ── data-action delegation ───────────────────────────────────────────────
  var btn = event.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;

  var run = async function() {
    if (action === 'goto-connections') {
      showView('connections');
      renderConnections();
      // Pre-load Odoo fields for all action models (non-blocking, for the defaults editor)
      Object.keys(ACTIONS).forEach(function(key) {
        var m = ACTIONS[key].odoo_model;
        if (!S.odooFieldsCache[m] || !S.odooFieldsCache[m].length) {
          loadOdooFieldsForModel(m).then(function() { if (S.view === 'connections') renderConnections(); });
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
    if (action === 'toggle-model-defaults') {
      var mdModel = btn.dataset.model;
      var mdEd    = S.modelDefaultsEditors[mdModel] || { open: false, pendingFields: [] };
      if (!mdEd.open) {
        var saved2 = S.modelDefaultsCache[mdModel] || [];
        mdEd.pendingFields = saved2.map(function(f) { return Object.assign({}, f); });
        mdEd.open = true;
        S.modelDefaultsEditors[mdModel] = mdEd;
        renderConnections();
        // Load Odoo fields if not yet cached
        if (!S.odooFieldsCache[mdModel] || !S.odooFieldsCache[mdModel].length) {
          loadOdooFieldsForModel(mdModel).then(function() { if (S.view === 'connections') renderConnections(); });
        }
      } else {
        mdEd.open = false;
        S.modelDefaultsEditors[mdModel] = mdEd;
        renderConnections();
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
      renderConnections();
      return;
    }
    if (action === 'remove-default-field') {
      var rmModel = btn.dataset.model;
      var rmIdx   = parseInt(btn.dataset.idx, 10);
      var rmEd    = S.modelDefaultsEditors[rmModel];
      if (rmEd && !isNaN(rmIdx)) {
        rmEd.pendingFields.splice(rmIdx, 1);
        renderConnections();
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
      renderConnections();
      return;
    }
    if (action === 'wizard-add-extra-row') {
      var fieldInput  = document.getElementById('fsp-val-wizard-extra-add');
      var extraForm   = document.getElementById('wizardExtraFormField');
      var extraStatic = document.getElementById('wizardExtraStaticValue');
      var fieldName   = fieldInput ? fieldInput.value.trim() : '';
      if (!fieldName) { showAlert('Kies of typ een Odoo veldnaam.', 'error'); return; }
      var actionCfg2 = ACTIONS[S.wizard.action];
      var cached2    = actionCfg2 ? (S.odooFieldsCache[actionCfg2.odoo_model] || []) : [];
      var matched    = cached2.find(function(f) { return f.name === fieldName; });
      S.wizard.extraMappings = S.wizard.extraMappings || [];
      S.wizard.extraMappings.push({
        odooField:   fieldName,
        odooLabel:   matched ? matched.label : fieldName,
        formField:   extraForm   ? extraForm.value   : '',
        staticValue: extraStatic ? extraStatic.value.trim() : '',
      });
      renderWizard();
      return;
    }
    if (action === 'wizard-remove-extra-row') {
      var removeIdx = parseInt(btn.dataset.idx, 10);
      if (!isNaN(removeIdx) && S.wizard.extraMappings) {
        // Persist any changed select/input values before splicing
        var mappingSec = document.getElementById('wizard-section-mapping');
        if (mappingSec) {
          S.wizard.extraMappings.forEach(function(em, i) {
            var fs = mappingSec.querySelector('[name="extra-form-'   + i + '"]');
            var si = mappingSec.querySelector('[name="extra-static-' + i + '"]');
            if (fs) em.formField   = fs.value;
            if (si) em.staticValue = (si.value || '').trim();
          });
        }
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
