/**
 * Forminator Sync V2 -- Detail -- Stap toevoegen wizard
 *
 * Split out of the former monolithic forminator-sync-v2-detail.js (5227 lines)
 * to reduce editing risk on large files (see CLAUDE.md).
 * No functional changes were made in the split.
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2), sibling forminator-sync-v2-detail-*.js
 * files (cross-file calls go through window.FSV2.*).
 */
(function () {
  'use strict';

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  var MAILING_PREFIX = '__MAILING__:';

  function renderAddTargetDialog() {
    var container = document.getElementById('addTargetObjectCards');
    if (!container) return;
    var dlg = document.getElementById('addTargetDialog');
    var sel = dlg ? (dlg.dataset.selectedObject || '') : '';

    var models = Array.isArray(S().odooModelsCache) && S().odooModelsCache.length
      ? S().odooModelsCache
      : (window.FSV2.DEFAULT_ODOO_MODELS || []);

    var SPECIAL = [
      { id: 'chatter_message', icon: 'message-square', label: 'Chatter-bericht',  desc: 'Bericht in de chatter plaatsen' },
      { id: 'create_activity', icon: 'calendar-check', label: 'Activiteit',        desc: 'Taak inplannen op een record' },
      { id: 'mailing_list',    icon: 'mail',           label: 'Mailinglijst',     desc: 'Toevoegen/verwijderen uit mailinglijst' },
    ];

    var modelCards = models.map(function (m, i) {
      var isActive = sel === (m.odoo_model || m.name);
      var icon     = m.icon || 'box';
      var label    = m.label || m.odoo_model || m.name;
      var modelId  = m.name;
      var isOrphan = (i === models.length - 1) && (models.length % 2 === 1);
      return '<button type="button"' +
        ' class="btn btn-outline w-full justify-start gap-3' + (isActive ? ' btn-primary' : '') + (isOrphan ? ' col-span-2' : '') + '"' +
        ' data-action="select-target-object" data-object-id="' + esc(modelId) + '">' +
        '<i data-lucide="' + esc(icon) + '" class="w-5 h-5 shrink-0"></i>' +
        '<span class="text-left font-semibold">' + esc(label) + '</span>' +
        '</button>';
    }).join('');

    var specialCards = SPECIAL.map(function (s, i) {
      var isActive = sel === s.id;
      var isOrphan = (i === SPECIAL.length - 1) && (SPECIAL.length % 2 === 1);
      return '<button type="button"' +
        ' class="btn btn-outline w-full justify-start gap-3' + (isActive ? ' btn-primary' : '') + (isOrphan ? ' col-span-2' : '') + '"' +
        ' data-action="select-target-object" data-object-id="' + esc(s.id) + '">' +
        '<i data-lucide="' + esc(s.icon) + '" class="w-5 h-5 shrink-0"></i>' +
        '<span class="text-left"><span class="font-semibold">' + esc(s.label) + '</span>' +
          '<span class="block text-xs font-normal opacity-70">' + esc(s.desc) + '</span></span>' +
        '</button>';
    }).join('');

    container.innerHTML = modelCards + (models.length ? '<div class="divider my-1 col-span-2"></div>' : '') + specialCards;

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ context: container });
    }
  }

  // ── Fase 2: Operatie-kaarten in #addTargetOpCards ───────────────────────────
  function renderAddTargetStep2() {
    var container = document.getElementById('addTargetOpCards');
    if (!container) return;
    var dlg = document.getElementById('addTargetDialog');
    var objId = dlg ? (dlg.dataset.selectedObject || '') : '';

    var titleEl = document.getElementById('addTargetStep2Title');
    var descEl  = document.getElementById('addTargetStep2Desc');

    if (objId === 'mailing_list') {
      if (titleEl) titleEl.textContent = 'Mailinglijst';
      if (descEl)  descEl.textContent  = 'Welke actie en modus voor dit mailingcontact?';
      renderAddTargetMailingListStep2(dlg, container);
      return;
    }
    if (titleEl) titleEl.textContent = 'Operatie';
    if (descEl)  descEl.textContent  = 'Wat moet er met het record gebeuren?';

    var sel = dlg ? (dlg.dataset.selectedOp || '') : '';

    var OPS = [
      { opType: 'upsert',      icon: 'git-merge',  label: 'Zoeken + bijwerken of aanmaken', desc: 'Zoek op identifier; update of maak nieuw aan' },
      { opType: 'create',      icon: 'plus-circle', label: 'Altijd nieuw aanmaken',           desc: 'Maakt altijd een nieuw record' },
      { opType: 'update_only', icon: 'pencil',      label: 'Alleen bijwerken',                desc: 'Werkt alleen bij als record gevonden wordt' },
    ];

    container.innerHTML = OPS.map(function (o) {
      var isActive = sel === o.opType;
      return '<button type="button"' +
        ' class="btn btn-outline w-full justify-start gap-3' + (isActive ? ' btn-primary' : '') + '"' +
        ' data-action="select-target-op" data-op-type="' + esc(o.opType) + '">' +
        '<i data-lucide="' + esc(o.icon) + '" class="w-5 h-5 shrink-0"></i>' +
        '<span class="text-left"><span class="font-semibold">' + esc(o.label) + '</span>' +
          '<span class="block text-xs font-normal opacity-70">' + esc(o.desc) + '</span></span>' +
        '</button>';
    }).join('');

    var confirmBtn = document.getElementById('confirmAddTargetBtn');
    if (confirmBtn) confirmBtn.disabled = !sel;

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ context: container });
    }
  }

  // ── Fase 1, Stap 2 voor mailing_list: Actie (toevoegen/verwijderen) + Modus ─
  // i.p.v. de generieke upsert/create/update_only-keuze — die is hier niet van
  // toepassing (het "record" is altijd mailing.contact, niet het gekozen model).
  function renderAddTargetMailingListStep2(dlg, container) {
    if (!dlg.dataset.mlAction) dlg.dataset.mlAction = 'add';
    if (!dlg.dataset.mlMode)   dlg.dataset.mlMode   = 'upsert';
    dlg.dataset.selectedOp = 'mailing_list'; // altijd geldig: Actie/Modus hebben defaults

    var mlAction = dlg.dataset.mlAction;
    var mlMode   = dlg.dataset.mlMode;

    var html = '<div class="flex flex-col gap-4">';

    html += '<div class="form-control">' +
      '<label class="label pt-0 pb-1"><span class="label-text font-semibold">Actie</span></label>' +
      '<div class="join w-full">' +
        ['add', 'remove'].map(function (val) {
          var lbl    = val === 'add' ? 'Toevoegen' : 'Verwijderen';
          var active = mlAction === val;
          return '<button type="button" class="btn btn-outline join-item flex-1' + (active ? ' btn-primary' : '') + '"' +
            ' data-action="add-target-ml-action" data-val="' + val + '">' + lbl + '</button>';
        }).join('') +
      '</div>' +
      '<span class="label-text-alt text-xs opacity-60 mt-1">Contact toevoegen aan, of verwijderen uit, de mailinglijst(en)</span>' +
    '</div>';

    html += '<div class="form-control">' +
      '<label class="label pt-0 pb-1"><span class="label-text font-semibold">Modus</span></label>' +
      '<div class="join w-full">' +
        [
          { val: 'upsert',      lbl: 'Bijwerken of aanmaken' },
          { val: 'update_only', lbl: 'Alleen bijwerken'      },
        ].map(function (o) {
          var active = mlMode === o.val;
          return '<button type="button" class="btn btn-outline join-item flex-1' + (active ? ' btn-primary' : '') + '"' +
            ' data-action="add-target-ml-mode" data-val="' + o.val + '">' + o.lbl + '</button>';
        }).join('') +
      '</div>' +
      '<span class="label-text-alt text-xs opacity-60 mt-1">Bepaalt of een onbekend mailingcontact wordt aangemaakt</span>' +
    '</div>';

    html += '</div>';
    container.innerHTML = html;

    var confirmBtn = document.getElementById('confirmAddTargetBtn');
    if (confirmBtn) confirmBtn.disabled = false;
  }

  // ── Fase 1: Handle confirmed "Stap toevoegen" from intent-picker ───────────
  async function handleAddTargetWithType(integrationId, objectId, opType, extra) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var maxOrder = targets.reduce(function (max, t) {
      return Math.max(max, window.FSV2.getTargetOrder(t, 0));
    }, 0);

    if (objectId === 'create_activity') {
      var actCompatibles = targets.filter(function (t) {
        return t.operation_type !== 'chatter_message' && t.operation_type !== 'create_activity' && t.odoo_model;
      }).sort(function (a, b) { return window.FSV2.getTargetOrder(a, 0) - window.FSV2.getTargetOrder(b, 0); });

      if (!actCompatibles.length) {
        window.FSV2.showAlert('Voeg eerst een stap toe die een record aanmaakt voordat je een activiteit-stap kunt koppelen.', 'error');
        return;
      }

      var actParent     = actCompatibles[0];
      var actParentOrd  = window.FSV2.getTargetOrder(actParent, 0);
      var actNewOrder   = maxOrder + 1;

      var actRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
        method: 'POST',
        body: JSON.stringify({
          odoo_model:              actParent.odoo_model,
          identifier_type:         'mapped_fields',
          update_policy:           'always_overwrite',
          operation_type:          'create_activity',
          execution_order:         actNewOrder,
          order_index:             actNewOrder,
          activity_res_id_source:  'step.' + actParentOrd + '.record_id',
          activity_deadline_offset: 1,
        }),
      });

      var actNewId = actRes.data && actRes.data.id;
      window.FSV2.showAlert('Activiteit-stap toegevoegd.', 'success');
      await window.FSV2.openDetail(S().activeId);
      if (actNewId) {
        var poAct = window.FSV2.getPipelineOpen(integrationId);
        poAct[String(actNewId)] = true;
        window.FSV2.renderDetailMappings();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
      return;
    }

    if (objectId === 'chatter_message') {
      // Find the first compatible preceding target (non-chatter, has a model)
      var compatibles = targets.filter(function (t) {
        return t.operation_type !== 'chatter_message' && t.odoo_model;
      }).sort(function (a, b) { return window.FSV2.getTargetOrder(a, 0) - window.FSV2.getTargetOrder(b, 0); });

      if (!compatibles.length) {
        window.FSV2.showAlert('Voeg eerst een schrijfdoel (upsert/aanmaken/bijwerken) toe voordat je een chatter-stap kunt koppelen.', 'error');
        return;
      }

      var parentTarget = compatibles[0];
      var parentOrder  = window.FSV2.getTargetOrder(parentTarget, 0);
      var newOrder     = maxOrder + 1;

      var chatterRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
        method: 'POST',
        body: JSON.stringify({
          odoo_model:      parentTarget.odoo_model,
          identifier_type: 'mapped_fields',
          update_policy:   'always_overwrite',
          operation_type:  'chatter_message',
          execution_order: newOrder,
          order_index:     newOrder,
        }),
      });
      var chatterTargetId = chatterRes.data && chatterRes.data.id;

      if (chatterTargetId) {
        await window.FSV2.api('/targets/' + chatterTargetId + '/mappings', {
          method: 'POST',
          body: JSON.stringify({
            odoo_field:      '_chatter_record_id',
            source_type:     'previous_step_output',
            source_value:    'step.' + parentOrder + '.record_id',
            is_identifier:   true,
            is_required:     true,
            is_update_field: false,
            order_index:     0,
          }),
        });
      }

      window.FSV2.showAlert('Chatter-stap toegevoegd.', 'success');
      var integId = integrationId;
      await window.FSV2.openDetail(S().activeId);
      // Open the new chatter card automatically
      if (chatterTargetId) {
        var po = window.FSV2.getPipelineOpen(integId);
        po[String(chatterTargetId)] = true;
        window.FSV2.renderDetailMappings();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
      return;
    }

    if (objectId === 'mailing_list') {
      var mlNewOrder = maxOrder + 1;
      var mlInitAction = (extra && extra.mlAction) || 'add';
      var mlInitMode   = (extra && extra.mlMode)   || 'upsert';
      var mlInitCfg    = MAILING_PREFIX + JSON.stringify({ action: mlInitAction, update_mode: mlInitMode, list_ids: [] });
      var mlRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
        method: 'POST',
        body: JSON.stringify({
          odoo_model:       'mailing.contact',
          identifier_type:  'mapped_fields',
          update_policy:    'always_overwrite',
          operation_type:   'mailing_list',
          execution_order:  mlNewOrder,
          order_index:      mlNewOrder,
          chatter_template: mlInitCfg,
        }),
      });
      var mlTargetId = mlRes && mlRes.data && mlRes.data.id;
      window.FSV2.showAlert('Mailinglijst-stap toegevoegd. Stel de configuratie in.', 'success');
      await window.FSV2.openDetail(S().activeId);
      if (mlTargetId) {
        var poMl = window.FSV2.getPipelineOpen(integrationId);
        poMl[String(mlTargetId)] = true;
        window.FSV2.renderDetailMappings();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
      return;
    }

    var chosenModel  = objectId || '';
    var actualOpType = opType   || 'upsert';
    if (!chosenModel) {
      window.FSV2.showAlert('Kies een model voor de nieuwe stap.', 'error');
      return;
    }

    var actionCfg = window.FSV2.getModelCfg ? (window.FSV2.getModelCfg(chosenModel) || {}) : {};
    // Use actual Odoo model name (resolved from slug via actionCfg.odoo_model)
    var odooModelName = actionCfg.odoo_model || chosenModel;

    var newTargetRes;
    try {
      newTargetRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
        method: 'POST',
        body: JSON.stringify({
          odoo_model:      odooModelName,
          identifier_type: actionCfg.identifier_type || 'mapped_fields',
          update_policy:   actionCfg.update_policy   || 'always_overwrite',
          operation_type:  actualOpType || 'upsert',
          execution_order: maxOrder + 1,
        }),
      });
    } catch (e) {
      window.FSV2.showAlert('Stap aanmaken mislukt: ' + (e.message || 'onbekende fout'), 'error');
      return;
    }
    var newTargetId = newTargetRes && newTargetRes.data && newTargetRes.data.id;

    // Post fixed_fields (vaste waarden) as static mappings
    if (newTargetId) {
      var fixedFields = Array.isArray(actionCfg.fixed_fields) ? actionCfg.fixed_fields : [];
      var skippedFixed = [];
      for (var ffi = 0; ffi < fixedFields.length; ffi++) {
        var ff = fixedFields[ffi];
        if (!ff || !ff.name) continue;
        // Boolean false must become 'false'; only skip truly absent values
        var rawVal = ff.value;
        if (rawVal === null || rawVal === undefined || rawVal === '') {
          skippedFixed.push(ff.name);
          continue;
        }
        var ffVal = String(rawVal);
        try {
          await window.FSV2.api('/targets/' + newTargetId + '/mappings', {
            method: 'POST',
            body: JSON.stringify({
              odoo_field:      ff.name,
              source_type:     'static',
              source_value:    ffVal,
              is_identifier:   false,
              is_required:     false,
              is_update_field: true,
              order_index:     ffi,
            }),
          });
        } catch (e) {
          skippedFixed.push(ff.name);
          console.warn('fixed_field mapping failed for ' + ff.name, e);
        }
      }
      if (skippedFixed.length) {
        window.FSV2.showAlert('Vaste waarden niet ingevuld voor: ' + skippedFixed.join(', ') + '. Stel ze opnieuw in via Instellingen.', 'error');
      }
    }

    window.FSV2.showAlert('Stap toegevoegd.', 'success');
    await window.FSV2.openDetail(S().activeId);
  }

  // ── Fase 2: HTML form-summary modal ─────────────────────────────────────────
  var _htmlSummaryPreviewTimer = null;
  var _htmlSummaryTargetId     = null;

  function openHtmlSummaryModal(targetId, odooModel) {
    _htmlSummaryTargetId = targetId;
    var modal = document.getElementById('htmlSummaryModal');
    if (!modal) { window.FSV2.showAlert('Dialog niet gevonden.', 'error'); return; }

    // Render FieldPicker for Odoo-field selection
    var fpContainer = document.getElementById('htmlSummaryOdooFieldPicker');
    if (fpContainer) {
      var odooCache = (S().odooFieldsCache && odooModel && S().odooFieldsCache[odooModel]) || [];
      fpContainer.innerHTML = window.OpenVME.FieldPicker.render('hsm-fp', '--unused--', odooCache, '');
      var fpInput = document.getElementById('fsp-val-hsm-fp');
      if (fpInput) {
        fpInput.addEventListener('change', function () {
          var confirmBtn = document.getElementById('confirmHtmlSummaryBtn');
          if (confirmBtn) confirmBtn.disabled = !fpInput.value.trim();
          scheduleHtmlSummaryPreview();
        });
      }
    }

    // Populate field checkboxes
    var checksContainer = document.getElementById('htmlSummaryFieldChecks');
    if (checksContainer) {
      var flatFields = (window.FSV2.buildDetailFlatFields(S().detailFormFields || []).flatFields || []);
      checksContainer.innerHTML = flatFields.map(function (f) {
        var fid = f.name || f.id;
        return '<label class="flex items-center gap-2 cursor-pointer">' +
          '<input type="checkbox" class="checkbox checkbox-xs" value="' + esc(fid) + '" checked>' +
          '<span class="text-xs">' + esc(f.label || fid) + '</span>' +
        '</label>';
      }).join('');
      checksContainer.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.addEventListener('change', scheduleHtmlSummaryPreview);
      });
    }

    // Radio handlers
    modal.querySelectorAll('input[name="htmlSummaryScope"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var sel = document.getElementById('htmlSummaryFieldChecks');
        if (sel) sel.style.display = r.value === 'selected' ? '' : 'none';
        scheduleHtmlSummaryPreview();
      });
    });

    // Reset scope to 'all'
    var allRadio = modal.querySelector('input[name="htmlSummaryScope"][value="all"]');
    if (allRadio) { allRadio.checked = true; allRadio.dispatchEvent(new Event('change')); }

    var confirmBtn = document.getElementById('confirmHtmlSummaryBtn');
    if (confirmBtn) confirmBtn.disabled = true;

    scheduleHtmlSummaryPreview();
    modal.showModal();
  }

  function scheduleHtmlSummaryPreview() {
    clearTimeout(_htmlSummaryPreviewTimer);
    _htmlSummaryPreviewTimer = setTimeout(updateHtmlSummaryPreview, 150);
  }

  function updateHtmlSummaryPreview() {
    var iframe = document.getElementById('htmlSummaryPreviewFrame');
    if (!iframe || !iframe.contentDocument) return;

    var scopeEl  = document.querySelector('input[name="htmlSummaryScope"]:checked');
    var isAll    = !scopeEl || scopeEl.value === 'all';
    var fieldIds = null;

    if (!isAll) {
      fieldIds = Array.from(
        document.querySelectorAll('#htmlSummaryFieldChecks input:checked')
      ).map(function (cb) { return cb.value; });
    }

    var sampleForm = {};
    var flatFields = (window.FSV2.buildDetailFlatFields(S().detailFormFields || []).flatFields || []);
    flatFields.forEach(function (f) { if (f.field_id) sampleForm[f.field_id] = window.FSV2._makeSampleValue(f); });

    var html = window.FSV2.buildHtmlFormSummary
      ? window.FSV2.buildHtmlFormSummary(fieldIds, sampleForm)
      : '';
    iframe.contentDocument.body.style.cssText = 'margin:8px;font-family:sans-serif;font-size:14px';
    iframe.contentDocument.body.innerHTML = html
      || '<p style="color:#9ca3af;font-size:13px">Geen velden geselecteerd.</p>';
    iframe.style.height = (iframe.contentDocument.body.scrollHeight + 16) + 'px';
  }

  function confirmHtmlSummary() {
    var tid    = _htmlSummaryTargetId;
    if (!tid) { window.FSV2.showAlert('Geen doel geselecteerd.', 'error'); return; }

    var fpInput = document.getElementById('fsp-val-hsm-fp');
    var odooField = fpInput ? fpInput.value.trim() : '';
    if (!odooField) { window.FSV2.showAlert('Kies een Odoo-veld.', 'error'); return; }

    var scopeEl  = document.querySelector('input[name="htmlSummaryScope"]:checked');
    var isAll    = !scopeEl || scopeEl.value === 'all';
    var fieldIds = null;
    if (!isAll) {
      fieldIds = Array.from(
        document.querySelectorAll('#htmlSummaryFieldChecks input:checked')
      ).map(function (cb) { return cb.value; });
      if (!fieldIds.length) {
        window.FSV2.showAlert('Selecteer minimaal \u00e9\u00e9n veld.', 'error');
        return;
      }
    }

    var target = S().detail && S().detail.targets &&
      S().detail.targets.find(function (t) { return String(t.id) === tid; });
    var odooModel = target ? target.odoo_model : '';
    var odooCache = S().odooFieldsCache && odooModel ? (S().odooFieldsCache[odooModel] || []) : [];
    var odooMeta  = odooCache.find(function (f) { return f.name === odooField; });

    S().detail._extraRowsByTarget = S().detail._extraRowsByTarget || {};
    S().detail._extraRowsByTarget[tid] = S().detail._extraRowsByTarget[tid] || [];
    S().detail._extraRowsByTarget[tid].push({
      odooField:     odooField,
      odooLabel:     odooMeta ? odooMeta.label : odooField,
      staticValue:   fieldIds ? JSON.stringify(fieldIds) : null,
      sourceType:    'html_form_summary',
      isIdentifier:  false,
      isUpdateField: true,
    });

    var modal = document.getElementById('htmlSummaryModal');
    if (modal) modal.close();
    window.FSV2.renderDetailMappings();
  }


  Object.assign(window.FSV2, {
    confirmHtmlSummary: confirmHtmlSummary,
    handleAddTargetWithType: handleAddTargetWithType,
    openHtmlSummaryModal: openHtmlSummaryModal,
    renderAddTargetDialog: renderAddTargetDialog,
    renderAddTargetStep2: renderAddTargetStep2,
    scheduleHtmlSummaryPreview: scheduleHtmlSummaryPreview,
    updateHtmlSummaryPreview: updateHtmlSummaryPreview
  });
})();
