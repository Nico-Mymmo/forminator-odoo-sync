<?php
/**
 * De KEIENWOLK: grote zwevende keien met eigen inhoud, omringd door kleine
 * keitjes die parallax voorbijkomen.
 *
 * Drie blokken:
 *
 *   mymmo/keien   -- de wolk zelf (het podium). Bepaalt de maat van de keien,
 *                    hoeveel ze overlappen, hoe sterk alles beweegt.
 *   mymmo/kei     -- een grote kei. De INHOUD zijn gewone core-blokken
 *                    (afbeelding, alinea, kop), dus de letter komt uit het
 *                    thema -- zelfde regel als bij de kaartenstapel.
 *   mymmo/keitje  -- een klein keitje met een tekening. Versiering: geen
 *                    inhoud, aria-hidden, en vrij te plaatsen in de wolk.
 *
 * WAAROM EEN EIGEN BLOK en geen variant van de kaartenstapel: een stapel is
 * geordend en kleeft; een wolk is net NIET geordend. Alles wat hier gebeurt
 * (overlap, scheef, zweven, voorbijschuiven) staat haaks op wat een stapel
 * moet garanderen. Twee dingen in één blok stoppen is een blok met twee keer
 * zoveel instellingen waarvan de helft niets doet.
 *
 * WAT HIER BEWUST NIET GEBEURT: een transform of `translate` op een kei met
 * een venster van Mymmo Forms erin. Beide maken van de kei het referentiekader
 * voor `position: fixed`, en dan zit het venster in de kei gevangen. Mymmo
 * Forms hangt een open venster sinds 1.17.25 zelf onder <body>, maar een kei
 * met een `.mymmo-modal` erin krijgt hier toch `mymmo-kei--stil`: geen zweven,
 * geen parallax. Zelfde regel als het script van de kaartenstapel.
 *
 * DE INDEX VAN EEN KEI WORDT HIER GETELD (automatische vorm, vertraging van
 * het zweven, links/rechts op mobiel). De wolk rendert haar kinderen zelf en
 * zet onderweg een teller; zelfde reden als in class-blocks.php -- CSS levert
 * geen getal op dat je kan gebruiken.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Keien {

    public const WOLK   = 'mymmo/keien';
    public const KEI    = 'mymmo/kei';
    public const KEITJE = 'mymmo/keitje';

    /** Waar de tekeningen uit de huisstijl staan (zie mymmo_cards_thingies()). */
    public const TEKENINGEN_URL = MYMMO_CARDS_THINGIES_URL;

    /** Hoeveel organische vormen er zijn (zie mymmo-keien.css). */
    public const VORMEN = 4;

    /** Teller tijdens het renderen van één wolk. -1 = er rendert geen wolk. */
    private static int $kei_index = -1;
    private static int $keitje_index = -1;
    /** Of de keien van de wolk die nu rendert ademen. */
    private static bool $ademen = true;

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
    }

    /**
     * De tekeningen die de keuzelijst aanbiedt. Dezelfde set als de stappen van
     * Mymmo Forms gebruiken (voorbeelden/gebouwkenmerken.html). De bestandsnamen
     * zijn overgenomen van wat live op syndicoach.be geladen wordt -- let op
     * `vuilniishok` met een dubbele i: dat is de echte bestandsnaam.
     *
     * Een eigen afbeelding (mediabibliotheek of URL) kan altijd; dit lijstje is
     * er enkel zodat niemand een URL moet opzoeken.
     *
     * @return array<string,string> slug => label
     */
    public static function tekeningen(): array {
        // De lijst zelf staat in helpers.php: het zijn de iconen van de hele
        // plugin, niet enkel die van de keien.
        return mymmo_cards_thingies();
    }

    /**
     * De VORMEN van een grote kei: een organisch vierkant, als SVG-pad in een
     * vlak van 100x100 dat meerekt met de kei (preserveAspectRatio="none").
     *
     * Waarom een pad en geen border-radius: border-radius rondt enkel af, de
     * hoeken blijven 90 graden. Hier liggen ze tussen ~82 en ~98 graden, elke
     * hoek met een eigen afronding, en de zijden bollen licht. Twee standen per
     * vorm met exact dezelfde commando's (M, dan 4x C + Q), zodat de kei kan
     * "ademen" van de ene naar de andere.
     *
     * Gegenereerd, niet met de hand getypt: hoekpunten, afrondingen en
     * bollingen per vorm, met de hoeken nagerekend. Pas je er een aan, houd dan
     * de volgorde van de commando's gelijk tussen de twee standen -- anders
     * springt het ademen in plaats van te golven.
     *
     * Dit is de ENIGE bron: de editor krijgt ze via wp_localize_script.
     *
     * @return array<int,array{0:string,1:string}>
     */
    public static function kei_paden(): array {
        return [
            1 => ['M 21.9 7.6 C 44.3 2.7 66.4 0.7 88 1.8 Q 97 1 96.8 10 C 98.8 30.9 98.4 52.3 95.5 74 Q 95 96 73 95.1 C 52.5 97.7 32.5 96.8 13 92.5 Q 1 92 1.7 80 C 0.8 61.8 1.9 43.5 5 25 Q 6 9 21.9 7.6 Z', 'M 15 4.5 C 36.9 3.5 58.9 4.4 81 7.4 Q 95 8 95.5 22 C 99.6 39.9 100.3 57.9 97.4 76 Q 98 93 81 93.9 C 61.8 97.5 42.4 98.5 23 97 Q 5 98 4.6 80 C 1.2 58.5 0.7 37.2 3.3 16 Q 3 4 15 4.5 Z'],
            2 => ['M 19 3.6 C 37.8 2.2 56.8 3.3 76 6.9 Q 96 8 96.7 28 C 100.3 47.1 100.9 65.8 98.6 84 Q 99 96 87 95.4 C 64.4 96.2 41.7 95.1 19 91.9 Q 1 91 2.6 73.1 C 1 52.5 2.8 32.5 8.1 13 Q 9 3 19 3.6 Z', 'M 18 7 C 38.2 2.1 58.5 0.8 79 2.9 Q 93 2 93.8 16 C 96.8 34.8 97.9 53.8 97 73 Q 98 91 80.1 92.4 C 59.6 97 39.3 98.6 19 97.1 Q 8 98 7.4 87 C 3.7 66 2.5 44.6 3.8 23 Q 3 8 18 7 Z'],
            3 => ['M 22 4.3 C 41.7 3.6 61.4 5 81 8.3 Q 92 9 92.9 20 C 98 40.7 99.7 61.4 97.8 82 Q 99 97 84 96.2 C 61 98 38 96.7 15 92.5 Q 6 92 5.6 83 C 2.2 63.1 1.3 43.1 2.9 23 Q 2 3 22 4.3 Z', 'M 20 6.2 C 40.4 2.1 60.7 1 81 2.9 Q 98 2 97.1 19 C 97.9 41.1 96.7 63.1 93.5 85 Q 93 95 83 95.3 C 60.7 98.6 38.3 99.3 16 97.5 Q 1 98 1.8 83 C -0.5 62.5 0.6 41.8 5.2 21 Q 6 7 20 6.2 Z'],
            4 => ['M 16 7.2 C 38 2.4 60 1 82 3.1 Q 99 2 97.7 19 C 98.1 40.7 96.4 62.4 92.8 84 Q 92 94 82 94.4 C 62.5 98.3 42.9 99.2 23 97.1 Q 2 98 2.5 77 C 0.4 57.9 0.8 38.9 3.7 20 Q 4 8 16 7.2 Z', 'M 19 3.2 C 40.4 2 61.7 3.4 83 7.3 Q 94 8 94.6 19 C 98.8 39.3 99.9 59.7 98.1 80 Q 99 96 83 95.5 C 62.4 96.8 41.7 96.1 21 93.5 Q 7 93 6.1 79 C 1.3 59.3 -0 39.6 2.2 20 Q 1 2 19 3.2 Z'],
        ];
    }

    /** Hoe sterk de keien zweven: sleutel => [label, amplitude px, duur s]. */
    public static function zweefstanden(): array {
        return [
            'geen'    => ['Niet', 0, 7],
            'zacht'   => ['Zacht', 4, 9],
            'speels'  => ['Speels', 8, 7.5],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-keien', MYMMO_CARDS_URL . 'assets/css/mymmo-keien.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);
        wp_register_style('mymmo-keien-editor', MYMMO_CARDS_URL . 'assets/css/mymmo-keien-editor.css', ['mymmo-keien'], MYMMO_CARDS_VERSION);

        // Enkel op de PAGINA (view_script): in de editor beweegt er niets, want
        // een keitje dat onder je muis wegschuift is niet te selecteren.
        wp_register_script('mymmo-keien', MYMMO_CARDS_URL . 'assets/js/mymmo-keien.js', [], MYMMO_CARDS_VERSION, true);

        wp_register_script(
            'mymmo-keien-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-keien-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-media-utils'],
            MYMMO_CARDS_VERSION,
            true
        );

        $tekeningen = [];
        foreach (self::tekeningen() as $slug => $label) {
            $tekeningen[] = ['value' => self::TEKENINGEN_URL . $slug . '.svg', 'label' => $label, 'slug' => $slug];
        }
        $zweven = [];
        foreach (self::zweefstanden() as $sleutel => $rij) {
            $zweven[] = ['value' => $sleutel, 'label' => $rij[0]];
        }
        $opvullingen = [];
        foreach (mymmo_cards_opvullingen() as $sleutel => $label) {
            $opvullingen[] = ['value' => $sleutel, 'label' => $label];
        }

        wp_localize_script('mymmo-keien-editor', 'MymmoKeien', [
            'tekeningen'  => $tekeningen,
            'zweven'      => $zweven,
            'opvullingen' => $opvullingen,
            'vormen'      => self::VORMEN,
            'paden'       => self::kei_paden(),
        ]);

        register_block_type(self::WOLK, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-keien-editor',
            'editor_style'    => 'mymmo-keien-editor',
            'style'           => 'mymmo-keien',
            'view_script'     => 'mymmo-keien',
            'attributes'      => self::attributen_wolk(),
            'render_callback' => [self::class, 'render_wolk'],
        ]);

        register_block_type(self::KEI, [
            'api_version'     => 2,
            'parent'          => [self::WOLK],
            'attributes'      => self::attributen_kei(),
            'render_callback' => [self::class, 'render_kei'],
        ]);

        register_block_type(self::KEITJE, [
            'api_version'     => 2,
            'parent'          => [self::WOLK],
            'attributes'      => self::attributen_keitje(),
            'render_callback' => [self::class, 'render_keitje'],
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-keien-editor.js (geen bouwstap, dus
     * geen block.json dat beide kanten voedt). De namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    private static function attributen_wolk(): array {
        return [
            'align'         => ['type' => 'string', 'default' => 'full'],
            // De breedte van een kei op 100%. Een kei kan daar zelf van afwijken.
            'keiBreedte'    => ['type' => 'number', 'default' => 380],
            // Hoe breed de hele compositie (keien + keitjes) maximaal wordt.
            'breedte'       => ['type' => 'number', 'default' => 1200],
            // Hoeveel twee buren over elkaar schuiven.
            'overlap'       => ['type' => 'number', 'default' => 60],
            // Lucht boven en onder de keien: daar zweven de keitjes in.
            'ruimte'        => ['type' => 'number', 'default' => 100],
            'ruimteMobiel'  => ['type' => 'number', 'default' => 90],
            'zweven'        => ['type' => 'string', 'default' => 'zacht'],
            // De vorm van een kei golft traag mee, alsof hij ademt.
            'ademen'        => ['type' => 'boolean', 'default' => true],
            // Vermenigvuldigt de uitslag van ELK keitje. 0 = geen parallax.
            'parallax'      => ['type' => 'number', 'default' => 100],
            // Rand van ALLE keien; een kei kan er zelf van afwijken.
            'keiRand'       => ['type' => 'string', 'default' => ''],
            'keiRandDikte'  => ['type' => 'number', 'default' => 2],
            // Hoe groot de keitjes op een telefoon zijn, in % van desktop.
            'keitjeMobiel'  => ['type' => 'number', 'default' => 70],
            // Op een telefoon staan de keien ONDER elkaar: een eigen breedte en
            // een eigen (verticale) overlap.
            'keiBreedteMobiel' => ['type' => 'number', 'default' => 300],
            'overlapMobiel'    => ['type' => 'number', 'default' => 30],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_kei(): array {
        return [
            'achtergrond' => ['type' => 'string', 'default' => ''],
            // 0 = automatisch (volgt de plaats in de wolk), 1..4 = een vaste vorm.
            'vorm'        => ['type' => 'number', 'default' => 0],
            'schaal'      => ['type' => 'number', 'default' => 100],
            'draai'       => ['type' => 'number', 'default' => 0],
            // Hoger of lager dan zijn buren. Enkel naast elkaar; gestapeld op
            // een telefoon betekent het niets.
            'hoogte'      => ['type' => 'number', 'default' => 0],
            /*
             * DE TELEFOONSTAND. Bewust ZONDER standaard: niet ingevuld = volgt
             * de computer (of de automatische zigzag). Een standaardwaarde zou
             * betekenen dat een aanpassing aan de computerstand de telefoon
             * niet meer meeneemt, zonder dat je ziet waarom.
             */
            'schaalM'     => ['type' => 'number'],
            'draaiM'      => ['type' => 'number'],
            'xM'          => ['type' => 'number'],
            'hoogteM'     => ['type' => 'number'],
            'opvulling'   => ['type' => 'string', 'default' => 'normaal'],
            // Leeg = de rand van de wolk. Dikte -1 = die van de wolk.
            'rand'        => ['type' => 'string', 'default' => ''],
            'randDikte'   => ['type' => 'number', 'default' => -1],
            // Parallax van de kei zelf. Standaard stil: de grote keien dragen de
            // tekst, en tekst die wegschuift leest slecht.
            'snelheid'    => ['type' => 'number', 'default' => 0],
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function attributen_keitje(): array {
        return [
            'beeld'       => ['type' => 'string', 'default' => ''],
            'achtergrond' => ['type' => 'string', 'default' => ''],
            'rand'        => ['type' => 'boolean', 'default' => true],
            'maat'        => ['type' => 'number', 'default' => 80],
            // Het MIDDEN van het keitje, in % van de wolk. Mag iets buiten 0-100:
            // een keitje dat half over de rand hangt, hoort bij het effect.
            'x'           => ['type' => 'number', 'default' => 50],
            'y'           => ['type' => 'number', 'default' => 10],
            'draai'       => ['type' => 'number', 'default' => 0],
            'vorm'        => ['type' => 'number', 'default' => 0],
            // NIET MEER GEBRUIKT sinds 1.8.2: het tempo volgt uit maat en laag
            // (zie render_keitje). Blijft geregistreerd zodat een bestaand
            // blok zijn waarde niet als ongeldig ziet.
            'snelheid'    => ['type' => 'number', 'default' => 30],
            'laag'        => ['type' => 'string', 'default' => 'achter'],
            'mobiel'      => ['type' => 'boolean', 'default' => true],
            // Telefoonstand, zonder standaard (zie attributen_kei()).
            'xM'          => ['type' => 'number'],
            'yM'          => ['type' => 'number'],
            'maatM'       => ['type' => 'number'],
            'draaiM'      => ['type' => 'number'],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render_wolk($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $vorige_kei    = self::$kei_index;
        $vorige_keitje = self::$keitje_index;
        $vorig_ademen  = self::$ademen;
        self::$kei_index    = 0;
        self::$keitje_index = 0;
        self::$ademen       = self::vlag($attrs, 'ademen', true);

        $kinderen = [];
        if (is_object($block) && isset($block->inner_blocks)) {
            foreach ($block->inner_blocks as $kind) {
                $html = (string) $kind->render();
                if (trim($html) !== '') {
                    $kinderen[] = $html;
                }
            }
        }

        self::$kei_index    = $vorige_kei;
        self::$keitje_index = $vorige_keitje;
        self::$ademen       = $vorig_ademen;

        if ($kinderen === [] && trim($content) !== '') {
            $kinderen[] = $content;
        }
        if ($kinderen === []) {
            return '';
        }

        $standen = self::zweefstanden();
        $zweven  = mymmo_cards_keuze((string) ($attrs['zweven'] ?? ''), $standen, 'zacht');

        $stijl = [
            '--mk-kei-breedte:' . mymmo_cards_px($attrs['keiBreedte'] ?? null, 380, 200, 640) . 'px',
            '--mk-max:' . mymmo_cards_px($attrs['breedte'] ?? null, 1200, 480, 2400) . 'px',
            '--mk-overlap:' . mymmo_cards_px($attrs['overlap'] ?? null, 60, 0, 240) . 'px',
            '--mk-ruimte:' . mymmo_cards_px($attrs['ruimte'] ?? null, 100, 0, 400) . 'px',
            '--mk-ruimte-m:' . mymmo_cards_px($attrs['ruimteMobiel'] ?? null, 90, 0, 400) . 'px',
            '--mk-zweef:' . $standen[$zweven][1] . 'px',
            '--mk-zweef-duur:' . $standen[$zweven][2] . 's',
            '--mk-keitje-m:' . (mymmo_cards_px($attrs['keitjeMobiel'] ?? null, 70, 30, 150) / 100),
            '--mk-kei-breedte-m:' . mymmo_cards_px($attrs['keiBreedteMobiel'] ?? null, 300, 140, 600) . 'px',
            '--mk-overlap-m:' . mymmo_cards_px($attrs['overlapMobiel'] ?? null, 30, 0, 240) . 'px',
        ];

        $rand = mymmo_cards_color((string) ($attrs['keiRand'] ?? ''));
        if ($rand !== '') {
            $stijl[] = '--mk-kei-rand:' . $rand;
            // De dikte komt uit de huisstijl (sinds 1.9.1). keiRandDikte blijft
            // geregistreerd zodat oudere wolken geldig blijven, maar telt niet meer.
            $stijl[] = '--mk-kei-rand-dikte:var(--mymmo-rand)';
        }

        $klassen = ['mymmo-keien'];
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok moet zijn uitlijnklasse zelf zetten -- zie
            // render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }
        if ($zweven === 'geen') {
            $klassen[] = 'mymmo-keien--stil';
        }
        if (self::vlag($attrs, 'ademen', true)) {
            $klassen[] = 'mymmo-keien--adem';
        }

        $parallax = mymmo_cards_px($attrs['parallax'] ?? null, 100, 0, 200);

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . ' data-mymmo-keien'
            . ' data-parallax="' . esc_attr((string) ($parallax / 100)) . '">'
            // De KERN is zo groot als de keien samen, en de plaats van een keitje
            // rekent daartegen. Rekende ze tegen de volle breedte, dan lag een
            // keitje op "5%" op een breed scherm ver van de keien weg -- een
            // ring rond de pagina in plaats van een wolk rond de keien.
            . '<div class="mymmo-keien-kern">' . implode('', $kinderen) . '</div>'
            . '</div>';
    }

    /** @param array<string,mixed> $attrs */
    public static function render_kei($attrs = [], string $content = '', $block = null): string {
        if (!mymmo_cards_heeft_inhoud($content)) {
            return '';
        }
        $attrs = is_array($attrs) ? $attrs : [];

        $index = max(0, self::$kei_index);
        if (self::$kei_index >= 0) {
            self::$kei_index++;
        }

        $vorm = mymmo_cards_px($attrs['vorm'] ?? null, 0, 0, self::VORMEN);
        if ($vorm === 0) {
            $vorm = ($index % self::VORMEN) + 1;
        }

        $opvulling = mymmo_cards_keuze((string) ($attrs['opvulling'] ?? ''), mymmo_cards_opvullingen(), 'normaal');

        $klassen = [
            'mymmo-kei',
            'mymmo-kei--vorm-' . $vorm,
            'mymmo-kei--pad-' . $opvulling,
            $index % 2 === 1 ? 'mymmo-kei--even' : 'mymmo-kei--oneven',
        ];

        $stijl = [
            '--mk-schaal:' . (mymmo_cards_px($attrs['schaal'] ?? null, 100, 50, 160) / 100),
            '--mk-draai:' . mymmo_cards_px($attrs['draai'] ?? null, 0, -25, 25) . 'deg',
            '--mk-hoogte:' . mymmo_cards_px($attrs['hoogte'] ?? null, 0, -240, 240) . 'px',
            // Niet alle keien in de maat: elk zijn eigen plek in de golf.
            '--mk-vertraging:' . (-1.7 * $index) . 's',
        ];
        $stijl = array_merge($stijl, self::telefoon($attrs, [
            'schaalM' => ['--mk-schaal-m', 50, 160, ''],
            'draaiM'  => ['--mk-draai-m', -25, 25, 'deg'],
            'xM'      => ['--mk-x-m', -40, 40, '%'],
            'hoogteM' => ['--mk-hoogte-m', -240, 240, 'px'],
        ]));

        $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-kei-bg:' . $bg;
        }

        // Een eigen rand wint van die van de wolk. De DIKTE komt uit de
        // huisstijl (sinds 1.9.1); randDikte zegt enkel nog: zoals de wolk (-1),
        // geen rand (0) of wel een rand (> 0). Oudere waarden (3, 6, 12) worden
        // "wel". Een kleur zonder keuze krijgt een rand: anders kies je een
        // kleur en gebeurt er niets.
        $rand  = mymmo_cards_color((string) ($attrs['rand'] ?? ''));
        $dikte = mymmo_cards_px($attrs['randDikte'] ?? null, -1, -1, 12);
        if ($rand !== '') {
            $stijl[] = '--mk-kei-rand:' . $rand;
        }
        if ($dikte === 0) {
            $stijl[] = '--mk-kei-rand-dikte:0px';
        } elseif ($rand !== '' || $dikte > 0) {
            $stijl[] = '--mk-kei-rand-dikte:var(--mymmo-rand)';
        }

        $snelheid = mymmo_cards_px($attrs['snelheid'] ?? null, 0, -100, 100);
        $stil     = strpos($content, 'mymmo-modal') !== false;
        if ($stil) {
            $klassen[] = 'mymmo-kei--stil';
        }

        $data = (!$stil && $snelheid !== 0) ? ' data-snelheid="' . $snelheid . '"' : '';

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . $data . '>'
            . '<div class="mymmo-kei-vorm">' . self::vlak($vorm, $index, self::$ademen && !$stil) . $content . '</div>'
            . '</div>';
    }

    /**
     * Het vlak ACHTER de inhoud van een kei: vulling = --mk-kei-bg, lijn =
     * --mk-kei-rand in --mk-kei-rand-dikte (vaste pixels dankzij
     * vector-effect, ook al rekt het vlak mee).
     *
     * Geen <use>, geen <defs>: op syndicoach.be raakte de markup rond een
     * inline SVG met een use-element beschadigd (zie de stappen van Mymmo
     * Forms). Een pad met een animate erin is het minimum.
     *
     * Het ademen is SMIL (<animate>) en geen CSS: `d` animeren in CSS kan
     * Safari niet. mymmo-keien.js haalt de animate weg voor wie beweging uit
     * heeft staan -- SMIL luistert niet naar prefers-reduced-motion.
     */
    private static function vlak(int $vorm, int $index, bool $ademen): string {
        $paden = self::kei_paden();
        $pad   = $paden[$vorm] ?? $paden[1];

        $adem = '';
        if ($ademen) {
            $adem = '<animate attributeName="d" dur="14s" repeatCount="indefinite"'
                . ' begin="' . (-3.1 * $index) . 's" calcMode="spline" keyTimes="0;0.5;1"'
                . ' keySplines="0.45 0 0.55 1;0.45 0 0.55 1"'
                . ' values="' . $pad[0] . ';' . $pad[1] . ';' . $pad[0] . '"/>';
        }

        return '<svg class="mymmo-kei-vlak" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
            . '<path d="' . $pad[0] . '" vector-effect="non-scaling-stroke">' . $adem . '</path>'
            . '</svg>';
    }

    /** @param array<string,mixed> $attrs */
    public static function render_keitje($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];

        $index = max(0, self::$keitje_index);
        if (self::$keitje_index >= 0) {
            self::$keitje_index++;
        }

        $vorm = mymmo_cards_px($attrs['vorm'] ?? null, 0, 0, self::VORMEN);
        if ($vorm === 0) {
            $vorm = (($index + 2) % self::VORMEN) + 1;
        }

        $laag    = ((string) ($attrs['laag'] ?? 'achter')) === 'voor' ? 'voor' : 'achter';
        $klassen = ['mymmo-keitje', 'mymmo-keitje--vorm-' . $vorm, 'mymmo-keitje--' . $laag];
        if (!self::vlag($attrs, 'rand', true)) {
            $klassen[] = 'mymmo-keitje--kaal';
        }
        if (!self::vlag($attrs, 'mobiel', true)) {
            $klassen[] = 'mymmo-keitje--niet-mobiel';
        }

        $stijl = [
            '--mk-x:' . mymmo_cards_px($attrs['x'] ?? null, 50, -10, 110) . '%',
            '--mk-y:' . mymmo_cards_px($attrs['y'] ?? null, 10, -30, 130) . '%',
            '--mk-maat:' . mymmo_cards_px($attrs['maat'] ?? null, 80, 24, 260) . 'px',
            '--mk-draai:' . mymmo_cards_px($attrs['draai'] ?? null, 0, -45, 45) . 'deg',
            '--mk-vertraging:' . (-1.3 * $index) . 's',
            // Elk keitje een eigen tempo: vier tempo's die om de beurt terugkomen.
            '--mk-tempo:' . (7 + ($index % 4) * 1.1) . 's',
        ];
        $stijl = array_merge($stijl, self::telefoon($attrs, [
            'xM'     => ['--mk-x-m', -10, 110, '%'],
            'yM'     => ['--mk-y-m', -30, 130, '%'],
            'maatM'  => ['--mk-maat-m', 16, 260, 'px'],
            'draaiM' => ['--mk-draai-m', -45, 45, 'deg'],
        ]));

        $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
        if ($bg !== '') {
            $stijl[] = '--mk-keitje-bg:' . $bg;
        }

        /*
         * HET TEMPO IS AFGELEID, niet ingesteld: wat groot is en vooraan ligt,
         * voelt dichterbij en schuift dus sneller; klein en achteraan trager.
         * Zo klopt de diepte altijd met wat je ziet -- een klein keitje achter
         * een kei dat harder gaat dan een groot ervoor, leest als een fout.
         * 100 = het snelste (groot, vooraan); zie mymmo-keien.js voor de uitslag.
         */
        $maat     = mymmo_cards_px($attrs['maat'] ?? null, 80, 24, 260);
        $snelheid = (int) round(100 * ($laag === 'voor' ? 1.0 : 0.6) * max(0.55, min(1.35, $maat / 80)) / 1.35);
        $data     = ' data-snelheid="' . max(1, $snelheid) . '"';

        // Een keitje zonder tekening is gewoon een steentje -- ook dat mag, het
        // vult de wolk op zonder aandacht te trekken.
        $beeld = mymmo_cards_afbeelding((string) ($attrs['beeld'] ?? ''));
        $img   = '';
        if ($beeld !== '') {
            // Meteen laden en de lazyload-plugins overslaan: Smush herschrijft
            // src naar data-src, en een keitje dat pas verschijnt als het al
            // voorbij geschoven is, ziet niemand. Zelfde vlaggen als de stappen
            // van Mymmo Forms.
            $img = '<img class="skip-lazy no-lazyload" data-no-lazy="1" data-skip-lazy="1"'
                . ' src="' . esc_url($beeld) . '" alt="" width="400" height="400" loading="eager" decoding="async">';
        }

        return '<div ' . self::wikkel(['class' => implode(' ', $klassen), 'style' => implode(';', $stijl)]) . $data . ' aria-hidden="true">'
            . '<div class="mymmo-keitje-vorm">' . $img . '</div>'
            . '</div>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gereedschap
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De telefoonwaarden die INGEVULD zijn, als CSS-variabelen. Wat ontbreekt,
     * komt er niet in: dan valt de stylesheet terug op de computerstand.
     * Eenheid '' = een percentage dat als factor meegaat (schaal 110 -> 1.1).
     *
     * @param array<string,mixed>                            $attrs
     * @param array<string,array{0:string,1:int,2:int,3:string}> $velden
     * @return array<int,string>
     */
    private static function telefoon(array $attrs, array $velden): array {
        $uit = [];
        foreach ($velden as $sleutel => $v) {
            if (!array_key_exists($sleutel, $attrs) || !is_numeric($attrs[$sleutel])) {
                continue;
            }
            $w     = max($v[1], min($v[2], (int) round((float) $attrs[$sleutel])));
            $uit[] = $v[0] . ':' . ($v[3] === '' ? ($w / 100) : $w . $v[3]);
        }

        return $uit;
    }

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

        wp_enqueue_style('mymmo-keien');
        wp_enqueue_style('mymmo-keien-editor');
    }
}
