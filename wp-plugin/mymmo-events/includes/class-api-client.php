<?php
/**
 * HTTP naar de publieke API van de Operations Manager.
 *
 * Regels die hier gelden:
 *  - timeout van 3 seconden; langer wachten is nooit acceptabel voor een
 *    paginarender
 *  - bij elke fout, timeout of niet-200 vallen we terug op de
 *    last-known-good; de bezoeker ziet nooit een lege of gebroken kalender
 *  - de sitesleutel gaat mee als header en komt NOOIT in de HTML
 *  - de ETag van de vorige respons gaat mee als If-None-Match, zodat een
 *    304 het pollen goedkoop houdt
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Api_Client {

    private const TIMEOUT = 3;
    private const PATH_PREFIX = '/events-v2/public/v1';

    /** @var array<string,mixed> Per request cachen, zodat een pagina met twee shortcodes een call doet. */
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
     * Lijst met gepubliceerde events.
     *
     * @param array<string,mixed> $args from, to, type, format, limit, include_past
     * @return array<int,array<string,mixed>>
     */
    public static function get_events(array $args = []): array {
        $params = array_filter([
            'from' => $args['from'] ?? null,
            'to' => $args['to'] ?? null,
            'type' => $args['type'] ?? null,
            'format' => $args['format'] ?? null,
            'limit' => isset($args['limit']) ? (int) $args['limit'] : null,
            'include_past' => !empty($args['include_past']) ? '1' : null,
        ], static fn ($v) => $v !== null && $v !== '');

        $payload = self::request('/events', $params, (int) get_option('mymmo_events_cache_ttl', 300));
        $events = is_array($payload['events'] ?? null) ? $payload['events'] : [];

        return array_values(array_filter($events, 'is_array'));
    }

    /**
     * Een event op slug, of op Odoo-id als $key numeriek is.
     * @return array<string,mixed>|null
     */
    public static function get_event(string $key): ?array {
        if ($key === '') {
            return null;
        }

        $payload = self::request(
            '/events/' . rawurlencode($key),
            [],
            (int) get_option('mymmo_events_cache_ttl', 300)
        );

        $event = $payload['event'] ?? null;
        return is_array($event) ? $event : null;
    }

    /** @return array<int,array<string,mixed>> */
    public static function get_event_types(): array {
        $payload = self::request('/event-types', [], 900);
        $types = is_array($payload['event_types'] ?? null) ? $payload['event_types'] : [];
        return array_values(array_filter($types, 'is_array'));
    }

    /**
     * Een inschrijving doorsturen. Geen cache, en de fout van de API komt
     * ongewijzigd terug zodat de bezoeker een bruikbare boodschap krijgt.
     *
     * @param array<string,mixed> $data
     * @return array{ok:bool,status:int,body:array<string,mixed>,error:?string}
     */
    public static function register(string $slug, array $data): array {
        $base = self::base_url();
        $site_key = self::site_key();

        if ($base === '' || $site_key === '') {
            return ['ok' => false, 'status' => 0, 'body' => [], 'error' => 'De koppeling met de Operations Manager is niet ingesteld.'];
        }

        $response = wp_remote_post(
            $base . self::PATH_PREFIX . '/events/' . rawurlencode($slug) . '/register',
            [
                'timeout' => 8,
                'headers' => [
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                    'X-Mymmo-Site-Key' => $site_key,
                ],
                'body' => wp_json_encode($data),
            ]
        );

        if (is_wp_error($response)) {
            self::log('inschrijving mislukt: ' . $response->get_error_message());
            return ['ok' => false, 'status' => 0, 'body' => [], 'error' => 'De inschrijving kon niet verstuurd worden. Probeer het straks opnieuw.'];
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $body = is_array($body) ? $body : [];

        if ($status >= 200 && $status < 300) {
            // De vrije plaatsen moeten meteen kloppen.
            Mymmo_Events_Cache::purge_fresh();
            return ['ok' => true, 'status' => $status, 'body' => $body, 'error' => null];
        }

        $message = isset($body['error']) && is_string($body['error']) && $body['error'] !== ''
            ? $body['error']
            : 'De inschrijving werd niet aanvaard.';

        if ($status >= 500) {
            self::log('inschrijving gaf ' . $status . ': ' . $message);
            $message = 'De inschrijving kon niet verwerkt worden. Probeer het straks opnieuw.';
        }

        return ['ok' => false, 'status' => $status, 'body' => $body, 'error' => $message];
    }

    /**
     * Een GET met cache, ETag en vangnet.
     *
     * @param array<string,mixed> $params
     * @return array<string,mixed>
     */
    private static function request(string $path, array $params, int $ttl): array {
        $cache_key = Mymmo_Events_Cache::key($path, $params);

        if (isset(self::$memo[$cache_key])) {
            return self::$memo[$cache_key];
        }

        $fresh = Mymmo_Events_Cache::get_fresh($cache_key);
        if ($fresh !== null) {
            self::$memo[$cache_key] = (array) $fresh['data'];
            return self::$memo[$cache_key];
        }

        $base = self::base_url();
        $site_key = self::site_key();

        if ($base === '' || $site_key === '') {
            self::$last_error = 'De koppeling met de Operations Manager is niet ingesteld.';
            return self::fallback($cache_key);
        }

        $url = add_query_arg($params, $base . self::PATH_PREFIX . $path);

        $headers = [
            'Accept' => 'application/json',
            'X-Mymmo-Site-Key' => $site_key,
        ];
        $etag = Mymmo_Events_Cache::get_etag($cache_key);
        if ($etag !== null) {
            $headers['If-None-Match'] = $etag;
        }

        $response = wp_remote_get($url, ['timeout' => self::TIMEOUT, 'headers' => $headers]);

        if (is_wp_error($response)) {
            self::$last_error = $response->get_error_message();
            self::log('GET ' . $path . ' mislukt: ' . self::$last_error);
            return self::fallback($cache_key);
        }

        $status = (int) wp_remote_retrieve_response_code($response);

        // Niets gewijzigd: de bewaarde versie blijft geldig.
        if ($status === 304) {
            Mymmo_Events_Cache::touch($cache_key, $ttl);
            $stale = Mymmo_Events_Cache::get_stale($cache_key);
            $data = $stale !== null ? (array) $stale['data'] : [];
            self::$memo[$cache_key] = $data;
            return $data;
        }

        if ($status !== 200) {
            self::$last_error = 'De Operations Manager antwoordde met ' . $status . '.';
            self::log('GET ' . $path . ' gaf ' . $status);
            return self::fallback($cache_key);
        }

        $decoded = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($decoded)) {
            self::$last_error = 'Onleesbaar antwoord van de Operations Manager.';
            self::log('GET ' . $path . ' gaf geen geldige JSON');
            return self::fallback($cache_key);
        }

        $new_etag = wp_remote_retrieve_header($response, 'etag');
        Mymmo_Events_Cache::put($cache_key, $decoded, is_string($new_etag) && $new_etag !== '' ? $new_etag : null, $ttl);

        self::$memo[$cache_key] = $decoded;
        return $decoded;
    }

    /** @return array<string,mixed> */
    private static function fallback(string $cache_key): array {
        $stale = Mymmo_Events_Cache::get_stale($cache_key);
        if ($stale !== null) {
            self::$served_stale = true;
            self::$memo[$cache_key] = (array) $stale['data'];
            return self::$memo[$cache_key];
        }
        self::$memo[$cache_key] = [];
        return [];
    }

    public static function base_url(): string {
        return rtrim((string) get_option('mymmo_events_api_base', ''), '/');
    }

    private static function site_key(): string {
        return trim((string) get_option('mymmo_events_site_key', ''));
    }

    /** Verbinding testen vanuit de instellingenpagina. */
    public static function test_connection(): array {
        $base = self::base_url();
        $site_key = self::site_key();

        if ($base === '' || $site_key === '') {
            return ['ok' => false, 'message' => 'Vul eerst de API-URL en de sitesleutel in.'];
        }

        $response = wp_remote_get(
            $base . self::PATH_PREFIX . '/event-types',
            ['timeout' => 8, 'headers' => ['Accept' => 'application/json', 'X-Mymmo-Site-Key' => $site_key]]
        );

        if (is_wp_error($response)) {
            return ['ok' => false, 'message' => 'Geen verbinding: ' . $response->get_error_message()];
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        if ($status === 401) {
            return ['ok' => false, 'message' => 'Verbinding werkt, maar de sitesleutel wordt geweigerd (401).'];
        }
        if ($status !== 200) {
            return ['ok' => false, 'message' => 'De Operations Manager antwoordde met ' . $status . '.'];
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $count = is_array($body['event_types'] ?? null) ? count($body['event_types']) : 0;
        $shape = $body['meta']['shape_version'] ?? '?';

        return ['ok' => true, 'message' => sprintf('Verbinding werkt. %d event types gevonden, contractversie %s.', $count, (string) $shape)];
    }

    private static function log(string $message): void {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[mymmo-events] ' . $message);
        }
    }
}
