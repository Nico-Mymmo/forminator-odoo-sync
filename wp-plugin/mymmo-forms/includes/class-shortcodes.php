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
 *   steps  -- namen van stappen, gescheiden met een komma. Die komen VOOR het
 *             formulier te staan en vullen zijn verborgen velden; het
 *             formulier zelf is dan de laatste stap. Zie class-steps.php.
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
        // [mymmo_form_entry] hoort bij de ingangen en wordt daar geregistreerd:
        // zie Mymmo_Forms_Entrypoints::register_shortcode().
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

        // De callout: een blok in de pagina met de eerste stap erin. Alleen
        // nodig waar [mymmo_form_callout] staat. Ze hangt aan de venster-stijl,
        // want een callout zonder venster bestaat niet.
        wp_register_style(
            'mymmo-forms-callout',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms-callout.css',
            ['mymmo-forms-modal'],
            MYMMO_FORMS_VERSION
        );

        // En de stappenreeks, om dezelfde reden apart: ze is alleen nodig waar
        // er ook echt een steps="..."-attribuut staat.
        wp_register_style(
            'mymmo-forms-steps',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms-steps.css',
            ['mymmo-forms'],
            MYMMO_FORMS_VERSION
        );

        // IN DE KOP, en zonder afhankelijkheid.
        //
        // Het script van een STAP draait tijdens het parsen van de pagina en
        // roept meteen `MymmoStappen.stap(...)` aan. Dat werkte met een klein
        // inline stukje dat de aanmeldingen in een rij bewaarde -- tot een
        // cache- of optimalisatieplugin inline scripts naar de voettekst
        // verplaatst. Dan bestaat `MymmoStappen` nog niet, gooit het script van
        // de stap, en hangt er geen enkele luisteraar: de schuifbalk schuift
        // wel (die leest de reeks rechtstreeks uit), maar het getal en de
        // tekening bewegen niet mee. Precies het soort fout dat er niet uitziet
        // als een fout.
        //
        // Dit bestand in de kop zetten haalt die hele klasse fouten weg: vanaf
        // dat moment bestaat `window.MymmoStappen` gegarandeerd vóór de eerste
        // stap. Het inline stukje blijft als vangnet staan.
        //
        // Geen `['mymmo-forms']` meer: steps.js gebruikt daar niets van, en die
        // afhankelijkheid zou het formulierscript mee naar de kop trekken.
        wp_register_script(
            'mymmo-forms-steps',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-steps.js',
            [],
            MYMMO_FORMS_VERSION,
            false
        );
    }

    /**
     * De stappenreeks inladen, en alleen als er een reeks gevraagd is.
     *
     * Anders dan mymmo-forms.js is dit geen gemaksverbetering: zonder dit
     * script is er geen reeks. De terugval zonder JavaScript staat daarom in
     * templates/steps.php en niet hier.
     */
    private static function enqueue_steps(string $steps): void {
        if (trim($steps) === '') {
            return;
        }
        wp_enqueue_style('mymmo-forms-steps');
        wp_enqueue_script('mymmo-forms-steps');
    }

    /**
     * @param array<string,string>|string $atts
     */
    public static function render($atts = []): string {
        $atts = shortcode_atts(
            [
                'slug' => '', 'title' => 'yes', 'lang' => '', 'preset' => '', 'steps' => '',
                'gap' => '', 'goal_form' => '',
                // De kop boven de LAATSTE stap -- het formulier zelf. Zie
                // templates/steps.php.
                'form_title' => '', 'form_sub' => '',
            ],
            self::met_opstelling($atts),
            'mymmo_form'
        );
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

        self::enqueue_steps((string) $atts['steps']);

        return mymmo_forms_render_body((string) $atts['steps'], $form, $slug, [
            'form'        => $form,
            'slug'        => $slug,
            'show_title'  => $atts['title'] !== 'no',
            'flash'       => $flash,
            'stale'       => Mymmo_Forms_Api_Client::served_stale(),
            // lang="fr" wint; anders de taal van de pagina; anders de
            // standaardtaal van het formulier. Zie Mymmo_Forms_I18n::resolve().
            'lang'        => Mymmo_Forms_I18n::resolve($form, (string) $atts['lang']),
            'extra_style' => self::gap_style($atts),
            'goal'        => self::goal((string) $atts['goal_form']),
            'form_title'  => sanitize_text_field((string) $atts['form_title']),
            'form_sub'    => sanitize_text_field((string) $atts['form_sub']),
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
     *   intro        -- de zin onder die kop, in de zijkolom; leeg = de
     *                   omschrijving van het formulier uit de OM, "no" = niets
     *   points       -- opsomming in de zijkolom, gescheiden met een |
     *   image        -- afbeelding onderaan de zijkolom (https of een pad)
     *   image_alt    -- beschrijving van die afbeelding; leeg = sfeerbeeld
     *   tab_form     -- opschrift van het tabblad met het formulier
     *   tab_calendly -- opschrift van het tabblad met de agenda
     *   tab_extra    -- opschrift van het DERDE tabblad; leeg = de naam van het
     *                   formulier dat erin staat
     *   tab_form_sub / tab_calendly_sub / tab_extra_sub -- het regeltje eronder
     *   extra_slug   -- welk formulier in het derde tabblad staat; leeg =
     *                   hetzelfde als `slug`
     *   extra_steps  -- de stappenreeks VOOR dat formulier (zoals `steps`, maar
     *                   dan voor het derde tabblad). Het derde tabblad bestaat
     *                   zodra een van deze twee ingevuld is.
     *   tab_order    -- de volgorde van de tabbladen, bv. "extra,form,calendly".
     *                   Wat je weglaat schuift achteraan aan; onbekende namen
     *                   worden genegeerd.
     *   tab          -- welk tabblad openstaat: "form", "calendly" of "extra".
     *                   Leeg = het tabblad dat bovenaan staat (zie tab_order).
     *   variant      -- "primary" (gevuld) of "outline" (omlijnd)
     *   accent       -- de kleur van de knoppen HIER; leeg = het thema van het
     *                   formulier in de Operations Manager
     *   accent_text  -- de tekstkleur op die knoppen (standaard wit)
     *   button       -- "no" rendert geen eigen knop: iets anders op de pagina
     *                   opent het venster (zie trigger)
     *   trigger      -- CSS-selector van bestaande knoppen die het venster
     *                   openen, bv. ".hero .elementor-button"
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
     * Hetzelfde geldt voor `accent`: de kleur van een formulier hoort in de OM,
     * want die geldt overal waar het formulier staat. Staat deze knop tussen de
     * knoppen van een pagina die een andere kleur aanhoudt, dan overschrijf je
     * ze hier -- voor DEZE plaatsing.
     *
     * @param array<string,string>|string $atts
     */
    public static function render_button($atts = []): string {
        $args = self::venster_args(
            shortcode_atts(self::VENSTER_ATTS, self::met_opstelling($atts), 'mymmo_form_button'),
            'mymmo_form_button'
        );

        if (array_key_exists('fout', $args)) {
            return (string) $args['fout'] === '' ? '' : self::notice((string) $args['fout']);
        }

        return mymmo_forms_render('modal', $args);
    }

    /**
     * De attributen van het VENSTER, als constante.
     *
     * Als constante en niet als literal in render_button(), omdat
     * [mymmo_form_callout] exact dezelfde lijst nodig heeft plus een handvol
     * eigen attributen. Twee kopieen van zeventig attributen lopen gegarandeerd
     * uit elkaar, en dat merk je pas als een instelling op de ene shortcode wel
     * werkt en op de andere niet.
     */
    private const VENSTER_ATTS = [
            'slug'             => '',
            'label'            => '',
            'steps'            => '',
            'calendly'         => '',
            'title'            => '',
            'intro'            => '',
            'points'           => '',
            'image'            => '',
            'image_alt'        => '',
            'image_calendly'       => '',
            'image_calendly_alt'   => '',
            'image_calendly_scale' => '',
            'image_calendly_x'     => '',
            'image_calendly_y'     => '',
            'image_scale'      => '',
            'image_x'          => '',
            'image_y'          => '',
            'watermark'        => '',
            'watermark_scale'  => '',
            'watermark_x'      => '',
            'watermark_y'      => '',
            'watermark_rotate' => '',
            'icon_color'       => '',
            'tab_form'         => 'Stuur ons een bericht',
            'tab_calendly'     => 'Plan een gesprek',
            'tab_extra'        => '',
            'tab_form_sub'     => '',
            'tab_calendly_sub' => '',
            'tab_extra_sub'    => '',
            'tab_order'        => '',
            'extra_slug'       => '',
            'extra_steps'      => '',
            'tab'              => '',
            'variant'          => 'primary',
            'accent'           => '',
            'accent_text'      => '',
            'button'           => 'yes',
            'trigger'          => '',
            'class'            => '',
            'close'            => 'Sluiten',
            'lang'             => '',
            'id'               => '',
            'preset'           => '',
            'gap'              => '',
            'calendly_color'   => '',
            'form_title'       => '',
            'form_sub'         => '',
            // Kop (titel + regel uitleg) ook boven een formulier ZONDER stappen,
            // zoals "Stuur een bericht". Standaard aan; "no" zet hem uit.
            'form_heading'     => '',
            'background'       => '',
            'thanks_calendly'  => '',
            'goal_form'        => '',
            'goal_calendly'    => '',
            // Het dankjewelscherm per tabblad (1.16). De tekst van het
            // gesprek-tabblad blijft `thanks_calendly`, zoals voorheen.
            'thanks_form_image'     => '',
            'thanks_form_title'     => '',
            'thanks_form_text'      => '',
            'thanks_extra_image'    => '',
            'thanks_extra_title'    => '',
            'thanks_extra_text'     => '',
            'thanks_calendly_image' => '',
            'thanks_calendly_title' => '',
            // Een eigen conversiepad voor het derde tabblad; leeg = dat van het
            // formulier.
            'goal_extra'            => '',
            // "breed" maakt het paneel ruimer. Voor een stap die niet in de
            // gewone breedte past -- dertien keien naast elkaar -- en daar
            // anders een schuifbalk van maakt.
            'panel'                 => '',
    ];

    /**
     * Alles wat templates/modal.php nodig heeft, uit de attributen van een
     * shortcode.
     *
     * Gedeeld door [mymmo_form_button] en [mymmo_form_callout]: die tonen
     * hetzelfde venster, alleen de weg ernaartoe verschilt.
     *
     * @param  array<string,string> $atts       al door shortcode_atts() gehaald
     * @param  string               $shortcode  enkel voor de foutmelding
     * @return array<string,mixed>              de render-argumenten, of ['fout' => '...']
     */
    private static function venster_args(array $atts, string $shortcode = 'mymmo_form_button'): array {
        $slug = sanitize_title((string) $atts['slug']);

        if ($slug === '') {
            return ['fout' => 'Deze shortcode mist een slug: [' . esc_html($shortcode) . ' slug="..."]'];
        }

        $form = Mymmo_Forms_Api_Client::get_form($slug);

        if (!is_array($form)) {
            // Voor een beheerder de echte reden, voor een bezoeker niets.
            return ['fout' => current_user_can('manage_options')
                ? 'Formulier "' . esc_html($slug) . '" kon niet geladen worden: ' . esc_html((string) Mymmo_Forms_Api_Client::last_error())
                : ''];
        }

        wp_enqueue_style('mymmo-forms');
        wp_enqueue_script('mymmo-forms');
        wp_enqueue_style('mymmo-forms-modal');
        wp_enqueue_script('mymmo-forms-modal');
        // De kop boven een formulier gebruikt de klassen van een stap-titel, ook
        // op een tabblad zonder stappen. Alleen de stijl; het script blijft
        // voorbehouden aan een echte reeks.
        wp_enqueue_style('mymmo-forms-steps');
        self::enqueue_steps((string) $atts['steps']);
        self::enqueue_steps((string) $atts['extra_steps']);

        $lang = Mymmo_Forms_I18n::resolve($form, (string) $atts['lang']);
        $naam = Mymmo_Forms_I18n::text($form, $lang, 'name');

        // ── Het derde tabblad ───────────────────────────────────────────────
        // Het bestaat zodra er een eigen formulier OF een eigen stappenreeks
        // voor gezet is. Zonder een van die twee zou het een kopie van het
        // eerste tabblad zijn, en twee identieke tabbladen is altijd een
        // vergissing.
        $extra_slug  = sanitize_title((string) $atts['extra_slug']);
        $extra_steps = (string) $atts['extra_steps'];
        $extra_form  = null;
        $extra_lang  = $lang;

        if ($extra_slug !== '' || trim($extra_steps) !== '') {
            if ($extra_slug === '' || $extra_slug === $slug) {
                // Hetzelfde formulier, maar met de stappen ervoor. Geen tweede
                // aanroep naar de OM: het staat al in $form.
                $extra_slug = $slug;
                $extra_form = $form;
            } else {
                $extra_form = Mymmo_Forms_Api_Client::get_form($extra_slug);

                if (!is_array($extra_form)) {
                    // Het derde tabblad valt weg; de rest van het venster blijft
                    // gewoon werken. Een beheerder hoort te weten waarom, want
                    // aan het venster zelf is niets te zien.
                    $extra_form = null;
                    if (current_user_can('manage_options')) {
                        $melding = 'Het derde tabblad is weggelaten: formulier "' . esc_html($extra_slug)
                            . '" kon niet geladen worden.';
                        add_action('wp_footer', static function () use ($melding) {
                            echo '<script>console.warn(' . wp_json_encode('[Mymmo Forms] ' . $melding) . ');</script>';
                        });
                    }
                } else {
                    $extra_lang = Mymmo_Forms_I18n::resolve($extra_form, (string) $atts['lang']);
                }
            }
        }

        // Leeg opschrift = de naam van het formulier dat erin staat. Een
        // naamloos tabblad is geen tabblad.
        $tab_extra_label = trim((string) $atts['tab_extra']);
        if ($tab_extra_label === '' && is_array($extra_form)) {
            $tab_extra_label = Mymmo_Forms_I18n::text($extra_form, $extra_lang, 'name');
        }

        $modal_id  = self::modal_id($slug, (string) $atts['id']);
        $launch_id = $modal_id . '-knop';

        // De melding na het versturen hoort bij DIT venster. Zonder het anker
        // zou een pop-up de bevestiging kunnen tonen van het formulier dat
        // verderop gewoon in de tekst staat.
        $flash = self::claim_flash($slug, $modal_id);
        // Het derde tabblad kan een ander formulier tonen; dan hoort de melding
        // bij DAT formulier.
        if ($flash === null && is_array($extra_form) && $extra_slug !== $slug) {
            $flash = self::claim_flash($extra_slug, $modal_id);
        }
        $flash_tab = is_array($flash) ? (string) ($flash['tab'] ?? '') : '';

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

        $calendly = self::calendly_url((string) $atts['calendly']);
        $image    = self::image_url((string) $atts['image']);
        $points   = self::points((string) $atts['points']);

        // De kleur van DEZE plaatsing. Leeg = het thema van het formulier, dat
        // in modal.php al op de wikkel staat; deze komt erachter, en de laatste
        // declaratie wint.
        $accent      = mymmo_forms_color((string) $atts['accent']);
        $accent_text = mymmo_forms_color((string) $atts['accent_text']);

        $accent_style = [];
        if ($accent !== '') {
            $accent_style[] = '--mf-accent:' . $accent;
        }
        if ($accent_text !== '') {
            $accent_style[] = '--mf-accent-text:' . $accent_text;
        }

        $tussenruimte = self::gap_style($atts);
        if ($tussenruimte !== '') {
            $accent_style[] = $tussenruimte;
        }

        // De achtergrond van het venster. Standaard is dat een lichte tint van
        // de accentkleur; met dit attribuut kies je een andere merkkleur voor
        // deze plaatsing.
        $achtergrond = mymmo_forms_color((string) $atts['background']);
        if ($achtergrond !== '') {
            $accent_style[] = '--mf-panel-bg:' . $achtergrond;
        }

        // De kleur van de vinkjes en de iconen. Los van de accentkleur: op een
        // gekleurde achtergrond wil je die soms lichter, zonder daarvoor de
        // knoppen mee te veranderen.
        $icoon = mymmo_forms_color((string) $atts['icon_color']);
        if ($icoon !== '') {
            $accent_style[] = '--mf-icon:' . $icoon;
        }

        // De tekening en het watermerk: schaal en verschuiving.
        foreach ([
            ['image_scale',     '--mf-fig-scale', 'schaal'],
            ['image_x',         '--mf-fig-x',     'verschuiving'],
            ['image_y',         '--mf-fig-y',     'verschuiving'],
            ['image_calendly_scale', '--mf-fig2-scale', 'schaal'],
            ['image_calendly_x',     '--mf-fig2-x',     'verschuiving'],
            ['image_calendly_y',     '--mf-fig2-y',     'verschuiving'],
            ['watermark_scale', '--mf-wm-scale',  'schaal'],
            ['watermark_x',     '--mf-wm-x',      'verschuiving'],
            ['watermark_y',     '--mf-wm-y',      'verschuiving'],
            ['watermark_rotate', '--mf-wm-rotate', 'hoek'],
        ] as [$attribuut, $variabele, $soort]) {
            if ($soort === 'schaal') {
                $waarde = mymmo_forms_scale((string) $atts[$attribuut]);
            } elseif ($soort === 'hoek') {
                $waarde = mymmo_forms_angle((string) $atts[$attribuut]);
            } else {
                $waarde = mymmo_forms_offset((string) $atts[$attribuut]);
            }
            if ($waarde !== '') {
                $accent_style[] = $variabele . ':' . $waarde;
            }
        }

        /*
         * WAT CALENDLY MET DEZE KLEUR DOET -- gemeten op hun eigen pagina.
         *
         * Met `primary_color=99f6e4` (jullie mint):
         *     beschikbare dag, cijfer   rgb(153,246,228)   -- exact die kleur
         *     tijdstip, tekst + rand    idem
         * Met `primary_color=0369a1` (jullie donkerblauw):
         *     beschikbare dag, cijfer   rgb(3,105,161)
         *     beschikbare dag, vlak     rgb(240,246,251)   -- tint die zij afleiden
         *     gekozen dag               vol donkerblauw, wit cijfer
         *     tijdstip, tekst + rand    rgb(3,105,161)
         *
         * `text_color` raakt het dagcijfer niet (getest met 000000). Het cijfer en
         * de tijdstippen ZIJN dus de kleur die je meegeeft, en die hoort daarom de
         * leesbare kleur van het merk te zijn -- niet de felle.
         *
         * De kandidaten zijn het PAAR dat het merk zelf gebruikt: de accentkleur en
         * de tekst die erop staat, elk uit dezelfde cascade als de rest van het
         * venster (shortcode > site > formulier). Daaruit wint de leesbaarste. Er
         * wordt NIETS omgerekend: dat gaf in 1.15.7 een groen dat in geen enkel
         * palet stond.
         *
         * `calendly_color` op de shortcode wint van alles.
         */
        $thema        = is_array($form['theme'] ?? null) ? $form['theme'] : [];
        $site_vars    = get_option('mymmo_forms_follow_theme', 1) ? mymmo_forms_site_theme_vars() : [];

        $eerste = static function (array $lijst): string {
            foreach ($lijst as $waarde) {
                $hex = mymmo_forms_hex6((string) $waarde);
                if ($hex !== '') {
                    return $hex;
                }
            }
            return '';
        };

        $accent_opgelost = $eerste([$accent, $site_vars['--mf-accent'] ?? '', $thema['accent'] ?? '']);
        $tekst_opgelost  = $eerste([$accent_text, $site_vars['--mf-accent-text'] ?? '', $thema['accent_text'] ?? '']);

        // De inkt van het merk voor DIT venster. Staat ook als CSS-variabele op
        // de wikkel, zodat een stap (het getal en de knop van een schuifbalk) er
        // dezelfde kleur uit haalt als de agenda.
        $inkt = mymmo_forms_leesbaarste_hex6([$accent_opgelost, $tekst_opgelost]);
        if ($inkt !== '') {
            $accent_style[] = '--mf-accent-ink:#' . $inkt;
        }

        $calendly_kleur = mymmo_forms_hex6((string) ($atts['calendly_color'] ?? ''));
        if ($calendly_kleur === '') {
            $calendly_kleur = $inkt;
        }

        // Heeft de zijkolom iets ANDERS dan de inleiding te tonen? Zo ja, dan is
        // de omschrijving van het formulier daar de logische inleiding en hoort
        // ze niet meer boven de velden. Zonder zijkolom blijft ze staan waar ze
        // stond -- ze verplaatsen zou daar alleen de kop dikker maken.
        $zijkolom = $calendly !== '' || $image !== '' || $points !== [];

        $lead = trim((string) $atts['intro']);
        if (strtolower($lead) === 'no') {
            $lead = '';
        } elseif ($lead === '' && $zijkolom) {
            $lead = Mymmo_Forms_I18n::text($form, $lang, 'description', $lang === Mymmo_Forms_I18n::default_language($form));
        }

        return [
            'form'               => $form,
            'slug'               => $slug,
            'steps'              => (string) $atts['steps'],
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
            'tab_extra_label'    => $tab_extra_label,
            'tab_form_sub'       => trim((string) $atts['tab_form_sub']),
            'tab_calendly_sub'   => trim((string) $atts['tab_calendly_sub']),
            'tab_extra_sub'      => trim((string) $atts['tab_extra_sub']),
            'extra_form'         => $extra_form,
            'extra_slug'         => $extra_slug,
            'extra_steps'        => $extra_steps,
            'extra_lang'         => $extra_lang,
            'tab_order'          => self::tab_order(
                (string) $atts['tab_order'],
                $calendly !== '',
                is_array($extra_form)
            ),
            'close_label'        => (string) $atts['close'],
            'calendly'           => $calendly,
            'calendly_kleur'     => $calendly_kleur,
            // De kop boven de laatste stap (het formulier). Van de plaatsing en
            // niet van het formulier: dezelfde velden verdienen in een ander
            // venster een andere aanhef.
            'form_title'         => sanitize_text_field((string) $atts['form_title']),
            'form_sub'           => sanitize_text_field((string) $atts['form_sub']),
            'form_heading'       => strtolower(trim((string) $atts['form_heading'])) !== 'no',
            // Leeg = het tabblad dat BOVENAAN staat. Stond hier 'form' als
            // vaste standaard, dan zette je met tab_order de agenda vooraan en
            // ging het venster alsnog open op het formulier -- je ziet een
            // knoprij waarvan de tweede knop actief is, en dat leest als een
            // fout. Wie wel een vast tabblad wil, typt het nog steeds.
            // Terug van een inzending: het tabblad dat verstuurde staat open,
            // met zijn dankjewelscherm.
            'active_tab'         => $flash_tab !== ''
                ? $flash_tab
                : (in_array((string) $atts['tab'], ['form', 'calendly', 'extra'], true)
                    ? (string) $atts['tab']
                    : ''),
            'image'              => $image,
            'image_alt'          => trim((string) $atts['image_alt']),
            'watermark'          => self::image_url((string) $atts['watermark']),
            'image_calendly'     => self::image_url((string) $atts['image_calendly']),
            'image_calendly_alt' => trim((string) $atts['image_calendly_alt']),
            'lead'               => $lead,
            'points'             => $points,
            // button="no": geen eigen knop. Het venster staat er wel, en iets
            // anders op de pagina opent het -- een link naar #id, of wat de
            // trigger-selector aanwijst.
            'thanks_calendly'    => trim((string) $atts['thanks_calendly']),
            'goal_calendly'      => self::goal((string) $atts['goal_calendly']),
            'goal_form'          => self::goal((string) $atts['goal_form']),
            'goal_extra'         => self::goal((string) $atts['goal_extra']) ?: self::goal((string) $atts['goal_form']),
            // Het dankjewelscherm per tabblad. Een lege tekst krijgt in
            // modal.php de standaard (de bedanktekst uit de OM, of die van
            // een geboekt gesprek); een lege titel blijft leeg.
            'dank'               => [
                'form'     => [
                    'image' => self::image_url((string) $atts['thanks_form_image']),
                    'title' => sanitize_text_field((string) $atts['thanks_form_title']),
                    'text'  => sanitize_text_field((string) $atts['thanks_form_text']),
                ],
                'extra'    => [
                    'image' => self::image_url((string) $atts['thanks_extra_image']),
                    'title' => sanitize_text_field((string) $atts['thanks_extra_title']),
                    'text'  => sanitize_text_field((string) $atts['thanks_extra_text']),
                ],
                'calendly' => [
                    'image' => self::image_url((string) $atts['thanks_calendly_image']),
                    'title' => sanitize_text_field((string) $atts['thanks_calendly_title']),
                    'text'  => sanitize_text_field((string) $atts['thanks_calendly']),
                ],
            ],
            'show_button'        => strtolower(trim((string) $atts['button'])) !== 'no',
            'trigger'            => self::trigger((string) $atts['trigger']),
            'accent_style'       => implode(';', $accent_style),
            // Kwam de bezoeker net terug van een inzending uit dit venster, dan
            // hoort het venster meteen weer open te staan met de bevestiging.
            'auto_open'          => is_array($flash),
            // Een ruimer paneel, als de shortcode daarom vraagt.
            'panel_extra'        => strtolower(trim((string) ($atts['panel'] ?? ''))) === 'breed'
                ? 'mymmo-modal-panel--ruim'
                : '',
            // Wat een CALLOUT hier invult; bij een knop of een klasse blijft het
            // leeg en verandert er niets. Zie render_ingang() en
            // templates/modal.php.
            'callout'            => null,
            'wikkel_attr'        => [],
            'wikkel_class'       => '',
            'naakt'              => false,
            'dok_index'          => -1,
        ];
    }

    /**
     * EEN INGANG renderen: een knop, een klasse-trigger of een callout.
     *
     * ALLE DRIE OPENEN ZE HETZELFDE VENSTER -- de opstelling die de ingang
     * noemt. Het venster wordt dus nergens opnieuw ontworpen: wat een ingang
     * zelf zegt is hoogstens haar eigen opschrift, kleur of kaartje.
     *
     * Wat elke soort mag meebrengen:
     *   knop     label, variant, accent, accent_text, class
     *   klasse   trigger  (de klassenaam die je op een bestaand element zet)
     *   callout  highlight, layout, title, text, cta, image, image_alt,
     *            image_scale, bg, class
     *
     * @param array<string,mixed> $ingang  een rij uit Mymmo_Forms_Entrypoints
     */
    public static function render_ingang(array $ingang): string {
        $soort = (string) ($ingang['soort'] ?? 'knop');
        $eigen = is_array($ingang['atts'] ?? null) ? $ingang['atts'] : [];

        $venster = class_exists('Mymmo_Forms_Presets')
            ? Mymmo_Forms_Presets::atts((string) ($ingang['popup'] ?? ''))
            : [];

        if ($venster === []) {
            // De opstelling is weg of hernoemd. Voor een bezoeker niets tonen:
            // een halve ingang die nergens heen gaat is erger dan geen ingang.
            return current_user_can('manage_options')
                ? self::notice('De ingang "' . esc_html((string) ($ingang['name'] ?? ''))
                    . '" wijst naar een opstelling die niet meer bestaat.')
                : '';
        }

        $basis = $venster;
        // Alleen een KNOP tekent zichzelf. Een klasse hangt aan iets dat er al
        // staat, en een callout is zelf het blok met zijn eigen knop erin.
        $basis['button'] = $soort === 'knop' ? 'yes' : 'no';

        if ($soort === 'knop') {
            foreach (['label', 'variant', 'accent', 'accent_text', 'class'] as $sleutel) {
                if ((string) ($eigen[$sleutel] ?? '') !== '') {
                    $basis[$sleutel] = (string) $eigen[$sleutel];
                }
            }
        } elseif ($soort === 'klasse') {
            $klasse = Mymmo_Forms_Entrypoints::klasse_van($ingang);
            if ($klasse === '') {
                return current_user_can('manage_options')
                    ? self::notice('De ingang "' . esc_html((string) ($ingang['name'] ?? ''))
                        . '" heeft geen klasse. Zonder klasse is er niets dat het venster opent.')
                    : '';
            }
            $basis['trigger'] = '.' . $klasse;
        }

        // Welk tabblad opengaat. Alleen voor een knop of een klasse: bij een
        // callout wordt dat hieronder bepaald door wat ze uitlicht, en een
        // ander tabblad zou het uitgelichte onderdeel nergens heen laten gaan.
        if ($soort !== 'callout'
            && in_array((string) ($eigen['tab'] ?? ''), ['form', 'extra', 'calendly'], true)) {
            $basis['tab'] = (string) $eigen['tab'];
        }

        // ── Wat een callout uitlicht ────────────────────────────────────────
        // Een stap-id, het FORMULIER, of de AGENDA. Dat bepaalt twee dingen: wat
        // er in het kaartje staat, en waar het venster op opengaat.
        $uitgelicht  = '';
        $dok_index   = -1;
        $callout_tab = 'form';

        if ($soort === 'callout') {
            $uitgelicht = trim((string) ($eigen['highlight'] ?? ''));

            if ($uitgelicht === Mymmo_Forms_Entrypoints::HIGHLIGHT_CALENDLY) {
                // De agenda staat niet in de reeks; het kaartje krijgt een eigen
                // kalender. Zie templates/callout.php voor waarom die niet mee
                // verhuist zoals een stap dat wel doet.
                $callout_tab = 'calendly';
            } elseif ($uitgelicht === '' || $uitgelicht === Mymmo_Forms_Entrypoints::HIGHLIGHT_FORM) {
                $uitgelicht  = Mymmo_Forms_Entrypoints::HIGHLIGHT_FORM;
                $callout_tab = 'form';
            } else {
                // Een STAP: die komt vooraan in het venster te staan, want de
                // bezoeker heeft hem in de pagina al beantwoord. De rest schuift
                // erachter aan, in zijn eigen volgorde.
                //
                // BIJ WELK TABBLAD hoort die stap? Een venster kan TWEE reeksen
                // hebben: `steps` op het formulier-tabblad en `extra_steps` op
                // het derde ("Bereken je prijs" naast "Stuur een bericht"). Dat
                // stond hier vast op het formulier-tabblad, en dan belandde de
                // reeks bij het verkeerde formulier -- dat de verborgen velden
                // van die stappen niet heeft. Je zag het aan twee dingen: het
                // tabblad "Stuur een bericht" toonde de stappenreeks, en er
                // stond een melding dat aantal_kavels nergens heen kon.
                $stap_id     = Mymmo_Forms_Steps::sanitize_id($uitgelicht);
                $callout_tab = self::tabblad_van_stap($basis, $stap_id);
                $sleutel     = $callout_tab === 'extra' ? 'extra_steps' : 'steps';

                $basis[$sleutel] = self::steps_met_eerst((string) ($basis[$sleutel] ?? ''), $stap_id);
                $dok_index       = 0;
            }

            // Het venster gaat open op het tabblad waar het uitgelichte
            // onderdeel staat. Anders klikt de bezoeker op iets dat hij al
            // ingevuld heeft en komt hij op een ander scherm uit.
            $basis['tab'] = $callout_tab;
        }

        $args = self::venster_args(
            shortcode_atts(self::VENSTER_ATTS, $basis, 'mymmo_form_entry'),
            'mymmo_form_entry'
        );

        if (array_key_exists('fout', $args)) {
            return (string) $args['fout'] === '' ? '' : self::notice((string) $args['fout']);
        }

        if ($soort !== 'callout') {
            return mymmo_forms_render('modal', $args);
        }

        wp_enqueue_style('mymmo-forms-callout');

        // Het FORMULIER is de laatste sectie van de reeks. Hoeveel stappen
        // ervoor staan, bepaalt zijn nummer -- en dus welke sectie er gedokt
        // wordt.
        if ($uitgelicht === Mymmo_Forms_Entrypoints::HIGHLIGHT_FORM) {
            $ontbrekend = [];
            $dok_index  = count(Mymmo_Forms_Steps::resolve((string) ($basis['steps'] ?? ''), $ontbrekend));
        }

        $args['dok_index'] = $dok_index;
        $args['naakt']     = $dok_index >= 0;

        // De reeks gaat OM het venster en de callout heen. Zonder dat staat het
        // uitgelichte onderdeel in de pagina buiten zijn eigen reeks en kan het
        // zijn waarde nergens kwijt. Bij een agenda-callout is er niets te
        // verhuizen en blijft de reeks dus gewoon in het venster.
        if ($dok_index >= 0) {
            $teksten = Mymmo_Forms_I18n::step_messages($args['form'], (string) $args['lang']);
            $args['wikkel_attr'] = [
                'data-mymmo-stappen'  => '',
                'data-mymmo-start'    => (string) (is_array($args['flash'] ?? null) ? $dok_index : 0),
                'data-mymmo-slug'     => (string) $args['slug'],
                'data-mymmo-teksten'  => (string) wp_json_encode($teksten),
                'data-mymmo-dok-stap' => (string) $dok_index,
            ];
        }

        $args['wikkel_class'] = 'mymmo-callout-wikkel';
        $args['callout']      = [
            'uitgelicht' => $uitgelicht,
            // Bij welk tabblad het kaartje hoort. templates/modal.php dokt daar
            // de sectie uit en zet er het anker.
            'tab'        => $callout_tab,
            'titel'      => sanitize_text_field((string) ($eigen['title'] ?? '')),
            'titel_kort' => sanitize_text_field((string) ($eigen['title_mobile'] ?? '')),
            'tekst'      => sanitize_text_field((string) ($eigen['text'] ?? '')),
            'cta'        => trim((string) ($eigen['cta'] ?? '')) !== ''
                ? sanitize_text_field((string) $eigen['cta'])
                : (string) $args['label'],
            'beeld'      => self::image_url((string) ($eigen['image'] ?? '')),
            'beeld_alt'  => trim((string) ($eigen['image_alt'] ?? '')),
            'layout'     => strtolower(trim((string) ($eigen['layout'] ?? ''))) === Mymmo_Forms_Entrypoints::LAYOUT_BREED
                ? Mymmo_Forms_Entrypoints::LAYOUT_BREED
                : Mymmo_Forms_Entrypoints::LAYOUT_KOLOMMEN,
            'klasse'     => self::classes((string) ($eigen['class'] ?? '')),
            'stijl'      => self::callout_stijl($eigen),
        ];

        return mymmo_forms_render('modal', $args);
    }


    /**
     * Bij welk TABBLAD hoort deze stap?
     *
     * Een venster kan twee reeksen hebben: `steps` op het formulier-tabblad en
     * `extra_steps` op het derde. Staat de stap in geen van beide, dan valt de
     * keuze op de reeks die er al is -- `step=` zeggen betekent dat hij erbij
     * hoort, en hem bij een leeg formulier-tabblad zetten terwijl de echte
     * reeks op het derde staat, is nooit wat iemand bedoelt.
     *
     * @param array<string,string> $basis
     */
    private static function tabblad_van_stap(array $basis, string $stap_id): string {
        $stappen = (string) ($basis['steps'] ?? '');
        $extra   = (string) ($basis['extra_steps'] ?? '');

        if (self::stap_in_lijst($extra, $stap_id)) {
            return 'extra';
        }
        if (self::stap_in_lijst($stappen, $stap_id)) {
            return 'form';
        }

        return trim($stappen) === '' && trim($extra) !== '' ? 'extra' : 'form';
    }

    /** Staat deze stap in die komma-gescheiden lijst? */
    private static function stap_in_lijst(string $lijst, string $stap_id): bool {
        if ($stap_id === '') {
            return false;
        }

        foreach (preg_split('/[,\|]/', $lijst) ?: [] as $naam) {
            if (Mymmo_Forms_Steps::sanitize_id((string) $naam) === $stap_id) {
                return true;
            }
        }

        return false;
    }

    /**
     * De stappen, met een bepaalde stap vooraan.
     *
     * Staat die stap niet in de lijst, dan komt hij er alsnog voor: `step=`
     * zeggen betekent dat hij erbij hoort. Stil weglaten zou een callout
     * opleveren die iets vraagt dat nergens meer terugkomt.
     */
    private static function steps_met_eerst(string $lijst, string $eerst): string {
        $namen = [];
        foreach (preg_split('/[,\|]/', $lijst) ?: [] as $naam) {
            $id = Mymmo_Forms_Steps::sanitize_id((string) $naam);
            if ($id !== '' && !in_array($id, $namen, true)) {
                $namen[] = $id;
            }
        }

        if ($eerst !== '') {
            $namen = array_values(array_diff($namen, [$eerst]));
            array_unshift($namen, $eerst);
        }

        return implode(',', $namen);
    }

    /**
     * De CSS-variabelen van het callout-blok: achtergrond en de schaal van de
     * tekening. Dezelfde vormcontrole als overal -- dit belandt in een
     * style-attribuut op de pagina van een bezoeker.
     *
     * @param array<string,string> $atts
     */
    private static function callout_stijl(array $atts): string {
        $stukken = [];

        // De tint. `transparent` is hier een geldige keuze en geen kleur: dan
        // staat het uitgelichte onderdeel los op de pagina, zonder vlak eromheen.
        // mymmo_forms_color() laat enkel hex en rgb() door -- terecht, want die
        // functie voedt ook het thema van het formulier -- dus dit ene
        // sleutelwoord staat hier, bij de callout.
        $ruwe_kleur = strtolower(trim((string) ($atts['bg'] ?? '')));
        if ($ruwe_kleur === 'transparent' || $ruwe_kleur === 'geen') {
            $stukken[] = '--mf-callout-bg:transparent';
        } else {
            $achtergrond = mymmo_forms_color((string) ($atts['bg'] ?? ''));
            if ($achtergrond !== '') {
                $stukken[] = '--mf-callout-bg:' . $achtergrond;
            }
        }

        $schaal = mymmo_forms_scale((string) ($atts['image_scale'] ?? ''));
        if ($schaal !== '') {
            $stukken[] = '--mf-callout-fig-scale:' . $schaal;
        }

        // De hoeken van het blok. `0` maakt het vierkant.
        $hoeken = mymmo_forms_length((string) ($atts['radius'] ?? ''));
        if ($hoeken !== '') {
            $stukken[] = '--mf-callout-radius:' . $hoeken;
        }

        // De opvulling van het blok, en apart die op een telefoon. Twee waarden
        // en niet een: wie hier 62px zijmarge zet om gelijk te lopen met de
        // kaarten op zijn pagina, wil dat op 375px zeker niet.
        $opvulling = mymmo_forms_spacing((string) ($atts['pad'] ?? ''));
        if ($opvulling !== '') {
            $stukken[] = '--mf-callout-pad:' . $opvulling;
        }

        $opvulling_mobiel = mymmo_forms_spacing((string) ($atts['pad_mobile'] ?? ''));
        if ($opvulling_mobiel !== '') {
            $stukken[] = '--mf-callout-pad-mobiel:' . $opvulling_mobiel;
        }

        // De inspringing van de tekstkolom, en apart die op een telefoon.
        $tekst_pad = mymmo_forms_spacing((string) ($atts['text_pad'] ?? ''));
        if ($tekst_pad !== '') {
            $stukken[] = '--mf-callout-tekst-pad:' . $tekst_pad;
        }

        $tekst_pad_mobiel = mymmo_forms_spacing((string) ($atts['text_pad_mobile'] ?? ''));
        if ($tekst_pad_mobiel !== '') {
            $stukken[] = '--mf-callout-tekst-pad-mobiel:' . $tekst_pad_mobiel;
        }

        // De ruimte tussen de titel en de tekst eronder.
        $kop_ruimte = mymmo_forms_length((string) ($atts['title_gap'] ?? ''));
        if ($kop_ruimte !== '') {
            $stukken[] = '--mf-callout-kop-gap:' . $kop_ruimte;
        }

        // Tot hoever het blok uit de inhoudskolom breekt.
        $breedte = mymmo_forms_length((string) ($atts['max_width'] ?? ''));
        if ($breedte !== '') {
            $stukken[] = '--mf-callout-max:' . $breedte;
        }

        // De ruimte boven en onder. Zonder dit plakt het blok tegen wat erboven
        // staat -- een callout is een op zichzelf staand blok, geen alinea.
        $ruimte = mymmo_forms_length((string) ($atts['space'] ?? ''));
        if ($ruimte !== '') {
            $stukken[] = '--mf-callout-ruimte:' . $ruimte;
        }

        // De kolomverhouding, uit een gesloten lijst -- nooit wat er getypt is.
        $verdeling = (string) ($atts['ratio'] ?? '');
        if (isset(Mymmo_Forms_Entrypoints::VERDELINGEN[$verdeling])) {
            $stukken[] = '--mf-callout-verdeling:' . Mymmo_Forms_Entrypoints::VERDELINGEN[$verdeling][1];
        }

        return implode(';', $stukken);
    }

    /**
     * De volgorde van de tabbladen.
     *
     * Wat er in `tab_order` staat telt eerst, in die volgorde; wat ontbreekt
     * schuift achteraan aan in de vaste volgorde. Zo kan je met
     * `tab_order="extra"` het derde tabblad vooraan zetten zonder de andere
     * twee te moeten opnoemen -- en levert een typefout nooit een venster
     * zonder tabbladen op, want alles wat niet genoemd is komt er alsnog bij.
     *
     * Tabbladen die er niet ZIJN (geen agenda, geen derde formulier) vallen
     * hier weg: de volgorde gaat over wat er staat, niet over wat er zou kunnen
     * staan.
     *
     * @return array<int,string>
     */
    private static function tab_order(string $ruw, bool $heeft_agenda, bool $heeft_extra): array {
        $bestaat = ['form'];
        if ($heeft_extra) {
            $bestaat[] = 'extra';
        }
        if ($heeft_agenda) {
            $bestaat[] = 'calendly';
        }

        $uit = [];
        foreach (preg_split('/[,\|]/', $ruw) ?: [] as $naam) {
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
     * Een bewaarde opstelling onder de getypte attributen schuiven.
     *
     * De opstelling is de BASIS; wat er in de shortcode zelf staat wint. Wie op
     * één pagina een andere knoptekst typt, bedoelt dat -- en moet daarvoor geen
     * tweede opstelling hoeven maken.
     *
     * Dit gebeurt VÓÓR shortcode_atts(). Daarna hebben alle attributen een
     * waarde (de standaarden) en is niet meer te zien wat er echt getypt is; de
     * opstelling zou dan nooit meer kunnen winnen van een standaardwaarde.
     *
     * @param array<string,string>|string $atts
     * @return array<string,string>
     */
    private static function met_opstelling($atts): array {
        $getypt = is_array($atts) ? $atts : [];

        $id = sanitize_title((string) ($getypt['preset'] ?? ''));
        if ($id === '' || !class_exists('Mymmo_Forms_Presets')) {
            return $getypt;
        }

        $opstelling = Mymmo_Forms_Presets::atts($id);
        if ($opstelling === []) {
            // Bestaat niet (meer). Niet stil doorgaan met een lege shortcode:
            // dan staat er op een pagina niets en zoekt iemand het in de
            // Operations Manager. De aanroeper toont de melding voor beheerders
            // zodra er geen slug overblijft.
            return $getypt;
        }

        return array_merge($opstelling, $getypt);
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

    /**
     * Het pad dat als conversie gemeld wordt, of '' als er niets bruikbaars staat.
     *
     * Dit is wat vroeger de bedankpagina was: `/bedankt/offerte`. Het gaat niet
     * naar een browser om naartoe te navigeren -- het reist mee in de
     * dataLayer-gebeurtenis, zodat een virtuele pageview in GTM hetzelfde doel
     * kan blijven voeden als toen er nog echt een pagina geladen werd.
     *
     * Alleen een PAD, geen volledige URL: een adres op een ander domein zou in
     * de statistieken van die site terechtkomen en niet in de onze, en het is
     * bovendien de enige vorm die GA hier verwacht.
     */
    private static function goal(string $ruw): string {
        $pad = trim($ruw);
        if ($pad === '') {
            return '';
        }
        if ($pad[0] !== '/') {
            $pad = '/' . $pad;
        }
        // Geen protocol, geen host, geen aanhalingstekens: dit belandt in een
        // data-attribuut en daarna in een gebeurtenis.
        $pad = (string) preg_replace('/[^A-Za-z0-9_\-\/.?=&%]/', '', $pad);

        return substr($pad, 0, 200);
    }

    /**
     * De ruimte TUSSEN de velden, als stukje style-attribuut.
     *
     * Er stond hier tot 1.15.4 ook padding_x/padding_y bij, voor de ruimte ROND
     * het formulier. Die is weg en niet vervangen: in een pagina levert het blok
     * eromheen die ruimte, en in de pop-up het paneel -- met één vaste waarde
     * per schermbreedte, voor een formulier en een stappenreeks dezelfde. Zolang
     * het instelbaar was, telde het in het venster OP bij de opvulling van het
     * paneel, maar alleen bij een stappenreeks; dezelfde inhoud stond daardoor
     * op het ene tabblad verder van de rand dan op het andere.
     *
     * @param array<string,string> $atts
     */
    private static function gap_style(array $atts): string {
        $tussen = mymmo_forms_length((string) ($atts['gap'] ?? ''));

        return $tussen === '' ? '' : '--mf-gap:' . $tussen;
    }

    /**
     * De afbeelding voor de zijkolom, of '' als er niets bruikbaars staat.
     *
     * esc_url_raw laat http(s), een pad op deze site en een protocol-relatieve
     * URL door en gooit de rest weg. Een javascript:-URL in een src is geen
     * theoretisch geval: deze shortcode staat in een pagina die ook een redacteur
     * mag bewerken.
     */
    private static function image_url(string $ruw): string {
        return (string) esc_url_raw(trim($ruw));
    }

    /**
     * De opsomming in de zijkolom: gescheiden met een |.
     *
     * Waarom een | en niet een komma: in "Binnen 1 werkdag, ook in het weekend"
     * hoort die komma bij de zin. Maximaal zes punten -- daarboven leest het
     * niet meer als geruststelling maar als voorwaarden.
     *
     * @return array<int,string>
     */
    private static function points(string $ruw): array {
        $uit = [];
        foreach (explode('|', $ruw) as $punt) {
            $punt = trim($punt);
            if ($punt !== '') {
                $uit[] = $punt;
            }
        }
        return array_slice($uit, 0, 6);
    }

    /**
     * De CSS-selector van bestaande knoppen die dit venster openen.
     *
     * Hij belandt in een data-attribuut (esc_attr) en gaat in de browser door
     * querySelectorAll, dat in een try/catch staat -- een selector met een
     * typefout doet dus niets in plaats van het script te breken. Wat hier
     * weggaat is enkel de < en wat stuurtekens. Een > blijft staan -- dat is de
     * kindcombinator in ".hero > a" -- en aanhalingstekens ook, want
     * [href="#x"] is een doodgewone selector en esc_attr maakt er &quot; van,
     * dat de browser gewoon weer uitpakt.
     */
    private static function trigger(string $ruw): string {
        $schoon = preg_replace('/[<\x00-\x1f]/', '', trim($ruw));
        return substr((string) $schoon, 0, 200);
    }

    private static function notice(string $message): string {
        return '<div class="mymmo-form-notice mymmo-form-notice--admin">' . $message . '</div>';
    }
}
