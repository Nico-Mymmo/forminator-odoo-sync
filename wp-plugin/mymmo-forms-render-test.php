<?php
/**
 * Rendertest voor mymmo-forms.
 *
 * Bootst net genoeg van WordPress na om de templates ECHT te renderen en de
 * uitkomst te controleren. Draait in de container met `php render-test.php`.
 *
 * Waarom dit bestaat: php -l zegt alleen dat de haakjes kloppen. De fouten die
 * hier gevonden worden zijn van een andere soort — een veld zonder label, een
 * waarde die niet ge-escaped is, een honeypot die per ongeluk zichtbaar is.
 * Precies het soort dat pas op een live pagina opvalt.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', __DIR__ . '/mymmo-forms/');
define('MYMMO_FORMS_URL', 'https://example.test/wp-content/plugins/mymmo-forms/');
define('MYMMO_FORMS_VERSION', '1.0.0');

// ── WordPress-stubs ─────────────────────────────────────────────────────────
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function wp_unslash($t) { return $t; }
function wp_autop($t) { return '<p>' . (string) $t . '</p>'; }
function wpautop($t) { return wp_autop($t); }
function checked($a, $b = true, $echo = true) { $r = $a == $b ? ' checked' : ''; if ($echo) { echo $r; } return $r; }
function selected($a, $b = true, $echo = true) { $r = $a == $b ? ' selected' : ''; if ($echo) { echo $r; } return $r; }
function get_permalink() { return 'https://openvme.be/offerte/'; }
function home_url($p = '/') { return 'https://openvme.be' . $p; }
function wp_get_document_title() { return 'Offerte aanvragen — OpenVME'; }
function wp_nonce_field($a) { echo '<input type="hidden" name="_wpnonce" value="stub">'; }
function current_user_can($c) { return $GLOBALS['__is_admin'] ?? false; }
function get_option($k, $d = null) { return $GLOBALS['__options'][$k] ?? $d; }

function determine_locale() { return $GLOBALS['__locale'] ?? 'nl_BE'; }
function get_locale() { return $GLOBALS['__locale'] ?? 'nl_BE'; }
function wp_json_encode($v) { return json_encode($v); }

require_once MYMMO_FORMS_DIR . 'includes/helpers.php';
require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';

// Alleen wat de templates en de shortcodes aanroepen.
final class Mymmo_Forms_Submit {
    public const HONEYPOT_FIELD = 'mymmo_forms_website';
    public const TIME_FIELD = 'mymmo_forms_t';
    public const ANCHOR_FIELD = 'mymmo_anchor';
    public static function action_url(): string { return 'https://openvme.be/wp-admin/admin-post.php'; }
    public static function action_name(): string { return 'mymmo_forms_submit'; }
    public static function time_token(): string { return '1757500000.abc123'; }
    /** @return array<string,mixed>|null */
    public static function flash(): ?array { return $GLOBALS['__flash'] ?? null; }
}

// ── Stubs voor de shortcode-klasse ──────────────────────────────────────────
function sanitize_title($t) { return strtolower(preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string) $t))); }
function sanitize_html_class($t) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $t); }
function wp_enqueue_style($h) {}
function wp_enqueue_script($h) {}
function wp_register_style($h, $s = '', $d = [], $v = null) {}
function wp_register_script($h, $s = '', $d = [], $v = null, $f = false) {}
function add_action($h, $c) {}
function add_shortcode($n, $c) {}
function shortcode_atts($paren, $atts, $code = '') {
    $uit = $paren;
    foreach ((array) $atts as $sleutel => $waarde) {
        if (array_key_exists($sleutel, $paren)) { $uit[$sleutel] = $waarde; }
    }
    return $uit;
}

/** Het formulier komt normaal uit de Operations Manager; hier uit $GLOBALS. */
final class Mymmo_Forms_Api_Client {
    public static function get_form(string $slug) { return $GLOBALS['__form_uit_api'] ?? null; }
    public static function last_error(): string { return 'gestubd'; }
    public static function served_stale(): bool { return false; }
}

// ── Proefformulier: elk veldtype minstens een keer ──────────────────────────
$form = [
    'id' => 'uuid-1', 'slug' => 'offerte', 'name' => 'Offerte aanvragen',
    'description' => 'Vul in en we bellen je terug.',
    'version' => 4, 'submit_label' => 'Verstuur aanvraag',
    'success_mode' => 'message', 'success_message' => 'Bedankt!',
    'theme' => ['accent' => '#0f766e', 'radius' => '4px', 'kwaadaardig' => 'url(javascript:alert(1))'],
    'languages' => ['nl', 'fr'],
    'default_language' => 'nl',
    'i18n' => ['fr' => [
        'name' => 'Demander un devis',
        'description' => 'Remplissez et nous vous rappelons.',
        'submit_label' => 'Envoyer la demande',
        'success_message' => 'Merci !',
    ]],
    'messages' => [
        'nl' => ['required' => '{label} is verplicht.', 'choose' => 'Maak een keuze', 'submitting' => 'Bezig met versturen…'],
        'fr' => ['required' => '{label} est obligatoire.', 'choose' => 'Faites votre choix', 'submitting' => 'Envoi en cours…'],
    ],
    'fields' => [
        ['key' => 'voornaam', 'type' => 'text', 'label' => 'Voornaam', 'required' => true, 'width' => 'half', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => '', 'i18n' => ['fr' => ['label' => 'Prénom']]],
        ['key' => 'achternaam', 'type' => 'text', 'label' => 'Achternaam "met aanhalingstekens"', 'required' => true, 'width' => 'half', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'email', 'type' => 'email', 'label' => 'E-mailadres', 'required' => true, 'width' => 'full', 'options' => [], 'validation' => [], 'help_text' => 'We gebruiken dit enkel om te antwoorden.', 'placeholder' => '', 'default_value' => '', 'i18n' => ['fr' => ['label' => 'Adresse e-mail']]],
        ['key' => 'telefoon', 'type' => 'tel', 'label' => 'Telefoon', 'required' => false, 'width' => 'half', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'aantal', 'type' => 'number', 'label' => 'Aantal kavels', 'required' => false, 'width' => 'half', 'options' => [], 'validation' => ['min' => 1, 'max' => 500], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'startdatum', 'type' => 'date', 'label' => 'Gewenste startdatum', 'required' => false, 'width' => 'half', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => '', 'type' => 'heading', 'label' => 'Over het gebouw', 'required' => false, 'width' => 'full', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => '', 'type' => 'paragraph', 'label' => 'Deze gegevens helpen ons een juiste prijs te geven. <script>alert(1)</script>', 'required' => false, 'width' => 'full', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'gebouw_type', 'type' => 'select', 'label' => 'Type gebouw', 'required' => true, 'width' => 'full', 'options' => [['value' => 'appartement', 'label' => 'Appartementsgebouw'], ['value' => 'kmo', 'label' => 'KMO-gebouw']], 'validation' => [], 'help_text' => '', 'placeholder' => 'Kies een type', 'default_value' => '', 'i18n' => ['fr' => ['label' => 'Type de bâtiment', 'options' => ['appartement' => 'Immeuble à appartements', 'kmo' => 'Bâtiment PME']]]],
        ['key' => 'lift', 'type' => 'radio', 'label' => 'Is er een lift?', 'required' => true, 'width' => 'full', 'options' => [['value' => 'ja', 'label' => 'Ja'], ['value' => 'nee', 'label' => 'Nee']], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'diensten', 'type' => 'checkbox_group', 'label' => 'Welke diensten?', 'required' => false, 'width' => 'full', 'options' => [['value' => 'onderhoud', 'label' => 'Onderhoud'], ['value' => 'keuring', 'label' => 'Keuring']], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'vraag', 'type' => 'textarea', 'label' => 'Je vraag', 'required' => false, 'width' => 'full', 'options' => [], 'validation' => ['maxlength' => 2000], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'consent', 'type' => 'checkbox', 'label' => 'Ik ga akkoord met de privacyverklaring', 'required' => true, 'width' => 'full', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => ''],
        ['key' => 'bron', 'type' => 'hidden', 'label' => '', 'required' => false, 'width' => 'full', 'options' => [], 'validation' => [], 'help_text' => '', 'placeholder' => '', 'default_value' => 'website'],
    ],
];

// ── Rendersituaties ─────────────────────────────────────────────────────────
$situaties = [
    'leeg'    => ['flash' => null, 'stale' => false],
    'frans'   => ['flash' => null, 'stale' => false, 'lang' => 'fr'],
    'fout'    => ['flash' => ['status' => 'error', 'message' => 'E-mailadres is verplicht.', 'values' => ['voornaam' => 'Nico', 'gebouw_type' => 'kmo', 'diensten' => 'onderhoud, keuring', 'consent' => 'ja'], 'slug' => 'offerte'], 'stale' => false],
    'succes'  => ['flash' => ['status' => 'success', 'message' => 'Bedankt!', 'values' => [], 'slug' => 'offerte'], 'stale' => false],
];

$html = [];
$plat = [];
foreach ($situaties as $naam => $situatie) {
    $html[$naam] = mymmo_forms_render('form', [
        'form' => $form, 'slug' => 'offerte', 'show_title' => true,
        'flash' => $situatie['flash'], 'stale' => $situatie['stale'],
        'lang' => $situatie['lang'] ?? 'nl',
    ]);
    // Witruimte platslaan: attributen staan in de templates over meerdere
    // regels, dus zoeken naar 'value="x" checked' moet daar niet op stuklopen.
    $plat[$naam] = preg_replace('/\s+/', ' ', $html[$naam]);
}

// ── Controles ───────────────────────────────────────────────────────────────
$geslaagd = 0;
$gefaald = 0;

function check(string $naam, bool $ok, string $uitleg = ''): void {
    global $geslaagd, $gefaald;
    if ($ok) { $geslaagd++; echo "  ✓ $naam\n"; }
    else { $gefaald++; echo "  ✗ $naam" . ($uitleg ? "\n    $uitleg" : '') . "\n"; }
}

echo "\nStructuur\n";
check('elk invoerveld heeft een label met for=', substr_count($html['leeg'], '<label') >= 13);
check('keuzegroepen zitten in een fieldset met legend', substr_count($html['leeg'], '<fieldset') === 2 && substr_count($html['leeg'], '<legend') === 2);
check('hulptekst hangt via aria-describedby aan het veld',
    str_contains($html['leeg'], 'mymmo-form-offerte-email-help mymmo-form-offerte-email-error'),
    'hulp EN foutmelding hangen aan het veld, in die volgorde');
check('verplichte velden krijgen required en aria-required', substr_count($html['leeg'], 'aria-required="true"') >= 5);
check('het verborgen veld heeft zijn standaardwaarde', str_contains($html['leeg'], '<input type="hidden" name="bron" value="website">'));
check('de honeypot staat er en is aria-hidden + tabindex -1', str_contains($html['leeg'], 'mymmo-form-hp') && str_contains($html['leeg'], 'aria-hidden="true"') && str_contains($html['leeg'], 'tabindex="-1"'));
check('het ondertekende tijdstempel zit in het formulier', str_contains($html['leeg'], 'name="mymmo_forms_t"'));
check('de nonce zit in het formulier', str_contains($html['leeg'], 'name="_wpnonce"'));
check('number krijgt min/max mee', str_contains($html['leeg'], 'min="1"') && str_contains($html['leeg'], 'max="500"'));
check('textarea krijgt maxlength mee', str_contains($html['leeg'], 'maxlength="2000"'));
check('e-mailveld krijgt autocomplete', str_contains($html['leeg'], 'autocomplete="email"'));

echo "\nEscaping\n";
check('aanhalingstekens in een label breken het attribuut niet', str_contains($html['leeg'], 'Achternaam &quot;met aanhalingstekens&quot;'));
check('een script-tag in een tekstblok wordt niet uitgevoerd', !str_contains($html['leeg'], '<script>alert(1)</script>') && str_contains($html['leeg'], '&lt;script&gt;'));
check('de sitesleutel staat NERGENS in de HTML', !str_contains(implode('', $html), 'FORMS_PUBLIC_SITE_KEYS') && !str_contains(implode('', $html), 'site_key'));

echo "\nThema\n";
$stijl = mymmo_forms_theme_style($form['theme']);
check('een geldige kleur komt door', str_contains($stijl, '--mf-accent:#0f766e'));
check('een geldige lengte komt door', str_contains($stijl, '--mf-radius:4px'));
check('een onbekende sleutel wordt geweigerd', !str_contains($stijl, 'kwaadaardig'));
check('url() in een themawaarde wordt geweigerd', !str_contains($stijl, 'url('));
check('css-injectie via een puntkomma lukt niet', !str_contains(mymmo_forms_theme_style(['accent' => '#fff;background:url(x)']), 'background'));

echo "\nNa een fout\n";
check('ingevulde waarden komen terug', str_contains($html['fout'], 'value="Nico"'));
check('de gekozen optie staat weer geselecteerd', str_contains($plat['fout'], 'value="kmo" selected'));
check('aangevinkte meerkeuzes staan weer aan', substr_count($plat['fout'], 'value="onderhoud" checked') === 1 && substr_count($plat['fout'], 'value="keuring" checked') === 1);
check('het vinkje staat weer aan', substr_count($plat['fout'], 'value="ja" checked') === 1);
check('de foutmelding is een alert-live-region', str_contains($html['fout'], 'role="alert"'));

echo "\nNa succes\n";
check('het formulier wordt NIET opnieuw getoond', !str_contains($html['succes'], '<form'));
check('de bedanktekst staat er wel', str_contains($html['succes'], 'Bedankt!'));

echo "\nStale cache\n";
$GLOBALS['__is_admin'] = false;
$bezoeker = mymmo_forms_render('form', ['form' => $form, 'slug' => 'offerte', 'show_title' => true, 'flash' => null, 'stale' => true, 'lang' => 'nl']);
$GLOBALS['__is_admin'] = true;
$beheerder = mymmo_forms_render('form', ['form' => $form, 'slug' => 'offerte', 'show_title' => true, 'flash' => null, 'stale' => true, 'lang' => 'nl']);
check('een bezoeker ziet de cache-waarschuwing niet', !str_contains($bezoeker, 'lokale cache'));
check('een beheerder ziet ze wel', str_contains($beheerder, 'lokale cache'));

echo "\nMeertalig\n";

check('de Franse titel staat er, de Nederlandse niet',
    str_contains($html['frans'], '<h2 class="mymmo-form-title">Demander un devis</h2>')
    && !str_contains($html['frans'], '>Offerte aanvragen<'),
    'de paginatitel staat wel in een verborgen veld -- die komt van WordPress, niet van het formulier');
check('de Franse omschrijving staat er',
    str_contains($html['frans'], 'Remplissez et nous vous rappelons.'));
check('de knop is vertaald',
    str_contains($html['frans'], 'Envoyer la demande'));
check('vertaalde veldlabels staan er',
    str_contains($html['frans'], 'Prénom') && str_contains($html['frans'], 'Adresse e-mail'));
check('een veld ZONDER vertaling valt terug op het Nederlands',
    str_contains($html['frans'], 'Telefoon'),
    'een leeg label is stuk; één label in de verkeerde taal is enkel lelijk');
check('optieLABELS zijn vertaald',
    str_contains($html['frans'], 'Immeuble à appartements'));
check('optieWAARDEN zijn NIET vertaald',
    str_contains($plat['frans'], 'value="appartement"') && !str_contains($html['frans'], 'value="Immeuble'),
    'de waarde gaat naar Odoo -- vertaal je die, dan heb je per taal een aparte mapping nodig');
check('een eigen placeholder wint van de standaardtekst uit de catalogus',
    str_contains($html['leeg'], '<option value="">Kies een type'));
check('zonder VERTAALDE placeholder komt de generieke tekst in die taal, niet de Nederlandse',
    str_contains($html['frans'], '<option value="">Faites votre choix')
    && !str_contains($html['frans'], '<option value="">Kies een type'),
    'een placeholder valt bewust niet terug op de standaardtaal: "Kies een type" onder een Franse keuzelijst is erger dan een generieke Franse zin');
check('lang staat op de wikkel',
    str_contains($plat['frans'], 'lang="fr"') && str_contains($plat['leeg'], 'lang="nl"'),
    'daarmee schakelt een schermlezer van stem');
check('de taal gaat mee terug in de POST',
    str_contains($plat['frans'], 'name="mymmo_lang" value="fr"'));
check('de berichtencatalogus staat op het formulier voor de JS',
    str_contains($html['frans'], 'data-mymmo-messages=')
    && str_contains($html['frans'], 'est obligatoire'),
    'zo toont JavaScript letterlijk dezelfde zin als de server');
check('de catalogus is die van DEZE taal, niet alle talen samen',
    !str_contains($html['frans'], 'is verplicht'));

echo "\nEigen foutmeldingen in plaats van de browserballon\n";

check('het formulier heeft novalidate',
    str_contains($plat['leeg'], 'novalidate'),
    'zonder novalidate toont de browser zijn eigen ballon, in de taal van de BROWSER');
// 14 velden, min het verborgen veld en de twee opmaakblokken: die hebben geen
// invoer en dus niets om een fout over te melden.
check('elk INVOERveld heeft een lege foutplaatshouder',
    substr_count($html['leeg'], 'data-mymmo-error') === 11,
    'opmaakblokken en verborgen velden horen er GEEN te hebben');
check('die plaatshouder is verborgen tot er iets in staat',
    str_contains($plat['leeg'], 'role="alert" data-mymmo-error hidden></p>'));
check('elk veld draagt zijn kale label voor de JS',
    str_contains($plat['leeg'], 'data-mymmo-label="Voornaam"')
    && str_contains($plat['frans'], 'data-mymmo-label="Prénom"'),
    'het label uit het <label>-element vissen breekt zodra er een sterretje in staat');
check('het sterretje zit NIET in data-mymmo-label',
    !str_contains($plat['leeg'], 'data-mymmo-label="Voornaam *"'));

// ────────────────────────────────────────────────────────────────────────────
// De knop met pop-up ([mymmo_form_button])
// ────────────────────────────────────────────────────────────────────────────
//
// Hier wordt de shortcode ECHT uitgevoerd, met een gestubde API-client, zodat
// ook de logica eromheen meegetest wordt: het id van het venster, welke melding
// bij welk formulier op de pagina hoort, en de terugval zonder JavaScript.

require_once MYMMO_FORMS_DIR . 'includes/class-shortcodes.php';

$GLOBALS['__form_uit_api'] = $form;
$GLOBALS['__flash'] = null;
$GLOBALS['__is_admin'] = false;

/** @return array{0:string,1:string} de HTML, en dezelfde HTML met platte witruimte */
function knop(array $atts): array {
    $h = Mymmo_Forms_Shortcodes::render_button($atts);
    return [$h, (string) preg_replace('/\s+/', ' ', $h)];
}

// 1e weergave: krijgt het id zonder volgnummer.
[$k1, $k1p] = knop(['slug' => 'offerte', 'label' => 'Vraag een offerte', 'calendly' => 'https://calendly.com/mymmo/kennismaking']);
// 2e weergave van dezelfde knop op dezelfde pagina.
[$k2, $k2p] = knop(['slug' => 'offerte', 'label' => 'Nog een knop']);

echo "\nDe knop met pop-up\n";

check('de knop is een echte link naar het venster',
    str_contains($k1p, 'href="#mymmo-modal-offerte"') && str_contains($k1, 'Vraag een offerte'),
    'zonder JavaScript opent het venster via :target -- een <button> zou daar niets doen');
check('de knop vertelt een schermlezer dat er een venster opengaat',
    str_contains($k1p, 'aria-haspopup="dialog"') && str_contains($k1p, 'aria-expanded="false"'));
check('het venster is een dialog met een naam',
    str_contains($k1p, 'role="dialog" aria-modal="true" aria-labelledby="mymmo-modal-offerte-titel"'));
check('het formulier zit IN het venster',
    str_contains($k1, '<form') && str_contains($k1, 'name="mymmo_form_slug" value="offerte"'));
check('het anker gaat mee in de POST',
    str_contains($k1p, 'name="mymmo_anchor" value="mymmo-modal-offerte"'),
    'zonder dit komt de bezoeker na het versturen terug op een GESLOTEN venster en ziet hij zijn bevestiging nooit');
check('de pagina waar de bezoeker stond gaat mee',
    str_contains($k1, 'name="mymmo_redirect_to" value="https://openvme.be/offerte/"')
    && str_contains($k1, 'name="mymmo_page_title"'));
check('de titel van het formulier staat niet nog eens onder de kop van het venster',
    !str_contains($k1, 'mymmo-form-title') && str_contains($k1, 'mymmo-modal-title'),
    'de kop van het venster is al de naam van het formulier');

echo "\nTwee keer hetzelfde formulier op een pagina\n";

check('een tweede knop krijgt een eigen id',
    str_contains($k2p, 'href="#mymmo-modal-offerte-2"'),
    'anders vangt het eerste venster beide knoppen op');
check('de veld-id\'s van de twee vensters botsen niet',
    str_contains($k1, 'id="mymmo-modal-offerte-formulier-email"')
    && str_contains($k2, 'id="mymmo-modal-offerte-2-formulier-email"'),
    'bij botsende id\'s wijst een <label for> naar het veld van het ANDERE formulier');
check('ook naast hetzelfde formulier in de tekst botst er niets',
    str_contains($html['leeg'], 'id="mymmo-form-offerte-email"')
    && !str_contains($k1, 'id="mymmo-form-offerte-email"'));

echo "\nTabbladen en de terugval zonder JavaScript\n";

check('met een agenda staan er twee tabbladen',
    substr_count($k1, 'role="tab"') === 2 && str_contains($k1p, 'role="tablist"'));
check('de tabbalk staat hidden in de HTML',
    str_contains($k1p, 'role="tablist" data-mymmo-tablist hidden'),
    'zonder JavaScript doen die knoppen niets; het script haalt hidden weg');
check('elk deel heeft een eigen kopje voor wie geen JavaScript heeft',
    substr_count($k1, 'mymmo-modal-paneel-titel') === 2);
check('de agenda heeft een gewone link als terugval',
    str_contains($k1, 'href="https://calendly.com/mymmo/kennismaking"')
    && str_contains($k1p, 'rel="noopener noreferrer"')
    && str_contains($k1, 'mymmo-modal-agenda-terugval')
    && str_contains($k1, 'mymmo-modal-agenda-link'),
    'een adblocker of een storing bij Calendly mag geen leeg vlak opleveren; de klassen zijn de haken waarmee de CSS de link wegneemt zodra de widget er staat');
check('de sluitknop wijst terug naar de knop, niet naar de top van de pagina',
    str_contains($k1p, 'href="#mymmo-modal-offerte-knop"'));

echo "\nDe agenda\n";

[$kz, $kzp] = knop(['slug' => 'offerte', 'label' => 'Enkel formulier']);
check('zonder calendly is er geen tabbalk en geen tweede deel',
    !str_contains($kz, 'role="tab"') && !str_contains($kz, 'mymmo-modal-agenda'),
    'een leeg tabblad "Plan een gesprek" is erger dan geen tabblad');

[$kh, $khp] = knop(['slug' => 'offerte', 'calendly' => 'http://calendly.com/mymmo']);
check('een agenda zonder https wordt geweigerd',
    !str_contains($kh, 'calendly.com'),
    'het is een iframe van een derde partij op een https-pagina');

$_COOKIE['ovme_uuid'] = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
$_GET['utm_source'] = 'nieuwsbrief';
[$kc, $kcp] = knop(['slug' => 'offerte', 'calendly' => 'https://calendly.com/mymmo']);
check('de bezoeker-UUID staat NIET in de HTML',
    !str_contains($kc, '3f2a1b4c'),
    'deze pagina kan gecached zijn -- dan zou de UUID van de VORIGE bezoeker meegaan met het gesprek van de volgende. De browser haalt hem op.');
check('de utm van deze weergave staat evenmin in het agenda-vlak',
    !str_contains($kcp, 'data-mymmo-calendly-utm'),
    'zelfde reden: een gecachete pagina zou de campagne van iemand anders meegeven');
unset($_COOKIE['ovme_uuid'], $_GET['utm_source']);

[$ka, $kap] = knop(['slug' => 'offerte', 'calendly' => 'https://calendly.com/mymmo', 'tab' => 'calendly']);
check('tab="calendly" opent op het tweede tabblad',
    str_contains($kap, 'aria-selected="true" tabindex="0" data-mymmo-tab="calendly"'));

echo "\nKop en opschriften\n";

[$kn, $knp] = knop(['slug' => 'offerte', 'label' => 'Contacteer ons', 'title' => 'no']);
check('title="no" haalt de kop weg maar houdt het venster benoemd',
    !str_contains($kn, 'mymmo-modal-title" id=')
    && str_contains($knp, 'aria-label="Contacteer ons"'),
    'een dialog zonder naam is voor een schermlezer een naamloos vlak');

[$kq, $kqp] = knop(['slug' => 'offerte', 'label' => 'Vraag "nu" een offerte']);
check('aanhalingstekens in de knoptekst breken het attribuut niet',
    str_contains($kq, 'Vraag &quot;nu&quot; een offerte'));

[$kk, $kkp] = knop(['slug' => 'offerte', 'class' => 'is-groot <script>', 'variant' => 'outline']);
check('een eigen klasse wordt geschoond',
    str_contains($kkp, 'class="mymmo-modal-launch is-groot script"')
    && !str_contains($kk, '<script>'));
check('variant="outline" komt door',
    str_contains($kk, 'mymmo-modal-button--outline'));

echo "\nWelke melding hoort bij welk formulier op de pagina\n";

$GLOBALS['__flash'] = ['status' => 'success', 'message' => 'Bedankt uit het venster!', 'values' => [], 'slug' => 'offerte', 'anchor' => 'test-venster'];

[$kf, $kfp] = knop(['slug' => 'offerte', 'id' => 'test-venster']);
check('de melding komt in het venster waar ze vandaan komt',
    str_contains($kf, 'Bedankt uit het venster!'));
check('dat venster staat meteen weer open',
    str_contains($kfp, 'data-mymmo-modal-open-now="1"'),
    'anders komt de bezoeker terug op een dichte pop-up en lijkt er niets gebeurd');

[$kg, $kgp] = knop(['slug' => 'offerte', 'id' => 'ander-venster']);
check('een ander venster pikt die melding niet in',
    !str_contains($kg, 'Bedankt uit het venster!'));

$inline = Mymmo_Forms_Shortcodes::render(['slug' => 'offerte']);
check('het formulier in de tekst pikt ze evenmin in',
    !str_contains($inline, 'Bedankt uit het venster!'),
    'zonder het anker zou de bevestiging van de pop-up onder het formulier in de pagina verschijnen');

$GLOBALS['__flash'] = ['status' => 'success', 'message' => 'Bedankt uit de tekst!', 'values' => [], 'slug' => 'offerte', 'anchor' => ''];
$inline2 = Mymmo_Forms_Shortcodes::render(['slug' => 'offerte']);
[$kt, $ktp] = knop(['slug' => 'offerte', 'id' => 'derde-venster']);
check('een melding zonder anker hoort bij het formulier in de tekst',
    str_contains($inline2, 'Bedankt uit de tekst!') && !str_contains($kt, 'Bedankt uit de tekst!'));

$GLOBALS['__flash'] = null;

echo "\nHerkomst (gedeelde helpers)\n";

$_COOKIE = ['ovme_uuid' => '3F2A1B4C-5D6E-4F70-8A9B-0C1D2E3F4A5B', 'utm_source' => 'google'];
check('de UUID uit de cookie wordt genormaliseerd',
    mymmo_forms_visitor_uuid() === '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b');

$_COOKIE = ['ovme_uuid' => 'niet-echt'];
check('iets dat geen UUID is komt er niet door',
    mymmo_forms_visitor_uuid() === '',
    'deze waarde komt uit een cookie die iemand zelf kan zetten en gaat naar Odoo');

$_COOKIE = ['utm_source' => 'cookie-bron', 'utm_medium' => 'cookie-kanaal'];
$herkomst = mymmo_forms_utms(['utm_source' => 'url-bron']);
check('de URL wint van de cookie, de cookie vult aan',
    $herkomst['utm_source'] === 'url-bron' && $herkomst['utm_medium'] === 'cookie-kanaal',
    'zo houdt iemand die vorige week via een campagne binnenkwam toch zijn herkomst');
$_COOKIE = [];

echo "\nTaalkeuze\n";

$tweetalig = ['languages' => ['nl', 'fr'], 'default_language' => 'nl'];
$eentalig  = ['languages' => ['nl'], 'default_language' => 'nl'];

$GLOBALS['__locale'] = 'nl_BE';
check('het shortcode-attribuut wint van de paginataal',
    Mymmo_Forms_I18n::resolve($tweetalig, 'fr') === 'fr',
    'zo kan je een Frans formulier op een Nederlandse pagina zetten');

$GLOBALS['__locale'] = 'fr_BE';
check('zonder attribuut volgt het formulier de taal van de pagina',
    Mymmo_Forms_I18n::resolve($tweetalig) === 'fr');
check('een eentalig formulier volgt de paginataal NIET',
    Mymmo_Forms_I18n::resolve($eentalig) === 'nl',
    'het heeft geen Frans, dus Nederlands is het enige juiste antwoord');

$GLOBALS['__locale'] = 'de_DE';
check('een paginataal die het formulier niet heeft, valt terug op de standaardtaal',
    Mymmo_Forms_I18n::resolve($tweetalig) === 'nl');

$GLOBALS['__locale'] = 'nl_BE';
check('een attribuut met een taal die het formulier niet heeft, valt stil terug',
    Mymmo_Forms_I18n::resolve($tweetalig, 'de') === 'nl',
    'stil en niet met een foutmelding: dat is de pagina van een bezoeker, niet een beheerscherm');
check('hoofdletters en spaties in het attribuut zijn geen probleem',
    Mymmo_Forms_I18n::resolve($tweetalig, ' FR ') === 'fr');

// Polylang en WPML gaan voor de locale.
define('ICL_LANGUAGE_CODE', 'fr');
check('WPML bepaalt de paginataal als het aanwezig is',
    Mymmo_Forms_I18n::resolve($tweetalig) === 'fr',
    'op een site met een vertaalplugin staat de taal per PAGINA, niet per site');

echo "\n$geslaagd geslaagd, $gefaald gefaald\n\n";
exit($gefaald === 0 ? 0 : 1);
