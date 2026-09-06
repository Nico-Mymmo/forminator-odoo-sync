/**
 * Event Operations v2 — Mailstudio-tests
 *
 * Draait zonder Odoo-verbinding en zonder netwerk: alles wat hier getest
 * wordt is puur (blokken inlezen, samenstellen, renderen, timing bepalen).
 *
 *   node src/modules/event-operations-v2/tests/mail-test.mjs
 */

import assert from 'node:assert/strict';
import {
  MAIL_KIND,
  parseMailBlocks,
  normalizeMailBlocks,
  resolveSection,
  splitIntoVariants,
  mergeVariants,
  emptyMailBlocks
} from '../lib/mail-blocks.js';
import {
  renderMailHtml,
  renderSubject,
  buildPlaceholderContext,
  fillPlaceholders,
  formatEventMoment,
  safeUrl
} from '../lib/mail-render.js';
import { buildMessageId, computeScheduledDate, ownsMail, resolvePublicOrigin, renderMailForRegistration } from '../lib/mail-service.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error?.message}`);
    process.exitCode = 1;
  }
}

const EVENT = {
  id: 76,
  title: 'Q&A Syndicoach: vragen over mede-eigendom',
  slug: 'qa-syndicoach',
  summary: 'Stel je vragen',
  // 2026-09-08 17:00 UTC = 19:00 in Europe/Brussels
  starts_at: '2026-09-08T17:00:00.000Z',
  location: { name: null },
  online_url: 'https://meet.google.com/abc-defg-hij',
  event_type: { id: 2, name: 'Q&A' },
  host: { id: 7, name: 'Nico Plinke' }
};

const REGISTRATION = {
  id: 1079,
  name: 'Jan Peeters',
  submitted_email: 'jan@example.com',
  site: 'syndicoach',
  state: 'registered'
};

console.log('\nmail-blocks');

test('leeg veld uit Odoo (false) is geen fout', () => {
  assert.equal(parseMailBlocks(false), null);
  assert.equal(parseMailBlocks(''), null);
  assert.equal(parseMailBlocks(null), null);
});

test('ongeldige JSON gooit, valt niet stil terug op leeg', () => {
  assert.throws(() => parseMailBlocks('{niet: json}'), /ongeldige JSON/);
});

test('onbekend bloktype gooit met de toegestane types erbij', () => {
  assert.throws(
    () => parseMailBlocks(JSON.stringify({ confirmation: { blocks: [{ type: 'carousel' }] } })),
    /onbekend bloktype "carousel"/
  );
});

test('normalize vult alle drie de soorten aan', () => {
  const doc = normalizeMailBlocks({ confirmation: { subject: 'Hoi' } });
  for (const kind of Object.values(MAIL_KIND)) {
    assert.ok(Array.isArray(doc[kind].blocks), `${kind} mist blocks`);
  }
  assert.equal(doc.confirmation.subject, 'Hoi');
});

test('elk blok krijgt een id, ook zonder id in de bron', () => {
  const doc = parseMailBlocks(JSON.stringify({ reminder: { blocks: [{ type: 'divider' }] } }));
  assert.equal(doc.reminder.blocks[0].id, 'divider-0');
});

test('override op het event wint volledig van het event-type', () => {
  const typeDoc = normalizeMailBlocks({ confirmation: { subject: 'Type', blocks: [{ type: 'divider' }] } });
  const eventDoc = normalizeMailBlocks({ confirmation: { subject: 'Event', blocks: [{ type: 'spacer' }] } });

  assert.equal(resolveSection(typeDoc, eventDoc, MAIL_KIND.CONFIRMATION).source, 'event');
  assert.equal(resolveSection(typeDoc, eventDoc, MAIL_KIND.CONFIRMATION).subject, 'Event');
  // Een LEGE override valt terug op het type -- anders zou een per ongeluk
  // leeggemaakt event geruisloos zonder mail zitten.
  assert.equal(resolveSection(typeDoc, emptyMailBlocks(), MAIL_KIND.CONFIRMATION).source, 'event_type');
  assert.equal(resolveSection(null, null, MAIL_KIND.RECAP).source, 'none');
});

console.log('\nheader per bedrijf, inhoud voor iedereen');

test('de header volgt de site, met de terugval als die site er geen heeft', () => {
  const doc = normalizeMailBlocks({
    confirmation: {
      header: {
        openvme: { src: 'https://x/ov.png' },
        fallback: { src: 'https://x/df.png' }
      },
      subject: 'S',
      blocks: [{ id: 't', type: 'text', html: 'x' }]
    }
  });

  assert.equal(resolveSection(doc, null, MAIL_KIND.CONFIRMATION, 'openvme').header.src, 'https://x/ov.png');
  // syndicoach heeft geen eigen header: terugval.
  assert.equal(resolveSection(doc, null, MAIL_KIND.CONFIRMATION, 'syndicoach').header.src, 'https://x/df.png');
  assert.equal(resolveSection(doc, null, MAIL_KIND.CONFIRMATION, null).header.src, 'https://x/df.png');
});

test('de inhoud is dezelfde voor elke site zolang er niet gesplitst is', () => {
  const doc = normalizeMailBlocks({
    confirmation: { subject: 'S', blocks: [{ id: 'a', type: 'text', html: 'zelfde' }] }
  });
  const voor = (site) => resolveSection(doc, null, MAIL_KIND.CONFIRMATION, site);
  assert.deepEqual(voor('openvme').blocks, voor('syndicoach').blocks);
  assert.equal(voor('openvme').variant, null);
});

test('splitsen geeft twee kopieën; de standaard geldt voor onbekende sites', () => {
  const doc = normalizeMailBlocks({
    confirmation: { subject: 'S', blocks: [{ id: 'a', type: 'text', html: 'basis' }] }
  });
  doc.confirmation = splitIntoVariants(doc.confirmation, 'syndicoach');
  doc.confirmation.variants.openvme.blocks[0].html = 'alleen openvme';

  const genormaliseerd = normalizeMailBlocks(doc, 'gesplitst');
  const voor = (site) => resolveSection(genormaliseerd, null, MAIL_KIND.CONFIRMATION, site);

  assert.equal(voor('openvme').blocks[0].html, 'alleen openvme');
  assert.equal(voor('syndicoach').blocks[0].html, 'basis');
  // Onbekende site krijgt de standaard, niet niets.
  assert.equal(voor(null).variant, 'syndicoach');
  assert.equal(voor(null).blocks[0].html, 'basis');
});

test('samenvoegen houdt de standaard over', () => {
  let sectie = splitIntoVariants({ subject: 'S', blocks: [{ id: 'a', type: 'text', html: 'basis' }] }, 'syndicoach');
  sectie.variants.syndicoach.blocks[0].html = 'behouden';
  sectie = mergeVariants(sectie);
  assert.equal(sectie.variants, null);
  assert.equal(sectie.blocks[0].html, 'behouden');
});

test('een oud document (v1) migreert: hero wordt header, sites verdwijnen', () => {
  // Zo staat het vandaag mogelijk al in Odoo. Dit mag niet stukgaan.
  const v1 = {
    confirmation: {
      subject: 'S',
      blocks: [
        { id: 'h1', type: 'hero', sites: ['openvme'], src: 'https://x/ov.png', alt: 'OpenVME' },
        { id: 'h2', type: 'hero', sites: ['syndicoach'], src: 'https://x/sc.png' },
        { id: 'h3', type: 'hero', sites: ['other'], src: 'https://x/df.png' },
        { id: 't', type: 'text', sites: ['openvme'], html: 'tekst' }
      ]
    }
  };
  const doc = normalizeMailBlocks(v1, 'v1');
  assert.equal(doc.confirmation.header.openvme.src, 'https://x/ov.png');
  assert.equal(doc.confirmation.header.syndicoach.src, 'https://x/sc.png');
  assert.equal(doc.confirmation.header.fallback.src, 'https://x/df.png');
  // De hero's zitten niet meer in de blokkenlijst, en niets heeft nog `sites`.
  assert.deepEqual(doc.confirmation.blocks.map((b) => b.type), ['text']);
  assert.equal('sites' in doc.confirmation.blocks[0], false);
});

console.log('\nplaceholders');

const context = buildPlaceholderContext({
  event: EVENT,
  registration: REGISTRATION,
  host: { email: 'rob@mymmo.com', jobTitle: 'Customer Experience Hero', avatarUrl: 'https://mymmo.odoo.com/web/image/13413' },
  publicUrl: 'https://syndicoach.be/event/qa-syndicoach/?owid=76',
  now: new Date('2026-09-05T10:00:00Z')
});

test('dag en uur komen uit starts_at in Europe/Brussels, niet uit Odoo', () => {
  // 17:00 UTC op 8 september is 19:00 Brussels (zomertijd, UTC+2).
  assert.equal(context.event.time, '19:00');
  assert.match(context.event.day, /dinsdag/);
  assert.match(context.event.day, /8 september/);
});

test('tijdzonegrens: 23:30 Brussels valt op de volgende UTC-dag', () => {
  // 2026-09-08 21:30 UTC = 2026-09-08 23:30 Brussels. De Odoo-cron zou hier
  // "dinsdag, 8 september" schrijven vanuit UTC en dat klopt toevallig; een
  // uur later niet meer. Controleer de omslag zelf.
  assert.equal(formatEventMoment('2026-09-08T22:30:00.000Z').time, '00:30');
  assert.match(formatEventMoment('2026-09-08T22:30:00.000Z').day, /woensdag/);
});

test('voornaam wordt afgeleid, e-mail komt uit de registratie', () => {
  assert.equal(context.registration.first_name, 'Jan');
  assert.equal(context.registration.email, 'jan@example.com');
});

test('locatie is het object-veld name, niet het object zelf', () => {
  assert.equal(context.event.location, '');
  assert.equal(
    buildPlaceholderContext({ event: { ...EVENT, location: { name: 'Gent' } } }).event.location,
    'Gent'
  );
});

test('onbekende placeholder wordt leeg, niet zijn eigen naam', () => {
  assert.equal(fillPlaceholders('a{{event.bestaatniet}}b', context), 'ab');
});

test('geen logica in placeholders: accolades met code blijven staan', () => {
  assert.equal(fillPlaceholders('{{ 1 + 1 }}', context), '{{ 1 + 1 }}');
});

console.log('\nrenderen');

test('subject vult placeholders in en bevat geen HTML', () => {
  const subject = renderSubject('Reminder: {{event.title}} om {{event.time}}', context);
  assert.equal(subject, 'Reminder: Q&A Syndicoach: vragen over mede-eigendom om 19:00');
  assert.ok(!subject.includes('<'));
});

test('tekstblok laat redactionele HTML door, header escapet het alt-attribuut', () => {
  const html = renderMailHtml({
    header: { src: 'https://cdn/x.png', alt: 'Logo "OpenVME"' },
    blocks: [{ id: 't', type: 'text', html: '<p>Dag <b>{{registration.first_name}}</b></p>' }],
    context
  });
  assert.ok(html.includes('<p>Dag <b>Jan</b></p>'));
  assert.ok(html.includes('alt="Logo &quot;OpenVME&quot;"'));
});

test('event_details laat lege regels weg', () => {
  const html = renderMailHtml({ blocks: [{ id: 'd', type: 'event_details' }], context });
  assert.ok(html.includes('Datum'));
  assert.ok(html.includes('Tijd'));
  assert.ok(html.includes('Deelnamelink'));
  // Dit event heeft geen locatie: die regel hoort niet in de mail te staan.
  // De oorspronkelijke template had die regel sowieso niet.
  assert.ok(!html.includes('Locatie'));
});

test('de datumregel gebruikt niet langer het dode veld x_studio_date', () => {
  // In template 50/55 stond `x_studio_date or ''` naast starting_day. Dat veld
  // is false op elk record (FORBIDDEN_FIELDS), dus die helft was altijd leeg.
  const html = renderMailHtml({ blocks: [{ id: 'd', type: 'event_details' }], context });
  assert.ok(html.includes('dinsdag, 8 september'));
  assert.ok(html.includes('19:00'));
});

console.log('\nlayout (kaarten, hero, footer)');

test('de header staat buiten de kaart, inhoud erbinnen', () => {
  const html = renderMailHtml({
    header: { src: 'https://cdn/hero.png', alt: 'OpenVME' },
    blocks: [{ id: 't', type: 'text', html: '<p>Hallo</p>' }],
    context
  });
  const headerAt = html.indexOf('cdn/hero.png');
  const cardAt = html.indexOf('border-radius:16px');
  assert.ok(headerAt > -1 && cardAt > -1, 'header of kaart ontbreekt');
  assert.ok(headerAt < cardAt, 'de header hoort boven de eerste kaart te staan');
});

test('card_break maakt een tweede kaart', () => {
  const one = renderMailHtml({ blocks: [{ id: 'a', type: 'text', html: 'a' }], context });
  const two = renderMailHtml({
    blocks: [
      { id: 'a', type: 'text', html: 'a' },
      { id: 'b', type: 'card_break' },
      { id: 'c', type: 'text', html: 'c' }
    ],
    context
  });
  const count = (s) => s.split('border-radius:16px').length - 1;
  assert.equal(count(one), 1);
  assert.equal(count(two), 2);
});

test('een card_break zonder inhoud erna maakt geen lege kaart', () => {
  const html = renderMailHtml({
    blocks: [
      { id: 'a', type: 'text', html: 'a' },
      { id: 'b', type: 'card_break' }
    ],
    context
  });
  assert.equal(html.split('border-radius:16px').length - 1, 1);
});

test('signature vult functie, organisatie en foto in uit de context', () => {
  const html = renderMailHtml({ blocks: [{ id: 's', type: 'signature' }], context });
  assert.ok(html.includes('Nico Plinke') || html.includes(context.host.name));
  assert.ok(html.includes('Customer Experience Hero'));
  assert.ok(html.includes('mymmo.odoo.com/web/image/13413'));
  // De site bepaalt de organisatienaam; de oude template zette hier hard
  // "OpenVME" neer, ook voor een syndicoach-inschrijving.
  assert.ok(html.includes('Syndicoach'));
});

test('signature zonder foto laat geen leeg blok achter', () => {
  const zonderFoto = buildPlaceholderContext({ event: EVENT, registration: REGISTRATION, host: { jobTitle: 'X' } });
  const html = renderMailHtml({ blocks: [{ id: 's', type: 'signature' }], context: zonderFoto });
  assert.ok(!html.includes('border-radius:60px'));
});

test('footer staat buiten de kaarten en kent het huidige jaar', () => {
  const html = renderMailHtml({
    blocks: [
      { id: 'a', type: 'text', html: 'a' },
      { id: 'f', type: 'footer', html: '&copy; {{now.year}} Mymmo BV' }
    ],
    context
  });
  const cardEnd = html.lastIndexOf('border-radius:16px');
  assert.ok(html.indexOf('Mymmo BV') > cardEnd, 'de footer hoort onder de laatste kaart');
  assert.ok(html.includes('2026'));
});

test('javascript:-url in een knop levert geen knop op', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  const html = renderMailHtml({
    blocks: [{ id: 'b', type: 'button', label: 'Klik', href: 'javascript:alert(1)' }],
    context
  });
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('Klik'));
});

test('preheader staat in de mail maar is onzichtbaar', () => {
  const html = renderMailHtml({ blocks: [], context, preheader: 'Tot {{event.day}}' });
  assert.ok(html.includes('display:none'));
  assert.ok(html.includes('Tot dinsdag'));
});

console.log('\neditor-markers lekken niet naar de verzonden mail');

test('editable: true zet data-om-attributen, de standaard niet', () => {
  const blocks = [
    { id: 'h', type: 'hero', src: 'https://cdn/h.png', alt: 'x' },
    { id: 't', type: 'heading', text: 'Titel' },
    { id: 'f', type: 'footer', html: 'voet' }
  ];
  const editor = renderMailHtml({ blocks, context, editable: true });
  assert.ok(editor.includes('data-om-block="t"'));
  assert.ok(editor.includes('data-om-edit="text"'));

  // Dit is de test die telt: queueMails() rendert ZONDER editable, dus wat
  // naar mail.mail gaat mag geen enkel editor-attribuut bevatten.
  const sent = renderMailHtml({ blocks, context });
  assert.ok(!sent.includes('data-om-'), 'de verzonden mail bevat editor-markers');
});

test('het opnameblok leest de video van het event', () => {
  const metVideo = buildPlaceholderContext({
    event: { ...EVENT, recap: { video_url: 'https://vimeo.com/999', thumbnail_url: 'https://i.vimeocdn.com/x.jpg' } },
    registration: REGISTRATION
  });
  const html = renderMailHtml({ blocks: [{ id: 'v', type: 'video' }], context: metVideo });
  assert.ok(html.includes('vimeo.com/999'));
  assert.ok(html.includes('i.vimeocdn.com/x.jpg'));
});

test('zonder opname op het event valt het opnameblok weg', () => {
  const html = renderMailHtml({ blocks: [{ id: 'v', type: 'video' }], context });
  assert.equal(html.includes('<img'), false);
});

test('renderMailForRegistration geeft editable DOOR aan de renderer', () => {
  // Dit is de bug waardoor de studio onbewerkbaar was: de route gaf editable
  // mee, maar deze functie nam het niet aan en de markers kwamen nooit in de
  // HTML. Een test op de renderer alleen ziet dat niet -- die moet hier.
  const typeDoc = normalizeMailBlocks({
    confirmation: { subject: 'Hoi', blocks: [{ id: 'kop', type: 'heading', text: 'Titel' }] }
  });
  const args = {
    event: EVENT,
    registration: REGISTRATION,
    kind: MAIL_KIND.CONFIRMATION,
    typeDoc,
    eventDoc: null,
    host: { email: 'rob@mymmo.com' }
  };

  assert.ok(renderMailForRegistration({ ...args, editable: true }).html.includes('data-om-block="kop"'));
  assert.ok(renderMailForRegistration({ ...args, editable: true }).html.includes('data-om-edit="text"'));
  // En zonder: geen enkel spoor in wat er verstuurd wordt.
  assert.ok(!renderMailForRegistration(args).html.includes('data-om-'));
});

console.log('\nidempotentie en timing');

test('message_id is deterministisch per (event, soort, registratie)', () => {
  assert.equal(buildMessageId(76, MAIL_KIND.REMINDER, 1079), '<evt76-reminder-reg1079@om.mymmo.com>');
  assert.notEqual(
    buildMessageId(76, MAIL_KIND.REMINDER, 1079),
    buildMessageId(76, MAIL_KIND.CONFIRMATION, 1079)
  );
});

test('bevestiging vertrekt meteen', () => {
  const t = computeScheduledDate(MAIL_KIND.CONFIRMATION, EVENT, new Date('2026-09-01T10:00:00Z'));
  assert.equal(t.send, true);
  assert.equal(t.scheduledDate, false);
});

test('reminder wordt 24u voor de start gepland', () => {
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-01T10:00:00Z'));
  assert.equal(t.send, true);
  assert.equal(t.scheduledDate, '2026-09-07 17:00:00');
});

test('late inschrijver krijgt de reminder meteen — dit is de bug van cron 84', () => {
  // Registratie 1080 schreef in op 2026-09-05 08:18 voor een event op
  // 2026-09-08. Onder de dagelijkse Odoo-cron kreeg die geen send_dt en dus
  // nooit een reminder. Hier vertrekt hij gewoon.
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-08T09:00:00Z'));
  assert.equal(t.send, true);
  assert.equal(t.scheduledDate, false);
  assert.match(t.reason, /late inschrijving/);
});

test('geen reminder meer als het event al begonnen is', () => {
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-08T18:00:00Z'));
  assert.equal(t.send, false);
});

console.log('\novernamevlag');

test('zonder EVENTS_V2_MAIL_OWNER stuurt de OM niets', () => {
  assert.equal(ownsMail({}, EVENT), false);
  assert.equal(ownsMail({ EVENTS_V2_MAIL_OWNER: '' }, EVENT), false);
});

test('alleen het genoemde event-type wordt overgenomen', () => {
  assert.equal(ownsMail({ EVENTS_V2_MAIL_OWNER: '2' }, EVENT), true);
  assert.equal(ownsMail({ EVENTS_V2_MAIL_OWNER: '4' }, EVENT), false);
  assert.equal(ownsMail({ EVENTS_V2_MAIL_OWNER: '4, 2 ' }, EVENT), true);
  assert.equal(ownsMail({ EVENTS_V2_MAIL_OWNER: '*' }, EVENT), true);
});

console.log('\nsite-URL in de mail');

const ORIGIN_ENV = {
  EVENTS_PUBLIC_ORIGINS: 'https://openvme.be,https://syndicoach.be',
  EVENTS_SHARED_CANONICAL_ORIGIN: 'https://openvme.be'
};

test('de link volgt de site waarop iemand inschreef', () => {
  assert.equal(resolvePublicOrigin(ORIGIN_ENV, 'syndicoach'), 'https://syndicoach.be');
  assert.equal(resolvePublicOrigin(ORIGIN_ENV, 'openvme'), 'https://openvme.be');
});

test('onbekende site valt terug op de canonieke origin', () => {
  assert.equal(resolvePublicOrigin(ORIGIN_ENV, null), 'https://openvme.be');
  assert.equal(resolvePublicOrigin(ORIGIN_ENV, 'onbekend'), 'https://openvme.be');
});

test('zonder configuratie blijft de link leeg, geen link naar de verkeerde site', () => {
  assert.equal(resolvePublicOrigin({}, 'syndicoach'), '');
});

console.log(`\n${passed} test(en) geslaagd${process.exitCode ? ' — MET FOUTEN' : ''}\n`);
