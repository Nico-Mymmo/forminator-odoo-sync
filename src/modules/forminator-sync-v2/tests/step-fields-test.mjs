/**
 * Velden van een vorige stap lezen (step.<stap>.<veld>) + een leeg
 * zoekcriterium dat uit een vorige stap komt.
 *
 * Waarom deze test bestaat: de combinatie hieronder is wat "heeft dit contact
 * al een VME? zo ja bijwerken, zo nee aanmaken" mogelijk maakt, en ze is niet
 * met het blote oog te controleren -- ze leeft in drie stukken code die elkaar
 * moeten begrijpen (welke velden opgehaald worden, hoe Odoo ze teruggeeft, en
 * wat een leeg zoekcriterium betekent). Loopt er een uit elkaar, dan ziet een
 * gebruiker geen fout maar een stil verkeerde uitkomst: een tweede VME per
 * inzending, of een stap die overgeslagen wordt.
 *
 * Draait zonder netwerk en zonder database.
 *
 *   node src/modules/forminator-sync-v2/tests/step-fields-test.mjs
 */

import {
  collectRequestedStepFields,
  fieldsWantedForTarget,
  normalizeOdooFieldValue,
  buildIdentifierDomainForTarget,
  wrapX2ManyValue,
} from '../worker-handler.js';

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

function gooit(fn, wat) {
  let gegooid = false;
  try { fn(); } catch (_) { gegooid = true; }
  if (!gegooid) throw new Error(`${wat}: verwachtte een fout, kreeg er geen`);
}

const chain = (veld, bron, extra = {}) => ({
  odoo_field: veld,
  source_type: 'previous_step_output',
  source_value: bron,
  is_identifier: true,
  is_required: true,
  ...extra,
});

console.log('\ncollectRequestedStepFields: welke velden moeten opgehaald worden');

test('record_id, action en generated_id zijn GEEN Odoo-velden', () => {
  const wanted = collectRequestedStepFields({
    t1: [chain('parent_id', 'step.1.record_id')],
    t2: [chain('x', 'step.1.action'), chain('y', 'step.2.generated_id')],
  });
  gelijk(wanted.size, 0, 'aantal stappen met gevraagde velden');
});

test('een echt veld wordt wel opgehaald', () => {
  const wanted = collectRequestedStepFields({
    t1: [chain('id', 'step.1.parent_id')],
  });
  gelijk([...(wanted.get('1') || [])], ['parent_id']);
});

test('meerdere velden van dezelfde stap komen samen', () => {
  const wanted = collectRequestedStepFields({
    t1: [chain('id', 'step.1.parent_id')],
    t2: [chain('x', 'step.1.email'), chain('y', 'step.1.parent_id')],
  });
  gelijk([...wanted.get('1')].sort(), ['email', 'parent_id']);
});

test('een stap aangeduid met een label werkt ook', () => {
  const wanted = collectRequestedStepFields({
    t1: [chain('id', 'step.Contact zoeken.parent_id')],
  });
  gelijk([...(wanted.get('Contact zoeken') || [])], ['parent_id']);
});

test('andere brontypes worden genegeerd', () => {
  const wanted = collectRequestedStepFields({
    t1: [{ odoo_field: 'a', source_type: 'form', source_value: 'step.1.parent_id' }],
  });
  gelijk(wanted.size, 0);
});

test('geen enkele mapping die het gebruikt = geen enkele extra Odoo-call', () => {
  const wanted = collectRequestedStepFields({ t1: [chain('parent_id', 'step.1.record_id')] });
  gelijk(fieldsWantedForTarget(wanted, { execution_order: 1 }), []);
});

console.log('\nfieldsWantedForTarget: matcht op volgnummer en op label');

test('op volgnummer', () => {
  const wanted = collectRequestedStepFields({ t1: [chain('id', 'step.2.parent_id')] });
  gelijk(fieldsWantedForTarget(wanted, { execution_order: 2 }), ['parent_id']);
});

test('op label', () => {
  const wanted = collectRequestedStepFields({ t1: [chain('id', 'step.Zoek contact.email')] });
  gelijk(fieldsWantedForTarget(wanted, { execution_order: 7, label: 'Zoek contact' }), ['email']);
});

test('een andere stap krijgt niets', () => {
  const wanted = collectRequestedStepFields({ t1: [chain('id', 'step.2.parent_id')] });
  gelijk(fieldsWantedForTarget(wanted, { execution_order: 3 }), []);
});

console.log('\nnormalizeOdooFieldValue: wat Odoo teruggeeft is niet wat een domain wil');

test('een many2one komt als [id, naam] en wordt het id', () => {
  gelijk(normalizeOdooFieldValue([938261, 'VME FINALSTRAW']), 938261);
});

test('een leeg veld komt als false en wordt null', () => {
  gelijk(normalizeOdooFieldValue(false), null);
});

test('een lege many2one-array wordt ook null', () => {
  gelijk(normalizeOdooFieldValue([]), null);
});

test('0 blijft 0 en wordt niet stil leeg', () => {
  gelijk(normalizeOdooFieldValue(0), 0);
});

test('een gewone waarde blijft ongemoeid', () => {
  gelijk(normalizeOdooFieldValue('nico@mymmo.com'), 'nico@mymmo.com');
});

console.log('\nbuildIdentifierDomainForTarget: leeg zoekcriterium uit een vorige stap');

const upsert = { identifier_type: 'mapped_fields', odoo_model: 'res.partner' };

test('een gevulde koppeling geeft gewoon een domain', () => {
  const domein = buildIdentifierDomainForTarget(
    upsert,
    [chain('id', 'step.1.parent_id', { is_required: false })],
    {},
    { 'step.1.parent_id': 938261 }
  );
  gelijk(domein, [['id', '=', 938261]]);
});

test('leeg + NIET verplicht geeft null (= niets om bij te werken)', () => {
  const domein = buildIdentifierDomainForTarget(
    upsert,
    [chain('id', 'step.1.parent_id', { is_required: false })],
    {},
    { 'step.1.parent_id': null }
  );
  gelijk(domein, null);
});

test('leeg + WEL verplicht blijft een harde fout', () => {
  gooit(() => buildIdentifierDomainForTarget(
    upsert,
    [chain('id', 'step.1.parent_id', { is_required: true })],
    {},
    { 'step.1.parent_id': null }
  ), 'verplichte lege koppeling');
});

test('een leeg FORMULIERveld blijft een harde fout, ook zonder verplicht', () => {
  gooit(() => buildIdentifierDomainForTarget(
    upsert,
    [{ odoo_field: 'email', source_type: 'form', source_value: 'email', is_identifier: true, is_required: false }],
    {},
    {}
  ), 'leeg formulierveld');
});

test('meerdere criteria: alle waarden komen in het domain', () => {
  const domein = buildIdentifierDomainForTarget(
    upsert,
    [
      { odoo_field: 'email', source_type: 'form', source_value: 'email', is_identifier: true },
      chain('parent_id', 'step.1.record_id', { is_required: false }),
    ],
    { email: 'nico@mymmo.com' },
    { 'step.1.record_id': 42 }
  );
  gelijk(domein, [['email', '=', 'nico@mymmo.com'], ['parent_id', '=', 42]]);
});

test('0 als waarde telt als ingevuld, niet als leeg', () => {
  const domein = buildIdentifierDomainForTarget(
    upsert,
    [chain('x_studio_soid', 'step.1.x_studio_soid', { is_required: false })],
    {},
    { 'step.1.x_studio_soid': 0 }
  );
  gelijk(domein, [['x_studio_soid', '=', 0]]);
});

console.log('\nwrapX2ManyValue: een lijstveld schrijf je met een Odoo-commando');

test('one2many met een id wordt [[4, id]] (koppelen, niet vervangen)', () => {
  gelijk(wrapX2ManyValue(938260, 'one2many'), [[4, 938260]]);
});

test('many2many idem', () => {
  gelijk(wrapX2ManyValue(938260, 'many2many'), [[4, 938260]]);
});

test('een id als tekst werkt ook', () => {
  gelijk(wrapX2ManyValue('938260', 'one2many'), [[4, 938260]]);
});

test('een many2one blijft een kaal id', () => {
  gelijk(wrapX2ManyValue(938260, 'many2one'), 938260);
});

test('een tekstveld blijft tekst', () => {
  gelijk(wrapX2ManyValue('VME FINALSTRAW', 'char'), 'VME FINALSTRAW');
});

test('onbekend veldtype (Odoo onbereikbaar) laat de waarde ongemoeid', () => {
  gelijk(wrapX2ManyValue(938260, undefined), 938260);
});

test('een bestaande commandolijst wordt niet nog eens ingepakt', () => {
  gelijk(wrapX2ManyValue([[4, 1]], 'one2many'), [[4, 1]]);
});

test('geen geldig id: ongemoeid laten in plaats van onzin sturen', () => {
  gelijk(wrapX2ManyValue('nico@mymmo.com', 'many2many'), 'nico@mymmo.com');
  gelijk(wrapX2ManyValue(0, 'one2many'), 0);
});

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald ? 1 : 0);
