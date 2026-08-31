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
        // Op een eventpagina staat al vast dat we assets nodig hebben: de
        // router heeft bij template_redirect (prioriteit 5) al beslist, en
        // dat is vóór wp_enqueue_scripts. Zo komen de stijlen in de head
        // terecht in plaats van in de footer.
        $on_event_page = Mymmo_Events_Router::is_event_request();

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

        if ($on_event_page) {
            self::need_assets();
        }
    }

    /** Alleen laden op pagina's die de plugin echt gebruiken. */
    private static function need_assets(): void {
        self::$assets_needed = true;
        wp_enqueue_style('mymmo-events');
        wp_enqueue_script('mymmo-events');
    }

    /**
     * Vangnet: een shortcode die pas tijdens het renderen van de content
     * langskomt, na wp_enqueue_scripts. Dan laadt WordPress de stijl in de
     * footer — minder mooi, maar beter dan geen stijl.
     */
    public static function maybe_enqueue(): void {
        if (!self::$assets_needed && Mymmo_Events_Router::is_event_request()) {
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

        // BELANGRIJK: geen format('c'). Dat geeft "…+00:00", en WordPress'
        // add_query_arg encodeert waarden niet — dus die `+` gaat letterlijk
        // de querystring in, waar hij een SPATIE betekent. De API kreeg dan
        // "…T23:00:00 00:00" en gaf een 503. Altijd 'Z' gebruiken.
        $events = Mymmo_Events_Api_Client::get_events([
            'from' => mymmo_events_utc_param($grid_start),
            'to' => mymmo_events_utc_param($grid_end),
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

        $this_month = (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m');

        $output = mymmo_events_render('calendar', [
            'month' => $month,
            'jumped' => $month !== $this_month && !isset($_GET['mymmo_month']),
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

        return $output . self::debug_panel([
            'Gevraagde maand' => $month,
            'Venster van' => $grid_start->format('Y-m-d H:i:s T') . ' → ' . $grid_end->format('Y-m-d H:i:s T'),
            'Naar de API (UTC)' => mymmo_events_utc_param($grid_start)
                . ' → ' . mymmo_events_utc_param($grid_end),
            'Events terug' => count($events),
            'Dagen met events' => implode(', ', array_keys($by_day)) ?: '(geen)',
            'Weergavetijdzone' => mymmo_events_timezone()->getName(),
            'Servertijd nu' => (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m-d H:i:s T'),
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
        ]) . self::debug_panel([
            'Events terug' => count($events),
            'Verleden meegenomen' => $show_past ? 'ja' : 'nee',
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

    /**
     * Debugpaneel onder de shortcode-uitvoer.
     *
     * Alleen voor beheerders en alleen met ?mymmo_debug=1 in de URL. Toont
     * exact welk verzoek de shortcode deed, met welke parameters, wat eruit
     * kwam en of het uit de cache kwam. De cache staat in debugmodus uit,
     * anders debug je de cache in plaats van de API.
     */
    private static function debug_panel(array $context = []): string {
        if (!Mymmo_Events_Api_Client::debug_enabled()) {
            return '';
        }

        $rows = '';
        foreach (Mymmo_Events_Api_Client::log() as $entry) {
            $rows .= '<tr>'
                . '<td><code>' . esc_html((string) $entry['path']) . '</code></td>'
                . '<td><code>' . esc_html(wp_json_encode($entry['params'])) . '</code></td>'
                . '<td>' . esc_html((string) $entry['outcome'])
                . ($entry['status'] ? ' (' . esc_html((string) $entry['status']) . ')' : '') . '</td>'
                . '<td>' . esc_html($entry['items'] === null ? '—' : (string) $entry['items']) . '</td>'
                . '</tr>';
        }

        $extra = '';
        foreach ($context as $label => $value) {
            $extra .= '<tr><th>' . esc_html((string) $label) . '</th><td><code>'
                . esc_html(is_scalar($value) ? (string) $value : (string) wp_json_encode($value))
                . '</code></td></tr>';
        }

        return '<div class="mymmo-ev mymmo-ev-debug">'
            . '<p class="mymmo-ev-debug__title">Mymmo Events — debug (alleen zichtbaar voor beheerders)</p>'
            . ($extra !== '' ? '<table class="mymmo-ev-debug__table"><tbody>' . $extra . '</tbody></table>' : '')
            . '<table class="mymmo-ev-debug__table"><thead><tr>'
            . '<th>Endpoint</th><th>Parameters</th><th>Herkomst</th><th>Items</th>'
            . '</tr></thead><tbody>' . ($rows !== '' ? $rows : '<tr><td colspan="4">Geen verzoeken.</td></tr>')
            . '</tbody></table>'
            . '<p class="mymmo-ev-debug__hint">Komt hier 1 item maar staat de kalender leeg, dan valt het event '
            . 'buiten het gevraagde venster of buiten de getoonde maand. Staat er 0 en geeft de diagnose in de '
            . 'instellingen wel resultaat, dan zit er een cache tussen: deze pagina zelf, of een pagina-cache.</p>'
            . '</div>';
    }

    /**
     * Welke maand toont de kalender?
     *
     * Volgorde: ?mymmo_month= uit de URL, dan de shortcode-parameter, dan de
     * maand van het EERSTVOLGENDE event, en pas als laatste deze maand.
     *
     * Die derde stap is belangrijk: staan er deze maand geen events maar
     * verderop wel, dan lijkt de kalender leeg terwijl er niets fout is. Dan
     * moet de bezoeker zelf gaan bladeren, en dat doet niemand.
     */
    private static function resolve_month(string $requested): string {
        $from_query = isset($_GET['mymmo_month']) ? sanitize_text_field(wp_unslash($_GET['mymmo_month'])) : '';

        foreach ([$from_query, $requested] as $candidate) {
            if (preg_match('/^\d{4}-\d{2}$/', $candidate)) {
                return $candidate;
            }
        }

        $this_month = (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m');

        $next = Mymmo_Events_Api_Client::get_next_event();
        if (is_array($next) && preg_match('/^\d{4}-\d{2}$/', (string) $next['month'])) {
            // Nooit terug in de tijd springen.
            return $next['month'] > $this_month ? $next['month'] : $this_month;
        }

        return $this_month;
    }
}
