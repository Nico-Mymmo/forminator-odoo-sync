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
    'linkedin_text', 'linkedin_author_name', 'linkedin_author_img', 'linkedin_likes',
    'quote_enabled', 'quote_text', 'quote_author', 'quote_date',
    'meeting_link_enabled', 'meeting_link_url', 'meeting_link_heading', 'meeting_link_subtext',
    'odoo_email_override', 'google_email_override',
    'website_url_override', 'email_display_override'
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
/**
 * Clear hidden_event_id for ALL users.
 * Called when marketing activates a new event or clears the current one.
 * This resets every user's opt-out so the new/cleared event state is shown
 * correctly on their next load or push.
 *
 * @param {Object} env
 * @returns {number} count of rows affected
 */
export async function clearAllHiddenEventIds(env) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('user_signature_settings')
    .update({ hidden_event_id: null })
    .not('hidden_event_id', 'is', null)
    .select('user_email');

  if (error) {
    throw new Error(`[signature-store] clearAllHiddenEventIds failed: ${error.message}`);
  }

  return data?.length ?? 0;
}

/**
 * Get the list of email addresses excluded from bulk push operations.
 *
 * @param {Object} env
 * @returns {string[]} array of lowercase email strings
 */
export async function getExcludedEmails(env) {
  const supabase = getSupabaseAdminClient(env);
  const { data, error } = await supabase
    .from('signature_push_excluded')
    .select('email')
    .order('email');
  if (error) {
    throw new Error(`[signature-store] getExcludedEmails failed: ${error.message}`);
  }
  return (data || []).map(r => r.email.toLowerCase());
}

/**
 * Replace the full excluded-emails list (delete-all + re-insert).
 *
 * @param {Object} env
 * @param {string[]} emails - new list (duplicates are cleaned up)
 * @returns {string[]} normalised list that was saved
 */
export async function setExcludedEmails(env, emails) {
  const supabase = getSupabaseAdminClient(env);
  const normalised = [...new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))];
  // Full replace: delete everything then re-insert
  const { error: delError } = await supabase
    .from('signature_push_excluded')
    .delete()
    .neq('email', '');
  if (delError) {
    throw new Error(`[signature-store] setExcludedEmails (delete) failed: ${delError.message}`);
  }
  if (normalised.length > 0) {
    const { error: insError } = await supabase
      .from('signature_push_excluded')
      .insert(normalised.map(e => ({ email: e })));
    if (insError) {
      throw new Error(`[signature-store] setExcludedEmails (insert) failed: ${insError.message}`);
    }
  }
  return normalised;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER SIGNATURE VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all variants for a user, ordered by creation date.
 *
 * @param {Object} env
 * @param {string} userEmail
 * @returns {Promise<Array>}
 */
export async function getVariants(env, userEmail) {
  const supabase = getSupabaseAdminClient(env);
  const { data, error } = await supabase
    .from('user_signature_variants')
    .select('id, user_email, variant_name, config_overrides, created_at, updated_at')
    .eq('user_email', userEmail.toLowerCase())
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[signature-store] getVariants: ${error.message}`);
  return data || [];
}

/**
 * Get a single variant by ID.
 * Optionally enforces ownership: throws if the variant belongs to a different user.
 *
 * @param {Object} env
 * @param {string} variantId
 * @param {string|null} [userEmail] - When provided, ownership is verified
 */
export async function getVariant(env, variantId, userEmail = null) {
  const supabase = getSupabaseAdminClient(env);
  const { data, error } = await supabase
    .from('user_signature_variants')
    .select('id, user_email, variant_name, config_overrides')
    .eq('id', variantId)
    .maybeSingle();
  if (error) throw new Error(`[signature-store] getVariant: ${error.message}`);
  if (!data) return null;
  if (userEmail && data.user_email !== userEmail.toLowerCase()) {
    throw new Error('[signature-store] getVariant: forbidden — variant belongs to another user');
  }
  return data;
}

/**
 * Create or update a variant.
 * Pass variantId = null to create; pass an existing ID to update.
 * Ownership is enforced: update only succeeds when user_email matches.
 *
 * @param {Object} env
 * @param {string} userEmail
 * @param {string|null} variantId  - null = create new
 * @param {string} variantName
 * @param {Object} configOverrides - config keys to override, e.g. { meetingLinkEnabled: false }
 * @returns {Promise<Object>} saved row
 */
export async function upsertVariant(env, userEmail, variantId, variantName, configOverrides) {
  if (!userEmail) throw new Error('[signature-store] upsertVariant: userEmail required');
  if (!variantName?.trim()) throw new Error('[signature-store] upsertVariant: variantName required');

  const supabase = getSupabaseAdminClient(env);
  const email = userEmail.toLowerCase();

  if (variantId) {
    // Update — verify ownership first
    const existing = await getVariant(env, variantId, email);
    if (!existing) throw new Error('[signature-store] upsertVariant: variant not found');
    const { data, error } = await supabase
      .from('user_signature_variants')
      .update({
        variant_name:     variantName.trim(),
        config_overrides: configOverrides || {},
        updated_at:       new Date().toISOString()
      })
      .eq('id', variantId)
      .eq('user_email', email)
      .select()
      .single();
    if (error) throw new Error(`[signature-store] upsertVariant update: ${error.message}`);
    return data;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('user_signature_variants')
      .insert({ user_email: email, variant_name: variantName.trim(), config_overrides: configOverrides || {} })
      .select()
      .single();
    if (error) throw new Error(`[signature-store] upsertVariant insert: ${error.message}`);
    return data;
  }
}

/**
 * Delete a variant by ID (enforces ownership by user_email).
 *
 * @param {Object} env
 * @param {string} variantId
 * @param {string} userEmail
 */
export async function deleteVariant(env, variantId, userEmail) {
  const supabase = getSupabaseAdminClient(env);
  const { error } = await supabase
    .from('user_signature_variants')
    .delete()
    .eq('id', variantId)
    .eq('user_email', userEmail.toLowerCase());
  if (error) throw new Error(`[signature-store] deleteVariant: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// USER ALIAS ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all alias assignments for a user.
 *
 * @param {Object} env
 * @param {string} userEmail
 * @returns {Promise<Array<{ send_as_email, variant_id }>>}
 */
export async function getAliasAssignments(env, userEmail) {
  const supabase = getSupabaseAdminClient(env);
  const { data, error } = await supabase
    .from('user_alias_assignments')
    .select('send_as_email, variant_id, updated_at')
    .eq('user_email', userEmail.toLowerCase());
  if (error) throw new Error(`[signature-store] getAliasAssignments: ${error.message}`);
  return data || [];
}

/**
 * Bulk-save alias assignments for a user (full replace).
 * Any existing assignment NOT in the provided array is removed.
 *
 * @param {Object} env
 * @param {string} userEmail
 * @param {Array<{ sendAsEmail: string, variantId: string|null }>} assignments
 * @returns {Promise<Array>} saved rows
 */
export async function saveAliasAssignments(env, userEmail, assignments) {
  if (!userEmail) throw new Error('[signature-store] saveAliasAssignments: userEmail required');
  if (!Array.isArray(assignments)) throw new Error('[signature-store] saveAliasAssignments: assignments must be array');

  const supabase = getSupabaseAdminClient(env);
  const email = userEmail.toLowerCase();

  // Delete all existing, then re-insert
  const { error: delErr } = await supabase
    .from('user_alias_assignments')
    .delete()
    .eq('user_email', email);
  if (delErr) throw new Error(`[signature-store] saveAliasAssignments delete: ${delErr.message}`);

  if (assignments.length === 0) return [];

  const rows = assignments.map(a => ({
    user_email:    email,
    send_as_email: a.sendAsEmail.toLowerCase().trim(),
    variant_id:    a.variantId || null
  }));

  const { data, error } = await supabase
    .from('user_alias_assignments')
    .insert(rows)
    .select();
  if (error) throw new Error(`[signature-store] saveAliasAssignments insert: ${error.message}`);
  return data || [];
}