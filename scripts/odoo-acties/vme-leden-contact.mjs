#!/usr/bin/env node
/**
 * Automatische regel op crm.lead: de contactpersoon staat altijd in de
 * ledenlijst (x_vme_members) en geen enkel e-mailadres staat er dubbel in.
 * Code: vme-leden-contact.py (+ de gedeelde JSON-lezer ml-parse.py).
 *
 * Gebruik:  node scripts/odoo-acties/vme-leden-contact.mjs            (enkel klaarzetten)
 *           node scripts/odoo-acties/vme-leden-contact.mjs --schrijf  (naar Odoo)
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
const NAAM = 'VME-leden: contactpersoon erin, geen dubbels';

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
const parse = readFileSync(join(hier, 'ml-parse.py'), 'utf8').split(CR).join('');
const code = readFileSync(join(hier, 'vme-leden-contact.py'), 'utf8').split(CR).join('')
  .replace('# __ML_PARSE__', () => parse);
if (code.includes('# __ML_PARSE__')) throw new Error('JSON-lezer niet ingevoegd');

const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
writeFileSync(join(uit, 'vme-leden-contact.py'), code);
console.log('Klaargezet in', uit);
if (!schrijf) process.exit(0);

const [mod] = await kw('ir.model', 'search_read', [[['model', '=', 'crm.lead']]], { fields: ['id'] });
const velden = await kw('ir.model.fields', 'search_read', [[['model', '=', 'crm.lead'], ['name', 'in', ['partner_id', 'x_vme_members', 'stage_id', 'email_from', 'x_vme_naam']]]], { fields: ['id'] });

let [aut] = await kw('base.automation', 'search_read', [[['name', '=', NAAM]]], { fields: ['id', 'action_server_ids'], context: { active_test: false } });
if (!aut) {
  const id = await kw('base.automation', 'create', [{
    name: NAAM, model_id: mod.id, trigger: 'on_create_or_write',
    trigger_field_ids: [[6, 0, velden.map((v) => v.id)]], active: true,
  }]);
  aut = { id, action_server_ids: [] };
  console.log('regel aangemaakt', id);
}
await kw('base.automation', 'write', [[aut.id], { trigger_field_ids: [[6, 0, velden.map((v) => v.id)]] }]);
const actie = { name: NAAM, model_id: mod.id, state: 'code', code, usage: 'base_automation', base_automation_id: aut.id };
if (aut.action_server_ids.length) {
  await kw('ir.actions.server', 'write', [aut.action_server_ids, { code }]);
  console.log('actie bijgewerkt', aut.action_server_ids);
} else {
  console.log('actie aangemaakt', await kw('ir.actions.server', 'create', [actie]));
}
