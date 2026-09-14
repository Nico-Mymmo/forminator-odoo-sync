/**
 * De vorm "step.<stap>.<waarde>" staat op VIER plekken, en ze moeten het eens
 * zijn.
 *
 * Waarom deze test bestaat: ze waren het NIET eens, en dat is niet zichtbaar in
 * de code maar wel op het scherm. De server eiste `.record_id`, terwijl het
 * scherm en de pipeline een veldnaam allang aankonden -- je stelde een
 * koppeling in, ze werkte in de voorvertoning, en pas bij Opslaan kwam er
 * "previous_step_output bronwaarde moet de vorm step.<stap_of_label>.record_id
 * hebben", over een vorm die je nergens gekozen had. En de twee patronen in het
 * scherm stonden de stapaanduiding geen punt toe, waardoor een stap met een
 * punt in haar label daar stil weggegooid werd terwijl de server hem accepteerde.
 *
 * Eén gedeelde bron kan niet: twee van de vier zijn Worker-code en twee zijn
 * browsercode zonder modules. Deze test leest daarom de vier patronen uit de
 * bestanden zelf en houdt ze tegen dezelfde voorbeelden. Zelfde aanpak als
 * replay-status-parity-test.mjs.
 *
 *   node src/modules/forminator-sync-v2/tests/chain-source-parity-test.mjs
 */

import fs from 'node:fs';

function lees(relatief) {
  return fs.readFileSync(new URL(relatief, import.meta.url), 'utf8');
}

// Per plek: een merkteken dat VOOR het patroon staat. Daarna pakken we het
// eerste /^step\.…/ dat volgt. Op de haakjes van de regex zelf kan je niet
// zoeken -- die zitten in het patroon dat we willen lezen.
const BRONNEN = [
  {
    naam: 'server — enforceChainReferenceOrder (routes.js)',
    bestand: '../routes.js',
    merkteken: 'async function enforceChainReferenceOrder',
  },
  {
    naam: 'pipeline — collectRequestedStepFields (worker-handler.js)',
    bestand: '../worker-handler.js',
    merkteken: 'function collectRequestedStepFields',
  },
  {
    naam: 'scherm — opslaan van een koppelrij (detail-mapping-tab.js)',
    bestand: '../../../../public/forminator-sync-v2-detail-mapping-tab.js',
    merkteken: 'Chain rows (previous_step_output)',
  },
  {
    naam: 'scherm — "Gekoppeld aan stap N" (detail-mapping-tab.js)',
    bestand: '../../../../public/forminator-sync-v2-detail-mapping-tab.js',
    merkteken: 'chainSourceRows.forEach(function (sourceVal) {',
  },
];

// Een regexliteral die met /^step\. begint, tot de sluitende /.
const PATROON_IN_CODE = /\/\^step\\\.[^/\n]*\//;

function haalPatroon(bron) {
  const inhoud = lees(bron.bestand);
  const start = inhoud.indexOf(bron.merkteken);
  if (start < 0) return null;
  const treffer = PATROON_IN_CODE.exec(inhoud.slice(start));
  return treffer ? treffer[0] : null;
}

// Wat wel en niet mag. De eerste kolom is de bronwaarde, de tweede of elk van
// de vier patronen ze hoort te accepteren.
const VOORBEELDEN = [
  ['step.1.record_id', true],
  ['step.2.parent_id', true],
  ['step.10.x_studio_current_syndic', true],
  ['step.Contact zoeken.parent_id', true],
  ['step.Stap 1.5 herhaling.parent_id', true],   // label met een punt
  ['step.1', false],
  ['step..record_id', false],
  ['step.1.', false],
  ['stap.1.record_id', false],
  ['', false],
  ['step.1.record_id.extra', true],              // laatste segment = het veld
];

let geslaagd = 0;
let gefaald = 0;

function test(naam, fn) {
  try {
    fn();
    geslaagd++;
    console.log('  ✓ ' + naam);
  } catch (error) {
    gefaald++;
    console.log('  ✗ ' + naam);
    console.log('      ' + error.message);
  }
}

console.log('\nde vier patronen worden gevonden');

const patronen = BRONNEN.map((bron) => {
  const literal = haalPatroon(bron);
  test(bron.naam, () => {
    if (!literal) {
      throw new Error('patroon niet gevonden — is de code herschreven? Werk deze test bij.');
    }
  });
  if (!literal) return null;
  return { naam: bron.naam, re: new RegExp(literal.slice(1, -1)) };   // /.../ → ...
}).filter(Boolean);

console.log('\nalle vier oordelen hetzelfde over dezelfde bronwaarde');

VOORBEELDEN.forEach(([waarde, hoortTeMatchen]) => {
  test(`"${waarde}" → ${hoortTeMatchen ? 'geldig' : 'ongeldig'}`, () => {
    const afwijkend = patronen.filter((p) => p.re.test(waarde) !== hoortTeMatchen);
    if (afwijkend.length) {
      throw new Error('oneens: ' + afwijkend.map((p) => p.naam).join(' + '));
    }
  });
});

console.log('\nde stapaanduiding komt er bij alle patronen met een groep hetzelfde uit');

test('label met een punt levert overal dezelfde stapaanduiding', () => {
  const metGroep = patronen.filter((p) => p.re.exec('step.Stap 1.5 herhaling.parent_id')?.length > 1);
  const refs = metGroep.map((p) => p.re.exec('step.Stap 1.5 herhaling.parent_id')[1]);
  const uniek = [...new Set(refs)];
  if (uniek.length > 1) {
    throw new Error('verschillende stapaanduidingen: ' + JSON.stringify(uniek));
  }
  if (uniek.length && uniek[0] !== 'Stap 1.5 herhaling') {
    throw new Error('verwacht "Stap 1.5 herhaling", kreeg ' + JSON.stringify(uniek[0]));
  }
});

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald ? 1 : 0);
