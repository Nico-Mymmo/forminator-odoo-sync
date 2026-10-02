/**
 * Mymmo Forms -- de academy achter een formulier. Zie includes/class-academy.php.
 *
 * Een klik op een academy-knop:
 *  - bewijs bekend  -> de academy meteen openen (de klik wordt hier gevangen,
 *                      nog voor het venster van mymmo-forms-modal.js hem ziet);
 *  - geen bewijs    -> niets doen: het venster met het formulier opent vanzelf,
 *                      want de knop staat in zijn trigger-selector.
 * Na een geslaagde inzending (`mymmo:academy_token`, gezet door mymmo-forms.js)
 * gaat het venster dicht en de academy open. Zegt de academy dat ze niemand
 * kent (`ovme_login_needed`), dan verdwijnt het bewijs en komt het formulier.
 *
 * Het bewijs staat in localStorage van DEZE site, nooit in een cookie: een
 * cookie gaat met elk verzoek mee naar de server, en daar heeft niemand het
 * nodig. Naar de academy gaat het in het FRAGMENT (`#t=`), dat geen server ziet.
 */
(function () {
  'use strict';

  var cfg = window.MymmoAcademy || {};
  if (!cfg.url) return;

  var SLEUTEL = 'mymmo_academy_token';
  var BEWIJS_RE = /^v1\.[A-Za-z0-9_-]{8,1000}\.[A-Za-z0-9_-]{20,200}$/;
  var start = { course: '', lesson: '' };
  var vorigeFocus = null;

  function bewijs() {
    try {
      var t = window.localStorage.getItem(SLEUTEL) || '';
      return BEWIJS_RE.test(t) ? t : '';
    } catch (_) { return ''; }
  }

  function zetBewijs(t) {
    try {
      if (t) window.localStorage.setItem(SLEUTEL, t); else window.localStorage.removeItem(SLEUTEL);
    } catch (_) { /* privévenster: dan vraagt het formulier het de volgende keer opnieuw */ }
  }

  function kader() { return document.querySelector('[data-mymmo-academy-frame]'); }

  function formVenster() {
    var alle = document.querySelectorAll('[data-mymmo-modal][data-mymmo-trigger]');
    for (var i = 0; i < alle.length; i += 1) {
      if (alle[i].getAttribute('data-mymmo-trigger') === cfg.trigger) return alle[i];
    }
    return null;
  }

  /** Waar de knop heen wil: data-mymmo-academy="slug", of de oude klasse ovme-cursus-<slug>. */
  function startVan(el) {
    if (el.hasAttribute('data-mymmo-academy')) {
      return {
        course: el.getAttribute('data-mymmo-academy') || '',
        lesson: el.getAttribute('data-mymmo-academy-les') || ''
      };
    }
    var course = '';
    for (var i = 0; i < el.classList.length; i += 1) {
      var c = el.classList[i];
      if (c.indexOf('ovme-cursus-') === 0) course = c.slice('ovme-cursus-'.length);
    }
    return { course: course, lesson: '' };
  }

  function adres(t) {
    var u = String(cfg.url).replace(/\/+$/, '');
    u += start.course ? '/courses/' + encodeURIComponent(start.course) : '/';
    u += '?gate=parent';
    if (start.lesson) u += '&lesson=' + encodeURIComponent(start.lesson);
    if (t) u += '#t=' + encodeURIComponent(t);
    return u;
  }

  function openAcademy() {
    var k = kader();
    if (!k) return;
    var iframe = k.querySelector('iframe');
    vorigeFocus = document.activeElement;
    iframe.src = adres(bewijs());
    k.hidden = false;
    document.documentElement.classList.add('mymmo-academy-actief');
    var sluit = k.querySelector('[data-mymmo-academy-sluit]');
    if (sluit) sluit.focus({ preventScroll: true });
  }

  function sluitAcademy() {
    var k = kader();
    if (!k || k.hidden) return;
    k.hidden = true;
    k.querySelector('iframe').src = 'about:blank';
    document.documentElement.classList.remove('mymmo-academy-actief');
    if (vorigeFocus && vorigeFocus.focus) vorigeFocus.focus({ preventScroll: true });
  }

  /** Het formulier tonen via de verborgen knop: zo opent mymmo-forms-modal.js het zelf. */
  function vraagFormulier() {
    var knop = document.querySelector('[data-mymmo-academy-intern]');
    if (knop) knop.click();
  }

  // Capture: vóór de klik-afhandeling van het venster.
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest(cfg.knoppen);
    if (!el || el.closest('[data-mymmo-academy-frame]')) return;
    start = startVan(el);
    if (bewijs()) {
      e.preventDefault();
      e.stopPropagation();
      openAcademy();
    }
  }, true);

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-mymmo-academy-sluit]')) {
      e.preventDefault();
      sluitAcademy();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') sluitAcademy();
  });

  document.addEventListener('mymmo:academy_token', function (e) {
    var d = e.detail || {};
    if (!BEWIJS_RE.test(d.token || '') || !d.form) return;
    var venster = d.form.closest('[data-mymmo-modal]');
    if (!venster || venster !== formVenster()) return;
    e.preventDefault();
    zetBewijs(d.token);
    try { d.form.reset(); } catch (_) { /* niets */ }
    var sluit = venster.querySelector('[data-mymmo-modal-close]');
    if (sluit) sluit.click();
    openAcademy();
  });

  window.addEventListener('message', function (e) {
    if (e.origin !== cfg.origin) return;
    var d = e.data;
    if (!d || d.source !== 'openvme-cursus') return;
    if (d.type === 'ovme_login_needed') {
      zetBewijs('');
      sluitAcademy();
      vraagFormulier();
      return;
    }
    // Voortgang doorgeven aan GTM: een module afgewerkt, een certificaat behaald.
    if (d.type === 'ovme_module_complete' || d.type === 'ovme_certificate_earned') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'mymmo_academy',
        academy_event: d.type === 'ovme_module_complete' ? 'module_complete' : 'certificate_earned',
        academy_course: start.course || '',
        academy_module: d.module_id || ''
      });
    }
  });
}());
