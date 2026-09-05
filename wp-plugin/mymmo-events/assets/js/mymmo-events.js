/**
 * Mymmo Events — progressive enhancement.
 *
 * De kalender en de lijst werken volledig zonder JavaScript: de
 * maandnavigatie en de type-filter chips zijn gewone links
 * (?mymmo_month=, ?mymmo_type=). Dit bestand onderschept die klikken en
 * doet twee dingen zonder de pagina te herladen:
 *
 *  1. Type-filter chips: puur clientside. Elke vooraf gerenderde maand
 *     staat al volledig (ongefilterd, alle types) in de pagina -- een klik
 *     toont/verbergt gewoon wat er al staat, zonder enige serveraanvraag.
 *  2. Maandnavigatie: class-shortcodes.php rendert bij het laden van de
 *     pagina al ALLE maanden tot data-horizon-month mee (verborgen, op de
 *     huidige maand na, zie [data-month-slot] in calendar.php/list.php).
 *     Binnen dat bereik is bladeren dus pure DOM tonen/verbergen -- geen
 *     enkele aanvraag, geen wachttijd. Enkel ver buiten dat bereik (een
 *     zeldzaamheid) haalt dit alsnog één maand op via het REST-endpoint
 *     (class-rest.php) en wisselt het de inhoud van .mymmo-ev-inner; die
 *     opgehaalde maand wordt ook clientside gecached (60s, zelfde
 *     levensduur als de servercache) zodat snel heen-en-weer bladeren daar
 *     ook geen tweede aanvraag doet.
 *
 * Alles is per component gescoped (elke .mymmo-ev-calendar / .mymmo-ev-list
 * op de pagina heeft zijn eigen status en zijn eigen click-listener): een
 * kalender en een lijst naast elkaar op dezelfde pagina filteren en
 * bladeren onafhankelijk van elkaar.
 */
(function () {
  'use strict';

  var CACHE_MS = 60000;

  /**
   * 1. Na een inschrijving naar de melding scrollen en focus geven, zodat
   *    ook een screenreader de uitkomst voorleest.
   */
  function focusFlash() {
    var alert = document.querySelector('.mymmo-ev-alert');
    if (!alert) return;

    alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    alert.focus({ preventScroll: true });
  }

  /**
   * 2. Dubbel verzenden voorkomen. Zonder dit levert een tweede klik een
   *    "al ingeschreven"-fout op, wat er als een bug uitziet.
   */
  function guardForms() {
    document.querySelectorAll('.mymmo-ev-form').forEach(function (form) {
      form.addEventListener('submit', function () {
        var button = form.querySelector('button[type="submit"]');
        if (!button) return;
        button.disabled = true;
        button.dataset.label = button.textContent;
        button.textContent = 'Bezig…';
      });
    });
  }

  /** De actieve maand-slot (of, bij ontbreken daarvan, root zelf). */
  function activeSlot(root) {
    return root.querySelector('[data-month-slot]:not([hidden])') || root;
  }

  /**
   * Leest welke type-chips bij het laden al actief staan (standaard alles,
   * zie resolve_types() in class-shortcodes.php) in een per-component Set.
   * Elke maand-slot heeft zijn eigen kopie van de filterbalk (ze zijn
   * onafhankelijk vooraf gerenderd); ze staan bij het laden allemaal gelijk,
   * dus de eerste balk die er is volstaat om de startstatus te lezen.
   */
  function readFilterState(root) {
    var bar = root.querySelector('.mymmo-ev-typefilter');
    var state = { hasFilter: !!bar, activeTypes: new Set() };
    if (bar) {
      bar.querySelectorAll('.mymmo-ev-chipfilter.is-active[data-type-id]').forEach(function (chip) {
        state.activeTypes.add(chip.getAttribute('data-type-id'));
      });
    }
    return state;
  }

  /**
   * Chips visueel laten kloppen met de huidige (clientside) selectie --
   * over ALLE maand-slots heen (elk heeft zijn eigen filterbalk), zodat de
   * selectie ook meteen klopt zodra je naar een andere maand-slot wisselt.
   */
  function syncChips(root, state) {
    root.querySelectorAll('.mymmo-ev-typefilter').forEach(function (bar) {
      bar.querySelectorAll('.mymmo-ev-chipfilter[data-type-id]').forEach(function (chip) {
        var active = state.activeTypes.has(chip.getAttribute('data-type-id'));
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  }

  /**
   * Toont/verbergt de al aanwezige events/kaarten op basis van de huidige
   * selectie -- geen netwerkaanvraag, alleen DOM. Werkt op zowel de
   * kalenderchips (per dag) als de lijstkaarten. Per maand-slot toegepast
   * (of op root zelf, als er geen slots zijn -- bv. de REST-fallback): elke
   * maand telt zijn eigen leeg/gevuld-status, anders zou "geen resultaten"
   * in de ene maand verkeerd meetellen met events in een andere.
   */
  function applyVisibility(root, state) {
    if (!state.hasFilter) return;

    var slots = root.querySelectorAll('[data-month-slot]');
    var scopes = slots.length ? slots : [root];

    scopes.forEach(function (scope) {
      var items = scope.querySelectorAll('[data-type-id]:not(.mymmo-ev-chipfilter)');
      var visibleCount = 0;

      items.forEach(function (item) {
        var show = state.activeTypes.size > 0 && state.activeTypes.has(item.getAttribute('data-type-id'));
        item.hidden = !show;
        if (show) visibleCount += 1;
      });

      scope.querySelectorAll('[data-mymmo-day]').forEach(function (day) {
        day.classList.toggle('has-events', !!day.querySelector('.mymmo-ev-chip:not([hidden])'));
      });

      var defaultEmpty = scope.querySelector('[data-mymmo-empty-default]');
      var filteredEmpty = scope.querySelector('[data-mymmo-empty-filtered]');
      var totalItems = items.length;

      if (filteredEmpty) {
        filteredEmpty.hidden = !(totalItems > 0 && visibleCount === 0);
      }
      if (defaultEmpty && totalItems > 0) {
        defaultEmpty.hidden = true;
      }
    });
  }

  /**
   * 3. Eén kalender- of lijstcomponent: maandwissel + type-filter, allebei
   *    zonder de pagina te herladen. Bij een fout (netwerk, onverwacht
   *    antwoord) valt dit terug op de gewone link -- die blijft altijd
   *    werken, JS of niet.
   */
  function initComponent(root) {
    var kind = root.getAttribute('data-mymmo-component');
    var restUrl = root.getAttribute('data-rest-url');
    var inner = root.querySelector('.mymmo-ev-inner');
    if (!inner || !restUrl || (kind !== 'calendar' && kind !== 'list')) return;

    var cache = Object.create(null);
    var filterState = readFilterState(root);

    function paramsFor(month) {
      var params = new URLSearchParams();
      params.set('month', month);

      var format = root.getAttribute('data-format');
      if (format) params.set('format', format);

      var typeLock = root.getAttribute('data-type');
      if (typeLock) params.set('type', typeLock);

      if (kind === 'list') {
        params.set('layout', root.getAttribute('data-layout') || 'rows');
        params.set('show_past', root.getAttribute('data-show-past') === '1' ? '1' : '0');
      }

      return params.toString();
    }

    /** Instant wissel: de maand staat al klaar in een [data-month-slot]. */
    function showSlot(month) {
      var target = inner.querySelector('[data-month-slot="' + month + '"]');
      if (!target) return false;

      inner.querySelectorAll('[data-month-slot]').forEach(function (slot) {
        slot.hidden = slot !== target;
      });
      root.setAttribute('data-month', month);
      syncChips(root, filterState);
      applyVisibility(root, filterState);
      return true;
    }

    /** Vangnet buiten het vooraf gerenderde bereik: vervangt .mymmo-ev-inner. */
    function swapFetched(month, html) {
      inner.innerHTML = html;
      root.setAttribute('data-month', month);
      syncChips(root, filterState);
      applyVisibility(root, filterState);
    }

    function goToMonth(month, fallbackHref) {
      if (!month || month === root.getAttribute('data-month')) return;

      // Binnen het vooraf gerenderde bereik: gewoon tonen, geen aanvraag.
      if (showSlot(month)) return;

      var cached = cache[month];
      if (cached && (Date.now() - cached.at) < CACHE_MS) {
        swapFetched(month, cached.html);
        return;
      }

      fetch(restUrl + '?' + paramsFor(month), { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('mymmo-events: ' + response.status);
          return response.json();
        })
        .then(function (json) {
          if (!json || typeof json.html !== 'string') throw new Error('mymmo-events: onverwacht antwoord');
          cache[month] = { html: json.html, at: Date.now() };
          swapFetched(json.month || month, json.html);
        })
        .catch(function () {
          // Vangnet: de link zelf werkt nog altijd (?mymmo_month=...).
          if (fallbackHref) window.location.href = fallbackHref;
        });
    }

    root.addEventListener('click', function (event) {
      var monthLink = event.target.closest('a[data-month]');
      if (monthLink && root.contains(monthLink)) {
        event.preventDefault();
        goToMonth(monthLink.getAttribute('data-month'), monthLink.href);
        return;
      }

      var chip = event.target.closest('.mymmo-ev-chipfilter[data-type-id]');
      if (chip && root.contains(chip)) {
        event.preventDefault();
        var id = chip.getAttribute('data-type-id');
        if (filterState.activeTypes.has(id)) {
          filterState.activeTypes.delete(id);
        } else {
          filterState.activeTypes.add(id);
        }
        syncChips(root, filterState);
        applyVisibility(root, filterState);
      }
    });

    // Eerste toepassing: bij een deeplink met ?mymmo_type= staat de
    // serverkant al goed, maar zonder dit blijven kalenderdagen met enkel
    // uitgefilterde events toch als "has-events" ogen. Geldt voor alle
    // vooraf gerenderde maand-slots tegelijk.
    applyVisibility(root, filterState);
  }

  function initComponents() {
    document.querySelectorAll('.mymmo-ev-calendar, .mymmo-ev-list').forEach(initComponent);
  }

  /**
   * 4. Maandnavigatie met de pijltjestoetsen voor de kalender die in beeld
   *    is. Puur comfort; de knoppen (en dus ook de links) blijven het
   *    echte mechanisme. Bij meerdere kalenders op één pagina reageert
   *    enkel diegene die zichtbaar is in de viewport, en binnen die
   *    kalender enkel de zichtbare maand-slot (de andere slots bevatten
   *    ook prev/next-links, maar dan voor een verborgen maand).
   */
  function keyboardNav() {
    var calendars = document.querySelectorAll('.mymmo-ev-calendar');
    if (!calendars.length) return;

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      var tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      var selector = event.key === 'ArrowLeft'
        ? 'a[rel="prev"]'
        : (event.key === 'ArrowRight' ? 'a[rel="next"]' : null);
      if (!selector) return;

      for (var i = 0; i < calendars.length; i += 1) {
        var calendar = calendars[i];
        var rect = calendar.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

        var link = activeSlot(calendar).querySelector(selector);
        if (link) {
          event.preventDefault();
          link.click();
        }
        break;
      }
    });
  }

  /**
   * 5. Aankondiging: bij hover van de bovenste kaart draait de pijl+label-
   *    groep licht mee, met een pivot op het gemeten middelpunt van de
   *    kaart (fluid-width, dus geen vaste CSS-transform-origin mogelijk --
   *    zie het commentaar bij .mymmo-ev-announce__pointer in
   *    mymmo-events.css). De ghost-kaartjes achter de kaart bewegen
   *    tegelijk zeer licht mee via een modifier-klasse op de deck (de
   *    eigenlijke beweging staat in CSS, hier enkel de klasse). Elke
   *    .mymmo-ev-announce op de pagina wordt onafhankelijk
   *    geïnitialiseerd.
   */
  function announcementHover() {
    var announces = document.querySelectorAll('.mymmo-ev-announce');
    if (!announces.length) return;

    announces.forEach(function (announce) {
      var card = announce.querySelector('.mymmo-ev-announce__card');
      var deck = announce.querySelector('.mymmo-ev-announce__deck');
      var pointer = announce.querySelector('.mymmo-ev-announce__pointer');
      if (!card || !deck) return;

      card.addEventListener('mouseenter', function () {
        deck.classList.add('mymmo-ev-announce__deck--hover');
        if (!pointer) return;

        // De pijl is display:none onder de 34rem-breakpoint (zie CSS) --
        // reken dan niets uit, de rect zou toch leeg/irrelevant zijn.
        if (pointer.offsetParent === null) return;

        var cardRect = card.getBoundingClientRect();
        var pointerRect = pointer.getBoundingClientRect();
        var originX = (cardRect.left + cardRect.width / 2) - pointerRect.left;
        var originY = (cardRect.top + cardRect.height / 2) - pointerRect.top;

        pointer.style.transformOrigin = originX + 'px ' + originY + 'px';
        pointer.classList.add('mymmo-ev-announce__pointer--hover');
      });

      card.addEventListener('mouseleave', function () {
        deck.classList.remove('mymmo-ev-announce__deck--hover');
        if (pointer) pointer.classList.remove('mymmo-ev-announce__pointer--hover');
      });
    });
  }

  /**
   * 5b. Swipeable deck (mobiel): [mymmo_events_row] en
   *    [mymmo_events_announcement] tonen op mobiel maar één kaart
   *    volledig, met de volgende erachter -- swipe naar links toont het
   *    volgende event, naar rechts het vorige (cyclisch: na de laatste
   *    begint de stapel weer vooraan, zodat terugswipen altijd iets
   *    oplevert). Werkt met Pointer Events (muis + touch in één) en telt
   *    een sleep pas als "swipe" zodra die overwegend horizontaal is --
   *    verticaal blijft de pagina gewoon scrollen. Een gewone tik (geen
   *    duidelijke sleep) laat de normale klik/link-navigatie van de kaart
   *    intact: er wordt nergens preventDefault() aangeroepen vóór de
   *    sleep als "horizontaal" herkend is.
   *
   *    isDeckViewport() bepaalt de knip tussen desktop (elk component zijn
   *    eigen bestaande layout, ongewijzigd) en mobiel (dit gedeelde deck) --
   *    dezelfde 40rem-breakpoint die de rij al langer gebruikte voor haar
   *    eigen mobiele aanpassingen.
   */
  function isDeckViewport() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 40rem)').matches);
  }

  /**
   * 5b-init. De volledige, swipebare kaartenstapel (mobiel) voor zowel
   * [mymmo_events_row] als [mymmo_events_announcement]: beide shortcodes
   * renderen op mobiel een eigen `.mymmo-ev-swipestack`-container met
   * daarin telkens ECHTE kaarten (`.mymmo-ev-deck-card`, zie
   * templates/row.php en templates/announcement.php) -- geen decoratieve
   * placeholders zoals de desktop-ghosts. Elke kaart is dus gewoon een
   * normale kaart met eigen links/knoppen, dus is er geen aparte
   * tik-afhandeling nodig: een gewone tik laat de native link-navigatie
   * van de kaart intact (zie initSwipeDeck() hierboven).
   */
  function initSwipeDecks() {
    if (!isDeckViewport()) return;
    var stacks = document.querySelectorAll('.mymmo-ev-swipestack');
    if (!stacks.length) return;
    stacks.forEach(function (stack) {
      initSwipeDeck(stack);
    });

    function equalizeAll() {
      stacks.forEach(equalizeDeckCardHeights);
    }
    window.addEventListener('load', equalizeAll);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(equalizeAll);
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(equalizeAll, 150);
    });
  }

  /**
   * Meet na render de natuurlijke (ongeclampte hoogte-beperking van
   * height/overflow terzijde) inhoud-hoogte van elke kaart in de stapel
   * en zet het maximum als CSS-variabele op de container -- elke kaart
   * (ook de geabsoluteerde erachter, via inset:0 + CSS var(...)) krijgt zo
   * exact dezelfde hoogte, in plaats van dat de kortste kaart de hoogte
   * van de container bepaalt en de langere kaartjes erachter zichtbaar
   * "afgekapt" worden (zie mymmo-events.css, .mymmo-ev-deck-mode
   * .mymmo-ev-deck-card). scrollHeight geeft de volledige inhoudshoogte
   * terug, ook als CSS die met overflow/height al aan het inperken is --
   * de var eerst verwijderen voorkomt dat een vorige (te kleine) meting
   * de nieuwe meting beïnvloedt, bv. na een resize met andere regelafbreking.
   */
  function equalizeDeckCardHeights(stack) {
    var cards = stack.querySelectorAll(':scope > .mymmo-ev-deck-card');
    if (!cards.length) return;
    stack.style.removeProperty('--mymmo-ev-deck-h');
    var max = 0;
    cards.forEach(function (card) {
      if (card.scrollHeight > max) max = card.scrollHeight;
    });
    if (max > 0) stack.style.setProperty('--mymmo-ev-deck-h', max + 'px');
  }

  function initSwipeDeck(container) {
    var cards = container.querySelectorAll(':scope > .mymmo-ev-deck-card');
    var n = cards.length;
    if (!n) return null;

    container.classList.add('mymmo-ev-deck-mode');

    var activeIndex = 0;
    var SWIPE_THRESHOLD = 70;

    function render() {
      for (var i = 0; i < n; i++) {
        var pos = (i - activeIndex + n) % n;
        cards[i].dataset.deckPos = pos <= 3 ? String(pos) : 'hidden';
      }
    }
    render();
    equalizeDeckCardHeights(container);

    if (n < 2) return { goNext: function () {}, goPrev: function () {} };

    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dragging = false;
    var horizontal = false;
    var decided = false;

    function activeCard() { return cards[activeIndex]; }

    function commit(direction) {
      var card = activeCard();
      var flyX = direction > 0 ? '-135%' : '135%';
      var flyRotate = direction > 0 ? -16 : 16;
      card.style.transform = 'translateX(' + flyX + ') rotate(' + flyRotate + 'deg)';
      card.style.opacity = '0';
      window.setTimeout(function () {
        card.style.transform = '';
        card.style.opacity = '';
        activeIndex = (activeIndex + direction + n) % n;
        render();
      }, 260);
    }

    function settle() {
      var card = activeCard();
      card.classList.remove('is-dragging');
      dragging = false;
      if (!horizontal) return;
      if (dx <= -SWIPE_THRESHOLD) {
        commit(1);
      } else if (dx >= SWIPE_THRESHOLD) {
        commit(-1);
      } else {
        card.style.transform = '';
      }
    }

    container.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var card = activeCard();
      if (!card.contains(e.target)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dragging = true;
      horizontal = false;
      decided = false;
    });

    container.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var moveX = e.clientX - startX;
      var moveY = e.clientY - startY;
      if (!decided) {
        if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
        decided = true;
        horizontal = Math.abs(moveX) > Math.abs(moveY);
        if (horizontal) {
          activeCard().classList.add('is-dragging');
          try { activeCard().setPointerCapture(pointerId); } catch (err) { /* niet kritiek */ }
        } else {
          dragging = false;
          return;
        }
      }
      if (!horizontal) return;
      dx = moveX;
      if (e.cancelable) e.preventDefault();
      activeCard().style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
    }, { passive: false });

    function onPointerEnd(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      settle();
    }
    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);

    return {
      goNext: function () { commit(1); },
      goPrev: function () { commit(-1); }
    };
  }

  /**
   * 6. Kaartenrij (mymmo_events_row): drie losse gedragingen die geen van
   *    alle met vaste CSS-waarden op te lossen zijn, want ze hangen af van
   *    dingen die pas na render bekend zijn (breedte, aantal kaarten, welk
   *    kaartje precies actief is) of van invoertype (muis vs. touch).
   *
   *    a) De kaarten overlappen bewust (zie .mymmo-ev-row__card), maar de
   *       rij mag NOOIT breder worden dan de beschikbare ruimte -- geen
   *       horizontale scrollbar. De kaarten worden daarvoor NOOIT smaller
   *       gemaakt (vaste width in CSS blijft vaste width): in plaats
   *       daarvan berekent rowOverlapFit() hier hoeveel de kaarten over
   *       elkaar moeten schuiven (zoals een pak kaarten) voor het aantal
   *       kaarten en de gemeten breedte, en zet dat als
   *       --mymmo-ev-row-overlap op de container. Zonder JS geldt gewoon
   *       de vaste CSS-fallback.
   *    b) Het "Schrijf je snel in!"-tagje bestaat maar één keer per rij en
   *       verhuist (DOM-reparent) naar het kaartje dat op dat moment actief
   *       is (gehoverd op desktop, of geswiped naar op mobiel) -- pas na
   *       500ms (zodat het niet meeflitst bij gewoon voorbijglijden) en
   *       met een cartoonachtige aanloop-animatie (zie @keyframes
   *       mymmoRowPointerPop in de CSS).
   *    c) Op mobiel/touch werkt :hover niet betrouwbaar (geen muis), dus
   *       rowSwipeEnable() laat een horizontale swipe over de rij het
   *       volgende/vorige kaartje "actief" maken (.is-active, zelfde CSS
   *       als :hover) i.p.v. te wachten op een hover die nooit komt.
   */
  function remToPx(rem) {
    var base = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return rem * (base || 16);
  }

  function rowOverlapFit(cardsEl) {
    var cards = cardsEl.querySelectorAll('.mymmo-ev-row__card');
    var n = cards.length;
    if (n < 2) return;

    var cardWidth = cards[0].getBoundingClientRect().width;
    var containerWidth = cardsEl.clientWidth;
    if (!cardWidth || !containerWidth) return;

    // Kaarten worden NOOIT smaller gemaakt om te passen -- enkel meer
    // overlap. minVisible is dus bewust klein: net genoeg rand (met de
    // rotatie per kaart) om uit te nodigen tot hoveren/swipen, geen
    // "leesbare" minimumbreedte meer zoals voorheen.
    var minVisible = remToPx(0.65);
    var maxOverlap = Math.max(0, cardWidth - minVisible);
    // Bij weinig kaarten in een brede rij: hoeveel tussenruimte (negatieve
    // overlap) mag er hoogstens tussen twee kaarten komen? Zonder grens
    // zou bv. 2 kaarten in een erg brede rij ver uit elkaar getrokken
    // worden om de breedte te vullen -- dat oogt niet meer als een stapel.
    var maxGap = remToPx(2);

    // Overlap (of, negatief, een tussenruimte) zodat n kaarten van
    // cardWidth precies containerWidth vullen -- zowel wanneer dat MEER
    // overlap vraagt (veel kaarten) als MINDER (weinig kaarten): de rij
    // vult zo altijd de volledige beschikbare breedte i.p.v. bij weinig
    // kaarten compact te blijven hangen met ruimte ongebruikt ernaast.
    var neededOverlap = cardWidth - (containerWidth - cardWidth) / (n - 1);

    var overlap = Math.max(-maxGap, Math.min(neededOverlap, maxOverlap));

    cardsEl.style.setProperty('--mymmo-ev-row-overlap', overlap + 'px');
  }

  // Geeft { showOn, hide } terug zodat zowel hover (desktop) als swipe
  // (mobiel, zie rowSwipeEnable) hetzelfde gedeelde pointer-element kunnen
  // aansturen i.p.v. elk hun eigen kopie te bouwen.
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

  // Mobiel/touch: geen betrouwbare :hover, dus laat een horizontale swipe
  // over de kaartenrij het volgende/vorige kaartje "actief" maken (.is-
  // active, dezelfde CSS als :hover) en het pointer-tagje meeverhuizen.
  // Kaartje 0 (bovenop de stapel) is standaard al volledig zichtbaar, dus
  // de actieve index start op -1 (niets actief); swipe naar links maakt
  // het eerstvolgende verborgen kaartje actief, swipe naar rechts gaat
  // terug.
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

  function initRows() {
    var rows = document.querySelectorAll('.mymmo-ev-row');
    if (!rows.length) return;

    // pointer/coarse of ontouchstart: geen betrouwbare hover, dus swipe
    // aanbieden. Eén check volstaat voor alle rijen op de pagina.
    var isTouch = ('ontouchstart' in window) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var deckMode = isDeckViewport();

    // Op mobiel (isDeckViewport()) blijft de compacte fan-kaartenrij
    // volledig verborgen (CSS) -- de swipebare kaartenstapel met dezelfde
    // look als de aankondiging (.mymmo-ev-row__deck) wordt apart
    // geïnitialiseerd door initSwipeDecks(). Niets hieronder is dan nog
    // nodig (geen hover/fit-berekeningen op verborgen elementen).
    if (deckMode) return;

    var cardsEls = [];
    rows.forEach(function (row) {
      var cardsEl = row.querySelector('.mymmo-ev-row__cards');
      if (!cardsEl) return;
      var pointerCtrl = rowPointerController(row);

      rowPointerFollow(row, pointerCtrl);
      cardsEls.push(cardsEl);
      if (isTouch) {
        rowSwipeEnable(cardsEl, pointerCtrl);
      }
    });
    if (!cardsEls.length) return;

    function fitAll() {
      cardsEls.forEach(rowOverlapFit);
    }

    fitAll();
    // Lettertype/afbeeldingen kunnen de gemeten breedte nog laten
    // verschuiven na de eerste (synchrone) meting -- en soms pas ná de
    // 'load'-event. Zonder vangnet bleven de kaarten dan fout
    // gepositioneerd tot de eerstvolgende toevallige reflow (bv. de
    // eerste hover), wat aanvoelde als een "sprong".
    window.addEventListener('load', fitAll);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitAll);
    }

    if (window.ResizeObserver) {
      var roTimer = null;
      var ro = new ResizeObserver(function () {
        window.clearTimeout(roTimer);
        roTimer = window.setTimeout(fitAll, 60);
      });
      cardsEls.forEach(function (el) { ro.observe(el); });
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(fitAll, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      focusFlash(); guardForms(); initComponents(); keyboardNav(); announcementHover(); initRows(); initSwipeDecks();
    });
  } else {
    focusFlash(); guardForms(); initComponents(); keyboardNav(); announcementHover(); initRows(); initSwipeDecks();
  }
})();
