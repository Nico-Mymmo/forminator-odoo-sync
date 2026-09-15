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
