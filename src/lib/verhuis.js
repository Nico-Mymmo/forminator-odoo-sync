/**
 * De verhuis van Supabase naar D1 om-core, tabel per tabel.
 *
 * Plan: docs/plan-supabase-uitfaseren.md. Scherm: Beheer -> Verhuis
 * (public/admin-verhuis.js, routes in src/modules/admin/verhuis-routes.js).
 *
 * Per tabel drie stappen, elk met een knop:
 *
 *  1. KOPIEREN. De tabel in om-core wordt leeggemaakt en opnieuw gevuld met
 *     wat er in Supabase staat. Mag zo vaak als nodig: zolang de tabel niet
 *     overgeschakeld is, is om-core enkel een kopie en leest of schrijft de
 *     module nog in Supabase.
 *  2. OVERSCHAKELEN. Enkel als het aantal rijen en het laatste updated_at aan
 *     beide kanten gelijk zijn (anders is er sinds het kopieren iets gewijzigd:
 *     eerst opnieuw kopieren). Vanaf dan leest en schrijft de module in
 *     om-core. Zonder deploy: de module vraagt bij elke aanvraag `dbVoor()`.
 *  3. TERUGZETTEN. De noodrem: de module gaat terug naar Supabase. Wat er
 *     sinds het overschakelen in om-core gewijzigd is, staat NIET in Supabase;
 *     het scherm zegt dat voor je drukt.
 *
 * Een module verhuist door in haar opslagcode `getSupabaseClient(env)` te
 * vervangen door `await dbVoor(env, '<tabel>')` en de tabel hieronder in
 * VERHUISBAAR te zetten. Na twee weken zonder problemen gaat die omweg er weer
 * uit (rechtstreeks getCoreDb) en verdwijnt de tabel uit Supabase.
 */

import { getSupabaseClient } from './database.js';
import { getCoreDb, hasCoreDb } from './core-db.js';

/**
 * Tabellen die verhuisd mogen worden. `uitgesteld`: kolommen die naar een
 * rij in DEZELFDE tabel wijzen (een boom). Die worden in een tweede ronde
 * ingevuld, anders weigert de foreign key een kind dat voor zijn ouder komt.
 */
export const VERHUISBAAR = {
  product_features: { module: 'Productfeatures', sleutel: 'id', uitgesteld: ['parent_id'] },
};

const LOG = 'core_migratie_log';

// De bron. `env.VERHUIS_BRON` bestaat enkel in src/lib/tests/verhuis-test.mjs,
// waar een tweede SQLite-databank Supabase speelt.
const bron = (env) => env.VERHUIS_BRON || getSupabaseClient(env);
const PAGINA = 500;

export class VerhuisFout extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function cfgVoor(tabel) {
  const cfg = VERHUISBAAR[tabel];
  if (!cfg) throw new VerhuisFout(`Tabel "${tabel}" staat niet op de verhuislijst.`, 404);
  return cfg;
}

async function logRij(env, tabel) {
  if (!hasCoreDb(env)) return null;
  return await env.CORE_DB.prepare(`SELECT * FROM ${LOG} WHERE tabel = ?`).bind(tabel).first();
}

async function schrijfLog(env, tabel, velden) {
  const v = { status: null, rijen_bron: null, rijen_doel: null, laatste_cursor: null, fout: null, ...velden };
  await env.CORE_DB.prepare(
    `INSERT INTO ${LOG} (tabel, status, rijen_bron, rijen_doel, laatste_cursor, fout, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT (tabel) DO UPDATE SET status = excluded.status, rijen_bron = excluded.rijen_bron,
       rijen_doel = excluded.rijen_doel, laatste_cursor = excluded.laatste_cursor, fout = excluded.fout,
       updated_at = excluded.updated_at`
  ).bind(tabel, v.status, v.rijen_bron, v.rijen_doel, v.laatste_cursor, v.fout).run();
}

/**
 * De databank voor deze tabel: om-core als ze overgeschakeld is, anders
 * Supabase. Bewust zonder cache: een cache per isolate zou na het
 * overschakelen nog een tijd in Supabase laten schrijven, en dan raakt een
 * wijziging zoek. Het kost een kleine D1-query per aanvraag.
 */
export async function dbVoor(env, tabel) {
  if (hasCoreDb(env)) {
    const rij = await logRij(env, tabel).catch(() => null);
    if (rij && rij.status === 'live') return getCoreDb(env);
  }
  return bron(env);
}

async function telSupabase(env, tabel) {
  const { count, error } = await bron(env).from(tabel).select('*', { count: 'exact', head: true });
  if (error) throw new VerhuisFout(`Supabase tellen (${tabel}): ${error.message}`, 500);
  return count || 0;
}

async function telCore(env, tabel) {
  const r = await env.CORE_DB.prepare(`SELECT COUNT(*) AS n FROM "${tabel}"`).first();
  return Number(r?.n || 0);
}

/** Het laatste updated_at aan een kant, als de tabel die kolom heeft. */
async function laatsteWijziging(env, tabel) {
  const kol = await getCoreDb(env).kolommen(tabel);
  if (!kol.has('updated_at')) return { bron: null, doel: null };
  const { data, error } = await bron(env).from(tabel).select('updated_at')
    .order('updated_at', { ascending: false }).limit(1);
  if (error) throw new VerhuisFout(`Supabase lezen (${tabel}): ${error.message}`, 500);
  const doel = await env.CORE_DB.prepare(`SELECT MAX(updated_at) AS m FROM "${tabel}"`).first();
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  return { bron: iso(data?.[0]?.updated_at), doel: iso(doel?.m) };
}

/** Stand van elke tabel op de verhuislijst, met de tellingen van nu. */
export async function overzicht(env) {
  if (!hasCoreDb(env)) throw new VerhuisFout('De nieuwe databank (CORE_DB) is niet gekoppeld.', 500);
  const uit = [];
  for (const [tabel, cfg] of Object.entries(VERHUISBAAR)) {
    const log = await logRij(env, tabel);
    let nBron = null, nDoel = null, fout = null;
    try { nBron = await telSupabase(env, tabel); } catch (e) { fout = e.message; }
    try { nDoel = await telCore(env, tabel); } catch (e) { fout = fout || `om-core: ${e.message}`; }
    uit.push({
      tabel, module: cfg.module,
      status: log?.status || 'nog niet',
      rijen_supabase: nBron, rijen_core: nDoel,
      gewijzigd: log?.updated_at || null,
      fout: fout || log?.fout || null,
    });
  }
  return uit;
}

/** Stap 1: om-core leegmaken en vullen met wat er in Supabase staat. */
export async function kopieer(env, tabel) {
  const cfg = cfgVoor(tabel);
  const log = await logRij(env, tabel);
  if (log?.status === 'live') {
    throw new VerhuisFout('Deze tabel is al overgeschakeld: kopieren zou de nieuwe gegevens overschrijven met de oude.', 409);
  }
  const core = getCoreDb(env);
  const kol = await core.kolommen(tabel);
  await schrijfLog(env, tabel, { status: 'bezig' });

  try {
    // Leegmaken mag hier zonder filter: dit is een kopie die nog niemand gebruikt.
    await env.CORE_DB.prepare(`DELETE FROM "${tabel}"`).run();

    const supabase = bron(env);
    const later = []; // [sleutelwaarde, { kolom: waarde }]
    let vanaf = 0;
    for (;;) {
      const { data, error } = await supabase.from(tabel).select('*')
        .order(cfg.sleutel).range(vanaf, vanaf + PAGINA - 1);
      if (error) throw new VerhuisFout(`Supabase lezen: ${error.message}`, 500);
      const rijen = data || [];
      if (!rijen.length) break;

      const klaar = rijen.map((rij) => {
        const r = {};
        Object.keys(rij).forEach((k) => { if (kol.has(k)) r[k] = rij[k]; });
        const uit = {};
        (cfg.uitgesteld || []).forEach((k) => {
          if (r[k] != null) uit[k] = r[k];
          r[k] = null;
        });
        if (Object.keys(uit).length) later.push([rij[cfg.sleutel], uit]);
        return r;
      });
      const { error: fout } = await core.from(tabel).insert(klaar);
      if (fout) throw new VerhuisFout(`om-core schrijven: ${fout.message}`, 500);

      vanaf += rijen.length;
      if (rijen.length < PAGINA) break;
    }

    // Tweede ronde: de verwijzingen binnen de tabel, nu elke rij bestaat.
    // Rechtstreeks op D1 en niet via core.from().update(): die zou updated_at
    // op "nu" zetten, en dan klopt de controle bij het overschakelen niet meer.
    const stmts = later.map(([sleutel, velden]) => {
      const namen = Object.keys(velden);
      return env.CORE_DB.prepare(
        `UPDATE "${tabel}" SET ${namen.map((n) => `"${n}" = ?`).join(', ')} WHERE "${cfg.sleutel}" = ?`
      ).bind(...namen.map((n) => velden[n]), sleutel);
    });
    for (let i = 0; i < stmts.length; i += 50) await env.CORE_DB.batch(stmts.slice(i, i + 50));

    const nBron = await telSupabase(env, tabel);
    const nDoel = await telCore(env, tabel);
    const gelijk = nBron === nDoel;
    await schrijfLog(env, tabel, {
      status: gelijk ? 'gekopieerd' : 'fout',
      rijen_bron: nBron, rijen_doel: nDoel,
      fout: gelijk ? null : `Aantallen verschillen: ${nBron} in Supabase, ${nDoel} in om-core.`,
    });
    return { tabel, rijen_supabase: nBron, rijen_core: nDoel, gelijk };
  } catch (e) {
    await schrijfLog(env, tabel, { status: 'fout', fout: String(e.message || e).slice(0, 1000) });
    throw e;
  }
}

/** Stap 2: de module gaat lezen en schrijven in om-core. */
export async function schakelOver(env, tabel) {
  cfgVoor(tabel);
  const log = await logRij(env, tabel);
  if (log?.status === 'live') return { tabel, status: 'live' };
  if (log?.status !== 'gekopieerd') throw new VerhuisFout('Kopieer de tabel eerst (en zonder fout).', 409);
  const nBron = await telSupabase(env, tabel);
  const nDoel = await telCore(env, tabel);
  const laatst = await laatsteWijziging(env, tabel);
  if (nBron !== nDoel || laatst.bron !== laatst.doel) {
    throw new VerhuisFout(
      'Sinds het kopieren is er in Supabase iets gewijzigd' +
      ` (${nBron} tegenover ${nDoel} rijen, laatste wijziging ${laatst.bron || '-'} tegenover ${laatst.doel || '-'}).` +
      ' Kopieer opnieuw en schakel dan over.', 409);
  }
  await schrijfLog(env, tabel, { status: 'live', rijen_bron: nBron, rijen_doel: nDoel });
  return { tabel, status: 'live' };
}

/** Stap 3, de noodrem: de module gaat terug naar Supabase. */
export async function zetTerug(env, tabel) {
  cfgVoor(tabel);
  const log = await logRij(env, tabel);
  if (log?.status !== 'live') throw new VerhuisFout('Deze tabel is niet overgeschakeld.', 409);
  await schrijfLog(env, tabel, {
    status: 'teruggezet',
    rijen_bron: log.rijen_bron, rijen_doel: log.rijen_doel,
    fout: 'Teruggezet naar Supabase. Wat er sinds het overschakelen in om-core gewijzigd is, staat niet in Supabase.',
  });
  return { tabel, status: 'teruggezet' };
}
