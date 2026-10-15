/**
 * Nieuwsbrieven -- de kleurkiezer: een bolletje met de kleur; erop klikken
 * opent een rooster met de merkkleuren (MERKKLEUREN in lib/constants.js, via
 * /api/bootstrap), met een vinkje bij de gekozen kleur en "Wissen" om terug te
 * gaan naar de standaard. Zelfde gedrag als de kleurkiezer van WordPress.
 *
 * Gebruik: NB.kleur.open({ x, y, huidige, opKies(hexOfNull) })
 *   x, y  plek op het scherm (viewport) waaronder het rooster verschijnt
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  var paneel = null;
  var opKies = null;

  function donker(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return false;
    var lin = function (v) { var c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]) < 0.3;
  }
  NB.kleurDonker = donker;

  /** Het bolletje zelf (voor in het paneel of de werkbalk). */
  NB.kleurBol = function (hex, extra) {
    return '<span class="inline-block w-6 h-6 rounded-full border border-base-content/20 align-middle shrink-0' + (extra ? ' ' + extra : '') + '" style="background-color:' + e(hex || '#ffffff') + '"></span>';
  };

  function sluit() {
    if (paneel) paneel.remove();
    paneel = null;
    opKies = null;
    document.removeEventListener('pointerdown', buiten, true);
    document.removeEventListener('keydown', toets, true);
  }

  function buiten(ev) { if (paneel && !paneel.contains(ev.target)) sluit(); }
  function toets(ev) { if (ev.key === 'Escape') sluit(); }

  NB.kleur = {
    open: function (o) {
      sluit();
      var families = (NB.state.boot && NB.state.boot.merkkleuren) || [];
      var huidige = String(o.huidige || '').toLowerCase();
      opKies = o.opKies;
      paneel = document.createElement('div');
      paneel.className = 'bg-base-100 rounded-2xl shadow-xl border border-base-content/10 p-4';
      // Positie en laag IN de stijl, niet via Tailwind-klassen: die maakt de
      // CDN pas na het invoegen aan, en dan meten we de breedte verkeerd (de
      // kiezer belandde helemaal links).
      paneel.style.cssText = 'position:fixed;z-index:1100;left:-9999px;top:0;width:max-content';
      paneel.innerHTML = '<div class="flex flex-col gap-2.5">'
        + families.map(function (f) {
          return '<div class="flex gap-2.5" title="' + e(f.familie) + '">' + f.kleuren.map(function (k) {
            var aan = k.toLowerCase() === huidige;
            return '<button type="button" class="w-9 h-9 rounded-full border border-base-content/15 flex items-center justify-center hover:scale-110 transition-transform' + (aan ? ' ring-2 ring-offset-2 ring-primary' : '') + '" style="background-color:' + e(k) + '" data-nb-kleurkeuze="' + e(k) + '" aria-label="' + e(k) + '">'
              + (aan ? '<svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="' + (donker(k) ? '#fff' : '#111827') + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>' : '')
              + '</button>';
          }).join('') + '</div>';
        }).join('')
        + '<div class="flex justify-end pt-1"><button type="button" class="text-sm font-semibold text-primary hover:underline" data-nb-kleurkeuze="">Wissen</button></div></div>';
      document.body.appendChild(paneel);
      // Binnen het venster houden.
      var w = paneel.offsetWidth;
      var h = paneel.offsetHeight;
      var x = Math.max(8, Math.min(window.innerWidth - w - 8, o.x - 18));
      var y = o.y + 8 + h > window.innerHeight ? Math.max(8, o.y - h - 40) : o.y + 8;
      paneel.style.left = x + 'px';
      paneel.style.top = y + 'px';
      paneel.addEventListener('click', function (ev) {
        var knop = ev.target.closest('[data-nb-kleurkeuze]');
        if (!knop) return;
        var f = opKies;
        var waarde = knop.getAttribute('data-nb-kleurkeuze') || null;
        sluit();
        if (f) f(waarde);
      });
      setTimeout(function () {
        document.addEventListener('pointerdown', buiten, true);
        document.addEventListener('keydown', toets, true);
      }, 0);
    },
    sluit: sluit,
  };
})();
