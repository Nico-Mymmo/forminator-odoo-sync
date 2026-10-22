/**
 * Regio's -- een regel uit het logboek ongedaan maken.
 *
 * Elke regel bewaart in `details` de toestand ERVOOR (zie lib/store.js). Wat
 * sindsdien opnieuw veranderde (iemand gaf dezelfde postcode al aan een ander),
 * wordt standaard NIET teruggezet: zo maak je nooit blind het werk van een
 * collega ongedaan. Met { alles: true } gebeurt het toch.
 *
 * Ongedaan maken is zelf een regel in het logboek (soort 'ongedaan'), en de
 * oorspronkelijke regel krijgt ongedaan_at/_door. Een regel kan maar een keer
 * ongedaan gemaakt worden.
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { RegioError } from './constants.js';
import {
  getWijziging, kanOngedaan, huidigeEigenaars, listSyndicoaches, getSyndicoach,
  schrijfRijen, verwijderPostcodes, log, naamVanGebruiker,
} from './store.js';

const db = (env) => getCoreDb(env);

function check(res, wat) {
  if (res?.error) throw new Error(`${wat}: ${res.error.message}`);
  return res?.data;
}

async function eisRegel(env, id) {
  const rij = await getWijziging(env, id);
  if (!rij) throw new RegioError('Logboekregel niet gevonden.', 404);
  return rij;
}

/** De regel met per postcode: ervoor, erna, en hoe het NU staat. */
export async function toonWijziging(env, id) {
  const rij = await eisRegel(env, id);
  const d = rij.details || {};
  const lijst = Array.isArray(d.postcodes) ? d.postcodes : [];
  const nu = await huidigeEigenaars(env, lijst.map((w) => w.pc));
  const alle = await listSyndicoaches(env);
  const bestaat = new Set(alle.map((s) => s.id));
  const namen = { ...(d.namen || {}) };
  alle.forEach((s) => { namen[s.id] = s.naam; });
  const postcodes = lijst.map((w) => ({
    pc: w.pc, van: w.van || null, naar: w.naar || null, nu: nu[w.pc] || null,
    gewijzigd: (nu[w.pc] || null) !== (w.naar || null),
    van_bestaat_niet: !!w.van && !bestaat.has(w.van) && !(d.syndicoach_voor && d.syndicoach_voor.id === w.van),
  }));
  return {
    id: rij.id, soort: rij.soort, tekst: rij.tekst, user_naam: rij.user_naam, created_at: rij.created_at,
    ongedaan_at: rij.ongedaan_at, ongedaan_door: rij.ongedaan_door,
    kan_ongedaan: kanOngedaan(rij),
    postcodes,
    gewijzigd_aantal: postcodes.filter((p) => p.gewijzigd).length,
    syndicoach_voor: d.syndicoach_voor || null,
    syndicoach_na: d.syndicoach_na || null,
    nieuwe_syndicoaches: (d.nieuwe_syndicoaches || []).map((sid) => ({ id: sid, naam: namen[sid] || '?', bestaat: bestaat.has(sid) })),
    extra_postcode: d.extra_postcode || null,
    namen,
  };
}

async function uniekeNaam(env, naam, behalveId) {
  const alle = await listSyndicoaches(env);
  const bezet = (n) => alle.some((s) => s.id !== behalveId && s.naam.toLowerCase() === n.toLowerCase());
  if (!bezet(naam)) return naam;
  for (let i = 2; i < 50; i++) {
    const kandidaat = `${naam} (${i})`.slice(0, 60);
    if (!bezet(kandidaat)) return kandidaat;
  }
  return `${naam} (terug)`.slice(0, 60);
}

export async function maakOngedaan(env, id, user, { alles = false } = {}) {
  const rij = await eisRegel(env, id);
  if (!kanOngedaan(rij)) {
    throw new RegioError(rij.ongedaan_at ? 'Deze wijziging is al ongedaan gemaakt.' : 'Deze wijziging kan niet ongedaan gemaakt worden.', 409);
  }
  const d = rij.details || {};
  const gedaan = []; // [{pc, van, naar}] -- wat het ongedaan maken veranderde
  const zinnen = [];
  let overgeslagen = 0;
  let nietMeer = 0;

  // 1. Een verwijderde syndicoach komt terug, met hetzelfde id.
  if (d.syndicoach_voor && !d.syndicoach_na) {
    const s = d.syndicoach_voor;
    if (!(await getSyndicoach(env, s.id))) {
      const naam = await uniekeNaam(env, s.naam, s.id);
      check(await db(env).from('regio_syndicoaches').insert({
        id: s.id, naam, kleur: s.kleur, position: s.position || 0, created_by: s.created_by || null,
      }), 'Syndicoach terugzetten');
      zinnen.push(`syndicoach "${naam}" terug`);
    }
  }

  // 2. Een gewijzigde syndicoach krijgt haar naam en kleur terug.
  if (d.syndicoach_voor && d.syndicoach_na) {
    const s = await getSyndicoach(env, d.syndicoach_voor.id);
    if (!s) throw new RegioError('Deze syndicoach bestaat niet meer.', 409);
    const naam = await uniekeNaam(env, d.syndicoach_voor.naam, s.id);
    check(await db(env).from('regio_syndicoaches').update({ naam, kleur: d.syndicoach_voor.kleur }).eq('id', s.id), 'Syndicoach terugzetten');
    zinnen.push(`syndicoach "${s.naam}" terug naar "${naam}"`);
  }

  // 3. De postcodes naar hoe ze ervoor stonden.
  const lijst = Array.isArray(d.postcodes) ? d.postcodes : [];
  if (lijst.length) {
    const nu = await huidigeEigenaars(env, lijst.map((w) => w.pc));
    const bestaat = new Set((await listSyndicoaches(env)).map((s) => s.id));
    const terug = [];
    lijst.forEach((w) => {
      const huidig = nu[w.pc] || null;
      const doel = w.van || null;
      if (huidig === doel) return;
      if (huidig !== (w.naar || null) && !alles) { overgeslagen++; return; }
      if (doel && !bestaat.has(doel)) { nietMeer++; return; }
      terug.push({ pc: w.pc, van: huidig, naar: doel });
    });
    await schrijfRijen(env, 'regio_postcodes', terug.filter((w) => w.naar).map((w) => ({
      postcode: w.pc, syndicoach_id: w.naar, updated_by: user?.id || null,
    })));
    await verwijderPostcodes(env, terug.filter((w) => !w.naar).map((w) => w.pc));
    gedaan.push(...terug);
    if (terug.length) zinnen.push(`${terug.length} postcode(s) teruggezet`);
  }

  // 4. Wat een import of "toevoegen" nieuw maakte, gaat weg (met zijn postcodes).
  const weg = [];
  if (d.syndicoach_na && !d.syndicoach_voor) weg.push(d.syndicoach_na.id);
  (d.nieuwe_syndicoaches || []).forEach((sid) => weg.push(sid));
  for (const sid of weg) {
    const s = await getSyndicoach(env, sid);
    if (!s) continue;
    const pcs = (check(await db(env).from('regio_postcodes').select('postcode').eq('syndicoach_id', sid), 'Postcodes lezen') || []).map((r) => r.postcode);
    // Kreeg hij sindsdien postcodes, dan blijft hij (tenzij alles).
    if (pcs.length && !alles) { overgeslagen += pcs.length; continue; }
    await verwijderPostcodes(env, pcs);
    pcs.forEach((pc) => gedaan.push({ pc, van: sid, naar: null }));
    check(await db(env).from('regio_syndicoaches').delete().eq('id', sid), 'Syndicoach verwijderen');
    zinnen.push(`syndicoach "${s.naam}" verwijderd`);
  }

  // 5. Een met de hand toegevoegde postcode gaat weg.
  if (d.extra_postcode) {
    check(await db(env).from('regio_extra_postcodes').delete().eq('postcode', d.extra_postcode.postcode), 'Postcode verwijderen');
    zinnen.push(`postcode ${d.extra_postcode.postcode} uit gemeente ${d.extra_postcode.nis} gehaald`);
  }

  const nuTijd = new Date().toISOString();
  check(await db(env).from('regio_wijzigingen').update({ ongedaan_at: nuTijd, ongedaan_door: naamVanGebruiker(user) }).eq('id', rij.id), 'Logboek bijwerken');
  const extraTekst = [
    overgeslagen ? `${overgeslagen} overgeslagen (sindsdien opnieuw gewijzigd)` : '',
    nietMeer ? `${nietMeer} niet terug te zetten (syndicoach bestaat niet meer)` : '',
  ].filter(Boolean).join(', ');
  await log(env, user, 'ongedaan',
    `Ongedaan gemaakt: "${rij.tekst}"` + (zinnen.length ? ` -- ${zinnen.join(', ')}` : '') + (extraTekst ? ` (${extraTekst})` : ''),
    gedaan.length,
    { postcodes: gedaan, namen: d.namen || {} },
    { ongedaan_van: rij.id });
  return { teruggezet: gedaan.length, overgeslagen, niet_meer: nietMeer };
}
