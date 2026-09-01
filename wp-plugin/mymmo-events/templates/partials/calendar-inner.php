<?php
/**
 * De wisselbare inhoud van de kalender: balk (navigatie + titel + type-
 * filter) en het maandraster. Wordt zowel bij de eerste, server-side render
 * gebruikt als door het REST-endpoint (class-rest.php) bij een maandwissel
 * zonder herladen -- vandaar een aparte partial i.p.v. dit inline in
 * calendar.php te zetten: zo bestaat de renderlogica maar op één plek.
 *
 * Overschrijfbaar via {thema}/mymmo-events/partials/calendar-inner.php
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
$this_month = (string) ($data['this_month'] ?? (new DateTimeImmutable('now', $tz))->format('Y-m'));

$base_url = remove_query_arg(['mymmo_month', 'mymmo_reg']);
$link = static fn (string $month): string => esc_url(add_query_arg('mymmo_month', $month, $base_url) . '#mymmo-kalender');
?>
<?php if (!empty($data['stale'])) : ?>
    <p class="mymmo-ev-notice"><?php echo mymmo_events_icon('alert'); ?>Deze kalender is even niet ververst.</p>
<?php endif; ?>

<div class="mymmo-ev-calendar__bar">
    <div class="mymmo-ev-calendar__nav">
        <?php if ($first->format('Y-m') > $this_month) : ?>
            <a class="mymmo-ev-navbtn" href="<?php echo $link($prev); ?>" rel="prev"
               data-month="<?php echo esc_attr($prev); ?>" aria-label="Vorige maand">&#8249;</a>
        <?php else : ?>
            <span class="mymmo-ev-navbtn mymmo-ev-navbtn--disabled" aria-hidden="true">&#8249;</span>
        <?php endif; ?>
        <a class="mymmo-ev-navbtn" href="<?php echo $link($next); ?>" rel="next"
           data-month="<?php echo esc_attr($next); ?>" aria-label="Volgende maand">&#8250;</a>
        <?php if ($first->format('Y-m') !== $this_month) : ?>
            <a class="mymmo-ev-navbtn mymmo-ev-navbtn--text" href="<?php echo $link($this_month); ?>"
               data-month="<?php echo esc_attr($this_month); ?>">Vandaag</a>
        <?php endif; ?>
    </div>
    <h2 class="mymmo-ev-calendar__title"><?php echo esc_html($month_label); ?></h2>

    <?php echo mymmo_events_render('partials/type-filter', [
        'types' => $data['types'] ?? [],
        'selected' => $data['selected_types'] ?? [],
        // mymmo_month blijft staan (dezelfde maand na het kiezen van een
        // type), enkel mymmo_type en de eenmalige mymmo_reg-flash niet.
        'base_url' => remove_query_arg(['mymmo_type', 'mymmo_reg']),
    ]); ?>
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
            <div class="<?php echo esc_attr(implode(' ', $classes)); ?>" role="cell" data-mymmo-day>
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
                       data-type-id="<?php echo esc_attr((string) ($type['id'] ?? 0)); ?>"
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

<p class="mymmo-ev-empty" data-mymmo-empty-default<?php echo empty($data['empty']) ? ' hidden' : ''; ?>>
    Deze maand staan er geen events gepland.
</p>
<p class="mymmo-ev-empty" data-mymmo-empty-filtered hidden>
    Geen events voor de gekozen filters.
</p>
