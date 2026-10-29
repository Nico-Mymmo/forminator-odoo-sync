#!/usr/bin/env node
/**
 * Automatische regel op crm.lead: elke lead op een persoon heeft een actieblad,
 * en een actieblad waarvan alle leads verloren zijn gaat naar Gepauzeerd.
 * Maakt ook het vinkje Gepauzeerd, de filters en het lint aan. Code: actieblad-altijd.py.
 *
 * Gebruik:  node scripts/odoo-acties/actieblad-altijd.mjs            (enkel klaarzetten)
 *           node scripts/odoo-acties/actieblad-altijd.mjs --schrijf  (naar Odoo)
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
const NAAM = 'Actieblad: altijd een, pauzeren als verloren';
const FASE = 'Gepauzeerd';

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
const bron = readFileSync(join(hier, 'actieblad-altijd.py'), 'utf8').split(CR).join('');
const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });

if (!schrijf) {
  writeFileSync(join(uit, 'actieblad-altijd.py'), bron);
  console.log('Klaargezet in', uit, '(de fase-id wordt pas bij --schrijf ingevuld)');
  process.exit(0);
}

// Gepauzeerd is een VINKJE, geen fase: zo blijft een actieblad staan in de
// fase waar iemand afhaakte. Een eerste versie (27/10) maakte een fase; die
// wordt hier weggehaald zolang er geen actieblad in staat.
let [fase] = await kw('x_support_stage', 'search_read', [[['x_name', '=', FASE]]], { fields: ['id'], context: { active_test: false } });
if (fase) {
  const erin = await kw('x_sales_action_sheet', 'search_count', [[['x_studio_stage_id', '=', fase.id]]], { context: { active_test: false } });
  if (!erin) { await kw('x_support_stage', 'unlink', [[fase.id]]); console.log('fase Gepauzeerd weggehaald', fase.id); }
  else console.log('fase Gepauzeerd NIET weggehaald: er staan', erin, 'actiebladen in');
}

const [blad] = await kw('ir.model', 'search_read', [[['model', '=', 'x_sales_action_sheet']]], { fields: ['id'] });
let [veld] = await kw('ir.model.fields', 'search_read', [[['model', '=', 'x_sales_action_sheet'], ['name', '=', 'x_studio_gepauzeerd']]], { fields: ['id'] });
if (!veld) {
  const id = await kw('ir.model.fields', 'create', [{
    name: 'x_studio_gepauzeerd', model_id: blad.id, ttype: 'boolean', state: 'manual',
    field_description: 'Gepauzeerd', copied: false, tracking: 1,
    help: 'Alle leads van dit actieblad zijn verloren. Gaat vanzelf uit als er weer een actieve lead aan hangt.',
  }]);
  console.log('veld aangemaakt', id);
}

// Filters: "Zonder gepauzeerde" (standaard aan in het menu) en "Gepauzeerd".
const ZOEK = 'OM: filter gepauzeerde actiebladen';
const zoekArch = `<data>
  <xpath expr="//filter[@name='archived_x_sales_action_sheet']" position="before">
    <filter name="niet_gepauzeerd" string="Zonder gepauzeerde" domain="[('x_studio_gepauzeerd', '=', False)]"/>
    <filter name="gepauzeerd" string="Gepauzeerd" domain="[('x_studio_gepauzeerd', '=', True)]"/>
    <separator/>
  </xpath>
</data>`;
const FORM = 'OM: lint gepauzeerd op het actieblad';
const formArch = `<data>
  <xpath expr="(//widget[@name='web_ribbon'])[1]" position="before">
    <field name="x_studio_gepauzeerd" invisible="1"/>
    <widget name="web_ribbon" text="Gepauzeerd" bg_color="text-bg-warning" invisible="not x_studio_gepauzeerd or not x_active"/>
  </xpath>
</data>`;
for (const [naam, ouder, arch] of [[ZOEK, 3560, zoekArch], [FORM, 3559, formArch]]) {
  const [v] = await kw('ir.ui.view', 'search_read', [[['name', '=', naam]]], { fields: ['id'], context: { active_test: false } });
  if (v) await kw('ir.ui.view', 'write', [[v.id], { arch_db: arch }]);
  else console.log('weergave aangemaakt', naam, await kw('ir.ui.view', 'create', [{ name: naam, model: 'x_sales_action_sheet', inherit_id: ouder, mode: 'extension', priority: 120, arch_db: arch }]));
}

// Het menu Actiebladen (actie 953) opent standaard zonder de gepauzeerde.
// De knop op de lead (actie 978) toont bewust alles van die lead.
await kw('ir.actions.act_window', 'write', [[953], { context: "{'search_default_niet_gepauzeerd': 1}" }]);

const code = bron;
writeFileSync(join(uit, 'actieblad-altijd.py'), code);

const [mod] = await kw('ir.model', 'search_read', [[['model', '=', 'crm.lead']]], { fields: ['id'] });
const velden = await kw('ir.model.fields', 'search_read', [[['model', '=', 'crm.lead'], ['name', 'in', ['partner_id', 'active']]]], { fields: ['id'] });
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
