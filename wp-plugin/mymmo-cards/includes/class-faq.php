<?php
/**
 * DE VEELGESTELDE VRAGEN: een bibliotheek van vragen en antwoorden, en een blok
 * dat ze op een pagina zet, elk om open te klappen.
 *
 * DE BIBLIOTHEEK is een eigen berichttype (mymmo_faq) met thema's
 * (mymmo_faq_thema). Een vraag die op meerdere pagina's terugkomt ("Hoeveel
 * kost Syndicoach?"), staat er een keer; wie het antwoord aanpast, past het op
 * elke pagina tegelijk aan. Een thema zonder dat iemand het kiest: zie
 * deel_in(). Bezoekers zien de bibliotheek zelf niet (geen eigen adres, geen
 * archief): een vraag staat enkel op de pagina waar ze in een blok staat.
 *
 * Twee blokken:
 *
 *   mymmo/faq        -- de lijst. Achtergrond, opvulling, of de eerste vraag
 *                       open staat, en of de vragen een kop zijn.
 *   mymmo/faq-vraag  -- een vraag. Ofwel GEKOPPELD (faqId: de vraag en het
 *                       antwoord komen uit de bibliotheek), ofwel EIGEN (de
 *                       vraag als tekst, het antwoord als gewone core-blokken):
 *                       een vraag die maar op die ene pagina hoort.
 *
 * OPENKLAPPEN zonder script: een <details> met een <summary>. Dat werkt met het
 * toetsenbord en een schermlezer, zonder JavaScript, en in Chrome en Edge klapt
 * de zoekfunctie van de browser een vraag open als het woord in het antwoord
 * staat. De eerste vraag staat standaard open. Het enige script
 * (mymmo-faq.js) klapt een vraag open waarnaar een link wijst.
 *
 * GESTRUCTUREERDE GEGEVENS (schema.org/FAQPage) maken we uit dezelfde bron als
 * wat op de pagina staat: vragen_van() leest de blokken van het bericht, en
 * vraag() bepaalt voor render en schema allebei wat de vraag en het antwoord
 * zijn. Zo kan er nooit iets in de gegevens staan dat een bezoeker niet ziet --
 * een eis van Google. Met Yoast SEO komt de FAQPage in de graaf van Yoast (een
 * WebPage die ook FAQPage is, zoals het FAQ-blok van Yoast zelf doet); zonder
 * Yoast zetten we een eigen <script type="application/ld+json"> in de <head>.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Faq {

    public const LIJST = 'mymmo/faq';
    public const VRAAG = 'mymmo/faq-vraag';

    public const TYPE  = 'mymmo_faq';
    public const THEMA = 'mymmo_faq_thema';

    /** Trefwoorden van een thema, voor het automatisch indelen. */
    public const TREFWOORDEN = 'mymmo_faq_trefwoorden';

    /** Het thema voor een vraag die nergens bij past. */
    private const ALGEMEEN = 'Algemeen';

    /** Hoe diep een herbruikbaar blok in een herbruikbaar blok gelezen wordt. */
    private const DIEPTE = 5;

    /** @var array<string,int> id's die op deze pagina al gegeven zijn */
    private static array $ids = [];

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
        add_action('wp_after_insert_post', [self::class, 'deel_in'], 10, 2);
        add_filter('allowed_block_types_all', [self::class, 'blokken_in_bibliotheek'], 10, 2);

        add_action(self::THEMA . '_add_form_fields', [self::class, 'veld_nieuw']);
        add_action(self::THEMA . '_edit_form_fields', [self::class, 'veld_bewerk']);
        add_action('created_' . self::THEMA, [self::class, 'bewaar_trefwoorden']);
        add_action('edited_' . self::THEMA, [self::class, 'bewaar_trefwoorden']);

        // Yoast eerst; zonder Yoast een eigen script (zie gegevens_los()).
        add_filter('wpseo_schema_webpage', [self::class, 'gegevens_yoast'], 20);
        add_action('wp_head', [self::class, 'gegevens_los'], 20);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gesloten lijsten
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Wat de vraag is in de HTML. Vetgedrukt (de standaard, zoals op de
     * ontwerpen) is een <strong>: het thema bepaalt hoe vet dat is, er staat
     * hier geen letterdikte. Gewone tekst volgt de letter van een alinea; een
     * kop volgt de kopstijl van het thema (groter) en geeft de pagina een
     * vraag als tussentitel.
     *
     * @return array<string,string>
     */
    public static function koppen(): array {
        return [
            'vet'   => 'Vetgedrukte tekst',
            'tekst' => 'Gewone tekst',
            'h2'    => 'Kop 2',
            'h3'    => 'Kop 3',
            'h4'    => 'Kop 4',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        self::bibliotheek();

        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-faq', MYMMO_CARDS_URL . 'assets/css/mymmo-faq.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);
        wp_register_style('mymmo-faq-editor', MYMMO_CARDS_URL . 'assets/css/mymmo-faq-editor.css', ['mymmo-faq'], MYMMO_CARDS_VERSION);

        wp_register_script(
            'mymmo-faq-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-faq-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-core-data'],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_register_script('mymmo-faq', MYMMO_CARDS_URL . 'assets/js/mymmo-faq.js', [], MYMMO_CARDS_VERSION, true);

        wp_localize_script('mymmo-faq-editor', 'MymmoFaq', [
            'opvullingen' => self::keuzes(mymmo_cards_opvullingen()),
            'koppen'      => self::keuzes(self::koppen()),
            'type'        => self::TYPE,
            'thema'       => self::THEMA,
            'beheer'      => admin_url('edit.php?post_type=' . self::TYPE),
            'bewerk'      => admin_url('post.php?action=edit&post='),
        ]);

        register_block_type(self::LIJST, [
            'api_version'      => 2,
            'editor_script'    => 'mymmo-faq-editor',
            'editor_style'     => 'mymmo-faq-editor',
            'style'            => 'mymmo-faq',
            'view_script'      => 'mymmo-faq',
            'attributes'       => self::attributen_lijst(),
            'provides_context' => ['mymmo/faq-kop' => 'kop'],
            'render_callback'  => [self::class, 'render_lijst'],
        ]);

        register_block_type(self::VRAAG, [
            'api_version'     => 2,
            'parent'          => [self::LIJST],
            'attributes'      => self::attributen_vraag(),
            'uses_context'    => ['mymmo/faq-kop'],
            'render_callback' => [self::class, 'render_vraag'],
        ]);
    }

    /** Het berichttype en de thema's. */
    private static function bibliotheek(): void {
        register_post_type(self::TYPE, [
            'labels' => [
                'name'               => 'Veelgestelde vragen',
                'singular_name'      => 'Vraag',
                'menu_name'          => 'Veelgestelde vragen',
                'add_new'            => 'Nieuwe vraag',
                'add_new_item'       => 'Nieuwe vraag',
                'edit_item'          => 'Vraag bewerken',
                'new_item'           => 'Nieuwe vraag',
                'view_item'          => 'Vraag bekijken',
                'search_items'       => 'Vragen zoeken',
                'not_found'          => 'Nog geen vragen',
                'not_found_in_trash' => 'Geen vragen in de prullenbak',
                'all_items'          => 'Alle vragen',
            ],
            'description'         => 'Vragen en antwoorden die je met het blok Veelgestelde vragen op een pagina zet.',
            // Geen eigen adres per vraag: dezelfde tekst op een eigen pagina én
            // op elke pagina waar ze in een blok staat, is dubbele inhoud.
            'public'              => false,
            'publicly_queryable'  => false,
            'exclude_from_search' => true,
            'show_ui'             => true,
            'show_in_menu'        => true,
            'show_in_rest'        => true,
            'rest_base'           => self::TYPE,
            'has_archive'         => false,
            'rewrite'             => false,
            'query_var'           => false,
            'menu_position'       => 21,
            // De titel is de vraag, de inhoud het antwoord; met de volgorde
            // (page-attributes) zet je de vragen van een thema op hun plaats.
            'supports'            => ['title', 'editor', 'page-attributes', 'revisions'],
            'template'            => [['core/paragraph', ['placeholder' => 'Het antwoord, in twee tot vier zinnen. Begin met het antwoord zelf: ja, nee, een bedrag of een termijn.']]],
        ]);

        register_taxonomy(self::THEMA, [self::TYPE], [
            'labels' => [
                'name'          => "Thema's",
                'singular_name' => 'Thema',
                'menu_name'     => "Thema's",
                'all_items'     => "Alle thema's",
                'edit_item'     => 'Thema bewerken',
                'add_new_item'  => 'Nieuw thema',
                'search_items'  => "Thema's zoeken",
                'not_found'     => "Nog geen thema's",
            ],
            'public'            => false,
            'show_ui'           => true,
            'show_in_rest'      => true,
            'rest_base'         => self::THEMA,
            'show_admin_column' => true,
            'hierarchical'      => true,
            'rewrite'           => false,
            'query_var'         => false,
        ]);

        register_term_meta(self::THEMA, self::TREFWOORDEN, [
            'type'              => 'string',
            'single'            => true,
            'show_in_rest'      => true,
            'sanitize_callback' => 'sanitize_text_field',
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-faq-editor.js (geen bouwstap). De
     * namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen_lijst(): array {
        return [
            'align'       => ['type' => 'string', 'default' => 'wide'],
            'eersteOpen'  => ['type' => 'boolean', 'default' => true],
            'kop'         => ['type' => 'string', 'default' => 'vet'],
            // Een kleur uit het palet (slug). Leeg = lichtblauw (primary-50 van
            // het palet, zie mymmo-faq.css).
            'achtergrond' => ['type' => 'string', 'default' => ''],
            'opvulling'   => ['type' => 'string', 'default' => 'normaal'],
            // Uit = deze vragen staan niet in de gestructureerde gegevens (een
            // tweede lijst met dezelfde vragen op dezelfde pagina, bv.).
            'gegevens'    => ['type' => 'boolean', 'default' => true],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_vraag(): array {
        return [
            // Een vraag uit de bibliotheek; 0 = een eigen vraag.
            'faqId' => ['type' => 'number', 'default' => 0],
            // De eigen vraag (RichText, zonder opmaak).
            'vraag' => ['type' => 'string', 'default' => ''],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wat een vraag is -- voor de render en voor de gegevens
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De vraag (tekst, veilig als HTML) en het antwoord (HTML), of null als er
     * niets te tonen valt: een gekoppelde vraag die niet (meer) gepubliceerd
     * is, of een eigen vraag zonder tekst of zonder antwoord.
     *
     * @param array<string,mixed> $attrs
     * @return array{vraag:string,antwoord:string}|null
     */
    public static function vraag(array $attrs, string $eigen_antwoord): ?array {
        static $bezig = [];

        $id = (int) ($attrs['faqId'] ?? 0);
        if ($id > 0) {
            $bericht = get_post($id);
            if (!$bericht instanceof WP_Post || $bericht->post_type !== self::TYPE || $bericht->post_status !== 'publish') {
                return null;
            }
            // Een antwoord dat zichzelf bevat, zou eindeloos renderen.
            if (isset($bezig[$id])) {
                return null;
            }
            $bezig[$id] = true;
            $inhoud = (string) $bericht->post_content;
            $antwoord = has_blocks($inhoud) ? do_blocks($inhoud) : wpautop($inhoud);
            unset($bezig[$id]);

            $vraag = esc_html(trim((string) $bericht->post_title));
        } else {
            $vraag = trim(wp_kses((string) ($attrs['vraag'] ?? ''), []));
            $antwoord = $eigen_antwoord;
        }

        if ($vraag === '' || !mymmo_cards_heeft_inhoud($antwoord)) {
            return null;
        }

        return ['vraag' => $vraag, 'antwoord' => trim($antwoord)];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render_lijst($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $vragen = [];
        if (is_object($block) && isset($block->inner_blocks)) {
            foreach ($block->inner_blocks as $kind) {
                $html = (string) $kind->render();
                if (trim($html) !== '') {
                    $vragen[] = $html;
                }
            }
        }

        if ($vragen === []) {
            return '';
        }

        // De eerste vraag open: hier, niet in render_vraag(), want enkel de
        // lijst weet welke vraag na het wegvallen van lege vragen de eerste is.
        if (($attrs['eersteOpen'] ?? true) !== false) {
            $vragen[0] = preg_replace('/^<details\b/', '<details open', $vragen[0], 1) ?? $vragen[0];
        }

        $opvulling = mymmo_cards_keuze((string) ($attrs['opvulling'] ?? ''), mymmo_cards_opvullingen(), 'normaal');

        $klassen = ['mymmo-faq', 'mymmo-faq--pad-' . $opvulling];
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok moet zijn uitlijnklasse zelf zetten -- zie
            // render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        $stijl = [];
        $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-faq-bg:' . $bg;
        }

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . '>'
            . '<div class="mymmo-faq-lijst">' . implode('', $vragen) . '</div>'
            . '</div>';
    }

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render_vraag($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];
        $vraag = self::vraag($attrs, $content);
        if ($vraag === null) {
            return '';
        }

        $kop = 'vet';
        if (is_object($block) && isset($block->context['mymmo/faq-kop'])) {
            $kop = mymmo_cards_keuze((string) $block->context['mymmo/faq-kop'], self::koppen(), 'vet');
        }
        $tag = $kop === 'tekst' ? 'span' : ($kop === 'vet' ? 'strong' : $kop);

        // Een adres per vraag (#faq-hoeveel-kost-syndicoach): om naar een
        // antwoord te linken; mymmo-faq.js klapt de vraag dan open.
        $id = self::uniek('faq-' . sanitize_title(wp_strip_all_tags(html_entity_decode($vraag['vraag'], ENT_QUOTES))));

        return '<details class="mymmo-faq-vraag" id="' . esc_attr($id) . '">'
            . '<summary class="mymmo-faq-vraag-kop">'
            . '<' . $tag . ' class="mymmo-faq-vraag-tekst">' . $vraag['vraag'] . '</' . $tag . '>'
            . '</summary>'
            . '<div class="mymmo-faq-vraag-antwoord">' . $vraag['antwoord'] . '</div>'
            . '</details>';
    }

    /** Een id dat op deze pagina nog niet gegeven is. */
    private static function uniek(string $id): string {
        if ($id === 'faq-') {
            $id = 'faq-vraag';
        }
        if (!isset(self::$ids[$id])) {
            self::$ids[$id] = 1;
            return $id;
        }
        self::$ids[$id]++;

        return $id . '-' . self::$ids[$id];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gestructureerde gegevens
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De vragen van een bericht, als schema.org/Question. Leest de blokken zelf
     * (ook in een herbruikbaar blok), want in een klassiek thema komt de <head>
     * vóór de inhoud: er is op dat moment nog niets gerenderd om te verzamelen.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function vragen_van(?WP_Post $bericht): array {
        if (!$bericht instanceof WP_Post || !has_blocks($bericht->post_content)) {
            return [];
        }

        $uit = [];
        $gezien = [];
        self::verzamel(parse_blocks($bericht->post_content), $uit, $gezien, 0);

        return $uit;
    }

    /**
     * @param array<int,array<string,mixed>> $blokken
     * @param array<int,array<string,mixed>> $uit
     * @param array<string,bool>             $gezien
     */
    private static function verzamel(array $blokken, array &$uit, array &$gezien, int $diepte): void {
        if ($diepte > self::DIEPTE) {
            return;
        }

        foreach ($blokken as $blok) {
            $naam = (string) ($blok['blockName'] ?? '');

            if ($naam === 'core/block') {
                $ref = (int) ($blok['attrs']['ref'] ?? 0);
                $herbruikbaar = $ref > 0 ? get_post($ref) : null;
                if ($herbruikbaar instanceof WP_Post && $herbruikbaar->post_status === 'publish') {
                    self::verzamel(parse_blocks($herbruikbaar->post_content), $uit, $gezien, $diepte + 1);
                }
                continue;
            }

            if ($naam === self::LIJST) {
                if (($blok['attrs']['gegevens'] ?? true) === false) {
                    continue;
                }
                foreach ((array) ($blok['innerBlocks'] ?? []) as $kind) {
                    if (($kind['blockName'] ?? '') !== self::VRAAG) {
                        continue;
                    }
                    $eigen = '';
                    foreach ((array) ($kind['innerBlocks'] ?? []) as $deel) {
                        $eigen .= render_block($deel);
                    }
                    $vraag = self::vraag((array) ($kind['attrs'] ?? []), $eigen);
                    if ($vraag === null) {
                        continue;
                    }
                    $naam_vraag = trim(html_entity_decode(wp_strip_all_tags($vraag['vraag']), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    $sleutel = function_exists('mb_strtolower') ? mb_strtolower($naam_vraag) : strtolower($naam_vraag);
                    // Dezelfde vraag twee keer op een pagina: een keer in de gegevens.
                    if (isset($gezien[$sleutel])) {
                        continue;
                    }
                    $gezien[$sleutel] = true;
                    $uit[] = [
                        '@type'          => 'Question',
                        'name'           => $naam_vraag,
                        'acceptedAnswer' => [
                            '@type' => 'Answer',
                            'text'  => self::antwoord_voor_gegevens($vraag['antwoord']),
                        ],
                    ];
                }
                continue;
            }

            if (!empty($blok['innerBlocks'])) {
                self::verzamel((array) $blok['innerBlocks'], $uit, $gezien, $diepte);
            }
        }
    }

    /**
     * Het antwoord met enkel de HTML die Google in een FAQ-antwoord leest
     * (koppen, alinea's, lijsten, links, vet en cursief); de rest wordt tekst.
     */
    private static function antwoord_voor_gegevens(string $html): string {
        $toegelaten = [
            'h1' => [], 'h2' => [], 'h3' => [], 'h4' => [], 'h5' => [], 'h6' => [],
            'br' => [], 'ol' => [], 'ul' => [], 'li' => [], 'p' => [], 'div' => [],
            'b' => [], 'strong' => [], 'i' => [], 'em' => [],
            'a' => ['href' => true],
        ];
        $schoon = wp_kses($html, $toegelaten);
        $schoon = preg_replace('/\s+/', ' ', $schoon) ?? $schoon;
        $schoon = preg_replace('/>\s+</', '><', $schoon) ?? $schoon;

        return trim(html_entity_decode($schoon, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    /** De vragen van de pagina die nu getoond wordt, een keer berekend. */
    private static function vragen_hier(): array {
        static $vragen = null;
        if ($vragen === null) {
            $vragen = is_singular() ? self::vragen_van(get_queried_object() instanceof WP_Post ? get_queried_object() : null) : [];
        }

        return $vragen;
    }

    /**
     * Met Yoast: de WebPage van Yoast wordt ook een FAQPage, met de vragen als
     * mainEntity. Zo staat er een samenhangende graaf, geen tweede losse pagina
     * naast die van Yoast. Staat er al een FAQPage (het FAQ-blok van Yoast),
     * dan komen onze vragen erbij.
     *
     * @param array<string,mixed> $data
     * @return array<string,mixed>
     */
    public static function gegevens_yoast($data): array {
        $data = is_array($data) ? $data : [];
        $vragen = self::vragen_hier();
        if ($vragen === []) {
            return $data;
        }

        $types = isset($data['@type']) ? (array) $data['@type'] : ['WebPage'];
        if (!in_array('FAQPage', $types, true)) {
            $types[] = 'FAQPage';
        }
        $data['@type'] = array_values($types);

        $bestaand = isset($data['mainEntity']) && is_array($data['mainEntity']) ? $data['mainEntity'] : [];
        // Een enkel object (geen lijst) blijft een element van de lijst.
        if ($bestaand !== [] && array_keys($bestaand) !== range(0, count($bestaand) - 1)) {
            $bestaand = [$bestaand];
        }
        $data['mainEntity'] = array_merge($bestaand, $vragen);

        return $data;
    }

    /** Zonder Yoast: een eigen FAQPage in de <head>. */
    public static function gegevens_los(): void {
        if (defined('WPSEO_VERSION')) {
            return;
        }
        $vragen = self::vragen_hier();
        if ($vragen === []) {
            return;
        }

        $url = (string) get_permalink(get_queried_object_id());
        $gegevens = [
            '@context'   => 'https://schema.org',
            '@type'      => 'FAQPage',
            '@id'        => $url . '#faq',
            'url'        => $url,
            'mainEntity' => $vragen,
        ];

        // JSON_HEX_TAG: een "</script>" in een antwoord breekt het script niet.
        $json = wp_json_encode($gegevens, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
        if (is_string($json)) {
            echo '<script type="application/ld+json" class="mymmo-faq-gegevens">' . $json . '</script>' . "\n";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Automatisch indelen in een thema
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Een vraag zonder thema krijgt er een, bij het bewaren. Elk thema heeft
     * trefwoorden (in te vullen bij Veelgestelde vragen → Thema's); het thema
     * waarvan de naam en de trefwoorden het vaakst in de vraag en het antwoord
     * staan, wint. Een woord in de vraag telt dubbel. Past er niets, dan wordt
     * het "Algemeen". Een thema dat iemand zelf koos, blijft altijd staan.
     *
     * wp_after_insert_post en niet save_post: de blok-editor bewaart de
     * thema's pas NA save_post, en dan zou elke vraag als "zonder thema" gelden.
     */
    public static function deel_in(int $id, $bericht): void {
        if (!$bericht instanceof WP_Post || $bericht->post_type !== self::TYPE) {
            return;
        }
        if (in_array($bericht->post_status, ['auto-draft', 'trash', 'inherit'], true) || wp_is_post_revision($id)) {
            return;
        }
        $huidig = wp_get_object_terms($id, self::THEMA, ['fields' => 'ids']);
        if (is_wp_error($huidig) || $huidig !== []) {
            return;
        }

        $thema = self::beste_thema((string) $bericht->post_title, wp_strip_all_tags((string) $bericht->post_content));
        if ($thema === 0) {
            $algemeen = term_exists(self::ALGEMEEN, self::THEMA);
            if (!$algemeen) {
                $algemeen = wp_insert_term(self::ALGEMEEN, self::THEMA);
            }
            if (is_wp_error($algemeen) || !is_array($algemeen)) {
                return;
            }
            $thema = (int) $algemeen['term_id'];
        }

        wp_set_object_terms($id, [$thema], self::THEMA);
    }

    /** Het id van het thema dat het best past, of 0. */
    public static function beste_thema(string $vraag, string $antwoord): int {
        $themas = get_terms(['taxonomy' => self::THEMA, 'hide_empty' => false]);
        if (is_wp_error($themas) || !is_array($themas)) {
            return 0;
        }

        $vraag = self::klein($vraag);
        $antwoord = self::klein($antwoord);

        $beste = 0;
        $score_beste = 0;
        foreach ($themas as $thema) {
            if (!$thema instanceof WP_Term || self::klein($thema->name) === self::klein(self::ALGEMEEN)) {
                continue;
            }
            $woorden = array_merge([$thema->name], explode(',', (string) get_term_meta($thema->term_id, self::TREFWOORDEN, true)));
            $score = 0;
            foreach ($woorden as $woord) {
                $woord = self::klein(trim($woord));
                if ($woord === '') {
                    continue;
                }
                $patroon = '/(?<![\p{L}\p{N}])' . preg_quote($woord, '/') . '/u';
                $score += 2 * (int) preg_match_all($patroon, $vraag);
                $score += (int) preg_match_all($patroon, $antwoord);
            }
            if ($score > $score_beste) {
                $score_beste = $score;
                $beste = (int) $thema->term_id;
            }
        }

        return $beste;
    }

    private static function klein(string $tekst): string {
        $tekst = html_entity_decode($tekst, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return function_exists('mb_strtolower') ? mb_strtolower($tekst) : strtolower($tekst);
    }

    /** Het veld Trefwoorden bij een nieuw thema. */
    public static function veld_nieuw(): void {
        wp_nonce_field('mymmo_faq_trefwoorden', 'mymmo_faq_trefwoorden_nonce');
        echo '<div class="form-field">'
            . '<label for="mymmo-faq-trefwoorden">Trefwoorden</label>'
            . '<input type="text" name="mymmo_faq_trefwoorden" id="mymmo-faq-trefwoorden" value="">'
            . '<p>Gescheiden door komma\'s, bv. <em>prijs, kost, euro, offerte</em>. Een nieuwe vraag zonder thema komt bij het thema waarvan deze woorden het vaakst in de vraag en het antwoord staan.</p>'
            . '</div>';
    }

    /** Het veld Trefwoorden bij een bestaand thema. */
    public static function veld_bewerk($term): void {
        $waarde = $term instanceof WP_Term ? (string) get_term_meta($term->term_id, self::TREFWOORDEN, true) : '';
        echo '<tr class="form-field"><th scope="row"><label for="mymmo-faq-trefwoorden">Trefwoorden</label></th><td>';
        wp_nonce_field('mymmo_faq_trefwoorden', 'mymmo_faq_trefwoorden_nonce');
        echo '<input type="text" name="mymmo_faq_trefwoorden" id="mymmo-faq-trefwoorden" value="' . esc_attr($waarde) . '">'
            . '<p class="description">Gescheiden door komma\'s. Een nieuwe vraag zonder thema komt bij het thema waarvan deze woorden het vaakst in de vraag en het antwoord staan.</p>'
            . '</td></tr>';
    }

    public static function bewaar_trefwoorden(int $term_id): void {
        if (!isset($_POST['mymmo_faq_trefwoorden'], $_POST['mymmo_faq_trefwoorden_nonce'])) {
            return;
        }
        if (!wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['mymmo_faq_trefwoorden_nonce'])), 'mymmo_faq_trefwoorden')) {
            return;
        }
        if (!current_user_can('manage_categories')) {
            return;
        }
        update_term_meta($term_id, self::TREFWOORDEN, sanitize_text_field(wp_unslash((string) $_POST['mymmo_faq_trefwoorden'])));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // De editor van een vraag in de bibliotheek
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * In een antwoord uit de bibliotheek: tekst, lijsten, beeld en knoppen.
     * Geen Veelgestelde vragen in een antwoord (dat zou zichzelf bevatten) en
     * geen kaartenstapel: een antwoord is een paar zinnen, geen pagina.
     *
     * @param bool|array<int,string> $toegelaten
     * @param mixed                  $context
     * @return bool|array<int,string>
     */
    public static function blokken_in_bibliotheek($toegelaten, $context) {
        if (!is_object($context) || !isset($context->post) || !$context->post instanceof WP_Post || $context->post->post_type !== self::TYPE) {
            return $toegelaten;
        }

        return ['core/paragraph', 'core/list', 'core/list-item', 'core/heading', 'core/image', 'core/buttons', 'core/button', 'core/table'];
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

    /** De stylesheets ook in de editor -- zie Mymmo_Cards_Blocks::assets(). */
    public static function assets(): void {
        if (!is_admin()) {
            return;
        }

        wp_enqueue_style('mymmo-faq');
        wp_enqueue_style('mymmo-faq-editor');
    }
}
