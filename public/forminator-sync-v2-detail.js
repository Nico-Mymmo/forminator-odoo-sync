/**
 * Forminator Sync V2 â€” Detail
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

    window.FSV2.MappingTable.render('detailMappingsContainer', {
      flatFields:            flatFields,
      topLevelFields:        rawFf,
      odooCache:             odooCache,
      odooLoaded:            odooLoaded,
      odooModel:             model,
      existingFormMappings:  formMappingsByField,
      extraRows:             S().detail._extraRows,
      showUpdateColumn:      true,
      selectClass:           'detail-ff-select',
      idCheckClass:          'detail-ff-id-check',
      updCheckClass:         'detail-ff-upd-check',
      namePrefix:            'det-ff-',
      checkPrefix:           'det-',
      extraRowPrefix:        'det-extra-',
      extraInputPrefix:      'det-inp-',
      extraIdCheckClass:     'detail-extra-id-check',
      extraUpdCheckClass:    'detail-extra-upd-check',
      addAction:             'detail-add-extra-row',
      removeAction:          'detail-remove-extra-row',
      fspId:                 'det-extra-add',
      extraValueWrapId:      'detExtraStaticWrap',
      extraValueInputId:     'detExtraStaticValue',
      extraIsIdentifierId:   'detExtraIsIdentifier',
      extraIsUpdateFieldId:  'detExtraIsUpdateField',
      saveAction:            'save-detail-mappings',
      targetId:              String(firstTarget.id),
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
              : '<span class="text-base-content/30">â€”</span>';
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
          'Site-sleutel niet opgeslagen voor deze integratie â€” veldoverzicht niet beschikbaar. ' +
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
              : '<span class="text-base-content/30 text-xs">â€”</span>';
            return '<tr>' +
              '<td class="font-mono text-xs">' + esc(fid) + '</td>' +
              '<td class="text-sm">' + esc(f.label || f.field_id || 'â€”') + '</td>' +
              '<td><span class="badge badge-outline badge-xs">' + esc(f.type || 'â€”') + '</span></td>' +
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXPORT â€” extend FSV2
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
