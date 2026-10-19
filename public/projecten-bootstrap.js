/**
 * Projecten -- de centrale luisteraars (klik, wijziging, invoer, toetsen),
 * de kleine vensters (vraag, bevestig, project) en het opstarten.
 */

(function () {
  'use strict';

  var PM = window.PM;
  var S = PM.state;
  var e = PM.esc;

  // ── Vensters ──────────────────────────────────────────────────────────────

  /** Vraagt één regel tekst. Geeft de tekst terug, of null bij Annuleren. */
  PM.vraag = function (titel, waarde, hint) {
    return new Promise(function (klaar) {
      var dlg = PM.$('pmVraag');
      PM.$('pmVraagTitel').textContent = titel;
      var veld = PM.$('pmVraagVeld');
      veld.value = waarde || '';
      veld.placeholder = hint || '';
      dlg.returnValue = '';
      dlg.onclose = function () { klaar(dlg.returnValue === 'ok' ? veld.value.trim() || null : null); };
      dlg.showModal();
      veld.focus();
      veld.select();
    });
  };

  PM.bevestig = function (tekst, knop) {
    return new Promise(function (klaar) {
      var dlg = PM.$('pmBevestig');
      PM.$('pmBevestigTekst').textContent = tekst;
      PM.$('pmBevestigKnop').textContent = knop || 'OK';
      dlg.returnValue = '';
      dlg.onclose = function () { klaar(dlg.returnValue === 'ok'); };
      dlg.showModal();
    });
  };

  var ICONEN = ['folder-kanban', 'rocket', 'megaphone', 'globe', 'calendar-days', 'mail', 'users', 'wallet', 'wrench', 'graduation-cap', 'lightbulb', 'target', 'building-2', 'chart-line', 'shield-check', 'sparkles'];
  var projectKeuze = { kleur: 'sky', icoon: 'folder-kanban', id: null };

  function tekenProjectKeuzes() {
    PM.$('pmProjectKleuren').innerHTML = S.boot.kleuren.map(function (k) {
      return '<button type="button" class="w-7 h-7 rounded-full border-2 ' + (k.key === projectKeuze.kleur ? 'border-base-content' : 'border-transparent') + '" style="background:' + k.hex + '" data-action="project-kleur" data-key="' + k.key + '" title="' + k.key + '"></button>';
    }).join('');
    PM.$('pmProjectIconen').innerHTML = ICONEN.map(function (n) {
      return '<button type="button" class="btn btn-sm btn-square ' + (n === projectKeuze.icoon ? 'btn-primary' : 'btn-ghost') + '" data-action="project-icoon" data-key="' + n + '"><i data-lucide="' + n + '" class="w-4 h-4"></i></button>';
    }).join('');
    PM.ikons();
  }

  function openProjectVenster(p) {
    projectKeuze = { kleur: p ? p.color : 'sky', icoon: p ? p.icon : 'folder-kanban', id: p ? p.id : null };
    PM.$('pmProjectTitel').textContent = p ? 'Project instellen' : 'Nieuw project';
    PM.$('pmProjectNaam').value = p ? p.name : '';
    PM.$('pmProjectOmschrijving').value = p ? p.description : '';
    PM.$('pmProjectOmschrijvingWrap').classList.toggle('hidden', !!p);
    PM.$('pmProjectBeheer').classList.toggle('hidden', !p);
    if (p) {
      PM.$('pmProjectArchief').textContent = p.archived ? 'Uit het archief halen' : 'Archiveren';
      var mag = PM.ik().is_admin || p.owner_id === PM.ik().id;
      PM.$('pmProjectWeg').classList.toggle('hidden', !mag);
    }
    tekenProjectKeuzes();
    PM.$('pmProject').showModal();
    PM.$('pmProjectNaam').focus();
  }

  PM.actie('nieuw-project', function () { openProjectVenster(null); });
  PM.actie('project-instellingen', function () { openProjectVenster(S.project.project); });
  PM.actie('project-kleur', function (el) { projectKeuze.kleur = el.dataset.key; tekenProjectKeuzes(); });
  PM.actie('project-icoon', function (el) { projectKeuze.icoon = el.dataset.key; tekenProjectKeuzes(); });

  PM.actie('project-bewaar', async function () {
    var naam = PM.$('pmProjectNaam').value.trim();
    if (!naam) { PM.toast('Geef het project een naam.', 'error'); return; }
    var body = { name: naam, color: projectKeuze.kleur, icon: projectKeuze.icoon };
    var nieuw = !projectKeuze.id;
    if (nieuw) body.description = PM.$('pmProjectOmschrijving').value;
    var p = await PM.probeer(function () {
      return nieuw ? PM.api('/projects', { method: 'POST', body: body }) : PM.api('/projects/' + projectKeuze.id, { method: 'PUT', body: body });
    });
    if (!p) return;
    PM.$('pmProject').close();
    await PM.laadProjecten();
    if (nieuw) PM.ga({ soort: 'project', id: p.id, weergave: 'lijst', taak: null });
    else await PM.herlaad();
  });

  PM.actie('project-archief', async function () {
    var p = S.project.project;
    await PM.probeer(async function () {
      await PM.api('/projects/' + p.id, { method: 'PUT', body: { archived: !p.archived } });
      PM.$('pmProject').close();
      PM.toast(p.archived ? 'Terug uit het archief' : 'Gearchiveerd');
      await PM.herlaad();
    });
  });

  PM.actie('project-weg', async function () {
    var p = S.project.project;
    PM.$('pmProject').close();
    var ok = await PM.bevestig('Project "' + p.name + '" verwijderen, met al zijn taken, opmerkingen en bijlagen? Dat kan je niet ongedaan maken. Archiveren kan wel teruggedraaid worden.', 'Definitief verwijderen');
    if (!ok) return;
    await PM.probeer(async function () {
      await PM.api('/projects/' + p.id, { method: 'DELETE' });
      PM.toast('Project verwijderd');
      await PM.laadProjecten();
      PM.ga({ soort: 'mijn', id: null, weergave: 'lijst', taak: null });
    });
  });

  // ── Centrale luisteraars ──────────────────────────────────────────────────

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) {
      if (!ev.target.closest('#pmVermeldLijst, #pmOpmerking')) {
        var lijst = PM.$('pmVermeldLijst');
        if (lijst) lijst.classList.add('hidden');
      }
      return;
    }
    var fn = PM.acties[el.dataset.action];
    if (!fn) return;
    if (el.tagName !== 'A') ev.preventDefault();
    fn(el, ev);
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    var fn = el.dataset && PM.wijzigingen[el.dataset.change];
    if (fn) fn(el, ev);
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el.dataset) return;
    if (el.dataset.autogrow) PM.invoer.autogrow(el);
    var fn = PM.invoer[el.dataset.input];
    if (fn) fn(el, ev);
  });

  document.addEventListener('keydown', function (ev) {
    var el = ev.target;
    if (ev.key === 'Enter' && !ev.shiftKey && el.dataset) {
      if (el.dataset.snelTaak) { ev.preventDefault(); PM.snelTaak(el); return; }
      if (el.dataset.subtaak) { ev.preventDefault(); PM.subtaakErbij(el); return; }
      if (el.dataset.labelInvoer) { ev.preventDefault(); PM.labelErbij(el); return; }
      if (el.id === 'pmVraagVeld') { ev.preventDefault(); PM.$('pmVraag').close('ok'); return; }
      // Een titel is één regel: Enter bewaart.
      if (el.dataset.veld === 'title') { ev.preventDefault(); el.blur(); return; }
    }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && el.id === 'pmOpmerking') { ev.preventDefault(); PM.plaatsOpmerking(); return; }
    if (ev.key === 'Escape' && S.taak && !document.querySelector('dialog[open]')) { PM.sluitTaak(); }
  });

  // ── Navigatie ─────────────────────────────────────────────────────────────

  PM.volgAdres = async function () {
    var vorige = S.route;
    var r = PM.leesAdres();
    S.route = r;
    var anderScherm = r.soort !== vorige.soort || r.id !== vorige.id;
    if (anderScherm) {
      if (r.soort === 'project') {
        S.project = null;
        PM.teken();
        var d = await PM.probeer(function () { return PM.api('/projects/' + r.id); });
        if (!d) { PM.ga({ soort: 'mijn', id: null, weergave: 'lijst', taak: null }); return; }
        S.project = d;
      } else if (!S.mijn || anderScherm) {
        S.mijn = await PM.probeer(function () { return PM.api('/my-tasks'); }) || { tasks: [], parents: [] };
      }
    }
    PM.teken();
    if (r.taak) PM.openTaak(r.taak);
    else if (S.taak) { S.taak = null; PM.$('pmTaakWrap').classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }
  };

  window.addEventListener('hashchange', PM.volgAdres);

  // ── Opstarten ─────────────────────────────────────────────────────────────

  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (me.navbarHtml && window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
    } catch (x) { /* de navbar is niet essentieel */ }
    try {
      S.boot = await PM.api('/bootstrap');
      await PM.laadProjecten();
    } catch (err) {
      PM.$('pmHoofd').innerHTML = '<div class="alert alert-error">De projecten konden niet geladen worden: ' + e(err.message) + '. Herlaad de pagina.</div>';
      return;
    }
    S.route = { soort: null };
    await PM.volgAdres();
  }

  init();
})();
