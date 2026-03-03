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
        Object.keys(window.FSV2.ACTIONS).forEach(function (key) {
          var m = window.FSV2.ACTIONS[key].odoo_model;
          if (!S.odooFieldsCache[m] || !S.odooFieldsCache[m].length) {
            window.FSV2.loadOdooFieldsForModel(m).then(function () {
              if (S.view === 'defaults') window.FSV2.renderDefaults();
            });
          }
        });
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
      if (action === 'save-detail-mappings') {
        await window.FSV2.handleSaveMappings();
        return;
      }
      if (action === 'detail-add-extra-row') {
        var detFieldInput  = document.getElementById('fsp-val-det-extra-add');
        var detExtraStatic = document.getElementById('detExtraStaticValue');
        var detFieldName   = detFieldInput ? detFieldInput.value.trim() : '';
        if (!detFieldName) { window.FSV2.showAlert('Kies een Odoo veld uit de lijst.', 'error'); return; }
        var detModel   = S.detail && S.detail.targets && S.detail.targets[0] ? S.detail.targets[0].odoo_model : '';
        var detCached  = S.odooFieldsCache[detModel] || [];
        var detMatched = detCached.find(function (f) { return f.name === detFieldName; });
        var detIsIdentifier  = !!(document.getElementById('detExtraIsIdentifier')  || {}).checked;
        var detIsUpdateField = (document.getElementById('detExtraIsUpdateField') || { checked: true }).checked;
        S.detail._extraRows = S.detail._extraRows || [];
        S.detail._extraRows.push({
          odooField:     detFieldName,
          odooLabel:     detMatched ? detMatched.label : detFieldName,
          staticValue:   detExtraStatic ? detExtraStatic.value.trim() : '',
          sourceType:    'static',
          isIdentifier:  detIsIdentifier,
          isUpdateField: detIsUpdateField,
        });
        window.FSV2.renderDetailMappings();
        return;
      }
      if (action === 'detail-remove-extra-row') {
        var detRemIdx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(detRemIdx) && S.detail && S.detail._extraRows) {
          S.detail._extraRows.splice(detRemIdx, 1);
          window.FSV2.renderDetailMappings();
        }
        return;
      }
      if (action === 'detail-add-chain-row') {
        // Adds a previous_step_output mapping row from the step-chain section.
        var chainFspVal   = document.getElementById('fsp-val-det-chain-add');
        var chainStepSel  = document.getElementById('detChainStepSelect');
        var chainIsReqEl  = document.getElementById('detChainIsRequired');
        var chainField    = chainFspVal ? chainFspVal.value.trim() : '';
        var chainStepVal  = chainStepSel ? chainStepSel.value.trim() : '';
        if (!chainField)    { window.FSV2.showAlert('Kies een Odoo veld voor de koppeling.', 'error'); return; }
        if (!chainStepVal)  { window.FSV2.showAlert('Kies een vorige stap om aan te koppelen.', 'error'); return; }
        var chainIsRequired = chainIsReqEl ? chainIsReqEl.checked : true;
        var detChainModel   = S.detail && S.detail.targets && S.detail.targets[0] ? S.detail.targets[0].odoo_model : '';
        var detChainCache   = S.odooFieldsCache[detChainModel] || [];
        var detChainMeta    = detChainCache.find(function (f) { return f.name === chainField; });
        S.detail._extraRows = S.detail._extraRows || [];
        S.detail._extraRows.push({
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
          var saved2 = S.modelDefaultsCache[mdModel] || [];
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
        S.modelDefaultsCache[saveModel]   = saveFields;
        S.modelDefaultsEditors[saveModel] = { open: false, pendingFields: [] };
        window.FSV2.showAlert('Standaard velden opgeslagen.', 'success');
        window.FSV2.renderDefaults();
        return;
      }
      if (action === 'wizard-add-extra-row') {
        var fieldInput  = document.getElementById('fsp-val-wizard-extra-add');
        var extraStatic = document.getElementById('wizardExtraStaticValue');
        var fieldName   = fieldInput ? fieldInput.value.trim() : '';
        if (!fieldName) { window.FSV2.showAlert('Kies een Odoo veld uit de lijst.', 'error'); return; }
        var actionCfg2 = window.FSV2.ACTIONS[S.wizard.action];
        var cached2    = actionCfg2 ? (S.odooFieldsCache[actionCfg2.odoo_model] || []) : [];
        var matched    = cached2.find(function (f) { return f.name === fieldName; });
        S.wizard.extraMappings = S.wizard.extraMappings || [];
        S.wizard.extraMappings.push({
          odooField:   fieldName,
          odooLabel:   matched ? matched.label : fieldName,
          staticValue: extraStatic ? extraStatic.value.trim() : '',
        });
        window.FSV2.renderWizard();
        return;
      }
      if (action === 'wizard-remove-extra-row') {
        var removeIdx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(removeIdx) && S.wizard.extraMappings) {
          S.wizard.extraMappings.forEach(function (em, i) {
            var inpEl = document.getElementById('inp-extra-static-' + i);
            if (inpEl) em.staticValue = (inpEl.value || '').trim();
          });
          S.wizard.extraMappings.splice(removeIdx, 1);
          window.FSV2.renderWizard();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════════════════════════
  async function bootstrap() {
    try {
      await Promise.all(
        [window.FSV2.loadSites(), window.FSV2.loadIntegrations()].concat(
          Object.keys(window.FSV2.ACTIONS).map(function (key) {
            return window.FSV2.loadModelDefaultsForModel(window.FSV2.ACTIONS[key].odoo_model);
          })
        )
      );
      window.FSV2.showView('list');
      window.FSV2.renderList();
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    }
  }

  bootstrap();

}());
