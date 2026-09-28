/**
 * De keienwolk: parallax voor alles met een data-snelheid.
 *
 * Het ZWEVEN is CSS; dit script doet enkel het voorbijschuiven. Per element
 * wordt een CSS-variabele gezet (--mk-p), nooit een transform: de stylesheet
 * bepaalt HOE die verschuiving toegepast wordt (op een keitje samen met het
 * centreren, op een kei alleen). Twee plekken die allebei een transform
 * schrijven, overschrijven elkaar.
 *
 * Het rekenwerk (1.8.2):
 *   - RUSTZONE: zolang het midden van de wolk binnen RUST x schermhoogte van
 *     het midden van het scherm staat, ligt alles precies waar het in de editor
 *     staat. Een keitje hoort tegen de keien aan te liggen terwijl je ernaar
 *     kijkt; het schuift pas weg als de wolk het scherm in- of uitgaat.
 *   - BEGRENSD: de uitslag loopt met een tanh naar hoogstens MAX_PX x snelheid
 *     -- zacht afgeremd, geen harde stop. De snelheid (0-100) rekent de server
 *     uit uit maat en laag: groot en vooraan = sneller.
 *   - Alles dezelfde kant op: onder het midden hangt een keitje iets lager, en
 *     haalt dus in als je naar beneden scrolt.
 *
 * Wie beweging uit heeft staan (prefers-reduced-motion), krijgt niets: geen
 * script, en de CSS zet de zweefanimaties uit.
 */
(function () {
  'use strict';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Het ademen van een kei is SMIL (<animate>), en SMIL luistert niet naar
    // prefers-reduced-motion. Weghalen zet het pad terug op zijn eerste vorm.
    var stil = function () {
      Array.prototype.forEach.call(document.querySelectorAll('.mymmo-kei-vlak animate'), function (a) {
        a.parentNode.removeChild(a);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', stil);
    } else {
      stil();
    }
    return;
  }

  var MAX_PX = 70;    // uitslag bij snelheid 100, helemaal aan de rand van het scherm
  var RUST = 0.22;    // rustzone: deel van de schermhoogte boven en onder het midden
  var BOCHT = 0.45;   // hoe snel de uitslag daarna oploopt (deel van de schermhoogte)
  var wolken = [];
  var gepland = false;

  function verzamel() {
    var lijst = document.querySelectorAll('[data-mymmo-keien]');
    Array.prototype.forEach.call(lijst, function (wolk) {
      if (wolk.__mymmoKeien) {
        return;
      }
      wolk.__mymmoKeien = true;

      var sterkte = parseFloat(wolk.getAttribute('data-parallax'));
      if (isNaN(sterkte)) {
        sterkte = 1;
      }
      if (sterkte === 0) {
        return;
      }

      var items = [];
      Array.prototype.forEach.call(wolk.querySelectorAll('[data-snelheid]'), function (el) {
        var s = parseFloat(el.getAttribute('data-snelheid'));
        if (s) {
          items.push({ el: el, s: s });
        }
      });
      if (!items.length) {
        return;
      }

      var rij = { wolk: wolk, sterkte: sterkte, items: items, zichtbaar: true };
      wolken.push(rij);

      if ('IntersectionObserver' in window) {
        rij.zichtbaar = false;
        new IntersectionObserver(function (waarnemingen) {
          waarnemingen.forEach(function (w) {
            rij.zichtbaar = w.isIntersecting;
          });
          plan();
        }, { rootMargin: '300px 0px' }).observe(wolk);
      }
    });
  }

  function plan() {
    if (!gepland) {
      gepland = true;
      window.requestAnimationFrame(teken);
    }
  }

  function teken() {
    gepland = false;
    var hoogte = window.innerHeight || document.documentElement.clientHeight;
    // Op een telefoon is de wolk smal en hoog: minder uitslag, anders schuiven
    // de keitjes over de tekst van de keien.
    var klein = (window.innerWidth || 1024) <= 640 ? 0.55 : 1;

    wolken.forEach(function (rij) {
      if (!rij.zichtbaar) {
        return;
      }
      var r = rij.wolk.getBoundingClientRect();
      var afstand = (r.top + r.height / 2) - hoogte / 2;
      // Binnen de rustzone 0; daarbuiten loopt het zacht op tot 1 (of -1).
      var buiten = Math.max(0, Math.abs(afstand) - hoogte * RUST);
      var mate = (afstand < 0 ? -1 : 1) * Math.tanh(buiten / (hoogte * BOCHT));

      rij.items.forEach(function (item) {
        var p = mate * MAX_PX * (item.s / 100) * rij.sterkte * klein;
        item.el.style.setProperty('--mk-p', p.toFixed(1) + 'px');
      });
    });
  }

  function start() {
    verzamel();
    plan();
  }

  window.addEventListener('scroll', plan, { passive: true });
  window.addEventListener('resize', plan);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
