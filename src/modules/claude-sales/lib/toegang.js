/**
 * Wie gebruikt de connector, en mag dat?
 *
 * Elke aanroep van de connector draagt een token; dat token hoort bij een
 * OM-gebruiker. Hier: die gebruiker ophalen, nakijken dat hij actief is en de
 * module heeft, en zijn Odoo-gebruiker vinden (voor de naam in de chatter).
 *
 * Een minuut bewaard per isolate: een gesprek in Claude doet al snel tien
 * aanroepen na elkaar, en die hoeven niet elk naar Supabase. Een gebruiker die
 * gedeactiveerd wordt, verliest zijn toegang dus binnen een minuut.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { executeKw } from '../../../lib/odoo.js';
import { MODULE_CODE, LOG_PREFIX } from './constants.js';

const BEWAAR_MS = 60 * 1000;
const cache = new Map(); // userId -> { t, gebruiker }

/**
 * @returns {Promise<{id, email, naam, is_admin, toegang, odoo_uid}|null>}
 *   null als de gebruiker niet (meer) bestaat of niet actief is.
 */
export async function gebruikerVoorConnector(env, userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.t < BEWAAR_MS) return hit.gebruiker;

  const supabase = getSupabaseClient(env);
  const [{ data: u, error }, { data: rechten }] = await Promise.all([
    supabase.from('users')
      .select('id, email, full_name, username, role, is_active, odoo_uid')
      .eq('id', userId).maybeSingle(),
    supabase.from('user_modules')
      .select('is_enabled, module:modules!inner (code, is_active)')
      .eq('user_id', userId).eq('is_enabled', true).eq('module.code', MODULE_CODE),
  ]);
  if (error) throw new Error('Gebruiker ophalen mislukt: ' + error.message);
  if (!u || !u.is_active) { cache.delete(userId); return null; }

  const isAdmin = u.role === 'admin';
  const heeftModule = (rechten || []).some((r) => r.module && r.module.is_active !== false);
  const gebruiker = {
    id: u.id,
    email: u.email,
    naam: u.full_name || u.username || String(u.email || '').split('@')[0],
    is_admin: isAdmin,
    toegang: isAdmin || heeftModule,
    odoo_uid: Number.isInteger(u.odoo_uid) && u.odoo_uid > 0 ? u.odoo_uid : null,
  };
  cache.set(userId, { t: Date.now(), gebruiker });
  return gebruiker;
}

/** Een gewone sessiegebruiker (uit validateSession) heeft de module? */
export function sessieHeeftToegang(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.modules || []).some((um) => um.module && um.module.code === MODULE_CODE);
}

const odooCache = new Map(); // userId -> { t, odoo }

/**
 * De Odoo-gebruiker van een OM-gebruiker: `users.odoo_uid`, anders de
 * res.users met dat adres als login. Geeft { uid, partner_id, naam } of null.
 * Met de partner zet de connector de naam van de medewerker als auteur in de
 * chatter, en niet "Administrator".
 */
export async function odooGebruiker(env, gebruiker) {
  const hit = odooCache.get(gebruiker.id);
  if (hit && Date.now() - hit.t < 10 * BEWAAR_MS) return hit.odoo;
  let odoo = null;
  try {
    let rijen = [];
    if (gebruiker.odoo_uid) {
      rijen = await executeKw(env, {
        model: 'res.users', method: 'read',
        args: [[gebruiker.odoo_uid]], kwargs: { fields: ['name', 'partner_id'] },
      });
    }
    if (!rijen.length && gebruiker.email) {
      rijen = await executeKw(env, {
        model: 'res.users', method: 'search_read',
        args: [[['login', '=ilike', gebruiker.email]]],
        kwargs: { fields: ['name', 'partner_id'], limit: 1 },
      });
    }
    const r = rijen[0];
    if (r) odoo = { uid: r.id, partner_id: Array.isArray(r.partner_id) ? r.partner_id[0] : null, naam: r.name };
  } catch (err) {
    console.error(LOG_PREFIX, 'Odoo-gebruiker niet gevonden', err?.message);
  }
  odooCache.set(gebruiker.id, { t: Date.now(), odoo });
  return odoo;
}
