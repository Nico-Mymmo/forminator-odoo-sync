      // Save button is now in #det-footer-{tid} (full-width footer below MappingTable)
﻿/**
 * Forminator Sync V2 &mdash; Detail
 *
 * Extends window.FSV2 with: renderDetail, updateDetailTestStatus,
 * renderDetailMappings, renderDetailSubmissions, renderDetailFormFields,
 * openDetail, and all handle* async action handlers.
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2),
 *               forminator-sync-v2-wizard.js (FSV2.renderStaticInput),
 *               field-picker-component.js (OpenVME.FieldPicker)
 */
(function () {
  'use strict';

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER: DETAIL VIEW
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ══════════════════════════════════════════════════════════════════════════
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
        if (children.length === 0) return;

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
            stepOrder:    getTargetOrder(prevT, prevIdx),
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
          stepOrder:    getTargetOrder(prevT, prevIdx),
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
        return getTargetOrder(a, 0) - getTargetOrder(b, 0);
      });
      var stepsHtml = '';
      if (sortedForHeader.length > 0) {
        stepsHtml = '<div class="flex flex-wrap items-center gap-1.5 mt-2">';
        sortedForHeader.forEach(function (t, i) {
          var cfg = window.FSV2.getModelCfg(t.odoo_model) || { label: t.odoo_model, badgeClass: 'badge-ghost' };
          if (i > 0) stepsHtml += '<i data-lucide="arrow-right" class="w-3 h-3 text-base-content/40 shrink-0"></i>';
          stepsHtml += '<span class="badge badge-sm ' + esc(cfg.badgeClass) + '">' + esc(cfg.label || t.odoo_model) + '</span>';
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
          handleToggleActive(e.target.checked).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
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
              renderDetail();
            }
          }
          function doCancel() { renderDetail(); }
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

    renderDetailMappings();
    renderDetailFormFields();
    renderDetailSubmissions();

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function updateDetailTestStatus() { /* removed — test op integratieniveau vervangen door directe submit */ }

  async function handleRenameIntegration(name) {
    await window.FSV2.api('/integrations/' + S().activeId, {
      method: 'PUT',
      body: JSON.stringify({ name: name }),
    });
    window.FSV2.showAlert('Naam opgeslagen.', 'success');
    await openDetail(S().activeId);
  }

  function renderDetailMappings() {
    var container = document.getElementById('detailMappingsContainer');
    if (!container) return;

    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    if (!targets.length) {
      var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
      container.innerHTML =
        '<div class="text-center py-8">' +
          '<p class="text-base-content/60 mb-4">Nog geen Odoo-schrijfdoel geconfigureerd voor deze integratie.</p>' +
          '<button type="button" class="btn btn-primary gap-2" data-action="open-add-target-dialog" data-integration-id="' + esc(integrationId) + '">' +
            '<i data-lucide="plus" class="w-4 h-4"></i> Odoo-doel toevoegen' +
          '</button>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: container });
      return;
    }

    var sortedTargets = [...targets].sort(function (a, b) {
      return getTargetOrder(a, 0) - getTargetOrder(b, 0);
    });

    if (!S().detail._extraRowsByTarget) S().detail._extraRowsByTarget = {};

    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    var pipelineOpen  = getPipelineOpen(integrationId);
    var isSingle      = sortedTargets.length === 1;

    var _ffr       = buildDetailFlatFields(S().detailFormFields);
    var flatFields = _ffr.flatFields;
    var rawFf      = _ffr.topLevel;    // gebruikt als topLevelFields in MappingTable.render

    // ── Build card HTML ──────────────────────────────────────────────────────
    var html = '';

    sortedTargets.forEach(function (target, idx) {
      var tid     = String(target.id);
      var isOpen  = !!pipelineOpen[tid];
      var isFirst = idx === 0;
      var isLast  = idx === sortedTargets.length - 1;

      // Connector between cards
      if (idx > 0) {
        html +=
          '<div class="flex flex-col items-center my-2 select-none" aria-hidden="true">' +
            '<div class="w-px h-5 bg-base-content/20"></div>' +
            '<i data-lucide="chevron-down" class="w-4 h-4 text-base-content/30"></i>' +
          '</div>';
      }

      var stepName   = target.label || modelLabel(target.odoo_model);
      var opLabels  = { upsert: 'Zoeken \u2014 bijwerken of aanmaken', update_only: 'Alleen bijwerken', create: 'Altijd nieuw aanmaken' };
      var opTypeLbl  = opLabels[target.operation_type] || opLabels.upsert;
      if (target.operation_type === 'chatter_message') {
        opTypeLbl = 'Notitie in chatter';
        if (!target.label) stepName = '\uD83D\uDCAC Notitie';
      }
      if (target.operation_type === 'create_activity') {
        opTypeLbl = 'Activiteit aanmaken';
        if (!target.label) stepName = '\uD83D\uDCC5 Activiteit';
      }
      var policyLbl  = POLICY_LABELS[target.update_policy] || esc(target.update_policy || '');
      var preceding  = sortedTargets.slice(0, idx);
      var suggestions = (isSingle || target.operation_type === 'chatter_message' || target.operation_type === 'create_activity') ? [] : computeChainSuggestions(target, preceding);

      // Chain dependency badges from saved state (prefer in-memory edits, fall back to DB state)
      var chainDeps = [];
      if (!isSingle) {
        var normalizeSv = function (sv) {
          var leg = String(sv || '').match(/^step_(\d+)_id$/);
          return leg ? 'step.' + leg[1] + '.record_id' : (sv || '');
        };
        var chainSourceRows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid])
          ? S().detail._extraRowsByTarget[tid].map(function (r) { return normalizeSv(r.staticValue); })
          : ((S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [])
              .filter(function (m) { return m.source_type === 'previous_step_output'; })
              .map(function (m) { return normalizeSv(m.source_value); });
        chainSourceRows.forEach(function (sourceVal) {
          var m = sourceVal.match(/^step\.([^.]+)\.record_id$/);
          if (!m) return;
          var ref = m[1]; var refN = Number(ref);
          var prevT = isNaN(refN)
            ? sortedTargets.find(function (t) { return t.label === ref; })
            : sortedTargets.find(function (t) { return getTargetOrder(t, 0) === refN; });
          if (prevT) {
            var pIdx = sortedTargets.indexOf(prevT);
            if (pIdx >= 0 && !chainDeps.find(function (d) { return d.stepNum === pIdx + 1; }))
              chainDeps.push({ stepNum: pIdx + 1, stepName: prevT.label || modelLabel(prevT.odoo_model) });
          }
        });
      }

       var _opIcons = {
        upsert:           'refresh-cw',
        update_only:      'pencil',
        create:           'plus-circle',
        chatter_message:  'message-circle',
        create_activity:  'calendar',
      };
      var _opIcon = _opIcons[target.operation_type] || 'refresh-cw';

     // ── Card ────────────────────────────────────────────────────────────
      // Ontbrekende verplichte velden — server-side warnings
      var _intWarnings = (S().integrationWarnings && S().integrationWarnings[String(S().activeId || '')]) || [];
      var _targetWarn  = _intWarnings.find(function(w) { return String(w.targetId) === tid; });
      var _stepMissingFields = _targetWarn ? (_targetWarn.missingLabels || []) : [];

      html += '<div class="card bg-base-100 border border-base-200 shadow-sm" data-mt-target-id="' + esc(tid) + '">';
      html +=   '<div class="card-body p-0">';

      // Header row
      html +=     '<div class="px-5 py-4">';
      html +=       '<div class="flex items-start justify-between gap-2">';

      // Left: badge + name + meta
      html +=         '<div class="flex items-start gap-3 min-w-0 flex-1">';
      if (!isSingle) {
        html +=           '<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral text-neutral-content text-sm font-bold shrink-0">' + (idx + 1) + '</span>';
      }
      var actionCfg  = window.FSV2.getModelCfg ? (window.FSV2.getModelCfg(target.odoo_model) || {}) : {};
      var _cardIcon  = actionCfg.icon || null;
      html +=           '<div class="min-w-0">';
      html +=             '<div class="flex items-center gap-2 font-bold text-base leading-snug">' +
                           (_cardIcon ? '<i data-lucide="' + esc(_cardIcon) + '" class="w-4 h-4 shrink-0 opacity-60"></i>' : '') +
                           esc(stepName) + '</div>';
      html +=             '<div class="flex flex-wrap items-center gap-x-2.5 gap-y-0 mt-0.5 text-xs text-base-content/50">';
      if (target.operation_type !== 'chatter_message') {
        html +=               '<span class="font-mono">' + esc(target.odoo_model) + '</span>';
        html +=               '<span>·</span>';
      }
      html +=               '<span>' + esc(opTypeLbl) + '</span>';
      if (_stepMissingFields.length) {
        html +=             '<span>·</span>' +
          '<span class="inline-flex items-center gap-1 text-warning font-medium"' +
          ' title="Ontbrekend: ' + esc(_stepMissingFields.join(', ')) + '">' +
          '<i data-lucide="alert-triangle" class="w-3 h-3"></i>' +
          _stepMissingFields.length + ' verplicht' + (_stepMissingFields.length === 1 ? ' veld ontbreekt' : 'e velden ontbreken') +
          '</span>';
      }

      html +=             '</div>';
      html +=           '</div>';
      html +=         '</div>';

      // Right: reorder + delete + expand toggle
      html +=         '<div class="flex items-center gap-0.5 shrink-0 ml-1">';
      if (!isSingle) {
        // Reorder: arrow-up/arrow-down (distinct from chevron expand)
        if (!isFirst) {
          html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0" title="Omhoog"' +
            ' data-action="reorder-target-up" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
            '<i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>';
        } else {
          html += '<div class="w-7"></div>';
        }
        if (!isLast) {
          html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0" title="Omlaag"' +
            ' data-action="reorder-target-down" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
            '<i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>';
        } else {
          html += '<div class="w-7"></div>';
        }
        html += '<div class="w-px h-4 bg-base-300 mx-1"></div>';
        // Delete step button
        html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0 text-error/50 hover:text-error hover:bg-error/10" title="Stap verwijderen"' +
          ' data-action="delete-target" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
          '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>';
        html += '<div class="w-px h-4 bg-base-300 mx-1"></div>';
      }
      // Status icons: filter (if condition set), chain (if coupled), optype
      if (target.condition_field) {
        html += '<span class="inline-flex items-center justify-center w-6 h-6 text-warning" title="Voorwaarde ingesteld">' +
                '<i data-lucide="filter" class="w-3.5 h-3.5"></i></span>';
      }
      if (chainDeps.length > 0) {
        html += '<span class="inline-flex items-center justify-center w-6 h-6 text-info" title="Gekoppeld aan vorige stap">' +
                '<i data-lucide="link-2" class="w-3.5 h-3.5"></i></span>';
      }
      html += '<span class="inline-flex items-center justify-center w-6 h-6 text-primary" title="' + esc(opTypeLbl) + '">' +
              '<i data-lucide="' + esc(_opIcon) + '" class="w-3.5 h-3.5"></i></span>';
      if (target.condition_field || chainDeps.length > 0) {
        html += '<div class="w-px h-4 bg-base-300 mx-1"></div>';
      }
      // Duplicate step button (always visible)
      html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0" title="Stap dupliceren"' +
        ' data-action="duplicate-target" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
        '<i data-lucide="copy" class="w-3.5 h-3.5"></i></button>';
      html += '<div class="w-px h-4 bg-base-300 mx-1"></div>';
      // Expand/collapse — pure chevron icon, no text label
      html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0" title="' + (isOpen ? 'Inklappen' : 'Uitklappen') + '"' +
        ' data-action="toggle-step-open" data-target-id="' + esc(tid) + '">' +
        '<i data-lucide="' + (isOpen ? 'chevron-up' : 'chevron-down') + '" class="w-4 h-4"></i>' +
        '</button>';
      html +=         '</div>'; // right

      html +=       '</div>'; // flex row

      // Suggestion banners (many2one chain auto-detect)
      suggestions.forEach(function (sug) {
        if (isChainSuggestionApplied(tid, sug.odooField)) return;
        html +=
          '<div class="mt-3 flex items-center gap-2 p-2.5 bg-info/10 rounded-lg border border-info/20 text-sm">' +
            '<i data-lucide="link-2" class="w-4 h-4 text-info shrink-0"></i>' +
            '<div class="flex-1 min-w-0">' +
              '<span class="font-medium">Koppeling mogelijk: </span>' +
              '<code class="text-xs bg-base-200 px-1 py-0.5 rounded">' + esc(sug.odooField) + '</code>' +
              ' <span class="text-base-content/60">\u2192 ' + esc(modelLabel(sug.relation)) + ' (Stap ' + esc(String(sug.stepNum)) + ')</span>' +
            '</div>' +
            '<button type="button" class="btn btn-info btn-xs shrink-0"' +
              ' data-action="apply-chain-suggestion"' +
              ' data-target-id="' + esc(tid) + '"' +
              ' data-odoo-field="' + esc(sug.odooField) + '"' +
              ' data-odoo-label="' + esc(sug.odooLabel) + '"' +
              ' data-step-order="' + esc(String(sug.stepOrder)) + '"' +
              ' data-step-label="' + esc(sug.stepLabel || String(sug.stepOrder)) + '">' +
              'Automatisch instellen' +
            '</button>' +
          '</div>';
      });

      html +=     '</div>'; // px-5 py-4

      // ── Gedragsbalk ─────────────────────────────────────────────────────────
      var _condSummary = target.condition_field
        ? 'Als ' + esc(target.condition_field) + ' = ' + esc(
            Array.isArray(target.condition_values) && target.condition_values.length
              ? target.condition_values.join(' / ') : '?')
        : 'Geen voorwaarde ingesteld';


      var _chainSummary = chainDeps.length > 0
        ? chainDeps.map(function (d) { return 'Gekoppeld aan Stap ' + d.stepNum + (d.stepName ? ' (' + esc(d.stepName) + ')' : ''); }).join(', ')
        : 'Niet gekoppeld';

      // Automatisch ingevuld — static rows uit DB (source_type='static')
      var _modelCfgAF = window.FSV2.getModelCfg ? window.FSV2.getModelCfg(target.odoo_model) : {};
      var _fixedNames = (Array.isArray(_modelCfgAF.fixed_fields) ? _modelCfgAF.fixed_fields : [])
        .map(function (f) { return typeof f === 'string' ? f : (f.name || ''); });
      var _staticMappings = ((S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [])
        .filter(function (m) {
          return m.source_type === 'static' && m.source_value != null && m.source_value !== ''
            && _fixedNames.includes(m.odoo_field);
        });
      var _autoFillHtml = _staticMappings.length > 0
        ? _staticMappings.map(function (m) {
            var odooLbl = esc(m.odoo_field);
            var val     = esc(String(m.source_value));
            return '<span class="inline-flex items-center gap-1 badge badge-ghost badge-sm font-normal">' +
              '<i data-lucide="lock" class="w-3 h-3 text-base-content/40"></i>' +
              '<span class="font-mono text-xs">' + odooLbl + '</span>' +
              '<span class="opacity-40">=</span>' +
              '<span class="text-xs">' + val + '</span>' +
            '</span>';
          }).join('')
        : '<span class="text-sm opacity-30 italic">Geen vaste waarden ingesteld</span>';

      html += '<div style="display:' + (isOpen ? '' : 'none') + ';">';

      // ── Gedragsbalk: drie callout-kaarten ───────────────────────────────────
      html += '<div class="border-t border-base-200 px-4 py-3 flex flex-col gap-2">';
      html += '<div class="flex items-center gap-2 mb-0.5">' +
                '<i data-lucide="settings-2" class="w-3.5 h-3.5 opacity-30"></i>' +
                '<span class="text-xs font-semibold uppercase tracking-wide opacity-30">Gedrag</span>' +
              '</div>';

      // Callout 1: Voorwaarde
      html += '<div class="border border-base-200 rounded-xl overflow-hidden">';
      html +=   '<div class="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-base-200/60 transition-colors select-none"' +
                  ' data-action="toggle-step-cond" data-target-id="' + esc(tid) + '">' +
                  '<i data-lucide="filter" class="w-3.5 h-3.5 shrink-0 text-warning"></i>' +
                  '<span class="text-xs font-medium w-36 shrink-0">Voorwaarde</span>' +
                  '<span class="text-xs flex-1 opacity-50">' + _condSummary + '</span>' +
                  '<i data-lucide="chevron-right" class="w-3.5 h-3.5 opacity-30 shrink-0 ml-auto"></i>' +
                '</div>' +
                '<div id="det-cond-' + esc(tid) + '" style="display:none;"></div>';
      html += '</div>';

      // Callout 2: Gedrag bij verwerking
      html += '<div class="border border-base-200 rounded-xl overflow-hidden">';
      html +=   '<div class="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-base-200/60 transition-colors select-none"' +
                  ' data-action="toggle-step-optype" data-target-id="' + esc(tid) + '">' +
                  '<i data-lucide="' + esc(_opIcon) + '" class="w-3.5 h-3.5 shrink-0 text-primary"></i>' +
                  '<span class="text-xs font-medium w-36 shrink-0">Gedrag bij verwerking</span>' +
                  '<span class="text-xs flex-1 opacity-50">' + esc(opTypeLbl) + '</span>' +
                  '<i data-lucide="chevron-right" class="w-3.5 h-3.5 opacity-30 shrink-0 ml-auto"></i>' +
                '</div>' +
                '<div id="det-optype-' + esc(tid) + '" style="display:none;"></div>';
      html += '</div>';

      // Callout 3: Koppeling vorige stap (only for non-first steps)
      if (!isFirst) {
        html += '<div class="border border-base-200 rounded-xl overflow-hidden">';
        html +=   '<div class="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-base-200/60 transition-colors select-none"' +
                    ' data-action="toggle-step-chain" data-target-id="' + esc(tid) + '">' +
                    '<i data-lucide="link-2" class="w-3.5 h-3.5 shrink-0 ' + (chainDeps.length ? 'text-info' : 'opacity-30') + '"></i>' +
                    '<span class="text-xs font-medium w-36 shrink-0">Koppeling vorige stap</span>' +
                    '<span class="text-xs flex-1 opacity-50">' + esc(_chainSummary) + '</span>' +
                    '<i data-lucide="chevron-right" class="w-3.5 h-3.5 opacity-30 shrink-0 ml-auto"></i>' +
                  '</div>' +
                  '<div id="det-callouts-' + esc(tid) + '" style="display:none;"></div>';
        html += '</div>';
      }

      html += '</div>'; // /Gedragsbalk

      // Automatisch ingevuld
      html += '<div class="border-t border-base-200 px-5 py-3">';
      html +=   '<div class="flex items-center gap-2 mb-2">' +
                  '<i data-lucide="lock" class="w-3.5 h-3.5 opacity-40"></i>' +
                  '<span class="text-xs font-semibold uppercase tracking-wide opacity-40">Automatisch ingevuld</span>' +
                '</div>';
      html +=   '<div class="flex flex-wrap gap-1.5">' + _autoFillHtml + '</div>';
      html += '</div>';

      // MappingTable renders its own 'Formuliervelden koppelen aan Odoo' header
      html += '<div id="det-mc-' + esc(tid) + '" class="border-t border-base-200 px-5 pb-5 pt-4"'
            + ' style="display:' + (isOpen ? '' : 'none') + ';">' + '</div>';

      // Footer with save button — full-width so divider spans the card
      html += '<div id="det-footer-' + esc(tid) + '"'
            + ' class="border-t border-base-200 flex items-center justify-end gap-3 px-5 py-3"'
            + ' style="display:' + (isOpen ? '' : 'none') + ';">';
      html +=   '<button type="button" class="btn btn-primary btn-sm gap-1.5"'
              + ' data-action="save-step-mappings" data-target-id="' + esc(tid) + '">'
              + '<i data-lucide="save" class="w-4 h-4"></i>'
              + (isSingle ? ' Koppelingen opslaan' : ' Stap ' + (idx + 1) + ' opslaan')
              + '</button>';
      html += '</div>'; // /footer

      html += '</div>'; // /isOpen wrapper

      html +=   '</div>'; // card-body
      html += '</div>'; // card
    });

    // Stap toevoegen — intent-picker dialog (Fase 1)
    if (integrationId) {
      html +=
        '<div class="flex flex-col items-center my-2 select-none" aria-hidden="true">' +
          '<div class="w-px h-5 bg-base-content/20"></div>' +
          '<i data-lucide="chevron-down" class="w-4 h-4 text-base-content/30"></i>' +
        '</div>' +
        '<div class="flex items-center justify-center gap-2">' +
          '<button type="button" class="btn btn-outline btn-sm gap-1.5"' +
            ' data-action="open-add-target-dialog"' +
            ' data-integration-id="' + esc(String(integrationId)) + '">' +
            '<i data-lucide="plus" class="w-4 h-4"></i> Stap toevoegen' +
          '</button>' +
        '</div>';
    }

    container.innerHTML = html;

    // ── Render MappingTable into each OPEN card ──────────────────────────────
    sortedTargets.forEach(function (target, idx) {
      var tid    = String(target.id);
      if (!pipelineOpen[tid]) return;

      var model      = target.odoo_model;
      var odooCache  = (S().odooFieldsCache || {})[model] || [];
      var odooLoaded = odooCache.length > 0;

      var targetMappings      = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
      var formMappingsByField = {};
      var initialExtraRows    = [];
      targetMappings.forEach(function (m) {
        if (m.source_type === 'form')   { formMappingsByField[m.source_value] = m; }
        else if (m.source_type !== 'static') { initialExtraRows.push(m); } // static = Automatisch ingevuld, niet in tabel
      });

      if (!S().detail._extraRowsByTarget[tid]) {
        S().detail._extraRowsByTarget[tid] = initialExtraRows.map(function (m) {
          var meta = odooCache.find(function (f) { return f.name === m.odoo_field; });
          // Normalize legacy source_value formats for previous_step_output
          var sv = m.source_value;
          if (m.source_type === 'previous_step_output') {
            // Old format: "step_N_id" → new format: "step.N.record_id"
            var legacyMatch = String(sv || '').match(/^step_(\d+)_id$/);
            if (legacyMatch) sv = 'step.' + legacyMatch[1] + '.record_id';
          }
          return {
            odooField:     m.odoo_field,
            odooLabel:     (meta && meta.label) || m.odoo_field,
            staticValue:   sv,
            sourceType:    m.source_type,
            isRequired:    !!m.is_required,
            isIdentifier:  m.source_type === 'previous_step_output' ? true : !!m.is_identifier,
            isUpdateField: m.is_update_field !== false,
          };
        });

      }

      // Inject ALL default_fields from model config — ALWAYS (idempotent: stamp existing, push missing).
      // Intentionally outside the init-guard: applyChainSuggestion pre-populates _extraRowsByTarget[tid]
      // before renderDetailMappings runs, so the guard is false and injection would be skipped otherwise.
      var modelCfgForReq = window.FSV2.getModelCfg(model);
      if (Array.isArray(modelCfgForReq.default_fields)) {
        // Fields in fixed_fields are auto-filled and must never appear in the table
        var _fixedNamesSet = {};
        (Array.isArray(modelCfgForReq.fixed_fields) ? modelCfgForReq.fixed_fields : []).forEach(function (f) {
          var n = typeof f === 'string' ? f : (f.name || ''); if (n) _fixedNamesSet[n] = true;
        });
        modelCfgForReq.default_fields.forEach(function (df) {
          if (_fixedNamesSet[df.name]) return;  // skip — auto-filled, not user-editable
          var sourceMode = df.source_mode || 'both';
          var isReq      = !!df.required;
          var meta       = odooCache.find(function (f) { return f.name === df.name; });
          // If already in _extraRowsByTarget (chain row, or from DB), stamp it and don't push a duplicate
          var existing = S().detail._extraRowsByTarget[tid].find(function (r) { return r.odooField === df.name; });
          if (existing) {
            existing.isDefault  = true;
            existing.isRequired = isReq;
            existing.sourceMode = sourceMode;
            return;
          }
          // Otherwise push (includes form-mapped fields — MappingTable pre-populates col1 from existingForm)
          // Pre-populate staticValue from existing DB mapping (static or template) so col2 shows the saved value
          var _dbm = targetMappings.find(function (m) {
            return m.odoo_field === df.name && (m.source_type === 'static' || m.source_type === 'template');
          });
          S().detail._extraRowsByTarget[tid].push({
            odooField:     df.name,
            odooLabel:     (meta && meta.label) || df.label || df.name,
            staticValue:   _dbm ? (_dbm.source_value || '') : '',
            sourceType:    _dbm ? _dbm.source_type : 'template',
            isRequired:    isReq,
            isDefault:     true,
            isIdentifier:  false,
            isUpdateField: df.is_update_field !== false,
            sourceMode:    sourceMode,
          });
        });
      }

      var precedingSteps = sortedTargets.slice(0, idx).map(function (t) {
        return { order: getTargetOrder(t, 0), label: t.label || '' };
      });
      var stepBadge = sortedTargets.length >= 2 ? (idx + 1) : 0;

      // Fields already mapped as 'form' source in OTHER targets (not this one)
      var alreadyMappedInOtherSteps = [];
      sortedTargets.forEach(function (otherT, otherIdx) {
        if (otherIdx === idx) return;
        var otherMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[otherT.id]) || [];
        otherMappings.forEach(function (m) {
          if (m.source_type === 'form' && !alreadyMappedInOtherSteps.includes(m.source_value)) {
            alreadyMappedInOtherSteps.push(m.source_value);
          }
        });
      });

      // chatter_message: render composer instead of MappingTable
      if (target.operation_type === 'chatter_message') {
        renderChatterComposer(target, tid, sortedTargets);
        renderStepConditionSection(target, tid, flatFields);
        return;
      }
      // create_activity: render activity composer instead of MappingTable
      if (target.operation_type === 'create_activity') {
        renderActivityComposer(target, tid, sortedTargets);
        renderStepConditionSection(target, tid, flatFields);
        renderActivityLinkCallout(target, tid, sortedTargets);
        return;
      }

      var _cfgIdent = window.FSV2.getModelCfg ? window.FSV2.getModelCfg(model) : {};
      var cfgIdentFields = Array.isArray(_cfgIdent.identifier_fields)
        ? _cfgIdent.identifier_fields.map(function (f) {
            var fname = typeof f === 'string' ? f : (f.name || '');
            var oc    = odooCache.find(function (c) { return c.name === fname; });
            return { name: fname, label: (oc && oc.label) || (typeof f === 'object' && f.label) || fname };
          })
        : [];
      var cfgActiveIdField = cfgIdentFields.length === 1 ? cfgIdentFields[0].name : '';

      window.FSV2.MappingTable.render('det-mc-' + tid, {
        flatFields:           flatFields,
        topLevelFields:       rawFf,
        odooCache:            odooCache,
        odooLoaded:           odooLoaded,
        odooModel:            model,
        existingFormMappings: Object.values(formMappingsByField),
        identifierFields:     cfgIdentFields,
        activeIdentifierField: cfgActiveIdField,
        hiddenOdooFields:     (window.FSV2.getModelCfg ? window.FSV2.getModelCfg(model).hidden_odoo_fields : []) || [],
        extraRows:            S().detail._extraRowsByTarget[tid],
        selectClass:          'detail-ff-select',
        idCheckClass:         'detail-ff-id-check',
        updCheckClass:        'detail-ff-upd-check',
        namePrefix:           'det-ff-' + tid + '-',
        checkPrefix:          'det-' + tid + '-',
        extraRowPrefix:       'det-extra-' + tid + '-',
        extraInputPrefix:     'det-inp-',
        extraIdCheckClass:    'detail-extra-id-check',
        extraUpdCheckClass:   'detail-extra-upd-check',
        addAction:            'detail-add-extra-row',
        removeAction:         'detail-remove-extra-row',
        fspId:                'det-extra-' + tid + '-add',
        extraValueWrapId:     'detExtraStaticWrap-' + tid,
        extraValueInputId:    'detExtraStaticValue-' + tid,
        extraIsIdentifierId:  'detExtraIsIdentifier-' + tid,
        extraIsUpdateFieldId: 'detExtraIsUpdateField-' + tid,
        operationType: target.operation_type || 'upsert',
        opTypeRadioName:      'det-optype-radio-' + tid,
        alreadyMappedInOtherSteps: alreadyMappedInOtherSteps,
        saveAction:           null,   // per-step save button injected below
        targetId:             tid,
        precedingSteps:       precedingSteps,
        stepBadge:            stepBadge,
        chainFspId:           'det-chain-' + tid + '-add',
        chainStepSelectId:    'detChainStepSelect-' + tid,
        chainIsRequiredId:    'detChainIsRequired-' + tid,
        addChainAction:       'detail-add-chain-row',
      });

         // Save button is now in #det-footer-{tid} (full-width footer)

      renderStepConditionSection(target, tid, flatFields);
      renderStepOpTypeSection(target, tid, flatFields);
      renderStepChainSection(target, tid, sortedTargets, idx);
    });

    // Populate section editors for ALL targets (open or not)
    // so clicking a gedragsbalk row reveals a pre-filled editor
    sortedTargets.forEach(function (target, idx) {
      var tid = String(target.id);
      renderStepConditionSection(target, tid, flatFields);
      renderStepOpTypeSection(target, tid, flatFields);
      renderStepChainSection(target, tid, sortedTargets, idx);
    });

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: container });
  }


  // ────────────────────────────────────────────────────────────────────────────
  // GEDRAGSBALK SECTION RENDERERS
  // ────────────────────────────────────────────────────────────────────────────

  function renderStepOpTypeSection(target, tid, flatFields) {
    var el = document.getElementById('det-optype-' + tid);
    if (!el) return;
    var currentOpType = target.operation_type || 'upsert';
    if (currentOpType === 'chatter_message' || currentOpType === 'create_activity') return;

    var odooCache = (S().odooFieldsCache || {})[target.odoo_model] || [];
    var dbMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
    var inMemRows  = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid]) || [];
    var identSet   = {};
    dbMappings.forEach(function (m) {
      if (m.source_type === 'form' && m.is_identifier && m.odoo_field) {
        var oc = odooCache.find(function (f) { return f.name === m.odoo_field; });
        identSet[m.odoo_field] = (oc && oc.label) || m.odoo_field;
      }
    });
    inMemRows.forEach(function (r) {
      if (r.isIdentifier && r.sourceType === 'form' && r.odooField) {
        var oc = odooCache.find(function (f) { return f.name === r.odooField; });
        identSet[r.odooField] = (oc && oc.label) || r.odooLabel || r.odooField;
      }
    });
    // Also add identifier_fields from model config (so callout shows even before any mapping is saved)
    var _mcIdent = window.FSV2.getModelCfg ? window.FSV2.getModelCfg(target.odoo_model) : {};
    if (Array.isArray(_mcIdent.identifier_fields)) {
      _mcIdent.identifier_fields.forEach(function (f) {
        var fname = typeof f === 'string' ? f : (f.name || '');
        if (fname && !identSet[fname]) {
          var oc = odooCache.find(function (c) { return c.name === fname; });
          identSet[fname] = (oc && oc.label) || (typeof f === 'object' && f.label) || fname;
        }
      });
    }
    var identFields = Object.keys(identSet).map(function (k) { return { name: k, label: identSet[k] }; });

    // Detect active chain link for this step — if present, the identifier is auto-set by the chain
    var chainRow = inMemRows.find(function (r) { return r.sourceType === 'previous_step_output'; });
    if (!chainRow) {
      var chainDbMapping = dbMappings.find(function (m) { return m.source_type === 'previous_step_output'; });
      if (chainDbMapping) {
        var _ocChain = odooCache.find(function (f) { return f.name === chainDbMapping.odoo_field; });
        chainRow = { odooField: chainDbMapping.odoo_field, odooLabel: (_ocChain && _ocChain.label) || chainDbMapping.odoo_field };
      }
    }

    var _opIcons = { upsert: 'git-merge', update_only: 'pencil', create: 'plus-circle' };
    var options = [
      { value: 'upsert',      icon: 'git-merge',  label: 'Zoeken + bijwerken of aanmaken' },
      { value: 'update_only', icon: 'pencil',      label: 'Alleen bijwerken'               },
      { value: 'create',      icon: 'plus-circle', label: 'Altijd nieuw aanmaken'          },
    ];

    var html = '<div class="px-3.5 py-2.5 border-t border-base-200 bg-base-200/30">';
    html += '<div class="flex flex-col gap-0.5">';
    options.forEach(function (o) {
      var checked = currentOpType === o.value;
      html += '<label class="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg border ' +
              (checked ? 'border-primary/20 bg-primary/5' : 'border-transparent hover:bg-base-100') + '">' +
              '<input type="radio" class="radio radio-xs radio-primary shrink-0"' +
              ' name="det-optype-radio-' + esc(tid) + '" value="' + esc(o.value) + '"' + (checked ? ' checked' : '') + '>' +
              '<span class="text-xs font-medium ' + (checked ? '' : 'opacity-60') + '">' + esc(o.label) + '</span>' +
              '</label>';
    });
    html += '</div>';
    // Zoekcriterium: auto via chain link takes priority; otherwise show configured identifier fields
    var chainLabel = chainRow ? (chainRow.odooLabel || chainRow.odooField) : '';
    if (chainRow) {
      html += '<div class="mt-2 pt-2 border-t border-base-200 flex items-center gap-2 px-1">';
      html += '<i data-lucide="link-2" class="w-3.5 h-3.5 text-info opacity-70 shrink-0"></i>';
      html += '<span class="text-xs opacity-50 shrink-0">Zoekcriterium:</span>';
      html += '<span class="text-xs font-medium">' + esc(chainLabel) + '</span>';
      html += '<span class="text-xs opacity-40 ml-auto italic">automatisch via koppeling</span>';
      html += '</div>';
    } else if (identFields.length > 0) {
      html += '<div class="mt-2 pt-2 border-t border-base-200 flex items-center gap-2 px-1">';
      html += '<i data-lucide="key" class="w-3.5 h-3.5 opacity-40 shrink-0"></i>';
      html += '<span class="text-xs opacity-50 shrink-0">Zoekcriterium:</span>';
      if (identFields.length === 1) {
        html += '<span class="text-xs font-medium">' + esc(identFields[0].label) + '</span>';
      } else {
        html += '<select class="select select-xs select-bordered flex-1" data-action="set-step-identifier" data-target-id="' + esc(tid) + '">';
        identFields.forEach(function (f) {
          html += '<option value="' + esc(f.name) + '">' + esc(f.label) + '</option>';
        });
        html += '</select>';
      }
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });
  }

  function renderStepChainSection(target, tid, sortedTargets, myIdx) {
    var el = document.getElementById('det-callouts-' + tid);
    if (!el) return;
    if (myIdx <= 0) return;

    var preceding   = sortedTargets.slice(0, myIdx);
    var suggestions = computeChainSuggestions(target, preceding);
    var html = '<div class="px-3.5 py-2.5 border-t border-base-200 bg-base-200/30">';

    if (!suggestions.length) {
      html += '<p class="text-xs opacity-40 italic py-1">Geen koppelingsopties beschikbaar.</p>';
    } else {
      suggestions.forEach(function (s) {
        var applied   = isChainSuggestionApplied(tid, s.odooField);
        var prevT     = sortedTargets.find(function (t) { return String(t.id) === String(s.prevTargetId); });
        var prevModel = prevT ? modelLabel(prevT.odoo_model) : (s.stepLabel || ('Stap ' + s.stepNum));
        var prevNum   = s.stepNum;
        html += '<div class="flex items-center gap-2 py-1">';
        html += '<i data-lucide="' + (applied ? 'link-2' : 'unlink') + '" class="w-3.5 h-3.5 shrink-0 ' + (applied ? 'text-info' : 'opacity-30') + '"></i>';
        html += '<span class="text-xs flex-1">Koppel <span class="font-medium">' + esc(s.odooLabel) + '</span> ' +
                (applied ? '→' : 'aan ID van') +
                ' <span class="font-medium">' + esc(prevModel) + '</span> (Stap ' + prevNum + ')</span>';
        if (applied) {
          html += '<button type="button" class="btn btn-xs btn-ghost text-error/70 hover:text-error gap-1"' +
                  ' data-action="remove-chain-link" data-target-id="' + esc(tid) + '" data-odoo-field="' + esc(s.odooField) + '">' +
                  '<i data-lucide="x" class="w-3 h-3"></i> Ontkoppelen</button>';
        } else {
          html += '<button type="button" class="btn btn-xs btn-outline btn-primary gap-1"' +
                  ' data-action="apply-chain-suggestion" data-target-id="' + esc(tid) + '"' +
                  ' data-odoo-field="' + esc(s.odooField) + '" data-odoo-label="' + esc(s.odooLabel) + '"' +
                  ' data-step-order="' + esc(String(s.stepOrder)) + '" data-step-label="' + esc(s.stepLabel || '') + '">' +
                  '<i data-lucide="link-2" class="w-3 h-3"></i> Koppelen</button>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
    el.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });
  }

  function removeChainLink(tid, odooField) {
    if (!S().detail._extraRowsByTarget || !S().detail._extraRowsByTarget[tid]) return;
    S().detail._extraRowsByTarget[tid] = S().detail._extraRowsByTarget[tid].filter(function (r) {
      return !(r.odooField === odooField && r.sourceType === 'previous_step_output');
    });
    renderDetailMappings();
    window.FSV2.showAlert('Koppeling verwijderd. Sla de stap op om te bevestigen.', 'info');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ACTIVITY LINK CALLOUT — "Koppeling vorige stap" voor activiteit-stappen
  // ────────────────────────────────────────────────────────────────────────────

  function renderActivityLinkCallout(target, tid, sortedTargets) {
    var calloutsEl = document.getElementById('det-callouts-' + tid);
    if (!calloutsEl) return;

    var myIdx = sortedTargets.findIndex(function (t) { return String(t.id) === tid; });
    var compatibleSteps = sortedTargets.filter(function (t, idx) {
      return idx < myIdx && t.operation_type !== 'chatter_message' && t.operation_type !== 'create_activity';
    });
    if (!compatibleSteps.length) return;

    var currentResIdSource = target.activity_res_id_source || '';
    var currentStepOrder   = null;
    var srcMatch = currentResIdSource.match(/^step\.([^.]+)\.record_id$/);
    if (srcMatch) currentStepOrder = srcMatch[1];

    var linkedLabel = 'Niet gekoppeld';
    if (currentStepOrder !== null) {
      var linkedT = compatibleSteps.find(function (t) { return String(getTargetOrder(t, 0)) === String(currentStepOrder); });
      if (linkedT) linkedLabel = linkedT.label || modelLabel(linkedT.odoo_model);
    }

    var opts = compatibleSteps.map(function (t) {
      var order = getTargetOrder(t, 0);
      var lbl   = t.label || modelLabel(t.odoo_model);
      var sel   = (currentStepOrder !== null && String(currentStepOrder) === String(order)) ? ' selected' : '';
      return '<option value="' + esc(String(order)) + '"' + sel + '>' + esc(lbl) + ' (stap ' + (order + 1) + ')</option>';
    }).join('');

    var div = document.createElement('div');
    div.innerHTML =
      '<details class="w-full rounded-xl border border-base-300 bg-base-200/40 mt-3">' +
        '<summary class="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer rounded-xl select-none list-none">' +
          '<i data-lucide="link-2" class="w-3.5 h-3.5 text-info shrink-0"></i>' +
          '<span class="text-xs font-semibold text-base-content/70">Koppeling vorige stap</span>' +
          '<span class="text-xs ml-1 text-base-content/40">' + esc(linkedLabel) + '</span>' +
          '<i data-lucide="chevron-right" class="w-3.5 h-3.5 ml-auto details-chevron text-base-content/40 shrink-0"></i>' +
        '</summary>' +
        '<div class="px-3 pb-3 pt-2 border-t border-base-300">' +
          '<div class="form-control">' +
            '<label class="label pb-1"><span class="label-text text-xs font-medium">Koppel aan stap</span></label>' +
            '<select class="select select-xs select-bordered" id="activityStepSelect-' + esc(tid) + '">' +
              opts +
            '</select>' +
            '<label class="label pt-1"><span class="label-text-alt text-base-content/50 text-xs">Record-ID van deze stap wordt als activiteitsontvanger gebruikt.</span></label>' +
          '</div>' +
        '</div>' +
      '</details>';
    calloutsEl.appendChild(div.firstElementChild);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: calloutsEl });

    // Herlaad activity-types bij stap-wissel
    var actStepSel = document.getElementById('activityStepSelect-' + tid);
    if (actStepSel) {
      actStepSel.addEventListener('change', function () {
        var selOrder = actStepSel.value;
        var newStep  = compatibleSteps.find(function (t) { return String(getTargetOrder(t, 0)) === String(selOrder); });
        var newModel = newStep ? newStep.odoo_model : null;
        var typesSel = document.getElementById('activityTypeSelect-' + tid);
        if (typesSel) typesSel.innerHTML = '<option value="">Laden\u2026</option>';
        var url = '/activity-types' + (newModel ? '?model=' + encodeURIComponent(newModel) : '');
        window.FSV2.api(url).then(function (res) {
          if (!typesSel) return;
          typesSel.innerHTML = '<option value="">\u2014 Geen type \u2014</option>' +
            (res.data || []).map(function (t) {
              return '<option value="' + esc(String(t.id)) + '">' + esc(t.name) + '</option>';
            }).join('');
        }).catch(function () {});
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CONDITION CONFIGURATOR — visible at the top of each open step card
  // ────────────────────────────────────────────────────────────────────────────

  // Builds the HTML for the values area based on field type, value_map, and choices.
  // Returns raw HTML string (checkboxes when options available, text input otherwise).
  function getOrderedValueMapKeys(transform) {
    var valueMap = transform && transform.value_map && typeof transform.value_map === 'object'
      ? transform.value_map
      : null;
    if (!valueMap) return [];

    var fromMap = Object.keys(valueMap).filter(function (k) { return k !== '__catchall__'; });
    var stored = Array.isArray(transform.value_map_order) ? transform.value_map_order : [];
    if (!stored.length) return fromMap;

    var used = {};
    var ordered = [];
    stored.forEach(function (k) {
      var key = String(k || '').trim();
      if (!key || used[key]) return;
      if (!Object.prototype.hasOwnProperty.call(valueMap, key) || key === '__catchall__') return;
      used[key] = true;
      ordered.push(key);
    });
    fromMap.forEach(function (k) {
      if (used[k]) return;
      ordered.push(k);
    });
    return ordered;
  }

  function buildCondValuesHtml(tid, fieldId, flatFields, fieldTransforms, condValues) {
    if (!fieldId) {
      return '<p class="text-xs text-base-content/40 italic py-1">Geen voorwaarde ingesteld — stap wordt altijd uitgevoerd.</p>';
    }
    var ff = (flatFields || []).find(function (f) { return f.field_id === String(fieldId); });
    var ft = (fieldTransforms || {})[String(fieldId)];
    var selectedSet = (condValues || []).map(function (v) { return String(v).trim().toLowerCase(); });

    function isChecked(val) { return selectedSet.indexOf(String(val).trim().toLowerCase()) >= 0; }
    function cbxRow(val, label) {
      return '<label class="flex items-center gap-2 cursor-pointer py-0.5">' +
        '<input type="checkbox" class="checkbox checkbox-xs checkbox-warning"' +
          ' name="stepCondCbx-' + esc(tid) + '"' +
          ' value="' + esc(String(val)) + '"' +
          (isChecked(val) ? ' checked' : '') + '>' +
        '<span class="text-sm">' + esc(String(label)) + '</span>' +
      '</label>';
    }

    var optHtml = '';
    var hint    = '';

    // Priority 1: value_map keys (from field transforms / waardemap)
    var vmapKeys = getOrderedValueMapKeys(ft);
    if (vmapKeys && vmapKeys.length > 0) {
      optHtml = '<div class="flex flex-wrap gap-x-6 gap-y-0">' +
        vmapKeys.map(function (k) { return cbxRow(k, k); }).join('') +
        '</div>';
      hint = 'Waarden overgenomen uit waardemap';

    } else {
      // Priority 2: choices from field definition
      var choices = ff && Array.isArray(ff.choices) ? ff.choices : null;
      if (choices && choices.length > 0) {
        optHtml = '<div class="flex flex-wrap gap-x-6 gap-y-0">' +
          choices.map(function (c) {
            var val = (c && typeof c.value !== 'undefined') ? String(c.value) : String(c);
            var lbl = (c && typeof c.label !== 'undefined') ? String(c.label) : val;
            return cbxRow(val, lbl);
          }).join('') +
          '</div>';
        hint = 'Keuzes uit formulierveld';

      } else {
        // Priority 3: boolean/checkbox type
        var ftype = (ff && ff.type) ? String(ff.type).toLowerCase() : '';
        if (ftype === 'checkbox' || ftype === 'bool' || ftype === 'boolean' || ftype === 'toggle') {
          optHtml = '<div class="flex flex-wrap gap-x-6 gap-y-0">' +
            cbxRow('1', 'Aangevinkt / Ja (1)') +
            cbxRow('0', 'Niet aangevinkt / Nee (0)') +
            '</div>';
          hint = 'Boolean veld';

        } else {
          // Default: free-text comma-separated input
          optHtml = '<input id="stepCondValues-' + esc(tid) + '" type="text"' +
            ' class="input input-bordered input-xs w-72"' +
            ' placeholder="bijv. ja, yes, 1 (kommagescheiden)"' +
            ' value="' + esc((condValues || []).join(', ')) + '">';
        }
      }
    }

    return optHtml +
      (hint ? '<p class="text-xs text-base-content/40 mt-1 italic">' + esc(hint) + '</p>' : '');
  }

  function renderStepConditionSection(target, tid, flatFields) {
    var condEl = document.getElementById('det-cond-' + tid);
    if (!condEl) return;

    var condVals      = Array.isArray(target.condition_values) ? target.condition_values : [];
    var currentField  = target.condition_field || '';
    var fieldTransforms = S().fieldTransforms || {};

    var fieldOpts = '<option value="">' + esc('\u2014 Geen voorwaarde \u2014') + '</option>';
    (flatFields || []).forEach(function (ff) {
      var fid = String(ff.field_id || '');
      var lbl = ff.label || fid;
      var sel = fid === currentField ? ' selected' : '';
      fieldOpts += '<option value="' + esc(fid) + '"' + sel + '>' + esc(lbl) + '</option>';
    });

    var valuesHtml = buildCondValuesHtml(tid, currentField, flatFields, fieldTransforms, condVals);

    condEl.innerHTML =
      '<div class="px-4 py-3 border-t border-base-200">' +
        '<div class="flex flex-col gap-2">' +
          '<div class="flex flex-col gap-2 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<span class="text-xs text-base-content/60">Voer deze stap alleen uit als veld</span>' +
              '<select id="stepCondField-' + esc(tid) + '" class="select select-bordered select-xs"' +
                ' data-change-action="cond-field-changed" data-target-id="' + esc(tid) + '">' +
                fieldOpts +
              '</select>' +
              (currentField ? '<span class="text-xs text-base-content/60">gelijk is aan:</span>' : '') +
            '</div>' +
            '<div id="stepCondValuesArea-' + esc(tid) + '">' +
              valuesHtml +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<button type="button" class="btn btn-xs btn-warning gap-1"' +
                ' data-action="save-step-condition" data-target-id="' + esc(tid) + '">' +
                '<i data-lucide="save" class="w-3.5 h-3.5"></i> Voorwaarde opslaan' +
              '</button>' +
              (currentField ?
                '<button type="button" class="btn btn-xs btn-ghost text-base-content/40 gap-1"' +
                  ' data-action="clear-step-condition" data-target-id="' + esc(tid) + '">' +
                  '<i data-lucide="x" class="w-3 h-3"></i> Wissen' +
                '</button>'
              : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: condEl });
  }

  function handleCondFieldChanged(tid, fieldId) {
    var area = document.getElementById('stepCondValuesArea-' + tid);
    if (!area) return;
    var flatFields = buildDetailFlatFields(S().detailFormFields).flatFields;
    var fieldTransforms = S().fieldTransforms || {};
    area.innerHTML = buildCondValuesHtml(tid, fieldId || '', flatFields, fieldTransforms, []);
    // Show/hide the "gelijk is aan" label dynamically
    var lbl = area.previousElementSibling;
    if (lbl) {
      var gelijkSpan = lbl.querySelector('span:last-child');
      if (gelijkSpan) gelijkSpan.style.display = fieldId ? '' : 'none';
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: area });
  }

  async function handleSaveStepCondition(tid) {
    var target = S().detail && S().detail.targets && S().detail.targets.find(function (t) { return String(t.id) === String(tid); });
    if (!target) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (!integrationId) { window.FSV2.showAlert('Integratie niet gevonden.', 'error'); return; }

    var fieldSel  = document.getElementById('stepCondField-' + tid);
    var condField = fieldSel ? (fieldSel.value || null) : null;

    // Read checked checkboxes if available, otherwise fall back to text input
    var condValues;
    var cbxInputs = document.querySelectorAll('[name="stepCondCbx-' + tid + '"]');
    if (cbxInputs.length > 0) {
      condValues = Array.from(cbxInputs)
        .filter(function (cb) { return cb.checked; })
        .map(function (cb) { return cb.value; });
    } else {
      var textInput = document.getElementById('stepCondValues-' + tid);
      var raw = textInput ? textInput.value : '';
      condValues = raw.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    }

    // Validate: field geselecteerd maar geen waarden → stop en waarschuw
    if (condField && !condValues.length) {
      window.FSV2.showAlert('Selecteer minimaal één toegestane waarde voor de voorwaarde, of kies "— Geen voorwaarde —" om te wissen.', 'warning');
      return;
    }

    await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
      method: 'PUT',
      body: JSON.stringify(Object.assign({}, target, {
        condition_field:  condField,
        condition_values: condValues.length ? condValues : null,
      })),
    });
    window.FSV2.showAlert('Voorwaarde opgeslagen.', 'success');
    await window.FSV2.openDetail(integrationId);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER: SUBMISSIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderDetailSubmissions() {
    var el = document.getElementById('detailHistory');
    if (!el) return;

    if (!S().submissions || S().submissions.length === 0) {
      el.innerHTML = '<p class="text-sm text-base-content/60 py-4">Nog geen indieningen.</p>';
      return;
    }

    var deleteUnlocked = !!S()._deleteUnlocked;
    var integId = String(S().activeId || '');

    // ── Toolbar ──────────────────────────────────────────────────────────
    var toolbar =
      '<div class="flex flex-wrap items-center gap-2 mb-3">' +
        '<button class="btn btn-xs btn-ghost gap-1' + (deleteUnlocked ? ' btn-warning text-warning-content' : '') + '"' +
          ' data-action="toggle-delete-unlock" title="' + (deleteUnlocked ? 'Vergrendel verwijderen' : 'Schakel verwijderen in') + '">' +
          '<i data-lucide="' + (deleteUnlocked ? 'lock-open' : 'lock') + '" class="w-3.5 h-3.5"></i>' +
          (deleteUnlocked ? 'Vergrendelen' : 'Ontgrendelen') +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="cleanup-replays" title="Verwijder mislukte pogingen die later geslaagd zijn via replay">' +
          '<i data-lucide="sparkles" class="w-3.5 h-3.5"></i>Replay opkuis' +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1 ml-auto" data-action="refresh-submissions" title="Indieningen verversen">' +
          '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>Verversen' +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="open-import-modal" title="Bulk invoer openen">' +
          '<i data-lucide="upload" class="w-3.5 h-3.5"></i>Importeren' +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="open-export-modal" title="Exporteer indieningen">' +
          '<i data-lucide="download" class="w-3.5 h-3.5"></i>Exporteren' +
        '</button>' +
      '</div>';
    var fieldMeta    = S()._fieldMeta || {};
    var allFormFields = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var listFieldIds = Object.keys(fieldMeta).filter(function (k) { return fieldMeta[k] && fieldMeta[k].show_in_list && !fieldMeta[k].hidden; });
    // Deduplicate columns by label — if the form was renamed, old and new field_ids may share
    // the same alias/label. Merge into one column so both old and new submissions show data.
    var listColumnsMap = {};
    listFieldIds.forEach(function (fid) {
      var ff    = allFormFields.find(function (f) { return String(f.field_id || '') === fid; });
      var label = fieldMeta[fid].alias || (ff && ff.label) || fid;
      if (!listColumnsMap[label]) { listColumnsMap[label] = { fids: [], label: label }; }
      listColumnsMap[label].fids.push(fid);
    });
    var listColumns = Object.values(listColumnsMap);
    var targets = (S().detail && S().detail.targets) || [];

    function normalizeKey(k) { return String(k || '').toLowerCase().replace(/[-_\s]+/g, '_'); }
    function lookupPayloadValue(payload, sourceValue) {
      if (!payload || !sourceValue) return '';
      var normSource = normalizeKey(sourceValue);
      var keys = Object.keys(payload);
      if (payload[sourceValue] !== undefined && payload[sourceValue] !== '') return String(payload[sourceValue]);
      var match = keys.find(function (k) { return normalizeKey(k) === normSource && payload[k]; });
      if (match) return String(payload[match]);
      var prefix = keys.find(function (k) { return normalizeKey(k).startsWith(normSource + '_') && payload[k]; });
      if (prefix) return String(payload[prefix]);
      return '';
    }
    function parsePayload(sub) {
      var raw = sub.source_payload;
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(raw); } catch (e) { return {}; }
    }
    function listColumnValue(sub, col) {
      var payload = parsePayload(sub);
      // col can be { fids, label } (new) or a bare fid string (safety)
      var fids = (col && col.fids) ? col.fids : [col];
      var val  = '';
      for (var fi = 0; fi < fids.length; fi++) {
        val = lookupPayloadValue(payload, fids[fi]);
        if (val) break;
      }
      return val
        ? '<span class="font-medium">' + esc(String(val).slice(0, 80)) + '</span>'
        : '<span class="text-base-content/30">&mdash;</span>';
    }

    var statusBadge = function (status) {
      var classes = {
        success: 'badge-success', processed: 'badge-success',
        partial_failed: 'badge-warning', retry_scheduled: 'badge-warning',
        permanent_failed: 'badge-error', retry_exhausted: 'badge-error',
        running: 'badge-info', retry_running: 'badge-info',
        duplicate_ignored: 'badge-neutral', duplicate_inflight: 'badge-neutral',
      };
      return '<span class="badge badge-sm ' + (classes[status] || 'badge-ghost') + '">' + esc(status || '-') + '</span>';
    };

    var originals = S().submissions.filter(function (s) { return !s.replay_of_submission_id; });
    var replays   = S().submissions.filter(function (s) { return !!s.replay_of_submission_id; });
    var replaysByOrigId = {};
    replays.forEach(function (r) {
      if (!replaysByOrigId[r.replay_of_submission_id]) replaysByOrigId[r.replay_of_submission_id] = [];
      replaysByOrigId[r.replay_of_submission_id].push(r);
    });
    var ordered   = [];
    originals.forEach(function (orig) {
      ordered.push({ sub: orig, isReplay: false });
      replays.filter(function (r) { return r.replay_of_submission_id === orig.id; })
        .forEach(function (r) { ordered.push({ sub: r, isReplay: true }); });
    });
    replays.filter(function (r) { return !originals.find(function (o) { return o.id === r.replay_of_submission_id; }); })
      .forEach(function (r) { ordered.push({ sub: r, isReplay: true }); });

    // (showIndiener removed — listColumns drives the dynamic columns)

    // Builds the expandable timeline row for a submission.
    var skipLabels = {
      pipeline_abort:                 'Overgeslagen \u2014 eerdere stap mislukt',
      dependency_missing:             'Overgeslagen \u2014 vereiste uitvoer ontbreekt',
      retry_skip_already_successful:  'Niet opnieuw uitgevoerd (replay)',
      condition_not_met:              'Stap overgeslagen (conditie niet voldaan)',
    };
    var actionColors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error', posted: 'badge-success' };
    var actionLabels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt', posted: '\uD83D\uDCAC notitie geplaatst' };
    var colCount = 5 + listColumns.length;

    function buildTimelineRow(sub) {
      var shortId = window.FSV2.shortId(sub.id);
      var ctx;
      // resolved_context can arrive as a JSONB object (Supabase) or serialized JSON string.
      var rc = sub.resolved_context;
      try { ctx = (rc && typeof rc === 'object') ? rc : JSON.parse(rc || '{}'); } catch (e2) { ctx = {}; }
      var actions  = ctx.target_actions || [];
      var payload  = parsePayload(sub);
      var pKeys    = Object.keys(payload).filter(function (k) { return payload[k] && k !== 'nonce'; }).slice(0, 5);
      var payloadHtml = pKeys.length
        ? '<div class="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-xs text-base-content/60">' +
            pKeys.map(function (k) {
              return '<span><span class="font-mono text-base-content/30">' + esc(k) + ':</span> ' + esc(String(payload[k]).slice(0, 60)) + '</span>';
            }).join('') +
          '</div>'
        : '';
      var isReplaySub = !!sub.replay_of_submission_id;
      var isFailed    = ['permanent_failed', 'retry_exhausted', 'partial_failed'].includes(String(sub.status || ''));

      // Prefer target_actions from context; fall back to reconstructing from targets list + flat step.N.* keys.
      var stepsToShow = actions;
      if (!stepsToShow.length && targets.length) {
        var sortedT = targets.slice().sort(function (a, b) {
          var ao = a.execution_order != null ? a.execution_order : (a.order_index != null ? a.order_index : 0);
          var bo = b.execution_order != null ? b.execution_order : (b.order_index != null ? b.order_index : 0);
          return ao - bo;
        });
        stepsToShow = sortedT.map(function (t) {
          var order = t.execution_order != null ? t.execution_order : (t.order_index != null ? t.order_index : 0);
          return {
            model:           t.odoo_model,
            label:           t.label || null,
            execution_order: order,
            action:          ctx['step.' + order + '.action'] || null,
            record_id:       ctx['step.' + order + '.record_id'] || null,
            skipped_reason:  null,
            error_detail:    null
          };
        });
      }

      // If every step is missing an action, don't show phantom "niet uitgevoerd" rows
      // for success submissions — just note no details were stored.
      var allActionsNull = stepsToShow.length > 0 && stepsToShow.every(function (a) { return !a.action; });
      if (allActionsNull && !isFailed) {
        stepsToShow = [];
      }

      var timelineHtml = stepsToShow.length
        ? stepsToShow.map(function (a) {
            var sl              = (a.skipped_reason && skipLabels[a.skipped_reason]) || '';
            var isReplaySkip    = a.skipped_reason === 'retry_skip_already_successful';
            var isConditionSkip = a.skipped_reason === 'condition_not_met';
            var stepNum         = a.execution_order != null ? (Number(a.execution_order) + 1) : null;
            var stepLabel       = isConditionSkip
              ? 'overgeslagen (conditie)'
              : (isReplaySub && (a.action === 'created' || a.action === 'updated'))
                ? 'Geslaagd bij replay'
                : (a.action ? (actionLabels[a.action] || esc(a.action)) : '<span class="italic opacity-50">niet uitgevoerd</span>');
            var stepColor       = isConditionSkip
              ? 'badge-warning'
              : (a.action ? (actionColors[a.action] || 'badge-ghost') : 'badge-neutral');
            return '<div class="flex flex-wrap items-start gap-1.5 text-xs py-1.5 border-b border-base-100/50 last:border-0">' +
              (stepNum != null ? '<span class="badge badge-outline badge-xs font-mono w-5 text-center shrink-0 mt-0.5">' + esc(String(stepNum)) + '</span>' : '') +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<div class="flex flex-wrap items-center gap-1.5">' +
                  (a.label ? '<span class="font-medium">' + esc(a.label) + '</span>' : '') +
                  '<span class="font-mono text-base-content/40">' + esc(a.model || '-') + '</span>' +
                  '<span class="badge badge-xs ' + stepColor + '">' + stepLabel + '</span>' +
                  (a.record_id ? '<span class="font-mono text-base-content/30">#' + esc(String(a.record_id)) + '</span>' : '') +
                  (sl && !isConditionSkip ? '<span class="text-xs ' + (isReplaySkip ? 'text-base-content/30 italic' : 'text-warning') + '">' + esc(sl) + '</span>' : '') +
                '</div>' +
                (isConditionSkip && a.error_detail
                  ? '<div class="mt-1 flex items-start gap-1.5 p-1.5 rounded bg-warning/10 border border-warning/20 text-warning/90 font-mono break-all">' +
                      '<i data-lucide="filter" class="w-3 h-3 shrink-0 mt-0.5"></i>' +
                      '<span>' + esc(a.error_detail) + '</span>' +
                    '</div>'
                  : (a.error_detail ? '<span class="text-error/70 font-mono break-all">' + esc(a.error_detail) + '</span>' : '')) +
              '</div>' +
            '</div>';
          }).join('')
        : '<span class="text-xs text-base-content/40 italic">Geen stapdetails beschikbaar.</span>';

      var errorHtml = (isFailed && sub.last_error)
        ? '<div class="mt-2 p-2 rounded bg-error/10 border border-error/20 text-xs text-error font-mono break-all">' +
            '<span class="font-semibold mr-1">Fout:</span>' + esc(sub.last_error) +
          '</div>'
        : '';

      function safeJsonPretty(raw) {
        try {
          var obj = (raw && typeof raw === 'object') ? raw : JSON.parse(raw || '{}');
          return JSON.stringify(obj, null, 2);
        } catch (e_) { return String(raw || ''); }
      }
      var payloadDetailHtml =
        '<div class="mt-3 space-y-2">' +
          '<details>' +
            '<summary class="text-xs font-semibold cursor-pointer select-none text-base-content/60 hover:text-base-content py-1">' +
              '&#x25B6; Inkomende payload</summary>' +
            '<pre class="text-xs font-mono bg-base-300 rounded p-2 mt-1 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
              esc(safeJsonPretty(sub.source_payload)) + '</pre>' +
          '</details>' +
          '<details>' +
            '<summary class="text-xs font-semibold cursor-pointer select-none text-base-content/60 hover:text-base-content py-1">' +
              '&#x25B6; Verwerkte context (uitgaand naar Odoo)</summary>' +
            '<pre class="text-xs font-mono bg-base-300 rounded p-2 mt-1 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
              esc(safeJsonPretty(sub.resolved_context)) + '</pre>' +
          '</details>' +
        '</div>';

      return '<tr class="sub-timeline-row" id="stl-' + esc(shortId) + '" style="display:none">' +
        '<td colspan="' + colCount + '" class="bg-base-200/40 px-4 py-3">' + payloadHtml + timelineHtml + errorHtml + payloadDetailHtml + '</td>' +
        '</tr>';
    }

    function actionBadge(sub) {
      try {
        var ctx     = JSON.parse(sub.resolved_context || '{}');
        var actions = ctx.target_actions || [];
        if (!actions.length) return '';
        var labels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt' };
        var colors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error' };
        return actions.map(function (a) {
          return '<span class="badge badge-xs ' + (colors[a.action] || 'badge-ghost') + ' ml-1">' + (labels[a.action] || esc(a.action)) + '</span>';
        }).join('');
      } catch (e) { return ''; }
    }

    el.innerHTML =
      toolbar +
      '<div class="overflow-x-auto">' +
        '<table class="table table-xs">' +
          '<thead><tr><th>ID</th>' + listColumns.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th>Status</th><th>Fout</th><th>Aangemaakt</th><th class="sticky right-0 bg-base-100 z-10">Actie</th></tr></thead>' +
          '<tbody>' +
          ordered.map(function (item) {
            var sub         = item.sub;
            var isReplay    = item.isReplay;
            var shortId     = window.FSV2.shortId(sub.id);
            var successfulReplay = !isReplay && (replaysByOrigId[sub.id] || []).some(function (r) {
              return ['success', 'processed'].includes(String(r.status || ''));
            });
            var replayAllowed = !isReplay && !successfulReplay && ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(sub.status || ''));
            // Force-replay: allow replaying any submission (incl. success) when delete is unlocked.
            // Useful to retroactively fix submissions that were processed with broken mappings.
            var forceReplayAllowed = deleteUnlocked && !replayAllowed && ['success', 'processed', 'partial_failed'].includes(String(sub.status || ''));
            var errorCell   = sub.last_error
              ? '<span class="text-xs text-error/80 font-mono" title="' + esc(sub.last_error) + '">' +
                  esc(sub.last_error.slice(0, 40)) + (sub.last_error.length > 40 ? '\u2026' : '') +
                '</span>'
              : '<span class="text-base-content/30">&mdash;</span>';
            var mainRow =
              '<tr class="sub-row cursor-pointer' + (isReplay ? ' bg-success/5' : '') + '" data-sub-id="' + esc(shortId) + '">' +
                '<td class="font-mono text-xs">' +
                  (isReplay ? '<span class="badge badge-xs badge-accent mr-1">\u21b3 Replay</span>' : '') +
                  esc(shortId) +
                '</td>' +
                listColumns.map(function (c) { return '<td class="text-xs">' + listColumnValue(sub, c) + '</td>'; }).join('') +
                '<td>' + statusBadge(sub.status) +
                  (successfulReplay ? '<span class="badge badge-xs badge-success ml-1">✓ opgelost via replay</span>' : '') +
                  actionBadge(sub) + '</td>' +
                '<td class="max-w-[10rem] truncate overflow-hidden">' + errorCell + '</td>' +
                '<td class="text-xs whitespace-nowrap">' + esc(window.FSV2.fmt(sub.created_at)) + '</td>' +
                '<td class="sticky right-0 bg-base-100">' + (replayAllowed
                  ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '">Replay</button>'
                  : '') +
                  (forceReplayAllowed
                    ? '<button class="btn btn-xs btn-outline btn-warning" data-action="replay-submission" data-id="' + esc(sub.id) + '" title="Opnieuw verwerken (forceren)"><i data-lucide="refresh-cw" class="w-3 h-3 mr-1"></i>Herverwerk</button>'
                    : '') +
                  (deleteUnlocked
                    ? '<button class="btn btn-xs btn-ghost btn-square text-error ml-1" data-action="delete-submission" data-id="' + esc(sub.id) + '" title="Verwijder indienen"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
                    : '') +
                '</td>' +
              '</tr>';
            return mainRow + buildTimelineRow(sub);
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    // Click delegation: toggle timeline row on row click (skip clicks on action buttons).
    el.querySelectorAll('.sub-row').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('button, a')) return;
        var timeline = document.getElementById('stl-' + tr.dataset.subId);
        if (timeline) timeline.style.display = (timeline.style.display === 'none' ? '' : 'none');
      });
    });  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER: FORM FIELDS TAB
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function renderDetailFormFields() {
    var el = document.getElementById('detailFormFields');
    if (!el) return;

    if (S().detailFormFields === null || S().detailFormFields === 'loading') {
      el.innerHTML = '<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">' +
        '<span class="loading loading-spinner loading-xs"></span> Formuliervelden worden opgehaald\u2026</div>';
      return;
    }

    var mappedLookup = {};
    var targets = (S().detail && S().detail.targets) || [];
    targets.forEach(function (t) {
      var mappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[t.id]) || [];
      mappings.forEach(function (m) {
        if (m.source_type === 'form') {
          var key = String(m.source_value);
          if (!mappedLookup[key]) mappedLookup[key] = [];
          mappedLookup[key].push(m.odoo_field);
        }
      });
    });

    var fields     = S().detailFormFields;
    var fieldMeta  = S()._fieldMeta  || {};
    var showHidden = S()._showHiddenFields || false;

    if (!fields.length) {
      var integration = S().detail && S().detail.integration;
      var isWebhook = integration && integration.source_type === 'generic_webhook';
      if (isWebhook) {
        el.innerHTML = '<div class="alert alert-info text-sm">' +
          '<i data-lucide="info" class="w-4 h-4 shrink-0"></i>' +
          '<span>Nog geen payload ontvangen. Stuur een test naar de webhook URL en klik daarna \u201cVerversen\u201d om de veldnamen automatisch te herkennen.</span>' +
          '</div>';
      } else {
        el.innerHTML = '<p class="text-sm text-base-content/60 py-2">Geen velden gevonden voor dit formulier. Klik \u201cVerversen\u201d in de sectieheader om opnieuw te laden.</p>';
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }
    // ── Submission preview helper ─────────────────────────────────────────────
    var submissions    = S().submissions || [];
    var previewIdx     = S()._previewSubmissionIdx != null ? S()._previewSubmissionIdx : 0;
    if (previewIdx >= submissions.length) previewIdx = 0;
    var previewSub     = submissions[previewIdx] || null;
    var previewPayload = {};
    if (previewSub) {
      var rawP = previewSub.source_payload;
      if (rawP && typeof rawP === 'object') previewPayload = rawP;
      else if (rawP) { try { previewPayload = JSON.parse(rawP); } catch (e) {} }
    }
    function normalizeKeyLocal(k) { return String(k || '').toLowerCase().replace(/[-_\s]+/g, '_'); }
    function getPreviewValue(fid) {
      if (!fid) return '';
      var norm = normalizeKeyLocal(fid);
      var keys = Object.keys(previewPayload);
      if (previewPayload[fid] !== undefined && previewPayload[fid] !== null && previewPayload[fid] !== '') return String(previewPayload[fid]);
      var m = keys.find(function (k) { return normalizeKeyLocal(k) === norm && previewPayload[k] != null && previewPayload[k] !== ''; });
      if (m) return String(previewPayload[m]);
      var p = keys.find(function (k) { return normalizeKeyLocal(k).startsWith(norm + '_') && previewPayload[k] != null && previewPayload[k] !== ''; });
      if (p) return String(previewPayload[p]);
      return '';
    }

    var TYPE_OPTIONS = [
      ['text',      'Tekst'],
      ['boolean',   'Boolean'],
      ['integer',   'Integer'],
      ['float',     'Decimaal'],
      ['selection', 'Selectie (waardemap)'],
      ['many2one',  'Many2one'],
      ['datetime',  'Datum/tijd'],
      ['date',      'Datum'],
    ];
    var integId        = esc(String(S().activeId || ''));
    var openFid        = S()._openFieldConfigPanel || null;
    var editingNameFid = S()._editingNameField     || null;
    var pendingRows    = S()._pendingValueMapRows  || [];
    var pendingCatchall = S()._pendingCatchall !== undefined ? S()._pendingCatchall : '';

    // ── Toolbar ───────────────────────────────────────────────────────────────
    var hiddenCount = fields.filter(function (f) {
      return !!(fieldMeta[String(f.field_id || '')] && fieldMeta[String(f.field_id || '')].hidden);
    }).length;

    var hiddenToggleHtml = (hiddenCount > 0 || showHidden)
      ? '<button class="btn btn-xs btn-ghost gap-1" data-action="toggle-show-hidden">' +
          '<i data-lucide="' + (showHidden ? 'eye-off' : 'eye') + '" class="w-3 h-3"></i>' +
          esc(showHidden ? 'Verbergen (' + hiddenCount + ')' : 'Toon verborgen (' + hiddenCount + ')') +
        '</button>'
      : '';

    var subSwitcherHtml = submissions.length > 0
      ? '<div class="flex items-center gap-1 opacity-60 text-xs">' +
          '<i data-lucide="receipt-text" class="w-3 h-3 shrink-0"></i>' +
          '<span class="hidden sm:inline">Voorbeeld uit inzending</span>' +
          '<button class="btn btn-ghost btn-xs btn-square" data-action="preview-sub-prev">' +
            '<i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>' +
          '</button>' +
          '<span class="font-mono tabular-nums">' + esc(String(previewIdx + 1)) + '/' + esc(String(submissions.length)) + '</span>' +
          '<button class="btn btn-ghost btn-xs btn-square" data-action="preview-sub-next">' +
            '<i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>' +
          '</button>' +
        '</div>'
      : '';

    var toolbarHtml =
      '<div class="flex items-center justify-between mb-2">' +
        '<div>' + hiddenToggleHtml + '</div>' +
        '<div>' + subSwitcherHtml + '</div>' +
      '</div>';

    var fieldsToShow = showHidden
      ? fields
      : fields.filter(function (f) {
          var fid = String(f.field_id || '');
          return !(fieldMeta[fid] && fieldMeta[fid].hidden);
        });

    // ── List items ────────────────────────────────────────────────────────────
    var itemsHtml = fieldsToShow.map(function (f) {
      var fid         = String(f.field_id || '');
      var rawLabel    = f.label && f.label !== fid ? f.label : null;
      var meta        = fieldMeta[fid] || {};
      var alias       = meta.alias || '';
      var hidden      = !!meta.hidden;
      var showInList  = !!meta.show_in_list;
      var showInBulk  = meta.bulk_import_show !== false;
      var bulkDefault = meta.bulk_import_default != null ? String(meta.bulk_import_default) : '';
      if (!bulkDefault && S().detail && S().detail.integration) {
        if (fid === 'form_id'   && S().detail.integration.forminator_form_id) bulkDefault = String(S().detail.integration.forminator_form_id);
        if (fid === 'form_name' && S().detail.integration.name)               bulkDefault = String(S().detail.integration.name);
      }
      var coupled       = mappedLookup[fid];
      var ft            = (S().fieldTransforms && S().fieldTransforms[fid]) || null;
      var currentType   = ft ? (ft.field_type || 'text') : 'text';
      var isOpen        = openFid === fid;
      var isEditingName = editingNameFid === fid;
      var displayName   = alias || rawLabel || fid;
      var showFieldId   = displayName !== fid;
      var previewVal    = getPreviewValue(fid);
      var hasVmap       = currentType === 'selection' || currentType === 'many2one';

      // ── Name block ──────────────────────────────────────────────────────────
      var nameBlockHtml;
      if (isEditingName) {
        nameBlockHtml =
          '<div class="flex items-center gap-1 min-w-0 flex-1" onclick="event.stopPropagation()">' +
            '<input id="inline-alias-' + esc(fid) + '" type="text" ' +
              'class="input input-xs input-bordered font-mono w-36" ' +
              'value="' + esc(alias) + '" placeholder="' + esc(rawLabel || fid) + '" maxlength="60" ' +
              'onkeydown="if(event.key===\'Enter\'){event.preventDefault();' +
                'document.querySelector(\'[data-action=save-inline-name][data-field-id=\\\'' + esc(fid) + '\\\']\').click();}' +
                'if(event.key===\'Escape\'){event.preventDefault();' +
                'document.querySelector(\'[data-action=cancel-inline-name][data-field-id=\\\'' + esc(fid) + '\\\']\').click();}">' +
            '<button class="btn btn-success btn-xs btn-square shrink-0" data-action="save-inline-name" data-field-id="' + esc(fid) + '">' +
              '<i data-lucide="check" class="w-3 h-3"></i>' +
            '</button>' +
            '<button class="btn btn-ghost btn-xs btn-square shrink-0" data-action="cancel-inline-name" data-field-id="' + esc(fid) + '">' +
              '<i data-lucide="x" class="w-3 h-3"></i>' +
            '</button>' +
          '</div>';
      } else {
        nameBlockHtml =
          '<div class="flex items-center gap-1.5 min-w-0 flex-1">' +
            (coupled && coupled.length ? '<i data-lucide="link" class="w-3 h-3 shrink-0 text-success"></i>' : '') +
            '<span class="font-semibold text-sm truncate ' + (hidden ? 'opacity-30' : '') + '">' + esc(displayName) + '</span>' +
            '<button class="btn btn-ghost btn-xs btn-square shrink-0 opacity-30 hover:opacity-80" ' +
              'data-action="start-edit-name" data-field-id="' + esc(fid) + '" title="Alias aanpassen" onclick="event.stopPropagation()">' +
              '<i data-lucide="pencil" class="w-3 h-3"></i>' +
            '</button>' +
            (showFieldId ? '<span class="font-mono text-xs opacity-35 shrink-0">' + esc(fid) + '</span>' : '') +
          '</div>';
      }

      // ── Summary row ─────────────────────────────────────────────────────────
      var summaryRow =
        '<div class="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-base-200 transition-colors" data-action="toggle-field-panel" data-field-id="' + esc(fid) + '">' +
          '<i data-lucide="' + (isOpen ? 'chevron-down' : 'chevron-right') + '" class="w-3.5 h-3.5 shrink-0 opacity-30"></i>' +
          nameBlockHtml +
          // Preview value (flex-1 middle)
          (isEditingName ? '' :
            '<div class="flex-1 min-w-0 px-2">' +
              (previewVal
                ? '<span class="text-xs opacity-50 truncate block">' + esc(previewVal) + '</span>'
                : '<span class="text-xs opacity-20 block">—</span>') +
            '</div>') +
          // Type + action buttons (right, no propagation)
          '<div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">' +
            '<select class="select select-xs w-36" data-action="save-field-transform" data-field-id="' + esc(fid) + '" data-integration-id="' + integId + '">' +
              TYPE_OPTIONS.map(function (opt) {
                return '<option value="' + opt[0] + '"' + (currentType === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
              }).join('') +
            '</select>' +
            '<button class="btn btn-xs ' + (hidden ? 'btn-warning' : 'btn-ghost') + ' gap-1" data-action="toggle-field-hidden" data-field-id="' + esc(fid) + '">' +
              '<i data-lucide="' + (hidden ? 'eye-off' : 'eye') + '" class="w-3 h-3"></i>Verberg' +
            '</button>' +
            '<button class="btn btn-xs ' + (showInList ? 'btn-info' : 'btn-ghost') + ' gap-1" data-action="toggle-field-show-in-list" data-field-id="' + esc(fid) + '">' +
              '<i data-lucide="table-2" class="w-3 h-3"></i>Lijst' +
            '</button>' +
            '<button class="btn btn-xs ' + (showInBulk ? 'btn-success' : 'btn-ghost') + ' gap-1" data-action="toggle-bulk-import-show" data-field-id="' + esc(fid) + '">' +
              '<i data-lucide="upload" class="w-3 h-3"></i>Bulk' +
            '</button>' +
          '</div>' +
        '</div>';

      if (!isOpen) {
        return '<div class="border-b border-base-200 last:border-b-0">' + summaryRow + '</div>';
      }

      // ── Expanded detail panel ───────────────────────────────────────────────
      // Waardemap (always visible for selection/many2one)
      var vmapHtml = '';
      if (hasVmap) {
        if (pendingRows.length === 0) pendingRows = [{ from: '', to: '' }];
        var rowsHtml = pendingRows.map(function (row, ri) {
              return '<div class="flex items-center gap-2 mb-1.5">' +
                '<input class="input input-sm input-bordered font-mono flex-1" placeholder="Bronwaarde" value="' + esc(row.from || '') + '" data-vmap-from="' + ri + '">' +
                '<i data-lucide="arrow-right" class="w-4 h-4 shrink-0 opacity-30"></i>' +
                '<input class="input input-sm input-bordered font-mono flex-1" placeholder="Odoo-waarde" value="' + esc(row.to || '') + '" data-vmap-to="' + ri + '">' +
                '<div class="flex gap-0.5">' +
                  '<button class="btn btn-xs btn-ghost btn-square" data-action="move-valuemap-row-up" data-row-idx="' + ri + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                  '<button class="btn btn-xs btn-ghost btn-square" data-action="move-valuemap-row-down" data-row-idx="' + ri + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                  '<button class="btn btn-xs btn-ghost btn-square text-error" data-action="remove-valuemap-row" data-row-idx="' + ri + '"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>' +
                '</div>' +
              '</div>';
            }).join('');

        vmapHtml =
          '<div class="mb-5">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<span class="text-xs font-semibold opacity-40 uppercase tracking-wide">Waardemap</span>' +
              '<span class="text-xs opacity-30">Bronwaarde → Odoo-waarde</span>' +
            '</div>' +
            rowsHtml +
            '<button class="btn btn-ghost btn-xs gap-1 px-0 text-xs" data-action="add-valuemap-row">' +
              '<i data-lucide="plus" class="w-3.5 h-3.5"></i> Rij toevoegen' +
            '</button>' +
            '<div class="flex items-center gap-3 mt-3 opacity-60">' +
              '<span class="text-xs shrink-0">Anders (onbekend)</span>' +
              '<i data-lucide="arrow-right" class="w-4 h-4 shrink-0 opacity-40"></i>' +
              '<input class="input input-sm input-bordered font-mono flex-1" placeholder="Leeg = niet omzetten" value="' + esc(pendingCatchall) + '" data-vmap-catchall>' +
            '</div>' +
          '</div>';
      }

      // Standaardwaarde (only when bulk is on)
      var bulkHtml = showInBulk
        ? '<div class="mb-5">' +
            '<div class="flex items-center justify-between mb-2">' +
              '<span class="text-xs font-semibold opacity-40 uppercase tracking-wide">Standaardwaarde</span>' +
              '<span class="text-xs opacity-30">Vooringevuld in bulkimport</span>' +
            '</div>' +
            '<input type="text" id="bulk-inp-' + esc(fid) + '" class="input input-sm input-bordered w-full font-mono" placeholder="Leeg = geen standaard…" value="' + esc(bulkDefault) + '">' +
          '</div>'
        : '';

      // Gekoppeld aan Odoo
      var coupledHtml =
        '<div class="mb-5">' +
          '<div class="text-xs font-semibold opacity-40 uppercase tracking-wide mb-2">Gekoppeld aan Odoo</div>' +
          (coupled && coupled.length
            ? '<div class="flex flex-wrap gap-1">' + coupled.map(function (of_) {
                return '<span class="badge badge-success badge-sm font-mono">' + esc(of_) + '</span>';
              }).join('') + '</div>'
            : '<span class="text-sm opacity-30 italic">Nog niet gekoppeld via veldkoppelingen</span>') +
        '</div>';

      // Alias input (hidden in panel — controlled via inline pencil)
      var aliasHiddenHtml =
        '<input type="hidden" id="alias-inp-' + esc(fid) + '" value="' + esc(alias) + '">';

      var detailPanel =
        '<div class="border-t border-base-200 px-5 py-4">' +
          aliasHiddenHtml +
          vmapHtml +
          bulkHtml +
          coupledHtml +
          '<div class="flex justify-end pt-2">' +
            '<button class="btn btn-primary btn-sm gap-2" data-action="save-field-panel" data-field-id="' + esc(fid) + '" data-has-bulk="' + (showInBulk ? '1' : '0') + '" data-has-vmap="' + (hasVmap ? '1' : '0') + '">' +
              '<i data-lucide="save" class="w-4 h-4"></i> Opslaan' +
            '</button>' +
          '</div>' +
        '</div>';

      return '<div class="border-b border-base-200 last:border-b-0">' + summaryRow + detailPanel + '</div>';

    }).join('');

    // ── Assemble ──────────────────────────────────────────────────────────────
    el.innerHTML =
      toolbarHtml +
      '<div class="rounded-box border border-base-200 bg-base-100 overflow-hidden">' +
        itemsHtml +
      '</div>';

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });
  }




  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DETAIL ACTIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      S()._fieldMeta        = _loadFieldMeta(id);  // reads from integration.field_meta
      S()._showHiddenFields = false;
      // Laad warnings (fire-and-forget) — nodig voor step card badges
      window.FSV2.api('/integrations/warnings').then(function (wb) {
        S().integrationWarnings = wb.data || {};
        if (S().activeId === id) renderDetailMappings();
      }).catch(function () {});

      window.FSV2.api('/integrations/' + id + '/field-transforms').then(function (r) {
        S().fieldTransforms = {};
        (r.data || []).forEach(function (t) { S().fieldTransforms[t.field_name] = t; });
        if (S().activeId === id) renderDetailFormFields();
      }).catch(function () {});

      if (!S().webhookConfig) {
        window.FSV2.api('/webhook-config').then(function (r) {
          S().webhookConfig = r.data || null;
          if (S().activeId === id) renderDetail();
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
          if (S().activeId === id) renderDetail();
        }).catch(function () {});
        // Extract form fields from the source_payload of the most recent submission
        extractGenericWebhookFields();
      } else if (detailFormId) {
        fetchDetailFormFields(detailSiteKey || null, detailFormId).catch(function () {});
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
            renderDetailMappings();
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          });
        }
      });
      renderDetail();
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
      await openDetail(S().activeId);
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
    updateDetailTestStatus();
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
    await openDetail(S().activeId);
  }

  async function handleDeleteMapping(mappingId) {
    await window.FSV2.api('/mappings/' + mappingId, { method: 'DELETE' });
    window.FSV2.showAlert('Veldkoppeling verwijderd.', 'success');
    await openDetail(S().activeId);
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

    var _ffr       = buildDetailFlatFields(S().detailFormFields);
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
    await openDetail(S().activeId);
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
      return Math.max(max, getTargetOrder(t, 0));
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
    await openDetail(S().activeId);
  }

  // ── Fase 1: Model-kaarten in #addTargetObjectCards ──────────────────────────
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
    ];

    var modelCards = models.map(function (m) {
      var isActive = sel === (m.odoo_model || m.name);
      var icon     = m.icon || 'box';
      var label    = m.label || m.odoo_model || m.name;
      var modelId  = m.name;
      return '<button type="button"' +
        ' class="btn btn-outline w-full justify-start gap-3' + (isActive ? ' btn-primary' : '') + '"' +
        ' data-action="select-target-object" data-object-id="' + esc(modelId) + '">' +
        '<i data-lucide="' + esc(icon) + '" class="w-5 h-5 shrink-0"></i>' +
        '<span class="text-left font-semibold">' + esc(label) + '</span>' +
        '</button>';
    }).join('');

    var specialCards = SPECIAL.map(function (s) {
      var isActive = sel === s.id;
      return '<button type="button"' +
        ' class="btn btn-outline w-full justify-start gap-3' + (isActive ? ' btn-primary' : '') + '"' +
        ' data-action="select-target-object" data-object-id="' + esc(s.id) + '">' +
        '<i data-lucide="' + esc(s.icon) + '" class="w-5 h-5 shrink-0"></i>' +
        '<span class="text-left"><span class="font-semibold">' + esc(s.label) + '</span>' +
          '<span class="block text-xs font-normal opacity-70">' + esc(s.desc) + '</span></span>' +
        '</button>';
    }).join('');

    container.innerHTML = modelCards + (models.length ? '<div class="divider my-1"></div>' : '') + specialCards;

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ context: container });
    }
  }

  // ── Fase 2: Operatie-kaarten in #addTargetOpCards ───────────────────────────
  function renderAddTargetStep2() {
    var container = document.getElementById('addTargetOpCards');
    if (!container) return;
    var dlg = document.getElementById('addTargetDialog');
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

  // ── Fase 1: Handle confirmed "Stap toevoegen" from intent-picker ───────────
  async function handleAddTargetWithType(integrationId, objectId, opType) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var maxOrder = targets.reduce(function (max, t) {
      return Math.max(max, getTargetOrder(t, 0));
    }, 0);

    if (objectId === 'create_activity') {
      var actCompatibles = targets.filter(function (t) {
        return t.operation_type !== 'chatter_message' && t.operation_type !== 'create_activity' && t.odoo_model;
      }).sort(function (a, b) { return getTargetOrder(a, 0) - getTargetOrder(b, 0); });

      if (!actCompatibles.length) {
        window.FSV2.showAlert('Voeg eerst een stap toe die een record aanmaakt voordat je een activiteit-stap kunt koppelen.', 'error');
        return;
      }

      var actParent     = actCompatibles[0];
      var actParentOrd  = getTargetOrder(actParent, 0);
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
      await openDetail(S().activeId);
      if (actNewId) {
        var poAct = getPipelineOpen(integrationId);
        poAct[String(actNewId)] = true;
        renderDetailMappings();
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
      return;
    }

    if (objectId === 'chatter_message') {
      // Find the first compatible preceding target (non-chatter, has a model)
      var compatibles = targets.filter(function (t) {
        return t.operation_type !== 'chatter_message' && t.odoo_model;
      }).sort(function (a, b) { return getTargetOrder(a, 0) - getTargetOrder(b, 0); });

      if (!compatibles.length) {
        window.FSV2.showAlert('Voeg eerst een schrijfdoel (upsert/aanmaken/bijwerken) toe voordat je een chatter-stap kunt koppelen.', 'error');
        return;
      }

      var parentTarget = compatibles[0];
      var parentOrder  = getTargetOrder(parentTarget, 0);
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
      await openDetail(S().activeId);
      // Open the new chatter card automatically
      if (chatterTargetId) {
        var po = getPipelineOpen(integId);
        po[String(chatterTargetId)] = true;
        renderDetailMappings();
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
    await openDetail(S().activeId);
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
      var flatFields = (buildDetailFlatFields(S().detailFormFields || []).flatFields || []);
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
    var flatFields = (buildDetailFlatFields(S().detailFormFields || []).flatFields || []);
    flatFields.forEach(function (f) { if (f.field_id) sampleForm[f.field_id] = _makeSampleValue(f); });

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

  async function handleSaveStepMappings(tid) {
    var mcEl = document.getElementById('det-mc-' + tid);
    if (!mcEl) { window.FSV2.showAlert('Editor niet gevonden.', 'error'); return; }

    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var target  = targets.find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }

    // ─ Persist operation_type if the radio is present in the DOM ───────────────────
    var opRadioEl  = document.querySelector('input[name="det-optype-radio-' + tid + '"]:checked');
    var newOpType  = opRadioEl ? opRadioEl.value : (target.operation_type || 'upsert');
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (integrationId) {
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify({
          odoo_model:      target.odoo_model,
          identifier_type: target.identifier_type || 'mapped_fields',
          update_policy:   target.update_policy   || 'always_overwrite',
          operation_type:  newOpType,
          execution_order: target.execution_order,
          order_index:     Number(target.order_index || 0),
        }),
      });
    }

    var _ffr       = buildDetailFlatFields(S().detailFormFields);
    var flatFields = _ffr.flatFields;

    var newMappings = [];
    var orderIdx    = 0;

    // ── Read mappings from MappingTable DOM (data-map-row rows) ─────────────
    // MappingTable uses data-map-col="1" (form field), data-map-col="2" (static value),
    // data-map-col="3" (Odoo field select), data-odoo-field (fixed Odoo field for required rows).
    mcEl.querySelectorAll('[data-map-row]').forEach(function (tr) {
      var rowType      = tr.dataset.rowType || 'free';
      var fixedOdoo    = tr.dataset.odooField || '';
      var col1         = tr.querySelector('[data-map-col="1"]');
      var col2el       = tr.querySelector('[data-map-col="2"]');
      var col3         = tr.querySelector('[data-map-col="3"]');
      var notUpdEl     = tr.querySelector('[data-map-not-update]');

      var formFid   = (col1 && col1.tagName === 'SELECT') ? (col1.value || '') : '';
      var staticVal = col2el ? (col2el.value || '').trim() : '';
      var odooField = fixedOdoo || ((col3 && col3.tagName === 'SELECT') ? (col3.value || '') : '');

      if (!odooField) return;
      var isUpdateField = notUpdEl ? !notUpdEl.checked : true;
      var isIdentifier  = rowType === 'identifier';

      if (formFid) {
        // Collect value_map for choice fields in this row
        var valueMap = null;
        var vmapEls = tr.querySelectorAll('[data-choice-value]');
        if (vmapEls.length) {
          var vmapObj = {}; var hasAny = false;
          vmapEls.forEach(function (inp) {
            var k = inp.dataset.choiceValue; var v = (inp.value || '').trim();
            if (k && v) { vmapObj[k] = v; hasAny = true; }
          });
          if (hasAny) valueMap = vmapObj;
        }
        newMappings.push({
          odoo_field: odooField, source_type: 'form', source_value: formFid,
          is_identifier: isIdentifier, is_update_field: isUpdateField,
          is_required: tr.dataset.rowIsRequired === 'true', order_index: orderIdx++,
          value_map: valueMap,
        });
      } else if (staticVal) {
        var srcType = /\{[^}]+\}/.test(staticVal) ? 'template' : 'static';
        newMappings.push({
          odoo_field: odooField, source_type: srcType, source_value: staticVal,
          is_identifier: isIdentifier, is_update_field: isUpdateField,
          is_required: false, order_index: orderIdx++,
        });
      }
    });

    // ── Chain rows (previous_step_output) — rendered outside the table ──────
    var extraRows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid]) || [];
    extraRows.forEach(function (em, i) {
      if (em.sourceType !== 'previous_step_output') return;  // table rows handled via DOM above
      var sourceValue = em.staticValue || '';
      if (!sourceValue) return;
      // Normalize legacy chain source_value format
      var legFix = String(sourceValue).match(/^step_(\d+)_id$/);
      if (legFix) sourceValue = 'step.' + legFix[1] + '.record_id';
      if (!/^step\.[^.]+\.record_id$/.test(sourceValue)) {
        console.warn('[FSV2] chain row skipped: invalid source_value', sourceValue, em);
        return;
      }
      var chainReqChk = mcEl.querySelector('input[name="det-extra-' + tid + '-chain-req-' + i + '"]');
      var chainIdChk  = mcEl.querySelector('input[name="det-extra-' + tid + '-chain-id-'  + i + '"]');
      newMappings.push({
        odoo_field: em.odooField, source_type: 'previous_step_output', source_value: sourceValue,
        is_identifier: chainIdChk ? chainIdChk.checked : true,
        is_update_field: true,
        is_required: chainReqChk ? chainReqChk.checked : (em.isRequired || false),
        order_index: orderIdx++,
      });
    });

    // ── Preserve model-level fixed_fields (auto-filled) — not editable in the table ───
    var _mcfgSave     = window.FSV2.getModelCfg ? window.FSV2.getModelCfg(target.odoo_model) : {};
    var _fixedForSave = (Array.isArray(_mcfgSave.fixed_fields) ? _mcfgSave.fixed_fields : [])
      .map(function (f) { return typeof f === 'string' ? f : (f.name || ''); });
    var existingStaticMappings = ((S().detail.mappingsByTarget && S().detail.mappingsByTarget[tid]) || [])
      .filter(function (m) { return m.source_type === 'static' && _fixedForSave.includes(m.odoo_field); });
    existingStaticMappings.forEach(function (m) {
      newMappings.push({
        odoo_field: m.odoo_field, source_type: 'static', source_value: m.source_value,
        is_identifier: false, is_update_field: m.is_update_field !== false,
        is_required: false, order_index: orderIdx++,
      });
    });

    await window.FSV2.api('/targets/' + tid + '/mappings', { method: 'DELETE' });
    await Promise.all(newMappings.map(function (m) {
      return window.FSV2.api('/targets/' + tid + '/mappings', { method: 'POST', body: JSON.stringify(m) });
    }));

    // Warn when upsert/update_only has no identifier — will cause permanent_failed at webhook time.
    var needsId = newOpType === 'upsert' || newOpType === 'update_only';
    var hasId   = newMappings.some(function (m) { return m.is_identifier; });
    if (needsId && !hasId && newMappings.length > 0) {
      window.FSV2.showAlert('Let op: geen zoekcriterium (identifier) ingesteld. Bij “zoeken/bijwerken” is minstens één zoekcriterium verplicht — tik het slotje-icoon aan of gebruik de ID van de vorige stap als zoekcriterium.', 'warning');
    }

    window.FSV2.showAlert('Stap opgeslagen.', 'success');
    // Clear only this target's extra-row cache; _pipelineOpenById is module-level → stays open
    if (S().detail._extraRowsByTarget) delete S().detail._extraRowsByTarget[tid];
    await openDetail(S().activeId);
  }

  async function handleReorderTarget(targetId, direction) {
    var targets       = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (!integrationId) return;

    var sorted  = [...targets].sort(function (a, b) { return getTargetOrder(a, 0) - getTargetOrder(b, 0); });
    var idx     = sorted.findIndex(function (t) { return String(t.id) === String(targetId); });
    if (idx < 0) return;
    var swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    var tA = sorted[idx];  var tB = sorted[swapIdx];
    var oA = getTargetOrder(tA, idx);  var oB = getTargetOrder(tB, swapIdx);
    var temp = Math.max(oA, oB) + 100;  // safe temp (no unique constraint conflict)

    var VALID_ID_TYPES  = ['single_email', 'partner_context', 'registration_composite', 'mapped_fields', 'odoo_id'];
    var VALID_POLICIES  = ['always_overwrite', 'only_if_incoming_non_empty', 'upsert'];
    function payload(t, execOrder) {
      var idType  = VALID_ID_TYPES.includes(t.identifier_type)  ? t.identifier_type  : 'mapped_fields';
      var policy  = VALID_POLICIES.includes(t.update_policy)    ? t.update_policy    : 'always_overwrite';
      return JSON.stringify({
        odoo_model:      t.odoo_model,
        identifier_type: idType,
        update_policy:   policy,
        order_index:     Number(t.order_index || 0),
        is_enabled:      t.is_enabled !== false,
        execution_order: execOrder,
      });
    }

    // 3-step swap avoids unique-index collision on (integration_id, execution_order)
    await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tA.id,
      { method: 'PUT', body: payload(tA, temp) });
    await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tB.id,
      { method: 'PUT', body: payload(tB, oA) });
    await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tA.id,
      { method: 'PUT', body: payload(tA, oB) });

    // _pipelineOpenById is module-level → open cards stay open through reload
    await openDetail(S().activeId);
  }

  async function handleToggleIdentifier(mappingId) {
    var m = null;
    if (S().detail && S().detail.mappingsByTarget) {
      Object.values(S().detail.mappingsByTarget).forEach(function (list) {
        list.forEach(function (x) { if (x.id === mappingId) m = x; });
      });
    }
    if (!m) return;
    await window.FSV2.api('/mappings/' + mappingId, {
      method: 'PUT',
      body: JSON.stringify({
        odoo_field:    m.odoo_field,
        source_type:   m.source_type,
        source_value:  m.source_value,
        is_required:   m.is_required,
        is_identifier: !m.is_identifier,
        order_index:   m.order_index || 0,
      }),
    });
    await openDetail(S().activeId);
  }

  // ── Field visibility/alias handlers ────────────────────────────────────────
  function hasAnyFieldMetaOverrides(entry) {
    if (!entry || typeof entry !== 'object') return false;
    return !!(
      entry.hidden ||
      entry.show_in_list ||
      entry.alias ||
      entry.bulk_import_show === false ||
      (entry.bulk_import_default != null && String(entry.bulk_import_default).trim() !== '')
    );
  }

  function handleToggleFieldHidden(fid) {
    var integId = String(S().activeId || '');
    var meta    = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    meta[fid].hidden = !meta[fid].hidden;
    // When hiding a field, also disable bulk import for it
    if (meta[fid].hidden) meta[fid].bulk_import_show = false;
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    _saveFieldMeta(integId, meta);
    renderDetailFormFields();
    renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleShowInList(fid) {
    var integId = String(S().activeId || '');
    var meta    = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    meta[fid].show_in_list = !meta[fid].show_in_list;
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    _saveFieldMeta(integId, meta);
    renderDetailFormFields();
    renderDetailSubmissions();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleBulkImportShow(fid) {
    var integId = String(S().activeId || '');
    var meta = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    meta[fid].bulk_import_show = meta[fid].bulk_import_show === false;
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    _saveFieldMeta(integId, meta);
    renderDetailFormFields();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleSaveBulkImportDefault(fid, value) {
    var integId = String(S().activeId || '');
    var meta = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    var trimmed = (value || '').trim();
    if (trimmed) {
      meta[fid].bulk_import_default = trimmed;
    } else {
      delete meta[fid].bulk_import_default;
    }
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    _saveFieldMeta(integId, meta);
    renderDetailFormFields();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleSaveFieldAlias(fid, alias) {
    var integId = String(S().activeId || '');
    var meta    = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    var trimmed = (alias || '').trim();
    if (trimmed) {
      meta[fid].alias = trimmed;
    } else {
      delete meta[fid].alias;
    }
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    _saveFieldMeta(integId, meta);
    renderDetailFormFields();
    renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleShowHidden() {
    S()._showHiddenFields = !S()._showHiddenFields;
    renderDetailFormFields();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleRefreshFormFields() {
    var integration = S().detail && S().detail.integration;
    if (integration && integration.source_type === 'generic_webhook') {
      // Re-load submissions and re-extract field names from the latest payload
      var id = S().activeId;
      if (!id) return;
      S().detailFormFields = 'loading';
      renderDetailFormFields();
      try {
        var subBody = await window.FSV2.api('/integrations/' + id + '/submissions');
        S().submissions = subBody.data || [];
        extractGenericWebhookFields();
      } catch (e) {
        S().detailFormFields = [];
        window.FSV2.showAlert('Vernieuwen mislukt: ' + e.message, 'error');
      }
      renderDetailFormFields();
      renderDetailMappings();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }
    var sk  = integration && integration.site_key;
    var fid = integration && integration.forminator_form_id;
    if (!fid) return;
    await fetchDetailFormFields(sk || null, fid);
  }

  function extractGenericWebhookFields() {
    var submissions = S().submissions || [];
    var lastWithPayload = null;
    for (var i = 0; i < submissions.length; i++) {
      var p = submissions[i].source_payload;
      if (p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length > 0) {
        lastWithPayload = p;
        break;
      }
    }
    if (lastWithPayload) {
      S().detailFormFields = Object.keys(lastWithPayload).map(function (key) {
        return { field_id: key, label: key, type: 'text' };
      });
    } else {
      S().detailFormFields = [];
    }
    applyDefaultFieldMeta();
  }

  /**
   * Scant bestaande inzendingen op payload-sleutels die niet in de form-definitie staan
   * (bv. referer, ovme-uuid). Voegt deze toe als extra velden met from_payload: true.
   */
  function mergePayloadExtraFields(knownFields) {
    var submissions = S().submissions || [];
    if (!submissions.length) return knownFields || [];

    // Normaliseer een field key: lowercase, koppeltekens/underscores/spaties → underscore
    // Zelfde logica als normalizeFieldKey in de worker, zodat "text-1" === "text_1"
    function normKey(k) { return String(k || '').toLowerCase().replace(/[-_\s]+/g, '_'); }

    // Bouw een set van bekende genormaliseerde field_ids (inclusief composite children)
    var knownNorm = {};
    (knownFields || []).forEach(function (f) {
      knownNorm[normKey(f.field_id)] = true;
      // kinderen als objecten (raw WP-schema heeft f.children)
      if (Array.isArray(f.children)) {
        f.children.forEach(function (c) { knownNorm[normKey(c.field_id)] = true; });
      }
      // kinderen als strings (na flattening: f.composite_children)
      if (Array.isArray(f.composite_children)) {
        f.composite_children.forEach(function (cid) { knownNorm[normKey(cid)] = true; });
      }
    });

    // Container-sleutels die zelf geen bruikbare veldwaarden zijn
    var CONTAINER_NORM = { form_fields: 1, form_data: 1, data: 1, submission: 1 };

    var extraKeys = {};
    submissions.forEach(function (sub) {
      var raw = sub.source_payload;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;

      function scanKeys(obj) {
        Object.keys(obj).forEach(function (key) {
          var n = normKey(key);
          if (!knownNorm[n] && !CONTAINER_NORM[n]) extraKeys[key] = true;
        });
      }

      // Scan root-level sleutels (referer, ovme-uuid etc. zitten hier typisch)
      scanKeys(raw);
      // Scan ook geneste form_fields / form_data als dat een object is
      var nested = raw.form_fields || raw.form_data;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        scanKeys(nested);
      }
    });

    var extras = Object.keys(extraKeys).map(function (key) {
      return { field_id: key, label: key, type: 'text', from_payload: true };
    });

    return (knownFields || []).concat(extras);
  }

  /**
   * Stelt standaard verborgen status in voor velden die raw_* bevatten of type captcha hebben.
   * Wordt alleen toegepast als het veld nog geen expliciete meta heeft.
   */
  function applyDefaultFieldMeta() {
    var fields = S().detailFormFields;
    if (!Array.isArray(fields) || !fields.length) return;
    var integId = String(S().activeId || '');
    var meta    = S()._fieldMeta || {};
    var changed = false;
    fields.forEach(function (f) {
      var fid  = String(f.field_id || '');
      var type = String(f.type || '').toLowerCase();
      var shouldHide = /raw/.test(fid.toLowerCase()) || type === 'captcha' || fid.toLowerCase().startsWith('captcha');
      if (shouldHide && !(meta[fid] && meta[fid]._defaultApplied)) {
        if (!meta[fid]) meta[fid] = {};
        meta[fid].hidden          = true;
        meta[fid].bulk_import_show = false;
        meta[fid]._defaultApplied = true;
        changed = true;
      }
    });
    if (changed) {
      S()._fieldMeta = meta;
      _saveFieldMeta(integId, meta);
    }
  }

  async function fetchDetailFormFields(sk, fid) {
    S().detailFormFields = 'loading';
    renderDetailFormFields();
    renderDetailMappings();
    try {
      var sitesToTry = [];
      if (sk) {
        sitesToTry = [sk];
      } else {
        // Geen site_key bekend — ontdek automatisch via alle geconfigureerde sites
        var sitesBody = await window.FSV2.api('/forminator/sites');
        sitesToTry = (sitesBody.data || []).map(function (s) { return s.key; });
      }

      var ffMatch = null;
      var foundKey = null;
      for (var i = 0; i < sitesToTry.length; i++) {
        try {
          var ffBody = await window.FSV2.api('/forminator/forms?site=' + encodeURIComponent(sitesToTry[i]));
          var found = (ffBody.data || []).find(function (f) { return String(f.form_id) === String(fid); });
          if (found) { ffMatch = found; foundKey = sitesToTry[i]; break; }
        } catch (e) { /* site not reachable, try next */ }
      }

      S().detailFormFields = ffMatch && ffMatch.fields ? ffMatch.fields : [];
      // Voeg extra velden toe die in payload-inzendingen voorkomen maar niet in de form-definitie staan
      S().detailFormFields = mergePayloadExtraFields(S().detailFormFields);
      applyDefaultFieldMeta();

      // Sla de ontdekte site_key terug op de integratie zodat volgende keer direct werkt
      if (foundKey && !sk && S().detail && S().detail.integration) {
        window.FSV2.api('/integrations/' + S().activeId, {
          method: 'PUT',
          body: JSON.stringify({ site_key: foundKey }),
        }).then(function () {
          if (S().detail && S().detail.integration) S().detail.integration.site_key = foundKey;
        }).catch(function () {});
      }
    } catch (e) {
      S().detailFormFields = [];
      window.FSV2.showAlert('Formuliervelden ophalen mislukt: ' + e.message, 'error');
    }
    renderDetailFormFields();
    renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleDeleteIntegration(id, name) {
    if (!confirm('Integratie "' + name + '" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    await window.FSV2.api('/integrations/' + id, { method: 'DELETE' });
    window.FSV2.showAlert('Integratie verwijderd.', 'success');
    await window.FSV2.loadIntegrations();
    window.FSV2.renderList();
  }

  async function handleReplay(submissionId) {
    var body = await window.FSV2.api('/submissions/' + submissionId + '/replay', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    window.FSV2.showAlert('Replay gestart: ' + window.FSV2.shortId((body.data || {}).replay_submission_id), 'success');
    await openDetail(S().activeId);
  }

  async function handleDeleteSubmission(submissionId) {
    if (!confirm('Indienen ' + window.FSV2.shortId(submissionId) + ' verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    await window.FSV2.api('/submissions/' + submissionId, { method: 'DELETE' });
    window.FSV2.showAlert('Indienen verwijderd.', 'success');
    await openDetail(S().activeId);
  }

  function handleToggleDeleteUnlock() {
    S()._deleteUnlocked = !S()._deleteUnlocked;
    renderDetailSubmissions();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleCleanupReplays() {
    var integId = String(S().activeId || '');
    if (!integId) return;
    if (!confirm('Verwijder alle mislukte originele indieningen en replay-pogingen waarvoor een geslaagde replay bestaat? Dit kan niet ongedaan worden gemaakt.')) return;
    try {
      var res = await window.FSV2.api('/integrations/' + integId + '/cleanup-replays', { method: 'POST' });
      window.FSV2.showAlert('Opgekuist: ' + res.data.deleted + ' verwijderd, ' + res.data.promoted + ' gepromoveerd.', 'success');
      await openDetail(integId);
    } catch (e) {
      window.FSV2.showAlert('Opkuis mislukt: ' + e.message, 'error');
    }
  }

  function normalizeBulkText(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function normalizeBulkPhone(v) {
    return normalizeBulkText(v).replace(/[^\d+]/g, '');
  }

  function parseBulkDateToIso(v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'number') {
      var epoch = Date.UTC(1899, 11, 30);
      var excelDate = new Date(epoch + Math.round(v * 24 * 60 * 60 * 1000));
      if (!isNaN(excelDate.getTime())) return excelDate.toISOString();
    }

    var raw = normalizeBulkText(v);
    if (!raw) return '';

    var direct = new Date(raw);
    if (!isNaN(direct.getTime())) return direct.toISOString();

    var m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?)?$/i);
    if (m) {
      var a = Number(m[1]);
      var b = Number(m[2]);
      var y = Number(m[3]);
      var hh = Number(m[4] || 0);
      var mm = Number(m[5] || 0);
      var ampm = normalizeBulkText(m[6]).toLowerCase();
      if (y < 100) y += 2000;
      var day = a > 12 ? a : b;
      var month = a > 12 ? b : a;
      if (ampm === 'pm' && hh < 12) hh += 12;
      if (ampm === 'am' && hh === 12) hh = 0;
      var parsed = new Date(y, month - 1, day, hh, mm, 0);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }

    return null;
  }

  function normalizeBulkEnum(field, value, dropdowns) {
    var raw = normalizeBulkText(value);
    if (!raw) return '';
    var options = Array.isArray(dropdowns[field]) ? dropdowns[field] : [];
    if (!options.length) return raw;
    var match = options.find(function (opt) {
      var optValue = (opt && typeof opt === 'object') ? (opt.value != null ? String(opt.value) : '') : String(opt || '');
      return normalizeBulkText(optValue).toLowerCase() === raw.toLowerCase();
    });
    if (!match) return raw;
    return (match && typeof match === 'object') ? (match.value != null ? String(match.value) : raw) : String(match);
  }

  async function loadBulkImportConfig() {
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    if (summaryEl) {
      summaryEl.innerHTML = '<span class="loading loading-spinner loading-xs"></span><span class="ml-2">Connectievelden laden...</span>';
    }

    var res = await window.FSV2.api('/integrations/' + S().activeId + '/import-meta-leads/template');
    var data = (res && res.data) || {};
    var columns = Array.isArray(data.columns) ? data.columns : [];
    var dropdowns = data.dropdowns && typeof data.dropdowns === 'object' ? data.dropdowns : {};
    var inputRules = data.input_rules && typeof data.input_rules === 'object' ? data.input_rules : {};
    var sampleRow = data.sample_row && typeof data.sample_row === 'object' ? data.sample_row : {};
    var fieldTransforms = data.field_transforms && typeof data.field_transforms === 'object' ? data.field_transforms : {};
    var fieldMeta = Object.assign(
      {},
      (data.field_meta && typeof data.field_meta === 'object' ? data.field_meta : {}),
      (S()._fieldMeta || {})
    );
    var bulkDefaults = {};
    var bulkVisible = {};

    columns.forEach(function (field) {
      var transform = fieldTransforms[field];
      var valueMap = transform && transform.value_map && typeof transform.value_map === 'object' ? transform.value_map : null;
      if (!valueMap) return;
      var keys = getOrderedValueMapKeys(transform);
      if (!keys.length) return;
      var merged = Array.isArray(dropdowns[field]) ? dropdowns[field].slice() : [];
      keys.forEach(function (key) {
        var exists = merged.some(function (opt) {
          if (opt && typeof opt === 'object') return String(opt.value || '') === key;
          return String(opt) === key;
        });
        if (!exists) merged.push({ value: key, label: key + ' -> ' + String(valueMap[key]) });
      });
      dropdowns[field] = merged;
    });

    columns.forEach(function (field) {
      var meta = fieldMeta[field] || {};
      bulkVisible[field] = meta.bulk_import_show !== false;
      var defaultValue = meta.bulk_import_default != null ? String(meta.bulk_import_default) : '';
      if (!defaultValue && S().detail && S().detail.integration) {
        if (field === 'form_id' && S().detail.integration.forminator_form_id) defaultValue = String(S().detail.integration.forminator_form_id);
        if (field === 'form_name' && S().detail.integration.name) defaultValue = String(S().detail.integration.name);
      }
      if (defaultValue) bulkDefaults[field] = defaultValue;
    });

    var detailFields = S().detailFormFields || [];
    detailFields.forEach(function (f) {
      var fid = String(f.field_id || '');
      if (!fid) return;
      var meta = fieldMeta[fid] || {};
      if (meta.bulk_import_show === false) return;
      if (columns.indexOf(fid) !== -1) return;
      columns.push(fid);
      bulkVisible[fid] = true;
      var defaultValue = meta.bulk_import_default != null
        ? String(meta.bulk_import_default) : '';
      if (!defaultValue && S().detail && S().detail.integration) {
        if (fid === 'form_id' && S().detail.integration.forminator_form_id)
          defaultValue = String(S().detail.integration.forminator_form_id);
        if (fid === 'form_name' && S().detail.integration.name)
          defaultValue = String(S().detail.integration.name);
      }
      if (defaultValue) bulkDefaults[fid] = defaultValue;
    });

    S()._bulkImportConfig = {
      columns: columns,
      dropdowns: dropdowns,
      inputRules: inputRules,
      sampleRow: sampleRow,
      fieldMeta: fieldMeta,
      bulkDefaults: bulkDefaults,
      bulkVisible: bulkVisible,
    };

    var rows = [];
    S()._bulkImportRows = rows;
    renderBulkImportEditor();

    if (summaryEl) {
      summaryEl.innerHTML = '<div class="text-sm text-success">Velden geladen. Vul de rijen in en valideer.</div>';
    }
  }

  function renderBulkImportEditor() {
    var editor = document.getElementById('bulkImportEditor');
    if (!editor) return;

    var cfg = S()._bulkImportConfig || {};
    var columns = Array.isArray(cfg.columns) ? cfg.columns : [];
    var dropdowns = cfg.dropdowns || {};
    var inputRules = cfg.inputRules || {};
    var bulkVisible = cfg.bulkVisible || {};
    var rows = Array.isArray(S()._bulkImportRows) ? S()._bulkImportRows : [];

    if (!columns.length) {
      editor.innerHTML = '<div class="text-sm text-base-content/60">Geen velden beschikbaar voor deze connectie.</div>';
      return;
    }

    var composer = S()._bulkImportComposer || {};
    var visibleColumns = columns.filter(function (field) { return bulkVisible[field] !== false; });
    var hiddenCount = columns.length - visibleColumns.length;
    var html = '<div class="space-y-3">' +
      '<div class="rounded-box border border-base-300 bg-base-100 p-3">' +
        '<div class="flex items-center justify-between gap-2 mb-3">' +
          '<div class="font-semibold text-sm">Nieuwe rij</div>' +
          '<button class="btn btn-xs btn-outline" type="button" data-action="add-bulk-import-row">Rij toevoegen</button>' +
        '</div>' +
        '<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">';

    visibleColumns.forEach(function (field) {
      var value = composer[field] !== undefined ? composer[field] : (cfg.bulkDefaults && cfg.bulkDefaults[field] !== undefined ? cfg.bulkDefaults[field] : '');
      var options = Array.isArray(dropdowns[field]) ? dropdowns[field] : [];
      var rule = inputRules[field] || {};
      var label = String(field).replace(/_/g, ' ');

      html += '<div class="min-w-0">' +
        '<label class="label pb-1"><span class="label-text text-xs font-medium truncate">' + window.FSV2.esc(label) + '</span></label>';

      if (options.length) {
        html += '<select class="select select-bordered select-sm w-full" data-bulk-composer-field="' + window.FSV2.esc(field) + '">';
        html += '<option value=""></option>';
        options.forEach(function (opt) {
          var optValue = (opt && typeof opt === 'object') ? (opt.value != null ? String(opt.value) : '') : String(opt || '');
          var optLabel = (opt && typeof opt === 'object') ? (opt.label != null ? String(opt.label) : optValue) : String(opt || '');
          var selected = String(value) === String(optValue) ? ' selected' : '';
          html += '<option value="' + window.FSV2.esc(optValue) + '"' + selected + '>' + window.FSV2.esc(optLabel) + '</option>';
        });
        html += '</select>';
      } else {
        var inputType = rule.type === 'datetime' ? 'datetime-local' : 'text';
        var inputValue = String(value || '');
        if (rule.type === 'datetime' && inputValue) {
          var pickedDate = parseBulkDateToIso(inputValue);
          if (pickedDate) inputValue = pickedDate.slice(0, 16);
        }
        var placeholder = rule.type === 'datetime' ? 'YYYY-MM-DDTHH:MM' : '';
        html += '<input type="' + inputType + '" class="input input-bordered input-sm w-full" data-bulk-composer-field="' + window.FSV2.esc(field) + '" value="' + window.FSV2.esc(inputValue) + '" placeholder="' + window.FSV2.esc(placeholder) + '">';
      }

      html += '</div>';
    });

    html += '</div>' +
      '<div class="mt-3 text-xs text-base-content/50">Vul een rij in en druk op Rij toevoegen.' +
        (hiddenCount > 0 ? (' <span class="text-base-content/60">' + window.FSV2.esc(String(hiddenCount)) + ' veld(en) worden automatisch toegevoegd.</span>') : '') +
      '</div>' +
    '</div>';

    if (rows.length) {
      html += '<div class="space-y-2">';
      rows.forEach(function (row, rowIndex) {
        var parts = [];
        visibleColumns.forEach(function (field) {
          var value = row && row[field] !== undefined ? String(row[field]).trim() : '';
          if (!value) return;
          parts.push('<span class="badge badge-ghost badge-sm whitespace-normal break-words">' + window.FSV2.esc(String(field).replace(/_/g, ' ') + ': ' + value) + '</span>');
        });
        if (!parts.length) parts.push('<span class="text-base-content/40">Lege rij</span>');
        html += '<div class="rounded-box border border-base-200 bg-base-50 px-3 py-2">' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div class="flex flex-wrap gap-1 min-w-0">' +
              '<span class="badge badge-outline badge-sm">Rij ' + window.FSV2.esc(String(rowIndex + 1)) + '</span>' +
              parts.join('') +
            '</div>' +
            '<button class="btn btn-ghost btn-xs text-error shrink-0" data-action="remove-bulk-import-row" data-row-index="' + rowIndex + '"><i data-lucide="trash-2" class="w-3 h-3"></i></button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="text-sm text-base-content/50 italic">Nog geen rijen toegevoegd.</div>';
    }

    html += '</div>';
    editor.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [editor] });
  }

  function readBulkComposerValues() {
    var editor = document.getElementById('bulkImportEditor');
    var values = {};
    if (!editor) return values;

    editor.querySelectorAll('[data-bulk-composer-field]').forEach(function (el) {
      var field = el.getAttribute('data-bulk-composer-field');
      if (!field) return;
      values[field] = el.value;
    });
    return values;
  }

  function hasAnyBulkComposerValue(values) {
    return Object.keys(values || {}).some(function (key) {
      return normalizeBulkText(values[key]) !== '';
    });
  }

  function validateBulkComposerRow(values) {
    var cfg = S()._bulkImportConfig || {};
    var columns = Array.isArray(cfg.columns) ? cfg.columns : [];
    var normalized = {};
    var hasAny = false;

    columns.forEach(function (field) {
      var raw = Object.prototype.hasOwnProperty.call(values, field) ? values[field] : '';
      if ((raw === undefined || raw === null || normalizeBulkText(raw) === '') && cfg.bulkDefaults && Object.prototype.hasOwnProperty.call(cfg.bulkDefaults, field)) {
        raw = cfg.bulkDefaults[field];
      }
      var rule = (cfg.inputRules || {})[field] || {};
      var value = raw;

      if (rule.type === 'datetime') {
        var parsed = parseBulkDateToIso(raw);
        if (parsed === null) {
          var err = new Error('Rijvalidatie: veld "' + field + '" heeft een ongeldige datum/tijd.');
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        value = parsed;
      } else if (rule.type === 'enum') {
        value = normalizeBulkEnum(field, raw, cfg.dropdowns || {});
      } else if (rule.type === 'email') {
        value = normalizeBulkText(raw).toLowerCase();
      } else if (rule.type === 'phone') {
        value = normalizeBulkPhone(raw);
      } else {
        value = normalizeBulkText(raw);
      }

      if (normalizeBulkText(value)) hasAny = true;
      normalized[field] = value;
    });

    return { normalized: normalized, hasAny: hasAny };
  }

  function readBulkRowsFromEditor() {
    return Array.isArray(S()._bulkImportRows) ? S()._bulkImportRows : [];
  }

  function validateAndNormalizeBulkRows(rows) {
    var cfg = S()._bulkImportConfig || {};
    var columns = Array.isArray(cfg.columns) ? cfg.columns : [];
    var dropdowns = cfg.dropdowns || {};
    var inputRules = cfg.inputRules || {};

    var errors = [];
    var normalizedRows = [];

    rows.forEach(function (row, rowIndex) {
      var normalized = {};
      var hasAny = false;

      columns.forEach(function (field) {
        var raw = row && Object.prototype.hasOwnProperty.call(row, field) ? row[field] : '';
        var rule = inputRules[field] || {};
        var value = raw;

        if (rule.type === 'datetime') {
          var parsed = parseBulkDateToIso(raw);
          if (parsed === null) {
            errors.push('Rij ' + (rowIndex + 1) + ', veld "' + field + '": ongeldige datum/tijd');
            value = raw;
          } else {
            value = parsed;
          }
        } else if (rule.type === 'enum') {
          value = normalizeBulkEnum(field, raw, dropdowns);
        } else if (rule.type === 'email') {
          value = normalizeBulkText(raw).toLowerCase();
        } else if (rule.type === 'phone') {
          value = normalizeBulkPhone(raw);
        } else {
          value = normalizeBulkText(raw);
        }

        if (normalizeBulkText(value)) hasAny = true;
        normalized[field] = value;
      });

      if (hasAny) normalizedRows.push(normalized);
    });

    return { normalizedRows: normalizedRows, errors: errors };
  }

  function handleOpenImportModal() {
    var dlg = document.getElementById('importMetaLeadsDialog');
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    var submitBtn = document.getElementById('btnImportMetaLeads');
    var validateBtn = document.getElementById('btnValidateBulkImport');
    var addBtn = document.getElementById('btnAddBulkImportRow');
    var runInactiveEl = document.getElementById('bulkImportRunWhenInactive');

    if (summaryEl) summaryEl.innerHTML = '';
    if (submitBtn) submitBtn.disabled = false;
    if (validateBtn) validateBtn.disabled = false;
    if (addBtn) addBtn.disabled = false;
    if (runInactiveEl) runInactiveEl.checked = false;

    S()._bulkImportConfig = null;
    S()._bulkImportRows = [];
    S()._bulkImportComposer = {};

    if (dlg) dlg.showModal();
    loadBulkImportConfig().catch(function (err) {
      window.FSV2.showAlert('Bulk configuratie laden mislukt: ' + err.message, 'error');
    });
  }

  function handleAddBulkImportRow() {
    var composerValues = readBulkComposerValues();
    var normalized;
    var checked;
    try {
      checked = validateBulkComposerRow(composerValues);
      normalized = checked.normalized;
    } catch (err) {
      window.FSV2.showAlert(err.message || 'Rijvalidatie mislukt.', 'error');
      return;
    }

    if (!checked.hasAny) {
      window.FSV2.showAlert('Vul eerst minstens één veld in.', 'warning');
      return;
    }

    var rows = Array.isArray(S()._bulkImportRows) ? S()._bulkImportRows.slice() : [];
    rows.push(normalized);
    S()._bulkImportRows = rows;
    S()._bulkImportComposer = {};
    renderBulkImportEditor();
  }

  function handleRemoveBulkImportRow(rowIndexRaw) {
    var rowIndex = Number(rowIndexRaw);
    if (!Number.isInteger(rowIndex)) return;
    var rows = readBulkRowsFromEditor();
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    rows.splice(rowIndex, 1);
    if (!rows.length) rows.push({});
    S()._bulkImportRows = rows;
    renderBulkImportEditor();
  }

  async function handleValidateBulkImportRows() {
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    var rows = readBulkRowsFromEditor();
    var checked = validateAndNormalizeBulkRows(rows);

    if (summaryEl) {
      summaryEl.innerHTML = '<div class="text-sm space-y-1">' +
        '<div><span class="font-semibold">Ingevulde rijen:</span> ' + window.FSV2.esc(String(checked.normalizedRows.length)) + '</div>' +
        '<div><span class="font-semibold">Validatiefouten:</span> ' + window.FSV2.esc(String(checked.errors.length)) + '</div>' +
        (checked.errors.length
          ? '<div class="text-error">' + window.FSV2.esc(checked.errors.slice(0, 8).join(' | ')) + (checked.errors.length > 8 ? ' ...' : '') + '</div>'
          : '<div class="text-success">Validatie geslaagd. Klaar om te importeren.</div>') +
      '</div>';
    }

    if (checked.errors.length) {
      window.FSV2.showAlert('Validatie klaar: corrigeer de fouten.', 'warning');
    } else {
      window.FSV2.showAlert('Validatie geslaagd.', 'success');
    }
  }

  async function handleImportMetaLeads() {
    var submitBtn = document.getElementById('btnImportMetaLeads');
    var validateBtn = document.getElementById('btnValidateBulkImport');
    var addBtn = document.getElementById('btnAddBulkImportRow');
    var runInactiveEl = document.getElementById('bulkImportRunWhenInactive');
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    var dlg = document.getElementById('importMetaLeadsDialog');

    if (submitBtn) submitBtn.disabled = true;
    if (validateBtn) validateBtn.disabled = true;
    if (addBtn) addBtn.disabled = true;

    if (summaryEl) summaryEl.innerHTML = '<span class="loading loading-spinner loading-xs"></span><span class="ml-2">Import wordt verwerkt...</span>';

    try {
      var rows = readBulkRowsFromEditor();
      var checked = validateAndNormalizeBulkRows(rows);
      if (checked.errors.length) {
        var errs = checked.errors.slice(0, 8);
        throw new Error('Validatiefouten in invoer:\n' + errs.join('\n') + (checked.errors.length > 8 ? '\n...' : ''));
      }

      var normalizedRows = checked.normalizedRows || [];
      if (!normalizedRows.length) {
        throw new Error('Geen ingevulde rijen om te importeren.');
      }

      var total = normalizedRows.length;
      var chunkSize = 5;
      var imported = 0;
      var allResults = [];

      for (var start = 0; start < normalizedRows.length; start += chunkSize) {
        var chunk = normalizedRows.slice(start, start + chunkSize);
        var res = await window.FSV2.api('/integrations/' + S().activeId + '/import-meta-leads', {
          method: 'POST',
          body: JSON.stringify({
            rows: chunk,
            max_rows: chunk.length,
            run_when_inactive: !!(runInactiveEl && runInactiveEl.checked),
          }),
        });
        var payload = (res && res.data) || {};
        imported += Array.isArray(payload.results) ? payload.results.length : chunk.length;
        if (Array.isArray(payload.results)) allResults = allResults.concat(payload.results);
      }

      if (summaryEl) {
        summaryEl.innerHTML = '<div class="text-sm space-y-1">' +
          '<div><span class="font-semibold">Rijen geïmporteerd:</span> ' + window.FSV2.esc(String(imported)) + '</div>' +
          '<div><span class="font-semibold">Totaal verwerkt:</span> ' + window.FSV2.esc(String(total)) + '</div>' +
          (allResults.length ? '<div class="text-success">Import voltooid.</div>' : '') +
        '</div>';
      }

      window.FSV2.showAlert('Import voltooid: ' + imported + ' rij(en).', 'success');
      if (dlg) dlg.close();
      await openDetail(S().activeId);
    } catch (e) {
      if (summaryEl) summaryEl.innerHTML = '<div class="text-sm text-error">' + window.FSV2.esc(e.message || 'Import mislukt') + '</div>';
      window.FSV2.showAlert('Import mislukt: ' + e.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (validateBtn) validateBtn.disabled = false;
      if (addBtn) addBtn.disabled = false;
    }
  }

  function handleOpenExportModal() {
    var dlg = document.getElementById('exportSubmissionsDialog');
    if (dlg) dlg.showModal();
  }

  function handleExportSubmissions(format) {
    var dlg = document.getElementById('exportSubmissionsDialog');
    var fromVal = document.getElementById('exportDateFrom') && document.getElementById('exportDateFrom').value;
    var toVal   = document.getElementById('exportDateTo')   && document.getElementById('exportDateTo').value;

    var subs = (S().submissions || []).filter(function (s) {
      if (fromVal && s.created_at < fromVal) return false;
      // to-date: include the whole day (compare up to T23:59:59)
      if (toVal   && s.created_at.slice(0, 10) > toVal) return false;
      return true;
    });

    var fieldMeta    = S()._fieldMeta || {};
    var allFormFields = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var listFieldIds = Object.keys(fieldMeta).filter(function (k) { return fieldMeta[k] && fieldMeta[k].show_in_list; });
    var listColumnsMap2 = {};
    listFieldIds.forEach(function (fid) {
      var ff    = allFormFields.find(function (f) { return String(f.field_id || '') === fid; });
      var label = fieldMeta[fid].alias || (ff && ff.label) || fid;
      if (!listColumnsMap2[label]) { listColumnsMap2[label] = { fids: [], label: label }; }
      listColumnsMap2[label].fids.push(fid);
    });
    var listColumns  = Object.values(listColumnsMap2);

    function getPayloadVal(sub, fids) {
      if (!Array.isArray(fids)) fids = [fids];
      var raw = sub.source_payload;
      var payload = (raw && typeof raw === 'object') ? raw : (function () { try { return JSON.parse(raw || '{}'); } catch (e) { return {}; } }());
      // normalised lookup (same as lookupPayloadValue)
      var norm = function (k) { return String(k || '').toLowerCase().replace(/[-_\s]+/g, '_'); };
      var result = '';
      for (var i = 0; i < fids.length; i++) {
        var fid    = fids[i];
        var normFid = norm(fid);
        if (payload[fid] !== undefined && payload[fid] !== '') { result = payload[fid]; break; }
        var keys = Object.keys(payload);
        var m = keys.find(function (k) { return norm(k) === normFid && payload[k]; });
        if (m) { result = payload[m]; break; }
        var p = keys.find(function (k) { return norm(k).startsWith(normFid + '_') && payload[k]; });
        if (p) { result = payload[p]; break; }
      }
      return result;
    }

    var fixedHeaders = ['id', 'status', 'aangemaakt', 'fout'];
    var headers = fixedHeaders.concat(listColumns.map(function (c) { return c.label; }));

    var rows = subs.map(function (s) {
      var row = {
        id: window.FSV2.shortId(s.id),
        status: s.status || '',
        aangemaakt: window.FSV2.fmt(s.created_at),
        fout: s.last_error || '',
      };
      listColumns.forEach(function (c) { row[c.label] = getPayloadVal(s, c.fids); });
      return row;
    });

    var filename = 'indieningen-' + (S().detail && S().detail.integration && S().detail.integration.name
      ? S().detail.integration.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'export');

    if (format === 'json') {
      var blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      _downloadBlob(blob, filename + '.json');
    } else if (format === 'csv') {
      var csv = [headers.join(',')].concat(rows.map(function (r) {
        return headers.map(function (h) {
          var v = String(r[h] !== undefined ? r[h] : '').replace(/"/g, '""');
          return '"' + v + '"';
        }).join(',');
      })).join('\r\n');
      var blob2 = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      _downloadBlob(blob2, filename + '.csv');
    } else if (format === 'xlsx') {
      if (typeof XLSX === 'undefined') { window.FSV2.showAlert('XLSX-bibliotheek niet geladen.', 'error'); return; }
      var ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Indieningen');
      XLSX.writeFile(wb, filename + '.xlsx');
    }

    if (dlg) dlg.close();
  }

  function _downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXPORT &mdash; extend FSV2
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function toggleStepOpen(tid) {
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (!integrationId) return;
    var po = getPipelineOpen(integrationId);
    po[String(tid)] = !po[String(tid)];
    renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleDuplicateTarget(targetId, integrationId) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var source  = targets.find(function (t) { return String(t.id) === targetId; });
    if (!source) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }

    var maxOrder = targets.reduce(function (max, t) {
      return Math.max(max, getTargetOrder(t, 0));
    }, 0);

    var newTargetPayload = {
      odoo_model:       source.odoo_model,
      identifier_type:  source.identifier_type  || 'mapped_fields',
      update_policy:    source.update_policy    || 'always_overwrite',
      operation_type:   source.operation_type   || 'upsert',
      execution_order:  maxOrder + 1,
      order_index:      maxOrder + 1,
      label:            source.label ? source.label + ' (kopie)' : null,
      condition_field:  source.condition_field  || null,
      condition_values: source.condition_values || null,
    };
    var extraFields = [
      'chatter_template', 'chatter_subtype_xmlid',
      'activity_type_id', 'activity_deadline_offset', 'activity_summary_template',
      'activity_user_id', 'activity_res_id_source', 'activity_user_mode', 'activity_user_pool',
    ];
    extraFields.forEach(function (k) {
      if (source[k] !== undefined && source[k] !== null) newTargetPayload[k] = source[k];
    });

    var newTargetRes = await window.FSV2.api('/integrations/' + integrationId + '/targets', {
      method: 'POST',
      body: JSON.stringify(newTargetPayload),
    });
    var newTargetId = newTargetRes.data && newTargetRes.data.id;
    if (!newTargetId) { window.FSV2.showAlert('Dupliceren mislukt.', 'error'); return; }

    // Copy all mappings sequentially
    var sourceMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[source.id]) || [];
    for (var i = 0; i < sourceMappings.length; i++) {
      var m = sourceMappings[i];
      await window.FSV2.api('/targets/' + newTargetId + '/mappings', {
        method: 'POST',
        body: JSON.stringify({
          odoo_field:      m.odoo_field,
          source_type:     m.source_type,
          source_value:    m.source_value,
          is_identifier:   !!m.is_identifier,
          is_required:     !!m.is_required,
          is_update_field: m.is_update_field !== false,
          order_index:     i,
          value_map:       m.value_map || null,
        }),
      });
    }

    var n = sourceMappings.length;
    window.FSV2.showAlert(
      'Stap gedupliceerd \u2014 ' + n + ' koppeling' + (n !== 1 ? 'en' : '') + ' meegekopieerd.',
      'success'
    );

    // Open the new card if the original was open
    var po = getPipelineOpen(integrationId);
    if (po[String(targetId)]) po[String(newTargetId)] = true;

    await openDetail(S().activeId);
  }

  async function handleDeleteTarget(targetId, integrationId) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    if (targets.length <= 1) {
      window.FSV2.showAlert('Kan de enige stap niet verwijderen. Verwijder de volledige integratie als je deze wilt wissen.', 'warning');
      return;
    }
    var target = targets.find(function (t) { return String(t.id) === String(targetId); });
    var stepLabel = (target && (target.label || target.odoo_model)) || 'deze stap';
    if (!confirm('Stap "' + stepLabel + '" verwijderen?\n\nAlle veldkoppelingen van deze stap gaan ook permanent verloren. Dit kan niet ongedaan worden gemaakt.')) return;
    await window.FSV2.api('/integrations/' + integrationId + '/targets/' + targetId, { method: 'DELETE' });
    window.FSV2.showAlert('Stap verwijderd.', 'success');
    var po = getPipelineOpen(integrationId);
    delete po[String(targetId)];
    await openDetail(S().activeId);
  }

  function applyChainSuggestion(tid, odooField, odooLabel, stepOrder, stepLabel) {
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (!S().detail._extraRowsByTarget)       S().detail._extraRowsByTarget = {};
    if (!S().detail._extraRowsByTarget[tid])  S().detail._extraRowsByTarget[tid] = [];
    var already = S().detail._extraRowsByTarget[tid].some(function (r) {
      return r.odooField === odooField && r.sourceType === 'previous_step_output';
    });
    if (already) { window.FSV2.showAlert('Koppeling bestaat al.', 'info'); return; }
    // Remove any existing default/empty row for the same odoo field so it doesn't duplicate
    S().detail._extraRowsByTarget[tid] = S().detail._extraRowsByTarget[tid].filter(function (r) {
      return !(r.odooField === odooField && r.sourceType !== 'previous_step_output');
    });
    S().detail._extraRowsByTarget[tid].push({
      odooField:   odooField,
      odooLabel:   odooLabel || odooField,
      sourceType:  'previous_step_output',
      staticValue: 'step.' + stepOrder + '.record_id',
      isRequired:  true,
      isIdentifier: true,
    });
    if (integrationId) getPipelineOpen(integrationId)[String(tid)] = true;
    renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    window.FSV2.showAlert('Koppeling toegevoegd. Sla de stap op om te bevestigen.', 'success');
  }

  // ── CHATTER COMPOSER (Fase 3) ────────────────────────────────────────────

  var _chatterPreviewTimers = {};

  function renderChatterComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    var myIdx = sortedTargets.findIndex(function (t) { return String(t.id) === tid; });
    var compatibleSteps = sortedTargets.filter(function (t, idx) {
      return idx < myIdx && t.operation_type !== 'chatter_message';
    });

    var existingIdentifier = null;
    var targetMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
    var idMapping = targetMappings.find(function (m) { return m.is_identifier; });
    if (idMapping) {
      var svRaw = String(idMapping.source_value || '');
      var newFmt = svRaw.match(/^step\.([^.]+)\.record_id$/);
      if (newFmt) {
        existingIdentifier = newFmt[1];
      } else {
        var legFmt = svRaw.match(/^step_(\d+)_id$/);
        if (legFmt) existingIdentifier = legFmt[1];
      }
    }

    var currentTemplate   = target.chatter_template || '';
    var COMBINED_PREFIX   = '__COMBINED__:';
    var SUMMARY_PREFIX    = '__SUMMARY__:';
    var savedMessage      = '';
    var summaryEnabled    = false;
    var summaryOrderedIds = [];
    var savedLabelMap     = {};

    if (currentTemplate.startsWith(COMBINED_PREFIX)) {
      try {
        var cp = JSON.parse(currentTemplate.slice(COMBINED_PREFIX.length));
        savedMessage      = String(cp.message || '');
        summaryEnabled    = true;
        summaryOrderedIds = Array.isArray(cp.ids)  ? cp.ids  : [];
        savedLabelMap     = cp.labels || {};
      } catch (_e) {}
    } else if (currentTemplate.startsWith(SUMMARY_PREFIX)) {
      try {
        var sp = JSON.parse(currentTemplate.slice(SUMMARY_PREFIX.length));
        summaryEnabled    = true;
        summaryOrderedIds = Array.isArray(sp) ? sp : (Array.isArray(sp.ids) ? sp.ids : []);
        savedLabelMap     = (sp && sp.labels) || {};
      } catch (_e) {}
    } else {
      savedMessage = currentTemplate;
    }

    var _ffr       = buildDetailFlatFields(S().detailFormFields || []);
    var flatFields = _ffr.flatFields || [];

    // Build display order: saved order first, then remaining fields appended
    var orderedFields;
    if (summaryOrderedIds.length) {
      var _seen = {};
      orderedFields = [];
      summaryOrderedIds.forEach(function (fid) {
        var f = flatFields.find(function (ff) {
          return (ff.field_id || ff.fieldId || ff.id || ff.name || '') === fid;
        });
        if (f) { orderedFields.push(f); _seen[fid] = true; }
      });
      flatFields.forEach(function (f) {
        var fid = f.field_id || f.fieldId || f.id || f.name || '';
        if (!_seen[fid]) orderedFields.push(f);
      });
    } else {
      orderedFields = flatFields.slice();
    }

    var html = '';

    // ── Step selector ─────────────────────────────────────────────────────────
    if (!compatibleSteps.length) {
      html += '<div class="alert alert-warning text-sm mb-4">' +
        '<i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>' +
        '<span>Let op: er is nog geen voorgaande stap beschikbaar. ' +
        'Voeg eerst een stap toe die een record aanmaakt of bijwerkt.</span>' +
        '</div>';
    } else {
      html += '<div class="form-control mb-3">' +
        '<label class="label pb-1"><span class="label-text text-sm font-medium">Koppel aan stap</span></label>' +
        '<select class="select select-bordered select-sm" id="chatterStepSelect-' + esc(tid) + '">';
      compatibleSteps.forEach(function (t) {
        var order = getTargetOrder(t, 0);
        var lbl   = t.label || modelLabel(t.odoo_model);
        var sel   = (existingIdentifier !== null && String(existingIdentifier) === String(order)) ? ' selected' : '';
        html += '<option value="' + esc(String(order)) + '"' + sel + '>' + esc(lbl) + ' (stap ' + (order + 1) + ')</option>';
      });
      html += '</select>' +
        '<label class="label pt-0.5"><span class="label-text-alt text-base-content/50">Record-ID van deze stap wordt als ontvanger van de notitie gebruikt.</span></label>' +
        '</div>';
    }

    // ── Vrij bericht (Quill) ────────────────────────────────────────────────────
    html += '<div class="form-control mb-1">' +
      '<label class="label pb-1">' +
        '<span class="label-text text-sm font-medium">Vrij bericht <span class="font-normal text-base-content/50">(optioneel)</span></span>' +
        '<span class="label-text-alt text-base-content/50">Klik op een veld om het in te voegen.</span>' +
      '</label>' +
      '<div id="chatterQuillEditor-' + esc(tid) + '"></div>' +
      '</div>';

    // Field insertion chips
    if (flatFields.length) {
      html += '<div class="flex flex-wrap gap-1 mb-3">';
      flatFields.forEach(function (f) {
        var fid = f.field_id || f.fieldId || f.id || f.name || '';
        var lbl = f.label || fid;
        html += '<button type="button"' +
          ' class="badge badge-outline badge-sm cursor-pointer hover:badge-primary transition-colors"' +
          ' data-action="insert-chatter-field" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
          ' title="Invoegen: {' + esc(fid) + '}">' + esc(lbl) + '</button>';
      });
      html += '</div>';
    }

    // ── Formuliersamenvatting toggle ──────────────────────────────────────────
    html += '<div class="divider text-xs my-2">OF COMBINEER MET</div>';
    html += '<label class="flex items-center gap-3 cursor-pointer mb-2 select-none">' +
      '<input type="checkbox" class="toggle toggle-sm toggle-primary" id="chatterSummaryToggle-' + esc(tid) + '"' +
        (summaryEnabled ? ' checked' : '') +
        ' onchange="var p=document.getElementById(\x27chatterSummaryPanel-' + esc(tid) + '\x27);if(p)p.classList.toggle(\x27hidden\x27,!this.checked);window.FSV2.scheduleChatterPreview&&window.FSV2.scheduleChatterPreview(\'' + esc(tid) + '\')">' +
      '<div>' +
        '<div class="text-sm font-medium">Formuliersamenvatting</div>' +
        '<div class="text-xs text-base-content/50">Selecteer en orden de velden die in de HTML-tabel verschijnen. Je kunt dit combineren met een vrij bericht.</div>' +
      '</div>' +
      '</label>';

    // ── Summary field panel ───────────────────────────────────────────────────
    html += '<div id="chatterSummaryPanel-' + esc(tid) + '"' + (!summaryEnabled ? ' class="hidden"' : '') + '>';
    if (orderedFields.length) {
      html += '<p class="text-xs text-base-content/50 mb-1.5">Vink aan + sleep met ▲▼ om de volgorde en selectie aan te passen. Niets aangevinkt = alle velden.</p>';
      html += '<ul id="chatterFieldList-' + esc(tid) + '" class="border border-base-200 rounded-lg overflow-hidden mb-3">';
      orderedFields.forEach(function (f) {
        var fid = f.field_id || f.fieldId || f.id || f.name || '';
        var lbl = f.label || fid;
        var chk = (!summaryOrderedIds.length || summaryOrderedIds.indexOf(fid) !== -1) ? ' checked' : '';
        html += '<li data-fid="' + esc(fid) + '" class="flex items-center gap-2 px-3 py-1.5 border-b border-base-200 last:border-0 bg-base-100 hover:bg-base-200/40">' +
          '<input type="checkbox" class="checkbox checkbox-xs shrink-0" data-summary-field="' + esc(tid) + '" value="' + esc(fid) + '"' + chk +
            ' onchange="window.FSV2.scheduleChatterPreview&&window.FSV2.scheduleChatterPreview(\'' + esc(tid) + '\')">' +
          '<span class="flex-1 text-sm truncate">' + esc(lbl) + '</span>' +
          '<div class="flex flex-col shrink-0">' +
            '<button type="button" data-action="chatter-field-up" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
              ' class="h-4 w-5 flex items-center justify-center text-xs text-base-content/40 hover:text-base-content" title="Omhoog">▲</button>' +
            '<button type="button" data-action="chatter-field-down" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
              ' class="h-4 w-5 flex items-center justify-center text-xs text-base-content/40 hover:text-base-content" title="Omlaag">▼</button>' +
          '</div>' +
        '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="text-sm text-base-content/50 italic mb-3">Geen formuliervelden beschikbaar.</p>';
    }
    html += '</div>'; // end #chatterSummaryPanel

    // ── Preview ───────────────────────────────────────────────────────────────
    html += '<div class="mb-3">' +
      '<div class="text-xs font-semibold text-base-content/60 mb-1.5 uppercase tracking-wide">Voorbeeld in Odoo</div>' +
      '<div class="border border-base-300 rounded-lg overflow-hidden shadow-sm">' +
        '<div style="background:#875a7b;padding:6px 12px;display:flex;align-items:center;gap:8px">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:bold">FS</div>' +
          '<div>' +
            '<div style="color:#fff;font-size:12px;font-weight:600">Forminator Sync</div>' +
            '<div style="color:rgba(255,255,255,0.7);font-size:10px">Interne notitie</div>' +
          '</div>' +
        '</div>' +
        '<iframe sandbox="allow-same-origin" id="chatterPreviewFrame-' + esc(tid) + '"' +
          ' class="w-full min-h-[180px]" style="background:#fff;display:block;"></iframe>' +
      '</div>' +
      '</div>';

    // ── Save button ───────────────────────────────────────────────────────────
    html += '<div class="flex justify-end">' +
      '<button type="button" class="btn btn-primary btn-sm gap-1.5"' +
        ' data-action="save-chatter-composer" data-target-id="' + esc(tid) + '">' +
        '<i data-lucide="save" class="w-4 h-4"></i> Opslaan' +
      '</button>' +
      '</div>';

    el.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });

    // ── Init Quill editor ──────────────────────────────────────────────
    if (!window.FSV2._chatterQuills) window.FSV2._chatterQuills = {};
    var _quillEditorEl = document.getElementById('chatterQuillEditor-' + tid);
    if (_quillEditorEl && window.EOQuill) {
      var _qi = window.EOQuill.create({
        target:      _quillEditorEl,
        initialHtml: savedMessage || '',
        placeholder: 'Bijv: Aanvraag van {email-1} ontvangen.',
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'clean']
        ]
      });
      if (_qi) {
        window.FSV2._chatterQuills[tid] = _qi;
        _qi.quill.on('text-change', function () {
          if (window.FSV2.scheduleChatterPreview) window.FSV2.scheduleChatterPreview(tid);
        });
      }
    }

    scheduleChatterPreview(tid);
  }

  function scheduleChatterPreview(tid) {
    if (_chatterPreviewTimers[tid]) clearTimeout(_chatterPreviewTimers[tid]);
    _chatterPreviewTimers[tid] = setTimeout(function () { updateChatterPreview(tid); }, 150);
  }

  /* Genereer een generische voorbeeldwaarde op basis van veldtype + keuzes. */
  function _makeSampleValue(field) {
    var type = String(field.type || '').toLowerCase();
    var loremWords = ['Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'];
    var loremPick  = function (n) { return loremWords.slice(0, n).join(' '); };
    // Keuzevelden → pak de eerste optie (of willekeurige)
    if (field.choices && field.choices.length) {
      var idx = Math.floor(Math.random() * field.choices.length);
      var c   = field.choices[idx];
      return String(c.label || c.value || c);
    }
    if (type === 'email')                         return 'lorem@example.com';
    if (type === 'tel'  || type === 'phone')      return '+32 499 12 34 56';
    if (type === 'number' || type === 'currency') return '42';
    if (type === 'date')                          return '2026-03-04';
    if (type === 'time')                          return '09:00';
    if (type === 'url')                           return 'https://example.com';
    if (type === 'textarea')                      return loremPick(8) + '.';
    if (type === 'checkbox')                      return 'Ja';
    // Naam-achtige velden herkennen via label
    var lbl = String(field.label || '').toLowerCase();
    if (lbl.includes('naam') || lbl.includes('name')) return 'Lorem Ipsum';
    // Standaard: 2-3 lorem-woorden
    return loremPick(3);
  }

  function updateChatterPreview(tid) {
    var frame = document.getElementById('chatterPreviewFrame-' + tid);
    if (!frame) return;

    var sampleForm = {};
    var labelMap   = {};
    var _ff = buildDetailFlatFields(S().detailFormFields || []).flatFields || [];
    _ff.forEach(function (f) {
      var k = f.field_id || f.fieldId || f.id || f.name || '';
      if (k) { sampleForm[k] = _makeSampleValue(f); labelMap[k] = f.label || k; }
    });

    // Inline fallback when html-utils not yet loaded
    var _buildInlineSummary = function (ids, form, lblMap) {
      var keys = (ids && ids.length)
        ? ids.filter(function (k) { return form[k] != null && form[k] !== ''; })
        : Object.keys(form).filter(function (k) { return !['form_id','form_uid','ovme_forminator_id','nonce'].includes(k) && !k.includes('.'); });
      if (!keys.length) return '';
      var trs = keys.map(function (k) {
        var lbl = (lblMap && lblMap[k]) || k.replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\s+\d+$/, '');
        var val = String(form[k] || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
        return '<tr><td style="padding-bottom:16px">' +
          '<span style="font-weight:600;display:block;margin-bottom:4px;color:#374151">' + lbl + '</span>' +
          '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fafafa;color:#111827">' + val + '</div>' +
          '</td></tr>';
      }).join('');
      return '<div style="max-width:620px;font-family:Arial,sans-serif;font-size:14px;color:#374151">' +
        '<table style="width:100%;border-collapse:collapse"><tbody>' + trs + '</tbody></table></div>';
    };

    var _buildHtml = window.FSV2.buildHtmlFormSummary || _buildInlineSummary;

    var parts = [];

    // Part 1: vrij bericht — lees HTML van Quill, vervang {veld} door vetgedrukte voorbeeldwaarden
    var _qi    = window.FSV2._chatterQuills && window.FSV2._chatterQuills[tid];
    var rawMsg = _qi ? _qi.getHTML() : '';
    if (rawMsg) {
      var msgHtml = rawMsg.replace(/\{([^}]+)\}/g, function (_, key) {
        var v = sampleForm[key] !== undefined ? String(sampleForm[key]) : ('[' + key + ']');
        return '<b>' + v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</b>';
      });
      parts.push(msgHtml);
    }

    // Part 2: formuliersamenvatting (alleen als toggle aan staat)
    var toggle = document.getElementById('chatterSummaryToggle-' + tid);
    if (toggle && toggle.checked) {
      var fieldList  = document.getElementById('chatterFieldList-' + tid);
      var orderedIds = [];
      if (fieldList) {
        fieldList.querySelectorAll('li[data-fid]').forEach(function (li) {
          var cb = li.querySelector('input[type="checkbox"]');
          if (cb && cb.checked) orderedIds.push(li.getAttribute('data-fid'));
        });
      }
      var summaryHtml = _buildHtml(orderedIds.length ? orderedIds : null, sampleForm, labelMap);
      if (summaryHtml) parts.push(summaryHtml);
    }

    var html;
    if (parts.length) {
      html = '<!DOCTYPE html><html><body style="margin:12px 16px;padding:0">' + parts.join('') + '</body></html>';
    } else {
      html = '<!DOCTYPE html><html><body style="margin:0;padding:16px"><p style="color:#9ca3af;font-family:Arial;font-size:13px;margin:0">Typ een bericht of schakel de samenvatting in om een voorbeeld te zien.</p></body></html>';
    }

    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    } catch (e) { /* ignore */ }
  }

  async function handleSaveChatterComposer(tid) {
    var target = ((S().detail && S().detail.targets) || []).find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Target niet gevonden.', 'error'); return; }
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;

    // Vrij bericht: lees HTML van Quill editor
    var _qiSave = window.FSV2._chatterQuills && window.FSV2._chatterQuills[tid];
    var rawMsg  = _qiSave ? _qiSave.getHTML() : '';

    // Samenvatting toggle
    var toggle         = document.getElementById('chatterSummaryToggle-' + tid);
    var summaryEnabled = toggle && toggle.checked;

    var template;
    if (summaryEnabled) {
      // Lees de geordende, aangevinkte velden uit de <ul>
      var fieldList  = document.getElementById('chatterFieldList-' + tid);
      var pickedIds  = [];
      var labelMap   = {};
      var _ffSave    = buildDetailFlatFields(S().detailFormFields || []).flatFields || [];
      var _fidLblMap = {};
      _ffSave.forEach(function (f) {
        var k = f.field_id || f.fieldId || f.id || f.name || '';
        if (k) _fidLblMap[k] = f.label || k;
      });
      if (fieldList) {
        fieldList.querySelectorAll('li[data-fid]').forEach(function (li) {
          var fid = li.getAttribute('data-fid');
          var cb  = li.querySelector('input[type="checkbox"]');
          if (cb && cb.checked && fid) {
            pickedIds.push(fid);
            if (_fidLblMap[fid]) labelMap[fid] = _fidLblMap[fid];
          }
        });
      }
      template = '__COMBINED__:' + JSON.stringify({ message: rawMsg, ids: pickedIds, labels: labelMap });
    } else if (rawMsg) {
      template = rawMsg;
    } else {
      template = null;
    }

    var stepSel = document.getElementById('chatterStepSelect-' + tid);
    // Derive odoo_model from the selected preceding step, not from the chatter target itself.
    // The chatter target's model must always match the model of the step it's posting on.
    var linkedModel = target.odoo_model; // fallback
    if (stepSel) {
      var _selOrder = parseInt(stepSel.value, 10);
      var _allTargets = (S().detail && S().detail.targets) || [];
      var _linkedTarget = _allTargets.find(function (t) {
        return getTargetOrder(t, 0) === _selOrder && t.operation_type !== 'chatter_message';
      });
      if (_linkedTarget && _linkedTarget.odoo_model) linkedModel = _linkedTarget.odoo_model;
    }
    try {
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify({
          odoo_model:            linkedModel,
          operation_type:        'chatter_message',
          chatter_template:      template || null,
          chatter_subtype_xmlid: 'mail.mt_note',
        }),
      });
      if (stepSel) {
        var stepOrder   = stepSel.value;
        var sourceValue = 'step.' + stepOrder + '.record_id';
        var existingMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
        var idMapping = existingMappings.find(function (m) { return m.is_identifier; });
        if (idMapping) {
          await window.FSV2.api('/mappings/' + idMapping.id, {
            method: 'PUT',
            body: JSON.stringify({
              odoo_field:      '_chatter_record_id',
              source_type:     'previous_step_output',
              source_value:    sourceValue,
              is_identifier:   true,
              is_required:     true,
              is_update_field: false,
            }),
          });
        } else {
          await window.FSV2.api('/targets/' + tid + '/mappings', {
            method: 'POST',
            body: JSON.stringify({
              odoo_field:      '_chatter_record_id',
              source_type:     'previous_step_output',
              source_value:    sourceValue,
              is_identifier:   true,
              is_required:     true,
              is_update_field: false,
            }),
          });
        }
      }
      window.FSV2.showAlert('Chatter-stap opgeslagen.', 'success');
      await window.FSV2.openDetail(S().activeId);
    } catch (e) {
      window.FSV2.showAlert('Fout bij opslaan: ' + e.message, 'error');
    }
  }

  // ── ACTIVITY COMPOSER ────────────────────────────────────────────────────

  function renderActivityComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    var myIdx = sortedTargets.findIndex(function (t) { return String(t.id) === tid; });
    var compatibleSteps = sortedTargets.filter(function (t, idx) {
      return idx < myIdx && t.operation_type !== 'chatter_message' && t.operation_type !== 'create_activity';
    });

    // Derive current linked step from activity_res_id_source
    var currentResIdSource = target.activity_res_id_source || '';
    var currentStepOrder   = null;
    var srcMatch = currentResIdSource.match(/^step\.([^.]+)\.record_id$/);
    if (srcMatch) currentStepOrder = srcMatch[1];

    var userMode = target.activity_user_mode || 'fixed';
    var userPool = Array.isArray(target.activity_user_pool) ? target.activity_user_pool : [];

    var html = '';

    // Activiteitstype + Deadline op één rij
    var _linkedModel = null;
    if (currentStepOrder !== null) {
      var _linkedStep = compatibleSteps.find(function (t) { return String(getTargetOrder(t, 0)) === String(currentStepOrder); });
      if (_linkedStep) _linkedModel = _linkedStep.odoo_model;
    }
    if (!_linkedModel && compatibleSteps.length > 0) _linkedModel = compatibleSteps[0].odoo_model;

    html += '<div class="flex gap-4 mb-3 items-end">' +
      '<div class="form-control flex-1">' +
        '<label class="label pb-1"><span class="label-text text-sm font-medium">Activiteitstype</span></label>' +
        '<select class="select select-bordered select-sm" id="activityTypeSelect-' + esc(tid) + '">' +
          '<option value="">Laden\u2026</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-control">' +
        '<label class="label pb-1">' +
          '<span class="label-text text-sm font-medium">Deadline</span>' +
          '<span class="label-text-alt text-base-content/50">werkdagen</span>' +
        '</label>' +
        '<input type="number" min="0" class="input input-bordered input-sm w-24"' +
          ' id="activityDeadlineOffset-' + esc(tid) + '"' +
          ' value="' + esc(String(target.activity_deadline_offset != null ? target.activity_deadline_offset : 1)) + '">' +
      '</div>' +
    '</div>';

    // Beschrijving
    html += '<div class="form-control mb-3">' +
      '<label class="label pb-1">' +
        '<span class="label-text text-sm font-medium">Beschrijving</span>' +
      '</label>' +
      '<input type="text" class="input input-bordered input-sm"' +
        ' id="activitySummaryTemplate-' + esc(tid) + '"' +
        ' value="' + esc(target.activity_summary_template || '') + '"' +
        ' placeholder="Nieuwe aanvraag van {{name}}">' +
      '<label class="label pt-0.5"><span class="label-text-alt text-base-content/50">Gebruik {{veldnaam}} voor formulierwaarden</span></label>' +
      '</div>';

    // ── User assignment ──────────────────────────────────────────────────────
    html += '<div class="form-control mb-3">' +
      '<label class="label pb-1"><span class="label-text text-sm font-medium">Toegewezen gebruiker</span></label>' +
      '<div class="flex flex-wrap gap-2 mb-2">';
    [
      { val: 'fixed',        icon: 'user',       lbl: 'Vaste gebruiker' },
      { val: 'round_robin',  icon: 'refresh-cw', lbl: 'Round robin' },
      { val: 'record_owner', icon: 'link',        lbl: 'Verantwoordelijke van record' },
    ].forEach(function (opt) {
      var active = userMode === opt.val;
      html += '<button type="button"' +
        ' class="btn btn-sm btn-outline' + (active ? ' btn-primary' : '') + '"' +
        ' data-action="act-user-mode" data-target-id="' + esc(tid) + '" data-mode="' + opt.val + '">' +
        '<i data-lucide="' + opt.icon + '" class="w-4 h-4 mr-1"></i>' + opt.lbl +
        '</button>';
    });
    html += '</div>';

    // Fixed: single user dropdown
    html += '<div id="activityUserFixed-' + esc(tid) + '"' + (userMode !== 'fixed' ? ' class="hidden"' : '') + '>' +
      '<select class="select select-bordered select-sm w-full" id="activityUserSelect-' + esc(tid) + '">' +
        '<option value="">Laden\u2026</option>' +
      '</select>' +
      '<label class="label pt-0.5"><span class="label-text-alt text-base-content/50">Leeg = Odoo kiest automatisch (gebruiker gekoppeld aan het activiteitstype).</span></label>' +
      '</div>';

    // Round-robin: pool checkboxes (populated async)
    html += '<div id="activityUserRR-' + esc(tid) + '"' + (userMode !== 'round_robin' ? ' class="hidden"' : '') + '>' +
      '<p class="text-xs text-base-content/50 mb-1.5">Vink de gebruikers aan die in de pool zitten. De activiteiten worden om beurten toegewezen.</p>' +
      '<div id="activityUserPoolList-' + esc(tid) + '" class="border border-base-200 rounded-lg divide-y divide-base-200 max-h-48 overflow-y-auto">' +
        '<div class="px-3 py-2 text-xs text-base-content/40">Laden\u2026</div>' +
      '</div>' +
      '</div>';

    // Record owner: informational
    html += '<div id="activityUserOwner-' + esc(tid) + '"' + (userMode !== 'record_owner' ? ' class="hidden"' : '') + '>' +
      '<p class="text-xs text-base-content/50">De activiteit wordt toegewezen aan de verantwoordelijke gebruiker (user_id) van het gekoppelde record, zoals ingesteld op het moment van indiening.</p>' +
      '</div>';

    html += '</div>'; // end form-control

    // Save button
    html += '<div class="mt-4 flex justify-end">' +
      '<button type="button" class="btn btn-primary btn-sm"' +
        ' data-action="save-activity-composer" data-target-id="' + esc(tid) + '">' +
        '<i data-lucide="save" class="w-4 h-4 mr-1"></i>Opslaan' +
      '</button>' +
      '</div>';

    el.innerHTML = html;

    // Async: load activity types + odoo users
    function _loadActivityTypes(model, selectedId) {
      var url = '/activity-types' + (model ? '?model=' + encodeURIComponent(model) : '');
      return window.FSV2.api(url).then(function (res) {
        var sel = document.getElementById('activityTypeSelect-' + tid);
        if (!sel) return;
        sel.innerHTML = '<option value="">\u2014 Geen type \u2014</option>' +
          (res.data || []).map(function (t) {
            return '<option value="' + esc(String(t.id)) + '"' +
              (selectedId == t.id ? ' selected' : '') + '>' +
              esc(t.name) + '</option>';
          }).join('');
      });
    }
    var loadTypes = _loadActivityTypes(_linkedModel, target.activity_type_id);

    var loadUsers = window.FSV2.api('/odoo-users').then(function (res) {
      var users = res.data || [];

      // Fixed dropdown
      var fixedSel = document.getElementById('activityUserSelect-' + tid);
      if (fixedSel) {
        fixedSel.innerHTML = '<option value="">\u2014 Automatisch \u2014</option>' +
          users.map(function (u) {
            return '<option value="' + esc(String(u.id)) + '"' +
              (target.activity_user_id == u.id ? ' selected' : '') + '>' +
              esc(u.name) + '</option>';
          }).join('');
      }

      // Round-robin pool checkboxes
      var poolList = document.getElementById('activityUserPoolList-' + tid);
      if (poolList) {
        if (!users.length) {
          poolList.innerHTML = '<div class="px-3 py-2 text-xs text-base-content/40">Geen interne gebruikers gevonden.</div>';
        } else {
          poolList.innerHTML = users.map(function (u) {
            var inPool = userPool.indexOf(u.id) !== -1;
            return '<label class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-base-200/40">' +
              '<input type="checkbox" class="checkbox checkbox-xs act-rr-pool-' + esc(tid) + '"' +
                ' value="' + esc(String(u.id)) + '"' + (inPool ? ' checked' : '') + '>' +
              '<span class="text-sm">' + esc(u.name) + '</span>' +
              '</label>';
          }).join('');
        }
      }
    });

    Promise.all([loadTypes, loadUsers]).catch(function () {});

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [el] });
  }

  // Toggle visibility of user-mode panels when mode buttons are clicked
  // (called from bootstrap event delegation for data-action="act-user-mode")
  function handleActivityUserMode(tid, mode) {
    var modes = ['fixed', 'round_robin', 'record_owner'];
    var panelIds = { fixed: 'activityUserFixed-', round_robin: 'activityUserRR-', record_owner: 'activityUserOwner-' };
    modes.forEach(function (m) {
      var panel = document.getElementById(panelIds[m] + tid);
      if (panel) panel.classList.toggle('hidden', m !== mode);
    });
    // Update active state on buttons
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;
    el.querySelectorAll('[data-action="act-user-mode"]').forEach(function (btn) {
      var active = btn.dataset.mode === mode;
      btn.classList.toggle('btn-primary', active);
      btn.classList.toggle('btn-outline', true);
    });
  }

  async function handleSaveActivityComposer(tid) {
    var target = ((S().detail && S().detail.targets) || []).find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Target niet gevonden.', 'error'); return; }
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;

    var stepSel      = document.getElementById('activityStepSelect-' + tid);
    var typeSel      = document.getElementById('activityTypeSelect-' + tid);
    var offsetInput  = document.getElementById('activityDeadlineOffset-' + tid);
    var summaryInput = document.getElementById('activitySummaryTemplate-' + tid);

    // User mode is determined by which mode button is active (has btn-primary)
    var el = document.getElementById('det-mc-' + tid);
    var activeModeBtn = el ? el.querySelector('[data-action="act-user-mode"].btn-primary') : null;
    var userMode = activeModeBtn ? activeModeBtn.dataset.mode : (target.activity_user_mode || 'fixed');

    var fixedUserId = null;
    var userPool = null;
    if (userMode === 'fixed') {
      var fixedSel = document.getElementById('activityUserSelect-' + tid);
      fixedUserId = fixedSel && fixedSel.value ? parseInt(fixedSel.value, 10) : null;
    } else if (userMode === 'round_robin') {
      var poolCheckboxes = el ? el.querySelectorAll('.act-rr-pool-' + tid + ':checked') : [];
      userPool = [];
      poolCheckboxes.forEach(function (cb) { userPool.push(parseInt(cb.value, 10)); });
    }

    var stepOrder   = stepSel ? stepSel.value : null;
    var resIdSource = stepOrder ? ('step.' + stepOrder + '.record_id') : (target.activity_res_id_source || null);

    // Derive model from the linked step
    var linkedModel = target.odoo_model;
    if (stepSel) {
      var _selOrd = parseInt(stepSel.value, 10);
      var _allTargets = (S().detail && S().detail.targets) || [];
      var _linked = _allTargets.find(function (t) {
        return getTargetOrder(t, 0) === _selOrd &&
          t.operation_type !== 'chatter_message' &&
          t.operation_type !== 'create_activity';
      });
      if (_linked && _linked.odoo_model) linkedModel = _linked.odoo_model;
    }

    try {
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify({
          odoo_model:                linkedModel,
          operation_type:            'create_activity',
          activity_type_id:          typeSel && typeSel.value ? parseInt(typeSel.value, 10) : null,
          activity_deadline_offset:  offsetInput ? (parseInt(offsetInput.value, 10) || 1) : 1,
          activity_summary_template: summaryInput ? (summaryInput.value.trim() || null) : null,
          activity_user_mode:        userMode,
          activity_user_id:          fixedUserId,
          activity_user_pool:        userPool,
          activity_res_id_source:    resIdSource || null,
        }),
      });
      window.FSV2.showAlert('Activiteit-stap opgeslagen.', 'success');
      await window.FSV2.openDetail(S().activeId);
    } catch (e) {
      window.FSV2.showAlert('Fout bij opslaan: ' + e.message, 'error');
    }
  }

  function syncPendingValueMapFromDom() {
    var rows = window.FSV2.S._pendingValueMapRows;
    if (Array.isArray(rows)) {
      rows.forEach(function (row, idx) {
        var fromEl = document.querySelector('[data-vmap-from="' + idx + '"]');
        var toEl   = document.querySelector('[data-vmap-to="'   + idx + '"]');
        if (fromEl) row.from = fromEl.value;
        if (toEl)   row.to   = toEl.value;
      });
    }
    // Sync catchall
    var catchallEl = document.querySelector('[data-vmap-catchall]');
    if (catchallEl) window.FSV2.S._pendingCatchall = catchallEl.value;
  }

  Object.assign(window.FSV2, {
    renderDetail:            renderDetail,
    syncPendingValueMapFromDom: syncPendingValueMapFromDom,
    updateDetailTestStatus:  updateDetailTestStatus,
    renderDetailMappings:    renderDetailMappings,
    renderDetailSubmissions: renderDetailSubmissions,
    renderDetailFormFields:  renderDetailFormFields,
    openDetail:              openDetail,
    handleToggleActive:      handleToggleActive,
    handleRunTest:           handleRunTest,
    handleAddMapping:        handleAddMapping,
    handleDeleteMapping:     handleDeleteMapping,
    handleSaveMappings:      handleSaveMappings,
    handleAddTarget:         handleAddTarget,
    handleAddTargetWithType: handleAddTargetWithType,
    renderAddTargetStep2:     renderAddTargetStep2,
    renderAddTargetDialog:   renderAddTargetDialog,
    openHtmlSummaryModal:    openHtmlSummaryModal,
    scheduleHtmlSummaryPreview: scheduleHtmlSummaryPreview,
    updateHtmlSummaryPreview: updateHtmlSummaryPreview,
    confirmHtmlSummary:      confirmHtmlSummary,
    renderChatterComposer:   renderChatterComposer,
    scheduleChatterPreview:  scheduleChatterPreview,
    updateChatterPreview:    updateChatterPreview,
    handleSaveChatterComposer: handleSaveChatterComposer,
    renderActivityComposer:  renderActivityComposer,
    renderActivityLinkCallout: renderActivityLinkCallout,
    handleActivityUserMode:  handleActivityUserMode,
    handleSaveActivityComposer: handleSaveActivityComposer,
    handleDuplicateTarget:   handleDuplicateTarget,
    handleDeleteTarget:      handleDeleteTarget,
    handleSaveStepMappings:  handleSaveStepMappings,
    handleSaveStepCondition:  handleSaveStepCondition,
    handleCondFieldChanged:   handleCondFieldChanged,
    handleReorderTarget:      handleReorderTarget,
    toggleStepOpen:          toggleStepOpen,
    applyChainSuggestion:    applyChainSuggestion,
    removeChainLink:          removeChainLink,
    handleToggleIdentifier:  handleToggleIdentifier,
    fetchDetailFormFields:    fetchDetailFormFields,
    handleRefreshFormFields:  handleRefreshFormFields,
    handleToggleFieldHidden:  handleToggleFieldHidden,
    handleToggleShowInList:   handleToggleShowInList,
    handleToggleBulkImportShow: handleToggleBulkImportShow,
    handleSaveBulkImportDefault: handleSaveBulkImportDefault,
    handleSaveFieldAlias:     handleSaveFieldAlias,
    handleToggleShowHidden:   handleToggleShowHidden,
    handleDeleteIntegration: handleDeleteIntegration,
    handleReplay:            handleReplay,
    handleDeleteSubmission:  handleDeleteSubmission,
    handleToggleDeleteUnlock: handleToggleDeleteUnlock,
    handleCleanupReplays:    handleCleanupReplays,
    handleOpenExportModal:   handleOpenExportModal,
    handleExportSubmissions: handleExportSubmissions,
    handleOpenImportModal:   handleOpenImportModal,
    handleImportMetaLeads:   handleImportMetaLeads,
    handleValidateBulkImportRows: handleValidateBulkImportRows,
    handleAddBulkImportRow:  handleAddBulkImportRow,
    handleRemoveBulkImportRow: handleRemoveBulkImportRow,
  });

}());
