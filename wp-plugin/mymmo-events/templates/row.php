<?php
/**
 * Rij van event-kaarten naast elkaar, iets als een stapel scheurkalender-
 * blaadjes die losjes over elkaar liggen (elk kaartje licht anders
 * gedraaid/verschoven, niet strak uitgelijnd). Bedoeld als minder
 * invasief alternatief voor de aankondiging: veel lager, maar dezelfde
 * breedte als de rest van de pagina -- zodat marketing 'm ook mid-pagina
 * kan invoegen. Toont uur en locatie per event.
 * Overschrijfbaar via {thema}/mymmo-events/row.php
 *
 * Stapelgedrag (CSS + assets/js/mymmo-events.js, rowOverlapFit/
 * rowPointerFollow):
 * - Zijn er minder events dan `count`, dan wordt NIET aangevuld met lege
 *   kaartjes -- gewoon zoveel kaarten als er events zijn (max. `count`,
 *   zie ROW_MAX_COUNT in class-shortcodes.php). De rij vult ook bij weinig
 *   kaarten altijd de volledige beschikbare breedte (rowOverlapFit()
 *   spreidt de kaarten dan net iets verder uit i.p.v. ze compact bij
 *   elkaar te laten en de rest van de breedte ongebruikt te laten).
 * - Volgorde/stapelpositie ligt vast en hangt af van `date_align`
 *   (config-optie, zie class-settings.php):
 *   - "left" (standaard): het linkse kaartje ligt ONDERAAN de stapel, elk
 *     volgende kaartje ligt daar telkens boven -- zo blijft het (van
 *     nature links uitgelijnde) datum/uur-blokje altijd zichtbaar, ook al
 *     is een kaartje verder grotendeels overlapt.
 *   - "right": datum + uur worden rechts uitgelijnd op elk kaartje, en het
 *     linkse kaartje ligt BOVENAAN de stapel -- om dezelfde reden (het
 *     zichtbare stukje van een overlapt kaartje is dan de rechterkant).
 *   Hoveren duwt de buren opzij zodat het gehoverde kaartje volledig
 *   zichtbaar wordt, maar verandert die stapelvolgorde niet.
 * - De rij wordt nooit breder dan de beschikbare ruimte (geen horizontale
 *   scrollbar): JS berekent hoeveel overlap daarvoor nodig is en zet dat
 *   als --mymmo-ev-row-overlap; zonder JS geldt de vaste CSS-fallback.
 * - Het "schrijf je snel in"-tagje bestaat maar één keer en verhuist via
 *   JS naar het gehoverde kaartje (pas na 500ms, met een aanloop-animatie
 *   in CSS) -- geen aparte kopie per kaart in de markup. Dit geldt enkel
 *   voor de desktop-fanrij hierboven.
 * - Op mobiel (<= 40rem) verdwijnt die compacte fanrij volledig en toont
 *   de rij in plaats daarvan dezelfde volledige, swipebare kaartenstapel
 *   als [mymmo_events_announcement] (.mymmo-ev-row__deck hieronder,
 *   .mymmo-ev-swipestack in mymmo-events.css/.js) -- zelfde opmaakklassen
 *   (.mymmo-ev-announce__card/__body/...), inclusief hetzelfde altijd-
 *   zichtbare "schrijf je snel in"-tagje (i.p.v. enkel bij hover, want dat
 *   bestaat niet op mobiel) met een automatische verschijn-animatie.
 *
 * @var array $data ['events' => array<int,array<string,mixed>>,
 *                    'count' => int, 'source' => string, 'scribble' => string,
 *                    'pointer_arrow' => string, 'pointer_label' => string,
 *                    'date_align' => string ('left'|'right')]
 */

declare(strict_types=1);

$events = array_values(array_filter((array) ($data['events'] ?? []), 'is_array'));
$count = max(1, (int) ($data['count'] ?? 4));
$archive_url = mymmo_events_archive_url();
$scribble_url = mymmo_events_asset_url((string) ($data['scribble'] ?? ''));
$pointer_arrow_url = mymmo_events_asset_url((string) ($data['pointer_arrow'] ?? ''));
$pointer_label = (string) ($data['pointer_label'] ?? '');
$date_align = ((string) ($data['date_align'] ?? 'left')) === 'right' ? 'right' : 'left';
$is_highlighted_source = ((string) ($data['source'] ?? 'next')) === 'highlighted';

// Enkel echt bestaande, bruikbare events (start + permalink) -- minder dan
// $count is prima, dan tonen we gewoon minder kaarten. Geen aanvulling
// meer met blanco kaartjes (was tot v1.6.18 wel zo).
$slots = [];
foreach (array_slice($events, 0, $count) as $event) {
    $starts = mymmo_events_date($event['starts_at'] ?? null);
    $permalink = mymmo_events_permalink($event);
    if (!$starts || $permalink === '') {
        continue;
    }
    $slots[] = ['event' => $event, 'starts' => $starts, 'permalink' => $permalink];
}
$total = count($slots);
?>
<div class="mymmo-ev mymmo-ev-row">
    <?php if ($scribble_url !== '') : ?>
        <img class="mymmo-ev-row__scribble" src="<?php echo esc_url($scribble_url); ?>" alt="" loading="lazy" aria-hidden="true" />
    <?php endif; ?>

    <?php if ($total > 0) : ?>
        <div class="mymmo-ev-row__cards<?php echo $date_align === 'right' ? ' mymmo-ev-row__cards--date-right' : ''; ?>">
            <?php if ($pointer_arrow_url !== '') : ?>
                <span class="mymmo-ev-row__pointer" aria-hidden="true">
                    <?php if ($pointer_label !== '') : ?>
                        <span class="mymmo-ev-row__pointer-label"><?php echo esc_html($pointer_label); ?></span>
                    <?php endif; ?>
                    <img class="mymmo-ev-row__pointer-arrow" src="<?php echo esc_url($pointer_arrow_url); ?>" alt="" loading="lazy" />
                </span>
            <?php endif; ?>

            <?php foreach ($slots as $i => $slot) :
                $event = $slot['event'];
                $starts = $slot['starts'];
                $ends = mymmo_events_date($event['ends_at'] ?? null);
                $time_range = mymmo_events_format_time_range($starts, $ends);
                $location_name = (string) ($event['location']['name'] ?? '');
                $type = $event['type'] ?? [];
                $type_name = (string) ($type['name'] ?? '');
                $type_color = (string) ($type['color'] ?? '#475569');
                $card_class = 'mymmo-ev-row__card mymmo-ev-row__card--' . ((int) $i % 4 + 1);
                // Stapelvolgorde hangt af van $date_align (zie doc-comment
                // bovenaan) -- vast, verandert nooit op hover.
                $z_index = $date_align === 'right' ? ($total - $i) : ($i + 1);
                ?>
                <a class="<?php echo esc_attr($card_class); ?>"
                   href="<?php echo esc_url($slot['permalink']); ?>"
                   style="z-index: <?php echo (int) $z_index; ?>;">
                    <span class="mymmo-ev-row__dow"><?php echo esc_html(MYMMO_EVENTS_DAYS_SHORT[(int) $starts->format('w')]); ?></span>
                    <span class="mymmo-ev-row__day"><?php echo esc_html($starts->format('j')); ?></span>
                    <span class="mymmo-ev-row__month"><?php echo esc_html(MYMMO_EVENTS_MONTHS_SHORT[(int) $starts->format('n')]); ?></span>
                    <?php if ($time_range !== '' || $location_name !== '') : ?>
                        <span class="mymmo-ev-row__meta">
                            <?php if ($time_range !== '') : ?>
                                <span class="mymmo-ev-row__meta-time"><?php echo mymmo_events_icon('clock'); ?><?php echo esc_html($time_range); ?></span>
                            <?php endif; ?>
                            <?php if ($location_name !== '') : ?>
                                <span class="mymmo-ev-row__meta-loc"><?php echo esc_html($location_name); ?></span>
                            <?php endif; ?>
                        </span>
                    <?php endif; ?>
                    <?php if ($type_name !== '') : ?>
                        <span class="mymmo-ev-row__type-badge" style="--mymmo-ev-row-badge-color: <?php echo esc_attr($type_color); ?>;"><?php echo esc_html($type_name); ?></span>
                    <?php endif; ?>
                    <span class="mymmo-ev-row__title"><?php echo esc_html((string) ($event['title'] ?? '')); ?></span>
                </a>
            <?php endforeach; ?>
        </div>

        <div class="mymmo-ev-row__deck mymmo-ev-swipestack">
            <?php if ($pointer_arrow_url !== '') : ?>
                <div class="mymmo-ev-announce__pointer" aria-hidden="true">
                    <?php if ($pointer_label !== '') : ?>
                        <span class="mymmo-ev-announce__pointer-label"><?php echo esc_html($pointer_label); ?></span>
                    <?php endif; ?>
                    <img class="mymmo-ev-announce__pointer-arrow" src="<?php echo esc_url($pointer_arrow_url); ?>" alt="" loading="lazy" />
                </div>
            <?php endif; ?>
            <p class="mymmo-ev-swipehint">
                <img class="mymmo-ev-swipehint__scribble"
                     src="https://link.openvme.be/assets/events/components/scribbles-scribbles-62-1.svg"
                     alt="" loading="lazy" aria-hidden="true" />
                Swipe om al onze aankomende events te bekijken
            </p>
            <?php foreach ($slots as $slot) :
                $mevent = $slot['event'];
                $mtype = $mevent['type'] ?? [];
                $mtype_name = (string) ($mtype['name'] ?? '');
                $mtype_color = (string) ($mtype['color'] ?? '#475569');
                $mregistration = $mevent['registration'] ?? [];
                $mcan_register = !empty($mregistration['open']);
                ?>
                <div class="mymmo-ev-announce__card mymmo-ev-deck-card">
                    <div class="mymmo-ev-announce__body">
                        <span class="mymmo-ev-announce__kicker">
                            <?php if ($is_highlighted_source) : ?>
                                <?php echo mymmo_events_icon('check'); ?>Aanbevolen event
                            <?php else : ?>
                                <?php echo mymmo_events_icon('calendar'); ?>Binnenkort
                            <?php endif; ?>
                        </span>
                        <?php if ($mtype_name !== '') : ?>
                            <span class="mymmo-ev-pill" style="--mymmo-ev-pill-color: <?php echo esc_attr($mtype_color); ?>">
                                <span class="mymmo-ev-pill__dot"></span><?php echo esc_html($mtype_name); ?>
                            </span>
                        <?php endif; ?>
                        <h3 class="mymmo-ev-announce__title">
                            <a href="<?php echo esc_url($slot['permalink']); ?>"><?php echo esc_html((string) ($mevent['title'] ?? '')); ?></a>
                        </h3>
                        <p class="mymmo-ev-announce__when">
                            <?php echo mymmo_events_icon('clock'); ?><?php echo esc_html(mymmo_events_format_datetime_line($mevent)); ?>
                        </p>
                        <p class="mymmo-ev-announce__summary"><?php echo esc_html((string) ($mevent['summary'] ?? '')); ?></p>
                        <div class="mymmo-ev-announce__ctas">
                            <a class="mymmo-ev-btn mymmo-ev-btn--primary" href="<?php echo esc_url($slot['permalink']); ?>">
                                <?php echo $mcan_register ? 'Inschrijven' : 'Meer info'; ?>
                                <?php echo mymmo_events_icon('arrow'); ?>
                            </a>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <p class="mymmo-ev-row__more">
        <a href="<?php echo esc_url($archive_url); ?>">Bekijk onze andere events</a>
    </p>
</div>
