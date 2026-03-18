/**
 * CX Powerboard — Win Detection Cron Handler
 *
 * Fires every 15 minutes via Cloudflare Scheduled Trigger.
 *
 * Algorithm (poll-and-diff):
 *  1. Load all platform users with odoo_uid
 *  2. Fetch all currently-open Odoo activities for those users (single batch call)
 *  3. Compare with cx_seen_activities (previous cron state)
 *  4. Activities that disappeared → closed/completed
 *     → if activity type is_win=true → insert into cx_processed_wins (idempotent)
 *  5. Delete closed activities from cx_seen_activities
 *  6. Upsert still-open + new activities into cx_seen_activities
 */

import { createClient } from '@supabase/supabase-js';
import { fetchActiveActivities } from '../odoo-client.js';
import { getMappings } from '../services/mapping-service.js';

export async function handleCxWinDetection(env) {
  const cronRunId = new Date().toISOString();
  const log = (msg) => console.log(`[cx_powerboard][${cronRunId}] ${msg}`);

  log('Win detection cron started');

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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

  // Map odoo_uid → platform_user_id for fast resolution later
  const odooUidToUserId = {};
  for (const u of trackedUsers) {
    odooUidToUserId[u.odoo_uid] = u.id;
  }
  const allOdooUids = trackedUsers.map(u => u.odoo_uid);
  log(`Tracking ${allOdooUids.length} user(s)`);

  // ── 2. Fetch currently-open Odoo activities ────────────────────────────────
  let odooActivities;
  try {
    odooActivities = await fetchActiveActivities(env, allOdooUids);
  } catch (err) {
    log(`ERROR fetching Odoo activities: ${err.message}`);
    return;
  }

  // Build a Set of currently-open activity IDs for fast diff lookup
  const currentlyOpenIds = new Set(odooActivities.map(a => a.id));
  log(`Odoo returned ${currentlyOpenIds.size} open activity(-ies)`);

  // ── 3. Load previously-seen activities ────────────────────────────────────
  const { data: seenRows, error: seenError } = await supabase
    .from('cx_seen_activities')
    .select('*');

  if (seenError) {
    log(`ERROR loading cx_seen_activities: ${seenError.message}`);
    return;
  }

  // ── 4. Load activity mappings (is_win flags + priority weights) ────────────
  let mappings;
  try {
    mappings = await getMappings(env);
  } catch (err) {
    log(`ERROR loading mappings: ${err.message}`);
    return;
  }

  const mappingByTypeId = {};
  for (const m of mappings) {
    mappingByTypeId[m.odoo_activity_type_id] = m;
  }

  // ── 5. Detect closed activities (disappeared from Odoo) ────────────────────
  const closedRows = (seenRows || []).filter(row => !currentlyOpenIds.has(row.odoo_activity_id));
  log(`${closedRows.length} activity(-ies) closed since last run`);

  const winRows = closedRows.filter(row => {
    const mapping = mappingByTypeId[row.activity_type_id];
    return mapping?.is_win === true;
  });
  log(`${winRows.length} win(s) detected`);

  // ── 6. Record wins (idempotent via UNIQUE on odoo_activity_id) ─────────────
  if (winRows.length > 0) {
    const winInserts = winRows.map(row => {
      const mapping = mappingByTypeId[row.activity_type_id];
      return {
        odoo_activity_id:    row.odoo_activity_id,
        platform_user_id:    row.platform_user_id,
        activity_type_id:    row.activity_type_id,
        activity_type_name:  row.activity_type_name,
        priority_weight:     mapping?.priority_weight ?? 1,
        won_at:              cronRunId,
        cron_run_id:         cronRunId,
      };
    });

    const { error: winError } = await supabase
      .from('cx_processed_wins')
      .upsert(winInserts, { onConflict: 'odoo_activity_id', ignoreDuplicates: true });

    if (winError) {
      log(`ERROR inserting wins: ${winError.message}`);
      // Non-fatal: continue to update seen state
    } else {
      log(`Inserted ${winRows.length} win(s) into cx_processed_wins`);
    }
  }

  // ── 7. Delete closed activities from cx_seen_activities ────────────────────
  if (closedRows.length > 0) {
    const closedIds = closedRows.map(r => r.odoo_activity_id);
    const { error: deleteError } = await supabase
      .from('cx_seen_activities')
      .delete()
      .in('odoo_activity_id', closedIds);

    if (deleteError) {
      log(`ERROR deleting closed rows: ${deleteError.message}`);
    }
  }

  // ── 8. Upsert currently-open activities into cx_seen_activities ────────────
  if (odooActivities.length > 0) {
    const upsertRows = odooActivities.map(a => {
      const typeId   = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
      const typeName = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
      const userId   = Array.isArray(a.user_id) ? a.user_id[0] : a.user_id;
      return {
        odoo_activity_id:   a.id,
        odoo_user_id:       userId,
        platform_user_id:   odooUidToUserId[userId] ?? null,
        activity_type_id:   typeId,
        activity_type_name: typeName,
        odoo_deadline:      a.date_deadline ?? null,
        last_seen_at:       cronRunId,
      };
    });

    const { error: upsertError } = await supabase
      .from('cx_seen_activities')
      .upsert(upsertRows, { onConflict: 'odoo_activity_id' });

    if (upsertError) {
      log(`ERROR upserting seen activities: ${upsertError.message}`);
    } else {
      log(`Upserted ${upsertRows.length} open activit(y/ies) into cx_seen_activities`);
    }
  }

  log('Win detection cron completed');
}
