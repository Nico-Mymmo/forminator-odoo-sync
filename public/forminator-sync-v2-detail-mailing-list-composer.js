/**
 * Forminator Sync V2 -- Detail -- Mailinglijst step composer
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

  function syncPendingValueMapFromDom() {
    // DOM-first: collect ALL rendered vmap rows regardless of current state length.
    // This prevents data loss when _pendingValueMapRows is shorter than the DOM
    // (e.g. after a field-type change or when the initial state was empty).
    var allFromEls = document.querySelectorAll('[data-vmap-from]');
    if (allFromEls.length > 0) {
      var newRows = [];
      allFromEls.forEach(function (fromEl) {
        var idx = parseInt(fromEl.dataset.vmapFrom, 10);
        if (isNaN(idx)) return;
        var toEl = document.querySelector('[data-vmap-to="' + idx + '"]');
        newRows.push({ from: fromEl.value, to: toEl ? toEl.value : '' });
      });
      window.FSV2.S._pendingValueMapRows = newRows;
    }
    // Sync catchall
    var catchallEl = document.querySelector('[data-vmap-catchall]');
    if (catchallEl) window.FSV2.S._pendingCatchall = catchallEl.value;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MAILINGLIJST COMPOSER

  var MAILING_PREFIX = '__MAILING__:';

  // Shared parser — Gedragsbalk-callout (Actie/Modus) en composer (lijsten/velden)
  // lezen allebei dezelfde chatter_template-config.
  function parseMailingListConfig(target) {
    var rawCfg = ((target && target.chatter_template) || '').trim();
    var cfg = { action: 'add', update_mode: 'upsert', list_ids: [] };
    if (rawCfg.indexOf(MAILING_PREFIX) === 0) {
      try { cfg = Object.assign(cfg, JSON.parse(rawCfg.slice(MAILING_PREFIX.length))); } catch (_) {}
    }
    return cfg;
  }

  // Gedragsbalk-callout content voor mailing_list-stappen: Actie (toevoegen/verwijderen)
  // + Modus (bijwerken-of-aanmaken/alleen bijwerken) i.p.v. de generieke upsert-radio's.
  function renderMailingListBehaviorSection(target, tid) {
    var el = document.getElementById('det-optype-' + tid);
    if (!el) return;
    var cfg           = window.FSV2.parseMailingListConfig(target);
    var currentAction = cfg.action || 'add';
    var currentMode   = cfg.update_mode || 'upsert';

    var html = '<div class="px-3.5 py-2.5 border-t border-base-200 bg-base-200/30">';
    html += '<div class="flex flex-wrap gap-4">';

    html += '<div class="form-control">' +
      '<label class="label pt-0 pb-1"><span class="label-text text-xs font-semibold opacity-60 uppercase tracking-wide">Actie</span></label>' +
      '<div class="join">' +
        ['add', 'remove'].map(function (val) {
          var lbl    = val === 'add' ? 'Toevoegen' : 'Verwijderen';
          var active = currentAction === val;
          return '<button type="button" class="btn btn-xs join-item btn-outline' + (active ? ' btn-primary' : '') + '"' +
            ' data-action="ml-action-toggle" data-target-id="' + esc(tid) + '" data-val="' + val + '">' + lbl + '</button>';
        }).join('') +
      '</div>' +
      '<input type="hidden" id="mlAction-' + esc(tid) + '" value="' + esc(currentAction) + '">' +
    '</div>';

    html += '<div class="form-control">' +
      '<label class="label pt-0 pb-1"><span class="label-text text-xs font-semibold opacity-60 uppercase tracking-wide">Modus</span></label>' +
      '<div class="join">' +
        [
          { val: 'upsert',      lbl: 'Bijwerken of aanmaken' },
          { val: 'update_only', lbl: 'Alleen bijwerken'      },
        ].map(function (o) {
          var active = currentMode === o.val;
          return '<button type="button" class="btn btn-xs join-item btn-outline' + (active ? ' btn-primary' : '') + '"' +
            ' data-action="ml-mode-toggle" data-target-id="' + esc(tid) + '" data-val="' + o.val + '">' + o.lbl + '</button>';
        }).join('') +
      '</div>' +
      '<input type="hidden" id="mlMode-' + esc(tid) + '" value="' + esc(currentMode) + '">' +
    '</div>';

    html += '</div>'; // flex-wrap
    html += '</div>';
    el.innerHTML = html;
  }

  // Bouwt de extraRows voor de standaard MappingTable-component. De veldenlijst komt
  // uit de gewone model-registry (fs_v2_odoo_models, via getModelCfg) — mailing.contact
  // staat daar net als res.partner/crm.lead/x_webinarregistrations in, en is dus op
  // dezelfde manier beheerbaar via Instellingen > Modellen > Standaardvelden.
  function buildMailingListExtraRows(target) {
    var targetMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
    var odooCache       = (S().odooFieldsCache || {})['mailing.contact'] || [];
    var modelCfg        = window.FSV2.getModelCfg ? window.FSV2.getModelCfg('mailing.contact') : {};
    var defs            = Array.isArray(modelCfg.default_fields) ? modelCfg.default_fields : [];
    return defs.map(function (def) {
      var dbm  = targetMappings.find(function (m) { return m.odoo_field === def.name && m.source_type !== 'form'; });
      var meta = odooCache.find(function (f) { return f.name === def.name; });
      return {
        odooField:     def.name,
        odooLabel:     (meta && meta.label) || def.label || def.name,
        staticValue:   dbm ? (dbm.source_value || '') : '',
        sourceType:    dbm ? dbm.source_type : 'template',
        isRequired:    !!def.required,
        isDefault:     true,
        isIdentifier:  false,
        isUpdateField: def.name !== 'email',
        sourceMode:    def.source_mode || 'both',
      };
    });
  }

  function renderMailingListComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    // Parse existing config from chatter_template — Actie/Modus zelf leven in de
    // Gedragsbalk-callout (renderMailingListBehaviorSection); hier alleen lijsten/velden.
    var cfg           = window.FSV2.parseMailingListConfig(target);
    var currentLists  = Array.isArray(cfg.list_ids) ? cfg.list_ids : [];

    var existingMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];

    var html = '';

    // Mailing lists
    html += '<div class="form-control mb-4">' +
      '<label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Mailinglijsten</span></label>' +
      '<div id="mlLists-' + esc(tid) + '" class="border border-base-200 rounded-lg divide-y divide-base-200">' +
        '<div class="px-3 py-2 text-xs text-base-content/40">Laden…</div>' +
      '</div>' +
    '</div>';

    // Veldkoppelingen — zelfde MappingTable-component/experience als de andere stappen.
    // Geen eigen save-knop hier: de gedeelde voettekstknop ("Koppelingen opslaan") van de
    // kaart voorkomt dubbele save-functionaliteit — zie handleSaveStepMappings.
    html += '<div id="det-mc-' + esc(tid) + '-fields" class="mb-2"></div>';

    el.innerHTML = html;

    // Async: load mailing lists
    window.FSV2.api('/mailing-lists').then(function (res) {
      var listsEl = document.getElementById('mlLists-' + tid);
      if (!listsEl) return;
      var lists = (res && res.data) || [];
      if (!lists.length) {
        listsEl.innerHTML = '<div class="px-3 py-2 text-xs text-base-content/40">Geen mailinglijsten gevonden.</div>';
      } else {
        listsEl.innerHTML = lists.map(function (l) {
          var checked = currentLists.indexOf(l.id) !== -1 ? ' checked' : '';
          return '<label class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-base-200/40">' +
            '<input type="checkbox" class="checkbox checkbox-xs ml-list-cb-' + esc(tid) + '"' +
              ' value="' + l.id + '"' + checked + '>' +
            '<span class="text-sm flex-1">' + esc(l.name) + '</span>' +
            '<span class="text-xs text-base-content/40">' + (l.contact_count || 0) + ' contacten</span>' +
          '</label>';
        }).join('');
      }
    }).catch(function () {
      var listsEl = document.getElementById('mlLists-' + tid);
      if (listsEl) listsEl.innerHTML = '<div class="px-3 py-2 text-xs text-error/70">Fout bij laden mailinglijsten.</div>';
    });

    // Veldkoppelingen via de standaard MappingTable-component.
    var _ffr       = window.FSV2.buildDetailFlatFields(S().detailFormFields || []);
    var odooCache  = (S().odooFieldsCache || {})['mailing.contact'] || [];
    var odooLoaded = odooCache.length > 0;

    window.FSV2.MappingTable.render('det-mc-' + tid + '-fields', {
      flatFields:                _ffr.flatFields,
      topLevelFields:            _ffr.topLevel,
      odooCache:                 odooCache,
      odooLoaded:                odooLoaded,
      odooModel:                 'mailing.contact',
      existingFormMappings:      existingMappings.filter(function (m) { return m.source_type === 'form'; }),
      identifierFields:          [],
      activeIdentifierField:     '',
      hiddenOdooFields:          [],
      extraRows:                 buildMailingListExtraRows(target),
      targetId:                  tid,
      alreadyMappedInOtherSteps: [],
      precedingSteps:            [],
      stepBadge:                 0,
    });

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [el] });
  }

  async function handleSaveMailingListComposer(tid) {
    var target = ((S().detail && S().detail.targets) || []).find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Target niet gevonden.', 'error'); return; }
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;

    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    var actionInput = document.getElementById('mlAction-' + tid);
    var modeInput   = document.getElementById('mlMode-' + tid);
    var action      = actionInput ? actionInput.value : 'add';
    var updateMode  = modeInput   ? modeInput.value   : 'upsert';

    // Selected mailing lists
    var listCheckboxes = el.querySelectorAll('.ml-list-cb-' + tid + ':checked');
    var listIds = [];
    listCheckboxes.forEach(function (cb) { listIds.push(parseInt(cb.value, 10)); });

    if (!listIds.length) {
      window.FSV2.showAlert('Selecteer minstens één mailinglijst.', 'error');
      return;
    }

    var cfgJson = MAILING_PREFIX + JSON.stringify({ action: action, update_mode: updateMode, list_ids: listIds });

    try {
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify({
          odoo_model:       'mailing.contact',
          operation_type:   'mailing_list',
          chatter_template: cfgJson,
        }),
      });
    } catch (e) {
      window.FSV2.showAlert('Fout bij opslaan configuratie: ' + e.message, 'error');
      return;
    }

    // Veldkoppelingen lezen uit de MappingTable-rijen — zelfde DOM-structuur en
    // extractielogica als handleSaveStepMappings gebruikt voor reguliere stappen.
    var newMappings = [];
    var orderIdx    = 0;
    var emailMapped = false;

    el.querySelectorAll('[data-map-row]').forEach(function (tr) {
      var fixedOdoo = tr.dataset.odooField || '';
      var col1      = tr.querySelector('[data-map-col="1"]');
      var col2el    = tr.querySelector('[data-map-col="2"]');
      var col3      = tr.querySelector('[data-map-col="3"]');
      var notUpdEl  = tr.querySelector('[data-map-not-update]');

      var formFid   = (col1 && col1.tagName === 'SELECT') ? (col1.value || '') : '';
      var staticVal = col2el ? (col2el.value || '').trim() : '';
      var odooField = fixedOdoo || ((col3 && col3.tagName === 'SELECT') ? (col3.value || '') : '');
      if (!odooField) return;

      var isUpdateField = notUpdEl ? !notUpdEl.checked : true;
      var isIdentifier  = odooField === 'email';
      var isRequired    = odooField === 'email';

      if (formFid) {
        newMappings.push({
          odoo_field: odooField, source_type: 'form', source_value: formFid,
          is_identifier: isIdentifier, is_update_field: isUpdateField,
          is_required: isRequired, order_index: orderIdx++,
        });
        if (odooField === 'email') emailMapped = true;
      } else if (staticVal) {
        var srcType = /\{[^}]+\}/.test(staticVal) ? 'template' : 'static';
        newMappings.push({
          odoo_field: odooField, source_type: srcType, source_value: staticVal,
          is_identifier: isIdentifier, is_update_field: isUpdateField,
          is_required: isRequired, order_index: orderIdx++,
        });
        if (odooField === 'email') emailMapped = true;
      }
    });

    if (!emailMapped) {
      window.FSV2.showAlert('Stel het e-mailadresveld in — de stap kan niet worden uitgevoerd zonder e-mail.', 'error');
      return;
    }

    try {
      await window.FSV2.api('/targets/' + tid + '/mappings', { method: 'DELETE' });
      await Promise.all(newMappings.map(function (m) {
        return window.FSV2.api('/targets/' + tid + '/mappings', { method: 'POST', body: JSON.stringify(m) });
      }));
    } catch (e) {
      window.FSV2.showAlert('Fout bij opslaan veldkoppelingen: ' + e.message, 'error');
      return;
    }

    window.FSV2.showAlert('Mailinglijst-stap opgeslagen.', 'success');
    await window.FSV2.openDetail(S().activeId);
  }

  Object.assign(window.FSV2, {
    handleSaveMailingListComposer: handleSaveMailingListComposer,
    parseMailingListConfig: parseMailingListConfig,
    renderMailingListBehaviorSection: renderMailingListBehaviorSection,
    renderMailingListComposer: renderMailingListComposer,
    syncPendingValueMapFromDom: syncPendingValueMapFromDom
  });
})();
