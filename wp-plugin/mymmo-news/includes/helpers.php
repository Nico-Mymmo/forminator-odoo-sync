<?php
/**
 * Kleine hulpjes voor de templates.
 *
 * Alles wat hier tekst teruggeeft die in HTML belandt, escapet zelf. De
 * templates roepen dus `echo mymmo_news_x()` aan zonder er nog iets omheen te
 * zetten -- behalve waar expliciet `_html` in de naam staat.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Multibyte-hulpjes MET terugval.
 *
 * WordPress polyfilt `mb_substr` en `mb_strlen` (wp-includes/compat.php), maar
 * NIET `mb_strtolower`, `mb_strtoupper` en `mb_strrpos`. Op een host zonder de
 * mbstring-extensie zou een kaart renderen dan een fatale fout geven -- een
 * witte pagina, voor een letter in een avatar. Dat mag niet kunnen.
 */
function mymmo_news_upper(string $tekst): string {
    return function_exists('mb_strtoupper') ? mb_strtoupper($tekst, 'UTF-8') : strtoupper($tekst);
}

function mymmo_news_lower(string $tekst): string {
    return function_exists('mb_strtolower') ? mb_strtolower($tekst, 'UTF-8') : strtolower($tekst);
}

function mymmo_news_sub(string $tekst, int $start, ?int $lengte = null): string {
    if (function_exists('mb_substr')) {
        return mb_substr($tekst, $start, $lengte, 'UTF-8');
    }
    return $lengte === null ? substr($tekst, $start) : substr($tekst, $start, $lengte);
}

function mymmo_news_len(string $tekst): int {
    return function_exists('mb_strlen') ? mb_strlen($tekst, 'UTF-8') : strlen($tekst);
}

/**
 * Een datum (JJJJ-MM-DD) leesbaar maken.
 *
 * Met het JAAR erbij zodra het bericht niet van dit jaar is. De plugin die we
 * vervangen toonde "7 september" zonder jaar, en in een tijdlijn die tot 2024
 * teruggaat is dat niet te lezen.
 */
function mymmo_news_datum(?string $iso): string {
    if (!is_string($iso) || $iso === '') {
        return '';
    }
    $tijd = strtotime($iso);
    if ($tijd === false) {
        return '';
    }
    $formaat = (date('Y', $tijd) === current_time('Y')) ? 'j F' : 'j F Y';
    return wp_date($formaat, $tijd);
}

/** Een datum als machine-leesbaar attribuut voor <time datetime="...">. */
function mymmo_news_datum_attr(?string $iso): string {
    return is_string($iso) && $iso !== '' ? esc_attr($iso) : '';
}

/**
 * Wanneer een event begint, leesbaar: "Dinsdag 14 oktober, 19:00".
 *
 * `starts_at` komt als ISO-tijdstip in UTC uit Odoo. `wp_date()` zet dat om
 * naar de tijdzone van de SITE -- doe dat nooit met `date()`, want dan staat
 * een avondevent er een of twee uur te vroeg in, en dat is precies het soort
 * fout dat niemand meldt omdat de datum wel klopt.
 */
function mymmo_news_event_moment(?string $iso): string {
    if (!is_string($iso) || $iso === '') {
        return '';
    }
    $tijd = strtotime($iso);
    if ($tijd === false) {
        return '';
    }
    $tekst = wp_date('l j F', $tijd) . ', ' . wp_date('H:i', $tijd);
    return mymmo_news_upper(mymmo_news_sub($tekst, 0, 1)) . mymmo_news_sub($tekst, 1);
}

/**
 * De maand waarin een bericht valt, als GROEPSSLEUTEL voor de tijdlijn.
 *
 * 'JJJJ-MM', of 'geen' als er geen publicatiedatum is. Bewust een sleutel en
 * geen label: het label is vertaalbaar en verandert met de taal van de site,
 * en dan zou de vergelijking "zit dit bericht in dezelfde maand als het
 * vorige" op tekst gebeuren in plaats van op de datum.
 *
 * Bewust `date()` en niet `wp_date()`: dit is een datum ZONDER tijd, en die
 * door een tijdzone halen kan hem een dag verschuiven -- precies op de eerste
 * of laatste van de maand, waar het opschrift dan verspringt.
 */
function mymmo_news_maand_sleutel(?string $iso): string {
    if (!is_string($iso) || $iso === '') {
        return 'geen';
    }
    $tijd = strtotime($iso);
    return $tijd === false ? 'geen' : date('Y-m', $tijd);
}

/**
 * Het opschrift boven een maand: "September 2026".
 *
 * Berichten zonder datum komen onderaan (de Worker sorteert met `nulls last`)
 * en krijgen "Eerder" -- niet "Zonder datum". Dat een redactie een veld niet
 * invulde, is niets wat een bezoeker hoort te lezen; dat het oudere berichten
 * zijn, klopt wel.
 */
function mymmo_news_maand_label(string $sleutel): string {
    if ($sleutel === 'geen') {
        return 'Eerder';
    }
    $tijd = strtotime($sleutel . '-01');
    if ($tijd === false) {
        return 'Eerder';
    }
    // wp_date geeft de maandnaam in de taal van de site, en die is in het
    // Nederlands kleingeschreven ("september 2026"). Als opschrift hoort daar
    // een hoofdletter voor.
    $tekst = wp_date('F Y', $tijd);
    return mymmo_news_upper(mymmo_news_sub($tekst, 0, 1)) . mymmo_news_sub($tekst, 1);
}

/**
 * De domeinnaam van een link, als herkomstlabel.
 * "https://www.vrt.be/vrtnws/..." -> "vrt.be"
 */
function mymmo_news_domein(?string $url): string {
    if (!is_string($url) || $url === '') {
        return '';
    }
    $host = wp_parse_url($url, PHP_URL_HOST);
    if (!is_string($host) || $host === '') {
        return '';
    }
    return preg_replace('/^www\./', '', strtolower($host)) ?? '';
}

/**
 * Een externe link. `noopener` hoort bij `target=_blank`, en `nofollow` omdat
 * dit gecureerde verwijzingen zijn en geen redactionele aanbevelingen.
 */
function mymmo_news_link_attrs(): string {
    return 'target="_blank" rel="noopener noreferrer nofollow"';
}

/**
 * De initialen van een bron, voor het rondje wanneer er geen logo is.
 * Zelfde idee als een avatar zonder foto.
 */
function mymmo_news_initialen(string $naam): string {
    $naam = trim(wp_strip_all_tags($naam));
    if ($naam === '') {
        return '·';
    }
    $delen = preg_split('/[\s\-_.]+/', $naam) ?: [];
    $letters = '';
    foreach ($delen as $deel) {
        if ($deel === '') {
            continue;
        }
        $letters .= mymmo_news_upper(mymmo_news_sub($deel, 0, 1));
        if (mymmo_news_len($letters) >= 2) {
            break;
        }
    }
    return $letters !== '' ? $letters : '·';
}

/**
 * Een stabiele kleur per bron, afgeleid van de naam.
 *
 * Bewust GEEN willekeurige kleur: dan krijgt dezelfde bron bij elke
 * paginaweergave een andere tint en oogt de feed onrustig. De hue komt uit
 * een hash van de naam, dus VRT NWS is altijd dezelfde kleur.
 */
function mymmo_news_bron_hue(string $naam): int {
    return (int) (hexdec(substr(md5(mymmo_news_lower($naam)), 0, 4)) % 360);
}

/** De labels van een item, als platte lijst met naam en slug. */
function mymmo_news_labels(array $item): array {
    $tags = $item['tags'] ?? [];
    if (!is_array($tags)) {
        return [];
    }
    $uit = [];
    foreach ($tags as $tag) {
        if (!is_array($tag) || empty($tag['name'])) {
            continue;
        }
        $uit[] = [
            'name' => (string) $tag['name'],
            'slug' => (string) ($tag['slug'] ?? ''),
        ];
    }
    return $uit;
}

/**
 * Komma-gescheiden shortcode-waarde naar een lijst slugs.
 * Leeg blijft leeg: dat betekent "geen filter", niet "niets tonen".
 *
 * @return string[]
 */
function mymmo_news_slug_lijst($waarde): array {
    if (is_array($waarde)) {
        $ruw = $waarde;
    } else {
        $ruw = explode(',', (string) $waarde);
    }
    $uit = [];
    foreach ($ruw as $stuk) {
        $slug = sanitize_title(trim((string) $stuk));
        if ($slug !== '' && !in_array($slug, $uit, true)) {
            $uit[] = $slug;
        }
    }
    return $uit;
}

/**
 * Een tekst inkorten op een WOORDGRENS, met een echt beletselteken.
 *
 * De feed kort standaard met CSS in (line-clamp), wat mooier is omdat het de
 * volledige tekst in de DOM laat staan. Dit is voor de plekken waar dat niet
 * kan, zoals een title-attribuut.
 */
function mymmo_news_kort(string $tekst, int $max): string {
    $tekst = trim(wp_strip_all_tags($tekst));
    if (mymmo_news_len($tekst) <= $max) {
        return $tekst;
    }
    $kort = mymmo_news_sub($tekst, 0, $max);
    $spatie = strrpos($kort, ' ');
    if ($spatie !== false && $spatie > $max * 0.6) {
        $kort = mymmo_news_sub($kort, 0, $spatie);
    }
    return rtrim($kort, " ,.;:-") . '…';
}

/**
 * Een template uit deze plugin renderen en als string teruggeven.
 *
 * @param array<string,mixed> $vars
 */
function mymmo_news_template(string $relatief, array $vars = []): string {
    $pad = MYMMO_NEWS_DIR . 'templates/' . ltrim($relatief, '/');
    if (!file_exists($pad)) {
        return '';
    }
    // extract() is hier bewust: de sleutels komen uitsluitend uit onze eigen
    // aanroepen, nooit uit gebruikersinvoer.
    extract($vars, EXTR_SKIP);
    ob_start();
    include $pad;
    return (string) ob_get_clean();
}
