<?php
/**
 * DE PRODUCTFEATURE-HEADER: dezelfde feature uit de Operations Manager als het
 * blok Productfeature, maar als HEADER bovenaan een pagina. Drie indelingen:
 *
 *   gecentreerd -- label, kop, uitleg en knoppen gecentreerd, het beeld er
 *                  paginabreed onder (zoals openvme.be/functies/communicatie);
 *   naast       -- tekst links, beeld rechts (of omgekeerd);
 *   vlak        -- een afgerond vlak in een kleur van het palet, met een swirl
 *                  erachter, en het beeld ernaast als je dat wil.
 *
 * DE TEKST KOMT UIT DE OM (label, header, korte uitleg, beeld), net als bij
 * Mymmo_Cards_Productfeature: dezelfde verstuurde versie, dezelfde cache,
 * dezelfde verbinding. DE KNOPPEN zijn gewone core-blokken IN het blok
 * (core/buttons, ook de knop die een venster opent, en een alinea zoals
 * "12 maanden gratis"): die verschillen per pagina, dus ze horen niet in de OM.
 *
 * DE KOP IS STANDAARD EEN H1. Dat is de enige uitzondering op "geen h1 in een
 * component" (regelboek), goedgekeurd door Nico op 2026-10-22: een header IS
 * de kop van de pagina. Kop 2 blijft een keuze, voor een pagina waar het thema
 * zelf al een h1 zet.
 *
 * DE SWIRL is een SVG uit de Asset Manager (brand/swirls/), gekozen uit een
 * lijst die de OM geeft. Geen omkleuren: een masker op een SVG van een andere
 * oorsprong vraagt CORS, en die geeft /assets/ niet. Elk kleurbestand is dus
 * een eigen keuze. Enkel adressen in die map worden aanvaard (swirl_url()).
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Productfeature_Header {

    public const BLOK = 'mymmo/productfeature-header';

    private const NS        = 'mymmo-cards/v1';
    private const SWIRL_TTL = 3600;

    public static function init(): void {
        add_action('init', [self::class, 'register']);
        add_action('enqueue_block_assets', [self::class, 'assets']);
        add_action('rest_api_init', [self::class, 'routes']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gesloten lijsten
    // ─────────────────────────────────────────────────────────────────────────

    /** @return array<string,string> */
    public static function indelingen(): array {
        return [
            'gecentreerd' => 'Gecentreerd, beeld paginabreed eronder',
            'naast'       => 'Tekst en beeld naast elkaar',
            'vlak'        => 'Gekleurd vlak met swirl',
        ];
    }

    /** @return array<string,string> */
    public static function kanten(): array {
        return [
            'rechts' => 'Beeld rechts',
            'links'  => 'Beeld links',
        ];
    }

    /** @return array<string,string> */
    public static function koppen(): array {
        return [
            'h1' => 'Kop 1 (de kop van de pagina)',
            'h2' => 'Kop 2',
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registratie
    // ─────────────────────────────────────────────────────────────────────────

    public static function register(): void {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_style('mymmo-productfeature-header', MYMMO_CARDS_URL . 'assets/css/mymmo-productfeature-header.css', [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION);

        wp_register_script(
            'mymmo-productfeature-header-editor',
            MYMMO_CARDS_URL . 'assets/js/mymmo-productfeature-header-editor.js',
            ['wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-api-fetch'],
            MYMMO_CARDS_VERSION,
            true
        );

        wp_localize_script('mymmo-productfeature-header-editor', 'MymmoProductfeatureHeader', [
            'indelingen' => self::keuzes(self::indelingen()),
            'kanten'     => self::keuzes(self::kanten()),
            'koppen'     => self::keuzes(self::koppen()),
            'vormen'     => self::keuzes(Mymmo_Cards_Productfeature::vormen()),
            'om'         => Mymmo_Cards_Productfeature::om_adres(),
        ]);

        register_block_type(self::BLOK, [
            'api_version'     => 2,
            'editor_script'   => 'mymmo-productfeature-header-editor',
            'style'           => 'mymmo-productfeature-header',
            'attributes'      => self::attributen(),
            'render_callback' => [self::class, 'render'],
        ]);
    }

    /**
     * De attributen staan hier ÉN in mymmo-productfeature-header-editor.js
     * (geen bouwstap). De namen hier zijn leidend.
     *
     * @return array<string,array<string,mixed>>
     */
    public static function attributen(): array {
        return [
            'align'       => ['type' => 'string', 'default' => 'wide'],
            'featureId'   => ['type' => 'string', 'default' => ''],
            'indeling'    => ['type' => 'string', 'default' => 'naast'],
            'kant'        => ['type' => 'string', 'default' => 'rechts'],
            'kop'         => ['type' => 'string', 'default' => 'h1'],
            'vorm'        => ['type' => 'string', 'default' => ''],
            'toonLabel'   => ['type' => 'boolean', 'default' => true],
            'toonKort'    => ['type' => 'boolean', 'default' => true],
            'toonBeeld'   => ['type' => 'boolean', 'default' => true],
            // Een kleur uit het palet (slug). Leeg = het vlak van de huisstijl.
            'achtergrond' => ['type' => 'string', 'default' => ''],
            // Het adres van een SVG in brand/swirls/ van de Asset Manager. Leeg = geen.
            'swirl'       => ['type' => 'string', 'default' => ''],
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REST: de feature en de swirls voor de editor
    // ─────────────────────────────────────────────────────────────────────────

    public static function routes(): void {
        $mag = static function (): bool {
            return current_user_can('edit_posts');
        };

        // De feature zoals de site ze bewaart: de editor tekent er de header mee.
        register_rest_route(self::NS, '/productfeature/(?P<id>[a-zA-Z0-9-]{1,64})', [
            'methods'             => 'GET',
            'permission_callback' => $mag,
            'callback'            => static function (WP_REST_Request $r): WP_REST_Response {
                $f = Mymmo_Cards_Productfeature::feature((string) $r['id']);
                return $f === null
                    ? new WP_REST_Response(['fout' => 'Deze feature staat niet (meer) op de sites.'], 404)
                    : new WP_REST_Response($f);
            },
        ]);

        register_rest_route(self::NS, '/swirls', [
            'methods'             => 'GET',
            'permission_callback' => $mag,
            'callback'            => static function (): WP_REST_Response {
                return new WP_REST_Response(self::swirls());
            },
        ]);
    }

    /** @return array<int,array{label:string,url:string}> */
    private static function swirls(): array {
        $kort = get_transient('mymmo_pf_swirls');
        if (is_array($kort)) {
            return $kort;
        }
        if (!Mymmo_Cards_Productfeature::verbonden()) {
            return [];
        }
        $antwoord = wp_remote_get(Mymmo_Cards_Productfeature::api_basis() . Mymmo_Cards_Productfeature::PAD . '/swirls', [
            'timeout' => 5,
            'headers' => ['X-Mymmo-Site-Key' => Mymmo_Cards_Productfeature::sleutel(), 'Accept' => 'application/json'],
        ]);
        if (is_wp_error($antwoord) || (int) wp_remote_retrieve_response_code($antwoord) !== 200) {
            return [];
        }
        $body = json_decode((string) wp_remote_retrieve_body($antwoord), true);
        $uit  = [];
        foreach ((is_array($body['data'] ?? null) ? $body['data'] : []) as $s) {
            $url = self::swirl_url((string) ($s['url'] ?? ''));
            if ($url !== '') {
                $uit[] = ['label' => sanitize_text_field((string) ($s['label'] ?? '')), 'url' => $url];
            }
        }
        set_transient('mymmo_pf_swirls', $uit, self::SWIRL_TTL);
        return $uit;
    }

    /** Enkel een SVG in brand/swirls/ van de Asset Manager; anders ''. */
    public static function swirl_url(string $ruw): string {
        $url = trim($ruw);
        return preg_match('#^https://[a-z0-9.-]+/assets/brand/swirls/[A-Za-z0-9._-]+\.svg$#', $url) ? esc_url_raw($url) : '';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    private static function melding(string $tekst): string {
        if (!(defined('REST_REQUEST') && REST_REQUEST) || !current_user_can('edit_posts')) {
            return '';
        }
        return '<div class="mymmo-pf-melding"><p>' . esc_html($tekst) . '</p></div>';
    }

    /**
     * @param array<string,mixed> $attrs
     * @param mixed               $block
     */
    public static function render($attrs = [], string $content = '', $block = null): string {
        $attrs = is_array($attrs) ? $attrs : [];
        $id    = (string) ($attrs['featureId'] ?? '');
        if ($id === '') {
            return self::melding('Kies rechts welke productfeature deze header toont.');
        }
        $f = Mymmo_Cards_Productfeature::feature($id);
        if ($f === null) {
            return self::melding('Deze feature staat niet (meer) op de sites. Stuur ze in de Operations Manager opnieuw naar de sites, of kies een andere.');
        }

        $standaard = self::attributen();
        $toon = static function (string $k) use ($attrs, $standaard): bool {
            return (bool) ($attrs[$k] ?? $standaard[$k]['default']);
        };

        $indeling = mymmo_cards_keuze((string) ($attrs['indeling'] ?? ''), self::indelingen(), 'naast');
        $kant     = mymmo_cards_keuze((string) ($attrs['kant'] ?? ''), self::kanten(), 'rechts');
        $kop      = mymmo_cards_keuze((string) ($attrs['kop'] ?? ''), self::koppen(), 'h1');
        $vorm     = (string) ($attrs['vorm'] ?? '');
        $titel    = trim((string) ($f['header'] ?? '')) !== '' ? trim((string) $f['header']) : (string) ($f['name'] ?? '');

        $beeld = '';
        if ($toon('toonBeeld')) {
            $varianten = is_array($f['beelden'] ?? null) ? $f['beelden'] : [];
            $src       = $vorm !== '' && isset(Mymmo_Cards_Productfeature::vormen()[$vorm]) && !empty($varianten[$vorm]) ? (string) $varianten[$vorm] : (string) ($f['image_url'] ?? '');
            $src       = esc_url($src);
            if ($src !== '') {
                // De kop staat er al: het beeld zegt niets nieuws voor een schermlezer.
                $beeld = '<div class="mymmo-pfh-beeld">'
                    . '<img class="mymmo-pfh-img skip-lazy no-lazyload" data-no-lazy="1" data-skip-lazy="1" loading="eager" fetchpriority="high" decoding="async"'
                    . ' src="' . $src . '" alt="">'
                    . '</div>';
            }
        }

        $tekst = '';
        if ($toon('toonLabel') && !empty($f['eyebrow'])) {
            $tekst .= '<p class="mymmo-pfh-label has-small-font-size">' . esc_html((string) $f['eyebrow']) . '</p>';
        }
        if ($titel !== '') {
            $tekst .= '<' . $kop . ' class="wp-block-heading mymmo-pfh-titel">' . esc_html($titel) . '</' . $kop . '>';
        }
        if ($toon('toonKort') && !empty($f['summary'])) {
            foreach (preg_split('/\n{2,}/', trim((string) $f['summary'])) ?: [] as $alinea) {
                if (trim($alinea) !== '') {
                    $tekst .= '<p class="mymmo-pfh-kort">' . nl2br(esc_html(trim($alinea))) . '</p>';
                }
            }
        }
        if (mymmo_cards_heeft_inhoud($content)) {
            $tekst .= '<div class="mymmo-pfh-extra">' . $content . '</div>';
        }

        $klassen = ['mymmo-pfh', 'mymmo-pfh--' . $indeling, 'mymmo-pfh--beeld-' . $kant];
        $klassen[] = $beeld !== '' ? 'mymmo-pfh--met-beeld' : 'mymmo-pfh--zonder-beeld';
        $uitlijning = (string) ($attrs['align'] ?? '');
        if (in_array($uitlijning, ['full', 'wide'], true)) {
            // Een dynamisch blok zet zijn uitlijnklasse zelf -- zie render_stapel() in class-blocks.php.
            $klassen[] = 'align' . $uitlijning;
        }

        $stijl = [];
        $swirl = '';
        if ($indeling === 'vlak') {
            $bg = mymmo_cards_color((string) ($attrs['achtergrond'] ?? ''));
            if ($bg !== '') {
                $stijl[] = '--mk-pfh-bg:' . $bg;
            }
            $s = self::swirl_url((string) ($attrs['swirl'] ?? ''));
            if ($s !== '') {
                $stijl[] = '--mk-pfh-swirl:url(' . $s . ')';
                $swirl = '<span class="mymmo-pfh-swirl" aria-hidden="true"></span>';
            }
        }

        $extra = ['class' => implode(' ', $klassen), 'data-mymmo-feature' => $id];
        if ($stijl) {
            $extra['style'] = implode(';', $stijl);
        }

        return '<div ' . self::wikkel($extra) . '>'
            . $swirl
            . '<div class="mymmo-pfh-tekst">' . $tekst . '</div>'
            . $beeld
            . '</div>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gereedschap
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string,string> $lijst
     * @return array<int,array{value:string,label:string}>
     */
    private static function keuzes(array $lijst): array {
        $uit = [];
        foreach ($lijst as $sleutel => $label) {
            $uit[] = ['value' => (string) $sleutel, 'label' => $label];
        }
        return $uit;
    }

    /** @param array<string,string> $extra */
    private static function wikkel(array $extra): string {
        if (function_exists('get_block_wrapper_attributes')) {
            return get_block_wrapper_attributes($extra);
        }
        $uit = [];
        foreach ($extra as $naam => $waarde) {
            if ($waarde !== '') {
                $uit[] = $naam . '="' . esc_attr($waarde) . '"';
            }
        }
        return implode(' ', $uit);
    }

    /** De stylesheet ook in de editor -- zie Mymmo_Cards_Blocks::assets(). */
    public static function assets(): void {
        if (!is_admin()) {
            return;
        }
        wp_enqueue_style('mymmo-productfeature-header');
        wp_enqueue_style('mymmo-productfeature');
    }
}
