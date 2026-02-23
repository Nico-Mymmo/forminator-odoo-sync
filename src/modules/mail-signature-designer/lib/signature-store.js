/**
 * Mail Signature Designer - Signature Store
 *
 * Data access layer for:
 *   - signature_config           (legacy global singleton – kept for BC)
 *   - marketing_signature_settings (marketing layer – new)
 *   - user_signature_settings      (per-user override layer – new)
 *   - signature_push_log           (audit log)
 *
 * Layer priority (highest → lowest):
 *   user_signature_settings  >  marketing_signature_settings  >  Odoo  >  Google Directory
 */

import { getSupabaseAdminClient } from './supabaseClient.js';

/**
 * Fixed UUID for the legacy global singleton config row.
 * @deprecated Use MARKETING_SETTINGS_ID + getMarketingSettings() for new code.
 */
export const GLOBAL_SIGNATURE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Fixed UUID for the marketing singleton settings row.
 * Seeded from signature_config in the migration.
 */
export const MARKETING_SETTINGS_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Get the current global signature config.
 * Returns default empty config if no row exists yet.
 *
 * @param {Object} env
 * @returns {Object} config JSONB object
 */
export async function getConfig(env) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('signature_config')
    .select('config, updated_at, updated_by')
    .eq('id', GLOBAL_SIGNATURE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`[signature-store] getConfig failed: ${error.message}`);
  }

  return data ?? { config: {}, updated_at: null, updated_by: null };
}

/**
 * Upsert the global signature config.
 * Always writes to the singleton row via fixed ID.
 *
 * @param {Object} env
 * @param {Object} config - JSONB config object
 * @param {string} updatedBy - UUID of the acting user
 * @returns {Object} updated row
 */
export async function upsertConfig(env, config, updatedBy) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('signature_config')
    .upsert({
      id: GLOBAL_SIGNATURE_ID,
      config,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(`[signature-store] upsertConfig failed: ${error.message}`);
  }

  return data;
}

/**
 * Append a push log entry.
 *
 * @param {Object} env
 * @param {Object} entry - Log fields
 */
export async function logPush(env, entry) {
  const supabase = getSupabaseAdminClient(env);

  const { error } = await supabase
    .from('signature_push_log')
    .insert({
      actor_email: entry.actor_email,
      target_user_email: entry.target_user_email,
      sendas_email: entry.sendas_email,
      success: entry.success,
      error_message: entry.error_message ?? null,
      html_hash: entry.html_hash ?? null,
      push_scope: entry.push_scope ?? 'single',
      metadata: entry.metadata ?? {}
    });

  if (error) {
    // Log errors are non-fatal — we log but do not throw
    console.error(`[signature-store] logPush failed: ${error.message}`);
  }
}

/**
 * Get push logs, newest first.
 *
 * @param {Object} env
 * @param {number} limit - Max rows to return (default 100)
 * @returns {Array} push log rows
 */
export async function getLogs(env, limit = 100) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('signature_push_log')
    .select('*')
    .order('pushed_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[signature-store] getLogs failed: ${error.message}`);
  }

  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETING LAYER  (marketing_signature_settings singleton)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the global marketing signature settings.
 * Returns empty config if no row exists yet.
 *
 * @param {Object} env
 * @returns {{ config: Object, updated_at: string|null, updated_by: string|null }}
 */
export async function getMarketingSettings(env) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('marketing_signature_settings')
    .select('config, updated_at, updated_by')
    .eq('id', MARKETING_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`[signature-store] getMarketingSettings failed: ${error.message}`);
  }

  return data ?? { config: {}, updated_at: null, updated_by: null };
}

/**
 * Upsert the global marketing signature settings.
 * Always writes to the singleton row via fixed ID.
 *
 * @param {Object} env
 * @param {Object} config - Marketing config blob (brandColor, events, banners, etc.)
 * @param {string|null} updatedBy - UUID of the acting user
 * @returns {Object} updated row
 */
export async function upsertMarketingSettings(env, config, updatedBy) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('marketing_signature_settings')
    .upsert({
      id: MARKETING_SETTINGS_ID,
      config,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(`[signature-store] upsertMarketingSettings failed: ${error.message}`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER LAYER  (user_signature_settings – per-user)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the signature settings for one user (by email).
 * Returns null when the user has no saved settings yet.
 *
 * @param {Object} env
 * @param {string} userEmail - Google Workspace email address
 * @returns {Object|null}
 */
export async function getUserSettings(env, userEmail) {
  if (!userEmail) return null;

  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('user_signature_settings')
    .select('*')
    .eq('user_email', userEmail.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`[signature-store] getUserSettings failed: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Upsert the signature settings for one user.
 *
 * Accepted fields (all optional; omit to leave existing value unchanged):
 *   full_name_override, role_title_override, phone_override,
 *   show_email, show_phone,
 *   show_disclaimer, disclaimer_text,
 *   linkedin_promo_enabled, linkedin_url, linkedin_eyebrow,
 *   linkedin_text, linkedin_author_name, linkedin_author_img, linkedin_likes
 *
 * @param {Object} env
 * @param {string} userEmail - Google Workspace email
 * @param {Object} settings  - Partial settings object
 * @param {string|null} updatedBy - UUID of the platform user making the change
 * @returns {Object} updated row
 */
export async function upsertUserSettings(env, userEmail, settings, updatedBy) {
  if (!userEmail) throw new Error('[signature-store] upsertUserSettings: userEmail required');

  const supabase = getSupabaseAdminClient(env);

  // Sanitise: only allow known columns to prevent injection via arbitrary keys
  const ALLOWED_FIELDS = [
    'full_name_override', 'role_title_override', 'phone_override',
    'show_name', 'show_role_title', 'show_email', 'show_phone', 'show_photo',
    'greeting_text', 'show_greeting',
    'company_override', 'show_company',
    'hidden_event_id',
    'show_disclaimer', 'disclaimer_text',
    'linkedin_promo_enabled', 'linkedin_url', 'linkedin_eyebrow',
    'linkedin_text', 'linkedin_author_name', 'linkedin_author_img', 'linkedin_likes'
  ];
  const sanitised = {};
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      sanitised[key] = settings[key];
    }
  }

  const { data, error } = await supabase
    .from('user_signature_settings')
    .upsert({
      user_email: userEmail.toLowerCase(),
      ...sanitised,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_email' })
    .select()
    .single();

  if (error) {
    throw new Error(`[signature-store] upsertUserSettings failed: ${error.message}`);
  }

  return data;
}
