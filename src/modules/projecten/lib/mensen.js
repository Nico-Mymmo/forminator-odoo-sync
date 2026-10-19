/**
 * Projecten -- wie er een taak kan krijgen: de actieve OM-gebruikers, met hun
 * naam en foto uit Odoo (src/lib/medewerkers.js, zie CLAUDE.md "Medewerkers").
 *
 * De lijst wordt 10 minuten in het geheugen van de isolate bewaard: elke
 * pagina van de module vraagt ze, en ze verandert zelden.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { medewerkersVoorGebruikers, naamVoor, voornaamVan } from '../../../lib/medewerkers.js';

const TTL_MS = 10 * 60 * 1000;
let cache = null;

export async function mensen(env) {
  if (cache && Date.now() - cache.t < TTL_MS) return cache.lijst;
  const { data, error } = await getSupabaseClient(env)
    .from('users').select('id, email, full_name, odoo_uid, is_active').eq('is_active', true);
  if (error) throw new Error(`Gebruikers lezen: ${error.message}`);
  const gebruikers = data || [];
  let profielen = {};
  try { profielen = await medewerkersVoorGebruikers(env, gebruikers); } catch (err) {
    console.error('[projecten] medewerkers', err);
  }
  const lijst = gebruikers.map((g) => {
    const p = profielen[g.id] || null;
    const naam = naamVoor(p, g);
    return {
      id: g.id,
      naam,
      voornaam: voornaamVan(naam),
      email: g.email,
      functie: p?.functie || '',
      foto_url: p?.foto_url || '',
    };
  }).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  cache = { t: Date.now(), lijst };
  return lijst;
}

export async function naamVan(env, id) {
  if (!id) return null;
  const p = (await mensen(env)).find((m) => m.id === id);
  return p ? p.naam : 'onbekende collega';
}
