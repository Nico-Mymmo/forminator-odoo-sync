/**
 * Krijgt een bezoeker onze foutmeldingen, of die van zijn browser?
 *
 *   node src/modules/forminator-sync-v2/tests/form-validation-ui-test.mjs
 *
 * Dit is de test die hoort bij het probleem waarmee dit werk begon: op een
 * Nederlands formulier verscheen "Please fill out this field." Die tekst komt
 * van de BROWSER, en volgt de taal van de browser -- niet die van de pagina.
 * Een Franstalige bezoeker met een Engelse Chrome kreeg dus Engels te lezen op
 * een Nederlands formulier, en er was geen enkele manier om daar iets aan te
 * doen, want die ballon is niet te stylen, niet te vertalen en niet te
 * verplaatsen.
 *
 * De oplossing is `novalidate` op het formulier plus eigen meldingen. De valkuil
 * daarbij is subtiel: `novalidate` alleen is NIET genoeg. Zolang er ergens een
 * `reportValidity()` staat, roept de pagina die ballon alsnog zelf op. Dat was
 * precies wat er gebeurde. Vandaar dat deze test een spion op
 * `reportValidity` zet: zodra iemand die aanroep terugzet, wordt hij rood.
 *
 * De test rendert het ECHTE formulier met PHP (dezelfde template die een
 * bezoeker krijgt), laadt het in een browser met de echte plugin-JS en CSS, en
 * kijkt wat er gebeurt als je op verzenden drukt.
 *
 * PHP en Playwright nodig; zonder een van beide slaat de test zichzelf over in
 * plaats van rood te worden. PW_CHROME wordt als executablePath doorgegeven.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const wortel = join(hier, '..', '..', '..', '..');
const pluginDir = join(wortel, 'wp-plugin', 'mymmo-forms');

let phpVersie;
try {
  phpVersie = execFileSync('php', ['-v'], { encoding: 'utf8' }).split('\n')[0];
} catch (_) {
  console.log('\nOvergeslagen: geen PHP-CLI gevonden.\n');
  process.exit(0);
}

if (!existsSync(join(pluginDir, 'templates', 'form.php'))) {
  console.log('\nOvergeslagen: wp-plugin/mymmo-forms/templates/form.php niet gevonden.\n');
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (_) {
  console.log('\nOvergeslagen: playwright niet geïnstalleerd (npm i -D playwright).\n');
  process.exit(0);
}

console.log(`\nPHP: ${phpVersie}`);

// ─────────────────────────────────────────────────────────────────────────────
// Het proefformulier: tweetalig, met precies de veldsoorten waar de browser
// zijn eigen melding voor heeft (leeg verplicht veld, ongeldig e-mailadres,
// getal buiten bereik).
// ─────────────────────────────────────────────────────────────────────────────

const BERICHTEN = {
  nl: {
    required: '{label} is verplicht.',
    email: '{label} is geen geldig e-mailadres.',
    number: '{label} moet een getal zijn.',
    min: '{label} moet minstens {n} zijn.',
    max: '{label} mag hoogstens {n} zijn.',
    choose: 'Maak een keuze',
    submitting: 'Bezig met versturen…',
    check_fields: 'Kijk de gemarkeerde velden na.',
  },
  fr: {
    required: '{label} est obligatoire.',
    email: "{label} n'est pas une adresse e-mail valide.",
    number: '{label} doit être un nombre.',
    min: '{label} doit être au moins {n}.',
    max: '{label} ne peut pas dépasser {n}.',
    choose: 'Faites votre choix',
    submitting: 'Envoi en cours…',
    check_fields: 'Veuillez vérifier les champs signalés.',
  },
};

const FORM = {
  id: 'uuid-1', slug: 'contact', name: 'We nemen contact met je op!',
  description: 'Laat je gegevens achter.', version: 3,
  submit_label: 'Versturen', success_mode: 'message', success_message: 'Bedankt!',
  theme: {},
  languages: ['nl', 'fr'],
  default_language: 'nl',
  i18n: { fr: { name: 'Nous vous contactons !', submit_label: 'Envoyer', success_message: 'Merci !' } },
  messages: BERICHTEN,
  fields: [
    { key: 'naam', type: 'text', label: 'Naam', required: true, width: 'full',
      options: [], validation: {}, help_text: '', placeholder: '', default_value: '',
      i18n: { fr: { label: 'Nom' } } },
    { key: 'email', type: 'email', label: 'E-mailadres', required: true, width: 'full',
      options: [], validation: {}, help_text: '', placeholder: '', default_value: '',
      i18n: { fr: { label: 'Adresse e-mail' } } },
    { key: 'aantal', type: 'number', label: 'Aantal', required: false, width: 'full',
      options: [], validation: { min: 2, max: 8 }, help_text: '', placeholder: '', default_value: '',
      i18n: { fr: { label: 'Nombre' } } },
    { key: 'vraag', type: 'textarea', label: 'Je vraag', required: false, width: 'full',
      options: [], validation: {}, help_text: '', placeholder: '', default_value: '',
      i18n: { fr: { label: 'Votre question' } } },
  ],
};

const tmp = mkdtempSync(join(tmpdir(), 'mf-validatie-'));

const phpScript = `<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', ${JSON.stringify(pluginDir.replace(/\\/g, '/') + '/')});
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function wp_unslash($t) { return $t; }
function wpautop($t) { return '<p>' . (string) $t . '</p>'; }
function checked($a, $b = true, $e = true) { $r = $a == $b ? ' checked' : ''; if ($e) { echo $r; } return $r; }
function selected($a, $b = true, $e = true) { $r = $a == $b ? ' selected' : ''; if ($e) { echo $r; } return $r; }
function get_permalink() { return 'https://openvme.be/contact/'; }
function home_url($p = '/') { return 'https://openvme.be' . $p; }
function wp_get_document_title() { return 'Contact'; }
function wp_nonce_field($a) { echo '<input type="hidden" name="_wpnonce" value="stub">'; }
function current_user_can($c) { return false; }
function get_option($k, $d = null) { return $d; }
function determine_locale() { return 'nl_BE'; }
function get_locale() { return 'nl_BE'; }
function wp_json_encode($v) { return json_encode($v); }

require_once MYMMO_FORMS_DIR . 'includes/helpers.php';
require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';

final class Mymmo_Forms_Submit {
    public const HONEYPOT_FIELD = 'mymmo_forms_website';
    public const TIME_FIELD = 'mymmo_forms_t';
    public static function action_url(): string { return 'https://openvme.be/wp-admin/admin-post.php'; }
    public static function action_name(): string { return 'mymmo_forms_submit'; }
    public static function time_token(): string { return '1757500000.abc'; }
}

$form = json_decode(file_get_contents(${JSON.stringify(join(tmp, 'form.json').replace(/\\/g, '/'))}), true);
$uit = [];
foreach (['nl', 'fr'] as $taal) {
    $uit[$taal] = mymmo_forms_render('form', [
        'form' => $form, 'slug' => 'contact', 'show_title' => true,
        'flash' => null, 'stale' => false, 'lang' => $taal,
    ]);
}
echo json_encode($uit);
`;

writeFileSync(join(tmp, 'form.json'), JSON.stringify(FORM));
writeFileSync(join(tmp, 'render.php'), phpScript);
const paginas = JSON.parse(execFileSync('php', [join(tmp, 'render.php')], { encoding: 'utf8' }));

const formsJs = readFileSync(join(pluginDir, 'assets', 'js', 'mymmo-forms.js'), 'utf8');
const formsCss = readFileSync(join(pluginDir, 'assets', 'css', 'mymmo-forms.css'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────

let geslaagd = 0;
let gefaald = 0;

function check(naam, ok, uitleg = '') {
  if (ok) { geslaagd += 1; console.log(`  ✓ ${naam}`); }
  else { gefaald += 1; console.log(`  ✗ ${naam}${uitleg ? `\n    ${uitleg}` : ''}`); }
}

const browser = await chromium.launch(
  process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}
);

/**
 * Eén pagina opzetten, met een spion op reportValidity().
 *
 * De spion staat er VOOR de plugin-JS laadt, zodat een aanroep uit die JS
 * gevangen wordt. window.__ballon telt hoe vaak de browser gevraagd werd zijn
 * eigen melding te tonen; dat hoort nul te blijven.
 */
async function openPagina(taal) {
  const pagina = await browser.newPage();
  await pagina.addInitScript(() => {
    window.__ballon = 0;
    for (const proto of [HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLFormElement]) {
      const origineel = proto.prototype.reportValidity;
      proto.prototype.reportValidity = function () {
        window.__ballon += 1;
        return origineel.call(this);
      };
    }
  });

  await pagina.route('https://site.test/', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="${taal}"><head><meta charset="utf-8">
      <style>${formsCss}</style></head><body>${paginas[taal]}
      <script>${formsJs}</script></body></html>`,
  }));

  await pagina.goto('https://site.test/');
  return pagina;
}

async function foutTekst(pagina, sleutel) {
  return pagina.textContent(`#mymmo-form-contact-${sleutel}-error`);
}

async function zichtbaar(pagina, sleutel) {
  return pagina.isVisible(`#mymmo-form-contact-${sleutel}-error`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDe browserballon blijft weg');

{
  const pagina = await openPagina('nl');

  check('voor het verzenden staat er geen enkele foutmelding',
    !(await zichtbaar(pagina, 'naam')) && !(await zichtbaar(pagina, 'email')),
    'anders kleurt het formulier rood zodra de pagina laadt');

  await pagina.click('.mymmo-form-submit');

  check('de browser wordt NIET gevraagd zijn eigen ballon te tonen',
    (await pagina.evaluate(() => window.__ballon)) === 0,
    'reportValidity() is precies wat "Please fill out this field." opriep');

  check('het formulier is niet verstuurd',
    pagina.url() === 'https://site.test/');

  console.log('\nOnze eigen melding, in de taal van de pagina');

  check('het lege verplichte veld heeft een melding',
    (await zichtbaar(pagina, 'naam')) === true);
  check('de melding staat in het Nederlands en noemt het veld',
    (await foutTekst(pagina, 'naam')) === 'Naam is verplicht.');
  check('het veld is als ongeldig gemarkeerd voor een schermlezer',
    (await pagina.getAttribute('#mymmo-form-contact-naam', 'aria-invalid')) === 'true');
  check('de melding is een alert-region',
    (await pagina.getAttribute('#mymmo-form-contact-naam-error', 'role')) === 'alert');
  check('de melding hangt via aria-describedby aan het veld',
    (await pagina.getAttribute('#mymmo-form-contact-naam', 'aria-describedby'))
      .includes('mymmo-form-contact-naam-error'));

  check('de cursor springt naar het EERSTE foute veld',
    (await pagina.evaluate(() => document.activeElement.id)) === 'mymmo-form-contact-naam',
    'op een lang formulier staat de fout anders buiten beeld');

  check('een veld dat niet verplicht is, krijgt geen melding',
    (await zichtbaar(pagina, 'vraag')) === false);

  console.log('\nPer soort fout de juiste zin');

  await pagina.fill('#mymmo-form-contact-naam', 'Nico');
  await pagina.fill('#mymmo-form-contact-email', 'geen-adres');
  await pagina.fill('#mymmo-form-contact-aantal', '99');
  await pagina.click('.mymmo-form-submit');

  check('een ongeldig e-mailadres krijgt de e-mailzin, niet "is verplicht"',
    (await foutTekst(pagina, 'email')) === 'E-mailadres is geen geldig e-mailadres.');
  check('een getal boven het maximum krijgt de maximumzin met het getal erin',
    (await foutTekst(pagina, 'aantal')) === 'Aantal mag hoogstens 8 zijn.');
  check('nog steeds geen browserballon',
    (await pagina.evaluate(() => window.__ballon)) === 0);

  console.log('\nDe melding verdwijnt weer');

  check('de melding bij het ingevulde veld is weg',
    (await zichtbaar(pagina, 'naam')) === false);
  check('en de aria-markering ook',
    (await pagina.getAttribute('#mymmo-form-contact-naam', 'aria-invalid')) === null);

  await pagina.fill('#mymmo-form-contact-email', 'nico@mymmo.com');
  check('corrigeren tijdens het typen wist de melding meteen',
    (await zichtbaar(pagina, 'email')) === false,
    'na een eerste verzendpoging mag je wél meelopen -- daarvoor niet');

  await pagina.close();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDezelfde meldingen, in het Frans');

{
  const pagina = await openPagina('fr');

  check('het formulier staat in het Frans',
    (await pagina.textContent('.mymmo-form-title')).includes('Nous vous contactons'));

  await pagina.click('.mymmo-form-submit');

  check('de melding is Frans en gebruikt het Franse label',
    (await foutTekst(pagina, 'naam')) === 'Nom est obligatoire.',
    'een Franse zin die naar een Nederlands veldlabel verwijst laat iemand zoeken naar een veld dat er niet staat');

  await pagina.fill('#mymmo-form-contact-naam', 'Nico');
  await pagina.fill('#mymmo-form-contact-email', 'geen-adres');
  await pagina.click('.mymmo-form-submit');

  check('ook de e-mailzin is Frans',
    (await foutTekst(pagina, 'email')) === "Adresse e-mail n'est pas une adresse e-mail valide.");
  check('geen browserballon, ook niet in het Frans',
    (await pagina.evaluate(() => window.__ballon)) === 0);

  // Op de ZICHTBARE tekst en niet op de HTML: die bevat de ingesloten
  // plugin-JS, en daar staan de Nederlandse noodteksten letterlijk in de
  // broncode. Dat is geen tekst die een bezoeker ooit leest.
  const zichtbareTekst = await pagina.innerText('.mymmo-form-wrap');
  check('er staat geen Nederlands meer op het scherm',
    !zichtbareTekst.includes('is verplicht') && !zichtbareTekst.includes('Versturen'),
    zichtbareTekst.replace(/\s+/g, ' ').slice(0, 200));

  await pagina.close();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nZonder JavaScript blijft het formulier werken');

{
  const pagina = await browser.newPage();
  await pagina.route('https://nojs.test/', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="nl"><head><meta charset="utf-8">
      <style>${formsCss}</style></head><body>${paginas.nl}</body></html>`,
  }));
  await pagina.goto('https://nojs.test/');

  check('het formulier post naar admin-post.php',
    (await pagina.getAttribute('.mymmo-form', 'action')).includes('admin-post.php'),
    'de validatie in de Operations Manager is de enige die telt');
  check('de verstuurknop is een echte submit',
    (await pagina.getAttribute('.mymmo-form-submit', 'type')) === 'submit');
  check('de foutplaatshouders staan er, leeg en verborgen',
    (await pagina.locator('[data-mymmo-error]').count()) === 4
    && !(await zichtbaar(pagina, 'naam')));

  await pagina.close();
}

await browser.close();

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
