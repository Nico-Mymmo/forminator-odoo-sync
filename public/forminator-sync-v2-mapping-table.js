/**
 * Forminator Sync V2 \u2014 MappingTable (shared component)
 *
 * ONE implementation. Used identically by wizard and detail.
 * No showUpdateColumn flag, no conditional branches \u2014 same HTML always.
 *
 * Dependencies:
 *   forminator-sync-v2-core.js    (FSV2.esc, FSV2.suggestOdooField)
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

  // renderStaticInput: renders the right control based on Odoo field type
  function renderStaticInput(name, meta, value, extraAttrs) {
    var type     = (meta && meta.type) || '';
    var nameAttr = name ? (' name="' + esc(name) + '"') : '';
    var extra    = extraAttrs || '';
    var selCls   = 'select select-bordered select-sm w-full';
    var inpCls   = 'input input-bordered input-sm w-full';
    if (type === 'boolean') {
      var ja  = (value === '1' || value === 'true')  ? ' selected' : '';
      var nee = (value === '0' || value === 'false') ? ' selected' : '';
      return '<select class="' + selCls + '"' + nameAttr + extra + '>'
        + '<option value="">&mdash; geen &mdash;</option>'
        + '<option value="1"' + ja  + '>Ja</option>'
        + '<option value="0"' + nee + '>Nee</option>'
        + '</select>';
    }
    if (type === 'selection' && meta.selection && meta.selection.length) {
      return '<select class="' + selCls + '"' + nameAttr + extra + '>'
        + '<option value="">&mdash; geen &mdash;</option>'
        + meta.selection.map(function (opt) {
            var k = String(opt[0]);
            var l = String(opt[1]);
            return '<option value="' + esc(k) + '"' + (value === k ? ' selected' : '') + '>' + esc(l) + '</option>';
          }).join('')
        + '</select>';
    }
    return '<input class="' + inpCls + '"' + nameAttr + extra + ' value="' + esc(value || '') + '" placeholder="Vaste waarde..." />';
  }

  function valueInput(fieldName, value, nameAttr, idStr, odooCache, flatFields) {
    var meta  = fieldName ? (odooCache.find(function (f) { return f.name === fieldName; }) || null) : null;
    var ftype = (meta && meta.type) || '';
    idStr = idStr || '';
    if (ftype === 'boolean' || (ftype === 'selection' && meta && meta.selection && meta.selection.length)) {
      return renderStaticInput(nameAttr, meta, value, idStr);
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
    var autoIds       = cfg.autoIdentifiers || ['email', 'email_from', 'x_email', 'vat', 'ref'];
    // Pipeline chaining: preceding steps passed from the detail view for multi-target integrations.
    var precedingSteps = cfg.precedingSteps || [];
    var stepBadge      = cfg.stepBadge || 0;

    // ── Operation-type selector (only when opTypeRadioName is provided) ────
    var opType = cfg.operationType || 'upsert';
    var opTypeSection = '';
    if (cfg.opTypeRadioName) {
      var opOpts = [
        { val: 'upsert',
          label: 'Zoeken \u2014 bijwerken of aanmaken',
          desc:  'Zoekt eerst via de identifier. Gevonden \u2192 bijwerken. Niet gevonden \u2192 nieuw aanmaken.' },
        { val: 'update_only',
          label: 'Alleen bijwerken (\u26a0\ufe0f nooit aanmaken)',
          desc:  'Zoekt eerst via de identifier. Gevonden \u2192 bijwerken. Niet gevonden \u2192 stap wordt stilzwijgend overgeslagen.' },
        { val: 'create',
          label: 'Altijd nieuw aanmaken (nooit zoeken)',
          desc:  'Maakt altijd een nieuw record aan. Er wordt nooit naar een bestaand record gezocht.' },
      ];
      opTypeSection =
        '<div class="mb-5 p-3.5 rounded-xl border border-base-300 bg-base-200/40">' +
          '<p class="text-xs font-semibold text-base-content/70 mb-2 flex items-center gap-1.5">' +
            '<i data-lucide="settings-2" class="w-3.5 h-3.5"></i> Gedrag bij verwerking' +
          '</p>' +
          '<div class="flex flex-col gap-1">' +
          opOpts.map(function (o) {
            var chk = (opType === o.val) ? ' checked' : '';
            return '<label class="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg border border-transparent hover:border-base-300 hover:bg-base-100 transition-colors" style="outline-offset:0">' +
              '<input type="radio" class="radio radio-xs radio-primary mt-0.5 shrink-0" name="' + esc(cfg.opTypeRadioName) + '" value="' + o.val + '"' + chk + '>' +
              '<div>' +
                '<p class="text-sm font-medium leading-snug">' + esc(o.label) + '</p>' +
                '<p class="text-xs text-base-content/50 mt-0.5">' + o.desc + '</p>' +
              '</div>' +
            '</label>';
          }).join('') +
          '</div>' +
        '</div>';
    }

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

      // ── Chain row: previous_step_output ─────────────────────────────────
      if (em.sourceType === 'previous_step_output') {
        var chainRef = em.staticValue || '';
        var chainMch = chainRef.match(/^step\.([^.]+)\.record_id$/);
        var chainLbl = '';
        if (chainMch) {
          var chainR     = chainMch[1];
          var chainFound = precedingSteps.find(function (s) { return String(s.order) === chainR || s.label === chainR; });
          chainLbl = chainFound
            ? ('Uitvoer van stap ' + chainFound.order + (chainFound.label ? ' \u2014 ' + esc(chainFound.label) : ''))
            : esc(chainRef);
        } else { chainLbl = esc(chainRef); }
        var chainWarn = (!em.isRequired)
          ? '<p class="text-xs text-warning/80 mt-0.5 flex items-center gap-1">' +
              '<i data-lucide="alert-triangle" class="w-3 h-3 shrink-0"></i>' +
              'Niet verplicht \u2192 ontbreekt het vorige Odoo-ID, dan wordt dit veld leeggelaten. Vink \u201cVerplicht\u201d aan om de hele stap te blokkeren als het ID er niet is.' +
            '</p>'
          : '';
        return '<tr class="bg-info/5">' +
          '<td class="align-middle py-2 whitespace-nowrap">' +
            '<span class="font-medium text-sm">' + esc(em.odooLabel || em.odooField) + '</span>' +
            '<br><span class="font-mono text-xs text-base-content/40">' + esc(em.odooField) + '</span>' +
          '</td>' +
          '<td class="py-1"><span class="badge badge-info badge-xs">stap-uitvoer</span></td>' +
          '<td class="py-1.5">' +
            '<input type="hidden" id="' + esc(inputId) + '" value="' + esc(chainRef) + '">' +
            '<span class="flex items-center gap-1.5 text-sm">' +
              '<i data-lucide="link-2" class="w-3.5 h-3.5 text-info shrink-0"></i>' +
              '<span>' + chainLbl + '</span>' +
            '</span>' +
            chainWarn +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" class="checkbox checkbox-xs ' + esc(cfg.extraIdCheckClass || '') + '"' +
            ' name="' + esc(cfg.extraRowPrefix || 'extra-') + 'identifier-' + idx + '"' +
            ' title="Identifier"' + (em.isIdentifier ? ' checked' : '') + '>' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<input type="checkbox" class="checkbox checkbox-xs ' + esc(cfg.extraUpdCheckClass || '') + '"' +
            ' name="' + esc(cfg.extraRowPrefix || 'extra-') + 'update-' + idx + '"' +
            ' title="Bijwerken bij updates"' + (em.isUpdateField !== false ? ' checked' : '') + '>' +
          '</td>' +
          '<td class="text-center py-2">' +
            '<button type="button" class="btn btn-ghost btn-xs text-error"' +
            ' data-action="' + esc(cfg.removeAction || '') + '" data-idx="' + idx + '" title="Verwijder">' +
            '<i data-lucide="x" class="w-3 h-3"></i></button>' +
          '</td></tr>';
      }

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

    // Add-extra row \u2014 rendered as a standalone div BELOW the table (not in tfoot)
    var emptyVal = valueInput('', '', null, ' id="' + esc(cfg.extraValueInputId) + '"', odooCache, flatFields);
    var addRowDiv =
      '<div class="flex flex-wrap items-start gap-2 pt-3 mt-1 border-t border-base-300">' +
        '<div class="flex-1 min-w-48 max-w-64">' +
          window.OpenVME.FieldPicker.render(cfg.fspId, '--unused--', odooCache, '') +
          '<span class="text-xs text-base-content/40 mt-1 block">' +
            (odooLoaded ? odooCache.length + ' velden beschikbaar' : '<span class="loading loading-xs loading-spinner inline-block"></span>') +
          '</span>' +
        '</div>' +
        '<div class="flex-1 min-w-40" id="' + esc(cfg.extraValueWrapId) + '">' + emptyVal + '</div>' +
        '<div class="flex items-center gap-3 pt-1">' +
          '<label class="flex items-center gap-1 cursor-pointer" title="Identifier: gebruik als zoekcriterium">' +
            '<input type="checkbox" id="' + esc(cfg.extraIsIdentifierId || '') + '" class="checkbox checkbox-xs" />' +
            '<span class="text-xs text-base-content/50"><i data-lucide="key" class="w-3 h-3 inline-block"></i></span>' +
          '</label>' +
          '<label class="flex items-center gap-1 cursor-pointer" title="Bijwerken bij updates">' +
            '<input type="checkbox" id="' + esc(cfg.extraIsUpdateFieldId || '') + '" class="checkbox checkbox-xs" checked />' +
            '<span class="text-xs text-base-content/50"><i data-lucide="pencil" class="w-3 h-3 inline-block"></i></span>' +
          '</label>' +
          '<button type="button" class="btn btn-outline btn-xs" data-action="' + esc(cfg.addAction || '') + '">+ Voeg toe</button>' +
        '</div>' +
      '</div>';

    // Step-chain section: only rendered when there are preceding steps (multi-target integrations).
    var stepChainDiv = '';
    if (precedingSteps.length > 0) {
      var stepOptions = precedingSteps.map(function (s) {
        var val = 'step.' + (s.label || s.order) + '.record_id';
        var lbl = 'Uitvoer van stap ' + s.order + (s.label ? ' \u2014 ' + s.label : '');
        return '<option value="' + esc(val) + '">' + esc(lbl) + '</option>';
      }).join('');
      stepChainDiv =
        '<div class="mt-4 pt-4 border-t border-base-300">' +
          '<h4 class="font-medium text-sm mb-1.5 flex items-center gap-2">' +
            '<i data-lucide="link-2" class="w-4 h-4 text-info"></i> Koppelen aan uitvoer vorige stap' +
          '</h4>' +
          '<p class="text-xs text-base-content/50 mb-3">' +
            'Vul een veld in dit record met het Odoo-ID dat de vorige stap opleverde.' +
            ' Voorbeeld: <code class="font-mono bg-base-200 px-1 rounded">partner_id</code> op een lead koppelen aan de contactpersoon die stap\u00a01 aanmaakte.' +
            ' <strong>Verplicht</strong> = blokkeer deze stap als het vorige ID ontbreekt.' +
          '</p>' +
          '<div class="flex flex-wrap items-start gap-2 pt-1">' +
            '<div class="flex-1 min-w-48 max-w-64">' +
              window.OpenVME.FieldPicker.render(cfg.chainFspId || (cfg.fspId + '-chain'), '--unused--', odooCache, '') +
            '</div>' +
            '<div class="flex-1 min-w-44">' +
              '<select id="' + esc(cfg.chainStepSelectId || 'chainStepSelect') + '" class="select select-bordered select-sm w-full">' +
                '<option value="">\u2014 kies stap \u2014</option>' +
                stepOptions +
              '</select>' +
            '</div>' +
            '<div class="flex items-center gap-3 pt-1">' +
              '<label class="flex items-center gap-1 cursor-pointer" title="Verplicht: blokkeer uitvoering als stap-ID ontbreekt">' +
                '<input type="checkbox" id="' + esc(cfg.chainIsRequiredId || 'chainIsRequired') + '" class="checkbox checkbox-xs" checked>' +
                '<span class="text-xs text-base-content/50">Verplicht</span>' +
              '</label>' +
              '<button type="button" class="btn btn-outline btn-xs btn-info" data-action="' + esc(cfg.addChainAction || '') + '">+ Voeg stap-uitvoer toe</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    var wrapOpen = cfg.targetId
      ? '<div id="mappingEditor" data-target-id="' + esc(String(cfg.targetId)) + '">'
      : '<div>';

    container.innerHTML =
      wrapOpen +
      (opTypeSection || '') +
      '<div class="mb-6">' +
        '<h4 class="font-medium text-sm mb-3 flex items-center gap-2">' +
          '<i data-lucide="link" class="w-4 h-4 text-primary"></i>' +
          (stepBadge > 0 ? ' <span class="badge badge-outline badge-sm font-mono mr-0.5">[ ' + stepBadge + ' ]</span>' : '') +
          ' Formuliervelden koppelen aan Odoo' +
          (!odooLoaded ? ' <span class="loading loading-xs loading-spinner ml-1"></span>' : '') +
        '</h4>' +
        '<div>' +
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
        '<div class="overflow-visible">' +
          '<table class="table table-sm w-full">' +
            '<thead><tr>' +
              '<th class="font-normal text-xs text-base-content/50" colspan="2">Odoo veld</th><th class="font-normal text-xs text-base-content/50">Waarde / sjabloon</th>' +
              '<th class="text-center font-normal" title="Identifier"><i data-lucide="key" class="w-3.5 h-3.5 inline-block opacity-50"></i></th>' +
              '<th class="text-center font-normal" title="Bijwerken bij update"><i data-lucide="pencil" class="w-3.5 h-3.5 inline-block opacity-50"></i></th>' +
              '<th></th>' +
            '</tr></thead>' +
            '<tbody>' + (extraRowsHtml || '<tr><td colspan="6" class="text-xs text-base-content/40 italic py-2">Nog geen extra velden toegevoegd.</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
        addRowDiv +
      '</div>' +
      (stepChainDiv ? stepChainDiv : '') +
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
