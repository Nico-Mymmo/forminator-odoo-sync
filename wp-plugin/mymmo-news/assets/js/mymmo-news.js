/**
 * Mymmo News — gedrag.
 *
 * De eerste pagina staat al in de HTML (server-side gerenderd). Dit script
 * voegt alleen toe: filteren en bijladen. Valt het weg, dan blijft er een
 * volwaardige lijst staan -- dat is de reden dat de shortcode rendert en niet
 * enkel een leeg vlak neerzet.
 *
 * Er wordt hier GEEN HTML voor een kaart gebouwd. De server stuurt klaargemaakte
 * markup terug, want een tweede renderer in JavaScript loopt onvermijdelijk uit
 * de pas met die in PHP zodra er een nieuw soort item bijkomt -- en dat is
 * precies wat het renderer-register moet voorkomen.
 */

(function () {
  'use strict';

  /** Zolang dit loopt, geen tweede verzoek voor dezelfde feed. */
  var bezig = new WeakSet();

  /** De observer per feed, zodat haal() hem opnieuw kan aanzwengelen. */
  var kijkers = new WeakMap();

  /**
   * Een IntersectionObserver vuurt alleen bij een OVERGANG. Duwen de net
   * bijgeladen kaarten de sentinel niet uit beeld -- een korte pagina, een
   * groot scherm, of een batch die weinig hoogte oplevert -- dan blijft die
   * onafgebroken zichtbaar en komt er nooit een tweede callback. Het bijladen
   * lijkt dan gestopt terwijl er niets stuk is.
   *
   * Opnieuw observeren dwingt een verse callback af met de huidige stand.
   */
  function zwengelAan(feed) {
    var kijker = kijkers.get(feed);
    if (!kijker) return;
    kijker.observer.unobserve(kijker.sentinel);
    kijker.observer.observe(kijker.sentinel);
  }

  function qs(el, sel) { return el.querySelector(sel); }

  function stand(feed) {
    return {
      categories: feed.dataset.categories || '',
      tags: feed.dataset.tags || '',
      limit: parseInt(feed.dataset.limit, 10) || 12,
      offset: parseInt(feed.dataset.offset, 10) || 0,
      maand: feed.dataset.maand || '',
      layout: feed.dataset.layout || 'feed',
      endpoint: feed.dataset.endpoint || ''
    };
  }

  /**
   * De actieve filterkeuze uit de balk lezen.
   * De DOM is de bron: zo kan er geen tweede toestand naast staan die ermee
   * uit de pas loopt.
   */
  function gekozen(feed, soort) {
    var knop = feed.querySelector('[data-mymmo-news-filter="' + soort + '"].is-actief');
    return knop ? (knop.dataset.waarde || '') : '';
  }

  function zetBezig(feed, aan) {
    var lijst = qs(feed, '[data-mymmo-news-list]');
    var knop = qs(feed, '[data-mymmo-news-meer]');
    if (lijst) lijst.setAttribute('aria-busy', aan ? 'true' : 'false');
    if (knop) {
      knop.disabled = aan;
      var spin = qs(knop, '.mymmo-news-spinner');
      if (spin) spin.hidden = !aan;
    }
  }

  /**
   * Berichten ophalen.
   *
   * @param vervang true = de lijst leegmaken (na een filterwijziging),
   *                false = eronder plakken (bijladen)
   */
  async function haal(feed, vervang) {
    if (bezig.has(feed)) return;
    bezig.add(feed);
    zetBezig(feed, true);

    var s = stand(feed);
    var lijst = qs(feed, '[data-mymmo-news-list]');
    var meer = qs(feed, '[data-mymmo-news-meer]');
    var leeg = qs(feed, '[data-mymmo-news-leeg]');

    // Een gekozen filter WINT van wat er in de shortcode staat, behalve dat
    // de shortcode-categorieen de buitengrens blijven: je kan met de balk
    // niet buiten de feed filteren waar je op staat.
    var typeKeuze = gekozen(feed, 'type');
    var tagKeuze = gekozen(feed, 'tag');

    var params = new URLSearchParams();
    params.set('categories', typeKeuze || s.categories);
    var tags = [];
    if (s.tags) tags = s.tags.split(',').filter(Boolean);
    if (tagKeuze) tags.push(tagKeuze);
    if (tags.length) params.set('tags', tags.join(','));
    params.set('limit', String(s.limit));
    params.set('offset', String(vervang ? 0 : s.offset));
    params.set('layout', s.layout);
    // Bij VERVANGEN begint de lijst opnieuw, dus ook de maandopschriften.
    params.set('prev_month', vervang ? '' : s.maand);

    try {
      var res = await fetch(s.endpoint + '?' + params.toString(), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (vervang && lijst) lijst.innerHTML = '';

      if (lijst && data.html) {
        var houder = document.createElement('div');
        houder.innerHTML = data.html;
        // slice() eerst: `children` is een LIVE HTMLCollection, en
        // appendChild HAALT de node uit `houder`. Tijdens de lus schuift de
        // collectie dus op en wordt elk tweede element overgeslagen -- de
        // helft van de kaarten kwam nooit op het scherm, terwijl de teller
        // wel doorliep. Met maandopschriften ertussen (kop, kaart, kaart)
        // werd dat pas echt zichtbaar.
        var nieuwe = Array.prototype.slice.call(houder.children);
        nieuwe.forEach(function (kaart) {
          kaart.classList.add('mymmo-news-card--nieuw');
          lijst.appendChild(kaart);
        });
      }

      feed.dataset.offset = String(
        vervang ? (data.count || 0) : (data.offset || s.offset)
      );

      if (typeof data.last_month === 'string') feed.dataset.maand = data.last_month;

      if (meer) meer.hidden = !data.has_more;
      if (leeg) leeg.hidden = !(lijst && lijst.children.length === 0);

      if (data.has_more) zwengelAan(feed);
    } catch (e) {
      // Bijladen dat mislukt mag nooit de lijst wissen die er al staat.
      // De knop blijft zichtbaar, zodat de lezer het opnieuw kan proberen.
      if (window.console && window.console.warn) {
        window.console.warn('[mymmo-news] bijladen mislukt:', e.message);
      }
      if (meer) {
        var label = qs(meer, '[data-mymmo-news-meer-label]');
        if (label) label.textContent = 'Opnieuw proberen';
        meer.hidden = false;
      }
    } finally {
      bezig.delete(feed);
      zetBezig(feed, false);
    }
  }

  /** Een chip aan- of uitzetten. Eén keuze per rij, zoals een radio. */
  function zetFilter(feed, soort, waarde) {
    var knoppen = feed.querySelectorAll('[data-mymmo-news-filter="' + soort + '"]');
    Array.prototype.forEach.call(knoppen, function (knop) {
      var aan = (knop.dataset.waarde || '') === waarde;
      knop.classList.toggle('is-actief', aan);
      knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
    });
  }

  function koppel(feed) {
    feed.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-mymmo-news-filter]');
      if (chip && feed.contains(chip)) {
        var soort = chip.dataset.mymmoNewsFilter;
        var waarde = chip.dataset.waarde || '';
        // Nog eens op de actieve chip klikken zet hem uit -- anders kan je
        // een filter niet meer weghalen zonder "Alles" te zoeken.
        if (chip.classList.contains('is-actief') && waarde !== '') waarde = '';
        zetFilter(feed, soort, waarde);
        haal(feed, true);
        return;
      }

      var label = e.target.closest('[data-mymmo-news-label]');
      if (label && feed.contains(label)) {
        // Een label op een kaart aanklikken stuurt de filterbalk. Werkt die
        // balk niet (filters="none"), dan gebeurt er niets -- geen halve
        // toestand waarin er wel gefilterd is maar niets dat toont waarop.
        var slug = label.dataset.mymmoNewsLabel || '';
        if (!feed.querySelector('[data-mymmo-news-filter="tag"]')) return;
        zetFilter(feed, 'tag', slug);
        haal(feed, true);
        feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      var meer = e.target.closest('[data-mymmo-news-meer]');
      if (meer && feed.contains(meer)) {
        var lbl = qs(meer, '[data-mymmo-news-meer-label]');
        if (lbl) lbl.textContent = 'Meer berichten';
        haal(feed, false);
      }
    });

    // Bijladen bij scrollen. De KNOP blijft de echte besturing: dit is er
    // alleen bovenop, want een lijst die enkel met scrollen groeit is niet
    // bedienbaar met een toetsenbord.
    var sentinel = qs(feed, '[data-mymmo-news-sentinel]');
    if (sentinel && feed.dataset.autoload === '1' && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var knop = qs(feed, '[data-mymmo-news-meer]');
          if (entry.isIntersecting && knop && !knop.hidden && !knop.disabled) {
            haal(feed, false);
          }
        });
      }, { rootMargin: '600px 0px' });
      kijkers.set(feed, { observer: observer, sentinel: sentinel });
      observer.observe(sentinel);
    }
  }

  function start() {
    var feeds = document.querySelectorAll('[data-mymmo-news]');
    Array.prototype.forEach.call(feeds, koppel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
