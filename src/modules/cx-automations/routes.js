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
    stage_id:           t.stage_id,
    stage_name:         t.stage_name || String(t.stage_id), // cache voor leesbaarheid in DB
    yellow_days:        Number(t.yellow_days),
    orange_days:        Number(t.orange_days),
    red_days:           Number(t.red_days),
    flag_reason:        t.flag_reason || 'no_activity',
    auto_clear_enabled: !!t.auto_clear_enabled,
    updated_at:         new Date().toISOString(),
    updated_by:         user?.email || null,
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

// ── Merger config ───────────────────────────────────────────────────────────

const MERGER_PAIRS = {
  estate:  { label: 'Gebouw overnemen',  actionIds: [1041, 1042], model: 'res.partner' },
  contact: { label: 'Contact overnemen', actionIds: [1163, 1164], model: 'res.partner' },
};
const MERGER_SENTINEL = 'FIELD_GROUPS = get_field_groups()';

/**
 * Parse get_field_groups() uit de Python-actiecode.
 * Probeert eerst een ingebedde # MERGER_CONFIG_JSON: comment;
 * valt terug op regex-parse van de Python-dict.
 */
function parseFieldGroups(code) {
  const jsonMatch = code.match(/# MERGER_CONFIG_JSON: (.+)/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }

  const categories = [];
  const catRx = /'(\w+)':\s*\{\s*'label':\s*'([^']+)',\s*'fields':\s*\[([\s\S]*?)\],?\s*\},/g;
  let cm;
  while ((cm = catRx.exec(code)) !== null) {
    const fields = [];
    const fRx = /\('([^']+)',\s*'([^']+)'\)/g;
    let fm;
    while ((fm = fRx.exec(cm[3])) !== null) {
      fields.push([fm[1], fm[2]]);
    }
    categories.push({ key: cm[1], label: cm[2], fields });
  }
  return categories;
}

/**
 * Genereer het Python-blok (config-comment + get_field_groups functie).
 */
function generateMergerBlock(categories) {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let py = '# MERGER_CONFIG_JSON: ' + JSON.stringify(categories) + '\n';
  py += 'def get_field_groups():\n';
  py += '    return {\n';
  for (const cat of categories) {
    py += "        '" + esc(cat.key) + "': {\n";
    py += "            'label': '" + esc(cat.label) + "',\n";
    py += "            'fields': [\n";
    for (const [f, l] of (cat.fields || [])) {
      py += "                ('" + esc(f) + "', '" + esc(l) + "'),\n";
    }
    py += "            ],\n";
    py += "        },\n";
  }
  py += '    }\n';
  return py;
}

export async function handleGetMergerConfig({ env, request }) {
  const pair = new URL(request.url).searchParams.get('pair') || 'estate';
  const pairConfig = MERGER_PAIRS[pair];
  if (!pairConfig) {
    return new Response(JSON.stringify({ success: false, error: 'Onbekende pair: ' + pair }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const result = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[pairConfig.actionIds[0]]],
      kwargs: { fields: ['code'] },
    });
    const code = result?.[0]?.code || '';
    const categories = parseFieldGroups(code);
    return new Response(JSON.stringify({ success: true, categories, pair, label: pairConfig.label }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGetMergerFields({ env, request }) {
  const pair = new URL(request.url).searchParams.get('pair') || 'estate';
  const pairConfig = MERGER_PAIRS[pair];
  if (!pairConfig) {
    return new Response(JSON.stringify({ success: false, error: 'Onbekende pair: ' + pair }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const SKIP_TYPES  = new Set(['one2many', 'many2many', 'binary', 'html', 'reference']);
  const SKIP_FIELDS = new Set(['id', 'create_uid', 'create_date', 'write_uid', 'write_date', 'display_name', '__last_update', 'active']);

  try {
    const [actionResult, fieldsResult] = await Promise.all([
      executeKw(env, {
        model: 'ir.actions.server',
        method: 'read',
        args: [[pairConfig.actionIds[0]]],
        kwargs: { fields: ['code'] },
      }),
      executeKw(env, {
        model: pairConfig.model,
        method: 'fields_get',
        args: [],
        kwargs: { attributes: ['string', 'type'] },
      }),
    ]);

    const categories = parseFieldGroups(actionResult?.[0]?.code || '');
    const mappedFields = new Set(categories.flatMap(c => (c.fields || []).map(([f]) => f)));

    const fields = Object.entries(fieldsResult || {})
      .filter(([name, info]) => !SKIP_FIELDS.has(name) && !SKIP_TYPES.has(info.type))
      .map(([name, info]) => ({
        name,
        label: info.string,
        type: info.type,
        mapped: mappedFields.has(name),
      }))
      .sort((a, b) => {
        if (a.mapped !== b.mapped) return a.mapped ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

    return new Response(JSON.stringify({ success: true, fields }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleSaveMergerConfig({ env, request }) {
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ success: false, error: 'Ongeldige JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { categories, pair = 'estate' } = body;
  const pairConfig = MERGER_PAIRS[pair];
  if (!pairConfig) {
    return new Response(JSON.stringify({ success: false, error: 'Onbekende pair: ' + pair }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!Array.isArray(categories)) {
    return new Response(JSON.stringify({ success: false, error: '"categories" array vereist' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Valideer: elke categorie heeft key, label en fields-array
  for (const cat of categories) {
    if (!cat.key || !cat.label || !Array.isArray(cat.fields)) {
      return new Response(JSON.stringify({ success: false, error: 'Elke categorie vereist key, label en fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    // Lees beide acties van dit pair parallel
    const results = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [pairConfig.actionIds],
      kwargs: { fields: ['id', 'code'] },
    });

    const newBlock = generateMergerBlock(categories);
    const writes = [];

    for (const action of results) {
      const code = action.code || '';
      const sentinelIdx = code.indexOf(MERGER_SENTINEL);
      if (sentinelIdx === -1) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Sentinel "' + MERGER_SENTINEL + '" niet gevonden in actie ' + action.id,
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      const afterSentinel = code.substring(sentinelIdx + MERGER_SENTINEL.length);
      const newCode = newBlock + '\n' + MERGER_SENTINEL + afterSentinel;
      writes.push(executeKw(env, {
        model: 'ir.actions.server',
        method: 'write',
        args: [[action.id], { code: newCode }],
      }));
    }

    await Promise.all(writes);

    return new Response(JSON.stringify({ success: true, updated: pairConfig.actionIds }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Lead-preview patch (eenmalig) ──────────────────────────────────────────

export async function handlePatchLeadPreview({ env }) {
  // Sentinel MET 4 spaties zodat we nooit de 8-spaties contacten-branch matchen
  const ACTIONS = [
    { id: 1042, writeField: 'x_studio_overview_html', label: 'estate preview',  isExecute: false },
    { id: 1164, writeField: 'x_overview_html',        label: 'contact preview', isExecute: false },
    { id: 1041, writeField: null,                     label: 'estate execute',   isExecute: true  },
    { id: 1163, writeField: null,                     label: 'contact execute',  isExecute: true  },
  ];

  const results = [];

  for (const action of ACTIONS) {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[action.id]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';

    if (action.isExecute ? code.includes('relink_leads_exec') : (code.includes('relink_leads') && code.includes('lead_count'))) {
      results.push({ id: action.id, status: 'reeds gepatcht — overgeslagen' });
      continue;
    }

    // Execute-actie (1041/1163): alleen de "geen categorie" check aanpassen
    if (action.isExecute) {
      // Voeg relink_leads_exec toe voor de check
      code = code.replace(
        '    if not active_groups:\n        raise UserError("Geen categorie geselecteerd om te kopiëren.")\n',
        '    relink_leads_exec = \'x_relink_leads\' in wiz._fields and bool(wiz.x_relink_leads)\n' +
        '    if not active_groups and not relink_leads_exec:\n        raise UserError("Geen categorie geselecteerd om te kopiëren.")\n'
      );
      await executeKw(env, {
        model: 'ir.actions.server',
        method: 'write',
        args: [[action.id], { code }],
      });
      results.push({ id: action.id, status: 'gepatcht ✅' });
      continue;
    }

    // Fix 1: voeg relink_leads variabele toe na de active_groups log
    const logAnchor = '    _logger.info(f"[COPY PREVIEW] Actieve groepen: {active_groups}")\n';
    if (code.includes(logAnchor)) {
      code = code.replace(
        logAnchor,
        logAnchor + "    relink_leads = 'x_relink_leads' in wiz._fields and bool(wiz.x_relink_leads)\n"
      );
    }

    // Fix 2: update de "niets geselecteerd" check zodat leads-only ook werkt
    code = code.replace(
      '    if not active_groups and not wiz.x_studio_relink_contacts:\n',
      '    if not active_groups and not wiz.x_studio_relink_contacts and not relink_leads:\n'
    );

    // Fix 3: lead preview invoegen VOOR de laatste write (sentinel met 4 spaties)
    const sentinel = "    wiz.write({'" + action.writeField + "': html})";
    const idx = code.lastIndexOf(sentinel);
    if (idx === -1) {
      results.push({ id: action.id, status: 'sentinel niet gevonden: ' + action.writeField, skipped: true });
      continue;
    }

    const leadBlock = [
      '    # Lead-preview',
      "    if 'x_relink_leads' in wiz._fields and wiz.x_relink_leads:",
      "        lead_count = env['crm.lead'].search_count([('partner_id', '=', source.id)])",
      '        if lead_count:',
      "            html += (",
      "                '<div style=\"margin-top:16px;padding:10px 14px;background:#fff8e1;'",
      "                'border:1px solid #ffe082;border-radius:4px;font-size:13px;\">'",
      "                + '<b>' + str(lead_count) + ' lead(s)</b> van '",
      "                + source.display_name + ' worden overgedragen naar ' + target.display_name + '.'",
      "                + '</div>'",
      '            )',
      '',
    ].join('\n');

    code = code.slice(0, idx) + leadBlock + code.slice(idx);

    await executeKw(env, {
      model: 'ir.actions.server',
      method: 'write',
      args: [[action.id], { code }],
    });

    results.push({ id: action.id, status: 'gepatcht ✅' });
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Upgrade lead-display in preview-acties ──────────────────────────────────

export async function handleUpgradeLeadPreview({ env }) {
  // Vervangt de count-banner door een echte sectie (zoals contacten),
  // en voegt een leads-only branch toe als er geen categorieën geselecteerd zijn.
  const PREVIEW_ACTIONS = [
    { id: 1042, writeField: 'x_studio_overview_html' },
    { id: 1164, writeField: 'x_overview_html' },
  ];

  const results = [];

  for (const action of PREVIEW_ACTIONS) {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[action.id]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';

    if (code.includes('lead_rows')) {
      results.push({ id: action.id, status: 'reeds geüpgraded — overgeslagen' });
      continue;
    }

    // Fix 1: vervang count-banner door leads-lijst (zoals contacten)
    // Fix specifiek voor 1164: voeg relink_leads variabele + bijgewerkte check toe
    if (action.id === 1164) {
      // Voeg relink_leads toe na active_groups
      code = code.replace(
        '    active_groups = [key for key in FIELD_GROUPS if wiz[key]]\n',
        '    active_groups = [key for key in FIELD_GROUPS if wiz[key]]\n' +
        "    relink_leads = 'x_relink_leads' in wiz._fields and bool(wiz.x_relink_leads)\n"
      );
      // Update "geen categorie" check
      code = code.replace(
        "    if not active_groups:\n        wiz.write({'x_overview_html': '<i>⚠️ Geen categorie geselecteerd.</i>'})\n        continue\n",
        "    if not active_groups and not relink_leads:\n        wiz.write({'x_overview_html': '<i>⚠️ Geen categorie geselecteerd.</i>'})\n        continue\n"
      );
      // Voeg leads-only branch toe voor left_sections
      const anchor1164 = "    left_sections = ''\n";
      const anchorIdx1164 = code.indexOf(anchor1164);
      if (anchorIdx1164 !== -1 && !code.includes('leads_only')) {
        const branch = [
          "    # === Enkel leads herlinken ===",
          "    if not active_groups and relink_leads:",
          "        leads_only = env['crm.lead'].with_context(active_test=False).search([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])",
          "        lead_rows_only = ''",
          "        for lead in leads_only:",
          "            status = 'Verloren' if not lead.active else 'Actief'",
          "            lead_rows_only += \"<tr><td style='padding:4px 8px;color:#333;'>\" + (lead.name or 'Naamloos') + \"</td><td>\" + status + \"</td></tr>\"",
          "        wiz.write({'x_overview_html': (",
          "            '<div style=\"font-size:13px;line-height:1.5;color:#2c2c2c;\">'",
          "            '<h4 style=\"margin:0 0 6px;font-weight:600;\">Leads/Opportuniteiten overdragen</h4>'",
          "            '<p style=\"margin:0 0 12px;font-size:12px;color:#555;\">'",
          "            + str(len(leads_only)) + ' lead(s) van <b>' + source.display_name + '</b> worden overgedragen naar <b>' + target.display_name + '</b>.'",
          "            + '</p><table style=\"width:100%;border-collapse:collapse;margin-top:4px;\">'",
          "            + (lead_rows_only or '<tr><td><i>Geen leads gevonden</i></td></tr>')",
          "            + '</table></div>'",
          "        )})",
          "        continue",
          "",
        ].join('\n');
        code = code.slice(0, anchorIdx1164) + branch + code.slice(anchorIdx1164);
      }
    }

    // Vervang lead-preview blok (zoek op commentaarregel, flexibel)
    const leadPreviewStart = code.includes('    # Lead-preview\n') ? '    # Lead-preview\n' : '    # Leads tonen in preview\n';
    const leadPreviewEnd = '            )\n';
    const startIdx = code.indexOf(leadPreviewStart);
    const endIdx = startIdx !== -1 ? code.indexOf(leadPreviewEnd, startIdx) : -1;

    if (startIdx === -1 || endIdx === -1) {
      results.push({ id: action.id, status: 'lead-preview blok niet gevonden — sla over' });
      continue;
    }

    const newBlock = [
      "    # Lead-preview",
      "    if 'x_relink_leads' in wiz._fields and wiz.x_relink_leads:",
      "        leads = env['crm.lead'].with_context(active_test=False).search([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])",
      "        if leads:",
      "            lead_rows = ''",
      "            for lead in leads:",
      "                status = 'Verloren' if not lead.active else 'Actief'",
      "                lead_rows += \"<tr><td style='padding:4px 8px;color:#333;'>\" + (lead.name or 'Naamloos') + \"</td><td>\" + status + \"</td></tr>\"",
      "            html += (",
      "                \"<h6 style='margin-top:18px;font-size:13px;font-weight:600;color:#2c2c2c;'>\"",
      "                + \"Leads/Opportuniteiten die overgedragen worden (\" + str(len(leads)) + \"):\"",
      "                + \"</h6>\"",
      "                + \"<table style='width:100%;border-collapse:collapse;margin-top:4px;'>\"",
      "                + lead_rows",
      "                + \"</table>\"",
      "            )",
    ].join('\n');

    code = code.slice(0, startIdx) + newBlock + '\n' + code.slice(endIdx + leadPreviewEnd.length);

    // Fix 2: voeg leads-only branch toe (voor wiz.write sentinel)
    const leadsOnlyBranch = [
      "    # === 1b Enkel leads herlinken ===",
      "    if not active_groups and relink_leads:",
      "        leads_only = env['crm.lead'].search([('active', 'in', [True, False]), ('partner_id', '=', source.id)])",
      "        lead_rows_only = ''",
      "        for lead in leads_only:",
      "            status = 'Verloren' if not lead.active else 'Actief'",
      "            lead_rows_only += \"<tr><td style='padding:4px 8px;color:#333;'>\" + (lead.name or 'Naamloos') + \"</td><td>\" + status + \"</td></tr>\"",
      "        html_leads_only = (",
      "            '<div style=\"font-family:var(--font-family,\\'Odoo Sans\\',\\'Roboto\\',sans-serif);'",
      "            'font-size:13px;line-height:1.5;color:#2c2c2c;\">'",
      "            '<h4 style=\"margin:0 0 6px;font-weight:600;\">Leads/Opportuniteiten overdragen</h4>'",
      "            '<p style=\"margin:0 0 12px;font-size:12px;color:#555;\">'",
      "            + str(len(leads_only)) + ' lead(s) van <b>' + source.display_name + '</b> worden overgedragen naar <b>' + target.display_name + '</b>.'",
      "            + '</p>'",
      "            '<table style=\"width:100%;border-collapse:collapse;margin-top:4px;\">'",
      "            + (lead_rows_only or '<tr><td><i>Geen leads gevonden</i></td></tr>')",
      "            + '</table></div>'",
      "        )",
      "        wiz.write({'" + action.writeField + "': html_leads_only})",
      "        continue",
      "",
    ].join('\n');

    // Anker: voor de 'left_sections = ""' regel
    const anchor = '    left_sections = ""\n';
    const anchorIdx = code.indexOf(anchor);
    if (anchorIdx !== -1 && !code.includes('leads_only')) {
      code = code.slice(0, anchorIdx) + leadsOnlyBranch + code.slice(anchorIdx);
    }

    await executeKw(env, {
      model: 'ir.actions.server',
      method: 'write',
      args: [[action.id], { code }],
    });
    results.push({ id: action.id, status: 'geüpgraded ✅' });
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Fix lead-zoekopdracht: include active=False (lost leads) ────────────────

export async function handleFixLeadSearch({ env }) {
  // In preview-acties: search_count → with_context(active_test=False).search_count
  // In execute-acties: search(      → with_context(active_test=False).search(
  const FIXES = [
    // Preview: child_of zodat leads via contactpersonen ook gevonden worden
    { id: 1042, old: "search_count([('partner_id', '=', source.id)])",                                new: "search_count([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])" },
    { id: 1042, old: "search_count([('active', 'in', [True, False]), ('partner_id', '=', source.id)])", new: "search_count([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])" },
    { id: 1164, old: "search_count([('partner_id', '=', source.id)])",                                new: "search_count([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])" },
    { id: 1164, old: "search_count([('active', 'in', [True, False]), ('partner_id', '=', source.id)])", new: "search_count([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])" },
    // Execute: = volstaat (contact-leads volgen mee via relink_contacts); wel active=False includé
    { id: 1041, old: "search([('partner_id', '=', source.id)])",       new: "search([('active', 'in', [True, False]), ('partner_id', '=', source.id)])"       },
    { id: 1163, old: "search([('partner_id', '=', source.id)])",       new: "search([('active', 'in', [True, False]), ('partner_id', '=', source.id)])"       },
  ];

  const results = [];

  for (const fix of FIXES) {
    const result = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[fix.id]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = result?.[0]?.code || '';

    if (!code.includes(fix.old)) {
      results.push({ id: fix.id, status: 'al gepatcht of sentinel niet gevonden' });
      continue;
    }

    code = code.split(fix.old).join(fix.new);

    await executeKw(env, {
      model: 'ir.actions.server',
      method: 'write',
      args: [[fix.id], { code }],
    });
    results.push({ id: fix.id, status: 'gepatcht ✅' });
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Inline checkboxen: vervang twee-tabel layout door één tabel per rij ─────
//
// v2: onchange per checkbox update x_excluded_fields via OWL form event
//     (geen "Pas toe & herlaad" knop meer — user vlinkt gewoon op "Kopieer")

// _OC: onchange JS voor elke checkbox.
// Gebruikt uitsluitend " voor strings → attribuut veilig in '-delimiters.
// Zet fi.value + dispatcht input+change → OWL pikt dit op en markeert field als dirty.
// Schrijft direct naar de DB via Odoo JSON-RPC (geen CSRF nodig voor type='json' routes).
// OWL markeert x_excluded_fields niet als dirty via dispatchEvent → DB-write is de enige betrouwbare aanpak.
// data-wiz-id + data-wiz-model zitten op de data-fex container (gezet door makeInlineCheckboxBlock).
const _OC = '(function(){var el=event.target;if(!el)return;el.closest("tr").style.opacity=el.checked?"1":"0.4";var fex=el.closest("[data-fex]");if(!fex)return;var wid=parseInt(fex.dataset.wizId);var wm=fex.dataset.wizModel;if(!wid||!wm)return;var excl=Array.from(fex.querySelectorAll("input[data-field]:not(:checked)")).map(function(c){return c.dataset.field;}).join(",");fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:wm,method:"write",args:[[wid],{x_excluded_fields:excl}],kwargs:{}}})});;})()';

function makeInlineCheckboxBlock(hasSoidIcon) {
  const thBron = hasSoidIcon
    ? 'Bron: {source.display_name}{soid_icon(source)}'
    : 'Bron: {source.display_name}';
  const thDoel = hasSoidIcon
    ? 'Doel: {target.display_name}{soid_icon(target)}'
    : 'Doel: {target.display_name}';

  return `    excluded_set = set()
    if 'x_excluded_fields' in wiz._fields and wiz.x_excluded_fields:
        excluded_set = set(f.strip() for f in wiz.x_excluded_fields.split(',') if f.strip())
    _oc = '${_OC}'
    field_sections = ""
    for key in active_groups:
        group = FIELD_GROUPS[key]
        field_rows = ""
        for field, label in group['fields']:
            is_excl = field in excluded_set
            row_style = "opacity:0.4;" if is_excl else ""
            chk = "" if is_excl else " checked"
            left_val = get_val(source, field)
            right_val = get_val(target, field)
            if not is_excl and highlight_diff(source, target, field, allow_empty):
                right_val = "<b style='color:#c62828;'>" + right_val + "</b>"
            field_rows += (
                "<tr data-field-row='" + field + "' style='" + row_style + "'>"
                "<td style='width:22px;padding:4px 4px 4px 0;vertical-align:middle;'>"
                "<input type='checkbox'" + chk + " data-field='" + field + "' onchange='" + _oc + "' style='cursor:pointer;'>"
                "</td>"
                "<td style='width:170px;padding:4px 6px 4px 0;color:#222;vertical-align:top;'>" + label + "</td>"
                "<td style='padding:4px 8px;text-align:right;color:#444;white-space:nowrap;border-right:1px solid #e0e0e0;'>" + left_val + "</td>"
                "<td style='padding:4px 8px;text-align:right;color:#444;white-space:nowrap;'>" + right_val + "</td>"
                "</tr>"
            )
        field_sections += (
            "<tr><td colspan='4' style='padding:10px 0 4px;font-size:13px;font-weight:600;color:#2c2c2c;border-top:1px solid #e0e0e0;'>" + group['label'] + "</td></tr>"
            + field_rows
        )
    html = f"""
    <div data-fex data-wiz-id="{wiz.id}" data-wiz-model="{wiz._name}" style="font-family:var(--font-family,'Odoo Sans','Roboto',sans-serif);font-size:13px;line-height:1.5;color:#2c2c2c;">
      <h4 style="margin:0 0 6px;font-weight:600;font-size:14px;">Vergelijking bron ↔ doel</h4>
      <p style="margin:0 0 8px;font-size:12px;color:#555;">
        <b style="color:{'#c62828' if allow_empty else '#2e7d32'};">
          {'⚠️ Lege bronwaarden zullen bestaande doelwaarden overschrijven' if allow_empty else '🛟 Lege bronwaarden overschrijven geen bestaande doelwaarden'}
        </b>
      </p>
      <p style="margin:0 0 8px;font-size:11px;color:#888;">Vink uit wat je <em>niet</em> wil overnemen en klik daarna op <strong>Kopieer</strong>.</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #dee2e6;">
            <th style="width:22px;padding:4px 0 8px 0;"></th>
            <th style="padding:4px 6px 8px 0;text-align:left;font-weight:600;color:#666;font-size:12px;">Veld</th>
            <th style="padding:4px 8px 8px;text-align:right;font-weight:700;border-right:1px solid #e0e0e0;">${thBron}</th>
            <th style="padding:4px 8px 8px;text-align:right;font-weight:700;">${thDoel}</th>
          </tr>
        </thead>
        <tbody>
          {field_sections}
        </tbody>
      </table>
    </div>
    """
`;
}

// ── Fix inline checkboxen v2: herstel leads/contacten + update onchange-mechanisme
const _LEADS_SECTION = [
  "    # Lead-preview",
  "    if 'x_relink_leads' in wiz._fields and wiz.x_relink_leads:",
  "        leads = env['crm.lead'].with_context(active_test=False).search([('active', 'in', [True, False]), ('partner_id', 'child_of', source.id)])",
  "        if leads:",
  "            lead_rows = ''",
  "            for lead in leads:",
  "                status = 'Verloren' if not lead.active else 'Actief'",
  "                lead_rows += \"<tr><td style='padding:4px 8px;color:#333;'>\" + (lead.name or 'Naamloos') + \"</td><td>\" + status + \"</td></tr>\"",
  "            html += (",
  "                \"<h6 style='margin-top:18px;font-size:13px;font-weight:600;color:#2c2c2c;'>\"",
  "                + \"Leads/Opportuniteiten die overgedragen worden (\" + str(len(leads)) + \"):\"",
  "                + \"</h6>\"",
  "                + \"<table style='width:100%;border-collapse:collapse;margin-top:4px;'>\"",
  "                + lead_rows",
  "                + \"</table>\"",
  "            )",
].join('\n') + '\n';

const _CONTACTS_SECTION = [
  "    # Contacten",
  "    if wiz.x_studio_relink_contacts:",
  "        contacts = env['res.partner'].with_context(active_test=False).search([('parent_id', '=', source.id), ('active', 'in', [True, False])])",
  "        if contacts:",
  "            c_rows = ''",
  "            for c in contacts:",
  "                c_rows += \"<tr><td style='padding:4px 8px;color:#333;'>\" + (c.name or 'Naamloos') + \"</td></tr>\"",
  "            html += (",
  "                \"<h6 style='margin-top:18px;font-size:13px;font-weight:600;color:#2c2c2c;'>\"",
  "                + \"Contacten die overgedragen worden (\" + str(len(contacts)) + \"):\"",
  "                + \"</h6>\"",
  "                + \"<table style='width:100%;border-collapse:collapse;margin-top:4px;'>\"",
  "                + c_rows",
  "                + \"</table>\"",
  "            )",
].join('\n') + '\n';

export async function handleFixInlineCheckboxes({ env }) {
  const FSTRING_START = '    html = f"""\n';
  const FSTRING_END   = '\n    """\n';

  const ACTIONS = [
    { id: 1042, hasSoidIcon: true,  writeField: 'x_studio_overview_html', hasContacts: true  },
    { id: 1164, hasSoidIcon: false, writeField: 'x_overview_html',        hasContacts: false },
  ];

  const results = [];

  for (const action of ACTIONS) {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[action.id]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';

    if (!code.includes('data-field-row')) {
      results.push({ id: action.id, status: 'geen inline-checkbox code — voer eerst Stap 3 uit' });
      continue;
    }

    // Bepaal wat er nog moet gebeuren (idempotent per stap)
    // needsRenderingFix = true als: geen data-wiz-id, OF geen call_kw (= oude DOM-aanpak nog actief)
    const needsRenderingFix = !code.includes('data-wiz-id') || !code.includes('call_kw');
    // Gebruik '# Lead-preview\n' als sentinel — 'lead_rows' matcht ook 'lead_rows_only'
    const needsLeads    = !code.includes('    # Lead-preview\n');
    const needsContacts = action.hasContacts && !code.includes('x_studio_relink_contacts');

    if (!needsRenderingFix && !needsLeads && !needsContacts) {
      results.push({ id: action.id, status: 'alles aanwezig — overgeslagen' });
      continue;
    }

    // 1. Vervang rendering-blok (excluded_set ... einde f-string) — alleen als data-wiz-id nog ontbreekt
    if (needsRenderingFix) {
      const fstringStartIdx = code.indexOf(FSTRING_START);
      const fstringEndIdx   = fstringStartIdx !== -1 ? code.indexOf(FSTRING_END, fstringStartIdx) : -1;

      if (fstringStartIdx === -1 || fstringEndIdx === -1) {
        results.push({ id: action.id, status: 'f-string anker niet gevonden — sla rendering-fix over' });
        // Probeer nog wel leads/contacten toe te voegen
      } else {
        const startIdx = code.indexOf('    excluded_set = set()\n');
        const endIdx   = fstringEndIdx + FSTRING_END.length;
        code = code.slice(0, startIdx) + makeInlineCheckboxBlock(action.hasSoidIcon) + code.slice(endIdx);
      }
    }

    // 2. Leads-sectie toevoegen vóór de laatste wiz.write
    if (needsLeads) {
      const writeAnchor = "    wiz.write({'" + action.writeField + "': html})";
      const writeIdx = code.lastIndexOf(writeAnchor);
      if (writeIdx !== -1) {
        code = code.slice(0, writeIdx) + _LEADS_SECTION + code.slice(writeIdx);
      }
    }

    // 3. Contacten-sectie vóór # Lead-preview (alleen 1042)
    if (needsContacts) {
      const leadsIdx = code.lastIndexOf('    # Lead-preview\n');
      if (leadsIdx !== -1) {
        code = code.slice(0, leadsIdx) + _CONTACTS_SECTION + code.slice(leadsIdx);
      }
    }

    await executeKw(env, {
      model: 'ir.actions.server',
      method: 'write',
      args: [[action.id], { code }],
    });

    const parts = [];
    if (needsRenderingFix) parts.push('rendering v2');
    if (needsLeads)         parts.push('leads');
    if (needsContacts)      parts.push('contacten');
    results.push({ id: action.id, status: parts.join(' + ') + ' gepatcht ✅' });
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleInlineCheckboxes({ env }) {
  const START_ANCHOR = '    excluded_set = set()\n';
  const END_ANCHOR   = '    html = _cb_panel + html\n';

  const ACTIONS = [
    { id: 1042, hasSoidIcon: true },
    { id: 1164, hasSoidIcon: false },
  ];

  const results = [];

  for (const action of ACTIONS) {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[action.id]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';

    if (code.includes('data-field-row')) {
      results.push({ id: action.id, status: 'reeds inline — overgeslagen' });
      continue;
    }
    if (!code.includes(START_ANCHOR) || !code.includes(END_ANCHOR)) {
      results.push({ id: action.id, status: 'anker niet gevonden — voer eerst de eerdere patches uit' });
      continue;
    }

    const startIdx = code.indexOf(START_ANCHOR);
    const endIdx   = code.indexOf(END_ANCHOR) + END_ANCHOR.length;

    const newBlock = makeInlineCheckboxBlock(action.hasSoidIcon);
    code = code.slice(0, startIdx) + newBlock + code.slice(endIdx);

    await executeKw(env, {
      model: 'ir.actions.server',
      method: 'write',
      args: [[action.id], { code }],
    });
    results.push({ id: action.id, status: 'inline checkboxen gepatcht ✅' });
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Disable HTML-sanitization op wizard HTML-velden ────────────────────────
// Odoo sanitiseert html-type velden bij ORM-writes, ook al staat sanitize="false"
// in de view. Checkboxen en onclick worden daardoor altijd gestript.
// Deze route zet sanitize=False op ir.model.fields voor beide preview-velden.

export async function handleDisableSanitize({ env }) {
  const TARGETS = [
    { model: 'x_estate_copy_wizard',  field: 'x_studio_overview_html' },
    { model: 'x_contact_copy_wizard', field: 'x_overview_html' },
  ];

  const results = [];

  for (const target of TARGETS) {
    try {
      // Zoek het field-record
      const fields = await executeKw(env, {
        model: 'ir.model.fields',
        method: 'search_read',
        args: [[['model', '=', target.model], ['name', '=', target.field]]],
        kwargs: { fields: ['id', 'name', 'sanitize'], limit: 1 },
      });

      if (!fields || fields.length === 0) {
        results.push({ model: target.model, field: target.field, status: 'veld niet gevonden' });
        continue;
      }

      const fieldRecord = fields[0];
      if (fieldRecord.sanitize === false) {
        results.push({ model: target.model, field: target.field, status: 'al uitgeschakeld — overgeslagen' });
        continue;
      }

      await executeKw(env, {
        model: 'ir.model.fields',
        method: 'write',
        args: [[fieldRecord.id], { sanitize: false }],
      });

      results.push({ model: target.model, field: target.field, status: 'sanitize uitgeschakeld ✅' });
    } catch (err) {
      results.push({ model: target.model, field: target.field, status: 'fout: ' + err.message });
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Veld-uitsluitingen: interactieve checkboxen in preview + skip in execute ──

export async function handleAddFieldExclusions({ env }) {
  const results = [];

  // === Preview acties (1042, 1164) ===
  const PREVIEW_ACTIONS = [
    { id: 1042, writeField: 'x_studio_overview_html' },
    { id: 1164, writeField: 'x_overview_html' },
  ];

  // Python-blok dat vóór de finale wiz.write wordt ingevoegd
  // Genereert een checkbox-panel bovenaan de preview-HTML.
  // Gebruikt _dq-truc om \"\" te vermijden in de Python-code.
  const panelBlock = `    # === Interactieve veld-selectie ===
    _dq = '"'
    _ptjs = "(function(){var e=Array.from(document.querySelectorAll('[data-fex] input[data-field]:not(:checked)')).map(function(c){return c.dataset.field;}).join(',');var fi=null;var ws=document.querySelectorAll('.o_field_widget input');for(var i=0;i<ws.length;i++){var p=ws[i].closest('[name]');if(p&&p.getAttribute('name')==='x_excluded_fields'){fi=ws[i];break;}}if(fi){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(fi,e);fi.dispatchEvent(new Event('input',{bubbles:true}));}setTimeout(function(){var pb=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.trim()==='Preview';});if(pb){pb.click();}},150);})()"
    _cb_items = ''
    for _ck in active_groups:
        for _cf, _cl in FIELD_GROUPS[_ck].get('fields', []):
            _chk = '' if _cf in excluded_set else ' checked'
            _cb_items += "<label style='margin:0 8px 4px 0;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;'><input type='checkbox'" + _chk + " data-field='" + _cf + "'> " + _cl + "</label>"
    _cb_panel = (
        "<div data-fex style='margin-bottom:14px;padding:10px 14px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;'>"
        + "<div style='font-size:11px;font-weight:600;color:#6c757d;letter-spacing:.5px;margin-bottom:8px;'>Velden selecteren</div>"
        + _cb_items
        + "<div style='margin-top:10px;'><button type='button' onclick=" + _dq + _ptjs + _dq + " style='padding:4px 12px;font-size:12px;background:#0d6efd;color:#fff;border:none;border-radius:4px;cursor:pointer;'>Pas toe &amp; herlaad</button></div>"
        + "</div>"
    )
    html = _cb_panel + html
`;

  const exclSetBlock = "    excluded_set = set()\n    if 'x_excluded_fields' in wiz._fields and wiz.x_excluded_fields:\n        excluded_set = set(f.strip() for f in wiz.x_excluded_fields.split(',') if f.strip())\n";
  const fieldSkipBlock = '            if field in excluded_set:\n                continue\n';
  const fieldLoopAnchor = '            left_val = get_val(source, field)\n';

  for (const action of PREVIEW_ACTIONS) {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[action.id]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';

    if (code.includes('data-fex')) {
      results.push({ id: action.id, status: 'reeds gepatcht — overgeslagen' });
      continue;
    }

    // Patch 1: excluded_set vóór left_sections
    const sectionAnchor = action.id === 1164
      ? "    left_sections = ''\n"
      : '    left_sections = ""\n';

    if (!code.includes(sectionAnchor)) {
      results.push({ id: action.id, status: 'anker left_sections niet gevonden' });
      continue;
    }
    code = code.replace(sectionAnchor, exclSetBlock + sectionAnchor);

    // Patch 2: sla uitgesloten velden over in de field loop
    if (!code.includes(fieldLoopAnchor)) {
      results.push({ id: action.id, status: 'anker left_val niet gevonden' });
      continue;
    }
    code = code.replace(fieldLoopAnchor, fieldSkipBlock + fieldLoopAnchor);

    // Patch 3: voeg checkbox-panel toe vóór de finale wiz.write
    const writeStr = "    wiz.write({'" + action.writeField + "': html})";
    const writeIdx = code.lastIndexOf(writeStr);
    if (writeIdx === -1) {
      results.push({ id: action.id, status: 'write-anker niet gevonden' });
      continue;
    }
    code = code.slice(0, writeIdx) + panelBlock + code.slice(writeIdx);

    await executeKw(env, {
      model: 'ir.actions.server',
      method: 'write',
      args: [[action.id], { code }],
    });
    results.push({ id: action.id, status: 'checkbox-panel gepatcht ✅' });
  }

  // === Execute acties (1041, 1163) ===
  const exclExecBlock = "    excluded_set_exec = set()\n    if 'x_excluded_fields' in wiz._fields and wiz.x_excluded_fields:\n        excluded_set_exec = set(f.strip() for f in wiz.x_excluded_fields.split(',') if f.strip())\n";
  const execSkipBlock = '            if f in excluded_set_exec:\n                continue\n';

  // 1041
  {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[1041]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';
    if (code.includes('excluded_set_exec')) {
      results.push({ id: 1041, status: 'reeds gepatcht — overgeslagen' });
    } else {
      const anchor1041 = '    # --- Kopieer de velden uit de actieve groepen ---\n';
      const skipAnchor1041 = '            if should_copy_field(source, target, f, allow_empty):\n                vals[f] = source[f]\n';
      if (!code.includes(anchor1041) || !code.includes(skipAnchor1041)) {
        results.push({ id: 1041, status: 'anker niet gevonden' });
      } else {
        code = code.replace(anchor1041, exclExecBlock + anchor1041);
        code = code.replace(skipAnchor1041, execSkipBlock + skipAnchor1041);
        await executeKw(env, { model: 'ir.actions.server', method: 'write', args: [[1041], { code }] });
        results.push({ id: 1041, status: 'veld-uitsluiting gepatcht ✅' });
      }
    }
  }

  // 1163
  {
    const readResult = await executeKw(env, {
      model: 'ir.actions.server',
      method: 'read',
      args: [[1163]],
      kwargs: { fields: ['id', 'code'] },
    });
    let code = readResult?.[0]?.code || '';
    if (code.includes('excluded_set_exec')) {
      results.push({ id: 1163, status: 'reeds gepatcht — overgeslagen' });
    } else {
      // In 1163 staat de copy loop zonder commentaar, direct after active_groups+relink check
      const anchor1163 = "    for key in active_groups:\n        for f, _ in FIELD_GROUPS[key]['fields']:\n            if should_copy_field(source, target, f, allow_empty):\n                vals[f] = source[f]\n                copied_fields.append(f)\n";
      const skipAnchor1163 = "            if should_copy_field(source, target, f, allow_empty):\n                vals[f] = source[f]\n                copied_fields.append(f)\n";
      if (!code.includes(anchor1163)) {
        results.push({ id: 1163, status: 'anker niet gevonden' });
      } else {
        code = code.replace(anchor1163, exclExecBlock + anchor1163);
        code = code.replace(skipAnchor1163, execSkipBlock + skipAnchor1163);
        await executeKw(env, { model: 'ir.actions.server', method: 'write', args: [[1163], { code }] });
        results.push({ id: 1163, status: 'veld-uitsluiting gepatcht ✅' });
      }
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
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
