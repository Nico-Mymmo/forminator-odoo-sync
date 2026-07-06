/**
 * Forminator Sync V2 -- Detail -- Koppeling (mapping) tab
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

  var POLICY_LABELS = {
    'always_overwrite': 'Bijwerken of aanmaken',
    'upsert':           'Bijwerken of aanmaken',
    'create_only':      'Alleen aanmaken',
    'update_only':      'Alleen bijwerken',
  };

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
      return window.FSV2.getTargetOrder(a, 0) - window.FSV2.getTargetOrder(b, 0);
    });

    if (!S().detail._extraRowsByTarget) S().detail._extraRowsByTarget = {};

    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    var pipelineOpen  = window.FSV2.getPipelineOpen(integrationId);
    var isSingle      = sortedTargets.length === 1;

    var _ffr       = window.FSV2.buildDetailFlatFields(S().detailFormFields);
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

      var stepName   = target.label || window.FSV2.modelLabel(target.odoo_model);
      var opLabels  = { upsert: 'Zoeken \u2014 bijwerken of aanmaken', update_only: 'Alleen bijwerken', create: 'Altijd nieuw aanmaken' };
      var opTypeLbl  = opLabels[target.operation_type] || opLabels.upsert;
      if (target.operation_type === 'chatter_message') {
        var _chLbl = target.odoo_model ? window.FSV2.modelLabel(target.odoo_model) : '';
        opTypeLbl = _chLbl ? ('Notitie bij ' + _chLbl) : 'Notitie in chatter';
        if (!target.label) stepName = 'Notitie';
      }
      if (target.operation_type === 'create_activity') {
        opTypeLbl = 'Activiteit aanmaken';
        if (!target.label) stepName = 'Activiteit';
      }
      if (target.operation_type === 'mailing_list') {
        var _mlCfgHdr = window.FSV2.parseMailingListConfig(target);
        var _mlActionLblHdr = _mlCfgHdr.action === 'remove' ? 'Verwijderen' : 'Toevoegen';
        var _mlModeLblHdr   = _mlCfgHdr.update_mode === 'update_only' ? 'Alleen bijwerken' : 'Bijwerken of aanmaken';
        opTypeLbl = _mlActionLblHdr + ' — ' + _mlModeLblHdr;
        if (!target.label) stepName = 'Mailinglijst';
      }
      var policyLbl  = POLICY_LABELS[target.update_policy] || esc(target.update_policy || '');
      var preceding  = sortedTargets.slice(0, idx);
      var suggestions = (isSingle || target.operation_type === 'chatter_message' || target.operation_type === 'create_activity') ? [] : window.FSV2.computeChainSuggestions(target, preceding);

      // Chain dependency badges from saved state (prefer in-memory edits, fall back to DB state)
      var chainDeps = [];
      if (!isSingle) {
        var normalizeSv = function (sv) {
          var leg = String(sv || '').match(/^step_(\d+)_id$/);
          return leg ? 'step.' + leg[1] + '.record_id' : (sv || '');
        };
        // Activiteit slaat koppeling op in activity_res_id_source, niet als mapping
        var _actResIdSrc = target.operation_type === 'create_activity' ? (target.activity_res_id_source || '') : '';
        var chainSourceRows = (S().detail._extraRowsByTarget && S().detail._extraRowsByTarget[tid])
          ? S().detail._extraRowsByTarget[tid].map(function (r) { return normalizeSv(r.staticValue); })
          : ((S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [])
              .filter(function (m) { return m.source_type === 'previous_step_output'; })
              .map(function (m) { return normalizeSv(m.source_value); });
        // Voeg activity_res_id_source toe als die niet al via mappings is opgenomen
        if (_actResIdSrc && !chainSourceRows.includes(_actResIdSrc)) {
          chainSourceRows = chainSourceRows.concat([_actResIdSrc]);
        }
        chainSourceRows.forEach(function (sourceVal) {
          var m = sourceVal.match(/^step\.([^.]+)\.record_id$/);
          if (!m) return;
          var ref = m[1]; var refN = Number(ref);
          var prevT = isNaN(refN)
            ? sortedTargets.find(function (t) { return t.label === ref; })
            : sortedTargets.find(function (t) { return window.FSV2.getTargetOrder(t, 0) === refN; });
          if (prevT) {
            var pIdx = sortedTargets.indexOf(prevT);
            if (pIdx >= 0 && !chainDeps.find(function (d) { return d.stepNum === pIdx + 1; }))
              chainDeps.push({ stepNum: pIdx + 1, stepName: prevT.label || window.FSV2.modelLabel(prevT.odoo_model) });
          }
        });
      }

       var _opIcons = {
        upsert:           'refresh-cw',
        update_only:      'pencil',
        create:           'plus-circle',
        chatter_message:  'message-circle',
        create_activity:  'calendar',
        mailing_list:     'mail',
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
      html +=     '<div class="px-5 py-4 cursor-pointer select-none" data-action="toggle-step-open" data-target-id="' + esc(tid) + '">' ;
      html +=       '<div class="flex items-start justify-between gap-2">';

      // Left: badge + name + meta
      html +=         '<div class="flex items-start gap-3 min-w-0 flex-1">';
      if (!isSingle) {
        html +=           '<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral text-neutral-content text-sm font-bold shrink-0">' + (idx + 1) + '</span>';
      }
      var actionCfg  = window.FSV2.getModelCfg ? (window.FSV2.getModelCfg(target.odoo_model) || {}) : {};
      var _cardIcon  = target.operation_type === 'chatter_message' ? 'pencil-line'
                     : target.operation_type === 'create_activity'  ? 'user'
                     : (actionCfg.icon || null);
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

      // Right: status indicators → safe actions → reorder → [separator] → delete → chevron
      html +=         '<div class="flex items-center gap-0.5 shrink-0 ml-2">';

      // Status indicators (informational only)
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

      if (!isSingle) {
        html += '<div class="w-px h-4 bg-base-content/10 mx-1.5"></div>';

        // Copy (safe — no data loss)
        html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0 opacity-50 hover:opacity-100" title="Stap dupliceren"' +
          ' data-action="duplicate-target" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
          '<i data-lucide="copy" class="w-3.5 h-3.5"></i></button>';

        // Reorder — only render the arrows that make sense (no phantom spacers)
        if (!isFirst || !isLast) {
          html += '<div class="w-px h-4 bg-base-content/10 mx-1.5"></div>';
        }
        if (!isFirst) {
          html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0 opacity-50 hover:opacity-100" title="Omhoog"' +
            ' data-action="reorder-target-up" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
            '<i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>';
        }
        if (!isLast) {
          html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0 opacity-50 hover:opacity-100" title="Omlaag"' +
            ' data-action="reorder-target-down" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
            '<i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>';
        }

        // Danger zone separator + delete (far right, clearly destructive)
        html += '<div class="w-px h-4 bg-base-content/10 mx-1.5"></div>';
        html += '<button type="button" class="btn btn-ghost btn-xs p-0 w-7 h-7 min-h-0 text-error/35 hover:text-error hover:bg-error/10" title="Stap verwijderen"' +
          ' data-action="delete-target" data-target-id="' + esc(tid) + '" data-integration-id="' + esc(String(integrationId)) + '">' +
          '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>';
      }

      // Chevron — visual affordance (whole header is clickable)
      html += '<div class="w-px h-4 bg-base-content/10 mx-1.5"></div>';
      html += '<span class="inline-flex items-center justify-center w-6 h-6 text-base-content/30">' +
              '<i data-lucide="' + (isOpen ? 'chevron-up' : 'chevron-down') + '" class="w-4 h-4"></i></span>';

      html +=         '</div>'; // right

      html +=       '</div>'; // flex row

      // Suggestion banners (many2one chain auto-detect)
      suggestions.forEach(function (sug) {
        if (window.FSV2.isChainSuggestionApplied(tid, sug.odooField)) return;
        html +=
          '<div class="mt-3 flex items-center gap-2 p-2.5 bg-info/10 rounded-lg border border-info/20 text-sm">' +
            '<i data-lucide="link-2" class="w-4 h-4 text-info shrink-0"></i>' +
            '<div class="flex-1 min-w-0">' +
              '<span class="font-medium">Koppeling mogelijk: </span>' +
              '<code class="text-xs bg-base-200 px-1 py-0.5 rounded">' + esc(sug.odooField) + '</code>' +
              ' <span class="text-base-content/60">\u2192 ' + esc(window.FSV2.modelLabel(sug.relation)) + ' (Stap ' + esc(String(sug.stepNum)) + ')</span>' +
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
        ? (Array.isArray(target.condition_values) && target.condition_values[0] === '__exists__'
            ? 'Als ' + esc(target.condition_field) + ' bestaat'
            : 'Als ' + esc(target.condition_field) + ' = ' + esc(
                Array.isArray(target.condition_values) && target.condition_values.length
                  ? target.condition_values.join(' / ') : '?'))
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

      // Callout 2: Gedrag bij verwerking (voor mailing_list: Actie + Modus i.p.v. de generieke upsert-opties)
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
        return { order: window.FSV2.getTargetOrder(t, 0), label: t.label || '' };
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
        window.FSV2.renderChatterComposer(target, tid, sortedTargets);
        renderStepConditionSection(target, tid, flatFields);
        if (idx > 0) renderChatterLinkCallout(target, tid, sortedTargets);
        return;
      }
      // create_activity: render activity composer instead of MappingTable
      if (target.operation_type === 'create_activity') {
        window.FSV2.renderActivityComposer(target, tid, sortedTargets);
        renderStepConditionSection(target, tid, flatFields);
        renderActivityLinkCallout(target, tid, sortedTargets);
        return;
      }
      // mailing_list: render mailing list composer
      if (target.operation_type === 'mailing_list') {
        window.FSV2.renderMailingListComposer(target, tid, sortedTargets);
        renderStepConditionSection(target, tid, flatFields);
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
    if (currentOpType === 'mailing_list') { window.FSV2.renderMailingListBehaviorSection(target, tid); return; }

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
    // Chatter, activity and mailing_list steps manage their own callout UI
    if (target.operation_type === 'chatter_message' || target.operation_type === 'create_activity' || target.operation_type === 'mailing_list') return;

    var preceding   = sortedTargets.slice(0, myIdx);
    var suggestions = window.FSV2.computeChainSuggestions(target, preceding);
    var html = '<div class="px-3.5 py-2.5 border-t border-base-200 bg-base-200/30">';

    if (!suggestions.length) {
      html += '<p class="text-xs opacity-40 italic py-1">Geen koppelingsopties beschikbaar.</p>';
    } else {
      suggestions.forEach(function (s) {
        var applied   = window.FSV2.isChainSuggestionApplied(tid, s.odooField);
        var prevT     = sortedTargets.find(function (t) { return String(t.id) === String(s.prevTargetId); });
        var prevModel = prevT ? window.FSV2.modelLabel(prevT.odoo_model) : (s.stepLabel || ('Stap ' + s.stepNum));
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
    window.FSV2.renderDetailMappings();
    window.FSV2.showAlert('Koppeling verwijderd. Sla de stap op om te bevestigen.', 'info');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHATTER LINK CALLOUT — "Koppeling vorige stap" for notitie steps
  // ────────────────────────────────────────────────────────────────────────────

  function renderChatterLinkCallout(target, tid, sortedTargets) {
    var calloutsEl = document.getElementById('det-callouts-' + tid);
    if (!calloutsEl) return;

    var myIdx = sortedTargets.findIndex(function (t) { return String(t.id) === tid; });

    // Filter: only preceding steps with chatter enabled
    var compatibleSteps = sortedTargets.filter(function (t, idx) {
      if (idx >= myIdx) return false;
      if (t.operation_type === 'chatter_message' || t.operation_type === 'create_activity') return false;
      var cache = (S() && S().odooModelsCache) || [];
      var mc = cache.find(function (c) { return (c.odoo_model || c.name) === t.odoo_model; });
      return !mc || mc.allow_chatter !== false;
    });

    // Load existing _chatter_record_id mappings
    var targetMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
    var existingIdentifiers = [];
    targetMappings.filter(function (m) { return m.odoo_field === '_chatter_record_id'; }).forEach(function (m) {
      var svRaw = String(m.source_value || '');
      var fmt = svRaw.match(/^step\.([^.]+)\.record_id$/) || svRaw.match(/^step_(\d+)_id$/);
      if (fmt) existingIdentifiers.push(String(fmt[1]));
    });

    var div = document.createElement('div');
    div.className = 'px-3 pb-3 pt-2.5';

    if (!compatibleSteps.length) {
      div.innerHTML =
        '<p class="text-xs text-base-content/50 italic">Geen compatibele stappen beschikbaar. ' +
        'Voeg eerst een stap toe die een record aanmaakt of bijwerkt (met chatter ingeschakeld).</p>';
    } else {
      var listItems = '';
      compatibleSteps.forEach(function (t) {
        var order   = window.FSV2.getTargetOrder(t, 0);
        var visualN = sortedTargets.indexOf(t) + 1;
        var lbl     = t.label || window.FSV2.modelLabel(t.odoo_model);
        var mlbl    = window.FSV2.modelLabel(t.odoo_model);
        var isChk   = existingIdentifiers.indexOf(String(order)) !== -1 ||
                      (existingIdentifiers.length === 0 && compatibleSteps.length === 1);
        listItems +=
          '<li class="flex items-center gap-2 px-2.5 py-1.5 border-b border-base-200 last:border-0 bg-base-100 hover:bg-base-200/30">' +
            '<input type="checkbox" class="checkbox checkbox-xs shrink-0" data-chatter-step="' + esc(tid) + '"' +
              ' value="' + esc(String(order)) + '"' + (isChk ? ' checked' : '') + '>' +
            '<div class="flex-1 min-w-0">' +
              '<span class="font-medium text-xs">' + esc(lbl) + '</span>' +
              '<span class="text-base-content/40 text-xs ml-1">stap ' + visualN +
                (mlbl && mlbl !== lbl ? ' · ' + esc(mlbl) : '') + '</span>' +
            '</div>' +
          '</li>';
      });
      div.innerHTML =
        '<p class="text-xs text-base-content/50 mb-1.5">Notitie wordt geplaatst op de records van de geselecteerde stap(pen).</p>' +
        '<ul id="chatterStepList-' + esc(tid) + '" class="border border-base-200 rounded-lg overflow-hidden">' +
          listItems +
        '</ul>';
    }

    calloutsEl.appendChild(div);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ACTIVITY LINK CALLOUT — "Koppeling vorige stap" voor activiteit-stappen
  // ────────────────────────────────────────────────────────────────────────────

  function renderActivityLinkCallout(target, tid, sortedTargets) {
    var calloutsEl = document.getElementById('det-callouts-' + tid);
    if (!calloutsEl) return;

    var myIdx = sortedTargets.findIndex(function (t) { return String(t.id) === tid; });

    // Filter: preceding steps, excluding chatter/activity types; respect model config
    var compatibleSteps = sortedTargets.filter(function (t, idx) {
      if (idx >= myIdx) return false;
      if (t.operation_type === 'chatter_message' || t.operation_type === 'create_activity') return false;
      var cache = (S() && S().odooModelsCache) || [];
      var mc = cache.find(function (c) { return (c.odoo_model || c.name) === t.odoo_model; });
      return !mc || mc.allow_activity !== false;
    });

    var currentResIdSource = target.activity_res_id_source || '';
    var currentStepOrder   = null;
    var srcMatch = currentResIdSource.match(/^step\.([^.]+)\.record_id$/);
    if (srcMatch) currentStepOrder = srcMatch[1];

    var div = document.createElement('div');
    div.className = 'px-3 pb-3 pt-2.5';

    if (!compatibleSteps.length) {
      div.innerHTML =
        '<p class="text-xs text-base-content/50 italic">Geen compatibele stappen beschikbaar. ' +
        'Voeg eerst een stap toe die een record aanmaakt of bijwerkt.</p>';
    } else {
      var listItems = '';
      compatibleSteps.forEach(function (t) {
        var order   = window.FSV2.getTargetOrder(t, 0);
        var visualN = sortedTargets.indexOf(t) + 1;
        var lbl     = t.label || window.FSV2.modelLabel(t.odoo_model);
        var mlbl    = window.FSV2.modelLabel(t.odoo_model);
        var isChk   = currentStepOrder !== null
          ? String(currentStepOrder) === String(order)
          : compatibleSteps.length === 1;
        listItems +=
          '<li class="flex items-center gap-2 px-2.5 py-1.5 border-b border-base-200 last:border-0 bg-base-100 hover:bg-base-200/30">' +
            '<input type="radio" name="activityStep-' + esc(tid) + '" class="radio radio-xs shrink-0"' +
              ' data-activity-step="' + esc(tid) + '"' +
              ' value="' + esc(String(order)) + '"' + (isChk ? ' checked' : '') + '>' +
            '<div class="flex-1 min-w-0">' +
              '<span class="font-medium text-xs">' + esc(lbl) + '</span>' +
              '<span class="text-base-content/40 text-xs ml-1">stap ' + visualN +
                (mlbl && mlbl !== lbl ? ' \u00b7 ' + esc(mlbl) : '') + '</span>' +
            '</div>' +
          '</li>';
      });
      div.innerHTML =
        '<p class="text-xs text-base-content/50 mb-1.5">Activiteit wordt gekoppeld aan het record van de geselecteerde stap.</p>' +
        '<ul id="activityStepList-' + esc(tid) + '" class="border border-base-200 rounded-lg overflow-hidden">' +
          listItems +
        '</ul>';
    }

    calloutsEl.appendChild(div);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: calloutsEl });

    // Reload activity types when step selection changes
    var stepList = document.getElementById('activityStepList-' + tid);
    if (stepList) {
      stepList.addEventListener('change', function (e) {
        var radio = e.target.closest('input[data-activity-step]');
        if (!radio) return;
        var selOrder = radio.value;
        var newStep  = compatibleSteps.find(function (t) { return String(window.FSV2.getTargetOrder(t, 0)) === String(selOrder); });
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
    var vmapKeys = window.FSV2.getOrderedValueMapKeys(ft);
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
    var isExists      = condVals.length === 1 && condVals[0] === '__exists__';
    var currentOp     = isExists ? 'exists' : 'equals';
    var fieldTransforms = S().fieldTransforms || {};

    var fieldOpts = '<option value="">' + esc('\u2014 Geen voorwaarde \u2014') + '</option>';
    (flatFields || []).forEach(function (ff) {
      var fid = String(ff.field_id || '');
      var lbl = ff.label || fid;
      var sel = fid === currentField ? ' selected' : '';
      fieldOpts += '<option value="' + esc(fid) + '"' + sel + '>' + esc(lbl) + '</option>';
    });

    var valuesHtml = (currentField && currentOp === 'equals')
      ? buildCondValuesHtml(tid, currentField, flatFields, fieldTransforms, condVals)
      : '';

    // Operator-toggle: gelijk aan | bestaat
    var opToggleHtml = currentField
      ? '<div class="flex items-center gap-1 flex-wrap">' +
          '<button type="button" class="btn btn-xs ' + (currentOp === 'equals' ? 'btn-warning' : 'btn-ghost border border-base-200') + '"' +
            ' data-action="cond-op-toggle" data-target-id="' + esc(tid) + '" data-op="equals">gelijk aan</button>' +
          '<button type="button" class="btn btn-xs ' + (currentOp === 'exists' ? 'btn-warning' : 'btn-ghost border border-base-200') + '"' +
            ' data-action="cond-op-toggle" data-target-id="' + esc(tid) + '" data-op="exists">bestaat</button>' +
        '</div>'
      : '';

    var existsNoteHtml = (currentField && currentOp === 'exists')
      ? '<p class="text-xs text-base-content/50 italic">Stap wordt overgeslagen als het veld leeg of afwezig is.</p>'
      : '';

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
            '</div>' +
            (opToggleHtml ? '<div id="stepCondOpArea-' + esc(tid) + '">' + opToggleHtml + '</div>' : '<div id="stepCondOpArea-' + esc(tid) + '"></div>') +
            '<div id="stepCondValuesArea-' + esc(tid) + '">' +
              valuesHtml +
            '</div>' +
            existsNoteHtml +
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
    var area    = document.getElementById('stepCondValuesArea-' + tid);
    var opArea  = document.getElementById('stepCondOpArea-' + tid);
    if (!area) return;
    var flatFields = window.FSV2.buildDetailFlatFields(S().detailFormFields || []).flatFields;
    var fieldTransforms = S().fieldTransforms || {};
    // Nieuw veld → reset operator naar 'equals' en toon waarden-input
    if (opArea) {
      opArea.innerHTML = fieldId
        ? '<div class="flex items-center gap-1 flex-wrap">' +
            '<button type="button" class="btn btn-xs btn-warning"' +
              ' data-action="cond-op-toggle" data-target-id="' + esc(tid) + '" data-op="equals">gelijk aan</button>' +
            '<button type="button" class="btn btn-xs btn-ghost border border-base-200"' +
              ' data-action="cond-op-toggle" data-target-id="' + esc(tid) + '" data-op="exists">bestaat</button>' +
          '</div>'
        : '';
    }
    area.innerHTML = fieldId ? buildCondValuesHtml(tid, fieldId, flatFields, fieldTransforms, []) : '';
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

    // Lees actieve operator (exists / equals)
    var opArea = document.getElementById('stepCondOpArea-' + tid);
    var activeOpBtn = opArea ? opArea.querySelector('button.btn-warning[data-op]') : null;
    var condOp = activeOpBtn ? activeOpBtn.getAttribute('data-op') : 'equals';

    if (condOp === 'exists') {
      condValues = ['__exists__'];
    } else {
      // Validate: field geselecteerd maar geen waarden → stop en waarschuw
      if (condField && !condValues.length) {
        window.FSV2.showAlert('Selecteer minimaal één toegestane waarde voor de voorwaarde, of kies "— Geen voorwaarde —" om te wissen.', 'warning');
        return;
      }
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

  async function handleSaveStepMappings(tid) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var target  = targets.find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }

    // Delegate special step types to their own handlers
    if (target.operation_type === 'chatter_message') {
      return window.FSV2.handleSaveChatterComposer(tid);
    }
    if (target.operation_type === 'create_activity') {
      return window.FSV2.handleSaveActivityComposer(tid);
    }
    if (target.operation_type === 'mailing_list') {
      return window.FSV2.handleSaveMailingListComposer(tid);
    }

    var mcEl = document.getElementById('det-mc-' + tid);
    if (!mcEl) { window.FSV2.showAlert('Editor niet gevonden.', 'error'); return; }

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

    var _ffr       = window.FSV2.buildDetailFlatFields(S().detailFormFields);
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
    await window.FSV2.openDetail(S().activeId);
  }

  async function handleReorderTarget(targetId, direction) {
    var targets       = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (!integrationId) return;

    var sorted  = [...targets].sort(function (a, b) { return window.FSV2.getTargetOrder(a, 0) - window.FSV2.getTargetOrder(b, 0); });
    var idx     = sorted.findIndex(function (t) { return String(t.id) === String(targetId); });
    if (idx < 0) return;
    var swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    var tA = sorted[idx];  var tB = sorted[swapIdx];
    var oA = window.FSV2.getTargetOrder(tA, idx);  var oB = window.FSV2.getTargetOrder(tB, swapIdx);
    var temp = Math.max(oA, oB) + 100;  // safe temp (no unique constraint conflict)

    // ── Koppelingscontrole ────────────────────────────────────────────────────
    // Geeft de execution_orders terug van alle stappen waaraan dit target gekoppeld is.
    // Dekt: chatter (_chatter_record_id), activiteit (activity_res_id_source)
    // én gewone chain-links (source_type === 'previous_step_output').
    function _linkedOrders(t) {
      var ords = [];
      // Activiteit: activity_res_id_source = 'step.{order}.record_id'
      if (t.activity_res_id_source) {
        var _m = t.activity_res_id_source.match(/^step\.([^.]+)\.record_id$/);
        if (_m) ords.push(Number(_m[1]));
      }
      // Alle mappings met source_type === 'previous_step_output'
      // (chatter _chatter_record_id én gewone chain-links zoals Contact → Lead)
      var _maps = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[t.id]) || [];
      _maps.filter(function (m) { return m.source_type === 'previous_step_output'; }).forEach(function (m) {
        var _sm = (m.source_value || '').match(/^step\.([^.]+)\.record_id$/);
        if (_sm) ords.push(Number(_sm[1]));
      });
      return ords;
    }

    // Blokkeer elke verplaatsing waarbij een stap voor zijn gekoppelde vorige stap zou komen.
    // Geldt voor alle staptypes: gewone stappen, chatter én activiteiten.
    if (direction === -1 && _linkedOrders(tA).includes(oB)) {
      // tA beweegt omhoog langs tB die een linked step van tA is
      window.FSV2.showAlert('Deze stap is gekoppeld aan de vorige stap en kan er niet voor geplaatst worden.', 'error');
      return;
    }
    if (direction === -1 && _linkedOrders(tB).includes(oA)) {
      // tA beweegt omhoog langs tB die tA als linked step heeft
      window.FSV2.showAlert('De bovenliggende stap is gekoppeld aan deze stap en kan er niet voor geplaatst worden.', 'error');
      return;
    }
    if (direction === 1 && _linkedOrders(tA).includes(oB)) {
      // tA beweegt omlaag langs tB die een linked step van tA is
      window.FSV2.showAlert('Deze stap is gekoppeld aan de volgende stap en kan er niet na geplaatst worden.', 'error');
      return;
    }
    if (direction === 1 && _linkedOrders(tB).includes(oA)) {
      // tB beweegt omhoog langs tA die een linked step van tB is
      window.FSV2.showAlert('De volgende stap is gekoppeld aan deze stap en kan er niet voor geplaatst worden.', 'error');
      return;
    }

    var VALID_ID_TYPES  = ['single_email', 'partner_context', 'registration_composite', 'mapped_fields', 'odoo_id'];
    var VALID_POLICIES  = ['always_overwrite', 'only_if_incoming_non_empty', 'upsert'];
    function payload(t, execOrder) {
      var idType  = VALID_ID_TYPES.includes(t.identifier_type)  ? t.identifier_type  : 'mapped_fields';
      var policy  = VALID_POLICIES.includes(t.update_policy)    ? t.update_policy    : 'always_overwrite';
      return JSON.stringify({
        odoo_model:      t.odoo_model,
        operation_type:  t.operation_type || null,
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
    await window.FSV2.openDetail(S().activeId);
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
    await window.FSV2.openDetail(S().activeId);
  }

  // ── Field visibility/alias handlers ────────────────────────────────────────

  function toggleStepOpen(tid) {
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;
    if (!integrationId) return;
    var po = window.FSV2.getPipelineOpen(integrationId);
    po[String(tid)] = !po[String(tid)];
    window.FSV2.renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleDuplicateTarget(targetId, integrationId) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var source  = targets.find(function (t) { return String(t.id) === targetId; });
    if (!source) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }

    var maxOrder = targets.reduce(function (max, t) {
      return Math.max(max, window.FSV2.getTargetOrder(t, 0));
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
    var po = window.FSV2.getPipelineOpen(integrationId);
    if (po[String(targetId)]) po[String(newTargetId)] = true;

    await window.FSV2.openDetail(S().activeId);
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
    var po = window.FSV2.getPipelineOpen(integrationId);
    delete po[String(targetId)];
    await window.FSV2.openDetail(S().activeId);
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
    if (integrationId) window.FSV2.getPipelineOpen(integrationId)[String(tid)] = true;
    window.FSV2.renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    window.FSV2.showAlert('Koppeling toegevoegd. Sla de stap op om te bevestigen.', 'success');
  }

  // ── CHATTER COMPOSER (Fase 3) ────────────────────────────────────────────


  Object.assign(window.FSV2, {
    applyChainSuggestion: applyChainSuggestion,
    getOrderedValueMapKeys: getOrderedValueMapKeys,
    handleCondFieldChanged: handleCondFieldChanged,
    handleDeleteTarget: handleDeleteTarget,
    handleDuplicateTarget: handleDuplicateTarget,
    handleReorderTarget: handleReorderTarget,
    handleSaveStepCondition: handleSaveStepCondition,
    handleSaveStepMappings: handleSaveStepMappings,
    handleToggleIdentifier: handleToggleIdentifier,
    removeChainLink: removeChainLink,
    renderActivityLinkCallout: renderActivityLinkCallout,
    renderDetailMappings: renderDetailMappings,
    toggleStepOpen: toggleStepOpen
  });
})();
