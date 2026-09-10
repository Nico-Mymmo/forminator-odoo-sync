/**
 * Browsertest voor het tabblad "Formulier" (de formulierbouwer).
 *
 *   npm i -D playwright
 *   node src/modules/forminator-sync-v2/tests/form-builder-ui-test.mjs
 *
 * De bouwer is een canvas-editor: het formulier staat in een iframe met de
 * echte plugin-CSS, je klikt en typt erin, en rechts staat een inspecteur.
 * Wat daar misgaat zit in de KOPPELING tussen canvas, toestand en inspecteur --
 * geen enkele unit-test ziet dat een hertekening je cursor wegneemt of dat een
 * getypt label niet in de payload belandt.
 *
 * De belangrijkste assertie is "typen hertekent het canvas NIET". Die bewaakt
 * de regel die in de maileditor van event-operations-v2 al eens duur betaald
 * is; er staat een merkteken in het iframe dat een hertekening zou wissen.
 *
 * Werkt de lokale browserinstallatie niet, dan kan je hem elders draaien:
 * PW_CHROME wordt als executablePath doorgegeven.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const publicDir = join(hier, '..', '..', '..', '..', 'public');
const lees = (naam) => readFileSync(join(publicDir, naam), 'utf8');

const previewJs = lees('forminator-sync-v2-form-preview.js');
const builderJs = lees('forminator-sync-v2-detail-form-builder.js');
const formsCss = lees('mymmo-forms.css');
const canvasCss = lees('form-builder-canvas.css');

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

const VELDTYPES = [
  { type: 'text', label: 'Tekst', input: true, options: false, multi: false, odoo_type: 'text' },
  { type: 'email', label: 'E-mailadres', input: true, options: false, multi: false, odoo_type: 'text' },
  { type: 'select', label: 'Keuzelijst', input: true, options: true, multi: false, odoo_type: 'selection' },
  { type: 'radio', label: 'Keuzerondjes', input: true, options: true, multi: false, odoo_type: 'selection' },
  { type: 'checkbox', label: 'Vinkje', input: true, options: false, multi: false, odoo_type: 'boolean' },
  { type: 'hidden', label: 'Verborgen veld', input: true, options: false, multi: false, odoo_type: 'text' },
  { type: 'heading', label: 'Tussentitel', input: false, options: false, multi: false, odoo_type: 'text' },
];

const PAGINA = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"></head><body>
<div id="detailFormBuilder"></div>
<script>
  window.__opgeslagen = null;
  window.__bestaandFormulier = null;

  window.FSV2 = {
    esc: function (v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    },
    // S is een OBJECT, geen functie -- zoals in de echte core.js.
    S: { activeId: 'koppeling-1', detail: { integration: { name: 'Offerte technisch beheer' } } },
    showAlert: function (m, t) { window.__laatsteToast = { bericht: m, type: t }; },
    api: async function (pad, opts) {
      if (pad === '/forms/meta') {
        return { data: { field_types: ${JSON.stringify(VELDTYPES)},
                         odoo_field_types: ['text', 'boolean', 'integer', 'float', 'selection', 'many2one'] } };
      }
      if (pad === '/forms/slugify') return { data: { slug: 'offerte-technisch-beheer' } };
      if (pad.endsWith('/form') && (!opts || !opts.method)) return { data: window.__bestaandFormulier };
      if (pad.endsWith('/form') && opts && opts.method === 'PUT') {
        window.__opgeslagen = JSON.parse(opts.body);
        return { data: {
          form: Object.assign({ id: 'form-1', version: 2 }, window.__opgeslagen.form),
          fields: window.__opgeslagen.fields,
          locked_keys: (window.__bestaandFormulier && window.__bestaandFormulier.locked_keys) || [],
          transforms_seeded: 2
        } };
      }
      return { data: null };
    }
  };
</script>
<script>${previewJs}</script>
<script>${builderJs}</script>
<script>
  // De doorgeefluiken zoals ze in forminator-sync-v2-bootstrap.js staan.
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action.indexOf('form-builder-') === 0) {
      window.FSV2.handleFormBuilderAction(btn.dataset.action, btn);
    }
  });
  ['input', 'change'].forEach(function (soort) {
    document.addEventListener(soort, function (event) {
      var el = event.target;
      if (el && el.dataset &&
          (el.dataset.fbChange || el.dataset.fbForm || el.dataset.fbField || el.dataset.fbOptionField)) {
        window.FSV2.handleFormBuilderChange(el, soort);
      }
    });
  });
</script>
</body></html>`;

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

// De pagina wordt via een ECHTE URL geserveerd, niet met setContent(). Reden:
// het voorbeeld staat in een srcdoc-iframe, en daarin worden relatieve URL's
// opgelost tegen de basis-URL van de ouderpagina. Bij setContent() is dat
// about:blank, en dan laadt <link href="/mymmo-forms.css"> nooit -- het
// voorbeeld staat dan zonder opmaak en elke assertie over zichtbaarheid of
// geometrie is zinloos. Dat kostte een halve zoektocht naar een bug die er
// niet was.
await page.route('https://om.test/**', (route) => {
  const pad = new URL(route.request().url()).pathname;
  if (pad === '/mymmo-forms.css') return route.fulfill({ contentType: 'text/css', body: formsCss });
  if (pad === '/form-builder-canvas.css') return route.fulfill({ contentType: 'text/css', body: canvasCss });
  return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA });
});

const consoleFouten = [];
page.on('pageerror', (err) => consoleFouten.push(err.message));

await page.goto('https://om.test/koppelingen');

const canvas = () => page.frameLocator('#fbCanvas');
const wachtCanvas = async () => {
  await page.waitForSelector('#fbCanvas');
  await canvas().locator('.mymmo-form-wrap').waitFor();
};

/** Merkteken in het iframe: verdwijnt zodra het canvas opnieuw opgebouwd wordt. */
const zetMerkteken = () => page.evaluate(() => {
  document.getElementById('fbCanvas').contentDocument.body.dataset.merk = 'x';
});
const merktekenNogAanwezig = () => page.evaluate(() =>
  document.getElementById('fbCanvas').contentDocument.body.dataset.merk === 'x');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nLeeg scherm');

await page.evaluate(() => window.FSV2.renderDetailForm());
await page.waitForSelector('[data-action="form-builder-create"]');
check('een koppeling zonder formulier toont het lege scherm', true);

await page.click('[data-action="form-builder-create"]');
await wachtCanvas();

check('er is een voorbeeld-iframe', await page.locator('#fbCanvas').count() === 1);
check('het voorbeeld gebruikt de echte plugin-CSS, en die is ook toegepast',
  await page.locator('#fbCanvas').evaluate((f) => {
    const d = f.contentDocument;
    const links = [...d.querySelectorAll('link')].map((l) => l.getAttribute('href'));
    const knop = d.querySelector('.mymmo-form-submit');
    // Een gestileerde knop heeft een achtergrond uit mymmo-forms.css; zonder
    // geladen stylesheet is die doorzichtig.
    const achtergrond = knop ? getComputedStyle(knop).backgroundColor : '';
    return links.includes('/mymmo-forms.css')
      && achtergrond !== '' && achtergrond !== 'rgba(0, 0, 0, 0)';
  }),
  'de stylesheet staat wel in de HTML maar is niet toegepast');
check('het nieuwe formulier begint met twee velden', await canvas().locator('[data-om-field]').count() === 2);
check('de naam van de koppeling is voorgevuld',
  (await canvas().locator('.mymmo-form-title').innerText()).includes('Offerte technisch beheer'));
check('de inspecteur toont het formulierpaneel', await page.locator('[data-fb-form="slug"]').count() === 1);

// ───────────────────────────────────────────────────────────────────────────
console.log('\nSelecteren');

await canvas().locator('[data-om-field]').nth(1).click();
await page.waitForSelector('[data-fb-field="field_key"]');

check('klikken selecteert het veld in het canvas',
  (await canvas().locator('[data-om-field]').nth(1).getAttribute('class')).includes('om-geselecteerd'));
check('de inspecteur toont dat veld',
  (await page.inputValue('[data-fb-field="field_key"]')) === 'e_mailadres',
  await page.inputValue('[data-fb-field="field_key"]'));
check('de inspecteur toont het juiste soort veld',
  (await page.locator('[data-fb-change="type"]').inputValue()) === 'email');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nTypen in het voorbeeld');

await zetMerkteken();
const label = canvas().locator('[data-om-field]').nth(1).locator('[data-om-edit="label"]');
await label.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('Je e-mailadres');

check('het canvas wordt NIET opnieuw opgebouwd tijdens het typen', await merktekenNogAanwezig(),
  'de srcdoc is opnieuw gezet — dat gooit de cursor weg');
check('de cursor staat nog in het label dat je bewerkt',
  await page.evaluate(() => {
    const d = document.getElementById('fbCanvas').contentDocument;
    return d.activeElement && d.activeElement.dataset.omEdit === 'label';
  }));
check('het getypte label komt in de toestand terecht',
  (await canvas().locator('[data-om-field]').nth(1).locator('[data-om-edit="label"]').innerText()) === 'Je e-mailadres');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nTypen in de inspecteur');

// De hulptekst typ je OOK in het voorbeeld -- er staat bewust geen tweede
// invoerveld voor in de inspecteur.
await zetMerkteken();
await canvas().locator('[data-om-field]').nth(1).locator('[data-om-edit="help_text"]').click();
await page.keyboard.press('Control+A');
await page.keyboard.type('We gebruiken dit enkel om te antwoorden.');
check('hulptekst typen bouwt het canvas niet opnieuw op', await merktekenNogAanwezig());
check('er staat GEEN tweede invoerveld voor label of hulptekst in de inspecteur',
  (await page.locator('[data-fb-field="label"]').count()) === 0
    && (await page.locator('[data-fb-field="help_text"]').count()) === 0,
  'dat zou het bewerkscherm-naast-het-voorbeeld terugbrengen');

await zetMerkteken();
await page.fill('[data-fb-field="placeholder"]', 'naam@bedrijf.be');
check('de placeholder uit de inspecteur bouwt het canvas niet opnieuw op', await merktekenNogAanwezig());
check('de placeholder verschijnt in het voorbeeld',
  (await canvas().locator('[data-om-field]').nth(1).locator('input').getAttribute('placeholder')) === 'naam@bedrijf.be');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nStructurele wijzigingen');

await page.locator('[data-fb-change="required"]').check();
await wachtCanvas();
check('verplicht toont een sterretje in het voorbeeld',
  await canvas().locator('[data-om-field]').nth(1).locator('.mymmo-form-req').count() === 1);

await page.click('[data-action="form-builder-add-field"][data-type="select"]');
await wachtCanvas();
check('een keuzelijst erbij verschijnt in het voorbeeld',
  await canvas().locator('[data-om-field]').count() === 3);
check('een nieuw keuzeveld is meteen geselecteerd',
  await page.locator('[data-fb-option]').count() === 1);

await canvas().locator('[data-om-field]').nth(2).locator('[data-om-edit="label"]').click();
await page.keyboard.type('Type gebouw');
check('de veldnaam wordt afgeleid uit het label',
  (await page.inputValue('[data-fb-field="field_key"]')) === 'type_gebouw',
  await page.inputValue('[data-fb-field="field_key"]'));

// De opties van een KEUZELIJST zijn native <option>-elementen en dus niet in
// het voorbeeld te bewerken -- dat gaat via de inspecteur. De waarde moet daar
// evengoed afgeleid worden, anders weigert de server het formulier.
await page.locator('[data-fb-option="0"] [data-fb-option-field="label"]').fill('Appartementsgebouw');
check('een keuzelabel in de inspecteur leidt de waarde af',
  (await page.inputValue('[data-fb-option="0"] [data-fb-option-field="value"]')) === 'appartementsgebouw',
  await page.inputValue('[data-fb-option="0"] [data-fb-option-field="value"]'));
check('de keuze verschijnt in het voorbeeld',
  (await canvas().locator('[data-om-field]').nth(2).locator('select').innerText()).includes('Appartementsgebouw'));

// Bij KEUZERONDJES zijn de labels wel gewone tekst, en die typ je in het
// voorbeeld -- ook daar hoort de waarde afgeleid te worden.
await page.click('[data-action="form-builder-add-field"][data-type="radio"]');
await wachtCanvas();
await canvas().locator('[data-om-field]').nth(3).locator('[data-om-edit="option:0"]').click();
await page.keyboard.type('Ja');
check('een keuzelabel in het voorbeeld leidt de waarde af',
  (await page.inputValue('[data-fb-option="0"] [data-fb-option-field="value"]')) === 'ja',
  await page.inputValue('[data-fb-option="0"] [data-fb-option-field="value"]'));

await page.click('[data-action="form-builder-add-option"][data-index="3"]');
await wachtCanvas();
check('een tweede keuze komt erbij', await page.locator('[data-fb-option]').count() === 2);
await canvas().locator('[data-om-field]').nth(3).locator('[data-om-edit="option:1"]').click();
await page.keyboard.type('Nee');
check('ook de tweede keuze krijgt zijn waarde',
  (await page.inputValue('[data-fb-option="1"] [data-fb-option-field="value"]')) === 'nee');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nDe veldnaam met de hand zetten');

// Dit ging in productie mis: het veldnaam-vak accepteerde "Waar kunnen we je
// mee helpen?" zonder morren, en pas bij het opslaan kwam er een foutmelding.
// Erger nog: zodra je het vak aanraakte stopte de naam met het label te volgen,
// dus je hield een halve, ongeldige naam over ("Waar").
await page.click('[data-action="form-builder-add-field"][data-type="text"]');
await wachtCanvas();
const laatste = (await canvas().locator('[data-om-field]').count()) - 1;

await page.fill('[data-fb-field="field_key"]', 'Waar kunnen we je mee helpen?');
check('een getypte veldnaam wordt meteen omgezet naar een geldige',
  /^[a-z][a-z0-9_]*$/.test(await page.inputValue('[data-fb-field="field_key"]')),
  await page.inputValue('[data-fb-field="field_key"]'));

// Het vak verlaten rondt af: het liggende streepje van het vraagteken gaat weg.
await page.locator('[data-fb-field="field_key"]').blur();
check('het vak verlaten haalt het streepje aan het eind weg',
  (await page.inputValue('[data-fb-field="field_key"]')) === 'waar_kunnen_we_je_mee_helpen',
  await page.inputValue('[data-fb-field="field_key"]'));

check('de inspecteur zegt dat de naam niet meer meeloopt',
  (await page.locator('#fbInspector').innerText()).includes('Loopt niet meer mee'));

// Daarna het label typen: de naam mag NIET meer meelopen, want je hebt er zelf
// een gekozen.
await canvas().locator('[data-om-field]').nth(laatste).locator('[data-om-edit="label"]').click();
await page.keyboard.type('Iets anders');
check('een zelfgekozen naam blijft staan als je het label wijzigt',
  (await page.inputValue('[data-fb-field="field_key"]')) === 'waar_kunnen_we_je_mee_helpen');

// En de uitweg: het vak leegmaken zet het meelopen weer aan.
await page.fill('[data-fb-field="field_key"]', '');
check('het vak leegmaken laat de naam weer meelopen met het label',
  (await page.inputValue('[data-fb-field="field_key"]')) === 'iets_anders',
  await page.inputValue('[data-fb-field="field_key"]'));
check('de inspecteur zegt weer dat de naam meeloopt',
  (await page.locator('#fbInspector').innerText()).includes('Volgt het label'));

// Een naam die met een cijfer begint mag tijdens het typen blijven staan --
// anders springt de cursor bij elke toetsaanslag -- maar wordt bij het opslaan
// alsnog geldig gemaakt.
await page.fill('[data-fb-field="field_key"]', '2de_contactpersoon');
await page.evaluate(() => { window.__opgeslagen = null; });
await page.click('[data-action="form-builder-save"]');
await page.waitForFunction(() => window.__opgeslagen !== null);
check('een naam die met een cijfer begint wordt bij het opslaan geldig gemaakt',
  (await page.evaluate(() => window.__opgeslagen)).fields[laatste].field_key === 'veld_2de_contactpersoon',
  JSON.stringify((await page.evaluate(() => window.__opgeslagen)).fields[laatste].field_key));

// Dit veld weer weg, zodat de rest van de test op dezelfde velden blijft rekenen.
await page.click(`[data-action="form-builder-remove-field"][data-index="${laatste}"]`);
await wachtCanvas();

// ───────────────────────────────────────────────────────────────────────────
console.log('\nStijl');

// De stijl hoort bij het FORMULIER, dus eerst het veld deselecteren -- de
// inspecteur toont dan het formulierpaneel.
if (await page.locator('[data-action="form-builder-deselect"]').count()) {
  await page.click('[data-action="form-builder-deselect"]');
}
await page.waitForSelector('[data-action="form-builder-theme"]');
await zetMerkteken();
await page.click('[data-action="form-builder-theme"][data-value="#0f766e"]');
check('een andere accentkleur bouwt het canvas NIET opnieuw op', await merktekenNogAanwezig(),
  'kleur wisselen hoort alleen de CSS-variabelen te vervangen');
check('de accentkleur staat in het voorbeeld',
  (await page.locator('#fbCanvas').evaluate((f) => f.contentDocument.querySelector('style').textContent))
    .includes('--mf-accent:#0f766e'));

// ───────────────────────────────────────────────────────────────────────────
console.log('\nVerslepen');

const eersteVoorSleep = await canvas().locator('[data-om-field]').nth(0).locator('[data-om-edit="label"]').innerText();
await canvas().locator('[data-om-field]').nth(1).locator('.om-greep').hover();
await page.mouse.down();
await canvas().locator('[data-om-field]').nth(0).hover();
await page.mouse.up();
// HTML5-slepen is in Playwright niet altijd betrouwbaar na te bootsen; als de
// muisweg niets deed, doen we de verplaatsing via dezelfde gebeurtenissen die
// de browser zou sturen. De code die getest wordt is in beide gevallen dezelfde.
if ((await canvas().locator('[data-om-field]').nth(0).locator('[data-om-edit="label"]').innerText()) === eersteVoorSleep) {
  await page.evaluate(() => {
    const d = document.getElementById('fbCanvas').contentDocument;
    const van = d.querySelector('[data-om-field="1"]');
    const naar = d.querySelector('[data-om-field="0"]');
    const dt = new DataTransfer();
    van.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = naar.getBoundingClientRect();
    naar.dispatchEvent(new DragEvent('drop', {
      bubbles: true, dataTransfer: dt, clientY: r.top + 2, clientX: r.left + 2,
    }));
  });
}
await wachtCanvas();
check('verslepen wisselt de volgorde in het voorbeeld',
  (await canvas().locator('[data-om-field]').nth(0).locator('[data-om-edit="label"]').innerText()) !== eersteVoorSleep,
  'het eerste veld is niet veranderd');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nOpslaan');

await page.click('[data-action="form-builder-publish"]');
await page.waitForFunction(() => window.__opgeslagen !== null);
const opgeslagen = await page.evaluate(() => window.__opgeslagen);

check('de status gaat mee als published', opgeslagen.form.status === 'published');
check('de naam gaat mee', opgeslagen.form.name === 'Offerte technisch beheer');
check('de accentkleur gaat mee', opgeslagen.form.theme.accent === '#0f766e');
check('alle vier de velden gaan mee', opgeslagen.fields.length === 4, JSON.stringify(opgeslagen.fields.map((f) => f.field_key)));
check('het getypte label staat in de payload',
  opgeslagen.fields.some((f) => f.label === 'Je e-mailadres'),
  JSON.stringify(opgeslagen.fields.map((f) => f.label)));
check('de hulptekst staat in de payload',
  opgeslagen.fields.some((f) => (f.help_text || '').includes('enkel om te antwoorden')),
  JSON.stringify(opgeslagen.fields.map((f) => f.help_text)));
check('verplicht staat als boolean in de payload',
  opgeslagen.fields.some((f) => f.is_required === true));
// Wat hier écht telt: elke keuze heeft een niet-lege WAARDE. Zonder waarde
// gooit validateFormDefinition de optie weg en weigert de server het formulier
// met "minstens een optie" -- een fout die je pas bij het opslaan ziet.
const keuzeVelden = opgeslagen.fields.filter((f) => f.field_type === 'select' || f.field_type === 'radio');
check('beide keuzevelden gaan mee', keuzeVelden.length === 2);
check('elke keuze heeft een waarde en een label',
  keuzeVelden.every((f) => f.options.length > 0 && f.options.every((o) => o.value && o.label)),
  JSON.stringify(keuzeVelden.map((f) => f.options)));
check('de interne vlaggen zitten NIET in de payload',
  !JSON.stringify(opgeslagen).includes('_auto'),
  'een interne vlag lekt naar de server');
check('de toast vertelt over de veldtransformaties',
  (await page.evaluate(() => window.__laatsteToast?.bericht || '')).includes('2 veldtype'));

// ───────────────────────────────────────────────────────────────────────────
console.log('\nSleutels op slot');

await page.evaluate(() => {
  window.__bestaandFormulier = {
    form: {
      id: 'form-1', slug: 'offerte', name: 'Offerte', status: 'published', version: 5,
      submit_label: 'Versturen', success_mode: 'message', success_message: 'Bedankt!',
      redirect_url: null, theme: {}, allowed_sites: [],
    },
    fields: [
      { field_key: 'email', field_type: 'email', label: 'E-mailadres', is_required: true, options: [], validation: {}, width: 'full', odoo_field_type: 'text' },
      { field_key: 'nieuw', field_type: 'text', label: 'Nieuw veld', is_required: false, options: [], validation: {}, width: 'full', odoo_field_type: 'text' },
    ],
    locked_keys: ['email'],
  };
  return window.FSV2.renderDetailForm();
});
await wachtCanvas();

await canvas().locator('[data-om-field]').nth(0).click();
await page.waitForSelector('[data-fb-field="field_key"]');
check('een sleutel met inzendingen staat op slot', await page.locator('[data-fb-field="field_key"]').isDisabled());
check('het slot legt uit waarom',
  (await page.locator('#fbInspector').innerText()).includes('inzendingen'));

await page.evaluate(() => { window.__laatsteToast = null; });
await page.click('[data-action="form-builder-remove-field"]');
await page.waitForTimeout(60);
check('een veld op slot verwijderen wordt geweigerd met uitleg',
  (await page.evaluate(() => window.__laatsteToast?.type)) === 'error'
    && (await canvas().locator('[data-om-field]').count()) === 2);

await canvas().locator('[data-om-field]').nth(1).click();
await page.waitForSelector('[data-fb-field="field_key"]');
check('een sleutel zonder inzendingen blijft bewerkbaar', await page.locator('[data-fb-field="field_key"]').isEnabled());

await page.evaluate(() => { window.__opgeslagen = null; });
await page.click('[data-action="form-builder-save"]');
await page.waitForFunction(() => window.__opgeslagen !== null);
check('de sleutel op slot blijft behouden bij het opslaan',
  (await page.evaluate(() => window.__opgeslagen)).fields[0].field_key === 'email');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nMeertalig: de taalbalk');

await page.evaluate(() => {
  window.__bestaandFormulier = {
    form: {
      id: 'form-2', slug: 'contact', name: 'Contact', status: 'draft', version: 1,
      submit_label: 'Versturen', success_mode: 'message', success_message: 'Bedankt!',
      redirect_url: null, theme: {}, allowed_sites: [],
      languages: ['nl'], default_language: 'nl', i18n: {},
    },
    fields: [
      { field_key: 'naam', field_type: 'text', label: 'Naam', is_required: true, options: [], validation: {}, width: 'full', odoo_field_type: 'text', i18n: {} },
      { field_key: 'type', field_type: 'select', label: 'Type gebouw', is_required: true, width: 'full', validation: {}, odoo_field_type: 'selection', i18n: {},
        options: [{ value: 'appartement', label: 'Appartement' }, { value: 'huis', label: 'Huis' }] },
    ],
    locked_keys: [],
  };
  return window.FSV2.renderDetailForm();
});
await wachtCanvas();

check('bij één taal staat er geen taalbalk',
  (await page.locator('[data-action="form-builder-lang"]').count()) === 0,
  'een tabblad waar niets naast staat is ruis');

// Frans aanzetten via het formulierpaneel.
await page.check('[data-fb-change="language"][data-lang="fr"]');
await wachtCanvas();

check('de taalbalk verschijnt zodra er een tweede taal is',
  (await page.locator('[data-action="form-builder-lang"]').count()) === 2);
check('de basistaal is als zodanig gemarkeerd',
  (await page.locator('[data-action="form-builder-lang"][data-lang="nl"]').innerText()).includes('basis'));
check('de nieuwe taal toont hoeveel er nog te doen is',
  (await page.locator('[data-action="form-builder-lang"][data-lang="fr"] .badge').count()) === 1,
  'anders zie je pas bij het publiceren dat er iets ontbreekt');
check('de basistaal kan niet uitgezet worden',
  await page.locator('[data-fb-change="language"][data-lang="nl"]').isDisabled());

// ───────────────────────────────────────────────────────────────────────────
console.log('\nMeertalig: vertalen in het canvas');

await page.click('[data-action="form-builder-lang"][data-lang="fr"]');
await wachtCanvas();

const frLabel = canvas().locator('[data-om-field]').nth(0).locator('[data-om-edit="label"]');
check('een nog niet vertaald label staat LEEG in de vertaaltaal',
  (await frLabel.innerText()).trim() === '',
  'anders lijkt het vertaald terwijl er Nederlands staat');
check('de originele tekst staat als grijze aanwijzing in het veld',
  (await frLabel.getAttribute('data-om-leeg')) === 'Naam',
  'zo zie je wát je moet vertalen in plaats van het woord "Label"');

await frLabel.click();
await frLabel.type('Nom');
await page.waitForTimeout(60);

await page.evaluate(() => { window.__opgeslagen = null; });
await page.click('[data-action="form-builder-save"]');
await page.waitForFunction(() => window.__opgeslagen !== null);
const bewaard = await page.evaluate(() => window.__opgeslagen);

check('het Nederlandse label is ONGEWIJZIGD gebleven',
  bewaard.fields[0].label === 'Naam',
  'typen in een vertaling mag het origineel nooit overschrijven');
check('de Franse vertaling staat in i18n',
  bewaard.fields[0].i18n.fr.label === 'Nom');
check('de veldnaam is niet meegelopen met het Franse label',
  bewaard.fields[0].field_key === 'naam',
  'de veldnaam is de linkerkant van een mapping naar Odoo en hoort in elke taal dezelfde te zijn');
check('de talen staan op het formulier',
  JSON.stringify(bewaard.form.languages) === '["nl","fr"]'
  && bewaard.form.default_language === 'nl');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nMeertalig: wat NIET vertaalbaar is');

await canvas().locator('[data-om-field]').nth(1).click();
await page.waitForSelector('#fbInspector [data-fb-option]');

check('de veldnaam ligt vast in een vertaling',
  await page.locator('[data-fb-field="field_key"]').isDisabled());
check('en de uitleg zegt waarom',
  (await page.locator('#fbInspector').innerText()).includes('alle talen dezelfde'));
check('de keuzeWAARDE ligt vast in een vertaling',
  await page.locator('[data-fb-option="0"] [data-fb-option-field="value"]').isDisabled(),
  'die waarde gaat naar Odoo; vertaal je hem, dan heb je per taal een aparte mapping nodig');
check('het keuzeLABEL blijft wel bewerkbaar',
  await page.locator('[data-fb-option="0"] [data-fb-option-field="label"]').isEnabled());
check('de slug staat niet in een vertaling',
  (await page.locator('[data-fb-form="slug"]').count()) === 0,
  'de slug staat in de shortcode en is voor alle talen dezelfde');

await page.fill('[data-fb-option="0"] [data-fb-option-field="label"]', 'Appartement FR');
await page.evaluate(() => { window.__opgeslagen = null; });
await page.click('[data-action="form-builder-save"]');
await page.waitForFunction(() => window.__opgeslagen !== null);
const bewaard2 = await page.evaluate(() => window.__opgeslagen);

check('het vertaalde optielabel hangt aan de WAARDE',
  bewaard2.fields[1].i18n.fr.options.appartement === 'Appartement FR',
  'op de waarde en niet op een index: opties herschikken mag de vertaling niet door elkaar gooien');
check('de optiewaarde zelf is onveranderd',
  bewaard2.fields[1].options[0].value === 'appartement');
check('het Nederlandse optielabel is onveranderd',
  bewaard2.fields[1].options[0].label === 'Appartement');

// ───────────────────────────────────────────────────────────────────────────
console.log('\nMeertalig: terug naar de basistaal');

await page.click('[data-action="form-builder-lang"][data-lang="nl"]');
await wachtCanvas();

check('het Nederlandse label staat er gewoon weer',
  (await canvas().locator('[data-om-field]').nth(0).locator('[data-om-edit="label"]').innerText()).trim() === 'Naam');
check('de veldnaam is hier wél bewerkbaar',
  await (async () => {
    await canvas().locator('[data-om-field]').nth(0).click();
    await page.waitForSelector('[data-fb-field="field_key"]');
    return page.locator('[data-fb-field="field_key"]').isEnabled();
  })());
// De slug staat op het FORMULIERpaneel, en dat zie je pas als er geen veld
// geselecteerd is -- de regel hierboven klikte er net een aan.
await page.click('[data-action="form-builder-deselect"]');
await page.waitForTimeout(60);
check('en de slug staat er weer',
  (await page.locator('[data-fb-form="slug"]').count()) === 1);

check('geen JavaScript-fouten op de pagina', consoleFouten.length === 0, consoleFouten.join(' | '));

await browser.close();

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
