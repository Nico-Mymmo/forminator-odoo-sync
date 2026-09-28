<?php
/**
 * De markeerstift bekijken ZONDER WordPress.
 *
 *   php wp-plugin/mymmo-markering-preview.php > proef.html
 *
 * Deze proef draait op dezelfde drie dingen als de echte pagina: de tekeningen
 * uit `assets/vormen/`, de stylesheet `mymmo-markering.css`, en het keuzescript
 * `mymmo-markering-front.js`. Er is hier dus geen tweede implementatie die iets
 * anders kan tonen dan wat een bezoeker krijgt -- alleen het kleurenpalet is een
 * voorbeeld, want dat komt op de site uit `theme.json`.
 *
 * Waar je naar kijkt: of de streep bij een KORT woord even goed zit als bij een
 * lange woordgroep. Dat is precies wat het keuzescript moet regelen door de
 * tekening met de best passende lengte te nemen.
 */

declare(strict_types=1);

$map = __DIR__ . '/mymmo-cards';

$kleuren = [
    'accent'  => '#bae6fd',
    'primair' => '#0369a1',
    'zacht'   => '#fde68a',
    'roze'    => '#fbcfe8',
];

/*
 * Dezelfde groepering als `Mymmo_Cards_Markering::vormen()`: bestanden die enkel
 * in hun eindcijfer verschillen zijn LENGTES van dezelfde streep, geen aparte
 * strepen. De verhouding komt uit de viewBox van het bestand zelf.
 */
$groepen = [];
foreach (glob($map . '/assets/vormen/markering-*.svg') ?: [] as $pad) {
    $naam = substr(basename($pad, '.svg'), strlen('markering-'));
    if (preg_match('/^(.+)-\d+$/', $naam, $m)) {
        $naam = $m[1];
    }

    $ruw = (string) file_get_contents($pad);
    if (!preg_match('/viewBox\s*=\s*"([^"]+)"/', $ruw, $vb)) {
        continue;
    }
    $delen = preg_split('/[\s,]+/', trim($vb[1])) ?: [];
    if (count($delen) !== 4 || (float) $delen[3] <= 0.0) {
        continue;
    }

    $groepen[$naam][] = [
        'url'   => 'data:image/svg+xml;base64,' . base64_encode($ruw),
        'ratio' => round((float) $delen[2] / (float) $delen[3], 4),
        'naam'  => basename($pad),
    ];
}

if (!$groepen) {
    fwrite(STDERR, "Geen tekeningen in mymmo-cards/assets/vormen/.\n");
    exit(1);
}

$vormen = [];
foreach ($groepen as $slug => $varianten) {
    usort($varianten, static fn (array $a, array $b): int => $a['ratio'] <=> $b['ratio']);
    $vormen[] = [
        'slug'      => $slug,
        'label'     => ucfirst(str_replace('-', ' ', $slug)),
        'standaard' => $varianten[(int) floor((count($varianten) - 1) / 2)]['url'],
        'varianten' => array_values($varianten),
    ];
}

$regels = ['.mymmo-mark{--mk-mark-vorm:url("' . $vormen[0]['standaard'] . '")}'];
foreach ($vormen as $vorm) {
    $regels[] = '.mymmo-mark--' . $vorm['slug'] . '{--mk-mark-vorm:url("' . $vorm['standaard'] . '")}';
}
foreach ($kleuren as $slug => $hex) {
    $regels[] = '.mymmo-mark--kleur-' . $slug . '{--mk-mark-kleur:' . $hex . '}';
}

$css = (string) file_get_contents($map . '/assets/css/mymmo-markering.css');
$js  = (string) file_get_contents($map . '/assets/js/mymmo-markering-front.js');

function mark(string $vorm, string $kleur, string $tekst, bool $cursief = false): string {
    $klasse = 'mymmo-mark mymmo-mark--' . $vorm;
    if ($kleur !== '') {
        $klasse .= ' mymmo-mark--kleur-' . $kleur;
    }
    return '<mark class="' . $klasse . '">' . ($cursief ? '<em>' . $tekst . '</em>' : $tekst) . '</mark>';
}

$slug = $vormen[0]['slug'];
$kleurslugs = array_keys($kleuren);

// Van heel kort naar heel lang: dit is waar het keuzescript op getest wordt.
$woorden = ['ja', 'anders', 'veel sneller', 'zonder een regel code', 'alles wat je nodig hebt om te starten'];

$koppen = '';
foreach ($woorden as $i => $woord) {
    $kleur = $kleurslugs[$i % count($kleurslugs)];
    $koppen .= '<h2>Hoe wij het ' . mark($slug, $kleur, $woord, true) . ' aanpakken</h2>' . "\n";
}

$lopend = '';
foreach ($woorden as $i => $woord) {
    $lopend .= '<p class="proef-regel">Een stuk tekst waarin '
        . mark($slug, $kleurslugs[$i % count($kleurslugs)], $woord)
        . ' gemarkeerd staat, op gewone lopende grootte.</p>';
}

$tekeningen = '';
foreach ($vormen as $vorm) {
    foreach ($vorm['varianten'] as $v) {
        $tekeningen .= '<figure><img src="' . $v['url'] . '" alt="" style="width:'
            . round($v['ratio'] * 60) . 'px;height:60px"><figcaption>'
            . htmlspecialchars($v['naam']) . ' &middot; ' . $v['ratio'] . ':1</figcaption></figure>';
    }
}

?><!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Mymmo Componenten — markeerstift</title>
<style>
<?php echo $css; ?>
<?php echo implode("\n", $regels); ?>

body { margin: 0; padding: 48px 24px; font-family: system-ui, sans-serif; color: #1f2430; background: #fff; }
.proef { max-width: 900px; margin: 0 auto; }
h1 { font-size: 20px; font-weight: 600; color: #6b7280; margin: 0 0 8px; }
.uitleg { font-size: 14px; color: #6b7280; margin: 0 0 32px; max-width: 60ch; }
h2 { font-size: 40px; line-height: 1.25; font-weight: 700; margin: 0 0 24px; }
h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; margin: 40px 0 12px; }
.proef-regel { font-size: 18px; margin: 0 0 12px; }
.donker { margin-top: 40px; padding: 32px; border-radius: 16px; background: #0f172a; color: #f8fafc; }
.donker h2 { margin-bottom: 0; }
.tekeningen { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; }
figure { margin: 0; }
figcaption { font-size: 11px; color: #9ca3af; margin-top: 6px; }
</style>
</head>
<body>
<div class="proef">
  <h1>Markeerstift</h1>
  <p class="uitleg">Van heel kort naar heel lang. Het keuzescript neemt per woord
  de tekening waarvan de verhouding het dichtst bij dat woord ligt, zodat de
  streep zo weinig mogelijk uitgerekt wordt. Zet JavaScript uit en je ziet wat
  er gebeurt met één vaste tekening.</p>

<?php echo $koppen; ?>

  <h3>Op lopende tekstgrootte</h3>
<?php echo $lopend; ?>

  <div class="donker">
    <h2>Ook op een <?php echo mark($slug, 'accent', 'donkere', true); ?> achtergrond</h2>
  </div>

  <h3>De tekeningen, elk op hun eigen verhouding</h3>
  <div class="tekeningen"><?php echo $tekeningen; ?></div>
</div>

<script>window.MymmoMarkeringVormen = <?php echo json_encode($vormen, JSON_UNESCAPED_SLASHES); ?>;</script>
<script>
<?php echo $js; ?>
</script>
</body>
</html>
