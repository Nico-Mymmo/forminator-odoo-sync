/**
 * Forminator Sync V2 -- Detail -- Indieningen (submissions) tab
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

  function renderDetailSubmissions() {
    var el = document.getElementById('detailHistory');
    if (!el) return;

    if (!S().submissions || S().submissions.length === 0) {
      el.innerHTML = '<p class="text-sm text-base-content/60 py-4">Nog geen indieningen.</p>';
      return;
    }

    var deleteUnlocked = !!S()._deleteUnlocked;
    var integId = String(S().activeId || '');

    // ── Toolbar ──────────────────────────────────────────────────────────
    var toolbar =
      '<div class="flex flex-wrap items-center gap-2 mb-3">' +
        '<button class="btn btn-xs btn-ghost gap-1' + (deleteUnlocked ? ' btn-warning text-warning-content' : '') + '"' +
          ' data-action="toggle-delete-unlock" title="' + (deleteUnlocked ? 'Vergrendel verwijderen' : 'Schakel verwijderen in') + '">' +
          '<i data-lucide="' + (deleteUnlocked ? 'lock-open' : 'lock') + '" class="w-3.5 h-3.5"></i>' +
          (deleteUnlocked ? 'Vergrendelen' : 'Ontgrendelen') +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="cleanup-replays" title="Verwijder mislukte pogingen die later geslaagd zijn via replay">' +
          '<i data-lucide="sparkles" class="w-3.5 h-3.5"></i>Replay opkuis' +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1 ml-auto" data-action="refresh-submissions" title="Indieningen verversen">' +
          '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>Verversen' +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="open-import-modal" title="Bulk invoer openen">' +
          '<i data-lucide="upload" class="w-3.5 h-3.5"></i>Importeren' +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="open-export-modal" title="Exporteer indieningen">' +
          '<i data-lucide="download" class="w-3.5 h-3.5"></i>Exporteren' +
        '</button>' +
      '</div>';
    var fieldMeta    = S()._fieldMeta || {};
    var allFormFields = Array.isArray(S().detailFormFields) ? S().detailFormFields : [];
    var listFieldIds = Object.keys(fieldMeta).filter(function (k) { return fieldMeta[k] && fieldMeta[k].show_in_list && !fieldMeta[k].hidden; });
    // Deduplicate columns by label — if the form was renamed, old and new field_ids may share
    // the same alias/label. Merge into one column so both old and new submissions show data.
    var listColumnsMap = {};
    listFieldIds.forEach(function (fid) {
      var ff    = allFormFields.find(function (f) { return String(f.field_id || '') === fid; });
      var label = fieldMeta[fid].alias || (ff && ff.label) || fid;
      if (!listColumnsMap[label]) { listColumnsMap[label] = { fids: [], label: label }; }
      listColumnsMap[label].fids.push(fid);
    });
    var listColumns = Object.values(listColumnsMap);
    var targets = (S().detail && S().detail.targets) || [];

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
      var raw = sub.source_payload;
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(raw); } catch (e) { return {}; }
    }
    function listColumnValue(sub, col) {
      var payload = parsePayload(sub);
      // col can be { fids, label } (new) or a bare fid string (safety)
      var fids = (col && col.fids) ? col.fids : [col];
      var val  = '';
      for (var fi = 0; fi < fids.length; fi++) {
        val = lookupPayloadValue(payload, fids[fi]);
        if (val) break;
      }
      return val
        ? '<span class="font-medium">' + esc(String(val).slice(0, 80)) + '</span>'
        : '<span class="text-base-content/30">&mdash;</span>';
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
    var replaysByOrigId = {};
    replays.forEach(function (r) {
      if (!replaysByOrigId[r.replay_of_submission_id]) replaysByOrigId[r.replay_of_submission_id] = [];
      replaysByOrigId[r.replay_of_submission_id].push(r);
    });
    var ordered   = [];
    originals.forEach(function (orig) {
      ordered.push({ sub: orig, isReplay: false });
      replays.filter(function (r) { return r.replay_of_submission_id === orig.id; })
        .forEach(function (r) { ordered.push({ sub: r, isReplay: true }); });
    });
    replays.filter(function (r) { return !originals.find(function (o) { return o.id === r.replay_of_submission_id; }); })
      .forEach(function (r) { ordered.push({ sub: r, isReplay: true }); });

    // (showIndiener removed — listColumns drives the dynamic columns)

    // Builds the expandable timeline row for a submission.
    var skipLabels = {
      pipeline_abort:                 'Overgeslagen \u2014 eerdere stap mislukt',
      dependency_missing:             'Overgeslagen \u2014 vereiste uitvoer ontbreekt',
      retry_skip_already_successful:  'Niet opnieuw uitgevoerd (replay)',
      condition_not_met:              'Stap overgeslagen (conditie niet voldaan)',
    };
    var actionColors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error', posted: 'badge-success' };
    var actionLabels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt', posted: 'notitie geplaatst' };
    var colCount = 5 + listColumns.length;

    function buildTimelineRow(sub) {
      var shortId = window.FSV2.shortId(sub.id);
      var ctx;
      // resolved_context can arrive as a JSONB object (Supabase) or serialized JSON string.
      var rc = sub.resolved_context;
      try { ctx = (rc && typeof rc === 'object') ? rc : JSON.parse(rc || '{}'); } catch (e2) { ctx = {}; }
      var actions  = ctx.target_actions || [];
      var payload  = parsePayload(sub);
      var pKeys    = Object.keys(payload).filter(function (k) { return payload[k] && k !== 'nonce'; }).slice(0, 5);
      var payloadHtml = pKeys.length
        ? '<div class="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-xs text-base-content/60">' +
            pKeys.map(function (k) {
              return '<span><span class="font-mono text-base-content/30">' + esc(k) + ':</span> ' + esc(String(payload[k]).slice(0, 60)) + '</span>';
            }).join('') +
          '</div>'
        : '';
      var isReplaySub = !!sub.replay_of_submission_id;
      var isFailed    = ['permanent_failed', 'retry_exhausted', 'partial_failed'].includes(String(sub.status || ''));

      // Prefer target_actions from context; fall back to reconstructing from targets list + flat step.N.* keys.
      var stepsToShow = actions;
      if (!stepsToShow.length && targets.length) {
        var sortedT = targets.slice().sort(function (a, b) {
          var ao = a.execution_order != null ? a.execution_order : (a.order_index != null ? a.order_index : 0);
          var bo = b.execution_order != null ? b.execution_order : (b.order_index != null ? b.order_index : 0);
          return ao - bo;
        });
        stepsToShow = sortedT.map(function (t) {
          var order = t.execution_order != null ? t.execution_order : (t.order_index != null ? t.order_index : 0);
          return {
            model:           t.odoo_model,
            label:           t.label || null,
            execution_order: order,
            action:          ctx['step.' + order + '.action'] || null,
            record_id:       ctx['step.' + order + '.record_id'] || null,
            skipped_reason:  null,
            error_detail:    null
          };
        });
      }

      // If every step is missing an action, don't show phantom "niet uitgevoerd" rows
      // for success submissions — just note no details were stored.
      var allActionsNull = stepsToShow.length > 0 && stepsToShow.every(function (a) { return !a.action; });
      if (allActionsNull && !isFailed) {
        stepsToShow = [];
      }

      var timelineHtml = stepsToShow.length
        ? stepsToShow.map(function (a) {
            var sl              = (a.skipped_reason && skipLabels[a.skipped_reason]) || '';
            var isReplaySkip    = a.skipped_reason === 'retry_skip_already_successful';
            var isConditionSkip = a.skipped_reason === 'condition_not_met';
            var stepNum         = a.execution_order != null ? (Number(a.execution_order) + 1) : null;
            var stepLabel       = isConditionSkip
              ? 'overgeslagen (conditie)'
              : (isReplaySub && (a.action === 'created' || a.action === 'updated'))
                ? 'Geslaagd bij replay'
                : (a.action ? (actionLabels[a.action] || esc(a.action)) : '<span class="italic opacity-50">niet uitgevoerd</span>');
            var stepColor       = isConditionSkip
              ? 'badge-warning'
              : (a.action ? (actionColors[a.action] || 'badge-ghost') : 'badge-neutral');
            return '<div class="flex flex-wrap items-start gap-1.5 text-xs py-1.5 border-b border-base-100/50 last:border-0">' +
              (stepNum != null ? '<span class="badge badge-outline badge-xs font-mono w-5 text-center shrink-0 mt-0.5">' + esc(String(stepNum)) + '</span>' : '') +
              '<div class="flex flex-col gap-0.5 min-w-0">' +
                '<div class="flex flex-wrap items-center gap-1.5">' +
                  (a.label ? '<span class="font-medium">' + esc(a.label) + '</span>' : '') +
                  '<span class="font-mono text-base-content/40">' + esc(a.model || '-') + '</span>' +
                  '<span class="badge badge-xs ' + stepColor + '">' + stepLabel + '</span>' +
                  (a.record_id ? '<span class="font-mono text-base-content/30">#' + esc(String(a.record_id)) + '</span>' : '') +
                  (sl && !isConditionSkip ? '<span class="text-xs ' + (isReplaySkip ? 'text-base-content/30 italic' : 'text-warning') + '">' + esc(sl) + '</span>' : '') +
                '</div>' +
                (isConditionSkip && a.error_detail
                  ? '<div class="mt-1 flex items-start gap-1.5 p-1.5 rounded bg-warning/10 border border-warning/20 text-warning/90 font-mono break-all">' +
                      '<i data-lucide="filter" class="w-3 h-3 shrink-0 mt-0.5"></i>' +
                      '<span>' + esc(a.error_detail) + '</span>' +
                    '</div>'
                  : (a.error_detail ? '<span class="text-error/70 font-mono break-all">' + esc(a.error_detail) + '</span>' : '')) +
              '</div>' +
            '</div>';
          }).join('')
        : '<span class="text-xs text-base-content/40 italic">Geen stapdetails beschikbaar.</span>';

      var errorHtml = (isFailed && sub.last_error)
        ? '<div class="mt-2 p-2 rounded bg-error/10 border border-error/20 text-xs text-error font-mono break-all">' +
            '<span class="font-semibold mr-1">Fout:</span>' + esc(sub.last_error) +
          '</div>'
        : '';

      function safeJsonPretty(raw) {
        try {
          var obj = (raw && typeof raw === 'object') ? raw : JSON.parse(raw || '{}');
          return JSON.stringify(obj, null, 2);
        } catch (e_) { return String(raw || ''); }
      }
      var payloadDetailHtml =
        '<div class="mt-3 space-y-2">' +
          '<details>' +
            '<summary class="text-xs font-semibold cursor-pointer select-none text-base-content/60 hover:text-base-content py-1">' +
              '&#x25B6; Inkomende payload</summary>' +
            '<pre class="text-xs font-mono bg-base-300 rounded p-2 mt-1 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
              esc(safeJsonPretty(sub.source_payload)) + '</pre>' +
          '</details>' +
          '<details>' +
            '<summary class="text-xs font-semibold cursor-pointer select-none text-base-content/60 hover:text-base-content py-1">' +
              '&#x25B6; Verwerkte context (uitgaand naar Odoo)</summary>' +
            '<pre class="text-xs font-mono bg-base-300 rounded p-2 mt-1 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
              esc(safeJsonPretty(sub.resolved_context)) + '</pre>' +
          '</details>' +
        '</div>';

      return '<tr class="sub-timeline-row" id="stl-' + esc(shortId) + '" style="display:none">' +
        '<td colspan="' + colCount + '" class="bg-base-200/40 px-4 py-3">' + payloadHtml + timelineHtml + errorHtml + payloadDetailHtml + '</td>' +
        '</tr>';
    }

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
      toolbar +
      '<div class="overflow-x-auto">' +
        '<table class="table table-xs">' +
          '<thead><tr><th>ID</th>' + listColumns.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th>Status</th><th>Fout</th><th>Aangemaakt</th><th class="sticky right-0 bg-base-100 z-10">Actie</th></tr></thead>' +
          '<tbody>' +
          ordered.map(function (item) {
            var sub         = item.sub;
            var isReplay    = item.isReplay;
            var shortId     = window.FSV2.shortId(sub.id);
            var successfulReplay = !isReplay && (replaysByOrigId[sub.id] || []).some(function (r) {
              return ['success', 'processed'].includes(String(r.status || ''));
            });
            var replayAllowed = !isReplay && !successfulReplay && ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(sub.status || ''));
            // Force-replay: allow replaying any submission (incl. success) when delete is unlocked.
            // Useful to retroactively fix submissions that were processed with broken mappings.
            var forceReplayAllowed = deleteUnlocked && !replayAllowed && ['success', 'processed', 'partial_failed'].includes(String(sub.status || ''));
            var errorCell   = sub.last_error
              ? '<span class="text-xs text-error/80 font-mono" title="' + esc(sub.last_error) + '">' +
                  esc(sub.last_error.slice(0, 40)) + (sub.last_error.length > 40 ? '\u2026' : '') +
                '</span>'
              : '<span class="text-base-content/30">&mdash;</span>';
            var mainRow =
              '<tr class="sub-row cursor-pointer' + (isReplay ? ' bg-success/5' : '') + '" data-sub-id="' + esc(shortId) + '">' +
                '<td class="font-mono text-xs">' +
                  (isReplay ? '<span class="badge badge-xs badge-accent mr-1">\u21b3 Replay</span>' : '') +
                  esc(shortId) +
                '</td>' +
                listColumns.map(function (c) { return '<td class="text-xs">' + listColumnValue(sub, c) + '</td>'; }).join('') +
                '<td>' + statusBadge(sub.status) +
                  (successfulReplay ? '<span class="badge badge-xs badge-success ml-1">✓ opgelost via replay</span>' : '') +
                  actionBadge(sub) + '</td>' +
                '<td class="max-w-[10rem] truncate overflow-hidden">' + errorCell + '</td>' +
                '<td class="text-xs whitespace-nowrap">' + esc(window.FSV2.fmt(sub.created_at)) + '</td>' +
                '<td class="sticky right-0 bg-base-100">' + (replayAllowed
                  ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '">Replay</button>'
                  : '') +
                  (forceReplayAllowed
                    ? '<button class="btn btn-xs btn-outline btn-warning" data-action="replay-submission" data-id="' + esc(sub.id) + '" title="Opnieuw verwerken (forceren)"><i data-lucide="refresh-cw" class="w-3 h-3 mr-1"></i>Herverwerk</button>'
                    : '') +
                  (deleteUnlocked
                    ? '<button class="btn btn-xs btn-ghost btn-square text-error ml-1" data-action="delete-submission" data-id="' + esc(sub.id) + '" title="Verwijder indienen"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
                    : '') +
                '</td>' +
              '</tr>';
            return mainRow + buildTimelineRow(sub);
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    // Click delegation: toggle timeline row on row click (skip clicks on action buttons).
    el.querySelectorAll('.sub-row').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('button, a')) return;
        var timeline = document.getElementById('stl-' + tr.dataset.subId);
        if (timeline) timeline.style.display = (timeline.style.display === 'none' ? '' : 'none');
      });
    });  }

  async function handleReplay(submissionId) {
    var body = await window.FSV2.api('/submissions/' + submissionId + '/replay', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    window.FSV2.showAlert('Replay gestart: ' + window.FSV2.shortId((body.data || {}).replay_submission_id), 'success');
    await window.FSV2.openDetail(S().activeId);
  }

  async function handleDeleteSubmission(submissionId) {
    if (!confirm('Indienen ' + window.FSV2.shortId(submissionId) + ' verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    await window.FSV2.api('/submissions/' + submissionId, { method: 'DELETE' });
    window.FSV2.showAlert('Indienen verwijderd.', 'success');
    await window.FSV2.openDetail(S().activeId);
  }

  function handleToggleDeleteUnlock() {
    S()._deleteUnlocked = !S()._deleteUnlocked;
    window.FSV2.renderDetailSubmissions();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  async function handleCleanupReplays() {
    var integId = String(S().activeId || '');
    if (!integId) return;
    if (!confirm('Verwijder alle mislukte originele indieningen en replay-pogingen waarvoor een geslaagde replay bestaat? Dit kan niet ongedaan worden gemaakt.')) return;
    try {
      var res = await window.FSV2.api('/integrations/' + integId + '/cleanup-replays', { method: 'POST' });
      window.FSV2.showAlert('Opgekuist: ' + res.data.deleted + ' verwijderd, ' + res.data.promoted + ' gepromoveerd.', 'success');
      await window.FSV2.openDetail(integId);
    } catch (e) {
      window.FSV2.showAlert('Opkuis mislukt: ' + e.message, 'error');
    }
  }


  Object.assign(window.FSV2, {
    handleCleanupReplays: handleCleanupReplays,
    handleDeleteSubmission: handleDeleteSubmission,
    handleReplay: handleReplay,
    handleToggleDeleteUnlock: handleToggleDeleteUnlock,
    renderDetailSubmissions: renderDetailSubmissions
  });
})();
