/**
 * Webgedrag — het verhaal van een lead, actieblad of bezoeker.
 *
 * REGEL 3 uit CLAUDE.md: event handlers via data-attributen + één centrale
 * listener. Praat uitsluitend met /webgedrag/api/*. De tijdlijn komt als HTML
 * van de tracker (dezelfde als in Odoo) en staat in een iframe (srcdoc), zodat
 * haar inline stijlen de pagina niet raken en andersom.
 *
 * Openen vanuit Odoo: /webgedrag?lead=<id> | ?sheet=<id> | ?visitor=<uuid>
 *
 * Vier panelen: Gedrag (trends over alle bezoeken, webgedrag-behaviour.js),
 * Traject (één lead/actieblad/bezoeker, hieronder), Twijfelgevallen en
 * Uitgesloten (wie niet meetelt in de cijfers, src/modules/web-story/lib/exclusions.js).
 * ?tab=uitgesloten opent dat laatste rechtstreeks (link vanuit het dashboard).
 */

(function () {
  'use strict';

  var BASE = '/webgedrag/api';
  var ODOO = 'https://mymmo.odoo.com/web#';
  var state = { boot: null, story: null, filterKanaal: '', filterPersoon: '', review: [], gekozen: {}, excl: null, exclKeuzes: [] };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  function showPanel(name) {
    document.querySelectorAll('[data-story-tab]').forEach(function (t) { t.classList.toggle('tab-active', t.dataset.storyTab === name); });
    $('panelBehaviour').classList.toggle('hidden', name !== 'behaviour');
    $('panelDetail').classList.toggle('hidden', name !== 'detail');
    $('panelReview').classList.toggle('hidden', name !== 'review');
    if ($('panelExcluded')) $('panelExcluded').classList.toggle('hidden', name !== 'excluded');
    if (name === 'detail') $('detailTab').classList.remove('hidden');
    if (name === 'behaviour' && window.WebGedragBehaviour) window.WebGedragBehaviour.load();
    if (name === 'review') laadReview().catch(function (err) { toast(err.message, 'error'); });
    if (name === 'excluded') laadUitgesloten().catch(function (err) { toast(err.message, 'error'); });
  }
  function toast(msg, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : 'alert-success') + ' text-sm';
    el.textContent = msg;
    $('toastHost').appendChild(el);
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

  // Uitgesloten uit de cijfers (lib/exclusions.js): een badge waar het zo is, en
  // voor beheerders de knop om dat te wijzigen. Het traject zelf blijft volledig.
  function uitBadge(r) {
    return r ? ' <span class="badge badge-sm badge-neutral whitespace-nowrap" title="'
      + esc('Telt niet mee in de cijfers' + (r.reason ? ': ' + r.reason : '')) + '">uitgesloten</span>' : '';
  }
  function uitKnop(r, uuid, norms, label) {
    if (!state.boot || !state.boot.is_admin) return '';
    if (r) {
      return '<button class="btn btn-xs btn-ghost" data-action="excl-remove" data-id="' + esc(r.id) + '" title="'
        + esc('Uitgesloten via ' + r.label) + '">Weer laten meetellen</button>';
    }
    return '<button class="btn btn-xs btn-ghost" data-action="excl-open" data-uuid="' + esc(uuid) + '" data-norms="'
      + esc((norms || []).join(',')) + '" data-label="' + esc(label || '') + '">Uitsluiten uit de cijfers</button>';
  }

  // ── Laden ──────────────────────────────────────────────────────────────────

  async function open(kind, id) {
    showPanel('detail');
    window.scrollTo(0, 0);
    $('searchResults').innerHTML = '';
    $('storyHost').innerHTML = '<div class="flex justify-center p-10"><span class="loading loading-spinner"></span></div>';
    var u = new URL(window.location.href);
    ['lead', 'sheet', 'visitor'].forEach(function (k) { u.searchParams.delete(k); });
    u.searchParams.set(kind, id);
    history.replaceState(null, '', u.toString());
    try {
      state.story = await api('/' + kind + '/' + encodeURIComponent(id));
      state.filterKanaal = '';
      state.filterPersoon = '';
      renderStory();
    } catch (e) {
      $('storyHost').innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
    }
  }

  async function zoek(q) {
    if (!q) return;
    showPanel('detail');
    $('storyHost').innerHTML = '';
    var r = await api('/search?q=' + encodeURIComponent(q));
    if (r.leads.length === 1 && !r.visitors.length) return open('lead', r.leads[0].id);
    if (!r.leads.length && r.visitors.length === 1) return open('visitor', r.visitors[0].uuid);
    var html = '';
    if (!r.leads.length && !r.visitors.length) html = '<div class="alert">Niets gevonden voor "' + esc(q) + '".</div>';
    if (r.leads.length) {
      html += '<div class="card bg-base-100 mb-3"><div class="card-body p-4"><h3 class="font-semibold text-sm mb-2">Leads</h3><ul class="menu menu-sm p-0">'
        + r.leads.map(function (l) {
          return '<li><a data-action="open" data-kind="lead" data-id="' + l.id + '">' + esc(l.name) + statusBadge(l.status) + ' <span class="opacity-60">' + esc(l.email_from || '') + ' · #' + l.id + '</span></a></li>';
        }).join('') + '</ul></div></div>';
    }
    if (r.visitors.length) {
      html += '<div class="card bg-base-100"><div class="card-body p-4"><h3 class="font-semibold text-sm mb-2">Bezoekers (browsers) met dit adres</h3><ul class="menu menu-sm p-0">'
        + r.visitors.map(function (v) {
          return '<li><a data-action="open" data-kind="visitor" data-id="' + esc(v.uuid) + '">' + esc(v.uuid.slice(0, 8)) + ' <span class="opacity-60">' + esc(v.site || '') + ' · laatst ' + esc(datum(v.last_seen)) + '</span></a></li>';
        }).join('') + '</ul></div></div>';
    }
    $('searchResults').innerHTML = html;
  }

  // ── Verhaal ────────────────────────────────────────────────────────────────

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
          return '<a class="btn btn-xs btn-ghost" data-action="open" data-kind="sheet" data-id="' + sh.id + '">Actieblad ' + esc(sh.name || '#' + sh.id) + '</a>';
        }).join('');
    } else if (s.kind === 'sheet') {
      titel = 'Actieblad ' + (r.name || '#' + r.id);
      meta.push((s.leads || []).length + ' lead(s)');
      links = '<a class="btn btn-xs" target="_blank" rel="noopener" href="' + odooLink('x_sales_action_sheet', r.id) + '">Open in Odoo</a>'
        + (s.leads || []).map(function (l) {
          return '<a class="btn btn-xs btn-ghost" data-action="open" data-kind="lead" data-id="' + l.id + '">' + esc(l.name) + statusBadge(l.status) + '</a>';
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
        return '<a class="btn btn-xs btn-ghost" data-action="open" data-kind="lead" data-id="' + l.res_id + '">' + esc(l.name || '#' + l.res_id) + statusBadge(l.status) + '</a>';
      }).join('');
    }
    var push = (s.kind !== 'visitor' && state.boot.mode === 'on')
      ? '<button class="btn btn-xs btn-outline" data-action="push" data-kind="' + s.kind + '" data-id="' + r.id + '"><i data-lucide="refresh-cw" class="w-3 h-3"></i> Odoo nu bijwerken</button>' : '';
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
        ? (l.status !== 'bevestigd' ? '<button class="btn btn-xs btn-ghost text-success" data-action="judge" data-status="bevestigd" data-uuid="' + l.visitor_uuid + '" data-res="' + l.res_id + '">Bevestig</button>' : '')
          + (l.status !== 'afgewezen' ? '<button class="btn btn-xs btn-ghost text-error" data-action="judge" data-status="afgewezen" data-uuid="' + l.visitor_uuid + '" data-res="' + l.res_id + '">Hoort er niet bij</button>' : '')
          + (l.status !== 'actief' ? '<button class="btn btn-xs btn-ghost" data-action="judge" data-status="actief" data-uuid="' + l.visitor_uuid + '" data-res="' + l.res_id + '">Herstel</button>' : '')
        : '';
      var status = l.status === 'actief' ? '' : '<span class="badge badge-sm ' + (l.status === 'bevestigd' ? 'badge-success' : 'badge-ghost') + '">' + esc(l.status) + '</span>';
      return '<tr class="' + (l.status === 'afgewezen' ? 'opacity-50' : '') + '">'
        + '<td><a class="link link-hover" data-action="open" data-kind="visitor" data-id="' + l.visitor_uuid + '">' + esc(persoonLabel(l.email, l.visitor_uuid)) + '</a>'
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
      if (x.conversions.forms) conv.push('<span class="badge badge-sm badge-warning">formulier</span>');
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
      + '<div class="flex gap-2"><select class="select select-xs select-bordered" data-filter="kanaal"><option value="">Alle kanalen</option>' + opt(kanalen, state.filterKanaal) + '</select>'
      + '<select class="select select-xs select-bordered" data-filter="persoon"><option value="">Alle personen</option>' + opt(personen, state.filterPersoon, true) + '</select></div></div>'
      + '<div class="overflow-x-auto max-h-[28rem]"><table class="table table-sm table-pin-rows"><thead><tr><th>Wanneer</th><th>Wie</th><th>Kanaal</th><th>Pagina\'s</th><th></th></tr></thead><tbody>'
      + rows + '</tbody></table></div></div></div>';
  }

  function tijdlijnKaart(s) {
    if (!s.timeline_html) return '';
    return '<div class="card bg-base-100"><div class="card-body p-5"><h3 class="font-semibold mb-2">Tijdlijn (zoals in Odoo)</h3>'
      + '<iframe id="timelineFrame" class="w-full border-0" style="min-height:400px" sandbox="allow-same-origin allow-popups"></iframe></div></div>';
  }

  function renderStory() {
    var s = state.story;
    $('storyHost').innerHTML = recordKaart(s) + verhaalKaart(s.journey) + personenKaart(s) + sessiesKaart(s) + tijdlijnKaart(s);
    var f = $('timelineFrame');
    if (f) {
      f.srcdoc = '<!doctype html><meta charset="utf-8"><base target="_blank"><body style="margin:0;font-family:system-ui,sans-serif">'
        + (s.kpi_html || '') + s.timeline_html + '</body>';
      f.onload = function () { try { f.style.height = (f.contentDocument.body.scrollHeight + 20) + 'px'; } catch (_) { /* geen toegang */ } };
    }
    icons();
  }

  // ── Twijfelgevallen ────────────────────────────────────────────────────────

  async function laadReview() {
    $('reviewHost').innerHTML = '<span class="loading loading-spinner"></span>';
    state.review = await api('/review');
    state.gekozen = {};
    if (!state.review.length) { $('reviewHost').innerHTML = '<p class="opacity-70 text-sm">Geen twijfelgevallen.</p>'; return; }
    $('reviewHost').innerHTML = '<table class="table table-sm"><thead><tr><th><input type="checkbox" class="checkbox checkbox-xs" data-action="select-all"></th>'
      + '<th>Lead</th><th>Bezoeker</th><th>Verantwoordelijke</th><th>Laatst</th></tr></thead><tbody>'
      + state.review.map(function (r, i) {
        return '<tr><td><input type="checkbox" class="checkbox checkbox-xs" data-action="select" data-i="' + i + '"></td>'
          + '<td><a class="link link-hover" data-action="open" data-kind="lead" data-id="' + r.res_id + '">' + esc(r.lead_name || '#' + r.res_id) + '</a>' + statusBadge(r.status)
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

  // ── Uitsluiten: het venster en het tabblad Uitgesloten ─────────────────────

  /** t = { uuid, norms: [herleide adressen van die browser], label } */
  function openUitsluiten(t) {
    var dlg = $('exclDialog');
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
    $('exclWho').textContent = t.label || persoonLabel(null, t.uuid);
    $('exclChoices').innerHTML = (norms.length > 1
      ? '<p class="text-xs rounded-lg bg-info/10 p-2">Gedeelde browser: hier werden ' + norms.length + ' adressen gebruikt. Kies welke persoon je uitsluit, of enkel deze browser.</p>' : '')
      + keuzes.map(function (k, i) {
        return '<label class="flex items-start gap-3 rounded-lg border border-base-300 p-3 cursor-pointer hover:bg-base-200">'
          + '<input type="radio" name="exclScope" class="radio radio-sm radio-primary mt-0.5" value="' + i + '"' + (i === standaard ? ' checked' : '') + '>'
          + '<span><span class="block text-sm font-medium">' + esc(k[2]) + '</span><span class="block text-xs opacity-60">' + esc(k[3]) + '</span></span></label>';
      }).join('');
    $('exclReason').value = '';
    dlg.showModal();
  }

  async function bewaarUitsluiten() {
    var gekozen = document.querySelector('input[name="exclScope"]:checked');
    if (!gekozen) { toast('Kies wat je uitsluit.', 'error'); return; }
    var k = state.exclKeuzes[Number(gekozen.value)];
    await api('/exclusions', { method: 'POST', body: JSON.stringify({ kind: k[0], value: k[1], reason: $('exclReason').value.trim() }) });
    $('exclDialog').close();
    toast('Uitgesloten: telt niet meer mee in de cijfers.');
    await naWijziging();
  }

  async function weerMeetellen(id) {
    await api('/exclusions/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Telt weer mee in de cijfers.');
    await naWijziging();
  }

  /** Na een wijziging: Gedrag opnieuw laten tellen, en herladen wat open staat. */
  async function naWijziging() {
    if (window.WebGedragBehaviour && window.WebGedragBehaviour.reload) window.WebGedragBehaviour.reload();
    if ($('panelExcluded') && !$('panelExcluded').classList.contains('hidden')) { await laadUitgesloten(); return; }
    if (state.story && !$('panelDetail').classList.contains('hidden')) {
      var r = state.story.record;
      await open(state.story.kind, state.story.kind === 'visitor' ? r.uuid : r.id);
    }
  }

  function sindsTekst(iso) {
    var t = Date.parse(iso || '');
    return isNaN(t) ? '' : new Date(t).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function laadUitgesloten() {
    var host = $('exclHost');
    if (!host) return;
    host.innerHTML = '<span class="loading loading-spinner"></span>';
    var d = await api('/exclusions');
    state.excl = d;
    if ($('exclAddForm')) $('exclAddForm').classList.toggle('hidden', !d.is_admin);
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
          + (r.visitor ? '<button class="btn btn-xs btn-ghost" data-action="open" data-kind="visitor" data-id="' + esc(r.visitor) + '">Traject</button>' : '')
          + (d.is_admin ? '<button class="btn btn-xs btn-ghost" data-action="excl-remove" data-id="' + esc(r.id) + '">Weer laten meetellen</button>' : '')
          + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ── Centrale listeners ─────────────────────────────────────────────────────

  document.addEventListener('click', async function (e) {
    var tab = e.target.closest('[data-story-tab]');
    if (tab) { showPanel(tab.dataset.storyTab); return; }
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    try {
      if (a === 'open') {
        e.preventDefault();
        await open(el.dataset.kind, el.dataset.id);
      } else if (a === 'back') {
        var u = new URL(window.location.href);
        ['lead', 'sheet', 'visitor'].forEach(function (k) { u.searchParams.delete(k); });
        history.replaceState(null, '', u.toString());
        showPanel('behaviour');
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
        document.querySelectorAll('[data-action="select"]').forEach(function (c) { c.checked = el.checked; state.gekozen[c.dataset.i] = el.checked; });
      } else if (a === 'bulk') {
        var changes = state.review.filter(function (_, i) { return state.gekozen[i]; })
          .map(function (r) { return { uuid: r.visitor_uuid, res_id: r.res_id, status: el.dataset.status }; });
        if (!changes.length) return toast('Selecteer eerst rijen.', 'error');
        await beoordeel(changes);
        await laadReview();
      }
    } catch (err) {
      el.disabled = false;
      toast(err.message, 'error');
    }
  });

  document.addEventListener('change', function (e) {
    var f = e.target.closest('[data-filter]');
    if (!f) return;
    if (f.dataset.filter === 'kanaal') state.filterKanaal = f.value;
    else state.filterPersoon = f.value;
    renderStory();
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'exclAddForm') return;
    e.preventDefault();
    var v = $('exclAddValue').value.trim();
    if (!v) return;
    var kind = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? 'visitor' : 'email';
    api('/exclusions', { method: 'POST', body: JSON.stringify({ kind: kind, value: v, reason: $('exclAddReason').value.trim() }) })
      .then(function () {
        $('exclAddValue').value = '';
        $('exclAddReason').value = '';
        toast('Uitgesloten: telt niet meer mee in de cijfers.');
        return naWijziging();
      })
      .catch(function (err) { toast(err.message, 'error'); });
  });

  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    zoek($('searchInput').value.trim()).catch(function (err) { toast(err.message, 'error'); });
  });

  // Voor webgedrag-behaviour.js: een bezoek aanklikken opent het traject.
  window.WebGedrag = {
    open: function (kind, id) { open(kind, id); },
    colors: {},
    // Uitsluiten vanuit Gedrag (de waarschuwing "komt van één persoon").
    exclude: function (t) { openUitsluiten(t); },
    isAdmin: function () { return !!(state.boot && state.boot.is_admin); },
  };

  // ── Start ──────────────────────────────────────────────────────────────────

  (async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
    } catch (_) { /* navbar is niet kritisch */ }
    try {
      state.boot = await api('/bootstrap');
      window.WebGedrag.colors = state.boot.colors || {};
      $('reviewTab').classList.toggle('hidden', !state.boot.is_admin);
      if (state.boot.mode !== 'on') {
        $('modeWarning').classList.remove('hidden');
        $('modeWarningText').textContent = 'Dit scherm is live. In Odoo staat het verhaal nog niet: WEB_STORY_MODE staat op "'
          + (state.boot.mode || 'uit') + '", de tracker schrijft de tijdlijn op de lead voorlopig nog zelf.';
      }
      var q = new URL(window.location.href).searchParams;
      if (q.get('lead')) await open('lead', q.get('lead'));
      else if (q.get('sheet')) await open('sheet', q.get('sheet'));
      else if (q.get('visitor')) await open('visitor', q.get('visitor'));
      else if (q.get('tab') === 'uitgesloten' && $('panelExcluded')) showPanel('excluded');
      else showPanel('behaviour');
    } catch (err) { toast(err.message, 'error'); }
    icons();
  })();
})();
