/**
 * WordPress Client Wrapper
 * 
 * Two-step publication flow (Tribe + Core endpoints)
 */

import { WP_ENDPOINTS, WP_META_KEYS, LOG_PREFIX, EMOJI } from './constants.js';
import { getOdooWebinar } from './odoo-client.js';
import { mapOdooToWordPress } from './mapping.js';
import { getSupabaseAdminClient } from './lib/supabaseClient.js';

/**
 * Build Basic Auth header from WP_API_TOKEN (format: "username:password")
 * 
 * @param {Object} env
 * @returns {string} Authorization header value
 */
function wpAuthHeader(env) {
  return `Basic ${btoa(env.WP_API_TOKEN)}`;
}

/**
 * Get all WordPress events
 * 
 * @param {Object} env
 * @returns {Promise<Array>}
 */
export async function getWordPressEvents(env) {
  const response = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}?per_page=100`,
    {
      headers: {
        'Authorization': wpAuthHeader(env)
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Get WordPress events via Core REST API (includes meta fields)
 * 
 * Used by sync to match on odoo_webinar_id meta.
 * Tribe API does NOT return meta — Core API does.
 * 
 * @param {Object} env
 * @returns {Promise<Array>} Array of WP event objects with .meta
 */
export async function getWordPressEventsWithMeta(env) {
  const response = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.WP_EVENTS}?per_page=100`,
    {
      headers: {
        'Authorization': wpAuthHeader(env)
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`WordPress Core API error: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Publish Odoo webinar to WordPress (two-step flow)
 * 
 * Step 1: POST Tribe Events endpoint → creates event
 * Step 2: POST Core endpoint → adds meta (odoo_webinar_id)
 * Step 3: Save snapshot to Supabase
 * 
 * @param {Object} env - Cloudflare env
 * @param {string} userId - Auth user ID
 * @param {number} odooWebinarId - Odoo x_webinar ID
 * @returns {Promise<{ wp_event_id: number, computed_state: string }>}
 */
export async function publishToWordPress(env, userId, odooWebinarId) {
  // 1. Fetch Odoo webinar
  console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Fetching Odoo webinar ${odooWebinarId}...`);
  const odooWebinar = await getOdooWebinar(env, odooWebinarId);
  
  // 2. Map to WordPress payload
  const wpPayload = mapOdooToWordPress(odooWebinar);
  console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Mapped payload:`, JSON.stringify(wpPayload));
  
  // 3. Step 1: POST to Tribe Events endpoint
  console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Step 1: Creating Tribe event...`);
  const tribeResponse = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}`,
    {
      method: 'POST',
      headers: {
        'Authorization': wpAuthHeader(env),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(wpPayload)
    }
  );
  
  if (!tribeResponse.ok) {
    const errorBody = await tribeResponse.text();
    throw new Error(`Tribe API error ${tribeResponse.status}: ${errorBody}`);
  }
  
  const tribeData = await tribeResponse.json();
  const wpEventId = tribeData.id;
  
  if (!wpEventId) {
    throw new Error('Tribe API returned no event ID');
  }
  
  console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Tribe event created: ID ${wpEventId}`);
  
  // 4. Step 2: POST meta to Core endpoint
  console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Step 2: Setting meta on WP event ${wpEventId}...`);
  const metaResponse = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.WP_EVENTS}/${wpEventId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': wpAuthHeader(env),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meta: {
          [WP_META_KEYS.ODOO_WEBINAR_ID]: String(odooWebinarId)
        }
      })
    }
  );
  
  if (!metaResponse.ok) {
    const errorBody = await metaResponse.text();
    console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Meta update failed: ${errorBody}`);
    // Don't throw — event was created, meta is best-effort
  } else {
    console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Meta set on WP event ${wpEventId}`);
  }
  
  // 5. Save snapshot to Supabase
  console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Saving snapshot to Supabase...`);
  await saveSnapshot(env, userId, odooWebinar, wpEventId);
  
  return {
    wp_event_id: wpEventId,
    computed_state: 'published'
  };
}

/**
 * Save/upsert snapshot to Supabase
 * 
 * Uses unique constraint on (user_id, odoo_webinar_id) for upsert
 * 
 * @param {Object} env
 * @param {string} userId
 * @param {Object} odooWebinar - Full Odoo record
 * @param {number} wpEventId - WordPress event ID
 */
async function saveSnapshot(env, userId, odooWebinar, wpEventId) {
  const supabase = await getSupabaseAdminClient(env);
  
  const { error } = await supabase
    .from('webinar_snapshots')
    .upsert({
      user_id: userId,
      odoo_webinar_id: odooWebinar.id,
      odoo_snapshot: odooWebinar,
      wp_snapshot: { id: wpEventId },
      computed_state: 'published',
      last_synced_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,odoo_webinar_id'
    });
  
  if (error) {
    throw new Error(`Supabase snapshot error: ${error.message}`);
  }
  
  console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Snapshot saved for webinar ${odooWebinar.id}`);
}
