/**
 * Forminator Sync V2 — MappingTable (shared component)
 *
 * ONE implementation. Used identically by wizard and detail.
 * No showUpdateColumn flag, no conditional branches — same HTML always.
 *
 * Dependencies:
 *   forminator-sync-v2-core.js    (FSV2.esc, FSV2.suggestOdooField, FSV2.renderStaticInput)
 *   field-picker-component.js     (window.OpenVME.FieldPicker)
 */
(function () {
  'use strict';

  if (!window.FSV2) { console.error('[FSV2] MappingTable: core niet geladen.'); return; }

  function esc(v) { return window.FSV2.esc(v); }

  function buildOdooOpts(suggested, preselected, odooCache, odooLoaded) {
    var sel  = preselected || suggested || '';
    var opts = '<option value="">\u2014 niet koppelen \u2014</option>';
    if (!odooLoaded) {
      opts += '<option disabled>\u2026 Odoo velden laden \u2026</option>';
    } else {
      opts += odooCache.map(function (f) {
        return '<option value="' + esc(f.name) + '"' + (f.name === sel ? ' selected' : '') + '>' +
          esc(f.label || f.name) + ' (' + esc(f.name) + ')</option>';
      }).join('');
    }
    return opts;
  }

  function placeholderChips(targetId, flatFields) {
    if (!flatFields || !flatFields.length) return '';
    return '<div class="flex flex-wrap gap-1 mt-1.5 items-center">' +
      '<span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>' +
      flatFields.map(function (f) {
        var fid = String(f.field_id);
        return '<button type="button"' +
          ' class="badge badge-outline badge-xs cursor-pointer hover:badge-primary insert-placeholder font-mono"' +
          ' data-field="' + esc(fid) + '" data-target="' + esc(targetId) + '"' +
          ' title="' + esc(f.label || fid) + '">' + esc(fid) + '</button>';
      }).join('') + '</div>';
  }

  function valueInput(fieldName, value, nameAttr, idStr, odooCache, flatFields) {
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
      (chipTarget ? placeholderChips(chipTarget, flatFields) : '') + '</div>';
  }

  function render(containerId, cfg) {
    var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;

    var flatFields = cfg.flatFields     || [];
    var topLevel   = cfg.topLevelFields || flatFields;
    var odooCache  = cfg.odooCache      || [];
    var odooLoaded = !!cfg.odooLoaded;
    var extraRows  = cfg.extraRows      || [];
    var autoIds    = cfg.autoIdentifiers || ['email', 'email_from', 'x_email', 'vat', 'ref'];

    // Section 1: form field rows
    var formRowsHtml = flatFields.length === 0
      ? '<tr><td colspan="5" class="text-sm text-base-content/40 italic py-3">Geen formuliervelden gevonden voor dit formulier.</td></tr>'
      : flatFields.map(function (f) {
          var fid           = String(f.field_id);
          var existing      = cfg.existingFormMappings ? (cfg.existingFormMappings[fid] || null) : null;
          var preselected   = existing ? existing.odoo_field : null;
          var suggested     = preselected || window.FSV2.suggestOdooField(fid, f.label || '', cfg.odooModel || '');
          var isIdentifier  = existing ? !!existing.is_identifier          : autoIds.includes(suggested);
          var isUpdateField = existing ? existing.is_update_field !== false : true;
          var isSubField    = !topLevel.find(function (pf) { return String(pf.field_id) === fid; });
          return '<tr' + (isSubField ? ' class="bg-base-200/30"' : '') + '>' +
            '<td class="align-middle py-2">' +
              (isSubField ? '<span class="text-base-content/40 mr-1">\u21b3</span>' : '') +
              '<span class="font-medium text-sm">' + esc(f.label || fid) + '</span>' +
              '<br><span class="font-mono text-xs text-base-content/40">' + esc(fid) + '</span>' +
            '</td>' +
            '<td class="py-1"><span class="badge badge-ghost badge-xs">' + esc(f.type || '') + '</span></td>' +
            '<td class="py-1.5 min-w-52">' +
              window.OpenVME.FieldPicker.render(
                (cfg.namePrefix || 'ff-') + 'fsp-' + fid,
                (cfg.namePrefix || '') + 'odoo-' + fid,
                odooCache,
                preselected || ''
              ) +
            '</td>' +
            '<td class="text-center py-2">' +
              '<input type="checkbox" class="checkbox checkbox-xs ' + esc(cfg.idCheckClass || '') + '"' +
              ' name="' + esc(cfg.checkPrefix || '') + 'identifier-' + esc(fid) + '"' +
              ' title="Identifier: gebruikt om bestaand record op te zoeken voor update"' +
              (isIdentifier ? ' checked' : '') + '>' +
            '</td>' +
            '<td class="text-center py-2">' +
              '<input type="checkbox" class="checkbox checkbox-xs ' + esc(cfg.updCheckClass || '') + '"' +
              ' name="' + esc(cfg.checkPrefix || '') + 'update-' + esc(fid) + '"' +
              ' title="Bijwerken: schrijf dit veld ook bij updates (uitvinken = alleen bij aanmaken)"' +
              (isUpdateField ? ' checked' : '') + '>' +
            '</td>' +
          '</tr>';
        }).join('');

    // Section 2: existing extra rows
    var extraRowsHtml = extraRows.map(function (em, idx) {
      var tname     = (cfg.extraRowPrefix || 'extra-') + idx;
      var inputId   = (cfg.extraInputPrefix || 'inp-') + tname;
      var meta      = odooCache.find(function (f) { return f.name === em.odooField; }) || null;
      var ftype     = meta ? meta.type : '';
      var typeBadge = ftype ? ' <span class="badge badge-ghost badge-xs font-mono ml-1 align-middle">' + esc(ftype) + '</span>' : '';
      return '<tr class="bg-warning/5">' +
        '<td class="align-middle py-2 whitespace-nowrap">' +
          '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' + typeBadge +
          '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
        '</td>' +
        '<td class="py-1"><span class="badge badge-ghost badge-xs">vast/sjabloon</span></td>' +
        '<td class="py-1.5">' +
          valueInput(em.odooField, em.staticValue || '', tname, ' id="' + esc(inputId) + '"', odooCache, flatFields) +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs ' + esc(cfg.extraIdCheckClass || '') + '"' +
          ' name="' + esc(cfg.extraRowPrefix || 'extra-') + 'identifier-' + idx + '"' +
          ' title="Identifier: gebruik als zoekcriterium"' + (em.isIdentifier ? ' checked' : '') + '>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" class="checkbox checkbox-xs ' + esc(cfg.extraUpdCheckClass || '') + '"' +
          ' name="' + esc(cfg.extraRowPrefix || 'extra-') + 'update-' + idx + '"' +
          ' title="Bijwerken: schrijf dit veld ook bij updates"' + (em.isUpdateField !== false ? ' checked' : '') + '>' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<button type="button" class="btn btn-ghost btn-xs text-error"' +
          ' data-action="' + esc(cfg.removeAction || '') + '" data-idx="' + idx + '" title="Verwijder">' +
          '<i data-lucide="x" class="w-3 h-3"></i></button>' +
        '</td></tr>';
    }).join('');

    // Add-extra footer row
    var emptyVal = valueInput('', '', null, ' id="' + esc(cfg.extraValueInputId) + '"', odooCache, flatFields);
    var addFooterRow =
      '<tr class="border-t-2 border-base-300">' +
        '<td class="py-2 min-w-40" colspan="2">' +
          window.OpenVME.FieldPicker.render(cfg.fspId, '--unused--', odooCache, '') +
          '<span class="text-xs text-base-content/40 mt-0.5 block">' +
            (odooLoaded ? odooCache.length + ' velden beschikbaar' : '<span class="loading loading-xs loading-spinner inline-block"></span>') +
          '</span>' +
        '</td>' +
        '<td class="py-2 min-w-52"><div id="' + esc(cfg.extraValueWrapId) + '">' + emptyVal + '</div></td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" id="' + esc(cfg.extraIsIdentifierId || '') + '" class="checkbox checkbox-xs" title="Identifier" />' +
        '</td>' +
        '<td class="text-center py-2">' +
          '<input type="checkbox" id="' + esc(cfg.extraIsUpdateFieldId || '') + '" class="checkbox checkbox-xs" title="Bijwerken bij updates" checked />' +
        '</td>' +
        '<td class="py-2 text-right">' +
          '<button type="button" class="btn btn-outline btn-xs" data-action="' + esc(cfg.addAction || '') + '">+ Voeg toe</button>' +
        '</td>' +
      '</tr>';

    var wrapOpen = cfg.targetId
      ? '<div id="mappingEditor" data-target-id="' + esc(String(cfg.targetId)) + '">'
      : '<div>';

    container.innerHTML =
      wrapOpen +
      '<div class="mb-6">' +
        '<h4 class="font-medium text-sm mb-3 flex items-center gap-2">' +
          '<i data-lucide="link" class="w-4 h-4 text-primary"></i> Formuliervelden koppelen aan Odoo' +
          (!odooLoaded ? ' <span class="loading loading-xs loading-spinner ml-1"></span>' : '') +
        '</h4>' +
        '<div class="overflow-x-auto">' +
          '<table class="table table-sm">' +
            '<thead><tr>' +
              '<th class="font-normal text-xs text-base-content/50">Formulier veld</th><th class="font-normal text-xs text-base-content/50">Type</th><th class="font-normal text-xs text-base-content/50">Koppelen aan Odoo veld</th>' +
              '<th class="text-center font-normal" title="Identifier: gebruik als zoekcriterium bij record matching"><i data-lucide="key" class="w-3.5 h-3.5 inline-block opacity-50"></i></th>' +
              '<th class="text-center font-normal" title="Bijwerken: schrijf dit veld ook wanneer een bestaand record wordt bijgewerkt"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block opacity-50"></i></th>' +
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
        '<h4 class="font-medium text-sm mb-2 flex items-center gap-2">' +
          '<i data-lucide="tag" class="w-4 h-4 text-warning"></i> Extra Odoo-velden met vaste waarde' +
        '</h4>' +
        '<div class="overflow-x-auto">' +
          '<table class="table table-sm">' +
            '<thead><tr>' +
              '<th class="font-normal text-xs text-base-content/50" colspan="2">Odoo veld</th><th class="font-normal text-xs text-base-content/50">Waarde / sjabloon</th>' +
              '<th class="text-center font-normal" title="Identifier"><i data-lucide="key" class="w-3.5 h-3.5 inline-block opacity-50"></i></th>' +
              '<th class="text-center font-normal" title="Bijwerken bij update"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block opacity-50"></i></th>' +
              '<th></th>' +
            '</tr></thead>' +
            '<tbody>' + (extraRowsHtml || '<tr><td colspan="6" class="text-xs text-base-content/40 italic py-2">Nog geen extra velden toegevoegd.</td></tr>') + '</tbody>' +
            '<tfoot>' + addFooterRow + '</tfoot>' +
          '</table>' +
        '</div>' +
      '</div>' +
      (cfg.saveAction
        ? '<div class="mt-6 flex justify-end">' +
            '<button type="button" class="btn btn-primary" data-action="' + esc(cfg.saveAction) + '">' +
              '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Koppelingen opslaan' +
            '</button>' +
          '</div>'
        : '') +
      '</div>';

    var fspVal = document.getElementById('fsp-val-' + cfg.fspId);
    if (fspVal) {
      fspVal.addEventListener('change', function () {
        var wrap = document.getElementById(cfg.extraValueWrapId);
        if (!wrap) return;
        wrap.innerHTML = valueInput(fspVal.value || '', '', null, ' id="' + esc(cfg.extraValueInputId) + '"', odooCache, flatFields);
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      });
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  window.FSV2.MappingTable = { render: render, buildOdooOpts: buildOdooOpts, placeholderChips: placeholderChips, valueInput: valueInput };

}());
