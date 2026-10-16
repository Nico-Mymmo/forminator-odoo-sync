/**
 * Een D1-omhulsel rond node:sqlite (Node 22+), voor de tests van core-db.js
 * en verhuis.js: dezelfde SQLite die D1 gebruikt, zonder Cloudflare.
 */
import { DatabaseSync } from 'node:sqlite';

export function fakeD1(schema = '') {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON'); // D1 dwingt foreign keys ook af
  if (schema) db.exec(schema);
  function stmt(sql, params = []) {
    return {
      bind: (...p) => stmt(sql, p),
      all: async () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }),
      first: async () => { const r = db.prepare(sql).get(...params); return r ? { ...r } : null; },
      run: async () => { db.prepare(sql).run(...params); return { success: true }; },
      _sync: () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }),
    };
  }
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    // D1 voert een batch uit als een transactie: alles of niets.
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { const uit = stmts.map((s) => s._sync()); db.exec('COMMIT'); return uit; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
