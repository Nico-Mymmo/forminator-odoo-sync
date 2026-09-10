/**
 * Event Operations v2 — Browsertest van de communicatie-studio
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node src/modules/event-operations-v2/tests/mail-studio-ui-test.mjs
 *
 * Draait de ECHTE public/events-v2-mail-studio.js in Chromium, met de echte
 * dialoog-markup uit events-v2.html en een nagebootste API die de ECHTE
 * renderer en resolveSection() gebruikt.
 *
 * WAAROM DIT BESTAAT. Elke bug die hier gevangen is, zat in de KOPPELING
 * tussen route, service en client -- geen enkele unit-test kon ze zien:
 *   1. de client testte op `<t` terwijl de mail met `<table` begint;
 *   2. de route gaf `editable` mee, maar renderMailForRegistration nam het
 *      niet aan, dus er stond geen enkele marker in de HTML;
 *   3. "beide sites" gaf `null` door, wat voor de renderer "site onbekend"
 *      betekent, waardoor de header in de bewerkstand onzichtbaar was;
 *   4. de "/"-kiezer liet het getypte teken staan (positie na i.p.v. op "/");
 *   5. na het toevoegen van zero-width spaties rond chips was `firstChild`
 *      die spatie in plaats van de chip, en werd er niets ingevoegd;
 *   6. een blok dat niets kon renderen (opname zonder video, lege knop) gaf
 *      een lege string terug -- dus geen marker, dus onzichtbaar en niet meer
 *      te selecteren of weg te halen.
 *
 * DE CSS-SHIM. Deze pagina laadt geen Tailwind. Zonder de SHIM hieronder is
 * een `grid` geen grid en heeft `hidden` geen effect -- dan meet je een
 * toevallige inline-flow in plaats van je eigen layout. Voeg een class toe
 * aan de shim zodra je er een assertie op doet.
 *
 * TEST JE ASSERTIES. Draai een fix tijdelijk terug en kijk of de test
 * daadwerkelijk faalt. Een groene test die ook groen blijft zonder de fix
 * bewijst niets -- dat is hier meermaals gebeurd.
 *
 * En laat een test nooit afhangen van wat een vorige achterliet: open de
 * studio opnieuw als je een schone start nodig hebt, en sluit een <dialog>
 * in een finally (een openstaande modal blokkeert alle volgende clicks).
 *
 * Zonder playwright geinstalleerd slaat de test zichzelf over.
 */

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  console.log('playwright niet geïnstalleerd — browsertest overgeslagen.');
  console.log('  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}
/**
 * Browsertest van de communicatie-studio.
 *
 * Draait de ECHTE public/events-v2-mail-studio.js in Chromium, met de echte
 * dialoog-markup uit events-v2.html en een nagebootste API die de ECHTE
 * renderer gebruikt. Zo wordt het hele pad getest: openen -> voorbeeld ->
 * klikken -> typen -> blok toevoegen -> bewaren.
 *
 * Dit bestaat omdat er een bug in productie kwam die geen enkele unit-test
 * kon zien: de preview werd nooit getoond doordat de client op `<t` testte
 * terwijl de mail met `<table` begint.
 */


import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { renderMailHtml, renderSubject, buildPlaceholderContext } from '../lib/mail-render.js';
import { normalizeMailBlocks, emptyMailBlocks, resolveSection } from '../lib/mail-blocks.js';
import { starterMailBlocks } from '../lib/mail-defaults.js';

const studioJs = readFileSync(new URL('../../../../public/events-v2-mail-studio.js', import.meta.url), 'utf8');
// De gedeelde bewerklaag (chips + "/"-kiezer). Moet vóór het studio-script
// geladen worden, precies zoals in events-v2.html -- de studio maakt bij het
// laden een instantie via window.OMTokenEditor.create().
const tokenEditorJs = readFileSync(new URL('../../../../public/mail-token-editor.js', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('../../../../public/events-v2.html', import.meta.url), 'utf8');

// Alleen de dialogen van de studio uit de pagina halen.
const dialogs = [...pageHtml.matchAll(/<dialog id="(mailStudioDialog|mailBlockPicker|mailBlockSettings|mailVideoPicker|mailHeaderDialog|mailProofDialog)"[\s\S]*?<\/dialog>/g)]
  .map((m) => m[0])
  .join('\n');
assert.ok(dialogs.includes('mailStudioDialog'), 'dialoog-markup niet gevonden in events-v2.html');
assert.ok(dialogs.includes('mailVideoBar'), 'mailVideoBar ontbreekt in de markup');
assert.ok(dialogs.includes('mailEmptyState'), 'mailEmptyState ontbreekt in de markup');
// Een <dialog> die met showModal() opent, rendert in de TOP LAYER van de
// browser. Alles wat daarbuiten in de DOM staat valt eronder -- ook met
// position:fixed en een hoge z-index. Stond de "/"-kiezer buiten de
// studiodialoog, dan was hij onzichtbaar en onaanklikbaar. Precies daarom
// werkte "/" wel in de mailbody (dat menu leeft in het iframe, dus binnen
// de dialoog) en niet in het onderwerp en de voorbeeldtekst.
{
  const studio = /<dialog id="mailStudioDialog"[\s\S]*?<\/dialog>/.exec(pageHtml);
  assert.ok(studio, 'de studiodialoog is niet gevonden in events-v2.html');
  assert.ok(
    studio[0].includes('id="mailTokenMenu"'),
    'de "/"-kiezer staat BUITEN de studiodialoog en valt dan onder de modal (top layer)'
  );
}

const EVENT = {
  id: 76, title: 'Q&A Syndicoach', slug: 'qa', starts_at: '2026-09-08T17:00:00.000Z',
  location: { name: null }, online_url: 'https://meet.google.com/abc',
  event_type: { id: 2, name: 'Q&A' }, host: { id: 11, name: 'Rob Claes' },
  recap: { video_url: '', thumbnail_url: '' }
};

const STARTER = normalizeMailBlocks(starterMailBlocks(), 'starter');

/** Server-side voorbeeldrendering, precies zoals de route het doet. */
function preview(body) {
  const doc = body.draft ? normalizeMailBlocks(body.draft, 'p') : emptyMailBlocks();
  const sec = doc[body.kind] || { subject: '', preheader: '', blocks: [] };
  // Wat de route doet met resolveAnnouncements(): het gekozen event opzoeken
  // en per blok-id meegeven. Hier vast, want deze test praat niet met Odoo.
  const announcements = {};
  for (const block of sec.blocks || []) {
    if (block.type !== 'announcement') continue;
    if (block.pick === 'next_of_type' && !block.eventTypeId) continue;
    if (block.pick === 'fixed' && !block.eventId) continue;
    announcements[block.id] = {
      id: 78, title: 'Infosessie: nieuwe wetgeving', day: 'dinsdag, 22 september', time: '19:00',
      location: '', link: 'https://meet.google.com/xyz', type: 'Infosessie',
      summary: 'Wat verandert er precies?', url: 'https://openvme.be/events/infosessie/?owid=78'
    };
  }

  const ctx = buildPlaceholderContext({
    event: EVENT,
    registration: { id: 1, name: 'Jan Peeters', submitted_email: 'j@e.com', site: body.site, state: 'registered' },
    host: { email: 'rob@mymmo.com', jobTitle: 'CX Hero', avatarUrl: 'https://mymmo.odoo.com/web/image/1' },
    announcements
  });
  const resolved = resolveSection(doc, null, body.kind, body.site);
  return {
    subject: renderSubject(resolved.subject, ctx),
    html: renderMailHtml({ header: resolved.header, blocks: resolved.blocks, context: ctx, preheader: resolved.preheader, editable: body.editable === true }),
    source: 'event_type',
    empty: sec.blocks.length === 0,
    event: EVENT,
    video_missing: body.kind === 'recap' && !EVENT.recap.video_url,
    email_from: '"Rob Claes" <rob@mymmo.com>',
    email_to: 'j@e.com'
  };
}

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
  catch (error) { failed += 1; console.error(`  FAIL ${name}\n       ${error.message}`); }
}

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const page = await browser.newPage();
// Korte timeouts: een hangende locator hoort de test te laten falen met een
// duidelijke melding, niet de hele run 30s per stap te laten wachten.
page.setDefaultTimeout(5000);

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let savedDoc = null;

await page.exposeFunction('__preview', (body) => preview(body));
await page.exposeFunction('__saved', (doc) => { savedDoc = doc; });

// Geen externe requests in deze sandbox: afbeeldingen meteen afbreken,
// anders blijft elke hero in een proxy-timeout hangen.
await page.route('**', (route) => {
  const url = route.request().url();
  if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
  return route.abort();
});
// Minimale CSS-shim: deze pagina laadt geen Tailwind, en zonder deze regels
// is het raster geen raster en heeft `hidden` geen effect -- dan test je de
// layout van je markup niet, maar een toevallige inline-flow.
const SHIM = `
  .hidden{display:none!important}
  .grid{display:grid}
  .grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sm\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .gap-3{gap:.75rem}
  .items-start{align-items:start}
  .p-1{padding:.25rem}
  .flex{display:flex}
  .flex-col{flex-direction:column}
  .items-stretch{align-items:stretch}
  .justify-start{justify-content:flex-start}
  .text-left{text-align:left}
  .w-full{width:100%}
  .aspect-video{aspect-ratio:16/9}
  .min-h-\\[2\\.5em\\]{min-height:2.5em}
  .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .max-h-\\[45vh\\]{max-height:45vh}
  .overflow-y-auto{overflow-y:auto}
  .ml-auto{margin-left:auto}
  .opacity-40{opacity:.4}
  .flex-wrap{flex-wrap:wrap}
  .items-center{align-items:center}
  .justify-center{justify-content:center}
  .gap-2{gap:.5rem}
  /* De kleurstalen: zonder een echte breedte en hoogte zijn het knoppen van
     0 bij 0 pixels, en dan is een klik erop onmogelijk -- Playwright wacht
     dan tot de timeout op "element is not visible". */
  .w-8{width:2rem}
  .h-8{height:2rem}
  .w-12{width:3rem}
  .h-12{height:3rem}
  .shrink-0{flex-shrink:0}
  .rounded-full{border-radius:9999px}
  button{font:inherit;background:none;border:0;padding:0}
  img{max-width:100%;display:block}
`;

await page.setContent(`<!doctype html><html><head><style>${SHIM}</style></head><body>
  <button data-action="open-mail-studio" data-event-id="76" id="opener">open</button>
  ${dialogs}
  <div id="toastContainer"></div>
</body></html>`);

// Nagebootste API vóór het studio-script.
await page.addScriptTag({
  content: `
  window.showToast = function (m) { (window.__toasts = window.__toasts || []).push(m); };
  window.lucide = { createIcons: function () {} };
  window.__starter = ${JSON.stringify(STARTER)};
  window.fetch = async function (url, options) {
    var body = options && options.body ? JSON.parse(options.body) : null;
    var data;
    if (url.indexOf('/mail/schema') !== -1) {
      data = { kinds: ['confirmation','reminder','recap'], block_types: [], sites: ['openvme','syndicoach'],
               placeholders: [{group:'Event',items:[{path:'event.title',label:'Titel van het event'},{path:'event.type',label:'Soort event'},{path:'event.day',label:'Datum'}]},
                              {group:'Deelnemer',items:[{path:'registration.first_name',label:'Voornaam van de deelnemer'}]}],
               vimeo_configured: false, starter: window.__starter };
    } else if (url.indexOf('/mail-blocks') !== -1 && (!options || options.method !== 'PUT')) {
      data = { event_type: { id: 2, name: 'Q&A' },
               type_doc: { version: 1, confirmation: { subject: '', preheader: '', blocks: [] },
                           reminder: { subject: '', preheader: '', blocks: [] },
                           recap: { subject: '', preheader: '', blocks: [] } },
               event_doc: { version: 1, confirmation: { subject: '', preheader: '', blocks: [] },
                            reminder: { subject: '', preheader: '', blocks: [] },
                            recap: { subject: '', preheader: '', blocks: [] } },
               sources: {}, owned_by_om: false };
    } else if (url.indexOf('/mail-blocks') !== -1) {
      await window.__saved(body); data = body;
    } else if (url.indexOf('/mail-preview') !== -1) {
      data = await window.__preview(body);
    } else if (url.indexOf('/registrations') !== -1) {
      data = [
        { id: 501, name: 'Jan Peeters', partner: { id: 9, name: 'Jan Peeters' }, submitted_email: 'jan@example.com', site: 'openvme', state: 'registered', active: true }
      ];
    } else if (url.indexOf('/mail/announcement-options') !== -1) {
      data = {
        event_types: [{ id: 2, name: 'Q&A', color: '#7c3aed' }, { id: 4, name: 'Live Event', color: '#059669' }],
        events: [{ id: 78, title: 'Infosessie: nieuwe wetgeving', starts_at: '2026-09-22T17:00:00.000Z', type: 'Infosessie' }]
      };
    } else if (url.indexOf('/vimeo/videos') !== -1) {
      data = { configured: true, status: 'ok', total: 3, page: 1, hasMore: false, videos: [
        { id: '1', title: 'Korte titel', url: 'https://vimeo.com/1', thumbnail_url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', duration_seconds: 65, privacy: 'anybody' },
        { id: '2', title: 'Een veel langere titel die zeker over twee regels loopt in de kiezer', url: 'https://vimeo.com/2', thumbnail_url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', duration_seconds: 644, privacy: 'anybody' },
        { id: '3', title: 'Derde', url: 'https://vimeo.com/3', thumbnail_url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', duration_seconds: 30, privacy: 'nobody' }
      ] };
    } else { data = {}; }
    return { ok: true, status: 200, json: async function () { return { success: true, data: data }; } };
  };`
});
await page.addScriptTag({ content: tokenEditorJs });
await page.addScriptTag({ content: studioJs });

const settle = () => page.waitForTimeout(700);

await check('de studio opent en toont de lege staat met een startknop', async () => {
  await page.click('#opener');
  await settle();
  assert.equal(await page.isVisible('#mailStudioDialog'), true, 'dialoog niet open');
  assert.equal(await page.isVisible('[data-action="mail-use-starter"]'), true, 'startknop ontbreekt');
});

await check('de standaardopzet vult de mail en het VOORBEELD toont hem echt', async () => {
  await page.click('[data-action="mail-use-starter"]');
  await settle();
  const frame = page.frameLocator('#mailPreviewFrame');
  const count = await frame.locator('[data-om-block]').count();
  assert.ok(count > 3, `verwacht meerdere bewerkbare blokken, kreeg ${count}`);
  // Dit is precies de bug die in productie zat.
  const body = await page.frame({ url: /about:srcdoc/ })?.content();
  assert.ok(!String(body).includes('nog geen inhoud'), 'het voorbeeld toont nog steeds de lege tekst');
});

await check('klikken op een titel selecteert het blok en toont de werkbalk', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  await frame.locator('[data-om-edit="text"]').first().click();
  await settle();
  assert.equal(await frame.locator('#om-bar').count(), 1, 'werkbalk verschijnt niet');
  assert.equal(await frame.locator('.om-selected').count(), 1, 'geen selectie-omlijning');
});

await check('typen in de mail wijzigt de blok-inhoud (niet-bewaard verschijnt)', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  const heading = frame.locator('[data-om-edit="text"]').first();
  await heading.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Aangepaste titel');
  await page.locator('#mailPreviewFrame').press('Escape').catch(() => {});
  await page.click('#mailStudioDirty');
  await settle();
  assert.match(await page.textContent('#mailStudioDirty'), /Niet bewaard/);
});

await check('een onderdeel toevoegen werkt via de kaartjeskiezer', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  const before = await frame.locator('[data-om-block]').count();
  await page.click('[data-action="mail-add-open"]');
  await settle();
  assert.equal(await page.isVisible('#mailBlockPicker'), true, 'kiezer opent niet');
  await page.click('[data-mail-add-type="button"]');
  await settle();
  const after = page.frameLocator('#mailPreviewFrame');
  assert.equal(await after.locator('[data-om-block]').count(), before + 1, 'blok is niet toegevoegd');
});

await check('de werkbalk kan een blok verwijderen', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  const before = await frame.locator('[data-om-block]').count();
  await frame.locator('[data-om-block]').nth(1).click();
  await settle();
  await frame.locator('#om-bar button[data-om-cmd="remove"]').click();
  await settle();
  const after = page.frameLocator('#mailPreviewFrame');
  assert.equal(await after.locator('[data-om-block]').count(), before - 1, 'blok is niet verwijderd');
});

await check('Instellingen opent, zonder zichtbaarheid per blok', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  try {
    await frame.locator('[data-om-block]').first().click();
    await settle();
    await frame.locator('#om-bar button[data-om-cmd="settings"]').click();
    await settle();
    assert.equal(await page.isVisible('#mailBlockSettings'), true, 'instellingen openen niet');
    // Zichtbaarheid per blok bestaat niet meer: dat zit nu in de header en
    // (optioneel) in een variant, niet per alinea.
    assert.equal(await page.locator('[data-mail-visibility]').count(), 0,
      'de zichtbaarheidskeuze per blok hoort weg te zijn');
  } finally {
    // Altijd sluiten: een openstaande <dialog> blokkeert alle volgende clicks.
    await page.evaluate(() => document.getElementById('mailBlockSettings').close());
  }
});

await check('de header staat apart, met een vakje per bedrijf', async () => {
  await page.click('[data-action="mail-studio-close"]');
  await page.click('#opener');
  await settle();
  await page.click('[data-action="mail-use-starter"]');
  await settle();
  assert.equal(await page.locator('#mailHeaderSlots [data-action="mail-header-open"]').count(), 3,
    'er horen drie headervakjes te staan (OpenVME, Syndicoach, Overige)');
});

await check('het voorbeeld toont de header van het gekozen bedrijf', async () => {
  const headerSrc = async () =>
    page.frameLocator('#mailPreviewFrame').locator('[data-om-header] img').first().getAttribute('src');

  await page.click('[data-mail-view="openvme"]'); await settle();
  const ov = await headerSrc();
  await page.click('[data-mail-view="syndicoach"]'); await settle();
  const sc = await headerSrc();

  assert.match(String(ov), /openvme/, 'OpenVME krijgt niet de openvme-header');
  assert.match(String(sc), /syndicoach/, 'Syndicoach krijgt niet de syndicoach-header');
});

await check('de inhoud is standaard EEN versie voor iedereen', async () => {
  const tekst = async () => page.frameLocator('#mailPreviewFrame').locator('[data-om-edit="html"]').first().textContent();
  await page.click('[data-mail-view="openvme"]'); await settle();
  const a = await tekst();
  await page.click('[data-mail-view="syndicoach"]'); await settle();
  const b = await tekst();
  assert.equal(a, b, 'de inhoud verschilt per bedrijf terwijl er niet gesplitst is');
  assert.equal(await page.locator('[data-action="mail-split"]').count(), 1, 'de splits-knop ontbreekt');
});

await check('splitsen geeft twee versies met een standaard, samenvoegen draait terug', async () => {
  await page.click('[data-action="mail-split"]');
  await settle();
  assert.equal(await page.locator('[data-mail-catchall]').count(), 1, 'geen keuze voor de standaard');
  assert.equal(await page.locator('[data-action="mail-merge"]').count(), 1, 'geen weg terug');

  // In de gesplitste stand een tekst wijzigen mag de andere versie niet raken.
  const frame = page.frameLocator('#mailPreviewFrame');
  await frame.locator('[data-om-edit="html"]').first().click();
  await page.keyboard.type('ALLEEN-OPENVME ');
  await page.click('#mailStudioDirty');
  await settle();

  await page.click('[data-mail-view="syndicoach"]');
  await settle();
  const andere = await page.frameLocator('#mailPreviewFrame').locator('[data-om-edit="html"]').first().textContent();
  assert.ok(!String(andere).includes('ALLEEN-OPENVME'), 'de wijziging lekt naar de andere versie');
});

await check('de opnamebalk staat op het recap-tabblad in beeld', async () => {
  await page.click('[data-mail-kind="recap"]');
  await settle();
  // Op de class testen, niet op isVisible: deze testpagina laadt geen
  // Tailwind, dus `hidden` heeft er geen zichtbaar effect.
  const verborgen = async () => (await page.getAttribute('#mailVideoBar', 'class')).includes('hidden');
  assert.equal(await verborgen(), false, 'opnamebalk hoort in beeld op recap');
  assert.equal(await page.locator('#mailVideoBar [data-action="mail-video-open"]').count(), 1, 'knop "Opname kiezen" ontbreekt');

  await page.click('[data-mail-kind="confirmation"]');
  await settle();
  assert.equal(await verborgen(), true, 'opnamebalk hoort weg bij de bevestiging');
});

await check('placeholders staan als chip in de mail, niet als ingevulde tekst', async () => {
  // Verse, ONGESPLITSTE mail: de test hiervoor liet de inhoud gesplitst
  // achter, en dan leeft het onderwerp in een variant.
  await page.click('[data-action="mail-studio-close"]');
  await page.click('#opener');
  await settle();
  await page.click('[data-action="mail-use-starter"]');
  await settle();

  const frame = page.frameLocator('#mailPreviewFrame');
  assert.ok(await frame.locator('[data-om-token]').count() > 0, 'geen enkele chip in het voorbeeld');
  // De kern: de editor mag de INGEVULDE waarde niet tonen, anders schrijft
  // hij die bij het verlaten van het veld terug in het sjabloon.
  const body = await page.frame({ url: /about:srcdoc/ })?.content();
  assert.ok(!/Ingeschreven voor de Q&amp;A/.test(String(body)), 'het voorbeeld toont een ingevulde placeholder');
});

await check('het onderwerpveld toont chips en levert {{...}} terug', async () => {
  const veld = page.locator('[data-mail-field="subject"]');
  assert.ok(await veld.locator('[data-om-token]').count() > 0, 'geen chip in het onderwerpveld');
  assert.equal(await veld.evaluate((n) => n.tagName), 'DIV', 'het onderwerpveld hoort contenteditable te zijn');
});

await check('"/" opent de kiezer, filtert, en voegt een chip in', async () => {
  const veld = page.locator('[data-mail-field="preheader"]');
  await veld.click();
  await page.keyboard.press('End');
  await page.keyboard.type('/');
  await settle();
  const menuDicht = async () => (await page.getAttribute('#mailTokenMenu', 'class') || '').includes('hidden');
  assert.equal(await menuDicht(), false, 'de kiezer opent niet');

  const alles = await page.locator('#mailTokenMenu [data-om-token-pick]').count();
  await page.keyboard.type('voornaam');
  await settle();
  const gefilterd = await page.locator('#mailTokenMenu [data-om-token-pick]').count();
  assert.ok(gefilterd > 0 && gefilterd < alles, `filteren werkt niet (${alles} -> ${gefilterd})`);

  const voor = await veld.locator('[data-om-token]').count();
  await page.keyboard.press('Enter');
  await settle();
  assert.equal(await veld.locator('[data-om-token]').count(), voor + 1, 'er is geen chip ingevoegd');
  assert.equal(await menuDicht(), true, 'de kiezer blijft openstaan');
  // De getypte "/voornaam" mag niet blijven staan.
  const tekst = await veld.textContent();
  assert.ok(!tekst.includes('voornaam'), 'de zoekterm staat nog in het veld: ' + tekst);
  assert.ok(!tekst.includes('/'), 'de getypte "/" staat er nog: ' + tekst);
});

await check('de ingevoegde chip belandt als {{...}} in het bewaarde document', async () => {
  await page.click('[data-action="mail-save"]');
  await settle();
  assert.ok(savedDoc, 'niets bewaard');
  const pre = savedDoc.confirmation.preheader || '';
  assert.match(pre, /\{\{registration\.first_name\}\}/, 'de chip is niet als placeholder bewaard: ' + pre);
  assert.ok(!pre.includes('Voornaam van de deelnemer'), 'het label is als tekst bewaard in plaats van het pad');
});

await check('typen hertekent het voorbeeld NIET (geen geflikker, cursor blijft staan)', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  const doel = frame.locator('[data-om-edit="text"]').first();
  await doel.click();
  const voor = await page.frame({ url: /about:srcdoc/ })?.evaluate(() => document.body.dataset.stamp = String(Date.now()));
  await page.keyboard.type('abc');
  await page.waitForTimeout(900); // ruim boven de 300ms debounce van schedulePreview
  const na = await page.frame({ url: /about:srcdoc/ })?.evaluate(() => document.body.dataset.stamp || null);
  assert.equal(na, voor, 'het iframe is opnieuw opgebouwd tijdens het typen');
});

await check('maar een blok toevoegen hertekent WEL', async () => {
  await page.frame({ url: /about:srcdoc/ })?.evaluate(() => document.body.dataset.stamp = 'oud');
  await page.click('[data-action="mail-add-open"]');
  await settle();
  await page.click('[data-mail-add-type="divider"]');
  await settle();
  const na = await page.frame({ url: /about:srcdoc/ })?.evaluate(() => document.body.dataset.stamp || null);
  assert.notEqual(na, 'oud', 'het voorbeeld is niet ververst na een structurele wijziging');
});

await check('het praktisch kader is bewerkbaar en regels zijn te beheren', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  assert.ok(await frame.locator('[data-om-edit="rows.0.value"]').count() > 0,
    'de regels van het praktisch kader zijn niet bewerkbaar');

  await frame.locator('[data-om-type="event_details"]').first().click();
  await settle();
  await frame.locator('#om-bar button[data-om-cmd="settings"]').click();
  await settle();

  const voor = await page.locator('[data-action="detail-row-remove"]').count();
  assert.ok(voor > 0, 'geen regeloverzicht in de instellingen');

  await page.selectOption('#mailDetailPreset', 'capacity');
  await page.click('[data-action="detail-row-add"]');
  await settle();
  assert.equal(await page.locator('[data-action="detail-row-remove"]').count(), voor + 1, 'regel niet toegevoegd');

  await page.locator('[data-action="detail-row-remove"]').last().click();
  await settle();
  assert.equal(await page.locator('[data-action="detail-row-remove"]').count(), voor, 'regel niet weggehaald');
  await page.evaluate(() => document.getElementById('mailBlockSettings').close());
});

await check('een opnameblok toevoegen levert een zichtbaar, selecteerbaar blok op', async () => {
  // Dit event heeft geen opname. Voorheen verscheen er dan niets, kon je het
  // blok niet selecteren en niet weghalen -- er stond geen marker in de HTML.
  const frame = page.frameLocator('#mailPreviewFrame');
  const voor = await frame.locator('[data-om-block]').count();

  await page.click('[data-action="mail-add-open"]');
  await settle();
  await page.click('[data-mail-add-type="video"]');
  await settle();

  const na = page.frameLocator('#mailPreviewFrame');
  assert.equal(await na.locator('[data-om-block]').count(), voor + 1, 'het opnameblok verschijnt niet');
  assert.equal(await na.locator('[data-om-type="video"]').count(), 1, 'geen opnameblok in het voorbeeld');

  // En het is ook echt te bedienen.
  await na.locator('[data-om-type="video"]').click();
  await settle();
  assert.equal(await na.locator('#om-bar').count(), 1, 'het blok is niet selecteerbaar');
  await na.locator('#om-bar button[data-om-cmd="remove"]').click();
  await settle();
  assert.equal(await page.frameLocator('#mailPreviewFrame').locator('[data-om-block]').count(), voor,
    'het blok is niet weg te halen');
});

await check('de videokiezer werkt OOK met de studio dicht (vanuit het eventpaneel)', async () => {
  await page.click('[data-action="mail-studio-close"]');
  await settle();
  assert.equal(await page.evaluate(() => document.getElementById('mailStudioDialog').open), false);

  await page.evaluate(() => window.EventsMailStudio.openVideoPicker(76));
  await settle();
  assert.equal(await page.evaluate(() => document.getElementById('mailVideoPicker').open), true,
    'de kiezer opent niet buiten de studio');

  // Sluiten via de knop moet ook werken terwijl de studio dicht is.
  await page.click('[data-action="mail-video-close"]');
  await settle();
  assert.equal(await page.evaluate(() => document.getElementById('mailVideoPicker').open), false,
    'de kiezer sluit niet');

  // Terug open voor de laatste checks.
  await page.click('#opener');
  await settle();
  await page.click('[data-action="mail-use-starter"]');
  await settle();
});

await check('de opnamebalk verschijnt zodra er een opnameblok in de mail staat', async () => {
  // Op de bevestiging staat standaard geen opnameblok, dus geen balk.
  const verborgen = async () => (await page.getAttribute('#mailVideoBar', 'class') || '').includes('hidden');
  assert.equal(await verborgen(), true, 'de balk staat er terwijl er geen opnameblok is');

  await page.click('[data-action="mail-add-open"]');
  await settle();
  await page.click('[data-mail-add-type="video"]');
  await settle();
  assert.equal(await verborgen(), false, 'geen knop om een opname te kiezen bij een opnameblok');
});

await check('in de videokiezer beginnen alle thumbnails op dezelfde hoogte', async () => {
  await page.evaluate(() => window.EventsMailStudio.openVideoPicker(76));
  await settle();
  try {

  const tops = await page.locator('#mailVideoResults button img').evaluateAll(
    (imgs) => imgs.map((img) => Math.round(img.getBoundingClientRect().top))
  );
  assert.equal(tops.length, 3, 'niet alle video\'s worden getoond');
  // Kaart 2 heeft een tweeregelige titel.
  //
  // EERLIJKE KANTTEKENING: deze assertie slaagde ook mét de fixes
  // teruggedraaid -- het gerapporteerde springen reproduceert niet in deze
  // shim-omgeving. Ze staat er als grove regressiebewaking, niet als bewijs
  // dat het probleem opgelost is. De padding-assertie hieronder heeft wél
  // tanden (geverifieerd door de fix terug te draaien).
  assert.equal(new Set(tops).size, 1, 'de thumbnails staan niet op één lijn: ' + tops.join(', '));

  // De hover-ring tekent buiten de afbeelding; zonder padding werd die links
  // afgeknipt door de scrollcontainer.
  const ruimte = await page.locator('#mailVideoResults').evaluate((el) => {
    const eerste = el.querySelector('button');
    return Math.round(eerste.getBoundingClientRect().left - el.getBoundingClientRect().left);
  });
  assert.ok(ruimte >= 2, 'geen ruimte links voor de hover-ring (' + ruimte + 'px)');
  } finally {
    // Altijd sluiten: een openstaande <dialog> blokkeert alle volgende clicks.
    await page.evaluate(() => document.getElementById('mailVideoPicker').close());
  }
});

await check('de reminder-timing is instelbaar en verdwijnt op de andere tabbladen', async () => {
  const timingDicht = async () => (await page.getAttribute('#mailTimingBar', 'class') || '').includes('hidden');

  await page.click('[data-mail-kind="confirmation"]'); await settle();
  assert.equal(await timingDicht(), true, 'de timing-balk hoort weg bij de bevestiging');

  await page.click('[data-mail-kind="reminder"]'); await settle();
  assert.equal(await timingDicht(), false, 'geen timing-balk op het reminder-tabblad');

  // Voorsprong aanpassen.
  await page.fill('[data-mail-timing="leadHours"]', '48');
  await page.locator('[data-mail-timing="leadHours"]').dispatchEvent('change');
  await settle();
  assert.equal(await page.inputValue('[data-mail-timing="leadHours"]'), '48');

  // Ondergrens aanpassen.
  await page.fill('[data-mail-timing="minLeadHours"]', '3');
  await page.locator('[data-mail-timing="minLeadHours"]').dispatchEvent('change');
  await settle();

  // Uitzetten: de velden gaan op slot.
  await page.locator('[data-mail-timing="enabled"]').uncheck();
  await settle();
  assert.equal(await page.locator('[data-mail-timing="leadHours"]').isDisabled(), true,
    'de velden blijven bedienbaar terwijl de reminder uit staat');

  // En terug aan, zodat de bewaartest de waarden ziet.
  await page.locator('[data-mail-timing="enabled"]').check();
  await settle();
});

await check('de timing wordt mee bewaard in het document', async () => {
  await page.click('[data-action="mail-save"]');
  await settle();
  assert.ok(savedDoc, 'niets bewaard');
  assert.equal(savedDoc.reminder.timing.leadHours, 48, 'de voorsprong is niet bewaard');
  assert.equal(savedDoc.reminder.timing.minLeadHours, 3, 'de ondergrens is niet bewaard');
  assert.equal(savedDoc.reminder.timing.enabled, true);
});

await check('"Bekijk zoals verstuurd" toont de mail INGEVULD, zonder editor-laag', async () => {
  await page.click('[data-mail-kind="confirmation"]');
  await settle();
  await page.click('[data-action="mail-proof-open"]');
  await settle();
  try {
    assert.equal(await page.evaluate(() => document.getElementById('mailProofDialog').open), true,
      'het voorbeeld opent niet');

    // Dit is het punt: geen chips en geen markers, maar echte waarden.
    var proof = page.frameLocator('#mailProofFrame');
    assert.equal(await proof.locator('[data-om-token]').count(), 0, 'er staan nog chips in het voorbeeld');
    assert.equal(await proof.locator('[data-om-block]').count(), 0, 'er staan nog editor-markers in het voorbeeld');

    var onderwerp = await page.textContent('#mailProofSubject');
    assert.ok(!onderwerp.includes('{{'), 'het onderwerp bevat nog een placeholder: ' + onderwerp);
    assert.ok(onderwerp.includes('Q&A'), 'de placeholders zijn niet ingevuld: ' + onderwerp);

    // Van/aan staan erbij, zodat je ziet wie hem krijgt.
    assert.ok((await page.textContent('#mailProofFrom')).length > 1);
    assert.ok((await page.textContent('#mailProofTo')).length > 1);

    // Een echte inschrijving kiezen kan.
    assert.ok(await page.locator('#mailProofWho option').count() >= 2, 'geen echte ontvanger te kiezen');
  } finally {
    await page.evaluate(() => document.getElementById('mailProofDialog').close());
  }
});

await check('een knop toont zijn link in de editor en is te stylen', async () => {
  await page.click('[data-action="mail-add-open"]');
  await settle();
  await page.click('[data-mail-add-type="button"]');
  await settle();

  var frame = page.frameLocator('#mailPreviewFrame');
  var body = await page.frame({ url: /about:srcdoc/ })?.content();
  assert.ok(String(body).includes('→ '), 'de link staat niet onder de knop in de editor');

  // Stijl aanpassen via de instellingen.
  await frame.locator('[data-om-type="button"]').first().click();
  await settle();
  await frame.locator('#om-bar button[data-om-cmd="settings"]').click();
  await settle();
  try {
    assert.equal(await page.locator('[data-mail-setting="width"]').count(), 1, 'geen breedtekeuze voor de knop');

    // De kleur: stalen om op te klikken plus een echte kleurkiezer. De oude
    // keuzelijst met "Omlijnd in de categoriekleur" was niet te zien zonder
    // ze eerst te kiezen en daarna in het voorbeeld te gaan controleren.
    const stalen = await page.locator('[data-action="mail-color-pick"]').count();
    assert.ok(stalen >= 4, `verwacht meerdere kleurstalen, kreeg ${stalen}`);
    assert.equal(await page.locator('[data-mail-color-free]').count(), 1, 'geen vrije kleurkiezer');
    assert.equal(await page.locator('[data-action="mail-color-shape"]').count(), 2, 'geen keuze vol/omlijnd');

    // De categoriekleur van dit event (#7c3aed via de nagebootste API) hoort
    // als staal te staan, want dat is de huisstijl van de categorie.
    assert.equal(await page.locator('[data-action="mail-color-pick"][data-color="category"]').count(), 1,
      'geen staal voor de kleur van de eventcategorie');

    await page.click('[data-action="mail-color-pick"][data-color="#111827"]');
    await settle();

    // En de knop in het VOORBEELD hoort die kleur nu te dragen -- dat is het
    // punt van een kiezer: je ziet wat je kiest.
    const knopHtml = await page.frameLocator('#mailPreviewFrame')
      .locator('[data-om-type="button"]').first().innerHTML();
    assert.match(knopHtml, /background:#111827/, 'de knop in het voorbeeld volgt de gekozen kleur niet');

    await page.click('[data-action="mail-color-shape"][data-outline="1"]');
    await settle();
    const omlijnd = await page.frameLocator('#mailPreviewFrame')
      .locator('[data-om-type="button"]').first().innerHTML();
    assert.match(omlijnd, /background:#ffffff/, 'omlijnd geeft geen witte vulling');
    assert.match(omlijnd, /border:1px solid #111827/, 'omlijnd geeft geen rand in de gekozen kleur');
  } finally {
    await page.evaluate(() => document.getElementById('mailBlockSettings').close());
  }
});

await check('het kaartblok zit in de kiezer', async () => {
  await page.click('[data-action="mail-add-open"]');
  await settle();
  assert.equal(await page.locator('[data-mail-add-type="map"]').count(), 1, 'geen kaartblok om toe te voegen');
  await page.click('[data-action="mail-add-close"]');
  await settle();
});

await check('een aankondiging toevoegen levert een kaart met een volgend event op', async () => {
  const voor = await page.frameLocator('#mailPreviewFrame').locator('[data-om-block]').count();

  await page.click('[data-action="mail-add-open"]');
  await settle();
  assert.equal(await page.locator('[data-mail-add-type="announcement"]').count(), 1, 'geen aankondiging in de kiezer');
  await page.click('[data-mail-add-type="announcement"]');
  await settle();

  const frame = page.frameLocator('#mailPreviewFrame');
  assert.equal(await frame.locator('[data-om-block]').count(), voor + 1, 'het blok is niet toegevoegd');
  // Standaard "het eerstvolgende event": dan hoort er meteen een echte kaart
  // te staan, geen lege plek en geen instelscherm-eerst.
  assert.match(await frame.locator('[data-om-type="announcement"]').first().innerHTML(), /Infosessie: nieuwe wetgeving/);
});

await check('de aankondiging laat je kiezen WELK event ze aankondigt', async () => {
  const frame = page.frameLocator('#mailPreviewFrame');
  await frame.locator('[data-om-type="announcement"]').first().click();
  await settle();
  await frame.locator('#om-bar button[data-om-cmd="settings"]').click();
  await settle();

  assert.equal(await page.isVisible('#mailBlockSettings'), true, 'instellingen openen niet');
  assert.equal(await page.locator('[data-mail-setting="pick"]').count(), 1, 'geen keuze hoe het event gekozen wordt');
  // Bij "eerstvolgende" is een typekeuze zinloos: die hoort er dan NIET te staan.
  assert.equal(await page.locator('[data-mail-setting="eventTypeId"]').count(), 0, 'typekeuze staat er te vroeg');

  await page.selectOption('[data-mail-setting="pick"]', 'next_of_type');
  await settle();
  assert.equal(await page.locator('[data-mail-setting="eventTypeId"]').count(), 1, 'geen typekeuze na het kiezen van "van een type"');
  assert.equal(await page.locator('[data-mail-setting="eventId"]').count(), 0, 'eventkeuze hoort hier niet');

  await page.selectOption('[data-mail-setting="pick"]', 'fixed');
  await settle();
  assert.equal(await page.locator('[data-mail-setting="eventId"]').count(), 1, 'geen eventkeuze bij "één vast event"');
  await page.selectOption('[data-mail-setting="eventId"]', '78');
  await settle();
  await page.click('[data-action="mail-settings-close"]');
  await settle();

  // Via bewaren: dat is de enige plek waar het document echt uit de editor komt.
  await page.click('[data-action="mail-save"]');
  await settle();
  const blok = (savedDoc?.confirmation?.blocks || []).find((b) => b.type === 'announcement');
  assert.ok(blok, 'de aankondiging staat niet in het bewaarde document');
  assert.equal(blok.pick, 'fixed');
  // Een lege of tekstuele waarde zou in Odoo als "0" belanden en dan zoekt
  // het blok naar een event dat niet bestaat.
  assert.equal(blok.eventId, 78, 'het gekozen event is geen getal geworden');
});

await check('"/" werkt ook in een LEEG onderwerpveld', async () => {
  // Dit was de bug: in een leeg contenteditable veld zet Chrome de cursor in
  // de <div> zelf, niet in een tekstknooppunt, en dan ging de kiezer niet open.
  const veld = page.locator('[data-mail-field="subject"]');
  await veld.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await settle();
  assert.equal(await veld.textContent(), '', 'het veld is niet leeg gemaakt');

  await page.keyboard.type('/');
  await settle();
  const dicht = (await page.getAttribute('#mailTokenMenu', 'class') || '').includes('hidden');
  assert.equal(dicht, false, 'de kiezer opent niet in een leeg veld');

  await page.keyboard.type('titel');
  await settle();
  await page.keyboard.press('Enter');
  await settle();

  assert.equal(await veld.locator('[data-om-token]').count(), 1, 'geen chip ingevoegd in het lege veld');
  const tekst = await veld.textContent();
  assert.ok(!tekst.includes('/'), 'de getypte "/" staat er nog: ' + tekst);
  // De placeholdertekst mag niet meer door je eigen inhoud heen staan.
  assert.equal(await veld.getAttribute('data-empty'), null, 'data-empty blijft staan met inhoud in het veld');
});

await check('bewaren stuurt het volledige document naar de server', async () => {
  await page.click('[data-action="mail-save"]');
  await settle();
  assert.ok(savedDoc, 'er is niets bewaard');
  assert.ok(Array.isArray(savedDoc.confirmation.blocks) && savedDoc.confirmation.blocks.length > 0, 'bewaard document is leeg');
  assert.equal(await page.textContent('#mailStudioDirty'), '', 'de "niet bewaard"-melding blijft staan');
});

await check('geen JavaScript-fouten tijdens de hele sessie', () => {
  // Mislukte afbeeldingen tellen niet: deze sandbox heeft geen netwerk naar
  // link.openvme.be, en dat zegt niets over de editor.
  const echt = errors.filter((e) => !/Failed to load resource/.test(e));
  assert.deepEqual(echt, [], echt.join(' | '));
});

await browser.close();
console.log(`\n${passed} geslaagd, ${failed} mislukt\n`);
process.exit(failed > 0 ? 1 : 0);
