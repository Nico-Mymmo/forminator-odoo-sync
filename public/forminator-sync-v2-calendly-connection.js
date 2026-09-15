/**
 * Koppelingen — de Calendly-VERBINDING, module-breed en dus los van elke
 * individuele koppeling.
 *
 * Er is één webhook-subscription bij Calendly voor de hele module (Calendly
 * kan een subscription niet op eventtype filteren -- zie calendly/client.js).
 * Deze status hoort dus maar ÉÉN keer beheerd te worden, niet per koppeling.
 *
 * Twee weergaven van dezelfde staat:
 *   - VOLLEDIG (renderCalendlyConnectieKaart): in Instellingen → Verbindingen,
 *     naast de WordPress-sites. Hier zitten de knoppen (aanmelden/verversen/
 *     afmelden) en het volledige detail (account, webhook-URL, gebeurtenissen).
 *   - COMPACT (renderCalendlyConnectieCompact): één statusregel bovenaan elke
 *     Calendly-koppeling, met een link naar Verbindingen. Een kapotte
 *     verbinding laat NAMELIJK alle Calendly-koppelingen tegelijk stilvallen,
 *     dus dat moet je meteen zien op elk scherm waar je toch al aan het
 *     kijken bent -- zonder daarvoor het volledige beheerblok te herhalen.
 *
 * Beide mountpoints worden na elke statuswijziging herrekend
 * (renderCalendlyConnectieAlles), ongeacht welke van de twee de wijziging
 * veroorzaakte.
 */
(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };

  var status = null;
  var bezig = false;

  // ═══════════════════════════════════════════════════════════════════════════
  // LADEN
  // ═══════════════════════════════════════════════════════════════════════════

  async function laadCalendlyConnectie(forceer) {
    if (status && !forceer) { renderCalendlyConnectieAlles(); return; }

    renderCalendlyConnectieAlles({ laden: true });

    try {
      var res = await window.FSV2.api('/calendly/status');
      status = res.data || null;
    } catch (err) {
      status = { error: err.message };
    }

    renderCalendlyConnectieAlles();
  }

  function huidigeStatus() { return status; }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEKENEN
  // ═══════════════════════════════════════════════════════════════════════════

  function renderCalendlyConnectieAlles(opties) {
    var kaartHost = document.getElementById('calendlyConnectionCard');
    if (kaartHost) kaartHost.innerHTML = renderCalendlyConnectieKaart(opties);

    var compactHost = document.getElementById('calendlyConnectionCompact');
    if (compactHost) compactHost.innerHTML = renderCalendlyConnectieCompact(opties);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      if (kaartHost) lucide.createIcons({ context: kaartHost });
      if (compactHost) lucide.createIcons({ context: compactHost });
    }
  }

  /** Volledig beheerblok — Instellingen → Verbindingen. */
  function renderCalendlyConnectieKaart(opties) {
    if (opties && opties.laden) {
      return `<div class="flex items-center gap-2 text-sm text-base-content/60 py-6 justify-center">
        <span class="loading loading-spinner loading-sm"></span> Calendly wordt gelezen…
      </div>`;
    }

    if (!status) return `<p class="text-sm text-base-content/60">Nog niet geladen.</p>`;

    if (status.error) {
      return `<div class="alert alert-error text-sm"><i data-lucide="alert-triangle" class="w-4 h-4"></i>
        <span>${esc(status.error)}</span></div>`;
    }

    if (!status.token_configured) {
      return `<div class="alert alert-warning text-sm items-start">
        <i data-lucide="key-round" class="w-4 h-4 mt-0.5"></i>
        <div>
          <p class="font-semibold">Er is nog geen Calendly-token.</p>
          <p class="mt-1">${esc(status.note || '')}</p>
          <p class="mt-1 text-xs opacity-80">Een token maak je in Calendly bij Integrations → API &amp; webhooks → Personal access tokens.</p>
        </div>
      </div>`;
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
               <p class="mt-0.5">Er komt op dit moment géén enkele boeking binnen, voor geen enkele Calendly-koppeling. Klik op “Opnieuw aanmelden”.</p>
             </div>
           </div>`
        : `<div class="alert alert-warning text-sm items-start">
             <i data-lucide="bell-off" class="w-4 h-4 mt-0.5"></i>
             <div>
               <p class="font-semibold">Nog niet aangemeld bij Calendly.</p>
               <p class="mt-0.5">Zolang dit niet gebeurd is, ontvangt geen enkele Calendly-koppeling iets.</p>
             </div>
           </div>`;

    return `
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
        <button type="button" class="btn btn-sm btn-ghost" data-action="calendly-conn-refresh">
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
    `;
  }

  /** Compacte statusregel — bovenaan elke Calendly-koppeling. */
  function renderCalendlyConnectieCompact(opties) {
    if (opties && opties.laden) {
      return `<div class="flex items-center gap-2 text-xs text-base-content/50">
        <span class="loading loading-spinner loading-xs"></span> Verbinding controleren…
      </div>`;
    }

    if (!status) return '';

    var config = {
      icoon: 'help-circle',
      klasse: 'text-base-content/50',
      tekst: 'Verbindingsstatus onbekend.',
    };

    if (status.error) {
      config = { icoon: 'alert-triangle', klasse: 'text-error', tekst: 'Fout: ' + status.error };
    } else if (!status.token_configured) {
      config = { icoon: 'key-round', klasse: 'text-warning', tekst: 'Geen Calendly-token ingesteld.' };
    } else if (status.health === 'ok') {
      config = { icoon: 'check-circle-2', klasse: 'text-success', tekst: 'Aangemeld en actief bij Calendly.' };
    } else if (status.health === 'missing_at_calendly') {
      config = { icoon: 'alert-triangle', klasse: 'text-error', tekst: 'Aanmelding bij Calendly ontbreekt — er komt niets binnen.' };
    } else {
      config = { icoon: 'bell-off', klasse: 'text-warning', tekst: 'Nog niet aangemeld bij Calendly.' };
    }

    return `<div class="flex items-center justify-between gap-3 text-sm ${config.klasse} bg-base-200/30 rounded-lg px-3 py-2 mb-4">
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="${esc(config.icoon)}" class="w-4 h-4 shrink-0"></i>
        <span class="truncate">${esc(config.tekst)}</span>
      </div>
      <button type="button" class="btn btn-ghost btn-xs shrink-0" data-action="goto-connections">
        Beheren <i data-lucide="arrow-right" class="w-3 h-3"></i>
      </button>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIES — enkel wat de VERBINDING zelf raakt (subscribe/unsubscribe/ververs)
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleCalendlyConnectionAction(action, btn) {
    if (bezig) return;

    if (action === 'calendly-conn-refresh') {
      await laadCalendlyConnectie(true);
      return;
    }

    if (action === 'calendly-subscribe') {
      await metKnop(btn, 'Aanmelden…', async function () {
        await window.FSV2.api('/calendly/subscribe', { method: 'POST' });
        window.FSV2.showAlert('Aangemeld bij Calendly. Boekingen komen vanaf nu binnen.', 'success');
        await laadCalendlyConnectie(true);
      });
      return;
    }

    if (action === 'calendly-unsubscribe') {
      if (!confirm('Afmelden bij Calendly?\n\nVanaf dat moment komt er geen enkele boeking meer binnen, voor geen enkele Calendly-koppeling. De koppelingen zelf blijven staan.')) return;
      await metKnop(btn, 'Afmelden…', async function () {
        await window.FSV2.api('/calendly/subscription', { method: 'DELETE' });
        window.FSV2.showAlert('Afgemeld bij Calendly.', 'success');
        await laadCalendlyConnectie(true);
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

  Object.assign(window.FSV2, {
    laadCalendlyConnectie: laadCalendlyConnectie,
    huidigeCalendlyConnectieStatus: huidigeStatus,
    renderCalendlyConnectieAlles: renderCalendlyConnectieAlles,
    handleCalendlyConnectionAction: handleCalendlyConnectionAction,
  });
}());
