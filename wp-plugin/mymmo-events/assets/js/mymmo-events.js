/**
 * Mymmo Events — progressive enhancement.
 *
 * De kalender werkt volledig zonder JavaScript: de maandnavigatie zijn
 * gewone links met ?mymmo_month=. Dit bestand doet drie kleine dingen
 * bovenop, en niets wat de pagina nodig heeft om te werken.
 */
(function () {
  'use strict';

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

  /**
   * 3. Maandnavigatie met de pijltjestoetsen, als de kalender in beeld is.
   *    Puur comfort; de links blijven het echte mechanisme.
   */
  function keyboardNav() {
    var calendar = document.querySelector('.mymmo-ev-calendar');
    if (!calendar) return;

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      var tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      var rect = calendar.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      var selector = event.key === 'ArrowLeft'
        ? 'a[rel="prev"]'
        : (event.key === 'ArrowRight' ? 'a[rel="next"]' : null);
      if (!selector) return;

      var link = calendar.querySelector(selector);
      if (link) {
        event.preventDefault();
        window.location.href = link.href;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      focusFlash(); guardForms(); keyboardNav();
    });
  } else {
    focusFlash(); guardForms(); keyboardNav();
  }
})();
