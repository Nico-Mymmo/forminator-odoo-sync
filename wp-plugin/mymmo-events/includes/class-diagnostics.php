<?php
/**
 * Diagnostiek: wat de WordPress-kern-API niet geeft.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Op de vraag "waarom worden onze plugins telkens uitgeschakeld?" is in de
 * kern-REST-API geen antwoord te vinden. `/wp/v2/plugins` toont wél welke
 * plugin nu uit staat, maar niet:
 *
 *   - of WordPress hem zelf GEPAUZEERD heeft (de fatal-error-bescherming uit
 *     5.2, `wp_paused_plugins()`), en met welke fout;
 *   - wanneer `active_plugins` voor het laatst wijzigde, wat er precies
 *     bijkwam of wegviel, en langs welke weg (wp-admin, REST, WP-CLI, cron);
 *   - hoeveel er bij elk verzoek uit de options-tabel geladen wordt
 *     (autoload) -- een veelvoorkomende oorzaak van fatals die met geen
 *     enkele plugin in het bijzonder te maken hebben;
 *   - de laatste fatals uit `debug.log`.
 *
 * ALLEEN LEZEN, ALLEEN VOOR BEHEERDERS
 * ------------------------------------
 * Eén GET, met `manage_options` als voorwaarde -- dus dezelfde rechten die
 * je nodig hebt om in wp-admin naar dezelfde informatie te kijken. Er wordt
 * niets gewijzigd en niets uitgevoerd.
 *
 * Het bijhouden van wijzigingen aan `active_plugins` is de enige plek waar
 * dit bestand wél schrijft: één regel in een eigen option (autoload uit),
 * bij elke wijziging. Zonder die vastlegging is achteraf niet meer te zien
 * wanneer of waardoor een plugin uitviel -- WordPress bewaart dat nergens.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Events_Diagnostics {

    private const LOG_OPTION = 'mymmo_events_plugin_changes';
    private const MAX_ENTRIES = 30;

    /** Hoeveel van debug.log we achteraan lezen. Nooit het hele bestand. */
    private const LOG_TAIL_BYTES = 262144;

    public static function init(): void {
        // Vastleggen wanneer active_plugins wijzigt. `pre_update_option` geeft
        // de oude EN de nieuwe waarde, dus hier is het verschil te zien --
        // achteraf is dat niet meer te reconstrueren.
        add_filter('pre_update_option_active_plugins', [self::class, 'record_change'], 10, 2);
    }

    /**
     * @param mixed $new
     * @param mixed $old
     * @return mixed de nieuwe waarde, ongewijzigd
     */
    public static function record_change($new, $old) {
        $new_list = is_array($new) ? $new : [];
        $old_list = is_array($old) ? $old : [];

        $added = array_values(array_diff($new_list, $old_list));
        $removed = array_values(array_diff($old_list, $new_list));

        if ($added === [] && $removed === []) {
            return $new;
        }

        $entry = [
            'at' => gmdate('c'),
            'added' => $added,
            'removed' => $removed,
            'via' => self::request_context(),
            'user' => self::current_user_label(),
            'ip' => self::client_ip(),
        ];

        $log = get_option(self::LOG_OPTION, []);
        $log = is_array($log) ? $log : [];
        $log[] = $entry;
        if (count($log) > self::MAX_ENTRIES) {
            $log = array_slice($log, -self::MAX_ENTRIES);
        }
        update_option(self::LOG_OPTION, $log, false);

        return $new;
    }

    /** Langs welke weg kwam dit verzoek binnen? */
    private static function request_context(): string {
        if (defined('WP_CLI') && WP_CLI) {
            return 'wp-cli';
        }
        if (defined('DOING_CRON') && DOING_CRON) {
            return 'cron';
        }
        if (defined('REST_REQUEST') && REST_REQUEST) {
            return 'rest-api';
        }
        if (is_admin()) {
            $script = isset($_SERVER['SCRIPT_NAME']) ? basename((string) $_SERVER['SCRIPT_NAME']) : 'wp-admin';
            return 'wp-admin (' . $script . ')';
        }
        return 'frontend';
    }

    private static function current_user_label(): string {
        if (!function_exists('wp_get_current_user')) {
            return 'onbekend';
        }
        $user = wp_get_current_user();
        return ($user && $user->ID) ? $user->user_login . ' (#' . $user->ID . ')' : 'niet ingelogd';
    }

    private static function client_ip(): string {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
        // Alleen het netwerkdeel bewaren: voor "kwam dit van bij ons of van
        // buiten" volstaat dat, en het is geen volledig adres in de database.
        return $ip === '' ? 'onbekend' : preg_replace('/\.\d+$/', '.x', $ip);
    }

    // ─── Het REST-antwoord ──────────────────────────────────────────────────

    /** @return array<string,mixed> */
    public static function report(): array {
        return [
            'site' => [
                'url' => home_url(),
                'wp_version' => get_bloginfo('version'),
                'php_version' => PHP_VERSION,
                'memory_limit' => ini_get('memory_limit'),
                'wp_memory_limit' => defined('WP_MEMORY_LIMIT') ? WP_MEMORY_LIMIT : null,
                'debug' => defined('WP_DEBUG') && WP_DEBUG,
                'debug_log' => defined('WP_DEBUG_LOG') ? WP_DEBUG_LOG : false,
                'mymmo_events_version' => defined('MYMMO_EVENTS_VERSION') ? MYMMO_EVENTS_VERSION : null,
            ],
            'paused_plugins' => self::paused(),
            'autoload' => self::autoload(),
            'active_plugins_changes' => self::changes(),
            'active_plugins_changed_at' => self::last_change(),
            'recent_fatals' => self::fatals(),
        ];
    }

    /**
     * Plugins die WordPress zelf gepauzeerd heeft na een fatal error.
     * Dit is de enige plek waar dat te zien is: het staat niet in
     * /wp/v2/plugins en een gepauzeerde plugin lijkt daar gewoon actief.
     *
     * @return array<string,mixed>
     */
    private static function paused(): array {
        if (!function_exists('wp_paused_plugins')) {
            return ['supported' => false];
        }

        $all = wp_paused_plugins()->get_all();
        $out = [];
        foreach (is_array($all) ? $all : [] as $plugin => $error) {
            $out[] = [
                'plugin' => $plugin,
                'type' => $error['type'] ?? null,
                'message' => $error['message'] ?? null,
                'file' => $error['file'] ?? null,
                'line' => $error['line'] ?? null,
            ];
        }

        return ['supported' => true, 'count' => count($out), 'plugins' => $out];
    }

    /**
     * Hoeveel wordt er bij ELK verzoek uit de options-tabel geladen?
     *
     * Boven ongeveer 1 MB is dit een echte oorzaak van fatals: het geheugen
     * loopt vol op verzoeken die niets met de "schuldige" plugin te maken
     * hebben. De tien grootste staan erbij, want daarmee is het meestal in
     * één oogopslag duidelijk welke plugin het doet.
     *
     * @return array<string,mixed>
     */
    private static function autoload(): array {
        global $wpdb;

        // WordPress 6.6 veranderde de waarden van autoload ('yes'/'no' werd
        // 'on'/'off'/'auto'/'auto-on'/'auto-off'). Daarom NOT IN op de
        // negatieve waarden in plaats van = op de positieve.
        $where = "autoload NOT IN ('no', 'off', 'auto-off')";

        $totals = $wpdb->get_row(
            "SELECT COUNT(*) AS aantal, SUM(LENGTH(option_value)) AS bytes FROM {$wpdb->options} WHERE {$where}",
            ARRAY_A
        );

        $largest = $wpdb->get_results(
            "SELECT option_name, LENGTH(option_value) AS bytes FROM {$wpdb->options}
             WHERE {$where} ORDER BY bytes DESC LIMIT 10",
            ARRAY_A
        );

        $bytes = (int) ($totals['bytes'] ?? 0);

        return [
            'count' => (int) ($totals['aantal'] ?? 0),
            'bytes' => $bytes,
            'human' => size_format($bytes, 1),
            // Cloudflare-achtige vuistregel: onder 800 KB zit je goed, boven
            // 1 MB is het een probleem dat zich als willekeurige fatals uit.
            'verdict' => $bytes > 1048576 ? 'te groot' : ($bytes > 819200 ? 'aan de hoge kant' : 'in orde'),
            'largest' => $largest ?: [],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function changes(): array {
        $log = get_option(self::LOG_OPTION, []);
        return is_array($log) ? array_reverse($log) : [];
    }

    private static function last_change(): ?string {
        $log = self::changes();
        return $log === [] ? null : (string) ($log[0]['at'] ?? null);
    }

    /**
     * De laatste fatals uit debug.log.
     *
     * Alleen de staart van het bestand wordt gelezen: een debug.log van
     * honderden megabytes is geen uitzondering, en die volledig inlezen zou
     * precies het geheugenprobleem veroorzaken dat we hier onderzoeken.
     *
     * @return array<string,mixed>
     */
    private static function fatals(): array {
        $path = WP_CONTENT_DIR . '/debug.log';

        if (!is_readable($path)) {
            return ['available' => false, 'reason' => 'debug.log bestaat niet of is niet leesbaar'];
        }

        $size = (int) filesize($path);
        $handle = @fopen($path, 'rb');
        if (!$handle) {
            return ['available' => false, 'reason' => 'debug.log kon niet geopend worden'];
        }

        if ($size > self::LOG_TAIL_BYTES) {
            fseek($handle, -self::LOG_TAIL_BYTES, SEEK_END);
            fgets($handle); // de half afgekapte eerste regel weggooien
        }

        $lines = [];
        while (($line = fgets($handle)) !== false) {
            if (stripos($line, 'PHP Fatal') !== false || stripos($line, 'Uncaught') !== false) {
                $lines[] = trim($line);
            }
        }
        fclose($handle);

        return [
            'available' => true,
            'log_bytes' => $size,
            'log_human' => size_format($size, 1),
            'count_in_tail' => count($lines),
            // De laatste vijftien: meer helpt niet, en een fatal die zich
            // duizend keer herhaalt zou het antwoord onleesbaar maken.
            'latest' => array_slice($lines, -15),
        ];
    }
}
