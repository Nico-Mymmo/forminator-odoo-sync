#!/usr/bin/env node
/**
 * De Odoo-sleutel (API-sleutel van Administrator) in een keer overal vervangen.
 *
 * Gebruik: node scripts/odoo-sleutel-vervangen.mjs
 * Je plakt de nieuwe sleutel; hij verschijnt niet op het scherm en staat nergens
 * in een bestand van deze repo. Het script:
 *   1. kijkt na dat de sleutel werkt in Odoo (als gebruiker 2, Administrator);
 *   2. zet hem als secret API_KEY op de Workers forminator-sync (de OM),
 *      odoo-proxy en website-tracker;
 *   3. zet hem in je lokale .dev.vars (API_KEY) en als ODOO_KEY in je
 *      Windows-omgeving (voor de Odoo-tool van Claude Code).
 * Pas DAARNA verwijder je de oude sleutel in Odoo.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';

const ODOO_URL = 'https://mymmo.odoo.com/jsonrpc';
const ODOO_DB = 'mymmo-main-11883993';
const ODOO_UID = 2;
const WORKERS = ['forminator-sync', 'odoo-proxy', 'website-tracker'];

function vraagVerborgen(vraag) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(vraag)) process.stdout.write(s); };
    rl.question(vraag, (antwoord) => { rl.close(); process.stdout.write('\n'); resolve(antwoord.trim()); });
  });
}

function draai(cmd, args, invoer) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let uit = '';
    p.stdout.on('data', (d) => { uit += d; });
    p.stderr.on('data', (d) => { uit += d; });
    p.on('close', (code) => resolve({ code, uit }));
    if (invoer !== undefined) p.stdin.write(invoer + '\n');
    p.stdin.end();
  });
}

async function werktInOdoo(sleutel) {
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call',
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, ODOO_UID, sleutel, 'res.users', 'read', [[ODOO_UID]], { fields: ['login'] }] },
    }),
  });
  const j = await res.json();
  return !j.error && Array.isArray(j.result) && j.result.length === 1;
}

const sleutel = await vraagVerborgen('Plak de nieuwe Odoo-sleutel en druk op Enter: ');
if (!/^[0-9a-f]{40}$/i.test(sleutel)) {
  console.log('Dat lijkt geen Odoo-sleutel (40 tekens, cijfers en a-f). Er is niets gewijzigd.');
  process.exit(1);
}
process.stdout.write('Werkt de sleutel in Odoo? ');
if (!(await werktInOdoo(sleutel))) {
  console.log('NEE. Maak de sleutel aan terwijl je als Administrator aangemeld bent. Er is niets gewijzigd.');
  process.exit(1);
}
console.log('ja');

let fouten = 0;
for (const w of WORKERS) {
  process.stdout.write(`Worker ${w}... `);
  const { code, uit } = await draai('npx', ['wrangler', 'secret', 'put', 'API_KEY', '--name', w], sleutel);
  if (code === 0) console.log('ok');
  else { fouten++; console.log('MISLUKT'); console.log(uit.split('\n').slice(-6).join('\n')); }
}

process.stdout.write('Lokale .dev.vars... ');
try {
  const pad = new URL('../.dev.vars', import.meta.url);
  const tekst = fs.readFileSync(pad, 'utf8');
  const nieuw = /^API_KEY=.*$/m.test(tekst) ? tekst.replace(/^API_KEY=.*$/m, 'API_KEY=' + sleutel) : tekst + '\nAPI_KEY=' + sleutel + '\n';
  fs.writeFileSync(pad, nieuw);
  console.log('ok');
} catch (e) { fouten++; console.log('MISLUKT: ' + e.message); }

process.stdout.write('ODOO_KEY op deze computer... ');
const ps = await draai('powershell', ['-NoProfile', '-Command', '"$k=[Console]::In.ReadLine(); [Environment]::SetEnvironmentVariable(\'ODOO_KEY\',$k,\'User\')"'], sleutel);
if (ps.code === 0) console.log('ok');
else { fouten++; console.log('MISLUKT'); }

console.log('');
if (fouten) {
  console.log(`${fouten} stap(pen) mislukt. Verwijder de OUDE sleutel in Odoo nog NIET.`);
  process.exit(1);
}
console.log('Klaar. Verwijder nu de OUDE sleutel in Odoo. Herstart daarna Claude Code, zodat de Odoo-tool de nieuwe sleutel gebruikt.');
