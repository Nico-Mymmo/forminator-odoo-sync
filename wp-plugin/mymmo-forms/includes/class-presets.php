<?php
/**
 * Bewaarde opstellingen.
 *
 * Een OPSTELLING is een set shortcode-attributen onder een naam: "Offerte —
 * homepage", "Contact — voettekst". Je maakt ze in de bouwer, met het levende
 * voorbeeld ernaast, en zet ze daarna op zoveel pagina's als je wil:
 *
 *   [mymmo_form_button preset="offerte-homepage"]
 *
 * of met het blok "Mymmo formulier" in de blok-editor.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Zonder opstellingen staat elke plaatsing als een lange shortcode in een
 * pagina. Wil je de knoptekst of de opsomming wijzigen, dan moet je elke pagina
 * langs waar die shortcode staat -- en je weet niet welke dat zijn. Met een
 * opstelling staat het op één plek en werkt een wijziging overal door.
 *
 * WAT HIER NIET STAAT
 * -------------------
 * Geen formulierdefinities. Die blijven in de Operations Manager; een opstelling
 * bevat alleen hoe DEZE site dat formulier toont (welke knoptekst, welke agenda,
 * welke kleur). Dat is precies de scheiding uit het ontwerpuitgangspunt van deze
 * plugin: één bron voor het formulier, en daarnaast wat bij de plaatsing hoort.
 *
 * De opslag is één option. Geen custom post type: er zijn er een handvol, ze
 * hebben geen revisies nodig, geen auteur, geen permalink en geen zoekindex --
 * en een CPT zou ze in de beheerderskolom zetten waar niemand ze zoekt.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Presets {

    private const OPTION = 'mymmo_forms_presets';

    /**
     * De attributen die een opstelling mag bevatten.
     *
     * DE ENIGE lijst: de bouwer gebruikt hem voor het voorbeeld, het opslaan
     * gebruikt hem om te schonen, en de shortcode leest wat eruit komt. Een
     * tweede kopie zou betekenen dat een attribuut wél bewaard wordt en niet
     * gerenderd, of omgekeerd -- en dat merk je pas op een pagina.
     *
     * `preset` staat er bewust NIET in: een opstelling die een andere opstelling
     * oproept is een ketting die niemand meer kan volgen. Een INGANG wijst wel
     * naar een opstelling, maar dat is een andere lijst en precies één niveau
     * diep -- zie class-entrypoints.php.
     */
    public const ATTS = [
        'slug', 'steps', 'label', 'calendly', 'title', 'intro', 'points', 'image', 'image_alt',
        'tab_form', 'tab_calendly', 'tab_form_sub', 'tab_calendly_sub', 'tab',
        'tab_extra', 'tab_extra_sub', 'extra_slug', 'extra_steps', 'tab_order',
        'variant', 'accent', 'accent_text', 'button', 'trigger', 'class', 'close', 'lang',
        'gap', 'background', 'icon_color', 'form_title', 'form_sub', 'form_heading', 'calendly_color',
        'image_calendly', 'image_calendly_alt',
        'image_calendly_scale', 'image_calendly_x', 'image_calendly_y',
        'image_scale', 'image_x', 'image_y',
        'watermark', 'watermark_scale', 'watermark_x', 'watermark_y', 'watermark_rotate',
        'thanks_calendly', 'goal_form', 'goal_calendly',
        // 1.16: het dankjewelscherm per tabblad.
        'thanks_form_image', 'thanks_form_title', 'thanks_form_text',
        'thanks_extra_image', 'thanks_extra_title', 'thanks_extra_text',
        'thanks_calendly_image', 'thanks_calendly_title', 'goal_extra',
        // 1.17: een ruimer venster, voor een stap die in de gewone breedte niet
        // past en daar anders een schuifbalk van maakt.
        'panel',
    ];

    /**
     * De twee soorten plaatsing. Wat hier niet in staat, wordt een knop.
     *
     * Een CALLOUT staat hier bewust niet tussen. Een opstelling is het VENSTER;
     * hoe je het opent is een INGANG, en die hebben een eigen lijst (zie
     * class-entrypoints.php). Anders heb je per manier van openen een kopie van
     * het hele venster nodig -- en moet je bij elke wijziging raden welke kopie
     * waar staat.
     */
    private const SOORTEN = ['inline', 'knop'];

    /** Meer dan dit is geen lijst meer maar een archief. */
    private const MAX = 50;

    public static function init(): void {
        add_action('admin_post_mymmo_forms_preset_save', [self::class, 'handle_save']);
        add_action('admin_post_mymmo_forms_preset_delete', [self::class, 'handle_delete']);
    }

    /**
     * Alle opstellingen, op naam gesorteerd.
     *
     * @return array<string,array{id:string,name:string,soort:string,atts:array<string,string>,updated:int}>
     */
    public static function all(): array {
        $ruw = get_option(self::OPTION, []);
        if (!is_array($ruw)) {
            return [];
        }

        $uit = [];
        foreach ($ruw as $id => $opstelling) {
            $schoon = self::normalize((string) $id, is_array($opstelling) ? $opstelling : []);
            if ($schoon !== null) {
                $uit[$schoon['id']] = $schoon;
            }
        }

        uasort($uit, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));
        return $uit;
    }

    /** @return array{id:string,name:string,soort:string,atts:array<string,string>,updated:int}|null */
    public static function get(string $id): ?array {
        $id = sanitize_title($id);
        return $id === '' ? null : (self::all()[$id] ?? null);
    }

    /**
     * De attributen van een opstelling, of [] als ze niet bestaat.
     *
     * @return array<string,string>
     */
    public static function atts(string $id): array {
        $opstelling = self::get($id);
        return $opstelling === null ? [] : $opstelling['atts'];
    }

    /**
     * Een rij uit de option leesbaar en veilig maken.
     *
     * Ook bij het LEZEN en niet alleen bij het schrijven: de option kan van een
     * oudere versie komen, met de hand aangepast zijn, of uit een import. Wat er
     * uit deze functie komt, is wat de rest van de plugin mag vertrouwen.
     *
     * @param array<string,mixed> $ruw
     * @return array{id:string,name:string,soort:string,atts:array<string,string>,updated:int}|null
     */
    private static function normalize(string $id, array $ruw): ?array {
        $id = sanitize_title((string) ($ruw['id'] ?? $id));
        if ($id === '') {
            return null;
        }

        $atts = [];
        foreach (self::ATTS as $naam) {
            if (!isset($ruw['atts'][$naam])) {
                continue;
            }
            $waarde = sanitize_text_field((string) $ruw['atts'][$naam]);
            if ($waarde !== '') {
                $atts[$naam] = $waarde;
            }
        }

        // Een opstelling zonder formulier kan niets tonen. Ze stil laten staan
        // zou een keuzelijst vullen met iets dat op een pagina niets doet.
        if (($atts['slug'] ?? '') === '') {
            return null;
        }

        $naam = sanitize_text_field((string) ($ruw['name'] ?? ''));

        return [
            'id'      => $id,
            'name'    => $naam !== '' ? $naam : $id,
            'soort'   => in_array((string) ($ruw['soort'] ?? ''), self::SOORTEN, true)
                ? (string) $ruw['soort']
                : 'knop',
            'atts'    => $atts,
            'updated' => (int) ($ruw['updated'] ?? 0),
        ];
    }

    /**
     * Bewaren. Bestaat het id al, dan wordt die opstelling OVERSCHREVEN --
     * daardoor is "opnieuw bewaren onder dezelfde naam" gewoon bijwerken, en
     * werkt de wijziging door op elke pagina die haar gebruikt.
     *
     * @param array<string,string> $atts
     */
    public static function save(string $naam, string $soort, array $atts, string $id = ''): string {
        $naam = sanitize_text_field($naam);
        if ($naam === '') {
            $naam = 'Naamloze opstelling';
        }

        $id = sanitize_title($id !== '' ? $id : $naam);
        if ($id === '') {
            $id = 'opstelling-' . substr((string) time(), -6);
        }

        $alles = get_option(self::OPTION, []);
        if (!is_array($alles)) {
            $alles = [];
        }

        if (count($alles) >= self::MAX && !isset($alles[$id])) {
            return '';
        }

        $alles[$id] = [
            'id'      => $id,
            'name'    => $naam,
            'soort'   => in_array($soort, self::SOORTEN, true) ? $soort : 'knop',
            'atts'    => $atts,
            'updated' => time(),
        ];

        update_option(self::OPTION, $alles, false);
        return $id;
    }

    public static function delete(string $id): void {
        $id = sanitize_title($id);
        $alles = get_option(self::OPTION, []);
        if (!is_array($alles) || !isset($alles[$id])) {
            return;
        }
        unset($alles[$id]);
        update_option(self::OPTION, $alles, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Formulierafhandeling
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Opslaan vanuit de bouwer.
     *
     * De attributen komen als JSON mee in één verborgen veld, gevuld door het
     * script van de bouwer. Reden: het zijn er twintig, ze veranderen mee met de
     * shortcode, en twintig losse velden die met de hand synchroon gehouden
     * moeten worden is precies hoe ze uit elkaar gaan lopen.
     */
    public static function handle_save(): void {
        if (!current_user_can('manage_options')) {
            wp_die('Geen toegang.');
        }
        check_admin_referer('mymmo_forms_preset_save');

        $naam  = sanitize_text_field(wp_unslash((string) ($_POST['mymmo_preset_name'] ?? '')));
        $id    = sanitize_title(wp_unslash((string) ($_POST['mymmo_preset_id'] ?? '')));
        $soort = (string) ($_POST['mymmo_preset_soort'] ?? 'knop');

        $json = (string) wp_unslash((string) ($_POST['mymmo_preset_atts'] ?? ''));
        $ruw  = json_decode($json, true);

        $atts = [];
        if (is_array($ruw)) {
            foreach (self::ATTS as $attribuut) {
                if (isset($ruw[$attribuut])) {
                    $waarde = sanitize_text_field((string) $ruw[$attribuut]);
                    if ($waarde !== '') {
                        $atts[$attribuut] = $waarde;
                    }
                }
            }
        }

        $stand = 'opgeslagen';
        $bewaard = '';

        if (($atts['slug'] ?? '') === '') {
            $stand = 'geen-formulier';
        } else {
            $bewaard = self::save($naam, $soort, $atts, $id);
            if ($bewaard === '') {
                $stand = 'vol';
            }
        }

        // Het id mee terug, zodat de bouwer die opstelling meteen weer opent.
        // Anders sta je na het bewaren voor een leeg scherm en toont het
        // shortcode-veld de LOSSE versie -- precies degene die je niet wil
        // kopiëren.
        $terug = add_query_arg('mymmo_preset', $stand, self::terug());
        if ($bewaard !== '') {
            $terug = add_query_arg('mymmo_preset_id', $bewaard, $terug);
        }

        wp_safe_redirect($terug);
        exit;
    }

    public static function handle_delete(): void {
        if (!current_user_can('manage_options')) {
            wp_die('Geen toegang.');
        }
        check_admin_referer('mymmo_forms_preset_delete');

        self::delete((string) wp_unslash((string) ($_POST['mymmo_preset_id'] ?? '')));

        wp_safe_redirect(add_query_arg('mymmo_preset', 'verwijderd', self::terug()));
        exit;
    }

    private static function terug(): string {
        return admin_url('options-general.php?page=mymmo-forms');
    }
}
