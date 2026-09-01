<?php
/**
 * Aankondiging-callout: het gehighlighte event (of het eerstvolgende),
 * met twee CTA's en een speelse kaartenstapel erachter. Overschrijfbaar
 * via {thema}/mymmo-events/announcement.php
 *
 * @var array $data ['event' => array, 'is_highlighted' => bool,
 *                    'others' => array[], 'scribbles' => string[]]
 */

declare(strict_types=1);

$event = $data['event'] ?? [];
$is_highlighted = !empty($data['is_highlighted']);
$others = array_slice($data['others'] ?? [], 0, 3);
$scribbles = $data['scribbles'] ?? [];

$start = mymmo_events_date($event['starts_at'] ?? null);
$permalink = mymmo_events_permalink($event);
$archive_url = mymmo_events_archive_url();
$registration = $event['registration'] ?? [];
$can_register = $permalink !== '' && !empty($registration['open']);
?>
<div class="mymmo-ev mymmo-ev-announce">
    <div class="mymmo-ev-announce__stage">

        <div class="mymmo-ev-announce__decor" aria-hidden="true">
            <?php foreach ($others as $i => $other) :
                $ostart = mymmo_events_date($other['starts_at'] ?? null);
                ?>
                <div class="mymmo-ev-announce__ghost mymmo-ev-announce__ghost--<?php echo (int) $i + 1; ?>">
                    <?php if ($ostart) : ?>
                        <span class="mymmo-ev-announce__ghost-date">
                            <?php echo esc_html(MYMMO_EVENTS_DAYS_SHORT[(int) $ostart->format('w')] . ' ' . $ostart->format('j M')); ?>
                        </span>
                    <?php endif; ?>
                    <span class="mymmo-ev-announce__ghost-title"><?php echo esc_html((string) ($other['title'] ?? '')); ?></span>
                </div>
            <?php endforeach; ?>

            <?php foreach ($scribbles as $i => $key) :
                $url = mymmo_events_asset_url((string) $key);
                if ($url === '') {
                    continue;
                }
                ?>
                <img class="mymmo-ev-announce__scribble mymmo-ev-announce__scribble--<?php echo (int) $i + 1; ?>"
                     src="<?php echo esc_url($url); ?>" alt="" loading="lazy" />
            <?php endforeach; ?>
        </div>

        <div class="mymmo-ev-announce__card">
            <span class="mymmo-ev-announce__kicker">
                <?php if ($is_highlighted) : ?>
                    <?php echo mymmo_events_icon('check'); ?>Aanbevolen event
                <?php else : ?>
                    <?php echo mymmo_events_icon('calendar'); ?>Binnenkort
                <?php endif; ?>
            </span>

            <?php if (!empty($event['hero_image_url'])) : ?>
                <div class="mymmo-ev-announce__image">
                    <img src="<?php echo esc_url((string) $event['hero_image_url']); ?>" alt="" />
                </div>
            <?php endif; ?>

            <h3 class="mymmo-ev-announce__title">
                <?php if ($permalink !== '') : ?>
                    <a href="<?php echo esc_url($permalink); ?>"><?php echo esc_html((string) ($event['title'] ?? '')); ?></a>
                <?php else : ?>
                    <?php echo esc_html((string) ($event['title'] ?? '')); ?>
                <?php endif; ?>
            </h3>

            <p class="mymmo-ev-announce__when">
                <?php echo mymmo_events_icon('clock'); ?><?php echo esc_html(mymmo_events_format_datetime_line($event)); ?>
            </p>

            <?php if (!empty($event['summary'])) : ?>
                <p class="mymmo-ev-announce__summary"><?php echo esc_html((string) $event['summary']); ?></p>
            <?php endif; ?>

            <div class="mymmo-ev-announce__ctas">
                <?php if ($permalink !== '') : ?>
                    <a class="mymmo-ev-btn mymmo-ev-btn--primary" href="<?php echo esc_url($permalink); ?>">
                        <?php echo $can_register ? 'Inschrijven' : 'Meer info'; ?>
                        <?php echo mymmo_events_icon('arrow'); ?>
                    </a>
                <?php endif; ?>
                <a class="mymmo-ev-btn" href="<?php echo esc_url($archive_url); ?>">
                    Bekijk onze andere events
                </a>
            </div>
        </div>
    </div>
</div>
