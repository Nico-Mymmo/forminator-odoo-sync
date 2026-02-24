/**
 * Event Operations Routes
 */

import { LOG_PREFIX, EMOJI, SYNC_STATUS, WP_META_KEYS } from './constants.js';
import { getOdooWebinars, getRegistrationCountsByWebinar, getWebinarRegistrations, getAllOdooEventTypes, updateOdooWebinar, getWebinarRecapFields, getWebinarRecapSentStatus, updateWebinarRecapFields, sendWebinarRecap } from './odoo-client.js';
import { getWordPressEvents, getWordPressEventsWithMeta, getWordPressEvent, publishToWordPress, getWordPressEventCategories } from './wp-client.js';
import { getSupabaseAdminClient } from './lib/supabaseClient.js';
import { computeEventState } from './state-engine.js';
import { extractOdooWebinarId } from './mapping.js';
import { eventOperationsUI } from './ui.js';
import { getEventTypeTagMappings, upsertEventTypeTagMapping, deleteEventTypeTagMapping } from './tag-mapping.js';
import { validateEditorialContent } from './editorial.js';
import { eventRegistrationRoutes } from './routes/event-registrations.js';
import { parseVideoUrl, fetchVideoThumbnailBuffer, storeThumbnailInR2, computeRecapReady } from './services/recap-service.js';

const SYNC_WORKER_CONCURRENCY = 5;
const SNAPSHOT_UPSERT_BATCH_SIZE = 25;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function elapsedMs(start) {
  return Math.round((nowMs() - start) * 100) / 100;
}

function chunkArray(items, chunkSize) {
  if (!Array.isArray(items) || items.length === 0 || chunkSize <= 0) {
    return [];
  }

  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function pickFirst(record, candidates) {
  for (const candidate of candidates) {
    if (record?.[candidate] !== undefined && record?.[candidate] !== null) {
      return record[candidate];
    }
  }
  return null;
}

function parseBooleanLike(value) {
  if (value === true || value === 1 || value === '1') {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 'y';
  }

  return false;
}

function parseMany2OneId(value) {
  if (Array.isArray(value) && value.length > 0) {
    const candidate = Number(value[0]);
    return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
  }

  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
}

function parseDateMs(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeRegistrationStats(records) {
  const rows = Array.isArray(records) ? records : [];

  let attendedCount = 0;
  let contactCreatedCount = 0;
  let leadCreatedCount = 0;
  let confirmationSentCount = 0;
  let reminderSentCount = 0;
  let recapSentCount = 0;
  let maxWriteDateMs = null;
  let maxWriteDateRaw = null;

  for (const row of rows) {
    const attended = parseBooleanLike(
      pickFirst(row, ['x_studio_webinar_attended', 'x_webinar_attended', 'attended'])
    );
    if (attended) {
      attendedCount += 1;
    }

    const contactCreated = parseBooleanLike(
      pickFirst(row, ['x_studio_contact_created', 'x_contact_created', 'contact_created'])
    );
    if (contactCreated) {
      contactCreatedCount += 1;
    }

    const leadCreatedFlag = parseBooleanLike(
      pickFirst(row, ['x_studio_lead_created', 'x_lead_created', 'lead_created'])
    );
    const leadId = parseMany2OneId(
      pickFirst(row, ['x_studio_linked_lead', 'x_linked_lead', 'lead_id', 'opportunity_id'])
    );
    if (leadCreatedFlag || leadId) {
      leadCreatedCount += 1;
    }

    const confirmationSent = parseBooleanLike(
      pickFirst(row, [
        'x_studio_confirmation_email_sent',
        'x_confirmation_email_sent',
        'confirmation_email_sent',
        'x_studio_confirmation_sent',
        'x_confirmation_sent',
        'confirmation_sent'
      ])
    );
    if (confirmationSent) {
      confirmationSentCount += 1;
    }

    const reminderSent = parseBooleanLike(
      pickFirst(row, [
        'x_studio_reminder_email_sent',
        'x_reminder_email_sent',
        'reminder_email_sent',
        'x_studio_reminder_sent',
        'x_reminder_sent',
        'reminder_sent'
      ])
    );
    if (reminderSent) {
      reminderSentCount += 1;
    }

    const recapSent = parseBooleanLike(
      pickFirst(row, [
        'x_studio_recap_email_sent',
        'x_recap_email_sent',
        'recap_email_sent',
        'x_studio_recap_sent',
        'x_recap_sent',
        'recap_sent'
      ])
    );
    if (recapSent) {
      recapSentCount += 1;
    }

    const writeDateRaw = pickFirst(row, ['write_date']);
    const writeDateMs = parseDateMs(writeDateRaw);
    if (writeDateMs !== null && (maxWriteDateMs === null || writeDateMs > maxWriteDateMs)) {
      maxWriteDateMs = writeDateMs;
      maxWriteDateRaw = writeDateRaw;
    }
  }

  return {
    total: rows.length,
    attended_count: attendedCount,
    contact_created_count: contactCreatedCount,
    lead_created_count: leadCreatedCount,
    confirmation_sent_count: confirmationSentCount,
    reminder_sent_count: reminderSentCount,
    recap_sent_count: recapSentCount,
    any_confirmation_sent: confirmationSentCount > 0,
    any_reminder_sent: reminderSentCount > 0,
    any_recap_sent: recapSentCount > 0,
    last_registration_write_date: maxWriteDateRaw || null
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const normalizedConcurrency = Math.max(1, Number(concurrency) || 1);
  const values = Array.isArray(items) ? items : [];
  const results = new Array(values.length);
  let currentIndex = 0;

  async function executeWorker() {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;
      if (index >= values.length) {
        return;
      }

      results[index] = await worker(values[index], index);
    }
  }

  const workerCount = Math.min(normalizedConcurrency, values.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => executeWorker()));

  return results;
}

export const routes = {
  ...eventRegistrationRoutes,

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
      
      const webinarIds = webinars.map((webinar) => webinar.id);
      const groupedCounts = await getRegistrationCountsByWebinar(env, webinarIds);
      const registrationCounts = {};

      for (const webinarId of webinarIds) {
        registrationCounts[webinarId] = groupedCounts[webinarId] || 0;
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${webinars.length} webinars with registration counts`);
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          webinars,
          registrationCounts
        }
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
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
   * GET /events/api/published-webinar-ids
   * Return Odoo webinar IDs that have at least one snapshot with
   * computed_state 'published' or 'out_of_sync' (live on WordPress).
   * Uses admin client (bypasses RLS) — intentionally cross-user.
   *
   * Response: { success: true, data: [44, 51, ...] }
   */
  'GET /api/published-webinar-ids': async (context) => {
    const { env } = context;
    try {
      const supabase = await getSupabaseAdminClient(env);
      const { data, error } = await supabase
        .from('webinar_snapshots')
        .select('odoo_webinar_id')
        .in('computed_state', [SYNC_STATUS.PUBLISHED, SYNC_STATUS.OUT_OF_SYNC]);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      const ids = [...new Set((data || []).map(r => r.odoo_webinar_id))];
      return new Response(JSON.stringify({ success: true, data: ids }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} published-webinar-ids failed:`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
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
    const { env } = context;
    
    try {
      const supabase = await getSupabaseAdminClient(env);
      
      const { data, error } = await supabase
        .from('webinar_snapshots')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
      
      console.log(`${LOG_PREFIX} 📋 ${data.length} snapshots (states: ${data.map(s => s.computed_state).join(', ')})`);
      
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
      const { odoo_webinar_id, status = 'publish' } = body;
      
      if (!odoo_webinar_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing required field: odoo_webinar_id'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Validate status
      const validStatuses = ['publish', 'draft', 'private'];
      const wpStatus = validStatuses.includes(status) ? status : 'publish';
      
      console.log(`${LOG_PREFIX} ${EMOJI.PUBLISH} Publishing webinar ${odoo_webinar_id} status=${wpStatus}`);
      
      const result = await publishToWordPress(env, user.id, odoo_webinar_id, wpStatus);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Published: WP#${result.wp_event_id} state=${result.computed_state}`);
      
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
    const { env } = context;
    
    try {
      const supabase = await getSupabaseAdminClient(env);
      
      const { data, error } = await supabase
        .from('webinar_snapshots')
        .select('*')
        .eq('computed_state', SYNC_STATUS.OUT_OF_SYNC)
        .order('updated_at', { ascending: false });
      
      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
      
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
      const syncStartedAt = nowMs();
      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Sync request received user=${user.id}`);
      const syncMetrics = {
        total_sync_ms: 0,
        fetch_odoo_ms: 0,
        fetch_wp_core_ms: 0,
        wp_detail_total_ms: 0,
        wp_detail_count: 0,
        snapshot_upsert_total_ms: 0,
        snapshot_upsert_count: 0
      };

      // 1. Fetch all sources in parallel
      // Core API returns flat array WITH meta (Tribe API does not include meta)
      const prefetchStartedAt = nowMs();
      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Prefetch stage started`);

      const odooFetchPromise = (async () => {
        const startedAt = nowMs();
        const data = await getOdooWebinars(env);
        syncMetrics.fetch_odoo_ms = elapsedMs(startedAt);
        return data;
      })();

      const wpCoreFetchPromise = (async () => {
        const startedAt = nowMs();
        const data = await getWordPressEventsWithMeta(env);
        syncMetrics.fetch_wp_core_ms = elapsedMs(startedAt);
        return data;
      })();

      const [odooWebinars, wpEvents, supabase, eventTypeMappings] = await Promise.all([
        odooFetchPromise,
        wpCoreFetchPromise,
        getSupabaseAdminClient(env),
        getEventTypeTagMappings(env)
      ]);

      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Prefetch stage completed in ${Math.round(elapsedMs(prefetchStartedAt))}ms (odoo=${odooWebinars.length}, wp_core=${wpEvents.length})`);

      const mappingByEventTypeId = new Map(
        (eventTypeMappings || []).map((mapping) => [mapping.odoo_event_type_id, mapping])
      );

      const validationErrors = [];
      for (const webinar of odooWebinars) {
        const relation = webinar.x_webinar_event_type_id;
        if (!Array.isArray(relation) || relation.length === 0) {
          validationErrors.push({
            odoo_webinar_id: webinar.id,
            error: 'Missing x_webinar_event_type_id'
          });
          continue;
        }

        const eventTypeId = Number(relation[0]);
        if (!Number.isInteger(eventTypeId) || eventTypeId <= 0) {
          validationErrors.push({
            odoo_webinar_id: webinar.id,
            error: 'Invalid x_webinar_event_type_id value'
          });
          continue;
        }

        if (!mappingByEventTypeId.has(eventTypeId)) {
          validationErrors.push({
            odoo_webinar_id: webinar.id,
            odoo_event_type_id: eventTypeId,
            error: `Missing mapping in event_type_wp_tag_mapping for event type ${eventTypeId}`
          });
        }
      }

      if (validationErrors.length > 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Sync validation failed: missing/invalid event type mappings',
          data: {
            validation_errors: validationErrors
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
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
      const snapshotRows = [];

      const wpDetailStageStartedAt = nowMs();
      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} WP detail + state stage started`);

      await runWithConcurrency(
        odooWebinars,
        SYNC_WORKER_CONCURRENCY,
        async (odooWebinar) => {
          const wpCoreEvent = wpByOdooId.get(odooWebinar.id) || null;

          let registrationStats = {
            total: 0,
            attended_count: 0,
            contact_created_count: 0,
            lead_created_count: 0,
            confirmation_sent_count: 0,
            reminder_sent_count: 0,
            recap_sent_count: 0,
            any_confirmation_sent: false,
            any_reminder_sent: false,
            any_recap_sent: false,
            last_registration_write_date: null
          };

          try {
            const registrationRows = await getWebinarRegistrations(env, odooWebinar.id, {
              limit: false,
              order: 'write_date desc, id desc'
            });
            registrationStats = computeRegistrationStats(registrationRows);
          } catch (error) {
            console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Registration aggregation failed for webinar ${odooWebinar.id}:`, error.message);
          }

          // If event exists in WordPress, fetch Tribe API version for accurate snapshot
          // (Core API doesn't include Tribe-specific fields like start_date, categories, etc.)
          let wpEvent = null;
          if (wpCoreEvent) {
            const wpDetailStartedAt = nowMs();
            try {
              wpEvent = await getWordPressEvent(env, wpCoreEvent.id);
            } catch (error) {
              console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Failed to fetch Tribe event ${wpCoreEvent.id}:`, error.message);
              wpEvent = wpCoreEvent; // Fallback to Core API data
            } finally {
              syncMetrics.wp_detail_total_ms += elapsedMs(wpDetailStartedAt);
              syncMetrics.wp_detail_count += 1;
            }
          }

          let state;
          try {
            state = computeEventState(odooWebinar, wpEvent);
          } catch (error) {
            console.error(`${LOG_PREFIX} ${EMOJI.ERROR} State compute failed for webinar ${odooWebinar.id}:`, error.message);
            state = SYNC_STATUS.NOT_PUBLISHED;
          }

          snapshotRows.push({
            odoo_webinar_id: odooWebinar.id,
            odoo_snapshot: odooWebinar,
            wp_snapshot: wpEvent, // Store full Tribe API event data (includes all fields like categories)
            computed_state: state,
            registration_stats: registrationStats,
            last_synced_at: new Date().toISOString()
          });

          results.push({ odoo_id: odooWebinar.id, state });

          if (state === SYNC_STATUS.OUT_OF_SYNC) {
            discrepancies.push({
              odoo_webinar_id: odooWebinar.id,
              title: odooWebinar.x_name,
              state
            });
          }
        }
      );

      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} WP detail + state stage completed in ${Math.round(elapsedMs(wpDetailStageStartedAt))}ms (wp_detail_count=${syncMetrics.wp_detail_count}, snapshots_prepared=${snapshotRows.length})`);

      const snapshotBatches = chunkArray(snapshotRows, SNAPSHOT_UPSERT_BATCH_SIZE);
      console.log(`${LOG_PREFIX} 💾 Snapshot batch upsert: ${snapshotRows.length} rows in ${snapshotBatches.length} batch(es), batch_size=${SNAPSHOT_UPSERT_BATCH_SIZE}`);

      const snapshotWriteStageStartedAt = nowMs();
      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Snapshot write stage started`);

      await runWithConcurrency(
        snapshotBatches,
        SYNC_WORKER_CONCURRENCY,
        async (batchRows, batchIndex) => {
          const upsertStartedAt = nowMs();
          const { error } = await supabase
            .from('webinar_snapshots')
            .upsert(batchRows, {
              onConflict: 'odoo_webinar_id'
            });

          if (!error) {
            syncMetrics.snapshot_upsert_total_ms += elapsedMs(upsertStartedAt);
            syncMetrics.snapshot_upsert_count += batchRows.length;
            console.log(`${LOG_PREFIX} 💾 Snapshot batch ${batchIndex + 1}/${snapshotBatches.length} upserted (${batchRows.length} rows)`);
            return;
          }

          console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Snapshot batch ${batchIndex + 1}/${snapshotBatches.length} upsert failed (${batchRows.length} rows):`, error.message);

          // Partial failure handling: isolate failures per row to avoid data loss
          for (const row of batchRows) {
            const rowStartedAt = nowMs();
            const { error: rowError } = await supabase
              .from('webinar_snapshots')
              .upsert(row, {
                onConflict: 'odoo_webinar_id'
              });

            syncMetrics.snapshot_upsert_total_ms += elapsedMs(rowStartedAt);
            syncMetrics.snapshot_upsert_count += 1;

            if (rowError) {
              console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Snapshot row upsert failed for webinar ${row.odoo_webinar_id}:`, rowError.message);
            }
          }
        }
      );

      console.log(`${LOG_PREFIX} ${EMOJI.SYNC} Snapshot write stage completed in ${Math.round(elapsedMs(snapshotWriteStageStartedAt))}ms`);

      syncMetrics.total_sync_ms = elapsedMs(syncStartedAt);

      const structuredMetrics = {
        total_sync_ms: Math.round(syncMetrics.total_sync_ms),
        fetch_odoo_ms: Math.round(syncMetrics.fetch_odoo_ms),
        fetch_wp_core_ms: Math.round(syncMetrics.fetch_wp_core_ms),
        wp_detail_total_ms: Math.round(syncMetrics.wp_detail_total_ms),
        wp_detail_count: syncMetrics.wp_detail_count,
        snapshot_upsert_total_ms: Math.round(syncMetrics.snapshot_upsert_total_ms),
        snapshot_upsert_count: syncMetrics.snapshot_upsert_count
      };

      console.log(`${LOG_PREFIX} 📊 SYNC_TIMING ${JSON.stringify(structuredMetrics)}`);
      
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
   * GET /events/api/event-type-tag-mappings
   * Get all event type mappings for current user
   */
  'GET /api/event-type-tag-mappings': async (context) => {
    const { env, user } = context;
    
    try {
      console.log(`${LOG_PREFIX} 🏷️  Fetching event type mappings for user ${user.id}...`);
      
      const mappings = await getEventTypeTagMappings(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${mappings.length} event type mappings`);
      
      return new Response(JSON.stringify({
        success: true,
        data: mappings
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch event type mappings failed:`, error);
      
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
   * PUT /events/api/event-type-tag-mappings
   * Upsert event type mapping
   * 
   * Body: { odoo_event_type_id, wp_tag_id, wp_tag_slug, wp_tag_name }
   */
  'PUT /api/event-type-tag-mappings': async (context) => {
    const { env, user, request } = context;
    
    try {
      const body = await request.json();
      const { odoo_event_type_id, wp_tag_id, wp_tag_slug, wp_tag_name, calendar_color } = body;
      
      if (!odoo_event_type_id || !wp_tag_id || !wp_tag_slug || !wp_tag_name) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing required fields: odoo_event_type_id, wp_tag_id, wp_tag_slug, wp_tag_name'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const odooEventTypeId = Number(odoo_event_type_id);
      const wpTagId = Number(wp_tag_id);

      if (!Number.isInteger(odooEventTypeId) || !Number.isInteger(wpTagId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'odoo_event_type_id and wp_tag_id must be integers'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`${LOG_PREFIX} 🏷️  Upserting event type mapping: ${odooEventTypeId} → ${wp_tag_name} (${wpTagId})...`);
      
      const mapping = await upsertEventTypeTagMapping(env, {
        odoo_event_type_id: odooEventTypeId,
        wp_tag_id: wpTagId,
        wp_tag_slug,
        wp_tag_name,
        calendar_color: calendar_color || 'primary'
      });
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Event type mapping saved`);
      
      return new Response(JSON.stringify({
        success: true,
        data: mapping
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Upsert event type mapping failed:`, error);
      
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
  * DELETE /events/api/event-type-tag-mappings/:id
  * Delete event type mapping
   */
  'DELETE /api/event-type-tag-mappings/:id': async (context) => {
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
      
      console.log(`${LOG_PREFIX} 🏷️  Deleting event type mapping ${id}...`);
      
      await deleteEventTypeTagMapping(env, id);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Event type mapping deleted`);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Delete event type mapping failed:`, error);
      
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
   * GET /events/api/odoo-event-types
   * Get all available Odoo event types
   */
  'GET /api/odoo-event-types': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} 🏷️  Fetching Odoo event types...`);
      
      const eventTypes = await getAllOdooEventTypes(env);
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Found ${eventTypes.length} Odoo event types`);
      
      return new Response(JSON.stringify({
        success: true,
        data: eventTypes
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch Odoo event types failed:`, error);
      
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
   * Get WordPress event categories (tribe_events_cat)
   */
  'GET /api/wp-event-categories': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} 🏷️  Fetching WordPress event categories...`);
      
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
    const { env, params } = context;
    
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
        .select('editorial_content, editorial_mode, selected_form_id')
        .eq('odoo_webinar_id', odooWebinarId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = not found (acceptable)
        throw error;
      }
      
      const editorialContent = snapshot?.editorial_content || null;
      const editorialMode = snapshot?.editorial_mode || 'never_edited';
      const selectedFormId = snapshot?.selected_form_id || null;
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Editorial data retrieved: mode=${editorialMode}, formId=${selectedFormId}`);
      
      return new Response(JSON.stringify({
        success: true,
        data: editorialContent,
        editorialMode: editorialMode,
        selectedFormId: selectedFormId
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
   * GET /events/api/forms
   * Fetch available Forminator forms from database
   */
  'GET /api/forms': async (context) => {
    const { env } = context;
    
    try {
      console.log(`${LOG_PREFIX} 📝 Fetching Forminator forms from database...`);
      
      const supabase = await getSupabaseAdminClient(env);
      
      const { data: forms, error } = await supabase
        .from('forminator_forms')
        .select('form_id, form_name, description')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      // Transform to expected format
      const formattedForms = (forms || []).map(form => ({
        id: form.form_id,
        name: form.form_name,
        description: form.description
      }));
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Forms list retrieved (${formattedForms.length} forms)`);
      
      return new Response(JSON.stringify({
        success: true,
        data: formattedForms
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch forms failed:`, error);
      
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
   * GET /events/api/forminator-forms
   * Get all forminator forms (including inactive, for admin management)
   */
  'GET /api/forminator-forms': async (context) => {
    const { env } = context;
    
    try {
      const supabase = await getSupabaseAdminClient(env);
      
      const { data: forms, error } = await supabase
        .from('forminator_forms')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      return new Response(JSON.stringify({
        success: true,
        data: forms || []
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch forminator forms failed:`, error);
      
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
   * POST /events/api/forminator-forms
   * Create new forminator form
   */
  'POST /api/forminator-forms': async (context) => {
    const { env, request } = context;
    
    try {
      const body = await request.json();
      const { form_id, form_name, description, is_active, display_order } = body;
      
      if (!form_id || !form_name) {
        return new Response(JSON.stringify({
          success: false,
          error: 'form_id and form_name are required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const supabase = await getSupabaseAdminClient(env);
      
      const { data, error } = await supabase
        .from('forminator_forms')
        .insert({
          form_id,
          form_name,
          description: description || null,
          is_active: is_active !== undefined ? is_active : true,
          display_order: display_order || 0
        })
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Forminator form created: ${form_id}`);
      
      return new Response(JSON.stringify({
        success: true,
        data: data
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Create forminator form failed:`, error);
      
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
   * PUT /events/api/forminator-forms/:id
   * Update forminator form
   */
  'PUT /api/forminator-forms/:id': async (context) => {
    const { env, params, request } = context;
    
    try {
      const { id } = params;
      const formId = parseInt(id, 10);
      
      if (!formId || isNaN(formId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid form ID'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const body = await request.json();
      const { form_id, form_name, description, is_active, display_order } = body;
      
      const supabase = await getSupabaseAdminClient(env);
      
      const updateData = {};
      if (form_id !== undefined) updateData.form_id = form_id;
      if (form_name !== undefined) updateData.form_name = form_name;
      if (description !== undefined) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (display_order !== undefined) updateData.display_order = display_order;
      
      const { data, error } = await supabase
        .from('forminator_forms')
        .update(updateData)
        .eq('id', formId)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Forminator form updated: ${formId}`);
      
      return new Response(JSON.stringify({
        success: true,
        data: data
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Update forminator form failed:`, error);
      
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
   * DELETE /events/api/forminator-forms/:id
   * Delete forminator form
   */
  'DELETE /api/forminator-forms/:id': async (context) => {
    const { env, params } = context;
    
    try {
      const { id } = params;
      const formId = parseInt(id, 10);
      
      if (!formId || isNaN(formId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid form ID'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const supabase = await getSupabaseAdminClient(env);
      
      const { error } = await supabase
        .from('forminator_forms')
        .delete()
        .eq('id', formId);
      
      if (error) {
        throw error;
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Forminator form deleted: ${formId}`);
      
      return new Response(JSON.stringify({
        success: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Delete forminator form failed:`, error);
      
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
    const { env, params, request } = context;
    
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
      const { editorialContent, editorialMode, selectedFormId } = body;
      
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
      
      console.log(`${LOG_PREFIX} 📝 Saving editorial for webinar ${odooWebinarId}, mode=${editorialMode}, formId=${selectedFormId}...`);
      
      const supabase = await getSupabaseAdminClient(env);
      
      // Check if snapshot exists
      const { data: existingSnapshot } = await supabase
        .from('webinar_snapshots')
        .select('id')
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
      
      // Build update data (only include provided fields)
      const updateData = {};
      if (editorialContent !== undefined) {
        updateData.editorial_content = editorialContent;
      }
      if (editorialMode !== undefined) {
        updateData.editorial_mode = editorialMode;
      }
      if (selectedFormId !== undefined) {
        updateData.selected_form_id = selectedFormId;
      }
      
      // Update fields
      const { error: updateError } = await supabase
        .from('webinar_snapshots')
        .update(updateData)
        .eq('odoo_webinar_id', odooWebinarId);
      
      if (updateError) {
        throw updateError;
      }
      
      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Editorial data saved`);
      
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
  },

  /**
   * PATCH /events/api/odoo-webinars/:id
   * Update fields on an Odoo webinar (e.g. description)
   */
  'PATCH /api/odoo-webinars/:id': async (context) => {
    const { env, params, request } = context;

    try {
      const webinarId = parseInt(params.id, 10);
      if (!webinarId || isNaN(webinarId)) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webinar ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();

      // Only allow updating the description field
      const allowedFields = ['x_studio_webinar_info'];
      const values = {};
      for (const field of allowedFields) {
        if (field in body) {
          values[field] = body[field];
        }
      }

      if (Object.keys(values).length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No valid fields to update' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log(`${LOG_PREFIX} 📝 Updating Odoo webinar ${webinarId}:`, Object.keys(values));

      await updateOdooWebinar(env, webinarId, values);

      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Odoo webinar ${webinarId} updated`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Update Odoo webinar failed:`, error);

      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RECAP ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /events/api/webinar/:id/recap
   * Fetch recap fields + computed ready status for one webinar.
   */
  'GET /api/webinar/:id/recap': async (context) => {
    const { env, params } = context;
    try {
      const webinarId = parseInt(params.id, 10);
      if (!webinarId) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webinar ID' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const [webinar, recapSent] = await Promise.all([
        getWebinarRecapFields(env, webinarId),
        getWebinarRecapSentStatus(env, webinarId)
      ]);
      if (!webinar) {
        return new Response(JSON.stringify({ success: false, error: 'Webinar not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' }
        });
      }

      const { ready, reasons } = computeRecapReady(webinar);

      return new Response(JSON.stringify({
        success: true,
        data: {
          webinar_id: webinarId,
          video_url:      webinar.x_studio_vimeo_url      || null,
          thumbnail_url:  webinar.x_studio_vimeo_thumbnail_url || null,
          followup_html:  webinar.x_studio_followup_html  || '',
          recap_sent:     recapSent,
          recap_ready:    ready,
          recap_reasons:  reasons
        }
      }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} GET recap failed:`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * POST /events/api/webinar/:id/video-url
   * Body: { url: string }
   *
   * 1. Detect platform (YouTube / Vimeo)
   * 2. Fetch official thumbnail server-side
   * 3. Store in R2 as webinars/{id}/thumbnail.jpg
   * 4. Sync video_url + thumbnail_url to Odoo
   */
  'POST /api/webinar/:id/video-url': async (context) => {
    const { env, params, request } = context;
    try {
      const webinarId = parseInt(params.id, 10);
      if (!webinarId) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webinar ID' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const { url } = await request.json();
      if (typeof url !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'Missing or invalid "url" field' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      // Empty URL → clear video_url and thumbnail_url in Odoo
      if (!url.trim()) {
        await updateWebinarRecapFields(env, webinarId, { video_url: '', thumbnail_url: '' });
        return new Response(JSON.stringify({ success: true, data: { cleared: true } }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 1. Parse URL
      const parsed = parseVideoUrl(url);
      if (!parsed) {
        return new Response(JSON.stringify({ success: false, error: 'Geen geldige YouTube of Vimeo URL herkend' }), {
          status: 422, headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log(`${LOG_PREFIX} Processing ${parsed.platform} video ${parsed.id} for webinar ${webinarId}`);

      // 2. Fetch thumbnail
      const { buffer, mimeType } = await fetchVideoThumbnailBuffer(parsed);

      // 3. Store in R2
      const { url: thumbnailUrl } = await storeThumbnailInR2(env, webinarId, buffer, mimeType, 'auto');

      // 4. Sync to Odoo
      await updateWebinarRecapFields(env, webinarId, {
        video_url:     url.trim(),
        thumbnail_url: thumbnailUrl
      });

      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Video URL processed for webinar ${webinarId}`);

      return new Response(JSON.stringify({
        success: true,
        data: { platform: parsed.platform, thumbnail_url: thumbnailUrl }
      }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} video-url failed:`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * POST /events/api/webinar/:id/thumbnail
   * Multipart form: file field "thumbnail"
   *
   * Accepts a custom thumbnail upload, stores it in R2 (overwriting the
   * auto-generated one), and syncs the URL to Odoo.
   */
  'POST /api/webinar/:id/thumbnail': async (context) => {
    const { env, params, request } = context;
    try {
      const webinarId = parseInt(params.id, 10);
      if (!webinarId) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webinar ID' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const formData = await request.formData();
      const file = formData.get('thumbnail');
      if (!file || typeof file.arrayBuffer !== 'function') {
        return new Response(JSON.stringify({ success: false, error: 'Missing file field "thumbnail"' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const buffer   = await file.arrayBuffer();
      const mimeType = file.type || 'image/jpeg';

      if (!mimeType.startsWith('image/')) {
        return new Response(JSON.stringify({ success: false, error: 'Bestand moet een afbeelding zijn' }), {
          status: 422, headers: { 'Content-Type': 'application/json' }
        });
      }

      const { url: thumbnailUrl } = await storeThumbnailInR2(env, webinarId, buffer, mimeType, 'upload');

      await updateWebinarRecapFields(env, webinarId, { thumbnail_url: thumbnailUrl });

      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Custom thumbnail stored for webinar ${webinarId}`);

      return new Response(JSON.stringify({
        success: true,
        data: { thumbnail_url: thumbnailUrl }
      }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} thumbnail upload failed:`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * PUT /events/api/webinar/:id/recap-html
   * Body: { html: string }
   *
   * Save recap HTML locally (Odoo field x_studio_followup_html).
   */
  'PUT /api/webinar/:id/recap-html': async (context) => {
    const { env, params, request } = context;
    try {
      const webinarId = parseInt(params.id, 10);
      if (!webinarId) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webinar ID' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      const { html } = await request.json();
      if (typeof html !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'Missing "html" field' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      await updateWebinarRecapFields(env, webinarId, { followup_html: html });

      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Recap HTML saved for webinar ${webinarId} (${html.length} chars)`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} recap-html failed:`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * POST /events/api/webinar/:id/send-recap
   *
   * Trigger Odoo recap mail send (idempotent: Odoo filters already-sent).
   * Returns number of mails sent + any errors from Odoo.
   */
  'POST /api/webinar/:id/send-recap': async (context) => {
    const { env, params } = context;
    try {
      const webinarId = parseInt(params.id, 10);
      if (!webinarId) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid webinar ID' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      // Guard: verify recap is ready before sending
      const webinar = await getWebinarRecapFields(env, webinarId);
      if (!webinar) {
        return new Response(JSON.stringify({ success: false, error: 'Webinar niet gevonden' }), {
          status: 404, headers: { 'Content-Type': 'application/json' }
        });
      }

      const { ready, reasons } = computeRecapReady(webinar);
      if (!ready) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Recap is nog niet klaar: ' + reasons.join(', ')
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      // Guard: prevent re-send if already sent
      const alreadySent = await getWebinarRecapSentStatus(env, webinarId);
      if (alreadySent) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Recap is al eerder verstuurd',
          already_sent: true
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      console.log(`${LOG_PREFIX} Sending recap for webinar ${webinarId}...`);

      const odooResult = await sendWebinarRecap(env, webinarId);

      console.log(`${LOG_PREFIX} ${EMOJI.SUCCESS} Recap sent for webinar ${webinarId}:`, odooResult);

      return new Response(JSON.stringify({
        success: true,
        data: { odoo_result: odooResult, sent_at: new Date().toISOString() }
      }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
      console.error(`${LOG_PREFIX} ${EMOJI.ERROR} send-recap failed:`, error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
