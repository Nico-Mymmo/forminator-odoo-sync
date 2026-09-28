<?php
/**
 * De feed.
 *
 * @var string $instance_id
 * @var array  $items
 * @var array  $meta
 * @var array  $categories
 * @var array  $tags
 * @var string $filters
 * @var array  $filter_tags
 * @var array  $filter_types
 * @var int    $limit
 * @var string $layout
 * @var string $heading
 * @var bool   $autoload
 * @var array  $onbekend
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

$toon_labels = in_array($filters, ['tags', 'both'], true) && !empty($filter_tags);
$toon_types = in_array($filters, ['types', 'both'], true) && count($filter_types) > 1;
$heeft_filters = $toon_labels || $toon_types;
$has_more = (bool) ($meta['has_more'] ?? false);
$lijst = Mymmo_News_Renderers::render_list($items, ['layout' => $layout]);
?>
<section class="mymmo-news mymmo-news--<?php echo esc_attr($layout); ?>"
         id="<?php echo esc_attr($instance_id); ?>"
         data-mymmo-news
         data-categories="<?php echo esc_attr(implode(',', $categories)); ?>"
         data-tags="<?php echo esc_attr(implode(',', $tags)); ?>"
         data-limit="<?php echo esc_attr((string) $limit); ?>"
         data-offset="<?php echo esc_attr((string) count($items)); ?>"
         data-maand="<?php echo esc_attr($lijst['maand']); ?>"
         data-layout="<?php echo esc_attr($layout); ?>"
         data-autoload="<?php echo $autoload ? '1' : '0'; ?>"
         data-endpoint="<?php echo esc_url(rest_url(Mymmo_News_Rest::NAMESPACE . '/feed')); ?>">

    <?php if ($heading !== '') : ?>
        <h2 class="mymmo-news-heading"><?php echo esc_html($heading); ?></h2>
    <?php endif; ?>

    <?php if (!empty($onbekend) && current_user_can('edit_posts')) : ?>
        <?php /* Alleen voor redacteuren: een typefout in de shortcode mag niet
                 stil alles tonen, maar een bezoeker heeft er niets aan. */ ?>
        <p class="mymmo-news-melding mymmo-news-melding--let-op">
            Deze shortcode verwijst naar iets dat niet bestaat:
            <code><?php echo esc_html(implode('</code>, <code>', $onbekend)); ?></code>.
            Kijk de schrijfwijze na bij Instellingen → Mymmo News.
        </p>
    <?php endif; ?>

    <?php if ($heeft_filters) : ?>
        <?php echo mymmo_news_template('partials/filter-bar.php', [
            'filter_tags' => $toon_labels ? $filter_tags : [],
            'filter_types' => $toon_types ? $filter_types : [],
            'instance_id' => $instance_id,
        ]); ?>
    <?php endif; ?>

    <?php
    /* aria-live="polite" zodat een schermlezer meldt dat er bijgeladen is --
       zonder dat blijft een oneindige lijst voor die gebruiker stil staan.
       aria-busy wordt door het script gezet tijdens het laden. */
    ?>
    <ul class="mymmo-news-list" data-mymmo-news-list aria-live="polite" aria-busy="false">
        <?php echo $lijst['html']; ?>
    </ul>

    <?php if (empty($items)) : ?>
        <p class="mymmo-news-leeg" data-mymmo-news-leeg>
            <?php if (Mymmo_News_Api_Client::last_error() !== null && current_user_can('edit_posts')) : ?>
                De nieuwsfeed kon niet geladen worden:
                <?php echo esc_html((string) Mymmo_News_Api_Client::last_error()); ?>
            <?php else : ?>
                Er staan hier nog geen berichten.
            <?php endif; ?>
        </p>
        <?php if (current_user_can('edit_posts')) : ?>
            <?php /* Waarom is deze feed leeg? Zonder dit is "geen berichten"
                     niet te onderscheiden van een verkeerde shortcode, een
                     storing bij de OM, of een antwoord uit de noodcache -- en
                     dat kost elke keer een ronde blind zoeken. Alleen voor
                     redacteuren; een bezoeker heeft er niets aan. */ ?>
            <p class="mymmo-news-melding">
                Redacteur: de Operations Manager gaf 0 berichten terug voor
                categorieen <code><?php echo esc_html($categories ? implode(', ', $categories) : 'alle'); ?></code>
                en labels <code><?php echo esc_html($tags ? implode(', ', $tags) : 'geen'); ?></code>.
                <?php if (Mymmo_News_Api_Client::served_stale()) : ?>
                    Dit antwoord komt uit de noodcache, niet uit een verse oproep.
                <?php endif; ?>
            </p>
        <?php endif; ?>
    <?php else : ?>
        <p class="mymmo-news-leeg" data-mymmo-news-leeg hidden>
            Geen berichten met deze filters.
        </p>
    <?php endif; ?>

    <?php /* De knop is de ECHTE besturing; autoload is er enkel bovenop. Een
             oneindige lijst zonder knop is niet bedienbaar met een toetsenbord
             en niet te bereiken als de observer niet afgaat. */ ?>
    <div class="mymmo-news-meer">
        <button type="button" class="mymmo-news-knop" data-mymmo-news-meer
                <?php echo $has_more ? '' : 'hidden'; ?>>
            <span data-mymmo-news-meer-label>Meer berichten</span>
            <span class="mymmo-news-spinner" aria-hidden="true" hidden></span>
        </button>
        <span class="mymmo-news-sentinel" data-mymmo-news-sentinel aria-hidden="true"></span>
    </div>
</section>
