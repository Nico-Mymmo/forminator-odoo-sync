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

  // Velden die technisch wel een relatie zijn maar niets met jouw gegevens te
  // maken hebben. Zonder deze lijst staat er bij elke res.partner-stap een
  // voorstel om "Followers (Partners)" te koppelen.
  var CHAIN_RUIS = /^(message_|website_message_|activity_|rating_|starred_message_|my_activity_)/;

  /**
   * Een stap bewaart de SLUG van het modelprofiel ("company"), maar de
   * relatie op een Odoo-veld noemt het echte model ("res.partner"). Zonder
   * deze vertaling vergelijk je die twee rechtstreeks, matcht er niets, en
   * verschijnt er geen enkel voorstel -- terwijl de koppeling gewoon bestaat.
   */
  function technischModel(naam) {
    var cfg = window.FSV2.getModelCfg ? window.FSV2.getModelCfg(naam) : null;
    return (cfg && cfg.odoo_model) || naam;
  }

  function chainVeldBruikbaar(field) {
    if (!field || !field.name) return false;
    if (field.readonly) return false;          // berekend veld: schrijven doet niets
    if (CHAIN_RUIS.test(field.name)) return false;
    return true;
  }

  /**
   * Wat kan deze stap met een VORIGE stap doen?
   *
   * Er zijn drie soorten, en het verschil ertussen is precies wat er eerder
   * niet uit te leggen was -- er stond één knop "Automatisch instellen" die
   * altijd hetzelfde deed, ongeacht welke kant je op wou:
   *
   *   set_many2one   dit record verwijst naar het record uit stap N
   *   link_x2many    het record uit stap N komt in een lijstveld van dit record
   *                  (de keerzijde van set_many2one: child_ids t.o.v. parent_id)
   *   find_via_field dit record wordt OPGEZOCHT via een veld van stap N --
   *                  gevonden = bijwerken, leeg = nieuw aanmaken
   *
   * Elke soort draagt zijn eigen zin uitleg mee; de weergave verzint er niets
   * bij. Zo staat de betekenis op één plek in plaats van in twee banners.
   */
  function computeChainSuggestions(currentTarget, precedingTargets) {
    var model       = currentTarget.odoo_model;
    var mijnModel   = technischModel(model);
    var opType      = currentTarget.operation_type || 'upsert';
    var suggestions = [];
    var cache       = (S().odooFieldsCache || {});
    var mijnVelden  = cache[model] || [];
    var links       = (S().modelLinksCache) || [];

    // 'create' zoekt nooit; 'search' schrijft nooit.
    var magZoeken    = opType === 'upsert' || opType === 'update_only' || opType === 'search';
    var magSchrijven = opType !== 'search';

    function stapInfo(prevT, prevIdx) {
      return {
        stepOrder:    window.FSV2.getTargetOrder(prevT, prevIdx),
        stepLabel:    prevT.label || '',
        stepNum:      prevIdx + 1,
        prevTargetId: String(prevT.id),
        stepNaam:     prevT.label || window.FSV2.modelLabel(prevT.odoo_model),
      };
    }

    precedingTargets.forEach(function (prevT, prevIdx) {
      var info        = stapInfo(prevT, prevIdx);
      var prevVelden  = cache[prevT.odoo_model] || [];
      var prevModel   = technischModel(prevT.odoo_model);
      var stapTekst   = 'stap ' + info.stepNum + ' (' + info.stepNaam + ')';

      // ── 1. set_many2one — een many2one op DEZE stap naar het model van stap N
      //    De modelregistratie (Koppelingen bij Instellingen) heeft voorrang:
      //    die is bewust ingesteld, de scan hieronder is afgeleid.
      var registryVelden = links
        .filter(function (l) { return l.model_a === prevT.odoo_model && l.model_b === model; })
        .map(function (l) { return { name: l.link_field, label: l.link_label || l.link_field }; });

      var m2oVelden = registryVelden.length
        ? registryVelden
        : mijnVelden.filter(function (f) {
            return f.type === 'many2one' && f.relation === prevModel && chainVeldBruikbaar(f);
          });

      if (magSchrijven) {
        m2oVelden.forEach(function (f) {
          var lbl = (f.label || f.name) + ' (' + f.name + ')';
          suggestions.push(Object.assign({}, info, {
            kind:         'set_many2one',
            odooField:    f.name,
            odooLabel:    lbl,
            sourceSuffix: 'record_id',
            isIdentifier: true,
            isRequired:   true,
            titel:        'Vul ' + lbl + ' in met het record uit ' + stapTekst,
            uitleg:       lbl + ' van dit record gaat verwijzen naar het record uit ' + stapTekst + '.',
          }));
        });
      }

      // ── 2. link_x2many — een lijstveld op DEZE stap dat het model van stap N bevat
      if (magSchrijven) {
        mijnVelden.forEach(function (f) {
          if (f.type !== 'one2many' && f.type !== 'many2many') return;
          if (f.relation !== prevModel) return;
          if (!chainVeldBruikbaar(f)) return;
          var lbl = (f.label || f.name) + ' (' + f.name + ')';
          suggestions.push(Object.assign({}, info, {
            kind:         'link_x2many',
            odooField:    f.name,
            odooLabel:    lbl,
            sourceSuffix: 'record_id',
            isIdentifier: false,
            isRequired:   true,
            titel:        'Zet het record uit ' + stapTekst + ' in de lijst ' + lbl,
            uitleg:       'Het record uit ' + stapTekst + ' wordt toegevoegd aan de lijst ' + lbl +
                          ' van dit record \u2014 de omgekeerde richting van hierboven, en zonder een extra stap.',
          }));
        });
      }

      // ── 3. find_via_field — een many2one op STAP N die naar DIT model wijst
      if (magZoeken) {
        prevVelden.forEach(function (f) {
          if (f.type !== 'many2one' || f.relation !== mijnModel) return;
          if (!chainVeldBruikbaar(f)) return;
          var lbl = (f.label || f.name) + ' (' + f.name + ')';
          var watBijLeeg = opType === 'upsert'
            ? 'Staat het leeg, dan wordt er een nieuw record aangemaakt.'
            : (opType === 'update_only'
                ? 'Staat het leeg, dan wordt deze stap overgeslagen.'
                : 'Staat het leeg, dan geldt het gedrag dat je bij "niet gevonden" hebt ingesteld.');
          suggestions.push(Object.assign({}, info, {
            kind:         'find_via_field',
            odooField:    'id',
            odooLabel:    'ID',
            sourceSuffix: f.name,
            sourceLabel:  lbl,
            isIdentifier: true,
            isRequired:   false,
            titel:        'Zoek dit record via ' + lbl + ' van ' + stapTekst,
            uitleg:       'Wijst ' + lbl + ' van ' + stapTekst + ' al naar een record, dan wordt dat bijgewerkt. ' +
                          watBijLeeg,
          }));
        });
      }
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
          } else if (t.operation_type === 'send_mail') {
            stepLabel = 'Mail';
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
      if (integration.source_type === 'tracker') {
        var trackerInfo = S()._trackerUrl;
        if (trackerInfo && trackerInfo.short_url) {
          var qrStyle = S()._trackerQrStyle || { dotColor: '#000000', bgColor: '#ffffff', logoDataUrl: null };
          var trackerDomain = trackerInfo.domain || 'link';
          webhookBlock =
            '<div class="mt-4 pt-4 border-t border-base-200">' +
              '<div class="flex items-center justify-between gap-2 mb-1.5">' +
                '<p class="text-xs font-semibold text-base-content/60 flex items-center gap-1.5">' +
                  '<i data-lucide="qr-code" class="w-3.5 h-3.5 text-info"></i> Korte URL' +
                '</p>' +
                '<select class="select select-bordered select-xs" data-action="tracker-domain-change" data-id="' + esc(String(integration.id)) + '">' +
                  '<option value="link"' + (trackerDomain === 'link' ? ' selected' : '') + '>link.openvme.be</option>' +
                  '<option value="syndicoach"' + (trackerDomain === 'syndicoach' ? ' selected' : '') + '>link.syndicoach.be</option>' +
                  '<option value="operations"' + (trackerDomain === 'operations' ? ' selected' : '') + '>operations.openvme.be</option>' +
                '</select>' +
              '</div>' +
              '<div class="flex items-center gap-2 mb-3">' +
                '<code class="flex-1 text-xs bg-base-200 rounded px-2 py-1.5 break-all select-all">' + esc(trackerInfo.short_url) + '</code>' +
                '<button type="button" class="btn btn-xs btn-ghost shrink-0" id="btnCopyTrackerUrl" title="Kopi\u00ebren">' +
                  '<i data-lucide="copy" class="w-3.5 h-3.5"></i>' +
                '</button>' +
              '</div>' +
              '<p class="text-xs text-base-content/60 mb-3">Doel: <span class="break-all">' + esc(integration.destination_url || '\u2014') + '</span></p>' +
              '<div class="flex flex-col items-center gap-2">' +
                '<div id="detailTrackerQr"></div>' +
                '<div class="grid grid-cols-2 gap-2 w-full max-w-xs mt-1">' +
                  '<div>' +
                    '<label class="label label-text text-xs py-0.5">Kleur</label>' +
                    '<input type="color" class="input input-bordered input-xs w-full h-8 p-0.5" data-action="tracker-qr-color-change" data-style-key="dotColor" value="' + esc(qrStyle.dotColor) + '">' +
                  '</div>' +
                  '<div>' +
                    '<label class="label label-text text-xs py-0.5">Achtergrond</label>' +
                    '<input type="color" class="input input-bordered input-xs w-full h-8 p-0.5" data-action="tracker-qr-color-change" data-style-key="bgColor" value="' + esc(qrStyle.bgColor) + '">' +
                  '</div>' +
                '</div>' +
                '<div class="w-full max-w-xs">' +
                  '<label class="label label-text text-xs py-0.5">Logo (optioneel)</label>' +
                  '<input type="file" accept="image/*" class="file-input file-input-bordered file-input-xs w-full" data-action="tracker-qr-logo-change">' +
                  (qrStyle.logoDataUrl
                    ? '<button type="button" class="btn btn-ghost btn-xs gap-1 mt-1" data-action="tracker-qr-logo-remove"><i data-lucide="x-circle" class="w-3 h-3"></i>Logo verwijderen</button>'
                    : '') +
                '</div>' +
                '<div class="flex gap-2 mt-1">' +
                  '<button type="button" class="btn btn-xs btn-outline gap-1" data-action="tracker-qr-download" data-ext="png">' +
                    '<i data-lucide="download" class="w-3.5 h-3.5"></i> PNG downloaden' +
                  '</button>' +
                  '<button type="button" class="btn btn-xs btn-outline gap-1" data-action="tracker-qr-download" data-ext="svg">' +
                    '<i data-lucide="download" class="w-3.5 h-3.5"></i> SVG downloaden' +
                  '</button>' +
                '</div>' +
              '</div>' +
            '</div>';
        } else {
          webhookBlock =
            '<div class="mt-4 pt-4 border-t border-base-200">' +
              '<span class="loading loading-spinner loading-xs"></span>' +
              '<span class="text-xs text-base-content/60 ml-2">Tracker-URL laden\u2026</span>' +
            '</div>';
        }
      } else if (integration.source_type === 'generic_webhook') {
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
                (integration.source_type === 'tracker'
                  ? '<span class="badge badge-info badge-sm mr-1">Tracker</span>Trackbare link / QR-code'
                  : integration.source_type === 'generic_webhook'
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

      if (integration.source_type === 'tracker' && S()._trackerUrl && S()._trackerUrl.short_url) {
        var trackerQrEl = document.getElementById('detailTrackerQr');
        if (trackerQrEl && window.FSV2.renderTrackerQrCode) {
          window.FSV2.renderTrackerQrCode(
            'detailTrackerQr',
            S()._trackerUrl.qr_url || S()._trackerUrl.short_url,
            S()._trackerQrStyle || { dotColor: '#000000', bgColor: '#ffffff', logoDataUrl: null }
          );
        }
        var copyTrackerBtn = document.getElementById('btnCopyTrackerUrl');
        if (copyTrackerBtn) {
          copyTrackerBtn.addEventListener('click', function () {
            navigator.clipboard.writeText(S()._trackerUrl.short_url).then(function () {
              window.FSV2.showAlert('URL gekopi\u00eberd.', 'success');
            }).catch(function () {
              window.FSV2.showAlert('Kopi\u00ebren mislukt \u2014 selecteer de URL handmatig.', 'warning');
            });
          });
        }
        // Domein-select (Task 1) en QR-kleur/logo-panel (Task 2) worden via de
        // centrale data-action delegation in forminator-sync-v2-bootstrap.js
        // afgehandeld (tracker-domain-change, tracker-qr-color-change,
        // tracker-qr-logo-change, tracker-qr-logo-remove, tracker-qr-download) —
        // geen directe addEventListener hier nodig.
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

    // Tab-zichtbaarheid: trackers hebben geen formuliervelden/koppeling/indieningen \u2014
    // toon in plaats daarvan uitsluitend de Statistieken-tab (omgekeerd voor de andere twee bronnen).
    var isTrackerIntegration = integration.source_type === 'tracker';
    var tabBar = document.getElementById('detailTabBar');
    if (tabBar) {
      var fieldsBtn  = tabBar.querySelector('[data-detail-tab="fields"]');
      var formBtn    = tabBar.querySelector('[data-detail-tab="form"]');
      var mappingBtn = tabBar.querySelector('[data-detail-tab="mapping"]');
      var historyBtn = tabBar.querySelector('[data-detail-tab="history"]');
      var statsBtn   = document.getElementById('detailTabStatsBtn');
      [fieldsBtn, formBtn, mappingBtn, historyBtn].forEach(function (btn) {
        if (btn) btn.style.display = isTrackerIntegration ? 'none' : '';
      });
      if (statsBtn) statsBtn.style.display = isTrackerIntegration ? '' : 'none';

      var activeTabBtn = tabBar.querySelector('.tab-active');
      var needsTabSwitch = isTrackerIntegration
        ? (!activeTabBtn || activeTabBtn.dataset.detailTab !== 'stats')
        : (activeTabBtn && activeTabBtn.dataset.detailTab === 'stats');
      if (needsTabSwitch) {
        var targetTab = isTrackerIntegration ? 'stats' : 'fields';
        tabBar.querySelectorAll('[data-detail-tab]').forEach(function (t) {
          t.classList.toggle('tab-active', t.dataset.detailTab === targetTab);
        });
        ['fields', 'form', 'mapping', 'history', 'stats'].forEach(function (name) {
          var panel = document.getElementById('detailTab' + name.charAt(0).toUpperCase() + name.slice(1));
          if (panel) panel.style.display = name === targetTab ? '' : 'none';
        });
      }
    }

    if (integration.source_type === 'tracker') {
      if (window.FSV2.renderDetailTrackerStats) window.FSV2.renderDetailTrackerStats();
    } else {
      window.FSV2.renderDetailMappings();
      window.FSV2.renderDetailFormFields();
      window.FSV2.renderDetailSubmissions();
    }

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
