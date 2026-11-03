/**
 * CX Automations -- tabblad Opvolging: de BERICHTTEKSTEN (macro's).
 * Server: /cx-automations/api/opvolging/berichten
 * (src/modules/cx-automations/opvolging/berichten.js).
 *
 * Dezelfde teksteditor als de mailstap van de koppelingen (EOQuill, enkel vet,
 * cursief, lijstjes en links): een bericht hoort te lezen als een mail die de
 * verkoper zelf typte. Het VOORBEELD komt van de server, zodat het gelijk is
 * aan wat er straks vertrekt (render-plain.js + de handtekening van de
 * verkoper), en kan op een echte kans.
 */
(function () {
  var S = { data: null, fout: null, kies: null, concept: null, quill: null, laatsteVeld: 'tekst', bezig: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  async function api(pad, opties) {
    var res = await apiFetch('/cx-automations/api/opvolging/berichten' + (pad || ''), Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, opties || {}));
    var j = await res.json();
    if (!j.success) throw new Error(j.error || 'onbekende fout');
    return j.data;
  }

  function leeg() {
    return { id: null, naam: '', groep: (S.data && S.data.groepen[0]) || 'Niet bereikbaar', merk: 'syndicoach', taal: 'nl', onderwerp: '', tekst_html: '', actief: false, volgorde: 0 };
  }

  // ── Lijst ──────────────────────────────────────────────────────────────────
  function tekenLijst() {
    var lijst = S.data.berichten;
    var groepen = {};
    lijst.forEach(function (b) { (groepen[b.groep] = groepen[b.groep] || []).push(b); });
    var h = '<div class="flex items-center justify-between mb-2"><span class="text-sm font-medium">Berichten</span>'
      + '<button type="button" class="btn btn-primary btn-xs gap-1" data-ber="nieuw"><i data-lucide="plus" class="w-3 h-3"></i> Nieuw</button></div>';
    if (!lijst.length) h += '<p class="text-sm opacity-60">Nog geen berichten.</p>';
    Object.keys(groepen).sort().forEach(function (g) {
      h += '<div class="text-xs uppercase tracking-wide text-base-content/50 mt-4 mb-1">' + esc(g) + '</div><div class="flex flex-col gap-1">';
      groepen[g].forEach(function (b) {
        var gekozen = S.kies === b.id;
        h += '<button type="button" data-ber="kies" data-id="' + esc(b.id) + '" class="text-left rounded-lg border px-3 py-2 '
          + (gekozen ? 'border-primary bg-primary/10' : 'border-base-content/10 hover:bg-base-200') + '">'
          + '<div class="text-sm font-medium truncate" title="' + esc(b.naam) + '">' + esc(b.naam) + '</div>'
          + '<div class="flex flex-wrap items-center gap-1 mt-1">'
          + '<span class="badge badge-ghost badge-sm">' + esc(S.data.merken[b.merk] || b.merk) + '</span>'
          + '<span class="badge badge-ghost badge-sm">' + esc(b.taal.toUpperCase()) + '</span>'
          + (b.actief ? '<span class="badge badge-success badge-sm">klaar</span>' : '<span class="badge badge-warning badge-sm">concept</span>')
          + '</div></button>';
      });
      h += '</div>';
    });
    el('opvBerLijst').innerHTML = h;
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  function opties(map, gekozen) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === gekozen ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
    }).join('');
  }

  function tekenEditor() {
    var doel = el('opvBerEditor');
    var b = S.concept;
    if (!b) {
      doel.innerHTML = '<div class="text-sm opacity-60 p-4 border border-dashed border-base-content/20 rounded-lg">Kies een bericht links, of maak een nieuw.</div>';
      return;
    }
    var tokenOpties = S.data.tokens.map(function (t) { return '<option value="' + esc(t.pad) + '">' + esc(t.label) + '</option>'; }).join('');
    var groepOpties = S.data.groepen.map(function (g) { return '<option value="' + esc(g) + '"></option>'; }).join('');
    doel.innerHTML = ''
      + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Naam (intern)</span><input class="input input-bordered input-sm" data-berveld="naam" value="' + esc(b.naam) + '" placeholder="Bijv. Ik probeerde je te bellen"></label>'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Groep</span><input class="input input-bordered input-sm" list="opvBerGroepen" data-berveld="groep" value="' + esc(b.groep) + '"><datalist id="opvBerGroepen">' + groepOpties + '</datalist></label>'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Merk</span><select class="select select-bordered select-sm" data-berveld="merk">' + opties(S.data.merken, b.merk) + '</select></label>'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Taal</span><select class="select select-bordered select-sm" data-berveld="taal">' + opties(S.data.talen, b.taal) + '</select></label>'
      + '</div>'
      + '<label class="label cursor-pointer justify-start gap-2 mt-2"><input type="checkbox" class="toggle toggle-sm toggle-success" data-berveld="actief"' + (b.actief ? ' checked' : '') + '>'
      + '<span class="text-sm">Klaar voor gebruik</span><span class="text-xs opacity-50">(uit = concept)</span></label>'
      + '<label class="form-control mt-2"><span class="label-text text-xs mb-1">Onderwerp</span><input id="opvBerOnderwerp" class="input input-bordered input-sm" data-berveld="onderwerp" value="' + esc(b.onderwerp) + '" placeholder="Bijv. Ik probeerde je te bellen"></label>'
      + '<div class="flex items-center justify-between gap-2 mt-3 mb-1"><span class="label-text text-xs">Tekst</span>'
      + '<span class="flex items-center gap-1"><select id="opvBerToken" class="select select-bordered select-xs max-w-xs"><option value="">Gegeven invoegen…</option>' + tokenOpties + '</select>'
      + '<button type="button" class="btn btn-xs" data-ber="token">Invoegen</button></span></div>'
      + '<div id="opvBerQuill"></div>'
      + '<p class="text-xs opacity-60 mt-1">De handtekening van de verkoper (met foto) komt er vanzelf onder. Gegevens zoals de voornaam vullen zich in per kans. '
      + 'Een afspraaklink achter een woord: selecteer het woord en voeg <strong>Afspraaklink verkoper</strong> in.</p>'
      + '<div class="flex flex-wrap items-center gap-2 mt-4">'
      + '<button type="button" class="btn btn-primary btn-sm" data-ber="bewaar"' + (S.bezig ? ' disabled' : '') + '>Bewaren</button>'
      + (b.id ? '<button type="button" class="btn btn-ghost btn-sm text-error" data-ber="weg">Verwijderen</button>' : '')
      + '</div>'
      + '<div class="divider my-3"></div>'
      + '<div class="flex flex-wrap items-center gap-2 mb-2"><span class="text-sm font-medium">Voorbeeld</span>'
      + '<input id="opvBerKans" class="input input-bordered input-xs w-56" placeholder="Kansnummer of link uit Odoo (optioneel)">'
      + '<button type="button" class="btn btn-xs" data-ber="voorbeeld">Toon</button></div>'
      + '<div id="opvBerVoorbeeld" class="border border-base-content/10 rounded-lg bg-base-100 p-3 text-xs opacity-70">Zonder kans zie je het bericht met voorbeeldgegevens. Met een kans zie je het zoals die klant het zou krijgen, met de handtekening van de verkoper.</div>';

    S.quill = null;
    var host = el('opvBerQuill');
    if (host && window.EOQuill) {
      S.quill = window.EOQuill.create({
        target: host,
        initialHtml: b.tekst_html || '',
        placeholder: 'Hoi {{contact.first_name}},',
        toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'clean']],
      });
      if (S.quill) {
        var ed = host.querySelector('.ql-editor');
        if (ed) { ed.style.minHeight = '180px'; }
        S.quill.quill.on('selection-change', function (r) { if (r) S.laatsteVeld = 'tekst'; });
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function teken() {
    var doel = el('opvBerichten');
    if (!doel) return;
    if (S.fout) { doel.innerHTML = '<div class="alert alert-warning text-sm"><span>' + esc(S.fout) + '</span></div>'; return; }
    if (!S.data) { doel.innerHTML = '<span class="loading loading-spinner"></span>'; return; }
    if (!el('opvBerLijst')) {
      doel.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div id="opvBerLijst"></div><div id="opvBerEditor" class="md:col-span-2"></div></div>';
    }
    tekenLijst();
    tekenEditor();
  }

  function leesEditor() {
    var b = S.concept;
    if (!b) return null;
    document.querySelectorAll('[data-berveld]').forEach(function (v) {
      b[v.dataset.berveld] = v.type === 'checkbox' ? v.checked : v.value;
    });
    if (S.quill) b.tekst_html = S.quill.getHTML();
    return b;
  }

  // ── Acties ─────────────────────────────────────────────────────────────────
  async function laad() {
    if (S.data) { teken(); return; }
    teken();
    try { S.data = await api(''); S.fout = null; }
    catch (e) { S.fout = 'De berichten konden niet geladen worden: ' + e.message; }
    teken();
  }

  function kies(id) {
    var b = S.data.berichten.find(function (x) { return x.id === id; });
    if (!b) return;
    S.kies = id;
    S.concept = Object.assign({}, b);
    teken();
  }

  async function bewaar() {
    var b = leesEditor();
    if (!b) return;
    S.bezig = true;
    try {
      var uit = await api(b.id ? '/' + encodeURIComponent(b.id) : '', { method: b.id ? 'PUT' : 'POST', body: JSON.stringify(b) });
      var lijst = S.data.berichten.filter(function (x) { return x.id !== uit.id; });
      lijst.push(uit);
      S.data.berichten = lijst;
      S.kies = uit.id;
      S.concept = Object.assign({}, uit);
      showToast('Bericht bewaard', 'success');
    } catch (e) { showToast('Bewaren mislukt: ' + e.message, 'error'); }
    S.bezig = false;
    teken();
  }

  async function weg() {
    var b = S.concept;
    if (!b || !b.id) return;
    if (!window.confirm('Bericht "' + b.naam + '" verwijderen?')) return;
    try {
      await api('/' + encodeURIComponent(b.id), { method: 'DELETE' });
      S.data.berichten = S.data.berichten.filter(function (x) { return x.id !== b.id; });
      S.kies = null; S.concept = null;
      showToast('Bericht verwijderd', 'success');
    } catch (e) { showToast('Verwijderen mislukt: ' + e.message, 'error'); }
    teken();
  }

  function voegTokenIn() {
    var keuze = el('opvBerToken');
    var pad = keuze && keuze.value;
    if (!pad) { showToast('Kies eerst een gegeven.', 'error'); return; }
    var tok = '{{' + pad + '}}';
    if (S.laatsteVeld === 'onderwerp') {
      var inp = el('opvBerOnderwerp');
      var pos = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
      inp.value = inp.value.slice(0, pos) + tok + inp.value.slice(inp.selectionEnd != null ? inp.selectionEnd : pos);
      inp.focus();
      inp.setSelectionRange(pos + tok.length, pos + tok.length);
    } else if (S.quill) {
      var q = S.quill.quill;
      var sel = q.getSelection(true);
      var p = sel ? sel.index : q.getLength();
      // Een afspraaklink hoort achter tekst, niet als kale link in de zin
      // (zelfde regel als in de mailstap van de koppelingen).
      if (/^afspraak\./.test(pad)) {
        if (sel && sel.length > 0) {
          q.formatText(sel.index, sel.length, 'link', tok, 'user');
          q.setSelection(sel.index + sel.length, 0);
        } else {
          var t = 'plan een gesprek';
          q.insertText(p, t, { link: tok }, 'user');
          q.setSelection(p + t.length, 0);
          q.format('link', false, 'user');
        }
      } else {
        q.insertText(p, tok, 'user');
        q.setSelection(p + tok.length, 0);
      }
    }
    keuze.value = '';
  }

  async function voorbeeld() {
    var b = leesEditor();
    var doel = el('opvBerVoorbeeld');
    if (!b || !doel) return;
    doel.innerHTML = '<span class="loading loading-spinner loading-sm"></span>';
    try {
      var r = await api('/voorbeeld', { method: 'POST', body: JSON.stringify({ onderwerp: b.onderwerp, tekst_html: b.tekst_html, kans: (el('opvBerKans') || {}).value || '' }) });
      var meld = '';
      if (r.kans) meld += '<div class="mb-2 opacity-70">Kans ' + esc(r.kans.id) + ': ' + esc(r.kans.naam) + '</div>';
      if (r.ontbreekt && r.ontbreekt.length) meld += '<div class="alert alert-warning py-1 px-2 text-xs mb-2"><span>Leeg voor deze kans: ' + esc(r.ontbreekt.join(', ')) + '</span></div>';
      if (r.melding) meld += '<div class="alert py-1 px-2 text-xs mb-2"><span>' + esc(r.melding) + '</span></div>';
      doel.classList.remove('opacity-70');
      doel.innerHTML = meld
        + '<div class="text-xs opacity-60 mb-2 pb-2 border-b border-base-content/10"><strong>Onderwerp:</strong> ' + esc(r.onderwerp) + '</div>'
        + '<div class="text-sm text-base-content">' + (r.html || '<span class="opacity-50">Nog geen tekst.</span>') + '</div>';
    } catch (e) {
      doel.innerHTML = '<span class="text-error">' + esc(e.message) + '</span>';
    }
  }

  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.id === 'opvBerOnderwerp') S.laatsteVeld = 'onderwerp';
  });
  document.addEventListener('click', function (e) {
    var k = e.target.closest('[data-ber]');
    if (!k || !S.data) return;
    var a = k.dataset.ber;
    if (a === 'nieuw') { S.kies = null; S.concept = leeg(); teken(); }
    if (a === 'kies') kies(k.dataset.id);
    if (a === 'bewaar') bewaar();
    if (a === 'weg') weg();
    if (a === 'token') voegTokenIn();
    if (a === 'voorbeeld') voorbeeld();
  });

  window.OpvBerichten = { laad: laad };
})();
