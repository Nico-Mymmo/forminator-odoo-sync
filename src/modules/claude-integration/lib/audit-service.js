/**
 * Audit Service
 *
 * Write-once audit log for claude context endpoint calls.
 * Reads are admin-only (enforced in routes.js via requireAdmin).
 *
 * logContextCall is fire-and-forget: it uses ctx.waitUntil so the
 * Workers runtime can flush the DB write after the response is sent.
 *
 * @module modules/claude-integration/lib/audit-service
 */

import { getSupabaseClient } from '../../../lib/database.js';

/**
 * @typedef {Object} AuditEntry
 * @property {string}       integration_id
 * @property {string}       user_id
 * @property {string}       scope
 * @property {string}       endpoint
 * @property {boolean}      success
 * @property {string|null}  failure_reason
 * @property {number|null}  payload_size    Approximate bytes of context payload
 * @property {string|null}  ip_address
 */

/**
 * Log a context endpoint call.
 * Silently ignores write errors to avoid impacting response latency.
 *
 * @param {Object}     env
 * @param {Object}     ctx         Cloudflare ExecutionContext (for waitUntil)
 * @param {AuditEntry} entry
 */
export function logContextCall(env, ctx, entry) {
  const db = getSupabaseClient(env);

  const record = {
    integration_id: entry.integration_id ?? null,
    user_id:        entry.user_id ?? null,
    scope:          entry.scope ?? null,
    endpoint:       entry.endpoint ?? '/api/claude/context/full',
    success:        entry.success ?? true,
    failure_reason: entry.failure_reason ?? null,
    payload_size:   entry.payload_size ?? null,
    ip_address:     entry.ip_address ?? null
  };

  ctx.waitUntil(
    db.from('claude_audit_log').insert(record).then(({ error }) => {
      if (error) {
        console.error('⚠️ Audit log write failed:', error.message);
      }
    })
  );
}

/**
 * Retrieve audit log entries (admin-only; access enforced in routes).
 *
 * @param {Object} env
 * @param {Object} options
 * @param {number}      [options.limit=50]
 * @param {number}      [options.offset=0]
 * @param {string|null} [options.integrationId]  Filter by integration
 * @param {string|null} [options.userId]          Filter by user
 * @returns {Promise<{ entries: Object[], total: number }>}
 */
export async function getAuditLog(env, {
  limit         = 50,
  offset        = 0,
  integrationId = null,
  userId        = null
} = {}) {
  const db = getSupabaseClient(env);

  let query = db
    .from('claude_audit_log')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range(offset, offset + Math.min(limit, 200) - 1);

  if (integrationId) query = query.eq('integration_id', integrationId);
  if (userId)        query = query.eq('user_id', userId);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to fetch audit log: ${error.message}`);

  return { entries: data ?? [], total: count ?? 0 };
}
