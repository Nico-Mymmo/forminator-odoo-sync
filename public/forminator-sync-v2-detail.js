/**
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
      var webhookBlock = '';
      if (wc && wc.webhook_url) {
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
              '<div class="min-w-0">' +
                '<h2 class="text-2xl font-bold mb-1 truncate">' + esc(integration.name || 'Integratie') + '</h2>' +
                '<p class="text-sm text-base-content/60 mb-2">Formulier: <span class="font-mono">' + esc(integration.forminator_form_id || '\u2014') + '</span></p>' +
                (actionCfg
                  ? '<span class="badge ' + esc(actionCfg.badgeClass) + '">' + esc(actionCfg.label) + '</span>'
                  : '') +
              '</div>' +
              '<label class="flex items-center gap-3 cursor-pointer">' +
                '<span class="font-semibold text-sm">' + (integration.is_active ? 'Actief' : 'Inactief') + '</span>' +
                '<input id="detailActiveToggle" type="checkbox" class="toggle toggle-success"' + (integration.is_active ? ' checked' : '') + '>' +
              '</label>' +
            '</div>' +
            webhookBlock +
            '<div id="detailTestStatus" class="mt-4 text-sm"></div>' +
          '</div>' +
        '</div>';

      var copyBtn = document.getElementById('btnCopyWebhook');
      if (copyBtn && wc && wc.webhook_url) {
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(wc.webhook_url).then(function () {
            window.FSV2.showAlert('Webhook URL gekopi\u00eberd.', 'success');
          }).catch(function () {
            window.FSV2.showAlert('Kopi\u00ebren mislukt \u2014 selecteer de URL handmatig.', 'warning');
          });
        });
      }

      var toggle = document.getElementById('detailActiveToggle');
      if (toggle) {
        toggle.addEventListener('change', function (e) {
          handleToggleActive(e.target.checked).catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
        });
      }
    }

    updateDetailTestStatus();
    renderDetailMappings();
    renderDetailFormFields();
    renderDetailSubmissions();

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function updateDetailTestStatus() {
    var el = document.getElementById('detailTestStatus');
    if (!el) return;
    var tested = S().testStatus && S().testStatus.has_successful_test;
    if (tested) {
      el.innerHTML = '<span class="text-success flex items-center gap-1.5">' +
        '<i data-lucide="check-circle" class="w-4 h-4"></i> Test geslaagd &mdash; integratie kan worden geactiveerd.' +
      '</span>';
    } else {
      el.innerHTML = '<span class="text-warning flex items-center gap-1.5">' +
        '<i data-lucide="alert-triangle" class="w-4 h-4"></i> Nog geen geslaagde test. Activatie is nog niet mogelijk.' +
      '</span>' +
      '<button class="btn btn-xs btn-outline mt-2" id="btnRunTest">Test uitvoeren</button>';
      var testBtn = document.getElementById('btnRunTest');
      if (testBtn) {
        testBtn.addEventListener('click', function () {
          handleRunTest().catch(function (err) { window.FSV2.showAlert(err.message, 'error'); });
        });
      }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function renderDetailMappings() {
    var container = document.getElementById('detailMappingsContainer');
    if (!container) return;

    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    if (!targets.length) {
      container.innerHTML = '<p class="text-sm text-base-content/60">Geen schrijfdoel gevonden voor deze integratie.</p>';
      return;
    }

    var sortedTargets = [...targets].sort(function (a, b) {
      return getTargetOrder(a, 0) - getTargetOrder(b, 0);
    });

    if (!S().detail._extraRowsByTarget) S().detail._extraRowsByTarget = {};

    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    var pipelineOpen  = getPipelineOpen(integrationId);
    var isSingle      = sortedTargets.length === 1;

    var rawFf = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var flatFields = [];
    rawFf.forEach(function (f) {
      if (!window.FSV2.SKIP_TYPES.includes(f.type)) flatFields.push(f);
      if (Array.isArray(f.sub_fields)) f.sub_fields.forEach(function (sf) {
        if (!window.FSV2.SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
      });
    });

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
      var policyLbl  = POLICY_LABELS[target.update_policy] || esc(target.update_policy || '');
      var preceding  = sortedTargets.slice(0, idx);
      var suggestions = isSingle ? [] : computeChainSuggestions(target, preceding);

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

      // ── Card ────────────────────────────────────────────────────────────
      html += '<div class="card bg-base-100 border border-base-200 shadow-sm" data-mt-target-id="' + esc(tid) + '">';
      html +=   '<div class="card-body p-0">';

      // Header row
      html +=     '<div class="px-5 py-4">';
      html +=       '<div class="flex items-center justify-between gap-3 flex-wrap">';

      // Left: badge + name + meta
      html +=         '<div class="flex items-center gap-3 min-w-0">';
      if (!isSingle) {
        html +=           '<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral text-neutral-content text-sm font-bold shrink-0">' + (idx + 1) + '</span>';
      }
      html +=           '<div class="min-w-0">';
      html +=             '<div class="font-bold text-base leading-snug">' + esc(stepName) + '</div>';
      html +=             '<div class="flex flex-wrap items-center gap-x-2.5 gap-y-0 mt-0.5 text-xs text-base-content/50">';
      html +=               '<span class="font-mono">' + esc(target.odoo_model) + '</span>';
      html +=               '<span>·</span>';
      html +=               '<span>' + esc(opTypeLbl) + '</span>';
      if (chainDeps.length > 0) {
        chainDeps.forEach(function (dep) {
          html +=           '<span>·</span>' +
            '<span class="inline-flex items-center gap-1 text-success font-medium">' +
            '<i data-lucide="link-2" class="w-3 h-3"></i>' +
            'Gekoppeld aan stap ' + dep.stepNum + (dep.stepName ? ' (' + esc(dep.stepName) + ')' : '') +
            '</span>';
        });
      }
      html +=             '</div>';
      html +=           '</div>';
      html +=         '</div>';

      // Right: reorder + delete + expand toggle
      html +=         '<div class="flex items-center gap-0.5 shrink-0">';
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

      // Collapsible mapping section
      html +=     '<div id="det-mc-' + esc(tid) + '" class="border-t border-base-200 px-5 pb-5 pt-4"' +
                    ' style="display:' + (isOpen ? '' : 'none') + ';">' +
                  '</div>';

      html +=   '</div>'; // card-body
      html += '</div>'; // card
    });

    // Stap toevoegen
    if (integrationId) {
      var addModels = Array.isArray(window.FSV2.S.odooModelsCache) ? window.FSV2.S.odooModelsCache : window.FSV2.DEFAULT_ODOO_MODELS;
      var modelOpts = addModels.map(function (m) {
        return '<option value="' + esc(m.name) + '">' + esc(m.label || m.name) + ' (' + esc(m.name) + ')</option>';
      }).join('');
      html +=
        '<div class="flex flex-col items-center my-2 select-none" aria-hidden="true">' +
          '<div class="w-px h-5 bg-base-content/20"></div>' +
          '<i data-lucide="chevron-down" class="w-4 h-4 text-base-content/30"></i>' +
        '</div>' +
        '<div class="flex items-center justify-center gap-2">' +
          '<select id="addTargetModelSelect-' + esc(String(integrationId)) + '"' +
            ' class="select select-bordered select-sm text-sm">' +
            modelOpts +
          '</select>' +
          '<button type="button" class="btn btn-outline btn-sm gap-1.5"' +
            ' data-action="add-target" data-integrationid="' + esc(String(integrationId)) + '">' +
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
        if (m.source_type === 'form') { formMappingsByField[m.source_value] = m; }
        else                          { initialExtraRows.push(m); }
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
            isIdentifier:  !!m.is_identifier,
            isUpdateField: m.is_update_field !== false,
          };
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

      window.FSV2.MappingTable.render('det-mc-' + tid, {
        flatFields:           flatFields,
        topLevelFields:       rawFf,
        odooCache:            odooCache,
        odooLoaded:           odooLoaded,
        odooModel:            model,
        existingFormMappings: formMappingsByField,
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

      // Per-step save button (appended after MappingTable content)
      var mcEl = document.getElementById('det-mc-' + tid);
      if (mcEl) {
        var saveDiv = document.createElement('div');
        saveDiv.className = 'mt-4 pt-4 border-t border-base-200 flex justify-end';
        saveDiv.innerHTML =
          '<button type="button" class="btn btn-primary btn-sm gap-1.5"' +
          ' data-action="save-step-mappings" data-target-id="' + esc(tid) + '">' +
          '<i data-lucide="save" class="w-4 h-4"></i>' +
          (isSingle ? ' Koppelingen opslaan' : ' Stap ' + (idx + 1) + ' opslaan') +
          '</button>';
        mcEl.appendChild(saveDiv);
      }
    });
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

    var identifierFields = [];
    var targets = (S().detail && S().detail.targets) || [];
    targets.forEach(function (t) {
      var mappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[t.id]) || [];
      mappings.forEach(function (m) {
        if (m.is_identifier && m.source_type === 'form') {
          var alreadyAdded = identifierFields.some(function (f) { return f.source_value === m.source_value; });
          if (!alreadyAdded) identifierFields.push({ source_value: String(m.source_value), odoo_field: m.odoo_field });
        }
      });
    });

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
      try { return JSON.parse(sub.source_payload || '{}'); } catch (e) { return {}; }
    }
    function submitterInfo(sub) {
      if (!identifierFields.length) return '';
      var payload = parsePayload(sub);
      var parts = identifierFields.map(function (f) {
        var val = lookupPayloadValue(payload, f.source_value);
        return val ? '<span class="font-medium">' + esc(val) + '</span>' : '';
      }).filter(Boolean);
      return parts.length ? parts.join(' &middot; ') : '<span class="text-base-content/30">onbekend</span>';
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
    var ordered   = [];
    originals.forEach(function (orig) {
      ordered.push({ sub: orig, isReplay: false });
      replays.filter(function (r) { return r.replay_of_submission_id === orig.id; })
        .forEach(function (r) { ordered.push({ sub: r, isReplay: true }); });
    });
    replays.filter(function (r) { return !originals.find(function (o) { return o.id === r.replay_of_submission_id; }); })
      .forEach(function (r) { ordered.push({ sub: r, isReplay: true }); });

    var showIndiener = identifierFields.length > 0;

    // Builds the expandable timeline row for a submission.
    var skipLabels = {
      pipeline_abort:                 'Overgeslagen \u2014 eerdere stap mislukt',
      dependency_missing:             'Overgeslagen \u2014 vereiste uitvoer ontbreekt',
      retry_skip_already_successful:  'Niet opnieuw uitgevoerd (replay)',
    };
    var actionColors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error' };
    var actionLabels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt' };
    var colCount = showIndiener ? 6 : 5;

    function buildTimelineRow(sub) {
      var shortId = window.FSV2.shortId(sub.id);
      var ctx;
      try { ctx = JSON.parse(sub.resolved_context || '{}'); } catch (e2) { ctx = {}; }
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
      var timelineHtml = actions.length
        ? actions.map(function (a) {
            var sl = (a.skipped_reason && skipLabels[a.skipped_reason]) || '';
            var isReplaySkip = a.skipped_reason === 'retry_skip_already_successful';
            var successLabel  = (isReplaySub && (a.action === 'created' || a.action === 'updated')) ? 'Geslaagd bij replay' : (actionLabels[a.action] || esc(a.action));
            return '<div class="flex flex-wrap items-center gap-1.5 text-xs py-1 border-b border-base-100/50 last:border-0">' +
              (a.execution_order != null ? '<span class="badge badge-outline badge-xs font-mono w-5 text-center shrink-0">' + esc(String(a.execution_order)) + '</span>' : '') +
              (a.label ? '<span class="font-medium">' + esc(a.label) + '</span>' : '') +
              '<span class="font-mono text-base-content/40">' + esc(a.model || '-') + '</span>' +
              '<span class="badge badge-xs ' + (actionColors[a.action] || 'badge-ghost') + '">' + successLabel + '</span>' +
              (a.record_id ? '<span class="font-mono text-base-content/30">#' + esc(String(a.record_id)) + '</span>' : '') +
              (sl ? '<span class="text-xs ' + (isReplaySkip ? 'text-base-content/30 italic' : 'text-warning') + '">' + esc(sl) + '</span>' : '') +
            '</div>';
          }).join('')
        : '<span class="text-xs text-base-content/40 italic">Geen stapdetails beschikbaar.</span>';
      return '<tr class="sub-timeline-row" id="stl-' + esc(shortId) + '" style="display:none">' +
        '<td colspan="' + colCount + '" class="bg-base-200/40 px-4 py-3">' + payloadHtml + timelineHtml + '</td>' +
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
      '<div class="overflow-x-auto">' +
        '<table class="table table-xs">' +
          '<thead><tr><th>ID</th>' + (showIndiener ? '<th>Indiener</th>' : '') + '<th>Status</th><th>Fout</th><th>Aangemaakt</th><th>Actie</th></tr></thead>' +
          '<tbody>' +
          ordered.map(function (item) {
            var sub         = item.sub;
            var isReplay    = item.isReplay;
            var shortId     = window.FSV2.shortId(sub.id);
            var replayAllowed = !isReplay && ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(sub.status || ''));
            var errorCell   = sub.last_error
              ? '<span class="text-xs text-error/80 font-mono" title="' + esc(sub.last_error) + '">' +
                  esc(sub.last_error.slice(0, 60)) + (sub.last_error.length > 60 ? '\u2026' : '') +
                '</span>'
              : '<span class="text-base-content/30">&mdash;</span>';
            var mainRow =
              '<tr class="sub-row cursor-pointer' + (isReplay ? ' bg-success/5' : '') + '" data-sub-id="' + esc(shortId) + '">' +
                '<td class="font-mono text-xs">' +
                  (isReplay ? '<span class="badge badge-xs badge-accent mr-1">\u21b3 Replay</span>' : '') +
                  esc(shortId) +
                '</td>' +
                (showIndiener ? '<td class="text-xs">' + submitterInfo(sub) + '</td>' : '') +
                '<td>' + statusBadge(sub.status) + actionBadge(sub) + '</td>' +
                '<td class="max-w-xs truncate">' + errorCell + '</td>' +
                '<td class="text-xs whitespace-nowrap">' + esc(window.FSV2.fmt(sub.created_at)) + '</td>' +
                '<td>' + (replayAllowed
                  ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '">Replay</button>'
                  : '') + '</td>' +
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

    var integration = S().detail && S().detail.integration;
    var siteKey     = integration && integration.site_key;

    if (!siteKey) {
      el.innerHTML =
        '<p class="text-sm text-base-content/60 py-2">' +
          '<i data-lucide="info" class="w-4 h-4 inline mr-1 -mt-0.5"></i>' +
          'Site-sleutel niet opgeslagen voor deze integratie &mdash; veldoverzicht niet beschikbaar. ' +
          'Nieuwe integraties bewaren de site-sleutel automatisch.' +
        '</p>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }

    if (S().detailFormFields === null) {
      el.innerHTML = '<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">' +
        '<span class="loading loading-spinner loading-xs"></span> Formuliervelden worden opgehaald\u2026</div>';
      return;
    }
    if (S().detailFormFields === 'loading') {
      el.innerHTML = '<div class="flex items-center gap-2 py-2 text-sm text-base-content/60">' +
        '<span class="loading loading-spinner loading-xs"></span> Bezig met ophalen\u2026</div>';
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

    var fields = S().detailFormFields;
    if (!fields.length) {
      el.innerHTML = '<p class="text-sm text-base-content/60 py-2">Geen velden gevonden voor dit formulier.</p>';
      return;
    }

    el.innerHTML =
      '<div class="overflow-x-auto">' +
        '<table class="table table-xs">' +
          '<thead><tr>' +
            '<th>Veld-ID</th><th>Label</th><th>Type</th><th>Gekoppeld aan Odoo</th>' +
          '</tr></thead>' +
          '<tbody>' +
          fields.map(function (f) {
            var fid     = String(f.field_id || '');
            var coupled = mappedLookup[fid];
            var badge   = coupled && coupled.length
              ? coupled.map(function (of_) {
                  return '<span class="badge badge-success badge-xs font-mono">' + esc(of_) + '</span>';
                }).join(' ')
              : '<span class="text-base-content/30 text-xs">&mdash;</span>';
            return '<tr>' +
              '<td class="font-mono text-xs">' + esc(fid) + '</td>' +
              '<td class="text-sm">' + esc(f.label || f.field_id || '-') + '</td>' +
              '<td><span class="badge badge-outline badge-xs">' + esc(f.type || '-') + '</span></td>' +
              '<td>' + badge + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
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

      if (!S().webhookConfig) {
        window.FSV2.api('/webhook-config').then(function (r) {
          S().webhookConfig = r.data || null;
          if (S().activeId === id) renderDetail();
        }).catch(function () {});
      }

      var detailIntegration = S().detail && S().detail.integration;
      var detailSiteKey     = detailIntegration && detailIntegration.site_key;
      var detailFormId      = detailIntegration && detailIntegration.forminator_form_id;
      if (detailSiteKey && detailFormId) {
        fetchDetailFormFields(detailSiteKey, detailFormId).catch(function () {});
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

    var rawFf = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var flatFields = [];
    rawFf.forEach(function (f) {
      if (!window.FSV2.SKIP_TYPES.includes(f.type)) flatFields.push(f);
      if (Array.isArray(f.sub_fields)) {
        f.sub_fields.forEach(function (sf) {
          if (!window.FSV2.SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
        });
      }
    });

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
        newMappings.push({ odoo_field: odooField, source_type: 'form', source_value: fid,
          is_identifier: isIdentifier, is_update_field: isUpdateField, is_required: false, order_index: orderIdx++ });
      });

      // Extra / chain rows (keyed per target).
      var extraRows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid]) || [];
      extraRows.forEach(function (em, idx) {
        var tname = 'det-extra-' + tid + '-' + idx;
        var inpEl = document.getElementById('det-inp-' + tname);
        var val   = inpEl ? (inpEl.value || '').trim() : (em.staticValue || '');
        if (!val && em.sourceType !== 'previous_step_output') return;
        var sourceType  = em.sourceType === 'previous_step_output'
          ? 'previous_step_output'
          : (/\{[^}]+\}/.test(val) ? 'template' : 'static');
        var sourceValue = em.sourceType === 'previous_step_output' ? (em.staticValue || val) : val;
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

    var rawFf = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var flatFields = [];
    rawFf.forEach(function (f) {
      if (!window.FSV2.SKIP_TYPES.includes(f.type)) flatFields.push(f);
      if (Array.isArray(f.sub_fields)) f.sub_fields.forEach(function (sf) {
        if (!window.FSV2.SKIP_TYPES.includes(sf.type)) flatFields.push(sf);
      });
    });

    var newMappings = [];
    var orderIdx    = 0;

    flatFields.forEach(function (ff) {
      var fid       = String(ff.field_id);
      var selEl     = mcEl.querySelector('[name="det-ff-' + tid + '-odoo-' + fid + '"]');
      var odooField = selEl ? (selEl.value || '') : '';
      if (!odooField) return;
      var idChk  = Array.from(mcEl.querySelectorAll('input.detail-ff-id-check')).find(function (el) {
        return el.getAttribute('name') === 'det-' + tid + '-identifier-' + fid;
      });
      var updChk = Array.from(mcEl.querySelectorAll('input.detail-ff-upd-check')).find(function (el) {
        return el.getAttribute('name') === 'det-' + tid + '-update-' + fid;
      });
      newMappings.push({
        odoo_field: odooField, source_type: 'form', source_value: fid,
        is_identifier: idChk ? idChk.checked : false,
        is_update_field: updChk ? updChk.checked : true,
        is_required: false, order_index: orderIdx++,
      });
    });

    var extraRows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid]) || [];
    extraRows.forEach(function (em, i) {
      var tname = 'det-extra-' + tid + '-' + i;
      var inpEl = document.getElementById('det-inp-' + tname);
      var val   = inpEl ? (inpEl.value || '').trim() : (em.staticValue || '');
      if (!val && em.sourceType !== 'previous_step_output') return;
      var sourceType  = em.sourceType === 'previous_step_output' ? 'previous_step_output'
                      : (/\{[^}]+\}/.test(val) ? 'template' : 'static');
      var sourceValue = em.sourceType === 'previous_step_output' ? (em.staticValue || val) : val;
      if (!sourceValue) return;
      // Normalize legacy chain source_value format before validating/saving
      if (em.sourceType === 'previous_step_output') {
        var legFix = String(sourceValue).match(/^step_(\d+)_id$/);
        if (legFix) sourceValue = 'step.' + legFix[1] + '.record_id';
      }
      // Skip chain rows still not matching the required pattern after normalization
      if (em.sourceType === 'previous_step_output' && !/^step\.[^.]+\.record_id$/.test(sourceValue)) {
        console.warn('[FSV2] chain row skipped: invalid source_value', sourceValue, em);
        return;
      }
      var extraIdChk  = mcEl.querySelector('input[name="det-extra-' + tid + '-identifier-' + i + '"]');
      var extraUpdChk = mcEl.querySelector('input[name="det-extra-' + tid + '-update-' + i + '"]');
      var chainReqChk = mcEl.querySelector('input[name="det-extra-' + tid + '-chain-req-' + i + '"]');
      var isRequired  = em.sourceType === 'previous_step_output'
        ? (chainReqChk ? chainReqChk.checked : (em.isRequired || false))
        : false;
      newMappings.push({
        odoo_field: em.odooField, source_type: sourceType, source_value: sourceValue,
        is_identifier: em.sourceType === 'previous_step_output' ? false : (extraIdChk ? extraIdChk.checked : false),
        is_update_field: em.sourceType === 'previous_step_output' ? true : (extraUpdChk ? extraUpdChk.checked : true),
        is_required: isRequired, order_index: orderIdx++,
      });
    });

    await window.FSV2.api('/targets/' + tid + '/mappings', { method: 'DELETE' });
    await Promise.all(newMappings.map(function (m) {
      return window.FSV2.api('/targets/' + tid + '/mappings', { method: 'POST', body: JSON.stringify(m) });
    }));

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

  async function fetchDetailFormFields(sk, fid) {
    S().detailFormFields = 'loading';
    renderDetailFormFields();
    renderDetailMappings();
    try {
      var ffBody  = await window.FSV2.api('/forminator/forms?site=' + encodeURIComponent(sk));
      var ffForms = ffBody.data || [];
      var ffMatch = ffForms.find(function (f) { return String(f.form_id) === String(fid); });
      S().detailFormFields = ffMatch && ffMatch.fields ? ffMatch.fields : [];
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

  async function handleDeleteTarget(targetId, integrationId) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    if (targets.length <= 1) {
      window.FSV2.showAlert('Kan de enige stap niet verwijderen. Verwijder de volledige integratie als je deze wilt wissen.', 'warning');
      return;
    }
    if (!confirm('Weet je zeker dat je deze stap wilt verwijderen? Alle veldkoppelingen van deze stap gaan ook verloren.')) return;
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
    S().detail._extraRowsByTarget[tid].push({
      odooField:   odooField,
      odooLabel:   odooLabel || odooField,
      sourceType:  'previous_step_output',
      staticValue: 'step.' + stepOrder + '.record_id',
      isRequired:  true,
    });
    if (integrationId) getPipelineOpen(integrationId)[String(tid)] = true;
    renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    window.FSV2.showAlert('Koppeling toegevoegd. Sla de stap op om te bevestigen.', 'success');
  }

  Object.assign(window.FSV2, {
    renderDetail:            renderDetail,
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
    handleDeleteTarget:      handleDeleteTarget,
    handleSaveStepMappings:  handleSaveStepMappings,
    handleReorderTarget:     handleReorderTarget,
    toggleStepOpen:          toggleStepOpen,
    applyChainSuggestion:    applyChainSuggestion,
    handleToggleIdentifier:  handleToggleIdentifier,
    fetchDetailFormFields:   fetchDetailFormFields,
    handleDeleteIntegration: handleDeleteIntegration,
    handleReplay:            handleReplay,
  });

}());
