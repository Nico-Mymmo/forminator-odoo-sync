/**
 * Event Operations v2 — Browsertest van de communicatie-studio
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node src/modules/event-operations-v2/tests/mail-studio-ui-test.mjs
 *
 * Draait de ECHTE public/events-v2-mail-studio.js in Chromium, met de echte
 * dialoog-markup uit events-v2.html en een nagebootste API die de ECHTE
 * renderer en resolveSection() gebruikt. Zo loopt het hele pad mee: openen,
 * voorbeeld, klikken, typen, blok toevoegen, verwijderen, header per bedrijf,
 * splitsen/samenvoegen, en bewaren.
 *
 * WAAROM DIT BESTAAT. Er zijn bugs in productie geraakt die geen enkele
 * unit-test kon zien, omdat ze in de KOPPELING zaten en niet in een functie:
 *   1. de client testte op `<t` terwijl de mail met `<table` begint, dus het
 *      voorbeeld toonde altijd de "leeg"-tekst;
 *   2. de route gaf `editable` mee, maar renderMailForRegistration nam het
 *      niet aan -- geen enkele marker in de HTML, dus niets aanklikbaar;
 *   3. de stand "beide sites" gaf `null` door, wat voor de renderer "site
 *      onbekend" betekent, waardoor de site-specifieke header juist in de
 *      bewerkstand onzichtbaar was.
 *
 * Breid deze test uit bij elke wijziging aan de studio. Zonder playwright
 * geïnstalleerd slaat hij zichzelf over in plaats van te falen.
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
const pageHtml = readFileSync(new URL('../../../../public/events-v2.html', import.meta.url), 'utf8');

// Alleen de dialogen van de studio uit de pagina halen.
const dialogs = [...pageHtml.matchAll(/<dialog id="(mailStudioDialog|mailBlockPicker|mailBlockSettings|mailVideoPicker|mailHeaderDialog)"[\s\S]*?<\/dialog>/g)]
  .map((m) => m[0])
  .join('\n');
assert.ok(dialogs.includes('mailStudioDialog'), 'dialoog-markup niet gevonden in events-v2.html');
assert.ok(dialogs.includes('mailVideoBar'), 'mailVideoBar ontbreekt in de markup');
assert.ok(dialogs.includes('mailEmptyState'), 'mailEmptyState ontbreekt in de markup');

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
  const ctx = buildPlaceholderContext({
    event: EVENT,
    registration: { id: 1, name: 'Jan Peeters', submitted_email: 'j@e.com', site: body.site, state: 'registered' },
    host: { email: 'rob@mymmo.com', jobTitle: 'CX Hero', avatarUrl: 'https://mymmo.odoo.com/web/image/1' }
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
await page.setContent(`<!doctype html><html><body>
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
      data = { kinds: ['confirmation','reminder','recap'], block_types: [], sites: ['openvme','syndicoach','other'],
               placeholders: ['event.title','registration.first_name'], vimeo_configured: false, starter: window.__starter };
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
    } else if (url.indexOf('/vimeo/videos') !== -1) {
      data = { configured: false, videos: [] };
    } else { data = {}; }
    return { ok: true, status: 200, json: async function () { return { success: true, data: data }; } };
  };`
});
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
