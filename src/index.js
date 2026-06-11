/**
 * Operations Manager — Worker entry point.
 *
 * Dunne pipeline: CORS preflight → publieke routes → module-router
 * (auth-gate + handler + endpoint-tracking). Alle logica leeft in src/router/.
 */

import { handlePreflight } from './router/cors.js';
import { handlePublicRoutes } from './router/public-routes.js';
import { handleModuleRequest } from './router/module-router.js';
import { handleCxWinDetection } from './modules/cx_powerboard/cron/win-detection.js';

export default {
  async fetch(request, env, ctx) {
    try {
      // 1. CORS preflight
      if (request.method === 'OPTIONS') {
        return handlePreflight();
      }

      // 2. Publieke routes (favicon, R2-assets, /api/auth/*, v2-webhooks)
      const publicResponse = await handlePublicRoutes(request, env, ctx);
      if (publicResponse) {
        return publicResponse;
      }

      // 3. Module-router (auth-gate → handler → endpoint-tracking)
      return await handleModuleRequest(request, env, ctx);
    } catch (error) {
      // Global error handler — voorkomt HTML error pages van Workers
      console.error('[Worker] Unhandled error in fetch:', error);
      console.error('[Worker] Error stack:', error.stack);
      console.error('[Worker] Request URL:', request.url);
      console.error('[Worker] Request method:', request.method);

      return new Response(JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        type: error.name || 'Error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async scheduled(event, env, ctx) {
    await handleCxWinDetection(env);
  }
};
