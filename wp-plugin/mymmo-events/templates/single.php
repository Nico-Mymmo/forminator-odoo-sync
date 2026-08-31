<?php
/**
 * Eventpagina. Overschrijfbaar via {thema}/mymmo-events/single.php
 *
 * De TITEL wordt bewust NIET hier gerenderd: het thema print die al boven de
 * content, net als op elke andere pagina. Deze template begint dus bij de
 * labels en bouwt van daar verder.
 *
 * Verder geen <dl>/<dt>/<dd> voor de feitenblokken. Thema's stylen die vaak
 * met eigen grid- of float-regels, en dat zette de labels naast in plaats van
 * boven de waarden.
 *
 * @var array $data ['event' => array]
 */

declare(strict_types=1);

$event = $data['event'] ?? [];

$start = mymmo_events_date($event['starts_at'] ?? null);
$end = mymmo_events_date($event['ends_at'] ?? null);
$type = $event['type'] ?? [];
$format = mymmo_events_format_meta((string) ($event['format'] ?? 'online'));
$registration = $event['registration'] ?? [];
$past = mymmo_events_is_past($event);
$recap = $event['recap'] ?? [];
$has_recap = !empty($recap['body_html']) || !empty($recap['video_url']);
$seats_left = $registration['seats_left'] ?? null;
$capacity = $registration['capacity'] ?? null;
$ics = mymmo_events_ics_url($event);
?>
<div class="mymmo-ev mymmo-ev-single">

    <?php if (!empty($event['hero_image_url'])) : ?>
        <div class="mymmo-ev-hero">
            <img src="<?php echo esc_url((string) $event['hero_image_url']); ?>"
                 alt="" loading="lazy" decoding="async" />
        </div>
    <?php endif; ?>

    <div class="mymmo-ev-single__labels">
        <?php if (!empty($type['name'])) : ?>
            <span class="mymmo-ev-pill" style="--mymmo-ev-pill-color: <?php echo esc_attr((string) ($type['color'] ?? '#475569')); ?>">
                <span class="mymmo-ev-pill__dot"></span><?php echo esc_html((string) $type['name']); ?>
            </span>
        <?php endif; ?>
        <span class="mymmo-ev-tag"><?php echo mymmo_events_icon($format['icon']); ?><?php echo esc_html($format['label']); ?></span>
        <?php if ($past) : ?>
            <span class="mymmo-ev-tag mymmo-ev-tag--muted">Afgelopen</span>
        <?php endif; ?>
    </div>

    <?php if ($start) : ?>
        <div class="mymmo-ev-facts">
            <div class="mymmo-ev-fact">
                <span class="mymmo-ev-fact__label">Wanneer</span>
                <span class="mymmo-ev-fact__value"><?php echo esc_html(mymmo_events_format_long_date($start)); ?></span>
                <span class="mymmo-ev-fact__sub"><?php echo esc_html(mymmo_events_format_time_range($start, $end)); ?></span>
            </div>

            <div class="mymmo-ev-fact">
                <span class="mymmo-ev-fact__label">Waar</span>
                <?php if (!empty($event['location']['name'])) : ?>
                    <span class="mymmo-ev-fact__value"><?php echo esc_html((string) $event['location']['name']); ?></span>
                <?php else : ?>
                    <span class="mymmo-ev-fact__value">Online</span>
                    <span class="mymmo-ev-fact__sub">Je krijgt de deelnamelink per e-mail</span>
                <?php endif; ?>
            </div>

            <?php if ($capacity) : ?>
                <div class="mymmo-ev-fact">
                    <span class="mymmo-ev-fact__label">Plaatsen</span>
                    <span class="mymmo-ev-fact__value">
                        <?php if ($seats_left === 0) : ?>
                            Volzet
                        <?php elseif (is_int($seats_left)) : ?>
                            <?php echo esc_html(sprintf('Nog %d vrij', $seats_left)); ?>
                        <?php else : ?>
                            <?php echo esc_html(sprintf('%d plaatsen', (int) $capacity)); ?>
                        <?php endif; ?>
                    </span>
                    <?php if (is_int($seats_left) && $seats_left > 0) : ?>
                        <span class="mymmo-ev-fact__sub"><?php echo esc_html(sprintf('van %d', (int) $capacity)); ?></span>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </div>
    <?php endif; ?>

    <?php if ($has_recap) : ?>
        <section class="mymmo-ev-panel mymmo-ev-panel--accent">
            <h2 class="mymmo-ev-panel__title">Herbekijk dit event</h2>
            <?php if (!empty($recap['video_url'])) : ?>
                <p class="mymmo-ev-panel__cta">
                    <a class="mymmo-ev-btn" href="<?php echo esc_url((string) $recap['video_url']); ?>"
                       target="_blank" rel="noopener">Video bekijken</a>
                </p>
            <?php endif; ?>
            <?php echo mymmo_events_kses($recap['body_html'] ?? ''); ?>
        </section>
    <?php endif; ?>

    <?php
    $body = mymmo_events_kses((string) ($event['body_html'] ?? ''));
    if ($body !== '') : ?>
        <div class="mymmo-ev-prose"><?php echo $body; ?></div>
    <?php elseif (!empty($event['summary'])) : ?>
        <div class="mymmo-ev-prose"><p><?php echo esc_html((string) $event['summary']); ?></p></div>
    <?php endif; ?>

    <?php if (!empty($event['speakers']) && is_array($event['speakers'])) : ?>
        <?php
        $speakers = array_values(array_filter($event['speakers'], static fn ($s) => !empty($s['name'])));
        if ($speakers !== []) : ?>
            <section class="mymmo-ev-speakers">
                <h2 class="mymmo-ev-panel__title">Wie geeft dit event</h2>
                <ul class="mymmo-ev-speakers__list">
                    <?php foreach ($speakers as $speaker) : ?>
                        <li><?php echo esc_html((string) $speaker['name']); ?></li>
                    <?php endforeach; ?>
                </ul>
            </section>
        <?php endif; ?>
    <?php endif; ?>

    <?php echo mymmo_events_render('registration-form', ['event' => $event]); ?>

    <p class="mymmo-ev-single__foot">
        <a class="mymmo-ev-single__back" href="<?php echo esc_url(mymmo_events_archive_url()); ?>">
            &laquo; Alle events
        </a>
    </p>
</div>
