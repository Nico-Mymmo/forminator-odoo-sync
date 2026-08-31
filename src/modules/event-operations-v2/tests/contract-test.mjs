/**
 * Contracttest — pure functies, geen Odoo, geen netwerk.
 *
 * Draaien met: node src/modules/event-operations-v2/tests/contract-test.mjs
 *
 * De verwachte waarden komen uit de LIVE productiedata van 2026-08-28.
 * Verandert een van deze uitkomsten, dan verandert er iets dat de
 * mailtemplates of de WordPress-plugin kapotmaakt.
 */

import assert from 'node:assert/strict';
import {
  fromOdooDatetime,
  toOdooDatetime,
  derivedDisplayFields,
  deriveFormat,
  computeEndsAt,
  seatsLeft,
  registrationStatus,
  toEventDto,
  toPublicEventDto,
  toOdooEventValues,
  assertNoForbiddenFields,
  stageToState,
  parseStageMapOverride,
  parseBoundaryDatetime,
  eventBrand,
  EVENT_FIELDS,
  FORBIDDEN_FIELDS
} from '../odoo-contract.js';
import { slugify } from '../lib/slug.js';
import { sanitizePublicHtml, htmlToText, summarize } from '../lib/blocks.js';
import { checkPublishReadiness, assertPublicationTransition, normalizePagination } from '../lib/validation.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL  ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

// ─── Datetime ─────────────────────────────────────────────────────────────────

test('fromOdooDatetime behandelt Odoo-UTC zonder Z', () => {
  assert.equal(fromOdooDatetime('2026-12-16 14:00:00'), '2026-12-16T14:00:00.000Z');
});

test('fromOdooDatetime geeft null bij false en leeg', () => {
  assert.equal(fromOdooDatetime(false), null);
  assert.equal(fromOdooDatetime(''), null);
  assert.equal(fromOdooDatetime(null), null);
});

test('toOdooDatetime is de exacte inverse', () => {
  assert.equal(toOdooDatetime(fromOdooDatetime('2026-12-16 14:00:00')), '2026-12-16 14:00:00');
});

test('toOdooDatetime geeft false om een veld te wissen', () => {
  assert.equal(toOdooDatetime(null), false);
  assert.equal(toOdooDatetime(''), false);
});

// ─── Afgeleide weergavevelden — MOET matchen met productiedata ────────────────

test('derivedDisplayFields matcht productiedata (winter, CET)', () => {
  const out = derivedDisplayFields('2026-12-16T14:00:00.000Z');
  assert.equal(out[EVENT_FIELDS.STARTING_DAY], 'woensdag, 16 december');
  assert.equal(out[EVENT_FIELDS.STARTING_TIME], '15:00');
});

test('derivedDisplayFields matcht productiedata (november)', () => {
  const out = derivedDisplayFields('2026-11-03T11:00:00.000Z');
  assert.equal(out[EVENT_FIELDS.STARTING_DAY], 'dinsdag, 3 november');
  assert.equal(out[EVENT_FIELDS.STARTING_TIME], '12:00');
});

test('derivedDisplayFields respecteert zomertijd (CEST, +2)', () => {
  const out = derivedDisplayFields('2026-07-01T10:00:00.000Z');
  assert.equal(out[EVENT_FIELDS.STARTING_TIME], '12:00');
});

test('derivedDisplayFields gebruikt h23, geen 24:00', () => {
  const out = derivedDisplayFields('2026-01-14T23:00:00.000Z');
  assert.equal(out[EVENT_FIELDS.STARTING_TIME], '00:00');
});

// ─── Afgeleid format ──────────────────────────────────────────────────────────

const base = {
  id: 1,
  x_name: 'Test',
  x_studio_event_datetime: '2026-12-16 14:00:00',
  x_studio_event_duration_minutes: 30,
  x_studio_capacity: 0,
  x_studio_stage_id: [2, 'Published'],
  x_studio_registration_enabled: true,
  x_event_type_id: [3, 'Q&A'],
  x_studio_live_event_location: false,
  x_studio_webinar_link: false
};

test('format online zonder locatie', () => {
  assert.equal(deriveFormat(base), 'online');
});

test('format onsite met alleen locatie', () => {
  assert.equal(deriveFormat({ ...base, x_studio_live_event_location: 'Brug1, Berchem' }), 'onsite');
});

test('format hybrid met locatie en link', () => {
  assert.equal(
    deriveFormat({
      ...base,
      x_studio_live_event_location: 'Brussels-Expo',
      x_studio_webinar_link: 'https://zoom.us/j/1'
    }),
    'hybrid'
  );
});

test('format negeert een lege string als locatie', () => {
  assert.equal(deriveFormat({ ...base, x_studio_live_event_location: '   ' }), 'online');
});

// ─── Capaciteit ───────────────────────────────────────────────────────────────

test('capaciteit 0 betekent onbeperkt', () => {
  assert.equal(seatsLeft(0, 42), null);
});

test('vrije plaatsen zakken niet onder nul', () => {
  assert.equal(seatsLeft(10, 15), 0);
  assert.equal(seatsLeft(10, 3), 7);
});

// ─── Inschrijfstatus ──────────────────────────────────────────────────────────

test('inschrijving dicht als event niet gepubliceerd is', () => {
  const dto = toEventDto({ ...base, x_studio_stage_id: [1, 'Draft'] });
  assert.equal(dto.registration.status.open, false);
  assert.equal(dto.registration.status.reason, 'not_published');
});

// ─── Stage is de publicatiestatus ─────────────────────────────────────────────

test('stage-id 1 t/m 4 uit Odoo geven de vier statussen', () => {
  assert.equal(stageToState([1, 'Draft']), 'draft');
  assert.equal(stageToState([2, 'Published']), 'published');
  assert.equal(stageToState([3, 'Done']), 'done');
  assert.equal(stageToState([4, 'Cancelled']), 'cancelled');
});

test('stagenamen matchen ook in het Nederlands en met accenten', () => {
  assert.equal(stageToState([9, 'Gepubliceerd']), 'published');
  assert.equal(stageToState([9, 'Geannuleerd']), 'cancelled');
  assert.equal(stageToState([9, 'Afgerond']), 'done');
  assert.equal(stageToState([9, '  CONCEPT  ']), 'draft');
});

test('onbekende of ontbrekende stage valt terug op draft', () => {
  assert.equal(stageToState([99, 'Iets nieuws']), 'draft');
  assert.equal(stageToState(false), 'draft');
});

test('env.EVENT_STAGE_MAP overschrijft de naamherkenning', () => {
  const overrides = parseStageMapOverride('99:published, 98:done');
  assert.equal(stageToState([99, 'Iets nieuws'], overrides), 'published');
  assert.equal(stageToState([98, 'Nog iets'], overrides), 'done');
  assert.equal(parseStageMapOverride(''), null);
  assert.equal(parseStageMapOverride('rommel'), null);
});

test('het DTO geeft de stage mee, zodat je in de UI ziet welke fase het is', () => {
  const dto = toEventDto({ ...base, x_studio_stage_id: [3, 'Done'] });
  assert.equal(dto.publication_state, 'done');
  assert.deepEqual(dto.stage, { id: 3, name: 'Done' });
});

test('afgerond en geannuleerd sluiten de inschrijving met hun eigen reden', () => {
  assert.equal(toEventDto({ ...base, x_studio_stage_id: [3, 'Done'] }).registration.status.reason, 'event_done');
  assert.equal(toEventDto({ ...base, x_studio_stage_id: [4, 'Cancelled'] }).registration.status.reason, 'cancelled');
});

test('het oude statusveld mag niet meer gebruikt worden', () => {
  assert.ok(FORBIDDEN_FIELDS.includes('x_studio_publication_state'));
  assert.throws(() => assertNoForbiddenFields(['x_studio_publication_state']), /nooit gebruikt/);
});

test('inschrijving dicht als het event al begonnen is', () => {
  const dto = toEventDto({ ...base, x_studio_event_datetime: '2020-01-01 10:00:00' });
  assert.equal(dto.registration.status.reason, 'event_started');
});

test('inschrijving dicht als vol', () => {
  const dto = toEventDto({ ...base, x_studio_capacity: 5 }, { registrationCount: 5 });
  assert.equal(dto.registration.status.reason, 'full');
});

test('inschrijving dicht buiten het venster', () => {
  const dto = toEventDto({ ...base, x_studio_registration_closes_at: '2020-01-01 00:00:00' });
  assert.equal(dto.registration.status.reason, 'closed');
});

// ─── einde ────────────────────────────────────────────────────────────────────

test('einde = start plus duur', () => {
  assert.equal(computeEndsAt('2026-12-16T14:00:00.000Z', 30), '2026-12-16T14:30:00.000Z');
});

test('einde valt terug op de standaardduur', () => {
  assert.equal(computeEndsAt('2026-12-16T14:00:00.000Z', false), '2026-12-16T15:00:00.000Z');
});

// ─── Publieke serializer: de belangrijkste test van dit bestand ───────────────

test('publiek DTO lekt de online link NOOIT', () => {
  const record = { ...base, x_studio_webinar_link: 'https://zoom.us/j/geheim', x_studio_webinar_info: '<p>Hoi</p>' };
  const pub = toPublicEventDto(record, { detail: true });
  const serialized = JSON.stringify(pub);

  assert.equal(Object.prototype.hasOwnProperty.call(pub, 'online_url'), false);
  assert.ok(!serialized.includes('zoom.us'), 'online link zit in de publieke respons');
  assert.ok(!serialized.includes('geheim'), 'online link zit in de publieke respons');
});

test('publiek DTO bouwt de website-URL uit de slug', () => {
  const pub = toPublicEventDto({ ...base, x_studio_slug: 'q-and-a-16-12' });
  // Enkelvoud met sluitende slash: exact de vorm die The Events Calendar
  // vandaag gebruikt, zodat bestaande links blijven werken.
  assert.equal(pub.url, '/event/q-and-a-16-12/');
});

test('event type krijgt de bestaande tribe-slug en een vaste kleur', () => {
  const qa = toPublicEventDto({ ...base, x_event_type_id: [3, 'Q&A'] });
  assert.equal(qa.type.slug, 'qa');
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(qa.type.color));

  const opleiding = toPublicEventDto({ ...base, x_event_type_id: [5, 'Groepsopleiding'] });
  assert.equal(opleiding.type.slug, 'opleiding');

  const onbekend = toPublicEventDto({ ...base, x_event_type_id: [9, 'Nieuw Soort Sessie'] });
  assert.equal(onbekend.type.slug, 'nieuw-soort-sessie');
});

test('publiek DTO geeft null als url zonder slug', () => {
  assert.equal(toPublicEventDto(base).url, null);
});

// ─── Datumgrenzen uit de querystring ──────────────────────────────────────────

test('een ISO-grens met Z wordt Odoo-formaat', () => {
  assert.equal(parseBoundaryDatetime('2026-10-25T23:00:00Z'), '2026-10-25 23:00:00');
});

test('een ISO-grens met offset wordt naar UTC omgezet', () => {
  assert.equal(parseBoundaryDatetime('2026-10-26T01:00:00+02:00'), '2026-10-25 23:00:00');
});

test('de plus-val wordt herstelt: een spatie waar een + hoorde te staan', () => {
  // In een querystring betekent `+` een spatie. WordPress' add_query_arg
  // encodeert waarden niet, dus dit is precies wat er binnenkomt.
  assert.equal(parseBoundaryDatetime('2026-10-25T23:00:00 00:00'), '2026-10-25 23:00:00');
  assert.equal(parseBoundaryDatetime('2026-10-26T01:00:00 02:00'), '2026-10-25 23:00:00');
});

test('Odoo-formaat blijft Odoo-formaat', () => {
  assert.equal(parseBoundaryDatetime('2026-10-25 23:00:00'), '2026-10-25 23:00:00');
});

test('alleen een datum wordt middernacht UTC', () => {
  assert.equal(parseBoundaryDatetime('2026-10-25'), '2026-10-25 00:00:00');
});

test('onleesbare of lege grenzen worden genegeerd, niet doorgegeven', () => {
  // Dit is een publiek endpoint: rommel mag nooit in een Odoo-domein komen,
  // want dan gooit Odoo en wordt het een 503 zonder aanwijzing.
  assert.equal(parseBoundaryDatetime('gisteren'), null);
  assert.equal(parseBoundaryDatetime(''), null);
  assert.equal(parseBoundaryDatetime(null), null);
  assert.equal(parseBoundaryDatetime(undefined), null);
  assert.equal(parseBoundaryDatetime('2026-99-99T99:99:99Z'), null);
});

// ─── Merk ─────────────────────────────────────────────────────────────────────

test('merk komt uit x_studio_brand', () => {
  assert.equal(eventBrand({ x_studio_brand: 'openvme' }), 'openvme');
  assert.equal(eventBrand({ x_studio_brand: 'syndicoach' }), 'syndicoach');
  assert.equal(eventBrand({ x_studio_brand: 'both' }), 'both');
});

test('een leeg of onbekend merk geldt als both', () => {
  // Zo blijft de kalender werken zolang de velden niet ingevuld zijn.
  assert.equal(eventBrand({ x_studio_brand: false }), 'both');
  assert.equal(eventBrand({}), 'both');
  assert.equal(eventBrand({ x_studio_brand: 'iets anders' }), 'both');
});

test('merk is hoofdletterongevoelig en tolerant voor spaties', () => {
  assert.equal(eventBrand({ x_studio_brand: '  OpenVME ' }), 'openvme');
});

test('alleen een gedeeld event krijgt een canonical naar de hoofdsite', () => {
  const shared = toPublicEventDto(
    { ...base, x_studio_slug: 'gedeeld', x_studio_brand: 'both' },
    { sharedCanonicalOrigin: 'https://openvme.be' }
  );
  assert.equal(shared.canonical_url, 'https://openvme.be/event/gedeeld/');

  const own = toPublicEventDto(
    { ...base, x_studio_slug: 'eigen', x_studio_brand: 'syndicoach' },
    { sharedCanonicalOrigin: 'https://openvme.be' }
  );
  assert.equal(own.canonical_url, null);
});

test('zonder ingestelde hoofdsite blijft de canonical leeg', () => {
  const shared = toPublicEventDto({ ...base, x_studio_slug: 'gedeeld', x_studio_brand: 'both' }, {});
  assert.equal(shared.canonical_url, null);
});

test('het merk zit in het publieke DTO, zodat de site kan filteren', () => {
  assert.equal(toPublicEventDto({ ...base, x_studio_brand: 'syndicoach' }).brand, 'syndicoach');
});

// ─── Odoo-values ──────────────────────────────────────────────────────────────

test('startdatum wijzigen schrijft de weergavevelden mee', () => {
  const values = toOdooEventValues({ starts_at: '2026-12-16T14:00:00.000Z' });
  assert.equal(values[EVENT_FIELDS.STARTS_AT], '2026-12-16 14:00:00');
  assert.equal(values[EVENT_FIELDS.STARTING_DAY], 'woensdag, 16 december');
  assert.equal(values[EVENT_FIELDS.STARTING_TIME], '15:00');
});

test('een patch zonder datum raakt de weergavevelden niet aan', () => {
  const values = toOdooEventValues({ title: 'Nieuwe titel' });
  assert.deepEqual(Object.keys(values), [EVENT_FIELDS.TITLE]);
});

test('toOdooEventValues raakt nooit een dood veld aan', () => {
  const values = toOdooEventValues({ title: 'X', starts_at: '2026-12-16T14:00:00.000Z', capacity: 0 });
  for (const forbidden of FORBIDDEN_FIELDS) {
    assert.ok(!(forbidden in values), `${forbidden} mag niet geschreven worden`);
  }
});

test('assertNoForbiddenFields slaat alarm op de v1-veldnaam', () => {
  assert.throws(() => assertNoForbiddenFields(['x_name', 'x_webinar_event_type_id']), /nooit gebruikt/);
});

test('lege startdatum wordt geweigerd', () => {
  assert.throws(() => toOdooEventValues({ starts_at: null }), /verplicht/);
});

test('merk wordt weggeschreven, en rommel wordt geweigerd', () => {
  assert.equal(toOdooEventValues({ brand: 'syndicoach' })[EVENT_FIELDS.BRAND], 'syndicoach');
  assert.equal(toOdooEventValues({ brand: 'BOTH' })[EVENT_FIELDS.BRAND], 'both');
  // Leeg wist het veld; leeg geldt daarna als `both`.
  assert.equal(toOdooEventValues({ brand: '' })[EVENT_FIELDS.BRAND], false);
  assert.throws(() => toOdooEventValues({ brand: 'mymmo' }), /Onbekend merk/);
});

test('redactionele inhoud gaat naar x_studio_webinar_info', () => {
  const values = toOdooEventValues({ body_html: '<p>Hallo</p>' });
  assert.equal(values[EVENT_FIELDS.BODY], '<p>Hallo</p>');
  assert.equal(toOdooEventValues({ body_html: '' })[EVENT_FIELDS.BODY], false);
});

// ─── Slug ─────────────────────────────────────────────────────────────────────

test('slugify werkt op echte eventtitels', () => {
  assert.equal(
    slugify('Q&A Syndicoach: vragen over mede-eigendom'),
    'q-en-a-syndicoach-vragen-over-mede-eigendom'
  );
  assert.equal(slugify('Opleidingssessie én café'), 'opleidingssessie-en-cafe');
});

test('slugify laat geen streepjes aan de randen', () => {
  assert.equal(slugify('  --- Test --- '), 'test');
  assert.equal(slugify('!!!'), '');
});

// ─── HTML ─────────────────────────────────────────────────────────────────────

test('sanitize verwijdert scripts en handlers', () => {
  const out = sanitizePublicHtml('<p onclick="x()">Hoi</p><script>alert(1)</script>');
  assert.ok(!out.includes('script'));
  assert.ok(!out.includes('onclick'));
  assert.ok(out.includes('Hoi'));
});

test('sanitize verwijdert oude forminator-shortcodes', () => {
  const out = sanitizePublicHtml('<p>Schrijf in</p>[forminator_form id="14547"]');
  assert.ok(!out.includes('forminator'));
  assert.ok(out.includes('Schrijf in'));
});

test('htmlToText decodeert entities', () => {
  assert.equal(htmlToText('<p>A &amp; B&nbsp;C</p>'), 'A & B C');
});

test('summarize kapt af op een woordgrens', () => {
  const out = summarize('<p>' + 'woord '.repeat(60) + '</p>', 50);
  assert.ok(out.length <= 53, out.length);
  assert.ok(out.endsWith('...'));
  assert.ok(!out.includes('woor.'));
});

// ─── Validatie ────────────────────────────────────────────────────────────────

test('publiceercontrole noemt wat er mist', () => {
  const dto = toEventDto(base);
  const { ready, missing } = checkPublishReadiness(dto);
  assert.equal(ready, false);
  assert.ok(missing.includes('slug'));
  assert.ok(missing.includes('samenvatting'));
  assert.ok(missing.includes('online link'), 'online event zonder link is niet publiceerbaar');
});

test('publiceercontrole vraagt een locatie bij een event op locatie', () => {
  const dto = toEventDto({ ...base, x_studio_live_event_location: false, x_studio_webinar_link: false });
  dto.format = 'onsite';
  dto.location = { name: null };
  assert.ok(checkPublishReadiness(dto).missing.includes('locatie'));
});

test('verboden statusovergang geeft 409', () => {
  assert.throws(
    () => assertPublicationTransition('cancelled', 'published'),
    (err) => err.status === 409
  );
  assert.throws(
    () => assertPublicationTransition('draft', 'done'),
    (err) => err.status === 409
  );
});

test('de vier statussen hebben de bedoelde overgangen', () => {
  assertPublicationTransition('draft', 'published');
  assertPublicationTransition('published', 'done');
  assertPublicationTransition('published', 'cancelled');
  assertPublicationTransition('done', 'published');
  assertPublicationTransition('cancelled', 'draft');
});

test('dezelfde status is geen fout', () => {
  assertPublicationTransition('published', 'published');
});

test('paginering heeft een echt plafond', () => {
  assert.deepEqual(normalizePagination({ page: '3', per_page: '5000' }), { page: 3, perPage: 100, offset: 200 });
  assert.deepEqual(normalizePagination({}), { page: 1, perPage: 25, offset: 0 });
  assert.deepEqual(normalizePagination({ page: '-2' }), { page: 1, perPage: 25, offset: 0 });
});

console.log(`\n${passed} tests geslaagd${process.exitCode ? ' — MET FOUTEN' : ''}`);
