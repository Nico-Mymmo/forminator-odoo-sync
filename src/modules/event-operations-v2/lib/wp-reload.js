/**
 * Event Operations v2 — Seintje naar WordPress na een schrijfactie.
 *
 * De WordPress-plugin (mymmo-events) cachet de publieke API 60s lang aan
 * haar eigen kant (WP-transients, los van de KV-cache hierboven in
 * cache.js). Zonder dit bestand moet een bezoeker die kijkt tijdens het
 * publiceren of wijzigen van een event dus tot 60s wachten -- ook al is
 * de Worker zelf al meteen bijgewerkt (invalidateEvents() hierboven).
 *
 * pushWpReload() belt na elke schrijfactie de /wp-json/mymmo-events/v1/
 * reload-URL('s) van de gekoppelde WordPress-site(s), zodat hun cache
 * meteen leeg is in plaats van pas na de TTL. Dit is bewust een fire-and-
 * forget seintje, geen afhankelijkheid:
 *
 *  - EVENTS_WP_RELOAD_WEBHOOKS ontbreekt of is leeg: er gebeurt gewoon
 *    niets. Geen WordPress-site gekoppeld is een geldige toestand, geen
 *    fout.
 *  - Een aanroep mislukt (timeout, 4xx/5xx, DNS): enkel een console.warn.
 *    Odoo blijft de enige bron van waarheid; de WP-cache verloopt hoe dan
 *    ook vanzelf na mymmo_events_cache_ttl (standaard 60s) als dit seintje
 *    om welke reden dan ook niet aankomt.
 *  - Met ctx.waitUntil() beschikbaar (een echt request) loopt dit NA de
 *    respons, zodat de gebruiker in Event Operations niet op WordPress
 *    hoeft te wachten. Zonder ctx (bv. een test of een cron-achtige
 *    aanroep) wordt er wel op gewacht, anders zou de aanroep afgebroken
 *    worden zodra de omgeving stopt.
 *
 * EVENTS_WP_RELOAD_WEBHOOKS is een kommagescheiden lijst van volledige
 * URL's, elk al met zijn eigen ?token= (het token uit de instellingen-
 * pagina van elke WordPress-site, "Instellingen → Mymmo Events" →
 * Reload-URL):
 *
 *   https://openvme.be/wp-json/mymmo-events/v1/reload?token=...,https://syndicoach.be/wp-json/mymmo-events/v1/reload?token=...
 *
 * Zet dit als Worker-secret (wrangler secret put EVENTS_WP_RELOAD_WEBHOOKS),
 * niet in wrangler.jsonc -- de tokens zijn geheimen.
 */

import { LOG_PREFIX } from '../constants.js';

const TIMEOUT_MS = 4000;

/**
 * @param {Object} env
 * @param {Object} [ctx] - Cloudflare ctx, om dit ná de respons te laten lopen.
 * @returns {Promise<void>}
 */
export async function pushWpReload(env, ctx) {
  const targets = String(env?.EVENTS_WP_RELOAD_WEBHOOKS || '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url !== '');

  if (targets.length === 0) {
    console.log(`${LOG_PREFIX} wp-reload: geen EVENTS_WP_RELOAD_WEBHOOKS ingesteld, overgeslagen`);
    return;
  }

  console.log(`${LOG_PREFIX} wp-reload: ${targets.length} site(s) verwittigen (${ctx && typeof ctx.waitUntil === 'function' ? 'op de achtergrond' : 'synchroon, geen ctx'})`);

  const run = () => Promise.all(targets.map((url) => pingOne(url)));

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(run());
    return;
  }

  await run();
}

/** @param {string} url */
async function pingOne(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (response.ok) {
      console.log(`${LOG_PREFIX} wp-reload: ${safeHost(url)} OK (${response.status})`);
    } else {
      console.warn(`${LOG_PREFIX} wp-reload: ${safeHost(url)} antwoordde met ${response.status}`);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} wp-reload: ${safeHost(url)} mislukt: ${error?.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Nooit het token meeloggen -- enkel de host, voor herkenbare logs. */
function safeHost(url) {
  try {
    return new URL(url).host;
  } catch (error) {
    return '(ongeldige URL)';
  }
}
