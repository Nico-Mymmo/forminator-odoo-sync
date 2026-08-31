<?php
/**
 * Routing voor de eventpagina en het .ics-bestand.
 *
 * TERUGVAL-ROUTING — het uitgangspunt van dit bestand
 * ---------------------------------------------------
 * De plugin registreert GEEN rewrite rules en claimt /event/{slug}/ dus
 * niet. Hij komt pas in actie als WordPress zelf niets gevonden heeft.
 *
 * Waarom: The Events Calendar bezit dat pad vandaag. Zou de plugin het
 * overnemen, dan gaf elke slug die de Operations Manager niet kent een 404 —
 * ook events die in WordPress nog gewoon bestaan. En dat geldt sitebreed,
 * ook als de shortcode alleen op een privé-testpagina staat.
 *
 * Met terugval gebeurt precies wat je wil:
 *   - bestaat er een The Events Calendar-pagina? die blijft, ongewijzigd
 *   - bestaat die niet, maar kent de OM het event? dan renderen wij
 *   - kent niemand het? dan blijft het een gewone 404
 *
 * Er is dus niets aan of uit te zetten, geen permalinks te bewaren, en niets
 * dat kan breken. Deactiveer je The Events Calendar later, dan neemt de OM
 * die URL's automatisch over.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Router {

    private static ?array $current_event = null;
    private static bool $is_event_request = false;

    public static function init(): void {
        // Prioriteit 5: vóór redirect_canonical (10), zodat WordPress onze
        // overname niet alsnog wegredirect.
        add_action('template_redirect', [self::class, 'maybe_handle'], 5);
        add_filter('document_title_parts', [self::class, 'filter_title']);
        add_action('wp_head', [self::class, 'render_head'], 5);
    }

    /**
     * Staat de terugval aan? Standaard ja: hij kan per definitie niets
     * breken, want hij komt alleen in actie op URL's die anders een 404
     * zouden zijn.
     */
    public static function fallback_enabled(): bool {
        $value = get_option('mymmo_events_fallback_routing', null);
        return $value === null ? true : (bool) $value;
    }

    public static function is_event_request(): bool {
        return self::$is_event_request;
    }

    /** @return array<string,mixed>|null */
    public static function current_event(): ?array {
        return self::$current_event;
    }

    /** Het pad van dit verzoek, zonder leidende of sluitende slash. */
    private static function request_path(): string {
        return isset($GLOBALS['wp']->request) ? trim((string) $GLOBALS['wp']->request, '/') : '';
    }

    private static function event_base(): string {
        return trim((string) get_option('mymmo_events_event_base', MYMMO_EVENTS_DEFAULT_EVENT_BASE), '/');
    }

    /**
     * De slug uit de URL. Ook bruikbaar door de shortcode wanneer die op een
     * gewone pagina staat.
     */
    public static function requested_slug(): string {
        if (is_array(self::$current_event) && !empty(self::$current_event['slug'])) {
            return (string) self::$current_event['slug'];
        }

        $request = self::request_path();
        $base = self::event_base();

        if ($request === '' || $base === '') {
            return '';
        }
        if (preg_match('#^' . preg_quote($base, '#') . '/([^/]+?)(?:/ics)?$#', $request, $matches)) {
            return rawurldecode($matches[1]);
        }
        return '';
    }

    /**
     * De terugval zelf.
     */
    public static function maybe_handle(): void {
        if (!self::fallback_enabled() || !is_404()) {
            return;
        }

        $request = self::request_path();
        $base = self::event_base();

        if ($request === '' || $base === '') {
            return;
        }

        $pattern = '#^' . preg_quote($base, '#') . '/([^/]+?)(?:/(ics))?$#';
        if (!preg_match($pattern, $request, $matches)) {
            return;
        }

        $slug = rawurldecode($matches[1]);
        $wants_ics = !empty($matches[2]);

        $event = Mymmo_Events_Api_Client::get_event($slug);

        // Oude link met ?owid=: probeer het Odoo-id, en stuur daarna door
        // naar de actuele URL.
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

        // Kent de OM het ook niet? Dan blijft het een gewone 404.
        if ($event === null) {
            return;
        }

        self::$is_event_request = true;
        self::$current_event = $event;

        // Wij nemen deze URL over, dus WordPress mag hem niet meer
        // wegredirecten op grond van zijn eigen canonical-logica.
        remove_action('template_redirect', 'redirect_canonical');

        if ($wants_ics) {
            self::send_ics($event);
            return;
        }

        self::render_event_page($event);
    }

    /**
     * De eventpagina renderen binnen het thema.
     *
     * Een NEP-POST in de hoofdquery, geen the_content-filter: op een
     * virtuele pagina loopt er geen loop, dus die filter vuurt niet altijd.
     * Met een echte WP_Post werken de paginatemplate van het thema, de titel
     * en de content-filters gewoon, en houdt de pagina header, footer en
     * styling van de site.
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
            // LEEG LATEN. Het thema print de excerpt onder de titel, en onze
            // template toont de samenvatting ook — dat gaf de dubbele regel.
            // De titel laten we wél aan het thema, zodat de pagina eruitziet
            // als elke andere pagina op de site.
            'post_excerpt' => '',
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

        $wp_the_query = $wp_query;

        // De inhoud is al opgeschoond en bevat opzettelijk HTML.
        remove_filter('the_content', 'wpautop');
        add_filter('edit_post_link', '__return_empty_string');

        // WordPress cachet posts per ID; ID 0 mag daar niet blijven hangen.
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
        if (!is_array($event)) {
            return;
        }

        $description = (string) ($event['seo']['description'] ?? $event['summary'] ?? '');
        $permalink = mymmo_events_permalink($event);
        $image = (string) ($event['hero_image_url'] ?? '');

        if ($description !== '') {
            printf("<meta name=\"description\" content=\"%s\" />\n", esc_attr($description));
        }

        // Een gedeeld event bestaat op beide sites op hetzelfde pad. De API
        // geeft dan een canonical naar de hoofdsite mee; zonder dat is het
        // dubbele content.
        $canonical = !empty($event['canonical_url']) ? (string) $event['canonical_url'] : $permalink;
        printf("<link rel=\"canonical\" href=\"%s\" />\n", esc_url($canonical));

        printf("<meta property=\"og:type\" content=\"event\" />\n");
        printf("<meta property=\"og:title\" content=\"%s\" />\n", esc_attr((string) ($event['title'] ?? '')));
        if ($description !== '') {
            printf("<meta property=\"og:description\" content=\"%s\" />\n", esc_attr($description));
        }
        printf("<meta property=\"og:url\" content=\"%s\" />\n", esc_url($canonical));
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
            'eventStatus' => 'https://schema.org/EventScheduled',
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
