/**
 * Event Operations v2 -- Oude WP-pagina's opsporen
 *
 * De legacy event-operations-module (v1) publiceert Odoo-webinars als
 * WordPress Tribe Events-berichten, met het Odoo-id in de post-meta
 * (odoo_webinar_id). Sinds v2 daarnaast events publiceert via de
 * terugval-routing van de mymmo-events-plugin (zie
 * wp-plugin/mymmo-events/includes/class-router.php), kunnen sommige
 * events zowel een oude Tribe-pagina als een nieuwe v2-slug hebben.
 *
 * Dit bestand markeert enkel welke Odoo-events nog zo'n oude pagina
 * hebben -- het verwijdert niets. De gebruiker beslist zelf, per event,
 * of die oude pagina blijft staan of handmatig in WordPress verwijderd
 * wordt.
 *
 * Hergebruikt bewust de bestaande WP-koppeling van v1
 * (getWordPressEventsWithMeta, extractOdooWebinarId) in plaats van een
 * tweede WP-client te bouwen -- zelfde WORDPRESS_URL/WP_API_TOKEN,
 * zelfde meta-key.
 */

import { getWordPressEventsWithMeta } from '../../event-operations/wp-client.js';
import { extractOdooWebinarId } from '../../event-operations/mapping.js';
import { readThrough } from './cache.js';
import { CACHE_NS, CACHE_TTL, LOG_PREFIX } from '../constants.js';

/**
 * Map van Odoo-event-id -> info over de bestaande WP-pagina.
 *
 * @param {Object} env
 * @param {Object} [options]
 * @param {boolean} [options.bypassCache=false]
 * @returns {Promise<{ pages: Record<number, Object>, cached: boolean }>}
 */
export async function getLegacyWpPagesByEventId(env, { bypassCache = false } = {}) {
  const { value: pages, cached } = await readThrough(
    env,
    {
      namespace: CACHE_NS.WP_LEGACY_PAGES,
      parts: ['by-event-id'],
      ttlSeconds: CACHE_TTL.WP_LEGACY_PAGES,
      bypass: bypassCache
    },
    async () => {
      if (!env?.WORDPRESS_URL || !env?.WP_API_TOKEN) {
        console.warn(`${LOG_PREFIX} legacy-wp-pages: WORDPRESS_URL/WP_API_TOKEN ontbreken -- niets gecontroleerd`);
        return {};
      }

      let wpEvents;
      try {
        wpEvents = await getWordPressEventsWithMeta(env);
      } catch (error) {
        console.warn(`${LOG_PREFIX} legacy-wp-pages: WordPress niet bereikbaar (${error?.message}) -- geen markeringen deze ronde`);
        return {};
      }

      const map = {};
      for (const wpEvent of Array.isArray(wpEvents) ? wpEvents : []) {
        const odooId = extractOdooWebinarId(wpEvent.meta);
        if (!odooId) continue;

        // Bij (in theorie mogelijke) dubbele WP-berichten voor hetzelfde
        // Odoo-event wint het laatst verwerkte -- niet belangrijk voor een
        // markering, wel deterministisch.
        map[odooId] = {
          wp_id: wpEvent.id,
          status: wpEvent.status || null,
          title: wpEvent.title?.rendered || null,
          public_url: wpEvent.link || null,
          edit_url: `${env.WORDPRESS_URL.replace(/\/+$/, '')}/wp-admin/post.php?post=${wpEvent.id}&action=edit`
        };
      }

      return map;
    }
  );

  return { pages: pages || {}, cached };
}
