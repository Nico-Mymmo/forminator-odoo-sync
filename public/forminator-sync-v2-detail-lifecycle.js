/**
 * Forminator Sync V2 -- Detail -- view lifecycle
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

  async function openDetail(id) {
    S().activeId = id;
    window.FSV2.showView('detail');

    var headerEl = document.getElementById('detailHeader');
    if (headerEl) {
      headerEl.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-md"></span></div>';
    }

    try {
      var results = await Promise.all([
        window.FSV2.api('/integrations/' + id),
        window.FSV2.api('/integrations/' + id + '/test-status'),
        window.FSV2.api('/integrations/' + id + '/submissions'),
      ]);
      S().detail      = results[0].data;
      S().detail._extraRowsByTarget = null;
      S().testStatus  = results[1].data;
      S().submissions = results[2].data || [];
      S().detailFormFields = null;
      S().fieldTransforms         = {};
      S()._expandedValueMapField  = null;
      S()._pendingValueMapRows    = [];
      S()._pendingCatchall        = '';
      S()._fieldMeta        = window.FSV2._loadFieldMeta(id);  // reads from integration.field_meta
      S()._showHiddenFields = false;
      // Laad warnings (fire-and-forget) — nodig voor step card badges
      window.FSV2.api('/integrations/warnings').then(function (wb) {
        S().integrationWarnings = wb.data || {};
        if (S().activeId === id) window.FSV2.renderDetailMappings();
      }).catch(function () {});

      window.FSV2.api('/integrations/' + id + '/field-transforms').then(function (r) {
        S().fieldTransforms = {};
        (r.data || []).forEach(function (t) { S().fieldTransforms[t.field_name] = t; });
        if (S().activeId === id) window.FSV2.renderDetailFormFields();
      }).catch(function () {});

      if (!S().webhookConfig) {
        window.FSV2.api('/webhook-config').then(function (r) {
          S().webhookConfig = r.data || null;
          if (S().activeId === id) window.FSV2.renderDetail();
        }).catch(function () {});
      }

      var detailIntegration = S().detail && S().detail.integration;
      var detailSiteKey     = detailIntegration && detailIntegration.site_key;
      var detailFormId      = detailIntegration && detailIntegration.forminator_form_id;

      // For generic_webhook integrations: fetch per-integration webhook URL
      S()._genericWebhookUrl = null;
      if (detailIntegration && detailIntegration.source_type === 'generic_webhook') {
        window.FSV2.api('/integrations/' + id + '/webhook-url').then(function (r) {
          S()._genericWebhookUrl = (r.data && r.data.webhook_url) ? r.data.webhook_url : null;
          if (S().activeId === id) window.FSV2.renderDetail();
        }).catch(function () {});
        // Extract form fields from the source_payload of the most recent submission
        window.FSV2.extractGenericWebhookFields();
      } else if (detailFormId) {
        window.FSV2.fetchDetailFormFields(detailSiteKey || null, detailFormId).catch(function () {});
      }

      var detailTargets = (S().detail && S().detail.targets) ? S().detail.targets : [];
      var detailModels = [];
      detailTargets.forEach(function (t) {
        if (t.odoo_model && !detailModels.includes(t.odoo_model)) detailModels.push(t.odoo_model);
      });
      detailModels.forEach(function (detailModel) {
        if (!S().odooFieldsCache[detailModel] || !S().odooFieldsCache[detailModel].length) {
          window.FSV2.loadOdooFieldsForModel(detailModel).then(function () {
            if (S().activeId !== id) return;
            window.FSV2.renderDetailMappings();
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          });
        }
      });
      window.FSV2.renderDetail();
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    }
  }

  async function handleToggleActive(checked) {
    if (!checked) {
      var integName = (S().detail && S().detail.integration && S().detail.integration.name) || 'deze integratie';
      if (!confirm('Integratie "' + integName + '" deactiveren?\n\nNieuwe formulierinzendingen worden niet meer verwerkt zolang de integratie inactief is.')) {
        var toggle = document.getElementById('detailActiveToggle');
        if (toggle) toggle.checked = true;
        return;
      }
    }
    try {
      await window.FSV2.api('/integrations/' + S().activeId, {
        method: 'PUT',
        body: JSON.stringify({ is_active: checked }),
      });
      window.FSV2.showAlert(checked ? 'Integratie geactiveerd.' : 'Integratie gedeactiveerd.', 'success');
      await window.FSV2.openDetail(S().activeId);
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
      var toggle = document.getElementById('detailActiveToggle');
      if (toggle) toggle.checked = !checked;
    }
  }

  async function handleRunTest() {
    await window.FSV2.api('/integrations/' + S().activeId + '/test-stub', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    window.FSV2.showAlert('Test geslaagd. Activatie is nu toegestaan.', 'success');
    var testBody = await window.FSV2.api('/integrations/' + S().activeId + '/test-status');
    S().testStatus = testBody.data;
    window.FSV2.updateDetailTestStatus();
  }

  async function handleAddMapping(form) {
    var targetId    = form.dataset.targetId;
    var odooField   = ((form.querySelector('[name="odoo_field"]') || {}).value || '').trim();
    var sourceType  = (form.querySelector('[name="source_type"]') || {}).value || 'form';
    var sourceValue = ((form.querySelector('[name="source_value"]') || {}).value || '').trim();
    var isRequired  = !!((form.querySelector('[name="is_required"]')  || {}).checked);
    var isIdentifier = !!((form.querySelector('[name="is_identifier"]') || {}).checked);

    if (!odooField || !sourceValue) {
      window.FSV2.showAlert('Odoo veld en waarde zijn beide verplicht.', 'error');
      return;
    }

    await window.FSV2.api('/targets/' + targetId + '/mappings', {
      method: 'POST',
      body: JSON.stringify({ odoo_field: odooField, source_type: sourceType, source_value: sourceValue, is_required: isRequired, is_identifier: isIdentifier, order_index: 0 }),
    });
    window.FSV2.showAlert('Veldkoppeling toegevoegd.', 'success');
    form.reset();
    await window.FSV2.openDetail(S().activeId);
  }

  async function handleDeleteMapping(mappingId) {
    await window.FSV2.api('/mappings/' + mappingId, { method: 'DELETE' });
    window.FSV2.showAlert('Veldkoppeling verwijderd.', 'success');
    await window.FSV2.openDetail(S().activeId);
  }

  async function handleSaveMappings() {
    var container = document.getElementById('detailMappingsContainer');
    if (!container) { window.FSV2.showAlert('Editor niet gevonden.', 'error'); return; }
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    if (!targets.length) { window.FSV2.showAlert('Geen doel gevonden.', 'error'); return; }

    var sortedForChain = [...targets].sort(function (a, b) {
      return ((a.execution_order != null ? a.execution_order : (a.order_index != null ? a.order_index : 0))) -
             ((b.execution_order != null ? b.execution_order : (b.order_index != null ? b.order_index : 0)));
    });

    var _ffr       = window.FSV2.buildDetailFlatFields(S().detailFormFields);
    var flatFields = _ffr.flatFields;

    for (var i = 0; i < sortedForChain.length; i++) {
      var target   = sortedForChain[i];
      var tid      = String(target.id);
      var newMappings = [];
      var orderIdx    = 0;

      // Form-field rows (select per field, namespaced by target id).
      flatFields.forEach(function (ff) {
        var fid      = String(ff.field_id);
        var selEl    = container.querySelector('[name="det-ff-' + tid + '-odoo-' + fid + '"]');
        var odooField = selEl ? (selEl.value || '') : '';
        if (!odooField) return;
        var idCheckEl  = Array.from(container.querySelectorAll('input.detail-ff-id-check')).find(function (el) {
          return el.getAttribute('name') === 'det-' + tid + '-identifier-' + fid;
        });
        var updCheckEl = Array.from(container.querySelectorAll('input.detail-ff-upd-check')).find(function (el) {
          return el.getAttribute('name') === 'det-' + tid + '-update-' + fid;
        });
        var isIdentifier  = idCheckEl  ? idCheckEl.checked  : false;
        var isUpdateField = updCheckEl ? updCheckEl.checked : true;

        // Collect value_map for choice fields
        var vmapInputs = container.querySelectorAll('[name^="det-ff-' + tid + '-vmapv-' + fid + '-"]');
        var valueMap = null;
        if (vmapInputs.length > 0) {
          var vmapObj = {};
          var hasAny  = false;
          vmapInputs.forEach(function (inp) {
            var choiceVal = inp.dataset.choiceValue;
            var odooVal   = (inp.value || '').trim();
            if (choiceVal && odooVal) { vmapObj[choiceVal] = odooVal; hasAny = true; }
          });
          if (hasAny) valueMap = vmapObj;
        }

        newMappings.push({ odoo_field: odooField, source_type: 'form', source_value: fid,
          is_identifier: isIdentifier, is_update_field: isUpdateField, is_required: false, order_index: orderIdx++,
          value_map: valueMap });
      });

      // Extra / chain rows (keyed per target).
      var extraRows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid]) || [];
      extraRows.forEach(function (em, idx) {
        var tname = 'det-extra-' + tid + '-' + idx;
        var inpEl = document.getElementById('det-inp-' + tname);
        var val   = inpEl ? (inpEl.value || '').trim() : (em.staticValue || '');
        if (!val && em.sourceType !== 'previous_step_output' && em.sourceType !== 'html_form_summary') return;
        var sourceType;
        if (em.sourceType === 'previous_step_output') {
          sourceType = 'previous_step_output';
        } else if (em.sourceType === 'html_form_summary') {
          sourceType = 'html_form_summary';
        } else {
          sourceType = /\{[^}]+\}/.test(val) ? 'template' : 'static';
        }
        var sourceValue = em.sourceType === 'previous_step_output' ? (em.staticValue || val)
          : em.sourceType === 'html_form_summary' ? (em.staticValue || null)
          : val;
        var chainReqEl  = em.sourceType === 'previous_step_output'
          ? container.querySelector('input[name="det-extra-' + tid + '-chain-req-' + idx + '"]')
          : null;
        var isRequired  = chainReqEl ? chainReqEl.checked : (em.isRequired || false);
        if (!sourceValue) return;
        var extraIdChk  = container.querySelector('input[name="det-extra-' + tid + '-identifier-' + idx + '"]');
        var extraUpdChk = container.querySelector('input[name="det-extra-' + tid + '-update-' + idx + '"]');
        newMappings.push({ odoo_field: em.odooField, source_type: sourceType, source_value: sourceValue,
          is_identifier: extraIdChk ? extraIdChk.checked : false,
          is_update_field: extraUpdChk ? extraUpdChk.checked : true,
          is_required: isRequired, order_index: orderIdx++ });
      });

      await window.FSV2.api('/targets/' + tid + '/mappings', { method: 'DELETE' });
      await Promise.all(newMappings.map(function (m) {
        return window.FSV2.api('/targets/' + tid + '/mappings', { method: 'POST', body: JSON.stringify(m) });
      }));
    }

    window.FSV2.showAlert('Koppelingen opgeslagen.', 'success');
    S().detail._extraRowsByTarget = null;
    await window.FSV2.openDetail(S().activeId);
  }

  async function handleAddTarget(integrationId) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];

    // Read chosen model from the inline model-select (rendered next to the button).
    var sel       = document.getElementById('addTargetModelSelect-' + integrationId);
    var chosenModel = sel ? sel.value : null;
    if (!chosenModel) {
      // Legacy fallback: copy first target's model if select not present.
      var firstTarget = targets[0];
      if (!firstTarget) { window.FSV2.showAlert('Kies een model voor de nieuwe stap.', 'error'); return; }
      chosenModel = firstTarget.odoo_model;
    }

    var actionCfg = window.FSV2.getModelCfg(chosenModel) || {};

    var maxOrder = targets.reduce(function (max, t) {
      return Math.max(max, window.FSV2.getTargetOrder(t, 0));
    }, 0);
    await window.FSV2.api('/integrations/' + integrationId + '/targets', {
      method: 'POST',
      body: JSON.stringify({
        odoo_model:      chosenModel,
        identifier_type: actionCfg.identifier_type || 'mapped_fields',
        update_policy:   actionCfg.update_policy   || 'always_overwrite',
        execution_order: maxOrder + 1,
      }),
    });
    window.FSV2.showAlert('Stap toegevoegd.', 'success');
    await window.FSV2.openDetail(S().activeId);
  }

  // ── Fase 1: Model-kaarten in #addTargetObjectCards ──────────────────────────

  async function handleDeleteIntegration(id, name) {
    if (!confirm('Integratie "' + name + '" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    await window.FSV2.api('/integrations/' + id, { method: 'DELETE' });
    window.FSV2.showAlert('Integratie verwijderd.', 'success');
    await window.FSV2.loadIntegrations();
    window.FSV2.renderList();
  }


  Object.assign(window.FSV2, {
    handleAddMapping: handleAddMapping,
    handleAddTarget: handleAddTarget,
    handleDeleteIntegration: handleDeleteIntegration,
    handleDeleteMapping: handleDeleteMapping,
    handleRunTest: handleRunTest,
    handleSaveMappings: handleSaveMappings,
    handleToggleActive: handleToggleActive,
    openDetail: openDetail
  });
})();
