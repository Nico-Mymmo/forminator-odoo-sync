/**
 * Event Operations Routes
 */

import { LOG_PREFIX, EMOJI, SYNC_STATUS, WP_META_KEYS } from './constants.js';
import { getOdooWebinars, getRegistrationCount, getAllOdooTags } from './odoo-client.js';
import { getWordPressEvents, getWordPressEventsWithMeta, getWordPressEvent, publishToWordPress, getWordPressEventCategories } from './wp-client.js';
import { getSupabaseAdminClient } from './lib/supabaseClient.js';
import { computeEventState } from './state-engine.js';
import { extractOdooWebinarId } from './mapping.js';
import { eventOperationsUI } from './ui.js';
import { getTagMappings, createTagMapping, deleteTagMapping } from './tag-mapping.js';
import { validateEditorialContent } from './editorial.js';

export const routes = {
  /**
   * GET /events
   * Main UI
   */
  'GET /': async (context) => {
    return new Response(eventOperationsUI(context.user), {
      headers: { 'Content-Type': 'text/html' }
    });
  },

  /**
   * GET /events/api/odoo-webinars
   * Fetch all active webinars from Odoo WITH registration counts
   * 
   * Response: { success: true, data: { webinars: [...], registrationCounts: { 44: 12, ... } } }
   */
  'GET /api/odoo-webinars': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} ${EMOJI.EVENT} Fetching Odoo webinars...`);
      
      const webinars = await getOdooWebinars(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.EVENT} Fetching registration counts for ${webinars.length} webinars...`);
      
      // Fetch registration counts in parallel
      const registrationCounts = {};
      await Promise.all(
        webinars.map(async (webinar) => {
          try {
            const count = await getRegistrationCount(env, webinar.id);
            registrationCounts[webinar.id] = count;
          } catch (err) {
            console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Failed to fetch count for webinar ${webinar.id}:`, err.message);
            registrationCounts[webinar.id] = 0; // Fallback to 0 on error
          }
        })
      );
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${webinars.length} webinars with registration counts`);
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          webinars,
          registrationCounts
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch webinars failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/wp-events
   * Fetch all published events from WordPress
   * 
   * Response: { success: true, data: [...] }
   */
  'GET /api/wp-events': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} ${EMOJI.EVENT} Fetching WordPress events...`);
      
      const events = await getWordPressEvents(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${events.length} events`);
      
      return new Response(JSON.stringify({
        success: true,
        data: events
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch WP events failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/snapshots
   * Fetch all snapshots for the current user from Supabase
   * 
   * Response: { success: true, data: [...] }
   */
  'GET /api/snapshots': async (context) => {
    const { env, user } = context;
    
    try {
      console.log(`${LOG_PREFIX} ${EMOJI.EVENT} Fetching snapshots for user ${user.id}...`);
      
      const supabase = await getSupabaseAdminClient(env);
      
      const { data, error } = await supabase
        .from('webinar_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${data.length} snapshots`);
      
      return new Response(JSON.stringify({
        success: true,
        data
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch snapshots failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * POST /events/api/publish
   * Publish an Odoo webinar to WordPress (two-step flow)
   * 
   * Body: { odoo_webinar_id: number }
   * Response: { success: true, data: { wp_event_id, computed_state } }
   */
  'POST /api/publish': async (context) => {
    const { env, user, request } = context;
    
    try {
      const body = await request.json();
      const { odoo_webinar_id } = body;
      
      if (!odoo_webinar_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing required field: odoo_webinar_id'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Publishing webinar ${odoo_webinar_id}...`);
      
      const result = await publishToWordPress(env, user.id, odoo_webinar_id);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Published: WP event ${result.wp_event_id}`);
      
      return new Response(JSON.stringify({
        success: true,
        data: result
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Publish failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/discrepancies
   * Fetch snapshots with out_of_sync state for current user
   * 
   * Response: { success: true, data: [...] }
   */
  'GET /api/discrepancies': async (context) => {
    const { env, user } = context;
    
    try {
      console.log(`${LOG_PREFIX} ${EMOJI.DISCREPANCY} Fetching discrepancies for user ${user.id}...`);
      
      const supabase = await getSupabaseAdminClient(env);
      
      const { data, error } = await supabase
        .from('webinar_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .eq('computed_state', SYNC_STATUS.OUT_OF_SYNC)
        .order('updated_at', { ascending: false });
      
      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.DISCREPANCY} Found ${data.length} discrepancies`);
      
      return new Response(JSON.stringify({
        success: true,
        data
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch discrepancies failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * POST /events/api/sync
   * Full sync cycle: compare Odoo ↔ WordPress, update snapshots
   * 
   * Response: { success: true, data: { synced_count, discrepancies: [...] } }
   */
  'POST /api/sync': async (context) => {
    const { env, user } = context;
    
    try {
      // 1. Fetch all sources in parallel
      // Core API returns flat array WITH meta (Tribe API does not include meta)
      const [odooWebinars, wpEvents, supabase] = await Promise.all([
        getOdooWebinars(env),
        getWordPressEventsWithMeta(env),
        getSupabaseAdminClient(env)
      ]);
      
      // 2. Build WP lookup by odoo_webinar_id meta
      const wpByOdooId = new Map();
      for (const wpEvent of wpEvents) {
        const odooId = extractOdooWebinarId(wpEvent.meta || {});
        if (odooId) {
          wpByOdooId.set(odooId, wpEvent);
        }
      }
      
      // 3. Compute state for each Odoo webinar (only title/date comparison)
      const results = [];
      const discrepancies = [];
      
      for (const odooWebinar of odooWebinars) {
        const wpCoreEvent = wpByOdooId.get(odooWebinar.id) || null;
        
        // If event exists in WordPress, fetch Tribe API version for accurate snapshot
        // (Core API doesn't include Tribe-specific fields like start_date, categories, etc.)
        let wpEvent = null;
        if (wpCoreEvent) {
          try {
            wpEvent = await getWordPressEvent(env, wpCoreEvent.id);
          } catch (error) {
            console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Failed to fetch Tribe event ${wpCoreEvent.id}:`, error.message);
            wpEvent = wpCoreEvent; // Fallback to Core API data
          }
        }

        const state = computeEventState(odooWebinar, wpEvent);
        
        // Upsert snapshot with full Tribe API event data (or null if not published)
        const { error } = await supabase
          .from('webinar_snapshots')
          .upsert({
            user_id: user.id,
            odoo_webinar_id: odooWebinar.id,
            odoo_snapshot: odooWebinar,
            wp_snapshot: wpEvent, // Store full Tribe API event data (includes all fields like categories)
            computed_state: state,
            last_synced_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,odoo_webinar_id'
          });
        
        if (error) {
          console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Snapshot upsert failed for webinar ${odooWebinar.id}:`, error.message);
        }
        
        results.push({ odoo_id: odooWebinar.id, state });
        
        if (state === SYNC_STATUS.OUT_OF_SYNC) {
          discrepancies.push({
            odoo_webinar_id: odooWebinar.id,
            title: odooWebinar.x_name,
            state
          });
        }
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Sync complete: ${results.length} webinars, ${discrepancies.length} discrepancies`);
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          synced_count: results.length,
          discrepancies
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Sync failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/tag-mappings
   * Get all tag mappings for current user
   */
  'GET /api/tag-mappings': async (context) => {
    const { env, user } = context;
    
    try {
      console.log(`${LOG_PREFIX} 🏷️  Fetching tag mappings for user ${user.id}...`);
      
      const mappings = await getTagMappings(env, user.id);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${mappings.length} tag mappings`);
      
      return new Response(JSON.stringify({
        success: true,
        data: mappings
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch tag mappings failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * POST /events/api/tag-mappings
   * Create new tag mapping
   * 
   * Body: { odoo_tag_id, odoo_tag_name, wp_category_id, wp_category_slug }
   */
  'POST /api/tag-mappings': async (context) => {
    const { env, user, request } = context;
    
    try {
      const body = await request.json();
      const { odoo_tag_id, odoo_tag_name, wp_category_id, wp_category_slug } = body;
      
      if (!odoo_tag_id || !odoo_tag_name || !wp_category_id || !wp_category_slug) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing required fields: odoo_tag_id, odoo_tag_name, wp_category_id, wp_category_slug'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`${LOG_PREFIX} 🏷️  Creating tag mapping: ${odoo_tag_name} → ${wp_category_slug} (${wp_category_id})...`);
      
      const mapping = await createTagMapping(env, user.id, {
        odoo_tag_id,
        odoo_tag_name,
        wp_category_slug,
        wp_category_id
      });
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Tag mapping created`);
      
      return new Response(JSON.stringify({
        success: true,
        data: mapping
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Create tag mapping failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * DELETE /events/api/tag-mappings/:id
   * Delete tag mapping
   */
  'DELETE /api/tag-mappings/:id': async (context) => {
    const { env, user, params } = context;
    
    try {
      const { id } = params;
      
      if (!id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing mapping ID'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`${LOG_PREFIX} 🏷️  Deleting tag mapping ${id}...`);
      
      await deleteTagMapping(env, user.id, id);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Tag mapping deleted`);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Delete tag mapping failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/odoo-tags
   * Get all available Odoo tags
   */
  'GET /api/odoo-tags': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} 🏷️  Fetching Odoo tags...`);
      
      const tags = await getAllOdooTags(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${tags.length} Odoo tags`);
      
      return new Response(JSON.stringify({
        success: true,
        data: tags
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch Odoo tags failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/wp-event-categories
   * Get all WordPress Event Categories (The Events Calendar taxonomy)
   */
  'GET /api/wp-event-categories': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} 🏷️  Fetching WordPress Event Categories...`);
      
      const categories = await getWordPressEventCategories(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${categories.length} WP event categories`);
      
      return new Response(JSON.stringify({
        success: true,
        data: categories
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch WP event categories failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * GET /events/api/editorial/:webinarId
   * Get editorial content for a webinar
   */
  'GET /api/editorial/:webinarId': async (context) => {
    const { env, user, params } = context;
    
    try {
      const { webinarId } = params;
      const odooWebinarId = parseInt(webinarId, 10);
      
      if (!odooWebinarId || isNaN(odooWebinarId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid webinar ID'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`${LOG_PREFIX} 📝 Fetching editorial content for webinar ${odooWebinarId}...`);
      
      const supabase = await getSupabaseAdminClient(env);
      
      const { data: snapshot, error } = await supabase
        .from('webinar_snapshots')
        .select('editorial_content')
        .eq('user_id', user.id)
        .eq('odoo_webinar_id', odooWebinarId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = not found (acceptable)
        throw error;
      }
      
      const editorialContent = snapshot?.editorial_content || null;
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Editorial content retrieved`);
      
      return new Response(JSON.stringify({
        success: true,
        data: editorialContent
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch editorial content failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * PUT /events/api/editorial/:webinarId
   * Save editorial content for a webinar
   */
  'PUT /api/editorial/:webinarId': async (context) => {
    const { env, user, params, request } = context;
    
    try {
      const { webinarId } = params;
      const odooWebinarId = parseInt(webinarId, 10);
      
      if (!odooWebinarId || isNaN(odooWebinarId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid webinar ID'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const body = await request.json();
      const { editorialContent } = body;
      
      // Validate editorial content structure
      const validation = validateEditorialContent(editorialContent);
      if (!validation.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: validation.error
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`${LOG_PREFIX} 📝 Saving editorial content for webinar ${odooWebinarId}...`);
      
      const supabase = await getSupabaseAdminClient(env);
      
      // Check if snapshot exists
      const { data: existingSnapshot } = await supabase
        .from('webinar_snapshots')
        .select('id')
        .eq('user_id', user.id)
        .eq('odoo_webinar_id', odooWebinarId)
        .single();
      
      if (!existingSnapshot) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Webinar must be published before adding editorial content'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Update editorial content
      const { error: updateError } = await supabase
        .from('webinar_snapshots')
        .update({ editorial_content: editorialContent })
        .eq('user_id', user.id)
        .eq('odoo_webinar_id', odooWebinarId);
      
      if (updateError) {
        throw updateError;
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Editorial content saved`);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Save editorial content failed:`, error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
