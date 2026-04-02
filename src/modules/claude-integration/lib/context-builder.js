/**
 * Claude Context Builder — v2 (template-driven)
 *
 * Data shape is fully determined by a `claude_dataset_templates` row.
 * model_config is a JSONB array of model entries with two supported shapes:
 *
 * Shape A — legacy primary/related (depth 1):
 *   {
 *     key:               string,    // e.g. "primary"
 *     odoo_model:        string,
 *     is_primary:        boolean,   // true = receives timeframe filter
 *     via_primary_field: string?,   // field on primary record pointing to this model (depth-1 compat)
 *     fields:            [{ odoo_name, alias, instruction?, enabled }]
 *   }
 *
 * Shape B — new multi-depth (wizard generates this):
 *   {
 *     key:              string,    // unique, e.g. "primary__stage_id"
 *     odoo_model:       string,
 *     label:            string?,
 *     parent_key:       string?,   // null for primary; key of parent model otherwise
 *     via_parent_field: string?,   // field on parent record pointing to this model
 *     depth:            number,    // 0 = primary, 1 = direct child, 2 = grandchild, …
 *     fields:           [{ odoo_name, alias, instruction?, enabled, type?, relation?, category?, child_key? }]
 *   }
 *
 * Both shapes are handled in a unified pass sorted by depth.
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

/**
 * Normalise a model_config entry so downstream code can use a single interface.
 * Converts Shape A (is_primary / via_primary_field) to Shape B (parent_key / via_parent_field / depth).
 */
function normalise(mc, allConfigs) {
  if (mc.parent_key !== undefined || mc.depth !== undefined) return mc; // already Shape B

  if (mc.is_primary) {
    return { ...mc, parent_key: null, via_parent_field: null, depth: 0 };
  }

  // Shape A non-primary: parent is the primary model
  const primary = allConfigs.find(m => m.is_primary || m.key === 'primary');
  return {
    ...mc,
    parent_key:       primary?.key ?? null,
    via_parent_field: mc.via_primary_field ?? null,
    depth:            1,
  };
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
 * @param {number|null} [options.limit]   Max records for the primary model (null = use template default or no limit)
 * @returns {Promise<Object>}
 */
export async function buildContext(env, { templateId = null, timeframe = null, limit = null }) {
  // 1. Load template
  const template = templateId
    ? await getTemplate(env, templateId)
    : await getDefaultTemplate(env);

  if (!template) {
    throw new Error('Geen actieve dataset template geconfigureerd. Vraag een admin.');
  }

  const rawConfigs = Array.isArray(template.model_config) ? template.model_config : [];

  // 2. Normalise + sort by depth so parents are always fetched before children
  const configs = rawConfigs
    .map(mc => normalise(mc, rawConfigs))
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

  if (!configs.length || !configs.find(m => m.depth === 0)) {
    throw new Error('Dataset template heeft geen primair model.');
  }

  const result       = {};
  const recordCounts = {};

  for (const mc of configs) {
    const enabledFields = (mc.fields ?? [])
      .filter(f => f.enabled)
      .map(f => f.odoo_name)
      .filter(Boolean);
    if (!enabledFields.includes('id')) enabledFields.unshift('id');

    if (mc.depth === 0) {
      // ── Primary model ───────────────────────────────────────────────────
      // Request param overrides template default; template default overrides "no filter"
      const effectiveTimeframe = timeframe ?? mc.timeframe ?? null;
      const rawLimit = limit !== null ? limit : (mc.limit ?? null);
      // false = omit limit entirely → Odoo returns all records
      const effectiveLimit = rawLimit !== null && Number(rawLimit) > 0 ? Number(rawLimit) : false;

      const domain = [];
      if (effectiveTimeframe) {
        const ts = getTimeframeStart(effectiveTimeframe);
        if (ts) domain.push(['create_date', '>=', ts]);
      }

      const records = await searchRead(env, {
        model:  mc.odoo_model,
        domain,
        fields: enabledFields,
        limit:  effectiveLimit,
        order:  'id desc'
      });

      result[mc.key]       = records;
      recordCounts[mc.key] = records.length;

    } else {
      // ── Child model (depth >= 1) ────────────────────────────────────────
      const parentRecords = result[mc.parent_key] ?? [];
      if (!parentRecords.length) {
        result[mc.key]       = [];
        recordCounts[mc.key] = 0;
        continue;
      }

      const ids = parentRecords
        .map(r => {
          const v = r[mc.via_parent_field];
          // Odoo many2one returns [id, name] or just a number
          return Array.isArray(v) ? v[0] : v;
        })
        .filter(id => id && id !== false);

      if (!ids.length) {
        result[mc.key]       = [];
        recordCounts[mc.key] = 0;
        continue;
      }

      const records = await searchRead(env, {
        model:  mc.odoo_model,
        domain: [['id', 'in', [...new Set(ids)]]],
        fields: enabledFields,
        limit:  false  // fetch all — primary limit already applied
      });

      result[mc.key]       = records;
      recordCounts[mc.key] = records.length;
    }
  }

  // 3. Build schema object
  const schema = {};
  for (const mc of configs) {
    schema[mc.key] = {};
    for (const f of (mc.fields ?? []).filter(f => f.enabled)) {
      schema[mc.key][f.odoo_name] = {
        alias: f.alias || f.odoo_name,
        ...(f.instruction ? { instruction: f.instruction } : {})
      };
    }
  }

  // 4. Assemble
  return {
    meta: {
      generated_at:  new Date().toISOString(),
      template_name: template.name,
      timeframe:     timeframe ?? 'all',
      record_counts: recordCounts
    },
    ...result,
    schema
  };
}
