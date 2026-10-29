#!/usr/bin/env node
/**
 * Serveractie 913 "Foute Lead (definitief verwijderen)": ruimt ook het
 * actieblad op en laat een gebouw staan zolang er iets aan hangt.
 * Code: foute-lead.py.
 *
 * Gebruik:  node scripts/odoo-acties/foute-lead.mjs            (enkel klaarzetten)
 *           node scripts/odoo-acties/foute-lead.mjs --schrijf  (naar Odoo)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const vars = Object.fromEntries(
  readFileSync(join(hier, '../../.dev.vars'), 'utf8')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const schrijf = process.argv.includes('--schrijf');
const ACTIE = 913;

async function kw(model, method, args, kwargs = {}) {
  const res = await fetch('https://mymmo.odoo.com/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: 'object', method: 'execute_kw', args: [vars.DB_NAME, Number(vars.UID), vars.API_KEY, model, method, args, kwargs] } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error.data?.message || j.error));
  return j.result;
}

const CR = String.fromCharCode(13);
const code = readFileSync(join(hier, 'foute-lead.py'), 'utf8').split(CR).join('');
const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
writeFileSync(join(uit, 'foute-lead.py'), code);
console.log('Klaargezet in', uit);
if (!schrijf) process.exit(0);

const [oud] = await kw('ir.actions.server', 'read', [[ACTIE]], { fields: ['name', 'model_name', 'code'] });
if (oud.model_name !== 'crm.lead') throw new Error('Actie ' + ACTIE + ' is niet die op crm.lead');
writeFileSync(join(uit, 'foute-lead.vorige.py'), oud.code || '');
await kw('ir.actions.server', 'write', [[ACTIE], { code }]);
console.log('actie bijgewerkt', ACTIE, '(vorige code bewaard in .uit/foute-lead.vorige.py)');
