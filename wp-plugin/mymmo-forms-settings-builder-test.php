<?php
/**
 * Test voor de shortcode-bouwer op de instellingenpagina.
 *
 *   php wp-plugin/mymmo-forms-settings-builder-test.php
 *
 * Rendert het scherm echt, met een nagebootste API-client, in drie toestanden:
 * formulieren gevonden, geen enkel gepubliceerd formulier, en de Operations
 * Manager onbereikbaar. Die laatste twee zien er in de praktijk hetzelfde uit
 * als je ze niet apart afhandelt -- "geen formulieren" en "ik kon het niet
 * ophalen" zijn heel verschillende dingen voor wie ernaar kijkt.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', __DIR__ . '/mymmo-forms/');
define('MYMMO_FORMS_URL', 'https://openvme.be/wp-content/plugins/mymmo-forms/');
define('MYMMO_FORMS_VERSION', '1.0.3');

// ── WordPress-stubs ─────────────────────────────────────────────────────────
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function current_user_can($c) { return true; }
function get_option($k, $d = null) { return $GLOBALS['__options'][$k] ?? $d; }
function admin_url($p = '') { return 'https://openvme.be/wp-admin/' . $p; }
function add_query_arg($k, $v, $u) { return $u . '&' . $k . '=' . $v; }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
function wp_unslash($v) { return $v; }
function wp_json_encode($v) { return json_encode($v); }
function settings_fields($g) { echo '<input type="hidden" name="option_page" value="' . $g . '">'; }
function wp_nonce_field($a) { echo '<input type="hidden" name="_wpnonce" value="stub">'; }
function submit_button($t = 'Opslaan', $c = 'primary', $n = 'submit', $wrap = true) {
    echo '<button class="button">' . esc_html($t) . '</button>';
}
function add_action() {}
function add_options_page() { return 'settings_page_mymmo-forms'; }
function register_setting() {}
function add_settings_error() {}
function wp_enqueue_script() {}
function wp_safe_redirect() {}
function check_admin_referer() { return true; }
function wp_die($m) { throw new RuntimeException($m); }

require_once MYMMO_FORMS_DIR . 'includes/helpers.php';

/** Nagebootste client: geeft terug wat de test instelt. */
final class Mymmo_Forms_Api_Client {
    public static ?array $forms = null;
    public static string $fout = '';
    public static int $aanroepen = 0;
    public static function list_forms(bool $ververs = false): ?array {
        self::$aanroepen++;
        return self::$forms;
    }
    public static function last_error(): ?string { return self::$fout; }
}

final class Mymmo_Forms_Cache {
    public static function purge_index(): void {}
    public static function purge_all(): void {}
    public static function known_slugs(): array { return []; }
}

require_once MYMMO_FORMS_DIR . 'includes/class-settings.php';

$GLOBALS['__options'] = [
    'mymmo_forms_api_base' => 'https://operations.openvme.be',
    'mymmo_forms_site_key' => 'geheim',
    'mymmo_forms_cache_ttl' => 300,
];

$geslaagd = 0;
$gefaald = 0;

function check(string $naam, bool $ok, string $uitleg = ''): void {
    global $geslaagd, $gefaald;
    if ($ok) { $geslaagd++; echo "  ✓ $naam\n"; }
    else { $gefaald++; echo "  ✗ $naam" . ($uitleg ? "\n    $uitleg" : '') . "\n"; }
}

function render(string $tab = ''): string {
    $_GET = $tab !== '' ? ['tab' => $tab] : [];
    ob_start();
    Mymmo_Forms_Settings::render_page();
    return (string) ob_get_clean();
}

// ───────────────────────────────────────────────────────────────────────────
echo "\nMet formulieren\n";

Mymmo_Forms_Api_Client::$forms = [
    ['slug' => 'offerte-technisch-beheer', 'name' => 'Offerte technisch beheer', 'description' => 'Vul in en we bellen terug.', 'version' => 7, 'field_count' => 5, 'languages' => ['nl', 'fr'], 'default_language' => 'nl'],
    ['slug' => 'contact', 'name' => 'Laat ons je contacteren!', 'description' => '', 'version' => 2, 'field_count' => 4, 'languages' => ['nl'], 'default_language' => 'nl'],
];
Mymmo_Forms_Api_Client::$fout = '';
$html = render();

check('er is een keuzelijst met de formulieren',
    substr_count($html, '<option value="offerte-technisch-beheer">') === 1
    && substr_count($html, '<option value="contact">') === 1);
check('de naam van het formulier staat erbij', str_contains($html, 'Offerte technisch beheer'));
check('het aantal velden staat erbij', str_contains($html, '(5 velden)'));
check('er is een shortcode-veld met de eerste slug',
    str_contains($html, 'value="[mymmo_form slug=&quot;offerte-technisch-beheer&quot;]"'));
check('er is een kopieerknop', str_contains($html, 'data-mymmo-copy="mymmoFormsShortcode"'));
check('er is een titel-schakelaar', str_contains($html, 'id="mymmoFormsTitle"'));

check('de tabel toont van ELK formulier de volledige shortcode',
    str_contains($html, '[mymmo_form slug="offerte-technisch-beheer"]')
    && str_contains($html, '[mymmo_form slug="contact"]'),
    'dat is de werkende terugval als JavaScript uitvalt');
check('de omschrijving staat erbij', str_contains($html, 'Vul in en we bellen terug.'));
check('het versienummer staat erbij', str_contains($html, '<td>7</td>'));
check('er is een knop om de lijst opnieuw op te halen',
    str_contains($html, 'mymmo_forms_reload_index'));

check('de sitesleutel staat NERGENS in de HTML', !str_contains($html, 'geheim'),
    'de sleutel hoort serverside te blijven, ook in wp-admin');

// ───────────────────────────────────────────────────────────────────────────
echo "\nGeen gepubliceerde formulieren\n";

Mymmo_Forms_Api_Client::$forms = [];
Mymmo_Forms_Api_Client::$fout = '';
$html = render();

check('er staat een uitleg in plaats van een lege keuzelijst',
    str_contains($html, 'nog geen') && str_contains($html, 'gepubliceerde'));
check('de uitleg vertelt WAAR je moet publiceren',
    str_contains($html, 'tabblad Formulier'),
    'anders weet niemand wat hij moet doen');
check('er is geen keuzelijst', !str_contains($html, 'id="mymmoFormsPick"'));

// ───────────────────────────────────────────────────────────────────────────
echo "\nOperations Manager onbereikbaar\n";

Mymmo_Forms_Api_Client::$forms = null;
Mymmo_Forms_Api_Client::$fout = 'De Operations Manager weigerde de sitesleutel (401).';
$html = render();

check('een fout is duidelijk iets anders dan "geen formulieren"',
    str_contains($html, 'niet opgehaald') && !str_contains($html, 'nog geen'),
    'die twee verwarren stuurt iemand de verkeerde kant op');
check('de echte reden staat erbij', str_contains($html, 'weigerde de sitesleutel'));
check('er is geen keuzelijst', !str_contains($html, 'id="mymmoFormsPick"'));

// ───────────────────────────────────────────────────────────────────────────
echo "\nTwee tabbladen\n";

Mymmo_Forms_Api_Client::$forms = [
    ['slug' => 'offerte-technisch-beheer', 'name' => 'Offerte technisch beheer', 'description' => '', 'version' => 7, 'field_count' => 5, 'languages' => ['nl', 'fr'], 'default_language' => 'nl'],
];
Mymmo_Forms_Api_Client::$fout = '';

$shortcode_tab = render();
$verbinding_tab = render('verbinding');

check('zonder ?tab land je op de shortcode-bouwer, niet op de instellingen',
    str_contains($shortcode_tab, 'id="mymmoFormsPick"'),
    'wie hier komt, komt een shortcode halen');

check('de sitesleutel staat NIET op het shortcode-tabblad',
    !str_contains($shortcode_tab, 'name="mymmo_forms_site_key"'),
    'een tekstveld waar per ongeluk in getypt wordt, haalt elk formulier op de site tegelijk onderuit');
check('de basis-URL staat NIET op het shortcode-tabblad',
    !str_contains($shortcode_tab, 'name="mymmo_forms_api_base"'));
check('"Cache legen" staat NIET op het shortcode-tabblad',
    !str_contains($shortcode_tab, 'mymmo_forms_purge'));

check('de sitesleutel staat WEL op het verbinding-tabblad',
    str_contains($verbinding_tab, 'name="mymmo_forms_site_key"'));
check('de shortcode-bouwer staat NIET op het verbinding-tabblad',
    !str_contains($verbinding_tab, 'id="mymmoFormsPick"'),
    'twee keer hetzelfde tonen maakt de tabbladen betekenisloos');

check('beide tabbladen zijn vanaf elk tabblad bereikbaar',
    substr_count($shortcode_tab, 'nav-tab') >= 2 && substr_count($verbinding_tab, 'nav-tab') >= 2);
// De href en de class staan in de opmaak op twee regels; een assertie die
// uitgaat van één spatie ertussen breekt zodra iemand de HTML anders inspringt.
$actief = static function (string $html, string $tab): bool {
    return (bool) preg_match(
        '/href="[^"]*tab=' . preg_quote($tab, '/') . '"\s+class="nav-tab nav-tab-active"/',
        $html
    );
};
check('het actieve tabblad is gemarkeerd',
    $actief($shortcode_tab, 'shortcode') && $actief($verbinding_tab, 'verbinding'));
check('het NIET-actieve tabblad is niet gemarkeerd',
    !$actief($shortcode_tab, 'verbinding') && !$actief($verbinding_tab, 'shortcode'));

check('een onbekend tabblad valt terug op de shortcode-bouwer',
    str_contains(render('bestaatniet'), 'id="mymmoFormsPick"'),
    'een typfout in de URL mag geen leeg scherm geven');

check('de sitesleutel staat op GEEN van beide tabbladen voluit',
    !str_contains($shortcode_tab, 'geheim') && !str_contains($verbinding_tab, 'geheim'));

// ───────────────────────────────────────────────────────────────────────────
echo "\nTaalkeuze\n";

check('er is een taalkeuze', str_contains($shortcode_tab, 'id="mymmoFormsLang"'));
check('de talen van elk formulier gaan mee naar de browser',
    str_contains($shortcode_tab, 'data-mymmo-langs='),
    'zonder die lijst zou de bouwer lang="fr" aanbieden voor een formulier dat geen Frans kent');

$langs_json = null;
if (preg_match('/data-mymmo-langs="([^"]*)"/', $shortcode_tab, $m)) {
    $langs_json = json_decode(html_entity_decode($m[1], ENT_QUOTES, 'UTF-8'), true);
}
check('de meegestuurde talen kloppen met het formulier',
    is_array($langs_json)
    && ($langs_json['offerte-technisch-beheer']['languages'] ?? null) === ['nl', 'fr']
    && ($langs_json['offerte-technisch-beheer']['default'] ?? null) === 'nl');

check('de tabel toont in welke talen een formulier bestaat',
    str_contains($shortcode_tab, 'NL, FR'));

// ───────────────────────────────────────────────────────────────────────────
echo "\nNog niets ingesteld\n";

$bewaard = $GLOBALS['__options']['mymmo_forms_site_key'];
$GLOBALS['__options']['mymmo_forms_site_key'] = '';
$html = render();
check('de bouwer stuurt je naar het verbinding-tabblad in plaats van een lege lijst te tonen',
    str_contains($html, 'nog niet ingesteld') && str_contains($html, 'tab=verbinding'),
    'anders staat er een foutmelding waar een instructie hoort');
check('er wordt niet eens geprobeerd op te halen zonder instellingen',
    !str_contains($html, 'id="mymmoFormsPick"'));
$GLOBALS['__options']['mymmo_forms_site_key'] = $bewaard;

echo "\n$geslaagd geslaagd, $gefaald gefaald\n\n";
exit($gefaald === 0 ? 0 : 1);
