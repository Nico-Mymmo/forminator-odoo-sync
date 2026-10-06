/**
 * Toegang tot D1 "om-sales": de spiegel van de verkoopgegevens uit Odoo.
 *
 * Anders dan WEB_EVENTS (src/lib/web-events.js) BEZIT de OM deze database: de
 * sync in src/modules/dashboards/lib/sales/sync.js is de enige schrijver. Lezen
 * mag overal; schrijven loopt via upsertRows()/deleteMissing() zodat elke
 * schrijfactie hier langs komt.
 *
 * Binding: SALES_DB in wrangler.jsonc. Schema: d1/om-sales/migrations/.
 */

export function hasSalesDb(env) {
  return !!env.SALES_DB;
}

function db(env) {
  if (!env.SALES_DB) throw new Error('SALES_DB-binding ontbreekt (D1 om-sales).');
  return env.SALES_DB;
}

/** @returns {Promise<Array<object>>} */
export async function readSales(env, sql, params = []) {
  if (!/^\s*(WITH|SELECT)\b/i.test(sql)) throw new Error('readSales: enkel SELECT/WITH.');
  const res = await db(env).prepare(sql).bind(...params).all();
  return res.results || [];
}

// D1 aanvaardt maximaal 100 gebonden parameters per statement. Eén rij per
// statement en een batch van statements per aanroep houdt dat ruim binnen de
// grens, ook voor de breedste tabel (partners, 20 kolommen).
const BATCH = 80;

/**
 * Rijen invoegen of bijwerken op hun primaire sleutel.
 * @param {string} table
 * @param {string[]} columns  eerste kolom(men) = primaire sleutel
 * @param {Array<Array>} rows waarden in de volgorde van columns
 * @param {string[]} keyColumns
 */
export async function upsertRows(env, table, columns, rows, keyColumns = ['id']) {
  if (!rows.length) return 0;
  const d = db(env);
  const placeholders = columns.map(() => '?').join(',');
  const updates = columns.filter((c) => !keyColumns.includes(c)).map((c) => `${c}=excluded.${c}`).join(',');
  const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`
    + (updates ? ` ON CONFLICT(${keyColumns.join(',')}) DO UPDATE SET ${updates}` : ` ON CONFLICT(${keyColumns.join(',')}) DO NOTHING`);
  const stmt = d.prepare(sql);
  for (let i = 0; i < rows.length; i += BATCH) {
    await d.batch(rows.slice(i, i + BATCH).map((r) => stmt.bind(...r.map((v) => (v === undefined ? null : v)))));
  }
  return rows.length;
}

/**
 * Wat in D1 staat maar niet meer in Odoo, weghalen. `keepIds` is de volledige
 * lijst id's die Odoo vandaag nog heeft; een verwijderd record heeft geen
 * write_date meer en zou anders eeuwig blijven staan.
 */
export async function deleteMissing(env, table, keepIds) {
  const d = db(env);
  const present = (await d.prepare(`SELECT id FROM ${table}`).all()).results || [];
  const keep = new Set(keepIds.map(Number));
  const gone = present.map((r) => r.id).filter((id) => !keep.has(Number(id)));
  for (let i = 0; i < gone.length; i += BATCH) {
    const part = gone.slice(i, i + BATCH);
    await d.prepare(`DELETE FROM ${table} WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).run();
  }
  return gone.length;
}

/** Een willekeurig onderhoudsstatement (sync_state, snapshots opruimen). */
export async function runSales(env, sql, params = []) {
  if (/^\s*(DROP|ALTER|CREATE|PRAGMA|ATTACH)\b/i.test(sql)) throw new Error('runSales: geen DDL buiten de migraties.');
  return db(env).prepare(sql).bind(...params).run();
}
