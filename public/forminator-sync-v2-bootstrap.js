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

  function normalizeValueMapOrder(order) {
    if (!Array.isArray(order)) return [];
    var seen = {};
    var out = [];
    order.forEach(function (item) {
      var key = String(item || '').trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function buildOrderedValueMapRows(valueMap, valueMapOrder) {
    var map = (valueMap && typeof valueMap === 'object') ? valueMap : {};
    var order = normalizeValueMapOrder(valueMapOrder);
    var mapKeys = Object.keys(map).filter(function (k) { return k !== '__catchall__'; });
    if (!order.length) {
      return mapKeys.map(function (k) { return { from: k, to: String(map[k]) }; });
    }
    var used = {};
    var rows = [];
    order.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(map, k) || k === '__catchall__') return;
      used[k] = true;
      rows.push({ from: k, to: String(map[k]) });
    });
    mapKeys.forEach(function (k) {
      if (used[k]) return;
      rows.push({ from: k, to: String(map[k]) });
    });
    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION \u2014 click
  // ═══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (event) {

    // ── Detail tab switching ──────────────────────────────────────────────
    var detailTabBtn = event.target.closest('[data-detail-tab]');
    if (detailTabBtn) {
      var tabName = detailTabBtn.dataset.detailTab;
      document.querySelectorAll('[data-detail-tab]').forEach(function (t) {
        t.classList.toggle('tab-active', t.dataset.detailTab === tabName);
      });
      ['fields', 'mapping', 'history'].forEach(function (name) {
        var panel = document.getElementById('detailTab' + name.charAt(0).toUpperCase() + name.slice(1));
        if (panel) panel.style.display = name === tabName ? '' : 'none';
      });
      return;
    }

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

      if (action === 'logout') {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/';
        return;
      }

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
        // Resolve slugs → actual Odoo model names (e.g. 'contact' → 'res.partner')
        function resolveOdooModel(slug) {
          var cfg = (S.odooModelsCache || []).find(function(m){ return m.name === slug; });
          return (cfg && cfg.odoo_model) ? cfg.odoo_model : slug;
        }
        var odooModelA = resolveOdooModel(modelA);
        var fieldsBody = await window.FSV2.api('/odoo/fields?model=' + encodeURIComponent(modelB));
        var allFields  = fieldsBody.data || [];
        var candidates = allFields.filter(function (f) { return f.type === 'many2one' && f.relation === odooModelA; });
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
        var nameEl      = document.getElementById('newModelName');
        var odooModelEl = document.getElementById('newModelOdooModel');
        var labelEl     = document.getElementById('newModelLabel');
        var iconEl      = document.getElementById('newModelIcon');
        var mName       = nameEl      ? nameEl.value.trim()      : '';
        var mOdooModel  = odooModelEl ? odooModelEl.value.trim() : '';
        var mLabel      = labelEl     ? labelEl.value.trim()     : '';
        var mIcon       = iconEl      ? iconEl.value.trim()      : 'box';
        if (!mName)  { window.FSV2.showAlert('Interne naam is verplicht.', 'error'); return; }
        if (!mLabel) { window.FSV2.showAlert('Label is verplicht.', 'error'); return; }
        var currentModels = Array.isArray(S.odooModelsCache) ? S.odooModelsCache : [];
        if (currentModels.some(function (m) { return m.name === mName; })) {
          window.FSV2.showAlert('Model bestaat al.', 'info'); return;
        }
        var updatedModels = currentModels.concat([{ name: mName, label: mLabel, icon: mIcon, odoo_model: mOdooModel || null }]);
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
        S.editingHiddenFields = Array.isArray(editModel.hidden_odoo_fields)
          ? editModel.hidden_odoo_fields.slice()
          : [];
        window.FSV2.renderLinks();
        // Load Odoo fields for the hidden-fields toggle list
        if (!S.odooFieldsCache[editModel.name] || !S.odooFieldsCache[editModel.name].length) {
          window.FSV2.loadOdooFieldsForModel(editModel.name).then(function() {
            if (S.editingModelIdx !== null) window.FSV2.renderLinks();
          });
        }
        return;
      }
      if (action === 'cancel-edit-model') {
        S.editingModelIdx = null;
        S.editingDefaultFields = null;
        S.editingHiddenFields = null;
        window.FSV2.renderLinks();
        return;
      }
      if (action === 'add-default-field' && !btn.dataset.model) {
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
      if (action === 'remove-default-field' && !btn.dataset.model) {
        var rmIdx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(rmIdx) && Array.isArray(S.editingDefaultFields)) {
          S.editingDefaultFields.splice(rmIdx, 1);
          window.FSV2.renderLinks();
        }
        return;
      }
      if (action === 'toggle-field-visibility') {
        var tfName = btn.dataset.fieldName;
        if (!tfName) return;
        if (!Array.isArray(S.editingHiddenFields)) S.editingHiddenFields = [];
        var tfIdx = S.editingHiddenFields.indexOf(tfName);
        if (tfIdx >= 0) {
          S.editingHiddenFields.splice(tfIdx, 1); // currently hidden -> show
        } else {
          S.editingHiddenFields.push(tfName);     // currently visible -> hide
        }
        window.FSV2.renderLinks();
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
        var allowChatterEl    = document.getElementById('editModelAllowChatter');
        var allowActivitiesEl = document.getElementById('editModelAllowActivities');
        var newAllowChatter    = allowChatterEl    ? allowChatterEl.checked    : true;
        var newAllowActivities = allowActivitiesEl ? allowActivitiesEl.checked : true;
        var existingHiddenFields = ((S.odooModelsCache || [])[saveIdx] || {}).hidden_odoo_fields || [];
        var newHiddenFields = Array.isArray(S.editingHiddenFields) ? S.editingHiddenFields : existingHiddenFields;
        var updatedModels = (S.odooModelsCache || []).map(function (m, i) {
          return i === saveIdx
            ? { name: m.name, label: newLabel, icon: newIcon, default_fields: newDefaultFields,
                allow_chatter: newAllowChatter, allow_activities: newAllowActivities,
                odoo_model: m.odoo_model, identifier_fields: m.identifier_fields, fixed_fields: m.fixed_fields,
                hidden_odoo_fields: newHiddenFields }
            : m;
        });
        await window.FSV2.api('/settings/odoo-models', { method: 'PUT', body: JSON.stringify({ models: updatedModels }) });
        S.odooModelsCache = updatedModels;
        S.editingModelIdx = null;
        S.editingDefaultFields = null;
        S.editingHiddenFields = null;
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
      if (action === 'delete-submission') {
        await window.FSV2.handleDeleteSubmission(btn.dataset.id);
        return;
      }
      if (action === 'toggle-delete-unlock') {
        window.FSV2.handleToggleDeleteUnlock();
        return;
      }
      if (action === 'cleanup-replays') {
        await window.FSV2.handleCleanupReplays();
        return;
      }
      if (action === 'refresh-submissions') {
        if (window.FSV2.handleRefreshSubmissions) await window.FSV2.handleRefreshSubmissions();
        return;
      }
      if (action === 'open-export-modal') {
        window.FSV2.handleOpenExportModal();
        return;
      }
      if (action === 'export-submissions') {
        window.FSV2.handleExportSubmissions(btn.dataset.format);
        return;
      }
      if (action === 'open-import-modal') {
        if (window.FSV2.handleOpenImportModal) window.FSV2.handleOpenImportModal();
        return;
      }
      if (action === 'run-import-meta-leads') {
        if (window.FSV2.handleImportMetaLeads) await window.FSV2.handleImportMetaLeads();
        return;
      }
      if (action === 'validate-bulk-import') {
        if (window.FSV2.handleValidateBulkImportRows) await window.FSV2.handleValidateBulkImportRows();
        return;
      }
      if (action === 'add-bulk-import-row') {
        if (window.FSV2.handleAddBulkImportRow) window.FSV2.handleAddBulkImportRow();
        return;
      }
      if (action === 'remove-bulk-import-row') {
        if (window.FSV2.handleRemoveBulkImportRow) window.FSV2.handleRemoveBulkImportRow(btn.dataset.rowIndex);
        return;
      }
      if (action === 'add-target') {
        await window.FSV2.handleAddTarget(btn.dataset.integrationid);
        return;
      }
      if (action === 'duplicate-target') {
        await window.FSV2.handleDuplicateTarget(btn.dataset.targetId, btn.dataset.integrationId);
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
      if (action === 'toggle-step-cond') {
        var tscTid = btn.dataset.targetId || '';
        if (!tscTid) return;
        var el = document.getElementById('det-cond-' + tscTid);
        if (el) {
          var open = el.style.display === 'none';
          el.style.display = open ? '' : 'none';
          var icons = btn.querySelectorAll('[data-lucide]');
          var chev = icons.length ? icons[icons.length - 1] : null;
          if (chev) { chev.setAttribute('data-lucide', open ? 'chevron-down' : 'chevron-right'); if (typeof lucide !== 'undefined') lucide.createIcons({ context: btn }); }
        }
        return;
      }
      if (action === 'toggle-step-optype') {
        var tsotTid = btn.dataset.targetId || '';
        if (!tsotTid) return;
        var el = document.getElementById('det-optype-' + tsotTid);
        if (el) {
          var open = el.style.display === 'none';
          el.style.display = open ? '' : 'none';
          var icons = btn.querySelectorAll('[data-lucide]');
          var chev = icons.length ? icons[icons.length - 1] : null;
          if (chev) { chev.setAttribute('data-lucide', open ? 'chevron-down' : 'chevron-right'); if (typeof lucide !== 'undefined') lucide.createIcons({ context: btn }); }
        }
        return;
      }
      if (action === 'toggle-step-chain') {
        var tschTid = btn.dataset.targetId || '';
        if (!tschTid) return;
        var el = document.getElementById('det-callouts-' + tschTid);
        if (el) {
          var open = el.style.display === 'none';
          el.style.display = open ? '' : 'none';
          var icons = btn.querySelectorAll('[data-lucide]');
          var chev = icons.length ? icons[icons.length - 1] : null;
          if (chev) { chev.setAttribute('data-lucide', open ? 'chevron-down' : 'chevron-right'); if (typeof lucide !== 'undefined') lucide.createIcons({ context: btn }); }
        }
        return;
      }
      if (action === 'toggle-step-ff') {
        var tsffTid = btn.dataset.targetId || '';
        if (!tsffTid) return;
        var el = document.getElementById('det-mc-' + tsffTid);
        if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
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
      if (action === 'remove-chain-link') {
        window.FSV2.removeChainLink(btn.dataset.targetId, btn.dataset.odooField);
        return;
      }
      if (action === 'save-step-mappings') {
        await window.FSV2.handleSaveStepMappings(btn.dataset.targetId);
        return;
      }
      if (action === 'save-step-condition') {
        var condTid = btn.dataset.targetId;
        if (condTid) await window.FSV2.handleSaveStepCondition(condTid);
        return;
      }
      if (action === 'clear-step-condition') {
        var clearTid = btn.dataset.targetId;
        if (!clearTid) return;
        var clrSel = document.getElementById('stepCondField-' + clearTid);
        if (clrSel) clrSel.value = '';
        window.FSV2.handleCondFieldChanged(clearTid, '');
        await window.FSV2.handleSaveStepCondition(clearTid);
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
        var chainFspVal   = document.getElementById('det-chain-' + chainTid + '-add');
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
          isIdentifier:  true,
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
        var srcSelEl = document.getElementById('defaults-new-src-' + addMKey);
        var addSrcMode = srcSelEl ? srcSelEl.value : 'both';
        addEd.pendingFields.push({
          name:        addName,
          label:       matchF ? matchF.label : addName,
          required:    reqCbEl ? reqCbEl.checked : false,
          source_mode: addSrcMode,
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
          return { name: f.name, label: f.label, required: !!f.required, source_mode: f.source_mode || 'both', order_index: i };
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

      if (action === 'toggle-model-fixed') {
        var mfModel = btn.dataset.model;
        var mfEd    = S.modelFixedEditors[mfModel] || { open: false, pendingFixed: [] };
        if (!mfEd.open) {
          var mfEntry = (S.odooModelsCache || []).find(function (m) { return m.name === mfModel; }) || {};
          mfEd.pendingFixed = (Array.isArray(mfEntry.fixed_fields) ? mfEntry.fixed_fields : []).map(function (f) { return Object.assign({}, f); });
          mfEd.open = true;
          S.modelFixedEditors[mfModel] = mfEd;
          window.FSV2.renderDefaults();
          if (!S.odooFieldsCache[mfModel] || !S.odooFieldsCache[mfModel].length) {
            window.FSV2.loadOdooFieldsForModel(mfModel).then(function () {
              if (S.view === 'defaults') window.FSV2.renderDefaults();
            });
          }
        } else {
          mfEd.open = false;
          S.modelFixedEditors[mfModel] = mfEd;
          window.FSV2.renderDefaults();
        }
        return;
      }
      if (action === 'add-fixed-field') {
        var afModel  = btn.dataset.model;
        var afMKey   = afModel.replace(/\./g, '_');
        var afFspEl    = document.getElementById('fsp-val-fixed-add-' + afMKey);
        var afValEl    = document.getElementById('fixed-new-val-' + afMKey);
        var afSearchEl = document.getElementById('fixed-m2o-search-' + afMKey);
        var afName     = afFspEl ? afFspEl.value.trim() : '';
        var afValue    = afValEl ? afValEl.value.trim() : '';
        if (!afName)  { window.FSV2.showAlert('Kies een Odoo veld.', 'error'); return; }
        if (afValue === '') { window.FSV2.showAlert('Vul een vaste waarde in.', 'error'); return; }
        var afAllF   = S.odooFieldsCache[afModel] || [];
        var afMatch  = afAllF.find(function (f) { return f.name === afName; });
        // For many2one: store 'id|display_name' so step view can show label
        if (afMatch && afMatch.type === 'many2one' && afSearchEl) {
          var afDisplayName = afSearchEl.value.trim();
          if (afDisplayName) afValue = afValue + '|' + afDisplayName;
        }
        var afEd     = S.modelFixedEditors[afModel] || { open: true, pendingFixed: [] };
        if (afEd.pendingFixed.find(function (f) { return f.name === afName; })) {
          window.FSV2.showAlert('Veld "' + afName + '" staat al in de lijst.', 'warning');
          return;
        }
        afEd.pendingFixed.push({
          name:  afName,
          label: afMatch ? afMatch.label : afName,
          value: afValue,
        });
        S.modelFixedEditors[afModel] = afEd;
        window.FSV2.renderDefaults();
        return;
      }
      if (action === 'remove-fixed-field') {
        var rfModel = btn.dataset.model;
        var rfIdx   = parseInt(btn.dataset.idx, 10);
        var rfEd    = S.modelFixedEditors[rfModel];
        if (rfEd && !isNaN(rfIdx)) {
          rfEd.pendingFixed.splice(rfIdx, 1);
          window.FSV2.renderDefaults();
        }
        return;
      }
      if (action === 'save-model-fixed') {
        var sfModel  = btn.dataset.model;
        var sfEd     = S.modelFixedEditors[sfModel];
        if (!sfEd) return;
        // Sync any unsaved value-input changes
        var sfMKey = sfModel.replace(/\./g, '_');
        document.querySelectorAll('.fixed-val-input[data-model="' + sfModel + '"]').forEach(function (inp) {
          var idx2 = parseInt(inp.dataset.idx, 10);
          if (sfEd.pendingFixed[idx2] !== undefined) sfEd.pendingFixed[idx2].value = inp.value;
        });
        var saveFixed = sfEd.pendingFixed.map(function (f) {
          return { name: f.name, label: f.label, value: f.value };
        });
        await window.FSV2.api('/settings/model-fixed-fields', {
          method: 'PUT',
          body: JSON.stringify({ model: sfModel, fields: saveFixed }),
        });
        // Update local cache
        var sfModelObj = (S.odooModelsCache || []).find(function (m) { return m.name === sfModel; });
        if (sfModelObj) sfModelObj.fixed_fields = saveFixed;
        S.modelFixedEditors[sfModel] = { open: false, pendingFixed: [] };
        window.FSV2.showAlert('Vaste waarden opgeslagen.', 'success');
        window.FSV2.renderDefaults();
        return;
      }
      if (action === 'toggle-model-identifier') {
        var miModel = btn.dataset.model;
        var miEd    = S.modelIdentifierEditors[miModel] || { open: false, pendingIdentifier: [] };
        if (!miEd.open) {
          var miEntry = (S.odooModelsCache || []).find(function (m) { return m.name === miModel; }) || {};
          miEd.pendingIdentifier = (Array.isArray(miEntry.identifier_fields) ? miEntry.identifier_fields : []).map(function (f) { return Object.assign({}, f); });
          miEd.open = true;
          S.modelIdentifierEditors[miModel] = miEd;
          window.FSV2.renderDefaults();
          if (!S.odooFieldsCache[miModel] || !S.odooFieldsCache[miModel].length) {
            window.FSV2.loadOdooFieldsForModel(miModel).then(function () {
              if (S.view === 'defaults') window.FSV2.renderDefaults();
            });
          }
        } else {
          miEd.open = false;
          S.modelIdentifierEditors[miModel] = miEd;
          window.FSV2.renderDefaults();
        }
        return;
      }
      if (action === 'add-identifier-field') {
        var aiModel  = btn.dataset.model;
        var aiMKey   = aiModel.replace(/\./g, '_');
        var aiFspEl  = document.getElementById('fsp-val-ident-add-' + aiMKey);
        var aiName   = aiFspEl ? aiFspEl.value.trim() : '';
        if (!aiName) { window.FSV2.showAlert('Kies een Odoo veld.', 'error'); return; }
        if (aiName === 'id') { window.FSV2.showAlert('Het id-veld kan niet als identifier gebruikt worden.', 'error'); return; }
        var aiAllF   = S.odooFieldsCache[aiModel] || [];
        var aiMatch  = aiAllF.find(function (f) { return f.name === aiName; });
        var aiEd     = S.modelIdentifierEditors[aiModel] || { open: true, pendingIdentifier: [] };
        if (aiEd.pendingIdentifier.find(function (f) { return f.name === aiName; })) {
          window.FSV2.showAlert('Veld "' + aiName + '" staat al in de lijst.', 'warning');
          return;
        }
        aiEd.pendingIdentifier.push({
          name:  aiName,
          label: aiMatch ? aiMatch.label : aiName,
        });
        S.modelIdentifierEditors[aiModel] = aiEd;
        window.FSV2.renderDefaults();
        return;
      }
      if (action === 'remove-identifier-field') {
        var riModel = btn.dataset.model;
        var riIdx   = parseInt(btn.dataset.idx, 10);
        var riEd    = S.modelIdentifierEditors[riModel];
        if (riEd && !isNaN(riIdx)) {
          riEd.pendingIdentifier.splice(riIdx, 1);
          window.FSV2.renderDefaults();
        }
        return;
      }
      if (action === 'save-model-identifier') {
        var siModel  = btn.dataset.model;
        var siEd     = S.modelIdentifierEditors[siModel];
        if (!siEd) return;
        var saveIdent = siEd.pendingIdentifier.map(function (f) {
          return { name: f.name, label: f.label };
        });
        await window.FSV2.api('/settings/model-identifier-fields', {
          method: 'PUT',
          body: JSON.stringify({ model: siModel, fields: saveIdent }),
        });
        var siModelObj = (S.odooModelsCache || []).find(function (m) { return m.name === siModel; });
        if (siModelObj) siModelObj.identifier_fields = saveIdent;
        S.modelIdentifierEditors[siModel] = { open: false, pendingIdentifier: [] };
        window.FSV2.showAlert('Identifier velden opgeslagen.', 'success');
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
        dialog.dataset.integrationId  = btn.dataset.integrationId || btn.dataset.integrationid || '';
        dialog.dataset.selectedObject = '';
        dialog.dataset.selectedOp     = '';
        // Populate model picker (voor webactiviteit)
        var addModels2 = Array.isArray(S.odooModelsCache) ? S.odooModelsCache : (window.FSV2.DEFAULT_ODOO_MODELS || []);
        var picker = document.getElementById('addTargetModelPicker');
        if (picker) {
          picker.innerHTML = '<option value="">\u2014 kies model \u2014</option>' +
            addModels2.map(function (m) {
              return '<option value="' + window.FSV2.esc(m.name) + '">' + window.FSV2.esc(m.label || m.name) + ' (' + window.FSV2.esc(m.name) + ')</option>';
            }).join('');
          picker.onchange = function () { if (window.FSV2._updateAddTargetConfirm) window.FSV2._updateAddTargetConfirm(); };
        }
        // Toon stap 1, verberg stap 2
        var step1 = document.getElementById('addTargetStep1');
        var step2 = document.getElementById('addTargetStep2');
        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
        var confirmBtn = document.getElementById('confirmAddTargetBtn');
        if (confirmBtn) confirmBtn.disabled = true;
        if (window.FSV2.renderAddTargetDialog) window.FSV2.renderAddTargetDialog();
        dialog.showModal();
        return;
      }
      if (action === 'close-add-target-dialog') {
        var dlg2 = document.getElementById('addTargetDialog');
        if (dlg2) dlg2.close();
        return;
      }
      if (action === 'select-target-object') {
        var dlgSO = document.getElementById('addTargetDialog');
        if (!dlgSO) return;
        dlgSO.dataset.selectedObject = btn.dataset.objectId || '';
        dlgSO.dataset.selectedOp     = '';
        var objId = dlgSO.dataset.selectedObject;
        var isSpecial = objId === 'chatter_message' || objId === 'create_activity';
        if (isSpecial) {
          // Geen operatie-stap nodig: op = object zelf
          dlgSO.dataset.selectedOp = objId;
          var confirmBtnSO = document.getElementById('confirmAddTargetBtn');
          if (confirmBtnSO) confirmBtnSO.disabled = false;
          if (window.FSV2.renderAddTargetDialog) window.FSV2.renderAddTargetDialog();
        } else {
          // Toon stap 2
          var s1 = document.getElementById('addTargetStep1');
          var s2 = document.getElementById('addTargetStep2');
          if (s1) s1.classList.add('hidden');
          if (s2) s2.classList.remove('hidden');
          if (window.FSV2.renderAddTargetStep2) window.FSV2.renderAddTargetStep2();
        }
        return;
      }
      if (action === 'select-target-op') {
        var dlgOP = document.getElementById('addTargetDialog');
        if (!dlgOP) return;
        dlgOP.dataset.selectedOp = btn.dataset.opType || '';
        if (window.FSV2.renderAddTargetStep2) window.FSV2.renderAddTargetStep2();
        return;
      }
      if (action === 'add-target-back') {
        var dlgBK = document.getElementById('addTargetDialog');
        if (dlgBK) { dlgBK.dataset.selectedOp = ''; dlgBK.dataset.selectedObject = ''; }
        var s1b = document.getElementById('addTargetStep1');
        var s2b = document.getElementById('addTargetStep2');
        if (s1b) s1b.classList.remove('hidden');
        if (s2b) s2b.classList.add('hidden');
        var confirmBtnBK = document.getElementById('confirmAddTargetBtn');
        if (confirmBtnBK) confirmBtnBK.disabled = true;
        if (window.FSV2.renderAddTargetDialog) window.FSV2.renderAddTargetDialog();
        return;
      }
      if (action === 'confirm-add-target') {
        var dlg3 = document.getElementById('addTargetDialog');
        if (!dlg3) return;
        var selObj3  = dlg3.dataset.selectedObject || '';
        var selOp3   = dlg3.dataset.selectedOp     || '';
        var integId3 = dlg3.dataset.integrationId  || '';
        if (!selObj3 || !integId3) { window.FSV2.showAlert('Kies een type stap.', 'error'); return; }
        dlg3.close();
        await window.FSV2.handleAddTargetWithType(integId3, selObj3, selOp3);
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
      if (action === 'ff-sub-nav') {
        var _dir = parseInt(btn.dataset.dir || '1', 10);
        if (!window.FSV2._ffSubmIdx) window.FSV2._ffSubmIdx = {};
        var _navKey = 'ffSubmIdx_' + String(window.FSV2.S.activeId || '');
        var _subs = (window.FSV2.S.submissions || []).filter(function(s) { return s.source_payload; });
        if (_subs.length > 1) {
          var _cur = window.FSV2._ffSubmIdx[_navKey] || 0;
          window.FSV2._ffSubmIdx[_navKey] = (_cur + _dir + _subs.length) % _subs.length;
        }
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        return;
      }
      if (action === 'chatter-preview-nav') {
        var tid = btn.dataset.targetId || btn.dataset.targetid;
        var dir = parseInt(btn.dataset.dir || '1', 10);
        if (tid) {
          if (!window.FSV2._chatterPreviewSubmIdx) window.FSV2._chatterPreviewSubmIdx = {};
          var _subs = (window.FSV2.S.submissions || []).filter(function(s) { return s.source_payload; });
          if (_subs.length > 1) {
            var _cur = window.FSV2._chatterPreviewSubmIdx[tid] || 0;
            window.FSV2._chatterPreviewSubmIdx[tid] = (_cur + dir + _subs.length) % _subs.length;
          }
          if (window.FSV2.scheduleChatterPreview) window.FSV2.scheduleChatterPreview(tid);
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
      if (action === 'toggle-field-hidden') {
        var thfFid = btn.dataset.fieldId || '';
        if (thfFid && window.FSV2.handleToggleFieldHidden) window.FSV2.handleToggleFieldHidden(thfFid);
        return;
      }
      if (action === 'toggle-field-show-in-list') {
        var tsilFid = btn.dataset.fieldId || '';
        if (tsilFid && window.FSV2.handleToggleShowInList) window.FSV2.handleToggleShowInList(tsilFid);
        return;
      }
      if (action === 'toggle-field-config') {
        var fieldId = btn.dataset.fieldId || '';
        if (!fieldId) return;
        var panel = document.querySelector('.field-config-panel[data-field-id="' + fieldId + '"]');
        if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
        return;
      }
      if (action === 'toggle-bulk-import-show') {
        var tbisFid = btn.dataset.fieldId || '';
        if (tbisFid && window.FSV2.handleToggleBulkImportShow) window.FSV2.handleToggleBulkImportShow(tbisFid);
        return;
      }

      // Voeg toe DIRECT NA de handler voor 'toggle-show-hidden' (rond regel 803)
      // Vervangt de eerder toegevoegde open-field-config / close-field-config-modal handlers

      if (action === 'toggle-field-panel') {
        var tfpFid = btn.dataset.fieldId || '';
        if (!tfpFid) return;
        window.FSV2.S._editingAliasField = null;
        if (window.FSV2.S._openFieldConfigPanel === tfpFid) {
          window.FSV2.S._openFieldConfigPanel = null;
          window.FSV2.S._expandedValueMapField = null;
          window.FSV2.S._pendingValueMapRows = [];
          window.FSV2.S._pendingCatchall = '';
        } else {
          window.FSV2.S._openFieldConfigPanel = tfpFid;
          window.FSV2.S._expandedValueMapField = null;
          var tfpFt = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[tfpFid]) || null;
          if (tfpFt && tfpFt.field_type === 'selection') {
            var tfpVmap = (tfpFt.value_map && typeof tfpFt.value_map === 'object') ? tfpFt.value_map : {};
            window.FSV2.S._pendingCatchall = tfpVmap['__catchall__'] !== undefined ? String(tfpVmap['__catchall__']) : '';
            window.FSV2.S._pendingValueMapRows = buildOrderedValueMapRows(tfpVmap, tfpFt.value_map_order);
          } else {
            window.FSV2.S._pendingValueMapRows = [];
            window.FSV2.S._pendingCatchall = '';
          }
        }
        var _scrollY = window.scrollY;
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        window.scrollTo({ top: _scrollY, behavior: 'instant' });
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
     
      if (action === 'toggle-show-hidden') {
        if (window.FSV2.handleToggleShowHidden) window.FSV2.handleToggleShowHidden();
        return;
      }
      if (action === 'preview-sub-prev' || action === 'preview-sub-next') {
        var subs = (window.FSV2.S && window.FSV2.S.submissions) || [];
        if (!subs.length) return;
        var cur = window.FSV2.S._previewSubmissionIdx != null ? window.FSV2.S._previewSubmissionIdx : 0;
        if (action === 'preview-sub-prev') {
          cur = (cur - 1 + subs.length) % subs.length;
        } else {
          cur = (cur + 1) % subs.length;
        }
        window.FSV2.S._previewSubmissionIdx = cur;
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        return;
      }
      if (action === 'start-edit-name') {
        var senFid = btn.dataset.fieldId || '';
        if (!senFid) return;
        window.FSV2.S._editingNameField = senFid;
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        setTimeout(function () {
          var inp = document.getElementById('inline-alias-' + senFid);
          if (inp) { inp.focus(); inp.select(); }
        }, 30);
        return;
      }
      if (action === 'save-inline-name') {
        var sinFid = btn.dataset.fieldId || '';
        if (!sinFid) return;
        var sinInp = document.getElementById('inline-alias-' + sinFid);
        var sinVal = sinInp ? sinInp.value : '';
        window.FSV2.S._editingNameField = null;
        if (window.FSV2.handleSaveFieldAlias) window.FSV2.handleSaveFieldAlias(sinFid, sinVal);
        return;
      }
      if (action === 'cancel-inline-name') {
        var cinFid = btn.dataset.fieldId || '';
        window.FSV2.S._editingNameField = null;
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        return;
      }
      if (action === 'save-field-panel') {
        var sfpFid     = btn.dataset.fieldId || '';
        var sfpHasBulk = btn.dataset.hasBulk === '1';
        var sfpHasVmap = btn.dataset.hasVmap === '1';
        if (!sfpFid) return;
        (async function () {
          // Save bulk default
          if (sfpHasBulk) {
            var sfpBulkInp = document.getElementById('bulk-inp-' + sfpFid);
            if (sfpBulkInp && window.FSV2.handleSaveBulkImportDefault) window.FSV2.handleSaveBulkImportDefault(sfpFid, sfpBulkInp.value);
          }
          // Save valuemap (async)
          if (sfpHasVmap) {
            if (window.FSV2.syncPendingValueMapFromDom) window.FSV2.syncPendingValueMapFromDom();
            var svRows = window.FSV2.S._pendingValueMapRows || [];
            var sfpValueMap = {};
            var sfpOrder = [];
            svRows.forEach(function (row) {
              var k = (row.from || '').trim();
              if (!k) return;
              sfpValueMap[k] = row.to || '';
              sfpOrder.push(k);
            });
            var sfpCatchall = (window.FSV2.S._pendingCatchall || '').trim();
            if (sfpCatchall) sfpValueMap['__catchall__'] = sfpCatchall;
            var sfpIntegId = String(window.FSV2.S.activeId || '');
            var sfpExistFt = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[sfpFid]) || {};
            var sfpFtype   = sfpExistFt.field_type || 'selection';
            var sfpNorm    = typeof normalizeValueMapOrder === 'function' ? normalizeValueMapOrder(sfpOrder) : sfpOrder;
            await window.FSV2.api('/integrations/' + sfpIntegId + '/field-transforms/' + encodeURIComponent(sfpFid), {
              method: 'PUT',
              body: JSON.stringify({ field_type: sfpFtype, value_map: Object.keys(sfpValueMap).length ? sfpValueMap : null, value_map_order: sfpNorm }),
            });
            window.FSV2.S.fieldTransforms = window.FSV2.S.fieldTransforms || {};
            window.FSV2.S.fieldTransforms[sfpFid] = Object.assign({}, sfpExistFt, { field_type: sfpFtype, value_map: Object.keys(sfpValueMap).length ? sfpValueMap : null, value_map_order: sfpNorm });
          }
          if (window.FSV2.showAlert) window.FSV2.showAlert('Opgeslagen', 'success');
          if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        })();
        return;
      }
      if (action === 'save-field-alias') {
        var safFid = btn.dataset.fieldId || '';
        if (!safFid) return;
        var safInput = document.getElementById('alias-inp-' + safFid);
        if (window.FSV2.handleSaveFieldAlias) window.FSV2.handleSaveFieldAlias(safFid, safInput ? safInput.value : '');
        return;
      }
      if (action === 'clear-field-alias') {
        var cafFid = btn.dataset.fieldId || '';
        if (cafFid && window.FSV2.handleSaveFieldAlias) window.FSV2.handleSaveFieldAlias(cafFid, '');
        return;
      }
      if (action === 'start-edit-alias') {
        var seaFid = btn.dataset.fieldId || '';
        if (!seaFid) return;
        window.FSV2.S._editingAliasField = seaFid;
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        var inp = document.getElementById('alias-inline-' + seaFid);
        if (inp) { inp.focus(); inp.select(); }
        return;
      }
      if (action === 'save-inline-alias') {
        var siaFid = btn.dataset.fieldId || '';
        if (!siaFid) return;
        var siaInp = document.getElementById('alias-inline-' + siaFid);
        window.FSV2.S._editingAliasField = null;
        if (window.FSV2.handleSaveFieldAlias) window.FSV2.handleSaveFieldAlias(siaFid, siaInp ? siaInp.value : '');
        return;
      }
      if (action === 'cancel-inline-alias') {
        var ciaFid = btn.dataset.fieldId || '';
        window.FSV2.S._editingAliasField = null;
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'save-field-panel') {
        // Slaat waardemap + standaardwaarde op in één klik.
        // Veldtype wordt al auto-opgeslagen bij change (save-field-transform select).
        var sfpFid    = btn.dataset.fieldId       || '';
        var sfpInteg  = btn.dataset.integrationId || '';
        if (!sfpFid || !sfpInteg) return;

        var sfpSaved = [];

        // 1. Waardemap opslaan (als er rijen zijn)
        if (window.FSV2.syncPendingValueMapFromDom) window.FSV2.syncPendingValueMapFromDom();
        var sfpRows = window.FSV2.S._pendingValueMapRows || [];
        var sfpFt   = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[sfpFid]) || {};
        if (sfpRows.length > 0) {
          var sfpVmap = {};
          var sfpOrder = [];
          sfpRows.forEach(function (row) {
            var k = (row.from || '').trim();
            if (!k) return;
            sfpVmap[k] = row.to || '';
            sfpOrder.push(k);
          });
          var sfpCatchall = (window.FSV2.S._pendingCatchall || '').trim();
          if (sfpCatchall) sfpVmap['__catchall__'] = sfpCatchall;
          var sfpNormOrder = normalizeValueMapOrder(sfpOrder);
          await window.FSV2.api('/integrations/' + sfpInteg + '/field-transforms/' + encodeURIComponent(sfpFid), {
            method: 'PUT',
            body: JSON.stringify({
              field_type: sfpFt.field_type || 'selection',
              value_map: Object.keys(sfpVmap).length ? sfpVmap : null,
              value_map_order: sfpNormOrder,
            }),
          });
          window.FSV2.S.fieldTransforms         = window.FSV2.S.fieldTransforms || {};
          window.FSV2.S.fieldTransforms[sfpFid] = Object.assign({}, sfpFt, {
            field_type:      sfpFt.field_type || 'selection',
            value_map:       Object.keys(sfpVmap).length ? sfpVmap : null,
            value_map_order: sfpNormOrder,
          });
          sfpSaved.push('waardemap');
        }

        // 2. Standaardwaarde opslaan
        var sfpInp = document.getElementById('bulk-inp-' + sfpFid);
        if (sfpInp && window.FSV2.handleSaveBulkImportDefault) {
          await window.FSV2.handleSaveBulkImportDefault(sfpFid, sfpInp.value);
          sfpSaved.push('standaardwaarde');
        }

        window.FSV2.showAlert(sfpSaved.length ? sfpSaved.join(' + ') + ' opgeslagen.' : 'Opgeslagen.', 'success');
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'save-bulk-import-default') {
        var sbidFid = btn.dataset.fieldId || '';
        if (!sbidFid || !window.FSV2.handleSaveBulkImportDefault) return;
        var sbidInput = document.getElementById('bulk-inp-' + sbidFid);
        window.FSV2.handleSaveBulkImportDefault(sbidFid, sbidInput ? sbidInput.value : '');
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
          window.FSV2.S._pendingValueMapRows = buildOrderedValueMapRows(tvVmap, tvFt && tvFt.value_map_order);
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
      if (action === 'move-valuemap-row-up' || action === 'move-valuemap-row-down') {
        if (window.FSV2.syncPendingValueMapFromDom) window.FSV2.syncPendingValueMapFromDom();
        var mvRowIdx = parseInt(btn.dataset.rowIdx, 10);
        if (!isNaN(mvRowIdx) && Array.isArray(window.FSV2.S._pendingValueMapRows)) {
          var rows = window.FSV2.S._pendingValueMapRows;
          var swapIdx = action === 'move-valuemap-row-up' ? mvRowIdx - 1 : mvRowIdx + 1;
          if (swapIdx >= 0 && swapIdx < rows.length) {
            var current = rows[mvRowIdx];
            rows[mvRowIdx] = rows[swapIdx];
            rows[swapIdx] = current;
          }
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
        var valueMapOrder = [];
        svRows.forEach(function (row) {
          var k = (row.from || '').trim();
          if (!k) return;
          valueMap[k] = row.to || '';
          valueMapOrder.push(k);
        });
        var catchall = (window.FSV2.S._pendingCatchall || '').trim();
        if (catchall) valueMap['__catchall__'] = catchall;
        var existingFt = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[svFieldId]) || {};
        var normalizedOrder = normalizeValueMapOrder(valueMapOrder);
        await window.FSV2.api('/integrations/' + svIntegId + '/field-transforms/' + encodeURIComponent(svFieldId), {
          method: 'PUT',
          body: JSON.stringify({
            field_type: 'selection',
            value_map: Object.keys(valueMap).length ? valueMap : null,
            value_map_order: normalizedOrder,
          }),
        });
        window.FSV2.S.fieldTransforms = window.FSV2.S.fieldTransforms || {};
        window.FSV2.S.fieldTransforms[svFieldId] = Object.assign({}, existingFt, {
          field_type: 'selection',
          value_map: Object.keys(valueMap).length ? valueMap : null,
          value_map_order: normalizedOrder,
        });
        window.FSV2.showAlert('Waardemap opgeslagen.', 'success');
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      if (action === 'wizard-skip-chatter') {
        await window.FSV2.wizardSkipChatter();
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
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    var inp = event.target;
    if (!inp || inp.tagName !== 'INPUT') return;
    var fid = inp.id && inp.id.startsWith('alias-inline-') ? inp.id.slice('alias-inline-'.length) : null;
    if (!fid) return;
    event.preventDefault();
    if (event.key === 'Enter') {
      window.FSV2.S._editingAliasField = null;
      if (window.FSV2.handleSaveFieldAlias) window.FSV2.handleSaveFieldAlias(fid, inp.value);
    } else {
      window.FSV2.S._editingAliasField = null;
      if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
  });

  document.addEventListener('scroll', function (e) {
    if (e.target && (e.target.closest && e.target.closest('.fsp-panel'))) return;
    window.OpenVME.FieldPicker.closeAll();
  }, true);

  // ── Filter field picker list on search input ───────────────────────────────
  document.addEventListener('input', function (event) {
    var el = event.target;

    // Default field label edit (settings model editor)
    if (el && el.dataset && el.dataset.action === 'edit-default-field-label') {
      var dlIdx = parseInt(el.dataset.idx, 10);
      if (!isNaN(dlIdx) && Array.isArray(window.FSV2.S.editingDefaultFields) && window.FSV2.S.editingDefaultFields[dlIdx]) {
        window.FSV2.S.editingDefaultFields[dlIdx].label = el.value;
      }
      return;
    }

    // Identifier field label edit (settings model editor)
    if (el && el.dataset && el.dataset.action === 'edit-identifier-field-label') {
      var ilModel = el.dataset.model;
      var ilIdx   = parseInt(el.dataset.idx, 10);
      var ilEd    = ilModel && window.FSV2.S.modelIdentifierEditors && window.FSV2.S.modelIdentifierEditors[ilModel];
      if (ilEd && !isNaN(ilIdx) && Array.isArray(ilEd.pendingIdentifier) && ilEd.pendingIdentifier[ilIdx]) {
        ilEd.pendingIdentifier[ilIdx].label = el.value;
      }
      return;
    }

    // Hidden field search filter
    if (el && el.id === 'hiddenFieldSearch') {
      var q = el.value.toLowerCase();
      document.querySelectorAll('[data-field-item]').forEach(function(item) {
        item.style.display = (q && !item.dataset.fieldItem.includes(q)) ? 'none' : '';
      });
      return;
    }

    var srch = el.closest('.fsp-search');
    if (!srch) return;
    window.OpenVME.FieldPicker.filterList(srch.dataset.fspId, srch.value);
  });

  // ── FieldPicker change → waarde-map rij tonen/bijwerken ──────────────────
  // Wanneer de gebruiker een Odoo-veld selecteert voor een formulierveld met keuzemogelijkheden,
  // tonen we automatisch de waarde-mapping sectie als het een selection- of many2one-veld is.
  document.addEventListener('change', function (event) {
    var inp = event.target;
    // ── set-step-identifier dropdown ──────────────────────────────────────
    if (inp && inp.tagName === 'SELECT' && inp.dataset.action === 'set-step-identifier') {
      var ssiTargetId = inp.dataset.targetId || '';
      var ssiValue    = inp.value || null;
      if (!ssiTargetId) return;
      var ssiIntegId  = window.FSV2.S.detail && window.FSV2.S.detail.integration ? window.FSV2.S.detail.integration.id : '';
      if (!ssiIntegId) return;
      window.FSV2.api('/integrations/' + ssiIntegId + '/targets/' + ssiTargetId, {
        method: 'PUT',
        body: JSON.stringify({ identifier_field: ssiValue }),
      }).then(function () {
        var ssiTargets = window.FSV2.S.detail && window.FSV2.S.detail.targets;
        if (ssiTargets) {
          var ssiT = ssiTargets.find(function (t) { return String(t.id) === String(ssiTargetId); });
          if (ssiT) ssiT.identifier_field = ssiValue;
        }
        window.FSV2.showAlert('Zoekcriterium opgeslagen.', 'success');
      }).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
      return;
    }
    // ── Field transform type select ────────────────────────────────────────
    if (inp && inp.tagName === 'SELECT' && inp.dataset.action === 'save-field-transform') {
      var ftFieldId  = inp.dataset.fieldId  || '';
      var ftIntegId  = inp.dataset.integrationId || '';
      var ftNewType  = inp.value || 'text';
      if (!ftFieldId || !ftIntegId) return;
      var ftExisting = (window.FSV2.S.fieldTransforms && window.FSV2.S.fieldTransforms[ftFieldId]) || {};
      window.FSV2.api('/integrations/' + ftIntegId + '/field-transforms/' + encodeURIComponent(ftFieldId), {
        method: 'PUT',
        body: JSON.stringify({
          field_type: ftNewType,
          value_map: ftExisting.value_map || null,
          value_map_order: normalizeValueMapOrder(ftExisting.value_map_order || []),
        }),
      }).then(function () {
        window.FSV2.S.fieldTransforms = window.FSV2.S.fieldTransforms || {};
        window.FSV2.S.fieldTransforms[ftFieldId] = Object.assign({}, ftExisting, {
          field_type: ftNewType,
          value_map_order: normalizeValueMapOrder(ftExisting.value_map_order || []),
        });
        window.FSV2.showAlert('Type opgeslagen.', 'success');
        if (window.FSV2.renderDetailFormFields) window.FSV2.renderDetailFormFields();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
      return;
    }
    // Auto-save standaardwaarde op change (select = direct, text/number/date = op blur)
    if (inp && inp.dataset.bulkDefaultFid) {
      var bdfFid = inp.dataset.bulkDefaultFid;
      if (bdfFid && window.FSV2.handleSaveBulkImportDefault) window.FSV2.handleSaveBulkImportDefault(bdfFid, inp.value);
      return;
    }

    // Condition field selector change — refresh value suggestions dynamically
    if (inp && inp.tagName === 'SELECT' && inp.dataset.changeAction === 'cond-field-changed') {
      var condChangeTid = inp.dataset.targetId || '';
      if (condChangeTid && window.FSV2.handleCondFieldChanged) {
        window.FSV2.handleCondFieldChanged(condChangeTid, inp.value);
      }
      return;
    }
    // defaults-source-mode select — update pendingFields[i].source_mode in place
    if (inp && inp.tagName === 'SELECT' && inp.classList.contains('defaults-source-mode')) {
      var dsmModel = inp.dataset.model || '';
      var dsmIdx   = parseInt(inp.dataset.idx, 10);
      var dsmEd    = window.FSV2.S.modelDefaultsEditors && window.FSV2.S.modelDefaultsEditors[dsmModel];
      if (dsmEd && dsmEd.pendingFields && dsmEd.pendingFields[dsmIdx] !== undefined) {
        dsmEd.pendingFields[dsmIdx].source_mode = inp.value;
      }
      return;
    }
    // defaults-req-toggle checkbox — update pendingFields[i].required in place
    if (inp && inp.tagName === 'INPUT' && inp.type === 'checkbox' && inp.classList.contains('defaults-req-toggle')) {
      var drtModel = inp.dataset.model || '';
      var drtIdx   = parseInt(inp.dataset.idx, 10);
      var drtEd    = window.FSV2.S.modelDefaultsEditors && window.FSV2.S.modelDefaultsEditors[drtModel];
      if (drtEd && drtEd.pendingFields && drtEd.pendingFields[drtIdx] !== undefined) {
        drtEd.pendingFields[drtIdx].required = inp.checked;
      }
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
        `<div class="flex flex-wrap gap-1 items-center mb-1.5">` +
          `<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Opties:</span>` +
          previewChoices.map(function (ch) {
            return `<span class="badge badge-ghost badge-xs" title="${window.FSV2.esc(String(ch.value || ''))}">` +
              `${window.FSV2.esc(String(ch.label || ch.value || ''))}</span>`;
          }).join('') +
        `</div>` +
        `<p class="text-xs text-base-content/40 italic">Kies een Odoo <strong>selectie</strong>- of <strong>many2one</strong>-veld hierboven om de waarden te mappen.</p>`;
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
  function changeTheme(theme) {
    localStorage.setItem('selectedTheme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  function renderNavbar(navbarHtml) {
    if (window.renderSharedNavbar) window.renderSharedNavbar(navbarHtml);
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
    var navbarHtml = me.navbarHtml || '';

    renderNavbar(navbarHtml);
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
