/**
 * Mini-Apps — Gebruikersinstellingen
 *
 * Vandaag enkel google_email_override: het echte Google Workspace-
 * e-mailadres dat als impersonation-subject gebruikt wordt voor de Google
 * Drive-koppeling (lib/google-drive-client.js), voor gebruikers wiens
 * Operations Manager-login (users.email) niet overeenkomt met hun echte
 * Workspace-mailbox.
 *
 * BEWUST een eigen tabel (mini_app_user_settings), los van
 * mail-signature-designer's user_signature_settings.google_email_override
 * -- zie de migratie voor de motivatie. Geen cross-module import van
 * mail-signature-designer hier.
 */

import { getSupabaseClient } from '../../../lib/database.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {Object} env
 * @param {string} userId
 * @returns {Promise<{ google_email_override: string|null }>}
 */
export async function getMiniAppsUserSettings(env, userId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('mini_app_user_settings')
    .select('google_email_override')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Instellingen ophalen mislukt: ${error.message}`);
  return { google_email_override: data?.google_email_override || null };
}

/**
 * Bepaalt welk e-mailadres gebruikt moet worden als impersonation-subject:
 * de override indien gezet, anders de gewone OM-login (user.email).
 */
export async function resolveGoogleEmail(env, user) {
  const settings = await getMiniAppsUserSettings(env, user.id);
  return settings.google_email_override || user.email;
}

/**
 * @param {Object} env
 * @param {string} userId
 * @param {string|null} email - leeg/null om de override te wissen (terug naar user.email)
 */
export async function setGoogleEmailOverride(env, userId, email) {
  const trimmed = (email || '').trim().toLowerCase();

  if (trimmed && !EMAIL_RE.test(trimmed)) {
    const err = new Error('Ongeldig e-mailadres.');
    err.code = 'INVALID_EMAIL';
    throw err;
  }

  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('mini_app_user_settings')
    .upsert({ user_id: userId, google_email_override: trimmed || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) throw new Error(`Instellingen opslaan mislukt: ${error.message}`);
  return { google_email_override: trimmed || null };
}
