/**
 * De kostencalculator op de pagina: min en plus.
 *
 * De server zette de beginstand al (zie class-kostencalculator.php); dit script
 * rekent enkel opnieuw als iemand het aantal kavels wijzigt. De prijzen leest
 * het van het blok zelf (`data-prijs`, `data-vast`), dus er staat hier geen
 * enkele prijs.
 *
 * De rekensom: (aantal × prijs per kavel + vaste kost) × 12, in centen, zodat
 * er geen 12,299999 op het scherm komt.
 *
 * Geen beweging: de cijfers springen meteen naar de nieuwe stand.
 */

(function () {
  'use strict';

  /** Zelfde regel als euro() in class-kostencalculator.php. */
  function euro(cent, altijd) {
    var decimalen = (altijd || cent % 100 !== 0) ? 2 : 0;
    var tekst = (cent / 100).toFixed(decimalen).split('.');
    tekst[0] = tekst[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return tekst.join(',');
  }

  function getal(waarde, terugval) {
    var g = parseFloat(waarde);
    return isNaN(g) ? terugval : g;
  }

  function zet(blok, naam, tekst) {
    var velden = blok.querySelectorAll('[data-kosten="' + naam + '"]');
    for (var i = 0; i < velden.length; i++) {
      velden[i].textContent = tekst;
    }
  }

  function start(blok) {
    if (blok.getAttribute('data-mymmo-kosten-klaar')) {
      return;
    }
    blok.setAttribute('data-mymmo-kosten-klaar', '1');

    var prijs = Math.round(getal(blok.getAttribute('data-prijs'), 0) * 100);
    var vast = Math.round(getal(blok.getAttribute('data-vast'), 0) * 100);
    var min = getal(blok.getAttribute('data-min'), 2);
    var max = getal(blok.getAttribute('data-max'), 200);
    var aantal = getal(blok.getAttribute('data-kavels'), min);

    var knoppen = blok.querySelectorAll('.mymmo-kosten-knop[data-stap]');

    function toon() {
      var maand = prijs * aantal + vast;
      var jaar = maand * 12;

      zet(blok, 'aantal', String(aantal));
      zet(blok, 'pakket', euro(prijs * aantal, false));
      zet(blok, 'maand', euro(maand, false));
      zet(blok, 'jaar', euro(jaar, false));
      zet(blok, 'kavel', euro(Math.round(jaar / aantal), true));

      for (var i = 0; i < knoppen.length; i++) {
        var stap = parseInt(knoppen[i].getAttribute('data-stap'), 10);
        knoppen[i].disabled = stap < 0 ? aantal <= min : aantal >= max;
      }
    }

    for (var i = 0; i < knoppen.length; i++) {
      knoppen[i].addEventListener('click', function (e) {
        var stap = parseInt(e.currentTarget.getAttribute('data-stap'), 10) || 0;
        aantal = Math.min(max, Math.max(min, aantal + stap));
        toon();
        // Een knop die net uitgeschakeld werd, verliest de focus: zet ze op
        // de andere, zodat wie met het toetsenbord werkt niet bovenaan belandt.
        if (e.currentTarget.disabled) {
          for (var j = 0; j < knoppen.length; j++) {
            if (!knoppen[j].disabled) {
              knoppen[j].focus();
              break;
            }
          }
        }
      });
    }

    toon();
  }

  function alles() {
    var blokken = document.querySelectorAll('[data-mymmo-kosten]');
    for (var i = 0; i < blokken.length; i++) {
      start(blokken[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alles);
  } else {
    alles();
  }
})();
