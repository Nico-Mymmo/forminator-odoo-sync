#!/usr/bin/env python3
"""v1.6.33 -- templates/announcement.php

De mobiele kaartenstapel krijgt exact dezelfde structuur als die van de rij
(templates/row.php): het "Schrijf je snel in!"-tagje hoort nu ook BINNEN de
stapel (op mobiel is de desktopvariant in .mymmo-ev-announce__stage
verborgen, zie CSS), de kaarten zitten in hun eigen
.mymmo-ev-swipestack__cards-wrapper -- het positioneringskader voor de
kaartjes erachter (inset: 0) -- en de swipe-hint staat onder de stapel.
"""
import sys

PATH = 'wp-plugin/mymmo-events/templates/announcement.php'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')
before_open = content.count('<?php')
before_close = content.count('?>')

# ---------------------------------------------------------------- 1. doc-comment
old = """ * @var array $data ['event' => array, 'is_highlighted' => bool,
 *                    'others' => array[], 'clover' => string, 'arrow' => string,
 *                    'arrow_label' => string, 'default_image' => string]
 */"""
new = """ * Op mobiel (<= 40rem, zie .mymmo-ev-swipestack in mymmo-events.css) valt
 * die hele desktopopstelling weg en toont dit template EXACT dezelfde
 * swipebare kaartenstapel als [mymmo_events_row] -- zelfde structuur,
 * zelfde klassen, zelfde marges, want elk verschil leverde een andere
 * uitlijning op voor twee componenten die er hetzelfde horen uit te zien:
 *   .mymmo-ev-swipestack
 *     .mymmo-ev-announce__pointer     "Schrijf je snel in!"
 *     .mymmo-ev-swipestack__cards     enkel de kaarten -- dit is het
 *                                     positioneringskader voor de kaartjes
 *                                     erachter (inset: 0), dus mag hier
 *                                     niets anders in staan
 *       .mymmo-ev-announce__card.mymmo-ev-deck-card * n
 *     (.mymmo-ev-swipedots)           stipjes, door JS toegevoegd
 *     .mymmo-ev-swipehint             hint, verdwijnt na de eerste swipe
 *
 * @var array $data ['event' => array, 'is_highlighted' => bool,
 *                    'others' => array[], 'clover' => string, 'arrow' => string,
 *                    'arrow_label' => string, 'default_image' => string]
 */"""
assert content.count(old) == 1, '1: doc-comment-anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2. mobiele deck
start_anchor = '        <div class="mymmo-ev-announce__mobiledeck mymmo-ev-swipestack">'
assert content.count(start_anchor) == 1, '2: start-anker niet exact 1x gevonden'
start = content.index(start_anchor)
old_block = content[start:]
assert 'mymmo-ev-swipehint' in old_block
assert 'mymmo-ev-deck-card' in old_block
assert old_block.count('foreach (') == 1
assert old_block.rstrip().endswith('</div>')

NEW_BLOCK = """        <div class="mymmo-ev-announce__mobiledeck mymmo-ev-swipestack">
            <?php if ($arrow_url !== '') : ?>
                <div class="mymmo-ev-announce__pointer" aria-hidden="true">
                    <?php if ($arrow_label !== '') : ?>
                        <span class="mymmo-ev-announce__pointer-label"><?php echo esc_html($arrow_label); ?></span>
                    <?php endif; ?>
                    <img class="mymmo-ev-announce__pointer-arrow" src="<?php echo esc_url($arrow_url); ?>" alt="" loading="lazy" />
                </div>
            <?php endif; ?>

            <div class="mymmo-ev-swipestack__cards">
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

            <p class="mymmo-ev-swipehint">
                <img class="mymmo-ev-swipehint__scribble"
                     src="https://link.openvme.be/assets/events/components/scribbles-scribbles-62-1.svg"
                     alt="" loading="lazy" aria-hidden="true" />
                Swipe om al onze aankomende events te bekijken
            </p>
        </div>
    </div>
</div>
"""

content = content[:start] + NEW_BLOCK

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count('<?php') - content.count('?>') == before_open - before_close, \
    'php-tag-balans verschoven t.o.v. baseline'
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d  (<?php=%d ?>=%d)' % (
    before_lines, content.count('\n'), content.count('<?php'), content.count('?>')))
sys.exit(0)
