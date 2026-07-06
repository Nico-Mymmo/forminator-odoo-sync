/**
 * Forminator Sync V2 -- Detail -- shell & shared helpers
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

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER: DETAIL VIEW
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ============================================================================
  // PIPELINE STATE — module-level (survives openDetail reloads)
  // Keyed by String(integrationId) → { [String(targetId)]: true/false }
  var _pipelineOpenById = {};
  function getPipelineOpen(integrationId) {
    if (!_pipelineOpenById[String(integrationId)]) _pipelineOpenById[String(integrationId)] = {};
    return _pipelineOpenById[String(integrationId)];
  }

  /** Returns a human label for an Odoo model from live registry cache. */
  function modelLabel(modelName) {
    var cache = (window.FSV2.S && Array.isArray(window.FSV2.S.odooModelsCache))
      ? window.FSV2.S.odooModelsCache : [];
    var found = cache.find(function (m) { return m.name === modelName; });
    if (found && found.label) return found.label;
    return modelName;
  }
  var POLICY_LABELS = {
    'always_overwrite': 'Bijwerken of aanmaken',
    'upsert':           'Bijwerken of aanmaken',
    'create_only':      'Alleen aanmaken',
    'update_only':      'Alleen bijwerken',
  };

  function getTargetOrder(t, fallback) {
    return t.execution_order != null ? t.execution_order
         : (t.order_index    != null ? t.order_index : (fallback != null ? fallback : 0));
  }

  // ── Field metadata: per-integration hide/alias/show_in_list, persisted in DB ──────────
  var _saveFieldMetaTimer = null;
  function _loadFieldMeta(integId) {
    // Read from the already-loaded integration bundle (field_meta column)
    var integ = S().detail && S().detail.integration;
    if (integ && integ.id === integId && integ.field_meta && typeof integ.field_meta === 'object') {
      return integ.field_meta;
    }
    return {};
  }
  function _saveFieldMeta(integId, meta) {
    // Update local state immediately so re-renders pick it up
    if (S().detail && S().detail.integration && S().detail.integration.id === integId) {
      S().detail.integration.field_meta = meta;
    }
    // Debounced write to DB (fire-and-forget)
    if (_saveFieldMetaTimer) clearTimeout(_saveFieldMetaTimer);
    _saveFieldMetaTimer = setTimeout(function () {
      window.FSV2.api('/integrations/' + integId + '/field-meta', {
        method: 'PUT',
        body: JSON.stringify(meta),
      }).catch(function (e) {
        console.error('field_meta save failed:', e);
      });
    }, 400);
  }

  /**
   * Bouw { topLevel, flatFields } vanuit de ruwe WP-velden (S().detailFormFields).
   * Verborgen velden (S()._fieldMeta[fid].hidden) worden overgeslagen.
   * Alias (S()._fieldMeta[fid].alias) vervangt het label.
   */
  function buildDetailFlatFields(rawInput) {
    var SKIP      = window.FSV2.SKIP_TYPES;
    var fieldMeta = (S() && S()._fieldMeta) || {};
    var topLevel   = [];
    var flatFields = [];

    (Array.isArray(rawInput) ? rawInput : []).forEach(function (f) {
      var type = String(f.type || '');
      if (SKIP.includes(type)) return;
      var fid = String(f.field_id || '');
      if (fieldMeta[fid] && fieldMeta[fid].hidden) return;
      var displayLabel = (fieldMeta[fid] && fieldMeta[fid].alias)
        ? fieldMeta[fid].alias
        : String(f.label || fid);

      if (f.is_composite === true) {
        var children = Array.isArray(f.children) ? f.children : [];
        if (children.length === 0) {
          // Geen sub-velden in API-respons — voeg als plain entry toe zodat field_id bruikbaar blijft als placeholder
          var _plainParent = { field_id: fid, label: displayLabel, type: type, required: !!f.required };
          topLevel.push(_plainParent);
          flatFields.push(_plainParent);
          return;
        }

        var parentEntry = {
          field_id:           fid,
          label:              displayLabel,
          type:               type,
          required:           !!f.required,
          is_composite:       true,
          composite_children: children.map(function (c) { return String(c.field_id); }),
        };
        topLevel.push(parentEntry);
        flatFields.push(parentEntry);

        children.forEach(function (child) {
          var childFid  = String(child.field_id || '');
          if (fieldMeta[childFid] && fieldMeta[childFid].hidden) return;
          var childType = String(child.type || type);
          if (SKIP.includes(childType)) return;
          var childLabel = (fieldMeta[childFid] && fieldMeta[childFid].alias)
            ? fieldMeta[childFid].alias
            : String(child.label || childFid);
          var childEntry = {
            field_id:        childFid,
            label:           childLabel,
            type:            childType,
            required:        !!child.required,
            parent_field_id: fid,
          };
          if (Array.isArray(child.choices) && child.choices.length > 0) childEntry.choices = child.choices;
          flatFields.push(childEntry);
        });

      } else {
        var plain = {
          field_id: fid,
          label:    displayLabel,
          type:     type,
          required: !!f.required,
        };
        if (Array.isArray(f.choices) && f.choices.length > 0) plain.choices = f.choices;
        topLevel.push(plain);
        flatFields.push(plain);
      }
    });

    return { topLevel: topLevel, flatFields: flatFields };
  }

  function computeChainSuggestions(currentTarget, precedingTargets) {
    var model       = currentTarget.odoo_model;
    var suggestions = [];

    // 1. Registry-based suggestions (highest priority — explicitly configured)
    var links = (S().modelLinksCache) || [];
    precedingTargets.forEach(function (prevT, prevIdx) {
      links.forEach(function (link) {
        // Forward: stap N = link.model_a, huidige stap = link.model_b, veld staat op model_b
        if (link.model_a === prevT.odoo_model && link.model_b === model) {
          suggestions.push({
            odooField:    link.link_field,
            odooLabel:    link.link_label || link.link_field,
            relation:     link.model_a,
            stepOrder:    window.FSV2.getTargetOrder(prevT, prevIdx),
            stepLabel:    prevT.label || '',
            stepNum:      prevIdx + 1,
            prevTargetId: String(prevT.id),
            fromRegistry: true,
          });
        }
      });
    });

    // 2. Dynamic fallback: scan odooFieldsCache for many2one fields pointing to a preceding model
    //    Skip same-model suggestions (self-referential noise like res.partner.parent_id).
    //    Also skip entirely if registry already has an entry for this model pair.
    var odooCache = (S().odooFieldsCache || {})[model] || [];
    odooCache.forEach(function (field) {
      if (field.type !== 'many2one' || !field.relation) return;
      precedingTargets.forEach(function (prevT, prevIdx) {
        if (prevT.odoo_model !== field.relation) return;
        // Never suggest self-referential (same model → same model) via dynamic scan
        if (prevT.odoo_model === model) return;
        // Skip if registry already covers this model pair (avoid duplicate cards)
        var registryCoversPair = links.some(function (l) {
          return l.model_a === prevT.odoo_model && l.model_b === model;
        });
        if (registryCoversPair) return;
        // Skip if registry already covers this specific field
        var alreadyCovered = suggestions.some(function (s) { return s.odooField === field.name; });
        if (alreadyCovered) return;
        suggestions.push({
          odooField:    field.name,
          odooLabel:    field.label || field.name,
          relation:     field.relation,
          stepOrder:    window.FSV2.getTargetOrder(prevT, prevIdx),
          stepLabel:    prevT.label || '',
          stepNum:      prevIdx + 1,
          prevTargetId: String(prevT.id),
          fromRegistry: false,
        });
      });
    });

    return suggestions;
  }

  function isChainSuggestionApplied(tid, odooField) {
    // Check in-memory edits first
    var rows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid]) || [];
    if (rows.some(function (r) { return r.odooField === odooField && r.sourceType === 'previous_step_output'; })) return true;
    // Fall back to DB state (for collapsed cards that haven't been initialized yet)
    var dbMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[tid]) || [];
    return dbMappings.some(function (m) { return m.odoo_field === odooField && m.source_type === 'previous_step_output'; });
  }

  function renderDetail() {
    var integration = S().detail.integration;
    var resolvers   = S().detail.resolvers || [];
    var targets     = S().detail.targets   || [];

    var resolver  = resolvers[0];
    var target    = targets[0];
    var actionCfg = target ? (window.FSV2.getModelCfg(target.odoo_model) || null) : null;

    var headerEl = document.getElementById('detailHeader');
    if (headerEl) {
      var wc = S().webhookConfig;

      // Steps badges — all targets in order
      var sortedForHeader = [...targets].sort(function (a, b) {
        return window.FSV2.getTargetOrder(a, 0) - window.FSV2.getTargetOrder(b, 0);
      });
      var stepsHtml = '';
      if (sortedForHeader.length > 0) {
        stepsHtml = '<div class="flex flex-wrap items-center gap-1.5 mt-2">';
        sortedForHeader.forEach(function (t, i) {
          var cfg = window.FSV2.getModelCfg(t.odoo_model) || { label: t.odoo_model, badgeClass: 'badge-ghost' };
          var modelLabel = cfg.label || t.odoo_model;
          var stepLabel;
          if (t.operation_type === 'chatter_message') {
            stepLabel = 'Notitie bij ' + modelLabel;
          } else if (t.operation_type === 'create_activity') {
            stepLabel = 'Activiteit bij ' + modelLabel;
          } else if (t.operation_type === 'mailing_list') {
            stepLabel = 'Mailinglijst';
          } else {
            stepLabel = modelLabel;
          }
          var badgeClass = t.operation_type === 'chatter_message' ? 'badge-ghost'
            : t.operation_type === 'create_activity' ? 'badge-ghost'
            : cfg.badgeClass;
          if (i > 0) stepsHtml += '<i data-lucide="arrow-right" class="w-3 h-3 text-base-content/40 shrink-0"></i>';
          stepsHtml += '<span class="badge badge-sm ' + esc(badgeClass) + '">' + esc(stepLabel) + '</span>';
        });
        stepsHtml += '</div>';
      }

      var webhookBlock = '';
      if (integration.source_type === 'generic_webhook') {
        // Per-integration webhook URL (Zapier / generic)
        var gwUrl = S()._genericWebhookUrl || null;
        if (gwUrl) {
          webhookBlock =
            '<div class="mt-4 pt-4 border-t border-base-200">' +
              '<p class="text-xs font-semibold text-base-content/60 mb-1.5 flex items-center gap-1.5">' +
                '<i data-lucide="zap" class="w-3.5 h-3.5 text-warning"></i> Webhook URL (Zapier / Generic)' +
              '</p>' +
              '<div class="flex items-center gap-2">' +
                '<code class="flex-1 text-xs bg-base-200 rounded px-2 py-1.5 break-all select-all">' + esc(gwUrl) + '</code>' +
                '<button type="button" class="btn btn-xs btn-ghost shrink-0" id="btnCopyWebhook" title="Kopi\u00ebren">' +
                  '<i data-lucide="copy" class="w-3.5 h-3.5"></i>' +
                '</button>' +
              '</div>' +
              '<p class="text-xs text-base-content/60 mt-2">Stuur een HTTP POST met <code>Content-Type: application/json</code>. De token staat in de URL.</p>' +
            '</div>';
        } else {
          webhookBlock =
            '<div class="mt-4 pt-4 border-t border-base-200">' +
              '<span class="loading loading-spinner loading-xs"></span>' +
              '<span class="text-xs text-base-content/60 ml-2">Webhook URL laden\u2026</span>' +
            '</div>';
        }
      } else if (wc && wc.webhook_url) {
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
              '<div class="min-w-0 flex-1">' +
                '<div class="flex items-center gap-2 mb-1 min-w-0">' +
                  '<h2 id="detailIntegrationTitle" class="text-2xl font-bold truncate">' + esc(integration.name || 'Integratie') + '</h2>' +
                  '<button type="button" id="btnRenameIntegration" class="btn btn-xs btn-ghost shrink-0" title="Naam wijzigen">' +
                    '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>' +
                  '</button>' +
                '</div>' +
                '<p class="text-sm text-base-content/60">' +
                (integration.source_type === 'generic_webhook'
                  ? '<span class="badge badge-warning badge-sm mr-1">Zapier / Generic</span>Webhook-integratie'
                  : 'Formulier: <span class="font-mono">' + esc(integration.forminator_form_id || '\u2014') + '</span>') +
                '</p>' +
                stepsHtml +
              '</div>' +
              '<label class="flex items-center gap-3 cursor-pointer shrink-0">' +
                '<span class="font-semibold text-sm">' + (integration.is_active ? 'Actief' : 'Inactief') + '</span>' +
                '<input id="detailActiveToggle" type="checkbox" class="toggle toggle-success"' + (integration.is_active ? ' checked' : '') + '>' +
              '</label>' +
            '</div>' +
            webhookBlock +
          '</div>' +
        '</div>';

      var copyBtn = document.getElementById('btnCopyWebhook');
      if (copyBtn) {
        var urlToCopy = integration.source_type === 'generic_webhook'
          ? (S()._genericWebhookUrl || '')
          : (wc && wc.webhook_url ? wc.webhook_url : '');
        if (urlToCopy) {
          copyBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(urlToCopy).then(function () {
              window.FSV2.showAlert('Webhook URL gekopi\u00eberd.', 'success');
            }).catch(function () {
              window.FSV2.showAlert('Kopi\u00ebren mislukt \u2014 selecteer de URL handmatig.', 'warning');
            });
          });
        }
      }

      var toggle = document.getElementById('detailActiveToggle');
      if (toggle) {
        toggle.addEventListener('change', function (e) {
          window.FSV2.handleToggleActive(e.target.checked).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
        });
      }

      var renameBtn = document.getElementById('btnRenameIntegration');
      if (renameBtn) {
        renameBtn.addEventListener('click', function () {
          var titleEl = document.getElementById('detailIntegrationTitle');
          var currentName = titleEl ? titleEl.textContent : '';
          var wrapper = titleEl ? titleEl.parentElement : null;
          if (!wrapper) return;
          wrapper.innerHTML =
            '<input id="detailRenameInput" class="input input-bordered input-sm text-xl font-bold w-full max-w-sm" value="' + esc(currentName) + '">' +
            '<button type="button" id="btnRenameConfirm" class="btn btn-xs btn-primary shrink-0" title="Opslaan"><i data-lucide="check" class="w-3.5 h-3.5"></i></button>' +
            '<button type="button" id="btnRenameCancel" class="btn btn-xs btn-ghost shrink-0" title="Annuleren"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>';
          var inp = document.getElementById('detailRenameInput');
          if (inp) { inp.focus(); inp.select(); }
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          function doSave() {
            var val = ((document.getElementById('detailRenameInput') || {}).value || '').trim();
            if (val && val !== currentName) {
              handleRenameIntegration(val).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
            } else {
              window.FSV2.renderDetail();
            }
          }
          function doCancel() { window.FSV2.renderDetail(); }
          var confirmBtn = document.getElementById('btnRenameConfirm');
          var cancelBtn  = document.getElementById('btnRenameCancel');
          if (confirmBtn) confirmBtn.addEventListener('click', doSave);
          if (cancelBtn)  cancelBtn.addEventListener('click', doCancel);
          if (inp) inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doSave();
            if (e.key === 'Escape') doCancel();
          });
        });
      }
    }

    window.FSV2.renderDetailMappings();
    window.FSV2.renderDetailFormFields();
    window.FSV2.renderDetailSubmissions();

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function updateDetailTestStatus() { /* removed — test op integratieniveau vervangen door directe submit */ }

  async function handleRenameIntegration(name) {
    await window.FSV2.api('/integrations/' + S().activeId, {
      method: 'PUT',
      body: JSON.stringify({ name: name }),
    });
    window.FSV2.showAlert('Naam opgeslagen.', 'success');
    await window.FSV2.openDetail(S().activeId);
  }


  Object.assign(window.FSV2, {
    _loadFieldMeta: _loadFieldMeta,
    _saveFieldMeta: _saveFieldMeta,
    buildDetailFlatFields: buildDetailFlatFields,
    computeChainSuggestions: computeChainSuggestions,
    getPipelineOpen: getPipelineOpen,
    getTargetOrder: getTargetOrder,
    isChainSuggestionApplied: isChainSuggestionApplied,
    modelLabel: modelLabel,
    renderDetail: renderDetail,
    updateDetailTestStatus: updateDetailTestStatus
  });
})();
