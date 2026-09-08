<?php
/**
 * REST-endpoints: maandwissels zonder herladen, en een verversing van de
 * cache op afroep.
 *
 * /calendar en /list zijn enkel gebruikt als progressive enhancement door
 * mymmo-events.js: een klik op vorige/volgende maand blijft óók zonder JS
 * werken via de gewone ?mymmo_month=-link (zie de templates). Is JS
 * actief, dan onderschept die de klik en haalt hij hier alleen de HTML
 * voor de nieuwe maand op, in plaats van de hele pagina opnieuw te laden.
 * Publiek en zonder nonce: dit zijn dezelfde gegevens die de shortcode
 * toch al voor iedereen server-side rendert, enkel opnieuw ingepakt als
 * JSON. De bestaande transient-cache in Mymmo_Events_Api_Client (standaard
 * 60s, zie mymmo_events_cache_ttl) zorgt dat snel heen-en-weer bladeren
 * niet bij elke klik de Operations Manager-API belast.
 *
 * /reload (v1.6.12) is een expliciete cache-leging voor als een pagina zo
 * lang openstaat dat de gewone 60s-cache niet vroeg genoeg ververst --
 * of, vaker, om een wijziging in de Operations Manager METEEN zichtbaar
 * te maken in plaats van tot 60s te wachten. Beveiligd met een token
 * (mymmo_events_reload_token, in te stellen bij Instellingen → Mymmo
 * Events) in plaats van een nonce, want dit moet ook werken als gewone
 * GET-link (bv. een knop in de Operations Manager) en als server-naar-
 * server-aanroep vanuit de Worker na een schrijfactie -- geen van beide
 * heeft een ingelogde WordPress-sessie. Zonder ingesteld token blijft dit
 * endpoint geweigerd; er is bewust geen "geen token = geen controle".
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Rest {

    private const NAMESPACE = 'mymmo-events/v1';

    public static function init(): void {
        add_action('rest_api_init', [self::class, 'register_routes']);
    }

    public static function register_routes(): void {
        register_rest_route(self::NAMESPACE, '/reload', [
            'methods' => 'GET',
            'callback' => [self::class, 'reload'],
            'permission_callback' => '__return_true',
            'args' => [
                'token' => ['type' => 'string', 'required' => true],
            ],
        ]);

        // Diagnostiek. ALLEEN LEZEN en alleen voor wie in wp-admin naar
        // dezelfde informatie mag kijken (manage_options) -- geen token, want
        // dit is geen server-naar-server-seintje maar een beheerdersvraag.
        // Bewust geen __return_true: hier staan padnamen, plugin-fouten en
        // regels uit debug.log in.
        register_rest_route(self::NAMESPACE, '/diag', [
            'methods' => 'GET',
            'callback' => [self::class, 'diag'],
            'permission_callback' => static function () {
                return current_user_can('manage_options');
            },
        ]);

        register_rest_route(self::NAMESPACE, '/calendar', [
            'methods' => 'GET',
            'callback' => [self::class, 'calendar'],
            'permission_callback' => '__return_true',
            'args' => [
                'month' => ['type' => 'string', 'required' => true],
                'type' => ['type' => 'string', 'required' => false, 'default' => ''],
                'format' => ['type' => 'string', 'required' => false, 'default' => ''],
            ],
        ]);

        register_rest_route(self::NAMESPACE, '/list', [
            'methods' => 'GET',
            'callback' => [self::class, 'listing'],
            'permission_callback' => '__return_true',
            'args' => [
                'month' => ['type' => 'string', 'required' => true],
                'type' => ['type' => 'string', 'required' => false, 'default' => ''],
                'format' => ['type' => 'string', 'required' => false, 'default' => ''],
                'layout' => ['type' => 'string', 'required' => false, 'default' => 'rows'],
                'show_past' => ['type' => 'boolean', 'required' => false, 'default' => false],
                'limit' => ['type' => 'integer', 'required' => false, 'default' => 50],
            ],
        ]);
    }

    /**
     * Cache volledig leegmaken (transients + last-known-good). De
     * eerstvolgende aanvraag -- van eender wie -- haalt daardoor weer
     * live op bij de Operations Manager.
     */
    public static function reload(WP_REST_Request $request) {
        $configured = (string) get_option('mymmo_events_reload_token', '');
        $submitted = (string) $request->get_param('token');

        if ($configured === '' || !hash_equals($configured, $submitted)) {
            return new WP_Error('mymmo_events_bad_token', 'Ongeldig of ontbrekend token.', ['status' => 403]);
        }

        Mymmo_Events_Cache::purge_all();

        return rest_ensure_response(['ok' => true, 'purged' => true]);
    }

    /**
     * Wat de WordPress-kern-API niet geeft: gepauzeerde plugins, de omvang
     * van de autoload-options, wijzigingen aan active_plugins en de laatste
     * fatals uit debug.log. Zie class-diagnostics.php.
     */
    public static function diag(): WP_REST_Response {
        return new WP_REST_Response(Mymmo_Events_Diagnostics::report(), 200);
    }

    public static function calendar(WP_REST_Request $request) {
        $month = self::sanitize_month((string) $request->get_param('month'));
        if ($month === null) {
            return new WP_Error('mymmo_events_bad_month', 'Ongeldige maand.', ['status' => 400]);
        }

        $data = Mymmo_Events_Shortcodes::build_calendar_data(
            $month,
            (string) $request->get_param('type'),
            (string) $request->get_param('format')
        );

        return rest_ensure_response([
            'month' => $data['month'],
            'html' => mymmo_events_render('partials/calendar-inner', $data),
        ]);
    }

    public static function listing(WP_REST_Request $request) {
        $month = self::sanitize_month((string) $request->get_param('month'));
        if ($month === null) {
            return new WP_Error('mymmo_events_bad_month', 'Ongeldige maand.', ['status' => 400]);
        }

        $layout = (string) $request->get_param('layout') === 'cards' ? 'cards' : 'rows';
        $show_past = (bool) $request->get_param('show_past');
        $limit = max(1, min(200, (int) $request->get_param('limit')));

        $data = Mymmo_Events_Shortcodes::build_list_data(
            $month,
            (string) $request->get_param('type'),
            (string) $request->get_param('format'),
            $show_past,
            $layout,
            $limit
        );

        return rest_ensure_response([
            'month' => $data['month'],
            'html' => mymmo_events_render('partials/list-inner', $data),
        ]);
    }

    private static function sanitize_month(string $month): ?string {
        return preg_match('/^\d{4}-\d{2}$/', $month) ? $month : null;
    }
}
