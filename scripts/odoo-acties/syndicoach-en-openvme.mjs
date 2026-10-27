#!/usr/bin/env node
/**
 * "Versturen naar Syndicoach" op het actieblad maakt ook de VME in OpenVME aan.
 *
 * Actie 1180 (multi) draait voortaan, in deze volgorde:
 *   5  1179  payload + ledenlijst naar de lead (overdracht-mailadressen.mjs)
 *   6  NIEUW "Syndicoach: ook in OpenVME" (syndicoach-en-openvme.py): roept de
 *            knop "Maak in OpenVME" van de lead aan; ontbreekt er iets, dan
 *            stopt alles en is er niets verstuurd
 *   7  1177  webhook naar de Syndicoach Navigator
 * De knop in het venster heet "Versturen naar Syndicoach en OpenVME".
 * De knop "Maak in OpenVME" op de lead blijft bestaan (voor wie geen Syndicoach heeft).
 *
 * Gebruik:  node scripts/odoo-acties/syndicoach-en-openvme.mjs            (enkel tonen)
 *           node scripts/odoo-acties/syndicoach-en-openvme.mjs --schrijf  (naar Odoo)
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
const MULTI = 1180, PAYLOAD = 1179, WEBHOOK = 1177;
const NAAM = 'Syndicoach: ook in OpenVME';
const VENSTER = 'Overdracht naar Syndicoach';

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

const [knop] = await kw('ir.actions.server', 'search_read', [[['name', '=', 'OpenVME: VME aanmaken']]], { fields: ['id'] });
if (!knop) throw new Error('knop "OpenVME: VME aanmaken" niet gevonden (eerst openvme-knop.mjs)');
const code = readFileSync(join(hier, 'syndicoach-en-openvme.py'), 'utf8').split(String.fromCharCode(13)).join('')
  .replace('__OPENVME_KNOP__', String(knop.id));
if (code.includes('__OPENVME_KNOP__')) throw new Error('invoegplek niet vervangen');
const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
writeFileSync(join(uit, 'syndicoach-en-openvme.py'), code);
console.log('Klaargezet in', uit);
if (!schrijf) process.exit(0);

// 1. De stap
const [mod] = await kw('ir.model', 'search_read', [[['model', '=', 'x_sales_action_sheet']]], { fields: ['id'] });
let [stap] = await kw('ir.actions.server', 'search_read', [[['name', '=', NAAM]]], { fields: ['id'] });
if (!stap) {
  stap = { id: await kw('ir.actions.server', 'create', [{ name: NAAM, model_id: mod.id, state: 'code', code, sequence: 6 }]) };
  console.log('stap aangemaakt', stap.id);
} else {
  await kw('ir.actions.server', 'write', [[stap.id], { code, sequence: 6 }]);
  console.log('stap bijgewerkt', stap.id);
}

// 2. In de multi-actie, met een vaste volgorde (anders beslist de naam)
await kw('ir.actions.server', 'write', [[PAYLOAD], { sequence: 5 }]);
await kw('ir.actions.server', 'write', [[WEBHOOK], { sequence: 7 }]);
const [multi] = await kw('ir.actions.server', 'read', [[MULTI]], { fields: ['child_ids'] });
if (!multi.child_ids.includes(stap.id)) {
  await kw('ir.actions.server', 'write', [[MULTI], { child_ids: [[4, stap.id]] }]);
  console.log('stap toegevoegd aan', MULTI);
}
const kids = await kw('ir.actions.server', 'read', [[MULTI]], { fields: ['child_ids'] });
const rij = await kw('ir.actions.server', 'read', [kids[0].child_ids], { fields: ['id', 'name', 'sequence'] });
console.log(rij.sort((a, b) => a.sequence - b.sequence).map((x) => x.sequence + ' ' + x.id + ' ' + x.name).join('\n'));

// 3. Het opschrift van de knop in het venster
const [vv] = await kw('ir.ui.view', 'search_read', [[['model', '=', 'x_sales_action_sheet'], ['name', '=', VENSTER]]], { fields: ['id', 'arch_db'] });
const oud = 'string="Versturen naar Syndicoach"';
if (vv.arch_db.includes(oud)) {
  await kw('ir.ui.view', 'write', [[vv.id], { arch: vv.arch_db.replace(oud, 'string="Versturen naar Syndicoach en OpenVME"') }]);
  console.log('knop in het venster hernoemd');
}
