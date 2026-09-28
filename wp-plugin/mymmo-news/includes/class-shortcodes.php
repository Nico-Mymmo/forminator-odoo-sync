<?php
/**
 * De shortcode `[mymmo_news]`.
 *
 * De EERSTE PAGINA wordt server-side gerenderd. Dat is het belangrijkste
 * verschil met de plugin die we vervangen: er staat inhoud in de HTML, dus
 * zoekmachines zien ze, en een bezoeker zonder (werkende) JavaScript krijgt
 * een volwaardige lijst in plaats van een leeg vlak. JavaScript voegt daarna
 * alleen gedrag toe -- filteren en bijladen.
 *
 * Attributen:
 *   categories="artikel,podcast"   welke categorieen deze feed toont (leeg = alle)
 *   tags="volgens-de-regels"       voorfilter op labels (leeg = geen)
 *   filters="both"                 tags | types | both | none
 *                                  (types verschijnen enkel als deze feed
 *                                   er meer dan een toont -- een filterrij
 *                                   met een knop is geen keuze)
 *   limit="12"                     berichten per pagina
 *   layout="feed"                  feed | grid
 *   heading=""                     optionele kop boven de feed
 *   autoload="yes"                 bijladen bij scrollen (knop blijft altijd)
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_News_Shortcodes {

    private static int $instances = 0;

    public static function register(): void {
        add_shortcode('mymmo_news', [self::class, 'render']);
    }

    /**
     * @param array<string,mixed>|string $atts
     */
    public static function render($atts = []): string {
        $atts = shortcode_atts([
            'categories' => '',
            'tags' => '',
            'filters' => 'both',
            'limit' => 12,
            'layout' => 'feed',
            'heading' => '',
            'autoload' => 'yes',
        ], is_array($atts) ? $atts : [], 'mymmo_news');

        $categories = mymmo_news_slug_lijst($atts['categories']);
        $tags = mymmo_news_slug_lijst($atts['tags']);
        $limit = max(1, min(50, (int) $atts['limit']));
        $layout = in_array($atts['layout'], ['feed', 'grid'], true) ? $atts['layout'] : 'feed';
        $filters = in_array($atts['filters'], ['tags', 'types', 'both', 'none'], true)
            ? $atts['filters']
            : 'both';
        $autoload = !in_array(strtolower((string) $atts['autoload']), ['no', 'false', '0'], true);

        wp_enqueue_style('mymmo-news');
        wp_enqueue_script('mymmo-news');

        $taxonomy = Mymmo_News_Api_Client::get_taxonomy();

        // Een categorie die niet bestaat is een typefout in de shortcode. Die
        // MELDEN we aan beheerders in plaats van stil alles te tonen: dat is
        // hoe een pagina er goed uitziet terwijl ze het verkeerde toont.
        $onbekend = self::onbekende_slugs($categories, $taxonomy['types'] ?? []);
        $onbekend = array_merge($onbekend, self::onbekende_slugs($tags, $taxonomy['tags'] ?? []));

        $feed = Mymmo_News_Api_Client::get_items([
            'type' => $categories,
            'tag' => $tags,
            'limit' => $limit,
            'offset' => 0,
        ]);

        self::$instances++;
        $instance_id = 'mymmo-news-' . self::$instances;

        // Welke labels in de filterbalk staan: alleen die van deze feed, niet
        // alle labels die in Odoo bestaan. Een filter dat gegarandeerd nul
        // resultaten geeft, hoort er niet te staan.
        $filter_tags = self::zichtbare_labels($taxonomy['tags'] ?? [], $categories, $tags);
        $filter_types = self::gekozen_types($taxonomy['types'] ?? [], $categories);

        return mymmo_news_template('feed.php', [
            'instance_id' => $instance_id,
            'items' => $feed['items'],
            'meta' => $feed['meta'],
            'categories' => $categories,
            'tags' => $tags,
            'filters' => $filters,
            'filter_tags' => $filter_tags,
            'filter_types' => $filter_types,
            'limit' => $limit,
            'layout' => $layout,
            'heading' => (string) $atts['heading'],
            'autoload' => $autoload,
            'onbekend' => $onbekend,
        ]);
    }

    /**
     * Slugs die niet in de taxonomie voorkomen.
     *
     * @param string[] $slugs
     * @param array<int,array<string,mixed>> $lijst
     * @return string[]
     */
    private static function onbekende_slugs(array $slugs, array $lijst): array {
        if (!$slugs) {
            return [];
        }
        $bestaand = [];
        foreach ($lijst as $rij) {
            if (isset($rij['slug'])) {
                $bestaand[] = (string) $rij['slug'];
            }
        }
        // Is de taxonomie niet opgehaald (API onbereikbaar), dan weten we
        // niets en melden we niets -- anders krijgt een beheerder een
        // foutmelding over zijn shortcode terwijl de verbinding het probleem is.
        if (!$bestaand) {
            return [];
        }
        return array_values(array_diff($slugs, $bestaand));
    }

    /**
     * De labels voor de filterbalk.
     *
     * @param array<int,array<string,mixed>> $alle
     * @param string[] $categories
     * @param string[] $vast
     * @return array<int,array<string,string>>
     */
    private static function zichtbare_labels(array $alle, array $categories, array $vast): array {
        $uit = [];
        foreach ($alle as $tag) {
            if (empty($tag['slug']) || empty($tag['name'])) {
                continue;
            }
            // Staat een label al vast in de shortcode, dan is het geen keuze
            // meer maar een eigenschap van deze feed.
            if (in_array((string) $tag['slug'], $vast, true)) {
                continue;
            }
            $uit[] = ['slug' => (string) $tag['slug'], 'name' => (string) $tag['name']];
        }
        return $uit;
    }

    /**
     * @param array<int,array<string,mixed>> $alle
     * @param string[] $categories
     * @return array<int,array<string,string>>
     */
    private static function gekozen_types(array $alle, array $categories): array {
        $uit = [];
        foreach ($alle as $type) {
            if (empty($type['slug']) || empty($type['name'])) {
                continue;
            }
            if ($categories && !in_array((string) $type['slug'], $categories, true)) {
                continue;
            }
            $uit[] = ['slug' => (string) $type['slug'], 'name' => (string) $type['name']];
        }
        return $uit;
    }
}
