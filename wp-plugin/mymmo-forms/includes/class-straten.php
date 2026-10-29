<?php
/**
 * De straten van een postcode, voor de keuzelijst in het veld "Straat en
 * huisnummer" (assets/js/mymmo-forms-straat.js).
 *
 * De browser vraagt ze aan WordPress, WordPress aan de Operations Manager
 * (GET /forminator-v2/public/v1/streets/{land}/{postcode}): zo blijft de
 * sitesleutel op de server, zoals bij de formulieren en de afspraaklinks.
 *
 * Een dag bewaard per postcode: het zijn openbare gegevens (BeST) die hooguit
 * wekelijks veranderen. Een fout wordt NIET bewaard; dan is de lijst gewoon
 * leeg en typt de bezoeker zelf -- het veld werkt altijd, met of zonder lijst.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Straten {

    private const REST_NS   = 'mymmo-forms/v1';
    private const TRANSIENT = 'mymmo_forms_str_';
    private const TTL       = DAY_IN_SECONDS;
    private const TIMEOUT   = 3;
    private const PATH      = '/forminator-v2/public/v1/streets/';

    public static function init(): void {
        add_action('rest_api_init', [self::class, 'register_route']);
    }

    public static function register_route(): void {
        register_rest_route(self::REST_NS, '/straten/(?P<land>[A-Z]{2})/(?P<postcode>[0-9A-Za-z]{4,6})', [
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => [self::class, 'rest_lookup'],
        ]);
    }

    /** De basis-URL voor het veld; het script zet er de postcode achter. */
    public static function url(string $land): string {
        return rest_url(self::REST_NS . '/straten/' . rawurlencode($land) . '/');
    }

    public static function rest_lookup(WP_REST_Request $request): WP_REST_Response {
        $land     = strtoupper((string) $request->get_param('land'));
        $postcode = strtoupper((string) $request->get_param('postcode'));
        $antwoord = new WP_REST_Response(['straten' => self::lookup($land, $postcode)], 200);
        $antwoord->header('Cache-Control', 'public, max-age=86400');
        return $antwoord;
    }

    /** @return array<int,string|array<string,string>> */
    public static function lookup(string $land, string $postcode): array {
        if (!preg_match('/^[A-Z]{2}$/', $land) || !preg_match('/^[0-9A-Z]{4,6}$/', $postcode) || !mymmo_forms_is_configured()) {
            return [];
        }

        $sleutel = self::TRANSIENT . $land . '_' . $postcode;
        $bewaard = get_transient($sleutel);
        if (is_array($bewaard)) {
            return $bewaard;
        }

        $response = wp_remote_get(
            mymmo_forms_api_base() . self::PATH . rawurlencode($land) . '/' . rawurlencode($postcode),
            [
                'timeout' => self::TIMEOUT,
                'headers' => [
                    'X-Mymmo-Site-Key' => mymmo_forms_site_key(),
                    'Accept'           => 'application/json',
                ],
            ]
        );
        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
            return [];
        }

        $body    = json_decode((string) wp_remote_retrieve_body($response), true);
        $straten = is_array($body['data']['straten'] ?? null) ? $body['data']['straten'] : [];

        // Enkel teksten of {taal: tekst}: wat er terugkomt, gaat naar de browser.
        $schoon = [];
        foreach ($straten as $s) {
            if (is_string($s) && $s !== '') {
                $schoon[] = $s;
            } elseif (is_array($s)) {
                $talen = [];
                foreach (['nl', 'fr', 'de'] as $t) {
                    if (isset($s[$t]) && is_string($s[$t]) && $s[$t] !== '') {
                        $talen[$t] = $s[$t];
                    }
                }
                if ($talen) {
                    $schoon[] = $talen;
                }
            }
        }

        set_transient($sleutel, $schoon, self::TTL);
        return $schoon;
    }
}
