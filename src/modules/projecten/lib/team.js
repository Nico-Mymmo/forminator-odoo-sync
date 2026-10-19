/**
 * Projecten -- het team van een manager, voor de teamweekly.
 *
 * Wie bij wiens team hoort, staat in Odoo: `hr.employee.parent_id` is de
 * manager. De OM kent geen eigen teamindeling (dat zou een tweede waarheid
 * zijn). De koppeling OM-gebruiker -> medewerker loopt via
 * src/lib/medewerkers.js (odoo_uid, werkadres, login).
 */

import { searchRead } from '../../../lib/odoo.js';
import { medewerkersVoorGebruikers } from '../../../lib/medewerkers.js';
import { getSupabaseClient } from '../../../lib/database.js';

const TTL_MS = 10 * 60 * 1000;
let cache = null;

/** Per OM-gebruiker: { employee_id, manager_employee_id }. 10 minuten bewaard. */
async function koppelingen(env) {
  if (cache && Date.now() - cache.t < TTL_MS) return cache.map;
  const { data, error } = await getSupabaseClient(env)
    .from('users').select('id, email, odoo_uid, is_active').eq('is_active', true);
  if (error) throw new Error(`Gebruikers lezen: ${error.message}`);
  const gebruikers = data || [];
  const profielen = await medewerkersVoorGebruikers(env, gebruikers);
  const employeeIds = Object.values(profielen).filter(Boolean).map((p) => p.employee_id);
  let managers = {};
  if (employeeIds.length) {
    const rijen = await searchRead(env, {
      model: 'hr.employee', domain: [['id', 'in', employeeIds]], fields: ['id', 'parent_id'], limit: 500,
    });
    managers = Object.fromEntries((rijen || []).map((r) => [r.id, Array.isArray(r.parent_id) ? r.parent_id[0] : null]));
  }
  const map = {};
  for (const g of gebruikers) {
    const p = profielen[g.id];
    map[g.id] = { employee_id: p ? p.employee_id : null, manager_employee_id: p ? managers[p.employee_id] || null : null };
  }
  cache = { t: Date.now(), map };
  return map;
}

/** De OM-gebruikers van wie `userId` in Odoo de manager is. */
export async function teamVan(env, userId) {
  const map = await koppelingen(env);
  const ik = map[userId];
  if (!ik || !ik.employee_id) return [];
  return Object.keys(map).filter((id) => id !== userId && map[id].manager_employee_id === ik.employee_id);
}

/** Alle managers (OM-gebruikers met minstens een teamlid), voor een beheerder. */
export async function managers(env) {
  const map = await koppelingen(env);
  const perEmployee = {};
  for (const id of Object.keys(map)) if (map[id].employee_id) perEmployee[map[id].employee_id] = id;
  const uit = new Set();
  for (const id of Object.keys(map)) {
    const m = map[id].manager_employee_id;
    if (m && perEmployee[m] && perEmployee[m] !== id) uit.add(perEmployee[m]);
  }
  return [...uit];
}
