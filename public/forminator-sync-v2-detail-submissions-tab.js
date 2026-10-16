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
      // field_type van het EERST gevonden veld voor deze kolom -- bepaalt zijn
      // breedte hieronder (zie gewichtKolom). Bij een hernoemd veld met meerdere
      // fids per label maakt het niet uit welke van de twee wint: hun waarden
      // zijn per definitie hetzelfde soort content.
      if (!listColumnsMap[label]) {
        listColumnsMap[label] = { fids: [], label: label, field_type: (ff && ff.field_type) || 'text' };
      }
      listColumnsMap[label].fids.push(fid);
    });
    var listColumns = Object.values(listColumnsMap);

    // Gewicht per veldtype: lange vrije tekst (textarea) mag meer ruimte
    // krijgen dan een korte waarde (postcode, telefoonnummer, datum, ...).
    // table-fixed verdeelt de ruimte die overblijft na de vaste rem-kolommen
    // hieronder proportioneel over deze gewichten -- vandaar geen vaste
    // rem-breedte hier, want het aantal gekozen velden verschilt per
    // koppeling. Gemeld 2026-09-10: alle gekozen velden kregen evenveel
    // ruimte, ongeacht of het een postcode of een tekstvak was.
    var gewichtKolom = function (ftype) {
      switch (ftype) {
        case 'textarea':
        case 'paragraph':      return 3;
        case 'email':          return 2;
        case 'tel':
        case 'date':
        case 'number':
        case 'checkbox':
        case 'select':
        case 'radio':
        case 'hidden':
        case 'heading':        return 1;
        default:               return 1.5; // 'text' en onbekende/legacy Forminator-typen
      }
    };
    var totaalGewicht = listColumns.reduce(function (som, c) { return som + gewichtKolom(c.field_type); }, 0) || 1;
    var kolomBreedtePct = function (c) {
      return (gewichtKolom(c.field_type) / totaalGewicht * 100).toFixed(1) + '%';
    };
    var targets = (S().detail && S().detail.targets) || [];
    // Stapnummer zoals op het tabblad Koppeling: de POSITIE in de pijplijn, niet
    // execution_order. Dat volgnummer begint meestal al bij 1 (step.1.record_id),
    // dus "execution_order + 1" zette hier elke stap een hoger dan op Koppeling.
    var stapPositie = {};
    targets.slice().sort(function (a, b) {
      return window.FSV2.getTargetOrder(a, 0) - window.FSV2.getTargetOrder(b, 0);
    }).forEach(function (t, idx) {
      var o = window.FSV2.getTargetOrder(t, idx);
      if (stapPositie[o] === undefined) stapPositie[o] = idx + 1;
    });

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
        if (k === 'value_labels') return;           // labels bij de waarden, geen veld
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

    /**
     * parsePayload(), maar met de LEESBARE waarden die de server meestuurt
     * (`display_values`: labels in plaats van optiesleutels, tijdstippen in
     * Brussel -- zie display-values.js). Enkel voor wat een mens leest in de
     * lijst. Nooit voor de logica hierboven (ketens, afspraakstand): die rekent
     * op de ruwe `booking_action` en op ISO-tijdstippen.
     */
    function leesbarePayload(sub) {
      var plat = parsePayload(sub);
      var lees = sub && sub.display_values;
      if (!lees || typeof lees !== 'object') return plat;
      Object.keys(lees).forEach(function (k) {
        if (plat[k] !== undefined && typeof plat[k] !== 'object') plat[k] = lees[k];
      });
      return plat;
    }
    function listColumnValue(sub, col) {
      var payload = leesbarePayload(sub);
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
    var integratie   = (S().detail && S().detail.integration) || {};
    var koppelingUit = integratie.is_active === false;
    var isCalendly   = String(integratie.source_type || '') === 'calendly';

    // ── De STAND VAN DE AFSPRAAK, los van de stand van de verwerking ────────
    // Het bolletje links zegt of de pipeline gelukt is. Dat is iets anders dan
    // of de afspraak nog doorgaat, en bij Calendly is precies dat tweede wat
    // iemand komt opzoeken. Een annulatie is voor de pipeline een geslaagde
    // indiening -- groen bolletje, terwijl de afspraak niet meer bestaat.
    var afspraakMeta = {
      aankomend:   { icon: 'calendar-clock', kleur: 'text-info',            label: 'Aankomend' },
      voorbij:     { icon: 'calendar-check', kleur: 'text-base-content/40', label: 'Voorbij' },
      verplaatst:  { icon: 'refresh-cw',     kleur: 'text-warning',         label: 'Verplaatst naar een nieuwe afspraak' },
      geannuleerd: { icon: 'calendar-x',     kleur: 'text-error',           label: 'Geannuleerd' },
    };

    function afspraakStand(payload) {
      if (!payload || (!payload.event_uuid && !payload.start_time)) return null;
      var geannuleerd = String(payload.canceled) === 'true';
      var verplaatst  = String(payload.rescheduled) === 'true';
      // canceled + rescheduled is Calendly's manier om te zeggen: deze boeking
      // is opgeheven ten voordele van een nieuwe. Dat is geen annulatie en mag
      // er ook niet als een annulatie uitzien.
      if (geannuleerd && verplaatst) return 'verplaatst';
      if (geannuleerd) return 'geannuleerd';
      var start = Date.parse(payload.start_time || '');
      if (isFinite(start) && start < Date.now()) return 'voorbij';
      return 'aankomend';
    }

    /**
     * De inzendingen groeperen per AFSPRAAK.
     *
     * Calendly stuurt per boeking meerdere webhooks, en een verplaatsing is bij
     * hen geen wijziging maar een annulatie + een nieuwe afspraak met een nieuw
     * event_uuid. Zonder groepering staat dezelfde afspraak dus drie keer in de
     * lijst -- als drie losse rijen die niets van elkaar weten.
     *
     * De verbindingen: alle inzendingen met hetzelfde event_uuid horen bij
     * dezelfde boeking, en old_invitee_uuid/new_invitee_uuid knopen de boekingen
     * van een verplaatsing aan elkaar. Dat wordt hier opgelost als een
     * samenhangende verzameling (union-find), want de webhooks kunnen in elke
     * volgorde binnenkomen en een keten kan meer dan twee schakels tellen.
     */
    function bouwKetens(subs) {
      var ouder = {};
      function voegToe(k) { if (!Object.prototype.hasOwnProperty.call(ouder, k)) ouder[k] = k; }
      function vind(k) { voegToe(k); while (ouder[k] !== k) { ouder[k] = ouder[ouder[k]]; k = ouder[k]; } return k; }
      function verbind(a, b) { var ra = vind(a), rb = vind(b); if (ra !== rb) ouder[ra] = rb; }

      var eersteSleutel = {};
      subs.forEach(function (s) {
        var p = parsePayload(s);
        var sleutels = [];
        if (p.event_uuid)   sleutels.push('e:' + p.event_uuid);
        if (p.invitee_uuid) sleutels.push('i:' + p.invitee_uuid);
        if (!sleutels.length) sleutels.push('s:' + s.id);   // geen Calendly-payload: staat alleen
        for (var i = 1; i < sleutels.length; i++) verbind(sleutels[0], sleutels[i]);
        if (p.old_invitee_uuid) verbind(sleutels[0], 'i:' + p.old_invitee_uuid);
        if (p.new_invitee_uuid) verbind(sleutels[0], 'i:' + p.new_invitee_uuid);
        eersteSleutel[s.id] = sleutels[0];
      });

      var perSub = {};
      subs.forEach(function (s) { perSub[s.id] = vind(eersteSleutel[s.id]); });
      return perSub;
    }

    var originals = S().submissions.filter(function (s) { return !s.replay_of_submission_id; });
    var replays   = S().submissions.filter(function (s) { return !!s.replay_of_submission_id; });
    var replaysByOrigId = {};
    replays.forEach(function (r) {
      if (!replaysByOrigId[r.replay_of_submission_id]) replaysByOrigId[r.replay_of_submission_id] = [];
      replaysByOrigId[r.replay_of_submission_id].push(r);
    });

    var ketenPerSub  = isCalendly ? bouwKetens(originals) : null;
    var ketenLeden   = {};   // ketensleutel -> inzendingen, nieuwste eerst
    var ketenNummer  = {};   // ketensleutel -> volgnummer voor het data-attribuut
    if (isCalendly) {
      originals.forEach(function (o) {
        var k = ketenPerSub[o.id];
        (ketenLeden[k] = ketenLeden[k] || []).push(o);
      });
      Object.keys(ketenLeden).forEach(function (k, i) {
        ketenNummer[k] = i;
        ketenLeden[k].sort(function (a, b) {
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
      });
    }

    var ordered   = [];
    function duwMetReplays(sub, verborgen, keten) {
      ordered.push({ sub: sub, isReplay: false, verborgen: !!verborgen, keten: keten });
      replays.filter(function (r) { return r.replay_of_submission_id === sub.id; })
        .forEach(function (r) { ordered.push({ sub: r, isReplay: true, verborgen: !!verborgen, keten: keten }); });
    }

    if (isCalendly) {
      // De NIEUWSTE inzending van een keten voert de rij aan: die draagt de
      // huidige stand van de afspraak. De oudere blijven bestaan (met hun eigen
      // spoor en hun eigen replay-knop) maar staan ingeklapt eronder.
      var ketenGedaan = {};
      originals.forEach(function (orig) {
        var k = ketenPerSub[orig.id];
        if (ketenGedaan[k]) return;
        ketenGedaan[k] = true;
        var leden = ketenLeden[k] || [orig];
        duwMetReplays(leden[0], false, k);
        leden.slice(1).forEach(function (o) { duwMetReplays(o, true, k); });
      });
    } else {
      originals.forEach(function (orig) { duwMetReplays(orig, false, null); });
    }
    replays.filter(function (r) { return !originals.find(function (o) { return o.id === r.replay_of_submission_id; }); })
      .forEach(function (r) { ordered.push({ sub: r, isReplay: true, verborgen: false, keten: null }); });

    /**
     * Het afspraak-icoon voor de aanvoerende rij van een keten.
     *
     * Naast de stand staat het aantal verplaatsingen: een keten met meer dan
     * één boeking is er een die verplaatst is, en dat wil je zien zonder de rij
     * te moeten openklappen.
     */
    function afspraakIcoon(sub, keten) {
      var p = parsePayload(sub);
      var stand = afspraakStand(p);
      if (!stand) return '<span class="text-base-content/20 text-xs">&middot;</span>';
      var m = afspraakMeta[stand];
      var leden = (keten && ketenLeden[keten]) || [];
      var boekingen = {};
      leden.forEach(function (l) {
        var lp = parsePayload(l);
        if (lp.event_uuid) boekingen[lp.event_uuid] = true;
      });
      var aantalVerplaatsingen = Math.max(0, Object.keys(boekingen).length - 1);
      var titel = m.label + (p.start_text ? ' \u2014 ' + p.start_text : '');
      if (aantalVerplaatsingen > 0) {
        titel += ' \u2014 ' + aantalVerplaatsingen + ' keer verplaatst';
      }
      return '<span class="inline-flex items-center gap-0.5" title="' + esc(titel) + '">' +
        '<i data-lucide="' + m.icon + '" class="w-3.5 h-3.5 ' + m.kleur + '"></i>' +
        (aantalVerplaatsingen > 0
          ? '<span class="text-[10px] font-medium text-warning leading-none">' + aantalVerplaatsingen + '</span>'
          : '') +
        '</span>';
    }

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
      // Bewust een eigen reden en niet condition_not_met: dit is GEEN voorwaarde
      // die niet klopte maar een bewuste keuze op de stap ("niets doen bij een
      // annulatie"). Als dat als "conditie niet voldaan" in het spoor staat, ga
      // je een voorwaarde zoeken die er niet is.
      calendly_phase_skipped:         'Stap staat op \u201cniets doen\u201d voor deze fase',
      // send_mail — een niet-verzonden mail moet ALTIJD zijn reden tonen.
      // Anders staat er "0 verzonden" zonder dat iemand weet waarom, en dat
      // heeft bij de events-mails al een halve dag zoeken gekost.
      no_recipient:                   'Geen mail \u2014 geen geldig e-mailadres gevonden',
      blacklisted:                    'Geen mail \u2014 ontvanger heeft zich uitgeschreven',
      mail_already_queued:            'Mail stond al klaar (niet nog eens aangemaakt)',
    };
    var actionColors = { created: 'badge-success', updated: 'badge-info', skipped: 'badge-ghost', failed: 'badge-error', posted: 'badge-success',
      mail_scheduled: 'badge-info', mail_queued: 'badge-success', mail_skipped: 'badge-ghost',
      mail_already_queued: 'badge-ghost', mail_failed: 'badge-error',
      pdf_generated: 'badge-success', pdf_reused: 'badge-ghost', pdf_failed: 'badge-error' };
    var actionLabels = { created: 'aangemaakt', updated: 'bijgewerkt', skipped: 'geen wijziging', failed: 'mislukt', posted: 'notitie geplaatst',
      mail_scheduled: 'mail klaargezet (later)', mail_queued: 'mail klaargezet', mail_skipped: 'geen mail',
      mail_already_queued: 'mail stond al klaar', mail_failed: 'mail mislukt',
      pdf_generated: 'pdf gemaakt', pdf_reused: 'pdf bestond al', pdf_failed: 'pdf mislukt' };

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

      // Een bounce of spamklacht gaat VOOR de funnel. Voorheen bleef zo'n
      // indiening gewoon op "Klaargezet" staan: de bounce stond wel in de
      // uitklap en in de Odoo-chatter, maar in de hoofdlijn was er niets aan
      // te zien -- precies de mail die je wél wil opmerken.
      if (eventsForSub.indexOf('spamcomplaint') !== -1) {
        return '<i data-lucide="mail-warning" class="w-3.5 h-3.5 text-error" title="Ontvanger markeerde de mail als spam"></i>';
      }
      if (eventsForSub.indexOf('bounce') !== -1) {
        return '<i data-lucide="mail-warning" class="w-3.5 h-3.5 text-error" title="Mail kon niet afgeleverd worden (bounce) \u2014 details in de uitklap"></i>';
      }

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
    var colCount = 2 + (isCalendly ? 1 : 0) + (showIdColumn ? 1 : 0) + (hasMailStep ? 1 : 0) + (anyActie ? 1 : 0) + listColumns.length;

    // ── De uitgeklapte rij: wat er ingevuld werd, en wat er mee gebeurde ────
    // Gemeld 2026-10-16: het openklapscherm was een slordige hoop. Bovenaan
    // vijf willekeurige payload-sleutels (form_id, form_slug, ...) in plaats
    // van wat de klant invulde, dan de stappen met hun ruwe modelnamen, en een
    // rij van veertien gelijke "Geopend"-badges. Nu twee kolommen: links het
    // formulier met de echte veldnamen, rechts de verwerking in Odoo (met een
    // link naar elk record) en de mail als een korte samenvatting. Wat enkel
    // voor wie debugt nuttig is, staat ingeklapt onderaan.

    // Odoo-webadres voor de recordlinks. /web#id=...&model=... werkt in elke
    // Odoo-versie (de nieuwere /odoo/-routes sturen het zelf door).
    var ODOO_WEB = 'https://mymmo.odoo.com';
    var modelNamen = {
      'res.partner':   'Contact',
      'crm.lead':      'Lead',
      'mail.mail':     'Mail',
      'mail.message':  'Notitie',
      'mail.activity': 'Activiteit',
      'calendar.event':'Afspraak',
      'sale.order':    'Offerte',
      'project.task':  'Taak',
      'helpdesk.ticket': 'Ticket',
    };
    function odooLink(model, id) {
      if (!model || !id || !/^[a-z_][a-z0-9_.]*$/i.test(String(model)) || !/^\d+$/.test(String(id))) return '';
      return ODOO_WEB + '/web#id=' + encodeURIComponent(String(id)) + '&model=' + encodeURIComponent(String(model)) + '&view_type=form';
    }

    // Sleutels die de bron meestuurt maar die niemand ingevuld heeft: die
    // horen bij "Overige gegevens", niet tussen de antwoorden van de klant.
    var TECHNISCHE_SLEUTELS = ['form_id', 'form_name', 'form_slug', 'form_version', 'form_type', 'nonce',
      'referer', 'referrer', '_wp_http_referer', 'action', 'page_id', 'render_id', 'entry_id', 'current_url',
      'site_url', 'ip', 'user_agent', 'value_labels'];
    function isTechnisch(k) {
      var n = normalizeKey(k);
      return TECHNISCHE_SLEUTELS.indexOf(n) !== -1 || n.indexOf('meta_') === 0 || n.indexOf('_') === 0;
    }

    function vindSleutel(payload, fid) {
      if (!payload || !fid) return null;
      if (payload[fid] !== undefined) return fid;
      var n = normalizeKey(fid);
      var keys = Object.keys(payload);
      return keys.find(function (k) { return normalizeKey(k) === n; }) ||
             keys.find(function (k) { return normalizeKey(k).indexOf(n + '_') === 0; }) ||
             null;
    }
    function waardeTekst(v) {
      if (v == null) return '';
      if (Array.isArray(v)) return v.map(waardeTekst).filter(Boolean).join(', ');
      if (typeof v === 'object') {
        return Object.keys(v).map(function (k) { return waardeTekst(v[k]); }).filter(Boolean).join(' ');
      }
      return String(v).trim();
    }
    // Een e-mailadres, telefoonnummer of URL is meteen klikbaar: wie de
    // inzending opvolgt, wil de klant mailen of bellen zonder te kopiëren.
    function waardeHtml(tekst, ftype) {
      var t = String(tekst);
      if ((ftype === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) && t.indexOf(' ') === -1) {
        return '<a class="link link-hover text-primary" href="mailto:' + esc(t) + '">' + esc(t) + '</a>';
      }
      if (ftype === 'tel' || ftype === 'phone') {
        return '<a class="link link-hover text-primary" href="tel:' + esc(t.replace(/[^\d+]/g, '')) + '">' + esc(t) + '</a>';
      }
      if (/^https?:\/\/\S+$/.test(t)) {
        return '<a class="link link-hover text-primary break-all" href="' + esc(t) + '" target="_blank" rel="noopener">' + esc(t) + '</a>';
      }
      return '<span class="whitespace-pre-line break-words">' + esc(t) + '</span>';
    }

    // De formuliervelden in hun volgorde, samengestelde velden opengevouwen.
    var SKIP_T = (window.FSV2.SKIP_TYPES || ['page-break', 'group', 'html', 'section', 'captcha']);
    var formVeldenPlat = [];
    allFormFields.forEach(function (f) {
      var ftype = String(f.field_type || f.type || 'text');
      var kinderen = Array.isArray(f.children) ? f.children : [];
      if (SKIP_T.indexOf(ftype) !== -1 && !kinderen.length) return;
      formVeldenPlat.push(f);
      kinderen.forEach(function (c) { formVeldenPlat.push(Object.assign({ _ouder: f }, c)); });
    });

    function formulierBlok(payload) {
      var gebruikt = {};
      var rijen = [];
      var overige = [];
      formVeldenPlat.forEach(function (f) {
        var fid = String(f.field_id || '');
        if (!fid) return;
        var sleutel = vindSleutel(payload, fid);
        if (!sleutel || gebruikt[sleutel]) return;
        // Een samengesteld veld waarvan de kinderen apart staan: enkel de kinderen.
        if (Array.isArray(f.children) && f.children.length &&
            f.children.some(function (c) { return vindSleutel(payload, String(c.field_id || '')); })) return;
        var tekst = waardeTekst(payload[sleutel]);
        gebruikt[sleutel] = true;
        if (!tekst) return;
        var meta = fieldMeta[fid] || {};
        var label = String(meta.alias || '').trim() || String(f.label || '').trim() || fid;
        var ftype = String(f.field_type || f.type || 'text');
        var rij = { label: label, html: waardeHtml(tekst, ftype) };
        if (f.is_meta || meta.hidden || isTechnisch(fid)) overige.push(rij); else rijen.push(rij);
      });
      Object.keys(payload).forEach(function (k) {
        if (gebruikt[k]) return;
        var tekst = waardeTekst(payload[k]);
        if (!tekst || normalizeKey(k) === 'nonce') return;
        var rij = { label: k, html: waardeHtml(tekst, ''), mono: true };
        // Zonder formulierdefinitie (nog niet geladen) toch de antwoorden
        // vooraan, enkel de technische sleutels achteraan.
        if (!formVeldenPlat.length && !isTechnisch(k)) rijen.push(rij); else overige.push(rij);
      });

      function dl(lijst) {
        return '<dl class="grid grid-cols-[minmax(7rem,36%)_1fr] gap-x-3 gap-y-1.5 text-xs">' +
          lijst.map(function (r) {
            return '<dt class="text-base-content/50 break-words' + (r.mono ? ' font-mono' : '') + '">' + esc(r.label) + '</dt>' +
                   '<dd class="text-base-content min-w-0">' + r.html + '</dd>';
          }).join('') +
        '</dl>';
      }

      return '<section class="rounded-box bg-base-100 border border-base-content/10 p-3 min-w-0">' +
          '<h4 class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2 flex items-center gap-1.5">' +
            '<i data-lucide="file-text" class="w-3.5 h-3.5"></i>Ingevuld formulier</h4>' +
          (rijen.length ? dl(rijen) : '<p class="text-xs text-base-content/40 italic">Geen ingevulde velden gevonden.</p>') +
          (overige.length
            ? '<details class="mt-3 pt-2 border-t border-base-content/10">' +
                '<summary class="text-xs cursor-pointer select-none text-base-content/50 hover:text-base-content">' +
                  'Overige gegevens (' + overige.length + ')</summary>' +
                '<div class="mt-2 opacity-80">' + dl(overige) + '</div>' +
              '</details>'
            : '') +
        '</section>';
    }

    function buildTimelineRow(sub) {
      var shortId = window.FSV2.shortId(sub.id);
      var ctx;
      // resolved_context can arrive as a JSONB object (Supabase) or serialized JSON string.
      var rc = sub.resolved_context;
      try { ctx = (rc && typeof rc === 'object') ? rc : JSON.parse(rc || '{}'); } catch (e2) { ctx = {}; }
      var actions  = ctx.target_actions || [];
      var payload  = leesbarePayload(sub);
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

      // Icoon per uitkomst: in één oogopslag zien wat er gebeurde, zonder
      // elke badge te moeten lezen.
      // Redenen die uitleggen in plaats van waarschuwen: er ging niets mis.
      var INFO_REDENEN = ['mail_already_queued', 'calendly_phase_skipped'];
      function uitkomstIcoon(a) {
        var act = String(a.action || '');
        if (a.skipped_reason === 'condition_not_met') return { icon: 'filter', kleur: 'text-warning' };
        if (!act) return { icon: 'circle-dashed', kleur: 'text-base-content/30' };
        if (act === 'failed' || /_failed$/.test(act)) return { icon: 'circle-x', kleur: 'text-error' };
        if (act === 'created' || act === 'pdf_generated' || act === 'mail_queued' || act === 'posted') return { icon: 'circle-plus', kleur: 'text-success' };
        if (act === 'updated' || act === 'mail_scheduled') return { icon: 'circle-check', kleur: 'text-info' };
        return { icon: 'circle-minus', kleur: 'text-base-content/30' };
      }

      var timelineHtml = stepsToShow.length
        ? '<ol class="space-y-0.5">' + stepsToShow.map(function (a) {
            var sl              = (a.skipped_reason && skipLabels[a.skipped_reason]) || '';
            var isReplaySkip    = a.skipped_reason === 'retry_skip_already_successful';
            var isConditionSkip = a.skipped_reason === 'condition_not_met';
            var act             = String(a.action || '');
            var isMislukt       = act === 'failed' || /_failed$/.test(act);
            // Een stap die intussen weg is, houdt zijn eigen volgnummer.
            var stepNum         = a.execution_order != null
              ? (stapPositie[Number(a.execution_order)] || Number(a.execution_order))
              : null;
            var stepLabel       = isConditionSkip
              ? 'overgeslagen (conditie)'
              : (isReplaySub && (a.action === 'created' || a.action === 'updated'))
                ? 'Geslaagd bij replay'
                : (a.action ? (actionLabels[a.action] || esc(a.action)) : '<span class="italic opacity-50">niet uitgevoerd</span>');
            var stepColor       = isConditionSkip
              ? 'badge-warning'
              : (a.action ? (actionColors[a.action] || 'badge-ghost') : 'badge-neutral');
            var ic   = uitkomstIcoon(a);
            var naam = a.label || modelNamen[a.model] || a.model || 'Stap';
            var link = odooLink(a.model, a.record_id);
            var recordHtml = a.record_id
              ? (link
                  ? '<a class="link link-hover font-mono text-base-content/60 inline-flex items-center gap-0.5" href="' + esc(link) + '" target="_blank" rel="noopener" title="Openen in Odoo">#' +
                      esc(String(a.record_id)) + '<i data-lucide="external-link" class="w-3 h-3"></i></a>'
                  : '<span class="font-mono text-base-content/40">#' + esc(String(a.record_id)) + '</span>')
              : '';
            // Een uitleg bij een stap die gewoon lukte (pdf bestond al, mail
            // stond al klaar) is geen fout: die hoort niet in het rood.
            var detailHtml = '';
            if (isConditionSkip && a.error_detail) {
              detailHtml = '<div class="mt-1 flex items-start gap-1.5 p-1.5 rounded bg-warning/10 border border-warning/20 text-warning/90 font-mono break-all">' +
                  '<i data-lucide="filter" class="w-3 h-3 shrink-0 mt-0.5"></i>' +
                  '<span>' + esc(a.error_detail) + '</span>' +
                '</div>';
            } else if (a.error_detail) {
              detailHtml = '<div class="' + (isMislukt ? 'text-error/80 font-mono break-all' : 'text-base-content/50 break-words') + '">' + esc(a.error_detail) + '</div>';
            }
            return '<li class="flex items-start gap-2 text-xs py-1.5 border-b border-base-content/5 last:border-0' + (isReplaySkip ? ' opacity-60' : '') + '">' +
              '<i data-lucide="' + ic.icon + '" class="w-4 h-4 shrink-0 ' + ic.kleur + '"></i>' +
              '<div class="flex flex-col gap-0.5 min-w-0 flex-1">' +
                '<div class="flex flex-wrap items-center gap-1.5">' +
                  (stepNum != null ? '<span class="text-base-content/40 font-mono">' + esc(String(stepNum)) + '.</span>' : '') +
                  '<span class="font-medium">' + esc(naam) + '</span>' +
                  (a.model && naam !== a.model ? '<span class="font-mono text-[10px] text-base-content/35">' + esc(a.model) + '</span>' : '') +
                  '<span class="badge badge-xs ' + stepColor + '">' + stepLabel + '</span>' +
                  recordHtml +
                  // Bij een replay staat dit bij bijna elke stap: kort en op
                  // dezelfde regel, anders wordt het spoor twee keer zo lang.
                  (isReplaySkip ? '<span class="text-base-content/40 italic">al gedaan, niet opnieuw</span>' : '') +
                '</div>' +
                (sl && !isConditionSkip && !isReplaySkip
                  ? '<div class="' + (INFO_REDENEN.indexOf(a.skipped_reason) !== -1 ? 'text-base-content/50' : 'text-warning') + '">' + esc(sl) + '</div>'
                  : '') +
                detailHtml +
              '</div>' +
            '</li>';
          }).join('') + '</ol>'
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
        ? '<div class="mb-2 p-2 rounded bg-error/10 border border-error/20 text-xs text-error font-mono break-all">' +
            '<span class="font-semibold mr-1">Fout:</span>' + esc(sub.last_error) +
          '</div>'
        : '';

      var mailSlotHtml = hasMailStep
        ? '<div class="mt-3 pt-3 border-t border-base-content/10">' +
            '<h4 class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-1.5 flex items-center gap-1.5">' +
              '<i data-lucide="mail" class="w-3.5 h-3.5"></i>Mail' +
            '</h4>' +
            '<div class="mail-status-slot" data-sub-id="' + esc(shortId) + '">' +
              '<span class="text-xs text-base-content/30 italic">Laden…</span>' +
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

      // ── Kopregel: wat, wanneer, en via welke pagina ──────────────────────
      var sm = statusMeta[sub.status] || { color: 'bg-base-content/30', label: sub.status || 'Onbekend' };
      var ruw = parsePayload(sub);
      var formNaam = waardeTekst(ruw.form_name);
      var pagina   = waardeTekst(ruw.meta_page_url || ruw.page_url || ruw.current_url || ruw.referer || ruw._wp_http_referer);
      var kopHtml =
        '<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-3">' +
          '<span class="inline-flex items-center gap-1.5 font-semibold">' +
            '<span class="inline-block w-2.5 h-2.5 rounded-full ' + sm.color + '"></span>' + esc(sm.label) +
          '</span>' +
          '<span class="text-base-content/60 inline-flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i>' + esc(window.FSV2.fmt(sub.created_at)) + '</span>' +
          (isReplaySub
            ? '<span class="badge badge-xs badge-accent">Replay van ' + esc(window.FSV2.shortId(sub.replay_of_submission_id)) + '</span>'
            : '') +
          (formNaam ? '<span class="text-base-content/60 truncate max-w-[20rem]">' + esc(formNaam) + '</span>' : '') +
          (pagina && /^https?:\/\//.test(pagina)
            ? '<a class="link link-hover text-base-content/50 truncate max-w-[22rem] inline-flex items-center gap-1" href="' + esc(pagina) + '" target="_blank" rel="noopener">' +
                '<i data-lucide="globe" class="w-3.5 h-3.5 shrink-0"></i>' + esc(pagina.replace(/^https?:\/\//, '')) + '</a>'
            : '') +
          '<span class="ml-auto font-mono text-base-content/30">' + esc(shortId) + '</span>' +
        '</div>';

      var verwerkingHtml =
        '<section class="rounded-box bg-base-100 border border-base-content/10 p-3 min-w-0">' +
          '<h4 class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-1.5 flex items-center gap-1.5">' +
            '<i data-lucide="workflow" class="w-3.5 h-3.5"></i>Verwerking in Odoo</h4>' +
          errorHtml + timelineHtml + mailSlotHtml +
        '</section>';

      var payloadDetailHtml =
        '<details class="mt-3">' +
          '<summary class="text-xs cursor-pointer select-none text-base-content/50 hover:text-base-content py-1 inline-flex items-center gap-1">' +
            '<i data-lucide="code" class="w-3.5 h-3.5"></i>Technische details</summary>' +
          '<div class="grid lg:grid-cols-2 gap-3 mt-1">' +
            '<div class="min-w-0">' +
              '<div class="text-xs font-semibold text-base-content/50 mb-1">Inkomende payload</div>' +
              '<pre class="text-xs font-mono bg-base-300 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
                esc(safeJsonPretty(sub.source_payload)) + '</pre>' +
            '</div>' +
            '<div class="min-w-0">' +
              '<div class="text-xs font-semibold text-base-content/50 mb-1">Verwerkte context (uitgaand naar Odoo)</div>' +
              // Een kale "{}" laat je raden of er iets stukging of dat er gewoon
              // niets te sturen viel. Die twee zijn heel verschillende dingen.
              (contextLeeg
                ? '<p class="text-xs text-base-content/50 mb-1">' +
                    (String(sub.status || '') === 'received'
                      ? 'Leeg omdat de koppeling uit stond toen deze inzending binnenkwam.'
                      : 'Leeg: er zijn nog geen veldkoppelingen ingesteld, dus er valt niets naar Odoo te sturen.') +
                  '</p>'
                : '') +
              '<pre class="text-xs font-mono bg-base-300 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">' +
                esc(safeJsonPretty(sub.resolved_context)) + '</pre>' +
            '</div>' +
          '</div>' +
        '</details>';

      return '<tr class="sub-timeline-row" id="stl-' + esc(shortId) + '" style="display:none">' +
        '<td colspan="' + colCount + '" class="bg-base-200/60 px-4 py-3 whitespace-normal">' +
          kopHtml +
          '<div class="grid md:grid-cols-2 gap-3 items-start">' + formulierBlok(payload) + verwerkingHtml + '</div>' +
          payloadDetailHtml +
        '</td>' +
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
            (isCalendly ? '<th' + vasteBreedte(3.25) + ' class="truncate" title="Stand van de afspraak">Afspraak</th>' : '') +
            (showIdColumn ? '<th' + vasteBreedte(5.5) + ' class="whitespace-nowrap">ID</th>' : '') +
            // truncate en niet break-words: een kop als "Waar kunnen we je mee
            // helpen?" wikkelt niet netjes in een smalle kolom maar loopt over
            // de buurkolom heen. Afkappen met een ellips houdt de rij op één
            // hoogte; de volledige kop staat in title.
            listColumns.map(function (c) {
              return '<th class="truncate" style="width:' + kolomBreedtePct(c) + '" title="' + esc(c.label) + '">' + esc(c.label) + '</th>';
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
            var verborgen  = !!item.verborgen;
            var ketenSleutel = item.keten;
            var ketenId    = ketenSleutel != null ? ketenNummer[ketenSleutel] : null;
            // Hoeveel rijen zitten er ingeklapt onder deze aanvoerder? Alleen
            // dan komt er een knop; een keten van één is gewoon een rij.
            var verborgenAantal = (!verborgen && ketenSleutel != null)
              ? Math.max(0, ((ketenLeden[ketenSleutel] || []).length - 1))
              : 0;

            var mainRow =
              '<tr class="sub-row cursor-pointer' + (isReplay ? ' bg-success/5' : '') + (verborgen ? ' bg-base-200/30' : '') + '"' +
                ' data-sub-id="' + esc(shortId) + '"' +
                (ketenId != null ? ' data-keten="' + ketenId + '"' + (verborgen ? ' data-keten-lid="1"' : '') : '') +
                (verborgen ? ' style="display:none"' : '') + '>' +
                '<td class="whitespace-nowrap">' + statusBadge(sub.status) +
                  (successfulReplay ? '<i data-lucide="corner-down-right" class="w-3 h-3 text-success ml-1 inline-block align-middle" title="Opgelost via replay"></i>' : '') +
                  '</td>' +
                (isCalendly
                  ? '<td class="whitespace-nowrap">' +
                      (verborgen
                        ? '<span class="text-base-content/30 text-xs pl-2" title="Eerdere gebeurtenis van dezelfde afspraak">&#x21B3;</span>'
                        : afspraakIcoon(sub, ketenSleutel)) +
                      (verborgenAantal > 0
                        ? '<button type="button" class="btn btn-ghost btn-xs px-1 ml-0.5 font-normal text-base-content/50"' +
                            ' data-keten-toggle="' + ketenId + '"' +
                            ' title="' + verborgenAantal + ' eerdere gebeurtenis' + (verborgenAantal > 1 ? 'sen' : '') + ' van deze afspraak">' +
                            '+' + verborgenAantal + '</button>'
                        : '') +
                    '</td>'
                  : '') +
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
                            : '<button class="btn btn-xs btn-square btn-primary" data-action="replay-submission" data-id="' + esc(sub.id) + '" title="Replay: enkel de mislukte stappen opnieuw. Wat al gelukt is (mail, notitie, lead) gebeurt niet nog eens."><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>')
                        : '') +
                      (forceReplayAllowed
                        ? '<button class="btn btn-xs btn-square btn-outline btn-warning" data-action="replay-submission" data-full="1" data-id="' + esc(sub.id) + '" title="Opnieuw verwerken (forceren): ook geslaagde stappen lopen opnieuw. Een notitie of activiteit komt er dan nog eens bij; een mail niet."><i data-lucide="refresh-cw" class="w-3 h-3"></i></button>'
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
    // De ingeklapte gebeurtenissen van een afspraak tonen/verbergen. Raakt
    // alleen de hoofdrijen: de uitgeklapte spoor-rijen (stl-...) blijven staan
    // zoals ze stonden, anders klapt elke keten-toggle ook elk spoor open.
    el.querySelectorAll('[data-keten-toggle]').forEach(function (knop) {
      knop.addEventListener('click', function (e) {
        e.stopPropagation();
        var ketenId = knop.getAttribute('data-keten-toggle');
        var leden   = el.querySelectorAll('tr[data-keten="' + ketenId + '"][data-keten-lid]');
        var openen  = leden.length > 0 && leden[0].style.display === 'none';
        leden.forEach(function (tr) { tr.style.display = openen ? '' : 'none'; });
        knop.classList.toggle('btn-active', openen);
      });
    });

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

    // Events SAMENGEVAT per soort: "Geopend 13×, laatst ..." in plaats van
    // dertien gelijke badges op een rij. Het precieze tijdstip van elk event
    // staat nog in de tooltip.
    var eventVolgorde = ['delivery', 'open', 'click', 'bounce', 'spamcomplaint', 'subscriptionchange'];
    var perSoort = {};
    events.forEach(function (e) {
      var t = e.event_type || 'onbekend';
      (perSoort[t] = perSoort[t] || []).push(e);
    });
    var soorten = Object.keys(perSoort).sort(function (a, b) {
      var ia = eventVolgorde.indexOf(a), ib = eventVolgorde.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    var eventsHtml = events.length
      ? '<div class="flex flex-wrap items-center gap-1.5 mt-1.5">' +
          soorten.map(function (t) {
            var lijst = perSoort[t].slice().sort(function (a, b) { return new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0); });
            var eerste = lijst[0], laatste = lijst[lijst.length - 1];
            var wanneer = lijst.length > 1
              ? 'eerst ' + window.FSV2.fmt(eerste.occurred_at) + ', laatst ' + window.FSV2.fmt(laatste.occurred_at)
              : window.FSV2.fmt(eerste.occurred_at);
            return '<span class="badge badge-sm gap-1 ' + (mailEventColors[t] || 'badge-ghost') + '" title="' + esc(wanneer) + '">' +
              esc(mailEventLabels[t] || t) +
              (lijst.length > 1 ? '<span class="font-semibold">' + lijst.length + '&times;</span>' : '') +
            '</span>';
          }).join('') +
        '</div>'
      : (mails.length ? '<div class="text-xs text-base-content/30 italic mt-1">Nog geen afleverings-/open-events van Postmark ontvangen.</div>' : '');

    return mailsHtml + skippedHtml + eventsHtml;
  }

  async function handleReplay(submissionId, full) {
    if (full && !confirm('Alle stappen opnieuw uitvoeren, ook wat al gelukt is? Een notitie of activiteit komt er dan nog eens bij. Een mail die al klaarstond, wordt niet opnieuw verstuurd.')) return;
    var body = await window.FSV2.api('/submissions/' + submissionId + '/replay', {
      method: 'POST',
      body: JSON.stringify({ full: !!full }),
    });
    var d = body.data || {};
    window.FSV2.showAlert((full ? 'Opnieuw verwerkt' : 'Mislukte stappen opnieuw uitgevoerd') + ': ' + (d.status || 'onbekend'), d.success ? 'success' : 'warning');
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

  /**
   * "Verversen" op het tabblad Indieningen. De knop bestond al
   * (data-action="refresh-submissions" in bootstrap.js), maar deze functie
   * niet -- klikken deed dus stil niets. Haalt enkel de indieningen (en de
   * mailstatus) opnieuw op: openDetail() zou het hele scherm herladen en je
   * van dit tabblad afhalen.
   */
  async function handleRefreshSubmissions() {
    var integId = S().activeId;
    if (!integId) return;
    var btn = document.querySelector('[data-action="refresh-submissions"]');
    if (btn) btn.classList.add('btn-disabled');
    try {
      var res = await window.FSV2.api('/integrations/' + integId + '/submissions');
      if (S().activeId !== integId) return;
      S().submissions = res.data || [];
      var targets = (S().detail && S().detail.targets) || [];
      if (targets.some(function (t) { return t.operation_type === 'send_mail'; })) {
        try {
          var me = await window.FSV2.api('/integrations/' + integId + '/mail-events-summary');
          S().mailEventsBySubmission = (me.data && me.data.bySubmission) || {};
        } catch (_) { /* funnelicoontje is bijzaak */ }
      }
      if (S().activeId !== integId) return;
      window.FSV2.renderDetailSubmissions();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      window.FSV2.showAlert('Indieningen ververst.', 'success');
    } catch (e) {
      window.FSV2.showAlert('Verversen mislukt: ' + e.message, 'error');
    } finally {
      var btnNa = document.querySelector('[data-action="refresh-submissions"]');
      if (btnNa) btnNa.classList.remove('btn-disabled');
    }
  }

  Object.assign(window.FSV2, {
    handleCleanupReplays: handleCleanupReplays,
    handleRefreshSubmissions: handleRefreshSubmissions,
    handleDeleteSubmission: handleDeleteSubmission,
    handleReplay: handleReplay,
    handleReplayMailEvents: handleReplayMailEvents,
    handleToggleDeleteUnlock: handleToggleDeleteUnlock,
    handleToggleIdColumn: handleToggleIdColumn,
    renderDetailSubmissions: renderDetailSubmissions
  });
})();
