<?php
/**
 * Maandkalender. Overschrijfbaar via {thema}/mymmo-events/calendar.php
 *
 * Werkt zonder JavaScript: de maandnavigatie zijn gewone links met
 * ?mymmo_month=. De JS voegt daarna alleen het wisselen zonder herladen
 * toe, als progressive enhancement.
 *
 * @var array $data
 */

declare(strict_types=1);

$first = $data['first'];
$grid_start = $data['grid_start'];
$grid_end = $data['grid_end'];
$by_day = $data['by_day'] ?? [];
$tz = mymmo_events_timezone();
$today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');

$month_label = MYMMO_EVENTS_MONTHS[(int) $first->format('n')] . ' ' . $first->format('Y');
$prev = $first->modify('-1 month')->format('Y-m');
$next = $first->modify('+1 month')->format('Y-m');
$this_month = (new DateTimeImmutable('now', $tz))->format('Y-m');

$base_url = remove_query_arg(['mymmo_month', 'mymmo_reg']);
$link = static fn (string $month): string => esc_url(add_query_arg('mymmo_month', $month, $base_url) . '#mymmo-kalender');
?>
<div class="mymmo-ev mymmo-ev-calendar" id="mymmo-kalender"
     data-month="<?php echo esc_attr($first->format('Y-m')); ?>"
     data-type="<?php echo esc_attr((string) ($data['type'] ?? '')); ?>"
     data-format="<?php echo esc_attr((string) ($data['format'] ?? '')); ?>">

    <?php if (!empty($data['stale'])) : ?>
        <p class="mymmo-ev-notice"><?php echo mymmo_events_icon('alert'); ?>Deze kalender is even niet ververst.</p>
    <?php endif; ?>

    <div class="mymmo-ev-calendar__bar">
        <div class="mymmo-ev-calendar__nav">
            <a class="mymmo-ev-navbtn" href="<?php echo $link($prev); ?>" rel="prev"
               aria-label="Vorige maand">&#8249;</a>
            <a class="mymmo-ev-navbtn" href="<?php echo $link($next); ?>" rel="next"
               aria-label="Volgende maand">&#8250;</a>
            <?php if ($first->format('Y-m') !== $this_month) : ?>
                <a class="mymmo-ev-navbtn mymmo-ev-navbtn--text" href="<?php echo $link($this_month); ?>">Vandaag</a>
            <?php endif; ?>
        </div>
        <h2 class="mymmo-ev-calendar__title"><?php echo esc_html($month_label); ?></h2>
    </div>

    <div class="mymmo-ev-grid" role="table">
        <div class="mymmo-ev-grid__head" role="row">
            <?php foreach (['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as $dow) : ?>
                <span role="columnheader"><?php echo esc_html($dow); ?></span>
            <?php endforeach; ?>
        </div>

        <div class="mymmo-ev-grid__body">
            <?php
            $cursor = $grid_start;
            while ($cursor <= $grid_end) :
                $key = $cursor->format('Y-m-d');
                $day_events = $by_day[$key] ?? [];
                $classes = ['mymmo-ev-day'];

                if ($cursor->format('Y-m') !== $first->format('Y-m')) {
                    $classes[] = 'is-outside';
                }
                if ($key === $today) {
                    $classes[] = 'is-today';
                } elseif ($key < $today) {
                    $classes[] = 'is-past';
                }
                if ($day_events !== []) {
                    $classes[] = 'has-events';
                }
                ?>
                <div class="<?php echo esc_attr(implode(' ', $classes)); ?>" role="cell">
                    <span class="mymmo-ev-day__num"><?php echo esc_html($cursor->format('j')); ?></span>

                    <?php foreach ($day_events as $event) :
                        $start = mymmo_events_date($event['starts_at'] ?? null);
                        $type = $event['type'] ?? [];
                        $permalink = mymmo_events_permalink($event);
                        $format = mymmo_events_format_meta((string) ($event['format'] ?? 'online'));
                        $full = ($event['registration']['seats_left'] ?? null) === 0;
                        ?>
                        <a class="mymmo-ev-chip<?php echo $full ? ' is-full' : ''; ?>"
                           href="<?php echo esc_url($permalink); ?>"
                           style="--mymmo-ev-chip-color: <?php echo esc_attr((string) ($type['color'] ?? '#475569')); ?>"
                           title="<?php echo esc_attr(trim((string) ($event['title'] ?? '') . ' — ' . $format['label'])); ?>">
                            <span class="mymmo-ev-chip__type"><?php echo esc_html((string) ($type['name'] ?? 'Event')); ?></span>
                            <span class="mymmo-ev-chip__time">
                                <?php echo esc_html($start ? $start->format('H:i') : ''); ?>
                                <?php if ($full) : ?><em>volzet</em><?php endif; ?>
                            </span>
                        </a>
                    <?php endforeach; ?>
                </div>
                <?php
                $cursor = $cursor->modify('+1 day');
            endwhile;
            ?>
        </div>
    </div>

    <?php if (!empty($data['empty'])) : ?>
        <p class="mymmo-ev-empty">Deze maand staan er geen events gepland.</p>
    <?php endif; ?>
</div>
