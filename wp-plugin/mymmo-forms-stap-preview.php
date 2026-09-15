<?php
/**
 * Bouwt een ECHTE pagina rond een stap uit voorbeelden/, zodat je hem in een
 * browser kan uitproberen tegen de echte runtime.
 *
 *     php wp-plugin/mymmo-forms-stap-preview.php gebouwgrootte > preview.html
 *
 * Geen test: dit assert niets. Het is het kortste pad van "ik heb een stap
 * geschreven" naar "ik zie hem werken", zonder een WordPress bij de hand.
 * De templates en de assets zijn de echte; alleen WordPress eromheen is
 * nagebootst, met dezelfde stubs als mymmo-forms-render-test.php.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', __DIR__ . '/mymmo-forms/');
define('MYMMO_FORMS_URL', './mymmo-forms/');
define('MYMMO_FORMS_VERSION', '1.0.0');

// ── WordPress-stubs (gelijk aan mymmo-forms-render-test.php) ────────────────
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function wp_unslash($t) { return $t; }
function wp_autop($t) { return '<p>' . (string) $t . '</p>'; }
function wpautop($t) { return wp_autop($t); }
function checked($a, $b = true, $echo = true) { $r = $a == $b ? ' checked' : ''; if ($echo) { echo $r; } return $r; }
function selected($a, $b = true, $echo = true) { $r = $a == $b ? ' selected' : ''; if ($echo) { echo $r; } return $r; }
function get_permalink() { return 'https://openvme.be/offerte/'; }
function home_url($p = '/') { return 'https://openvme.be' . $p; }
function wp_get_document_title() { return 'Offerte aanvragen'; }
function wp_nonce_field($a) { echo '<input type="hidden" name="_wpnonce" value="stub">'; }
function current_user_can($c) { return true; }
function get_option($k, $d = null) { return $GLOBALS['__options'][$k] ?? $d; }
function determine_locale() { return 'nl_BE'; }
function get_locale() { return 'nl_BE'; }
function wp_json_encode($v) { return json_encode($v); }
function wp_get_inline_script_tag($js, $attrs = []) { return '<script>' . $js . '</script>'; }
function sanitize_title($t) { return strtolower(preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string) $t))); }

require_once MYMMO_FORMS_DIR . 'includes/helpers.php';
require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';
require_once MYMMO_FORMS_DIR . 'includes/class-steps.php';

final class Mymmo_Forms_Submit {
    public const HONEYPOT_FIELD = 'mymmo_forms_website';
    public const TIME_FIELD = 'mymmo_forms_t';
    public const ANCHOR_FIELD = 'mymmo_anchor';
    public static function action_url(): string { return 'https://openvme.be/wp-admin/admin-post.php'; }
    public static function action_name(): string { return 'mymmo_forms_submit'; }
    public static function time_token(): string { return '1757500000.abc123'; }
    public static function flash(): ?array { return null; }
}

// ── Welke stap? ─────────────────────────────────────────────────────────────
$naam = $argv[1] ?? 'gebouwgrootte';
$pad = MYMMO_FORMS_DIR . 'voorbeelden/' . $naam . '.html';
if (!is_file($pad)) {
    fwrite(STDERR, "Geen voorbeeld '{$naam}' in voorbeelden/\n");
    exit(1);
}
$html = (string) file_get_contents($pad);

// De sleutels die de stap belooft af te leveren. Die moeten als VERBORGEN VELD
// op het formulier staan, anders komt de waarde nergens aan -- precies wat we
// hier willen kunnen zien. Per voorbeeld verschillend; staat een nieuw
// voorbeeld hier niet, dan leiden we ze af uit de HTML zelf.
$per_stap = [
    'gebouwgrootte'   => ['aantal_kavels', 'commerciele_kavels'],
    'aantal-gebouwen' => ['aantal_gebouwen'],
];
$sleutels = $per_stap[$naam] ?? [];
if ($sleutels === []) {
    preg_match_all('/data-mymmo-waarde="([a-z0-9_]+)"/', $html, $m);
    $sleutels = array_values(array_unique($m[1] ?? []));
}
if ($sleutels === []) {
    fwrite(STDERR, "Geen sleutels gevonden voor '{$naam}'; vul \$per_stap aan.
");
    exit(1);
}

// ── Een formulier met die verborgen velden ──────────────────────────────────
$velden = [
    ['key' => 'naam', 'label' => 'Je naam', 'type' => 'text', 'required' => true, 'width' => 'half'],
    ['key' => 'email', 'label' => 'E-mailadres', 'type' => 'email', 'required' => true, 'width' => 'half'],
];
foreach ($sleutels as $s) {
    $velden[] = ['key' => $s, 'label' => $s, 'type' => 'hidden', 'required' => false, 'width' => 'full'];
}

$form = [
    'slug' => 'offerte',
    'name' => 'Offerte aanvragen',
    'title' => 'Nog twee dingen en we rekenen het uit',
    'description' => '',
    'submit_label' => 'Verstuur',
    'success_message' => 'Bedankt!',
    'fields' => $velden,
    'theme' => [],
    'version' => 1,
];

// Tweede argument 'flash': doe alsof de bezoeker net een MISLUKTE inzending
// deed. Dan begint de reeks bij het formulier en staan zijn antwoorden terug in
// de verborgen velden -- de enige toestand waarin een stap zijn eigen bediening
// moet herstellen.
$flash = null;
if (($argv[2] ?? '') === 'flash') {
    // Een waarde per sleutel, ver genoeg van de beginstand om het verschil te
    // zien als een stap zichzelf NIET herstelt.
    $terug = ['naam' => 'Nico'];
    foreach ($sleutels as $s) {
        $terug[$s] = str_contains($s, 'commerc') ? 'ja' : '42';
    }
    $flash = [
        'ok' => false,
        'message' => 'Vul je e-mailadres in.',
        'errors' => ['email' => 'Vul je e-mailadres in.'],
        'values' => $terug,
    ];
}

$form_args = [
    'form' => $form,
    'slug' => 'offerte',
    'wrap_id' => 'mymmo-form-offerte',
    'lang' => 'nl',
    'flash' => $flash,
    'messages' => Mymmo_Forms_I18n::messages($form, 'nl'),
    'anchor' => 'mymmo-form-offerte',
    'extra_style' => '',
];

$stappen = [[
    'id' => $naam,
    'name' => $naam,
    'title' => 'Grootte van het gebouw',
    'html' => $html,
    'fields' => $sleutels,
    'nav' => Mymmo_Forms_Steps::NAV_PLUGIN,
    'next' => '',
    'back' => '',
    'updated' => 0,
    'backup' => null,
]];

$slug = 'offerte';
$wrap_id = 'mymmo-form-offerte';
$lang = 'nl';
$ontbrekend = [];
$extra_style = '';

ob_start();
require MYMMO_FORMS_DIR . 'templates/steps.php';
$reeks = (string) ob_get_clean();

// ── De pagina eromheen ──────────────────────────────────────────────────────
$assets = './mymmo-forms/assets/';
echo '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">';
echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
echo '<title>Voorbeeld: ' . esc_html($naam) . '</title>';
// INLINE en niet <link>: deze pagina wordt als los bestand geopend, en dan
// haalt een relatief pad niets op -- je zou een ongestyleerde pagina zien en
// denken dat de stap stuk is.
echo '<style>' . file_get_contents(__DIR__ . '/../public/mymmo-forms.css') . '</style>';
echo '<style>' . file_get_contents(MYMMO_FORMS_DIR . 'assets/css/mymmo-forms-steps.css') . '</style>';
echo '<style>body{margin:0;padding:40px 20px;background:#f6f9fb;font-family:system-ui,sans-serif}';
echo '.proef{max-width:720px;margin:0 auto}';
echo '.proef-log{margin-top:28px;padding:14px 16px;background:#fff;border:1px solid #d7dbe2;border-radius:10px;font:13px/1.6 ui-monospace,monospace}';
echo '</style></head><body><div class="proef">';
echo $reeks;
echo '<div class="proef-log" data-log>De verborgen velden verschijnen hier zodra je iets wijzigt.</div>';
echo '</div>';
echo '<script>' . file_get_contents(MYMMO_FORMS_DIR . 'assets/js/mymmo-forms-steps.js') . '</script>';
// Een spiegel van de verborgen velden, zodat je ziet wat er ECHT verstuurd zou
// worden zonder de DOM te moeten openen.
echo '<script>(function(){var log=document.querySelector("[data-log]");function toon(){';
echo 'var v=document.querySelectorAll(".mymmo-form-grid input[type=hidden]");var r=[];';
echo 'for(var i=0;i<v.length;i++){if(v[i].name.charAt(0)==="_")continue;r.push(v[i].name+" = "+JSON.stringify(v[i].value));}';
echo 'log.textContent=r.join("\n")||"(geen verborgen velden)";}';
echo 'document.addEventListener("input",toon);document.addEventListener("click",function(){setTimeout(toon,0);});toon();})();</script>';
echo '</body></html>';
