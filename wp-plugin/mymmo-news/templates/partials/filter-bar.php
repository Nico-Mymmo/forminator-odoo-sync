<?php
/**
 * De filterbalk.
 *
 * Echte `<button>`-elementen met `aria-pressed`, geen links en geen
 * checkboxes die eruitzien als knoppen: een filter is een schakelaar, en dat
 * is precies wat aria-pressed betekent. Daarmee werkt de balk met een
 * toetsenbord en met een schermlezer zonder dat er iets extra's nodig is.
 *
 * De balk plakt bovenaan tijdens het scrollen -- dat is wat elke feed doet,
 * en het is de reden dat je halverwege een lange lijst nog kan bijsturen
 * zonder terug naar boven te scrollen.
 *
 * @var array  $filter_tags
 * @var array  $filter_types
 * @var string $instance_id
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="mymmo-news-filters" data-mymmo-news-filters>
    <?php if (!empty($filter_types)) : ?>
        <div class="mymmo-news-filterrij" role="group"
             aria-label="Filter op soort">
            <button type="button" class="mymmo-news-chip is-actief"
                    data-mymmo-news-filter="type" data-waarde=""
                    aria-pressed="true">Alles</button>
            <?php foreach ($filter_types as $type) : ?>
                <button type="button" class="mymmo-news-chip"
                        data-mymmo-news-filter="type"
                        data-waarde="<?php echo esc_attr($type['slug']); ?>"
                        aria-pressed="false"><?php echo esc_html($type['name']); ?></button>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <?php if (!empty($filter_tags)) : ?>
        <div class="mymmo-news-filterrij" role="group"
             aria-label="Filter op label">
            <button type="button" class="mymmo-news-chip is-actief"
                    data-mymmo-news-filter="tag" data-waarde=""
                    aria-pressed="true">Alle labels</button>
            <?php foreach ($filter_tags as $tag) : ?>
                <button type="button" class="mymmo-news-chip"
                        data-mymmo-news-filter="tag"
                        data-waarde="<?php echo esc_attr($tag['slug']); ?>"
                        aria-pressed="false"><?php echo esc_html($tag['name']); ?></button>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>
