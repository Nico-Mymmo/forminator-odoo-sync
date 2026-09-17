<?php
/**
 * Bouwt het ECHTE venster (pop-up) met een stap erin, zodat je het in een
 * browser kan bekijken en OPMETEN.
 *
 *     php wp-plugin/mymmo-forms-venster-preview.php gebouwgrootte > venster.html
 *
 * Waarom dit naast mymmo-forms-stap-preview.php bestaat: die toont een stap in
 * een PAGINA, en daar is alle hoogte van de wereld. In de pop-up zit de stap in
 * een paneel met `overflow-y:auto` binnen een venster van `88vh` -- en dat is
 * precies waar een schuifbalk vandaan komt. Die kan je niet zien in het andere
 * voorbeeld, en dus ook niet wegwerken.
 *
 * Geen test: dit assert niets. Het rendert via de echte shortcode, met dezelfde
 * WordPress-stubs als de rendertest.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', __DIR__ . '/mymmo-forms/');
define('MYMMO_FORMS_URL', './mymmo-forms/');
define('MYMMO_FORMS_VERSION', '1.0.0');

// ── WordPress-stubs ─────────────────────────────────────────────────────────
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function sanitize_html_class($c) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $c); }
function sanitize_title($t) { return strtolower(preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string) $t))); }
function wp_unslash($t) { return $t; }
function wp_strip_all_tags($t) { return trim(strip_tags((string) $t)); }
function wp_autop($t) { return '<p>' . (string) $t . '</p>'; }
function checked($a, $b = true, $echo = true) { $r = $a == $b ? ' checked' : ''; if ($echo) { echo $r; } return $r; }
function selected($a, $b = true, $echo = true) { $r = $a == $b ? ' selected' : ''; if ($echo) { echo $r; } return $r; }
function get_permalink() { return 'https://openvme.be/offerte/'; }
function home_url($p = '/') { return 'https://openvme.be' . $p; }
function admin_url($p = '') { return 'https://openvme.be/wp-admin/' . $p; }
function wp_get_document_title() { return 'Offerte aanvragen'; }
function wp_nonce_field($a) { echo '<input type="hidden" name="_wpnonce" value="stub">'; }
function current_user_can($c) { return false; }
function get_option($k, $d = null) { return $GLOBALS['__options'][$k] ?? $d; }
function determine_locale() { return 'nl_BE'; }
function get_locale() { return 'nl_BE'; }
function wp_json_encode($v) { return json_encode($v); }
function wp_get_inline_script_tag($js, $attrs = []) { return '<script>' . $js . '</script>'; }
function add_action($h, $f, $p = 10, $a = 1) { return true; }
function add_shortcode($n, $f) { return true; }
function wp_register_style() { return true; }
function wp_register_script() { return true; }
function wp_enqueue_style() { return true; }
function wp_enqueue_script() { return true; }
function shortcode_atts($paren, $atts, $code = '') {
    $uit = $paren;
    foreach ((array) $atts as $sleutel => $waarde) {
        if (array_key_exists($sleutel, $paren)) { $uit[$sleutel] = $waarde; }
    }
    return $uit;
}

require_once MYMMO_FORMS_DIR . 'includes/helpers.php';
require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';
require_once MYMMO_FORMS_DIR . 'includes/class-steps.php';

final class Mymmo_Forms_Submit {
    public const HONEYPOT_FIELD = 'mymmo_forms_website';
    public const TIME_FIELD = 'mymmo_forms_t';
    public const ANCHOR_FIELD = 'mymmo_anchor';
    public const TAB_FIELD = 'mymmo_tab';
    public static function action_url(): string { return 'https://openvme.be/wp-admin/admin-post.php'; }
    public static function action_name(): string { return 'mymmo_forms_submit'; }
    public static function time_token(): string { return '1757500000.abc123'; }
    public static function flash(): ?array { return $GLOBALS['__flash'] ?? null; }
}

// ── Welke stap? ─────────────────────────────────────────────────────────────
$naam = $argv[1] ?? 'gebouwgrootte';
$pad  = MYMMO_FORMS_DIR . 'voorbeelden/' . $naam . '.html';
if (!is_file($pad)) {
    fwrite(STDERR, "Geen voorbeeld '{$naam}' in voorbeelden/\n");
    exit(1);
}

$sleutels = ['aantal_kavels', 'commerciele_kavels'];

// De stap in de opslag zetten, zoals wp-admin dat zou doen.
$GLOBALS['__options']['mymmo_forms_steps'] = [
    $naam => [
        'name'   => 'Grootte van het gebouw',
        'title'  => 'Wat is de grootte van het gebouw?',
        'sub'    => 'We rekenen meteen een richtprijs voor je uit.',
        'fields' => $sleutels,
        'nav'    => 'plugin',
        'html'   => file_get_contents($pad),
    ],
];

// ── Het formulier dat de API zou teruggeven ─────────────────────────────────
$velden = [
    ['key' => 'naam', 'label' => 'Je naam', 'type' => 'text', 'required' => true, 'width' => 'half'],
    ['key' => 'email', 'label' => 'E-mailadres', 'type' => 'email', 'required' => true, 'width' => 'half'],
];
foreach ($sleutels as $s) {
    $velden[] = ['key' => $s, 'label' => $s, 'type' => 'hidden', 'required' => false, 'width' => 'full'];
}

$GLOBALS['__form'] = [
    'slug' => 'offerte', 'name' => 'Laat ons snel kennismaken',
    'description' => 'Wij tonen je met plezier hoe je terug gelukkig wordt van gebouwbeheer',
    'version' => 1, 'submit_label' => 'Verstuur', 'success_message' => 'Bedankt!',
    'fields' => $velden, 'theme' => [], 'languages' => ['nl'], 'default_language' => 'nl',
];

final class Mymmo_Forms_Api_Client {
    public static function get_form(string $slug) { return $GLOBALS['__form']; }
    public static function last_error(): string { return 'gestubd'; }
    public static function served_stale(): bool { return false; }
}

require_once MYMMO_FORMS_DIR . 'includes/class-shortcodes.php';

// Tweede argument 'kaal': zonder regeltjes onder de tabkoppen, om te zien of
// die koppen dan gecentreerd staan in plaats van bovenaan.
$kaal = ($argv[2] ?? '') === 'kaal';
// Vijfde argument "dank": doen alsof het formulier-tabblad net verstuurde, om
// het dankjewelscherm te bekijken (en de conversie in de dataLayer).
if (($argv[5] ?? '') === 'dank') {
    $GLOBALS['__flash'] = ['status' => 'success', 'message' => 'Bedankt, we hebben je bericht goed ontvangen.',
        'values' => [], 'slug' => 'offerte', 'anchor' => 'mymmo-modal-offerte', 'tab' => 'form'];
}

$venster = Mymmo_Forms_Shortcodes::render_button([
    'slug'          => 'offerte',
    'label'         => 'Laat ons snel kennismaken',
    'calendly'      => 'https://calendly.com/mymmo/kennismaking',
    'extra_steps'   => $naam,
    'tab_extra'     => 'Bereken je prijs',
    'tab_extra_sub' => $kaal ? '' : 'Beantwoord enkele vragen en krijg meteen een voorbeeldofferte',
    'tab_form'      => 'Stuur een bericht',
    'tab_form_sub'  => $kaal ? '' : 'Stuur ons een bericht en we nemen zo snel contact met je op',
    'tab_calendly'  => 'Plan een gesprek',
    'tab_calendly_sub' => $kaal ? '' : 'Liever zelf een plekje kiezen? Boek dit meteen in onze agenda',
    'tab_order'     => 'extra,form,calendly',
    'goal_form'     => '/bedankt/offerte',
    'thanks_form_title' => 'Bedankt!',
    'points'        => 'Meteen een offerte|Syndicoach helder uitgelegd|Jouw gebouw staat centraal',
    // Geen padding_x/padding_y meer: de opvulling van het paneel staat sinds
    // 1.15.4 vast in mymmo-forms-modal.css en is niet per plaatsing te zetten.
    //
    // De kop boven de LAATSTE stap (het formulier). Derde en vierde argument,
    // zodat je kan zien of stap 2 er hetzelfde uitziet als stap 1.
    'form_title'    => ($argv[3] ?? 'Nog even je gegevens'),
    'form_sub'      => ($argv[4] ?? 'Dan sturen we je meteen een voorstel.'),
]);

// ── De pagina eromheen ──────────────────────────────────────────────────────
$assets = MYMMO_FORMS_DIR . 'assets/';
echo '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">';
echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
echo '<title>Venster: ' . esc_html($naam) . '</title>';
// Inline en niet <link>: dit bestand wordt als los bestand geopend.
foreach ([__DIR__ . '/../public/mymmo-forms.css', $assets . 'css/mymmo-forms-modal.css', $assets . 'css/mymmo-forms-steps.css'] as $css) {
    echo '<style>' . file_get_contents($css) . '</style>';
}
echo '<style>body{margin:0;padding:24px;background:#eef2f7;font-family:system-ui,sans-serif}</style>';
echo '</head><body>';
echo $venster;
foreach ([$assets . 'js/mymmo-forms.js', $assets . 'js/mymmo-forms-modal.js', $assets . 'js/mymmo-forms-steps.js'] as $js) {
    echo '<script>' . file_get_contents($js) . '</script>';
}
// Het venster meteen openzetten: we komen het bekijken, niet openklikken.
echo '<script>document.documentElement.classList.add("mymmo-modal-js");';
echo 'document.addEventListener("DOMContentLoaded",function(){';
echo 'var v=document.querySelector("[data-mymmo-modal]"); if(v) v.classList.add("is-open");});</script>';
echo '</body></html>';
