#!/usr/bin/env python3
"""v1.6.35 -- assets/js/mymmo-events.js

Terugswipen is nu het spiegelbeeld van vooruitswipen:

- Vooruit verdwijnt de bovenste kaart naar LINKS en komt ze onderaan de
  stapel. Terug trekt die vorige kaart dus ook van LINKS terug naar boven.
  Voorheen vloog ze van rechts binnen -- dezelfde kant waar de gebruiker
  net naartoe sleepte -- waardoor het leek alsof de gesleepte kaart gewoon
  terugkeerde en je niet zag waar ze belandde.
- Tijdens een terugsleep beweegt de BOVENSTE kaart niet meer. De vorige
  kaart komt van links mee met de vinger (.is-incoming houdt haar boven de
  stapel), en de kaart die je zag blijft liggen en zakt enkel een plaats.
- Haalt de sleep de drempel niet, dan schuift die vorige kaart terug naar
  links het beeld uit en blijft de stapel exact zoals hij was.
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/js/mymmo-events.js'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')

# ---------------------------------------------------------------- 1. doc-comment
old = """   *    - Bij het herstapelen schuiven de overige kaarten MET een
   *      transitie naar hun nieuwe plaats (dat maakt zichtbaar dat je door
   *      de stapel gaat); enkel de kaart die van buiten het scherm terug
   *      moet, staat een frame lang transitieloos (klasse is-returning op
   *      die kaart). Voorheen zweefde die kaart zichtbaar terug over het
   *      scherm naar de achterkant."""
new = """   *    - Bij het herstapelen schuiven de overige kaarten MET een
   *      transitie naar hun nieuwe plaats (dat maakt zichtbaar dat je door
   *      de stapel gaat); enkel de kaart die van buiten het scherm terug
   *      moet, staat een frame lang transitieloos (klasse is-returning op
   *      die kaart). Voorheen zweefde die kaart zichtbaar terug over het
   *      scherm naar de achterkant.
   *    - v1.6.35: vooruit en terug zijn spiegelbeelden. Vooruit verdwijnt
   *      een kaart naar LINKS en komt ze onderaan de stapel; terugswipen
   *      trekt die vorige kaart ook van LINKS terug naar boven. Tijdens een
   *      terugsleep beweegt de bovenste kaart NIET -- de vorige kaart komt
   *      van links mee met de vinger (klasse is-incoming) en de kaart die
   *      je zag blijft liggen en zakt enkel een plaats. Voorheen vloog de
   *      terugkomende kaart van rechts binnen, dezelfde kant waar de vinger
   *      net naartoe sleepte, waardoor het leek alsof de gesleepte kaart
   *      gewoon terugkeerde en je niet zag waar ze belandde."""
assert content.count(old) == 1, '1: doc-comment-anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2. goBack
old = """    // Terug: de ONDERSTE kaart komt bovenop. Ze schuift van buiten het
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
new = """    // Waar een kaart staat als ze links buiten beeld wacht: net voorbij de
    // linkerrand van de stapel EN voorbij de zijruimte van de pagina, zodat
    // er in ruststand geen randje van te zien is.
    function backOffscreenX() {
      return -((wrap.clientWidth || 320) + 40);
    }

    // Terug: de ONDERSTE kaart komt bovenop, en ze komt van LINKS -- dezelfde
    // kant waar een kaart bij vooruitswipen naartoe verdwijnt. Je ziet dus
    // letterlijk je vorige kaart terugkomen. De kaart die bovenaan lag
    // blijft liggen en zakt enkel een plaats.
    // .is-incoming houdt de terugkomende kaart tijdens de hele beweging
    // boven de stapel en absoluut gepositioneerd (zie CSS), zodat ze de
    // kaart eronder niet verplaatst.
    function goBack(index) {
      var incoming = cards[index];
      var rot = baseRotOf(incoming);
      // Is er net teruggesleept, dan staat deze kaart al gedeeltelijk in
      // beeld (zie pointermove) -- die mag NIET eerst terug naar buiten
      // gezet worden, dat zou een sprong geven.
      if (!incoming.classList.contains('is-incoming')) {
        incoming.classList.add('is-incoming');
        incoming.classList.add('is-returning');
        incoming.style.transform =
          'translateX(' + backOffscreenX() + 'px) rotate(' + (rot - 14) + 'deg)';
      }
      incoming.classList.remove('is-dragging');

      activeIndex = index;
      render();
      void incoming.offsetWidth;

      // Transities aan -> de kaart schuift van links naar haar plek bovenaan,
      // terwijl de overige kaarten tegelijk een plaats naar achteren zakken.
      incoming.classList.remove('is-returning');
      incoming.style.transform = '';

      window.setTimeout(function () {
        incoming.classList.remove('is-incoming');
        backCard = null;
        animating = false;
      }, FLY_MS);
    }

    // Terugsleep die de drempel niet haalde: de vorige kaart schuift terug
    // naar links het beeld uit, de stapel blijft exact zoals hij was.
    function cancelBackDrag() {
      var card = backCard;
      var rot = baseRotOf(card);
      backCard = null;
      animating = true;
      card.classList.remove('is-dragging');
      card.style.transform =
        'translateX(' + backOffscreenX() + 'px) rotate(' + (rot - 14) + 'deg)';
      window.setTimeout(function () {
        card.classList.add('is-returning');
        card.classList.remove('is-incoming');
        card.style.transform = '';
        void card.offsetWidth;
        card.classList.remove('is-returning');
        animating = false;
      }, FLY_MS);
    }"""
assert content.count(old) == 1, '2: goBack-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 3. drag-variabelen
old = """    var dx = 0;
    var speed = 0;
    var dragBaseRot = 0;
    var dragging = false;"""
new = """    var dx = 0;
    var speed = 0;
    var dragBaseRot = 0;
    // Terugsleep: welke kaart van links meekomt met de vinger, en haar eigen
    // hoek. `back` staat vast zodra de richting van de sleep bekend is.
    var back = false;
    var backCard = null;
    var backBaseRot = 0;
    var dragging = false;"""
assert content.count(old) == 1, '3: drag-variabelen niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 4. settle
old = """    function settle() {
      var card = activeCard();
      card.classList.remove('is-dragging');
      dragging = false;
      if (!horizontal) return;
      var flick = speed > 0.45 && Math.abs(dx) > 24;
      if (dx <= -threshold() || (flick && dx < 0)) {
        commit(1);
      } else if (dx >= threshold() || (flick && dx > 0)) {
        commit(-1);
      } else {
        card.style.transform = '';
      }
    }"""
new = """    function settle() {
      var flick = speed > 0.45 && Math.abs(dx) > 24;
      var goingBack = back;
      dragging = false;
      back = false;

      // Bij een terugsleep bewoog niet de bovenste kaart maar de vorige
      // kaart die van links binnenkwam (zie pointermove), dus wordt hier ook
      // alleen die kaart afgehandeld.
      if (goingBack) {
        if (!backCard) return;
        if (dx >= threshold() || (flick && dx > 0)) {
          commit(-1);
        } else {
          cancelBackDrag();
        }
        return;
      }

      var card = activeCard();
      card.classList.remove('is-dragging');
      if (!horizontal) return;
      if (dx <= -threshold() || (flick && dx < 0)) {
        commit(1);
      } else {
        card.style.transform = '';
      }
    }"""
assert content.count(old) == 1, '4: settle-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 5. pointerdown-reset
old = """      dx = 0;
      speed = 0;
      dragBaseRot = baseRotOf(card);
      dragging = true;
      horizontal = false;
      decided = false;
      suppressClick = false;"""
new = """      dx = 0;
      speed = 0;
      dragBaseRot = baseRotOf(card);
      back = false;
      backCard = null;
      dragging = true;
      horizontal = false;
      decided = false;
      suppressClick = false;"""
assert content.count(old) == 1, '5: pointerdown-reset niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 6. richting kiezen
old = """        if (!horizontal) {
          dragging = false;
          return;
        }
        activeCard().classList.add('is-dragging');
        try { activeCard().setPointerCapture(pointerId); } catch (err) { /* niet kritiek */ }
      }"""
new = """        if (!horizontal) {
          dragging = false;
          return;
        }
        // Naar rechts = terug: dan sleep je niet de bovenste kaart, maar
        // trek je de vorige kaart van links terug het beeld in.
        back = moveX > 0;
        if (back) {
          backCard = cards[(activeIndex - 1 + n) % n];
          backBaseRot = baseRotOf(backCard);
          backCard.classList.add('is-incoming');
          backCard.classList.add('is-dragging');
        } else {
          activeCard().classList.add('is-dragging');
        }
        // De capture blijft altijd op de kaart onder de vinger, ook bij een
        // terugsleep (de invliegende kaart staat op pointer-events: none).
        try { activeCard().setPointerCapture(pointerId); } catch (err) { /* niet kritiek */ }
      }"""
assert content.count(old) == 1, '6: richting-blok niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 7. sleep-transform
old = """      activeCard().style.transform = 'translateX(' + dx + 'px) rotate(' +
        (dragBaseRot + dx / 18) + 'deg)';"""
new = """      if (back) {
        // De vorige kaart komt met haar rechterrand mee met de vinger en
        // draait onderweg recht naar haar eigen hoek; de kaart die bovenaan
        // ligt beweegt niet.
        var enter = Math.min(1, Math.max(0, dx / (wrap.clientWidth || 320)));
        backCard.style.transform =
          'translateX(' + (backOffscreenX() + dx) + 'px) rotate(' +
          (backBaseRot - 14 * (1 - enter)) + 'deg)';
      } else {
        activeCard().style.transform = 'translateX(' + dx + 'px) rotate(' +
          (dragBaseRot + dx / 18) + 'deg)';
      }"""
assert content.count(old) == 1, '7: sleep-transform niet exact 1x gevonden'
content = content.replace(old, new)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count('{') - content.count('}') == 0, 'brace-balans klopt niet'
assert "translateX(135%)" not in content, 'er komt nog een kaart van rechts binnen'
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
