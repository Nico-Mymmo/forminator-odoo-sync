<?php
/**
 * Maandkalender. Overschrijfbaar via {thema}/mymmo-events/calendar.php
 *
 * Werkt zonder JavaScript: de maandnavigatie en de type-filter chips zijn
 * gewone links (?mymmo_month=, ?mymmo_type=). mymmo-events.js onderschept
 * die klikken en toont dan gewoon de al meegerenderde maand (zie
 * $data['months'] in class-shortcodes.php) -- geen aanvraag, geen
 * wachttijd. Enkel ver buiten het vooraf opgehaalde bereik (data-horizon-
 * month) haalt hij alsnog één maand op via het REST-endpoint en wisselt
 * hij de inhoud van .mymmo-ev-inner -- de links blijven het echte
 * mechanisme voor wie zonder JS surft.
 *
 * @var array $data
 */

declare(strict_types=1);

$first = $data['first'];
$current_month = $first->format('Y-m');
$months = $data['months'] ?? [$current_month => mymmo_events_render('partials/calendar-inner', $data)];
?>
<div class="mymmo-ev mymmo-ev-calendar" id="mymmo-kalender"
     data-mymmo-component="calendar"
     data-month="<?php echo esc_attr($current_month); ?>"
     data-this-month="<?php echo esc_attr((string) ($data['this_month'] ?? '')); ?>"
     data-horizon-month="<?php echo esc_attr((string) ($data['horizon_month'] ?? '')); ?>"
     data-type="<?php echo esc_attr((string) ($data['type'] ?? '')); ?>"
     data-format="<?php echo esc_attr((string) ($data['format'] ?? '')); ?>"
     data-rest-url="<?php echo esc_url(rest_url('mymmo-events/v1/calendar')); ?>">

    <?php if (!empty($data['jumped'])) : ?>
        <p class="mymmo-ev-notice mymmo-ev-notice--info">
            <?php echo mymmo_events_icon('calendar'); ?>
            Er staan deze maand geen events. Dit is de eerstvolgende maand met events.
        </p>
    <?php endif; ?>

    <div class="mymmo-ev-inner">
        <?php foreach ($months as $month_key => $month_html) : ?>
            <div class="mymmo-ev-month-slot"
                 data-month-slot="<?php echo esc_attr((string) $month_key); ?>"
                 <?php echo ((string) $month_key === $current_month) ? '' : 'hidden'; ?>>
                <?php echo $month_html; ?>
            </div>
        <?php endforeach; ?>
    </div>
</div>
