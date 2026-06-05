/**
 * Web Activity Routes — Sales Insight Explorer
 *
 * Two endpoints:
 *
 * 1. POST /api/sales-insights/leads/web-activity
 *    Fetches crm.lead records by ID and returns their web activity fields:
 *      - x_has_web_activity       boolean  — visitor timeline exists
 *      - x_studio_merged_timeline_html  html  — merged visitor timeline
 *      - x_studio_merged_kpi_html       html  — merged visitor KPI block
 *      - x_studio_brand_origin          char  — channel/brand origin label
 *    All four are optional; only requested fields are fetched from Odoo.
 *
 * 2. GET /api/sales-insights/web-visitors
 *    Returns x_web_visitor records with pages_json (summary + events).
 *    No HTML fields — compact JSON only.
 *    Filters: source_site, date_from/date_to (max 3 months),
 *             exclude_instant_bounce, exclude_possible_bounce.
 *
 * @module modules/sales-insight-explorer/web-activity-routes
 */

import { searchRead } from '../../lib/odoo.js';

// ─── shared helpers ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message, code, status = 400) {
  return new Response(JSON.stringify({ success: false, error: { message, code } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function daysDiff(a, b) {
  return Math.abs((b - a) / 86400000);
}

// Format date as Odoo expects: 'YYYY-MM-DD HH:MM:SS'
function fmtOdoo(d, endOfDay = false) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${endOfDay ? '23:59:59' : '00:00:00'}`;
}

// ─── 1. Lead web-activity enrichment ─────────────────────────────────────────

/**
 * POST /api/sales-insights/leads/web-activity
 *
 * Body:
 * {
 *   lead_ids:         number[]   // crm.lead IDs to enrich (max 500)
 *   include_timeline: boolean    // fetch x_studio_merged_timeline_html (default false)
 *   include_kpi:      boolean    // fetch x_studio_merged_kpi_html       (default false)
 *   include_brand:    boolean    // fetch x_studio_brand_origin           (default false)
 * }
 *
 * Response:
 * {
 *   results: [{
 *     lead_id:                      number
 *     x_has_web_activity:           boolean
 *     x_studio_merged_timeline_html?: string | null
 *     x_studio_merged_kpi_html?:     string | null
 *     x_studio_brand_origin?:        string | null
 *   }],
 *   meta: { lead_count, fields_fetched, generated_at }
 * }
 */
export async function leadWebActivity(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('Invalid JSON body', 'INVALID_BODY');
  }

  const leadIds = body.lead_ids;
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return err('lead_ids must be a non-empty array of integers', 'VALIDATION_FAILED');
  }
  if (leadIds.length > 500) {
    return err('lead_ids exceeds maximum of 500', 'TOO_MANY_IDS');
  }

  const includeTimeline = !!body.include_timeline;
  const includeKpi      = !!body.include_kpi;
  const includeBrand    = !!body.include_brand;

  // Always fetch x_has_web_activity; add optional fields on request
  const fields = ['id', 'x_studio_has_web_activity'];
  if (includeTimeline) fields.push('x_studio_merged_timeline_html');
  if (includeKpi)      fields.push('x_studio_merged_kpi_html');
  if (includeBrand)    fields.push('x_studio_brand_origin');

  try {
    const leads = await searchRead(env, {
      model: 'crm.lead',
      domain: [['id', 'in', leadIds], ['active', 'in', [true, false]]],
      fields,
      limit: false,
    });

    // Index by id for fast lookup
    const leadMap = new Map(leads.map(l => [l.id, l]));

    const results = leadIds.map(leadId => {
      const lead = leadMap.get(leadId);
      if (!lead) {
        // Lead not found (deleted / no access)
        return { lead_id: leadId, found: false, x_has_web_activity: false };
      }

      const result = {
        lead_id:            leadId,
        found:              true,
        x_has_web_activity: !!lead.x_studio_has_web_activity,
      };

      if (includeTimeline) result.x_studio_merged_timeline_html = lead.x_studio_merged_timeline_html || null;
      if (includeKpi)      result.x_studio_merged_kpi_html      = lead.x_studio_merged_kpi_html      || null;
      if (includeBrand)    result.x_studio_brand_origin          = lead.x_studio_brand_origin          || null;

      return result;
    });

    return json({
      results,
      meta: {
        lead_count:    leadIds.length,
        found_count:   leads.length,
        fields_fetched: fields,
        generated_at:  new Date().toISOString(),
      },
    });

  } catch (e) {
    console.error('❌ leadWebActivity:', e.message);
    return err(e.message, 'ODOO_ERROR', 500);
  }
}

// ─── 2. Web visitors list ─────────────────────────────────────────────────────

/**
 * GET /api/sales-insights/web-visitors
 *
 * Query params:
 *   source_site              string   filter on x_studio_source_site (e.g. 'openvme.be')
 *   date_from                string   ISO date 'YYYY-MM-DD' — required
 *   date_to                  string   ISO date 'YYYY-MM-DD' — required (max 3 months from date_from)
 *   exclude_instant_bounce   'true'   skip instant bounces         (default: false)
 *   exclude_possible_bounce  'true'   skip possible bounces        (default: false)
 *   limit                    integer|'false'  max records per call (default 1000, max 5000, or 'false'/'0' for no limit)
 *   offset                   integer  pagination offset (default 0)
 *
 * Returns x_web_visitor records. x_studio_pages_json is parsed and split into:
 *   summary  — aggregate stats (sessions, channels, top pages, etc.)
 *   events   — full event array (touchpoints, pages, clicks, etc.)
 * No HTML fields are returned.
 */
export async function listWebVisitors(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ── parse & validate params ───────────────────────────────────────────────
  const sourceSite            = url.searchParams.get('source_site') || null;
  const dateFromRaw           = url.searchParams.get('date_from');
  const dateToRaw             = url.searchParams.get('date_to');
  const excludeInstantBounce  = url.searchParams.get('exclude_instant_bounce')  === 'true';
  const excludePossibleBounce = url.searchParams.get('exclude_possible_bounce') === 'true';
  const limitParam = url.searchParams.get('limit');
  // 'false' or '0' = no limit (Odoo returns all matching records)
  // Otherwise cap at 5000 per call; use offset for pagination
  const limit  = (limitParam === 'false' || limitParam === '0')
    ? false
    : Math.min(parseInt(limitParam || '1000', 10), 5000);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  if (!dateFromRaw || !dateToRaw) {
    return err('date_from and date_to are required (YYYY-MM-DD)', 'VALIDATION_FAILED');
  }

  const dateFrom = parseDate(dateFromRaw);
  const dateTo   = parseDate(dateToRaw);

  if (!dateFrom || !dateTo) {
    return err('date_from or date_to is not a valid date', 'VALIDATION_FAILED');
  }
  if (dateFrom > dateTo) {
    return err('date_from must be before or equal to date_to', 'VALIDATION_FAILED');
  }
  if (daysDiff(dateFrom, dateTo) > 92) {
    return err('Date range may not exceed 3 months (92 days)', 'DATE_RANGE_TOO_LARGE');
  }

  // ── build Odoo domain ─────────────────────────────────────────────────────
  const domain = [
    ['x_studio_first_seen', '>=', fmtOdoo(dateFrom)],
    ['x_studio_first_seen', '<=', fmtOdoo(dateTo, true)],
    ['x_active', '=', true],
  ];

  if (sourceSite)            domain.push(['x_studio_source_site',   '=', sourceSite]);
  if (excludeInstantBounce)  domain.push(['x_studio_instant_bounce', '=', false]);
  if (excludePossibleBounce) domain.push(['x_studio_possible_bounce', '=', false]);

  // ── fields — no HTML ──────────────────────────────────────────────────────
  const fields = [
    'id',
    'x_name',
    'x_studio_source_site',
    'x_studio_first_seen',
    'x_studio_last_seen',
    'x_studio_utm_source',
    'x_studio_utm_medium',
    'x_studio_utm_campaign',
    'x_studio_session_duration',
    'x_studio_instant_bounce',
    'x_studio_possible_bounce',
    'x_studio_email',
    'x_studio_lead_ids',    // many2many → crm.lead ids
    'x_studio_pages_json',  // compact JSON: { summary, events }
  ];

  try {
    const visitors = await searchRead(env, {
      model: 'x_web_visitor',
      domain,
      fields,
      limit,
      offset,
      order: 'x_studio_first_seen DESC',
    });

    const records = visitors.map(v => {
      let summary = null;
      let events  = null;

      if (v.x_studio_pages_json) {
        try {
          const parsed   = JSON.parse(v.x_studio_pages_json);
          summary = parsed.summary || null;
          events  = parsed.events  || null;
        } catch (_) { /* malformed json — leave null */ }
      }

      // Odoo returns false for empty fields instead of null — normalise
      const n = v => v === false ? null : v;

      return {
        id:               v.id,
        name:             n(v.x_name),
        source_site:      n(v.x_studio_source_site),
        first_seen:       n(v.x_studio_first_seen),
        last_seen:        n(v.x_studio_last_seen),
        utm_source:       n(v.x_studio_utm_source),
        utm_medium:       n(v.x_studio_utm_medium),
        utm_campaign:     n(v.x_studio_utm_campaign),
        session_duration: n(v.x_studio_session_duration),
        instant_bounce:   v.x_studio_instant_bounce === true,
        possible_bounce:  v.x_studio_possible_bounce === true,
        email:            n(v.x_studio_email),
        lead_ids:         v.x_studio_lead_ids || [],
        has_leads:        (v.x_studio_lead_ids || []).length > 0,
        summary,
        events,
      };
    });

    return json({
      records,
      meta: {
        filters: {
          source_site:             sourceSite,
          date_from:               fmtOdoo(dateFrom),
          date_to:                 fmtOdoo(dateTo, true),
          exclude_instant_bounce:  excludeInstantBounce,
          exclude_possible_bounce: excludePossibleBounce,
        },
        limit:       limit === false ? 'none' : limit,
        offset,
        returned:    records.length,
        generated_at: new Date().toISOString(),
      },
    });

  } catch (e) {
    console.error('❌ listWebVisitors:', e.message);
    return err(e.message, 'ODOO_ERROR', 500);
  }
}