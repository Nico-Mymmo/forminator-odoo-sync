#!/usr/bin/env python3
"""v1.6.35 -- assets/css/mymmo-events.css

Terugswipen trekt de vorige kaart van LINKS terug de stapel op (dezelfde
kant waar een kaart bij vooruitswipen naartoe verdwijnt). Die kaart heeft
daarvoor een eigen klasse nodig die haar boven de stapel houdt terwijl ze
binnenschuift: .is-incoming. Omdat ze dan absoluut gepositioneerd is (net
als de kaart die bovenaan lag en een plaats zakt), kan er tijdens die
animatie even geen kaart in de normale flow staan -- vandaar min-height op
de wrapper, zodat de hoogte niet inklapt.
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/css/mymmo-events.css'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')

# ---------------------------------------------------------------- 1. wrapper-hoogte
old = """/* Enkel de kaarten -- niets anders in deze wrapper, zie doc-blok. */
.mymmo-ev-swipestack__cards {
  position: relative;
}"""
new = """/* Enkel de kaarten -- niets anders in deze wrapper, zie doc-blok. */
.mymmo-ev-swipestack__cards {
  position: relative;
}
/* De hoogte van de stapel komt normaal van de kaart die in de flow staat
   (data-deck-pos="0"). Tijdens het terugswipen ligt de invliegende kaart
   bovenop maar absoluut gepositioneerd (.is-incoming), en de kaart die
   bovenaan lag is dan al naar positie 1 gezakt -- dus staat er even geen
   kaart in de flow. Zonder deze min-height klapt de stapel op dat moment
   in tot 0 en verspringt de hele pagina. equalizeDeckCardHeights() in
   mymmo-events.js zet deze var toch al op de hoogste kaart. */
.mymmo-ev-deck-mode {
  min-height: var(--mymmo-ev-deck-h, auto);
}"""
assert content.count(old) == 1, '1: wrapper-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2. is-incoming
old = """.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="hidden"] {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  box-shadow: none;
}"""
new = """.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="hidden"] {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  box-shadow: none;
}

/* De kaart die bij TERUGSWIPEN van links terug de stapel op komt. Deze
   klasse moet NA de data-deck-pos-regels hierboven staan: ze heeft dezelfde
   specificiteit, dus enkel de plaats in het bestand bepaalt wie wint. Ze
   overschrijft bewust drie dingen, ongeacht op welke stapelpositie de kaart
   op dat moment staat:
   - z-index 5: ze ligt boven de hele stapel, ook al staat ze bij het begin
     van de sleep nog achteraan (data-deck-pos="3" of "hidden");
   - opacity 1 en position absolute: achterste posities zijn half of niet
     zichtbaar, en absoluut blijven staan zorgt ervoor dat de kaart die
     bovenaan lag rustig kan blijven liggen (zie min-height hierboven);
   - pointer-events none: de vinger blijft op de kaart eronder, die de
     pointer-capture heeft. */
.mymmo-ev-deck-mode .mymmo-ev-deck-card.is-incoming {
  position: absolute;
  inset: 0;
  z-index: 5;
  opacity: 1;
  pointer-events: none;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.10);
}"""
assert content.count(old) == 1, '2: pos-hidden-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 3. is-returning-doc
old = """/* De weggeswipete kaart, terwijl JS haar onderaan de stapel inschuift: één
   frame zonder transitie (anders zag je die kaart zichtbaar terugzweven van
   buiten het scherm naar de achterkant -- de "kaart vliegt terug"-glitch
   van 1.6.30-1.6.32). Deze klasse staat bewust op de KAART en niet op de
   stapel: de overige kaarten moeten juist wél met een transitie naar voren
   schuiven, want dat is wat het gevoel geeft dat je door de stapel gaat. */"""
new = """/* Eén frame zonder transitie, voor een kaart die JS van de ene kant van het
   scherm naar de andere moet verplaatsen zonder dat je dat ziet gebeuren:
   de weggeswipete kaart die onderaan de stapel wordt ingeschoven, en de
   terugkomende kaart die eerst links buiten beeld klaargezet wordt. Zonder
   dit zweefde zo'n kaart zichtbaar over het scherm -- de "kaart vliegt
   terug"-glitch van 1.6.30-1.6.32. Deze klasse staat bewust op de KAART en
   niet op de stapel: de overige kaarten moeten juist wél met een transitie
   naar hun nieuwe plaats schuiven, want dat is wat het gevoel geeft dat je
   door de stapel gaat. */"""
assert content.count(old) == 1, '3: is-returning-doc niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 4. doc-blok
old = """   - De VERSCHUIVING blijft wel per positie -- dat is wat de stapel
     zichtbaar maakt -- en wordt bij een swipe mét transitie naar voren
     geschoven, zodat het eruitziet alsof je door de stapel gaat. Enkel de
     weggeswipete kaart springt transitieloos terug (zie .is-returning), en
     die belandt onderaan de stapel waar ze zacht infadet."""
new = """   - De VERSCHUIVING blijft wel per positie -- dat is wat de stapel
     zichtbaar maakt -- en wordt bij een swipe mét transitie naar voren
     geschoven, zodat het eruitziet alsof je door de stapel gaat. Enkel de
     kaart die van de ene kant van het scherm naar de andere moet, springt
     transitieloos (zie .is-returning).

   v1.6.35 -- vooruit en terug zijn spiegelbeelden van elkaar:
   - Vooruit verdwijnt een kaart naar LINKS en komt ze onderaan de stapel.
     Terugswipen trekt die vorige kaart dus ook van LINKS terug naar boven
     (.is-incoming hieronder) -- niet van rechts, want dan lijkt het alsof
     de kaart die je net naar rechts sleepte gewoon terugkeert, en zie je
     niet waar ze belandt.
   - Tijdens een terugsleep beweegt de BOVENSTE kaart niet: de vorige kaart
     komt van links mee met je vinger (zie mymmo-events.js). Dat is de hele
     boodschap van dat gebaar -- je trekt de vorige kaart terug -- en de
     kaart die je zag blijft liggen en zakt enkel een plaats."""
assert content.count(old) == 1, '4: doc-blok-anker niet exact 1x gevonden'
content = content.replace(old, new)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count('{') - content.count('}') == 0, 'brace-balans klopt niet'
# is-incoming MOET na alle data-deck-pos-regels staan (gelijke specificiteit)
assert content.index('.mymmo-ev-deck-card.is-incoming {') > \
    content.rindex('.mymmo-ev-deck-card[data-deck-pos='), \
    'is-incoming staat niet na de data-deck-pos-regels'
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
