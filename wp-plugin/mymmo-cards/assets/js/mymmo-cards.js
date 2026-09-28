/**
 * Mymmo Cards — de beweging en de maatvoering.
 *
 * Twee taken, en geen enkele andere:
 *
 *   1. METEN. De kleefwiskunde in de CSS heeft twee hoogtes nodig die pas op de
 *      pagina bekend zijn: die van de kop en die van de hoogste kaart. Tot nu
 *      toe stonden die als vast getal in de stylesheet van één site (`--card:
 *      560px`), met de hand gelijk te houden aan de hoogste kaart. Dat is geen
 *      instelling maar een meetresultaat, dus wordt het hier gemeten.
 *
 *   2. KRIMPEN. Elke kaart die over een andere heen schuift, maakt die andere
 *      een beetje kleiner. Dat is wat een stapel een stapel maakt.
 *
 * DE KRIMP IS CUMULATIEF, EN DAT IS HET HELE EFFECT.
 * Een kaart krimpt met `STAP` voor ELKE kaart die er nog overheen komt, niet
 * alleen voor de eerstvolgende. Onderaan de stapel staat dus de kleinste kaart
 * en bovenaan de grootste, en de zichtbare randen lopen als een waaier uit
 * elkaar. Rekende je alleen met de volgende kaart, dan zijn alle randen even
 * breed en ziet de stapel er plat uit -- precies het verschil tussen de twee
 * schermafbeeldingen waarmee dit is bijgesteld.
 *
 * DE VOORTGANG WORDT GEMETEN AAN DE KLEEFPOSITIE, niet aan de overlap. Een
 * kaart is "aangekomen" zodra haar bovenrand haar eigen `top` bereikt; de
 * laatste `AANLOOP` pixels daarvoor lopen de krimp geleidelijk op. Dat is
 * dezelfde maat voor elke kaart, ongeacht hoe hoog ze is.
 *
 * GEEN TRANSFORM ZONDER KRIMP, en geen enkele transform op een kaart met een
 * venster erin. Een element met een transform wordt het referentiekader voor
 * `position: fixed` van alles wat erin staat -- ook voor `scale(1)`. Het
 * venster van Mymmo Forms zou dan niet meer over de pagina liggen maar in de
 * kaart gevangen zitten, en dat is niet te zien tot iemand op de knop drukt.
 * Om diezelfde reden staat er nergens in deze plugin `container-type` of
 * `contain` op een kaart: layout-containment doet hetzelfde.
 *
 * ZONDER DIT SCRIPT WERKT DE STAPEL. De CSS heeft voor beide hoogtes een
 * terugval; wat je dan verliest is de exacte pasvorm en de krimp, niet de
 * stapel zelf.
 */

(function () {
  'use strict';

  var STAPEL = '[data-mymmo-kaarten]';

  /* Hoeveel een kaart krimpt per kaart die eroverheen komt. */
  var STAP = 0.03;

  /* Over hoeveel pixels scrollen die krimp gebeurt, vlak voor een kaart haar
     kleefpositie bereikt. */
  var AANLOOP = 320;

  var stapels = [];
  var wachtend = false;
  var hertekenGepland = false;

  function lijst(wortel, kiezer) {
    return Array.prototype.slice.call(wortel.querySelectorAll(kiezer));
  }

  function magBewegen() {
    return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * De slots van een stapel, met per slot wat het script erover moet weten.
   *
   * `venster`: staat er een venster van Mymmo Forms in deze kaart? Dan blijft
   * ze van elke transform af -- zie de uitleg bovenaan.
   */
  function verzamel(stapel) {
    var ankers = lijst(stapel, '.mymmo-kaart-anker');

    return {
      el: stapel,
      slots: ankers,
      kaarten: ankers.map(function (anker) { return anker.firstElementChild; }),
      venster: ankers.map(function (anker) { return !!anker.querySelector('.mymmo-modal'); }),
      kop: (function () {
        var koppen = lijst(stapel, '.mymmo-kaarten-kop');
        return koppen.length ? koppen[0] : null;
      }())
    };
  }

  /**
   * De twee hoogtes meten en in de variabelen zetten.
   *
   * Meten gebeurt met de klasse `--meten`, die de kaarten even op hun
   * natuurlijke hoogte zet. Zonder dat meet je je eigen vorige antwoord: de
   * kaarten hebben op dat moment al `min-height: var(--mk-hoogte)` en de kop
   * `min-height: var(--mk-kop)`, dus de waarde zou alleen maar kunnen groeien.
   */
  function meet(stapel) {
    if (!stapel.kaarten.length) {
      return;
    }

    stapel.el.classList.add('mymmo-kaarten--meten');

    /*
     * EEN KAART IS MINSTENS ZO HOOG ALS ALLE KAARTEN VOOR HAAR. NIET HOGER.
     *
     * Een kier ontstaat doordat een kaart KORTER is dan de kaart die ze bedekt:
     * dan steekt die eronder uit en zie je hem als een streep onder de rand.
     * Wat een kaart doet die er LATER overheen komt, raakt haar niet -- die ligt
     * er straks bovenop.
     *
     * Vandaar een oplopend maximum in plaats van een gedeelde hoogte. Zonder
     * dat onderscheid rekt de hoogste kaart van de stapel alles op, ook de
     * kaarten die er ver voor liggen: bij een laatste kaart met een formulier
     * erin worden dan alle korte kaarten ervoor onnodig lang.
     */
    var hoogste = 0;
    stapel.slots.forEach(function (slot, i) {
      var kaart = stapel.kaarten[i];
      if (!kaart) {
        return;
      }

      hoogste = Math.max(hoogste, kaart.offsetHeight);

      // Op het ANKER (de kaart erft hem) EN op het lege vlak erachter: dat
      // vlak draagt de scrollafstand, en de kaart staat buiten de flow.
      slot.style.setProperty('--mk-kaart-hoogte', Math.round(hoogste) + 'px');

      var ruimte = slot.nextElementSibling;
      if (ruimte && ruimte.classList.contains('mymmo-kaart-ruimte')) {
        ruimte.style.setProperty('--mk-kaart-hoogte', Math.round(hoogste) + 'px');
      }
    });

    var kopHoogte = stapel.kop ? stapel.kop.offsetHeight : 0;

    stapel.el.classList.remove('mymmo-kaarten--meten');

    /*
     * GEEN PLAFOND op die hoogtes.
     *
     * Er stond hier een aftopping op 88% van de schermhoogte, zodat een kaart
     * altijd in beeld paste. Dat werkte averechts: een kaart die groter is dan
     * dat plafond groeit toch door haar eigen inhoud, terwijl de kortere
     * kaarten op het plafond blijven staan -- en dan is de kier er weer.
     *
     * De waarde op de STAPEL is het totale maximum. Die voedt alleen nog de
     * kleefwiskunde (`--mk-kleef`) en de marge onder de kop; wat een kaart hoog
     * wordt, staat per slot hierboven.
     */
    stapel.el.style.setProperty('--mk-hoogte', Math.round(hoogste) + 'px');
    stapel.el.style.setProperty('--mk-kop', Math.round(kopHoogte) + 'px');
  }

  /** Staat deze stapel (ongeveer) in beeld? Zo niet, niets te tekenen. */
  function inBeeld(stapel) {
    var r = stapel.el.getBoundingClientRect();
    return r.bottom > -200 && r.top < window.innerHeight + 200;
  }

  function teken() {
    hertekenGepland = false;

    stapels.forEach(function (stapel) {
      var slots = stapel.slots;
      if (!slots.length) {
        return;
      }

      var uit = stapel.el.getAttribute('data-animatie') === 'geen';

      /* Kleven de kaarten op deze breedte? Zo niet (de stand "gewoon onder
         elkaar", of een telefoon waar dat uitstaat) is er niets dat iets
         bedekt, en hoort er dus ook niets te krimpen. Aan de COMPUTED STYLE
         gevraagd en niet aan een klasse: dan klopt het antwoord ook als een
         media query het uitzet. */
      var kleeft = window.getComputedStyle(slots[0]).position === 'sticky';

      if (!inBeeld(stapel)) {
        return;
      }

      /* Hoe ver is elke kaart op weg naar haar kleefpositie? 0 = nog ver weg,
         1 = ze ligt er. */
      var voortgang = slots.map(function (slot) {
        var doel = parseFloat(window.getComputedStyle(slot).top) || 0;
        var afstand = slot.getBoundingClientRect().top - doel;
        return Math.max(0, Math.min(1, (AANLOOP - afstand) / AANLOOP));
      });

      slots.forEach(function (slot, i) {
        var kaart = stapel.kaarten[i];
        if (!kaart) {
          return;
        }

        var bedekt = 0;

        if (kleeft && !uit && !stapel.venster[i]) {
          /* ALLE kaarten die er nog overheen komen tellen mee, niet alleen de
             eerstvolgende. Zie de uitleg bovenaan dit bestand. */
          for (var j = i + 1; j < voortgang.length; j++) {
            bedekt += voortgang[j];
          }
        }

        /* Geen transform zonder krimp -- ook `scale(1)` maakt van de kaart het
           referentiekader voor een venster met `position: fixed`. */
        if (bedekt) {
          kaart.style.transform = 'scale(' + (1 - STAP * bedekt) + ')';
        } else {
          kaart.style.transform = '';
        }
      });
    });
  }

  function plan() {
    if (hertekenGepland) {
      return;
    }
    hertekenGepland = true;
    window.requestAnimationFrame(teken);
  }

  function hermeet() {
    /*
     * De scrollpositie vasthouden over de meting heen.
     *
     * Tijdens het meten staat `--meten` aan: de kaarten gaan even op hun
     * natuurlijke hoogte en de lege vlakken verliezen hun maat, waardoor de
     * pagina korter wordt. Staat de bezoeker dan ver in de stapel, dan kapt de
     * browser zijn scrollpositie af op de nieuwe paginahoogte -- en na de
     * meting staat hij ergens anders. Dat gebeurt precies wanneer een
     * afbeelding of een lettertype laat binnenkomt, dus midden in het lezen.
     */
    var was = window.scrollY;

    stapels = stapels.map(function (stapel) { return verzamel(stapel.el); });
    stapels.forEach(meet);

    if (window.scrollY !== was) {
      window.scrollTo(0, was);
    }

    plan();
  }

  function later() {
    if (wachtend) {
      return;
    }
    wachtend = true;
    window.setTimeout(function () {
      wachtend = false;
      hermeet();
    }, 150);
  }

  function start() {
    stapels = lijst(document, STAPEL).map(verzamel);
    if (!stapels.length) {
      return;
    }

    stapels.forEach(meet);
    teken();

    if (magBewegen()) {
      window.addEventListener('scroll', plan, { passive: true });
    }
    window.addEventListener('resize', later, { passive: true });
    window.addEventListener('orientationchange', later);

    /* Een beeld dat later binnenkomt, verandert de hoogste kaart. Bewust geen
       ResizeObserver: die ziet ook ONZE eigen `min-height` veranderen en meet
       dan zichzelf in een kringetje. Een handvol load-luisteraars is hier het
       eerlijke gereedschap. */
    stapels.forEach(function (stapel) {
      lijst(stapel.el, 'img').forEach(function (beeld) {
        if (!beeld.complete) {
          beeld.addEventListener('load', later, { once: true });
          beeld.addEventListener('error', later, { once: true });
        }
      });
    });

    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(later);
    }

    window.addEventListener('load', later);

    /* Het venster van Mymmo Forms haalt een stap of het formulier uit een kaart
       en zet het er bij het sluiten weer in. De kaart wordt daar hoger of lager
       van, dus opnieuw meten. Gebeurt er niets van dat alles, dan bestaat deze
       gebeurtenis gewoon niet en doet dit niets. */
    document.addEventListener('mymmo:venster', later);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
