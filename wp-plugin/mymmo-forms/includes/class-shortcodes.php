<?php
/**
 * De twee shortcodes.
 *
 *   [mymmo_form slug="offerte-technisch-beheer"]
 *   [mymmo_form_button slug="offerte-technisch-beheer" label="Vraag een offerte"]
 *
 * De eerste zet het formulier in de pagina. De tweede zet er een knop die een
 * venster opent met twee tabbladen: het formulier, en de agenda (Calendly).
 *
 * Attributen van [mymmo_form]:
 *   slug   -- welk formulier (verplicht)
 *   title  -- "no" laat de titel weg, voor als de pagina er zelf al een heeft
 *   lang   -- "fr" / "en" / "nl"; laat leeg om de taal van de pagina te volgen
 *
 * Attributen van [mymmo_form_button]: zie render_button() hieronder.
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

    /**
     * Hoe vaak een bepaald venster-id al op deze pagina voorkwam.
     *
     * Twee knoppen voor hetzelfde formulier op een pagina mogen niet hetzelfde
     * id krijgen -- de eerste zou dan beide knoppen opvangen. De teller loopt
     * per paginaweergave in dezelfde volgorde, dus het id van een knop is
     * hetzelfde voor en na het versturen. Dat moet ook: het staat in de
     * redirect-URL.
     *
     * @var array<string,int>
     */
    private static array $tellers = [];

    public static function init(): void {
        add_action('init', [self::class, 'register_assets']);
        add_shortcode('mymmo_form', [self::class, 'render']);
        add_shortcode('mymmo_form_button', [self::class, 'render_button']);
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

        // De pop-up is een APARTE stylesheet en een apart script, want ze zijn
        // alleen nodig op een pagina met [mymmo_form_button]. Ze staan ook
        // bewust niet in public/mymmo-forms.css: dat bestand is de gedeelde bron
        // van de FORMULIER-stijl, en het voorbeeld in de bouwer van de
        // Operations Manager draait erop. Daar bestaat geen pop-up, dus daar zou
        // dit dode CSS zijn.
        wp_register_style(
            'mymmo-forms-modal',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms-modal.css',
            ['mymmo-forms'],
            MYMMO_FORMS_VERSION
        );

        wp_register_script(
            'mymmo-forms-modal',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-modal.js',
            ['mymmo-forms'],
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

        // Een pagina kan meer dan een formulier tonen; de melding hoort alleen
        // bij het formulier waar ze vandaan komt. Het anker onderscheidt daarbij
        // dit formulier IN DE TEKST van hetzelfde formulier in een pop-up -- die
        // laatste stuurt een anker mee, deze niet.
        $flash = self::claim_flash($slug, '');

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

    /**
     * De knop met pop-up.
     *
     * Attributen:
     *   slug         -- welk formulier (verplicht)
     *   label        -- de tekst op de knop; leeg = de naam van het formulier
     *   calendly     -- https-link naar een Calendly-pagina. Leeg = geen tweede
     *                   tabblad; de pop-up toont dan enkel het formulier
     *   title        -- de kop in het venster; leeg = de naam van het formulier,
     *                   "no" = geen kop
     *   tab_form     -- opschrift van het eerste tabblad
     *   tab_calendly -- opschrift van het tweede tabblad
     *   tab          -- "calendly" om op de agenda te openen (standaard "form")
     *   variant      -- "primary" (gevuld) of "outline" (omlijnd)
     *   class        -- eigen klasse(n) op de wikkel, om de knop te plaatsen
     *   close        -- het opschrift van de sluitknop (voor schermlezers)
     *   lang         -- zoals bij [mymmo_form]
     *   id           -- eigen id voor het venster; normaal niet nodig
     *
     * De opschriften staan hier en niet in de berichtencatalogus van het
     * formulier: ze horen bij DEZE plaatsing op DEZE pagina, niet bij het
     * formulier. Op een Franse pagina typ je ze dus mee in de shortcode -- de
     * shortcode-bouwer bij Instellingen toont er velden voor.
     *
     * @param array<string,string>|string $atts
     */
    public static function render_button($atts = []): string {
        $atts = shortcode_atts([
            'slug'         => '',
            'label'        => '',
            'calendly'     => '',
            'title'        => '',
            'tab_form'     => 'Stuur ons een bericht',
            'tab_calendly' => 'Plan een gesprek',
            'tab'          => 'form',
            'variant'      => 'primary',
            'class'        => '',
            'close'        => 'Sluiten',
            'lang'         => '',
            'id'           => '',
        ], is_array($atts) ? $atts : [], 'mymmo_form_button');

        $slug = sanitize_title((string) $atts['slug']);

        if ($slug === '') {
            return self::notice('Deze shortcode mist een slug: [mymmo_form_button slug="..."]');
        }

        $form = Mymmo_Forms_Api_Client::get_form($slug);

        if (!is_array($form)) {
            return current_user_can('manage_options')
                ? self::notice('Formulier "' . esc_html($slug) . '" kon niet geladen worden: ' . esc_html((string) Mymmo_Forms_Api_Client::last_error()))
                : '';
        }

        wp_enqueue_style('mymmo-forms');
        wp_enqueue_script('mymmo-forms');
        wp_enqueue_style('mymmo-forms-modal');
        wp_enqueue_script('mymmo-forms-modal');

        $lang = Mymmo_Forms_I18n::resolve($form, (string) $atts['lang']);
        $naam = Mymmo_Forms_I18n::text($form, $lang, 'name');

        $modal_id  = self::modal_id($slug, (string) $atts['id']);
        $launch_id = $modal_id . '-knop';

        // De melding na het versturen hoort bij DIT venster. Zonder het anker
        // zou een pop-up de bevestiging kunnen tonen van het formulier dat
        // verderop gewoon in de tekst staat.
        $flash = self::claim_flash($slug, $modal_id);

        // De knop moet iets te lezen geven, ook als niemand een label typte en
        // het formulier geen naam heeft.
        $label = trim((string) $atts['label']);
        if ($label === '') {
            $label = $naam !== '' ? $naam : 'Contacteer ons';
        }

        // title="no" haalt de kop weg; leeg laten betekent de naam van het
        // formulier -- niet "geen kop", want een venster zonder kop leest als
        // een fout.
        $heading = trim((string) $atts['title']);
        if ($heading === '') {
            $heading = $naam;
        } elseif (strtolower($heading) === 'no') {
            $heading = '';
        }

        return mymmo_forms_render('modal', [
            'form'               => $form,
            'slug'               => $slug,
            'lang'               => $lang,
            'flash'              => $flash,
            'stale'              => Mymmo_Forms_Api_Client::served_stale(),
            'modal_id'           => $modal_id,
            'launch_id'          => $launch_id,
            'label'              => $label,
            'variant'            => (string) $atts['variant'] === 'outline' ? 'outline' : 'primary',
            'extra_class'        => self::classes((string) $atts['class']),
            'heading'            => $heading,
            'tab_form_label'     => (string) $atts['tab_form'],
            'tab_calendly_label' => (string) $atts['tab_calendly'],
            'close_label'        => (string) $atts['close'],
            'calendly'           => self::calendly_url((string) $atts['calendly']),
            'active_tab'         => (string) $atts['tab'] === 'calendly' ? 'calendly' : 'form',
            // Kwam de bezoeker net terug van een inzending uit dit venster, dan
            // hoort het venster meteen weer open te staan met de bevestiging.
            'auto_open'          => is_array($flash),
        ]);
    }

    /**
     * De melding opvragen en enkel houden als ze bij DEZE plaatsing hoort.
     *
     * $anker is '' voor een formulier in de tekst en het id van het venster voor
     * een pop-up. Meldingen van voor deze versie hebben nog geen anker; die
     * komen dus bij het formulier in de tekst terecht, en dat klopt -- de
     * pop-up bestond toen nog niet.
     *
     * @return array<string,mixed>|null
     */
    private static function claim_flash(string $slug, string $anker): ?array {
        $flash = Mymmo_Forms_Submit::flash();

        if (!is_array($flash)) {
            return null;
        }
        if (($flash['slug'] ?? '') !== $slug) {
            return null;
        }
        if ((string) ($flash['anchor'] ?? '') !== $anker) {
            return null;
        }

        return $flash;
    }

    /**
     * Een id voor het venster dat na het versturen nog hetzelfde is.
     *
     * Het staat in de redirect-URL, dus het mag niet afhangen van iets dat per
     * weergave verschilt. Afgeleid van de slug, met een volgnummer als dezelfde
     * knop twee keer op een pagina staat.
     */
    private static function modal_id(string $slug, string $gevraagd): string {
        $basis = preg_replace('/[^A-Za-z0-9_-]/', '', $gevraagd) ?: '';
        if ($basis === '') {
            $basis = 'mymmo-modal-' . $slug;
        }
        $basis = substr($basis, 0, 48);

        self::$tellers[$basis] = (self::$tellers[$basis] ?? 0) + 1;

        return self::$tellers[$basis] > 1
            ? $basis . '-' . self::$tellers[$basis]
            : $basis;
    }

    /** Eigen klassen van de shortcode: alleen wat een klassenaam mag zijn. */
    private static function classes(string $ruw): string {
        $uit = [];
        foreach (preg_split('/\s+/', trim($ruw)) ?: [] as $klasse) {
            $schoon = sanitize_html_class($klasse);
            if ($schoon !== '') {
                $uit[] = $schoon;
            }
        }
        return implode(' ', $uit);
    }

    /**
     * De Calendly-link, of '' als er niets bruikbaars staat.
     *
     * Alleen https: het is een iframe van een derde partij en de pagina eromheen
     * staat op https. Een andere host wordt niet geweigerd -- Calendly heeft
     * geen eigen domeinen, maar een geweigerde link zou een leeg tabblad geven
     * zonder dat iemand ziet waarom.
     */
    private static function calendly_url(string $ruw): string {
        $url = esc_url_raw(trim($ruw));
        return str_starts_with($url, 'https://') ? $url : '';
    }

    private static function notice(string $message): string {
        return '<div class="mymmo-form-notice mymmo-form-notice--admin">' . $message . '</div>';
    }
}
