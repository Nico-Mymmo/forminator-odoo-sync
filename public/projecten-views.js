/**
 * Projecten -- de weergaven: de kolom links (Mijn taken, projecten), de kop
 * van het werkblad (project + tabbladen), Mijn taken, en per project
 * Overzicht, Lijst, Kanban en Kalender. Tekent enkel; de acties staan
 * onderaan en worden door de centrale listener in projecten-bootstrap.js
 * aangeroepen.
 *
 * Opbouw zoals de rest van de OM: de kolom links is die van de homepage, de
 * lijst is een `table table-sm` in een kaart, de kalender is die van Events
 * en Nieuwsbrieven (om-kalender.css), en het detail van een taak is een
 * kaart rechts van het werkblad (projecten-taak.js), zoals bij Events.
 */

(function () {
  'use strict';

  var PM = window.PM;
  var S = PM.state;
  var e = PM.esc;
  var kalender = null;
  var dichteSecties = {};   // sectie-id -> true als ingeklapt

  // ── Kolom links ───────────────────────────────────────────────────────────

  function projectKnop(p) {
    var actief = S.route.soort === 'project' && S.route.id === p.id;
    return '<a href="#/project/' + e(p.id) + '" class="pm-nav ' + (actief ? 'pm-nav-actief' : '') + (p.archived ? ' opacity-50' : '') + '">'
      + '<span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:' + PM.kleurHex(p.color) + '"></span>'
      + '<span class="truncate flex-1">' + e(p.name) + '</span>'
      + (p.te_laat ? '<span class="badge badge-error badge-xs" title="' + p.te_laat + ' te laat">' + p.te_laat + '</span>' : '')
      + (p.open ? '<span class="text-xs opacity-50 tabular-nums">' + p.open + '</span>' : '')
      + '</a>';
  }

  PM.tekenZijbalk = function () {
    var actief = S.projecten.filter(function (p) { return !p.archived; });
    var archief = S.projecten.filter(function (p) { return p.archived; });
    var html = '<a href="#/mijn" class="pm-nav ' + (S.route.soort === 'mijn' ? 'pm-nav-actief' : '') + '">'
      + '<i data-lucide="circle-check-big" class="w-4 h-4"></i><span class="flex-1">Mijn taken</span></a>'
      + (S.boot && (S.boot.has_team || S.boot.is_manager_admin) ? '<a href="#/team" class="pm-nav ' + (S.route.soort === 'team' ? 'pm-nav-actief' : '') + '"><i data-lucide="users" class="w-4 h-4"></i><span class="flex-1">Mijn team</span></a>' : '')
      + '<div class="text-xs font-semibold uppercase tracking-wide opacity-50 mt-3 mb-1 px-2">Projecten</div>'
      + (actief.length ? actief.map(projectKnop).join('') : '<p class="text-xs opacity-50 px-2 py-1">Nog geen projecten.</p>');
    if (archief.length) {
      html += '<button type="button" class="pm-nav w-full text-xs opacity-60 mt-3" data-action="toon-archief">'
        + '<i data-lucide="archive" class="w-3.5 h-3.5"></i><span class="flex-1 text-left">Gearchiveerd (' + archief.length + ')</span>'
        + '<i data-lucide="' + (S.toonArchief ? 'chevron-up' : 'chevron-down') + '" class="w-3.5 h-3.5"></i></button>'
        + (S.toonArchief ? archief.map(projectKnop).join('') : '');
    }
    PM.$('pmZijbalk').innerHTML = html;
  };

  // ── Bouwstenen van een taak ───────────────────────────────────────────────

  function subTelling(t, alle) {
    var subs = alle.filter(function (x) { return x.parent_id === t.id; });
    if (!subs.length) return '';
    var af = subs.filter(function (x) { return x.done; }).length;
    return '<span class="inline-flex items-center gap-1 text-xs opacity-60 shrink-0" title="Subtaken"><i data-lucide="list-checks" class="w-3.5 h-3.5"></i>' + af + '/' + subs.length + '</span>';
  }

  function prioBadge(t) {
    if (t.priority === 'dringend') return '<span class="badge badge-error badge-sm">Dringend</span>';
    if (t.priority === 'hoog') return '<span class="badge badge-warning badge-sm">Hoog</span>';
    if (t.priority === 'laag') return '<span class="badge badge-ghost badge-sm">Laag</span>';
    return '<span class="text-xs opacity-40">Normaal</span>';
  }

  function labelsHtml(t) {
    return (t.labels || []).map(function (l) { return '<span class="badge badge-ghost badge-sm whitespace-nowrap">' + e(l) + '</span>'; }).join('');
  }

  function vinkje(t) {
    return '<button type="button" class="pm-vink ' + (t.done ? 'pm-vink-af' : '') + '" data-action="vink" data-id="' + e(t.id) + '" title="' + (t.done ? 'Terug openzetten' : 'Afvinken') + '">'
      + '<i data-lucide="check" class="w-3 h-3"></i></button>';
  }

  function persoonCel(t) {
    var p = PM.persoon(t.assignee_id);
    return '<span class="flex items-center gap-1.5">' + PM.avatar(t.assignee_id, 6)
      + '<span class="truncate text-xs ' + (p ? '' : 'opacity-40') + '">' + e(p ? p.voornaam : '') + '</span></span>';
  }

  function gekozenKlasse(t) {
    return S.taak && S.taak.task.id === t.id ? ' pm-gekozen' : '';
  }

  /** Een rij in de tabel. `opties.project` toont de projectkolom, `opties.ouder` de bovenliggende taak. */
  PM.taakRij = function (t, alle, opties) {
    opties = opties || {};
    var project = opties.project ? PM.projectVan(t.project_id) : null;
    return '<tr class="' + (t.done ? 'pm-af' : '') + gekozenKlasse(t) + '" draggable="' + (opties.slepen ? 'true' : 'false') + '" data-drag-task="' + e(t.id) + '" data-action="open-taak" data-id="' + e(t.id) + '">'
      + '<td class="w-8 pr-0">' + vinkje(t) + '</td>'
      + '<td><div class="flex items-center gap-2 min-w-0">'
      + (t.is_milestone ? '<i data-lucide="diamond" class="w-4 h-4 text-warning shrink-0" title="Mijlpaal"></i>' : '')
      + '<span class="pm-titel truncate">' + e(t.title) + '</span>'
      + (opties.ouder ? '<span class="text-xs opacity-50 truncate shrink-0 max-w-[10rem]">in ' + e(opties.ouder) + '</span>' : '')
      + subTelling(t, alle)
      + (t.labels && t.labels.length ? '<span class="hidden lg:inline-flex gap-1 shrink-0">' + labelsHtml(t) + '</span>' : '')
      + (t.odoo_model ? '<i data-lucide="link" class="w-3.5 h-3.5 opacity-50 shrink-0" title="Gekoppeld aan ' + e(t.odoo_name || 'Odoo') + '"></i>' : '')
      + '</div></td>'
      + (opties.project ? '<td class="hidden md:table-cell"><span class="flex items-center gap-1.5 text-xs">' + (project ? '<span class="w-2 h-2 rounded-sm shrink-0" style="background:' + PM.kleurHex(project.color) + '"></span><span class="truncate max-w-[10rem]">' + e(project.name) + '</span>' : '<span class="opacity-40">Losse to-do</span>') + '</span></td>' : '')
      + '<td class="w-32">' + persoonCel(t) + '</td>'
      + '<td class="w-24 text-xs whitespace-nowrap tabular-nums ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date)) + '</td>'
      + '<td class="w-24 hidden md:table-cell">' + prioBadge(t) + '</td>'
      + '</tr>';
  };

  /** Een subtaak in het detailpaneel: vinkje, titel, datum, foto. */
  PM.subtaakRij = function (t) {
    return '<div class="flex items-center gap-2 px-2 py-1.5 hover:bg-base-content/5 cursor-pointer ' + (t.done ? 'pm-af' : '') + '" data-action="open-taak" data-id="' + e(t.id) + '">'
      + vinkje(t) + '<span class="pm-titel flex-1 min-w-0 truncate text-sm">' + e(t.title) + '</span>'
      + '<span class="text-xs tabular-nums ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date)) + '</span>' + PM.avatar(t.assignee_id, 5) + '</div>';
  };

  function kopRij(metProject) {
    return '<thead><tr><th class="w-8"></th><th>Taak</th>' + (metProject ? '<th class="hidden md:table-cell">Project</th>' : '')
      + '<th>Verantwoordelijke</th><th>Vervaldatum</th><th class="hidden md:table-cell">Prioriteit</th></tr></thead>';
  }

  var KOLOMMEN = { gewoon: 5, metProject: 6 };

  function groepRij(id, titel, aantal, extra, kolommen) {
    return '<tr class="pm-groeprij"><th colspan="' + kolommen + '" class="pm-groep"><div class="flex items-center gap-1.5 group">'
      + '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="sectie-klap" data-id="' + e(id) + '"><i data-lucide="chevron-down" class="w-4 h-4 pm-klap"></i></button>'
      + '<span>' + e(titel) + '</span><span class="text-xs opacity-50 tabular-nums font-normal">' + aantal + '</span>' + (extra || '') + '</div></th></tr>';
  }

  function plusRij(sectieId, kolommen, extra) {
    return '<tr class="pm-plus"><td class="w-8 pr-0 text-center"><i data-lucide="plus" class="w-4 h-4 inline"></i></td><td colspan="' + (kolommen - 1) + '">'
      + '<input type="text" placeholder="Taak toevoegen…" maxlength="300" data-snel-taak="1" data-section="' + e(sectieId || '') + '"' + (extra || '') + '></td></tr>';
  }

  function kaart(t, alle) {
    var p = PM.persoon(t.assignee_id);
    return '<div class="pm-kaart ' + (t.done ? 'pm-af' : '') + gekozenKlasse(t) + '" draggable="true" data-drag-task="' + e(t.id) + '" data-action="open-taak" data-id="' + e(t.id) + '">'
      + '<div class="flex items-start gap-2">' + vinkje(t)
      + '<span class="pm-kaart-titel text-sm leading-snug flex-1 min-w-0">' + (t.is_milestone ? '<i data-lucide="diamond" class="w-3.5 h-3.5 text-warning inline-block mr-1 -mt-0.5"></i>' : '') + e(t.title) + '</span></div>'
      + ((t.labels && t.labels.length) || t.priority === 'hoog' || t.priority === 'dringend'
        ? '<div class="flex flex-wrap items-center gap-1 mt-2">' + (t.priority === 'hoog' || t.priority === 'dringend' ? prioBadge(t) : '') + labelsHtml(t) + '</div>' : '')
      + '<div class="flex items-center gap-2 mt-2.5">' + subTelling(t, alle)
      + (t.odoo_model ? '<i data-lucide="link" class="w-3.5 h-3.5 opacity-50"></i>' : '')
      + '<span class="flex-1"></span>'
      + (t.due_date ? '<span class="text-xs tabular-nums ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date)) + '</span>' : '')
      + (p ? PM.avatar(t.assignee_id, 6) : '') + '</div></div>';
  }

  function kaartWrap(inhoud, extra) {
    return '<div class="card bg-base-100 border border-base-content/10 shadow-sm' + (extra || '') + '">' + inhoud + '</div>';
  }

  // ── De kop van het werkblad ───────────────────────────────────────────────

  function tabbladen(lijst) {
    return '<div role="tablist" class="tabs tabs-boxed w-fit">' + lijst.map(function (w) {
      return '<button role="tab" type="button" class="tab ' + (S.route.weergave === w.key ? 'tab-active' : '') + '" data-action="weergave" data-weergave="' + w.key + '">'
        + '<i data-lucide="' + w.icoon + '" class="w-3.5 h-3.5 mr-1.5"></i>' + w.label + '</button>';
    }).join('') + '</div>';
  }

  function tekenKopMijn() {
    PM.$('pmKop').innerHTML = '<div class="flex flex-wrap items-center justify-between gap-3">'
      + '<div><h2 class="text-lg font-semibold">Mijn taken</h2><p class="text-xs opacity-60">Alles op jouw naam, en je eigen to-do\'s.</p></div>'
      + tabbladen([{ key: 'lijst', label: 'Lijst', icoon: 'list' }, { key: 'kalender', label: 'Kalender', icoon: 'calendar' }])
      + '</div>';
  }

  function tekenKopProject(p, taken) {
    var st = PM.status(p.status);
    var hoofd = taken.filter(function (t) { return !t.parent_id; });
    var af = hoofd.filter(function (t) { return t.done; }).length;
    var pct = hoofd.length ? Math.round(af / hoofd.length * 100) : 0;
    var eigenaar = PM.persoon(p.owner_id);
    PM.$('pmKop').innerHTML = '<div class="flex flex-wrap items-center justify-between gap-3">'
      + '<div class="flex items-center gap-3 min-w-0">'
      + '<span class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white" style="background:' + PM.kleurHex(p.color) + '"><i data-lucide="' + e(p.icon || 'folder-kanban') + '" class="w-5 h-5"></i></span>'
      + '<div class="min-w-0"><h2 class="text-lg font-semibold leading-tight truncate">' + e(p.name) + (p.archived ? ' <span class="badge badge-ghost badge-sm align-middle">Gearchiveerd</span>' : '') + '</h2>'
      + '<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-0.5">'
      + '<span class="badge badge-' + st.tone + ' badge-sm">' + e(st.label) + '</span>'
      + (eigenaar ? '<span class="inline-flex items-center gap-1 opacity-80">' + PM.avatar(p.owner_id, 4) + e(eigenaar.naam) + '</span>' : '')
      + (p.due_date ? '<span class="opacity-70 inline-flex items-center gap-1"><i data-lucide="flag" class="w-3 h-3"></i>' + e(PM.datumKort(p.due_date)) + '</span>' : '')
      + (p.odoo_model && p.odoo_id ? '<a href="' + e(PM.odooUrl(p)) + '" target="_blank" rel="noopener" class="link link-hover inline-flex items-center gap-1 opacity-70" title="Overgenomen uit Odoo: ' + e(p.odoo_name || '') + '"><i data-lucide="external-link" class="w-3 h-3"></i>Odoo</a>' : '')
      + '<span class="inline-flex items-center gap-1.5 opacity-70"><progress class="progress progress-primary w-16 h-1.5" value="' + pct + '" max="100"></progress>' + af + '/' + hoofd.length + '</span>'
      + '</div></div></div>'
      + '<div class="flex flex-wrap items-center gap-2">'
      + tabbladen([
        { key: 'overzicht', label: 'Overzicht', icoon: 'layout-dashboard' },
        { key: 'lijst', label: 'Lijst', icoon: 'list' },
        { key: 'kanban', label: 'Kanban', icoon: 'kanban' },
        { key: 'kalender', label: 'Kalender', icoon: 'calendar' },
      ])
      + '<label class="label cursor-pointer gap-1.5 py-0" title="Afgewerkte taken tonen"><input type="checkbox" class="toggle toggle-xs" data-change="toon-af" ' + (S.toonAf ? 'checked' : '') + '><span class="label-text text-xs">Afgewerkt</span></label>'
      + '<button type="button" class="btn btn-ghost btn-sm btn-square" data-action="project-instellingen" title="Project instellen"><i data-lucide="settings-2" class="w-4 h-4"></i></button>'
      + '</div></div>';
  }

  // ── Mijn taken ────────────────────────────────────────────────────────────

  function mijnGroepen(taken) {
    var v = PM.vandaag();
    var week = PM.eindeWeek();
    var groepen = [
      { key: 'laat', titel: 'Te laat', taken: [] },
      { key: 'vandaag', titel: 'Vandaag', taken: [] },
      { key: 'week', titel: 'Deze week', taken: [] },
      { key: 'later', titel: 'Later', taken: [] },
      { key: 'geen', titel: 'Zonder datum', taken: [] },
      { key: 'af', titel: 'Afgewerkt (laatste 14 dagen)', taken: [] },
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

  function sectieBody(id, rijen) {
    return '<tbody class="' + (dichteSecties[id] ? 'pm-sectie-dicht' : '') + '" data-sectie="' + e(id) + '">' + rijen + '</tbody>';
  }

  function kalenderKaart() {
    return kaartWrap('<div class="card-body p-4 overflow-hidden rounded-box relative min-h-[34rem] om-kalender"><div id="pmKalender"></div></div>');
  }

  function tekenMijn() {
    tekenKopMijn();
    var m = S.mijn || { tasks: [], parents: [] };
    var ouders = {};
    (m.parents || []).forEach(function (p) { ouders[p.id] = p.title; });

    if (S.route.weergave === 'kalender') {
      PM.$('pmHoofd').innerHTML = kalenderKaart();
      tekenKalender(m.tasks, { mijn: true });
      return;
    }
    var k = KOLOMMEN.metProject;
    var html = '<table class="table table-sm pm-tabel">' + kopRij(true)
      + '<tbody>' + plusRij('', k, ' id="pmMijnSnel" data-mijn="1"').replace('Taak toevoegen…', 'Nieuwe to-do voor jezelf…') + '</tbody>';
    var leeg = true;
    mijnGroepen(m.tasks).forEach(function (g) {
      if (!g.taken.length) return;
      leeg = false;
      if (g.key === 'af' && dichteSecties[g.key] === undefined) dichteSecties[g.key] = true;
      html += sectieBody(g.key, groepRij(g.key, g.titel, g.taken.length, g.key === 'laat' ? '<span class="badge badge-error badge-xs ml-1">!</span>' : '', k)
        + g.taken.map(function (t) { return PM.taakRij(t, m.tasks, { project: true, ouder: ouders[t.parent_id] }); }).join(''));
    });
    html += '</table>';
    if (leeg) {
      html += '<div class="text-center py-12 opacity-60"><i data-lucide="party-popper" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>'
        + '<p class="text-sm">Niets op jouw naam. Typ hierboven een to-do, of open een project links.</p></div>';
    }
    PM.$('pmHoofd').innerHTML = kaartWrap('<div class="card-body p-0">' + html + '</div>');
  }

  // ── Project: Lijst ────────────────────────────────────────────────────────

  /** De taken van één sectie (null = zonder sectie), op volgorde, zonder subtaken. */
  function vanSectie(taken, sectieId) {
    return taken.filter(function (t) { return !t.parent_id && (t.section_id || null) === sectieId && (S.toonAf || !t.done); })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
  }

  function sectieKnoppen(s) {
    return '<span class="flex-1"></span>'
      + '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="sectie-hernoem" data-id="' + e(s.id) + '" title="Hernoemen"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>'
      + '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="sectie-weg" data-id="' + e(s.id) + '" title="Sectie weghalen"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>';
  }

  function tekenLijst(d) {
    var k = KOLOMMEN.gewoon;
    var html = '<table class="table table-sm pm-tabel">' + kopRij(false);
    var losse = vanSectie(d.tasks, null);
    if (losse.length) {
      html += sectieBody('__geen', groepRij('__geen', 'Zonder sectie', losse.length, '', k)
        + losse.map(function (t) { return PM.taakRij(t, d.tasks, { slepen: true }); }).join(''))
        .replace('<tbody class="', '<tbody data-drop-section="" class="');
    }
    d.sections.forEach(function (s) {
      var lijst = vanSectie(d.tasks, s.id);
      html += sectieBody(s.id, groepRij(s.id, s.name, lijst.length, sectieKnoppen(s), k)
        + lijst.map(function (t) { return PM.taakRij(t, d.tasks, { slepen: true }); }).join('') + plusRij(s.id, k))
        .replace('<tbody class="', '<tbody data-drop-section="' + e(s.id) + '" class="');
    });
    html += '</table>'
      + '<div class="px-3 py-2 border-t border-base-content/10"><button type="button" class="btn btn-ghost btn-sm" data-action="sectie-nieuw"><i data-lucide="plus" class="w-4 h-4"></i>Sectie toevoegen</button></div>';
    return kaartWrap('<div class="card-body p-0">' + html + '</div>');
  }

  // ── Project: Kanban ───────────────────────────────────────────────────────

  function tekenKanban(d) {
    var kolom = function (id, naam, lijst, beheer) {
      return '<div class="pm-kolom"><div class="flex items-center gap-1.5 px-3 pt-3 pb-1 group">'
        + '<span class="font-semibold text-sm truncate">' + e(naam) + '</span><span class="opacity-50 text-xs tabular-nums">' + lijst.length + '</span><span class="flex-1"></span>'
        + (beheer ? '<button type="button" class="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100" data-action="sectie-hernoem" data-id="' + e(id) + '" title="Hernoemen"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>'
          + '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="kanban-plus" data-id="' + e(id) + '" title="Taak toevoegen"><i data-lucide="plus" class="w-4 h-4"></i></button>' : '')
        + '</div><div class="pm-kolom-inhoud" data-drop-section="' + e(id || '') + '">'
        + lijst.map(function (t) { return kaart(t, d.tasks); }).join('') + '</div>'
        + (beheer ? '<div class="pm-plus flex items-center gap-2 px-3 pb-3 pt-1 text-sm"><i data-lucide="plus" class="w-4 h-4 shrink-0"></i><input type="text" placeholder="Taak toevoegen…" maxlength="300" data-snel-taak="1" data-section="' + e(id) + '"></div>' : '<div class="pb-3"></div>') + '</div>';
    };
    var html = '<div class="pm-kanban">';
    var losse = vanSectie(d.tasks, null);
    if (losse.length) html += kolom(null, 'Zonder sectie', losse, false);
    d.sections.forEach(function (s) { html += kolom(s.id, s.name, vanSectie(d.tasks, s.id), true); });
    html += '<div class="flex-none w-48"><button type="button" class="btn btn-ghost btn-sm w-full justify-start" data-action="sectie-nieuw"><i data-lucide="plus" class="w-4 h-4"></i>Sectie toevoegen</button></div>';
    return html + '</div>';
  }

  // ── Project: Overzicht ────────────────────────────────────────────────────

  function tekenOverzicht(d) {
    var p = d.project;
    var hoofd = d.tasks.filter(function (t) { return !t.parent_id; });
    var v = PM.vandaag();
    var open = hoofd.filter(function (t) { return !t.done; });
    var teLaat = open.filter(function (t) { return t.due_date && t.due_date < v; });
    var mijlpalen = d.tasks.filter(function (t) { return t.is_milestone; })
      .sort(function (a, b) { return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')); });
    var statussen = S.boot.statussen.map(function (s) {
      return '<option value="' + s.key + '"' + (s.key === p.status ? ' selected' : '') + '>' + e(s.label) + '</option>';
    }).join('');
    var mensen = '<option value="">Niemand</option>' + S.boot.mensen.map(function (m) {
      return '<option value="' + e(m.id) + '"' + (m.id === p.owner_id ? ' selected' : '') + '>' + e(m.naam) + '</option>';
    }).join('');
    var tegel = function (label, waarde, klasse) {
      return '<div class="rounded-box bg-base-100 border border-base-content/10 px-4 py-3"><div class="text-xs opacity-60">' + label + '</div><div class="text-2xl font-bold tabular-nums ' + (klasse || '') + '">' + waarde + '</div></div>';
    };
    var per = {};
    open.forEach(function (t) { if (t.assignee_id) per[t.assignee_id] = (per[t.assignee_id] || 0) + 1; });
    var team = Object.keys(per).sort(function (a, b) { return per[b] - per[a]; });
    var blok = function (titel, inhoud) { return kaartWrap('<div class="card-body p-4 gap-2"><h3 class="font-semibold">' + titel + '</h3>' + inhoud + '</div>'); };

    return '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">'
      + tegel('Open taken', open.length) + tegel('Afgewerkt', hoofd.length - open.length)
      + tegel('Te laat', teLaat.length, teLaat.length ? 'text-error' : '') + tegel('Mijlpalen', mijlpalen.length)
      + '</div>'
      + '<div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">'
      + blok('Waarover gaat dit project?',
        '<textarea class="textarea textarea-bordered textarea-sm w-full min-h-[10rem] leading-relaxed" data-change="project-beschrijving" placeholder="Doel, afspraken, wat er klaar moet zijn…">' + e(p.description) + '</textarea>'
        + '<p class="text-xs opacity-50">Wordt bewaard zodra je ergens anders klikt.</p>')
      + '<div class="flex flex-col gap-4">'
      + blok('Projectgegevens',
        '<label class="form-control"><span class="label-text text-xs mb-1">Status</span><select class="select select-bordered select-sm" data-change="project-veld" data-veld="status">' + statussen + '</select></label>'
        + '<label class="form-control"><span class="label-text text-xs mb-1">Eigenaar</span><select class="select select-bordered select-sm" data-change="project-veld" data-veld="owner_id">' + mensen + '</select></label>'
        + '<label class="form-control"><span class="label-text text-xs mb-1">Einddatum</span><input type="date" class="input input-bordered input-sm" value="' + e(p.due_date || '') + '" data-change="project-veld" data-veld="due_date"></label>')
      + blok('<span class="inline-flex items-center gap-2"><i data-lucide="diamond" class="w-4 h-4 text-warning"></i>Mijlpalen</span>',
        mijlpalen.length ? mijlpalen.map(function (t) {
          return '<button type="button" class="flex items-center gap-2 text-sm text-left py-1 w-full ' + (t.done ? 'line-through opacity-50' : '') + '" data-action="open-taak" data-id="' + e(t.id) + '">'
            + '<span class="flex-1 min-w-0 truncate">' + e(t.title) + '</span><span class="text-xs tabular-nums ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date) || 'geen datum') + '</span></button>';
        }).join('') : '<p class="text-sm opacity-60">Nog geen mijlpalen. Zet in het detail van een taak het vinkje "Mijlpaal" aan.</p>')
      + blok('Wie werkt eraan',
        team.length ? team.map(function (id) {
          var m = PM.persoon(id);
          return '<div class="flex items-center gap-2 text-sm">' + PM.avatar(id, 6) + '<span class="flex-1 truncate">' + e(m ? m.naam : '') + '</span><span class="text-xs opacity-60 tabular-nums">' + per[id] + ' open</span></div>';
        }).join('') : '<p class="text-sm opacity-60">Nog niemand heeft een open taak in dit project.</p>')
      + '</div></div>';
  }

  // ── Kalender: dezelfde kalender als bij Events en Nieuwsbrieven ──────────

  function kalInhoud(arg) {
    var p = arg.event.extendedProps;
    var el = document.createElement('div');
    el.className = 'pm-kal-kaart';
    el.innerHTML = '<div class="pm-kal-kop"><span>' + e(p.kop) + '</span></div><div class="pm-kal-titel">' + e(p.taak.title) + '</div>';
    el.title = p.taak.title + (p.persoon ? ' — ' + p.persoon : '');
    return { domNodes: [el] };
  }

  function kalStijl(info) {
    var p = info.event.extendedProps;
    info.el.style.setProperty('--event-bg', p.kleur);
    info.el.style.setProperty('--event-text', '#ffffff');
  }

  function tekenKalender(taken, opties) {
    if (kalender) { kalender.destroy(); kalender = null; }
    var el = PM.$('pmKalender');
    if (!el) return;
    if (typeof window.FullCalendar === 'undefined') {
      el.innerHTML = '<div class="alert alert-warning text-sm"><span>De kalender kon niet geladen worden. Gebruik de lijst.</span></div>';
      return;
    }
    var items = taken.filter(function (t) { return t.due_date && (S.toonAf || !t.done || opties.mijn); }).map(function (t) {
      var project = PM.projectVan(t.project_id);
      var persoon = PM.persoon(t.assignee_id);
      return {
        id: t.id, title: t.title, start: t.due_date, allDay: true,
        classNames: t.done ? ['pm-kal-af'] : [],
        extendedProps: {
          taak: t,
          kop: t.is_milestone ? 'Mijlpaal' : (project ? project.name : 'Losse to-do'),
          kleur: PM.kleurHex(project ? project.color : 'slate'),
          persoon: persoon ? persoon.naam : '',
        },
      };
    });
    kalender = new window.FullCalendar.Calendar(el, {
      initialView: 'dayGridMonth',
      initialDate: S.kalMaand || undefined,
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
      events: items,
      eventContent: kalInhoud,
      eventDidMount: kalStijl,
      datesSet: function (info) { S.kalMaand = info.view.currentStart.toISOString(); },
      eventClick: function (info) { info.jsEvent.preventDefault(); PM.ga({ taak: info.event.id }); },
      eventDrop: function (info) {
        var datum = info.event.startStr.slice(0, 10);
        PM.probeer(async function () {
          await PM.api('/tasks/' + info.event.id, { method: 'PUT', body: { due_date: datum } });
          PM.toast('Verplaatst naar ' + PM.datumKort(datum));
          await PM.herlaad();
          return true;
        }).then(function (ok) { if (!ok) info.revert(); });
      },
      // Op een lege dag klikken = een nieuwe taak op die dag (zoals bij Events). Het verleden niet.
      dateClick: function (info) {
        if (info.dateStr < PM.vandaag()) return;
        PM.vraagNieuweTaak(info.dateStr, !!opties.mijn);
      },
      dayCellClassNames: function (arg) {
        return arg.date.toISOString().slice(0, 10) < PM.vandaag() ? [] : ['fc-day-clickable'];
      },
    });
    kalender.render();
  }

  // ── Werkblad ──────────────────────────────────────────────────────────────

  // ── Mijn team (teamweekly) ────────────────────────────────────────────────
  //
  // Per persoon (de manager zelf en wie in Odoo onder hem staat): wat te laat
  // is, wat deze week moet, wat later komt, en de projecten die hij bezit.
  // Bedoeld om tijdens de teamweekly door te lopen; een klik opent de taak.

  function teamGroepen(taken) {
    var v = PM.vandaag();
    var week = PM.eindeWeek();
    var g = { laat: [], week: [], later: [], geen: [], af: [] };
    taken.forEach(function (t) {
      if (t.done) g.af.push(t);
      else if (!t.due_date) g.geen.push(t);
      else if (t.due_date < v) g.laat.push(t);
      else if (t.due_date <= week) g.week.push(t);
      else g.later.push(t);
    });
    Object.keys(g).forEach(function (k) {
      g[k].sort(function (a, b) { return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')); });
    });
    return g;
  }

  function teamTaak(t) {
    var p = PM.projectVan(t.project_id);
    return '<div class="flex items-center gap-2 px-3 py-1.5 hover:bg-base-content/5 cursor-pointer ' + (t.done ? 'pm-af' : '') + gekozenKlasse(t) + '" data-action="open-taak" data-id="' + e(t.id) + '" data-drag-task="' + e(t.id) + '">'
      + vinkje(t) + '<span class="pm-titel flex-1 min-w-0 truncate text-sm">' + e(t.title) + '</span>'
      + (p ? '<span class="hidden sm:inline-flex items-center gap-1 text-xs opacity-60 max-w-[10rem] truncate"><span class="w-2 h-2 rounded-sm shrink-0" style="background:' + PM.kleurHex(p.color) + '"></span>' + e(p.name) + '</span>' : '')
      + (t.priority === 'hoog' || t.priority === 'dringend' ? prioBadge(t) : '')
      + '<span class="text-xs tabular-nums whitespace-nowrap ' + PM.datumKlasse(t) + '">' + e(PM.datumKort(t.due_date)) + '</span></div>';
  }

  function teamPersoon(lid, isManager) {
    var p = PM.persoon(lid.user_id);
    var g = teamGroepen(lid.tasks);
    var open = lid.tasks.filter(function (t) { return !t.done; }).length;
    var blok = function (titel, lijst, klasse) {
      if (!lijst.length) return '';
      return '<div class="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide ' + (klasse || 'opacity-50') + '">' + titel + ' <span class="font-normal">' + lijst.length + '</span></div>'
        + '<div class="pm-lijnen">' + lijst.map(teamTaak).join('') + '</div>';
    };
    return kaartWrap('<div class="card-body p-0">'
      + '<div class="flex items-center gap-3 px-4 py-3 border-b border-base-content/10">' + PM.avatar(lid.user_id, 10)
      + '<div class="min-w-0 flex-1"><div class="font-semibold truncate">' + e(p ? p.naam : 'Onbekend') + (isManager ? ' <span class="badge badge-ghost badge-xs align-middle">manager</span>' : '') + '</div>'
      + '<div class="text-xs opacity-60">' + (p && p.functie ? e(p.functie) + ' · ' : '') + open + ' open' + (g.laat.length ? ', <span class="text-error font-medium">' + g.laat.length + ' te laat</span>' : '') + '</div></div>'
      + '<a href="#/mijn" class="btn btn-ghost btn-xs hidden"></a></div>'
      + (lid.projects.length ? '<div class="px-3 py-2 border-b border-base-content/10 flex flex-wrap gap-1.5">' + lid.projects.map(function (pr) {
        var st = PM.status(pr.status);
        return '<a href="#/project/' + e(pr.id) + '/overzicht" class="badge badge-outline gap-1.5 py-2.5 hover:bg-base-content/5"><span class="w-2 h-2 rounded-sm" style="background:' + PM.kleurHex(pr.color) + '"></span>' + e(pr.name) + '<span class="badge badge-' + st.tone + ' badge-xs">' + e(st.label) + '</span></a>';
      }).join('') + '</div>' : '')
      + blok('Te laat', g.laat, 'text-error') + blok('Deze week', g.week) + blok('Later', g.later) + blok('Zonder datum', g.geen)
      + (open ? '' : '<p class="px-4 py-4 text-sm opacity-60">Geen open taken.</p>')
      + (g.af.length ? '<details class="border-t border-base-content/10"><summary class="px-3 py-2 text-xs opacity-60 cursor-pointer">Afgewerkt, laatste 14 dagen (' + g.af.length + ')</summary><div class="pm-lijnen">' + g.af.map(teamTaak).join('') + '</div></details>' : '')
      + '</div>', ' pm-teamkaart');
  }

  function tekenTeam() {
    var d = S.team;
    var mgr = PM.persoon(d.manager);
    var keuze = '';
    if (d.managers && d.managers.length > 1) {
      keuze = '<select class="select select-bordered select-sm" data-change="team-manager">' + d.managers.map(function (id) {
        var m = PM.persoon(id);
        return '<option value="' + e(id) + '"' + (id === d.manager ? ' selected' : '') + '>Team van ' + e(m ? m.voornaam : id) + '</option>';
      }).join('') + '</select>';
    }
    var alle = d.members.reduce(function (a, m) { return a.concat(m.tasks); }, []);
    var teLaat = alle.filter(function (t) { return !t.done && t.due_date && t.due_date < d.vandaag; }).length;
    PM.$('pmKop').innerHTML = '<div class="flex flex-wrap items-center justify-between gap-3">'
      + '<div><h2 class="text-lg font-semibold">Team van ' + e(mgr ? mgr.voornaam : '') + '</h2><p class="text-xs opacity-60">Voor de teamweekly: wat op ieders naam staat, en de projecten die ze trekken.'
      + (teLaat ? ' <span class="text-error font-medium">' + teLaat + ' te laat.</span>' : '') + '</p></div>' + keuze + '</div>';
    PM.$('pmHoofd').innerHTML = '<div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 items-start">'
      + d.members.map(function (lid, i) { return teamPersoon(lid, i === 0); }).join('') + '</div>';
  }

  PM.bijWijziging('team-manager', function (el) { PM.ga({ soort: 'team', id: el.value, weergave: 'lijst', taak: null }); });

  PM.tekenHoofd = function () {
    if (S.route.soort === 'team') { if (S.team) tekenTeam(); PM.ikons(); return; }
    if (S.route.soort === 'mijn') { tekenMijn(); PM.ikons(); return; }
    var d = S.project;
    if (!d) { PM.$('pmKop').innerHTML = ''; PM.$('pmHoofd').innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div>'; return; }
    tekenKopProject(d.project, d.tasks);
    var html;
    if (S.route.weergave === 'kanban') html = tekenKanban(d);
    else if (S.route.weergave === 'overzicht') html = tekenOverzicht(d);
    else if (S.route.weergave === 'kalender') html = kalenderKaart();
    else html = tekenLijst(d);
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
    else if (S.route.soort === 'team') werk.push(PM.api('/team' + (S.route.id ? '?manager=' + encodeURIComponent(S.route.id) : '')).then(function (d) { S.team = d; }));
    else werk.push(PM.api('/my-tasks').then(function (d) { S.mijn = d; }));
    await Promise.all(werk);
    PM.teken();
  };

  // ── Acties ────────────────────────────────────────────────────────────────

  PM.actie('weergave', function (el) { PM.ga({ weergave: el.dataset.weergave }); });
  PM.bijWijziging('toon-af', function (el) { S.toonAf = el.checked; PM.tekenHoofd(); });
  PM.actie('toon-archief', function () { S.toonArchief = !S.toonArchief; PM.tekenZijbalk(); PM.ikons(); });
  PM.actie('open-taak', function (el, ev) {
    // Een klik op het vinkje of een knop IN de rij is geen klik op de rij.
    if (ev && ev.target.closest('[data-action]') !== el) return;
    if (ev && ev.target.closest('input')) return;
    PM.ga({ taak: el.dataset.id });
  });
  PM.actie('sectie-klap', function (el) {
    dichteSecties[el.dataset.id] = !dichteSecties[el.dataset.id];
    var body = el.closest('tbody');
    if (body) body.classList.toggle('pm-sectie-dicht', !!dichteSecties[el.dataset.id]);
  });
  PM.actie('kanban-plus', function (el) {
    var veld = document.querySelector('.pm-kanban [data-snel-taak][data-section="' + el.dataset.id + '"]');
    if (veld) veld.focus();
  });

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

  /** Snel een taak maken: Enter in een "Taak toevoegen…"-veld. */
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
    var kenmerk = el.dataset.mijn ? '#pmMijnSnel' : '[data-snel-taak][data-section="' + (el.dataset.section || '') + '"]';
    PM.probeer(async function () {
      await PM.api('/tasks', { method: 'POST', body: body });
      el.value = '';
      await PM.herlaad();
    }).finally(function () {
      var zelfde = document.querySelector(kenmerk);
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

  // ── Slepen (lijst en kanban) ──────────────────────────────────────────────

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
    // In een tabel blijft de toevoegrij onderaan en de groepsrij bovenaan.
    var plus = bak.querySelector('.pm-plus');
    if (na) bak.insertBefore(gesleept, na); else if (plus) bak.insertBefore(gesleept, plus); else bak.appendChild(gesleept);
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
