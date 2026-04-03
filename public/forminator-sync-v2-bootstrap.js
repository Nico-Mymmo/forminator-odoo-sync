/**
 * Forminator Sync V2 \u2014 Bootstrap
 *
 * Defensive guard → event delegation (click + input) → bootstrap().
 *
 * Dependencies (must be loaded before this file):
 *   1. field-picker-component.js  (window.OpenVME.FieldPicker)
 *   2. forminator-sync-v2-core.js (window.FSV2 + S)
 *   3. forminator-sync-v2-wizard.js
 *   4. forminator-sync-v2-detail.js
 */
(function () {
  'use strict';

  // ── Defensive guard ────────────────────────────────────────────────────────
  if (!window.FSV2 || !window.FSV2.S) {
    console.error('[FSV2] Core niet geladen. bootstrap.js aborts.');
    return;
  }

  // Convenience alias to shared state object
  var S = window.FSV2.S;

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION \u2014 click
  // ═══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (event) {

    // ── Custom field picker ────────────────────────────────────────────────
    var fspTrigger = event.target.closest('.fsp-trigger');
    var fspItem    = event.target.closest('.fsp-item');
    if (fspTrigger) {
      var fspId = fspTrigger.dataset.fspId;
      var panel = document.getElementById('fsp-panel-' + fspId);
      if (panel) {
        var isOpen = !panel.classList.contains('hidden');
        window.OpenVME.FieldPicker.closeAll();
        if (!isOpen) {
          var rect = fspTrigger.getBoundingClientRect();
          if (panel.parentElement !== document.body) document.body.appendChild(panel);
          panel.style.top   = (rect.bottom + window.scrollY + 4) + 'px';
          panel.style.left  = (rect.left + window.scrollX) + 'px';
          panel.style.width = Math.max(rect.width, 360) + 'px';
          panel.classList.remove('hidden');
          var srch = panel.querySelector('.fsp-search');
          if (srch) {
            srch.value = '';
            window.OpenVME.FieldPicker.filterList(fspId, '');
            srch.focus();
          }
        }
      }
      return;
    }
    if (fspItem) {
      window.OpenVME.FieldPicker.setValue(
        fspItem.dataset.fspId,
        fspItem.dataset.fspName  || '',
        fspItem.dataset.fspLabel || ''
      );
      return;
    }
    if (!event.target.closest('.fsp-wrap') && !event.target.closest('.fsp-panel')) window.OpenVME.FieldPicker.closeAll();

    // ── Insert placeholder chips ───────────────────────────────────────────
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

    // ── data-action delegation ─────────────────────────────────────────────
    var btn = event.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    var run = async function () {

      if (action === 'goto-connections') {
        window.FSV2.showView('connections');
        window.FSV2.renderConnections();
        return;
      }
      if (action === 'goto-defaults') {
        window.FSV2.showView('defaults');
        window.FSV2.renderDefaults();
        (S.odooModelsCache || []).forEach(function (model) {
          var m = model.name;
          if (!S.odooFieldsCache[m] || !S.odooFieldsCache[m].length) {
            window.FSV2.loadOdooFieldsForModel(m).then(function () {
              if (S.view === 'defaults') window.FSV2.renderDefaults();
            });
          }
        });
        return;
      }
      if (action === 'goto-links') {
        window.FSV2.showView('links');
        window.FSV2.renderLinks();
        return;
      }
      // ── Link registry CRUD ────────────────────────────────────────────
      if (action === 'discover-link-fields') {
        var modelAEl = document.getElementById('linkModelA');
        var modelBEl = document.getElementById('linkModelB');
        var modelA   = modelAEl ? modelAEl.value : '';
        var modelB   = modelBEl ? modelBEl.value : '';
        if (!modelA || !modelB) { window.FSV2.showAlert('Kies beide modellen.', 'error'); return; }
        if (modelA === modelB)  { window.FSV2.showAlert('Kies twee verschillende modellen.', 'error'); return; }
        var resultEl = document.getElementById('linkFieldsResult');
        if (resultEl) resultEl.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
        // Fetch fields for model_b and filter for many2one pointing to model_a
        var fieldsBody = await window.FSV2.api('/odoo/fields?model=' + encodeURIComponent(modelB));
        var allFields  = fieldsBody.data || [];
        var candidates = allFields.filter(function (f) { return f.type === 'many2one' && f.relation === modelA; });
        window.FSV2.renderLinkFieldsResult(candidates, modelA, modelB);
        return;
      }
      if (action === 'add-model-link') {
        var newLink = {
          model_a:    btn.dataset.modelA,
          model_b:    btn.dataset.modelB,
          link_field: btn.dataset.field,
          link_label: btn.dataset.label || '',
        };
        var current = Array.isArray(S.modelLinksCache) ? S.modelLinksCache : [];
        // Prevent duplicates
        var exists = current.some(function (l) {
          return l.model_a === newLink.model_a && l.model_b === newLink.model_b && l.link_field === newLink.link_field;
        });
        if (exists) { window.FSV2.showAlert('Koppeling bestaat al.', 'info'); return; }
        var updated = current.concat([newLink]);
        await window.FSV2.api('/settings/model-links', { method: 'PUT', body: JSON.stringify({ links: updated }) });
        S.modelLinksCache = updated;
        window.FSV2.showAlert('Koppeling opgeslagen.', 'success');
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'delete-model-link') {
        var delIdx = parseInt(btn.dataset.idx, 10);
        if (isNaN(delIdx)) return;
        var withoutDel = (S.modelLinksCache || []).filter(function (_, i) { return i !== delIdx; });
        await window.FSV2.api('/settings/model-links', { method: 'PUT', body: JSON.stringify({ links: withoutDel }) });
        S.modelLinksCache = withoutDel;
        window.FSV2.showAlert('Koppeling verwijderd.', 'success');
        window.FSV2.renderLinks();
        return;
      }
      // ── Odoo model registry CRUD ──────────────────────────────────────
      if (action === 'add-odoo-model') {
        var nameEl  = document.getElementById('newModelName');
        var labelEl = document.getElementById('newModelLabel');
        var iconEl  = document.getElementById('newModelIcon');
        var mName   = nameEl  ? nameEl.value.trim()  : '';
        var mLabel  = labelEl ? labelEl.value.trim() : '';
        var mIcon   = iconEl  ? iconEl.value.trim()  : 'box';
        if (!mName)  { window.FSV2.showAlert('Technische naam is verplicht.', 'error'); return; }
        if (!mLabel) { window.FSV2.showAlert('Label is verplicht.', 'error'); return; }
        var currentModels = Array.isArray(S.odooModelsCache) ? S.odooModelsCache : [];
        if (currentModels.some(function (m) { return m.name === mName; })) {
          window.FSV2.showAlert('Model bestaat al.', 'info'); return;
        }
        var updatedModels = currentModels.concat([{ name: mName, label: mLabel, icon: mIcon }]);
        await window.FSV2.api('/settings/odoo-models', { method: 'PUT', body: JSON.stringify({ models: updatedModels }) });
        S.odooModelsCache = updatedModels;
        if (nameEl)  nameEl.value  = '';
        if (labelEl) labelEl.value = '';
        window.FSV2.showAlert('Model opgeslagen.', 'success');
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'delete-odoo-model') {
        var delModelIdx = parseInt(btn.dataset.idx, 10);
        if (isNaN(delModelIdx)) return;
        var withoutModel = (S.odooModelsCache || []).filter(function (_, i) { return i !== delModelIdx; });
        await window.FSV2.api('/settings/odoo-models', { method: 'PUT', body: JSON.stringify({ models: withoutModel }) });
        S.odooModelsCache = withoutModel;
        window.FSV2.showAlert('Model verwijderd.', 'success');
        window.FSV2.renderLinks();
        return;
      }
      // ── Odoo model inline edit ────────────────────────────────────────────
      if (action === 'edit-odoo-model') {
        var editModelIdx = parseInt(btn.dataset.idx, 10);
        S.editingModelIdx = editModelIdx;
        S.editingLinkIdx  = null;
        var editModel = (S.odooModelsCache || [])[editModelIdx] || {};
        S.editingDefaultFields = Array.isArray(editModel.default_fields)
          ? editModel.default_fields.map(function (f) { return Object.assign({}, f); })
          : [];
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'cancel-edit-model') {
        S.editingModelIdx = null;
        S.editingDefaultFields = null;
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'add-default-field') {
        var nameInp  = document.getElementById('editNewFieldName');
        var labelInp = document.getElementById('editNewFieldLabel');
        var reqInp   = document.getElementById('editNewFieldRequired');
        var fname  = nameInp  ? nameInp.value.trim()  : '';
        var flabel = labelInp ? labelInp.value.trim() : '';
        var freq   = reqInp   ? reqInp.checked : false;
        if (!fname) { window.FSV2.showAlert('Technische naam is verplicht.', 'error'); return; }
        if (!Array.isArray(S.editingDefaultFields)) S.editingDefaultFields = [];
        if (S.editingDefaultFields.some(function (f) { return f.name === fname; })) {
          window.FSV2.showAlert('Veld bestaat al.', 'info'); return;
        }
        S.editingDefaultFields.push({ name: fname, label: flabel || fname, required: freq });
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'toggle-default-field-required') {
        var togIdx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(togIdx) && Array.isArray(S.editingDefaultFields) && S.editingDefaultFields[togIdx]) {
          S.editingDefaultFields[togIdx].required = btn.checked;
          window.FSV2.renderLinks();
        }
        return;
      }
      if (action === 'remove-default-field') {
        var rmIdx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(rmIdx) && Array.isArray(S.editingDefaultFields)) {
          S.editingDefaultFields.splice(rmIdx, 1);
          window.FSV2.renderLinks();
        }
        return;
      }
      if (action === 'save-odoo-model') {
        var saveIdx   = parseInt(btn.dataset.idx, 10);
        var modelName = btn.dataset.name;
        var labelEl   = document.getElementById('editModelLabel');
        var iconEl    = document.getElementById('editModelIcon');
        var newLabel  = labelEl ? labelEl.value.trim() : '';
        var newIcon   = iconEl  ? iconEl.value.trim()  : 'box';
        if (!newLabel) { window.FSV2.showAlert('Label is verplicht.', 'error'); return; }
        var existingDefaultFields = ((S.odooModelsCache || [])[saveIdx] || {}).default_fields || [];
        var newDefaultFields = Array.isArray(S.editingDefaultFields) ? S.editingDefaultFields : existingDefaultFields;
        var updatedModels = (S.odooModelsCache || []).map(function (m, i) {
          return i === saveIdx ? { name: m.name, label: newLabel, icon: newIcon, default_fields: newDefaultFields } : m;
        });
        await window.FSV2.api('/settings/odoo-models', { method: 'PUT', body: JSON.stringify({ models: updatedModels }) });
        S.odooModelsCache = updatedModels;
        S.editingModelIdx = null;
        S.editingDefaultFields = null;
        window.FSV2.showAlert('Model bijgewerkt.', 'success');
        window.FSV2.renderLinks();
        return;
      }
      // ── Model link inline edit ────────────────────────────────────────────
      if (action === 'edit-model-link') {
        S.editingLinkIdx  = parseInt(btn.dataset.idx, 10);
        S.editingModelIdx = null;
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'cancel-edit-link') {
        S.editingLinkIdx = null;
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'save-model-link') {
        var saveLinkIdx = parseInt(btn.dataset.idx, 10);
        var linkLabelEl = document.getElementById('editLinkLabel');
        var newLinkLabel = linkLabelEl ? linkLabelEl.value.trim() : '';
        var updatedLinks = (S.modelLinksCache || []).map(function (l, i) {
          return i === saveLinkIdx ? Object.assign({}, l, { link_label: newLinkLabel }) : l;
        });
        await window.FSV2.api('/settings/model-links', { method: 'PUT', body: JSON.stringify({ links: updatedLinks }) });
        S.modelLinksCache = updatedLinks;
        S.editingLinkIdx  = null;
        window.FSV2.showAlert('Koppeling bijgewerkt.', 'success');
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'goto-list') {
        await window.FSV2.loadIntegrations();
        window.FSV2.showView('list');
        window.FSV2.renderList();
        return;
      }
      if (action === 'goto-wizard') {
        window.FSV2.resetWizard();
        window.FSV2.showView('wizard');
        window.FSV2.renderWizard();
        return;
      }
      if (action === 'open-detail') {
        await window.FSV2.openDetail(btn.dataset.id);
        return;
      }
      if (action === 'delete-integration') {
        await window.FSV2.handleDeleteIntegration(btn.dataset.id, btn.dataset.name || 'Integratie');
        return;
      }
      if (action === 'wizard-select-site') {
        await window.FSV2.wizardSelectSite(btn.dataset.key, btn.dataset.url, btn.dataset.label);
        return;
      }
      if (action === 'wizard-select-zapier') {
        await window.FSV2.wizardSelectZapier();
        return;
      }
      if (action === 'wizard-select-form') {
        var fields = [];
        try { fields = JSON.parse(btn.dataset.fields || '[]'); } catch (_) {}
        window.FSV2.wizardSelectForm(btn.dataset.formId, btn.dataset.formName, fields);
        return;
      }
      if (action === 'wizard-select-action') {
        window.FSV2.wizardSelectAction(btn.dataset.key);
        return;
      }
      if (action === 'wizard-skip-action') {
        window.FSV2.wizardSkipAction();
        return;
      }
      if (action === 'submit-wizard') {
        await window.FSV2.submitWizard();
        return;
      }
      if (action === 'delete-mapping') {
        await window.FSV2.handleDeleteMapping(btn.dataset.id);
        return;
      }
      if (action === 'toggle-identifier') {
        await window.FSV2.handleToggleIdentifier(btn.dataset.id);
        return;
      }
      if (action === 'replay-submission') {
        await window.FSV2.handleReplay(btn.dataset.id);
        return;
      }
      if (action === 'add-target') {
        await window.FSV2.handleAddTarget(btn.dataset.integrationid);
        return;
      }
      if (action === 'delete-target') {
        await window.FSV2.handleDeleteTarget(btn.dataset.targetId, btn.dataset.integrationId);
        return;
      }
      if (action === 'toggle-step-open') {
        window.FSV2.toggleStepOpen(btn.dataset.targetId);
        return;
      }
      if (action === 'reorder-target-up') {
        await window.FSV2.handleReorderTarget(btn.dataset.targetId, -1);
        return;
      }
      if (action === 'reorder-target-down') {
        await window.FSV2.handleReorderTarget(btn.dataset.targetId, 1);
        return;
      }
      if (action === 'apply-chain-suggestion') {
        window.FSV2.applyChainSuggestion(
          btn.dataset.targetId,
          btn.dataset.odooField,
          btn.dataset.odooLabel,
          btn.dataset.stepOrder,
          btn.dataset.stepLabel
        );
        return;
      }
      if (action === 'save-step-mappings') {
        await window.FSV2.handleSaveStepMappings(btn.dataset.targetId);
        return;
      }
      if (action === 'save-detail-mappings') {
        await window.FSV2.handleSaveMappings();
        return;
      }
      if (action === 'detail-add-extra-row') {
        var detWrapper     = btn.closest('[data-mt-target-id]');
        var detTid         = detWrapper ? detWrapper.dataset.mtTargetId : null;
        if (!detTid) { window.FSV2.showAlert('Doel niet gevonden.', 'error'); return; }
        var detFieldInput  = document.getElementById('fsp-val-det-extra-' + detTid + '-add');
        var detExtraStatic = document.getElementById('detExtraStaticValue-' + detTid);
        var detFieldName   = detFieldInput ? detFieldInput.value.trim() : '';
        if (!detFieldName) { window.FSV2.showAlert('Kies een Odoo veld uit de lijst.', 'error'); return; }
        var detTarget  = S.detail && S.detail.targets && S.detail.targets.find(function (t) { return String(t.id) === detTid; });
        var detModel   = detTarget ? detTarget.odoo_model : '';
        var detCached  = S.odooFieldsCache[detModel] || [];
        var detMatched = detCached.find(function (f) { return f.name === detFieldName; });
        var detStaticVal = detExtraStatic ? detExtraStatic.value : '';
        if (!detStaticVal) {
          window.FSV2.showAlert('Voer eerst een waarde in (of kies Ja/Nee) voordat je het veld toevoegt.', 'warning');
          return;
        }
        var detIsIdentifier  = !!(document.getElementById('detExtraIsIdentifier-' + detTid)  || {}).checked;
        var detIsUpdateField = (document.getElementById('detExtraIsUpdateField-' + detTid) || { checked: true }).checked;
        S.detail._extraRowsByTarget = S.detail._extraRowsByTarget || {};
        S.detail._extraRowsByTarget[detTid] = S.detail._extraRowsByTarget[detTid] || [];
        S.detail._extraRowsByTarget[detTid].push({
          odooField:     detFieldName,
          odooLabel:     detMatched ? detMatched.label : detFieldName,
          staticValue:   detStaticVal.trim(),
          sourceType:    'static',
          isIdentifier:  detIsIdentifier,
          isUpdateField: detIsUpdateField,
        });
        window.FSV2.renderDetailMappings();
        return;
      }
      if (action === 'detail-remove-extra-row') {
        var remWrapper = btn.closest('[data-mt-target-id]');
        var remTid     = remWrapper ? remWrapper.dataset.mtTargetId : null;
        var detRemIdx  = parseInt(btn.dataset.idx, 10);
        if (remTid && !isNaN(detRemIdx) && S.detail && S.detail._extraRowsByTarget && S.detail._extraRowsByTarget[remTid]) {
          S.detail._extraRowsByTarget[remTid].splice(detRemIdx, 1);
          window.FSV2.renderDetailMappings();
        }
        return;
      }
      if (action === 'detail-add-chain-row') {
        // Adds a previous_step_output mapping row from the step-chain section.
        var chainWrapper   = btn.closest('[data-mt-target-id]');
        var chainTid       = chainWrapper ? chainWrapper.dataset.mtTargetId : null;
        if (!chainTid) { window.FSV2.showAlert('Doel niet gevonden.', 'error'); return; }
        var chainFspVal   = document.getElementById('fsp-val-det-chain-' + chainTid + '-add');
        var chainStepSel  = document.getElementById('detChainStepSelect-' + chainTid);
        var chainIsReqEl  = document.getElementById('detChainIsRequired-' + chainTid);
        var chainField    = chainFspVal ? chainFspVal.value.trim() : '';
        var chainStepVal  = chainStepSel ? chainStepSel.value.trim() : '';
        if (!chainField)    { window.FSV2.showAlert('Kies een Odoo veld voor de koppeling.', 'error'); return; }
        if (!chainStepVal)  { window.FSV2.showAlert('Kies een vorige stap om aan te koppelen.', 'error'); return; }
        var chainIsRequired = chainIsReqEl ? chainIsReqEl.checked : true;
        var chainTarget   = S.detail && S.detail.targets && S.detail.targets.find(function (t) { return String(t.id) === chainTid; });
        var detChainModel = chainTarget ? chainTarget.odoo_model : '';
        var detChainCache = S.odooFieldsCache[detChainModel] || [];
        var detChainMeta  = detChainCache.find(function (f) { return f.name === chainField; });
        S.detail._extraRowsByTarget = S.detail._extraRowsByTarget || {};
        S.detail._extraRowsByTarget[chainTid] = S.detail._extraRowsByTarget[chainTid] || [];
        S.detail._extraRowsByTarget[chainTid].push({
          odooField:     chainField,
          odooLabel:     detChainMeta ? detChainMeta.label : chainField,
          staticValue:   chainStepVal,
          sourceType:    'previous_step_output',
          isRequired:    chainIsRequired,
          isIdentifier:  false,
          isUpdateField: true,
        });
        window.FSV2.renderDetailMappings();
        return;
      }
      if (action === 'fetch-form-fields') {
        var integration2 = S.detail && S.detail.integration;
        var sk2  = integration2 && integration2.site_key;
        var fid2 = integration2 && integration2.forminator_form_id;
        if (!sk2 || !fid2) return;
        await window.FSV2.fetchDetailFormFields(sk2, fid2);
        return;
      }
      if (action === 'toggle-model-defaults') {
        var mdModel = btn.dataset.model;
        var mdEd    = S.modelDefaultsEditors[mdModel] || { open: false, pendingFields: [] };
        if (!mdEd.open) {
          var mdEntry = (S.odooModelsCache || []).find(function (m) { return m.name === mdModel; }) || {};
          var saved2 = mdEntry.default_fields || [];
          mdEd.pendingFields = saved2.map(function (f) { return Object.assign({}, f); });
          mdEd.open = true;
          S.modelDefaultsEditors[mdModel] = mdEd;
          window.FSV2.renderDefaults();
          if (!S.odooFieldsCache[mdModel] || !S.odooFieldsCache[mdModel].length) {
            window.FSV2.loadOdooFieldsForModel(mdModel).then(function () {
              if (S.view === 'defaults') window.FSV2.renderDefaults();
            });
          }
        } else {
          mdEd.open = false;
          S.modelDefaultsEditors[mdModel] = mdEd;
          window.FSV2.renderDefaults();
        }
        return;
      }
      if (action === 'add-default-field') {
        var addModel  = btn.dataset.model;
        var addMKey   = addModel.replace(/\./g, '_');
        var fspValEl  = document.getElementById('fsp-val-defaults-add-' + addMKey);
        var reqCbEl   = document.getElementById('defaults-new-req-' + addMKey);
        var addName   = fspValEl ? fspValEl.value.trim() : '';
        if (!addName) { window.FSV2.showAlert('Kies een Odoo veld.', 'error'); return; }
        var allF   = S.odooFieldsCache[addModel] || [];
        var matchF = allF.find(function (f) { return f.name === addName; });
        var addEd  = S.modelDefaultsEditors[addModel] || { open: true, pendingFields: [] };
        if (addEd.pendingFields.find(function (f) { return f.name === addName; })) {
          window.FSV2.showAlert('Veld "' + addName + '" staat al in de lijst.', 'warning');
          return;
        }
        addEd.pendingFields.push({
          name:        addName,
          label:       matchF ? matchF.label : addName,
          required:    reqCbEl ? reqCbEl.checked : false,
          order_index: addEd.pendingFields.length,
        });
        S.modelDefaultsEditors[addModel] = addEd;
        window.FSV2.renderDefaults();
        return;
      }
      if (action === 'remove-default-field') {
        var rmModel = btn.dataset.model;
        var rmIdx   = parseInt(btn.dataset.idx, 10);
        var rmEd    = S.modelDefaultsEditors[rmModel];
        if (rmEd && !isNaN(rmIdx)) {
          rmEd.pendingFields.splice(rmIdx, 1);
          window.FSV2.renderDefaults();
        }
        return;
      }
      if (action === 'save-model-defaults') {
        var saveModel  = btn.dataset.model;
        var saveEd     = S.modelDefaultsEditors[saveModel];
        if (!saveEd) return;
        var saveFields = (saveEd.pendingFields || []).map(function (f, i) {
          return { name: f.name, label: f.label, required: !!f.required, order_index: i };
        });
        await window.FSV2.api('/settings/model-defaults', {
          method: 'PUT',
          body: JSON.stringify({ model: saveModel, fields: saveFields }),
        });
        S.modelDefaultsEditors[saveModel] = { open: false, pendingFields: [] };
        window.FSV2.showAlert('Standaard velden opgeslagen.', 'success');
        window.FSV2.renderDefaults();
        return;
      }

      // ── Fase 1: ⋯ accordion toggle ────────────────────────────────────────
      if (action === 'toggle-row-details') {
        var detailsId = btn.dataset.detailsId;
        if (!detailsId) return;
        var detailsRow = document.getElementById(detailsId);
        if (!detailsRow) return;
        var isOpen = detailsRow.style.display !== 'none';
        detailsRow.style.display = isOpen ? 'none' : '';
        btn.textContent = isOpen ? '⋯' : '✕';
        if (!isOpen && typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons({ nodes: [detailsRow] });
        }
        return;
      }

      // ── Fase 1: Intent-picker dialog ──────────────────────────────────────
      if (action === 'open-add-target-dialog') {
        var dialog = document.getElementById('addTargetDialog');
        if (!dialog) return;
        dialog.dataset.integrationId = btn.dataset.integrationId || btn.dataset.integrationid || '';
        dialog.dataset.selectedType  = '';
        // Populate model picker
        var addModels2 = Array.isArray(S.odooModelsCache) ? S.odooModelsCache : (window.FSV2.DEFAULT_ODOO_MODELS || []);
        var picker = document.getElementById('addTargetModelPicker');
        if (picker) {
          picker.innerHTML = '<option value="">\u2014 kies model \u2014</option>' +
            addModels2.map(function (m) {
              return '<option value="' + window.FSV2.esc(m.name) + '">' + window.FSV2.esc(m.label || m.name) + ' (' + window.FSV2.esc(m.name) + ')</option>';
            }).join('');
          picker.onchange = function () {
            var confirmBtn = document.getElementById('confirmAddTargetBtn');
            var st = dialog.dataset.selectedType;
            if (confirmBtn) confirmBtn.disabled = !st || (st !== 'chatter_message' && st !== 'create_activity' && !picker.value);
          };
        }
        if (window.FSV2.renderAddTargetDialog) window.FSV2.renderAddTargetDialog();
        dialog.showModal();
        return;
      }
      if (action === 'close-add-target-dialog') {
        var dlg2 = document.getElementById('addTargetDialog');
        if (dlg2) dlg2.close();
        return;
      }
      if (action === 'select-target-type') {
        var dlgST = document.getElementById('addTargetDialog');
        if (!dlgST) return;
        dlgST.dataset.selectedType = btn.dataset.opType || '';
        if (window.FSV2.renderAddTargetDialog) window.FSV2.renderAddTargetDialog();
        return;
      }
      if (action === 'confirm-add-target') {
        var dlg3 = document.getElementById('addTargetDialog');
        if (!dlg3) return;
        var selectedType3 = dlg3.dataset.selectedType;
        var integId3 = dlg3.dataset.integrationId;
        if (!selectedType3 || !integId3) { window.FSV2.showAlert('Kies een type stap.', 'error'); return; }
        dlg3.close();
        await window.FSV2.handleAddTargetWithType(integId3, selectedType3);
        return;
      }

      // ── Fase 1: Open form-fields collapse ─────────────────────────────────
      if (action === 'open-form-fields-drawer') {
        var formFieldsEl = document.getElementById('detailFormFields');
        if (!formFieldsEl) return;
        var collapseEl = formFieldsEl.closest('.collapse');
        if (!collapseEl) return;
        var cbEl = collapseEl.querySelector('input[type="checkbox"]');
        if (cbEl && !cbEl.checked) {
          cbEl.checked = true;
          cbEl.dispatchEvent(new Event('change'));
        }
        setTimeout(function () { collapseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
        return;
      }

      // ── Fase 2: html-summary modal ────────────────────────────────────────
      if (action === 'open-html-summary-modal') {
        var hsmTargetId  = btn.dataset.targetId || btn.dataset.targetid || '';
        var hsmOdooModel = btn.dataset.odooModel || btn.dataset.odoomodel || '';
        if (!hsmTargetId) { window.FSV2.showAlert('Doel niet gevonden.', 'error'); return; }
        window.FSV2.openHtmlSummaryModal(hsmTargetId, hsmOdooModel);
        return;
      }
      if (action === 'close-html-summary-modal') {
        var hsmDlg = document.getElementById('htmlSummaryModal');
        if (hsmDlg) hsmDlg.close();
        return;
      }
      if (action === 'confirm-html-summary') {
        window.FSV2.confirmHtmlSummary();
        return;
      }
      if (action === 'chatter-field-up' || action === 'chatter-field-down') {
        var tid = btn.dataset.targetId || btn.dataset.targetid;
        var fid = btn.dataset.fieldId || btn.dataset.fieldid;
        if (tid && fid) {
          var ul = document.getElementById('chatterFieldList-' + tid);
          if (ul) {
            var li = ul.querySelector('li[data-fid="' + fid + '"]');
            if (li) {
              if (action === 'chatter-field-up') {
                var prev = li.previousElementSibling;
                if (prev) ul.insertBefore(li, prev);
              } else {
                var next = li.nextElementSibling;
                if (next) ul.insertBefore(next, li);
              }
              if (window.FSV2.scheduleChatterPreview) window.FSV2.scheduleChatterPreview(tid);
            }
          }
        }
        return;
      }
      if (action === 'insert-chatter-field') {
        var tid = btn.dataset.targetId || btn.dataset.targetid;
        var fid = btn.dataset.fieldId || btn.dataset.fieldid;
        if (tid && fid) {
          var _qi = window.FSV2._chatterQuills && window.FSV2._chatterQuills[tid];
          if (_qi) {
            var range = _qi.quill.getSelection(true);
            var idx   = range ? range.index : _qi.quill.getLength() - 1;
            _qi.quill.insertText(idx, '{' + fid + '}', 'user');
            _qi.quill.setSelection(idx + fid.length + 2);
            if (window.FSV2.scheduleChatterPreview) window.FSV2.scheduleChatterPreview(tid);
          }
        }
        return;
      }
      if (action === 'save-chatter-composer') {
        var tid = btn.dataset.targetId || btn.dataset.targetid;
        if (tid) await window.FSV2.handleSaveChatterComposer(tid);
        return;
      }
      if (action === 'save-activity-composer') {
        var tid = btn.dataset.targetId || btn.dataset.targetid;
        if (tid) await window.FSV2.handleSaveActivityComposer(tid);
        return;
      }
      if (action === 'act-user-mode') {
        var tid = btn.dataset.targetId || btn.dataset.targetid;
        var mode = btn.dataset.mode;
        if (tid && mode && window.FSV2.handleActivityUserMode) window.FSV2.handleActivityUserMode(tid, mode);
        return;
      }
      if (action === 'refresh-form-fields') {
        if (window.FSV2.handleRefreshFormFields) await window.FSV2.handleRefreshFormFields();
        return;
      }
      if (action === 'toggle-valuemap') {
        var tvFieldId = btn.dataset.fieldId || '';
        if (window.FSV2.S._expandedValueMapField === tvFieldId) {
          window.FSV2.S._expandedValueMapField = null;
          window.FSV2.S._pendingValueMapRows = [];
          window.FSV2.S._pendingCatchall = '';
        } else {
          window.FSV2.S._expandedValueMapField = tvFieldId;
          var tvFt    = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[tvFieldId]) || null;
          var tvVmap  = (tvFt && tvFt.value_map && typeof tvFt.value_map === 'object') ? tvFt.value_map : {};
          window.FSV2.S._pendingCatchall     = tvVmap['__catchall__'] !== undefined ? String(tvVmap['__catchall__']) : '';
          window.FSV2.S._pendingValueMapRows = Object.keys(tvVmap)
            .filter(function (k) { return k !== '__catchall__'; })
            .map(function (k) { return { from: k, to: String(tvVmap[k]) }; });
        }
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'add-valuemap-row') {
        if (window.FSV2.syncPendingValueMapFromDom) window.FSV2.syncPendingValueMapFromDom();
        if (!Array.isArray(window.FSV2.S._pendingValueMapRows)) window.FSV2.S._pendingValueMapRows = [];
        window.FSV2.S._pendingValueMapRows.push({ from: '', to: '' });
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'remove-valuemap-row') {
        if (window.FSV2.syncPendingValueMapFromDom) window.FSV2.syncPendingValueMapFromDom();
        var rmRowIdx = parseInt(btn.dataset.rowIdx, 10);
        if (!isNaN(rmRowIdx) && Array.isArray(window.FSV2.S._pendingValueMapRows)) {
          window.FSV2.S._pendingValueMapRows.splice(rmRowIdx, 1);
        }
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'save-field-valuemap') {
        var svFieldId = btn.dataset.fieldId || '';
        var svIntegId = btn.dataset.integrationId || '';
        if (!svFieldId || !svIntegId) return;
        if (window.FSV2.syncPendingValueMapFromDom) window.FSV2.syncPendingValueMapFromDom();
        var svRows = window.FSV2.S._pendingValueMapRows || [];
        var valueMap = {};
        svRows.forEach(function (row) {
          var k = (row.from || '').trim();
          if (k) valueMap[k] = row.to || '';
        });
        var catchall = (window.FSV2.S._pendingCatchall || '').trim();
        if (catchall) valueMap['__catchall__'] = catchall;
        var existingFt = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[svFieldId]) || {};
        await window.FSV2.api('/integrations/' + svIntegId + '/field-transforms/' + encodeURIComponent(svFieldId), {
          method: 'PUT',
          body: JSON.stringify({ field_type: 'selection', value_map: Object.keys(valueMap).length ? valueMap : null }),
        });
        window.FSV2.S.fieldTransforms = window.FSV2.S.fieldTransforms || {};
        window.FSV2.S.fieldTransforms[svFieldId] = Object.assign({}, existingFt, { field_type: 'selection', value_map: Object.keys(valueMap).length ? valueMap : null });
        window.FSV2.showAlert('Waardemap opgeslagen.', 'success');
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'wizard-skip-chatter') {
        await window.FSV2.wizardSkipChatter();
        return;
      }
      if (action === 'wizard-add-chatter') {
        await window.FSV2.wizardAddChatter();
        return;
      }
      if (action === 'wizard-copy-webhook-url') {
        var urlEl = document.getElementById('wizardWebhookUrl');
        var urlText = (urlEl && urlEl.textContent) ? urlEl.textContent.trim() : '';
        if (urlText) {
          navigator.clipboard.writeText(urlText).then(function () {
            window.FSV2.showAlert('Webhook URL gekopieerd.', 'success');
          }).catch(function () {
            window.FSV2.showAlert('Kopiëren mislukt — selecteer de URL handmatig.', 'warning');
          });
        }
        return;
      }
    };

    run().catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
  });

  // ── Close field picker on scroll ───────────────────────────────────────────
  document.addEventListener('scroll', function (e) {
    if (e.target && (e.target.closest && e.target.closest('.fsp-panel'))) return;
    window.OpenVME.FieldPicker.closeAll();
  }, true);

  // ── Filter field picker list on search input ───────────────────────────────
  document.addEventListener('input', function (event) {
    var srch = event.target.closest('.fsp-search');
    if (!srch) return;
    window.OpenVME.FieldPicker.filterList(srch.dataset.fspId, srch.value);
  });

  // ── FieldPicker change → waarde-map rij tonen/bijwerken ──────────────────
  // Wanneer de gebruiker een Odoo-veld selecteert voor een formulierveld met keuzemogelijkheden,
  // tonen we automatisch de waarde-mapping sectie als het een selection- of many2one-veld is.
  document.addEventListener('change', function (event) {
    var inp = event.target;
    // ── Field transform type select ────────────────────────────────────────
    if (inp && inp.tagName === 'SELECT' && inp.dataset.action === 'save-field-transform') {
      var ftFieldId  = inp.dataset.fieldId  || '';
      var ftIntegId  = inp.dataset.integrationId || '';
      var ftNewType  = inp.value || 'text';
      if (!ftFieldId || !ftIntegId) return;
      var ftExisting = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[ftFieldId]) || {};
      window.FSV2.api('/integrations/' + ftIntegId + '/field-transforms/' + encodeURIComponent(ftFieldId), {
        method: 'PUT',
        body: JSON.stringify({ field_type: ftNewType, value_map: ftExisting.value_map || null }),
      }).then(function () {
        window.FSV2.S.fieldTransforms = window.FSV2.S.fieldTransforms || {};
        window.FSV2.S.fieldTransforms[ftFieldId] = Object.assign({}, ftExisting, { field_type: ftNewType });
        window.FSV2.showAlert('Type opgeslagen.', 'success');
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
      return;
    }
    if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'hidden') return;
    if (!inp.id || inp.id.indexOf('fsp-val-') !== 0) return;

    // Zoek de dichtstbijzijnde form-field TR (heeft class 'form-field-row')
    var mainRow = inp.closest('tr.form-field-row');
    if (!mainRow) return;
    var vmapRow = mainRow.nextElementSibling;
    if (!vmapRow || !vmapRow.classList.contains('row-details-row')) return;
    if (!vmapRow.dataset.vmapChoices) return; // details row without vmap — skip

    var selectedField  = inp.value || '';
    var model          = vmapRow.dataset.vmapModel || '';
    var choicesJson    = vmapRow.dataset.vmapChoices || '[]';
    var inputPrefix    = vmapRow.dataset.vmapInputPrefix || '';
    var odooCache      = (S.odooFieldsCache || {})[model] || [];
    var odooMeta       = selectedField ? (odooCache.find(function (f) { return f.name === selectedField; }) || null) : null;
    var odooType       = (odooMeta && odooMeta.type) || '';
    var showVmap       = (odooType === 'selection' || odooType === 'many2one');

    var vmapInner = vmapRow.querySelector('.vmap-inner');
    if (!vmapInner) return;

    if (!showVmap) {
      var previewChoices;
      try { previewChoices = JSON.parse(choicesJson); } catch (_) { previewChoices = []; }
      vmapInner.innerHTML =
        '<div class="flex flex-wrap gap-1 items-center mb-1.5">' +
          '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Opties:</span>' +
          previewChoices.map(function (ch) {
            return '<span class="badge badge-ghost badge-xs" title="' + window.FSV2.esc(String(ch.value || '')) + '">' +
              window.FSV2.esc(String(ch.label || ch.value || '')) + '</span>';
          }).join('') +
        '</div>' +
        '<p class="text-xs text-base-content/40 italic">Kies een Odoo <strong>selectie</strong>- of <strong>many2one</strong>-veld hierboven om de waarden te mappen.</p>';
      return;
    }

    var choices;
    try { choices = JSON.parse(choicesJson); } catch (_) { choices = []; }

    // Lees bestaande ingevulde waarden (vóór rebuild) om te bewaren
    var existingVmap = {};
    vmapRow.querySelectorAll('[data-choice-value]').forEach(function (el) {
      if (el.dataset.choiceValue && el.value) existingVmap[el.dataset.choiceValue] = el.value;
    });

    vmapInner.innerHTML = window.FSV2.MappingTable.buildVmapSectionContent(
      choices, odooMeta, Object.keys(existingVmap).length > 0 ? existingVmap : null, inputPrefix
    );
    // Note: the details row visibility is controlled by the ⋯ button — don't auto-show here
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVBAR
  // ═══════════════════════════════════════════════════════════════════════════
  function renderNavbar(user) {
    var el = document.getElementById('navbar');
    if (!el) return;
    var modules = (user.modules || []).map(function(um) { return um.module || um; });
    el.innerHTML =
      '<header class="flex items-center justify-between bg-base-100 shadow-sm px-4" style="position:fixed;top:0;left:0;right:0;height:48px;z-index:50;">' +
        '<div class="flex items-center gap-4">' +
          '<a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
            '<span class="text-base font-semibold">OpenVME Operations Manager</span>' +
          '</a>' +
          (modules.length > 0 ?
            '<div class="dropdown dropdown-hover">' +
              '<div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>' +
                'Modules' +
              '</div>' +
              '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">' +
                modules.map(function(m) { return '<li><a href="' + m.route + '">' + m.name + '</a></li>'; }).join('') +
              '</ul>' +
            '</div>'
          : '') +
        '</div>' +
        '<div class="flex gap-2 items-center">' +
          '<span class="text-sm text-base-content/60">' + (user.email || '') + '</span>' +
        '</div>' +
      '</header>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════════════════════════
  async function bootstrap() {
    // Auth check — redirect to login if session invalid
    var meRes = await fetch('/api/auth/me', { credentials: 'include' });
    if (meRes.status === 401) { window.location.href = '/'; return; }
    var me = await meRes.json().catch(function() { return {}; });
    var user = me.data || me.user || {};

    renderNavbar(user);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    try {
      await Promise.all([
        window.FSV2.loadSites(),
        window.FSV2.loadIntegrations(),
        window.FSV2.loadModelLinks(),
        window.FSV2.loadOdooModels(),
      ]);
      window.FSV2.showView('list');
      window.FSV2.renderList();
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    }
  }

  bootstrap();

}());
