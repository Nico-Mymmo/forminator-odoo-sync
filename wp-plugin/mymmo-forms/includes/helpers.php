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
