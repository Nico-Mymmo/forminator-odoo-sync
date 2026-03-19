/**
 * CX Powerboard — Routes
 */

import { createClient } from '@supabase/supabase-js';
import { searchRead } from '../../lib/odoo.js';
import { hasModuleSubRoleAccess } from '../registry.js';
import { getUserSettings } from '../mail-signature-designer/lib/signature-store.js';
import { cxPowerboardDashboardUI, cxPowerboardSettingsUI } from './ui.js';
import { fetchActiveActivities, fetchActivityTypes } from './odoo-client.js';
import { getMappings, createMapping, updateMapping, deleteMapping } from './services/mapping-service.js';
import { getUserWins } from './services/win-service.js';

// Strip HTML tags from Odoo note field (which is HTML)
function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireCxAccess(context) {
  const { user } = context;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  const hasAccess =
    user.role === 'admin' ||
    (user.modules || []).some(m => m.module?.code === 'cx_powerboard' && m.is_enabled);
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

function requireCxManager(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  if (!hasModuleSubRoleAccess(context.user, 'cx_powerboard_manager')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page handlers
// ---------------------------------------------------------------------------

async function handleDashboard(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  return new Response(cxPowerboardDashboardUI(context.user), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function handleSettings(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;
  return new Response(cxPowerboardSettingsUI(context.user), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

async function handleGetActivities(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;

  const { env, user } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Try cached odoo_uid first
  let { data: userData } = await supabase
    .from('users')
    .select('odoo_uid')
    .eq('id', user.id)
    .single();

  let odooUid = userData?.odoo_uid;

  // Auto-discover from Odoo by email if not cached
  if (!odooUid) {
    // Prefer odoo_email_override when the user's Odoo login differs from their platform email
    let lookupEmail = user.email;
    try {
      const userSettings = await getUserSettings(env, user.email);
      if (userSettings?.odoo_email_override) {
        lookupEmail = userSettings.odoo_email_override.toLowerCase().trim();
      }
    } catch (_) { /* non-fatal */ }

    const odooUsers = await searchRead(env, {
      model: 'res.users',
      domain: [['login', '=', lookupEmail]],
      fields: ['id'],
      limit: 1,
    });
    if (odooUsers?.length) {
      odooUid = odooUsers[0].id;
      // Cache it for future requests
      await supabase
        .from('users')
        .update({ odoo_uid: odooUid })
        .eq('id', user.id);
    }
  }

  if (!odooUid) {
    return new Response(JSON.stringify({ odooUidMissing: true, activities: [], wins: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [mappings, odooActivities, wins] = await Promise.all([
    getMappings(env),
    fetchActiveActivities(env, [odooUid]),
    getUserWins(env, user.id),
  ]);

  // Build mapping lookup by Odoo activity type id
  const typeMap = {};
  for (const m of mappings) {
    typeMap[m.odoo_activity_type_id] = m;
  }

  // Enrich activities with priority weight, model context, and note
  const enriched = odooActivities.map(a => {
    const typeId   = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
    const typeName = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
    const mapping  = typeMap[typeId];
    return {
      id:                 a.id,
      activity_type_id:   typeId,
      activity_type_name: typeName,
      res_model:          a.res_model,
      res_name:           a.res_name || null,
      date_deadline:      a.date_deadline || null,
      priority_weight:    mapping?.priority_weight ?? 0,
      note:               stripHtml(a.note),
      summary:            a.summary || null,
    };
  });

  // Sort: urgency first (overdue > today > upcoming > no due), then priority DESC, then deadline ASC
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  function urgencyRank(deadline) {
    if (!deadline) return 3;
    const d = new Date(deadline);
    if (d < today) return 0;
    if (d < tomorrow) return 1;
    return 2;
  }
  enriched.sort((a, b) => {
    const ua = urgencyRank(a.date_deadline), ub = urgencyRank(b.date_deadline);
    if (ua !== ub) return ua - ub;
    if (b.priority_weight !== a.priority_weight) return b.priority_weight - a.priority_weight;
    if (!a.date_deadline) return 1;
    if (!b.date_deadline) return -1;
    return new Date(a.date_deadline) - new Date(b.date_deadline);
  });

  // Compute stats
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: weekWins } = await supabase
    .from('cx_processed_wins')
    .select('id')
    .eq('platform_user_id', user.id)
    .gte('won_at', weekAgo);

  const stats = {
    total:        enriched.length,
    overdue:      enriched.filter(a => a.date_deadline && new Date(a.date_deadline) < today).length,
    dueToday:     enriched.filter(a => {
      if (!a.date_deadline) return false;
      const d = new Date(a.date_deadline);
      return d >= today && d < tomorrow;
    }).length,
    winsThisWeek: weekWins?.length ?? 0,
  };

  return new Response(JSON.stringify({ activities: enriched, wins, stats, mappings }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGetWins(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const wins = await getUserWins(context.env, context.user.id);
  return new Response(JSON.stringify(wins), { headers: { 'Content-Type': 'application/json' } });
}

async function handleGetMappings(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const mappings = await getMappings(context.env);
  return new Response(JSON.stringify(mappings), { headers: { 'Content-Type': 'application/json' } });
}

async function handleGetActivityTypes(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;
  const types = await fetchActivityTypes(context.env);
  return new Response(JSON.stringify(types), { headers: { 'Content-Type': 'application/json' } });
}

async function handleCreateMapping(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;
  try {
    const body = await context.request.json();
    const { odoo_activity_type_id, odoo_activity_type_name, priority_weight, is_win = false, notes, show_on_dashboard, danger_threshold_overdue, danger_threshold_today } = body;
    if (!odoo_activity_type_id || !odoo_activity_type_name || priority_weight === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const record = await createMapping(context.env, {
      odoo_activity_type_id,
      odoo_activity_type_name,
      priority_weight,
      is_win,
      notes,
      show_on_dashboard,
      danger_threshold_overdue,
      danger_threshold_today,
    });
    return new Response(JSON.stringify(record), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleUpdateMapping(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;
  try {
    const { id } = context.params;
    const body = await context.request.json();
    const { priority_weight, is_win, notes, show_on_dashboard, danger_threshold_overdue, danger_threshold_today } = body;
    if (priority_weight === undefined) {
      return new Response(JSON.stringify({ error: 'priority_weight is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const record = await updateMapping(context.env, id, { priority_weight, is_win, notes, show_on_dashboard, danger_threshold_overdue, danger_threshold_today });
    return new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleDeleteMapping(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;
  try {
    const { id } = context.params;
    await deleteMapping(context.env, id);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// Team stats (manager / admin only)
// ---------------------------------------------------------------------------

async function handleGetTeamStats(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;

  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const weekAgo  = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayStr = new Date().toISOString().split('T')[0];

  const [
    { data: users },
    { data: seenRows },
    { data: overdueRows },
    { data: winRows },
  ] = await Promise.all([
    supabase.from('users').select('id, email, full_name').not('odoo_uid', 'is', null),
    supabase.from('cx_seen_activities').select('platform_user_id'),
    supabase.from('cx_seen_activities').select('platform_user_id').lt('odoo_deadline', todayStr),
    supabase.from('cx_processed_wins').select('platform_user_id').gte('won_at', weekAgo),
  ]);

  const openByUser = {}, overdueByUser = {}, winsByUser = {};
  for (const row of seenRows    || []) if (row.platform_user_id) openByUser[row.platform_user_id]    = (openByUser[row.platform_user_id]    || 0) + 1;
  for (const row of overdueRows || []) if (row.platform_user_id) overdueByUser[row.platform_user_id] = (overdueByUser[row.platform_user_id] || 0) + 1;
  for (const row of winRows     || []) if (row.platform_user_id) winsByUser[row.platform_user_id]    = (winsByUser[row.platform_user_id]    || 0) + 1;

  const team = (users || [])
    .map(u => ({
      id:             u.id,
      name:           u.full_name || u.email,
      email:          u.email,
      openActivities: openByUser[u.id]    || 0,
      overdue:        overdueByUser[u.id] || 0,
      winsThisWeek:   winsByUser[u.id]    || 0,
    }))
    .sort((a, b) => b.winsThisWeek - a.winsThisWeek || b.openActivities - a.openActivities);

  return new Response(JSON.stringify({ team }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Route map
// ---------------------------------------------------------------------------

export const routes = {
  'GET /': handleDashboard,
  'GET /settings': handleSettings,
  'GET /api/activities': handleGetActivities,
  'GET /api/wins': handleGetWins,
  'GET /api/team': handleGetTeamStats,
  'GET /api/mappings': handleGetMappings,
  'GET /api/activity-types': handleGetActivityTypes,
  'POST /api/mappings': handleCreateMapping,
  'PUT /api/mappings/:id': handleUpdateMapping,
  'DELETE /api/mappings/:id': handleDeleteMapping,
};
