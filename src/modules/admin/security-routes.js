/**
 * Beheer -> loginbeheer: per gebruiker zijn sessies, aanmeldingen, 2FA en
 * blokkering, en een logboek over alle accounts.
 *
 *   GET    /admin/api/users/:id/security        2FA, sessies, aanmeldingen, blokkering
 *   DELETE /admin/api/users/:id/sessions/:sid   een sessie beëindigen
 *   DELETE /admin/api/users/:id/sessions        alle sessies beëindigen
 *   POST   /admin/api/users/:id/mfa-reset       2FA wissen: opnieuw instellen bij de volgende login
 *   POST   /admin/api/users/:id/unlock          blokkering opheffen
 *   GET    /admin/api/auth-events?filter=       logboek + wie nu geblokkeerd is
 *
 * Elke ingreep komt zelf ook in het logboek, met wie ze deed (`detail.by`).
 */

import { getSupabaseClient } from '../../lib/database.js';
import {
  listUserSessions,
  revokeOtherSessions,
  revokeSessionById,
  toSessionDto
} from '../../lib/auth/session.js';
import {
  AUTH_EVENT_COLUMNS,
  LOCK_WINDOW_MS,
  checkLockout,
  listUserAuthEvents,
  logAuthEvent,
  requestMeta,
  toAuthEventDto
} from '../../lib/auth/events.js';
import { countRecoveryCodes, hasMfa, mfaRequired, resetMfa } from '../../lib/auth/mfa.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function geenAdmin(user) {
  return user?.role !== 'admin' ? json({ success: false, error: 'Forbidden' }, 403) : null;
}

async function laadDoel(env, id) {
  const { data, error } = await getSupabaseClient(env)
    .from('users')
    .select('id, email, full_name, is_active, mfa_secret_enc, mfa_enabled_at, must_change_password, password_changed_at, last_login_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

function fout(err, waar) {
  console.error(`[admin/loginbeheer] ${waar}:`, err?.message);
  return json({ success: false, error: err?.message || 'Er ging iets mis.' }, 500);
}

/** GET /admin/api/users/:id/security */
export async function handleGetUserSecurity({ env, user, params }) {
  const nee = geenAdmin(user);
  if (nee) return nee;
  try {
    const doel = await laadDoel(env, params.id);
    if (!doel) return json({ success: false, error: 'Gebruiker niet gevonden' }, 404);
    const [sessies, events, herstel, slot] = await Promise.all([
      listUserSessions(env, doel.id),
      listUserAuthEvents(env, doel, 50),
      countRecoveryCodes(env, doel.id),
      checkLockout(env, { email: doel.email })
    ]);
    return json({
      success: true,
      data: {
        user: {
          id: doel.id,
          email: doel.email,
          full_name: doel.full_name,
          is_active: doel.is_active,
          mfa_enabled: hasMfa(doel),
          mfa_enabled_at: doel.mfa_enabled_at,
          must_change_password: !!doel.must_change_password,
          password_changed_at: doel.password_changed_at,
          last_login_at: doel.last_login_at,
          recovery_remaining: herstel
        },
        mfa_required: mfaRequired(env),
        lock: { locked: slot.locked, until: slot.until || null, failures: slot.failures },
        sessions: sessies.map(s => toSessionDto(s, doel.id === user.id ? user.sessionId : null)),
        events
      }
    });
  } catch (err) {
    return fout(err, 'ophalen');
  }
}

/** DELETE /admin/api/users/:id/sessions/:sid */
export async function handleRevokeUserSession({ env, user, params, request }) {
  const nee = geenAdmin(user);
  if (nee) return nee;
  try {
    const doel = await laadDoel(env, params.id);
    if (!doel) return json({ success: false, error: 'Gebruiker niet gevonden' }, 404);
    const weg = await revokeSessionById(env, doel.id, params.sid);
    if (!weg) return json({ success: false, error: 'Die sessie bestaat niet (meer).' }, 404);
    await logAuthEvent(env, {
      event: 'session_revoked',
      userId: doel.id,
      email: doel.email,
      meta: requestMeta(request),
      detail: { by: user.email }
    });
    return json({ success: true });
  } catch (err) {
    return fout(err, 'sessie beëindigen');
  }
}

/** DELETE /admin/api/users/:id/sessions */
export async function handleRevokeAllUserSessions({ env, user, params, request }) {
  const nee = geenAdmin(user);
  if (nee) return nee;
  try {
    const doel = await laadDoel(env, params.id);
    if (!doel) return json({ success: false, error: 'Gebruiker niet gevonden' }, 404);
    // Je eigen sessies: deze blijft, anders sluit je jezelf buiten midden in je werk.
    const houd = doel.id === user.id ? user.sessionId : null;
    const aantal = await revokeOtherSessions(env, doel.id, houd);
    await logAuthEvent(env, {
      event: 'sessions_revoked',
      userId: doel.id,
      email: doel.email,
      meta: requestMeta(request),
      detail: { by: user.email, count: aantal }
    });
    return json({ success: true, count: aantal });
  } catch (err) {
    return fout(err, 'sessies beëindigen');
  }
}

/** POST /admin/api/users/:id/mfa-reset */
export async function handleResetUserMfa({ env, user, params, request }) {
  const nee = geenAdmin(user);
  if (nee) return nee;
  try {
    const doel = await laadDoel(env, params.id);
    if (!doel) return json({ success: false, error: 'Gebruiker niet gevonden' }, 404);
    await resetMfa(env, doel.id);
    // Lopende aanmeldingen (een challenge voor het oude geheim) mogen niet
    // meer afgemaakt worden.
    const { error: chFout } = await getSupabaseClient(env).from('auth_challenges').delete().eq('user_id', doel.id);
    if (chFout) console.error('[admin/loginbeheer] challenges wissen mislukt:', chFout.message);
    const houd = doel.id === user.id ? user.sessionId : null;
    const aantal = await revokeOtherSessions(env, doel.id, houd);
    await logAuthEvent(env, {
      event: 'mfa_reset',
      userId: doel.id,
      email: doel.email,
      meta: requestMeta(request),
      detail: { by: user.email, sessions_revoked: aantal }
    });
    return json({ success: true, sessions_revoked: aantal });
  } catch (err) {
    return fout(err, '2FA resetten');
  }
}

/** POST /admin/api/users/:id/unlock */
export async function handleUnlockUser({ env, user, params, request }) {
  const nee = geenAdmin(user);
  if (nee) return nee;
  try {
    const doel = await laadDoel(env, params.id);
    if (!doel) return json({ success: false, error: 'Gebruiker niet gevonden' }, 404);
    // Een `unlocked`-regel in het logboek IS de ontgrendeling: de teller van
    // checkLockout() begint daarna opnieuw.
    await logAuthEvent(env, {
      event: 'unlocked',
      userId: doel.id,
      email: doel.email,
      meta: requestMeta(request),
      detail: { by: user.email }
    });
    return json({ success: true });
  } catch (err) {
    return fout(err, 'ontgrendelen');
  }
}

const MISLUKT = ['password_failed', 'mfa_failed', 'locked', 'inactive'];

/** GET /admin/api/auth-events?filter=all|failed&limit=200 */
export async function handleGetAuthEvents({ env, user, request }) {
  const nee = geenAdmin(user);
  if (nee) return nee;
  try {
    const url = new URL(request.url);
    const filter = url.searchParams.get('filter') === 'failed' ? 'failed' : 'all';
    const limiet = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 10), 500);
    const supabase = getSupabaseClient(env);

    let q = supabase.from('auth_events').select(AUTH_EVENT_COLUMNS).order('created_at', { ascending: false }).limit(limiet);
    if (filter === 'failed') q = q.in('event', MISLUKT);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    // Wie nu geblokkeerd is: enkel adressen met een mislukte poging in het
    // venster nakijken, met dezelfde regel als bij het inloggen.
    const sinds = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
    const { data: recent, error: recentFout } = await supabase
      .from('auth_events')
      .select('email, user_id')
      .in('event', ['password_failed', 'mfa_failed'])
      .gte('created_at', sinds)
      .not('email', 'is', null)
      .limit(1000);
    if (recentFout) throw new Error(recentFout.message);

    const adressen = [...new Set((recent || []).map(r => r.email))].slice(0, 50);
    const sloten = await Promise.all(adressen.map(async email => ({ email, slot: await checkLockout(env, { email }) })));
    const userIds = {};
    for (const r of recent || []) if (r.user_id) userIds[r.email] = r.user_id;
    const locked = sloten
      .filter(s => s.slot.locked)
      .map(s => ({ email: s.email, user_id: userIds[s.email] || null, until: s.slot.until, failures: s.slot.failures }));

    return json({ success: true, data: { events: (data || []).map(toAuthEventDto), locked } });
  } catch (err) {
    return fout(err, 'logboek');
  }
}
