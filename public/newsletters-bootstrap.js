/**
 * Nieuwsbrieven -- opstarten, de router (#/...), en de centrale listeners
 * (REGEL 3: data-attributen, geen inline handlers).
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  function banner() {
    var b = NB.state.boot;
    var stukken = [];
    if (b.send_mode !== 'live') {
      stukken.push('<div class="alert alert-info mb-4 text-sm"><i data-lucide="flask-conical" class="w-5 h-5"></i><span><strong>Teststand.</strong> Er vertrekt niets naar klanten: een testmail gaat enkel naar '
        + e((b.test_emails || []).join(', ') || 'niemand (NEWSLETTER_TEST_EMAILS is leeg)') + '.</span></div>');
    }
    if (!b.token_field && b.me.is_editor) {
      stukken.push('<div class="alert alert-warning mb-4 text-sm"><i data-lucide="alert-triangle" class="w-5 h-5"></i><span>Maak in Odoo Studio op <strong>Mailing Contact</strong> een tekstveld <code>x_studio_om_token</code> aan. Zonder dat veld weet de OM niet wie op een vraag in de mail antwoordde: alle antwoorden tellen dan als anoniem.</span></div>');
    }
    document.getElementById('nbBanner').innerHTML = stukken.join('');
  }

  var ROUTES = [
    { re: /^#\/editie\/([0-9a-f-]{36})$/i, view: 'editie' },
    { re: /^#\/stukje\/([0-9a-f-]{36})$/i, view: 'stukje' },
    { re: /^#\/reeks\/([0-9a-f-]{36})$/i, view: 'reeks' },
  ];

  NB.route = async function () {
    var hash = window.location.hash || '#/';
    if (NB.bewaarStukje && NB.state.vuil) { try { await NB.bewaarStukje(); } catch (err) { /* getoond */ } }
    var app = document.getElementById('app');
    try {
      for (var i = 0; i < ROUTES.length; i++) {
        var m = ROUTES[i].re.exec(hash);
        if (m) {
          if (ROUTES[i].view !== 'editie') NB.state.editieTab = NB.state.editieTab || 'redactie';
          await NB.views[ROUTES[i].view]({ id: m[1] });
          window.scrollTo(0, 0);
          return;
        }
      }
      await NB.views.overzicht();
    } catch (err) {
      app.innerHTML = '<div class="alert alert-error">' + e(err.message || err) + '</div>';
    }
  };

  // ─── Centrale listeners ───────────────────────────────────────────────────

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var actie = el.dataset.action;
    if (actie === 'sluit-dialoog') {
      var d = document.getElementById(el.dataset.dialoog);
      if (d) d.close();
      return;
    }
    var fn = NB.actions[actie];
    if (!fn) return;
    if (el.tagName === 'A' || el.tagName === 'BUTTON') ev.preventDefault();
    Promise.resolve(fn(el, ev)).catch(NB.fout);
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.dataset.veld !== undefined && NB.inputs.veld) NB.inputs.veld(el);
    else if (el.dataset.reeks !== undefined && NB.inputs.reeks) NB.inputs.reeks(el);
    else if (el.dataset.rubriek !== undefined && NB.inputs.rubriek) NB.inputs.rubriek(el);
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    var naam = el.dataset.change;
    if (naam && NB.changes[naam]) Promise.resolve(NB.changes[naam](el, ev)).catch(NB.fout);
    // Een <select> vuurt in sommige browsers geen input-event.
    if (el.tagName === 'SELECT') {
      if (el.dataset.reeks !== undefined && NB.inputs.reeks) NB.inputs.reeks(el);
      if (el.dataset.rubriek !== undefined && NB.inputs.rubriek) NB.inputs.rubriek(el);
    }
  });

  window.addEventListener('hashchange', function () { NB.route(); });

  window.addEventListener('beforeunload', function (ev) {
    if (NB.state.vuil) { ev.preventDefault(); ev.returnValue = ''; }
  });

  // ─── Opstarten ────────────────────────────────────────────────────────────

  async function start() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (window.renderSharedNavbar && me.navbarHtml) window.renderSharedNavbar(me.navbarHtml);
    } catch (err) { /* de navbar is geen reden om niet verder te gaan */ }
    try {
      NB.state.boot = await NB.api('/api/bootstrap');
    } catch (err) {
      document.getElementById('app').innerHTML = '<div class="alert alert-error">' + e(err.message) + '</div>';
      return;
    }
    banner();
    NB.ikons();
    NB.route();
  }

  start();
})();
