<?php
/**
 * Hulpfuncties: datums in Brussel, veilige uitvoer, schema.org.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/** De weergavetijdzone. De API levert UTC met een expliciete timezone mee. */
function mymmo_events_timezone(): DateTimeZone {
    $configured = (string) get_option('mymmo_events_timezone', 'Europe/Brussels');
    try {
        return new DateTimeZone($configured !== '' ? $configured : 'Europe/Brussels');
    } catch (Exception $e) {
        return new DateTimeZone('Europe/Brussels');
    }
}

/**
 * ISO-string uit de API → DateTimeImmutable in de weergavetijdzone.
 *
 * Nooit date_default_timezone_set gebruiken: dat verandert de tijdzone voor
 * de hele request, inclusief andere plugins.
 */
function mymmo_events_date(?string $iso): ?DateTimeImmutable {
    if (!is_string($iso) || $iso === '') {
        return null;
    }
    try {
        return (new DateTimeImmutable($iso))->setTimezone(mymmo_events_timezone());
    } catch (Exception $e) {
        return null;
    }
}

/** Nederlandse maand- en dagnamen, los van de serverlocale. */
const MYMMO_EVENTS_MONTHS = [
    1 => 'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

const MYMMO_EVENTS_DAYS_SHORT = [
    0 => 'zo', 1 => 'ma', 2 => 'di', 3 => 'wo', 4 => 'do', 5 => 'vr', 6 => 'za',
];

const MYMMO_EVENTS_DAYS_LONG = [
    0 => 'zondag', 1 => 'maandag', 2 => 'dinsdag', 3 => 'woensdag',
    4 => 'donderdag', 5 => 'vrijdag', 6 => 'zaterdag',
];

/** "8 september" */
function mymmo_events_format_day_month(DateTimeImmutable $date): string {
    return (int) $date->format('j') . ' ' . MYMMO_EVENTS_MONTHS[(int) $date->format('n')];
}

/** "dinsdag 8 september 2026" */
function mymmo_events_format_long_date(DateTimeImmutable $date): string {
    return MYMMO_EVENTS_DAYS_LONG[(int) $date->format('w')]
        . ' ' . mymmo_events_format_day_month($date)
        . ' ' . $date->format('Y');
}

/** "19:00 – 19:45", of alleen de starttijd als er geen einde is. */
function mymmo_events_format_time_range(?DateTimeImmutable $start, ?DateTimeImmutable $end): string {
    if (!$start) {
        return '';
    }
    if (!$end) {
        return $start->format('H:i');
    }
    return $start->format('H:i') . ' – ' . $end->format('H:i');
}

/** "8 september | 19:00 – 19:45" — dezelfde vorm als de huidige site. */
function mymmo_events_format_datetime_line(array $event): string {
    $start = mymmo_events_date($event['starts_at'] ?? null);
    $end = mymmo_events_date($event['ends_at'] ?? null);
    if (!$start) {
        return '';
    }
    $range = mymmo_events_format_time_range($start, $end);
    return mymmo_events_format_day_month($start) . ($range !== '' ? ' | ' . $range : '');
}

/** Is dit event al voorbij? */
function mymmo_events_is_past(array $event): bool {
    $end = mymmo_events_date($event['ends_at'] ?? null) ?? mymmo_events_date($event['starts_at'] ?? null);
    return $end ? $end->getTimestamp() < time() : false;
}

/** Publieke URL van een event, altijd via de ingestelde basis. */
function mymmo_events_permalink(array $event): string {
    $slug = (string) ($event['slug'] ?? '');
    if ($slug === '') {
        return '';
    }
    $base = trim((string) get_option('mymmo_events_event_base', MYMMO_EVENTS_DEFAULT_EVENT_BASE), '/');
    return home_url('/' . $base . '/' . $slug . '/');
}

/** URL van het .ics-bestand van een event. */
function mymmo_events_ics_url(array $event): string {
    $permalink = mymmo_events_permalink($event);
    return $permalink !== '' ? $permalink . 'ics/' : '';
}

/** URL van het archief. */
function mymmo_events_archive_url(): string {
    $base = trim((string) get_option('mymmo_events_archive_base', MYMMO_EVENTS_DEFAULT_ARCHIVE_BASE), '/');
    return home_url('/' . $base . '/');
}

/**
 * Label voor de vorm van het event.
 * @return array{label:string,icon:string}
 */
function mymmo_events_format_meta(string $format): array {
    switch ($format) {
        case 'onsite':
            return ['label' => 'Op locatie', 'icon' => 'pin'];
        case 'hybrid':
            return ['label' => 'Hybride', 'icon' => 'hybrid'];
        default:
            return ['label' => 'Online', 'icon' => 'screen'];
    }
}

/**
 * Kleine inline-SVG's. Bewust geen icoonbibliotheek: dat is een extra
 * request voor vier vormpjes.
 */
function mymmo_events_icon(string $name): string {
    $paths = [
        'screen' => '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
        'pin' => '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
        'hybrid' => '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="m21 3-7 7"/><path d="m3 3 7 7"/><path d="M3 21h18"/>',
        'clock' => '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        'users' => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
        'calendar' => '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        'arrow' => '<path d="M5 12h14M12 5l7 7-7 7"/>',
        'check' => '<path d="M20 6 9 17l-5-5"/>',
        'alert' => '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    ];

    if (!isset($paths[$name])) {
        return '';
    }

    return '<svg class="mymmo-ev-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        . ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        . $paths[$name] . '</svg>';
}

/**
 * Redactionele HTML uit de API.
 *
 * De Worker heeft die al opgeschoond (scripts, handlers en oude
 * shortcodes eruit). wp_kses_post is hier de tweede sluis, zodat de
 * plugin niet blind vertrouwt op wat er over de lijn komt.
 */
function mymmo_events_kses(?string $html): string {
    return is_string($html) ? wp_kses_post($html) : '';
}

/**
 * Een template renderen. Het thema mag hem overschrijven in
 * {thema}/mymmo-events/{naam}.php — zo kan een designwijziging in het
 * thema gebeuren en niet in de plugin.
 */
function mymmo_events_render(string $template, array $data = []): string {
    $relative = 'mymmo-events/' . $template . '.php';
    $located = locate_template([$relative], false, false);
    $path = $located !== '' ? $located : MYMMO_EVENTS_DIR . 'templates/' . $template . '.php';

    if (!file_exists($path)) {
        return '';
    }

    ob_start();
    // Beschikbaar in de template als $data.
    include $path;
    return (string) ob_get_clean();
}
