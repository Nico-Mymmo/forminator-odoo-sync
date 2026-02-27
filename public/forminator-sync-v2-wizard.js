/**
 * Forminator Sync V2 — Wizard
 *
 * Extends window.FSV2 with: renderStaticInput, renderWizard (+ sub-renders),
 * buildFieldOptions, and all wizard action handlers (wizardSelectSite, …, submitWizard).
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2), field-picker-component.js (OpenVME.FieldPicker)
 */
(function () {
  'use strict';

  // Convenience aliases (resolved at call-time, so safe even if this IIFE runs at load)
  function S()  { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC VALUE INPUT — renders the right control based on Odoo field type
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Returns an <input> or <select> HTML string for a mapping's "static value" cell.
   * @param {string|null} name       - name attribute value (null = omit name attr)
   * @param {object|null} meta       - Odoo field meta: {type, selection} (null = plain text input)
   * @param {string}      value      - Current value
   * @param {string}      [extraAttrs] - Extra HTML attribute string
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
        meta.selection.map(function (opt) {
          var k = String(opt[0]);
          var l = String(opt[1]);
          return '<option value="' + esc(k) + '"' + (value === k ? ' selected' : '') + '>' + esc(l) + '</option>';
        }).join('') +
      '</select>';
    }
    return '<input class="' + inpCls + '"' + nameAttr + extra + ' value="' + esc(value || '') + '" placeholder="Vaste waarde..." />';
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
    var step = S().wizard.step;
    [1, 2, 3, 4].forEach(function (n) {
      var el = document.getElementById('wizardStep' + n);
      if (!el) return;
      el.className = 'step' + (n <= step ? ' step-primary' : '');
    });
  }

  function renderWizardSites() {
    var grid = document.getElementById('wizardSitesGrid');
    if (!grid) return;

    if (S().sites.length === 0) {
      grid.innerHTML = '<div class="alert alert-warning col-span-full"><span>Geen WordPress sites gevonden in Cloudflare secrets.</span></div>';
      return;
    }

    grid.innerHTML = S().sites.map(function (s) {
      var selected = S().wizard.site && S().wizard.site.key === s.key;
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

    if (!S().wizard.site) { section.style.display = 'none'; return; }
    section.style.display = '';

    if (S().wizard.formsLoading) {
      grid.innerHTML = '<div class="flex items-center gap-3 col-span-full py-8 text-base-content/60">' +
        '<span class="loading loading-spinner loading-sm"></span><span>Formulieren ophalen...</span></div>';
      return;
    }

    if (S().wizard.forms.length === 0) {
      grid.innerHTML = '<div class="alert alert-warning col-span-full"><span>Geen formulieren gevonden op ' + esc(S().wizard.site.url) + '.</span></div>';
      return;
    }

    grid.innerHTML = S().wizard.forms.map(function (form) {
      var selected = S().wizard.form && String(S().wizard.form.form_id) === String(form.form_id);
      var fields   = Array.isArray(form.fields) ? form.fields : [];
      var mappable = fields.filter(function (f) { return !window.FSV2.SKIP_TYPES.includes(f.type); }).length;

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

    if (!S().wizard.form) { section.style.display = 'none'; return; }
    section.style.display = '';

    var grid = section.querySelector('.actions-grid');
    if (!grid) return;

    grid.innerHTML = Object.keys(window.FSV2.ACTIONS).map(function (key) {
      var cfg      = window.FSV2.ACTIONS[key];
      var selected = S().wizard.action === key;
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
      formFields.map(function (f) {
        var label = String(f.label || f.field_id);
        var id    = String(f.field_id);
        return '<option value="' + esc(id) + '">' + esc(label) + ' [' + esc(id) + ']</option>';
      }).join('');
  }

  function renderWizardMapping() {
    var section = document.getElementById('wizard-section-mapping');
    if (!section) return;

    if (!S().wizard.action) { section.style.display = 'none'; return; }
    section.style.display = '';

    var cfg = window.FSV2.ACTIONS[S().wizard.action];
    if (!cfg) return;

    var allFields   = (S().wizard.form && S().wizard.form.fields) ? S().wizard.form.fields : [];
    var formFields  = allFields.filter(function (f) { return !window.FSV2.SKIP_TYPES.includes(f.type); });
    var flatFields  = [];
    formFields.forEach(function (f) {
      flatFields.push(f);
      if (Array.isArray(f.sub_fields)) {
        f.sub_fields.forEach(function (sf) {
          if (!window.FSV2.SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
        });
      }
    });

    // Auto-fill name input once
    var nameInput = document.getElementById('wizardName');
    if (nameInput && !nameInput.value) {
      var sitePart = (S().wizard.site && S().wizard.site.label) ? S().wizard.site.label : 'Site';
      var formPart = (S().wizard.form && S().wizard.form.form_name)
        ? S().wizard.form.form_name
        : (S().wizard.form ? String(S().wizard.form.form_id) : 'Formulier');
      nameInput.value = sitePart + ' \u2014 ' + formPart + ' \u2014 ' + cfg.label;
    }

    var table = document.getElementById('wizardMappingTable');
    if (!table) return;

    var cachedFields = S().odooFieldsCache[cfg.odoo_model] || [];
    var fieldsLoaded = cachedFields.length > 0;

    // ── Inner helpers ────────────────────────────────────────────────────────
    function buildOdooOpts(suggested) {
      var opts = '<option value="">\u2014 niet koppelen \u2014</option>';
      if (!fieldsLoaded) {
        opts += '<option disabled>\u2026 Odoo velden laden \u2026</option>';
      } else {
        opts += cachedFields.map(function (f) {
          var sel = (f.name === suggested) ? ' selected' : '';
          return '<option value="' + esc(f.name) + '"' + sel + '>' + esc(f.label || f.name) + ' (' + esc(f.name) + ')</option>';
        }).join('');
      }
      return opts;
    }

    function placeholderChips(targetName) {
      if (!flatFields.length) return '';
      return '<div class="flex flex-wrap gap-1 mt-1.5 items-center">' +
        '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>' +
        flatFields.map(function (f) {
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

    function renderExtraValueInput(fieldName, value, nameAttr, idStr) {
      var meta  = fieldName
        ? (cachedFields.find(function (f) { return f.name === fieldName; }) || null)
        : null;
      var ftype = (meta && meta.type) || '';
      idStr = idStr || '';

      if (ftype === 'boolean' || (ftype === 'selection' && meta && meta.selection && meta.selection.length)) {
        return renderStaticInput(nameAttr, meta, value, idStr);
      }

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
      if (ftype === 'integer' || ftype === 'float') {
        return '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
          ' type="number"' +
          ' value="' + esc(value || '') + '"' +
          ' placeholder="Getal\u2026" />';
      }
      var idMatch    = idStr.match(/id="([^"]+)"/);
      var chipTarget = idMatch ? idMatch[1] : null;
      return '<div>' +
        '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
          ' value="' + esc(value || '') + '"' +
          ' placeholder="Vaste waarde of {veld-id} sjabloon\u2026" />' +
        (chipTarget ? placeholderChips(chipTarget) : '') +
      '</div>';
    }

    // ── Section 1: form fields → Odoo fields ─────────────────────────────────
    var formRows = flatFields.map(function (f) {
      var fid          = String(f.field_id);
      var suggested    = window.FSV2.suggestOdooField(fid, f.label || '', cfg.odoo_model);
      var isSubField   = !formFields.find(function (pf) { return String(pf.field_id) === fid; });
      var identifierFields = ['email', 'email_from', 'x_email', 'vat', 'ref'];
      var autoIdentifier   = identifierFields.includes(suggested);
      return '<tr' + (isSubField ? ' class="bg-base-200/30"' : '') + '>' +
        '<td class="align-middle py-2">' +
          (isSubField ? '<span class="text-base-content/40 mr-1">\u21b3</span>' : '') +
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
          '<input type="checkbox" class="checkbox checkbox-xs wizard-ff-id-check"' +
            ' name="ff-identifier-' + esc(fid) + '"' +
            ' title="Gebruik als identifier (record opzoeken / matchen)"' +
            (autoIdentifier ? ' checked' : '') +
          '>' +
        '</td>' +
      '</tr>';
    }).join('');

    // ── Section 2: extra static/template rows ─────────────────────────────────
    var extraRows = (S().wizard.extraMappings || []).map(function (em, idx) {
      var targetName = 'extra-static-' + idx;
      var meta       = cachedFields.find(function (f) { return f.name === em.odooField; }) || null;
      var ftype      = meta ? meta.type : '';
      var typeBadge  = ftype
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
          '<button type="button" class="btn btn-ghost btn-xs text-error"' +
            ' data-action="wizard-remove-extra-row" data-idx="' + idx + '" title="Verwijder">' +
            '<i data-lucide="x" class="w-3 h-3"></i>' +
          '</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    // ── Add extra row form ────────────────────────────────────────────────────
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
          window.OpenVME.FieldPicker.render('wizard-extra-add', '--unused--', cachedFields, '') +
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
      '<div>' +
        '<h4 class="font-semibold text-sm mb-2 flex items-center gap-2">' +
          '<i data-lucide="tag" class="w-4 h-4 text-warning"></i>' +
          ' Extra Odoo-velden met vaste waarde' +
        '</h4>' +
        ((S().wizard.extraMappings || []).length > 0
          ? '<div class="overflow-x-auto mb-3">' +
              '<table class="table table-sm">' +
                '<thead><tr><th>Odoo veld</th><th>Vaste waarde / sjabloon</th><th></th></tr></thead>' +
                '<tbody>' + extraRows + '</tbody>' +
              '</table>' +
            '</div>'
          : '') +
        addExtraHtml +
      '</div>';

    // Reactive: when the user picks an Odoo field in the add-extra form rebuild the value input
    var fspExtraVal = document.getElementById('fsp-val-wizard-extra-add');
    if (fspExtraVal) {
      fspExtraVal.addEventListener('change', function () {
        var wrap = document.getElementById('wizardExtraStaticWrap');
        if (!wrap) return;
        wrap.innerHTML = renderExtraValueInput(fspExtraVal.value || '', '', null, ' id="wizardExtraStaticValue"');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WIZARD ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  async function wizardSelectSite(siteKey, siteUrl, siteLabel) {
    S().wizard.site = { key: siteKey, url: siteUrl, label: siteLabel };
    S().wizard.form = null;
    S().wizard.action = null;
    S().wizard.step = 2;
    S().wizard.forms = [];
    S().wizard.formsLoading = true;
    renderWizard();

    try {
      var body = await window.FSV2.api('/forminator/forms?site=' + encodeURIComponent(siteKey));
      S().wizard.forms = body.data || [];
    } catch (err) {
      S().wizard.forms = [];
      window.FSV2.showAlert('Formulieren ophalen mislukt: ' + err.message, 'error');
    } finally {
      S().wizard.formsLoading = false;
      renderWizard();
    }
  }

  function wizardSelectForm(formId, formName, fields) {
    S().wizard.form   = { form_id: formId, form_name: formName, fields: fields };
    S().wizard.action = null;
    S().wizard.step   = 3;
    var nameInput = document.getElementById('wizardName');
    if (nameInput) nameInput.value = '';
    renderWizard();
    var sec = document.getElementById('wizard-section-actions');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wizardSelectAction(actionKey) {
    S().wizard.action = actionKey;
    S().wizard.step   = 4;
    S().wizard.extraMappings = S().wizard.extraMappings || [];
    renderWizard();
    var sec = document.getElementById('wizard-section-mapping');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var actionCfg = window.FSV2.ACTIONS[actionKey];
    if (actionCfg && (!S().odooFieldsCache[actionCfg.odoo_model] || !S().odooFieldsCache[actionCfg.odoo_model].length)) {
      window.FSV2.loadOdooFieldsForModel(actionCfg.odoo_model).then(function () {
        if (S().wizard.action !== actionKey) return;
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

      var cfg = window.FSV2.ACTIONS[S().wizard.action];
      if (!cfg) throw new Error('Geen actie geselecteerd.');
      if (!S().wizard.form) throw new Error('Geen formulier geselecteerd.');

      // Step 1 — create integration
      var intRes = await window.FSV2.api('/integrations', {
        method: 'POST',
        body: JSON.stringify({
          name: name,
          forminator_form_id: String(S().wizard.form.form_id),
          odoo_connection_id: 'default',
          site_key: S().wizard.site ? S().wizard.site.key : null,
        }),
      });
      var integrationId = intRes.data.id;

      // Step 2 — create resolver (only when the action requires one)
      if (cfg.resolver_type) {
        await window.FSV2.api('/integrations/' + integrationId + '/resolvers', {
          method: 'POST',
          body: JSON.stringify({
            resolver_type:      cfg.resolver_type,
            input_source_field: cfg.input_source_field,
            create_if_missing:  cfg.create_if_missing,
            output_context_key: cfg.output_context_key,
            order_index: 0,
          }),
        });
      }

      // Step 3 — create target
      var targetRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
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

      var allWizardFields = (S().wizard.form && S().wizard.form.fields) ? S().wizard.form.fields : [];
      var flatWizardFields = [];
      allWizardFields.forEach(function (f) {
        if (!window.FSV2.SKIP_TYPES.includes(f.type)) flatWizardFields.push(f);
        if (Array.isArray(f.sub_fields)) {
          f.sub_fields.forEach(function (sf) {
            if (!window.FSV2.SKIP_TYPES.includes(sf.type)) flatWizardFields.push(sf);
          });
        }
      });

      flatWizardFields.forEach(function (ff) {
        if (!mappingSection) return;
        var fid   = String(ff.field_id);
        var selEl = Array.from(mappingSection.querySelectorAll('select.wizard-ff-select')).find(function (el) {
          return el.getAttribute('name') === 'ff-odoo-' + fid;
        });
        var odooField = selEl ? (selEl.value || '') : '';
        if (!odooField) return;

        var idCheckEl    = Array.from(mappingSection.querySelectorAll('input.wizard-ff-id-check')).find(function (el) {
          return el.getAttribute('name') === 'ff-identifier-' + fid;
        });
        var isIdentifier = idCheckEl ? idCheckEl.checked : false;

        mappingPromises.push(window.FSV2.api('/targets/' + targetId + '/mappings', {
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

      // Extra rows: static / template values
      (S().wizard.extraMappings || []).forEach(function (em, idx) {
        var targetName = 'extra-static-' + idx;
        var inpEl      = document.getElementById('inp-' + targetName);
        var staticVal  = inpEl ? ((inpEl.value || '').trim()) : (em.staticValue || '');
        if (!staticVal) return;
        var sourceType = /\{[^}]+\}/.test(staticVal) ? 'template' : 'static';
        mappingPromises.push(window.FSV2.api('/targets/' + targetId + '/mappings', {
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
        await window.FSV2.api('/integrations/' + integrationId + '/test-stub', {
          method: 'POST',
          body: JSON.stringify({}),
        });
      } catch (_) { /* test stub failure is non-critical */ }

      window.FSV2.showAlert('Integratie "' + name + '" succesvol aangemaakt!', 'success');
      await window.FSV2.loadIntegrations();
      window.FSV2.resetWizard();
      window.FSV2.showView('list');
      window.FSV2.renderList();

    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Integratie aanmaken'; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT — extend FSV2
  // ═══════════════════════════════════════════════════════════════════════════
  Object.assign(window.FSV2, {
    renderStaticInput:    renderStaticInput,
    renderWizard:         renderWizard,
    renderWizardSteps:    renderWizardSteps,
    renderWizardSites:    renderWizardSites,
    renderWizardForms:    renderWizardForms,
    renderWizardActions:  renderWizardActions,
    buildFieldOptions:    buildFieldOptions,
    renderWizardMapping:  renderWizardMapping,
    wizardSelectSite:     wizardSelectSite,
    wizardSelectForm:     wizardSelectForm,
    wizardSelectAction:   wizardSelectAction,
    submitWizard:         submitWizard,
  });

}());
