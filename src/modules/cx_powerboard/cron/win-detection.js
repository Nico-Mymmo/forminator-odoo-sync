/**
 * CX Powerboard — Win Detection Cron Handler
 *
 * Fires every 15 minutes via Cloudflare Scheduled Trigger.
 *
 * Algorithm (V6 — keep_done as source of truth):
 *  1. Load all platform users with odoo_uid
 *  2. Load mappings → trackedTypeIds, mappingByTypeId
 *  3. Parallel fetch open tracked activities + completed today
 *  4. Detect wins from completedToday → upsert cx_processed_wins (idempotent)
 *  5. Per user: compute remaining include_in_streak count, upsert cx_daily_completions
 *     (cleared_queue never downgrades: existing true stays true)
 */

import { createClient } from '@supabase/supabase-js';
import { fetchTrackedOpenActivities, fetchCompletedToday, getTodayStr } from '../odoo-client.js';
import { getMappings } from '../services/mapping-service.js';

export async function handleCxWinDetection(env) {
  const cronRunId = new Date().toISOString();
  const log = (msg) => console.log(`[cx_powerboard][${cronRunId}] ${msg}`);

  log('Win detection cron started (V6)');

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const todayStr = getTodayStr(env);

  // ── 1. Load tracked users ──────────────────────────────────────────────────
  const { data: trackedUsers, error: userError } = await supabase
    .from('users')
    .select('id, odoo_uid')
    .not('odoo_uid', 'is', null);

  if (userError) {
    log(`ERROR loading users: ${userError.message}`);
    return;
  }
  if (!trackedUsers?.length) {
    log('No users with odoo_uid – nothing to do');
    return;
  }

  const odooUidToUserId = {};
  for (const u of trackedUsers) {
    odooUidToUserId[u.odoo_uid] = u.id;
  }
  const allOdooUids = trackedUsers.map(u => u.odoo_uid);
  log(`Tracking ${allOdooUids.length} user(s)`);

  // ── 2. Load mappings ───────────────────────────────────────────────────────
  let mappings;
  try {
    mappings = await getMappings(env);
  } catch (err) {
    log(`ERROR loading mappings: ${err.message}`);
    return;
  }

  const trackedTypeIds = mappings.map(m => m.odoo_activity_type_id);
  if (!trackedTypeIds.length) {
    log('No mapped activity types – nothing to do');
    return;
  }

  const mappingByTypeId = {};
  for (const m of mappings) {
    mappingByTypeId[m.odoo_activity_type_id] = m;
  }

  // ── 3. Fetch open tracked activities + completed today in parallel ──────────
  let openActivities, completedToday;
  try {
    [openActivities, completedToday] = await Promise.all([
      fetchTrackedOpenActivities(env, allOdooUids, trackedTypeIds),
      fetchCompletedToday(env, allOdooUids, trackedTypeIds),
    ]);
  } catch (err) {
    log(`ERROR fetching Odoo data: ${err.message}`);
    return;
  }
  log(`Odoo returned ${openActivities.length} open, ${completedToday.length} completed today`);

  // ── 4. Win detection ───────────────────────────────────────────────────────
  const wins = completedToday.filter(a => {
    const typeId = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
    return mappingByTypeId[typeId]?.is_win === true;
  });
  log(`${wins.length} win(s) detected`);

  if (wins.length > 0) {
    const winInserts = wins.map(a => {
      const typeId     = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
      const typeName   = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
      const odooUserId = Array.isArray(a.user_id) ? a.user_id[0] : a.user_id;
      const mapping    = mappingByTypeId[typeId];
      return {
        odoo_activity_id:   a.id,
        platform_user_id:   odooUidToUserId[odooUserId] ?? null,
        activity_type_id:   typeId,
        activity_type_name: typeName,
        priority_weight:    mapping?.priority_weight ?? 1,
        won_at:             cronRunId,
        cron_run_id:        cronRunId,
      };
    });

    const { error: winError } = await supabase
      .from('cx_processed_wins')
      .upsert(winInserts, { onConflict: 'odoo_activity_id', ignoreDuplicates: true });

    if (winError) {
      log(`ERROR inserting wins: ${winError.message}`);
    } else {
      log(`Inserted ${winInserts.length} win(s) into cx_processed_wins`);
    }
  }

  // ── 5. Upsert cx_daily_completions per user ────────────────────────────────
  // Group open and completed activities by platform user id
  const openByUser = {};
  for (const a of openActivities) {
    const odooUserId = Array.isArray(a.user_id) ? a.user_id[0] : a.user_id;
    const uid = odooUidToUserId[odooUserId];
    if (!uid) continue;
    if (!openByUser[uid]) openByUser[uid] = [];
    openByUser[uid].push(a);
  }

  const completedCountByUser = {};
  for (const a of completedToday) {
    const odooUserId = Array.isArray(a.user_id) ? a.user_id[0] : a.user_id;
    const uid = odooUidToUserId[odooUserId];
    if (!uid) continue;
    completedCountByUser[uid] = (completedCountByUser[uid] || 0) + 1;
  }

  // Fetch existing rows for today to apply never-downgrade logic on cleared_queue
  const { data: existingRows } = await supabase
    .from('cx_daily_completions')
    .select('platform_user_id, cleared_queue')
    .eq('day', todayStr);

  const existingByUser = {};
  for (const row of (existingRows || [])) {
    existingByUser[row.platform_user_id] = row;
  }

  const upsertRows = trackedUsers.map(u => {
    const userOpen = openByUser[u.id] || [];
    // Count only include_in_streak types for the streak gate
    const streakRelevantOpen = userOpen.filter(a => {
      const typeId = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
      return mappingByTypeId[typeId]?.include_in_streak !== false;
    });
    const completedCount  = completedCountByUser[u.id] || 0;
    const remainingCount  = streakRelevantOpen.length;
    const existingCleared = existingByUser[u.id]?.cleared_queue ?? false;
    // Mirrors isDoneForToday from routes.js: must have completed at least one activity
    const clearedQueue    = existingCleared || (remainingCount === 0 && completedCount > 0);
    return {
      platform_user_id: u.id,
      day:              todayStr,
      completed_count:  completedCount,
      remaining_count:  remainingCount,
      cleared_queue:    clearedQueue,
    };
  });

  const { error: upsertError } = await supabase
    .from('cx_daily_completions')
    .upsert(upsertRows, { onConflict: 'platform_user_id,day' });

  if (upsertError) {
    log(`ERROR upserting cx_daily_completions: ${upsertError.message}`);
  } else {
    log(`Upserted ${upsertRows.length} daily completion row(s)`);
  }

  log('Win detection cron completed (V6)');
}
