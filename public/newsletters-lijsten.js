/**
 * Nieuwsbrieven -- automatische lijsten (#/lijsten, hoofdredactie).
 *
 * Een automatische lijst is een mailinglijst in Odoo die de OM elke dag om
 * 6 uur gelijkzet: de contactpersonen onder bedrijven met een gekozen
 * bedrijfsstatus. De logica staat op de server (lib/auto-lijsten.js); dit
 * scherm stelt enkel in en toont de laatste ronde.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;
  var st = { lijsten: [], statussen: [], bezig: null };

  function datum(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (err) { return iso; }
  }

  function statusVinkjes(sleutel, gekozen) {
    if (!st.statussen.length) return '<p class="text-sm opacity-60">De bedrijfsstatussen konden niet uit Odoo gelezen worden.</p>';
    return '<div class="flex flex-wrap gap-x-5 gap-y-1">' + st.statussen.map(function (s) {
      return '<label class="label cursor-pointer justify-start gap-2 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-lijst-status="' + e(sleutel) + '" value="' + e(s.value) + '"' + (gekozen.indexOf(s.value) >= 0 ? ' checked' : '') + '><span class="label-text">' + e(s.label) + '</span></label>';
    }).join('') + '</div>';
  }

  function ronde(l) {
    var r = l.laatste_resultaat;
    if (!r) return '<p class="text-sm opacity-60">Nog niet bijgewerkt. De eerste ronde maakt de lijst in Odoo aan.</p>';
    var wanneer = '<span class="opacity-60">' + e(datum(l.laatste_ronde_at)) + ':</span> ';
    if (r.gestopt) {
      return '<div class="alert alert-warning text-sm py-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i><span>' + wanneer + e(r.fout)
        + '</span><button class="btn btn-xs" data-action="lijst-bijwerken" data-id="' + e(l.id) + '" data-forceer="1">Toch bijwerken</button></div>';
    }
    if (!r.ok) return '<div class="alert alert-error text-sm py-2"><span>' + wanneer + 'mislukt: ' + e(r.fout || 'onbekende fout') + '</span></div>';
    return '<p class="text-sm">' + wanneer + '<strong>' + e(r.op_lijst) + '</strong> adressen op de lijst'
      + ' (' + e(r.toegevoegd) + ' erbij, ' + e(r.weggehaald) + ' eraf'
      + (r.uitgeschreven ? ', ' + e(r.uitgeschreven) + ' uitgeschreven' : '') + ').</p>';
  }

  function kaart(l) {
    var bezig = st.bezig === l.id;
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-3">'
      + '<div class="flex flex-wrap items-end gap-3">'
      + '<label class="form-control flex-1 min-w-[220px]"><span class="label-text mb-1">Naam van de lijst in Odoo</span><input class="input input-bordered input-sm" data-lijst-naam="' + e(l.id) + '" value="' + e(l.naam) + '"></label>'
      + '<label class="label cursor-pointer gap-2"><input type="checkbox" class="toggle toggle-sm toggle-primary" data-lijst-actief="' + e(l.id) + '"' + (l.actief ? ' checked' : '') + '><span class="label-text">Elke dag bijwerken</span></label>'
      + '</div>'
      + '<div><span class="label-text">Contactpersonen onder bedrijven met status</span>' + statusVinkjes(l.id, l.statussen || []) + '</div>'
      + ronde(l)
      + '<div class="flex flex-wrap gap-2">'
      + '<button class="btn btn-sm btn-primary" data-action="lijst-bewaar" data-id="' + e(l.id) + '">Bewaren</button>'
      + '<button class="btn btn-sm btn-outline" data-action="lijst-bijwerken" data-id="' + e(l.id) + '"' + (bezig ? ' disabled' : '') + '>'
      + (bezig ? '<span class="loading loading-spinner loading-xs"></span> Bezig...' : '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Nu bijwerken') + '</button>'
      + (l.odoo_list_id ? '<span class="text-xs opacity-60 self-center">Odoo-lijst nr. ' + e(l.odoo_list_id) + '</span>' : '')
      + '<button class="btn btn-sm btn-ghost text-error ml-auto" data-action="lijst-weg" data-id="' + e(l.id) + '" title="Instelling weghalen"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
      + '</div></div></div>';
  }

  function render() {
    document.getElementById('app').innerHTML = '<div class="max-w-4xl mx-auto">'
      + '<a class="btn btn-ghost btn-sm mb-2" href="#/"><i data-lucide="arrow-left" class="w-4 h-4"></i> Nieuwsbrieven</a>'
      + '<h1 class="text-2xl font-bold flex items-center gap-2"><i data-lucide="users" class="w-6 h-6 text-primary"></i> Automatische lijsten</h1>'
      + '<p class="text-sm opacity-60 mt-0.5 mb-4">Mailinglijsten in Odoo die de OM zelf vult en elke dag om 6 uur bijwerkt. Wie zich uitschreef, blijft uitgeschreven.</p>'
      + '<div class="flex flex-col gap-4">' + st.lijsten.map(kaart).join('')
      + '<div class="card bg-base-100 border border-dashed border-base-content/20"><div class="card-body p-5 gap-3"><h2 class="font-semibold">Nieuwe automatische lijst</h2>'
      + '<label class="form-control"><span class="label-text mb-1">Naam</span><input class="input input-bordered input-sm" data-lijst-naam="nieuw" placeholder="Bv. Betalende klanten"></label>'
      + '<div><span class="label-text">Contactpersonen onder bedrijven met status</span>' + statusVinkjes('nieuw', []) + '</div>'
      + '<div><button class="btn btn-sm btn-primary" data-action="lijst-nieuw">Toevoegen</button></div>'
      + '</div></div></div></div>';
    NB.ikons();
  }

  function lees(id) {
    var naam = document.querySelector('[data-lijst-naam="' + id + '"]');
    var actief = document.querySelector('[data-lijst-actief="' + id + '"]');
    var statussen = Array.prototype.slice.call(document.querySelectorAll('[data-lijst-status="' + id + '"]:checked')).map(function (x) { return x.value; });
    var uit = { naam: naam ? naam.value : '', statussen: statussen };
    if (actief) uit.actief = actief.checked;
    return uit;
  }

  async function laad() {
    var d = await NB.api('/api/auto-lijsten');
    st.lijsten = d.lijsten || [];
    st.statussen = d.statussen || [];
  }

  NB.views.lijsten = async function () {
    await laad();
    render();
  };

  NB.actions['lijst-bewaar'] = async function (el) {
    await NB.api('/api/auto-lijsten/' + encodeURIComponent(el.dataset.id), { method: 'PUT', body: lees(el.dataset.id) });
    NB.toast('Bewaard');
    await laad(); render();
  };

  NB.actions['lijst-nieuw'] = async function () {
    await NB.api('/api/auto-lijsten', { method: 'POST', body: lees('nieuw') });
    NB.toast('Toegevoegd. Klik op "Nu bijwerken" om de lijst in Odoo te vullen.');
    await laad(); render();
  };

  NB.actions['lijst-bijwerken'] = async function (el) {
    var id = el.dataset.id;
    var forceer = el.dataset.forceer === '1';
    if (forceer && !(await NB.bevestig({ titel: 'Toch bijwerken?', tekst: 'Er gaan veel adressen van de lijst af. Klopt de instelling, ga dan verder.', knop: 'Toch bijwerken' }))) return;
    st.bezig = id; render();
    try {
      var r = await NB.api('/api/auto-lijsten/' + encodeURIComponent(id) + '/bijwerken', { method: 'POST', body: { forceer: forceer } });
      if (r.ok) NB.toast('Bijgewerkt: ' + r.toegevoegd + ' erbij, ' + r.weggehaald + ' eraf.');
      else NB.toast(r.fout || 'Niet bijgewerkt', r.gestopt ? 'warning' : 'error');
    } finally {
      st.bezig = null;
      await laad(); render();
    }
  };

  NB.actions['lijst-weg'] = async function (el) {
    if (!(await NB.bevestig({ titel: 'Instelling weghalen?', tekst: 'De OM werkt deze lijst dan niet meer bij. De lijst zelf blijft in Odoo staan, met wie erop staat.', knop: 'Weghalen' }))) return;
    await NB.api('/api/auto-lijsten/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' });
    await laad(); render();
  };
})();
