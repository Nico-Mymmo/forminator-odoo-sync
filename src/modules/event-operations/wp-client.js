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

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

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
    .select('wp_event_id, editorial_mode, selected_form_id, editorial_content, title_override, wp_snapshot')
    .eq('odoo_webinar_id', odooWebinarId)
    .single();
  
  // 3. Map to WordPress payload (with status)
  const wpPayload = mapOdooToWordPress(odooWebinar, status);

  // 3a. Add deterministic WP tag (Addendum C)
  const odooEventTypeId = resolveOdooEventTypeId(odooWebinar);
  const mapping = await getEventTypeTagMappingByEventTypeId(env, odooEventTypeId);

  if (!mapping) {
    throw new Error(`Missing event type mapping for webinar ${odooWebinar.id}: odoo_event_type_id=${odooEventTypeId}`);
  }

  // The Events Calendar (Tribe V1) expects category slugs via `categories`
  // (string for single category, comma-separated for multiple).
  // Addendum C remains deterministic because mapping lookup is by event type -> single row.
  wpPayload.categories = mapping.wp_tag_slug;
  
  // 3b. Build description using editorial_mode (decoupled from form)
  const odooDescription = odooWebinar.x_studio_webinar_info || '';
  const editorialMode = existingSnapshot?.editorial_mode || 'never_edited';
  const selectedFormId = existingSnapshot?.selected_form_id || null;
  const editorialContent = existingSnapshot?.editorial_content || null;
  const titleOverride = (existingSnapshot?.title_override || '').trim();

  let descriptionHtml = '';
  let editorialModeToSave = editorialMode;
  let selectedFormIdToSave = selectedFormId;

  switch (editorialMode) {
    case 'never_edited':
      // First publish: use plain Odoo description (NO automatic form injection)
      descriptionHtml = odooDescription;
      break;
      
    case 'use_odoo_plain':
      // User explicitly wants plain Odoo description
      descriptionHtml = odooDescription;
      break;
      
    case 'custom':
      // User has custom editorial content
      if (editorialContent && editorialContent.blocks) {
        descriptionHtml = buildEditorialDescription(editorialContent, odooDescription);
      } else {
        // Fallback to Odoo if editorial_content missing
        descriptionHtml = odooDescription;
      }
      break;
      
    case 'empty':
      // User wants empty description
      descriptionHtml = '';
      break;
      
    default:
      console.warn(`${LOG_PREFIX} Unknown editorial_mode: ${editorialMode}, using Odoo description`);
      descriptionHtml = odooDescription;
      editorialModeToSave = 'never_edited';
  }

  // Append form shortcode if selected (decoupled from editorial content)
  if (selectedFormIdToSave) {
    const formShortcode = `\n\n[forminator_form id="${selectedFormIdToSave}"]`;
    descriptionHtml += formShortcode;
  }

  // Title override from snapshot (if configured)
  if (titleOverride) {
    wpPayload.title = titleOverride;
    const slug = toSlug(titleOverride);
    if (slug) {
      wpPayload.slug = slug;
    }
  }

  // Tribe API requires non-empty description (fallback to space if empty)
  wpPayload.description = descriptionHtml || ' ';
  
  // 3c. WordPress linking: verify wp_event_id, search by meta, avoid duplicates
  let wpEventId = existingSnapshot?.wp_event_id || null;
  
  if (wpEventId) {
    // Verify WP event still exists
    console.log(`${LOG_PREFIX} 🔍 Verifying WP event ${wpEventId}...`);
    const verifyResponse = await fetch(
      `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}/${wpEventId}`,
      { headers: { 'Authorization': wpAuthHeader(env) } }
    );
    
    if (verifyResponse.status === 404) {
      console.warn(`${LOG_PREFIX} ⚠️ WP event ${wpEventId} not found (deleted?), will unlink and search`);
      wpEventId = null;
    } else if (!verifyResponse.ok) {
      throw new Error(`Failed to verify WP event ${wpEventId}: ${verifyResponse.status}`);
    } else {
      console.log(`${LOG_PREFIX} ✅ WP event ${wpEventId} verified`);
    }
  }
  
  if (!wpEventId) {
    // Try to find existing WP event by meta odoo_webinar_id
    console.log(`${LOG_PREFIX} 🔍 Searching for WP event with meta odoo_webinar_id=${odooWebinarId}`);
    
    const searchResponse = await fetch(
      `${env.WORDPRESS_URL}${WP_ENDPOINTS.WP_EVENTS}?per_page=100&status=publish,draft,private`,
      { headers: { 'Authorization': wpAuthHeader(env) } }
    );
    
    if (searchResponse.ok) {
      const allWpEvents = await searchResponse.json();
      const matchedByMeta = allWpEvents.find(event => 
        event.meta && String(event.meta[WP_META_KEYS.ODOO_WEBINAR_ID]) === String(odooWebinarId)
      );
      
      if (matchedByMeta) {
        wpEventId = matchedByMeta.id;
        console.log(`${LOG_PREFIX} 🔗 Found WP event ${wpEventId} via meta, will link and UPDATE`);
      } else {
        // Conservative title+date fallback
        console.log(`${LOG_PREFIX} 🔍 No meta match, trying title+datetime fallback...`);
        const odooTitle = odooWebinar.name?.toLowerCase().trim() || '';
        const odooStartDate = odooWebinar.x_studio_event_datetime;
        
        if (odooTitle && odooStartDate) {
          const odooStart = new Date(odooStartDate.replace(' ', 'T') + 'Z');
          const candidates = allWpEvents.filter(event => {
            const wpTitle = (event.title?.rendered || event.title || '').toLowerCase().trim();
            const wpStartRaw = event.utc_start_date || event.start_date;
            if (!wpStartRaw) return false;
            
            const wpStart = new Date(wpStartRaw.replace(' ', 'T') + 'Z');
            const timeDiffHours = Math.abs(odooStart - wpStart) / (1000 * 60 * 60);
            
            return wpTitle === odooTitle && timeDiffHours <= 2; // ±2 hour tolerance
          });
          
          if (candidates.length === 1) {
            wpEventId = candidates[0].id;
            console.log(`${LOG_PREFIX} 🔗 Found single title+datetime match: WP event ${wpEventId}`);
          } else if (candidates.length > 1) {
            console.warn(`${LOG_PREFIX} ⚠️ Multiple title+datetime matches found (${candidates.length}), NOT linking to avoid ambiguity`);
          }
        }
      }
    }
  }
  
  let wpEventData; // Store API response for snapshot
  
  console.log(`${LOG_PREFIX} 📤 Publish odoo=${odooWebinarId} status=${status} wpEventId=${wpEventId || 'CREATE'}`);
  console.log(`${LOG_PREFIX} 📤 WP payload:`, JSON.stringify({
    title: wpPayload.title,
    slug: wpPayload.slug,
    status: wpPayload.status,
    start_date: wpPayload.start_date,
    description_len: (wpPayload.description || '').length,
    wp_tag_id: mapping.wp_tag_id,
    wp_category_slug: mapping.wp_tag_slug,
    editorial_mode: editorialModeToSave
  }));
  
  if (wpEventId) {
    // UPDATE existing WordPress event
    const updateResponse = await fetch(
      `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}/${wpEventId}`,
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
  
  // 5. Save snapshot to Supabase (include new fields: wp_event_id, editorial_mode, selected_form_id)
  const computedState = status === 'draft' ? 'draft' : 'published';
  await saveSnapshot(env, odooWebinar, wpEventData, wpEventId, editorialModeToSave, selectedFormIdToSave, computedState);
  console.log(`${LOG_PREFIX} 💾 Snapshot saved: odoo=${odooWebinarId} wp=${wpEventId} state=${computedState} mode=${editorialModeToSave}`);
  
  return {
    wp_event_id: wpEventId,
    computed_state: computedState
  };
}

/**
 * Save/upsert snapshot to Supabase
 * 
 * Fetches full WordPress event data and stores it in snapshot
 * Uses unique constraint on (odoo_webinar_id) for upsert
 * 
 * @param {Object} env
 * @param {Object} odooWebinar - Full Odoo record
 * @param {Object} wpEventData - Full WordPress event data from create/update response
 * @param {number} wpEventId - WordPress event ID (primary link)
 * @param {string} editorialMode - Editorial mode enum value
 * @param {string|null} selectedFormId - Selected form ID (null = no form)
 * @param {string} computedState - Computed sync state ('published', 'draft', etc.)
 */
async function saveSnapshot(env, odooWebinar, wpEventData, wpEventId, editorialMode, selectedFormId, computedState = 'published') {
  const supabase = await getSupabaseAdminClient(env);
  
  const snapshotData = {
    odoo_webinar_id: odooWebinar.id,
    odoo_snapshot: odooWebinar,
    wp_snapshot: wpEventData,
    wp_event_id: wpEventId,
    editorial_mode: editorialMode,
    selected_form_id: selectedFormId,
    computed_state: computedState,
    last_synced_at: new Date().toISOString()
  };
  
  const { error } = await supabase
    .from('webinar_snapshots')
    .upsert(snapshotData, {
      onConflict: 'odoo_webinar_id'
    });
  
  if (error) {
    throw new Error(`Supabase snapshot error: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-site helpers (Forminator Sync V2 — discovery)
// Events-operations blijft zijn eigen env-gebaseerde functies gebruiken;
// deze exports zijn ALLEEN bedoeld voor de discovery laag in V2.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Haal live Forminator-formulieren op van een WP-site via het openvme plugin endpoint.
 *
 * @param {string} baseUrl    - bijv. "https://mijnsite.nl"
 * @param {string} authToken  - "username:application-password" (Basic Auth)
 * @returns {Promise<Array>}  - array van { form_id, form_name, fields }
 */
export async function fetchForminatorForms(baseUrl, authToken) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/openvme/v1/forminator/forms`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${btoa(authToken)}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`WP API error ${response.status} bij ${url}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Multi-site WP client factory.
 *
 * Gebruik:
 *   const client = getWpClient(env);            // legacy — events-operations fallback
 *   const client = getWpClient(env, connection); // explicit connection record
 *
 *   const forms = await client.fetchForms();
 *
 * @param {Object}      env        - Cloudflare env
 * @param {Object|null} connection - wp_connections record (base_url, auth_token) of null
 */
export function getWpClient(env, connection = null) {
  const baseUrl   = connection ? connection.base_url   : env.WORDPRESS_URL;
  const authToken = connection ? connection.auth_token : env.WP_API_TOKEN;

  return {
    fetchForms: () => fetchForminatorForms(baseUrl, authToken)
  };
}
