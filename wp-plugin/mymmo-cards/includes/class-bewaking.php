<?php
/**
 * DE BEWAKING VAN DE HUISSTIJL IN GUTENBERG -- voor iedereen, op elke site.
 *
 * De controle op de CODE (`wp-plugin/huisstijl/controleer.mjs`) houdt een
 * component binnen de lijnen. Maar het meeste werk op een site gebeurt niet in
 * code: het gebeurt in de editor, met een kleurkiezer, een lettergrootte, een
 * stuk "Extra CSS". Daar sloop de huisstijl tot nu toe weg -- het palet van de
 * sites bevat al een tiental kleuren die er met de hand bij gezet zijn
 * (`custom-…`). Deze klasse zet daar vijf grenzen:
 *
 *   1. DE EDITOR BIEDT ALLEEN HET THEMA AAN. Geen eigen kleur, verloop of
 *      lettergrootte, geen regelhoogte, letterafstand of dikte, geen eigen
 *      rand of afronding, geen eigen opvullingsmaat -- alleen de presets van
 *      het thema. De standaardkleuren en -schaduwen van WordPress zelf vallen
 *      weg: die horen niet bij het merk. (`wp_theme_json_data_theme`)
 *   2. GEEN NIEUWE LETTERTYPES. De Font Library staat uit, en het installeren
 *      van een lettertype via de REST-API wordt geweigerd.
 *   3. GEEN EXTRA CSS. Niemand krijgt nog `edit_css`. Wat er al in "Extra CSS"
 *      staat, blijft gewoon werken -- het is alleen niet meer bij te werken.
 *   4. DE STIJLEN VAN HET THEMA LIGGEN VAST. Bewaren in Uiterlijk → Editor →
 *      Stijlen (palet, lettertypes, globale kleuren) wordt geweigerd. Lezen
 *      blijft gewoon werken; dat moet, anders laadt de site-editor niet.
 *   5. OPSLAAN WORDT GEWEIGERD zodra een pagina, patroon of sjabloon er een
 *      eigen kleur, lettertype, afronding, schaduw of `<style>` BIJ krijgt --
 *      met de reden erbij in de melding van de editor. Alleen wat erbij komt
 *      telt: wat er al stond, mag blijven staan, anders kon niemand een oude
 *      pagina nog bewaren.
 *
 * En de standaardpatronen van WordPress (van wordpress.org) staan uit: die
 * brengen hun eigen kleuren en maten mee, en dan wordt opslaan geweigerd voor
 * iets dat er net zelf ingezet is.
 *
 * GEEN STILLE GRENS: elke weigering zegt wat er tegengehouden wordt en wat je
 * in de plaats doet. Een knop die niets doet, of een kleurkiezer die zonder
 * uitleg verdwijnt, leest als een storing.
 *
 * NOODREM, alleen via wp-config.php -- bewust niet via een instelling in
 * wp-admin, want dan zet wie de grens wil omzeilen ze gewoon uit:
 *
 *   define('MYMMO_HUISSTIJL_OPEN', true);
 *       zet de hele bewaking uit, voor iedereen.
 *   define('MYMMO_HUISSTIJL_BEHEERDERS', 'nico@mymmo.com');
 *       komma-gescheiden e-mailadressen die er niet onder vallen. Dat geldt
 *       voor 2 tot en met 5; de vergrendelde editor (1) geldt ook voor hen,
 *       want WordPress rekent de instellingen van het thema één keer uit voor
 *       de hele site. Een eigen kleur nodig? Dan de noodrem hierboven.
 *
 * Bestand onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Bewaking {

    /** Hoeveel overtredingen er hoogstens in één melding staan. */
    private const MAX_IN_MELDING = 6;

    /** Typografische eigenschappen die een eigen waarde zouden krijgen. */
    private const TYPOGRAFIE = [
        'font', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'letter-spacing', 'text-transform', 'text-decoration',
    ];

    /** Eigenschappen waarin een letterlijke kleur een eigen kleur is. */
    private const KLEUR_EIGENSCHAPPEN = [
        'color', 'background', 'background-color', 'border', 'border-color',
        'border-top', 'border-right', 'border-bottom', 'border-left',
        'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
        'outline', 'outline-color', 'fill', 'stroke', 'box-shadow', 'text-shadow',
        'text-decoration-color', 'caret-color', 'accent-color',
    ];

    public static function init(): void {
        if (self::uitgeschakeld()) {
            return;
        }

        add_filter('wp_theme_json_data_theme', [self::class, 'thema_instellingen']);
        add_filter('block_editor_settings_all', [self::class, 'editor_instellingen'], 20);
        add_filter('map_meta_cap', [self::class, 'rechten'], 10, 2);
        add_filter('rest_pre_dispatch', [self::class, 'rest_poort'], 10, 3);
        add_action('rest_api_init', [self::class, 'haak_opslaan']);
        add_filter('should_load_remote_block_patterns', '__return_false');
        add_action('after_setup_theme', [self::class, 'zonder_kernpatronen'], 20);
    }

    /** De noodrem uit wp-config.php, voor iedereen of voor een paar adressen. */
    public static function uitgeschakeld(): bool {
        if (defined('MYMMO_HUISSTIJL_OPEN') && MYMMO_HUISSTIJL_OPEN) {
            return true;
        }

        return false;
    }

    /**
     * Valt de huidige gebruiker buiten de bewaking? Pas te weten NA het
     * aanmelden, dus dit wordt per aanroep gevraagd en niet in init().
     */
    private static function vrijgesteld(): bool {
        if (!defined('MYMMO_HUISSTIJL_BEHEERDERS') || !function_exists('wp_get_current_user')) {
            return false;
        }

        $gebruiker = wp_get_current_user();
        if (!$gebruiker || !$gebruiker->exists()) {
            return false;
        }

        $adressen = array_map('trim', explode(',', strtolower((string) MYMMO_HUISSTIJL_BEHEERDERS)));

        return in_array(strtolower((string) $gebruiker->user_email), $adressen, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. De editor biedt alleen het thema aan
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De grenzen, in de vorm van theme.json.
     *
     * @return array<string, array<string, bool>>
     */
    public static function vergrendeling(): array {
        return [
            'color' => [
                'custom'           => false,
                'customGradient'   => false,
                'customDuotone'    => false,
                'defaultPalette'   => false,
                'defaultGradients' => false,
                'defaultDuotone'   => false,
            ],
            'typography' => [
                'customFontSize'   => false,
                'defaultFontSizes' => false,
                'lineHeight'       => false,
                'letterSpacing'    => false,
                'fontWeight'       => false,
                'fontStyle'        => false,
                'textTransform'    => false,
                'textDecoration'   => false,
            ],
            'border' => [
                'color'  => false,
                'radius' => false,
                'style'  => false,
                'width'  => false,
            ],
            'shadow' => [
                'defaultPresets' => false,
            ],
            'spacing' => [
                'customSpacingSize' => false,
            ],
        ];
    }

    /**
     * Op het hoogste niveau EN per blok dat het thema zelf instelt: een
     * blokinstelling in theme.json wint van het hoogste niveau, dus zet het
     * thema `blocks.core/button.border.radius` aan, dan moet het daar ook uit.
     *
     * `appearanceTools` in het thema zet deze dingen alleen aan als ze nog niet
     * expliciet gezet zijn -- een expliciete `false` blijft dus staan.
     *
     * @param mixed $data WP_Theme_JSON_Data
     * @return mixed
     */
    public static function thema_instellingen($data) {
        if (!is_object($data) || !method_exists($data, 'update_with') || !method_exists($data, 'get_data')) {
            return $data;
        }

        $slot = self::vergrendeling();
        $settings = $slot;

        $huidig = $data->get_data();
        $blokken = $huidig['settings']['blocks'] ?? [];
        if (is_array($blokken) && $blokken !== []) {
            $settings['blocks'] = [];
            foreach (array_keys($blokken) as $blok) {
                $settings['blocks'][$blok] = $slot;
            }
        }

        return $data->update_with([
            'version'  => 2,
            'settings' => $settings,
        ]);
    }

    /**
     * De Font Library uit (WordPress 6.5+; daarvoor bestaat ze niet en doet
     * deze sleutel niets).
     *
     * @param array<string, mixed> $instellingen
     * @return array<string, mixed>
     */
    public static function editor_instellingen(array $instellingen): array {
        if (self::vrijgesteld()) {
            return $instellingen;
        }

        $instellingen['fontLibraryEnabled'] = false;

        return $instellingen;
    }

    /** De patronen van WordPress zelf; die van het thema blijven. */
    public static function zonder_kernpatronen(): void {
        remove_theme_support('core-block-patterns');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Geen Extra CSS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<int, string> $caps
     * @return array<int, string>
     */
    public static function rechten(array $caps, string $cap): array {
        if ($cap === 'edit_css' && !self::vrijgesteld()) {
            return ['do_not_allow'];
        }

        return $caps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2 + 4. Geen lettertypes installeren, de stijlen van het thema vast
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Alleen SCHRIJVEN wordt geweigerd. Lezen moet blijven werken: de editor
     * vraagt de globale stijlen op om de pagina te tekenen, en een weigering
     * daar breekt de site-editor in plaats van hem te begrenzen.
     *
     * @param mixed $resultaat
     * @param mixed $server
     * @param mixed $verzoek WP_REST_Request
     * @return mixed
     */
    public static function rest_poort($resultaat, $server, $verzoek) {
        if ($resultaat !== null || !is_object($verzoek) || !method_exists($verzoek, 'get_route')) {
            return $resultaat;
        }

        $methode = strtoupper((string) $verzoek->get_method());
        if (in_array($methode, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $resultaat;
        }

        if (self::vrijgesteld()) {
            return $resultaat;
        }

        $route = (string) $verzoek->get_route();

        if (preg_match('#^/wp/v2/global-styles(/|$)#', $route)) {
            return new WP_Error(
                'mymmo_huisstijl_thema',
                'Niet bewaard: de stijlen van het thema (palet, lettertypes, globale kleuren en maten) liggen vast. '
                . 'Een wijziging aan de huisstijl vraag je aan bij Nico.',
                ['status' => 403]
            );
        }

        if (preg_match('#^/wp/v2/font-(families|collections)(/|$)#', $route)) {
            return new WP_Error(
                'mymmo_huisstijl_lettertype',
                'Geen nieuwe lettertypes: de sites gebruiken enkel de lettertypes van het thema.',
                ['status' => 403]
            );
        }

        return $resultaat;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Opslaan weigeren bij een NIEUWE overtreding
    // ─────────────────────────────────────────────────────────────────────────

    /** Elk inhoudstype dat blokken bewaart. */
    public static function haak_opslaan(): void {
        $overslaan = ['attachment', 'wp_global_styles', 'wp_font_family', 'wp_font_face'];

        foreach (get_post_types(['show_in_rest' => true], 'names') as $type) {
            if (in_array($type, $overslaan, true)) {
                continue;
            }
            add_filter('rest_pre_insert_' . $type, [self::class, 'controleer_opslaan'], 10, 2);
        }
    }

    /**
     * @param mixed $bericht  het voorbereide bericht (stdClass)
     * @param mixed $verzoek  WP_REST_Request
     * @return mixed het bericht, of een WP_Error
     */
    public static function controleer_opslaan($bericht, $verzoek) {
        if (!is_object($bericht) || !isset($bericht->post_content) || !is_string($bericht->post_content)) {
            return $bericht;
        }

        // Een autosave tegenhouden helpt niemand: die vertelt het niet aan de
        // gebruiker, en het echte opslaan wordt toch nog gecontroleerd.
        if (is_object($verzoek) && method_exists($verzoek, 'get_route')
            && strpos((string) $verzoek->get_route(), '/autosaves') !== false) {
            return $bericht;
        }

        if (self::vrijgesteld()) {
            return $bericht;
        }

        $nieuw = self::overtredingen($bericht->post_content);
        if ($nieuw === []) {
            return $bericht;
        }

        $oud = self::overtredingen(self::vorige_inhoud($bericht, $verzoek));

        // Alleen wat ERBIJ komt: telt een handtekening meer keren dan ervoor,
        // dan is er een bijgekomen.
        $erbij = [];
        foreach ($nieuw as $sleutel => $rij) {
            if ($rij['aantal'] > ($oud[$sleutel]['aantal'] ?? 0)) {
                $erbij[] = $rij['tekst'];
            }
        }

        if ($erbij === []) {
            return $bericht;
        }

        return new WP_Error('mymmo_huisstijl', self::melding($erbij), ['status' => 422]);
    }

    /**
     * Wat er stond voor deze bewaaractie.
     *
     * Een sjabloon dat nog nooit in de editor bewaard werd, bestaat nog niet
     * als bericht: het staat als bestand in het thema. Zonder dat bestand als
     * vergelijkingspunt telt alles wat het thema zelf meebrengt als "nieuw", en
     * kan niemand een sjabloon nog voor het eerst bewaren.
     *
     * @param mixed $bericht
     * @param mixed $verzoek
     */
    private static function vorige_inhoud($bericht, $verzoek): string {
        if (!empty($bericht->ID)) {
            $bestaand = get_post((int) $bericht->ID);
            if ($bestaand instanceof WP_Post) {
                return (string) $bestaand->post_content;
            }
        }

        $type = substr((string) current_filter(), strlen('rest_pre_insert_'));
        if (in_array($type, ['wp_template', 'wp_template_part'], true)
            && function_exists('get_block_template')
            && is_object($verzoek) && method_exists($verzoek, 'get_param')) {
            $id = (string) $verzoek->get_param('id');
            if (strpos($id, '//') !== false) {
                $sjabloon = get_block_template($id, $type);
                if ($sjabloon && isset($sjabloon->content)) {
                    return (string) $sjabloon->content;
                }
            }
        }

        return '';
    }

    /** @param array<int, string> $erbij */
    private static function melding(array $erbij): string {
        $meer = count($erbij) - self::MAX_IN_MELDING;
        $lijst = array_slice($erbij, 0, self::MAX_IN_MELDING);

        return 'Niet opgeslagen -- dit past niet in de huisstijl: '
            . implode('; ', $lijst)
            . ($meer > 0 ? '; en nog ' . $meer . ' andere' : '')
            . '. Kies een kleur uit het palet en een maat uit de lijst, of laat het thema het bepalen. '
            . 'Wat al op deze pagina stond, mag blijven staan; alleen wat erbij komt, wordt tegengehouden.';
    }

    /**
     * Alle overtredingen in een stuk inhoud, als handtekening => [aantal, tekst].
     *
     * De handtekening bevat het blok en de waarde, zodat "dezelfde kleur op een
     * tweede blok" als een nieuwe telt.
     *
     * @return array<string, array{aantal: int, tekst: string}>
     */
    public static function overtredingen(string $inhoud): array {
        $gevonden = [];

        $voeg = static function (string $sleutel, string $tekst) use (&$gevonden): void {
            if (!isset($gevonden[$sleutel])) {
                $gevonden[$sleutel] = ['aantal' => 0, 'tekst' => $tekst];
            }
            $gevonden[$sleutel]['aantal']++;
        };

        if ($inhoud === '') {
            return $gevonden;
        }

        // Losse stijlregels en lettertypes van buiten.
        if (preg_match_all('#<style\b#i', $inhoud, $m)) {
            foreach ($m[0] as $_) {
                $voeg('style-tag', 'een eigen <style>-blok');
            }
        }
        if (preg_match_all('#@import|@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com#i', $inhoud, $m)) {
            foreach ($m[0] as $treffer) {
                $voeg('font|' . strtolower($treffer), 'een lettertype van buiten het thema');
            }
        }

        // Inline stijlen in de HTML: de vorm waarin een statisch blok een eigen
        // waarde bewaart, en wat iemand zelf in de code-editor typt.
        if (preg_match_all('#\sstyle\s*=\s*("([^"]*)"|\'([^\']*)\')#i', $inhoud, $m)) {
            foreach ($m[0] as $i => $_) {
                $stijl = html_entity_decode($m[2][$i] !== '' ? $m[2][$i] : $m[3][$i], ENT_QUOTES);
                foreach (self::stijl_overtredingen($stijl) as $sleutel => $tekst) {
                    $voeg('inline|' . $sleutel, $tekst);
                }
            }
        }

        // De attributen van de blokken: de vorm waarin een dynamisch blok (en
        // elk blok, in zijn commentaar) een eigen waarde bewaart.
        if (function_exists('parse_blocks') && strpos($inhoud, '<!-- wp:') !== false) {
            self::loop_blokken(parse_blocks($inhoud), $voeg);
        }

        return $gevonden;
    }

    /**
     * @param array<int, array<string, mixed>> $blokken
     */
    private static function loop_blokken(array $blokken, callable $voeg): void {
        foreach ($blokken as $blok) {
            $naam = (string) ($blok['blockName'] ?? '');
            $attrs = is_array($blok['attrs'] ?? null) ? $blok['attrs'] : [];
            $label = $naam !== '' ? self::bloknaam($naam) : 'een blok';

            foreach (['customTextColor', 'customBackgroundColor', 'customOverlayColor', 'customGradient'] as $sleutel) {
                if (!empty($attrs[$sleutel]) && is_string($attrs[$sleutel])) {
                    $voeg('attr|' . $naam . '|' . $sleutel . '|' . strtolower($attrs[$sleutel]),
                        'eigen kleur ' . $attrs[$sleutel] . ' in ' . $label);
                }
            }

            if (isset($attrs['style']) && is_array($attrs['style'])) {
                self::loop_stijl($attrs['style'], '', $naam, $label, $voeg);
            }

            // De blokken van deze plugin bewaren een kleur als slug; een hex
            // erin is een kleur van buiten het palet.
            if (strpos($naam, 'mymmo/') === 0) {
                foreach ($attrs as $sleutel => $waarde) {
                    if (is_string($waarde) && self::is_letterlijke_kleur($waarde)) {
                        $voeg('mymmo|' . $naam . '|' . $sleutel . '|' . strtolower($waarde),
                            'eigen kleur ' . $waarde . ' in ' . $label);
                    }
                }
            }

            if (!empty($blok['innerBlocks']) && is_array($blok['innerBlocks'])) {
                self::loop_blokken($blok['innerBlocks'], $voeg);
            }
        }
    }

    /**
     * Het `style`-attribuut van een blok, recursief. Een preset staat erin als
     * `var:preset|color|slug`; alles wat geen preset is, is een eigen waarde.
     *
     * @param array<string, mixed> $stijl
     */
    private static function loop_stijl(array $stijl, string $pad, string $naam, string $label, callable $voeg): void {
        foreach ($stijl as $sleutel => $waarde) {
            $hier = $pad === '' ? (string) $sleutel : $pad . '.' . $sleutel;

            if (is_array($waarde)) {
                self::loop_stijl($waarde, $hier, $naam, $label, $voeg);
                continue;
            }
            if (!is_string($waarde) && !is_numeric($waarde)) {
                continue;
            }

            $waarde = trim((string) $waarde);
            if ($waarde === '' || strpos($waarde, 'var:preset|') === 0 || strpos($waarde, 'var(--wp--preset--') === 0) {
                continue;
            }

            $soort = self::soort_van_pad($hier, $waarde);
            if ($soort === null) {
                continue;
            }

            $voeg('style|' . $naam . '|' . $hier . '|' . strtolower($waarde), $soort . ' ' . $waarde . ' in ' . $label);
        }
    }

    /** Wat een eigen waarde op dit pad van het style-attribuut betekent, of null. */
    private static function soort_van_pad(string $pad, string $waarde): ?string {
        $pad = strtolower($pad);

        if (strpos($pad, 'typography.') === 0) {
            return 'eigen typografie';
        }
        if (strpos($pad, 'border.') === 0 || strpos($pad, 'border') === 0) {
            if (strpos($pad, 'radius') !== false) {
                return $waarde === '0' || $waarde === '0px' ? null : 'eigen afronding';
            }
            if (strpos($pad, 'color') !== false) {
                return 'eigen randkleur';
            }
            if (strpos($pad, 'width') !== false) {
                return $waarde === '0' || $waarde === '0px' ? null : 'eigen randdikte';
            }
            if (strpos($pad, 'style') !== false) {
                return null;
            }
        }
        if ($pad === 'shadow') {
            return 'eigen schaduw';
        }
        if (self::is_letterlijke_kleur($waarde) || strpos($pad, 'color.') === 0 || strpos($pad, '.color.') !== false) {
            return 'eigen kleur';
        }

        return null;
    }

    /**
     * De overtredingen in één style-attribuut, als handtekening => tekst.
     *
     * @return array<string, string>
     */
    private static function stijl_overtredingen(string $stijl): array {
        $uit = [];

        foreach (explode(';', $stijl) as $verklaring) {
            $delen = explode(':', $verklaring, 2);
            if (count($delen) !== 2) {
                continue;
            }

            $eigenschap = strtolower(trim($delen[0]));
            $waarde = trim($delen[1]);
            if ($eigenschap === '' || $waarde === '' || strpos($eigenschap, '--') === 0) {
                continue;
            }

            $zonder_presets = preg_replace('#var\(--wp--preset--[a-z0-9-]+(--[a-z0-9-]+)*\)#i', '', $waarde) ?? $waarde;

            if (in_array($eigenschap, self::TYPOGRAFIE, true)) {
                if (!preg_match('#^(inherit|initial|unset|var\(--wp--preset--)#i', $waarde)) {
                    $uit[$eigenschap . '|' . strtolower($waarde)] = 'eigen ' . self::leesbaar($eigenschap) . ' ' . $waarde;
                }
                continue;
            }

            if (in_array($eigenschap, self::KLEUR_EIGENSCHAPPEN, true) && self::bevat_letterlijke_kleur($zonder_presets)) {
                $uit[$eigenschap . '|' . strtolower($waarde)] = 'eigen kleur ' . $waarde;
                continue;
            }

            if (preg_match('#^border(-[a-z]+)*-radius$#', $eigenschap)
                && preg_match('#[1-9][0-9.]*(px|rem|em|%)#', $zonder_presets)) {
                $uit[$eigenschap . '|' . strtolower($waarde)] = 'eigen afronding ' . $waarde;
                continue;
            }

            if (in_array($eigenschap, ['box-shadow', 'text-shadow'], true)
                && !preg_match('#^(none|inherit|initial|unset)$#i', trim($zonder_presets))
                && trim($zonder_presets) !== '') {
                $uit[$eigenschap . '|' . strtolower($waarde)] = 'eigen schaduw ' . $waarde;
            }
        }

        return $uit;
    }

    private static function is_letterlijke_kleur(string $waarde): bool {
        return (bool) preg_match('#^\s*(\#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\s*\()#i', $waarde);
    }

    private static function bevat_letterlijke_kleur(string $waarde): bool {
        return (bool) preg_match('#\#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix)\s*\(#i', $waarde);
    }

    private static function leesbaar(string $eigenschap): string {
        $namen = [
            'font'            => 'letterinstelling',
            'font-family'     => 'lettertype',
            'font-size'       => 'lettergrootte',
            'font-weight'     => 'letterdikte',
            'font-style'      => 'letterstijl',
            'line-height'     => 'regelhoogte',
            'letter-spacing'  => 'letterafstand',
            'text-transform'  => 'hoofdletterinstelling',
            'text-decoration' => 'onderlijning',
        ];

        return $namen[$eigenschap] ?? $eigenschap;
    }

    /** "core/paragraph" → "het blok Paragraaf", zoals de editor het noemt. */
    private static function bloknaam(string $naam): string {
        if (class_exists('WP_Block_Type_Registry')) {
            $type = WP_Block_Type_Registry::get_instance()->get_registered($naam);
            if ($type && !empty($type->title)) {
                return 'het blok "' . $type->title . '"';
            }
        }

        return 'het blok ' . $naam;
    }
}
