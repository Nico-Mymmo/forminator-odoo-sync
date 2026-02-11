/**
 * Event Operations Routes
 */

import { LOG_PREFIX, EMOJI, SYNC_STATUS, WP_META_KEYS } from './constants.js';
import { getOdooWebinars, getRegistrationCount } from './odoo-client.js';
import { getWordPressEvents, getWordPressEventsWithMeta, publishToWordPress } from './wp-client.js';
import { getSupabaseAdminClient } from './lib/supabaseClient.js';
import { computeEventState } from './state-engine.js';
import { extractOdooWebinarId } from './mapping.js';
import { eventOperationsUI } from './ui.js';

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
      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Starting full sync for user ${user.id}...`);
      
      // 1. Fetch all sources in parallel
      // Core API returns flat array WITH meta (Tribe API does not include meta)
      const [odooWebinars, wpEvents] = await Promise.all([
        getOdooWebinars(env),
        getWordPressEventsWithMeta(env)
      ]);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Odoo: ${odooWebinars.length}, WP: ${wpEvents.length}`);
      
      // 2. Build WP lookup by odoo_webinar_id meta
      const wpByOdooId = new Map();
      for (const wpEvent of wpEvents) {
        const odooId = extractOdooWebinarId(wpEvent.meta || {});
        if (odooId) {
          wpByOdooId.set(odooId, wpEvent);
        }
      }
      
      // 3. Compute state for each Odoo webinar
      const supabase = await getSupabaseAdminClient(env);
      const results = [];
      const discrepancies = [];
      
      for (const odooWebinar of odooWebinars) {
        const wpEvent = wpByOdooId.get(odooWebinar.id) || null;

        const state = computeEventState(odooWebinar, wpEvent);
        
        // Upsert snapshot with normalized WP data
        const wpTitle = wpEvent?.title?.rendered || wpEvent?.title || null;
        const { error } = await supabase
          .from('webinar_snapshots')
          .upsert({
            user_id: user.id,
            odoo_webinar_id: odooWebinar.id,
            odoo_snapshot: odooWebinar,
            wp_snapshot: wpEvent ? {
              id: wpEvent.id,
              title: wpTitle,
              start_date: wpEvent.start_date || null,
              description: wpEvent.content?.rendered || null,
              status: wpEvent.status
            } : null,
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
  }
};
