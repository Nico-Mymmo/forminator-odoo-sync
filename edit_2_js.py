#!/usr/bin/env python3
"""v1.6.33 -- assets/js/mymmo-events.js

Vervangt de hele staart van het bestand (sectie 5b: swipe-deck, sectie 6:
kaartenrij, en de boot-regels) door een herwerkte versie:
 - deck werkt op de nieuwe .mymmo-ev-swipestack__cards-wrapper
 - transitieloos herstapelen (geen terugzwevende kaart meer)
 - relatieve swipedrempel + flick, klik-onderdrukking na een sleep
 - stipjes-indicator, hint verdwijnt na de eerste swipe
 - rowOverlapFit() meet offsetWidth i.p.v. de bounding box van een
   gedraaide kaart, en de echte contentbreedte van de container
 - init is idempotent + een breakpoint-watcher initialiseert het andere
   gedrag als het venster van/naar mobiel wisselt
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/js/mymmo-events.js'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')

marker = '5b. Swipeable deck'
assert content.count(marker) == 1, 'marker niet exact 1x gevonden'
cut = content.rindex('  /**', 0, content.index(marker))
old_tail = content[cut:]
assert 'function initSwipeDeck(' in old_tail
assert 'function rowOverlapFit(' in old_tail
assert 'function initRows(' in old_tail
assert old_tail.rstrip().endswith('})();')

NEW_TAIL = """  /**
   * 5b. Swipebare kaartenstapel (mobiel, <= 40rem): [mymmo_events_row] en
   *    [mymmo_events_announcement] tonen EXACT dezelfde stapel -- een
   *    kaart volledig zichtbaar, de volgende licht gedraaid erachter.
   *    Swipe naar links = volgend event, naar rechts = vorige (cyclisch,
   *    dus terugswipen levert altijd iets op). Werkt met Pointer Events
   *    (muis + touch in een) en telt een sleep pas als swipe zodra die
   *    overwegend horizontaal is -- verticaal blijft de pagina scrollen.
   *
   *    Structuur (identiek in beide templates, zie ook de CSS):
   *      .mymmo-ev-swipestack
   *        .mymmo-ev-announce__pointer     "Schrijf je snel in!"
   *        .mymmo-ev-swipestack__cards     <-- krijgt .mymmo-ev-deck-mode
   *          .mymmo-ev-deck-card * n
   *        .mymmo-ev-swipedots             door JS gebouwd
   *        .mymmo-ev-swipehint             verdwijnt na de eerste swipe
   *
   *    v1.6.33 t.o.v. 1.6.30-1.6.32:
   *    - Alleen de kaarten zitten nog in hetzelfde positioneringskader.
   *      De kaarten erachter liggen op inset: 0; stonden hint/stipjes in
   *      datzelfde kader, dan rekende inset: 0 vanaf boven die hint en
   *      lagen ze te hoog t.o.v. de bovenste kaart.
   *    - Herstapelen na een swipe gebeurt transitieloos (klasse
   *      is-restacking): eerst de weggevlogen kaart transitieloos terug op
   *      zijn rustpositie, dan de nieuwe stapelorde. Voorheen zweefde die
   *      kaart zichtbaar terug over het scherm naar de achterkant.
   *    - De drempel is relatief aan de kaartbreedte (18%, min. 45px) en
   *      een snelle flick volstaat ook -- de vaste 70px voelde op een
   *      klein scherm als "blijft plakken".
   *    - Een sleep die als swipe eindigde onderdrukt de klik die daarna
   *      volgt, zodat je niet per ongeluk naar het event navigeert.
   *    - Enkel de bovenste kaart is bereikbaar: de links van de kaarten
   *      erachter gaan uit de tab-orde (die kaarten staan toch al op
   *      pointer-events: none).
   */
  function isDeckViewport() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 40rem)').matches);
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Alle kaart-wrappers die in deck-modus staan -- nodig om na load,
  // fontswap of resize opnieuw gelijke hoogtes te meten.
  var deckWraps = [];
  var deckGlobalsBound = false;

  function initSwipeDecks() {
    if (!isDeckViewport()) return;
    var stacks = document.querySelectorAll('.mymmo-ev-swipestack');
    if (!stacks.length) return;

    stacks.forEach(function (stack) {
      // Idempotent: de breakpoint-watcher hieronder kan dit opnieuw
      // aanroepen wanneer het venster van desktop naar mobiel wisselt.
      if (stack.getAttribute('data-mymmo-deck') === 'ready') return;
      stack.setAttribute('data-mymmo-deck', 'ready');
      initSwipeDeck(stack);
    });

    if (deckGlobalsBound) {
      equalizeAllDecks();
      return;
    }
    deckGlobalsBound = true;
    window.addEventListener('load', equalizeAllDecks);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(equalizeAllDecks);
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(equalizeAllDecks, 150);
    });
  }

  function equalizeAllDecks() {
    deckWraps.forEach(equalizeDeckCardHeights);
  }

  /**
   * Meet de natuurlijke inhoudshoogte van elke kaart in de stapel en zet
   * het maximum als CSS-variabele op de wrapper -- elke kaart (ook de
   * geabsoluteerde erachter, via inset: 0) krijgt zo exact dezelfde
   * hoogte, i.p.v. dat de kortste kaart de hoogte bepaalt en de langere
   * erachter zichtbaar afgekapt worden. De var eerst weghalen voorkomt dat
   * een vorige (te kleine) meting de nieuwe beinvloedt, bv. na een resize
   * met andere regelafbreking. scrollHeight bevat inhoud + padding maar
   * niet de randen; die komen er via offsetHeight - clientHeight bij,
   * omdat de hoogte via box-sizing: border-box wordt toegepast.
   */
  function equalizeDeckCardHeights(wrap) {
    var cards = wrap.querySelectorAll(':scope > .mymmo-ev-deck-card');
    if (!cards.length) return;
    wrap.style.removeProperty('--mymmo-ev-deck-h');
    var max = 0;
    cards.forEach(function (card) {
      var borders = Math.max(0, card.offsetHeight - card.clientHeight);
      var h = card.scrollHeight + borders;
      if (h > max) max = h;
    });
    if (max > 0) wrap.style.setProperty('--mymmo-ev-deck-h', max + 'px');
  }

  // Stipjes onder de stapel: positie + aantal, en tikbaar om direct naar
  // een kaart te springen. Bewust in JS gebouwd i.p.v. in de template,
  // zodat het aantal altijd exact het aantal gerenderde kaarten volgt.
  function buildDots(stack, n, onSelect) {
    var host = stack.querySelector(':scope > .mymmo-ev-swipedots');
    if (!host) {
      host = document.createElement('div');
      host.className = 'mymmo-ev-swipedots';
      var cardsWrap = stack.querySelector(':scope > .mymmo-ev-swipestack__cards');
      if (cardsWrap && cardsWrap.parentNode === stack) {
        stack.insertBefore(host, cardsWrap.nextSibling);
      } else {
        stack.appendChild(host);
      }
    }
    host.textContent = '';
    var buttons = [];
    for (var i = 0; i < n; i++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'mymmo-ev-swipedot';
      dot.setAttribute('aria-label', 'Event ' + (i + 1) + ' van ' + n);
      (function (index) {
        dot.addEventListener('click', function () { onSelect(index); });
      })(i);
      host.appendChild(dot);
      buttons.push(dot);
    }
    return {
      sync: function (active) {
        for (var i = 0; i < buttons.length; i++) {
          var on = i === active;
          buttons[i].classList.toggle('is-active', on);
          if (on) {
            buttons[i].setAttribute('aria-current', 'true');
          } else {
            buttons[i].removeAttribute('aria-current');
          }
        }
      }
    };
  }

  function initSwipeDeck(stack) {
    // Fallback op de stack zelf, zodat een oudere template-override in een
    // thema (zonder __cards-wrapper) blijft werken.
    var wrap = stack.querySelector(':scope > .mymmo-ev-swipestack__cards') || stack;
    var cards = wrap.querySelectorAll(':scope > .mymmo-ev-deck-card');
    var n = cards.length;
    if (!n) return null;

    wrap.classList.add('mymmo-ev-deck-mode');
    deckWraps.push(wrap);

    var hint = stack.querySelector('.mymmo-ev-swipehint');
    var activeIndex = 0;
    var animating = false;
    var dots = n > 1 ? buildDots(stack, n, function (index) { goToIndex(index); }) : null;
    var FLY_MS = prefersReducedMotion() ? 0 : 320;
    var SWIPE_MIN = 45;

    function setLinksReachable(card, on) {
      card.querySelectorAll('a[href]').forEach(function (link) {
        if (on) {
          link.removeAttribute('tabindex');
        } else {
          link.setAttribute('tabindex', '-1');
        }
      });
    }

    function render() {
      for (var i = 0; i < n; i++) {
        var pos = (i - activeIndex + n) % n;
        var card = cards[i];
        card.dataset.deckPos = pos <= 3 ? String(pos) : 'hidden';
        card.setAttribute('aria-hidden', pos === 0 ? 'false' : 'true');
        setLinksReachable(card, pos === 0);
      }
      if (dots) dots.sync(activeIndex);
    }

    render();
    equalizeDeckCardHeights(wrap);
    if (n < 2) return null;

    function activeCard() { return cards[activeIndex]; }

    function dismissHint() {
      if (hint) hint.classList.add('is-dismissed');
    }

    function goToIndex(index, direction) {
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
    }

    function commit(direction) {
      goToIndex(activeIndex + direction, direction);
    }

    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var lastT = 0;
    var dx = 0;
    var speed = 0;
    var dragging = false;
    var horizontal = false;
    var decided = false;
    var suppressClick = false;

    function threshold() {
      return Math.max(SWIPE_MIN, (wrap.clientWidth || 320) * 0.18);
    }

    function settle() {
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
    }

    wrap.addEventListener('pointerdown', function (e) {
      if (animating) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var card = activeCard();
      if (!card.contains(e.target)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastT = e.timeStamp || Date.now();
      dx = 0;
      speed = 0;
      dragging = true;
      horizontal = false;
      decided = false;
      suppressClick = false;
    });

    wrap.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var moveX = e.clientX - startX;
      var moveY = e.clientY - startY;
      if (!decided) {
        if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
        decided = true;
        horizontal = Math.abs(moveX) > Math.abs(moveY);
        if (!horizontal) {
          dragging = false;
          return;
        }
        activeCard().classList.add('is-dragging');
        try { activeCard().setPointerCapture(pointerId); } catch (err) { /* niet kritiek */ }
      }
      if (!horizontal) return;
      var now = e.timeStamp || Date.now();
      var dt = now - lastT;
      if (dt > 0) speed = Math.abs(e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = now;
      dx = moveX;
      if (e.cancelable) e.preventDefault();
      activeCard().style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
    }, { passive: false });

    function onPointerEnd(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (horizontal && Math.abs(dx) > 8) {
        // De klik die na een sleep volgt (muis, en sommige
        // touch-implementaties) mag niet als "tik op de kaart" gelden.
        suppressClick = true;
        window.setTimeout(function () { suppressClick = false; }, 400);
      }
      settle();
    }
    wrap.addEventListener('pointerup', onPointerEnd);
    wrap.addEventListener('pointercancel', onPointerEnd);

    wrap.addEventListener('click', function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    return {
      goNext: function () { commit(1); },
      goPrev: function () { commit(-1); }
    };
  }

  /**
   * 6. Kaartenrij op desktop (mymmo_events_row): drie gedragingen die geen
   *    van alle met vaste CSS-waarden op te lossen zijn, want ze hangen af
   *    van dingen die pas na render bekend zijn (breedte, aantal kaarten,
   *    welk kaartje actief is) of van invoertype (muis vs. touch).
   *
   *    a) De kaarten overlappen bewust (zie .mymmo-ev-row__card), maar de
   *       rij mag NOOIT breder worden dan de beschikbare ruimte -- geen
   *       horizontale scrollbar. De kaarten worden daarvoor nooit smaller
   *       gemaakt: rowOverlapFit() berekent hoeveel ze over elkaar moeten
   *       schuiven (of, bij weinig kaarten, hoeveel tussenruimte ze mogen
   *       krijgen om de volle breedte te vullen) en zet dat als
   *       --mymmo-ev-row-overlap. Zonder JS geldt de vaste CSS-fallback.
   *    b) Het "Schrijf je snel in!"-tagje bestaat maar een keer per rij en
   *       verhuist (DOM-reparent) naar het kaartje dat op dat moment actief
   *       is -- pas na 500ms (zodat het niet meeflitst bij voorbijglijden)
   *       en met een aanloop-animatie (@keyframes mymmoRowPointerPop).
   *    c) Op touch werkt :hover niet betrouwbaar, dus laat rowSwipeEnable()
   *       een horizontale swipe over de rij het volgende/vorige kaartje
   *       actief maken (.is-active, zelfde CSS als :hover).
   */
  function remToPx(rem) {
    var base = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return rem * (base || 16);
  }

  function rowOverlapFit(cardsEl) {
    var cards = cardsEl.querySelectorAll('.mymmo-ev-row__card');
    var n = cards.length;
    if (n < 2) return;

    // v1.6.33: offsetWidth i.p.v. getBoundingClientRect().width. Elke kaart
    // staat licht gedraaid (rotate(-2deg) e.d.) en de bounding box van een
    // gedraaid element is BREDER dan de kaart zelf (bij 200x172px en 2
    // graden ruim 6px). Die extra pixels rekenden mee als kaartbreedte,
    // waardoor de rij systematisch iets te veel overlap kreeg en smaller
    // uitviel dan de beschikbare ruimte.
    var cardWidth = cards[0].offsetWidth;
    // clientWidth bevat de padding van de container; de kaarten beginnen
    // pas na de linkerpadding, dus rekenen we met de contentbreedte. De
    // 2px marge vangt de gedraaide hoek van de laatste kaart op, zodat die
    // nooit buiten de beschikbare breedte valt.
    var cs = window.getComputedStyle(cardsEl);
    var containerWidth = cardsEl.clientWidth -
      (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 2;
    if (!cardWidth || containerWidth <= 0) return;

    // Kaarten worden NOOIT smaller gemaakt om te passen -- enkel meer
    // overlap. minVisible is dus bewust klein: net genoeg rand (met de
    // rotatie per kaart) om uit te nodigen tot hoveren/swipen.
    var minVisible = remToPx(0.65);
    var maxOverlap = Math.max(0, cardWidth - minVisible);
    // Bij weinig kaarten in een brede rij: hoeveel tussenruimte (negatieve
    // overlap) mag er hoogstens tussen twee kaarten komen? Zonder grens
    // zouden bv. 2 kaarten in een erg brede rij ver uit elkaar getrokken
    // worden om de breedte te vullen -- dat oogt niet meer als een stapel.
    var maxGap = remToPx(2);

    var neededOverlap = cardWidth - (containerWidth - cardWidth) / (n - 1);
    var overlap = Math.max(-maxGap, Math.min(neededOverlap, maxOverlap));

    cardsEl.style.setProperty('--mymmo-ev-row-overlap', overlap + 'px');
  }

  // Geeft { showOn, hide } terug zodat zowel hover (desktop) als swipe
  // (touch) hetzelfde gedeelde pointer-element kunnen aansturen i.p.v. elk
  // hun eigen kopie te bouwen.
  function rowPointerController(row) {
    var pointer = row.querySelector('.mymmo-ev-row__pointer');
    if (!pointer) return null;

    var showTimer = null;

    function showOn(card) {
      window.clearTimeout(showTimer);
      pointer.classList.remove('is-visible');
      showTimer = window.setTimeout(function () {
        if (pointer.parentElement !== card) {
          card.appendChild(pointer);
        }
        // Herstart de animatie ook als hij toevallig al liep.
        pointer.classList.remove('is-visible');
        void pointer.offsetWidth;
        pointer.classList.add('is-visible');
      }, 500);
    }

    function hide() {
      window.clearTimeout(showTimer);
      pointer.classList.remove('is-visible');
    }

    return { showOn: showOn, hide: hide };
  }

  function rowPointerFollow(row, pointerCtrl) {
    var cards = row.querySelectorAll('.mymmo-ev-row__card');
    if (!pointerCtrl || !cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener('pointerenter', function () {
        pointerCtrl.showOn(card);
      });
      card.addEventListener('pointerleave', function () {
        pointerCtrl.hide();
      });
    });
  }

  // Touch zonder betrouwbare :hover: laat een horizontale swipe over de
  // kaartenrij het volgende/vorige kaartje actief maken (.is-active,
  // dezelfde CSS als :hover) en het pointer-tagje meeverhuizen. Kaartje 0
  // is standaard al volledig zichtbaar, dus de actieve index start op -1.
  function rowSwipeEnable(cardsEl, pointerCtrl) {
    var cards = cardsEl.querySelectorAll('.mymmo-ev-row__card');
    var n = cards.length;
    if (n < 2) return;

    var activeIndex = -1;
    var startX = 0;
    var startY = 0;
    var tracking = false;
    var horizontal = false;

    function setActive(index) {
      index = Math.max(-1, Math.min(n - 1, index));
      if (index === activeIndex) return;
      for (var i = 0; i < n; i++) {
        cards[i].classList.toggle('is-active', i === index);
      }
      activeIndex = index;
      if (!pointerCtrl) return;
      if (index >= 0) {
        pointerCtrl.showOn(cards[index]);
      } else {
        pointerCtrl.hide();
      }
    }

    cardsEl.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      horizontal = false;
    }, { passive: true });

    cardsEl.addEventListener('touchmove', function (e) {
      if (!tracking || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;
      if (!horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        horizontal = true;
      }
      // Zodra het duidelijk een horizontale swipe is: niet ook nog de
      // pagina laten scrollen (touch-action: pan-y in CSS laat verticaal
      // scrollen sowieso al toe voor swipes die dat niet zijn).
      if (horizontal && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    cardsEl.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (!horizontal) return;
      var touch = e.changedTouches && e.changedTouches[0];
      var dx = (touch ? touch.clientX : startX) - startX;
      var threshold = 30;
      if (dx <= -threshold) {
        setActive(activeIndex + 1);
      } else if (dx >= threshold) {
        setActive(activeIndex - 1);
      }
    });

    cardsEl.addEventListener('touchcancel', function () {
      tracking = false;
    });
  }

  var rowCardsEls = [];
  var rowGlobalsBound = false;

  function fitAllRows() {
    rowCardsEls.forEach(rowOverlapFit);
  }

  function initRows() {
    // Op mobiel blijft de compacte fan-kaartenrij volledig verborgen (CSS)
    // -- daar toont de rij dezelfde swipebare kaartenstapel als de
    // aankondiging, geinitialiseerd door initSwipeDecks(). Niets hieronder
    // is dan nodig (geen hover/fit-berekeningen op verborgen elementen).
    if (isDeckViewport()) return;

    var rows = document.querySelectorAll('.mymmo-ev-row');
    if (!rows.length) return;

    // pointer/coarse of ontouchstart: geen betrouwbare hover, dus swipe
    // aanbieden. Een check volstaat voor alle rijen op de pagina.
    var isTouch = ('ontouchstart' in window) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    rows.forEach(function (row) {
      var cardsEl = row.querySelector('.mymmo-ev-row__cards');
      if (!cardsEl) return;
      // Idempotent: de breakpoint-watcher hieronder kan dit opnieuw
      // aanroepen wanneer het venster van mobiel naar desktop wisselt.
      if (row.getAttribute('data-mymmo-row') !== 'ready') {
        row.setAttribute('data-mymmo-row', 'ready');
        var pointerCtrl = rowPointerController(row);
        rowPointerFollow(row, pointerCtrl);
        if (isTouch) {
          rowSwipeEnable(cardsEl, pointerCtrl);
        }
      }
      if (rowCardsEls.indexOf(cardsEl) === -1) {
        rowCardsEls.push(cardsEl);
      }
    });
    if (!rowCardsEls.length) return;

    fitAllRows();
    if (rowGlobalsBound) return;
    rowGlobalsBound = true;

    // Lettertype/afbeeldingen kunnen de gemeten breedte nog laten
    // verschuiven na de eerste (synchrone) meting -- en soms pas na de
    // load-event. Zonder vangnet bleven de kaarten dan fout gepositioneerd
    // tot de eerstvolgende toevallige reflow (bv. de eerste hover), wat
    // aanvoelde als een "sprong".
    window.addEventListener('load', fitAllRows);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitAllRows);
    }

    if (window.ResizeObserver) {
      var roTimer = null;
      var ro = new ResizeObserver(function () {
        window.clearTimeout(roTimer);
        roTimer = window.setTimeout(fitAllRows, 60);
      });
      rowCardsEls.forEach(function (el) { ro.observe(el); });
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(fitAllRows, 150);
    });
  }

  // Wisselt het venster van of naar de mobiele breedte, dan moet het andere
  // gedrag alsnog geinitialiseerd worden: initRows() slaat zichzelf over op
  // mobiel en initSwipeDecks() op desktop. Zonder deze watcher bleef wie na
  // de eerste render aan de andere kant belandde ongeinitialiseerd -- in
  // devtools de meest verwarrende variant (swipen deed niets tot een harde
  // refresh).
  function watchDeckBreakpoint() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(max-width: 40rem)');
    var onChange = function () {
      if (mq.matches) {
        initSwipeDecks();
      } else {
        initRows();
      }
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
    }
  }

  function boot() {
    focusFlash();
    guardForms();
    initComponents();
    keyboardNav();
    announcementHover();
    initRows();
    initSwipeDecks();
    watchDeckBreakpoint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
"""

content = content[:cut] + NEW_TAIL

out = content.encode('utf-8')
assert out.count(b'\r') == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

print('OK  regels voor=%d na=%d  (verwijderde tail=%d regels, nieuwe tail=%d regels)' % (
    before_lines, content.count('\n'), old_tail.count('\n'), NEW_TAIL.count('\n')))
sys.exit(0)
