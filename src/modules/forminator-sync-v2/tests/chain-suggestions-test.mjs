/**
 * Koppelingsvoorstellen tussen stappen.
 *
 * Waarom deze test bestaat: de fouten hier zijn niet zichtbaar in een functie
 * maar in de KOPPELING tussen scherm en gegevens, en ze zien er alle drie uit
 * als "het werkt gewoon niet zoals verwacht":
 *   - vergelijken op de slug ("company") i.p.v. het echte model
 *     ("res.partner"), waardoor er geen enkel voorstel verschijnt;
 *   - de "al ingesteld"-controle op veldnaam alleen, waardoor alle
 *     "zoek dit record via ..."-voorstellen tegelijk oplichtten zodra je er
 *     een koos -- ze vullen namelijk alle drie hetzelfde veld (`id`);
 *   - berekende velden en chatter-velden die als koppeling aangeboden werden.
 *
 * Het echte bestand wordt uitgevoerd met een nagebootste window, zodat de test
 * de werkelijke code uitoefent en niet een kopie ervan. Geen netwerk, geen
 * database.
 *
 *   node src/modules/forminator-sync-v2/tests/chain-suggestions-test.mjs
 */

import fs from 'node:fs';

// Via een URL en niet via url.pathname: dat laatste laat de procent-codering
// staan, en dit pad bevat een spatie ("Nico Plinke").
const pad = fs.realpathSync(
  new URL('../../../../public/forminator-sync-v2-detail.js', import.meta.url)
);

globalThis.window = { FSV2: {} };
globalThis.document = { getElementById: () => null };
new Function(fs.readFileSync(pad, 'utf8'))();
const FSV2 = globalThis.window.FSV2;

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

function gelijk(werkelijk, verwacht, wat) {
  const a = JSON.stringify(werkelijk);
  const b = JSON.stringify(verwacht);
  if (a !== b) throw new Error(`${wat || 'waarde'}: verwacht ${b}, kreeg ${a}`);
}

function waar(voorwaarde, wat) {
  if (!voorwaarde) throw new Error(wat + ': verwachtte waar, kreeg onwaar');
}

// Echte veldvormen van res.partner (ir.model.fields, relatie naar res.partner)
// plus twee velden die er NIET bij mogen staan.
const PARTNER_VELDEN = [
  { name: 'parent_id',             label: 'Related Company',   type: 'many2one',  relation: 'res.partner', readonly: false },
  { name: 'child_ids',             label: 'Contact',           type: 'one2many',  relation: 'res.partner', readonly: false, relationField: 'parent_id' },
  { name: 'commercial_partner_id', label: 'Commercial Entity', type: 'many2one',  relation: 'res.partner', readonly: true },
  { name: 'x_studio_current_syndic', label: 'Huidige Syndicus', type: 'many2one', relation: 'res.partner', readonly: false },
  { name: 'message_partner_ids',   label: 'Followers',         type: 'many2many', relation: 'res.partner', readonly: false },
  { name: 'email',                 label: 'Email',             type: 'char',      relation: null,          readonly: false },
];

// Twee profielen op HETZELFDE Odoo-model -- precies de opstelling waar het
// eerder op stukliep.
function zetOmgeving() {
  FSV2.S = {
    odooFieldsCache: { 'res.partner': PARTNER_VELDEN, company: PARTNER_VELDEN },
    modelLinksCache: [],
    detail: { _extraRowsByTarget: {}, mappingsByTarget: {} },
  };
  FSV2.getModelCfg = (naam) => ({
    odoo_model: naam === 'company' ? 'res.partner' : naam,
    label: naam === 'company' ? 'Bedrijf' : 'Contact',
  });
}

const stap1 = { id: 't1', odoo_model: 'res.partner', execution_order: 1, label: '' };
const stap2 = { id: 't2', odoo_model: 'company', execution_order: 2, operation_type: 'upsert' };

console.log('\ncomputeChainSuggestions: welke koppelingen worden voorgesteld');

zetOmgeving();
const voorstellen = FSV2.computeChainSuggestions(stap2, [stap1]);
const perVeld = (kind) => voorstellen.filter((s) => s.kind === kind).map((s) => s.odooField + '|' + (s.sourceSuffix || ''));

test('een slug ("company") matcht met het echte model van de vorige stap', () => {
  waar(voorstellen.length > 0, 'aantal voorstellen');
});

test('parent_id/child_ids worden EEN gecombineerd voorstel, niet drie losse', () => {
  gelijk(perVeld('find_and_link'), ['id|parent_id'], 'de gecombineerde kaart');
  waar(!voorstellen.some((s) => s.kind === 'link_x2many' && s.odooField === 'child_ids'),
    'child_ids niet meer los');
  waar(!voorstellen.some((s) => s.kind === 'set_many2one' && s.odooField === 'parent_id'),
    'de tegengestelde richting niet meer los');
  waar(!voorstellen.some((s) => s.kind === 'find_via_field' && s.sourceSuffix === 'parent_id'),
    'het zoeken niet meer los');
});

test('de gecombineerde kaart draagt beide rijen', () => {
  const g = voorstellen.find((s) => s.kind === 'find_and_link');
  gelijk(g.odooField, 'id', 'rij 1: het zoekcriterium');
  gelijk(g.sourceSuffix, 'parent_id', 'rij 1: leest parent_id van stap 1');
  gelijk(g.isIdentifier, true, 'rij 1 is zoekcriterium');
  gelijk(g.isRequired, false, 'rij 1 mag leeg zijn -> dan aanmaken');
  gelijk(g.extraField, 'child_ids', 'rij 2: de terugkoppeling');
});

test('een many2one zonder keerzijde blijft een gewone kaart', () => {
  // x_studio_current_syndic heeft geen lijstveld dat ernaar terugwijst.
  gelijk(perVeld('set_many2one'), ['x_studio_current_syndic|record_id']);
  gelijk(perVeld('find_via_field'), ['id|x_studio_current_syndic']);
});

test('een berekend veld (commercial_partner_id) wordt niet voorgesteld', () => {
  waar(!voorstellen.some((s) => s.odooField === 'commercial_partner_id'), 'commercial_partner_id');
  waar(!voorstellen.some((s) => s.sourceSuffix === 'commercial_partner_id'), 'commercial_partner_id als bron');
});

test('chatter-ruis (message_partner_ids) wordt niet voorgesteld', () => {
  waar(!voorstellen.some((s) => s.odooField === 'message_partner_ids'), 'message_partner_ids');
});

test('elk voorstel draagt zijn eigen uitleg mee', () => {
  voorstellen.forEach((s) => {
    waar(s.titel && s.titel.length > 10, 'titel van ' + s.kind);
    waar(s.uitleg && s.uitleg.length > 10, 'uitleg van ' + s.kind);
  });
});

test('de technische veldnaam staat in de tekst — "Contact" alleen is dubbelzinnig', () => {
  const g = voorstellen.find((s) => s.kind === 'find_and_link');
  waar(g.uitleg.includes('child_ids'), 'child_ids in de uitleg');
  waar(g.uitleg.includes('parent_id'), 'parent_id in de uitleg');
});

test('zoeken wordt NIET voorgesteld bij "altijd nieuw aanmaken"', () => {
  const alleenCreate = FSV2.computeChainSuggestions({ ...stap2, operation_type: 'create' }, [stap1]);
  waar(!alleenCreate.some((s) => s.kind === 'find_via_field'), 'find_via_field bij create');
});

test('schrijven wordt NIET voorgesteld bij een zoekstap', () => {
  const alleenSearch = FSV2.computeChainSuggestions({ ...stap2, operation_type: 'search' }, [stap1]);
  waar(!alleenSearch.some((s) => s.kind === 'set_many2one' || s.kind === 'link_x2many'), 'schrijfvoorstellen bij search');
});

console.log('\nisChainSuggestionApplied: de BRON telt mee, niet alleen het veld');

test('twee voorstellen op hetzelfde veld lichten niet samen op', () => {
  zetOmgeving();
  FSV2.S.detail._extraRowsByTarget.t2 = [
    { odooField: 'id', sourceType: 'previous_step_output', staticValue: 'step.1.parent_id' },
  ];
  waar(FSV2.isChainSuggestionApplied('t2', 'id', 'step.1.parent_id'), 'de gekozen koppeling');
  waar(!FSV2.isChainSuggestionApplied('t2', 'id', 'step.1.x_studio_current_syndic'), 'de niet-gekozen koppeling');
});

test('het veld geldt wel als ingenomen door die andere koppeling', () => {
  waar(FSV2.isChainFieldTaken('t2', 'id', 'step.1.x_studio_current_syndic'), 'veld ingenomen');
  waar(!FSV2.isChainFieldTaken('t2', 'id', 'step.1.parent_id'), 'door zichzelf ingenomen');
});

test('zonder bron blijft de oude controle op veldnaam werken', () => {
  waar(FSV2.isChainSuggestionApplied('t2', 'id'), 'oude aanroepvorm');
});

test('hasAnyChainLink ziet de koppeling', () => {
  waar(FSV2.hasAnyChainLink('t2'), 'stap met koppeling');
  waar(!FSV2.hasAnyChainLink('t1'), 'stap zonder koppeling');
});

test('een lege lijst in het geheugen wint van de database', () => {
  zetOmgeving();
  FSV2.S.detail.mappingsByTarget.t2 = [
    { odoo_field: 'parent_id', source_type: 'previous_step_output', source_value: 'step.1.record_id' },
  ];
  waar(FSV2.hasAnyChainLink('t2'), 'zonder bewerking: database telt');
  FSV2.S.detail._extraRowsByTarget.t2 = [];
  waar(!FSV2.hasAnyChainLink('t2'), 'na ontkoppelen: geheugen telt');
});

console.log('\nchainRowsFor: veld en bron van elke koppeling');

test('geeft alleen de koppelingen terug, met hun bron', () => {
  zetOmgeving();
  FSV2.S.detail._extraRowsByTarget.t2 = [
    { odooField: 'id',        sourceType: 'previous_step_output', staticValue: 'step.1.parent_id' },
    { odooField: 'child_ids', sourceType: 'previous_step_output', staticValue: 'step.1.record_id' },
    { odooField: 'name',      sourceType: 'form',                 staticValue: 'naam_vme' },
  ];
  gelijk(FSV2.chainRowsFor('t2'), [
    { odooField: 'id',        source: 'step.1.parent_id' },
    { odooField: 'child_ids', source: 'step.1.record_id' },
  ], 'koppelingen met hun bron');
});

console.log('\npairKey: blijft bestaan voor kaarten zonder gecombineerde variant');

test('een lijstveld zonder tegenveld krijgt geen sleutel en blijft los staan', () => {
  zetOmgeving();
  FSV2.S.odooFieldsCache.company = PARTNER_VELDEN.map((f) =>
    f.name === 'child_ids' ? { ...f, relationField: undefined } : f
  );
  const alle = FSV2.computeChainSuggestions(stap2, [stap1]);
  const lijst = alle.find((s) => s.kind === 'link_x2many' && s.odooField === 'child_ids');
  waar(lijst, 'zonder keerzijde geen combinatie, dus wel een losse kaart');
  waar(!lijst.pairKey, 'en geen paarsleutel');
  waar(!alle.some((s) => s.kind === 'find_and_link'), 'geen gecombineerde kaart');
});

test('zonder combinatie delen parent_id en child_ids wel een sleutel', () => {
  zetOmgeving();
  FSV2.S.odooFieldsCache['res.partner'] = PARTNER_VELDEN.filter((f) => f.name !== 'parent_id');
  const alle = FSV2.computeChainSuggestions(stap2, [stap1]);
  const zetten = alle.find((s) => s.kind === 'set_many2one' && s.odooField === 'parent_id');
  const lijst  = alle.find((s) => s.kind === 'link_x2many' && s.odooField === 'child_ids');
  gelijk(lijst.pairKey, zetten.pairKey, 'dezelfde relatie, dezelfde sleutel');
});

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald ? 1 : 0);
