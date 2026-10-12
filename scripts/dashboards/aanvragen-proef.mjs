#!/usr/bin/env node
/**
 * DE PROEF van het tabblad Aanvragen: je wijzigingen bekijken op je eigen computer,
 * zonder deploy en zonder de secrets van de Worker.
 *
 *   npm run proef:aanvragen     ->  http://localhost:8790
 *
 * Wat er draait:
 *  - de pagina en alle scripts uit public/ (dus JOUW aanvragen.js en de kit);
 *  - GET /dashboards/api/aanvragen: JOUW src/modules/dashboards/lib/aanvragen/ in Node,
 *    tegen het echte Odoo, met JOUW eigen Odoo-API-sleutel -- en dus met jouw eigen
 *    leesrechten. Ziet de proef minder leads dan de OM, dan mag jouw Odoo-gebruiker
 *    ze niet allemaal lezen;
 *  - /api/auth/me: een vaste proefgebruiker, geen aanmelding.
 * Wat NIET: de targets (zonder Supabase toont het tabblad "geen target"; bekijken en
 * bewaren doe je in de OM zelf) en de andere tabbladen (die hebben de Worker nodig).
 *
 * Een wijziging in public/ zie je na een herlading van de pagina; een wijziging aan
 * de servercode herstart de proef vanzelf (node --watch, zie package.json).
 *
 * EENMALIG: een bestand .dev.vars in de hoofdmap van de repo (staat in .gitignore,
 * komt dus nooit op GitHub) met:
 *   ODOO_LOGIN=jij@openvme.be        het e-mailadres waarmee je in Odoo inlogt
 *   API_KEY=...                      Odoo -> rechtsboven je naam -> Mijn profiel ->
 *                                    Accountbeveiliging -> Nieuwe API-sleutel
 * Wie al een .dev.vars van de Worker heeft (UID, DB_NAME, Supabase), kan die gewoon
 * gebruiken: dan komen ook de targets mee.
 *
 * Bewust zonder afhankelijkheden buiten de repo: enkel Node (20+).
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAanvragen } from '../../src/modules/dashboards/lib/aanvragen/index.js';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(WORTEL, 'public');
const POORT = Number(process.env.PORT) || 8790;
const ODOO = 'https://mymmo.odoo.com/jsonrpc';
const STANDAARD_DB = 'mymmo-main-11883993';

const SOORTEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf'
};

// ── .dev.vars lezen ──────────────────────────────────────────────────────────
function leesVars() {
  const pad = join(WORTEL, '.dev.vars');
  const env = {};
  if (!existsSync(pad)) return env;
  for (const regel of readFileSync(pad, 'utf8').split(/\r?\n/)) {
    const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/** Odoo geeft bij een geldige login + API-sleutel het gebruikers-id terug. */
async function zoekUid(env) {
  const res = await fetch(ODOO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: 'common', method: 'authenticate', args: [env.DB_NAME, env.ODOO_LOGIN, env.API_KEY, {}] } })
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.data?.message || body.error.message);
  return body.result;
}

async function maakEnv() {
  const env = leesVars();
  env.DB_NAME = env.DB_NAME || STANDAARD_DB;
  if (!env.API_KEY || (!env.UID && !env.ODOO_LOGIN)) {
    console.error('\nGeen Odoo-gegevens. Maak een bestand .dev.vars in de hoofdmap met:\n'
      + '  ODOO_LOGIN=jij@openvme.be\n  API_KEY=<Odoo -> Mijn profiel -> Accountbeveiliging -> Nieuwe API-sleutel>\n'
      + '(zie de uitleg bovenaan scripts/dashboards/aanvragen-proef.mjs)\n');
    process.exit(1);
  }
  if (!env.UID) {
    const uid = await zoekUid(env);
    if (!uid) {
      console.error('\nOdoo kent die combinatie van ODOO_LOGIN en API_KEY niet. Kijk het e-mailadres na, of maak een nieuwe API-sleutel.\n');
      process.exit(1);
    }
    env.UID = String(uid);
  }
  return env;
}

// ── De server ────────────────────────────────────────────────────────────────
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const NAVBAR = '<div class="navbar bg-warning text-warning-content min-h-0 h-12 px-4 fixed top-0 inset-x-0 z-40">'
  + '<span class="font-semibold">Proef</span><span class="ml-3 text-sm">Tabblad Aanvragen, lokaal op je eigen computer. Niets hiervan staat live.</span></div>';

function bestand(res, pad) {
  const doel = normalize(join(PUBLIC, decodeURIComponent(pad)));
  if (doel !== PUBLIC && !doel.startsWith(PUBLIC + sep)) return json(res, 403, { success: false, error: 'Buiten public/' });
  if (!existsSync(doel) || !statSync(doel).isFile()) return json(res, 404, { success: false, error: 'Niet gevonden: ' + pad });
  res.writeHead(200, { 'Content-Type': SOORTEN[extname(doel)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(doel));
}

async function start() {
  const env = await maakEnv();
  createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (p === '/' || p === '/dashboards' || p === '/dashboards/') {
        if (url.searchParams.get('tab') !== 'instroom') {
          res.writeHead(302, { Location: '/dashboards?tab=instroom' });
          return res.end();
        }
        return bestand(res, 'dashboards.html');
      }
      if (p === '/api/auth/me') return json(res, 200, { user: { id: 'proef', email: env.ODOO_LOGIN || 'proef', role: 'user' }, navbarHtml: NAVBAR });
      if (p === '/dashboards/api/aanvragen') {
        const begin = Date.now();
        const data = await getAanvragen(env, Object.fromEntries(url.searchParams));
        console.log(`aanvragen ${url.search} -> ${Date.now() - begin} ms`);
        return json(res, 200, { success: true, data });
      }
      if (p.startsWith('/dashboards/api/targets')) {
        return json(res, 501, { success: false, error: 'Targets bekijken en bewaren kan enkel in de OM zelf, niet in de proef.' });
      }
      if (p.startsWith('/dashboards/api/') || p.startsWith('/api/')) {
        return json(res, 501, { success: false, error: 'Niet in de proef: die toont enkel het tabblad Aanvragen.' });
      }
      return bestand(res, p.slice(1));
    } catch (err) {
      console.error(err);
      return json(res, 500, { success: false, error: err.message || String(err) });
    }
  }).listen(POORT, () => {
    console.log(`\nProef van het tabblad Aanvragen: http://localhost:${POORT}`);
    console.log(`Odoo als gebruiker ${env.UID}${env.ODOO_LOGIN ? ' (' + env.ODOO_LOGIN + ')' : ''}; targets ${env.SUPABASE_URL ? 'uit Supabase' : 'niet (geen Supabase in .dev.vars)'}.\n`);
  });
}

start().catch((err) => { console.error(err); process.exit(1); });
