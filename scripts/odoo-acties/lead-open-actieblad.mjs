#!/usr/bin/env node
/**
 * De knop "Actiebladen" op de lead opent meteen het actieblad als er maar een
 * is (anders de lijst). Maakt de serveractie "Open actieblad" en een kleine
 * aanpassing aan de leadweergave die de knop daarnaar laat wijzen.
 * Code: lead-open-actieblad.py.
 *
 * Gebruik:  node scripts/odoo-acties/lead-open-actieblad.mjs --schrijf
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const vars = Object.fromEntries(
  readFileSync(join(hier, '../../.dev.vars'), 'utf8')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
if (!process.argv.includes('--schrijf')) { console.log('Gebruik --schrijf om naar Odoo te schrijven.'); process.exit(0); }

const NAAM = 'Open actieblad';
const WEERGAVE = 'OM: knop Actiebladen opent meteen het actieblad';
const OUDE_KNOP = 'studio_customization.actiebladen_38ef8840-101c-4802-81ed-30f9e31033a4';

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
const code = readFileSync(join(hier, 'lead-open-actieblad.py'), 'utf8').split(CR).join('');
const [mod] = await kw('ir.model', 'search_read', [[['model', '=', 'crm.lead']]], { fields: ['id'] });
let [actie] = await kw('ir.actions.server', 'search_read', [[['name', '=', NAAM], ['model_id', '=', mod.id]]], { fields: ['id'] });
if (actie) await kw('ir.actions.server', 'write', [[actie.id], { code }]);
else actie = { id: await kw('ir.actions.server', 'create', [{ name: NAAM, model_id: mod.id, state: 'code', code }]) };
console.log('serveractie', actie.id);

const arch = `<data>
  <xpath expr="//button[@name='${OUDE_KNOP}']" position="attributes">
    <attribute name="name">${actie.id}</attribute>
  </xpath>
</data>`;
const [v] = await kw('ir.ui.view', 'search_read', [[['name', '=', WEERGAVE]]], { fields: ['id'], context: { active_test: false } });
if (v) await kw('ir.ui.view', 'write', [[v.id], { arch_db: arch }]);
else console.log('weergave', await kw('ir.ui.view', 'create', [{ name: WEERGAVE, model: 'crm.lead', inherit_id: 979, mode: 'extension', priority: 200, arch_db: arch }]));
