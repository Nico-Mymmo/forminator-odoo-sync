import { writeFileSync } from 'node:fs';
import { renderMailHtml, renderSubject, buildPlaceholderContext } from './src/modules/event-operations-v2/lib/mail-render.js';
import { normalizeMailBlocks } from './src/modules/event-operations-v2/lib/mail-blocks.js';

const CDN = 'https://link.openvme.be/assets/banners/mailheaders';

const hero = (kind) => ([
  { id: 'hero-openvme', type: 'hero', sites: ['openvme'], src: `${CDN}/hero_mail_openvme.png`, alt: 'OpenVME' },
  { id: 'hero-syndicoach', type: 'hero', sites: ['syndicoach'], src: `${CDN}/hero_mail_syndicoach.png`, alt: 'Syndicoach' },
  { id: 'hero-default', type: 'hero', sites: ['other'], src: `${CDN}/hero_mail_openvme.png`, alt: 'Mymmo' }
]);

const signature = [
  { id: 'card-signature', type: 'card_break', sites: [] },
  { id: 'signature', type: 'signature', sites: [] }
];

const footer = [
  { id: 'footer', type: 'footer', sites: [], html:
    '&copy; {{now.year}} Mymmo BV &middot; {{site.name}} by ' +
    '<a href="https://housedrive.com/" target="_blank" style="color:#9ca3af;text-decoration:none;">Housedrive</a>' +
    ' &middot; Made in Antwerp with &#10084;&#65039;' }
];

const doc = normalizeMailBlocks({
  confirmation: {
    subject: 'Je bent ingeschreven voor de {{event.type}}: {{event.title}}',
    preheader: '{{event.day}} om {{event.time}} — alle details staan in deze mail.',
    blocks: [
      ...hero('confirmation'),
      { id: 'title', type: 'heading', sites: [], level: 2, text: 'Je bent ingeschreven voor de {{event.type}}' },
      { id: 'intro', type: 'text', sites: [], html: '<p style="margin:0 0 16px 0;">Dag {{registration.first_name}}, goed nieuws: je inschrijving is helemaal in orde! &#9989;</p>' },
      { id: 'welkom', type: 'text', sites: [], html: '<p style="margin:0 0 16px 0;">We kijken ernaar uit om je binnenkort te verwelkomen op onze {{event.type}}.<br><strong>{{event.title}}</strong></p>' },
      { id: 'details', type: 'event_details', sites: [], title: 'Details van het evenement:' },
      { id: 'agenda', type: 'text', sites: [], html: '<p style="margin:0 0 16px 0;">Voeg dit gerust al toe aan je agenda. We sturen je nog een herinnering vlak voor de sessie van start gaat. Je krijgt achteraf ook een mail met de opname.</p>' },
      { id: 'outro', type: 'text', sites: [], html: '<p style="margin:0;">Tot binnenkort. &#128075;<br>We kijken ernaar uit!</p>' },
      ...signature, ...footer
    ]
  },
  reminder: {
    subject: '\u{1F514} Morgen om {{event.time}}: {{event.title}}',
    preheader: 'Tot {{event.day}} om {{event.time}}. De deelnamelink staat in deze mail.',
    blocks: [
      ...hero('reminder'),
      { id: 'title', type: 'heading', sites: [], level: 2, text: 'Morgen is het zover' },
      { id: 'intro', type: 'text', sites: [], html: '<p style="margin:0 0 16px 0;">Dag {{registration.first_name}}, kleine herinnering: <strong>{{event.title}}</strong> vindt morgen plaats.</p>' },
      { id: 'details', type: 'event_details', sites: [], title: 'Praktisch:' },
      { id: 'cta', type: 'button', sites: [], label: 'Neem deel', href: '{{event.link}}' },
      { id: 'outro', type: 'text', sites: [], html: '<p style="margin:0;">Tot morgen! &#128075;</p>' },
      ...signature, ...footer
    ]
  },
  recap: {
    subject: 'Fijn dat je erbij was: {{event.title}}',
    preheader: 'De opname en het materiaal van {{event.title}}.',
    blocks: [
      ...hero('recap'),
      { id: 'title', type: 'heading', sites: [], level: 2, text: 'Bedankt voor je deelname' },
      { id: 'intro', type: 'text', sites: [], html: '<p style="margin:0 0 16px 0;">Dag {{registration.first_name}}, fijn dat je erbij was op <strong>{{event.title}}</strong>. Hieronder vind je de opname.</p>' },
      { id: 'video', type: 'video', sites: [], href: '', thumbnail: '', alt: 'Bekijk de opname' },
      { id: 'cta', type: 'button', sites: [], label: 'Bekijk de opname', href: '{{event.url}}' },
      { id: 'outro', type: 'text', sites: [], html: '<p style="margin:0;">Tot een volgende keer! &#128075;</p>' },
      ...signature, ...footer
    ]
  }
}, 'seed');

writeFileSync('docs/mail-blokken/qa-syndicoach-mailblokken.json', JSON.stringify(doc, null, 2) + '\n');

// Voorbeeldrendering, om te vergelijken met de bestaande mail.
const EVENT = {
  id: 76, title: 'Q&A Syndicoach: vragen over mede-eigendom', slug: 'qa-syndicoach',
  starts_at: '2026-09-08T17:00:00.000Z', location: { name: null },
  online_url: 'https://meet.google.com/abc-defg-hij',
  event_type: { id: 2, name: 'Q&A' }, host: { id: 11, name: 'Rob Claes' }
};
const HOST = { email: 'rob@mymmo.com', jobTitle: 'Customer Experience Hero', avatarUrl: 'https://mymmo.odoo.com/web/image/13413' };

const previews = [];
for (const [site, label] of [['syndicoach', 'syndicoach'], ['openvme', 'openvme'], [null, 'site onbekend (t-else)']]) {
  const reg = { id: 1, name: 'Jan Peeters', submitted_email: 'jan@example.com', site, state: 'registered' };
  const ctx = buildPlaceholderContext({ event: EVENT, registration: reg, host: HOST, publicUrl: 'https://syndicoach.be/event/qa-syndicoach/?owid=76' });
  const section = doc.confirmation;
  previews.push({
    label,
    subject: renderSubject(section.subject, ctx),
    html: renderMailHtml({ blocks: section.blocks, context: ctx, site, preheader: section.preheader })
  });
}

const page = `<!doctype html><meta charset="utf-8"><title>Voorbeeld bevestigingsmail</title>
<style>body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#e5e7eb}
h2{margin:0;padding:12px 16px;background:#111827;color:#fff;font-size:13px;font-weight:600}
p.sub{margin:0;padding:8px 16px;background:#374151;color:#d1d5db;font-size:12px}
iframe{border:0;width:100%;height:1500px;background:#fff;display:block}</style>
${previews.map((p) => `<h2>Bevestigingsmail — ${p.label}</h2><p class="sub">Onderwerp: ${p.subject.replace(/</g,'&lt;')}</p><iframe srcdoc="${p.html.replace(/"/g,'&quot;')}"></iframe>`).join('')}`;
writeFileSync('docs/mail-blokken/voorbeeld-bevestigingsmail.html', page);

console.log('JSON-bytes:', JSON.stringify(doc).length);
console.log('blokken per soort:', Object.fromEntries(['confirmation','reminder','recap'].map(k => [k, doc[k].blocks.length])));
