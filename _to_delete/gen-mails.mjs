import { writeFileSync, mkdirSync } from 'node:fs';
import { renderMailHtml, renderSubject, buildPlaceholderContext } from './src/modules/event-operations-v2/lib/mail-render.js';
import { normalizeMailBlocks, resolveSection } from './src/modules/event-operations-v2/lib/mail-blocks.js';
import { starterMailBlocks } from './src/modules/event-operations-v2/lib/mail-defaults.js';

const doc = normalizeMailBlocks(starterMailBlocks(), 'seed');
mkdirSync('docs/mail-blokken', { recursive: true });
writeFileSync('docs/mail-blokken/mailblokken-alle-eventtypes.json', JSON.stringify(doc, null, 2) + '\n');

const EVENT = {
  id: 76, title: 'Q&A Syndicoach: vragen over mede-eigendom', slug: 'qa-syndicoach',
  starts_at: '2026-09-08T17:00:00.000Z', location: { name: null },
  online_url: 'https://meet.google.com/abc-defg-hij',
  event_type: { id: 3, name: 'Q&A' }, host: { id: 11, name: 'Rob Claes' },
  recap: {
    video_url: 'https://vimeo.com/123456789',
    thumbnail_url: 'https://i.vimeocdn.com/video/123456789_640.jpg',
    body_html: '<p style="margin:0;">De slides vind je terug in het ledenportaal.</p>'
  }
};
const HOST = { email: 'rob@mymmo.com', jobTitle: 'Customer Experience Hero', avatarUrl: 'https://mymmo.odoo.com/web/image/13413' };
const LABEL = { confirmation: 'Bevestiging', reminder: 'Reminder', recap: 'Recap' };

const secties = [];
for (const kind of ['confirmation', 'reminder', 'recap']) {
  for (const [site, siteLabel] of [['openvme', 'OpenVME'], ['syndicoach', 'Syndicoach']]) {
    const reg = { id: 1, name: 'Jan Peeters', submitted_email: 'jan@example.com', site, state: 'registered' };
    const r = resolveSection(doc, null, kind, site);
    const ctx = buildPlaceholderContext({ event: EVENT, registration: reg, host: HOST, publicUrl: 'https://openvme.be/event/qa-syndicoach/?owid=76' });
    secties.push({
      titel: `${LABEL[kind]} — ${siteLabel}`,
      subject: renderSubject(r.subject, ctx),
      html: renderMailHtml({ header: r.header, blocks: r.blocks, context: ctx, preheader: r.preheader })
    });
  }
}

const page = `<!doctype html><meta charset="utf-8"><title>De drie mails</title>
<style>body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#e5e7eb}
h2{margin:0;padding:12px 16px;background:#111827;color:#fff;font-size:13px;font-weight:600;position:sticky;top:0}
p.sub{margin:0;padding:8px 16px;background:#374151;color:#d1d5db;font-size:12px}
iframe{border:0;width:100%;height:1600px;background:#fff;display:block}</style>
${secties.map(s => `<h2>${s.titel}</h2><p class="sub">Onderwerp: ${s.subject.replace(/</g,'&lt;')}</p><iframe srcdoc="${s.html.replace(/"/g,'&quot;')}"></iframe>`).join('')}`;
writeFileSync('docs/mail-blokken/voorbeeld-alle-mails.html', page);
console.log('geschreven');
