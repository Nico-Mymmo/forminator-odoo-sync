/**
 * WordPress Client Wrapper
 * 
 * Two-step publication flow (Tribe + Core endpoints)
 */

import { WP_ENDPOINTS, WP_META_KEYS, LOG_PREFIX, EMOJI } from './constants.js';
import { getOdooWebinar } from './odoo-client.js';
import { mapOdooToWordPress } from './mapping.js';
import { getSupabaseAdminClient } from './lib/supabaseClient.js';
import { getEventTypeTagMappingByEventTypeId } from './tag-mapping.js';
import { buildEditorialDescription } from './editorial.js';

function resolveOdooEventTypeId(odooWebinar) {
  const relation = odooWebinar.x_webinar_event_type_id;

  if (!Array.isArray(relation) || relation.length === 0) {
    throw new Error(`Webinar ${odooWebinar.id} has no event type (x_webinar_event_type_id is missing)`);
  }

  const eventTypeId = Number(relation[0]);
  if (!Number.isInteger(eventTypeId) || eventTypeId <= 0) {
    throw new Error(`Webinar ${odooWebinar.id} has invalid event type ID in x_webinar_event_type_id`);
  }

  return eventTypeId;
}

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
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.WP_EVENTS}?per_page=100&status=publish,draft,private,pending`,
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
 * Get WordPress Event Categories (The Events Calendar taxonomy)
 * 
 * @param {Object} env
 * @returns {Promise<Array>} Array of taxonomy objects with id, name, slug, count
 */
export async function getWordPressEventCategories(env) {
  const response = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.WP_EVENT_CATEGORIES}?per_page=100`,
    {
      headers: {
        'Authorization': wpAuthHeader(env)
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`WordPress Event Categories API error: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Get single WordPress event by ID (via Tribe API)
 * 
 * @param {Object} env
 * @param {number} eventId - WordPress event ID
 * @returns {Promise<Object>} WordPress event object
 */
export async function getWordPressEvent(env, eventId) {
  const response = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}/${eventId}`,
    {
      headers: {
        'Authorization': wpAuthHeader(env)
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`WordPress Tribe API error: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Publish Odoo webinar to WordPress (two-step flow with update support)
 * 
 * First checks if a snapshot exists:
 * - If yes → UPDATE existing WordPress event
 * - If no → CREATE new WordPress event
 * 
 * Step 1: Check Supabase for existing snapshot
 * Step 2a: POST/PUT to Tribe Events endpoint (create/update event)
 * Step 2b: POST meta to Core endpoint (add odoo_webinar_id)
 * Step 3: Save snapshot to Supabase
 * 
 * @param {Object} env - Cloudflare env
 * @param {string} userId - Auth user ID
 * @param {number} odooWebinarId - Odoo x_webinar ID
 * @param {string} status - WordPress post status ('publish', 'draft', 'private')
 * @returns {Promise<{ wp_event_id: number, computed_state: string }>}
 */
export async function publishToWordPress(env, userId, odooWebinarId, status = 'publish') {
  // 1. Fetch Odoo webinar
  const odooWebinar = await getOdooWebinar(env, odooWebinarId);
  
  // 2. Check if snapshot exists (to determine create vs update)
  const supabase = await getSupabaseAdminClient(env);
  
  const { data: existingSnapshot } = await supabase
    .from('webinar_snapshots')
    .select('wp_snapshot, editorial_content')
    .eq('user_id', userId)
    .eq('odoo_webinar_id', odooWebinarId)
    .single();
  
  const existingWpEventId = existingSnapshot?.wp_snapshot?.id;
  
  // 3. Map to WordPress payload (with status)
  const wpPayload = mapOdooToWordPress(odooWebinar, status);

  // 3a. Add deterministic WP tag (Addendum C)
  const odooEventTypeId = resolveOdooEventTypeId(odooWebinar);
  const mapping = await getEventTypeTagMappingByEventTypeId(env, userId, odooEventTypeId);

  if (!mapping) {
    throw new Error(`Missing event type mapping for webinar ${odooWebinar.id}: odoo_event_type_id=${odooEventTypeId}`);
  }

  // The Events Calendar (Tribe V1) expects category slugs via `categories`
  // (string for single category, comma-separated for multiple).
  // Addendum C remains deterministic because mapping lookup is by event type -> single row.
  wpPayload.categories = mapping.wp_tag_slug;
  
  // 3b. Build description: use editorial content if present, else generate default (Odoo paragraph + form)
  let editorialContent = existingSnapshot?.editorial_content;
  let editorialContentToSave = null; // Track if we need to save new editorial content
  
  if (editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0) {
    // User has custom editorial content - use it
    const odooDescription = odooWebinar.x_studio_webinar_info || '';
    wpPayload.description = buildEditorialDescription(editorialContent, odooDescription);
  } else {
    // No editorial content - generate default: Odoo description paragraph + registration form
    const odooDescription = odooWebinar.x_studio_webinar_info || '';
    const defaultEditorial = {
      blocks: [
        { type: 'paragraph', content: odooDescription },
        { type: 'shortcode', name: 'forminator_form', attributes: { id: '14547' } }
      ],
      version: 1
    };
    wpPayload.description = buildEditorialDescription(defaultEditorial, odooDescription);
    editorialContentToSave = defaultEditorial;
  }
  
  let wpEventId;
  let wpEventData; // Store API response for snapshot
  
  console.log(`${LOG_PREFIX} 📤 Publish odoo=${odooWebinarId} status=${status} existingWpId=${existingWpEventId || 'none'}`);
  console.log(`${LOG_PREFIX} 📤 WP payload:`, JSON.stringify({ title: wpPayload.title, status: wpPayload.status, start_date: wpPayload.start_date, wp_tag_id: mapping.wp_tag_id, wp_category_slug: mapping.wp_tag_slug }));
  
  if (existingWpEventId) {
    // UPDATE existing WordPress event
    const updateResponse = await fetch(
      `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}/${existingWpEventId}`,
      {
        method: 'POST', // WordPress REST API uses POST for updates too
        headers: {
          'Authorization': wpAuthHeader(env),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(wpPayload)
      }
    );
    
    if (!updateResponse.ok) {
      const errorBody = await updateResponse.text();
      throw new Error(`Tribe API update error ${updateResponse.status}: ${errorBody}`);
    }
    
    const updateData = await updateResponse.json();
    wpEventId = updateData.id;
    wpEventData = updateData;
    console.log(`${LOG_PREFIX} ✏️ Updated WP event ${wpEventId}, response status: ${updateData.status}`);
    
  } else {
    // CREATE new WordPress event
    
    const createResponse = await fetch(
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
    
    if (!createResponse.ok) {
      const errorBody = await createResponse.text();
      throw new Error(`Tribe API create error ${createResponse.status}: ${errorBody}`);
    }
    
    const createData = await createResponse.json();
    wpEventId = createData.id;
    wpEventData = createData;
    
    if (!wpEventId) {
      throw new Error('Tribe API returned no event ID');
    }
    console.log(`${LOG_PREFIX} ✨ Created WP event ${wpEventId}, response status: ${createData.status}`);
  }
  
  // 4. Set meta on WP event (always do this to ensure meta is correct)
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
    // Don't throw — event was created/updated, meta is best-effort
  }
  
  // 5. Save snapshot to Supabase (include editorial content if generated)
  const computedState = status === 'draft' ? 'draft' : 'published';
  await saveSnapshot(env, userId, odooWebinar, wpEventData, editorialContentToSave, computedState);
  console.log(`${LOG_PREFIX} 💾 Snapshot saved: odoo=${odooWebinarId} wp=${wpEventId} state=${computedState}`);
  
  return {
    wp_event_id: wpEventId,
    computed_state: computedState
  };
}

/**
 * Save/upsert snapshot to Supabase
 * 
 * Fetches full WordPress event data and stores it in snapshot
 * Uses unique constraint on (user_id, odoo_webinar_id) for upsert
 * 
 * @param {Object} env
 * @param {string} userId
 * @param {Object} odooWebinar - Full Odoo record
 * @param {number} wpEventId - WordPress event ID
 * @param {Object} wpEventData - Full WordPress event data from create/update response
 * @param {Object|null} editorialContent - Optional editorial content to save (null = don't update)
 * @param {string} computedState - Computed sync state ('published', 'draft', etc.)
 */
async function saveSnapshot(env, userId, odooWebinar, wpEventData, editorialContent = null, computedState = 'published') {
  const supabase = await getSupabaseAdminClient(env);
  
  const snapshotData = {
    user_id: userId,
    odoo_webinar_id: odooWebinar.id,
    odoo_snapshot: odooWebinar,
    wp_snapshot: wpEventData,
    computed_state: computedState,
    last_synced_at: new Date().toISOString()
  };
  
  // Only include editorial_content if provided (don't overwrite existing custom content with null)
  if (editorialContent !== null) {
    snapshotData.editorial_content = editorialContent;
  }
  
  const { error } = await supabase
    .from('webinar_snapshots')
    .upsert(snapshotData, {
      onConflict: 'user_id,odoo_webinar_id'
    });
  
  if (error) {
    throw new Error(`Supabase snapshot error: ${error.message}`);
  }
}
