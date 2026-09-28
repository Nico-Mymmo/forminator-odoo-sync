<?php
/**
 * Afspraaklinks: `?afspraak=<sleutel>` op ELKE pagina opent het venster op
 * "Plan een gesprek", met de agenda van die collega.
 *
 *   https://openvme.be/?afspraak=rob-demo
 *
 * BESTAND TEGEN EEN PAGINACACHE -- en daarom zo gebouwd.
 * De HTML die de server maakt, hangt NIET af van ?afspraak=. Op elke pagina
 * staat hetzelfde (dichte) venster van de opstelling, met de ALGEMENE agenda.
 * Pas in de browser leest mymmo-forms-booking.js de parameter, vraagt de
 * agenda op bij de REST-route hieronder, zet die in het venster en opent het.
 *
 * Wat een cache ook doet -- de query negeren, of de eerste versie voor elke
 * URL bewaren -- ze kan zo nooit de agenda van de ene bezoeker aan de andere
 * tonen: de pagina is voor iedereen gelijk, en de REST-route heeft de sleutel
 * in het PAD, dus een gecachet antwoord hoort altijd bij precies die sleutel.
 * Rendert de server de agenda zelf in de pagina (de eerste versie van 1.18.0),
 * dan kan een cache die de query negeert Robs agenda op de homepage van
 * iedereen zetten.
 *
 * In de URL staat NOOIT een Calendly-link: de sleutel wordt server-side
 * opgezocht bij de Operations Manager (zelfde sitesleutel), anders kan iedereen
 * op onze site de agenda van een vreemde tonen.
 *
 * Onbekend, gepauzeerd, `algemeen`, of de OM onbereikbaar: het venster opent
 * met de agenda van de opstelling zelf. Wie op "maak een afspraak" klikte,
 * hoort altijd iets te kunnen boeken.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Booking {

    public const PARAM    = 'afspraak';
    public const OPTION   = 'mymmo_forms_booking_preset';
    public const MODAL_ID = 'mymmo-afspraak';
    public const ALGEMEEN = 'algemeen';

    private const REST_NS    = 'mymmo-forms/v1';
    private const TRANSIENT  = 'mymmo_forms_bl_';
    private const TTL        = 120;
    private const TTL_NIETS  = 60;
    private const TIMEOUT    = 3;
    private const PATH       = '/forminator-v2/public/v1/booking-links/';

    public static function init(): void {
        add_action('init', [self::class, 'register_assets']);
        add_action('rest_api_init', [self::class, 'register_route']);
        // Vroeg in de voettekst: de scripts van het venster worden daar nog
        // meegenomen (wp_print_footer_scripts draait op prioriteit 20).
        add_action('wp_footer', [self::class, 'render'], 5);
    }

    public static function register_assets(): void {
        wp_register_script(
            'mymmo-forms-booking',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-booking.js',
            ['mymmo-forms-modal'],
            MYMMO_FORMS_VERSION,
            true
        );
    }

    public static function register_route(): void {
        register_rest_route(self::REST_NS, '/afspraak/(?P<slug>[a-z0-9-]{3,60})', [
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => [self::class, 'rest_lookup'],
        ]);
    }

    /**
     * Wat de browser krijgt: de boekingspagina en de titel, meer niet. Geen
     * id's, geen e-mailadres.
     */
    public static function rest_lookup(WP_REST_Request $request): WP_REST_Response {
        $slug = strtolower((string) $request->get_param('slug'));
        $link = self::lookup($slug);

        $antwoord = new WP_REST_Response(
            $link === null
                ? ['found' => false]
                : ['found' => true] + $link,
            200
        );
        // De sleutel staat in het pad, dus kort cachen is veilig; kort, zodat
        // een gepauzeerde link snel ophoudt te werken.
        $antwoord->header('Cache-Control', 'public, max-age=60');
        return $antwoord;
    }

    /**
     * De link bij een sleutel, of null.
     *
     * Kort bewaard, OOK als ze niet bestaat (korter): anders stuurt elke
     * bezoeker met een oude link een verzoek naar de Operations Manager.
     * Een fout (timeout, 5xx) wordt NIET bewaard -- dan proberen we het bij de
     * volgende bezoeker opnieuw.
     *
     * @return array<string,string>|null
     */
    public static function lookup(string $slug): ?array {
        if (!preg_match('/^[a-z0-9-]{3,60}$/', $slug) || $slug === self::ALGEMEEN || !mymmo_forms_is_configured()) {
            return null;
        }

        $sleutel = self::TRANSIENT . md5($slug);
        $bewaard = get_transient($sleutel);
        if (is_array($bewaard)) {
            return $bewaard['found'] ? $bewaard['data'] : null;
        }

        $response = wp_remote_get(
            mymmo_forms_api_base() . self::PATH . rawurlencode($slug),
            [
                'timeout' => self::TIMEOUT,
                'headers' => [
                    'X-Mymmo-Site-Key' => mymmo_forms_site_key(),
                    'Accept'           => 'application/json',
                ],
            ]
        );

        if (is_wp_error($response)) {
            return null;
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code === 404) {
            set_transient($sleutel, ['found' => false], self::TTL_NIETS);
            return null;
        }
        if ($code !== 200) {
            return null;
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $data = is_array($body) && !empty($body['success']) && is_array($body['data'] ?? null) ? $body['data'] : null;
        $url  = is_array($data) ? (string) ($data['url'] ?? '') : '';

        // Zelfde grens als de Operations Manager: enkel een boekingspagina van
        // Calendly. Wat hier doorkomt, belandt in een iframe op onze site.
        if (!preg_match('#^https://calendly\.com/[^\s"\'<>]+$#', $url)) {
            return null;
        }

        // De vinkjes: enkel teksten, hoogstens zes (zelfde grens als de OM).
        $punten = [];
        foreach ((array) ($data['points'] ?? []) as $punt) {
            $punt = sanitize_text_field(is_scalar($punt) ? (string) $punt : '');
            if ($punt !== '') {
                $punten[] = $punt;
            }
        }

        // De foto komt als data-URI (de OM leest ze uit Odoo). Alleen een
        // BEELD doorlaten: deze waarde belandt in een src op onze site.
        $foto = (string) ($data['photo'] ?? '');
        if ($foto !== '' && (strlen($foto) > 280000
            || !preg_match('#^data:image/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+=*$#', $foto))) {
            $foto = '';
        }

        $schoon = [
            'url'       => $url,
            'name'      => sanitize_text_field((string) ($data['name'] ?? '')),
            'tab_title' => sanitize_text_field((string) ($data['tab_title'] ?? '')),
            'intro'     => sanitize_textarea_field((string) ($data['intro'] ?? '')),
            'points'    => array_slice($punten, 0, 6),
            'photo'     => $foto,
        ];
        set_transient($sleutel, ['found' => true, 'data' => $schoon], self::TTL);
        return $schoon;
    }

    /**
     * Het venster, op ELKE pagina en ONAFHANKELIJK van de URL -- zie het
     * docblok bovenaan. Dicht; enkel mymmo-forms-booking.js opent het, en
     * alleen als ?afspraak= in de adresbalk staat.
     */
    public static function render(): void {
        if (is_admin() || is_feed() || is_embed()) {
            return;
        }

        $preset = sanitize_title((string) get_option(self::OPTION, ''));
        if ($preset === '') {
            return;
        }

        $opstelling = Mymmo_Forms_Presets::atts($preset);
        if ($opstelling === [] || trim((string) ($opstelling['calendly'] ?? '')) === '') {
            // Zonder eigen agenda heeft de opstelling geen tabblad "Plan een
            // gesprek", en dan is er niets om een persoonlijke agenda in te
            // zetten. Enkel melden aan wie het kan oplossen.
            if (current_user_can('manage_options')) {
                echo "<script>console.warn('Mymmo Forms: de opstelling voor afspraaklinks bestaat niet of heeft geen Calendly-link. Instellingen -> Mymmo Forms -> Verbinding.');</script>\n";
            }
            return;
        }

        // Het venster van de opstelling, met ENKEL de agenda (sinds 1.18.2).
        // Zelfde template als [mymmo_form_button] -- geen tweede weergave.
        echo Mymmo_Forms_Shortcodes::render_agenda([ // phpcs:ignore WordPress.Security.EscapeOutput -- eigen render
            'preset' => $preset,
            'button' => 'no',
            'id'     => self::MODAL_ID,
            'tab'    => 'calendly',
        ]);

        wp_enqueue_script('mymmo-forms-booking');
        wp_localize_script('mymmo-forms-booking', 'MymmoFormsBooking', [
            'param'    => self::PARAM,
            'algemeen' => self::ALGEMEEN,
            'modal'    => self::MODAL_ID,
            'rest'     => esc_url_raw(rest_url(self::REST_NS . '/afspraak/')),
        ]);
    }
}
