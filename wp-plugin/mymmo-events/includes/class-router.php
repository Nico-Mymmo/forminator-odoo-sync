<?php
/**
 * Routing voor /event/{slug}/ en het .ics-bestand.
 *
 * Geen custom post type en geen echte WP-pagina per event: er wordt een
 * virtuele pagina gerenderd. De slugvorm is exact die van The Events
 * Calendar, zodat bestaande links en zoekresultaten blijven werken.
 *
 * Oude links dragen ?owid={odoo_id} mee. Vindt de slug niets, dan valt de
 * router op dat id terug — zo overleeft een link ook een gewijzigde slug.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Router {

    private static ?array $current_event = null;
    private static bool $is_event_request = false;

    public static function init(): void {
        add_action('init', [self::class, 'register_rewrite_rules']);
        add_filter('query_vars', [self::class, 'add_query_vars']);
        add_action('template_redirect', [self::class, 'handle_request']);
        add_filter('document_title_parts', [self::class, 'filter_title']);
        add_action('wp_head', [self::class, 'render_head'], 5);
    }

    /**
     * Neemt deze plugin /event/{slug}/ over?
     *
     * Staat standaard UIT. Reden: The Events Calendar bezit dat pad vandaag.
     * Zouden we het meteen overnemen, dan geeft elke slug die de Operations
     * Manager niet kent een 404 — ook de events die in WordPress nog wel
     * bestaan. Zo kan je de kalender eerst in gebruik nemen terwijl de
     * detailpagina's nog van The Events Calendar komen, en pas omschakelen
     * als alles klopt.
     */
    public static function owns_detail_urls(): bool {
        return (bool) get_option('mymmo_events_take_over_urls', false);
    }

    public static function register_rewrite_rules(): void {
        if (!self::owns_detail_urls()) {
            return;
        }

        $base = trim((string) get_option('mymmo_events_event_base', MYMMO_EVENTS_DEFAULT_EVENT_BASE), '/');
        if ($base === '') {
            return;
        }

        add_rewrite_rule(
            '^' . preg_quote($base, '#') . '/([^/]+)/ics/?$',
            'index.php?mymmo_event_slug=$matches[1]&mymmo_event_ics=1',
            'top'
        );
        add_rewrite_rule(
            '^' . preg_quote($base, '#') . '/([^/]+)/?$',
            'index.php?mymmo_event_slug=$matches[1]',
            'top'
        );
    }

    public static function add_query_vars(array $vars): array {
        $vars[] = 'mymmo_event_slug';
        $vars[] = 'mymmo_event_ics';
        return $vars;
    }

    public static function is_event_request(): bool {
        return self::$is_event_request;
    }

    /** @return array<string,mixed>|null */
    public static function current_event(): ?array {
        return self::$current_event;
    }

    /** De slug uit de URL, ook bruikbaar door de shortcode. */
    public static function requested_slug(): string {
        $slug = get_query_var('mymmo_event_slug');
        return is_string($slug) ? $slug : '';
    }

    public static function handle_request(): void {
        $slug = self::requested_slug();
        if ($slug === '') {
            return;
        }

        self::$is_event_request = true;

        $event = Mymmo_Events_Api_Client::get_event($slug);

        // Oude link met ?owid=: probeer het Odoo-id als de slug niets geeft,
        // en stuur daarna netjes door naar de actuele URL.
        if ($event === null && isset($_GET['owid'])) {
            $owid = absint(wp_unslash($_GET['owid']));
            if ($owid > 0) {
                $event = Mymmo_Events_Api_Client::get_event((string) $owid);
                if (is_array($event) && !empty($event['slug']) && $event['slug'] !== $slug) {
                    wp_safe_redirect(mymmo_events_permalink($event), 301);
                    exit;
                }
            }
        }

        if ($event === null) {
            self::$is_event_request = false;
            self::send_404();
            return;
        }

        self::$current_event = $event;

        if (get_query_var('mymmo_event_ics')) {
            self::send_ics($event);
            return;
        }

        self::render_event_page($event);
    }

    private static function send_404(): void {
        global $wp_query;
        $wp_query->set_404();
        status_header(404);
        nocache_headers();
    }

    /**
     * De eventpagina renderen binnen het thema.
     *
     * We zetten een NEP-POST in de hoofdquery in plaats van te leunen op een
     * the_content-filter: op een virtuele pagina loopt er geen loop, dus die
     * filter vuurt niet altijd. Met een echte WP_Post in de query werken de
     * paginatemplate van het thema, de titel en de content-filters gewoon,
     * en houdt de pagina de header, footer en styling van de site.
     *
     * Er wordt niets in de database geschreven: de post bestaat alleen voor
     * de duur van dit request (ID 0).
     */
    private static function render_event_page(array $event): void {
        global $wp_query, $wp_the_query;

        status_header(200);

        // Een afgelopen event zonder recap hoort niet in de index: anders
        // loopt het archief vol met dode pagina's.
        $past = mymmo_events_is_past($event);
        $has_recap = !empty($event['recap']['body_html']) || !empty($event['recap']['video_url']);
        if ($past && !$has_recap) {
            add_filter('wp_robots', 'wp_robots_no_robots');
        }

        $post = new WP_Post((object) [
            'ID' => 0,
            'post_author' => 0,
            'post_date' => current_time('mysql'),
            'post_date_gmt' => current_time('mysql', true),
            'post_content' => mymmo_events_render('single', ['event' => $event]),
            'post_title' => (string) ($event['title'] ?? ''),
            'post_excerpt' => (string) ($event['summary'] ?? ''),
            'post_status' => 'publish',
            'comment_status' => 'closed',
            'ping_status' => 'closed',
            'post_name' => (string) ($event['slug'] ?? 'event'),
            'post_modified' => current_time('mysql'),
            'post_modified_gmt' => current_time('mysql', true),
            'post_parent' => 0,
            'guid' => mymmo_events_permalink($event),
            'menu_order' => 0,
            'post_type' => 'page',
            'post_mime_type' => '',
            'comment_count' => 0,
            'filter' => 'raw',
        ]);

        $wp_query->post = $post;
        $wp_query->posts = [$post];
        $wp_query->queried_object = $post;
        $wp_query->queried_object_id = 0;
        $wp_query->found_posts = 1;
        $wp_query->post_count = 1;
        $wp_query->max_num_pages = 1;
        $wp_query->is_page = true;
        $wp_query->is_singular = true;
        $wp_query->is_single = false;
        $wp_query->is_home = false;
        $wp_query->is_archive = false;
        $wp_query->is_category = false;
        $wp_query->is_404 = false;

        // De hoofdquery is de query waar het thema naar kijkt.
        $wp_the_query = $wp_query;

        // De inhoud is al opgeschoond en bevat opzettelijk HTML: laat
        // wpautop en shortcodes er niet over.
        remove_filter('the_content', 'wpautop');
        add_filter('the_content', static fn ($content) => $content, 99);

        // Sommige thema's tonen "laatst bijgewerkt" of een auteursregel op
        // een pagina; met ID 0 valt daar niets te halen, dus dat blijft leeg.
        add_filter('edit_post_link', '__return_empty_string');

        // Vervalt de virtuele post na dit request: WordPress cachet posts
        // per ID, en ID 0 mag daar niet in blijven hangen.
        add_action('shutdown', static function () {
            wp_cache_delete(0, 'posts');
        });
    }

    public static function filter_title(array $parts): array {
        $event = self::$current_event;
        if (!is_array($event)) {
            return $parts;
        }

        $seo_title = $event['seo']['title'] ?? null;
        $parts['title'] = is_string($seo_title) && $seo_title !== ''
            ? $seo_title
            : (string) ($event['title'] ?? 'Event');

        return $parts;
    }

    /** Meta description, Open Graph en schema.org. */
    public static function render_head(): void {
        $event = self::$current_event;
        if (!is_array($event) || get_query_var('mymmo_event_ics')) {
            return;
        }

        $description = (string) ($event['seo']['description'] ?? $event['summary'] ?? '');
        $permalink = mymmo_events_permalink($event);
        $image = (string) ($event['hero_image_url'] ?? '');

        if ($description !== '') {
            printf("<meta name=\"description\" content=\"%s\" />\n", esc_attr($description));
        }
        printf("<link rel=\"canonical\" href=\"%s\" />\n", esc_url($permalink));
        printf("<meta property=\"og:type\" content=\"event\" />\n");
        printf("<meta property=\"og:title\" content=\"%s\" />\n", esc_attr((string) ($event['title'] ?? '')));
        if ($description !== '') {
            printf("<meta property=\"og:description\" content=\"%s\" />\n", esc_attr($description));
        }
        printf("<meta property=\"og:url\" content=\"%s\" />\n", esc_url($permalink));
        if ($image !== '') {
            printf("<meta property=\"og:image\" content=\"%s\" />\n", esc_url($image));
            printf("<meta name=\"twitter:card\" content=\"summary_large_image\" />\n");
        }

        echo '<script type="application/ld+json">' . wp_json_encode(self::schema($event)) . "</script>\n";
    }

    /** @return array<string,mixed> */
    private static function schema(array $event): array {
        $format = (string) ($event['format'] ?? 'online');
        $mode = [
            'online' => 'https://schema.org/OnlineEventAttendanceMode',
            'onsite' => 'https://schema.org/OfflineEventAttendanceMode',
            'hybrid' => 'https://schema.org/MixedEventAttendanceMode',
        ][$format] ?? 'https://schema.org/OnlineEventAttendanceMode';

        $schema = [
            '@context' => 'https://schema.org',
            '@type' => 'Event',
            'name' => (string) ($event['title'] ?? ''),
            'startDate' => (string) ($event['starts_at'] ?? ''),
            'endDate' => (string) ($event['ends_at'] ?? ''),
            'eventAttendanceMode' => $mode,
            'eventStatus' => mymmo_events_is_past($event)
                ? 'https://schema.org/EventScheduled'
                : 'https://schema.org/EventScheduled',
            'url' => mymmo_events_permalink($event),
            'organizer' => [
                '@type' => 'Organization',
                'name' => get_bloginfo('name'),
                'url' => home_url('/'),
            ],
        ];

        $description = (string) ($event['seo']['description'] ?? $event['summary'] ?? '');
        if ($description !== '') {
            $schema['description'] = $description;
        }
        if (!empty($event['hero_image_url'])) {
            $schema['image'] = (string) $event['hero_image_url'];
        }

        $location_name = (string) ($event['location']['name'] ?? '');
        if ($format === 'onsite' || ($format === 'hybrid' && $location_name !== '')) {
            $schema['location'] = [
                '@type' => 'Place',
                'name' => $location_name !== '' ? $location_name : get_bloginfo('name'),
                'address' => $location_name,
            ];
        } else {
            $schema['location'] = [
                '@type' => 'VirtualLocation',
                'url' => mymmo_events_permalink($event),
            ];
        }

        return $schema;
    }

    /**
     * Een .ics-bestand voor "Toevoegen aan agenda".
     *
     * Bewust zonder de online link: die is voor ingeschrevenen en komt per
     * mail. In de agenda staat de eventpagina.
     */
    private static function send_ics(array $event): void {
        $start = mymmo_events_date($event['starts_at'] ?? null);
        $end = mymmo_events_date($event['ends_at'] ?? null);

        if (!$start) {
            self::send_404();
            return;
        }

        $utc = new DateTimeZone('UTC');
        $stamp = static fn (DateTimeImmutable $d): string => $d->setTimezone($utc)->format('Ymd\THis\Z');

        $escape = static fn (string $text): string => str_replace(
            ["\\", "\n", ',', ';'],
            ['\\\\', '\\n', '\\,', '\\;'],
            wp_strip_all_tags($text)
        );

        $uid = 'mymmo-event-' . (int) ($event['id'] ?? 0) . '@' . wp_parse_url(home_url(), PHP_URL_HOST);

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Mymmo//Events//NL',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:' . $uid,
            'DTSTAMP:' . $stamp(new DateTimeImmutable('now', $utc)),
            'DTSTART:' . $stamp($start),
        ];
        if ($end) {
            $lines[] = 'DTEND:' . $stamp($end);
        }
        $lines[] = 'SUMMARY:' . $escape((string) ($event['title'] ?? 'Event'));
        $summary = (string) ($event['summary'] ?? '');
        if ($summary !== '') {
            $lines[] = 'DESCRIPTION:' . $escape($summary);
        }
        $location = (string) ($event['location']['name'] ?? '');
        if ($location !== '') {
            $lines[] = 'LOCATION:' . $escape($location);
        }
        $lines[] = 'URL:' . mymmo_events_permalink($event);
        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';

        $filename = sanitize_file_name(($event['slug'] ?? 'event') . '.ics');

        nocache_headers();
        header('Content-Type: text/calendar; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo implode("\r\n", $lines) . "\r\n";
        exit;
    }
}
