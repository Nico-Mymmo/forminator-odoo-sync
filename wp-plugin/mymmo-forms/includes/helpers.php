<?php
/**
 * Kleine hulpjes. Bewust geen klasse: dit zijn functies, geen toestand.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Een template renderen met $data beschikbaar als variabelen.
 *
 * @param string              $template pad onder templates/, zonder .php
 * @param array<string,mixed> $data
 */
function mymmo_forms_render(string $template, array $data = []): string {
    $file = MYMMO_FORMS_DIR . 'templates/' . $template . '.php';
    if (!file_exists($file)) {
        return '';
    }

    // extract() met EXTR_SKIP: een sleutel in $data mag nooit $file of
    // $template overschrijven, want dan laadt de include iets anders.
    extract($data, EXTR_SKIP);

    ob_start();
    include $file;
    return (string) ob_get_clean();
}

/**
 * De basis-URL van de Operations Manager, zonder trailing slash.
 */
function mymmo_forms_api_base(): string {
    return rtrim((string) get_option('mymmo_forms_api_base', ''), '/');
}

function mymmo_forms_site_key(): string {
    return (string) get_option('mymmo_forms_site_key', '');
}

function mymmo_forms_is_configured(): bool {
    return mymmo_forms_api_base() !== '' && mymmo_forms_site_key() !== '';
}

/**
 * De namen van de herkomstparameters, op EEN plek.
 *
 * Ze worden op drie plekken gelezen -- het formulier zet ze als verborgen veld,
 * de inzending leest ze terug, en de agenda-tab van de pop-up geeft ze door aan
 * Calendly. Drie lijstjes die uit elkaar kunnen lopen is precies hoe je een
 * campagne kwijtraakt zonder dat er iets stukgaat.
 *
 * @return array<int,string>
 */
function mymmo_forms_utm_keys(): array {
    return ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
}

/**
 * De herkomst van deze bezoeker: eerst uit $bron (de URL van de pagina, of bij
 * een inzending de verborgen velden), anders uit de cookie die het
 * tracking-script dertig dagen bewaart.
 *
 * Zo houdt iemand die vorige week via een campagne binnenkwam en vandaag pas
 * invult of een gesprek inplant, toch zijn herkomst. De bron wint, want die is
 * recenter.
 *
 * @param array<string,mixed> $bron
 * @return array<string,string>
 */
function mymmo_forms_utms(array $bron): array {
    $uit = [];
    foreach (mymmo_forms_utm_keys() as $sleutel) {
        if (!empty($bron[$sleutel])) {
            $uit[$sleutel] = sanitize_text_field(wp_unslash((string) $bron[$sleutel]));
        } elseif (!empty($_COOKIE[$sleutel])) {
            $uit[$sleutel] = sanitize_text_field(wp_unslash((string) $_COOKIE[$sleutel]));
        }
    }
    return $uit;
}

/**
 * De bezoeker-UUID uit een cookie, of '' als er geen bruikbare instaat.
 *
 * Alleen iets met de VORM van een UUID komt erdoor: deze waarde komt uit een
 * cookie die iemand zelf kan zetten, en ze gaat naar Odoo.
 *
 * Ze MAG leeg zijn. Het tracking-script zet geen cookie voor wie het als bot
 * herkent, noch in een browser zonder plugins of taalinstelling, en daar zitten
 * echte mensen tussen -- maak er dus nooit een voorwaarde van.
 */
function mymmo_forms_visitor_uuid(string $cookie = 'ovme_uuid'): string {
    if (empty($_COOKIE[$cookie])) {
        return '';
    }
    $waarde = sanitize_text_field(wp_unslash((string) $_COOKIE[$cookie]));
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $waarde)) {
        return '';
    }
    return strtolower($waarde);
}

/**
 * Een kleur die veilig in een style-attribuut mag, of '' als het er geen is.
 *
 * Dezelfde vorm-controle als in mymmo_forms_theme_style(): een hex of een
 * rgb()/rgba(). Geen url(), geen var(), geen puntkomma -- deze waarde komt uit
 * een shortcode die iedereen met paginarechten kan typen, en ze belandt in een
 * style-attribuut op de pagina van een bezoeker.
 */
function mymmo_forms_color(string $ruw): string {
    $waarde = trim($ruw);
    if ($waarde === '') {
        return '';
    }
    if (preg_match('/^#[0-9a-f]{3,8}$/i', $waarde)) {
        return $waarde;
    }
    if (preg_match('/^rgba?\(\s*[\d.\s,%\/]+\)$/i', $waarde)) {
        return $waarde;
    }
    return '';
}

/**
 * Een LENGTE die veilig in een style-attribuut mag, of '' als het er geen is.
 *
 * Dezelfde vorm-controle als in mymmo_forms_theme_style(). Geen calc(), geen
 * var(), geen puntkomma: deze waarde komt uit een shortcode die iedereen met
 * paginarechten kan typen en belandt in een style-attribuut bij een bezoeker.
 * "0" telt ook, want opvulling weghalen is een geldige keuze.
 */
function mymmo_forms_length(string $ruw): string {
    $waarde = trim($ruw);
    if ($waarde === '') {
        return '';
    }
    if ($waarde === '0') {
        return '0px';
    }
    return preg_match('/^\d+(\.\d+)?(px|rem|em|%|ch)$/i', $waarde) ? $waarde : '';
}

/**
 * Een VERSCHUIVING: dezelfde vorm als een lengte, maar mét minteken.
 *
 * Apart van mymmo_forms_length(), want die wordt ook voor opvulling gebruikt en
 * een negatieve opvulling bestaat niet -- daar hoort een minteken geweigerd te
 * worden en hier hoort het erdoor te kunnen.
 */
function mymmo_forms_offset(string $ruw): string {
    $waarde = trim($ruw);
    if ($waarde === '' || $waarde === '0') {
        return $waarde === '0' ? '0px' : '';
    }
    return preg_match('/^-?\d+(\.\d+)?(px|rem|em|%)$/i', $waarde) ? $waarde : '';
}

/**
 * Een HOEK in graden: '-12deg', of '' als het er geen is.
 *
 * Beperkt tot een volledige draai in beide richtingen. Meer heeft geen zin --
 * 400 graden ziet er precies zo uit als 40 -- en het houdt de waarde leesbaar
 * voor wie de shortcode later terugleest.
 */
function mymmo_forms_angle(string $ruw): string {
    $waarde = trim(rtrim(trim($ruw), 'deg'));
    if ($waarde === '' || !is_numeric($waarde)) {
        return '';
    }
    $getal = (float) $waarde;
    if ($getal < -360 || $getal > 360) {
        return '';
    }
    return rtrim(rtrim(number_format($getal, 2, '.', ''), '0'), '.') . 'deg';
}

/**
 * Een SCHAAL als percentage: '120%', of '' als het er geen is.
 *
 * Een kaal getal wordt als percentage gelezen (120 -> 120%), want dat is wat
 * iemand in een veld met "%" ernaast typt. Begrensd op 10-400: daaronder is de
 * afbeelding weg en daarboven is ze een vlak van kleur.
 */
function mymmo_forms_scale(string $ruw): string {
    $waarde = trim(rtrim(trim($ruw), '%'));
    if ($waarde === '' || !is_numeric($waarde)) {
        return '';
    }
    $getal = (float) $waarde;
    if ($getal < 10 || $getal > 400) {
        return '';
    }
    return rtrim(rtrim(number_format($getal, 2, '.', ''), '0'), '.') . '%';
}

/**
 * Dezelfde kleur als zes hex-tekens ZONDER #, of '' als dat niet kan.
 *
 * Calendly verwacht zijn kleurparameters zo (primary_color=1f2937). Een
 * afkorting van drie tekens wordt uitgeschreven; een rgb() of een kleur met
 * doorzichtigheid geeft '' terug -- die kan Calendly niet, en half doorgeven is
 * erger dan niet doorgeven.
 */
function mymmo_forms_hex6(string $ruw): string {
    $waarde = mymmo_forms_color($ruw);
    if ($waarde === '' || $waarde[0] !== '#') {
        return '';
    }
    $hex = substr($waarde, 1);
    if (strlen($hex) === 3) {
        $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
    }
    return strlen($hex) === 6 ? strtolower($hex) : '';
}

/**
 * Het KLEURENPALET van deze site, als slug => hex.
 *
 * WordPress geeft het palet per herkomst terug (default / theme / custom, in
 * die volgorde van zwak naar sterk) -- "custom" is wat iemand in de site-editor
 * zelf aanpaste en hoort dus te winnen. Sommige thema's geven een platte lijst
 * terug; die vorm wordt ook opgevangen.
 *
 * @return array<string,string>
 */
function mymmo_forms_site_palette(): array {
    if (!function_exists('wp_get_global_settings')) {
        return [];
    }

    $palet = wp_get_global_settings(['color', 'palette']);
    if (!is_array($palet)) {
        return [];
    }

    $uit = [];

    $voegToe = static function ($lijst) use (&$uit): void {
        foreach ((array) $lijst as $kleur) {
            if (!is_array($kleur) || empty($kleur['slug'])) {
                continue;
            }
            $hex = mymmo_forms_color((string) ($kleur['color'] ?? ''));
            if ($hex !== '') {
                $uit[(string) $kleur['slug']] = $hex;
            }
        }
    };

    if (isset($palet['default']) || isset($palet['theme']) || isset($palet['custom'])) {
        foreach (['default', 'theme', 'custom'] as $herkomst) {
            $voegToe($palet[$herkomst] ?? []);
        }
    } else {
        $voegToe($palet);
    }

    return $uit;
}

/**
 * Een waarde uit theme.json omzetten naar een echte kleur.
 *
 * Een thema verwijst daar meestal naar zijn eigen palet, in een van twee
 * vormen: `var:preset|color|accent-1` (zoals het in theme.json staat) of
 * `var(--wp--preset--color--accent-1)` (zoals het in de CSS komt). Die
 * verwijzing wordt hier OPGEZOCHT en niet doorgegeven: de waarde belandt ook in
 * het voorbeeld van de bouwer en in de plugin-stylesheet, en daar bestaat die
 * variabele niet -- dan zou de kleur stil wegvallen.
 *
 * @param array<string,string> $palet
 */
function mymmo_forms_resolve_color(string $waarde, array $palet): string {
    $waarde = trim($waarde);
    if ($waarde === '') {
        return '';
    }

    $slug = '';
    if (preg_match('/^var:preset\|color\|([A-Za-z0-9_-]+)$/', $waarde, $m)) {
        $slug = $m[1];
    } elseif (preg_match('/^var\(\s*--wp--preset--color--([A-Za-z0-9_-]+)\s*\)$/', $waarde, $m)) {
        $slug = $m[1];
    }

    if ($slug !== '') {
        return $palet[$slug] ?? '';
    }

    return mymmo_forms_color($waarde);
}

/**
 * Wat we van het thema van DEZE site overnemen.
 *
 * Alleen de KNOP: haar achtergrond, haar tekstkleur en haar hoeken. Dat is waar
 * het om gaat -- een formulierknop die naast de knoppen van de site staat en
 * een andere kleur heeft, ziet eruit als een fout.
 *
 * Bewust NIET de tekstkleur en de achtergronden van de site. Bij een donker
 * thema levert dat witte labels op witte invoervelden, en dat is het soort fout
 * dat niemand aan onze kant ziet.
 *
 * Geeft een lege array als het thema geen knopkleur declareert (een klassiek
 * thema zonder theme.json, bijvoorbeeld). Dan blijft alles zoals het was.
 *
 * @return array<string,string>  variabele => waarde, klaar voor een style-attribuut
 */
function mymmo_forms_site_theme_vars(): array {
    if (!function_exists('wp_get_global_styles')) {
        return [];
    }

    $palet = mymmo_forms_site_palette();

    $knop = wp_get_global_styles(['elements', 'button']);
    if (!is_array($knop)) {
        return [];
    }

    $uit = [];

    $achtergrond = mymmo_forms_resolve_color((string) ($knop['color']['background'] ?? ''), $palet);
    $tekst       = mymmo_forms_resolve_color((string) ($knop['color']['text'] ?? ''), $palet);

    if ($achtergrond !== '') {
        $uit['--mf-accent'] = $achtergrond;
    }
    // De tekstkleur alleen samen met de achtergrond: los van elkaar levert dat
    // witte tekst op een witte knop op.
    if ($achtergrond !== '' && $tekst !== '') {
        $uit['--mf-accent-text'] = $tekst;
    }

    $radius = trim((string) ($knop['border']['radius'] ?? ''));
    if ($radius !== '' && preg_match('/^\d+(\.\d+)?(px|rem|em|%)$/i', $radius)) {
        $uit['--mf-radius'] = $radius;
    }

    return $uit;
}

/**
 * Datzelfde, als stukje style-attribuut -- of '' als de site-optie uit staat.
 *
 * VOLGORDE, en die is het punt: dit komt ACHTER het thema van het formulier uit
 * de Operations Manager en VÓÓR een accent="" op de shortcode. De laatste
 * declaratie wint, dus:
 *
 *   plugin-standaard  <  thema uit de OM  <  thema van deze site  <  shortcode
 *
 * Het thema van de site wint dus van de OM. Dat is met opzet: de OM-kleur geldt
 * voor élke site waar dat formulier staat en is daarmee een goede terugval,
 * maar op een site die haar eigen palet heeft, hoort de site te winnen. Wie dat
 * niet wil, zet het vinkje uit bij Instellingen → Mymmo Forms → Verbinding.
 */
function mymmo_forms_site_theme_style(): string {
    if (!get_option('mymmo_forms_follow_theme', 1)) {
        return '';
    }

    $stukken = [];
    foreach (mymmo_forms_site_theme_vars() as $variabele => $waarde) {
        $stukken[] = $variabele . ':' . $waarde;
    }

    return implode(';', $stukken);
}

/**
 * De CSS-variabelen van een formulier omzetten naar een style-attribuut.
 *
 * Alleen een vaste, GESLOTEN lijst wordt doorgelaten. Een vrije doorgang van
 * wat de API stuurt naar een style-attribuut is een injectiepad: iemand met
 * toegang tot de OM zou dan CSS kunnen plaatsen op elke site die het formulier
 * toont. De waarden worden bovendien gefilterd op een veilige vorm (kleuren,
 * lengtes) -- geen url(), geen expression(), geen puntkomma.
 *
 * @param array<string,mixed> $theme
 */
function mymmo_forms_theme_style(array $theme): string {
    $toegestaan = [
        'accent'        => '--mf-accent',
        'accent_text'   => '--mf-accent-text',
        'text'          => '--mf-text',
        'muted'         => '--mf-muted',
        'border'        => '--mf-border',
        'background'    => '--mf-bg',
        'field_bg'      => '--mf-field-bg',
        'radius'        => '--mf-radius',
        'gap'           => '--mf-gap',
        'max_width'     => '--mf-max-width',
        'padding_x'     => '--mf-pad-x',
        'padding_y'     => '--mf-pad-y',
    ];

    $stukken = [];
    foreach ($toegestaan as $sleutel => $variabele) {
        if (!isset($theme[$sleutel]) || !is_scalar($theme[$sleutel])) {
            continue;
        }
        $waarde = trim((string) $theme[$sleutel]);
        // Kleur (#abc, #aabbcc, rgb(...)), of een lengte (12px, 1.5rem, 40em, 60%).
        $isKleur  = (bool) preg_match('/^#[0-9a-f]{3,8}$/i', $waarde)
                 || (bool) preg_match('/^rgba?\(\s*[\d.\s,%\/]+\)$/i', $waarde);
        $isLengte = (bool) preg_match('/^\d+(\.\d+)?(px|rem|em|%|ch)$/i', $waarde);
        if (!$isKleur && !$isLengte) {
            continue;
        }
        $stukken[] = $variabele . ':' . $waarde;
    }

    return $stukken === [] ? '' : implode(';', $stukken);
}
