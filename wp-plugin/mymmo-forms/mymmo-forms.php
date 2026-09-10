<?php
/**
 * Plugin Name:       Mymmo Forms
 * Description:       Formulieren die in de Operations Manager gebouwd worden, hier gerenderd met een shortcode. Geen formulierdefinities in WordPress.
 * Version:           1.0.5
 * Requires at least: 6.2
 * Requires PHP:      8.0
 * Author:            Mymmo
 * Text Domain:       mymmo-forms
 *
 * ONTWERPUITGANGSPUNT
 * -------------------
 * Er wordt in WordPress NIETS bewaard over formulieren: geen custom post type,
 * geen eigen tabellen, geen kopie van de velden. De Operations Manager is de
 * enige bron. Dat is exact hetzelfde uitgangspunt als bij Mymmo Events, en om
 * dezelfde reden: met twee kopieen loopt er vroeg of laat iets uit elkaar, en
 * dan weet niemand meer welke de juiste is.
 *
 * Wat hier wel lokaal staat is een CACHE in twee lagen -- een korte transient
 * voor de snelheid, plus een last-known-good in een option als vangnet. Valt de
 * API weg, dan blijft het formulier staan.
 *
 * INZENDINGEN worden hier niet bewaard. De browser post naar admin-post.php,
 * PHP praat server-naar-server met de Operations Manager, en die schrijft naar
 * Odoo via de bestaande Koppelingen-pipeline. Reden dat het niet rechtstreeks
 * uit de browser gaat: dan zou de sitesleutel in de HTML moeten staan.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('MYMMO_FORMS_VERSION', '1.0.5');
define('MYMMO_FORMS_FILE', __FILE__);
define('MYMMO_FORMS_DIR', plugin_dir_path(__FILE__));
define('MYMMO_FORMS_URL', plugin_dir_url(__FILE__));

require_once MYMMO_FORMS_DIR . 'includes/helpers.php';
require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';
require_once MYMMO_FORMS_DIR . 'includes/class-cache.php';
require_once MYMMO_FORMS_DIR . 'includes/class-api-client.php';
require_once MYMMO_FORMS_DIR . 'includes/class-settings.php';
require_once MYMMO_FORMS_DIR . 'includes/class-shortcodes.php';
require_once MYMMO_FORMS_DIR . 'includes/class-submit.php';

function mymmo_forms_bootstrap(): void {
    Mymmo_Forms_Settings::init();
    Mymmo_Forms_Shortcodes::init();
    Mymmo_Forms_Submit::init();
}
add_action('plugins_loaded', 'mymmo_forms_bootstrap');

/**
 * Er zijn geen rewrite rules om door te spoelen: de plugin claimt geen enkele
 * URL. Ze rendert alleen waar de shortcode staat en post naar admin-post.php.
 */
function mymmo_forms_deactivate(): void {
    Mymmo_Forms_Cache::purge_all();
}
register_deactivation_hook(__FILE__, 'mymmo_forms_deactivate');
