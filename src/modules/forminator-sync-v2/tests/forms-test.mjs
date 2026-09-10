/**
 * Tests voor de formulierlaag van Koppelingen.
 *
 * Draait zonder netwerk, zonder Supabase en zonder Odoo:
 *   node src/modules/forminator-sync-v2/tests/forms-test.mjs
 *
 * Wat hier bewaakt wordt zijn precies de dingen die stil fout kunnen gaan:
 * de payloadvorm die worker-handler.js verwacht, de sleutel-op-slot-regel, en
 * dat een keuzeveld geen willekeurige waarde doorlaat.
 */

import assert from 'node:assert/strict';
import {
  FIELD_TYPES,
  slugifyForm,
  normalizeFieldKey,
  validateFormDefinition,
  validateSubmissionValues,
  buildPipelinePayload,
  toPublicFormPayload,
  toPublicFormListItem,
  LANGUAGES,
  MESSAGES,
  t,
  pickText,
} from '../forms/schema.js';

let geslaagd = 0;
let gefaald = 0;

function test(naam, fn) {
  try {
    fn();
    geslaagd += 1;
    console.log(`  ✓ ${naam}`);
  } catch (err) {
    gefaald += 1;
    console.error(`  ✗ ${naam}`);
    console.error(`    ${err.message}`);
  }
}

function veld(overrides = {}) {
  return {
    field_key: 'email',
    field_type: 'email',
    label: 'E-mailadres',
    is_required: true,
    options: [],
    validation: {},
    default_value: null,
    ...overrides,
  };
}

console.log('\nSlugs en veldnamen');

test('slugifyForm haalt diakritieken en leestekens weg', () => {
  assert.equal(slugifyForm('Offerte Technisch Beheer'), 'offerte-technisch-beheer');
  assert.equal(slugifyForm('Vraag & Antwoord'), 'vraag-en-antwoord');
  assert.equal(slugifyForm('Réunion générale'), 'reunion-generale');
  assert.equal(slugifyForm('  --rare--  '), 'rare');
});

test('normalizeFieldKey levert altijd een geldige sleutel of niets', () => {
  assert.equal(normalizeFieldKey('E-mailadres'), 'e_mailadres');
  assert.equal(normalizeFieldKey('Type gebouw'), 'type_gebouw');
  // Mag niet met een cijfer beginnen — de check-constraint eist een letter.
  assert.equal(normalizeFieldKey('2de contactpersoon'), 'veld_2de_contactpersoon');
  assert.equal(normalizeFieldKey('!!!'), '');
});

console.log('\nValidatie van een definitie');

test('een geldig formulier levert geen fouten en genormaliseerde velden', () => {
  const { errors, form, fields } = validateFormDefinition({
    form: { name: 'Offerte aanvragen', status: 'published' },
    fields: [veld(), veld({ field_key: 'naam', field_type: 'text', label: 'Naam', is_required: false })],
  });

  assert.deepEqual(errors, []);
  assert.equal(form.slug, 'offerte-aanvragen');
  assert.equal(fields.length, 2);
  assert.equal(fields[0].order_index, 0);
  assert.equal(fields[1].order_index, 1);
});

test('een keuzeveld zonder opties wordt geweigerd', () => {
  const { errors } = validateFormDefinition({
    form: { name: 'Test' },
    fields: [veld({ field_key: 'keuze', field_type: 'select', label: 'Keuze', options: [] })],
  });
  assert.ok(errors.some((e) => e.includes('minstens één optie')), errors.join(' | '));
});

test('dubbele veldnamen worden geweigerd', () => {
  const { errors } = validateFormDefinition({
    form: { name: 'Test' },
    fields: [veld(), veld({ label: 'Nog een e-mail' })],
  });
  assert.ok(errors.some((e) => e.includes('twee keer')), errors.join(' | '));
});

test('een veldnaam met meta_-prefix wordt geweigerd', () => {
  // Zonder deze regel kan een veld zijn eigen herkomstgegevens overschrijven.
  const { errors } = validateFormDefinition({
    form: { name: 'Test' },
    fields: [veld({ field_key: 'meta_utm_source', field_type: 'text', label: 'Bron' })],
  });
  assert.ok(errors.some((e) => e.includes('meta_')), errors.join(' | '));
});

test('een ongeldige veldnaam noemt OOK om welk veld het gaat', () => {
  // Enkel de naam noemen laat je zoeken welk veld bedoeld wordt; bij een lang
  // formulier is dat niet te doen.
  const { errors } = validateFormDefinition({
    form: { name: 'Test' },
    fields: [veld({ field_key: 'Waar', field_type: 'textarea', label: 'Waar kunnen we je mee helpen?' })],
  });
  assert.ok(errors.some((e) => e.includes('"Waar"') && e.includes('Waar kunnen we je mee helpen?')),
    errors.join(' | '));
});

test('gereserveerde namen worden geweigerd', () => {
  const { errors } = validateFormDefinition({
    form: { name: 'Test' },
    fields: [veld({ field_key: 'form_id', field_type: 'text', label: 'Id' })],
  });
  assert.ok(errors.some((e) => e.includes('gereserveerd')), errors.join(' | '));
});

test('een sleutel met inzendingen mag niet verdwijnen', () => {
  const { errors } = validateFormDefinition(
    { form: { name: 'Test' }, fields: [veld({ field_key: 'nieuw_veld', field_type: 'text', label: 'Nieuw' })] },
    { lockedKeys: new Set(['email']) }
  );
  assert.ok(errors.some((e) => e.includes('"email"') && e.includes('inzendingen')), errors.join(' | '));
});

test('een sleutel met inzendingen die blijft staan geeft geen fout', () => {
  const { errors } = validateFormDefinition(
    { form: { name: 'Test' }, fields: [veld({ label: 'Ander label, zelfde sleutel' })] },
    { lockedKeys: new Set(['email']) }
  );
  assert.deepEqual(errors, []);
});

test('publiceren zonder invoervelden wordt geweigerd', () => {
  const { errors } = validateFormDefinition({
    form: { name: 'Test', status: 'published' },
    fields: [{ field_type: 'heading', label: 'Alleen een titel' }],
  });
  assert.ok(errors.some((e) => e.includes('invoerveld')), errors.join(' | '));
});

test('doorsturen zonder https-URL wordt geweigerd', () => {
  const { errors } = validateFormDefinition({
    form: { name: 'Test', success_mode: 'redirect', redirect_url: 'http://openvme.be/bedankt' },
    fields: [veld()],
  });
  assert.ok(errors.some((e) => e.includes('https://')), errors.join(' | '));
});

console.log('\nValidatie van een inzending');

const testVelden = validateFormDefinition({
  form: { name: 'Offerte', status: 'published' },
  fields: [
    veld(),
    veld({ field_key: 'naam', field_type: 'text', label: 'Naam', is_required: true }),
    veld({
      field_key: 'gebouw_type', field_type: 'select', label: 'Type gebouw', is_required: false,
      options: [{ value: 'appartement', label: 'Appartementsgebouw' }, { value: 'kmo', label: 'KMO' }],
    }),
    veld({ field_key: 'aantal', field_type: 'number', label: 'Aantal', is_required: false, validation: { min: 1, max: 500 } }),
  ],
}).fields;

test('een geldige inzending komt er schoon door', () => {
  const { errors, values } = validateSubmissionValues(testVelden, {
    email: 'nico@mymmo.com', naam: 'Nico', gebouw_type: 'kmo', aantal: '12',
  });
  assert.deepEqual(errors, []);
  assert.equal(values.email, 'nico@mymmo.com');
  assert.equal(values.gebouw_type, 'kmo');
});

test('een ontbrekend verplicht veld geeft een leesbare fout', () => {
  const { errors } = validateSubmissionValues(testVelden, { naam: 'Nico' });
  assert.ok(errors.some((e) => e === 'E-mailadres is verplicht.'), errors.join(' | '));
});

test('een keuzewaarde buiten de lijst wordt geweigerd', () => {
  // Zonder deze controle kan iemand een willekeurige string in een Odoo
  // selectieveld duwen door de POST zelf op te stellen.
  const { errors } = validateSubmissionValues(testVelden, {
    email: 'a@b.be', naam: 'X', gebouw_type: 'iets-verzonnen',
  });
  assert.ok(errors.some((e) => e.includes('onbekende keuze')), errors.join(' | '));
});

test('velden die niet in het formulier staan worden weggegooid', () => {
  const { values } = validateSubmissionValues(testVelden, {
    email: 'a@b.be', naam: 'X', stiekem_veld: 'kwaadaardig',
  });
  assert.equal(values.stiekem_veld, undefined);
});

test('min/max op een getal wordt afgedwongen', () => {
  const { errors } = validateSubmissionValues(testVelden, { email: 'a@b.be', naam: 'X', aantal: '900' });
  assert.ok(errors.some((e) => e.includes('hoogstens 500')), errors.join(' | '));
});

test('een array komt binnen als komma-string, zoals de pipeline verwacht', () => {
  const meerkeuze = validateFormDefinition({
    form: { name: 'T' },
    fields: [veld({
      field_key: 'diensten', field_type: 'checkbox_group', label: 'Diensten', is_required: false,
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    })],
  }).fields;

  const { errors, values } = validateSubmissionValues(meerkeuze, { diensten: ['a', 'b'] });
  assert.deepEqual(errors, []);
  assert.equal(values.diensten, 'a, b');
});

console.log('\nPayload naar de pipeline');

const proefForm = { id: 'form-uuid-1', slug: 'offerte', name: 'Offerte', version: 3 };

test('de payload heeft de vorm die worker-handler.js verwacht', () => {
  // normalizeFormValues() neemt form_fields || form_data || data || submission,
  // resolveFormId() neemt payload.form_id. Verandert een van beide, dan hoort
  // deze test rood te worden.
  const payload = buildPipelinePayload(proefForm, { email: 'a@b.be' }, {});
  assert.equal(payload.form_id, 'form-uuid-1');
  assert.ok(payload.form_data, 'form_data moet de sleutel zijn, niet fields of values');
  assert.equal(payload.form_data.email, 'a@b.be');
});

test('meta-waarden komen met meta_-prefix IN form_data', () => {
  // Buiten form_data zouden ze onbereikbaar zijn voor het koppelingsscherm,
  // want normalizeFormValues() kijkt nergens anders.
  const payload = buildPipelinePayload(proefForm, { email: 'a@b.be' }, {
    site: 'openvme', utm_source: 'google', onbekend: 'wordt genegeerd',
  });
  assert.equal(payload.form_data.meta_site, 'openvme');
  assert.equal(payload.form_data.meta_utm_source, 'google');
  assert.equal(payload.form_data.meta_onbekend, undefined);
});

test('de bezoeker-UUID komt mee als mapbaar veld', () => {
  // Dit is de sleutel tussen een inzending en alles wat het tracking-script van
  // die bezoeker weet. Valt hij weg, dan staat een lead in Odoo los van zijn
  // eigen voorgeschiedenis -- en dat merk je niet, want er komt gewoon een lead.
  const payload = buildPipelinePayload(proefForm, { email: 'a@b.be' }, {
    ovme_uuid: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b',
    ovme_ref_uuid: '11112222-3333-4444-5555-666677778888',
  });
  assert.equal(payload.form_data.meta_ovme_uuid, '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b');
  assert.equal(payload.form_data.meta_ovme_ref_uuid, '11112222-3333-4444-5555-666677778888');
});

test('een ontbrekende UUID is gewoon leeg, geen fout', () => {
  // Het tracking-script zet geen cookie voor wie het als bot herkent, en ook
  // niet in een browser zonder plugins of taal. Daar zitten echte mensen tussen.
  const payload = buildPipelinePayload(proefForm, { email: 'a@b.be' }, {});
  assert.equal(payload.form_data.meta_ovme_uuid, undefined);
  assert.equal(payload.form_data.email, 'a@b.be');
});

test('de identiteit van het formulier is mapbaar en komt van de SERVER', () => {
  // De opvolger van ovme_forminator_id. Uit het formulier-record, niet uit wat
  // de plugin meestuurt -- anders kan een site beweren dat ze een ander
  // formulier is.
  const payload = buildPipelinePayload(proefForm, {}, { form_slug: 'gelogen', form_id: 'gelogen' });
  assert.equal(payload.form_data.meta_form_slug, 'offerte');
  assert.equal(payload.form_data.meta_form_id, 'form-uuid-1');
});

test('meta-sleutels bevatten geen punt', () => {
  // Een punt gebruikt normalizeFormValues() al voor samengestelde velden
  // (name-1.first-name); die vorm hier hergebruiken zou botsen.
  const payload = buildPipelinePayload(proefForm, {}, { page_url: 'https://openvme.be/x' });
  for (const sleutel of Object.keys(payload.form_data)) {
    assert.ok(!sleutel.includes('.'), `sleutel "${sleutel}" bevat een punt`);
  }
});

console.log('\nPublieke vorm');

test('de publieke vorm lekt niets interns', () => {
  const bundle = validateFormDefinition({ form: { name: 'Offerte' }, fields: [veld()] });
  const publiek = toPublicFormPayload(
    { ...bundle.form, id: 'x', version: 2, integration_id: 'geheim-koppeling-id' },
    bundle.fields
  );

  const platgeslagen = JSON.stringify(publiek);
  assert.ok(!platgeslagen.includes('geheim-koppeling-id'), 'integration_id mag niet publiek zijn');
  assert.ok(!platgeslagen.includes('odoo_field_type'), 'het Odoo-type hoort niet op een publieke pagina');
  assert.equal(publiek.fields[0].key, 'email');
});

test('de lijstvorm bevat wat de shortcode-bouwer nodig heeft, en niets meer', () => {
  const item = toPublicFormListItem(
    { id: 'geheim-id', integration_id: 'geheime-koppeling', slug: 'offerte', name: 'Offerte',
      description: 'Vul in', version: 7, updated_at: '2026-09-10T12:00:00Z', theme: { accent: '#000' } },
    5
  );

  assert.equal(item.slug, 'offerte');
  assert.equal(item.field_count, 5);
  assert.equal(item.version, 7);

  const plat = JSON.stringify(item);
  assert.ok(!plat.includes('geheim-id'), 'de interne id hoort niet in een lijst voor een plugin');
  assert.ok(!plat.includes('geheime-koppeling'), 'het koppeling-id al helemaal niet');
  assert.ok(!plat.includes('theme'), 'de stijl heeft de bouwer niet nodig');
});

test('elk veldtype in FIELD_TYPES heeft de vier vlaggen', () => {
  for (const [naam, spec] of Object.entries(FIELD_TYPES)) {
    for (const sleutel of ['input', 'options', 'multi', 'odooType', 'label']) {
      assert.ok(sleutel in spec, `${naam} mist "${sleutel}"`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Meertaligheid
// ─────────────────────────────────────────────────────────────────────────────

const TWEETALIG = {
  form: {
    name: 'Contact', status: 'published',
    languages: ['nl', 'fr'],
    i18n: { fr: { name: 'Contact', submit_label: 'Envoyer', success_message: 'Merci' } },
  },
  fields: [
    { field_type: 'text', label: 'Naam', is_required: true, i18n: { fr: { label: 'Nom' } } },
    { field_type: 'select', label: 'Type', options: [{ value: 'huis', label: 'Huis' }],
      i18n: { fr: { label: 'Type', options: { huis: 'Maison' } } } },
  ],
};

test('een volledig vertaald formulier mag gepubliceerd worden', () => {
  const { errors } = validateFormDefinition(TWEETALIG);
  assert.deepEqual(errors, []);
});

test('publiceren wordt geweigerd zolang een taal nog labels mist', () => {
  const { errors } = validateFormDefinition({
    ...TWEETALIG,
    fields: [{ field_type: 'text', label: 'Naam', is_required: true }],
  });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('Frans'), errors[0]);
  assert.ok(errors[0].includes('"Naam"'), 'de melding hoort te zeggen WELK veld');
});

test('als concept mag een vertaling wel onaf zijn', () => {
  const { errors } = validateFormDefinition({
    form: { ...TWEETALIG.form, status: 'draft' },
    fields: [{ field_type: 'text', label: 'Naam' }],
  });
  assert.deepEqual(errors, [], 'anders kan je niet halverwege het vertalen opslaan');
});

test('een verborgen veld hoeft geen vertaald label', () => {
  const { errors } = validateFormDefinition({
    ...TWEETALIG,
    fields: [
      ...TWEETALIG.fields,
      { field_type: 'hidden', field_key: 'bron', label: '', default_value: 'website' },
    ],
  });
  assert.deepEqual(errors, [], 'niemand leest het, dus er valt niets te vertalen');
});

test('de standaardtaal zit altijd in de talenlijst', () => {
  const { form } = validateFormDefinition({ form: { name: 'X', languages: ['fr'] }, fields: [] });
  assert.ok(form.languages.includes('nl'), 'anders valt het formulier terug op een taal die het niet heeft');
});

test('een onbekende taal wordt genegeerd', () => {
  const { form } = validateFormDefinition({ form: { name: 'X', languages: ['nl', 'fr', 'kl'] }, fields: [] });
  assert.deepEqual(form.languages, ['nl', 'fr']);
});

test('de standaardtaal staat NIET in i18n', () => {
  const { form } = validateFormDefinition({
    form: { name: 'X', languages: ['nl', 'fr'], i18n: { nl: { name: 'Anders' }, fr: { name: 'X-fr' } } },
    fields: [],
  });
  assert.equal(form.i18n.nl, undefined, 'twee bronnen voor dezelfde tekst is een bug in wording');
  assert.equal(form.i18n.fr.name, 'X-fr');
});

test('een optielabel hangt aan de WAARDE, niet aan een positie', () => {
  const { fields } = validateFormDefinition(TWEETALIG);
  assert.deepEqual(fields[1].i18n.fr.options, { huis: 'Maison' });
});

test('een vertaald label voor een optie die niet meer bestaat, wordt weggegooid', () => {
  const { fields } = validateFormDefinition({
    ...TWEETALIG,
    fields: [
      TWEETALIG.fields[0],
      { field_type: 'select', label: 'Type', options: [{ value: 'huis', label: 'Huis' }],
        i18n: { fr: { label: 'Type', options: { huis: 'Maison', weg: 'Parti' } } } },
    ],
  });
  assert.deepEqual(fields[1].i18n.fr.options, { huis: 'Maison' },
    'anders groeit dit object bij elke wijziging aan tot een vuilnisbak');
});

test('foutmeldingen komen in de taal van de bezoeker', () => {
  const { fields } = validateFormDefinition(TWEETALIG);
  assert.deepEqual(validateSubmissionValues(fields, {}, 'fr').errors[0], 'Nom est obligatoire.');
  assert.deepEqual(validateSubmissionValues(fields, {}, 'nl').errors[0], 'Naam is verplicht.');
});

test('een onbekende taal in een inzending valt terug op het Nederlands', () => {
  const { fields } = validateFormDefinition(TWEETALIG);
  assert.ok(validateSubmissionValues(fields, {}, 'kl').errors[0].includes('verplicht'));
});

test('de keuzeWAARDE is in elke taal dezelfde', () => {
  const { fields } = validateFormDefinition(TWEETALIG);
  // "Maison" mag NIET geldig zijn: wat naar Odoo gaat is de waarde, niet het label.
  const fr = validateSubmissionValues(fields, { naam: 'Nico', type: 'Maison' }, 'fr');
  assert.ok(fr.errors.some((e) => e.includes('inconnu')), fr.errors.join(' | '));

  const goed = validateSubmissionValues(fields, { naam: 'Nico', type: 'huis' }, 'fr');
  assert.deepEqual(goed.errors, [], 'dit is waarom één koppeling voor alle talen volstaat');
  assert.equal(goed.values.type, 'huis');
});

test('elke taal heeft dezelfde berichtsleutels', () => {
  const sleutels = Object.keys(MESSAGES.nl).sort();
  for (const taal of Object.keys(LANGUAGES)) {
    assert.deepEqual(Object.keys(MESSAGES[taal]).sort(), sleutels,
      `${taal} loopt uit de pas met het Nederlands`);
  }
});

test('t() vult plaatshouders in en laat onbekende staan', () => {
  assert.equal(t('fr', 'required', { label: 'Nom' }), 'Nom est obligatoire.');
  assert.equal(t('nl', 'minlength', { label: 'Naam', n: 3 }), 'Naam moet minstens 3 tekens bevatten.');
  assert.ok(t('nl', 'required', {}).includes('{label}'), 'een ontbrekende variabele blijft zichtbaar');
});

test('pickText valt alleen terug op de standaardtaal als het MOET', () => {
  const veld = { label: 'Naam', help_text: 'Uitleg' };
  const i18n = { fr: {} };
  assert.equal(pickText(veld, i18n, 'fr', 'label', true), 'Naam', 'een leeg label is stuk');
  assert.equal(pickText(veld, i18n, 'fr', 'help_text', false), '',
    'een hulptekst in de verkeerde taal is verwarrender dan geen hulptekst');
});

test('de payload draagt alle talen, niet één', () => {
  const { form, fields } = validateFormDefinition(TWEETALIG);
  const payload = toPublicFormPayload({ ...form, id: 'x', version: 2 }, fields);

  assert.deepEqual(payload.languages, ['nl', 'fr']);
  assert.equal(payload.default_language, 'nl');
  assert.equal(payload.i18n.fr.submit_label, 'Envoyer');
  assert.equal(payload.fields[0].i18n.fr.label, 'Nom');

  // Eén payload voor alle talen = één cache-ingang en één ETag in de plugin.
  assert.deepEqual(Object.keys(payload.messages).sort(), ['fr', 'nl']);
  assert.equal(payload.messages.fr.required, MESSAGES.fr.required);
});

test('de lijst vertelt welke talen een formulier heeft', () => {
  const item = toPublicFormListItem(
    { slug: 'contact', name: 'Contact', version: 1, languages: ['nl', 'fr'], default_language: 'nl' },
    3
  );
  assert.deepEqual(item.languages, ['nl', 'fr']);
  assert.equal(item.default_language, 'nl');
});

test('de taal gaat als meta_lang mee naar Odoo', () => {
  const payload = buildPipelinePayload(
    { id: 'x', slug: 'contact', name: 'Contact', version: 1 },
    { naam: 'Nico' },
    { lang: 'fr' }
  );
  assert.equal(payload.form_data.meta_lang, 'fr',
    'zonder dit veld is in Odoo niet te zien dat een lead Franstalig is');
});

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
