<?php
/**
 * Stappen: de HTML-brokken die VOOR het formulier komen.
 *
 * Een STAP is een stuk HTML (met eigen CSS en JavaScript) dat een of enkele
 * waarden verzamelt en die doorgeeft aan de VERBORGEN VELDEN van het formulier
 * uit de Operations Manager. De laatste stap is altijd dat formulier zelf, met
 * de zichtbare vragen (naam, e-mail) en de verborgen velden die de stappen
 * ervoor gevuld hebben.
 *
 *   [mymmo_form slug="offerte" steps="aantal-gebouwen,behoeften"]
 *
 * WAAROM DIT IN WORDPRESS STAAT EN NIET IN DE OM
 * ----------------------------------------------
 * De OM serveert hetzelfde formulier aan MEERDERE sites. Daarom gaat het
 * `theme`-veld daar door een gesloten lijst: vrije CSS vanuit de OM zou een
 * injectiepad zijn naar elke site die het formulier toont. Vrije JavaScript is
 * dat in nog sterkere mate -- een stap kan alles wat de pagina kan.
 *
 * Die vrijheid hoort dus thuis waar ze al bestaat: in WordPress, bij een
 * beheerder met `unfiltered_html`. Dezelfde persoon die een Custom HTML-blok in
 * een pagina mag zetten. Het FORMULIER blijft in de OM -- welke velden er zijn,
 * hoe ze heten en waar ze in Odoo belanden. Een stap weet alleen de SLEUTEL van
 * het verborgen veld dat hij vult.
 *
 * WAT HIER NIET STAAT
 * -------------------
 * Geen veldendefinities, geen labels, geen validatieregels voor Odoo. Een stap
 * levert een waarde onder een sleutel af; wat daarmee gebeurt staat in de
 * koppeling in de OM.
 *
 * De opslag is EEN option, net als bij de opstellingen. Geen custom post type:
 * het zijn er een handvol, ze hebben geen permalink, geen auteur en geen
 * zoekindex nodig. Wat ze wel nodig hebben -- want dit is code die stuk kan --
 * is een weg terug; daarvoor bewaart elke stap zijn VORIGE versie. Een echte
 * revisiegeschiedenis zou een CPT vragen; een keer terug is wat je in de
 * praktijk nodig hebt (je typt iets fout, het formulier is stuk, je wil de
 * versie van vijf minuten geleden terug).
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Steps {

    private const OPTION = 'mymmo_forms_steps';

    /** Meer dan dit is geen stappenreeks meer maar een website. */
    private const MAX = 40;

    /**
     * Grens per stap. Ruim: het voorbeeld waar dit voor gebouwd is (een
     * rekenmodule met illustraties in SVG) is ongeveer 120 KB. Een grens is er
     * wel, want een option die per paginaweergave ingeladen wordt mag niet
     * onbeperkt groeien.
     */
    private const MAX_HTML = 400000;

    /** Hoe de stap zijn navigatie krijgt. */
    public const NAV_PLUGIN = 'plugin';
    public const NAV_ZELF   = 'zelf';

    public static function init(): void {
        add_action('admin_post_mymmo_forms_step_save', [self::class, 'handle_save']);
        add_action('admin_post_mymmo_forms_step_delete', [self::class, 'handle_delete']);
        add_action('admin_post_mymmo_forms_step_restore', [self::class, 'handle_restore']);
    }

    /**
     * Wie mag een stap bewerken?
     *
     * `unfiltered_html` en niet `manage_options`: dit is HTML met JavaScript die
     * op elke bezoekerspagina uitgevoerd wordt. Dat is exact hetzelfde recht dat
     * WordPress vraagt voor een Custom HTML-blok, en op een multisite heeft een
     * gewone sitebeheerder het bewust NIET.
     */
    public static function may_edit(): bool {
        return current_user_can('unfiltered_html');
    }

    /**
     * Alle stappen, op naam gesorteerd.
     *
     * @return array<string,array<string,mixed>>
     */
    public static function all(): array {
        $ruw = get_option(self::OPTION, []);
        if (!is_array($ruw)) {
            return [];
        }

        $uit = [];
        foreach ($ruw as $id => $stap) {
            if (!is_array($stap)) {
                continue;
            }
            $id = self::sanitize_id((string) ($stap['id'] ?? $id));
            if ($id === '') {
                continue;
            }
            $uit[$id] = self::normalize($id, $stap);
        }

        uasort($uit, static fn ($a, $b) => strcasecmp((string) $a['name'], (string) $b['name']));

        return $uit;
    }

    /** @return array<string,mixed>|null */
    public static function get(string $id): ?array {
        $alles = self::all();
        $id    = self::sanitize_id($id);

        return $id !== '' && isset($alles[$id]) ? $alles[$id] : null;
    }

    /**
     * De stappen achter een `steps="a,b,c"`-attribuut, IN DIE VOLGORDE.
     *
     * Een naam die niet bestaat wordt overgeslagen en gemeld aan de aanroeper
     * via $ontbrekend -- stil niets tonen zou betekenen dat een typefout in de
     * shortcode een stap laat verdwijnen zonder dat iemand het ziet, en dan
     * komt er een leeg verborgen veld in Odoo.
     *
     * @param  array<int,string> $ontbrekend  wordt gevuld met de niet-gevonden namen
     * @return array<int,array<string,mixed>>
     */
    public static function resolve(string $lijst, array &$ontbrekend = []): array {
        $uit        = [];
        $gezien     = [];
        $ontbrekend = [];
        $alles      = self::all();

        foreach (preg_split('/[,\|]/', $lijst) ?: [] as $naam) {
            $id = self::sanitize_id($naam);
            if ($id === '') {
                continue;
            }
            // Twee keer dezelfde stap in een reeks is altijd een vergissing: de
            // tweede zou dezelfde element-id's en dezelfde sleutels gebruiken.
            if (isset($gezien[$id])) {
                continue;
            }
            $gezien[$id] = true;

            if (isset($alles[$id])) {
                $uit[] = $alles[$id];
            } else {
                $ontbrekend[] = $id;
            }
        }

        return $uit;
    }

    /**
     * Een rij uit de opslag naar de vorm brengen waar de rest op rekent.
     *
     * @param  array<string,mixed> $ruw
     * @return array<string,mixed>
     */
    private static function normalize(string $id, array $ruw): array {
        $nav = (string) ($ruw['nav'] ?? self::NAV_PLUGIN);

        return [
            'id'       => $id,
            'name'     => (string) ($ruw['name'] ?? $id),
            'title'    => (string) ($ruw['title'] ?? ''),
            'fields'   => self::sanitize_fields($ruw['fields'] ?? []),
            'nav'      => $nav === self::NAV_ZELF ? self::NAV_ZELF : self::NAV_PLUGIN,
            'next'     => (string) ($ruw['next'] ?? ''),
            'back'     => (string) ($ruw['back'] ?? ''),
            'html'     => (string) ($ruw['html'] ?? ''),
            'updated'  => (int) ($ruw['updated'] ?? 0),
            'backup'   => is_array($ruw['backup'] ?? null) ? [
                'html'    => (string) ($ruw['backup']['html'] ?? ''),
                'updated' => (int) ($ruw['backup']['updated'] ?? 0),
            ] : null,
        ];
    }

    /**
     * De sleutels die deze stap hoort af te leveren.
     *
     * Dezelfde vorm als een veldsleutel in de OM (isValidFieldKey in
     * forms/schema.js): kleine letters, cijfers en liggende streepjes. Dat is
     * geen cosmetica -- deze string wordt de `name` van een verborgen veld en
     * belandt zo in de payload naar Odoo.
     *
     * @param  mixed $ruw
     * @return array<int,string>
     */
    public static function sanitize_fields($ruw): array {
        $stukken = is_array($ruw) ? $ruw : preg_split('/[\s,]+/', (string) $ruw);
        $uit     = [];

        foreach ($stukken ?: [] as $stuk) {
            $sleutel = strtolower(trim((string) $stuk));
            $sleutel = (string) preg_replace('/[^a-z0-9_]/', '', $sleutel);
            if ($sleutel !== '' && !in_array($sleutel, $uit, true)) {
                $uit[] = $sleutel;
            }
        }

        return array_slice($uit, 0, 20);
    }

    public static function sanitize_id(string $ruw): string {
        return substr(sanitize_title(trim($ruw)), 0, 60);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Opslaan en verwijderen
    // ─────────────────────────────────────────────────────────────────────────

    public static function handle_save(): void {
        self::gate('mymmo_forms_step_save');

        $id = self::sanitize_id((string) ($_POST['mymmo_step_id'] ?? ''));
        // Geen naam getypt? Dan de naam van de stap gebruiken. Een stap zonder
        // enige aanduiding is niet terug te vinden in de keuzelijst.
        $naam = sanitize_text_field(wp_unslash((string) ($_POST['mymmo_step_name'] ?? '')));
        if ($id === '') {
            $id = self::sanitize_id($naam);
        }
        if ($id === '') {
            self::terug(['mymmo_step_fout' => 'naam']);
        }

        $alles   = self::all();
        $bestond = $alles[$id] ?? null;

        if ($bestond === null && count($alles) >= self::MAX) {
            self::terug(['mymmo_step_fout' => 'vol']);
        }

        // wp_unslash en GEEN sanitisatie op de HTML zelf: dat is het hele punt
        // van deze pagina, en ze staat achter `unfiltered_html`. Wat er wel
        // gebeurt is een grens op de lengte en het weren van een nul-byte, die
        // in een option niets te zoeken heeft.
        $html = (string) wp_unslash((string) ($_POST['mymmo_step_html'] ?? ''));
        $html = str_replace("\0", '', $html);
        $html = str_replace(["\r\n", "\r"], "\n", $html);

        if (strlen($html) > self::MAX_HTML) {
            self::terug(['mymmo_step_fout' => 'groot', 'mymmo_step' => $id]);
        }

        $nieuw = [
            'id'      => $id,
            'name'    => $naam !== '' ? $naam : $id,
            'title'   => sanitize_text_field(wp_unslash((string) ($_POST['mymmo_step_title'] ?? ''))),
            'fields'  => self::sanitize_fields(wp_unslash((string) ($_POST['mymmo_step_fields'] ?? ''))),
            'nav'     => ((string) ($_POST['mymmo_step_nav'] ?? '')) === self::NAV_ZELF ? self::NAV_ZELF : self::NAV_PLUGIN,
            'next'    => sanitize_text_field(wp_unslash((string) ($_POST['mymmo_step_next'] ?? ''))),
            'back'    => sanitize_text_field(wp_unslash((string) ($_POST['mymmo_step_back'] ?? ''))),
            'html'    => $html,
            'updated' => time(),
        ];

        // De vorige versie bewaren -- maar alleen als de HTML ook echt wijzigt.
        // Anders wist het opslaan van een gewijzigd LABEL de enige weg terug
        // naar de code van voor de fout.
        if (is_array($bestond) && (string) $bestond['html'] !== $html) {
            $nieuw['backup'] = ['html' => (string) $bestond['html'], 'updated' => (int) $bestond['updated']];
        } elseif (is_array($bestond) && is_array($bestond['backup'])) {
            $nieuw['backup'] = $bestond['backup'];
        }

        $alles[$id] = $nieuw;
        self::bewaar($alles);

        self::terug(['mymmo_step' => $id, 'mymmo_step_ok' => 'bewaard']);
    }

    public static function handle_delete(): void {
        self::gate('mymmo_forms_step_delete');

        $id    = self::sanitize_id((string) ($_POST['mymmo_step_id'] ?? ''));
        $alles = self::all();

        if ($id !== '' && isset($alles[$id])) {
            unset($alles[$id]);
            self::bewaar($alles);
        }

        self::terug(['mymmo_step_ok' => 'verwijderd']);
    }

    /** De vorige versie van de HTML terugzetten. */
    public static function handle_restore(): void {
        self::gate('mymmo_forms_step_restore');

        $id    = self::sanitize_id((string) ($_POST['mymmo_step_id'] ?? ''));
        $alles = self::all();

        if ($id === '' || !isset($alles[$id]) || !is_array($alles[$id]['backup'])) {
            self::terug(['mymmo_step_fout' => 'geen-backup']);
        }

        $huidig = (string) $alles[$id]['html'];
        $alles[$id]['html']    = (string) $alles[$id]['backup']['html'];
        $alles[$id]['updated'] = time();
        // Omwisselen en niet weggooien: wie per ongeluk terugzet, moet vooruit
        // kunnen. Een keer terug in beide richtingen.
        $alles[$id]['backup']  = ['html' => $huidig, 'updated' => time()];

        self::bewaar($alles);
        self::terug(['mymmo_step' => $id, 'mymmo_step_ok' => 'teruggezet']);
    }

    /** @param array<string,array<string,mixed>> $alles */
    private static function bewaar(array $alles): void {
        // autoload nadrukkelijk uit: dit kan honderden kilobytes zijn en is op
        // een gewone paginaweergave zonder stappen-shortcode niet nodig.
        update_option(self::OPTION, $alles, false);
    }

    private static function gate(string $actie): void {
        if (!self::may_edit() || !check_admin_referer($actie)) {
            wp_die('Geen toegang.');
        }
    }

    /** @param array<string,string> $args */
    private static function terug(array $args): void {
        $url = admin_url('options-general.php?page=mymmo-forms&tab=stappen');
        foreach ($args as $sleutel => $waarde) {
            $url = add_query_arg($sleutel, $waarde, $url);
        }
        wp_safe_redirect($url);
        exit;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Voorbeelden
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De meegeleverde voorbeeldstappen, als bestand op schijf.
     *
     * Ze staan als los bestand en niet als string in deze klasse: het zijn
     * volwaardige HTML-brokken met CSS en JavaScript, en die horen in een
     * .html-bestand waar een editor ze kan tonen. Ze worden NOOIT automatisch
     * uitgevoerd -- ze bestaan alleen om in de editor geplakt te worden.
     *
     * @return array<string,string>  bestandsnaam => leesbare naam
     */
    public static function examples(): array {
        return [
            'aantal-gebouwen' => 'Schuifbalk — aantal gebouwen',
            'gebouwgrootte'   => 'Schuifbalk — grootte van het gebouw (Syndicoach)',
        ];
    }

    public static function example_html(string $naam): string {
        $naam = self::sanitize_id($naam);
        if ($naam === '' || !array_key_exists($naam, self::examples())) {
            return '';
        }

        $pad = MYMMO_FORMS_DIR . 'voorbeelden/' . $naam . '.html';

        return is_readable($pad) ? (string) file_get_contents($pad) : '';
    }
}
