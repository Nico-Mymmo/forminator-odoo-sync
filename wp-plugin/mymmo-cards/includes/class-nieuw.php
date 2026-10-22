<?php
/**
 * WAT ER NIEUW IS, EN NU BINNENHALEN -- in de editor zelf.
 *
 * Wie op de site werkt, ziet niet wanneer er een nieuwe versie van deze
 * plugin binnenkomt: het bijwerken gebeurt in de achtergrond (zie
 * class-updates.php). Daarom, in de blok-editor:
 *
 *   1. STAAT ER EEN NIEUWE VERSIE KLAAR die hier nog niet draait, dan zegt een
 *      melding dat, met een knop "Nu binnenhalen". Die werkt de plugin meteen
 *      bij (Mymmo_Cards_Updates::nu_bijwerken()) in plaats van te wachten tot
 *      de site zelf kijkt.
 *   2. IS ER IETS NIEUWS dat wie op de site werkt moet weten, dan staat het een
 *      keer in een melding, in gewone taal: wat het is en waar je het vindt.
 *      Weggeklikt = gezien, per gebruiker.
 *
 * De teksten van 2 staan in NIEUWS: bij elke versie met iets wat een
 * redacteur ziet, een zin erbij (zie het regelboek, "Van idee tot op de site").
 *
 * Bestand onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Nieuw {

    /**
     * Versie => wat er nieuw is, voor wie op de site werkt. Nieuwste eerst.
     * Gewone taal: wat het is en waar je het vindt, geen techniek.
     */
    private const NIEUWS = [
        '1.16.0' => 'Nieuw blok: Productfeature-header. De header bovenaan een pagina, uit een feature van de Operations Manager. Blok toevoegen, categorie Mymmo, Productfeature-header. Rechts kies je de indeling: gecentreerd met het beeld eronder, tekst en beeld naast elkaar, of een gekleurd vlak met swirl. De knoppen zet je zelf in het blok.',
        '1.15.1' => 'Productfeature: de titel op de pagina is voortaan de Header uit de Operations Manager (een uitgeschreven titel). Staat die leeg, dan blijft het de gewone titel. Is de keuzelijst leeg, dan zegt het blok nu wat je in de Operations Manager moet doen.',
        '1.15.0' => 'Nieuw blok: Productfeature. Een feature uit de Operations Manager, met het beeld links of rechts. Blok toevoegen, categorie Mymmo, Productfeature. Rechts kies je de feature en wat je toont (label, titel, uitleg, USP\'s, knop). De tekst pas je aan in de Operations Manager; met Naar de sites sturen komt ze op elke pagina tegelijk.',
        '1.14.1' => 'Veelgestelde vragen: de vragen zijn nu standaard vetgedrukt en het vlak standaard lichtblauw, zoals op de ontwerpen. Een vraag uit de bibliotheek draagt in de editor een duidelijk label; dat label komt niet op de site.',
        '1.14.0' => 'Nieuw blok: Veelgestelde vragen. Vragen die openklappen, met de eerste al open. Blok toevoegen, categorie Mymmo, Veelgestelde vragen. Rechts kies je vragen uit de bibliotheek (per thema), of je typt een eigen vraag. De bibliotheek vind je links in het menu onder Veelgestelde vragen.',
        '1.13.3' => 'Afgeronde hoeken op een video, een ingesloten film (Vimeo, YouTube) of een afbeelding: klik het blok aan en kies rechts, onder Rand, meteen Klein of Groot. Die keuze zat verstopt achter het plusje van dat paneel.',
        '1.13.2' => 'Kostencalculator: het vak kan nu ook wit. Klik de calculator aan, open rechts Uitzicht en kies Wit bij Achtergrond van de calculator.',
        '1.13.0' => 'Nieuw blok: Kostencalculator. De bezoeker stelt het aantal kavels in en ziet wat het per jaar kost voor het gebouw. Blok toevoegen, categorie Mymmo, Kostencalculator. De prijzen pas je rechts aan, onder Prijzen.',
        '1.12.0' => 'Stappen: elke stap kan nu een illustratie op de achtergrond krijgen, zoals een kaart van de kaartenstapel. Klik een stap aan en open rechts Illustratie op de achtergrond.',
        '1.11.0' => 'Nieuw blok: Getuigenissen. Klanten aan het woord, met foto, naast elkaar. Blok toevoegen, categorie Mymmo, Getuigenissen.',
        '1.10.2' => 'Hier zie je voortaan wat er nieuw is in de Mymmo-blokken. Staat er een nieuwe versie klaar, dan haal je die hier meteen binnen met één klik.',
        '1.10.1' => 'Afgeronde hoeken: klik een blok met een achtergrond aan (een groep of kolommen) en kies rechts, onder Rand, de afronding Klein of Groot.',
    ];

    /** Hoeveel berichten er hoogstens tegelijk staan. */
    private const MAX = 3;

    /** De laatste versie waarvan een gebruiker het nieuws wegklikte. */
    private const GEZIEN = 'mymmo_cards_nieuws_gezien';

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_editor_assets', [self::class, 'editor']);
        add_action('rest_api_init', [self::class, 'routes']);
    }

    public static function register(): void {
        wp_register_script(
            'mymmo-cards-nieuw',
            MYMMO_CARDS_URL . 'assets/js/mymmo-nieuw-editor.js',
            ['wp-api-fetch', 'wp-data', 'wp-dom-ready', 'wp-notices'],
            MYMMO_CARDS_VERSION,
            true
        );
    }

    public static function editor(): void {
        if (current_user_can('edit_posts')) {
            wp_enqueue_script('mymmo-cards-nieuw');
        }
    }

    public static function routes(): void {
        $mag = static function (): bool {
            return current_user_can('edit_posts');
        };

        register_rest_route('mymmo-cards/v1', '/editor', [
            'methods'             => 'GET',
            'permission_callback' => $mag,
            'callback'            => [self::class, 'stand'],
        ]);

        register_rest_route('mymmo-cards/v1', '/binnenhalen', [
            'methods'             => 'POST',
            'permission_callback' => $mag,
            'callback'            => static function (): WP_REST_Response {
                return new WP_REST_Response(Mymmo_Cards_Updates::nu_bijwerken(), 200);
            },
        ]);

        register_rest_route('mymmo-cards/v1', '/gezien', [
            'methods'             => 'POST',
            'permission_callback' => $mag,
            'callback'            => static function (): WP_REST_Response {
                update_user_meta(get_current_user_id(), self::GEZIEN, MYMMO_CARDS_VERSION);
                return new WP_REST_Response(['gezien' => MYMMO_CARDS_VERSION], 200);
            },
        ]);
    }

    /** Wat de editor moet tonen: een nieuwe versie klaar, en het nieuws. */
    public static function stand(): WP_REST_Response {
        $release = Mymmo_Cards_Updates::uit() ? null : Mymmo_Cards_Updates::release();
        $klaar = $release !== null && version_compare($release['versie'], MYMMO_CARDS_VERSION, '>');

        $gezien = (string) get_user_meta(get_current_user_id(), self::GEZIEN, true);
        $nieuws = [];
        foreach (self::NIEUWS as $versie => $tekst) {
            if (version_compare($versie, MYMMO_CARDS_VERSION, '>')) {
                continue;
            }
            if ($gezien !== '' && !version_compare($versie, $gezien, '>')) {
                continue;
            }
            $nieuws[] = $tekst;
            if (count($nieuws) >= self::MAX) {
                break;
            }
        }

        return new WP_REST_Response(['klaar' => $klaar, 'nieuws' => $nieuws], 200);
    }
}
