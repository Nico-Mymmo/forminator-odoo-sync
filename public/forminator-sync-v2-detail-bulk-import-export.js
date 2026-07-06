/**
 * Forminator Sync V2 -- Detail -- Bulk import/export
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

  function normalizeBulkText(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function normalizeBulkPhone(v) {
    return normalizeBulkText(v).replace(/[^\d+]/g, '');
  }

  function parseBulkDateToIso(v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'number') {
      var epoch = Date.UTC(1899, 11, 30);
      var excelDate = new Date(epoch + Math.round(v * 24 * 60 * 60 * 1000));
      if (!isNaN(excelDate.getTime())) return excelDate.toISOString();
    }

    var raw = normalizeBulkText(v);
    if (!raw) return '';

    var direct = new Date(raw);
    if (!isNaN(direct.getTime())) return direct.toISOString();

    var m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?)?$/i);
    if (m) {
      var a = Number(m[1]);
      var b = Number(m[2]);
      var y = Number(m[3]);
      var hh = Number(m[4] || 0);
      var mm = Number(m[5] || 0);
      var ampm = normalizeBulkText(m[6]).toLowerCase();
      if (y < 100) y += 2000;
      var day = a > 12 ? a : b;
      var month = a > 12 ? b : a;
      if (ampm === 'pm' && hh < 12) hh += 12;
      if (ampm === 'am' && hh === 12) hh = 0;
      var parsed = new Date(y, month - 1, day, hh, mm, 0);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }

    return null;
  }

  function normalizeBulkEnum(field, value, dropdowns) {
    var raw = normalizeBulkText(value);
    if (!raw) return '';
    var options = Array.isArray(dropdowns[field]) ? dropdowns[field] : [];
    if (!options.length) return raw;
    var match = options.find(function (opt) {
      var optValue = (opt && typeof opt === 'object') ? (opt.value != null ? String(opt.value) : '') : String(opt || '');
      return normalizeBulkText(optValue).toLowerCase() === raw.toLowerCase();
    });
    if (!match) return raw;
    return (match && typeof match === 'object') ? (match.value != null ? String(match.value) : raw) : String(match);
  }

  async function loadBulkImportConfig() {
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    if (summaryEl) {
      summaryEl.innerHTML = '<span class="loading loading-spinner loading-xs"></span><span class="ml-2">Connectievelden laden...</span>';
    }

    var res = await window.FSV2.api('/integrations/' + S().activeId + '/import-meta-leads/template');
    var data = (res && res.data) || {};
    var columns = Array.isArray(data.columns) ? data.columns : [];
    var dropdowns = data.dropdowns && typeof data.dropdowns === 'object' ? data.dropdowns : {};
    var inputRules = data.input_rules && typeof data.input_rules === 'object' ? data.input_rules : {};
    var sampleRow = data.sample_row && typeof data.sample_row === 'object' ? data.sample_row : {};
    var fieldTransforms = data.field_transforms && typeof data.field_transforms === 'object' ? data.field_transforms : {};
    var fieldMeta = Object.assign(
      {},
      (data.field_meta && typeof data.field_meta === 'object' ? data.field_meta : {}),
      (S()._fieldMeta || {})
    );
    var bulkDefaults = {};
    var bulkVisible = {};

    columns.forEach(function (field) {
      var transform = fieldTransforms[field];
      var valueMap = transform && transform.value_map && typeof transform.value_map === 'object' ? transform.value_map : null;
      if (!valueMap) return;
      var keys = window.FSV2.getOrderedValueMapKeys(transform);
      if (!keys.length) return;
      var merged = Array.isArray(dropdowns[field]) ? dropdowns[field].slice() : [];
      keys.forEach(function (key) {
        var exists = merged.some(function (opt) {
          if (opt && typeof opt === 'object') return String(opt.value || '') === key;
          return String(opt) === key;
        });
        if (!exists) merged.push({ value: key, label: key + ' -> ' + String(valueMap[key]) });
      });
      dropdowns[field] = merged;
    });

    columns.forEach(function (field) {
      var meta = fieldMeta[field] || {};
      bulkVisible[field] = meta.bulk_import_show !== false;
      var defaultValue = meta.bulk_import_default != null ? String(meta.bulk_import_default) : '';
      if (!defaultValue && S().detail && S().detail.integration) {
        if (field === 'form_id' && S().detail.integration.forminator_form_id) defaultValue = String(S().detail.integration.forminator_form_id);
        if (field === 'form_name' && S().detail.integration.name) defaultValue = String(S().detail.integration.name);
      }
      if (defaultValue) bulkDefaults[field] = defaultValue;
    });

    var detailFields = S().detailFormFields || [];
    detailFields.forEach(function (f) {
      var fid = String(f.field_id || '');
      if (!fid) return;
      var meta = fieldMeta[fid] || {};
      if (meta.bulk_import_show === false) return;
      if (columns.indexOf(fid) !== -1) return;
      columns.push(fid);
      bulkVisible[fid] = true;
      var defaultValue = meta.bulk_import_default != null
        ? String(meta.bulk_import_default) : '';
      if (!defaultValue && S().detail && S().detail.integration) {
        if (fid === 'form_id' && S().detail.integration.forminator_form_id)
          defaultValue = String(S().detail.integration.forminator_form_id);
        if (fid === 'form_name' && S().detail.integration.name)
          defaultValue = String(S().detail.integration.name);
      }
      if (defaultValue) bulkDefaults[fid] = defaultValue;
    });

    S()._bulkImportConfig = {
      columns: columns,
      dropdowns: dropdowns,
      inputRules: inputRules,
      sampleRow: sampleRow,
      fieldMeta: fieldMeta,
      bulkDefaults: bulkDefaults,
      bulkVisible: bulkVisible,
    };

    var rows = [];
    S()._bulkImportRows = rows;
    renderBulkImportEditor();

    if (summaryEl) {
      summaryEl.innerHTML = '<div class="text-sm text-success">Velden geladen. Vul de rijen in en valideer.</div>';
    }
  }

  function renderBulkImportEditor() {
    var editor = document.getElementById('bulkImportEditor');
    if (!editor) return;

    var cfg = S()._bulkImportConfig || {};
    var columns = Array.isArray(cfg.columns) ? cfg.columns : [];
    var dropdowns = cfg.dropdowns || {};
    var inputRules = cfg.inputRules || {};
    var bulkVisible = cfg.bulkVisible || {};
    var rows = Array.isArray(S()._bulkImportRows) ? S()._bulkImportRows : [];

    if (!columns.length) {
      editor.innerHTML = '<div class="text-sm text-base-content/60">Geen velden beschikbaar voor deze connectie.</div>';
      return;
    }

    var composer = S()._bulkImportComposer || {};
    var visibleColumns = columns.filter(function (field) { return bulkVisible[field] !== false; });
    var hiddenCount = columns.length - visibleColumns.length;
    var html = '<div class="space-y-3">' +
      '<div class="rounded-box border border-base-300 bg-base-100 p-3">' +
        '<div class="flex items-center justify-between gap-2 mb-3">' +
          '<div class="font-semibold text-sm">Nieuwe rij</div>' +
          '<button class="btn btn-xs btn-outline" type="button" data-action="add-bulk-import-row">Rij toevoegen</button>' +
        '</div>' +
        '<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">';

    visibleColumns.forEach(function (field) {
      var value = composer[field] !== undefined ? composer[field] : (cfg.bulkDefaults && cfg.bulkDefaults[field] !== undefined ? cfg.bulkDefaults[field] : '');
      var options = Array.isArray(dropdowns[field]) ? dropdowns[field] : [];
      var rule = inputRules[field] || {};
      var label = String(field).replace(/_/g, ' ');

      html += '<div class="min-w-0">' +
        '<label class="label pb-1"><span class="label-text text-xs font-medium truncate">' + window.FSV2.esc(label) + '</span></label>';

      if (options.length) {
        html += '<select class="select select-bordered select-sm w-full" data-bulk-composer-field="' + window.FSV2.esc(field) + '">';
        html += '<option value=""></option>';
        options.forEach(function (opt) {
          var optValue = (opt && typeof opt === 'object') ? (opt.value != null ? String(opt.value) : '') : String(opt || '');
          var optLabel = (opt && typeof opt === 'object') ? (opt.label != null ? String(opt.label) : optValue) : String(opt || '');
          var selected = String(value) === String(optValue) ? ' selected' : '';
          html += '<option value="' + window.FSV2.esc(optValue) + '"' + selected + '>' + window.FSV2.esc(optLabel) + '</option>';
        });
        html += '</select>';
      } else {
        var inputType = rule.type === 'datetime' ? 'datetime-local' : 'text';
        var inputValue = String(value || '');
        if (rule.type === 'datetime' && inputValue) {
          var pickedDate = parseBulkDateToIso(inputValue);
          if (pickedDate) inputValue = pickedDate.slice(0, 16);
        }
        var placeholder = rule.type === 'datetime' ? 'YYYY-MM-DDTHH:MM' : '';
        html += '<input type="' + inputType + '" class="input input-bordered input-sm w-full" data-bulk-composer-field="' + window.FSV2.esc(field) + '" value="' + window.FSV2.esc(inputValue) + '" placeholder="' + window.FSV2.esc(placeholder) + '">';
      }

      html += '</div>';
    });

    html += '</div>' +
      '<div class="mt-3 text-xs text-base-content/50">Vul een rij in en druk op Rij toevoegen.' +
        (hiddenCount > 0 ? (' <span class="text-base-content/60">' + window.FSV2.esc(String(hiddenCount)) + ' veld(en) worden automatisch toegevoegd.</span>') : '') +
      '</div>' +
    '</div>';

    if (rows.length) {
      html += '<div class="space-y-2">';
      rows.forEach(function (row, rowIndex) {
        var parts = [];
        visibleColumns.forEach(function (field) {
          var value = row && row[field] !== undefined ? String(row[field]).trim() : '';
          if (!value) return;
          parts.push('<span class="badge badge-ghost badge-sm whitespace-normal break-words">' + window.FSV2.esc(String(field).replace(/_/g, ' ') + ': ' + value) + '</span>');
        });
        if (!parts.length) parts.push('<span class="text-base-content/40">Lege rij</span>');
        html += '<div class="rounded-box border border-base-200 bg-base-50 px-3 py-2">' +
          '<div class="flex items-start justify-between gap-2">' +
            '<div class="flex flex-wrap gap-1 min-w-0">' +
              '<span class="badge badge-outline badge-sm">Rij ' + window.FSV2.esc(String(rowIndex + 1)) + '</span>' +
              parts.join('') +
            '</div>' +
            '<button class="btn btn-ghost btn-xs text-error shrink-0" data-action="remove-bulk-import-row" data-row-index="' + rowIndex + '"><i data-lucide="trash-2" class="w-3 h-3"></i></button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="text-sm text-base-content/50 italic">Nog geen rijen toegevoegd.</div>';
    }

    html += '</div>';
    editor.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [editor] });
  }

  function readBulkComposerValues() {
    var editor = document.getElementById('bulkImportEditor');
    var values = {};
    if (!editor) return values;

    editor.querySelectorAll('[data-bulk-composer-field]').forEach(function (el) {
      var field = el.getAttribute('data-bulk-composer-field');
      if (!field) return;
      values[field] = el.value;
    });
    return values;
  }

  function hasAnyBulkComposerValue(values) {
    return Object.keys(values || {}).some(function (key) {
      return normalizeBulkText(values[key]) !== '';
    });
  }

  function validateBulkComposerRow(values) {
    var cfg = S()._bulkImportConfig || {};
    var columns = Array.isArray(cfg.columns) ? cfg.columns : [];
    var normalized = {};
    var hasAny = false;

    columns.forEach(function (field) {
      var raw = Object.prototype.hasOwnProperty.call(values, field) ? values[field] : '';
      if ((raw === undefined || raw === null || normalizeBulkText(raw) === '') && cfg.bulkDefaults && Object.prototype.hasOwnProperty.call(cfg.bulkDefaults, field)) {
        raw = cfg.bulkDefaults[field];
      }
      var rule = (cfg.inputRules || {})[field] || {};
      var value = raw;

      if (rule.type === 'datetime') {
        var parsed = parseBulkDateToIso(raw);
        if (parsed === null) {
          var err = new Error('Rijvalidatie: veld "' + field + '" heeft een ongeldige datum/tijd.');
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        value = parsed;
      } else if (rule.type === 'enum') {
        value = normalizeBulkEnum(field, raw, cfg.dropdowns || {});
      } else if (rule.type === 'email') {
        value = normalizeBulkText(raw).toLowerCase();
      } else if (rule.type === 'phone') {
        value = normalizeBulkPhone(raw);
      } else {
        value = normalizeBulkText(raw);
      }

      if (normalizeBulkText(value)) hasAny = true;
      normalized[field] = value;
    });

    return { normalized: normalized, hasAny: hasAny };
  }

  function readBulkRowsFromEditor() {
    return Array.isArray(S()._bulkImportRows) ? S()._bulkImportRows : [];
  }

  function validateAndNormalizeBulkRows(rows) {
    var cfg = S()._bulkImportConfig || {};
    var columns = Array.isArray(cfg.columns) ? cfg.columns : [];
    var dropdowns = cfg.dropdowns || {};
    var inputRules = cfg.inputRules || {};

    var errors = [];
    var normalizedRows = [];

    rows.forEach(function (row, rowIndex) {
      var normalized = {};
      var hasAny = false;

      columns.forEach(function (field) {
        var raw = row && Object.prototype.hasOwnProperty.call(row, field) ? row[field] : '';
        var rule = inputRules[field] || {};
        var value = raw;

        if (rule.type === 'datetime') {
          var parsed = parseBulkDateToIso(raw);
          if (parsed === null) {
            errors.push('Rij ' + (rowIndex + 1) + ', veld "' + field + '": ongeldige datum/tijd');
            value = raw;
          } else {
            value = parsed;
          }
        } else if (rule.type === 'enum') {
          value = normalizeBulkEnum(field, raw, dropdowns);
        } else if (rule.type === 'email') {
          value = normalizeBulkText(raw).toLowerCase();
        } else if (rule.type === 'phone') {
          value = normalizeBulkPhone(raw);
        } else {
          value = normalizeBulkText(raw);
        }

        if (normalizeBulkText(value)) hasAny = true;
        normalized[field] = value;
      });

      if (hasAny) normalizedRows.push(normalized);
    });

    return { normalizedRows: normalizedRows, errors: errors };
  }

  function handleOpenImportModal() {
    var dlg = document.getElementById('importMetaLeadsDialog');
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    var submitBtn = document.getElementById('btnImportMetaLeads');
    var validateBtn = document.getElementById('btnValidateBulkImport');
    var addBtn = document.getElementById('btnAddBulkImportRow');
    var runInactiveEl = document.getElementById('bulkImportRunWhenInactive');

    if (summaryEl) summaryEl.innerHTML = '';
    if (submitBtn) submitBtn.disabled = false;
    if (validateBtn) validateBtn.disabled = false;
    if (addBtn) addBtn.disabled = false;
    if (runInactiveEl) runInactiveEl.checked = false;

    S()._bulkImportConfig = null;
    S()._bulkImportRows = [];
    S()._bulkImportComposer = {};

    if (dlg) dlg.showModal();
    loadBulkImportConfig().catch(function (err) {
      window.FSV2.showAlert('Bulk configuratie laden mislukt: ' + err.message, 'error');
    });
  }

  function handleAddBulkImportRow() {
    var composerValues = readBulkComposerValues();
    var normalized;
    var checked;
    try {
      checked = validateBulkComposerRow(composerValues);
      normalized = checked.normalized;
    } catch (err) {
      window.FSV2.showAlert(err.message || 'Rijvalidatie mislukt.', 'error');
      return;
    }

    if (!checked.hasAny) {
      window.FSV2.showAlert('Vul eerst minstens één veld in.', 'warning');
      return;
    }

    var rows = Array.isArray(S()._bulkImportRows) ? S()._bulkImportRows.slice() : [];
    rows.push(normalized);
    S()._bulkImportRows = rows;
    S()._bulkImportComposer = {};
    renderBulkImportEditor();
  }

  function handleRemoveBulkImportRow(rowIndexRaw) {
    var rowIndex = Number(rowIndexRaw);
    if (!Number.isInteger(rowIndex)) return;
    var rows = readBulkRowsFromEditor();
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    rows.splice(rowIndex, 1);
    if (!rows.length) rows.push({});
    S()._bulkImportRows = rows;
    renderBulkImportEditor();
  }

  async function handleValidateBulkImportRows() {
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    var rows = readBulkRowsFromEditor();
    var checked = validateAndNormalizeBulkRows(rows);

    if (summaryEl) {
      summaryEl.innerHTML = '<div class="text-sm space-y-1">' +
        '<div><span class="font-semibold">Ingevulde rijen:</span> ' + window.FSV2.esc(String(checked.normalizedRows.length)) + '</div>' +
        '<div><span class="font-semibold">Validatiefouten:</span> ' + window.FSV2.esc(String(checked.errors.length)) + '</div>' +
        (checked.errors.length
          ? '<div class="text-error">' + window.FSV2.esc(checked.errors.slice(0, 8).join(' | ')) + (checked.errors.length > 8 ? ' ...' : '') + '</div>'
          : '<div class="text-success">Validatie geslaagd. Klaar om te importeren.</div>') +
      '</div>';
    }

    if (checked.errors.length) {
      window.FSV2.showAlert('Validatie klaar: corrigeer de fouten.', 'warning');
    } else {
      window.FSV2.showAlert('Validatie geslaagd.', 'success');
    }
  }

  async function handleImportMetaLeads() {
    var submitBtn = document.getElementById('btnImportMetaLeads');
    var validateBtn = document.getElementById('btnValidateBulkImport');
    var addBtn = document.getElementById('btnAddBulkImportRow');
    var runInactiveEl = document.getElementById('bulkImportRunWhenInactive');
    var summaryEl = document.getElementById('importMetaLeadsSummary');
    var dlg = document.getElementById('importMetaLeadsDialog');

    if (submitBtn) submitBtn.disabled = true;
    if (validateBtn) validateBtn.disabled = true;
    if (addBtn) addBtn.disabled = true;

    if (summaryEl) summaryEl.innerHTML = '<span class="loading loading-spinner loading-xs"></span><span class="ml-2">Import wordt verwerkt...</span>';

    try {
      var rows = readBulkRowsFromEditor();
      var checked = validateAndNormalizeBulkRows(rows);
      if (checked.errors.length) {
        var errs = checked.errors.slice(0, 8);
        throw new Error('Validatiefouten in invoer:\n' + errs.join('\n') + (checked.errors.length > 8 ? '\n...' : ''));
      }

      var normalizedRows = checked.normalizedRows || [];
      if (!normalizedRows.length) {
        throw new Error('Geen ingevulde rijen om te importeren.');
      }

      var total = normalizedRows.length;
      var chunkSize = 5;
      var imported = 0;
      var allResults = [];

      for (var start = 0; start < normalizedRows.length; start += chunkSize) {
        var chunk = normalizedRows.slice(start, start + chunkSize);
        var res = await window.FSV2.api('/integrations/' + S().activeId + '/import-meta-leads', {
          method: 'POST',
          body: JSON.stringify({
            rows: chunk,
            max_rows: chunk.length,
            run_when_inactive: !!(runInactiveEl && runInactiveEl.checked),
          }),
        });
        var payload = (res && res.data) || {};
        imported += Array.isArray(payload.results) ? payload.results.length : chunk.length;
        if (Array.isArray(payload.results)) allResults = allResults.concat(payload.results);
      }

      if (summaryEl) {
        summaryEl.innerHTML = '<div class="text-sm space-y-1">' +
          '<div><span class="font-semibold">Rijen geïmporteerd:</span> ' + window.FSV2.esc(String(imported)) + '</div>' +
          '<div><span class="font-semibold">Totaal verwerkt:</span> ' + window.FSV2.esc(String(total)) + '</div>' +
          (allResults.length ? '<div class="text-success">Import voltooid.</div>' : '') +
        '</div>';
      }

      window.FSV2.showAlert('Import voltooid: ' + imported + ' rij(en).', 'success');
      if (dlg) dlg.close();
      await window.FSV2.openDetail(S().activeId);
    } catch (e) {
      if (summaryEl) summaryEl.innerHTML = '<div class="text-sm text-error">' + window.FSV2.esc(e.message || 'Import mislukt') + '</div>';
      window.FSV2.showAlert('Import mislukt: ' + e.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (validateBtn) validateBtn.disabled = false;
      if (addBtn) addBtn.disabled = false;
    }
  }

  function handleOpenExportModal() {
    var dlg = document.getElementById('exportSubmissionsDialog');
    if (dlg) dlg.showModal();
  }

  function handleExportSubmissions(format) {
    var dlg = document.getElementById('exportSubmissionsDialog');
    var fromVal = document.getElementById('exportDateFrom') && document.getElementById('exportDateFrom').value;
    var toVal   = document.getElementById('exportDateTo')   && document.getElementById('exportDateTo').value;

    var subs = (S().submissions || []).filter(function (s) {
      if (fromVal && s.created_at < fromVal) return false;
      // to-date: include the whole day (compare up to T23:59:59)
      if (toVal   && s.created_at.slice(0, 10) > toVal) return false;
      return true;
    });

    var fieldMeta    = S()._fieldMeta || {};
    var allFormFields = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var listFieldIds = Object.keys(fieldMeta).filter(function (k) { return fieldMeta[k] && fieldMeta[k].show_in_list; });
    var listColumnsMap2 = {};
    listFieldIds.forEach(function (fid) {
      var ff    = allFormFields.find(function (f) { return String(f.field_id || '') === fid; });
      var label = fieldMeta[fid].alias || (ff && ff.label) || fid;
      if (!listColumnsMap2[label]) { listColumnsMap2[label] = { fids: [], label: label }; }
      listColumnsMap2[label].fids.push(fid);
    });
    var listColumns  = Object.values(listColumnsMap2);

    function getPayloadVal(sub, fids) {
      if (!Array.isArray(fids)) fids = [fids];
      var raw = sub.source_payload;
      var payload = (raw && typeof raw === 'object') ? raw : (function () { try { return JSON.parse(raw || '{}'); } catch (e) { return {}; } }());
      // normalised lookup (same as lookupPayloadValue)
      var norm = function (k) { return String(k || '').toLowerCase().replace(/[-_\s]+/g, '_'); };
      var result = '';
      for (var i = 0; i < fids.length; i++) {
        var fid    = fids[i];
        var normFid = norm(fid);
        if (payload[fid] !== undefined && payload[fid] !== '') { result = payload[fid]; break; }
        var keys = Object.keys(payload);
        var m = keys.find(function (k) { return norm(k) === normFid && payload[k]; });
        if (m) { result = payload[m]; break; }
        var p = keys.find(function (k) { return norm(k).startsWith(normFid + '_') && payload[k]; });
        if (p) { result = payload[p]; break; }
      }
      return result;
    }

    var fixedHeaders = ['id', 'status', 'aangemaakt', 'fout'];
    var headers = fixedHeaders.concat(listColumns.map(function (c) { return c.label; }));

    var rows = subs.map(function (s) {
      var row = {
        id: window.FSV2.shortId(s.id),
        status: s.status || '',
        aangemaakt: window.FSV2.fmt(s.created_at),
        fout: s.last_error || '',
      };
      listColumns.forEach(function (c) { row[c.label] = getPayloadVal(s, c.fids); });
      return row;
    });

    var filename = 'indieningen-' + (S().detail && S().detail.integration && S().detail.integration.name
      ? S().detail.integration.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'export');

    if (format === 'json') {
      var blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      _downloadBlob(blob, filename + '.json');
    } else if (format === 'csv') {
      var csv = [headers.join(',')].concat(rows.map(function (r) {
        return headers.map(function (h) {
          var v = String(r[h] !== undefined ? r[h] : '').replace(/"/g, '""');
          return '"' + v + '"';
        }).join(',');
      })).join('\r\n');
      var blob2 = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      _downloadBlob(blob2, filename + '.csv');
    } else if (format === 'xlsx') {
      if (typeof XLSX === 'undefined') { window.FSV2.showAlert('XLSX-bibliotheek niet geladen.', 'error'); return; }
      var ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Indieningen');
      XLSX.writeFile(wb, filename + '.xlsx');
    }

    if (dlg) dlg.close();
  }

  function _downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXPORT &mdash; extend FSV2
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  Object.assign(window.FSV2, {
    handleAddBulkImportRow: handleAddBulkImportRow,
    handleExportSubmissions: handleExportSubmissions,
    handleImportMetaLeads: handleImportMetaLeads,
    handleOpenExportModal: handleOpenExportModal,
    handleOpenImportModal: handleOpenImportModal,
    handleRemoveBulkImportRow: handleRemoveBulkImportRow,
    handleValidateBulkImportRows: handleValidateBulkImportRows
  });
})();
