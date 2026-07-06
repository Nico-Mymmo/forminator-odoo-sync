/**
 * Forminator Sync V2 -- Detail -- Activiteit step composer
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
      var _linkedStep = compatibleSteps.find(function (t) { return String(window.FSV2.getTargetOrder(t, 0)) === String(currentStepOrder); });
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

    // Formuliervelden voor placeholder-chips
    var _actFfr = window.FSV2.buildDetailFlatFields(S().detailFormFields || []);
    var _actFields = _actFfr.flatFields || [];

    // Beschrijving + veld-chips
    var _actChips = _actFields.map(function (f) {
      var fid = f.field_id || f.fieldId || f.id || f.name || '';
      var lbl = f.label || fid;
      return '<button type="button"' +
        ' class="badge badge-outline badge-sm cursor-pointer hover:badge-primary transition-colors"' +
        ' data-action="insert-activity-field" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
        ' title="Invoegen: {' + esc(fid) + '}">' + esc(lbl) + '</button>';
    }).join('');

    html += '<div class="form-control mb-3">' +
      '<label class="label pb-1">' +
        '<span class="label-text text-sm font-medium">Beschrijving</span>' +
        '<span class="label-text-alt text-base-content/50 text-xs">Klik op een veld om het in te voegen.</span>' +
      '</label>' +
      '<input type="text" class="input input-bordered input-sm"' +
        ' id="activitySummaryTemplate-' + esc(tid) + '"' +
        ' value="' + esc(target.activity_summary_template || '') + '"' +
        ' placeholder="Nieuwe aanvraag van {name}">' +
      (_actChips ? '<div class="flex flex-wrap gap-1 mt-1.5">' + _actChips + '</div>' : '') +
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

    var _actStepList = document.getElementById('activityStepList-' + tid);
    var _actStepRadio = _actStepList ? _actStepList.querySelector('input[data-activity-step]:checked') : null;
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

    var stepOrder   = _actStepRadio ? _actStepRadio.value : null;
    var resIdSource = stepOrder ? ('step.' + stepOrder + '.record_id') : (target.activity_res_id_source || null);

    // Derive model from the linked step
    var linkedModel = target.odoo_model;
    if (stepOrder) {
      var _selOrd = parseInt(stepOrder, 10);
      var _allTargets = (S().detail && S().detail.targets) || [];
      var _linked = _allTargets.find(function (t) {
        return window.FSV2.getTargetOrder(t, 0) === _selOrd &&
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
    handleActivityUserMode: handleActivityUserMode,
    handleSaveActivityComposer: handleSaveActivityComposer,
    renderActivityComposer: renderActivityComposer
  });
})();
