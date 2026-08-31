<?php
/**
 * Plugin Name:       Mymmo Events
 * Description:       Kalender, eventpagina's en inschrijvingen, rechtstreeks uit de OpenVME Operations Manager. Geen dubbele events in WordPress.
 * Version:           1.1.2
 * Requires at least: 6.2
 * Requires PHP:      8.0
 * Author:            Mymmo
 * Text Domain:       mymmo-events
 * Domain Path:       /languages
 *
 * ONTWERPUITGANGSPUNT
 * -------------------
 * Er wordt in WordPress NIETS bewaard over events: geen custom post type,
 * geen eigen tabellen, geen kopie van de records. De Operations Manager is
 * de enige bron, met Odoo als database daarachter.
 *
 * Wat wel lokaal staat is een CACHE in twee lagen: een korte transient voor
 * de snelheid, plus een last-known-good in een option als vangnet. Valt de
 * API weg, dan blijft de kalender staan. Omdat er maar een bron is, kan er
 * niets uit elkaar lopen — dat was het probleem met de vorige opzet.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('MYMMO_EVENTS_VERSION', '1.1.2');
define('MYMMO_EVENTS_FILE', __FILE__);
define('MYMMO_EVENTS_DIR', plugin_dir_path(__FILE__));
define('MYMMO_EVENTS_URL', plugin_dir_url(__FILE__));

/** Basispaden. Enkelvoud voor detail, meervoud voor het archief — zoals nu. */
define('MYMMO_EVENTS_DEFAULT_EVENT_BASE', 'event');
define('MYMMO_EVENTS_DEFAULT_ARCHIVE_BASE', 'events');

require_once MYMMO_EVENTS_DIR . 'includes/helpers.php';
require_once MYMMO_EVENTS_DIR . 'includes/class-cache.php';
require_once MYMMO_EVENTS_DIR . 'includes/class-api-client.php';
require_once MYMMO_EVENTS_DIR . 'includes/class-settings.php';
require_once MYMMO_EVENTS_DIR . 'includes/class-router.php';
require_once MYMMO_EVENTS_DIR . 'includes/class-shortcodes.php';
require_once MYMMO_EVENTS_DIR . 'includes/class-registration.php';

/**
 * Alles opstarten.
 */
function mymmo_events_bootstrap(): void {
    Mymmo_Events_Settings::init();
    Mymmo_Events_Router::init();
    Mymmo_Events_Shortcodes::init();
    Mymmo_Events_Registration::init();
}
add_action('plugins_loaded', 'mymmo_events_bootstrap');

/**
 * Bij activeren de rewrite rules registreren en meteen doorspoelen,
 * anders geeft /event/{slug}/ een 404 tot iemand de permalinks opslaat.
 */
function mymmo_events_activate(): void {
    Mymmo_Events_Router::register_rewrite_rules();
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'mymmo_events_activate');

function mymmo_events_deactivate(): void {
    flush_rewrite_rules();
    Mymmo_Events_Cache::purge_all();
}
register_deactivation_hook(__FILE__, 'mymmo_events_deactivate');
