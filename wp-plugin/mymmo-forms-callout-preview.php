<?php
/**
 * Bouwt een ECHTE ingang (knop, klasse of callout), zodat je hem in een browser
 * kan bekijken en OPMETEN.
 *
 *     php wp-plugin/mymmo-forms-callout-preview.php gebouwgrootte kolommen > proef.html
 *     php wp-plugin/mymmo-forms-callout-preview.php gebouwkenmerken breed    > proef.html
 *     php wp-plugin/mymmo-forms-callout-preview.php form kolommen            > proef.html
 *
 * Eerste argument: wat de callout uitlicht -- een stapnaam, `form` of
 * `calendly`. Tweede: de indeling, `kolommen` of `breed`.
 *
 * Waarom dit naast mymmo-forms-venster-preview.php bestaat: die opent het
 * venster meteen. Een callout gaat juist over wat er IN DE PAGINA staat, en over
 * wat er gebeurt als je op de knop klikt -- het uitgelichte onderdeel verhuist
 * dan naar het venster. Dat is met een opengeklapt venster niet te zien.
 *
 * Geen test: dit assert niets. Het rendert via dezelfde code als een pagina, met
 * dezelfde WordPress-stubs als de rendertest.
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
function get_permalink() { return 'https://syndicoach.be/offerte/'; }
function home_url($p = '/') { return 'https://syndicoach.be' . $p; }
function admin_url($p = '') { return 'https://syndicoach.be/wp-admin/' . $p; }
function wp_get_document_title() { return 'Offerte aanvragen'; }
function wp_nonce_field($a) { echo '<input type="hidden" name="_wpnonce" value="stub">'; }
function current_user_can($c) { return false; }
function get_option($k, $d = null) { return $GLOBALS['__options'][$k] ?? $d; }
function update_option($k, $v, $a = true) { $GLOBALS['__options'][$k] = $v; return true; }
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
    public static function action_url(): string { return 'https://syndicoach.be/wp-admin/admin-post.php'; }
    public static function action_name(): string { return 'mymmo_forms_submit'; }
    public static function time_token(): string { return '1757500000.abc123'; }
    public static function flash(): ?array { return $GLOBALS['__flash'] ?? null; }
}

// ── Wat licht de callout uit, en in welke indeling? ─────────────────────────
$uitgelicht = $argv[1] ?? 'gebouwgrootte';
$layout     = ($argv[2] ?? '') === 'breed' ? 'breed' : 'kolommen';
// Derde argument: welke SOORT ingang. Standaard de callout; `knop` en `klasse`
// zijn er om te zien dat dezelfde opstelling ook langs die weg opengaat.
$soort = in_array($argv[3] ?? '', ['knop', 'klasse'], true) ? $argv[3] : 'callout';

// Vierde argument `kaal`: chrome="no", zoals een ingang die in een kaart van
// Mymmo Cards staat. Dan hoort er enkel het onderdeel plus de knop uit te
// komen -- geen kaartje, geen titel, geen achtergrond.
$kaal = ($argv[4] ?? '') === 'kaal';

// Alle voorbeeldstappen in de opslag zetten, zoals wp-admin dat zou doen.
$alle = [
    'gebouwgrootte' => [
        'titel'  => 'Hoe groot is je gebouw?',
        'velden' => ['aantal_kavels', 'commerciele_kavels'],
    ],
    'gebouwkenmerken' => [
        'titel'  => 'Wat maakt het beheer van jullie gebouw uitdagend?',
        'velden' => [],
    ],
    'huidig-beheer' => [
        'titel'  => 'Hoe wordt je appartement momenteel beheerd?',
        'velden' => ['huidig_beheer'],
    ],
];

$opslag   = [];
$sleutels = [];
foreach ($alle as $id => $meta) {
    $pad = MYMMO_FORMS_DIR . 'voorbeelden/' . $id . '.html';
    if (!is_file($pad)) {
        fwrite(STDERR, "Geen voorbeeld '{$id}' in voorbeelden/\n");
        exit(1);
    }
    $opslag[$id] = [
        'name'   => $id,
        'title'  => $meta['titel'],
        'sub'    => Mymmo_Forms_Steps::example_meta($id)['sub'] ?? '',
        'fields' => $meta['velden'],
        'nav'    => 'plugin',
        'html'   => file_get_contents($pad),
    ];
    $sleutels = array_merge($sleutels, $meta['velden']);
}
$sleutels[] = 'gebouw_kenmerken';
$GLOBALS['__options']['mymmo_forms_steps'] = $opslag;

// ── Het formulier dat de API zou teruggeven ─────────────────────────────────
$velden = [
    ['key' => 'naam', 'label' => 'Je naam', 'type' => 'text', 'required' => true, 'width' => 'half'],
    ['key' => 'email', 'label' => 'E-mailadres', 'type' => 'email', 'required' => true, 'width' => 'half'],
];
foreach (array_unique($sleutels) as $s) {
    $velden[] = ['key' => $s, 'label' => $s, 'type' => 'hidden', 'required' => false, 'width' => 'full'];
}

$GLOBALS['__formulieren'] = [];
$GLOBALS['__formulieren']['offerte'] = [
    'slug' => 'offerte', 'name' => 'Nog even je gegevens',
    'description' => 'Dan sturen we je meteen een voorstel op maat.',
    'version' => 1, 'submit_label' => 'Vraag je offerte aan', 'success_message' => 'Bedankt!',
    'fields' => $velden,
    // De kleuren van Syndicoach: mint met donkerblauw erop.
    'theme' => ['accent' => '#99f6e4', 'accent_text' => '#0369a1'],
    'languages' => ['nl'], 'default_language' => 'nl',
];

// Het tweede formulier: "Stuur een bericht". BEWUST zonder de verborgen velden
// van de stappen -- dat is precies het venster waar het misging.
$GLOBALS['__formulieren']['contact'] = [
    'slug' => 'contact', 'name' => 'Stuur ons een bericht',
    'description' => 'We nemen zo snel mogelijk contact op.',
    'version' => 1, 'submit_label' => 'Versturen', 'success_message' => 'Bedankt!',
    'fields' => [
        ['key' => 'naam', 'label' => 'Je naam', 'type' => 'text', 'required' => true, 'width' => 'half'],
        ['key' => 'email', 'label' => 'E-mailadres', 'type' => 'email', 'required' => true, 'width' => 'half'],
        ['key' => 'bericht', 'label' => 'Je bericht', 'type' => 'textarea', 'required' => false, 'width' => 'full'],
    ],
    'theme' => ['accent' => '#99f6e4', 'accent_text' => '#0369a1'],
    'languages' => ['nl'], 'default_language' => 'nl',
];

final class Mymmo_Forms_Api_Client {
    public static function get_form(string $slug) { return $GLOBALS['__formulieren'][$slug] ?? null; }
    public static function last_error(): string { return 'gestubd'; }
    public static function served_stale(): bool { return false; }
}

require_once MYMMO_FORMS_DIR . 'includes/class-presets.php';
require_once MYMMO_FORMS_DIR . 'includes/class-entrypoints.php';
require_once MYMMO_FORMS_DIR . 'includes/class-shortcodes.php';

// ── De OPSTELLING: het venster, één keer gemaakt ────────────────────────────
$GLOBALS['__options']['mymmo_forms_presets'] = [
    'offerte-homepage' => [
        'id'    => 'offerte-homepage',
        'name'  => 'Offerte — homepage',
        'soort' => 'knop',
        // Drie tabbladen, zoals op de site: "Bereken je prijs" (het derde
        // tabblad, met de stappen), "Stuur een bericht" (het formulier-tabblad)
        // en "Plan een gesprek". De stappen staan dus op `extra_steps`, NIET op
        // `steps` -- daar ging het mis.
        'atts'  => [
            'slug'        => 'contact',
            'extra_slug'  => 'offerte',
            'extra_steps' => 'gebouwgrootte,gebouwkenmerken,huidig-beheer',
            'tab_extra'   => 'Bereken je prijs',
            'tab_form'    => 'Stuur een bericht',
            'tab_order'   => 'extra,form,calendly',
            'label'       => 'Vraag offerte aan',
            'title'       => 'Laat ons kennismaken',
            'calendly'    => 'https://calendly.com/mymmo/kennismaking',
            'panel'       => $layout === 'breed' ? 'breed' : '',
            'form_title'  => 'Nog even je gegevens',
            'form_sub'    => 'Dan sturen we je meteen een voorstel.',
        ],
        'updated' => 0,
    ],
];

// ── DE INGANG die we bekijken ───────────────────────────────────────────────
$ingang = [
    'id'    => 'proef',
    'name'  => 'Proef',
    'popup' => 'offerte-homepage',
    'soort' => $soort,
    'atts'  => [
        'label'     => 'Vraag je offerte aan',
        'trigger'   => 'open-offerte',
        'highlight' => $uitgelicht,
        'layout'    => $layout,
        'title'     => 'Eindelijk gebouwbeheer gemaakt voor jou. Vraag je offerte aan.',
        'text'      => 'Beantwoord een paar korte vragen over je gebouw en ontdek je offerte op maat.',
        'cta'       => 'Vraag offerte aan',
        'image'     => 'https://link.openvme.be/assets/brand/thingies/thingies_lift.svg',
        'bg'        => '#a7f3e4',
    ] + ($kaal ? ['chrome' => 'no'] : []),
    'updated' => 0,
];

$callout = Mymmo_Forms_Shortcodes::render_ingang($ingang);

// ── De pagina eromheen ──────────────────────────────────────────────────────
$assets = MYMMO_FORMS_DIR . 'assets/';
echo '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">';
echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
echo '<title>Callout: ' . esc_html($uitgelicht) . ' (' . esc_html($layout) . ')</title>';
// Inline en niet <link>: dit bestand wordt als los bestand geopend.
foreach ([
    __DIR__ . '/../public/mymmo-forms.css',
    $assets . 'css/mymmo-forms-modal.css',
    $assets . 'css/mymmo-forms-steps.css',
    $assets . 'css/mymmo-forms-callout.css',
] as $css) {
    echo '<style>' . file_get_contents($css) . '</style>';
}
echo '<style>body{margin:0;padding:40px 24px;background:#ffffff;'
    . 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#12384f}'
    . '/* Zo breed als een gewone inhoudskolom van een thema: zo zie je of het blok er goed uitbreekt. */ .proef{max-width:745px;margin:0 auto}</style>';
// mymmo-forms-steps.js staat op een echte pagina in de KOP (zie
// Mymmo_Forms_Shortcodes::register_assets); hier dus ook, anders test je een
// volgorde die op de site niet bestaat.
echo '<script>' . file_get_contents($assets . 'js/mymmo-forms-steps.js') . '</script>';
echo '</head><body><div class="proef">';
if ($soort === 'klasse') {
    echo '<p><button type="button" class="open-offerte">Een knop van het thema</button></p>';
}
echo $callout;
echo '</div>';
foreach ([$assets . 'js/mymmo-forms.js', $assets . 'js/mymmo-forms-modal.js'] as $js) {
    echo '<script>' . file_get_contents($js) . '</script>';
}
echo '</body></html>';
