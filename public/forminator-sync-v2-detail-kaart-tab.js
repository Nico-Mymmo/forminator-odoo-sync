/**
 * Koppelingen — tabblad "Kaart": waar komen de aanvragen van DEZE koppeling
 * vandaan.
 *
 * Het tabblad bestaat enkel als het formulier van de koppeling een veld van het
 * type Postcode heeft: controleerKaartTab() vraagt dat na bij het openen van
 * de koppeling en na het bewaren van het formulier (er kan net een postcodeveld
 * bijgekomen of weggegaan zijn). Zonder postcodeveld zou het een lege kaart
 * zijn, en een tabblad dat altijd leeg is leest als een storing.
 *
 * Het tekenen staat in public/aanvragen-kaart.js -- hetzelfde component als de
 * kaart over alle koppelingen in Dashboards. De data komt van
 * GET /api/integrations/:id/aanvragen-kaart, dezelfde serverfunctie als daar,
 * op één koppeling.
 *
 * Eigen bestand, zelfde afspraak als de rest van de module (export via
 * window.FSV2.*, cross-file calls altijd als window.FSV2.naam()).
 */
(function () {
  'use strict';

  function S() { return window.FSV2.S; }

  var kaart = null;
  var kaartVoor = null;

  function ruimOp() {
    if (kaart) kaart.verwijder();
    kaart = null;
    kaartVoor = null;
  }

  /** Het tabblad tonen of verbergen, naargelang het formulier een postcodeveld heeft. */
  async function controleerKaartTab(id) {
    var integrationId = id || S().activeId;
    var knop = document.getElementById('detailTabKaartBtn');
    if (!knop || !integrationId) return;

    // Een kaart van een ANDERE koppeling hoort hier niet meer te staan.
    if (kaartVoor && kaartVoor !== integrationId) ruimOp();

    var heeft = false;
    try {
      var res = await window.FSV2.api(`/integrations/${integrationId}/postcode-velden`);
      heeft = Array.isArray(res && res.data) && res.data.length > 0;
    } catch (_) {
      heeft = false;
    }
    if (S().activeId !== integrationId) return;

    knop.style.display = heeft ? '' : 'none';
    var actief = knop.classList.contains('tab-active');
    if (actief && !heeft) {
      // Stond het tabblad open en is er geen postcodeveld (meer): naar Indieningen.
      var indieningen = document.querySelector('[data-detail-tab="history"]');
      if (indieningen) indieningen.click();
    } else if (actief && heeft) {
      renderDetailKaart();
    }
  }

  /** Bij het openen van het tabblad (bootstrap.js). */
  function renderDetailKaart() {
    var host = document.getElementById('detailKaart');
    var integrationId = S().activeId;
    if (!host || !integrationId || !window.OMAanvragenKaart) return;

    if (kaart && kaartVoor !== integrationId) ruimOp();
    if (!kaart) {
      kaartVoor = integrationId;
      kaart = window.OMAanvragenKaart.maak(host, {
        laad: function (periode) {
          return window.FSV2.api(`/integrations/${integrationId}/aanvragen-kaart?period=${encodeURIComponent(periode)}`)
            .then(function (r) { return r && r.data; });
        },
        koppelingenFilter: false,
        leegTekst: 'Het formulier van deze koppeling heeft geen veld van het type <strong>Postcode</strong>.'
      });
    }
    kaart.toon();
  }

  Object.assign(window.FSV2, {
    controleerKaartTab: controleerKaartTab,
    renderDetailKaart: renderDetailKaart
  });
})();
