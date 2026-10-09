<?php
/**
 * Vormcontrole en de gesloten lijsten.
 *
 * Alles wat hier doorheen gaat, belandt in een class- of style-attribuut op de
 * pagina van een bezoeker. Dus: nooit doorgeven wat er getypt is, altijd een
 * waarde uit een lijst of een gecontroleerde vorm. Zelfde afweging als
 * mymmo_forms_color() / mymmo_forms_length() in Mymmo Forms -- bewust een eigen
 * kopie en geen gedeelde bibliotheek, want die twee plugins horen los van
 * elkaar uitrolbaar te blijven.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Een GETAL binnen grenzen. '' of iets onmogelijks geeft de terugval.
 *
 * Voor de kleefwiskunde (`top`, `min-height`, negatieve marges die elkaar
 * opheffen) zijn dat pixels; voor de sierafbeelding procenten en graden, en
 * daar mag het getal negatief zijn -- vandaar dat de ondergrens meegegeven
 * wordt en niet vastligt. Wat er NIET doorkomt is een eenheid: die staat bij de
 * aanroeper, zodat er geen `rem` of `vw` in de wiskunde kan sluipen waarmee de
 * stapel op één site klopt en op de volgende niet.
 */
function mymmo_cards_px($ruw, int $terugval, int $min = 0, int $max = 400): int {
    if (is_string($ruw)) {
        $ruw = trim($ruw);
        if ($ruw === '') {
            return $terugval;
        }
    }
    if (!is_numeric($ruw)) {
        return $terugval;
    }

    $waarde = (int) round((float) $ruw);

    return max($min, min($max, $waarde));
}

/**
 * Een KLEUR: #rgb, #rrggbb, of een CSS-variabele van het thema-palet.
 *
 * De kleurkiezer van WordPress geeft ofwel een hex ofwel `var(--wp--preset--
 * color--<slug>)`. Die tweede vorm is de waardevolle: kiest een marketeer een
 * kleur uit het palet van het thema, dan schuift de kaart mee als het merk ooit
 * van tint verandert. Daarom wordt die vorm expliciet doorgelaten -- maar enkel
 * met een slug van letters, cijfers en streepjes, nooit vrije tekst.
 */
function mymmo_cards_color(string $ruw): string {
    $waarde = trim($ruw);
    if ($waarde === '') {
        return '';
    }

    if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $waarde)) {
        return strtolower($waarde);
    }

    if (preg_match('/^var\(--wp--preset--color--[a-z0-9-]+\)$/i', $waarde)) {
        return $waarde;
    }

    // De slug op zich mag ook: dan maken we er zelf de variabele van. Zo kan de
    // editor gewoon de slug bewaren die de kleurkiezer teruggeeft.
    if (preg_match('/^[a-z0-9][a-z0-9-]{0,40}$/i', $waarde)) {
        return 'var(--wp--preset--color--' . strtolower($waarde) . ')';
    }

    return '';
}

/**
 * Een URL naar een afbeelding, of ''.
 *
 * Alleen http(s) en paden binnen de site. Deze waarde belandt in een `src` op
 * de pagina van een bezoeker; `javascript:` en `data:` horen daar niet in, en
 * esc_url() alleen is te soepel voor wat hier bedoeld is (een afbeelding).
 */
function mymmo_cards_afbeelding(string $ruw): string {
    $waarde = trim($ruw);
    if ($waarde === '') {
        return '';
    }

    // Haakjes, aanhalingstekens en witruimte gaan er niet in: deze waarde
    // belandt in een `url(...)` in een style-attribuut, en daar zou een haakje
    // of een quote uit kunnen breken. In een echte afbeeldings-URL horen ze
    // ook niet -- een spatie hoort daar als %20 te staan.
    if (preg_match('/[()"\'<>\s]/', $waarde)) {
        return '';
    }

    if (preg_match('#^https?://#i', $waarde) || strpos($waarde, '/') === 0) {
        return esc_url_raw($waarde);
    }

    return '';
}

/**
 * De OPVULLING van een kaart, als gesloten lijst.
 *
 * Geen vrij in te typen maat: de opvulling hoort op de stapel te staan zodat de
 * kaarten niet uit elkaar kunnen lopen -- precies wat er misging toen elke
 * kaart haar eigen inline-opvulling had. Een kaart mag afwijken, maar dan uit
 * deze drie.
 *
 * DE MATEN ZELF STAAN IN DE CSS, niet hier. Een opvulling verschilt per
 * breekpunt, en een inline `style` wint van elke media query op datzelfde
 * element -- de waarde hier zetten zou betekenen dat een telefoon de
 * desktopmaat nooit meer kan verkleinen. Daarom is dit een KLASSE
 * (`mymmo-kaarten--pad-ruim`) en geen variabele.
 *
 * Sleutel => wat je in de editor leest
 */
function mymmo_cards_opvullingen(): array {
    return [
        'krap'    => 'Krap',
        'normaal' => 'Normaal',
        'ruim'    => 'Ruim',
    ];
}

/**
 * De KOLOMVERHOUDINGEN, als gesloten lijst.
 *
 * `minmax(0, …)` staat er al bij: zonder die 0 als ondergrens weigert een
 * grid-kolom smaller te worden dan haar inhoud, en dan steekt een lange regel
 * of een breed beeld de kaart uit.
 *
 * Sleutel => [wat je leest, wat de CSS krijgt]
 */
function mymmo_cards_verhoudingen(): array {
    return [
        '50-50' => ['Gelijk (50 / 50)',      'minmax(0, 1fr) minmax(0, 1fr)'],
        '40-60' => ['Beeld ruimer (40 / 60)', 'minmax(0, 2fr) minmax(0, 3fr)'],
        '60-40' => ['Tekst ruimer (60 / 40)', 'minmax(0, 3fr) minmax(0, 2fr)'],
        '33-67' => ['Smal / breed (33 / 67)', 'minmax(0, 1fr) minmax(0, 2fr)'],
        '67-33' => ['Breed / smal (67 / 33)', 'minmax(0, 2fr) minmax(0, 1fr)'],
    ];
}

/**
 * Waar de THINGIES staan: de Asset Manager van de OM, map `brand/thingies/`.
 * Elk bestand heet `thingies_<slug>.svg`.
 */
if (!defined('MYMMO_CARDS_THINGIES_URL')) {
    define('MYMMO_CARDS_THINGIES_URL', 'https://link.openvme.be/assets/brand/thingies/thingies_');
}

/**
 * De THINGIES: de tekeningetjes van het merk, en de ENIGE iconen op de site.
 *
 * Een component dat een icoon toont, kiest uit deze lijst -- geen Dashicons,
 * geen icoonlettertype, geen eigen SVG. Zo heeft elk icoon op de site dezelfde
 * hand, en staat er nooit een icoon dat niet bij het merk hoort.
 *
 * De bestanden komen uit de Asset Manager. De huisstijlcontrole haalt elk
 * bestand in deze lijst op en weigert de zip als er een niet bestaat --
 * `vuilniishok` met een dubbele i is de echte bestandsnaam, en de "logische"
 * spelling gaf een 404 die je pas op de site zag. Een nieuw thingy: eerst in de
 * Asset Manager zetten, dan hier toevoegen.
 *
 * @return array<string,string> slug => wat je in de editor leest
 */
function mymmo_cards_thingies(): array {
    return [
        'lift'              => 'Lift',
        'spaarvarken'       => 'Spaarvarken',
        'brieven'           => 'Brieven',
        'kapotte-lamp'      => 'Kapotte lamp',
        'calendar1'         => 'Kalender',
        'calendar2'         => 'Kalender (2)',
        'vergrootglas'      => 'Vergrootglas',
        'openstaande-vraag' => 'Openstaande vraag',
        'telefoon'          => 'Telefoon',
        'aktentas'          => 'Aktentas',
        'zonnepaneel'       => 'Zonnepaneel',
        'laadpaal'          => 'Laadpaal',
        'bakstenen'         => 'Bakstenen',
        'deur'              => 'Deur',
        'fietsenstalling'   => 'Fietsenstalling',
        'kruis'             => 'Kruis',
        'sfeer'             => 'Sfeer',
        'tuin'              => 'Tuin',
        'verwarming'        => 'Verwarming',
        'vuilniishok'       => 'Vuilnishok',
    ];
}

/** De volledige URL van een thingy, of '' als het niet in de lijst staat. */
function mymmo_cards_thingie_url(string $slug): string {
    return isset(mymmo_cards_thingies()[$slug]) ? MYMMO_CARDS_THINGIES_URL . $slug . '.svg' : '';
}

/**
 * De AFRONDINGEN, als gesloten lijst: recht, klein, groot.
 *
 * Sleutel => [wat je leest, de waarde uit de huisstijl]. De sleutel is een
 * getal omdat de stapel haar hoeken als getal bewaart (tot 1.9.1 was dat een
 * schuifbalk van 0 tot 60). De MAAT zelf staat in de huisstijl
 * (mymmo-huisstijl.css): wordt "groot" ooit 24px, dan verandert dat hier niet.
 *
 * @return array<int, array{0:string,1:string}>
 */
function mymmo_cards_afrondingen(): array {
    return [
        0  => ['Recht', '0'],
        14 => ['Klein', 'var(--mymmo-afronding-m)'],
        28 => ['Groot', 'var(--mymmo-afronding-l)'],
    ];
}

/**
 * Een bewaarde afronding -> de waarde uit de huisstijl die er het dichtst bij
 * ligt. Zo krijgen ook oudere pagina's de maten van de huisstijl: 16 wordt
 * klein, 35 en 48 worden groot. '' of iets onleesbaars geeft ''.
 *
 * @param mixed $ruw
 */
function mymmo_cards_afronding($ruw): string {
    if (is_string($ruw)) {
        $ruw = trim($ruw);
    }
    if ($ruw === '' || $ruw === null || !is_numeric($ruw)) {
        return '';
    }

    $waarde = (float) $ruw;
    $beste = '';
    $afstand = INF;
    foreach (mymmo_cards_afrondingen() as $sleutel => $rij) {
        $verschil = abs($waarde - $sleutel);
        if ($verschil < $afstand) {
            $afstand = $verschil;
            $beste = $rij[1];
        }
    }

    return $beste;
}

/** Een waarde uit een gesloten lijst, of de eerste sleutel als terugval. */
function mymmo_cards_keuze(string $ruw, array $lijst, string $terugval): string {
    $waarde = strtolower(trim($ruw));

    return isset($lijst[$waarde]) ? $waarde : $terugval;
}

/**
 * Staat er iets in deze kolom?
 *
 * Een lege kolom hoort geen plaats in te nemen: een kaart met één kolom is een
 * brede kaart, geen kaart met een gat ernaast. `trim()` alleen volstaat niet --
 * de editor laat lege alinea's en `<br>` achter -- en strip_tags() alleen ook
 * niet, want een afbeelding of een formulier heeft geen tekst.
 */
function mymmo_cards_heeft_inhoud(string $html): bool {
    if (preg_match('/<(img|svg|video|iframe|form|input|select|textarea|button|figure|hr|canvas|picture|section)\b/i', $html)) {
        return true;
    }

    $tekst = trim(wp_strip_all_tags($html));
    $tekst = str_replace(["\xc2\xa0", '&nbsp;'], ' ', $tekst);

    return trim($tekst) !== '';
}
