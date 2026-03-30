/**
 * CX Powerboard — Routes
 *
 * V6: mail.activity + keep_done as sole source of truth.
 * - fetchTrackedOpenActivities replaces fetchActiveActivities
 * - fetchCompletedToday replaces poll-and-diff
 * - cx_daily_completions for streak
 * - keep_done enforced on mapping create/update
 */

import { createClient } from '@supabase/supabase-js';
import { searchRead } from '../../lib/odoo.js';
import { hasModuleSubRoleAccess } from '../registry.js';
import { getUserSettings } from '../mail-signature-designer/lib/signature-store.js';
import { cxPowerboardDashboardUI, cxPowerboardSettingsUI } from './ui.js';
import {
  fetchTrackedOpenActivities,
  fetchCompletedToday,
  fetchCompletedInRange,
  fetchActivityTypes,
  setKeepDone,
  verifyKeepDone,
  getTodayStr,
} from './odoo-client.js';
import { getMappings, createMapping, updateMapping, deleteMapping, confirmKeepDone } from './services/mapping-service.js';
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
// Streak helper
// ---------------------------------------------------------------------------

/**
 * Compute current streak from cx_daily_completions.
 * A streak is the longest run of consecutive cleared days ending today or
 * yesterday (yesterday grace: streak stays visible if user hasn't worked today yet).
 */
async function getStreak(supabase, userId, todayStr) {
  const { data } = await supabase
    .from('cx_daily_completions')
    .select('day')
    .eq('platform_user_id', userId)
    .eq('cleared_queue', true)
    .order('day', { ascending: false })
    .limit(90);

  if (!data || !data.length) return 0;

  // Streak must be alive — latest cleared day is today or yesterday
  const yesterday = new Date(new Date(todayStr + 'T12:00:00Z').getTime() - 86400000)
    .toISOString().slice(0, 10);
  const latestDay = data[0].day;
  if (latestDay < yesterday) return 0;

  // Count consecutive days backwards from latestDay
  let streak = 0;
  let expected = latestDay;
  for (const row of data) {
    if (row.day === expected) {
      streak++;
      const d = new Date(expected + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      expected = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Helper: effective mappings for a user (teams + personal configs)
// Returns empty array when user has no team assignments and no personal configs.
// ---------------------------------------------------------------------------

async function getEffectiveMappings(supabase, userId) {
  // ── Team memberships ──────────────────────────────────────────────────────
  const { data: memberships } = await supabase
    .from('cx_team_members')
    .select('team_id')
    .eq('user_id', userId);

  const teamIds = (memberships || []).map(m => m.team_id);

  // ── Team names ────────────────────────────────────────────────────────────
  const teamNameMap = {};
  if (teamIds.length > 0) {
    const { data: teamRows } = await supabase
      .from('cx_teams')
      .select('id, name')
      .in('id', teamIds);
    for (const t of (teamRows || [])) teamNameMap[t.id] = t.name;
  }

  // ── Team activity configs ─────────────────────────────────────────────────
  let teamConfigs = [];
  if (teamIds.length > 0) {
    const { data } = await supabase
      .from('cx_team_activity_configs')
      .select(`
        team_id, mapping_id, priority_weight, show_on_dashboard,
        danger_threshold_overdue, danger_threshold_today, include_in_streak,
        card_color_mode, card_fixed_color, card_threshold_steps,
        card_compact_pills, card_show_sparkline, card_hero_metric,
        cx_activity_mapping (
          id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at, notes
        )
      `)
      .in('team_id', teamIds);
    teamConfigs = data || [];
  }

  // ── Personal configs ──────────────────────────────────────────────────────
  const { data: personalConfigs } = await supabase
    .from('cx_user_personal_configs')
    .select(`
      mapping_id, priority_weight, show_on_dashboard,
      danger_threshold_overdue, danger_threshold_today, include_in_streak,
      card_color_mode, card_fixed_color, card_threshold_steps,
      card_compact_pills, card_show_sparkline, card_hero_metric,
      cx_activity_mapping (
        id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at, notes
      )
    `)
    .eq('user_id', userId);

  // ── Merge: personal first (overrides team for same type) ──────────────────
  const seen   = new Set();
  const result = [];

  for (const pc of (personalConfigs || [])) {
    const m = pc.cx_activity_mapping;
    if (!m || seen.has(m.odoo_activity_type_id)) continue;
    seen.add(m.odoo_activity_type_id);
    result.push({
      id:                       m.id,
      odoo_activity_type_id:    m.odoo_activity_type_id,
      odoo_activity_type_name:  m.odoo_activity_type_name,
      priority_weight:          pc.priority_weight,
      is_win:                   m.is_win,
      show_on_dashboard:        pc.show_on_dashboard,
      danger_threshold_overdue: pc.danger_threshold_overdue,
      danger_threshold_today:   pc.danger_threshold_today,
      include_in_streak:        pc.include_in_streak,
      card_color_mode:          pc.card_color_mode      || 'auto',
      card_fixed_color:         pc.card_fixed_color     || null,
      card_threshold_steps:     pc.card_threshold_steps || null,
      card_compact_pills:       !!pc.card_compact_pills,
      card_show_sparkline:      !!pc.card_show_sparkline,
      card_hero_metric:         pc.card_hero_metric      || 'auto',
      card_title_override:      pc.card_title_override   || null,
      card_model_filter:        pc.card_model_filter     || null,
      card_pills_mode:          pc.card_pills_mode       || 'standard',
      card_view_mode:           pc.card_view_mode        || 'stats',
      keep_done_confirmed_at:   m.keep_done_confirmed_at,
      _source:                  'personal',
      _team_name:               null,
    });
  }

  for (const tc of teamConfigs) {
    const m = tc.cx_activity_mapping;
    if (!m || seen.has(m.odoo_activity_type_id)) continue;
    seen.add(m.odoo_activity_type_id);
    result.push({
      id:                       m.id,
      odoo_activity_type_id:    m.odoo_activity_type_id,
      odoo_activity_type_name:  m.odoo_activity_type_name,
      priority_weight:          tc.priority_weight,
      is_win:                   m.is_win,
      show_on_dashboard:        tc.show_on_dashboard,
      danger_threshold_overdue: tc.danger_threshold_overdue,
      danger_threshold_today:   tc.danger_threshold_today,
      include_in_streak:        tc.include_in_streak,
      card_color_mode:          tc.card_color_mode      || 'auto',
      card_fixed_color:         tc.card_fixed_color     || null,
      card_threshold_steps:     tc.card_threshold_steps || null,
      card_compact_pills:       !!tc.card_compact_pills,
      card_show_sparkline:      !!tc.card_show_sparkline,
      card_hero_metric:         tc.card_hero_metric      || 'auto',
      card_title_override:      tc.card_title_override   || null,
      card_model_filter:        tc.card_model_filter     || null,
      card_pills_mode:          tc.card_pills_mode       || 'standard',
      card_view_mode:           tc.card_view_mode        || 'stats',
      keep_done_confirmed_at:   m.keep_done_confirmed_at,
      _source:                  'team',
      _team_name:               teamNameMap[tc.team_id] || null,
    });
  }

  return result;
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
  const denied = requireCxAccess(context);
  if (denied) return denied;
  return new Response(cxPowerboardSettingsUI(context.user), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------------------------------------------------------------------------
// API: Activities (dashboard data)
// ---------------------------------------------------------------------------

async function handleGetActivities(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;

  const { env, user } = context;
  const url          = new URL(context.request.url);
  const supabase     = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── Target: self, ?viewAs=userId, or ?viewAs=team:teamId ─────────────────
  const viewAsRaw      = url.searchParams.get('viewAs') || '';
  const isTeamView     = viewAsRaw.startsWith('team:');
  const teamViewId     = isTeamView ? viewAsRaw.slice(5) : null;
  const targetUserId   = (!isTeamView && viewAsRaw && viewAsRaw !== user.id) ? viewAsRaw : user.id;
  const isViewingOther = isTeamView || (targetUserId !== user.id);

  const _ts = () => new Date().toISOString().substring(11, 19);
  const _viewLabel = isTeamView ? `team:${teamViewId}` : targetUserId;
  console.log(`[CX ${_ts()}] activities  ${user.email}  viewAs=${_viewLabel}`);

  // ── For team view: resolve all member odoo_uids to fetch aggregate data ───
  let teamMemberOdooUids = null;
  if (isTeamView && teamViewId) {
    const { data: members } = await supabase
      .from('cx_team_members')
      .select('user_id')
      .eq('team_id', teamViewId);
    if (members && members.length) {
      const memberIds = members.map(m => m.user_id);
      // Fetch id + email + odoo_uid for ALL members (not just those with odoo_uid)
      const { data: memberRows } = await supabase
        .from('users')
        .select('id, email, odoo_uid')
        .in('id', memberIds);

      // Auto-resolve missing odoo_uids via batch email lookup in Odoo
      const needsResolve = (memberRows || []).filter(r => !r.odoo_uid && r.email);
      if (needsResolve.length) {
        console.log(`[CX ${_ts()}] auto-resolve ${needsResolve.length} team-emails → Odoo res.users...`);
        try {
          const emails = needsResolve.map(r => r.email);
          const odooUsers = await searchRead(env, {
            model: 'res.users',
            domain: [['login', 'in', emails]],
            fields: ['id', 'login'],
            limit: 500,
          });
          if (odooUsers?.length) {
            const emailToUid = {};
            for (const u of odooUsers) emailToUid[u.login.toLowerCase()] = u.id;
            for (const r of needsResolve) {
              const uid = emailToUid[r.email.toLowerCase()];
              if (uid) {
                r.odoo_uid = uid;
                await supabase.from('users').update({ odoo_uid: uid }).eq('id', r.id);
                console.log(`[CX ${_ts()}] auto-resolved: ${r.email} → uid=${uid}`);
              } else {
                console.log(`[CX ${_ts()}] ❌ niet gevonden in Odoo: ${r.email}`);
              }
            }
          }
        } catch (e) {
          console.log(`[CX ${_ts()}] ❌ auto-resolve fout: ${e.message}`);
        }
      }

      teamMemberOdooUids = (memberRows || []).filter(r => r.odoo_uid).map(r => r.odoo_uid);
      console.log(`[CX ${_ts()}] team-leden: ${memberIds.length}x  odoo_uid: ${teamMemberOdooUids.length}x [${teamMemberOdooUids.join(',')}]`);
    } else {
      teamMemberOdooUids = [];
      console.log(`[CX ${_ts()}] ❌ geen leden in team ${teamViewId}`);
    }
  }

  // Flag: team view with no linked Odoo members — will return empty data
  const noTeamOdooMembers = isTeamView && Array.isArray(teamMemberOdooUids) && teamMemberOdooUids.length === 0;
  if (noTeamOdooMembers) console.log(`[CX ${_ts()}] ⚠️  team heeft geen Odoo-uids — dashboard toont melding`);

  let odooUid = null;
  if (!isTeamView) {
    let { data: targetUserRow } = await supabase
      .from('users')
      .select('odoo_uid')
      .eq('id', targetUserId)
      .single();
    odooUid = targetUserRow?.odoo_uid;
    console.log(`[CX ${_ts()}] odoo_uid: ${odooUid ?? '⚠️ niet gevonden in DB'}`);

    // Auto-resolve via email only for the requesting user (not for viewAs targets)
    if (!odooUid && !isViewingOther) {
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
        console.log(`[CX ${_ts()}] auto-resolved: ${user.email} → uid=${odooUid} (opgeslagen)`);
        await supabase.from('users').update({ odoo_uid: odooUid }).eq('id', user.id);
      } else {
        console.log(`[CX ${_ts()}] ❌ email "${user.email}" niet gevonden in Odoo res.users`);
      }
    }

    if (!odooUid) {
      if (isViewingOther) {
        // Target user not linked to Odoo yet — return their configured mappings with zero activity data
        const viewMappings = await getEffectiveMappings(supabase, targetUserId);
        const fallbackMappings = viewMappings.length
          ? viewMappings
          : (await getMappings(env)).map(m => ({
              id: m.id, odoo_activity_type_id: m.odoo_activity_type_id,
              odoo_activity_type_name: m.odoo_activity_type_name,
              priority_weight: m.priority_weight, is_win: m.is_win,
              show_on_dashboard: m.show_on_dashboard !== false,
              danger_threshold_overdue: m.danger_threshold_overdue ?? 1,
              danger_threshold_today: m.danger_threshold_today ?? 3,
              include_in_streak: m.include_in_streak !== false,
              card_color_mode: 'auto', card_fixed_color: null,
              card_threshold_steps: null, card_compact_pills: false, card_show_sparkline: false,
              card_hero_metric: 'auto',
              keep_done_confirmed_at: m.keep_done_confirmed_at,
            }));
        const emptyPerType = {};
        for (const m of fallbackMappings) emptyPerType[m.odoo_activity_type_id] = { overdue: 0, dueToday: 0, future: 0, completedToday: 0 };
        return new Response(JSON.stringify({
          activities: [], completedToday: [], wins: [], perType: emptyPerType,
          mappings: fallbackMappings, odooUid: null,
          odooBaseUrl: env.ODOO_URL || 'https://mymmo.odoo.com',
          stats: { overdue: 0, dueToday: 0, remainingToday: 0, completedToday: 0, isDoneForToday: false, winsThisWeek: 0, streak: 0 },
          viewingUserId: targetUserId, isViewingOther: true, isTeamView: false, noTeamOdooMembers: false,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ odooUidMissing: true, activities: [], wins: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Effective mappings ────────────────────────────────────────────────────
  // For team view: use team's activity configs directly
  let mappings;
  if (isTeamView && teamViewId) {
    const { data: teamConfigs } = await supabase
      .from('cx_team_activity_configs')
      .select(`
        mapping_id, priority_weight, show_on_dashboard,
        danger_threshold_overdue, danger_threshold_today, include_in_streak,
        card_color_mode, card_fixed_color, card_threshold_steps,
        card_compact_pills, card_show_sparkline, card_hero_metric,
        cx_activity_mapping (
          id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at
        )
      `)
      .eq('team_id', teamViewId);
    mappings = (teamConfigs || []).map(function(tc) {
      const m = tc.cx_activity_mapping;
      return {
        id:                       m.id,
        odoo_activity_type_id:    m.odoo_activity_type_id,
        odoo_activity_type_name:  m.odoo_activity_type_name,
        priority_weight:          tc.priority_weight,
        is_win:                   m.is_win,
        show_on_dashboard:        tc.show_on_dashboard,
        danger_threshold_overdue: tc.danger_threshold_overdue,
        danger_threshold_today:   tc.danger_threshold_today,
        include_in_streak:        tc.include_in_streak,
        card_color_mode:          tc.card_color_mode      || 'auto',
        card_fixed_color:         tc.card_fixed_color     || null,
        card_threshold_steps:     tc.card_threshold_steps || null,
        card_compact_pills:       !!tc.card_compact_pills,
        card_show_sparkline:      !!tc.card_show_sparkline,
        card_hero_metric:         tc.card_hero_metric      || 'auto',
        keep_done_confirmed_at:   m.keep_done_confirmed_at,
      };
    });
  } else {
    mappings = await getEffectiveMappings(supabase, targetUserId);
    // Fallback: if user has no team/personal config, use global mapping registry
    if (mappings.length === 0) {
      const globalMappings = await getMappings(env);
      mappings = (globalMappings || []).map(m => ({
        id:                       m.id,
        odoo_activity_type_id:    m.odoo_activity_type_id,
        odoo_activity_type_name:  m.odoo_activity_type_name,
        priority_weight:          m.priority_weight,
        is_win:                   m.is_win,
        show_on_dashboard:        true,
        danger_threshold_overdue: m.danger_threshold_overdue ?? 1,
        danger_threshold_today:   m.danger_threshold_today   ?? 3,
        include_in_streak:        m.include_in_streak !== false,
        card_color_mode:          'auto',
        card_fixed_color:         null,
        card_threshold_steps:     null,
        card_compact_pills:       false,
        card_show_sparkline:      false,
        card_hero_metric:         'auto',
        keep_done_confirmed_at:   m.keep_done_confirmed_at,
        _source:                  'global',
      }));
    }
  }
  if (mappings.length === 0) {
    return new Response(JSON.stringify({
      noTeamAssigned: true,
      activities: [], completedToday: [], wins: [], perType: {}, mappings: [],
      stats: {
        overdue: 0, dueToday: 0, remainingToday: 0, completedToday: 0,
        isDoneForToday: false, winsThisWeek: 0, streak: 0,
      },
      isTeamView, isViewingOther, noTeamOdooMembers: false,
      odooBaseUrl: env.ODOO_URL || 'https://mymmo.odoo.com',
    }), { headers: { 'Content-Type': 'application/json' } });
  }
  const trackedTypeIds = mappings.map(m => m.odoo_activity_type_id);
  const _mapLabels = mappings.map(m => `[${m.odoo_activity_type_id}]${m.odoo_activity_type_name}(dash=${m.show_on_dashboard},kd=${m.keep_done_confirmed_at ? '✓' : '⚠️'},src=${m._source ?? '?'})`).join('  ');
  console.log(`[CX ${_ts()}] mappings ${mappings.length}x: ${_mapLabels}`);

  // ── Today in Odoo timezone ────────────────────────────────────────────────
  const todayStr    = getTodayStr(env);
  const todayLocal  = new Date(todayStr + 'T00:00:00');
  const tomorrowLocal = new Date(todayLocal.getTime() + 86400000);

  // ── Parallel Odoo + Supabase fetches ──────────────────────────────────────
  const odooUids = isTeamView ? (teamMemberOdooUids || []) : [odooUid];
  console.log(`[CX ${_ts()}] Odoo fetch  uids=[${odooUids.join(',')}]  types=[${trackedTypeIds.join(',')}]  today=${todayStr}${odooUids.length === 0 ? '  ⚠️ SKIP (geen uids)' : ''}`);

  // Wins: aggregate for all team members, or just the target user
  const winUserIds = isTeamView
    ? (await supabase.from('cx_team_members').select('user_id').eq('team_id', teamViewId)).data?.map(m => m.user_id) || []
    : [targetUserId];

  const [openActivities, completedTodayList, wins, weekWinResult] = await Promise.all([
    odooUids.length ? fetchTrackedOpenActivities(env, odooUids, trackedTypeIds) : Promise.resolve([]),
    odooUids.length ? fetchCompletedToday(env, odooUids, trackedTypeIds) : Promise.resolve([]),
    getUserWins(env, isTeamView ? (winUserIds[0] || targetUserId) : targetUserId),
    supabase
      .from('cx_processed_wins')
      .select('id')
      .in('platform_user_id', winUserIds)
      .gte('won_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  console.log(`[CX ${_ts()}] Odoo result open=${openActivities.length}  done=${completedTodayList.length}  weekWins=${weekWinResult?.data?.length ?? 0}`);

  // ── Build mapping lookup ──────────────────────────────────────────────────
  const typeMap = {};
  for (const m of mappings) typeMap[m.odoo_activity_type_id] = m;

  // ── Urgency helper ────────────────────────────────────────────────────────
  function urgencyRank(deadline) {
    if (!deadline) return 3;
    const d = new Date(deadline + 'T00:00:00');
    if (d < todayLocal) return 0;
    if (d < tomorrowLocal) return 1;
    return 2;
  }

  // ── Enrich open activities ────────────────────────────────────────────────
  const enriched = openActivities.map(a => {
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

  enriched.sort((a, b) => {
    const ua = urgencyRank(a.date_deadline), ub = urgencyRank(b.date_deadline);
    if (ua !== ub) return ua - ub;
    if (b.priority_weight !== a.priority_weight) return b.priority_weight - a.priority_weight;
    if (!a.date_deadline) return 1;
    if (!b.date_deadline) return -1;
    return new Date(a.date_deadline) - new Date(b.date_deadline);
  });

  // ── Normalize completed today ─────────────────────────────────────────────
  const completedToday = (completedTodayList || []).map(a => {
    const typeId   = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
    const typeName = Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : String(typeId);
    return {
      id:                 a.id,
      activity_type_id:   typeId,
      activity_type_name: typeName,
      res_model:          a.res_model,
      res_name:           a.res_name || null,
      date_done:          a.date_done,
    };
  });

  // ── Global stats ──────────────────────────────────────────────────────────
  const overdue  = enriched.filter(a => urgencyRank(a.date_deadline) === 0).length;
  const dueToday = enriched.filter(a => urgencyRank(a.date_deadline) === 1).length;
  const remainingToday   = overdue + dueToday;
  const completedTodayCount = completedToday.length;
  const isDoneForToday   = remainingToday === 0 && completedTodayCount > 0;

  // ── Per-type breakdown (for cards) ────────────────────────────────────────
  const perType = {};
  for (const m of mappings) {
    perType[m.odoo_activity_type_id] = { overdue: 0, dueToday: 0, future: 0, completedToday: 0 };
  }
  for (const a of enriched) {
    const stats = perType[a.activity_type_id];
    if (!stats) continue;
    const rank = urgencyRank(a.date_deadline);
    if (rank === 0)      stats.overdue++;
    else if (rank === 1) stats.dueToday++;
    else                 stats.future++;
  }
  for (const a of completedToday) {
    if (perType[a.activity_type_id]) perType[a.activity_type_id].completedToday++;
  }

  // ── Per-type summary ──────────────────────────────────────────────────────
  const _perTypeSummary = Object.entries(perType).map(([tid, c]) => `[${tid}]od=${c.overdue}/td=${c.dueToday}/fu=${c.future}/dn=${c.completedToday}`).join('  ');
  console.log(`[CX ${_ts()}] perType: ${_perTypeSummary}`);

  // ── Streak (only meaningful for single-user view) ─────────────────────────
  const streak = isTeamView ? 0 : await getStreak(supabase, targetUserId, todayStr);

  // ── If done for today: confirm cleared_queue for the requesting user only ──
  if (isDoneForToday && !isViewingOther) {
    await supabase.from('cx_daily_completions').upsert(
      {
        platform_user_id: user.id,
        day:              todayStr,
        completed_count:  completedTodayCount,
        remaining_count:  0,
        cleared_queue:    true,
      },
      { onConflict: 'platform_user_id,day' }
    );
  }

  // ── Daily per-type snapshots (for sparklines) — own view only ─────────────
  if (!isViewingOther && !isTeamView) {
    const snapshots = Object.entries(perType)
      .map(([typeId, s]) => ({
        user_id:          user.id,
        activity_type_id: parseInt(typeId, 10),
        snapshot_date:    todayStr,
        completed_count:  s.completedToday,
        remaining_count:  s.overdue + s.dueToday,
      }));
    if (snapshots.length > 0) {
      // fire-and-forget: non-critical
      supabase.from('cx_activity_daily_snapshot')
        .upsert(snapshots, { onConflict: 'user_id,activity_type_id,snapshot_date' })
        .then(() => {}).catch(() => {});
    }
  }

  // ── Response ──────────────────────────────────────────────────────────────
  const stats = {
    overdue,
    dueToday,
    remainingToday,
    completedToday:  completedTodayCount,
    isDoneForToday,
    winsThisWeek:    weekWinResult?.data?.length ?? 0,
    streak,
  };

  console.log(`[CX ${_ts()}] → overdue=${stats.overdue} today=${stats.dueToday} remaining=${stats.remainingToday} done=${stats.completedToday} isDone=${stats.isDoneForToday} streak=${stats.streak}`);

  return new Response(JSON.stringify({
    activities:     enriched,
    completedToday,
    perType,
    wins,
    stats,
    mappings,
    odooUid,
    odooBaseUrl:    env.ODOO_URL || 'https://mymmo.odoo.com',
    viewingUserId:  targetUserId,
    isViewingOther,
    isTeamView,
    noTeamOdooMembers: noTeamOdooMembers || false,
  }), {
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
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const types = await fetchActivityTypes(context.env);
  return new Response(JSON.stringify(types), { headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// API: Add activity to team/personal by Odoo type ID (auto-creates mapping)
// ---------------------------------------------------------------------------

async function handleAddActivityByOdooType(context, isTeam) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: entityId } = context.params; // teamId or ignored for personal
  const body = await context.request.json();
  const {
    odoo_activity_type_id,
    odoo_activity_type_name,
    priority_weight          = 10,
    show_on_dashboard        = true,
    danger_threshold_overdue = 1,
    danger_threshold_today   = 3,
    include_in_streak        = true,
    is_win                   = false,
    notes                    = null,
  } = body;
  if (!odoo_activity_type_id || !odoo_activity_type_name) {
    return new Response(JSON.stringify({ error: 'odoo_activity_type_id and odoo_activity_type_name are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);

  // Find or auto-create the global mapping entry
  let { data: existingMapping } = await supabase
    .from('cx_activity_mapping')
    .select('id')
    .eq('odoo_activity_type_id', odoo_activity_type_id)
    .single();

  let mappingId;
  if (existingMapping) {
    mappingId = existingMapping.id;
    // Update is_win and notes on the global mapping if provided
    await supabase.from('cx_activity_mapping')
      .update({ is_win, notes })
      .eq('id', mappingId);
  } else {
    const newMapping = await createMapping(context.env, {
      odoo_activity_type_id, odoo_activity_type_name,
      priority_weight, is_win,
      show_on_dashboard, danger_threshold_overdue,
      danger_threshold_today, include_in_streak, notes,
    });
    try {
      await setKeepDone(context.env, odoo_activity_type_id);
      const confirmed = await verifyKeepDone(context.env, odoo_activity_type_id);
      if (confirmed) await confirmKeepDone(context.env, newMapping.id);
    } catch (_) { /* non-fatal */ }
    mappingId = newMapping.id;
  }

  // Insert config row with the caller-supplied (or default) config values
  const table  = isTeam ? 'cx_team_activity_configs' : 'cx_user_personal_configs';
  const fkCol  = isTeam ? 'team_id' : 'user_id';
  const fkVal  = isTeam ? entityId : context.user.id;
  const { data, error } = await supabase
    .from(table)
    .insert({ [fkCol]: fkVal, mapping_id: mappingId, priority_weight,
              show_on_dashboard, danger_threshold_overdue,
              danger_threshold_today, include_in_streak })
    .select('id, mapping_id, priority_weight, show_on_dashboard, danger_threshold_overdue, danger_threshold_today, include_in_streak, cx_activity_mapping (id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at, notes)')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.code === '23505' ? 409 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// API: Mapping CRUD — enforces keep_done
// ---------------------------------------------------------------------------

async function handleCreateMapping(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;
  try {
    const body = await context.request.json();
    const {
      odoo_activity_type_id,
      odoo_activity_type_name,
      priority_weight,
      is_win = false,
      notes,
      show_on_dashboard,
      danger_threshold_overdue,
      danger_threshold_today,
      include_in_streak = true,
    } = body;

    if (!odoo_activity_type_id || !odoo_activity_type_name || priority_weight === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save the mapping row
    const record = await createMapping(context.env, {
      odoo_activity_type_id,
      odoo_activity_type_name,
      priority_weight,
      is_win,
      notes,
      show_on_dashboard,
      danger_threshold_overdue,
      danger_threshold_today,
      include_in_streak,
    });

    // Enforce keep_done in Odoo and verify
    try {
      await setKeepDone(context.env, odoo_activity_type_id);
      const confirmed = await verifyKeepDone(context.env, odoo_activity_type_id);
      if (confirmed) {
        const updated = await confirmKeepDone(context.env, record.id);
        return new Response(JSON.stringify(updated), {
          status: 201, headers: { 'Content-Type': 'application/json' },
        });
      } else {
        // Mapping saved but keep_done not confirmed — return 422 so UI shows blocking error
        return new Response(JSON.stringify({
          error: 'keep_done kon niet worden bevestigd in Odoo. Controleer de Odoo-verbinding en probeer opnieuw.',
          keepDoneFailed: true,
          mapping: record,
        }), {
          status: 422, headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (keepErr) {
      return new Response(JSON.stringify({
        error: 'Fout bij instellen van keep_done in Odoo: ' + keepErr.message,
        keepDoneFailed: true,
        mapping: record,
      }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }
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
    const {
      priority_weight,
      is_win,
      notes,
      show_on_dashboard,
      danger_threshold_overdue,
      danger_threshold_today,
      include_in_streak,
      odoo_activity_type_id,
    } = body;

    if (priority_weight === undefined) {
      return new Response(JSON.stringify({ error: 'priority_weight is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const record = await updateMapping(context.env, id, {
      priority_weight, is_win, notes, show_on_dashboard,
      danger_threshold_overdue, danger_threshold_today, include_in_streak,
    });

    // Re-verify keep_done if type ID is provided (enforce idempotently)
    if (odoo_activity_type_id) {
      try {
        const alreadyOk = await verifyKeepDone(context.env, odoo_activity_type_id);
        if (!alreadyOk) {
          await setKeepDone(context.env, odoo_activity_type_id);
          const confirmed = await verifyKeepDone(context.env, odoo_activity_type_id);
          if (confirmed) await confirmKeepDone(context.env, id);
        } else if (!record.keep_done_confirmed_at) {
          await confirmKeepDone(context.env, id);
        }
      } catch (_) { /* non-fatal for update */ }
    }

    // Return fresh record (may have updated keep_done_confirmed_at)
    const mappings = await getMappings(context.env);
    const fresh = mappings.find(m => m.id === id) || record;
    return new Response(JSON.stringify(fresh), { headers: { 'Content-Type': 'application/json' } });
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
// V6: Uses cx_daily_completions instead of retired cx_seen_activities
// ---------------------------------------------------------------------------

async function handleGetTeamStats(context) {
  const denied = requireCxManager(context);
  if (denied) return denied;

  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const weekAgo  = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayStr = getTodayStr(env);

  const [
    { data: users },
    { data: todayRows },
    { data: winRows },
  ] = await Promise.all([
    supabase.from('users').select('id, email, full_name').not('odoo_uid', 'is', null),
    supabase.from('cx_daily_completions').select('platform_user_id, remaining_count, completed_count').eq('day', todayStr),
    supabase.from('cx_processed_wins').select('platform_user_id').gte('won_at', weekAgo),
  ]);

  const remainingByUser = {}, completedByUser = {}, winsByUser = {};
  for (const row of todayRows || []) {
    if (row.platform_user_id) {
      remainingByUser[row.platform_user_id] = row.remaining_count || 0;
      completedByUser[row.platform_user_id] = row.completed_count || 0;
    }
  }
  for (const row of winRows || []) {
    if (row.platform_user_id) winsByUser[row.platform_user_id] = (winsByUser[row.platform_user_id] || 0) + 1;
  }

  const team = (users || [])
    .map(u => ({
      id:             u.id,
      name:           u.full_name || u.email,
      email:          u.email,
      remainingToday: remainingByUser[u.id] || 0,
      completedToday: completedByUser[u.id] || 0,
      winsThisWeek:   winsByUser[u.id]      || 0,
    }))
    .sort((a, b) => b.winsThisWeek - a.winsThisWeek || b.remainingToday - a.remainingToday);

  return new Response(JSON.stringify({ team }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// API: Users list (context-switcher + team member picker)
// ---------------------------------------------------------------------------

async function handleGetUsers(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('users')
    .select('id, email, full_name')
    .order('full_name');
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// API: Teams CRUD
// ---------------------------------------------------------------------------

async function handleGetTeams(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('cx_teams')
    .select('id, name, description, created_at')
    .order('name');
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } });
}

async function handleCreateTeam(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { name, description } = await context.request.json();
  if (!name?.trim()) {
    return new Response(JSON.stringify({ error: 'naam is verplicht' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_teams')
    .insert({ name: name.trim(), description: description?.trim() || null })
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

async function handleUpdateTeam(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id } = context.params;
  const body   = await context.request.json();
  const update = {};
  if (body.name        !== undefined) update.name        = body.name.trim();
  if (body.description !== undefined) update.description = body.description?.trim() || null;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('cx_teams').update(update).eq('id', id).select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeleteTeam(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id } = context.params;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from('cx_teams').delete().eq('id', id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// API: Team members
// ---------------------------------------------------------------------------

async function handleGetTeamMembers(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId } = context.params;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('cx_team_members')
    .select('user_id, users (id, email, full_name)')
    .eq('team_id', teamId);
  return new Response(JSON.stringify((data || []).map(r => r.users).filter(Boolean)), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleAddTeamMember(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId } = context.params;
  const { user_id } = await context.request.json();
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id verplicht' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_team_members')
    .insert({ team_id: teamId, user_id })
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.code === '23505' ? 409 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

async function handleRemoveTeamMember(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId, userId } = context.params;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('cx_team_members').delete()
    .eq('team_id', teamId).eq('user_id', userId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// API: Team activity configs
// ---------------------------------------------------------------------------

async function handleGetTeamActivities(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId } = context.params;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('cx_team_activity_configs')
    .select(`
      id, mapping_id, priority_weight, show_on_dashboard,
      danger_threshold_overdue, danger_threshold_today, include_in_streak,
      card_color_mode, card_fixed_color, card_threshold_steps,
      card_compact_pills, card_show_sparkline, card_hero_metric,
      card_title_override, card_model_filter, card_pills_mode, card_view_mode,
      cx_activity_mapping (id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at, notes)
    `)
    .eq('team_id', teamId);
  const ts = new Date().toISOString().substring(11, 19);
  const summary = (data || []).map(r => `[${r.cx_activity_mapping?.odoo_activity_type_id}]${r.cx_activity_mapping?.odoo_activity_type_name}(dash=${r.show_on_dashboard},kd=${r.cx_activity_mapping?.keep_done_confirmed_at ? '✓' : '⚠️'})`).join('  ');
  console.log(`[CX ${ts}] settings team:${teamId}  ${(data||[]).length}x activiteiten: ${summary || '(leeg)'}`);
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } });
}

async function handleAddTeamActivity(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId } = context.params;
  const {
    mapping_id,
    priority_weight          = 10,
    show_on_dashboard        = true,
    danger_threshold_overdue = 1,
    danger_threshold_today   = 3,
    include_in_streak        = true,
  } = await context.request.json();
  if (!mapping_id) {
    return new Response(JSON.stringify({ error: 'mapping_id verplicht' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_team_activity_configs')
    .insert({ team_id: teamId, mapping_id, priority_weight, show_on_dashboard,
              danger_threshold_overdue, danger_threshold_today, include_in_streak })
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.code === '23505' ? 409 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

async function handleUpdateTeamActivity(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId, mappingId } = context.params;
  const body    = await context.request.json();
  const allowed = ['priority_weight', 'show_on_dashboard', 'danger_threshold_overdue',
                   'danger_threshold_today', 'include_in_streak',
                   'card_color_mode', 'card_fixed_color', 'card_threshold_steps',
                   'card_compact_pills', 'card_show_sparkline', 'card_hero_metric',
                   'card_title_override', 'card_model_filter', 'card_pills_mode', 'card_view_mode'];
  const update  = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_team_activity_configs').update(update)
    .eq('team_id', teamId).eq('mapping_id', mappingId)
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

async function handleRemoveTeamActivity(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { id: teamId, mappingId } = context.params;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('cx_team_activity_configs').delete()
    .eq('team_id', teamId).eq('mapping_id', mappingId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// API: Personal activity configs
// ---------------------------------------------------------------------------

async function handleGetPersonalActivities(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('cx_user_personal_configs')
    .select(`
      id, mapping_id, priority_weight, show_on_dashboard,
      danger_threshold_overdue, danger_threshold_today, include_in_streak,
      card_color_mode, card_fixed_color, card_threshold_steps,
      card_compact_pills, card_show_sparkline, card_hero_metric,
      card_title_override, card_model_filter, card_pills_mode, card_view_mode,
      cx_activity_mapping (id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at, notes)
    `)
    .eq('user_id', context.user.id);
  const ts = new Date().toISOString().substring(11, 19);
  const summary = (data || []).map(r => `[${r.cx_activity_mapping?.odoo_activity_type_id}]${r.cx_activity_mapping?.odoo_activity_type_name}(dash=${r.show_on_dashboard},kd=${r.cx_activity_mapping?.keep_done_confirmed_at ? '✓' : '⚠️'})`).join('  ');
  console.log(`[CX ${ts}] settings personal  ${context.user.email}  ${(data||[]).length}x activiteiten: ${summary || '(leeg)'}`);
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } });
}

async function handleAddPersonalActivity(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const {
    mapping_id,
    priority_weight          = 10,
    show_on_dashboard        = true,
    danger_threshold_overdue = 1,
    danger_threshold_today   = 3,
    include_in_streak        = true,
  } = await context.request.json();
  if (!mapping_id) {
    return new Response(JSON.stringify({ error: 'mapping_id verplicht' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_user_personal_configs')
    .insert({ user_id: context.user.id, mapping_id, priority_weight, show_on_dashboard,
              danger_threshold_overdue, danger_threshold_today, include_in_streak })
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.code === '23505' ? 409 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

async function handleUpdatePersonalActivity(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { mappingId } = context.params;
  const body    = await context.request.json();
  const allowed = ['priority_weight', 'show_on_dashboard', 'danger_threshold_overdue',
                   'danger_threshold_today', 'include_in_streak',
                   'card_color_mode', 'card_fixed_color', 'card_threshold_steps',
                   'card_compact_pills', 'card_show_sparkline', 'card_hero_metric',
                   'card_title_override', 'card_model_filter', 'card_pills_mode', 'card_view_mode'];
  const update  = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_user_personal_configs').update(update)
    .eq('user_id', context.user.id).eq('mapping_id', mappingId)
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

async function handleRemovePersonalActivity(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { mappingId } = context.params;
  const supabase = createClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('cx_user_personal_configs').delete()
    .eq('user_id', context.user.id)
    .eq('mapping_id', mappingId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// API: Activity history (sparkline data — last 14 days)
// ---------------------------------------------------------------------------

async function handleGetActivityHistory(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { env, user } = context;
  const url      = new URL(context.request.url);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const todayStr = getTodayStr(env);
  const cutoff = (() => {
    const tz = env.ODOO_TIMEZONE || 'Europe/Amsterdam';
    return new Date(Date.now() - 13 * 86400000).toLocaleDateString('en-CA', { timeZone: tz });
  })();

  // Resolve which Odoo UIDs to use (same viewAs logic as handleGetActivities)
  const viewAsRaw  = url.searchParams.get('viewAs') || '';
  const isTeamView = viewAsRaw.startsWith('team:');
  const teamViewId = isTeamView ? viewAsRaw.slice(5) : null;

  let odooUids = [];
  let trackedTypeIds = [];

  if (isTeamView && teamViewId) {
    // Resolve team member UIDs and team activity type config in parallel
    const [{ data: members }, { data: teamConfigs }] = await Promise.all([
      supabase.from('cx_team_members').select('user_id').eq('team_id', teamViewId),
      supabase.from('cx_team_activity_configs')
        .select('cx_activity_mapping(odoo_activity_type_id)')
        .eq('team_id', teamViewId),
    ]);
    if (members?.length) {
      const { data: memberRows } = await supabase
        .from('users').select('id, odoo_uid').in('id', members.map(m => m.user_id));
      odooUids = (memberRows || []).filter(r => r.odoo_uid).map(r => r.odoo_uid);
    }
    trackedTypeIds = (teamConfigs || []).map(tc => tc.cx_activity_mapping?.odoo_activity_type_id).filter(Boolean);
  } else {
    const targetUserId = (!isTeamView && viewAsRaw && viewAsRaw !== user.id) ? viewAsRaw : user.id;
    const [{ data: userRow }, mappings] = await Promise.all([
      supabase.from('users').select('odoo_uid').eq('id', targetUserId).single(),
      getEffectiveMappings(supabase, targetUserId),
    ]);
    if (userRow?.odoo_uid) odooUids = [userRow.odoo_uid];
    trackedTypeIds = mappings.map(m => m.odoo_activity_type_id);
  }

  console.log(`[CX history] ${user.email}  viewAs=${viewAsRaw||'self'}  odooUids=[${odooUids.join(',')}]  types=[${trackedTypeIds.join(',')}]  range=${cutoff}..${todayStr}`);

  // Fetch completed activities directly from Odoo
  const odooCompleted = odooUids.length && trackedTypeIds.length
    ? await fetchCompletedInRange(env, odooUids, trackedTypeIds, cutoff, todayStr)
    : [];

  // Group Odoo completions by type + date
  const completedMap = {};
  for (const a of odooCompleted) {
    const typeId = Array.isArray(a.activity_type_id) ? a.activity_type_id[0] : a.activity_type_id;
    const key    = `${typeId}|${a.date_done}`;
    completedMap[key] = (completedMap[key] || 0) + 1;
  }

  const result = [];
  for (const [key, count] of Object.entries(completedMap)) {
    const sep    = key.indexOf('|');
    const typeId = parseInt(key.substring(0, sep), 10);
    const date   = key.substring(sep + 1);
    result.push({
      activity_type_id: typeId,
      snapshot_date:    date,
      completed_count:  count,
      remaining_count:  0,
    });
  }
  result.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  console.log(`[CX history] → ${result.length} datapunten  (odoo=${odooCompleted.length})`);

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// DEBUG: raw Odoo fetch — two unmodified queries, zero transformation
// ---------------------------------------------------------------------------

async function handleGetRawActivities(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  const { env, user } = context;
  const url      = new URL(context.request.url);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const viewAsRaw    = url.searchParams.get('viewAs') || '';
  const isTeamView   = viewAsRaw.startsWith('team:');
  const teamViewId   = isTeamView ? viewAsRaw.slice(5) : null;
  const targetUserId = (!isTeamView && viewAsRaw && viewAsRaw !== user.id) ? viewAsRaw : user.id;

  // Resolve userIds + mappings + odooUid in parallel
  let odooUids = [];
  let mappings = [];
  let odooUid  = null;

  if (isTeamView && teamViewId) {
    const [{ data: members }, { data: teamConfigs }] = await Promise.all([
      supabase.from('cx_team_members').select('user_id').eq('team_id', teamViewId),
      supabase.from('cx_team_activity_configs')
        .select(`
          mapping_id, priority_weight, show_on_dashboard,
          danger_threshold_overdue, danger_threshold_today, include_in_streak,
          card_color_mode, card_fixed_color, card_threshold_steps,
          card_compact_pills, card_show_sparkline, card_hero_metric,
          card_title_override, card_model_filter, card_pills_mode, card_view_mode,
          cx_activity_mapping(id, odoo_activity_type_id, odoo_activity_type_name, is_win, keep_done_confirmed_at)
        `)
        .eq('team_id', teamViewId),
    ]);
    if (members?.length) {
      const { data: memberRows } = await supabase
        .from('users').select('odoo_uid').in('id', members.map(m => m.user_id));
      odooUids = (memberRows || []).filter(r => r.odoo_uid).map(r => r.odoo_uid);
    }
    mappings = (teamConfigs || []).map(tc => {
      const m = tc.cx_activity_mapping;
      return {
        id: m.id, odoo_activity_type_id: m.odoo_activity_type_id,
        odoo_activity_type_name: m.odoo_activity_type_name,
        priority_weight: tc.priority_weight, is_win: m.is_win,
        show_on_dashboard: tc.show_on_dashboard,
        danger_threshold_overdue: tc.danger_threshold_overdue,
        danger_threshold_today: tc.danger_threshold_today,
        include_in_streak: tc.include_in_streak,
        card_color_mode: tc.card_color_mode || 'auto',
        card_fixed_color: tc.card_fixed_color || null,
        card_threshold_steps: tc.card_threshold_steps || null,
        card_compact_pills: !!tc.card_compact_pills,
        card_show_sparkline: !!tc.card_show_sparkline,
        card_hero_metric: tc.card_hero_metric || 'auto',
        card_title_override: tc.card_title_override || null,
        card_model_filter: tc.card_model_filter || null,
        card_pills_mode: tc.card_pills_mode || 'standard',
        card_view_mode: tc.card_view_mode || 'stats',
        keep_done_confirmed_at: m.keep_done_confirmed_at,
      };
    });
  } else {
    const [{ data: row }, effectiveMappings] = await Promise.all([
      supabase.from('users').select('odoo_uid').eq('id', targetUserId).single(),
      getEffectiveMappings(supabase, targetUserId),
    ]);
    if (row?.odoo_uid) { odooUids = [row.odoo_uid]; odooUid = row.odoo_uid; }
    mappings = effectiveMappings;
  }

  if (!odooUids.length) {
    return new Response(JSON.stringify({
      error: 'geen odoo_uid gevonden',
      openActivities: [], completedActivities: [], mappings, isTeamView,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const activityTypeIds = mappings.map(m => m.odoo_activity_type_id);
  const timeframeDays = 30;
  const tz = env.ODOO_TIMEZONE || 'Europe/Amsterdam';
  const today    = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const dateFrom = new Date(Date.now() - (timeframeDays - 1) * 86400000).toLocaleDateString('en-CA', { timeZone: tz });

  const queryConfig = { userIds: odooUids, activityTypeIds, timeframeDays, dateFrom, dateTo: today };
  console.log('[CX QUERY]', JSON.stringify(queryConfig));

  const fields = ['id', 'activity_type_id', 'user_id', 'res_model', 'res_id', 'res_name', 'date_deadline', 'date_done', 'summary', 'note', 'state'];

  // QUERY 1: open activities
  const openDomain = [['user_id', 'in', odooUids], ['active', '=', true]];
  if (activityTypeIds.length) openDomain.push(['activity_type_id', 'in', activityTypeIds]);

  // QUERY 2: completed activities
  const completedDomain = [
    ['user_id', 'in', odooUids],
    ['date_done', '!=', false],
    ['date_done', '>=', dateFrom],
  ];
  if (activityTypeIds.length) completedDomain.push(['activity_type_id', 'in', activityTypeIds]);

  const [rawOpen, rawCompleted] = await Promise.all([
    searchRead(env, { model: 'mail.activity', domain: openDomain, fields, limit: false }),
    searchRead(env, { model: 'mail.activity', domain: completedDomain, fields, limit: false, context: { active_test: false } }),
  ]);

  const openActivities      = rawOpen      || [];
  const completedActivities = rawCompleted || [];

  console.log('[CX INIT] openActivities:', openActivities.length);
  console.log('[CX INIT] completedActivities:', completedActivities.length);

  // Wins for the week
  const wins = await getUserWins(env, targetUserId);

  return new Response(JSON.stringify({
    openActivities,
    completedActivities,
    mappings,
    wins,
    odooUid,
    odooBaseUrl: env.ODOO_URL || 'https://mymmo.odoo.com',
    isTeamView,
    today,
    queryConfig,
  }), { headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Route map
// ---------------------------------------------------------------------------

export const routes = {
  'GET /':                                       handleDashboard,
  'GET /settings':                               handleSettings,
  'GET /api/activities':                         handleGetActivities,
  'GET /api/wins':                               handleGetWins,
  'GET /api/team':                               handleGetTeamStats,
  'GET /api/users':                              handleGetUsers,
  'GET /api/mappings':                           handleGetMappings,
  'GET /api/activity-types':                     handleGetActivityTypes,
  'GET /api/activity-history':                   handleGetActivityHistory,
  'GET /api/activities-raw':                     handleGetRawActivities,
  'POST /api/mappings':                          handleCreateMapping,
  'PUT /api/mappings/:id':                       handleUpdateMapping,
  'DELETE /api/mappings/:id':                    handleDeleteMapping,
  'GET /api/teams':                              handleGetTeams,
  'POST /api/teams':                             handleCreateTeam,
  'PUT /api/teams/:id':                          handleUpdateTeam,
  'DELETE /api/teams/:id':                       handleDeleteTeam,
  'GET /api/teams/:id/members':                  handleGetTeamMembers,
  'POST /api/teams/:id/members':                 handleAddTeamMember,
  'DELETE /api/teams/:id/members/:userId':       handleRemoveTeamMember,
  'GET /api/teams/:id/activities':               handleGetTeamActivities,
  'POST /api/teams/:id/activities':              handleAddTeamActivity,
  'POST /api/teams/:id/activities/by-odoo-type': (ctx) => handleAddActivityByOdooType(ctx, true),
  'PUT /api/teams/:id/activities/:mappingId':    handleUpdateTeamActivity,
  'DELETE /api/teams/:id/activities/:mappingId': handleRemoveTeamActivity,
  'GET /api/personal-activities':                handleGetPersonalActivities,
  'POST /api/personal-activities':               handleAddPersonalActivity,
  'POST /api/personal-activities/by-odoo-type':  (ctx) => handleAddActivityByOdooType(ctx, false),
  'PUT /api/personal-activities/:mappingId':      handleUpdatePersonalActivity,
  'DELETE /api/personal-activities/:mappingId':  handleRemovePersonalActivity,
};
