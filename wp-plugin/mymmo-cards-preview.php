<?php
/**
 * Bouwt een ECHTE kaartenstapel, zodat je hem in een browser kan bekijken en
 * opmeten zonder WordPress.
 *
 *     php wp-plugin/mymmo-cards-preview.php > proef.html
 *
 * Waarom dit bestaat: de render van deze blokken draait normaal binnen
 * WordPress, en de enige manier om de markup te controleren zonder site is ze
 * hier met dezelfde functies op te bouwen. Zelfde opzet als
 * mymmo-forms-callout-preview.php.
 *
 * WAT DIT NIET TOONT: de typografie. In de proef staat geen thema, dus de
 * koppen krijgen hier de letter van de browser. Dat is precies het punt van
 * deze plugin -- op een echte pagina komt de letter uit het thema. Kijk hier
 * dus naar de INDELING, de kleefbeweging en het mobiele gedrag, en beoordeel de
 * letter op de site zelf.
 *
 * Geen test: dit assert niets.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_CARDS_DIR', __DIR__ . '/mymmo-cards/');
define('MYMMO_CARDS_URL', './mymmo-cards/');
define('MYMMO_CARDS_VERSION', '1.1.0');

// ── WordPress-stubs ─────────────────────────────────────────────────────────
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function wp_strip_all_tags($t) { return trim(strip_tags((string) $t)); }
function add_action($h, $f, $p = 10, $a = 1) { return true; }
function is_admin() { return false; }
function wp_register_style() { return true; }
function wp_register_script() { return true; }
function wp_enqueue_style() { return true; }
function wp_localize_script() { return true; }
function register_block_type($naam, $args = []) { return true; }

require_once MYMMO_CARDS_DIR . 'includes/helpers.php';
require_once MYMMO_CARDS_DIR . 'includes/class-blocks.php';

/**
 * Een blok zoals WordPress het aan een render_callback geeft: een naam, zijn
 * attributen en zijn kinderen. Meer heeft de render van deze plugin niet nodig
 * -- zie Mymmo_Cards_Blocks::kinderen_van().
 */
final class Mymmo_Cards_Proefblok {

    public string $name;
    /** @var array<int,Mymmo_Cards_Proefblok> */
    public array $inner_blocks;
    /** @var array<string,mixed> */
    private array $attrs;
    private string $inhoud;

    /**
     * @param array<string,mixed>                $attrs
     * @param array<int,Mymmo_Cards_Proefblok>   $kinderen
     */
    public function __construct(string $name, array $attrs = [], array $kinderen = [], string $inhoud = '') {
        $this->name         = $name;
        $this->attrs        = $attrs;
        $this->inner_blocks = $kinderen;
        $this->inhoud       = $inhoud;
    }

    public function render(): string {
        $content = $this->inhoud;
        foreach ($this->inner_blocks as $kind) {
            $content .= $kind->render();
        }

        switch ($this->name) {
            case Mymmo_Cards_Blocks::STAPEL:
                return Mymmo_Cards_Blocks::render_stapel($this->attrs, $content, $this);
            case Mymmo_Cards_Blocks::KOP:
                return Mymmo_Cards_Blocks::render_kop($this->attrs, $content, $this);
            case Mymmo_Cards_Blocks::KAART:
                return Mymmo_Cards_Blocks::render_kaart($this->attrs, $content, $this);
            case Mymmo_Cards_Blocks::KOLOM:
                return Mymmo_Cards_Blocks::render_kolom($this->attrs, $content, $this);
        }

        return $content;
    }
}

/** Kortere schrijfwijze voor de opbouw hieronder. */
function proef_kolom(string $html, bool $vol = false, array $attrs = []): Mymmo_Cards_Proefblok {
    return new Mymmo_Cards_Proefblok(Mymmo_Cards_Blocks::KOLOM, ['vol' => $vol] + $attrs, [], $html);
}

/** @param array<int,Mymmo_Cards_Proefblok> $kolommen */
function proef_kaart(array $kolommen, array $attrs = []): Mymmo_Cards_Proefblok {
    return new Mymmo_Cards_Proefblok(Mymmo_Cards_Blocks::KAART, $attrs, $kolommen);
}

$beeld = 'https://syndicoach.be/wp-content/uploads/2026/09/gebouwscan-syndicus-1024x774.png';

$stapel = new Mymmo_Cards_Proefblok(
    Mymmo_Cards_Blocks::STAPEL,
    [
        'stap'        => 16,
        'gap'         => 40,
        'opvulling'   => 'ruim',
        'hoeken'      => 35,
        'hoogte'      => 'gelijk',
        'animatie'    => 'schaal',
        'paginakleur' => '#ffffff',
    ],
    [
        new Mymmo_Cards_Proefblok(
            Mymmo_Cards_Blocks::KOP,
            [],
            [],
            '<h2 class="wp-block-heading">Hoe wij het <em>anders</em> aanpakken</h2>'
        ),

        // 1. Tekst naast een beeld -- de gewone kaart.
        proef_kaart([
            proef_kolom(
                '<h3 class="wp-block-heading">We brengen je gebouw in kaart</h3>'
                . '<p>We komen ter plekke om je gebouw volledig in kaart te brengen en doen een '
                . 'technische analyse. Alle wettelijke keuringen worden gecheckt: brandblussers, '
                . 'liften, laadpalen en meer.</p>'
            , false, ['pad' => 24, 'uitlijning' => 'midden']),
            proef_kolom('<figure><img src="' . esc_url($beeld) . '" alt="gebouwscan"></figure>', false, ['uitlijning' => 'onder']),
        ], ['verhouding' => '40-60', 'achtergrond' => '#99f6e4']),

        // 2. Hetzelfde, maar met het beeld tot in de hoek van de kaart.
        proef_kaart([
            proef_kolom(
                '<h3 class="wp-block-heading">Jij krijgt volledig zicht op alle kosten</h3>'
                . '<p>We maken jullie budget op en koppelen elke factuur aan waarvoor ze dient.</p>'
            ),
            proef_kolom('<figure><img src="' . esc_url($beeld) . '" alt=""></figure>', true),
        ], ['verhouding' => '50-50', 'achtergrond' => '#fbcfe8', 'mobiel' => 'rechts-eerst']),

        // 3. Een video over de volle breedte.
        proef_kaart([
            proef_kolom(
                '<h3 class="wp-block-heading">Zie het in twee minuten</h3>'
                . '<p>Een korte rondleiding door het dossier van een gebouw.</p>'
                . '<iframe src="about:blank" title="video"></iframe>'
            ),
        ], ['achtergrond' => '#bae6fd', 'uitlijning' => 'boven']),

        // 4. Een kaart met een ingang van Mymmo Forms erin (hier nagebootst:
        //    in het echt staat daar het blok "Mymmo ingang" in kale modus).
        proef_kaart([
            proef_kolom(
                '<h3 class="wp-block-heading">Vraag hier je offerte aan</h3>'
                . '<p>Beantwoord een paar korte vragen over je gebouw en ontdek je offerte op maat.</p>'
            ),
            proef_kolom(
                '<div class="mymmo-ingang-kaal" style="background:#fff;border-radius:16px;padding:20px">'
                . '<p><strong>Hoe groot is jullie gebouw?</strong></p>'
                . '<p>Geef het aantal bewoonbare kavels in.</p>'
                . '<p><input type="range" min="1" max="80" value="12" style="width:100%"></p>'
                . '<p><a href="#" style="display:inline-flex;padding:13px 22px;border-radius:10px;'
                . 'background:#0369a1;color:#fff;text-decoration:none">Bereken mijn offerte</a></p>'
                . '</div>'
            ),
        ], ['verhouding' => '40-60', 'achtergrond' => '#99f6e4']),

        // 5. Een kaart met een VORM op de achtergrond die groter is dan de
        //    kaart zelf, zodat ze afgesneden wordt.
        proef_kaart([
            proef_kolom(
                '<h3 class="wp-block-heading">Met een vorm op de achtergrond</h3>'
                . '<p>De vorm is breder dan de kaart en staat half buiten beeld; '
                . 'de kaart snijdt hem af op haar eigen hoeken.</p>'
            ),
        ], [
            'achtergrond' => '#fde68a',
            'sier'        => 'https://link.openvme.be/assets/brand/thingies/thingies_lift.svg',
            'sierBreedte' => 160,
            'sierX'       => 95,
            'sierY'       => 30,
            'sierDraai'   => -12,
            'sierDekking' => 45,
            'sierMobiel'        => true,
            'sierBreedteMobiel' => 90,
            'sierXMobiel'       => 100,
            'sierYMobiel'       => 90,
            'sierDekkingMobiel' => 25,
        ]),

        // 6. Een lege tweede kolom: die hoort niet gerenderd te worden, en de
        //    kaart hoort dan als kaart met EEN kolom te tellen.
        proef_kaart([
            proef_kolom('<h3 class="wp-block-heading">Een kaart met een lege tweede kolom</h3>'
                . '<p>De lege kolom staat hieronder niet in de HTML: een kaart met een gat ernaast '
                . 'is geen indeling maar een vergissing.</p>'),
            proef_kolom('<p></p>'),
        ], ['achtergrond' => '#f5f5f4']),
    ]
);

$html = $stapel->render();

$css_kaarten = file_get_contents(MYMMO_CARDS_DIR . 'assets/css/mymmo-cards.css');
$js_kaarten  = file_get_contents(MYMMO_CARDS_DIR . 'assets/js/mymmo-cards.js');

?><!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proef: kaartenstapel</title>
<style>
/* Een paar regels die op een site uit het THEMA komen. Bewust minimaal: alles
   wat hier staat, staat er om de proef leesbaar te maken -- niet omdat de
   plugin het nodig heeft. */
body { margin: 0; font-family: system-ui, sans-serif; color: #1f2937; background: #fff; }
h2 { font-size: 40px; line-height: 1.1; margin: 0; }
h3 { font-size: 30px; font-weight: 400; line-height: 1.25; margin: 0 0 12px; }
p { font-size: 18px; line-height: 1.5; margin: 0 0 12px; }
.proef-voor, .proef-na { padding: 80px 24px; max-width: 700px; margin: 0 auto; color: #6b7280; }
.proef-onder { height: 1200px; background: #eef2ff; }
</style>
<style><?php echo $css_kaarten; ?></style>
</head>
<body>

<div class="proef-voor"><p>Scroll naar beneden: de kaarten horen op elkaar te blijven liggen, met een randje van de vorige zichtbaar. Maak het venster smaller dan 782px om het mobiele gedrag te zien.</p></div>

<?php echo $html; ?>

<div class="proef-na"><p>Einde van de stapel. Hieronder staat een gewone sectie, zoals op een echte pagina &mdash; zonder scrollruimte onder de stapel kan het hoopje nergens heen en lijkt het alsof er niets gebeurt.</p></div>
<div class="proef-onder"></div>

<script><?php echo $js_kaarten; ?></script>
</body>
</html>
