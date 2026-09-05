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
        add_action('admin_post_mymmo_events_regenerate_token', [self::class, 'handle_regenerate_token']);
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
            'mymmo_events_reload_token' => ['type' => 'string', 'default' => '', 'sanitize_callback' => 'sanitize_text_field'],
            // Site-brede standaard voor [mymmo_events_row]; per shortcode-
            // plaatsing overschrijfbaar via het date_align-attribuut.
            'mymmo_events_row_date_align' => ['type' => 'string', 'default' => 'left', 'sanitize_callback' => [self::class, 'sanitize_date_align']],
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

    public static function sanitize_date_align($value): string {
        return $value === 'right' ? 'right' : 'left';
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

    /**
     * Nieuw reload-token: maakt elke eerder uitgedeelde reload-URL (aan de
     * Operations Manager of ergens anders) meteen ongeldig. Gebruik dit bij
     * een vermoeden dat een token gelekt is, of gewoon om een oude URL op
     * te ruimen.
     */
    public static function handle_regenerate_token(): void {
        if (!current_user_can('manage_options') || !check_admin_referer('mymmo_events_regenerate_token')) {
            wp_die('Geen toegang.');
        }
        update_option('mymmo_events_reload_token', self::generate_token());
        wp_safe_redirect(add_query_arg('mymmo_token_regenerated', '1', admin_url('options-general.php?page=' . self::PAGE)));
        exit;
    }

    private static function generate_token(): string {
        return wp_generate_password(40, false, false);
    }

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        // Een leeg token betekent dat /reload altijd geweigerd wordt (zie
        // class-rest.php) -- geen "toevallig openstaand" endpoint. Zodra
        // een beheerder deze pagina opent, staat er dus altijd al een
        // bruikbaar token klaar, in plaats van dat iemand eerst zelf iets
        // moet invullen voor de knop werkt.
        if ((string) get_option('mymmo_events_reload_token', '') === '') {
            update_option('mymmo_events_reload_token', self::generate_token());
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

        // Voor de shortcode-bouwer hieronder -- zelfde bron als de
        // type-chips op de site zelf (class-api-client.php, gecachet).
        $sb_event_types = Mymmo_Events_Api_Client::get_event_types();
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

            <?php if (isset($_GET['mymmo_token_regenerated'])) : ?>
                <div class="notice notice-success is-dismissible">
                    <p>Nieuw reload-token gegenereerd. De vorige reload-URL werkt niet meer -- kopieer de nieuwe naar de Operations Manager.</p>
                </div>
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
                        <th scope="row"><label for="mymmo_events_reload_token">Reload-URL</label></th>
                        <td>
                            <?php $reload_token = (string) get_option('mymmo_events_reload_token', ''); ?>
                            <input type="text" class="large-text code" readonly
                                   onclick="this.select();"
                                   value="<?php echo esc_url(add_query_arg('token', $reload_token, rest_url('mymmo-events/v1/reload'))); ?>" />
                            <p class="description">
                                Opent deze URL, dan wordt de cache meteen leeggemaakt -- de eerstvolgende
                                bezoeker (van eender welke pagina met een shortcode) krijgt weer live data
                                van de Operations Manager, in plaats van tot <?php echo esc_html((string) get_option('mymmo_events_cache_ttl', 60)); ?> seconden te
                                moeten wachten. Bedoeld om als knop of automatische aanroep vanuit de
                                Operations Manager te gebruiken na het publiceren of wijzigen van een
                                event -- geen WordPress-login nodig, het token in de URL is de beveiliging.
                                Deel deze URL dus enkel met wie/wat de cache mag legen.
                            </p>
                            <p>
                                <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=mymmo_events_regenerate_token'), 'mymmo_events_regenerate_token')); ?>">
                                    Nieuw token genereren
                                </a>
                                <span class="description">Maakt de URL hierboven meteen ongeldig -- gebruik dit als hij gelekt is of niet langer nodig is.</span>
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
                    <tr>
                        <th scope="row">Datumuitlijning kaartenrij</th>
                        <td>
                            <?php $mymmo_row_date_align = (string) get_option('mymmo_events_row_date_align', 'left'); ?>
                            <label style="display:block;margin-bottom:0.4em;">
                                <input type="radio" name="mymmo_events_row_date_align" value="left"
                                    <?php checked($mymmo_row_date_align, 'left'); ?> />
                                Datum links <em>(standaard)</em> — het linkse kaartje ligt onderaan de stapel
                            </label>
                            <label style="display:block;">
                                <input type="radio" name="mymmo_events_row_date_align" value="right"
                                    <?php checked($mymmo_row_date_align, 'right'); ?> />
                                Datum rechts — datum/uur rechts uitgelijnd, het linkse kaartje ligt bovenaan de stapel
                            </label>
                            <p class="description">
                                Geldt voor <code>[mymmo_events_row]</code>. Zo blijft de datum altijd zichtbaar,
                                ook op kaartjes die grotendeels achter een andere kaart schuilgaan. Per plaatsing
                                te overschrijven met het <code>date_align</code>-attribuut van de shortcode.
                            </p>
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
                        <td>Maandkalender. Parameters: <code>month</code> (JJJJ-MM), <code>type</code>, <code>format</code>.
                            Bladert nooit terug voor de huidige maand (vorige/volgende zonder herladen, dankzij het
                            REST-endpoint in <code>class-rest.php</code>). Laat je <code>type</code> leeg, dan krijgt
                            de bezoeker zelf togglebare chips om op event type te filteren -- standaard staan ze
                            allemaal aan, en filteren gebeurt volledig clientside, zonder nieuwe serveraanvraag; zet
                            je <code>type</code> vast, dan tonen de chips niet.</td>
                    </tr>
                    <tr>
                        <td><code>[mymmo_events_list]</code></td>
                        <td>Lijst, per maand -- met dezelfde vorige/volgende-navigatie als de kalender. Parameters:
                            <code>month</code> (JJJJ-MM), <code>limit</code>, <code>type</code>, <code>format</code>,
                            <code>show_past</code> (staat terugbladeren voorbij de huidige maand toe),
                            <code>layout</code> (rows of cards). Zelfde chips-gedrag als de kalender wanneer
                            <code>type</code> leeg blijft.</td>
                    </tr>
                    <tr>
                        <td><code>[mymmo_event]</code></td>
                        <td>Een event. Parameter <code>slug</code>; zonder slug wordt die uit de URL gehaald.</td>
                    </tr>
                    <tr>
                        <td><code>[mymmo_events_announcement]</code></td>
                        <td>
                            Aankondiging-callout voor één event, met andere events er speels achter.
                            Toont het gehighlighte event (vlag in de Operations Manager); zonder highlight
                            automatisch het eerstvolgende. Vaste huisstijl, geen parameters.
                        </td>
                    </tr>
                    <tr>
                        <td><code>[mymmo_events_row]</code></td>
                        <td>
                            Kaarten als een losjes neergelegde stapel scheurkalenderblaadjes -- lichter
                            en minder hoog dan de aankondiging, zelfde breedte. Toont uur en locatie per
                            event, zonder tekst af te kappen. Bedoeld om ook los op pagina's te plaatsen.
                            Parameters:
                            <code>source</code> (<code>next</code> = eerstvolgende events, standaard;
                            <code>highlighted</code> = enkel de gehighlighte events, in volgorde -- toont
                            niets als er geen zijn), <code>count</code> (standaard 4 --
                            <strong>geen vaste cap meer</strong>: elk aantal mag, tot een ruime
                            veiligheidsgrens), <code>date_align</code> (<code>left</code> = standaard,
                            <code>right</code> = datum/uur rechts uitgelijnd -- overschrijft hier de
                            site-brede instelling hierboven). Zijn er minder events dan <code>count</code>,
                            dan toont de rij gewoon minder kaarten en spreidt ze zich over de volledige
                            beschikbare breedte (geen lege kaartjes en geen ongebruikte ruimte). De rij
                            wordt nooit breder dan de beschikbare plek: bij veel kaarten schuiven ze
                            steeds verder over elkaar in plaats van dat er een scrollbalk verschijnt.
                            Hoveren op een kaart duwt de buren opzij zodat je 'm volledig ziet -- de
                            stapelvolgorde verandert daarbij niet.
                        </td>
                    </tr>
                </tbody>
            </table>

            <h2 style="margin-top:2em">Shortcode-bouwer</h2>
            <p class="description" style="max-width:52em">
                Stel hieronder een component samen en kopieer de shortcode naar de pagina- of
                widgeteditor. Dit is dezelfde tabel als hierboven, maar dan zonder zelf
                accolades en parameternamen te moeten uittypen.
            </p>

            <div id="mymmo-sb" class="mymmo-sb" data-sb-active="calendar">
                <div class="mymmo-sb-field">
                    <label for="mymmo-sb-select">Component</label>
                    <select id="mymmo-sb-select">
                        <option value="calendar">Kalender</option>
                        <option value="list">Lijst</option>
                        <option value="row">Rij van 4 (scheurkalender)</option>
                        <option value="announcement">Aankondiging</option>
                        <option value="event">Eén event</option>
                    </select>
                </div>

                <div class="mymmo-sb-group" data-sb-group="calendar">
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-cal-month">Startmaand (optioneel)</label>
                        <input type="month" id="mymmo-sb-cal-month" data-sb-field="month" />
                        <p class="mymmo-sb-hint">Leeg = de huidige maand. Bezoekers kunnen zelf bladeren.</p>
                    </div>
                    <div class="mymmo-sb-field">
                        <label>Event type (optioneel)</label>
                        <div class="mymmo-sb-types">
                            <?php foreach ($sb_event_types as $sb_type) :
                                $sb_tid = (int) ($sb_type['id'] ?? 0);
                                $sb_tname = (string) ($sb_type['name'] ?? '');
                                if ($sb_tid === 0 || $sb_tname === '') {
                                    continue;
                                }
                                ?>
                                <label class="mymmo-sb-type-chip">
                                    <input type="checkbox" data-sb-field="type" value="<?php echo esc_attr((string) $sb_tid); ?>" />
                                    <?php echo esc_html($sb_tname); ?>
                                </label>
                            <?php endforeach; ?>
                        </div>
                        <p class="mymmo-sb-hint">Niets aangevinkt = bezoekers krijgen zelf togglebare filterchips te zien.</p>
                    </div>
                </div>

                <div class="mymmo-sb-group" data-sb-group="list" hidden>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-list-month">Startmaand (optioneel)</label>
                        <input type="month" id="mymmo-sb-list-month" data-sb-field="month" />
                    </div>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-list-limit">Maximum aantal</label>
                        <input type="number" id="mymmo-sb-list-limit" data-sb-field="limit" min="1" max="200" value="50" class="small-text" />
                    </div>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-list-layout">Weergave</label>
                        <select id="mymmo-sb-list-layout" data-sb-field="layout">
                            <option value="rows">Rijen</option>
                            <option value="cards">Kaarten</option>
                        </select>
                    </div>
                    <div class="mymmo-sb-field">
                        <label><input type="checkbox" data-sb-field="show_past" /> Ook voorbije events tonen bij terugbladeren</label>
                    </div>
                    <div class="mymmo-sb-field">
                        <label>Event type (optioneel)</label>
                        <div class="mymmo-sb-types">
                            <?php foreach ($sb_event_types as $sb_type) :
                                $sb_tid = (int) ($sb_type['id'] ?? 0);
                                $sb_tname = (string) ($sb_type['name'] ?? '');
                                if ($sb_tid === 0 || $sb_tname === '') {
                                    continue;
                                }
                                ?>
                                <label class="mymmo-sb-type-chip">
                                    <input type="checkbox" data-sb-field="type" value="<?php echo esc_attr((string) $sb_tid); ?>" />
                                    <?php echo esc_html($sb_tname); ?>
                                </label>
                            <?php endforeach; ?>
                        </div>
                        <p class="mymmo-sb-hint">Niets aangevinkt = bezoekers krijgen zelf togglebare filterchips te zien.</p>
                    </div>
                </div>

                <div class="mymmo-sb-group" data-sb-group="row" hidden>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-row-source">Welke events</label>
                        <select id="mymmo-sb-row-source" data-sb-field="source">
                            <option value="next">Eerstvolgende events</option>
                            <option value="highlighted">Enkel de gehighlighte events</option>
                        </select>
                        <p class="mymmo-sb-hint">"Enkel gehighlight" toont niets zolang er geen events gehighlight staan in de Operations Manager.</p>
                    </div>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-row-count">Aantal kaarten</label>
                        <input type="number" id="mymmo-sb-row-count" data-sb-field="count" min="1" max="12" value="4" class="small-text" />
                        <p class="mymmo-sb-hint">Geen vaste cap van 4 meer: vanaf een handvol kaarten schuiven ze steeds verder over elkaar (blijft altijd binnen de beschikbare breedte, nooit een scrollbalk). Minder events dan dit aantal? Dan toont de rij gewoon minder kaarten, uitgespreid over de volledige breedte.</p>
                    </div>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-row-date-align">Datumuitlijning</label>
                        <select id="mymmo-sb-row-date-align" data-sb-field="date_align">
                            <option value="">Gebruik de site-brede instelling</option>
                            <option value="left">Datum links (linkse kaartje onderaan de stapel)</option>
                            <option value="right">Datum rechts (linkse kaartje bovenaan de stapel)</option>
                        </select>
                        <p class="mymmo-sb-hint">Overschrijft hier enkel deze plaatsing; de standaard staat in Instellingen → Mymmo Events.</p>
                    </div>
                </div>

                <div class="mymmo-sb-group" data-sb-group="announcement" hidden>
                    <p class="mymmo-sb-hint">Geen instelbare parameters -- toont het gehighlighte event, of anders het eerstvolgende.</p>
                </div>

                <div class="mymmo-sb-group" data-sb-group="event" hidden>
                    <div class="mymmo-sb-field">
                        <label for="mymmo-sb-event-slug">Slug (optioneel)</label>
                        <input type="text" id="mymmo-sb-event-slug" data-sb-field="slug" class="regular-text code" />
                        <p class="mymmo-sb-hint">Leeg laten op de eventpagina zelf: de slug komt dan uit de URL.</p>
                    </div>
                </div>

                <div class="mymmo-sb-output">
                    <input type="text" id="mymmo-sb-output" class="large-text code" readonly onclick="this.select();" />
                    <button type="button" class="button button-primary" id="mymmo-sb-copy">Kopieer shortcode</button>
                    <span id="mymmo-sb-copied" class="description" hidden>Gekopieerd!</span>
                </div>
            </div>

            <style>
                .mymmo-sb { max-width: 52em; }
                .mymmo-sb-field { margin-bottom: .9em; }
                .mymmo-sb-field label { display: block; font-weight: 600; margin-bottom: .3em; }
                .mymmo-sb-field label input[type="checkbox"] { font-weight: normal; }
                .mymmo-sb-group[hidden] { display: none; }
                .mymmo-sb-types { display: flex; flex-wrap: wrap; gap: .4em; }
                .mymmo-sb-type-chip { display: inline-flex; align-items: center; gap: .35em; padding: .25em .65em; border: 1px solid #c3c4c7; border-radius: 999px; background: #fff; font-size: .9em; cursor: pointer; font-weight: normal; }
                .mymmo-sb-type-chip input { margin: 0; }
                .mymmo-sb-hint { color: #646970; font-size: .9em; margin: .3em 0 0; }
                .mymmo-sb-output { display: flex; align-items: center; gap: .6em; margin-top: 1.3em; flex-wrap: wrap; }
                .mymmo-sb-output input[readonly] { background: #f6f7f7; }
            </style>

            <script>
            (function () {
                var root = document.getElementById('mymmo-sb');
                if (!root) {
                    return;
                }
                var select = document.getElementById('mymmo-sb-select');
                var groups = root.querySelectorAll('[data-sb-group]');
                var output = document.getElementById('mymmo-sb-output');
                var copyBtn = document.getElementById('mymmo-sb-copy');
                var copiedMsg = document.getElementById('mymmo-sb-copied');

                function activeGroup() {
                    return root.querySelector('[data-sb-group="' + select.value + '"]');
                }

                function showActiveGroup() {
                    for (var i = 0; i < groups.length; i++) {
                        groups[i].hidden = (groups[i].getAttribute('data-sb-group') !== select.value);
                    }
                }

                function checkedValues(group, field) {
                    var nodes = group.querySelectorAll('[data-sb-field="' + field + '"]:checked');
                    var values = [];
                    for (var i = 0; i < nodes.length; i++) {
                        values.push(nodes[i].value);
                    }
                    return values.join(',');
                }

                function fieldValue(group, field) {
                    var node = group.querySelector('[data-sb-field="' + field + '"]');
                    return node ? node.value : '';
                }

                function fieldChecked(group, field) {
                    var node = group.querySelector('[data-sb-field="' + field + '"]');
                    return !!(node && node.checked);
                }

                function attrString(pairs) {
                    var parts = [];
                    for (var i = 0; i < pairs.length; i++) {
                        if (pairs[i][1] !== '') {
                            parts.push(pairs[i][0] + '="' + String(pairs[i][1]).replace(/"/g, '&quot;') + '"');
                        }
                    }
                    return parts.join(' ');
                }

                function monthAttr(group) {
                    var raw = fieldValue(group, 'month');
                    return raw || '';
                }

                function build() {
                    var group = activeGroup();
                    var shortcode = '';

                    if (select.value === 'calendar') {
                        var attrs = attrString([
                            ['month', monthAttr(group)],
                            ['type', checkedValues(group, 'type')]
                        ]);
                        shortcode = '[mymmo_events_calendar' + (attrs ? ' ' + attrs : '') + ']';
                    } else if (select.value === 'list') {
                        var limit = fieldValue(group, 'limit');
                        var layout = fieldValue(group, 'layout');
                        var attrs = attrString([
                            ['month', monthAttr(group)],
                            ['type', checkedValues(group, 'type')],
                            ['limit', (limit && limit !== '50') ? limit : ''],
                            ['layout', (layout && layout !== 'rows') ? layout : ''],
                            ['show_past', fieldChecked(group, 'show_past') ? '1' : '']
                        ]);
                        shortcode = '[mymmo_events_list' + (attrs ? ' ' + attrs : '') + ']';
                    } else if (select.value === 'row') {
                        var source = fieldValue(group, 'source');
                        var count = fieldValue(group, 'count');
                        var dateAlign = fieldValue(group, 'date_align');
                        var attrs = attrString([
                            ['source', (source && source !== 'next') ? source : ''],
                            ['count', (count && count !== '4') ? count : ''],
                            ['date_align', dateAlign || '']
                        ]);
                        shortcode = '[mymmo_events_row' + (attrs ? ' ' + attrs : '') + ']';
                    } else if (select.value === 'event') {
                        var slug = fieldValue(group, 'slug').trim();
                        var attrs = attrString([['slug', slug]]);
                        shortcode = '[mymmo_event' + (attrs ? ' ' + attrs : '') + ']';
                    } else {
                        shortcode = '[mymmo_events_announcement]';
                    }

                    output.value = shortcode;
                }

                select.addEventListener('change', function () {
                    showActiveGroup();
                    build();
                });
                root.addEventListener('input', build);
                root.addEventListener('change', build);

                copyBtn.addEventListener('click', function () {
                    var text = output.value;
                    var done = function () {
                        copiedMsg.hidden = false;
                        window.clearTimeout(copyBtn._mymmoTimer);
                        copyBtn._mymmoTimer = window.setTimeout(function () {
                            copiedMsg.hidden = true;
                        }, 2000);
                    };
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(done, function () {
                            output.select();
                            document.execCommand('copy');
                            done();
                        });
                    } else {
                        output.select();
                        document.execCommand('copy');
                        done();
                    }
                });

                showActiveGroup();
                build();
            })();
            </script>

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
