/**
 * Projecten -- de groep "Bellen (uit Odoo)" bovenaan Mijn taken, en het
 * venster "Ik heb gebeld".
 *
 * De beltaken blijven activiteiten in Odoo; hier zie je ze en rond je ze af.
 * Afronden vinkt de beltaak af, zet de uitkomst in de chatter van de kans en
 * plant eventueel een nieuwe beltaak (src/modules/cx-automations/opvolging/).
 *
 * Het controlepaneel in Odoo linkt naar #/mijn?gesprek=<kans-id>
 * (&stap=volgende om enkel een beltaak te plannen): dan opent het venster meteen.
 */
(function () {
  'use strict';
  var PM = window.PM;
  var esc = PM.esc;

  var B = { data: null, kans: null, uitkomst: null, alleenVolgende: false, bezig: false };
  var UITKOMSTEN = [
    { id: 'opgenomen', label: 'Nam op', icoon: '✅', uitleg: 'Je had de persoon aan de lijn.' },
    { id: 'ingesproken', label: 'Voicemail ingesproken', icoon: '🎙️', uitleg: 'Nam niet op, je liet een bericht na.' },
    { id: 'niets', label: 'Nam niet op', icoon: '🔇', uitleg: 'Geen antwoord, niets ingesproken.' },
  ];
  var MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function korteDatum(iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return d.getDate() + ' ' + MAANDEN[d.getMonth()];
  }

  function gesprekTekst(g) {
    if (!g) return '<span class="opacity-50">Nog geen gesprek</span>';
    var u = UITKOMSTEN.filter(function (x) { return x.id === g.uitkomst; })[0];
    return (u ? u.icoon + ' ' : '') + esc(g.label) + ' · ' + esc(korteDatum(g.datum)) + (g.door ? ' · ' + esc(g.door) : '');
  }

  function telefoon(k) {
    return k.telefoon ? '<a class="link link-hover" href="tel:' + esc(k.telefoon.replace(/\s+/g, '')) + '">' + esc(k.telefoon) + '</a>' : '';
  }

  // ── De groep bovenaan Mijn taken ──────────────────────────────────────────

  PM.laadOdooBel = async function () {
    try { B.data = await PM.api('/odoo-beltaken'); } catch (err) { B.data = { fout: err.message, taken: [], later: 0 }; }
  };

  PM.odooBelKaart = function () {
    var d = B.data;
    if (!d || d.odoo === false) return '';
    if (d.fout) return '<div class="alert alert-warning text-sm mb-4"><span>De beltaken uit Odoo konden niet geladen worden: ' + esc(d.fout) + '</span></div>';
    if (!d.taken.length && !d.later) return '';
    var rijen = d.taken.map(function (k, i) {
      var badge = k.dagen_te_laat > 0
        ? '<span class="badge badge-error badge-sm">' + k.dagen_te_laat + (k.dagen_te_laat === 1 ? ' dag' : ' dagen') + ' te laat</span>'
        : '<span class="badge badge-info badge-sm">vandaag</span>';
      return '<div class="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2' + (i ? ' border-t border-base-content/10' : '') + '">'
        + '<div class="flex-1 min-w-0">'
        +   '<div class="font-medium truncate"><a class="link link-hover" href="' + esc(k.url) + '" target="_blank" rel="noopener">' + esc(k.naam) + '</a></div>'
        +   '<div class="text-xs opacity-70 flex flex-wrap gap-x-3">' + (k.contact ? '<span>' + esc(k.contact) + '</span>' : '') + telefoon(k) + '<span>' + esc(k.fase) + '</span></div>'
        +   '<div class="text-xs mt-0.5">' + gesprekTekst(k.laatste_gesprek) + '</div>'
        + '</div>'
        + '<div class="flex items-center gap-2 shrink-0">' + badge
        +   '<button type="button" class="btn btn-sm btn-primary" data-action="odoo-gesprek" data-id="' + k.id + '">Telefoonactie registreren</button>'
        + '</div></div>';
    }).join('');
    return '<div class="card bg-base-100 border border-base-content/10 shadow-sm mb-4"><div class="card-body p-0">'
      + '<div class="px-4 pt-4 pb-2 flex items-center gap-2"><i data-lucide="phone-call" class="w-4 h-4"></i>'
      + '<h3 class="font-semibold">Bellen (uit Odoo)</h3><span class="badge badge-ghost badge-sm">' + d.taken.length + '</span></div>'
      + '<div>' + (rijen || '<p class="px-4 pb-3 text-sm opacity-60">Niemand te bellen vandaag.</p>') + '</div>'
      + (d.later ? '<p class="px-4 py-2 text-xs opacity-60 border-t border-base-content/10">Later gepland: ' + d.later + (d.later === 1 ? ' beltaak' : ' beltaken') + '.</p>' : '')
      + '</div></div>';
  };

  // ── Het venster ───────────────────────────────────────────────────────────

  function dialoog() {
    var dlg = document.getElementById('pmGesprek');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'pmGesprek';
    dlg.className = 'modal';
    dlg.innerHTML = '<div class="modal-box max-w-xl"><div id="pmGesprekInhoud"></div></div>'
      + '<form method="dialog" class="modal-backdrop"><button>sluiten</button></form>';
    document.body.appendChild(dlg);
    return dlg;
  }

  function volgendeStandaard() {
    // Na een poging standaard opnieuw bellen; na echt contact beslist de verkoper zelf.
    return B.alleenVolgende || (B.uitkomst && B.uitkomst !== 'opgenomen');
  }

  function tekenVenster() {
    var k = B.kans;
    var h = '<h3 class="font-bold text-lg">' + (B.alleenVolgende ? 'Gesprek plannen' : 'Telefoonactie registreren') + '</h3>'
      + '<div class="text-sm mt-1"><a class="link link-hover font-medium" href="' + esc(k.url) + '" target="_blank" rel="noopener">' + esc(k.naam) + '</a></div>'
      + '<div class="text-xs opacity-70 flex flex-wrap gap-x-3 mt-0.5">' + (k.contact ? '<span>' + esc(k.contact) + '</span>' : '') + telefoon(k)
      + '<span>' + esc(k.fase) + '</span><span>' + (k.heeft_verkoper ? 'Verkoper: ' + esc(k.verkoper) : '<span class="text-error">Geen verkoper</span>') + '</span></div>';
    if (!k.open) h += '<div class="alert alert-warning text-sm mt-3"><span>Deze kans is gewonnen of verloren.</span></div>';
    if (k.gesprekken.length) {
      h += '<div class="mt-3 text-xs"><div class="font-semibold opacity-70 mb-1">Vorige gesprekken</div>'
        + k.gesprekken.map(function (g) { return '<div>' + gesprekTekst(g) + '</div>'; }).join('') + '</div>';
    }
    if (!B.alleenVolgende) {
      h += '<div class="mt-4 font-semibold text-sm">Hoe liep het gesprek?</div><div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">'
        + UITKOMSTEN.map(function (u) {
          var actief = B.uitkomst === u.id;
          return '<button type="button" class="rounded-xl p-3 text-left border-2 ' + (actief ? 'border-primary bg-primary/10' : 'border-base-content/15') + '" data-action="odoo-kies" data-id="' + u.id + '">'
            + '<div class="text-lg">' + u.icoon + '</div><div class="font-semibold text-sm">' + esc(u.label) + '</div><div class="text-xs opacity-60">' + esc(u.uitleg) + '</div></button>';
        }).join('') + '</div>'
        + '<label class="form-control mt-3"><span class="label-text text-sm">' + (B.uitkomst === 'opgenomen' ? 'Waarover ging het gesprek?' : 'Notitie (niet verplicht)') + '</span>'
        + '<textarea id="pmGesprekNotitie" class="textarea textarea-bordered mt-1" rows="3"></textarea></label>'
        + '<p class="text-xs opacity-60 mt-1">' + (k.beltaken
          ? (k.beltaken === 1 ? 'De beltaak op deze kans wordt afgevinkt.' : 'De ' + k.beltaken + ' beltaken op deze kans worden afgevinkt.')
          : 'Er staat geen beltaak op deze kans: het gesprek komt als notitie in de chatter.') + '</p>';
    }
    h += '<div class="mt-4 p-3 rounded-xl bg-base-200">'
      + '<label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" id="pmGesprekVolgendeAan" class="checkbox checkbox-sm" '
      + (volgendeStandaard() ? 'checked' : '') + (B.alleenVolgende ? ' disabled' : '') + '> Nieuwe beltaak op</label>'
      + '<input type="date" id="pmGesprekVolgende" class="input input-bordered input-sm mt-2" min="' + esc(k.vandaag) + '" value="' + esc(k.standaard_volgende) + '">'
      + '<p class="text-xs opacity-60 mt-1">Voor ' + (k.heeft_verkoper ? esc(k.verkoper) : 'jou') + '.</p></div>'
      + '<div class="modal-action"><button type="button" class="btn btn-ghost btn-sm" data-action="odoo-sluit">Annuleren</button>'
      + '<button type="button" class="btn btn-primary btn-sm" data-action="odoo-bewaar"' + (B.bezig ? ' disabled' : '') + '>'
      + (B.bezig ? '<span class="loading loading-spinner loading-xs"></span>' : '') + (B.alleenVolgende ? 'Plannen' : 'Afronden') + '</button></div>';

    var notitie = document.getElementById('pmGesprekNotitie');
    var datum = document.getElementById('pmGesprekVolgende');
    var oudeNotitie = notitie ? notitie.value : '';
    var oudeDatum = datum ? datum.value : '';
    document.getElementById('pmGesprekInhoud').innerHTML = h;
    if (oudeNotitie && document.getElementById('pmGesprekNotitie')) document.getElementById('pmGesprekNotitie').value = oudeNotitie;
    if (oudeDatum) document.getElementById('pmGesprekVolgende').value = oudeDatum;
  }

  async function openVenster(id, alleenVolgende) {
    B.kans = null; B.uitkomst = null; B.alleenVolgende = !!alleenVolgende; B.bezig = false;
    var dlg = dialoog();
    document.getElementById('pmGesprekInhoud').innerHTML = '<div class="py-8 text-center"><span class="loading loading-spinner"></span></div>';
    if (!dlg.open) dlg.showModal();
    try {
      B.kans = await PM.api('/odoo-kansen/' + id);
      tekenVenster();
    } catch (err) {
      document.getElementById('pmGesprekInhoud').innerHTML = '<p class="text-error text-sm">De kans kon niet geladen worden: ' + esc(err.message) + '</p>';
    }
  }

  async function bewaar() {
    if (B.bezig || !B.kans) return;
    if (!B.alleenVolgende && !B.uitkomst) { PM.toast('Kies hoe het gesprek afliep.', 'error'); return; }
    var aan = B.alleenVolgende || document.getElementById('pmGesprekVolgendeAan').checked;
    var datum = document.getElementById('pmGesprekVolgende').value;
    var notitieEl = document.getElementById('pmGesprekNotitie');
    if (aan && !datum) { PM.toast('Kies een datum voor de beltaak.', 'error'); return; }
    var body = { uitkomst: B.alleenVolgende ? null : B.uitkomst, notitie: notitieEl ? notitieEl.value : '',
      volgende: aan ? datum : null, alleen_volgende: B.alleenVolgende };
    B.bezig = true; tekenVenster();
    try {
      var r = await PM.api('/odoo-kansen/' + B.kans.id + '/gesprek', { method: 'POST', body: body });
      var zinnen = [];
      if (!B.alleenVolgende) zinnen.push(r.taken_afgerond ? 'De beltaak is afgevinkt en de uitkomst staat in de chatter.' : 'Het gesprek staat in de chatter.');
      if (r.volgende) zinnen.push('Nieuwe beltaak op ' + korteDatum(r.volgende) + '.');
      PM.toast(zinnen.join(' '));
      dialoog().close();
      await PM.laadOdooBel();
      if (PM.state.route && PM.state.route.soort === 'mijn') PM.tekenHoofd();
    } catch (err) {
      B.bezig = false; tekenVenster();
      PM.toast('Bewaren mislukt: ' + err.message, 'error');
    }
  }

  PM.actie('odoo-gesprek', function (el) { openVenster(el.dataset.id, false); });
  PM.actie('odoo-kies', function (el) {
    B.uitkomst = el.dataset.id;
    tekenVenster();
    document.getElementById('pmGesprekVolgendeAan').checked = volgendeStandaard();
  });
  PM.actie('odoo-bewaar', function () { bewaar(); });
  PM.actie('odoo-sluit', function () { dialoog().close(); });

  // ── Vanuit het controlepaneel in Odoo: #/mijn?gesprek=<id> ────────────────

  function volgLink() {
    var m = /[?&]gesprek=(\d+)/.exec(location.hash || '');
    if (!m) return;
    openVenster(m[1], /[?&]stap=volgende/.test(location.hash));
  }
  window.addEventListener('hashchange', volgLink);

  PM.laadOdooBel().then(function () {
    if (PM.state.route && PM.state.route.soort === 'mijn') { PM.tekenHoofd(); PM.ikons(); }
  });
  volgLink();
})();
