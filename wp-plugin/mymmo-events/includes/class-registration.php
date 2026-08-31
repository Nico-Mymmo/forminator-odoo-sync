<?php
/**
 * Inschrijvingen.
 *
 * De browser post naar admin-post.php, en PHP praat met de API. Daardoor
 * blijft de sitesleutel serverside — die hoort niet in de HTML.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Registration {

    private const ACTION = 'mymmo_events_register';
    private const TRANSIENT_PREFIX = 'mymmo_ev_reg_';

    public static function init(): void {
        add_action('admin_post_nopriv_' . self::ACTION, [self::class, 'handle']);
        add_action('admin_post_' . self::ACTION, [self::class, 'handle']);
    }

    /**
     * Het resultaat van een net verstuurde inschrijving, om na de redirect
     * te tonen. Een transient met een token in de URL, zodat er geen
     * gegevens in de querystring staan.
     *
     * @return array{status:string,message:string,name:string}|null
     */
    public static function flash(): ?array {
        $token = isset($_GET['mymmo_reg']) ? sanitize_key(wp_unslash($_GET['mymmo_reg'])) : '';
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

    public static function action_url(): string {
        return admin_url('admin-post.php');
    }

    public static function action_name(): string {
        return self::ACTION;
    }

    public static function handle(): void {
        $slug = isset($_POST['event_slug']) ? sanitize_title(wp_unslash($_POST['event_slug'])) : '';
        $redirect = isset($_POST['redirect_to']) ? wp_unslash($_POST['redirect_to']) : home_url('/');
        $redirect = wp_validate_redirect($redirect, home_url('/'));

        if ($slug === '' || !isset($_POST['_wpnonce']) || !wp_verify_nonce($_POST['_wpnonce'], self::ACTION . '_' . $slug)) {
            self::finish($redirect, 'error', 'De pagina was verlopen. Probeer het opnieuw.');
        }

        // Honeypot: een bot vult dit veld, een mens ziet het niet.
        if (!empty($_POST['mymmo_website'])) {
            self::finish($redirect, 'error', 'De inschrijving kon niet verwerkt worden.');
        }

        $first_name = sanitize_text_field(wp_unslash($_POST['first_name'] ?? ''));
        $last_name = sanitize_text_field(wp_unslash($_POST['last_name'] ?? ''));
        $email = sanitize_email(wp_unslash($_POST['email'] ?? ''));
        $phone = sanitize_text_field(wp_unslash($_POST['phone'] ?? ''));
        $company = sanitize_text_field(wp_unslash($_POST['company'] ?? ''));
        $questions = sanitize_textarea_field(wp_unslash($_POST['questions'] ?? ''));
        $consent = !empty($_POST['consent']);

        if ($first_name === '') {
            self::finish($redirect, 'error', 'Vul je voornaam in.');
        }
        if ($email === '' || !is_email($email)) {
            self::finish($redirect, 'error', 'Vul een geldig e-mailadres in.');
        }

        $result = Mymmo_Events_Api_Client::register($slug, [
            'first_name' => $first_name,
            'last_name' => $last_name,
            'email' => $email,
            'phone' => $phone,
            'company' => $company,
            'questions' => $questions,
            'consent' => $consent,
            'source' => 'public_form',
            'utm' => self::utm(),
        ]);

        if ($result['ok']) {
            self::finish(
                $redirect,
                'success',
                'Je inschrijving is bevestigd. Je krijgt de details per e-mail.',
                $first_name
            );
        }

        self::finish($redirect, 'error', (string) $result['error'], $first_name);
    }

    /** @return array<string,string> */
    private static function utm(): array {
        $utm = [];
        foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $key) {
            if (!empty($_POST[$key])) {
                $utm[$key] = sanitize_text_field(wp_unslash($_POST[$key]));
            }
        }
        return $utm;
    }

    private static function finish(string $redirect, string $status, string $message, string $name = ''): void {
        $token = wp_generate_password(16, false, false);
        set_transient(
            self::TRANSIENT_PREFIX . $token,
            ['status' => $status, 'message' => $message, 'name' => $name],
            300
        );

        wp_safe_redirect(add_query_arg('mymmo_reg', $token, $redirect) . '#mymmo-inschrijven');
        exit;
    }
}
