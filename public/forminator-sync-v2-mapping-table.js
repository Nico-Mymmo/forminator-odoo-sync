/**
 * Forminator Sync V2 — MappingTable component
 *
 * Renders the form-field → Odoo-field mapping UI for a given step (target).
 * Called from renderDetailMappings() for each open step card.
 *
 * Exposed as: window.FSV2.MappingTable = { render }
 */
(function () {
  'use strict';

  var POLICY_LABELS = {
    always:     'Altijd overschrijven',
    if_empty:   'Alleen als leeg',
    never:      'Nooit overschrijven',
  };

  function esc(v) { return window.FSV2.esc(v); }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function odooFieldSelect(odooCache, odooLoaded, sel, name, extra) {
    extra = extra || '';
    var nameAttr = name ? ` name="${esc(name)}"` : '';
    if (!odooLoaded) {
      return `<select class="select select-bordered select-xs w-full opacity-50"${nameAttr}${extra} disabled>
        <option>… Odoo velden laden …</option>
      </select>`;
    }
    var opts = `<option value="">— niet koppelen —</option>` +
      odooCache.map(function (f) {
        return `<option value="${esc(f.name)}"${f.name === sel ? ' selected' : ''}>${esc(f.label || f.name)} (${esc(f.name)})</option>`;
      }).join('');
    return `<select class="select select-bordered select-xs w-full"${nameAttr}${extra}>${opts}</select>`;
  }

  function placeholderChips(targetId, flatFields) {
    var fields = Array.isArray(flatFields) ? flatFields : [];
    if (!fields.length) return '';
    return `<div class="flex flex-wrap gap-1 mt-1.5 items-center">
      <span class="text-xs text-base-content/40 shrink-0 mr-0.5">Invoegen:</span>
      ${fields.slice(0, 8).map(function (f) {
        var fid   = f.field_id || f.id || f.name || '';
        var label = f.alias || f.label || fid;
        return `<button type="button"
          class="badge badge-outline badge-xs cursor-pointer hover:badge-primary insert-placeholder font-mono"
          data-field="${esc(fid)}" data-target="${esc(targetId)}"
          title="${esc(fid)}">${esc(label)}</button>`;
      }).join('')}
    </div>`;
  }

  function valueInput(odooField, value, chipTarget, extra, odooCache, flatFields) {
    extra = extra || '';
    var inpCls = 'input input-bordered input-xs w-full';
    var selCls = 'select select-bordered select-xs w-full';
    var meta   = odooCache && odooCache.find(function (f) { return f.name === odooField; });
    var ftype  = meta ? meta.field_type : null;
    var vmap   = meta ? meta.value_map : null;
    var nameAttr = '';  // no name here, caller adds id/name via extra

    if (ftype === 'boolean') {
      var ja  = value === 'true'  ? ' selected' : '';
      var nee = value === 'false' ? ' selected' : '';
      return `<select class="${selCls}"${nameAttr}${extra}>
        <option value="">&mdash; geen &mdash;</option>
        <option value="true"${ja}>Ja</option>
        <option value="false"${nee}>Nee</option>
      </select>`;
    }
    if (ftype === 'selection' && vmap && Object.keys(vmap).length) {
      return `<select class="${selCls}"${nameAttr}${extra}>
        <option value="">&mdash; geen &mdash;</option>
        ${Object.entries(vmap).map(function (e) {
          return `<option value="${esc(e[0])}"${value === e[0] ? ' selected' : ''}>${esc(e[1])}</option>`;
        }).join('')}
      </select>`;
    }
    if (ftype === 'many2one') {
      return `<div>
        <input class="${inpCls}"${nameAttr}${extra} value="${esc(value || '')}" placeholder="Numeriek Odoo-record ID…" />
        <p class="text-xs text-base-content/40 mt-1"><i data-lucide="info" class="w-3 h-3 inline -mt-0.5 mr-0.5"></i>Geef het numerieke ID of gebruik <code>{veld-id}</code> als sjabloon.</p>
      </div>`;
    }
    if (ftype === 'integer' || ftype === 'float') {
      return `<input class="${inpCls}"${nameAttr}${extra} type="number" value="${esc(value || '')}" placeholder="Getal…" />`;
    }
    return `<div>
      <input class="${inpCls}"${nameAttr}${extra} value="${esc(value || '')}" placeholder="Vaste waarde of {veld-id} sjabloon…" />
      ${chipTarget ? placeholderChips(chipTarget, flatFields) : ''}
    </div>`;
  }

  function vmapRow(ch, existingMap, prefix) {
    var existing = existingMap ? (existingMap[ch.value] || '') : '';
    var ph  = ch.field_type === 'many2one' ? 'Odoo record-ID…' : 'Odoo waarde…';
    var inputName = prefix + ch.value;
    var inputHtml;
    if (ch.value_map && Object.keys(ch.value_map).length) {
      inputHtml = `<select class="select select-bordered select-xs w-full" name="${esc(inputName)}" data-choice-value="${esc(ch.value)}">
        <option value="">— leeg laten —</option>
        ${Object.entries(ch.value_map).map(function (e) {
          return `<option value="${esc(e[0])}"${existing === e[0] ? ' selected' : ''}>${esc(e[1])}</option>`;
        }).join('')}
      </select>`;
    } else {
      inputHtml = `<input type="text" class="input input-bordered input-xs w-full" name="${esc(inputName)}" data-choice-value="${esc(ch.value)}" value="${esc(existing)}" placeholder="${esc(ph)}" />`;
    }
    return `<div class="flex items-center gap-2">
      <span class="text-xs text-base-content/70 truncate shrink-0 max-w-[40%]" title="${esc(ch.value)}">${esc(ch.label || ch.value)}</span>
      <span class="text-xs text-base-content/30 shrink-0">→</span>
      <div class="flex-1 min-w-0">${inputHtml}</div>
    </div>`;
  }

  function vmapBlock(choices, existingMap, prefix, fieldType) {
    var rows = choices.map(function (ch) { return vmapRow(ch, existingMap, prefix); });
    var hint = '';
    if (fieldType === 'many2one') {
      hint = `<p class="text-xs text-base-content/40 mt-1.5"><i data-lucide="info" class="inline w-3 h-3 -mt-0.5 mr-0.5"></i>Vul het numerieke Odoo record-ID in voor elke keuzoptie.</p>`;
    }
    return `<div class="grid gap-1.5">${rows.join('')}</div>${hint}`;
  }

  function opTypePicker(cfg, currentOpType, identifierFields, currentIdentifierField) {
    var options = [
      { value: 'upsert',      icon: 'git-merge',   label: 'Zoeken + bijwerken of aanmaken' },
      { value: 'update_only', icon: 'pencil',       label: 'Alleen bijwerken'               },
      { value: 'create',      icon: 'plus-circle',  label: 'Altijd nieuw aanmaken'          },
    ];
    var _current = options.find(function (o) { return o.value === (currentOpType || 'upsert'); }) || options[0];
    var _isNonDefault = currentOpType && currentOpType !== 'upsert';

    return `<details class="w-full rounded-xl border border-base-300 bg-base-200/40"${_isNonDefault ? ' open' : ''}>
      <summary class="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer rounded-xl select-none list-none">
        <i data-lucide="settings-2" class="w-3.5 h-3.5 text-primary shrink-0"></i>
        <span class="text-xs font-semibold text-base-content/70">Gedrag bij verwerking</span>
        <span class="inline-flex items-center gap-1 ml-1 text-xs text-base-content/40">
          <i data-lucide="${_current.icon}" class="w-3 h-3 shrink-0"></i>${esc(_current.label)}
        </span>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5 ml-auto details-chevron text-base-content/40 shrink-0"></i>
      </summary>
      <div class="px-3 pb-2.5 pt-1.5 border-t border-base-300">
        <div class="flex flex-col gap-0.5">
          ${options.map(function (o) {
            var checked = (currentOpType || 'upsert') === o.value ? ' checked' : '';
            var isChecked = (currentOpType || 'upsert') === o.value;
            return `<label class="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg border ${isChecked ? 'border-primary/20 bg-primary/5' : 'border-transparent hover:bg-base-100'}">
              <input type="radio" class="radio radio-xs radio-primary shrink-0" name="${esc(cfg.opTypeRadioName)}" value="${o.value}"${checked}>
              <i data-lucide="${o.icon}" class="w-3.5 h-3.5 ${isChecked ? 'text-primary' : 'text-base-content/40'} shrink-0"></i>
              <span class="text-xs font-medium ${isChecked ? 'text-base-content' : 'text-base-content/70'}">${esc(o.label)}</span>
            </label>`;
          }).join('')}
        </div>
        ${(function() {
          var _idf = identifierFields || [];
          if (_idf.length === 0) return '';
          if (_idf.length === 1) {
            return `<div class="mt-2 pt-2 border-t border-base-300 flex items-center gap-2 px-1">
              <i data-lucide="key" class="w-3.5 h-3.5 text-base-content/40"></i>
              <span class="text-xs text-base-content/50">Zoekcriterium:</span>
              <span class="text-xs font-medium">${esc(_idf[0].label || _idf[0].name)}</span>
            </div>`;
          }
          return `<div class="mt-2 pt-2 border-t border-base-300 flex items-center gap-2 px-1">
            <i data-lucide="key" class="w-3.5 h-3.5 text-base-content/40"></i>
            <span class="text-xs text-base-content/50 shrink-0">Zoekcriterium:</span>
            <select class="select select-xs select-bordered flex-1" data-action="set-step-identifier" data-target-id="${esc(String(cfg.targetId || ''))}">
              ${_idf.map(function(f) {
                return `<option value="${esc(f.name)}"${f.name === (currentIdentifierField || '') ? ' selected' : ''}>${esc(f.label || f.name)}</option>`;
              }).join('')}
            </select>
          </div>`;
        })()}
      </div>
    </details>`;
  }

  // ── render ────────────────────────────────────────────────────────────────────

  function render(containerId, cfg) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var odooCache      = cfg.odooCache    || [];
    var odooLoaded     = cfg.odooLoaded   || false;
    var flatFields     = cfg.flatFields   || [];
    var topLvl         = cfg.topLevelFields || flatFields;
    var existingForm   = Array.isArray(cfg.existingFormMappings) ? cfg.existingFormMappings : []; // [{odoo_field, source_value, is_identifier, is_update_field}]
    var extraRows      = cfg.extraRows    || [];
    // Build a filtered Odoo field list: remove hidden fields (per model config)
    var _hiddenSet = {};
    (cfg.hiddenOdooFields || []).forEach(function(fn) { if (fn) _hiddenSet[fn] = true; });
    var filteredOdooCache = odooCache.filter(function(f) { return !_hiddenSet[f.name]; });
    var tid            = String(cfg.targetId || '');
    var alreadyMapped  = cfg.alreadyMappedInOtherSteps || [];
    var identFields    = Array.isArray(cfg.identifierFields) ? cfg.identifierFields : [];
    var activeIdField  = cfg.activeIdentifierField || (identFields.length === 1 ? identFields[0].name : '');
    var precedingSteps = cfg.precedingSteps || [];
    var stepBadge      = cfg.stepBadge    || 0;

    // Partition extraRows into required / default / chain / free
    var requiredRows  = extraRows.filter(function(r) { return r.isRequired  && r.isDefault && r.sourceType !== 'previous_step_output' && r.odooField !== activeIdField; });
    var defaultRows   = extraRows.filter(function(r) { return !r.isRequired && r.isDefault && r.sourceType !== 'previous_step_output' && r.odooField !== activeIdField; });
    var chainRowsWithIdx = [];
    extraRows.forEach(function(r, i) {
      if (r.sourceType === 'previous_step_output') chainRowsWithIdx.push({ row: r, stateIdx: i });
    });
    var freeExtraRows = extraRows.filter(function(r) { return !r.isDefault && r.sourceType !== 'previous_step_output'; });

    // Available form fields — all top-level fields; alreadyMapped ones get a warning label
    var availableFF = topLvl.slice();

    // Find which form field is currently mapped to the identifier odoo field
    var claimedFids    = {};
    var identMappedFid = '';
    if (activeIdField) {
      var _idm = existingForm.find(function(m) { return m.odoo_field === activeIdField || m.is_identifier; });
      if (_idm) { identMappedFid = _idm.source_value; claimedFids[identMappedFid] = true; }
    }
    requiredRows.concat(defaultRows).forEach(function(r) {
      var _rm = existingForm.find(function(m) { return m.odoo_field === r.odooField; });
      if (_rm) claimedFids[_rm.source_value] = true;
    });

    // Build unified free rows from existing form mappings + non-required extra rows
    // Build set of odoo fields handled by identifier/required/default rows
    var _handledOdoo = {};
    if (activeIdField) _handledOdoo[activeIdField] = true;
    requiredRows.forEach(function(r) { _handledOdoo[r.odooField] = true; });
    defaultRows.forEach(function(r) { _handledOdoo[r.odooField] = true; });

    var freeRows = [];
    existingForm.forEach(function(m) {
      if (_handledOdoo[m.odoo_field]) return; // handled by a fixed row
      if (!m.odoo_field) return;
      var fid = m.source_value;
      freeRows.push({
        formField:     fid,
        fixedValue:    '',
        odooField:     m.odoo_field,
        isUpdateField: m.is_update_field !== false,
      });
    });
    freeExtraRows.forEach(function(r) {
      freeRows.push({
        formField:     '',
        fixedValue:    r.staticValue || '',
        odooField:     r.odooField,
        isUpdateField: r.isUpdateField !== false,
      });
    });

    // Build set of already-used Odoo fields (for filtering the free-row selects)
    var _usedOdooSet = {};
    if (activeIdField) _usedOdooSet[activeIdField] = true;
    requiredRows.forEach(function(r) { _usedOdooSet[r.odooField] = true; });
    defaultRows.forEach(function(r) { _usedOdooSet[r.odooField] = true; });
    chainRowsWithIdx.forEach(function(c) { _usedOdooSet[c.row.odooField] = true; });
    freeRows.forEach(function(r) { if (r.odooField) _usedOdooSet[r.odooField] = true; });

    // Unmapped form fields (for "Overige formuliervelden toevoegen")
    var usedFids = Object.assign({}, claimedFids);
    freeRows.forEach(function(r) { if (r.formField) usedFids[r.formField] = true; });
    var unmappedFF = availableFF.filter(function(f) {
      var fid = f.field_id || f.id || f.name || '';
      return !usedFids[fid];
    });

    // ── Local helpers (closures over render-time data) ──────────────────────

    function getOdooLabel(fieldName) {
      var m = odooCache.find(function(f) { return f.name === fieldName; });
      return (m && m.label) ? m.label : fieldName;
    }

    function ffSelect(selectedFid) {
      var inList = !selectedFid || availableFF.some(function(f) {
        return (f.field_id || f.id || f.name || '') === selectedFid;
      });
      // If the previously mapped form field no longer exists, show it as a fallback option
      var fallbackOption = (!inList && selectedFid)
        ? `<option value="${esc(selectedFid)}" selected>${esc(selectedFid)}</option>`
        : '';
      return `<select class="select select-bordered select-xs w-full" data-map-col="1">
        <option value=""${!selectedFid ? ' selected' : ''}>— formulierveld —</option>
        ${fallbackOption}
        ${availableFF.map(function(f) {
          var fid = f.field_id || f.id || f.name || '';
          return `<option value="${esc(fid)}"${fid === selectedFid ? ' selected' : ''}>${esc(f.label || fid)}</option>`;
        }).join('')}
      </select>`;
    }

    function col2Input(odooField, val) {
      var meta  = odooCache.find(function(f) { return f.name === odooField; });
      var ftype = meta ? meta.type      : null;
      var sel   = meta ? meta.selection : null;  // array of [key, label] pairs
      var cls    = 'input input-bordered input-xs w-full';
      var selCls = 'select select-bordered select-xs w-full';
      if (ftype === 'boolean') {
        return `<select class="${selCls}" data-map-col="2">
          <option value="">— geen —</option>
          <option value="true"${val === 'true' ? ' selected' : ''}>Ja</option>
          <option value="false"${val === 'false' ? ' selected' : ''}>Nee</option>
        </select>`;
      }
      if (ftype === 'selection' && Array.isArray(sel) && sel.length) {
        return `<select class="${selCls}" data-map-col="2">
          <option value="">— geen —</option>
          ${sel.map(function(pair) {
            var k = pair[0], l = pair[1];
            return `<option value="${esc(k)}"${val === k ? ' selected' : ''}>${esc(l)}</option>`;
          }).join('')}
        </select>`;
      }
      if (ftype === 'many2one' && meta && meta.relation) {
        return `<div class="relative flex flex-col gap-0.5" data-m2o-wrap data-m2o-relation="${esc(meta.relation)}">
          <input type="text" class="${cls}" data-m2o-search
            value="${esc(val || '')}"
            placeholder="Zoeken…" autocomplete="off" />
          <input type="hidden" data-map-col="2" data-m2o-id value="${esc(val || '')}" />
          <div class="m2o-results absolute top-full left-0 right-0 z-50 mt-0.5 rounded-lg border border-base-300 bg-base-100 shadow-lg text-xs hidden max-h-40 overflow-y-auto"></div>
        </div>`;
      }
      // Placeholder dropdown (only when flatFields available)
      var _phHtml = '';
      if (flatFields && flatFields.length) {
        var _phItems = flatFields.slice(0, 40).map(function(f) {
          var fid = f.field_id || f.id || f.name || '';
          var lbl = f.label || fid;
          return '<button type="button" class="ph-opt flex items-center gap-2 px-2.5 py-1.5 hover:bg-base-200 w-full text-left cursor-pointer" data-ph-ins="{' + esc(fid) + '}" title="' + esc(fid) + '"><code class="font-mono text-xs text-base-content/50 shrink-0 leading-none">{' + esc(fid) + '}</code><span class="text-xs truncate text-base-content/70">' + esc(lbl) + '</span></button>';
        }).join('');
        _phHtml = '<div class="relative inline-flex shrink-0">' +
          '<button type="button" class="btn btn-ghost btn-xs px-1 ph-toggle" title="Placeholder invoegen" tabindex="-1">' +
            '<i data-lucide="braces" class="w-3.5 h-3.5 text-base-content/40"></i>' +
          '</button>' +
          '<div class="ph-drop hidden absolute right-0 top-full z-50 mt-0.5 bg-base-100 border border-base-300 rounded-xl shadow-lg w-64 max-h-52 overflow-y-auto">' +
            _phItems +
          '</div>' +
        '</div>';
      }
      return '<div class="flex items-center gap-0.5"><input class="' + cls + ' flex-1 min-w-0" data-map-col="2" value="' + esc(val || '') + '" placeholder="Vaste waarde of {veld-id}\u2026" />' + _phHtml + '</div>';
    }

    function notUpdateChk(isUpdateField) {
      return `<label class="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap" title="Niet bewerken bij updates">
        <input type="checkbox" class="checkbox checkbox-xs" data-map-not-update${!isUpdateField ? ' checked' : ''}>
        <span class="text-xs text-base-content/40">Niet bijwerken</span>
      </label>`;
    }

    function deleteBtn() {
      return `<button type="button" class="btn btn-ghost btn-xs p-0 w-6 h-6 min-h-0 text-error/40 hover:text-error ml-0.5 shrink-0"
        data-action="map-delete-row" title="Rij verwijderen">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>`;
    }

    function fixedOdooTag(fieldName, bgCls, iconName, extraTextCls, suffix) {
      extraTextCls = extraTextCls || '';
      return `<div class="flex items-center gap-1.5 px-2 rounded-lg ${bgCls} h-7 overflow-hidden">
        <i data-lucide="${esc(iconName)}" class="w-3 h-3 shrink-0"></i>
        <span class="text-xs font-medium truncate${extraTextCls}">${esc(getOdooLabel(fieldName))}</span>
        ${suffix || ''}
      </div>`;
    }

    function newFreeRowHtml() {
      return `<td class="py-2 pr-2">${ffSelect('')}</td>
        <td class="py-2 pr-2">${col2Input('', '')}</td>
        <td class="py-2 pr-2">${odooFieldSelect(filteredOdooCache, odooLoaded, '', null, ' data-map-col="3"')}</td>
        <td class="py-2 pl-1"><div class="flex items-center justify-end gap-0">${notUpdateChk(true)}${deleteBtn()}</div></td>`;
    }

    // ── Identifier row (or chain-linked identifier) ─────────────────────────────
    // If a chain link exists for the identifier field, render a locked blue row instead of
    // the editable purple key row — the value is provided automatically by the chain.
    var chainIdentRow = chainRowsWithIdx.find(function(c) { return c.row.odooField === activeIdField; });
    var identRowHtml = '';
    if (activeIdField) {
      if (chainIdentRow) {
        identRowHtml = `<tr data-row-type="chain-identifier" class="bg-info/5">
          <td colspan="2" class="py-2 pr-2">
            <div class="flex items-center gap-1.5 text-xs text-info/70 italic pl-1">
              <i data-lucide="link-2" class="w-3.5 h-3.5 shrink-0 text-info"></i>
              <span>Automatisch via koppeling aan vorige stap</span>
            </div>
          </td>
          <td class="py-2 pr-2">${fixedOdooTag(activeIdField, 'bg-info/10 border border-info/20', 'link-2', ' text-info')}</td>
          <td class="py-2 pl-1">
            <button type="button" class="btn btn-ghost btn-xs p-0 w-6 h-6 min-h-0 text-error/30 hover:text-error ml-0.5 shrink-0"
              data-action="remove-chain-link" data-target-id="${esc(tid)}" data-odoo-field="${esc(activeIdField)}"
              title="Koppeling verwijderen">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>`;
      } else {
        identRowHtml = `<tr data-map-row data-row-type="identifier" data-odoo-field="${esc(activeIdField)}" data-row-is-required="false" class="bg-primary/5">
          <td class="py-2 pr-2">${ffSelect(identMappedFid)}</td>
          <td class="py-2 pr-2 text-center align-middle">
            <span class="text-sm text-base-content/20">—</span>
          </td>
          <td class="py-2 pr-2">${fixedOdooTag(activeIdField, 'bg-primary/10 border border-primary/20', 'key', ' text-primary')}</td>
          <td class="py-2 pl-1">${notUpdateChk(true)}</td>
        </tr>`;
      }
    }

    // ── Other chain rows (non-identifier) ────────────────────────────────────
    var otherChainRowsHtml = chainRowsWithIdx
      .filter(function(c) { return c.row.odooField !== activeIdField; })
      .map(function(c) {
        var r = c.row;
        return `<tr data-row-type="chain" class="bg-info/5">
          <td colspan="2" class="py-2 pr-2">
            <div class="flex items-center gap-1.5 text-xs text-info/70 italic pl-1">
              <i data-lucide="link-2" class="w-3.5 h-3.5 shrink-0 text-info"></i>
              <span>Automatisch via koppeling aan vorige stap</span>
            </div>
          </td>
          <td class="py-2 pr-2">${fixedOdooTag(r.odooField, 'bg-info/10 border border-info/20', 'link-2', ' text-info')}</td>
          <td class="py-2 pl-1">
            <button type="button" class="btn btn-ghost btn-xs p-0 w-6 h-6 min-h-0 text-error/30 hover:text-error ml-0.5 shrink-0"
              data-action="remove-chain-link" data-target-id="${esc(tid)}" data-odoo-field="${esc(r.odooField)}"
              title="Koppeling verwijderen">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>`;
      }).join('');

    // ── Required rows ─────────────────────────────────────────────────────────
    var reqRowsHtml = requiredRows.map(function(r) {
      var mappedFid = '';
      var _mfm = existingForm.find(function(m) { return m.odoo_field === r.odooField; });
      if (_mfm) mappedFid = _mfm.source_value;
      var existingStatic = !mappedFid ? (r.staticValue || '') : '';
      var sm = r.sourceMode || 'both';
      var col1Req = sm === 'fixed_value'
        ? `<span class="text-sm text-base-content/20">—</span>`
        : ffSelect(mappedFid);
      var col2Req = sm === 'form_field'
        ? `<span class="text-sm text-base-content/20">—</span>`
        : col2Input(r.odooField, existingStatic);
      return `<tr data-map-row data-row-type="required" data-odoo-field="${esc(r.odooField)}" data-row-is-required="true">
        <td class="py-2 pr-2">${col1Req}</td>
        <td class="py-2 pr-2">${col2Req}</td>
        <td class="py-2 pr-2">${fixedOdooTag(r.odooField, 'bg-warning/10 border border-warning/20', 'asterisk', '', '<span class="badge badge-warning badge-xs ml-auto shrink-0 font-normal">verplicht</span>')}</td>
        <td class="py-2 pl-1">${notUpdateChk(r.isUpdateField !== false)}</td>
      </tr>`;
    }).join('');

    // ── Default (non-required) rows ──────────────────────────────────────────
    var defaultRowsHtml = defaultRows.map(function(r) {
      var mappedFid = '';
      var _mfm = existingForm.find(function(m) { return m.odoo_field === r.odooField; });
      if (_mfm) mappedFid = _mfm.source_value;
      var existingStatic = !mappedFid ? (r.staticValue || '') : '';
      var smD = r.sourceMode || 'both';
      var col1Def = smD === 'fixed_value'
        ? `<span class="text-sm text-base-content/20">—</span>`
        : ffSelect(mappedFid);
      var col2Def = smD === 'form_field'
        ? `<span class="text-sm text-base-content/20">—</span>`
        : col2Input(r.odooField, existingStatic);
      return `<tr data-map-row data-row-type="required" data-odoo-field="${esc(r.odooField)}" data-row-is-required="false">
        <td class="py-2 pr-2">${col1Def}</td>
        <td class="py-2 pr-2">${col2Def}</td>
        <td class="py-2 pr-2">${fixedOdooTag(r.odooField, 'bg-base-200 border border-base-300', 'circle-dot')}</td>
        <td class="py-2 pl-1">${notUpdateChk(r.isUpdateField !== false)}</td>
      </tr>`;
    }).join('');

    // ── Free rows ─────────────────────────────────────────────────────────────
    var freeRowsHtml = freeRows.map(function(r) {
      // For each free row: remove hidden fields AND already-used fields (except this row's own Odoo field)
      var _rowCache = filteredOdooCache.filter(function(f) {
        return f.name === r.odooField || !_usedOdooSet[f.name];
      });
      return `<tr data-map-row data-row-type="free" data-row-is-required="false">
        <td class="py-2 pr-2">${ffSelect(r.formField)}</td>
        <td class="py-2 pr-2">${col2Input(r.odooField, r.fixedValue)}</td>
        <td class="py-2 pr-2">
          ${odooFieldSelect(_rowCache, odooLoaded, r.odooField, null, ' data-map-col="3"')}
        </td>
        <td class="py-2 pl-1">
          <div class="flex items-center justify-end gap-0">${notUpdateChk(r.isUpdateField !== false)}${deleteBtn()}</div>
        </td>
      </tr>`;
    }).join('');

    // ── Divider between fixed and free rows ───────────────────────────────────
    var fixedHtml = identRowHtml + otherChainRowsHtml + reqRowsHtml + defaultRowsHtml;
    var dividerRow = fixedHtml && freeRowsHtml
      ? `<tr><td colspan="4" class="py-0"><div class="my-1 border-t border-base-200"></div></td></tr>`
      : '';

    // ── Assemble ──────────────────────────────────────────────────────────────
    var stepBadgeHtml = stepBadge > 0
      ? `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral text-neutral-content text-xs font-bold mr-1">${stepBadge}</span>`
      : '';

    var inner = document.createElement('div');
    inner.className = 'w-full';
    if (tid) {
      inner.id = 'mappingEditor';
      inner.setAttribute('data-mt-target-id', tid);
    }

    inner.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <i data-lucide="link-2" class="w-3.5 h-3.5 opacity-40"></i>
        <span class="text-xs font-semibold uppercase tracking-wide opacity-40">Formuliervelden koppelen aan Odoo</span>
        ${!odooLoaded ? '<span class="loading loading-xs loading-spinner ml-1 opacity-40"></span>' : ''}
      </div>
      <table class="table table-xs w-full">
        <colgroup>
          <col style="width:33%">
          <col style="width:33%">
          <col style="width:33%">
          <col style="width:120px">
        </colgroup>
        <thead>
          <tr class="text-xs text-base-content/50 border-b border-base-200">
            <th class="font-normal pb-2 pl-0">Formulierveld</th>
            <th class="font-normal pb-2">Vaste waarde</th>
            <th class="font-normal pb-2">Odoo veld</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${identRowHtml}
          ${otherChainRowsHtml}
          ${reqRowsHtml}
          ${defaultRowsHtml}
          ${dividerRow}
          ${freeRowsHtml}
        </tbody>
      </table>
      <div class="flex items-center gap-2 mt-3 pt-2.5 border-t border-base-200">
        <button type="button" class="btn btn-ghost btn-xs gap-1" data-add-row>
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Extra rij
        </button>
        <button type="button" class="btn btn-ghost btn-xs gap-1" data-add-form-fields>
          <i data-lucide="list-plus" class="w-3.5 h-3.5"></i> Overige formuliervelden toevoegen
        </button>
      </div>`;

    container.replaceChildren(inner);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: inner });

    // ── Helper: lock/unlock col1 or col2 area ────────────────────────────────
    function _lockEl(el, lock) {
      el.style.opacity       = lock ? '0.35' : '1';
      el.style.pointerEvents = lock ? 'none'  : '';
    }
    function _lockC2(row, c2El, lock) {
      _lockEl(c2El, lock);
      var phTgl = row.querySelector('.ph-toggle');
      if (phTgl) _lockEl(phTgl, lock);
    }

    // ── Initial col1/col2 opacity + pointer-events ────────────────────────────
    inner.querySelectorAll('[data-map-row]').forEach(function(row) {
      if (row.dataset.rowType === 'identifier') return;
      var c1 = row.querySelector('[data-map-col="1"]');
      var c2 = row.querySelector('[data-map-col="2"]');
      if (!c1 || !c2) return;
      // For many2one, c2 is a hidden input — fade its visible wrapper instead
      var c2El = c2.closest('[data-m2o-wrap]') || c2;
      if (c1.value)      { _lockC2(row, c2El, true); }
      else if (c2.value) { _lockEl(c1, true); }
    });

    // ── Mutual exclusion: col1 <-> col2 ──────────────────────────────────────
    inner.addEventListener('change', function(e) {
      var row = e.target.closest('[data-map-row]');
      if (!row || row.dataset.rowType === 'identifier') return;
      var c1 = row.querySelector('[data-map-col="1"]');
      var c2 = row.querySelector('[data-map-col="2"]');
      if (!c1 || !c2) return;
      var c2El = c2.closest('[data-m2o-wrap]') || c2;
      if (e.target.dataset.mapCol === '1') {
        if (c1.value) {
          c2.value = '';
          var m2oSrch = c2El.querySelector ? c2El.querySelector('[data-m2o-search]') : null;
          if (m2oSrch) m2oSrch.value = '';
          _lockC2(row, c2El, true);
          _lockEl(c1, false);
        } else {
          _lockC2(row, c2El, false);
        }
      } else if (e.target.dataset.mapCol === '2') {
        if (c2.value) {
          c1.value = '';
          _lockEl(c1, true);
          _lockC2(row, c2El, false);
        } else {
          _lockEl(c1, false);
        }
      }
    });

    // ── Delete free row ───────────────────────────────────────────────────────
    inner.addEventListener('click', function(e) {
      if (!e.target.closest('[data-action="map-delete-row"]')) return;
      var row = e.target.closest('[data-map-row]');
      if (row) row.remove();
    });

    // ── Add blank free row ────────────────────────────────────────────────────
    inner.addEventListener('click', function(e) {
      if (!e.target.closest('[data-add-row]')) return;
      var tbody = inner.querySelector('tbody');
      if (!tbody) return;
      var tr = document.createElement('tr');
      tr.setAttribute('data-map-row', '');
      tr.setAttribute('data-row-type', 'free');
      tr.innerHTML = newFreeRowHtml();
      tbody.appendChild(tr);
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: tr });
    });

    // ── Add all unmapped form fields ──────────────────────────────────────────
    inner.addEventListener('click', function(e) {
      if (!e.target.closest('[data-add-form-fields]')) return;
      var tbody = inner.querySelector('tbody');
      if (!tbody || !unmappedFF.length) return;
      var frag = document.createDocumentFragment();
      unmappedFF.forEach(function(f) {
        var fid = f.field_id || f.id || f.name || '';
        var tr = document.createElement('tr');
        tr.setAttribute('data-map-row', '');
        tr.setAttribute('data-row-type', 'free');
        tr.innerHTML = `<td class="py-2 pr-2">${ffSelect(fid)}</td>
          <td class="py-2 pr-2">${col2Input('', '')}</td>
          <td class="py-2 pr-2">${odooFieldSelect(odooCache, odooLoaded, '', null, ' data-map-col="3"')}</td>
          <td class="py-2 pl-1"><div class="flex items-center justify-end gap-0">${notUpdateChk(true)}${deleteBtn()}</div></td>`;
        frag.appendChild(tr);
      });
      unmappedFF = [];
      tbody.appendChild(frag);
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: tbody });
    });

    // ── Placeholder dropdown ─────────────────────────────────────────────────
    inner.addEventListener('click', function(e) {
      var toggle = e.target.closest('.ph-toggle');
      var opt    = e.target.closest('.ph-opt');

      if (toggle) {
        e.stopPropagation();
        // Blokkeer als col1 (formulierveld) al ingevuld is
        var _row = toggle.closest('[data-map-row]');
        var _c1  = _row ? _row.querySelector('[data-map-col="1"]') : null;
        if (_c1 && _c1.value) return;
        var drop = toggle.parentElement ? toggle.parentElement.querySelector('.ph-drop') : null;
        // Close other ph dropdowns
        inner.querySelectorAll('.ph-drop:not(.hidden)').forEach(function(d) { if (d !== drop) d.classList.add('hidden'); });
        if (drop) drop.classList.toggle('hidden');
        return;
      }

      if (opt) {
        var ins  = opt.dataset.phIns || '';
        var drop = opt.closest('.ph-drop');
        var row  = opt.closest('[data-map-row]');
        var inp  = row ? row.querySelector('input[data-map-col="2"]') : null;
        if (inp) {
          var s  = typeof inp.selectionStart === 'number' ? inp.selectionStart : inp.value.length;
          var en = typeof inp.selectionEnd   === 'number' ? inp.selectionEnd   : inp.value.length;
          inp.value = inp.value.slice(0, s) + ins + inp.value.slice(en);
          inp.setSelectionRange(s + ins.length, s + ins.length);
          inp.focus();
          inp.dispatchEvent(new Event('input',  { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (drop) drop.classList.add('hidden');
        return;
      }

      // Click elsewhere → close all ph dropdowns
      inner.querySelectorAll('.ph-drop:not(.hidden)').forEach(function(d) { d.classList.add('hidden'); });
    });

        // ── Many2one search inputs ───────────────────────────────────────────────
    var m2oDebounce = null;
    inner.addEventListener('input', function(e) {
      var inp = e.target;
      if (!inp.hasAttribute('data-m2o-search')) return;
      var wrap     = inp.closest('[data-m2o-wrap]');
      var hiddenEl = wrap ? wrap.querySelector('[data-m2o-id]') : null;
      var results  = wrap ? wrap.querySelector('.m2o-results')  : null;
      if (!wrap || !hiddenEl || !results) return;
      var q        = inp.value.trim();
      var relation = wrap.dataset.m2oRelation || '';
      // Clear hidden value when user edits text
      hiddenEl.value = '';
      hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
      clearTimeout(m2oDebounce);
      if (!q) { results.innerHTML = ''; results.classList.add('hidden'); return; }
      m2oDebounce = setTimeout(function() {
        window.FSV2.api('/odoo/search?model=' + encodeURIComponent(relation) + '&q=' + encodeURIComponent(q) + '&limit=10')
          .then(function(body) {
            var items = body.data || [];
            if (!items.length) {
              results.innerHTML = '<div class="px-3 py-2 text-base-content/40">Geen resultaten</div>';
            } else {
              results.innerHTML = items.map(function(r) {
                return `<div class="px-3 py-2 hover:bg-base-200 cursor-pointer" data-m2o-pick data-m2o-id="${esc(String(r.id))}" data-m2o-name="${esc(r.display_name || r.name || String(r.id))}">${esc(r.display_name || r.name || String(r.id))}</div>`;
              }).join('');
            }
            results.classList.remove('hidden');
          })
          .catch(function() { results.innerHTML = ''; results.classList.add('hidden'); });
      }, 250);
    });

    inner.addEventListener('click', function(e) {
      var pick = e.target.closest('[data-m2o-pick]');
      if (!pick) {
        // Click outside closes all dropdowns
        inner.querySelectorAll('.m2o-results:not(.hidden)').forEach(function(r) { r.classList.add('hidden'); });
        return;
      }
      var wrap     = pick.closest('[data-m2o-wrap]');
      var searchEl = wrap ? wrap.querySelector('[data-m2o-search]') : null;
      var hiddenEl = wrap ? wrap.querySelector('[data-m2o-id]')    : null;
      var results  = wrap ? wrap.querySelector('.m2o-results')      : null;
      if (!searchEl || !hiddenEl) return;
      searchEl.value = pick.dataset.m2oName || '';
      hiddenEl.value = pick.dataset.m2oId   || '';
      hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (results) { results.innerHTML = ''; results.classList.add('hidden'); }
    });
  }

  function renderBehaviorHtml(opType, tid, identifierFields, currentIdentifierField) {
    var fakeCfg = {
      opTypeRadioName:        'det-optype-radio-' + tid,
      identifierFields:       identifierFields || [],
      currentIdentifierField: currentIdentifierField || '',
      targetId:               tid,
    };
    if (opType === 'chatter_message' || opType === 'create_activity') return '';
    return opTypePicker(fakeCfg, opType, fakeCfg.identifierFields, fakeCfg.currentIdentifierField);
  }

  Object.assign(window.FSV2 = window.FSV2 || {}, {
    MappingTable: { render: render, renderBehaviorHtml: renderBehaviorHtml },
    POLICY_LABELS: POLICY_LABELS,
  });
}());
