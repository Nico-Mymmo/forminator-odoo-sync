/**
 * Toont de indieningenlijst de waarden van een OM-formulier?
 *
 *   node src/modules/forminator-sync-v2/tests/submissions-list-test.mjs
 *
 * Twee dingen worden hier bewaakt, allebei uit hetzelfde scherm:
 *
 *  1. DE PLATSLAG. Een Forminator-inzending heeft haar velden bovenaan in
 *     source_payload; een inzending van een OM-formulier heeft ze een niveau
 *     dieper, onder form_data. De lijst keek alleen naar het bovenste niveau,
 *     dus elke kolom toonde een streepje terwijl alle waarden gewoon in de
 *     payload zaten — en de samenvattingsregel onder de rij zei letterlijk
 *     "form_data: [object Object]".
 *
 *  2. DE STATUS 'received'. Die betekent: bewaard, maar de pipeline is
 *     overgeslagen omdat de koppeling uit stond. Een bewuste veiligheidsklep,
 *     maar hij stond niet in de statustabel en kreeg dus een naamloos grijs
 *     bolletje plus een lege "{}" bij de uitgaande context. Dat leest als een
 *     storing terwijl er niets stuk is.
 *
 * Playwright nodig; zonder slaat de test zichzelf over. PW_CHROME wordt als
 * executablePath doorgegeven.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const publicDir = join(hier, '..', '..', '..', '..', 'public');
const bron = readFileSync(join(publicDir, 'forminator-sync-v2-detail-submissions-tab.js'), 'utf8');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.log('\nOvergeslagen: playwright niet geïnstalleerd (npm i -D playwright).\n');
  process.exit(0);
}

let geslaagd = 0;
let gefaald = 0;

function check(naam, ok, uitleg = '') {
  if (ok) { geslaagd += 1; console.log(`  ✓ ${naam}`); }
  else { gefaald += 1; console.error(`  ✗ ${naam}${uitleg ? `\n    ${uitleg}` : ''}`); }
}

// ── Een echte OM-payload: velden onder form_data, omhulsel erbovenop ────────

const OM_SUBMISSION = {
  id: 'a6433666-fd0d-4471-a429-58c6849b60ea',
  status: 'received',
  created_at: '2026-09-10T20:29:23+00:00',
  resolved_context: {},
  last_error: null,
  replay_of_submission_id: null,
  source_payload: {
    form_id: 'a6433666-fd0d-4471-a429-58c6849b60ea',
    form_name: 'We nemen contact met je op!!',
    form_slug: 'test-contact-openvme',
    form_version: 10,
    form_data: {
      naam: 'Nico Plinke',
      e_mailadres: 'nico+test@mymmo.com',
      telefoonnummer: '456789',
      postcode: '2000',
      waar_kunnen_we_je_mee_helpen: 'jhsqkjd1q',
      meta_site: 'openvme',
      meta_lang: 'nl',
      meta_page_url: 'https://openvme.be/test-openvme-vertalingen/',
      meta_ovme_uuid: 'b39e1509-2d4f-4cf1-956d-f5cb3b5382d2',
      meta_form_slug: 'test-contact-openvme',
    },
  },
};

// Een Forminator-inzending: velden BOVENAAN. Die mag niet stukgaan door de
// platslag — dat is het bestaande gedrag dat blijven moet.
const FORMINATOR_SUBMISSION = {
  id: 'ffffffff-0000-0000-0000-000000000001',
  status: 'success',
  created_at: '2026-09-09T10:00:00+00:00',
  resolved_context: { target_actions: [] },
  last_error: null,
  replay_of_submission_id: null,
  source_payload: {
    'name-1': 'Jan Janssens',
    'email-1': 'jan@example.be',
  },
};

const VELD_META = {
  naam:                        { show_in_list: true },
  e_mailadres:                 { show_in_list: true },
  telefoonnummer:              { show_in_list: true },
  postcode:                    { show_in_list: true },
  waar_kunnen_we_je_mee_helpen:{ show_in_list: true },
  meta_page_url:               { show_in_list: true },
  'name-1':                    { show_in_list: true },
};

const FORM_FIELDS = [
  { field_id: 'naam', label: 'Naam', type: 'text' },
  { field_id: 'e_mailadres', label: 'E-mailadres', type: 'email' },
  { field_id: 'telefoonnummer', label: 'Telefoonnummer', type: 'tel' },
  { field_id: 'postcode', label: 'Postcode', type: 'text' },
  { field_id: 'waar_kunnen_we_je_mee_helpen', label: 'Waar kunnen we je mee helpen?', type: 'textarea' },
  { field_id: 'meta_page_url', label: 'Pagina-URL', type: 'text', is_meta: true },
  { field_id: 'name-1', label: 'Naam (Forminator)', type: 'text' },
];

const browser = await chromium.launch(
  process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}
);
// Een vaste, eerder KRAPPE breedte: het detailpaneel van de OM is smaller dan
// het scherm, en juist daar liep de tabel over de rand.
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

const consoleFouten = [];
page.on('pageerror', (e) => consoleFouten.push(String(e.message)));

await page.route('https://om.test/', (route) => route.fulfill({
  contentType: 'text/html; charset=utf-8',
  body: `<!doctype html><html lang="nl"><head><meta charset="utf-8">
    <style>
      /* Geen Tailwind of daisyUI in deze test: die komen van een CDN en dat maakt
         een test traag en afhankelijk van het netwerk. In de plaats staan hier de
         handvol utility-klassen waarop de tabelindeling steunt, met precies de
         betekenis die Tailwind eraan geeft.

         Zonder deze shim doet class="table-fixed" niets, valt de tabel terug op
         auto-layout, en meet de breedtecontrole hieronder iets anders dan wat een
         gebruiker ziet -- ze zou dan groen zijn om de verkeerde reden. */
      * { box-sizing: border-box; }
      body { margin: 0; font-size: 14px; font-family: sans-serif; }
      table { border-collapse: collapse; }
      th, td { padding: 2px 6px; text-align: left; vertical-align: top; }
      .w-full { width: 100%; }
      .table-fixed { table-layout: fixed; }
      .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .whitespace-nowrap { white-space: nowrap; }
      .break-words { overflow-wrap: break-word; }
      .overflow-x-auto { overflow-x: auto; }
      .sticky { position: sticky; }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .text-xs { font-size: 12px; }
      .leading-tight { line-height: 1.25; }
      .align-bottom { vertical-align: bottom; }
    </style>
    </head><body>
    <div id="detailHistory"></div>
    <script>
      window.FSV2 = {
        esc: function (v) {
          return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        },
        fmt: function (d) { return String(d || ''); },
        shortId: function (id) { return String(id || '').slice(0, 8); },
        showAlert: function () {},
        openDetail: function () {},
        api: async function () { return { data: null }; },
        S: {
          activeId: 'koppeling-1',
          detail: { integration: { id: 'koppeling-1', source_type: 'om_form', is_active: false }, targets: [] },
          submissions: ${JSON.stringify([OM_SUBMISSION, FORMINATOR_SUBMISSION])},
          detailFormFields: ${JSON.stringify(FORM_FIELDS)},
          _fieldMeta: ${JSON.stringify(VELD_META)},
          mailEventsBySubmission: {},
        }
      };
    </script>
    <script>${bron}</script>
    <script>window.FSV2.renderDetailSubmissions();</script>
  </body></html>`,
}));

await page.goto('https://om.test/');

// Bewust de innerHTML van HET ELEMENT en niet page.content(): die laatste bevat
// ook de ingesloten broncode van het bestand zelf, inclusief de commentaren
// erin. Een assertie als "[object Object]" komt nergens voor" wordt dan rood op
// een zin in een codecommentaar.
const html = await page.innerHTML('#detailHistory');
const tekst = await page.innerText('#detailHistory');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDe waarden van een OM-formulier staan in de lijst');

check('de naam staat er', tekst.includes('Nico Plinke'),
  'dit was de bug: elke kolom toonde een streepje terwijl de waarde in form_data zat');
check('het e-mailadres staat er', tekst.includes('nico+test@mymmo.com'));
check('het telefoonnummer staat er', tekst.includes('456789'));
check('de postcode staat er', tekst.includes('2000'));
check('het lange tekstveld staat er', tekst.includes('jhsqkjd1q'));
check('een herkomstveld staat er ook',
  tekst.includes('openvme.be/test-openvme-vertalingen'),
  'meta_page_url zit net zo goed in form_data');

const rijTekst = tekst.split('\n').join(' ');
check('er staat geen streepje meer waar een waarde hoort',
  !/Nico Plinke.*—.*nico\+test/.test(rijTekst));

console.log('\nHet omhulsel zelf is geen waarde');

check('"[object Object]" staat nergens',
  !html.includes('[object Object]'),
  'de samenvattingsregel toonde letterlijk "form_data: [object Object]"');
check('form_data staat niet als veld in de samenvatting',
  !/form_data:/.test(tekst));

console.log('\nEen Forminator-inzending blijft werken');

check('velden bovenaan de payload worden nog steeds gevonden',
  tekst.includes('Jan Janssens'),
  'de platslag mag het bestaande gedrag niet breken');

console.log('\nDe status "received" legt zichzelf uit');

check('het bolletje heeft een leesbare naam',
  html.includes('Bewaard — koppeling staat uit'),
  'anders is het een naamloos grijs bolletje en lijkt er iets stuk');
check('de ruwe status staat niet als label in beeld',
  !/title="received"/.test(html));

// De uitleg zit in de uitklaprij; die staat er wel, maar verborgen.
check('de uitklaprij legt uit waarom er niets naar Odoo ging',
  html.includes('Deze koppeling staat uit'));
check('en vertelt wat je eraan doet',
  html.includes('Replay'),
  'een uitleg zonder volgende stap laat je alsnog zoeken');
check('de lege context krijgt een reden mee',
  html.includes('Leeg omdat de koppeling uit stond'),
  'een kale "{}" laat je raden of er iets stukging of dat er niets te sturen viel');

console.log('\nDe Replay-knop');

check('een inzending met status "received" krijgt een Replay-knop',
  (await page.locator('[title="Replay"], [title^="Zet eerst de koppeling"]').count()) === 1,
  'de uitleg verwees naar Replay terwijl er geen knop stond');

check('zolang de koppeling uit staat, is de knop uitgeschakeld met de reden erin',
  (await page.locator('[title^="Zet eerst de koppeling"]').count()) === 1,
  'anders druk je erop en kom je opnieuw op "received" uit');

check('een geslaagde inzending krijgt geen Replay-knop',
  (await page.locator('tbody tr').nth(2).locator('[data-action="replay-submission"]').count()) === 0);

// Nu met een AANGEZETTE koppeling: dan moet de knop echt indrukbaar zijn.
await page.evaluate(() => {
  window.FSV2.S.detail.integration.is_active = true;
  window.FSV2.renderDetailSubmissions();
});

check('met de koppeling aan is de knop wél indrukbaar',
  (await page.locator('[data-action="replay-submission"]').count()) === 1
  && (await page.locator('[title^="Zet eerst de koppeling"]').count()) === 0);

await page.evaluate(() => {
  window.FSV2.S.detail.integration.is_active = false;
  window.FSV2.renderDetailSubmissions();
});

console.log('\nDe tabel past binnen het scherm');

const maten = await page.evaluate(() => {
  const wikkel = document.querySelector('#detailHistory .overflow-x-auto');
  const tabel = document.querySelector('#detailHistory table');
  return {
    wikkelZichtbaar: wikkel.clientWidth,
    wikkelInhoud: wikkel.scrollWidth,
    tabelBreedte: tabel.getBoundingClientRect().width,
    body: document.body.clientWidth,
  };
});

check('er is geen horizontale scrollbalk',
  maten.wikkelInhoud <= maten.wikkelZichtbaar + 1,
  `inhoud ${maten.wikkelInhoud}px in een vak van ${maten.wikkelZichtbaar}px`);

check('de tabel is niet breder dan de pagina',
  maten.tabelBreedte <= maten.body + 1,
  `tabel ${maten.tabelBreedte}px, pagina ${maten.body}px`);

check('een lange waarde wordt afgekapt in plaats van de kolom op te rekken',
  (await page.locator('td .truncate').first().count()) === 1);

check('de volledige waarde blijft leesbaar via de tooltip',
  (await page.locator('td [title="nico+test@mymmo.com"]').count()) === 1,
  'afkappen zonder title maakt de waarde onbereikbaar zonder de rij open te klappen');

// Ook bij een smal scherm mag ze niet overlopen.
await page.setViewportSize({ width: 800, height: 900 });
await page.evaluate(() => window.FSV2.renderDetailSubmissions());
const smal = await page.evaluate(() => {
  const w = document.querySelector('#detailHistory .overflow-x-auto');
  return { zichtbaar: w.clientWidth, inhoud: w.scrollWidth };
});
check('ook op een smal scherm past de tabel',
  smal.inhoud <= smal.zichtbaar + 1,
  `inhoud ${smal.inhoud}px in een vak van ${smal.zichtbaar}px`);

check('geen JavaScript-fouten', consoleFouten.length === 0, consoleFouten.join(' | '));

await browser.close();

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
