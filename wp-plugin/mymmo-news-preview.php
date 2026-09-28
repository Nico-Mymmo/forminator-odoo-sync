<?php
/**
 * De feed bekijken ZONDER WordPress.
 *
 *   php wp-plugin/mymmo-news-preview.php > feed.html
 *   php wp-plugin/mymmo-news-preview.php grid > feed.html
 *
 * Stubt de handvol WordPress-functies die de templates gebruiken en rendert
 * de kaarten met voorbeelditems. Bedoeld om de VORMGEVING te beoordelen
 * voordat er iets gedeployed wordt -- niet om de API of de cache te testen,
 * die zitten er bewust niet in.
 *
 * Let op: hier is geen thema, dus specificiteitsproblemen met een blokthema
 * zie je hier NIET. Dat blijft de echte pagina op de site (zelfde les als
 * mymmo-forms-stap-preview.php).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Alleen via de opdrachtregel.\n");
}

define('ABSPATH', __DIR__ . '/');
define('MYMMO_NEWS_VERSION', 'preview');
define('MYMMO_NEWS_DIR', __DIR__ . '/mymmo-news/');
define('MYMMO_NEWS_URL', './mymmo-news/');

// ── WordPress-stubs ─────────────────────────────────────────────────────────

function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($t) { return (string) $t; }
function wp_kses_post($t) { return (string) $t; }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function wp_json_encode($v) { return json_encode($v); }
function wp_parse_url($url, $c = -1) { return parse_url((string) $url, $c); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)) ?? ''; }
function sanitize_title($t) {
    $t = strtolower(trim((string) $t));
    return preg_replace('/[^a-z0-9]+/', '-', $t) ?? '';
}
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function current_time($f) { return date($f); }
function _n($enkel, $meer, $aantal, $domein = null) {
    return ((int) $aantal === 1) ? $enkel : $meer;
}
function wp_date($f, $ts) {
    $maanden = [1 => 'januari', 'februari', 'maart', 'april', 'mei', 'juni',
        'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    $dagen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag',
        'vrijdag', 'zaterdag'];
    // De maandnaam ESCAPED in het formaat zetten, en niet achteraf een
    // placeholder terugvervangen. Dat laatste deed deze stub eerst, met
    // '%%M%%' -- en date() leest die M zelf als "korte maandnaam", dus er
    // kwam letterlijk %%Sep%% op het scherm. In elke datum, niet alleen in
    // het maandopschrift.
    $escape = static function (string $woord): string {
        $uit = '';
        foreach (str_split($woord) as $teken) {
            $uit .= '\\' . $teken;
        }
        return $uit;
    };
    $uit = str_replace('F', $escape($maanden[(int) date('n', $ts)]), $f);
    $uit = str_replace('l', $escape($dagen[(int) date('w', $ts)]), $uit);
    return date($uit, $ts);
}
function apply_filters($naam, $waarde) { return $waarde; }
function do_action($naam) { }
function add_action($h, $c, $p = 10, $a = 1) { }
function add_shortcode($n, $c) { }
function current_user_can($c) { return false; }
function rest_url($p) { return 'https://voorbeeld.be/wp-json/' . $p; }
function untrailingslashit($s) { return rtrim((string) $s, '/'); }
function get_option($n, $d = false) { return $d; }
function update_option($n, $v, $a = null) { return true; }
function delete_option($n) { return true; }
function get_transient($n) { return false; }
function set_transient($n, $v, $t) { return true; }
function delete_transient($n) { return true; }

require_once MYMMO_NEWS_DIR . 'includes/helpers.php';
require_once MYMMO_NEWS_DIR . 'includes/class-renderers.php';

// ── Voorbeelditems ──────────────────────────────────────────────────────────

$items = [
    [
        'id' => 97,
        'kind' => 'article',
        'summaryTitle' => 'Verplichte keuringen gemene delen: wat moet, wat is aangeraden, en wat verandert er?',
        'curatorNote' => 'Handig overzicht om naast je eigen keuringsplanning te leggen — vooral de termijnen voor Brussel en Wallonië durven verrassen.',
        'summary' => 'De verplichte keuringen van de gemene delen zijn geen lange lijst van alles wat moet: sommige zijn wettelijk, sommige aangeraden, en een paar dingen die vaak als "verplicht" circuleren zijn dat niet. Per item vind je de regel, de verantwoordelijke en de frequentie.',
        'quote' => 'Sommige zijn wettelijk, sommige aangeraden, en een paar dingen die vaak als verplicht circuleren zijn dat niet.',
        'source' => 'Openvme Blog',
        'publishedOn' => '2026-09-07',
        'url' => 'https://openvme.be/2026/06/26/verplichte-keuringen-gemene-delen/',
        'cta' => 'Lees verder',
        'color' => 'blue',
        'tags' => [['name' => 'technisch in orde', 'slug' => 'technisch-in-orde']],
        'imageUrl' => 'https://embed.openvme.be/wp-content/uploads/2026/09/article-1789041680010-1024x489.png',
    ],
    [
        'id' => 94,
        'kind' => 'article',
        'summaryTitle' => 'Gent lanceert nieuwe subsidie voor appartementsgebouwen die een warmtepomp willen installeren',
        'curatorNote' => 'Tot 150.000 euro per project — als je gebouw in Gent staat, is dit het moment om je meerjarenplan erbij te nemen.',
        'summary' => 'De stad Gent trekt geld uit voor VME\'s die collectief overschakelen op een warmtepomp. De subsidie loopt op tot 150.000 euro per project en is bedoeld om de drempel voor gemeenschappelijke installaties te verlagen.',
        'quote' => '',
        'source' => 'HLN',
        'publishedOn' => '2026-08-28',
        'url' => 'https://www.hln.be/gent/gent-lanceert-nieuwe-subsidie/',
        'cta' => 'Bekijk de voorwaarden',
        'color' => 'green',
        'tags' => [
            ['name' => 'technisch in orde', 'slug' => 'technisch-in-orde'],
            ['name' => 'financiële gezondheid', 'slug' => 'financiele-gezondheid'],
        ],
        'imageUrl' => '',
    ],
    [
        'id' => 93,
        'kind' => 'release',
        'summaryTitle' => 'Doe de gratis gebouwscan',
        'curatorNote' => 'Nieuw in het platform: je hoeft geen technisch expert te zijn om te weten hoe je gebouw ervoor staat.',
        'summary' => 'De gebouwscan brengt lift, cv, brandveiligheid en elektriciteit samen, met per installatie de keuring of het attest en de vervaldatum erbij.',
        'quote' => '',
        'source' => 'OpenVME',
        'publishedOn' => '2026-08-19',
        'url' => 'https://app.cindy.eu/dashboard',
        'cta' => 'Start je gebouwscan',
        'color' => 'green',
        'tags' => [['name' => 'technisch in orde', 'slug' => 'technisch-in-orde']],
        'imageUrl' => '',
    ],
    [
        'id' => 68,
        'kind' => 'podcast',
        'summaryTitle' => 'Podcast Ondernemerspraat met Dirk Gypen',
        'curatorNote' => 'Een uur over ondernemen in vastgoedbeheer, van iemand die zijn bedrijf verkocht en opnieuw begon.',
        'summary' => 'In deze aflevering vertelt Dirk Gypen over de verkoop van zijn miljoenenbedrijf en waarom hij daarna weer van nul begon.',
        'quote' => '',
        'source' => 'ondernemerspraat.be',
        'publishedOn' => '2025-12-16',
        'url' => 'https://ondernemerspraat.be/podcast/s5-e16/',
        'cta' => 'Luister',
        'color' => 'default',
        'tags' => [['name' => 'goed samenleven', 'slug' => 'goed-samenleven']],
        'imageUrl' => 'https://embed.openvme.be/wp-content/uploads/2026/09/article-1789041680010-768x367.png',
    ],
];

/* Een EVENT in de feed: zelfde kaart, plus het wanneer/waar-blok en een
   inschrijfknop. Bewust met een datum in dezelfde maand als het nieuwste
   artikel, zodat je in de preview ziet dat ze onder een maandopschrift
   samenkomen in plaats van elk een eigen kopje te krijgen. */
array_splice($items, 1, 0, [[
    'id' => 'evt-42',
    'kind' => 'event',
    'title' => 'Webinar: de nieuwe keuringsplicht voor gemene delen',
    'summaryTitle' => 'Webinar: de nieuwe keuringsplicht voor gemene delen',
    'summary' => 'Wat moet er gekeurd worden, wat is aangeraden, en wat verandert '
        . 'er concreet voor jouw gebouw? In een halfuur overlopen we het samen, '
        . 'met ruimte voor vragen achteraf.',
    'publishedOn' => '2026-09-03',
    'type' => ['name' => 'Evenement', 'slug' => 'evenement'],
    'tags' => [],
    'source' => '',
    'url' => 'https://openvme.be/event/webinar-keuringsplicht/',
    'cta' => 'Schrijf je in',
    'quote' => '',
    'audience' => null,
    'curatorNote' => '',
    'color' => 'default',
    'imageUrl' => null,
    'event' => [
        'starts_at' => '2026-10-14T17:00:00Z',
        'ends_at' => null,
        'timezone' => 'Europe/Brussels',
        'format' => 'online',
        'location' => 'Online (Zoom)',
        'registration_open' => true,
        'seats_left' => 12
    ]
]]);

$layout = ($argv[1] ?? 'feed') === 'grid' ? 'grid' : 'feed';

// Door DEZELFDE functie als de site, dus MET de maandopschriften. Zou de
// preview hier een eigen lus draaien, dan toont ze een ontwerp dat nergens
// bestaat -- precies het probleem waarvoor het renderer-register er is.
$kaarten = Mymmo_News_Renderers::render_list($items, ['layout' => $layout])['html'];

$css = file_get_contents(MYMMO_NEWS_DIR . 'assets/css/mymmo-news.css');

echo '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">'
    . '<meta name="viewport" content="width=device-width, initial-scale=1">'
    . '<title>Mymmo News — voorbeeld</title>'
    . '<style>body{margin:0;padding:32px 16px;background:#f0f2f5;'
    . 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    . '@media (prefers-color-scheme: dark){body{background:#000}}</style>'
    . '<style>' . $css . '</style></head><body>'
    . '<section class="mymmo-news mymmo-news--' . $layout . '">'
    . '<h2 class="mymmo-news-heading">Nieuws &amp; updates</h2>'
    . '<div class="mymmo-news-filters"><div class="mymmo-news-filterrij" role="group">'
    . '<button type="button" class="mymmo-news-chip is-actief">Alle labels</button>'
    . '<button type="button" class="mymmo-news-chip">volgens de regels</button>'
    . '<button type="button" class="mymmo-news-chip">goed samenleven</button>'
    . '<button type="button" class="mymmo-news-chip">technisch in orde</button>'
    . '<button type="button" class="mymmo-news-chip">financiële gezondheid</button>'
    . '</div></div>'
    . '<ul class="mymmo-news-list">' . $kaarten . '</ul>'
    . '<div class="mymmo-news-meer"><button type="button" class="mymmo-news-knop">'
    . 'Meer berichten</button></div>'
    . '</section></body></html>';
