<?php
/**
 * REST-endpoint voor maandwissels zonder herladen.
 *
 * Enkel gebruikt als progressive enhancement door mymmo-events.js: een klik
 * op vorige/volgende maand blijft óók zonder JS werken via de gewone
 * ?mymmo_month=-link (zie de templates). Is JS actief, dan onderschept die
 * de klik en haalt hij hier alleen de HTML voor de nieuwe maand op, in
 * plaats van de hele pagina opnieuw te laden.
 *
 * Publiek en zonder nonce: dit zijn dezelfde gegevens die de shortcode
 * toch al voor iedereen server-side rendert, enkel opnieuw ingepakt als
 * JSON. De bestaande transient-cache in Mymmo_Events_Api_Client (standaard
 * 60s, zie mymmo_events_cache_ttl) zorgt dat snel heen-en-weer bladeren
 * niet bij elke klik de Operations Manager-API belast.
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
