<?php
/**
 * Eventlijst, per maand -- met dezelfde vorige/volgende-navigatie als de
 * kalender. Overschrijfbaar via {thema}/mymmo-events/list.php
 *
 * Werkt zonder JavaScript: de maandnavigatie en de type-filter chips zijn
 * gewone links. mymmo-events.js onderschept die klikken en toont dan
 * gewoon de al meegerenderde maand (zie $data['months'] in
 * class-shortcodes.php) -- geen aanvraag, geen wachttijd. Enkel ver
 * buiten het vooraf opgehaalde bereik (data-horizon-month) haalt hij
 * alsnog één maand op via het REST-endpoint en wisselt hij de inhoud van
 * .mymmo-ev-inner.
 *
 * @var array $data
 */

declare(strict_types=1);

$layout = ($data['layout'] ?? 'rows') === 'cards' ? 'cards' : 'rows';
$current_month = (string) ($data['month'] ?? '');
$months = $data['months'] ?? [$current_month => mymmo_events_render('partials/list-inner', $data)];
?>
<div class="mymmo-ev mymmo-ev-list mymmo-ev-list--<?php echo esc_attr($layout); ?>"
     data-mymmo-component="list"
     data-month="<?php echo esc_attr($current_month); ?>"
     data-this-month="<?php echo esc_attr((string) ($data['this_month'] ?? '')); ?>"
     data-horizon-month="<?php echo esc_attr((string) ($data['horizon_month'] ?? '')); ?>"
     data-type="<?php echo esc_attr((string) ($data['type'] ?? '')); ?>"
     data-format="<?php echo esc_attr((string) ($data['format'] ?? '')); ?>"
     data-layout="<?php echo esc_attr($layout); ?>"
     data-show-past="<?php echo !empty($data['show_past']) ? '1' : '0'; ?>"
     data-rest-url="<?php echo esc_url(rest_url('mymmo-events/v1/list')); ?>">

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
