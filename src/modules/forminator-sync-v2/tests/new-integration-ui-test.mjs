/**
 * Browsertest voor de dialoog "Nieuwe koppeling".
 *
 *   npm i -D playwright
 *   node src/modules/forminator-sync-v2/tests/new-integration-ui-test.mjs
 *
 * Deze dialoog vervangt de driestappenwizard als ingang. Wat hier misgaat is
 * bedrading, niet rekenwerk: een payload met het verkeerde source_type, een
 * tabblad dat niet bestaat, of een naam die verdwijnt als je van soort wisselt.
 * Geen van die drie is met een unit-test te zien.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const publicDir = join(hier, '..', '..', '..', '..', 'public');
const dialoogJs = readFileSync(join(publicDir, 'forminator-sync-v2-new-integration.js'), 'utf8');

let geslaagd = 0;
let gefaald = 0;

function check(naam, ok, uitleg = '') {
  if (ok) {
    geslaagd += 1;
    console.log(`  ✓ ${naam}`);
  } else {
    gefaald += 1;
    console.error(`  ✗ ${naam}${uitleg ? `\n    ${uitleg}` : ''}`);
  }
}

// De dialoog en de tabknoppen zoals ze in forminator-sync-v2.html staan, plus
// het doorgeefluik uit -bootstrap.js.
const PAGINA = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"></head><body>
<div role="tablist" id="detailTabBar">
  <button role="tab" data-detail-tab="fields">Formuliervelden</button>
  <button role="tab" data-detail-tab="form">Formulier</button>
  <button role="tab" data-detail-tab="mapping">Koppeling</button>
  <button role="tab" data-detail-tab="history">Indieningen</button>
  <button role="tab" data-detail-tab="stats" id="detailTabStatsBtn">Statistieken</button>
</div>

<dialog id="newIntegrationDialog">
  <div>
    <div id="newIntegrationBody"></div>
    <button type="button" data-action="goto-wizard-legacy">Bestaand Forminator-formulier</button>
    <button id="niCreateBtn" type="button" data-action="new-integration-create">Aanmaken</button>
  </div>
</dialog>

<script>
  window.__aangemaakt = null;
  window.__geopendDetail = null;
  window.__geklikteTab = null;
  window.__lijstHerladen = 0;

  window.FSV2 = {
    esc: function (v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    },
    S: { activeId: null, detail: null },
    showAlert: function (m, t) { window.__laatsteToast = { bericht: m, type: t }; },
    loadIntegrations: async function () { window.__lijstHerladen += 1; },
    openDetail: async function (id) { window.__geopendDetail = id; window.FSV2.S.activeId = id; },
    api: async function (pad, opts) {
      if (pad === '/integrations' && opts && opts.method === 'POST') {
        window.__aangemaakt = JSON.parse(opts.body);
        return { data: { id: 'nieuwe-koppeling-1' } };
      }
      return { data: null };
    }
  };
</script>
<script>${dialoogJs}</script>
<script>
  // Het doorgeefluik zoals het in forminator-sync-v2-bootstrap.js staat.
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action.indexOf('new-integration-') === 0) {
      if (window.FSV2.handleNewIntegrationAction) window.FSV2.handleNewIntegrationAction(action, btn);
      return;
    }
  });
  // Onthouden welk tabblad de dialoog aanklikt.
  document.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-detail-tab]');
    if (tab) window.__geklikteTab = tab.dataset.detailTab;
  });
</script>
</body></html>`;

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const page = await browser.newPage();

const consoleFouten = [];
page.on('pageerror', (err) => consoleFouten.push(err.message));

await page.setContent(PAGINA);

const reset = async () => {
  await page.evaluate(() => {
    window.__aangemaakt = null;
    window.__geopendDetail = null;
    window.__geklikteTab = null;
    window.__laatsteToast = null;
    window.FSV2.openNewIntegrationDialog();
  });
  await page.waitForSelector('#niName');
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\nDe keuze');

await reset();

check('er zijn precies drie soorten', await page.locator('[data-action="new-integration-pick"]').count() === 3);
check(
  'formulier staat standaard geselecteerd',
  (await page.locator('[data-action="new-integration-pick"][data-kind="form"]').getAttribute('class')).includes('border-primary')
);
check('bij formulier is er geen doel-URL-veld', await page.locator('#niDestination').count() === 0);

await page.fill('#niName', 'Offerte technisch beheer');
await page.click('[data-action="new-integration-pick"][data-kind="tracker"]');
await page.waitForSelector('#niDestination');

check('trackbare link vraagt wel een doel-URL', await page.locator('#niDestination').count() === 1);
check(
  'de naam blijft staan als je van soort wisselt',
  (await page.inputValue('#niName')) === 'Offerte technisch beheer',
  'de naam werd gewist bij het wisselen'
);

// ───────────────────────────────────────────────────────────────────────────
console.log('\nValidatie');

await page.fill('#niDestination', 'http://openvme.be/events/');
await page.click('[data-action="new-integration-create"]');
await page.waitForTimeout(80);
check(
  'een doel-URL zonder https wordt geweigerd',
  (await page.evaluate(() => window.__aangemaakt)) === null
    && (await page.evaluate(() => window.__laatsteToast?.type)) === 'error'
);

await reset();
await page.click('[data-action="new-integration-create"]');
await page.waitForTimeout(80);
check(
  'aanmaken zonder naam wordt geweigerd',
  (await page.evaluate(() => window.__aangemaakt)) === null
    && (await page.evaluate(() => window.__laatsteToast?.bericht || '')).includes('naam')
);

// ───────────────────────────────────────────────────────────────────────────
console.log('\nFormulier aanmaken');

await reset();
await page.fill('#niName', 'Offerte technisch beheer');
await page.click('[data-action="new-integration-create"]');
await page.waitForFunction(() => window.__aangemaakt !== null);

let payload = await page.evaluate(() => window.__aangemaakt);
check('source_type is om_form', payload.source_type === 'om_form', JSON.stringify(payload));
check('de naam gaat mee', payload.name === 'Offerte technisch beheer');
check('er gaat een odoo_connection_id mee', payload.odoo_connection_id === 'default');
check('er wordt GEEN forminator_form_id meegestuurd', payload.forminator_form_id === undefined,
  'die maakt de server; hem hier verzinnen zou twee bronnen van waarheid geven');
check('de lijst wordt herladen', (await page.evaluate(() => window.__lijstHerladen)) > 0);
check('het detailscherm van de nieuwe koppeling opent', (await page.evaluate(() => window.__geopendDetail)) === 'nieuwe-koppeling-1');
check('het tabblad Formulier wordt geopend', (await page.evaluate(() => window.__geklikteTab)) === 'form');
check('de dialoog sluit', !(await page.locator('#newIntegrationDialog').evaluate((d) => d.open)));

// ───────────────────────────────────────────────────────────────────────────
console.log('\nWebhook aanmaken');

await reset();
await page.click('[data-action="new-integration-pick"][data-kind="webhook"]');
await page.fill('#niName', 'Meta leads');
await page.click('[data-action="new-integration-create"]');
await page.waitForFunction(() => window.__aangemaakt !== null);

payload = await page.evaluate(() => window.__aangemaakt);
check('source_type is generic_webhook', payload.source_type === 'generic_webhook');
check('geen webhook_token vanuit de client', payload.webhook_token === undefined);
check('landt op het tabblad Formuliervelden', (await page.evaluate(() => window.__geklikteTab)) === 'fields');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nTrackbare link aanmaken');

await reset();
await page.click('[data-action="new-integration-pick"][data-kind="tracker"]');
await page.fill('#niName', 'QR beurspanelen');
await page.fill('#niDestination', 'https://openvme.be/events/');
await page.click('[data-action="new-integration-create"]');
await page.waitForFunction(() => window.__aangemaakt !== null);

payload = await page.evaluate(() => window.__aangemaakt);
check('source_type is tracker', payload.source_type === 'tracker');
check('de doel-URL gaat mee', payload.destination_url === 'https://openvme.be/events/');
check(
  'een tracker krijgt GEEN odoo_connection_id',
  payload.odoo_connection_id === undefined,
  'een tracker schrijft niets naar Odoo'
);
check('landt op het tabblad Statistieken', (await page.evaluate(() => window.__geklikteTab)) === 'stats');

check('geen JavaScript-fouten op de pagina', consoleFouten.length === 0, consoleFouten.join(' | '));

await browser.close();

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
