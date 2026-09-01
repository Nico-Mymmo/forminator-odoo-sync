<?php
/**
 * De drie shortcodes. Alles server-side gerenderd, zodat het werkt in een
 * klassiek thema, in een Elementor-codeblok en in een Gutenberg-
 * shortcodeblok — en zonder JavaScript.
 *
 * PRESTATIE-OPZET (waarom dit bestand meer doet dan "1 maand ophalen"):
 * de kalender en de lijst halen niet per maand apart events op. In plaats
 * daarvan haalt fetch_horizon_events() in ÉÉN aanvraag alle events op van
 * deze maand tot MONTHS_AHEAD maanden verderop, en rendert calendar()/
 * listing() meteen ALLE maanden in dat bereik mee in de pagina (verborgen,
 * op de gevraagde maand na). Vorige/volgende maand wordt daardoor pure
 * DOM tonen/verbergen in mymmo-events.js — geen enkele aanvraag meer, dus
 * geen wachttijd. En omdat elke bezoeker (voor dezelfde maand-reeks en
 * dezelfde filters) exact dezelfde aanvraag doet, komt die uit de gedeelde
 * cache van Mymmo_Events_Api_Client (60s, mymmo_events_cache_ttl) in
 * plaats van dat elke bezoeker zijn eigen, verse Odoo-aanvraag triggert.
 *
 * De maandnavigatie en de type-filter chips werken zonder JS via gewone
 * links (?mymmo_month=, ?mymmo_type=). Is JS wel actief, dan onderschept
 * mymmo-events.js die klikken en toont hij de al meegerenderde maand; enkel
 * ver buiten het vooraf opgehaalde bereik (zeldzaam) haalt hij alsnog één
 * maand op via het REST-endpoint in class-rest.php. build_calendar_data()
 * en build_list_data() hieronder zijn de gedeelde databron voor alle drie
 * de paden (eerste render, vooraf gerenderde maanden, REST-fallback),
 * zodat er nergens twee keer dezelfde renderlogica staat.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Shortcodes {

    private static bool $assets_needed = false;

    /**
     * Hoeveel maanden vooruit (na deze maand) meteen meegerenderd worden.
     * Hoger = meer maanden zonder enige aanvraag doorbladerbaar, maar ook
     * een grotere pagina. 12 is ruim voldoende voor normaal bladergedrag;
     * verder dan dat valt terug op een aparte (trage) aanvraag per maand,
     * zie build_calendar_data()/build_list_data().
     */
    private const MONTHS_AHEAD = 12;

    public static function init(): void {
        add_shortcode('mymmo_events_calendar', [self::class, 'calendar']);
        add_shortcode('mymmo_events_list', [self::class, 'listing']);
        add_shortcode('mymmo_event', [self::class, 'single']);
        add_shortcode('mymmo_events_announcement', [self::class, 'announcement']);

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

        $requested_month = self::resolve_month((string) $atts['month']);
        $this_month = (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m');

        // Enkel als "jumped" tonen als niemand expliciet een maand koos --
        // een echte klik op vorige/volgende (of een AJAX-maandwissel) mag
        // nooit een verrassingsmelding tonen.
        $jumped = $requested_month !== $this_month && !isset($_GET['mymmo_month']);

        $type_attr = (string) $atts['type'];
        $format = (string) $atts['format'];

        $data = self::build_calendar_data($requested_month, $type_attr, $format);
        $data['jumped'] = $jumped;

        // Alle maanden binnen het vooraf opgehaalde bereik meteen mee
        // renderen (verborgen, op de gevraagde maand na) -- zie de uitleg
        // bovenaan dit bestand. build_calendar_data() haalt voor elke maand
        // in dit bereik dezelfde, al gedeelde dataset op (fetch_horizon_
        // events()), dus dit kost geen extra live aanvragen: enkel wat
        // extra (goedkope) PHP-renderwerk.
        $data['months'] = self::render_month_range(
            'calendar-inner',
            $this_month,
            $data['horizon_month'],
            $data['month'],
            static fn (string $m): array => self::build_calendar_data($m, $type_attr, $format)
        );

        $output = mymmo_events_render('calendar', $data);

        return $output . self::debug_panel([
            'Gevraagde maand' => $data['month'],
            'Vooraf gerenderd t/m' => $data['horizon_month'],
            'Venster van' => $data['grid_start']->format('Y-m-d H:i:s T') . ' → ' . $data['grid_end']->format('Y-m-d H:i:s T'),
            'Naar de API (UTC)' => mymmo_events_utc_param($data['grid_start'])
                . ' → ' . mymmo_events_utc_param($data['grid_end']),
            'Events terug' => array_sum(array_map('count', $data['by_day'])),
            'Dagen met events' => implode(', ', array_keys($data['by_day'])) ?: '(geen)',
            'Weergavetijdzone' => mymmo_events_timezone()->getName(),
            'Servertijd nu' => (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m-d H:i:s T'),
        ]);
    }

    /**
     * Bouwt alle data voor de kalendertemplate (partials/calendar-inner) op,
     * voor een gegeven maand. Gedeeld door de shortcode (eerste render +
     * alle vooraf gerenderde maanden) en het REST-endpoint (maandwissel
     * ver buiten het vooraf opgehaalde bereik).
     *
     * Valt de gevraagde maand binnen [deze maand, deze maand + MONTHS_AHEAD]
     * (verreweg het gewone geval), dan komt de data uit de ÉÉN-keer-per-
     * bereik-opgehaalde dataset van fetch_horizon_events() -- diezelfde
     * aanroep met dezelfde parameters wordt binnen dit PHP-request gememo'd
     * en tussen requests/bezoekers 60s gecached, dus alle maanden in bereik
     * SAMEN kosten hooguit één live aanvraag. Erbuiten (zeldzaam: een
     * shortcode-attribuut of ?mymmo_month= ver in de toekomst) valt dit
     * terug op een eigen, kleinere aanvraag voor enkel die ene maand.
     *
     * @return array<string,mixed>
     */
    public static function build_calendar_data(string $month, string $type_attr, string $format): array {
        $tz = mymmo_events_timezone();

        $this_month_floor = (new DateTimeImmutable('now', $tz))->format('Y-m');
        if ($month < $this_month_floor) {
            $month = $this_month_floor;
        }
        $horizon_month = self::horizon_month($tz);

        $first = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $month . '-01 00:00:00', $tz);
        if (!$first) {
            $first = new DateTimeImmutable('first day of this month 00:00:00', $tz);
        }
        $first = $first->modify('first day of this month')->setTime(0, 0);
        $last = $first->modify('last day of this month')->setTime(23, 59, 59);

        // Het raster begint op maandag en eindigt op zondag.
        $grid_start = $first->modify('-' . ((int) $first->format('N') - 1) . ' days');
        $grid_end = $last->modify('+' . (7 - (int) $last->format('N')) . ' days');

        if ($month <= $horizon_month) {
            $horizon = self::fetch_horizon_events($type_attr, $format);
            $events_source = $horizon['events'];
            $all_types = $horizon['all_types'];
            $selected_types = $horizon['selected_types'];
        } else {
            // Zeldzaam (verder dan MONTHS_AHEAD vooruit bladeren): eigen,
            // kleinere aanvraag voor enkel deze maand -- zoals vóór de
            // vooraf-renderen-opzet hierboven.
            $all_types = $type_attr === '' ? Mymmo_Events_Api_Client::get_event_types() : [];
            $selected_types = self::resolve_types($type_attr, $all_types);
            $events_source = Mymmo_Events_Api_Client::get_events([
                'from' => mymmo_events_utc_param($grid_start),
                'to' => mymmo_events_utc_param($grid_end),
                'type' => $type_attr === '' ? '' : implode(',', $selected_types),
                'format' => $format,
                'include_past' => true,
                'limit' => 200,
            ]);
        }

        // Groeperen per dag in de weergavetijdzone. $events_source kan de
        // hele horizon beslaan (bij de gedeelde dataset) -- hier knippen we
        // alleen wat binnen dit maandraster valt.
        $by_day = [];
        foreach ($events_source as $event) {
            $start = mymmo_events_date($event['starts_at'] ?? null);
            if (!$start || $start < $grid_start || $start > $grid_end) {
                continue;
            }
            $by_day[$start->format('Y-m-d')][] = $event;
        }

        return [
            'month' => $month,
            'jumped' => false,
            'first' => $first,
            'last' => $last,
            'grid_start' => $grid_start,
            'grid_end' => $grid_end,
            'by_day' => $by_day,
            'type' => $type_attr,
            'format' => $format,
            'stale' => Mymmo_Events_Api_Client::served_stale(),
            'empty' => $by_day === [],
            'types' => $all_types,
            'selected_types' => $selected_types,
            'this_month' => $this_month_floor,
            'horizon_month' => $horizon_month,
        ];
    }

    /**
     * [mymmo_events_list limit="10" type="" format="" show_past="0" layout="rows" month=""]
     *
     * Toont een MAAND tegelijk (net als de kalender) met dezelfde vorige/
     * volgende-navigatie, in plaats van kaal "de eerstvolgende N events":
     * zo kan een bezoeker ook in de lijstweergave doorbladeren naar latere
     * maanden.
     */
    public static function listing($atts): string {
        self::need_assets();

        $atts = shortcode_atts([
            'limit' => 50,
            'type' => '',
            'format' => '',
            'show_past' => '0',
            'layout' => 'rows',
            'month' => '',
        ], $atts, 'mymmo_events_list');

        $show_past = in_array((string) $atts['show_past'], ['1', 'true', 'yes'], true);
        $month = self::resolve_month((string) $atts['month']);
        $type_attr = (string) $atts['type'];
        $format = (string) $atts['format'];
        $layout = (string) $atts['layout'];
        $limit = max(1, min(200, (int) $atts['limit']));

        $data = self::build_list_data($month, $type_attr, $format, $show_past, $layout, $limit);

        $this_month = (new DateTimeImmutable('now', mymmo_events_timezone()))->format('Y-m');

        // Zelfde vooraf-renderen als de kalender -- zie de uitleg bovenaan
        // dit bestand. Bij show_past laten we dat verder in het verleden
        // bladeren gewoon via de bestaande (per-maand) aanvraag lopen: dat
        // is de zeldzamere weg, de vooraf-gerenderde reeks dekt altijd
        // minstens deze maand t/m de horizon.
        $data['months'] = self::render_month_range(
            'list-inner',
            $this_month,
            $data['horizon_month'],
            $data['month'],
            static fn (string $m): array => self::build_list_data($m, $type_attr, $format, $show_past, $layout, $limit)
        );

        return mymmo_events_render('list', $data) . self::debug_panel([
            'Maand' => $data['month'],
            'Vooraf gerenderd t/m' => $data['horizon_month'],
            'Events terug' => count($data['events']),
            'Verleden toegelaten' => $show_past ? 'ja' : 'nee',
        ]);
    }

    /**
     * Bouwt alle data voor de lijsttemplate (partials/list-inner) op, voor
     * een gegeven maand. Zelfde gedeelde-dataset-opzet als
     * build_calendar_data() hierboven -- zie die docblock.
     *
     * @return array<string,mixed>
     */
    public static function build_list_data(
        string $month,
        string $type_attr,
        string $format,
        bool $show_past,
        string $layout,
        int $limit
    ): array {
        $tz = mymmo_events_timezone();
        $this_month_floor = (new DateTimeImmutable('now', $tz))->format('Y-m');
        if (!$show_past && $month < $this_month_floor) {
            $month = $this_month_floor;
        }
        $horizon_month = self::horizon_month($tz);

        $first = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $month . '-01 00:00:00', $tz);
        if (!$first) {
            $first = new DateTimeImmutable('first day of this month 00:00:00', $tz);
        }
        $first = $first->modify('first day of this month')->setTime(0, 0);
        $last = $first->modify('last day of this month')->setTime(23, 59, 59);

        // Zelfde raster als de kalender (maandag t/m zondag, met een paar
        // dagen uit de buurmaanden erbij) -- niet omdat de lijst die dagen
        // toont (die filteren we hieronder er weer uit), maar zodat een
        // kalender- en een lijst-shortcode voor dezelfde maand op één
        // pagina exact dezelfde from/to/type/format opvragen en dus dezelfde
        // gedeelde dataset raken (zie fetch_horizon_events()).
        $grid_start = $first->modify('-' . ((int) $first->format('N') - 1) . ' days');
        $grid_end = $last->modify('+' . (7 - (int) $last->format('N')) . ' days');

        if ($month >= $this_month_floor && $month <= $horizon_month) {
            $horizon = self::fetch_horizon_events($type_attr, $format);
            $events_source = $horizon['events'];
            $all_types = $horizon['all_types'];
            $selected_types = $horizon['selected_types'];
        } else {
            // Buiten het vooraf opgehaalde bereik (bv. show_past ver in het
            // verleden, of ver in de toekomst): eigen, kleinere aanvraag.
            $all_types = $type_attr === '' ? Mymmo_Events_Api_Client::get_event_types() : [];
            $selected_types = self::resolve_types($type_attr, $all_types);
            $events_source = Mymmo_Events_Api_Client::get_events([
                'from' => mymmo_events_utc_param($grid_start),
                'to' => mymmo_events_utc_param($grid_end),
                'type' => $type_attr === '' ? '' : implode(',', $selected_types),
                'format' => $format,
                'include_past' => true,
                'limit' => 200,
            ]);
        }

        // De lijst toont enkel DEZE maand -- de dagen uit de buurmaanden
        // (of de andere maanden uit de gedeelde dataset) er weer
        // uitfilteren, en pas daarna de eigen (shortcode-)limiet toepassen.
        $month_events = array_values(array_filter($events_source, static function (array $event) use ($first, $last): bool {
            $start = mymmo_events_date($event['starts_at'] ?? null);
            return $start !== null && $start >= $first && $start <= $last;
        }));
        $limited_events = array_slice($month_events, 0, max(1, min(200, $limit)));

        return [
            'month' => $month,
            'first' => $first,
            'events' => $limited_events,
            'layout' => $layout === 'cards' ? 'cards' : 'rows',
            'show_past' => $show_past,
            'stale' => Mymmo_Events_Api_Client::served_stale(),
            'type' => $type_attr,
            'types' => $all_types,
            'selected_types' => $selected_types,
            'this_month' => $this_month_floor,
            'horizon_month' => $horizon_month,
        ];
    }

    /**
     * Haalt in ÉÉN aanvraag alle events op van deze maand tot MONTHS_AHEAD
     * maanden verderop (met het gebruikelijke week-raster eromheen). Zowel
     * build_calendar_data() als build_list_data() knippen daar zelf de
     * gevraagde maand uit.
     *
     * Meerdere maanden na elkaar opvragen (om ze vooraf te renderen, zie
     * calendar()/listing()) kost zo maar ÉÉN live aanvraag: identieke
     * parameters worden al binnen dit PHP-request gememo'd door
     * Mymmo_Events_Api_Client, en daarna nog eens 60s (mymmo_events_cache_
     * ttl) gecached -- voor de VOLGENDE bezoeker, ongeacht welke maand die
     * bekijkt of dat het de kalender of de lijst is (zelfde parameters,
     * zelfde cache-key).
     *
     * @return array{events: array<int,array<string,mixed>>, all_types: array<int,array<string,mixed>>, selected_types: int[]}
     */
    private static function fetch_horizon_events(string $type_attr, string $format): array {
        $tz = mymmo_events_timezone();
        $this_month_start = (new DateTimeImmutable('now', $tz))->modify('first day of this month')->setTime(0, 0);
        $horizon_end = $this_month_start
            ->modify('+' . self::MONTHS_AHEAD . ' months')
            ->modify('last day of this month')->setTime(23, 59, 59);

        $grid_start = $this_month_start->modify('-' . ((int) $this_month_start->format('N') - 1) . ' days');
        $grid_end = $horizon_end->modify('+' . (7 - (int) $horizon_end->format('N')) . ' days');

        $all_types = $type_attr === '' ? Mymmo_Events_Api_Client::get_event_types() : [];
        $selected_types = self::resolve_types($type_attr, $all_types);

        $events = Mymmo_Events_Api_Client::get_events([
            'from' => mymmo_events_utc_param($grid_start),
            'to' => mymmo_events_utc_param($grid_end),
            'type' => $type_attr === '' ? '' : implode(',', $selected_types),
            'format' => $format,
            'include_past' => true,
            // Ruim boven wat deze site ooit tegelijk aan aankomende events
            // zal hebben -- dit is nu ÉÉN aanvraag voor >1 jaar in plaats
            // van één per maand, dus de marge mag hier groter dan de 200
            // van een losse maand.
            'limit' => 500,
        ]);

        return [
            'events' => $events,
            'all_types' => $all_types,
            'selected_types' => $selected_types,
        ];
    }

    /** Laatste maand ("Y-m") die nog vooraf opgehaald/gerenderd wordt. */
    private static function horizon_month(DateTimeZone $tz): string {
        return (new DateTimeImmutable('now', $tz))->modify('+' . self::MONTHS_AHEAD . ' months')->format('Y-m');
    }

    /**
     * Rendert partials/{$template} voor elke maand van $from t/m $to (beide
     * "Y-m", $to inclusief), plus altijd $current -- ook als die buiten dat
     * bereik valt (kan bv. bij een handmatige ?mymmo_month= ver in de
     * toekomst, of als er de eerstkomende MONTHS_AHEAD maanden niets
     * gepland staat en resolve_month() naar het eerstvolgende event
     * springt). $build($maand) levert de renderdata voor die maand.
     *
     * @return array<string,string> "Y-m" => HTML
     */
    private static function render_month_range(
        string $template,
        string $from,
        string $to,
        string $current,
        callable $build
    ): array {
        $months = [];
        $cursor = DateTimeImmutable::createFromFormat('Y-m-d', $from . '-01') ?: new DateTimeImmutable('first day of this month');
        $end = DateTimeImmutable::createFromFormat('Y-m-d', $to . '-01') ?: $cursor;

        while ($cursor <= $end) {
            $key = $cursor->format('Y-m');
            $months[$key] = mymmo_events_render('partials/' . $template, $build($key));
            $cursor = $cursor->modify('+1 month');
        }

        if (!isset($months[$current])) {
            $months[$current] = mymmo_events_render('partials/' . $template, $build($current));
        }

        return $months;
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
     * [mymmo_events_announcement]
     *
     * Aankondiging van het gehighlighte event (of, bij gebrek daaraan, het
     * eerstvolgende) in een speelse callout: een curly-arrow die er
     * expliciet naar wijst, een klavertje als zachte achtergrond, een paar
     * (desnoods blanco) kaartjes eronder als nonchalante stapel -- allemaal
     * even groot als de kaart zelf, enkel anders gedraaid -- en twee CTA's
     * (inschrijven / andere events bekijken).
     *
     * Bewust geen attributen: dit is een vaste huisstijl-component, geen
     * configureerbaar blok. De asset-sleutels en de tekst bij het pijltje
     * staan hieronder vast; wijzig ze hier als de bestandsnamen ooit
     * veranderen. De illustratie is een tijdelijke standaard tot de
     * Operations Manager per event een eigen afbeelding kan meegeven (dan
     * wint die automatisch).
     */
    public static function announcement($atts): string {
        self::need_assets();

        $announcement = Mymmo_Events_Api_Client::get_announcement();
        $event = $announcement['event'];

        if ($event === null) {
            // Geen enkel aankomend event: niets om aan te kondigen. Geen
            // lege callout tonen, dat oogt als een fout.
            return self::debug_panel(['Aankondiging' => 'geen aankomende events, niets getoond']);
        }

        $output = mymmo_events_render('announcement', [
            'event' => $event,
            'is_highlighted' => $announcement['is_highlighted'],
            'others' => $announcement['others'],
            // Het klavertje wordt niet als asset-URL doorgegeven: zie
            // mymmo_events_clover_svg() in helpers.php voor waarom.
            'arrow' => 'events/components/scribbles-scribbles-73-1.svg',
            'arrow_label' => 'Schrijf je snel in!',
            'default_image' => 'events/components/relax-in-bad.svg',
        ]);

        return $output . self::debug_panel([
            'Event' => (string) ($event['title'] ?? ''),
            'Herkomst' => $announcement['is_highlighted'] ? 'gehighlight' : 'eerstvolgende (geen highlight ingesteld)',
            'Kaarten erachter' => count($announcement['others']),
        ]);
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
     * Welke event-types zijn geselecteerd voor de chips-filter?
     *
     * - Vastgezet via het shortcode-attribuut ($requested niet leeg): dat
     *   ene type, geen chips, geen keuze.
     * - ?mymmo_type= in de URL (komma-lijst van id's, of expliciet leeg):
     *   wint van de standaard -- zo blijft een gedeelde link met een
     *   filter erin werken, ook zonder JS.
     * - Anders: standaard ALLES geselecteerd, zodat de chips bij het eerste
     *   bezoek als "actief" ogen (ze filteren dan nog niets — dat moet ook
     *   zo lijken, zie het vorige gedrag waarbij "niets gekozen" per
     *   ongeluk "alles tonen" betekende terwijl de chips uit stonden).
     *
     * @param array<int,array<string,mixed>> $all_types
     * @return int[]
     */
    private static function resolve_types(string $requested, array $all_types): array {
        if ($requested !== '') {
            $ids = array_map('intval', explode(',', $requested));
            return array_values(array_unique(array_filter($ids, static fn (int $id): bool => $id > 0)));
        }

        $all_ids = array_values(array_filter(array_map(
            static fn (array $t): int => (int) ($t['id'] ?? 0),
            $all_types
        )));

        if (isset($_GET['mymmo_type'])) {
            $raw = sanitize_text_field(wp_unslash($_GET['mymmo_type']));
            if ($raw === '') {
                // Expliciet leeg: bewust alles uitgevinkt.
                return [];
            }
            $ids = array_map('intval', explode(',', $raw));
            return array_values(array_intersect(
                $all_ids,
                array_unique(array_filter($ids, static fn (int $id): bool => $id > 0))
            ));
        }

        return $all_ids;
    }

    /**
     * Welke maand toont de kalender (of lijst)?
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
