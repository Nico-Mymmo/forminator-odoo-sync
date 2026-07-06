/**
 * Forminator Sync V2 -- Detail -- Formuliervelden tab
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
    var submissions    = (S().submissions || []).filter(function (s) { return s.source_payload; });
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

    var subNavHtml = '';
    if (submissions.length > 1) {
      subNavHtml =
        '<div class="flex items-center gap-0.5">' +
          '<button class="btn btn-xs btn-ghost btn-circle opacity-60" data-action="ff-sub-nav" data-dir="-1">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
          '</button>' +
          '<span class="text-xs text-base-content/50" style="font-variant-numeric:tabular-nums">inzending ' + (previewIdx + 1) + '/' + submissions.length + '</span>' +
          '<button class="btn btn-xs btn-ghost btn-circle opacity-60" data-action="ff-sub-nav" data-dir="1">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</button>' +
        '</div>';
    } else if (submissions.length === 1) {
      var _d = new Date(submissions[0].created_at || '');
      subNavHtml = '<span class="text-xs text-base-content/40">' +
        (isNaN(_d) ? 'inzending' : _d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })) + '</span>';
    }

    var toolbarHtml = (hiddenToggleHtml || subNavHtml)
      ? '<div class="flex items-center justify-between mb-2">' +
          '<div>' + hiddenToggleHtml + '</div>' +
          subNavHtml +
        '</div>'
      : '';

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
          '<div class="flex items-center gap-1 min-w-0 flex-1">' +
            '<input id="inline-alias-' + esc(fid) + '" type="text" ' +
              'class="input input-xs input-bordered font-mono w-36" ' +
              'onclick="event.stopPropagation()" ' +
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
              'data-action="start-edit-name" data-field-id="' + esc(fid) + '" title="Alias aanpassen">' +
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
          '<div class="flex items-center gap-1 shrink-0">' +
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
    window.FSV2._saveFieldMeta(integId, meta);
    window.FSV2.renderDetailFormFields();
    window.FSV2.renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleShowInList(fid) {
    var integId = String(S().activeId || '');
    var meta    = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    meta[fid].show_in_list = !meta[fid].show_in_list;
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    window.FSV2._saveFieldMeta(integId, meta);
    window.FSV2.renderDetailFormFields();
    window.FSV2.renderDetailSubmissions();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleBulkImportShow(fid) {
    var integId = String(S().activeId || '');
    var meta = S()._fieldMeta || {};
    if (!meta[fid]) meta[fid] = {};
    meta[fid].bulk_import_show = meta[fid].bulk_import_show === false;
    if (!hasAnyFieldMetaOverrides(meta[fid])) delete meta[fid];
    S()._fieldMeta = meta;
    window.FSV2._saveFieldMeta(integId, meta);
    window.FSV2.renderDetailFormFields();
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
    window.FSV2._saveFieldMeta(integId, meta);
    window.FSV2.renderDetailFormFields();
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
    window.FSV2._saveFieldMeta(integId, meta);
    window.FSV2.renderDetailFormFields();
    window.FSV2.renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleShowHidden() {
    S()._showHiddenFields = !S()._showHiddenFields;
    window.FSV2.renderDetailFormFields();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleRefreshFormFields() {
    var integration = S().detail && S().detail.integration;
    if (integration && integration.source_type === 'generic_webhook') {
      // Re-load submissions and re-extract field names from the latest payload
      var id = S().activeId;
      if (!id) return;
      S().detailFormFields = 'loading';
      window.FSV2.renderDetailFormFields();
      try {
        var subBody = await window.FSV2.api('/integrations/' + id + '/submissions');
        S().submissions = subBody.data || [];
        window.FSV2.extractGenericWebhookFields();
      } catch (e) {
        S().detailFormFields = [];
        window.FSV2.showAlert('Vernieuwen mislukt: ' + e.message, 'error');
      }
      window.FSV2.renderDetailFormFields();
      window.FSV2.renderDetailMappings();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }
    var sk  = integration && integration.site_key;
    var fid = integration && integration.forminator_form_id;
    if (!fid) return;
    await window.FSV2.fetchDetailFormFields(sk || null, fid);
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
      window.FSV2._saveFieldMeta(integId, meta);
    }
  }

  async function fetchDetailFormFields(sk, fid) {
    S().detailFormFields = 'loading';
    window.FSV2.renderDetailFormFields();
    window.FSV2.renderDetailMappings();
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
    window.FSV2.renderDetailFormFields();
    window.FSV2.renderDetailMappings();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }


  Object.assign(window.FSV2, {
    extractGenericWebhookFields: extractGenericWebhookFields,
    fetchDetailFormFields: fetchDetailFormFields,
    handleRefreshFormFields: handleRefreshFormFields,
    handleSaveBulkImportDefault: handleSaveBulkImportDefault,
    handleSaveFieldAlias: handleSaveFieldAlias,
    handleToggleBulkImportShow: handleToggleBulkImportShow,
    handleToggleFieldHidden: handleToggleFieldHidden,
    handleToggleShowHidden: handleToggleShowHidden,
    handleToggleShowInList: handleToggleShowInList,
    renderDetailFormFields: renderDetailFormFields
  });
})();
