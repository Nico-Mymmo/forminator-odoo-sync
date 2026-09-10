/**
 * Bieden het scherm en de server dezelfde replay aan?
 *
 *   node src/modules/forminator-sync-v2/tests/replay-status-parity-test.mjs
 *
 * De lijst statussen waarvoor replay mag, staat op TWEE plekken: in
 * worker-handler.js (die beslist) en in de indieningentab (die de knop toont).
 * Ze in één bestand zetten kan niet -- het ene is Worker-code, het andere
 * browsercode die geen modules importeert.
 *
 * Lopen ze uit elkaar, dan is dat niet zichtbaar in de code maar wel op het
 * scherm: je drukt op een knop en krijgt "Replay not allowed for status: ...".
 * Dat gebeurde toen 'received' wel in de UI stond en nog niet op de server.
 *
 * Deze test leest beide lijsten en vergelijkt ze. Hetzelfde patroon als
 * form-preview-parity-test.mjs voor de twee renderers: dubbel is toegestaan,
 * uit elkaar lopen niet.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const wortel = join(hier, '..', '..', '..', '..');
const uiBestand = join(wortel, 'public', 'forminator-sync-v2-detail-submissions-tab.js');
const workerBestand = join(hier, '..', 'worker-handler.js');

let geslaagd = 0;
let gefaald = 0;

function test(naam, fn) {
  try {
    fn();
    geslaagd += 1;
    console.log(`  ✓ ${naam}`);
  } catch (err) {
    gefaald += 1;
    console.error(`  ✗ ${naam}\n    ${err.message}`);
  }
}

/**
 * De lijst uit een bronbestand vissen.
 *
 * Bewust op de NAAM van de constante en niet op de inhoud: zo blijft de test
 * werken als er een status bijkomt, en faalt hij met een leesbare melding als
 * iemand de constante hernoemt of inlinet -- wat precies het soort wijziging is
 * waardoor de twee lijsten weer uit elkaar zouden groeien.
 */
function leesLijst(pad, naam) {
  const bron = readFileSync(pad, 'utf8');
  const patroon = new RegExp(naam + String.raw`\s*=\s*\[([^\]]*)\]`);
  const treffer = bron.match(patroon);
  assert.ok(treffer, `${naam} niet gevonden in ${pad} — is ze hernoemd of geïnlined?`);
  return treffer[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const uiLijst = leesLijst(uiBestand, 'REPLAYBARE_STATUSSEN');
const serverLijst = leesLijst(workerBestand, 'REPLAYABLE_STATUSES');

console.log('\nDe twee lijsten');
console.log(`  scherm : ${uiLijst.join(', ')}`);
console.log(`  server : ${serverLijst.join(', ')}`);
console.log('');

test('beide lijsten zijn gevonden en niet leeg', () => {
  assert.ok(uiLijst.length > 0);
  assert.ok(serverLijst.length > 0);
});

test('het scherm belooft niets wat de server weigert', () => {
  const teveel = uiLijst.filter((s) => !serverLijst.includes(s));
  assert.deepEqual(teveel, [],
    `het scherm toont een Replay-knop voor ${teveel.join(', ')}, maar de server weigert die`);
});

test('het scherm verstopt geen replay die de server wél zou doen', () => {
  const gemist = serverLijst.filter((s) => !uiLijst.includes(s));
  assert.deepEqual(gemist, [],
    `de server staat replay toe voor ${gemist.join(', ')}, maar er komt geen knop voor`);
});

test("'received' staat er bij", () => {
  assert.ok(serverLijst.includes('received'),
    'een inzending die bewaard werd terwijl de koppeling uit stond, is nooit verwerkt — replay is de enige weg');
  assert.ok(uiLijst.includes('received'));
});

test('een inzending die nog LOOPT is niet replaybaar', () => {
  for (const status of ['running', 'retry_running', 'scheduled']) {
    assert.ok(!serverLijst.includes(status),
      `${status} betekent dat er al iets bezig is; replay zou dat verdubbelen`);
  }
});

test('een geslaagde inzending is niet zomaar replaybaar', () => {
  for (const status of ['success', 'processed']) {
    assert.ok(!serverLijst.includes(status),
      `${status} opnieuw uitvoeren zou een tweede record in Odoo kunnen maken`);
  }
});

test('een duplicaat is niet replaybaar', () => {
  for (const status of ['duplicate_ignored', 'duplicate_inflight']) {
    assert.ok(!serverLijst.includes(status));
  }
});

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
