<?php
/**
 * De MARKEERSTIFT: een woord in een kop of alinea uitlichten.
 *
 * Wat het vervangt: op syndicoach.be stond onder het woord "anders" een
 * afbeelding, met de hand op zijn plek geduwd. Dat is per woord werk, het is
 * niet te herkleuren, en het schuift mis zodra de tekst wijzigt.
 *
 * Hoe het nu werkt: een opmaakknop in de werkbalk van de tekst zelf (net als
 * vet en cursief). Je selecteert een woord, kiest een streep en een kleur uit
 * het palet van het thema, en klaar. De streep is een SVG die als MASKER dient;
 * de kleur komt uit een `var(--wp--preset--color--…)`.
 *
 * VIER DINGEN DIE BEWUST ZO ZIJN
 *
 * 1. GEEN INLINE STIJL, maar klassen. De kleur staat als
 *    `mymmo-mark--kleur-<slug>` op het element en de bijbehorende regel wordt
 *    hieronder gegenereerd. Reden: WordPress filtert het `style`-attribuut voor
 *    iedereen zonder `unfiltered_html` (auteurs, redacteuren op een multisite),
 *    en of een CSS-variabele daar doorheen komt, verschilt per versie. Een
 *    klasse komt er altijd door.
 *
 * 2. HET PALET KOMT UIT HET THEMA, niet uit een eigen lijstje. `theme.json` is
 *    de bron; voegt iemand daar een merkkleur toe, dan staat ze de volgende
 *    paginalading in de kiezer. Een eigen kopie zou stil verouderen.
 *
 * 3. DE VORMEN ZIJN DE BESTANDEN IN `assets/vormen/`. Een eigen tekening
 *    toevoegen is: het bestand daar zetten, en klaar -- geen regel code. Die map
 *    hoort bij de plugin en staat in git, dus het blijft een gesloten lijst; wat
 *    vervalt is de dubbele boekhouding tussen de map en een array. Geen
 *    URL-veld in de editor: die waarde zou in de pagina van een bezoeker
 *    belanden, en een streep hoort bij de huisstijl -- niet bij het bericht.
 *
 * 4. EEN STREEP HEEFT LENGTES, en daar gaat de naamgeving over.
 *    `markering-stift-1.svg` tot `-4.svg` zijn VIER TEKENINGEN VAN DEZELFDE
 *    STIFT, elk voor een andere woordlengte. Ze staan in de kiezer als één
 *    keuze; welke er op het scherm komt, kiest `mymmo-markering-front.js` per
 *    woord -- die met de verhouding die het dichtst bij dat woord ligt.
 *
 *    Waarom niet één tekening uitrekken: `preserveAspectRatio="none"` rekt ook
 *    de TEXTUUR uit. Een streep die voor drie letters getekend is, wordt over
 *    een lange woordgroep een uitgesmeerde balk waarin de trapjes aan het einde
 *    even breed worden als een letter. Met vier lengtes blijft de rek klein
 *    genoeg om niet op te vallen.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Markering {

    /** Waar de tekeningen staan, en hoe ze heten: `markering-<naam>[-<n>].svg`. */
    private const MAP     = 'assets/vormen/';
    private const PATROON = 'markering-';

    /**
     * Alleen de VOLGORDE en een nette naam. Wat hier niet in staat, verdwijnt
     * niet -- het komt achteraan te staan met een naam uit de bestandsnaam. Zo
     * vraagt een nieuwe tekening geen release.
     */
    private const LABELS = [
        'stift' => 'Markeerstift',
    ];

    /**
     * De diktes, als ABSOLUTE waarden.
     *
     * `<strong>` is `font-weight: bolder` en dus relatief: in een kop die al op
     * 700 staat betekent dat 900, en heeft het lettertype geen 900, dan
     * verandert er niets -- zonder foutmelding, zonder zichtbaar verschil. Dat
     * is precies waarom de knop "vet" op een kop niets leek te doen.
     *
     * Een gesloten lijst en geen vrij getal: 350 of 512 bestaat in geen enkel
     * van onze lettertypes, en een dikte die stil terugvalt op de dichtstbijzijnde
     * is een instelling die iets anders doet dan ze zegt.
     */
    private const GEWICHTEN = [
        400 => 'Normaal',
        500 => 'Medium',
        600 => 'Halfvet',
        700 => 'Vet',
        800 => 'Extra vet',
    ];

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        // `enqueue_block_assets` vuurt op de VOORKANT en in het canvas van de
        // editor: dezelfde stylesheet en hetzelfde keuzescript op allebei, want
        // wat een redacteur ziet hoort te zijn wat een bezoeker ziet.
        // `wp_enqueue_scripts` erbij zou het gegenereerde blok op de voorkant
        // verdubbelen.
        add_action('enqueue_block_assets', [self::class, 'stijl']);
        add_action('enqueue_block_editor_assets', [self::class, 'editor']);
    }

    public static function register(): void {
        wp_register_style(
            'mymmo-markering',
            MYMMO_CARDS_URL . 'assets/css/mymmo-markering.css',
            [],
            MYMMO_CARDS_VERSION
        );

        wp_register_style(
            'mymmo-markering-editor',
            MYMMO_CARDS_URL . 'assets/css/mymmo-markering-editor.css',
            [],
            MYMMO_CARDS_VERSION
        );

        wp_register_script(
            'mymmo-markering-front',
            MYMMO_CARDS_URL . 'assets/js/mymmo-markering-front.js',
            [],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_register_script(
            'mymmo-markering',
            MYMMO_CARDS_URL . 'assets/js/mymmo-markering.js',
            ['wp-rich-text', 'wp-block-editor', 'wp-components', 'wp-element'],
            MYMMO_CARDS_VERSION,
            true
        );
    }

    /**
     * De stylesheet plus de regels die per vorm en per kleur gegenereerd
     * worden, en het scriptje dat per woord de lengte kiest.
     *
     * Die regels kunnen niet in het CSS-bestand staan: de vormen hebben de URL
     * van de plugin nodig, en de kleuren komen uit het thema.
     */
    public static function stijl(): void {
        wp_enqueue_style('mymmo-markering');
        wp_add_inline_style('mymmo-markering', self::regels());

        wp_enqueue_script('mymmo-markering-front');
        wp_localize_script('mymmo-markering-front', 'MymmoMarkeringVormen', self::vormen());
    }

    public static function editor(): void {
        wp_enqueue_script('mymmo-markering');

        // De kiezer is een popover en leeft BUITEN het canvas-iframe, bij de
        // werkbalk. `enqueue_block_assets` (waar de streep-stylesheet aan hangt)
        // laadt in het iframe, dus die zou de kiezer nooit bereiken.
        wp_enqueue_style('mymmo-markering-editor');

        wp_localize_script('mymmo-markering', 'MymmoMarkering', [
            'vormen'      => self::vormen(),
            'kleuren'     => self::kleuren(),
            'lettertypes' => self::lettertypes(),
            'gewichten'   => self::gewichten(),
        ]);
    }

    /**
     * De gegenereerde regels: één per vorm (welke tekening) en één per kleur.
     *
     * @return string
     */
    private static function regels(): string {
        $uit = [];
        $vormen = self::vormen();

        /*
         * De VALREGEL staat VOORAAN. `.mymmo-mark` en `.mymmo-mark--stift` zijn
         * even zwaar (0,1,0), dus wie achteraan staat wint. Stond de valregel
         * achteraan, dan kreeg elke markering de eerste streep -- ongeacht wat
         * er gekozen was, en zonder dat er iets fout lijkt te gaan.
         *
         * Ze bestaat voor een markering zonder vormklasse: iemand die de klasse
         * met de hand weghaalde, of een pagina van voor een vorm die intussen
         * niet meer bestaat.
         */
        if (isset($vormen[0])) {
            $uit[] = '.mymmo-mark{--mk-mark-vorm:url("' . esc_url($vormen[0]['standaard']) . '")}';
        }

        /*
         * Per vorm de MIDDELSTE lengte als standaard. Het keuzescript zet er per
         * woord een betere overheen, maar zonder JavaScript blijft deze staan --
         * en dan is de middelste de kleinste misser, in beide richtingen.
         */
        foreach ($vormen as $vorm) {
            $uit[] = '.mymmo-mark--' . $vorm['slug']
                . '{--mk-mark-vorm:url("' . esc_url($vorm['standaard']) . '")}';
        }

        foreach (self::kleuren() as $kleur) {
            $uit[] = '.mymmo-mark--kleur-' . $kleur['slug']
                . '{--mk-mark-kleur:var(--wp--preset--color--' . $kleur['slug'] . ')}';
        }

        /*
         * Lettertype en dikte wijzen naar de PRESETS van het thema. De plugin
         * kent dus geen enkele lettertypenaam -- voegt iemand er een toe in
         * theme.json, dan staat die de volgende paginalading in de kiezer.
         *
         * TWEE KLASSEN in de selector, geen een. WordPress drukt de stijlen van
         * een blokthema INLINE in de <head> af, dus ná onze stylesheet -- en bij
         * gelijk gewicht wint dan het thema. `.wp-block-heading { font-family }`
         * is (0,1,0) en zou het dus winnen van `.mymmo-mark--font-x`. Met
         * `.mymmo-mark.mymmo-mark--font-x` (0,2,0) winnen wij, en kan iemand die
         * het écht anders wil nog steeds winnen zonder `!important`.
         */
        foreach (self::lettertypes() as $font) {
            $uit[] = '.mymmo-mark.mymmo-mark--font-' . $font['slug']
                . '{font-family:var(--wp--preset--font-family--' . $font['slug'] . ')}';
        }

        foreach (self::gewichten() as $gewicht) {
            $uit[] = '.mymmo-mark.mymmo-mark--gewicht-' . $gewicht['waarde']
                . '{font-weight:' . $gewicht['waarde'] . '}';
        }

        return implode("\n", $uit);
    }

    /**
     * De vormen, gegroepeerd, met per variant haar breedte/hoogte-verhouding.
     *
     * De verhouding komt uit de `viewBox` van het bestand zelf -- niet uit de
     * bestandsnaam en niet uit een lijst hier. Zo kan een tekening nooit een
     * andere lengte blijken te hebben dan waarvoor ze wordt ingezet.
     *
     * @return array<int,array{slug:string,label:string,standaard:string,varianten:array<int,array{url:string,ratio:float}>}>
     */
    private static function vormen(): array {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $groepen = [];

        foreach (glob(MYMMO_CARDS_DIR . self::MAP . self::PATROON . '*.svg') ?: [] as $pad) {
            $naam = substr(basename($pad, '.svg'), strlen(self::PATROON));

            // `markering-stift-2` is variant 2 van de groep `stift`;
            // `markering-cirkel` is een groep van één.
            if (preg_match('/^(.+)-\d+$/', $naam, $m)) {
                $naam = $m[1];
            }

            $slug = sanitize_title($naam);
            if ($slug === '') {
                continue;
            }

            $ratio = self::verhouding($pad);
            if ($ratio === null) {
                // Zonder leesbare viewBox weten we niet voor welke woordlengte
                // deze tekening bedoeld is. Overslaan is beter dan ze op goed
                // geluk inzetten: dan staat er stil een uitgerekte streep.
                continue;
            }

            $groepen[$slug][] = [
                'url'   => MYMMO_CARDS_URL . self::MAP . basename($pad),
                'ratio' => $ratio,
            ];
        }

        $uit = [];
        foreach ($groepen as $slug => $varianten) {
            // Op VERHOUDING sorteren, niet op het cijfer in de naam: het
            // keuzescript zoekt op verhouding, en een tegenstrijdige volgorde
            // zou betekenen dat de lijst iets anders zegt dan de bestanden.
            usort($varianten, static function (array $a, array $b): int {
                return $a['ratio'] <=> $b['ratio'];
            });

            $uit[$slug] = [
                'slug'      => $slug,
                'label'     => self::LABELS[$slug] ?? self::leesbaar($slug),
                'standaard' => $varianten[(int) floor((count($varianten) - 1) / 2)]['url'],
                'varianten' => array_values($varianten),
            ];
        }

        // De bekende vormen in de volgorde van LABELS, de rest erachter op naam.
        $gesorteerd = [];
        foreach (array_keys(self::LABELS) as $slug) {
            if (isset($uit[$slug])) {
                $gesorteerd[] = $uit[$slug];
                unset($uit[$slug]);
            }
        }
        ksort($uit);
        foreach ($uit as $vorm) {
            $gesorteerd[] = $vorm;
        }

        $cache = $gesorteerd;
        return $cache;
    }

    /**
     * De breedte/hoogte-verhouding uit de `viewBox` van een SVG.
     *
     * Enkel de kop van het bestand wordt gelezen: de `viewBox` staat op het
     * `<svg>`-element en de rest is het pad -- dat kan kilobytes groot zijn.
     */
    private static function verhouding(string $pad): ?float {
        $fh = @fopen($pad, 'rb');
        if ($fh === false) {
            return null;
        }

        $kop = (string) fread($fh, 512);
        fclose($fh);

        if (!preg_match('/viewBox\s*=\s*"([^"]+)"/', $kop, $m)) {
            return null;
        }

        $delen = preg_split('/[\s,]+/', trim($m[1])) ?: [];
        if (count($delen) !== 4) {
            return null;
        }

        $breedte = (float) $delen[2];
        $hoogte  = (float) $delen[3];

        if ($breedte <= 0 || $hoogte <= 0) {
            return null;
        }

        return round($breedte / $hoogte, 4);
    }

    /** `dubbele-streep` wordt `Dubbele streep`. */
    private static function leesbaar(string $slug): string {
        return ucfirst(str_replace('-', ' ', $slug));
    }

    /**
     * De lettertypes van het THEMA.
     *
     * Zelfde bron en zelfde afweging als het kleurenpalet: `theme.json` beslist,
     * de plugin kent geen enkele lettertypenaam. De standaardlijst van WordPress
     * blijft eruit -- dat zijn systeemstacks die niet bij de huisstijl horen.
     *
     * @return array<int,array{slug:string,name:string}>
     */
    private static function lettertypes(): array {
        if (!function_exists('wp_get_global_settings')) {
            return [];
        }

        $families = wp_get_global_settings(['typography', 'fontFamilies']);
        $rijen = [];

        foreach (['theme', 'custom'] as $laag) {
            if (!empty($families[$laag]) && is_array($families[$laag])) {
                $rijen = array_merge($rijen, $families[$laag]);
            }
        }

        $uit = [];
        $gezien = [];
        foreach ($rijen as $rij) {
            $slug = isset($rij['slug']) ? sanitize_title((string) $rij['slug']) : '';
            if ($slug === '' || isset($gezien[$slug])) {
                continue;
            }
            $gezien[$slug] = true;

            $uit[] = [
                'slug' => $slug,
                'name' => (string) ($rij['name'] ?? $slug),
            ];
        }

        return $uit;
    }

    /**
     * @return array<int,array{waarde:int,label:string}>
     */
    private static function gewichten(): array {
        $uit = [];
        foreach (self::GEWICHTEN as $waarde => $label) {
            $uit[] = ['waarde' => (int) $waarde, 'label' => $label];
        }
        return $uit;
    }

    /**
     * Het kleurenpalet van het THEMA.
     *
     * `wp_get_global_settings()` geeft de drie lagen terug (thema, standaard,
     * eigen). De standaardkleuren van WordPress laten we weg: dat zijn er
     * tientallen en ze horen niet bij de huisstijl. Staat er geen themapalet,
     * dan blijft de lijst leeg en toont de kiezer dat ook -- geen verzonnen
     * kleuren.
     *
     * @return array<int,array{slug:string,name:string,color:string}>
     */
    private static function kleuren(): array {
        if (!function_exists('wp_get_global_settings')) {
            return [];
        }

        $palet = wp_get_global_settings(['color', 'palette']);
        $rijen = [];

        foreach (['theme', 'custom'] as $laag) {
            if (!empty($palet[$laag]) && is_array($palet[$laag])) {
                $rijen = array_merge($rijen, $palet[$laag]);
            }
        }

        $uit = [];
        foreach ($rijen as $rij) {
            $slug = isset($rij['slug']) ? sanitize_title((string) $rij['slug']) : '';
            if ($slug === '') {
                continue;
            }

            $uit[] = [
                'slug'  => $slug,
                'name'  => (string) ($rij['name'] ?? $slug),
                'color' => (string) ($rij['color'] ?? ''),
            ];
        }

        return $uit;
    }
}
