/**
 * Claude Context Builder — v2 (template-driven)
 *
 * Data shape is fully determined by a `claude_dataset_templates` row.
 * model_config is a JSONB array of model entries:
 *   {
 *     key:               string,    // output key, e.g. "primary"
 *     odoo_model:        string,    // Odoo model, e.g. "x_sales_action_sheet"
 *     is_primary:        boolean,   // primary model receives timeframe domain filter
 *     via_primary_field: string?,   // field on primary record (many2one) pointing to this model
 *     fields:            [{ odoo_name, alias, instruction?, enabled }]
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
export async function buildContext(env, { templateId = null, timeframe = null, limit = 50 }) {
  // 1. Load template
  const template = templateId
    ? await getTemplate(env, templateId)
    : await getDefaultTemplate(env);

  if (!template) {
    throw new Error('Geen actieve dataset template geconfigureerd. Vraag een admin.');
  }

  // 2. Find primary model config
  const primary = template.model_config.find(m => m.key === 'primary');
  if (!primary) {
    throw new Error('Dataset template heeft geen primair model.');
  }

  // 3. Enabled fields for primary
  const primaryFields = primary.fields
    .filter(f => f.enabled)
    .map(f => f.odoo_name);
  if (!primaryFields.includes('id')) primaryFields.unshift('id');

  // 4. Build domain for primary
  // x_sales_action_sheet has no 'active' field — no ['active','=',true] filter
  const domain = [];
  if (timeframe) {
    const ts = getTimeframeStart(timeframe);
    if (ts) domain.push(['create_date', '>=', ts]);
  }

  // 5. Fetch primary records
  const primaryRecords = await searchRead(env, {
    model:  primary.odoo_model,
    domain,
    fields: primaryFields,
    limit:  Math.min(Number(limit) || 50, 50),
    order:  'id desc'
  });

  // 6. Fetch related models
  const result       = { [primary.key]: primaryRecords };
  const recordCounts = { [primary.key]: primaryRecords.length };

  for (const rel of template.model_config.filter(m => m.key !== 'primary')) {
    // Extract IDs from primary records via the many2one field
    const relIds = primaryRecords
      .map(r => {
        const val = r[rel.via_primary_field];
        // Odoo many2one returns [id, name] or just an id
        return Array.isArray(val) ? val[0] : val;
      })
      .filter(id => id && id !== false);

    if (!relIds.length) continue;

    const relFields = rel.fields.filter(f => f.enabled).map(f => f.odoo_name);
    if (!relFields.includes('id')) relFields.unshift('id');

    const relRecords = await searchRead(env, {
      model:  rel.odoo_model,
      domain: [['id', 'in', [...new Set(relIds)]]],
      fields: relFields,
      limit:  false  // fetch all — primary limit already applied
    });

    result[rel.key]       = relRecords;
    recordCounts[rel.key] = relRecords.length;
  }

  // 7. Build schema object
  const schema = {};
  for (const mc of template.model_config) {
    schema[mc.key] = {};
    for (const f of mc.fields.filter(f => f.enabled)) {
      schema[mc.key][f.odoo_name] = {
        alias: f.alias || f.odoo_name,
        ...(f.instruction ? { instruction: f.instruction } : {})
      };
    }
  }

  // 8. Assemble
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
