<?php
/**
 * Instellingenpagina onder Instellingen → Mymmo Events.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Settings {

    private const GROUP = 'mymmo_events';
    private const PAGE = 'mymmo-events';

    public static function init(): void {
        add_action('admin_init', [self::class, 'register']);
        add_action('admin_menu', [self::class, 'add_page']);
        add_action('admin_post_mymmo_events_purge', [self::class, 'handle_purge']);
        add_action('admin_notices', [self::class, 'stale_notice']);
    }

    public static function register(): void {
        // De rewrite rules hangen af van de overname-schakelaar, dus die
        // moeten opnieuw na het opslaan.
        add_action('update_option_mymmo_events_take_over_urls', static function () {
            Mymmo_Events_Router::register_rewrite_rules();
            flush_rewrite_rules();
        });
        add_action('update_option_mymmo_events_event_base', static function () {
            Mymmo_Events_Router::register_rewrite_rules();
            flush_rewrite_rules();
        });

        $fields = [
            'mymmo_events_api_base' => ['type' => 'string', 'default' => '', 'sanitize_callback' => 'esc_url_raw'],
            'mymmo_events_site_key' => ['type' => 'string', 'default' => '', 'sanitize_callback' => 'sanitize_text_field'],
            'mymmo_events_cache_ttl' => ['type' => 'integer', 'default' => 300, 'sanitize_callback' => [self::class, 'sanitize_ttl']],
            'mymmo_events_event_base' => ['type' => 'string', 'default' => MYMMO_EVENTS_DEFAULT_EVENT_BASE, 'sanitize_callback' => [self::class, 'sanitize_base']],
            'mymmo_events_archive_base' => ['type' => 'string', 'default' => MYMMO_EVENTS_DEFAULT_ARCHIVE_BASE, 'sanitize_callback' => [self::class, 'sanitize_base']],
            'mymmo_events_timezone' => ['type' => 'string', 'default' => 'Europe/Brussels', 'sanitize_callback' => 'sanitize_text_field'],
            'mymmo_events_take_over_urls' => ['type' => 'boolean', 'default' => false, 'sanitize_callback' => [self::class, 'sanitize_bool']],
        ];

        foreach ($fields as $name => $args) {
            register_setting(self::GROUP, $name, $args);
        }
    }

    public static function sanitize_ttl($value): int {
        $ttl = (int) $value;
        return max(30, min(3600, $ttl > 0 ? $ttl : 300));
    }

    public static function sanitize_bool($value): bool {
        return !empty($value);
    }

    public static function sanitize_base($value): string {
        $slug = sanitize_title((string) $value);
        return $slug !== '' ? $slug : MYMMO_EVENTS_DEFAULT_EVENT_BASE;
    }

    public static function add_page(): void {
        add_options_page(
            'Mymmo Events',
            'Mymmo Events',
            'manage_options',
            self::PAGE,
            [self::class, 'render_page']
        );
    }

    /** Waarschuw beheerders als de laatst geslaagde respons oud is. */
    public static function stale_notice(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $failed_since = (int) get_option('mymmo_events_failing_since', 0);
        if ($failed_since === 0 || time() - $failed_since < 3600) {
            return;
        }
        printf(
            '<div class="notice notice-warning is-dismissible"><p>%s</p></div>',
            esc_html('Mymmo Events kan de Operations Manager al meer dan een uur niet bereiken. De kalender toont de laatst bekende versie.')
        );
    }

    public static function handle_purge(): void {
        if (!current_user_can('manage_options') || !check_admin_referer('mymmo_events_purge')) {
            wp_die('Geen toegang.');
        }
        Mymmo_Events_Cache::purge_all();
        wp_safe_redirect(add_query_arg('mymmo_purged', '1', admin_url('options-general.php?page=' . self::PAGE)));
        exit;
    }

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $test = null;
        if (isset($_GET['mymmo_test']) && check_admin_referer('mymmo_events_test')) {
            $test = Mymmo_Events_Api_Client::test_connection();
        }

        $site_key = (string) get_option('mymmo_events_site_key', '');
        $masked = $site_key !== ''
            ? str_repeat('•', max(0, strlen($site_key) - 4)) . substr($site_key, -4)
            : '';
        ?>
        <div class="wrap">
            <h1>Mymmo Events</h1>
            <p class="description" style="max-width:44em">
                Deze plugin toont de events uit de Operations Manager. Er wordt in WordPress
                niets over events bewaard — alleen een cache, zodat de pagina blijft werken
                als de verbinding wegvalt.
            </p>

            <?php if (!get_option('mymmo_events_take_over_urls', false)) : ?>
                <div class="notice notice-info inline" style="margin:1em 0">
                    <p>
                        De detailpagina's komen nu nog van The Events Calendar. De shortcodes en de
                        kalender werken al; zet <em>Detailpagina's overnemen</em> aan wanneer je wil omschakelen.
                    </p>
                </div>
            <?php endif; ?>

            <?php if (isset($_GET['mymmo_purged'])) : ?>
                <div class="notice notice-success is-dismissible"><p>Cache leeggemaakt.</p></div>
            <?php endif; ?>

            <?php if (is_array($test)) : ?>
                <div class="notice notice-<?php echo $test['ok'] ? 'success' : 'error'; ?>">
                    <p><?php echo esc_html($test['message']); ?></p>
                </div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields(self::GROUP); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmo_events_api_base">API-URL</label></th>
                        <td>
                            <input type="url" class="regular-text code" id="mymmo_events_api_base"
                                   name="mymmo_events_api_base"
                                   value="<?php echo esc_attr((string) get_option('mymmo_events_api_base', '')); ?>"
                                   placeholder="https://operations.openvme.be" />
                            <p class="description">De basis-URL van de Operations Manager, zonder pad.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo_events_site_key">Sitesleutel</label></th>
                        <td>
                            <input type="password" class="regular-text code" id="mymmo_events_site_key"
                                   name="mymmo_events_site_key" autocomplete="off"
                                   value="<?php echo esc_attr($site_key); ?>" />
                            <?php if ($masked !== '') : ?>
                                <p class="description">Nu ingesteld: <code><?php echo esc_html($masked); ?></code></p>
                            <?php endif; ?>
                            <p class="description">
                                Moet overeenkomen met een waarde uit <code>EVENTS_PUBLIC_SITE_KEYS</code> in de Worker.
                                Deze sleutel komt nooit in de HTML van de site.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo_events_cache_ttl">Cacheduur</label></th>
                        <td>
                            <input type="number" min="30" max="3600" step="30" class="small-text"
                                   id="mymmo_events_cache_ttl" name="mymmo_events_cache_ttl"
                                   value="<?php echo esc_attr((string) get_option('mymmo_events_cache_ttl', 300)); ?>" />
                            <span>seconden</span>
                            <p class="description">Hoe lang een antwoord hergebruikt wordt. Het vangnet blijft langer bewaard.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo_events_event_base">Pad eventpagina</label></th>
                        <td>
                            <code><?php echo esc_html(home_url('/')); ?></code>
                            <input type="text" class="small-text code" id="mymmo_events_event_base"
                                   name="mymmo_events_event_base"
                                   value="<?php echo esc_attr((string) get_option('mymmo_events_event_base', MYMMO_EVENTS_DEFAULT_EVENT_BASE)); ?>" />
                            <code>/{slug}/</code>
                            <p class="description">
                                Laat dit op <code>event</code> staan: dat is het pad dat The Events Calendar
                                vandaag gebruikt, dus bestaande links en zoekresultaten blijven werken.
                                Sla na een wijziging de permalinks opnieuw op.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo_events_archive_base">Pad archief</label></th>
                        <td>
                            <code><?php echo esc_html(home_url('/')); ?></code>
                            <input type="text" class="small-text code" id="mymmo_events_archive_base"
                                   name="mymmo_events_archive_base"
                                   value="<?php echo esc_attr((string) get_option('mymmo_events_archive_base', MYMMO_EVENTS_DEFAULT_ARCHIVE_BASE)); ?>" />
                            <code>/</code>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Detailpagina's overnemen</th>
                        <td>
                            <label>
                                <input type="checkbox" name="mymmo_events_take_over_urls" value="1"
                                    <?php checked((bool) get_option('mymmo_events_take_over_urls', false)); ?> />
                                Laat deze plugin <code>/<?php echo esc_html((string) get_option('mymmo_events_event_base', MYMMO_EVENTS_DEFAULT_EVENT_BASE)); ?>/{slug}/</code> renderen
                            </label>
                            <p class="description">
                                <strong>Laat dit uit tot je klaar bent om om te schakelen.</strong>
                                The Events Calendar bezit dit pad vandaag. Zet je het aan, dan geeft
                                elke slug die de Operations Manager niet kent een 404 — ook events die
                                in WordPress nog wel bestaan. Zo kan je de kalender eerst in gebruik
                                nemen terwijl de detailpagina's nog van The Events Calendar komen.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo_events_timezone">Weergavetijdzone</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmo_events_timezone"
                                   name="mymmo_events_timezone"
                                   value="<?php echo esc_attr((string) get_option('mymmo_events_timezone', 'Europe/Brussels')); ?>" />
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <hr />

            <h2>Shortcodes</h2>
            <table class="widefat striped" style="max-width:52em">
                <tbody>
                    <tr>
                        <td><code>[mymmo_events_calendar]</code></td>
                        <td>Maandkalender. Parameters: <code>month</code> (JJJJ-MM), <code>type</code>, <code>format</code>.</td>
                    </tr>
                    <tr>
                        <td><code>[mymmo_events_list]</code></td>
                        <td>Lijst. Parameters: <code>limit</code>, <code>type</code>, <code>format</code>, <code>show_past</code>, <code>layout</code> (rows of cards).</td>
                    </tr>
                    <tr>
                        <td><code>[mymmo_event]</code></td>
                        <td>Een event. Parameter <code>slug</code>; zonder slug wordt die uit de URL gehaald.</td>
                    </tr>
                </tbody>
            </table>

            <h2 style="margin-top:2em">Onderhoud</h2>
            <p>
                <a class="button" href="<?php echo esc_url(wp_nonce_url(add_query_arg('mymmo_test', '1', admin_url('options-general.php?page=' . self::PAGE)), 'mymmo_events_test')); ?>">
                    Verbinding testen
                </a>
                <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=mymmo_events_purge'), 'mymmo_events_purge')); ?>">
                    Cache leegmaken
                </a>
            </p>
        </div>
        <?php
    }
}
