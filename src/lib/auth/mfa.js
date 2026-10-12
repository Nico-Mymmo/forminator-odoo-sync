/**
 * Tweestapsverificatie (2FA) per gebruiker: het TOTP-geheim, de herstelcodes,
 * en of 2FA verplicht is.
 *
 * Het geheim staat VERSLEUTELD in `users.mfa_secret_enc` (AES-GCM met een
 * sleutel uit AUTH_SECRET_KEY, gebonden aan de gebruikers-id). Herstelcodes
 * staan als SHA-256-hash in `user_mfa_recovery_codes`: ze zijn willekeurig
 * (50 bits), dus een zout voegt niets toe, en ze moeten opzoekbaar blijven.
 *
 * @module lib/auth/mfa
 */

import { getSupabaseClient } from '../database.js';
import { decryptSecret, encryptSecret, sha256Hex } from './crypto.js';
import { verifyTotp } from './totp.js';

export const RECOVERY_CODE_COUNT = 10;

/** Zonder tekens die je verwart bij het overtypen (0/o, 1/l/i). */
const HERSTEL_ALFABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Is 2FA verplicht? `AUTH_MFA_MODE` in wrangler.jsonc. Alles behalve exact
 * `optional` betekent VERPLICHT -- een tikfout of een ontbrekende variabele
 * mag de beveiliging nooit uitzetten.
 *
 * @param {object} env @returns {boolean}
 */
export function mfaRequired(env) {
  return String(env?.AUTH_MFA_MODE || 'required').trim().toLowerCase() !== 'optional';
}

/** @param {object} user (rij uit `users`) @returns {boolean} */
export function hasMfa(user) {
  return !!(user?.mfa_enabled_at && user?.mfa_secret_enc);
}

/**
 * Klopt deze authenticator-code voor deze gebruiker? Een aanvaarde code wordt
 * meteen "verbruikt" (mfa_last_step), zodat ze geen tweede keer werkt.
 *
 * @param {object} env
 * @param {{ id: string, mfa_secret_enc: string, mfa_last_step?: number|null }} user
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export async function verifyUserTotp(env, user, code) {
  const secret = await decryptSecret(env, user.mfa_secret_enc, user.id);
  const stap = await verifyTotp(secret, code, { lastStep: user.mfa_last_step ?? null });
  if (stap == null) return false;

  // Voorwaardelijk bijwerken: twee verzoeken met dezelfde code tegelijk mogen
  // niet allebei slagen. Enkel wie de stap echt ophoogt, krijgt "ja".
  const supabase = getSupabaseClient(env);
  let q = supabase.from('users').update({ mfa_last_step: stap }).eq('id', user.id);
  q = user.mfa_last_step == null ? q.is('mfa_last_step', null) : q.lt('mfa_last_step', stap);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`2FA-stap bewaren mislukt: ${error.message}`);
  return (data || []).length === 1;
}

/**
 * Zet 2FA aan (of vervang het geheim) met een geheim waarvan net een juiste
 * code is ingegeven.
 *
 * @param {object} env @param {string} userId @param {string} secret @param {number} step
 */
export async function enableMfa(env, userId, secret, step) {
  const { error } = await getSupabaseClient(env)
    .from('users')
    .update({
      mfa_secret_enc: await encryptSecret(env, secret, userId),
      mfa_enabled_at: new Date().toISOString(),
      mfa_last_step: step,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);
  if (error) throw new Error(`2FA bewaren mislukt: ${error.message}`);
}

/**
 * 2FA wissen (beheerder): de gebruiker moet het bij de volgende login opnieuw
 * instellen. Herstelcodes gaan mee weg -- ze horen bij het oude geheim.
 *
 * @param {object} env @param {string} userId
 */
export async function resetMfa(env, userId) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('users')
    .update({ mfa_secret_enc: null, mfa_enabled_at: null, mfa_last_step: null, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(`2FA wissen mislukt: ${error.message}`);
  const { error: codesFout } = await supabase.from('user_mfa_recovery_codes').delete().eq('user_id', userId);
  if (codesFout) throw new Error(`Herstelcodes wissen mislukt: ${codesFout.message}`);
}

function normaliseerHerstelcode(code) {
  return String(code || '').toLowerCase().replace(/[\s-]/g, '');
}

async function hashHerstelcode(code) {
  return sha256Hex('om-recovery:' + normaliseerHerstelcode(code));
}

/**
 * Lijkt dit op een herstelcode (en niet op een 6-cijferige authenticator-code)?
 * @param {string} code @returns {boolean}
 */
export function looksLikeRecoveryCode(code) {
  const n = normaliseerHerstelcode(code);
  return n.length === 10 && /^[a-z0-9]+$/.test(n) && !/^\d+$/.test(n);
}

/**
 * Nieuwe herstelcodes. De vorige vervallen allemaal. De codes zelf worden
 * hier EEN keer teruggegeven en nergens bewaard.
 *
 * @param {object} env @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function generateRecoveryCodes(env, userId) {
  const limiet = 256 - (256 % HERSTEL_ALFABET.length);
  const codes = [];
  while (codes.length < RECOVERY_CODE_COUNT) {
    let tekens = '';
    while (tekens.length < 10) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      for (const x of b) {
        if (x < limiet && tekens.length < 10) tekens += HERSTEL_ALFABET[x % HERSTEL_ALFABET.length];
      }
    }
    // Enkel cijfers zou als authenticator-code gelezen worden (zie
    // looksLikeRecoveryCode); de kans is klein, maar dan nemen we een andere.
    if (/^\d+$/.test(tekens)) continue;
    const code = `${tekens.slice(0, 5)}-${tekens.slice(5)}`;
    if (!codes.includes(code)) codes.push(code);
  }

  const supabase = getSupabaseClient(env);
  const { error: wisFout } = await supabase.from('user_mfa_recovery_codes').delete().eq('user_id', userId);
  if (wisFout) throw new Error(`Oude herstelcodes wissen mislukt: ${wisFout.message}`);
  const rijen = [];
  for (const code of codes) rijen.push({ user_id: userId, code_hash: await hashHerstelcode(code) });
  const { error } = await supabase.from('user_mfa_recovery_codes').insert(rijen);
  if (error) throw new Error(`Herstelcodes bewaren mislukt: ${error.message}`);
  return codes;
}

/**
 * Een herstelcode gebruiken. Elke code werkt EEN keer.
 *
 * @param {object} env @param {string} userId @param {string} code
 * @returns {Promise<boolean>}
 */
export async function useRecoveryCode(env, userId, code) {
  if (!looksLikeRecoveryCode(code)) return false;
  const { data, error } = await getSupabaseClient(env)
    .from('user_mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('code_hash', await hashHerstelcode(code))
    .is('used_at', null)
    .select('id');
  if (error) throw new Error(`Herstelcode nakijken mislukt: ${error.message}`);
  return (data || []).length === 1;
}

/**
 * Hoeveel ongebruikte herstelcodes er nog zijn.
 * @param {object} env @param {string} userId @returns {Promise<number>}
 */
export async function countRecoveryCodes(env, userId) {
  const { count, error } = await getSupabaseClient(env)
    .from('user_mfa_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);
  if (error) {
    console.error('[auth] herstelcodes tellen mislukt:', error.message);
    return 0;
  }
  return count || 0;
}
