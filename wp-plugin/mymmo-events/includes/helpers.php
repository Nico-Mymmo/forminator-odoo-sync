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

/**
 * Een tijdstip als parameter voor de API: UTC met een 'Z', nooit met een
 * numerieke offset.
 *
 * `format('c')` geeft "2026-10-25T23:00:00+00:00". WordPress' add_query_arg
 * urlencodeert waarden niet, dus die `+` komt letterlijk in de querystring
 * terecht — en daar betekent `+` een SPATIE. De API las dan
 * "2026-10-25T23:00:00 00:00", gaf dat door aan Odoo, en dat werd een 503.
 *
 * Met 'Z' zit er geen enkel teken in dat encoding nodig heeft.
 *
 * @param DateTimeImmutable $moment
 * @return string bv. "2026-10-25T23:00:00Z"
 */
function mymmo_events_utc_param(DateTimeImmutable $moment): string {
    return $moment->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
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

/** Voor compacte kaartjes (bv. de scheurkalenderblaadjes in mymmo_events_row). */
const MYMMO_EVENTS_MONTHS_SHORT = [
    1 => 'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
    'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
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
 * Publieke URL van een bestand in de asset manager (R2), bv. een decoratief
 * SVG'tje voor de aankondiging-shortcode. Dezelfde Worker die de
 * events-API bedient, serveert deze bestanden ook op /assets/{key} —
 * vandaar mymmo_events_api_base als basis, niet een apart domein.
 *
 * @param string $key bv. "events/components/scribbles-scribbles-40-2.svg"
 */
function mymmo_events_asset_url(string $key): string {
    $key = ltrim($key, '/');
    if ($key === '') {
        return '';
    }
    $base = rtrim((string) get_option('mymmo_events_api_base', ''), '/');
    if ($base === '') {
        return '';
    }
    return $base . '/assets/' . $key;
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
/**
 * Klavertje-vier als grote, zachte achtergrondvorm (mymmo_events_announcement).
 *
 * Inline i.p.v. een <img> naar de asset manager om twee redenen: de
 * bronillustratie (events/components/scribbles-scribbles-40-2.svg) is zelf
 * bijna wit (#F0F9FF) -- onzichtbaar op een witte pagina, ongeacht opacity --
 * en de asset-host stuurt geen CORS-headers, waardoor een CSS mask-image
 * (de gangbare manier om een icoon een eigen kleur te geven) daar stil
 * faalt. Door de pad-data hier te embedden met fill="currentColor" kunnen
 * we gewoon de site-accentkleur meegeven via CSS `color`.
 */
function mymmo_events_clover_svg(): string {
    return '<svg class="mymmo-ev-announce__clover" viewBox="0 0 400 300" fill="currentColor"'
        . ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        . '<path fill-rule="evenodd" clip-rule="evenodd" d="M146.15 51.4507C148.037 50.7455 150.042 50.9188 152.027 51.6176C154.549 52.4901 157.214 52.8862 159.883 52.7853C165.766 52.5885 171.023 54.4553 175.895 57.4269C179.178 59.4289 182.722 61.0482 185.663 63.5833C191.298 68.4439 195.874 73.9888 199.391 80.2158C200.569 76.4339 202.896 73.2414 205.168 70.0611C206.637 68.0048 208.741 66.3479 210.292 64.4579C211.5 62.9898 213.519 62.5823 214.039 61.4385C214.826 59.7094 216.1 59.064 217.426 58.307C229.891 51.1832 243.22 50.7513 256.967 53.6316C261.835 54.652 266.635 55.9225 271.266 57.749C273.054 58.4542 274.732 59.4457 275.673 59.9158C295.39 71.7368 302.562 90.6704 297.978 111.58C295.347 123.577 288.264 132.605 278.246 139.221C270.706 144.199 262.493 147.385 253.705 148.4C253.691 148.607 253.677 148.814 253.661 149.021C254.527 149.093 255.397 149.114 256.269 149.082C262.152 148.885 267.409 150.752 272.28 153.723C275.563 155.725 279.108 157.344 282.048 159.88C291.184 167.759 297.536 177.434 301.105 188.903C302.459 193.219 301.985 197.631 301.563 201.994C301.32 204.509 300.327 206.995 299.929 209.406C299.618 211.281 298.073 212.643 298.195 213.893C298.379 215.784 297.599 216.979 296.83 218.297C289.6 230.693 278.272 237.726 264.926 242.098C260.199 243.646 255.406 244.943 250.482 245.675C248.581 245.957 246.631 245.937 245.58 246C223.776 245.632 208.543 234.088 201.488 215.498C199.582 219.217 197.138 222.721 194.233 226.015C186.203 235.121 176.177 241.424 164.149 243.961C159.125 245.02 153.945 245.389 148.818 245.895C146.819 246.092 144.936 245.408 143.207 244.22C141.008 242.725 138.547 241.655 135.953 241.065C130.241 239.741 125.669 236.579 121.754 232.446C119.115 229.661 116.126 227.179 113.956 223.967C107.214 213.982 103.615 202.974 103.161 190.945C102.98 186.415 104.582 182.264 106.122 178.146C107.009 175.773 108.61 173.621 109.619 171.387C110.406 169.651 112.245 168.73 112.453 167.487C112.767 165.609 113.828 164.651 114.911 163.573C123.316 155.193 133.461 151.08 144.613 149.452C124.116 147.538 110.076 135.117 104.023 116.104C100.297 104.4 101.912 93.0438 107.278 82.3097C112.697 71.4684 120.78 62.8118 131.785 57.267C136.382 54.9513 141.31 53.2602 146.15 51.4507ZM290.707 225.028C289.783 225.699 289.044 226.548 288.235 227.326C287.349 228.177 286.399 228.959 285.476 229.773L285.907 230.125C287.831 228.756 289.462 227.024 290.707 225.028ZM250.829 203.024C250.746 203.009 250.661 203.017 250.582 203.045C250.522 203.106 250.473 203.178 250.44 203.258C250.407 203.338 250.39 203.425 250.39 203.511C250.374 203.701 250.536 203.986 250.455 204.077C249.243 205.438 248.72 207.265 247.291 208.536C246.507 209.304 245.871 210.215 245.418 211.221C245.022 212.057 244.807 212.585 243.91 213.047C242.802 213.617 242.082 214.737 242.943 216.309C243.314 216.119 243.658 215.881 243.967 215.601C244.581 214.877 245.012 213.955 245.716 213.353C247.347 211.956 248.087 209.91 249.477 208.345C249.907 207.862 249.324 206.625 250.608 206.692C250.504 206.254 250.209 205.745 250.333 205.388C250.522 204.847 251.359 204.641 251.247 203.863C251.227 203.608 251.161 203.359 251.052 203.128C250.988 203.074 250.911 203.039 250.829 203.024ZM265.572 198.654C265.298 198.788 264.84 198.865 264.78 199.064C264.438 200.207 263.55 200.684 262.685 201.065V202.388L264.593 201.636C263.611 203.017 263.011 203.864 262.328 204.821C262.112 204.283 261.988 203.706 261.862 203.706C261.472 203.755 261.096 203.879 260.753 204.073C260.235 204.297 260.692 205.502 259.65 205.217C259.376 206.07 258.462 206.74 258.931 207.807L260.646 208.26C259.169 209.547 259.168 209.549 258.273 211.858L258.269 211.868C258.208 212.027 258.126 212.176 258.026 212.312C257.353 213.198 257.353 213.195 258.036 213.951C259.815 211.577 259.815 211.577 260.13 209.628C260.433 209.778 260.514 210.209 261.12 209.825C261.907 209.326 260.864 208.152 262.127 207.905C263.163 207.703 262.171 206.447 262.664 205.961C263.113 206.103 263.584 206.168 264.054 206.154C264.394 206.038 264.708 205.854 264.976 205.612C264.912 204.823 264.863 204.208 264.803 203.464H265.813C267 202.347 266.468 200.92 267.426 199.983C267.533 199.88 267.372 199.501 267.313 199.083L265.971 199.627L265.572 198.654ZM137.228 67.3598C131.15 69.2982 121.034 82.9441 120.768 88.974C120.972 88.8393 121.241 88.7632 121.295 88.6119C123.305 82.9306 127.325 78.791 131.705 74.8336C133.88 72.8685 135.323 70.2255 137.228 67.3598ZM139.001 80.0253C136.249 82.3117 135.116 85.5537 133.797 88.6464C135.681 85.8347 138.006 83.3091 139.001 80.0253ZM240.004 78.853C237.231 79.5612 234.555 80.4527 232.535 82.6498C235.15 81.6322 238.191 81.3984 240.004 78.853ZM116.877 71.5085C115.85 72.2592 115.13 72.9353 114.718 73.8955C114.606 74.158 114.451 74.458 114.766 74.6447C114.96 74.6949 115.164 74.6878 115.355 74.6251C115.383 73.4153 117.357 73.2751 116.877 71.5085ZM132.392 58.7772C127.421 61.5998 122.715 64.7521 119.188 69.3652C123.494 65.7181 128.475 62.9073 132.392 58.7772ZM232.804 53.5196C230.454 53.7448 228.174 54.4303 226.097 55.5367C227.233 55.4172 228.298 55.0496 229.388 54.7805C230.581 54.4865 231.795 54.2835 233.001 54.0399L232.804 53.5196Z"/></svg>';
}

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

    // width/height als attributen: sommige thema's laden een globale reset
    // (`svg:not([width]) { width: 100% }`) die door de attribute-selector
    // ietsje specifieker is dan onze `.mymmo-ev-icon { width: 1em }` en het
    // icoon dan over de volledige breedte van zijn flex-ouder uitrekt.
    return '<svg class="mymmo-ev-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"'
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
    $html = (string) ob_get_clean();

    // Elk template hierboven schrijft zijn HTML netjes ingesprongen over
    // meerdere regels -- leesbaar in de broncode, maar een kaal regel-einde
    // direct binnen een INLINE element (<a>, <span>, <button>, ... -- geen
    // blok-element zoals <div>/<p>, die worden door WordPress' wpautop() al
    // apart behandeld) wordt door wpautop() omgezet in een letterlijke
    // <br>-tag zodra deze shortcode-output via de_content loopt (afhankelijk
    // van HOE/waar de shortcode op een pagina staat -- vandaar dat dit op de
    // ene pagina wel opviel en op de andere niet: zie de kapotte type-filter-
    // chips en het te hoog staande pijltje bij "Meer info en inschrijven",
    // v1.6.31/v1.6.32). In plaats van dat in elk template apart te vermijden
    // (foutgevoelig, en nieuwe templates zouden er weer intrappen), maken we
    // het hier éénmalig onmogelijk: alle witruimte (spaties, tabs, regel-
    // eindes) buiten tag-attributen is voor de browser sowieso al betekenis-
    // loos behalve als woordscheiding -- door elke opeenvolging hier al tot
    // één spatie te herleiden, blijft er nergens nog een "kaal" regel-
    // einde over waar wpautop éénzelfde spatie fout kan interpreteren.
    // Geen enkel template hier bevat <pre>/<script>/<textarea> MET inhoud
    // (de ene <textarea> is leeg), dus whitespace is nergens betekenisvol.
    return trim((string) preg_replace('/\s+/', ' ', $html));
}
