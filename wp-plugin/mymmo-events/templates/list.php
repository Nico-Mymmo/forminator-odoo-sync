<?php
/**
 * Eventlijst. Overschrijfbaar via {thema}/mymmo-events/list.php
 *
 * @var array $data ['events' => array[], 'layout' => string, 'show_past' => bool, 'stale' => bool]
 */

declare(strict_types=1);

$events = $data['events'] ?? [];
$layout = ($data['layout'] ?? 'rows') === 'cards' ? 'cards' : 'rows';
?>
<div class="mymmo-ev mymmo-ev-list mymmo-ev-list--<?php echo esc_attr($layout); ?>">

    <?php if (!empty($data['stale'])) : ?>
        <p class="mymmo-ev-notice"><?php echo mymmo_events_icon('alert'); ?>Dit overzicht is even niet ververst.</p>
    <?php endif; ?>

    <?php if ($events === []) : ?>
        <p class="mymmo-ev-empty">
            <?php echo esc_html(!empty($data['show_past'])
                ? 'Er zijn nog geen events.'
                : 'Er staan momenteel geen events gepland. Kom binnenkort terug.'); ?>
        </p>
    <?php else : ?>
        <?php
        $current_month = '';
        foreach ($events as $event) :
            $start = mymmo_events_date($event['starts_at'] ?? null);
            $month = $start ? MYMMO_EVENTS_MONTHS[(int) $start->format('n')] . ' ' . $start->format('Y') : '';

            if ($month !== '' && $month !== $current_month) :
                $current_month = $month;
                ?>
                <h2 class="mymmo-ev-list__month"><?php echo esc_html($month); ?></h2>
            <?php endif; ?>

            <?php echo mymmo_events_render('partials/event-card', ['event' => $event, 'layout' => $layout]); ?>
        <?php endforeach; ?>
    <?php endif; ?>
</div>
