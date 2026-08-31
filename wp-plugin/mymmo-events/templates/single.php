<?php
/**
 * Eventpagina. Overschrijfbaar via {thema}/mymmo-events/single.php
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
?>
<div class="mymmo-ev mymmo-ev-single">

    <p class="mymmo-ev-single__back">
        <a href="<?php echo esc_url(mymmo_events_archive_url()); ?>">&laquo; Alle events</a>
    </p>

    <?php if (!empty($event['hero_image_url'])) : ?>
        <figure class="mymmo-ev-single__hero">
            <img src="<?php echo esc_url((string) $event['hero_image_url']); ?>"
                 alt="" loading="lazy" decoding="async" />
        </figure>
    <?php endif; ?>

    <header class="mymmo-ev-single__head">
        <p class="mymmo-ev-single__tags">
            <?php if (!empty($type['name'])) : ?>
                <span class="mymmo-ev-pill" style="--mymmo-ev-pill-color: <?php echo esc_attr((string) ($type['color'] ?? '#475569')); ?>">
                    <span class="mymmo-ev-pill__dot"></span><?php echo esc_html((string) $type['name']); ?>
                </span>
            <?php endif; ?>
            <span class="mymmo-ev-tag"><?php echo mymmo_events_icon($format['icon']); ?><?php echo esc_html($format['label']); ?></span>
            <?php if ($past) : ?>
                <span class="mymmo-ev-tag mymmo-ev-tag--muted">Afgelopen</span>
            <?php endif; ?>
        </p>

        <h1 class="mymmo-ev-single__title"><?php echo esc_html((string) ($event['title'] ?? '')); ?></h1>

        <?php if ($start) : ?>
            <dl class="mymmo-ev-facts">
                <div class="mymmo-ev-facts__item">
                    <dt><?php echo mymmo_events_icon('calendar'); ?>Wanneer</dt>
                    <dd>
                        <?php echo esc_html(mymmo_events_format_long_date($start)); ?><br />
                        <span class="mymmo-ev-facts__sub"><?php echo esc_html(mymmo_events_format_time_range($start, $end)); ?></span>
                    </dd>
                </div>

                <div class="mymmo-ev-facts__item">
                    <dt><?php echo mymmo_events_icon($format['icon']); ?>Waar</dt>
                    <dd>
                        <?php if (!empty($event['location']['name'])) : ?>
                            <?php echo esc_html((string) $event['location']['name']); ?>
                        <?php else : ?>
                            Online — je krijgt de link per e-mail
                        <?php endif; ?>
                    </dd>
                </div>

                <?php if (!empty($registration['capacity'])) : ?>
                    <div class="mymmo-ev-facts__item">
                        <dt><?php echo mymmo_events_icon('users'); ?>Plaatsen</dt>
                        <dd>
                            <?php if ($seats_left === 0) : ?>
                                Volzet
                            <?php elseif (is_int($seats_left)) : ?>
                                <?php echo esc_html(sprintf('Nog %d van %d vrij', $seats_left, (int) $registration['capacity'])); ?>
                            <?php else : ?>
                                <?php echo esc_html(sprintf('%d plaatsen', (int) $registration['capacity'])); ?>
                            <?php endif; ?>
                        </dd>
                    </div>
                <?php endif; ?>
            </dl>
        <?php endif; ?>

        <?php if (!$past && mymmo_events_ics_url($event) !== '') : ?>
            <p class="mymmo-ev-single__ics">
                <a class="mymmo-ev-link" href="<?php echo esc_url(mymmo_events_ics_url($event)); ?>">
                    <?php echo mymmo_events_icon('calendar'); ?>Toevoegen aan agenda
                </a>
            </p>
        <?php endif; ?>
    </header>

    <?php if ($has_recap) : ?>
        <section class="mymmo-ev-single__recap">
            <h2>Herbekijk dit event</h2>
            <?php if (!empty($recap['video_url'])) : ?>
                <p>
                    <a class="mymmo-ev-btn" href="<?php echo esc_url((string) $recap['video_url']); ?>"
                       target="_blank" rel="noopener">Video bekijken</a>
                </p>
            <?php endif; ?>
            <?php echo mymmo_events_kses($recap['body_html'] ?? ''); ?>
        </section>
    <?php endif; ?>

    <?php if (!empty($event['body_html'])) : ?>
        <div class="mymmo-ev-single__content">
            <?php echo mymmo_events_kses((string) $event['body_html']); ?>
        </div>
    <?php elseif (!empty($event['summary'])) : ?>
        <div class="mymmo-ev-single__content">
            <p><?php echo esc_html((string) $event['summary']); ?></p>
        </div>
    <?php endif; ?>

    <?php if (!empty($event['speakers']) && is_array($event['speakers'])) : ?>
        <section class="mymmo-ev-single__speakers">
            <h2>Wie geeft dit event</h2>
            <ul>
                <?php foreach ($event['speakers'] as $speaker) : ?>
                    <?php if (!empty($speaker['name'])) : ?>
                        <li><?php echo esc_html((string) $speaker['name']); ?></li>
                    <?php endif; ?>
                <?php endforeach; ?>
            </ul>
        </section>
    <?php endif; ?>

    <?php echo mymmo_events_render('registration-form', ['event' => $event]); ?>
</div>
