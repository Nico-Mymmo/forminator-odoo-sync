<?php
/**
 * Cache in twee lagen.
 *
 * 1. Transient — normale snelheid, korte levensduur.
 * 2. Last-known-good in een option — vangnet als de API wegvalt.
 *
 * De tweede laag is de reden dat we geen events hoeven te dubbelen in
 * WordPress: de pagina blijft staan als de Worker onbereikbaar is, maar er
 * is nog steeds maar een bron van waarheid.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Cache {

    private const TRANSIENT_PREFIX = 'mymmo_ev_';
    private const LKG_PREFIX = 'mymmo_ev_lkg_';
    private const INDEX_OPTION = 'mymmo_events_cache_index';

    /** Hoe lang een last-known-good bruikbaar blijft: 7 dagen. */
    private const LKG_MAX_AGE = 604800;

    /**
     * Sleutel uit endpoint plus parameters. Parameters worden eerst
     * gesorteerd, zodat een andere volgorde niet tot een tweede
     * cachevulling leidt.
     */
    public static function key(string $endpoint, array $params = []): string {
        ksort($params);
        return substr(md5($endpoint . '|' . wp_json_encode($params)), 0, 24);
    }

    /** @return array{data:mixed,etag:?string}|null */
    public static function get_fresh(string $key): ?array {
        $value = get_transient(self::TRANSIENT_PREFIX . $key);
        return is_array($value) && array_key_exists('data', $value) ? $value : null;
    }

    /**
     * Last-known-good, ook als de transient verlopen is.
     * @return array{data:mixed,etag:?string,stored_at:int}|null
     */
    public static function get_stale(string $key): ?array {
        $value = get_option(self::LKG_PREFIX . $key, null);
        if (!is_array($value) || !array_key_exists('data', $value)) {
            return null;
        }
        if (time() - (int) ($value['stored_at'] ?? 0) > self::LKG_MAX_AGE) {
            return null;
        }
        return $value;
    }

    /** De ETag van de laatst geslaagde respons, voor If-None-Match. */
    public static function get_etag(string $key): ?string {
        $fresh = self::get_fresh($key);
        if ($fresh && !empty($fresh['etag'])) {
            return (string) $fresh['etag'];
        }
        $stale = self::get_stale($key);
        return $stale && !empty($stale['etag']) ? (string) $stale['etag'] : null;
    }

    public static function put(string $key, $data, ?string $etag, int $ttl): void {
        $payload = ['data' => $data, 'etag' => $etag, 'stored_at' => time()];

        set_transient(self::TRANSIENT_PREFIX . $key, $payload, max(30, $ttl));
        update_option(self::LKG_PREFIX . $key, $payload, false);
        self::remember_key($key);
    }

    /** De transient verlengen na een 304, zonder de body opnieuw te schrijven. */
    public static function touch(string $key, int $ttl): void {
        $stale = self::get_stale($key);
        if ($stale === null) {
            return;
        }
        set_transient(self::TRANSIENT_PREFIX . $key, $stale, max(30, $ttl));
    }

    /**
     * Alles wissen. KV-achtige wildcards bestaan niet in de options-tabel,
     * dus we houden zelf een index bij van uitgedeelde sleutels.
     */
    public static function purge_all(): void {
        foreach (self::index() as $key) {
            delete_transient(self::TRANSIENT_PREFIX . $key);
            delete_option(self::LKG_PREFIX . $key);
        }
        delete_option(self::INDEX_OPTION);
    }

    /**
     * Alleen de transients wissen en de last-known-good laten staan.
     * Gebruikt na een inschrijving: het aantal vrije plaatsen moet meteen
     * kloppen, maar het vangnet mag blijven.
     */
    public static function purge_fresh(): void {
        foreach (self::index() as $key) {
            delete_transient(self::TRANSIENT_PREFIX . $key);
        }
    }

    /** @return string[] */
    private static function index(): array {
        $index = get_option(self::INDEX_OPTION, []);
        return is_array($index) ? array_values(array_unique(array_map('strval', $index))) : [];
    }

    private static function remember_key(string $key): void {
        $index = self::index();
        if (in_array($key, $index, true)) {
            return;
        }
        $index[] = $key;
        // Bovengrens zodat de index niet ongelimiteerd groeit.
        if (count($index) > 300) {
            $index = array_slice($index, -300);
        }
        update_option(self::INDEX_OPTION, $index, false);
    }
}
