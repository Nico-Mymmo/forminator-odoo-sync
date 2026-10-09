/**
 * Inloggen in stappen: wachtwoord -> 2FA (of 2FA instellen) -> eventueel een
 * eigen wachtwoord kiezen -> sessie.
 *
 *   POST /api/auth/login           { email, password }
 *   POST /api/auth/login/mfa       { challenge, code }       (TOTP of herstelcode)
 *   POST /api/auth/login/password  { challenge, password }   (na een reset door een beheerder)
 *
 * Elk antwoord met `success: true` heeft een `step`:
 *   - `mfa_verify`       code van de authenticator-app vragen
 *   - `mfa_enroll`       2FA instellen; `enroll: { secret, otpauth }` voor de QR-code
 *   - `password_change`  een eigen wachtwoord laten kiezen
 *   - `done`             de sessiecookie staat; eventueel `recovery_codes` om te tonen
 *
 * Pas bij `done` bestaat er een sessie. Daarvoor is er enkel een challenge
 * (lib/auth/challenges.js) die nergens anders toegang toe geeft.
 *
 * Het sessietoken gaat NOOIT meer in de body mee, enkel als HttpOnly-cookie.
 * De oude loginpagina zette het in localStorage, waar elk script op de pagina
 * het kon lezen -- en dan helpt HttpOnly niets.
 *
 * @module api/auth-login
 */

import { getSupabaseClient } from '../lib/database.js';
import { createSession } from '../lib/auth/session.js';
import { checkNewPassword, hashUserPassword, verifyUserPassword } from '../lib/auth/password.js';
import { checkLockout, logAuthEvent, requestMeta } from '../lib/auth/events.js';
import {
  countFailedAttempt,
  createChallenge,
  deleteChallenge,
  getChallenge,
  updateChallenge,
  CHALLENGE_MS
} from '../lib/auth/challenges.js';
import {
  countRecoveryCodes,
  enableMfa,
  generateRecoveryCodes,
  hasMfa,
  looksLikeRecoveryCode,
  mfaRequired,
  useRecoveryCode,
  verifyUserTotp
} from '../lib/auth/mfa.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../lib/auth/totp.js';
import { AuthConfigError, decryptSecret, encryptSecret } from '../lib/auth/crypto.js';
import { sessionCookie } from './auth.js';

/** Kolommen van `users` die de aanmelding nodig heeft. */
const USER_KOLOMMEN = 'id, email, password_hash, is_active, mfa_secret_enc, mfa_enabled_at, mfa_last_step, must_change_password';

/** Bij zoveel resterende herstelcodes (of minder) krijgt de gebruiker een seintje. */
const HERSTEL_WAARSCHUWING = 3;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });
}

function geblokkeerd(slot) {
  const tot = slot.until ? new Date(slot.until) : null;
  const minuten = tot ? Math.max(1, Math.ceil((tot.getTime() - Date.now()) / 60000)) : 15;
  return json({
    success: false,
    error: `Te veel mislukte pogingen. Probeer het over ${minuten} minuten opnieuw, of vraag je beheerder om je account te ontgrendelen.`,
    locked: true,
    restart: true
  }, 429);
}

function opnieuwBeginnen(boodschap = 'Je aanmelding is verlopen. Begin opnieuw.') {
  return json({ success: false, error: boodschap, restart: true }, 401);
}

function fout(err, waar) {
  if (err instanceof AuthConfigError || err?.code === 'AUTH_NOT_CONFIGURED') {
    console.error(`[auth] ${waar}: ${err.message}`);
    return json({
      success: false,
      error: 'Tweestapsverificatie is op de server nog niet ingesteld (AUTH_SECRET_KEY). Verwittig de beheerder.'
    }, 503);
  }
  console.error(`[auth] ${waar}:`, err?.message, err?.stack);
  return json({ success: false, error: 'Er ging iets mis. Probeer het opnieuw.' }, 500);
}

async function leesBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function laadGebruiker(env, kolom, waarde) {
  const { data, error } = await getSupabaseClient(env)
    .from('users')
    .select(USER_KOLOMMEN)
    .eq(kolom, waarde)
    .maybeSingle();
  if (error) throw new Error(`Gebruiker ophalen mislukt: ${error.message}`);
  return data || null;
}

/**
 * De aanmelding afronden: sessie maken, cookie zetten.
 */
async function rondAf(env, user, { method, meta, extra = {} }) {
  const { token } = await createSession(env, user.id, { ...meta, mfa_method: method });
  const { error } = await getSupabaseClient(env)
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) console.error('[auth] last_login_at bijwerken mislukt:', error.message);
  await logAuthEvent(env, { event: 'login', userId: user.id, email: user.email, meta, detail: { method } });
  return json({ success: true, step: 'done', ...extra }, 200, { 'Set-Cookie': sessionCookie(token) });
}

/**
 * Na 2FA (of zonder, als 2FA optioneel staat): nog een eigen wachtwoord
 * kiezen, of meteen afronden.
 */
async function naTweedeStap(env, user, { method, meta, challengeId, challengeToken, extra = {} }) {
  if (user.must_change_password) {
    if (challengeId) {
      await updateChallenge(env, challengeId, {
        stage: 'password_change',
        mfa_method: method,
        attempts: 0,
        pending_secret_enc: null,
        expires_at: new Date(Date.now() + CHALLENGE_MS).toISOString()
      });
      return json({ success: true, step: 'password_change', challenge: challengeToken, ...extra });
    }
    const { token } = await createChallenge(env, { userId: user.id, stage: 'password_change', mfaMethod: method, meta });
    return json({ success: true, step: 'password_change', challenge: token, ...extra });
  }
  if (challengeId) await deleteChallenge(env, challengeId);
  return rondAf(env, user, { method, meta, extra });
}

/**
 * POST /api/auth/login
 */
export async function handleLogin({ request, env }) {
  try {
    const meta = requestMeta(request);
    const body = await leesBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return json({ success: false, error: 'Vul je e-mailadres en wachtwoord in.' }, 400);
    }

    // EERST de blokkering, pas dan het wachtwoord: anders blijft een
    // geblokkeerd account een orakel voor wie wachtwoorden afloopt.
    const slot = await checkLockout(env, { email, ip: meta.ip_address });
    if (slot.locked) {
      await logAuthEvent(env, { event: 'locked', email, meta, detail: { scope: slot.scope } });
      return geblokkeerd(slot);
    }

    const user = await laadGebruiker(env, 'email', email);
    const { valid, needsRehash } = await verifyUserPassword(password, user?.password_hash);

    if (!user || !valid) {
      await logAuthEvent(env, {
        event: 'password_failed',
        userId: user?.id || null,
        email,
        meta,
        detail: user ? null : { unknown_account: true }
      });
      return json({ success: false, error: 'Inloggen mislukt. Controleer je e-mailadres en wachtwoord.' }, 401);
    }

    if (!user.is_active) {
      await logAuthEvent(env, { event: 'inactive', userId: user.id, email, meta });
      return json({ success: false, error: 'Dit account is gedeactiveerd. Vraag je beheerder.' }, 403);
    }

    // Een oude (ongezouten) hash meteen omzetten nu we het wachtwoord kennen.
    if (needsRehash) {
      const { error } = await getSupabaseClient(env)
        .from('users')
        .update({ password_hash: await hashUserPassword(password) })
        .eq('id', user.id);
      if (error) console.error('[auth] wachtwoordhash omzetten mislukt:', error.message);
    }

    if (hasMfa(user)) {
      await logAuthEvent(env, { event: 'password_ok', userId: user.id, email, meta });
      const { token } = await createChallenge(env, { userId: user.id, stage: 'mfa_verify', meta });
      return json({ success: true, step: 'mfa_verify', challenge: token });
    }

    if (mfaRequired(env)) {
      await logAuthEvent(env, { event: 'password_ok', userId: user.id, email, meta, detail: { enroll: true } });
      const secret = generateTotpSecret();
      const { token } = await createChallenge(env, {
        userId: user.id,
        stage: 'mfa_enroll',
        pendingSecretEnc: await encryptSecret(env, secret, user.id),
        meta
      });
      return json({
        success: true,
        step: 'mfa_enroll',
        challenge: token,
        enroll: { secret, otpauth: otpauthUrl(secret, user.email) }
      });
    }

    // 2FA optioneel en niet ingesteld.
    return naTweedeStap(env, user, { method: null, meta });
  } catch (err) {
    return fout(err, 'login');
  }
}

/**
 * POST /api/auth/login/mfa
 */
export async function handleLoginMfa({ request, env }) {
  try {
    const meta = requestMeta(request);
    const body = await leesBody(request);
    const challenge = await getChallenge(env, body.challenge);
    if (!challenge || !['mfa_verify', 'mfa_enroll'].includes(challenge.stage)) return opnieuwBeginnen();

    const user = await laadGebruiker(env, 'id', challenge.user_id);
    if (!user || !user.is_active) {
      await deleteChallenge(env, challenge.id);
      return opnieuwBeginnen();
    }

    const slot = await checkLockout(env, { email: user.email, ip: meta.ip_address });
    if (slot.locked) {
      await deleteChallenge(env, challenge.id);
      await logAuthEvent(env, { event: 'locked', userId: user.id, email: user.email, meta, detail: { scope: slot.scope } });
      return geblokkeerd(slot);
    }

    const code = String(body.code || '').trim();
    let ok = false;
    let method = 'totp';
    const extra = {};

    if (challenge.stage === 'mfa_verify') {
      if (!hasMfa(user)) return opnieuwBeginnen();
      if (looksLikeRecoveryCode(code)) {
        method = 'recovery';
        ok = await useRecoveryCode(env, user.id, code);
      } else {
        ok = await verifyUserTotp(env, user, code);
      }
    } else {
      const secret = await decryptSecret(env, challenge.pending_secret_enc, user.id);
      const stap = await verifyTotp(secret, code);
      if (stap != null) {
        ok = true;
        await enableMfa(env, user.id, secret, stap);
        extra.recovery_codes = await generateRecoveryCodes(env, user.id);
        await logAuthEvent(env, { event: 'mfa_enrolled', userId: user.id, email: user.email, meta });
      }
    }

    if (!ok) {
      await logAuthEvent(env, {
        event: 'mfa_failed',
        userId: user.id,
        email: user.email,
        meta,
        detail: { stage: challenge.stage, method }
      });
      const op = await countFailedAttempt(env, challenge);
      if (op) return opnieuwBeginnen('Te veel foute codes. Begin opnieuw met je wachtwoord.');
      return json({
        success: false,
        error: method === 'recovery'
          ? 'Die herstelcode klopt niet of werd al gebruikt.'
          : 'Die code klopt niet. Kijk of de klok van je telefoon juist staat en probeer de volgende code.'
      }, 401);
    }

    if (method === 'recovery') {
      const over = await countRecoveryCodes(env, user.id);
      await logAuthEvent(env, { event: 'recovery_used', userId: user.id, email: user.email, meta, detail: { remaining: over } });
      if (over <= HERSTEL_WAARSCHUWING) extra.recovery_remaining = over;
    }

    return naTweedeStap(env, user, {
      method,
      meta,
      challengeId: challenge.id,
      challengeToken: body.challenge,
      extra
    });
  } catch (err) {
    return fout(err, 'login/mfa');
  }
}

/**
 * POST /api/auth/login/password
 */
export async function handleLoginPassword({ request, env }) {
  try {
    const meta = requestMeta(request);
    const body = await leesBody(request);
    const challenge = await getChallenge(env, body.challenge);
    if (!challenge || challenge.stage !== 'password_change') return opnieuwBeginnen();

    const user = await laadGebruiker(env, 'id', challenge.user_id);
    if (!user || !user.is_active) {
      await deleteChallenge(env, challenge.id);
      return opnieuwBeginnen();
    }

    const nieuw = String(body.password || '');
    const probleem = checkNewPassword(nieuw, { email: user.email });
    if (probleem) return json({ success: false, error: probleem }, 400);
    if ((await verifyUserPassword(nieuw, user.password_hash)).valid) {
      return json({ success: false, error: 'Kies een ander wachtwoord dan het tijdelijke.' }, 400);
    }

    const nu = new Date().toISOString();
    const { error } = await getSupabaseClient(env)
      .from('users')
      .update({
        password_hash: await hashUserPassword(nieuw),
        must_change_password: false,
        password_changed_at: nu,
        updated_at: nu
      })
      .eq('id', user.id);
    if (error) throw new Error(`Wachtwoord bewaren mislukt: ${error.message}`);
    await logAuthEvent(env, { event: 'password_changed', userId: user.id, email: user.email, meta, detail: { at_login: true } });

    await deleteChallenge(env, challenge.id);
    return rondAf(env, user, { method: challenge.mfa_method || null, meta });
  } catch (err) {
    return fout(err, 'login/password');
  }
}
