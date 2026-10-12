/**
 * Een aanmelding die nog niet af is.
 *
 * Tussen "wachtwoord juist" en "sessie" staan een of meer stappen: de
 * 2FA-code, 2FA instellen, een nieuw wachtwoord kiezen. Die toestand staat in
 * `auth_challenges`, op een eigen kortlevend token dat de loginpagina enkel
 * in het geheugen houdt (geen cookie, geen localStorage). In de database
 * staat enkel de HASH van dat token, net als bij de sessies.
 *
 * Een challenge is GEEN sessie: met een challenge kan je niets anders dan de
 * volgende stap zetten, en ze vervalt na tien minuten of na vijf foute codes.
 *
 * @module lib/auth/challenges
 */

import { getSupabaseClient } from '../database.js';
import { randomToken, sha256Hex } from './crypto.js';

export const CHALLENGE_MS = 10 * 60 * 1000;
export const CHALLENGE_MAX_ATTEMPTS = 5;

/** De stappen die een challenge kan hebben (CHECK in de migratie). */
export const CHALLENGE_STAGES = ['mfa_verify', 'mfa_enroll', 'password_change', 'mfa_setup'];

/**
 * @param {object} env
 * @param {{ userId: string, stage: string, pendingSecretEnc?: string|null, mfaMethod?: string|null, meta?: object }} opts
 * @returns {Promise<{ token: string, id: string }>}
 */
export async function createChallenge(env, { userId, stage, pendingSecretEnc = null, mfaMethod = null, meta = {} }) {
  if (!CHALLENGE_STAGES.includes(stage)) throw new Error(`Onbekende stap: ${stage}`);
  const token = randomToken(32);
  const { data, error } = await getSupabaseClient(env)
    .from('auth_challenges')
    .insert({
      token_hash: await sha256Hex(token),
      user_id: userId,
      stage,
      pending_secret_enc: pendingSecretEnc,
      mfa_method: mfaMethod,
      ip_address: meta.ip_address || null,
      user_agent: meta.user_agent || null,
      expires_at: new Date(Date.now() + CHALLENGE_MS).toISOString()
    })
    .select('id')
    .single();
  if (error) throw new Error(`Aanmeldstap bewaren mislukt: ${error.message}`);
  return { token, id: data.id };
}

/**
 * De lopende challenge bij dit token, of null (onbekend of verlopen).
 *
 * @param {object} env @param {string} token
 * @returns {Promise<object|null>}
 */
export async function getChallenge(env, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const { data, error } = await getSupabaseClient(env)
    .from('auth_challenges')
    .select('id, user_id, stage, pending_secret_enc, mfa_method, attempts, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error('[auth] aanmeldstap lezen mislukt:', error.message);
    return null;
  }
  return data || null;
}

/**
 * @param {object} env @param {string} id @param {object} patch
 */
export async function updateChallenge(env, id, patch) {
  const { error } = await getSupabaseClient(env).from('auth_challenges').update(patch).eq('id', id);
  if (error) throw new Error(`Aanmeldstap bijwerken mislukt: ${error.message}`);
}

/** @param {object} env @param {string} id */
export async function deleteChallenge(env, id) {
  const { error } = await getSupabaseClient(env).from('auth_challenges').delete().eq('id', id);
  if (error) console.error('[auth] aanmeldstap wissen mislukt:', error.message);
}

/**
 * Een foute code tellen. Geeft true terug als de challenge daarmee op is
 * (en dus gewist).
 *
 * @param {object} env @param {object} challenge
 * @returns {Promise<boolean>}
 */
export async function countFailedAttempt(env, challenge) {
  const pogingen = (challenge.attempts || 0) + 1;
  if (pogingen >= CHALLENGE_MAX_ATTEMPTS) {
    await deleteChallenge(env, challenge.id);
    return true;
  }
  await updateChallenge(env, challenge.id, { attempts: pogingen });
  return false;
}
