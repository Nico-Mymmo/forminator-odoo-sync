/**
 * Aanmeldlogboek en tijdelijke blokkering.
 *
 * Elke poging en elke wijziging aan de toegang komt in `auth_events`. Dat is
 * tegelijk het logboek dat Beheer en Profiel -> Beveiliging tonen, en de bron
 * voor de blokkering: er is geen aparte teller die uit de pas kan lopen.
 *
 * @module lib/auth/events
 */

import { getSupabaseClient } from '../database.js';
import { describeUserAgent } from './user-agent.js';

/** Venster waarin mislukte pogingen geteld worden. */
export const LOCK_WINDOW_MS = 15 * 60 * 1000;

/**
 * Na zoveel mislukte pogingen (fout wachtwoord of foute 2FA-code) binnen het
 * venster wordt een ACCOUNT geweigerd, ook met het juiste wachtwoord.
 */
export const LOCK_MAX_PER_ACCOUNT = 5;

/** Idem per IP-adres, over alle accounts samen (iemand die adressen afloopt). */
export const LOCK_MAX_PER_IP = 30;

const MISLUKT = ['password_failed', 'mfa_failed'];

/** Na deze gebeurtenissen begint het tellen opnieuw. */
const NIEUWE_START = ['login', 'unlocked'];

/**
 * Wat elke gebeurtenis betekent, zoals ze in het scherm staat. EEN plek: de
 * server stuurt `label` en `tone` mee, de schermen vertalen niets zelf.
 */
export const EVENT_LABELS = {
  password_ok: ['Wachtwoord juist, wacht op 2FA', 'neutral'],
  password_failed: ['Fout wachtwoord', 'error'],
  mfa_failed: ['Foute 2FA-code', 'error'],
  login: ['Ingelogd', 'success'],
  locked: ['Geweigerd: tijdelijk geblokkeerd', 'error'],
  inactive: ['Geweigerd: account gedeactiveerd', 'warning'],
  logout: ['Uitgelogd', 'neutral'],
  mfa_enrolled: ['2FA ingesteld', 'success'],
  mfa_reset: ['2FA gereset door beheerder', 'warning'],
  recovery_used: ['Herstelcode gebruikt', 'warning'],
  recovery_regenerated: ['Nieuwe herstelcodes gemaakt', 'neutral'],
  password_changed: ['Wachtwoord gewijzigd', 'neutral'],
  password_reset: ['Wachtwoord gereset door beheerder', 'warning'],
  session_revoked: ['Sessie beëindigd', 'neutral'],
  sessions_revoked: ['Sessies beëindigd', 'warning'],
  unlocked: ['Ontgrendeld door beheerder', 'neutral'],
  account_created: ['Account aangemaakt', 'neutral'],
  account_deactivated: ['Account gedeactiveerd', 'warning'],
  account_activated: ['Account geactiveerd', 'neutral']
};

/**
 * Herkomst van een verzoek: IP, browser en (van Cloudflare) land en stad.
 *
 * @param {Request} request
 * @returns {{ ip_address: string|null, user_agent: string|null, country: string|null, city: string|null }}
 */
export function requestMeta(request) {
  const cf = request?.cf || {};
  return {
    ip_address: request?.headers?.get('CF-Connecting-IP') || null,
    user_agent: (request?.headers?.get('User-Agent') || '').slice(0, 500) || null,
    country: cf.country || null,
    city: cf.city || null
  };
}

/**
 * Een gebeurtenis bewaren. Faalt nooit naar buiten: een logboek dat niet
 * schrijft mag niemand het inloggen beletten (de blokkering wordt dan wel
 * soepeler, en dat staat in de log).
 *
 * @param {object} env
 * @param {{ event: string, userId?: string|null, email?: string|null, meta?: object, detail?: object|null }} e
 */
export async function logAuthEvent(env, { event, userId = null, email = null, meta = {}, detail = null }) {
  try {
    const { error } = await getSupabaseClient(env).from('auth_events').insert({
      event,
      user_id: userId,
      email: email ? String(email).trim().toLowerCase() : null,
      ip_address: meta.ip_address || null,
      user_agent: meta.user_agent || null,
      country: meta.country || null,
      city: meta.city || null,
      detail
    });
    if (error) console.error('[auth] logboek schrijven mislukt:', event, error.message);
  } catch (err) {
    console.error('[auth] logboek schrijven mislukt:', event, err?.message);
  }
}

/**
 * Is dit account (of dit IP-adres) nu geblokkeerd?
 *
 * Per account: de mislukte pogingen SINDS de laatste geslaagde login of
 * ontgrendeling, binnen het venster. Het account gaat vanzelf weer open
 * zodra de vijfde jongste poging ouder is dan het venster (`until`).
 *
 * @param {object} env
 * @param {{ email?: string|null, ip?: string|null }} wie
 * @returns {Promise<{ locked: boolean, scope?: 'account'|'ip', until?: string, failures: number }>}
 */
export async function checkLockout(env, { email = null, ip = null }) {
  const supabase = getSupabaseClient(env);
  const sinds = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  let fouten = [];

  if (email) {
    const { data, error } = await supabase
      .from('auth_events')
      .select('event, created_at')
      .eq('email', String(email).trim().toLowerCase())
      .in('event', [...MISLUKT, ...NIEUWE_START])
      .gte('created_at', sinds)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) console.error('[auth] blokkering nakijken mislukt:', error.message);
    for (const r of data || []) {
      if (NIEUWE_START.includes(r.event)) break;
      fouten.push(r.created_at);
    }
    if (fouten.length >= LOCK_MAX_PER_ACCOUNT) {
      const until = new Date(new Date(fouten[LOCK_MAX_PER_ACCOUNT - 1]).getTime() + LOCK_WINDOW_MS);
      return { locked: true, scope: 'account', until: until.toISOString(), failures: fouten.length };
    }
  }

  if (ip) {
    const { count, error } = await supabase
      .from('auth_events')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .in('event', MISLUKT)
      .gte('created_at', sinds);
    if (error) console.error('[auth] blokkering per IP nakijken mislukt:', error.message);
    if ((count || 0) >= LOCK_MAX_PER_IP) {
      return {
        locked: true,
        scope: 'ip',
        until: new Date(Date.now() + LOCK_WINDOW_MS).toISOString(),
        failures: count
      };
    }
  }

  return { locked: false, failures: fouten.length };
}

/**
 * De vorm waarin een gebeurtenis naar een scherm gaat.
 *
 * @param {object} row
 * @returns {object}
 */
export function toAuthEventDto(row) {
  const [label, tone] = EVENT_LABELS[row.event] || [row.event, 'neutral'];
  return {
    id: row.id,
    event: row.event,
    label,
    tone,
    email: row.email || null,
    user_id: row.user_id || null,
    created_at: row.created_at,
    ip: row.ip_address || null,
    location: [row.city, row.country].filter(Boolean).join(', ') || null,
    device: row.user_agent ? describeUserAgent(row.user_agent) : null,
    detail: row.detail || null
  };
}

/** Kolommen die toAuthEventDto() nodig heeft. */
export const AUTH_EVENT_COLUMNS = 'id, event, user_id, email, ip_address, user_agent, country, city, detail, created_at';

/**
 * Het aanmeldlogboek van een gebruiker: op id, en op e-mailadres voor wat
 * gelogd werd voor de gebruiker gekend was (een geweigerde poging).
 *
 * @param {object} env @param {{ id: string, email: string }} user @param {number} [limiet=25]
 * @returns {Promise<object[]>} toAuthEventDto-vorm
 */
export async function listUserAuthEvents(env, user, limiet = 25) {
  const email = String(user.email || '').trim().toLowerCase().replace(/"/g, '');
  const { data, error } = await getSupabaseClient(env)
    .from('auth_events')
    .select(AUTH_EVENT_COLUMNS)
    .or(`user_id.eq.${user.id},email.eq."${email}"`)
    .order('created_at', { ascending: false })
    .limit(limiet);
  if (error) throw new Error(`Aanmeldingen ophalen mislukt: ${error.message}`);
  return (data || []).map(toAuthEventDto);
}
