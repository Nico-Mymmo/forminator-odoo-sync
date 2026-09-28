<?php
/**
 * Eén kaart.
 *
 * De opbouw volgt wat een feed herkenbaar maakt (Facebook, Instagram,
 * LinkedIn): eerst WIE het zegt en WANNEER, dan het beeld, dan de kop, dan de
 * tekst, en onderaan wat je ermee kan doen. Die volgorde is geen smaak -- ze
 * laat een lezer in één oogopslag beslissen of een bericht hem aangaat,
 * zonder te lezen.
 *
 * Wat wij eraan toevoegen en een gewone lijst links niet heeft: de
 * CURATORSNOOT onder de kop. Dat is onze stem, en het is het verschil tussen
 * een verzameling verwijzingen en een gecureerd overzicht.
 *
 * @var array $item
 * @var array $context
 * @var array $meta
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * De iconen staan inline: het zijn er een handvol, ze zijn klein, en zo is er
 * geen tweede bestand dat mee moet laden voor een feed die al af is.
 */
$icoon = static function (string $naam): string {
    $paden = [
        'document' => '<path d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>',
        'sparkles' => '<path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
        'play' => '<path d="M8 5.5v13l11-6.5z"/>',
        'audio' => '<path d="M12 3v11.5M12 3a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
        'download' => '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/>',
        'quote' => '<path d="M7 7h4v4c0 2.5-1.5 4.5-4 5V14H7z M15 7h4v4c0 2.5-1.5 4.5-4 5V14h1z"/>',
        'calendar' => '<path d="M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
        'pin' => '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
        'seats' => '<path d="M4 18v-3a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M7 12V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"/>',
    ];
    $pad = $paden[$naam] ?? $paden['document'];
    return '<svg class="mymmo-news-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        . $pad . '</svg>';
};

$kop = trim((string) ($item['summaryTitle'] ?? '')) !== ''
    ? (string) $item['summaryTitle']
    : (string) ($item['title'] ?? '');

$bron = trim((string) ($item['source'] ?? ''));
if ($bron === '') {
    $bron = mymmo_news_domein((string) ($item['url'] ?? ''));
}

$url = (string) ($item['url'] ?? '');
$beeld = (string) ($item['imageUrl'] ?? '');
$datum = mymmo_news_datum($item['publishedOn'] ?? null);
$labels = mymmo_news_labels($item);
$citaat = trim((string) ($item['quote'] ?? ''));
$snoot = trim((string) ($item['curatorNote'] ?? ''));
$kleur = sanitize_key((string) ($item['color'] ?? 'default'));
// Alleen een event heeft dit blok. Een oudere OM stuurt het niet mee, en
// dan valt de strip gewoon weg -- geen lege rij, geen foutmelding.
$ev = isset($item['event']) && is_array($item['event']) ? $item['event'] : null;
$hue = mymmo_news_bron_hue($bron !== '' ? $bron : 'mymmo');
?>
<li class="mymmo-news-card mymmo-news-card--<?php echo esc_attr((string) ($item['kind'] ?? 'article')); ?> mymmo-news-card--kleur-<?php echo esc_attr($kleur); ?>"
    style="--mymmo-news-bron-hue: <?php echo (int) $hue; ?>"
    data-mymmo-news-item="<?php echo esc_attr((string) ($item['id'] ?? '')); ?>"
    data-kind="<?php echo esc_attr((string) ($item['kind'] ?? 'article')); ?>">

    <header class="mymmo-news-card-top">
        <span class="mymmo-news-avatar" aria-hidden="true"><?php
            echo esc_html(mymmo_news_initialen($bron !== '' ? $bron : 'mymmo'));
        ?></span>

        <span class="mymmo-news-herkomst">
            <?php if ($bron !== '') : ?>
                <span class="mymmo-news-bron"><?php echo esc_html($bron); ?></span>
            <?php endif; ?>
            <span class="mymmo-news-sub">
                <?php if ($datum !== '') : ?>
                    <time datetime="<?php echo mymmo_news_datum_attr($item['publishedOn'] ?? null); ?>"><?php
                        echo esc_html($datum);
                    ?></time>
                <?php endif; ?>
                <?php if (!empty($meta['label'])) : ?>
                    <?php if ($datum !== '') : ?><span class="mymmo-news-punt">·</span><?php endif; ?>
                    <span class="mymmo-news-soort"><?php
                        echo $icoon((string) $meta['icon']);
                        echo esc_html((string) $meta['label']);
                    ?></span>
                <?php endif; ?>
            </span>
        </span>
    </header>

    <?php if ($beeld !== '') : ?>
        <?php /* De hele afbeelding is de link naar het artikel -- niet een
                 lightbox. De plugin die we vervangen opende bij een klik een
                 vergroting van de foto, en dat is precies niet waarvoor een
                 lezer op een nieuwskaart klikt. */ ?>
        <a class="mymmo-news-beeld<?php echo !empty($meta['media']) ? ' mymmo-news-beeld--media' : ''; ?>"
           href="<?php echo esc_url($url); ?>" <?php echo mymmo_news_link_attrs(); ?>
           tabindex="-1" aria-hidden="true">
            <img src="<?php echo esc_url($beeld); ?>" alt="" loading="lazy" decoding="async">
            <?php if (!empty($meta['media'])) : ?>
                <span class="mymmo-news-speel"><?php echo $icoon((string) $meta['icon']); ?></span>
            <?php endif; ?>
        </a>
    <?php endif; ?>

    <div class="mymmo-news-body">
        <h3 class="mymmo-news-kop">
            <?php if ($url !== '') : ?>
                <a href="<?php echo esc_url($url); ?>" <?php echo mymmo_news_link_attrs(); ?>><?php
                    echo esc_html($kop);
                ?></a>
            <?php else : ?>
                <?php echo esc_html($kop); ?>
            <?php endif; ?>
        </h3>

        <?php if ($ev !== null) : ?>
            <?php
            /* Wanneer en waar staan BOVEN de samenvatting: bij een event is dat
               het eerste wat iemand wil weten, en het bepaalt of hij verder
               leest. Elke regel valt apart weg als hij leeg is -- een online
               event heeft geen locatie, en een event zonder plaatsenlimiet
               heeft geen teller. */
            $moment = mymmo_news_event_moment($ev['starts_at'] ?? null);
            $plaats = trim((string) ($ev['location'] ?? ''));
            $vrij = isset($ev['seats_left']) && is_numeric($ev['seats_left'])
                ? (int) $ev['seats_left']
                : null;
            ?>
            <?php if ($moment !== '' || $plaats !== '' || $vrij !== null) : ?>
                <ul class="mymmo-news-eventinfo">
                    <?php if ($moment !== '') : ?>
                        <li><?php echo $icoon('calendar'); ?><span><?php
                            echo esc_html($moment);
                        ?></span></li>
                    <?php endif; ?>
                    <?php if ($plaats !== '') : ?>
                        <li><?php echo $icoon('pin'); ?><span><?php
                            echo esc_html($plaats);
                        ?></span></li>
                    <?php endif; ?>
                    <?php if ($vrij !== null && $vrij >= 0) : ?>
                        <li><?php echo $icoon('seats'); ?><span><?php
                            echo esc_html($vrij === 0
                                ? 'Volzet'
                                : sprintf(_n('Nog %d plaats', 'Nog %d plaatsen', $vrij, 'mymmo-news'), $vrij));
                        ?></span></li>
                    <?php endif; ?>
                </ul>
            <?php endif; ?>
        <?php endif; ?>

        <?php if ($snoot !== '') : ?>
            <p class="mymmo-news-snoot"><?php echo esc_html($snoot); ?></p>
        <?php endif; ?>

        <?php if (!empty($item['summary'])) : ?>
            <p class="mymmo-news-tekst"><?php echo esc_html((string) $item['summary']); ?></p>
        <?php endif; ?>

        <?php if ($citaat !== '') : ?>
            <blockquote class="mymmo-news-citaat">
                <?php echo $icoon('quote'); ?>
                <p><?php echo esc_html($citaat); ?></p>
            </blockquote>
        <?php endif; ?>

        <?php if (!empty($labels)) : ?>
            <ul class="mymmo-news-labels">
                <?php foreach ($labels as $label) : ?>
                    <?php /* Klikbaar: een label aanklikken zet de filterbalk
                             erop. Dat is wat een lezer verwacht van een chip,
                             en het is hoe je van één bericht naar meer van
                             hetzelfde gaat. */ ?>
                    <li><button type="button" class="mymmo-news-label"
                                data-mymmo-news-label="<?php echo esc_attr($label['slug']); ?>"><?php
                        echo esc_html($label['name']);
                    ?></button></li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>
    </div>

    <footer class="mymmo-news-acties">
        <?php echo Mymmo_News_Renderers::actions($item); ?>
    </footer>
</li>
