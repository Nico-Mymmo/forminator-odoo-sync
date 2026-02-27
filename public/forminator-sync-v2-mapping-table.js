/**
 * Forminator Sync V2 — MappingTable
 *
 * Shared mapping-table component used by both the wizard and the detail view.
 * Eliminates the duplicate buildOdooOpts / placeholderChips / valueInput logic
 * that previously lived independently in wizard.js and detail.js.
 *
 * Usage:
 *   window.FSV2.MappingTable.render(containerId, cfg);
 *
 * cfg shape — see render() JSDoc below.
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2.esc, FSV2.suggestOdooField,
 *               FSV2.renderStaticInput), field-picker-component.js (OpenVME.FieldPicker)
 */
(function () {
  'use strict';

  if (!window.FSV2) {
    console.error('[FSV2] MappingTable: core niet geladen.');
    return;
  }

  function esc(v) { return window.FSV2.esc(v); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS  (pure — no access to S())
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Builds <option> list for the Odoo-field <select>.
   * @param {string} suggested   - auto-suggested field name
   * @param {string} preselected - existing DB value (overrides suggestion)
   * @param {Array}  odooCache
   * @param {boolean} odooLoaded
   */
  function buildOdooOpts(suggested, preselected, odooCache, odooLoaded) {
    var sel  = preselected || suggested || '';
    var opts = '<option value="">\u2014 niet koppelen \u2014</option>';
    if (!odooLoaded) {
      opts += '<option disabled>\u2026 Odoo velden laden \u2026</option>';
    } else {
      opts += odooCache.map(function (f) {
        var isSel = (f.name === sel) ? ' selected' : '';
        return '<option value="' + esc(f.name) + '"' + isSel + '>' +
          esc(f.label || f.name) + ' (' + esc(f.name) + ')</option>';
      }).join('');
    }
    return opts;
  }

  /**
   * Renders insert-placeholder chip row for template/text inputs.
   * @param {string} targetId - value of data-target on each chip
   * @param {Array}  flatFields
   */
  function placeholderChips(targetId, flatFields) {
    if (!flatFields || !flatFields.length) return '';
    return '<div class="flex flex-wrap gap-1 mt-1.5 items-center">' +
      '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>' +
      flatFields.map(function (f) {
        var fid = String(f.field_id);
        return '<button type="button"' +
          ' class="badge badge-outline badge-xs cursor-pointer hover:badge-primary insert-placeholder font-mono"' +
          ' data-field="' + esc(fid) + '" data-target="' + esc(targetId) + '"' +
          ' title="' + esc(f.label || fid) + '">' +
          esc(fid) +
          '</button>';
      }).join('') +
      '</div>';
  }

  /**
   * Renders the right control (checkbox/select/number/text+chips) for a
   * mapping's value cell.
   * Delegates boolean + selection to FSV2.renderStaticInput (from wizard.js).
   */
  function valueInput(fieldName, value, nameAttr, idStr, odooCache, flatFields) {
    var meta  = fieldName
      ? (odooCache.find(function (f) { return f.name === fieldName; }) || null)
      : null;
    var ftype = (meta && meta.type) || '';
    idStr = idStr || '';

    if (ftype === 'boolean' ||
        (ftype === 'selection' && meta && meta.selection && meta.selection.length)) {
      return window.FSV2.renderStaticInput(nameAttr, meta, value, idStr);
    }

    var nameA = nameAttr ? ' name="' + esc(nameAttr) + '"' : '';

    if (ftype === 'many2one') {
      return '<div>' +
        '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
          ' value="' + esc(value || '') + '"' +
          ' placeholder="Numeriek Odoo-record ID\u2026" />' +
        '<p class="text-xs text-base-content/40 mt-1">' +
          '<i data-lucide="info" class="w-3 h-3 inline -mt-0.5 mr-0.5"></i>' +
          'Geef het numerieke ID op van het gekoppelde record.' +
        '</p>' +
        '</div>';
    }

    if (ftype === 'integer' || ftype === 'float') {
      return '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' type="number"' +
        ' value="' + esc(value || '') + '"' +
        ' placeholder="Getal\u2026" />';
    }

    var idMatch    = idStr.match(/id="([^"]+)"/);
    var chipTarget = idMatch ? idMatch[1] : null;
    return '<div>' +
      '<input class="input input-bordered input-sm w-full"' + nameA + idStr +
        ' value="' + esc(value || '') + '"' +
        ' placeholder="Vaste waarde of {veld-id} sjabloon\u2026" />' +
      (chipTarget ? placeholderChips(chipTarget, flatFields) : '') +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Renders the full mapping section into `containerId`.
   *
   * @param {string} containerId  - id of the DOM element to fill
   * @param {Object} cfg
   *
   * Required:
   *   cfg.flatFields          {Array}  - flattened form fields (no SKIP_TYPES)
   *   cfg.topLevelFields      {Array}  - non-flattened fields (for sub-field detection)
   *   cfg.odooCache           {Array}  - Odoo field list
   *   cfg.odooLoaded          {bool}
   *   cfg.odooModel           {string} - for suggestOdooField
   *   cfg.existingFormMappings {Object} - {field_id: {odoo_field, is_identifier, is_update_field}}
   *   cfg.extraRows           {Array}  - [{odooField, odooLabel, staticValue, isIdentifier, isUpdateField}]
   *
   * Context flags:
   *   cfg.showUpdateColumn    {bool}   - true = detail: show "Bijwerken" column
   *
   * CSS / name config:
   *   cfg.selectClass         {string} - class on form-field <select>
   *   cfg.idCheckClass        {string} - class on identifier checkbox (form rows)
   *   cfg.updCheckClass       {string} - class on update checkbox (form rows, detail only)
   *   cfg.namePrefix          {string} - e.g. 'ff-' (wizard) or 'det-ff-' (detail)
   *   cfg.extraRowPrefix      {string} - prefix for extra row names, e.g. 'extra-static-' / 'det-extra-'
   *   cfg.extraInputPrefix    {string} - id prefix for extra value inputs, e.g. 'inp-' / 'det-inp-'
   *   cfg.extraIdCheckClass   {string} - class on extra identifier checkbox (detail)
   *   cfg.extraUpdCheckClass  {string} - class on extra update checkbox (detail)
   *
   * data-action names:
   *   cfg.addAction           {string} - e.g. 'wizard-add-extra-row'
   *   cfg.removeAction        {string} - e.g. 'wizard-remove-extra-row'
   *   cfg.saveAction          {string|null}
   *
   * FieldPicker config:
   *   cfg.fspId               {string} - e.g. 'wizard-extra-add'
   *   cfg.extraValueWrapId    {string} - id of the value-input wrapper div
   *   cfg.extraValueInputId   {string} - id of the value input itself
   *   cfg.extraIsIdentifierId {string|null} - id of identifier checkbox in add-row footer (detail)
   *   cfg.extraIsUpdateFieldId {string|null}
   *
   * Optional:
   *   cfg.targetId            {string|null} - data-target-id on the editor wrapper (detail)
   *   cfg.autoIdentifiers     {Array}  - default: ['email','email_from','x_email','vat','ref']
   */
  function render(containerId, cfg) {
    var container = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;
    if (!container) return;

    var flatFields   = cfg.flatFields   || [];
    var topLevel     = cfg.topLevelFields || flatFields;
    var odooCache    = cfg.odooCache    || [];
    var odooLoaded   = !!cfg.odooLoaded;
    var extraRows    = cfg.extraRows    || [];
    var showUpdate   = !!cfg.showUpdateColumn;
    var autoIds      = cfg.autoIdentifiers || ['email', 'email_from', 'x_email', 'vat', 'ref'];

    var ffColCount   = showUpdate ? 5 : 4;

    // ── Section 1: form fields → Odoo select ─────────────────────────────
    var formRowsHtml;
    if (flatFields.length === 0) {
      formRowsHtml = '<tr><td colspan="' + ffColCount + '"' +
        ' class="text-sm text-base-content/40 italic py-3">' +
        'Geen formuliervelden gevonden voor dit formulier.</td></tr>';
    } else {
      formRowsHtml = flatFields.map(function (f) {
        var fid          = String(f.field_id);
        var existing     = cfg.existingFormMappings ? cfg.existingFormMappings[fid] || null : null;
        var preselected  = existing ? existing.odoo_field  : null;
        var suggested    = preselected || window.FSV2.suggestOdooField(fid, f.label || '', cfg.odooModel || '');
        var isIdentifier  = existing ? !!existing.is_identifier          : autoIds.includes(suggested);
        var isUpdateField = existing ? existing.is_update_field !== false : true;
        var isSubField    = !topLevel.find(function (pf) { return String(pf.field_id) === fid; });

        var row = '<tr' + (isSubField ? ' class="bg-base-200/30"' : '') + '>' +
          '<td class="align-middle py-2">' +
            (isSubField ? '<span class="text-base-content/40 mr-1">\u21b3</span>' : '') +
            '<span class="font-medium text-sm">' + esc(f.label || fid) + '</span>' +
            '<br><span class="font-mono text-xs text-base-content/40">' + esc(fid) + '</span>' +
          '</td>' +
          '<td class="py-1"><span class="badge badge-ghost badge-xs">' + esc(f.type || '') + '</span></td>' +
          '<td class="py-1.5 min-w-52">' +
            '<select class="select select-bordered select-sm w-full ' + (cfg.selectClass || '') + '"' +
              ' name="' + esc(cfg.namePrefix || '') + 'odoo-' + esc(fid) + '">' +
              buildOdooOpts(suggested, preselected, odooCache, odooLoaded) +
            '</select>' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" class="checkbox checkbox-xs ' + (cfg.idCheckClass || '') + '"' +
            ' name="' + esc(cfg.checkPrefix || cfg.namePrefix || '') + 'identifier-' + esc(fid) + '"' +
            ' title="Identifier: gebruikt om bestaand record op te zoeken voor update"' +
            (isIdentifier ? ' checked' : '') + '>' +
          '</td>';

        if (showUpdate) {
          row += '<td class="text-center py-2">' +
            '<input type="checkbox" class="checkbox checkbox-xs ' + (cfg.updCheckClass || '') + '"' +
            ' name="' + esc(cfg.checkPrefix || cfg.namePrefix || '') + 'update-' + esc(fid) + '"' +
            ' title="Bijwerken: schrijf dit veld ook bij updates (uitvinken = alleen bij aanmaken)"' +
            (isUpdateField ? ' checked' : '') + '>' +
          '</td>';
        }

        row += '</tr>';
        return row;
      }).join('');
    }

    // ── Section 2: extra static/template rows ────────────────────────────
    var extraRowsHtml = extraRows.map(function (em, idx) {
      var tname     = (cfg.extraRowPrefix || 'extra-') + idx;
      var inputId   = (cfg.extraInputPrefix || 'inp-') + tname;
      var meta      = odooCache.find(function (f) { return f.name === em.odooField; }) || null;
      var ftype     = meta ? meta.type : '';
      var typeBadge = ftype
        ? ' <span class="badge badge-ghost badge-xs font-mono ml-1 align-middle">' + esc(ftype) + '</span>'
        : '';

      var row = '<tr class="bg-warning/5">' +
        '<td class="align-middle py-2 whitespace-nowrap">' +
          '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' + typeBadge +
          '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
        '</td>';

      if (showUpdate) {
        row += '<td class="py-1"><span class="badge badge-ghost badge-xs">vast/sjabloon</span></td>';
      }

      row += '<td class="py-1.5">' +
        valueInput(em.odooField, em.staticValue || '', tname, ' id="' + esc(inputId) + '"', odooCache, flatFields) +
      '</td>';

      if (showUpdate) {
        row += '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs ' + (cfg.extraIdCheckClass || '') + '"' +
          ' name="' + esc(cfg.extraRowPrefix || 'extra-') + 'identifier-' + idx + '"' +
          ' title="Identifier: gebruik als zoekcriterium"' +
          (em.isIdentifier ? ' checked' : '') + '>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs ' + (cfg.extraUpdCheckClass || '') + '"' +
          ' name="' + esc(cfg.extraRowPrefix || 'extra-') + 'update-' + idx + '"' +
          ' title="Bijwerken: schrijf dit veld ook bij updates"' +
          (em.isUpdateField !== false ? ' checked' : '') + '>' +
        '</td>';
      }

      row += '<td class="' + (showUpdate ? 'text-center' : 'text-right') + ' py-2">' +
        '<button type="button" class="btn btn-ghost btn-xs text-error"' +
        ' data-action="' + esc(cfg.removeAction || '') + '" data-idx="' + idx + '" title="Verwijder">' +
        '<i data-lucide="x" class="w-3 h-3"></i></button>' +
        '</td></tr>';

      return row;
    }).join('');

    // ── Add-extra footer (two layouts) ────────────────────────────────────
    var emptyValueHtml = valueInput('', '', null,
      ' id="' + esc(cfg.extraValueInputId) + '"', odooCache, flatFields);

    var addExtraHtml;
    if (showUpdate) {
      // Detail style: tfoot row inside the extra table
      addExtraHtml =
        '<tr class="border-t-2 border-base-300">' +
          '<td class="py-2 min-w-40">' +
            window.OpenVME.FieldPicker.render(cfg.fspId, '--unused--', odooCache, '') +
            '<span class="text-xs text-base-content/40 mt-0.5 block">' +
              (odooLoaded
                ? odooCache.length + ' velden beschikbaar'
                : '<span class="loading loading-xs loading-spinner inline-block"></span>') +
            '</span>' +
          '</td>' +
          '<td class="py-2 text-center"><span class="badge badge-ghost badge-xs">nieuw</span></td>' +
          '<td class="py-2 min-w-52">' +
            '<div id="' + esc(cfg.extraValueWrapId) + '">' + emptyValueHtml + '</div>' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" id="' + esc(cfg.extraIsIdentifierId || '') + '"' +
            ' class="checkbox checkbox-xs" title="Identifier: gebruik als zoekcriterium" />' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" id="' + esc(cfg.extraIsUpdateFieldId || '') + '"' +
            ' class="checkbox checkbox-xs" title="Bijwerken: schrijf ook bij updates" checked />' +
          '</td>' +
          '<td class="py-2 text-right">' +
            '<button type="button" class="btn btn-outline btn-xs"' +
            ' data-action="' + esc(cfg.addAction || '') + '">+ Voeg toe</button>' +
          '</td>' +
        '</tr>';
    } else {
      // Wizard style: separate card below the form-fields table
      addExtraHtml =
        '<div class="divider text-xs text-base-content/40 mt-4">' +
          'Extra Odoo-veld toevoegen (vaste waarde / sjabloon)' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">' +
          '<div class="form-control">' +
            '<label class="label py-0 pb-1">' +
              '<span class="label-text text-xs">Odoo veld</span>' +
              '<span class="label-text-alt text-xs text-base-content/40">' +
                (odooLoaded
                  ? odooCache.length + ' velden beschikbaar'
                  : '<span class="loading loading-xs loading-spinner"></span> laden\u2026') +
              '</span>' +
            '</label>' +
            window.OpenVME.FieldPicker.render(cfg.fspId, '--unused--', odooCache, '') +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label py-0 pb-1"><span class="label-text text-xs">Waarde</span></label>' +
            '<div id="' + esc(cfg.extraValueWrapId) + '">' + emptyValueHtml + '</div>' +
          '</div>' +
          '<div class="pt-5">' +
            '<button type="button" class="btn btn-outline btn-sm w-full"' +
            ' data-action="' + esc(cfg.addAction || '') + '">+ Voeg toe</button>' +
          '</div>' +
        '</div>';
    }

    // ── Assemble HTML ────────────────────────────────────────────────────
    var wrapperOpen = cfg.targetId
      ? '<div id="detailMappingEditor" data-target-id="' + esc(String(cfg.targetId)) + '">'
      : '<div>';

    var formSection =
      '<div class="mb-6">' +
        '<h4 class="font-semibold text-sm mb-3 flex items-center gap-2">' +
          '<i data-lucide="link" class="w-4 h-4 text-primary"></i>' +
          ' Formuliervelden koppelen aan Odoo' +
          (!odooLoaded ? ' <span class="loading loading-xs loading-spinner ml-1"></span>' : '') +
        '</h4>' +
        '<div class="overflow-x-auto">' +
          '<table class="table table-sm">' +
            '<thead><tr>' +
              '<th>Formulier veld</th>' +
              '<th>Type</th>' +
              '<th>Koppelen aan Odoo veld</th>' +
              '<th class="text-center" title="Identifier: gebruik als zoekcriterium bij record matching">' +
                '<i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i>' +
              '</th>' +
              (showUpdate
                ? '<th class="text-center" title="Bijwerken: schrijf dit veld ook wanneer een bestaand record wordt bijgewerkt">' +
                    '<i data-lucide="pencil" class="w-3.5 h-3.5 inline-block"></i>' +
                  '</th>'
                : '') +
            '</tr></thead>' +
            '<tbody>' + formRowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="text-xs text-base-content/40 mt-2">' +
          (showUpdate
            ? '<i data-lucide="key" class="w-3 h-3 inline -mt-0.5"></i> Identifier = record opzoeken. ' +
              '<i data-lucide="pencil" class="w-3 h-3 inline -mt-0.5"></i> Bijwerken = ook schrijven bij update (uitvinken = alleen bij aanmaken).'
            : 'Rijen zonder geselecteerd Odoo veld worden genegeerd.') +
        '</p>' +
      '</div>';

    var extraSection;
    if (showUpdate) {
      // Detail: extra rows + footer all in one table
      extraSection =
        '<div>' +
          '<h4 class="font-semibold text-sm mb-2 flex items-center gap-2">' +
            '<i data-lucide="tag" class="w-4 h-4 text-warning"></i>' +
            ' Extra Odoo-velden met vaste waarde' +
          '</h4>' +
          '<div class="overflow-x-auto">' +
            '<table class="table table-sm">' +
              '<thead><tr>' +
                '<th>Odoo veld</th><th>Type</th><th>Waarde / sjabloon</th>' +
                '<th class="text-center" title="Identifier"><i data-lucide="key" class="w-3.5 h-3.5 inline-block"></i></th>' +
                '<th class="text-center" title="Bijwerken bij update"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block"></i></th>' +
                '<th></th>' +
              '</tr></thead>' +
              '<tbody>' +
                (extraRowsHtml || '<tr><td colspan="6" class="text-xs text-base-content/40 italic py-2">Nog geen extra velden toegevoegd.</td></tr>') +
              '</tbody>' +
              '<tfoot>' + addExtraHtml + '</tfoot>' +
            '</table>' +
          '</div>' +
        '</div>';
    } else {
      // Wizard: extra rows as separate table + add-card below
      extraSection =
        '<div>' +
          '<h4 class="font-semibold text-sm mb-2 flex items-center gap-2">' +
            '<i data-lucide="tag" class="w-4 h-4 text-warning"></i>' +
            ' Extra Odoo-velden met vaste waarde' +
          '</h4>' +
          (extraRows.length > 0
            ? '<div class="overflow-x-auto mb-3">' +
                '<table class="table table-sm">' +
                  '<thead><tr><th>Odoo veld</th><th>Vaste waarde / sjabloon</th><th></th></tr></thead>' +
                  '<tbody>' + extraRowsHtml + '</tbody>' +
                '</table>' +
              '</div>'
            : '') +
          addExtraHtml +
        '</div>';
    }

    var saveButtonHtml = cfg.saveAction
      ? '<div class="mt-6 flex justify-end">' +
          '<button type="button" class="btn btn-primary" data-action="' + esc(cfg.saveAction) + '">' +
            '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Koppelingen opslaan' +
          '</button>' +
        '</div>'
      : '';

    container.innerHTML = wrapperOpen + formSection + extraSection + saveButtonHtml + '</div>';

    // ── Reactive: FieldPicker → rebuild value input ───────────────────────
    var fspVal = document.getElementById('fsp-val-' + cfg.fspId);
    if (fspVal) {
      fspVal.addEventListener('change', function () {
        var wrap = document.getElementById(cfg.extraValueWrapId);
        if (!wrap) return;
        wrap.innerHTML = valueInput(
          fspVal.value || '', '', null,
          ' id="' + esc(cfg.extraValueInputId) + '"',
          odooCache, flatFields
        );
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  window.FSV2.MappingTable = {
    render:           render,
    buildOdooOpts:    buildOdooOpts,
    placeholderChips: placeholderChips,
    valueInput:       valueInput,
  };

}());
