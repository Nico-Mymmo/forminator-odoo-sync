/**
 * Dashboards — tabblad Marketing. Tot 2026-10-09 was dit de aparte module
 * Webgedrag (/webgedrag); de oude links sturen hierheen door.
 *
 * Het overzicht (trends en flows over alle bezoeken) staat in
 * dashboards-marketing-behaviour.js. Dit bestand doet de rest van het tabblad:
 *  - het TRAJECT van één lead, actieblad of bezoeker: zoeken bovenaan, of de link
 *    uit Odoo: /dashboards?tab=marketing&lead=<id> | &sheet=<id> | &visitor=<uuid>;
 *  - de INSTELLINGEN van het tabblad: wie uitgesloten is uit de cijfers, en de
 *    twijfelgevallen (beheerders). Bewust geen tabbladen: het zijn instellingen
 *    van dit dashboard, geen eigen schermen. Elk opent in een venster;
 *    &instelling=uitgesloten opent het eerste rechtstreeks.
 *
 * REGEL 3 uit CLAUDE.md: data-mk-*-attributen en één centrale listener. Praat
 * uitsluitend met /dashboards/api/marketing/*. De tijdlijn komt als HTML van de
 * tracker (dezelfde als in Odoo) en staat in een iframe (srcdoc), zodat haar
 * inline stijlen de pagina niet raken en andersom.
 *
 * Het tabblad wisselt dashboards-web.js (showTab); hier wordt enkel gekeken of
 * het paneel zichtbaar werd, zoals bij Verkoop, Targets en Kaart.
 */

(function () {
  'use strict';

  var root = document.querySelector('[data-dash-panel="marketing"]');
  if (!root) return;

  var BASE = '/dashboards/api/marketing';
  var ODOO = 'https://mymmo.odoo.com/web#';
  var KINDS = ['lead', 'sheet', 'visitor'];
  var state = { boot: null, bootPromise: null, view: 'overview', story: null, filterKanaal: '', filterPersoon: '', review: [], gekozen: {}, excl: null, exclKeuzes: [] };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  var SPINNER = '<div class="flex justify-center p-10"><span class="loading loading-spinner"></span></div>';

  /** Het overzicht (Gedrag) of het traject van één record. */
  function showView(name) {
    state.view = name;
    $('mkOverview').classList.toggle('hidden', name !== 'overview');
    $('mkDetail').classList.toggle('hidden', name !== 'detail');
    if (name === 'overview' && window.WebGedragBehaviour) window.WebGedragBehaviour.load();
  }

  /** Lead, actieblad of bezoeker in de adresbalk zetten (of weghalen), zodat herladen en delen werken. */
  function zetUrl(kind, id) {
    var u = new URL(window.location.href);
    KINDS.forEach(function (k) { u.searchParams.delete(k); });
    if (kind) { u.searchParams.set('tab', 'marketing'); u.searchParams.set(kind, id); }
    history.replaceState(null, '', u.toString());
  }

  function toast(msg, soort) {
    // Een open venster ligt in de top layer van de browser: een melding erbuiten
    // valt eronder. Staat er een venster open, dan komt de melding daarin.
    var dlg = document.querySelector('dialog[open]');
    var host = dlg ? dlg.querySelector('[data-mk-toast]') : $('mkToastHost');
    if (!host && dlg) {
      host = document.createElement('div');
      host.className = 'toast toast-end z-50';
      host.setAttribute('data-mk-toast', '');
      dlg.appendChild(host);
    }
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : 'alert-success') + ' text-sm';
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }
  async function api(pad, opties) {
    var res = await fetch(BASE + pad, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opties || {}));
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || ('Fout ' + res.status));
    return data.data;
  }
  function ms(ts) { return ts ? Date.parse(String(ts).replace(' ', 'T') + 'Z') : 0; }
  function datum(ts, metUur) {
    if (!ts) return '';
    var o = { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' };
    if (metUur) { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
    return new Date(ms(ts)).toLocaleString('nl-BE', o);
  }
  function kleur(ch) { return (state.boot && state.boot.colors && state.boot.colors[ch]) || '#6b7280'; }
  function chip(ch, extra) {
    var c = kleur(ch);
    return '<span class="badge badge-sm whitespace-nowrap" style="background-color:' + c + '1a;color:' + c + ';border-color:' + c + '40">'
      + esc(ch) + (extra ? ' ' + esc(extra) : '') + '</span>';
  }
  function persoonLabel(email, uuid) { return email || ('browser ' + String(uuid || '').slice(0, 8)); }
  function odooLink(model, id) { return ODOO + 'id=' + id + '&model=' + model + '&view_type=form'; }

  // De stand van een lead (leadStatus() in story-data.js): gewonnen, verloren,
  // gearchiveerd, lead, lopend. Met tekst, nooit enkel een kleur.
  var STATUS_BADGE = { won: 'badge-success', lost: 'badge-error badge-outline', archived: 'badge-ghost', lead: 'badge-info badge-outline', open: 'badge-primary badge-outline' };
  function statusBadge(s) {
    return s ? ' <span class="badge badge-sm whitespace-nowrap ' + (STATUS_BADGE[s.key] || '') + '">' + esc(s.label) + '</span>' : '';
  }

  // Uitgesloten uit de cijfers (web-story/lib/exclusions.js): een badge waar het zo
  // is, en voor beheerders en marketing de knop om dat te wijzigen. Het traject zelf blijft volledig.
  function uitBadge(r) {
    return r ? ' <span class="badge badge-sm badge-neutral whitespace-nowrap" title="'
      + esc('Telt niet mee in de cijfers' + (r.reason ? ': ' + r.reason : '')) + '">uitgesloten</span>' : '';
  }
  function uitKnop(r, uuid, norms, label) {
    if (!state.boot || !state.boot.can_exclude) return '';   // beheerders en marketing
    if (r) {
      return '<button class="btn btn-xs btn-ghost" data-mk-action="excl-remove" data-id="' + esc(r.id) + '" title="'
        + esc('Uitgesloten via ' + r.label) + '">Weer laten meetellen</button>';
    }
    return '<button class="btn btn-xs btn-ghost" data-mk-action="excl-open" data-uuid="' + esc(uuid) + '" data-norms="'
      + esc((norms || []).join(',')) + '" data-label="' + esc(label || '') + '">Uitsluiten uit de cijfers</button>';
  }

  // ── Traject: laden ─────────────────────────────────────────────────────────

  /** De instellingenvensters sluiten: wie vanuit een lijst een traject opent, wil het traject zien. */
  function sluitInstellingen() {
    ['mkReviewDialog', 'mkExcludedDialog'].forEach(function (id) { var d = $(id); if (d && d.open) d.close(); });
  }

  async function open(kind, id) {
    sluitInstellingen();
    showView('detail');
    window.scrollTo(0, 0);
    $('mkSearchResults').innerHTML = '';
    $('mkStoryHost').innerHTML = SPINNER;
    zetUrl(kind, id);
    try {
      state.story = await api('/' + kind + '/' + encodeURIComponent(id));
      state.filterKanaal = '';
      state.filterPersoon = '';
      renderStory();
    } catch (e) {
      $('mkStoryHost').innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
    }
  }

  async function zoek(q) {
    if (!q) return;
    showView('detail');
    $('mkStoryHost').innerHTML = '';
    $('mkSearchResults').innerHTML = SPINNER;
    var r = await api('/search?q=' + encodeURIComponent(q));
    if (r.leads.length === 1 && !r.visitors.length) return open('lead', r.leads[0].id);
    if (!r.leads.length && r.visitors.length === 1) return open('visitor', r.visitors[0].uuid);
    var html = '';
    if (!r.leads.length && !r.visitors.length) html = '<div class="alert">Niets gevonden voor "' + esc(q) + '".</div>';
    if (r.leads.length) {
      html += '<div class="card bg-base-100 mb-3"><div class="card-body p-4"><h3 class="font-semibold text-sm mb-2">Leads</h3><ul class="menu menu-sm p-0">'
        + r.leads.map(function (l) {
          return '<li><a data-mk-action="open" data-kind="lead" data-id="' + l.id + '">' + esc(l.name) + statusBadge(l.status) + ' <span class="opacity-60">' + esc(l.email_from || '') + ' · #' + l.id + '</span></a></li>';
        }).join('') + '</ul></div></div>';
    }
    if (r.visitors.length) {
      html += '<div class="card bg-base-100"><div class="card-body p-4"><h3 class="font-semibold text-sm mb-2">Bezoekers (browsers) met dit adres</h3><ul class="menu menu-sm p-0">'
        + r.visitors.map(function (v) {
          return '<li><a data-mk-action="open" data-kind="visitor" data-id="' + esc(v.uuid) + '">' + esc(v.uuid.slice(0, 8)) + ' <span class="opacity-60">' + esc(v.site || '') + ' · laatst ' + esc(datum(v.last_seen)) + '</span></a></li>';
        }).join('') + '</ul></div></div>';
    }
    $('mkSearchResults').innerHTML = html;
  }

  // ── Traject: tekenen ───────────────────────────────────────────────────────

  function recordKaart(s) {
    var r = s.record;
    var titel, meta = [], links = '';
    if (s.kind === 'lead') {
      titel = r.name;
      if (r.email) meta.push(esc(r.email));
      if (r.owner) meta.push('verantwoordelijke: ' + esc(r.owner.name));
      if (r.status) meta.push(statusBadge(r.status).trim());   // bevat de fase bij een lopende verkoopkans
      meta.push('aangemaakt ' + esc(datum(r.created)));
      links = '<a class="btn btn-xs" target="_blank" rel="noopener" href="' + odooLink('crm.lead', r.id) + '">Open in Odoo</a>'
        + (s.sheets || []).map(function (sh) {
          return '<a class="btn btn-xs btn-ghost" data-mk-action="open" data-kind="sheet" data-id="' + sh.id + '">Actieblad ' + esc(sh.name || '#' + sh.id) + '</a>';
        }).join('');
    } else if (s.kind === 'sheet') {
      titel = 'Actieblad ' + (r.name || '#' + r.id);
      meta.push((s.leads || []).length + ' lead(s)');
      links = '<a class="btn btn-xs" target="_blank" rel="noopener" href="' + odooLink('x_sales_action_sheet', r.id) + '">Open in Odoo</a>'
        + (s.leads || []).map(function (l) {
          return '<a class="btn btn-xs btn-ghost" data-mk-action="open" data-kind="lead" data-id="' + l.id + '">' + esc(l.name) + statusBadge(l.status) + '</a>';
        }).join('');
    } else {
      titel = persoonLabel(r.email, r.uuid);
      meta.push(esc(r.site || ''));
      meta.push('eerste bezoek ' + esc(datum(r.first_seen)) + ', laatste ' + esc(datum(r.last_seen)));
      if (r.internal) meta.push('<span class="badge badge-sm badge-warning">intern / test</span>');
      if (r.gedeeld) meta.push('<span class="badge badge-sm badge-info badge-outline">gedeelde browser</span>');
      if ((r.emails || []).length > 1) meta.push('adressen: ' + r.emails.map(function (m) { return esc(m.email); }).join(', '));
      if (r.bot) meta.push('<span class="badge badge-sm">bot</span>');
      if (r.uitgesloten) meta.push(uitBadge(r.uitgesloten).trim());
      links = uitKnop(r.uitgesloten, r.uuid, r.norms, persoonLabel(r.email, r.uuid)) + (s.leads || []).map(function (l) {
        return '<a class="btn btn-xs btn-ghost" data-mk-action="open" data-kind="lead" data-id="' + l.res_id + '">' + esc(l.name || '#' + l.res_id) + statusBadge(l.status) + '</a>';
      }).join('');
    }
    var push = (s.kind !== 'visitor' && state.boot && state.boot.mode === 'on')
      ? '<button class="btn btn-xs btn-outline" data-mk-action="push" data-kind="' + s.kind + '" data-id="' + r.id + '"><i data-lucide="refresh-cw" class="w-3 h-3"></i> Odoo nu bijwerken</button>' : '';
    return '<div class="card bg-base-100 mb-4"><div class="card-body p-5">'
      + '<div class="flex flex-wrap justify-between gap-2"><h2 class="card-title">' + esc(titel) + '</h2>' + push + '</div>'
      + '<div class="text-sm opacity-70">' + meta.join(' · ') + '</div>'
      + (links ? '<div class="flex flex-wrap gap-1 mt-2">' + links + '</div>' : '')
      + '</div></div>';
  }

  function aanraking(t) {
    if (!t) return '<span class="opacity-60">geen — enkel directe bezoeken</span>';
    return chip(t.channel) + (t.detail ? ' <span class="opacity-80">' + esc(t.detail) + '</span>' : '') + ' <span class="opacity-50">· ' + esc(datum(t.ts)) + '</span>';
  }

  function verhaalKaart(j) {
    if (!j) return '<div class="alert mb-4">Nog geen bezoeken gekoppeld.</div>';
    var pad = j.pad.map(function (p) { return chip(p.channel, p.n > 1 ? '×' + p.n : ''); }).join(' <span class="opacity-40">→</span> ')
      + (j.conversie ? ' <span class="opacity-40">→</span> ' + chip(j.conversie.opSite ? 'Conversie op de site' : 'Lead aangemaakt') : '');
    var feiten = [j.sessies + ' bezoek' + (j.sessies === 1 ? '' : 'en')];
    if (j.personen > 1) feiten.push(j.personen + ' personen');
    if (j.dagen !== null) feiten.push(j.dagen === 0 ? 'dezelfde dag' : j.dagen + ' dagen tot de conversie');
    if (j.na) feiten.push(j.na + ' bezoek' + (j.na === 1 ? '' : 'en') + ' erna');
    var rij = function (l, v) { return '<tr><th class="w-44 font-normal opacity-60 align-top">' + l + '</th><td>' + v + '</td></tr>'; };
    return '<div class="card bg-base-100 mb-4"><div class="card-body p-5"><h3 class="font-semibold mb-1">Hoe ze bij ons kwamen</h3>'
      + '<table class="table table-sm"><tbody>'
      + rij('Eerste aanraking', aanraking(j.eerste)) + rij('Laatste aanraking', aanraking(j.laatste))
      + rij('Pad', '<div class="flex flex-wrap gap-1 items-center">' + pad + '</div>') + rij('Samengevat', esc(feiten.join(' · ')))
      + '</tbody></table></div></div>';
  }

  var STERKTE = { zeker: 'badge-success', sterk: 'badge-info', middel: 'badge-warning' };
  var BRON = {
    'inzending': 'vulde zelf het formulier in', 'inzending-andere-site': 'zelfde persoon, andere site',
    'email-lead': 'adres staat op de lead', 'email-contact': 'adres van de klant', 'vme-collega': 'collega bij dezelfde VME',
    'odoo-koppeling': 'koppeling uit Odoo (historiek)', 'beoordeling': 'door een collega gekoppeld',
  };

  function personenKaart(s) {
    if (s.kind === 'visitor' || !(s.links || []).length) return '';
    var rows = s.links.map(function (l) {
      var acties = s.kind === 'lead'
        ? (l.status !== 'bevestigd' ? '<button class="btn btn-xs btn-ghost text-success" data-mk-action="judge" data-status="bevestigd" data-uuid="' + l.visitor_uuid + '" data-res="' + l.res_id + '">Bevestig</button>' : '')
          + (l.status !== 'afgewezen' ? '<button class="btn btn-xs btn-ghost text-error" data-mk-action="judge" data-status="afgewezen" data-uuid="' + l.visitor_uuid + '" data-res="' + l.res_id + '">Hoort er niet bij</button>' : '')
          + (l.status !== 'actief' ? '<button class="btn btn-xs btn-ghost" data-mk-action="judge" data-status="actief" data-uuid="' + l.visitor_uuid + '" data-res="' + l.res_id + '">Herstel</button>' : '')
        : '';
      var status = l.status === 'actief' ? '' : '<span class="badge badge-sm ' + (l.status === 'bevestigd' ? 'badge-success' : 'badge-ghost') + '">' + esc(l.status) + '</span>';
      return '<tr class="' + (l.status === 'afgewezen' ? 'opacity-50' : '') + '">'
        + '<td><a class="link link-hover" data-mk-action="open" data-kind="visitor" data-id="' + l.visitor_uuid + '">' + esc(persoonLabel(l.email, l.visitor_uuid)) + '</a>'
        + (l.is_internal ? ' <span class="badge badge-sm badge-warning" title="Een collega-browser: telt niet mee in de cijfers">intern / test</span>' : '')
        + uitBadge(l.uitgesloten)
        + (l.gedeeld ? ' <span class="badge badge-sm badge-info badge-outline" title="Deze browser gebruikte meerdere adressen">gedeelde browser</span>'
          + '<div class="text-xs opacity-60">ook: ' + esc((l.emails || []).filter(function (m) { return m !== l.email; }).join(', ')) + '</div>' : '')
        + '</td>'
        + '<td class="text-sm">' + esc(BRON[l.bron] || l.bron) + '</td>'
        + '<td><span class="badge badge-sm ' + (STERKTE[l.sterkte] || '') + '">' + esc(l.sterkte) + '</span> ' + status + '</td>'
        + '<td class="text-sm opacity-70 whitespace-nowrap">' + esc(datum(l.last_seen)) + '</td>'
        + '<td class="text-right whitespace-nowrap">' + acties + uitKnop(l.uitgesloten, l.visitor_uuid, l.norms, persoonLabel(l.email, l.visitor_uuid)) + '</td></tr>';
    }).join('');
    return '<div class="card bg-base-100 mb-4"><div class="card-body p-5"><h3 class="font-semibold">Wie keek er</h3>'
      + '<p class="text-xs opacity-60">Elke rij is een browser. Dezelfde persoon op gsm en laptop zijn twee rijen.</p>'
      + '<div class="overflow-x-auto"><table class="table table-sm"><thead><tr><th>Persoon</th><th>Waarom gekoppeld</th><th>Zekerheid</th><th>Laatst</th><th></th></tr></thead><tbody>'
      + rows + '</tbody></table></div>'
      + (s.afgekapt ? '<p class="text-xs opacity-60">De tijdlijn toont de 50 meest recente browsers; ' + s.afgekapt + ' oudere vallen weg.</p>' : '')
      + '</div></div>';
  }

  function sessiesKaart(s) {
    var sessies = (s.sessions || []).slice().reverse();
    if (!sessies.length) return '';
    var kanalen = {}, personen = {};
    sessies.forEach(function (x) { kanalen[x.channel] = true; personen[x.person || x.uuid] = persoonLabel(x.person, x.uuid); });
    var lijst = sessies.filter(function (x) {
      return (!state.filterKanaal || x.channel === state.filterKanaal) && (!state.filterPersoon || (x.person || x.uuid) === state.filterPersoon);
    });
    var opt = function (obj, sel, labels) {
      return Object.keys(obj).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(labels ? obj[k] : k) + '</option>'; }).join('');
    };
    var rows = lijst.map(function (x) {
      var conv = [];
      // Een offerte is ook een formulier: enkel het formulier tonen als er meer was dan de offerte.
      if (x.conversions.offerte) conv.push('<span class="badge badge-sm badge-warning">offerte</span>');
      if (x.conversions.forms > (x.conversions.offerte || 0)) conv.push('<span class="badge badge-sm badge-warning">formulier</span>');
      if (x.conversions.calendly) conv.push('<span class="badge badge-sm badge-success">afspraak</span>');
      if (x.conversions.events) conv.push('<span class="badge badge-sm badge-info">inschrijving</span>');
      var pages = x.pages.slice(0, 3).map(esc).join(', ') + (x.pages.length > 3 ? ' <span class="opacity-50">+' + (x.pages.length - 3) + '</span>' : '');
      return '<tr><td class="whitespace-nowrap text-sm">' + esc(datum(x.start, true)) + '</td>'
        + '<td class="text-sm">' + esc(persoonLabel(x.person, x.uuid))
        + (x.intern ? ' <span class="badge badge-xs badge-warning">intern / test</span>' : '')
        + (x.gedeeld ? ' <span class="badge badge-xs badge-info badge-outline" title="Gedeelde browser: het adres dat op dat moment in gebruik was">~</span>' : '')
        + (x.test ? ' <span class="badge badge-xs">testpagina</span>' : '')
        + (x.uitgesloten ? ' <span class="badge badge-xs badge-neutral" title="Telt niet mee in de cijfers">uitgesloten</span>' : '') + '</td>'
        + '<td>' + chip(x.historic && x.channel === 'Direct / onbekend' ? 'Zonder campagne (oude historiek)' : x.channel) + (x.detail ? '<div class="text-xs opacity-60">' + esc(x.detail) + '</div>' : '')
        // Een heropende advertentielink is GEEN nieuwe klik (channelOf in web-visits.js);
        // bij de oude historiek is dat niet na te gaan, en dat staat er dan bij.
        + (x.reopened ? '<div class="text-xs opacity-60">zelfde klik-id als de advertentieklik van ' + esc(datum(x.reopened)) + ': geen nieuwe klik</div>' : '')
        + (x.klikOnbekend ? '<div class="text-xs opacity-50">oude historiek: of dit een nieuwe klik was, is niet bewaard</div>' : '') + '</td>'
        + '<td class="text-xs">' + pages + '</td><td>' + conv.join(' ') + '</td></tr>';
    }).join('');
    return '<div class="card bg-base-100 mb-4"><div class="card-body p-5">'
      + '<div class="flex flex-wrap justify-between items-center gap-2"><h3 class="font-semibold">Alle bezoeken (' + lijst.length + ')</h3>'
      + '<div class="flex gap-2"><select class="select select-xs select-bordered" data-mk-filter="kanaal"><option value="">Alle kanalen</option>' + opt(kanalen, state.filterKanaal) + '</select>'
      + '<select class="select select-xs select-bordered" data-mk-filter="persoon"><option value="">Alle personen</option>' + opt(personen, state.filterPersoon, true) + '</select></div></div>'
      + '<div class="overflow-x-auto max-h-[28rem]"><table class="table table-sm table-pin-rows"><thead><tr><th>Wanneer</th><th>Wie</th><th>Kanaal</th><th>Pagina\'s</th><th></th></tr></thead><tbody>'
      + rows + '</tbody></table></div></div></div>';
  }

  function tijdlijnKaart(s) {
    if (!s.timeline_html) return '';
    return '<div class="card bg-base-100"><div class="card-body p-5"><h3 class="font-semibold mb-2">Tijdlijn (zoals in Odoo)</h3>'
      + '<iframe id="mkTimelineFrame" class="w-full border-0" style="min-height:400px" sandbox="allow-same-origin allow-popups"></iframe></div></div>';
  }

  function renderStory() {
    var s = state.story;
    $('mkStoryHost').innerHTML = recordKaart(s) + verhaalKaart(s.journey) + personenKaart(s) + sessiesKaart(s) + tijdlijnKaart(s);
    var f = $('mkTimelineFrame');
    if (f) {
      f.srcdoc = '<!doctype html><meta charset="utf-8"><base target="_blank"><body style="margin:0;font-family:system-ui,sans-serif">'
        + (s.kpi_html || '') + s.timeline_html + '</body>';
      f.onload = function () { try { f.style.height = (f.contentDocument.body.scrollHeight + 20) + 'px'; } catch (_) { /* geen toegang */ } };
    }
    icons();
  }

  // ── Instellingen ───────────────────────────────────────────────────────────

  /** naam: 'excluded' (wie niet meetelt) of 'review' (twijfelgevallen, beheerders). */
  function openInstelling(naam) {
    if (naam === 'review') {
      if (!state.boot || !state.boot.is_admin) return;
      $('mkReviewDialog').showModal();
      laadReview().catch(function (err) { toast(err.message, 'error'); });
      return;
    }
    $('mkExcludedDialog').showModal();
    laadUitgesloten().catch(function (err) { toast(err.message, 'error'); });
  }

  async function laadReview() {
    var host = $('mkReviewHost');
    host.innerHTML = '<span class="loading loading-spinner"></span>';
    state.review = await api('/review');
    state.gekozen = {};
    if (!state.review.length) { host.innerHTML = '<p class="opacity-70 text-sm">Geen twijfelgevallen.</p>'; return; }
    host.innerHTML = '<table class="table table-sm"><thead><tr><th><input type="checkbox" class="checkbox checkbox-xs" data-mk-action="select-all"></th>'
      + '<th>Lead</th><th>Bezoeker</th><th>Verantwoordelijke</th><th>Laatst</th></tr></thead><tbody>'
      + state.review.map(function (r, i) {
        return '<tr><td><input type="checkbox" class="checkbox checkbox-xs" data-mk-action="select" data-i="' + i + '"></td>'
          + '<td><a class="link link-hover" data-mk-action="open" data-kind="lead" data-id="' + r.res_id + '">' + esc(r.lead_name || '#' + r.res_id) + '</a>' + statusBadge(r.status)
          + '<div class="text-xs opacity-60">' + esc(r.lead_email || '') + (r.partner ? ' · ' + esc(r.partner.name) : '') + '</div></td>'
          + '<td class="text-sm">' + esc(persoonLabel(r.email, r.visitor_uuid))
          + (r.gedeeld ? '<div class="text-xs opacity-70"><span class="badge badge-xs badge-info badge-outline">gedeelde browser</span> ook: '
            + esc((r.emails || []).filter(function (m) { return m !== r.email; }).join(', ')) + '</div>' : '') + '</td>'
          + '<td class="text-sm">' + esc(r.owner ? r.owner.name : '') + '</td>'
          + '<td class="text-sm opacity-70">' + esc(datum(r.last_seen)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function beoordeel(changes) {
    await api('/links', { method: 'POST', body: JSON.stringify({ changes: changes }) });
    toast(changes.length === 1 ? 'Bewaard.' : changes.length + ' koppelingen bewaard.');
  }

  /** t = { uuid, norms: [herleide adressen van die browser], label } */
  function openUitsluiten(t) {
    var dlg = $('mkExclDialog');
    if (!dlg) return;
    var norms = (t.norms || []).filter(Boolean);
    // [soort, waarde, titel, uitleg]
    var keuzes = norms.map(function (n) {
      return ['email', n, 'Deze persoon: ' + n, 'Elke browser die dit adres ooit gebruikte, ook een nieuwe na gewiste cookies of op een ander toestel.'];
    });
    keuzes.push(['visitor', t.uuid, 'Enkel deze browser (' + String(t.uuid).slice(0, 8) + ')',
      norms.length ? 'Op een ander toestel of in een andere browser telt deze persoon nog mee.'
        : 'Deze bezoeker liet geen adres achter: enkel deze browser kan uitgesloten worden.']);
    // Eén adres: de persoon. Een gedeelde browser (twee adressen): standaard enkel de
    // browser, anders sluit je stil de andere persoon mee uit.
    var standaard = norms.length === 1 ? 0 : keuzes.length - 1;
    state.exclKeuzes = keuzes;
    $('mkExclWho').textContent = t.label || persoonLabel(null, t.uuid);
    $('mkExclChoices').innerHTML = (norms.length > 1
      ? '<p class="text-xs rounded-lg bg-info/10 p-2">Gedeelde browser: hier werden ' + norms.length + ' adressen gebruikt. Kies welke persoon je uitsluit, of enkel deze browser.</p>' : '')
      + keuzes.map(function (k, i) {
        return '<label class="flex items-start gap-3 rounded-lg border border-base-content/10 p-3 cursor-pointer om-hover">'
          + '<input type="radio" name="mkExclScope" class="radio radio-sm radio-primary mt-0.5" value="' + i + '"' + (i === standaard ? ' checked' : '') + '>'
          + '<span><span class="block text-sm font-medium">' + esc(k[2]) + '</span><span class="block text-xs opacity-60">' + esc(k[3]) + '</span></span></label>';
      }).join('');
    $('mkExclReason').value = '';
    dlg.showModal();
  }

  async function bewaarUitsluiten() {
    var gekozen = document.querySelector('input[name="mkExclScope"]:checked');
    if (!gekozen) { toast('Kies wat je uitsluit.', 'error'); return; }
    var k = state.exclKeuzes[Number(gekozen.value)];
    await api('/exclusions', { method: 'POST', body: JSON.stringify({ kind: k[0], value: k[1], reason: $('mkExclReason').value.trim() }) });
    $('mkExclDialog').close();
    toast('Uitgesloten: telt niet meer mee in de cijfers.');
    await naWijziging();
  }

  async function weerMeetellen(id) {
    await api('/exclusions/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Telt weer mee in de cijfers.');
    await naWijziging();
  }

  /** Na een wijziging: het overzicht opnieuw laten tellen, en herladen wat open staat. */
  async function naWijziging() {
    if (window.WebGedragBehaviour && window.WebGedragBehaviour.reload) window.WebGedragBehaviour.reload();
    if ($('mkExcludedDialog').open) await laadUitgesloten();
    if (state.story && state.view === 'detail' && !$('mkExcludedDialog').open) {
      var r = state.story.record;
      await open(state.story.kind, state.story.kind === 'visitor' ? r.uuid : r.id);
    }
  }

  function sindsTekst(iso) {
    var t = Date.parse(iso || '');
    return isNaN(t) ? '' : new Date(t).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function laadUitgesloten() {
    var host = $('mkExclHost');
    host.innerHTML = '<span class="loading loading-spinner"></span>';
    var d = await api('/exclusions');
    state.excl = d;
    $('mkExclAddForm').classList.toggle('hidden', !d.can_exclude);
    if (!d.rules.length) { host.innerHTML = '<p class="opacity-70 text-sm">Niemand uitgesloten: iedereen telt mee.</p>'; return; }
    host.innerHTML = '<table class="table table-sm"><thead><tr><th>Wie</th><th>Wat</th><th>Waarom</th><th>Door</th><th>Sinds</th><th>Laatst op de site</th><th></th></tr></thead><tbody>'
      + d.rules.map(function (r) {
        return '<tr><td class="text-sm">' + esc(r.label || r.value) + '</td>'
          + '<td class="text-xs whitespace-nowrap">' + (r.kind === 'email' ? 'persoon · ' + r.browsers + (r.browsers === 1 ? ' browser' : ' browsers') : 'één browser') + '</td>'
          + '<td class="text-sm">' + esc(r.reason || '') + '</td>'
          + '<td class="text-xs opacity-70">' + esc(r.created_by_email || '') + '</td>'
          + '<td class="text-xs opacity-70 whitespace-nowrap">' + esc(sindsTekst(r.created_at)) + '</td>'
          + '<td class="text-xs opacity-70 whitespace-nowrap">' + esc(r.last_seen ? datum(r.last_seen) : '—') + '</td>'
          + '<td class="text-right whitespace-nowrap">'
          + (r.visitor ? '<button class="btn btn-xs btn-ghost" data-mk-action="open" data-kind="visitor" data-id="' + esc(r.visitor) + '">Traject</button>' : '')
          + (d.can_exclude ? '<button class="btn btn-xs btn-ghost" data-mk-action="excl-remove" data-id="' + esc(r.id) + '">Weer laten meetellen</button>' : '')
          + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ── Centrale listeners ─────────────────────────────────────────────────────
  // Op document en niet op het paneel: de instellingen staan in vensters buiten
  // het paneel, en Website-bezoeken opent de lijst Uitgesloten ook.

  document.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-mk-action]');
    if (!el) return;
    var a = el.dataset.mkAction;
    try {
      if (a === 'open') {
        e.preventDefault();
        await open(el.dataset.kind, el.dataset.id);
      } else if (a === 'back') {
        zetUrl(null);
        showView('overview');
      } else if (a === 'settings') {
        e.preventDefault();
        var menu = el.closest('details');
        if (menu) menu.removeAttribute('open');
        openInstelling(el.dataset.value);
      } else if (a === 'judge') {
        await beoordeel([{ uuid: el.dataset.uuid, res_id: Number(el.dataset.res), status: el.dataset.status }]);
        await open('lead', state.story.record.id);
      } else if (a === 'push') {
        el.disabled = true;
        var r = await api('/push/' + el.dataset.kind + '/' + el.dataset.id, { method: 'POST' });
        toast(r.geschreven ? 'Odoo is bijgewerkt.' : 'Niets te schrijven.');
        el.disabled = false;
      } else if (a === 'excl-open') {
        openUitsluiten({ uuid: el.dataset.uuid, norms: el.dataset.norms ? el.dataset.norms.split(',') : [], label: el.dataset.label });
      } else if (a === 'excl-save') {
        el.disabled = true;
        await bewaarUitsluiten();
        el.disabled = false;
      } else if (a === 'excl-remove') {
        el.disabled = true;
        await weerMeetellen(el.dataset.id);
      } else if (a === 'select') {
        state.gekozen[el.dataset.i] = el.checked;
      } else if (a === 'select-all') {
        document.querySelectorAll('[data-mk-action="select"]').forEach(function (c) { c.checked = el.checked; state.gekozen[c.dataset.i] = el.checked; });
      } else if (a === 'bulk') {
        var changes = state.review.filter(function (_, i) { return state.gekozen[i]; })
          .map(function (x) { return { uuid: x.visitor_uuid, res_id: x.res_id, status: el.dataset.status }; });
        if (!changes.length) return toast('Selecteer eerst rijen.', 'error');
        await beoordeel(changes);
        await laadReview();
      }
    } catch (err) {
      el.disabled = false;
      toast(err.message, 'error');
    }
  });

  // Een open instellingenmenu sluit bij een klik ernaast.
  document.addEventListener('click', function (e) {
    var menu = $('mkSettingsMenu');
    if (menu && menu.open && !menu.contains(e.target)) menu.removeAttribute('open');
  });

  document.addEventListener('change', function (e) {
    var f = e.target.closest('[data-mk-filter]');
    if (!f) return;
    if (f.dataset.mkFilter === 'kanaal') state.filterKanaal = f.value;
    else state.filterPersoon = f.value;
    renderStory();
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id === 'mkSearchForm') {
      e.preventDefault();
      zoek($('mkSearchInput').value.trim()).catch(function (err) { $('mkSearchResults').innerHTML = ''; toast(err.message, 'error'); });
      return;
    }
    if (e.target.id !== 'mkExclAddForm') return;
    e.preventDefault();
    var v = $('mkExclAddValue').value.trim();
    if (!v) return;
    var kind = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? 'visitor' : 'email';
    api('/exclusions', { method: 'POST', body: JSON.stringify({ kind: kind, value: v, reason: $('mkExclAddReason').value.trim() }) })
      .then(function () {
        $('mkExclAddValue').value = '';
        $('mkExclAddReason').value = '';
        toast('Uitgesloten: telt niet meer mee in de cijfers.');
        return naWijziging();
      })
      .catch(function (err) { toast(err.message, 'error'); });
  });

  // Voor dashboards-marketing-behaviour.js: een bezoek aanklikken opent het traject.
  // De naam (WebGedrag) bleef staan bij de verhuizing uit de module Webgedrag.
  window.WebGedrag = {
    open: function (kind, id) { open(kind, id); },
    colors: {},
    // Uitsluiten vanuit het overzicht (de waarschuwing "komt van één persoon").
    exclude: function (t) { openUitsluiten(t); },
    // Mag deze gebruiker uitsluiten? Beheerders en marketing (mayExclude in marketing-routes.js).
    canExclude: function () { return !!(state.boot && state.boot.can_exclude); },
  };

  // ── Start: pas als het tabblad zichtbaar wordt ─────────────────────────────

  function boot() {
    if (!state.bootPromise) {
      state.bootPromise = api('/bootstrap').then(function (b) {
        state.boot = b;
        window.WebGedrag.colors = b.colors || {};
        $('mkReviewItem').classList.toggle('hidden', !b.is_admin);
        if (b.mode !== 'on') {
          $('mkModeWarning').classList.remove('hidden');
          $('mkModeWarningText').textContent = 'Dit scherm is live. In Odoo staat het verhaal nog niet: WEB_STORY_MODE staat op "'
            + (b.mode || 'uit') + '", de tracker schrijft de tijdlijn op de lead voorlopig nog zelf.';
        }
        return b;
      }).catch(function (err) { state.bootPromise = null; throw err; });
    }
    return state.bootPromise;
  }

  var gestart = false;
  async function activeer() {
    var eerste = !gestart;
    gestart = true;
    try {
      // Eerst de kanaalkleuren en de rechten: het overzicht tekent ermee.
      await boot();
      if (eerste) {
        var q = new URL(window.location.href).searchParams;
        var kind = KINDS.filter(function (k) { return q.get(k); })[0];
        if (kind) await open(kind, q.get(kind));
        else showView('overview');
        if (q.get('instelling') === 'uitgesloten') {
          var u = new URL(window.location.href);
          u.searchParams.delete('instelling');
          history.replaceState(null, '', u.toString());
          openInstelling('excluded');
        }
      } else if (state.view === 'detail' && state.story) {
        // Terug van een ander tabblad: showTab haalde de lead uit de adresbalk.
        var rec = state.story.record;
        zetUrl(state.story.kind, state.story.kind === 'visitor' ? rec.uuid : rec.id);
      } else {
        showView('overview');   // laadt de eerste keer, tekent daarna de linten opnieuw
      }
    } catch (err) {
      gestart = !eerste;
      toast(err.message, 'error');
    }
    icons();
  }

  function zichtbaar() { return !root.classList.contains('hidden'); }
  new MutationObserver(function () { if (zichtbaar()) activeer(); })
    .observe(root, { attributes: true, attributeFilter: ['class'] });
  if (zichtbaar()) activeer();
})();
