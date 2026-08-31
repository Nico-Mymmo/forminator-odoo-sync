<?php
/**
 * Een event in de lijst. Overschrijfbaar via
 * {thema}/mymmo-events/partials/event-card.php
 *
 * @var array $data ['event' => array, 'layout' => 'rows'|'cards']
 */

declare(strict_types=1);

$event = $data['event'] ?? [];
$layout = ($data['layout'] ?? 'rows') === 'cards' ? 'cards' : 'rows';

$start = mymmo_events_date($event['starts_at'] ?? null);
$permalink = mymmo_events_permalink($event);
$type = $event['type'] ?? [];
$format = mymmo_events_format_meta((string) ($event['format'] ?? 'online'));
$registration = $event['registration'] ?? [];
$seats_left = $registration['seats_left'] ?? null;
$past = mymmo_events_is_past($event);
?>
<article class="mymmo-ev-card mymmo-ev-card--<?php echo esc_attr($layout); ?><?php echo $past ? ' is-past' : ''; ?>">

    <?php if ($start) : ?>
        <div class="mymmo-ev-card__date" aria-hidden="true">
            <span class="mymmo-ev-card__dow"><?php echo esc_html(MYMMO_EVENTS_DAYS_SHORT[(int) $start->format('w')]); ?></span>
            <span class="mymmo-ev-card__day"><?php echo esc_html($start->format('j')); ?></span>
            <span class="mymmo-ev-card__month"><?php echo esc_html(substr(MYMMO_EVENTS_MONTHS[(int) $start->format('n')], 0, 3)); ?></span>
        </div>
    <?php endif; ?>

    <div class="mymmo-ev-card__body">
        <p class="mymmo-ev-card__when">
            <?php echo esc_html(mymmo_events_format_datetime_line($event)); ?>
        </p>

        <h3 class="mymmo-ev-card__title">
            <?php if ($permalink !== '') : ?>
                <a href="<?php echo esc_url($permalink); ?>"><?php echo esc_html((string) ($event['title'] ?? '')); ?></a>
            <?php else : ?>
                <?php echo esc_html((string) ($event['title'] ?? '')); ?>
            <?php endif; ?>
        </h3>

        <p class="mymmo-ev-card__meta">
            <?php if (!empty($type['name'])) : ?>
                <span class="mymmo-ev-pill" style="--mymmo-ev-pill-color: <?php echo esc_attr((string) ($type['color'] ?? '#475569')); ?>">
                    <span class="mymmo-ev-pill__dot"></span><?php echo esc_html((string) $type['name']); ?>
                </span>
            <?php endif; ?>

            <span class="mymmo-ev-tag"><?php echo mymmo_events_icon($format['icon']); ?><?php echo esc_html($format['label']); ?></span>

            <?php if (!empty($event['location']['name'])) : ?>
                <span class="mymmo-ev-tag mymmo-ev-tag--muted"><?php echo esc_html((string) $event['location']['name']); ?></span>
            <?php endif; ?>

            <?php if (is_int($seats_left) && $seats_left <= 5 && !$past) : ?>
                <span class="mymmo-ev-tag mymmo-ev-tag--urgent">
                    <?php echo $seats_left === 0 ? 'Volzet' : esc_html(sprintf('Nog %d plaats%s', $seats_left, $seats_left === 1 ? '' : 'en')); ?>
                </span>
            <?php endif; ?>
        </p>

        <?php if (!empty($event['summary'])) : ?>
            <p class="mymmo-ev-card__summary"><?php echo esc_html((string) $event['summary']); ?></p>
        <?php endif; ?>

        <?php if ($permalink !== '') : ?>
            <p class="mymmo-ev-card__cta">
                <a class="mymmo-ev-link" href="<?php echo esc_url($permalink); ?>">
                    <?php echo $past ? 'Bekijk de recap' : 'Meer info en inschrijven'; ?>
                    <?php echo mymmo_events_icon('arrow'); ?>
                </a>
            </p>
        <?php endif; ?>
    </div>
</article>
