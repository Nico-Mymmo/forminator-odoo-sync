/**
 * Projecten -- het venster "Bericht sturen" bij een kans uit Odoo.
 *
 * De verkoper kiest een bericht (geschreven in CX Automations -> Berichten),
 * ziet het ingevuld met de gegevens van de kans, past het aan als hij wil, en
 * verstuurt. De mail vertrekt op naam en adres van de verkoper van de kans,
 * met zijn handtekening, en staat in de chatter van de kans.
 * Server: src/modules/cx-automations/opvolging/berichten.js.
 *
 * Open vanuit de groep "Bellen (uit Odoo)" (knop Mail), of met
 * #/mijn?bericht=<kans-id>.
 */
(function () {
  'use strict';
  var PM = window.PM;
  var esc = PM.esc;

  var M = { id: null, kans: null, lijst: null, bericht: null, taal: null, ingevuld: null, quill: null, sleutel: null, bezig: false, laden: false };

  function dialoog() {
    var dlg = document.getElementById('pmBericht');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'pmBericht';
    dlg.className = 'modal';
    dlg.innerHTML = '<div class="modal-box max-w-2xl"><div id="pmBerichtInhoud"></div></div>'
      + '<form method="dialog" class="modal-backdrop"><button>sluiten</button></form>';
    document.body.appendChild(dlg);
    return dlg;
  }
  function inhoud(h) { document.getElementById('pmBerichtInhoud').innerHTML = h; }
  function sleutel() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  }

  function berichtOpties() {
    var groepen = {};
    var volgorde = [];
    M.lijst.berichten.forEach(function (b) {
      var g = b.groep || 'Zonder groep';
      if (!groepen[g]) { groepen[g] = []; volgorde.push(g); }
      groepen[g].push(b);
    });
    return '<option value="">Kies een bericht…</option>' + volgorde.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groepen[g].map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (M.bericht === b.id ? ' selected' : '') + '>' + esc(b.naam) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  function teken() {
    var k = M.kans, l = M.lijst;
    var h = '<h3 class="font-bold text-lg">Bericht sturen</h3>'
      + '<div class="text-sm mt-1"><a class="link link-hover font-medium" href="' + esc(k.url) + '" target="_blank" rel="noopener">' + esc(k.naam) + '</a></div>'
      + '<div class="text-xs mt-2 grid grid-cols-[3rem_1fr] gap-y-0.5">'
      + '<span class="opacity-60">Aan</span><span>' + (l.aan ? esc((k.contact ? k.contact + ' · ' : '') + l.aan) : '<span class="text-error">geen e-mailadres</span>') + '</span>'
      + '<span class="opacity-60">Van</span><span>' + (l.van ? esc(l.van) : '<span class="text-error">geen afzender</span>') + '</span></div>';
    if (l.probleem) {
      inhoud(h + '<div class="alert alert-warning text-sm mt-4"><span>' + esc(l.probleem) + '</span></div>'
        + '<div class="modal-action"><button type="button" class="btn btn-ghost btn-sm" data-action="bericht-sluit">Sluiten</button></div>');
      return;
    }
    if (!l.berichten.length) {
      inhoud(h + '<div class="alert text-sm mt-4"><span>Er staan nog geen berichten klaar voor ' + esc(l.merk_naam) + '. Ze worden geschreven in CX Automations, tabblad Berichten (zet "Klaar voor gebruik" aan).</span></div>'
        + '<div class="modal-action"><button type="button" class="btn btn-ghost btn-sm" data-action="bericht-sluit">Sluiten</button></div>');
      return;
    }
    var gekozen = l.berichten.filter(function (b) { return b.id === M.bericht; })[0];
    h += '<div class="flex flex-wrap gap-2 mt-4"><select id="pmBerichtKeuze" class="select select-bordered select-sm flex-1 min-w-[14rem]" data-change="bericht-kies">' + berichtOpties() + '</select>';
    if (gekozen && gekozen.talen.length > 1) {
      h += '<select id="pmBerichtTaal" class="select select-bordered select-sm" data-change="bericht-taal">' + gekozen.talen.map(function (t) {
        return '<option value="' + esc(t) + '"' + (M.taal === t ? ' selected' : '') + '>' + esc(l.talen[t] || t) + '</option>';
      }).join('') + '</select>';
    }
    h += '</div>';
    if (M.laden) {
      inhoud(h + '<div class="py-8 text-center"><span class="loading loading-spinner"></span></div>');
      return;
    }
    if (M.ingevuld) {
      var i = M.ingevuld;
      if (i.melding) h += '<div class="alert py-1.5 px-3 text-xs mt-3"><span>' + esc(i.melding) + '</span></div>';
      if (i.ontbreekt && i.ontbreekt.length) h += '<div class="alert alert-warning py-1.5 px-3 text-xs mt-3"><span>Leeg voor deze kans: ' + esc(i.ontbreekt.join(', ')) + '. Vul het zelf aan in de tekst.</span></div>';
      h += '<label class="form-control mt-3"><span class="label-text text-xs mb-1">Onderwerp</span><input id="pmBerichtOnderwerp" class="input input-bordered input-sm" value="' + esc(i.onderwerp) + '"></label>'
        + '<div class="label-text text-xs mt-3 mb-1">Tekst</div><div id="pmBerichtQuill"></div>'
        + (i.handtekening
          ? '<div class="text-xs opacity-60 mt-3 mb-1">Handtekening (komt er vanzelf onder)</div><div class="border border-base-content/10 rounded-lg p-3 bg-base-100 text-sm max-h-48 overflow-auto">' + i.handtekening + '</div>'
          : '');
    }
    h += '<div class="modal-action"><button type="button" class="btn btn-ghost btn-sm" data-action="bericht-sluit">Annuleren</button>'
      + '<button type="button" class="btn btn-primary btn-sm" data-action="bericht-verstuur"' + (!M.ingevuld || M.bezig ? ' disabled' : '') + '>'
      + (M.bezig ? '<span class="loading loading-spinner loading-xs"></span>' : '<i data-lucide="send" class="w-4 h-4"></i>') + ' Versturen</button></div>';
    inhoud(h);

    M.quill = null;
    var host = document.getElementById('pmBerichtQuill');
    if (host && window.EOQuill && M.ingevuld) {
      M.quill = window.EOQuill.create({
        target: host,
        initialHtml: M.ingevuld.tekst_html || '',
        toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'clean']],
      });
      var ed = host.querySelector('.ql-editor');
      if (ed) { ed.style.minHeight = '200px'; }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  async function open(id) {
    M = { id: Number(id), kans: null, lijst: null, bericht: null, taal: null, ingevuld: null, quill: null, sleutel: null, bezig: false, laden: false };
    var dlg = dialoog();
    inhoud('<div class="py-8 text-center"><span class="loading loading-spinner"></span></div>');
    if (!dlg.open) dlg.showModal();
    try {
      var res = await Promise.all([PM.api('/odoo-kansen/' + id), PM.api('/odoo-kansen/' + id + '/berichten')]);
      M.kans = res[0];
      M.lijst = res[1];
      teken();
    } catch (err) {
      inhoud('<p class="text-error text-sm">De kans kon niet geladen worden: ' + esc(err.message) + '</p>'
        + '<div class="modal-action"><button type="button" class="btn btn-ghost btn-sm" data-action="bericht-sluit">Sluiten</button></div>');
    }
  }

  async function kies(berichtId, taal) {
    M.bericht = berichtId || null;
    M.ingevuld = null;
    M.taal = taal || null;
    if (!M.bericht) { teken(); return; }
    M.laden = true; teken();
    try {
      M.ingevuld = await PM.api('/odoo-kansen/' + M.id + '/berichten/' + encodeURIComponent(M.bericht), { method: 'POST', body: { taal: M.taal } });
      M.taal = M.ingevuld.taal;
      M.sleutel = sleutel();
    } catch (err) {
      PM.toast('Het bericht kon niet ingevuld worden: ' + err.message, 'error');
    }
    M.laden = false;
    teken();
  }

  async function verstuur() {
    if (M.bezig || !M.ingevuld) return;
    var onderwerp = (document.getElementById('pmBerichtOnderwerp') || {}).value || '';
    var tekst = M.quill ? M.quill.getHTML() : M.ingevuld.tekst_html;
    if (!onderwerp.trim()) { PM.toast('Het onderwerp is leeg.', 'error'); return; }
    // Wat er getypt is, terugzetten na een hertekening.
    M.ingevuld.onderwerp = onderwerp;
    M.ingevuld.tekst_html = tekst;
    M.bezig = true; teken();
    try {
      var r = await PM.api('/odoo-kansen/' + M.id + '/bericht', { method: 'POST', body: { bericht_id: M.bericht, onderwerp: onderwerp, tekst_html: tekst, sleutel: M.sleutel } });
      PM.toast(r.al_verstuurd ? 'Dit bericht was al verstuurd.' : 'Verstuurd naar ' + r.aan + '. Het staat in de chatter van de kans.');
      dialoog().close();
    } catch (err) {
      M.bezig = false; teken();
      PM.toast('Versturen mislukt: ' + err.message, 'error');
    }
  }

  PM.actie('odoo-bericht', function (el) { open(el.dataset.id); });
  PM.actie('bericht-verstuur', function () { verstuur(); });
  PM.actie('bericht-sluit', function () { dialoog().close(); });

  // Keuzelijsten: via de centrale change-luisteraar van Projecten (projecten-bootstrap.js).
  PM.bijWijziging('bericht-kies', function (el) { kies(el.value, null); });
  PM.bijWijziging('bericht-taal', function (el) { kies(M.bericht, el.value); });

  // ── Vanuit Odoo: #/mijn?bericht=<kans-id> ─────────────────────────────────
  function volgLink() {
    var m = /[?&]bericht=(\d+)/.exec(location.hash || '');
    if (m) open(m[1]);
  }
  window.addEventListener('hashchange', volgLink);
  volgLink();
})();
