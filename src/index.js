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
import { runFlagCron } from './modules/cx-automations/cron.js';
import { runDueScheduledTasks } from './modules/mini-apps/lib/scheduler.js';
import { runDueConditionTasks } from './modules/mini-apps/lib/condition-scheduler.js';

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
    // Twee onafhankelijke cron-triggers (zie wrangler.jsonc): "*\/15 * * * *"
    // voor de bestaande 15-min jobs, "*\/5 * * * *" voor de nieuwe
    // criteria-taken-cron (mini-apps, 5de generieke bouwblok -- bewust een
    // aparte, snellere cron-tak, los van runDueScheduledTasks hierboven, zie
    // src/modules/mini-apps/lib/condition-scheduler.js). event.cron is leeg
    // bij een lokale/handmatige trigger (bv. `wrangler dev --test-scheduled`
    // zonder cron-param) -- in dat geval draaien we voor de zekerheid alles,
    // net als vóór deze opsplitsing.
    const cron = event?.cron;
    const runFifteenMinJobs = !cron || cron === '*/15 * * * *';
    const runFiveMinJobs = !cron || cron === '*/5 * * * *';

    if (runFifteenMinJobs) {
      ctx.waitUntil(
        handleCxWinDetection(env).catch(err =>
          console.error('[scheduled][cx_powerboard] CRASH:', err?.message, err?.stack)
        )
      );
      ctx.waitUntil(
        runFlagCron(env).catch(err =>
          console.error('[scheduled][cx_automations] CRASH:', err?.message, err?.stack)
        )
      );
      ctx.waitUntil(
        runDueScheduledTasks(env).catch(err =>
          console.error('[scheduled][mini_apps] CRASH:', err?.message, err?.stack)
        )
      );
    }

    if (runFiveMinJobs) {
      ctx.waitUntil(
        runDueConditionTasks(env).catch(err =>
          console.error('[scheduled][mini_apps][condition-tasks] CRASH:', err?.message, err?.stack)
        )
      );
    }
  }
};
