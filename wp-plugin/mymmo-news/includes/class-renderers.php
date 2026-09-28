<?php
/**
 * Het renderer-register — de plek waar nieuwe soorten inhoud inhaken.
 *
 * WAAROM DIT BESTAAT: de feed krijgt er later polls, video's, reacties en
 * events uit het OM bij. Zonder register betekent elk nieuw soort item een
 * `if`-tak in een template, en na vier daarvan weet niemand meer waar een
 * kaart precies getekend wordt.
 *
 * Het werkt op `kind`, NIET op de Odoo-categorie. Dat onderscheid is bewust:
 *  - `type` (Artikel, Release Notes, Podcast, ...) is waarop je FILTERT. Komt
 *    er in Odoo een categorie bij die eruitziet als een artikel, dan hoeft
 *    hier niets te gebeuren.
 *  - `kind` is WAARMEE je tekent. Alleen een echt nieuwe verschijningsvorm
 *    krijgt een eigen renderer.
 *
 * Een onbekende `kind` valt terug op de artikelkaart. Dat is de vorm die
 * altijd werkt (kop, tekst, link), dus een OM die iets nieuws stuurt naar een
 * plugin die het nog niet kent, toont iets bruikbaars in plaats van niets.
 *
 * Inhaken van buitenaf:
 *
 *     add_action('mymmo_news_register_renderers', function () {
 *         Mymmo_News_Renderers::register('poll', 'mijn_poll_renderer');
 *     });
 *
 * en per kaart bijsturen met de filters `mymmo_news_card_html` (de hele
 * kaart) en `mymmo_news_card_actions` (de knoppenrij onderaan -- daar komen
 * reageren, delen en stemmen).
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_News_Renderers {

    /** @var array<string,callable> */
    private static array $renderers = [];

    private static bool $booted = false;

    public static function bootstrap(): void {
        if (self::$booted) {
            return;
        }
        self::$booted = true;

        // De meegeleverde soorten. Alle vier gebruiken dezelfde kaart-template;
        // wat verschilt is het label, het icoon en of er een medialaag over de
        // afbeelding komt. Een echt afwijkende soort (een poll) krijgt straks
        // gewoon een eigen callable.
        self::register('article', [self::class, 'render_card']);
        self::register('release', [self::class, 'render_card']);
        self::register('video', [self::class, 'render_card']);
        self::register('podcast', [self::class, 'render_card']);
        self::register('document', [self::class, 'render_card']);
        // Een EVENT gebruikt dezelfde kaart: wat het toevoegt (wanneer,
        // waar, plaatsen) hangt aan het `event`-blok in het item en wordt
        // door card.php getekend. Een eigen callable zou een tweede kaart
        // betekenen die bij elke wijziging kan uitlopen.
        self::register('event', [self::class, 'render_card']);

        do_action('mymmo_news_register_renderers');
    }

    public static function register(string $kind, callable $renderer): void {
        $kind = sanitize_key($kind);
        if ($kind === '') {
            return;
        }
        self::$renderers[$kind] = $renderer;
    }

    public static function has(string $kind): bool {
        return isset(self::$renderers[sanitize_key($kind)]);
    }

    /** @return string[] */
    public static function kinds(): array {
        return array_keys(self::$renderers);
    }

    /**
     * Eén item tekenen.
     *
     * @param array<string,mixed> $item
     * @param array<string,mixed> $context
     */
    public static function render(array $item, array $context = []): string {
        self::bootstrap();

        $kind = sanitize_key((string) ($item['kind'] ?? 'article'));
        $renderer = self::$renderers[$kind] ?? self::$renderers['article'];

        $html = (string) call_user_func($renderer, $item, $context);

        /**
         * De volledige kaart, voor wie er iets omheen of in wil.
         *
         * @param string $html
         * @param array  $item
         * @param array  $context
         */
        return (string) apply_filters('mymmo_news_card_html', $html, $item, $context);
    }

    /**
     * Een reeks kaarten MET de maandopschriften ertussen.
     *
     * Dit staat hier en niet in het sjabloon, omdat er twee plekken zijn die
     * kaarten uitschrijven: de shortcode (eerste pagina, server-side) en de
     * REST-route (filteren en bijladen). Zou elk daarvan zelf groeperen, dan
     * lopen ze uit elkaar zodra er iets aan verandert -- dezelfde reden
     * waarom de REST-route klaargemaakte HTML teruggeeft in plaats van ruwe
     * items.
     *
     * `$vorige_maand` is de maand van de LAATSTE kaart die al op het scherm
     * staat. Zonder dat zou bijladen een tweede "September 2026" neerzetten
     * midden in een maand die al open stond. De aanroeper krijgt de nieuwe
     * stand terug in `maand`.
     *
     * @param array<int,mixed>    $items
     * @param array<string,mixed> $context
     * @return array{html:string,maand:string}
     */
    public static function render_list(array $items, array $context = [], string $vorige_maand = ''): array {
        $html = '';
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $maand = mymmo_news_maand_sleutel($item['publishedOn'] ?? null);
            if ($maand !== $vorige_maand) {
                $html .= '<li class="mymmo-news-maand">'
                    . '<h3 class="mymmo-news-maand-titel">'
                    . esc_html(mymmo_news_maand_label($maand))
                    . '</h3></li>';
                $vorige_maand = $maand;
            }
            $html .= self::render($item, $context);
        }
        return ['html' => $html, 'maand' => $vorige_maand];
    }

    /**
     * De standaardkaart.
     *
     * @param array<string,mixed> $item
     * @param array<string,mixed> $context
     */
    public static function render_card(array $item, array $context = []): string {
        return mymmo_news_template('partials/card.php', [
            'item' => $item,
            'context' => $context,
            'meta' => self::kind_meta((string) ($item['kind'] ?? 'article')),
        ]);
    }

    /**
     * Hoe een soort zich aankondigt: label en icoon.
     *
     * Het ICOON is een inline SVG in de template, geen letterlijke tekst hier
     * -- dit lijstje zegt alleen WELK icoon, zodat een renderer van buitenaf
     * dezelfde namen kan gebruiken.
     *
     * @return array{label:string,icon:string,media:bool}
     */
    public static function kind_meta(string $kind): array {
        $standaard = [
            'article' => ['label' => 'Artikel', 'icon' => 'document', 'media' => false],
            'release' => ['label' => 'Nieuw in het platform', 'icon' => 'sparkles', 'media' => false],
            'video' => ['label' => 'Video', 'icon' => 'play', 'media' => true],
            'podcast' => ['label' => 'Podcast', 'icon' => 'audio', 'media' => true],
            'document' => ['label' => 'Document', 'icon' => 'download', 'media' => false],
            'event' => ['label' => 'Event', 'icon' => 'calendar', 'media' => false],
        ];

        /**
         * Label en icoon per soort, voor wie een eigen soort registreert.
         *
         * @param array $standaard
         */
        $alles = apply_filters('mymmo_news_kind_meta', $standaard);

        return $alles[$kind] ?? ['label' => '', 'icon' => 'document', 'media' => false];
    }

    /**
     * De knoppenrij onderaan een kaart.
     *
     * Vandaag staat hier alleen "Lees verder". Reageren, delen en stemmen
     * hangen hier straks aan -- daarom is het een filter en geen vaste HTML
     * in de template.
     *
     * @param array<string,mixed> $item
     */
    public static function actions(array $item): string {
        $acties = [];

        $url = isset($item['url']) ? (string) $item['url'] : '';
        if ($url !== '') {
            $label = trim((string) ($item['cta'] ?? '')) !== ''
                ? (string) $item['cta']
                : 'Lees verder';
            $acties['read'] = sprintf(
                '<a class="mymmo-news-action mymmo-news-action--primary" href="%s" %s>%s'
                . '<svg class="mymmo-news-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
                . '<path d="M7 17 17 7M9 7h8v8"/></svg></a>',
                esc_url($url),
                mymmo_news_link_attrs(),
                esc_html($label)
            );
        }

        /**
         * @param array<string,string> $acties  sleutel => HTML
         * @param array                $item
         */
        $acties = apply_filters('mymmo_news_card_actions', $acties, $item);

        return implode('', array_map('strval', $acties));
    }
}
