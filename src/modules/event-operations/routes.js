/**
 * Event Operations Routes
 */

import { LOG_PREFIX, EMOJI } from './constants.js';
import { getOdooWebinars } from './odoo-client.js';
import { getWordPressEvents, publishToWordPress } from './wp-client.js';
import { getSupabaseAdminClient } from './lib/supabaseClient.js';
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
   * Fetch all active webinars from Odoo
   * 
   * Response: { success: true, data: [...] }
   */
  'GET /api/odoo-webinars': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} ${EMOJI.EVENT} Fetching Odoo webinars...`);
      
      const webinars = await getOdooWebinars(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${webinars.length} webinars`);
      
      return new Response(JSON.stringify({
        success: true,
        data: webinars
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
  }
};
