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
 * Wie beweging afwijst, krijgt geen glijden: de CSS zet de overgang uit bij
 * prefers-reduced-motion: reduce. Het script schrijft enkel klassen,
 * attributen en CSS-variabelen; wat ermee gebeurt, staat in mymmo-team.css.
 */

(function () {
  'use strict';

  var SMAL = '(max-width: 781px)';
  /** Zo ver (px) moet een vinger opzij voor het script overneemt. */
  var DREMPEL = 8;
  /** Zo ver (px) volstaat om naar de volgende kaart te gaan. */
  var GENOEG = 40;

  function Team(el) {
    this.el = el;
    this.venster = el.querySelector('.mymmo-team-venster');
    this.rij = el.querySelector('.mymmo-team-rij');
    this.leden = [].slice.call(el.querySelectorAll('.mymmo-team-rij > .mymmo-team-lid'));
    this.bediening = el.querySelector('.mymmo-team-bediening');
    this.vorige = el.querySelector('.mymmo-team-pijl--vorige');
    this.volgende = el.querySelector('.mymmo-team-pijl--volgende');
    this.smal = window.matchMedia(SMAL);
    this.aan = false;
    this.stops = [0];
    this.index = 0;
    this.schuif = 0;
    this.greep = null;
    this.gesleept = false;
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
    this.leden.forEach(function (lid) {
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

  Team.prototype.wissel = function () {
    if (this.smal.matches && this.leden.length > 1) {
      if (!this.aan) {
        this.aan = true;
        this.el.classList.add('is-vegen');
        if (this.bediening) { this.bediening.hidden = false; }
      }
      this.meet();
      this.naar(Math.min(this.index, this.stops.length - 1));
    } else if (this.aan) {
      this.aan = false;
      this.el.classList.remove('is-vegen', 'is-slepen');
      this.rij.style.removeProperty('--mk-schuif');
      if (this.bediening) { this.bediening.hidden = true; }
      this.index = 0;
      this.schuif = 0;
    }
  };

  /** Waar de rij kan stilstaan: aan het begin van elke kaart, tot het einde. */
  Team.prototype.meet = function () {
    var laatste = this.leden[this.leden.length - 1];
    var breed = this.venster.clientWidth - parseFloat(getComputedStyle(this.venster).paddingLeft) * 2;
    var max = Math.max(0, laatste.offsetLeft + laatste.offsetWidth - this.leden[0].offsetLeft - breed);
    var stops = [];
    var begin = this.leden[0].offsetLeft;
    this.leden.forEach(function (lid) {
      var stop = Math.min(lid.offsetLeft - begin, max);
      if (!stops.length || stop - stops[stops.length - 1] > 1) { stops.push(stop); }
    });
    this.stops = stops;
    this.max = max;
  };

  Team.prototype.toon = function (schuif) {
    this.schuif = schuif;
    this.rij.style.setProperty('--mk-schuif', (-schuif) + 'px');
  };

  Team.prototype.naar = function (index) {
    this.index = Math.max(0, Math.min(this.stops.length - 1, index));
    this.toon(this.stops[this.index]);
    if (this.vorige) { this.vorige.disabled = this.index === 0; }
    if (this.volgende) { this.volgende.disabled = this.index === this.stops.length - 1; }
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

    // Voorbij het begin of het einde: de rij rekt nog een beetje mee.
    var schuif = g.schuif - dx;
    if (schuif < 0) { schuif = schuif / 3; }
    if (schuif > this.max) { schuif = this.max + (schuif - this.max) / 3; }
    this.toon(schuif);
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
    var lid = e.target.closest('.mymmo-team-lid');
    var i = this.leden.indexOf(lid);
    if (i < 0) { return; }
    var begin = this.leden[0].offsetLeft;
    this.naar(this.dichtste(Math.min(lid.offsetLeft - begin, this.max)));
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
