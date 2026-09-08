/**
 * Event Operations v2 — Wachtrij-tests (mail.mail)
 *
 *   node src/modules/event-operations-v2/tests/mail-queue-test.mjs
 *
 * Draait ZONDER Odoo-verbinding: `fetch` is gestubd en geeft JSON-RPC-
 * antwoorden terug, zoals de mini-apps-tests dat ook doen. Zo is te
 * controleren welke domeinen en welke waarden er écht naar Odoo gaan.
 *
 * Waarom dit een eigen bestand is: mail-test.mjs is bewust puur (geen I/O).
 * Deze functies doen wél I/O, en juist het DOMEIN is hier het gevoelige deel
 * -- een verkeerde filter annuleert stil de verkeerde mails, of geen enkele.
 */

import assert from 'node:assert/strict';
import { cancelPendingMails, revivePendingMails } from '../lib/mail-service.js';

const ENV = { DB_NAME: 'test', UID: '2', API_KEY: 'x' };

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

/**
 * Elke aanroep vastleggen en een antwoord teruggeven.
 * @param {Array} antwoorden - per aanroep, in volgorde
 */
function stubFetch(antwoorden) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const [, , , model, method, args, kwargs] = body.params.args;
    calls.push({ model, method, args, kwargs });
    const result = antwoorden.length > 0 ? antwoorden.shift() : [];
    return { ok: true, text: async () => JSON.stringify({ jsonrpc: '2.0', result }) };
  };
  return calls;
}

console.log('\nannuleren bij het archiveren van een inschrijving');

await test('zoekt alleen naar OUTGOING mails van deze inschrijvingen', async () => {
  const calls = stubFetch([[{ id: 11 }, { id: 12 }], true]);
  const result = await cancelPendingMails(ENV, [1079, 1080]);

  assert.equal(result.cancelled, 2);

  const zoek = calls[0];
  assert.equal(zoek.model, 'mail.mail');
  assert.equal(zoek.method, 'search_read');
  const domein = zoek.args[0];
  assert.deepEqual(domein[0], ['model', '=', 'x_webinarregistrations']);
  assert.deepEqual(domein[1], ['res_id', 'in', [1079, 1080]]);
  // Dit is het gevoelige deel: een al VERZONDEN mail mag je niet aanraken.
  assert.deepEqual(domein[2], ['state', '=', 'outgoing']);
});

await test('zet state op cancel, en verwijdert dus niets', async () => {
  const calls = stubFetch([[{ id: 11 }], true]);
  await cancelPendingMails(ENV, [1079]);

  const schrijf = calls[1];
  assert.equal(schrijf.method, 'write');
  assert.deepEqual(schrijf.args[0], [11]);
  assert.deepEqual(schrijf.args[1], { state: 'cancel' });
  // Geen unlink: het spoor blijft bestaan.
  assert.ok(!calls.some((call) => call.method === 'unlink'));
});

await test('geen klaarstaande mails? dan ook geen write', async () => {
  const calls = stubFetch([[]]);
  const result = await cancelPendingMails(ENV, [1079]);
  assert.equal(result.cancelled, 0);
  assert.equal(calls.length, 1, 'er is een write gedaan zonder dat er iets te annuleren was');
});

await test('een lege lijst raakt Odoo niet aan', async () => {
  const calls = stubFetch([]);
  assert.deepEqual(await cancelPendingMails(ENV, []), { cancelled: 0, ids: [] });
  assert.equal(calls.length, 0);
});

await test('een fout van Odoo is niet fataal — het archiveren zelf is al gelukt', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ jsonrpc: '2.0', error: { message: 'stuk' } })
  });
  const result = await cancelPendingMails(ENV, [1079]);
  assert.equal(result.cancelled, 0);
});

console.log('\nterugzetten bij het terughalen uit het archief');

await test('zet alleen mails terug waarvan het moment nog moet komen', async () => {
  const calls = stubFetch([[{ id: 21 }], true]);
  const now = new Date('2026-09-05T10:00:00Z');
  const result = await revivePendingMails(ENV, [1079], now);

  assert.equal(result.revived, 1);

  const domein = calls[0].args[0];
  assert.deepEqual(domein[2], ['state', '=', 'cancel']);
  // Een mail die "meteen" moest of waarvan het moment voorbij is, blijft
  // geannuleerd -- anders vertrekt er een reminder voor een event dat al
  // geweest is.
  assert.deepEqual(domein[3], ['scheduled_date', '>', '2026-09-05 10:00:00']);

  assert.deepEqual(calls[1].args[1], { state: 'outgoing' });
});

await test('niets om terug te zetten geeft 0 en doet geen write', async () => {
  const calls = stubFetch([[]]);
  assert.deepEqual(await revivePendingMails(ENV, [1079]), { revived: 0 });
  assert.equal(calls.length, 1);
});

console.log('\nrecap weigert te vertrekken zonder opname');

await test('een recap met een opnameblok en geen video wordt geweigerd', async () => {
  stubFetch([]);
  const { queueMails } = await import('../lib/mail-service.js');

  const doc = JSON.stringify({
    recap: {
      subject: 'Bedankt',
      blocks: [{ id: 'v', type: 'video' }],
      header: {}
    }
  });

  // Antwoorden in de volgorde die queueMails ze opvraagt: fields_get voor de
  // optionele velden, dan de twee blokkenvelden.
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const [, , , model, method] = body.params.args;
    let result = [];
    if (method === 'fields_get') result = { x_studio_mail_blocks: { type: 'text' }, x_studio_mail_blocks_override: { type: 'text' } };
    else if (model === 'x_webinar_event_type') result = [{ id: 3, x_studio_mail_blocks: doc }];
    else if (model === 'x_webinar') result = [{ id: 76, x_studio_mail_blocks_override: false }];
    return { ok: true, text: async () => JSON.stringify({ jsonrpc: '2.0', result }) };
  };

  const event = { id: 76, event_type: { id: 3 }, host: { id: 11 }, recap: { video_url: '', thumbnail_url: '' } };
  const registraties = [{ id: 1, name: 'Jan', submitted_email: 'j@e.com', state: 'registered', site: null }];

  await assert.rejects(
    () => queueMails(ENV, { event, registrations: registraties, kind: 'recap' }),
    (error) => {
      assert.equal(error.code, 'MAIL_RECAP_NO_VIDEO');
      assert.match(error.message, /geen opname/);
      return true;
    }
  );
});

console.log('\nklaarstaande mails bijwerken in plaats van overslaan');

/**
 * Een volledige queueMails-ronde, met alles wat Odoo daarvoor te zeggen
 * heeft. Antwoorden per (model, methode) in plaats van op volgorde: de
 * volgorde van de parallelle calls is een implementatiedetail, en een test
 * die daarop leunt breekt bij de eerste Promise.all die van plaats wisselt.
 */
function stubOdoo({ mailRows }) {
  const calls = [];
  const doc = JSON.stringify({
    recap: { subject: 'Bedankt {{registration.first_name}}', blocks: [{ id: 't', type: 'text', html: '<p>Tot de volgende!</p>' }], header: {} }
  });

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const [, , , model, method, args, kwargs] = body.params.args;
    calls.push({ model, method, args, kwargs });

    let result = [];
    if (method === 'fields_get') {
      result = { x_studio_mail_blocks: { type: 'text' }, x_studio_mail_blocks_override: { type: 'text' } };
    } else if (model === 'x_webinar_event_type') {
      result = [{ id: 3, x_studio_mail_blocks: doc }];
    } else if (model === 'x_webinar') {
      result = [{ id: 76, x_studio_mail_blocks_override: false }];
    } else if (model === 'res.users') {
      result = [{ id: 11, name: 'Rob Claes', email: 'rob@mymmo.com', employee_id: false }];
    } else if (model === 'mail.mail' && method === 'search_read') {
      result = mailRows;
    } else if (method === 'write' || method === 'create') {
      result = true;
    }
    return { ok: true, text: async () => JSON.stringify({ jsonrpc: '2.0', result }) };
  };

  return calls;
}

const EVENT_MET_OPNAME = {
  id: 76,
  slug: 'qa',
  title: 'Q&A',
  starts_at: '2026-09-08T17:00:00.000Z',
  event_type: { id: 3, name: 'Q&A' },
  host: { id: 11, name: 'Rob Claes' },
  recap: { video_url: 'https://vimeo.com/1', thumbnail_url: 'https://i/1.jpg' }
};
const REG = [{ id: 1, name: 'Jan Peeters', submitted_email: 'j@e.com', state: 'registered', site: null }];
const SLEUTEL = '<evt76-recap-reg1@om.mymmo.com>';

await test('een KLAARSTAANDE mail wordt herschreven, niet opnieuw aangemaakt', async () => {
  const calls = stubOdoo({ mailRows: [{ id: 501, message_id: SLEUTEL, state: 'outgoing' }] });
  const { queueMails } = await import('../lib/mail-service.js');

  const result = await queueMails(ENV, { event: EVENT_MET_OPNAME, registrations: REG, kind: 'recap' });

  assert.deepEqual(result.queued, [], 'er is een tweede mail aangemaakt');
  assert.deepEqual(result.updated, [1], 'de klaarstaande mail is niet bijgewerkt');
  assert.ok(!calls.some((call) => call.model === 'mail.mail' && call.method === 'create'), 'create op mail.mail');

  const schrijf = calls.find((call) => call.model === 'mail.mail' && call.method === 'write');
  assert.ok(schrijf, 'geen write op mail.mail');
  assert.deepEqual(schrijf.args[0], [501], 'de verkeerde mail is bijgewerkt');

  const waarden = schrijf.args[1];
  assert.match(waarden.subject, /Bedankt Jan/, 'het onderwerp is niet opnieuw gerenderd');
  assert.match(waarden.body_html, /Tot de volgende!/, 'de body is niet opnieuw gerenderd');
  // De sleutel MOET dezelfde blijven: die is de idempotentie.
  assert.equal(waarden.message_id, undefined, 'de message_id is overschreven');
  assert.equal(waarden.state, undefined, 'de state is overschreven');
});

await test('een VERZONDEN mail blijft vast', async () => {
  const calls = stubOdoo({ mailRows: [{ id: 501, message_id: SLEUTEL, state: 'sent' }] });
  const { queueMails } = await import('../lib/mail-service.js');

  const result = await queueMails(ENV, { event: EVENT_MET_OPNAME, registrations: REG, kind: 'recap' });

  assert.deepEqual(result.queued, []);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.skipped, [{ id: 1, reason: 'al verstuurd' }]);
  assert.ok(!calls.some((call) => call.model === 'mail.mail' && (call.method === 'write' || call.method === 'create')),
    'een verstuurde mail is aangeraakt');
});

await test('refresh: false laat de klaarstaande mail met rust', async () => {
  const calls = stubOdoo({ mailRows: [{ id: 501, message_id: SLEUTEL, state: 'outgoing' }] });
  const { queueMails } = await import('../lib/mail-service.js');

  const result = await queueMails(ENV, { event: EVENT_MET_OPNAME, registrations: REG, kind: 'recap', refresh: false });

  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.skipped, [{ id: 1, reason: 'stond al klaar' }]);
  assert.ok(!calls.some((call) => call.model === 'mail.mail' && call.method === 'write'));
});

await test('staat er nog niets, dan wordt er gewoon aangemaakt', async () => {
  const calls = stubOdoo({ mailRows: [] });
  const { queueMails } = await import('../lib/mail-service.js');

  const result = await queueMails(ENV, { event: EVENT_MET_OPNAME, registrations: REG, kind: 'recap' });

  assert.deepEqual(result.queued, [1]);
  assert.deepEqual(result.updated, []);
  const aanmaak = calls.find((call) => call.model === 'mail.mail' && call.method === 'create');
  assert.ok(aanmaak, 'geen create op mail.mail');
  assert.equal(aanmaak.args[0].message_id, SLEUTEL);
});

console.log('\nde ondergrens van de reminder (event 76)');

await test('een inschrijving van vorige week krijgt zijn reminder, ook met minLeadHours 48', async () => {
  // Dit is event 76 na: minLeadHours stond op 48, het event begon over 29
  // uur, en er kwam GEEN ENKELE mail bij -- twintig inschrijvers stil
  // overgeslagen. De grens hoort tegen het inschrijfmoment te gaan.
  const doc = JSON.stringify({
    reminder: {
      subject: 'Morgen',
      blocks: [{ id: 't', type: 'text', html: '<p>Tot morgen!</p>' }],
      timing: { enabled: true, leadHours: 24, minLeadHours: 48 },
      header: {}
    }
  });

  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const [, , , model, method, args, kwargs] = body.params.args;
    calls.push({ model, method, args, kwargs });
    let result = [];
    if (method === 'fields_get') result = { x_studio_mail_blocks: { type: 'text' }, x_studio_mail_blocks_override: { type: 'text' } };
    else if (model === 'x_webinar_event_type') result = [{ id: 3, x_studio_mail_blocks: doc }];
    else if (model === 'x_webinar') result = [{ id: 76, x_studio_mail_blocks_override: false }];
    else if (model === 'res.users') result = [{ id: 11, name: 'Rob Claes', email: 'rob@mymmo.com', employee_id: false }];
    else if (model === 'mail.mail' && method === 'search_read') result = [];
    else if (method === 'write' || method === 'create') result = true;
    return { ok: true, text: async () => JSON.stringify({ jsonrpc: '2.0', result }) };
  };

  const { queueMails } = await import('../lib/mail-service.js');
  const event = {
    id: 76, slug: 'qa', title: 'Q&A', starts_at: '2026-09-08T17:00:00.000Z',
    event_type: { id: 3, name: 'Q&A' }, host: { id: 11, name: 'Rob Claes' }, recap: {}
  };
  const nu = new Date('2026-09-07T11:43:00Z');

  const result = await queueMails(ENV, {
    event,
    registrations: [
      // Vorige week ingeschreven: hoort zijn reminder te krijgen.
      { id: 1045, name: 'Tom', submitted_email: 't@e.be', state: null, site: null, created_at: '2026-08-30T09:00:00.000Z' },
      // Vandaag ingeschreven, binnen de grens van 48 uur: die niet.
      { id: 1090, name: 'Laat', submitted_email: 'l@e.be', state: null, site: null, created_at: '2026-09-07T10:00:00.000Z' }
    ],
    kind: 'reminder',
    now: nu
  });

  assert.deepEqual(result.queued, [1045], 'de inschrijving van vorige week is overgeslagen');
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /binnen 48 uur/);

  const aanmaak = calls.find((call) => call.model === 'mail.mail' && call.method === 'create');
  assert.ok(aanmaak, 'er is geen mail.mail aangemaakt');
  // 24 uur voor 8 sep 17:00 UTC.
  assert.equal(aanmaak.args[0].scheduled_date, '2026-09-07 17:00:00');
});

console.log(`\n${passed} test(en) geslaagd${process.exitCode ? ' — MET FOUTEN' : ''}\n`);
