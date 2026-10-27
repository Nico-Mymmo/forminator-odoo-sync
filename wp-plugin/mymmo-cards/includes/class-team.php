<?php
/**
 * HET TEAM: wie er bij Mymmo werkt, met foto, naam, functie en een korte
 * tekst, als blok op een pagina.
 *
 * DE TEAMLEDEN STAAN IN EEN LIJST, NIET IN DE PAGINA. Een eigen berichttype
 * (mymmo_teamlid), links in het menu onder Team, zoals de bibliotheek van de
 * Veelgestelde vragen. Per teamlid: de naam (titel), de tekst (inhoud, enkel
 * alinea's), de foto (uitgelichte afbeelding), de functie en de kleur achter
 * de tekst (het vak "Functie en kleur") en de volgorde (Volgorde, laag eerst).
 * Wie iemand toevoegt of een functie aanpast, doet dat een keer; elke pagina
 * met het blok volgt. Per site: syndicoach.be en openvme.be hebben elk hun
 * eigen lijst (beslissing David, 2026-10-27).
 *
 * GROEPEN (mymmo_team_groep) zijn optioneel: "Directie" voor de vier
 * bovenaan, bijvoorbeeld. Het blok toont iedereen, of een groep.
 *
 * Een blok:
 *
 *   mymmo/team -- de rij. Welke groep, waar de tekst staat (in de foto bij
 *                 aanwijzen of tikken, onder de naam, of niet), de naam als
 *                 kop of als vette tekst, hoeveel er naast elkaar staan en de
 *                 vorm van de foto.
 *
 * TEKSTEN VAN ELKE LENGTE. In de foto neemt de tekst altijd zijn plaats in,
 * ook als hij verborgen is: een lange tekst maakt de kaart hoger in plaats van
 * uit de foto te lopen, en alle kaarten in een rij zijn even hoog. Er springt
 * dus niets bij het aanwijzen. Geen schuifbalk in een kaart.
 *
 * OP EEN TELEFOON EN EEN TABLET (smaller dan 782px) veeg je horizontaal door
 * het team (mymmo-team.js), met een knop vorige en volgende. Zonder
 * JavaScript staan ze in een raster.
 *
 * Bezoekers zien de lijst zelf niet (geen eigen adres, geen archief): een
 * teamlid staat enkel op een pagina met het blok.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Team {

    public const BLOK  = 'mymmo/team';
    public const TYPE  = 'mymmo_teamlid';
    public const GROEP = 'mymmo_team_groep';

    public const FUNCTIE = 'mymmo_team_functie';
    public const KLEUR   = 'mymmo_team_kleur';

    /** Hoeveel teamleden een blok hoogstens toont. */
    private const MAX = 100;

    /** @var int hoeveel teams er op deze pagina al getoond zijn */
    private static int $teller = 0;

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
        add_action('after_setup_theme', [self::class, 'fotos'], 99);
        add_filter('allowed_block_types_all', [self::class, 'blokken_in_lijst'], 10, 2);

        add_action('add_meta_boxes_' . self::TYPE, [self::class, 'vak']);
        add_action('save_post_' . self::TYPE, [self::class, 'bewaar_vak']);

        add_filter('manage_' . self::TYPE . '_posts_columns', [self::class, 'kolommen_lijst']);
        add_action('manage_' . self::TYPE . '_posts_custom_column', [self::class, 'kolom_lijst'], 10, 2);
        add_action('pre_get_posts', [self::class, 'volgorde_lijst']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gesloten lijsten
    // ─────────────────────────────────────────────────────────────────────────

    /** @return array<string,string> */
    public static function teksten(): array {
        return [
            'aanwijzen' => 'In de foto, bij aanwijzen of tikken',
            'onder'     => 'Onder de naam',
            'geen'      => 'Niet tonen',
        ];
    }

    /**
     * Wat de naam is in de HTML. Een kop volgt de kopstijl van het thema; vet
     * is een <strong> in een alinea, voor een team onder een tussentitel dat
     * de pagina geen tien koppen extra mag geven.
     *
     * @return array<string,string>
     */
    public static function koppen(): array {
        return [
            'h2'  => 'Kop 2',
            'h3'  => 'Kop 3',
            'h4'  => 'Kop 4',
            'vet' => 'Vetgedrukte tekst',
        ];
    }

    /** @return array<string,string> */
    public static function kolommen(): array {
        return [
            '3' => '3',
            '4' => '4',
            '5' => '5',
        ];
    }

    /**
     * De vorm van de foto. Sleutel => [wat je leest, de verhouding in de CSS].
     * "Hoog" is de vorm van de teamfoto's op openvme.be/over-ons.
     *
     * @return array<string,array{0:string,1:string}>
     */
    public static function vormen(): array {
        return [
            'hoog'     => ['Hoog', '8 / 15'],
            'staand'   => ['Staand (4:5)', '4 / 5'],
            'vierkant' => ['Vierkant', '1 / 1'],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        self::lijst();

        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-team', MYMMO_CARDS_URL . 'assets/css/mymmo-team.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);

        wp_register_script(
            'mymmo-team-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-team-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-core-data', 'wp-server-side-render'],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_register_script('mymmo-team', MYMMO_CARDS_URL . 'assets/js/mymmo-team.js', [], MYMMO_CARDS_VERSION, true);

        $vormen = [];
        foreach (self::vormen() as $sleutel => $rij) {
            $vormen[] = ['value' => $sleutel, 'label' => $rij[0]];
        }

        wp_localize_script('mymmo-team-editor', 'MymmoTeam', [
            'teksten'  => self::keuzes(self::teksten()),
            'koppen'   => self::keuzes(self::koppen()),
            'kolommen' => self::keuzes(self::kolommen()),
            'vormen'   => $vormen,
            'type'     => self::TYPE,
            'groep'    => self::GROEP,
            'beheer'   => admin_url('edit.php?post_type=' . self::TYPE),
            'nieuw'    => admin_url('post-new.php?post_type=' . self::TYPE),
        ]);

        register_block_type(self::BLOK, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-team-editor',
            'style'           => 'mymmo-team',
            'view_script'     => 'mymmo-team',
            'attributes'      => self::attributen(),
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /** Het berichttype, de groepen en de velden. */
    private static function lijst(): void {
        register_post_type(self::TYPE, [
            'labels' => [
                'name'                  => 'Team',
                'singular_name'         => 'Teamlid',
                'menu_name'             => 'Team',
                'add_new'               => 'Nieuw teamlid',
                'add_new_item'          => 'Nieuw teamlid',
                'edit_item'             => 'Teamlid bewerken',
                'new_item'              => 'Nieuw teamlid',
                'view_item'             => 'Teamlid bekijken',
                'search_items'          => 'Teamleden zoeken',
                'not_found'             => 'Nog geen teamleden',
                'not_found_in_trash'    => 'Geen teamleden in de prullenbak',
                'all_items'             => 'Alle teamleden',
                'featured_image'        => 'Foto',
                'set_featured_image'    => 'Foto kiezen',
                'remove_featured_image' => 'Foto verwijderen',
                'use_featured_image'    => 'Als foto gebruiken',
            ],
            'description'         => 'Wie er in het team zit, voor het blok Team.',
            // Geen eigen adres per teamlid: een pagina per persoon is niet de
            // bedoeling, en zonder inhoud is het een dunne pagina.
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
            'menu_position'       => 22,
            // De titel is de naam, de inhoud de tekst over de persoon; met
            // Volgorde (page-attributes) zet je het team in de juiste rij.
            'supports'            => ['title', 'editor', 'thumbnail', 'page-attributes', 'revisions'],
            'template'            => [['core/paragraph', ['placeholder' => 'Wie is dit? Twee tot vier zinnen: wat deze persoon doet en waarom het ertoe doet. Hoe korter, hoe beter het in de foto past.']]],
        ]);

        register_taxonomy(self::GROEP, [self::TYPE], [
            'labels' => [
                'name'          => 'Groepen',
                'singular_name' => 'Groep',
                'menu_name'     => 'Groepen',
                'all_items'     => 'Alle groepen',
                'edit_item'     => 'Groep bewerken',
                'add_new_item'  => 'Nieuwe groep',
                'search_items'  => 'Groepen zoeken',
                'not_found'     => 'Nog geen groepen',
            ],
            'public'            => false,
            'show_ui'           => true,
            'show_in_rest'      => true,
            'rest_base'         => self::GROEP,
            'show_admin_column' => true,
            'hierarchical'      => true,
            'rewrite'           => false,
            'query_var'         => false,
        ]);

        $mag = static function (): bool {
            return current_user_can('edit_posts');
        };

        register_post_meta(self::TYPE, self::FUNCTIE, [
            'type'              => 'string',
            'single'            => true,
            'show_in_rest'      => false,
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback'     => $mag,
        ]);

        register_post_meta(self::TYPE, self::KLEUR, [
            'type'              => 'string',
            'single'            => true,
            'show_in_rest'      => false,
            'sanitize_callback' => [self::class, 'slug'],
            'auth_callback'     => $mag,
        ]);
    }

    /**
     * Een thema zonder uitgelichte afbeeldingen zou het vak Foto niet tonen.
     * Enkel voor dit berichttype: wat het thema elders doet, blijft.
     */
    public static function fotos(): void {
        add_theme_support('post-thumbnails', [self::TYPE]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-team-editor.js (geen bouwstap). De
     * namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen(): array {
        return [
            'align'    => ['type' => 'string', 'default' => 'wide'],
            // De slug van een groep; leeg = iedereen.
            'groep'    => ['type' => 'string', 'default' => ''],
            'tekst'    => ['type' => 'string', 'default' => 'aanwijzen'],
            'kop'      => ['type' => 'string', 'default' => 'h3'],
            // Hoeveel teamleden er hoogstens naast elkaar staan op een computer.
            'kolommen' => ['type' => 'string', 'default' => '4'],
            'vorm'     => ['type' => 'string', 'default' => 'hoog'],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De teamleden van een groep (slug; '' = iedereen), in hun volgorde.
     *
     * @return array<int,WP_Post>
     */
    public static function leden(string $groep): array {
        $vraag = [
            'post_type'        => self::TYPE,
            'post_status'      => 'publish',
            'posts_per_page'   => self::MAX,
            'orderby'          => ['menu_order' => 'ASC', 'title' => 'ASC'],
            'no_found_rows'    => true,
            'suppress_filters' => false,
        ];
        if ($groep !== '') {
            $vraag['tax_query'] = [[
                'taxonomy' => self::GROEP,
                'field'    => 'slug',
                'terms'    => $groep,
            ]];
        }

        $leden = get_posts($vraag);

        return array_values(array_filter($leden, static function ($l): bool {
            return $l instanceof WP_Post;
        }));
    }

    /** @param array<string,mixed> $attrs */
    public static function render($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $groep = sanitize_title((string) ($attrs['groep'] ?? ''));
        $leden = self::leden($groep);
        if ($leden === []) {
            return '';
        }

        $tekst    = mymmo_cards_keuze((string) ($attrs['tekst'] ?? ''), self::teksten(), 'aanwijzen');
        $kop      = mymmo_cards_keuze((string) ($attrs['kop'] ?? ''), self::koppen(), 'h3');
        $vorm     = mymmo_cards_keuze((string) ($attrs['vorm'] ?? ''), self::vormen(), 'hoog');
        $maximum  = (int) mymmo_cards_keuze((string) ($attrs['kolommen'] ?? ''), self::kolommen(), '4');
        // Drie teamleden met een maximum van vier: drie kolommen, geen gat.
        $kolommen = max(1, min(count($leden), $maximum));

        self::$teller++;
        $team = 'mymmo-team-' . self::$teller;

        $kaarten = [];
        foreach ($leden as $lid) {
            $kaarten[] = self::kaart($lid, $team, $tekst, $kop);
        }

        $klassen = ['mymmo-team', 'mymmo-team--tekst-' . $tekst];
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok moet zijn uitlijnklasse zelf zetten -- zie
            // render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        $stijl = [];
        $stijl[] = '--mk-kolommen:' . $kolommen;
        $stijl[] = '--mk-kolommen-smal:' . min($kolommen, 3);
        $stijl[] = '--mk-verhouding:' . self::vormen()[$vorm][1];

        // De knoppen om te vegen staan in de HTML maar verborgen: het script
        // toont ze pas als het de rij laat vegen (smaller dan 782px).
        $bediening = '<div class="mymmo-team-bediening" hidden>'
            . '<button type="button" class="mymmo-team-pijl mymmo-team-pijl--vorige" aria-controls="' . esc_attr($team) . '" aria-label="Vorige"></button>'
            . '<button type="button" class="mymmo-team-pijl mymmo-team-pijl--volgende" aria-controls="' . esc_attr($team) . '" aria-label="Volgende"></button>'
            . '</div>';

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . '>'
            . '<div class="mymmo-team-venster">'
            . '<ul class="mymmo-team-rij" id="' . esc_attr($team) . '" role="list">' . implode('', $kaarten) . '</ul>'
            . '</div>'
            . $bediening
            . '</div>';
    }

    /** Een teamlid. */
    private static function kaart(WP_Post $lid, string $team, string $tekst, string $kop): string {
        $naam    = trim((string) $lid->post_title);
        $functie = trim((string) get_post_meta($lid->ID, self::FUNCTIE, true));
        $bio     = $tekst === 'geen' ? '' : self::bio($lid);

        $stijl = [];
        $kleur = mymmo_cards_color(self::slug((string) get_post_meta($lid->ID, self::KLEUR, true)));
        if ($kleur !== '') {
            $stijl[] = '--mk-lid-kleur:' . $kleur;
        }

        $html = '<li class="mymmo-team-lid"' . ($stijl !== [] ? ' style="' . esc_attr(implode(';', $stijl)) . '"' : '') . '>';

        $html .= '<div class="mymmo-team-beeld">' . self::foto($lid, $naam);
        if ($tekst === 'aanwijzen' && $bio !== '') {
            $id = $team . '-bio-' . $lid->ID;
            $html .= '<div class="mymmo-team-bio" id="' . esc_attr($id) . '">' . $bio . '</div>'
                . '<button type="button" class="mymmo-team-knop" aria-expanded="false" aria-controls="' . esc_attr($id) . '"'
                . ' aria-label="' . esc_attr(sprintf('Over %s', $naam !== '' ? $naam : 'dit teamlid')) . '"></button>';
        }
        $html .= '</div>';

        if ($naam !== '') {
            $html .= $kop === 'vet'
                ? '<p class="mymmo-team-naam"><strong>' . esc_html($naam) . '</strong></p>'
                : '<' . $kop . ' class="mymmo-team-naam">' . esc_html($naam) . '</' . $kop . '>';
        }
        if ($functie !== '') {
            $html .= '<p class="mymmo-team-functie has-small-font-size">' . esc_html($functie) . '</p>';
        }
        if ($tekst === 'onder' && $bio !== '') {
            $html .= '<div class="mymmo-team-bio-onder">' . $bio . '</div>';
        }

        return $html . '</li>';
    }

    /** De tekst over een teamlid (HTML), of ''. */
    private static function bio(WP_Post $lid): string {
        $inhoud = (string) $lid->post_content;
        $html = has_blocks($inhoud) ? do_blocks($inhoud) : wpautop($inhoud);
        $html = trim(wp_kses_post($html));

        return mymmo_cards_heeft_inhoud($html) ? $html : '';
    }

    /** De foto, of '' (dan staat de kleur van het teamlid er). */
    private static function foto(WP_Post $lid, string $naam): string {
        $id = (int) get_post_thumbnail_id($lid);
        if ($id <= 0) {
            return '';
        }

        $alt = trim((string) get_post_meta($id, '_wp_attachment_image_alt', true));

        $img = wp_get_attachment_image($id, 'large', false, [
            'class'     => 'mymmo-team-foto',
            'alt'       => $alt !== '' ? $alt : $naam,
            // Vier naast elkaar op een computer, ruim een derde op een tablet,
            // driekwart op een telefoon.
            'sizes'     => '(max-width: 639px) 80vw, (max-width: 781px) 45vw, 400px',
            'draggable' => 'false',
        ]);

        return is_string($img) ? $img : '';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // De lijst in wp-admin
    // ─────────────────────────────────────────────────────────────────────────

    /** Het vak "Functie en kleur" naast de tekst. */
    public static function vak(): void {
        add_meta_box('mymmo-team-vak', 'Functie en kleur', [self::class, 'toon_vak'], self::TYPE, 'side', 'high');
    }

    public static function toon_vak(WP_Post $lid): void {
        $functie = (string) get_post_meta($lid->ID, self::FUNCTIE, true);
        $kleur   = self::slug((string) get_post_meta($lid->ID, self::KLEUR, true));

        wp_nonce_field('mymmo_team_vak', 'mymmo_team_vak_nonce');

        echo '<p><label for="mymmo-team-functie"><strong>Functie</strong></label><br>'
            . '<input type="text" class="widefat" name="mymmo_team_functie" id="mymmo-team-functie" value="' . esc_attr($functie) . '" placeholder="Head of Product"></p>';

        echo '<p><label for="mymmo-team-kleur"><strong>Kleur achter de tekst</strong></label><br>'
            . '<select class="widefat" name="mymmo_team_kleur" id="mymmo-team-kleur">'
            . '<option value="">Standaard (licht vlak)</option>';
        foreach (self::palet() as $slug => $label) {
            echo '<option value="' . esc_attr($slug) . '"' . selected($kleur, $slug, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select></p>'
            . '<p class="description">Uit het palet van de site. Kies de kleur van de achtergrond op de foto: dan loopt de tekst er mooi over.</p>'
            . '<p class="description">De volgorde stel je in onder Volgorde (laag eerst). De foto: Foto kiezen, hieronder.</p>';
    }

    public static function bewaar_vak(int $id): void {
        if (!isset($_POST['mymmo_team_vak_nonce'])) {
            return;
        }
        if (!wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['mymmo_team_vak_nonce'])), 'mymmo_team_vak')) {
            return;
        }
        if ((defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) || wp_is_post_revision($id) || !current_user_can('edit_post', $id)) {
            return;
        }

        if (isset($_POST['mymmo_team_functie'])) {
            update_post_meta($id, self::FUNCTIE, sanitize_text_field(wp_unslash((string) $_POST['mymmo_team_functie'])));
        }
        if (isset($_POST['mymmo_team_kleur'])) {
            $kleur = self::slug(wp_unslash((string) $_POST['mymmo_team_kleur']));
            if ($kleur !== '' && !isset(self::palet()[$kleur])) {
                $kleur = '';
            }
            update_post_meta($id, self::KLEUR, $kleur);
        }
    }

    /**
     * De kleuren van het palet van het thema: slug => naam.
     *
     * @return array<string,string>
     */
    private static function palet(): array {
        if (!function_exists('wp_get_global_settings')) {
            return [];
        }
        $palet = wp_get_global_settings(['color', 'palette']);
        $uit = [];
        foreach (['theme', 'custom', 'default'] as $bron) {
            foreach ((array) ($palet[$bron] ?? []) as $kleur) {
                $slug = self::slug((string) ($kleur['slug'] ?? ''));
                if ($slug !== '' && !isset($uit[$slug])) {
                    $uit[$slug] = (string) ($kleur['name'] ?? $slug);
                }
            }
        }

        return $uit;
    }

    /** Een slug van letters, cijfers en streepjes, of ''. */
    public static function slug($ruw): string {
        $waarde = strtolower(trim((string) $ruw));

        return preg_match('/^[a-z0-9][a-z0-9-]{0,60}$/', $waarde) ? $waarde : '';
    }

    /**
     * De kolommen in de lijst: foto, functie en volgorde naast de naam.
     *
     * @param array<string,string> $kolommen
     * @return array<string,string>
     */
    public static function kolommen_lijst($kolommen): array {
        $kolommen = is_array($kolommen) ? $kolommen : [];
        $uit = [];
        foreach ($kolommen as $sleutel => $label) {
            if ($sleutel === 'title') {
                $uit['mymmo_foto'] = 'Foto';
            }
            $uit[$sleutel] = $sleutel === 'title' ? 'Naam' : $label;
            if ($sleutel === 'title') {
                $uit['mymmo_functie'] = 'Functie';
                $uit['mymmo_volgorde'] = 'Volgorde';
            }
        }

        return $uit;
    }

    public static function kolom_lijst(string $kolom, int $id): void {
        if ($kolom === 'mymmo_foto') {
            $foto = get_the_post_thumbnail($id, [48, 48]);
            echo is_string($foto) ? $foto : '';
        } elseif ($kolom === 'mymmo_functie') {
            echo esc_html((string) get_post_meta($id, self::FUNCTIE, true));
        } elseif ($kolom === 'mymmo_volgorde') {
            echo esc_html((string) get_post_field('menu_order', $id));
        }
    }

    /** De lijst in wp-admin in de volgorde van de pagina, tenzij je zelf sorteert. */
    public static function volgorde_lijst($vraag): void {
        if (!is_admin() || !$vraag instanceof WP_Query || !$vraag->is_main_query()) {
            return;
        }
        if ($vraag->get('post_type') !== self::TYPE || $vraag->get('orderby')) {
            return;
        }
        $vraag->set('orderby', ['menu_order' => 'ASC', 'title' => 'ASC']);
    }

    /**
     * In de tekst over een teamlid: enkel alinea's. Het is een paar zinnen in
     * een foto, geen pagina.
     *
     * @param bool|array<int,string> $toegelaten
     * @param mixed                  $context
     * @return bool|array<int,string>
     */
    public static function blokken_in_lijst($toegelaten, $context) {
        if (!is_object($context) || !isset($context->post) || !$context->post instanceof WP_Post || $context->post->post_type !== self::TYPE) {
            return $toegelaten;
        }

        return ['core/paragraph'];
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

        wp_enqueue_style('mymmo-team');
    }
}
