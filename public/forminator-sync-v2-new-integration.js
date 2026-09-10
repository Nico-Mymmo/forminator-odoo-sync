/**
 * Koppelingen — een nieuwe koppeling starten.
 *
 * Er is precies één vraag te stellen: WAAR komt de data binnen? Drie
 * antwoorden -- een formulier dat we hier bouwen, een webhook van een ander
 * systeem, of een trackbare link. Daarna hoort alles op het detailscherm, want
 * daar staat het toch al.
 *
 * VERVANGT DE DRIESTAPPENWIZARD als ingang. Die bestond omdat een
 * Forminator-formulier op één specifieke WordPress-site staat: je moest eerst
 * de site kiezen en dan het formulier uit een lijst die de OM bij WordPress
 * ophaalde. Een OM-formulier heeft dat probleem niet -- het is
 * site-onafhankelijk (fs_v2_forms heeft geen site-kolom; allowed_sites leeg =
 * elke site), dus er valt niets te kiezen en de stappen zijn leeg werk.
 *
 * De wizard zelf is NIET verwijderd en blijft bereikbaar via de link onderaan
 * de dialoog (actie goto-wizard-legacy). Niet uit voorzichtigheid met code,
 * maar omdat een bestaande Forminator-koppeling nog steeds haar veldenlijst
 * moet kunnen verversen, en "nooit meer een nieuwe nodig" een sterkere claim
 * is dan we vandaag kunnen waarmaken. Mag dat pad weg, dan is dat één
 * wijziging in deze dialoog plus de branch in -bootstrap.js.
 */

(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };

  // window.FSV2.S is de state als object, niet als functie -- zelfde lokale
  // helper als in elk ander detail-bestand.
  function S() { return window.FSV2.S; }

  var SOORTEN = {
    form: {
      titel: 'Formulier',
      icoon: 'clipboard-list',
      kleur: 'text-primary',
      uitleg: 'Bouw het formulier hier en zet het met een shortcode op de website. Jij kiest de veldnamen, dus die zie je straks ook zo terug in de veldkoppelingen.',
      sourceType: 'om_form',
      tab: 'form',
    },
    webhook: {
      titel: 'Webhook',
      icoon: 'zap',
      kleur: 'text-warning',
      uitleg: 'Ontvang data van Zapier, n8n, Meta of een eigen systeem via een HTTP POST. Je krijgt een unieke URL met token.',
      sourceType: 'generic_webhook',
      tab: 'fields',
    },
    tracker: {
      titel: 'Trackbare link',
      icoon: 'qr-code',
      kleur: 'text-info',
      uitleg: 'Een korte link plus QR-code naar een bestaande pagina, met statistieken over scans en kliks. Geen formulier, geen Odoo-stappen.',
      sourceType: 'tracker',
      tab: 'stats',
    },
  };

  var keuze = 'form';

  // ═══════════════════════════════════════════════════════════════════════════
  // DIALOOG
  // ═══════════════════════════════════════════════════════════════════════════

  function openNewIntegrationDialog() {
    keuze = 'form';
    render();

    var dlg = document.getElementById('newIntegrationDialog');
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();

    var naam = document.getElementById('niName');
    if (naam) { naam.value = ''; naam.focus(); }
  }

  function render() {
    var host = document.getElementById('newIntegrationBody');
    if (!host) return;

    var spec = SOORTEN[keuze];

    host.innerHTML = `
      <div class="flex flex-col gap-1.5 mb-4">
        ${Object.keys(SOORTEN).map(function (sleutel) {
          var s = SOORTEN[sleutel];
          var actief = sleutel === keuze;
          return `
            <button type="button"
                    class="text-left border-2 rounded-box p-3 transition-colors ${actief ? 'border-primary bg-primary/5' : 'border-base-200 hover:border-base-300'}"
                    data-action="new-integration-pick" data-kind="${esc(sleutel)}">
              <div class="flex items-start gap-2.5">
                <i data-lucide="${actief ? 'check-circle' : s.icoon}" class="w-4 h-4 mt-0.5 shrink-0 ${actief ? 'text-primary' : s.kleur}"></i>
                <div>
                  <p class="font-semibold text-sm leading-tight">${esc(s.titel)}</p>
                  <p class="text-xs text-base-content/60 mt-0.5">${esc(s.uitleg)}</p>
                </div>
              </div>
            </button>`;
        }).join('')}
      </div>

      <label class="form-control mb-2">
        <span class="label label-text text-xs">Naam van de koppeling</span>
        <input id="niName" type="text" class="input input-bordered input-sm"
               placeholder="${keuze === 'tracker' ? 'Bijv. QR op de beurspanelen' : 'Bijv. Offerte technisch beheer'}">
      </label>

      ${keuze === 'tracker' ? `
        <label class="form-control mb-2">
          <span class="label label-text text-xs">Doel-URL <span class="text-base-content/50">— waar de link naartoe stuurt</span></span>
          <input id="niDestination" type="url" class="input input-bordered input-sm"
                 placeholder="https://openvme.be/events/">
        </label>` : ''}

      <p class="text-xs text-base-content/50 mt-1">
        ${keuze === 'form'
          ? 'Na het aanmaken kom je meteen in de formulierbouwer. Het formulier werkt op elke site waar de Mymmo Forms-plugin staat.'
          : keuze === 'webhook'
            ? 'Na het aanmaken vind je de webhook-URL op het detailscherm.'
            : 'Na het aanmaken vind je de korte link en de QR-code op het detailscherm.'}
      </p>`;

    var knop = document.getElementById('niCreateBtn');
    if (knop) knop.textContent = spec.titel + ' aanmaken';

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ context: host });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIES
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleNewIntegrationAction(action, btn) {
    if (action === 'new-integration-pick') {
      // De naam bewaren over een herrendering heen: hij staat boven de
      // soort-specifieke velden en het is vervelend als hij verdwijnt omdat je
      // van gedachten verandert.
      var huidigeNaam = (document.getElementById('niName') || {}).value || '';
      keuze = SOORTEN[btn.dataset.kind] ? btn.dataset.kind : 'form';
      render();
      var naamEl = document.getElementById('niName');
      if (naamEl) { naamEl.value = huidigeNaam; naamEl.focus(); }
      return;
    }

    if (action === 'new-integration-create') {
      await maakAan(btn);
      return;
    }
  }

  async function maakAan(btn) {
    var spec = SOORTEN[keuze];
    var naam = ((document.getElementById('niName') || {}).value || '').trim();

    if (!naam) {
      window.FSV2.showAlert('Geef de koppeling een naam.', 'error');
      var naamEl = document.getElementById('niName');
      if (naamEl) naamEl.focus();
      return;
    }

    var payload = { name: naam, source_type: spec.sourceType };

    if (keuze === 'tracker') {
      var doel = ((document.getElementById('niDestination') || {}).value || '').trim();
      if (!/^https:\/\//i.test(doel)) {
        window.FSV2.showAlert('De doel-URL moet met https:// beginnen.', 'error');
        return;
      }
      payload.destination_url = doel;
    } else {
      // Trackers hebben geen Odoo-verbinding nodig; de andere twee wel.
      payload.odoo_connection_id = 'default';
    }

    var origineel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Aanmaken…'; }

    try {
      var res = await window.FSV2.api('/integrations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      var dlg = document.getElementById('newIntegrationDialog');
      if (dlg && typeof dlg.close === 'function') dlg.close();

      // De lijst bijwerken zodat de nieuwe koppeling er straks in staat als je
      // teruggaat, en dan meteen door naar het detailscherm.
      await window.FSV2.loadIntegrations();
      await window.FSV2.openDetail(res.data.id);

      // Het juiste tabblad openen via een echte klik op de tabknop: die loopt
      // door de centrale listener in -bootstrap.js, die op zijn beurt de
      // render van dat tabblad aanroept. Zo staat de wetenschap over welk
      // tabblad wat rendert op één plek.
      var tabBtn = document.querySelector('[data-detail-tab="' + spec.tab + '"]');
      if (tabBtn) tabBtn.click();

      window.FSV2.showAlert(spec.titel + ' aangemaakt.', 'success');
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origineel; }
    }
  }

  Object.assign(window.FSV2, {
    openNewIntegrationDialog: openNewIntegrationDialog,
    handleNewIntegrationAction: handleNewIntegrationAction,
  });
}());
