<?php
/**
 * Plugin Name:       Mymmo News
 * Plugin URI:        https://openvme.be
 * Description:       Toont de nieuwsfeed uit de Operations Manager. Haalt op, duwt niet: alles staat in Odoo en de plugin bewaart niets.
 * Version:           1.2.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            mymmo
 * Text Domain:       mymmo-news
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('MYMMO_NEWS_VERSION', '1.2.0');
define('MYMMO_NEWS_FILE', __FILE__);
define('MYMMO_NEWS_DIR', plugin_dir_path(__FILE__));
define('MYMMO_NEWS_URL', plugin_dir_url(__FILE__));

require_once MYMMO_NEWS_DIR . 'includes/helpers.php';
require_once MYMMO_NEWS_DIR . 'includes/class-cache.php';
require_once MYMMO_NEWS_DIR . 'includes/class-api-client.php';
require_once MYMMO_NEWS_DIR . 'includes/class-renderers.php';
require_once MYMMO_NEWS_DIR . 'includes/class-shortcodes.php';
require_once MYMMO_NEWS_DIR . 'includes/class-rest.php';
require_once MYMMO_NEWS_DIR . 'includes/class-settings.php';

add_action('init', static function (): void {
    Mymmo_News_Renderers::bootstrap();
    Mymmo_News_Shortcodes::register();
});

add_action('rest_api_init', ['Mymmo_News_Rest', 'register']);
add_action('admin_menu', ['Mymmo_News_Settings', 'menu']);
add_action('admin_init', ['Mymmo_News_Settings', 'register']);

/**
 * De stylesheet en het script worden REGISTREERD bij wp_enqueue_scripts en pas
 * ENQUEUED door de shortcode zelf. Zo laadt een pagina zonder feed niets --
 * dat scheelt op elke pagina van de site, en het is de reden dat deze plugin
 * geen invloed heeft op de laadtijd van pagina's waar ze niet gebruikt wordt.
 */
add_action('wp_enqueue_scripts', static function (): void {
    wp_register_style(
        'mymmo-news',
        MYMMO_NEWS_URL . 'assets/css/mymmo-news.css',
        [],
        MYMMO_NEWS_VERSION
    );
    wp_register_script(
        'mymmo-news',
        MYMMO_NEWS_URL . 'assets/js/mymmo-news.js',
        [],
        MYMMO_NEWS_VERSION,
        true
    );
});

register_deactivation_hook(__FILE__, static function (): void {
    // De cache is wegwerpbaar: alles staat in Odoo. Bij het uitschakelen
    // ruimen we ze op zodat een herinstallatie met verse data begint.
    Mymmo_News_Cache::purge_all();
});
