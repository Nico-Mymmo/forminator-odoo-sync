<?php
/**
 * Kan de plugin geladen worden?
 *
 *     php wp-plugin/mymmo-forms-laadproef.php
 *
 * Alle bestanden inladen en bootstrap() draaien, met de WordPress-functies die
 * daarbij aangeroepen worden als stub. Vangt parse-fouten, dubbele declaraties,
 * ontbrekende klassen en een verkeerde require-volgorde -- precies wat op een
 * echte site een witte pagina of "de plugin kon niet geactiveerd worden" geeft.
 *
 * Draai dit voor elke build. De rendertests laden maar een deel van de
 * bestanden; deze proef laadt ze allemaal, in dezelfde volgorde als WordPress.
 */

declare(strict_types=1);

// Standaard de map hiernaast, zodat je dit zonder argumenten kan draaien.
$wortel = $argv[1] ?? (__DIR__ . '/mymmo-forms');

define('ABSPATH', $wortel . '/');

$GLOBALS['__acties'] = [];
$GLOBALS['__shortcodes'] = [];

function add_action($haak, $fn, $prio = 10, $args = 1) { $GLOBALS['__acties'][] = $haak; return true; }
function add_filter($haak, $fn, $prio = 10, $args = 1) { return true; }
function add_shortcode($naam, $fn) { $GLOBALS['__shortcodes'][] = $naam; return true; }
function register_deactivation_hook($bestand, $fn) { return true; }
function plugin_dir_path($f) { return dirname($f) . '/'; }
function plugin_dir_url($f) { return 'https://voorbeeld.test/wp-content/plugins/mymmo-forms/'; }
function get_option($k, $d = null) { return $d; }
function update_option($k, $v, $a = true) { return true; }
function delete_option($k) { return true; }
function delete_transient($k) { return true; }
function get_transient($k) { return false; }
function set_transient($k, $v, $t = 0) { return true; }
function current_user_can($c) { return false; }
function admin_url($p = '') { return 'https://voorbeeld.test/wp-admin/' . $p; }
function esc_html($t) { return (string) $t; }
function esc_attr($t) { return (string) $t; }
function esc_url($u) { return (string) $u; }
function esc_url_raw($u) { return (string) $u; }
function sanitize_text_field($t) { return (string) $t; }
function sanitize_title($t) { return strtolower((string) $t); }
function sanitize_key($t) { return strtolower((string) $t); }
function sanitize_html_class($c) { return (string) $c; }
function wp_unslash($t) { return $t; }
function wp_json_encode($v) { return json_encode($v); }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function wp_register_style() { return true; }
function wp_register_script() { return true; }
function wp_enqueue_style() { return true; }
function wp_enqueue_script() { return true; }
function wp_localize_script() { return true; }
function register_setting() { return true; }
function wp_get_inline_script_tag($js, $a = []) { return '<script>' . $js . '</script>'; }
function register_block_type() { return true; }

$hoofd = $wortel . '/mymmo-forms.php';
if (!is_file($hoofd)) {
    fwrite(STDERR, "Geen mymmo-forms.php in {$wortel}\n");
    exit(1);
}

require_once $hoofd;

if (!function_exists('mymmo_forms_bootstrap')) {
    fwrite(STDERR, "mymmo_forms_bootstrap() bestaat niet.\n");
    exit(1);
}

mymmo_forms_bootstrap();

$verwacht = [
    'Mymmo_Forms_Presets', 'Mymmo_Forms_Entrypoints', 'Mymmo_Forms_Steps',
    'Mymmo_Forms_Settings', 'Mymmo_Forms_Shortcodes', 'Mymmo_Forms_Block',
    'Mymmo_Forms_Submit', 'Mymmo_Forms_I18n', 'Mymmo_Forms_Cache',
    'Mymmo_Forms_Api_Client',
];

$ontbreekt = array_values(array_filter($verwacht, static fn ($k) => !class_exists($k)));

echo "versie:      " . MYMMO_FORMS_VERSION . "\n";
echo "klassen:     " . (count($verwacht) - count($ontbreekt)) . '/' . count($verwacht) . "\n";
if ($ontbreekt !== []) {
    echo "ONTBREEKT:   " . implode(', ', $ontbreekt) . "\n";
    exit(1);
}
echo "acties:      " . count($GLOBALS['__acties']) . "\n";
echo "\nDe plugin laadt zonder fouten.\n";
