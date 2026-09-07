#!/usr/bin/env python3
"""v1.6.34 -- assets/css/mymmo-events.css

De scheefstand verhuist van de STAPELPOSITIE naar de KAART zelf.

Oorzaak van het houterige gevoel: elke positie had een eigen hoek (0:
-1.25, 1: -4.5, 2: 5, 3: -7 graden), dus een kaart die naar voren schoof
veranderde onvermijdelijk van hoek -- nagemeten met transition-events: er
loopt geen transitie, de nieuwe bovenste kaart landt rechtstreeks op zijn
nieuwe hoek, dus een instant sprong. Nu krijgt elke kaart via nth-child een
eigen vaste hoek (cyclus van 4, zoals .mymmo-ev-row__card--1..4 op desktop)
en houdt ze die door de hele stapel heen: nog steeds een scheve stapel waar
elke kaart anders ligt, maar zonder dat er ooit een hoek verspringt.

De verschuivingen per positie blijven WEL per positie (dat is precies wat
de stapel toont) en worden nu met een transitie naar voren geschoven, zodat
je ziet dat je door de stapel gaat.
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/css/mymmo-events.css'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')

# ---------------------------------------------------------------- 1. doc-blok
old = """   - De rotaties van de kaartjes erachter zijn iets kleiner dan op desktop
     (-4.5/5/-7 graden i.p.v. -5/6/-9): een gedraaide kaart is breder dan
     zijn eigen kader, en op telefoonbreedte staken de hoeken buiten de
     beschikbare ruimte (horizontale paginascroll). */"""
new = """   - De rotaties van de kaartjes erachter zijn iets kleiner dan op desktop:
     een gedraaide kaart is breder dan zijn eigen kader, en op
     telefoonbreedte staken de hoeken buiten de beschikbare ruimte
     (horizontale paginascroll).

   v1.6.34 -- scheefstand hoort bij de KAART, niet bij de stapelpositie:
   - Elke positie had een eigen hoek (0: -1.25, 1: -4.5, 2: 5, 3: -7
     graden). Een kaart die na een swipe naar voren schoof veranderde
     daardoor onvermijdelijk van hoek, precies op het moment dat de swipe
     klaar was. Dat is geen animatie (nagemeten met transition-events: er
     loopt geen transitie, de nieuwe bovenste kaart landt rechtstreeks op
     zijn nieuwe hoek) maar een instant sprong -- en precies die sprong
     voelde houterig.
   - Nu krijgt elke kaart via :nth-child(4n+x) een eigen vaste hoek
     (--mymmo-ev-deck-rot, cyclus van 4 zoals .mymmo-ev-row__card--1..4 op
     desktop) en houdt ze die door de hele stapel heen. De stapel ligt dus
     nog altijd los en scheef met elke kaart anders gedraaid, maar er kan
     nergens meer een hoek verspringen.
   - De VERSCHUIVING blijft wel per positie -- dat is wat de stapel
     zichtbaar maakt -- en wordt bij een swipe mét transitie naar voren
     geschoven, zodat het eruitziet alsof je door de stapel gaat. Enkel de
     weggeswipete kaart springt transitieloos terug (zie .is-returning), en
     die belandt onderaan de stapel waar ze zacht infadet.
   - Tijdens het SLEPEN kantelt de kaart mee met je vinger BOVEN OP haar
     eigen hoek (mymmo-events.js rekent die erbij), zodat er ook bij het
     begin van een sleep niets rechtspringt. */"""
assert content.count(old) == 1, '1: rotatie-paragraaf niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2. is-restacking -> is-returning
old = """/* Herstapelen na een swipe gebeurt bewust ZONDER transitie (JS zet deze
   klasse een frame lang): de weggevlogen kaart wordt eerst op zijn
   rustpositie teruggezet en pas daarna achteraan de stapel ingevoegd. Met
   transities aan zag je die kaart zichtbaar terugzweven over het scherm --
   de "kaart vliegt terug"-glitch van 1.6.30-1.6.32. */
.mymmo-ev-deck-mode.is-restacking .mymmo-ev-deck-card {
  transition: none !important;
}"""
new = """/* De weggeswipete kaart, terwijl JS haar onderaan de stapel inschuift: één
   frame zonder transitie (anders zag je die kaart zichtbaar terugzweven van
   buiten het scherm naar de achterkant -- de "kaart vliegt terug"-glitch
   van 1.6.30-1.6.32). Deze klasse staat bewust op de KAART en niet op de
   stapel: de overige kaarten moeten juist wél met een transitie naar voren
   schuiven, want dat is wat het gevoel geeft dat je door de stapel gaat. */
.mymmo-ev-deck-mode .mymmo-ev-deck-card.is-returning {
  transition: none !important;
}

/* Eigen vaste hoek per kaart -- cyclisch per 4, dus ook bij meer kaarten
   blijft het afwisselen i.p.v. herhalen in een herkenbaar patroon van
   precies 4 (zelfde aanpak als .mymmo-ev-row__card--1..4 op desktop).
   Elke stapelpositie hieronder gebruikt deze var, zodat de hoek van een
   kaart nooit verandert wanneer ze door de stapel schuift. */
.mymmo-ev-deck-mode .mymmo-ev-deck-card:nth-child(4n+1) { --mymmo-ev-deck-rot: -2.5deg; }
.mymmo-ev-deck-mode .mymmo-ev-deck-card:nth-child(4n+2) { --mymmo-ev-deck-rot: 1.75deg; }
.mymmo-ev-deck-mode .mymmo-ev-deck-card:nth-child(4n+3) { --mymmo-ev-deck-rot: -1.25deg; }
.mymmo-ev-deck-mode .mymmo-ev-deck-card:nth-child(4n+4) { --mymmo-ev-deck-rot: 2.25deg; }"""
assert content.count(old) == 1, '2: is-restacking-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 3. posities
old = """.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="0"] {
  position: relative;
  z-index: 4;
  transform: rotate(-1.25deg);
  opacity: 1;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.10);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="1"] {
  position: absolute;
  inset: 0;
  z-index: 3;
  transform: translate(6px, -5px) rotate(-4.5deg);
  transform-origin: 42% 58%;
  opacity: 1;
  pointer-events: none;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="2"] {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform: translate(-7px, 6px) rotate(5deg);
  transform-origin: 58% 44%;
  opacity: 0.9;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}"""
new = """/* Per positie enkel nog een VERSCHUIVING; de hoek komt van de kaart zelf
   (--mymmo-ev-deck-rot hierboven). Ook geen transform-origin per positie
   meer: een ander draaipunt per positie was een tweede bron van
   verspringen. */
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="0"] {
  position: relative;
  z-index: 4;
  transform: rotate(var(--mymmo-ev-deck-rot, 0deg));
  opacity: 1;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.10);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="1"] {
  position: absolute;
  inset: 0;
  z-index: 3;
  transform: translate(7px, -6px) rotate(var(--mymmo-ev-deck-rot, 0deg));
  opacity: 1;
  pointer-events: none;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="2"] {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform: translate(-8px, 7px) rotate(var(--mymmo-ev-deck-rot, 0deg));
  opacity: 0.9;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}"""
assert content.count(old) == 1, '3: pos 0-2 niet exact 1x gevonden'
content = content.replace(old, new)

old = """.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="3"] {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform: translate(4px, 9px) rotate(-7deg);
  transform-origin: 46% 64%;
  opacity: 0.75;
  pointer-events: none;
  box-shadow: none;
}"""
new = """.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="3"] {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform: translate(5px, 12px) rotate(var(--mymmo-ev-deck-rot, 0deg));
  opacity: 0.75;
  pointer-events: none;
  box-shadow: none;
}"""
assert content.count(old) == 1, '4: pos 3 niet exact 1x gevonden'
content = content.replace(old, new)

# ------------------------------------------------- 4. ruimte onder de stapel
# De onderste kaart schuift nu 12px naar beneden (was 9px) en kantelt daar
# bovenop, dus de stipjes iets verder weg zetten.
old = """.mymmo-ev-swipedots {
  display: none;
  justify-content: center;
  align-items: center;
  gap: 0.1rem;
  margin: 1rem 0 0;
}"""
new = """.mymmo-ev-swipedots {
  display: none;
  justify-content: center;
  align-items: center;
  gap: 0.1rem;
  /* Ruim genoeg voor de onderste kaart van de stapel: die staat 12px lager
     en kantelt daar nog bovenop. */
  margin: 1.4rem 0 0;
}"""
assert content.count(old) == 1, '5: stipjes-blok niet exact 1x gevonden'
content = content.replace(old, new)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count('{') - content.count('}') == 0, 'brace-balans klopt niet'
deck = content.split('.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="0"]')[1] \
              .split('@media (max-width: 40rem)')[0]
assert 'transform-origin' not in deck, 'er staat nog een transform-origin per positie'
assert deck.count('rotate(var(--mymmo-ev-deck-rot, 0deg))') == 4, \
    'niet alle 4 posities gebruiken de kaart-eigen hoek'
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
