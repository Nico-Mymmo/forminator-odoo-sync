<?php
/**
 * AUTOMATISCH BIJWERKEN: de site haalt zelf de nieuwste versie op.
 *
 * Tot 1.9.1 ging elke versie met de hand naar elke site: zip bouwen, inloggen,
 * Plugins → Nieuwe plugin → Uploaden. Nu werkt het zo:
 *
 *   1. Een wijziging komt op `master` (na een groene huisstijlcontrole en een
 *      review -- zonder die twee komt ze daar niet).
 *   2. GitHub bouwt de zip en brengt ze uit als release `mymmo-cards-vX.Y.Z`
 *      (`.github/workflows/mymmo-cards-release.yml`).
 *   3. Elke site kijkt elk uur of er een nieuwere release is, en werkt zichzelf
 *      bij. In wp-admin staat ze ook gewoon onder Updates, voor wie niet wil
 *      wachten.
 *   4. Sinds 1.9.2 roept de workflow na een release ook `POST
 *      /wp-json/mymmo-cards/v1/kijk` aan: dan kijkt de site METEEN, en staat een
 *      component er binnen enkele minuten in plaats van binnen het uur. Wie een
 *      component bedenkt en het op een testpagina wil zien, wacht anders een uur
 *      per aanpassing.
 *
 * WAAROM DE SITE HAALT EN NIEMAND DUWT: een duw (een connector, een upload
 * vanuit een Claude-sessie) gaat buiten de controles om, en hangt af van wie er
 * op dat moment werkt. Zo kan alleen wat op master staat op een site komen.
 * De oproep van stap 4 is GEEN duw: ze draagt geen code en geen versie, ze zegt
 * enkel "kijk eens". Wat de site daarna binnenhaalt, gaat door dezelfde
 * controles in release() als het uurlijkse kijken.
 *
 * WAT EEN RELEASE MOET ZIJN OM MEE TE TELLEN -- iemand met schrijfrechten op de
 * repo kan zelf een release maken, en die mag niet op de sites belanden:
 *   - gemaakt door `github-actions[bot]` (de workflow), niet door een mens;
 *   - de tag heet `mymmo-cards-vX.Y.Z` en er hangt `mymmo-cards-X.Y.Z.zip` aan;
 *   - de commit van die tag staat op `master` (de compare-API zegt `behind` of
 *     `identical`). Een workflow die vanuit een eigen branch een release maakt,
 *     valt daarop af.
 *
 * Bijwerken gebeurt in WP-CRON, net als de automatische updates van WordPress
 * zelf: buiten cron zet de upgrader een actieve plugin eerst UIT, en hier is
 * geen browser die ze daarna weer aanzet.
 *
 * Uitzetten: `define('MYMMO_CARDS_GEEN_AUTO_UPDATE', true);` in wp-config.php.
 * Dan verschijnt een nieuwe versie nog wel onder Updates, maar installeert ze
 * zich niet zelf. `AUTOMATIC_UPDATER_DISABLED` werkt ook.
 *
 * Bestand onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Updates {

    private const REPO       = 'Nico-Mymmo/forminator-odoo-sync';
    private const TAG        = 'mymmo-cards-v';
    private const BOT        = 'github-actions[bot]';
    private const SLUG       = 'mymmo-cards';
    private const CACHE      = 'mymmo_cards_release';
    private const CRON       = 'mymmo_cards_bijwerken';
    private const SLOT       = 'mymmo_cards_bijwerken_slot';
    private const KIJK       = 'mymmo_cards_kijk';

    public static function init(): void {
        // De host in "Update URI" (de kop van mymmo-cards.php) is github.com;
        // WordPress vraagt de versie dan aan deze filter en NIET aan
        // wordpress.org. Zo kan een plugin met dezelfde naam daar nooit een
        // "update" aanbieden.
        add_filter('update_plugins_github.com', [self::class, 'versie'], 10, 3);
        add_filter('plugins_api', [self::class, 'details'], 10, 3);
        add_filter('auto_update_plugin', [self::class, 'automatisch'], 10, 2);
        add_action(self::CRON, [self::class, 'bijwerken']);
        add_action('init', [self::class, 'plan']);
        add_action('rest_api_init', [self::class, 'routes']);
        register_deactivation_hook(MYMMO_CARDS_FILE, [self::class, 'stop']);
    }

    private static function basis(): string {
        return plugin_basename(MYMMO_CARDS_FILE);
    }

    private static function uit(): bool {
        return (defined('MYMMO_CARDS_GEEN_AUTO_UPDATE') && MYMMO_CARDS_GEEN_AUTO_UPDATE)
            || (defined('AUTOMATIC_UPDATER_DISABLED') && AUTOMATIC_UPDATER_DISABLED);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wat GitHub heeft
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De nieuwste geldige release, of null. Een uur bewaard; bij een storing
     * een kwartier, zodat een site niet elke paginaweergave GitHub vraagt.
     *
     * @return array{versie:string,zip:string,url:string,notities:string}|null
     */
    public static function release(bool $vers = false): ?array {
        if (!$vers) {
            $bewaard = get_site_transient(self::CACHE);
            if (is_array($bewaard)) {
                return ($bewaard['versie'] ?? '') === '' ? null : $bewaard;
            }
        }

        $lijst = self::github('releases?per_page=30');
        if (!is_array($lijst)) {
            set_site_transient(self::CACHE, ['versie' => ''], 15 * MINUTE_IN_SECONDS);
            return null;
        }

        $beste = null;
        foreach ($lijst as $rij) {
            if (!is_array($rij) || !empty($rij['draft']) || !empty($rij['prerelease'])) {
                continue;
            }
            if (($rij['author']['login'] ?? '') !== self::BOT) {
                continue;
            }
            $tag = (string) ($rij['tag_name'] ?? '');
            if (strpos($tag, self::TAG) !== 0) {
                continue;
            }
            $versie = substr($tag, strlen(self::TAG));
            if (!preg_match('/^\d+\.\d+\.\d+$/', $versie)) {
                continue;
            }

            $zip = '';
            foreach ((array) ($rij['assets'] ?? []) as $bijlage) {
                if (($bijlage['name'] ?? '') === self::SLUG . '-' . $versie . '.zip') {
                    $zip = (string) ($bijlage['browser_download_url'] ?? '');
                }
            }
            if ($zip === '' || strpos($zip, 'https://github.com/' . self::REPO . '/') !== 0) {
                continue;
            }

            if ($beste === null || version_compare($versie, $beste['versie'], '>')) {
                $beste = [
                    'versie'   => $versie,
                    'zip'      => $zip,
                    'url'      => (string) ($rij['html_url'] ?? ''),
                    'notities' => (string) ($rij['body'] ?? ''),
                    'tag'      => $tag,
                ];
            }
        }

        // De nieuwste moet op master staan. Staat ze er niet op, dan nemen we
        // NIETS -- niet de op een na nieuwste: wie een release van buiten master
        // ziet, hoort te gaan kijken, niet stil een oudere te krijgen.
        if ($beste !== null && !self::op_master($beste['tag'])) {
            error_log('[mymmo-cards] release ' . $beste['tag'] . ' staat niet op master; genegeerd.');
            $beste = null;
        }

        set_site_transient(self::CACHE, $beste ?? ['versie' => ''], HOUR_IN_SECONDS - MINUTE_IN_SECONDS);

        return $beste;
    }

    private static function op_master(string $tag): bool {
        $vergelijking = self::github('compare/master...' . rawurlencode($tag));

        return is_array($vergelijking)
            && in_array($vergelijking['status'] ?? '', ['identical', 'behind'], true);
    }

    /** @return mixed het gedecodeerde antwoord, of null */
    private static function github(string $pad) {
        $antwoord = wp_remote_get('https://api.github.com/repos/' . self::REPO . '/' . $pad, [
            'timeout' => 10,
            'headers' => [
                'Accept'     => 'application/vnd.github+json',
                'User-Agent' => 'mymmo-cards/' . MYMMO_CARDS_VERSION,
            ],
        ]);

        if (is_wp_error($antwoord) || (int) wp_remote_retrieve_response_code($antwoord) !== 200) {
            return null;
        }

        return json_decode((string) wp_remote_retrieve_body($antwoord), true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wat WordPress ervan ziet
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Het antwoord voor `update_plugins_github.com`. WordPress vergelijkt zelf
     * de versie: hoger = een update, gelijk = "bijgewerkt" (en dan staat de
     * knop "Automatische updates" er ook).
     *
     * @param mixed $update
     * @param mixed $gegevens
     * @return mixed
     */
    public static function versie($update, $gegevens, $bestand) {
        if ($bestand !== self::basis()) {
            return $update;
        }

        $release = self::release();
        if ($release === null) {
            return $update;
        }

        return [
            'id'           => 'github.com/' . self::REPO . '/' . self::SLUG,
            'slug'         => self::SLUG,
            'version'      => $release['versie'],
            'url'          => $release['url'],
            'package'      => $release['zip'],
            'requires_php' => '8.0',
            'autoupdate'   => !self::uit(),
        ];
    }

    /**
     * "Bekijk details" in wp-admin: de notities van de release.
     *
     * @param mixed $resultaat
     * @param mixed $actie
     * @param mixed $args
     * @return mixed
     */
    public static function details($resultaat, $actie, $args) {
        if ($actie !== 'plugin_information' || !is_object($args) || ($args->slug ?? '') !== self::SLUG) {
            return $resultaat;
        }

        $release = self::release();
        if ($release === null) {
            return $resultaat;
        }

        return (object) [
            'name'          => 'Mymmo Componenten',
            'slug'          => self::SLUG,
            'version'       => $release['versie'],
            'author'        => 'Mymmo',
            'homepage'      => $release['url'],
            'requires_php'  => '8.0',
            'download_link' => $release['zip'],
            'sections'      => [
                'changelog' => wpautop(esc_html($release['notities'])),
            ],
        ];
    }

    /** @param mixed $update @param mixed $item */
    public static function automatisch($update, $item) {
        if (is_object($item) && ($item->plugin ?? '') === self::basis()) {
            return !self::uit();
        }

        return $update;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Meteen kijken, en zeggen welke versie hier draait
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Twee publieke routes:
     *
     *   GET  /wp-json/mymmo-cards/v1/versie   welke versie draait hier. Zo kan
     *        Claude nakijken of een component op de site staat, zonder in te
     *        loggen. Het nummer staat al in elke ?ver= van de stylesheets.
     *   POST /wp-json/mymmo-cards/v1/kijk     kijk NU op GitHub. De workflow
     *        roept dit aan na een nieuwe release.
     *
     * Zonder sleutel, en dat mag: de oproep draagt niets, en wat de site daarna
     * binnenhaalt moet door release() (enkel de workflow, enkel op master).
     * Wel hoogstens eens per drie minuten: elke keer kijken kost twee
     * GitHub-aanvragen, en zonder token krijgt een server er 60 per uur. Wie
     * de route bestookt, zou anders het bijwerken zelf lamleggen.
     *
     * Een oproep binnen die drie minuten wordt UITGESTELD, niet weggegooid: wie
     * twee aanpassingen kort na elkaar op de site zet, wacht anders een uur op
     * de tweede. Er staat hoogstens een kijkbeurt klaar, dus bestoken levert
     * niet meer beurten op.
     */
    public static function routes(): void {
        register_rest_route('mymmo-cards/v1', '/versie', [
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => static function (): WP_REST_Response {
                return new WP_REST_Response(['versie' => MYMMO_CARDS_VERSION], 200);
            },
        ]);

        register_rest_route('mymmo-cards/v1', '/kijk', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [self::class, 'kijk'],
        ]);
    }

    public static function kijk(): WP_REST_Response {
        if (self::uit()) {
            return new WP_REST_Response([
                'gepland' => false,
                'reden'   => 'automatisch bijwerken staat uit op deze site',
                'versie'  => MYMMO_CARDS_VERSION,
            ], 200);
        }

        // Een EIGEN argument ('nu'), zodat WordPress dit niet weigert als
        // dubbel van het uurlijkse kijken dat binnen tien minuten valt.
        $klaar = wp_next_scheduled(self::CRON, ['nu']);
        if ($klaar !== false) {
            return new WP_REST_Response([
                'gepland' => true,
                'om'      => gmdate('c', (int) $klaar),
                'versie'  => MYMMO_CARDS_VERSION,
            ], 202);
        }

        // KIJK = het vroegste moment voor de volgende beurt.
        $wanneer = max(time(), (int) get_transient(self::KIJK));
        wp_schedule_single_event($wanneer, self::CRON, ['nu']);
        set_transient(self::KIJK, $wanneer + 3 * MINUTE_IN_SECONDS, 15 * MINUTE_IN_SECONDS);

        // Het cachebestand weg, zodat ook Updates in wp-admin meteen klopt.
        delete_site_transient(self::CACHE);
        if ($wanneer <= time()) {
            spawn_cron();
        }

        return new WP_REST_Response([
            'gepland' => true,
            'om'      => gmdate('c', $wanneer),
            'versie'  => MYMMO_CARDS_VERSION,
        ], 202);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Elk uur nakijken en bijwerken
    // ─────────────────────────────────────────────────────────────────────────

    public static function plan(): void {
        if (!wp_next_scheduled(self::CRON)) {
            wp_schedule_event(time() + 5 * MINUTE_IN_SECONDS, 'hourly', self::CRON);
        }
    }

    public static function stop(): void {
        wp_clear_scheduled_hook(self::CRON);
    }

    /**
     * Werkt de plugin bij als er een nieuwere geldige release is. Alleen in
     * cron: daarbuiten zet de upgrader een actieve plugin eerst uit.
     */
    public static function bijwerken(): void {
        if (!wp_doing_cron() || self::uit()) {
            return;
        }
        if (function_exists('wp_is_file_mod_allowed') && !wp_is_file_mod_allowed('automatic_updater')) {
            return;
        }

        $release = self::release(true);
        if ($release === null || !version_compare($release['versie'], MYMMO_CARDS_VERSION, '>')) {
            return;
        }

        if (get_transient(self::SLOT)) {
            return;
        }
        set_transient(self::SLOT, 1, 10 * MINUTE_IN_SECONDS);

        require_once ABSPATH . 'wp-admin/includes/admin.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

        // Zodat het transient van WordPress de nieuwe versie kent: de upgrader
        // leest het pakket daaruit. Eerst WISSEN: in cron slaat
        // wp_update_plugins() de controle over als die minder dan twee uur oud
        // is, en dan staat de nieuwe versie er nog niet in.
        delete_site_transient('update_plugins');
        wp_update_plugins();

        $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
        $resultaat = $upgrader->upgrade(self::basis());

        delete_transient(self::SLOT);

        if (is_wp_error($resultaat) || $resultaat === false) {
            $reden = is_wp_error($resultaat) ? $resultaat->get_error_message() : 'onbekende fout';
            error_log('[mymmo-cards] bijwerken naar ' . $release['versie'] . ' mislukt: ' . $reden);
            return;
        }

        error_log('[mymmo-cards] bijgewerkt van ' . MYMMO_CARDS_VERSION . ' naar ' . $release['versie'] . '.');
    }
}
