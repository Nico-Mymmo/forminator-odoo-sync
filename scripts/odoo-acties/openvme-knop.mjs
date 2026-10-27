#!/usr/bin/env node
/**
 * Knop "Maak in OpenVME" op de lead.
 *
 * - Webhook-actie "OpenVME: VME aanmaken (webhook)" op crm.lead met de velden
 *   die OpenVME nodig heeft. Het ADRES (webhook_url) vullen de ontwikkelaars
 *   van OpenVME in; dit script raakt een ingevuld adres nooit aan.
 * - Code-actie "OpenVME: VME aanmaken" (openvme-knop.py): controle van de
 *   verplichte velden, dan de webhook, dan een notitie op de lead.
 * - De knop in de kop van het leadformulier (Studio-weergave 1694), op elke
 *   lead.
 *
 * Gebruik:  node scripts/odoo-acties/openvme-knop.mjs            (enkel klaarzetten)
 *           node scripts/odoo-acties/openvme-knop.mjs --schrijf  (naar Odoo)
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
const NAAM_WEBHOOK = 'OpenVME: VME aanmaken (webhook)';
const NAAM_KNOP = 'OpenVME: VME aanmaken';
const VELDEN = [
  // De VME zelf gaat niet mee: OpenVME leest ze via partner_id -> parent_id (het bedrijf).
  'x_vme_members', 'partner_id', 'contact_name', 'email_from', 'phone', 'mobile',
  'x_odoo_database', // berekend, NIET bewaard: zegt uit welke database (productie of sandbox) de webhook komt
];

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
const bron = readFileSync(join(hier, 'openvme-knop.py'), 'utf8').split(CR).join('').replace('# __ML_PARSE__', () => parse);
if (bron.includes('# __ML_PARSE__')) throw new Error('JSON-lezer niet ingevoegd');
const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
writeFileSync(join(uit, 'openvme-knop.py'), bron.replace('__WEBHOOK_ID__', '0'));
console.log('Klaargezet in', uit);
if (!schrijf) process.exit(0);

const [mod] = await kw('ir.model', 'search_read', [[['model', '=', 'crm.lead']]], { fields: ['id'] });
const velden = await kw('ir.model.fields', 'search_read', [[['model', '=', 'crm.lead'], ['name', 'in', VELDEN]]], { fields: ['id', 'name'] });
if (velden.length !== VELDEN.length) throw new Error('niet alle velden gevonden: ' + velden.map((v) => v.name).join(','));

// 1. Webhook (adres blijft zoals het is)
let [wh] = await kw('ir.actions.server', 'search_read', [[['name', '=', NAAM_WEBHOOK]]], { fields: ['id', 'webhook_url'] });
if (!wh) {
  const id = await kw('ir.actions.server', 'create', [{ name: NAAM_WEBHOOK, model_id: mod.id, state: 'webhook', webhook_field_ids: [[6, 0, velden.map((v) => v.id)]] }]);
  wh = { id, webhook_url: false };
  console.log('webhook aangemaakt', id);
} else {
  await kw('ir.actions.server', 'write', [[wh.id], { webhook_field_ids: [[6, 0, velden.map((v) => v.id)]] }]);
  console.log('webhook bijgewerkt', wh.id, 'adres:', wh.webhook_url || '(leeg)');
}

// 2. Knopactie
const code = bron.replace('__WEBHOOK_ID__', String(wh.id));
let [knop] = await kw('ir.actions.server', 'search_read', [[['name', '=', NAAM_KNOP]]], { fields: ['id'] });
if (!knop) {
  knop = { id: await kw('ir.actions.server', 'create', [{ name: NAAM_KNOP, model_id: mod.id, state: 'code', code }]) };
  console.log('knopactie aangemaakt', knop.id);
} else {
  await kw('ir.actions.server', 'write', [[knop.id], { code }]);
  console.log('knopactie bijgewerkt', knop.id);
}

// 2b. Rekenveld voor het overzicht in het venster
const controle = readFileSync(join(hier, 'openvme-controle.py'), 'utf8').split(CR).join('');
const DEPENDS = ['partner_id', 'partner_id.email', 'partner_id.phone', 'partner_id.mobile', 'partner_id.is_company', 'partner_id.parent_id',
  ...['name', 'is_company', 'street', 'zip', 'city', 'country_id', 'x_studio_registration_number'].map((f) => 'partner_id.parent_id.' + f),
  'x_vme_members', 'email_from', 'phone', 'mobile', 'contact_name'].join(',');
const cv = { compute: controle, depends: DEPENDS, store: false, readonly: true, sanitize: false };
const [cveld] = await kw('ir.model.fields', 'search', [[['model', '=', 'crm.lead'], ['name', '=', 'x_vme_controle_html']]]).then((x) => x);
if (cveld) { await kw('ir.model.fields', 'write', [[cveld], cv]); console.log('overzichtsveld bijgewerkt'); }
else console.log('overzichtsveld aangemaakt', await kw('ir.model.fields', 'create', [{ model_id: mod.id, name: 'x_vme_controle_html', ttype: 'html', field_description: 'OpenVME: controle', state: 'manual', copied: false, ...cv }]));

// 2b2. Tweede keuze in het venster: ook naar Syndicoach (opent het venster van het actieblad)
const NAAM_OOK = 'OpenVME: ook naar Syndicoach';
const ookCode = readFileSync(join(hier, 'openvme-ook-syndicoach.py'), 'utf8').split(CR).join('');
let [ook] = await kw('ir.actions.server', 'search_read', [[['name', '=', NAAM_OOK]]], { fields: ['id'] });
if (!ook) {
  ook = { id: await kw('ir.actions.server', 'create', [{ name: NAAM_OOK, model_id: mod.id, state: 'code', code: ookCode }]) };
  console.log('actie ook-Syndicoach aangemaakt', ook.id);
} else {
  await kw('ir.actions.server', 'write', [[ook.id], { code: ookCode }]);
  console.log('actie ook-Syndicoach bijgewerkt', ook.id);
}

// 2c. Het venster "Maak in OpenVME" (eigen weergave, nooit de standaard)
const VENSTER = 'OpenVME: bevestigen';
const vensterArch = `<form string="Maak in OpenVME">
  <sheet>
    <field name="x_vme_controle_html" nolabel="1" readonly="1" widget="html"/>
  </sheet>
  <footer>
    <button name="${knop.id}" type="action" string="Enkel naar OpenVME" class="btn-primary" context="{'openvme_bevestigd': True}"/>
    <button name="${ook.id}" type="action" string="Naar OpenVME en Syndicoach..." class="btn-secondary"/>
    <button string="Annuleren" special="cancel" class="btn-secondary"/>
  </footer>
</form>`;
const [vv] = await kw('ir.ui.view', 'search', [[['model', '=', 'crm.lead'], ['name', '=', VENSTER]]]);
if (vv) { await kw('ir.ui.view', 'write', [[vv], { arch: vensterArch }]); console.log('venster bijgewerkt', vv); }
else console.log('venster aangemaakt', await kw('ir.ui.view', 'create', [{ name: VENSTER, model: 'crm.lead', type: 'form', mode: 'primary', priority: 99, arch: vensterArch }]));

// 3. Knop in de kop van het formulier, na "Foute Lead"
const [view] = await kw('ir.ui.view', 'read', [[VIEW]], { fields: ['arch_db'] });
const oudeVraag = ' confirm="De VME aanmaken in OpenVME met de gegevens van het tabblad Syndicoach?"';
if (view.arch_db.includes(oudeVraag)) {
  await kw('ir.ui.view', 'write', [[VIEW], { arch: view.arch_db.replace(oudeVraag, '') }]);
  view.arch_db = view.arch_db.replace(oudeVraag, '');
  console.log('bevestigingsvraag van de knop gehaald');
}
if (!view.arch_db.includes(`name="${knop.id}" type="action" string="Maak in OpenVME"`)) {
  const anker = 'Bij problemen, check Nico!"/>';
  if (view.arch_db.split(anker).length !== 2) throw new Error('anker Foute Lead niet 1x');
  writeFileSync(join(uit, 'view1694-voor-knop.xml'), view.arch_db);
  const knopXml = `${anker}\n    <button name="${knop.id}" type="action" string="Maak in OpenVME" class="btn-primary"/>`;
  await kw('ir.ui.view', 'write', [[VIEW], { arch: view.arch_db.replace(anker, knopXml) }]);
  console.log('knop op het formulier gezet');
}

const [na] = await kw('ir.actions.server', 'read', [[wh.id]], { fields: ['webhook_sample_payload'] });
writeFileSync(join(uit, 'openvme-webhook-voorbeeld.json'), na.webhook_sample_payload || '');
console.log('voorbeeld van de webhook:\n' + na.webhook_sample_payload);
