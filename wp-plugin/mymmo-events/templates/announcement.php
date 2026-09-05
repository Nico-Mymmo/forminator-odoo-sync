<?php
/**
 * Aankondiging-callout: het gehighlighte event (of het eerstvolgende), met
 * een curly-arrow die er expliciet naar wijst (met een vaste titel erboven),
 * een groot klavertje als zachte achtergrond achter de hele stapel, een
 * paar (desnoods blanco) kaartjes -- exact even groot als de hoofdkaart,
 * enkel anders gedraaid, als een nonchalant neergelegde stapel speelkaarten
 * -- en een illustratie die net over de rand van de kaart mag lopen.
 * Overschrijfbaar via {thema}/mymmo-events/announcement.php
 *
 * @var array $data ['event' => array, 'is_highlighted' => bool,
 *                    'others' => array[], 'clover' => string, 'arrow' => string,
 *                    'arrow_label' => string, 'default_image' => string]
 */

declare(strict_types=1);

$event = $data['event'] ?? [];
$is_highlighted = !empty($data['is_highlighted']);
$others = array_slice($data['others'] ?? [], 0, 3);
$type = $event['type'] ?? [];

$arrow_url = mymmo_events_asset_url((string) ($data['arrow'] ?? ''));
$arrow_label = (string) ($data['arrow_label'] ?? '');

// De OM kan later per event een eigen afbeelding meegeven; tot dan toont
// elk event dezelfde illustratie als placeholder.
$image_url = !empty($event['hero_image_url'])
    ? (string) $event['hero_image_url']
    : mymmo_events_asset_url((string) ($data['default_image'] ?? ''));

$permalink = mymmo_events_permalink($event);
$archive_url = mymmo_events_archive_url();
$registration = $event['registration'] ?? [];
$can_register = $permalink !== '' && !empty($registration['open']);

// Altijd minstens 2 blanco kaartjes achter de hoofdkaart tonen, ongeacht of
// er echte andere events zijn -- puur om de indruk te wekken dat er nog
// meer te vinden is. Zijn er wel echte andere events, dan krijgen de eerste
// kaartjes hun titel en datum.
$ghost_total = max(count($others), 2);
?>
<div class="mymmo-ev mymmo-ev-announce">
    <div class="mymmo-ev-announce__stage">

        <?php echo mymmo_events_clover_svg(); ?>

        <?php if ($arrow_url !== '') : ?>
            <div class="mymmo-ev-announce__pointer" aria-hidden="true">
                <?php if ($arrow_label !== '') : ?>
                    <span class="mymmo-ev-announce__pointer-label"><?php echo esc_html($arrow_label); ?></span>
                <?php endif; ?>
                <img class="mymmo-ev-announce__pointer-arrow" src="<?php echo esc_url($arrow_url); ?>" alt="" loading="lazy" />
            </div>
        <?php endif; ?>

        <div class="mymmo-ev-announce__deck">
            <?php for ($i = 0; $i < min($ghost_total, 3); $i++) :
                $other = $others[$i] ?? null;
                $ostart = $other ? mymmo_events_date($other['starts_at'] ?? null) : null;
                $ghost_permalink = $other ? mymmo_events_permalink($other) : '';
                $ghost_class = 'mymmo-ev-announce__ghost mymmo-ev-announce__ghost--' . ((int) $i + 1);
                ?>
                <div class="<?php echo esc_attr($ghost_class); ?>"
                     <?php if ($ghost_permalink !== '') : ?>data-href="<?php echo esc_url($ghost_permalink); ?>"<?php else : ?>aria-hidden="true"<?php endif; ?>>
                    <?php if ($other) : ?>
                        <?php if ($ostart) : ?>
                            <span class="mymmo-ev-announce__ghost-date">
                                <?php echo esc_html(MYMMO_EVENTS_DAYS_SHORT[(int) $ostart->format('w')] . ' ' . $ostart->format('j M')); ?>
                            </span>
                        <?php endif; ?>
                        <span class="mymmo-ev-announce__ghost-title"><?php echo esc_html((string) ($other['title'] ?? '')); ?></span>
                    <?php endif; ?>
                    <?php
                    // v1.6.13: door de rotatie + offset (zie CSS) steekt de onderkant
                    // van de onderliggende kaartjes een stukje uit -- exact waar de
                    // knoppen van de bovenste kaart staan. Zonder deze knoppen ook
                    // hier te tekenen was dat zichtbare randje leeg, alsof de kaart
                    // eronder kapot was. Puur decoratief: <span>, geen <a>, en
                    // pointer-events: none in CSS, want dit blijft binnen
                    // aria-hidden.
                    $ghost_can_register = $other && !empty($other['registration']['open'] ?? false);
                    ?>
                    <span class="mymmo-ev-announce__ghost-ctas">
                        <span class="mymmo-ev-btn mymmo-ev-btn--primary mymmo-ev-btn--ghost"><?php echo $ghost_can_register ? 'Inschrijven' : 'Meer info'; ?></span>
                        <span class="mymmo-ev-btn mymmo-ev-btn--ghost">Bekijk onze andere events</span>
                    </span>
                </div>
            <?php endfor; ?>

            <div class="mymmo-ev-announce__card">
                <div class="mymmo-ev-announce__body">
                    <span class="mymmo-ev-announce__kicker">
                        <?php if ($is_highlighted) : ?>
                            <?php echo mymmo_events_icon('check'); ?>Aanbevolen event
                        <?php else : ?>
                            <?php echo mymmo_events_icon('calendar'); ?>Binnenkort
                        <?php endif; ?>
                    </span>

                    <?php if (!empty($type['name'])) : ?>
                        <span class="mymmo-ev-pill" style="--mymmo-ev-pill-color: <?php echo esc_attr((string) ($type['color'] ?? '#475569')); ?>">
                            <span class="mymmo-ev-pill__dot"></span><?php echo esc_html((string) $type['name']); ?>
                        </span>
                    <?php endif; ?>

                    <h3 class="mymmo-ev-announce__title">
                        <?php if ($permalink !== '') : ?>
                            <a href="<?php echo esc_url($permalink); ?>"><?php echo esc_html((string) ($event['title'] ?? '')); ?></a>
                        <?php else : ?>
                            <?php echo esc_html((string) ($event['title'] ?? '')); ?>
                        <?php endif; ?>
                    </h3>

                    <p class="mymmo-ev-announce__when">
                        <?php echo mymmo_events_icon('clock'); ?><?php echo esc_html(mymmo_events_format_datetime_line($event)); ?>
                    </p>

                    <p class="mymmo-ev-announce__summary"><?php echo esc_html((string) ($event['summary'] ?? '')); ?></p>

                    <div class="mymmo-ev-announce__ctas">
                        <?php if ($permalink !== '') : ?>
                            <a class="mymmo-ev-btn mymmo-ev-btn--primary" href="<?php echo esc_url($permalink); ?>">
                                <?php echo $can_register ? 'Inschrijven' : 'Meer info'; ?>
                                <?php echo mymmo_events_icon('arrow'); ?>
                            </a>
                        <?php endif; ?>
                        <a class="mymmo-ev-btn" href="<?php echo esc_url($archive_url); ?>">
                            Bekijk onze andere events
                        </a>
                    </div>
                </div>

                <?php if ($image_url !== '') : ?>
                    <div class="mymmo-ev-announce__image">
                        <img src="<?php echo esc_url($image_url); ?>" alt="" loading="lazy" />
                    </div>
                <?php endif; ?>
            </div>
        </div>

        <div class="mymmo-ev-announce__mobiledeck mymmo-ev-swipestack">
            <p class="mymmo-ev-swipehint">
                <img class="mymmo-ev-swipehint__scribble"
                     src="https://link.openvme.be/assets/events/components/scribbles-scribbles-62-1.svg"
                     alt="" loading="lazy" aria-hidden="true" />
                Swipe om al onze aankomende events te bekijken
            </p>
            <?php
            $mobile_cards = array_values(array_filter(array_merge([$event], $others)));
            foreach ($mobile_cards as $mevent) :
                $mtype = $mevent['type'] ?? [];
                $mtype_name = (string) ($mtype['name'] ?? '');
                $mtype_color = (string) ($mtype['color'] ?? '#475569');
                $mpermalink = mymmo_events_permalink($mevent);
                $mregistration = $mevent['registration'] ?? [];
                $mcan_register = $mpermalink !== '' && !empty($mregistration['open']);
                ?>
                <div class="mymmo-ev-announce__card mymmo-ev-deck-card">
                    <div class="mymmo-ev-announce__body">
                        <span class="mymmo-ev-announce__kicker">
                            <?php if ($is_highlighted) : ?>
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
                            <?php if ($mpermalink !== '') : ?>
                                <a href="<?php echo esc_url($mpermalink); ?>"><?php echo esc_html((string) ($mevent['title'] ?? '')); ?></a>
                            <?php else : ?>
                                <?php echo esc_html((string) ($mevent['title'] ?? '')); ?>
                            <?php endif; ?>
                        </h3>
                        <p class="mymmo-ev-announce__when">
                            <?php echo mymmo_events_icon('clock'); ?><?php echo esc_html(mymmo_events_format_datetime_line($mevent)); ?>
                        </p>
                        <p class="mymmo-ev-announce__summary"><?php echo esc_html((string) ($mevent['summary'] ?? '')); ?></p>
                        <div class="mymmo-ev-announce__ctas">
                            <?php if ($mpermalink !== '') : ?>
                                <a class="mymmo-ev-btn mymmo-ev-btn--primary" href="<?php echo esc_url($mpermalink); ?>">
                                    <?php echo $mcan_register ? 'Inschrijven' : 'Meer info'; ?>
                                    <?php echo mymmo_events_icon('arrow'); ?>
                                </a>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>
