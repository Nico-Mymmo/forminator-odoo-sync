<?php
/**
 * Instellingen: Instellingen -> Mymmo Forms.
 *
 * DRIE tabbladen, en de volgorde is het punt:
 *
 *   1. "Popups"  -- waar iemand elke week komt. Kiezen en kopiëren,
 *                            meer niet. Er staat hier niets dat stuk kan.
 *   2. "Stappen"          -- de HTML-brokken die vóór een formulier komen. Wel
 *                            iets dat stuk kan (het is code), dus achter
 *                            `unfiltered_html` en met een weg terug.
 *   3. "Verbinding"       -- waar iemand één keer komt. De URL van de
 *                            Operations Manager, de sitesleutel, de cacheduur.
 *
 * Ze stonden eerst onder elkaar op één pagina, met de sleutel bovenaan. Wie
 * alleen een shortcode kwam halen, scrolde daar elke keer langs -- en een
 * tekstveld waar per ongeluk in getypt wordt, haalt elk formulier op elke
 * pagina van de site tegelijk onderuit. Dat risico hoort niet op het scherm van
 * wie een shortcode zoekt.
 *
 * Alles wat een formulier BETREFT (velden, labels, talen, bedanktekst, kleuren)
 * staat in de OM -- dat hier ook kunnen instellen zou een tweede waarheid maken.
 *
 * De sitesleutel wordt nooit voluit teruggetoond. Een beheerder die 'm moet
 * vervangen, plakt gewoon een nieuwe; iemand die over de schouder meekijkt op
 * een gedeeld scherm hoort 'm niet te kunnen lezen.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Forms_Settings {

    private const GROUP = 'mymmo_forms';
    private const PAGE  = 'mymmo-forms';
    private const TAB_INGANGEN = 'ingangen';

    private const TAB_SHORTCODE  = 'shortcode';
    private const TAB_STAPPEN    = 'stappen';
    private const TAB_VERBINDING = 'verbinding';

    /** Hooksuffix van de instellingenpagina, om er enkel daar JS te laden. */
    private static string $hook = '';

    public static function init(): void {
        add_action('admin_menu', [self::class, 'add_page']);
        add_action('admin_init', [self::class, 'register']);
        add_action('admin_post_mymmo_forms_purge', [self::class, 'handle_purge']);
        add_action('admin_post_mymmo_forms_reload_index', [self::class, 'handle_reload_index']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue']);
        // Het levende voorbeeld in de bouwer. Alleen voor wie de pagina ook mag
        // zien; het rendert een formulier uit de OM en dat is niets voor een
        // abonnee met een geldige nonce.
        add_action('wp_ajax_mymmo_forms_preview', [self::class, 'handle_preview']);
    }

    public static function add_page(): void {
        self::$hook = (string) add_options_page(
            'Mymmo Forms',
            'Mymmo Forms',
            'manage_options',
            self::PAGE,
            [self::class, 'render_page']
        );
    }

    /**
     * De shortcode-bouwer heeft een klein scriptje. Alleen op deze pagina
     * inladen: een beheerscherm van iemand anders heeft er niets aan.
     */
    public static function enqueue(string $hook): void {
        if ($hook !== self::$hook) {
            return;
        }

        // Het stappen-tabblad heeft niets aan de shortcode-bouwer en zijn
        // voorbeeld-iframe -- dat is een paar honderd kilobyte JavaScript voor
        // een scherm met een code-editor. Andersom net zo.
        if (self::huidige_tab() === self::TAB_STAPPEN) {
            self::enqueue_stappen();
            return;
        }

        wp_enqueue_script(
            'mymmo-forms-admin',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-admin.js',
            [],
            MYMMO_FORMS_VERSION,
            true
        );

        wp_enqueue_style(
            'mymmo-forms-admin',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms-admin.css',
            [],
            MYMMO_FORMS_VERSION
        );

        // De mediabibliotheek van WordPress, voor de afbeelding in de zijkolom.
        // Een URL laten overtypen is de omweg; hier staat het bestand al.
        wp_enqueue_media();

        wp_enqueue_script(
            'mymmo-forms-preview',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-preview.js',
            ['mymmo-forms-admin'],
            MYMMO_FORMS_VERSION,
            true
        );

        // De stylesheets en het script van de POP-UP ZELF gaan mee naar het
        // voorbeeld-iframe. Dat is het hele punt: het voorbeeld draait op
        // precies dezelfde bestanden als een bezoeker, dus het kan niet liegen
        // over hoe het venster eruitziet. Zelfde afspraak als het
        // voorbeeld-iframe in de formulierbouwer van de Operations Manager.
        $v = '?ver=' . rawurlencode(MYMMO_FORMS_VERSION);
        wp_localize_script('mymmo-forms-preview', 'MymmoFormsPreview', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('mymmo_forms_preview'),
            'css'     => [
                MYMMO_FORMS_URL . 'assets/css/mymmo-forms.css' . $v,
                MYMMO_FORMS_URL . 'assets/css/mymmo-forms-modal.css' . $v,
                MYMMO_FORMS_URL . 'assets/css/mymmo-forms-steps.css' . $v,
            ],
            'js'      => [
                MYMMO_FORMS_URL . 'assets/js/mymmo-forms.js' . $v,
                MYMMO_FORMS_URL . 'assets/js/mymmo-forms-modal.js' . $v,
                // Het voorbeeld draait op dezelfde bestanden als een bezoeker,
                // dus ook een stappenreeks hoort er echt te werken. Het iframe
                // krijgt zijn inhoud via srcdoc en niet via innerHTML -- alleen
                // daardoor voeren de <script>'s van een stap ook echt uit.
                MYMMO_FORMS_URL . 'assets/js/mymmo-forms-steps.js' . $v,
            ],
        ]);
    }

    /**
     * De code-editor van WordPress zelf (CodeMirror) op het stappen-tabblad.
     *
     * wp_enqueue_code_editor() zit in de kern en respecteert de voorkeur
     * "Syntaxis markeren" uit het profiel van de gebruiker: staat die uit, dan
     * geeft het `false` terug en blijft er een gewone textarea staan. Dat is
     * bewust geen fout -- iemand die de editor uitzette, wil hem niet.
     */
    private static function enqueue_stappen(): void {
        if (!Mymmo_Forms_Steps::may_edit()) {
            return;
        }

        wp_enqueue_style(
            'mymmo-forms-admin',
            MYMMO_FORMS_URL . 'assets/css/mymmo-forms-admin.css',
            [],
            MYMMO_FORMS_VERSION
        );

        $editor = wp_enqueue_code_editor(['type' => 'text/html']);

        wp_enqueue_script(
            'mymmo-forms-steps-admin',
            MYMMO_FORMS_URL . 'assets/js/mymmo-forms-steps-admin.js',
            $editor === false ? [] : ['code-editor'],
            MYMMO_FORMS_VERSION,
            true
        );

        // De voorbeelden gaan als tekst mee naar de browser, zodat "Voorbeeld
        // invoegen" niets hoeft op te halen. Ze staan op schijf in
        // voorbeelden/ en zijn dus niet door een gebruiker aan te passen.
        $voorbeelden = [];
        foreach (Mymmo_Forms_Steps::examples() as $bestand => $naam) {
            $meta = Mymmo_Forms_Steps::example_meta($bestand);
            $voorbeelden[] = [
                'id'     => $bestand,
                'naam'   => $naam,
                'html'   => Mymmo_Forms_Steps::example_html($bestand),
                'titel'  => $meta['titel'],
                'sub'    => $meta['sub'],
                'velden' => $meta['velden'],
            ];
        }

        wp_localize_script('mymmo-forms-steps-admin', 'MymmoFormsStappen', [
            'editor'      => $editor === false ? null : $editor,
            'voorbeelden' => $voorbeelden,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tabblad 2: stappen
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De stappen beheren.
     *
     * Eén scherm: de lijst bovenaan, daaronder de stap die je bewerkt. Geen
     * aparte "nieuw"-pagina -- er staan er een handvol, en een tweede scherm
     * zou betekenen dat je na het opslaan niet meer ziet wat er nog is.
     */
    private static function render_stappen(): void {
        if (!Mymmo_Forms_Steps::may_edit()) {
            ?>
            <div class="notice notice-error inline">
                <p>
                    Je hebt het recht <code>unfiltered_html</code> nodig om stappen te bewerken.
                    Een stap is HTML met JavaScript die op elke bezoekerspagina uitgevoerd wordt —
                    hetzelfde recht dat WordPress vraagt voor een Custom HTML-blok. Op een multisite
                    heeft alleen een supergebruiker dat.
                </p>
            </div>
            <?php
            return;
        }

        self::stappen_melding();

        $alles  = Mymmo_Forms_Steps::all();
        $bezig  = isset($_GET['mymmo_step']) ? Mymmo_Forms_Steps::sanitize_id((string) wp_unslash($_GET['mymmo_step'])) : '';
        $huidig = $bezig !== '' ? Mymmo_Forms_Steps::get($bezig) : null;
        ?>

        <p class="description" style="max-width:52em;margin:12px 0 18px;">
            Een <strong>stap</strong> is een stuk HTML dat vóór een formulier komt te staan en één of
            enkele waarden verzamelt. Die waarden gaan naar de <strong>verborgen velden</strong> van het
            formulier uit de Operations Manager; dat formulier is de laatste stap. Je zet een reeks op een
            pagina met <code>[mymmo_form slug="..." steps="stap-een,stap-twee"]</code> — of met hetzelfde
            attribuut op <code>[mymmo_form_button]</code>, en dan loopt de reeks in de pop-up.
        </p>

        <h2>Bestaande stappen</h2>

        <?php if ($alles === []) : ?>
            <p>Er is nog geen enkele stap. Maak er hieronder een, of begin met een voorbeeld.</p>
        <?php else : ?>
            <table class="widefat striped" style="max-width:60em;">
                <thead>
                    <tr>
                        <th>Naam</th>
                        <th>Gebruik in <code>steps=</code></th>
                        <th>Levert</th>
                        <th>Gewijzigd</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($alles as $stap) : ?>
                        <tr>
                            <td><strong><?php echo esc_html((string) $stap['name']); ?></strong></td>
                            <td><code><?php echo esc_html((string) $stap['id']); ?></code></td>
                            <td>
                                <?php
                                echo $stap['fields'] === []
                                    ? '<span class="description">niets opgegeven</span>'
                                    : '<code>' . esc_html(implode('</code>, <code>', (array) $stap['fields'])) . '</code>';
                                ?>
                            </td>
                            <td>
                                <?php
                                echo $stap['updated']
                                    ? esc_html(wp_date('j M Y, H:i', (int) $stap['updated']))
                                    : '&mdash;';
                                ?>
                            </td>
                            <td style="white-space:nowrap;text-align:right;">
                                <a class="button button-small"
                                   href="<?php echo esc_url(self::tab_url(self::TAB_STAPPEN, ['mymmo_step' => (string) $stap['id']])); ?>">Bewerken</a>
                                <form method="post"
                                      action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                                      style="display:inline"
                                      data-mymmo-bevestig="Deze stap verwijderen? Pagina's met deze stap in hun steps= tonen daarna gewoon het formulier.">
                                    <?php wp_nonce_field('mymmo_forms_step_delete'); ?>
                                    <input type="hidden" name="action" value="mymmo_forms_step_delete">
                                    <input type="hidden" name="mymmo_step_id" value="<?php echo esc_attr((string) $stap['id']); ?>">
                                    <button type="submit" class="button button-small button-link-delete">Verwijderen</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>

        <hr style="margin:26px 0;">

        <h2><?php echo $huidig ? 'Stap bewerken: ' . esc_html((string) $huidig['name']) : 'Nieuwe stap'; ?></h2>

        <?php if ($huidig) : ?>
            <p>
                <a class="button" href="<?php echo esc_url(self::tab_url(self::TAB_STAPPEN)); ?>">+ Nieuwe stap</a>
                <?php if (is_array($huidig['backup']) && $huidig['backup']['html'] !== '') : ?>
                    <span style="margin-left:14px;">
                        <form method="post"
                              action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                              style="display:inline"
                              data-mymmo-bevestig="De vorige versie van de code terugzetten? De huidige blijft als 'vorige versie' bewaard, dus je kan het weer omdraaien.">
                            <?php wp_nonce_field('mymmo_forms_step_restore'); ?>
                            <input type="hidden" name="action" value="mymmo_forms_step_restore">
                            <input type="hidden" name="mymmo_step_id" value="<?php echo esc_attr((string) $huidig['id']); ?>">
                            <button type="submit" class="button">Vorige versie terugzetten</button>
                        </form>
                        <span class="description">
                            (van <?php echo esc_html(wp_date('j M Y, H:i', (int) $huidig['backup']['updated'])); ?>)
                        </span>
                    </span>
                <?php endif; ?>
            </p>
        <?php endif; ?>

        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('mymmo_forms_step_save'); ?>
            <input type="hidden" name="action" value="mymmo_forms_step_save">
            <input type="hidden" name="mymmo_step_id" value="<?php echo esc_attr($huidig ? (string) $huidig['id'] : ''); ?>">

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mymmoStapNaam">Naam</label></th>
                    <td>
                        <input type="text" class="regular-text" id="mymmoStapNaam" name="mymmo_step_name"
                               value="<?php echo esc_attr($huidig ? (string) $huidig['name'] : ''); ?>" required>
                        <p class="description">
                            Voor jezelf, in de lijst hierboven. De naam in <code>steps=</code> wordt hier
                            <?php echo $huidig ? 'niet meer uit afgeleid — die blijft <code>' . esc_html((string) $huidig['id']) . '</code>' : 'uit afgeleid'; ?>.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoStapTitel">Titel boven de stap</label></th>
                    <td>
                        <input type="text" class="regular-text" id="mymmoStapTitel" name="mymmo_step_title"
                               value="<?php echo esc_attr($huidig ? (string) $huidig['title'] : ''); ?>">
                        <p class="description">
                            Optioneel. Laat leeg als je de vraag zelf in je HTML zet — dat is meestal beter,
                            want dan staat ze waar jij ze wil.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoStapSub">Regel onder de titel</label></th>
                    <td>
                        <input type="text" class="regular-text" id="mymmoStapSub" name="mymmo_step_sub"
                               value="<?php echo esc_attr($huidig ? (string) $huidig['sub'] : ''); ?>">
                        <p class="description">
                            Optioneel, en alleen zinvol als er hierboven een titel staat. Dezelfde plek en
                            dezelfde stijl als de regel onder de titel van het formulier (de laatste stap),
                            zodat alle stappen er hetzelfde uitzien.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoStapVelden">Levert deze sleutels</label></th>
                    <td>
                        <input type="text" class="regular-text code" id="mymmoStapVelden" name="mymmo_step_fields"
                               value="<?php echo esc_attr($huidig ? implode(', ', (array) $huidig['fields']) : ''); ?>"
                               placeholder="aantal_gebouwen, type_gebouw">
                        <p class="description">
                            De sleutels van de <strong>verborgen velden</strong> die deze stap invult, gescheiden
                            met een komma. Zolang er één leeg is, blijft “Volgende” uit. Laat leeg als de stap
                            niets hoeft op te leveren (een introscherm bijvoorbeeld).
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Navigatie</th>
                    <td>
                        <fieldset>
                            <label>
                                <input type="radio" name="mymmo_step_nav" value="plugin"
                                       <?php checked(!$huidig || $huidig['nav'] !== 'zelf'); ?>>
                                De plugin zet de knoppen “Vorige” en “Volgende”
                            </label><br>
                            <label>
                                <input type="radio" name="mymmo_step_nav" value="zelf"
                                       <?php checked($huidig && $huidig['nav'] === 'zelf'); ?>>
                                Mijn HTML doet de navigatie zelf (<code>api.volgende()</code>)
                            </label>
                        </fieldset>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoStapNext">Opschrift “Volgende”</label></th>
                    <td>
                        <input type="text" class="regular-text" id="mymmoStapNext" name="mymmo_step_next"
                               value="<?php echo esc_attr($huidig ? (string) $huidig['next'] : ''); ?>"
                               placeholder="Volgende">
                        <p class="description">
                            Leeg = de vertaalde standaardtekst van het formulier. Vul dit alleen in als deze
                            stap iets anders moet zeggen (“Bereken mijn formule”); op een anderstalige pagina
                            typ je wat je zelf invult niet mee vertaald.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoStapHtml">HTML</label></th>
                    <td>
                        <?php if (Mymmo_Forms_Steps::examples() !== []) : ?>
                            <p>
                                <label for="mymmoStapVoorbeeld" class="screen-reader-text">Voorbeeld</label>
                                <select id="mymmoStapVoorbeeld">
                                    <option value="">— voorbeeld kiezen —</option>
                                    <?php foreach (Mymmo_Forms_Steps::examples() as $id => $naam) : ?>
                                        <option value="<?php echo esc_attr((string) $id); ?>"><?php echo esc_html((string) $naam); ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <button type="button" class="button" id="mymmoStapVoorbeeldKnop">Voorbeeld invoegen</button>
                                <span class="description">Vervangt wat er nu in het veld staat.</span>
                            </p>
                        <?php endif; ?>

                        <textarea id="mymmoStapHtml" name="mymmo_step_html" rows="24" class="large-text code"
                                  spellcheck="false"><?php echo esc_textarea($huidig ? (string) $huidig['html'] : ''); ?></textarea>
                    </td>
                </tr>
            </table>

            <?php submit_button($huidig ? 'Stap bewaren' : 'Stap aanmaken'); ?>
        </form>

        <?php if ($huidig && (array) $huidig['teksten'] !== []) : ?>
            <hr style="margin:26px 0;">
            <h2>Aangepaste teksten</h2>
            <p class="description" style="max-width:640px;">
                Dit zijn de zinnen die iemand in het voorbeeld van de bouwer heeft aangepast. Ze staan
                <strong>naast</strong> de HTML hierboven, niet erin — laad je de code opnieuw in, dan
                grijpen ze gewoon weer. Ze horen bij de stap, dus ze gelden in elk formulier waar deze
                stap in staat. Wijzigt het origineel in de HTML, dan valt de aanpassing vanzelf weg.
            </p>
            <table class="widefat striped" style="max-width:900px;">
                <thead>
                    <tr><th style="width:50%;">In de code staat</th><th>Er wordt getoond</th></tr>
                </thead>
                <tbody>
                    <?php foreach ((array) $huidig['teksten'] as $origineel => $nieuw) : ?>
                        <tr>
                            <td><code><?php echo esc_html((string) $origineel); ?></code></td>
                            <td><?php echo esc_html((string) $nieuw); ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <p>
                <form method="post"
                      action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                      data-mymmo-bevestig="Alle aangepaste teksten van deze stap weghalen? De zinnen uit de code komen dan terug.">
                    <?php wp_nonce_field('mymmo_forms_step_teksten_leeg'); ?>
                    <input type="hidden" name="action" value="mymmo_forms_step_teksten_leeg">
                    <input type="hidden" name="mymmo_step_id" value="<?php echo esc_attr((string) $huidig['id']); ?>">
                    <button type="submit" class="button">Aangepaste teksten weghalen</button>
                </form>
            </p>
        <?php endif; ?>

        <?php self::render_stappen_hulp(); ?>
        <?php
    }

    /** De melding na een redirect van een van de admin-post-acties. */
    private static function stappen_melding(): void {
        $ok = isset($_GET['mymmo_step_ok']) ? sanitize_key(wp_unslash($_GET['mymmo_step_ok'])) : '';
        $fout = isset($_GET['mymmo_step_fout']) ? sanitize_key(wp_unslash($_GET['mymmo_step_fout'])) : '';

        $teksten_ok = [
            'bewaard'     => 'De stap is bewaard.',
            'verwijderd'  => 'De stap is verwijderd.',
            'teruggezet'  => 'De vorige versie staat terug. De versie van daarnet is nu de “vorige versie”, dus je kan het weer omdraaien.',
        ];
        $teksten_fout = [
            'naam'        => 'Geef de stap een naam.',
            'vol'         => 'Er zijn al 40 stappen. Verwijder er een voor je een nieuwe maakt.',
            'groot'       => 'Die HTML is te groot (meer dan 400 KB). Haal er afbeeldingen uit en zet ze in de mediabibliotheek.',
            'geen-backup' => 'Van deze stap is geen vorige versie bewaard.',
        ];

        if (isset($teksten_ok[$ok])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($teksten_ok[$ok]) . '</p></div>';
        }
        if (isset($teksten_fout[$fout])) {
            echo '<div class="notice notice-error"><p>' . esc_html($teksten_fout[$fout]) . '</p></div>';
        }
    }

    /**
     * Wat een stap mag verwachten van de reeks eromheen.
     *
     * Deze uitleg staat hier en niet alleen in de README: wie een stap schrijft,
     * zit op dit scherm. Een contract dat je moet gaan opzoeken, wordt geraden.
     */
    /**
     * De kiezer voor een stappenREEKS: meerdere stappen, in een volgorde.
     *
     * Waarom geen <select multiple> en geen keuzelijst met komma's: een reeks is
     * geordend. `steps="a,b"` en `steps="b,a"` zijn twee verschillende
     * formulieren, en dat is precies wat een meervoudige keuzelijst NIET kan
     * uitdrukken -- die geeft je de volgorde van de opties terug, niet die van
     * je keuzes. Tot 1.15.9 stond hier één gewone dropdown met de hint "meerdere
     * reeksen? Typ ze met een komma in de shortcode": de bouwer kon dus niet wat
     * de shortcode wel kon, en wie het toch probeerde moest de namen uit het
     * hoofd kennen.
     *
     * De opslag blijft een KOMMA-GESCHEIDEN STRING in een verborgen veld met
     * hetzelfde id als vroeger. Zo blijven `waardeVan()`, `zetVeld()` en de
     * luisteraars in mymmo-forms-admin.js ongewijzigd werken, en blijft de
     * shortcode hetzelfde. De <ul> eronder is enkel de weergave; de waarheid
     * staat in dat ene veld.
     *
     * @param array<string,array<string,mixed>> $stappen_lijst
     */
    private static function render_stap_kiezer(string $veld_id, string $kop, string $hint, array $stappen_lijst, string $extra_attr = ''): void {
        ?>
        <div class="mymmo-veld"<?php echo $extra_attr !== '' ? ' ' . $extra_attr : ''; ?>>
            <span class="mymmo-veld-kop"><?php echo esc_html($kop); ?></span>
            <span class="mymmo-hint"><?php echo esc_html($hint); ?></span>

            <?php if ($stappen_lijst === []) : ?>
                <span class="mymmo-hint">
                    Er zijn nog geen stappen. Maak er een bij
                    <a href="<?php echo esc_url(admin_url('options-general.php?page=mymmo-forms&tab=stappen')); ?>">Stappen</a>.
                </span>
            <?php else : ?>
                <?php
                // De lijst wordt door JavaScript gevuld uit het verborgen veld.
                // Zonder JS blijft het veld zelf zichtbaar (zie hieronder), dus
                // de pagina is dan nog steeds te gebruiken.
                ?>
                <ul class="mymmo-volgorde mymmo-stapkiezer"
                    data-mymmo-stapkiezer="<?php echo esc_attr($veld_id); ?>"></ul>

                <p class="mymmo-stapkiezer-leeg" data-mymmo-stapkiezer-leeg="<?php echo esc_attr($veld_id); ?>">
                    Nog geen stappen gekozen — de bezoeker krijgt meteen het formulier.
                </p>

                <div class="mymmo-stapkiezer-toevoegen">
                    <select data-mymmo-stapkies="<?php echo esc_attr($veld_id); ?>" aria-label="<?php echo esc_attr($kop); ?>: stap toevoegen">
                        <option value="">&mdash; stap toevoegen &mdash;</option>
                        <?php foreach ($stappen_lijst as $sid => $stap) : ?>
                            <option value="<?php echo esc_attr((string) $sid); ?>">
                                <?php echo esc_html((string) ($stap['name'] ?? $sid)); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            <?php endif; ?>

            <?php
            // Het echte veld. `hidden` zodra er een kiezer boven staat; zonder
            // stappen op de site blijft het een gewoon tekstveld, zodat je een
            // reeks van een andere site alsnog kan overtypen.
            ?>
            <input type="<?php echo $stappen_lijst === [] ? 'text' : 'hidden'; ?>"
                   id="<?php echo esc_attr($veld_id); ?>"
                   class="mymmo-stapkiezer-veld"
                   value=""
                   placeholder="stap-een, stap-twee">
        </div>
        <?php
    }

    private static function render_stappen_hulp(): void {
        ?>
        <hr style="margin:30px 0 20px;">
        <h2>Wat je in een stap kan gebruiken</h2>

        <div style="max-width:60em;">
            <h3 style="margin-bottom:4px;">Zonder JavaScript</h3>
            <p>
                Zet <code>data-mymmo-waarde="sleutel"</code> op een <code>input</code>, <code>select</code> of
                <code>textarea</code>. De reeks leest die waarde mee en zet ze in het verborgen veld met
                dezelfde naam. Meer is er niet nodig.
            </p>

            <h3 style="margin-bottom:4px;">Met JavaScript</h3>
            <pre class="code" style="background:#f6f7f7;padding:12px;overflow:auto;">MymmoStappen.stap(document.currentScript, function (api) {
  api.zet('aantal_gebouwen', 12);   // waarde afleveren
  api.lees('aantal_gebouwen');      // ook waarden uit eerdere stappen
  api.geldig(true);                 // zelf beslissen of "Volgende" mag
  api.volgende();                   // zelf doorgaan (nodig bij nav="zelf")
  api.bij('tonen', function () {});  // de stap komt in beeld — hier meet je
});</pre>
            <p class="description">
                <code>api.el</code> is jouw stap. Zoek daarbinnen (<code>api.el.querySelector(...)</code>) en
                gebruik géén <code>id=""</code>: dezelfde stap kan twee keer op een pagina staan, en dan zou de
                tweede de eerste besturen.
            </p>

            <h3 style="margin-bottom:4px;">Waar de waarde terechtkomt</h3>
            <p>
                In het verborgen veld van het formulier met exact dezelfde sleutel. Bestaat dat veld niet, dan
                gaat de waarde nergens heen — de reeks meldt dat in de console van de browser, en een beheerder
                ziet het boven het formulier staan. Verborgen velden maak je in de Operations Manager, bij het
                formulier zelf.
            </p>

            <h3 style="margin-bottom:4px;">Waar je op moet letten</h3>
            <ul class="ul-disc">
                <li>Een stap staat bij het laden van de pagina op <code>hidden</code>. Meten (breedtes, hoogtes)
                    kan daar niet — doe dat in <code>api.bij('tonen', …)</code>.</li>
                <li>Je CSS staat op de hele pagina. Geef je klassen een eigen voorvoegsel.</li>
                <li>Gebruik de kleuren van het formulier (<code>var(--mf-accent)</code>,
                    <code>var(--mf-text)</code>, <code>var(--mf-muted)</code>, <code>var(--mf-border)</code>),
                    dan volgt je stap automatisch het thema van de site.</li>
                <li>Zonder JavaScript vallen alle HTML-stappen weg en ziet de bezoeker meteen het formulier,
                    met lege verborgen velden. Maak van zo'n veld dus nooit een verplicht veld in de OM.</li>
            </ul>
        </div>
        <?php
    }

    /**
     * De attributen die het voorbeeld mag meekrijgen.
     *
     * Een gesloten lijst, en niet "alles wat er binnenkomt": deze waarden gaan
     * rechtstreeks naar de shortcode-renderer. Wat er niet in staat, bestaat
     * voor het voorbeeld niet.
     */
    private const PREVIEW_ATTS = Mymmo_Forms_Presets::ATTS;

    /**
     * Het venster echt renderen voor het voorbeeld in de bouwer.
     *
     * Geen aparte "voorbeeldweergave": dit is dezelfde aanroep die de shortcode
     * op een pagina doet. Zou het voorbeeld zijn eigen HTML maken, dan is het
     * precies zo betrouwbaar als de laatste keer dat iemand beide gelijk zette
     * -- en dat is de reden dat er nu nog gepubliceerd moet worden om te zien
     * of iets klopt.
     */
    public static function handle_preview(): void {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Geen toegang.'], 403);
        }
        check_ajax_referer('mymmo_forms_preview', 'nonce');

        $atts = [];
        foreach (self::PREVIEW_ATTS as $naam) {
            if (isset($_POST[$naam])) {
                $atts[$naam] = sanitize_text_field(wp_unslash((string) $_POST[$naam]));
            }
        }

        $soort = ((string) ($_POST['soort'] ?? '')) === 'knop' ? 'knop' : 'inline';

        if (($atts['slug'] ?? '') === '') {
            wp_send_json_error(['message' => 'Kies eerst een formulier.'], 400);
        }

        if ($soort === 'knop') {
            $html = Mymmo_Forms_Shortcodes::render_button($atts);
        } else {
            $html = Mymmo_Forms_Shortcodes::render([
                'slug'  => $atts['slug'],
                'title' => $atts['title'] ?? 'yes',
                'lang'  => $atts['lang'] ?? '',
            ]);
        }

        if (trim($html) === '') {
            wp_send_json_error(['message' => 'Dit formulier kon niet opgehaald worden.'], 502);
        }

        wp_send_json_success(['html' => $html, 'soort' => $soort]);
    }

    public static function register(): void {
        register_setting(self::GROUP, 'mymmo_forms_api_base', [
            'type'              => 'string',
            'sanitize_callback' => [self::class, 'sanitize_base'],
            'default'           => '',
        ]);

        register_setting(self::GROUP, 'mymmo_forms_site_key', [
            'type'              => 'string',
            'sanitize_callback' => [self::class, 'sanitize_key_value'],
            'default'           => '',
        ]);

        register_setting(self::GROUP, 'mymmo_forms_follow_theme', [
            'type'              => 'boolean',
            'sanitize_callback' => static fn ($v) => $v ? 1 : 0,
            'default'           => 1,
        ]);

        register_setting(self::GROUP, Mymmo_Forms_Booking::OPTION, [
            'type'              => 'string',
            'sanitize_callback' => static fn ($v) => sanitize_title((string) $v),
            'default'           => '',
        ]);

        register_setting(self::GROUP, 'mymmo_forms_cache_ttl', [
            'type'              => 'integer',
            'sanitize_callback' => static fn ($v) => max(0, min(3600, (int) $v)),
            'default'           => 300,
        ]);
    }

    public static function sanitize_base($value): string {
        $url = esc_url_raw(trim((string) $value));
        // Enkel https: de sitesleutel gaat in een header mee, en die hoort niet
        // over een onversleutelde verbinding.
        if ($url !== '' && !str_starts_with($url, 'https://')) {
            add_settings_error(self::GROUP, 'base', 'De basis-URL moet met https:// beginnen.');
            return (string) get_option('mymmo_forms_api_base', '');
        }
        return rtrim($url, '/');
    }

    /**
     * Een leeg veld betekent "niet wijzigen", niet "wissen". Anders wist een
     * beheerder de sleutel door het formulier op te slaan zonder 'm opnieuw te
     * typen -- en die staat er als bolletjes, dus dat gebeurt gegarandeerd.
     */
    public static function sanitize_key_value($value): string {
        $ingevuld = trim((string) $value);
        if ($ingevuld === '') {
            return (string) get_option('mymmo_forms_site_key', '');
        }
        return sanitize_text_field($ingevuld);
    }

    /** De URL van deze pagina, op een bepaald tabblad. */
    private static function tab_url(string $tab, array $extra = []): string {
        $url = admin_url('options-general.php?page=' . self::PAGE . '&tab=' . $tab);
        foreach ($extra as $sleutel => $waarde) {
            $url = add_query_arg($sleutel, $waarde, $url);
        }
        return $url;
    }

    private static function huidige_tab(): string {
        $tab = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : '';

        if ($tab === self::TAB_VERBINDING) {
            return self::TAB_VERBINDING;
        }
        if ($tab === self::TAB_STAPPEN) {
            return self::TAB_STAPPEN;
        }
        if ($tab === self::TAB_INGANGEN) {
            return self::TAB_INGANGEN;
        }
        return self::TAB_SHORTCODE;
    }

    public static function handle_purge(): void {
        if (!current_user_can('manage_options') || !check_admin_referer('mymmo_forms_purge')) {
            wp_die('Geen toegang.');
        }

        Mymmo_Forms_Cache::purge_all();
        // Terug naar het tabblad waar de knop stond, niet naar het eerste.
        wp_safe_redirect(self::tab_url(self::TAB_VERBINDING, ['mymmo_purged' => '1']));
        exit;
    }

    /**
     * Alleen de FORMULIERENLIJST opnieuw ophalen. Bewust los van "Cache legen":
     * dat gooit ook de bewaarde formulieren weg die de website nodig heeft, en
     * daar is geen enkele reden voor als je gewoon een nieuw formulier in de
     * lijst wil zien.
     */
    public static function handle_reload_index(): void {
        if (!current_user_can('manage_options') || !check_admin_referer('mymmo_forms_reload_index')) {
            wp_die('Geen toegang.');
        }

        Mymmo_Forms_Cache::purge_index();
        Mymmo_Forms_Api_Client::list_forms(true);

        wp_safe_redirect(self::tab_url(self::TAB_SHORTCODE, ['mymmo_reloaded' => '1']));
        exit;
    }

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $tab = self::huidige_tab();
        ?>
        <div class="wrap">
            <h1>Mymmo Forms</h1>

            <h2 class="nav-tab-wrapper">
                <a href="<?php echo esc_url(self::tab_url(self::TAB_SHORTCODE)); ?>"
                   class="nav-tab <?php echo $tab === self::TAB_SHORTCODE ? 'nav-tab-active' : ''; ?>">
                    Popups
                </a>
                <a href="<?php echo esc_url(self::tab_url(self::TAB_INGANGEN)); ?>"
                   class="nav-tab <?php echo $tab === self::TAB_INGANGEN ? 'nav-tab-active' : ''; ?>">
                    Ingangen
                </a>
                <a href="<?php echo esc_url(self::tab_url(self::TAB_STAPPEN)); ?>"
                   class="nav-tab <?php echo $tab === self::TAB_STAPPEN ? 'nav-tab-active' : ''; ?>">
                    Stappen
                </a>
                <a href="<?php echo esc_url(self::tab_url(self::TAB_VERBINDING)); ?>"
                   class="nav-tab <?php echo $tab === self::TAB_VERBINDING ? 'nav-tab-active' : ''; ?>">
                    Verbinding
                </a>
            </h2>

            <?php
            if ($tab === self::TAB_VERBINDING) {
                self::render_verbinding();
            } elseif ($tab === self::TAB_INGANGEN) {
                self::render_ingangen();
            } elseif ($tab === self::TAB_STAPPEN) {
                self::render_stappen();
            } else {
                self::render_shortcode();
            }
            ?>
        </div>
        <?php
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Tabblad: ingangen
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * De INGANGEN van een venster beheren.
     *
     * Een opstelling is het venster; een ingang is een manier om het te openen.
     * Er zijn er zoveel als je wil, van drie soorten -- een knop, een klasse op
     * iets dat er al staat, of een callout die een onderdeel al toont.
     *
     * Dit staat bewust op een eigen tabblad en niet in de bouwer. Zolang "hoe
     * toon je het" een keuze IN de opstelling was, had je per manier een kopie
     * van het hele venster nodig, en moest je bij elke wijziging raden welke
     * kopie waar stond.
     */
    private static function render_ingangen(): void {
        $vensters = array_filter(
            Mymmo_Forms_Presets::all(),
            static fn ($o) => $o['soort'] === 'knop'
        );
        $stappen  = class_exists('Mymmo_Forms_Steps') ? Mymmo_Forms_Steps::all() : [];
        $ingangen = Mymmo_Forms_Entrypoints::all();

        // Bewerken? Dan staat het id in de URL. Anders een lege nieuwe ingang.
        $bewerk_id = isset($_GET['mymmo_entry_edit'])
            ? sanitize_title(wp_unslash((string) $_GET['mymmo_entry_edit']))
            : '';
        $huidig = $bewerk_id !== '' ? Mymmo_Forms_Entrypoints::get($bewerk_id) : null;
        $waarde = static function (string $naam) use ($huidig): string {
            return (string) ($huidig['atts'][$naam] ?? '');
        };

        self::ingangen_melding();
        ?>
        <?php if ($vensters === []) : ?>
            <div class="notice notice-warning"><p>
                Er is nog geen opstelling met een venster. Maak er eerst een bij
                <a href="<?php echo esc_url(self::tab_url(self::TAB_SHORTCODE)); ?>">Popups</a>
                (kies <strong>Knop die een venster opent</strong>) en bewaar ze. Daarna kan je hier
                zoveel ingangen maken als je wil.
            </p></div>
            <?php return; ?>
        <?php endif; ?>

        <p class="description" style="max-width:46em;">
            Een <strong>opstelling</strong> is het venster: welk formulier, welke tabbladen, welke
            agenda. Een <strong>ingang</strong> is een manier om dat venster te openen. Je kan er
            zoveel maken als je wil — twee knoppen met andere copy, een klasse op een knop van je
            thema, en een callout per vraag die je wil uitlichten.
        </p>

        <h2>Bestaande ingangen</h2>

        <?php if ($ingangen === []) : ?>
            <p>Er is er nog geen. Maak er hieronder een.</p>
        <?php else : ?>
            <?php foreach ($vensters as $venster) : ?>
                <?php $bij_dit_venster = Mymmo_Forms_Entrypoints::for_preset($venster['id']); ?>
                <?php if ($bij_dit_venster === []) { continue; } ?>
                <h3 style="margin-bottom:4px;"><?php echo esc_html($venster['name']); ?></h3>
                <table class="widefat striped" style="margin-bottom:18px;">
                    <thead>
                        <tr>
                            <th style="width:22em;">Ingang</th>
                            <th>Op je pagina</th>
                            <th style="width:12em;">Actie</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($bij_dit_venster as $ingang) : ?>
                            <tr>
                                <td>
                                    <strong><?php echo esc_html($ingang['name']); ?></strong><br>
                                    <span class="description"><?php
                                        echo esc_html(self::ingang_omschrijving($ingang, $stappen));
                                    ?></span>
                                </td>
                                <td>
                                    <code><?php echo esc_html(Mymmo_Forms_Entrypoints::shortcode_tekst($ingang)); ?></code>
                                    <?php $klasse = Mymmo_Forms_Entrypoints::klasse_van($ingang); ?>
                                    <?php if ($klasse !== '') : ?>
                                        <br><span class="description">
                                            Zet deze shortcode één keer op de pagina (ze toont niets) en geef
                                            je knop, afbeelding of icoon de klasse
                                            <code><?php echo esc_html($klasse); ?></code>.
                                        </span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <a class="button button-small"
                                       href="<?php echo esc_url(self::tab_url(self::TAB_INGANGEN, ['mymmo_entry_edit' => $ingang['id']])); ?>">Bewerken</a>
                                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                                          style="display:inline;"
                                          onsubmit="return confirm('Deze ingang verwijderen? De pagina waar de shortcode staat, toont daarna niets meer.');">
                                        <?php wp_nonce_field('mymmo_forms_entry_delete'); ?>
                                        <input type="hidden" name="action" value="mymmo_forms_entry_delete">
                                        <input type="hidden" name="mymmo_entry_id" value="<?php echo esc_attr($ingang['id']); ?>">
                                        <button type="submit" class="button button-small button-link-delete">Verwijderen</button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endforeach; ?>
        <?php endif; ?>

        <h2><?php echo $huidig ? 'Ingang bewerken: ' . esc_html((string) $huidig['name']) : 'Nieuwe ingang'; ?></h2>

        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" id="mymmoIngangForm">
            <?php wp_nonce_field('mymmo_forms_entry_save'); ?>
            <input type="hidden" name="action" value="mymmo_forms_entry_save">
            <input type="hidden" name="mymmo_entry_id" value="<?php echo esc_attr((string) ($huidig['id'] ?? '')); ?>">

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mymmoIngangNaam">Naam</label></th>
                    <td>
                        <input type="text" class="regular-text" id="mymmoIngangNaam" name="mymmo_entry_name"
                               value="<?php echo esc_attr((string) ($huidig['name'] ?? '')); ?>" required>
                        <p class="description">Alleen voor jezelf, om hem terug te vinden.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmoIngangPopup">Welk venster</label></th>
                    <td>
                        <select id="mymmoIngangPopup" name="mymmo_entry_popup" required>
                            <?php foreach ($vensters as $venster) : ?>
                                <option value="<?php echo esc_attr($venster['id']); ?>"
                                    <?php selected((string) ($huidig['popup'] ?? ''), $venster['id']); ?>>
                                    <?php echo esc_html($venster['name']); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">
                            Alles wat in die opstelling staat blijft gelden: de tabbladen, de agenda,
                            de zijkolom, het dankjewelscherm. Deze ingang is enkel een manier om het
                            te openen.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Soort ingang</th>
                    <td>
                        <fieldset id="mymmoIngangSoort">
                            <?php
                            $soort_nu = (string) ($huidig['soort'] ?? 'knop');
                            $soorten  = [
                                'knop'    => ['Knop', 'Een knop met een eigen opschrift en kleur.'],
                                'klasse'  => ['Klasse op een bestaand element', 'Een knop van je thema, een afbeelding, een icoon.'],
                                'callout' => ['Callout', 'Een blok dat een stap, het formulier of de agenda al toont.'],
                            ];
                            foreach ($soorten as $sleutel => $paar) :
                                ?>
                                <label style="display:block;margin-bottom:6px;">
                                    <input type="radio" name="mymmo_entry_soort" value="<?php echo esc_attr($sleutel); ?>"
                                        <?php checked($soort_nu, $sleutel); ?>>
                                    <strong><?php echo esc_html($paar[0]); ?></strong>
                                    <span class="description">— <?php echo esc_html($paar[1]); ?></span>
                                </label>
                            <?php endforeach; ?>
                        </fieldset>
                    </td>
                </tr>
            </table>

            <div data-mymmo-ingang="knop">
                <h3>De knop</h3>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmoIngangLabel">Opschrift</label></th>
                        <td><input type="text" class="regular-text" id="mymmoIngangLabel" name="mymmo_entry_label"
                                   value="<?php echo esc_attr($waarde('label')); ?>"
                                   placeholder="leeg = de naam van het formulier"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangVariant">Vorm</label></th>
                        <td>
                            <select id="mymmoIngangVariant" name="mymmo_entry_variant">
                                <option value="primary" <?php selected($waarde('variant'), 'primary'); ?>>Gevuld</option>
                                <option value="outline" <?php selected($waarde('variant'), 'outline'); ?>>Omlijnd</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangAccent">Kleur</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmoIngangAccent" name="mymmo_entry_accent"
                                   value="<?php echo esc_attr($waarde('accent')); ?>" placeholder="#0369a1 — leeg = de kleur van het venster">
                            <br>
                            <input type="text" class="regular-text code" name="mymmo_entry_accent_text"
                                   value="<?php echo esc_attr($waarde('accent_text')); ?>" placeholder="tekstkleur op die knop">
                        </td>
                    </tr>
                </table>
            </div>

            <?php // Geldt voor een knop EN een klasse: allebei openen ze het venster. ?>
            <div data-mymmo-ingang="knop klasse">
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmoIngangTab">Welk tabblad opent</label></th>
                        <td>
                            <select id="mymmoIngangTab" name="mymmo_entry_tab">
                                <option value="" <?php selected($waarde('tab'), ''); ?>>Het bovenste tabblad</option>
                                <option value="form" <?php selected($waarde('tab'), 'form'); ?>>Het formulier</option>
                                <option value="extra" <?php selected($waarde('tab'), 'extra'); ?>>Het derde tabblad</option>
                                <option value="calendly" <?php selected($waarde('tab'), 'calendly'); ?>>De agenda</option>
                            </select>
                            <p class="description">
                                Een knop "Plan een gesprek" hoort op de agenda uit te komen, niet op het
                                formulier. Geldt ook voor een klasse-ingang; bij een callout volgt het
                                tabblad uit wat ze uitlicht.
                            </p>
                        </td>
                    </tr>
                </table>
            </div>

            <div data-mymmo-ingang="klasse">
                <h3>De klasse</h3>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmoIngangTrigger">Klassenaam</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmoIngangTrigger" name="mymmo_entry_trigger"
                                   value="<?php echo esc_attr($waarde('trigger')); ?>" placeholder="open-offerte">
                            <p class="description">
                                Zet deze klasse op een knop, een afbeelding of een icoon dat al op je pagina
                                staat; klikken opent dan het venster. De shortcode van deze ingang zet je
                                één keer op diezelfde pagina — ze toont zelf niets, maar zonder haar staat
                                het venster er niet.
                            </p>
                        </td>
                    </tr>
                </table>
            </div>

            <div data-mymmo-ingang="callout">
                <h3>De callout</h3>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmoIngangHighlight">Wat licht je uit</label></th>
                        <td>
                            <select id="mymmoIngangHighlight" name="mymmo_entry_highlight">
                                <option value="form" <?php selected($waarde('highlight'), 'form'); ?>>Het formulier</option>
                                <option value="calendly" <?php selected($waarde('highlight'), 'calendly'); ?>>De agenda</option>
                                <?php foreach ($stappen as $stap) : ?>
                                    <option value="<?php echo esc_attr((string) $stap['id']); ?>"
                                        <?php selected($waarde('highlight'), (string) $stap['id']); ?>>
                                        Stap: <?php echo esc_html((string) $stap['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description">
                                Dit onderdeel staat in de callout én komt vooraan in het venster te staan.
                                Wat de bezoeker hier invult, staat daar al ingevuld.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangLayout">Indeling</label></th>
                        <td>
                            <select id="mymmoIngangLayout" name="mymmo_entry_layout">
                                <option value="kolommen" <?php selected($waarde('layout'), 'kolommen'); ?>>
                                    Twee kolommen — tekst en afbeelding naast het onderdeel
                                </option>
                                <option value="breed" <?php selected($waarde('layout'), 'breed'); ?>>
                                    Volle breedte — titel en tekst erboven, onderdeel eronder
                                </option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangRatio">Verdeling</label></th>
                        <td>
                            <select id="mymmoIngangRatio" name="mymmo_entry_ratio">
                                <?php foreach (Mymmo_Forms_Entrypoints::VERDELINGEN as $sleutel => $paar) : ?>
                                    <option value="<?php echo esc_attr((string) $sleutel); ?>"
                                        <?php selected($waarde('ratio') !== '' ? $waarde('ratio') : '1:2', (string) $sleutel); ?>>
                                        <?php echo esc_html($paar[0]); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description">
                                De linkerkolom (titel en tekst) tegenover de rechter (het uitgelichte
                                onderdeel). Alleen bij twee kolommen.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangMaxWidth">Breedte</label></th>
                        <td>
                            <input type="text" class="small-text code" id="mymmoIngangMaxWidth"
                                   name="mymmo_entry_max_width"
                                   value="<?php echo esc_attr($waarde('max_width')); ?>" placeholder="1200px">
                            <p class="description">
                                Het blok breekt uit de inhoudskolom van je pagina en gaat tot deze maat,
                                gecentreerd. Leeg = 1200px.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangRadius">Hoeken</label></th>
                        <td>
                            <input type="text" class="small-text code" id="mymmoIngangRadius"
                                   name="mymmo_entry_radius"
                                   value="<?php echo esc_attr($waarde('radius')); ?>" placeholder="18px">
                            <p class="description">Leeg = volgt het thema. Zet er <code>0</code> voor rechte hoeken.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangPad">Opvulling</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmoIngangPad"
                                   name="mymmo_entry_pad"
                                   value="<?php echo esc_attr($waarde('pad')); ?>" placeholder="20px 62px">
                            <p class="description">
                                De ruimte binnen het blok, tot vier maten zoals in CSS
                                (<code>24px</code> of <code>20px 62px</code>). Leeg = groeit mee met de
                                breedte. Zet dit gelijk aan de opvulling van de kaarten ernaast als de
                                callout daartussen staat.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangPadMobile">Opvulling op een telefoon</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmoIngangPadMobile"
                                   name="mymmo_entry_pad_mobile"
                                   value="<?php echo esc_attr($waarde('pad_mobile')); ?>" placeholder="20px 16px">
                            <p class="description">
                                Apart, want een zijmarge die op een pagina klopt is op 375px te veel.
                                Leeg = 20px 16px, ongeacht wat er hierboven staat.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangTextPad">Inspringing van de tekst</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmoIngangTextPad"
                                   name="mymmo_entry_text_pad"
                                   value="<?php echo esc_attr($waarde('text_pad')); ?>" placeholder="28px 0 0">
                            <p class="description">
                                Extra ruimte rond de titel en de tekst, b&oacute;venop de opvulling
                                hierboven &mdash; het uitgelichte onderdeel schuift dus niet mee. Zo laat
                                je de titel op dezelfde lijn beginnen als de tekst in de kaarten ernaast.
                                Leeg = de standaarduitlijning met het witte vlak.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangTextPadMobile">Inspringing van de tekst op een telefoon</label></th>
                        <td>
                            <input type="text" class="regular-text code" id="mymmoIngangTextPadMobile"
                                   name="mymmo_entry_text_pad_mobile"
                                   value="<?php echo esc_attr($waarde('text_pad_mobile')); ?>" placeholder="24px 36px 0">
                            <p class="description">
                                Leeg = dezelfde waarde als hierboven. Onder 600px staat alles onder
                                elkaar, dus hier bepaalt dit hoe ver de tekst inspringt terwijl het
                                formulier de volle breedte houdt.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangSpace">Ruimte boven en onder</label></th>
                        <td>
                            <input type="text" class="small-text code" id="mymmoIngangSpace"
                                   name="mymmo_entry_space"
                                   value="<?php echo esc_attr($waarde('space')); ?>" placeholder="48px">
                            <p class="description">Leeg = 48px. Zet er <code>0</code> als je het tegen het blok erboven wil.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangTitle">Titel</label></th>
                        <td><input type="text" class="large-text" id="mymmoIngangTitle" name="mymmo_entry_title"
                                   value="<?php echo esc_attr($waarde('title')); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangTitleMobile">Korte titel</label></th>
                        <td>
                            <input type="text" class="large-text" id="mymmoIngangTitleMobile"
                                   name="mymmo_entry_title_mobile"
                                   value="<?php echo esc_attr($waarde('title_mobile')); ?>"
                                   placeholder="leeg = altijd de titel hierboven">
                            <p class="description">
                                Wordt getoond zodra het blok smaller is dan 620px &mdash; dus op een
                                telefoon, en ook in een smalle kolom op een groot scherm. Een kop van
                                vier regels op 375px leest als een fout.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangTitleSize">Letter van de titel</label></th>
                        <td>
                            <input type="text" class="small-text code" id="mymmoIngangTitleSize"
                                   name="mymmo_entry_title_size"
                                   value="<?php echo esc_attr($waarde('title_size')); ?>" placeholder="30px">
                            <input type="text" class="small-text code" name="mymmo_entry_title_weight"
                                   value="<?php echo esc_attr($waarde('title_weight')); ?>" placeholder="400">
                            <input type="text" class="regular-text code" name="mymmo_entry_title_color"
                                   value="<?php echo esc_attr($waarde('title_color')); ?>" placeholder="#030712">
                            <p class="description">
                                Grootte, dikte en kleur &mdash; in die volgorde. Leeg = de standaard van
                                de plugin (meegroeiend met de breedte, vet, in de tekstkleur van het
                                thema). Staat de callout tussen de kaarten van je pagina, neem dan hier
                                over wat het thema aan die kaarttitels geeft &mdash; anders is zij de
                                enige die anders oogt. Dikte uit
                                <code>300</code>&hellip;<code>900</code>, <code>normal</code> of
                                <code>bold</code>; iets anders wordt genegeerd.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangText">Tekst</label></th>
                        <td><input type="text" class="large-text" id="mymmoIngangText" name="mymmo_entry_text"
                                   value="<?php echo esc_attr($waarde('text')); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangTitleGap">Ruimte tussen titel en tekst</label></th>
                        <td>
                            <input type="text" class="small-text code" id="mymmoIngangTitleGap"
                                   name="mymmo_entry_title_gap"
                                   value="<?php echo esc_attr($waarde('title_gap')); ?>" placeholder="10px">
                            <p class="description">Leeg = 10px. Op elke breedte dezelfde.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangCta">Knoptekst</label></th>
                        <td><input type="text" class="regular-text" id="mymmoIngangCta" name="mymmo_entry_cta"
                                   value="<?php echo esc_attr($waarde('cta')); ?>"
                                   placeholder="leeg = het opschrift van het venster"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangImage">Afbeelding</label></th>
                        <td>
                            <input type="url" class="large-text code" id="mymmoIngangImage" name="mymmo_entry_image"
                                   value="<?php echo esc_attr($waarde('image')); ?>" placeholder="https://...">
                            <br>
                            <input type="text" class="regular-text" name="mymmo_entry_image_alt"
                                   value="<?php echo esc_attr($waarde('image_alt')); ?>"
                                   placeholder="beschrijving (leeg bij sfeerbeeld)">
                            <br>
                            <input type="text" class="small-text code" name="mymmo_entry_image_scale"
                                   value="<?php echo esc_attr($waarde('image_scale')); ?>" placeholder="120%">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmoIngangBg">Achtergrondkleur</label></th>
                        <td><input type="text" class="regular-text code" id="mymmoIngangBg" name="mymmo_entry_bg"
                                   value="<?php echo esc_attr($waarde('bg')); ?>"
                                   placeholder="#a7f3e4 — leeg = een lichte tint van de accentkleur"></td>
                    </tr>
                </table>
            </div>

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mymmoIngangClass">Eigen klasse(n)</label></th>
                    <td>
                        <input type="text" class="regular-text code" id="mymmoIngangClass" name="mymmo_entry_class"
                               value="<?php echo esc_attr($waarde('class')); ?>">
                        <p class="description">Om de knop of het blok in je eigen stylesheet te kunnen aanwijzen.</p>
                    </td>
                </tr>
            </table>

            <p class="submit">
                <button type="submit" class="button button-primary">
                    <?php echo $huidig ? 'Ingang bijwerken' : 'Ingang bewaren'; ?>
                </button>
                <?php if ($huidig) : ?>
                    <a class="button" href="<?php echo esc_url(self::tab_url(self::TAB_INGANGEN)); ?>">Nieuwe ingang</a>
                <?php endif; ?>
            </p>
        </form>

        <?php
        // Alleen de velden van de gekozen soort tonen. Een handvol regels, dus
        // hier en niet in een apart bestand; zonder JavaScript staat gewoon
        // alles open en werkt het formulier evengoed.
        echo wp_get_inline_script_tag(
            '(function(){var f=document.getElementById("mymmoIngangForm");if(!f)return;'
            . 'function toon(){var s=f.querySelector(\'input[name="mymmo_entry_soort"]:checked\');'
            . 'var nu=s?s.value:"knop";'
            . 'Array.prototype.forEach.call(f.querySelectorAll("[data-mymmo-ingang]"),function(b){'
            . 'b.hidden=b.getAttribute("data-mymmo-ingang").split(" ").indexOf(nu)===-1;});}'
            . 'f.addEventListener("change",function(e){if(e.target.name==="mymmo_entry_soort")toon();});'
            . 'toon();}());'
        );
    }

    /** Een regel die zegt wat deze ingang is, voor in de lijst. */
    private static function ingang_omschrijving(array $ingang, array $stappen): string {
        $soort = (string) $ingang['soort'];

        if ($soort === 'knop') {
            $label = (string) ($ingang['atts']['label'] ?? '');
            return 'Knop' . ($label !== '' ? ': "' . $label . '"' : '');
        }

        if ($soort === 'klasse') {
            return 'Klasse op een bestaand element';
        }

        $uitgelicht = (string) ($ingang['atts']['highlight'] ?? 'form');
        if ($uitgelicht === 'calendly') {
            $wat = 'de agenda';
        } elseif ($uitgelicht === '' || $uitgelicht === 'form') {
            $wat = 'het formulier';
        } else {
            $wat = 'stap "' . (string) ($stappen[$uitgelicht]['name'] ?? $uitgelicht) . '"';
        }

        $indeling = ((string) ($ingang['atts']['layout'] ?? '')) === 'breed'
            ? 'volle breedte'
            : 'twee kolommen';

        return 'Callout met ' . $wat . ', ' . $indeling;
    }

    private static function ingangen_melding(): void {
        $stand = isset($_GET['mymmo_entry']) ? sanitize_key(wp_unslash((string) $_GET['mymmo_entry'])) : '';
        if ($stand === '') {
            return;
        }

        $teksten = [
            'opgeslagen'  => ['notice-success', 'De ingang is bewaard.'],
            'verwijderd'  => ['notice-success', 'De ingang is verwijderd.'],
            'geen-venster' => ['notice-error', 'Kies eerst het venster dat deze ingang opent.'],
            'vol'         => ['notice-error', 'Er passen niet meer ingangen bij. Ruim er eerst een op.'],
        ];

        if (!isset($teksten[$stand])) {
            return;
        }

        printf(
            '<div class="notice %s is-dismissible"><p>%s</p></div>',
            esc_attr($teksten[$stand][0]),
            esc_html($teksten[$stand][1])
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tabblad 1: shortcode maken
    // ─────────────────────────────────────────────────────────────────────────

    private static function render_shortcode(): void {
        $formulieren = Mymmo_Forms_Api_Client::list_forms();
        $lijstfout   = $formulieren === null ? (string) Mymmo_Forms_Api_Client::last_error() : '';

        // De afspraken komen uit hetzelfde antwoord (dus geen tweede verzoek):
        // de Calendly-koppelingen in de Operations Manager met een bewaarde
        // boekingspagina. Is die lijst leeg of niet op te halen, dan valt het
        // agendaveld terug op een tekstvak -- een knop met venster maken mag
        // nooit afhangen van of Calendly hier bekend is.
        $afspraken = Mymmo_Forms_Api_Client::list_calendly();
        if (!is_array($afspraken)) {
            $afspraken = [];
        }

        // De stappenreeksen die op deze site bestaan. Uit de option, niet uit de
        // Operations Manager: de HTML van een stap woont in WordPress.
        $stappen_lijst = class_exists('Mymmo_Forms_Steps') ? Mymmo_Forms_Steps::all() : [];
        ?>

        <?php if (!empty($_GET['mymmo_reloaded'])) : ?>
            <div class="notice notice-success is-dismissible"><p>De formulierenlijst is opnieuw opgehaald.</p></div>
        <?php endif; ?>

        <?php
        $melding = isset($_GET['mymmo_preset']) ? sanitize_key(wp_unslash((string) $_GET['mymmo_preset'])) : '';
        $meldingen = [
            'opgeslagen'     => ['success', 'De popup is bewaard. Elke pagina die hem gebruikt, toont meteen de nieuwe versie.'],
            'verwijderd'     => ['success', 'De popup is verwijderd. Knoppen die hem openden, doen nu niets meer — kies er in de editor een andere.'],
            'vol'            => ['error', 'Er passen niet meer popups bij. Verwijder er een die je niet meer gebruikt.'],
            'geen-formulier' => ['error', 'Er was geen formulier gekozen, dus er viel niets te bewaren.'],
        ];
        ?>
        <?php if (isset($meldingen[$melding])) : ?>
            <div class="notice notice-<?php echo esc_attr($meldingen[$melding][0]); ?> is-dismissible">
                <p><?php echo esc_html($meldingen[$melding][1]); ?></p>
            </div>
        <?php endif; ?>

        <p>
            Hier beheer je de <strong>popups</strong>: wat er in elk tabblad staat en hoe het venster eruitziet.
            De teksten typ je rechtstreeks in het voorbeeld. Een knop opent een popup via het paneel
            <strong>Opent een venster</strong> in de editor. Een formulier gewoon op een pagina zet je met het
            blok <strong>Mymmo formulier</strong>. Formulieren zelf maak je in de Operations Manager, onder
            <strong>Koppelingen</strong>.
        </p>

        <?php if (!mymmo_forms_is_configured()) : ?>
            <div class="notice notice-warning">
                <p>
                    De verbinding met de Operations Manager is nog niet ingesteld, dus er valt nog niets op te halen.
                    Dat doe je eenmalig op het tabblad <a href="<?php echo esc_url(self::tab_url(self::TAB_VERBINDING)); ?>">Verbinding</a>.
                </p>
            </div>
            <?php return; ?>
        <?php endif; ?>

        <?php if ($lijstfout !== '') : ?>
            <div class="notice notice-error">
                <p><strong>De formulieren konden niet opgehaald worden.</strong></p>
                <p><?php echo esc_html($lijstfout); ?></p>
            </div>
        <?php elseif ($formulieren === []) : ?>
            <div class="notice notice-warning">
                <p>
                    Er staan nog geen <strong>gepubliceerde</strong> formulieren in de Operations Manager.
                    Een formulier dat nog op concept staat verschijnt hier niet, en toont op de website
                    ook niets — publiceer het eerst bij Koppelingen → tabblad Formulier.
                </p>
            </div>
        <?php else : ?>

            <?php
            // De talen van elk formulier gaan als JSON mee naar de browser, zodat
            // de taalkeuze alleen toont wat DIT formulier echt heeft. Anders
            // bouw je een shortcode met lang="fr" voor een formulier dat geen
            // Frans kent, en dan valt de pagina stil terug op het Nederlands
            // zonder dat iemand het merkt.
            $talen_per_formulier = [];
            foreach ($formulieren as $f) {
                $slug = (string) ($f['slug'] ?? '');
                if ($slug === '') {
                    continue;
                }
                $talen_per_formulier[$slug] = [
                    'languages' => array_values(array_map('strval', (array) ($f['languages'] ?? ['nl']))),
                    'default'   => (string) ($f['default_language'] ?? 'nl'),
                ];
            }
            $eerste = (string) ($formulieren[0]['slug'] ?? '');
            ?>

            <?php
            $opstellingen = Mymmo_Forms_Presets::all();
            $vensters = array_filter($opstellingen, static fn ($o) => $o['soort'] !== 'inline');
            $inline   = array_filter($opstellingen, static fn ($o) => $o['soort'] === 'inline');
            ?>

            <?php
            // POPUPS beheren (1.19.4). Tot nu heette dit "Opstellingen" met een
            // tabel "Shortcodes en beheer" eronder, en die tabel zette in de
            // kolom "Formulier" de slug van het berichtformulier -- wat las als
            // de naam van de popup. Een popup heeft EEN naam, die je hier wijzigt.
            //
            // HERNOEMEN houdt het id: een knop of ingang op de site wijst naar
            // dat id (`preset="..."`), dus een nieuwe naam werkt meteen door
            // zonder dat er op een pagina iets moet veranderen. Een KOPIE maken
            // is een aparte knop, en niet langer een bijwerking van een andere
            // naam typen.
            ?>
            <div class="mymmo-opstellingen">
                <div class="mymmo-opstellingen-kop">
                    <strong>Popups</strong>
                    <span class="mymmo-versie">v<?php echo esc_html(MYMMO_FORMS_VERSION); ?></span>
                    <span class="description">Klik een popup aan om hem te bewerken.</span>
                </div>

                <?php if ($vensters) : ?>
                    <div class="mymmo-opstellingen-rij">
                        <?php foreach ($vensters as $opstelling) : ?>
                            <button type="button" class="button mymmo-opstelling-knop"
                                    data-mymmo-preset-load="<?php echo esc_attr($opstelling['id']); ?>"
                                    data-mymmo-preset-name="<?php echo esc_attr($opstelling['name']); ?>"
                                    data-mymmo-preset-soort="<?php echo esc_attr($opstelling['soort']); ?>"
                                    data-mymmo-preset-atts="<?php echo esc_attr((string) wp_json_encode($opstelling['atts'])); ?>"
                                    title="Deze popup bewerken">
                                <?php echo esc_html($opstelling['name']); ?>
                            </button>
                        <?php endforeach; ?>
                    </div>
                <?php else : ?>
                    <p class="description" style="margin:0 0 8px;">
                        Er is er nog geen. Stel hieronder iets in en bewaar het.
                    </p>
                <?php endif; ?>

                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                      id="mymmoFormsPresetForm" class="mymmo-opstellingen-bewaar">
                    <?php wp_nonce_field('mymmo_forms_preset_save'); ?>
                    <input type="hidden" name="action" value="mymmo_forms_preset_save">
                    <input type="hidden" name="mymmo_preset_atts" id="mymmoFormsPresetAtts" value="">
                    <input type="hidden" name="mymmo_preset_soort" id="mymmoFormsPresetSoort" value="knop">
                    <input type="hidden" name="mymmo_preset_id" id="mymmoFormsPresetId" value="">
                    <?php // Welke popup bij de academy hoort; zie toonAcademy() in mymmo-forms-admin.js. ?>
                    <input type="hidden" id="mymmoFormsAcademyPreset" value="<?php echo esc_attr(class_exists('Mymmo_Forms_Academy') ? Mymmo_Forms_Academy::settings()['preset'] : ''); ?>">

                    <label for="mymmoFormsPresetName">Naam</label>
                    <input type="text" id="mymmoFormsPresetName" name="mymmo_preset_name"
                           class="regular-text" placeholder="bv. Contact" required>
                    <button type="submit" class="button button-primary">Bewaren</button>
                    <button type="submit" class="button" data-mymmo-preset-nieuw hidden
                            title="Bewaart dit als een aparte popup; de huidige blijft zoals hij was.">Als nieuwe popup bewaren</button>
                    <span class="description" id="mymmoFormsPresetStand"></span>
                </form>

                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                      id="mymmoFormsPresetDelete" class="mymmo-opstellingen-weg" hidden>
                    <?php wp_nonce_field('mymmo_forms_preset_delete'); ?>
                    <input type="hidden" name="action" value="mymmo_forms_preset_delete">
                    <input type="hidden" name="mymmo_preset_id" id="mymmoFormsPresetDeleteId" value="">
                    <button type="submit" class="button button-link-delete"
                            onclick="return confirm('Deze popup verwijderen? Knoppen die hem openen, doen daarna niets meer.');">Deze popup verwijderen</button>
                </form>

                <?php if ($inline) : ?>
                    <?php
                    // Opstellingen van het soort "formulier op de pagina", van voor
                    // 1.19. Ze werken nog (via hun blok of shortcode), maar horen
                    // niet in een bouwer voor popups. Enkel nog weg te halen.
                    ?>
                    <p class="description" style="margin:10px 0 0;">
                        Oudere opstellingen voor een formulier op de pagina (werken nog, bewerk ze via het blok
                        <strong>Mymmo formulier</strong>):
                        <?php foreach ($inline as $opstelling) : ?>
                            <span style="white-space:nowrap;">
                                <strong><?php echo esc_html($opstelling['name']); ?></strong>
                                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline;">
                                    <?php wp_nonce_field('mymmo_forms_preset_delete'); ?>
                                    <input type="hidden" name="action" value="mymmo_forms_preset_delete">
                                    <input type="hidden" name="mymmo_preset_id" value="<?php echo esc_attr($opstelling['id']); ?>">
                                    <button type="submit" class="button-link button-link-delete"
                                            onclick="return confirm('Deze opstelling verwijderen?');">verwijderen</button>
                                </form>
                            </span>
                        <?php endforeach; ?>
                    </p>
                <?php endif; ?>
            </div>

            <?php
            // Het voorbeeld links, de instellingen rechts. Het voorbeeld blijft
            // staan bij het scrollen, zodat je bij elke wijziging ziet wat ze
            // doet -- in plaats van naar beneden te scrollen om iets te zetten
            // en weer omhoog om het te bekijken.
            //
            // Zonder JavaScript blijft dit één kolom met de velden eronder; het
            // canvas is dan `hidden` en de grid heeft maar één kind.
            ?>
            <div class="mymmo-bouwer">
            <div class="mymmo-bouwer-voorbeeld">

            <?php
            // Het canvas staat hidden in de HTML en het script haalt dat weg.
            // Zonder JavaScript is er geen voorbeeld -- dan blijven de
            // tekstvelden hieronder staan (die worden pas verborgen zodra het
            // script ze overneemt) en is de tabel onderaan de terugval.
            ?>
            <div class="mymmo-canvas" id="mymmoFormsCanvas" hidden>
                <div class="mymmo-canvas-bar">
                    <strong>Voorbeeld</strong>
                    <span class="mymmo-canvas-hint">Klik op een tekst in het venster en typ erin.</span>
                    <span class="mymmo-canvas-spacer"></span>
                    <?php
                    // Geen bediening meer voor ruimte (1.19): marges en opvulling
                    // staan vast in de stylesheets. Een opstelling met een eigen
                    // `gap` houdt die via het verborgen veld mymmoFormsGap.
                    ?>
                    <button type="button" class="button button-small is-actief"
                            data-mymmo-device="desktop" aria-pressed="true">Desktop</button>
                    <button type="button" class="button button-small"
                            data-mymmo-device="mobiel" aria-pressed="false">Telefoon</button>
                    <?php
                    // De tekening staat in de bouwer VOORAAN, anders kan je ze
                    // niet aanwijzen om ze te verplaatsen. Op een pagina staat
                    // ze achter alles. Dat verschil is precies het soort ding
                    // waarvan je pas op de site merkt dat het anders is, dus
                    // hoort het hier omschakelbaar te zijn.
                    ?>
                    <?php
                    // Standaard ACHTERAAN, zoals een bezoeker ze ziet (1.19).
                    // Vooraan zetten is enkel nodig om ze te verslepen.
                    ?>
                    <button type="button" class="button button-small is-actief"
                            data-mymmo-figuur-laag aria-pressed="true"
                            title="De tekening staat nu zoals een bezoeker ze ziet. Zet ze vooraan om ze te kunnen verplaatsen."
                            >Tekening vooraan</button>
                    <?php
                    // Het dankjewelscherm van het open tabblad in plaats van
                    // het formulier. In het voorbeeld typ je er meteen in.
                    ?>
                    <button type="button" class="button button-small"
                            data-mymmo-dank-toon aria-pressed="false"
                            title="Toon het scherm dat een bezoeker ziet na het versturen, voor het tabblad dat openstaat."
                            >Dankjewelscherm</button>
                    <?php
                    // De schaal erbij, want het voorbeeld wordt verkleind om
                    // naast de instellingen te passen. Zonder dit cijfer denk je
                    // dat je naar de echte grootte kijkt.
                    ?>
                    <span class="mymmo-canvas-schaal" data-mymmo-schaal></span>
                </div>
                <div class="mymmo-canvas-stage" data-mymmo-stage>
                    <iframe id="mymmoFormsPreviewFrame" title="Voorbeeld van het venster"></iframe>
                </div>
                <p class="mymmo-canvas-status" data-mymmo-canvas-status aria-live="polite"></p>
            </div>

            </div><?php // .mymmo-bouwer-voorbeeld ?>
            <div class="mymmo-bouwer-instellingen">

            <div class="mymmo-insp">

                <?php
                // -- Het venster als VAST onderdeel (1.19) ---------------------
                // Tot 1.18 stond hier alles wat het venster ooit kon: een
                // tabvolgorde, een keuze welk tabblad opent, een regeltje onder
                // elke tabknop, een tweede tekening voor de agenda, een losse
                // stand "formulier op de pagina". Wat er nu nog staat, is wat er
                // echt aan het venster gewijzigd wordt: per TABBLAD wat erin
                // staat, en EEN tekening en EEN watermerk. Teksten typ je in het
                // voorbeeld.
                //
                // Wat weg is, staat hieronder als VERBORGEN veld: een opstelling
                // die zo'n waarde al had, houdt ze bij het opnieuw bewaren. Stil
                // weggooien zou een venster op de site veranderen zonder dat
                // iemand dat in dit scherm gedaan heeft.
                //
                // Een formulier gewoon op een pagina zetten gebeurt met het blok
                // "Mymmo formulier" in de editor, niet meer hier.
                ?>
                <?php
                // De OPSLAG: velden die je niet hier invult maar in het voorbeeld
                // (of die enkel bewaren wat een opstelling al had). In een <div
                // hidden> en zonder .mymmo-veld: die klasse zet display:flex en
                // won daarmee van [hidden] -- zo stonden ze er allemaal, zonder
                // label. Een radio met `hidden` toont wp-admin ook gewoon.
                ?>
                <div hidden data-mymmo-opslag>
                <input type="radio" name="mymmoFormsSoort" value="knop" checked>
                <?php
                // De KNOP hoort niet meer bij het venster (1.19.2): je hangt het
                // venster aan elke knop op de pagina (knopblok, ingang, klasse).
                // Stijl, tekst en "waar de knop staat" blijven enkel bewaard
                // voor opstellingen die hun eigen knop nog tonen.
                ?>
                <select id="mymmoFormsVariant">
                    <option value="primary">Gevuld</option>
                    <option value="outline">Omlijnd</option>
                </select>
                <input type="radio" name="mymmoFormsKnopSoort" value="eigen" checked>
                <input type="radio" name="mymmoFormsKnopSoort" value="bestaand">
                <input type="text" id="mymmoFormsTrigger" value="">
                <input type="hidden" id="mymmoFormsTabActief" value="">
                <input type="hidden" id="mymmoFormsTabFormSub" value="">
                <input type="hidden" id="mymmoFormsTabCalendlySub" value="">
                <input type="hidden" id="mymmoFormsTabExtraSub" value="">
                <input type="hidden" id="mymmoFormsGap" value="">
                <ul class="mymmo-volgorde" data-mymmo-taborder hidden>
                    <li data-tab="form"></li>
                    <li data-tab="extra"></li>
                    <li data-tab="calendly"></li>
                </ul>

                <div>
                    <label for="mymmoFormsHeading">Kop van het venster</label>
                    <input type="text" id="mymmoFormsHeading" placeholder="Naam van het formulier">
                    <label for="mymmoFormsIntro">Zin onder de kop</label>
                    <input type="text" id="mymmoFormsIntro" placeholder="Omschrijving uit de OM">
                    <label for="mymmoFormsPunten">Geruststellingen</label>
                    <textarea id="mymmoFormsPunten" rows="3"></textarea>
                    <input type="text" id="mymmoFormsTabForm" value="Stuur ons een bericht">
                    <input type="text" id="mymmoFormsTabCalendly" value="Plan een gesprek">
                    <input type="text" id="mymmoFormsTabExtra" placeholder="leeg = de naam van het formulier">
                    <input type="text" id="mymmoFormsFormTitle" placeholder="Uit de OM">
                    <input type="text" id="mymmoFormsFormSub" placeholder="Uit de OM">
                    <input type="text" id="mymmoFormsCalendlyTitle">
                    <input type="text" id="mymmoFormsCalendlySub">
                    <input type="text" id="mymmoFormsLabel" placeholder="Naam van het formulier">
                    <input type="text" id="mymmoFormsThanksFormTitle">
                    <input type="text" id="mymmoFormsThanksFormText">
                    <input type="text" id="mymmoFormsThanksExtraTitle">
                    <input type="text" id="mymmoFormsThanksExtraText">
                    <input type="text" id="mymmoFormsThanksCalendlyTitle">
                    <input type="text" id="mymmoFormsThanksCalendly">
                </div>
                </div><?php // [data-mymmo-opslag] ?>

                <?php
                // De drie tabbladen. Het script zet ze in de volgorde van het
                // venster (data-mymmo-tabblok), zodat de bovenste hier ook het
                // bovenste in het venster is. De titel van elk blok is het
                // opschrift van het tabblad zelf -- en niet "Formulier" of
                // "Derde tabblad", want zo heten ze voor niemand.
                ?>
                <div class="notice notice-info inline" data-mymmo-academy-banner hidden style="margin:0 0 12px">
                    <p><strong>Deze popup hoort bij de academy.</strong> Na het verzenden opent de cursus; er is geen
                    dankjewelscherm en geen conversiepad. De aanmelding telt in Webgedrag via de koppeling.
                    Enkel het formulier, de titel en de uitleg (in het voorbeeld) en het uitzicht doen hier iets.</p>
                </div>

                <div data-mymmo-tabblokken>

                <details class="mymmo-groep" open data-mymmo-tabblok="extra" data-mymmo-academy-verberg>
                    <summary data-mymmo-tabblok-naam="mymmoFormsTabExtra">Bereken je prijsofferte</summary>
                    <div class="mymmo-groep-lijf">
                        <?php
                        self::render_stap_kiezer(
                            'mymmoFormsExtraSteps',
                            'Stappen',
                            'De vragen vóór het formulier, in de volgorde waarin de bezoeker ze krijgt. Geen stappen en geen eigen formulier = dit tabblad staat er niet.',
                            $stappen_lijst
                        );
                        ?>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsExtraSlug">Formulier na de stappen</label>
                            <select id="mymmoFormsExtraSlug">
                                <option value="">&mdash; hetzelfde als het berichtformulier &mdash;</option>
                                <?php foreach (($formulieren ?: []) as $f) : ?>
                                    <option value="<?php echo esc_attr((string) ($f['slug'] ?? '')); ?>">
                                        <?php echo esc_html(mymmo_forms_form_label($f)); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <span class="mymmo-hint">
                                De stappen zetten hun antwoorden in de verborgen velden van dit formulier.
                            </span>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsGoalExtra">Conversiepad</label>
                            <input type="text" id="mymmoFormsGoalExtra" class="code" placeholder="leeg = dat van het berichtformulier">
                        </div>

                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <label for="mymmoFormsThanksExtraImage">Dankjewelscherm: afbeelding</label>
                            <input type="url" id="mymmoFormsThanksExtraImage" class="code" placeholder="leeg = een vinkje">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsThanksExtraImage" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsThanksExtraImage" hidden>Weghalen</button>
                            </span>
                        </div>
                    </div>
                </details>

                <details class="mymmo-groep" open data-mymmo-tabblok="form">
                    <summary data-mymmo-tabblok-naam="mymmoFormsTabForm">Stuur een bericht</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld">
                            <label for="mymmoFormsPick">Formulier</label>
                            <select id="mymmoFormsPick"
                                    data-mymmo-langs="<?php echo esc_attr((string) wp_json_encode($talen_per_formulier)); ?>">
                                <?php foreach ($formulieren as $f) : ?>
                                    <option value="<?php echo esc_attr((string) ($f['slug'] ?? '')); ?>">
                                        <?php echo esc_html(mymmo_forms_form_label($f)); ?>
                                        (<?php echo esc_html((string) (int) ($f['field_count'] ?? 0)); ?> velden)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <span class="mymmo-hint">Het hoofdformulier van het venster. Het bepaalt ook de kleuren
                                en, als je bij de prijsofferte niets anders kiest, het formulier na de stappen.</span>
                        </div>

                        <?php
                        self::render_stap_kiezer(
                            'mymmoFormsSteps',
                            'Stappen',
                            'Meestal leeg: een bericht sturen begint meteen met het formulier.',
                            $stappen_lijst
                        );
                        ?>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsFormHeading">
                                <input type="checkbox" id="mymmoFormsFormHeading" checked>
                                Kop boven het formulier
                            </label>
                            <span class="mymmo-hint">De tekst ervan typ je in het voorbeeld; leeg = de titel en de
                                inleiding uit de OM.</span>
                        </div>

                        <div class="mymmo-veld" data-mymmo-academy-verberg>
                            <label for="mymmoFormsGoalForm">Conversiepad</label>
                            <input type="text" id="mymmoFormsGoalForm" class="code" placeholder="/bedankt/offerte">
                        </div>

                        <div class="mymmo-veld" data-mymmo-canvas="1" data-mymmo-academy-verberg>
                            <label for="mymmoFormsThanksFormImage">Dankjewelscherm: afbeelding</label>
                            <input type="url" id="mymmoFormsThanksFormImage" class="code" placeholder="leeg = een vinkje">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsThanksFormImage" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsThanksFormImage" hidden>Weghalen</button>
                            </span>
                        </div>
                    </div>
                </details>

                <details class="mymmo-groep" open data-mymmo-tabblok="calendly" data-mymmo-academy-verberg>
                    <summary data-mymmo-tabblok-naam="mymmoFormsTabCalendly">Plan een gesprek</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld">
                            <label for="<?php echo $afspraken ? 'mymmoFormsCalendlyPick' : 'mymmoFormsCalendly'; ?>">Agenda</label>
                            <?php if ($afspraken) : ?>
                                <select id="mymmoFormsCalendlyPick">
                                    <option value="">Geen &mdash; dit tabblad staat er niet</option>
                                    <?php foreach ($afspraken as $afspraak) :
                                        $link = (string) ($afspraak['url'] ?? '');
                                        if ($link === '') {
                                            continue;
                                        }
                                        $label = (string) ($afspraak['name'] ?? $link);
                                        if (!empty($afspraak['duration'])) {
                                            $label .= ' — ' . (int) $afspraak['duration'] . ' min';
                                        }
                                        if (isset($afspraak['active']) && !$afspraak['active']) {
                                            $label .= ' — koppeling staat uit';
                                        }
                                        ?>
                                        <option value="<?php echo esc_attr($link); ?>"><?php echo esc_html($label); ?></option>
                                    <?php endforeach; ?>
                                    <option value="__anders__">Andere link…</option>
                                </select>
                            <?php endif; ?>
                            <input type="url" id="mymmoFormsCalendly" class="code"
                                   placeholder="https://calendly.com/..." <?php echo $afspraken ? 'hidden' : ''; ?>>
                            <?php if (!$afspraken && mymmo_forms_is_configured()) : ?>
                                <span class="mymmo-hint">
                                    Geen gekende afspraken. Open de Calendly-koppeling in de Operations Manager
                                    en klik Opslaan, of
                                    <a href="#mymmoFormsReload">haal de lijst opnieuw op</a>.
                                </span>
                            <?php endif; ?>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsGoalCalendly">Conversiepad</label>
                            <input type="text" id="mymmoFormsGoalCalendly" class="code" placeholder="/bedankt/gesprek">
                        </div>

                        <div class="mymmo-veld" data-mymmo-canvas="1">
                            <label for="mymmoFormsThanksCalendlyImage">Dankjewelscherm: afbeelding</label>
                            <input type="url" id="mymmoFormsThanksCalendlyImage" class="code" placeholder="leeg = een vinkje">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsThanksCalendlyImage" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsThanksCalendlyImage" hidden>Weghalen</button>
                            </span>
                        </div>
                    </div>
                </details>

                </div><?php // [data-mymmo-tabblokken] ?>

                <details class="mymmo-groep">
                    <summary>Uitzicht</summary>
                    <div class="mymmo-groep-lijf">
                        <div class="mymmo-veld">
                            <label for="mymmoFormsImage">Tekening</label>
                            <input type="url" id="mymmoFormsImage" class="code" placeholder="https://...">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsImage"
                                        id="mymmoFormsImagePick" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsImage"
                                        id="mymmoFormsImageClear" hidden>Weghalen</button>
                            </span>
                            <input type="text" id="mymmoFormsImageAlt" placeholder="beschrijving (leeg bij sfeerbeeld)">
                            <div class="mymmo-drie">
                                <label for="mymmoFormsImageScale">schaal %
                                    <input type="number" id="mymmoFormsImageScale" min="10" max="400" step="5" placeholder="100"></label>
                                <label for="mymmoFormsImageX">← → px
                                    <input type="number" id="mymmoFormsImageX" step="2" placeholder="0"></label>
                                <label for="mymmoFormsImageY">↑ ↓ px
                                    <input type="number" id="mymmoFormsImageY" step="2" placeholder="0"></label>
                                <label for="mymmoFormsImageRot">draaien °
                                    <input type="number" id="mymmoFormsImageRot" min="-360" max="360" step="5" placeholder="0"></label>
                            </div>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsWatermark">Watermerk, achter de tekening</label>
                            <input type="url" id="mymmoFormsWatermark" class="code" placeholder="https://...">
                            <span class="mymmo-knoppen">
                                <button type="button" class="button button-small" data-mymmo-media="mymmoFormsWatermark" hidden>Kiezen</button>
                                <button type="button" class="button button-small" data-mymmo-media-wis="mymmoFormsWatermark" hidden>Weghalen</button>
                            </span>
                            <div class="mymmo-drie">
                                <label for="mymmoFormsWmScale">schaal %
                                    <input type="number" id="mymmoFormsWmScale" min="10" max="400" step="5" placeholder="100"></label>
                                <label for="mymmoFormsWmX">← → px
                                    <input type="number" id="mymmoFormsWmX" step="2" placeholder="0"></label>
                                <label for="mymmoFormsWmY">↑ ↓ px
                                    <input type="number" id="mymmoFormsWmY" step="2" placeholder="0"></label>
                                <label for="mymmoFormsWmRot">draaien °
                                    <input type="number" id="mymmoFormsWmRot" min="-360" max="360" step="5" placeholder="0"></label>
                            </div>
                            <span class="mymmo-hint">
                                Eén tekening en één watermerk voor het hele venster; ze blijven staan als je van
                                tabblad wisselt. Je kan ze ook in het voorbeeld verslepen en aan de hoeken schalen.
                            </span>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsAccentAan">
                                <input type="checkbox" id="mymmoFormsAccentAan">
                                Eigen accentkleur
                            </label>
                            <input type="color" id="mymmoFormsAccent" value="#2563eb" hidden>
                            <span class="mymmo-hint">De knoppen en het actieve tabblad in het venster. Anders volgt
                                het venster je thema.</span>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsAccentText">Tekst op de accentkleur</label>
                            <input type="color" id="mymmoFormsAccentText" value="#ffffff">
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsBgAan">
                                <input type="checkbox" id="mymmoFormsBgAan">
                                Eigen achtergrondkleur
                            </label>
                            <input type="color" id="mymmoFormsBg" value="#f3f6fd" hidden>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsIconAan">
                                <input type="checkbox" id="mymmoFormsIconAan">
                                Eigen kleur voor de iconen
                            </label>
                            <input type="color" id="mymmoFormsIcon" value="#2563eb" hidden>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsPanelBreed">
                                <input type="checkbox" id="mymmoFormsPanelBreed">
                                Ruimer venster
                            </label>
                            <span class="mymmo-hint">Voor een stap die in de gewone breedte niet past, zoals een
                                rij keien. Met een agenda erin is het venster sowieso breed.</span>
                        </div>

                        <div class="mymmo-veld">
                            <label for="mymmoFormsLang">Taal</label>
                            <select id="mymmoFormsLang">
                                <option value="">Volg de pagina</option>
                            </select>
                        </div>

                        <div class="mymmo-veld">
                            <label class="mymmo-keuze" for="mymmoFormsTitle">
                                <input type="checkbox" id="mymmoFormsTitle" checked>
                                Kop van het venster tonen
                            </label>
                        </div>
                    </div>
                </details>

                <?php
                // Geen shortcode meer onderaan (1.19.3). Het venster hang je aan
                // een knop (paneel "Opent een venster") of een ingang; die
                // verwijzen rechtstreeks naar de opstelling. Wie toch een
                // shortcode nodig heeft: `[mymmo_form_button preset="<id>"]`.
                ?>

            </div>

            </div><?php // .mymmo-bouwer-instellingen ?>
            </div><?php // .mymmo-bouwer ?>

        <?php endif; ?>

        <p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                  id="mymmoFormsReload" style="display:inline;">
                <?php wp_nonce_field('mymmo_forms_reload_index'); ?>
                <input type="hidden" name="action" value="mymmo_forms_reload_index">
                <?php submit_button('Lijst opnieuw ophalen', 'secondary', 'submit', false); ?>
            </form>
            <span class="description">
                De lijst wordt een minuut bewaard. Heb je net iets gepubliceerd en zie je het nog niet, klik dan hier.
            </span>
        </p>
        <?php
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tabblad 2: verbinding
    // ─────────────────────────────────────────────────────────────────────────

    private static function render_verbinding(): void {
        $sleutel_gezet = mymmo_forms_site_key() !== '';
        ?>

        <?php if (!empty($_GET['mymmo_purged'])) : ?>
            <div class="notice notice-success is-dismissible"><p>De formuliercache is geleegd.</p></div>
        <?php endif; ?>

        <p>
            Dit stel je één keer in. Daarna hoort hier niets meer te wijzigen —
            wat een formulier toont, beheer je in de Operations Manager.
        </p>

        <form method="post" action="options.php">
            <?php settings_fields(self::GROUP); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mymmo_forms_api_base">Operations Manager</label></th>
                    <td>
                        <input type="url" class="regular-text" id="mymmo_forms_api_base"
                               name="mymmo_forms_api_base"
                               value="<?php echo esc_attr(mymmo_forms_api_base()); ?>"
                               placeholder="https://operations.openvme.be">
                        <p class="description">De basis-URL, zonder pad. Moet https zijn.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmo_forms_site_key">Sitesleutel</label></th>
                    <td>
                        <input type="password" class="regular-text" id="mymmo_forms_site_key"
                               name="mymmo_forms_site_key" value=""
                               autocomplete="new-password"
                               placeholder="<?php echo $sleutel_gezet ? '••••••••  (ingesteld — laat leeg om te behouden)' : 'nog niet ingesteld'; ?>">
                        <p class="description">
                            Komt uit de Cloudflare-secret <code>FORMS_PUBLIC_SITE_KEYS</code>.
                            De sleutel blijft serverside en komt nooit in de HTML van een pagina.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Kleuren</th>
                    <td>
                        <?php $thema_vars = mymmo_forms_site_theme_vars(); ?>
                        <label for="mymmo_forms_follow_theme">
                            <input type="checkbox" id="mymmo_forms_follow_theme"
                                   name="mymmo_forms_follow_theme" value="1"
                                   <?php checked((bool) get_option('mymmo_forms_follow_theme', 1)); ?>>
                            De kleuren van dit thema overnemen
                        </label>

                        <?php if ($thema_vars) : ?>
                            <p style="margin:8px 0 4px;">Gevonden bij de <strong>knop</strong> van dit thema:</p>
                            <ul style="margin:0 0 6px 4px;">
                                <?php foreach ($thema_vars as $variabele => $waarde) :
                                    $isKleur = str_starts_with($waarde, '#') || str_starts_with($waarde, 'rgb');
                                    $naam = [
                                        '--mf-accent'      => 'Achtergrond van de knop',
                                        '--mf-accent-text' => 'Tekst op de knop',
                                        '--mf-radius'      => 'Hoeken',
                                    ][$variabele] ?? $variabele;
                                    ?>
                                    <li style="display:flex;align-items:center;gap:8px;margin:0 0 4px;">
                                        <?php if ($isKleur) : ?>
                                            <span style="display:inline-block;width:18px;height:18px;border:1px solid #c3c4c7;border-radius:3px;background:<?php echo esc_attr($waarde); ?>"></span>
                                        <?php endif; ?>
                                        <span><?php echo esc_html($naam); ?> — <code><?php echo esc_html($waarde); ?></code></span>
                                    </li>
                                <?php endforeach; ?>
                            </ul>
                        <?php else : ?>
                            <p class="description" style="margin:8px 0 4px;">
                                <strong>Dit thema declareert geen knopkleur</strong>, dus er valt niets over te nemen.
                                Dat gebeurt bij een klassiek thema zonder <code>theme.json</code>, of bij een blokthema
                                dat de knop geen eigen kleur geeft (Weergave → Ontwerp → Stijlen → Kleuren → Knop).
                                Het formulier houdt dan de kleur uit de Operations Manager aan.
                            </p>
                        <?php endif; ?>

                        <p class="description">
                            Een formulierknop die naast de knoppen van je site staat en een andere kleur heeft,
                            ziet eruit als een fout. Daarom wint het thema van deze site van de kleur die in de
                            Operations Manager bij het formulier staat — die blijft de terugval voor sites die
                            zelf niets declareren. Een <code>accent="#…"</code> op een losse shortcode wint van
                            allebei.
                        </p>
                        <p class="description">
                            Alleen de <em>knop</em> wordt overgenomen: achtergrond, tekstkleur en hoeken. Bewust
                            niet de tekst- en achtergrondkleuren van de site — bij een donker thema levert dat
                            witte labels op witte invoervelden op, en dat merkt niemand aan onze kant.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmo_forms_booking_preset">Afspraaklinks</label></th>
                    <td>
                        <?php $booking_preset = (string) get_option(Mymmo_Forms_Booking::OPTION, ''); ?>
                        <select id="mymmo_forms_booking_preset" name="mymmo_forms_booking_preset">
                            <option value="">— uit —</option>
                            <?php foreach (Mymmo_Forms_Presets::all() as $opstelling) : ?>
                                <option value="<?php echo esc_attr($opstelling['id']); ?>" <?php selected($booking_preset, $opstelling['id']); ?>>
                                    <?php echo esc_html($opstelling['name']); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">
                            Een link als <code><?php echo esc_html(home_url('/')); ?>?afspraak=rob-demo</code> opent op
                            elke pagina het venster van deze opstelling, meteen op het tabblad
                            "Plan een gesprek", met de agenda van die collega. De links zelf maak je in de
                            Operations Manager (Afspraaklinks, of bij de Calendly-koppeling). Een onbekende
                            of gepauzeerde link, en <code>?afspraak=algemeen</code>, tonen de agenda van de
                            opstelling zelf. De opstelling moet dus een Calendly-link hebben.
                        </p>
                        <p class="description">
                            Veilig met een paginacache: de pagina is voor elke bezoeker dezelfde, de
                            persoonlijke agenda wordt pas in de browser ingevuld.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mymmo_forms_cache_ttl">Cacheduur</label></th>
                    <td>
                        <input type="number" min="0" max="3600" step="10" id="mymmo_forms_cache_ttl"
                               name="mymmo_forms_cache_ttl"
                               value="<?php echo esc_attr((string) get_option('mymmo_forms_cache_ttl', 300)); ?>">
                        seconden
                        <p class="description">
                            0 = niet cachen (alleen voor testen). Ook met cache verschijnt een wijziging
                            meteen: het versienummer verandert dan, en de bewaarde versie wordt overgeslagen.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>

        <hr>

        <h2>Cache</h2>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('mymmo_forms_purge'); ?>
            <input type="hidden" name="action" value="mymmo_forms_purge">
            <?php submit_button('Cache legen', 'secondary', 'submit', false); ?>
            <p class="description">
                Nodig als je in de Operations Manager iets wijzigde en het meteen wil zien,
                of als er een oude versie blijft hangen na een storing.
            </p>
        </form>
        <?php
    }
}
