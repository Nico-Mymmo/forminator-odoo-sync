<?php
/**
 * Het blok "Mymmo formulier" voor de blok-editor.
 *
 * Wat het doet: je voegt het blok in, kiest in de zijbalk een FORMULIER uit de
 * Operations Manager, en ziet het meteen in de editor zoals het op de pagina
 * komt te staan.
 *
 * Sinds 1.19 is dit de weg om een formulier gewoon op een pagina te zetten. De
 * stand "formulier op de pagina" is uit de shortcode-bouwer gehaald: die bouwer
 * is er enkel nog voor het venster, en een formulier in de tekst heeft niets
 * van wat daar staat (geen tabbladen, geen tekening, geen agenda). Wat je hier
 * kiest is dus bewust kort: welk formulier, welke taal, en of de titel erboven
 * staat. Teksten van het formulier zelf horen in de OM, waar het formulier
 * gebouwd wordt.
 *
 * Het blok kan nog altijd een bewaarde OPSTELLING tonen (`preset`). Dat is wat
 * het tot 1.18 enkel kon; bestaande blokken blijven dus werken, en een knop met
 * venster in de tekst zetten gaat nog steeds zo.
 *
 * SERVER-SIDE GERENDERD. `save` geeft null terug, dus er staat geen HTML in de
 * pagina-inhoud -- enkel `<!-- wp:mymmo/forms {"slug":"..."} /-->`. Daardoor
 * volgt de pagina vanzelf elke wijziging aan het formulier in de OM, en bestaat
 * er geen blokvalidatiefout als de opmaak wijzigt.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Block {

    private const NAAM = 'mymmo/forms';

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'editor_styles']);
        add_action('enqueue_block_editor_assets', [self::class, 'editor_data']);
    }

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_script(
            'mymmo-forms-block',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-block.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-server-side-render', 'wp-i18n'],
            MYMMO_FORMS_VERSION,
            true
        );

        register_block_type(self::NAAM, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-forms-block',
            'attributes'      => [
                'slug'   => ['type' => 'string', 'default' => ''],
                'lang'   => ['type' => 'string', 'default' => ''],
                'title'  => ['type' => 'boolean', 'default' => true],
                'preset' => ['type' => 'string', 'default' => ''],
            ],
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /**
     * De keuzelijsten voor de zijbalk.
     *
     * Pas hier en niet bij `init`: de formulierenlijst komt uit de OM, en `init`
     * draait bij ELK verzoek, ook op de voorkant. Deze haak vuurt alleen als de
     * editor opent. De lijst zelf wordt een minuut bewaard
     * (Mymmo_Forms_Api_Client), net als in de bouwer.
     *
     * Niet via de REST-API vanuit de browser: dan sta je bij een storing naar
     * een lege keuzelijst te kijken zonder te weten waarom. Hier gaat de
     * foutmelding gewoon mee.
     */
    public static function editor_data(): void {
        $formulieren = [];
        $fout = '';
        $lijst = Mymmo_Forms_Api_Client::list_forms();
        if ($lijst === null) {
            $fout = (string) Mymmo_Forms_Api_Client::last_error();
        } else {
            foreach ($lijst as $f) {
                $slug = (string) ($f['slug'] ?? '');
                if ($slug === '') {
                    continue;
                }
                $formulieren[] = [
                    'slug'      => $slug,
                    'name'      => mymmo_forms_form_label($f),
                    'languages' => array_values(array_map('strval', (array) ($f['languages'] ?? ['nl']))),
                ];
            }
        }

        $opstellingen = [];
        foreach (Mymmo_Forms_Presets::all() as $opstelling) {
            $opstellingen[] = [
                'id'    => $opstelling['id'],
                'name'  => $opstelling['name'],
                'soort' => $opstelling['soort'],
            ];
        }

        wp_localize_script('mymmo-forms-block', 'MymmoFormsBlock', [
            'forms'       => $formulieren,
            'formsError'  => $fout,
            'configured'  => mymmo_forms_is_configured(),
            'presets'     => $opstellingen,
            'settingsUrl' => admin_url('options-general.php?page=mymmo-forms'),
        ]);
    }

    /**
     * @param array<string,mixed> $attributen
     */
    public static function render($attributen = []): string {
        $slug = sanitize_title((string) ($attributen['slug'] ?? ''));

        // Een formulier rechtstreeks: dat wint van een opstelling. Wie in de
        // zijbalk een formulier kiest, bedoelt dat formulier.
        if ($slug !== '') {
            $atts = ['slug' => $slug];
            $taal = sanitize_key((string) ($attributen['lang'] ?? ''));
            if ($taal !== '') {
                $atts['lang'] = $taal;
            }
            if (array_key_exists('title', $attributen) && $attributen['title'] === false) {
                $atts['title'] = 'no';
            }
            return Mymmo_Forms_Shortcodes::render($atts);
        }

        $preset = sanitize_title((string) ($attributen['preset'] ?? ''));

        if ($preset === '') {
            // Op de voorkant niets tonen: een blok waarin niemand iets koos,
            // hoort geen foutmelding aan een bezoeker te geven. In de editor
            // ziet de redacteur wél een uitnodiging.
            return current_user_can('edit_posts')
                ? '<div class="mymmo-form-notice mymmo-form-notice--admin">Kies een formulier in de zijbalk van dit blok.</div>'
                : '';
        }

        $opstelling = Mymmo_Forms_Presets::get($preset);
        if ($opstelling === null) {
            return current_user_can('edit_posts')
                ? '<div class="mymmo-form-notice mymmo-form-notice--admin">De opstelling "' . esc_html($preset) . '" bestaat niet meer.</div>'
                : '';
        }

        return $opstelling['soort'] === 'inline'
            ? Mymmo_Forms_Shortcodes::render(['preset' => $preset])
            : Mymmo_Forms_Shortcodes::render_button(['preset' => $preset]);
    }

    /**
     * De stylesheets van het formulier ook IN de editor.
     *
     * Zonder dit staat het formulier daar ongestyled: het blok wordt via de
     * REST-renderer opgehaald, en de wp_enqueue_style() die de shortcode dan
     * doet, bereikt de editorpagina niet -- die is al geladen.
     *
     * enqueue_block_assets en niet enqueue_block_editor_assets: sinds WordPress
     * 6.3 staat het canvas in een iframe, en alleen deze haak zet stijlen daar
     * binnen. De controle op is_admin() is er omdat deze haak óók op de voorkant
     * vuurt -- daar laadt de shortcode zelf wat ze nodig heeft, en enkel op de
     * pagina's waar ze echt staat.
     */
    public static function editor_styles(): void {
        if (!is_admin()) {
            return;
        }
        wp_enqueue_style('mymmo-forms');
        wp_enqueue_style('mymmo-forms-modal');
        wp_enqueue_style('mymmo-forms-steps');
        wp_enqueue_style('mymmo-forms-callout');
    }
}
