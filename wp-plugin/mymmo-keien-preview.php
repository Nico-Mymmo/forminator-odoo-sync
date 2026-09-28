<?php
/**
 * Bouwt een ECHTE keienwolk, zodat je hem in een browser kan bekijken zonder
 * WordPress.
 *
 *     php wp-plugin/mymmo-keien-preview.php > keien.html
 *
 * Zelfde opzet als mymmo-cards-preview.php: dezelfde renderfuncties als op de
 * site, met een handvol stubs. Er staat geen thema achter, dus de letter en
 * de paletkleuren van syndicoach.be ontbreken -- de keien krijgen hier vaste
 * kleuren. Beoordeel hier de INDELING en de BEWEGING, de rest op de site.
 *
 * Geen test: dit assert niets.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('MYMMO_CARDS_DIR', __DIR__ . '/mymmo-cards/');
define('MYMMO_CARDS_URL', './mymmo-cards/');
define('MYMMO_CARDS_VERSION', 'proef');

function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); }
function esc_url_raw($u) { return (string) $u; }
function wp_strip_all_tags($t) { return trim(strip_tags((string) $t)); }
function add_action($h, $f, $p = 10, $a = 1) { return true; }

require_once MYMMO_CARDS_DIR . 'includes/helpers.php';
require_once MYMMO_CARDS_DIR . 'includes/class-keien.php';

final class Mymmo_Keien_Proefblok {
    public array $inner_blocks;
    public function __construct(public string $name, private array $attrs = [], array $kinderen = [], private string $inhoud = '') {
        $this->inner_blocks = $kinderen;
    }
    public function render(): string {
        $content = $this->inhoud;
        foreach ($this->inner_blocks as $kind) {
            $content .= $kind->render();
        }
        return match ($this->name) {
            Mymmo_Cards_Keien::WOLK   => Mymmo_Cards_Keien::render_wolk($this->attrs, $content, $this),
            Mymmo_Cards_Keien::KEI    => Mymmo_Cards_Keien::render_kei($this->attrs, $content, $this),
            Mymmo_Cards_Keien::KEITJE => Mymmo_Cards_Keien::render_keitje($this->attrs, $content, $this),
        };
    }
}

function kei(string $kleur, string $beeld, string $tekst, array $extra = []): Mymmo_Keien_Proefblok {
    $html = '<figure class="wp-block-image" style="margin-top:-110px"><img src="' . $beeld . '" alt="" width="240" style="width:240px;height:auto"></figure>'
        . '<p style="font-size:24px;line-height:1.4">&ldquo;' . $tekst . '&rdquo;</p>';
    return new Mymmo_Keien_Proefblok(Mymmo_Cards_Keien::KEI, ['achtergrond' => $kleur] + $extra, [], $html);
}

function keitje(string $slug, int $x, int $y, int $maat, int $snelheid, string $laag, int $draai): Mymmo_Keien_Proefblok {
    return new Mymmo_Keien_Proefblok(Mymmo_Cards_Keien::KEITJE, [
        'beeld' => Mymmo_Cards_Keien::TEKENINGEN_URL . $slug . '.svg',
        'x' => $x, 'y' => $y, 'maat' => $maat, 'snelheid' => $snelheid, 'laag' => $laag, 'draai' => $draai,
    ]);
}

$up = 'https://syndicoach.be/wp-content/uploads/2026/09/';
$wolk = new Mymmo_Keien_Proefblok(Mymmo_Cards_Keien::WOLK, ['align' => 'full'], [
    kei('#fbcfe8', $up . 'weten-niet-wat-syndicus-doet.png', 'Wij weten niet wat onze syndicus doet', ['draai' => -6, 'hoogte' => 20]),
    kei('#fce7f3', $up . 'vinen-geen-syndicus.png', 'We vinden geen syndicus', ['draai' => 3, 'hoogte' => -30, 'schaal' => 105]),
    kei('#fdf2f8', $up . 'niet-goed-beheerd.png', 'Ons gebouw wordt niet goed beheerd', ['draai' => 7, 'hoogte' => 35]),
    keitje('lift', 6, 22, 88, 40, 'achter', -8),
    keitje('spaarvarken', 20, 90, 72, -25, 'voor', 6),
    keitje('brieven', 31, 7, 64, 55, 'achter', 10),
    keitje('kapotte-lamp', 50, 95, 80, 35, 'achter', -4),
    keitje('calendar1', 63, 4, 70, -30, 'achter', -10),
    keitje('vergrootglas', 80, 91, 76, 45, 'voor', 8),
    keitje('openstaande-vraag', 95, 30, 84, 25, 'achter', -6),
    keitje('telefoon', 92, 74, 60, -40, 'achter', 12),
    keitje('aktentas', 4, 68, 66, 50, 'voor', 4),
    keitje('zonnepaneel', 78, 12, 56, 20, 'achter', -12),
]);

?><!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keienwolk</title>
<link rel="stylesheet" href="./mymmo-cards/assets/css/mymmo-keien.css">
<style>body{margin:0;font-family:Georgia,serif;color:#1f2430}.vul{height:90vh;display:grid;place-items:center;color:#9ca3af}h2{text-align:center;font-weight:400;font-size:40px;margin:0}</style>
</head><body>
<div class="vul">scroll naar beneden</div>
<h2>Klinkt dit bekend?</h2>
<?= $wolk->render() ?>
<div class="vul">einde</div>
<script src="./mymmo-cards/assets/js/mymmo-keien.js"></script>
</body></html>
