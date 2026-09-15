<?php
/**
 * Cache in twee lagen, zoals bij Mymmo Events.
 *
 *  1. transient  -- korte TTL (standaard 300s), de gewone weg
 *  2. option     -- last-known-good, zonder vervaldatum, het vangnet
 *
 * De tweede laag is het hele punt: valt de Operations Manager weg, dan blijft
 * het formulier gewoon staan in plaats van te verdwijnen. Een bezoeker die
 * midden in een offerteaanvraag zit, mag geen lege pagina krijgen omdat er
 * toevallig een deploy bezig is.
 *
 * Een formulierschema is bewust langer gecached dan de eventkalender (300s tegen
 * 60s): een kalender verandert dagelijks, een formulier zelden. Bij het opslaan
 * in de OM verandert het versienummer, en dan is de volgende ophaling sowieso
 * een verse -- de ETag zorgt dat dat goedkoop blijft.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Cache {

    private const TRANSIENT_PREFIX = 'mymmo_forms_s_';
    private const LKG_PREFIX       = 'mymmo_forms_lkg_';
    private const INDEX_OPTION     = 'mymmo_forms_cached_slugs';

    public static function ttl(): int {
        $ttl = (int) get_option('mymmo_forms_cache_ttl', 300);
        return max(0, min(3600, $ttl));
    }

    private static function key(string $slug): string {
        // md5 en niet de slug zelf: een transient-sleutel mag hoogstens 172
        // tekens zijn en de slug kan er 80 hebben, prefix inbegrepen.
        return md5($slug);
    }

    /** @return array<string,mixed>|null */
    public static function get(string $slug): ?array {
        if (self::ttl() === 0) {
            return null;
        }
        $data = get_transient(self::TRANSIENT_PREFIX . self::key($slug));
        return is_array($data) ? $data : null;
    }

    /**
     * @param array<string,mixed> $payload
     */
    public static function set(string $slug, array $payload, string $etag = ''): void {
        $bundle = ['payload' => $payload, 'etag' => $etag, 'cached_at' => time()];

        if (self::ttl() > 0) {
            set_transient(self::TRANSIENT_PREFIX . self::key($slug), $bundle, self::ttl());
        }

        // Last-known-good heeft geen vervaldatum. autoload staat op false: dit
        // kan een paar kB per formulier zijn en hoort niet bij elk verzoek
        // ingeladen te worden.
        update_option(self::LKG_PREFIX . self::key($slug), $bundle, false);
        self::remember_slug($slug);
    }

    /** @return array<string,mixed>|null */
    public static function get_last_known_good(string $slug): ?array {
        $data = get_option(self::LKG_PREFIX . self::key($slug), null);
        return is_array($data) ? $data : null;
    }

    /**
     * De ETag van wat we al hebben, voor If-None-Match. Leeg als er niets is.
     */
    public static function etag(string $slug): string {
        $bundle = self::get($slug) ?? self::get_last_known_good($slug);
        return is_array($bundle) && isset($bundle['etag']) ? (string) $bundle['etag'] : '';
    }

    /**
     * Een 304 betekent: wat we hebben klopt nog. Dus alleen de transient
     * verversen, de inhoud blijft.
     */
    public static function touch(string $slug): void {
        $bundle = self::get_last_known_good($slug);
        if (is_array($bundle) && self::ttl() > 0) {
            $bundle['cached_at'] = time();
            set_transient(self::TRANSIENT_PREFIX . self::key($slug), $bundle, self::ttl());
        }
    }

    /**
     * De LIJST voor de shortcode-bouwer in de instellingen: de gepubliceerde
     * formulieren én de afspraken die de Operations Manager kent.
     *
     * Die twee zitten in één bundel omdat ze in één antwoord binnenkomen:
     * één verzoek, één cache, één knop "opnieuw ophalen". Een tweede
     * transient zou betekenen dat die knop de ene wel en de andere niet
     * ververst, en dat merk je pas als je de verkeerde lijst zit te lezen.
     *
     * Kortere TTL dan een formulierschema (60s tegen 300s) en bewust GEEN
     * last-known-good: dit is een beheerderslijstje. Is de Operations Manager
     * even weg, dan hoort daar een melding te staan, niet een stille lijst van
     * gisteren waaruit iemand een shortcode kiest voor een formulier dat
     * intussen misschien niet meer bestaat.
     *
     * @return array{payload:array{forms:array<int,mixed>,calendly:array<int,mixed>},etag:string,cached_at:int}|null
     */
    public static function get_index(): ?array {
        $data = get_transient(self::TRANSIENT_PREFIX . 'index');
        if (!is_array($data) || !isset($data['payload'])) {
            return null;
        }

        // Een transient van vóór de afspraken hield enkel de formulierenlijst.
        // Die blijft hoogstens 60 seconden staan, maar in die minuut mag het
        // scherm geen PHP-fout geven op een ontbrekende sleutel.
        $data['payload'] = self::normaliseer_index($data['payload']);
        return $data;
    }

    /**
     * @param array<string,mixed> $bundel  ['forms' => [...], 'calendly' => [...]]
     */
    public static function set_index(array $bundel, string $etag = ''): void {
        set_transient(
            self::TRANSIENT_PREFIX . 'index',
            ['payload' => self::normaliseer_index($bundel), 'etag' => $etag, 'cached_at' => time()],
            60
        );
    }

    /**
     * @param mixed $payload
     * @return array{forms:array<int,mixed>,calendly:array<int,mixed>}
     */
    private static function normaliseer_index($payload): array {
        if (!is_array($payload)) {
            return ['forms' => [], 'calendly' => []];
        }
        if (!isset($payload['forms'])) {
            return ['forms' => array_values(array_filter($payload, 'is_array')), 'calendly' => []];
        }
        return [
            'forms'    => is_array($payload['forms']) ? array_values(array_filter($payload['forms'], 'is_array')) : [],
            'calendly' => isset($payload['calendly']) && is_array($payload['calendly'])
                ? array_values(array_filter($payload['calendly'], 'is_array'))
                : [],
        ];
    }

    public static function purge_index(): void {
        delete_transient(self::TRANSIENT_PREFIX . 'index');
    }

    public static function purge(string $slug): void {
        delete_transient(self::TRANSIENT_PREFIX . self::key($slug));
    }

    /**
     * Alles leegmaken, inclusief de last-known-good. Wordt aangeroepen bij
     * deactiveren en vanuit de instellingenpagina.
     */
    public static function purge_all(): void {
        self::purge_index();
        foreach (self::known_slugs() as $slug) {
            delete_transient(self::TRANSIENT_PREFIX . self::key($slug));
            delete_option(self::LKG_PREFIX . self::key($slug));
        }
        delete_option(self::INDEX_OPTION);
    }

    /**
     * Welke slugs deze site ooit opgehaald heeft. Nodig omdat de sleutels
     * gehasht zijn: zonder index kan purge_all() ze niet terugvinden.
     *
     * @return array<int,string>
     */
    public static function known_slugs(): array {
        $slugs = get_option(self::INDEX_OPTION, []);
        return is_array($slugs) ? array_values(array_filter($slugs, 'is_string')) : [];
    }

    private static function remember_slug(string $slug): void {
        $slugs = self::known_slugs();
        if (in_array($slug, $slugs, true)) {
            return;
        }
        $slugs[] = $slug;
        // Bovengrens: een site die per ongeluk honderden slugs opvraagt mag de
        // options-tabel niet laten groeien.
        if (count($slugs) > 100) {
            $slugs = array_slice($slugs, -100);
        }
        update_option(self::INDEX_OPTION, $slugs, false);
    }
}
