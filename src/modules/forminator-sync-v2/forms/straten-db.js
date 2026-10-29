/**
 * De straten van een postcode ophalen uit D1 om-core (tabel `straten`, zie
 * forms/straten.js en scripts/postcodes/build-straten.py). Een uur bewaard per
 * isolate. Faalt nooit naar buiten: zonder lijst gaat de straat door zoals ze
 * getypt werd.
 */

import { getCoreDb, hasCoreDb } from '../../../lib/core-db.js';

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

/** @returns {Promise<Array<string|Object>>} leeg als de postcode (of de tabel) er niet is */
export async function stratenVoor(env, land, postcode) {
  const pc = String(postcode || '').trim();
  if (!pc || !hasCoreDb(env)) return [];
  const sleutel = `${land}|${pc}`;
  const hit = cache.get(sleutel);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.namen;
  let namen = [];
  try {
    const { data } = await getCoreDb(env).from('straten').select('namen').eq('land', land).eq('postcode', pc).maybeSingle();
    namen = Array.isArray(data?.namen) ? data.namen : [];
  } catch (err) {
    console.error('[forms] straten', sleutel, err?.message);
    return [];
  }
  if (cache.size > 2000) cache.clear();
  cache.set(sleutel, { t: Date.now(), namen });
  return namen;
}
