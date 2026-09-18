<?php
/**
 * INGANGEN: de manieren waarop een venster opengaat.
 *
 * Een OPSTELLING is het venster -- welk formulier, welke tabbladen, welke
 * agenda, welke dankjewelschermen. Die maak je één keer.
 *
 * Een INGANG is een manier om dat venster te openen. Er zijn er zoveel als je
 * wil, van drie soorten:
 *
 *   knop     een knop met eigen opschrift en kleur. Twee knoppen met andere
 *            copy die hetzelfde venster openen is doodgewoon.
 *   klasse   een CSS-klasse die je op iets zet dat er al staat: een knop van je
 *            thema, een afbeelding, een icoon. Klikken opent het venster.
 *   callout  een blok in de pagina dat een STAP, het FORMULIER of de AGENDA uit
 *            het venster al toont. De bezoeker begint daar; klikken opent het
 *            venster op precies dat onderdeel.
 *
 * WAAROM DIT APART STAAT VAN DE OPSTELLINGEN
 * ------------------------------------------
 * Omdat het zich anders vermenigvuldigt. Zolang "hoe toon je het" een keuze IN
 * de opstelling is, heb je per manier een kopie van het hele venster nodig -- en
 * dan moet je bij elke wijziging raden welke kopie waar staat. Nu is er één
 * venster en een lijst ingangen ernaast; een nieuwe callout voor een nieuwe stap
 * is één rij erbij, niet een tweede venster.
 *
 * De opslag is EEN option, net als bij de opstellingen en de stappen. Geen
 * custom post type: het zijn er een handvol, ze hebben geen permalink, geen
 * auteur en geen zoekindex nodig.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Entrypoints {

    private const OPTION = 'mymmo_forms_entrypoints';

    /** Meer dan dit is geen lijst meer maar een archief. */
    private const MAX = 100;

    /** De drie soorten ingang. Wat hier niet in staat, wordt een knop. */
    public const SOORTEN = ['knop', 'klasse', 'callout'];

    /**
     * De instellingen die een ingang mag bevatten.
     *
     * DE ENIGE lijst: het beheerscherm gebruikt hem om te tonen en te schonen,
     * en de renderer leest wat eruit komt. Een tweede kopie zou betekenen dat
     * een instelling wél bewaard wordt en niet gerenderd, of omgekeerd -- en dat
     * merk je pas op een pagina.
     *
     * Ze zijn NIET per soort gescheiden: een ingang heeft er hoogstens een
     * handvol, en een gedeelde lijst met een `soort` ernaast is makkelijker
     * juist te houden dan drie lijsten die uit elkaar kunnen lopen. Wat niet bij
     * een soort hoort, wordt bij het renderen gewoon niet gelezen.
     */
    public const ATTS = [
        // knop
        'label', 'variant', 'accent', 'accent_text', 'class',
        // klasse
        'trigger',
        // callout
        'highlight', 'layout', 'title', 'title_mobile', 'text', 'cta',
        'image', 'image_alt', 'image_scale', 'bg',
        'max_width', 'ratio', 'space', 'radius',
        // Opvulling en kopruimte. Een callout die tussen andere kaarten staat,
        // hoort dezelfde maten te kunnen krijgen als die kaarten; zonder deze
        // drie los je dat op met CSS op de pagina, en die breekt zodra de
        // plugin haar eigen waarden bijstelt.
        'pad', 'pad_mobile', 'title_gap',
        // De inspringing van de TEKSTKOLOM, los van de opvulling van het blok:
        // de titel mee laten lopen met de kaarten ernaast mag het witte vlak
        // met het formulier niet smaller maken.
        'text_pad', 'text_pad_mobile',
        // Welk tabblad opengaat. Bij een KNOP of een KLASSE is dat een keuze:
        // "Plan een gesprek" hoort de agenda te openen, niet het formulier. Bij
        // een callout volgt het al uit wat ze uitlicht.
        'tab',
    ];

    /**
     * Wat je per PLAATSING op de shortcode mag overschrijven.
     *
     * Dezelfde ingang op twee pagina's, maar op de ene zonder tint en met
     * rechte hoeken. Bewust een KORTE lijst: alles instelbaar maken op de
     * shortcode haalt de reden weg waarom ingangen bestaan -- één plek waar het
     * staat. Dit zijn de drie die echt per plaatsing verschillen.
     */
    public const SHORTCODE_ATTS = ['bg', 'radius', 'tab'];

    /**
     * De kolomverhoudingen van een callout, als GESLOTEN lijst.
     *
     * De waarde belandt in een style-attribuut op de pagina van een bezoeker;
     * daar hoort geen vrije tekst in. De `minmax(0, ...)` staat er al bij: zonder
     * die 0 als ondergrens weigert een grid-kolom smaller te worden dan haar
     * inhoud, en dan steekt een lange regel het blok uit.
     *
     * Sleutel => [wat je in het scherm leest, wat de CSS krijgt]
     */
    public const VERDELINGEN = [
        '1:1' => ['Gelijk (1 : 1)',          'minmax(0, 1fr) minmax(0, 1fr)'],
        '2:3' => ['Iets ruimer (2 : 3)',     'minmax(0, 2fr) minmax(0, 3fr)'],
        '1:2' => ['Uitgelicht dubbel (1 : 2)', 'minmax(0, 1fr) minmax(0, 2fr)'],
    ];

    /** Wat een callout kan uitlichten, naast een stap-id. */
    public const HIGHLIGHT_FORM     = 'form';
    public const HIGHLIGHT_CALENDLY = 'calendly';

    /** De twee indelingen van een callout. Er is geen derde. */
    public const LAYOUT_KOLOMMEN = 'kolommen';
    public const LAYOUT_BREED    = 'breed';

    public static function init(): void {
        add_action('init', [self::class, 'register_shortcode']);
        add_action('admin_post_mymmo_forms_entry_save', [self::class, 'handle_save']);
        add_action('admin_post_mymmo_forms_entry_delete', [self::class, 'handle_delete']);
    }

    public static function register_shortcode(): void {
        add_shortcode('mymmo_form_entry', [self::class, 'shortcode']);
    }

    /**
     * [mymmo_form_entry id="hero-knop"]
     *
     * EEN shortcode voor alle drie de soorten. Welke het is, staat bij de ingang
     * zelf -- niet in de pagina. Zo kan je een knop later een callout maken
     * zonder elke pagina langs te gaan waar hij staat.
     *
     * @param array<string,string>|string $atts
     */
    public static function shortcode($atts = []): string {
        $standaard = ['id' => ''];
        foreach (self::SHORTCODE_ATTS as $naam) {
            $standaard[$naam] = '';
        }

        $atts = shortcode_atts($standaard, is_array($atts) ? $atts : [], 'mymmo_form_entry');
        $id   = sanitize_title((string) $atts['id']);

        $ingang = self::get($id);

        if ($ingang === null) {
            // Voor een beheerder de reden, voor een bezoeker niets: die kan er
            // toch niets mee, en een technische melding toont hoe de site in
            // elkaar zit.
            return current_user_can('manage_options')
                ? '<div class="mymmo-form-notice mymmo-form-notice--admin">De ingang "'
                  . esc_html($id) . '" bestaat niet (meer). Kijk na bij Instellingen &rarr; Mymmo Forms &rarr; Ingangen.</div>'
                : '';
        }

        // Wat er op DEZE plaatsing staat, wint van wat er bij de ingang staat.
        // Dat is de bedoeling: de ingang is de basis, de shortcode de uitzondering.
        foreach (self::SHORTCODE_ATTS as $naam) {
            $waarde = sanitize_text_field((string) $atts[$naam]);
            if ($waarde !== '') {
                $ingang['atts'][$naam] = $waarde;
            }
        }

        return Mymmo_Forms_Shortcodes::render_ingang($ingang);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Opslag
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Alle ingangen, op naam gesorteerd.
     *
     * @return array<string,array{id:string,name:string,popup:string,soort:string,atts:array<string,string>,updated:int}>
     */
    public static function all(): array {
        $ruw = get_option(self::OPTION, []);
        if (!is_array($ruw)) {
            return [];
        }

        $uit = [];
        foreach ($ruw as $id => $ingang) {
            $schoon = self::normalize((string) $id, is_array($ingang) ? $ingang : []);
            if ($schoon !== null) {
                $uit[$schoon['id']] = $schoon;
            }
        }

        uasort($uit, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $uit;
    }

    /** @return array{id:string,name:string,popup:string,soort:string,atts:array<string,string>,updated:int}|null */
    public static function get(string $id): ?array {
        $id = sanitize_title($id);
        return $id === '' ? null : (self::all()[$id] ?? null);
    }

    /**
     * De ingangen van EEN opstelling.
     *
     * @return array<string,array<string,mixed>>
     */
    public static function for_preset(string $preset): array {
        $preset = sanitize_title($preset);

        return array_filter(self::all(), static fn ($i) => $i['popup'] === $preset);
    }

    /**
     * Een rij uit de option leesbaar en veilig maken.
     *
     * Ook bij het LEZEN en niet alleen bij het schrijven: de option kan van een
     * oudere versie komen, met de hand aangepast zijn, of uit een import.
     *
     * @param  array<string,mixed> $ruw
     * @return array{id:string,name:string,popup:string,soort:string,atts:array<string,string>,updated:int}|null
     */
    private static function normalize(string $id, array $ruw): ?array {
        $id = sanitize_title((string) ($ruw['id'] ?? $id));
        if ($id === '') {
            return null;
        }

        // Een ingang zonder venster kan niets openen. Stil laten staan zou een
        // lijst vullen met iets dat op een pagina niets doet.
        $popup = sanitize_title((string) ($ruw['popup'] ?? ''));
        if ($popup === '') {
            return null;
        }

        $atts = [];
        foreach (self::ATTS as $naam) {
            if (!isset($ruw['atts'][$naam])) {
                continue;
            }
            $waarde = sanitize_text_field((string) $ruw['atts'][$naam]);
            if ($waarde !== '') {
                $atts[$naam] = $waarde;
            }
        }

        $naam  = sanitize_text_field((string) ($ruw['name'] ?? ''));
        $soort = (string) ($ruw['soort'] ?? '');

        return [
            'id'      => $id,
            'name'    => $naam !== '' ? $naam : $id,
            'popup'   => $popup,
            'soort'   => in_array($soort, self::SOORTEN, true) ? $soort : 'knop',
            'atts'    => $atts,
            'updated' => (int) ($ruw['updated'] ?? 0),
        ];
    }

    /**
     * Bewaren. Bestaat het id al, dan wordt die ingang OVERSCHREVEN -- daardoor
     * is "opnieuw bewaren onder dezelfde naam" gewoon bijwerken, en werkt de
     * wijziging door op elke pagina waar de shortcode staat.
     *
     * @param  array<string,string> $atts
     * @return string  het id, of '' als de lijst vol is
     */
    public static function save(string $naam, string $popup, string $soort, array $atts, string $id = ''): string {
        $naam = sanitize_text_field($naam);
        if ($naam === '') {
            $naam = 'Naamloze ingang';
        }

        $id = sanitize_title($id !== '' ? $id : $naam);
        if ($id === '') {
            $id = 'ingang-' . substr((string) time(), -6);
        }

        $alles = get_option(self::OPTION, []);
        if (!is_array($alles)) {
            $alles = [];
        }

        if (count($alles) >= self::MAX && !isset($alles[$id])) {
            return '';
        }

        $alles[$id] = [
            'id'      => $id,
            'name'    => $naam,
            'popup'   => sanitize_title($popup),
            'soort'   => in_array($soort, self::SOORTEN, true) ? $soort : 'knop',
            'atts'    => $atts,
            'updated' => time(),
        ];

        update_option(self::OPTION, $alles, false);

        return $id;
    }

    public static function delete(string $id): void {
        $id    = sanitize_title($id);
        $alles = get_option(self::OPTION, []);

        if (!is_array($alles) || !isset($alles[$id])) {
            return;
        }

        unset($alles[$id]);
        update_option(self::OPTION, $alles, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wat je op je pagina zet
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De shortcode van een ingang.
     *
     * Ook een KLASSE-ingang heeft er een: het venster moet ergens op de pagina
     * staan voor er iets te openen valt. Die shortcode zet je één keer neer
     * (waar maakt niet uit, ze toont niets), en daarna opent elk element met de
     * klasse het venster.
     *
     * @param array<string,mixed> $ingang
     */
    public static function shortcode_tekst(array $ingang): string {
        return '[mymmo_form_entry id="' . (string) $ingang['id'] . '"]';
    }

    /**
     * De klasse die een KLASSE-ingang op een element verwacht.
     *
     * Leeg voor de andere soorten. Wat de gebruiker typt mag met of zonder punt:
     * `.mijn-knop` en `mijn-knop` zijn hetzelfde, want dat is precies de fout
     * die je één keer maakt en daarna nooit meer terugvindt.
     *
     * @param array<string,mixed> $ingang
     */
    public static function klasse_van(array $ingang): string {
        if (($ingang['soort'] ?? '') !== 'klasse') {
            return '';
        }

        return self::sanitize_klasse((string) (($ingang['atts']['trigger'] ?? '')));
    }

    /** Een klassenaam zonder punt, of '' als er niets bruikbaars staat. */
    public static function sanitize_klasse(string $ruw): string {
        return sanitize_html_class(ltrim(trim($ruw), '.'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Formulierafhandeling
    // ─────────────────────────────────────────────────────────────────────────

    public static function handle_save(): void {
        self::gate('mymmo_forms_entry_save');

        $naam  = sanitize_text_field(wp_unslash((string) ($_POST['mymmo_entry_name'] ?? '')));
        $id    = sanitize_title(wp_unslash((string) ($_POST['mymmo_entry_id'] ?? '')));
        $popup = sanitize_title(wp_unslash((string) ($_POST['mymmo_entry_popup'] ?? '')));
        $soort = (string) ($_POST['mymmo_entry_soort'] ?? 'knop');

        $atts = [];
        foreach (self::ATTS as $naam_att) {
            $waarde = sanitize_text_field(wp_unslash((string) ($_POST['mymmo_entry_' . $naam_att] ?? '')));
            if ($waarde !== '') {
                $atts[$naam_att] = $waarde;
            }
        }

        // Een klasse mag met of zonder punt getypt worden; bewaard wordt ze
        // zonder, zodat er maar één vorm in de opslag staat.
        if (isset($atts['trigger'])) {
            $atts['trigger'] = self::sanitize_klasse($atts['trigger']);
            if ($atts['trigger'] === '') {
                unset($atts['trigger']);
            }
        }

        if ($popup === '') {
            self::terug(['mymmo_entry' => 'geen-venster']);
        }

        $bewaard = self::save($naam, $popup, $soort, $atts, $id);

        self::terug($bewaard === ''
            ? ['mymmo_entry' => 'vol']
            : ['mymmo_entry' => 'opgeslagen', 'mymmo_entry_id' => $bewaard]);
    }

    public static function handle_delete(): void {
        self::gate('mymmo_forms_entry_delete');

        self::delete((string) wp_unslash((string) ($_POST['mymmo_entry_id'] ?? '')));

        self::terug(['mymmo_entry' => 'verwijderd']);
    }

    private static function gate(string $actie): void {
        if (!current_user_can('manage_options') || !check_admin_referer($actie)) {
            wp_die('Geen toegang.');
        }
    }

    /** @param array<string,string> $args */
    private static function terug(array $args): void {
        $url = admin_url('options-general.php?page=mymmo-forms&tab=ingangen');
        foreach ($args as $sleutel => $waarde) {
            $url = add_query_arg($sleutel, $waarde, $url);
        }
        wp_safe_redirect($url);
        exit;
    }
}
