/**
 * Profiel -> Beveiliging: wat een gebruiker zelf aan zijn toegang kan zien en
 * doen. Scherm: public/account-security.html.
 *
 *   GET    /profile/api/security                        2FA-stand, sessies, aanmeldingen
 *   POST   /profile/api/security/mfa/setup              { password } -> nieuwe QR-code
 *   POST   /profile/api/security/mfa/confirm            { challenge, code } -> herstelcodes
 *   POST   /profile/api/security/recovery-codes         { password } -> nieuwe herstelcodes
 *   DELETE /profile/api/security/sessions/:id           een andere sessie beëindigen
 *   POST   /profile/api/security/sessions/revoke-others alle andere sessies beëindigen
 *
 * Wat een gevolg heeft voor de toegang (2FA vervangen, nieuwe herstelcodes)
 * vraagt EERST het wachtwoord opnieuw: een open laptop mag niet volstaan om
 * iemands tweede factor over te nemen.
 *
 * Een fout wachtwoord geeft hier 403 en geen 401: de schermen sturen bij een
 * 401 naar de loginpagina, en een tikfout mag je niet uitloggen.
 */

import { getSupabaseClient } from '../../lib/database.js';
import {
  listUserSessions,
  revokeOtherSessions,
  revokeSessionById,
  toSessionDto
} from '../../lib/auth/session.js';
import { verifyUserPassword } from '../../lib/auth/password.js';
import { checkLockout, listUserAuthEvents, logAuthEvent, requestMeta } from '../../lib/auth/events.js';
import { countFailedAttempt, createChallenge, deleteChallenge, getChallenge } from '../../lib/auth/challenges.js';
import { countRecoveryCodes, enableMfa, generateRecoveryCodes, hasMfa, mfaRequired } from '../../lib/auth/mfa.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../lib/auth/totp.js';
import { AuthConfigError, decryptSecret, encryptSecret } from '../../lib/auth/crypto.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function fout(err, waar) {
  if (err instanceof AuthConfigError || err?.code === 'AUTH_NOT_CONFIGURED') {
    return json({ success: false, error: 'Tweestapsverificatie is op de server nog niet ingesteld (AUTH_SECRET_KEY).' }, 503);
  }
  console.error(`[profiel/beveiliging] ${waar}:`, err?.message);
  return json({ success: false, error: err?.message || 'Er ging iets mis.' }, 500);
}

async function leesBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function laadMij(env, userId) {
  const { data, error } = await getSupabaseClient(env)
    .from('users')
    .select('id, email, password_hash, mfa_secret_enc, mfa_enabled_at, password_changed_at')
    .eq('id', userId)
    .single();
  if (error || !data) throw new Error('Gebruiker niet gevonden');
  return data;
}

/**
 * Het wachtwoord opnieuw vragen. Telt mee voor de blokkering, net als bij het
 * inloggen: anders is dit een tweede deur om wachtwoorden te raden.
 */
async function herbevestig(env, request, me, password) {
  const meta = requestMeta(request);
  const slot = await checkLockout(env, { email: me.email, ip: meta.ip_address });
  if (slot.locked) {
    return { antwoord: json({ success: false, error: 'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.' }, 429) };
  }
  const { valid } = await verifyUserPassword(String(password || ''), me.password_hash);
  if (!valid) {
    await logAuthEvent(env, { event: 'password_failed', userId: me.id, email: me.email, meta, detail: { reauth: true } });
    return { antwoord: json({ success: false, error: 'Je wachtwoord klopt niet.' }, 403) };
  }
  return { meta };
}

/** GET /profile/api/security */
export async function handleGetSecurity({ env, user }) {
  try {
    const me = await laadMij(env, user.id);
    const [sessies, events, herstel] = await Promise.all([
      listUserSessions(env, me.id),
      listUserAuthEvents(env, me, 25),
      countRecoveryCodes(env, me.id)
    ]);
    return json({
      success: true,
      data: {
        email: me.email,
        mfa: {
          enabled: hasMfa(me),
          enabled_at: me.mfa_enabled_at,
          required: mfaRequired(env),
          recovery_remaining: herstel
        },
        password_changed_at: me.password_changed_at,
        sessions: sessies.map(s => toSessionDto(s, user.sessionId)),
        events
      }
    });
  } catch (err) {
    return fout(err, 'ophalen');
  }
}

/** POST /profile/api/security/mfa/setup */
export async function handleMfaSetup({ env, user, request }) {
  try {
    const body = await leesBody(request);
    const me = await laadMij(env, user.id);
    const { antwoord, meta } = await herbevestig(env, request, me, body.password);
    if (antwoord) return antwoord;

    const secret = generateTotpSecret();
    const { token } = await createChallenge(env, {
      userId: me.id,
      stage: 'mfa_setup',
      pendingSecretEnc: await encryptSecret(env, secret, me.id),
      meta
    });
    return json({ success: true, challenge: token, secret, otpauth: otpauthUrl(secret, me.email) });
  } catch (err) {
    return fout(err, 'mfa/setup');
  }
}

/** POST /profile/api/security/mfa/confirm */
export async function handleMfaConfirm({ env, user, request }) {
  try {
    const meta = requestMeta(request);
    const body = await leesBody(request);
    const challenge = await getChallenge(env, body.challenge);
    if (!challenge || challenge.stage !== 'mfa_setup' || challenge.user_id !== user.id) {
      return json({ success: false, error: 'Deze instelling is verlopen. Begin opnieuw.', restart: true }, 400);
    }
    const me = await laadMij(env, user.id);
    const secret = await decryptSecret(env, challenge.pending_secret_enc, me.id);
    const stap = await verifyTotp(secret, String(body.code || '').trim());
    if (stap == null) {
      await logAuthEvent(env, { event: 'mfa_failed', userId: me.id, email: me.email, meta, detail: { stage: 'mfa_setup' } });
      const op = await countFailedAttempt(env, challenge);
      return json({
        success: false,
        error: op ? 'Te veel foute codes. Begin opnieuw.' : 'Die code klopt niet. Probeer de volgende code van je app.',
        restart: op
      }, 400);
    }

    const hadMfa = hasMfa(me);
    await enableMfa(env, me.id, secret, stap);
    const codes = await generateRecoveryCodes(env, me.id);
    await deleteChallenge(env, challenge.id);

    // Wie zijn authenticator vervangt, doet dat vaak omdat het oude toestel
    // weg is: de andere sessies horen dan ook weg.
    const beeindigd = user.sessionId ? await revokeOtherSessions(env, me.id, user.sessionId) : 0;
    if (user.sessionId) {
      const { error } = await getSupabaseClient(env)
        .from('sessions')
        .update({ mfa_method: 'totp' })
        .eq('id', user.sessionId)
        .is('mfa_method', null);
      if (error) console.error('[profiel/beveiliging] sessie bijwerken mislukt:', error.message);
    }
    await logAuthEvent(env, {
      event: 'mfa_enrolled',
      userId: me.id,
      email: me.email,
      meta,
      detail: { replaced: hadMfa, sessions_revoked: beeindigd }
    });

    return json({ success: true, recovery_codes: codes, sessions_revoked: beeindigd });
  } catch (err) {
    return fout(err, 'mfa/confirm');
  }
}

/** POST /profile/api/security/recovery-codes */
export async function handleRegenerateRecoveryCodes({ env, user, request }) {
  try {
    const body = await leesBody(request);
    const me = await laadMij(env, user.id);
    if (!hasMfa(me)) {
      return json({ success: false, error: 'Stel eerst tweestapsverificatie in.' }, 400);
    }
    const { antwoord, meta } = await herbevestig(env, request, me, body.password);
    if (antwoord) return antwoord;
    const codes = await generateRecoveryCodes(env, me.id);
    await logAuthEvent(env, { event: 'recovery_regenerated', userId: me.id, email: me.email, meta });
    return json({ success: true, recovery_codes: codes });
  } catch (err) {
    return fout(err, 'herstelcodes');
  }
}

/** DELETE /profile/api/security/sessions/:id */
export async function handleRevokeOwnSession({ env, user, request, params }) {
  try {
    const id = params?.id;
    if (!id) return json({ success: false, error: 'Sessie ontbreekt.' }, 400);
    if (id === user.sessionId) {
      return json({ success: false, error: 'Dit is de sessie waarmee je nu werkt. Gebruik Uitloggen.' }, 400);
    }
    const weg = await revokeSessionById(env, user.id, id);
    if (!weg) return json({ success: false, error: 'Die sessie bestaat niet (meer).' }, 404);
    await logAuthEvent(env, {
      event: 'session_revoked',
      userId: user.id,
      email: user.email,
      meta: requestMeta(request),
      detail: { by: 'self' }
    });
    return json({ success: true });
  } catch (err) {
    return fout(err, 'sessie beëindigen');
  }
}

/** POST /profile/api/security/sessions/revoke-others */
export async function handleRevokeOtherOwnSessions({ env, user, request }) {
  try {
    // Zonder eigen sessie-id zou "alle andere" ook deze sessie zijn.
    if (!user.sessionId) return json({ success: false, error: 'Huidige sessie onbekend.' }, 400);
    const aantal = await revokeOtherSessions(env, user.id, user.sessionId);
    if (aantal > 0) {
      await logAuthEvent(env, {
        event: 'sessions_revoked',
        userId: user.id,
        email: user.email,
        meta: requestMeta(request),
        detail: { by: 'self', count: aantal }
      });
    }
    return json({ success: true, count: aantal });
  } catch (err) {
    return fout(err, 'sessies beëindigen');
  }
}
