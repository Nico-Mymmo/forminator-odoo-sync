/**
 * Forminator Sync V2 - Wizard
 *
 * Extends window.FSV2 with: renderWizard (+ sub-renders),
 * buildFieldOptions, and all wizard action handlers (wizardSelectSite, submitWizard).
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2), field-picker-component.js (OpenVME.FieldPicker)
 */
(function () {
  'use strict';

  // Convenience aliases (resolved at call-time, so safe even if this IIFE runs at load)
  function S()  { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // STATIC VALUE INPUT &mdash; renders the right control based on Odoo field type
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  /**
   * Returns an <input> or <select> HTML string for a mapping's "static value" cell.
   * @param {string|null} name       - name attribute value (null = omit name attr)
   * @param {object|null} meta       - Odoo field meta: {type, selection} (null = plain text input)
   * @param {string}      value      - Current value
   * @param {string}      [extraAttrs] - Extra HTML attribute string
   */

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER: WIZARD
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
    [1, 2, 3, 4, 5].forEach(function (n) {
      var el = document.getElementById('wizardStep' + n);
      if (!el) return;
      el.className = 'step' + (n <= step ? ' step-primary' : '');
    });
  }

  function renderWizardSites() {
    var grid = document.getElementById('wizardSitesGrid');
    if (!grid) return;

    // Always show the Zapier option first
    var zapierSelected = !!S().wizard.isZapier;
    var zapierCard =
      '<button type="button" class="card bg-base-100 shadow text-left hover:shadow-md transition-all border-2 ' +
      (zapierSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-base-300') +
      '" data-action="wizard-select-zapier">' +
        '<div class="card-body p-4">' +
          '<div class="flex items-center gap-2 mb-1">' +
            (zapierSelected
              ? '<i data-lucide="check-circle" class="w-4 h-4 text-primary shrink-0"></i>'
              : '<i data-lucide="zap" class="w-4 h-4 text-warning shrink-0"></i>') +
            '<p class="font-semibold text-sm">Zapier / Generiek webhook</p>' +
          '</div>' +
          '<p class="text-xs text-base-content/60">Stuur data vanuit Zapier, n8n of een eigen systeem via HTTP POST.</p>' +
        '</div>' +
      '</button>';

    if (S().sites.length === 0) {
      grid.innerHTML = zapierCard;
      return;
    }

    grid.innerHTML = zapierCard + S().sites.map(function (s) {
      var selected = !zapierSelected && S().wizard.site && S().wizard.site.key === s.key;
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

    // Use the dynamic model registry as primary source.
    // Fall back to the hardcoded ACTIONS list if the cache is empty (first load race).
    var models = (S().odooModelsCache && S().odooModelsCache.length > 0)
      ? S().odooModelsCache
      : window.FSV2.DEFAULT_ODOO_MODELS || [];

    // For Zapier: prepend a "skip" card (no Odoo target yet)
    var skipCard = '';
    if (S().wizard.isZapier) {
      var skipSelected = !S().wizard.action;
      skipCard = '<button type="button" class="card bg-base-100 shadow text-left hover:shadow-md transition-all border-2 ' +
        (skipSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-base-300') +
        '" data-action="wizard-skip-action">' +
        '<div class="card-body p-5">' +
          '<div class="flex items-center gap-3 mb-3">' +
            (skipSelected
              ? '<div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">' +
                '<i data-lucide="check" class="w-5 h-5 text-primary-content"></i></div>'
              : '<div class="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center shrink-0">' +
                '<i data-lucide="zap" class="w-5 h-5 text-base-content/60"></i></div>') +
            '<p class="font-bold">Alleen webhook (voorlopig)</p>' +
          '</div>' +
          '<p class="text-sm text-base-content/60 mb-3">Sla Odoo-koppeling over. Stuur eerst een test via Zapier en stel de koppeling daarna in via de integratiedetails.</p>' +
          '<span class="badge badge-ghost badge-sm">inactief tot geconfigureerd</span>' +
        '</div>' +
      '</button>';
    }

    grid.innerHTML = skipCard + models.map(function (m) {
      var cfg      = window.FSV2.getModelCfg(m.name);
      var selected = S().wizard.action === m.name;
      return '<button type="button" class="card bg-base-100 shadow text-left hover:shadow-md transition-all border-2 ' +
        (selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-base-300') +
        '" data-action="wizard-select-action" data-key="' + esc(m.name) + '">' +
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
          '<span class="badge ' + esc(cfg.badgeClass) + ' badge-sm font-mono">' + esc(cfg.odoo_model) + '</span>' +
        '</div>' +
      '</button>';
    }).join('');

    // For Zapier: always show the name+submit section (skip is the default)
    // For Forminator: only show after action is selected
    var mappingSec = document.getElementById('wizard-section-mapping');
    if (mappingSec) mappingSec.style.display = (S().wizard.isZapier || S().wizard.action) ? '' : 'none';
  }

  function renderWizardMapping() {
    var container = document.getElementById('wizardMappingTable');
    if (!container) return;

    var action = S().wizard.action;
    // For Zapier without an action selected: hide the mapping table, only show name + submit
    if (!action) {
      container.innerHTML = S().wizard.isZapier
        ? '<p class="text-sm text-base-content/60 py-2">Geen Odoo-koppeling geselecteerd. Je kunt de koppeling later instellen via de integratiedetails, nadat je een test hebt gestuurd.</p>'
        : '';
      return;
    }

    var cfg = window.FSV2.getModelCfg(action);
    if (!cfg || !cfg.odoo_model) { container.innerHTML = ''; return; }

    var formFields = (S().wizard.form && Array.isArray(S().wizard.form.fields))
      ? S().wizard.form.fields.filter(function (f) { return !window.FSV2.SKIP_TYPES.includes(f.type); })
      : [];

    var odooCache  = (S().odooFieldsCache || {})[cfg.odoo_model] || [];
    var odooLoaded = odooCache.length > 0;

    // If Odoo fields not yet loaded, show spinner and load, then re-render
    if (!odooLoaded) {
      container.innerHTML =
        '<div class="flex items-center gap-2 py-3 text-sm text-base-content/60">' +
        '<span class="loading loading-spinner loading-xs"></span> Odoo-velden worden geladen\u2026</div>';
      window.FSV2.loadOdooFieldsForModel(cfg.odoo_model).then(function () {
        renderWizardMapping();
      });
      return;
    }

    // Pre-seed required fields from default_fields as extra rows the user must fill in
    var preSeededExtras = [];
    if (Array.isArray(cfg.default_fields)) {
      cfg.default_fields.forEach(function (df) {
        if (df.required) {
          preSeededExtras.push({
            odooField:    df.name,
            odooLabel:    df.label || df.name,
            sourceType:   'template',
            staticValue:  '',
            isRequired:   true,
            isIdentifier: false,
            isUpdateField: true,
          });
        }
      });
    }
    S().wizard._preSeededExtras = preSeededExtras;

    // Use the exact same MappingTable component as the detail view
    window.FSV2.MappingTable.render('wizardMappingTable', {
      flatFields:      formFields,
      topLevelFields:  formFields,
      odooCache:       odooCache,
      odooLoaded:      odooLoaded,
      odooModel:       cfg.odoo_model,
      existingFormMappings: {},
      namePrefix:      'wiz-',
      checkPrefix:     'wiz-',
      idCheckClass:    'wiz-id-check',
      updCheckClass:   'wiz-upd-check',
      autoIdentifiers: ['email', 'email_from'],
      extraRows:       preSeededExtras,
      // No saveAction — wizard uses its own submit button
    });
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // WIZARD ACTIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function wizardSelectZapier() {
    S().wizard.isZapier = true;
    S().wizard.site     = null;
    S().wizard.action   = null;
    S().wizard.forms    = [];
    S().wizard.step     = 2;
    // Give wizard a minimal form object so the actions section becomes visible
    S().wizard.form = { form_id: 'zapier', form_name: 'Zapier webhook', fields: [] };
    renderWizard();
    var actionsSec = document.getElementById('wizard-section-actions');
    if (actionsSec) actionsSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
    S().wizard.form         = { form_id: formId, form_name: formName, fields: fields };
    S().wizard.action       = null;
    S().wizard.fieldMappings = {};
    S().wizard.step         = 3;
    var nameInput = document.getElementById('wizardName');
    if (nameInput) nameInput.value = '';
    renderWizard();
    var sec = document.getElementById('wizard-section-actions');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wizardSkipAction() {
    S().wizard.action = null;
    S().wizard.fieldMappings = {};
    S().wizard.step = 3;
    renderWizard();
    var mappingSec = document.getElementById('wizard-section-mapping');
    if (mappingSec) {
      mappingSec.style.display = '';
      mappingSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    var nameInput = document.getElementById('wizardName');
    if (nameInput && !nameInput.value) nameInput.value = 'Zapier webhook';
  }

  function wizardSelectAction(actionKey) {
    S().wizard.action        = actionKey;
    S().wizard.fieldMappings = {};
    S().wizard.step          = 3;
    renderWizard();
    // Show the name + submit section
    var mappingSec = document.getElementById('wizard-section-mapping');
    if (mappingSec) mappingSec.style.display = '';
    var nameInput = document.getElementById('wizardName');
    if (nameInput && !nameInput.value) {
      var cfg      = window.FSV2.getModelCfg(actionKey);
      var sitePart = S().wizard.isZapier ? 'Zapier'
        : (S().wizard.site && S().wizard.site.label) ? S().wizard.site.label : 'Site';
      var formPart = (S().wizard.form && S().wizard.form.form_name)
        ? S().wizard.form.form_name
        : (S().wizard.form ? String(S().wizard.form.form_id) : 'Formulier');
      nameInput.value = sitePart + ' \u2014 ' + formPart + ' \u2014 ' + cfg.label;
    }
    if (mappingSec) mappingSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitWizard() {
    var btn = document.getElementById('btnCreateIntegration');
    if (btn) { btn.disabled = true; btn.textContent = 'Aanmaken...'; }

    try {
      var name = ((document.getElementById('wizardName') || {}).value || '').trim();
      if (!name) throw new Error('Geef de integratie een naam.');

      var isZapierNoAction = S().wizard.isZapier && !S().wizard.action;

      var cfg = window.FSV2.getModelCfg(S().wizard.action);
      if (!isZapierNoAction && (!cfg || !cfg.odoo_model)) throw new Error('Geen model geselecteerd.');
      if (!S().wizard.form) throw new Error('Geen formulier geselecteerd.');

      // Stap 1 — maak integratie aan
      var intPayload = {
        name: name,
        odoo_connection_id: 'default',
      };
      if (S().wizard.isZapier) {
        intPayload.source_type = 'generic_webhook';
      } else {
        intPayload.forminator_form_id = String(S().wizard.form.form_id);
        intPayload.site_key = S().wizard.site ? S().wizard.site.key : null;
      }
      var intRes = await window.FSV2.api('/integrations', {
        method: 'POST',
        body: JSON.stringify(intPayload),
      });
      var integrationId   = intRes.data.id;
      var webhookToken    = intRes.data.webhook_token || null;

      // Voor Zapier zonder Odoo-koppeling: stop hier, toon webhook URL (integratie blijft inactief)
      if (isZapierNoAction) {
        window.FSV2.showAlert('Integratie "' + name + '" aangemaakt! Stuur een test via Zapier om velden te herkennen.', 'success');
        S().wizard.step = 5;
        S().wizard.createdIntegrationId = integrationId;
        S().wizard.createdTargetId = null;
        S().wizard._createdOdooModel = null;
        renderWizardSteps();
        ['sites', 'forms', 'actions', 'mapping'].forEach(function (s) {
          var el = document.getElementById('wizard-section-' + s);
          if (el) el.style.display = 'none';
        });
        var webhookUrlSection = document.getElementById('wizard-section-webhook-url');
        var webhookUrlEl = document.getElementById('wizardWebhookUrl');
        try {
          var wuRes = await window.FSV2.api('/integrations/' + integrationId + '/webhook-url');
          if (webhookUrlEl) webhookUrlEl.textContent = wuRes.data.webhook_url || '';
          S().wizard._webhookUrl = wuRes.data.webhook_url || '';
        } catch (_) {
          if (webhookUrlEl) webhookUrlEl.textContent = '(kon URL niet ophalen)';
        }
        if (webhookUrlSection) {
          webhookUrlSection.style.display = '';
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: webhookUrlSection });
        }
        await window.FSV2.loadIntegrations();
        window.FSV2.renderList();
        return;
      }

      // Stap 2 — maak resolver aan indien model dat vereist
      if (cfg.resolver_type) {
        await window.FSV2.api('/integrations/' + integrationId + '/resolvers', {
          method: 'POST',
          body: JSON.stringify({
            resolver_type:      cfg.resolver_type,
            input_source_field: 'webinar_id',
            create_if_missing:  false,
            output_context_key: 'context.webinar_id',
            order_index: 0,
          }),
        });
      }

      // Stap 3 — maak eerste target aan
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

      // Stap 4 — lees veldkoppelingen uit MappingTable (zelfde manier als detail view)
      var mcEl = document.getElementById('wizardMappingTable');
      var formFieldList = (S().wizard.form && Array.isArray(S().wizard.form.fields))
        ? S().wizard.form.fields.filter(function (f) { return !window.FSV2.SKIP_TYPES.includes(f.type); })
        : [];
      var newMappings = [];
      var orderIdx    = 0;
      formFieldList.forEach(function (ff) {
        var fid      = String(ff.field_id);
        var selEl    = mcEl && mcEl.querySelector('[name="wiz-odoo-' + fid + '"]');
        var odooField = selEl ? (selEl.value || '') : '';
        if (!odooField) return;
        var idChk  = mcEl && mcEl.querySelector('[name="wiz-identifier-' + fid + '"]');
        var updChk = mcEl && mcEl.querySelector('[name="wiz-update-' + fid + '"]');
        newMappings.push({
          odoo_field:      odooField,
          source_type:     'form',
          source_value:    fid,
          is_required:     false,
          is_identifier:   idChk  ? idChk.checked  : false,
          is_update_field: updChk ? updChk.checked  : true,
          order_index:     orderIdx++,
        });
      });
      // Stap 4b — lees ook de verplichte extra rijen (template/static) uit MappingTable
      var preSeeded = S().wizard._preSeededExtras || [];
      preSeeded.forEach(function (em, idx) {
        var tname = 'extra-' + idx;  // extraRowPrefix defaults to 'extra-'
        var inpEl = mcEl && mcEl.querySelector('#inp-' + tname);
        var val   = inpEl ? (inpEl.value || '').trim() : '';
        if (!val) return;  // skip if user left it empty
        var idChk  = mcEl && mcEl.querySelector('input[name="extra-identifier-' + idx + '"]');
        var updChk = mcEl && mcEl.querySelector('input[name="extra-update-' + idx + '"]');
        newMappings.push({
          odoo_field:      em.odooField,
          source_type:     em.sourceType || 'template',
          source_value:    val,
          is_required:     !!em.isRequired,
          is_identifier:   idChk  ? idChk.checked  : false,
          is_update_field: updChk ? updChk.checked  : true,
          order_index:     orderIdx++,
        });
      });

      if (newMappings.length > 0) {
        await Promise.all(newMappings.map(function (m) {
          return window.FSV2.api('/targets/' + targetId + '/mappings', {
            method: 'POST', body: JSON.stringify(m),
          });
        }));
      }

      // Stap 5 — activeer de integratie direct (wizard = bewuste setup)
      await window.FSV2.api('/integrations/' + integrationId, {
        method: 'PUT',
        body: JSON.stringify({ is_active: true }),
      });

      // Stap 6 — test-stub (niet-blokkend)
      try {
        await window.FSV2.api('/integrations/' + integrationId + '/test-stub', {
          method: 'POST', body: JSON.stringify({}),
        });
      } catch (_) { /* non-critical */ }

      window.FSV2.showAlert('Integratie "' + name + '" aangemaakt! Stel nu de veldkoppelingen in.', 'success');

      // Stap 5 — toon afronding
      S().wizard.step = 5;
      S().wizard.createdIntegrationId = integrationId;
      S().wizard.createdTargetId      = targetId;
      S().wizard._createdOdooModel    = cfg.odoo_model;
      renderWizardSteps();
      ['sites', 'zapier', 'forms', 'actions', 'mapping'].forEach(function (s) {
        var el = document.getElementById('wizard-section-' + s);
        if (el) el.style.display = 'none';
      });

      if (S().wizard.isZapier && webhookToken) {
        // Fetch the full webhook URL for display
        var webhookUrlSection = document.getElementById('wizard-section-webhook-url');
        var webhookUrlEl = document.getElementById('wizardWebhookUrl');
        try {
          var wuRes = await window.FSV2.api('/integrations/' + integrationId + '/webhook-url');
          if (webhookUrlEl) webhookUrlEl.textContent = wuRes.data.webhook_url || '';
          S().wizard._webhookUrl = wuRes.data.webhook_url || '';
        } catch (_) {
          if (webhookUrlEl) webhookUrlEl.textContent = '(kon URL niet ophalen)';
        }
        if (webhookUrlSection) {
          webhookUrlSection.style.display = '';
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: webhookUrlSection });
        }
      } else {
        var chatterSection = document.getElementById('wizard-section-chatter');
        if (chatterSection) {
          chatterSection.style.display = '';
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: chatterSection });
        }
      }

    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Integratie aanmaken'; }
    }
  }



  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXPORT &mdash; extend FSV2
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  async function wizardSkipChatter() {
    var integrationId = S().wizard.createdIntegrationId;
    await window.FSV2.loadIntegrations();
    window.FSV2.resetWizard();
    window.FSV2.showView('detail');
    if (integrationId) await window.FSV2.openDetail(integrationId);
  }

  async function wizardAddChatter() {
    var integrationId = S().wizard.createdIntegrationId;
    var btn = document.querySelector('[data-action="wizard-add-chatter"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Toevoegen...'; }
    try {
      var chatterRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
        method: 'POST',
        body: JSON.stringify({
          odoo_model:      (S().wizard._createdOdooModel || 'crm.lead'),
          operation_type:  'chatter_message',
          order_index:     1,
          execution_order: 1,
          identifier_type: 'mapped_fields',
          update_policy:   'always_overwrite',
        }),
      });
      var chatterTargetId = chatterRes.data.id;
      await window.FSV2.api('/targets/' + chatterTargetId + '/mappings', {
        method: 'POST',
        body: JSON.stringify({
          odoo_field:     '_chatter_record_id',
          source_type:    'previous_step_output',
          source_value:   'step.0.record_id',
          is_identifier:  true,
          is_required:    true,
          is_update_field: false,
          order_index:    0,
        }),
      });
      await window.FSV2.loadIntegrations();
      window.FSV2.resetWizard();
      window.FSV2.showView('detail');
      if (integrationId) {
        await window.FSV2.openDetail(integrationId);
        if (chatterTargetId && window.FSV2.toggleStepOpen) {
          window.FSV2.toggleStepOpen(String(chatterTargetId), integrationId, true);
        }
      }
    } catch (e) {
      window.FSV2.showAlert('Fout bij aanmaken chatter-stap: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Ja, voeg chatter-notitie toe'; }
    }
  }

  Object.assign(window.FSV2, {
    renderWizard:         renderWizard,
    renderWizardSteps:    renderWizardSteps,
    renderWizardSites:    renderWizardSites,
    renderWizardForms:    renderWizardForms,
    renderWizardMapping:  renderWizardMapping,
    renderWizardActions:  renderWizardActions,
    wizardSelectSite:     wizardSelectSite,
    wizardSelectZapier:   wizardSelectZapier,
    wizardSelectForm:     wizardSelectForm,
    wizardSelectAction:   wizardSelectAction,
    wizardSkipAction:     wizardSkipAction,
    submitWizard:         submitWizard,
    wizardSkipChatter:    wizardSkipChatter,
    wizardAddChatter:     wizardAddChatter,
  });

}());
