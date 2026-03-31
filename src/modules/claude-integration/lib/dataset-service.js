/**
 * Dataset Template Service
 *
 * CRUD for claude_dataset_templates.
 * Follows the same patterns as integration-service.js:
 *   - Uses getSupabaseClient(env) for all DB access
 *   - Never exposes internal fields to callers
 *   - Uses executeKw from lib/odoo.js for Odoo field introspection
 *
 * @module modules/claude-integration/lib/dataset-service
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { executeKw } from '../../../lib/odoo.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function sanitize(row) {
  if (!row) return null;
  return row;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * List all active templates (for use in the user-facing integration creation UI).
 * @param {Object} env
 * @returns {Promise<Object[]>}
 */
export async function listActiveTemplates(env) {
  const db = getSupabaseClient(env);
  const { data, error } = await db
    .from('claude_dataset_templates')
    .select('id, name, description, is_default, model_config, field_categories, created_at, updated_at')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list templates: ${error.message}`);
  return data ?? [];
}

/**
 * List all templates including inactive (for admin UI).
 * @param {Object} env
 * @returns {Promise<Object[]>}
 */
export async function listAllTemplates(env) {
  const db = getSupabaseClient(env);
  const { data, error } = await db
    .from('claude_dataset_templates')
    .select('id, name, description, is_active, is_default, model_config, field_categories, created_by, created_at, updated_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list all templates: ${error.message}`);
  return data ?? [];
}

/**
 * Fetch a single template by ID.
 * @param {Object} env
 * @param {string} templateId
 * @returns {Promise<Object|null>}
 */
export async function getTemplate(env, templateId) {
  const db = getSupabaseClient(env);
  const { data, error } = await db
    .from('claude_dataset_templates')
    .select('id, name, description, is_active, is_default, model_config, field_categories, created_by, created_at, updated_at')
    .eq('id', templateId)
    .single();

  if (error) return null;
  return sanitize(data);
}

/**
 * Fetch the default template (fallback when an integration has no template_id).
 * @param {Object} env
 * @returns {Promise<Object|null>}
 */
export async function getDefaultTemplate(env) {
  const db = getSupabaseClient(env);
  const { data, error } = await db
    .from('claude_dataset_templates')
    .select('id, name, description, is_active, is_default, model_config, field_categories, created_at, updated_at')
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (error) return null;
  return sanitize(data);
}

/**
 * Create a new template (admin only — caller must enforce admin check).
 * @param {Object} env
 * @param {string} userId  UUID of the creating admin
 * @param {{ name: string, description?: string, model_config: Object[] }} fields
 * @returns {Promise<Object>}
 */
export async function createTemplate(env, userId, { name, description, model_config, field_categories }) {
  const db = getSupabaseClient(env);
  const { data, error } = await db
    .from('claude_dataset_templates')
    .insert({
      name:             name.trim(),
      description:      description?.trim() ?? null,
      model_config:     model_config ?? [],
      field_categories: Array.isArray(field_categories) ? field_categories : [],
      created_by:       userId,
      is_active:        true,
      is_default:       false
    })
    .select('id, name, description, is_active, is_default, model_config, field_categories, created_at, updated_at')
    .single();

  if (error) throw new Error(`Failed to create template: ${error.message}`);
  return data;
}

/**
 * Update a template's fields (admin only).
 * Only name, description, model_config, and is_active may be updated via this function.
 * Use setDefaultTemplate() to change the default.
 *
 * @param {Object} env
 * @param {string} templateId
 * @param {{ name?: string, description?: string, model_config?: Object[], is_active?: boolean }} updates
 * @returns {Promise<Object>}
 */
export async function updateTemplate(env, templateId, updates) {
  const db = getSupabaseClient(env);
  const allowed = {};
  if (updates.name             !== undefined) allowed.name             = updates.name.trim();
  if (updates.description      !== undefined) allowed.description      = updates.description?.trim() ?? null;
  if (updates.model_config     !== undefined) allowed.model_config     = updates.model_config;
  if (updates.field_categories !== undefined) allowed.field_categories = Array.isArray(updates.field_categories) ? updates.field_categories : [];
  if (updates.is_active        !== undefined) allowed.is_active        = updates.is_active;

  const { data, error } = await db
    .from('claude_dataset_templates')
    .update(allowed)
    .eq('id', templateId)
    .select('id, name, description, is_active, is_default, model_config, field_categories, created_at, updated_at')
    .single();

  if (error || !data) throw new Error('Template not found or update failed');
  return data;
}

/**
 * Set a template as the default (clears existing default first).
 * Uses a transaction-safe pattern: clear then set.
 *
 * @param {Object} env
 * @param {string} templateId
 * @returns {Promise<Object>}
 */
export async function setDefaultTemplate(env, templateId) {
  const db = getSupabaseClient(env);

  // Clear existing default
  await db
    .from('claude_dataset_templates')
    .update({ is_default: false })
    .eq('is_default', true);

  // Set new default
  const { data, error } = await db
    .from('claude_dataset_templates')
    .update({ is_default: true, is_active: true })
    .eq('id', templateId)
    .select('id, name, description, is_active, is_default, model_config, field_categories, created_at, updated_at')
    .single();

  if (error || !data) throw new Error('Template not found');
  return data;
}

/**
 * Soft-delete a template (sets is_active = false).
 * Admin only — caller must enforce admin check.
 *
 * @param {Object} env
 * @param {string} templateId
 * @returns {Promise<void>}
 */
export async function deactivateTemplate(env, templateId) {
  const db = getSupabaseClient(env);
  const { data, error } = await db
    .from('claude_dataset_templates')
    .update({ is_active: false, is_default: false })
    .eq('id', templateId)
    .select('id')
    .single();

  if (error || !data) throw new Error('Template not found or already inactive');
}

/**
 * Fetch field metadata for an Odoo model.
 * Uses fields_get to retrieve name, string, type, relation for each field.
 *
 * @param {Object} env
 * @param {string} odooModel  e.g. 'crm.lead' or 'x_sales_action_sheet'
 * @returns {Promise<Object>}  { fieldName: { string, type, relation } }
 */
export async function getOdooModelFields(env, odooModel) {
  const result = await executeKw(env, {
    model:  odooModel,
    method: 'fields_get',
    args:   [],
    kwargs: { attributes: ['string', 'type', 'relation'] }
  });
  return result ?? {};
}
