/**
 * CX Automations — Vlag-cron
 *
 * Elke 15 min: verwerkt een batch van BATCH_SIZE actiebladen (gepagineerd via cursor
 * opgeslagen in cx_settings). Op die manier blijft het aantal subrequests ruim
 * onder de Cloudflare free-tier limiet van 50 per invocatie.
 *
 * Budget per run (worst case):
 *   cx_powerboard cron  ~7 subrequests
 *   cx_automations fix  ~7 subrequests (settings, thresholds, stages, actiebladen, partners, cursor-write, log)
 *   writes              max BATCH_SIZE
 *   totaal              ~14 + BATCH_SIZE ≤ 44  ✓
 *
 * Volledige cyclus (alle actiebladen bijgewerkt): ceil(totaal / BATCH_SIZE) × 15 min.
 */

import { getSupabaseClient } from '../../lib/database.js';
import { searchRead, write } from '../../lib/odoo.js';

// Max actiebladen per run — houd totaal subrequests ruim onder 50
const BATCH_SIZE = 30;

// Volgorde voor escalatiecheck (lager = minder urgent)
const FLAG_ORDER = { none: 0, attention: 1, urgent: 2, critical: 3 };

// Patroon om "since"-datum te herkennen in technical_block-berichten
const TECH_BLOCK_SINCE_PATTERN = /geen gebouw gekoppeld \(sinds (\d{2})\/(\d{2})\/(\d{4})\)/;

// CS-stage sequence-grenzen (Discovery = 10, Done = 16 worden overgeslagen)
const CS_SEQUENCE_MIN = 10;
const CS_SEQUENCE_MAX = 16;

/**
 * Bereken dagen sinds een datumstring (YYYY-MM-DD of ISO).
 * Geeft null terug als datum ontbreekt.
 */
function daysSince(dateStr) {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Bouw het automatische vlag-bericht op.
 * Vervangt een eerder auto-prefix (patroon: "[DD/MM/YYYY] Auto: ...") zodat
 * het bericht up-to-date is zonder te stapelen.
 * Handmatige tekst na het scheidingsteken " | " blijft bewaard.
 */
function buildFlagMessage(days, existingMsg) {
  const dateStr = new Date().toLocaleDateString('nl-BE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const daysLabel = days != null ? `${days} dagen inactief` : 'geen activiteit geregistreerd';
  const autoPrefix = `[${dateStr}] Auto: ${daysLabel}`;

  // Strip vorige auto-prefix (patroon: "[DD/MM/YYYY] Auto: ..." tot " | " of einde)
  const AUTO_PATTERN = /^\[\d{2}\/\d{2}\/\d{4}\] Auto:[^\|]*(\s*\|\s*)?/;
  const manual = typeof existingMsg === 'string'
    ? existingMsg.replace(AUTO_PATTERN, '').trim()
    : '';

  return manual ? `${autoPrefix} | ${manual}` : autoPrefix;
}

export async function runFlagCron(env) {
  const startedAt = new Date().toISOString();
  const log = (msg) => console.log(`[cx-automations][cron] ${msg}`);

  log('Vlag-cron gestart');

  let actiebladen_checked = 0;
  let flags_updated = 0;
  let supabase;

  try {
    supabase = getSupabaseClient(env);

    // 1a. Instellingen + cursor laden (één Supabase-call)
    const { data: settings } = await supabase.from('cx_settings').select('*');
    const settingsMap = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;
    const techBlockOrangeDays = parseInt(settingsMap['tech_block_orange_days'] || '3');
    const techBlockRedDays    = parseInt(settingsMap['tech_block_red_days']    || '5');
    const cursor              = parseInt(settingsMap['flag_cron_cursor']       || '0');

    // 1b. Drempelwaarden laden
    const { data: thresholds, error: threshErr } = await supabase
      .from('flag_thresholds')
      .select('*');

    if (threshErr) throw new Error(`Supabase flag_thresholds: ${threshErr.message}`);
    if (!thresholds?.length) {
      log('Geen drempelwaarden gevonden — cron gestopt');
      return;
    }

    const thresholdByStage = {};
    for (const t of thresholds) {
      thresholdByStage[t.stage_id] = t;
    }

    // 2. CS-stage IDs ophalen uit Odoo
    const csStages = await searchRead(env, {
      model: 'x_support_stage',
      domain: [
        ['x_studio_sequence', '>', CS_SEQUENCE_MIN],
        ['x_studio_sequence', '<', CS_SEQUENCE_MAX],
      ],
      fields: ['id'],
    });
    const csStageIds = csStages.map(s => s.id);

    if (!csStageIds.length) {
      log('Geen CS-stages gevonden in Odoo — cron gestopt');
      return;
    }
    log(`CS-stages: ${csStageIds.join(', ')}`);

    // 3. Gepagineerde batch actiebladen ophalen (cursor = offset, stabiel gesorteerd op id)
    const actiebladen = await searchRead(env, {
      model: 'x_sales_action_sheet',
      domain: [['x_studio_stage_id', 'in', csStageIds]],
      fields: ['id', 'x_studio_for_company_id', 'x_studio_stage_id', 'x_flag_level', 'x_flag_reason', 'x_flag_custom_message'],
      limit: BATCH_SIZE,
      offset: cursor,
      order: 'id asc',
    });

    actiebladen_checked = actiebladen.length;
    const isLastPage  = actiebladen.length < BATCH_SIZE;
    const nextCursor  = isLastPage ? 0 : cursor + BATCH_SIZE;
    log(`Batch: offset=${cursor}, ${actiebladen_checked} actiebladen${isLastPage ? ' (laatste pagina → cursor reset)' : ` → volgende offset: ${nextCursor}`}`);

    // 4. Gebouw-IDs voor deze batch dedupliceren en ophalen
    const partnerIds = [...new Set(
      actiebladen
        .filter(b => b.x_studio_for_company_id)
        .map(b => b.x_studio_for_company_id[0])
    )];

    const activityByPartnerId = {};
    if (partnerIds.length > 0) {
      const partners = await searchRead(env, {
        model: 'res.partner',
        domain: [['id', 'in', partnerIds]],
        fields: ['id', 'x_studio_last_activity'],
      });
      for (const p of partners) {
        activityByPartnerId[p.id] = p.x_studio_last_activity || null;
      }
    }

    // 5. Per actieblad vlag berekenen en bijwerken
    for (const blad of actiebladen) {
      const stageId = Array.isArray(blad.x_studio_stage_id)
        ? blad.x_studio_stage_id[0]
        : blad.x_studio_stage_id;

      const thresh = thresholdByStage[stageId];
      if (!thresh) continue;

      // ── Technical block: geen gebouw gekoppeld ──
      if (!blad.x_studio_for_company_id) {
        const existingReason = blad.x_flag_reason ?? '';
        const existingMsg    = blad.x_flag_custom_message || '';

        const sinceMatch = existingReason === 'technical_block'
          ? existingMsg.match(TECH_BLOCK_SINCE_PATTERN)
          : null;

        let sinceDate;
        if (sinceMatch) {
          sinceDate = new Date(
            parseInt(sinceMatch[3]),
            parseInt(sinceMatch[2]) - 1,
            parseInt(sinceMatch[1])
          );
        } else {
          sinceDate = new Date();
        }

        const daysSinceBlock = Math.floor((Date.now() - sinceDate.getTime()) / 86_400_000);
        const sinceDateStr = sinceDate.toLocaleDateString('nl-BE', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        const blockMsg = `geen gebouw gekoppeld (sinds ${sinceDateStr})`;

        let targetFlag = 'attention';
        if (techBlockRedDays > 0 && daysSinceBlock >= techBlockRedDays)         targetFlag = 'critical';
        else if (techBlockOrangeDays > 0 && daysSinceBlock >= techBlockOrangeDays) targetFlag = 'urgent';

        const currentFlag  = blad.x_flag_level ?? 'none';
        const currentLevel = FLAG_ORDER[currentFlag] ?? 0;
        const targetLevel  = FLAG_ORDER[targetFlag]  ?? 0;

        if (existingReason !== 'technical_block' || targetLevel > currentLevel) {
          await write(env, {
            model: 'x_sales_action_sheet',
            ids: [blad.id],
            values: {
              x_flag_level:          targetFlag,
              x_flag_reason:         'technical_block',
              x_flag_custom_message: blockMsg,
            },
          });
          flags_updated++;
          log(`Actieblad ${blad.id}: technical_block → ${targetFlag} (${daysSinceBlock}d sinds ${sinceDateStr})`);
        }

        continue;
      }

      // ── Normale inactiviteitslogica ──
      const partnerId    = blad.x_studio_for_company_id[0];
      const lastActivity = activityByPartnerId[partnerId] ?? null;
      const days         = daysSince(lastActivity);

      let newFlag = 'none';
      if (thresh.red_days > 0 && days != null && days >= thresh.red_days)         newFlag = 'critical';
      else if (thresh.orange_days > 0 && days != null && days >= thresh.orange_days) newFlag = 'urgent';
      else if (thresh.yellow_days > 0 && days != null && days >= thresh.yellow_days) newFlag = 'attention';

      const currentFlag  = blad.x_flag_level ?? 'none';
      const currentLevel = FLAG_ORDER[currentFlag] ?? 0;
      const newLevel     = FLAG_ORDER[newFlag]     ?? 0;
      const effectiveFlag = newLevel > currentLevel ? newFlag : currentFlag;

      // Schrijf als: escalatie of bericht nog niet actueel (andere datum/dagenteller)
      if (effectiveFlag !== 'none') {
        const updatedMsg = buildFlagMessage(days, blad.x_flag_custom_message);
        const isEscalating = newLevel > currentLevel;
        const msgChanged   = updatedMsg !== (blad.x_flag_custom_message || '');

        if (!isEscalating && !msgChanged) continue;

        const values = { x_flag_custom_message: updatedMsg };
        if (isEscalating) {
          values.x_flag_level  = newFlag;
          values.x_flag_reason = thresh.flag_reason || 'no_activity';
          flags_updated++;
          log(`Actieblad ${blad.id}: ${currentFlag} → ${newFlag} (${days ?? '?'}d, reden: ${thresh.flag_reason || 'no_activity'})`);
        }

        await write(env, {
          model: 'x_sales_action_sheet',
          ids: [blad.id],
          values,
        });
      }
    }

    // 6. Cursor opslaan voor volgende run
    await supabase.from('cx_settings').upsert(
      [{ key: 'flag_cron_cursor', value: String(nextCursor), updated_at: new Date().toISOString(), updated_by: 'cron' }],
      { onConflict: 'key' }
    );

    log(`Klaar — ${flags_updated} vlaggen bijgewerkt, cursor → ${nextCursor}`);

  } catch (err) {
    log(`ERROR: ${err.message}`);
    if (supabase) {
      await supabase.from('flag_run_log').insert({
        ran_at: startedAt,
        actiebladen_checked,
        flags_updated,
        error: err.message,
      });
    }
    throw err;
  }

  // 7. Succesvolle run loggen
  await supabase.from('flag_run_log').insert({
    ran_at: startedAt,
    actiebladen_checked,
    flags_updated,
    error: null,
  });
}
