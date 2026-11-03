/**
 * CX Automations -- tabblad Berichten: de BERICHTTEKSTEN (macro's).
 * Server: /cx-automations/api/opvolging/berichten en /bericht-groepen
 * (src/modules/cx-automations/opvolging/berichten.js).
 *
 * Drie kolommen, zoals Koppelingen: links de GROEPEN (aanmaken, hernoemen,
 * verwijderen; een bericht sleep je naar een groep), in het midden de berichten
 * van de gekozen groep, rechts het gekozen bericht.
 *
 * Dezelfde teksteditor als de mailstap van de koppelingen (EOQuill, enkel vet,
 * cursief, lijstjes en links): een bericht hoort te lezen als een mail die de
 * verkoper zelf typte. Het VOORBEELD komt van de server, zodat het gelijk is
 * aan wat er straks vertrekt (render-plain.js + de handtekening van de
 * verkoper), en kan op een echte kans.
 */
(function () {
  var GEEN = '__none__';
  var STANDAARD = 'nl';
  var S = { data: null, fout: null, groep: null, kies: null, concept: null, quill: null, laatsteVeld: 'tekst', bezig: false, taal: STANDAARD };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  async function api(pad, opties) {
    var res = await apiFetch('/cx-automations/api/opvolging' + pad, Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, opties || {}));
    var j = await res.json();
    if (!j.success) throw new Error(j.error || 'onbekende fout');
    return j.data;
  }

  function leeg() {
    var groepId = S.groep && S.groep !== GEEN ? S.groep : null;
    return { id: null, naam: '', groep_id: groepId, merk: 'syndicoach', onderwerp: '', tekst_html: '', vertalingen: {}, actief: false, volgorde: 0 };
  }

  // Een taal: de standaard staat in onderwerp/tekst_html, de andere in vertalingen.
  function heeftTekst(html) { return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== ''; }
  function versie(b, taal) {
    if (taal === STANDAARD) return { onderwerp: b.onderwerp || '', tekst_html: b.tekst_html || '' };
    return (b.vertalingen && b.vertalingen[taal]) || { onderwerp: '', tekst_html: '' };
  }
  function zetVersie(b, taal, v) {
    if (taal === STANDAARD) { b.onderwerp = v.onderwerp; b.tekst_html = v.tekst_html; return; }
    b.vertalingen = b.vertalingen || {};
    b.vertalingen[taal] = v;
  }
  function volledig(b, taal) { var v = versie(b, taal); return !!String(v.onderwerp).trim() && heeftTekst(v.tekst_html); }
  function inGroep(b, g) {
    if (g === null) return true;
    if (g === GEEN) return !b.groep_id || !groepBestaat(b.groep_id);
    return b.groep_id === g;
  }
  function groepBestaat(id) { return S.data.groepen.some(function (g) { return g.id === id; }); }
  function tel(g) { return S.data.berichten.filter(function (b) { return inGroep(b, g); }).length; }

  // ── Links: de groepen ──────────────────────────────────────────────────────
  function groepRij(id, naam, icoon, aantal, menu) {
    var gekozen = S.groep === id;
    var drop = id === null ? '' : ' data-ber-drop="' + esc(id === GEEN ? '' : id) + '"';
    return '<div class="flex items-center gap-1.5 rounded-lg px-1.5 py-1 cursor-pointer hover:bg-base-200 '
      + (gekozen ? 'bg-primary/10 text-primary font-medium' : '') + '" data-ber="groep" data-groep="' + esc(id === null ? '' : id) + '"' + drop + '>'
      + '<i data-lucide="' + icoon + '" class="w-3.5 h-3.5 shrink-0 text-base-content/40"></i>'
      + '<span class="flex-1 truncate text-sm">' + esc(naam) + '</span>'
      + '<span class="text-xs text-base-content/35">' + aantal + '</span>'
      + (menu ? '<div class="dropdown dropdown-end shrink-0"><button tabindex="0" type="button" class="btn btn-ghost btn-xs px-1" data-ber-stop="1"><i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i></button>'
        + '<ul tabindex="0" class="dropdown-content z-[20] menu menu-xs p-1 shadow-lg bg-base-100 rounded-lg w-36 border border-base-content/10">'
        + '<li><a data-ber="groep-hernoem" data-groep="' + esc(id) + '"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Hernoemen</a></li>'
        + '<li><a data-ber="groep-weg" data-groep="' + esc(id) + '" class="text-error"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Verwijderen</a></li>'
        + '</ul></div>' : '')
      + '</div>';
  }

  function tekenGroepen() {
    var h = '<div class="flex items-center justify-between mb-2 px-1">'
      + '<p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Groepen</p>'
      + '<button type="button" class="btn btn-ghost btn-xs" data-ber="groep-nieuw" title="Nieuwe groep"><i data-lucide="folder-plus" class="w-3.5 h-3.5"></i></button></div>'
      + '<div class="space-y-0.5">'
      + groepRij(null, 'Alle berichten', 'layout-grid', S.data.berichten.length, false)
      + groepRij(GEEN, 'Zonder groep', 'inbox', tel(GEEN), false)
      + '<div class="divider my-1"></div>';
    if (!S.data.groepen.length) h += '<p class="text-xs text-base-content/40 italic px-1.5 py-2">Nog geen groepen.</p>';
    S.data.groepen.forEach(function (g) { h += groepRij(g.id, g.naam, 'folder', tel(g.id), true); });
    h += '</div><p class="text-xs text-base-content/40 px-1.5 mt-3">Sleep een bericht naar een groep om het te verplaatsen.</p>';
    el('opvBerGroepen').innerHTML = h;
  }

  // ── Midden: de berichten van de gekozen groep ──────────────────────────────
  function tekenLijst() {
    var lijst = S.data.berichten.filter(function (b) { return inGroep(b, S.groep); });
    var titel = S.groep === null ? 'Alle berichten' : S.groep === GEEN ? 'Zonder groep'
      : ((S.data.groepen.find(function (g) { return g.id === S.groep; }) || {}).naam || '');
    var h = '<div class="flex items-center justify-between mb-2"><span class="text-sm font-medium truncate">' + esc(titel) + '</span>'
      + '<button type="button" class="btn btn-primary btn-xs gap-1" data-ber="nieuw"><i data-lucide="plus" class="w-3 h-3"></i> Nieuw bericht</button></div>'
      + '<div class="flex flex-col gap-1">';
    if (!lijst.length) h += '<p class="text-sm text-base-content/50 py-2">Nog geen berichten in deze groep.</p>';
    lijst.forEach(function (b) {
      var gekozen = S.kies === b.id;
      var groep = S.groep === null && b.groep_id ? ((S.data.groepen.find(function (g) { return g.id === b.groep_id; }) || {}).naam || '') : '';
      h += '<button type="button" draggable="true" data-ber="kies" data-id="' + esc(b.id) + '" class="text-left rounded-lg border px-3 py-2 '
        + (gekozen ? 'border-primary bg-primary/10' : 'border-base-content/10 hover:bg-base-200') + '">'
        + '<div class="text-sm font-medium truncate" title="' + esc(b.naam) + '">' + esc(b.naam) + '</div>'
        + '<div class="flex flex-wrap items-center gap-1 mt-1">'
        + (groep ? '<span class="badge badge-ghost badge-sm"><i data-lucide="folder" class="w-3 h-3 mr-1"></i>' + esc(groep) + '</span>' : '')
        + '<span class="badge badge-ghost badge-sm">' + esc(S.data.merken[b.merk] || b.merk) + '</span>'
        + Object.keys(S.data.talen).map(function (tl) {
          return '<span class="badge badge-sm ' + (volledig(b, tl) ? 'badge-ghost' : 'badge-outline opacity-40') + '" title="' + esc(S.data.talen[tl] + (volledig(b, tl) ? '' : ': nog niet vertaald')) + '">' + esc(tl.toUpperCase()) + '</span>';
        }).join('')
        + (b.actief ? '<span class="badge badge-success badge-sm">klaar</span>' : '<span class="badge badge-warning badge-sm">concept</span>')
        + '</div></button>';
    });
    h += '</div>';
    el('opvBerLijst').innerHTML = h;
  }

  // ── Rechts: het bericht ────────────────────────────────────────────────────
  function opties(map, gekozen) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === gekozen ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
    }).join('');
  }

  function tekenEditor() {
    var doel = el('opvBerEditor');
    var b = S.concept;
    if (!b) {
      doel.innerHTML = '<div class="text-sm text-base-content/60 p-4 border border-dashed border-base-content/20 rounded-lg">Kies een bericht, of maak een nieuw.</div>';
      return;
    }
    var tokenOpties = S.data.tokens.map(function (t) { return '<option value="' + esc(t.pad) + '">' + esc(t.label) + '</option>'; }).join('');
    var groepOpties = '<option value=""' + (b.groep_id ? '' : ' selected') + '>Zonder groep</option>'
      + S.data.groepen.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === b.groep_id ? ' selected' : '') + '>' + esc(g.naam) + '</option>'; }).join('');
    doel.innerHTML = ''
      + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Naam (intern)</span><input class="input input-bordered input-sm" data-berveld="naam" value="' + esc(b.naam) + '" placeholder="Bijv. Ik probeerde je te bellen"></label>'
      + '<label class="form-control"><span class="label-text text-xs mb-1">Groep</span><select class="select select-bordered select-sm" data-berveld="groep_id">' + groepOpties + '</select></label>'
      + '<label class="form-control sm:col-span-2"><span class="label-text text-xs mb-1">Merk</span><select class="select select-bordered select-sm" data-berveld="merk">' + opties(S.data.merken, b.merk) + '</select>'
      + '<span class="text-xs text-base-content/50 mt-1">Een kans van Syndicoach krijgt enkel berichten van Syndicoach of van alle merken; idem voor OpenVME. Het merk bepaalt ook het afzenderadres (thomas@syndicoach.be of thomas@openvme.be).</span></label>'
      + '</div>'
      + '<label class="label cursor-pointer justify-start gap-2 mt-2"><input type="checkbox" class="toggle toggle-sm toggle-success" data-berveld="actief"' + (b.actief ? ' checked' : '') + '>'
      + '<span class="text-sm">Klaar voor gebruik</span><span class="text-xs text-base-content/50">(uit = concept)</span></label>'
      + '<div role="tablist" class="tabs tabs-boxed w-fit mt-3">' + Object.keys(S.data.talen).map(function (tl) {
          return '<button type="button" role="tab" class="tab' + (S.taal === tl ? ' tab-active' : '') + '" data-ber="taal" data-taal="' + esc(tl) + '">' + esc(S.data.talen[tl])
            + (tl !== STANDAARD && !volledig(b, tl) ? ' <span class="badge badge-warning badge-xs ml-1">leeg</span>' : '') + '</button>';
        }).join('') + '</div>'
      + (S.taal !== STANDAARD ? '<p class="text-xs text-base-content/60 mt-1">De taal van de contactpersoon in Odoo kiest de versie. Zonder vertaling krijgt hij de Nederlandse.</p>' : '')
      + '<label class="form-control mt-2"><span class="label-text text-xs mb-1">Onderwerp</span><input id="opvBerOnderwerp" class="input input-bordered input-sm" value="' + esc(versie(b, S.taal).onderwerp) + '" placeholder="' + (S.taal === STANDAARD ? 'Bijv. Ik probeerde je te bellen' : esc(b.onderwerp)) + '"></label>'
      + '<div class="flex items-center justify-between gap-2 mt-3 mb-1"><span class="label-text text-xs">Tekst</span>'
      + '<span class="flex items-center gap-1"><select id="opvBerToken" class="select select-bordered select-xs max-w-xs"><option value="">Gegeven invoegen…</option>' + tokenOpties + '</select>'
      + '<button type="button" class="btn btn-xs" data-ber="token">Invoegen</button></span></div>'
      + '<div id="opvBerQuill"></div>'
      + '<p class="text-xs text-base-content/60 mt-1">De handtekening van de verkoper (met foto) komt er vanzelf onder. Gegevens zoals de voornaam vullen zich in per kans. '
      + 'Een afspraaklink achter een woord: selecteer het woord en voeg <strong>Afspraaklink verkoper</strong> in.</p>'
      + '<div class="flex flex-wrap items-center gap-2 mt-4">'
      + '<button type="button" class="btn btn-primary btn-sm" data-ber="bewaar"' + (S.bezig ? ' disabled' : '') + '>Bewaren</button>'
      + (b.id ? '<button type="button" class="btn btn-ghost btn-sm text-error" data-ber="weg">Verwijderen</button>' : '')
      + '</div>'
      + '<div class="divider my-3"></div>'
      + '<div class="flex flex-wrap items-center gap-2 mb-2"><span class="text-sm font-medium">Voorbeeld</span>'
      + '<input id="opvBerKans" class="input input-bordered input-xs w-56" placeholder="Kansnummer of link uit Odoo (optioneel)">'
      + '<button type="button" class="btn btn-xs" data-ber="voorbeeld">Toon</button></div>'
      + '<div id="opvBerVoorbeeld" class="border border-base-content/10 rounded-lg bg-base-100 p-3 text-xs text-base-content/70">Zonder kans zie je het bericht met voorbeeldgegevens. Met een kans zie je het zoals die klant het zou krijgen, met de handtekening van de verkoper.</div>';

    S.quill = null;
    var host = el('opvBerQuill');
    if (host && window.EOQuill) {
      S.quill = window.EOQuill.create({
        target: host,
        initialHtml: versie(b, S.taal).tekst_html || '',
        placeholder: S.taal === STANDAARD ? 'Hoi {{contact.first_name}},' : 'Bonjour {{contact.first_name}},',
        toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'clean']],
      });
      if (S.quill) {
        var ed = host.querySelector('.ql-editor');
        if (ed) { ed.style.minHeight = '180px'; }
        S.quill.quill.on('selection-change', function (r) { if (r) S.laatsteVeld = 'tekst'; });
      }
    }
  }

  function teken(opties) {
    var doel = el('opvBerichten');
    if (!doel) return;
    if (S.fout) { doel.innerHTML = '<div class="alert alert-warning text-sm"><span>' + esc(S.fout) + '</span></div>'; return; }
    if (!S.data) { doel.innerHTML = '<span class="loading loading-spinner"></span>'; return; }
    if (!el('opvBerGroepen')) {
      doel.innerHTML = '<div class="flex flex-col lg:flex-row gap-5">'
        + '<aside id="opvBerGroepen" class="w-full lg:w-56 shrink-0"></aside>'
        + '<div class="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-5 gap-4">'
        + '<div id="opvBerLijst" class="md:col-span-2"></div><div id="opvBerEditor" class="md:col-span-3"></div></div></div>';
    }
    tekenGroepen();
    tekenLijst();
    // Het bericht enkel opnieuw tekenen als het verandert: anders gooit een
    // klik op een groep wat iemand aan het typen was weg.
    if (!opties || opties.editor !== false) tekenEditor();
    if (window.lucide) window.lucide.createIcons();
  }

  function leesEditor() {
    var b = S.concept;
    if (!b) return null;
    document.querySelectorAll('[data-berveld]').forEach(function (v) {
      b[v.dataset.berveld] = v.type === 'checkbox' ? v.checked : v.value;
    });
    // Onderwerp en tekst horen bij de taal van het open tabblad.
    var onderwerp = el('opvBerOnderwerp');
    if (onderwerp && S.quill) zetVersie(b, S.taal, { onderwerp: onderwerp.value, tekst_html: S.quill.getHTML() });
    return b;
  }

  // ── Acties ─────────────────────────────────────────────────────────────────
  async function laad() {
    if (S.data) { teken(); return; }
    teken();
    try { S.data = await api('/berichten'); S.fout = null; }
    catch (e) { S.fout = 'De berichten konden niet geladen worden: ' + e.message; }
    teken();
  }

  function kies(id) {
    var b = S.data.berichten.find(function (x) { return x.id === id; });
    if (!b) return;
    S.kies = id;
    S.concept = JSON.parse(JSON.stringify(b));
    S.taal = STANDAARD;
    teken();
  }

  function zetBericht(uit) {
    S.data.berichten = S.data.berichten.filter(function (x) { return x.id !== uit.id; }).concat([uit]);
  }

  async function bewaar() {
    var b = leesEditor();
    if (!b) return;
    S.bezig = true;
    try {
      var uit = await api(b.id ? '/berichten/' + encodeURIComponent(b.id) : '/berichten', { method: b.id ? 'PUT' : 'POST', body: JSON.stringify(b) });
      zetBericht(uit);
      S.kies = uit.id;
      S.concept = JSON.parse(JSON.stringify(uit));
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
      await api('/berichten/' + encodeURIComponent(b.id), { method: 'DELETE' });
      S.data.berichten = S.data.berichten.filter(function (x) { return x.id !== b.id; });
      S.kies = null; S.concept = null;
      showToast('Bericht verwijderd', 'success');
    } catch (e) { showToast('Verwijderen mislukt: ' + e.message, 'error'); }
    teken();
  }

  async function groepNieuw() {
    var naam = window.prompt('Naam van de nieuwe groep:');
    if (!naam || !naam.trim()) return;
    try {
      var g = await api('/bericht-groepen', { method: 'POST', body: JSON.stringify({ naam: naam.trim() }) });
      S.data.groepen.push(g);
      S.groep = g.id;
      showToast('Groep aangemaakt', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    teken({ editor: false });
  }

  async function groepHernoem(id) {
    var g = S.data.groepen.find(function (x) { return x.id === id; });
    if (!g) return;
    var naam = window.prompt('Nieuwe naam voor deze groep:', g.naam);
    if (!naam || !naam.trim() || naam.trim() === g.naam) return;
    try {
      await api('/bericht-groepen/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ naam: naam.trim() }) });
      g.naam = naam.trim();
      showToast('Groep hernoemd', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    leesEditor();
    teken();
  }

  async function groepWeg(id) {
    var g = S.data.groepen.find(function (x) { return x.id === id; });
    if (!g) return;
    if (!window.confirm('Groep "' + g.naam + '" verwijderen?\n\nDe berichten zelf blijven bestaan, zonder groep.')) return;
    try {
      await api('/bericht-groepen/' + encodeURIComponent(id), { method: 'DELETE' });
      S.data.groepen = S.data.groepen.filter(function (x) { return x.id !== id; });
      S.data.berichten.forEach(function (b) { if (b.groep_id === id) b.groep_id = null; });
      if (S.concept && S.concept.groep_id === id) S.concept.groep_id = null;
      if (S.groep === id) S.groep = null;
      showToast('Groep verwijderd', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    leesEditor();
    teken();
  }

  async function verplaats(id, groepId) {
    var b = S.data.berichten.find(function (x) { return x.id === id; });
    if (!b || (b.groep_id || null) === (groepId || null)) return;
    try {
      await api('/berichten/' + encodeURIComponent(id) + '/groep', { method: 'PUT', body: JSON.stringify({ groep_id: groepId || null }) });
      b.groep_id = groepId || null;
      if (S.concept && S.concept.id === id) { leesEditor(); S.concept.groep_id = b.groep_id; }
      showToast('Bericht verplaatst', 'success');
    } catch (e) { showToast('Verplaatsen mislukt: ' + e.message, 'error'); }
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
      var v = versie(b, S.taal);
      var r = await api('/berichten/voorbeeld', { method: 'POST', body: JSON.stringify({ onderwerp: v.onderwerp, tekst_html: v.tekst_html, taal: S.taal, kans: (el('opvBerKans') || {}).value || '' }) });
      var meld = '';
      if (r.kans) meld += '<div class="mb-2 text-base-content/70">Kans ' + esc(r.kans.id) + ': ' + esc(r.kans.naam) + '</div>';
      if (r.ontbreekt && r.ontbreekt.length) meld += '<div class="alert alert-warning py-1 px-2 text-xs mb-2"><span>Leeg voor deze kans: ' + esc(r.ontbreekt.join(', ')) + '</span></div>';
      if (r.melding) meld += '<div class="alert py-1 px-2 text-xs mb-2"><span>' + esc(r.melding) + '</span></div>';
      doel.classList.remove('text-base-content/70');
      doel.innerHTML = meld
        + '<div class="text-xs text-base-content/60 mb-2 pb-2 border-b border-base-content/10"><strong>Onderwerp:</strong> ' + esc(r.onderwerp) + '</div>'
        + '<div class="text-sm text-base-content">' + (r.html || '<span class="text-base-content/50">Nog geen tekst.</span>') + '</div>';
    } catch (e) {
      doel.innerHTML = '<span class="text-error">' + esc(e.message) + '</span>';
    }
  }

  // ── Luisteraars ────────────────────────────────────────────────────────────
  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.id === 'opvBerOnderwerp') S.laatsteVeld = 'onderwerp';
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-ber-stop]')) return; // het menu van een groep opent, de groep niet
    var k = e.target.closest('[data-ber]');
    if (!k || !S.data) return;
    var a = k.dataset.ber;
    if (a === 'groep') { S.groep = k.dataset.groep || null; teken({ editor: false }); }
    if (a === 'groep-nieuw') groepNieuw();
    if (a === 'groep-hernoem') groepHernoem(k.dataset.groep);
    if (a === 'groep-weg') groepWeg(k.dataset.groep);
    if (a === 'nieuw') { S.kies = null; S.concept = leeg(); S.taal = STANDAARD; teken(); }
    if (a === 'taal') { leesEditor(); S.taal = k.dataset.taal; teken(); }
    if (a === 'kies') kies(k.dataset.id);
    if (a === 'bewaar') bewaar();
    if (a === 'weg') weg();
    if (a === 'token') voegTokenIn();
    if (a === 'voorbeeld') voorbeeld();
  });
  // Slepen: een bericht uit de lijst op een groep links.
  document.addEventListener('dragstart', function (e) {
    var k = e.target.closest && e.target.closest('[data-ber="kies"]');
    if (k) e.dataTransfer.setData('text/plain', k.dataset.id);
  });
  document.addEventListener('dragover', function (e) {
    var z = e.target.closest && e.target.closest('[data-ber-drop]');
    if (!z) return;
    e.preventDefault();
    z.classList.add('bg-primary/20');
  });
  document.addEventListener('dragleave', function (e) {
    var z = e.target.closest && e.target.closest('[data-ber-drop]');
    if (z) z.classList.remove('bg-primary/20');
  });
  document.addEventListener('drop', function (e) {
    var z = e.target.closest && e.target.closest('[data-ber-drop]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('bg-primary/20');
    var id = e.dataTransfer.getData('text/plain');
    if (id) verplaats(id, z.dataset.berDrop || null);
  });

  window.OpvBerichten = { laad: laad };
})();
