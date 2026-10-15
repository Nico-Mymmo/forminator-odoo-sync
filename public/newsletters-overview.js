/**
 * Nieuwsbrieven -- het overzicht: mijn opdrachten, de reeksen met hun
 * edities, en de voorraad met ideeën. Een idee is enkel een titel en
 * steekwoorden (het venster); het echte schrijven gebeurt in de brief.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  function opdrachtKaart(m) {
    var deadline = m.edition ? m.edition.deadline_at : null;
    var dringend = deadline && NB.teller(deadline).d < 3;
    return '<a href="#/stukje/' + e(m.id) + '" class="card bg-base-100 border border-base-content/10 hover:border-primary/40 transition-colors">'
      + '<div class="card-body p-4 gap-1">'
      + '<div class="flex items-center justify-between gap-2"><span class="font-semibold">' + e(NB.blokNaam(m)) + '</span>' + NB.statusBadge(m.status) + '</div>'
      + '<div class="text-sm opacity-70">' + e(m.series_name) + (m.edition ? ' · ' + e(m.edition.title) : '') + '</div>'
      + (deadline ? '<div class="text-sm ' + (dringend ? 'text-warning font-semibold' : 'opacity-70') + '">Inleverdatum ' + e(NB.datum(deadline)) + ' · ' + e(NB.tellerTekst(deadline)) + '</div>' : '')
      + '</div></a>';
  }

  function editieRij(ed) {
    var p = ed.progress || { totaal: 0, goedgekeurd: 0, ingeleverd: 0 };
    var binnen = p.goedgekeurd + p.ingeleverd;
    var actief = ['collecting', 'review'].indexOf(ed.status) >= 0;
    return '<a href="#/editie/' + e(ed.id) + '" class="block rounded-xl p-3 hover:bg-base-200 border border-base-content/10">'
      + '<div class="flex items-center justify-between gap-2 mb-1"><span class="font-semibold">' + e(ed.title) + '</span>' + NB.editieBadge(ed.status) + '</div>'
      + (actief
        ? '<div class="text-xs opacity-70 mb-2">Inleverdatum ' + e(NB.datum(ed.deadline_at)) + ' · ' + e(NB.tellerTekst(ed.deadline_at)) + ' · verzenddag ' + e(NB.datum(ed.send_at, { day: 'numeric', month: 'short' })) + '</div>'
          + NB.balkUitVoortgang(p) + '<div class="text-xs opacity-70 mt-1">' + binnen + ' van ' + p.totaal + ' stukjes binnen</div>'
        : '<div class="text-xs opacity-70">' + (ed.status === 'scheduled' ? 'Verzenddag ' : '') + e(NB.datum(ed.sent_at || ed.send_at, { day: 'numeric', month: 'long', year: 'numeric' })) + '</div>')
      + '</a>';
  }

  function reeksKaart(s) {
    var edities = s.editions || [];
    var lopend = edities.filter(function (x) { return ['collecting', 'review', 'scheduled'].indexOf(x.status) >= 0; });
    var vorige = edities.filter(function (x) { return x.status === 'sent'; }).slice(0, 2);
    var merk = s.brand === 'syndicoach' ? '<span class="badge badge-sm" style="background:#fdf2f8;color:#be185d;border:0">Syndicoach</span>'
      : '<span class="badge badge-sm" style="background:#e0f2fe;color:#0369a1;border:0">OpenVME</span>';
    return '<div class="card bg-base-100 border border-base-content/10">'
      + '<div class="card-body p-5 gap-3">'
      + '<div class="flex items-start justify-between gap-2"><div><h2 class="card-title text-lg">' + e(s.name) + '</h2>'
      + '<p class="text-sm opacity-70">' + e(s.description) + '</p></div>' + merk + '</div>'
      + (lopend.length ? lopend.map(editieRij).join('') : '<div class="text-sm opacity-60">Nog geen editie in de maak. ' + (s.cadence === 'monthly' ? 'De volgende verschijnt vanzelf.' : '') + '</div>')
      + (vorige.length ? '<div class="text-xs opacity-60 mt-1">Eerder: ' + vorige.map(function (v) { return '<a class="link" href="#/editie/' + e(v.id) + '">' + e(v.title) + '</a>'; }).join(', ') + '</div>' : '')
      + (s.is_editor
        ? '<div class="card-actions justify-end mt-1">'
          + '<button class="btn btn-sm btn-ghost" data-action="open-nieuwe-editie" data-series="' + e(s.id) + '"><i data-lucide="plus" class="w-4 h-4"></i> Editie</button>'
          + '<a class="btn btn-sm btn-ghost" href="#/reeks/' + e(s.id) + '"><i data-lucide="settings" class="w-4 h-4"></i> Instellingen</a></div>'
        : '')
      + '</div></div>';
  }

  function voorraadRij(p, boot) {
    var reeksen = (p.series_ids || []).map(function (id) { var s = NB.reeks(id); return s ? s.name : null; }).filter(Boolean);
    var mijn = p.owner_user_id === boot.me.id || p.created_by === boot.me.id;
    var magWeg = mijn || boot.me.is_editor;
    var notities = String(p.raw_notes || '').trim();
    return '<div class="flex items-start gap-3 py-2.5 border-b border-base-content/10 last:border-0">'
      + NB.gezicht(p.owner_name)
      + '<div class="flex-1 min-w-0">'
      + (mijn ? '<button class="font-medium hover:underline text-left" data-action="open-idee" data-id="' + e(p.id) + '">' + e(NB.blokNaam(p)) + '</button>' : '<span class="font-medium">' + e(NB.blokNaam(p)) + '</span>')
      + (notities ? '<div class="text-sm opacity-70 truncate">' + e(notities) + '</div>' : '')
      + '<div class="text-xs opacity-60">' + e(p.owner_name || '') + (reeksen.length ? ' · voor ' + e(reeksen.join(', ')) : '') + '</div></div>'
      + (magWeg ? '<button class="btn btn-ghost btn-xs" data-action="verwijder-idee" data-id="' + e(p.id) + '" aria-label="Weghalen"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' : '')
      + '</div>';
  }

  NB.views.overzicht = async function () {
    var app = document.getElementById('app');
    var data = await NB.api('/api/overview');
    var boot = NB.state.boot;
    NB.state.overzicht = data;

    app.innerHTML = ''
      + '<div class="flex flex-wrap items-center justify-between gap-3 mb-5">'
      + '<div><h1 class="text-2xl font-bold flex items-center gap-2"><i data-lucide="newspaper" class="w-6 h-6 text-primary"></i> Nieuwsbrieven</h1>'
      + '<p class="text-sm opacity-70">Iedereen schrijft mee, marketing is hoofdredactie. Een stukje schrijven duurt tien minuten.</p></div>'
      + '<button class="btn btn-primary btn-sm" data-action="open-idee"><i data-lucide="lightbulb" class="w-4 h-4"></i> Idee voor de nieuwsbrief</button>'
      + '</div>'
      + (data.mine.length
        ? '<h2 class="font-semibold mb-2">Voor jou</h2><div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">' + data.mine.map(opdrachtKaart).join('') + '</div>'
        : '')
      + '<div class="grid gap-4 lg:grid-cols-3 mb-6">' + data.series.map(reeksKaart).join('') + '</div>'
      + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5">'
      + '<div class="flex items-center justify-between"><h2 class="font-semibold">Voorraad</h2><span class="text-xs opacity-60">Ideeën die nog in geen editie staan. De hoofdredactie neemt ze op via "+" in de brief.</span></div>'
      + (data.pool.length ? data.pool.map(function (p) { return voorraadRij(p, boot); }).join('') : '<p class="text-sm opacity-60">Nog niets. Iets gehoord bij een klant of op een event? Zet het erin.</p>')
      + '</div></div>';
    NB.ikons();
  };

  // ─── Acties ───────────────────────────────────────────────────────────────

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
      NB.ga('#/');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['verwijder-idee'] = async function (el) {
    var ja = await NB.bevestig({ titel: 'Idee weghalen?', tekst: 'Het verdwijnt uit de voorraad. Dit kan je niet terugdraaien.', knop: 'Weghalen' });
    if (!ja) return;
    try {
      await NB.api('/api/contributions/' + el.dataset.id, { method: 'DELETE' });
      NB.toast('Weggehaald.');
      NB.ga('#/');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['open-nieuwe-editie'] = function (el) {
    NB.state.nieuweEditieReeks = el.dataset.series;
    var d = new Date(Date.now() + 21 * 86400000);
    document.getElementById('editieDatum').value = d.toISOString().slice(0, 10);
    NB.dialoog('dlgEditie').showModal();
  };

  NB.actions['maak-editie'] = async function () {
    try {
      var ed = await NB.api('/api/series/' + NB.state.nieuweEditieReeks + '/editions', {
        method: 'POST', body: { date: document.getElementById('editieDatum').value },
      });
      NB.dialoog('dlgEditie').close();
      NB.toast('Editie aangemaakt.');
      NB.ga('#/editie/' + ed.id);
    } catch (err) { NB.fout(err); }
  };
})();
