<?php
/**
 * HTTP naar de publieke formulier-API van de Operations Manager.
 *
 * Regels die hier gelden, overgenomen van Mymmo_Events_Api_Client omdat ze daar
 * hun nut bewezen hebben:
 *  - korte timeout bij het LEZEN (3s); langer wachten is nooit acceptabel voor
 *    een paginarender
 *  - bij elke fout, timeout of niet-200 vallen we terug op de last-known-good;
 *    de bezoeker ziet nooit een leeg formulier
 *  - de sitesleutel gaat mee als header en komt NOOIT in de HTML
 *  - de ETag van de vorige respons gaat mee als If-None-Match, zodat een 304
 *    het pollen goedkoop houdt
 *
 * Bij het VERSTUREN gelden andere regels: daar is een timeout van 3 seconden
 * juist gevaarlijk. De inzending is dan misschien wel aangekomen en verwerkt,
 * maar wij weten het niet en tonen een fout -- waarna de bezoeker opnieuw
 * verstuurt. Vandaar 15 seconden, en geen enkele automatische herhaling.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Api_Client {

    private const READ_TIMEOUT   = 3;
    private const SUBMIT_TIMEOUT = 15;
    private const PATH_PREFIX    = '/forminator-v2/public/v1/forms';

    /** @var array<string,array<string,mixed>|null> Per request memoiseren: twee shortcodes op een pagina = een call per slug. */
    private static array $memo = [];

    private static ?string $last_error = null;
    private static bool $served_stale = false;

    public static function last_error(): ?string {
        return self::$last_error;
    }

    public static function served_stale(): bool {
        return self::$served_stale;
    }

    /**
     * Het schema van een formulier. Null als het echt nergens vandaan te halen
     * is (niet geconfigureerd, onbekende slug, en geen last-known-good).
     *
     * @return array<string,mixed>|null
     */
    public static function get_form(string $slug): ?array {
        if (array_key_exists($slug, self::$memo)) {
            return self::$memo[$slug];
        }

        $resultaat = self::fetch_form($slug);
        self::$memo[$slug] = $resultaat;
        return $resultaat;
    }

    /** @return array<string,mixed>|null */
    private static function fetch_form(string $slug): ?array {
        if (!mymmo_forms_is_configured()) {
            self::$last_error = 'De koppeling met de Operations Manager is nog niet ingesteld (Instellingen -> Mymmo Forms).';
            return null;
        }

        $cached = Mymmo_Forms_Cache::get($slug);
        if (is_array($cached) && isset($cached['payload'])) {
            return $cached['payload'];
        }

        $headers = [
            'X-Mymmo-Site-Key' => mymmo_forms_site_key(),
            'Accept'           => 'application/json',
        ];

        $etag = Mymmo_Forms_Cache::etag($slug);
        if ($etag !== '') {
            $headers['If-None-Match'] = $etag;
        }

        $response = wp_remote_get(
            mymmo_forms_api_base() . self::PATH_PREFIX . '/' . rawurlencode($slug),
            ['timeout' => self::READ_TIMEOUT, 'headers' => $headers]
        );

        if (is_wp_error($response)) {
            self::$last_error = $response->get_error_message();
            return self::fall_back($slug);
        }

        $code = (int) wp_remote_retrieve_response_code($response);

        // 304: wat we hebben klopt nog. Alleen de transient verversen.
        if ($code === 304) {
            Mymmo_Forms_Cache::touch($slug);
            $bundle = Mymmo_Forms_Cache::get_last_known_good($slug);
            if (is_array($bundle) && isset($bundle['payload'])) {
                return $bundle['payload'];
            }
            // 304 zonder last-known-good hoort niet te kunnen (we sturen alleen
            // If-None-Match als we iets hebben), maar dan is opnieuw ophalen
            // zonder ETag de enige uitweg.
            self::$last_error = 'Onverwachte 304 zonder bewaarde inhoud.';
            return null;
        }

        // 404: het formulier bestaat niet of staat nog op concept. Dat is geen
        // storing, dus GEEN terugval op een oude versie -- als het formulier
        // uit publicatie gehaald is, hoort het ook echt te verdwijnen.
        if ($code === 404) {
            self::$last_error = 'Dit formulier bestaat niet (meer) of staat nog op concept.';
            Mymmo_Forms_Cache::purge($slug);
            return null;
        }

        if ($code === 401) {
            self::$last_error = 'De Operations Manager weigerde de sitesleutel (401). Controleer de instelling.';
            return self::fall_back($slug);
        }

        if ($code !== 200) {
            self::$last_error = 'Onverwacht antwoord van de Operations Manager (' . $code . ').';
            return self::fall_back($slug);
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($body) || empty($body['success']) || !is_array($body['data'] ?? null)) {
            self::$last_error = 'Onleesbaar antwoord van de Operations Manager.';
            return self::fall_back($slug);
        }

        $payload = $body['data'];
        Mymmo_Forms_Cache::set(
            $slug,
            $payload,
            (string) wp_remote_retrieve_header($response, 'etag')
        );

        return $payload;
    }

    /** @return array<string,mixed>|null */
    private static function fall_back(string $slug): ?array {
        $bundle = Mymmo_Forms_Cache::get_last_known_good($slug);
        if (is_array($bundle) && isset($bundle['payload'])) {
            self::$served_stale = true;
            return $bundle['payload'];
        }
        return null;
    }

    /**
     * De lijst met gepubliceerde formulieren, voor de shortcode-bouwer.
     *
     * Geeft null bij een fout; last_error() vertelt dan wat er misging. Bewust
     * GEEN terugval op een oude lijst: dit scherm gebruikt een beheerder om een
     * shortcode te kiezen, en een stille lijst van gisteren zou hem een
     * formulier laten kiezen dat intussen niet meer gepubliceerd is.
     *
     * @return array<int,array<string,mixed>>|null
     */
    public static function list_forms(bool $ververs = false): ?array {
        if (!mymmo_forms_is_configured()) {
            self::$last_error = 'De koppeling met de Operations Manager is nog niet ingesteld.';
            return null;
        }

        if (!$ververs) {
            $bewaard = Mymmo_Forms_Cache::get_index();
            if (is_array($bewaard) && isset($bewaard['payload'])) {
                return $bewaard['payload'];
            }
        }

        $response = wp_remote_get(
            mymmo_forms_api_base() . self::PATH_PREFIX,
            [
                // Ruimer dan het leespad van een formulier: dit draait in
                // wp-admin, waar een halve seconde extra niemand stoort, en
                // niet tijdens het renderen van een pagina voor een bezoeker.
                'timeout' => 8,
                'headers' => [
                    'X-Mymmo-Site-Key' => mymmo_forms_site_key(),
                    'Accept'           => 'application/json',
                ],
            ]
        );

        if (is_wp_error($response)) {
            self::$last_error = $response->get_error_message();
            return null;
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code === 401) {
            self::$last_error = 'De Operations Manager weigerde de sitesleutel (401). Controleer de instelling hierboven.';
            return null;
        }
        if ($code !== 200) {
            self::$last_error = 'Onverwacht antwoord van de Operations Manager (' . $code . ').';
            return null;
        }

        $rauw = (string) wp_remote_retrieve_body($response);
        $body = json_decode($rauw, true);

        // Een 200 die GEEN JSON is, betekent bijna altijd hetzelfde: de Worker
        // kent dit pad niet en heeft de aanvraag doorgelaten naar de gewone
        // applicatie, die met een HTML-pagina antwoordt. In de praktijk: de
        // Worker is nog niet uitgerold met dit endpoint.
        //
        // "Onleesbaar antwoord" stuurde iemand met die situatie de verkeerde
        // kant op -- op zoek naar een fout in de plugin, terwijl er gewoon nog
        // gedeployd moest worden.
        if (!is_array($body)) {
            self::$last_error = str_starts_with(ltrim($rauw), '<')
                ? 'De Operations Manager stuurde een webpagina in plaats van gegevens. Meestal betekent dat dat de Worker nog niet uitgerold is met dit endpoint (wrangler deploy).'
                : 'Onleesbaar antwoord van de Operations Manager.';
            return null;
        }

        $forms = $body['data']['forms'] ?? null;
        if (empty($body['success']) || !is_array($forms)) {
            self::$last_error = 'De Operations Manager antwoordde, maar zonder formulierenlijst: ' . substr(trim(wp_strip_all_tags($rauw)), 0, 200);
            return null;
        }

        $forms = array_values(array_filter($forms, 'is_array'));
        Mymmo_Forms_Cache::set_index($forms, (string) wp_remote_retrieve_header($response, 'etag'));

        return $forms;
    }

    /**
     * Een inzending doorsturen.
     *
     * @param array<string,mixed> $values
     * @param array<string,mixed> $meta
     * @return array{ok:bool,error:string}
     */
    public static function submit(string $slug, array $values, array $meta): array {
        if (!mymmo_forms_is_configured()) {
            return ['ok' => false, 'error' => 'Dit formulier is nog niet volledig ingesteld. Neem contact met ons op.'];
        }

        $response = wp_remote_post(
            mymmo_forms_api_base() . self::PATH_PREFIX . '/' . rawurlencode($slug) . '/submit',
            [
                'timeout' => self::SUBMIT_TIMEOUT,
                'headers' => [
                    'X-Mymmo-Site-Key' => mymmo_forms_site_key(),
                    'Content-Type'     => 'application/json',
                    'Accept'           => 'application/json',
                ],
                'body' => wp_json_encode(['form_data' => $values, 'meta' => $meta]),
            ]
        );

        if (is_wp_error($response)) {
            // Bewust niet automatisch opnieuw proberen: bij een timeout weten we
            // niet of de inzending aankwam, en een herhaling zou een dubbele
            // kunnen maken. De pipeline dedupliceert wel op een hash van de
            // payload, maar daarop bouwen we hier geen gedrag.
            error_log('[mymmo-forms] inzending mislukt: ' . $response->get_error_message());
            return ['ok' => false, 'error' => 'We konden je bericht niet versturen. Probeer het zo meteen opnieuw.'];
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);

        if ($code === 200 && is_array($body) && !empty($body['success'])) {
            return ['ok' => true, 'error' => ''];
        }

        // 422 = de OM keurde de inhoud af. Die melding gaat over een veld en is
        // in het Nederlands geschreven, dus die tonen we letterlijk. Alle andere
        // codes zijn techniek en krijgen een algemene tekst -- een bezoeker
        // heeft niets aan "502 Bad Gateway".
        if ($code === 422 && is_array($body) && !empty($body['error'])) {
            return ['ok' => false, 'error' => (string) $body['error']];
        }

        error_log('[mymmo-forms] inzending geweigerd (' . $code . '): ' . wp_remote_retrieve_body($response));
        return ['ok' => false, 'error' => 'We konden je bericht niet versturen. Probeer het zo meteen opnieuw.'];
    }
}
