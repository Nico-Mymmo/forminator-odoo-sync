#!/usr/bin/env python3
"""v1.6.33 -- templates/row.php

De mobiele kaartenstapel krijgt dezelfde structuur als de aankondiging:
pointer-tagje bovenaan, kaarten in hun eigen .mymmo-ev-swipestack__cards-
wrapper (positioneringskader voor de kaartjes erachter), daarna de door JS
gebouwde stipjes en de swipe-hint ONDER de stapel.
"""
import sys

PATH = 'wp-plugin/mymmo-events/templates/row.php'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')
before_open = content.count('<?php')
before_close = content.count('?>')

# ---------------------------------------------------------------- 1. doc-comment
old = """ * - Op mobiel (<= 40rem) verdwijnt die compacte fanrij volledig en toont
 *   de rij in plaats daarvan dezelfde volledige, swipebare kaartenstapel
 *   als [mymmo_events_announcement] (.mymmo-ev-row__deck hieronder,
 *   .mymmo-ev-swipestack in mymmo-events.css/.js) -- zelfde opmaakklassen
 *   (.mymmo-ev-announce__card/__body/...), inclusief hetzelfde altijd-
 *   zichtbare "schrijf je snel in"-tagje (i.p.v. enkel bij hover, want dat
 *   bestaat niet op mobiel) met een automatische verschijn-animatie."""
new = """ * - Op mobiel (<= 40rem) verdwijnt die compacte fanrij volledig en toont
 *   de rij in plaats daarvan dezelfde volledige, swipebare kaartenstapel
 *   als [mymmo_events_announcement] (.mymmo-ev-row__deck hieronder,
 *   .mymmo-ev-swipestack in mymmo-events.css/.js) -- zelfde opmaakklassen
 *   (.mymmo-ev-announce__card/__body/...), inclusief hetzelfde altijd-
 *   zichtbare "schrijf je snel in"-tagje (i.p.v. enkel bij hover, want dat
 *   bestaat niet op mobiel) met een automatische verschijn-animatie.
 *   v1.6.33: die stapel heeft in BEIDE templates exact dezelfde structuur,
 *   want elk verschil leverde een andere uitlijning op:
 *     .mymmo-ev-swipestack
 *       .mymmo-ev-announce__pointer     "Schrijf je snel in!"
 *       .mymmo-ev-swipestack__cards     enkel de kaarten -- dit is het
 *                                       positioneringskader voor de
 *                                       kaartjes erachter (inset: 0), dus
 *                                       mag hier niets anders in staan
 *         .mymmo-ev-announce__card.mymmo-ev-deck-card * n
 *       (.mymmo-ev-swipedots)           stipjes, door JS toegevoegd
 *       .mymmo-ev-swipehint             hint, verdwijnt na de eerste swipe"""
assert content.count(old) == 1, '1: doc-comment-anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2. mobiele deck
start_anchor = '        <div class="mymmo-ev-row__deck mymmo-ev-swipestack">'
end_anchor = '    <?php endif; ?>\n\n    <p class="mymmo-ev-row__more">'
assert content.count(start_anchor) == 1, '2: start-anker niet exact 1x gevonden'
assert content.count(end_anchor) == 1, '2: eind-anker niet exact 1x gevonden'
start = content.index(start_anchor)
end = content.index(end_anchor)
old_block = content[start:end]
assert 'mymmo-ev-swipehint' in old_block
assert 'mymmo-ev-deck-card' in old_block
assert old_block.count('<?php foreach') == 1

NEW_BLOCK = """        <div class="mymmo-ev-row__deck mymmo-ev-swipestack">
            <?php if ($pointer_arrow_url !== '') : ?>
                <div class="mymmo-ev-announce__pointer" aria-hidden="true">
                    <?php if ($pointer_label !== '') : ?>
                        <span class="mymmo-ev-announce__pointer-label"><?php echo esc_html($pointer_label); ?></span>
                    <?php endif; ?>
                    <img class="mymmo-ev-announce__pointer-arrow" src="<?php echo esc_url($pointer_arrow_url); ?>" alt="" loading="lazy" />
                </div>
            <?php endif; ?>

            <div class="mymmo-ev-swipestack__cards">
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

            <p class="mymmo-ev-swipehint">
                <img class="mymmo-ev-swipehint__scribble"
                     src="https://link.openvme.be/assets/events/components/scribbles-scribbles-62-1.svg"
                     alt="" loading="lazy" aria-hidden="true" />
                Swipe om al onze aankomende events te bekijken
            </p>
        </div>
"""

content = content[:start] + NEW_BLOCK + content[end:]

out = content.encode('utf-8')
assert out.count(b'\r') == 0
# ruwe balanscheck: de verhouding open/sluit-tags mag niet verschoven zijn
assert content.count('<?php') - content.count('?>') == before_open - before_close, \
    'php-tag-balans verschoven t.o.v. baseline'
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d  (<?php=%d ?>=%d)' % (
    before_lines, content.count('\n'), content.count('<?php'), content.count('?>')))
sys.exit(0)
