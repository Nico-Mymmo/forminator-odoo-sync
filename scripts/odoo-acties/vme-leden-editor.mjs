#!/usr/bin/env node
/**
 * Lijstvak "VME-leden" op het tabblad Syndicoach van een lead.
 *
 * Maakt (of werkt bij) het rekenveld crm.lead.x_vme_members_editor (html, niet
 * bewaard, sanitize uit) met de code uit vme-leden-editor.py, en zet het in de
 * rechterkolom van het tabblad Syndicoach (Studio-weergave 1694).
 * De browsercode is dezelfde als in het venster "Naar Syndicoach"
 * (overdracht-mailadressen.lib.js), met een eigen naam (window.__mlL) en een
 * schrijfstap die x_vme_members op de lead zet als JSON [{firstname, lastname, email}].
 *
 * Gebruik:  node scripts/odoo-acties/vme-leden-editor.mjs            (enkel klaarzetten)
 *           node scripts/odoo-acties/vme-leden-editor.mjs --schrijf  (naar Odoo)
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
const VIEW = 1694;
const VELD = 'x_vme_members_editor';

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

// Bij elke wijziging: de lijst als JSON in x_vme_members van het OPEN FORMULIER
// zetten (record.update), zodat Odoo ze bewaart met de lead (Opslaan of de lead
// verlaten) en Verwerpen ze terugdraait. Het record wordt gezocht via de
// componentenboom van de webclient (odoo.__WOWL_DEBUG__.root): het veld
// x_vme_members_editor van deze lead. x_vme_members moet daarvoor in de weergave
// staan (mag onzichtbaar). Vindt hij het niet, dan schrijft hij meteen weg.
const SCHRIJF_LEAD = 'var b=el.closest("[data-mllead]");if(!b)return;var id=parseInt(b.dataset.id);'
  + 'var w=el.value||"";var r=[];'
  + 'if(w.indexOf("LIJST:")===0){w.slice(6).split(";").forEach(function(x){var c=x.split("|");'
  + 'if(c[0]||c[1]||c[2])r.push({firstname:c[1]||"",lastname:c[2]||"",email:c[0]||""});});}'
  + 'var v=r.length?JSON.stringify(r):false;var rec=null;'
  + 'try{var zoek=function(n,d){if(!n)return null;if(d>80)return null;var c=n.component;'
  + 'if(c){if(c.props){if(c.props.name==="x_vme_members_editor"){if(c.props.record){if(c.props.record.resId===id)return c.props.record;}}}}'
  + 'var ch=n.children||{};for(var k in ch){var y=zoek(ch[k],d+1);if(y)return y;}return null;};'
  + 'rec=zoek(odoo.__WOWL_DEBUG__.root.__owl__,0);}catch(e){rec=null;}'
  + 'var s=b.querySelector("[data-mlbewaarstatus]");'
  + 'if(rec){rec.update({x_vme_members:v});if(s){s.textContent="Gewijzigd: wordt bewaard samen met de lead (Opslaan of de lead verlaten).";s.style.color="#b45309";}}'
  + 'else{fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
  + 'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"crm.lead",method:"write",'
  + 'args:[[id],{x_vme_members:v}],kwargs:{}}})});if(s){s.textContent="Meteen bewaard.";s.style.color="#15803d";}}';

const lib = readFileSync(join(hier, 'overdracht-mailadressen.lib.js'), 'utf8')
  .replace(/\r/g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').trim();
const init = 'window.__mlL3=window.__mlL3||' + lib.replace('/*SCHRIJF*/', SCHRIJF_LEAD) + '();';
for (const teken of ["'", '<', '&', '"""']) {
  if (init.includes(teken)) throw new Error(`De browsercode bevat ${teken}`);
}
const code = readFileSync(join(hier, 'vme-leden-editor.py'), 'utf8').replace(/\r/g, '').replace('r"""__ML_INIT__"""', () => 'r"""' + init + '"""')
  .replace('# __ML_PARSE__ (scripts/odoo-acties/ml-parse.py)', () => readFileSync(join(hier, 'ml-parse.py'), 'utf8').split(String.fromCharCode(13)).join(''));
if (code.includes('r"""__ML_INIT__') || code.includes('# __ML_PARSE__')) throw new Error('invoegplek niet vervangen');

const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
writeFileSync(join(uit, 'vme-leden-editor-compute.py'), code);
console.log('Klaargezet in', uit);
if (!schrijf) process.exit(0);

// 1. Het rekenveld
const [mod] = await kw('ir.model', 'search_read', [[['model', '=', 'crm.lead']]], { fields: ['id'] });
const bestaand = await kw('ir.model.fields', 'search', [[['model', '=', 'crm.lead'], ['name', '=', VELD]]]);
const vals = { compute: code, depends: 'x_vme_members', store: false, readonly: true, sanitize: false };
if (bestaand.length) {
  await kw('ir.model.fields', 'write', [bestaand, vals]);
  console.log('rekenveld bijgewerkt', bestaand[0]);
} else {
  const id = await kw('ir.model.fields', 'create', [{ model_id: mod.id, name: VELD, ttype: 'html', field_description: 'VME-leden (lijst)', state: 'manual', copied: false, ...vals }]);
  console.log('rekenveld aangemaakt', id);
}

// 2. In de rechterkolom van het tabblad Syndicoach
const [view] = await kw('ir.ui.view', 'read', [[VIEW]], { fields: ['arch_db'] });
if (!view.arch_db.includes(`name="${VELD}"`)) {
  const oud = '<group name="studio_group_70n_right"/>';
  const n = view.arch_db.split(oud).length - 1;
  if (n !== 1) throw new Error('rechterkolom niet 1x gevonden: ' + n);
  writeFileSync(join(uit, 'view1694-voor-leden.xml'), view.arch_db);
  const nieuw = `<group name="studio_group_70n_right" string="VME-leden">\n          <field name="${VELD}" nolabel="1" colspan="2" readonly="1" widget="html" sanitize="false"/>\n        </group>`;
  await kw('ir.ui.view', 'write', [[VIEW], { arch: view.arch_db.replace(oud, nieuw) }]);
  console.log('op het tabblad gezet');
}

// 3. Rekent het veld zonder fout?
const [lead] = await kw('crm.lead', 'search_read', [[['type', '=', 'opportunity']]], { fields: ['id', VELD], limit: 1, order: 'id desc' });
console.log('proef op lead', lead.id, String(lead[VELD]).slice(0, 120));
