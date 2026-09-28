<?php
/**
 * HTTP naar de publieke nieuws-API van de Operations Manager.
 *
 * Regels die hier gelden:
 *  - timeout van 3 seconden; langer wachten is nooit acceptabel voor een
 *    paginarender
 *  - bij elke fout, timeout of niet-200 vallen we terug op de
 *    last-known-good; de bezoeker ziet nooit een lege of gebroken feed
 *  - de sitesleutel gaat mee als HEADER en komt NOOIT in de HTML of in een
 *    URL die de browser ziet
 *  - de ETag van de vorige respons gaat mee als If-None-Match, zodat een 304
 *    het verversen goedkoop houdt
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_News_Api_Client {

    private const TIMEOUT = 3;
    private const PATH_PREFIX = '/content-feed/public/v1';

    /** De payloadvorm waar deze plugin op gebouwd is. Zie check_shape(). */
    private const EXPECTED_SHAPE = 3;

    /** Per request cachen, zodat twee shortcodes op één pagina één call doen. */
    private static array $memo = [];

    private static ?string $last_error = null;
    private static bool $served_stale = false;
    private static ?int $shape_mismatch = null;

    public static function last_error(): ?string {
        return self::$last_error;
    }

    public static function served_stale(): bool {
        return self::$served_stale;
    }

    /**
     * Draait de OM op een nieuwere payloadvorm dan deze plugin kent?
     * Dan hoort de beheerder te weten dat de plugin bijgewerkt moet worden,
     * in plaats van stil het verkeerde of niets te tonen.
     */
    public static function shape_mismatch(): ?int {
        return self::$shape_mismatch;
    }

    /**
     * De berichten.
     *
     * @param array<string,mixed> $args type, tag, limit, offset
     * @return array{items:array<int,array<string,mixed>>,meta:array<string,mixed>}
     */
    public static function get_items(array $args = []): array {
        $params = [];
        foreach (['type', 'tag'] as $sleutel) {
            if (!empty($args[$sleutel])) {
                $waarde = is_array($args[$sleutel]) ? implode(',', $args[$sleutel]) : (string) $args[$sleutel];
                if ($waarde !== '') {
                    $params[$sleutel] = $waarde;
                }
            }
        }
        $params['limit'] = max(1, min(100, (int) ($args['limit'] ?? 12)));
        $params['offset'] = max(0, (int) ($args['offset'] ?? 0));

        $response = self::request('/items', $params, 60);
        if (!is_array($response)) {
            return ['items' => [], 'meta' => []];
        }
        return [
            'items' => is_array($response['items'] ?? null) ? $response['items'] : [],
            'meta' => is_array($response['meta'] ?? null) ? $response['meta'] : [],
        ];
    }

    /**
     * De types en labels, voor de filterbalk en om shortcode-slugs te kunnen
     * nakijken.
     *
     * @return array{types:array<int,array<string,string>>,tags:array<int,array<string,string>>}
     */
    public static function get_taxonomy(): array {
        $response = self::request('/taxonomy', [], 300);
        if (!is_array($response)) {
            return ['types' => [], 'tags' => []];
        }
        return [
            'types' => is_array($response['types'] ?? null) ? $response['types'] : [],
            'tags' => is_array($response['tags'] ?? null) ? $response['tags'] : [],
        ];
    }

    /**
     * Eén verzoek, met cache, ETag en terugval.
     *
     * @return array<string,mixed>|null
     */
    private static function request(string $endpoint, array $params, int $ttl, bool $zonder_etag = false) {
        $base = Mymmo_News_Settings::base_url();
        $key_header = Mymmo_News_Settings::site_key();

        if ($base === '' || $key_header === '') {
            self::$last_error = 'De verbinding met de Operations Manager is nog niet ingesteld.';
            return null;
        }

        $memo_key = $endpoint . '?' . wp_json_encode($params);
        if (array_key_exists($memo_key, self::$memo)) {
            return self::$memo[$memo_key];
        }

        $cache_key = Mymmo_News_Cache::key($endpoint, $params);
        $fresh = Mymmo_News_Cache::get_fresh($cache_key);
        if ($fresh !== null) {
            self::$memo[$memo_key] = $fresh['data'];
            return $fresh['data'];
        }

        $url = rtrim($base, '/') . self::PATH_PREFIX . $endpoint;
        if ($params) {
            $url .= '?' . http_build_query($params);
        }

        $headers = [
            'X-Mymmo-Site-Key' => $key_header,
            'Accept' => 'application/json',
        ];
        $etag = $zonder_etag ? null : Mymmo_News_Cache::get_etag($cache_key);
        if ($etag !== null) {
            $headers['If-None-Match'] = $etag;
        }

        $response = wp_remote_get($url, [
            'timeout' => self::TIMEOUT,
            'headers' => $headers,
            'redirection' => 2,
        ]);

        if (is_wp_error($response)) {
            self::$last_error = $response->get_error_message();
            return self::$memo[$memo_key] = self::fallback($cache_key);
        }

        $status = (int) wp_remote_retrieve_response_code($response);

        // 304: de body is niet gewijzigd. De transient verlengen en de
        // bewaarde versie gebruiken -- dat is het hele punt van de ETag.
        if ($status === 304) {
            Mymmo_News_Cache::touch($cache_key, $ttl);
            $stale = Mymmo_News_Cache::get_stale($cache_key);
            if (is_array($stale) && array_key_exists('data', $stale)) {
                return self::$memo[$memo_key] = $stale['data'];
            }
            // 304 zonder bewaarde body: de ETag heeft de inhoud overleefd.
            // Teruggeven wat we hebben (niets) zou een LEGE feed opleveren
            // zonder dat er ook maar iets misging -- de stilste faalmodus die
            // er is. Dus opnieuw vragen, nu zonder If-None-Match.
            return self::$memo[$memo_key] = self::request($endpoint, $params, $ttl, true);
        }

        if ($status !== 200) {
            self::$last_error = sprintf('De API antwoordde met %d.', $status);
            return self::$memo[$memo_key] = self::fallback($cache_key);
        }

        $data = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($data)) {
            self::$last_error = 'De API gaf geen geldige JSON terug.';
            return self::$memo[$memo_key] = self::fallback($cache_key);
        }

        self::check_shape($data);

        $new_etag = wp_remote_retrieve_header($response, 'etag');
        Mymmo_News_Cache::put($cache_key, $data, is_string($new_etag) && $new_etag !== '' ? $new_etag : null, $ttl);

        return self::$memo[$memo_key] = $data;
    }

    /**
     * Een nieuwere payloadvorm dan deze plugin kent, MELDEN we -- we stoppen
     * er niet mee. De vorm is additief opgebouwd, dus oude velden blijven
     * werken; stilvallen zou erger zijn dan een verouderde weergave.
     */
    private static function check_shape(array $data): void {
        $shape = (int) ($data['meta']['shape_version'] ?? 0);
        if ($shape > self::EXPECTED_SHAPE) {
            self::$shape_mismatch = $shape;
        }
    }

    /** @return array<string,mixed>|null */
    private static function fallback(string $cache_key) {
        $stale = Mymmo_News_Cache::get_stale($cache_key);
        if ($stale === null) {
            return null;
        }
        self::$served_stale = true;
        return $stale['data'];
    }
}
