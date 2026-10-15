/**
 * Nieuwsbrieven -- het overzicht als kalender, zoals bij Events.
 *
 *   - Kalender | Lijst, met dezelfde kop en legende als Events.
 *   - Elke editie staat op haar VERZENDDAG, in de kleur van haar reeks; het
 *     bolletje is de stand. De INLEVERDATUM staat er als stippellijn bij en
 *     is doorgelinkt: klikken opent dezelfde editie.
 *   - De events uit Eventbeheer staan er als grijze laag onder.
 *   - Klik op een lege dag = nieuwe editie op die dag. Verslepen = de
 *     verzenddag verplaatsen (de inleverdatum schuift mee).
 *   - Rechts: de gekozen editie met wat er nog in te vullen is (voor jou, en
 *     voor de hoofdredactie alles wat open staat), of zonder keuze: wat er
 *     voor jou klaarstaat en de voorraad.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  /** De kleur per reeks (vulkleur op de kalender), zoals een eventtype bij Events. */
  var KLEUREN = {
    syndicoach: { bg: '#ec4899', text: '#ffffff' },
    openvme: { bg: '#0369a1', text: '#ffffff' },
    professionals: { bg: '#14b8a6', text: '#ffffff' },
  };
  var MERK_KLEUR = { syndicoach: KLEUREN.syndicoach, openvme: KLEUREN.openvme };
  var STAND_STIP = { collecting: '#f59e0b', review: '#38bdf8', scheduled: '#0369a1', sent: '#16a34a', cancelled: '#9ca3af' };

  function kleurVan(s) {
    return KLEUREN[s && s.code] || MERK_KLEUR[s && s.brand] || { bg: '#6b7280', text: '#ffffff' };
  }

  var st = NB.state.kal = NB.state.kal || { weergave: 'kalender', editions: [], events: [], series: [], gekozen: null, kalender: null, bereik: null };

  function serieVan(id) { return (NB.state.boot.series || []).find(function (s) { return s.id === id; }) || null; }
  function editieVan(id) { return st.editions.find(function (x) { return x.id === id; }) || null; }
  function actief(ed) { return ['collecting', 'review'].indexOf(ed.status) >= 0; }
  function verplaatsbaar(ed) { return ed.is_editor && (actief(ed) || (ed.status === 'scheduled' && !ed.odoo_mailing_id)); }
  function vandaag() { return NB.lokaal(new Date().toISOString()).slice(0, 10); }

  // ─── De pagina ────────────────────────────────────────────────────────────

  function kop() {
    return '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '<div class="min-w-0"><h1 class="text-2xl font-bold flex items-center gap-2"><i data-lucide="newspaper" class="w-6 h-6 text-primary"></i> Nieuwsbrieven</h1>'
      + '<p class="text-sm opacity-60 mt-0.5">Iedereen schrijft mee, marketing is hoofdredactie. Klik op een dag om een editie te plannen.</p></div>'
      + '<div class="flex items-center gap-2 shrink-0">'
      + '<div class="join"><button class="btn btn-sm join-item' + (st.weergave === 'kalender' ? ' btn-active' : '') + '" data-action="kal-weergave" data-weergave="kalender"><i data-lucide="calendar" class="w-4 h-4"></i> Kalender</button>'
      + '<button class="btn btn-sm join-item' + (st.weergave === 'lijst' ? ' btn-active' : '') + '" data-action="kal-weergave" data-weergave="lijst"><i data-lucide="list" class="w-4 h-4"></i> Lijst</button></div>'
      + '<button class="btn btn-sm btn-outline" data-action="open-idee"><i data-lucide="lightbulb" class="w-4 h-4"></i> Idee</button>'
      + (NB.state.boot.me.is_editor || (NB.state.boot.series || []).some(function (s) { return s.is_editor; })
        ? '<button class="btn btn-sm btn-primary" data-action="open-nieuwe-editie"><i data-lucide="plus" class="w-4 h-4"></i> Nieuwe editie</button>' : '')
      + '</div></div>';
  }

  function legende() {
    var reeksen = (NB.state.boot.series || []).filter(function (s) { return s.is_active; });
    return '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">'
      + reeksen.map(function (s) {
        var k = kleurVan(s);
        return '<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded" style="background:' + k.bg + '"></span>' + e(s.name)
          + (s.is_editor ? ' <a class="opacity-50 hover:opacity-100" href="#/reeks/' + e(s.id) + '" title="Instellingen van ' + e(s.name) + '"><i data-lucide="settings" class="w-3 h-3 inline"></i></a>' : '') + '</span>';
      }).join('')
      + '<span class="opacity-30">|</span>'
      + '<span class="flex items-center gap-1.5"><span class="w-6 h-3 rounded border-2 border-dashed border-base-content/40"></span>Inleverdatum</span>'
      + '<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-base-content/15"></span>Event</span>'
      + '<span class="opacity-30">|</span>'
      + '<span class="opacity-50 font-medium uppercase tracking-wide">Stand</span>'
      + [['collecting', 'Verzamelen'], ['review', 'Nalezen'], ['scheduled', 'Ingepland'], ['sent', 'Verzonden']].map(function (x) {
        return '<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:' + STAND_STIP[x[0]] + '"></span>' + x[1] + '</span>';
      }).join('')
      + '</div>';
  }

  NB.views.overzicht = async function () {
    var app = document.getElementById('app');
    app.innerHTML = kop() + legende()
      + '<div class="grid grid-cols-12 gap-6">'
      + '<div class="col-span-12 lg:col-span-7">'
      + '<div id="nbKalenderKaart" class="card bg-base-100 border border-base-200 shadow-sm' + (st.weergave === 'kalender' ? '' : ' hidden') + '"><div class="card-body p-4 overflow-hidden rounded-box relative min-h-[34rem]"><div id="nbKalender"></div></div></div>'
      + '<div id="nbLijstKaart" class="card bg-base-100 border border-base-200 shadow-sm' + (st.weergave === 'lijst' ? '' : ' hidden') + '"><div class="card-body p-0"><div id="nbLijst"><div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div></div></div></div>'
      + '</div>'
      + '<aside id="nbZij" class="col-span-12 lg:col-span-5 flex flex-col gap-3"><div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div></aside>'
      + '</div>';
    NB.ikons();
    try { NB.state.overzicht = await NB.api('/api/overview'); } catch (err) { NB.fout(err); NB.state.overzicht = { mine: [], pool: [], series: [] }; }
    st.kalender = null;
    if (st.weergave === 'kalender') tekenKalender(); else await laadLijst();
    tekenZij();
  };

  // ─── De kalender ──────────────────────────────────────────────────────────

  async function laadBereik(van, tot) {
    var r = await NB.api('/api/kalender?from=' + encodeURIComponent(van) + '&to=' + encodeURIComponent(tot));
    st.editions = r.editions || [];
    st.events = r.events || [];
    st.bereik = { van: van, tot: tot };
    return r;
  }

  function kalenderItems() {
    var lijst = [];
    st.editions.forEach(function (ed) {
      var s = serieVan(ed.series_id);
      var k = kleurVan(s);
      lijst.push({ id: 'v-' + ed.id, start: ed.send_at, title: ed.series_name + ' · ' + ed.title, editable: verplaatsbaar(ed), extendedProps: { soort: 'verzend', ed: ed, kleur: k } });
      if (actief(ed) && !NB.isBlanco(ed)) lijst.push({ id: 'd-' + ed.id, start: ed.deadline_at, title: 'Inleveren · ' + ed.series_name, editable: false, classNames: ['nb-inlever'], extendedProps: { soort: 'inlever', ed: ed, kleur: k } });
    });
    st.events.forEach(function (ev) {
      lijst.push({ id: 'e-' + ev.id, start: ev.starts_at, title: ev.title, editable: false, classNames: ['nb-evt'], extendedProps: { soort: 'event', ev: ev } });
    });
    return lijst;
  }

  function inhoudVanItem(arg) {
    var p = arg.event.extendedProps;
    var el = document.createElement('div');
    el.className = 'nb-kaart';
    if (p.soort === 'event') {
      el.innerHTML = '<div class="nb-kaart-kop"><span>Event' + (p.ev.brand ? ' · ' + e(p.ev.brand) : '') + '</span></div><div class="nb-kaart-titel">' + e(p.ev.title) + '</div>';
      return { domNodes: [el] };
    }
    var ed = p.ed;
    var pr = ed.progress || {};
    var binnen = (pr.goedgekeurd || 0) + (pr.ingeleverd || 0);
    if (p.soort === 'inlever') {
      el.innerHTML = '<div class="nb-kaart-kop"><span>Inleveren</span></div><div class="nb-kaart-titel">' + e(ed.series_name) + ' · ' + binnen + '/' + (pr.totaal || 0) + ' binnen</div>';
      return { domNodes: [el] };
    }
    el.innerHTML = '<div class="nb-kaart-kop"><span class="nb-stip"></span><span>' + e(ed.series_name) + '</span></div><div class="nb-kaart-titel">' + e(ed.title) + (actief(ed) ? ' · ' + binnen + '/' + (pr.totaal || 0) : '') + '</div>';
    return { domNodes: [el] };
  }

  function stijlItem(info) {
    var p = info.event.extendedProps;
    var node = info.el;
    if (p.soort === 'event') return;
    node.style.setProperty('--event-bg', p.kleur.bg);
    node.style.setProperty('--event-text', p.kleur.text);
    node.style.setProperty('--status-dot', STAND_STIP[p.ed.status] || '#9ca3af');
    if (p.ed.status === 'sent') node.style.opacity = '0.8';
    if (st.gekozen === p.ed.id) node.classList.add('nb-gekozen-ed');
  }

  function tekenKalender() {
    var host = document.getElementById('nbKalender');
    if (!host) return;
    if (typeof FullCalendar === 'undefined') {
      host.innerHTML = '<div class="alert alert-warning text-sm"><span>De kalender kon niet geladen worden. Gebruik de lijst.</span></div>';
      return;
    }
    st.kalender = new FullCalendar.Calendar(host, {
      initialView: 'dayGridMonth',
      initialDate: st.maand || undefined,
      headerToolbar: { left: 'title', center: '', right: 'today prev,next' },
      firstDay: 1,
      locale: 'nl',
      timeZone: 'Europe/Brussels',
      buttonText: { today: 'Vandaag' },
      height: 'auto',
      fixedWeekCount: false,
      dayMaxEvents: 3,
      displayEventTime: false,
      editable: true,
      eventStartEditable: true,
      eventDurationEditable: false,
      events: function (info, ok, nok) {
        laadBereik(info.startStr, info.endStr).then(function () { ok(kalenderItems()); tekenZij(); }).catch(function (err) { NB.fout(err); nok(err); });
      },
      datesSet: function (info) { st.maand = info.view.currentStart.toISOString(); },
      eventContent: inhoudVanItem,
      eventDidMount: stijlItem,
      eventClick: function (info) {
        info.jsEvent.preventDefault();
        var p = info.event.extendedProps;
        if (p.soort === 'event') { if (p.ev.url) window.open(p.ev.url, '_blank', 'noopener'); return; }
        kies(p.ed.id);
      },
      // Op een lege dag klikken = een nieuwe editie op die dag (zoals bij Events). Het verleden niet.
      dateClick: function (info) {
        if (info.dateStr < vandaag()) return;
        NB.actions['open-nieuwe-editie']({ dataset: { datum: info.dateStr } });
      },
      dayCellClassNames: function (arg) {
        return NB.lokaal(arg.date.toISOString()).slice(0, 10) < vandaag() ? [] : ['fc-day-clickable'];
      },
      eventDrop: async function (info) {
        var p = info.event.extendedProps;
        if (p.soort !== 'verzend') { info.revert(); return; }
        try {
          var nieuw = info.event.start.toISOString();
          // Ingepland: enkel het moment; anders schuift de inleverdatum evenveel mee.
          await NB.api('/api/editions/' + p.ed.id, { method: 'PUT', body: p.ed.status === 'scheduled' ? { send_at: nieuw } : { send_at: nieuw, schuif_inleverdatum: true } });
          NB.toast('Verzenddag verplaatst naar ' + NB.datum(nieuw, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (p.ed.status === 'scheduled' ? '.' : '. De inleverdatum schoof mee.'));
          st.kalender.refetchEvents();
        } catch (err) { NB.fout(err); info.revert(); }
      },
    });
    st.kalender.render();
  }

  // ─── De lijst ─────────────────────────────────────────────────────────────

  async function laadLijst() {
    var bak = document.getElementById('nbLijst');
    if (!bak) return;
    try {
      var nu = Date.now();
      await laadBereik(new Date(nu - 120 * 86400000).toISOString(), new Date(nu + 200 * 86400000).toISOString());
    } catch (err) { bak.innerHTML = '<div class="alert alert-error m-4 text-sm">' + e(err.message) + '</div>'; return; }
    var lijst = st.editions.slice().sort(function (a, b) { return a.send_at < b.send_at ? -1 : 1; });
    var komend = lijst.filter(function (x) { return x.status !== 'sent'; });
    var geweest = lijst.filter(function (x) { return x.status === 'sent'; }).reverse();
    var rij = function (ed) {
      var k = kleurVan(serieVan(ed.series_id));
      var pr = ed.progress || {};
      return '<button class="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-base-200 hover:bg-base-200/60' + (st.gekozen === ed.id ? ' bg-primary/5' : '') + '" data-action="kal-kies" data-id="' + e(ed.id) + '">'
        + '<span class="w-1.5 self-stretch rounded" style="background:' + k.bg + '"></span>'
        + '<span class="w-14 shrink-0"><span class="block text-lg font-bold leading-none" style="color:' + k.bg + '">' + e(NB.datum(ed.send_at, { day: 'numeric' })) + '</span><span class="block text-[10px] uppercase opacity-60">' + e(NB.datum(ed.send_at, { month: 'short' })) + '</span></span>'
        + '<span class="flex-1 min-w-0"><span class="block font-semibold truncate">' + e(ed.series_name) + ' · ' + e(ed.title) + '</span>'
        + '<span class="block text-xs opacity-60">' + (actief(ed) && NB.isBlanco(ed) ? 'Blanco mailing · ' + (pr.totaal || 0) + ' ' + ((pr.totaal || 0) === 1 ? 'blok' : 'blokken') : actief(ed) ? 'Inleverdatum ' + e(NB.datum(ed.deadline_at, { day: 'numeric', month: 'short' })) + ' · ' + ((pr.goedgekeurd || 0) + (pr.ingeleverd || 0)) + ' van ' + (pr.totaal || 0) + ' binnen' : ed.status === 'scheduled' ? 'Vertrekt ' + e(NB.datum(ed.send_at)) : 'Verzonden') + '</span></span>'
        + NB.editieBadge(ed.status) + '</button>';
    };
    bak.innerHTML = (komend.length ? '<div class="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide opacity-50">Komend</div>' + komend.map(rij).join('') : '<p class="p-4 text-sm opacity-60">Geen edities gepland.</p>')
      + (geweest.length ? '<div class="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide opacity-50">Verzonden</div>' + geweest.map(rij).join('') : '');
    NB.ikons();
  }

  // ─── Rechts: de gekozen editie, of wat er voor jou klaarstaat ─────────────

  function kaart(inhoud, extra) {
    return '<div class="card bg-base-100 border border-base-200 shadow-sm' + (extra || '') + '"><div class="card-body p-4 gap-2">' + inhoud + '</div></div>';
  }

  function stukjeRij(it, metWie) {
    return '<a href="#/stukje/' + e(it.id) + '" class="flex items-center gap-2 py-1.5 border-b border-base-200 last:border-0 hover:text-primary">'
      + '<span class="flex-1 min-w-0 text-sm font-medium truncate">' + e(it.title) + '</span>'
      + (metWie ? '<span class="text-xs opacity-60 shrink-0">' + e(NB.voornaam(it.owner_name) || 'niemand') + '</span>' : '')
      + NB.statusBadge(it.status) + '</a>';
  }

  function editieKaart(ed) {
    var s = serieVan(ed.series_id);
    var k = kleurVan(s);
    var pr = ed.progress || {};
    var mijn = (ed.open || []).filter(function (i) { return i.mine; });
    var anderen = (ed.open || []).filter(function (i) { return !i.mine; });
    var t = NB.teller(ed.deadline_at);
    return kaart('<div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="text-xs font-semibold uppercase tracking-wide" style="color:' + k.bg + '">' + e(ed.series_name) + '</div>'
      + '<h2 class="text-lg font-bold leading-tight">' + e(ed.title) + '</h2></div>' + NB.editieBadge(ed.status) + '</div>'
      + '<div class="text-sm"><div><span class="opacity-60">Verzenddag</span> ' + e(NB.datum(ed.send_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + '</div>'
      + (actief(ed) && NB.isBlanco(ed) ? '<div><span class="opacity-60">Blanco mailing</span> zelf opgebouwd, geen opdrachten en geen inleverdag</div>' : actief(ed) ? '<div><span class="opacity-60">Inleverdatum</span> ' + e(NB.datum(ed.deadline_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + ' <span class="' + (t.voorbij ? 'text-warning font-semibold' : 'opacity-60') + '">(' + e(NB.tellerTekst(ed.deadline_at)) + ')</span></div>' : '') + '</div>'
      + (actief(ed) ? NB.balkUitVoortgang(pr) + '<div class="text-xs opacity-60">' + ((pr.goedgekeurd || 0) + (pr.ingeleverd || 0)) + ' van ' + (pr.totaal || 0) + ' stukjes binnen</div>' : '')
      + '<div class="flex flex-wrap gap-2 mt-1"><a class="btn btn-sm btn-primary" href="#/editie/' + e(ed.id) + '"><i data-lucide="pen-line" class="w-4 h-4"></i> Open de redactietafel</a>'
      + (ed.is_editor && s ? '<a class="btn btn-sm btn-ghost" href="#/reeks/' + e(s.id) + '"><i data-lucide="settings" class="w-4 h-4"></i> Reeks</a>' : '') + '</div>', ' border-primary/40')
      + (actief(ed)
        ? kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="pen-line" class="w-4 h-4"></i> Voor jou nog in te vullen</h3>'
          + (mijn.length ? '<div>' + mijn.map(function (i) { return stukjeRij(i, false); }).join('') + '</div>' : '<p class="text-sm opacity-60">Niets meer: alles van jou is binnen.</p>'), mijn.length ? ' border-warning/50' : '')
          + (ed.is_editor
            ? kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="users" class="w-4 h-4"></i> Nog open bij collega\'s</h3>'
              + (anderen.length ? '<div>' + anderen.map(function (i) { return stukjeRij(i, true); }).join('') + '</div>' : '<p class="text-sm opacity-60">Alles is binnen en bevestigd.</p>'))
            : '')
        : '');
  }

  function voorJouKaart() {
    var mine = (NB.state.overzicht && NB.state.overzicht.mine) || [];
    if (!mine.length) return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="pen-line" class="w-4 h-4"></i> Voor jou</h3><p class="text-sm opacity-60">Er staat niets op jouw naam. Klik op een editie in de kalender om te zien wat er nog ontbreekt.</p>');
    return kaart('<h3 class="font-semibold flex items-center gap-2"><i data-lucide="pen-line" class="w-4 h-4"></i> Voor jou</h3><div>'
      + mine.map(function (m) {
        var deadline = m.edition ? m.edition.deadline_at : null;
        var dringend = deadline && NB.teller(deadline).d < 3;
        return '<a href="#/stukje/' + e(m.id) + '" class="flex items-center gap-2 py-2 border-b border-base-200 last:border-0 hover:text-primary">'
          + '<span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">' + e(NB.blokNaam(m)) + '</span><span class="block text-xs opacity-60">' + e(m.series_name) + (m.edition ? ' · ' + e(m.edition.title) : '') + (deadline ? ' · <span class="' + (dringend ? 'text-warning font-semibold' : '') + '">' + e(NB.tellerTekst(deadline)) + '</span>' : '') + '</span></span>'
          + NB.statusBadge(m.status) + '</a>';
      }).join('') + '</div>', ' border-primary/40');
  }

  function voorraadKaart() {
    var pool = (NB.state.overzicht && NB.state.overzicht.pool) || [];
    var boot = NB.state.boot;
    return kaart('<div class="flex items-center justify-between"><h3 class="font-semibold flex items-center gap-2"><i data-lucide="lightbulb" class="w-4 h-4"></i> Voorraad</h3><button class="btn btn-xs btn-ghost" data-action="open-idee"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Idee</button></div>'
      + (pool.length ? '<div>' + pool.map(function (p) {
        var mijn = p.owner_user_id === boot.me.id || p.created_by === boot.me.id;
        var reeksen = (p.series_ids || []).map(function (id) { var s = serieVan(id); return s ? s.name : null; }).filter(Boolean);
        return '<div class="flex items-center gap-2 py-1.5 border-b border-base-200 last:border-0">' + NB.gezicht(p.owner_name, 'w-6')
          + '<div class="flex-1 min-w-0">' + (mijn ? '<button class="text-sm font-medium hover:underline text-left truncate block w-full" data-action="open-idee" data-id="' + e(p.id) + '">' + e(NB.blokNaam(p)) + '</button>' : '<span class="text-sm font-medium truncate block">' + e(NB.blokNaam(p)) + '</span>')
          + '<div class="text-[11px] opacity-60 truncate">' + e(p.owner_name || '') + (reeksen.length ? ' · ' + e(reeksen.join(', ')) : '') + '</div></div>'
          + ((mijn || boot.me.is_editor) ? '<button class="btn btn-ghost btn-xs" data-action="verwijder-idee" data-id="' + e(p.id) + '" aria-label="Weghalen"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="text-sm opacity-60">Nog niets. Iets gehoord bij een klant of op een event? Zet het erin; de hoofdredactie neemt het op via "+" in de brief.</p>'));
  }

  function tekenZij() {
    var bak = document.getElementById('nbZij');
    if (!bak) return;
    var ed = st.gekozen ? editieVan(st.gekozen) : null;
    bak.innerHTML = (ed
      ? '<button class="btn btn-ghost btn-xs self-start" data-action="kal-kies" data-id=""><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Alles</button>' + editieKaart(ed)
      : voorJouKaart() + voorraadKaart());
    NB.ikons();
  }

  function kies(id) {
    st.gekozen = id || null;
    tekenZij();
    if (st.kalender) st.kalender.getEvents().forEach(function (ev) { var p = ev.extendedProps; ev.setProp('classNames', (p.soort === 'inlever' ? ['nb-inlever'] : p.soort === 'event' ? ['nb-evt'] : []).concat(p.ed && p.ed.id === st.gekozen ? ['nb-gekozen-ed'] : [])); });
    if (st.weergave === 'lijst') laadLijst();
    if (window.innerWidth < 1024) { var z = document.getElementById('nbZij'); if (z) z.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  // ─── Acties ───────────────────────────────────────────────────────────────

  NB.actions['kal-weergave'] = async function (el) {
    st.weergave = el.dataset.weergave === 'lijst' ? 'lijst' : 'kalender';
    document.getElementById('nbKalenderKaart').classList.toggle('hidden', st.weergave !== 'kalender');
    document.getElementById('nbLijstKaart').classList.toggle('hidden', st.weergave !== 'lijst');
    document.querySelectorAll('[data-action="kal-weergave"]').forEach(function (b) { b.classList.toggle('btn-active', b.dataset.weergave === st.weergave); });
    if (st.weergave === 'kalender') { if (!st.kalender) tekenKalender(); else st.kalender.updateSize(); } else await laadLijst();
  };

  NB.actions['kal-kies'] = function (el) { kies(el.dataset.id || null); };

  /** Het ideevenster: nieuw, of een bestaand idee uit de voorraad aanpassen. */
  NB.actions['open-idee'] = function (el) {
    var boot = NB.state.boot;
    var id = el && el.dataset ? el.dataset.id : null;
    var p = id ? ((NB.state.overzicht && NB.state.overzicht.pool) || []).find(function (x) { return x.id === id; }) : null;
    NB.state.ideeId = p ? p.id : null;
    document.getElementById('ideeKop').textContent = p ? 'Idee aanpassen' : 'Idee voor de nieuwsbrief';
    document.getElementById('ideeTitel').value = p ? (p.title === 'Idee' ? '' : p.title) : '';
    document.getElementById('ideeNotities').value = p ? (p.raw_notes || '') : '';
    var gekozen = p ? (p.series_ids || []) : [];
    document.getElementById('ideeReeksen').innerHTML = boot.series.filter(function (s) { return s.is_active; }).map(function (s) {
      return '<label class="label cursor-pointer gap-2 p-0"><input type="checkbox" class="checkbox checkbox-sm" value="' + e(s.id) + '"' + (gekozen.indexOf(s.id) >= 0 ? ' checked' : '') + '><span class="label-text">' + e(s.name) + '</span></label>';
    }).join('');
    NB.dialoog('dlgIdee').showModal();
    setTimeout(function () { document.getElementById('ideeTitel').focus(); }, 50);
  };

  NB.actions['bewaar-idee'] = async function () {
    var titel = document.getElementById('ideeTitel').value.trim();
    var notities = document.getElementById('ideeNotities').value.trim();
    if (!titel && !notities) { NB.toast('Geef je idee een titel of een paar woorden uitleg.', 'warning'); return; }
    var reeksen = Array.prototype.slice.call(document.querySelectorAll('#ideeReeksen input:checked')).map(function (i) { return i.value; });
    try {
      if (NB.state.ideeId) {
        await NB.api('/api/contributions/' + NB.state.ideeId, { method: 'PUT', body: { title: titel || 'Idee', raw_notes: notities, series_ids: reeksen } });
        NB.toast('Idee aangepast.');
      } else {
        await NB.api('/api/pool', { method: 'POST', body: { kind: 'article', title: titel || 'Idee', raw_notes: notities, series_ids: reeksen } });
        NB.toast('In de voorraad. De hoofdredactie neemt het op in een editie.');
      }
      NB.dialoog('dlgIdee').close();
      NB.state.overzicht = await NB.api('/api/overview');
      tekenZij();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['verwijder-idee'] = async function (el) {
    var ja = await NB.bevestig({ titel: 'Idee weghalen?', tekst: 'Het verdwijnt uit de voorraad. Dit kan je niet terugdraaien.', knop: 'Weghalen' });
    if (!ja) return;
    try {
      await NB.api('/api/contributions/' + el.dataset.id, { method: 'DELETE' });
      NB.toast('Weggehaald.');
      NB.state.overzicht = await NB.api('/api/overview');
      tekenZij();
    } catch (err) { NB.fout(err); }
  };

  /** Nieuwe editie: vanaf de knop (datum over drie weken) of vanaf een dag op de kalender. */
  NB.actions['open-nieuwe-editie'] = function (el) {
    var reeksen = (NB.state.boot.series || []).filter(function (s) { return s.is_active && s.is_editor; });
    if (!reeksen.length) { NB.toast('Enkel de hoofdredactie plant een editie.', 'warning'); return; }
    var sel = document.getElementById('editieReeks');
    sel.innerHTML = reeksen.map(function (s) { return '<option value="' + e(s.id) + '"' + (s.id === (el && el.dataset && el.dataset.series) ? ' selected' : '') + '>' + e(s.name) + '</option>'; }).join('');
    var datum = el && el.dataset && el.dataset.datum ? el.dataset.datum : NB.lokaal(new Date(Date.now() + 21 * 86400000).toISOString()).slice(0, 10);
    document.getElementById('editieDatum').value = datum;
    document.getElementById('editieNaam').value = '';
    var vast = document.querySelector('input[name="editieOpbouw"][value="vast"]');
    if (vast) vast.checked = true;
    NB.dialoog('dlgEditie').showModal();
  };

  NB.actions['maak-editie'] = async function () {
    try {
      var blanco = (document.querySelector('input[name="editieOpbouw"]:checked') || {}).value === 'blanco';
      var ed = await NB.api('/api/series/' + document.getElementById('editieReeks').value + '/editions', {
        method: 'POST', body: { date: document.getElementById('editieDatum').value, blanco: blanco, title: document.getElementById('editieNaam').value.trim() },
      });
      NB.dialoog('dlgEditie').close();
      NB.toast(blanco ? 'Blanco mailing aangemaakt. Bouw ze op met de "+"-lijn in de brief.' : 'Editie aangemaakt.');
      NB.ga('#/editie/' + ed.id);
    } catch (err) { NB.fout(err); }
  };
})();
