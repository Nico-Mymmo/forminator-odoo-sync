#!/usr/bin/env node
/**
 * De export van de claude.ai-pagina (data.json) omzetten naar een
 * Supabase-migratie voor de controle_*-tabellen.
 *
 *   node scripts/odoo-controle/export-naar-sql.mjs <pad/naar/data.json> > supabase/migrations/<tijd>_odoo_controle_import.sql
 *
 * Gebruikt dezelfde omzetting als POST /odoo-controle/api/import
 * (src/modules/odoo-controle/lib/import.js), zodat een migratie en een import
 * via het scherm hetzelfde resultaat geven. INSERT ... ON CONFLICT DO UPDATE:
 * de export is het recentste werk van het team en wint.
 */

import { readFileSync } from 'node:fs';
import { zetExportOm } from '../../src/modules/odoo-controle/lib/import.js';

const pad = process.argv[2];
if (!pad) {
  console.error('Gebruik: node scripts/odoo-controle/export-naar-sql.mjs <data.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(pad, 'utf8'));
const tijd = new Date().toISOString();
const { patterns, cases, links, meta } = zetExportOm(data, { tijd });

const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const insert = (tabel, rijen, sleutel, { update = true } = {}) => {
  if (!rijen.length) return '';
  const kolommen = Object.keys(rijen[0]);
  const waarden = rijen.map((r) => `  (${kolommen.map((k) => q(r[k])).join(', ')})`).join(',\n');
  const set = kolommen.filter((k) => !sleutel.includes(k)).map((k) => `${k} = excluded.${k}`).join(', ');
  return `insert into public.${tabel} (${kolommen.join(', ')}) values\n${waarden}\n`
    + `on conflict (${sleutel.join(', ')}) do ${update && set ? `update set ${set}` : 'nothing'};\n`;
};

const out = [];
out.push('-- ============================================================================');
out.push('-- Odoo-controle: eerste lading uit de claude.ai-pagina "Factuur-, abonnement- en CRM-controle"');
out.push(`-- Gegenereerd op ${tijd} met scripts/odoo-controle/export-naar-sql.mjs`);
out.push(`-- ${cases.length} cases, ${patterns.length} patronen, ${links.length} koppelingen case-patroon`);
out.push('-- Idempotent: on conflict do update (de export is het recentste werk van het team).');
out.push('-- ============================================================================');
out.push('');
out.push(insert('controle_patterns', patterns, ['id']));
out.push(insert('controle_cases', cases, ['id']));
out.push('-- De koppelingen van de geïmporteerde cases opnieuw opbouwen.');
out.push(`delete from public.controle_case_patterns where case_id in (${cases.map((c) => q(c.id)).join(', ')});`);
out.push(insert('controle_case_patterns', links, ['case_id', 'pattern_id'], { update: false }));
out.push(insert('controle_meta', meta, ['key']));
out.push(`insert into public.controle_history (entity, entity_id, veld, oud, nieuw, door_naam, bron, tijd) values\n  ('import', '-', '-', NULL, ${q(`${cases.length} cases, ${patterns.length} patronen, ${links.length} koppelingen uit de claude.ai-export`)}, NULL, 'import', ${q(tijd)});`);
out.push('');
process.stdout.write(out.join('\n'));
