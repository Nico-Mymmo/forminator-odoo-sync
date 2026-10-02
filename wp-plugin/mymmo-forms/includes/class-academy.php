<?php
/**
 * De academy (openvme-cursus) achter een formulier van de Operations Manager.
 *
 * WAT HET VERVANGT. Op syndicoach.be stond een met de hand geschreven script in
 * de kop van elke pagina: een eigen pop-up met een e-mailveld en een vinkje,
 * een controle tegen een externe dienst, een cookie met het kale adres, en een
 * iframe met `?email=<adres>`. Dat adres in de link was meteen het lek: de
 * academy liet iedereen andermans voortgang zien op een adres alleen.
 *
 * HOE HET NU GAAT.
 *  1. Een knop (blok "Mymmo academy-knop", of een oud element met de klasse
 *     `ovme-exit-cursus`) opent het venster van een OPSTELLING, met het
 *     formulier dat de marketeer in Koppelingen bouwde ("Telt in Webgedrag als:
 *     Academy").
 *  2. Na het versturen geeft de OM een ONDERTEKEND inlogbewijs mee (zie
 *     src/lib/academy-token.js in de OM). De browser bewaart het, sluit het
 *     venster en opent de academy met `#t=<bewijs>`.
 *  3. De volgende keer opent de knop de academy meteen. Is het bewijs vervallen,
 *     dan meldt de academy dat (`ovme_login_needed`) en verschijnt het formulier
 *     opnieuw. De academy toont zelf geen e-mailvenster meer (`?gate=parent`).
 *
 * De bezoeker telt als "academy" in Webgedrag, zonder apart script: het is een
 * gewone inzending, en die meldt de OM zelf aan de tracker.
 *
 * Het venster staat in de VOETTEKST van elke pagina zodra de academy ingesteld
 * is -- de oude knoppen staan in menu's en sjablonen, niet alleen in blokken.
 * Wie aangemeld is, staat enkel in de browser: de HTML is voor iedereen gelijk,
 * zodat de paginacache blijft werken.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Academy {

    public const OPTION = 'mymmo_forms_academy';
    private const GROUP = 'mymmo_forms_academy';
    private const PAGE  = 'mymmo-forms-academy';
    private const BLOK  = 'mymmo/academy';
    private const CATALOGUS_CACHE = 'mymmo_forms_academy_catalogus';

    /** Wat een academy-knop is. De oude klasse blijft werken. */
    public const KNOPPEN = '.ovme-exit-cursus, [data-mymmo-academy]';
    /** Wat het venster opent: de knoppen + de verborgen knop voor een vervallen bewijs. */
    private const TRIGGER = '.ovme-exit-cursus, [data-mymmo-academy], [data-mymmo-academy-intern]';

    public static function init(): void {
        add_action('admin_menu', [self::class, 'menu']);
        add_action('admin_init', [self::class, 'register_settings']);
        add_action('init', [self::class, 'register_block']);
        add_action('enqueue_block_editor_assets', [self::class, 'editor_data']);
        add_action('wp_footer', [self::class, 'render_footer'], 5);
    }

    /**
     * Het venster is een OPSTELLING uit de pop-upbouwer (Instellingen → Mymmo
     * Forms → Popups). Titel, uitleg, tekening en formulier stel je DAAR in, met
     * het voorbeeld ernaast -- niet hier. Dit scherm zegt enkel welke opstelling
     * de academy gebruikt. Een kaal formulier (`slug`, uit 1.20.1) blijft werken
     * zolang er geen opstelling gekozen is.
     *
     * @return array{url:string,preset:string,slug:string}
     */
    public static function settings(): array {
        $ruw = get_option(self::OPTION, []);
        $ruw = is_array($ruw) ? $ruw : [];
        return [
            'url'    => (string) ($ruw['url'] ?? 'https://openvme-cursus.lovable.app'),
            'preset' => (string) ($ruw['preset'] ?? ''),
            'slug'   => (string) ($ruw['slug'] ?? ''),
        ];
    }

    public static function is_configured(): bool {
        $s = self::settings();
        return $s['url'] !== '' && ($s['preset'] !== '' || $s['slug'] !== '');
    }

    /* ── Instellingen ──────────────────────────────────────────────────────── */

    public static function menu(): void {
        add_options_page('Mymmo academy', 'Mymmo academy', 'manage_options', self::PAGE, [self::class, 'render_page']);
    }

    public static function register_settings(): void {
        register_setting(self::GROUP, self::OPTION, [
            'type'              => 'array',
            'sanitize_callback' => [self::class, 'sanitize'],
            'default'           => [],
        ]);
    }

    /**
     * @param mixed $in
     * @return array<string,mixed>
     */
    public static function sanitize($in): array {
        $in  = is_array($in) ? $in : [];
        $url = esc_url_raw(trim((string) ($in['url'] ?? '')));
        // Enkel https: dit adres komt in een iframe op elke pagina.
        if ($url !== '' && !str_starts_with($url, 'https://')) {
            $url = '';
            add_settings_error(self::OPTION, 'url', 'Het adres van de academy moet met https:// beginnen.');
        }
        delete_transient(self::CATALOGUS_CACHE);
        $preset = sanitize_title((string) ($in['preset'] ?? ''));
        return [
            'url'    => untrailingslashit($url),
            'preset' => $preset,
            // Een gekozen opstelling wint; het kale formulier van vroeger valt dan weg.
            'slug'   => $preset !== '' ? '' : sanitize_title((string) ($in['slug'] ?? '')),
        ];
    }

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $s = self::settings();
        $presets = class_exists('Mymmo_Forms_Presets') ? Mymmo_Forms_Presets::all() : [];
        $naam = esc_attr(self::OPTION);
        $cursussen = self::catalogus();
        ?>
        <div class="wrap">
            <h1>Mymmo academy</h1>
            <p style="max-width:720px">
                Een knop naar de academy opent eerst het venster met jullie formulier. Na het versturen
                gaat de bezoeker meteen door naar de academy, en de volgende keer meteen. Zijn voortgang
                komt uit de academy zelf.
            </p>
            <form method="post" action="options.php">
                <?php settings_fields(self::GROUP); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmo-academy-url">Adres van de academy</label></th>
                        <td><input id="mymmo-academy-url" type="url" class="regular-text" name="<?php echo esc_attr(self::OPTION); ?>[url]" value="<?php echo esc_attr($s['url']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo-academy-preset">Popup</label></th>
                        <td>
                            <select id="mymmo-academy-preset" name="<?php echo $naam; ?>[preset]">
                                <option value="">— kies een popup —</option>
                                <?php foreach ($presets as $p) : ?>
                                    <option value="<?php echo esc_attr($p['id']); ?>" <?php selected($s['preset'], $p['id']); ?>><?php echo esc_html($p['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input type="hidden" name="<?php echo $naam; ?>[slug]" value="<?php echo esc_attr($s['slug']); ?>">
                            <p class="description">
                                Maak de popup in <a href="<?php echo esc_url(admin_url('options-general.php?page=mymmo-forms')); ?>">Mymmo Forms → Popups</a>:
                                daar kies je het formulier, en zet je de titel en de uitleg (in het voorbeeld). Het venster opent
                                altijd op het formulier.
                            </p>
                            <p class="description">
                                Het formulier moet in Koppelingen op <strong>Telt in Webgedrag als: Academy</strong> staan,
                                een e-mailveld hebben en actief zijn -- anders komt er geen inlogbewijs terug en blijft de
                                bezoeker op het dankjewelscherm staan.
                            </p>
                            <?php echo self::keten_melding($s); // phpcs:ignore -- ge-escaped in keten_melding() ?>
                            <?php if ($s['preset'] === '' && $s['slug'] !== '') : ?>
                                <p class="description"><strong>Nu nog:</strong> het formulier <code><?php echo esc_html($s['slug']); ?></code> zonder popup. Kies een popup om titel en uitleg zelf te bepalen.</p>
                            <?php endif; ?>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <h2>Knoppen</h2>
            <p style="max-width:720px">
                Gebruik het blok <strong>Mymmo academy-knop</strong> en kies daar of het overzicht of een bepaalde cursus
                opent. Bestaande knoppen met de klasse <code>ovme-exit-cursus</code> (en eventueel
                <code>ovme-cursus-&lt;slug&gt;</code>) blijven werken.
            </p>
            <p style="max-width:720px">
                <strong>Haal het oude script weg</strong> (het blok <code>&lt;!-- OVME CURSUS POPUP --&gt;</code> in de kop
                van de site) zodra dit ingesteld is. Anders openen er bij één klik twee vensters.
            </p>
            <h2>Cursussen in de academy</h2>
            <?php if ($cursussen === null) : ?>
                <p>De lijst kon niet opgehaald worden. Klopt het adres hierboven?</p>
            <?php elseif ($cursussen === []) : ?>
                <p>Er staan nog geen gepubliceerde cursussen in de academy.</p>
            <?php else : ?>
                <ul style="list-style:disc;padding-left:20px">
                    <?php foreach ($cursussen as $c) : ?>
                        <li><?php echo esc_html($c['title']); ?> — <code><?php echo esc_html($c['slug']); ?></code></li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Klopt de keten pop-up -> formulier -> koppeling op "Academy" -> e-mailveld?
     * Elk ontbrekend stuk is een stille fout: de bezoeker blijft dan op een
     * bedankmelding staan in plaats van in de academy te belanden.
     *
     * @param array{url:string,preset:string,slug:string} $s
     */
    private static function keten_melding(array $s): string {
        $slug = $s['slug'];
        if ($s['preset'] !== '' && class_exists('Mymmo_Forms_Presets')) {
            $slug = sanitize_title((string) (Mymmo_Forms_Presets::atts($s['preset'])['slug'] ?? ''));
            if ($slug === '') {
                return self::keten_regel('fout', 'Deze popup heeft geen formulier.');
            }
        }
        if ($slug === '') {
            return '';
        }
        $lijst = class_exists('Mymmo_Forms_Api_Client') ? Mymmo_Forms_Api_Client::list_forms() : null;
        if (!is_array($lijst)) {
            return self::keten_regel('info', 'Formulier: ' . $slug . ' (de OM kon niet nagevraagd worden).');
        }
        foreach ($lijst as $f) {
            if ((string) ($f['slug'] ?? '') !== $slug) {
                continue;
            }
            $naam = mymmo_forms_form_label($f);
            if (!array_key_exists('academy', $f)) {
                return self::keten_regel('info', 'Formulier: ' . $naam . '. (Deze OM zegt nog niet of de koppeling op Academy staat.)');
            }
            if (empty($f['academy'])) {
                return self::keten_regel('fout', 'Formulier: ' . $naam . ' — de koppeling staat NIET op "Telt in Webgedrag als: Academy". Zet dat in Koppelingen, anders opent de academy niet na het verzenden.');
            }
            if (empty($f['has_email'])) {
                return self::keten_regel('fout', 'Formulier: ' . $naam . ' — er staat geen e-mailveld in. Zonder e-mailveld kan niemand aangemeld worden.');
            }
            return self::keten_regel('ok', 'Formulier: ' . $naam . ' — de koppeling staat op Academy en er is een e-mailveld.');
        }
        return self::keten_regel('fout', 'Het formulier "' . $slug . '" staat niet (meer) gepubliceerd in de OM.');
    }

    private static function keten_regel(string $soort, string $tekst): string {
        $kleur = ['ok' => '#00a32a', 'fout' => '#d63638', 'info' => '#646970'][$soort] ?? '#646970';
        $teken = ['ok' => '✓', 'fout' => '✕', 'info' => 'ℹ'][$soort] ?? '';
        return '<p class="description" style="color:' . $kleur . ';font-weight:600">' . esc_html($teken . ' ' . $tekst) . '</p>';
    }

    /**
     * De gepubliceerde cursussen (`/api/catalog` van de academy), vijf minuten
     * bewaard. null = niet op te halen.
     *
     * @return array<int,array{slug:string,title:string}>|null
     */
    public static function catalogus(): ?array {
        $bewaard = get_transient(self::CATALOGUS_CACHE);
        if (is_array($bewaard)) {
            return $bewaard;
        }
        $url = self::settings()['url'];
        if ($url === '') {
            return null;
        }
        $antwoord = wp_remote_get($url . '/api/catalog', ['timeout' => 6, 'headers' => ['Accept' => 'application/json']]);
        if (is_wp_error($antwoord) || (int) wp_remote_retrieve_response_code($antwoord) !== 200) {
            return null;
        }
        $data = json_decode((string) wp_remote_retrieve_body($antwoord), true);
        if (!is_array($data) || !is_array($data['courses'] ?? null)) {
            return null;
        }
        $lijst = [];
        foreach ($data['courses'] as $c) {
            $slug = sanitize_title((string) ($c['slug'] ?? ''));
            if ($slug !== '') {
                $lijst[] = ['slug' => $slug, 'title' => sanitize_text_field((string) ($c['title'] ?? $slug))];
            }
        }
        set_transient(self::CATALOGUS_CACHE, $lijst, 5 * MINUTE_IN_SECONDS);
        return $lijst;
    }

    /* ── Het blok ──────────────────────────────────────────────────────────── */

    public static function register_block(): void {
        if (!function_exists('register_block_type')) {
            return;
        }
        wp_register_script(
            'mymmo-forms-academy-block',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-academy-block.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components'],
            MYMMO_FORMS_VERSION,
            true
        );
        register_block_type(self::BLOK, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-forms-academy-block',
            'attributes'      => [
                'label'  => ['type' => 'string', 'default' => 'Start de cursus'],
                'course' => ['type' => 'string', 'default' => ''],
                'lesson' => ['type' => 'string', 'default' => ''],
            ],
            'render_callback' => [self::class, 'render_block'],
        ]);
    }

    public static function editor_data(): void {
        wp_localize_script('mymmo-forms-academy-block', 'MymmoAcademyBlock', [
            'courses'     => self::catalogus() ?? [],
            'configured'  => self::is_configured(),
            'settingsUrl' => admin_url('options-general.php?page=' . self::PAGE),
        ]);
    }

    /**
     * Een gewone knop van het thema (`wp-block-button__link`), zodat hij eruitziet
     * als elke andere knop op de site. Wat hij opent, staat in data-attributen;
     * het venster zelf staat in de voettekst.
     *
     * @param array<string,mixed> $a
     */
    public static function render_block($a = []): string {
        // De editor bewaart de tekst als RichText (HTML-entiteiten, &nbsp;).
        $label  = trim(wp_strip_all_tags(html_entity_decode((string) ($a['label'] ?? ''), ENT_QUOTES, 'UTF-8'))) ?: 'Start de cursus';
        $course = sanitize_title((string) ($a['course'] ?? ''));
        $lesson = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($a['lesson'] ?? ''));

        $melding = '';
        if (!self::is_configured() && current_user_can('edit_posts')) {
            $melding = '<div class="mymmo-form-notice mymmo-form-notice--admin">De academy is nog niet ingesteld (Instellingen → Mymmo academy). Deze knop doet nog niets.</div>';
        }

        return $melding
            . '<div class="wp-block-buttons mymmo-academy-knoppen"><div class="wp-block-button">'
            . '<a class="wp-block-button__link wp-element-button" href="#" data-mymmo-academy="' . esc_attr($course) . '"'
            . ($lesson !== '' ? ' data-mymmo-academy-les="' . esc_attr($lesson) . '"' : '')
            . '>' . esc_html($label) . '</a></div></div>';
    }

    /* ── Het venster + de academy, in de voettekst ─────────────────────────── */

    public static function render_footer(): void {
        if (is_admin() || !self::is_configured() || !class_exists('Mymmo_Forms_Shortcodes')) {
            return;
        }
        $s = self::settings();

        // Alles van de popup, behalve hoe ze opengaat: dat is de academy-knop.
        $atts = ['button' => 'no', 'trigger' => self::TRIGGER, 'tab' => 'form'];
        if ($s['preset'] !== '') {
            $atts['preset'] = $s['preset'];
        } else {
            $atts['slug'] = $s['slug'];
        }
        $venster = Mymmo_Forms_Shortcodes::render_button($atts);
        if ($venster === '') {
            return;
        }

        wp_enqueue_style('mymmo-forms-academy', MYMMO_FORMS_URL . 'assets/css/mymmo-forms-academy.css', [], MYMMO_FORMS_VERSION);
        wp_enqueue_script('mymmo-forms-academy', MYMMO_FORMS_URL . 'assets/js/mymmo-forms-academy.js', [], MYMMO_FORMS_VERSION, true);
        $deel = wp_parse_url($s['url']);
        wp_localize_script('mymmo-forms-academy', 'MymmoAcademy', [
            'url'     => $s['url'],
            'origin'  => ($deel['scheme'] ?? 'https') . '://' . ($deel['host'] ?? '') . (isset($deel['port']) ? ':' . $deel['port'] : ''),
            'knoppen' => self::KNOPPEN,
            // Zo herkent het script het venster terug, ook als het open staat:
            // een open venster hangt onder <body> (naarBoven() in modal.js) en
            // zit dan niet meer in de wikkel hieronder.
            'trigger' => self::TRIGGER,
        ]);

        echo '<div data-mymmo-academy-form>'
            . $venster // phpcs:ignore -- al ge-escaped door de template van het venster
            . '<button type="button" data-mymmo-academy-intern hidden tabindex="-1">Aanmelden voor de academy</button>'
            . '</div>';
        echo '<div class="mymmo-academy" data-mymmo-academy-frame role="dialog" aria-modal="true" aria-label="Academy" hidden>'
            . '<div class="mymmo-academy-paneel">'
            . '<button type="button" class="mymmo-academy-sluit" data-mymmo-academy-sluit aria-label="Sluiten">✕ sluiten</button>'
            . '<iframe title="Academy" src="about:blank" allow="fullscreen; clipboard-write"></iframe>'
            . '</div></div>';
    }
}
