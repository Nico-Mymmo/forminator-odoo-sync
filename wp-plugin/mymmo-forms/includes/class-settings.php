<?php
/**
 * Instellingen: Instellingen -> Mymmo Forms.
 *
 * TWEE tabbladen, en de volgorde is het punt:
 *
 *   1. "Shortcode maken"  -- waar iemand elke week komt. Kiezen en kopiëren,
 *                            meer niet. Er staat hier niets dat stuk kan.
 *   2. "Verbinding"       -- waar iemand één keer komt. De URL van de
 *                            Operations Manager, de sitesleutel, de cacheduur.
 *
 * Ze stonden eerst onder elkaar op één pagina, met de sleutel bovenaan. Wie
 * alleen een shortcode kwam halen, scrolde daar elke keer langs -- en een
 * tekstveld waar per ongeluk in getypt wordt, haalt elk formulier op elke
 * pagina van de site tegelijk onderuit. Dat risico hoort niet op het scherm van
 * wie een shortcode zoekt.
 *
 * Alles wat een formulier BETREFT (velden, labels, talen, bedanktekst, kleuren)
 * staat in de OM -- dat hier ook kunnen instellen zou een tweede waarheid maken.
 *
 * De sitesleutel wordt nooit voluit teruggetoond. Een beheerder die 'm moet
 * vervangen, plakt gewoon een nieuwe; iemand die over de schouder meekijkt op
 * een gedeeld scherm hoort 'm niet te kunnen lezen.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Settings {

    private const GROUP = 'mymmo_forms';
    private const PAGE  = 'mymmo-forms';

    private const TAB_SHORTCODE  = 'shortcode';
    private const TAB_VERBINDING = 'verbinding';

    /** Hooksuffix van de instellingenpagina, om er enkel daar JS te laden. */
    private static string $hook = '';

    public static function init(): void {
        add_action('admin_menu', [self::class, 'add_page']);
        add_action('admin_init', [self::class, 'register']);
        add_action('admin_post_mymmo_forms_purge', [self::class, 'handle_purge']);
        add_action('admin_post_mymmo_forms_reload_index', [self::class, 'handle_reload_index']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue']);
        // Het levende voorbeeld in de bouwer. Alleen voor wie de pagina ook mag
        // zien; het rendert een formulier uit de OM en dat is niets voor een
        // abonnee met een geldige nonce.
        add_action('wp_ajax_mymmo_forms_preview', [self::class, 'handle_preview']);
    }

    public static function add_page(): void {
        self::$hook = (string) add_options_page(
            'Mymmo Forms',
            'Mymmo Forms',
            'manage_options',
            self::PAGE,
            [self::class, 'render_page']
        );
    }

    /**
     * De shortcode-bouwer heeft een klein scriptje. Alleen op deze pagina
     * inladen: een beheerscherm van iemand anders heeft er niets aan.
     */
    public static function enqueue(string $hook): void {
        if ($hook !== self::$hook) {
            return;
        }
        wp_enqueue_script(
            'mymmo-forms-admin',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-admin.js',
            [],
            MYMMO_FORMS_VERSION,
            true
        );

        wp_enqueue_style(
            'mymmo-forms-admin',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms-admin.css',
            [],
            MYMMO_FORMS_VERSION
        );

        // De mediabibliotheek van WordPress, voor de afbeelding in de zijkolom.
        // Een URL laten overtypen is de omweg; hier staat het bestand al.
        wp_enqueue_media();

        wp_enqueue_script(
            'mymmo-forms-preview',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-preview.js',
            ['mymmo-forms-admin'],
            MYMMO_FORMS_VERSION,
            true
        );

        // De stylesheets en het script van de POP-UP ZELF gaan mee naar het
        // voorbeeld-iframe. Dat is het hele punt: het voorbeeld draait op
        // precies dezelfde bestanden als een bezoeker, dus het kan niet liegen
        // over hoe het venster eruitziet. Zelfde afspraak als het
        // voorbeeld-iframe in de formulierbouwer van de Operations Manager.
        $v = '?ver=' . rawurlencode(MYMMO_FORMS_VERSION);
        wp_localize_script('mymmo-forms-preview', 'MymmoFormsPreview', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('mymmo_forms_preview'),
            'css'     => [
                MYMMO_FORMS_URL . 'assets/css/mymmo-forms.css' . $v,
                MYMMO_FORMS_URL . 'assets/css/mymmo-forms-modal.css' . $v,
            ],
            'js'      => [
                MYMMO_FORMS_URL . 'assets/js/mymmo-forms.js' . $v,
                MYMMO_FORMS_URL . 'assets/js/mymmo-forms-modal.js' . $v,
            ],
        ]);
    }

    /**
     * De attributen die het voorbeeld mag meekrijgen.
     *
     * Een gesloten lijst, en niet "alles wat er binnenkomt": deze waarden gaan
     * rechtstreeks naar de shortcode-renderer. Wat er niet in staat, bestaat
     * voor het voorbeeld niet.
     */
    private const PREVIEW_ATTS = Mymmo_Forms_Presets::ATTS;

    /**
     * Het venster echt renderen voor het voorbeeld in de bouwer.
     *
     * Geen aparte "voorbeeldweergave": dit is dezelfde aanroep die de shortcode
     * op een pagina doet. Zou het voorbeeld zijn eigen HTML maken, dan is het
     * precies zo betrouwbaar als de laatste keer dat iemand beide gelijk zette
     * -- en dat is de reden dat er nu nog gepubliceerd moet worden om te zien
     * of iets klopt.
     */
    public static function handle_preview(): void {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Geen toegang.'], 403);
        }
        check_ajax_referer('mymmo_forms_preview', 'nonce');

        $atts = [];
        foreach (self::PREVIEW_ATTS as $naam) {
            if (isset($_POST[$naam])) {
                $atts[$naam] = sanitize_text_field(wp_unslash((string) $_POST[$naam]));
            }
        }

        if (($atts['slug'] ?? '') === '') {
            wp_send_json_error(['message' => 'Kies eerst een formulier.'], 400);
        }

        $knop = isset($_POST['soort']) && $_POST['soort'] === 'knop';

        $html = $knop
            ? Mymmo_Forms_Shortcodes::render_button($atts)
            : Mymmo_Forms_Shortcodes::render([
                'slug'  => $atts['slug'],
                'title' => $atts['title'] ?? 'yes',
                'lang'  => $atts['lang'] ?? '',
            ]);

        if (trim($html) === '') {
            wp_send_json_error(['message' => 'Dit formulier kon niet opgehaald worden.'], 502);
        }

        wp_send_json_success(['html' => $html, 'soort' => $knop ? 'knop' : 'inline']);
    }

    public static function register(): void {
        register_setting(self::GROUP, 'mymmo_forms_api_base', [
            'type'              => 'string',
            'sanitize_callback' => [self::class, 'sanitize_base'],
            'default'           => '',
        ]);

        register_setting(self::GROUP, 'mymmo_forms_site_key', [
            'type'              => 'string',
            'sanitize_callback' => [self::class, 'sanitize_key_value'],
            'default'           => '',
        ]);

        register_setting(self::GROUP, 'mymmo_forms_follow_theme', [
            'type'              => 'boolean',
            'sanitize_callback' => static fn ($v) => $v ? 1 : 0,
            'default'           => 1,
        ]);

        register_setting(self::GROUP, 'mymmo_forms_cache_ttl', [
            'type'              => 'integer',
            'sanitize_callback' => static fn ($v) => max(0, min(3600, (int) $v)),
            'default'           => 300,
        ]);
    }

    public static function sanitize_base($value): string {
        $url = esc_url_raw(trim((string) $value));
        // Enkel https: de sitesleutel gaat in een header mee, en die hoort niet
        // over een onversleutelde verbinding.
        if ($url !== '' && !str_starts_with($url, 'https://')) {
            add_settings_error(self::GROUP, 'base', 'De basis-URL moet met https:// beginnen.');
            return (string) get_option('mymmo_forms_api_base', '');
        }
        return rtrim($url, '/');
    }

    /**
     * Een leeg veld betekent "niet wijzigen", niet "wissen". Anders wist een
     * beheerder de sleutel door het formulier op te slaan zonder 'm opnieuw te
     * typen -- en die staat er als bolletjes, dus dat gebeurt gegarandeerd.
     */
    public static function sanitize_key_value($value): string {
        $ingevuld = trim((string) $value);
        if ($ingevuld === '') {
            return (string) get_option('mymmo_forms_site_key', '');
        }
        return sanitize_text_field($ingevuld);
    }

    /** De URL van deze pagina, op een bepaald tabblad. */
    private static function tab_url(string $tab, array $extra = []): string {
        $url = admin_url('options-general.php?page=' . self::PAGE . '&tab=' . $tab);
        foreach ($extra as $sleutel => $waarde) {
            $url = add_query_arg($sleutel, $waarde, $url);
        }
        return $url;
    }

    private static function huidige_tab(): string {
        $tab = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : '';
        return $tab === self::TAB_VERBINDING ? self::TAB_VERBINDING : self::TAB_SHORTCODE;
    }

    public static function handle_purge(): void {
        if (!current_user_can('manage_options') || !check_admin_referer('mymmo_forms_purge')) {
            wp_die('Geen toegang.');
        }

        Mymmo_Forms_Cache::purge_all();
        // Terug naar het tabblad waar de knop stond, niet naar het eerste.
        wp_safe_redirect(self::tab_url(self::TAB_VERBINDING, ['mymmo_purged' => '1']));
        exit;
    }

    /**
     * Alleen de FORMULIERENLIJST opnieuw ophalen. Bewust los van "Cache legen":
     * dat gooit ook de bewaarde formulieren weg die de website nodig heeft, en
     * daar is geen enkele reden voor als je gewoon een nieuw formulier in de
     * lijst wil zien.
     */
    public static function handle_reload_index(): void {
        if (!current_user_can('manage_options') || !check_admin_referer('mymmo_forms_reload_index')) {
            wp_die('Geen toegang.');
        }

        Mymmo_Forms_Cache::purge_index();
        Mymmo_Forms_Api_Client::list_forms(true);

        wp_safe_redirect(self::tab_url(self::TAB_SHORTCODE, ['mymmo_reloaded' => '1']));
        exit;
    }

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $tab = self::huidige_tab();
        ?>
        <div class="wrap">
            <h1>Mymmo Forms</h1>

            <h2 class="nav-tab-wrapper">
                <a href="<?php echo esc_url(self::tab_url(self::TAB_SHORTCODE)); ?>"
                   class="nav-tab <?php echo $tab === self::TAB_SHORTCODE ? 'nav-tab-active' : ''; ?>">
                    Shortcode maken
                </a>
                <a href="<?php echo esc_url(self::tab_url(self::TAB_VERBINDING)); ?>"
                   class="nav-tab <?php echo $tab === self::TAB_VERBINDING ? 'nav-tab-active' : ''; ?>">
                    Verbinding
                </a>
            </h2>

            <?php
            if ($tab === self::TAB_VERBINDING) {
                self::render_verbinding();
            } else {
                self::render_shortcode();
            }
            ?>
        </div>
        <?php
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tabblad 1: shortcode maken
    // ─────────────────────────────────────────────────────────────────────────

    private static function render_shortcode(): void {
        $formulieren = Mymmo_Forms_Api_Client::list_forms();
        $lijstfout   = $formulieren === null ? (string) Mymmo_Forms_Api_Client::last_error() : '';

        // De afspraken komen uit hetzelfde antwoord (dus geen tweede verzoek):
        // de Calendly-koppelingen in de Operations Manager met een bewaarde
        // boekingspagina. Is die lijst leeg of niet op te halen, dan valt het
        // agendaveld terug op een tekstvak -- een knop met venster maken mag
        // nooit afhangen van of Calendly hier bekend is.
        $afspraken = Mymmo_Forms_Api_Client::list_calendly();
        if (!is_array($afspraken)) {
            $afspraken = [];
        }
        ?>

        <?php if (!empty($_GET['mymmo_reloaded'])) : ?>
            <div class="notice notice-success is-dismissible"><p>De formulierenlijst is opnieuw opgehaald.</p></div>
        <?php endif; ?>

        <?php
        $melding = isset($_GET['mymmo_preset']) ? sanitize_key(wp_unslash((string) $_GET['mymmo_preset'])) : '';
        $meldingen = [
            'opgeslagen'     => ['success', 'De opstelling is bewaard. Elke pagina die ze gebruikt, toont meteen de nieuwe versie.'],
            'verwijderd'     => ['success', 'De opstelling is verwijderd. Pagina\'s die ze nog gebruiken tonen nu niets meer — vervang daar de shortcode of het blok.'],
            'vol'            => ['error', 'Er passen niet meer opstellingen bij. Verwijder er een die je niet meer gebruikt.'],
            'geen-formulier' => ['error', 'Er was geen formulier gekozen, dus er viel niets te bewaren.'],
        ];
        ?>
        <?php if (isset($meldingen[$melding])) : ?>
            <div class="notice notice-<?php echo esc_attr($meldingen[$melding][0]); ?> is-dismissible">
                <p><?php echo esc_html($meldingen[$melding][1]); ?></p>
            </div>
        <?php endif; ?>

        <p>
            Kies een formulier, kopieer de shortcode en plak ze op de pagina waar het formulier moet staan.
            Formulieren zelf maak je in de Operations Manager, onder <strong>Koppelingen</strong>.
        </p>

        <?php if (!mymmo_forms_is_configured()) : ?>
            <div class="notice notice-warning">
                <p>
                    De verbinding met de Operations Manager is nog niet ingesteld, dus er valt nog niets op te halen.
                    Dat doe je eenmalig op het tabblad <a href="<?php echo esc_url(self::tab_url(self::TAB_VERBINDING)); ?>">Verbinding</a>.
                </p>
            </div>
            <?php return; ?>
        <?php endif; ?>

        <?php if ($lijstfout !== '') : ?>
            <div class="notice notice-error">
                <p><strong>De formulieren konden niet opgehaald worden.</strong></p>
                <p><?php echo esc_html($lijstfout); ?></p>
            </div>
        <?php elseif ($formulieren === []) : ?>
            <div class="notice notice-warning">
                <p>
                    Er staan nog geen <strong>gepubliceerde</strong> formulieren in de Operations Manager.
                    Een formulier dat nog op concept staat verschijnt hier niet, en toont op de website
                    ook niets — publiceer het eerst bij Koppelingen → tabblad Formulier.
                </p>
            </div>
        <?php else : ?>

            <?php
            // De talen van elk formulier gaan als JSON mee naar de browser, zodat
            // de taalkeuze alleen toont wat DIT formulier echt heeft. Anders
            // bouw je een shortcode met lang="fr" voor een formulier dat geen
            // Frans kent, en dan valt de pagina stil terug op het Nederlands
            // zonder dat iemand het merkt.
            $talen_per_formulier = [];
            foreach ($formulieren as $f) {
                $slug = (string) ($f['slug'] ?? '');
                if ($slug === '') {
                    continue;
                }
                $talen_per_formulier[$slug] = [
                    'languages' => array_values(array_map('strval', (array) ($f['languages'] ?? ['nl']))),
                    'default'   => (string) ($f['default_language'] ?? 'nl'),
                ];
            }
            $eerste = (string) ($formulieren[0]['slug'] ?? '');
            ?>

            <?php $opstellingen = Mymmo_Forms_Presets::all(); ?>

            <div class="mymmo-opstellingen">
                <div class="mymmo-opstellingen-kop">
                    <strong>Opstellingen</strong>
                    <?php
                    // Het versienummer erbij. Bij een plugin die je met de hand
                    // bijwerkt, is "welke versie draait hier eigenlijk" anders
                    // een vraag die je alleen in de pluginlijst beantwoord
                    // krijgt -- en die vraag komt op zodra iets zich anders
                    // gedraagt dan je verwacht.
                    ?>
                    <span class="mymmo-versie">v<?php echo esc_html(MYMMO_FORMS_VERSION); ?></span>
                    <span class="description">
                        Bewaar wat je hieronder maakt onder een naam, en zet het met één shortcode of
                        met het blok <strong>Mymmo formulier</strong> op zoveel pagina's als je wil.
                        Eén wijziging werkt overal door.
                    </span>
                </div>

                <?php if ($opstellingen) : ?>
                    <div class="mymmo-opstellingen-rij">
                        <?php foreach ($opstellingen as $opstelling) : ?>
                            <button type="button" class="button mymmo-opstelling-knop"
                                    data-mymmo-preset-load="<?php echo esc_attr($opstelling['id']); ?>"
                                    data-mymmo-preset-name="<?php echo esc_attr($opstelling['name']); ?>"
                                    data-mymmo-preset-soort="<?php echo esc_attr($opstelling['soort']); ?>"
                                    data-mymmo-preset-atts="<?php echo esc_attr((string) wp_json_encode($opstelling['atts'])); ?>"
                                    title="Deze opstelling in het voorbeeld openen">
                                <?php echo esc_html($opstelling['name']); ?>
                            </button>
                        <?php endforeach; ?>
                    </div>
                <?php else : ?>
                    <p class="description" style="margin:0 0 8px;">
                        Er is er nog geen. Stel hieronder iets in en bewaar het.
                    </p>
                <?php endif; ?>

                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                      id="mymmoFormsPresetForm" class="mymmo-opstellingen-bewaar">
                    <?php wp_nonce_field('mymmo_forms_preset_save'); ?>
                    <input type="hidden" name="action" value="mymmo_forms_preset_save">
                    <?php
                    // De attributen gaan als JSON mee in één veld, gevuld door
                    // het script van de bouwer. Twintig losse verborgen velden
                    // die met de hand synchroon gehouden moeten worden met de
                    // shortcode, is precies hoe ze uit elkaar gaan lopen.
                    ?>
                    <input type="hidden" name="mymmo_preset_atts" id="mymmoFormsPresetAtts" value="">
                    <input type="hidden" name="mymmo_preset_soort" id="mymmoFormsPresetSoort" value="knop">
                    <input type="hidden" name="mymmo_preset_id" id="mymmoFormsPresetId" value="">

                    <label for="mymmoFormsPresetName">Bewaren als</label>
                    <input type="text" id="mymmoFormsPresetName" name="mymmo_preset_name"
                           class="regular-text" placeholder="bv. Offerte — homepage" required>
                    <button type="submit" class="button button-primary">Bewaren</button>
                    <span class="description" id="mymmoFormsPresetStand"></span>
                </form>

                <?php if ($opstellingen) : ?>
                    <details class="mymmo-opstellingen-details">
                        <summary>Shortcodes en beheer</summary>
                        <table class="widefat striped" style="margin-top:8px;">
                            <thead>
                                <tr>
                                    <th>Naam</th>
                                    <th>Formulier</th>
                                    <th>Shortcode</th>
                                    <th style="width:8em;">Actie</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($opstellingen as $opstelling) :
                                    $code = ($opstelling['soort'] === 'inline' ? '[mymmo_form' : '[mymmo_form_button')
                                        . ' preset="' . $opstelling['id'] . '"]';
                                    ?>
                                    <tr>
                                        <td>
                                            <strong><?php echo esc_html($opstelling['name']); ?></strong><br>
                                            <span class="description">
                                                <?php echo $opstelling['soort'] === 'inline' ? 'formulier op de pagina' : 'knop met venster'; ?>
                                            </span>
                                        </td>
                                        <td><code><?php echo esc_html((string) ($opstelling['atts']['slug'] ?? '')); ?></code></td>
                                        <td><code><?php echo esc_html($code); ?></code></td>
                                        <td>
                                            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                                                <?php wp_nonce_field('mymmo_forms_preset_delete'); ?>
                                                <input type="hidden" name="action" value="mymmo_forms_preset_delete">
                                                <input type="hidden" name="mymmo_preset_id" value="<?php echo esc_attr($opstelling['id']); ?>">
                                                <button type="submit" class="button button-small button-link-delete"
                                                        onclick="return confirm('Deze opstelling verwijderen? Pagina\'s die ze gebruiken tonen daarna niets meer.');">Verwijderen</button>
                                            </form>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </details>
                <?php endif; ?>
            </div>

            <?php
            // Het voorbeeld links, de instellingen rechts. Het voorbeeld blijft
            // staan bij het scrollen, zodat je bij elke wijziging ziet wat ze
            // doet -- in plaats van naar beneden te scrollen om iets te zetten
            // en weer omhoog om het te bekijken.
            //
            // Zonder JavaScript blijft dit één kolom met de velden eronder; het
            // canvas is dan `hidden` en de grid heeft maar één kind.
            ?>
            <div class="mymmo-bouwer">
            <div class="mymmo-bouwer-voorbeeld">

            <?php
            // Het canvas staat hidden in de HTML en het script haalt dat weg.
            // Zonder JavaScript is er geen voorbeeld -- dan blijven de
            // tekstvelden hieronder staan (die worden pas verborgen zodra het
            // script ze overneemt) en is de tabel onderaan de terugval.
            ?>
            <div class="mymmo-canvas" id="mymmoFormsCanvas" hidden>
                <div class="mymmo-canvas-bar">
                    <strong>Voorbeeld</strong>
                    <span class="mymmo-canvas-hint">Klik op een tekst in het venster en typ erin.</span>
                    <span class="mymmo-canvas-spacer"></span>
                    <?php
                    // De opvulling hoort bij het voorbeeld en niet bij een
                    // tabel eronder: je stelt ze in terwijl je ziet wat ze doet.
                    // De tekstvelden verderop blijven bestaan voor wie een
                    // exacte waarde wil typen (1.5rem, 4%).
                    ?>
                    <span class="mymmo-canvas-ruimte">
                        <label for="mymmoCanvasPadX" title="Ruimte links en rechts">↔</label>
                        <input type="number" id="mymmoCanvasPadX" min="0" max="120" step="2">
                        <label for="mymmoCanvasPadY" title="Ruimte boven en onder">↕</label>
                        <input type="number" id="mymmoCanvasPadY" min="0" max="120" step="2">
                        <label for="mymmoCanvasGap" title="Ruimte tussen de velden">⇳</label>
                        <input type="number" id="mymmoCanvasGap" min="0" max="60" step="2">
                    </span>
                    <button type="button" class="button button-small is-actief"
                            data-mymmo-device="desktop" aria-pressed="true">Desktop</button>
                    <button type="button" class="button button-small"
                            data-mymmo-device="mobiel" aria-pressed="false">Telefoon</button>
                    <?php
                    // De schaal erbij, want het voorbeeld wordt verkleind om
                    // naast de instellingen te passen. Zonder dit cijfer denk je
                    // dat je naar de echte grootte kijkt.
                    ?>
                    <span class="mymmo-canvas-schaal" data-mymmo-schaal></span>
                </div>
                <div class="mymmo-canvas-stage" data-mymmo-stage>
                    <iframe id="mymmoFormsPreviewFrame" title="Voorbeeld van het venster"></iframe>
                </div>
                <p class="mymmo-canvas-status" data-mymmo-canvas-status aria-live="polite"></p>
            </div>

            </div><?php // .mymmo-bouwer-voorbeeld ?>
            <div class="mymmo-bouwer-instellingen">

            <div class="mymmo-insp">

                <details class="mymmo-groep" open>
                    <summary>Formulier</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld">
                            <label for="mymmoFormsPick">Welk formulier</label>
                            <select id="mymmoFormsPick"
                                    data-mymmo-langs="<?php echo esc_attr((string) wp_json_encode($talen_per_formulier)); ?>">
                                <?php foreach ($formulieren as $f) : ?>
                                    <option value="<?php echo esc_attr((string) ($f['slug'] ?? '')); ?>">
                                        <?php echo esc_html((string) ($f['name'] ?? $f['slug'] ?? '')); ?>
                                        (<?php echo esc_html((string) (int) ($f['field_count'] ?? 0)); ?> velden)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <div class="mymmo-veld">
                            <span class="mymmo-veld-kop">Hoe tonen</span>
                            <label class="mymmo-keuze">
                                <input type="radio" name="mymmoFormsSoort" value="inline" checked>
                                Op de pagina
                            </label>
                            <label class="mymmo-keuze">
                                <input type="radio" name="mymmoFormsSoort" value="knop">
                                Knop die een venster opent
                            </label>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsLang">Taal</label>
                            <select id="mymmoFormsLang">
                                <option value="">Volg de pagina</option>
                            </select>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsTitle">
                                <input type="checkbox" id="mymmoFormsTitle" checked>
                                Titel tonen
                            </label>
                        </div>
                    </div>
                </details>

                <details class="mymmo-groep" data-mymmo-alleen="knop" hidden>
                    <summary>Knop</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <label for="mymmoFormsLabel">Tekst op de knop</label>
                            <input type="text" id="mymmoFormsLabel" placeholder="Naam van het formulier">
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsVariant">Stijl</label>
                            <select id="mymmoFormsVariant">
                                <option value="primary">Gevuld</option>
                                <option value="outline">Omlijnd</option>
                            </select>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsAccentAan">
                                <input type="checkbox" id="mymmoFormsAccentAan">
                                Eigen kleur
                            </label>
                            <input type="color" id="mymmoFormsAccent" value="#2563eb" hidden>
                            <span class="mymmo-hint">Anders volgt de knop je thema.</span>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsAccentText">Tekst op de knoppen</label>
                            <input type="color" id="mymmoFormsAccentText" value="#ffffff">
                            <span class="mymmo-hint">Geldt ook voor het icoon in de gekozen tab.</span>
                        </div>

                        <div class="mymmo-veld">
                            <span class="mymmo-veld-kop">Waar de knop staat</span>
                            <label class="mymmo-keuze">
                                <input type="radio" name="mymmoFormsKnopSoort" value="eigen" checked>
                                Deze shortcode zet hem
                            </label>
                            <label class="mymmo-keuze">
                                <input type="radio" name="mymmoFormsKnopSoort" value="bestaand">
                                Aan een bestaande knop hangen
                            </label>
                            <div id="mymmoFormsBestaand" hidden>
                                <span class="mymmo-hint">
                                    Zet de link van je eigen knop op <code id="mymmoFormsAnker">#mymmo-modal-...</code>
                                </span>
                                <input type="text" id="mymmoFormsTrigger" placeholder="of een CSS-selector: .hero .btn">
                            </div>
                        </div>
                    </div>
                </details>

                <details class="mymmo-groep" data-mymmo-alleen="knop" hidden>
                    <summary>Venster</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <label for="mymmoFormsHeading">Kop</label>
                            <input type="text" id="mymmoFormsHeading" placeholder="Naam van het formulier">
                        </div>

                        <div class="mymmo-veld">
                            <label for="<?php echo $afspraken ? 'mymmoFormsCalendlyPick' : 'mymmoFormsCalendly'; ?>">Agenda</label>
                            <?php if ($afspraken) : ?>
                                <select id="mymmoFormsCalendlyPick">
                                    <option value="">Geen — alleen het formulier</option>
                                    <?php foreach ($afspraken as $afspraak) :
                                        $link = (string) ($afspraak['url'] ?? '');
                                        if ($link === '') {
                                            continue;
                                        }
                                        $label = (string) ($afspraak['name'] ?? $link);
                                        if (!empty($afspraak['duration'])) {
                                            $label .= ' — ' . (int) $afspraak['duration'] . ' min';
                                        }
                                        if (isset($afspraak['active']) && !$afspraak['active']) {
                                            $label .= ' — koppeling staat uit';
                                        }
                                        ?>
                                        <option value="<?php echo esc_attr($link); ?>"><?php echo esc_html($label); ?></option>
                                    <?php endforeach; ?>
                                    <option value="__anders__">Andere link…</option>
                                </select>
                            <?php endif; ?>
                            <input type="url" id="mymmoFormsCalendly" class="code"
                                   placeholder="https://calendly.com/..." <?php echo $afspraken ? 'hidden' : ''; ?>>
                            <?php if (!$afspraken && mymmo_forms_is_configured()) : ?>
                                <span class="mymmo-hint">
                                    Geen gekende afspraken. Open de Calendly-koppeling in de Operations Manager
                                    en klik Opslaan, of
                                    <a href="#mymmoFormsReload">haal de lijst opnieuw op</a>.
                                </span>
                            <?php endif; ?>
                        </div>

                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <span class="mymmo-veld-kop">Opschriften van de tabbladen</span>
                            <input type="text" id="mymmoFormsTabForm" value="Stuur ons een bericht">
                            <input type="text" id="mymmoFormsTabFormSub" placeholder="regeltje eronder">
                            <input type="text" id="mymmoFormsTabCalendly" value="Plan een gesprek">
                            <input type="text" id="mymmoFormsTabCalendlySub" placeholder="regeltje eronder">
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsBgAan">
                                <input type="checkbox" id="mymmoFormsBgAan">
                                Eigen achtergrondkleur
                            </label>
                            <input type="color" id="mymmoFormsBg" value="#f3f6fd" hidden>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsIconAan">
                                <input type="checkbox" id="mymmoFormsIconAan">
                                Eigen kleur voor de iconen
                            </label>
                            <input type="color" id="mymmoFormsIcon" value="#2563eb" hidden>
                            <span class="mymmo-hint">De vinkjes en de iconen in de tabbladen.</span>
                        </div>

                        <div class="mymmo-veld">
                            <span class="mymmo-veld-kop">Ruimte</span>
                            <span class="mymmo-hint">Sneller met de schuifjes bij het voorbeeld.</span>
                            <div class="mymmo-drie">
                                <label for="mymmoFormsPadX">links/rechts
                                    <input type="text" id="mymmoFormsPadX" placeholder="28px"></label>
                                <label for="mymmoFormsPadY">boven/onder
                                    <input type="text" id="mymmoFormsPadY" placeholder="28px"></label>
                                <label for="mymmoFormsGap">tussen velden
                                    <input type="text" id="mymmoFormsGap" placeholder="18px"></label>
                            </div>
                        </div>
                    </div>
                </details>

                <details class="mymmo-groep" data-mymmo-alleen="knop" hidden>
                    <summary>Zijkolom</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <label for="mymmoFormsIntro">Zin onder de kop</label>
                            <input type="text" id="mymmoFormsIntro" placeholder="Omschrijving uit de OM">
                        </div>

                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <label for="mymmoFormsPunten">Geruststelling — één per regel</label>
                            <textarea id="mymmoFormsPunten" rows="3"
                                      placeholder="Antwoord binnen 1 werkdag&#10;Volledig vrijblijvend"></textarea>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsImage">Tekening — tabblad formulier</label>
                            <input type="url" id="mymmoFormsImage" class="code" placeholder="https://...">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsImage"
                                        id="mymmoFormsImagePick" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsImage"
                                        id="mymmoFormsImageClear" hidden>Weghalen</button>
                            </span>
                            <input type="text" id="mymmoFormsImageAlt" placeholder="beschrijving (leeg bij sfeerbeeld)">
                            <div class="mymmo-drie">
                                <label for="mymmoFormsImageScale">schaal %
                                    <input type="number" id="mymmoFormsImageScale" min="10" max="400" step="5" placeholder="100"></label>
                                <label for="mymmoFormsImageX">← → px
                                    <input type="number" id="mymmoFormsImageX" step="2" placeholder="0"></label>
                                <label for="mymmoFormsImageY">↑ ↓ px
                                    <input type="number" id="mymmoFormsImageY" step="2" placeholder="0"></label>
                            </div>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsImageCal">Tekening — tabblad agenda</label>
                            <input type="url" id="mymmoFormsImageCal" class="code" placeholder="https://...">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsImageCal" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsImageCal" hidden>Weghalen</button>
                            </span>
                            <input type="text" id="mymmoFormsImageCalAlt" placeholder="beschrijving (leeg bij sfeerbeeld)">
                            <div class="mymmo-drie">
                                <label for="mymmoFormsImageCalScale">schaal %
                                    <input type="number" id="mymmoFormsImageCalScale" min="10" max="400" step="5" placeholder="volgt"></label>
                                <label for="mymmoFormsImageCalX">← → px
                                    <input type="number" id="mymmoFormsImageCalX" step="2" placeholder="volgt"></label>
                                <label for="mymmoFormsImageCalY">↑ ↓ px
                                    <input type="number" id="mymmoFormsImageCalY" step="2" placeholder="volgt"></label>
                            </div>
                            <span class="mymmo-hint">Leeg = dezelfde stand als de eerste tekening.</span>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsWatermark">Watermerk — achter de tekening</label>
                            <input type="url" id="mymmoFormsWatermark" class="code" placeholder="https://...">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsWatermark" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsWatermark" hidden>Weghalen</button>
                            </span>
                            <div class="mymmo-drie">
                                <label for="mymmoFormsWmScale">schaal %
                                    <input type="number" id="mymmoFormsWmScale" min="10" max="400" step="5" placeholder="100"></label>
                                <label for="mymmoFormsWmX">← → px
                                    <input type="number" id="mymmoFormsWmX" step="2" placeholder="0"></label>
                                <label for="mymmoFormsWmY">↑ ↓ px
                                    <input type="number" id="mymmoFormsWmY" step="2" placeholder="0"></label>
                                <label for="mymmoFormsWmRot">draaien °
                                    <input type="number" id="mymmoFormsWmRot" min="-360" max="360" step="5" placeholder="0"></label>
                            </div>
                            <span class="mymmo-hint">
                                Verankerd linksonder, en blijft staan als je van tabblad wisselt.
                                Je kan alles ook rechtstreeks in het voorbeeld verslepen.
                            </span>
                        </div>

                        <span class="mymmo-hint">Zijkolom en opsomming vallen weg op een telefoon.</span>
                    </div>
                </details>

                <details class="mymmo-groep">
                    <summary>Na het versturen</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld" data-mymmo-alleen="knop" hidden>
                            <label for="mymmoFormsThanksCalendly">Tekst na een geboekt gesprek</label>
                            <input type="text" id="mymmoFormsThanksCalendly"
                                   placeholder="Je gesprek staat ingepland.">
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsGoalForm">Conversiepad — formulier</label>
                            <input type="text" id="mymmoFormsGoalForm" class="code" placeholder="/bedankt/offerte">
                        </div>

                        <div class="mymmo-veld" data-mymmo-alleen="knop" hidden>
                            <label for="mymmoFormsGoalCalendly">Conversiepad — gesprek</label>
                            <input type="text" id="mymmoFormsGoalCalendly" class="code" placeholder="/bedankt/gesprek">
                        </div>

                        <span class="mymmo-hint">
                            Het pad dat vroeger je bedankpagina was. Gaat als <code>page_path</code> naar de
                            dataLayer, voor een virtuele pageview in GTM.
                        </span>
                    </div>
                </details>

                <div class="mymmo-insp-voet">
                    <label for="mymmoFormsShortcode">
                        Shortcode
                        <span class="mymmo-vorm" data-mymmo-vorm></span>
                    </label>
                    <input type="text" id="mymmoFormsShortcode" class="code" readonly
                           value="<?php echo esc_attr('[mymmo_form slug="' . $eerste . '"]'); ?>">
                    <button type="button" class="button button-primary" data-mymmo-copy="mymmoFormsShortcode">Kopieer</button>
                    <span class="mymmo-hint" data-mymmo-vorm-uitleg></span>
                    <?php
                    // De losse versie blijft bereikbaar, maar dichtgeklapt: wie
                    // ze nodig heeft weet waarom, en wie dat niet weet hoort de
                    // herbruikbare te krijgen.
                    ?>
                    <details class="mymmo-los" data-mymmo-los hidden>
                        <summary>Losse versie (volgt geen wijzigingen)</summary>
                        <input type="text" id="mymmoFormsShortcodeLos" class="code" readonly value="">
                        <button type="button" class="button button-small" data-mymmo-copy="mymmoFormsShortcodeLos">Kopieer los</button>
                    </details>
                </div>

            </div>

            </div><?php // .mymmo-bouwer-instellingen ?>
            </div><?php // .mymmo-bouwer ?>

            <h3>Alle gepubliceerde formulieren</h3>
            <table class="widefat striped" style="max-width:1100px;">
                <thead>
                    <tr>
                        <th>Naam</th>
                        <th>Velden</th>
                        <th>Talen</th>
                        <th>Versie</th>
                        <th>Shortcode</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($formulieren as $f) :
                        $slug  = (string) ($f['slug'] ?? '');
                        $talen = array_map('strval', (array) ($f['languages'] ?? ['nl']));
                        ?>
                        <tr>
                            <td>
                                <strong><?php echo esc_html((string) ($f['name'] ?? $slug)); ?></strong>
                                <?php if (!empty($f['description'])) : ?>
                                    <br><span class="description"><?php echo esc_html((string) $f['description']); ?></span>
                                <?php endif; ?>
                            </td>
                            <td><?php echo esc_html((string) (int) ($f['field_count'] ?? 0)); ?></td>
                            <td><?php echo esc_html(strtoupper(implode(', ', $talen))); ?></td>
                            <td><?php echo esc_html((string) (int) ($f['version'] ?? 0)); ?></td>
                            <td><code>[mymmo_form slug="<?php echo esc_html($slug); ?>"]</code></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <p class="description">
                Deze tabel is de terugval als JavaScript niet werkt: elke shortcode staat er volledig,
                klaar om te selecteren en te kopiëren. Wil je een knop met venster, dan is dat dezelfde
                slug in de andere shortcode:
                <code>[mymmo_form_button slug="..." label="Vraag een offerte" calendly="https://calendly.com/..."]</code>
            </p>

        <?php endif; ?>

        <p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                  id="mymmoFormsReload" style="display:inline;">
                <?php wp_nonce_field('mymmo_forms_reload_index'); ?>
                <input type="hidden" name="action" value="mymmo_forms_reload_index">
                <?php submit_button('Lijst opnieuw ophalen', 'secondary', 'submit', false); ?>
            </form>
            <span class="description">
                De lijst wordt een minuut bewaard. Heb je net iets gepubliceerd en zie je het nog niet, klik dan hier.
            </span>
        </p>
        <?php
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tabblad 2: verbinding
    // ─────────────────────────────────────────────────────────────────────────

    private static function render_verbinding(): void {
        $sleutel_gezet = mymmo_forms_site_key() !== '';
        ?>

        <?php if (!empty($_GET['mymmo_purged'])) : ?>
            <div class="notice notice-success is-dismissible"><p>De formuliercache is geleegd.</p></div>
        <?php endif; ?>

        <p>
            Dit stel je één keer in. Daarna hoort hier niets meer te wijzigen —
            wat een formulier toont, beheer je in de Operations Manager.
        </p>

        <form method="post" action="options.php">
            <?php settings_fields(self::GROUP); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mymmo_forms_api_base">Operations Manager</label></th>
                    <td>
                        <input type="url" class="regular-text" id="mymmo_forms_api_base"
                               name="mymmo_forms_api_base"
                               value="<?php echo esc_attr(mymmo_forms_api_base()); ?>"
                               placeholder="https://operations.openvme.be">
                        <p class="description">De basis-URL, zonder pad. Moet https zijn.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmo_forms_site_key">Sitesleutel</label></th>
                    <td>
                        <input type="password" class="regular-text" id="mymmo_forms_site_key"
                               name="mymmo_forms_site_key" value=""
                               autocomplete="new-password"
                               placeholder="<?php echo $sleutel_gezet ? '••••••••  (ingesteld — laat leeg om te behouden)' : 'nog niet ingesteld'; ?>">
                        <p class="description">
                            Komt uit de Cloudflare-secret <code>FORMS_PUBLIC_SITE_KEYS</code>.
                            De sleutel blijft serverside en komt nooit in de HTML van een pagina.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Kleuren</th>
                    <td>
                        <?php $thema_vars = mymmo_forms_site_theme_vars(); ?>
                        <label for="mymmo_forms_follow_theme">
                            <input type="checkbox" id="mymmo_forms_follow_theme"
                                   name="mymmo_forms_follow_theme" value="1"
                                   <?php checked((bool) get_option('mymmo_forms_follow_theme', 1)); ?>>
                            De kleuren van dit thema overnemen
                        </label>

                        <?php if ($thema_vars) : ?>
                            <p style="margin:8px 0 4px;">Gevonden bij de <strong>knop</strong> van dit thema:</p>
                            <ul style="margin:0 0 6px 4px;">
                                <?php foreach ($thema_vars as $variabele => $waarde) :
                                    $isKleur = str_starts_with($waarde, '#') || str_starts_with($waarde, 'rgb');
                                    $naam = [
                                        '--mf-accent'      => 'Achtergrond van de knop',
                                        '--mf-accent-text' => 'Tekst op de knop',
                                        '--mf-radius'      => 'Hoeken',
                                    ][$variabele] ?? $variabele;
                                    ?>
                                    <li style="display:flex;align-items:center;gap:8px;margin:0 0 4px;">
                                        <?php if ($isKleur) : ?>
                                            <span style="display:inline-block;width:18px;height:18px;border:1px solid #c3c4c7;border-radius:3px;background:<?php echo esc_attr($waarde); ?>"></span>
                                        <?php endif; ?>
                                        <span><?php echo esc_html($naam); ?> — <code><?php echo esc_html($waarde); ?></code></span>
                                    </li>
                                <?php endforeach; ?>
                            </ul>
                        <?php else : ?>
                            <p class="description" style="margin:8px 0 4px;">
                                <strong>Dit thema declareert geen knopkleur</strong>, dus er valt niets over te nemen.
                                Dat gebeurt bij een klassiek thema zonder <code>theme.json</code>, of bij een blokthema
                                dat de knop geen eigen kleur geeft (Weergave → Ontwerp → Stijlen → Kleuren → Knop).
                                Het formulier houdt dan de kleur uit de Operations Manager aan.
                            </p>
                        <?php endif; ?>

                        <p class="description">
                            Een formulierknop die naast de knoppen van je site staat en een andere kleur heeft,
                            ziet eruit als een fout. Daarom wint het thema van deze site van de kleur die in de
                            Operations Manager bij het formulier staat — die blijft de terugval voor sites die
                            zelf niets declareren. Een <code>accent="#…"</code> op een losse shortcode wint van
                            allebei.
                        </p>
                        <p class="description">
                            Alleen de <em>knop</em> wordt overgenomen: achtergrond, tekstkleur en hoeken. Bewust
                            niet de tekst- en achtergrondkleuren van de site — bij een donker thema levert dat
                            witte labels op witte invoervelden op, en dat merkt niemand aan onze kant.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmo_forms_cache_ttl">Cacheduur</label></th>
                    <td>
                        <input type="number" min="0" max="3600" step="10" id="mymmo_forms_cache_ttl"
                               name="mymmo_forms_cache_ttl"
                               value="<?php echo esc_attr((string) get_option('mymmo_forms_cache_ttl', 300)); ?>">
                        seconden
                        <p class="description">
                            0 = niet cachen (alleen voor testen). Ook met cache verschijnt een wijziging
                            meteen: het versienummer verandert dan, en de bewaarde versie wordt overgeslagen.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>

        <hr>

        <h2>Cache</h2>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('mymmo_forms_purge'); ?>
            <input type="hidden" name="action" value="mymmo_forms_purge">
            <?php submit_button('Cache legen', 'secondary', 'submit', false); ?>
            <p class="description">
                Nodig als je in de Operations Manager iets wijzigde en het meteen wil zien,
                of als er een oude versie blijft hangen na een storing.
            </p>
        </form>
        <?php
    }
}
