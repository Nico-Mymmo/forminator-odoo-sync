/**
 * Dashboards — tab "Kaart": de aanvragen van ALLE koppelingen met een
 * postcodeveld, met aan/uit per koppeling.
 *
 * Het tekenen zelf staat in public/aanvragen-kaart.js; dat component tekent
 * ook het tabblad Kaart van één koppeling. Hier staat enkel waar de data
 * vandaan komt (GET /dashboards/api/aanvragen-kaart) en wanneer het tabblad
 * zichtbaar wordt.
 */
(function () {
  'use strict';

  var paneel = document.querySelector('[data-dash-panel="kaart"]');
  var host = document.getElementById('dashKaart');
  if (!paneel || !host || !window.OMAanvragenKaart) return;

  var kaart = null;

  async function laad(periode) {
    var res = await fetch('/dashboards/api/aanvragen-kaart?period=' + encodeURIComponent(periode), {
      credentials: 'include', cache: 'no-store'
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet ingelogd'); }
    var body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || ('HTTP ' + res.status));
    return body.data;
  }

  function zichtbaar() { return !paneel.classList.contains('hidden'); }

  function opTonen() {
    if (!kaart) {
      kaart = window.OMAanvragenKaart.maak(host, {
        laad: laad,
        koppelingenFilter: true,
        leegTekst: 'Nog geen koppeling met een postcodeveld. Voeg in een formulier (Koppelingen → tabblad ' +
          'Formulier) een veld <strong>Postcode</strong> toe; de aanvragen van die koppeling komen dan ' +
          'vanzelf op deze kaart.'
      });
    }
    kaart.toon();
  }

  // Wie het tabblad toont, maakt niet uit (dashboards-web.js beheert de
  // tabbladen); hier wordt enkel gekeken of het paneel zichtbaar werd.
  new MutationObserver(function () { if (zichtbaar()) opTonen(); })
    .observe(paneel, { attributes: true, attributeFilter: ['class'] });
  if (zichtbaar()) opTonen();
})();
