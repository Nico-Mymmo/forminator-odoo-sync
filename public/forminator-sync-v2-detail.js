/**
 * Forminator Sync V2 — Detail
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

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDetail() {
    if (!S().detail) return;
    var integration = S().detail.integration;
    var resolvers   = S().detail.resolvers || [];
    var targets     = S().detail.targets   || [];

    var resolver  = resolvers[0];
    var target    = targets[0];
    var actionCfg = null;
    var actionKeys = Object.keys(window.FSV2.ACTIONS);
    for (var i = 0; i < actionKeys.length; i++) {
      var cfg = window.FSV2.ACTIONS[actionKeys[i]];
      if (resolver && cfg.resolver_type === resolver.resolver_type) { actionCfg = cfg; break; }
      if (target   && cfg.odoo_model    === target.odoo_model)      { actionCfg = cfg; break; }
    }

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

    var targets     = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var firstTarget = targets[0];

    if (!firstTarget) {
      container.innerHTML = '<p class="text-sm text-base-content/60">Geen schrijfdoel gevonden voor deze integratie.</p>';
      return;
    }

    var model      = firstTarget.odoo_model;
    var odooCache  = S().odooFieldsCache[model] || [];
    var odooLoaded = odooCache.length > 0;

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

    var allMappings = [];
    targets.forEach(function (t) {
      var ms = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[t.id]) || [];
      ms.forEach(function (m) { allMappings.push(Object.assign({}, m, { _targetId: t.id })); });
    });

    var formMappingsByField = {};
    var initialExtraRows    = [];
    allMappings.forEach(function (m) {
      if (m.source_type === 'form') {
        formMappingsByField[m.source_value] = m;
      } else {
        initialExtraRows.push(m);
      }
    });

    if (!S().detail._extraRows) {
      S().detail._extraRows = initialExtraRows.map(function (m) {
        var meta = odooCache.find(function (f) { return f.name === m.odoo_field; });
        return {
          odooField:     m.odoo_field,
          odooLabel:     (meta && meta.label) || m.odoo_field,
          staticValue:   m.source_value,
          sourceType:    m.source_type,
          isIdentifier:  !!m.is_identifier,
          isUpdateField: m.is_update_field !== false,
        };
      });
    }

    // ── Local helpers ──────────────────────────────────────────────────────
    function detBuildOdooOpts(suggested, preselected) {
      var sel  = preselected || suggested || '';
      var opts = '<option value="">— niet koppelen —</option>';
      if (!odooLoaded) {
        opts += '<option disabled>\u2026 Odoo velden laden \u2026</option>';
      } else {
        opts += odooCache.map(function (f) {
          var isSel = (f.name === sel) ? ' selected' : '';
          return '<option value="' + esc(f.name) + '"' + isSel + '>' + esc(f.label || f.name) + ' (' + esc(f.name) + ')</option>';
        }).join('');
      }
      return opts;
    }

    function detChips(targetId) {
      if (!flatFields.length) return '';
      return '<div class="flex flex-wrap gap-1 mt-1.5 items-center">' +
        '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>' +
        flatFields.map(function (f) {
          var fid = String(f.field_id);
          return '<button type="button" class="badge badge-outline badge-xs cursor-pointer hover:badge-primary insert-placeholder font-mono"' +
            ' data-field="' + esc(fid) + '" data-target="' + esc(targetId) + '"' +
            ' title="' + esc(f.label || fid) + '">' + esc(fid) + '</button>';
        }).join('') + '</div>';
    }

    function detValueInput(fieldName, value, nameAttr, idStr) {
      var meta  = fieldName ? (odooCache.find(function (f) { return f.name === fieldName; }) || null) : null;
      var ftype = (meta && meta.type) || '';
      idStr = idStr || '';
      if (ftype === 'boolean' || (ftype === 'selection' && meta && meta.selection && meta.selection.length)) {
        return window.FSV2.renderStaticInput(nameAttr, meta, value, idStr);
      }
      var nameA = nameAttr ? ' name="' + esc(nameAttr) + '"' : '';
      if (ftype === 'many2one') {
        return '<div><input class="input input-bordered input-sm w-full"' + nameA + idStr +
          ' value="' + esc(value || '') + '" placeholder="Numeriek Odoo-record ID\u2026" />' +
          '<p class="text-xs text-base-content/40 mt-1"><i data-lucide="info" class="w-3 h-3 inline -mt-0.5 mr-0.5"></i>Geef het numerieke ID op van het gekoppelde record.</p></div>';
      }
      if (ftype === 'integer' || ftype === 'float') {
        return '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
          ' type="number" value="' + esc(value || '') + '" placeholder="Getal\u2026" />';
      }
      var idMatch    = idStr.match(/id="([^"]+)"/);
      var chipTarget = idMatch ? idMatch[1] : null;
      return '<div><input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' value="' + esc(value || '') + '" placeholder="Vaste waarde of {veld-id} sjabloon\u2026" />' +
        (chipTarget ? detChips(chipTarget) : '') + '</div>';
    }

    // ── Section 1: form fields → Odoo field select ────────────────────────
    var AUTO_IDENTIFIERS = ['email', 'email_from', 'x_email', 'vat', 'ref'];
    var formRowsHtml;
    if (flatFields.length === 0) {
      var ffMsg = (S().detailFormFields === null || S().detailFormFields === 'loading')
        ? 'Formuliervelden worden opgehaald\u2026'
        : 'Geen formuliervelden gevonden.';
      formRowsHtml = '<tr><td colspan="5" class="text-sm text-base-content/40 italic py-3">' + esc(ffMsg) + '</td></tr>';
    } else {
      formRowsHtml = flatFields.map(function (f) {
        var fid          = String(f.field_id);
        var existing     = formMappingsByField[fid] || null;
        var preselected  = existing ? existing.odoo_field : null;
        var suggested    = preselected || window.FSV2.suggestOdooField(fid, f.label || '', model);
        var isIdentifier  = existing ? !!existing.is_identifier  : AUTO_IDENTIFIERS.includes(suggested);
        var isUpdateField = existing ? existing.is_update_field !== false : true;
        var isSubField    = !rawFf.find(function (pf) { return String(pf.field_id) === fid; });
        return '<tr' + (isSubField ? ' class="bg-base-200/30"' : '') + '>' +
          '<td class="align-middle py-2">' +
            (isSubField ? '<span class="text-base-content/40 mr-1">\u21b3</span>' : '') +
            '<span class="font-medium text-sm">' + esc(f.label || fid) + '</span>' +
            '<br><span class="font-mono text-xs text-base-content/40">' + esc(fid) + '</span>' +
          '</td>' +
          '<td class="py-1"><span class="badge badge-ghost badge-xs">' + esc(f.type || '') + '</span></td>' +
          '<td class="py-1.5 min-w-52">' +
            '<select class="select select-bordered select-sm w-full detail-ff-select" name="det-ff-odoo-' + esc(fid) + '">' +
              detBuildOdooOpts(suggested, preselected) +
            '</select>' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" class="checkbox checkbox-xs detail-ff-id-check"' +
            ' name="det-identifier-' + esc(fid) + '"' +
            ' title="Identifier: gebruikt om bestaand record op te zoeken voor update"' +
            (isIdentifier ? ' checked' : '') + '>' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" class="checkbox checkbox-xs detail-ff-upd-check"' +
            ' name="det-update-' + esc(fid) + '"' +
            ' title="Bijwerken: schrijf dit veld ook bij updates (uitvinken = alleen bij aanmaken)"' +
            (isUpdateField ? ' checked' : '') + '>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // ── Section 2: extra static/template rows ─────────────────────────────
    var extraRowsHtml = S().detail._extraRows.map(function (em, idx) {
      var tname     = 'det-extra-' + idx;
      var meta      = odooCache.find(function (f) { return f.name === em.odooField; }) || null;
      var ftype     = meta ? meta.type : '';
      var typeBadge = ftype ? ' <span class="badge badge-ghost badge-xs font-mono ml-1">' + esc(ftype) + '</span>' : '';
      return '<tr class="bg-warning/5">' +
        '<td class="align-middle py-2 whitespace-nowrap">' +
          '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' + typeBadge +
          '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
        '</td>' +
        '<td class="py-1"><span class="badge badge-ghost badge-xs">vast/sjabloon</span></td>' +
        '<td class="py-1.5">' + detValueInput(em.odooField, em.staticValue || '', tname, ' id="det-inp-' + esc(tname) + '"') + '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs detail-extra-id-check"' +
          ' name="det-extra-identifier-' + idx + '"' +
          ' title="Identifier: gebruik als zoekcriterium"' +
          (em.isIdentifier ? ' checked' : '') + '>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs detail-extra-upd-check"' +
          ' name="det-extra-update-' + idx + '"' +
          ' title="Bijwerken: schrijf dit veld ook bij updates"' +
          (em.isUpdateField !== false ? ' checked' : '') + '>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<button type="button" class="btn btn-ghost btn-xs text-error" data-action="detail-remove-extra-row" data-idx="' + idx + '" title="Verwijder">' +
            '<i data-lucide="x" class="w-3 h-3"></i></button>' +
        '</td>' +
      '</tr>';
    }).join('');

    var addExtraFooterRow =
      '<tr class="border-t-2 border-base-300">' +
        '<td class="py-2 min-w-40">' +
          window.OpenVME.FieldPicker.render('det-extra-add', '--unused--', odooCache, '') +
          '<span class="text-xs text-base-content/40 mt-0.5 block">' +
            (odooLoaded ? odooCache.length + ' velden beschikbaar' : '<span class="loading loading-xs loading-spinner inline-block"></span>') +
          '</span>' +
        '</td>' +
        '<td class="py-2 text-center"><span class="badge badge-ghost badge-xs">nieuw</span></td>' +
        '<td class="py-2 min-w-52">' +
          '<div id="detExtraStaticWrap">' + detValueInput('', '', null, ' id="detExtraStaticValue"') + '</div>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" id="detExtraIsIdentifier" class="checkbox checkbox-xs" title="Identifier: gebruik als zoekcriterium" />' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" id="detExtraIsUpdateField" class="checkbox checkbox-xs" title="Bijwerken: schrijf ook bij updates" checked />' +
        '</td>' +
        '<td class="py-2 text-right">' +
          '<button type="button" class="btn btn-outline btn-xs" data-action="detail-add-extra-row">+ Voeg toe</button>' +
        '</td>' +
      '</tr>';

    container.innerHTML =
      '<div id="detailMappingEditor" data-target-id="' + esc(String(firstTarget.id)) + '">' +
        '<div class="mb-6">' +
          '<h4 class="font-semibold text-sm mb-3 flex items-center gap-2">' +
            '<i data-lucide="link" class="w-4 h-4 text-primary"></i> Formuliervelden koppelen aan Odoo' +
            (!odooLoaded ? ' <span class="loading loading-xs loading-spinner ml-1"></span>' : '') +
          '</h4>' +
          '<div class="overflow-x-auto">' +
            '<table class="table table-sm">' +
              '<thead><tr>' +
                '<th>Formulier veld</th><th>Type</th><th>Koppelen aan Odoo veld</th>' +
                '<th class="text-center" title="Identifier: gebruik als zoekcriterium bij record matching"><i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i></th>' +
                '<th class="text-center" title="Bijwerken: schrijf dit veld ook wanneer een bestaand record wordt bijgewerkt"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block"></i></th>' +
              '</tr></thead>' +
              '<tbody>' + formRowsHtml + '</tbody>' +
            '</table>' +
          '</div>' +
          '<p class="text-xs text-base-content/40 mt-2">' +
            '<i data-lucide="key" class="w-3 h-3 inline -mt-0.5"></i> Identifier = record opzoeken. ' +
            '<i data-lucide="pencil" class="w-3 h-3 inline -mt-0.5"></i> Bijwerken = ook schrijven bij update (uitvinken = alleen bij aanmaken).' +
          '</p>' +
        '</div>' +
        '<div>' +
          '<h4 class="font-semibold text-sm mb-2 flex items-center gap-2">' +
            '<i data-lucide="tag" class="w-4 h-4 text-warning"></i> Extra Odoo-velden met vaste waarde' +
          '</h4>' +
          '<div class="overflow-x-auto">' +
            '<table class="table table-sm">' +
              '<thead><tr>' +
                '<th>Odoo veld</th><th>Type</th><th>Waarde / sjabloon</th>' +
                '<th class="text-center" title="Identifier"><i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i></th>' +
                '<th class="text-center" title="Bijwerken bij update"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block"></i></th>' +
                '<th></th>' +
              '</tr></thead>' +
              '<tbody>' + (extraRowsHtml || '<tr><td colspan="6" class="text-xs text-base-content/40 italic py-2">Nog geen extra velden toegevoegd.</td></tr>') + '</tbody>' +
              '<tfoot>' + addExtraFooterRow + '</tfoot>' +
            '</table>' +
          '</div>' +
        '</div>' +
        '<div class="mt-6 flex justify-end">' +
          '<button type="button" class="btn btn-primary" data-action="save-detail-mappings">' +
            '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Koppelingen opslaan' +
          '</button>' +
        '</div>' +
      '</div>';

    // Reactive: field picker for extra field changes → rebuild value input
    var fspDetExtraVal = document.getElementById('fsp-val-det-extra-add');
    if (fspDetExtraVal) {
      fspDetExtraVal.addEventListener('change', function () {
        var wrap = document.getElementById('detExtraStaticWrap');
        if (!wrap) return;
        wrap.innerHTML = detValueInput(fspDetExtraVal.value || '', '', null, ' id="detExtraStaticValue"');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: SUBMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════
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
            var replayAllowed = !isReplay && ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(sub.status || ''));
            var errorCell   = sub.last_error
              ? '<span class="text-xs text-error/80 font-mono" title="' + esc(sub.last_error) + '">' +
                  esc(sub.last_error.slice(0, 60)) + (sub.last_error.length > 60 ? '\u2026' : '') +
                '</span>'
              : '<span class="text-base-content/30">—</span>';
            return '<tr' + (isReplay ? ' class="bg-success/5"' : '') + '>' +
              '<td class="font-mono text-xs">' +
                (isReplay ? '<span class="text-base-content/40 mr-1">\u21b3</span>' : '') +
                esc(window.FSV2.shortId(sub.id)) +
              '</td>' +
              (showIndiener ? '<td class="text-xs">' + submitterInfo(sub) + '</td>' : '') +
              '<td>' + statusBadge(sub.status) + actionBadge(sub) + '</td>' +
              '<td class="max-w-xs truncate">' + errorCell + '</td>' +
              '<td class="text-xs whitespace-nowrap">' + esc(window.FSV2.fmt(sub.created_at)) + '</td>' +
              '<td>' + (replayAllowed
                ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '">Replay</button>'
                : '') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: FORM FIELDS TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDetailFormFields() {
    var el = document.getElementById('detailFormFields');
    if (!el) return;

    var integration = S().detail && S().detail.integration;
    var siteKey     = integration && integration.site_key;

    if (!siteKey) {
      el.innerHTML =
        '<p class="text-sm text-base-content/60 py-2">' +
          '<i data-lucide="info" class="w-4 h-4 inline mr-1 -mt-0.5"></i>' +
          'Site-sleutel niet opgeslagen voor deze integratie — veldoverzicht niet beschikbaar. ' +
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
              : '<span class="text-base-content/30 text-xs">—</span>';
            return '<tr>' +
              '<td class="font-mono text-xs">' + esc(fid) + '</td>' +
              '<td class="text-sm">' + esc(f.label || f.field_id || '—') + '</td>' +
              '<td><span class="badge badge-outline badge-xs">' + esc(f.type || '—') + '</span></td>' +
              '<td>' + badge + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAIL ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
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
      S().detail._extraRows = null;
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
      if (detailTargets.length > 0 && detailTargets[0].odoo_model) {
        var detailModel = detailTargets[0].odoo_model;
        if (!S().odooFieldsCache[detailModel] || !S().odooFieldsCache[detailModel].length) {
          window.FSV2.loadOdooFieldsForModel(detailModel).then(function () {
            if (S().activeId !== id) return;
            renderDetailMappings();
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          });
        }
      }
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
    var editor = document.getElementById('detailMappingEditor');
    if (!editor) { window.FSV2.showAlert('Editor niet gevonden.', 'error'); return; }
    var targetId = editor.dataset.targetId;
    if (!targetId) { window.FSV2.showAlert('Geen doel gevonden.', 'error'); return; }

    var targets     = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var firstTarget = targets[0];
    var model       = firstTarget ? firstTarget.odoo_model : '';

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

    var newMappings = [];
    var orderIdx    = 0;
    flatFields.forEach(function (ff) {
      var fid    = String(ff.field_id);
      var selEl  = Array.from(editor.querySelectorAll('select.detail-ff-select')).find(function (el) {
        return el.getAttribute('name') === 'det-ff-odoo-' + fid;
      });
      var odooField = selEl ? (selEl.value || '') : '';
      if (!odooField) return;
      var idCheckEl  = Array.from(editor.querySelectorAll('input.detail-ff-id-check')).find(function (el) {
        return el.getAttribute('name') === 'det-identifier-' + fid;
      });
      var updCheckEl = Array.from(editor.querySelectorAll('input.detail-ff-upd-check')).find(function (el) {
        return el.getAttribute('name') === 'det-update-' + fid;
      });
      var isIdentifier  = idCheckEl  ? idCheckEl.checked  : false;
      var isUpdateField = updCheckEl ? updCheckEl.checked : true;
      newMappings.push({ odoo_field: odooField, source_type: 'form', source_value: fid, is_identifier: isIdentifier, is_update_field: isUpdateField, is_required: false, order_index: orderIdx++ });
    });

    (S().detail._extraRows || []).forEach(function (em, idx) {
      var inpEl = document.getElementById('det-inp-det-extra-' + idx);
      var val   = inpEl ? (inpEl.value || '').trim() : (em.staticValue || '');
      if (!val) return;
      var sourceType    = /\{[^}]+\}/.test(val) ? 'template' : 'static';
      var extraIdChk    = editor.querySelector('input[name="det-extra-identifier-' + idx + '"]');
      var extraUpdChk   = editor.querySelector('input[name="det-extra-update-' + idx + '"]');
      var extraIsIdentifier  = extraIdChk  ? extraIdChk.checked  : false;
      var extraIsUpdateField = extraUpdChk ? extraUpdChk.checked : true;
      newMappings.push({ odoo_field: em.odooField, source_type: sourceType, source_value: val, is_identifier: extraIsIdentifier, is_update_field: extraIsUpdateField, is_required: false, order_index: orderIdx++ });
    });

    await window.FSV2.api('/targets/' + targetId + '/mappings', { method: 'DELETE' });
    await Promise.all(newMappings.map(function (m) {
      return window.FSV2.api('/targets/' + targetId + '/mappings', { method: 'POST', body: JSON.stringify(m) });
    }));

    window.FSV2.showAlert('Koppelingen opgeslagen.', 'success');
    S().detail._extraRows = null;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT — extend FSV2
  // ═══════════════════════════════════════════════════════════════════════════
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
    handleToggleIdentifier:  handleToggleIdentifier,
    fetchDetailFormFields:   fetchDetailFormFields,
    handleDeleteIntegration: handleDeleteIntegration,
    handleReplay:            handleReplay,
  });

}());
