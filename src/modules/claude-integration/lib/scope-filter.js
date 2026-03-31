/**
 * Scope Filter
 *
 * Allowlist-based field filtering for Claude context responses.
 *
 * DESIGN: Fields are explicitly allowed per scope level.
 * Any Odoo field added in the future is EXCLUDED by default unless
 * the allowlist is updated. This is the safe-by-default posture.
 *
 * Scope hierarchy (each level is a superset of the one above):
 *   own_leads    – only the requesting user's own leads, minimal fields
 *   team_view    – full team's leads + team/user identifiers
 *   full_context – all team leads + relationship fields (no private notes / email / phone)
 *
 * @module modules/claude-integration/lib/scope-filter
 */

// ─── Allowlists ─────────────────────────────────────────────────────────────

const OWN_LEADS_FIELDS = [
  'id',
  'name',
  'stage_id',
  'planned_revenue',
  'create_date',
  'date_deadline',
  'kanban_state',
  'probability',
  'active'
];

const TEAM_VIEW_FIELDS = [
  ...OWN_LEADS_FIELDS,
  'user_id',
  'team_id'
];

const FULL_CONTEXT_FIELDS = [
  ...TEAM_VIEW_FIELDS,
  'tag_ids',
  'partner_id',
  'priority',
  'type',
  'write_date'
];

/**
 * Exported allowlists (used by the UI "What Claude can access" preview).
 */
export const SCOPE_FIELD_ALLOWLIST = {
  own_leads:    OWN_LEADS_FIELDS,
  team_view:    TEAM_VIEW_FIELDS,
  full_context: FULL_CONTEXT_FIELDS
};

/** Allowed scope values */
export const VALID_SCOPES = Object.keys(SCOPE_FIELD_ALLOWLIST);

// ─── filtering helpers ───────────────────────────────────────────────────────

/**
 * Pick only the allowed fields from a single record object.
 *
 * @param {Object} record
 * @param {string[]} allowedFields
 * @returns {Object}
 */
function pickFields(record, allowedFields) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => allowedFields.includes(key))
  );
}

/**
 * Determine whether a record belongs to userId based on common Odoo user_id patterns.
 * Odoo returns many2one fields as [id, name] tuples OR plain ids depending on the call.
 *
 * @param {Object} record
 * @param {string|number} userId  Numeric Odoo user id (env.UID)
 * @returns {boolean}
 */
function isOwnedByUser(record, userId) {
  if (!record.user_id) return false;
  const id = Array.isArray(record.user_id) ? record.user_id[0] : record.user_id;
  // eslint-disable-next-line eqeqeq
  return id == userId; // loose equality: string '5' == number 5
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Apply scope-based allowlist filtering to an array of Odoo records.
 *
 * 1. For 'own_leads': filters to records owned by userId, then strips fields.
 * 2. For 'team_view': keeps all records, strips fields.
 * 3. For 'full_context': keeps all records, allows the widest field set.
 *
 * @param {Object[]} records     Raw Odoo records
 * @param {string}   scope       One of VALID_SCOPES
 * @param {string|number} userId Numeric Odoo user id for own_leads filtering
 * @returns {Object[]}
 */
export function applyAllowlistFilter(records, scope, userId) {
  if (!Array.isArray(records)) return [];

  const allowedFields = SCOPE_FIELD_ALLOWLIST[scope] ?? OWN_LEADS_FIELDS;

  let filtered = records;

  if (scope === 'own_leads') {
    filtered = records.filter(r => isOwnedByUser(r, userId));
  }

  return filtered.map(r => pickFields(r, allowedFields));
}

/**
 * Validate that all requested scopes are known valid values.
 *
 * @param {string[]} scopes
 * @returns {{ valid: boolean, unknown: string[] }}
 */
export function validateScopes(scopes) {
  const unknown = (scopes ?? []).filter(s => !VALID_SCOPES.includes(s));
  return { valid: unknown.length === 0, unknown };
}

/**
 * Return the most permissive scope from a list.
 * Handles the case where an integration has multiple scopes by resolving
 * to the widest one for context building.
 *
 * @param {string[]} scopes
 * @returns {string}
 */
export function resolveEffectiveScope(scopes) {
  if (!scopes || scopes.length === 0) return 'own_leads';
  if (scopes.includes('full_context')) return 'full_context';
  if (scopes.includes('team_view'))    return 'team_view';
  return 'own_leads';
}
