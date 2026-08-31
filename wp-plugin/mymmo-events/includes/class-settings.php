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

        $fields = [
            'mymmo_events_api_base' => ['type' => 'string', 'default' => '', 'sanitize_callback' => 'esc_url_raw'],
            'mymmo_events_site_key' => ['type' => 'string', 'default' => '', 'sanitize_callback' => 'sanitize_text_field'],
            'mymmo_events_cache_ttl' => ['type' => 'integer', 'default' => 60, 'sanitize_callback' => [self::class, 'sanitize_ttl']],
            'mymmo_events_event_base' => ['type' => 'string', 'default' => MYMMO_EVENTS_DEFAULT_EVENT_BASE, 'sanitize_callback' => [self::class, 'sanitize_base']],
            'mymmo_events_archive_base' => ['type' => 'string', 'default' => MYMMO_EVENTS_DEFAULT_ARCHIVE_BASE, 'sanitize_callback' => [self::class, 'sanitize_base']],
            'mymmo_events_timezone' => ['type' => 'string', 'default' => 'Europe/Brussels', 'sanitize_callback' => 'sanitize_text_field'],
            'mymmo_events_fallback_routing' => ['type' => 'boolean', 'default' => true, 'sanitize_callback' => [self::class, 'sanitize_bool']],
        ];

        foreach ($fields as $name => $args) {
            register_setting(self::GROUP, $name, $args);
        }
    }

    public static function sanitize_ttl($value): int {
        $ttl = (int) $value;
        return max(15, min(3600, $ttl > 0 ? $ttl : 60));
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

        $diag = null;
        if (isset($_GET['mymmo_diag']) && check_admin_referer('mymmo_events_diag')) {
            $diag = Mymmo_Events_Api_Client::diagnose();
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
                                   value="<?php echo esc_attr((string) get_option('mymmo_events_cache_ttl', 60)); ?>" />
                            <span>seconden</span>
                            <p class="description">
                                Hoe lang een antwoord hergebruikt wordt. Dit is de enige vertraging tussen
                                publiceren in de Operations Manager en zichtbaar worden op de site.
                                Kort mag: een verversing stuurt de vorige ETag mee, dus een onveranderd
                                antwoord komt terug als 304 zonder inhoud. Het vangnet blijft los hiervan
                                zeven dagen bewaard.
                            </p>
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
                        <th scope="row">Eventpagina's opvangen</th>
                        <td>
                            <label>
                                <input type="checkbox" name="mymmo_events_fallback_routing" value="1"
                                    <?php checked(Mymmo_Events_Router::fallback_enabled()); ?> />
                                Onbekende <code>/<?php echo esc_html((string) get_option('mymmo_events_event_base', MYMMO_EVENTS_DEFAULT_EVENT_BASE)); ?>/{slug}/</code>-URL's door deze plugin laten renderen
                            </label>
                            <p class="description">
                                Deze plugin claimt geen URL's. Hij komt <strong>alleen</strong> in actie als
                                WordPress zelf niets vindt. Bestaat er nog een pagina van The Events Calendar,
                                dan blijft die ongewijzigd; kent alleen de Operations Manager het event, dan
                                renderen wij het. Kent niemand het, dan blijft het een gewone 404.
                                Je kan dit dus veilig aan laten staan tijdens de overgang — er valt niets te breken
                                en er hoeven geen permalinks bewaard te worden.
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
                <a class="button button-primary" href="<?php echo esc_url(wp_nonce_url(add_query_arg('mymmo_diag', '1', admin_url('options-general.php?page=' . self::PAGE)), 'mymmo_events_diag')); ?>">
                    Diagnose uitvoeren
                </a>
                <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=mymmo_events_purge'), 'mymmo_events_purge')); ?>">
                    Cache leegmaken
                </a>
            </p>
        <?php if (is_array($diag)) : ?>
            <hr />
            <h2>Diagnose</h2>

            <?php if (empty($diag['ok'])) : ?>
                <div class="notice notice-error inline"><p><?php echo esc_html((string) $diag['error']); ?></p></div>
                <?php if (!empty($diag['raw'])) : ?>
                    <pre style="max-height:12em;overflow:auto;background:#f6f7f7;padding:.75em"><?php echo esc_html(substr((string) $diag['raw'], 0, 2000)); ?></pre>
                <?php endif; ?>
            <?php else : ?>
                <table class="widefat striped" style="max-width:52em">
                    <tbody>
                        <tr><th style="width:16em">Antwoord</th><td>HTTP <?php echo esc_html((string) $diag['status']); ?> in <?php echo esc_html((string) $diag['duration_ms']); ?> ms</td></tr>
                        <tr><th>Contractversie</th><td><?php echo esc_html((string) $diag['shape_version']); ?></td></tr>
                        <tr>
                            <th>Merk van deze sleutel</th>
                            <td>
                                <?php if (!empty($diag['brand'])) : ?>
                                    <code><?php echo esc_html((string) $diag['brand']); ?></code>
                                <?php else : ?>
                                    geen &mdash; deze site ziet alle merken
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr><th>Events met een pagina</th><td><strong><?php echo esc_html((string) $diag['total']); ?></strong>, waarvan <?php echo esc_html((string) $diag['upcoming']); ?> nog te komen</td></tr>
                        <tr>
                            <th>Deze maand (<?php echo esc_html((string) $diag['this_month']); ?>)</th>
                            <td>
                                <?php echo esc_html((string) $diag['in_this_month']); ?>
                                <?php if ((int) $diag['in_this_month'] === 0 && (int) $diag['upcoming'] > 0) : ?>
                                    &mdash; <em>daarom lijkt de kalender leeg; hij opent op de eerstvolgende maand met events</em>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php if ((int) $diag['skipped_without_slug'] > 0) : ?>
                            <tr>
                                <th>Overgeslagen</th>
                                <td>
                                    <strong><?php echo esc_html((string) $diag['skipped_without_slug']); ?></strong> gepubliceerde events <em>zonder slug</em>.
                                    Die hebben geen pagina en worden daarom niet getoond. Publiceer ze opnieuw
                                    via de Operations Manager, dan wordt er een slug afgeleid.
                                </td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                </table>

                <?php if (!empty($diag['months'])) : ?>
                    <h3>Per maand</h3>
                    <p>
                        <?php foreach ($diag['months'] as $month => $count) : ?>
                            <a class="button button-small" style="margin:0 .25em .25em 0"
                               href="<?php echo esc_url(add_query_arg('mymmo_month', $month, mymmo_events_archive_url())); ?>">
                                <?php echo esc_html((string) $month); ?> <span class="count">(<?php echo esc_html((string) $count); ?>)</span>
                            </a>
                        <?php endforeach; ?>
                    </p>
                <?php endif; ?>

                <h3>Wat de API teruggeeft</h3>
                <div style="max-height:26em;overflow:auto">
                    <table class="widefat striped">
                        <thead><tr><th>ID</th><th>Titel</th><th>Slug</th><th>Wanneer</th><th>Type</th><th>Merk</th></tr></thead>
                        <tbody>
                            <?php if ($diag['rows'] === []) : ?>
                                <tr><td colspan="6">De API geeft geen enkel event terug. Staat er iets op <em>Gepubliceerd</em> in de Operations Manager, en heeft het een slug?</td></tr>
                            <?php endif; ?>
                            <?php foreach ($diag['rows'] as $row) : ?>
                                <tr<?php echo $row['past'] ? ' style="opacity:.55"' : ''; ?>>
                                    <td><?php echo esc_html((string) $row['id']); ?></td>
                                    <td><?php echo esc_html($row['title']); ?></td>
                                    <td><code><?php echo esc_html($row['slug']); ?></code></td>
                                    <td><?php echo esc_html($row['when']); ?></td>
                                    <td><?php echo esc_html($row['type']); ?></td>
                                    <td><?php echo esc_html($row['brand']); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        <?php endif; ?>
        </div>
        <?php
    }
}
