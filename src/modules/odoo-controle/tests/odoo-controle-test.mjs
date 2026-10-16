/**
 * Odoo-controle -- tests zonder netwerk, database of Anthropic-sleutel.
 *
 *   node src/modules/odoo-controle/tests/odoo-controle-test.mjs
 *
 * Wat vastligt:
 * - de statusregel (geen fout > opgelost > wacht > bezig > open), hier én in
 *   public/odoo-controle.js (dezelfde functie, letterlijk vergeleken);
 * - de omzetting van de claude.ai-export (lib/import.js): aantallen, 'andere'
 *   valt weg, meerdere patronen per case, les <- regel;
 * - het skill-concept: Odoo-links in debugmodus, enkel labels met een cijfer;
 * - de drie prompts bevatten wat Claude nodig heeft, en de system-prompt past
 *   binnen de grens van askAI().
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statusVan, isAfgehandeld, odooUrl, PRIO } from '../lib/constants.js';
import { zetExportOm, patronenVanCase } from '../lib/import.js';
import { skillMarkdown, refIndex, mdLinks } from '../lib/skill.js';
import { patroonPrompt, casePrompt, patroonZoekPrompt } from '../lib/ai.js';
import { MAX_SYSTEM_LENGTH } from '../../mini-apps/lib/ai.js';

let n = 0;
const test = (naam, fn) => { fn(); n += 1; console.log(`  ok  ${naam}`); };

// ─── Status ─────────────────────────────────────────────────────────────────

test('status: afleiding in de juiste volgorde', () => {
  assert.equal(statusVan({}), 'open');
  assert.equal(statusVan({ onderzocht: true }), 'bezig');
  assert.equal(statusVan({ rechtgezet: true }), 'bezig');
  assert.equal(statusVan({ onderzocht: true, vasthouden: true }), 'wacht');
  assert.equal(statusVan({ vasthouden: true }), 'wacht');
  assert.equal(statusVan({ onderzocht: true, rechtgezet: true, vasthouden: true }), 'opgelost');
  assert.equal(statusVan({ geen_fout: true, onderzocht: true, rechtgezet: true }), 'geenfout');
  assert.equal(isAfgehandeld({ geen_fout: true }), true);
  assert.equal(isAfgehandeld({ onderzocht: true }), false);
});

test('status: het scherm gebruikt dezelfde regel', () => {
  const server = readFileSync(new URL('../lib/constants.js', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../../../public/odoo-controle.js', import.meta.url), 'utf8');
  const kern = (src) => {
    const m = /function statusVan\(c\) \{([\s\S]*?)\n\s*\}/.exec(src);
    assert.ok(m, 'statusVan gevonden');
    return m[1].replace(/\s+/g, ' ').replace(/const |var /g, '').trim();
  };
  assert.equal(kern(client), kern(server));
});

// ─── Import ─────────────────────────────────────────────────────────────────

const voorbeeld = {
  cases: [
    { id: 'c001', data: { nr: 1, klant: 'SBS 745', klanttype: 'VME in beheer', prio: 'dringend', prioRang: 1, domein: 'abonnement', zekerheid: 'zeker', soort: 'dubbel',
      deadline: '2026-10-21', bevinding: 'Start 21/10/2025. CFVK/2025/00201 is gecrediteerd.', voorstel: 'Datum terugzetten op S00514.',
      refs: [{ id: 514, label: 'S00514', model: 'sale.order' }, { id: 17311, label: 'CFVK/2025/00201', model: 'account.move' }, { id: 1, label: 'x', model: 'onbekend.model' }],
      stappen: { onderzocht: true, rechtgezet: true, regel: false }, geenFout: false, watGebeurde: 'Twee facturen op S00514.', actie: '', regel: 'Een les.',
      oorzaak: 'startfactuur-dubbel', patroon: 'startfactuur-dubbel', bijgewerkt: '2026-10-13T11:22:04.670Z', door: 'u_abc' } },
    { id: 'c002', data: { nr: 2, klant: 'Res. Acacia', prio: 'hoog', domein: 'facturatie', oorzaken: ['dubbel-abonnement', 'startfactuur-dubbel', 'dubbel-abonnement'], vasthouden: true, inOpenvme: true } },
    { id: 'c003', data: { nr: 3, klant: 'Zonder patroon', prio: 'onbestaand', domein: 'crm', oorzaak: 'andere' } },
  ],
  patterns: [
    { id: 'startfactuur-dubbel', data: { nr: 1, titel: 'Startfactuur dubbel', regel: 'Eén startfactuur.', controle: 'Geen twee facturen voor dezelfde periode.', bijgewerkt: '2026-10-13T12:00:00.000Z' } },
    { id: 'dubbel-abonnement', data: { nr: 2, titel: 'Dubbel abonnement', bronCase: 'c002' } },
    { id: 'andere', data: { nr: 99, titel: 'Andere oorzaak' } },
  ],
  meta: [{ id: 'info', data: { stand: '2026-10-09', odoo: 'https://mymmo.odoo.com' } }],
};

test('import: patronen per case, zonder "andere" en zonder dubbels', () => {
  assert.deepEqual(patronenVanCase(voorbeeld.cases[0].data), ['startfactuur-dubbel']);
  assert.deepEqual(patronenVanCase(voorbeeld.cases[1].data), ['dubbel-abonnement', 'startfactuur-dubbel']);
  assert.deepEqual(patronenVanCase(voorbeeld.cases[2].data), []);
});

test('import: de omzetting naar rijen', () => {
  const r = zetExportOm(voorbeeld, { tijd: '2026-10-16T08:00:00.000Z' });
  assert.equal(r.patterns.length, 2, "'andere' wordt niet overgenomen");
  assert.equal(r.cases.length, 3);
  assert.equal(r.links.length, 3);
  const c1 = r.cases[0];
  assert.equal(c1.les, 'Een les.', 'de les heette vroeger regel');
  assert.equal(c1.onderzocht, true); assert.equal(c1.rechtgezet, true); assert.equal(c1.geen_fout, false);
  assert.equal(c1.refs.length, 2, 'een ref met een onbekend model valt weg');
  assert.equal(c1.door_naam, null, 'claude.ai-gebruikers zeggen hier niets');
  assert.equal(c1.deadline, '2026-10-21');
  assert.equal(c1.aangemaakt, '2026-10-13T11:22:04.670Z');
  const c2 = r.cases[1];
  assert.equal(c2.vasthouden, true); assert.equal(c2.in_openvme, true); assert.equal(c2.soort, 'onbekend');
  assert.deepEqual(r.links.filter((l) => l.case_id === 'c002').map((l) => [l.pattern_id, l.pos]), [['dubbel-abonnement', 0], ['startfactuur-dubbel', 1]]);
  const c3 = r.cases[2];
  assert.equal(c3.prio, 'laag', 'een onbekende prioriteit wordt de laagste');
  assert.equal(c3.prio_rang, PRIO[PRIO.length - 1].rang);
  assert.ok(r.meta.some((m) => m.key === 'info.stand' && m.value === '2026-10-09'));
  assert.ok(r.meta.some((m) => m.key === 'import.laatste'));
  assert.equal(r.patterns[1].bron_case, 'c002');
});

test('import: de echte export van 16/10 (als die naast de test staat)', () => {
  let data;
  try {
    data = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
  } catch {
    console.log('      (geen fixtures/data.json; overgeslagen)');
    return;
  }
  const r = zetExportOm(data);
  assert.equal(r.cases.length, 86);
  assert.equal(r.patterns.length, 24);
  assert.equal(r.links.length, 88);
});

test('import: weigert iets wat geen export is', () => {
  assert.throws(() => zetExportOm({ foo: 1 }), /geen export/);
});

// ─── Skill ──────────────────────────────────────────────────────────────────

test('skill: Odoo-links in debugmodus, enkel labels met een cijfer', () => {
  const rijen = zetExportOm(voorbeeld);
  const cases = rijen.cases.map((c) => ({ ...c, patterns: rijen.links.filter((l) => l.case_id === c.id).map((l) => l.pattern_id) }));
  const idx = refIndex(cases);
  assert.ok(idx.idx.has('S00514') && idx.idx.has('CFVK/2025/00201'));
  assert.ok(!idx.idx.has('x'));
  assert.equal(mdLinks('Zie S00514 en CFVK/2025/00201.', idx), `Zie [S00514](${odooUrl({ id: 514, model: 'sale.order' })}) en [CFVK/2025/00201](${odooUrl({ id: 17311, model: 'account.move' })}).`);
  assert.equal(mdLinks('S005140 is iets anders', idx), 'S005140 is iets anders', 'geen deelmatch');
  const md = skillMarkdown({ cases, patterns: rijen.patterns, meta: { 'info.stand': '2026-10-09' } });
  assert.ok(md.startsWith('---\nname: offerte-en-factuurbeheer'));
  assert.ok(md.includes('debug=1'));
  assert.ok(md.includes('### 1. Startfactuur dubbel'));
  assert.ok(md.includes('**Regel:** Eén startfactuur.'));
  assert.ok(md.includes('- [ ] Geen twee facturen voor dezelfde periode.'));
  assert.ok(md.includes('3 cases, waarvan 1 afgehandeld'));
  assert.ok(md.includes('Les: Een les.'));
});

// ─── Prompts ────────────────────────────────────────────────────────────────

test('prompts: system-prompt past binnen de grens van askAI()', async () => {
  const src = readFileSync(new URL('../lib/ai.js', import.meta.url), 'utf8');
  const m = /const SYSTEM = \[([\s\S]*?)\]\.join\(' '\);/.exec(src);
  assert.ok(m);
  const tekst = m[1].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^'|',?$/g, '')).join(' ');
  assert.ok(tekst.length < MAX_SYSTEM_LENGTH, `system ${tekst.length} < ${MAX_SYSTEM_LENGTH}`);
});

test('prompts: patroon, case en zoeken bevatten wat Claude nodig heeft', () => {
  const rijen = zetExportOm(voorbeeld);
  const cases = rijen.cases.map((c) => ({ ...c, patterns: rijen.links.filter((l) => l.case_id === c.id).map((l) => l.pattern_id) }));
  const [p1, p2] = rijen.patterns;
  const pp = patroonPrompt(p1, cases.filter((c) => c.patterns.includes(p1.id)), rijen.patterns);
  assert.ok(pp.includes('## Cases bij dit patroon (2)'));
  assert.ok(pp.includes('#1 SBS 745 (Opgelost)'));
  assert.ok(pp.includes('#2 Res. Acacia (Wacht op goedkeuring)'));
  assert.ok(pp.includes('Wat er gedaan werd (in OpenVME)') === false, 'c002 heeft geen actie');
  assert.ok(pp.includes('- Dubbel abonnement | Regel: -'));
  assert.ok(!pp.includes('- Startfactuur dubbel |'), 'het patroon zelf staat niet bij de andere');

  const c1 = cases[0];
  const cp = casePrompt(c1, { wat_gebeurde: 'A', actie: 'B', complicaties: '', les: 'C' }, [p1], '');
  assert.ok(cp.includes('Referenties in Odoo: order S00514, factuur CFVK/2025/00201'));
  assert.ok(cp.includes('Stappen: onderzocht ja, rechtgezet in odoo ja'));
  assert.ok(cp.includes('Regel van het patroon: Eén startfactuur.'));
  assert.ok(cp.includes('Wat er gebeurde: A') && cp.includes('Les voor het patroon: C') && cp.includes('Opmerkingen: complicaties: (leeg)'));
  assert.ok(!cp.includes('live in Odoo'));
  const cpo = casePrompt(cases[1], {}, [], '### order S1\nstate: sale');
  assert.ok(cpo.includes('## Wat er nu live in Odoo staat') && cpo.includes('state: sale'));
  assert.ok(cpo.includes('Waar rechtzetten: in OpenVME (niet in Odoo). Staat op: wacht op goedkeuring'));

  const zp = patroonZoekPrompt(cases[1], rijen.patterns, { hint: 'dubbel contract' });
  assert.ok(zp.includes('Toelichting van de medewerker: dubbel contract'));
  assert.ok(zp.includes('Patronen die al aan de case hangen (niet opnieuw voorstellen): Dubbel abonnement; Startfactuur dubbel'));
  assert.ok(zp.includes('## Bestaande patronen\n(geen)'), 'alle patronen hangen al aan c002');
  const zp2 = patroonZoekPrompt(cases[2], rijen.patterns, { forceNew: true });
  assert.ok(zp2.includes('- id: startfactuur-dubbel') && zp2.includes('- id: dubbel-abonnement'));
  assert.ok(zp2.includes('uitdrukkelijk een NIEUW patroon'));
  assert.equal(p2.titel, 'Dubbel abonnement');
});

console.log(`\n${n} tests geslaagd.`);
