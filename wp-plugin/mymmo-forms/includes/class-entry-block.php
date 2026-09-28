<?php
/**
 * Het blok "Mymmo ingang" voor de blok-editor.
 *
 * Je kiest een INGANG (Instellingen → Mymmo Forms → Ingangen) en zet die waar je
 * hem wil hebben: in een tekstkolom, in een kaart, waar dan ook. Wat die ingang
 * is -- een knop, een callout, of een klasse-haak -- staat bij de ingang zelf en
 * niet in de pagina. Zo kan een knop later een callout worden zonder dat iemand
 * de pagina's langsgaat waar hij op staat.
 *
 * TWEE instellingen per plaatsing, en verder niets: KAAL of niet, en met of
 * zonder het witte VAK.
 *
 * Kaal (`chrome="no"`) rendert enkel het uitgelichte onderdeel en de knop:
 * zonder kaartje, zonder titel, zonder achtergrond, zonder uitbraak uit de
 * inhoudskolom. Dat is wat je wil als de ingang IN iets staat dat zelf al een
 * kaart is -- een kaart van Mymmo Cards bijvoorbeeld. De titel is dan een
 * gewoon kopblok van de pagina en heeft dus vanzelf de letter van het thema; de
 * achtergrond is die van de kaart.
 *
 * Het witte VAK rond het onderdeel blijft daarbij staan (wit, dunne rand,
 * hoeken, schaduw, opvulling): dat hoort bij het onderdeel en niet bij de
 * chrome van de callout -- het is wat de bediening laat opvallen op een
 * gekleurd vlak. Zonder vak (`chrome="bare"`) is voor een ingang die al op een
 * wit vlak staat; twee witte vlakken op elkaar leest als een fout.
 *
 * Bracht de ingang dat allemaal zelf mee, dan moest elk van die eigenschappen
 * met de hand gelijkgezet worden aan iets dat uit het THEMA komt -- en die
 * waarden kent de plugin niet. Dat kostte eerder een instelling per eigenschap
 * (lettergrootte, dikte, kleur, opvulling, hoeken), telkens met een release
 * erbij, zonder dat het ooit helemaal klopte.
 *
 * SERVER-SIDE GERENDERD, zoals het blok "Mymmo formulier": `save` geeft null,
 * dus er staat geen HTML van de ingang in de pagina-inhoud.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Entry_Block {

    private const NAAM = 'mymmo/ingang';

    public static function init(): void {
        add_action('init', [self::class, 'register']);
    }

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_script(
            'mymmo-forms-entry-block',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-entry-block.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-server-side-render'],
            MYMMO_FORMS_VERSION,
            true
        );

        // De ingangen gaan mee naar de editor. Niet via de REST-API ophalen: het
        // zijn er een handvol, ze staan al op de server als de editor laadt, en
        // een extra verzoek kan mislukken -- dan sta je naar een lege
        // keuzelijst te kijken zonder te weten waarom.
        $keuzes = [];
        foreach (Mymmo_Forms_Entrypoints::all() as $ingang) {
            $keuzes[] = [
                'id'    => $ingang['id'],
                'name'  => $ingang['name'],
                'soort' => $ingang['soort'],
            ];
        }

        wp_localize_script('mymmo-forms-entry-block', 'MymmoFormsEntryBlock', [
            'ingangen'    => $keuzes,
            'settingsUrl' => admin_url('options-general.php?page=mymmo-forms&tab=ingangen'),
        ]);

        register_block_type(self::NAAM, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-forms-entry-block',
            'attributes'      => [
                'ingang' => ['type' => 'string', 'default' => ''],
                'kaal'   => ['type' => 'boolean', 'default' => false],
                // Het witte vak rond het onderdeel. Standaard AAN: dat is wat
                // de bediening laat opvallen op een gekleurde kaart. Uit voor
                // een ingang die al op een wit vlak staat.
                'vak'    => ['type' => 'boolean', 'default' => true],
            ],
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /**
     * @param array<string,mixed> $attributen
     */
    public static function render($attributen = []): string {
        $id = sanitize_title((string) ($attributen['ingang'] ?? ''));

        if ($id === '') {
            return current_user_can('edit_posts')
                ? '<div class="mymmo-form-notice mymmo-form-notice--admin">Kies een ingang in de zijbalk van dit blok.</div>'
                : '';
        }

        // Via de shortcode en niet rechtstreeks via render_ingang(): daar zit de
        // afhandeling van een verdwenen ingang en het overschrijven per
        // plaatsing al in. Een tweede weg naar dezelfde render zou betekenen dat
        // die twee op een dag uit elkaar lopen.
        $kaal = !empty($attributen['kaal']);
        // `vak` ontbreekt bij een blok van voor 1.17.24; dan geldt de
        // standaard, en dat is MET vak -- precies wat zo'n plaatsing toen
        // miste.
        $vak = !array_key_exists('vak', $attributen) || !empty($attributen['vak']);

        return Mymmo_Forms_Entrypoints::shortcode([
            'id'     => $id,
            'chrome' => $kaal ? ($vak ? 'no' : 'bare') : '',
        ]);
    }
}
