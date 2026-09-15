/**
 * Koppelingen — Calendly's vaste eerste stap, als kaart IN het tabblad
 * "Koppeling" (niet als eigen tabblad -- zie geschiedenis onderaan).
 *
 * Odoo-kant (bron van waarheid): src/modules/forminator-sync-v2/calendly/
 * system-step.js#ensureCalendlySystemSteps(). Die maakt/houdt DRIE dingen
 * bij, niet twee:
 *   1. Een RESOLVER (fs_v2_resolvers, resolver_type 'partner_by_email',
 *      create_if_missing: true) -- zoekt het contact op e-mail op, en maakt
 *      het aan als het nog niet bestaat. Bestaat het al, dan wordt het
 *      bestaande contact gebruikt. Dit was in de UI ONZICHTBAAR (de
 *      Koppeling-tab rendert enkel `targets`, nooit `resolvers`), vandaar de
 *      expliciete checklist hieronder -- niet een prozazin die je makkelijk
 *      overleest.
 *   2. De HOST-zoekstap (fs_v2_targets, label calendly_host, operation_type
 *      'search') op hr.employee.
 *   3. De MEETING-upsertstap (fs_v2_targets, label calendly_meeting) naar
 *      x_calendlymeeting.
 * Stap 2 en 3 zijn `is_system: true` targets en komen dus WEL uit de normale
 * targets-lijst; stapEenKaart() in dit bestand vervangt hun individuele
 * kaarten in forminator-sync-v2-detail-mapping-tab.js door één samengevoegde,
 * niet-bewerkbare kaart met daarin het enige dat je wél kan instellen: welk
 * Calendly-eventtype deze koppeling opvangt en als welk type het in Odoo
 * terechtkomt.
 *
 * GESCHIEDENIS: tot 2026-09 stond dit als apart tabblad "Calendly", met
 * daarin ook het volledige Calendly-verbindingsbeheer (aanmelden/verversen/
 * afmelden). Op feedback dat (a) de verbinding module-breed is en dus maar
 * één keer thuishoort (nu in Instellingen → Verbindingen, zie
 * forminator-sync-v2-calendly-connection.js) en (b) deze eventtype-keuze
 * gewoon de configuratie van de vaste eerste pijplijnstap IS, is het aparte
 * tabblad hier verdwenen en zijn "Formulier" (bouwt een OM-formulier -- niet
 * van toepassing op een Calendly-bron) en "Calendly" allebei weg; enkel deze
 * kaart in "Koppeling" blijft over.
 *
 * Alle HTML met ES6 template literals, geen string-concatenatie -- de
 * coderegel van deze module (forminator-sync-v2-detail-mapping-tab.js zelf
 * is hierop een bestaande, oudere uitzondering; dit bestand niet).
 */

(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };
  function S() { return window.FSV2.S; }

  // Gevuld door laadCalendlyStapData(); leeg tot de koppeling geopend wordt.
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

  /**
   * Wordt aangeroepen vanuit openDetail() (forminator-sync-v2-detail-lifecycle.js)
   * zodra een Calendly-koppeling opent -- niet lazy achter een tabklik, want de
   * kaart hoort meteen in de Koppeling-tab te staan, die niet lazy is.
   */
  async function laadCalendlyStapData(integrationId, opnieuw) {
    if (koppelingConfig && !opnieuw) return;

    await window.FSV2.laadCalendlyConnectie(!!opnieuw);
    var status = window.FSV2.huidigeCalendlyConnectieStatus();

    if (status && status.token_configured) {
      try {
        var etRes = await window.FSV2.api('/calendly/event-types');
        eventTypes = etRes.data || [];
      } catch (err) {
        eventTypes = null;
      }
    }

    try {
      var oRes = await window.FSV2.api('/calendly/odoo-event-types');
      odooEventTypes = oRes.data || [];
    } catch (err) {
      odooEventTypes = null;
    }

    try {
      var cRes = await window.FSV2.api('/integrations/' + integrationId + '/calendly');
      koppelingConfig = cRes.data || null;
    } catch (err) {
      koppelingConfig = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEKENEN — één kaart, ingevoegd door renderDetailMappings()
  // ═══════════════════════════════════════════════════════════════════════════

  function renderCalendlyStapKaart() {
    if (!isCalendly()) return '';

    if (koppelingConfig === null && eventTypes === null && odooEventTypes === null) {
      return `<div class="card bg-base-100 border border-base-200 shadow-sm"><div class="card-body p-5">
        <span class="loading loading-spinner loading-sm"></span>
      </div></div>`;
    }

    var huidig = (koppelingConfig && koppelingConfig.event_type_uri) || '';
    var huidigOdoo = (koppelingConfig && koppelingConfig.odoo_event_type_id) || '';
    var status = window.FSV2.huidigeCalendlyConnectieStatus();

    var keuzeHtml;
    if (!status || !status.token_configured) {
      keuzeHtml = `<p class="text-sm text-base-content/50">Nog geen Calendly-verbinding. Stel die eerst in bij <a class="link" data-action="goto-connections">Instellingen → Verbindingen</a>.</p>`;
    } else if (eventTypes === null) {
      keuzeHtml = `<p class="text-sm text-base-content/50">De eventtypes zijn niet op te halen. Controleer de verbinding bij Instellingen.</p>`;
    } else if (!eventTypes.length) {
      keuzeHtml = `<p class="text-sm text-base-content/50">Dit Calendly-account heeft nog geen eventtypes.</p>`;
    } else {
      keuzeHtml = `
        <select id="calendlyEventType" class="select select-bordered select-sm w-full max-w-xl">
          <option value="">Vangnet — alles waarvoor geen eigen koppeling bestaat</option>
          ${eventTypes.map(function (t) {
            // Gedeelde/team-eventtypes (round robin, collective, ...) komen ook uit
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

    return `
      <div class="card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-0">
          <div class="px-5 py-4">
            <div class="flex items-start gap-3 mb-4">
              <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral text-neutral-content shrink-0">
                <i data-lucide="lock" class="w-4 h-4"></i>
              </span>
              <div class="min-w-0">
                <div class="font-bold text-base leading-snug">Vaste stap — Calendly</div>
                <p class="text-xs text-base-content/50 mt-0.5">Niet instelbaar; extra stappen hieronder wel.</p>
              </div>
            </div>

            <ul class="text-sm space-y-1.5 mb-4">
              <li class="flex gap-2">
                <i data-lucide="check" class="w-4 h-4 text-success shrink-0 mt-0.5"></i>
                <span><strong>Contact opzoeken op e-mailadres.</strong> Bestaat het al, dan wordt dat
                bestaande contact gebruikt. Bestaat het nog niet, dan wordt het aangemaakt — dat is
                juist de boeking waar het om gaat.</span>
              </li>
              <li class="flex gap-2">
                <i data-lucide="check" class="w-4 h-4 text-success shrink-0 mt-0.5"></i>
                <span><strong>Host opzoeken bij de medewerkers</strong> op het werk-e-mailadres. Niet
                gevonden? Dan gaat de afspraak gewoon door zonder host.</span>
              </li>
              <li class="flex gap-2">
                <i data-lucide="check" class="w-4 h-4 text-success shrink-0 mt-0.5"></i>
                <span><strong>Afspraak wegschrijven naar <code class="text-xs">x_calendlymeeting</code></strong> —
                aanmaken, verplaatsen en annuleren komen hier alle drie binnen.</span>
              </li>
            </ul>

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
          </div>
        </div>
      </div>
    `;
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
    laadCalendlyStapData: laadCalendlyStapData,
    renderCalendlyStapKaart: renderCalendlyStapKaart,
    handleCalendlyAction: handleCalendlyAction,
    resetCalendlyTab: resetCalendlyTab,
  });
}());
