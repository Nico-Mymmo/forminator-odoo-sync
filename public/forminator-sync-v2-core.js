/**
 * Forminator Sync V2 \u2014 Core
 *
 * Defines window.FSV2 with: SKIP_TYPES, S (state), utilities,
 * auto-suggest logic, Odoo field/model cache loaders, getModelCfg,
 * renderList, renderConnections, renderDefaults, loadSites, loadIntegrations.
 *
 * Dependencies: field-picker-component.js (OpenVME.FieldPicker)
 */
(function () {
  'use strict';


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
    modelDefaultsEditors: {}, // model → {open, pendingFields}
    modelFixedEditors: {},    // model → {open, pendingFixed: [{name,label,value}]}
    modelIdentifierEditors: {}, // model → {open, pendingIdentifier: [{name,label}]}
    modelLinksCache: [],      // [{model_a, model_b, link_field, link_label}]
    odooModelsCache: [],      // [{name, label, icon, default_fields, identifier_type, update_policy, resolver_type}]
    editingModelIdx: null,    // index of model row currently being edited (or null)
    editingLinkIdx:  null,    // index of link row currently being edited (or null)
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
    var delay = type === 'error' ? 8000 : 4000;

    var wrap = document.getElementById('fsv2-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'fsv2-toast-wrap';
      wrap.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column-reverse;gap:0.5rem;pointer-events:none;max-width:22rem;width:calc(100vw - 3rem)';
      document.body.appendChild(wrap);
    }

    var toast = document.createElement('div');
    // DaisyUI semantische kleurvariabelen: --su/--er/--wa/--in (oklch-componenten)
    var colors = {
      success: { border: 'oklch(var(--su))', icon: 'oklch(var(--su))', path: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' },
      error:   { border: 'oklch(var(--er))', icon: 'oklch(var(--er))', path: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' },
      warning: { border: 'oklch(var(--wa))', icon: 'oklch(var(--wa))', path: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
      info:    { border: 'oklch(var(--in))', icon: 'oklch(var(--in))', path: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
    };
    var c = colors[type] || colors.info;

    toast.setAttribute('data-fsv2-toast', '1');
    toast.style.cssText = [
      'display:flex', 'align-items:flex-start', 'gap:0.625rem',
      'background:oklch(var(--b1))',
      'border:1px solid oklch(var(--bc)/0.15)',
      'border-left:4px solid ' + c.border,
      'border-radius:0.625rem',
      'padding:0.75rem 1rem',
      'box-shadow:0 4px 16px oklch(var(--bc)/0.08)',
      'pointer-events:auto',
      'font-size:0.875rem', 'line-height:1.45',
      'color:oklch(var(--bc))',
      'transform:translateX(110%)',
      'transition:transform 0.25s cubic-bezier(.4,0,.2,1),opacity 0.25s',
      'opacity:0',
    ].join(';');

    toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px">${c.path}</svg><span style="flex:1">${esc(message)}</span><button style="background:none;border:none;cursor:pointer;padding:0 0 0 0.25rem;color:oklch(var(--bc)/0.4);font-size:1.1rem;line-height:1;flex-shrink:0;margin-top:-1px" onclick="var t=this.closest('[data-fsv2-toast]');t.style.opacity='0';t.style.transform='translateX(110%)';setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t)},280)">&#215;</button>`;

    wrap.appendChild(toast);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity   = '1';
      });
    });

    function dismiss(el) {
      el.style.transform = 'translateX(110%)';
      el.style.opacity   = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
    }
    var timer = setTimeout(function () { dismiss(toast); }, delay);
    toast.addEventListener('mouseenter', function () { clearTimeout(timer); });
    toast.addEventListener('mouseleave', function () { timer = setTimeout(function () { dismiss(toast); }, 2000); });
  }
  function showView(name) {
    S.view = name;
    ['list', 'connections', 'wizard', 'detail', 'defaults', 'links'].forEach(function (v) {
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
    S.wizard = { step: 1, site: null, form: null, action: null, forms: [], formsLoading: false, isZapier: false };
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

  function getModelCfg(modelName) {
    var cached     = (S.odooModelsCache || []).find(function (m) { return (m.odoo_model || m.name) === modelName; });
    var builtin    = DEFAULT_ODOO_MODELS.find(function (m) { return m.name === modelName; });
    // Merge: start from builtin, then apply DB overrides/additions.
    // This ensures builtin required fields are never dropped by an older DB record.
    var builtinFields = (builtin && Array.isArray(builtin.default_fields)) ? builtin.default_fields : [];
    var dbFields      = (cached  && Array.isArray(cached.default_fields))  ? cached.default_fields  : [];
    var merged = builtinFields.map(function (f) { return Object.assign({}, f); });
    dbFields.forEach(function (df) {
      var idx = merged.findIndex(function (f) { return f.name === df.name; });
      if (idx >= 0) { merged[idx] = Object.assign({}, merged[idx], df); }
      else          { merged.push(Object.assign({}, df)); }
    });
    var defFields = merged.length ? merged : [];
    return {
      label:           cached ? cached.label : (builtin ? builtin.label : modelName),
      description:     'Gegevens synchroniseren naar ' + (cached ? cached.label : modelName) + ' in Odoo.',
      icon:            cached ? (cached.icon || 'box') : (builtin ? builtin.icon : 'box'),
      badgeClass:      'badge-ghost',
      odoo_model:      modelName,
      identifier_type: (cached && cached.identifier_type) ? cached.identifier_type : 'mapped_fields',
      update_policy:   (cached && cached.update_policy)   ? cached.update_policy   : 'always_overwrite',
      resolver_type:   (cached && cached.resolver_type)   ? cached.resolver_type   : null,
      default_fields:  defFields,
      fixed_fields:    (cached && Array.isArray(cached.fixed_fields)) ? cached.fixed_fields : [],
      identifier_fields: Array.isArray(cached?.identifier_fields) ? cached.identifier_fields : [],
    };
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
    // Laad waarschuwingen over ontbrekende verplichte velden (fire-and-forget)
    api('/integrations/warnings').then(function (wb) {
      S.integrationWarnings = wb.data || {};
      renderList();
    }).catch(function () { /* negeer fouten */ });
  }

  async function loadModelLinks() {
    try {
      var body = await api('/settings/model-links');
      S.modelLinksCache = Array.isArray(body.data) ? body.data : [];
    } catch (_) {
      S.modelLinksCache = [];
    }
  }

  // Default built-in models — shown when DB registry is empty
  var DEFAULT_ODOO_MODELS = [
    { name: 'res.partner', label: 'Contact', icon: 'user',
      default_fields: [
        { name: 'name',       label: 'Naam',         required: true  },
        { name: 'email',      label: 'E-mailadres',  required: true  },
        { name: 'mobile',     label: 'Mobiel',       required: false },
        { name: 'is_company', label: 'Is bedrijf',   required: false },
      ]
    },
    { name: 'crm.lead', label: 'Lead', icon: 'trending-up',
      default_fields: []
    },
    { name: 'x_webinarregistrations', label: 'Webinaarinschrijving', icon: 'video',
      default_fields: [
        { name: 'x_name',  label: 'Naam',        required: true  },
        { name: 'x_email', label: 'E-mailadres', required: true  },
      ]
    },
  ];

  async function loadOdooModels() {
    try {
      var body = await api('/settings/odoo-models');
      S.odooModelsCache = Array.isArray(body.data) ? body.data : DEFAULT_ODOO_MODELS.slice();
    } catch (_) {
      if (!S.odooModelsCache.length) S.odooModelsCache = DEFAULT_ODOO_MODELS.slice();
    }
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
      var cfg = getModelCfg(row.odoo_model);
      var actionLabel = cfg.label;
      var actionBadgeClass = cfg.badgeClass;
      var actionIcon = cfg.icon;
      var actionModel = cfg.odoo_model;

      // Flow preview (uses shared FlowBuilder if available)
      var flowHtml = '';
      if (window.FSV2.renderFlowPreview && actionModel) {
        flowHtml = window.FSV2.renderFlowPreview([{ model: actionModel }]);
      }

      var updatedAt = row.updated_at ? fmt(row.updated_at) : null;
      var _warnings = (S.integrationWarnings || {})[String(row.id)] || [];
      var _warnHtml = '';
      if (_warnings.length) {
        var _totalMissing = _warnings.reduce(function(s, w) { return s + w.missingLabels.length; }, 0);
        var _tooltip = _warnings.map(function (w) {
          var _fields = w.missingLabels.map(function(lbl, i) {
            var fn = (w.missingFields || [])[i];
            return fn && fn !== lbl ? lbl + ' (' + fn + ')' : lbl;
          });
          return w.targetLabel + ': ' + _fields.join(', ');
        }).join('\n');
        _warnHtml = `<div class="flex items-center gap-1.5 mb-2" title="${esc(_tooltip)}"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-warning shrink-0"></i><span class="text-xs text-warning">${_totalMissing} verplicht${_totalMissing === 1 ? ' veld ontbreekt' : 'e velden ontbreken'}</span></div>`;
      }

      return `<div class="card bg-base-100 shadow-sm hover:shadow-md transition-all duration-200 border border-base-200"><div class="card-body p-5"><div class="flex items-start justify-between gap-2 mb-3"><h3 class="font-bold text-sm leading-snug text-base-content">${esc(row.name || 'Integratie')}</h3>${isActive ? '<span class="badge badge-success badge-xs shrink-0 gap-1"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>Actief</span>' : '<span class="badge badge-ghost badge-xs shrink-0">Inactief</span>'}</div><div class="flex items-center gap-1.5 mb-3">${row.source_type === 'generic_webhook' ? '<i data-lucide="zap" class="w-3 h-3 text-warning shrink-0"></i><p class="text-xs text-warning font-semibold">Zapier / Generic webhook</p>' : '<i data-lucide="file-text" class="w-3 h-3 text-base-content/35 shrink-0"></i><p class="text-xs text-base-content/45 font-mono truncate">' + esc(row.forminator_form_id || '\u2014') + '</p>'}</div>${flowHtml ? '<div class="mb-3">' + flowHtml + '</div>' : ''}${_warnHtml}${updatedAt ? '<p class="text-xs text-base-content/35 mb-2">Bijgewerkt ' + updatedAt + '</p>' : ''}<div class="flex gap-2 pt-3 border-t border-base-100"><button class="btn btn-xs btn-primary flex-1 gap-1" data-action="open-detail" data-id="${esc(row.id)}"><i data-lucide="settings-2" class="w-3 h-3"></i>Beheren</button><button class="btn btn-xs btn-ghost border border-base-200 text-error hover:bg-error/10" data-action="delete-integration" data-id="${esc(row.id)}" data-name="${esc(row.name || 'Integratie')}" title="Verwijderen"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div></div>`;
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
      sitesHtml = `<div class="alert alert-warning mt-4"><i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i><span>Geen WordPress sites geconfigureerd. Voeg <code class="bg-base-200 px-1 rounded">WORDPRESS_URL_SITE_1</code> en <code class="bg-base-200 px-1 rounded">WP_API_TOKEN_SITE_1</code> toe als Cloudflare secrets.</span></div>`;
    } else {
      sitesHtml = `<div class="space-y-3 mt-4">${S.sites.map(function (s) {
            return `<div class="card bg-base-100 shadow"><div class="card-body p-4 flex-row items-center gap-4"><div class="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center shrink-0"><i data-lucide="globe" class="w-5 h-5 text-base-content/50"></i></div><div class="flex-1 min-w-0"><p class="font-semibold truncate">${esc(s.label)}</p><p class="text-sm text-base-content/60 truncate">${esc(s.url)}</p></div>${s.has_token ? '<div class="flex items-center gap-1.5 text-success text-sm shrink-0"><i data-lucide="check-circle" class="w-4 h-4"></i><span>Actief</span></div>' : '<div class="flex items-center gap-1.5 text-error text-sm shrink-0"><i data-lucide="alert-circle" class="w-4 h-4"></i><span>Geen token</span></div>'}</div></div>`;
          }).join('')}</div><div class="alert alert-info mt-6"><i data-lucide="shield" class="w-4 h-4 shrink-0"></i><span>Credentials worden beheerd via Cloudflare secrets. Geen wachtwoorden of API-sleutels zichtbaar in de interface.</span></div>`;
    }

    el.innerHTML = sitesHtml;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: DEFAULTS
  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Smart value input for fixed fields ───────────────────────────────────
  function renderFixedValueInput(modelName, mKey, fieldName) {
    var wrap = document.getElementById('fixed-val-wrap-' + mKey);
    if (!wrap) return;
    var fields = S.odooFieldsCache[modelName] || [];
    var fd = fields.find(function (f) { return f.name === fieldName; });
    var label = '<p class="text-xs text-base-content/50 mb-1">Vaste waarde</p>';
    var inputHtml = '';

    if (!fd || !fieldName) {
      inputHtml = '<input type="text" id="fixed-new-val-' + esc(mKey) + '" class="input input-bordered input-sm" placeholder="bv. opportunity">';
    } else if (fd.type === 'boolean') {
      inputHtml = '<select id="fixed-new-val-' + esc(mKey) + '" class="select select-bordered select-sm">' +
        '<option value="True">Ja (True)</option>' +
        '<option value="False">Nee (False)</option>' +
        '</select>';
    } else if (fd.type === 'selection' && fd.selection && fd.selection.length) {
      var opts = fd.selection.map(function (s) {
        return '<option value="' + esc(s[0]) + '">' + esc(s[1]) + '</option>';
      }).join('');
      inputHtml = '<select id="fixed-new-val-' + esc(mKey) + '" class="select select-bordered select-sm">' + opts + '</select>';
    } else if (fd.type === 'many2one' && fd.relation) {
      inputHtml =
        '<div class="flex gap-1.5">' +
          '<input type="text" id="fixed-m2o-search-' + esc(mKey) + '" class="input input-bordered input-sm flex-1" placeholder="Zoeken..." autocomplete="off">' +
          '<input type="hidden" id="fixed-new-val-' + esc(mKey) + '" value="">' +
        '</div>' +
        '<div id="fixed-m2o-results-' + esc(mKey) + '" class="mt-1 rounded-lg border border-base-300 bg-base-100 shadow-lg text-sm hidden max-h-44 overflow-y-auto"></div>';
    } else {
      var ph = fd.type === 'integer' || fd.type === 'float' ? 'bv. 42' : 'bv. opportunity';
      inputHtml = '<input type="text" id="fixed-new-val-' + esc(mKey) + '" class="input input-bordered input-sm" placeholder="' + ph + '">';
    }

    wrap.innerHTML = label + inputHtml;

    // Wire up many2one search
    if (fd && fd.type === 'many2one' && fd.relation) {
      var searchEl  = document.getElementById('fixed-m2o-search-' + mKey);
      var hiddenEl  = document.getElementById('fixed-new-val-' + mKey);
      var resultBox = document.getElementById('fixed-m2o-results-' + mKey);
      var m2oTimer  = null;

      searchEl.addEventListener('input', function () {
        clearTimeout(m2oTimer);
        var q = searchEl.value.trim();
        if (q.length < 1) { resultBox.classList.add('hidden'); return; }
        m2oTimer = setTimeout(function () {
          resultBox.innerHTML = '<div class="px-3 py-2 text-base-content/40 text-xs">Zoeken…</div>';
          resultBox.classList.remove('hidden');
          api('/odoo/search?model=' + encodeURIComponent(fd.relation) + '&q=' + encodeURIComponent(q) + '&limit=20')
            .then(function (body) {
              if (!body.data || body.data.length === 0) {
                resultBox.innerHTML = '<div class="px-3 py-2 text-base-content/40 text-xs">Geen resultaten.</div>';
                return;
              }
              resultBox.innerHTML = body.data.map(function (r) {
                return '<div class="px-3 py-2 cursor-pointer hover:bg-base-200 rounded" data-id="' + esc(String(r.id)) + '" data-name="' + esc(r.name) + '">' + esc(r.name) + '</div>';
              }).join('');
              resultBox.querySelectorAll('[data-id]').forEach(function (row) {
                row.addEventListener('click', function () {
                  hiddenEl.value  = row.dataset.id;
                  searchEl.value  = row.dataset.name;
                  resultBox.classList.add('hidden');
                });
              });
            })
            .catch(function () {
              resultBox.innerHTML = '<div class="px-3 py-2 text-error text-xs">Fout bij zoeken.</div>';
            });
        }, 300);
      });

      document.addEventListener('click', function closeM2o(e) {
        if (!wrap.contains(e.target)) {
          resultBox.classList.add('hidden');
          document.removeEventListener('click', closeM2o);
        }
      });
    }
  }

  function renderDefaults() {
    var el = document.getElementById('defaultsList');
    if (!el) return;

    var html =
      '<p class="text-sm text-base-content/60 mb-5">Stel per Odoo model in welke velden standaard als rijen verschijnen in de koppelwizard, en welke velden altijd automatisch ingevuld worden.</p>' +
      '<div class="space-y-4">' +
      (S.odooModelsCache || []).map(function (m) {
        var model    = m.name;
        var editor   = S.modelDefaultsEditors[model] || {};
        var fixedEd  = S.modelFixedEditors[model]    || {};
        var identEd  = S.modelIdentifierEditors[model] || {};
        var saved    = Array.isArray(m.default_fields) ? m.default_fields : null;
        var savedFixed = Array.isArray(m.fixed_fields) ? m.fixed_fields : [];
        var savedIdent = Array.isArray(m.identifier_fields) ? m.identifier_fields : [];
        var modelKey = model.replace(/\./g, '_');

        // ── Default fields: closed summary ──
        var summaryHtml = '';
        if (!editor.open) {
          if (saved === undefined || saved === null) {
            summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Laden…</p>';
          } else if (saved.length === 0) {
            summaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Geen standaard velden.</p>';
          } else {
            summaryHtml = `<div class="flex flex-wrap gap-1.5 mt-1.5">${saved.map(function (f) {
                return `<span class="badge badge-outline badge-sm">${esc(f.label || f.name)}${f.required ? ' <span class="text-error">*</span>' : ''}</span>`;
              }).join('')}</div>`;
          }
        }

        // ── Default fields: open editor ──
        var editorHtml = '';
        if (editor.open) {
          var pending    = editor.pendingFields || [];
          var odooFields = S.odooFieldsCache[model] || [];

          var rowsHtml = pending.length === 0
            ? '<tr><td colspan="4" class="text-xs text-base-content/40 italic py-2">Leeg — wizard valt terug op ingebouwde defaults.</td></tr>'
            : pending.map(function (f, i) {
                return `<tr>
                <td class="py-1.5">
                  <span class="font-medium text-sm">${esc(f.label || f.name)}</span>
                  <span class="font-mono text-xs text-base-content/40 ml-1.5">${esc(f.name)}</span>
                </td>
                <td class="py-1.5">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-xs defaults-req-toggle"
                      data-model="${esc(model)}" data-idx="${i}"${f.required ? ' checked' : ''} />
                    <span class="text-xs">Verplicht</span>
                  </label>
                </td>
                <td class="py-1.5">
                  <select class="select select-bordered select-xs defaults-source-mode"
                    data-model="${esc(model)}" data-idx="${i}">
                    <option value="both"${(f.source_mode || 'both') === 'both' ? ' selected' : ''}>Beide</option>
                    <option value="form_field"${f.source_mode === 'form_field' ? ' selected' : ''}>Formulierveld</option>
                    <option value="fixed_value"${f.source_mode === 'fixed_value' ? ' selected' : ''}>Vaste waarde</option>
                  </select>
                </td>
                <td class="py-1.5 text-right">
                  <button type="button" class="btn btn-ghost btn-xs text-error"
                    data-action="remove-default-field" data-model="${esc(model)}" data-idx="${i}">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </td>
              </tr>`;
              }).join('');

          var addRowHtml = `<div class="flex flex-wrap items-end gap-2 mt-3"><div class="form-control flex-1 min-w-40"><p class="text-xs text-base-content/50 mb-1">Odoo veld ${odooFields.length > 0 ? '(' + odooFields.length + ')' : ''}</p>${odooFields.length > 0 ? window.OpenVME.FieldPicker.render('defaults-add-' + modelKey, '--unused--', odooFields, '') : '<div class="input input-bordered input-sm flex items-center gap-2 text-base-content/40"><span class="loading loading-spinner loading-xs"></span><span class="text-xs">Velden laden…</span></div>'}</div><label class="flex items-center gap-1.5 shrink-0 pb-0.5"><input type="checkbox" id="defaults-new-req-${esc(modelKey)}" class="checkbox checkbox-xs" /><span class="text-xs">Verplicht</span></label><select id="defaults-new-src-${esc(modelKey)}" class="select select-bordered select-xs shrink-0"><option value="both">Beide</option><option value="form_field">Formulierveld</option><option value="fixed_value">Vaste waarde</option></select><button type="button" class="btn btn-sm btn-outline shrink-0" data-action="add-default-field" data-model="${esc(model)}">+ Voeg toe</button></div>`;

          editorHtml = `<div class="mt-3 pt-3 border-t border-base-200"><div class="overflow-x-auto mb-2"><table class="table table-sm"><thead><tr><th class="text-xs font-normal text-base-content/50 pb-1">Veld</th><th class="text-xs font-normal text-base-content/50 pb-1">Verplicht</th><th class="text-xs font-normal text-base-content/50 pb-1">Bron</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>${addRowHtml}<div class="flex gap-2 justify-end mt-4"><button type="button" class="btn btn-ghost btn-sm" data-action="toggle-model-defaults" data-model="${esc(model)}">Annuleer</button><button type="button" class="btn btn-primary btn-sm" data-action="save-model-defaults" data-model="${esc(model)}">Opslaan</button></div></div>`;
        }

        // ── Fixed fields: closed summary ──
        var fixedSummaryHtml = '';
        if (!fixedEd.open) {
          if (savedFixed.length === 0) {
            fixedSummaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Geen vaste waarden ingesteld.</p>';
          } else {
            fixedSummaryHtml = `<div class="flex flex-wrap gap-1.5 mt-1.5">${savedFixed.map(function (f) {
                return `<span class="badge badge-outline badge-sm gap-1"><i data-lucide="lock" class="w-2.5 h-2.5"></i>${esc(f.label || f.name)} = <code class="text-xs">${esc(String(f.value))}</code></span>`;
              }).join('')}</div>`;
          }
        }

        // ── Fixed fields: open editor ──
        var fixedEditorHtml = '';
        if (fixedEd.open) {
          var pendingFixed = fixedEd.pendingFixed || [];
          var odooFieldsF  = S.odooFieldsCache[model] || [];

          var fixedRowsHtml = pendingFixed.length === 0
            ? '<tr><td colspan="3" class="text-xs text-base-content/40 italic py-2">Nog geen vaste velden.</td></tr>'
            : pendingFixed.map(function (f, i) {
                return `<tr>
                  <td class="py-1.5 min-w-0">
                    <span class="font-medium text-sm">${esc(f.label || f.name)}</span>
                    <span class="font-mono text-xs text-base-content/40 ml-1.5">${esc(f.name)}</span>
                  </td>
                  <td class="py-1.5">
                    <input type="text" class="input input-bordered input-xs w-full fixed-val-input"
                      data-model="${esc(model)}" data-idx="${i}"
                      value="${(function(){ var v=f.value!==undefined&&f.value!==null?String(f.value):''; var p=v.split('|'); return esc(p.length>1?p.slice(1).join('|'):v); })()}">
                  </td>
                  <td class="py-1.5 text-right">
                    <button type="button" class="btn btn-ghost btn-xs text-error"
                      data-action="remove-fixed-field" data-model="${esc(model)}" data-idx="${i}">
                      <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                  </td>
                </tr>`;
              }).join('');

          var addFixedRowHtml = `<div class="flex flex-wrap items-end gap-2 mt-3">
            <div class="form-control flex-1 min-w-40">
              <p class="text-xs text-base-content/50 mb-1">Odoo veld ${odooFieldsF.length > 0 ? '(' + odooFieldsF.length + ')' : ''}</p>
              ${odooFieldsF.length > 0
                ? window.OpenVME.FieldPicker.render('fixed-add-' + modelKey, '--unused--', odooFieldsF, '')
                : '<div class="input input-bordered input-sm flex items-center gap-2 text-base-content/40"><span class="loading loading-spinner loading-xs"></span><span class="text-xs">Velden laden…</span></div>'}
            </div>
            <div class="form-control flex-1 min-w-32" id="fixed-val-wrap-${esc(modelKey)}">
              <p class="text-xs text-base-content/50 mb-1">Vaste waarde</p>
              <input type="text" id="fixed-new-val-${esc(modelKey)}" class="input input-bordered input-sm" placeholder="bv. opportunity">
            </div>
            <button type="button" class="btn btn-sm btn-outline shrink-0" data-action="add-fixed-field" data-model="${esc(model)}">+ Voeg toe</button>
          </div>`;

          fixedEditorHtml = `<div class="mt-3 pt-3 border-t border-base-200">
            <div class="overflow-x-auto mb-2">
              <table class="table table-sm">
                <thead><tr>
                  <th class="text-xs font-normal text-base-content/50">Odoo veld</th>
                  <th class="text-xs font-normal text-base-content/50">Vaste waarde</th>
                  <th></th>
                </tr></thead>
                <tbody>${fixedRowsHtml}</tbody>
              </table>
            </div>
            ${addFixedRowHtml}
            <div class="flex gap-2 justify-end mt-4">
              <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-model-fixed" data-model="${esc(model)}">Annuleer</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="save-model-fixed" data-model="${esc(model)}">Opslaan</button>
            </div>
          </div>`;
        }

        // ── Identifier fields: closed summary ──
        var identSummaryHtml = '';
        if (!identEd.open) {
          if (savedIdent.length === 0) {
            identSummaryHtml = '<p class="text-xs text-base-content/40 italic py-1">Geen identifier ingesteld.</p>';
          } else {
            identSummaryHtml = `<div class="flex flex-wrap gap-1.5 mt-1.5">${savedIdent.map(function (f) {
                return `<span class="badge badge-outline badge-sm gap-1"><i data-lucide="key" class="w-2.5 h-2.5"></i>${esc(f.label || f.name)}</span>`;
              }).join('')}</div>`;
          }
        }

        // ── Identifier fields: open editor ──
        var identEditorHtml = '';
        if (identEd.open) {
          var pendingIdent = identEd.pendingIdentifier || [];
          var odooFieldsI  = S.odooFieldsCache[model] || [];

          var identRowsHtml = pendingIdent.length === 0
            ? '<tr><td colspan="2" class="text-xs text-base-content/40 italic py-2">Nog geen identifier velden.</td></tr>'
            : pendingIdent.map(function (f, i) {
                return `<tr>
                  <td class="py-1.5 min-w-0">
                    <span class="font-medium text-sm">${esc(f.label || f.name)}</span>
                    <span class="font-mono text-xs text-base-content/40 ml-1.5">${esc(f.name)}</span>
                  </td>
                  <td class="py-1.5 text-right">
                    <button type="button" class="btn btn-ghost btn-xs text-error"
                      data-action="remove-identifier-field" data-model="${esc(model)}" data-idx="${i}">
                      <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                  </td>
                </tr>`;
              }).join('');

          var addIdentRowHtml = `<div class="flex flex-wrap items-end gap-2 mt-3">
            <div class="form-control flex-1 min-w-40">
              <p class="text-xs text-base-content/50 mb-1">Odoo veld ${odooFieldsI.length > 0 ? '(' + odooFieldsI.filter(function(f){return f.name!=='id';}).length + ')' : ''}</p>
              ${odooFieldsI.length > 0
                ? window.OpenVME.FieldPicker.render('ident-add-' + modelKey, '--unused--', odooFieldsI.filter(function(f){return f.name!=='id';}), '')
                : '<div class="input input-bordered input-sm flex items-center gap-2 text-base-content/40"><span class="loading loading-spinner loading-xs"></span><span class="text-xs">Velden laden…</span></div>'}
            </div>
            <button type="button" class="btn btn-sm btn-outline shrink-0" data-action="add-identifier-field" data-model="${esc(model)}">+ Voeg toe</button>
          </div>`;

          identEditorHtml = `<div class="mt-3 pt-3 border-t border-base-200">
            <div class="overflow-x-auto mb-2">
              <table class="table table-sm">
                <thead><tr>
                  <th class="text-xs font-normal text-base-content/50">Odoo veld</th>
                  <th></th>
                </tr></thead>
                <tbody>${identRowsHtml}</tbody>
              </table>
            </div>
            ${addIdentRowHtml}
            <div class="flex gap-2 justify-end mt-4">
              <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-model-identifier" data-model="${esc(model)}">Annuleer</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="save-model-identifier" data-model="${esc(model)}">Opslaan</button>
            </div>
          </div>`;
        }

        return `<div class="card bg-base-100 shadow">
          <div class="card-body p-4 gap-0">
            <div class="mb-3">
              <p class="font-semibold">${esc(m.label)}</p>
              <p class="text-xs font-mono text-base-content/50">${esc(model)}</p>
            </div>
            <div class="border-t border-base-200 pt-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold text-base-content/60 flex items-center gap-1.5">
                  <i data-lucide="list" class="w-3.5 h-3.5"></i> Standaard velden
                </p>
                <button type="button" class="btn btn-ghost btn-xs shrink-0" data-action="toggle-model-defaults" data-model="${esc(model)}">${editor.open ? 'Sluiten' : 'Bewerken'}</button>
              </div>
              ${summaryHtml}${editorHtml}
            </div>
            <div class="border-t border-base-200 pt-3 mt-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold text-base-content/60 flex items-center gap-1.5">
                  <i data-lucide="lock" class="w-3.5 h-3.5"></i> Vaste waarden
                </p>
                <button type="button" class="btn btn-ghost btn-xs shrink-0" data-action="toggle-model-fixed" data-model="${esc(model)}">${fixedEd.open ? 'Sluiten' : 'Bewerken'}</button>
              </div>
              ${fixedSummaryHtml}${fixedEditorHtml}
            </div>
            <div class="border-t border-base-200 pt-3 mt-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold text-base-content/60 flex items-center gap-1.5">
                  <i data-lucide="key" class="w-3.5 h-3.5"></i> Identifier velden
                </p>
                <button type="button" class="btn btn-ghost btn-xs shrink-0" data-action="toggle-model-identifier" data-model="${esc(model)}">${identEd.open ? 'Sluiten' : 'Bewerken'}</button>
              </div>
              ${identSummaryHtml}${identEditorHtml}
            </div>
          </div>
        </div>`;
      }).join('') +
      '</div>';

    el.innerHTML = html;

    // Bind required-toggle checkboxes (default fields)
    el.querySelectorAll('.defaults-req-toggle').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var ed = S.modelDefaultsEditors[cb.dataset.model];
        if (ed && ed.pendingFields && ed.pendingFields[parseInt(cb.dataset.idx, 10)]) {
          ed.pendingFields[parseInt(cb.dataset.idx, 10)].required = cb.checked;
        }
      });
    });

    // Bind value inputs (fixed fields) — sync back to state on change
    el.querySelectorAll('.fixed-val-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var fe = S.modelFixedEditors[inp.dataset.model];
        if (fe && fe.pendingFixed && fe.pendingFixed[parseInt(inp.dataset.idx, 10)]) {
          fe.pendingFixed[parseInt(inp.dataset.idx, 10)].value = inp.value;
        }
      });
    });

    // Bind FieldPicker selects in fixed add rows → smart value input
    el.querySelectorAll('[id^="fsp-val-fixed-add-"]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var mKey = sel.id.replace('fsp-val-fixed-add-', '');
        // Reverse mKey → model name (dots replaced by underscores; find matching model)
        var modelName = (S.odooModelsCache || []).map(function(m){ return m.name; })
          .find(function(n){ return n.replace(/\./g,'_') === mKey; }) || mKey.replace(/_/g, '.');
        renderFixedValueInput(modelName, mKey, sel.value);
      });
    });

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════
  window.FSV2 = {
    SKIP_TYPES: SKIP_TYPES,
    S: S,
    esc: esc,
    api: api,
    showAlert: showAlert,
    showView: showView,
    fmt: fmt,
    shortId: shortId,
    resetWizard: resetWizard,
    FIELD_KEYWORDS: FIELD_KEYWORDS,
    suggestFormField: suggestFormField,
    suggestOdooField: suggestOdooField,
    loadOdooFieldsForModel: loadOdooFieldsForModel,
    getModelCfg: getModelCfg,
    loadSites: loadSites,
    loadIntegrations: loadIntegrations,
    loadModelLinks: loadModelLinks,
    loadOdooModels: loadOdooModels,
    renderList: renderList,
    renderConnections: renderConnections,
    renderDefaults: renderDefaults,
  };

}());
