<?php
/**
 * Inzendingen.
 *
 * De browser post naar admin-post.php, en PHP praat met de API. Daardoor blijft
 * de sitesleutel serverside -- die hoort niet in de HTML.
 *
 * Antispam, in deze volgorde en zonder captcha:
 *   1. honeypot -- een veld dat een mens niet ziet en een bot invult
 *   2. minimale invultijd -- een formulier binnen MIN_SECONDS invullen doet
 *      geen mens; het tijdstip is ondertekend met wp_hash() zodat een bot het
 *      niet gewoon kan terugzetten
 *   3. nonce -- vangt cross-site posts
 *   4. rate limit in de Worker, per sitesleutel
 *
 * Een captcha kost inzendingen en staat er bewust niet in. Blijkt dit niet te
 * volstaan, dan is Cloudflare Turnstile de volgende stap -- niet reCAPTCHA.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Submit {

    private const ACTION            = 'mymmo_forms_submit';
    private const TRANSIENT_PREFIX  = 'mymmo_forms_r_';
    private const MIN_SECONDS       = 3;
    private const MAX_SECONDS       = 21600; // 6 uur; daarna is de pagina te oud
    public  const HONEYPOT_FIELD    = 'mymmo_forms_website';
    public  const TIME_FIELD        = 'mymmo_forms_t';

    public static function init(): void {
        add_action('admin_post_nopriv_' . self::ACTION, [self::class, 'handle']);
        add_action('admin_post_' . self::ACTION, [self::class, 'handle']);
    }

    public static function action_url(): string {
        return admin_url('admin-post.php');
    }

    public static function action_name(): string {
        return self::ACTION;
    }

    /**
     * Een ondertekend tijdstempel voor het formulier. wp_hash() gebruikt de
     * salts van deze site, dus een bot kan geen geldig paar verzinnen.
     */
    public static function time_token(): string {
        $nu = time();
        return $nu . '.' . wp_hash((string) $nu . self::ACTION);
    }

    private static function time_token_age(string $token): ?int {
        $stukken = explode('.', $token, 2);
        if (count($stukken) !== 2 || !ctype_digit($stukken[0])) {
            return null;
        }
        $tijd = (int) $stukken[0];
        if (!hash_equals(wp_hash((string) $tijd . self::ACTION), $stukken[1])) {
            return null;
        }
        return time() - $tijd;
    }

    /**
     * Het resultaat van een net verstuurde inzending, om na de redirect te
     * tonen. Een transient met een token in de URL, zodat er geen gegevens in
     * de querystring staan -- die belanden anders in serverlogs en in de
     * verwijzende URL van de volgende pagina.
     *
     * @return array{status:string,message:string,values:array<string,mixed>,slug:string}|null
     */
    public static function flash(): ?array {
        $token = isset($_GET['mymmo_form']) ? sanitize_key(wp_unslash($_GET['mymmo_form'])) : '';
        if ($token === '') {
            return null;
        }

        $data = get_transient(self::TRANSIENT_PREFIX . $token);
        if (!is_array($data)) {
            return null;
        }

        delete_transient(self::TRANSIENT_PREFIX . $token);
        return $data;
    }

    public static function handle(): void {
        $slug     = isset($_POST['mymmo_form_slug']) ? sanitize_title(wp_unslash($_POST['mymmo_form_slug'])) : '';
        $redirect = isset($_POST['mymmo_redirect_to']) ? wp_unslash($_POST['mymmo_redirect_to']) : home_url('/');
        $redirect = wp_validate_redirect($redirect, home_url('/'));

        // Het formulier EERST ophalen, nog voor de nonce- en spamcontroles.
        //
        // Dat lijkt de verkeerde volgorde, maar het is een gecachete leesactie
        // zonder enig neveneffect, en het is de enige manier om ook "de pagina
        // was verlopen" in de taal van de bezoeker te tonen: de berichten-
        // catalogus zit IN het formulier. Zonder dit kreeg een Franstalige
        // bezoeker bij een verlopen nonce alsnog een Nederlandse zin.
        $form = Mymmo_Forms_Api_Client::get_form($slug);
        $form = is_array($form) ? $form : null;
        $lang = self::taal($form);

        if ($slug === '' || !isset($_POST['_wpnonce']) || !wp_verify_nonce($_POST['_wpnonce'], self::ACTION . '_' . $slug)) {
            self::finish($redirect, $slug, 'error', Mymmo_Forms_I18n::msg($form, $lang, 'expired'));
        }

        // Honeypot. Bewust dezelfde algemene foutmelding als hieronder: een bot
        // mag niet kunnen afleiden welke controle hem tegenhield.
        if (!empty($_POST[self::HONEYPOT_FIELD])) {
            self::finish($redirect, $slug, 'error', Mymmo_Forms_I18n::msg($form, $lang, 'rejected'));
        }

        $leeftijd = self::time_token_age((string) ($_POST[self::TIME_FIELD] ?? ''));
        if ($leeftijd === null || $leeftijd < self::MIN_SECONDS) {
            self::finish($redirect, $slug, 'error', Mymmo_Forms_I18n::msg($form, $lang, 'rejected'));
        }
        if ($leeftijd > self::MAX_SECONDS) {
            self::finish($redirect, $slug, 'error', Mymmo_Forms_I18n::msg($form, $lang, 'stale_page'));
        }

        if (!is_array($form) || !is_array($form['fields'] ?? null)) {
            self::finish($redirect, $slug, 'error', Mymmo_Forms_I18n::msg($form, $lang, 'unavailable'));
        }

        // Alleen velden die in het schema staan worden overgenomen. Alles wat de
        // browser extra meestuurt gaat de vuilnisbak in; de Operations Manager
        // doet diezelfde controle nog eens, want die is de enige die telt.
        $values = [];
        foreach ($form['fields'] as $veld) {
            if (!is_array($veld) || empty($veld['key'])) {
                continue;
            }
            $sleutel = (string) $veld['key'];
            $type    = (string) ($veld['type'] ?? 'text');

            if ($type === 'heading' || $type === 'paragraph') {
                continue;
            }

            $ruw = $_POST[$sleutel] ?? '';

            if ($type === 'checkbox') {
                // Een niet-aangevinkt vakje stuurt niets mee. Expliciet ja/nee,
                // zodat de mapping in Odoo altijd iets te lezen heeft.
                $values[$sleutel] = empty($ruw) ? 'nee' : 'ja';
                continue;
            }

            if (is_array($ruw)) {
                $schoon = array_map(
                    static fn ($v) => sanitize_text_field(wp_unslash((string) $v)),
                    $ruw
                );
                $values[$sleutel] = implode(', ', array_filter($schoon, static fn ($v) => $v !== ''));
                continue;
            }

            $values[$sleutel] = $type === 'textarea'
                ? sanitize_textarea_field(wp_unslash((string) $ruw))
                : sanitize_text_field(wp_unslash((string) $ruw));
        }

        $resultaat = Mymmo_Forms_Api_Client::submit($slug, $values, self::meta($redirect, $lang));

        if ($resultaat['ok']) {
            $bericht = Mymmo_Forms_I18n::text($form, $lang, 'success_message');
            if ($bericht === '') {
                $bericht = 'Bedankt, we hebben je bericht goed ontvangen.';
            }

            if (($form['success_mode'] ?? 'message') === 'redirect' && !empty($form['redirect_url'])) {
                // wp_validate_redirect() zou een externe URL naar home_url()
                // sturen, en juist een externe bedankpagina is een geldige keuze
                // in de OM. Daarom esc_url_raw() met een expliciete https-eis;
                // die eis staat ook al in de validatie aan de OM-kant.
                $doel = esc_url_raw((string) $form['redirect_url']);
                if ($doel !== '' && str_starts_with($doel, 'https://')) {
                    wp_redirect($doel);
                    exit;
                }
            }

            self::finish($redirect, $slug, 'success', $bericht);
        }

        // Bij een fout gaan de ingevulde waarden mee terug, zodat de bezoeker
        // niet alles opnieuw moet typen. Ze staan in een transient, niet in de
        // URL.
        self::finish($redirect, $slug, 'error', $resultaat['error'], $values);
    }

    /**
     * De taal waarin de bezoeker het formulier voor zich had.
     *
     * Uit het verborgen veld dat de pagina meestuurde, en alleen als het
     * formulier die taal ook echt heeft. Dit komt van buiten: zonder die
     * controle kan iemand een willekeurige string als meta_lang naar Odoo
     * duwen.
     *
     * @param array<string,mixed>|null $form
     */
    private static function taal(?array $form): string {
        $gevraagd = isset($_POST['mymmo_lang']) ? sanitize_key(wp_unslash($_POST['mymmo_lang'])) : '';

        if (!is_array($form)) {
            return $gevraagd !== '' ? $gevraagd : 'nl';
        }

        $talen = Mymmo_Forms_I18n::languages($form);
        if ($gevraagd !== '' && in_array($gevraagd, $talen, true)) {
            return $gevraagd;
        }

        return Mymmo_Forms_I18n::default_language($form);
    }

    /**
     * Herkomst. De site zelf wordt NIET meegestuurd: die leidt de Operations
     * Manager af uit de sitesleutel, zodat een site niet kan beweren dat ze een
     * andere is.
     *
     * @return array<string,string>
     */
    private static function meta(string $redirect, string $lang): array {
        $meta = [
            'page_url'     => $redirect,
            'submitted_at' => gmdate('c'),
            // In welke taal de bezoeker het formulier voor zich had. Komt als
            // meta_lang in de payload en is dus mapbaar naar Odoo: een
            // Franstalige lead hoort een Franstalige opvolging te krijgen.
            'lang'         => $lang,
        ];

        // De bezoeker-UUID uit de cookie die het tracking-script zet. BEWUST
        // hier en niet als verborgen veld met JavaScript: die cookie wordt bij
        // elk verzoek naar admin-post.php gewoon meegestuurd, dus dit werkt ook
        // zonder JavaScript en kan niet stukgaan op een gecachete pagina waarin
        // de UUID van de VORIGE bezoeker gebakken zou zitten.
        //
        // Beide mogen ontbreken. Het tracking-script zet geen cookie voor wie
        // het als bot herkent, en ook niet in een browser zonder plugins of
        // taalinstelling -- daar zitten echte mensen tussen.
        foreach (['ovme_uuid', 'ovme_ref_uuid'] as $sleutel) {
            if (!empty($_COOKIE[$sleutel])) {
                $waarde = sanitize_text_field(wp_unslash($_COOKIE[$sleutel]));
                // Een UUID en niets anders: deze waarde komt uit een cookie en
                // die kan iemand zelf zetten. Ze gaat naar Odoo, dus alles wat
                // er niet uitziet als een UUID gooien we weg.
                if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $waarde)) {
                    $meta[$sleutel] = strtolower($waarde);
                }
            }
        }

        $titel = isset($_POST['mymmo_page_title']) ? sanitize_text_field(wp_unslash($_POST['mymmo_page_title'])) : '';
        if ($titel !== '') {
            $meta['page_title'] = $titel;
        }

        $referrer = wp_get_referer();
        if (is_string($referrer) && $referrer !== '') {
            $meta['referrer'] = $referrer;
        }

        // UTM's: eerst uit het formulier (die komen uit de URL van DEZE pagina),
        // anders uit de cookie die het tracking-script dertig dagen bewaart. Zo
        // houdt iemand die vorige week via een campagne binnenkwam en vandaag
        // pas invult, toch zijn herkomst.
        foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $sleutel) {
            if (!empty($_POST[$sleutel])) {
                $meta[$sleutel] = sanitize_text_field(wp_unslash($_POST[$sleutel]));
            } elseif (!empty($_COOKIE[$sleutel])) {
                $meta[$sleutel] = sanitize_text_field(wp_unslash($_COOKIE[$sleutel]));
            }
        }

        return $meta;
    }

    /**
     * @param array<string,mixed> $values
     */
    private static function finish(string $redirect, string $slug, string $status, string $message, array $values = []): void {
        $token = wp_generate_password(16, false, false);
        set_transient(
            self::TRANSIENT_PREFIX . $token,
            ['status' => $status, 'message' => $message, 'values' => $values, 'slug' => $slug],
            300
        );

        wp_safe_redirect(add_query_arg('mymmo_form', $token, $redirect) . '#mymmo-form-' . $slug);
        exit;
    }
}
