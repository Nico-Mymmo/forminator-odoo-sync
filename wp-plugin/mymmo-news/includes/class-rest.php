<?php
/**
 * De REST-route die de browser gebruikt om te filteren en bij te laden.
 *
 * WAAROM DIT BESTAAT en de browser niet rechtstreeks de OM aanspreekt: de
 * sitesleutel. Die mag nooit in de HTML of in een URL die de browser ziet.
 * PHP praat server-naar-server met de Worker; de browser praat met WordPress.
 * Zelfde opzet als mymmo-forms.
 *
 * De route geeft KLAARGEMAAKTE HTML terug, geen ruwe items. Dat is bewust:
 * anders bestaat er een tweede renderer in JavaScript naast die in PHP, en
 * dan gaan die twee uit elkaar lopen zodra er een nieuw soort item bijkomt --
 * precies het probleem dat het renderer-register moet voorkomen.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_News_Rest {

    public const NAMESPACE = 'mymmo-news/v1';

    public static function register(): void {
        register_rest_route(self::NAMESPACE, '/feed', [
            'methods' => 'GET',
            // Publieke leesroute: de feed staat ook op publieke pagina's.
            // Er is geen schrijfpad, en de sitesleutel blijft serverside.
            'permission_callback' => '__return_true',
            'callback' => [self::class, 'feed'],
            'args' => [
                'categories' => ['type' => 'string', 'required' => false],
                'tags' => ['type' => 'string', 'required' => false],
                'limit' => ['type' => 'integer', 'required' => false],
                'offset' => ['type' => 'integer', 'required' => false],
                'layout' => ['type' => 'string', 'required' => false],
                'prev_month' => ['type' => 'string', 'required' => false],
            ],
        ]);
    }

    public static function feed(WP_REST_Request $request): WP_REST_Response {
        $categories = mymmo_news_slug_lijst((string) $request->get_param('categories'));
        $tags = mymmo_news_slug_lijst((string) $request->get_param('tags'));
        $limit = max(1, min(50, (int) ($request->get_param('limit') ?: 12)));
        $offset = max(0, (int) $request->get_param('offset'));
        $layout = $request->get_param('layout') === 'grid' ? 'grid' : 'feed';

        $feed = Mymmo_News_Api_Client::get_items([
            'type' => $categories,
            'tag' => $tags,
            'limit' => $limit,
            'offset' => $offset,
        ]);

        // De maand van de laatste kaart die al op het scherm staat, zodat
        // bijladen geen tweede opschrift neerzet midden in een open maand.
        $vorige = (string) $request->get_param('prev_month');
        $lijst = Mymmo_News_Renderers::render_list($feed['items'], ['layout' => $layout], $vorige);
        $html = $lijst['html'];

        $response = new WP_REST_Response([
            'html' => $html,
            'count' => count($feed['items']),
            'has_more' => (bool) ($feed['meta']['has_more'] ?? false),
            'offset' => $offset + count($feed['items']),
            'last_month' => $lijst['maand'],
            'error' => Mymmo_News_Api_Client::last_error(),
            'stale' => Mymmo_News_Api_Client::served_stale(),
        ]);

        // Kort cachebaar aan de rand: de OM cachet zelf al 60 seconden, dus
        // langer bewaren hier zou enkel betekenen dat een net gepubliceerd
        // bericht trager verschijnt zonder dat het iets bespaart.
        $response->header('Cache-Control', 'public, max-age=60');

        return $response;
    }
}
