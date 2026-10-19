/**
 * Projecten -- de weergaven: zijbalk, Mijn taken, en per project Lijst, Bord,
 * Kalender en Overzicht. Tekent enkel; de acties staan onderaan en worden
 * door de centrale listener in projecten-bootstrap.js aangeroepen.
 */

(function () {
  'use strict';

  var PM = window.PM;
  var S = PM.state;
  var e = PM.esc;
  var kalender = null;

  // ── Zijbalk ───────────────────────────────────────────────────────────────

  function projectKnop(p) {
    var actief = S.route.soort === 'project' && S.route.id === p.id;
    return '<a href="#/project/' + e(p.id) + '" class="pm-nav ' + (actief ? 'pm-nav-actief' : '') + (p.archived ? ' opacity-50' : '') + '" data-action="sluit-zijbalk">'
      + '<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:' + PM.kleurHex(p.color) + '"></span>'
      + '<span class="truncate flex-1">' + e(p.name) + '</span>'
      + (p.te_laat ? '<span class="badge badge-error badge-xs" title="' + p.te_laat + ' te laat">' + p.te_laat + '</span>' : '')
      + (p.open ? '<span class="text-xs opacity-50 tabular-nums">' + p.open + '</span>' : '')
      + '</a>';
  }

  PM.tekenZijbalk = function () {
    var actief = S.projecten.filter(function (p) { return !p.archived; });
    var archief = S.projecten.filter(function (p) { return p.archived; });
    var html = '<a href="#/mijn" class="pm-nav ' + (S.route.soort === 'mijn' ? 'pm-nav-actief' : '') + '" data-action="sluit-zijbalk">'
      + '<i data-lucide="circle-check-big" class="w-4 h-4"></i><span class="flex-1">Mijn taken</span></a>'
      + '<div class="flex items-center justify-between mt-4 mb-1 px-2">'
      + '<span class="text-xs font-semibold uppercase tracking-wide opacity-50">Projecten</span>'
      + '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="nieuw-project" title="Nieuw project"><i data-lucide="plus" class="w-4 h-4"></i></button></div>'
      + (actief.length ? actief.map(projectKnop).join('') : '<p class="text-xs opacity-50 px-2 py-1">Nog geen projecten.</p>');
    if (archief.length) {
      html += '<button type="button" class="pm-nav w-full text-xs opacity-60 mt-3" data-action="toon-archief">'
        + '<i data-lucide="archive" class="w-3.5 h-3.5"></i><span class="flex-1 text-left">Gearchiveerd (' + archief.length + ')</span>'
        + '<i data-lucide="' + (S.toonArchief ? 'chevron-up' : 'chevron-down') + '" class="w-3.5 h-3.5"></i></button>'
        + (S.toonArchief ? archief.map(projectKnop).join('') : '');
    }
    PM.$('pmZijbalk').innerHTML = html;
    PM.$('pmZijbalkWrap').classList.toggle('pm-open', S.zijbalkOpen);
  };

  // ── Een taak als rij of kaart ─────────────────────────────────────────────

  function subTelling(t, alle) {
    var subs = alle.filter(function (x) { return x.parent_id === t.id; });
    if (!subs.length) return '';
    var af = subs.filter(function (x) { return x.done; }).length;
    return '<span class="inline-flex items-center gap-1 text-xs opacity-60" title="Subtaken"><i data-lucide="list-checks" class="w-3.5 h-3.5"></i>' + af + '/' + subs.length + '</span>';
  }

  function prioBadge(t) {
    if (t.priority === 'dringend') return '<span class="badge badge-error badge-sm badge-outline">Dringend</span>';
    if (t.priority === 'hoog') return '<span class="badge badge-warning badge-sm badge-outline">Hoog</span>';
    return '';
  }

  function labelsHtml(t) {
    return (t.labels || []).map(function (l) { return '<span class="badge badge-ghost badge-sm">' + e(l) + '</span>'; }).join('');
  }

  function vinkje(t) {
    return '<button type="button" class="pm-vink ' + (t.done ? 'pm-vink-af' : '') + '" data-action="vink" data-id="' + e(t.id) + '" title="' + (t.done ? 'Terug openzetten' : 'Afvinken') + '">'
      + '<i data-lucide="check" class="w-3.5 h-3.5"></i></button>';
  }

  /** `opties.project` toont de projectnaam (Mijn taken), `opties.ouder` de bovenliggende taak. */
  PM.taakRij = function (t, alle, opties) {
    opties = opties || {};
    var project = opties.project ? PM.projectVan(t.project_id) : null;
    return '<div class="pm-rij group ' + (t.done ? 'pm-af' : '') + '" draggable="' + (opties.slepen ? 'true' : 'false') + '" data-drag-task="' + e(t.id) + '">'
      + (opties.slepen ? '<i data-lucide="grip-vertical" class="w-4 h-4 opacity-0 group-hover:opacity-30 cursor-grab shrink-0 hidden sm:block"></i>' : '')
      + vinkje(t)
      + '<button type="button" class="flex-1 min-w-0 text-left flex flex-wrap items-center gap-x-2 gap-y-1" data-action="open-taak" data-id="' + e(t.id) + '">'
      + (t.is_milestone ? '<i data-lucide="diamond" class="w-4 h-4 text-warning shrink-0" title="Mijlpaal"></i>' : '')
      + '<span class="pm-titel truncate">' + e(t.title) + '</span>'
      + (opties.ouder ? '<span class="text-xs opacity-50 truncate">in ' + e(opties.ouder) + '</span>' : '')
      + subTelling(t, alle) + prioBadge(t) + labelsHtml(t)
      + (t.odoo_model ? '<i data-lucide="link" class="w-3.5 h-3.5 opacity-50" title="Gekoppeld aan ' + e(t.odoo_name || 'Odoo') + '"></i>' : '')
      + '</button>'
      + (project ? '<span class="hidden md:inline-flex items-center gap-1.5 text-xs opacity-70 max-w-[12rem] truncate"><span class="w-2 h-2 rounded-sm shrink-0" style="background:' + PM.kleurHex(project.color) + '"></span>' + e(project.name) + '</span>' : '')
      + '<span class="text-xs whitespace-nowrap tabular-nums w-20 text-right ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date)) + '</span>'
      + (opties.geenAvatar ? '' : PM.avatar(t.assignee_id, 6))
      + '</div>';
  };

  function kaart(t, alle) {
    return '<div class="pm-kaart ' + (t.done ? 'pm-af' : '') + '" draggable="true" data-drag-task="' + e(t.id) + '">'
      + '<div class="flex items-start gap-2">' + vinkje(t)
      + '<button type="button" class="flex-1 min-w-0 text-left" data-action="open-taak" data-id="' + e(t.id) + '">'
      + (t.is_milestone ? '<i data-lucide="diamond" class="w-3.5 h-3.5 text-warning inline mr-1"></i>' : '')
      + '<span class="pm-titel text-sm">' + e(t.title) + '</span></button></div>'
      + '<div class="flex flex-wrap items-center gap-1.5 mt-2">' + prioBadge(t) + labelsHtml(t) + '</div>'
      + '<div class="flex items-center gap-2 mt-2">' + subTelling(t, alle)
      + '<span class="flex-1"></span><span class="text-xs tabular-nums ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date)) + '</span>'
      + PM.avatar(t.assignee_id, 6) + '</div></div>';
  }

  function snelToevoegen(sectieId, extra) {
    return '<input type="text" class="input input-ghost input-sm w-full pm-snel" placeholder="+ Taak toevoegen (Enter)" maxlength="300"'
      + ' data-snel-taak="1" data-section="' + e(sectieId || '') + '"' + (extra || '') + '>';
  }

  // ── Mijn taken ────────────────────────────────────────────────────────────

  function mijnGroepen(taken) {
    var v = PM.vandaag();
    var week = PM.eindeWeek();
    var groepen = [
      { key: 'laat', titel: 'Te laat', icoon: 'alarm-clock', taken: [] },
      { key: 'vandaag', titel: 'Vandaag', icoon: 'sun', taken: [] },
      { key: 'week', titel: 'Deze week', icoon: 'calendar-days', taken: [] },
      { key: 'later', titel: 'Later', icoon: 'calendar-clock', taken: [] },
      { key: 'geen', titel: 'Zonder datum', icoon: 'inbox', taken: [] },
      { key: 'af', titel: 'Afgewerkt (laatste 14 dagen)', icoon: 'circle-check', taken: [] },
    ];
    var per = {};
    groepen.forEach(function (g) { per[g.key] = g; });
    taken.forEach(function (t) {
      if (t.done) per.af.taken.push(t);
      else if (!t.due_date) per.geen.taken.push(t);
      else if (t.due_date < v) per.laat.taken.push(t);
      else if (t.due_date === v) per.vandaag.taken.push(t);
      else if (t.due_date <= week) per.week.taken.push(t);
      else per.later.taken.push(t);
    });
    groepen.forEach(function (g) {
      g.taken.sort(function (a, b) {
        if (g.key === 'af') return String(b.done_at || '').localeCompare(String(a.done_at || ''));
        return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.created_at).localeCompare(String(b.created_at));
      });
    });
    return groepen;
  }

  function tekenMijn() {
    var m = S.mijn || { tasks: [], parents: [] };
    var ouders = {};
    (m.parents || []).forEach(function (p) { ouders[p.id] = p.title; });
    var tabs = '<div role="tablist" class="tabs tabs-boxed w-fit">'
      + '<button role="tab" type="button" class="tab ' + (S.route.weergave !== 'kalender' ? 'tab-active' : '') + '" data-action="weergave" data-weergave="lijst">Lijst</button>'
      + '<button role="tab" type="button" class="tab ' + (S.route.weergave === 'kalender' ? 'tab-active' : '') + '" data-action="weergave" data-weergave="kalender">Kalender</button></div>';
    var kop = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '<div><h1 class="text-2xl font-bold">Mijn taken</h1><p class="text-sm opacity-60">Alles wat op jouw naam staat, en je eigen to-do\'s.</p></div>' + tabs + '</div>';

    if (S.route.weergave === 'kalender') {
      PM.$('pmHoofd').innerHTML = kop + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-3"><div id="pmKalender"></div></div></div>';
      tekenKalender(m.tasks, { mijn: true });
      return;
    }
    var html = kop
      + '<div class="card bg-base-100 border border-base-content/10 mb-4"><div class="card-body p-3">'
      + '<input type="text" id="pmMijnSnel" class="input input-bordered w-full" placeholder="Nieuwe to-do voor jezelf… (Enter)" maxlength="300" data-snel-taak="1" data-mijn="1">'
      + '</div></div>';
    var leeg = true;
    mijnGroepen(m.tasks).forEach(function (g) {
      if (!g.taken.length) return;
      leeg = false;
      var dicht = g.key === 'af' && !S.toonAf;
      html += '<section class="mb-5"><button type="button" class="flex items-center gap-2 mb-1 px-1 text-sm font-semibold ' + (g.key === 'laat' ? 'text-error' : '') + '"'
        + (g.key === 'af' ? ' data-action="toon-af"' : '') + '>'
        + '<i data-lucide="' + g.icoon + '" class="w-4 h-4"></i>' + e(g.titel) + '<span class="opacity-50 font-normal">' + g.taken.length + '</span>'
        + (g.key === 'af' ? '<i data-lucide="' + (dicht ? 'chevron-down' : 'chevron-up') + '" class="w-4 h-4 opacity-50"></i>' : '') + '</button>'
        + (dicht ? '' : '<div class="card bg-base-100 border border-base-content/10"><div class="pm-lijnen">'
          + g.taken.map(function (t) { return PM.taakRij(t, m.tasks, { project: true, ouder: ouders[t.parent_id], geenAvatar: true }); }).join('')
          + '</div></div>')
        + '</section>';
    });
    if (leeg) {
      html += '<div class="text-center py-16 opacity-60"><i data-lucide="party-popper" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>'
        + '<p>Niets op jouw naam. Zet hierboven een to-do, of open een project in de zijbalk.</p></div>';
    }
    PM.$('pmHoofd').innerHTML = html;
  }

  // ── Project: kop en tabbladen ─────────────────────────────────────────────

  function projectKop(p, taken) {
    var st = PM.status(p.status);
    var hoofd = taken.filter(function (t) { return !t.parent_id; });
    var af = hoofd.filter(function (t) { return t.done; }).length;
    var pct = hoofd.length ? Math.round(af / hoofd.length * 100) : 0;
    var eigenaar = PM.persoon(p.owner_id);
    var tabs = ['lijst', 'bord', 'kalender', 'overzicht'].map(function (w) {
      var label = { lijst: 'Lijst', bord: 'Bord', kalender: 'Kalender', overzicht: 'Overzicht' }[w];
      return '<button role="tab" type="button" class="tab ' + (S.route.weergave === w ? 'tab-active' : '') + '" data-action="weergave" data-weergave="' + w + '">' + label + '</button>';
    }).join('');
    return '<div class="flex flex-wrap items-start justify-between gap-3 mb-4">'
      + '<div class="flex items-start gap-3 min-w-0">'
      + '<span class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white" style="background:' + PM.kleurHex(p.color) + '"><i data-lucide="' + e(p.icon || 'folder-kanban') + '" class="w-5 h-5"></i></span>'
      + '<div class="min-w-0"><h1 class="text-2xl font-bold leading-tight break-words">' + e(p.name) + (p.archived ? ' <span class="badge badge-ghost align-middle">Gearchiveerd</span>' : '') + '</h1>'
      + '<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mt-1">'
      + '<span class="badge badge-' + st.tone + ' badge-sm">' + e(st.label) + '</span>'
      + (eigenaar ? '<span class="inline-flex items-center gap-1.5 opacity-80">' + PM.avatar(p.owner_id, 5) + e(eigenaar.naam) + '</span>' : '')
      + (p.due_date ? '<span class="opacity-70 inline-flex items-center gap-1"><i data-lucide="flag" class="w-3.5 h-3.5"></i>' + e(PM.datumKort(p.due_date)) + '</span>' : '')
      + '<span class="inline-flex items-center gap-2 opacity-70"><progress class="progress progress-primary w-20" value="' + pct + '" max="100"></progress>' + af + '/' + hoofd.length + '</span>'
      + '</div></div></div>'
      + '<div class="flex items-center gap-2">'
      + '<div role="tablist" class="tabs tabs-boxed w-fit">' + tabs + '</div>'
      + '<button type="button" class="btn btn-ghost btn-sm btn-square" data-action="project-instellingen" title="Project instellen"><i data-lucide="settings-2" class="w-4 h-4"></i></button>'
      + '</div></div>';
  }

  function toonAfKnop() {
    return '<label class="label cursor-pointer gap-2 justify-start"><input type="checkbox" class="toggle toggle-xs" data-change="toon-af" ' + (S.toonAf ? 'checked' : '') + '>'
      + '<span class="label-text text-xs">Afgewerkte taken tonen</span></label>';
  }

  /** De taken van één sectie (null = zonder sectie), op volgorde, zonder subtaken. */
  function vanSectie(taken, sectieId) {
    return taken.filter(function (t) { return !t.parent_id && (t.section_id || null) === sectieId && (S.toonAf || !t.done); })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
  }

  function tekenLijst(d) {
    var html = '<div class="flex justify-end mb-2">' + toonAfKnop() + '</div>';
    var losse = vanSectie(d.tasks, null);
    if (losse.length) {
      html += '<section class="mb-5"><div class="pm-sectiekop"><span class="font-semibold opacity-60">Zonder sectie</span></div>'
        + '<div class="card bg-base-100 border border-base-content/10"><div class="pm-lijnen" data-drop-section="">'
        + losse.map(function (t) { return PM.taakRij(t, d.tasks, { slepen: true }); }).join('') + '</div></div></section>';
    }
    d.sections.forEach(function (s) {
      var lijst = vanSectie(d.tasks, s.id);
      html += '<section class="mb-5"><div class="pm-sectiekop group">'
        + '<span class="font-semibold">' + e(s.name) + '</span><span class="opacity-50 text-sm">' + lijst.length + '</span>'
        + '<span class="flex-1"></span>'
        + '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="sectie-hernoem" data-id="' + e(s.id) + '" title="Hernoemen"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>'
        + '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="sectie-weg" data-id="' + e(s.id) + '" title="Sectie weghalen"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>'
        + '</div><div class="card bg-base-100 border border-base-content/10"><div class="pm-lijnen" data-drop-section="' + e(s.id) + '">'
        + lijst.map(function (t) { return PM.taakRij(t, d.tasks, { slepen: true }); }).join('')
        + '</div><div class="px-2 py-1 border-t border-base-content/10">' + snelToevoegen(s.id) + '</div></div></section>';
    });
    html += '<button type="button" class="btn btn-ghost btn-sm" data-action="sectie-nieuw"><i data-lucide="plus" class="w-4 h-4"></i>Sectie toevoegen</button>';
    return html;
  }

  function tekenBord(d) {
    var kolom = function (id, naam, lijst, beheer) {
      return '<div class="pm-kolom"><div class="flex items-center gap-2 px-1 mb-2 group">'
        + '<span class="font-semibold text-sm truncate">' + e(naam) + '</span><span class="opacity-50 text-xs">' + lijst.length + '</span><span class="flex-1"></span>'
        + (beheer ? '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="sectie-hernoem" data-id="' + e(id) + '" title="Hernoemen"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>' : '')
        + '</div><div class="pm-kolom-inhoud" data-drop-section="' + e(id || '') + '">'
        + lijst.map(function (t) { return kaart(t, d.tasks); }).join('') + '</div>'
        + (beheer ? '<div class="mt-2">' + snelToevoegen(id) + '</div>' : '') + '</div>';
    };
    var html = '<div class="flex justify-end mb-2">' + toonAfKnop() + '</div><div class="pm-bord">';
    var losse = vanSectie(d.tasks, null);
    if (losse.length) html += kolom(null, 'Zonder sectie', losse, false);
    d.sections.forEach(function (s) { html += kolom(s.id, s.name, vanSectie(d.tasks, s.id), true); });
    html += '<div class="pm-kolom flex items-start"><button type="button" class="btn btn-ghost btn-sm w-full justify-start" data-action="sectie-nieuw"><i data-lucide="plus" class="w-4 h-4"></i>Sectie</button></div>';
    return html + '</div>';
  }

  function tekenOverzicht(d) {
    var p = d.project;
    var mijlpalen = d.tasks.filter(function (t) { return t.is_milestone; })
      .sort(function (a, b) { return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')); });
    var statussen = S.boot.statussen.map(function (s) {
      return '<option value="' + s.key + '"' + (s.key === p.status ? ' selected' : '') + '>' + e(s.label) + '</option>';
    }).join('');
    var mensen = '<option value="">Niemand</option>' + S.boot.mensen.map(function (m) {
      return '<option value="' + e(m.id) + '"' + (m.id === p.owner_id ? ' selected' : '') + '>' + e(m.naam) + '</option>';
    }).join('');
    return '<div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">'
      + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-3">'
      + '<h2 class="font-semibold">Waarover gaat dit project?</h2>'
      + '<textarea class="textarea textarea-bordered w-full min-h-[10rem] leading-relaxed" data-change="project-beschrijving" placeholder="Doel, afspraken, wat er klaar moet zijn…">' + e(p.description) + '</textarea>'
      + '<p class="text-xs opacity-50">Wordt bewaard zodra je ergens anders klikt.</p></div></div>'
      + '<div class="flex flex-col gap-4">'
      + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-3">'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Status</span><select class="select select-bordered select-sm" data-change="project-veld" data-veld="status">' + statussen + '</select></label>'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Eigenaar</span><select class="select select-bordered select-sm" data-change="project-veld" data-veld="owner_id">' + mensen + '</select></label>'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Einddatum</span><input type="date" class="input input-bordered input-sm" value="' + e(p.due_date || '') + '" data-change="project-veld" data-veld="due_date"></label>'
      + '</div></div>'
      + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-2">'
      + '<h2 class="font-semibold flex items-center gap-2"><i data-lucide="diamond" class="w-4 h-4 text-warning"></i>Mijlpalen</h2>'
      + (mijlpalen.length ? mijlpalen.map(function (t) {
        return '<button type="button" class="flex items-center gap-2 text-sm text-left py-1 ' + (t.done ? 'line-through opacity-50' : '') + '" data-action="open-taak" data-id="' + e(t.id) + '">'
          + '<span class="flex-1 min-w-0 truncate">' + e(t.title) + '</span><span class="text-xs tabular-nums ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date) || 'geen datum') + '</span></button>';
      }).join('') : '<p class="text-sm opacity-60">Nog geen mijlpalen. Maak van een taak een mijlpaal in haar detail.</p>')
      + '</div></div></div></div>';
  }

  // ── Kalender (FullCalendar, zoals bij Events en Nieuwsbrieven) ───────────

  function tekenKalender(taken, opties) {
    if (kalender) { kalender.destroy(); kalender = null; }
    var el = PM.$('pmKalender');
    if (!el || !window.FullCalendar) return;
    var events = taken.filter(function (t) { return t.due_date && (S.toonAf || !t.done || opties.mijn); }).map(function (t) {
      var kleur = PM.kleurHex((PM.projectVan(t.project_id) || {}).color || 'slate');
      return {
        id: t.id, title: (t.is_milestone ? '◆ ' : '') + t.title, start: t.due_date, allDay: true,
        backgroundColor: t.done ? 'transparent' : kleur, borderColor: kleur, textColor: t.done ? kleur : '#fff',
        classNames: t.done ? ['pm-kal-af'] : [],
      };
    });
    kalender = new window.FullCalendar.Calendar(el, {
      initialView: 'dayGridMonth', locale: 'nl', firstDay: 1, height: 'auto', editable: true,
      buttonText: { today: 'Vandaag' },
      headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
      events: events,
      eventClick: function (info) { PM.ga({ taak: info.event.id }); },
      eventDrop: function (info) {
        var datum = info.event.startStr.slice(0, 10);
        PM.probeer(async function () {
          await PM.api('/tasks/' + info.event.id, { method: 'PUT', body: { due_date: datum } });
          await PM.herlaad();
        }).then(function (r) { if (r === undefined) info.revert(); });
      },
      dateClick: function (info) { PM.vraagNieuweTaak(info.dateStr, !!opties.mijn); },
    });
    kalender.render();
  }

  // ── Hoofdvlak ─────────────────────────────────────────────────────────────

  PM.tekenHoofd = function () {
    if (S.route.soort === 'mijn') { tekenMijn(); PM.ikons(); return; }
    var d = S.project;
    if (!d) { PM.$('pmHoofd').innerHTML = '<div class="py-16 text-center opacity-60">Project laden…</div>'; return; }
    var html = projectKop(d.project, d.tasks);
    if (S.route.weergave === 'bord') html += tekenBord(d);
    else if (S.route.weergave === 'overzicht') html += tekenOverzicht(d);
    else if (S.route.weergave === 'kalender') html += '<div class="flex justify-end mb-2">' + toonAfKnop() + '</div><div class="card bg-base-100 border border-base-content/10"><div class="card-body p-3"><div id="pmKalender"></div></div></div>';
    else html += tekenLijst(d);
    PM.$('pmHoofd').innerHTML = html;
    if (S.route.weergave === 'kalender') tekenKalender(d.tasks, {});
    PM.ikons();
  };

  PM.teken = function () {
    PM.tekenZijbalk();
    PM.tekenHoofd();
    PM.ikons();
  };

  // ── Laden ─────────────────────────────────────────────────────────────────

  PM.laadProjecten = async function () { S.projecten = await PM.api('/projects'); };

  /** Opnieuw ophalen wat er nu op het scherm staat (na een wijziging). */
  PM.herlaad = async function () {
    var werk = [PM.laadProjecten()];
    if (S.route.soort === 'project') werk.push(PM.api('/projects/' + S.route.id).then(function (d) { S.project = d; }));
    else werk.push(PM.api('/my-tasks').then(function (d) { S.mijn = d; }));
    await Promise.all(werk);
    PM.teken();
  };

  // ── Acties ────────────────────────────────────────────────────────────────

  PM.actie('weergave', function (el) { PM.ga({ weergave: el.dataset.weergave }); });
  PM.actie('toon-af', function () { S.toonAf = !S.toonAf; PM.tekenHoofd(); });
  PM.bijWijziging('toon-af', function (el) { S.toonAf = el.checked; PM.tekenHoofd(); });
  PM.actie('toon-archief', function () { S.toonArchief = !S.toonArchief; PM.tekenZijbalk(); PM.ikons(); });
  PM.actie('open-taak', function (el) { PM.ga({ taak: el.dataset.id }); });
  PM.actie('zijbalk', function () { S.zijbalkOpen = !S.zijbalkOpen; PM.tekenZijbalk(); PM.ikons(); });
  PM.actie('sluit-zijbalk', function () { S.zijbalkOpen = false; });

  PM.actie('vink', function (el) {
    var id = el.dataset.id;
    var alle = (S.project ? S.project.tasks : []).concat(S.mijn ? S.mijn.tasks : []).concat(S.taak ? [S.taak.task].concat(S.taak.subtasks) : []);
    var t = alle.filter(function (x) { return x.id === id; })[0];
    var af = !(t && t.done);
    el.classList.toggle('pm-vink-af', af);
    PM.probeer(async function () {
      await PM.api('/tasks/' + id, { method: 'PUT', body: { done: af } });
      if (af) PM.toast('Afgevinkt');
      await PM.herlaad();
      if (S.taak) await PM.herlaadTaak();
    });
  });

  /** Snel een taak maken: Enter in een "+ Taak toevoegen"-veld. */
  PM.snelTaak = function (el) {
    var titel = el.value.trim();
    if (!titel) return;
    el.disabled = true;
    var body = { title: titel };
    if (el.dataset.mijn) body.assignee_id = PM.ik().id;
    else {
      body.project_id = S.route.id;
      if (el.dataset.section) body.section_id = el.dataset.section;
    }
    PM.probeer(async function () {
      await PM.api('/tasks', { method: 'POST', body: body });
      el.value = '';
      await PM.herlaad();
    }).finally(function () {
      var zelfde = el.dataset.mijn ? PM.$('pmMijnSnel') : document.querySelector('[data-snel-taak][data-section="' + (el.dataset.section || '') + '"]');
      if (zelfde) { zelfde.disabled = false; zelfde.focus(); }
    });
  };

  PM.vraagNieuweTaak = async function (datum, mijn) {
    var titel = await PM.vraag('Nieuwe taak op ' + PM.datumKort(datum), '', 'Wat moet er gebeuren?');
    if (!titel) return;
    var body = { title: titel, due_date: datum };
    if (mijn) body.assignee_id = PM.ik().id;
    else body.project_id = S.route.id;
    await PM.probeer(async function () { await PM.api('/tasks', { method: 'POST', body: body }); await PM.herlaad(); });
  };

  PM.actie('sectie-nieuw', async function () {
    var naam = await PM.vraag('Nieuwe sectie', '', 'bv. Voorbereiding');
    if (!naam) return;
    await PM.probeer(async function () { await PM.api('/projects/' + S.route.id + '/sections', { method: 'POST', body: { name: naam } }); await PM.herlaad(); });
  });
  PM.actie('sectie-hernoem', async function (el) {
    var s = S.project.sections.filter(function (x) { return x.id === el.dataset.id; })[0];
    var naam = await PM.vraag('Sectie hernoemen', s ? s.name : '');
    if (!naam) return;
    await PM.probeer(async function () { await PM.api('/sections/' + el.dataset.id, { method: 'PUT', body: { name: naam } }); await PM.herlaad(); });
  });
  PM.actie('sectie-weg', async function (el) {
    var ok = await PM.bevestig('Sectie weghalen? De taken erin blijven bestaan, onder "Zonder sectie".', 'Weghalen');
    if (!ok) return;
    await PM.probeer(async function () { await PM.api('/sections/' + el.dataset.id, { method: 'DELETE' }); await PM.herlaad(); });
  });

  PM.bijWijziging('project-beschrijving', function (el) {
    PM.probeer(async function () {
      await PM.api('/projects/' + S.route.id, { method: 'PUT', body: { description: el.value } });
      S.project.project.description = el.value;
      PM.toast('Bewaard');
    });
  });
  PM.bijWijziging('project-veld', function (el) {
    var body = {};
    body[el.dataset.veld] = el.value || null;
    PM.probeer(async function () { await PM.api('/projects/' + S.route.id, { method: 'PUT', body: body }); await PM.herlaad(); });
  });

  // ── Slepen (lijst en bord) ────────────────────────────────────────────────

  var gesleept = null;

  function naElement(bak, y) {
    var items = Array.prototype.slice.call(bak.querySelectorAll('[data-drag-task]:not(.pm-sleept)'));
    var best = null;
    var afstand = -Infinity;
    items.forEach(function (it) {
      var r = it.getBoundingClientRect();
      var verschil = y - r.top - r.height / 2;
      if (verschil < 0 && verschil > afstand) { afstand = verschil; best = it; }
    });
    return best;
  }

  document.addEventListener('dragstart', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-drag-task]');
    if (!el || el.getAttribute('draggable') !== 'true') return;
    gesleept = el;
    el.classList.add('pm-sleept');
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', el.dataset.dragTask); } catch (x) { /* oude browser */ }
  });
  document.addEventListener('dragover', function (ev) {
    if (!gesleept) return;
    var bak = ev.target.closest && ev.target.closest('[data-drop-section]');
    if (!bak) return;
    ev.preventDefault();
    var na = naElement(bak, ev.clientY);
    if (na) bak.insertBefore(gesleept, na); else bak.appendChild(gesleept);
  });
  // Zonder dit opent Firefox bij het loslaten de gesleepte tekst als adres.
  document.addEventListener('drop', function (ev) { if (gesleept) ev.preventDefault(); });

  document.addEventListener('dragend', function () {
    if (!gesleept) return;
    var el = gesleept;
    gesleept = null;
    el.classList.remove('pm-sleept');
    var bak = el.closest('[data-drop-section]');
    if (!bak) { PM.tekenHoofd(); return; }
    var sectie = bak.dataset.dropSection || null;
    var items = Array.prototype.map.call(bak.querySelectorAll('[data-drag-task]'), function (x) {
      return { id: x.dataset.dragTask, section_id: sectie };
    });
    PM.probeer(async function () {
      await PM.api('/tasks/move', { method: 'POST', body: { items: items } });
      await PM.herlaad();
    });
  });
})();
