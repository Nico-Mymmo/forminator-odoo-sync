<?php
/**
 * De drie shortcodes. Alles server-side gerenderd, zodat het werkt in een
 * klassiek thema, in een Elementor-codeblok en in een Gutenberg-
 * shortcodeblok — en zonder JavaScript.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Shortcodes {

    private static bool $assets_needed = false;

    public static function init(): void {
        add_shortcode('mymmo_events_calendar', [self::class, 'calendar']);
        add_shortcode('mymmo_events_list', [self::class, 'listing']);
        add_shortcode('mymmo_event', [self::class, 'single']);

        add_action('wp_enqueue_scripts', [self::class, 'register_assets']);
        add_action('wp_footer', [self::class, 'maybe_enqueue'], 5);
    }

    public static function register_assets(): void {
        wp_register_style(
            'mymmo-events',
            MYMMO_EVENTS_URL . 'assets/css/mymmo-events.css',
            [],
            MYMMO_EVENTS_VERSION
        );
        wp_register_script(
            'mymmo-events',
            MYMMO_EVENTS_URL . 'assets/js/mymmo-events.js',
            [],
            MYMMO_EVENTS_VERSION,
            true
        );
    }

    /** Alleen laden op pagina's die de plugin echt gebruiken. */
    private static function need_assets(): void {
        self::$assets_needed = true;
        wp_enqueue_style('mymmo-events');
        wp_enqueue_script('mymmo-events');
    }

    public static function maybe_enqueue(): void {
        if (Mymmo_Events_Router::is_event_request() && !self::$assets_needed) {
            self::need_assets();
        }
    }

    /**
     * [mymmo_events_calendar month="2026-09" type="" format=""]
     */
    public static function calendar($atts): string {
        self::need_assets();

        $atts = shortcode_atts([
            'month' => '',
            'type' => '',
            'format' => '',
        ], $atts, 'mymmo_events_calendar');

        $month = self::resolve_month((string) $atts['month']);
        $tz = mymmo_events_timezone();

        $first = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $month . '-01 00:00:00', $tz);
        if (!$first) {
            $first = new DateTimeImmutable('first day of this month 00:00:00', $tz);
        }
        $first = $first->modify('first day of this month')->setTime(0, 0);
        $last = $first->modify('last day of this month')->setTime(23, 59, 59);

        // Het raster begint op maandag en eindigt op zondag.
        $grid_start = $first->modify('-' . ((int) $first->format('N') - 1) . ' days');
        $grid_end = $last->modify('+' . (7 - (int) $last->format('N')) . ' days');

        $events = Mymmo_Events_Api_Client::get_events([
            'from' => $grid_start->setTimezone(new DateTimeZone('UTC'))->format('c'),
            'to' => $grid_end->setTimezone(new DateTimeZone('UTC'))->format('c'),
            'type' => $atts['type'],
            'format' => $atts['format'],
            'include_past' => true,
            'limit' => 200,
        ]);

        // Groeperen per dag in de weergavetijdzone.
        $by_day = [];
        foreach ($events as $event) {
            $start = mymmo_events_date($event['starts_at'] ?? null);
            if (!$start) {
                continue;
            }
            $by_day[$start->format('Y-m-d')][] = $event;
        }

        return mymmo_events_render('calendar', [
            'month' => $month,
            'first' => $first,
            'last' => $last,
            'grid_start' => $grid_start,
            'grid_end' => $grid_end,
            'by_day' => $by_day,
            'type' => (string) $atts['type'],
            'format' => (string) $atts['format'],
            'stale' => Mymmo_Events_Api_Client::served_stale(),
            'empty' => $events === [],
        ]);
    }

    /**
     * [mymmo_events_list limit="10" type="" format="" show_past="0" layout="rows"]
     */
    public static function listing($atts): string {
        self::need_assets();

        $atts = shortcode_atts([
            'limit' => 10,
            'type' => '',
            'format' => '',
            'show_past' => '0',
            'layout' => 'rows',
        ], $atts, 'mymmo_events_list');

        $show_past = in_array((string) $atts['show_past'], ['1', 'true', 'yes'], true);

        $events = Mymmo_Events_Api_Client::get_events([
            'type' => $atts['type'],
            'format' => $atts['format'],
            'limit' => max(1, min(200, (int) $atts['limit'])),
            'include_past' => $show_past,
        ]);

        return mymmo_events_render('list', [
            'events' => $events,
            'layout' => (string) $atts['layout'] === 'cards' ? 'cards' : 'rows',
            'show_past' => $show_past,
            'stale' => Mymmo_Events_Api_Client::served_stale(),
        ]);
    }

    /**
     * [mymmo_event slug="..."]
     *
     * Zonder slug wordt die uit de URL gehaald, zodat dezelfde shortcode op
     * de detailpagina werkt.
     */
    public static function single($atts): string {
        self::need_assets();

        $atts = shortcode_atts(['slug' => ''], $atts, 'mymmo_event');
        $slug = (string) $atts['slug'];

        if ($slug === '') {
            $current = Mymmo_Events_Router::current_event();
            if (is_array($current)) {
                return mymmo_events_render('single', ['event' => $current]);
            }
            $slug = Mymmo_Events_Router::requested_slug();
        }

        if ($slug === '') {
            return '';
        }

        $event = Mymmo_Events_Api_Client::get_event($slug);
        if ($event === null) {
            return '<p class="mymmo-ev-empty">Dit event is niet gevonden.</p>';
        }

        return mymmo_events_render('single', ['event' => $event]);
    }

    /** "JJJJ-MM" uit de shortcode of uit ?mymmo_month=, anders deze maand. */
    private static function resolve_month(string $requested): string {
        $from_query = isset($_GET['mymmo_month']) ? sanitize_text_field(wp_unslash($_GET['mymmo_month'])) : '';

        foreach ([$from_query, $requested] as $candidate) {
            if (preg_match('/^\d{4}-\d{2}$/', $candidate)) {
                return $candidate;
            }
        }

        return (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m');
    }
}
