/**
 * Koppelingen — composer voor de send_mail-stap.
 *
 * Dit is de maileditor die de gebruiker ziet: onderwerp, tekst, wanneer, aan
 * wie, van wie. Zelfde opzet als de chatter- en activity-composer (eigen IIFE,
 * export via window.FSV2.*, opslaan via de gedeelde voettekstknop van de
 * kaart -- zie handleSaveStepMappings in -detail-mapping-tab.js).
 *
 * DE TOOLBAR IS BEWUST KLEIN: vet, cursief, link, wissen. Geen kleuren, geen
 * lettergroottes, geen afbeeldingen, geen kopregels. Alles wat je daar
 * toevoegt kan iemand gebruiken om er weer een mailing van te maken, en deze
 * mail hoort te lezen als iets dat een mens getypt heeft. De link zit er wél
 * in, want de gebruiker maakt zijn eigen linkteksten.
 *
 * HET VOORBEELD KOMT VAN DE SERVER (/targets/:id/mail-preview) en niet uit JS
 * hier. Een tweede renderer in de browser zou onvermijdelijk uit elkaar gaan
 * lopen met render-plain.js, en dan toont het voorbeeld iets anders dan wat er
 * vertrekt -- exact de fout die in de events-mailstudio al een keer gemaakt is.
 */
(function () {
  'use strict';

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  /** Placeholders die er altijd zijn, los van het formulier. */
  var VASTE_TOKENS = [
    { pad: 'contact.first_name', label: 'Voornaam' },
    { pad: 'contact.name',       label: 'Naam' },
    { pad: 'contact.email',      label: 'E-mailadres' },
    { pad: 'sender.name',        label: 'Naam afzender' },
    { pad: 'sender.job_title',   label: 'Functie afzender' },
    { pad: 'now.year',           label: 'Huidig jaar' }
  ];

  /** De velden van dit formulier, als `form.<veld-id>`. */
  function formulierTokens() {
    var res = window.FSV2.buildDetailFlatFields(S().detailFormFields || []);
    var velden = (res && res.flatFields) || [];
    return velden.map(function (f) {
      var id = f.field_id || f.fieldId || f.id || f.name || '';
      return { pad: 'form.' + id, label: f.label || id };
    }).filter(function (t) { return t.pad !== 'form.'; });
  }

  function alleTokens() {
    return VASTE_TOKENS.concat(formulierTokens());
  }

  /**
   * Waarden voor het voorbeeld.
   *
   * Die komen van hier en niet van de server, omdat de LABELS van de
   * formuliervelden hier bekend zijn. Een formulierveld wordt `[Voornaam]`:
   * je ziet dan meteen welk veld waar komt, zonder te doen alsof er echte
   * data staat.
   */
  function bouwVoorbeeldwaarden() {
    var s = {
      'contact.first_name': 'Jadranka',
      'contact.name':       'Jadranka Vleyninckx',
      'contact.email':      'jadranka@example.org',
      'sender.name':        'Thomas Peeters',
      'sender.email':       'thomas@openvme.be',
      'sender.job_title':   'Coach',
      'now.year':           String(new Date().getFullYear())
    };
    formulierTokens().forEach(function (t) { s[t.pad] = '[' + t.label + ']'; });
    return s;
  }

  /** Minuten sinds middernacht → 'HH:MM' voor een <input type="time">. */
  function alsKlok(minuten) {
    var m = Number(minuten);
    if (!Number.isFinite(m) || m < 0 || m > 1440) m = 0;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /** 'HH:MM' → minuten sinds middernacht. */
  function alsMinuten(klok) {
    var delen = String(klok || '').split(':');
    var u = Number(delen[0]), m = Number(delen[1]);
    if (!Number.isFinite(u) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(1440, u * 60 + m));
  }

  /** Vertraging in minuten → { uren, minuten } voor de twee invoervelden. */
  function splitsVertraging(minuten) {
    var m = Number(minuten);
    if (!Number.isFinite(m) || m < 0) m = 0;
    return { uren: Math.floor(m / 60), minuten: m % 60 };
  }

  // ─── Renderen ──────────────────────────────────────────────────────────────

  function renderMailComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    var vertraging = splitsVertraging(target.mail_delay_minutes);
    var layout     = String(target.mail_layout || 'plain');
    var fromSource = String(target.mail_from_source || 'record_user');
    var tokens     = alleTokens();
    var velden     = formulierTokens();

    var tokenOpties = tokens.map(function (t) {
      return `<option value="${esc(t.pad)}">${esc(t.label)}</option>`;
    }).join('');

    var ontvangerOpties = [`<option value="record.email"${target.mail_recipient_source === 'record.email' ? ' selected' : ''}>Het e-mailadres van het record zelf (aanbevolen)</option>`]
      .concat(velden.map(function (t) {
        var val = 'field.' + t.pad.slice('form.'.length);
        return `<option value="${esc(val)}"${target.mail_recipient_source === val ? ' selected' : ''}>Formulierveld: ${esc(t.label)}</option>`;
      })).join('');

    el.innerHTML = `
      <div data-mail-composer="${esc(tid)}">

        ${layout === 'blocks' ? `
        <div class="alert alert-warning py-2 text-xs mb-3">
          <span>Deze stap staat op opgemaakte mail (<code>blocks</code>). Deze editor is voor platte tekst;
          de blokken pas je aan in de mailstudio.</span>
        </div>` : ''}

        <div class="form-control mb-3">
          <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Onderwerp</span></label>
          <input type="text" id="mailSubject-${esc(tid)}" class="input input-bordered input-sm w-full"
                 value="${esc(target.mail_subject_template || '')}"
                 placeholder="Bijv: Bedankt voor je interesse, even kennismaken?">
        </div>

        <div class="form-control mb-1">
          <label class="label pt-0 pb-1 flex items-center justify-between">
            <span class="label-text text-sm font-medium">Tekst</span>
            <span class="flex items-center gap-1">
              <select id="mailToken-${esc(tid)}" class="select select-bordered select-xs">
                <option value="">Veld invoegen…</option>
                ${tokenOpties}
              </select>
              <button type="button" class="btn btn-xs" data-mail-action="insert-token" data-tid="${esc(tid)}">Invoegen</button>
            </span>
          </label>
          <div id="mailQuill-${esc(tid)}" class="rounded-lg overflow-hidden border border-base-300"></div>
          <label class="label pt-1 pb-0">
            <span class="label-text-alt text-base-content/50">
              Vet, cursief, onderstreept, lijstjes en links. Een link maak je door de tekst te
              selecteren en op het schakeltje te klikken. Bewust geen kleuren, lettergroottes of
              afbeeldingen — dit is een gewone mail, geen mailing.
            </span>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 mt-3">
          <div class="form-control">
            <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Wanneer versturen</span></label>
            <div class="flex items-center gap-2">
              <input type="number" min="0" max="8760" id="mailDelayH-${esc(tid)}"
                     class="input input-bordered input-sm w-20" value="${vertraging.uren}">
              <span class="text-xs text-base-content/60">uur</span>
              <input type="number" min="0" max="59" id="mailDelayM-${esc(tid)}"
                     class="input input-bordered input-sm w-20" value="${vertraging.minuten}">
              <span class="text-xs text-base-content/60">min</span>
            </div>
            <label class="label pt-1 pb-0">
              <span class="label-text-alt text-base-content/50">0 = meteen. Even wachten laat de mail persoonlijker lezen.</span>
            </label>
          </div>

          <div class="form-control">
            <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Alleen versturen tussen</span></label>
            <div class="flex items-center gap-2">
              <input type="time" id="mailWinStart-${esc(tid)}" class="input input-bordered input-sm w-28"
                     value="${esc(alsKlok(target.mail_window_start_min == null ? 480 : target.mail_window_start_min))}">
              <span class="text-xs text-base-content/60">en</span>
              <input type="time" id="mailWinEnd-${esc(tid)}" class="input input-bordered input-sm w-28"
                     value="${esc(alsKlok(target.mail_window_end_min == null ? 1200 : target.mail_window_end_min))}">
            </div>
            <label class="label pt-1 pb-0">
              <span class="label-text-alt text-base-content/50">
                Valt de vertraging hierbuiten, dan schuift de mail naar de eerstvolgende opening —
                nooit naar vroeger. Twee gelijke tijden = altijd versturen.
              </span>
            </label>
          </div>

          <div class="form-control">
            <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Naar welk adres</span></label>
            <select id="mailRecipient-${esc(tid)}" class="select select-bordered select-sm w-full">
              ${ontvangerOpties}
            </select>
          </div>
        </div>

        <div class="form-control mb-3">
          <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Afzender</span></label>
          <div class="flex flex-col gap-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mailFrom-${esc(tid)}" value="record_user" class="radio radio-sm"
                     ${fromSource === 'record_user' ? 'checked' : ''}>
              <span class="text-sm">De eigenaar van het record (de toegewezen coach)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mailFrom-${esc(tid)}" value="fixed" class="radio radio-sm"
                     ${fromSource === 'fixed' ? 'checked' : ''}>
              <span class="text-sm">Altijd hetzelfde adres</span>
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <input type="text" id="mailFromName-${esc(tid)}" class="input input-bordered input-sm"
                   value="${esc(target.mail_from_name || '')}" placeholder="Naam (bv. Thomas van Syndicoach)">
            <input type="email" id="mailFromEmail-${esc(tid)}" class="input input-bordered input-sm"
                   value="${esc(target.mail_from_email || '')}" placeholder="E-mailadres">
          </div>
          <label class="label pt-1 pb-0">
            <span class="label-text-alt text-base-content/50">
              Ook de terugval: heeft het record geen eigenaar met e-mailadres, dan wordt dit gebruikt. Laat het niet leeg.
            </span>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div class="form-control">
            <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Antwoorden naar</span></label>
            <input type="email" id="mailReplyTo-${esc(tid)}" class="input input-bordered input-sm w-full"
                   value="${esc(target.mail_reply_to || '')}" placeholder="Leeg = naar de afzender">
          </div>
          <div class="form-control">
            <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Odoo-mailserver</span></label>
            <input type="number" min="1" id="mailServerId-${esc(tid)}" class="input input-bordered input-sm w-full"
                   value="${esc(target.mail_server_id == null ? '' : String(target.mail_server_id))}" placeholder="5">
            <label class="label pt-1 pb-0">
              <span class="label-text-alt text-base-content/50">
                5 = Postmark Outbound Contact Replies. Leeg laten betekent de standaard, en dat is de
                nieuwsbrief-stream — daar hoort deze mail niet op.
              </span>
            </label>
          </div>
        </div>

        <div class="flex flex-col gap-1 mb-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="mailTrackOpens-${esc(tid)}" class="checkbox checkbox-sm"
                   ${target.mail_track_opens !== false ? 'checked' : ''}>
            <span class="text-sm">Opens meten (voegt een onzichtbare pixel toe)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="mailBlacklist-${esc(tid)}" class="checkbox checkbox-sm"
                   ${target.mail_respect_blacklist !== false ? 'checked' : ''}>
            <span class="text-sm">Uitschrijvingen respecteren (mail.blacklist)</span>
          </label>
          <span class="text-xs text-base-content/50 pl-7">
            Zet dit niet uit. Odoo doet dit voor een gewone mail niet zelf, dus uitzetten betekent mailen
            naar wie zich heeft uitgeschreven.
          </span>
        </div>

        <div class="mb-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium">Voorbeeld</span>
            <button type="button" class="btn btn-xs" data-mail-action="preview" data-tid="${esc(tid)}">Verversen</button>
          </div>
          <div id="mailPreview-${esc(tid)}"
               class="border border-base-200 rounded-lg bg-base-100 p-3 text-xs text-base-content/50">
            Klik op Verversen om te zien wat er precies vertrekt.
          </div>
        </div>
      </div>
    `;

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });

    // ── Quill ────────────────────────────────────────────────────────────────
    if (!window.FSV2._mailQuills) window.FSV2._mailQuills = {};
    var host = document.getElementById('mailQuill-' + tid);
    if (host && window.EOQuill) {
      var qi = window.EOQuill.create({
        target: host,
        initialHtml: target.mail_body_html || '',
        placeholder: 'Hoi {{contact.first_name}},\n\nBedankt voor je aanvraag!',
        // Basisopmaak plus links. Bewust GEEN kleuren, lettergroottes,
        // kopregels of afbeeldingen: alles wat je daar toevoegt kan iemand
        // gebruiken om er weer een mailing van te maken, en dan is de hele
        // reden voor deze stap weg. Een link zet je zoals overal: selecteer
        // de tekst en klik op het schakeltje.
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'clean']
        ]
      });
      if (qi) {
        window.FSV2._mailQuills[tid] = qi;
        var ed = host.querySelector('.ql-editor');
        if (ed) { ed.style.minHeight = '160px'; ed.style.maxHeight = '320px'; ed.style.overflowY = 'auto'; }
      }
    }

    // ── Eén gedelegeerde listener op de composer zelf ────────────────────────
    // Bewust NIET in de globale bootstrap-listener: deze acties bestaan alleen
    // binnen deze kaart, en de bootstrap-switch is al lang genoeg.
    el.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-mail-action]');
      if (!knop) return;
      var actie = knop.dataset.mailAction;
      var doelTid = knop.dataset.tid;
      if (actie === 'insert-token') voegTokenIn(doelTid);
      if (actie === 'preview')      vernieuwVoorbeeld(doelTid);
    });
  }

  /** De gekozen placeholder invoegen op de cursorpositie in de tekst. */
  function voegTokenIn(tid) {
    var keuze = document.getElementById('mailToken-' + tid);
    var pad   = keuze && keuze.value;
    if (!pad) { window.FSV2.showAlert('Kies eerst een veld.', 'error'); return; }
    var qi = window.FSV2._mailQuills && window.FSV2._mailQuills[tid];
    if (!qi || !qi.quill) return;
    var sel = qi.quill.getSelection(true);
    var pos = sel ? sel.index : qi.quill.getLength();
    qi.quill.insertText(pos, '{{' + pad + '}}', 'user');
    qi.quill.setSelection(pos + pad.length + 4, 0);
    keuze.value = '';
  }

  /** Het voorbeeld komt van de server, zodat het gelijk is aan wat er vertrekt. */
  async function vernieuwVoorbeeld(tid) {
    var doel = document.getElementById('mailPreview-' + tid);
    if (!doel) return;
    doel.innerHTML = '<span class="text-base-content/40">Laden…</span>';
    try {
      var res = await window.FSV2.api('/targets/' + tid + '/mail-preview', {
        method: 'POST',
        body: JSON.stringify(Object.assign({}, leesVelden(tid), { sample: bouwVoorbeeldwaarden() }))
      });
      if (!res || !res.success) throw new Error((res && res.error) || 'Voorbeeld mislukt');
      doel.innerHTML =
        '<div class="text-xs text-base-content/60 mb-2 pb-2 border-b border-base-200">' +
          '<strong>Onderwerp:</strong> ' + esc(res.data.subject || '') +
        '</div>' +
        '<div class="text-sm text-base-content">' + res.data.html + '</div>';
    } catch (err) {
      doel.innerHTML = '<span class="text-error">' + esc(err.message) + '</span>';
    }
  }

  /** Alles uit de DOM lezen. Eén plek, gebruikt door zowel opslaan als voorbeeld. */
  function leesVelden(tid) {
    var qi = window.FSV2._mailQuills && window.FSV2._mailQuills[tid];
    var uren = Number((document.getElementById('mailDelayH-' + tid) || {}).value || 0);
    var min  = Number((document.getElementById('mailDelayM-' + tid) || {}).value || 0);
    var fromEl = document.querySelector('input[name="mailFrom-' + tid + '"]:checked');
    var serverRaw = (document.getElementById('mailServerId-' + tid) || {}).value;
    return {
      mail_layout:            'plain',
      mail_subject_template:  (document.getElementById('mailSubject-' + tid) || {}).value || '',
      mail_body_html:         qi ? qi.getHTML() : '',
      mail_delay_minutes:     Math.max(0, (Number.isFinite(uren) ? uren : 0) * 60 + (Number.isFinite(min) ? min : 0)),
      mail_recipient_source:  (document.getElementById('mailRecipient-' + tid) || {}).value || 'record.email',
      mail_window_start_min:  alsMinuten((document.getElementById('mailWinStart-' + tid) || {}).value) ?? 480,
      mail_window_end_min:    alsMinuten((document.getElementById('mailWinEnd-' + tid) || {}).value) ?? 1200,
      mail_from_source:       fromEl ? fromEl.value : 'record_user',
      mail_from_name:         (document.getElementById('mailFromName-' + tid) || {}).value || '',
      mail_from_email:        (document.getElementById('mailFromEmail-' + tid) || {}).value || '',
      mail_reply_to:          (document.getElementById('mailReplyTo-' + tid) || {}).value || '',
      mail_server_id:         serverRaw ? Number(serverRaw) : null,
      mail_track_opens:       !!(document.getElementById('mailTrackOpens-' + tid) || {}).checked,
      mail_respect_blacklist: !!(document.getElementById('mailBlacklist-' + tid) || {}).checked
    };
  }

  // ─── Opslaan ───────────────────────────────────────────────────────────────

  async function handleSaveMailComposer(tid) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var target  = targets.find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }

    var velden = leesVelden(tid);

    // Vroeg en duidelijk klagen, in plaats van de server een 400 laten geven.
    if (!velden.mail_subject_template.trim()) {
      window.FSV2.showAlert('Vul een onderwerp in.', 'error');
      return;
    }
    if (!velden.mail_body_html.replace(/<[^>]*>/g, '').trim()) {
      window.FSV2.showAlert('De mailtekst is leeg.', 'error');
      return;
    }
    if (velden.mail_from_source === 'fixed' && !velden.mail_from_email.trim()) {
      window.FSV2.showAlert('Kies een vast afzenderadres, of zet de afzender op de eigenaar van het record.', 'error');
      return;
    }

    try {
      var res = await window.FSV2.api('/integrations/' + (S().detail.integration && S().detail.integration.id) +
        '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify(Object.assign({
          odoo_model:      target.odoo_model,
          identifier_type: target.identifier_type || 'mapped_fields',
          update_policy:   target.update_policy || 'always_overwrite',
          operation_type:  'send_mail',
          execution_order: target.execution_order,
          order_index:     target.order_index,
          is_enabled:      target.is_enabled !== false,
          mail_res_id_source: target.mail_res_id_source || null,
        }, velden)),
      });
      if (!res || !res.success) throw new Error((res && res.error) || 'Opslaan mislukt');
      window.FSV2.showAlert('Mailstap opgeslagen.', 'success');
      await window.FSV2.openDetail(S().activeId);
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    }
  }

  Object.assign(window.FSV2, {
    renderMailComposer: renderMailComposer,
    handleSaveMailComposer: handleSaveMailComposer,
    _mailComposerReadFields: leesVelden
  });
})();
