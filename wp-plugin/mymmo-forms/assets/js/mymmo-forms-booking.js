/**
 * Mymmo Forms -- afspraaklinks (?afspraak=<sleutel>).
 *
 * De pagina is voor iedereen gelijk (zie class-booking.php): er staat een dicht
 * venster met de ALGEMENE agenda. Dit script leest de sleutel uit de adresbalk,
 * vraagt de persoonlijke agenda op, zet die in het venster en opent het dan.
 *
 * Het verwisselen gebeurt VOOR het openen: mymmo-forms-modal.js bouwt de
 * Calendly-kalender pas op bij het openen, uit data-mymmo-calendly. Is die al
 * geladen (kan niet, het venster was dicht), dan blijft de algemene agenda.
 *
 * Lukt het opzoeken niet binnen vier seconden, of bestaat de sleutel niet,
 * dan opent het venster gewoon met de algemene agenda: wie op "maak een
 * afspraak" klikte, moet iets kunnen boeken.
 */
(function () {
  'use strict';

  var cfg = window.MymmoFormsBooking || {};
  var WACHT_MS = 4000;

  function sleutel() {
    var ruw;
    try {
      ruw = new URLSearchParams(window.location.search).get(cfg.param || 'afspraak');
    } catch (e) {
      return '';
    }
    ruw = String(ruw || '').trim().toLowerCase();
    return /^[a-z0-9-]{3,60}$/.test(ruw) ? ruw : '';
  }

  function zetAgenda(venster, link) {
    var vlak = venster.querySelector('[data-mymmo-calendly]');
    if (!vlak || vlak.getAttribute('data-mymmo-geladen') === '1') return;
    // Zelfde grens als de server: alleen een boekingspagina van Calendly.
    if (!/^https:\/\/calendly\.com\/[^\s"'<>]+$/.test(String(link.url || ''))) return;

    vlak.setAttribute('data-mymmo-calendly', link.url);
    var terugval = vlak.querySelector('.mymmo-modal-agenda-link');
    if (terugval) terugval.setAttribute('href', link.url);

    if (link.tab_title) {
      var label = venster.querySelector('.mymmo-modal-tab[data-mymmo-tab="calendly"] .mymmo-modal-tab-label');
      if (label) label.textContent = link.tab_title;
      var paneel = venster.querySelector('[data-mymmo-paneel="calendly"]');
      var titel = paneel ? paneel.querySelector('.mymmo-modal-paneel-titel') : null;
      if (titel) titel.textContent = link.tab_title;
      zetTekst(venster.querySelector('[data-mymmo-afspraak="titel"]'), link.tab_title);
    }

    if (link.intro) zetTekst(venster.querySelector('[data-mymmo-afspraak="intro"]'), link.intro);
    if (link.points && link.points.length) zetPunten(venster.querySelector('[data-mymmo-afspraak="punten"]'), link.points);
    zetFoto(venster, link);
    ruimZijkolomOp(venster);
  }

  function zetTekst(el, tekst) {
    if (!el) return;
    el.textContent = String(tekst);
    el.hidden = false;
  }

  /**
   * De vinkjes van de link VERVANGEN die van de opstelling -- aanvullen zou
   * een lijst van twee bronnen geven die niemand zo geschreven heeft. Met
   * createElement en textContent: de tekst komt van buiten.
   */
  function zetPunten(ul, punten) {
    if (!ul) return;
    var model = ul.querySelector('svg');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    punten.slice(0, 6).forEach(function (tekst) {
      var li = document.createElement('li');
      li.className = 'mymmo-modal-punt';
      if (model) li.appendChild(model.cloneNode(true));
      else li.appendChild(vinkje());
      var span = document.createElement('span');
      span.textContent = String(tekst);
      li.appendChild(span);
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  function vinkje() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var pad = document.createElementNS(ns, 'path');
    pad.setAttribute('d', 'M4 10.5l4 4 8-9');
    pad.setAttribute('fill', 'none');
    pad.setAttribute('stroke', 'currentColor');
    pad.setAttribute('stroke-width', '2');
    pad.setAttribute('stroke-linecap', 'round');
    pad.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pad);
    return svg;
  }

  /**
   * De foto van de collega in de kop. Met een foto valt de tekening van de
   * opstelling weg (klasse is-persoon): twee beelden naast elkaar vechten om
   * aandacht, en de persoon is waarvoor iemand deze link kreeg.
   */
  function zetFoto(venster, link) {
    var img = venster.querySelector('[data-mymmo-afspraak="foto"]');
    var foto = String(link.photo || '');
    if (!img || !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+\/]+=*$/.test(foto)) return;
    img.src = foto;
    img.alt = link.name ? String(link.name) : '';
    img.hidden = false;
    var paneel = venster.querySelector('.mymmo-modal-panel');
    if (paneel) paneel.classList.add('is-persoon');
  }

  /**
   * Staat er niets meer in de zijkolom (geen subtekst, geen vinkjes, en de
   * tekening weg voor de foto), dan geen lege kolom van 280px naast de agenda.
   */
  function ruimZijkolomOp(venster) {
    var paneel = venster.querySelector('.mymmo-modal-panel--afspraak');
    var aside = paneel ? paneel.querySelector('.mymmo-modal-aside') : null;
    if (!aside) return;
    var intro = aside.querySelector('[data-mymmo-afspraak="intro"]');
    var punten = aside.querySelector('[data-mymmo-afspraak="punten"]');
    var figuur = aside.querySelector('.mymmo-modal-figuur');
    var leeg = (!intro || intro.hidden) && (!punten || punten.hidden)
      && (!figuur || paneel.classList.contains('is-persoon'));
    aside.hidden = leeg;
    paneel.classList.toggle('mymmo-modal-panel--zijkolom', !leeg);
    paneel.classList.toggle('mymmo-modal-panel--kaal', leeg);
  }

  /**
   * Openen via de weg die mymmo-forms-modal.js al kent: een klik op een
   * element met data-mymmo-modal-open. Zo loopt alles (focus, tabblad,
   * agenda laden, venster naar <body>) langs precies dezelfde code.
   */
  function open(venster) {
    var knop = document.createElement('a');
    knop.href = '#' + venster.id;
    knop.setAttribute('data-mymmo-modal-open', venster.id);
    knop.hidden = true;
    document.body.appendChild(knop);
    knop.click();
    document.body.removeChild(knop);
  }

  function start() {
    var slug = sleutel();
    if (!slug) return;
    var venster = document.getElementById(cfg.modal || 'mymmo-afspraak');
    if (!venster) return;

    var klaar = false;
    function afronden(link) {
      if (klaar) return;
      klaar = true;
      if (link && link.found) zetAgenda(venster, link);
      open(venster);
    }

    if (slug === (cfg.algemeen || 'algemeen') || !cfg.rest || !window.fetch) {
      afronden(null);
      return;
    }

    window.setTimeout(function () { afronden(null); }, WACHT_MS);
    window.fetch(cfg.rest + encodeURIComponent(slug), {
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { afronden(data); })
      .catch(function () { afronden(null); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
