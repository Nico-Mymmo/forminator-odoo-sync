/**
 * De stappen op de pagina: naast elkaar openschuiven tijdens het scrollen.
 *
 * Enkel op een computer (vanaf 782px, het breekpunt van WordPress en van de
 * rest van deze plugin), enkel als de reeks het wil (`data-mymmo-stappen`), en
 * enkel als ELKE stap in de hoogte van het scherm past. Past er één niet, dan
 * blijven ze onder elkaar staan: de andere oplossing is een schuifbalk in een
 * paneel, en die hoort niet in een component.
 *
 * Hoe het werkt: de reeks krijgt een BAAN die zo hoog is als er te scrollen
 * valt; daarin kleeft de RIJ met de panelen. Hoe ver je door de baan bent,
 * bepaalt welk paneel open staat. Een dicht paneel is een knop: klikken (of
 * Enter) scrolt naar zijn stuk van de baan.
 *
 * Wie beweging afwijst, krijgt geen animatie en springt bij een klik meteen.
 * Het script schrijft enkel klassen en CSS-variabelen; wat ermee gebeurt,
 * staat in mymmo-stappen.css.
 */

(function () {
  'use strict';

  var BREED = '(min-width: 782px)';
  var RUSTIG = '(prefers-reduced-motion: reduce)';
  /** Lucht onder het paneel, tot de onderrand van het scherm. */
  var MARGE = 24;
  /** Lager dan dit is een paneel geen paneel meer maar een strook. */
  var MIN_PANEEL = 420;

  function px(waarde) {
    var getal = parseFloat(waarde);
    return isNaN(getal) ? 0 : getal;
  }

  function Reeks(el) {
    this.el = el;
    this.baan = el.querySelector('.mymmo-stappen-baan');
    this.rij = el.querySelector('.mymmo-stappen-rij');
    this.stappen = [].slice.call(el.querySelectorAll('.mymmo-stappen-rij > .mymmo-stap'));
    this.breed = window.matchMedia(BREED);
    this.rustig = window.matchMedia(RUSTIG);
    this.actief = -1;
    this.aan = false;
    this.afstand = 1;
    this.boven = 0;
    this.bezig = false;
  }

  Reeks.prototype.start = function () {
    if (!this.baan || !this.rij || this.stappen.length < 2) {
      return;
    }
    var zelf = this;

    this.stappen.forEach(function (stap, n) {
      stap.addEventListener('click', function () {
        if (zelf.aan && n !== zelf.actief) {
          zelf.ga(n);
        }
      });
      stap.addEventListener('keydown', function (e) {
        if (zelf.aan && n !== zelf.actief && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          zelf.ga(n);
        }
      });
    });

    window.addEventListener('scroll', function () {
      if (zelf.aan && !zelf.bezig) {
        zelf.bezig = true;
        window.requestAnimationFrame(function () {
          zelf.bezig = false;
          zelf.volg();
        });
      }
    }, { passive: true });

    var wacht = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(wacht);
      wacht = window.setTimeout(function () { zelf.kies(); }, 150);
    });
    if (this.breed.addEventListener) {
      this.breed.addEventListener('change', function () { zelf.kies(); });
    }
    // Lettertypes en beelden veranderen de hoogte van een stap: opnieuw meten.
    window.addEventListener('load', function () { zelf.kies(); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { zelf.kies(); });
    }

    this.kies();
  };

  /** Naast elkaar of onder elkaar? Altijd eerst terug naar onder elkaar. */
  Reeks.prototype.kies = function () {
    this.uit();
    if (this.breed.matches) {
      this.zetAan();
    }
  };

  Reeks.prototype.zetAan = function () {
    var el = this.el;
    var stijl = window.getComputedStyle(el);
    this.boven = px(stijl.getPropertyValue('--mk-boven'));

    var paneel = window.innerHeight - this.boven - MARGE;
    if (paneel < MIN_PANEEL) {
      return;
    }

    el.classList.add('mymmo-stappen--naast');
    el.style.setProperty('--mk-paneel', paneel + 'px');

    // Alles dicht: zo is de breedte van een dicht paneel te meten.
    var dicht = this.stappen[0].getBoundingClientRect().width;
    var tussen = px(window.getComputedStyle(this.rij).columnGap);
    var open = this.rij.clientWidth - (this.stappen.length - 1) * (dicht + tussen);
    el.style.setProperty('--mk-open', Math.floor(open) + 'px');

    // Past elke stap? De inhoud staat al op de breedte van een open paneel,
    // ook als het paneel dicht is, dus dit kan zonder iets te openen.
    var past = this.stappen.every(function (stap) {
      var s = window.getComputedStyle(stap);
      var nummer = stap.querySelector('.mymmo-stap-nummer');
      var inhoud = stap.querySelector('.mymmo-stap-inhoud');
      var nodig = px(s.paddingTop) + px(s.paddingBottom)
        + (nummer ? nummer.getBoundingClientRect().height : 0)
        + (inhoud ? inhoud.getBoundingClientRect().height : 0);
      return nodig <= paneel;
    });
    if (!past) {
      this.uit();
      return;
    }

    var perStap = window.innerHeight * px(el.getAttribute('data-scroll') || 55) / 100;
    this.afstand = Math.max(1, perStap * this.stappen.length);
    el.style.setProperty('--mk-baan', (paneel + this.afstand) + 'px');

    this.aan = true;
    this.actief = -1;
    this.volg();
  };

  Reeks.prototype.uit = function () {
    var el = this.el;
    this.aan = false;
    this.actief = -1;
    el.classList.remove('mymmo-stappen--naast');
    ['--mk-paneel', '--mk-open', '--mk-baan'].forEach(function (naam) {
      el.style.removeProperty(naam);
    });
    this.stappen.forEach(function (stap) {
      stap.classList.remove('is-open');
      stap.removeAttribute('tabindex');
      stap.removeAttribute('role');
      stap.removeAttribute('aria-label');
    });
  };

  /** Welk paneel hoort open bij deze scrollpositie? */
  Reeks.prototype.volg = function () {
    var r = this.baan.getBoundingClientRect();
    var voortgang = Math.min(1, Math.max(0, (this.boven - r.top) / this.afstand));
    this.open(Math.min(this.stappen.length - 1, Math.floor(voortgang * this.stappen.length)));
  };

  Reeks.prototype.open = function (index) {
    if (index === this.actief) {
      return;
    }
    this.actief = index;
    this.stappen.forEach(function (stap, n) {
      var open = n === index;
      stap.classList.toggle('is-open', open);
      if (open) {
        stap.removeAttribute('tabindex');
        stap.removeAttribute('role');
        stap.removeAttribute('aria-label');
        return;
      }
      var kop = stap.querySelector('h2, h3, h4');
      stap.setAttribute('tabindex', '0');
      stap.setAttribute('role', 'button');
      stap.setAttribute('aria-label', 'Toon stap ' + (n + 1) + (kop ? ': ' + kop.textContent.trim() : ''));
    });
  };

  /** Scrol naar het midden van het stuk baan van stap n. */
  Reeks.prototype.ga = function (n) {
    var y = window.scrollY + this.baan.getBoundingClientRect().top - this.boven
      + this.afstand * (n + 0.5) / this.stappen.length;
    window.scrollTo({ top: y, behavior: this.rustig.matches ? 'auto' : 'smooth' });
  };

  function init() {
    [].slice.call(document.querySelectorAll('[data-mymmo-stappen]')).forEach(function (el) {
      new Reeks(el).start();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
