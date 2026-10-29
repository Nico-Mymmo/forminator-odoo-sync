<?php
/**
 * Het seintje van de Operations Manager: "dit formulier is gewijzigd".
 *
 * De OM roept POST /wp-json/mymmo-forms/v1/formulier/ververs aan na elke
 * bewaring in de bouwer (forms/sein-sites.js), met enkel de slug. Zonder dat
 * bleef de vorige versie tot het einde van de bewaartijd staan (instelling
 * Cacheduur, tot een uur), en daarna nog in de paginacache.
 *
 * Zonder aanmelding, zoals het seintje van de productfeatures: het draagt geen
 * inhoud en kan niets anders dan de bewaarde versie laten vervallen. Wat er
 * daarna getoond wordt, haalt de site zelf op bij de OM, met haar eigen
 * sitesleutel. Hoogstens eens per 20 seconden per formulier.
 *
 * Enkel een formulier dat deze site al toonde (Mymmo_Forms_Cache::known_slugs)
 * wordt ververst; en enkel als de versie ECHT veranderde, wordt de paginacache
 * van de site geleegd -- een formulier staat in een venster dat op vele
 * pagina's kan staan, dus per pagina wissen kan niet.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Ververs {

    private const REST_NS = 'mymmo-forms/v1';
    private const REM     = 'mymmo_forms_ververs_';

    public static function init(): void {
        add_action('rest_api_init', [self::class, 'register_route']);
    }

    public static function register_route(): void {
        register_rest_route(self::REST_NS, '/formulier/ververs', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [self::class, 'rest_ververs'],
        ]);
    }

    public static function rest_ververs(WP_REST_Request $r): WP_REST_Response {
        $slug = (string) $r->get_param('slug');
        if (!preg_match('/^[a-z0-9-]{1,80}$/', $slug)) {
            return new WP_REST_Response(['ok' => false], 400);
        }
        Mymmo_Forms_Cache::purge_index();
        if (!in_array($slug, Mymmo_Forms_Cache::known_slugs(), true)) {
            return new WP_REST_Response(['ok' => true, 'gebruikt' => false]);
        }
        $rem = self::REM . md5($slug);
        if (get_transient($rem)) {
            return new WP_REST_Response(['ok' => true, 'later' => true]);
        }
        set_transient($rem, 1, 20);

        $voor = Mymmo_Forms_Cache::etag($slug);
        Mymmo_Forms_Cache::purge($slug);
        Mymmo_Forms_Api_Client::get_form($slug);
        $na = Mymmo_Forms_Cache::etag($slug);

        $gewijzigd = $na !== '' && $na !== $voor;
        if ($gewijzigd) {
            self::wis_paginacache();
        }
        return new WP_REST_Response(['ok' => true, 'gewijzigd' => $gewijzigd]);
    }

    /** De paginacache van de hele site legen, voor de gangbare cacheplugins. */
    private static function wis_paginacache(): void {
        if (function_exists('wp_cache_clear_cache')) {
            wp_cache_clear_cache();
        }
        if (function_exists('rocket_clean_domain')) {
            rocket_clean_domain();
        }
        if (function_exists('w3tc_flush_all')) {
            w3tc_flush_all();
        }
        do_action('litespeed_purge_all');
    }
}
