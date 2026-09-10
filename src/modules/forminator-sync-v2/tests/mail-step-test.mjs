/**
 * Koppelingen — tests voor de send_mail-stap.
 *
 *   node src/modules/forminator-sync-v2/tests/mail-step-test.mjs
 *
 * Draait ZONDER Odoo: `fetch` is gestubd en geeft JSON-RPC-antwoorden terug,
 * zelfde aanpak als mail-queue-test.mjs in event-operations-v2. Wat hier
 * bewaakt wordt is niet "komt er HTML uit" maar WELKE WAARDEN er naar Odoo
 * gaan: het domein van de blacklist-check, de message_id, auto_delete,
 * mail_server_id, en dat een overgeslagen mail een REDEN meegeeft.
 */

import assert from 'node:assert/strict';
import {
  buildMailMessageId, computeScheduledDate, buildPostmarkHeaders, lijktOpEmail, schuifNaarVenster,
  isBlacklisted, resolveSender, runSendMailStep, MailStepError
} from '../mail-step.js';

const ENV = { DB_NAME: 'test', UID: '2', API_KEY: 'x' };

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    console.error('  FAIL ' + name + '\n       ' + (error && error.message));
    process.exitCode = 1;
  }
}

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

const lookupForm = (form, key) => form[key];

function stap(extra = {}) {
  return {
    id: 'tgt-1', odoo_model: 'crm.lead',
    mail_layout: 'plain',
    mail_subject_template: 'Bedankt {{contact.first_name}}',
    mail_body_html: 'Hoi {{contact.first_name}},\n\nTot binnenkort!\n{{sender.name}}',
    mail_recipient_source: 'field.email-1',
    mail_res_id_source: 'step.1.record_id',
    mail_from_source: 'record_user',
    mail_from_name: 'Syndicoach', mail_from_email: 'info@syndicoach.be',
    mail_delay_minutes: 90, mail_server_id: 5,
    mail_window_start_min: 480, mail_window_end_min: 1200,
    mail_track_opens: true, mail_respect_blacklist: true,
    ...extra
  };
}
const INTEGRATIE = { id: 'int-9' };
const FORM = { 'email-1': 'Jadranka@Example.ORG', name: 'Jadranka Vleyninckx' };
const CTX = { 'step.1.record_id': 11490 };
const NU = new Date('2026-09-08T14:00:00Z');

console.log('\nsleutel, tijd en headers');

await test('message_id is uniek per koppeling, stap en indiening', () => {
  const a = buildMailMessageId({ integrationId: 'int-9', targetId: 'tgt-1', submissionId: 'sub-3' });
  assert.equal(a, '<kopint9-ttgt1-subsub3@om.mymmo.com>');
  const b = buildMailMessageId({ integrationId: 'int-9', targetId: 'tgt-2', submissionId: 'sub-3' });
  assert.notEqual(a, b, 'twee stappen in dezelfde koppeling mogen niet dezelfde sleutel krijgen');
});

await test('0 minuten geeft GEEN scheduled_date, 90 minuten wel', () => {
  assert.equal(computeScheduledDate(0, NU), null);
  assert.equal(computeScheduledDate(null, NU), null);
  assert.equal(computeScheduledDate(90, NU), '2026-09-08 15:30:00');
});

await test('headers zijn een Python-dict, zonder X-PM-Message-Stream', () => {
  const h = buildPostmarkHeaders({ trackOpens: true, integrationId: 'int-9', targetId: 'tgt-1', submissionId: 'sub-3' });
  assert.equal(h,
    "{'X-PM-TrackOpens': 'true', 'X-PM-Metadata-om-int': 'int-9', " +
    "'X-PM-Metadata-om-tgt': 'tgt-1', 'X-PM-Metadata-om-sub': 'sub-3'}");
  assert.ok(!h.includes('Message-Stream'), 'de stream zit in het SMTP-token, niet in een header');
});

await test('headers: aanhalingstekens uit een waarde worden geweerd', () => {
  const h = buildPostmarkHeaders({ trackOpens: false, integrationId: "a'b\"c", targetId: 't', submissionId: 's' });
  assert.ok(!h.includes("'a'b"), 'een quote in een waarde zou de safe_eval van Odoo breken: ' + h);
  assert.equal(h, "{'X-PM-Metadata-om-int': 'abc', 'X-PM-Metadata-om-tgt': 't', 'X-PM-Metadata-om-sub': 's'}");
});

await test('GEEN metadatawaarde boven 80 tekens (Postmark-limiet)', () => {
  // Dit is de regressie van mail 95438: drie UUID's in één veld = 110 tekens.
  // Odoo meldde 'sent' en het bericht kwam nooit in Postmark aan.
  const h = buildPostmarkHeaders({
    trackOpens: true,
    integrationId: '64d3e59c-ce8e-4b52-81fd-a8cef984bf52',
    targetId:      'e97bd37d-0165-45d1-bcbc-7f7eb57f79b7',
    submissionId:  '83ca83a9-acf0-4616-b905-a5145282a418'
  });
  const waarden = [...h.matchAll(/'X-PM-Metadata-[^']+': '([^']*)'/g)].map((m) => m[1]);
  assert.equal(waarden.length, 3, 'drie aparte metadatavelden verwacht, kreeg: ' + h);
  for (const w of waarden) {
    assert.ok(w.length <= 80, 'metadatawaarde van ' + w.length + ' tekens overschrijdt de Postmark-limiet van 80');
  }
  const namen = [...h.matchAll(/'X-PM-Metadata-([^']+)':/g)].map((m) => m[1]);
  for (const n of namen) {
    assert.ok(n.length <= 20, 'metadata-veldnaam "' + n + '" is langer dan 20 tekens');
  }
  assert.ok(!h.includes('om-mail'), 'het samengestelde veld hoort weg te zijn');
});

await test('losse e-mailcontrole', () => {
  assert.ok(lijktOpEmail('a@b.co'));
  assert.ok(!lijktOpEmail('a@b'));
  assert.ok(!lijktOpEmail(''));
  assert.ok(!lijktOpEmail('twee @adressen.be'));
});

console.log('\nverzendvenster (Europe/Brussels)');

// September = zomertijd, dus Brussel is UTC+2.
const VENSTER = { startMin: 480, endMin: 1200 };  // 08:00 - 20:00

await test('een aanvraag om 01:30 wordt niet om 03:00 gemaild maar om 08:00', () => {
  // 01:30 Brussel = 23:30 UTC de dag ervoor. +90 min = 03:00 Brussel.
  const uit = computeScheduledDate(90, new Date('2026-09-07T23:30:00Z'), VENSTER);
  assert.equal(uit, '2026-09-08 06:00:00', 'verwacht 08:00 Brussel = 06:00 UTC, kreeg ' + uit);
});

await test('binnen het venster blijft de vertraging exact', () => {
  // 10:00 Brussel = 08:00 UTC. +90 min = 11:30 Brussel, ruim binnen.
  assert.equal(computeScheduledDate(90, new Date('2026-09-08T08:00:00Z'), VENSTER), '2026-09-08 09:30:00');
});

await test('na sluitingstijd schuift de mail naar de ochtend erna', () => {
  // 19:30 Brussel = 17:30 UTC. +90 min = 21:00 Brussel, dus over de grens.
  const uit = computeScheduledDate(90, new Date('2026-09-08T17:30:00Z'), VENSTER);
  assert.equal(uit, '2026-09-09 06:00:00', 'verwacht de volgende ochtend 08:00 Brussel, kreeg ' + uit);
});

await test('het venster schuift NOOIT naar vroeger', () => {
  // Zou vervroegen de vertraging ongedaan maken, dan is de instelling zinloos.
  const basis = new Date('2026-09-08T08:00:00Z');
  const uit = schuifNaarVenster(new Date(basis.getTime() + 90 * 60000), 480, 1200);
  assert.ok(uit.getTime() >= basis.getTime() + 90 * 60000);
});

await test('start gelijk aan eind betekent: geen venster', () => {
  const uit = computeScheduledDate(90, new Date('2026-09-07T23:30:00Z'), { startMin: 480, endMin: 480 });
  assert.equal(uit, '2026-09-08 01:00:00', 'zonder venster gewoon +90 minuten');
});

await test('zonder vertraging maar buiten het venster komt er wel een moment', () => {
  // Anders zou een stap zonder vertraging het venster kunnen omzeilen.
  assert.equal(computeScheduledDate(0, new Date('2026-09-08T01:00:00Z'), VENSTER), '2026-09-08 06:00:00');
});

await test('zonder vertraging en binnen het venster blijft het veld leeg', () => {
  assert.equal(computeScheduledDate(0, new Date('2026-09-08T08:00:00Z'), VENSTER), null);
});

console.log('\nblacklist en afzender');

await test('blacklist: adres wordt kleingeschreven en alleen actieve rijen tellen', async () => {
  const calls = stubFetch([[{ id: 3 }]]);
  assert.equal(await isBlacklisted(ENV, 'Weg@Example.ORG'), true);
  assert.equal(calls[0].model, 'mail.blacklist');
  assert.deepEqual(calls[0].args[0], [['email', '=', 'weg@example.org'], ['active', '=', true]]);
});

await test('afzender: de eigenaar van het record wint', async () => {
  stubFetch([[{ id: 11490, user_id: [7, 'Thomas'] }], [{ id: 7, name: 'Thomas Peeters', email: 'thomas@openvme.be', job_title: 'Coach' }]]);
  const s = await resolveSender(ENV, { target: stap(), model: 'crm.lead', recordId: 11490 });
  assert.deepEqual(s, { name: 'Thomas Peeters', email: 'thomas@openvme.be', jobTitle: 'Coach' });
});

await test('afzender: zonder eigenaar valt hij terug op het vaste adres', async () => {
  stubFetch([[{ id: 11490, user_id: false }]]);
  const s = await resolveSender(ENV, { target: stap(), model: 'crm.lead', recordId: 11490 });
  assert.equal(s.email, 'info@syndicoach.be');
  assert.equal(s.name, 'Syndicoach');
});

await test('afzender: stand "fixed" doet geen enkele Odoo-call', async () => {
  const calls = stubFetch([]);
  const s = await resolveSender(ENV, { target: stap({ mail_from_source: 'fixed' }), model: 'crm.lead', recordId: 11490 });
  assert.equal(s.email, 'info@syndicoach.be');
  assert.equal(calls.length, 0);
});

console.log('\nde stap zelf');

await test('gelukkig pad: één mail.mail met de juiste waarden', async () => {
  const calls = stubFetch([
    [],                                                     // blacklist: niet gevonden
    [],                                                     // mail.mail: nog niets klaargezet
    [{ id: 11490, user_id: [7, 'Thomas'] }],                // crm.lead.user_id
    [{ id: 7, name: 'Thomas Peeters', email: 'thomas@openvme.be', job_title: 'Coach' }],
    424242                                                  // create → mail-id
  ]);
  const r = await runSendMailStep(ENV, {
    target: stap(), integration: INTEGRATIE, submissionId: 'sub-3',
    form: FORM, lookupForm, contextObject: CTX, now: NU
  });
  assert.equal(r.action, 'mail_scheduled');
  assert.equal(r.recordId, 424242);
  assert.equal(r.skipped, null);

  const create = calls[calls.length - 1];
  assert.equal(create.model, 'mail.mail');
  assert.equal(create.method, 'create');
  const v = create.args[0];
  assert.equal(v.email_to, 'Jadranka@Example.ORG');
  assert.equal(v.email_from, '"Thomas Peeters" <thomas@openvme.be>');
  assert.equal(v.reply_to, 'thomas@openvme.be');
  assert.equal(v.message_id, '<kopint9-ttgt1-subsub3@om.mymmo.com>');
  assert.equal(v.auto_delete, false, 'het mail-record IS het bewijs; het mag zichzelf niet opruimen');
  assert.equal(v.state, 'outgoing');
  assert.equal(v.scheduled_date, '2026-09-08 15:30:00');
  assert.equal(v.mail_server_id, 5, 'zonder dit vertrekt de mail over de broadcast-stream');
  assert.equal(v.model, 'crm.lead');
  assert.equal(v.res_id, 11490);
  assert.ok(v.headers.includes('X-PM-Metadata-om-sub'), v.headers);
  assert.ok(!v.headers.includes('om-mail'), 'het samengestelde metadataveld hoort weg te zijn');
  assert.equal(v.subject, 'Bedankt Jadranka');
});

await test('de body is platte tekst: geen tabel, geen achtergrond, geen afbeelding', async () => {
  const calls = stubFetch([[], [], [{ id: 11490, user_id: false }], 1]);
  await runSendMailStep(ENV, {
    target: stap(), integration: INTEGRATIE, submissionId: 'sub-4',
    form: FORM, lookupForm, contextObject: CTX, now: NU
  });
  const v = calls[calls.length - 1].args[0];
  assert.ok(!/<table|background|max-width|<img/i.test(v.body_html), v.body_html);
  assert.ok(v.body_html.includes('Hoi Jadranka,'), v.body_html);
  assert.ok(!v.body_html.includes('{{'), 'placeholders horen ingevuld te zijn');
});

await test('blacklist: overslaan MET reden, en er wordt niets aangemaakt', async () => {
  const calls = stubFetch([[{ id: 3 }]]);
  const r = await runSendMailStep(ENV, {
    target: stap(), integration: INTEGRATIE, submissionId: 'sub-5',
    form: FORM, lookupForm, contextObject: CTX, now: NU
  });
  assert.equal(r.skipped, 'blacklisted');
  assert.ok(r.detail.includes('blacklist'));
  assert.ok(!calls.some((c) => c.method === 'create'), 'er mag niets aangemaakt zijn');
});

await test('al klaargezet: overslaan op de message_id, niet op een vlag', async () => {
  const calls = stubFetch([[], [{ id: 999, state: 'outgoing' }]]);
  const r = await runSendMailStep(ENV, {
    target: stap(), integration: INTEGRATIE, submissionId: 'sub-3',
    form: FORM, lookupForm, contextObject: CTX, now: NU
  });
  assert.equal(r.skipped, 'mail_already_queued');
  assert.equal(r.recordId, 999);
  assert.ok(!calls.some((c) => c.method === 'create'));
});

await test('geen adres: overslaan met reden in plaats van gooien', async () => {
  stubFetch([[]]);
  const r = await runSendMailStep(ENV, {
    target: stap(), integration: INTEGRATIE, submissionId: 'sub-6',
    form: {}, lookupForm, contextObject: { 'step.1.record_id': 11490 }, now: NU
  });
  assert.equal(r.skipped, 'no_recipient');
});

await test('opmaak in een platte mail wordt geweigerd, niet stil weggehaald', async () => {
  stubFetch([[], [], [{ id: 11490, user_id: false }]]);
  await assert.rejects(
    () => runSendMailStep(ENV, {
      target: stap({ mail_body_html: 'Hoi<table><tr><td>x</td></tr></table>' }),
      integration: INTEGRATIE, submissionId: 'sub-7',
      form: FORM, lookupForm, contextObject: CTX, now: NU
    }),
    (e) => e instanceof MailStepError && /table/.test(e.message)
  );
});

await test('een leeg onderwerp is een fout, geen mail zonder onderwerp', async () => {
  stubFetch([[], [], [{ id: 11490, user_id: false }]]);
  await assert.rejects(
    () => runSendMailStep(ENV, {
      target: stap({ mail_subject_template: '   ' }),
      integration: INTEGRATIE, submissionId: 'sub-8',
      form: FORM, lookupForm, contextObject: CTX, now: NU
    }),
    (e) => e instanceof MailStepError && /onderwerp/.test(e.message)
  );
});

await test('0 minuten vertraging: geen scheduled_date, en de actie heet anders', async () => {
  const calls = stubFetch([[], [], [{ id: 11490, user_id: false }], 7]);
  const r = await runSendMailStep(ENV, {
    target: stap({ mail_delay_minutes: 0 }), integration: INTEGRATIE, submissionId: 'sub-9',
    form: FORM, lookupForm, contextObject: CTX, now: NU
  });
  assert.equal(r.action, 'mail_queued');
  assert.equal(calls[calls.length - 1].args[0].scheduled_date, undefined);
});

console.log('\n' + passed + ' test(en) geslaagd');
