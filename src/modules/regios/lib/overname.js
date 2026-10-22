/**
 * Regio's -- de gegevens van de mini-app "Regio's" overnemen.
 *
 * De mini-app bewaarde in haar gedeelde opslag (Durable Object, via
 * mini-apps/lib/storage.js -- de enige toegang ertoe):
 *  - collection 'syndicoaches': items {id, value: '{"naam","kleur"}'}
 *  - key 'toewijzingen':          '{"<postcode>": "<syndicoach-id>"}'
 *  - key 'handmatige_postcodes':  '{"<nis>": ["<postcode>", ...]}'
 *
 * De id's van de syndicoaches blijven behouden. De opslag van de mini-app
 * wordt enkel GELEZEN: ze blijft staan als back-up.
 *
 * Automatisch: de eerste keer dat de module geopend wordt en nog leeg is
 * (ensureOvername). Daarna enkel nog op vraag van een beheerder, en dan
 * vervangt het wat er in de module staat.
 */

import { listCollectionItems, getStorageValue } from '../../mini-apps/lib/storage.js';
import { MINI_APP_ID, LOG_PREFIX, KLEUR_RE, normaliseerPostcode, MAX_NAAM } from './constants.js';
import { listSyndicoaches, getMeta, zetMeta, wisAlles, schrijfRijen, log, naamVanGebruiker } from './store.js';

function leesJson(tekst, terugval) {
  if (!tekst) return terugval;
  try { return JSON.parse(tekst); } catch { return terugval; }
}

export async function leesMiniApp(env) {
  const [items, toewRuw, extraRuw] = await Promise.all([
    listCollectionItems(env, MINI_APP_ID, 'syndicoaches'),
    getStorageValue(env, MINI_APP_ID, 'toewijzingen'),
    getStorageValue(env, MINI_APP_ID, 'handmatige_postcodes'),
  ]);
  const syndicoaches = (items || []).map((it, i) => {
    const v = leesJson(it.value, {});
    return {
      id: String(it.id),
      naam: String(v.naam || 'Zonder naam').trim().slice(0, MAX_NAAM) || 'Zonder naam',
      kleur: KLEUR_RE.test(String(v.kleur || '')) ? String(v.kleur).toLowerCase() : '#999999',
      position: i,
    };
  });
  const ids = new Set(syndicoaches.map((s) => s.id));
  const toewijzingen = leesJson(toewRuw, {});
  const postcodes = [];
  let zonderSyndicoach = 0;
  Object.keys(toewijzingen || {}).forEach((ruw) => {
    const pc = normaliseerPostcode(ruw);
    const sid = String(toewijzingen[ruw] || '');
    if (!pc) return;
    if (!ids.has(sid)) { zonderSyndicoach++; return; }
    postcodes.push({ postcode: pc, syndicoach_id: sid });
  });
  const extra = [];
  const extraRuwObj = leesJson(extraRuw, {});
  Object.keys(extraRuwObj || {}).forEach((nis) => {
    (Array.isArray(extraRuwObj[nis]) ? extraRuwObj[nis] : []).forEach((ruw) => {
      const pc = normaliseerPostcode(ruw);
      if (pc && /^[0-9]{5}$/.test(nis)) extra.push({ postcode: pc, nis });
    });
  });
  return { syndicoaches, postcodes, extra, zonderSyndicoach };
}

export async function neemOver(env, user) {
  const bron = await leesMiniApp(env);
  await wisAlles(env);
  await schrijfRijen(env, 'regio_syndicoaches', bron.syndicoaches.map((s) => ({ ...s, created_by: user?.id || null })));
  await schrijfRijen(env, 'regio_postcodes', bron.postcodes.map((p) => ({ ...p, updated_by: user?.id || null })));
  await schrijfRijen(env, 'regio_extra_postcodes', bron.extra.map((p) => ({ ...p, created_by: user?.id || null })));
  const verslag = {
    at: new Date().toISOString(),
    door: user ? naamVanGebruiker(user) : 'systeem',
    syndicoaches: bron.syndicoaches.length,
    postcodes: bron.postcodes.length,
    extra_postcodes: bron.extra.length,
    zonder_syndicoach: bron.zonderSyndicoach,
  };
  await zetMeta(env, 'overname', verslag);
  await log(env, user, 'overname',
    `Overgenomen uit de mini-app: ${verslag.syndicoaches} syndicoaches, ${verslag.postcodes} postcodes`, verslag.postcodes);
  return verslag;
}

/**
 * De eerste keer: de module is leeg en er is nog niets overgenomen. Faalt
 * stil (met een logregel): de pagina toont dan gewoon een lege kaart en een
 * beheerder kan de overname nog met de hand starten.
 */
export async function ensureOvername(env, user) {
  if (!env.MINI_APP_STORAGE) return null;
  try {
    if (await getMeta(env, 'overname')) return null;
    if ((await listSyndicoaches(env)).length) return null;
    return await neemOver(env, user);
  } catch (err) {
    console.error(LOG_PREFIX, 'automatische overname', err);
    return null;
  }
}
