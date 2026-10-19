/**
 * Projecten -- gedeelde basis: toestand, praten met de server, hulpjes en de
 * navigatie (het adres na # bepaalt wat er staat).
 *
 * Alles hangt aan window.PM. De andere bestanden (views, taak, bootstrap)
 * voegen er hun functies aan toe; knoppen werken via data-action en EEN
 * centrale listener in projecten-bootstrap.js (REGEL 3 uit CLAUDE.md).
 * Een actie registreer je met PM.actie('naam', function (el, e) {...}).
 *
 * Adressen:
 *   #/mijn                     Mijn taken (lijst)
 *   #/mijn/kalender            Mijn taken in de kalender
 *   #/project/<id>             een project (lijst)
 *   #/project/<id>/<weergave>  lijst | bord | kalender | overzicht
 * Een open taak staat er achter: ...?taak=<id>
 */

(function () {
  'use strict';

  var BASE = '/projecten/api';

  var PM = window.PM = {
    state: {
      boot: null,            // vaste lijsten, mensen, ik
      projecten: [],         // met open/af/te_laat
      project: null,         // het open project: { project, sections, tasks }
      mijn: null,            // { tasks, parents, projects }
      route: { soort: 'mijn', id: null, weergave: 'lijst', taak: null },
      toonAf: false,
      toonArchief: false,
      taak: null,            // de open taak: antwoord van GET /api/tasks/:id
      zijbalkOpen: false,
    },
    acties: {},
    wijzigingen: {},
    invoer: {},
  };

  PM.actie = function (naam, fn) { PM.acties[naam] = fn; };
  PM.bijWijziging = function (naam, fn) { PM.wijzigingen[naam] = fn; };
  PM.bijInvoer = function (naam, fn) { PM.invoer[naam] = fn; };

  // ── Hulpjes ───────────────────────────────────────────────────────────────

  PM.esc = function (v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  PM.$ = function (id) { return document.getElementById(id); };
  PM.ikons = function () { if (window.lucide) window.lucide.createIcons(); };

  PM.toast = function (tekst, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : soort === 'warning' ? 'alert-warning' : 'alert-success') + ' shadow-lg max-w-md text-sm';
    el.textContent = tekst;
    PM.$('pmToast').appendChild(el);
    setTimeout(function () { el.remove(); }, soort === 'error' ? 6000 : 3000);
  };

  PM.api = async function (pad, opties) {
    opties = opties || {};
    var res = await fetch(BASE + pad, {
      method: opties.method || 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: opties.body ? JSON.stringify(opties.body) : undefined,
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || ('Fout ' + res.status));
    return data.data;
  };

  PM.upload = async function (pad, bestand) {
    var res = await fetch(BASE + pad + '?naam=' + encodeURIComponent(bestand.name || 'bestand'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': bestand.type || 'application/octet-stream' }, body: bestand,
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || 'Opladen mislukt');
    return data.data;
  };

  /** Een fout laten zien in plaats van ze in te slikken. */
  PM.probeer = async function (fn) {
    try { return await fn(); } catch (err) { PM.toast(err.message, 'error'); return undefined; }
  };

  PM.ik = function () { return PM.state.boot ? PM.state.boot.me : {}; };
  PM.persoon = function (id) {
    if (!id || !PM.state.boot) return null;
    return PM.state.boot.mensen.filter(function (m) { return m.id === id; })[0] || { id: id, naam: 'Onbekende collega', voornaam: '?' };
  };
  PM.kleurHex = function (key) {
    var k = (PM.state.boot ? PM.state.boot.kleuren : []).filter(function (x) { return x.key === key; })[0];
    return k ? k.hex : '#0284c7';
  };
  PM.status = function (key) {
    return (PM.state.boot ? PM.state.boot.statussen : []).filter(function (s) { return s.key === key; })[0] || { key: key, label: key, tone: 'neutral' };
  };
  PM.prioriteit = function (key) {
    return (PM.state.boot ? PM.state.boot.prioriteiten : []).filter(function (s) { return s.key === key; })[0] || { key: key, label: key };
  };
  PM.projectVan = function (id) {
    return PM.state.projecten.filter(function (p) { return p.id === id; })[0] || null;
  };

  /** Een rond fotootje (of de eerste letter). */
  PM.avatar = function (id, maat) {
    var p = PM.persoon(id);
    maat = maat || 6;
    var cls = 'w-' + maat + ' h-' + maat;
    if (!p) {
      return '<span class="' + cls + ' rounded-full border border-dashed border-base-content/30 inline-flex items-center justify-center shrink-0" title="Niemand"><i data-lucide="user" class="w-3 h-3 opacity-40"></i></span>';
    }
    if (p.foto_url) {
      return '<img src="' + PM.esc(p.foto_url) + '" alt="" title="' + PM.esc(p.naam) + '" class="' + cls + ' rounded-full object-cover shrink-0" loading="lazy">';
    }
    return '<span class="' + cls + ' rounded-full bg-primary/15 text-primary text-[11px] font-semibold inline-flex items-center justify-center shrink-0" title="' + PM.esc(p.naam) + '">'
      + PM.esc((p.voornaam || p.naam || '?').charAt(0).toUpperCase()) + '</span>';
  };

  // ── Datums (altijd YYYY-MM-DD, vergeleken met "vandaag" van de server) ────

  PM.vandaag = function () {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  };
  PM.plusDagen = function (iso, n) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  /** Einde van deze week (zondag), voor de groep "Deze week". */
  PM.eindeWeek = function () {
    var v = PM.vandaag();
    var dag = new Date(v + 'T12:00:00Z').getUTCDay(); // 0 = zondag
    return PM.plusDagen(v, dag === 0 ? 0 : 7 - dag);
  };
  var MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  PM.datumKort = function (iso) {
    if (!iso) return '';
    var v = PM.vandaag();
    if (iso === v) return 'Vandaag';
    if (iso === PM.plusDagen(v, 1)) return 'Morgen';
    if (iso === PM.plusDagen(v, -1)) return 'Gisteren';
    var d = new Date(iso + 'T12:00:00Z');
    var tekst = d.getUTCDate() + ' ' + MAANDEN[d.getUTCMonth()];
    if (iso > v && iso <= PM.plusDagen(v, 6)) tekst = DAGEN[d.getUTCDay()] + ' ' + tekst;
    if (iso.slice(0, 4) !== v.slice(0, 4)) tekst += ' ' + iso.slice(0, 4);
    return tekst;
  };
  PM.tijdstip = function (ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', timeZone: 'Europe/Brussels' })
      + ' om ' + d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
  };
  /** Klasse voor een vervaldatum: rood als ze voorbij is, groen voor vandaag. */
  PM.datumKlasse = function (taak) {
    if (!taak.due_date || taak.done) return 'opacity-60';
    var v = PM.vandaag();
    if (taak.due_date < v) return 'text-error font-medium';
    if (taak.due_date === v) return 'text-success font-medium';
    return 'opacity-70';
  };

  PM.odooUrl = function (taak) {
    if (!taak.odoo_model || !taak.odoo_id) return '';
    return PM.state.boot.odoo_origin + '/web#id=' + taak.odoo_id + '&model=' + encodeURIComponent(taak.odoo_model) + '&view_type=form';
  };

  // ── Navigatie ─────────────────────────────────────────────────────────────

  PM.leesAdres = function () {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var taak = null;
    var q = h.indexOf('?');
    if (q !== -1) {
      var m = /(?:^|&)taak=([^&]+)/.exec(h.slice(q + 1));
      if (m) taak = decodeURIComponent(m[1]);
      h = h.slice(0, q);
    }
    var delen = h.split('/').filter(Boolean);
    if (delen[0] === 'project' && delen[1]) {
      var w = delen[2] || 'lijst';
      if (w === 'bord') w = 'kanban';
      return { soort: 'project', id: delen[1], weergave: w, taak: taak };
    }
    return { soort: 'mijn', id: null, weergave: delen[1] === 'kalender' ? 'kalender' : 'lijst', taak: taak };
  };

  PM.adres = function (r) {
    var basis = r.soort === 'project' ? '#/project/' + r.id + (r.weergave && r.weergave !== 'lijst' ? '/' + r.weergave : '')
      : '#/mijn' + (r.weergave === 'kalender' ? '/kalender' : '');
    return basis + (r.taak ? '?taak=' + encodeURIComponent(r.taak) : '');
  };

  /** Naar een ander adres; de hashchange-luisteraar tekent opnieuw. */
  PM.ga = function (wijziging) {
    var r = Object.assign({}, PM.state.route, wijziging);
    var nieuw = PM.adres(r);
    if (location.hash === nieuw) PM.volgAdres();
    else location.hash = nieuw;
  };
})();
