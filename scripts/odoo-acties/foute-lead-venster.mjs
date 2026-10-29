#!/usr/bin/env node
/**
 * Het venster achter de knop "Foute Lead": per onderdeel (actieblad,
 * contactpersoon, gebouw) een vinkje met wat erin zit; grijs als het niet weg
 * mag, weg als het niet bestaat. Maakt het model x_foute_lead met zijn velden,
 * rechten en weergave, de twee serveracties, en laat de knop op de lead naar
 * het venster wijzen in plaats van naar de oude waarschuwing (actie 913).
 * Code: foute-lead-venster.py + foute-lead-verwijderen.py.
 *
 * Gebruik:  node scripts/odoo-acties/foute-lead-venster.mjs --schrijf
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
const lees = (f) => readFileSync(join(hier, f), 'utf8').split(CR).join('');

// 1) Model
const MODEL = 'x_foute_lead';
let [model] = await kw('ir.model', 'search_read', [[['model', '=', MODEL]]], { fields: ['id'] });
if (!model) {
  model = { id: await kw('ir.model', 'create', [{ name: 'Foute lead', model: MODEL, state: 'manual' }]) };
  console.log('model aangemaakt', model.id);
}

// 2) Velden
const velden = [
  ['x_lead_id', 'many2one', 'Lead', { relation: 'crm.lead', on_delete: 'set null' }],
  ['x_lead_tekst', 'char', 'Lead'],
  ['x_heeft_actieblad', 'boolean', 'Heeft actieblad'], ['x_mag_actieblad', 'boolean', 'Actieblad mag weg'],
  ['x_actieblad', 'boolean', 'Actieblad verwijderen'], ['x_actieblad_tekst', 'char', 'Actieblad'],
  ['x_heeft_contact', 'boolean', 'Heeft contactpersoon'], ['x_mag_contact', 'boolean', 'Contactpersoon mag weg'],
  ['x_contact', 'boolean', 'Contactpersoon verwijderen'], ['x_contact_tekst', 'char', 'Contactpersoon'],
  ['x_heeft_gebouw', 'boolean', 'Heeft gebouw'], ['x_mag_gebouw', 'boolean', 'Gebouw mag weg'],
  ['x_gebouw', 'boolean', 'Gebouw verwijderen'], ['x_gebouw_tekst', 'char', 'Gebouw'],
];
const bestaand = await kw('ir.model.fields', 'search_read', [[['model', '=', MODEL]]], { fields: ['name'] });
const namen = new Set(bestaand.map((v) => v.name));
for (const [name, ttype, field_description, extra = {}] of velden) {
  if (namen.has(name)) continue;
  await kw('ir.model.fields', 'create', [{ model_id: model.id, name, ttype, field_description, state: 'manual', ...extra }]);
  console.log('veld', name);
}

// 3) Rechten: iedereen die Odoo gebruikt mag het venster openen.
const [grp] = await kw('ir.model.data', 'search_read', [[['module', '=', 'base'], ['name', '=', 'group_user']]], { fields: ['res_id'] });
const [recht] = await kw('ir.model.access', 'search_read', [[['model_id', '=', model.id]]], { fields: ['id'] });
if (!recht) await kw('ir.model.access', 'create', [{ name: 'x_foute_lead gebruiker', model_id: model.id, group_id: grp.res_id, perm_read: true, perm_write: true, perm_create: true, perm_unlink: true }]);

// 4) Serveracties
const [leadModel] = await kw('ir.model', 'search_read', [[['model', '=', 'crm.lead']]], { fields: ['id'] });
async function actie(naam, modelId, code) {
  const [a] = await kw('ir.actions.server', 'search_read', [[['name', '=', naam], ['model_id', '=', modelId]]], { fields: ['id'] });
  if (a) { await kw('ir.actions.server', 'write', [[a.id], { code }]); return a.id; }
  return kw('ir.actions.server', 'create', [{ name: naam, model_id: modelId, state: 'code', code }]);
}
const venster = await actie('Foute lead: venster', leadModel.id, lees('foute-lead-venster.py'));
const verwijder = await actie('Foute lead: verwijderen', model.id, lees('foute-lead-verwijderen.py'));
console.log('acties', venster, verwijder);

// 5) Weergave van het venster
const rij = (deel, titel) => `
      <div class="d-flex align-items-start gap-2 mb-3" invisible="not x_heeft_${deel}">
        <field name="x_${deel}" nolabel="1" readonly="not x_mag_${deel}"/>
        <div><strong>${titel}</strong><br/><field name="x_${deel}_tekst" nolabel="1" readonly="1"/></div>
      </div>`;
const formArch = `<form string="Foute lead verwijderen">
  <sheet>
    <field name="x_heeft_actieblad" invisible="1"/><field name="x_mag_actieblad" invisible="1"/>
    <field name="x_heeft_contact" invisible="1"/><field name="x_mag_contact" invisible="1"/>
    <field name="x_heeft_gebouw" invisible="1"/><field name="x_mag_gebouw" invisible="1"/>
    <p class="text-muted">Kies wat er mee weg mag. Wat grijs staat, kan niet weg; de reden staat erbij. Dit kan niet ongedaan gemaakt worden.</p>
    <div class="d-flex align-items-start gap-2 mb-3">
      <span class="fa fa-check-square-o mt-1"/>
      <div><strong>Lead (gaat altijd weg)</strong><br/><field name="x_lead_tekst" nolabel="1" readonly="1"/></div>
    </div>${rij('actieblad', 'Actieblad')}${rij('contact', 'Contactpersoon')}${rij('gebouw', 'Gebouw')}
  </sheet>
  <footer>
    <button string="Verwijderen" name="${verwijder}" type="action" class="btn-danger"/>
    <button string="Annuleren" special="cancel" class="btn-secondary"/>
  </footer>
</form>`;
const [fv] = await kw('ir.ui.view', 'search_read', [[['model', '=', MODEL], ['type', '=', 'form']]], { fields: ['id'] });
if (fv) await kw('ir.ui.view', 'write', [[fv.id], { arch_db: formArch }]);
else console.log('venster-weergave', await kw('ir.ui.view', 'create', [{ name: 'Foute lead venster', model: MODEL, type: 'form', arch_db: formArch, priority: 16 }]));

// 6) De knop op de lead
const KNOP = 'OM: knop Foute Lead opent het venster';
const knopArch = `<data>
  <xpath expr="//button[@name='913']" position="attributes">
    <attribute name="name">${venster}</attribute>
    <attribute name="confirm"></attribute>
  </xpath>
</data>`;
const [kv] = await kw('ir.ui.view', 'search_read', [[['name', '=', KNOP]]], { fields: ['id'], context: { active_test: false } });
if (kv) await kw('ir.ui.view', 'write', [[kv.id], { arch_db: knopArch }]);
else console.log('knop-weergave', await kw('ir.ui.view', 'create', [{ name: KNOP, model: 'crm.lead', inherit_id: 979, mode: 'extension', priority: 210, arch_db: knopArch }]));
