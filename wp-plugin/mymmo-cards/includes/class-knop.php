<?php
/**
 * DE KNOP DIE EEN VENSTER OPENT.
 *
 * Een marketeer zet een gewone WordPress-knop neer en kiest in de zijbalk WAT
 * die knop opent: een tabblad van een opstelling uit Mymmo Forms. Bij de
 * ContactPopup is dat bijvoorbeeld "Offertetool", "Stuur ons een bericht" of
 * "Plan een gesprek".
 *
 * WAAROM DE KEUZE UIT DE OPSTELLING KOMT EN NIET UIT DE INGANGEN
 *
 * De eerste versie liet je een INGANG kiezen. Dat leek logisch -- die lijst
 * bestaat al -- maar het klopte niet: een ingang zegt HOE een venster opengaat
 * (een knop, een klasse, een callout), niet WAT je te zien krijgt. De lijst
 * stond daardoor vol met ingangen die enkel bestonden om ergens een knop te
 * kunnen zetten, en het tabblad dat je wilde openen stond er niet eens in.
 *
 * Nu komt de keuze uit de opstelling zelf: de tabbladen die het venster écht
 * heeft, met de opschriften die daar ingesteld staan. Die lijst kan niet
 * verouderen en er staat niets in dat er niet toe doet. De ingangen blijven
 * waarvoor ze bedoeld zijn -- callouts.
 *
 * WAAROM GEEN EIGEN KNOPBLOK
 *
 * Een eigen blok zou zijn eigen vorm meebrengen -- eigen kleuren, eigen randen,
 * eigen opvulling -- en dan staat er op de pagina een knop die nét niet is zoals
 * alle andere knoppen. Dat is precies het probleem waarvoor deze plugin bestaat.
 * Door de KERN-knop uit te breiden krijg je elke eigenschap die WordPress kent
 * (kleur, rand, typografie, breedte, opvulling, stijlvarianten) en stijlt het
 * thema hem, net als elke andere knop.
 *
 * HOE DE BRUG WERKT, EN WAAROM ZO
 *
 * Mymmo Forms kent drie soorten ingang. Een KLASSE-ingang tekent zelf niets: ze
 * rendert het venster met `button="no"` en een trigger-selector, en dan opent
 * elk element met die klasse dat venster (`bindTriggers()` in
 * mymmo-forms-modal.js zoekt in het hele document). Dat is precies wat we hier
 * nodig hebben -- onze knop is dat element.
 *
 * `render()` bouwt daarom een klasse-ingang met de gekozen opstelling en het
 * gekozen tabblad, en geeft die aan `Mymmo_Forms_Shortcodes::render_ingang()`.
 * Er wordt dus geen enkele regel venster-logica overgeschreven: welk formulier,
 * welke agenda, welke stappen, welke teksten -- dat blijft allemaal van die
 * plugin. Er wordt ook niets in haar instellingen aangemaakt of gewijzigd.
 *
 * DIT IS EEN OPTIONELE, EENRICHTINGS-KOPPELING. Staat Mymmo Forms niet aan, dan
 * is dit gewoon een knop en gebeurt er verder niets -- geen fout, geen lege
 * keuzelijst zonder uitleg. `mymmo-cards` importeert niets uit die plugin; het
 * gebruikt haar publieke klassen achter een `class_exists()`.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Knop {

    /** Het blok dat we uitbreiden, en het attribuut dat we eraan hangen. */
    private const BLOK      = 'core/button';
    private const ATTRIBUUT = 'mymmoVenster';
    /** Waar de academy opent (cursus-slug, leeg = overzicht). Enkel bij de academy-popup. */
    private const ACADEMY_ATTRIBUUT = 'mymmoAcademyCursus';

    /** Het attribuut van 1.6.0, toen de keuze nog een INGANG was. */
    private const OUD_ATTRIBUUT = 'mymmoIngang';

    /**
     * De klasse die de knop krijgt, en die het venster als trigger meekrijgt.
     *
     * Afgeleid van de KEUZE en niet willekeurig: twee knoppen die hetzelfde
     * tabblad van dezelfde opstelling openen, delen dan één venster in plaats
     * van er elk een neer te zetten. Dat scheelt een tweede exemplaar van
     * hetzelfde formulier in de DOM, met alles wat daaraan hangt (veld-id's,
     * verborgen velden).
     */
    private const KLASSE_PREFIX = 'mymmo-opent-';

    /** De drie tabbladen die een venster kan hebben. */
    private const TABBLADEN = ['form', 'extra', 'calendly'];

    /** De standaardopschriften van Mymmo Forms, voor een tabblad zonder eigen tekst. */
    private const STANDAARD_LABEL = [
        'form'     => 'Stuur ons een bericht',
        'calendly' => 'Plan een gesprek',
        'extra'    => 'Derde tabblad',
    ];

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_editor_assets', [self::class, 'editor']);
        add_filter('render_block', [self::class, 'render'], 10, 2);
    }

    public static function register(): void {
        wp_register_script(
            'mymmo-cards-knop',
            MYMMO_CARDS_URL . 'assets/js/mymmo-knop-editor.js',
            ['wp-hooks', 'wp-compose', 'wp-element', 'wp-blocks', 'wp-block-editor', 'wp-components'],
            MYMMO_CARDS_VERSION,
            true
        );
    }

    public static function editor(): void {
        wp_enqueue_script('mymmo-cards-knop');

        wp_localize_script('mymmo-cards-knop', 'MymmoCardsVensters', [
            // Staat Mymmo Forms niet aan, dan hoort het paneel dat te ZEGGEN.
            // Een lege keuzelijst zonder uitleg leest als een storing.
            'actief'   => class_exists('Mymmo_Forms_Presets'),
            'vensters' => self::vensters(),
            // De popup van de academy (Instellingen -> Mymmo academy) en haar
            // cursussen: kies je die popup, dan vraagt het paneel waar de
            // academy opent.
            'academy'  => class_exists('Mymmo_Forms_Academy')
                ? [
                    'preset'       => Mymmo_Forms_Academy::settings()['preset'],
                    'courses'      => Mymmo_Forms_Academy::catalogus() ?? [],
                    // Generiek: de academy zegt zelf welke pagina's er zijn.
                    'destinations' => method_exists('Mymmo_Forms_Academy', 'bestemmingen')
                        ? Mymmo_Forms_Academy::bestemmingen()
                        : [],
                ]
                : ['preset' => '', 'courses' => [], 'destinations' => []],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Renderen
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param  string               $html   wat het blok zelf al rendert
     * @param  array<string,mixed>  $block
     */
    public static function render(string $html, array $block): string {
        if (($block['blockName'] ?? '') !== self::BLOK) {
            return $html;
        }

        $keuze = (string) ($block['attrs'][self::ATTRIBUUT] ?? '');

        if ($keuze === '') {
            // Een knop die met 1.6.0 op een INGANG is gezet. Stil laten vallen
            // zou een knop opleveren die niets doet en er goed uitziet; dat is
            // de ergste uitkomst. Dus zeggen wat er aan de hand is.
            if ((string) ($block['attrs'][self::OUD_ATTRIBUUT] ?? '') !== '') {
                return $html . self::melding(
                    'Deze knop is met een oudere versie ingesteld op een ingang. '
                    . 'Kies opnieuw in de zijbalk, bij "Opent een venster".'
                );
            }

            return $html;
        }

        if (!class_exists('Mymmo_Forms_Presets') || !class_exists('Mymmo_Forms_Shortcodes')) {
            return $html . self::melding(
                'Deze knop hoort een venster te openen, maar Mymmo Forms staat niet aan.'
            );
        }

        [$opstelling, $tab] = self::lees_keuze($keuze);

        if ($opstelling === '' || !in_array($tab, self::TABBLADEN, true)) {
            return $html . self::melding('Deze knop heeft geen geldige keuze meer. Kies opnieuw in de zijbalk.');
        }

        $atts = Mymmo_Forms_Presets::atts($opstelling);
        if ($atts === []) {
            return $html . self::melding(
                'De opstelling "' . esc_html($opstelling) . '" bestaat niet (meer). '
                . 'Kijk na bij Instellingen &rarr; Mymmo Forms.'
            );
        }

        if (!in_array($tab, self::tabbladen_van($atts), true)) {
            return $html . self::melding(
                'Het gekozen tabblad staat niet meer in de opstelling "'
                . esc_html($opstelling) . '". Kies opnieuw in de zijbalk.'
            );
        }

        /*
         * De popup van de ACADEMY. Die heeft een eigen venster (in de voettekst,
         * Mymmo_Forms_Academy) dat na het verzenden de cursus opent, en dat
         * wie al aangemeld is meteen naar de cursus stuurt. Een eigen kopie van
         * het venster hier zou dat niet doen: dan blijft de bezoeker op het
         * dankjewelscherm staan. Dus: enkel de knop markeren als academy-knop.
         */
        if (class_exists('Mymmo_Forms_Academy') && Mymmo_Forms_Academy::is_academy_preset($opstelling)) {
            $cursus = sanitize_title((string) ($block['attrs'][self::ACADEMY_ATTRIBUUT] ?? ''));
            // Het PAD uit de keuzelijst (1.8.8); een knop van 1.8.5-1.8.7 heeft
            // enkel een cursus-slug, en die wordt dan het pad van die cursus.
            $pad = (string) ($block['attrs']['mymmoAcademyPad'] ?? '');
            if ($pad === '' || !preg_match('#^/(?!/)[A-Za-z0-9/_%.-]*$#', $pad) || str_contains($pad, '..')) {
                $pad = $cursus !== '' ? '/courses/' . rawurlencode($cursus) : '';
            }
            $is_cursus = str_starts_with($pad, '/courses/');
            $les    = !$is_cursus ? '' : (string) preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($block['attrs']['mymmoAcademyLes'] ?? ''));
            $extra  = ['data-mymmo-academy' => $cursus, 'data-mymmo-academy-pad' => $pad];
            if ($les !== '') {
                $extra['data-mymmo-academy-les'] = $les;
            }
            return self::knop_klaarmaken($html, '', $extra);
        }

        $klasse = self::KLASSE_PREFIX . $opstelling . '-' . $tab;
        $html   = self::knop_klaarmaken($html, $klasse);

        /*
         * Het venster gaat ELKE keer mee, ook als een eerdere knop met dezelfde
         * keuze het al uitschreef. Tot 1.7.0 stond hier een vlag per verzoek
         * ("dit venster staat er al"), en die loog: WordPress rendert dezelfde
         * inhoud vaak meer dan eens per verzoek en gooit de eerste uitvoer weg
         * -- een SEO-plugin die een beschrijving maakt, een thema dat een
         * excerpt opbouwt, een menu dat voor mobiel opnieuw getekend wordt. De
         * vlag stond dan al op "gedaan" bij de render die WEL op de pagina
         * kwam, en de knop opende niets. Dat het niet altijd gebeurde, is
         * precies omdat het afhangt van wat er nog meer op de site draait.
         *
         * Twee knoppen met dezelfde keuze delen evengoed één venster: Mymmo
         * Forms houdt bij het opstarten er één per trigger over
         * (`ontdubbel()` in mymmo-forms-modal.js).
         */
        /*
         * Een KLASSE-ingang, ter plekke samengesteld. Zo tekent Mymmo Forms
         * enkel het venster (`button="no"`, wikkel op `display:contents`) en
         * laat ze het openen over aan onze knop. Er wordt niets bewaard: dit
         * object leeft alleen tijdens dit ene verzoek.
         */
        $venster = Mymmo_Forms_Shortcodes::render_ingang([
            'id'    => $klasse,
            'name'  => $opstelling,
            'popup' => $opstelling,
            'soort' => 'klasse',
            'atts'  => ['trigger' => $klasse, 'tab' => $tab],
        ]);

        return $html . $venster;
    }

    /**
     * `contactpopup|extra` uit elkaar halen.
     *
     * Eén attribuut en geen twee: het zijn geen losse keuzes. Een opstelling
     * zonder tabblad opent niets voorspelbaars, en een tabblad zonder opstelling
     * bestaat niet -- twee velden zouden die ongeldige tussenstanden mogelijk
     * maken, en dan moet elke lezer ze afvangen.
     *
     * @return array{0:string,1:string}
     */
    private static function lees_keuze(string $keuze): array {
        $delen = explode('|', $keuze, 2);

        return [
            sanitize_title($delen[0] ?? ''),
            strtolower(trim((string) ($delen[1] ?? ''))),
        ];
    }

    /**
     * De trigger-klasse op de knop zetten, en hem bereikbaar maken.
     *
     * Met `WP_HTML_Tag_Processor` en niet met een reguliere expressie: dit is de
     * parser van WordPress zelf, en die gaat niet onderuit op een attribuut met
     * een `>` erin of op markup die een thema ertussen zet.
     *
     * Een knop ZONDER link rendert core als een `<a>` zonder `href`, en zo'n
     * element is niet met het toetsenbord te bereiken -- de knop zou dan alleen
     * met de muis werken. Daarom krijgt hij er in dat geval een. Dat een klik
     * niet naar boven springt, regelt mymmo-forms-modal.js: die roept
     * `preventDefault()` aan op elke klik op een openknop.
     */
    /**
     * @param array<string,string> $extra  extra attributen (bv. data-mymmo-academy)
     */
    private static function knop_klaarmaken(string $html, string $klasse, array $extra = []): string {
        if (!class_exists('WP_HTML_Tag_Processor')) {
            return $html;
        }

        $p = new WP_HTML_Tag_Processor($html);

        while ($p->next_tag()) {
            $tag = $p->get_tag();
            if ($tag !== 'A' && $tag !== 'BUTTON') {
                continue;
            }

            if ($klasse !== '') {
                $p->add_class($klasse);
            }
            foreach ($extra as $naam => $waarde) {
                $p->set_attribute($naam, $waarde);
            }

            if ($tag === 'A' && (string) $p->get_attribute('href') === '') {
                $p->set_attribute('href', '#');
            }

            break;
        }

        return $p->get_updated_html();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // De lijst voor de editor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Elke opstelling met de tabbladen die ze écht heeft.
     *
     * @return array<int,array{id:string,name:string,tabbladen:array<int,array{tab:string,label:string}>}>
     */
    private static function vensters(): array {
        if (!class_exists('Mymmo_Forms_Presets')) {
            return [];
        }

        $uit = [];

        foreach (Mymmo_Forms_Presets::all() as $opstelling) {
            $atts      = is_array($opstelling['atts'] ?? null) ? $opstelling['atts'] : [];
            $tabbladen = [];

            foreach (self::tabbladen_van($atts) as $tab) {
                $tabbladen[] = ['tab' => $tab, 'label' => self::label_van($atts, $tab)];
            }

            if ($tabbladen === []) {
                continue;
            }

            $uit[] = [
                'id'        => (string) $opstelling['id'],
                'name'      => (string) $opstelling['name'],
                'tabbladen' => $tabbladen,
                // De popup van de academy? Dan vraagt het paneel waar ze opent.
                'academy'   => class_exists('Mymmo_Forms_Academy')
                    && Mymmo_Forms_Academy::is_academy_preset((string) $opstelling['id']),
            ];
        }

        return $uit;
    }

    /**
     * Welke tabbladen deze opstelling heeft, in haar eigen volgorde.
     *
     * Het formulier is er altijd; het derde tabblad bestaat zodra er een eigen
     * formulier of een eigen stappenreeks voor ingesteld is, en de agenda zodra
     * er een boekingslink staat. Dat zijn exact de voorwaarden die Mymmo Forms
     * zelf gebruikt.
     *
     * `tab_order` wordt gelezen omdat de keuzelijst dan dezelfde volgorde heeft
     * als het venster. Het BESLIST hier niets -- wat er opengaat en in welke
     * volgorde de tabbladen staan, blijft van Mymmo Forms.
     *
     * @param  array<string,string> $atts
     * @return array<int,string>
     */
    private static function tabbladen_van(array $atts): array {
        $bestaat = ['form'];

        if (trim((string) ($atts['extra_slug'] ?? '')) !== ''
            || trim((string) ($atts['extra_steps'] ?? '')) !== '') {
            $bestaat[] = 'extra';
        }

        if (trim((string) ($atts['calendly'] ?? '')) !== '') {
            $bestaat[] = 'calendly';
        }

        $uit = [];
        foreach (preg_split('/[,\|]/', (string) ($atts['tab_order'] ?? '')) ?: [] as $naam) {
            $naam = strtolower(trim((string) $naam));
            if ($naam !== '' && in_array($naam, $bestaat, true) && !in_array($naam, $uit, true)) {
                $uit[] = $naam;
            }
        }
        foreach ($bestaat as $naam) {
            if (!in_array($naam, $uit, true)) {
                $uit[] = $naam;
            }
        }

        return $uit;
    }

    /**
     * Het opschrift van een tabblad, zoals het in het venster staat.
     *
     * Staat er niets, dan het standaardopschrift van Mymmo Forms. Voor het derde
     * tabblad bestaat dat niet: daar valt de plugin terug op de naam van het
     * formulier, en dat kunnen we hier niet opzoeken zonder de formulier-API.
     * Dan liever de slug erbij dan een naam verzinnen -- een marketeer herkent
     * "Derde tabblad (offertetool)", en een verzonnen naam zou hem doen twijfelen
     * of hij wel het juiste kiest.
     *
     * @param array<string,string> $atts
     */
    private static function label_van(array $atts, string $tab): string {
        $sleutel = $tab === 'form' ? 'tab_form' : ($tab === 'calendly' ? 'tab_calendly' : 'tab_extra');
        $eigen   = trim((string) ($atts[$sleutel] ?? ''));

        if ($eigen !== '') {
            return $eigen;
        }

        if ($tab === 'extra') {
            $slug = trim((string) ($atts['extra_slug'] ?? ''));
            return $slug !== ''
                ? self::STANDAARD_LABEL['extra'] . ' (' . $slug . ')'
                : self::STANDAARD_LABEL['extra'];
        }

        return self::STANDAARD_LABEL[$tab] ?? $tab;
    }

    /**
     * Een melding voor wie de pagina kan bewerken, en niets voor een bezoeker.
     *
     * Die kan er toch niets mee, en een technische melding toont hoe de site in
     * elkaar zit. Zelfde keuze als in Mymmo Forms zelf.
     */
    private static function melding(string $tekst): string {
        if (!current_user_can('edit_posts')) {
            return '';
        }

        /*
         * De stijl staat hier INLINE en niet in de stylesheet. Deze melding
         * verschijnt alleen als er iets stuk is, en dan hoort ze er te staan
         * zonder dat het van een stylesheet afhangt die op die pagina misschien
         * niet geladen is -- de stylesheet van Mymmo Forms wordt pas door het
         * venster zelf ingeladen, en dat is nu net wat er ontbreekt.
         */
        $stijl = 'display:block;margin:8px 0;padding:8px 12px;border-radius:6px;'
            . 'background:#fef3c7;color:#713f12;font-size:13px;line-height:1.4;';

        return '<div class="mymmo-knop-melding" role="status" style="' . esc_attr($stijl) . '">'
            . $tekst . '</div>';
    }
}
