<?php
/**
 * Test voor de herkomstgegevens die mymmo-forms meestuurt.
 *
 *   php wp-plugin/mymmo-forms-submit-meta-test.php
 *
 * Waarom apart: Mymmo_Forms_Submit::meta() leest cookies, en wat daar misgaat
 * is stil. Een ontbrekende ovme_uuid geeft geen foutmelding -- er komt gewoon
 * een lead in Odoo die los staat van alles wat we van die bezoeker weten. Dat
 * merk je pas weken later, en dan is het onherstelbaar.
 *
 * meta() is private; de test roept hem via reflectie aan. Dat is bewust: de
 * methode hoort niet publiek te worden alleen maar om testbaar te zijn.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_FORMS_DIR', __DIR__ . '/mymmo-forms/');

// ── WordPress-stubs ─────────────────────────────────────────────────────────
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function wp_unslash($t) { return $t; }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
function wp_get_referer() { return $GLOBALS['__referer'] ?? false; }
function home_url($p = '/') { return 'https://openvme.be' . $p; }
function admin_url($p = '') { return 'https://openvme.be/wp-admin/' . $p; }
function wp_hash($t) { return md5('zout' . $t); }
function add_action() {}

require_once MYMMO_FORMS_DIR . 'includes/class-i18n.php';
require_once MYMMO_FORMS_DIR . 'includes/class-submit.php';

$geslaagd = 0;
$gefaald = 0;

function check(string $naam, bool $ok, string $uitleg = ''): void {
    global $geslaagd, $gefaald;
    if ($ok) { $geslaagd++; echo "  ✓ $naam\n"; }
    else { $gefaald++; echo "  ✗ $naam" . ($uitleg ? "\n    $uitleg" : '') . "\n"; }
}

/** @return array<string,mixed> */
function meta(array $cookies, array $post = [], string $referer = '', string $lang = 'nl'): array {
    $_COOKIE = $cookies;
    $_POST = $post;
    $GLOBALS['__referer'] = $referer !== '' ? $referer : false;

    $m = new ReflectionMethod('Mymmo_Forms_Submit', 'meta');
    $m->setAccessible(true);
    return $m->invoke(null, 'https://openvme.be/offerte/', $lang);
}

/** taal() is ook private: hij bepaalt wat er als meta_lang naar Odoo gaat. */
function taal(array $post, ?array $form): string {
    $_POST = $post;
    $m = new ReflectionMethod('Mymmo_Forms_Submit', 'taal');
    $m->setAccessible(true);
    return $m->invoke(null, $form);
}

$GELDIG = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

echo "\nBezoeker-UUID\n";

$m = meta(['ovme_uuid' => $GELDIG]);
check('de UUID uit de cookie komt mee', ($m['ovme_uuid'] ?? null) === $GELDIG);

$m = meta(['ovme_uuid' => strtoupper($GELDIG)]);
check('hoofdletters worden genormaliseerd', ($m['ovme_uuid'] ?? null) === $GELDIG,
    'anders staan er twee schrijfwijzen van dezelfde bezoeker in Odoo');

$m = meta([]);
check('geen cookie is geen fout, alleen een leeg veld', !isset($m['ovme_uuid']) && isset($m['page_url']));

echo "\nAlleen echte UUIDs\n";

foreach ([
    'onzin' => 'niet-een-uuid',
    'injectiepoging' => '<script>alert(1)</script>',
    'te lang' => $GELDIG . 'extra',
    'sql-achtig' => "' OR 1=1--",
] as $naam => $waarde) {
    $m = meta(['ovme_uuid' => $waarde]);
    check("een $naam-waarde wordt geweigerd", !isset($m['ovme_uuid']),
        'deze waarde komt uit een cookie die iemand zelf kan zetten, en gaat naar Odoo');
}

echo "\nCross-domein\n";

$ref = '11112222-3333-4444-5555-666677778888';
$m = meta(['ovme_uuid' => $GELDIG, 'ovme_ref_uuid' => $ref]);
check('de UUID van de andere site komt ook mee',
    ($m['ovme_uuid'] ?? null) === $GELDIG && ($m['ovme_ref_uuid'] ?? null) === $ref);

echo "\nUTM-herkomst\n";

$m = meta(['utm_source' => 'nieuwsbrief'], ['utm_source' => 'google']);
check('het formulier wint van de cookie', ($m['utm_source'] ?? null) === 'google',
    'de URL van DEZE pagina is recenter dan een cookie van weken geleden');

$m = meta(['utm_source' => 'nieuwsbrief', 'utm_campaign' => 'lente']);
check('zonder UTM in de URL valt hij terug op de cookie',
    ($m['utm_source'] ?? null) === 'nieuwsbrief' && ($m['utm_campaign'] ?? null) === 'lente',
    'iemand die vorige week binnenkwam en vandaag pas invult, houdt zijn herkomst');

$m = meta([]);
check('zonder UTM staat er niets', !isset($m['utm_source']));

echo "\nOverige herkomst\n";

$m = meta([], ['mymmo_page_title' => 'Offerte aanvragen'], 'https://google.com/');
check('paginatitel en verwijzer komen mee',
    ($m['page_title'] ?? null) === 'Offerte aanvragen' && ($m['referrer'] ?? null) === 'https://google.com/');

$m = meta(['ovme_uuid' => $GELDIG]);
check('de site wordt NIET meegestuurd',
    !isset($m['site']),
    'die leidt de Operations Manager af uit de sitesleutel, zodat een site niet kan liegen');

echo "\nTaal\n";

$tweetalig = ['languages' => ['nl', 'fr'], 'default_language' => 'nl'];

check('de taal gaat als meta_lang mee', (meta([], [], '', 'fr')['lang'] ?? '') === 'fr');

check('een taal die het formulier heeft, wordt overgenomen',
    taal(['mymmo_lang' => 'fr'], $tweetalig) === 'fr');
check('een taal die het formulier NIET heeft, valt terug op de standaardtaal',
    taal(['mymmo_lang' => 'de'], $tweetalig) === 'nl',
    'dit komt van buiten -- zonder controle duwt iemand een willekeurige string als meta_lang naar Odoo');
check('rommel valt terug op de standaardtaal',
    taal(['mymmo_lang' => '<script>'], $tweetalig) === 'nl');
check('geen taal meegestuurd = de standaardtaal',
    taal([], $tweetalig) === 'nl');
check('een formulier dat niet geladen kon worden, blokkeert de inzending niet op taal',
    taal(['mymmo_lang' => 'fr'], null) === 'fr');

echo "\n$geslaagd geslaagd, $gefaald gefaald\n\n";
exit($gefaald === 0 ? 0 : 1);
