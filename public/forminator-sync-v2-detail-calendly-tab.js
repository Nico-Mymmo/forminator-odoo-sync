/**
 * Koppelingen — het Calendly-tabblad van het detailscherm.
 *
 * Twee blokken, in deze volgorde:
 *
 *   1. STAP 1 — VASTE STAP. Welk Calendly-eventtype deze koppeling opvangt,
 *      als welk type het in Odoo terechtkomt, en (kort) wat de vaste stap
 *      doet. Dat laatste is niet instelbaar, maar hoort bij dezelfde stap als
 *      de eventtype-keuze -- vandaar één kaart in plaats van twee.
 *   2. INDIENINGEN e.d. via de rest van het detailscherm (andere tabs).
 *
 * De VERBINDING zelf (module-breed, niet per koppeling -- zie
 * forminator-sync-v2-calendly-connection.js) staat hier enkel als compacte
 * statusregel bovenaan: een kapotte verbinding laat alle Calendly-koppelingen
 * tegelijk stilvallen, dus dat moet je meteen zien, maar het volledige beheer
 * (aanmelden/verversen/afmelden) hoort maar één keer thuis, in
 * Instellingen → Verbindingen.
 *
 * Alle HTML met ES6 template literals, geen string-concatenatie -- de
 * coderegel van deze module.
 */

(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };
  function S() { return window.FSV2.S; }

  // Wordt gevuld door laadCalendlyTab(); leeg tot het tabblad voor het eerst
  // geopend wordt, zodat het openen van een koppeling geen extra API-aanroepen
  // kost voor een tabblad dat je misschien niet bekijkt.
  var eventTypes = null;
  var odooEventTypes = null;
  var koppelingConfig = null;
  var bezig = false;

  function isCalendly() {
    var i = S().detail && S().detail.integration;
    return !!(i && i.source_type === 'calendly');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LADEN
  // ═══════════════════════════════════════════════════════════════════════════

  async function laadCalendlyTab(opnieuw) {
    if (!isCalendly()) return;
    if (koppelingConfig && !opnieuw) { renderCalendlyTab(); return; }

    var id = S().activeId;
    renderCalendlyTab({ laden: true });

    // De verbindingsstatus is gedeeld met Instellingen → Verbindingen: hier
    // enkel verversen als dit hele tabblad zelf herladen wordt (koppeling net
    // geopend, of na "Opslaan"/"Vaste stap herbouwen"), anders hergebruikt dit
    // gewoon de al geladen/cachestatus.
    await window.FSV2.laadCalendlyConnectie(!!opnieuw);

    var status = window.FSV2.huidigeCalendlyConnectieStatus();

    // De rest alleen ophalen als er een token is -- zonder token geven die
    // routes toch een fout, en drie foutmeldingen onder elkaar zeggen minder
    // dan die ene zin over de ontbrekende secret.
    if (status && status.token_configured) {
      try {
        var etRes = await window.FSV2.api('/calendly/event-types');
        eventTypes = etRes.data || [];
      } catch (err) {
        eventTypes = null;
        window.FSV2.showAlert('Eventtypes ophalen bij Calendly mislukt: ' + err.message, 'error');
      }
    }

    try {
      var oRes = await window.FSV2.api('/calendly/odoo-event-types');
      odooEventTypes = oRes.data || [];
    } catch (err) {
      odooEventTypes = null;
    }

    try {
      var cRes = await window.FSV2.api('/integrations/' + id + '/calendly');
      koppelingConfig = cRes.data || null;
    } catch (err) {
      koppelingConfig = null;
    }

    if (S().activeId !== id) return;
    renderCalendlyTab();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEKENEN
  // ═══════════════════════════════════════════════════════════════════════════

  function renderCalendlyTab(opties) {
    var host = document.getElementById('detailTabCalendly');
    if (!host) return;

    if (opties && opties.laden) {
      host.innerHTML = `<div class="flex items-center gap-2 text-sm text-base-content/60 py-8 justify-center">
        <span class="loading loading-spinner loading-sm"></span> Calendly wordt gelezen…
      </div>`;
      return;
    }

    host.innerHTML = `
      <div id="calendlyConnectionCompact"></div>
      ${stapEenBlok()}
    `;

    // De compacte statusregel zelf tekent zichzelf via de gedeelde module --
    // hier enkel de host neerzetten, renderCalendlyConnectieAlles() vult 'm.
    window.FSV2.renderCalendlyConnectieAlles();

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: host });
  }

  // ── Stap 1: welk eventtype + wat de vaste stap doet ─────────────────────────

  function stapEenBlok() {
    var huidig = (koppelingConfig && koppelingConfig.event_type_uri) || '';
    var huidigOdoo = (koppelingConfig && koppelingConfig.odoo_event_type_id) || '';

    var keuzeHtml;
    if (eventTypes === null) {
      keuzeHtml = `<p class="text-sm text-base-content/50">De eventtypes zijn niet op te halen. Controleer eerst de verbinding hierboven.</p>`;
    } else if (!eventTypes.length) {
      keuzeHtml = `<p class="text-sm text-base-content/50">Dit Calendly-account heeft nog geen eventtypes.</p>`;
    } else {
      keuzeHtml = `
        <select id="calendlyEventType" class="select select-bordered select-sm w-full max-w-xl">
          <option value="">Vangnet — alles waarvoor geen eigen koppeling bestaat</option>
          ${eventTypes.map(function (t) {
            // Gedeelde/team-eventtypes (round robin, collective, ...) komen nu ook uit
            // andere leden van de organisatie (zie listEventTypes() in client.js) --
            // de eigenaar erbij tonen is hier het enige dat twee gelijknamige
            // eventtypes van verschillende collega's nog uit elkaar houdt.
            var eigenaarSuffix = t.pooling_type && t.owner_name ? ' · ' + t.owner_name : '';
            return `<option value="${esc(t.uri)}" ${t.uri === huidig ? 'selected' : ''}
                            data-name="${esc(t.name)}"
                            data-pooling="${esc(t.pooling_type || '')}"
                            data-locale="${esc(t.locale || '')}">
              ${esc(t.name)}${esc(eigenaarSuffix)}${t.active ? '' : ' (niet actief)'}${t.duration ? ' — ' + esc(String(t.duration)) + ' min' : ''}
            </option>`;
          }).join('')}
        </select>`;
    }

    var odooHtml = odooEventTypes === null
      ? `<p class="text-sm text-base-content/50">De Odoo-types zijn niet op te halen.</p>`
      : `<select id="calendlyOdooEventType" class="select select-bordered select-sm w-full max-w-xs">
           <option value="">— geen —</option>
           ${odooEventTypes.map(function (t) {
             return `<option value="${esc(String(t.id))}" ${String(t.id) === String(huidigOdoo) ? 'selected' : ''}>${esc(t.name)}</option>`;
           }).join('')}
         </select>`;

    return kaart('Stap 1 — wat deze koppeling opvangt', 'lock', `
      <p class="text-sm text-base-content/70 mb-4">
        De vaste eerste stap zoekt het contact op via e-mail (of maakt het aan), zoekt de host bij
        de medewerkers op het werk-e-mailadres, en zet de afspraak in Odoo op
        <code class="text-xs">x_calendlymeeting</code> — aanmaken, verplaatsen en annuleren komen
        hier alle drie binnen. Niet instelbaar; extra stappen (lead aanmaken, notitie posten, mail
        versturen) zet je op het tabblad <strong>Koppeling</strong>, met "vorige stap" naar het
        meeting-record.
      </p>

      <label class="form-control mb-3">
        <span class="label label-text text-xs">Calendly-eventtype</span>
        ${keuzeHtml}
        <span class="label"><span class="label-text-alt text-base-content/50">
          Eén eventtype hoort bij één koppeling. Laat je dit op “vangnet” staan, dan komt alles
          hier terecht waarvoor geen andere koppeling bestaat.
        </span></span>
      </label>

      <label class="form-control mb-4">
        <span class="label label-text text-xs">Type in Odoo <span class="text-base-content/50">— vult 📋 Type op de meeting</span></span>
        ${odooHtml}
        <span class="label"><span class="label-text-alt text-base-content/50">
          Odoo-automatisering 12 maakt enkel een lead aan bij het type <strong>Demo</strong>.
          Staat dit op “Anders”, dan gebeurt er in Odoo niets extra.
        </span></span>
      </label>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary btn-sm" data-action="calendly-save-integration">
          <i data-lucide="save" class="w-4 h-4"></i> Opslaan
        </button>
        <button type="button" class="btn btn-ghost btn-xs" data-action="calendly-rebuild"
                title="Bouwt de vaste stap opnieuw op in Odoo. Nodig als iemand de resolver, de zoekstap of de upsert per ongeluk aanpaste of verwijderde.">
          <i data-lucide="wrench" class="w-3.5 h-3.5"></i> Vaste stap herbouwen
        </button>
      </div>

      <p class="text-xs text-base-content/40 mt-3">
        Verplaatst iemand zijn afspraak, dan maakt Calendly daar een <em>nieuwe</em> afspraak van en
        annuleert de oude — je ziet dus twee meetings in Odoo, waarvan de oude op “geannuleerd” staat.
      </p>
    `);
  }

  function kaart(titel, icoon, inhoud) {
    return `
      <section class="mb-6 last:mb-0">
        <h3 class="font-semibold text-sm flex items-center gap-2 mb-3">
          <i data-lucide="${esc(icoon)}" class="w-4 h-4 text-primary"></i> ${esc(titel)}
        </h3>
        <div class="border border-base-200 rounded-box p-4">${inhoud}</div>
      </section>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIES
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleCalendlyAction(action, btn) {
    if (bezig) return;

    // Verbinding-brede acties (subscribe/unsubscribe/ververs de verbinding
    // zelf) horen bij de gedeelde module -- hier enkel doorsturen.
    if (action === 'calendly-subscribe' || action === 'calendly-unsubscribe' || action === 'calendly-conn-refresh') {
      await window.FSV2.handleCalendlyConnectionAction(action, btn);
      return;
    }

    if (action === 'calendly-save-integration') {
      var sel = document.getElementById('calendlyEventType');
      var odooSel = document.getElementById('calendlyOdooEventType');
      var gekozen = sel ? sel.options[sel.selectedIndex] : null;

      await metKnop(btn, 'Opslaan…', async function () {
        await window.FSV2.api('/integrations/' + S().activeId + '/calendly', {
          method: 'PUT',
          body: JSON.stringify({
            event_type_uri: sel ? sel.value : '',
            event_type_name: gekozen ? (gekozen.dataset.name || '') : '',
            pooling_type: gekozen ? (gekozen.dataset.pooling || '') : '',
            locale: gekozen ? (gekozen.dataset.locale || '') : '',
            odoo_event_type_id: odooSel ? odooSel.value : '',
          }),
        });
        window.FSV2.showAlert('Opgeslagen.', 'success');
        // De koppeling opnieuw openen: de vaste stap is net herbouwd en die
        // hoort meteen op het tabblad Koppeling te staan.
        await window.FSV2.openDetail(S().activeId);
        await laadCalendlyTab(true);
      });
      return;
    }

    if (action === 'calendly-rebuild') {
      await metKnop(btn, 'Bezig…', async function () {
        await window.FSV2.api('/integrations/' + S().activeId + '/calendly/rebuild', { method: 'POST' });
        window.FSV2.showAlert('Vaste stap opnieuw opgebouwd.', 'success');
        await window.FSV2.openDetail(S().activeId);
      });
      return;
    }
  }

  async function metKnop(btn, tekst, fn) {
    bezig = true;
    var origineel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = tekst; }
    try {
      await fn();
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    } finally {
      bezig = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = origineel; }
    }
  }

  /** Bij het openen van een andere koppeling alles vergeten. */
  function resetCalendlyTab() {
    eventTypes = null;
    odooEventTypes = null;
    koppelingConfig = null;
  }

  Object.assign(window.FSV2, {
    laadCalendlyTab: laadCalendlyTab,
    renderCalendlyTab: renderCalendlyTab,
    handleCalendlyAction: handleCalendlyAction,
    resetCalendlyTab: resetCalendlyTab,
  });
}());
