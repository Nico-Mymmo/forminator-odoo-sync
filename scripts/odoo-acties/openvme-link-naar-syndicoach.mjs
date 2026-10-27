#!/usr/bin/env node
/**
 * Link naar de VME in OpenVME -> Odoo (op de VME) -> Syndicoach Navigator.
 *
 * - Veld res.partner.x_openvme_url ("OpenVME-link", Char).
 * - Automatische regel op mail.message (aanmaken, notitie op een lead met
 *   "aangemaakt in OpenVME"): openvme-link-naar-syndicoach.py.
 * - 1179 stuurt het veld mee als "openvme_url" (overdracht-mailadressen.mjs);
 *   de Navigator (webhook.odoo.gebouw.ts) zet er gebouwen.openvme_url mee.
 *
 * Gebruik:  node scripts/odoo-acties/openvme-link-naar-syndicoach.mjs --schrijf [--lead <id>]
 *           --lead draait de regel meteen op de OpenVME-notitie van die lead (inhalen).
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
const schrijf = process.argv.includes('--schrijf');
const li = process.argv.indexOf('--lead');
const inhaalLead = li > -1 ? Number(process.argv[li + 1]) : null;
const NAAM = 'OpenVME: link naar Syndicoach';

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

const code = readFileSync(join(hier, 'openvme-link-naar-syndicoach.py'), 'utf8').split(String.fromCharCode(13)).join('');
if (!schrijf) { console.log(code); process.exit(0); }

// 1. Het veld
const [partnerModel] = await kw('ir.model', 'search_read', [[['model', '=', 'res.partner']]], { fields: ['id'] });
const veld = await kw('ir.model.fields', 'search', [[['model', '=', 'res.partner'], ['name', '=', 'x_openvme_url']]]);
if (!veld.length) {
  console.log('veld aangemaakt', await kw('ir.model.fields', 'create', [{ model_id: partnerModel.id, name: 'x_openvme_url', ttype: 'char', field_description: 'OpenVME-link', state: 'manual', copied: false }]));
}

// 2. De regel
const [msgModel] = await kw('ir.model', 'search_read', [[['model', '=', 'mail.message']]], { fields: ['id'] });
const filter = "[('model', '=', 'crm.lead'), ('body', 'ilike', 'aangemaakt in OpenVME'), ('body', 'ilike', 'app.cindy.eu/dashboard/estate/')]";
let [aut] = await kw('base.automation', 'search_read', [[['name', '=', NAAM]]], { fields: ['id', 'action_server_ids'], context: { active_test: false } });
if (!aut) {
  const id = await kw('base.automation', 'create', [{ name: NAAM, model_id: msgModel.id, trigger: 'on_create', filter_domain: filter, active: true }]);
  aut = { id, action_server_ids: [] };
  console.log('regel aangemaakt', id);
} else {
  await kw('base.automation', 'write', [[aut.id], { filter_domain: filter, active: true }]);
}
const actie = { name: NAAM, model_id: msgModel.id, state: 'code', code, usage: 'base_automation', base_automation_id: aut.id };
if (aut.action_server_ids.length) {
  await kw('ir.actions.server', 'write', [[aut.action_server_ids[0]], { code }]);
  console.log('actie bijgewerkt', aut.action_server_ids[0]);
} else {
  const aid = await kw('ir.actions.server', 'create', [actie]);
  await kw('base.automation', 'write', [[aut.id], { action_server_ids: [[6, 0, [aid]]] }]);
  aut.action_server_ids = [aid];
  console.log('actie aangemaakt', aid);
}

// 3. Inhalen voor een lead die al doorgestuurd werd
if (inhaalLead) {
  const msgs = await kw('mail.message', 'search', [[['model', '=', 'crm.lead'], ['res_id', '=', inhaalLead], ['body', 'ilike', 'aangemaakt in OpenVME']]], { order: 'id desc', limit: 1 });
  if (!msgs.length) throw new Error('geen OpenVME-notitie op lead ' + inhaalLead);
  await kw('ir.actions.server', 'run', [[aut.action_server_ids[0]]], { context: { active_model: 'mail.message', active_id: msgs[0], active_ids: msgs } });
  console.log('ingehaald voor lead', inhaalLead);
}
