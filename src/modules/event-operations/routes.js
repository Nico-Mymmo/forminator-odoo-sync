/**
 * Event Operations Routes
 */

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
  }
};
