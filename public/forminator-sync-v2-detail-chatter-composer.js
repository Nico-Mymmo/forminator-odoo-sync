/**
 * Forminator Sync V2 -- Detail -- Chatter-bericht step composer
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

  var _chatterPreviewTimers = {};

  function renderChatterComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    var currentTemplate   = target.chatter_template || '';
    var COMBINED_PREFIX   = '__COMBINED__:';
    var SUMMARY_PREFIX    = '__SUMMARY__:';
    var savedMessage      = '';
    var summaryEnabled    = false;
    var summaryOrderedIds = [];
    var savedLabelMap     = {};

    if (currentTemplate.startsWith(COMBINED_PREFIX)) {
      try {
        var cp = JSON.parse(currentTemplate.slice(COMBINED_PREFIX.length));
        savedMessage      = String(cp.message || '');
        summaryEnabled    = true;
        summaryOrderedIds = Array.isArray(cp.ids)  ? cp.ids  : [];
        savedLabelMap     = cp.labels || {};
      } catch (_e) {}
    } else if (currentTemplate.startsWith(SUMMARY_PREFIX)) {
      try {
        var sp = JSON.parse(currentTemplate.slice(SUMMARY_PREFIX.length));
        summaryEnabled    = true;
        summaryOrderedIds = Array.isArray(sp) ? sp : (Array.isArray(sp.ids) ? sp.ids : []);
        savedLabelMap     = (sp && sp.labels) || {};
      } catch (_e) {}
    } else {
      savedMessage = currentTemplate;
    }

    var _ffr       = window.FSV2.buildDetailFlatFields(S().detailFormFields || []);
    var flatFields = _ffr.flatFields || [];

    var orderedFields;
    if (summaryOrderedIds.length) {
      var _seen = {};
      orderedFields = [];
      summaryOrderedIds.forEach(function (fid) {
        var f = flatFields.find(function (ff) {
          return (ff.field_id || ff.fieldId || ff.id || ff.name || '') === fid;
        });
        if (f) { orderedFields.push(f); _seen[fid] = true; }
      });
      flatFields.forEach(function (f) {
        var fid = f.field_id || f.fieldId || f.id || f.name || '';
        if (!_seen[fid]) orderedFields.push(f);
      });
    } else {
      orderedFields = flatFields.slice();
    }

    // ── 2-column layout ───────────────────────────────────────────────────────
    var html = '<div class="grid grid-cols-[1fr_340px] gap-5 items-start">';

    // ══ LEFT COLUMN ══════════════════════════════════════════════════════════
    html += '<div class="flex flex-col gap-3 min-w-0">';

    // Vrij bericht (Quill)
    html += '<div class="form-control">' +
      '<label class="label pb-1">' +
        '<span class="label-text text-sm font-medium">Vrij bericht <span class="font-normal text-base-content/50">(optioneel)</span></span>' +
        '<span class="label-text-alt text-base-content/50 text-xs">Klik op een veld om het in te voegen.</span>' +
      '</label>' +
      '<div id="chatterQuillEditor-' + esc(tid) + '" class="rounded-lg overflow-hidden border border-base-300"></div>' +
      '</div>';

    // Field insertion chips
    if (flatFields.length) {
      html += '<div class="flex flex-wrap gap-1">';
      flatFields.forEach(function (f) {
        var fid = f.field_id || f.fieldId || f.id || f.name || '';
        var lbl = f.label || fid;
        html += '<button type="button"' +
          ' class="badge badge-outline badge-sm cursor-pointer hover:badge-primary transition-colors"' +
          ' data-action="insert-chatter-field" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
          ' title="Invoegen: {' + esc(fid) + '}">' + esc(lbl) + '</button>';
      });
      html += '</div>';
    }

    // Formuliersamenvatting toggle
    html += '<div class="divider text-xs my-0">OF COMBINEER MET</div>';
    html += '<label class="flex items-center gap-3 cursor-pointer select-none">' +
      '<input type="checkbox" class="toggle toggle-sm toggle-primary" id="chatterSummaryToggle-' + esc(tid) + '"' +
        (summaryEnabled ? ' checked' : '') +
        ' onchange="var p=document.getElementById(\x27chatterSummaryPanel-' + esc(tid) + '\x27);if(p)p.classList.toggle(\x27hidden\x27,!this.checked);window.FSV2.scheduleChatterPreview&&window.FSV2.scheduleChatterPreview(\x27' + esc(tid) + '\x27)">' +
      '<div>' +
        '<div class="text-sm font-medium">Formuliersamenvatting</div>' +
        '<div class="text-xs text-base-content/50">Selecteer en orden de velden die in de HTML-tabel verschijnen.</div>' +
      '</div>' +
      '</label>';

    // Summary field panel
    html += '<div id="chatterSummaryPanel-' + esc(tid) + '"' + (!summaryEnabled ? ' class="hidden"' : '') + '>';
    if (orderedFields.length) {
      html += '<p class="text-xs text-base-content/50 mb-1.5">Vink aan + sleep met ▲▼ om volgorde en selectie aan te passen. Niets aangevinkt = alle velden.</p>';
      html += '<ul id="chatterFieldList-' + esc(tid) + '" class="border border-base-200 rounded-lg overflow-hidden mb-1">';
      orderedFields.forEach(function (f) {
        var fid = f.field_id || f.fieldId || f.id || f.name || '';
        var lbl = f.label || fid;
        var chk = (!summaryOrderedIds.length || summaryOrderedIds.indexOf(fid) !== -1) ? ' checked' : '';
        html += '<li data-fid="' + esc(fid) + '" class="flex items-center gap-2 px-3 py-1.5 border-b border-base-200 last:border-0 bg-base-100 hover:bg-base-200/40">' +
          '<input type="checkbox" class="checkbox checkbox-xs shrink-0" data-summary-field="' + esc(tid) + '" value="' + esc(fid) + '"' + chk +
            ' onchange="window.FSV2.scheduleChatterPreview&&window.FSV2.scheduleChatterPreview(\x27' + esc(tid) + '\x27)">' +
          '<span class="flex-1 text-sm truncate">' + esc(lbl) + '</span>' +
          '<div class="flex flex-col shrink-0">' +
            '<button type="button" data-action="chatter-field-up" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
              ' class="h-4 w-5 flex items-center justify-center text-xs text-base-content/40 hover:text-base-content" title="Omhoog">▲</button>' +
            '<button type="button" data-action="chatter-field-down" data-target-id="' + esc(tid) + '" data-field-id="' + esc(fid) + '"' +
              ' class="h-4 w-5 flex items-center justify-center text-xs text-base-content/40 hover:text-base-content" title="Omlaag">▼</button>' +
          '</div>' +
        '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="text-sm text-base-content/50 italic mb-1">Geen formuliervelden beschikbaar.</p>';
    }
    html += '</div>'; // end #chatterSummaryPanel


    html += '</div>'; // end LEFT column

    // ══ RIGHT COLUMN — preview ════════════════════════════════════════════════
    html += '<div class="flex flex-col sticky top-4">';
    html += '<div class="flex items-center justify-between mb-1.5">' +
      '<div class="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Voorbeeld in Odoo</div>' +
      '<div id="chatterTopNav-' + esc(tid) + '" class="flex items-center gap-1 text-xs text-base-content/40"></div>' +
      '</div>';
    html += '<div class="border border-base-300 rounded-lg overflow-hidden shadow-sm">' +
      '<div style="background:#875a7b;padding:6px 12px;display:flex;align-items:center;gap:8px">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:bold">FS</div>' +
        '<div>' +
          '<div style="color:#fff;font-size:12px;font-weight:600">Forminator Sync</div>' +
          '<div style="color:rgba(255,255,255,0.7);font-size:10px">Interne notitie</div>' +
        '</div>' +
        '<div id="chatterPreviewNav-' + esc(tid) + '" class="ml-auto flex items-center gap-0.5"></div>' +
      '</div>' +
      '<iframe sandbox="allow-scripts allow-same-origin" id="chatterPreviewFrame-' + esc(tid) + '"' +
        ' class="w-full" style="height:80px;background:#fff;display:block;"></iframe>' +
      '</div>';
    html += '</div>'; // end RIGHT column

    html += '</div>'; // end grid

    el.innerHTML = html;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });

    // ── Init Quill editor ──────────────────────────────────────────────
    if (!window.FSV2._chatterQuills) window.FSV2._chatterQuills = {};
    var _quillEditorEl = document.getElementById('chatterQuillEditor-' + tid);
    if (_quillEditorEl && window.EOQuill) {
      var _qi = window.EOQuill.create({
        target:      _quillEditorEl,
        initialHtml: savedMessage || '',
        placeholder: 'Bijv: Aanvraag van {email-1} ontvangen.',
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'clean']
        ]
      });
      if (_qi) {
        window.FSV2._chatterQuills[tid] = _qi;
        var qlEd = _quillEditorEl.querySelector('.ql-editor');
        if (qlEd) { qlEd.style.maxHeight = '180px'; qlEd.style.overflowY = 'auto'; }
        _qi.quill.on('text-change', function () {
          if (window.FSV2.scheduleChatterPreview) window.FSV2.scheduleChatterPreview(tid);
        });
      }
    }

    scheduleChatterPreview(tid);
  }

    function scheduleChatterPreview(tid) {
    if (_chatterPreviewTimers[tid]) clearTimeout(_chatterPreviewTimers[tid]);
    _chatterPreviewTimers[tid] = setTimeout(function () { updateChatterPreview(tid); }, 150);
  }

  /* Genereer een generische voorbeeldwaarde op basis van veldtype + keuzes. */
  function _makeSampleValue(field) {
    var type = String(field.type || '').toLowerCase();
    var loremWords = ['Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'];
    var loremPick  = function (n) { return loremWords.slice(0, n).join(' '); };
    // Keuzevelden → pak de eerste optie (of willekeurige)
    if (field.choices && field.choices.length) {
      var idx = Math.floor(Math.random() * field.choices.length);
      var c   = field.choices[idx];
      return String(c.label || c.value || c);
    }
    if (type === 'email')                         return 'lorem@example.com';
    if (type === 'tel'  || type === 'phone')      return '+32 499 12 34 56';
    if (type === 'number' || type === 'currency') return '42';
    if (type === 'date')                          return '2026-03-04';
    if (type === 'time')                          return '09:00';
    if (type === 'url')                           return 'https://example.com';
    if (type === 'textarea')                      return loremPick(8) + '.';
    if (type === 'checkbox')                      return 'Ja';
    // Naam-achtige velden herkennen via label
    var lbl = String(field.label || '').toLowerCase();
    if (lbl.includes('naam') || lbl.includes('name')) return 'Lorem Ipsum';
    // Standaard: 2-3 lorem-woorden
    return loremPick(3);
  }

  function updateChatterPreview(tid) {
    var frame  = document.getElementById('chatterPreviewFrame-' + tid);
    var topNav = document.getElementById('chatterTopNav-' + tid);
    if (!frame) return;

    // ── Submission data ───────────────────────────────────────────────────────
    var _subs = (S().submissions || []).filter(function (s) { return s.source_payload; });
    if (!window.FSV2._chatterPreviewSubmIdx) window.FSV2._chatterPreviewSubmIdx = {};
    var _previewIdx = window.FSV2._chatterPreviewSubmIdx[tid] || 0;
    if (_previewIdx >= _subs.length) _previewIdx = 0;
    var _previewSub = _subs[_previewIdx] || null;
    var realPayload = null;
    if (_previewSub) {
      try {
        realPayload = (typeof _previewSub.source_payload === 'object')
          ? _previewSub.source_payload
          : JSON.parse(_previewSub.source_payload);
      } catch (e) {}
    }

    // ── Nav HTML helper ───────────────────────────────────────────────────────
    function _navHtml(dark) {
      var btnCls = dark
        ? 'btn btn-xs btn-ghost btn-circle" style="color:rgba(255,255,255,0.7)'
        : 'btn btn-xs btn-ghost btn-circle opacity-60';
      var lblStyle = dark ? 'color:rgba(255,255,255,0.7);font-size:10px;font-variant-numeric:tabular-nums'
                          : 'font-size:11px';
      if (_subs.length > 1) {
        return '<button data-action="chatter-preview-nav" data-target-id="' + tid + '" data-dir="-1" class="' + btnCls + '">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
          '</button>' +
          '<span style="' + lblStyle + '">inzending ' + (_previewIdx + 1) + '/' + _subs.length + '</span>' +
          '<button data-action="chatter-preview-nav" data-target-id="' + tid + '" data-dir="1" class="' + btnCls + '">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</button>';
      } else if (_subs.length === 1 && _previewSub) {
        var d = new Date(_previewSub.created_at || '');
        var lbl = isNaN(d) ? 'inzending' : d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
        return '<span style="' + lblStyle + '">' + lbl + '</span>';
      }
      return dark ? '<span style="' + lblStyle + '">voorbeeldwaarden</span>' : '';
    }

    if (topNav) topNav.innerHTML = _navHtml(false);

    // ── Sample form values ────────────────────────────────────────────────────
    var sampleForm = {};
    var labelMap   = {};
    var _ff = window.FSV2.buildDetailFlatFields(S().detailFormFields || []).flatFields || [];

    _ff.forEach(function (f) {
      var k = f.field_id || f.fieldId || f.id || f.name || '';
      if (!k) return;
      labelMap[k] = f.label || k;
      if (realPayload) {
        if (realPayload[k] != null && realPayload[k] !== '') { sampleForm[k] = String(realPayload[k]); return; }
        var normK = k.toLowerCase().replace(/[-_\s]+/g, '_');
        var matchKey = Object.keys(realPayload).find(function (pk) {
          return pk.toLowerCase().replace(/[-_\s]+/g, '_') === normK && realPayload[pk] != null && realPayload[pk] !== '';
        });
        if (matchKey) { sampleForm[k] = String(realPayload[matchKey]); return; }
        var prefixKey = Object.keys(realPayload).find(function (pk) {
          return pk.toLowerCase().replace(/[-_\s]+/g, '_').startsWith(normK + '_') && realPayload[pk] != null && realPayload[pk] !== '';
        });
        if (prefixKey) { sampleForm[k] = String(realPayload[prefixKey]); return; }
      }
      sampleForm[k] = window.FSV2._makeSampleValue(f);
    });

    // ── Inline fallback summary builder ──────────────────────────────────────
    var _buildInlineSummary = function (ids, form, lblMap) {
      var keys = (ids && ids.length)
        ? ids.filter(function (k) { return form[k] != null && form[k] !== ''; })
        : Object.keys(form).filter(function (k) {
            return !['form_id','form_uid','ovme_forminator_id','nonce'].includes(k) && !k.includes('.');
          });
      if (!keys.length) return '';
      var trs = keys.map(function (k) {
        var lbl = (lblMap && lblMap[k]) || k.replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\s+\d+$/, '');
        var val = String(form[k] || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
        return '<tr><td style="padding-bottom:16px">' +
          '<span style="font-weight:600;display:block;margin-bottom:4px;color:#374151">' + lbl + '</span>' +
          '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fafafa;color:#111827">' + val + '</div>' +
          '</td></tr>';
      }).join('');
      return '<div style="max-width:620px;font-family:Arial,sans-serif;font-size:14px;color:#374151">' +
        '<table style="width:100%;border-collapse:collapse"><tbody>' + trs + '</tbody></table></div>';
    };

    var _buildHtml = window.FSV2.buildHtmlFormSummary || _buildInlineSummary;
    var parts = [];

    var _qi    = window.FSV2._chatterQuills && window.FSV2._chatterQuills[tid];
    var rawMsg = _qi ? _qi.getHTML() : '';
    if (rawMsg) {
      var msgHtml = rawMsg.replace(/\{([^}]+)\}/g, function (_, key) {
        var v = sampleForm[key] !== undefined ? String(sampleForm[key]) : ('[' + key + ']');
        return '<b>' + v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</b>';
      });
      parts.push(msgHtml);
    }

    var toggle = document.getElementById('chatterSummaryToggle-' + tid);
    if (toggle && toggle.checked) {
      var fieldList  = document.getElementById('chatterFieldList-' + tid);
      var orderedIds = [];
      if (fieldList) {
        fieldList.querySelectorAll('li[data-fid]').forEach(function (li) {
          var cb = li.querySelector('input[type="checkbox"]');
          if (cb && cb.checked) orderedIds.push(li.getAttribute('data-fid'));
        });
      }
      var summaryHtml = _buildHtml(orderedIds.length ? orderedIds : null, sampleForm, labelMap);
      if (summaryHtml) parts.push(summaryHtml);
    }

    var html;
    if (parts.length) {
      html = '<!DOCTYPE html><html><body style="margin:12px 16px;padding:0;overflow:hidden">' + parts.join('') + '</body></html>';
    } else {
      html = '<!DOCTYPE html><html><body style="margin:0;padding:16px;overflow:hidden"><p style="color:#9ca3af;font-family:Arial;font-size:13px;margin:0">Typ een bericht of schakel de samenvatting in om een voorbeeld te zien.</p></body></html>';
    }

    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (doc) { doc.open(); doc.write(html); doc.close(); }
      // Auto-resize: grow to fit content, no upper cap
      setTimeout(function () {
        try {
          var body = frame.contentDocument && frame.contentDocument.body;
          if (body) frame.style.height = Math.max(body.scrollHeight + 32, 60) + 'px';
        } catch (e) {}
      }, 60);
    } catch (e) { /* ignore */ }
  }

    async function handleSaveChatterComposer(tid) {
    var target = ((S().detail && S().detail.targets) || []).find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Target niet gevonden.', 'error'); return; }
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;

    // Vrij bericht: lees HTML van Quill editor
    var _qiSave = window.FSV2._chatterQuills && window.FSV2._chatterQuills[tid];
    var rawMsg  = _qiSave ? _qiSave.getHTML() : '';

    // Samenvatting toggle
    var toggle         = document.getElementById('chatterSummaryToggle-' + tid);
    var summaryEnabled = toggle && toggle.checked;

    var template;
    if (summaryEnabled) {
      var fieldList  = document.getElementById('chatterFieldList-' + tid);
      var pickedIds  = [];
      var labelMap   = {};
      var _ffSave    = window.FSV2.buildDetailFlatFields(S().detailFormFields || []).flatFields || [];
      var _fidLblMap = {};
      _ffSave.forEach(function (f) {
        var k = f.field_id || f.fieldId || f.id || f.name || '';
        if (k) _fidLblMap[k] = f.label || k;
      });
      if (fieldList) {
        fieldList.querySelectorAll('li[data-fid]').forEach(function (li) {
          var fid = li.getAttribute('data-fid');
          var cb  = li.querySelector('input[type="checkbox"]');
          if (cb && cb.checked && fid) {
            pickedIds.push(fid);
            if (_fidLblMap[fid]) labelMap[fid] = _fidLblMap[fid];
          }
        });
      }
      template = '__COMBINED__:' + JSON.stringify({ message: rawMsg, ids: pickedIds, labels: labelMap });
    } else if (rawMsg) {
      template = rawMsg;
    } else {
      template = null;
    }

    // Read selected steps (multi-checkbox)
    var stepListEl  = document.getElementById('chatterStepList-' + tid);
    var selectedOrders = [];
    if (stepListEl) {
      stepListEl.querySelectorAll('input[data-chatter-step]:checked').forEach(function (cb) {
        selectedOrders.push(cb.value);
      });
    }

    // Derive odoo_model from first selected step
    var allTargets  = (S().detail && S().detail.targets) || [];
    var linkedModel = target.odoo_model;
    if (selectedOrders.length) {
      var firstOrder  = parseInt(selectedOrders[0], 10);
      var firstTarget = allTargets.find(function (t) {
        return window.FSV2.getTargetOrder(t, 0) === firstOrder && t.operation_type !== 'chatter_message';
      });
      if (firstTarget && firstTarget.odoo_model) linkedModel = firstTarget.odoo_model;
    }

    try {
      // 1. Update target metadata
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify({
          odoo_model:            linkedModel,
          operation_type:        'chatter_message',
          chatter_template:      template || null,
          chatter_subtype_xmlid: 'mail.mt_note',
        }),
      });

      // 2. Delete ALL existing _chatter_record_id mappings for this target
      var existingMappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
      var oldChatterMappings = existingMappings.filter(function (m) { return m.odoo_field === '_chatter_record_id'; });
      for (var di = 0; di < oldChatterMappings.length; di++) {
        await window.FSV2.api('/mappings/' + oldChatterMappings[di].id, { method: 'DELETE' });
      }

      // 3. Create one mapping per selected step
      for (var si = 0; si < selectedOrders.length; si++) {
        var stepOrder   = selectedOrders[si];
        var sourceValue = 'step.' + stepOrder + '.record_id';
        await window.FSV2.api('/targets/' + tid + '/mappings', {
          method: 'POST',
          body: JSON.stringify({
            odoo_field:      '_chatter_record_id',
            source_type:     'previous_step_output',
            source_value:    sourceValue,
            is_identifier:   si === 0,   // first one is identifier
            is_required:     true,
            is_update_field: false,
          }),
        });
      }

      window.FSV2.showAlert('Chatter-stap opgeslagen.', 'success');
      await window.FSV2.openDetail(S().activeId);
    } catch (e) {
      window.FSV2.showAlert('Fout bij opslaan: ' + e.message, 'error');
    }
  }


  // ── ACTIVITY COMPOSER ────────────────────────────────────────────────────


  Object.assign(window.FSV2, {
    _makeSampleValue: _makeSampleValue,
    handleSaveChatterComposer: handleSaveChatterComposer,
    renderChatterComposer: renderChatterComposer,
    scheduleChatterPreview: scheduleChatterPreview,
    updateChatterPreview: updateChatterPreview
  });
})();
