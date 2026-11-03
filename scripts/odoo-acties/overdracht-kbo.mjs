#!/usr/bin/env node
/**
 * Het KBO-nummer in het venster "Naar Syndicoach" op een actieblad vult zich
 * vanzelf in vanuit de lead: crm.lead.x_vme_kbo (related naar
 * partner_id.parent_id.x_studio_registration_number). Geen lead met een nummer,
 * dan het gebouw op het actieblad.
 *
 * Enkel als het punt LEEG is: wat iemand zelf in het venster typte, wint.
 * Het punt wordt herkend op de NAAM (de punten worden in de Navigator
 * ingesteld): een tekstpunt met "kbo" of "ondernemingsnummer" erin.
 *
 * Past twee serveracties aan (zelfde als overdracht-mailadressen.mjs):
 *   1201  het venster: toont het nummer in het veld.
 *   1179  de payload: stuurt het nummer mee, ook als niemand het veld aanraakte
 *         (het venster bewaart pas bij typen).
 *
 * Gebruik:  node scripts/odoo-acties/overdracht-kbo.mjs           (enkel tonen)
 *           node scripts/odoo-acties/overdracht-kbo.mjs --schrijf (naar Odoo)
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

const MERK = '# KBO uit de lead (overdracht-kbo.mjs)';
const blok = (ind) => [
  `${ind}${MERK}`,
  `${ind}kbo_n = (it.x_name or '').lower()`,
  `${ind}if soort == 'tekst' and not waarde.strip() and ('kbo' in kbo_n or 'ondernemingsnummer' in kbo_n):`,
  `${ind}    for kbo_ld in sheet.x_studio_as_opportunity_ids:`,
  `${ind}        if (kbo_ld.x_vme_kbo or '').strip():`,
  `${ind}            waarde = kbo_ld.x_vme_kbo.strip()`,
  `${ind}            break`,
  `${ind}    if not waarde.strip() and sheet.x_studio_for_company_id:`,
  `${ind}        waarde = (sheet.x_studio_for_company_id.x_studio_registration_number or '').strip()`,
].join('\n');

const DOELEN = [
  { id: 1201, anker: "        waarde = oud.get(nid, '')\n" },
  { id: 1179, anker: "        waarde = antw.get(it.x_studio_navigator_id or '', '')\n" },
];

const uit = join(hier, '.uit');
mkdirSync(uit, { recursive: true });
for (const d of DOELEN) {
  const [a] = await kw('ir.actions.server', 'read', [[d.id]], { fields: ['code'] });
  if (a.code.includes(MERK)) { console.log(d.id, 'al aangepast'); continue; }
  const n = a.code.split(d.anker).length - 1;
  if (n !== 1) throw new Error(`${d.id}: anker verwacht 1 keer, gevonden ${n}`);
  const nieuw = a.code.replace(d.anker, () => d.anker + blok('        ') + '\n');
  writeFileSync(join(uit, `${d.id}-kbo-oud.py`), a.code);
  writeFileSync(join(uit, `${d.id}-kbo-nieuw.py`), nieuw);
  if (schrijf) {
    await kw('ir.actions.server', 'write', [[d.id], { code: nieuw }]);
    console.log(d.id, 'bijgewerkt');
  } else console.log(d.id, 'klaargezet in', uit);
}
