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

  /**
   * Bouw { topLevel, flatFields } vanuit de ruwe WP-velden (S().detailFormFields).
   *
   * topLevel   = ouder-velden + gewone velden (geen composite-kinderen)
   * flatFields = alle mappable velden: ouders + kinderen + gewone velden
   *
   * Composite ouders (is_composite: true) worden opgenomen met:
   *   is_composite: true, composite_children: [field_id, ...]
   * Composite kinderen worden opgenomen met:
   *   parent_field_id: ouder-field_id
   *
   * In de MappingTable: kinderen (parent_field_id aanwezig) worden als inspringende
   * sub-rijen getoond. De ouder wordt als top-rij getoond en samenvoegt bij gebruik
   * alle kinderwaarden met een spatie (afgehandeld in de worker).
   */
  function buildDetailFlatFields(rawInput) {
    var SKIP = window.FSV2.SKIP_TYPES;
    var topLevel   = [];
    var flatFields = [];

    (Array.isArray(rawInput) ? rawInput : []).forEach(function (f) {
      var type = String(f.type || '');
      if (SKIP.includes(type)) return;

      if (f.is_composite === true) {
        var children = Array.isArray(f.children) ? f.children : [];
        if (children.length === 0) return;

        // Composite ouder: mappable als gecombineerde waarde (worker voegt samen met spatie)
        var parentEntry = {
          field_id:           String(f.field_id),
          label:              String(f.label || f.field_id),
          type:               type,
          required:           !!f.required,
          is_composite:       true,
          composite_children: children.map(function (c) { return String(c.field_id); }),
        };
        topLevel.push(parentEntry);
        flatFields.push(parentEntry);

        // Kinderen: individueel mappable als sub-veld (inspringend in de tabel)
        children.forEach(function (child) {
          var childType = String(child.type || type);
          if (SKIP.includes(childType)) return;
          var childEntry = {
            field_id:        String(child.field_id),
            label:           String(child.label || child.field_id),
            type:            childType,
            required:        !!child.required,
            parent_field_id: String(f.field_id),
          };
          // Keuzemogelijkheden doorgeven als aanwezig
          if (Array.isArray(child.choices) && child.choices.length > 0) childEntry.choices = child.choices;
          flatFields.push(childEntry);
        });

      } else {
        var plain = {
          field_id: String(f.field_id),
          label:    String(f.label || f.field_id),
          type:     type,
          required: !!f.required,
        };
        // Keuzemogelijkheden doorgeven voor radio/checkbox/select
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
              '<div class="min-w-0 flex-1">' +
                '<div class="flex items-center gap-2 mb-1 min-w-0">' +
                  '<h2 id="detailIntegrationTitle" class="text-2xl font-bold truncate">' + esc(integration.name || 'Integratie') + '</h2>' +
                  '<button type="button" id="btnRenameIntegration" class="btn btn-xs btn-ghost shrink-0" title="Naam wijzigen">' +
                    '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>' +
                  '</button>' +
                '</div>' +
                '<p class="text-sm text-base-content/60">Formulier: <span class="font-mono">' + esc(integration.forminator_form_id || '\u2014') + '</span></p>' +
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
      if (target.operation_type !== 'chatter_message') {
        html +=               '<span class="font-mono">' + esc(target.odoo_model) + '</span>';
        html +=               '<span>·</span>';
      }
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

        // Inject missing required default_fields as empty template rows
        var modelCfgForReq = window.FSV2.getModelCfg(model);
        if (Array.isArray(modelCfgForReq.default_fields)) {
          var allMappedFields = targetMappings.map(function (m) { return m.odoo_field; });
          modelCfgForReq.default_fields.forEach(function (df) {
            if (!df.required) return;
            if (allMappedFields.includes(df.name)) return;
            if (S().detail._extraRowsByTarget[tid].some(function (r) { return r.odooField === df.name; })) return;
            var meta = odooCache.find(function (f) { return f.name === df.name; });
            S().detail._extraRowsByTarget[tid].push({
              odooField:     df.name,
              odooLabel:     (meta && meta.label) || df.label || df.name,
              staticValue:   '',
              sourceType:    'template',
              isRequired:    true,
              isIdentifier:  false,
              isUpdateField: true,
            });
          });
        }
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
        return;
      }
      // create_activity: render activity composer instead of MappingTable
      if (target.operation_type === 'create_activity') {
        renderActivityComposer(target, tid, sortedTargets);
        return;
      }

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
    var actionColors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error', posted: 'badge-success' };
    var actionLabels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt', posted: '\uD83D\uDCAC notitie geplaatst' };
    var colCount = showIndiener ? 6 : 5;

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
            var sl           = (a.skipped_reason && skipLabels[a.skipped_reason]) || '';
            var isReplaySkip = a.skipped_reason === 'retry_skip_already_successful';
            var stepNum      = a.execution_order != null ? (Number(a.execution_order) + 1) : null;
            var stepLabel    = (isReplaySub && (a.action === 'created' || a.action === 'updated'))
              ? 'Geslaagd bij replay'
              : (a.action ? (actionLabels[a.action] || esc(a.action)) : '<span class="italic opacity-50">niet uitgevoerd</span>');
            var stepColor    = a.action ? (actionColors[a.action] || 'badge-ghost') : 'badge-neutral';
            return '<div class="flex flex-wrap items-start gap-1.5 text-xs py-1.5 border-b border-base-100/50 last:border-0">' +
              (stepNum != null ? '<span class="badge badge-outline badge-xs font-mono w-5 text-center shrink-0 mt-0.5">' + esc(String(stepNum)) + '</span>' : '') +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<div class="flex flex-wrap items-center gap-1.5">' +
                  (a.label ? '<span class="font-medium">' + esc(a.label) + '</span>' : '') +
                  '<span class="font-mono text-base-content/40">' + esc(a.model || '-') + '</span>' +
                  '<span class="badge badge-xs ' + stepColor + '">' + stepLabel + '</span>' +
                  (a.record_id ? '<span class="font-mono text-base-content/30">#' + esc(String(a.record_id)) + '</span>' : '') +
                  (sl ? '<span class="text-xs ' + (isReplaySkip ? 'text-base-content/30 italic' : 'text-warning') + '">' + esc(sl) + '</span>' : '') +
                '</div>' +
                (a.error_detail ? '<span class="text-error/70 font-mono break-all">' + esc(a.error_detail) + '</span>' : '') +
              '</div>' +
            '</div>';
          }).join('')
        : '<span class="text-xs text-base-content/40 italic">Geen stapdetails beschikbaar.</span>';

      var errorHtml = (isFailed && sub.last_error)
        ? '<div class="mt-2 p-2 rounded bg-error/10 border border-error/20 text-xs text-error font-mono break-all">' +
            '<span class="font-semibold mr-1">Fout:</span>' + esc(sub.last_error) +
          '</div>'
        : '';

      return '<tr class="sub-timeline-row" id="stl-' + esc(shortId) + '"' + (isFailed ? '' : ' style="display:none"') + '>' +
        '<td colspan="' + colCount + '" class="bg-base-200/40 px-4 py-3">' + payloadHtml + timelineHtml + errorHtml + '</td>' +
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
      el.innerHTML = '<p class="text-sm text-base-content/60 py-2">Geen velden gevonden voor dit formulier. Klik “Verversen” in de sectieheader om opnieuw te laden.</p>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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

  // ── Fase 1: Render 4 intent-kaarten in #addTargetTypeCards ─────────────────
  function renderAddTargetDialog() {
    var container = document.getElementById('addTargetTypeCards');
    if (!container) return;
    var dlg = document.getElementById('addTargetDialog');
    var sel = dlg ? dlg.dataset.selectedType : '';
    var modelRow = document.getElementById('addTargetModelRow');

    var TYPES = [
      { opType: 'upsert',          icon: 'git-merge',      label: 'Upsert',             desc: 'Aanmaken of bijwerken' },
      { opType: 'create',          icon: 'plus-circle',    label: 'Aanmaken',           desc: 'Altijd nieuw record aanmaken' },
      { opType: 'update_only',     icon: 'pencil',         label: 'Bijwerken',          desc: 'Alleen bestaand record bijwerken' },
      { opType: 'chatter_message', icon: 'message-square', label: 'Chatter-bericht',    desc: 'Bericht in de chatter plaatsen' },
      { opType: 'create_activity', icon: 'calendar-check', label: 'Activiteit',         desc: 'Taak inplannen op een record' },
    ];

    container.innerHTML = TYPES.map(function (t) {
      var isActive = sel === t.opType;
      return (
        '<button type="button"' +
          ' class="btn btn-outline w-full justify-start gap-3' + (isActive ? ' btn-primary' : '') + '"' +
          ' data-action="select-target-type" data-op-type="' + t.opType + '">' +
          '<i data-lucide="' + t.icon + '" class="w-5 h-5 shrink-0"></i>' +
          '<span class="text-left"><span class="font-semibold">' + t.label + '</span>' +
            '<span class="block text-xs font-normal opacity-70">' + t.desc + '</span></span>' +
        '</button>'
      );
    }).join('');

    // show/hide model picker
    if (modelRow) {
      modelRow.style.display = (sel && sel !== 'chatter_message' && sel !== 'create_activity') ? '' : 'none';
    }

    // unlock confirm button for chatter_message and create_activity immediately
    var confirmBtn = document.getElementById('confirmAddTargetBtn');
    if (confirmBtn) {
      var picker = document.getElementById('addTargetModelPicker');
      confirmBtn.disabled = !sel || (sel !== 'chatter_message' && sel !== 'create_activity' && !(picker && picker.value));
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ nodes: [container] });
    }
  }

  // ── Fase 1: Handle confirmed "Stap toevoegen" from intent-picker ───────────
  async function handleAddTargetWithType(integrationId, opType) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var maxOrder = targets.reduce(function (max, t) {
      return Math.max(max, getTargetOrder(t, 0));
    }, 0);

    if (opType === 'create_activity') {
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

    if (opType === 'chatter_message') {
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

    var picker  = document.getElementById('addTargetModelPicker');
    var chosenModel = picker ? picker.value : '';
    if (!chosenModel) {
      window.FSV2.showAlert('Kies een model voor de nieuwe stap.', 'error');
      return;
    }

    var actionCfg = window.FSV2.getModelCfg ? (window.FSV2.getModelCfg(chosenModel) || {}) : {};

    await window.FSV2.api('/integrations/' + integrationId + '/targets', {
      method: 'POST',
      body: JSON.stringify({
        odoo_model:      chosenModel,
        identifier_type: actionCfg.identifier_type || 'mapped_fields',
        update_policy:   actionCfg.update_policy   || 'always_overwrite',
        operation_type:  opType,
        execution_order: maxOrder + 1,
      }),
    });
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

      // Collect value_map for choice fields
      var vmapInputs = mcEl.querySelectorAll('[name^="det-ff-' + tid + '-vmapv-' + fid + '-"]');
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

      newMappings.push({
        odoo_field: odooField, source_type: 'form', source_value: fid,
        is_identifier: idChk ? idChk.checked : false,
        is_update_field: updChk ? updChk.checked : true,
        is_required: false, order_index: orderIdx++,
        value_map: valueMap,
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
      var chainIdChk  = mcEl.querySelector('input[name="det-extra-' + tid + '-chain-id-'  + i + '"]');
      var isRequired  = em.sourceType === 'previous_step_output'
        ? (chainReqChk ? chainReqChk.checked : (em.isRequired || false))
        : false;
      newMappings.push({
        odoo_field: em.odooField, source_type: sourceType, source_value: sourceValue,
        is_identifier: em.sourceType === 'previous_step_output' ? (chainIdChk ? chainIdChk.checked : true) : (extraIdChk ? extraIdChk.checked : false),
        is_update_field: em.sourceType === 'previous_step_output' ? true : (extraUpdChk ? extraUpdChk.checked : true),
        is_required: isRequired, order_index: orderIdx++,
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

  async function handleRefreshFormFields() {
    var integration = S().detail && S().detail.integration;
    var sk  = integration && integration.site_key;
    var fid = integration && integration.forminator_form_id;
    if (!sk || !fid) return;
    await fetchDetailFormFields(sk, fid);
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

    // Step selector
    if (!compatibleSteps.length) {
      html += '<div class="alert alert-warning text-sm mb-4">' +
        '<i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>' +
        '<span>Let op: er is nog geen voorgaande stap beschikbaar. ' +
        'Voeg eerst een stap toe die een record aanmaakt of bijwerkt.</span>' +
        '</div>';
    } else {
      html += '<div class="form-control mb-3">' +
        '<label class="label pb-1"><span class="label-text text-sm font-medium">Koppel aan stap</span></label>' +
        '<select class="select select-bordered select-sm" id="activityStepSelect-' + esc(tid) + '">';
      compatibleSteps.forEach(function (t) {
        var order = getTargetOrder(t, 0);
        var lbl   = t.label || modelLabel(t.odoo_model);
        var sel   = (currentStepOrder !== null && String(currentStepOrder) === String(order)) ? ' selected' : '';
        html += '<option value="' + esc(String(order)) + '"' + sel + '>' + esc(lbl) + ' (stap ' + (order + 1) + ')</option>';
      });
      html += '</select>' +
        '<label class="label pt-0.5"><span class="label-text-alt text-base-content/50">Record-ID van deze stap wordt als activiteitsontvanger gebruikt.</span></label>' +
        '</div>';
    }

    // Activity type dropdown (populated async)
    html += '<div class="form-control mb-3">' +
      '<label class="label pb-1"><span class="label-text text-sm font-medium">Activiteitstype</span></label>' +
      '<select class="select select-bordered select-sm" id="activityTypeSelect-' + esc(tid) + '">' +
        '<option value="">Laden\u2026</option>' +
      '</select>' +
      '</div>';

    // Deadline in working days
    html += '<div class="form-control mb-3">' +
      '<label class="label pb-1">' +
        '<span class="label-text text-sm font-medium">Deadline (werkdagen vanaf vandaag)</span>' +
        '<span class="label-text-alt text-base-content/50">Zaterdag &amp; zondag worden overgeslagen</span>' +
      '</label>' +
      '<input type="number" min="0" class="input input-bordered input-sm w-32"' +
        ' id="activityDeadlineOffset-' + esc(tid) + '"' +
        ' value="' + esc(String(target.activity_deadline_offset != null ? target.activity_deadline_offset : 1)) + '">' +
      '</div>';

    // Summary template
    html += '<div class="form-control mb-3">' +
      '<label class="label pb-1">' +
        '<span class="label-text text-sm font-medium">Samenvatting template</span>' +
        '<span class="label-text-alt text-base-content/50">Gebruik {{veldnaam}} voor formulierwaarden</span>' +
      '</label>' +
      '<input type="text" class="input input-bordered input-sm"' +
        ' id="activitySummaryTemplate-' + esc(tid) + '"' +
        ' value="' + esc(target.activity_summary_template || '') + '"' +
        ' placeholder="Nieuwe aanvraag van {{name}}">' +
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
    var loadTypes = window.FSV2.api('/activity-types').then(function (res) {
      var sel = document.getElementById('activityTypeSelect-' + tid);
      if (!sel) return;
      sel.innerHTML = '<option value="">\u2014 Geen type \u2014</option>' +
        (res.data || []).map(function (t) {
          return '<option value="' + esc(String(t.id)) + '"' +
            (target.activity_type_id == t.id ? ' selected' : '') + '>' +
            esc(t.name) + '</option>';
        }).join('');
    });

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
    handleAddTargetWithType: handleAddTargetWithType,
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
    handleActivityUserMode:  handleActivityUserMode,
    handleSaveActivityComposer: handleSaveActivityComposer,
    handleDeleteTarget:      handleDeleteTarget,
    handleSaveStepMappings:  handleSaveStepMappings,
    handleReorderTarget:     handleReorderTarget,
    toggleStepOpen:          toggleStepOpen,
    applyChainSuggestion:    applyChainSuggestion,
    handleToggleIdentifier:  handleToggleIdentifier,
    fetchDetailFormFields:   fetchDetailFormFields,
    handleRefreshFormFields: handleRefreshFormFields,
    handleDeleteIntegration: handleDeleteIntegration,
    handleReplay:            handleReplay,
  });

}());
