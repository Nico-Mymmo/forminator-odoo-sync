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
 *   [mymmo_form slug="offerte" steps="gebouwgrootte,behoeften"]
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
        add_action('admin_post_mymmo_forms_step_teksten_leeg', [self::class, 'handle_clear_teksten']);
        // Vanuit het voorbeeld in de bouwer: een tekst tegelijk, meteen bewaard.
        add_action('wp_ajax_mymmo_forms_step_tekst', [self::class, 'handle_ajax_tekst']);
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
            'sub'      => (string) ($ruw['sub'] ?? ''),
            'teksten'  => self::sanitize_teksten($ruw['teksten'] ?? []),
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

    // ────────────────────────────────────────────────────────────────────────
    // Tekst aanpassen zonder de HTML aan te raken
    // ────────────────────────────────────────────────────────────────────────

    /*
     * WAAROM DIT BESTAAT
     * ------------------
     * De HTML van een stap is code: opmaak, CSS en JavaScript door elkaar. Een
     * zin daarin wijzigen betekende de code-editor open, de juiste plek zoeken
     * en hopen dat je niets anders raakt -- en bij het opnieuw inladen van het
     * meegeleverde voorbeeld was je wijziging weer weg.
     *
     * Daarom staat de copy APART van de HTML, als `origineel => nieuw`. Bij het
     * renderen worden de TEKSTKNOPEN van de HTML langsgelopen en vervangen waar
     * er een aanpassing voor bestaat. De HTML zelf wordt nooit herschreven.
     *
     * Drie dingen volgen daaruit, en alle drie zijn bedoeld:
     *
     * 1. Laad je het bestand opnieuw in, dan staan de originele zinnen er weer
     *    en grijpen dezelfde aanpassingen opnieuw. Wijzigt het bestand die zin
     *    wel, dan valt de aanpassing vanzelf weg -- de nieuwe tekst uit het
     *    bestand wint, want daar is geen aanpassing voor.
     * 2. De aanpassing hangt aan de STAP, niet aan de plaatsing. Staat dezelfde
     *    stap in een tweede formulier, dan staat je copy daar ook. Dat is wat je
     *    wil bij een stap die je hergebruikt; wil je per plaatsing iets anders,
     *    maak dan een tweede stap.
     * 3. Dezelfde zin die twee keer in de HTML staat, verandert twee keer. Dat
     *    is de prijs van een sleutel die de tekst zelf is -- en meestal precies
     *    wat je bedoelt.
     */

    /** Meer dan dit is geen copy-aanpassing meer maar een tweede versie van de stap. */
    private const MAX_TEKSTEN = 80;

    /** Een zin die langer is dan dit, is geen label. */
    private const MAX_TEKST = 400;

    /**
     * @param  mixed $ruw
     * @return array<string,string>
     */
    public static function sanitize_teksten($ruw): array {
        if (!is_array($ruw)) {
            return [];
        }

        $uit = [];
        foreach ($ruw as $origineel => $nieuw) {
            if (!is_scalar($nieuw)) {
                continue;
            }
            $sleutel = self::sanitize_tekst((string) $origineel);
            $waarde  = self::sanitize_tekst((string) $nieuw);
            if ($sleutel === '' || $waarde === '' || $sleutel === $waarde) {
                continue;
            }
            $uit[$sleutel] = $waarde;
            if (count($uit) >= self::MAX_TEKSTEN) {
                break;
            }
        }

        return $uit;
    }

    /**
     * Een losse zin opschonen.
     *
     * Platte tekst, geen opmaak: dit vervangt een TEKSTKNOOP, dus tags zouden
     * hier als tekst belanden of de structuur van de stap openbreken. Witruimte
     * wordt samengetrokken, want in HTML is elke reeks witruimte een spatie en
     * anders zou dezelfde zin met een regeleinde erin niet meer matchen.
     */
    private static function sanitize_tekst(string $ruw): string {
        $tekst = wp_strip_all_tags($ruw);
        $tekst = str_replace("\xc2\xa0", ' ', $tekst);
        $tekst = trim((string) preg_replace('/\s+/u', ' ', $tekst));

        return function_exists('mb_substr') ? mb_substr($tekst, 0, self::MAX_TEKST) : substr($tekst, 0, self::MAX_TEKST);
    }

    /**
     * De HTML van een stap zoals ze getoond hoort te worden.
     *
     * Overal gebruiken waar de HTML van een stap naar het scherm gaat --
     * templates/steps.php doet dat. NIET gebruiken in de code-editor van
     * wp-admin: daar hoort de echte bron te staan, anders bak je bij de
     * eerstvolgende bewaaractie je aanpassingen in de HTML en ben je de
     * originele zin kwijt.
     *
     * @param array<string,mixed> $stap
     */
    public static function render_html(array $stap): string {
        $html    = (string) ($stap['html'] ?? '');
        $teksten = is_array($stap['teksten'] ?? null) ? $stap['teksten'] : [];

        if ($html === '' || $teksten === []) {
            return $html;
        }

        return self::vervang_tekstknopen($html, $teksten);
    }

    /**
     * De tekstknopen van een stuk HTML langslopen en vervangen.
     *
     * Met de hand en niet met DOMDocument: dit is een FRAGMENT met <style> en
     * <script> erin, en DOMDocument maakt daar een heel document van, sluit tags
     * die bewust openstaan en verandert de opmaak van wat het teruggeeft. Voor
     * code die een beheerder zelf schreef is dat onaanvaardbaar -- wat je ziet
     * moet zijn wat je typte.
     *
     * De scanner raakt alleen wat TUSSEN twee tags staat. Attributen worden dus
     * nooit aangeraakt (een `title="Ja"` blijft "Ja"), en de inhoud van
     * <script>, <style> en <textarea> wordt overgeslagen -- daar is tekst geen
     * tekst maar code.
     *
     * @param array<string,string> $teksten
     */
    private static function vervang_tekstknopen(string $html, array $teksten): string {
        $uit = '';
        $i   = 0;
        $n   = strlen($html);

        while ($i < $n) {
            $lt = strpos($html, '<', $i);
            if ($lt === false) {
                $uit .= self::vervang_stuk(substr($html, $i), $teksten);
                break;
            }

            $uit .= self::vervang_stuk(substr($html, $i, $lt - $i), $teksten);

            $gt = strpos($html, '>', $lt);
            if ($gt === false) {
                // Een < zonder > is geen tag maar tekst. Laten staan zoals het is.
                $uit .= substr($html, $lt);
                break;
            }

            $tag  = substr($html, $lt, $gt - $lt + 1);
            $uit .= $tag;
            $i    = $gt + 1;

            if (preg_match('/^<\s*(script|style|textarea)\b/i', $tag, $m)) {
                $sluit = '</' . strtolower($m[1]);
                $eind  = stripos($html, $sluit, $i);
                if ($eind === false) {
                    $uit .= substr($html, $i);
                    break;
                }
                $uit .= substr($html, $i, $eind - $i);
                $i    = $eind;
            }
        }

        return $uit;
    }

    /**
     * Een tekstknoop, met de witruimte eromheen ongemoeid.
     *
     * De vergelijking gebeurt op de GEDECODEERDE tekst, want dat is wat de
     * browser doorgaf toen iemand de zin in het voorbeeld aanpaste: in de bron
     * staat `&amp;`, op het scherm staat `&`. Bij het terugschrijven wordt weer
     * ge-escaped, anders zou een & of een < uit een label de HTML openbreken.
     *
     * @param array<string,string> $teksten
     */
    private static function vervang_stuk(string $stuk, array $teksten): string {
        if (trim($stuk) === '') {
            return $stuk;
        }

        $kern = html_entity_decode(trim($stuk), ENT_QUOTES, 'UTF-8');
        $kern = trim((string) preg_replace('/\s+/u', ' ', str_replace("\xc2\xa0", ' ', $kern)));

        if ($kern === '' || !isset($teksten[$kern])) {
            return $stuk;
        }

        // De witruimte voor en na blijft staan: ze bepaalt mee of er een spatie
        // staat tussen deze knoop en het element ernaast.
        $voor = substr($stuk, 0, strlen($stuk) - strlen(ltrim($stuk)));
        $na   = substr($stuk, strlen(rtrim($stuk)));

        return $voor . esc_html($teksten[$kern]) . $na;
    }

    /**
     * Een tekst bewaren, vanuit het voorbeeld in de bouwer.
     *
     * `$origineel` is wat er OP DAT MOMENT op het scherm stond. Dat kan al een
     * eerdere aanpassing zijn; dan hoort die bijgewerkt te worden in plaats van
     * dat er een tweede regel bijkomt die nooit grijpt (de eerste vervangt de
     * tekstknoop al, dus de tweede vindt haar origineel niet meer terug).
     * Vandaar dat er eerst gezocht wordt of `$origineel` de WAARDE van een
     * bestaande regel is.
     *
     * Terugzetten naar de oorspronkelijke zin wist de regel: dan staat er niets
     * meer tussen het bestand en het scherm.
     */
    public static function save_tekst(string $id, string $origineel, string $nieuw): bool {
        $id    = self::sanitize_id($id);
        $alles = self::all();
        if ($id === '' || !isset($alles[$id])) {
            return false;
        }

        $origineel = self::sanitize_tekst($origineel);
        $nieuw     = self::sanitize_tekst($nieuw);
        if ($origineel === '') {
            return false;
        }

        $teksten = (array) $alles[$id]['teksten'];

        $sleutel = $origineel;
        foreach ($teksten as $k => $v) {
            if ($v === $origineel) {
                $sleutel = (string) $k;
                break;
            }
        }

        if ($nieuw === '' || $nieuw === $sleutel) {
            unset($teksten[$sleutel]);
        } else {
            if (!isset($teksten[$sleutel]) && count($teksten) >= self::MAX_TEKSTEN) {
                return false;
            }
            $teksten[$sleutel] = $nieuw;
        }

        $alles[$id]['teksten'] = $teksten;
        self::bewaar($alles);

        return true;
    }

    /** De titel of de regel eronder van een stap zetten. */
    public static function save_kop(string $id, string $wat, string $waarde): bool {
        $id    = self::sanitize_id($id);
        $alles = self::all();
        if ($id === '' || !isset($alles[$id]) || !in_array($wat, ['title', 'sub'], true)) {
            return false;
        }

        $alles[$id][$wat] = self::sanitize_tekst($waarde);
        self::bewaar($alles);

        return true;
    }

    /**
     * Het voorbeeld in de bouwer slaat hier een wijziging tegelijk op.
     *
     * Meteen bewaren en niet bij het opslaan van de shortcode: wat je hier
     * aanpast hoort bij de STAP en gaat dus mee naar elk formulier waar die stap
     * in staat. Het zou verwarrend zijn als dat pas gebeurde bij het bewaren van
     * een opstelling die er niets mee te maken heeft.
     */
    public static function handle_ajax_tekst(): void {
        if (!self::may_edit() || !check_ajax_referer('mymmo_forms_preview', 'nonce', false)) {
            wp_send_json_error(['bericht' => 'Geen toegang.'], 403);
        }

        $id  = self::sanitize_id((string) ($_POST['stap'] ?? ''));
        $wat = (string) ($_POST['wat'] ?? 'tekst');

        if ($wat === 'titel' || $wat === 'sub') {
            $ok = self::save_kop(
                $id,
                $wat === 'titel' ? 'title' : 'sub',
                (string) wp_unslash((string) ($_POST['nieuw'] ?? ''))
            );
        } else {
            $ok = self::save_tekst(
                $id,
                (string) wp_unslash((string) ($_POST['origineel'] ?? '')),
                (string) wp_unslash((string) ($_POST['nieuw'] ?? ''))
            );
        }

        if (!$ok) {
            wp_send_json_error(['bericht' => 'Niet bewaard.'], 400);
        }

        wp_send_json_success(['stap' => $id]);
    }

    /** Alle tekstaanpassingen van een stap weghalen. */
    public static function handle_clear_teksten(): void {
        self::gate('mymmo_forms_step_teksten_leeg');

        $id    = self::sanitize_id((string) ($_POST['mymmo_step_id'] ?? ''));
        $alles = self::all();

        if ($id !== '' && isset($alles[$id])) {
            $alles[$id]['teksten'] = [];
            self::bewaar($alles);
        }

        self::terug(['mymmo_step' => $id, 'mymmo_step_ok' => 'teksten-leeg']);
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
            'sub'     => sanitize_text_field(wp_unslash((string) ($_POST['mymmo_step_sub'] ?? ''))),
            // De tekstaanpassingen blijven staan. Ze horen bij de STAP, niet bij
            // deze ene bewerkronde -- dat is het hele punt: plak je het bestand
            // opnieuw, dan staat je copy er nog.
            'teksten' => is_array($bestond) ? (array) $bestond['teksten'] : [],
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
            'gebouwgrootte'   => 'Schuifbalk — grootte van het gebouw (Syndicoach)',
            'gebouwkenmerken' => 'Keien — wat is er in het gebouw (Syndicoach)',
            'huidig-beheer'   => 'Keuze — hoe wordt het gebouw vandaag beheerd (Syndicoach)',
            'algemene-vergadering' => 'Jaarwiel — wanneer is de volgende algemene vergadering (Syndicoach)',
        ];
    }

    /**
     * Wat er bij het invoegen van een voorbeeld mee ingevuld wordt.
     *
     * De TITEL boven een stap komt van de plugin (`mymmo-stap-titel`), niet uit de
     * HTML van de stap -- zo staat hij bij elke stap op dezelfde plek en in
     * dezelfde stijl. Maar een voorbeeld invoegen liet dat veld leeg, en dan begon
     * stap 2 zonder titel terwijl stap 1 er een had. Hetzelfde met de sleutels:
     * die moest je uit de uitleg in het bestand halen.
     *
     * `velden` is wat er in "Levert deze sleutels" hoort. Leeg bij een stap
     * waarvoor niets kiezen een geldig antwoord is -- anders blijft "Volgende"
     * uit tot er iets aangeduid is.
     *
     * `sub` is de regel onder de titel. Die stond tot 1.17 als een
     * `<p class="mymmo-stap-tekst">` IN de HTML van elk voorbeeld, en dat is
     * een tweede bron: vulde iemand bij de stap ook het veld "regel eronder"
     * in, dan stonden er twee zinnen onder elkaar en was de bovenste enkel weg
     * te krijgen door de HTML te bewerken. Nu levert het voorbeeld hem hier
     * aan, zoals de titel, en rendert de plugin hem op de plek waar hij hoort.
     *
     * @return array{titel:string,sub:string,velden:string}
     */
    public static function example_meta(string $naam): array {
        $meta = [
            'gebouwgrootte'   => [
                'titel'  => 'Wat is de grootte van het gebouw?',
                'sub'    => 'Geef het aantal bewoonbare kavels in. Garages en bergingen hoef je niet mee te tellen.',
                'velden' => 'aantal_kavels, commerciele_kavels',
            ],
            'gebouwkenmerken' => [
                'titel'  => 'Wat speelt er in jullie gebouw?',
                'sub'    => 'Duid aan wat klopt, of sla dit gewoon over.',
                'velden' => '',
            ],
            'huidig-beheer'   => [
                'titel'  => 'Hoe wordt je appartement momenteel beheerd?',
                'sub'    => 'Er is geen fout antwoord. We willen gewoon weten waar jullie vandaag staan.',
                'velden' => 'huidig_beheer',
            ],
            'algemene-vergadering' => [
                'titel'  => 'Wanneer is jullie volgende algemene vergadering?',
                'sub'    => 'Een schatting volstaat. Schuif de lijn tot het kader ongeveer goed staat.',
                'velden' => 'volgende_av_periode',
            ],
        ];

        return $meta[self::sanitize_id($naam)] ?? ['titel' => '', 'sub' => '', 'velden' => ''];
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
