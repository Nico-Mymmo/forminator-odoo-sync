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

  /**
   * Statussen waarvoor een Replay-knop getoond wordt.
   *
   * MOET gelijk blijven aan REPLAYABLE_STATUSES in worker-handler.js. Staat een
   * status hier wel en daar niet, dan krijg je een knop die met
   * "Replay not allowed for status: ..." wordt afgewezen -- precies wat er
   * gebeurde toen 'received' hier al stond en daar nog niet.
   * replay-status-parity-test.mjs bewaakt dat.
   */
  var REPLAYBARE_STATUSSEN = ['received', 'partial_failed', 'permanent_failed', 'retry_exhausted'];

  function renderDetailSubmissions() {
    var el = document.getElementById('detailHistory');
    if (!el) return;

    if (!S().submissions || S().submissions.length === 0) {
      el.innerHTML = '<p class="text-sm text-base-content/60 py-4">Nog geen indieningen.</p>';
      return;
    }

    var deleteUnlocked = !!S()._deleteUnlocked;
    var showIdColumn   = !!S()._showIdColumn;
    var integId = String(S().activeId || '');

    // ── Toolbar ──────────────────────────────────────────────────────────
    var toolbar =
      '<div class="flex flex-wrap items-center gap-2 mb-3">' +
        '<button class="btn btn-xs btn-ghost gap-1' + (deleteUnlocked ? ' btn-warning text-warning-content' : '') + '"' +
          ' data-action="toggle-delete-unlock" title="' + (deleteUnlocked ? 'Vergrendel verwijderen' : 'Schakel verwijderen in') + '">' +
          '<i data-lucide="' + (deleteUnlocked ? 'lock-open' : 'lock') + '" class="w-3.5 h-3.5"></i>' +
          (deleteUnlocked ? 'Vergrendelen' : 'Ontgrendelen') +
        '</button>' +
        '<button class="btn btn-xs btn-ghost gap-1" data-action="toggle-id-column" title="' + (showIdColumn ? 'ID-kolom verbergen' : 'ID-kolom tonen') + '">' +
          '<i data-lucide="hash" class="w-3.5 h-3.5"></i>' + (showIdColumn ? 'ID verbergen' : 'ID tonen') +
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
      // Nooit een lege kolomkop: een alias/label dat na trim() niets overhoudt
      // (leeg, of alleen spaties — kan gebeuren bij oudere/handmatig gezette
      // field_meta) telt niet mee, anders wint die lege string het van de
      // fid-terugval en zie je een kolom zonder naam terwijl "alles ingesteld" is.
      var aliasVal = String(fieldMeta[fid].alias || '').trim();
      var labelVal = String((ff && ff.label) || '').trim();
      var label = aliasVal || labelVal || fid;
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
    // Sleutels die geen veld zijn maar een OMHULSEL om de velden heen.
    // Exact dezelfde lijst als normalizeFormValues() in worker-handler.js
    // accepteert -- die functie kijkt naar form_fields, form_data, data,
    // submission en raw, in die volgorde.
    var CONTAINERS = ['form_fields', 'form_data', 'data', 'submission', 'raw'];

    /**
     * De payload PLATGESLAGEN, zodat een veld gevonden wordt waar het ook staat.
     *
     * Een Forminator-inzending heeft haar velden bovenaan; een inzending van een
     * OM-formulier heeft ze een niveau dieper, onder form_data. Zonder deze
     * platslag toonde de lijst voor elk OM-formulier een streepje in elke kolom,
     * en stond er onder de rij "form_data: [object Object]" -- terwijl alle
     * waarden gewoon in de payload zaten.
     *
     * Bovenliggende sleutels winnen: een omhulsel mag nooit een echt veld
     * overschrijven.
     */
    function parsePayload(sub) {
      var raw = sub.source_payload;
      if (!raw) return {};
      var obj = raw;
      if (typeof obj !== 'object') {
        try { obj = JSON.parse(obj); } catch (e) { return {}; }
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};

      var plat = {};
      Object.keys(obj).forEach(function (k) {
        if (CONTAINERS.indexOf(k) !== -1) return;  // het omhulsel zelf is geen waarde
        plat[k] = obj[k];
      });

      CONTAINERS.forEach(function (naam) {
        var binnenin = obj[naam];
        if (!binnenin || typeof binnenin !== 'object' || Array.isArray(binnenin)) return;
        Object.keys(binnenin).forEach(function (k) {
          if (plat[k] === undefined) plat[k] = binnenin[k];
        });
      });

      return plat;
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
      // truncate + title: de kolom blijft binnen haar breedte, en de volledige
      // waarde is nog leesbaar door erover te gaan of de rij open te klappen.
      return val
        ? '<div class="font-medium truncate" title="' + esc(String(val)) + '">' + esc(String(val).slice(0, 200)) + '</div>'
        : '<span class="text-base-content/30">&mdash;</span>';
    }

    // Compact bolletje i.p.v. een volledig uitgeschreven tag — de tekst staat
    // nog gewoon in de title-tooltip, ze hoeft niet in elke rij herhaald.
    var statusMeta = {
      // 'received' = bewaard, maar de pipeline is overgeslagen omdat de
      // koppeling uit stond (skipPipeline in worker-handler.js). Dat is een
      // bewuste veiligheidsklep, geen fout -- maar zonder deze regel kreeg ze
      // een naamloos grijs bolletje, en dan lijkt het of er iets stuk is.
      received:           { color: 'bg-base-content/40', label: 'Bewaard — koppeling staat uit' },
      success:            { color: 'bg-success', label: 'Geslaagd' },
      processed:          { color: 'bg-success', label: 'Geslaagd' },
      partial_failed:     { color: 'bg-warning', label: 'Deels mislukt' },
      retry_scheduled:    { color: 'bg-warning', label: 'Retry gepland' },
      permanent_failed:   { color: 'bg-error',   label: 'Definitief mislukt' },
      retry_exhausted:    { color: 'bg-error',   label: 'Retries uitgeput' },
      running:            { color: 'bg-info',    label: 'Bezig' },
      retry_running:      { color: 'bg-info',    label: 'Bezig (retry)' },
      duplicate_ignored:  { color: 'bg-neutral',       label: 'Duplicaat (genegeerd)' },
      duplicate_inflight: { color: 'bg-neutral',       label: 'Duplicaat (in verwerking)' },
    };
    var statusBadge = function (status) {
      var m = statusMeta[status] || { color: 'bg-base-content/30', label: status || 'Onbekend' };
      return '<span class="inline-block w-2.5 h-2.5 rounded-full ' + m.color + '" title="' + esc(m.label) + '"></span>';
    };

    // is_active kan ontbreken in oudere responses; alleen een expliciete false
    // telt als "uit", zodat een onbekende waarde de knop niet stilletjes blokkeert.
    var koppelingUit = ((S().detail && S().detail.integration) || {}).is_active === false;

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

    // Volledig indiening-id per short-id, nodig om de mailstatus (live Odoo +
    // Postmark-events) lazy op te halen als een rij uitgeklapt wordt — in de
    // DOM staat alleen de shortId (data-sub-id).
    var subIdByShort = {};
    ordered.forEach(function (item) { subIdByShort[window.FSV2.shortId(item.sub.id)] = item.sub.id; });
    var hasMailStep = targets.some(function (t) { return t.operation_type === 'send_mail'; });

    // Builds the expandable timeline row for a submission.
    var skipLabels = {
      pipeline_abort:                 'Overgeslagen \u2014 eerdere stap mislukt',
      dependency_missing:             'Overgeslagen \u2014 vereiste uitvoer ontbreekt',
      retry_skip_already_successful:  'Niet opnieuw uitgevoerd (replay)',
      condition_not_met:              'Stap overgeslagen (conditie niet voldaan)',
      // send_mail — een niet-verzonden mail moet ALTIJD zijn reden tonen.
      // Anders staat er "0 verzonden" zonder dat iemand weet waarom, en dat
      // heeft bij de events-mails al een halve dag zoeken gekost.
      no_recipient:                   'Geen mail \u2014 geen geldig e-mailadres gevonden',
      blacklisted:                    'Geen mail \u2014 ontvanger heeft zich uitgeschreven',
      mail_already_queued:            'Mail stond al klaar (niet nog eens aangemaakt)',
    };
    var actionColors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error', posted: 'badge-success',
      mail_scheduled: 'badge-info', mail_queued: 'badge-success', mail_skipped: 'badge-ghost',
      mail_already_queued: 'badge-ghost', mail_failed: 'badge-error' };
    var actionLabels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt', posted: 'notitie geplaatst',
      mail_scheduled: 'mail klaargezet (later)', mail_queued: 'mail klaargezet', mail_skipped: 'geen mail',
      mail_already_queued: 'mail stond al klaar', mail_failed: 'mail mislukt' };

    // ── Mailstatus-icoon in de hoofdlijn ──────────────────────────────────
    // Compacte weergave van waar de mail van deze indiening staat:
    // aangemaakt (mail.mail is klaargezet) → verzonden → geopend → geklikt.
    // "Aangemaakt" komt uit de al aanwezige resolved_context (geen extra
    // call); verzonden/geopend/geklikt komen uit S().mailEventsBySubmission,
    // één bulk-call per koppeling (zie openDetail in forminator-sync-v2-
    // detail-lifecycle.js) — een live Odoo-call per rij zou bij tientallen
    // indieningen een lawine aan verzoeken geven.
    var FUNNEL_STAGES = ['created', 'delivered', 'opened', 'clicked'];
    // Zelfde vier woorden als de Mails-kolom in events-v2 (renderMailFunnels
    // in public/events-v2-client.js) -- afspraak van 2026-09-10: één
    // systematiek over de modules heen. 'Aangemaakt'/'Verzonden' heetten hier
    // anders terwijl ze exact hetzelfde betekenen. Keys blijven ongewijzigd.
    var funnelStageLabels = { created: 'Klaargezet', delivered: 'Verstuurd', opened: 'Geopend', clicked: 'Geklikt' };

    function mailFunnelIcon(sub) {
      var ctx;
      try {
        var rc = sub.resolved_context;
        ctx = (rc && typeof rc === 'object') ? rc : JSON.parse(rc || '{}');
      } catch (e) { ctx = {}; }
      var actions = ctx.target_actions || [];
      var mailActions = actions.filter(function (a) { return a.action && String(a.action).indexOf('mail') === 0; });

      if (!mailActions.length) {
        return '<span class="text-base-content/20 text-xs" title="Nog geen mailstap uitgevoerd">&middot;</span>';
      }

      var last = mailActions[mailActions.length - 1];
      if (last.action === 'mail_failed') {
        var failTitle = 'Mail mislukt' + (last.error_detail ? ': ' + last.error_detail : '');
        return '<i data-lucide="mail-warning" class="w-3.5 h-3.5 text-error" title="' + esc(failTitle) + '"></i>';
      }
      if (last.action === 'mail_skipped') {
        var skipTitle = (last.skipped_reason && skipLabels[last.skipped_reason]) || 'Geen mail (overgeslagen)';
        return '<i data-lucide="mail-x" class="w-3.5 h-3.5 text-base-content/30" title="' + esc(skipTitle) + '"></i>';
      }

      // mail_scheduled / mail_queued / mail_already_queued: er staat een mail.mail klaar.
      var eventsForSub = (S().mailEventsBySubmission && S().mailEventsBySubmission[sub.id]) || [];
      var reached = 0; // 0 = aangemaakt
      if (eventsForSub.indexOf('delivery') !== -1) reached = 1;
      if (eventsForSub.indexOf('open')     !== -1) reached = 2;
      if (eventsForSub.indexOf('click')    !== -1) reached = 3;

      var dots = FUNNEL_STAGES.map(function (key, i) {
        return '<span class="inline-block w-1.5 h-1.5 rounded-full ' + (i <= reached ? 'bg-success' : 'bg-base-content/15') + '"></span>';
      }).join('');
      var title = FUNNEL_STAGES.slice(0, reached + 1).map(function (k) { return funnelStageLabels[k]; }).join(' \u2192 ');
      return '<span class="inline-flex items-center gap-0.5" title="' + esc(title) + '">' + dots + '</span>';
    }
    // Per-rij replay/verwijder-status vooraf berekenen: (a) om te weten of de
    // Actie-kolom überhaupt iets te tonen heeft — geen enkele indiening met een
    // knop en niet ontgrendeld betekent: geen kolom, in plaats van een lege
    // kolom die enkel ruimte inneemt — en (b) om dezelfde berekening niet
    // straks nog eens te doen bij het bouwen van elke rij.
    var rowFlags = ordered.map(function (item) {
      var sub = item.sub, isReplay = item.isReplay;
      var successfulReplay = !isReplay && (replaysByOrigId[sub.id] || []).some(function (r) {
        return ['success', 'processed'].includes(String(r.status || ''));
      });
      // 'received' hoort hier BIJ: dat is een inzending die bewaard werd terwijl
      // de koppeling uit stond. Replay is dan de enige manier om haar alsnog te
      // verwerken -- zonder deze status stond er wel een uitleg die naar Replay
      // verwees, maar geen knop om op te drukken.
      var replayAllowed = !isReplay && !successfulReplay && REPLAYBARE_STATUSSEN.indexOf(String(sub.status || '')) !== -1;
      var forceReplayAllowed = deleteUnlocked && !replayAllowed && ['success', 'processed', 'partial_failed'].includes(String(sub.status || ''));
      return { successfulReplay: successfulReplay, replayAllowed: replayAllowed, forceReplayAllowed: forceReplayAllowed };
    });
    var anyActie = deleteUnlocked || rowFlags.some(function (f) { return f.replayAllowed || f.forceReplayAllowed; });

    // Hoeveel knoppen kunnen er naast elkaar staan? Elke knop is ongeveer 1.5rem
    // breed. De kolom op één vaste maat zetten geeft óf een te smalle kolom waar
    // knoppen uit vallen, óf een brede lege kolom bij één prullenbakje.
    var maxKnoppen = 0;
    rowFlags.forEach(function (f) {
      var n = 0;
      if (f.replayAllowed || f.forceReplayAllowed) n += 1;
      if (deleteUnlocked && hasMailStep) n += 1;
      if (deleteUnlocked) n += 1;
      if (n > maxKnoppen) maxKnoppen = n;
    });
    var anyActieBreedte = Math.max(2.5, 1.1 + maxKnoppen * 1.6);

    // Vaste kolommen zonder ID/Fout: Status, Aangemaakt. Fout staat nu in de
    // uitgeklapte rij (zie buildTimelineRow); ID, Mail en Actie zijn optioneel.
    var colCount = 2 + (showIdColumn ? 1 : 0) + (hasMailStep ? 1 : 0) + (anyActie ? 1 : 0) + listColumns.length;

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
        : (String(sub.status || '') === 'received'
            ? '<div class="flex items-start gap-1.5 p-2 rounded bg-base-300/60 text-xs">' +
                '<i data-lucide="pause" class="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60"></i>' +
                '<span><span class="font-semibold">Deze koppeling staat uit.</span> ' +
                'De inzending is bewaard en de velden eronder kloppen, maar er is niets naar Odoo gestuurd. ' +
                'Zet de koppeling aan en gebruik daarna <span class="font-medium">Replay</span> om deze inzending alsnog te verwerken.</span>' +
              '</div>'
            : '<span class="text-xs text-base-content/40 italic">Geen stapdetails beschikbaar.</span>');

      // De Fout-kolom staat niet meer los in de lijst (te breed/te prominent voor
      // een geval dat de meeste indieningen niet raakt) — wie de rij uitklapt ziet
      // de volledige foutmelding hier, ongeacht of de status uiteindelijk "mislukt" is.
      var errorHtml = sub.last_error
        ? '<div class="mt-2 p-2 rounded bg-error/10 border border-error/20 text-xs text-error font-mono break-all">' +
            '<span class="font-semibold mr-1">Fout:</span>' + esc(sub.last_error) +
          '</div>'
        : '';

      var mailSlotHtml = hasMailStep
        ? '<div class="mt-3">' +
            '<div class="text-xs font-semibold text-base-content/60 mb-1 flex items-center gap-1">' +
              '<i data-lucide="mail" class="w-3 h-3"></i>Mail' +
            '</div>' +
            '<div class="mail-status-slot" data-sub-id="' + esc(shortId) + '">' +
              '<span class="text-xs text-base-content/30 italic">Klap open om te laden…</span>' +
            '</div>' +
          '</div>'
        : '';

      var contextLeeg = !ctx || Object.keys(ctx).length === 0;

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
            // Een kale "{}" laat je raden of er iets stukging of dat er gewoon
            // niets te sturen viel. Die twee zijn heel verschillende dingen.
            (contextLeeg
              ? '<p class="text-xs text-base-content/50 mt-1 mb-1">' +
                  (String(sub.status || '') === 'received'
                    ? 'Leeg omdat de koppeling uit stond toen deze inzending binnenkwam.'
                    : 'Leeg: er zijn nog geen veldkoppelingen ingesteld, dus er valt niets naar Odoo te sturen.') +
                '</p>'
              : '') +
            '<pre class="text-xs font-mono bg-base-300 rounded p-2 mt-1 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
              esc(safeJsonPretty(sub.resolved_context)) + '</pre>' +
          '</details>' +
        '</div>';

      return '<tr class="sub-timeline-row" id="stl-' + esc(shortId) + '" style="display:none">' +
        '<td colspan="' + colCount + '" class="bg-base-200/40 px-4 py-3">' + payloadHtml + timelineHtml + errorHtml + mailSlotHtml + payloadDetailHtml + '</td>' +
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

    // table-fixed en w-full: de tabel past zich aan het scherm aan in plaats van
    // aan haar inhoud. Zonder dit bepaalde de LANGSTE waarde de kolombreedte --
    // één e-mailadres of één kolomkop als "Waar kunnen we je mee helpen?" duwde
    // de hele tabel voorbij de rand, en dan sta je horizontaal te scrollen om
    // bij de actieknoppen te komen.
    //
    // De vaste kolommen krijgen een expliciete breedte (bij table-fixed doet
    // w-px niets meer); wat overblijft wordt gelijk verdeeld over de
    // gekozen velden. Waarden die niet passen worden afgekapt met een
    // ellips en dragen hun volledige tekst in title -- en de rij openklappen
    // toont sowieso alles.
    var vasteBreedte = function (rem) { return ' style="width:' + rem + 'rem"'; };

    el.innerHTML =
      toolbar +
      '<div class="overflow-x-auto">' +
        '<table class="table table-xs table-fixed w-full">' +
          '<thead><tr>' +
            '<th' + vasteBreedte(2.25) + '><span class="sr-only">Status</span></th>' +
            (showIdColumn ? '<th' + vasteBreedte(5.5) + ' class="whitespace-nowrap">ID</th>' : '') +
            // truncate en niet break-words: een kop als "Waar kunnen we je mee
            // helpen?" wikkelt niet netjes in een smalle kolom maar loopt over
            // de buurkolom heen. Afkappen met een ellips houdt de rij op één
            // hoogte; de volledige kop staat in title.
            listColumns.map(function (c) {
              return '<th class="truncate" title="' + esc(c.label) + '">' + esc(c.label) + '</th>';
            }).join('') +
            (hasMailStep ? '<th' + vasteBreedte(2.75) + ' class="whitespace-nowrap">Mail</th>' : '') +
            '<th' + vasteBreedte(6.5) + ' class="truncate leading-tight" title="Aangemaakt">Aangemaakt</th>' +
            (anyActie ? '<th' + vasteBreedte(anyActieBreedte) + ' class="whitespace-nowrap sticky right-0 bg-base-100 z-10">Actie</th>' : '') +
          '</tr></thead>' +
          '<tbody>' +
          ordered.map(function (item, idx) {
            var sub         = item.sub;
            var isReplay    = item.isReplay;
            var shortId     = window.FSV2.shortId(sub.id);
            var flags               = rowFlags[idx];
            var successfulReplay    = flags.successfulReplay;
            var replayAllowed       = flags.replayAllowed;
            // Force-replay: allow replaying any submission (incl. success) when delete is unlocked.
            // Useful to retroactively fix submissions that were processed with broken mappings.
            var forceReplayAllowed  = flags.forceReplayAllowed;
            // Fout staat niet meer in de lijn zelf (zie errorHtml in de uitgeklapte rij).
            // Status toont alleen nog het bolletje + een compact "opgelost via replay"-icoon —
            // de per-stap-badges (aangemaakt/bijgewerkt/…) staan al in de uitgeklapte tijdlijn
            // en verdubbelden de kolom onnodig. Acties zijn icoon-only (title = tooltip) i.p.v.
            // een volledig uitgeschreven knop, en de hele kolom bestaat niet als geen enkele
            // rij iets te doen heeft (zie anyActie hierboven).
            var mainRow =
              '<tr class="sub-row cursor-pointer' + (isReplay ? ' bg-success/5' : '') + '" data-sub-id="' + esc(shortId) + '">' +
                '<td class="whitespace-nowrap">' + statusBadge(sub.status) +
                  (successfulReplay ? '<i data-lucide="corner-down-right" class="w-3 h-3 text-success ml-1 inline-block align-middle" title="Opgelost via replay"></i>' : '') +
                  '</td>' +
                (showIdColumn
                  ? '<td class="font-mono text-xs whitespace-nowrap">' +
                      (isReplay ? '<span class="badge badge-xs badge-accent mr-1">↳ Replay</span>' : '') +
                      esc(shortId) +
                    '</td>'
                  : '') +
                listColumns.map(function (c) { return '<td class="text-xs">' + listColumnValue(sub, c) + '</td>'; }).join('') +
                (hasMailStep ? '<td class="whitespace-nowrap">' + mailFunnelIcon(sub) + '</td>' : '') +
                // De datum mag over twee regels: afkappen zou "10/9/2026, 22:2…"
                // geven en dan is het tijdstip onleesbaar.
                '<td class="text-xs leading-tight">' + esc(window.FSV2.fmt(sub.created_at)) + '</td>' +
                (anyActie
                  ? '<td class="sticky right-0 bg-base-100 whitespace-nowrap">' +
                      '<div class="flex items-center gap-1">' +
                      (replayAllowed
                        // Staat de koppeling nog uit, dan zou replay opnieuw op
                        // 'received' uitkomen. De knop tonen maar uitschakelen
                        // met de reden erin is eerlijker dan hem laten drukken
                        // voor hetzelfde resultaat.
                        ? (koppelingUit
                            ? '<button class="btn btn-xs btn-square btn-primary btn-disabled" disabled title="Zet eerst de koppeling aan bij Koppeling"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>'
                            : '<button class="btn btn-xs btn-square btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '" title="Replay"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>')
                        : '') +
                      (forceReplayAllowed
                        ? '<button class="btn btn-xs btn-square btn-outline btn-warning" data-action="replay-submission" data-id="' + esc(sub.id) + '" title="Opnieuw verwerken (forceren)"><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>'
                        : '') +
                      (deleteUnlocked && hasMailStep
                        ? '<button class="btn btn-xs btn-square btn-outline" data-action="replay-mail-events" data-id="' + esc(sub.id) + '" title="Opgeslagen mail-events opnieuw naar Odoo sturen"><i data-lucide="mail-check" class="w-3 h-3"></i></button>'
                        : '') +
                      (deleteUnlocked
                        ? '<button class="btn btn-xs btn-square btn-ghost text-error" data-action="delete-submission" data-id="' + esc(sub.id) + '" title="Verwijder indienen"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
                        : '') +
                      '</div>' +
                    '</td>'
                  : '') +
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
        if (!timeline) return;
        var opening = timeline.style.display === 'none';
        timeline.style.display = opening ? '' : 'none';
        if (opening) loadMailStatus(tr.dataset.subId);
      });
    });

    /**
     * De live mailstatus van één indiening ophalen: het `mail.mail`-record uit
     * Odoo (verzonden/in wachtrij/mislukt) plus de Postmark-events die er ondertussen
     * op binnenkwamen. Lazy en per rij, want dit is een live Odoo-call en er kunnen
     * tientallen indieningen tegelijk in de lijst staan — alles vooraf ophalen zou
     * bij elke keer openen van de tab een lawine aan Odoo-verzoeken geven.
     */
    function loadMailStatus(shortIdVal) {
      var slot = el.querySelector('.mail-status-slot[data-sub-id="' + shortIdVal + '"]');
      if (!slot || slot.dataset.loaded === '1') return;
      slot.dataset.loaded = '1';
      var fullId = subIdByShort[shortIdVal];
      if (!fullId) {
        slot.innerHTML = '<span class="text-xs text-base-content/30 italic">Indiening-id onbekend.</span>';
        return;
      }
      window.FSV2.api('/submissions/' + fullId + '/mails').then(function (res) {
        slot.innerHTML = renderMailStatusHtml(res.data || {});
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }).catch(function (e) {
        slot.dataset.loaded = '';
        slot.innerHTML = '<span class="text-xs text-error/70">Kon mailstatus niet laden: ' + esc(e.message) + '</span>';
      });
    }
  }


  // ── Mailstatus-weergave (live Odoo mail.mail + Postmark-events) ──────────
  var mailStateLabels = { outgoing: 'In wachtrij', sent: 'Verzonden', exception: 'Mislukt', cancel: 'Geannuleerd', received: 'Ontvangen' };
  var mailStateColors = { outgoing: 'badge-info', sent: 'badge-success', exception: 'badge-error', cancel: 'badge-ghost', received: 'badge-success' };
  var mailEventLabels = { delivery: 'Afgeleverd', open: 'Geopend', click: 'Geklikt', bounce: 'Bounce', spamcomplaint: 'Spamklacht', subscriptionchange: 'Uitschrijving' };
  var mailEventColors = { delivery: 'badge-success', open: 'badge-info', click: 'badge-primary', bounce: 'badge-error', spamcomplaint: 'badge-error', subscriptionchange: 'badge-warning' };
  // Zelfde teksten als de skip-redenen in de tijdlijn (skipLabels daarboven is
  // scope-lokaal aan renderDetailSubmissions) — hier een eigen, kleine kopie
  // voor de mailstatus-stappen die geen mail.mail opleverden.
  var mailSkipLabels = {
    no_recipient:         'Geen mail — geen geldig e-mailadres gevonden',
    blacklisted:          'Geen mail — ontvanger heeft zich uitgeschreven',
    mail_already_queued:  'Mail stond al klaar (niet nog eens aangemaakt)',
    condition_not_met:    'Stap overgeslagen (conditie niet voldaan)',
  };

  function renderMailStatusHtml(data) {
    var mails  = Array.isArray(data.mails)  ? data.mails  : [];
    var events = Array.isArray(data.events) ? data.events : [];
    var steps  = Array.isArray(data.steps)  ? data.steps  : [];

    if (!mails.length && !events.length && !steps.length) {
      return '<span class="text-xs text-base-content/40 italic">Geen mailgegevens voor deze indiening.</span>';
    }

    var mailsHtml = mails.map(function (m) {
      var state = mailStateColors[m.state] || 'badge-ghost';
      var when  = m.date ? window.FSV2.fmt(m.date) : (m.scheduled_date ? 'gepland ' + window.FSV2.fmt(m.scheduled_date) : '');
      return '<div class="flex flex-wrap items-center gap-1.5 text-xs py-1">' +
        '<span class="badge badge-xs ' + state + '">' + esc(mailStateLabels[m.state] || m.state || '-') + '</span>' +
        '<span class="truncate max-w-[16rem]">' + esc(m.subject || '(geen onderwerp)') + '</span>' +
        '<span class="text-base-content/30">&rarr;</span>' +
        '<span class="font-mono text-base-content/50">' + esc(m.email_to || '-') + '</span>' +
        (when ? '<span class="text-base-content/40">' + esc(when) + '</span>' : '') +
        (m.failure_reason ? '<span class="text-error font-mono break-all">' + esc(m.failure_reason) + '</span>' : '') +
      '</div>';
    }).join('');

    var skippedHtml = steps.filter(function (s) { return s.skipped_reason && mailSkipLabels[s.skipped_reason]; }).map(function (s) {
      return '<div class="text-xs text-base-content/50 italic py-0.5">' + esc(mailSkipLabels[s.skipped_reason]) + '</div>';
    }).join('');

    var eventsHtml = events.length
      ? '<div class="flex flex-wrap items-center gap-1.5 mt-1">' +
          events.map(function (e) {
            return '<span class="badge badge-xs ' + (mailEventColors[e.event_type] || 'badge-ghost') + '" title="' + esc(window.FSV2.fmt(e.occurred_at)) + '">' +
              esc(mailEventLabels[e.event_type] || e.event_type) +
              (e.event_type === 'open' && e.first_open ? ' (1e)' : '') +
            '</span>';
          }).join('') +
        '</div>'
      : (mails.length ? '<div class="text-xs text-base-content/30 italic mt-1">Nog geen afleverings-/open-events van Postmark ontvangen.</div>' : '');

    return mailsHtml + skippedHtml + eventsHtml;
  }

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

  // Herhaalt enkel wat al in fs_v2_mail_events staat -- geen nieuwe Postmark-
  // events, gewoon de Odoo-sync (chatter + mail.mail.state) opnieuw uitvoeren.
  // Nuttig als de sync-code na het event gedeployed is, of Odoo even
  // onbereikbaar was toen het event binnenkwam.
  async function handleReplayMailEvents(submissionId) {
    try {
      var res = await window.FSV2.api('/submissions/' + submissionId + '/replay-mail-events', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      var d = res.data || {};
      var msg = d.replayed + ' event(en) opnieuw naar Odoo gestuurd';
      if (d.not_worthy) msg += ', ' + d.not_worthy + ' overgeslagen (geen chatter-waardig event)';
      if (d.failed) msg += ', ' + d.failed + ' mislukt';
      window.FSV2.showAlert(msg + '.', d.failed ? 'warning' : 'success');
      // Herlaadt de hele detailweergave (zelfde patroon als handleReplay/
      // handleDeleteSubmission) -- de mailstatus-slot in de uitgeklapte rij is
      // scope-lokaal aan renderDetailSubmissions en hier niet bereikbaar; een
      // volledige herladen haalt ook meteen de bijgewerkte mail.mail.state op.
      await window.FSV2.openDetail(S().activeId);
    } catch (e) {
      window.FSV2.showAlert('Herfiren mislukt: ' + e.message, 'error');
    }
  }

  function handleToggleDeleteUnlock() {
    S()._deleteUnlocked = !S()._deleteUnlocked;
    window.FSV2.renderDetailSubmissions();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function handleToggleIdColumn() {
    S()._showIdColumn = !S()._showIdColumn;
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
    handleReplayMailEvents: handleReplayMailEvents,
    handleToggleDeleteUnlock: handleToggleDeleteUnlock,
    handleToggleIdColumn: handleToggleIdColumn,
    renderDetailSubmissions: renderDetailSubmissions
  });
})();
