<?php
/**
 * Het blok "Mymmo formulier" voor de blok-editor.
 *
 * Wat het doet: je voegt het blok in, kiest in de zijbalk een BEWAARDE
 * OPSTELLING, en ziet meteen in de editor wat er op de pagina komt te staan.
 *
 * Wat het NIET doet: instellingen per plaatsing. Het blok kent één keuze -- welke
 * opstelling -- en verder niets. Dat is met opzet. De teksten en kleuren zet je
 * in de bouwer bij Instellingen → Mymmo Forms, waar het levende voorbeeld staat;
 * ze hier nóg eens als velden in de zijbalk zetten zou betekenen dat dezelfde
 * instelling op twee plekken staat en dat je bij een wijziging moet raden welke
 * van de twee gold. Precies waarom de tekstvelden uit de bouwer verhuisd zijn
 * naar het voorbeeld zelf.
 *
 * Het gevolg is de winst: één opstelling wijzigen werkt door op élke pagina die
 * ze gebruikt, zonder die pagina's te openen.
 *
 * SERVER-SIDE GERENDERD. `save` geeft null terug, dus er staat geen HTML in de
 * pagina-inhoud -- enkel `<!-- wp:mymmo/forms {"preset":"..."} /-->`. Daardoor
 * kan een opstelling nooit "vastgeroest" in een oude pagina blijven staan, en
 * bestaat er geen blokvalidatiefout als de opmaak van het venster wijzigt. Dat
 * is dezelfde reden waarom de plugin nergens een kopie van een formulier bewaart.
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

        // De lijst met opstellingen gaat mee naar de editor. Niet via de
        // REST-API ophalen: het zijn er een handvol, ze staan al op de server op
        // het moment dat de editor laadt, en een extra verzoek kan mislukken --
        // en dan sta je naar een lege keuzelijst te kijken zonder te weten
        // waarom.
        $keuzes = [];
        foreach (Mymmo_Forms_Presets::all() as $opstelling) {
            $keuzes[] = [
                'id'    => $opstelling['id'],
                'name'  => $opstelling['name'],
                'soort' => $opstelling['soort'],
            ];
        }

        wp_localize_script('mymmo-forms-block', 'MymmoFormsBlock', [
            'presets'     => $keuzes,
            'settingsUrl' => admin_url('options-general.php?page=mymmo-forms'),
        ]);

        register_block_type(self::NAAM, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-forms-block',
            'attributes'      => [
                'preset' => ['type' => 'string', 'default' => ''],
            ],
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /**
     * @param array<string,mixed> $attributen
     */
    public static function render($attributen = []): string {
        $preset = sanitize_title((string) ($attributen['preset'] ?? ''));

        if ($preset === '') {
            // Op de voorkant niets tonen: een blok waarin niemand een opstelling
            // koos, hoort geen foutmelding aan een bezoeker te geven. In de
            // editor ziet de redacteur wél een uitnodiging om er een te kiezen.
            return current_user_can('edit_posts')
                ? '<div class="mymmo-form-notice mymmo-form-notice--admin">Kies een opstelling in de zijbalk van dit blok.</div>'
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
     * Zonder dit staat de knop daar ongestyled: het blok wordt via de
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
    }
}
