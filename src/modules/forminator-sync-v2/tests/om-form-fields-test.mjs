/**
 * Komen de velden van een OM-formulier in het koppelingsscherm terecht?
 *
 *   node src/modules/forminator-sync-v2/tests/om-form-fields-test.mjs
 *
 * De veldenlijst achter "Veldkoppelingen" kende twee bronnen: Forminator (via de
 * WP-API) en de generieke webhook (afgeleid uit binnengekomen payloads). Een
 * formulier dat in de OM zelf gebouwd is, viel tussen beide door -- geen
 * forminator_form_id om op te halen, en bij een nieuwe koppeling nog geen
 * inzending om iets uit af te leiden. De keuzelijst bleef leeg, precies op het
 * moment dat je de koppeling wil maken.
 *
 * Deze test draait fetchOmFormFields() met een nagebootste API en controleert
 * wat er in S().detailFormFields belandt. Geen browser nodig: het bestand is een
 * IIFE die op window schrijft, dus een minimale window volstaat -- zelfde aanpak
 * als de JS-kant van form-preview-parity-test.mjs.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const publicDir = join(hier, '..', '..', '..', '..', 'public');
const bron = readFileSync(join(publicDir, 'forminator-sync-v2-detail-form-fields-tab.js'), 'utf8');

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

async function testAsync(naam, fn) {
  try {
    await fn();
    geslaagd += 1;
    console.log(`  ✓ ${naam}`);
  } catch (err) {
    gefaald += 1;
    console.error(`  ✗ ${naam}\n    ${err.message}`);
  }
}

// ── Het formulier dat de nagebootste API teruggeeft ─────────────────────────

const FORM_BUNDLE = {
  form: {
    id: 'form-1', slug: 'contact', name: 'Contact', status: 'published',
    languages: ['nl', 'fr'], default_language: 'nl',
    i18n: { fr: { name: 'Contact FR' } },
  },
  fields: [
    { field_key: 'naam', field_type: 'text', label: 'Naam', is_required: true,
      options: [], i18n: { fr: { label: 'Nom' } } },
    { field_key: 'email', field_type: 'email', label: 'E-mailadres', is_required: true, options: [] },
    // Opmaakblokken hebben in de DATABASE wél een sleutel: saveForm() geeft ze
    // "blok_<n>" omdat er een UNIQUE-constraint op (form_id, field_key) staat.
    // Ze hier met een lege sleutel opschrijven zou de test laten slagen zonder
    // dat de heading/paragraph-controle iets doet.
    { field_key: 'blok_3', field_type: 'heading', label: 'Over het gebouw', is_required: false, options: [] },
    { field_key: 'blok_4', field_type: 'paragraph', label: 'Wat uitleg.', is_required: false, options: [] },
    { field_key: 'gebouw_type', field_type: 'select', label: 'Type gebouw', is_required: true,
      options: [{ value: 'appartement', label: 'Appartementsgebouw' }, { value: 'kmo', label: 'KMO' }],
      i18n: { fr: { label: 'Type', options: { appartement: 'Immeuble' } } } },
    { field_key: 'bron', field_type: 'hidden', label: '', is_required: false, options: [] },
  ],
  locked_keys: [],
};

const FORMS_META = {
  meta_prefix: 'meta_',
  meta_keys: [
    { key: 'meta_site', label: 'Site' },
    { key: 'meta_page_url', label: 'Pagina-URL' },
    { key: 'meta_ovme_uuid', label: 'Bezoeker-UUID' },
    { key: 'meta_lang', label: 'Taal van de bezoeker' },
  ],
};

/** Een minimale window waarin het bestand kan draaien. */
function maakOmgeving({ bundle = FORM_BUNDLE, metaFaalt = false } = {}) {
  const aanroepen = [];
  const toasts = [];

  const fakeWindow = {
    setTimeout: (fn) => fn,
    clearTimeout: () => {},
    FSV2: {
      S: {
        activeId: 'koppeling-1',
        detail: { integration: { id: 'koppeling-1', source_type: 'om_form' } },
        detailFormFields: null,
        submissions: [],
        _fieldMeta: {},
      },
      esc: (v) => String(v == null ? '' : v),
      showAlert: (bericht, type) => toasts.push({ bericht, type }),
      _saveFieldMeta: () => {},
      renderDetailFormFields: () => {},
      renderDetailMappings: () => {},
      SKIP_TYPES: ['html', 'captcha', 'save'],
      api: async (pad) => {
        aanroepen.push(pad);
        if (pad === '/forms/meta') {
          if (metaFaalt) throw new Error('meta onbereikbaar');
          return { data: FORMS_META };
        }
        if (pad.endsWith('/form')) return { data: bundle };
        return { data: null };
      },
    },
  };

  // document is nodig voor renderDetailFormFields; die stubben we hierboven al
  // weg, maar het bestand raakt document ook op andere plekken aan.
  const fakeDocument = {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
  };

  new Function('window', 'document', 'lucide', bron)(fakeWindow, fakeDocument, undefined);

  return { W: fakeWindow, aanroepen, toasts };
}

const velden = (W) => W.FSV2.S.detailFormFields;
const sleutels = (W) => velden(W).map((f) => f.field_id);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDe velden van het formulier');

const basis = maakOmgeving();
await basis.W.FSV2.fetchOmFormFields('koppeling-1');

test('de lijst is niet leeg', () => {
  assert.ok(Array.isArray(velden(basis.W)) && velden(basis.W).length > 0,
    'dit was de bug: een lege keuzelijst bij de veldkoppelingen');
});

test('elk invoerveld staat erin, onder zijn eigen veldnaam', () => {
  const s = sleutels(basis.W);
  for (const verwacht of ['naam', 'email', 'gebouw_type', 'bron']) {
    assert.ok(s.includes(verwacht), `"${verwacht}" ontbreekt — ${s.join(', ')}`);
  }
});

test('het label is dat van het formulier, niet de veldnaam', () => {
  const veld = velden(basis.W).find((f) => f.field_id === 'gebouw_type');
  assert.equal(veld.label, 'Type gebouw');
});

test('het label staat in de STANDAARDTAAL', () => {
  const veld = velden(basis.W).find((f) => f.field_id === 'naam');
  assert.equal(veld.label, 'Naam',
    'wie hier koppelt werkt in de taal waarin het formulier gebouwd is, niet in een vertaling');
});

test('opmaakblokken staan er NIET in', () => {
  const s = sleutels(basis.W);
  const labels = velden(basis.W).map((f) => f.label);
  assert.ok(!s.includes('blok_3') && !s.includes('blok_4'),
    'een tussentitel levert niets aan de payload en hoort niet koppelbaar te zijn');
  assert.ok(!labels.includes('Over het gebouw'));
  assert.ok(!labels.includes('Wat uitleg.'));
});

test('een verborgen veld staat er WEL in', () => {
  assert.ok(sleutels(basis.W).includes('bron'),
    'het levert een waarde aan de payload, dus het is koppelbaar');
});

test('de keuzes van een keuzelijst gaan mee', () => {
  const veld = velden(basis.W).find((f) => f.field_id === 'gebouw_type');
  assert.deepEqual(veld.choices, [
    { value: 'appartement', label: 'Appartementsgebouw' },
    { value: 'kmo', label: 'KMO' },
  ]);
});

test('de keuzeWAARDEN zijn niet vertaald', () => {
  const veld = velden(basis.W).find((f) => f.field_id === 'gebouw_type');
  assert.equal(veld.choices[0].value, 'appartement',
    'de waarde gaat naar Odoo en is in elke taal dezelfde');
});

test('verplicht komt mee', () => {
  assert.equal(velden(basis.W).find((f) => f.field_id === 'naam').required, true);
  assert.equal(velden(basis.W).find((f) => f.field_id === 'bron').required, false);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDe herkomstvelden');

test('meta_ovme_uuid is koppelbaar zonder dat er ooit een inzending was', () => {
  assert.ok(sleutels(basis.W).includes('meta_ovme_uuid'),
    'anders kan je de bezoeker-UUID pas mappen NA de inzending waarvan je de herkomst dan kwijt bent');
});

test('de herkomstvelden hebben een leesbare naam', () => {
  const veld = velden(basis.W).find((f) => f.field_id === 'meta_ovme_uuid');
  assert.equal(veld.label, 'Bezoeker-UUID');
});

test('meta_lang staat erbij', () => {
  assert.ok(sleutels(basis.W).includes('meta_lang'),
    'zodat een Franstalige lead ook Franstalig opgevolgd kan worden');
});

test('meta_form_slug en meta_form_id staan erbij', () => {
  const s = sleutels(basis.W);
  assert.ok(s.includes('meta_form_slug'), 'de opvolger van ovme_forminator_id');
  assert.ok(s.includes('meta_form_id'));
});

test('de herkomstvelden staan ACHTER de echte formuliervelden', () => {
  const s = sleutels(basis.W);
  const laatsteEcht = Math.max(s.indexOf('naam'), s.indexOf('email'), s.indexOf('gebouw_type'), s.indexOf('bron'));
  const eersteMeta = s.findIndex((k) => k.startsWith('meta_'));
  assert.ok(eersteMeta > laatsteEcht,
    'het zijn er twaalf; ertussen zetten maakt de lijst onleesbaar');
});

test('ze zijn als herkomstveld gemarkeerd', () => {
  assert.equal(velden(basis.W).find((f) => f.field_id === 'meta_site').is_meta, true);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nAls er iets misgaat');

await testAsync('een koppeling zonder formulier geeft een lege lijst, geen spinner', async () => {
  const omg = maakOmgeving({ bundle: null });
  await omg.W.FSV2.fetchOmFormFields('koppeling-1');
  assert.deepEqual(velden(omg.W), [],
    "blijft dit op 'loading' staan, dan draait er een spinner waar nooit iets komt");
});

await testAsync('een onbereikbare /forms/meta laat de formuliervelden staan', async () => {
  const omg = maakOmgeving({ metaFaalt: true });
  await omg.W.FSV2.fetchOmFormFields('koppeling-1');
  const s = omg.W.FSV2.S.detailFormFields.map((f) => f.field_id);
  assert.ok(s.includes('naam'), 'de echte velden zijn belangrijker dan de herkomstvelden');
  assert.ok(!s.includes('meta_site'), 'die kunnen we dan niet weten');
  assert.equal(omg.toasts.length, 0, 'hier hoort geen foutmelding bij: er ontbreekt enkel wat gemak');
});

await testAsync('een falende formulier-call geeft een melding en geen halve lijst', async () => {
  const omg = maakOmgeving();
  omg.W.FSV2.api = async (pad) => {
    if (pad === '/forms/meta') return { data: FORMS_META };
    throw new Error('netwerk stuk');
  };
  await omg.W.FSV2.fetchOmFormFields('koppeling-1');
  assert.deepEqual(velden(omg.W), []);
  assert.equal(omg.toasts.length, 1);
  assert.equal(omg.toasts[0].type, 'error');
});

await testAsync('/forms/meta wordt maar één keer opgehaald', async () => {
  const omg = maakOmgeving();
  await omg.W.FSV2.fetchOmFormFields('koppeling-1');
  await omg.W.FSV2.fetchOmFormFields('koppeling-1');
  const aantal = omg.aanroepen.filter((p) => p === '/forms/meta').length;
  assert.equal(aantal, 1, 'de lijst herkomstvelden verandert niet tijdens een sessie');
});

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
