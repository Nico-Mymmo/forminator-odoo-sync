/**
 * Event Operations Routes
 */

import { LOG_PREFIX, EMOJI } from './constants.js';
import { getOdooWebinars } from './odoo-client.js';
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
  }
};
