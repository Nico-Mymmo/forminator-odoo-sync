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
  safeUrl,
  leesbareTekstkleur,
  knopStijl
} from '../lib/mail-render.js';
import { buildMessageId, computeScheduledDate, reminderTooLate, ownsMail, resolvePublicOrigin, renderMailForRegistration } from '../lib/mail-service.js';

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
  // De regels komen uit normalizeMailBlocks: een blok zonder `rows` krijgt de
  // standaardset. Een blok rechtstreeks aan de renderer geven zonder rows
  // levert dus terecht niets op.
  const doc = normalizeMailBlocks({ confirmation: { subject: 'S', blocks: [{ id: 'd', type: 'event_details' }] } });
  const html = renderMailHtml({ blocks: doc.confirmation.blocks, context });

  assert.ok(html.includes('Datum'));
  assert.ok(html.includes('Tijd'));
  assert.ok(html.includes('Deelnamelink'));
  // Dit event heeft geen locatie: die regel hoort niet in de mail te staan.
  assert.ok(!html.includes('Locatie'));
});

test('de datumregel gebruikt niet langer het dode veld x_studio_date', () => {
  // In template 50/55 stond `x_studio_date or ''` naast starting_day. Dat veld
  // is false op elk record (FORBIDDEN_FIELDS), dus die helft was altijd leeg.
  const doc = normalizeMailBlocks({ confirmation: { subject: 'S', blocks: [{ id: 'd', type: 'event_details' }] } });
  const html = renderMailHtml({ blocks: doc.confirmation.blocks, context });
  assert.ok(html.includes('dinsdag, 8 september'));
  assert.ok(html.includes('19:00'));
});

test('eigen regels in het praktisch kader werken, met placeholders', () => {
  const doc = normalizeMailBlocks({
    confirmation: {
      subject: 'S',
      blocks: [{
        id: 'd', type: 'event_details',
        rows: [
          { id: 'r1', icon: '🅿️', label: 'Parking', value: 'Gratis onder het gebouw' },
          { id: 'r2', icon: '👤', label: 'Spreker', value: '{{host.name}}' },
          { id: 'r3', icon: '📍', label: 'Locatie', value: '{{event.location}}' }
        ]
      }]
    }
  });
  const html = renderMailHtml({ blocks: doc.confirmation.blocks, context });

  assert.ok(html.includes('Parking'));
  assert.ok(html.includes('Gratis onder het gebouw'));
  assert.ok(html.includes('Rob Claes') || html.includes(context.host.name));
  // Lege waarde (dit event heeft geen locatie) valt weg bij het versturen.
  assert.ok(!html.includes('Locatie'));
});

test('in de editor blijft een lege regel WEL staan, anders kan je hem niet invullen', () => {
  const doc = normalizeMailBlocks({
    confirmation: {
      subject: 'S',
      blocks: [{ id: 'd', type: 'event_details', rows: [{ id: 'r', icon: '📍', label: 'Locatie', value: '' }] }]
    }
  });
  const html = renderMailHtml({ blocks: doc.confirmation.blocks, context, editable: true });
  assert.ok(html.includes('Locatie'));
  assert.ok(html.includes('data-om-edit="rows.0.value"'));
});

test('een oud details-blok met `show` migreert naar echte regels', () => {
  const doc = normalizeMailBlocks({
    reminder: { subject: 'S', blocks: [{ id: 'd', type: 'event_details', show: ['day', 'time', 'host'] }] }
  });
  const rows = doc.reminder.blocks[0].rows;
  assert.deepEqual(rows.map((r) => r.label), ['Datum', 'Tijd', 'Spreker']);
  assert.equal('show' in doc.reminder.blocks[0], false);
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

console.log('\nlege blokken: zichtbaar in de editor, weg bij het versturen');

test('een opnameblok zonder video blijft in de editor staan en is selecteerbaar', () => {
  const blocks = [{ id: 'v', type: 'video', label: 'Bekijk de opname' }];

  // Dit was de bug: bij het toevoegen gebeurde er ogenschijnlijk niets, en
  // het blok was ook niet meer te selecteren of weg te halen, want er stond
  // geen enkele marker in de HTML.
  const editor = renderMailHtml({ blocks, context, editable: true });
  assert.ok(editor.includes('data-om-block="v"'), 'geen marker: het blok is onaanklikbaar');
  assert.ok(editor.includes('Nog geen opname'), 'geen uitleg waarom het leeg is');
  assert.ok(!editor.includes('undefined'), 'er staat "undefined" in de opmaak');

  // Bij het versturen valt het weg: geen gebroken afbeelding in de mailbox.
  const sent = renderMailHtml({ blocks, context });
  assert.ok(!sent.includes('data-om-block'), 'markers lekken naar de verzonden mail');
  assert.ok(!sent.includes('Nog geen opname'), 'de editortekst staat in de verzonden mail');
  assert.equal(sent.includes('<img'), false);
});

test('mét een opname op het event rendert het blok gewoon', () => {
  const metVideo = buildPlaceholderContext({
    event: { ...EVENT, recap: { video_url: 'https://vimeo.com/999', thumbnail_url: 'https://i.vimeocdn.com/x.jpg' } },
    registration: REGISTRATION
  });
  const html = renderMailHtml({ blocks: [{ id: 'v', type: 'video' }], context: metVideo });
  assert.ok(html.includes('vimeo.com/999'));
  assert.ok(!html.includes('Nog geen opname'));
});

test('hetzelfde geldt voor een lege afbeelding, knop, titel en tekst', () => {
  const leeg = [
    { id: 'i', type: 'image' },
    { id: 'b', type: 'button' },
    { id: 'h', type: 'heading' },
    { id: 't', type: 'text' }
  ];
  const editor = renderMailHtml({ blocks: leeg, context, editable: true });
  ['i', 'b', 'h', 't'].forEach((id) => {
    assert.ok(editor.includes('data-om-block="' + id + '"'), 'blok ' + id + ' is onaanklikbaar');
  });
  assert.ok(!renderMailHtml({ blocks: leeg, context }).includes('data-om-block'));
});

console.log('\nknopstijl en het kaartblok');

test('een knop krijgt de gekozen stijl en breedte', () => {
  const blauw = renderMailHtml({ blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be', variant: 'primary' }], context });
  const donker = renderMailHtml({ blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be', variant: 'dark' }], context });
  assert.ok(blauw.includes('#2563eb'));
  assert.ok(donker.includes('#111827'));

  const vol = renderMailHtml({ blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be', width: 'full' }], context });
  assert.ok(vol.includes('width="100%"'));
});

test('de link staat in de EDITOR onder de knop, niet in de verzonden mail', () => {
  const blok = [{ id: 'b', type: 'button', label: 'Ga', href: 'https://voorbeeld.be/route' }];
  assert.ok(renderMailHtml({ blocks: blok, context, editable: true }).includes('→ https://voorbeeld.be/route'));
  assert.ok(!renderMailHtml({ blocks: blok, context }).includes('→ https://voorbeeld.be/route'));
});

test('het kaartblok geeft een routelink naar Google Maps', () => {
  const metLocatie = buildPlaceholderContext({
    event: { ...EVENT, location: { name: 'Vlaanderenstraat 1, Gent' } },
    registration: REGISTRATION
  });
  const html = renderMailHtml({ blocks: [{ id: 'm', type: 'map' }], context: metLocatie });

  assert.ok(html.includes('Vlaanderenstraat 1, Gent'));
  // De vorm die Google zelf voorschrijft voor alle platformen: opent de app
  // op mobiel, de browser op desktop.
  assert.ok(html.includes('google.com/maps/search/?api=1&amp;query='));
  assert.ok(html.includes('Vlaanderenstraat%201%2C%20Gent'));
});

test('zonder locatie valt het kaartblok weg bij het versturen', () => {
  // EVENT heeft geen locatie (online event).
  const html = renderMailHtml({ blocks: [{ id: 'm', type: 'map' }], context });
  assert.equal(html.includes('google.com/maps'), false);
  // In de editor blijft het wél staan, met de reden erbij.
  assert.ok(renderMailHtml({ blocks: [{ id: 'm', type: 'map' }], context, editable: true }).includes('geen locatie'));
});

test('een statische kaartafbeelding is optioneel en linkt naar de route', () => {
  const metLocatie = buildPlaceholderContext({
    event: { ...EVENT, location: { name: 'Gent' } },
    registration: REGISTRATION
  });
  const html = renderMailHtml({
    blocks: [{ id: 'm', type: 'map', image: 'https://maps.example/static.png' }],
    context: metLocatie
  });
  assert.ok(html.includes('maps.example/static.png'));
});

test('een knop kan de kleur van de eventcategorie aannemen', () => {
  const ctx = buildPlaceholderContext({ event: EVENT, registration: REGISTRATION, typeColor: '#0D9488' });
  const vol = renderMailHtml({ blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be', variant: 'brand' }], context: ctx });
  assert.ok(vol.includes('#0D9488'));

  const omlijnd = renderMailHtml({ blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be', variant: 'brand_outline' }], context: ctx });
  assert.ok(omlijnd.includes('background:#ffffff'));
  assert.ok(omlijnd.includes('color:#0D9488'));
});

test('de tekst op een merkknop blijft leesbaar, ook op een lichte kleur', () => {
  // De categoriekleuren staan in Odoo en zijn dus door een gebruiker in te
  // stellen. Witte tekst hardcoderen zou op geel onleesbaar zijn.
  assert.equal(leesbareTekstkleur('#0D9488'), '#ffffff');
  assert.equal(leesbareTekstkleur('#B45309'), '#ffffff');
  assert.equal(leesbareTekstkleur('#FDE047'), '#111827');
  assert.equal(leesbareTekstkleur('#ffffff'), '#111827');
  // Onzin valt terug op wit, niet op een lege kleur.
  assert.equal(leesbareTekstkleur('rood'), '#ffffff');
});

test('zonder categoriekleur valt een merkknop terug op blauw', () => {
  const html = renderMailHtml({
    blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be', variant: 'brand' }],
    context
  });
  assert.ok(html.includes('#2563eb'));
});

test('het opschrift van een knop is bewerkbaar — in een span, niet op de <a>', () => {
  // `contenteditable` op een anchor geeft in Chrome geen cursor, waardoor de
  // copy van een knop niet aan te passen was.
  const html = renderMailHtml({
    blocks: [{ id: 'b', type: 'button', label: 'Ga', href: 'https://x.be' }],
    context,
    editable: true
  });
  assert.ok(html.includes('<span data-om-edit="label">'), 'het opschrift zit niet in een bewerkbare span');
  assert.ok(!/<a[^>]*data-om-edit/.test(html), 'data-om-edit staat nog op de <a>');
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

test('de voorsprong van de reminder is instelbaar', () => {
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-01T10:00:00Z'), { leadHours: 72 });
  // Start 2026-09-08 17:00 UTC, 72 uur eerder = 2026-09-05 17:00.
  assert.equal(t.scheduledDate, '2026-09-05 17:00:00');
});

test('de reminder kan helemaal uitgezet worden', () => {
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-01T10:00:00Z'), { enabled: false });
  assert.equal(t.send, false);
  assert.match(t.reason, /staat uit/);
});

test('de ondergrens kijkt naar het INSCHRIJFMOMENT, niet naar nu', () => {
  const regels = { leadHours: 24, minLeadHours: 4 };

  // Ingeschreven 2 uur voor de start: die heeft niets aan een herinnering.
  assert.match(
    reminderTooLate(EVENT, regels, new Date('2026-09-08T15:00:00Z')),
    /binnen 4 uur/
  );

  // Ingeschreven 6 uur voor de start: nog net wel.
  assert.equal(reminderTooLate(EVENT, regels, new Date('2026-09-08T11:00:00Z')), null);

  // EN DIT IS DE BUG DIE ERIN ZAT: iemand die zich een week eerder
  // inschreef, hoort zijn reminder te krijgen -- ook als je de mails pas
  // vlak voor het event klaarzet. Werd de grens tegen "nu" gemeten, dan
  // kreeg zo iemand stil niets.
  assert.equal(reminderTooLate(EVENT, regels, new Date('2026-09-01T09:00:00Z')), null);
});

test('computeScheduledDate past de ondergrens NIET meer toe', () => {
  // Anders zou een handmatige inhaalronde vlak voor het event iedereen
  // overslaan; dat is precies wat er bij event 76 gebeurde.
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-08T15:00:00Z'), { leadHours: 24, minLeadHours: 48 });
  assert.equal(t.send, true);
});

test('zonder inschrijfmoment wordt niemand overgeslagen', () => {
  // Falen naar "wel sturen": iemand overslaan op grond van een ontbrekend
  // veld betekent dat een echte deelnemer stil geen herinnering krijgt.
  assert.equal(reminderTooLate(EVENT, { minLeadHours: 48 }, null), null);
  assert.equal(reminderTooLate(EVENT, { minLeadHours: 48 }, 'geen datum'), null);
});

test('zonder ondergrens krijgt ook een heel late inschrijver zijn reminder', () => {
  // Dit is bewust de standaard: het gat van de oude Odoo-cron.
  const t = computeScheduledDate(MAIL_KIND.REMINDER, EVENT, new Date('2026-09-08T16:30:00Z'));
  assert.equal(t.send, true);
});

test('de timing hoort bij de sectie en overleeft normaliseren', () => {
  const doc = normalizeMailBlocks({
    reminder: { subject: 'S', blocks: [{ id: 't', type: 'text', html: 'x' }], timing: { leadHours: 48, minLeadHours: 3 } }
  });
  const sectie = resolveSection(doc, null, MAIL_KIND.REMINDER, null);
  assert.equal(sectie.timing.leadHours, 48);
  assert.equal(sectie.timing.minLeadHours, 3);
  assert.equal(sectie.timing.enabled, true);
});

test('onzinnige waarden worden begrensd in plaats van doorgelaten', () => {
  const doc = normalizeMailBlocks({ reminder: { timing: { leadHours: -5, minLeadHours: 99999 } } });
  assert.equal(doc.reminder.timing.leadHours, 0);
  assert.equal(doc.reminder.timing.minLeadHours, 24 * 30);
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

console.log('\nhet aankondigingsblok');

test('een onbekende manier van kiezen valt terug op "eerstvolgende"', () => {
  const doc = normalizeMailBlocks({
    recap: { blocks: [{ id: 'a', type: 'announcement', pick: 'wat-dan-ook' }] }
  });
  assert.equal(doc.recap.blocks[0].pick, 'next');
});

test('id\'s worden getallen, en leeg wordt null in plaats van 0', () => {
  const doc = normalizeMailBlocks({
    recap: {
      blocks: [
        { id: 'a', type: 'announcement', pick: 'next_of_type', eventTypeId: '4' },
        { id: 'b', type: 'announcement', pick: 'fixed', eventId: '' },
        { id: 'c', type: 'announcement', pick: 'fixed', eventId: 0 }
      ]
    }
  });
  assert.equal(doc.recap.blocks[0].eventTypeId, 4);
  // 0 of leeg mag NOOIT als id doorgaan: Odoo zou dan naar id 0 zoeken en
  // stil niets vinden, of erger, iets vinden.
  assert.equal(doc.recap.blocks[1].eventId, null);
  assert.equal(doc.recap.blocks[2].eventId, null);
});

const AANKONDIGING = {
  id: 78,
  title: 'Infosessie: nieuwe wetgeving',
  day: 'dinsdag, 22 september',
  time: '19:00',
  location: '',
  link: 'https://meet.google.com/xyz',
  type: 'Infosessie',
  summary: 'Wat verandert er precies?',
  url: 'https://syndicoach.be/events/infosessie/?owid=78'
};

test('de aankondiging toont titel, moment en een knop naar dat event', () => {
  const context = buildPlaceholderContext({
    event: EVENT,
    registration: REGISTRATION,
    announcements: { a: AANKONDIGING }
  });
  const html = renderMailHtml({
    blocks: [{ id: 'a', type: 'announcement', title: 'Ook interessant', label: 'Schrijf je in', variant: 'primary' }],
    context
  });

  assert.match(html, /Infosessie: nieuwe wetgeving/);
  assert.match(html, /dinsdag, 22 september/);
  assert.match(html, /19:00/);
  assert.match(html, /Wat verandert er precies\?/);
  assert.match(html, /href="https:\/\/syndicoach\.be\/events\/infosessie\/\?owid=78"/);
  assert.match(html, /Schrijf je in/);
  // Online event zonder locatie: dan hoort er "Online" te staan en geen lege plek.
  assert.match(html, /Online/);
});

test('de omschrijving valt weg als de gebruiker dat kiest', () => {
  const context = buildPlaceholderContext({ event: EVENT, announcements: { a: AANKONDIGING } });
  const html = renderMailHtml({
    blocks: [{ id: 'a', type: 'announcement', showSummary: false }],
    context
  });
  assert.ok(!html.includes('Wat verandert er precies'), 'de omschrijving staat er nog');
  assert.match(html, /Infosessie: nieuwe wetgeving/);
});

test('zonder gevonden event valt het blok WEG bij het versturen', () => {
  const context = buildPlaceholderContext({ event: EVENT, announcements: {} });
  const html = renderMailHtml({
    blocks: [{ id: 'a', type: 'announcement', title: 'Ook interessant' }],
    context
  });
  // Geen lege kaart, geen kopje, niets. Een aankondiging zonder event is
  // geen aankondiging.
  assert.ok(!html.includes('Ook interessant'), 'er staat een lege aankondiging in de mail');
});

test('zonder gevonden event blijft het blok in de EDITOR wel staan, met de reden', () => {
  const context = buildPlaceholderContext({ event: EVENT, announcements: {} });
  const html = renderMailHtml({
    blocks: [{ id: 'a', type: 'announcement', pick: 'next_of_type', eventTypeId: null }],
    context,
    editable: true
  });
  // Anders voeg je een aankondiging toe, gebeurt er ogenschijnlijk niets, en
  // kan je het blok ook niet meer selecteren of weghalen.
  assert.match(html, /data-om-block="a"/);
  assert.match(html, /Kies eerst een event-type/);
});

test('renderMailForRegistration geeft de aankondigingen door aan de renderer', () => {
  const doc = normalizeMailBlocks({
    recap: { subject: 'Bedankt', blocks: [{ id: 'a', type: 'announcement' }] }
  });
  const uit = renderMailForRegistration({
    event: EVENT,
    registration: REGISTRATION,
    kind: MAIL_KIND.RECAP,
    typeDoc: doc,
    eventDoc: null,
    announcements: { a: AANKONDIGING }
  });
  // Zonder deze doorgave rendert de mail een lege aankondiging -- precies de
  // fout die eerder bij `editable` gemaakt is.
  assert.match(uit.html, /Infosessie: nieuwe wetgeving/);
});

console.log('\nde kleur van een knop');

const CTX_KLEUR = () => buildPlaceholderContext({
  event: { ...EVENT, event_type: { id: 2, name: 'Q&A' } },
  registration: REGISTRATION,
  typeColor: '#7c3aed'
});

test('een vrije kleur wint, met een leesbare tekstkleur erbij', () => {
  // Lichte kleur -> donkere tekst. De gebruiker kiest de tekstkleur NIET:
  // een vrije kiezer zonder deze berekening geeft witte tekst op geel.
  const licht = knopStijl({ color: '#fde047' }, CTX_KLEUR());
  assert.equal(licht.bg, '#fde047');
  assert.equal(licht.kleur, '#111827');

  const donker = knopStijl({ color: '#111827' }, CTX_KLEUR());
  assert.equal(donker.kleur, '#ffffff');
});

test('"category" verwijst naar de kleur van de eventcategorie', () => {
  // Een VERWIJZING, geen bevroren hex: wijzigt de categorie van kleur, dan
  // schuift de knop mee.
  const stijl = knopStijl({ color: 'category' }, CTX_KLEUR());
  assert.equal(stijl.bg, '#7c3aed');
});

test('omlijnd maakt van elke kleur de omlijnde versie', () => {
  const stijl = knopStijl({ color: '#7c3aed', outline: true }, CTX_KLEUR());
  assert.equal(stijl.bg, '#ffffff');
  assert.equal(stijl.kleur, '#7c3aed');
  assert.equal(stijl.rand, '#7c3aed');
});

test('de oude varianten blijven werken', () => {
  // Er staan mails in Odoo met variant: "subtle". Die mogen niet ineens
  // blauw worden omdat de kiezer veranderd is.
  assert.equal(knopStijl({ variant: 'subtle' }, CTX_KLEUR()).bg, '#f1f5f9');
  assert.equal(knopStijl({ variant: 'dark' }, CTX_KLEUR()).bg, '#111827');
  assert.equal(knopStijl({ variant: 'brand' }, CTX_KLEUR()).bg, '#7c3aed');
  assert.equal(knopStijl({ variant: 'brand_outline' }, CTX_KLEUR()).bg, '#ffffff');
});

test('een onbruikbare kleur wordt niet bewaard', () => {
  const doc = normalizeMailBlocks({
    confirmation: {
      blocks: [
        { id: 'a', type: 'button', label: 'x', href: 'https://a.be', color: 'rood' },
        { id: 'b', type: 'button', label: 'x', href: 'https://a.be', color: '#ABCDEF', outline: true },
        { id: 'c', type: 'button', label: 'x', href: 'https://a.be', outline: 'ja' }
      ]
    }
  });
  // Geen `color: undefined` in de mail: dan zou er color:undefined in de
  // HTML belanden. Weggooien betekent terugvallen op de variant of blauw.
  assert.equal('color' in doc.confirmation.blocks[0], false);
  // Hoofdletters uit een kleurkiezer worden genormaliseerd.
  assert.equal(doc.confirmation.blocks[1].color, '#abcdef');
  assert.equal(doc.confirmation.blocks[1].outline, true);
  // Alleen een echte true is omlijnd; 'ja' is geen boolean.
  assert.equal(doc.confirmation.blocks[2].outline, false);
});

test('de gekozen kleur staat ook echt in de HTML van de knop', () => {
  const html = renderMailHtml({
    blocks: [{ id: 'b', type: 'button', label: 'Doe mee', href: 'https://a.be', color: '#7c3aed' }],
    context: CTX_KLEUR()
  });
  assert.match(html, /background:#7c3aed/);
});

console.log(`\n${passed} test(en) geslaagd${process.exitCode ? ' — MET FOUTEN' : ''}\n`);
