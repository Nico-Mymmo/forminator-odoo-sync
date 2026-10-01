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

/**
 * De naam waaronder een formulier in wp-admin in een keuzelijst staat.
 *
 * De naam van de KOPPELING in de OM ("Syndicoach - Contactaanvraag"), niet de
 * titel die een bezoeker boven het formulier leest ("Stel je vraag, wij zoeken
 * het uit"). Met die titel stond er een zin in de lijst die je in de OM
 * nergens als naam terugvond. Een OM van voor deze wijziging stuurt geen
 * `admin_name`; dan blijft het de titel.
 *
 * @param array<string,mixed> $form  een rij uit Mymmo_Forms_Api_Client::list_forms()
 */
function mymmo_forms_form_label(array $form): string {
    $naam = trim((string) ($form['admin_name'] ?? ''));
    if ($naam === '') {
        $naam = trim((string) ($form['name'] ?? ''));
    }
    return $naam !== '' ? $naam : (string) ($form['slug'] ?? '');
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

    // Een KAAL GETAL betekent pixels. In CSS is dat ongeldig (behalve 0), dus
    // het kan niets anders bedoeld hebben -- en tot 1.17.7 viel `35` stil weg
    // terwijl `35px` wel werkte. Dat is de ergste soort fout in een
    // beheerscherm: het veld blijft na het opslaan ingevuld staan, en je zoekt
    // de oorzaak vervolgens in de stylesheet.
    if (preg_match('/^\d+(\.\d+)?$/', $waarde)) {
        return $waarde . 'px';
    }

    return preg_match('/^\d+(\.\d+)?(px|rem|em|%|ch)$/i', $waarde) ? $waarde : '';
}

/**
 * Een OPVULLING: een tot vier lengtes, zoals `20px` of `20px 62px`.
 *
 * Elk deel gaat door mymmo_forms_length(), dus dezelfde vormcontrole als overal
 * -- deze waarde belandt in een style-attribuut op de pagina van een bezoeker.
 * Eén onbruikbaar deel maakt de hele waarde leeg en niet half: `20px banaan`
 * zou anders `20px` opleveren, en dan staat er iets anders dan wat iemand typte
 * zonder dat hij het merkt.
 */
function mymmo_forms_spacing(string $ruw): string {
    $delen = preg_split('/\s+/', trim($ruw)) ?: [];
    if ($delen === [] || count($delen) > 4) {
        return '';
    }

    $uit = [];
    foreach ($delen as $deel) {
        $lengte = mymmo_forms_length((string) $deel);
        if ($lengte === '') {
            return '';
        }
        $uit[] = $lengte;
    }

    return implode(' ', $uit);
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
 * Van een handvol MERKKLEUREN diegene die op wit het best leesbaar is.
 *
 * WAAROM DIT BESTAAT, EN WAAROM HET GEEN KLEUR MAAKT
 * --------------------------------------------------
 * Calendly kleurt met EEN kleur (`primary_color`) zowel het dagcijfer als de
 * tijdstippen. Die kleur moet dus tekst kunnen dragen. Een thema heeft daar
 * altijd een paar voor klaar: de achtergrond van een knop en de tekst erop --
 * bij Syndicoach mint `#99f6e4` met donkerblauw `#0369a1`. Precies een van die
 * twee is leesbaar op wit, want ze moeten onderling contrasteren.
 *
 * In 1.15.7 stond hier een functie die een kleur DONKERDER REKENDE tot ze 4,5:1
 * haalde. Dat gaf `#0c846d`: leesbaar, en in geen enkel palet te vinden. Deze
 * functie rekent niets om -- ze kiest uit wat ze krijgt, en geeft een van die
 * kleuren letterlijk terug.
 *
 * @param array<int,string> $kandidaten  hex-kleuren, met of zonder #
 * @return string                        zes tekens zonder #, of '' als er geen bruikbare bij zat
 */
function mymmo_forms_leesbaarste_hex6(array $kandidaten): string {
    $beste    = '';
    $contrast = -1.0;

    foreach ($kandidaten as $kandidaat) {
        $ruw = trim((string) $kandidaat);
        // Zonder # aanvaarden: mymmo_forms_hex6() geeft zijn resultaat zelf ZONDER
        // # terug (zo wil Calendly het), en wie dat resultaat hier weer in stopt,
        // kreeg anders stil een lege string -- en de agenda dus geen kleur.
        if ($ruw !== '' && $ruw[0] !== '#' && preg_match('/^[0-9a-f]{3}([0-9a-f]{3})?$/i', $ruw)) {
            $ruw = '#' . $ruw;
        }
        $hex = mymmo_forms_hex6($ruw);
        if ($hex === '') {
            continue;
        }
        $c = mymmo_forms_contrast_op_wit(
            hexdec(substr($hex, 0, 2)) / 255,
            hexdec(substr($hex, 2, 2)) / 255,
            hexdec(substr($hex, 4, 2)) / 255
        );
        // Strikt groter: bij gelijke stand wint de eerste, dus de volgorde van
        // de kandidaten blijft betekenis hebben.
        if ($c > $contrast) {
            $beste    = $hex;
            $contrast = $c;
        }
    }

    return $beste;
}

/** De relatieve helderheid volgens WCAG. */
function mymmo_forms_luminantie(float $r, float $g, float $b): float {
    $kanaal = static function (float $c): float {
        return $c <= 0.03928 ? $c / 12.92 : pow(($c + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * $kanaal($r) + 0.7152 * $kanaal($g) + 0.0722 * $kanaal($b);
}

/** Het contrast van deze kleur op een witte achtergrond. */
function mymmo_forms_contrast_op_wit(float $r, float $g, float $b): float {
    return 1.05 / (mymmo_forms_luminantie($r, $g, $b) + 0.05);
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

        // De INKT van het merk: welke van de twee knopkleuren op wit leesbaar
        // is. Voor een getal, een schuifknop of een tijdstip -- alles wat op een
        // lichte achtergrond staat en gelezen moet worden. Gekozen, niet
        // berekend: het is letterlijk een van de twee kleuren van het thema.
        $inkt = mymmo_forms_leesbaarste_hex6([$achtergrond, $tekst]);
        if ($inkt !== '') {
            $uit['--mf-accent-ink'] = '#' . $inkt;
        }
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
        // padding_x/padding_y stonden hier tot 1.15.4 ook in. De ruimte tot de
        // rand is geen eigenschap van het formulier maar van de plek waar het
        // staat -- en in de pop-up telde ze op bij de opvulling van het paneel,
        // maar alleen bij een stappenreeks. Zie mymmo-forms-modal.css.
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

/**
 * De volledige stijlcascade van een plaatsing, als stukje style-attribuut.
 *
 * Drie lagen, en de VOLGORDE is het punt -- de laatste declaratie wint:
 *
 *   1. het thema van het formulier uit de Operations Manager. Dat geldt overal
 *      waar dit formulier staat.
 *   2. het thema van DEZE site. Een site die haar eigen kleuren aanhoudt, hoort
 *      die van de OM te overschrijven.
 *   3. wat er op DEZE shortcode staat. Dat is de meest expliciete keuze die
 *      iemand kon maken en wint dus van allebei.
 *
 * Deze functie bestaat omdat er inmiddels TWEE wikkels zijn die dezelfde
 * variabelen nodig hebben: .mymmo-form-wrap (templates/form.php) en
 * .mymmo-stappen (templates/steps.php). Bij een stappenreeks staat de tweede om
 * de eerste heen, en de knoppen van de reeks staan erbuiten -- die zouden
 * zonder eigen declaratie op de standaardkleur blijven staan terwijl het
 * formulier eronder wel de juiste heeft.
 *
 * @param array<string,mixed> $theme  het theme-blok uit het schema van de OM
 * @param string              $extra  wat er op de shortcode stond
 */
function mymmo_forms_wrap_style(array $theme, string $extra = ''): string {
    $lagen = [
        mymmo_forms_theme_style($theme),
        mymmo_forms_site_theme_style(),
        trim($extra),
    ];

    return implode(';', array_filter($lagen, static fn ($laag) => $laag !== ''));
}

/**
 * De brug naar de stappenreeks, een keer per pagina.
 *
 * Het script van een stap draait tijdens het PARSEN van de pagina, en
 * mymmo-forms-steps.js staat in de voettekst. `window.MymmoStappen` moet dus al
 * bestaan voordat de eerste stap geparsed wordt; dit stukje bewaart de
 * aanmeldingen in een rij die het echte script daarna afwerkt.
 *
 * Het hangt aan de stap-SECTIE en niet aan de reeks, omdat een callout zijn
 * eerste stap eerder uitschrijft dan het venster eromheen. Stond de brug in
 * templates/steps.php, dan kwam hij bij een callout te laat en deed het script
 * van die stap niets -- zonder dat er iets zichtbaar stukging, want de
 * schuifbalk zelf leest de reeks rechtstreeks uit.
 */
function mymmo_forms_stappen_brug(): string {
    if (defined('MYMMO_FORMS_STAPPEN_BRUG')) {
        return '';
    }
    define('MYMMO_FORMS_STAPPEN_BRUG', true);

    $js = 'window.MymmoStappen=window.MymmoStappen||{_rij:[],stap:function(s,f){this._rij.push([s,f]);}};';

    // wp_get_inline_script_tag() bestaat pas vanaf WordPress 5.7 (deze plugin
    // vraagt 6.2, dus in de praktijk altijd) en ontbreekt in de proefopstellingen
    // zonder WordPress. Een ontbrekende brug is hier geen detail: dan draait het
    // script van een stap op niets.
    return function_exists('wp_get_inline_script_tag')
        ? wp_get_inline_script_tag($js)
        : '<script>' . $js . '</script>';
}

/**
 * EEN stap als sectie: titel, regel eronder, de HTML van de stap, de knoppen.
 *
 * Staat hier en niet in templates/steps.php omdat er twee plekken zijn die deze
 * markup maken. De reeks in het venster maakt ze voor elke stap; een CALLOUT
 * maakt ze voor de eerste stap apart, want die staat bij een callout in de
 * PAGINA, in een kaartje met flavortekst eromheen.
 *
 * Het is nadrukkelijk hetzelfde element in beide gevallen: bij het openen van
 * het venster VERHUIST het (zie mymmo-forms-steps.js), het wordt niet
 * nagemaakt. De knoppenrij gaat dus gewoon mee -- in het kaartje staat ze uit
 * de weg met CSS, want daar is de callout-knop de knop.
 *
 * @param array<string,mixed> $stap       een rij uit Mymmo_Forms_Steps::resolve()
 * @param int                 $index      het nummer in de reeks (0 = de eerste)
 * @param bool                $verbergen  begint deze stap verborgen?
 */
function mymmo_forms_stap_sectie(array $stap, int $index, bool $verbergen, string $terug_label, string $next_label): string {
    $zelf = ($stap['nav'] ?? '') === Mymmo_Forms_Steps::NAV_ZELF;
    $sub  = (string) ($stap['sub'] ?? '');

    // De brug eerst, en alleen de eerste keer: het script van deze stap draait
    // zodra de browser deze markup parseert.
    $html = mymmo_forms_stappen_brug()
        . '<section class="mymmo-stap mymmo-stap--html"'
        . ' data-mymmo-stap="' . esc_attr((string) $index) . '"'
        . ' data-mymmo-stap-naam="' . esc_attr((string) $stap['id']) . '"'
        . ' data-mymmo-stap-velden="' . esc_attr(implode(',', (array) $stap['fields'])) . '"'
        . ' data-mymmo-stap-nav="' . esc_attr($zelf ? 'zelf' : 'plugin') . '"'
        . ($verbergen ? ' hidden' : '') . '>';

    if ((string) ($stap['title'] ?? '') !== '') {
        $html .= '<h3 class="mymmo-stap-titel' . ($sub !== '' ? ' mymmo-stap-titel--met-tekst' : '')
            . '" data-mymmo-kop="titel">' . esc_html((string) $stap['title']) . '</h3>';
    }
    if ($sub !== '') {
        $html .= '<p class="mymmo-stap-tekst" data-mymmo-kop="sub">' . esc_html($sub) . '</p>';
    }

    // Bewust ongefilterd. Dit is de hele reden dat de stappenpagina achter
    // `unfiltered_html` zit: wat hier staat is door een beheerder geschreven,
    // net als een Custom HTML-blok in een pagina.
    //
    // render_html() en niet $stap['html']: dat past de tekstaanpassingen toe die
    // iemand in het voorbeeld van de bouwer maakte. Ze staan apart van de HTML
    // bewaard, zodat het opnieuw inladen van het bestand ze niet wist.
    $html .= '<div class="mymmo-stap-inhoud" data-mymmo-stap-inhoud>'
        . Mymmo_Forms_Steps::render_html($stap)
        . '</div>';

    if (!$zelf) {
        $html .= '<div class="mymmo-stap-nav">';
        // De eerste stap heeft geen "Vorige" -- er is niets ervoor. Hij blijft
        // wel in de rij staan (zichtbaar uitgeschakeld zou beloven dat er iets
        // terug is), dus de knop wordt weggelaten en de "Volgende" staat rechts
        // door justify-content.
        if ($index > 0) {
            $html .= '<button type="button" class="mymmo-stap-knop mymmo-stap-knop--terug" data-mymmo-vorige>'
                . esc_html(($stap['back'] ?? '') !== '' ? (string) $stap['back'] : $terug_label)
                . '</button>';
        }
        $html .= '<button type="button" class="mymmo-stap-knop mymmo-stap-knop--verder" data-mymmo-volgende>'
            . esc_html(($stap['next'] ?? '') !== '' ? (string) $stap['next'] : $next_label)
            . '</button></div>';
    }

    return $html . '</section>';
}

/**
 * De sectie die in het kaartje van een callout staat.
 *
 * Precies dezelfde argumenten als de reeks in het venster, want het IS hetzelfde
 * element: bij het openen verhuist het ernaartoe en bij het sluiten komt het
 * terug (zie mymmo-forms-steps.js). Een tweede exemplaar zou de WAARDE nog
 * kunnen overnemen maar niet de STAND van de bediening -- een schuifbalk wel,
 * een vinkje dat een stap in zijn eigen script bijhoudt niet.
 *
 * `dok_index` telt in dezelfde reeks als templates/steps.php: 0..n-1 zijn de
 * HTML-stappen, n is het formulier.
 *
 * @param array<string,mixed> $form
 * @param array<string,mixed> $form_args  de args waarmee ook het venster rendert
 */
function mymmo_forms_gedokte_sectie(array $form, array $form_args): string {
    $dok = isset($form_args['dok_index']) ? (int) $form_args['dok_index'] : -1;
    if ($dok < 0 || !class_exists('Mymmo_Forms_Steps')) {
        return '';
    }

    $lang    = (string) ($form_args['lang'] ?? 'nl');
    $teksten = Mymmo_Forms_I18n::step_messages($form, $lang);

    $ontbrekend = [];
    $stappen    = Mymmo_Forms_Steps::resolve((string) ($form_args['steps'] ?? ''), $ontbrekend);

    // Zelfde criterium als in templates/steps.php: terug van een mislukte
    // inzending begint de reeks bij het formulier.
    $start = is_array($form_args['flash'] ?? null) ? count($stappen) : 0;

    if ($dok >= count($stappen)) {
        return mymmo_forms_formulier_sectie(
            $form,
            $form_args,
            $lang,
            count($stappen),
            count($stappen) !== $start,
            (string) $teksten['back'],
            count($stappen) > 0
        );
    }

    return mymmo_forms_stap_sectie(
        $stappen[$dok],
        $dok,
        $dok !== $start,
        (string) $teksten['back'],
        (string) $teksten['next']
    );
}

/**
 * De LAATSTE stap als sectie: het formulier zelf.
 *
 * Tegenhanger van mymmo_forms_stap_sectie(), en om dezelfde reden apart: een
 * callout kan het formulier uitlichten in plaats van een stap. Dan staat deze
 * sectie in de PAGINA en verhuist ze bij het openen naar het venster -- het is
 * hetzelfde element, niet een tweede formulier. Twee formulieren zouden twee
 * keer dezelfde veld-id's opleveren en elk <label> naar het verkeerde
 * invoerveld laten wijzen.
 *
 * @param array<string,mixed> $form
 * @param array<string,mixed> $form_args  alles wat templates/form.php nodig heeft
 * @param bool                $met_terug  staat er een stap vóór dit formulier?
 */
function mymmo_forms_formulier_sectie(array $form, array $form_args, string $lang, int $index, bool $verbergen, string $terug_label, bool $met_terug): string {
    // De laatste stap IS het formulier en heeft dus geen stap-record met een
    // titel erin. Zonder kop begint stap 2 abrupt met een invoerveld terwijl
    // stap 1 een titel en een regel uitleg had. Zie mymmo_forms_form_kop().
    $kop_html = mymmo_forms_form_kop($form, array_merge($form_args, ['lang' => $lang]));

    // De "Vorige" gaat MEE in het formulier, naast de verzendknop. Een eigen
    // knoppenrij eronder zou twee rijen knoppen geven waarvan de onderste de
    // belangrijkste niet is.
    $formulier = mymmo_forms_render('form', array_merge($form_args, [
        'step_back'  => $met_terug ? $terug_label : '',
        // De kop staat hierboven al als stap-titel en regel uitleg; het
        // formulier mag ze niet nog eens tonen.
        'show_title' => $kop_html === '' ? ($form_args['show_title'] ?? true) : false,
        'show_intro' => $kop_html === '' ? ($form_args['show_intro'] ?? null) : false,
        'kop_html'   => '',
    ]));

    return '<section class="mymmo-stap mymmo-stap--formulier"'
        . ' data-mymmo-stap="' . esc_attr((string) $index) . '"'
        . ' data-mymmo-stap-naam="formulier"'
        . ($verbergen ? ' hidden' : '') . '>'
        . $kop_html
        . $formulier
        . '</section>';
}

/**
 * Het formulier, of een stappenreeks met het formulier als laatste stap.
 *
 * EEN plek waar die keuze valt, en beide aanroepers gaan erlangs: de shortcode
 * in de pagina en het formulierpaneel van de pop-up. Zou elk van de twee zelf
 * kiezen, dan is een stappenreeks in de pop-up iets anders dan dezelfde reeks
 * in de tekst -- en dat verschil zie je pas als er een inzending binnenkomt met
 * lege verborgen velden.
 *
 * @param string              $steps      het steps="a,b"-attribuut, mag leeg zijn
 * @param array<string,mixed> $form       het schema uit de Operations Manager
 * @param array<string,mixed> $form_args  alles wat templates/form.php nodig heeft
 */
/**
 * Het dankjewelscherm van een tabblad: afbeelding, titel, tekst.
 *
 * EEN opmaak voor alle drie de tabbladen. Het staat in elk paneel als
 * VERBORGEN sjabloon (`hidden`), om twee redenen:
 *   - na een geboekt gesprek toont mymmo-forms-modal.js het zonder ronde langs
 *     de server (Calendly laadt geen nieuwe pagina);
 *   - in de bouwer is het zo in het voorbeeld te zien en te bewerken.
 * Na een geslaagde inzending van een formulier staat het ZICHTBAAR, in de
 * plaats van het formulier (zie mymmo_forms_render_dank_geslaagd()).
 *
 * Zonder afbeelding staat er een vinkje. Een lege titel of tekst krijgt geen
 * plaats op het scherm (`:empty` in de CSS), maar het element staat er wel: de
 * bouwer heeft iets nodig om in te typen.
 *
 * @param array{image?:string,title?:string,text?:string} $dank
 */
function mymmo_forms_render_dank(string $tab, array $dank, bool $zichtbaar): string {
    $beeld = (string) ($dank['image'] ?? '');
    $titel = (string) ($dank['title'] ?? '');
    $tekst = (string) ($dank['text'] ?? '');

    $html = '<div class="mymmo-dank" data-mymmo-dank-scherm="' . esc_attr($tab) . '"';
    $html .= $zichtbaar
        ? ' data-mymmo-geslaagd role="status" tabindex="-1" data-mymmo-focus'
        : ' hidden';
    $html .= '>';

    if ($beeld !== '') {
        $html .= '<img class="mymmo-dank-beeld" data-mymmo-dank="beeld" src="' . esc_url($beeld)
            . '" alt="" loading="eager" decoding="async">';
    } else {
        // Een tekenreeks en geen leeg element: een leeg element kan onderweg
        // weggefilterd worden (zie claude.md, de stappen op syndicoach.be).
        $html .= '<span class="mymmo-dank-vink" data-mymmo-dank="beeld" aria-hidden="true">&#10003;</span>';
    }

    if ($titel !== '' || !$zichtbaar) {
        $html .= '<h3 class="mymmo-dank-titel" data-mymmo-dank="titel">' . esc_html($titel) . '</h3>';
    }
    if ($tekst !== '' || !$zichtbaar) {
        $html .= '<p class="mymmo-dank-tekst" data-mymmo-dank="tekst">' . esc_html($tekst) . '</p>';
    }

    return $html . '</div>';
}

/**
 * Het dankjewelscherm na een geslaagde inzending, in de plaats van het formulier.
 *
 * In een wikkel met dezelfde data-attributen als het formulier had
 * (`data-mymmo-slug`, `data-mymmo-doel`, `data-mymmo-tabblad`): daar leest
 * mymmo-forms.js de conversie uit. Zonder die wikkel toont het scherm, maar
 * meldt niemand iets aan Google Analytics.
 */
function mymmo_forms_render_dank_geslaagd(array $form, string $slug, array $form_args, array $dank): string {
    $theme = is_array($form['theme'] ?? null) ? $form['theme'] : [];
    $stijl = mymmo_forms_wrap_style($theme, (string) ($form_args['extra_style'] ?? ''));
    $doel  = (string) ($form_args['goal'] ?? '');
    $tab   = (string) ($form_args['tab'] ?? '');

    return '<div class="mymmo-form-wrap mymmo-form-wrap--dank"'
        . ' data-mymmo-slug="' . esc_attr($slug) . '"'
        . ($doel !== '' ? ' data-mymmo-doel="' . esc_attr($doel) . '"' : '')
        . ($tab !== '' ? ' data-mymmo-tabblad="' . esc_attr($tab) . '"' : '')
        . ($stijl !== '' ? ' style="' . esc_attr($stijl) . '"' : '')
        . '>'
        . mymmo_forms_render_dank($tab !== '' ? $tab : 'form', $dank, true)
        . '</div>';
}

/**
 * De kop boven een formulier in de pop-up: titel + regel uitleg.
 *
 * EEN plek voor twee gevallen: het formulier als laatste stap van een reeks
 * (templates/steps.php) en het formulier op een tabblad zonder stappen ("Stuur
 * een bericht"). Allebei met de klassen van een stap-titel, zodat een tabblad
 * met en zonder stappen er hetzelfde uitziet.
 *
 * Wat op de shortcode staat (`form_title`/`form_sub`), wint -- dat is de
 * plaatsing. Staat er niets, dan de naam en de inleiding van het formulier uit
 * de OM, in de taal van de pagina.
 */
function mymmo_forms_form_kop(array $form, array $form_args): string {
    $lang = (string) ($form_args['lang'] ?? '');
    if ($lang === '') {
        $lang = Mymmo_Forms_I18n::resolve($form);
    }

    $titel = (string) ($form_args['form_title'] ?? '');
    $sub   = (string) ($form_args['form_sub'] ?? '');

    if ($titel === '') {
        $titel = (string) Mymmo_Forms_I18n::text($form, $lang, 'name');
    }
    if ($sub === '') {
        $sub = (string) Mymmo_Forms_I18n::text(
            $form, $lang, 'description', $lang === Mymmo_Forms_I18n::default_language($form)
        );
    }

    return mymmo_forms_kop_blok($titel, $sub, 'form');
}

/**
 * De kop boven een paneel: een titel met eventueel een regel eronder.
 *
 * Staat apart omdat er intussen TWEE panelen zo'n kop hebben (het formulier
 * en de agenda) en er maar EEN stijl voor mag bestaan. Precies dezelfde
 * klassen als een stap gebruikt (`mymmo-stap-titel` / `mymmo-stap-tekst`),
 * zodat stap 1 en het laatste scherm er hetzelfde uitzien. Schrijf een tweede
 * variant hier dus niet naast -- geef ze een `$merk` en voeg ze hier toe.
 *
 * @param string $titel
 * @param string $sub
 * @param string $merk  wat er in data-mymmo-kop komt (form, calendly, ...)
 */
function mymmo_forms_kop_blok(string $titel, string $sub, string $merk): string {
    $html = '';
    if ($titel !== '') {
        $html .= '<h3 class="mymmo-stap-titel' . ($sub !== '' ? ' mymmo-stap-titel--met-tekst' : '')
            . '" data-mymmo-kop="' . esc_attr($merk) . '-titel">' . esc_html($titel) . '</h3>';
    }
    if ($sub !== '') {
        $html .= '<p class="mymmo-stap-tekst" data-mymmo-kop="' . esc_attr($merk) . '-sub">'
            . esc_html($sub) . '</p>';
    }

    return $html;
}

/**
 * Een formulier zonder stappen. In de pop-up (die `form_heading` meegeeft)
 * krijgt het dezelfde kop als de laatste stap van een reeks, tenzij die kop op
 * de shortcode uitgezet is (`form_heading="no"`). Een [mymmo_form] in een pagina
 * geeft `form_heading` niet mee en houdt zijn eigen titel en inleiding.
 */
function mymmo_forms_render_form_zonder_stappen(array $form, array $form_args): string {
    if (empty($form_args['form_heading'])) {
        return mymmo_forms_render('form', $form_args);
    }

    $kop = mymmo_forms_form_kop($form, $form_args);
    if ($kop === '') {
        return mymmo_forms_render('form', $form_args);
    }

    return mymmo_forms_render('form', array_merge($form_args, [
        'kop_html'   => $kop,
        'show_title' => false,
        'show_intro' => false,
    ]));
}

function mymmo_forms_render_body(string $steps, array $form, string $slug, array $form_args): string {
    // Een DOK betekent dat een callout iets uit deze reeks in de pagina zet. Dan
    // is er ook een reeks nodig als er geen enkele HTML-stap is: een callout die
    // het FORMULIER uitlicht, licht de laatste stap van een reeks van één uit.
    $dok = isset($form_args['dok_index']) ? (int) $form_args['dok_index'] : -1;

    if ((trim($steps) === '' && $dok < 0) || !class_exists('Mymmo_Forms_Steps')) {
        return mymmo_forms_render_form_zonder_stappen($form, $form_args);
    }

    $ontbrekend = [];
    $stappen    = Mymmo_Forms_Steps::resolve($steps, $ontbrekend);

    if ($stappen === [] && $dok < 0) {
        // Geen enkele stap gevonden. Het formulier gewoon tonen is de juiste
        // terugval -- een bezoeker kan dan nog versturen -- maar een beheerder
        // moet weten dat de reeks weggevallen is, anders zoekt hij in de
        // Operations Manager naar een fout die hier zit.
        $melding = ($ontbrekend !== [] && current_user_can('manage_options'))
            ? '<div class="mymmo-form-notice mymmo-form-notice--admin">Deze stappen bestaan niet (meer): '
              . esc_html(implode(', ', $ontbrekend))
              . '. Kijk na bij Instellingen &rarr; Mymmo Forms &rarr; Stappen.</div>'
            : '';

        return $melding . mymmo_forms_render_form_zonder_stappen($form, $form_args);
    }

    return mymmo_forms_render('steps', [
        'stappen'     => $stappen,
        'form_args'   => $form_args,
        'form'        => $form,
        'slug'        => $slug,
        // Bij een callout draagt de wikkel van de callout de reeks, en die
        // heeft haar id al. Zie mymmo_forms_wrap_id().
        'wrap_id'     => (string) ($form_args['wrap_id'] ?? '') !== ''
            ? (string) $form_args['wrap_id']
            : mymmo_forms_wrap_id($slug, (string) ($form_args['instance_id'] ?? '')),
        'ontbrekend'  => $ontbrekend,
        'lang'        => (string) ($form_args['lang'] ?? 'nl'),
        'extra_style' => (string) ($form_args['extra_style'] ?? ''),
        // NAAKT: de reeks krijgt hier geen eigen `data-mymmo-stappen`-wikkel.
        // Die staat dan om het venster EN de callout heen -- zie
        // templates/callout.php. Zonder dat zou de stap in de pagina buiten
        // zijn eigen reeks vallen en nergens een waarde kwijt kunnen.
        'naakt'       => !empty($form_args['naakt']),
        // Welke stap er in de pagina staat in plaats van hier. -1 = geen.
        'dok_index'   => isset($form_args['dok_index']) ? (int) $form_args['dok_index'] : -1,
    ]);
}

/**
 * Een id voor de wikkel van een reeks dat op deze pagina uniek is.
 *
 * Het staat in de <noscript><style> die de HTML-stappen wegneemt; twee reeksen
 * met hetzelfde id zouden elkaars terugval aansturen. Het hoeft NIET hetzelfde
 * te blijven na het versturen -- anders dan het id van een pop-up staat dit
 * nergens in een URL.
 */
function mymmo_forms_wrap_id(string $slug, string $instance_id = ''): string {
    static $teller = 0;
    $teller += 1;

    $basis = $instance_id !== '' ? $instance_id : ('mymmo-form-' . $slug);

    return 'mymmo-stappen-' . preg_replace('/[^A-Za-z0-9_-]/', '', $basis) . '-' . $teller;
}
