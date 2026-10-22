/* Regio's -- zijbalk, klikken op de kaart, vensters, opstarten. */
(function () {
  var RG = window.RG;
  var S = RG.state;
  var e = RG.esc;
  var $ = RG.$;

  // ── Zijbalk ────────────────────────────────────────────────────────────
  RG.tekenCoaches = function () {
    var lijst = $('rgCoaches');
    if (!S.syndicoaches.length) {
      lijst.innerHTML = '<div class="flex flex-col items-center text-center p-6 text-base-content/50 gap-2">' +
        '<i data-lucide="users" class="w-8 h-8"></i><p class="text-sm">Nog geen syndicoaches. Voeg er hierboven een toe, of importeer een lijst.</p></div>';
      RG.iconen();
      tekenActief();
      return;
    }
    lijst.innerHTML = S.syndicoaches.map(function (s) {
      var pcs = RG.postcodesVanCoach(s.id);
      var actief = S.actief === s.id;
      var html = '<div class="rg-kaart-coach rounded-lg border border-base-content/10 overflow-hidden ' + (actief ? 'rg-actief bg-base-200' : 'hover:bg-base-200/60') + '" style="color:' + e(s.kleur) + '">' +
        '<div class="p-2.5 flex items-center gap-2">' +
          '<button class="flex items-center gap-2 flex-1 min-w-0 text-left" data-action="kies-coach" data-id="' + e(s.id) + '" title="Kies als actieve syndicoach">' +
            '<span class="rg-bol" style="background:' + e(s.kleur) + '"></span>' +
            '<span class="truncate text-base-content font-medium text-sm">' + e(s.naam) + '</span>' +
            '<span class="badge badge-sm badge-ghost ml-1">' + pcs.length + '</span>' +
          '</button>' +
          '<button class="btn btn-xs btn-ghost text-base-content/60" data-action="coach-instellen" data-id="' + e(s.id) + '" title="Instellen"><i data-lucide="settings-2" class="w-3.5 h-3.5"></i></button>' +
        '</div>';
      if (actief) {
        html += '<div class="border-t border-base-content/10 bg-base-100 p-2.5">' +
          '<div class="flex items-center justify-between mb-1.5">' +
            '<span class="text-xs text-base-content/50">' + pcs.length + ' postcode(s)</span>' +
            '<button class="btn btn-xs btn-ghost gap-1" data-action="export-coach" data-id="' + e(s.id) + '"><i data-lucide="download" class="w-3.5 h-3.5"></i> CSV</button>' +
          '</div>';
        if (!pcs.length) {
          html += '<p class="text-sm text-base-content/40 italic">Nog geen postcodes. Klik gemeentes aan op de kaart.</p>';
        } else {
          html += '<ul class="text-sm space-y-0.5 max-h-56 overflow-y-auto">' + pcs.map(function (pc) {
            return '<li class="flex items-center justify-between gap-2">' +
              '<span class="font-mono text-base-content">' + pc + '</span>' +
              '<span class="text-base-content/50 truncate flex-1 mx-1">' + e(RG.plaatsVan(pc)) + '</span>' +
              '<button class="btn btn-xs btn-ghost text-error opacity-60 hover:opacity-100 px-1" data-action="geef-vrij" data-pc="' + pc + '" title="Postcode vrijgeven"><i data-lucide="x" class="w-3 h-3 pointer-events-none"></i></button>' +
            '</li>';
          }).join('') + '</ul>';
        }
        html += '</div>';
      }
      return html + '</div>';
    }).join('');
    RG.iconen();
    tekenActief();
  };

  function tekenActief() {
    var balk = $('rgActief');
    var s = RG.coach(S.actief);
    balk.classList.toggle('hidden', !s);
    balk.classList.toggle('flex', !!s);
    if (s) { $('rgActiefNaam').textContent = s.naam; $('rgActiefNaam').style.color = s.kleur; }
  }

  function zetActief(id) {
    S.actief = id || null;
    RG.teken();
  }

  // ── Syndicoaches toevoegen en instellen ────────────────────────────────
  async function voegToe() {
    var naam = $('rgNieuwNaam').value.trim();
    if (!naam) { RG.toast('Geef eerst een naam op.', 'warn'); $('rgNieuwNaam').focus(); return; }
    var kleur = $('rgNieuwKleur').value;
    try {
      var nieuw = await RG.schrijf(function () { return RG.api('/syndicoaches', { method: 'POST', body: { naam: naam, kleur: kleur } }); }, 'Toevoegen mislukt');
      S.syndicoaches.push(nieuw);
      $('rgNieuwNaam').value = '';
      $('rgNieuwKleur').value = RG.volgendeKleur();
      RG.teken();
      RG.toast("Syndicoach '" + naam + "' toegevoegd.");
    } catch (x) { /* gemeld */ }
  }

  var instellenId = null;
  function openInstellen(id) {
    var s = RG.coach(id);
    if (!s) return;
    instellenId = id;
    $('dlgCoachNaam').value = s.naam;
    $('dlgCoachKleur').value = s.kleur;
    $('dlgCoach').showModal();
  }

  async function bewaarInstellen() {
    var s = RG.coach(instellenId);
    if (!s) return;
    var body = {
      naam: $('dlgCoachNaam').value.trim(),
      kleur: $('dlgCoachKleur').value,
    };
    try {
      var bijgewerkt = await RG.schrijf(function () { return RG.api('/syndicoaches/' + encodeURIComponent(s.id), { method: 'PUT', body: body }); }, 'Bewaren mislukt');
      Object.assign(s, bijgewerkt);
      $('dlgCoach').close();
      RG.teken();
    } catch (x) { /* gemeld */ }
  }

  var bevestigActie = null;
  function bevestig(titel, tekst, knop, actie) {
    $('dlgBevestigTitel').textContent = titel;
    $('dlgBevestigTekst').innerHTML = tekst;
    $('dlgBevestigKnop').textContent = knop;
    bevestigActie = actie;
    $('dlgBevestig').showModal();
  }

  function vraagVerwijderen() {
    var s = RG.coach(instellenId);
    if (!s) return;
    $('dlgCoach').close();
    var n = RG.postcodesVanCoach(s.id).length;
    bevestig('Syndicoach verwijderen?',
      'Je verwijdert <strong>' + e(s.naam) + '</strong>. Zijn ' + n + ' postcode(s) worden terug vrij. Dit kan niet ongedaan gemaakt worden.',
      'Ja, verwijderen',
      async function () {
        try {
          await RG.schrijf(function () { return RG.api('/syndicoaches/' + encodeURIComponent(s.id), { method: 'DELETE' }); }, 'Verwijderen mislukt');
          S.syndicoaches = S.syndicoaches.filter(function (x) { return x.id !== s.id; });
          Object.keys(S.toewijzingen).forEach(function (pc) { if (S.toewijzingen[pc] === s.id) delete S.toewijzingen[pc]; });
          if (S.actief === s.id) S.actief = null;
          RG.teken();
          RG.toast("'" + s.naam + "' verwijderd, de postcodes zijn terug vrij.");
        } catch (x) { /* gemeld */ }
      });
  }

  // ── Klikken op de kaart ────────────────────────────────────────────────
  var gekozenGemeente = null; // feature van het open venster

  RG.opGemeenteKlik = function (d) {
    var nis = d.properties.nis;
    var pcs = RG.postcodesVan(nis);
    if (!pcs.length) { openExtra(d); return; }
    if (S.actief) { wijsGemeenteToe(d, pcs, S.actief); return; }
    var eigenaars = RG.eigenaarsVan(nis);
    if (!eigenaars.length) {
      openKies(d, function (id) { zetActief(id); wijsGemeenteToe(d, pcs, id); });
      return;
    }
    if (eigenaars.length === 1 && RG.helemaalVan(pcs, eigenaars[0])) { zetActief(eigenaars[0]); return; }
    openPostcodes(d);
  };

  function naamVan(d) { return d.properties.nl || d.properties.fr || 'deze gemeente'; }

  function wijsGemeenteToe(d, pcs, id) {
    var naam = naamVan(d);
    if (pcs.length === 1) {
      // nog eens klikken op je eigen postcode geeft ze vrij
      RG.wijsToe(pcs, S.toewijzingen[pcs[0]] === id ? null : id, naam).catch(function () {});
      return;
    }
    if (S.gedetailleerd) { openPostcodes(d); return; }
    if (RG.helemaalVan(pcs, id)) { RG.wijsToe(pcs, null, naam).catch(function () {}); return; }
    var vanAnderen = pcs.filter(function (pc) { return S.toewijzingen[pc] && S.toewijzingen[pc] !== id; });
    if (vanAnderen.length) { openOvernemen(d, pcs, id, vanAnderen); return; }
    RG.wijsToe(pcs, id, naam).catch(function () {});
  }

  var overnemen = null;
  function openOvernemen(d, pcs, id, vanAnderen) {
    var doel = RG.coach(id);
    var perEigenaar = {};
    vanAnderen.forEach(function (pc) { (perEigenaar[S.toewijzingen[pc]] = perEigenaar[S.toewijzingen[pc]] || []).push(pc); });
    $('dlgOvernemenTekst').innerHTML = '<strong>' + e(naamVan(d)) + '</strong> heeft ' + vanAnderen.length +
      ' postcode(s) die nu bij een andere syndicoach horen. Ga je verder, dan gaan ze naar <strong style="color:' + e(doel ? doel.kleur : '') + '">' + e(doel ? doel.naam : '-') + '</strong>:';
    $('dlgOvernemenLijst').innerHTML = Object.keys(perEigenaar).map(function (oid) {
      var o = RG.coach(oid);
      return '<li><strong>' + e(o ? o.naam : 'onbekend') + '</strong>: ' + perEigenaar[oid].sort().join(', ') + '</li>';
    }).join('');
    overnemen = { pcs: pcs, id: id, naam: naamVan(d) };
    $('dlgOvernemen').showModal();
  }

  function openKies(d, opKeuze) {
    if (!S.syndicoaches.length) { RG.toast('Voeg eerst links een syndicoach toe.', 'warn'); return; }
    $('dlgKiesTitel').textContent = naamVan(d);
    $('dlgKiesLijst').innerHTML = S.syndicoaches.map(function (s) {
      return '<button class="btn btn-sm justify-start gap-2 w-full" data-action="kies-in-venster" data-id="' + e(s.id) + '">' +
        '<span class="rg-bol" style="background:' + e(s.kleur) + '"></span><span class="truncate">' + e(s.naam) + '</span></button>';
    }).join('');
    kiesCallback = opKeuze;
    $('dlgKies').showModal();
  }
  var kiesCallback = null;

  function openPostcodes(d) {
    gekozenGemeente = d;
    var pcs = RG.postcodesVan(d.properties.nis).slice().sort();
    var actief = RG.coach(S.actief);
    $('dlgPostcodesTitel').textContent = naamVan(d);
    $('dlgPostcodesUitleg').innerHTML = actief
      ? 'Wijs de postcodes toe aan <strong style="color:' + e(actief.kleur) + '">' + e(actief.naam) + '</strong>, of geef ze vrij.'
      : 'Kies links eerst een syndicoach om postcodes toe te wijzen. Vrijgeven kan altijd.';
    $('dlgPostcodesAlles').disabled = !actief;
    $('dlgPostcodesLijst').innerHTML = pcs.map(function (pc) {
      var o = RG.coach(S.toewijzingen[pc]);
      return '<div class="flex items-center gap-2 rounded-md border border-base-content/10 px-2.5 py-1.5">' +
        '<span class="font-mono text-sm w-12 shrink-0">' + pc + '</span>' +
        '<span class="text-sm truncate w-28 shrink-0">' + e(S.deelgemeente[pc] || naamVan(d)) + '</span>' +
        '<span class="rg-bol" style="background:' + (o ? e(o.kleur) : 'transparent') + ';border-style:' + (o ? 'solid' : 'dashed') + '"></span>' +
        '<span class="text-xs text-base-content/60 flex-1 truncate">' + (o ? e(o.naam) : 'Nog niet toegewezen') + '</span>' +
        (actief ? '<button class="btn btn-xs btn-primary" data-action="pc-een" data-pc="' + pc + '">Toewijzen</button>' : '') +
        (o ? '<button class="btn btn-xs btn-ghost text-error" data-action="pc-vrij" data-pc="' + pc + '" title="Vrijgeven"><i data-lucide="x" class="w-3.5 h-3.5 pointer-events-none"></i></button>' : '') +
      '</div>';
    }).join('') +
      '<button class="btn btn-xs btn-ghost gap-1 mt-1" data-action="pc-extra"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Ontbrekende postcode toevoegen</button>';
    RG.iconen();
    if (!$('dlgPostcodes').open) $('dlgPostcodes').showModal();
  }

  var extraGemeente = null;
  function openExtra(d) {
    extraGemeente = d;
    $('dlgExtraGemeente').textContent = naamVan(d);
    $('dlgExtraInvoer').value = '';
    $('dlgExtraFout').classList.add('hidden');
    $('dlgExtra').showModal();
    setTimeout(function () { $('dlgExtraInvoer').focus(); }, 50);
  }

  async function bewaarExtra() {
    var d = extraGemeente;
    if (!d) return;
    var nis = d.properties.nis;
    var pc = $('dlgExtraInvoer').value.trim();
    var fout = $('dlgExtraFout');
    function toonFout(t) { fout.textContent = t; fout.classList.remove('hidden'); }
    if (!/^[1-9][0-9]{3}$/.test(pc)) { toonFout('Geef een geldige postcode van vier cijfers op (bv. 2000).'); return; }
    var bestaand = S.postcodeNaarNis[pc];
    if (bestaand && bestaand !== nis) { toonFout('Postcode ' + pc + ' hoort al bij ' + (RG.gemeenteNaam(bestaand) || bestaand) + '.'); return; }
    try {
      await RG.schrijf(function () { return RG.api('/extra-postcodes', { method: 'POST', body: { postcode: pc, nis: nis } }); }, 'Toevoegen mislukt');
    } catch (x) { return; }
    (S.extra[nis] = S.extra[nis] || []).indexOf(pc) === -1 && S.extra[nis].push(pc);
    RG.voegExtraSamen();
    $('dlgExtra').close();
    RG.toast('Postcode ' + pc + ' toegevoegd aan ' + naamVan(d) + '.');
    if (S.actief && RG.postcodesVan(nis).length === 1) RG.wijsToe([pc], S.actief, naamVan(d)).catch(function () {});
    else RG.teken();
    if ($('dlgPostcodes').open && gekozenGemeente === d) openPostcodes(d);
  }

  // ── Exporteren ─────────────────────────────────────────────────────────
  function regel(pc, metCoach) {
    var nis = S.postcodeNaarNis[pc];
    var g = (nis && S.gemeente[nis]) || {};
    var velden = [pc, S.deelgemeente[pc] || g.naam || '', g.naam || '', g.provincie || '', g.gewest || ''];
    if (metCoach) { var s = RG.coach(S.toewijzingen[pc]); velden.push(s ? s.naam : ''); }
    return velden.join(';');
  }

  function exportCoach(id) {
    var s = RG.coach(id);
    if (!s) return;
    var rijen = ['postcode;deelgemeente;gemeente;provincie;gewest'].concat(RG.postcodesVanCoach(id).map(function (pc) { return regel(pc, false); }));
    RG.download('postcodes-' + s.naam.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv', rijen.join('\n'));
  }

  function exportAlles() {
    var pcs = Object.keys(Object.assign({}, S.postcodeNaarNis, S.toewijzingen)).sort();
    var rijen = ['postcode;deelgemeente;gemeente;provincie;gewest;syndicoach'].concat(pcs.map(function (pc) { return regel(pc, true); }));
    RG.download('regios-overzicht.csv', rijen.join('\n'));
  }

  // ── Logboek ────────────────────────────────────────────────────────────
  async function openLogboek() {
    var lijst = $('dlgLogboekLijst');
    lijst.innerHTML = '<div class="py-4 text-center text-base-content/50"><span class="loading loading-spinner loading-sm"></span></div>';
    $('dlgLogboek').showModal();
    try {
      var rijen = await RG.api('/wijzigingen');
      lijst.innerHTML = rijen.length ? rijen.map(function (r) {
        var t = new Date(r.created_at);
        return '<div class="py-2 flex gap-3">' +
          '<span class="text-xs text-base-content/50 w-32 shrink-0">' + e(t.toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })) + '</span>' +
          '<span class="flex-1">' + e(r.tekst) + '</span>' +
          '<span class="text-xs text-base-content/50 shrink-0">' + e(r.user_naam) + '</span></div>';
      }).join('') : '<p class="py-4 text-base-content/50">Nog niets veranderd.</p>';
    } catch (err) {
      lijst.innerHTML = '<div class="alert alert-error text-sm">Het logboek kon niet geladen worden: ' + e(err.message) + '</div>';
    }
  }

  // ── Zoeken ─────────────────────────────────────────────────────────────
  var zoekResultaten = [];
  function tekenZoek() {
    var vak = $('rgZoekResultaten');
    zoekResultaten = RG.zoek($('rgZoek').value);
    if (!zoekResultaten.length) { vak.classList.add('hidden'); vak.innerHTML = ''; return; }
    vak.innerHTML = zoekResultaten.map(function (m, i) {
      var hoofd = m.pc ? m.sub + ' -- ' + m.pc : m.gemeente;
      var n = RG.postcodesVan(m.nis).length;
      var bij = m.pc ? m.gemeente : n + (n === 1 ? ' postcode' : ' postcodes');
      return '<button type="button" class="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2" data-action="zoek-kies" data-idx="' + i + '">' +
        '<span class="font-medium text-sm truncate">' + e(hoofd) + '</span>' +
        '<span class="text-xs text-base-content/50 truncate shrink-0 ml-2">' + e(bij) + '</span></button>';
    }).join('');
    vak.classList.remove('hidden');
  }
  function kiesZoek(m) {
    if (!m) return;
    $('rgZoek').value = m.pc ? m.sub + ' -- ' + m.pc : m.gemeente;
    $('rgZoekResultaten').classList.add('hidden');
    $('rgZoek').blur();
    RG.markeer(m.nis);
  }

  // ── Eén luisteraar voor alle klikken ───────────────────────────────────
  document.addEventListener('click', function (ev) {
    if (!$('rgZoekResultaten').contains(ev.target) && ev.target !== $('rgZoek')) $('rgZoekResultaten').classList.add('hidden');
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    var id = el.dataset.id;
    var pc = el.dataset.pc;
    if (a === 'voeg-toe') voegToe();
    else if (a === 'kies-coach') zetActief(S.actief === id ? null : id);
    else if (a === 'coach-instellen') openInstellen(id);
    else if (a === 'coach-bewaar') bewaarInstellen();
    else if (a === 'coach-weg') vraagVerwijderen();
    else if (a === 'bevestig-ja') { $('dlgBevestig').close(); if (bevestigActie) bevestigActie(); bevestigActie = null; }
    else if (a === 'stop-actief') zetActief(null);
    else if (a === 'geef-vrij') RG.wijsToe([pc], null, pc).catch(function () {});
    else if (a === 'export-coach') exportCoach(id);
    else if (a === 'export-alles') exportAlles();
    else if (a === 'open-logboek') openLogboek();
    else if (a === 'open-import') RG.openImport();
    else if (a === 'import-voorbeeld') RG.importVoorbeeld();
    else if (a === 'import-doe') RG.importDoe();
    else if (a === 'import-overname') RG.importOvername(bevestig);
    else if (a === 'zoom-in') RG.zoomIn();
    else if (a === 'zoom-uit') RG.zoomUit();
    else if (a === 'zoom-reset') RG.zoomReset();
    else if (a === 'zoek-kies') kiesZoek(zoekResultaten[Number(el.dataset.idx)]);
    else if (a === 'kies-in-venster') { $('dlgKies').close(); if (kiesCallback) kiesCallback(id); kiesCallback = null; }
    else if (a === 'overnemen-ja') {
      $('dlgOvernemen').close();
      if (overnemen) RG.wijsToe(overnemen.pcs, overnemen.id, overnemen.naam).catch(function () {});
      overnemen = null;
    }
    else if (a === 'pc-een' || a === 'pc-vrij' || a === 'pc-alles') {
      var d = gekozenGemeente;
      if (!d) return;
      var lijst = a === 'pc-alles' ? RG.postcodesVan(d.properties.nis).slice() : [pc];
      RG.wijsToe(lijst, a === 'pc-vrij' ? null : S.actief, naamVan(d) + (a === 'pc-alles' ? '' : ' (' + pc + ')'))
        .catch(function () {}).then(function () { if ($('dlgPostcodes').open) openPostcodes(d); });
      openPostcodes(d);
    }
    else if (a === 'pc-extra') { var g = gekozenGemeente; if (g) openExtra(g); }
    else if (a === 'extra-bewaar') bewaarExtra();
  });

  document.addEventListener('change', function (ev) {
    var c = ev.target.dataset && ev.target.dataset.change;
    if (c === 'gedetailleerd') S.gedetailleerd = ev.target.checked;
    else if (c === 'import-bestand') RG.importBestand(ev.target);
    else if (c === 'import-modus') RG.importReset();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
    var t = ev.target;
    if (t.id === 'rgNieuwNaam' && ev.key === 'Enter') voegToe();
    else if (t.id === 'dlgExtraInvoer' && ev.key === 'Enter') { ev.preventDefault(); bewaarExtra(); }
    else if (t.id === 'dlgCoachNaam' && ev.key === 'Enter') { ev.preventDefault(); bewaarInstellen(); }
    else if (t.id === 'rgZoek') {
      if (ev.key === 'Enter') kiesZoek(RG.zoek(t.value)[0]);
      else { $('rgZoekResultaten').classList.add('hidden'); t.blur(); }
    }
  });

  var zoekTimer;
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'rgZoek') { clearTimeout(zoekTimer); zoekTimer = setTimeout(tekenZoek, 120); }
    else if (ev.target.id === 'dlgImportTekst') RG.importReset();
  });
  $('rgZoek').addEventListener('focus', function () { if ($('rgZoek').value.trim()) tekenZoek(); });

  // ── Verversen: zie wat collega's intussen deden ────────────────────────
  setInterval(function () {
    if (document.visibilityState !== 'visible' || S.bezig || document.querySelector('dialog[open]')) return;
    RG.laad(false).catch(function () { /* volgende keer */ });
  }, 30000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !S.bezig) RG.laad(false).catch(function () {});
  });

  // ── Opstarten ──────────────────────────────────────────────────────────
  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (me.navbarHtml && window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
    } catch (x) { /* de navbar is niet essentieel */ }
    RG.iconen();
    $('rgNieuwKleur').value = RG.PALET[0];
    try {
      var stand = await RG.laad(true);
      $('rgNieuwKleur').value = RG.volgendeKleur();
      if (stand.net_overgenomen) {
        $('rgMelding').innerHTML = '<div class="alert alert-info text-sm mb-4"><i data-lucide="info" class="w-4 h-4"></i>' +
          '<span>De gegevens van de mini-app Regio\'s zijn overgenomen: ' + stand.syndicoaches.length + ' syndicoaches en ' +
          Object.keys(stand.toewijzingen).length + ' postcodes. Vanaf nu werk je hier.</span></div>';
        RG.iconen();
      }
    } catch (err) {
      $('rgMelding').innerHTML = '<div class="alert alert-error text-sm mb-4">De regio\'s konden niet geladen worden: ' + e(err.message) + '. Herlaad de pagina.</div>';
    }
    try { await RG.laadKaart(); } catch (err) {
      $('rgLaden').innerHTML = '<span class="text-error">De kaart kon niet geladen worden: ' + e(err.message) + '</span>';
    }
  }

  init();
})();
