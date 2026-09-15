/**
 * Koppelingen — het Calendly-tabblad van het detailscherm.
 *
 * Drie blokken, in deze volgorde, omdat dat de volgorde is waarin het misgaat:
 *
 *   1. DE VERBINDING. Module-breed, niet per koppeling: er is één
 *      webhook-subscription bij Calendly voor alle Calendly-koppelingen samen
 *      (Calendly kan een subscription niet op eventtype filteren). Dit blok
 *      staat bewust bovenaan op élke Calendly-koppeling en niet weggestopt in
 *      Instellingen: staat de aanmelding er niet, dan komt er geen enkele
 *      boeking binnen, en dat is het eerste wat je wil zien als je hier komt
 *      kijken waarom er niets gebeurt.
 *   2. WELK EVENTTYPE deze koppeling opvangt, en als welk type het in Odoo
 *      terechtkomt.
 *   3. WAT DE VASTE STAP DOET. Alleen-lezen: die stap is niet instelbaar.
 *
 * Alle HTML met ES6 template literals, geen string-concatenatie -- de
 * coderegel van deze module.
 */

(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };
  function S() { return window.FSV2.S; }

  // Wordt gevuld door laadCalendlyTab(); leeg tot het tabblad voor het eerst
  // geopend wordt, zodat het openen van een koppeling geen drie extra
  // API-aanroepen kost voor een tabblad dat je misschien niet bekijkt.
  var status = null;
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
    if (status && !opnieuw) { renderCalendlyTab(); return; }

    var id = S().activeId;
    renderCalendlyTab({ laden: true });

    try {
      var statusRes = await window.FSV2.api('/calendly/status');
      status = statusRes.data || null;
    } catch (err) {
      status = { error: err.message };
    }

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
      ${verbindingsBlok()}
      ${eventTypeBlok()}
      ${vasteStapBlok()}
    `;

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: host });
  }

  // ── 1. Verbinding ──────────────────────────────────────────────────────────

  function verbindingsBlok() {
    if (!status) {
      return kaart('Verbinding met Calendly', 'plug',
        `<p class="text-sm text-base-content/60">Nog niet geladen.</p>`);
    }

    if (status.error) {
      return kaart('Verbinding met Calendly', 'plug', `
        <div class="alert alert-error text-sm"><i data-lucide="alert-triangle" class="w-4 h-4"></i>
          <span>${esc(status.error)}</span></div>`);
    }

    if (!status.token_configured) {
      return kaart('Verbinding met Calendly', 'plug', `
        <div class="alert alert-warning text-sm items-start">
          <i data-lucide="key-round" class="w-4 h-4 mt-0.5"></i>
          <div>
            <p class="font-semibold">Er is nog geen Calendly-token.</p>
            <p class="mt-1">${esc(status.note || '')}</p>
            <p class="mt-1 text-xs opacity-80">Een token maak je in Calendly bij Integrations → API &amp; webhooks → Personal access tokens.</p>
          </div>
        </div>`);
    }

    var gezondheid = status.health;
    var gebruiker = status.user || {};

    var melding = gezondheid === 'ok'
      ? `<div class="alert alert-success text-sm items-start">
           <i data-lucide="check-circle-2" class="w-4 h-4 mt-0.5"></i>
           <div>
             <p class="font-semibold">Aangemeld en actief bij Calendly.</p>
             <p class="mt-0.5">Boekingen, verplaatsingen en annulaties komen binnen op deze OM.</p>
           </div>
         </div>`
      : gezondheid === 'missing_at_calendly'
        ? `<div class="alert alert-error text-sm items-start">
             <i data-lucide="alert-triangle" class="w-4 h-4 mt-0.5"></i>
             <div>
               <p class="font-semibold">De OM denkt dat er een aanmelding is, maar Calendly kent ze niet.</p>
               <p class="mt-0.5">Er komt op dit moment géén enkele boeking binnen. Klik op “Opnieuw aanmelden”.</p>
             </div>
           </div>`
        : `<div class="alert alert-warning text-sm items-start">
             <i data-lucide="bell-off" class="w-4 h-4 mt-0.5"></i>
             <div>
               <p class="font-semibold">Nog niet aangemeld bij Calendly.</p>
               <p class="mt-0.5">Zolang dit niet gebeurd is, ontvangt geen enkele Calendly-koppeling iets.</p>
             </div>
           </div>`;

    return kaart('Verbinding met Calendly', 'plug', `
      ${melding}
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mt-3">
        <dt class="text-base-content/50">Account</dt>
        <dd class="font-medium">${esc(gebruiker.name || '—')}${gebruiker.email ? ` <span class="text-base-content/50">(${esc(gebruiker.email)})</span>` : ''}</dd>
        <dt class="text-base-content/50">Ontvangst-URL</dt>
        <dd class="font-mono text-xs break-all">${esc(status.webhook_url || '')}</dd>
        <dt class="text-base-content/50">Gebeurtenissen</dt>
        <dd class="font-mono text-xs">${esc((status.events || []).join(', '))}</dd>
        <dt class="text-base-content/50">Koppelingen</dt>
        <dd>${esc(String(status.integration_count || 0))} Calendly-koppeling(en)</dd>
      </dl>

      <div class="flex flex-wrap gap-2 mt-4">
        <button type="button" class="btn btn-sm ${gezondheid === 'ok' ? 'btn-outline' : 'btn-primary'}"
                data-action="calendly-subscribe">
          <i data-lucide="link" class="w-4 h-4"></i>
          ${gezondheid === 'ok' ? 'Opnieuw aanmelden' : 'Aanmelden bij Calendly'}
        </button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="calendly-refresh">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Verversen
        </button>
        ${status.subscription ? `
          <button type="button" class="btn btn-sm btn-ghost text-error" data-action="calendly-unsubscribe">
            <i data-lucide="unlink" class="w-4 h-4"></i> Afmelden
          </button>` : ''}
      </div>

      <p class="text-xs text-base-content/50 mt-2">
        Opnieuw aanmelden maakt een nieuwe ondertekeningssleutel. Boekingen die op dat moment
        onderweg zijn blijven werken — de vorige sleutels blijven bewaard.
      </p>
    `);
  }

  // ── 2. Welk eventtype ──────────────────────────────────────────────────────

  function eventTypeBlok() {
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
            return `<option value="${esc(t.uri)}" ${t.uri === huidig ? 'selected' : ''}
                            data-name="${esc(t.name)}"
                            data-pooling="${esc(t.pooling_type || '')}"
                            data-locale="${esc(t.locale || '')}">
              ${esc(t.name)}${t.active ? '' : ' (niet actief)'}${t.duration ? ' — ' + esc(String(t.duration)) + ' min' : ''}
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

    return kaart('Welke afspraken vangt deze koppeling op?', 'calendar-check', `
      <label class="form-control mb-3">
        <span class="label label-text text-xs">Calendly-eventtype</span>
        ${keuzeHtml}
        <span class="label"><span class="label-text-alt text-base-content/50">
          Eén eventtype hoort bij één koppeling. Laat je dit op “vangnet” staan, dan komt alles
          hier terecht waarvoor geen andere koppeling bestaat.
        </span></span>
      </label>

      <label class="form-control mb-3">
        <span class="label label-text text-xs">Type in Odoo <span class="text-base-content/50">— vult 📋 Type op de meeting</span></span>
        ${odooHtml}
        <span class="label"><span class="label-text-alt text-base-content/50">
          Odoo-automatisering 12 maakt enkel een lead aan bij het type <strong>Demo</strong>.
          Staat dit op “Anders”, dan gebeurt er in Odoo niets extra.
        </span></span>
      </label>

      <button type="button" class="btn btn-primary btn-sm" data-action="calendly-save-integration">
        <i data-lucide="save" class="w-4 h-4"></i> Opslaan
      </button>
    `);
  }

  // ── 3. De vaste stap ───────────────────────────────────────────────────────

  function vasteStapBlok() {
    return kaart('Wat er sowieso gebeurt', 'lock', `
      <p class="text-sm text-base-content/70 mb-3">
        Elke Calendly-koppeling begint met dezelfde vaste stap. Die is niet instelbaar en
        niet te verwijderen; wat je er zelf aan hangt wel.
      </p>
      <ol class="text-sm space-y-2">
        <li class="flex gap-2">
          <span class="badge badge-sm badge-neutral shrink-0 mt-0.5">1</span>
          <span><strong>Contact opzoeken op e-mail</strong> — bestaat de aanvrager nog niet in Odoo,
          dan wordt hij aangemaakt. Dat is juist de boeking waar het om gaat.</span>
        </li>
        <li class="flex gap-2">
          <span class="badge badge-sm badge-neutral shrink-0 mt-0.5">2</span>
          <span><strong>Host opzoeken bij de medewerkers</strong> op het werk-e-mailadres.
          Niet gevonden? Dan gaat de afspraak gewoon door zonder host.</span>
        </li>
        <li class="flex gap-2">
          <span class="badge badge-sm badge-neutral shrink-0 mt-0.5">3</span>
          <span><strong>De afspraak naar <code class="text-xs">x_calendlymeeting</code></strong>, bijgewerkt
          op het Calendly-event-id. Aanmaken, verplaatsen en annuleren komen alle drie hier binnen.</span>
        </li>
      </ol>
      <div class="alert alert-info text-xs items-start mt-3">
        <i data-lucide="info" class="w-4 h-4 mt-0.5"></i>
        <span>Verplaatst iemand zijn afspraak, dan maakt Calendly daar een <em>nieuwe</em> afspraak van
        en annuleert de oude. Je ziet dus twee meetings in Odoo, waarvan de oude op “geannuleerd” staat.
        Dat is Calendly's eigen model — de Zapier-koppeling deed hetzelfde.</span>
      </div>
      <p class="text-xs text-base-content/50 mt-3">
        Extra stappen (lead aanmaken, notitie posten, mail versturen) zet je op het tabblad
        <strong>Koppeling</strong>. Die kunnen via “vorige stap” aan het meeting-record.
      </p>
      <button type="button" class="btn btn-ghost btn-xs mt-2" data-action="calendly-rebuild">
        <i data-lucide="wrench" class="w-3.5 h-3.5"></i> Vaste stap opnieuw opbouwen
      </button>
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

    if (action === 'calendly-refresh') {
      await laadCalendlyTab(true);
      return;
    }

    if (action === 'calendly-subscribe') {
      await metKnop(btn, 'Aanmelden…', async function () {
        await window.FSV2.api('/calendly/subscribe', { method: 'POST' });
        window.FSV2.showAlert('Aangemeld bij Calendly. Boekingen komen vanaf nu binnen.', 'success');
        await laadCalendlyTab(true);
      });
      return;
    }

    if (action === 'calendly-unsubscribe') {
      if (!confirm('Afmelden bij Calendly?\n\nVanaf dat moment komt er geen enkele boeking meer binnen, voor geen enkele Calendly-koppeling. De koppelingen zelf blijven staan.')) return;
      await metKnop(btn, 'Afmelden…', async function () {
        await window.FSV2.api('/calendly/subscription', { method: 'DELETE' });
        window.FSV2.showAlert('Afgemeld bij Calendly.', 'success');
        await laadCalendlyTab(true);
      });
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
    status = null;
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
