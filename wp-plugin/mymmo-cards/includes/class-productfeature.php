<?php
/**
 * DE PRODUCTFEATURE: een feature uit de bibliotheek van de Operations Manager
 * (Productfeatures), als blok op een pagina. Beeld links of rechts, ernaast
 * label, titel, uitleg, USP's en een knop -- de redacteur kiest wat er staat.
 *
 * DE TEKST KOMT UIT DE OM, NIET UIT DE PAGINA. Wat OpenVME kan, staat er EEN
 * keer; de pagina's nemen het over. Een aanpassing in de OM komt pas op de
 * site als iemand daar op "Naar de sites sturen" klikt (beslissing Nico,
 * 2026-10-22): zo staat een halve aanpassing nooit per ongeluk online. Er is
 * EEN versie per feature, voor alle pagina's samen.
 *
 * DE TEKST STAAT IN DE HTML. Het blok is dynamisch en schrijft de tekst
 * server-side in de pagina: zoekmachines lezen ze gewoon, ook zonder
 * JavaScript. De site bewaart de versie zelf (transient van een kwartier, en
 * daaronder de laatste goede versie als optie): valt de OM even weg, dan
 * staat de laatst gekende tekst er nog. Na "Naar de sites sturen" geeft de OM
 * de site een seintje (ververs(): zonder inhoud) en haalt de site de nieuwe
 * versie meteen op.
 *
 * DE VERBINDING IS DIE VAN MYMMO FORMS (adres + sitesleutel, Instellingen ->
 * Mymmo Forms). Enkel de twee opties worden gelezen; er wordt geen code van
 * die plugin aangeroepen. Zo hoeft er op geen enkele site iets ingesteld.
 *
 * WAAR HET BLOK STAAT, MELDT DE SITE ZELF aan de OM: bij elke bewaring van
 * een pagina (meld_gebruik()) en eens per dag alles (volledig()). Zo ziet de
 * OM bij elke feature op welke pagina's ze staat.
 *
 * GEEN TYPOGRAFIE: de titel is een gewone kop (h2 of h3) en volgt het thema;
 * het label krijgt de kleine lettergrootte VAN HET THEMA (has-small-font-size),
 * de knop is een gewone WordPress-knop (wp-block-button), die het thema
 * stijlt.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Productfeature {

    public const BLOK = 'mymmo/productfeature';

    private const NS        = 'mymmo-cards/v1';
    public const PAD        = '/productfeatures/public/v1';
    private const TTL       = 900;
    private const LIJST_TTL = 300;
    private const TIMEOUT   = 3;
    private const META      = '_mymmo_pf_ids';
    private const CRON      = 'mymmo_cards_pf_volledig';
    private const DIEPTE    = 5;

    /** @var array<string,array<string,mixed>|null> per verzoek */
    private static array $memo = [];

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
        add_action('rest_api_init', [self::class, 'routes']);
        add_action('wp_after_insert_post', [self::class, 'na_bewaren'], 20, 2);
        add_action('deleted_post', [self::class, 'na_verwijderen']);
        add_action(self::CRON, [self::class, 'volledig']);
        add_action('init', [self::class, 'plan_cron']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gesloten lijsten
    // ─────────────────────────────────────────────────────────────────────────

    /** @return array<string,string> */
    public static function kanten(): array {
        return [
            'links'  => 'Beeld links',
            'rechts' => 'Beeld rechts',
        ];
    }

    /** @return array<string,string> */
    public static function koppen(): array {
        return [
            'h2' => 'Kop 2',
            'h3' => 'Kop 3',
        ];
    }

    /**
     * De vorm van het beeld. Leeg = het beeld zoals het in de OM staat. De
     * andere bestaan enkel voor een beeld dat in de OM OPGEMAAKT is (de
     * achtergrondbouwer maakt het dan in elke vorm); anders valt het terug.
     *
     * @return array<string,string>
     */
    public static function vormen(): array {
        return [
            ''     => 'Zoals in de OM',
            '4:3'  => 'Liggend (4:3)',
            '3:2'  => 'Liggend (3:2)',
            '16:9' => 'Breed (16:9)',
            '1:1'  => 'Vierkant',
            '4:5'  => 'Staand (4:5)',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-productfeature', MYMMO_CARDS_URL . 'assets/css/mymmo-productfeature.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);

        wp_register_script(
            'mymmo-productfeature-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-productfeature-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-api-fetch', 'wp-server-side-render'],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_localize_script('mymmo-productfeature-editor', 'MymmoProductfeature', [
            'kanten' => self::keuzes(self::kanten()),
            'koppen' => self::keuzes(self::koppen()),
            'vormen' => self::keuzes(self::vormen()),
            'om'     => self::om_adres(),
        ]);

        register_block_type(self::BLOK, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-productfeature-editor',
            'style'           => 'mymmo-productfeature',
            'attributes'      => self::attributen(),
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-productfeature-editor.js (geen
     * bouwstap). De namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    public static function attributen(): array {
        return [
            'align'       => ['type' => 'string', 'default' => 'wide'],
            'featureId'   => ['type' => 'string', 'default' => ''],
            'kant'        => ['type' => 'string', 'default' => 'links'],
            'kop'         => ['type' => 'string', 'default' => 'h2'],
            'vorm'        => ['type' => 'string', 'default' => ''],
            'toonBeeld'   => ['type' => 'boolean', 'default' => true],
            'toonLabel'   => ['type' => 'boolean', 'default' => false],
            'toonTitel'   => ['type' => 'boolean', 'default' => true],
            'toonKort'    => ['type' => 'boolean', 'default' => true],
            'toonWaarom'  => ['type' => 'boolean', 'default' => false],
            'toonUsps'    => ['type' => 'boolean', 'default' => true],
            'toonKnop'    => ['type' => 'boolean', 'default' => false],
            // Leeg = "Meer lezen". De link zelf komt uit de OM.
            'knopTekst'   => ['type' => 'string', 'default' => ''],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // De verbinding met de OM (die van Mymmo Forms)
    // ─────────────────────────────────────────────────────────────────────────

    public static function api_basis(): string {
        return rtrim((string) get_option('mymmo_forms_api_base', ''), '/');
    }

    public static function sleutel(): string {
        return (string) get_option('mymmo_forms_site_key', '');
    }

    public static function verbonden(): bool {
        return self::api_basis() !== '' && self::sleutel() !== '';
    }

    /** Waar je de feature in de OM aanpast (voor de link in de editor). */
    public static function om_adres(): string {
        $basis = self::api_basis();
        return $basis !== '' ? esc_url_raw($basis . '/productfeatures') : '';
    }

    private static function transient(string $id): string {
        return 'mymmo_pf_' . md5($id);
    }

    private static function bewaard(string $id): string {
        return 'mymmo_pf_lkg_' . md5($id);
    }

    /**
     * De versie op de sites. Eerst het kwartier dat de site ze bewaart, dan de
     * OM (met de ETag van wat we hebben), en bij een storing de laatste goede.
     * Een 404 = niet (meer) op de sites: dan verdwijnt ze ook hier.
     *
     * @return array<string,mixed>|null
     */
    public static function feature(string $id): ?array {
        $id = (string) preg_replace('/[^a-zA-Z0-9-]/', '', $id);
        if ($id === '') {
            return null;
        }
        if (array_key_exists($id, self::$memo)) {
            return self::$memo[$id];
        }

        $kort = get_transient(self::transient($id));
        if (is_array($kort)) {
            return self::$memo[$id] = $kort;
        }

        $lang = get_option(self::bewaard($id));
        $lang = is_array($lang) ? $lang : null;

        if (!self::verbonden()) {
            return self::$memo[$id] = $lang['data'] ?? null;
        }

        $headers = ['X-Mymmo-Site-Key' => self::sleutel(), 'Accept' => 'application/json'];
        if ($lang && !empty($lang['etag'])) {
            $headers['If-None-Match'] = (string) $lang['etag'];
        }

        $antwoord = wp_remote_get(self::api_basis() . self::PAD . '/features/' . rawurlencode($id), [
            'timeout' => self::TIMEOUT,
            'headers' => $headers,
        ]);

        if (is_wp_error($antwoord)) {
            return self::$memo[$id] = $lang['data'] ?? null;
        }

        $code = (int) wp_remote_retrieve_response_code($antwoord);

        if ($code === 304 && $lang) {
            set_transient(self::transient($id), $lang['data'], self::TTL);
            return self::$memo[$id] = $lang['data'];
        }

        if ($code === 404) {
            delete_option(self::bewaard($id));
            delete_transient(self::transient($id));
            return self::$memo[$id] = null;
        }

        $body = json_decode((string) wp_remote_retrieve_body($antwoord), true);
        if ($code !== 200 || !is_array($body) || empty($body['success']) || !is_array($body['data'] ?? null)) {
            return self::$memo[$id] = $lang['data'] ?? null;
        }

        $data = $body['data'];
        set_transient(self::transient($id), $data, self::TTL);
        update_option(self::bewaard($id), [
            'data' => $data,
            'etag' => (string) wp_remote_retrieve_header($antwoord, 'etag'),
        ], false);

        return self::$memo[$id] = $data;
    }

    /**
     * Wat er in de keuzelijst van de editor staat: enkel wat naar de sites
     * gestuurd werd.
     *
     * @return array{verbonden:bool,features:array<int,array<string,mixed>>,fout:string,om:string}
     */
    private static function lijst(bool $ververs = false): array {
        $uit = ['verbonden' => self::verbonden(), 'features' => [], 'fout' => '', 'om' => self::om_adres()];
        if (!$uit['verbonden']) {
            $uit['fout'] = 'Deze site is nog niet met de Operations Manager verbonden (Instellingen -> Mymmo Forms).';
            return $uit;
        }

        $sleutel = 'mymmo_pf_lijst';
        $kort    = $ververs ? false : get_transient($sleutel);
        if (is_array($kort)) {
            $uit['features'] = $kort;
            return $uit;
        }

        $antwoord = wp_remote_get(self::api_basis() . self::PAD . '/features', [
            'timeout' => self::TIMEOUT + 2,
            'headers' => ['X-Mymmo-Site-Key' => self::sleutel(), 'Accept' => 'application/json'],
        ]);
        if (is_wp_error($antwoord)) {
            $uit['fout'] = 'De Operations Manager antwoordt niet: ' . $antwoord->get_error_message();
            return $uit;
        }
        $code = (int) wp_remote_retrieve_response_code($antwoord);
        $body = json_decode((string) wp_remote_retrieve_body($antwoord), true);
        if ($code === 401) {
            $uit['fout'] = 'De Operations Manager weigerde de sitesleutel van deze site.';
            return $uit;
        }
        if ($code !== 200 || !is_array($body) || !is_array($body['data'] ?? null)) {
            $uit['fout'] = 'Onverwacht antwoord van de Operations Manager (' . $code . ').';
            return $uit;
        }

        set_transient($sleutel, $body['data'], self::LIJST_TTL);
        $uit['features'] = $body['data'];
        return $uit;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REST: de keuzelijst voor de editor, en het seintje van de OM
    // ─────────────────────────────────────────────────────────────────────────

    public static function routes(): void {
        // De keuzelijst: de sitesleutel blijft op de server.
        register_rest_route(self::NS, '/productfeatures', [
            'methods'             => 'GET',
            'permission_callback' => static function (): bool {
                return current_user_can('edit_posts');
            },
            'callback'            => static function (WP_REST_Request $r): WP_REST_Response {
                return new WP_REST_Response(self::lijst((bool) $r->get_param('ververs')));
            },
        ]);

        // Het seintje na "Naar de sites sturen". Zonder aanmelding, want de OM
        // heeft hier geen account; het draagt geen inhoud en kan niets anders
        // dan de bewaarde versie laten vervallen (hoogstens eens per halve
        // minuut per feature). Wat daarna getoond wordt, komt van de OM.
        register_rest_route(self::NS, '/productfeature/ververs', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => static function (WP_REST_Request $r): WP_REST_Response {
                $id = preg_replace('/[^a-zA-Z0-9-]/', '', (string) $r->get_param('id'));
                if ($id === '' || strlen($id) > 64) {
                    return new WP_REST_Response(['ok' => false], 400);
                }
                $rem = 'mymmo_pf_rem_' . md5($id);
                if (get_transient($rem)) {
                    return new WP_REST_Response(['ok' => true, 'later' => true]);
                }
                set_transient($rem, 1, 30);
                delete_transient(self::transient($id));
                delete_transient('mymmo_pf_lijst');
                unset(self::$memo[$id]);
                self::feature($id);
                self::wis_paginacache($id);
                return new WP_REST_Response(['ok' => true]);
            },
        ]);
    }

    /** De pagina's met deze feature uit de paginacache halen, voor de gangbare cacheplugins. */
    private static function wis_paginacache(string $id): void {
        $posts = get_posts([
            'post_type'      => 'any',
            'post_status'    => 'any',
            'fields'         => 'ids',
            'numberposts'    => 200,
            'meta_query'     => [['key' => self::META, 'value' => ',' . $id . ',', 'compare' => 'LIKE']],
        ]);
        foreach ($posts as $post_id) {
            $post_id = (int) $post_id;
            clean_post_cache($post_id);
            do_action('litespeed_purge_post', $post_id);
            if (function_exists('rocket_clean_post')) {
                rocket_clean_post($post_id);
            }
            if (function_exists('wp_cache_post_change')) {
                wp_cache_post_change($post_id);
            }
            if (function_exists('w3tc_flush_post')) {
                w3tc_flush_post($post_id);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Waar het blok staat: melden aan de OM
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De features in een lijst blokken, ook in een herbruikbaar blok.
     *
     * @param array<int,array<string,mixed>> $blokken
     * @param array<string,bool>             $uit
     */
    private static function zoek(array $blokken, array &$uit, int $diepte = 0): void {
        foreach ($blokken as $blok) {
            $naam = (string) ($blok['blockName'] ?? '');
            // Het headerblok (class-productfeature-header.php) toont dezelfde features.
            if ($naam === self::BLOK || $naam === Mymmo_Cards_Productfeature_Header::BLOK) {
                $id = preg_replace('/[^a-zA-Z0-9-]/', '', (string) ($blok['attrs']['featureId'] ?? ''));
                if ($id !== '') {
                    $uit[$id] = true;
                }
            }
            if ($naam === 'core/block' && $diepte < self::DIEPTE && !empty($blok['attrs']['ref'])) {
                $ref = get_post((int) $blok['attrs']['ref']);
                if ($ref && $ref->post_type === 'wp_block') {
                    self::zoek(parse_blocks((string) $ref->post_content), $uit, $diepte + 1);
                }
            }
            if (!empty($blok['innerBlocks']) && is_array($blok['innerBlocks'])) {
                self::zoek($blok['innerBlocks'], $uit, $diepte);
            }
        }
    }

    /** @return array<string,mixed>|null wat de OM over deze pagina hoort te weten */
    private static function pagina(WP_Post $post): ?array {
        if (!is_post_type_viewable($post->post_type) || $post->post_type === 'attachment') {
            return null;
        }
        // Een pagina in de prullenbak heeft geen features meer.
        $ids = [];
        if ($post->post_status !== 'trash') {
            self::zoek(parse_blocks((string) $post->post_content), $ids);
        }
        return [
            'post_id'  => (int) $post->ID,
            'url'      => (string) get_permalink($post),
            'titel'    => wp_strip_all_tags(get_the_title($post)),
            'status'   => (string) $post->post_status,
            'features' => array_keys($ids),
        ];
    }

    /** @param array<int,array<string,mixed>> $posts */
    private static function stuur(array $posts, bool $volledig, bool $wachten = false): void {
        if (!self::verbonden()) {
            return;
        }
        wp_remote_post(self::api_basis() . self::PAD . '/gebruik', [
            'timeout'  => $wachten ? 15 : 3,
            'blocking' => $wachten,
            'headers'  => ['X-Mymmo-Site-Key' => self::sleutel(), 'Content-Type' => 'application/json'],
            'body'     => wp_json_encode([
                'site'     => (string) wp_parse_url(home_url(), PHP_URL_HOST),
                'volledig' => $volledig,
                'posts'    => $posts,
            ]),
        ]);
    }

    /** Na elke bewaring: is er iets veranderd aan de features op deze pagina, meld het. */
    public static function na_bewaren(int $post_id, WP_Post $post): void {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        $pagina = self::pagina($post);
        if ($pagina === null) {
            return;
        }
        $nieuw = $pagina['features'] ? ',' . implode(',', $pagina['features']) . ',' : '';
        $oud   = (string) get_post_meta($post_id, self::META, true);
        if ($nieuw === '' && $oud === '') {
            return;
        }
        if ($nieuw === '') {
            delete_post_meta($post_id, self::META);
        } else {
            update_post_meta($post_id, self::META, $nieuw);
        }
        self::stuur([$pagina], false);
    }

    public static function na_verwijderen(int $post_id): void {
        if ((string) get_post_meta($post_id, self::META, true) === '') {
            return;
        }
        self::stuur([['post_id' => $post_id, 'features' => []]], false);
    }

    public static function plan_cron(): void {
        if (!wp_next_scheduled(self::CRON)) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', self::CRON);
        }
    }

    /** Eens per dag alles: wat er dan niet bij staat, staat er niet meer op. */
    public static function volledig(): void {
        $ids = get_posts([
            'post_type'   => 'any',
            'post_status' => ['publish', 'draft', 'private', 'pending', 'future'],
            'fields'      => 'ids',
            'numberposts' => 1000,
            'meta_key'    => self::META,
        ]);
        $posts = [];
        foreach ($ids as $id) {
            $post = get_post((int) $id);
            $p    = $post ? self::pagina($post) : null;
            if ($p !== null) {
                $posts[] = $p;
            }
        }
        self::stuur($posts, true, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /** In de editor (de voorvertoning loopt via de REST-API) wel een melding, op de pagina niet. */
    private static function melding(string $tekst): string {
        if (!(defined('REST_REQUEST') && REST_REQUEST) || !current_user_can('edit_posts')) {
            return '';
        }
        return '<div class="mymmo-pf-melding"><p>' . esc_html($tekst) . '</p></div>';
    }

    /** Een tekst met witregels als alinea's, met de gewone opmaak van WordPress. */
    private static function alineas(string $tekst, string $klasse): string {
        $uit = '';
        foreach (preg_split('/\n{2,}/', trim($tekst)) ?: [] as $alinea) {
            if (trim($alinea) !== '') {
                $uit .= '<p class="' . esc_attr($klasse) . '">' . nl2br(esc_html(trim($alinea))) . '</p>';
            }
        }
        return $uit;
    }

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];
        $id    = (string) ($attrs['featureId'] ?? '');

        if ($id === '') {
            return self::melding('Kies rechts welke productfeature hier staat.');
        }

        $f = self::feature($id);
        if ($f === null) {
            return self::verbonden()
                ? self::melding('Deze feature staat niet (meer) op de sites. Stuur ze in de Operations Manager opnieuw naar de sites, of kies een andere.')
                : self::melding('Deze site is nog niet met de Operations Manager verbonden (Instellingen -> Mymmo Forms).');
        }

        $toon = static function (string $k) use ($attrs): bool {
            $standaard = self::attributen()[$k]['default'];
            return (bool) ($attrs[$k] ?? $standaard);
        };

        // De HEADER is wat extern komt; de titel (name) is intern, voor de lijst
        // in de OM. Zonder header: de titel.
        $titel = trim((string) ($f['header'] ?? '')) !== '' ? trim((string) $f['header']) : (string) ($f['name'] ?? '');

        $kant = mymmo_cards_keuze((string) ($attrs['kant'] ?? ''), self::kanten(), 'links');
        $kop  = mymmo_cards_keuze((string) ($attrs['kop'] ?? ''), self::koppen(), 'h2');
        $vorm = (string) ($attrs['vorm'] ?? '');

        // Het beeld: de gekozen vorm als die bestaat, anders zoals in de OM.
        $beeld = '';
        if ($toon('toonBeeld')) {
            $varianten = is_array($f['beelden'] ?? null) ? $f['beelden'] : [];
            $src       = $vorm !== '' && isset(self::vormen()[$vorm]) && !empty($varianten[$vorm]) ? (string) $varianten[$vorm] : (string) ($f['image_url'] ?? '');
            $src       = esc_url($src);
            // Staat de titel ernaast, dan zegt het beeld niets nieuws: een
            // schermlezer leest anders twee keer dezelfde naam.
            $alt = $toon('toonTitel') && $titel !== '' ? '' : $titel;
            if ($src !== '') {
                $beeld = '<div class="mymmo-pf-beeld">'
                    . '<img class="mymmo-pf-img skip-lazy no-lazyload" data-no-lazy="1" data-skip-lazy="1" loading="eager" decoding="async"'
                    . ' src="' . $src . '" alt="' . esc_attr($alt) . '">'
                    . '</div>';
            }
        }

        $tekst = '';
        if ($toon('toonLabel') && !empty($f['eyebrow'])) {
            $tekst .= '<p class="mymmo-pf-label has-small-font-size">' . esc_html((string) $f['eyebrow']) . '</p>';
        }
        if ($toon('toonTitel') && $titel !== '') {
            $tekst .= '<' . $kop . ' class="wp-block-heading mymmo-pf-titel">' . esc_html($titel) . '</' . $kop . '>';
        }
        if ($toon('toonKort') && !empty($f['summary'])) {
            $tekst .= self::alineas((string) $f['summary'], 'mymmo-pf-kort');
        }
        if ($toon('toonWaarom') && !empty($f['why'])) {
            $tekst .= self::alineas((string) $f['why'], 'mymmo-pf-waarom');
        }
        $usps = array_values(array_filter(array_map('strval', is_array($f['usps'] ?? null) ? $f['usps'] : [])));
        if ($toon('toonUsps') && $usps) {
            $tekst .= '<ul class="wp-block-list mymmo-pf-usps">'
                . implode('', array_map(static fn(string $u): string => '<li>' . esc_html($u) . '</li>', $usps))
                . '</ul>';
        }
        $url = esc_url((string) ($f['url'] ?? ''));
        if ($toon('toonKnop') && $url !== '') {
            $label = trim((string) ($attrs['knopTekst'] ?? ''));
            $tekst .= '<div class="wp-block-buttons mymmo-pf-knoppen"><div class="wp-block-button">'
                . '<a class="wp-block-button__link wp-element-button" href="' . $url . '">' . esc_html($label !== '' ? $label : 'Meer lezen') . '</a>'
                . '</div></div>';
        }

        if ($beeld === '' && $tekst === '') {
            return self::melding('Er staat niets aan: zet rechts aan wat je wil tonen.');
        }

        $klassen = ['mymmo-pf', 'mymmo-pf--beeld-' . $kant];
        if ($beeld === '' || $tekst === '') {
            $klassen[] = 'mymmo-pf--een';
        }
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok zet zijn uitlijnklasse zelf -- zie render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'data-mymmo-feature' => $id]) . '>'
            . $beeld
            . ($tekst !== '' ? '<div class="mymmo-pf-tekst">' . $tekst . '</div>' : '')
            . '</div>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gereedschap
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,string> $lijst
     * @return array<int,array{value:string,label:string}>
     */
    private static function keuzes(array $lijst): array {
        $uit = [];
        foreach ($lijst as $sleutel => $label) {
            $uit[] = ['value' => (string) $sleutel, 'label' => $label];
        }
        return $uit;
    }

    /** @param array<string,string> $extra */
    private static function wikkel(array $extra): string {
        if (function_exists('get_block_wrapper_attributes')) {
            return get_block_wrapper_attributes($extra);
        }
        $uit = [];
        foreach ($extra as $naam => $waarde) {
            if ($waarde !== '') {
                $uit[] = $naam . '="' . esc_attr($waarde) . '"';
            }
        }
        return implode(' ', $uit);
    }

    /** De stylesheet ook in de editor -- zie Mymmo_Cards_Blocks::assets(). */
    public static function assets(): void {
        if (!is_admin()) {
            return;
        }
        wp_enqueue_style('mymmo-productfeature');
    }
}
