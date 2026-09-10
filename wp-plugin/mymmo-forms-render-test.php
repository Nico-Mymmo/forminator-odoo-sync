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

// Alleen de twee statische methodes die de template aanroept.
final class Mymmo_Forms_Submit {
    public const HONEYPOT_FIELD = 'mymmo_forms_website';
    public const TIME_FIELD = 'mymmo_forms_t';
    public static function action_url(): string { return 'https://openvme.be/wp-admin/admin-post.php'; }
    public static function action_name(): string { return 'mymmo_forms_submit'; }
    public static function time_token(): string { return '1757500000.abc123'; }
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
