/**
 * Lopen de twee formulier-renderers niet uit elkaar?
 *
 *   node src/modules/forminator-sync-v2/tests/form-preview-parity-test.mjs
 *
 * Er zijn er twee, en dat is een bewust risico:
 *
 *   - wp-plugin/mymmo-forms/templates/partials/field.php rendert wat een
 *     BEZOEKER krijgt;
 *   - public/forminator-sync-v2-form-preview.js rendert het VOORBEELD in de
 *     bouwer, dat aanklikbaar moet zijn en waarin je moet kunnen typen.
 *
 * Deze test rendert dezelfde velden met beide en vergelijkt de STRUCTUUR:
 * per veld het soort element, de mymmo-form-klassen en het invoertype. Wijkt
 * de een van de ander af, dan is het voorbeeld in de bouwer een leugen en
 * wordt deze test rood.
 *
 * Wat bewust NIET vergeleken wordt: de bewerklaag (data-om-*-markers,
 * contenteditable, de sleepgreep, plaatsaanduidingen) en de dingen die alleen
 * op de site betekenis hebben (name, id, required, aria-describedby). Die
 * verschillen horen er te zijn.
 *
 * PHP nodig. In de Windows-omgeving van deze repo staat geen PHP-CLI; dan
 * slaat de test zichzelf over met een duidelijke melding in plaats van rood te
 * worden. Draai hem in een omgeving mét php (of in de cloudcontainer).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const wortel = join(hier, '..', '..', '..', '..');
const pluginDir = join(wortel, 'wp-plugin', 'mymmo-forms');
const previewJs = join(wortel, 'public', 'forminator-sync-v2-form-preview.js');

// ── Is PHP er? ──────────────────────────────────────────────────────────────
let phpVersie;
try {
  phpVersie = execFileSync('php', ['-v'], { encoding: 'utf8' }).split('\n')[0];
} catch (_) {
  console.log('\nOvergeslagen: geen PHP-CLI gevonden.');
  console.log('Deze test vergelijkt de PHP-renderer met de JS-renderer en heeft php nodig.\n');
  process.exit(0);
}

if (!existsSync(join(pluginDir, 'templates', 'partials', 'field.php'))) {
  console.log('\nOvergeslagen: wp-plugin/mymmo-forms/templates/partials/field.php niet gevonden.\n');
  process.exit(0);
}

console.log(`\nPHP: ${phpVersie}`);

// ── De velden die vergeleken worden: elk type minstens een keer ─────────────
const VELDEN = [
  { key: 'voornaam', type: 'text', label: 'Voornaam', required: true, width: 'half' },
  { key: 'email', type: 'email', label: 'E-mailadres', required: true, width: 'full', help_text: 'Enkel om te antwoorden.' },
  { key: 'telefoon', type: 'tel', label: 'Telefoon', required: false, width: 'half' },
  { key: 'aantal', type: 'number', label: 'Aantal', required: false, width: 'half', validation: { min: 1, max: 9 } },
  { key: 'startdatum', type: 'date', label: 'Startdatum', required: false, width: 'half' },
  { key: 'vraag', type: 'textarea', label: 'Je vraag', required: false, width: 'full' },
  { key: 'gebouw', type: 'select', label: 'Type gebouw', required: true, width: 'full', placeholder: 'Kies', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  { key: 'lift', type: 'radio', label: 'Lift?', required: true, width: 'full', options: [{ value: 'ja', label: 'Ja' }, { value: 'nee', label: 'Nee' }] },
  { key: 'diensten', type: 'checkbox_group', label: 'Diensten', required: false, width: 'full', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
  { key: 'consent', type: 'checkbox', label: 'Akkoord', required: true, width: 'full' },
  { key: '', type: 'heading', label: 'Tussentitel', required: false, width: 'full' },
  { key: '', type: 'paragraph', label: 'Wat uitleg.', required: false, width: 'full' },
];

const volledig = (v) => ({
  key: v.key, type: v.type, label: v.label,
  required: !!v.required, width: v.width || 'full',
  help_text: v.help_text || '', placeholder: v.placeholder || '',
  default_value: v.default_value || '',
  options: v.options || [], validation: v.validation || {},
});

const tmp = mkdtempSync(join(tmpdir(), 'mf-parity-'));

// ── PHP-kant ────────────────────────────────────────────────────────────────
const phpScript = `<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', ${JSON.stringify(pluginDir.replace(/\\/g, '/') + '/')});
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function wpautop($t) { return '<p>' . (string) $t . '</p>'; }
function checked($a, $b = true, $e = true) { $r = $a == $b ? ' checked' : ''; if ($e) { echo $r; } return $r; }
function selected($a, $b = true, $e = true) { $r = $a == $b ? ' selected' : ''; if ($e) { echo $r; } return $r; }
require_once MYMMO_FORMS_DIR . 'includes/helpers.php';
require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';

$velden = json_decode(file_get_contents(${JSON.stringify(join(tmp, 'velden.json').replace(/\\/g, '/'))}), true);
$uit = [];
foreach ($velden as $i => $veld) {
    $uit[] = mymmo_forms_render('partials/field', [
        'veld' => $veld, 'index' => $i,
        'form_id_attr' => 'mymmo-form-proef', 'oude_waarden' => [],
        'lang' => 'nl', 'teksten' => ['choose' => 'Maak een keuze'],
        'is_standaardtaal' => true,
    ]);
}
echo json_encode($uit);
`;

writeFileSync(join(tmp, 'velden.json'), JSON.stringify(VELDEN.map(volledig)));
writeFileSync(join(tmp, 'render.php'), phpScript);
const phpHtml = JSON.parse(execFileSync('php', [join(tmp, 'render.php')], { encoding: 'utf8' }));

// ── JS-kant ─────────────────────────────────────────────────────────────────
// Het renderbestand is browsercode (een IIFE die op window schrijft), dus het
// wordt hier met een minimale window uitgevoerd in plaats van geïmporteerd.
const jsBron = readFileSync(previewJs, 'utf8');
const nepWindow = {};
new Function('window', jsBron)(nepWindow);
const renderVeld = nepWindow.FSV2.renderFormPreviewField;

// bewerkbaar: false -> de bewerklaag zit er niet in, precies wat we willen
// vergelijken met de plugin.
const jsHtml = VELDEN.map((v, i) => renderVeld(toJsVeld(v), i, false));

function toJsVeld(v) {
  return {
    field_key: v.key, field_type: v.type, label: v.label,
    help_text: v.help_text || '', placeholder: v.placeholder || '',
    is_required: !!v.required, default_value: v.default_value || '',
    options: v.options || [], width: v.width || 'full',
    validation: v.validation || {},
  };
}

// ── Vergelijken ─────────────────────────────────────────────────────────────
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

/** De structuur die beide kanten gelijk moeten hebben. */
function vorm(html) {
  const klassen = [...html.matchAll(/class="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter((c) => c.startsWith('mymmo-form'))
    .sort();

  const elementen = [...html.matchAll(/<(input|select|textarea|label|legend|fieldset|h3|p|option)\b/g)]
    .map((m) => m[1]);

  const invoertypes = [...html.matchAll(/<input[^>]*\btype="([^"]+)"/g)].map((m) => m[1]);

  return {
    klassen: [...new Set(klassen)],
    elementen: elementen.sort(),
    invoertypes: invoertypes.sort(),
    aantalOpties: (html.match(/<option\b/g) || []).length,
  };
}

console.log('\nStructuur per veldtype (PHP <-> JS)');

VELDEN.forEach((veld, i) => {
  const php = vorm(phpHtml[i]);
  const js = vorm(jsHtml[i]);
  const naam = `${veld.type}${veld.key ? ` (${veld.key})` : ''}`;

  const verschillen = [];
  if (JSON.stringify(php.klassen) !== JSON.stringify(js.klassen)) {
    verschillen.push(`klassen PHP=${JSON.stringify(php.klassen)} JS=${JSON.stringify(js.klassen)}`);
  }
  if (JSON.stringify(php.elementen) !== JSON.stringify(js.elementen)) {
    verschillen.push(`elementen PHP=${JSON.stringify(php.elementen)} JS=${JSON.stringify(js.elementen)}`);
  }
  if (JSON.stringify(php.invoertypes) !== JSON.stringify(js.invoertypes)) {
    verschillen.push(`invoertypes PHP=${JSON.stringify(php.invoertypes)} JS=${JSON.stringify(js.invoertypes)}`);
  }
  if (php.aantalOpties !== js.aantalOpties) {
    verschillen.push(`aantal <option> PHP=${php.aantalOpties} JS=${js.aantalOpties}`);
  }

  check(naam, verschillen.length === 0, verschillen.join('\n    '));
});

console.log('\nAfspraken over de bewerklaag');

const jsBewerkbaar = VELDEN.map((v, i) => renderVeld(toJsVeld(v), i, true)).join('');
const jsGewoon = jsHtml.join('');

check('de bewerklaag zit ALLEEN in de bewerkbare vorm',
  jsBewerkbaar.includes('data-om-field') && jsBewerkbaar.includes('contenteditable')
    && !jsGewoon.includes('data-om-field') && !jsGewoon.includes('contenteditable'));

check('de PHP-renderer bevat geen bewerklaag',
  !phpHtml.join('').includes('data-om-'),
  'markers uit de bouwer horen niet in wat een bezoeker krijgt');

check('elk invoerveld in het voorbeeld staat op disabled',
  (jsBewerkbaar.match(/<(input|select|textarea)\b/g) || []).length
    === (jsBewerkbaar.match(/disabled/g) || []).length,
  'in het voorbeeld vul je geen formulier in, je bewerkt het');

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
