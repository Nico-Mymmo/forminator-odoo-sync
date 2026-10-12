<?php
/**
 * DE GETUIGENISSEN: klanten die aan het woord komen, naast elkaar, met foto.
 *
 * Twee blokken:
 *
 *   mymmo/getuigenissen -- de rij. Bepaalt hoeveel er hoogstens naast elkaar
 *                          staan, de vorm van de foto, de achtergrond en de
 *                          opvulling.
 *   mymmo/getuigenis    -- een getuigenis. De INHOUD zijn gewone core-blokken
 *                          (afbeelding, alinea's), dus de letter komt uit het
 *                          thema -- zelfde regel als bij de kaarten en de stappen.
 *
 * DE OPBOUW VAN EEN GETUIGENIS staat in het sjabloon van de editor: een foto,
 * het citaat, de naam, en wie die persoon is ("Mede-eigenaar, Residentie X").
 * Die drie alinea's dragen een eigen klasse (mymmo-getuigenis-citaat/-naam/
 * -wie), zodat de CSS ze kan aanwijzen zonder op hun plaats te rekenen: de
 * aanhalingstekens rond het citaat, de naam onderaan in elke kaart op dezelfde
 * hoogte, de laatste regel zachter. Geen enkele letterinstelling.
 *
 * HET AANTAL KOLOMMEN wordt hier geteld: zo veel als er getuigenissen zijn, met
 * een maximum dat de redacteur kiest. Twee getuigenissen nemen dus elk de halve
 * breedte, niet twee derde met een gat ernaast.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Getuigenissen {

    public const RIJ        = 'mymmo/getuigenissen';
    public const GETUIGENIS = 'mymmo/getuigenis';

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gesloten lijsten
    // ─────────────────────────────────────────────────────────────────────────

    /** @return array<string,string> */
    public static function fotos(): array {
        return [
            'rond'  => 'Rond portret',
            'breed' => 'Breed, over de hele kaart',
        ];
    }

    /** @return array<string,string> */
    public static function kolommen(): array {
        return [
            '2' => '2',
            '3' => '3',
            '4' => '4',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-getuigenissen', MYMMO_CARDS_URL . 'assets/css/mymmo-getuigenissen.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);
        wp_register_style('mymmo-getuigenissen-editor', MYMMO_CARDS_URL . 'assets/css/mymmo-getuigenissen-editor.css', ['mymmo-getuigenissen'], MYMMO_CARDS_VERSION);

        wp_register_script(
            'mymmo-getuigenissen-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-getuigenissen-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data'],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_localize_script('mymmo-getuigenissen-editor', 'MymmoGetuigenissen', [
            'opvullingen' => self::keuzes(mymmo_cards_opvullingen()),
            'fotos'       => self::keuzes(self::fotos()),
            'kolommen'    => self::keuzes(self::kolommen()),
        ]);

        register_block_type(self::RIJ, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-getuigenissen-editor',
            'editor_style'    => 'mymmo-getuigenissen-editor',
            'style'           => 'mymmo-getuigenissen',
            'attributes'      => self::attributen_rij(),
            'render_callback' => [self::class, 'render_rij'],
        ]);

        register_block_type(self::GETUIGENIS, [
            'api_version'     => 2,
            'parent'          => [self::RIJ],
            'attributes'      => self::attributen_getuigenis(),
            'render_callback' => [self::class, 'render_getuigenis'],
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-getuigenissen-editor.js (geen
     * bouwstap). De namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen_rij(): array {
        return [
            'align'       => ['type' => 'string', 'default' => 'wide'],
            // Hoeveel getuigenissen er hoogstens naast elkaar staan; meer
            // schuiven door naar een volgende rij.
            'kolommen'    => ['type' => 'string', 'default' => '3'],
            'foto'        => ['type' => 'string', 'default' => 'rond'],
            // Een kleur uit het palet (slug). Leeg = het vlak van de huisstijl.
            'achtergrond' => ['type' => 'string', 'default' => ''],
            'opvulling'   => ['type' => 'string', 'default' => 'normaal'],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_getuigenis(): array {
        return [
            // Leeg = de achtergrond van de rij.
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
    public static function render_rij($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $kinderen = [];
        if (is_object($block) && isset($block->inner_blocks)) {
            foreach ($block->inner_blocks as $kind) {
                $html = (string) $kind->render();
                if (trim($html) !== '') {
                    $kinderen[] = $html;
                }
            }
        }

        if ($kinderen === []) {
            return '';
        }

        $opvulling = mymmo_cards_keuze((string) ($attrs['opvulling'] ?? ''), mymmo_cards_opvullingen(), 'normaal');
        $foto      = mymmo_cards_keuze((string) ($attrs['foto'] ?? ''), self::fotos(), 'rond');
        $maximum   = (int) mymmo_cards_keuze((string) ($attrs['kolommen'] ?? ''), self::kolommen(), '3');
        $kolommen  = max(1, min(count($kinderen), $maximum));

        $klassen = [
            'mymmo-getuigenissen',
            'mymmo-getuigenissen--pad-' . $opvulling,
            'mymmo-getuigenissen--foto-' . $foto,
        ];
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok moet zijn uitlijnklasse zelf zetten -- zie
            // render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        $stijl = ['--mk-kolommen:' . $kolommen];

        $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-getuigenissen-bg:' . $bg;
        }

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . '>'
            . '<div class="mymmo-getuigenissen-rij">' . implode('', $kinderen) . '</div>'
            . '</div>';
    }

    /** @param array<string,mixed> $attrs */
    public static function render_getuigenis($attrs = [], string $content = '', $block = null): string {
        if (!mymmo_cards_heeft_inhoud($content)) {
            return '';
        }
        $attrs = is_array($attrs) ? $attrs : [];

        $stijl = [];
        $bg    = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-getuigenis-bg:' . $bg;
        }

        return '<div ' . self::wikkel(['class' => 'mymmo-getuigenis', 'style' => implode(';', $stijl)]) . '>'
            . '<div class="mymmo-getuigenis-inhoud">' . $content . '</div>'
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

    /** De stylesheets ook in de editor -- zie Mymmo_Cards_Blocks::assets(). */
    public static function assets(): void {
        if (!is_admin()) {
            return;
        }

        wp_enqueue_style('mymmo-getuigenissen');
        wp_enqueue_style('mymmo-getuigenissen-editor');
    }
}
