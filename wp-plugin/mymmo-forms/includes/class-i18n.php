<?php
/**
 * Taal kiezen en tekst opzoeken.
 *
 * Een formulier bestaat in één of meer talen. De veldsleutels en de
 * OPTIEWAARDEN zijn in alle talen identiek -- alleen de labels verschillen.
 * Daardoor volstaat één koppeling met één set mappings naar Odoo: een
 * Franstalige bezoeker die "Appartement" aanklikt, verstuurt exact dezelfde
 * waarde als een Nederlandstalige.
 *
 * De teksten komen uit de Operations Manager. De vaste bezoekersteksten
 * (foutmeldingen, "Maak een keuze", "Bezig met versturen…") komen MEE in de
 * payload, uit MESSAGES in forms/schema.js. Dat is bewust: zo staat dezelfde
 * zin niet in een PHP-tabel én in een JS-tabel én in de Worker, met drie kansen
 * om uit elkaar te lopen. Eén bron, drie gebruikers.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_I18n {

    /**
     * Alleen gebruikt als het formulier zelf niet geladen kon worden -- dan is
     * er geen payload en dus ook geen catalogus. In dat geval weten we ook niet
     * welke talen het formulier had, dus Nederlands. Dit is de enige plek waar
     * een bezoekerstekst in de plugin hardgecodeerd staat, en dat hoort zo te
     * blijven.
     */
    private const NOODTEKSTEN = [
        'expired'     => 'De pagina was verlopen. Probeer het opnieuw.',
        'rejected'    => 'De inzending kon niet verwerkt worden.',
        'unavailable' => 'Dit formulier is momenteel niet beschikbaar.',
        'send_failed' => 'We konden je bericht niet versturen. Probeer het zo meteen opnieuw.',
        'stale_page'  => 'Deze pagina stond te lang open. Ververs ze en probeer opnieuw.',
    ];

    /**
     * De talen die dit formulier zegt te spreken.
     *
     * @param array<string,mixed> $form
     * @return array<int,string>
     */
    public static function languages(array $form): array {
        $talen = $form['languages'] ?? null;
        if (!is_array($talen) || $talen === []) {
            return [self::default_language($form)];
        }
        return array_values(array_filter(array_map('strval', $talen), 'is_string'));
    }

    /** @param array<string,mixed> $form */
    public static function default_language(array $form): string {
        $standaard = (string) ($form['default_language'] ?? 'nl');
        return $standaard !== '' ? $standaard : 'nl';
    }

    /**
     * In welke taal moet dit formulier op DEZE pagina staan?
     *
     * Volgorde:
     *   1. het lang-attribuut op de shortcode -- expliciet wint altijd, zodat je
     *      een Frans formulier op een Nederlandse pagina kan zetten
     *   2. de taal van de pagina: WPML of Polylang als die er staan, anders de
     *      WordPress-locale
     *   3. de standaardtaal van het formulier
     *
     * Een taal die het formulier niet heeft, valt terug op de standaardtaal.
     * Bewust stil: als iemand lang="de" typt terwijl het formulier geen Duits
     * kent, is een Nederlands formulier beter dan een foutmelding op de pagina
     * van een bezoeker. In wp-admin en in de bouwer is wél te zien welke talen
     * er zijn.
     *
     * @param array<string,mixed> $form
     */
    public static function resolve(array $form, string $gevraagd = ''): string {
        $talen    = self::languages($form);
        $standaard = self::default_language($form);

        $gevraagd = strtolower(trim($gevraagd));
        if ($gevraagd !== '' && in_array($gevraagd, $talen, true)) {
            return $gevraagd;
        }

        $pagina = self::page_language();
        if ($pagina !== '' && in_array($pagina, $talen, true)) {
            return $pagina;
        }

        return in_array($standaard, $talen, true) ? $standaard : ($talen[0] ?? 'nl');
    }

    /**
     * De taal van de pagina, als tweeletterige code.
     *
     * WPML en Polylang eerst: die weten het echt, want daar heeft iemand de
     * pagina in een taal gezet. determine_locale() geeft de taal van de SITE en
     * op een eentalige site die stiekem tweetalig is (twee pagina's, één locale)
     * zou dat altijd hetzelfde antwoord geven -- vandaar dat het lang-attribuut
     * op de shortcode er sowieso is.
     */
    private static function page_language(): string {
        if (defined('ICL_LANGUAGE_CODE')) {
            $code = strtolower((string) ICL_LANGUAGE_CODE);
            if ($code !== '') {
                return substr($code, 0, 2);
            }
        }

        if (function_exists('pll_current_language')) {
            $code = (string) pll_current_language('slug');
            if ($code !== '') {
                return substr(strtolower($code), 0, 2);
            }
        }

        $locale = function_exists('determine_locale') ? determine_locale() : get_locale();
        return substr(strtolower((string) $locale), 0, 2);
    }

    /**
     * Een tekst van het FORMULIER in een taal.
     *
     * $verplicht bepaalt de terugval als de vertaling ontbreekt:
     *   true  -> de standaardtaal. Eén Nederlandse knoptekst tussen Franse is
     *            lelijk; een lege knop is stuk.
     *   false -> leeg. Een omschrijving in de verkeerde taal is verwarrender
     *            dan geen omschrijving.
     *
     * In de praktijk kan dit nauwelijks voorkomen: de Operations Manager
     * weigert een formulier te publiceren zolang een taal nog labels mist. Dit
     * is het vangnet voor een formulier dat al gepubliceerd was voor er een
     * taal bijkwam.
     *
     * @param array<string,mixed> $form
     */
    public static function text(array $form, string $lang, string $key, bool $verplicht = true): string {
        $i18n = is_array($form['i18n'] ?? null) ? $form['i18n'] : [];
        $vertaald = isset($i18n[$lang][$key]) ? trim((string) $i18n[$lang][$key]) : '';
        if ($vertaald !== '') {
            return $vertaald;
        }
        return $verplicht ? trim((string) ($form[$key] ?? '')) : '';
    }

    /**
     * Een tekst van een VELD in een taal.
     *
     * @param array<string,mixed> $veld
     */
    public static function field_text(array $veld, string $lang, string $key, bool $verplicht = true): string {
        $i18n = is_array($veld['i18n'] ?? null) ? $veld['i18n'] : [];
        $vertaald = isset($i18n[$lang][$key]) ? trim((string) $i18n[$lang][$key]) : '';
        if ($vertaald !== '') {
            return $vertaald;
        }
        return $verplicht ? trim((string) ($veld[$key] ?? '')) : '';
    }

    /**
     * Het label van één optie in een taal.
     *
     * De WAARDE vertaalt nooit -- die gaat naar Odoo. Het vertaalde label hangt
     * aan die waarde en niet aan een positie in de lijst, zodat opties
     * herschikken in het Nederlands de Franse labels niet door elkaar gooit.
     *
     * @param array<string,mixed> $veld
     * @param array<string,mixed> $optie
     */
    public static function option_label(array $veld, string $lang, array $optie): string {
        $waarde = (string) ($optie['value'] ?? '');
        $i18n   = is_array($veld['i18n'] ?? null) ? $veld['i18n'] : [];

        if (isset($i18n[$lang]['options'][$waarde])) {
            $vertaald = trim((string) $i18n[$lang]['options'][$waarde]);
            if ($vertaald !== '') {
                return $vertaald;
            }
        }

        $label = trim((string) ($optie['label'] ?? ''));
        return $label !== '' ? $label : $waarde;
    }

    /**
     * Een vaste bezoekerstekst uit de catalogus die met het formulier meekwam.
     *
     * $form mag null zijn: dan kon het formulier niet geladen worden en is er
     * geen catalogus. Zie NOODTEKSTEN.
     *
     * @param array<string,mixed>|null $form
     * @param array<string,scalar>     $vars
     */
    public static function msg(?array $form, string $lang, string $key, array $vars = []): string {
        $catalogus = self::messages(is_array($form) ? $form : [], $lang);
        $sjabloon  = (string) ($catalogus[$key] ?? self::NOODTEKSTEN[$key] ?? '');

        foreach ($vars as $naam => $waarde) {
            $sjabloon = str_replace('{' . $naam . '}', (string) $waarde, $sjabloon);
        }

        return $sjabloon;
    }

    /**
     * De hele catalogus voor één taal. Ook wat de browser-JS krijgt, zodat de
     * meldingen die JavaScript toont letterlijk dezelfde zijn als die de
     * Operations Manager terugstuurt.
     *
     * @param array<string,mixed> $form
     * @return array<string,string>
     */
    public static function messages(array $form, string $lang): array {
        $alle = is_array($form['messages'] ?? null) ? $form['messages'] : [];

        if (isset($alle[$lang]) && is_array($alle[$lang])) {
            return array_map('strval', $alle[$lang]);
        }

        // De gevraagde taal zit niet in de payload. Dan liever de standaardtaal
        // van het formulier dan niets: een lege catalogus zou betekenen dat een
        // bezoeker de sleutel ("required") op zijn scherm ziet staan.
        $standaard = self::default_language($form);
        if (isset($alle[$standaard]) && is_array($alle[$standaard])) {
            return array_map('strval', $alle[$standaard]);
        }

        $eerste = is_array(reset($alle)) ? reset($alle) : [];
        return array_map('strval', $eerste);
    }
}
