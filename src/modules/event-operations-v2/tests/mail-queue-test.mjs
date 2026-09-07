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

console.log(`\n${passed} test(en) geslaagd${process.exitCode ? ' — MET FOUTEN' : ''}\n`);
