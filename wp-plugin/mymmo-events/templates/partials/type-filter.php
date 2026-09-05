<?php
/**
 * Chips om te filteren op event type — togglebaar, werkt zonder JS via
 * ?mymmo_type= (komma-lijst van Odoo event-type-id's, of expliciet leeg
 * als bewust alles uitgevinkt is). Overschrijfbaar via
 * {thema}/mymmo-events/partials/type-filter.php
 *
 * Wordt enkel meegegeven door de shortcode als het 'type'-attribuut zelf
 * leeg is -- staat het vast, dan is er niets om te kiezen en verschijnt
 * deze partial niet. Zie resolve_types() in class-shortcodes.php.
 *
 * Standaard staan alle chips actief (zie resolve_types()): dat toont dat
 * er nog niet gefilterd wordt, in plaats van dat de chips uit lijken te
 * staan terwijl toch alles getoond wordt.
 *
 * data-type-id op elke chip: mymmo-events.js gebruikt dat om de al
 * aanwezige events/kaarten clientside te tonen/verbergen, zonder de pagina
 * opnieuw op te halen.
 *
 * @var array $data ['types' => array[], 'selected' => int[], 'base_url' => string]
 */

declare(strict_types=1);

$types = $data['types'] ?? [];
$selected = $data['selected'] ?? [];
$base_url = (string) ($data['base_url'] ?? '');

if ($types === []) {
    return;
}
?>
<div class="mymmo-ev-typefilter" role="group" aria-label="Filter op event type">
    <?php foreach ($types as $type) :
        $id = (int) ($type['id'] ?? 0);
        if ($id === 0) {
            continue;
        }

        $is_active = in_array($id, $selected, true);
        $next = $is_active
            ? array_values(array_diff($selected, [$id]))
            : array_values(array_unique(array_merge($selected, [$id])));

        // Altijd expliciet meegeven, ook als $next leeg is -- anders wint bij
        // een lege waarde de standaard ("geen parameter" = alles), terwijl
        // dit net "bewust alles uitgevinkt" moet betekenen.
        $href = esc_url(add_query_arg('mymmo_type', implode(',', $next), $base_url));
        ?>
        <a class="mymmo-ev-chipfilter<?php echo $is_active ? ' is-active' : ''; ?>"
           href="<?php echo $href; ?>"
           data-type-id="<?php echo esc_attr((string) $id); ?>"
           data-next="<?php echo esc_attr(implode(',', $next)); ?>"
           style="--mymmo-ev-chip-color: <?php echo esc_attr((string) ($type['color'] ?? '#475569')); ?>"
           aria-pressed="<?php echo $is_active ? 'true' : 'false'; ?>"><?php echo esc_html((string) ($type['name'] ?? '')); ?></a>
    <?php endforeach; ?>
</div>
