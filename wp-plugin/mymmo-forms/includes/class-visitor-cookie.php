<?php
/**
 * De bezoeker-cookie (ovme_uuid) SERVER-SIDE opnieuw zetten.
 *
 * Waarom: het tracking-script zet ovme_uuid met JavaScript, voor twee jaar.
 * Safari (iPhone, iPad, Mac) houdt een cookie die door JavaScript gezet is
 * hoogstens 7 dagen bij. Wie na een week terugkomt, is daar dus een nieuwe
 * bezoeker: het pad naar een aanvraag breekt, en "tijd tot conversie" oogt
 * korter dan hij is. Een cookie die de SERVER zet in een HTTP-antwoord van
 * dezelfde site, valt niet onder die grens.
 *
 * Het script (website-tracker, /t.js) roept deze route hoogstens één keer per
 * dag aan met de UUID die het al heeft. Deze route verzint geen UUID en leest
 * niets anders: ze zet enkel dezelfde waarde opnieuw, dit keer vanuit PHP.
 *
 * Bewust een REST-route en niet bij het renderen van een pagina: de sites
 * hebben een paginacache, en een gecachete pagina stuurt geen Set-Cookie mee --
 * of erger, die van de vorige bezoeker.
 */

defined('ABSPATH') || exit;

class Mymmo_Forms_Visitor_Cookie {

    private const REST_NS  = 'mymmo-forms/v1';
    private const COOKIE   = 'ovme_uuid';
    private const LEVENSDUUR = 2 * YEAR_IN_SECONDS;

    public static function init(): void {
        add_action('rest_api_init', [self::class, 'register_route']);
    }

    public static function register_route(): void {
        register_rest_route(self::REST_NS, '/bezoeker', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [self::class, 'rest_set'],
        ]);
    }

    public static function rest_set(WP_REST_Request $request): WP_REST_Response {
        $uuid = strtolower(trim((string) $request->get_param('uuid')));
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $uuid)) {
            return new WP_REST_Response(['ok' => false], 400);
        }

        setcookie(self::COOKIE, $uuid, [
            'expires'  => time() + self::LEVENSDUUR,
            'path'     => '/',
            'secure'   => is_ssl(),
            // NIET httponly: het tracking-script en mymmo-forms-modal.js lezen
            // deze cookie in de browser.
            'httponly' => false,
            'samesite' => 'Lax',
        ]);

        $antwoord = new WP_REST_Response(null, 204);
        $antwoord->header('Cache-Control', 'no-store');
        return $antwoord;
    }
}
