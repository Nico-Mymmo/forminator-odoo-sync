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
        ?>

        <?php if (!empty($_GET['mymmo_reloaded'])) : ?>
            <div class="notice notice-success is-dismissible"><p>De formulierenlijst is opnieuw opgehaald.</p></div>
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

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mymmoFormsPick">Formulier</label></th>
                    <td>
                        <select id="mymmoFormsPick" class="regular-text"
                                data-mymmo-langs="<?php echo esc_attr((string) wp_json_encode($talen_per_formulier)); ?>">
                            <?php foreach ($formulieren as $f) : ?>
                                <option value="<?php echo esc_attr((string) ($f['slug'] ?? '')); ?>">
                                    <?php echo esc_html((string) ($f['name'] ?? $f['slug'] ?? '')); ?>
                                    (<?php echo esc_html((string) (int) ($f['field_count'] ?? 0)); ?> velden)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoFormsLang">Taal</label></th>
                    <td>
                        <select id="mymmoFormsLang" class="regular-text">
                            <option value="">Volg de taal van de pagina</option>
                        </select>
                        <p class="description">
                            Laat dit staan als de pagina zelf al in de juiste taal is — dan kiest het formulier mee.
                            Een taal vastzetten is voor als je bijvoorbeeld een Frans formulier op een Nederlandse pagina wil.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Titel</th>
                    <td>
                        <label for="mymmoFormsTitle">
                            <input type="checkbox" id="mymmoFormsTitle" checked>
                            De titel van het formulier tonen
                        </label>
                        <p class="description">
                            Zet dit uit als de pagina zelf al een titel heeft — anders staat ze er twee keer.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoFormsShortcode">Shortcode</label></th>
                    <td>
                        <input type="text" id="mymmoFormsShortcode" class="large-text code" readonly
                               value="<?php echo esc_attr('[mymmo_form slug="' . $eerste . '"]'); ?>">
                        <p>
                            <button type="button" class="button button-primary" data-mymmo-copy="mymmoFormsShortcode">Kopieer</button>
                            <span class="description">Plak dit op de pagina waar het formulier moet staan.</span>
                        </p>
                    </td>
                </tr>
            </table>

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
                klaar om te selecteren en te kopiëren.
            </p>

        <?php endif; ?>

        <p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline;">
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
