/**
 * Claude Context Builder
 *
 * Fetches and structures Odoo data into a Claude-ready context object.
 * Uses search_read / executeKw from src/lib/odoo.js (the existing data layer).
 *
 * Responsibilities:
 *   – Pull pipeline summary, leads, activities, risks and opportunities
 *   – Apply allowlist-based scope filtering via scope-filter.js
 *   – Return a structured, size-capped payload (max 50 leads, 25 activities)
 *
 * NOT responsible for: auth, token validation, audit logging, UI logic.
 *
 * @module modules/claude-integration/lib/context-builder
 */

import { searchRead, executeKw } from '../../../lib/odoo.js';
import { applyAllowlistFilter, resolveEffectiveScope } from './scope-filter.js';

const MAX_LEADS       = 50;
const MAX_ACTIVITIES  = 25;
const MAX_RISKS       = 20;

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Build Odoo domain filter for timeframe + ownership scope.
 *
 * @param {string}        scope
 * @param {string|number} userId   Numeric Odoo uid
 * @param {string}        timeframe  'week' | 'month' | 'quarter' | 'year' | null
 * @param {string|null}   ownerId    Override user filter (admin usage)
 * @param {string|null}   pipelineId (optional) filter by team_id
 */
function buildLeadDomain(scope, userId, timeframe, ownerId, pipelineId) {
  const domain = [['active', '=', true]];

  if (scope === 'own_leads') {
    domain.push(['user_id', '=', Number(ownerId ?? userId)]);
  } else if (ownerId) {
    domain.push(['user_id', '=', Number(ownerId)]);
  }

  if (pipelineId) {
    domain.push(['team_id', '=', Number(pipelineId)]);
  }

  if (timeframe) {
    const from = getTimeframeStart(timeframe);
    if (from) {
      domain.push(['create_date', '>=', from]);
    }
  }

  return domain;
}

function getTimeframeStart(timeframe) {
  const now = new Date();
  switch (timeframe) {
    case 'week':    { const d = new Date(now); d.setDate(d.getDate() - 7);   return d.toISOString(); }
    case 'month':   { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    case 'quarter': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString(); }
    case 'year':    { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString(); }
    default: return null;
  }
}

/** Safely summarise pipeline_summary records into a simple stat map */
function summarisePipeline(groups) {
  if (!Array.isArray(groups)) return {};
  return groups.map(g => ({
    stage:           Array.isArray(g.stage_id) ? g.stage_id[1] : (g.stage_id ?? 'Unknown'),
    count:           g.stage_id_count ?? g.__count ?? 0,
    total_revenue:   g.planned_revenue ?? 0
  }));
}

/** Extract activity fields relevant for AI context */
function summariseActivity(act) {
  return {
    id:            act.id,
    lead_id:       Array.isArray(act.res_id) ? act.res_id : act.res_id,
    lead_name:     act.res_name ?? null,
    type:          Array.isArray(act.activity_type_id) ? act.activity_type_id[1] : (act.activity_type_id ?? null),
    summary:       act.summary ?? null,
    date_deadline: act.date_deadline ?? null,
    state:         act.state ?? null,
    user:          Array.isArray(act.user_id) ? act.user_id[1] : (act.user_id ?? null)
  };
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Build a structured context payload for Claude.
 *
 * @param {Object} env
 * @param {Object} options
 * @param {string[]} options.scopes        Integration scopes array
 * @param {string}   options.userId        Supabase user id (UUID)
 * @param {string}   options.odooUserId    Numeric Odoo uid (env.UID)
 * @param {string}   [options.timeframe]   'week'|'month'|'quarter'|'year'
 * @param {string}   [options.ownerId]     Override owner filter
 * @param {string}   [options.pipelineId]  Filter by team_id
 * @param {number}   [options.limit=50]    Max leads to return
 * @returns {Promise<Object>}
 */
export async function buildContext(env, {
  scopes,
  userId,
  odooUserId,
  timeframe  = null,
  ownerId    = null,
  pipelineId = null,
  limit      = MAX_LEADS
}) {
  const scope = resolveEffectiveScope(scopes);
  const effectiveLimit = Math.min(Number(limit) || MAX_LEADS, MAX_LEADS);
  const leadDomain = buildLeadDomain(scope, odooUserId, timeframe, ownerId, pipelineId);

  // ── 1. Pipeline summary (group by stage) ─────────────────────────────────
  let pipeline_summary = [];
  try {
    const groups = await executeKw(env, {
      model:  'crm.lead',
      method: 'read_group',
      args:   [leadDomain, ['stage_id', 'planned_revenue'], ['stage_id']],
      kwargs: { limit: 30 }
    });
    pipeline_summary = summarisePipeline(groups);
  } catch (err) {
    console.warn('⚠️ Claude context: pipeline summary failed:', err.message);
  }

  // ── 2. Leads ─────────────────────────────────────────────────────────────
  const leadFieldsToFetch = [
    'id', 'name', 'stage_id', 'planned_revenue', 'create_date',
    'date_deadline', 'kanban_state', 'user_id', 'team_id',
    'tag_ids', 'partner_id', 'priority', 'probability', 'active', 'type', 'write_date'
  ];

  let rawLeads = [];
  try {
    rawLeads = await searchRead(env, {
      model:  'crm.lead',
      domain: leadDomain,
      fields: leadFieldsToFetch,
      limit:  effectiveLimit,
      order:  'write_date desc'
    });
  } catch (err) {
    console.warn('⚠️ Claude context: leads fetch failed:', err.message);
  }

  const leads = applyAllowlistFilter(rawLeads, scope, odooUserId);

  // ── 3. Open activities (upcoming deadlines for fetched leads) ─────────────
  let activities = [];
  try {
    const actDomain = [
      ['res_model', '=', 'crm.lead'],
      ['date_deadline', '>=', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)]
    ];
    if (scope === 'own_leads') {
      actDomain.push(['user_id', '=', Number(ownerId ?? odooUserId)]);
    }
    const rawActs = await searchRead(env, {
      model:  'mail.activity',
      domain: actDomain,
      fields: ['id', 'res_id', 'res_name', 'activity_type_id', 'summary', 'date_deadline', 'state', 'user_id'],
      limit:  MAX_ACTIVITIES,
      order:  'date_deadline asc'
    });
    activities = rawActs.map(summariseActivity);
  } catch (err) {
    console.warn('⚠️ Claude context: activities fetch failed:', err.message);
  }

  // ── 4. Risks (blocked or overdue) ────────────────────────────────────────
  let risks = [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const riskDomain = [
      ['active', '=', true],
      '|',
      ['kanban_state', '=', 'blocked'],
      ['date_deadline', '<', today]
    ];
    if (scope === 'own_leads') {
      riskDomain.push(['user_id', '=', Number(ownerId ?? odooUserId)]);
    }
    if (pipelineId) riskDomain.push(['team_id', '=', Number(pipelineId)]);

    const rawRisks = await searchRead(env, {
      model:  'crm.lead',
      domain: riskDomain,
      fields: ['id', 'name', 'stage_id', 'date_deadline', 'kanban_state', 'user_id'],
      limit:  MAX_RISKS,
      order:  'date_deadline asc'
    });
    risks = rawRisks.map(r => ({
      id:            r.id,
      name:          r.name,
      stage:         Array.isArray(r.stage_id) ? r.stage_id[1] : r.stage_id,
      date_deadline: r.date_deadline ?? null,
      reason:        r.kanban_state === 'blocked' ? 'blocked' : 'overdue',
      user:          Array.isArray(r.user_id) ? r.user_id[1] : null
    }));
  } catch (err) {
    console.warn('⚠️ Claude context: risks fetch failed:', err.message);
  }

  // ── 5. Opportunities (high probability or Won this period) ────────────────
  let opportunities = [];
  try {
    const oppDomain = [
      ['active', '=', true],
      ['probability', '>=', 70],
      ['type', '=', 'opportunity']
    ];
    if (scope === 'own_leads') {
      oppDomain.push(['user_id', '=', Number(ownerId ?? odooUserId)]);
    }
    if (pipelineId) oppDomain.push(['team_id', '=', Number(pipelineId)]);
    if (timeframe) {
      const from = getTimeframeStart(timeframe);
      if (from) oppDomain.push(['write_date', '>=', from]);
    }

    const rawOpps = await searchRead(env, {
      model:  'crm.lead',
      domain: oppDomain,
      fields: ['id', 'name', 'stage_id', 'planned_revenue', 'probability', 'date_deadline', 'user_id', 'partner_id'],
      limit:  20,
      order:  'probability desc'
    });
    opportunities = applyAllowlistFilter(rawOpps, scope, odooUserId);
  } catch (err) {
    console.warn('⚠️ Claude context: opportunities fetch failed:', err.message);
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  return {
    meta: {
      generated_at:   new Date().toISOString(),
      scope,
      timeframe:      timeframe ?? 'all',
      lead_count:     leads.length,
      activity_count: activities.length,
      risk_count:     risks.length
    },
    pipeline_summary,
    leads,
    activities,
    risks,
    opportunities,
    next_actions: [], // Reserved – populate from activities with type action
    insights:     []  // Reserved – future enrichment layer
  };
}
