#!/usr/bin/env python3
"""v1.6.34 -- assets/js/mymmo-events.js

Twee wijzigingen aan de mobiele kaartenstapel:

1. De scheefstand hoort bij de kaart (CSS: --mymmo-ev-deck-rot per
   :nth-child) i.p.v. bij de stapelpositie. Het slepen en het wegvliegen
   moeten die eigen hoek dus MEEREKENEN, anders springt de kaart bij de
   eerste vingerbeweging recht.

2. Vooruit en terug zijn niet langer dezelfde animatie:
   - vooruit (swipe naar links): de bovenste kaart vliegt weg en komt
     onderaan de stapel te liggen, waar ze zacht infadet;
   - terug (swipe naar rechts): de ONDERSTE kaart schuift van buiten het
     scherm terug bovenop de stapel, en de kaart die bovenaan lag blijft
     liggen en zakt gewoon een plaats. Voorheen vloog bij terugswipen de
     bovenste kaart weg (dezelfde beweging als vooruit), wat de indruk gaf
     dat je vooruit ging terwijl je terugging.
   In beide gevallen schuiven de overige kaarten MET een transitie naar
   hun nieuwe plaats -- dat is wat het gevoel geeft dat je door de stapel
   gaat. Enkel de kaart die van buiten het scherm terug moet, wordt een
   frame lang transitieloos gezet (.is-returning), anders zie je ze over
   het scherm zweven i.p.v. op haar plek te staan.
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/js/mymmo-events.js'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')

# ---------------------------------------------------------------- 1. doc-comment
old = """   *    [mymmo_events_announcement] tonen EXACT dezelfde stapel -- een
   *    kaart volledig zichtbaar, de volgende licht gedraaid erachter.
   *    Swipe naar links = volgend event, naar rechts = vorige (cyclisch,
   *    dus terugswipen levert altijd iets op). Werkt met Pointer Events"""
new = """   *    [mymmo_events_announcement] tonen EXACT dezelfde stapel -- een
   *    kaart volledig zichtbaar, de volgende licht gedraaid erachter. Elke
   *    kaart heeft haar EIGEN vaste hoek (--mymmo-ev-deck-rot in de CSS,
   *    per :nth-child) en houdt die door de hele stapel heen; enkel de
   *    verschuiving hangt van de stapelpositie af. v1.6.34: voordien had
   *    elke POSITIE een eigen hoek, waardoor een kaart die naar voren
   *    schoof van hoek verspringt op het moment dat de swipe klaar is.
   *    Swipe naar links = volgend event, naar rechts = vorige (cyclisch,
   *    dus terugswipen levert altijd iets op). Werkt met Pointer Events"""
assert content.count(old) == 1, '1: doc-comment-anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2. baseRotOf
old = """    function setLinksReachable(card, on) {"""
new = """    // De eigen hoek van een kaart, uit de CSS-var die :nth-child zet. Het
    // slepen en wegvliegen tellen die erbij op, zodat een kaart nooit
    // rechtspringt zodra JS een inline transform zet.
    function baseRotOf(card) {
      var v = parseFloat(window.getComputedStyle(card).getPropertyValue('--mymmo-ev-deck-rot'));
      return isNaN(v) ? 0 : v;
    }

    function setLinksReachable(card, on) {"""
assert content.count(old) == 1, '2: setLinksReachable-anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 3. goToIndex
old = """    function goToIndex(index, direction) {
      index = (index % n + n) % n;
      if (animating || index === activeIndex) return;
      var dir = direction || (index > activeIndex ? 1 : -1);
      animating = true;
      dismissHint();

      var card = activeCard();
      card.classList.remove('is-dragging');
      card.style.transform = 'translateX(' + (dir > 0 ? '-135%' : '135%') +
        ') rotate(' + (dir > 0 ? -16 : 16) + 'deg)';
      card.style.opacity = '0';

      window.setTimeout(function () {
        wrap.classList.add('is-restacking');
        card.style.transform = '';
        card.style.opacity = '';
        activeIndex = index;
        render();
        void wrap.offsetWidth;
        wrap.classList.remove('is-restacking');
        animating = false;
      }, FLY_MS);
    }"""
new = """    function goToIndex(index, direction) {
      index = (index % n + n) % n;
      if (animating || index === activeIndex) return;
      var dir = direction || (index > activeIndex ? 1 : -1);
      animating = true;
      dismissHint();
      if (dir > 0) {
        goForward(index);
      } else {
        goBack(index);
      }
    }

    // Vooruit: de bovenste kaart vliegt weg en komt ONDERAAN de stapel te
    // liggen. Die kaart moet transitieloos terug naar haar rustpositie
    // (anders zweeft ze zichtbaar van buiten het scherm naar de achterkant
    // -- de glitch van 1.6.30-1.6.32), maar de rest van de stapel schuift
    // juist WEL met een transitie naar voren: dat is wat het gevoel geeft
    // dat je door de stapel gaat.
    function goForward(index) {
      var card = activeCard();
      var rot = baseRotOf(card);
      card.classList.remove('is-dragging');
      card.style.transform = 'translateX(-135%) rotate(' + (rot - 16) + 'deg)';
      card.style.opacity = '0';

      window.setTimeout(function () {
        card.classList.add('is-returning');
        card.style.transform = '';
        card.style.opacity = '0';
        activeIndex = index;
        render();
        void card.offsetWidth;
        card.classList.remove('is-returning');
        // Nu de transities weer aan staan: zacht infaden op haar nieuwe
        // plek onderaan de stapel i.p.v. daar plots te verschijnen.
        card.style.opacity = '';
        animating = false;
      }, FLY_MS);
    }

    // Terug: de ONDERSTE kaart komt bovenop. Ze schuift van buiten het
    // scherm terug de stapel op; de kaart die bovenaan lag blijft liggen en
    // zakt gewoon een plaats (haar sleeppositie animeert netjes terug naar
    // die nieuwe plek). Voorheen vloog bij terugswipen de bovenste kaart
    // weg -- exact dezelfde beweging als vooruit, wat aanvoelde alsof je
    // vooruit ging terwijl je terugging.
    function goBack(index) {
      var incoming = cards[index];
      var dragged = activeCard();
      var inRot = baseRotOf(incoming);

      dragged.classList.remove('is-dragging');

      // 1. De invliegende kaart transitieloos al bovenaan de stapel zetten,
      //    maar nog buiten het scherm.
      incoming.classList.add('is-returning');
      incoming.style.transform = 'translateX(135%) rotate(' + (inRot + 16) + 'deg)';
      incoming.style.opacity = '0';
      activeIndex = index;
      render();
      // 2. De gesleepte kaart mag met een transitie terug naar haar nieuwe
      //    (een plaats lagere) rustpositie.
      dragged.style.transform = '';
      dragged.style.opacity = '';
      void incoming.offsetWidth;
      // 3. Transities weer aan voor de invliegende kaart -> ze schuift van
      //    rechts de stapel op.
      incoming.classList.remove('is-returning');
      incoming.style.transform = '';
      incoming.style.opacity = '';

      window.setTimeout(function () {
        animating = false;
      }, FLY_MS);
    }"""
assert content.count(old) == 1, '3: goToIndex-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 4. sleep-hoek
old = """    var dx = 0;
    var speed = 0;
    var dragging = false;"""
new = """    var dx = 0;
    var speed = 0;
    var dragBaseRot = 0;
    var dragging = false;"""
assert content.count(old) == 1, '4a: drag-variabelen niet exact 1x gevonden'
content = content.replace(old, new)

old = """      dx = 0;
      speed = 0;
      dragging = true;"""
new = """      dx = 0;
      speed = 0;
      dragBaseRot = baseRotOf(card);
      dragging = true;"""
assert content.count(old) == 1, '4b: pointerdown-reset niet exact 1x gevonden'
content = content.replace(old, new)

old = """      activeCard().style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';"""
new = """      activeCard().style.transform = 'translateX(' + dx + 'px) rotate(' +
        (dragBaseRot + dx / 18) + 'deg)';"""
assert content.count(old) == 1, '4c: sleep-transform niet exact 1x gevonden'
content = content.replace(old, new)

# ------------------------------------------------- 5. doc-comment 1.6.33 bijwerken
old = """   *    - Herstapelen na een swipe gebeurt transitieloos (klasse
   *      is-restacking): eerst de weggevlogen kaart transitieloos terug op
   *      zijn rustpositie, dan de nieuwe stapelorde. Voorheen zweefde die
   *      kaart zichtbaar terug over het scherm naar de achterkant."""
new = """   *    - Bij het herstapelen schuiven de overige kaarten MET een
   *      transitie naar hun nieuwe plaats (dat maakt zichtbaar dat je door
   *      de stapel gaat); enkel de kaart die van buiten het scherm terug
   *      moet, staat een frame lang transitieloos (klasse is-returning op
   *      die kaart). Voorheen zweefde die kaart zichtbaar terug over het
   *      scherm naar de achterkant."""
assert content.count(old) == 1, '5: 1.6.33-doc-comment niet exact 1x gevonden'
content = content.replace(old, new)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count('{') - content.count('}') == 0, 'brace-balans klopt niet'
assert "classList.add('is-restacking')" not in content, 'JS gebruikt nog de oude is-restacking-klasse'
assert 'is-restacking' not in content, 'oude is-restacking-klasse nog vermeld in JS'
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
