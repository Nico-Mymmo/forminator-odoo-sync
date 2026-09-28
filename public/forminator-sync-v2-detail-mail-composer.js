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
    { pad: 'sender.first_name',  label: 'Voornaam afzender' },
    { pad: 'sender.name',        label: 'Naam afzender' },
    { pad: 'sender.job_title',   label: 'Functie afzender' },
    // De agenda van de afzender (zie resolveSenderAfspraak in mail-step.js).
    // Een andere soort typ je zelf: {{afspraak.sender.demo}}.
    { pad: 'afspraak.sender.standaard', label: 'Afspraaklink afzender' },
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

  /** execution_order van een stap, met dezelfde terugval als de server (worker-handler.js). */
  function stapVolgorde(t) {
    return (t.execution_order != null ? t.execution_order : t.order_index) || 0;
  }

  /**
   * Unieke identifiers die een VOORGAANDE stap genereerde (source_type
   * 'generated_unique_id'), als `step.<order>.generated_id` -- dezelfde sleutel
   * die worker-handler.js in contextObject zet (zie registerTargetOutput).
   * Alleen stappen VOOR deze (lagere volgorde) tellen mee: een latere stap
   * heeft op het moment van deze mail nog niets gegenereerd.
   */
  function voorgaandeStapTokens(tid) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var sorted  = targets.slice().sort(function (a, b) { return stapVolgorde(a) - stapVolgorde(b); });
    var huidige = sorted.find(function (t) { return String(t.id) === String(tid); });
    var huidigeOrder = huidige ? stapVolgorde(huidige) : Infinity;
    var res = [];
    sorted.forEach(function (t, i) {
      if (stapVolgorde(t) >= huidigeOrder) return;
      var mappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[t.id]) || [];
      mappings.forEach(function (m) {
        if (m.source_type !== 'generated_unique_id') return;
        res.push({
          pad:   'step.' + stapVolgorde(t) + '.generated_id',
          label: 'Unieke identifier (stap ' + (i + 1) + ')',
        });
      });
      // De afspraaklink van de EIGENAAR van het record uit deze stap (zie
      // src/modules/booking-links/lib/placeholders.js). Alleen voor stappen
      // die een record met een eigenaar opleveren; een andere soort dan
      // `standaard` typ je zelf: {{afspraak.<stap>.demo}}.
      var model = String(t.odoo_model || '');
      var handeling = ['send_mail', 'chatter_message', 'create_activity', 'generate_pdf', 'mailing_list']
        .indexOf(String(t.operation_type || '')) !== -1;
      if (!handeling && /lead|partner|employee/.test(model)) {
        res.push({
          pad:   'afspraak.' + stapVolgorde(t) + '.standaard',
          label: 'Afspraaklink eigenaar (stap ' + (i + 1) + ')',
          voorbeeld: 'https://openvme.be/?afspraak=algemeen'
        });
      }
    });
    return res;
  }

  /**
   * Waarden voor het voorbeeld.
   *
   * Die komen van hier en niet van de server, omdat de LABELS van de
   * formuliervelden hier bekend zijn. Een formulierveld wordt `[Voornaam]`:
   * je ziet dan meteen welk veld waar komt, zonder te doen alsof er echte
   * data staat.
   */
  function bouwVoorbeeldwaarden(tid) {
    var s = {
      'contact.first_name': 'Jadranka',
      'contact.name':       'Jadranka Vleyninckx',
      'contact.email':      'jadranka@example.org',
      'sender.first_name':  'Thomas',
      'sender.name':        'Thomas Peeters',
      'sender.email':       'thomas@openvme.be',
      'sender.job_title':   'Coach',
      'afspraak.sender.standaard': 'https://syndicoach.be/?afspraak=kennismaking-thomas',
      'now.year':           String(new Date().getFullYear())
    };
    formulierTokens().forEach(function (t) { s[t.pad] = '[' + t.label + ']'; });
    voorgaandeStapTokens(tid).forEach(function (t) { s[t.pad] = t.voorbeeld || ('[' + t.label + ']'); });
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

  /** Modellen met een eigenaar in `user_id` -- zelfde lijst als booking-links/lib/placeholders.js. */
  var MODELLEN_MET_EIGENAAR = ['crm.lead', 'res.partner', 'project.task', 'helpdesk.ticket'];

  /**
   * De keuzelijst "medewerker uit een vorige stap": wat buildEmployeeStepOptions
   * al aanbiedt (een hr.employee-stap, een round robin), plus de EIGENAAR van
   * het record uit een stap (`step.N.owner`, bv. de coach op de lead). Een stap
   * met een round robin krijgt geen aparte eigenaar-optie: dat is dezelfde persoon.
   */
  function afzenderStapOpties(sortedTargets, tid, huidige) {
    var html = window.FSV2.buildEmployeeStepOptions(sortedTargets, tid, huidige);
    var lijst = Array.isArray(sortedTargets) ? sortedTargets : [];
    var mijn = lijst.find(function (t) { return String(t.id) === String(tid); });
    var mijnOrder = mijn ? window.FSV2.getTargetOrder(mijn, 0) : Infinity;
    var mappingsByTarget = (S().detail && S().detail.mappingsByTarget) || {};
    lijst.forEach(function (t, idx) {
      var order = window.FSV2.getTargetOrder(t, idx);
      if (order >= mijnOrder) return;
      if (MODELLEN_MET_EIGENAAR.indexOf(String(t.odoo_model || '')) === -1) return;
      var handeling = ['send_mail', 'chatter_message', 'create_activity', 'generate_pdf', 'mailing_list']
        .indexOf(String(t.operation_type || '')) !== -1;
      if (handeling) return;
      var roundRobin = (mappingsByTarget[t.id] || []).some(function (m) { return m.source_type === 'round_robin_pool'; });
      if (roundRobin) return;
      var waarde = 'step.' + order + '.owner';
      var label = 'Stap ' + (idx + 1) + ' — ' + (t.label || window.FSV2.modelLabel(t.odoo_model)) + ': de verantwoordelijke';
      html += `<option value="${esc(waarde)}"${waarde === huidige ? ' selected' : ''}>${esc(label)}</option>`;
    });
    return html;
  }

  /**
   * Welke van de drie afzenderkeuzes deze stap is. Opgeslagen staat dat in
   * twee velden (mail_from_source + mail_signature_source); de UI toont er één
   * keuze van, want afzender en handtekening horen bij dezelfde persoon.
   * Een oude stap zonder handtekening op "eigenaar" wordt de verantwoordelijke
   * van de stap waar de mail aan hangt -- dat is wat hij al deed.
   */
  function afzenderStand(target) {
    if (String(target.mail_from_source || 'record_user') === 'fixed') return { modus: 'fixed', stap: '' };
    var sig = String(target.mail_signature_source || '');
    if (sig === 'fixed') return { modus: 'employee', stap: '' };
    if (sig === 'dynamic') return { modus: 'step', stap: String(target.mail_signature_source_value || '') };
    var m = String(target.mail_res_id_source || '').match(/^step\.([^.]+)\.record_id$/);
    return { modus: 'step', stap: m ? 'step.' + m[1] + '.owner' : '' };
  }

  /** De velden van de gekozen afzendermodus tonen, de rest verbergen. */
  function toonAfzenderModus(tid, modus) {
    var stap = document.getElementById('mailSenderStep-' + tid);
    var emp  = document.getElementById('mailSigEmployeeId-' + tid);
    var terug = document.getElementById('mailFromFallback-' + tid);
    var terugKop = document.getElementById('mailFromFallbackSummary-' + tid);
    var persoonUitleg = document.getElementById('mailSenderPersonHelp-' + tid);
    if (stap) stap.style.display = modus === 'step' ? '' : 'none';
    if (emp)  emp.style.display  = modus === 'employee' ? '' : 'none';
    if (persoonUitleg) persoonUitleg.style.display = modus === 'fixed' ? 'none' : '';
    // Bij een vast adres IS dit de afzender; bij een persoon enkel de terugval,
    // ingeklapt -- anders leest het alsof die naam de afzender wordt.
    if (terug) terug.open = modus === 'fixed' ? true : terug.open;
    if (terugKop) terugKop.style.display = modus === 'fixed' ? 'none' : '';
  }

  function renderMailComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    // Tekst per fase (zie forminator-sync-v2-detail-mapping-tab.js): een
    // fase-tab krijgt een STERK VEREENVOUDIGDE versie van deze editor —
    // alleen onderwerp + tekst. Vertraging, ontvanger, afzender, bijlagen,
    // ... zijn stap-brede instellingen en blijven op de "Standaard"-tab.
    var activeFase = window.FSV2.getComposerFase(tid);
    if (activeFase !== 'default') {
      renderMailComposerFaseTab(target, tid, activeFase);
      return;
    }

    // De bijlagen staan in een eigen toestand (window.FSV2._mailAttachments),
    // want ze worden na het kiezen en na het voorbeeld apart hertekend zonder
    // de hele composer -- anders verlies je de tekst in de editor.
    window.FSV2.initMailAttachments(tid, target);

    var vertraging = splitsVertraging(target.mail_delay_minutes);
    var layout     = String(target.mail_layout || 'plain');
    var afzender   = afzenderStand(target);
    var tokens     = alleTokens().concat(voorgaandeStapTokens(tid));
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
      ${window.FSV2.renderComposerFaseTabs(target, tid)}
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
          <div id="mailQuill-${esc(tid)}" class="min-w-0"></div>
          <label class="label pt-1 pb-0">
            <span class="label-text-alt text-base-content/50">
              Vet, cursief, onderstreept, lijstjes en links. Een afspraaklink achter een woord: selecteer
              het woord en kies <strong>Afspraaklink afzender</strong> bij "Veld invoegen". Een andere link:
              selecteer de tekst en klik op het schakeltje. Bewust geen kleuren, lettergroottes of
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
          <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Wie verstuurt deze mail?</span></label>
          <div class="flex flex-col gap-1.5">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mailSender-${esc(tid)}" value="step" class="radio radio-sm"
                     data-mail-sender-mode="${esc(tid)}" ${afzender.modus === 'step' ? 'checked' : ''}>
              <span class="text-sm">Een medewerker uit een vorige stap</span>
            </label>
            <select id="mailSenderStep-${esc(tid)}" class="select select-bordered select-sm w-full ml-6 max-w-[calc(100%-1.5rem)]"
                    ${afzender.modus === 'step' ? '' : 'style="display:none"'}>
              ${afzenderStapOpties(sortedTargets, tid, afzender.stap)}
            </select>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mailSender-${esc(tid)}" value="employee" class="radio radio-sm"
                     data-mail-sender-mode="${esc(tid)}" ${afzender.modus === 'employee' ? 'checked' : ''}>
              <span class="text-sm">Altijd dezelfde medewerker</span>
            </label>
            <input type="number" min="1" id="mailSigEmployeeId-${esc(tid)}"
                   class="input input-bordered input-sm w-full ml-6 max-w-[calc(100%-1.5rem)]"
                   placeholder="Medewerker-ID (hr.employee, uit de Odoo-URL)"
                   value="${target.mail_signature_employee_id || ''}"
                   ${afzender.modus === 'employee' ? '' : 'style="display:none"'}>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mailSender-${esc(tid)}" value="fixed" class="radio radio-sm"
                     data-mail-sender-mode="${esc(tid)}" ${afzender.modus === 'fixed' ? 'checked' : ''}>
              <span class="text-sm">Een vast adres, zonder persoon erachter</span>
            </label>
          </div>
          <label class="label pt-1 pb-0" id="mailSenderPersonHelp-${esc(tid)}"
                 ${afzender.modus === 'fixed' ? 'style="display:none"' : ''}>
            <span class="label-text-alt text-base-content/50">
              Alles komt dan van die ene persoon: het afzenderadres, de handtekening, <code>{{sender.first_name}}</code>
              en co, en de afspraaklink <code>{{afspraak.sender.standaard}}</code>. De handtekening is die van de
              signature-designer; nog niet gepusht, dan vertrekt de mail zonder, geen fout.
            </span>
          </label>

          <details id="mailFromFallback-${esc(tid)}" class="mt-2" ${afzender.modus === 'fixed' ? 'open' : ''}>
            <summary id="mailFromFallbackSummary-${esc(tid)}" class="text-xs text-base-content/60 cursor-pointer"
                     ${afzender.modus === 'fixed' ? 'style="display:none"' : ''}>
              Terugval als die persoon niet gevonden wordt of geen e-mailadres heeft
            </summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <input type="text" id="mailFromName-${esc(tid)}" class="input input-bordered input-sm"
                     value="${esc(target.mail_from_name || '')}" placeholder="Naam (bv. Team Syndicoach)">
              <input type="email" id="mailFromEmail-${esc(tid)}" class="input input-bordered input-sm"
                     value="${esc(target.mail_from_email || '')}" placeholder="E-mailadres">
            </div>
          </details>

          <label class="label pt-3 pb-1"><span class="label-text text-sm font-medium">Naam die de ontvanger ziet</span></label>
          <input type="text" id="mailFromDisplay-${esc(tid)}" class="input input-bordered input-sm"
                 value="${esc(target.mail_from_display_name || '')}" placeholder="{{sender.first_name}} van Syndicoach">
          <label class="label pt-1 pb-0">
            <span class="label-text-alt text-base-content/50">
              Staat in de inbox voor het adres. <code>{{sender.first_name}}</code> is de voornaam van de afzender,
              <code>{{sender.name}}</code> zijn volledige naam. Leeg = de naam van de afzender.
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

        ${window.FSV2.renderMailAttachmentsSection(tid)}

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

    // Afzender: stap / vaste medewerker / vast adres.
    el.addEventListener('change', function (e) {
      if (!e.target.matches('[data-mail-sender-mode]')) return;
      toonAfzenderModus(tid, e.target.value);
    });
  }

  /**
   * Vereenvoudigde editor voor een fase-tab: alleen onderwerp + tekst. De
   * overige mailinstellingen (vertraging, ontvanger, afzender, bijlagen, ...)
   * gelden voor de hele stap en zijn hier bewust niet herhaald — die wijzig
   * je op de "Standaard"-tab.
   */
  function renderMailComposerFaseTab(target, tid, fase) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;
    var override = ((target.calendly_behavior || {})[fase]) || {};
    var tokens   = alleTokens().concat(voorgaandeStapTokens(tid));
    var tokenOpties = tokens.map(function (t) {
      return `<option value="${esc(t.pad)}">${esc(t.label)}</option>`;
    }).join('');

    el.innerHTML = `
      ${window.FSV2.renderComposerFaseTabs(target, tid)}
      <div data-mail-composer-fase="${esc(tid)}">
        <div class="alert alert-info py-2 text-xs mb-3">
          <span>Eigen onderwerp en tekst voor deze fase. Vertraging, ontvanger, afzender en bijlagen
          staan op de tab "Standaard" en gelden voor elke fase. Laat onderwerp of tekst leeg om de
          standaardtekst van die tab te gebruiken.</span>
        </div>

        <div class="form-control mb-3">
          <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Onderwerp</span></label>
          <input type="text" id="mailSubject-${esc(tid)}" class="input input-bordered input-sm w-full"
                 value="${esc(override.mail_subject_template || '')}"
                 placeholder="Leeg = het standaardonderwerp">
        </div>

        <div class="form-control mb-3">
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
          <div id="mailQuill-${esc(tid)}" class="min-w-0"></div>
          <label class="label pt-1 pb-0">
            <span class="label-text-alt text-base-content/50">Leeg = de standaardtekst.</span>
          </label>
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

    if (!window.FSV2._mailQuills) window.FSV2._mailQuills = {};
    var host = document.getElementById('mailQuill-' + tid);
    if (host && window.EOQuill) {
      var qi = window.EOQuill.create({
        target: host,
        initialHtml: override.mail_body_html || '',
        placeholder: 'Eigen tekst voor deze fase...',
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

    el.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-mail-action]');
      if (!knop) return;
      var actie = knop.dataset.mailAction;
      var doelTid = knop.dataset.tid;
      if (actie === 'insert-token') voegTokenIn(doelTid);
      if (actie === 'preview')      vernieuwVoorbeeld(doelTid);
    });
  }

  /** Onderwerp + tekst van een fase-tab lezen. Gedeeld door opslaan en de auto-save bij het wisselen van tab. */
  function leesFaseTekstVelden(tid) {
    var qi = window.FSV2._mailQuills && window.FSV2._mailQuills[tid];
    return {
      mail_subject_template: (document.getElementById('mailSubject-' + tid) || {}).value || '',
      mail_body_html:        qi ? qi.getHTML() : '',
    };
  }

  /**
   * Fase-tab wisselen bewaart eerst stil de tab die je verlaat -- zie
   * switchComposerFase() in forminator-sync-v2-detail-mapping-tab.js. Enkel
   * onderwerp/tekst gaan naar calendly_behavior[fase]; de rest van de
   * mailinstellingen (vertraging, ontvanger, afzender, ...) is stap-breed en
   * verandert hier niet mee.
   */
  async function autoSaveMailFase(target, tid, fromFase) {
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;

    if (fromFase === 'default') {
      var velden = leesVelden(tid);
      Object.assign(target, velden);
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify(Object.assign({
          odoo_model:         target.odoo_model,
          operation_type:     'send_mail',
          mail_res_id_source: target.mail_res_id_source || null,
        }, velden)),
      });
      return;
    }

    var tekst = leesFaseTekstVelden(tid);
    var map = Object.assign({}, target.calendly_behavior || {});
    map[fromFase] = Object.assign({}, map[fromFase], tekst);
    target.calendly_behavior = map;
    await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
      method: 'PUT',
      body: JSON.stringify(Object.assign({}, target, { calendly_behavior: map })),
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

    // Een AFSPRAAKLINK hoort achter tekst, niet als kale URL in de zin. Staat
    // er tekst geselecteerd, dan wordt die tekst de link; anders komt er
    // "plan een afspraak" met de link erachter. Zo hoeft niemand de
    // placeholder in het linkvenster van Quill over te typen.
    if (/^afspraak\./.test(pad)) {
      var href = '{{' + pad + '}}';
      if (sel && sel.length > 0) {
        qi.quill.formatText(sel.index, sel.length, 'link', href, 'user');
        qi.quill.setSelection(sel.index + sel.length, 0);
      } else {
        var tekst = 'plan een afspraak';
        qi.quill.insertText(pos, tekst, { link: href }, 'user');
        qi.quill.setSelection(pos + tekst.length, 0);
        // Wat je hierna typt hoort niet meer bij de link.
        qi.quill.format('link', false, 'user');
      }
      keuze.value = '';
      return;
    }

    qi.quill.insertText(pos, '{{' + pad + '}}', 'user');
    qi.quill.setSelection(pos + pad.length + 4, 0);
    keuze.value = '';
  }

  /**
   * Het voorbeeld komt van de server, zodat het gelijk is aan wat er vertrekt.
   * Een fase-tab heeft niet alle velden in de DOM staan (enkel onderwerp +
   * tekst) — die stuurt daarom enkel die twee plus de gedeelde bijlagen mee,
   * in plaats van leesVelden(tid) dat de ontbrekende velden stil op hun
   * standaardwaarde zou laten vallen.
   */
  async function vernieuwVoorbeeld(tid) {
    var doel = document.getElementById('mailPreview-' + tid);
    if (!doel) return;
    doel.innerHTML = '<span class="text-base-content/40">Laden…</span>';
    var activeFase = window.FSV2.getComposerFase(tid);
    try {
      var payload;
      if (activeFase === 'default') {
        payload = leesVelden(tid);
      } else {
        var target = ((S().detail && S().detail.targets) || []).find(function (t) { return String(t.id) === tid; });
        payload = Object.assign({ mail_attachments: (target && target.mail_attachments) || [] }, leesFaseTekstVelden(tid));
      }
      var res = await window.FSV2.api('/targets/' + tid + '/mail-preview', {
        method: 'POST',
        body: JSON.stringify(Object.assign({}, payload, { sample: bouwVoorbeeldwaarden(tid) }))
      });
      if (!res || !res.success) throw new Error((res && res.error) || 'Voorbeeld mislukt');
      // De server zegt erbij of elke bijlage nog in de Asset Manager staat en
      // hoe groot ze is; dat wordt in de bijlagelijst getoond. Verversen is zo
      // ook de manier om te controleren of een vervangen bestand aangekomen is.
      window.FSV2.applyMailAttachmentStatus(tid, res.data.attachments);
      var bijlagen = (res.data.attachments || []);
      var bijlagenRegel = bijlagen.length === 0 ? '' :
        '<div class="text-xs text-base-content/60 mt-2 pt-2 border-t border-base-200">' +
          '<strong>Bijlagen:</strong> ' +
          bijlagen.map(function (b) {
            return esc(b.name) + (b.missing ? ' <span class="text-error">(ontbreekt)</span>' : '');
          }).join(', ') +
        '</div>';

      doel.innerHTML =
        '<div class="text-xs text-base-content/60 mb-2 pb-2 border-b border-base-200">' +
          '<strong>Onderwerp:</strong> ' + esc(res.data.subject || '') +
        '</div>' +
        '<div class="text-sm text-base-content">' + res.data.html + '</div>' +
        bijlagenRegel;
    } catch (err) {
      doel.innerHTML = '<span class="text-error">' + esc(err.message) + '</span>';
    }
  }

  /** Alles uit de DOM lezen. Eén plek, gebruikt door zowel opslaan als voorbeeld. */
  function leesVelden(tid) {
    var qi = window.FSV2._mailQuills && window.FSV2._mailQuills[tid];
    var uren = Number((document.getElementById('mailDelayH-' + tid) || {}).value || 0);
    var min  = Number((document.getElementById('mailDelayM-' + tid) || {}).value || 0);
    var modusEl = document.querySelector('input[name="mailSender-' + tid + '"]:checked');
    var modus = modusEl ? modusEl.value : 'step';
    var serverRaw = (document.getElementById('mailServerId-' + tid) || {}).value;
    // Eén keuze in de UI, twee velden in de database -- zie afzenderStand().
    var sigSourceVal = modus === 'step' ? 'dynamic' : (modus === 'employee' ? 'fixed' : '');
    return {
      mail_layout:            'plain',
      mail_subject_template:  (document.getElementById('mailSubject-' + tid) || {}).value || '',
      mail_body_html:         qi ? qi.getHTML() : '',
      mail_delay_minutes:     Math.max(0, (Number.isFinite(uren) ? uren : 0) * 60 + (Number.isFinite(min) ? min : 0)),
      mail_recipient_source:  (document.getElementById('mailRecipient-' + tid) || {}).value || 'record.email',
      mail_window_start_min:  alsMinuten((document.getElementById('mailWinStart-' + tid) || {}).value) ?? 480,
      mail_window_end_min:    alsMinuten((document.getElementById('mailWinEnd-' + tid) || {}).value) ?? 1200,
      mail_from_source:       modus === 'fixed' ? 'fixed' : 'record_user',
      mail_from_name:         (document.getElementById('mailFromName-' + tid) || {}).value || '',
      mail_from_display_name: (document.getElementById('mailFromDisplay-' + tid) || {}).value || '',
      mail_from_email:        (document.getElementById('mailFromEmail-' + tid) || {}).value || '',
      mail_reply_to:          (document.getElementById('mailReplyTo-' + tid) || {}).value || '',
      mail_server_id:         serverRaw ? Number(serverRaw) : null,
      mail_track_opens:       !!(document.getElementById('mailTrackOpens-' + tid) || {}).checked,
      mail_respect_blacklist: !!(document.getElementById('mailBlacklist-' + tid) || {}).checked,
      mail_attachments:       window.FSV2.mailAttachmentsPayload(tid),
      mail_signature_source:       sigSourceVal || null,
      mail_signature_employee_id:  sigSourceVal === 'fixed'
        ? Number((document.getElementById('mailSigEmployeeId-' + tid) || {}).value) || null : null,
      mail_signature_source_value: sigSourceVal === 'dynamic'
        ? ((document.getElementById('mailSenderStep-' + tid) || {}).value || null) : null
    };
  }

  // ─── Opslaan ───────────────────────────────────────────────────────────────

  async function handleSaveMailComposer(tid) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var target  = targets.find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }

    // Een fase-tab heeft geen vertraging/ontvanger/afzender/bijlagen in de DOM
    // staan -- dat zijn stap-brede instellingen die alleen via "Standaard"
    // wijzigen. Enkel onderwerp/tekst gaan naar calendly_behavior[fase].
    var activeFase = window.FSV2.getComposerFase(tid);
    if (activeFase !== 'default') {
      try {
        await autoSaveMailFase(target, tid, activeFase);
        window.FSV2.showAlert('Tekst voor deze fase opgeslagen.', 'success');
        await window.FSV2.openDetail(S().activeId);
      } catch (e) {
        window.FSV2.showAlert('Opslaan mislukt: ' + e.message, 'error');
      }
      return;
    }

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
      window.FSV2.showAlert('Vul het vaste afzenderadres in, of kies een medewerker als afzender.', 'error');
      return;
    }
    if (velden.mail_signature_source === 'fixed' && !(velden.mail_signature_employee_id > 0)) {
      window.FSV2.showAlert('Vul een geldig medewerker-ID in, of kies een andere afzender.', 'error');
      return;
    }
    if (velden.mail_signature_source === 'dynamic' && !velden.mail_signature_source_value) {
      window.FSV2.showAlert('Kies uit welke stap de afzender komt.', 'error');
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
    autoSaveMailFase: autoSaveMailFase,
    _mailComposerReadFields: leesVelden
  });
})();
