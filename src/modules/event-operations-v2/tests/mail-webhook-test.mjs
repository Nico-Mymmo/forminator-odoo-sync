/**
 * Event Operations v2 — Postmark-webhook-tests
 *
 *   node src/modules/event-operations-v2/tests/mail-webhook-test.mjs
 *
 * Draait ZONDER Odoo-verbinding en zonder netwerk: de webhook neemt zijn
 * Odoo-functies via `deps` aan, dus die worden hier geïnjecteerd. Anders dan
 * mail-queue-test.mjs is er dus geen gestubde `fetch` nodig.
 *
 * WAAROM DIT BESTAND BESTAAT. De webhook stond correct ingesteld, gaf netjes
 * 200 op elke gebeurtenis, en hield tóch niets bij: hij zocht de mail terug
 * via `payload.MessageID` in de veronderstelling dat Postmark onze eigen
 * `Message-ID`-header terugstuurt. Dat doet Postmark niet --
 * `MessageID` is Postmark's eigen UUID. Er was geen foutmelding en geen
 * enkele test die dit kon zien, want de webhook "werkte": hij negeerde alles
 * met `not_events_v2_mail`.
 *
 * De eerste test hieronder klinkt dat vast: een payload met ALLEEN een
 * Postmark-UUID als MessageID mag NIET herkend worden, en een payload met
 * `Metadata` WEL. Verder testen we de drie voorwaarden van de automatische
 * aanwezigheid (soort, link, tijdvenster) en de labelrondgang tussen
 * schrijver en lezer.
 */

import assert from 'node:assert/strict';
import {
  identifyMail,
  parseEventsV2MessageId,
  isEventLink,
  isInAttendanceWindow,
  gebeurtenisTijdstip,
  handleEventsV2PostmarkWebhook
} from '../lib/mail-webhook.js';
import {
  buildMailTrackingHeaders,
  readTrackingMetadata,
  chatterLabel,
  TRACKING_META
} from '../lib/postmark-tracking.js';
import { EVENT_FIELDS, REGISTRATION_FIELDS, MAIL_FIELDS } from '../odoo-contract.js';
import { MAIL_KIND, MAIL_KINDS } from '../lib/mail-blocks.js';

const ENV = { DB_NAME: 'test', UID: '2', API_KEY: 'x', POSTMARK_WEBHOOK_SECRET: 'geheim' };

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error?.message}`);
    process.exitCode = 1;
  }
}

/** Een event dat om 14:00 UTC start en 45 minuten duurt. */
const EVENT = {
  id: 76,
  [EVENT_FIELDS.ID]: 76,
  [EVENT_FIELDS.STARTS_AT]: '2026-09-24 14:00:00',
  [EVENT_FIELDS.DURATION_MINUTES]: 45,
  [EVENT_FIELDS.SLUG]: 'qa-syndicoach-vragen',
  [EVENT_FIELDS.ONLINE_URL]: 'https://us02web.zoom.us/j/123456789'
};

const EVENT_URL = 'https://openvme.be/event/qa-syndicoach-vragen/?owid=76';

function metadataPayload(extra = {}) {
  return {
    RecordType: 'Click',
    // Precies wat Postmark stuurt: zijn EIGEN uuid, niet onze message_id.
    MessageID: '883953f4-6105-42a2-a16a-77a8eac79483',
    Recipient: 'nico@mymmo.com',
    ReceivedAt: '2026-09-24T13:50:00Z',
    OriginalLink: EVENT_URL,
    Metadata: {
      [TRACKING_META.EVENT]: '76',
      [TRACKING_META.KIND]: MAIL_KIND.REMINDER,
      [TRACKING_META.REGISTRATION]: '1079'
    },
    ...extra
  };
}

function request(payload) {
  return new Request('https://x/events-v2/api/webhooks/postmark?token=geheim', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Injecteerbare Odoo-laag. `registration` bepaalt wat de webhook over de
 * inschrijving te weten komt; alle aanroepen worden vastgelegd.
 */
function stubDeps({ event = EVENT, registration = {}, mail = null } = {}) {
  const calls = { setAttendance: [], write: [], messagePost: [] };
  const reg = {
    [REGISTRATION_FIELDS.ATTENDED]: false,
    [REGISTRATION_FIELDS.ATTENDANCE_ORIGIN]: false,
    ...registration
  };
  return {
    calls,
    deps: {
      searchRead: async (env, { model }) => {
        if (model === 'x_webinar') return event ? [event] : [];
        if (model === 'x_webinarregistrations') return [reg];
        if (model === 'mail.mail') return mail ? [mail] : [];
        return [];
      },
      write: async (env, args) => {
        calls.write.push(args);
        return true;
      },
      messagePost: async (env, args) => {
        calls.messagePost.push(args);
        return true;
      },
      setAttendance: async (env, id, params) => {
        calls.setAttendance.push({ id, params });
        return {};
      }
    }
  };
}

console.log('\nPostmark-webhook — identificatie');

await test('een Postmark-UUID als MessageID wordt NIET als onze mail herkend', () => {
  // Dit is de bug van 2026-09-10. Zou dit ooit weer true worden, dan is er
  // iemand teruggevallen op MessageID-matching.
  assert.equal(parseEventsV2MessageId('883953f4-6105-42a2-a16a-77a8eac79483'), null);
  assert.equal(identifyMail({ MessageID: '883953f4-6105-42a2-a16a-77a8eac79483' }), null);
});

await test('identificatie gebeurt via Metadata', () => {
  const parsed = identifyMail(metadataPayload());
  assert.deepEqual(parsed, { eventId: 76, kind: 'reminder', registrationId: 1079 });
});

await test('de message_id blijft werken als fallback', () => {
  const parsed = identifyMail({ MessageID: '<evt76-recap-reg1079@om.mymmo.com>' });
  assert.deepEqual(parsed, { eventId: 76, kind: 'recap', registrationId: 1079 });
});

await test('onvolledige of onbekende metadata wordt geweigerd', () => {
  assert.equal(readTrackingMetadata(null), null);
  assert.equal(readTrackingMetadata({ 'om-evt': '76' }), null); // geen soort/registratie
  assert.equal(
    readTrackingMetadata({ 'om-evt': '76', 'om-kind': 'nieuwsbrief', 'om-reg': '9' }),
    null
  );
});

await test('metadata-sleutels worden hoofdletterongevoelig gelezen', () => {
  const parsed = readTrackingMetadata({ 'OM-EVT': '76', 'Om-Kind': 'reminder', 'om-REG': '1079' });
  assert.deepEqual(parsed, { eventId: 76, kind: 'reminder', registrationId: 1079 });
});

console.log('\nPostmark-webhook — headers');

await test('alle drie de soorten krijgen tracking- en metadataheaders', () => {
  for (const kind of MAIL_KINDS) {
    const h = buildMailTrackingHeaders({ eventId: 76, kind, registrationId: 1079 });
    assert.ok(h.includes("'X-PM-TrackOpens': 'true'"), kind);
    assert.ok(h.includes("'X-PM-TrackLinks': 'HtmlAndText'"), kind);
    assert.ok(h.includes(`'X-PM-Metadata-om-kind': '${kind}'`), kind);
    assert.ok(h.includes("'X-PM-Metadata-om-evt': '76'"), kind);
    assert.ok(h.includes("'X-PM-Metadata-om-reg': '1079'"), kind);
  }
});

await test('de headers zijn terug te lezen door readTrackingMetadata', () => {
  // De rondgang die in productie faalde: wat we versturen moet zijn wat we
  // terugkrijgen. Postmark levert de metadata aan als object, dus dat bouwen
  // we hier na uit de header-string.
  const h = buildMailTrackingHeaders({ eventId: 76, kind: MAIL_KIND.CONFIRMATION, registrationId: 1079 });
  const meta = {};
  for (const [, naam, waarde] of h.matchAll(/'X-PM-Metadata-([^']+)': '([^']*)'/g)) meta[naam] = waarde;
  assert.deepEqual(readTrackingMetadata(meta), {
    eventId: 76,
    kind: 'confirmation',
    registrationId: 1079
  });
});

await test('NOOIT een X-PM-Message-Stream-header', () => {
  // Zelfde afspraak als buildPostmarkHeaders in de koppelingen-module: de
  // stream zit in het SMTP-token van de ir.mail_server, en een header die
  // iets anders beweert dan het token is op zijn best overbodig. Zou hier
  // ooit weer een stream-header opduiken, dan lopen de twee modules uit
  // elkaar -- en dat is precies wat we niet willen.
  for (const kind of MAIL_KINDS) {
    const h = buildMailTrackingHeaders({ eventId: 1, kind, registrationId: 2 });
    assert.ok(!h.includes('X-PM-Message-Stream'), kind);
  }
});

await test('metadatawaarden blijven binnen Postmarks grens van 80 tekens', () => {
  const h = buildMailTrackingHeaders({
    eventId: 76,
    kind: 'x'.repeat(200),
    registrationId: 1079
  });
  for (const [, , waarde] of h.matchAll(/'X-PM-Metadata-([^']+)': '([^']*)'/g)) {
    assert.ok(waarde.length <= 80, `waarde te lang: ${waarde.length}`);
  }
});

console.log('\nPostmark-webhook — chatter-labels (schrijver <-> lezer)');

await test('elke soort heeft een eigen, niet-lege open- en klik-tekst', () => {
  const gezien = new Set();
  for (const kind of MAIL_KINDS) {
    for (const soort of ['open', 'click']) {
      const label = chatterLabel(kind, soort);
      assert.ok(label && label.length > 0, `${kind}/${soort} leeg`);
      assert.ok(!gezien.has(label.toLowerCase()), `dubbele tekst: ${label}`);
      gezien.add(label.toLowerCase());
    }
  }
});

await test('de open-tekst van de ene soort zit niet in die van een andere', () => {
  // getMailStatus zoekt met indexOf. Zat "Reminder geopend" als substring in
  // "Herinnering reminder geopend", dan werden twee soorten samen aangezet.
  for (const a of MAIL_KINDS) {
    for (const b of MAIL_KINDS) {
      if (a === b) continue;
      for (const soort of ['open', 'click']) {
        const eenA = chatterLabel(a, soort).toLowerCase();
        const eenB = chatterLabel(b, soort).toLowerCase();
        assert.ok(eenB.indexOf(eenA) === -1, `${a} zit in ${b} (${soort})`);
      }
    }
  }
});

console.log('\nPostmark-webhook — welke link telt');

await test('de eventpagina van DIT event telt', () => {
  assert.equal(isEventLink(EVENT_URL, EVENT, 76), true);
});

await test('de eventpagina van een ANDER event telt niet', () => {
  // Een aankondigingsblok in dezelfde mail linkt naar een ander event.
  assert.equal(isEventLink('https://openvme.be/event/ander-event/?owid=78', EVENT, 76), false);
});

await test('de deelnamelink telt', () => {
  assert.equal(isEventLink('https://us02web.zoom.us/j/123456789?pwd=x', EVENT, 76), true);
});

await test('uitschrijven, Maps en een leeg adres tellen niet', () => {
  assert.equal(isEventLink('https://openvme.be/uitschrijven?e=nico', EVENT, 76), false);
  assert.equal(isEventLink('https://google.com/maps/search/?api=1&query=Gent', EVENT, 76), false);
  assert.equal(isEventLink('', EVENT, 76), false);
  assert.equal(isEventLink(null, EVENT, 76), false);
});

console.log('\nPostmark-webhook — tijdvenster (30 min voor start t/m einde)');

const inWindow = (iso) => isInAttendanceWindow(new Date(iso), EVENT);

await test('30 minuten voor de start valt er nog in', () => {
  assert.equal(inWindow('2026-09-24T13:30:00Z'), true);
});

await test('31 minuten voor de start valt erbuiten', () => {
  assert.equal(inWindow('2026-09-24T13:29:00Z'), false);
});

await test('tijdens het event valt erin, en het einde ook nog', () => {
  assert.equal(inWindow('2026-09-24T14:20:00Z'), true);
  assert.equal(inWindow('2026-09-24T14:45:00Z'), true);
});

await test('na het einde valt erbuiten', () => {
  assert.equal(inWindow('2026-09-24T14:46:00Z'), false);
});

await test('de dag ervoor en de dag erna vallen erbuiten', () => {
  assert.equal(inWindow('2026-09-23T14:00:00Z'), false);
  assert.equal(inWindow('2026-09-25T14:00:00Z'), false);
});

await test('een event zonder start levert nooit aanwezigheid op', () => {
  assert.equal(isInAttendanceWindow(new Date(), { ...EVENT, [EVENT_FIELDS.STARTS_AT]: false }), false);
});

await test('zonder duur wordt op de standaardduur gerekend, niet op nul', () => {
  const zonderDuur = { ...EVENT, [EVENT_FIELDS.DURATION_MINUTES]: false };
  assert.equal(isInAttendanceWindow(new Date('2026-09-24T14:45:00Z'), zonderDuur), true);
});

await test('gebeurtenisTijdstip leest ReceivedAt', () => {
  assert.equal(gebeurtenisTijdstip({ ReceivedAt: '2026-09-24T13:50:00Z' }).toISOString(), '2026-09-24T13:50:00.000Z');
  assert.equal(gebeurtenisTijdstip({}), null);
  assert.equal(gebeurtenisTijdstip({ ReceivedAt: 'geen datum' }), null);
});

console.log('\nPostmark-webhook — aanwezigheid via de volledige webhook');

await test('klik op de reminder, in het venster, zet aanwezigheid', async () => {
  const { calls, deps } = stubDeps();
  const response = await handleEventsV2PostmarkWebhook(request(metadataPayload()), ENV, null, deps);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.attendance.gezet, true);
  assert.equal(calls.setAttendance.length, 1);
  assert.equal(calls.setAttendance[0].id, 1079);
  assert.equal(calls.setAttendance[0].params.attended, true);
  assert.equal(calls.setAttendance[0].params.origin, 'mail_click');
});

await test('klik op de bevestiging telt ook', async () => {
  const { calls, deps } = stubDeps();
  const payload = metadataPayload();
  payload.Metadata[TRACKING_META.KIND] = MAIL_KIND.CONFIRMATION;
  await handleEventsV2PostmarkWebhook(request(payload), ENV, null, deps);
  assert.equal(calls.setAttendance.length, 1);
});

await test('klik op de recap zet NOOIT aanwezigheid', async () => {
  const { calls, deps } = stubDeps();
  const payload = metadataPayload();
  payload.Metadata[TRACKING_META.KIND] = MAIL_KIND.RECAP;
  const body = await (await handleEventsV2PostmarkWebhook(request(payload), ENV, null, deps)).json();
  assert.equal(calls.setAttendance.length, 0);
  assert.equal(body.attendance.reden, 'soort_telt_niet');
});

await test('klik buiten het tijdvenster zet geen aanwezigheid', async () => {
  const { calls, deps } = stubDeps();
  const body = await (
    await handleEventsV2PostmarkWebhook(
      request(metadataPayload({ ReceivedAt: '2026-09-23T10:00:00Z' })),
      ENV,
      null,
      deps
    )
  ).json();
  assert.equal(calls.setAttendance.length, 0);
  assert.equal(body.attendance.reden, 'buiten_tijdvenster');
});

await test('klik op een andere link zet geen aanwezigheid', async () => {
  const { calls, deps } = stubDeps();
  const body = await (
    await handleEventsV2PostmarkWebhook(
      request(metadataPayload({ OriginalLink: 'https://openvme.be/uitschrijven' })),
      ENV,
      null,
      deps
    )
  ).json();
  assert.equal(calls.setAttendance.length, 0);
  assert.equal(body.attendance.reden, 'andere_link');
});

await test('een handmatig gezette aanwezigheid wordt nooit overschreven', async () => {
  const { calls, deps } = stubDeps({
    registration: {
      [REGISTRATION_FIELDS.ATTENDED]: false,
      [REGISTRATION_FIELDS.ATTENDANCE_ORIGIN]: 'events_v2_panel'
    }
  });
  const body = await (await handleEventsV2PostmarkWebhook(request(metadataPayload()), ENV, null, deps)).json();
  assert.equal(calls.setAttendance.length, 0);
  assert.equal(body.attendance.reden, 'handmatig_gezet');
});

await test('een eerdere automatische klik wordt niet opnieuw gezet', async () => {
  const { calls, deps } = stubDeps({
    registration: {
      [REGISTRATION_FIELDS.ATTENDED]: true,
      [REGISTRATION_FIELDS.ATTENDANCE_ORIGIN]: 'mail_click'
    }
  });
  await handleEventsV2PostmarkWebhook(request(metadataPayload()), ENV, null, deps);
  assert.equal(calls.setAttendance.length, 0);
});

console.log('\nPostmark-webhook — overige gebeurtenissen');

await test('delivery zet de mail op received', async () => {
  const { calls, deps } = stubDeps({ mail: { id: 95528, [MAIL_FIELDS.STATE]: 'sent' } });
  const payload = metadataPayload({ RecordType: 'Delivery', DeliveredAt: '2026-09-24T13:00:00Z' });
  delete payload.OriginalLink;
  await handleEventsV2PostmarkWebhook(request(payload), ENV, null, deps);
  assert.equal(calls.write.length, 1);
  assert.equal(calls.write[0].values[MAIL_FIELDS.STATE], 'received');
});

await test('delivery raakt een geannuleerde mail niet aan', async () => {
  const { calls, deps } = stubDeps({ mail: { id: 95528, [MAIL_FIELDS.STATE]: 'cancel' } });
  await handleEventsV2PostmarkWebhook(request(metadataPayload({ RecordType: 'Delivery' })), ENV, null, deps);
  assert.equal(calls.write.length, 0);
});

await test('een open die geen eerste opening is geeft geen chatter-notitie', async () => {
  const { calls, deps } = stubDeps();
  await handleEventsV2PostmarkWebhook(
    request(metadataPayload({ RecordType: 'Open', FirstOpen: false })),
    ENV,
    null,
    deps
  );
  assert.equal(calls.messagePost.length, 0);
});

await test('een eerste opening geeft wel een notitie, met de tekst van chatterLabel', async () => {
  const { calls, deps } = stubDeps();
  await handleEventsV2PostmarkWebhook(
    request(metadataPayload({ RecordType: 'Open', FirstOpen: true })),
    ENV,
    null,
    deps
  );
  assert.equal(calls.messagePost.length, 1);
  assert.ok(calls.messagePost[0].body.includes(chatterLabel(MAIL_KIND.REMINDER, 'open')));
});

await test('een mail van buiten deze module wordt genegeerd, met 200', async () => {
  const { calls, deps } = stubDeps();
  const response = await handleEventsV2PostmarkWebhook(
    request({ RecordType: 'Delivery', MessageID: '883953f4-6105-42a2-a16a-77a8eac79483' }),
    ENV,
    null,
    deps
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, 'not_events_v2_mail');
  assert.equal(calls.write.length, 0);
  assert.equal(calls.messagePost.length, 0);
});

console.log(`\n${passed} tests ok${process.exitCode ? ' — met fouten' : ''}\n`);
