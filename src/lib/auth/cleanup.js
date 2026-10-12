/**
 * Opruimen rond het inloggen, eens per uur (eerste kwartier van de
 * 15-minutencron in src/index.js):
 *   - aanmeldstappen (auth_challenges) die verlopen zijn
 *   - verlopen sessies, en sessies van voor de gehashte tokens
 *   - het aanmeldlogboek (auth_events) na een jaar
 *
 * @module lib/auth/cleanup
 */

import { getSupabaseClient } from '../database.js';
import { cleanupExpiredSessions } from './session.js';

const LOGBOEK_DAGEN = 365;

/**
 * @param {object} env
 * @param {{ scheduledTime?: number }} [opts]
 */
export async function runAuthCleanup(env, { scheduledTime } = {}) {
  const moment = scheduledTime ? new Date(scheduledTime) : new Date();
  if (moment.getUTCMinutes() >= 15) return;

  const supabase = getSupabaseClient(env);
  const nu = new Date().toISOString();

  const { error: chFout } = await supabase.from('auth_challenges').delete().lt('expires_at', nu);
  if (chFout) console.error('[auth][opruimen] aanmeldstappen:', chFout.message);

  const sessies = await cleanupExpiredSessions(env);

  const grens = new Date(Date.now() - LOGBOEK_DAGEN * 24 * 60 * 60 * 1000).toISOString();
  const { error: evFout } = await supabase.from('auth_events').delete().lt('created_at', grens);
  if (evFout) console.error('[auth][opruimen] logboek:', evFout.message);

  if (sessies > 0) console.log(`[auth][opruimen] ${sessies} sessie(s) opgeruimd`);
}
