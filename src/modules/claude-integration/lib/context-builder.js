/**
 * Claude Context Builder — v2 (template-driven)
 *
 * Data shape is fully determined by a `claude_dataset_templates` row.
 * model_config is a JSONB array of model entries:
 *   {
 *     key:               string,   // output key, e.g. "primary" or "leads"
 *     model:             string,   // Odoo model, e.g. "x_sales_action_sheet"
 *     is_primary:        boolean,  // if true: receives timeframe domain filter
 *     via_primary_field: string?,  // if set: filter [via_primary_field, 'in', primaryIds]
 *     fields:            [{ name, alias, instruction?, include_in_output? }]
 *     domain:            OdooDomain[],
 *     order:             string,
 *     limit:             number
 *   }
 *
 * NOT responsible for: auth, token validation, audit logging, UI logic.
 *
 * @module modules/claude-integration/lib/context-builder
 */

import { searchRead } from '../../../lib/odoo.js';
import { getTemplate, getDefaultTemplate } from './dataset-service.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Build a structured context payload for Claude.
 *
 * @param {Object} env
 * @param {Object} options
 * @param {string} [options.templateId]  UUID of claude_dataset_templates row.
 *                                       Falls back to the default template when omitted.
 * @param {string} [options.timeframe]   'week'|'month'|'quarter'|'year'
 * @param {number} [options.limit=50]    Max records for the primary model
 * @returns {Promise<Object>}
 */
export async function buildContext(env, {
  templateId = null,
  timeframe  = null,
  limit      = 50
}) {
  // ── Load template ─────────────────────────────────────────────────────────
  const template = templateId
    ? await getTemplate(env, templateId)
    : await getDefaultTemplate(env);

  if (!template) {
    throw new Error('No dataset template found. An admin must create at least one active template.');
  }

  const modelConfigs   = Array.isArray(template.model_config) ? template.model_config : [];
  const effectiveLimit = Math.min(Number(limit) || 50, 200);
  const timeframeStart = timeframe ? getTimeframeStart(timeframe) : null;

  // ── Fetch per model ───────────────────────────────────────────────────────
  const result     = {};
  const schemaMeta = {};
  let   primaryIds = null; // collected ID list from the primary model

  for (const config of modelConfigs) {
    const {
      key,
      model,
      is_primary         = false,
      via_primary_field  = null,
      fields: fieldDefs  = [],
      domain: baseDomain = [],
      order              = 'id desc',
      limit:  modelLimit
    } = config;

    if (!key || !model) continue;

    // Build Odoo domain
    const domain = [...baseDomain];
    if (is_primary && timeframeStart) {
      domain.push(['create_date', '>=', timeframeStart]);
    }
    if (!is_primary && via_primary_field && Array.isArray(primaryIds)) {
      domain.push([via_primary_field, 'in', primaryIds]);
    }

    // Only fetch fields marked include_in_output (default: true)
    const activeFieldDefs = fieldDefs.filter(f => f.include_in_output !== false);
    const fieldNames      = activeFieldDefs.map(f => f.name).filter(Boolean);
    if (!fieldNames.includes('id')) fieldNames.unshift('id');

    const fetchLimit = is_primary ? effectiveLimit : (modelLimit ?? 100);

    let records = [];
    try {
      records = await searchRead(env, { model, domain, fields: fieldNames, limit: fetchLimit, order });
    } catch (err) {
      console.warn(`\u26a0\ufe0f Claude context: ${model} (${key}) fetch failed:`, err.message);
    }

    result[key] = records;

    // Capture primary IDs for subsequent relation queries
    if (is_primary) {
      primaryIds = records.map(r => r.id);
    }

    // Schema metadata: fieldName -> { alias, instruction? }
    const fieldSchema = {};
    for (const fd of activeFieldDefs) {
      if (!fd.name) continue;
      fieldSchema[fd.name] = {
        alias: fd.alias ?? fd.name,
        ...(fd.instruction ? { instruction: fd.instruction } : {})
      };
    }
    schemaMeta[key] = fieldSchema;
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const recordCounts = Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, v.length])
  );

  return {
    meta: {
      generated_at:  new Date().toISOString(),
      template_id:   template.id,
      template_name: template.name,
      timeframe:     timeframe ?? 'all',
      record_counts: recordCounts
    },
    ...result,
    schema: schemaMeta
  };
}
