/**
 * Mini-apps die een gewone module geworden zijn. Wie zo'n mini-app opent
 * (een oude link, een bladwijzer, de kaart in de lijst), komt in de module
 * terecht. De mini-app en haar opslag blijven bestaan als back-up.
 *
 *   mini-app-id -> route van de module
 */
export const VERHUISDE_APPS = {
  // Regio's -> src/modules/regios (2026-10-22)
  '0913f371-1d50-47a6-9706-d39ef50beb43': '/regios',
};

export function verhuisdNaar(appId) {
  return Object.prototype.hasOwnProperty.call(VERHUISDE_APPS, appId) ? VERHUISDE_APPS[appId] : null;
}
