/**
 * CX Automations — Route handlers
 */

import { getSupabaseClient } from '../../lib/database.js';
import { searchRead, executeKw } from '../../lib/odoo.js';
import { runFlagCron } from './cron.js';

// ── Odoo config (stages + redenen) ─────────────────────────────────────────

export async function handleGetOdooConfig({ env }) {
  // 1. CS-stages ophalen uit Odoo: sequence 11–15 (Discovery=10 en Done=16 overslaan)
  const stages = await searchRead(env, {
    model: 'x_support_stage',
    domain: [
      ['x_studio_sequence', '>', 10],
      ['x_studio_sequence', '<', 16],
    ],
    fields: ['id', 'x_name', 'x_studio_sequence'],
    order: 'x_studio_sequence asc',
  });

  // 2. Selectieopties van x_flag_reason ophalen via fields_get
  const fieldsInfo = await executeKw(env, {
    model: 'x_sales_action_sheet',
    method: 'fields_get',
    args: [['x_flag_reason']],
    kwargs: { attributes: ['selection'] },
  });

  const reasons = (fieldsInfo?.x_flag_reason?.selection || [])
    .filter(([value]) => value !== 'manual') // 'manual' niet relevant voor auto-cron
    .map(([value, label]) => ({ value, label }));

  return new Response(JSON.stringify({
    success: true,
    stages: stages.map(s => ({ id: s.id, name: s.x_name })),
    reasons,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Technical blocks ────────────────────────────────────────────────────────

export async function handleGetTechnicalBlocks({ env }) {
  // Actiebladen in CS-stages zonder gekoppeld gebouw
  const csStages = await searchRead(env, {
    model: 'x_support_stage',
    domain: [['x_studio_sequence', '>', 10], ['x_studio_sequence', '<', 16]],
    fields: ['id'],
  });
  const csStageIds = csStages.map(s => s.id);

  const records = await searchRead(env, {
    model: 'x_sales_action_sheet',
    domain: [
      ['x_studio_stage_id', 'in', csStageIds],
      ['x_studio_for_company_id', '=', false],
    ],
    fields: ['id', 'x_name', 'x_studio_stage_id', 'x_studio_support_user_id'],
    order: 'x_studio_stage_id asc',
  });

  return new Response(JSON.stringify({ success: true, data: records }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Thresholds ──────────────────────────────────────────────────────────────

export async function handleGetThresholds({ env }) {
  const supabase = getSupabaseClient(env);

  const { data, error } = await supabase
    .from('flag_thresholds')
    .select('*')
    .order('stage_id', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleSaveThresholds({ env, request, user }) {
  const supabase = getSupabaseClient(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Ongeldige JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { thresholds } = body;
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    return new Response(JSON.stringify({ success: false, error: 'Geen drempelwaarden aangeleverd' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  for (const t of thresholds) {
    if (!t.stage_id) {
      return new Response(JSON.stringify({ success: false, error: 'Elke rij vereist een stage_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Volgorde valideren voor ingeschakelde niveaus (> 0)
    const active = [t.yellow_days, t.orange_days, t.red_days].filter(d => d > 0);
    for (let i = 1; i < active.length; i++) {
      if (active[i] <= active[i - 1]) {
        return new Response(JSON.stringify({
          success: false,
          error: `Fase ${t.stage_id}: ingeschakelde niveaus moeten oplopend zijn`,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  const rows = thresholds.map(t => ({
    stage_id:    t.stage_id,
    stage_name:  t.stage_name || String(t.stage_id), // cache voor leesbaarheid in DB
    yellow_days: Number(t.yellow_days),
    orange_days: Number(t.orange_days),
    red_days:    Number(t.red_days),
    flag_reason: t.flag_reason || 'no_activity',
    updated_at:  new Date().toISOString(),
    updated_by:  user?.email || null,
  }));

  const { error } = await supabase
    .from('flag_thresholds')
    .upsert(rows, { onConflict: 'stage_id' });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Technical block instellingen (cx_settings) ─────────────────────────────

export async function handleGetSettings({ env }) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('cx_settings')
    .select('key, value')
    .in('key', ['tech_block_orange_days', 'tech_block_red_days']);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = {};
  for (const row of data || []) settings[row.key] = row.value;

  return new Response(JSON.stringify({ success: true, settings }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleSaveSettings({ env, request, user }) {
  const supabase = getSupabaseClient(env);

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ success: false, error: 'Ongeldige JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const orangeDays = parseInt(body.tech_block_orange_days);
  const redDays    = parseInt(body.tech_block_red_days);

  if (isNaN(orangeDays) || isNaN(redDays) || orangeDays < 0 || redDays < 0) {
    return new Response(JSON.stringify({ success: false, error: 'Ongeldige waarden' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (orangeDays > 0 && redDays > 0 && redDays <= orangeDays) {
    return new Response(JSON.stringify({
      success: false, error: 'Rood moet groter zijn dan oranje (of stel een op 0 om uit te schakelen)',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('cx_settings').upsert([
    { key: 'tech_block_orange_days', value: String(orangeDays), updated_at: now, updated_by: user?.email || null },
    { key: 'tech_block_red_days',    value: String(redDays),    updated_at: now, updated_by: user?.email || null },
  ], { onConflict: 'key' });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Manuele cron-trigger ────────────────────────────────────────────────────

export async function handleRunCron({ env }) {
  try {
    await runFlagCron(env);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Run log ─────────────────────────────────────────────────────────────────

export async function handleGetLog({ env }) {
  const supabase = getSupabaseClient(env);

  const { data, error } = await supabase
    .from('flag_run_log')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(10);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
