<?php
/**
 * DE KOSTENCALCULATOR: wat het pakket kost voor een gebouw, per aantal kavels.
 *
 * Gemaakt voor de pagina over de bankkosten van een VME: de bezoeker zet het
 * aantal kavels met min en plus (van 2 tot 200, standaard 4) en ziet per lijn
 * wat het kost, met het totaal groot eronder:
 *
 *   OpenVME Basic · 4 × €4 / maand          €16 / maand
 *   Mollie · werk- en reserverekening        €9 / maand
 *   €300 per jaar voor het gebouw
 *   €25 per maand · €75,00 per kavel per jaar
 *
 * DE PRIJZEN STAAN IN DE ZIJBALK, niet in de code: een nieuwe prijs is dan een
 * wijziging in de editor, geen nieuwe versie van de plugin. De rekensom is
 * altijd dezelfde: (aantal × prijs per kavel + vaste kost) × 12.
 *
 * DE SERVER REKENT DE BEGINSTAND UIT, het script (mymmo-kostencalculator.js)
 * enkel wat er verandert als iemand op min of plus klikt. Zonder JavaScript
 * staat er dus een kloppende prijs voor het standaard aantal kavels.
 *
 * NAAST DE CALCULATOR mag tekst staan: gewone core-blokken (kop, alinea,
 * knoppen), dus de letter komt uit het thema. Leeg = enkel de calculator.
 *
 * HET TOTAAL IS GROOT met een lettergrootte van het THEMA (`has-<slug>-font-size`,
 * standaard de grootste), zelfde afweging als het nummer van de stappen: de
 * plugin kent zelf geen enkele maat.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Kostencalculator {

    public const BLOK = 'mymmo/kostencalculator';

    /** Het bereik van de teller, zoals gevraagd voor de pagina bankkosten. */
    public const MIN = 2;
    public const MAX = 200;

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

        wp_register_style('mymmo-kostencalculator', MYMMO_CARDS_URL . 'assets/css/mymmo-kostencalculator.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);
        wp_register_script('mymmo-kostencalculator', MYMMO_CARDS_URL . 'assets/js/mymmo-kostencalculator.js', [], MYMMO_CARDS_VERSION, true);

        wp_register_script(
            'mymmo-kostencalculator-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-kostencalculator-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components'],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_localize_script('mymmo-kostencalculator-editor', 'MymmoKostencalculator', [
            'opvullingen' => self::keuzes(mymmo_cards_opvullingen()),
            'groottes'    => Mymmo_Cards_Stappen::lettergroottes(),
            'min'         => self::MIN,
            'max'         => self::MAX,
        ]);

        register_block_type(self::BLOK, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-kostencalculator-editor',
            'style'           => 'mymmo-kostencalculator',
            'view_script'     => 'mymmo-kostencalculator',
            'attributes'      => self::attributen(),
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-kostencalculator-editor.js (geen
     * bouwstap). De namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen(): array {
        return [
            'align'         => ['type' => 'string', 'default' => 'wide'],
            'pakket'        => ['type' => 'string', 'default' => 'OpenVME Basic'],
            'prijsPerKavel' => ['type' => 'number', 'default' => 4],
            'vast'          => ['type' => 'string', 'default' => 'Mollie · werk- en reserverekening'],
            'prijsVast'     => ['type' => 'number', 'default' => 9],
            'kavels'        => ['type' => 'number', 'default' => 4],
            // Een lettergrootte van het thema (slug). Leeg = de grootste.
            'totaalGrootte' => ['type' => 'string', 'default' => ''],
            // Een kleur uit het palet (slug). Leeg = het vlak van de huisstijl.
            'achtergrond'   => ['type' => 'string', 'default' => ''],
            'opvulling'     => ['type' => 'string', 'default' => 'normaal'],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $prijs  = self::bedrag($attrs['prijsPerKavel'] ?? 4);
        $vast   = self::bedrag($attrs['prijsVast'] ?? 9);
        $kavels = max(self::MIN, min(self::MAX, (int) ($attrs['kavels'] ?? 4)));
        $pakket = trim((string) ($attrs['pakket'] ?? 'OpenVME Basic'));
        $vastNaam = trim((string) ($attrs['vast'] ?? 'Mollie · werk- en reserverekening'));

        // In centen, zodat 4,10 × 3 geen 12,299999 wordt.
        $pakketCent = (int) round($prijs * 100) * $kavels;
        $maandCent  = $pakketCent + (int) round($vast * 100);
        $jaarCent   = $maandCent * 12;

        $opvulling = mymmo_cards_keuze((string) ($attrs['opvulling'] ?? ''), mymmo_cards_opvullingen(), 'normaal');
        $intro     = mymmo_cards_heeft_inhoud($content);

        $klassen = ['mymmo-kosten', 'mymmo-kosten--pad-' . $opvulling];
        if ($intro) {
            $klassen[] = 'mymmo-kosten--met-tekst';
        }
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok moet zijn uitlijnklasse zelf zetten -- zie
            // render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        $stijl = [];
        $bg    = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-kosten-bg:' . $bg;
        }

        $id = function_exists('wp_unique_id') ? wp_unique_id('mymmo-kosten-') : 'mymmo-kosten-' . wp_rand();

        $html = '<div ' . self::wikkel([
            'class'              => implode(' ', $klassen),
            'style'              => implode(';', $stijl),
            'data-mymmo-kosten'  => '1',
            'data-prijs'         => (string) $prijs,
            'data-vast'          => (string) $vast,
            'data-kavels'        => (string) $kavels,
            'data-min'           => (string) self::MIN,
            'data-max'           => (string) self::MAX,
        ]) . '>';

        if ($intro) {
            $html .= '<div class="mymmo-kosten-tekst">' . $content . '</div>';
        }

        $html .= '<div class="mymmo-kosten-vak">'
            . '<div class="mymmo-kosten-rij mymmo-kosten-rij--teller">'
            . '<span class="mymmo-kosten-label" id="' . esc_attr($id) . '-label"><strong>Aantal kavels</strong></span>'
            . '<div class="mymmo-kosten-teller" role="group" aria-labelledby="' . esc_attr($id) . '-label">'
            . '<button type="button" class="mymmo-kosten-knop mymmo-kosten-knop--min" data-stap="-1" aria-label="Eén kavel minder"' . ($kavels <= self::MIN ? ' disabled' : '') . '></button>'
            . '<span class="mymmo-kosten-aantal" data-kosten="aantal">' . $kavels . '</span>'
            . '<button type="button" class="mymmo-kosten-knop mymmo-kosten-knop--plus" data-stap="1" aria-label="Eén kavel meer"' . ($kavels >= self::MAX ? ' disabled' : '') . '></button>'
            . '</div>'
            . '</div>'
            . '<div class="mymmo-kosten-rij">'
            . '<span>' . esc_html($pakket) . ($pakket !== '' ? ' · ' : '') . '<span data-kosten="aantal">' . $kavels . '</span> × €' . esc_html(self::euro($prijs)) . ' / maand</span>'
            . '<span class="mymmo-kosten-bedrag">€<span data-kosten="pakket">' . esc_html(self::euro($pakketCent / 100)) . '</span> / maand</span>'
            . '</div>'
            . '<div class="mymmo-kosten-rij">'
            . '<span>' . esc_html($vastNaam) . '</span>'
            . '<span class="mymmo-kosten-bedrag">€' . esc_html(self::euro($vast)) . ' / maand</span>'
            . '</div>'
            . '<div class="mymmo-kosten-totaal" aria-live="polite" aria-atomic="true">'
            . '<p class="mymmo-kosten-jaar"><strong class="' . esc_attr(self::totaal_klassen($attrs)) . '">€<span data-kosten="jaar">' . esc_html(self::euro($jaarCent / 100)) . '</span></strong> per jaar voor het gebouw</p>'
            . '<p class="mymmo-kosten-noot">€<span data-kosten="maand">' . esc_html(self::euro($maandCent / 100)) . '</span> per maand · €<span data-kosten="kavel">' . esc_html(self::euro($jaarCent / 100 / $kavels, true)) . '</span> per kavel per jaar</p>'
            . '</div>'
            . '</div>';

        return $html . '</div>';
    }

    /**
     * De klassen van het totaal: een lettergrootte van het thema, zoals het
     * nummer van de stappen (zie nummer_klassen() in class-stappen.php).
     *
     * @param array<string,mixed> $attrs
     */
    private static function totaal_klassen(array $attrs): string {
        $klassen  = ['mymmo-kosten-groot'];
        $groottes = array_column(Mymmo_Cards_Stappen::lettergroottes(), 'slug');
        $grootte  = sanitize_title((string) ($attrs['totaalGrootte'] ?? ''));
        if (!in_array($grootte, $groottes, true)) {
            // Geen keuze: de grootste van het thema. Het totaal is de blikvanger.
            $grootte = $groottes === [] ? '' : (string) end($groottes);
        }
        if ($grootte !== '') {
            $klassen[] = 'has-' . $grootte . '-font-size';
        }

        return implode(' ', $klassen);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gereedschap
    // ─────────────────────────────────────────────────────────────────────────

    /** Een prijs uit de zijbalk: een getal van 0 of meer, op de cent. */
    private static function bedrag($ruw): float {
        $getal = is_numeric($ruw) ? (float) $ruw : 0.0;

        return round(max(0.0, min(100000.0, $getal)), 2);
    }

    /**
     * Een bedrag zoals in België: 1.234 of 4,50. Een rond bedrag zonder
     * cijfers na de komma, tenzij $altijd (de prijs per kavel: 75,00).
     * Dezelfde regel als euro() in mymmo-kostencalculator.js.
     */
    private static function euro(float $bedrag, bool $altijd = false): string {
        $cent = (int) round($bedrag * 100);
        $decimalen = ($altijd || $cent % 100 !== 0) ? 2 : 0;

        return number_format($cent / 100, $decimalen, ',', '.');
    }

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

        wp_enqueue_style('mymmo-kostencalculator');
    }
}
