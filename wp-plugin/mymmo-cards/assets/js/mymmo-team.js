/**
 * Het team op de pagina: de tekst openen met een tik, en vegen op een telefoon
 * of een tablet.
 *
 * DE TEKST. Een tik, een klik of Enter op de foto opent de tekst (`.is-open`
 * op het teamlid, aria-expanded op de knop); nog eens, of een tik op de tekst
 * zelf, sluit ze. Er staat er een tegelijk open. Escape sluit. Met de muis
 * verschijnt de tekst ook gewoon bij aanwijzen: dat doet de CSS.
 *
 * VEGEN, enkel smaller dan 782px (telefoon en tablet). Het blok krijgt
 * `.is-vegen` en de rij schuift met --mk-schuif (een translateX in
 * mymmo-team.css). Geen schuifbalk: het venster knipt af (overflow: hidden)
 * en dit script volgt de vinger. Verticaal blijft de pagina gewoon scrollen
 * (touch-action: pan-y); pas als je duidelijk opzij beweegt, neemt het script
 * over. Na het loslaten klikt de rij vast op een kaart. Een kaart die focus
 * krijgt met het toetsenbord, schuift in beeld.
 *
 * ZONDER EINDE (sinds 1.17.3). Na de laatste komt de eerste weer, in beide
 * richtingen. Daarvoor staat het team er drie keer: een kopie ervoor, de echte
 * kaarten, een kopie erna. De kopieën zijn voor schermlezers verborgen
 * (aria-hidden), niet bereikbaar met Tab en dragen geen id. Staat de rij na
 * een beweging op een kopie, dan springt ze zonder overgang naar dezelfde
 * persoon in de echte reeks: wat je ziet, verandert niet.
 *
 * Wie beweging afwijst, krijgt geen glijden: de CSS zet de overgang uit bij
 * prefers-reduced-motion: reduce. Het script schrijft enkel klassen,
 * attributen en CSS-variabelen; wat ermee gebeurt, staat in mymmo-team.css.
 */

(function () {
  'use strict';

  var SMAL = '(max-width: 781px)';
  var RUSTIG = '(prefers-reduced-motion: reduce)';
  /** Zo ver (px) moet een vinger opzij voor het script overneemt. */
  var DREMPEL = 8;
  /** Zo ver (px) volstaat om naar de volgende kaart te gaan. */
  var GENOEG = 40;
  /** Iets langer dan de overgang in mymmo-team.css (0,35 s). */
  var GLIJDEN = 380;

  function Team(el) {
    this.el = el;
    this.venster = el.querySelector('.mymmo-team-venster');
    this.rij = el.querySelector('.mymmo-team-rij');
    this.leden = [].slice.call(el.querySelectorAll('.mymmo-team-rij > .mymmo-team-lid'));
    this.bediening = el.querySelector('.mymmo-team-bediening');
    this.vorige = el.querySelector('.mymmo-team-pijl--vorige');
    this.volgende = el.querySelector('.mymmo-team-pijl--volgende');
    this.smal = window.matchMedia(SMAL);
    this.rustig = window.matchMedia(RUSTIG);
    this.aan = false;
    this.kopieen = [];
    this.alle = this.leden;
    this.stops = [0];
    this.index = 0;
    this.schuif = 0;
    this.greep = null;
    this.gesleept = false;
    this.wacht = 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // De tekst
  // ───────────────────────────────────────────────────────────────────────────

  Team.prototype.zet = function (lid, open) {
    var knop = lid.querySelector('.mymmo-team-knop');
    lid.classList.toggle('is-open', open);
    if (knop) { knop.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  };

  Team.prototype.sluitAlles = function (behalve) {
    var zelf = this;
    this.alle.forEach(function (lid) {
      if (lid !== behalve && lid.classList.contains('is-open')) { zelf.zet(lid, false); }
    });
  };

  Team.prototype.klik = function (e) {
    if (this.gesleept) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var lid = e.target.closest('.mymmo-team-lid');
    if (!lid || !this.el.contains(lid)) { return; }

    if (e.target.closest('.mymmo-team-knop')) {
      var open = !lid.classList.contains('is-open');
      this.sluitAlles(lid);
      this.zet(lid, open);
      return;
    }
    // Een tik op open tekst sluit ze; een link erin werkt gewoon.
    if (e.target.closest('.mymmo-team-bio') && !e.target.closest('a')) {
      this.zet(lid, false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Vegen
  // ───────────────────────────────────────────────────────────────────────────

  /** Een kopie van een teamlid: zichtbaar, maar niet voor schermlezers of Tab. */
  function kopie(lid) {
    var k = lid.cloneNode(true);
    k.classList.add('is-kopie');
    k.classList.remove('is-open');
    k.setAttribute('aria-hidden', 'true');
    [].slice.call(k.querySelectorAll('[id]')).forEach(function (x) { x.removeAttribute('id'); });
    [].slice.call(k.querySelectorAll('a, button')).forEach(function (x) {
      x.setAttribute('tabindex', '-1');
      x.removeAttribute('aria-controls');
    });
    return k;
  }

  Team.prototype.wissel = function () {
    if (this.smal.matches && this.leden.length > 1) {
      if (!this.aan) {
        this.aan = true;
        this.el.classList.add('is-vegen');
        if (this.bediening) { this.bediening.hidden = false; }
        this.bouwKopieen();
        this.index = this.leden.length;
      }
      this.meet();
      this.spring(this.index);
    } else if (this.aan) {
      this.aan = false;
      window.clearTimeout(this.wacht);
      this.kopieen.forEach(function (k) { k.parentNode && k.parentNode.removeChild(k); });
      this.kopieen = [];
      this.alle = this.leden;
      this.el.classList.remove('is-vegen', 'is-slepen');
      this.rij.style.removeProperty('--mk-schuif');
      if (this.bediening) { this.bediening.hidden = true; }
      this.index = 0;
      this.schuif = 0;
    }
  };

  Team.prototype.bouwKopieen = function () {
    var zelf = this;
    var eerste = this.leden[0];
    var voor = this.leden.map(kopie);
    var na = this.leden.map(kopie);
    voor.forEach(function (k) { zelf.rij.insertBefore(k, eerste); });
    na.forEach(function (k) { zelf.rij.appendChild(k); });
    this.kopieen = voor.concat(na);
    this.alle = voor.concat(this.leden, na);
  };

  /** Waar de rij kan stilstaan: aan het begin van elke kaart, ook de kopieën. */
  Team.prototype.meet = function () {
    var begin = this.alle[0].offsetLeft;
    this.stops = this.alle.map(function (lid) { return lid.offsetLeft - begin; });
  };

  Team.prototype.toon = function (schuif) {
    this.schuif = schuif;
    this.rij.style.setProperty('--mk-schuif', (-schuif) + 'px');
  };

  /** Dezelfde persoon in de echte reeks. */
  Team.prototype.echt = function (index) {
    var n = this.leden.length;
    return n + ((((index - n) % n) + n) % n);
  };

  /** Zonder overgang naar een stop: voor de sprong van een kopie naar het echte lid. */
  Team.prototype.spring = function (index) {
    window.clearTimeout(this.wacht);
    this.index = this.echt(index);
    this.el.classList.add('is-slepen');
    this.toon(this.stops[this.index]);
    // De nieuwe positie eerst laten tekenen, dan de overgang terug aan.
    void this.rij.offsetWidth;
    if (!this.greep || !this.greep.slepen) { this.el.classList.remove('is-slepen'); }
  };

  /** Met overgang naar een stop; staat die op een kopie, daarna de sprong. */
  Team.prototype.naar = function (index) {
    var zelf = this;
    window.clearTimeout(this.wacht);
    this.index = Math.max(0, Math.min(this.stops.length - 1, index));
    this.toon(this.stops[this.index]);
    if (this.echt(this.index) !== this.index) {
      this.wacht = window.setTimeout(function () { zelf.spring(zelf.index); }, this.rustig.matches ? 0 : GLIJDEN);
    }
  };

  /** De stop die het dichtst bij een schuifpositie ligt. */
  Team.prototype.dichtste = function (schuif) {
    var beste = 0;
    for (var i = 1; i < this.stops.length; i++) {
      if (Math.abs(this.stops[i] - schuif) < Math.abs(this.stops[beste] - schuif)) { beste = i; }
    }
    return beste;
  };

  Team.prototype.neer = function (e) {
    if (!this.aan || (e.pointerType === 'mouse' && e.button !== 0)) { return; }
    // Nog onderweg naar een kopie: eerst naar het echte lid, dan pas slepen.
    if (this.echt(this.index) !== this.index) { this.spring(this.index); }
    this.greep = { x: e.clientX, y: e.clientY, schuif: this.schuif, id: e.pointerId, slepen: false };
    this.gesleept = false;
  };

  Team.prototype.beweeg = function (e) {
    var g = this.greep;
    if (!g || e.pointerId !== g.id) { return; }
    var dx = e.clientX - g.x;
    var dy = e.clientY - g.y;

    if (!g.slepen) {
      if (Math.abs(dy) > DREMPEL && Math.abs(dy) >= Math.abs(dx)) {
        this.greep = null;
        return;
      }
      if (Math.abs(dx) <= DREMPEL) { return; }
      g.slepen = true;
      this.el.classList.add('is-slepen');
      if (this.venster.setPointerCapture) {
        try { this.venster.setPointerCapture(e.pointerId); } catch (fout) { /* niets */ }
      }
    }

    // Een volledige reeks kopieën aan elke kant: er is altijd genoeg rij.
    var schuif = g.schuif - dx;
    this.toon(Math.max(0, Math.min(this.stops[this.stops.length - 1], schuif)));
  };

  Team.prototype.los = function (e) {
    var g = this.greep;
    if (!g || e.pointerId !== g.id) { return; }
    this.greep = null;
    if (!g.slepen) { return; }

    this.el.classList.remove('is-slepen');
    var dx = e.clientX - g.x;
    var doel = this.dichtste(this.schuif);
    if (doel === this.index && Math.abs(dx) > GENOEG) {
      doel += dx < 0 ? 1 : -1;
    }
    this.naar(doel);

    // De klik die op het loslaten volgt, opent geen tekst.
    var zelf = this;
    this.gesleept = true;
    window.setTimeout(function () { zelf.gesleept = false; }, 0);
  };

  /** Een kaart die focus krijgt (Tab), schuift in beeld. */
  Team.prototype.focus = function (e) {
    if (!this.aan) { return; }
    var i = this.alle.indexOf(e.target.closest('.mymmo-team-lid'));
    if (i < 0) { return; }
    this.naar(i);
    // Het venster mag zelf niet meeschuiven: dat doet de rij.
    this.venster.scrollLeft = 0;
  };

  Team.prototype.start = function () {
    var zelf = this;
    if (!this.venster || !this.rij || !this.leden.length) { return; }

    this.el.addEventListener('click', function (e) { zelf.klik(e); }, true);
    this.el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { zelf.sluitAlles(null); }
    });

    this.venster.addEventListener('pointerdown', function (e) { zelf.neer(e); });
    this.venster.addEventListener('pointermove', function (e) { zelf.beweeg(e); });
    this.venster.addEventListener('pointerup', function (e) { zelf.los(e); });
    this.venster.addEventListener('pointercancel', function (e) { zelf.los(e); });
    this.venster.addEventListener('focusin', function (e) { zelf.focus(e); });

    if (this.vorige) { this.vorige.addEventListener('click', function () { zelf.naar(zelf.index - 1); }); }
    if (this.volgende) { this.volgende.addEventListener('click', function () { zelf.naar(zelf.index + 1); }); }

    var wissel = function () { zelf.wissel(); };
    if (this.smal.addEventListener) {
      this.smal.addEventListener('change', wissel);
    } else if (this.smal.addListener) {
      this.smal.addListener(wissel);
    }
    window.addEventListener('resize', wissel);
    window.addEventListener('load', wissel);
    this.wissel();
  };

  function start() {
    [].slice.call(document.querySelectorAll('.mymmo-team')).forEach(function (el) {
      if (el.getAttribute('data-mymmo-team-klaar')) { return; }
      el.setAttribute('data-mymmo-team-klaar', '1');
      new Team(el).start();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
