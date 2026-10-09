<?php
/**
 * DE STAPPEN: een genummerde reeks stappen ("de werkwijze in vier stappen").
 *
 * Twee blokken:
 *
 *   mymmo/stappen -- de reeks. Bepaalt de achtergrond, de opvulling, hoe het
 *                    nummer eruitziet en of de stappen op een computer naast
 *                    elkaar openschuiven.
 *   mymmo/stap    -- een stap. De INHOUD zijn gewone core-blokken (kop,
 *                    alinea, lijst, knoppen, kolommen, video), dus de letter
 *                    komt uit het thema -- zelfde regel als bij de kaarten.
 *
 * TWEE STANDEN, EEN MARKUP.
 *
 *   - Onder elkaar: elke stap een vlak met het nummer ernaast (op een telefoon
 *     erboven). Dit is wat de editor toont, wat een telefoon krijgt, en wat er
 *     staat zonder JavaScript.
 *   - Naast elkaar (op een computer, als `horizontaal` aan staat): de stappen
 *     staan als smalle panelen naast elkaar en terwijl je scrolt, schuift de
 *     ene na de andere open. mymmo-stappen.js zet die stand AAN; de CSS kent
 *     ze enkel als klasse (`mymmo-stappen--naast`).
 *
 * WAAROM HET SCRIPT BESLIST EN NIET EEN MEDIA QUERY: de naast-elkaarstand heeft
 * een vaste hoogte (het scherm), en een stap die daar niet in past zou een
 * schuifbalk nodig hebben -- en schuifbalken in een component staan er niet in.
 * Het script MEET dus eerst of elke stap past; past er één niet, dan blijven ze
 * onder elkaar staan. Een media query kan dat niet weten. De breedte waarop het
 * omslaat is wel gewoon een van de vier breekpunten (782px).
 *
 * HET NUMMER IS GEEN KOP en geen eigen typografie. Het is versiering
 * (aria-hidden; de volgorde staat al in de koppen) met de lettergrootte en het
 * lettertype uit het THEMA: de klassen `has-<slug>-font-size` en
 * `has-<slug>-font-family` maakt WordPress zelf uit theme.json. De plugin kent
 * geen enkele maat of lettertypenaam -- zelfde afweging als de markeerstift.
 *
 * DE INDEX VAN EEN STAP WORDT HIER GETELD: de reeks rendert haar kinderen zelf
 * en zet onderweg een teller. CSS-tellers kunnen het ook, maar dan kan het
 * script het nummer niet in het label van een paneel zetten ("Toon stap 3").
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Stappen {

    public const REEKS = 'mymmo/stappen';
    public const STAP  = 'mymmo/stap';

    /** Teller tijdens het renderen van één reeks. -1 = er rendert geen reeks. */
    private static int $index = -1;

    /** Grootte en lettertype van het nummer van de reeks die nu rendert. */
    private static string $nummer_klassen = '';

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-stappen', MYMMO_CARDS_URL . 'assets/css/mymmo-stappen.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);
        wp_register_style('mymmo-stappen-editor', MYMMO_CARDS_URL . 'assets/css/mymmo-stappen-editor.css', ['mymmo-stappen'], MYMMO_CARDS_VERSION);

        // Enkel op de PAGINA: in de editor staan de stappen altijd onder elkaar,
        // want een paneel dat dichtklapt terwijl je erin typt, is niet te bewerken.
        wp_register_script('mymmo-stappen', MYMMO_CARDS_URL . 'assets/js/mymmo-stappen.js', [], MYMMO_CARDS_VERSION, true);

        wp_register_script(
            'mymmo-stappen-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-stappen-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data'],
            MYMMO_CARDS_VERSION,
            true
        );

        $opvullingen = [];
        foreach (mymmo_cards_opvullingen() as $sleutel => $label) {
            $opvullingen[] = ['value' => $sleutel, 'label' => $label];
        }

        wp_localize_script('mymmo-stappen-editor', 'MymmoStappen', [
            'opvullingen'  => $opvullingen,
            'groottes'     => self::lettergroottes(),
            'lettertypes'  => self::lettertypes(),
        ]);

        register_block_type(self::REEKS, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-stappen-editor',
            'editor_style'    => 'mymmo-stappen-editor',
            'style'           => 'mymmo-stappen',
            'view_script'     => 'mymmo-stappen',
            'attributes'      => self::attributen_reeks(),
            'render_callback' => [self::class, 'render_reeks'],
        ]);

        register_block_type(self::STAP, [
            'api_version'     => 2,
            'parent'          => [self::REEKS],
            'attributes'      => self::attributen_stap(),
            'render_callback' => [self::class, 'render_stap'],
        ]);

        /*
         * "Vinkjes" voor een lijst: de checklijst in een stap ("dit kan je
         * verwachten"). Een stijl van de KERN-lijst en geen eigen blok: de
         * inhoud blijft een gewone lijst die het thema opmaakt; enkel het
         * opsommingsteken wordt een vinkje, getekend met CSS. Enkel BINNEN een
         * stap: de regel hangt aan .mymmo-stap (een selector zonder .mymmo-
         * klasse laat de controle niet door), dus elders blijft het een lijst.
         */
        if (function_exists('register_block_style')) {
            register_block_style('core/list', [
                'name'         => 'mymmo-vinkjes',
                'label'        => 'Vinkjes (in een stap)',
                'style_handle' => 'mymmo-stappen',
            ]);
        }
    }

    /**
     * De attributen staan hier ÉN in mymmo-stappen-editor.js (geen bouwstap).
     * De namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen_reeks(): array {
        return [
            'align'         => ['type' => 'string', 'default' => 'wide'],
            // Een kleur uit het palet (slug). Leeg = het vlak van de huisstijl.
            'achtergrond'   => ['type' => 'string', 'default' => ''],
            'opvulling'     => ['type' => 'string', 'default' => 'normaal'],
            // Het nummer: kleur uit het palet, grootte en lettertype uit het
            // thema. Leeg = de tekstkleur (zacht), de grootste maat van het
            // thema, het lettertype van de tekst eromheen.
            'nummerKleur'   => ['type' => 'string', 'default' => ''],
            'nummerGrootte' => ['type' => 'string', 'default' => ''],
            'nummerLetter'  => ['type' => 'string', 'default' => ''],
            // Op een computer naast elkaar openschuiven tijdens het scrollen.
            'horizontaal'   => ['type' => 'boolean', 'default' => true],
            // Hoe ver de panelen van de bovenrand blijven: de hoogte van een
            // vaste kop op de site. Verschilt per site, dus instelbaar.
            'boven'         => ['type' => 'number', 'default' => 96],
            // Hoeveel je scrolt per stap, in % van de schermhoogte.
            'scroll'        => ['type' => 'number', 'default' => 55],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_stap(): array {
        return [
            // Leeg = de achtergrond van de reeks.
            'achtergrond' => ['type' => 'string', 'default' => ''],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render_reeks($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $vorige_index   = self::$index;
        $vorige_klassen = self::$nummer_klassen;
        self::$index          = 0;
        self::$nummer_klassen = self::nummer_klassen($attrs);

        $kinderen = [];
        if (is_object($block) && isset($block->inner_blocks)) {
            foreach ($block->inner_blocks as $kind) {
                $html = (string) $kind->render();
                if (trim($html) !== '') {
                    $kinderen[] = $html;
                }
            }
        }

        self::$index          = $vorige_index;
        self::$nummer_klassen = $vorige_klassen;

        if ($kinderen === []) {
            return '';
        }

        $opvulling = mymmo_cards_keuze((string) ($attrs['opvulling'] ?? ''), mymmo_cards_opvullingen(), 'normaal');

        $klassen = ['mymmo-stappen', 'mymmo-stappen--pad-' . $opvulling];
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok moet zijn uitlijnklasse zelf zetten -- zie
            // render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        $stijl = [
            '--mk-boven:' . mymmo_cards_px($attrs['boven'] ?? null, 96, 0, 240) . 'px',
        ];

        $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-stappen-bg:' . $bg;
        }

        $nummer = mymmo_cards_color((string) ($attrs['nummerKleur'] ?? ''));
        if ($nummer !== '') {
            $stijl[]   = '--mk-nummer-kleur:' . $nummer;
            $klassen[] = 'mymmo-stappen--nummer-kleur';
        }

        $data = '';
        if (self::vlag($attrs, 'horizontaal', true)) {
            $data = ' data-mymmo-stappen data-scroll="' . mymmo_cards_px($attrs['scroll'] ?? null, 55, 25, 120) . '"';
        }

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . $data . '>'
            // De BAAN is zo hoog als er te scrollen valt; de RIJ kleeft erin.
            // Onder elkaar doen ze allebei niets.
            . '<div class="mymmo-stappen-baan"><div class="mymmo-stappen-rij">' . implode('', $kinderen) . '</div></div>'
            . '</div>';
    }

    /** @param array<string,mixed> $attrs */
    public static function render_stap($attrs = [], string $content = '', $block = null): string {
        if (!mymmo_cards_heeft_inhoud($content)) {
            return '';
        }
        $attrs = is_array($attrs) ? $attrs : [];

        $index = max(0, self::$index);
        if (self::$index >= 0) {
            self::$index++;
        }

        $stijl = [];
        $bg    = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-stap-bg:' . $bg;
        }

        $nummer_klassen = trim('mymmo-stap-nummer ' . self::$nummer_klassen);

        return '<div ' . self::wikkel(['class' => 'mymmo-stap', 'style' => implode(';', $stijl)]) . ' data-mymmo-stap="' . ($index + 1) . '">'
            . '<span class="' . esc_attr($nummer_klassen) . '" aria-hidden="true">' . ($index + 1) . '</span>'
            . '<div class="mymmo-stap-inhoud">' . $content . '</div>'
            . '</div>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Het nummer: maat en lettertype uit het thema
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De klassen van WordPress zelf voor een maat en een lettertype van het
     * thema. Enkel een slug die het thema echt heeft, komt erdoor: deze waarde
     * belandt in een class-attribuut op de pagina.
     *
     * @param array<string,mixed> $attrs
     */
    private static function nummer_klassen(array $attrs): string {
        $klassen = [];

        $groottes = array_column(self::lettergroottes(), 'slug');
        $grootte  = sanitize_title((string) ($attrs['nummerGrootte'] ?? ''));
        if (!in_array($grootte, $groottes, true)) {
            // Geen keuze (of een maat die het thema niet meer heeft): de
            // grootste van het thema. Het nummer is het blikvanger van een stap.
            $grootte = $groottes === [] ? '' : (string) end($groottes);
        }
        if ($grootte !== '') {
            $klassen[] = 'has-' . $grootte . '-font-size';
        }

        $letter = sanitize_title((string) ($attrs['nummerLetter'] ?? ''));
        if ($letter !== '' && in_array($letter, array_column(self::lettertypes(), 'slug'), true)) {
            $klassen[] = 'has-' . $letter . '-font-family';
        }

        return implode(' ', $klassen);
    }

    /**
     * De lettergroottes van het THEMA, van klein naar groot (de volgorde van
     * theme.json). De standaardmaten van WordPress blijven eruit.
     *
     * @return array<int,array{slug:string,name:string}>
     */
    public static function lettergroottes(): array {
        return self::themalijst(['typography', 'fontSizes']);
    }

    /**
     * De lettertypes van het THEMA -- zelfde bron als de markeerstift.
     *
     * @return array<int,array{slug:string,name:string}>
     */
    public static function lettertypes(): array {
        return self::themalijst(['typography', 'fontFamilies']);
    }

    /**
     * @param array<int,string> $pad
     * @return array<int,array{slug:string,name:string}>
     */
    private static function themalijst(array $pad): array {
        if (!function_exists('wp_get_global_settings')) {
            return [];
        }

        $lagen = wp_get_global_settings($pad);
        $rijen = [];
        foreach (['theme', 'custom'] as $laag) {
            if (!empty($lagen[$laag]) && is_array($lagen[$laag])) {
                $rijen = array_merge($rijen, $lagen[$laag]);
            }
        }

        $uit    = [];
        $gezien = [];
        foreach ($rijen as $rij) {
            $slug = isset($rij['slug']) ? sanitize_title((string) $rij['slug']) : '';
            if ($slug === '' || isset($gezien[$slug])) {
                continue;
            }
            $gezien[$slug] = true;
            $uit[] = ['slug' => $slug, 'name' => (string) ($rij['name'] ?? $slug)];
        }

        return $uit;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gereedschap
    // ─────────────────────────────────────────────────────────────────────────

    /** @param array<string,mixed> $attrs */
    private static function vlag(array $attrs, string $naam, bool $terugval): bool {
        if (!array_key_exists($naam, $attrs)) {
            return $terugval;
        }

        return filter_var($attrs[$naam], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $terugval;
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

        wp_enqueue_style('mymmo-stappen');
        wp_enqueue_style('mymmo-stappen-editor');
    }
}
