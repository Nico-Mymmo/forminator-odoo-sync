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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      focusFlash(); guardForms(); initComponents(); keyboardNav();
    });
  } else {
    focusFlash(); guardForms(); initComponents(); keyboardNav();
  }
})();
