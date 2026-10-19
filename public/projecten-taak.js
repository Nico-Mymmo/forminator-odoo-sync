/**
 * Projecten -- het detail van een taak: een paneel rechts (op de gsm het hele
 * scherm). Velden bewaren meteen bij een wijziging; er is geen knop Opslaan.
 * Ook hier: de koppeling met Odoo en de keuze uit Assetbeheer.
 */

(function () {
  'use strict';

  var PM = window.PM;
  var S = PM.state;
  var e = PM.esc;
  var vermeld = {};   // id -> voornaam, van wie in de opmerking die je typt vermeld wordt

  var VELDNAMEN = {
    title: 'de titel', assignee_id: 'de verantwoordelijke', due_date: 'de vervaldatum', priority: 'de prioriteit',
    done: 'afgewerkt', section_id: 'de sectie', project_id: 'het project', is_milestone: 'mijlpaal',
    labels: 'de labels', odoo_name: 'de koppeling met Odoo', description: 'de beschrijving',
  };

  PM.openTaak = async function (id) {
    if (S.taak && S.taak.task.id === id) { tekenPaneel(); return; }
    PM.$('pmTaak').innerHTML = '<div class="p-6 opacity-60">Taak laden…</div>';
    toon(true);
    var d = await PM.probeer(function () { return PM.api('/tasks/' + id); });
    if (!d) { PM.sluitTaak(); return; }
    S.taak = d;
    vermeld = {};
    tekenPaneel();
  };

  PM.herlaadTaak = async function () {
    if (!S.taak) return;
    var d = await PM.probeer(function () { return PM.api('/tasks/' + S.taak.task.id); });
    if (d) { S.taak = d; tekenPaneel(); }
  };

  PM.sluitTaak = function () {
    S.taak = null;
    toon(false);
    if (S.route.taak) PM.ga({ taak: null });
  };
  PM.toonTaakPaneel = toon;

  function toon(aan) {
    PM.$('pmTaakKolom').classList.toggle('hidden', !aan);
    PM.$('pmHoofdKolom').classList.toggle('xl:col-span-7', aan);
    if (aan && window.innerWidth < 1280) PM.$('pmTaakKolom').scrollIntoView({ behavior: 'smooth', block: 'start' });
    // De gekozen rij of kaart licht op in het werkvlak.
    document.querySelectorAll('#pmHoofd .pm-gekozen').forEach(function (x) { x.classList.remove('pm-gekozen'); });
    if (aan && S.taak) {
      document.querySelectorAll('#pmHoofd [data-drag-task="' + S.taak.task.id + '"]').forEach(function (x) { x.classList.add('pm-gekozen'); });
    }
  }

  // ── Tekenen ───────────────────────────────────────────────────────────────

  function opties(lijst, gekozen, leeg) {
    return (leeg !== undefined ? '<option value="">' + e(leeg) + '</option>' : '')
      + lijst.map(function (o) { return '<option value="' + e(o.key) + '"' + (o.key === gekozen ? ' selected' : '') + '>' + e(o.label) + '</option>'; }).join('');
  }

  function veld(label, inhoud) {
    return '<div class="pm-veld"><span class="text-xs opacity-60 pt-1.5">' + label + '</span><div class="min-w-0">' + inhoud + '</div></div>';
  }

  function linkify(tekst) {
    return tekst.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="link link-primary break-all">$1</a>');
  }

  function opmerkingHtml(c) {
    var p = PM.persoon(c.author_id);
    var body = linkify(e(c.body));
    (c.mentions || []).forEach(function (id) {
      var m = PM.persoon(id);
      if (!m) return;
      var re = new RegExp('@' + m.voornaam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      body = body.replace(re, '<span class="text-primary font-medium">@' + e(m.voornaam) + '</span>');
    });
    var eigen = c.author_id === PM.ik().id || PM.ik().is_admin;
    return '<div class="flex gap-3 group">' + PM.avatar(c.author_id, 8)
      + '<div class="flex-1 min-w-0"><div class="flex items-center gap-2 text-sm"><span class="font-medium">' + e(p ? p.naam : 'Onbekend') + '</span>'
      + '<span class="text-xs opacity-50">' + e(PM.tijdstip(c.created_at)) + '</span><span class="flex-1"></span>'
      + (eigen ? '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="opmerking-weg" data-id="' + e(c.id) + '" title="Weghalen"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>' : '')
      + '</div><div class="text-sm whitespace-pre-wrap break-words">' + body + '</div></div></div>';
  }

  function historiekRegel(h) {
    var wie = PM.persoon(h.user_id);
    var naam = wie ? wie.voornaam || wie.naam : 'Iemand';
    var tekst;
    if (h.action === 'aangemaakt') tekst = 'maakte de taak aan';
    else if (h.action === 'bijlage') tekst = 'voegde bijlage "' + e(h.new_value) + '" toe';
    else if (h.field === 'description') tekst = 'paste de beschrijving aan';
    else if (h.field === 'done') tekst = h.new_value === 'ja' ? 'vinkte de taak af' : 'zette de taak terug open';
    else {
      tekst = 'wijzigde ' + (VELDNAMEN[h.field] || e(h.field))
        + (h.old_value ? ' van <span class="opacity-70">' + e(h.old_value) + '</span>' : '')
        + ' naar <span class="opacity-70">' + e(h.new_value || 'leeg') + '</span>';
    }
    return '<li class="text-xs"><span class="font-medium">' + e(naam) + '</span> ' + tekst + ' <span class="opacity-50">· ' + e(PM.tijdstip(h.created_at)) + '</span></li>';
  }

  function bijlageHtml(a) {
    var icoon = a.kind === 'link' ? 'link' : a.kind === 'asset' ? 'image' : 'paperclip';
    return '<div class="flex items-center gap-2 text-sm group py-1">'
      + '<i data-lucide="' + icoon + '" class="w-4 h-4 opacity-60 shrink-0"></i>'
      + '<a href="' + e(a.url) + '" target="_blank" rel="noopener" class="link link-hover truncate flex-1 min-w-0">' + e(a.name) + '</a>'
      + (a.size ? '<span class="text-xs opacity-50 tabular-nums">' + Math.max(1, Math.round(a.size / 1024)) + ' kB</span>' : '')
      + '<button type="button" class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100" data-action="bijlage-weg" data-id="' + e(a.id) + '" title="Weghalen"><i data-lucide="x" class="w-3.5 h-3.5"></i></button></div>';
  }

  function tekenPaneel() {
    var d = S.taak;
    var t = d.task;
    var ik = PM.ik();
    var mensen = S.boot.mensen.map(function (m) { return { key: m.id, label: m.naam }; });
    var projecten = S.projecten.filter(function (p) { return !p.archived || p.id === t.project_id; }).map(function (p) { return { key: p.id, label: p.name }; });
    var secties = (d.sections || []).map(function (s) { return { key: s.id, label: s.name }; });
    var volg = (t.followers || []).indexOf(ik.id) !== -1;

    var pad = d.parent
      ? '<button type="button" class="link link-hover truncate" data-action="open-taak" data-id="' + e(d.parent.id) + '">' + e(d.parent.title) + '</button>'
      : d.project ? '<a href="#/project/' + e(d.project.id) + '" class="link link-hover truncate inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm" style="background:' + PM.kleurHex(d.project.color) + '"></span>' + e(d.project.name) + '</a>'
        : '<span class="opacity-70">Losse to-do</span>';

    var html = '<div class="sticky top-0 z-10 bg-base-100 border-b border-base-content/10 px-4 py-2 flex items-center gap-2 rounded-t-box">'
      + '<button type="button" class="btn btn-sm ' + (t.done ? 'btn-success' : 'btn-outline') + '" data-action="vink" data-id="' + e(t.id) + '"><i data-lucide="check" class="w-4 h-4"></i>' + (t.done ? 'Afgewerkt' : 'Markeer als af') + '</button>'
      + '<span class="flex-1"></span>'
      + '<button type="button" class="btn btn-ghost btn-sm btn-square" data-action="taak-link" title="Link naar deze taak kopiëren"><i data-lucide="link-2" class="w-4 h-4"></i></button>'
      + '<button type="button" class="btn btn-ghost btn-sm btn-square" data-action="taak-weg" title="Taak verwijderen"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
      + '<button type="button" class="btn btn-ghost btn-sm btn-square" data-action="sluit-taak" aria-label="Sluiten" title="Sluiten (Esc)">✕</button></div>'
      + '<div class="card-body p-4 gap-5">'
      + '<div><div class="text-xs flex items-center gap-1 mb-1 min-w-0">' + pad + '</div>'
      + '<textarea rows="1" class="pm-titelveld" data-change="taak-veld" data-veld="title" data-autogrow="1" maxlength="300">' + e(t.title) + '</textarea></div>'

      + '<div class="flex flex-col gap-2">'
      + veld('Verantwoordelijke', '<div class="flex items-center gap-2">' + PM.avatar(t.assignee_id, 6)
        + '<select class="select select-ghost select-sm flex-1 min-w-0" data-change="taak-veld" data-veld="assignee_id">' + opties(mensen, t.assignee_id, 'Niemand') + '</select>'
        + (t.assignee_id !== ik.id ? '<button type="button" class="btn btn-ghost btn-xs" data-action="aan-mij">Aan mij</button>' : '') + '</div>')
      + veld('Vervaldatum', '<input type="date" class="input input-ghost input-sm w-full ' + PM.datumKlasse(t) + '" value="' + e(t.due_date || '') + '" data-change="taak-veld" data-veld="due_date">')
      + veld('Prioriteit', '<select class="select select-ghost select-sm w-full" data-change="taak-veld" data-veld="priority">' + opties(S.boot.prioriteiten, t.priority) + '</select>')
      + (t.parent_id ? '' : veld('Project', '<select class="select select-ghost select-sm w-full" data-change="taak-veld" data-veld="project_id">' + opties(projecten, t.project_id, 'Geen project (losse to-do)') + '</select>'))
      + (t.parent_id || !t.project_id ? '' : veld('Sectie', '<select class="select select-ghost select-sm w-full" data-change="taak-veld" data-veld="section_id">' + opties(secties, t.section_id, 'Zonder sectie') + '</select>'))
      + veld('Mijlpaal', '<label class="label cursor-pointer justify-start gap-2 py-1"><input type="checkbox" class="toggle toggle-warning toggle-sm" data-change="taak-mijlpaal" ' + (t.is_milestone ? 'checked' : '') + '><span class="label-text text-sm">Een belangrijk moment in het project</span></label>')
      + veld('Labels', '<div class="flex flex-wrap items-center gap-1.5 py-1">'
        + (t.labels || []).map(function (l, i) { return '<span class="badge badge-ghost gap-1">' + e(l) + '<button type="button" data-action="label-weg" data-i="' + i + '" title="Weghalen"><i data-lucide="x" class="w-3 h-3"></i></button></span>'; }).join('')
        + '<input type="text" class="input input-ghost input-xs w-32" placeholder="+ label (Enter)" maxlength="30" data-label-invoer="1" list="pmLabelLijst"></div>')
      + veld('Odoo', t.odoo_model
        ? '<div class="flex items-center gap-2 py-1"><a href="' + e(PM.odooUrl(t)) + '" target="_blank" rel="noopener" class="link link-primary text-sm truncate inline-flex items-center gap-1.5"><i data-lucide="external-link" class="w-3.5 h-3.5"></i>' + e(t.odoo_name) + '</a>'
          + '<button type="button" class="btn btn-ghost btn-xs" data-action="odoo-los" title="Ontkoppelen"><i data-lucide="x" class="w-3.5 h-3.5"></i></button></div>'
        : '<button type="button" class="btn btn-ghost btn-sm justify-start" data-action="odoo-koppel"><i data-lucide="link" class="w-4 h-4"></i>Koppelen aan een lead, klant of offerte</button>')
      + '</div>'

      + '<div><h3 class="text-sm font-semibold mb-1">Beschrijving</h3>'
      + '<textarea class="textarea textarea-bordered w-full min-h-[6rem] text-sm leading-relaxed" data-change="taak-veld" data-veld="description" data-autogrow="1" placeholder="Wat moet er gebeuren, wat is afgesproken…">' + e(t.description) + '</textarea></div>'

      + (t.parent_id ? '' : '<div><h3 class="text-sm font-semibold mb-1 flex items-center gap-2">Subtaken'
        + (d.subtasks.length ? '<span class="opacity-50 font-normal">' + d.subtasks.filter(function (x) { return x.done; }).length + '/' + d.subtasks.length + '</span>' : '') + '</h3>'
        + '<div class="border border-base-content/10 rounded-lg"><div class="pm-lijnen">'
        + d.subtasks.map(function (x) { return PM.subtaakRij(x); }).join('')
        + '</div><div class="px-2 py-1 ' + (d.subtasks.length ? 'border-t border-base-content/10' : '') + '">'
        + '<input type="text" class="input input-ghost input-sm w-full" placeholder="+ Subtaak toevoegen (Enter)" maxlength="300" data-subtaak="1"></div></div></div>')

      + '<div><h3 class="text-sm font-semibold mb-1">Bijlagen</h3>'
      + d.attachments.map(bijlageHtml).join('')
      + '<div class="flex flex-wrap gap-1 mt-1">'
      + '<label class="btn btn-ghost btn-xs"><i data-lucide="upload" class="w-3.5 h-3.5"></i>Bestand opladen<input type="file" class="hidden" multiple data-change="bijlage-bestand"></label>'
      + '<button type="button" class="btn btn-ghost btn-xs" data-action="bijlage-asset"><i data-lucide="folder-open" class="w-3.5 h-3.5"></i>Uit Assetbeheer</button>'
      + '<button type="button" class="btn btn-ghost btn-xs" data-action="bijlage-link"><i data-lucide="link" class="w-3.5 h-3.5"></i>Link</button></div></div>'

      + '<div><h3 class="text-sm font-semibold mb-2 flex items-center gap-2">Volgers<span class="flex-1"></span>'
      + '<button type="button" class="btn btn-ghost btn-xs" data-action="volg"><i data-lucide="' + (volg ? 'bell-off' : 'bell') + '" class="w-3.5 h-3.5"></i>' + (volg ? 'Niet meer volgen' : 'Volgen') + '</button></h3>'
      + '<div class="flex flex-wrap items-center gap-1.5">'
      + (t.followers || []).map(function (id) { return PM.avatar(id, 7); }).join('')
      + '<select class="select select-ghost select-xs w-36" data-change="volger-erbij"><option value="">+ collega</option>'
      + S.boot.mensen.filter(function (m) { return (t.followers || []).indexOf(m.id) === -1; }).map(function (m) { return '<option value="' + e(m.id) + '">' + e(m.naam) + '</option>'; }).join('')
      + '</select></div><p class="text-xs opacity-50 mt-1">Volgers krijgen in een volgende stap een melding in Google Chat.</p></div>'

      + '<div><h3 class="text-sm font-semibold mb-2">Opmerkingen</h3><div class="flex flex-col gap-3 mb-3">'
      + (d.comments.length ? d.comments.map(opmerkingHtml).join('') : '<p class="text-sm opacity-50">Nog geen opmerkingen.</p>')
      + '</div><div class="relative">'
      + '<textarea id="pmOpmerking" class="textarea textarea-bordered w-full text-sm" rows="2" placeholder="Schrijf een opmerking. Typ @ om een collega te vermelden." data-input="opmerking-typ"></textarea>'
      + '<div id="pmVermeldLijst" class="hidden absolute z-20 left-0 bottom-full mb-1 w-64 max-h-56 overflow-y-auto bg-base-100 border border-base-content/10 rounded-lg shadow-lg"></div>'
      + '<div class="flex justify-end mt-1"><button type="button" class="btn btn-primary btn-sm" data-action="opmerking-plaats">Plaatsen</button></div></div></div>'

      + '<details class="border-t border-base-content/10 pt-3"><summary class="text-sm font-semibold cursor-pointer">Historiek</summary>'
      + '<ul class="flex flex-col gap-1 mt-2">' + d.history.map(historiekRegel).join('') + '</ul></details>'
      + '<p class="text-xs opacity-40">Gemaakt door ' + e((PM.persoon(t.created_by) || {}).naam || 'onbekend') + ' op ' + e(PM.tijdstip(t.created_at)) + '</p>'
      + '</div>';
    PM.$('pmTaak').innerHTML = html;
    toon(true);
    groeiAlle();
    PM.ikons();
    var lijst = PM.$('pmLabelLijst');
    if (lijst) lijst.innerHTML = alleLabels().map(function (l) { return '<option value="' + e(l) + '">'; }).join('');
  }

  function alleLabels() {
    var set = {};
    (S.project ? S.project.tasks : []).concat(S.mijn ? S.mijn.tasks : []).forEach(function (t) { (t.labels || []).forEach(function (l) { set[l] = 1; }); });
    return Object.keys(set).sort();
  }

  function groei(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  function groeiAlle() { document.querySelectorAll('#pmTaak [data-autogrow]').forEach(groei); }
  PM.bijInvoer('autogrow', groei);

  // ── Bewaren ───────────────────────────────────────────────────────────────

  async function bewaar(body, stil) {
    var id = S.taak.task.id;
    var ok = await PM.probeer(async function () {
      await PM.api('/tasks/' + id, { method: 'PUT', body: body });
      return true;
    });
    if (!ok) { await PM.herlaadTaak(); return; }
    if (!stil) PM.toast('Bewaard');
    await Promise.all([PM.herlaadTaak(), PM.herlaad()]);
  }

  PM.bijWijziging('taak-veld', function (el) {
    var body = {};
    var v = el.value;
    if (el.dataset.veld === 'title' && !v.trim()) { PM.toast('Een taak heeft een titel nodig.', 'error'); el.value = S.taak.task.title; return; }
    body[el.dataset.veld] = v === '' && el.dataset.veld !== 'description' ? null : v;
    if (el.dataset.veld === 'project_id') body.section_id = null;
    bewaar(body, el.dataset.veld === 'description' || el.dataset.veld === 'title');
  });
  PM.bijWijziging('taak-mijlpaal', function (el) { bewaar({ is_milestone: el.checked }, true); });
  PM.actie('aan-mij', function () { bewaar({ assignee_id: PM.ik().id }, true); });

  PM.labelErbij = function (el) {
    var l = el.value.trim();
    if (!l) return;
    var lijst = (S.taak.task.labels || []).slice();
    if (lijst.some(function (x) { return x.toLowerCase() === l.toLowerCase(); })) { el.value = ''; return; }
    lijst.push(l);
    bewaar({ labels: lijst }, true);
  };
  PM.actie('label-weg', function (el) {
    var lijst = (S.taak.task.labels || []).slice();
    lijst.splice(Number(el.dataset.i), 1);
    bewaar({ labels: lijst }, true);
  });

  PM.actie('volg', function () {
    var ik = PM.ik().id;
    var lijst = (S.taak.task.followers || []).slice();
    var i = lijst.indexOf(ik);
    if (i === -1) lijst.push(ik); else lijst.splice(i, 1);
    bewaar({ followers: lijst }, true);
  });
  PM.bijWijziging('volger-erbij', function (el) {
    if (!el.value) return;
    bewaar({ followers: (S.taak.task.followers || []).concat([el.value]) }, true);
  });

  PM.subtaakErbij = function (el) {
    var titel = el.value.trim();
    if (!titel) return;
    el.disabled = true;
    PM.probeer(async function () {
      await PM.api('/tasks', { method: 'POST', body: { title: titel, parent_id: S.taak.task.id } });
      await Promise.all([PM.herlaadTaak(), PM.herlaad()]);
      var nieuw = document.querySelector('[data-subtaak]');
      if (nieuw) nieuw.focus();
    }).finally(function () { el.disabled = false; });
  };

  PM.actie('sluit-taak', function () { PM.sluitTaak(); });
  PM.actie('taak-link', function () {
    var url = location.origin + '/projecten' + PM.adres(Object.assign({}, S.route, { taak: S.taak.task.id }));
    navigator.clipboard.writeText(url).then(function () { PM.toast('Link gekopieerd'); }, function () { PM.toast(url, 'warning'); });
  });
  PM.actie('taak-weg', async function () {
    var t = S.taak.task;
    var subs = S.taak.subtasks.length;
    var ok = await PM.bevestig('"' + t.title + '" verwijderen' + (subs ? ', samen met ' + subs + ' subta' + (subs === 1 ? 'ak' : 'ken') : '') + '? Dat kan je niet ongedaan maken.', 'Verwijderen');
    if (!ok) return;
    await PM.probeer(async function () {
      await PM.api('/tasks/' + t.id, { method: 'DELETE' });
      var ouder = S.taak.parent;
      S.taak = null;
      PM.toast('Verwijderd');
      if (ouder) PM.ga({ taak: ouder.id }); else PM.sluitTaak();
      await PM.herlaad();
    });
  });

  // ── Opmerkingen met @vermelding ───────────────────────────────────────────

  PM.bijInvoer('opmerking-typ', function (el) {
    var voor = el.value.slice(0, el.selectionStart);
    var m = /(?:^|\s)@([\p{L}-]*)$/u.exec(voor);
    var lijst = PM.$('pmVermeldLijst');
    if (!m) { lijst.classList.add('hidden'); return; }
    var q = m[1].toLowerCase();
    var treffers = S.boot.mensen.filter(function (p) { return p.naam.toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
    if (!treffers.length) { lijst.classList.add('hidden'); return; }
    lijst.innerHTML = treffers.map(function (p) {
      return '<button type="button" class="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-base-200 text-sm" data-action="vermeld" data-id="' + e(p.id) + '">'
        + PM.avatar(p.id, 6) + '<span class="truncate">' + e(p.naam) + '</span></button>';
    }).join('');
    lijst.classList.remove('hidden');
  });

  PM.actie('vermeld', function (el) {
    var p = PM.persoon(el.dataset.id);
    var veld = PM.$('pmOpmerking');
    var pos = veld.selectionStart;
    var voor = veld.value.slice(0, pos).replace(/@([\p{L}-]*)$/u, '@' + p.voornaam + ' ');
    veld.value = voor + veld.value.slice(pos);
    vermeld[p.id] = p.voornaam;
    PM.$('pmVermeldLijst').classList.add('hidden');
    veld.focus();
    veld.selectionStart = veld.selectionEnd = voor.length;
  });

  PM.plaatsOpmerking = async function () {
    var veld = PM.$('pmOpmerking');
    var tekst = veld.value.trim();
    if (!tekst) return;
    var ids = Object.keys(vermeld).filter(function (id) { return tekst.indexOf('@' + vermeld[id]) !== -1; });
    var ok = await PM.probeer(async function () {
      await PM.api('/tasks/' + S.taak.task.id + '/comments', { method: 'POST', body: { body: tekst, mentions: ids } });
      return true;
    });
    if (!ok) return;
    vermeld = {};
    await PM.herlaadTaak();
  };
  PM.actie('opmerking-plaats', function () { PM.plaatsOpmerking(); });
  PM.actie('opmerking-weg', async function (el) {
    if (!(await PM.bevestig('Deze opmerking weghalen?', 'Weghalen'))) return;
    await PM.probeer(async function () { await PM.api('/comments/' + el.dataset.id, { method: 'DELETE' }); await PM.herlaadTaak(); });
  });

  // ── Bijlagen ──────────────────────────────────────────────────────────────

  PM.bijWijziging('bijlage-bestand', async function (el) {
    var bestanden = Array.prototype.slice.call(el.files || []);
    for (var i = 0; i < bestanden.length; i++) {
      var b = bestanden[i];
      PM.toast('"' + b.name + '" opladen…', 'warning');
      await PM.probeer(function () { return PM.upload('/tasks/' + S.taak.task.id + '/attachments', b); });
    }
    await PM.herlaadTaak();
  });
  PM.actie('bijlage-link', async function () {
    var url = await PM.vraag('Link toevoegen', '', 'https://…');
    if (!url) return;
    await PM.probeer(async function () {
      await PM.api('/tasks/' + S.taak.task.id + '/attachments/link', { method: 'POST', body: { kind: 'link', url: url } });
      await PM.herlaadTaak();
    });
  });
  PM.actie('bijlage-weg', async function (el) {
    if (!(await PM.bevestig('Deze bijlage weghalen?', 'Weghalen'))) return;
    await PM.probeer(async function () { await PM.api('/attachments/' + el.dataset.id, { method: 'DELETE' }); await PM.herlaadTaak(); });
  });

  // Assetbeheer: bladeren door de mappen, een bestand kiezen.
  async function tekenAssets(prefix) {
    var host = PM.$('pmAssetsInhoud');
    host.innerHTML = '<p class="opacity-60 text-sm p-2">Laden…</p>';
    var d = await PM.probeer(function () { return PM.api('/assets?prefix=' + encodeURIComponent(prefix || '')); });
    if (!d) { host.innerHTML = ''; return; }
    var terug = prefix ? prefix.replace(/[^/]+\/$/, '') : null;
    var html = (prefix ? '<div class="text-xs opacity-60 px-2 pb-2 break-all">' + e(prefix) + '</div>' : '')
      + (terug !== null ? '<button type="button" class="pm-nav w-full" data-action="asset-map" data-prefix="' + e(terug === prefix ? '' : terug) + '"><i data-lucide="arrow-left" class="w-4 h-4"></i>Terug</button>' : '')
      + d.folders.map(function (f) { return '<button type="button" class="pm-nav w-full" data-action="asset-map" data-prefix="' + e(f.prefix) + '"><i data-lucide="folder" class="w-4 h-4"></i><span class="truncate">' + e(f.name) + '</span></button>'; }).join('')
      + d.files.map(function (f) { return '<button type="button" class="pm-nav w-full" data-action="asset-kies" data-key="' + e(f.key) + '"><i data-lucide="file" class="w-4 h-4"></i><span class="truncate flex-1 text-left">' + e(f.name) + '</span></button>'; }).join('')
      + (!d.folders.length && !d.files.length ? '<p class="opacity-60 text-sm p-2">Deze map is leeg.</p>' : '');
    host.innerHTML = html;
    PM.ikons();
  }
  PM.actie('bijlage-asset', function () { PM.$('pmAssets').showModal(); tekenAssets(''); });
  PM.actie('asset-map', function (el) { tekenAssets(el.dataset.prefix); });
  PM.actie('asset-kies', async function (el) {
    PM.$('pmAssets').close();
    await PM.probeer(async function () {
      await PM.api('/tasks/' + S.taak.task.id + '/attachments/link', { method: 'POST', body: { kind: 'asset', r2_key: el.dataset.key } });
      await PM.herlaadTaak();
    });
  });

  // ── Odoo ──────────────────────────────────────────────────────────────────

  var zoekTimer = null;
  PM.actie('odoo-koppel', function () {
    var sel = PM.$('pmOdooModel');
    sel.innerHTML = S.boot.odoo_modellen.map(function (m) { return '<option value="' + e(m.key) + '">' + e(m.label) + '</option>'; }).join('');
    PM.$('pmOdooZoek').value = '';
    PM.$('pmOdooResultaten').innerHTML = '<p class="text-sm opacity-60 p-2">Typ minstens twee letters.</p>';
    PM.$('pmOdoo').showModal();
    PM.$('pmOdooZoek').focus();
  });
  PM.odooZoek = function () {
    clearTimeout(zoekTimer);
    zoekTimer = setTimeout(async function () {
      var q = PM.$('pmOdooZoek').value.trim();
      var model = PM.$('pmOdooModel').value;
      var host = PM.$('pmOdooResultaten');
      if (q.length < 2) { host.innerHTML = '<p class="text-sm opacity-60 p-2">Typ minstens twee letters.</p>'; return; }
      host.innerHTML = '<p class="text-sm opacity-60 p-2">Zoeken in Odoo…</p>';
      var rijen = await PM.probeer(function () { return PM.api('/odoo/zoek?model=' + encodeURIComponent(model) + '&q=' + encodeURIComponent(q)); });
      if (!rijen) { host.innerHTML = ''; return; }
      host.innerHTML = rijen.length ? rijen.map(function (r) {
        return '<button type="button" class="pm-nav w-full text-left" data-action="odoo-kies" data-id="' + r.id + '" data-naam="' + e(r.name) + '">'
          + '<span class="flex-1 min-w-0"><span class="block truncate">' + e(r.name) + '</span>' + (r.sub ? '<span class="block text-xs opacity-60 truncate">' + e(r.sub) + '</span>' : '') + '</span></button>';
      }).join('') : '<p class="text-sm opacity-60 p-2">Niets gevonden voor "' + e(q) + '".</p>';
    }, 300);
  };
  PM.bijInvoer('odoo-zoek', PM.odooZoek);
  PM.bijWijziging('odoo-model', PM.odooZoek);
  PM.actie('odoo-kies', function (el) {
    PM.$('pmOdoo').close();
    bewaar({ odoo_model: PM.$('pmOdooModel').value, odoo_id: Number(el.dataset.id), odoo_name: el.dataset.naam }, true);
  });
  PM.actie('odoo-los', function () { bewaar({ odoo_model: null }, true); });
})();
