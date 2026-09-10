<?php
/**
 * De shortcode: [mymmo_form slug="offerte-technisch-beheer"]
 *
 * Attributen:
 *   slug   -- welk formulier (verplicht)
 *   title  -- "no" laat de titel weg, voor als de pagina er zelf al een heeft
 *   lang   -- "fr" / "en" / "nl"; laat leeg om de taal van de pagina te volgen
 *
 * Server-side gerenderd. Geen JavaScript nodig om het formulier te zien of te
 * versturen -- de JS die er is, is uitsluitend gemaksverbetering (zie
 * assets/js/mymmo-forms.js).
 *
 * De CSS en JS worden pas ingeladen als de shortcode ook echt op de pagina
 * staat. Ze op elke pagina meesturen is verspilling op een site waar maar twee
 * pagina's een formulier hebben.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Shortcodes {

    private static bool $assets_registered = false;

    public static function init(): void {
        add_action('init', [self::class, 'register_assets']);
        add_shortcode('mymmo_form', [self::class, 'render']);
    }

    public static function register_assets(): void {
        if (self::$assets_registered) {
            return;
        }
        self::$assets_registered = true;

        wp_register_style(
            'mymmo-forms',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms.css',
            [],
            MYMMO_FORMS_VERSION
        );

        wp_register_script(
            'mymmo-forms',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms.js',
            [],
            MYMMO_FORMS_VERSION,
            true
        );
    }

    /**
     * @param array<string,string>|string $atts
     */
    public static function render($atts = []): string {
        $atts = shortcode_atts(['slug' => '', 'title' => 'yes', 'lang' => ''], is_array($atts) ? $atts : [], 'mymmo_form');
        $slug = sanitize_title((string) $atts['slug']);

        if ($slug === '') {
            return self::notice('Deze shortcode mist een slug: [mymmo_form slug="..."]');
        }

        $form = Mymmo_Forms_Api_Client::get_form($slug);

        if (!is_array($form)) {
            // Voor een beheerder de echte reden, voor een bezoeker niets. Een
            // lege pagina met een technische foutmelding is erger dan geen
            // formulier: de bezoeker kan er toch niets mee, en het toont hoe de
            // site in elkaar zit.
            return current_user_can('manage_options')
                ? self::notice('Formulier "' . esc_html($slug) . '" kon niet geladen worden: ' . esc_html((string) Mymmo_Forms_Api_Client::last_error()))
                : '';
        }

        wp_enqueue_style('mymmo-forms');
        wp_enqueue_script('mymmo-forms');

        $flash = Mymmo_Forms_Submit::flash();
        // Een pagina kan twee formulieren tonen; de melding hoort alleen bij het
        // formulier waar ze vandaan komt.
        if (is_array($flash) && ($flash['slug'] ?? '') !== $slug) {
            $flash = null;
        }

        return mymmo_forms_render('form', [
            'form'        => $form,
            'slug'        => $slug,
            'show_title'  => $atts['title'] !== 'no',
            'flash'       => $flash,
            'stale'       => Mymmo_Forms_Api_Client::served_stale(),
            // lang="fr" wint; anders de taal van de pagina; anders de
            // standaardtaal van het formulier. Zie Mymmo_Forms_I18n::resolve().
            'lang'        => Mymmo_Forms_I18n::resolve($form, (string) $atts['lang']),
        ]);
    }

    private static function notice(string $message): string {
        return '<div class="mymmo-form-notice mymmo-form-notice--admin">' . $message . '</div>';
    }
}
