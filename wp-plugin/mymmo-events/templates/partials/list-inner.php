<?php
/**
 * De wisselbare inhoud van de eventlijst: balk (navigatie + titel + type-
 * filter) en de kaarten/rijen voor die maand. Gedeeld door de shortcode
 * (eerste render) en het REST-endpoint (maandwissel zonder herladen).
 *
 * Overschrijfbaar via {thema}/mymmo-events/partials/list-inner.php
 *
 * @var array $data ['events' => array[], 'layout' => string, 'show_past' => bool, ...]
 */

declare(strict_types=1);

$events = $data['events'] ?? [];
$layout = ($data['layout'] ?? 'rows') === 'cards' ? 'cards' : 'rows';
$tz = mymmo_events_timezone();
$show_past = !empty($data['show_past']);

$first = $data['first'] ?? DateTimeImmutable::createFromFormat(
    'Y-m-d H:i:s',
    (string) ($data['month'] ?? (new DateTimeImmutable('now', $tz))->format('Y-m')) . '-01 00:00:00',
    $tz
);
$month_label = MYMMO_EVENTS_MONTHS[(int) $first->format('n')] . ' ' . $first->format('Y');
$prev = $first->modify('-1 month')->format('Y-m');
$next = $first->modify('+1 month')->format('Y-m');
$this_month = (string) ($data['this_month'] ?? (new DateTimeImmutable('now', $tz))->format('Y-m'));
$can_go_back = $show_past || $first->format('Y-m') > $this_month;

$base_url = remove_query_arg('mymmo_month');
$link = static fn (string $month): string => esc_url(add_query_arg('mymmo_month', $month, $base_url));
?>
<div class="mymmo-ev-list__bar">
    <div class="mymmo-ev-calendar__nav">
        <?php if ($can_go_back) : ?>
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
    <h2 class="mymmo-ev-list__title"><?php echo esc_html($month_label); ?></h2>

    <?php echo mymmo_events_render('partials/type-filter', [
        'types' => $data['types'] ?? [],
        'selected' => $data['selected_types'] ?? [],
        'base_url' => remove_query_arg('mymmo_type'),
    ]); ?>
</div>

<?php if (!empty($data['stale'])) : ?>
    <p class="mymmo-ev-notice"><?php echo mymmo_events_icon('alert'); ?>Dit overzicht is even niet ververst.</p>
<?php endif; ?>

<div class="mymmo-ev-list__items">
    <?php foreach ($events as $event) : ?>
        <?php echo mymmo_events_render('partials/event-card', ['event' => $event, 'layout' => $layout]); ?>
    <?php endforeach; ?>
</div>

<p class="mymmo-ev-empty" data-mymmo-empty-default<?php echo $events === [] ? '' : ' hidden'; ?>>
    <?php echo esc_html($show_past
        ? 'Er zijn geen events in deze maand.'
        : 'Er staan deze maand geen events gepland.'); ?>
</p>
<p class="mymmo-ev-empty" data-mymmo-empty-filtered hidden>
    Geen events voor de gekozen filters.
</p>
