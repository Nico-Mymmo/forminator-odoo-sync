/**
 * Koppelingen — tests voor de Postmark-webhook.
 *
 *   node src/modules/forminator-sync-v2/tests/postmark-webhook-test.mjs
 *
 * Geen netwerk, geen database: de schrijfactie is geinjecteerd, dus wat hier
 * getest wordt is het PARSEN. Dat is precies het gevoelige deel — Postmark
 * noemt de ontvanger en het tijdstip per soort event anders, en een fout
 * daarin merk je niet aan een foutmelding maar aan cijfers die leeg blijven.
 *
 * Even belangrijk: de webhook mag NOOIT een 4xx of 5xx geven op iets dat hij
 * niet kan plaatsen. Postmark schakelt een webhook die blijft falen uit, en
 * dan verlies je ook de events die je wél had kunnen gebruiken.
 */
import assert from 'node:assert/strict';
import {
  handlePostmarkWebhook, isPostmarkWebhookAuthorized, isPostmarkWebhookPath,
  metaWaarde, tijdstip, ontvanger, syncMailEventToOdoo
} from '../postmark-webhook.js';

/** Vangt op welke Odoo-sync-aanroepen er zouden gebeuren. */
function syncVanger() {
  const aanroepen = [];
  return { aanroepen, syncOdoo: async (_env, args) => { aanroepen.push(args); } };
}

let geslaagd = 0;
async function test(naam, fn) {
  try { await fn(); geslaagd += 1; console.log('  ok  ' + naam); }
  catch (e) { console.error('  FAIL ' + naam + '\n       ' + (e && e.message)); process.exitCode = 1; }
}

const ENV = { POSTMARK_WEBHOOK_SECRET: 'geheim' };
const META = {
  'om-int': '64d3e59c-ce8e-4b52-81fd-a8cef984bf52',
  'om-tgt': 'e97bd37d-0165-45d1-bcbc-7f7eb57f79b7',
  'om-sub': 'f9405316-77e8-4c26-9ca1-6e332758d560'
};

function verzoek(payload, token = 'geheim') {
  return new Request('https://om.example/forminator-v2/api/webhooks/postmark?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  });
}

/** Vangt op wat er geschreven zou worden. */
function vanger() {
  const rijen = [];
  return { rijen, schrijf: async (_env, rij) => { rijen.push(rij); return true; } };
}

console.log('\npad en token');

await test('pad en methode', () => {
  assert.equal(isPostmarkWebhookPath('/forminator-v2/api/webhooks/postmark', 'POST'), true);
  assert.equal(isPostmarkWebhookPath('/forminator-v2/api/webhooks/postmark', 'GET'), false);
  assert.equal(isPostmarkWebhookPath('/forminator-v2/api/webhook', 'POST'), false);
});

await test('zonder ingesteld secret is de route DICHT, niet open', () => {
  assert.equal(isPostmarkWebhookAuthorized(verzoek({}), {}), false);
  assert.equal(isPostmarkWebhookAuthorized(verzoek({}), { POSTMARK_WEBHOOK_SECRET: '' }), false);
});

await test('alleen het juiste token komt binnen', () => {
  assert.equal(isPostmarkWebhookAuthorized(verzoek({}, 'geheim'), ENV), true);
  assert.equal(isPostmarkWebhookAuthorized(verzoek({}, 'fout'), ENV), false);
  assert.equal(isPostmarkWebhookAuthorized(verzoek({}, ''), ENV), false);
});

console.log('\nparsen per soort event');

await test('een open wordt geschreven met eerste-open, tijdstip en ontvanger', async () => {
  const v = vanger();
  const res = await handlePostmarkWebhook(verzoek({
    RecordType: 'Open', MessageID: 'pm-1', Recipient: 'nico@mymmo.com',
    FirstOpen: true, ReceivedAt: '2026-09-08T21:30:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf });
  assert.equal(res.status, 200);
  assert.equal(v.rijen.length, 1);
  const r = v.rijen[0];
  assert.equal(r.event_type, 'open');
  assert.equal(r.first_open, true);
  assert.equal(r.recipient, 'nico@mymmo.com');
  assert.equal(r.occurred_at, '2026-09-08T21:30:00.000Z');
  assert.equal(r.submission_id, META['om-sub']);
  assert.equal(r.integration_id, META['om-int']);
  assert.equal(r.target_id, META['om-tgt']);
  assert.ok(r.payload && r.payload.MessageID === 'pm-1', 'de ruwe payload hoort bewaard te worden');
});

await test('een heropening komt binnen als first_open false', async () => {
  const v = vanger();
  await handlePostmarkWebhook(verzoek({
    RecordType: 'Open', Recipient: 'a@b.co', FirstOpen: false,
    ReceivedAt: '2026-09-08T22:00:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf });
  assert.equal(v.rijen[0].first_open, false);
});

await test('een aflevering gebruikt DeliveredAt', async () => {
  const v = vanger();
  await handlePostmarkWebhook(verzoek({
    RecordType: 'Delivery', Recipient: 'a@b.co',
    DeliveredAt: '2026-09-08T21:00:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf });
  assert.equal(v.rijen[0].event_type, 'delivery');
  assert.equal(v.rijen[0].occurred_at, '2026-09-08T21:00:00.000Z');
  assert.equal(v.rijen[0].first_open, null, 'first_open hoort alleen bij een open');
});

await test('een bounce gebruikt Email en BouncedAt, niet Recipient/ReceivedAt', async () => {
  const v = vanger();
  await handlePostmarkWebhook(verzoek({
    RecordType: 'Bounce', Email: 'weg@b.co', Type: 'HardBounce',
    BouncedAt: '2026-09-08T21:05:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf });
  assert.equal(v.rijen[0].event_type, 'bounce');
  assert.equal(v.rijen[0].recipient, 'weg@b.co');
  assert.equal(v.rijen[0].occurred_at, '2026-09-08T21:05:00.000Z');
});

await test('een klik en een spamklacht worden herkend', async () => {
  const v = vanger();
  await handlePostmarkWebhook(verzoek({ RecordType: 'Click', Recipient: 'a@b.co', Metadata: META }), ENV, { schrijf: v.schrijf });
  await handlePostmarkWebhook(verzoek({ RecordType: 'SpamComplaint', Email: 'a@b.co', Metadata: META }), ENV, { schrijf: v.schrijf });
  assert.deepEqual(v.rijen.map((r) => r.event_type), ['click', 'spamcomplaint']);
});

await test('metadata-sleutels worden case-insensitief gelezen', () => {
  assert.equal(metaWaarde({ 'OM-Sub': 'x' }, 'om-sub'), 'x');
  assert.equal(metaWaarde({ 'om-sub': '  ' }, 'om-sub'), null, 'leeg is null, niet een lege string');
  assert.equal(metaWaarde(null, 'om-sub'), null);
});

await test('een ontbrekend tijdstip valt terug op nu, in plaats van het event te verliezen', () => {
  const uit = tijdstip({});
  assert.ok(!Number.isNaN(new Date(uit).getTime()));
  assert.equal(tijdstip({ ReceivedAt: 'geen datum' }).length, new Date().toISOString().length);
});

console.log('\nniets wat Postmark kan doen mag een fout opleveren');

for (const [naam, payload] of [
  ['onbekend RecordType', { RecordType: 'Iets', Metadata: META }],
  ['geen RecordType', { Metadata: META }],
  ['mail van buiten de koppelingen (geen metadata)', { RecordType: 'Open', Recipient: 'a@b.co' }],
  ['metadata zonder onze velden', { RecordType: 'Open', Metadata: { PropA: '1' } }]
]) {
  await test('200 en niets geschreven bij: ' + naam, async () => {
    const v = vanger();
    const res = await handlePostmarkWebhook(verzoek(payload), ENV, { schrijf: v.schrijf });
    assert.equal(res.status, 200, 'Postmark zet een webhook uit die blijft falen');
    assert.equal(v.rijen.length, 0);
  });
}

await test('200 bij een onleesbare body', async () => {
  const v = vanger();
  const res = await handlePostmarkWebhook(verzoek('{niet json'), ENV, { schrijf: v.schrijf });
  assert.equal(res.status, 200);
  assert.equal(v.rijen.length, 0);
});

await test('200 als het wegschrijven zelf faalt', async () => {
  // Bijvoorbeeld een stap die inmiddels verwijderd is: geen storing.
  const res = await handlePostmarkWebhook(
    verzoek({ RecordType: 'Open', Recipient: 'a@b.co', Metadata: META }),
    ENV,
    { schrijf: async () => { throw new Error('foreign key'); } }
  );
  assert.equal(res.status, 200);
});

console.log('\nOdoo-sync (chatter-notitie)');

await test('een aflevering en een eerste open triggeren de Odoo-sync, een heropening niet', async () => {
  const v = vanger();
  const s = syncVanger();
  await handlePostmarkWebhook(verzoek({
    RecordType: 'Delivery', Recipient: 'a@b.co', DeliveredAt: '2026-09-08T21:00:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf, syncOdoo: s.syncOdoo });
  await handlePostmarkWebhook(verzoek({
    RecordType: 'Open', Recipient: 'a@b.co', FirstOpen: true, ReceivedAt: '2026-09-08T21:30:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf, syncOdoo: s.syncOdoo });
  await handlePostmarkWebhook(verzoek({
    RecordType: 'Open', Recipient: 'a@b.co', FirstOpen: false, ReceivedAt: '2026-09-08T22:00:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf, syncOdoo: s.syncOdoo });
  assert.deepEqual(s.aanroepen.map((a) => a.soort), ['delivery', 'open'], 'de heropening mag geen sync triggeren');
  assert.equal(s.aanroepen[0].submissionId, META['om-sub']);
  assert.equal(s.aanroepen[0].targetId, META['om-tgt']);
});

await test('een subscriptionchange triggert geen Odoo-sync (geen chatter-waardig event)', async () => {
  const v = vanger();
  const s = syncVanger();
  await handlePostmarkWebhook(verzoek({
    RecordType: 'SubscriptionChange', Recipient: 'a@b.co', ChangedAt: '2026-09-08T21:00:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf, syncOdoo: s.syncOdoo });
  assert.equal(s.aanroepen.length, 0);
});

await test('een falende Odoo-sync breekt de Postmark-respons niet (blijft 200)', async () => {
  const v = vanger();
  const res = await handlePostmarkWebhook(verzoek({
    RecordType: 'Bounce', Email: 'a@b.co', BouncedAt: '2026-09-08T21:00:00Z', Metadata: META
  }), ENV, { schrijf: v.schrijf, syncOdoo: async () => { throw new Error('Odoo onbereikbaar'); } });
  assert.equal(res.status, 200);
  assert.equal(v.rijen.length, 1, 'het event moet wel gewoon weggeschreven zijn');
});

console.log('\nsyncMailEventToOdoo: mail.mail.state naar received bij aflevering');

/** syncMailEventToOdoo rechtstreeks testen, met alle Odoo/db-aanroepen
 *  geinjecteerd via de `deps`-parameter (`searchRead`, `write`, `messagePost`,
 *  `getLatestSubmissionTargetResultByTarget`) -- zelfde aanpak als
 *  `opties.schrijf`/`opties.syncOdoo` op handlePostmarkWebhook, nu een laag
 *  dieper zodat we de state-write op mail.mail zelf kunnen controleren. */
function odooVanger(overrides = {}) {
  const writeCalls = [];
  const messagePostCalls = [];
  return {
    writeCalls,
    messagePostCalls,
    searchRead: overrides.searchRead || (async () => [{ model: 'res.partner', res_id: 938210, state: 'sent' }]),
    write: async (_env, args) => { writeCalls.push(args); },
    messagePost: async (_env, args) => { messagePostCalls.push(args); }
  };
}

await test('een aflevering zet mail.mail.state op received', async () => {
  const deps = odooVanger();
  await syncMailEventToOdoo({}, {
    soort: 'delivery', payload: { Recipient: 'a@b.co' }, submissionId: 'sub-1', targetId: 'tgt-1'
  }, { ...deps, getLatestSubmissionTargetResultByTarget: async () => ({ odoo_record_id: 95516 }) });
  assert.deepEqual(deps.writeCalls, [{ model: 'mail.mail', ids: [95516], values: { state: 'received' } }]);
  assert.equal(deps.messagePostCalls.length, 1, 'aflevering blijft ook een chatter-notitie zetten');
});

await test('een open of klik zet GEEN state, enkel de chatter-notitie', async () => {
  const deps = odooVanger();
  await syncMailEventToOdoo({}, {
    soort: 'open', payload: { Recipient: 'a@b.co', FirstOpen: true }, submissionId: 'sub-1', targetId: 'tgt-1'
  }, { ...deps, getLatestSubmissionTargetResultByTarget: async () => ({ odoo_record_id: 95516 }) });
  assert.equal(deps.writeCalls.length, 0, 'open mag mail.mail.state niet aanraken');
  assert.equal(deps.messagePostCalls.length, 1);
});

await test('een reeds geannuleerde mail wordt niet naar received teruggezet', async () => {
  const deps = odooVanger({ searchRead: async () => [{ model: 'res.partner', res_id: 938210, state: 'cancel' }] });
  await syncMailEventToOdoo({}, {
    soort: 'delivery', payload: { Recipient: 'a@b.co' }, submissionId: 'sub-1', targetId: 'tgt-1'
  }, { ...deps, getLatestSubmissionTargetResultByTarget: async () => ({ odoo_record_id: 95516 }) });
  assert.equal(deps.writeCalls.length, 0, 'cancel mag niet overschreven worden');
});

await test('een mail zonder model/res_id krijgt nog wel de statuswijziging', async () => {
  const deps = odooVanger({ searchRead: async () => [{ model: false, res_id: false, state: 'sent' }] });
  await syncMailEventToOdoo({}, {
    soort: 'delivery', payload: { Recipient: 'a@b.co' }, submissionId: 'sub-1', targetId: 'tgt-1'
  }, { ...deps, getLatestSubmissionTargetResultByTarget: async () => ({ odoo_record_id: 95516 }) });
  assert.deepEqual(deps.writeCalls, [{ model: 'mail.mail', ids: [95516], values: { state: 'received' } }]);
  assert.equal(deps.messagePostCalls.length, 0, 'zonder model/res_id kan er geen chatter-notitie komen');
});

console.log('\n' + geslaagd + ' test(en) geslaagd');
