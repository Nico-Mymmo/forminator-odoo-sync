<?php
/**
 * De vier blokken, hun registratie en hun render.
 *
 * SERVER-SIDE GERENDERD, alle vier. `save` geeft in de editor enkel de INHOUD
 * van de kaarten terug (InnerBlocks.Content); de wikkels, de klassen en de
 * CSS-variabelen komen hier vandaan. Dat is met opzet: verandert de opmaak van
 * de stapel in een volgende versie, dan volgen bestaande pagina's vanzelf
 * mee -- niemand hoeft ze te openen en opnieuw te bewaren, en er kan geen
 * blokvalidatiefout ontstaan. Zelfde keuze als bij het blok "Mymmo formulier".
 *
 * DE INDEX VAN EEN KAART WORDT HIER GETELD, niet in CSS.
 * De kleefwiskunde heeft per kaart haar plaats in de rij nodig (`top` schuift
 * met `--mk-index * --mk-stap`). CSS kan dat niet rekenen -- `nth-child` levert
 * geen getal op dat je in `calc()` kan gebruiken -- en het met de hand
 * uitschrijven is precies wat er eerder stond: `.stack-1 {} .stack-2 {}` tot
 * en met het aantal kaarten dat er toen toevallig was. Daarom rendert de
 * STAPEL haar kinderen zelf en telt ze onderweg.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Blocks {

    public const STAPEL = 'mymmo/cards';
    public const KOP    = 'mymmo/cards-kop';
    public const KAART  = 'mymmo/card';
    public const KOLOM  = 'mymmo/card-kolom';

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

        wp_register_style(
            'mymmo-cards',
            MYMMO_CARDS_URL . 'assets/css/mymmo-cards.css',
            [],
            MYMMO_CARDS_VERSION
        );

        wp_register_style(
            'mymmo-cards-editor',
            MYMMO_CARDS_URL . 'assets/css/mymmo-cards-editor.css',
            ['mymmo-cards'],
            MYMMO_CARDS_VERSION
        );

        wp_register_script(
            'mymmo-cards',
            MYMMO_CARDS_URL . 'assets/js/mymmo-cards.js',
            [],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_register_script(
            'mymmo-cards-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-cards-editor.js',
            // wp-data: de kaart leest hoeveel kolommen ze heeft.
            // wp-media-utils: die registreert de echte mediabibliotheek achter
            // MediaUpload -- zonder dat doet de knop "Vorm kiezen" niets.
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-media-utils'],
            MYMMO_CARDS_VERSION,
            true
        );

        // De gesloten lijsten gaan mee naar de editor. Niet hardgecodeerd in de
        // JS: dan staat dezelfde lijst op twee plekken en kan de editor een
        // waarde aanbieden die de render niet kent -- en dan valt ze stil terug
        // op de standaard, zonder dat iets zegt waarom.
        $opvullingen = [];
        foreach (mymmo_cards_opvullingen() as $sleutel => $label) {
            $opvullingen[] = ['value' => $sleutel, 'label' => $label];
        }

        $verhoudingen = [];
        foreach (mymmo_cards_verhoudingen() as $sleutel => $rij) {
            // De CSS gaat mee: de editor tekent de kolommen zelf en hoort
            // dezelfde verdeling te tonen als de pagina. Zonder dit zou de
            // editor altijd de standaardverhouding laten zien.
            $verhoudingen[] = ['value' => $sleutel, 'label' => $rij[0], 'css' => $rij[1]];
        }

        wp_localize_script('mymmo-cards-editor', 'MymmoCards', [
            'opvullingen'  => $opvullingen,
            'verhoudingen' => $verhoudingen,
        ]);

        register_block_type(self::STAPEL, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-cards-editor',
            'editor_style'    => 'mymmo-cards-editor',
            'style'           => 'mymmo-cards',
            'script'          => 'mymmo-cards',
            'attributes'      => self::attributen_stapel(),
            'render_callback' => [self::class, 'render_stapel'],
        ]);

        register_block_type(self::KOP, [
            'api_version'     => 2,
            'parent'          => [self::STAPEL],
            'attributes'      => [],
            'render_callback' => [self::class, 'render_kop'],
        ]);

        register_block_type(self::KAART, [
            'api_version'     => 2,
            'parent'          => [self::STAPEL],
            'attributes'      => self::attributen_kaart(),
            'render_callback' => [self::class, 'render_kaart'],
        ]);

        register_block_type(self::KOLOM, [
            'api_version'     => 2,
            'parent'          => [self::KAART],
            'attributes'      => self::attributen_kolom(),
            'render_callback' => [self::class, 'render_kolom'],
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-cards-editor.js.
     *
     * Dat is bewust en het is de enige dubbelheid in deze plugin: zonder
     * bouwstap is er geen block.json dat beide kanten voedt, en de editor moet
     * de attributen kennen om ze te kunnen bewaren. De namen hier zijn leidend
     * -- wat de editor stuurt en hier niet staat, komt niet in de render aan.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen_stapel(): array {
        return [
            /*
             * VOLLE BREEDTE IS DE STANDAARD.
             *
             * Een kaartenstapel hoort over de hele pagina te lopen: de kop moet
             * de kaarten kunnen afdekken terwijl ze eronder doorschuiven, en de
             * maximale breedte van een kaart (1200px) gaat ervan uit dat er
             * zoveel ruimte IS. Zonder deze standaard belandt de stapel in de
             * inhoudskolom van het thema -- vaak 650 tot 800px -- en is een
             * kaart nooit breder dan dat, hoe hoog je de maximale breedte ook
             * zet. Dat leest als "de instelling doet niets".
             *
             * Een redacteur kan het nog altijd wijzigen in de werkbalk van het
             * blok; dit is enkel wat er staat als hij niets doet.
             */
            'align'       => ['type' => 'string', 'default' => 'full'],
            // De zichtbare rand van elke kaart eronder.
            'stap'        => ['type' => 'number', 'default' => 16],
            // De lucht tussen twee kaarten tijdens het scrollen: hoeveel je
            // scrolt voor de volgende kaart de vorige raakt.
            'gap'         => ['type' => 'number', 'default' => 40],
            'opvulling'   => ['type' => 'string', 'default' => 'normaal'],
            'hoeken'      => ['type' => 'number', 'default' => 28],
            // Tot hoever een kaart mag uitzetten. De STAPEL loopt over de volle
            // breedte -- de kop moet de kaarten kunnen afdekken terwijl ze
            // eronder doorschuiven -- maar de kaart blijft hierbinnen en staat
            // gecentreerd.
            'breedte'     => ['type' => 'number', 'default' => 1200],
            // 'gelijk' = alle kaarten even hoog als de hoogste (gemeten, niet
            // ingetypt). 'natuurlijk' = elke kaart zo hoog als haar inhoud.
            'hoogte'      => ['type' => 'string', 'default' => 'gelijk'],
            'animatie'    => ['type' => 'string', 'default' => 'schaal'],
            'kleven'      => ['type' => 'boolean', 'default' => true],
            'kleeftMobiel' => ['type' => 'boolean', 'default' => true],
            // De kleur van de PAGINA achter de stapel. De kop is kleverig en
            // moet de kaarten kunnen afdekken; met een doorzichtige kop schuift
            // de tekst van een kaart er dwars doorheen.
            'paginakleur' => ['type' => 'string', 'default' => '#ffffff'],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_kaart(): array {
        return [
            'verhouding' => ['type' => 'string', 'default' => '40-60'],
            'achtergrond' => ['type' => 'string', 'default' => ''],
            // Leeg = de hoeken van de stapel. Een getal wint daarvan.
            'hoeken'     => ['type' => 'string', 'default' => ''],
            'opvulling'  => ['type' => 'string', 'default' => ''],
            // Wat er op een telefoon bovenaan staat. Twee kolommen worden daar
            // onder elkaar gezet, en dan is de volgorde een keuze -- geen
            // gevolg van waar iets toevallig in de editor stond.
            'mobiel'     => ['type' => 'string', 'default' => 'links-eerst'],
            // De uitlijning van de inhoud in de kaart, apart voor naast elkaar
            // en voor gestapeld: dat zijn twee verschillende vragen. Gestapeld
            // staat standaard bovenaan, want daar varieert de bovenmarge
            // anders met hoeveel tekst er in een kaart staat.
            'uitlijning'       => ['type' => 'string', 'default' => 'midden'],
            'uitlijningMobiel' => ['type' => 'string', 'default' => 'boven'],
            /*
             * DE SIERAFBEELDING: een vorm die ACHTER de inhoud doorloopt en
             * groter mag zijn dan de kaart -- dan snijdt de kaart hem af.
             *
             * Breedte in procenten van de KAART, en de verschuiving vanuit het
             * MIDDEN (50/50 = gecentreerd, 0 = links/boven, 100 =
             * rechts/onder, en daarbuiten mag ook). Bewust geen
             * `background-image`: die kan je niet groter dan haar vlak maken
             * zonder te rekenen, en `background-position` in procenten doet
             * iets anders dan je verwacht zodra het beeld groter is dan de doos.
             */
            'sier'        => ['type' => 'string', 'default' => ''],
            // De GROOTTE, in procenten van de breedte van de kaart. De vorm
            // houdt haar eigen hoogte-breedteverhouding; er is bewust geen
            // aparte hoogte (zie de stylesheet).
            'sierBreedte' => ['type' => 'number', 'default' => 70],
            'sierX'       => ['type' => 'number', 'default' => 50],
            'sierY'       => ['type' => 'number', 'default' => 50],
            'sierDraai'   => ['type' => 'number', 'default' => 0],
            'sierDekking' => ['type' => 'number', 'default' => 100],
            // Eigen maat en plaats op een smal scherm. Nodig omdat de kaart
            // daar een heel andere vorm heeft: wat op 1200px een hoek vult,
            // ligt op 375px over de halve tekst.
            'sierMobiel'        => ['type' => 'boolean', 'default' => false],
            'sierBreedteMobiel' => ['type' => 'number', 'default' => 70],
            'sierXMobiel'       => ['type' => 'number', 'default' => 50],
            'sierYMobiel'       => ['type' => 'number', 'default' => 50],
            'sierDraaiMobiel'   => ['type' => 'number', 'default' => 0],
            'sierDekkingMobiel' => ['type' => 'number', 'default' => 100],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_kolom(): array {
        return [
            // 'vol': de inhoud raakt de rand van de kaart. Voor een beeld of een
            // video die tot in de hoek doorloopt.
            'vol' => ['type' => 'boolean', 'default' => false],
            // Leeg = volgt de kaart. Geldt alleen NAAST elkaar; gestapeld is
            // elke rij zo hoog als haar inhoud en valt er niets uit te lijnen.
            'uitlijning' => ['type' => 'string', 'default' => ''],
            // Binnenmarge, bovenop de opvulling van de kaart. -1 op mobiel =
            // dezelfde als hierboven; 0 is een geldige keuze en kan dus niet
            // voor "niet ingesteld" doorgaan.
            'pad'        => ['type' => 'number', 'default' => 0],
            'padMobiel'  => ['type' => 'number', 'default' => -1],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De stapel. Rendert haar kinderen ZELF, om ze te kunnen tellen.
     *
     * @param array<string,mixed> $attrs
     * @param mixed               $block  WP_Block (of iets met ->inner_blocks in de proefopstelling)
     */
    public static function render_stapel($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $koppen   = [];
        $slots    = [];
        $heeft_kop = false;

        foreach (self::kinderen_van($block) as $kind) {
            $naam = (string) ($kind->name ?? '');
            $html = (string) $kind->render();

            if (trim($html) === '') {
                continue;
            }

            if ($naam === self::KAART) {
                /*
                 * DE KAART KLEEFT ZELF; DE SCROLLRUIMTE STAAT ERNAAST.
                 *
                 * Een kleefelement wordt weggeduwd zodra de onderrand van zijn
                 * ouder op `top + zijn eigen hoogte` komt. Zat de kaart in een
                 * slot dat ook de scrollruimte droeg, dan telde die ruimte mee
                 * in die hoogte en begon het wegduwen een volle kaarthoogte te
                 * vroeg -- waardoor het lijkt alsof de VOORLAATSTE kaart het dek
                 * wegduwt in plaats van de laatste.
                 *
                 * De hoogte van de kaart is nu precies haar hoogte, en de
                 * scrollafstand staat als een leeg vlak erachter. Samen even
                 * lang als vroeger, dus het ritme verandert niet.
                 */
                $index  = count($slots);
                $klasse = 'mymmo-kaart-anker' . ($index === 0 ? ' mymmo-kaart-anker--eerste' : '');

                // Het lege vlak ACHTER de kaart draagt de scrollafstand tot de
                // volgende. Het wordt hieronder toegevoegd -- behalve achter de
                // laatste kaart, want daar is geen volgende meer. Zou het er
                // staan, dan ligt die kaart op haar plek terwijl er nog een
                // kaarthoogte gescrold moet worden voor er iets gebeurt: dode
                // scroll, en het ergste wat een stapel kan doen.
                $slots[] = '<div class="' . $klasse . '" style="--mk-index:' . $index . '">' . $html . '</div>';
                continue;
            }

            if ($naam === self::KOP) {
                $heeft_kop = true;
            }

            $koppen[] = $html;
        }

        $kaarten = count($slots);

        /*
         * De scrollafstand komt tussen de kaarten, niet erachter.
         *
         * Na de laatste kaart volgt er geen vlak: het einde van de stapel valt
         * daardoor samen met het moment dat die kaart op haar plek ligt, en
         * precies dan laten alle ankers los (ze delen hetzelfde kleefpunt). Het
         * hoopje vertrekt dus op het moment dat het af is.
         */
        foreach ($slots as $i => $anker) {
            if ($i < $kaarten - 1) {
                $slots[$i] = $anker
                    . '<div class="mymmo-kaart-ruimte" style="--mk-index:' . $i . '" aria-hidden="true"></div>';
            }
        }

        /*
         * HET LIJF EN DE UITLOOP -- twee dozen met elk een eigen taak.
         *
         * Alle kaarten staan in het LIJF. Dat is hun ouder, en een kleefelement
         * laat los zodra de onderrand van zijn ouder zijn kleefpunt raakt. Het
         * lijf eindigt bij de laatste kaart, dus alle kaarten laten precies dan
         * los: op het moment dat het hoopje af is. Ze delen hetzelfde kleefpunt
         * (zie de stylesheet), dus dat gebeurt voor alle kaarten tegelijk en
         * schuift het hoopje als geheel omhoog.
         *
         * De UITLOOP staat erachter, buiten het lijf, en zet enkel de hoogte
         * van de laatste kaart in de pagina. Nodig omdat de kaarten buiten de
         * flow hangen: zonder die uitloop begint de sectie onder de stapel
         * bovenaan de laatste kaart in plaats van eronder. Ze raakt het
         * loslaten niet -- ze valt buiten het lijf.
         *
         * Alles in EEN doos stoppen kan dus niet: dan verschuift het loslaten
         * mee met die hoogte en krijg je de dode scroll terug.
         */
        $kinderen = $koppen;

        if ($kaarten > 0) {
            $kinderen[] = '<div class="mymmo-kaarten-lijf">' . implode('', $slots) . '</div>'
                . '<div class="mymmo-kaarten-uitloop" aria-hidden="true"></div>';
        }

        if ($kinderen === [] && trim($content) !== '') {
            // Vangnet: zou de blokcontext ooit ontbreken (een render buiten
            // render_block om), dan liever de inhoud ONGESTAPELD tonen dan een
            // lege pagina. Zonder de indexen is er geen kleefgedrag, maar de
            // kaarten staan er dan gewoon onder elkaar.
            $kinderen[] = $content;
        }

        if ($kinderen === []) {
            // Een lege stapel toont niets aan een bezoeker. In de editor is dat
            // geen probleem: daar staat het blok zelf, met zijn eigen uitleg.
            return '';
        }

        $opvulling = mymmo_cards_keuze((string) ($attrs['opvulling'] ?? ''), mymmo_cards_opvullingen(), 'normaal');

        $stijl = [
            '--mk-stap:'   . mymmo_cards_px($attrs['stap'] ?? null, 16, 0, 80) . 'px',
            '--mk-gap:'    . mymmo_cards_px($attrs['gap'] ?? null, 40, 0, 200) . 'px',
            '--mk-hoeken:' . mymmo_cards_px($attrs['hoeken'] ?? null, 28, 0, 80) . 'px',
            '--mk-max:'    . mymmo_cards_px($attrs['breedte'] ?? null, 1200, 480, 2400) . 'px',
            '--mk-aantal:' . max(1, $kaarten),
        ];

        $pagina = mymmo_cards_color((string) ($attrs['paginakleur'] ?? ''));
        if ($pagina !== '') {
            $stijl[] = '--mk-pagina:' . $pagina;
        }

        $klassen = ['mymmo-kaarten', 'mymmo-kaarten--pad-' . $opvulling];

        /*
         * De uitlijnklasse moet een DYNAMISCH blok zelf renderen.
         *
         * Bij een blok dat zijn eigen HTML bewaart, zet de editor `alignfull`
         * bij het opslaan in de markup. Dit blok bewaart enkel de inhoud van de
         * kaarten (`InnerBlocks.Content`), dus die klasse komt hier nooit
         * terecht -- get_block_wrapper_attributes() voegt ze ook niet toe, want
         * `align` is geen block-support die de server afhandelt. Zonder deze
         * drie regels staat de stapel in de editor wel op volle breedte en op
         * de PAGINA niet, en dat is precies het soort verschil dat je pas ziet
         * als het live staat. Core doet dit in zijn eigen dynamische blokken
         * net zo (zie core/post-featured-image).
         */
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            $klassen[] = 'align' . $uitlijning;
        }
        if ($heeft_kop) {
            // De eerste kaart heft de onderrand van de kop op met een negatieve
            // marge. Zonder kop zou die marge de hele stapel omhoog trekken --
            // vandaar een klasse en geen vaste regel.
            $klassen[] = 'mymmo-kaarten--met-kop';
        }
        if ((string) ($attrs['hoogte'] ?? 'gelijk') !== 'gelijk') {
            $klassen[] = 'mymmo-kaarten--natuurlijk';
        }
        if (!self::vlag($attrs, 'kleven', true)) {
            $klassen[] = 'mymmo-kaarten--los';
        }
        if (!self::vlag($attrs, 'kleeftMobiel', true)) {
            $klassen[] = 'mymmo-kaarten--los-mobiel';
        }

        $wikkel = self::wikkel([
            'class' => implode(' ', $klassen),
            'style' => implode(';', $stijl),
        ]);

        // data-mymmo-kaarten is het haakje voor het script: dat meet de hoogtes
        // en verzorgt de schaalbeweging. Staat er geen script (of weigert de
        // bezoeker beweging), dan werkt de stapel gewoon zonder -- de
        // kleefwiskunde is CSS en heeft aan de terugvalhoogte genoeg.
        return '<div ' . $wikkel . ' data-mymmo-kaarten'
            . ' data-animatie="' . esc_attr(self::animatie($attrs)) . '">'
            . implode('', $kinderen)
            . '</div>';
    }

    /**
     * De kop boven de stapel: blijft staan terwijl de kaarten eronder schuiven.
     *
     * @param array<string,mixed> $attrs
     */
    public static function render_kop($attrs = [], string $content = '', $block = null): string {
        if (trim($content) === '') {
            return '';
        }

        // Twee elementen, en dat is nodig: het buitenste kleurt over de volle
        // breedte -- de kop moet de kaarten kunnen afdekken terwijl ze eronder
        // doorschuiven -- en het binnenste lijnt de tekst uit op dezelfde maat
        // als de kaarten. Met een maximale breedte op de kop zelf zou de kleur
        // meekrimpen en zag je de kaarten links en rechts ernaast doorschuiven.
        return '<div class="mymmo-kaarten-kop">'
            . '<div class="mymmo-kaarten-kop-binnen">' . $content . '</div>'
            . '</div>';
    }

    /**
     * Een kaart. Rendert haar kolommen zelf, om lege kolommen te kunnen
     * overslaan en de overgebleven kolommen te tellen.
     *
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render_kaart($attrs = [], string $content = '', $block = null): string {
        $attrs   = is_array($attrs) ? $attrs : [];
        $kolommen = [];
        $bijsnijden = false;

        foreach (self::kinderen_van($block) as $kind) {
            $html = (string) $kind->render();
            if (trim($html) === '') {
                continue;
            }
            $kolommen[] = $html;
            if (strpos($html, 'mymmo-kaart-kolom--vol') !== false) {
                $bijsnijden = true;
            }
        }

        if ($kolommen === [] && trim($content) !== '') {
            // Zonder blokcontext (proefopstelling, of een pagina die met de
            // hand samengesteld is) vallen we terug op wat er al gerenderd is.
            $kolommen[] = $content;
        }

        if ($kolommen === []) {
            return '';
        }

        $aantal     = count($kolommen);
        $verhouding = mymmo_cards_keuze((string) ($attrs['verhouding'] ?? ''), mymmo_cards_verhoudingen(), '40-60');

        $klassen = ['mymmo-kaart', 'mymmo-kaart--k' . min(3, $aantal)];

        // `midden` (desktop) en `boven` (gestapeld) zijn de standaarden en
        // staan in de stylesheet zelf; alleen een afwijking krijgt een klasse.
        $uit = (string) ($attrs['uitlijning'] ?? 'midden');
        if ($uit === 'boven' || $uit === 'onder') {
            $klassen[] = 'mymmo-kaart--' . $uit;
        }

        $uit_mobiel = (string) ($attrs['uitlijningMobiel'] ?? 'boven');
        if ($uit_mobiel === 'midden' || $uit_mobiel === 'onder') {
            $klassen[] = 'mymmo-kaart--mob-' . $uit_mobiel;
        }
        if ((string) ($attrs['mobiel'] ?? 'links-eerst') === 'rechts-eerst') {
            $klassen[] = 'mymmo-kaart--rechts-eerst';
        }
        if ($bijsnijden) {
            // Enkel bijsnijden als er echt iets tot de rand loopt. `overflow`
            // staat nergens anders in deze plugin: het is `hidden` en dus geen
            // schuifbalk, maar het kan wel iets wegknippen dat buiten de kaart
            // hangt, en dat wil je niet standaard.
            $klassen[] = 'mymmo-kaart--bijgesneden';
        }

        $stijl = ['--mk-verhouding:' . mymmo_cards_verhoudingen()[$verhouding][1]];

        // De sierafbeelding. Staat er een, dan wordt de kaart ALTIJD
        // bijgesneden: dat de vorm aan de rand ophoudt, is het effect zelf.
        $sier_html = '';
        $sier = mymmo_cards_afbeelding((string) ($attrs['sier'] ?? ''));
        if ($sier !== '') {
            $stijl[] = '--mk-sier-breedte:' . mymmo_cards_px($attrs['sierBreedte'] ?? null, 70, 5, 1000) . '%';
            $stijl[] = '--mk-sier-x:' . mymmo_cards_px($attrs['sierX'] ?? null, 50, -300, 400) . '%';
            $stijl[] = '--mk-sier-y:' . mymmo_cards_px($attrs['sierY'] ?? null, 50, -300, 400) . '%';
            $stijl[] = '--mk-sier-draai:' . mymmo_cards_px($attrs['sierDraai'] ?? null, 0, -180, 180) . 'deg';
            $stijl[] = '--mk-sier-dekking:' . (mymmo_cards_px($attrs['sierDekking'] ?? null, 100, 0, 100) / 100);

            if (self::vlag($attrs, 'sierMobiel', false)) {
                $klassen[] = 'mymmo-kaart--sier-m';
                $stijl[] = '--mk-sier-breedte-m:' . mymmo_cards_px($attrs['sierBreedteMobiel'] ?? null, 70, 5, 1000) . '%';
                $stijl[] = '--mk-sier-x-m:' . mymmo_cards_px($attrs['sierXMobiel'] ?? null, 50, -300, 400) . '%';
                $stijl[] = '--mk-sier-y-m:' . mymmo_cards_px($attrs['sierYMobiel'] ?? null, 50, -300, 400) . '%';
                $stijl[] = '--mk-sier-draai-m:' . mymmo_cards_px($attrs['sierDraaiMobiel'] ?? null, 0, -180, 180) . 'deg';
                $stijl[] = '--mk-sier-dekking-m:' . (mymmo_cards_px($attrs['sierDekkingMobiel'] ?? null, 100, 0, 100) / 100);
            }

            // De klasse hier en niet via $bijsnijden: die vlag is hierboven al
            // uitgelezen. Ze twee keer laten beslissen zou betekenen dat de
            // volgorde in dit bestand bepaalt of een sierafbeelding afgesneden
            // wordt -- en dat is het soort stille fout waar niets van te zien is
            // tot je de vorm over de rand ziet hangen.
            if (!in_array('mymmo-kaart--bijgesneden', $klassen, true)) {
                $klassen[] = 'mymmo-kaart--bijgesneden';
            }

            // Een VLAK met de afbeelding als achtergrond, geen <img>: zie de
            // uitleg in de stylesheet. aria-hidden want dit is versiering --
            // een schermlezer die een bestandsnaam voorleest is erger dan
            // stilte, en een leeg element heeft niets te vertellen.
            $sier_html = '<span class="mymmo-kaart-sier" aria-hidden="true"'
                . ' style="background-image:url(' . esc_url($sier) . ')"></span>';
        }

        $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-bg:' . $bg;
        }

        $hoeken = trim((string) ($attrs['hoeken'] ?? ''));
        if ($hoeken !== '' && is_numeric($hoeken)) {
            $stijl[] = '--mk-hoeken:' . mymmo_cards_px($hoeken, 28, 0, 80) . 'px';
        }

        // Wijkt deze kaart af van de stapel, dan als KLASSE -- zie de uitleg bij
        // mymmo_cards_opvullingen(): inline zou de mobiele maat blokkeren.
        $opvulling = trim((string) ($attrs['opvulling'] ?? ''));
        if ($opvulling !== '' && isset(mymmo_cards_opvullingen()[$opvulling])) {
            $klassen[] = 'mymmo-kaart--pad-' . $opvulling;
        }

        $wikkel = self::wikkel([
            'class' => implode(' ', $klassen),
            'style' => implode(';', $stijl),
        ]);

        return '<article ' . $wikkel . '>'
            . $sier_html
            . '<div class="mymmo-kaart-raster">' . implode('', $kolommen) . '</div>'
            . '</article>';
    }

    /**
     * Een kolom. Leeg = niets renderen: een kaart met één kolom is een brede
     * kaart, geen kaart met een gat ernaast.
     *
     * @param array<string,mixed> $attrs
     */
    public static function render_kolom($attrs = [], string $content = '', $block = null): string {
        if (!mymmo_cards_heeft_inhoud($content)) {
            return '';
        }

        $attrs   = is_array($attrs) ? $attrs : [];
        $klassen = ['mymmo-kaart-kolom'];

        if (self::vlag($attrs, 'vol', false)) {
            $klassen[] = 'mymmo-kaart-kolom--vol';
        }

        $uit = (string) ($attrs['uitlijning'] ?? '');
        if (in_array($uit, ['boven', 'midden', 'onder'], true)) {
            $klassen[] = 'mymmo-kaart-kolom--' . $uit;
        }

        $stijl = [];

        $pad = mymmo_cards_px($attrs['pad'] ?? null, 0, 0, 200);
        if ($pad > 0) {
            $stijl[] = '--mk-kolom-pad:' . $pad . 'px';
        }

        $pad_mobiel = mymmo_cards_px($attrs['padMobiel'] ?? null, -1, -1, 200);
        if ($pad_mobiel >= 0) {
            $stijl[] = '--mk-kolom-pad-m:' . $pad_mobiel . 'px';
        }

        return '<div class="' . esc_attr(implode(' ', $klassen)) . '"'
            . ($stijl === [] ? '' : ' style="' . esc_attr(implode(';', $stijl)) . '"')
            . '>' . $content . '</div>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gereedschap
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De kinderen van een blok, of een lege lijst.
     *
     * Bewust zonder type-hint op WP_Block: de proefopstelling
     * (wp-plugin/mymmo-cards-preview.php) geeft hier een eenvoudig object met
     * dezelfde twee eigenschappen, zodat de render zonder WordPress te draaien
     * is. Dat is de enige manier om deze markup te controleren zonder site.
     *
     * @param  mixed $block
     * @return iterable<object>
     */
    private static function kinderen_van($block): iterable {
        if (is_object($block) && isset($block->inner_blocks)) {
            return $block->inner_blocks;
        }

        return [];
    }

    /** @param array<string,mixed> $attrs */
    private static function vlag(array $attrs, string $naam, bool $terugval): bool {
        if (!array_key_exists($naam, $attrs)) {
            return $terugval;
        }

        return filter_var($attrs[$naam], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $terugval;
    }

    /** @param array<string,mixed> $attrs */
    private static function animatie(array $attrs): string {
        return (string) ($attrs['animatie'] ?? 'schaal') === 'geen' ? 'geen' : 'schaal';
    }

    /**
     * De attributen van de buitenste wikkel.
     *
     * get_block_wrapper_attributes() voegt er de klassen van WordPress zelf bij
     * -- `alignfull`, een eigen klasse van de redacteur, een anker. Die functie
     * bestaat enkel binnen een echte render; daarbuiten (proefopstelling)
     * bouwen we hetzelfde met de hand.
     *
     * @param array<string,string> $extra
     */
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

    /**
     * De stylesheet ook IN de editor.
     *
     * enqueue_block_assets en niet enqueue_block_editor_assets: sinds
     * WordPress 6.3 staat het canvas in een iframe, en alleen deze haak zet
     * stijlen daarbinnen. Zonder dit bouwt een marketeer zijn kaarten in een
     * ongestylede lijst en ziet hij pas op de pagina wat het wordt.
     */
    public static function assets(): void {
        if (!is_admin()) {
            return;
        }

        wp_enqueue_style('mymmo-cards');
        wp_enqueue_style('mymmo-cards-editor');
    }
}
