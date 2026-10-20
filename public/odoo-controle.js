/**
 * Odoo-controle -- scherm.
 *
 * REGEL 3 uit claude.md: event handlers via data-attributen + één centrale
 * listener. Praat uitsluitend met /odoo-controle/api/*.
 *
 * Overgenomen gedrag van de claude.ai-pagina "Factuur-, abonnement- en
 * CRM-controle": cases per prioriteit met uitklapbare werkregels, filters,
 * patronen met regel en controle, drie Claude-functies (voorstel naast de
 * huidige tekst, de gebruiker kiest per veld), het skill-concept. Nieuw in de
 * OM: live nakijken in Odoo, historiek, en gelijktijdig werken.
 *
 * WAT JE TYPT, GAAT NOOIT VERLOREN (2026-10-20). Tot dan weigerde de server
 * een bewaring als iemand anders intussen iets aan de case wijzigde (409), en
 * gooide dit scherm de getypte tekst weg. Nu: elke tekst gaat mee met de
 * waarde waarop je begon te typen (`basis`), de server voegt samen als twee
 * mensen in hetzelfde veld schreven, een mislukte bewaring wordt opnieuw
 * geprobeerd, en tot de server ze heeft staat elke tekst als reservekopie in
 * localStorage (`oc-onbewaard`); bij het laden wordt die alsnog bewaard.
 *
 * De statusregel (statusVan) staat ook server-side in lib/constants.js:
 * wijzig je ze daar, wijzig ze hier mee.
 */

(function () {
  'use strict';

  var BASE = '/odoo-controle/api';
  var POLL_MS = 30000;

  var C = null;                 // constanten van de server (PRIO, DOMEIN, ...)
  var me = null;
  var cases = new Map(), patterns = new Map(), meta = {};
  var built = new Map();        // case-id -> article
  var dirty = new Map();        // case-id -> {veld: waarde} nog niet bewaard
  var timers = new Map(), chains = new Map();
  var patDirty = new Map(), patTimers = new Map(), patChains = new Map();
  var basisVan = new Map();     // 'case|id|veld' of 'pat|id|veld' -> waarde waarop het typen begon
  var BACKUP = 'oc-onbewaard';
  var reviews = new Map();      // 'case:id' | 'pat:id' -> {state, result, snapshot, accepted, error, conflict}
  var patSugg = new Map();      // case-id -> {state, hint, result, replace, error}
  var odooPanels = new Map();   // case-id -> {state, data, error, open}
  var histPanels = new Map();   // 'case:id' | 'pat:id' -> {state, rows}
  var open = new Set(load('oc-open', []));
  var filt = { status: 'todo', prio: '', domein: '', pat: '', soort: '', zeker: '', q: '' };
  var tab = 'cases';
  var since = null, pollTimer = null;
  var refIdx = new Map(), refRe = null;

  var PRIO_KLEUR = { dringend: 'text-error', hoog: 'text-warning', gemiddeld: 'text-accent', beslissen: 'text-info', laag: 'text-base-content/60' };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* geen opslag */ } }
  function zetBackup(soort, id, veld, waarde, basis) {
    var b = load(BACKUP, {}) || {}; b[soort + '|' + id + '|' + veld] = { soort: soort, id: id, veld: veld, waarde: waarde, basis: basis, tijd: Date.now() }; keep(BACKUP, b);
  }
  function wisBackup(soort, id, veld, waarde) {
    var b = load(BACKUP, {}) || {}, k = soort + '|' + id + '|' + veld;
    if (b[k] && b[k].waarde === waarde) { delete b[k]; keep(BACKUP, b); }
  }
  function basisVoor(soort, id, patch, eigen) {
    var uit = {};
    Object.keys(patch).forEach(function (k) {
      if (eigen && k in eigen) uit[k] = eigen[k];
      else if (basisVan.has(soort + '|' + id + '|' + k)) uit[k] = basisVan.get(soort + '|' + id + '|' + k);
    });
    return uit;
  }
  function lbl(lijst, v) { var x = lijst.find(function (y) { return y[0] === v; }); return x ? x[1] : (v || ''); }
  function prioVan(id) { return C.PRIO.find(function (p) { return p.id === id; }) || C.PRIO[C.PRIO.length - 1]; }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  function toast(bericht, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : soort === 'success' ? 'alert-success' : 'alert-info') + ' text-sm py-2 px-4';
    var span = document.createElement('span'); span.textContent = bericht; el.appendChild(span);
    $('toastContainer').appendChild(el);
    if (soort !== 'error') setTimeout(function () { el.remove(); }, 3000);
    else { el.style.cursor = 'pointer'; el.addEventListener('click', function () { el.remove(); }); setTimeout(function () { el.remove(); }, 12000); }
  }

  async function api(pad, opties) {
    var res = await fetch(BASE + pad, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opties || {}));
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) {
      var err = new Error(data.error || ('Fout ' + res.status));
      err.status = res.status; err.code = data.code || null; err.data = data;
      throw err;
    }
    return data;
  }

  function statusVan(c) {
    if (c.geen_fout) return 'geenfout';
    var n = (c.onderzocht ? 1 : 0) + (c.rechtgezet ? 1 : 0);
    if (n === 2) return 'opgelost';
    if (c.vasthouden) return 'wacht';
    return n ? 'bezig' : 'open';
  }
  function isDone(c) { var s = statusVan(c); return s === 'opgelost' || s === 'geenfout'; }
  function isTodo(c) { var s = statusVan(c); return s === 'open' || s === 'bezig'; }
  function stapLabel(c) { return c.in_openvme ? 'Rechtgezet in OpenVME' : 'Rechtgezet in Odoo'; }
  function patsOf(c) { return Array.isArray(c.patterns) ? c.patterns : []; }
  function sortedPatterns() { return Array.from(patterns.values()).sort(function (a, b) { return (a.nr || 99) - (b.nr || 99) || String(a.titel).localeCompare(String(b.titel)); }); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseDay(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayLabel(s) { try { return parseDay(s).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
  function daysFrom(s) { return Math.round((parseDay(s) - today()) / 864e5); }
  function timeLabel(iso) { try { return new Date(iso).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function odooUrl(r) { return C.ODOO_URL + '/web?debug=1#id=' + r.id + '&model=' + r.model + '&view_type=form'; }
  function caseChanged(c) { return !!c.tekst_bijgewerkt && (!c.geverifieerd || c.tekst_bijgewerkt > c.geverifieerd); }
  function patChanged(p) { return !!p.bijgewerkt && (!p.geverifieerd || p.bijgewerkt > p.geverifieerd); }

  // Documentnummers in teksten (S00514, CFVK/2025/00201, ...) worden links naar Odoo in debugmodus.
  function buildRefIndex() {
    refIdx = new Map();
    cases.forEach(function (c) { (c.refs || []).forEach(function (r) { if (r && r.label && r.id && /\d/.test(r.label) && r.label.length >= 5 && !refIdx.has(r.label)) refIdx.set(r.label, r); }); });
    var keys = Array.from(refIdx.keys()).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    refRe = keys.length ? new RegExp('(^|[^\\w/])(' + keys.join('|') + ')(?![\\w/])', 'g') : null;
  }
  function linkHtml(str) {
    str = str || '';
    if (!refRe || !str) return esc(str);
    var out = '', last = 0, m; refRe.lastIndex = 0;
    while ((m = refRe.exec(str))) {
      var start = m.index + m[1].length, r = refIdx.get(m[2]);
      out += esc(str.slice(last, start));
      out += '<a href="' + esc(odooUrl(r)) + '" target="_blank" rel="noopener" title="Open ' + esc(C.MODEL_LABEL[r.model] || r.model) + ' in Odoo (debug)">' + esc(m[2]) + '</a>';
      last = start + m[2].length;
    }
    return out + esc(str.slice(last));
  }

  function errText(e) {
    switch (e && e.code) {
      case 'AI_RATE_LIMIT_PLATFORM': case 'AI_RATE_LIMIT_APP': case 'AI_PROVIDER_RATE_LIMITED': return 'Even te veel vragen na elkaar, of de daglimiet is bereikt. Probeer later opnieuw.';
      case 'AI_NOT_CONFIGURED': return 'Claude is in de OM niet ingesteld. Vraag Nico.';
      case 'AI_REFUSED': return 'Claude weigerde deze vraag.';
      case 'AI_STALLED': case 'AI_PROVIDER_TIMEOUT': return 'Claude antwoordde niet meer. Probeer opnieuw.';
      case 'AI_TRUNCATED': return 'Het antwoord was te lang en werd afgekapt. Probeer opnieuw.';
      default: return (e && e.message) ? 'Er liep iets mis bij Claude: ' + e.message : 'Er liep iets mis bij Claude. Probeer opnieuw.';
    }
  }

  // ── Opslag (cases) ─────────────────────────────────────────────────────────

  function applyCase(row) {
    if (!row || !row.id) return;
    var huidig = cases.get(row.id);
    if (huidig && row.versie < huidig.versie) return;   // ouder dan wat we al hebben
    cases.set(row.id, row);
  }

  function chain(map, id, werk) {
    var prev = map.get(id) || Promise.resolve();
    var next = prev.then(werk, werk);
    map.set(id, next);
    return next;
  }

  /** Een wijziging aan een case bewaren. `patch` is al lokaal toegepast door de aanroeper. */
  function saveCase(id, patch, opts) {
    opts = opts || {};
    var basis = basisVoor('case', id, patch, opts.basis);
    return chain(chains, id, function () {
      var c = cases.get(id); if (!c) return;
      return api('/cases/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ patch: patch, basis: basis, expected: c.versie, bron: opts.bron || 'gebruiker' }) })
        .then(function (res) {
          var row = res.data, d = dirty.get(id);
          applyCase(row);
          Object.keys(patch).forEach(function (k) {
            var bk = 'case|' + id + '|' + k;
            if (d && k in d && d[k] === patch[k]) { delete d[k]; basisVan.delete(bk); }
            else if (d && k in d) basisVan.set(bk, patch[k]);   // nog aan het typen: verder op wat net bewaard is
            else basisVan.delete(bk);
            if (typeof patch[k] === 'string') wisBackup('case', id, k, patch[k]);
          });
          if (d && !Object.keys(d).length) dirty.delete(id);
          fill(id); refreshCounts();
          if (row.samengevoegd && row.samengevoegd.length) toast('Iemand anders schreef tegelijk in hetzelfde veld. Beide teksten staan er nu in; kijk ze even na.', 'info');
          else if (opts.msg) toast(opts.msg, 'success');
        }, function (err) {
          // Nooit iets weggooien: de tekst blijft staan (en in de reservekopie) en we proberen opnieuw.
          var opnieuw = !err.status || err.status >= 500 || err.status === 409 || err.status === 429;
          toast('Nog niet bewaard: ' + err.message + (opnieuw ? ' Je tekst blijft staan; ik probeer het zo opnieuw.' : ' Je tekst blijft staan.'), 'error');
          if (opnieuw) setTimeout(function () { saveCase(id, patch, opts); }, 5000);
        });
    });
  }

  function queueText(id, veld, waarde) {
    var d = dirty.get(id) || {}, bk = 'case|' + id + '|' + veld;
    if (!(veld in d) && !basisVan.has(bk)) { var cb = cases.get(id); basisVan.set(bk, (cb && cb[veld]) || ''); }
    d[veld] = waarde; dirty.set(id, d);
    zetBackup('case', id, veld, waarde, basisVan.get(bk));
    paintSaved(id);
    var key = id + '|' + veld;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(function () { timers.delete(key); var p = {}; p[veld] = waarde; saveCase(id, p); }, 900));
  }
  function flushText(id, veld, waarde) {
    var key = id + '|' + veld;
    if (!timers.has(key)) return;
    clearTimeout(timers.get(key)); timers.delete(key);
    var c = cases.get(id); if (c && (c[veld] || '') === waarde) { var d = dirty.get(id); if (d) delete d[veld]; basisVan.delete('case|' + id + '|' + veld); wisBackup('case', id, veld, waarde); paintSaved(id); return; }
    var p = {}; p[veld] = waarde; saveCase(id, p);
  }
  function flushAllText(id) {
    C.CASE_TEKSTEN.forEach(function (f) { var ta = $('tx-' + f[0] + '-' + id); if (ta) flushText(id, f[0], ta.value); });
  }

  function setPats(id, lijst, msg) {
    var c = cases.get(id); if (!c) return Promise.resolve();
    lijst = lijst.filter(function (x, i) { return x && lijst.indexOf(x) === i; });
    c.patterns = lijst; fill(id); applyFilters(); refreshCounts();
    return saveCase(id, { patterns: lijst }, { msg: msg });
  }

  // ── Opslag (patronen) ──────────────────────────────────────────────────────

  function applyPattern(row) {
    if (!row || !row.id) return;
    var huidig = patterns.get(row.id);
    if (huidig && row.versie < huidig.versie) return;
    patterns.set(row.id, row);
  }

  function savePattern(id, patch, opts) {
    opts = opts || {};
    var basis = basisVoor('pat', id, patch, opts.basis);
    return chain(patChains, id, function () {
      var p = patterns.get(id); if (!p) return;
      return api('/patterns/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ patch: patch, basis: basis, expected: p.versie, bron: opts.bron || 'gebruiker' }) })
        .then(function (res) {
          var row = res.data, d = patDirty.get(id);
          applyPattern(row);
          Object.keys(patch).forEach(function (k) {
            var bk = 'pat|' + id + '|' + k;
            if (d && k in d && d[k] === patch[k]) { delete d[k]; basisVan.delete(bk); }
            else if (d && k in d) basisVan.set(bk, patch[k]);
            else basisVan.delete(bk);
            if (typeof patch[k] === 'string') wisBackup('pat', id, k, patch[k]);
          });
          if (d && !Object.keys(d).length) patDirty.delete(id);
          repaintPattern(id); built.forEach(function (el, cid) { if (patsOf(cases.get(cid) || {}).indexOf(id) >= 0) fill(cid); });
          if (row.samengevoegd && row.samengevoegd.length) toast('Iemand anders schreef tegelijk in hetzelfde veld. Beide teksten staan er nu in; kijk ze even na.', 'info');
          else if (opts.msg) toast(opts.msg, 'success');
        }, function (err) {
          var opnieuw = !err.status || err.status >= 500 || err.status === 409 || err.status === 429;
          toast('Nog niet bewaard: ' + err.message + (opnieuw ? ' Je tekst blijft staan; ik probeer het zo opnieuw.' : ' Je tekst blijft staan.'), 'error');
          if (opnieuw) setTimeout(function () { savePattern(id, patch, opts); }, 5000);
        });
    });
  }
  function queuePatText(id, veld, waarde) {
    var d = patDirty.get(id) || {}, bk = 'pat|' + id + '|' + veld;
    if (!(veld in d) && !basisVan.has(bk)) { var pb = patterns.get(id); basisVan.set(bk, (pb && pb[veld]) || ''); }
    d[veld] = waarde; patDirty.set(id, d);
    zetBackup('pat', id, veld, waarde, basisVan.get(bk));
    var key = id + '|' + veld;
    clearTimeout(patTimers.get(key));
    patTimers.set(key, setTimeout(function () { patTimers.delete(key); var p = {}; p[veld] = waarde; savePattern(id, p); }, 1000));
  }
  function flushPatText(id) {
    C.PATROON_TEKSTEN.forEach(function (f) {
      var key = id + '|' + f[0], ta = $('p-' + f[0] + '-' + id), p = patterns.get(id);
      if (patTimers.has(key)) { clearTimeout(patTimers.get(key)); patTimers.delete(key); }
      if (ta && p && ta.value !== (p[f[0]] || '')) { var x = {}; x[f[0]] = ta.value; savePattern(id, x); }
    });
  }

  // ── Een case tekenen ───────────────────────────────────────────────────────

  function build(id) {
    var c = cases.get(id);
    var el = document.createElement('article');
    el.className = 'oc-case p-' + esc(c.prio); el.dataset.id = id;
    var stepsHtml = [['onderzocht', 'Onderzocht: oorzaak gevonden'], ['rechtgezet', stapLabel(c)]].map(function (s) {
      return '<label class="label cursor-pointer justify-start gap-3 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-change="vinkje" data-id="' + id + '" data-veld="' + s[0] + '"><span class="label-text" data-part="stap-' + s[0] + '">' + esc(s[1]) + '</span></label>';
    }).join('');
    var flagsHtml = '<label class="label cursor-pointer justify-start gap-3 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-change="vinkje" data-id="' + id + '" data-veld="in_openvme"><span class="label-text">Fout wordt in OpenVME opgelost, niet in Odoo</span></label>'
      + '<label class="label cursor-pointer justify-start gap-3 py-1 items-start"><input type="checkbox" class="checkbox checkbox-sm mt-0.5" data-change="vinkje" data-id="' + id + '" data-veld="vasthouden"><span class="label-text">Even vasthouden: wacht op goedkeuring<span class="block text-xs opacity-60">Noteer bij Opmerkingen waarop of op wie.</span></span></label>'
      + '<label class="label cursor-pointer justify-start gap-3 py-1 mt-1 border-t border-base-content/10"><input type="checkbox" class="checkbox checkbox-sm" data-change="vinkje" data-id="' + id + '" data-veld="geen_fout"><span class="label-text">Geen fout: dit is bewust zo</span></label>';
    var textsHtml = C.CASE_TEKSTEN.map(function (f) {
      return '<label class="form-control w-full"><div class="label py-1"><span class="label-text text-xs font-medium">' + esc(f[1]) + '</span></div>'
        + '<textarea id="tx-' + f[0] + '-' + id + '" class="textarea textarea-bordered textarea-sm w-full leading-snug" rows="2" placeholder="' + esc(f[2]) + '" data-input="tekst" data-id="' + id + '" data-veld="' + f[0] + '"></textarea></label>';
    }).join('');
    el.innerHTML =
      '<button type="button" class="oc-row w-full text-left grid gap-x-3 gap-y-1 px-4 py-3 items-start" style="grid-template-columns: 20px 34px minmax(0,1fr) auto;" data-action="toggle" data-id="' + id + '" aria-expanded="false">'
      + '<span class="oc-st" data-part="st"></span>'
      + '<span class="font-mono text-xs opacity-60 pt-0.5">#' + esc(c.nr) + '</span>'
      + '<span class="min-w-0"><span class="font-semibold" data-part="klant"></span> <span class="text-xs opacity-60" data-part="ktype"></span><div class="text-sm opacity-85" data-part="titel"></div></span>'
      + '<span class="flex flex-col items-end gap-1 text-right"><span class="font-mono text-xs" data-part="bedrag"></span><span class="badge badge-sm" data-part="when"></span>'
      + '<span class="flex flex-wrap justify-end gap-1" data-part="tags"></span></span>'
      + '</button>'
      + '<div class="hidden px-4 pb-4 pt-1 border-t border-base-content/10" data-part="body">'
      + '  <div class="grid gap-4 lg:grid-cols-2 mt-3">'
      + '    <div class="space-y-3 text-sm">'
      + '      <p class="text-xs opacity-60" data-part="zkline"></p>'
      + '      <div><div class="text-xs uppercase tracking-wider opacity-60 mb-1">Bevinding</div><p class="oc-tekst" data-part="bevinding"></p></div>'
      + '      <div><div class="text-xs uppercase tracking-wider opacity-60 mb-1">Voorstel</div><p class="oc-tekst" data-part="voorstel"></p></div>'
      + '      <div><div class="text-xs uppercase tracking-wider opacity-60 mb-1">In Odoo</div><div class="flex flex-wrap gap-1.5" data-part="refs"></div>'
      + '        <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn btn-outline btn-xs" data-action="odoo" data-id="' + id + '"><i data-lucide="search" class="w-3.5 h-3.5"></i> Nakijken in Odoo</button>'
      + '        <button type="button" class="btn btn-ghost btn-xs" data-action="history" data-kind="case" data-id="' + id + '"><i data-lucide="history" class="w-3.5 h-3.5"></i> Historiek</button>'
      + '        <button type="button" class="btn btn-outline btn-xs" data-action="task-new" data-id="' + id + '"><i data-lucide="list-plus" class="w-3.5 h-3.5"></i> Taak maken</button></div>'
      + '        <div data-part="taken"></div><div data-part="odoo"></div><div data-part="hist"></div></div>'
      + '      <div class="rounded-lg bg-base-200 p-3 space-y-2" data-part="patrule"></div>'
      + '    </div>'
      + '    <fieldset class="space-y-3" data-part="fs">'
      + '      <div class="rounded-lg border border-base-content/10 p-3">' + stepsHtml + flagsHtml + '</div>'
      + '      <div class="form-control w-full"><div class="label py-1"><span class="label-text text-xs font-medium">Oorzaken (patronen)</span></div>'
      + '        <div class="flex flex-wrap gap-1.5 mb-1.5" data-part="pchips"></div>'
      + '        <select class="select select-bordered select-sm w-full" data-change="add-pat" data-id="' + id + '" data-part="patsel"></select>'
      + '        <button type="button" class="btn btn-link btn-xs justify-start px-0 h-auto min-h-0 mt-1 normal-case" data-action="pat-search" data-id="' + id + '">Laat Claude een (bijkomend) patroon zoeken of een nieuw maken</button>'
      + '        <div data-part="patpanel"></div></div>'
      + '      <label class="form-control w-full"><div class="label py-1"><span class="label-text text-xs font-medium">Soort fout</span></div>'
      + '        <select class="select select-bordered select-sm w-full" data-change="soort" data-id="' + id + '" data-part="soort">' + C.SOORT.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</select></label>'
      + textsHtml
      + '      <div class="text-xs opacity-60 flex items-center gap-2" data-part="saved"></div>'
      + '      <div class="flex flex-wrap items-center gap-2" data-part="tools"></div>'
      + '      <div data-part="rev"></div>'
      + '    </fieldset>'
      + '  </div>'
      + '</div>';
    built.set(id, el);
    fill(id);
    if (open.has(id)) setOpen(id, true);
    return el;
  }

  function part(el, naam) { return el.querySelector('[data-part="' + naam + '"]'); }

  function fill(id) {
    var el = built.get(id), c = cases.get(id); if (!el || !c) return;
    var st = statusVan(c), act = document.activeElement, d = dirty.get(id) || {};
    var verborgen = el.classList.contains('hidden');
    el.className = 'oc-case p-' + esc(c.prio) + (verborgen ? ' hidden' : '');
    part(el, 'st').className = 'oc-st ' + st; part(el, 'st').title = 'Status: ' + C.STATUS[st];
    part(el, 'klant').textContent = c.klant || ''; part(el, 'ktype').textContent = c.klanttype || '';
    part(el, 'titel').textContent = c.titel || '';
    part(el, 'bedrag').textContent = c.bedrag || '';
    var when = part(el, 'when'), dl = c.deadline || c.vervaldag;
    if (dl) {
      var n = daysFrom(dl);
      if (c.deadline) { when.textContent = n >= 0 ? 'nog ' + n + ' d (' + dayLabel(dl) + ')' : (-n) + ' d te laat'; when.className = 'badge badge-sm ' + (n < 0 ? 'badge-error' : n <= 30 ? 'badge-warning' : 'badge-ghost'); }
      else { when.textContent = n < 0 ? (-n) + ' d over vervaldag' : 'vervalt ' + dayLabel(dl); when.className = 'badge badge-sm ' + (n < -30 ? 'badge-error' : n < 0 ? 'badge-warning' : 'badge-ghost'); }
      when.classList.remove('hidden');
    } else when.classList.add('hidden');
    var tags = [];
    if (st === 'wacht') tags.push('<span class="badge badge-sm badge-info badge-outline">wacht op goedkeuring</span>');
    if (c.in_openvme) tags.push('<span class="badge badge-sm badge-primary badge-outline">oplossen in OpenVME</span>');
    if (c.domein) tags.push('<span class="badge badge-sm badge-ghost">' + esc(lbl(C.DOMEIN, c.domein)) + '</span>');
    if (c.categorie) tags.push('<span class="badge badge-sm badge-ghost">' + esc(c.categorie) + '</span>');
    if (c.zekerheid && c.zekerheid !== 'zeker') tags.push('<span class="badge badge-sm ' + (c.zekerheid === 'waarschijnlijk' ? 'badge-warning badge-outline' : 'badge-info badge-outline') + '" title="' + esc(lbl(C.ZEKER, c.zekerheid)) + '">' + esc(c.zekerheid) + '</span>');
    part(el, 'tags').innerHTML = tags.join('');
    part(el, 'zkline').textContent = [lbl(C.DOMEIN, c.domein), lbl(C.ZEKER, c.zekerheid)].filter(Boolean).join(' · ');
    part(el, 'bevinding').innerHTML = linkHtml(c.bevinding); part(el, 'voorstel').innerHTML = linkHtml(c.voorstel);
    part(el, 'refs').innerHTML = (c.refs || []).map(function (r) {
      return '<a class="badge badge-outline gap-1 hover:badge-primary" href="' + esc(odooUrl(r)) + '" target="_blank" rel="noopener" title="Open in Odoo (debug)"><span class="opacity-60">' + esc(C.MODEL_LABEL[r.model] || r.model) + '</span><span class="font-mono">' + esc(r.label) + '</span></a>';
    }).join('') || '<span class="text-xs opacity-50">geen</span>';
    paintPatRule(part(el, 'patrule'), c);
    part(el, 'stap-rechtgezet').textContent = stapLabel(c);
    el.querySelectorAll('input[data-change="vinkje"]').forEach(function (cb) { if (cb !== act) cb.checked = !!c[cb.dataset.veld]; });
    var mine = patsOf(c);
    part(el, 'pchips').innerHTML = mine.length ? mine.map(function (pid) {
      var pp = patterns.get(pid);
      return '<span class="badge badge-outline gap-1 h-auto py-1 whitespace-normal text-left"><span>' + esc(pp ? pp.titel : pid) + '</span><button type="button" class="opacity-60 hover:opacity-100" title="Weghalen uit deze case" aria-label="Patroon weghalen" data-action="remove-pat" data-id="' + id + '" data-pid="' + esc(pid) + '">×</button></span>';
    }).join('') : '<span class="text-xs opacity-50">Nog geen patroon</span>';
    var sel = part(el, 'patsel');
    if (sel !== act) {
      sel.innerHTML = '<option value="">' + (mine.length ? '+ Nog een patroon toevoegen…' : '+ Patroon kiezen…') + '</option>'
        + sortedPatterns().filter(function (pp) { return mine.indexOf(pp.id) < 0; }).map(function (pp) { return '<option value="' + esc(pp.id) + '">' + esc(pp.titel) + '</option>'; }).join('');
      sel.value = '';
    }
    var so = part(el, 'soort'); if (so !== act) so.value = c.soort || 'onbekend';
    C.CASE_TEKSTEN.forEach(function (f) {
      var ta = $('tx-' + f[0] + '-' + id); if (!ta) return;
      var w = f[0] in d ? d[f[0]] : (c[f[0]] || '');
      if (ta.value !== w && (ta !== act || !(f[0] in d))) ta.value = w;
    });
    paintSaved(id);
    paintTools(id);
    paintReview('case:' + id);
    paintPatSugg(id);
    icons();
  }

  function paintPatRule(el, c) {
    var ps = patsOf(c).map(function (x) { return patterns.get(x); }).filter(Boolean);
    if (!ps.length) {
      el.innerHTML = '<div class="text-xs uppercase tracking-wider opacity-60">Regel</div><p class="text-sm opacity-60 italic">Deze case hangt nog aan geen patroon. Kies rechts een of meer patronen; dan gelden hun regels.</p>';
      return;
    }
    el.innerHTML = ps.map(function (p, i) {
      return (i ? '<hr class="border-0 border-t border-base-content/10 my-1">' : '')
        + '<div class="text-xs uppercase tracking-wider opacity-60">' + (ps.length > 1 ? 'Regel van patroon ' + (i + 1) + ': ' : 'Regel van het patroon: ') + esc(p.titel) + '</div>'
        + (p.regel ? '<p class="text-sm oc-tekst">' + linkHtml(p.regel) + '</p>' : '<p class="text-sm opacity-60 italic">Nog geen regel. Laat Claude ze opstellen bij het patroon.</p>')
        + (p.controle ? '<div class="text-xs uppercase tracking-wider opacity-60 mt-1">Controle</div><p class="text-sm oc-tekst">' + linkHtml(p.controle) + '</p>' : '')
        + '<button type="button" class="btn btn-link btn-xs px-0 h-auto min-h-0 normal-case" data-action="go-pattern" data-pid="' + esc(p.id) + '">' + (p.regel ? 'Regel bijsturen bij het patroon' : 'Regel opstellen bij het patroon') + '</button>';
    }).join('');
  }

  function paintSaved(id) {
    var el = built.get(id), c = cases.get(id); if (!el || !c) return;
    var box = part(el, 'saved'), d = dirty.get(id) || {};
    if (Object.keys(d).length) { box.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Bewaren…'; return; }
    if (!c.bijgewerkt) { box.textContent = 'Nog niet behandeld.'; return; }
    box.textContent = 'Laatst bijgewerkt' + (c.door_naam ? ' door ' + (me && c.door_user_id === me.id ? 'jou' : c.door_naam) : '') + ', ' + timeLabel(c.bijgewerkt);
  }

  function paintTools(id) {
    var el = built.get(id), c = cases.get(id); if (!el || !c) return;
    var key = 'case:' + id, st = reviews.get(key), busy = st && st.state === 'busy';
    var hasText = C.CASE_TEKSTEN.some(function (f) { return (c[f[0]] || '').trim(); });
    var tag = caseChanged(c) ? '<span class="badge badge-sm badge-warning badge-outline">Nog niet geverifieerd</span>'
      : c.geverifieerd ? '<span class="badge badge-sm badge-success badge-outline">Geverifieerd ' + esc(timeLabel(c.geverifieerd)) + '</span>' : '';
    part(el, 'tools').innerHTML =
      '<button type="button" class="btn btn-sm ' + (caseChanged(c) ? 'btn-primary' : 'btn-outline') + '" data-action="review" data-key="' + key + '"' + (busy ? ' disabled' : '')
      + ' title="Claude toetst wat er gebeurde, wat jullie deden en de les aan de bevinding, de Odoo-referenties en de regel van het patroon, en herschrijft waar nodig.">'
      + (busy ? '<span class="loading loading-spinner loading-xs"></span> Claude is bezig…' : '<i data-lucide="sparkles" class="w-4 h-4"></i> Verifieer en herschrijf') + '</button>'
      + '<label class="label cursor-pointer gap-2 py-0"><input type="checkbox" class="checkbox checkbox-xs" id="odoo-' + id + '"><span class="label-text text-xs">met de live chatter uit Odoo</span></label>'
      + (hasText ? tag : '<span class="text-xs opacity-60">Vul eerst in wat er gebeurde of wat je deed.</span>');
  }

  function setOpen(id, on) {
    var el = built.get(id); if (!el) return;
    part(el, 'body').classList.toggle('hidden', !on);
    el.querySelector('.oc-row').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) open.add(id); else open.delete(id);
    keep('oc-open', Array.from(open));
    if (on) { if (takenVan.has(id)) paintTaken(id); else loadTaken(id); }
  }

  // ── Taken in Projecten (bij de persoonlijke doelen van wie ze krijgt) ──────

  var takenVan = new Map(), personenLijst = null, taakCase = null;
  function loadTaken(id) {
    takenVan.set(id, { state: 'busy', rows: [] });
    api('/cases/' + encodeURIComponent(id) + '/taken').then(function (res) { takenVan.set(id, { state: 'done', rows: res.data }); },
      function () { takenVan.set(id, { state: 'error', rows: [] }); }).then(function () { paintTaken(id); });
  }
  function paintTaken(id) {
    var el = built.get(id); if (!el) return;
    var box = part(el, 'taken'), st = takenVan.get(id);
    if (!st || !st.rows.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="mt-2 space-y-1"><div class="text-xs uppercase tracking-wider opacity-60">Taken in Projecten</div>' + st.rows.map(function (t) {
      return '<a class="flex flex-wrap items-center gap-x-2 text-xs link link-hover" href="' + esc(t.url) + '" target="_blank" rel="noopener">'
        + '<i data-lucide="' + (t.done ? 'check-circle-2' : 'circle') + '" class="w-3.5 h-3.5 ' + (t.done ? 'text-success' : 'opacity-60') + '"></i>'
        + '<span class="' + (t.done ? 'line-through opacity-60' : '') + '">' + esc(t.title) + '</span>'
        + '<span class="opacity-60">' + esc([t.assignee_naam, t.due_date ? 'tegen ' + dayLabel(t.due_date) : ''].filter(Boolean).join(' · ')) + '</span></a>';
    }).join('') + '</div>';
    icons();
  }
  function openTaak(id) {
    var c = cases.get(id); if (!c) return;
    taakCase = id;
    $('tk-error').classList.add('hidden');
    $('tk-case').textContent = '#' + c.nr + ' ' + (c.klant || '') + (c.titel ? ' – ' + c.titel : '');
    $('tk-titel').value = 'Odoo-controle #' + c.nr + ': ' + (c.klant || '') + (c.titel ? ' – ' + c.titel : '');
    $('tk-notitie').value = '';
    var dl = c.deadline || c.vervaldag || '';
    $('tk-due').value = dl && daysFrom(dl) >= 0 ? String(dl).slice(0, 10) : '';
    var vul = function () {
      $('tk-wie').innerHTML = '<option value="">Kies een collega…</option>' + personenLijst.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.naam) + (m.functie ? ' – ' + esc(m.functie) : '') + '</option>'; }).join('');
      if (me && personenLijst.some(function (m) { return m.id === me.id; })) $('tk-wie').value = me.id;
    };
    if (personenLijst) vul();
    else {
      $('tk-wie').innerHTML = '<option value="">Laden…</option>';
      api('/mensen').then(function (res) { personenLijst = res.data; vul(); }, function (e) { $('tk-wie').innerHTML = '<option value="">De collega\'s konden niet geladen worden</option>'; toast(e.message, 'error'); });
    }
    $('taskModal').showModal();
  }
  function saveTaak() {
    var id = taakCase, err = $('tk-error'), body = {
      assignee_id: $('tk-wie').value, due_date: $('tk-due').value || null, titel: $('tk-titel').value.trim(), notitie: $('tk-notitie').value.trim(),
    };
    if (!body.assignee_id) { err.textContent = 'Kies voor wie de taak is.'; err.classList.remove('hidden'); return; }
    var btn = $('tk-save'); btn.disabled = true;
    api('/cases/' + encodeURIComponent(id) + '/taken', { method: 'POST', body: JSON.stringify(body) }).then(function (res) {
      $('taskModal').close();
      var st = takenVan.get(id) || { state: 'done', rows: [] }; st.rows = st.rows.concat([res.data]); takenVan.set(id, st); paintTaken(id);
      toast('Taak gemaakt bij ' + (res.data.project_name || 'Projecten'), 'success');
    }, function (e) { err.textContent = e.message; err.classList.remove('hidden'); }).then(function () { btn.disabled = false; });
  }

  // ── Lijst, filters, tellers ────────────────────────────────────────────────

  var secs = {};
  function layout() {
    var list = $('caseList');
    if (!Object.keys(secs).length) {
      C.PRIO.forEach(function (p) {
        var sec = document.createElement('section');
        sec.className = 'mb-6'; sec.setAttribute('aria-label', p.label);
        sec.innerHTML = '<div class="flex items-baseline gap-2 mb-2 px-1"><h2 class="text-base font-semibold ' + PRIO_KLEUR[p.id] + '">' + esc(p.label) + '</h2><span class="font-mono text-xs opacity-60" data-part="cnt"></span><span class="text-xs opacity-60">' + esc(p.why) + '</span></div>'
          + '<div class="card bg-base-100 border border-base-content/10 overflow-hidden"><div class="oc-lijnen" data-part="list"></div></div>';
        secs[p.id] = { sec: sec, list: part(sec, 'list'), cnt: part(sec, 'cnt') };
        list.appendChild(sec);
      });
    }
    var ids = Array.from(cases.keys()).sort(function (a, b) { var x = cases.get(a), y = cases.get(b); return (x.prio_rang - y.prio_rang) || (x.nr - y.nr); });
    ids.forEach(function (id) {
      var c = cases.get(id), s = secs[c.prio] || secs.laag;
      var el = built.get(id) || build(id);
      s.list.appendChild(el);
    });
    built.forEach(function (el, id) { if (!cases.has(id)) { el.remove(); built.delete(id); } });
    applyFilters(); refreshCounts();
  }

  function matches(c) {
    var st = statusVan(c);
    if (filt.status === 'todo' && !(st === 'open' || st === 'bezig')) return false;
    if (filt.status === 'wacht' && st !== 'wacht') return false;
    if (filt.status === 'done' && !(st === 'opgelost' || st === 'geenfout')) return false;
    if (filt.prio && c.prio !== filt.prio) return false;
    if (filt.domein && c.domein !== filt.domein) return false;
    if (filt.pat === 'geen' ? patsOf(c).length : (filt.pat && patsOf(c).indexOf(filt.pat) < 0)) return false;
    if (filt.soort && (c.soort || 'onbekend') !== filt.soort) return false;
    if (filt.zeker && c.zekerheid !== filt.zeker) return false;
    if (filt.q) {
      var hay = [c.klant, c.klanttype, c.titel, c.categorie, c.bevinding, c.voorstel, c.wat_gebeurde, c.actie, c.complicaties, c.les, c.bedrag, '#' + c.nr]
        .concat((c.refs || []).map(function (r) { return r.label; })).join(' ').toLowerCase();
      if (hay.indexOf(filt.q) < 0) return false;
    }
    return true;
  }

  function applyFilters() {
    var shown = 0, perPrio = {};
    built.forEach(function (el, id) {
      var c = cases.get(id), on = !!c && matches(c);
      el.classList.toggle('hidden', !on);
      if (on) { shown++; perPrio[c.prio] = (perPrio[c.prio] || 0) + 1; }
    });
    Object.keys(secs).forEach(function (k) { secs[k].sec.classList.toggle('hidden', !perPrio[k]); secs[k].cnt.textContent = perPrio[k] ? String(perPrio[k]) : ''; });
    var empty = $('caseEmpty');
    if (!cases.size) { empty.classList.remove('hidden'); $('caseEmptyText').textContent = 'Nog geen cases. Voeg er een toe, of laad de export van de oude pagina (tabblad Skill-concept, onderaan).'; }
    else if (!shown) { empty.classList.remove('hidden'); $('caseEmptyText').textContent = 'Geen cases die aan deze filters voldoen.'; }
    else empty.classList.add('hidden');
  }

  function refreshCounts() {
    var all = Array.from(cases.values()), n = { open: 0, bezig: 0, wacht: 0, opgelost: 0, geenfout: 0 }, perPrio = {};
    all.forEach(function (c) { var s = statusVan(c); n[s]++; if (s === 'open' || s === 'bezig') perPrio[c.prio] = (perPrio[c.prio] || 0) + 1; });
    var tot = all.length, done = n.opgelost + n.geenfout;
    $('tc-cases').textContent = tot ? (tot - done) + ' open' : ''; $('tc-cases').classList.toggle('hidden', !tot);
    $('tc-patronen').textContent = patterns.size ? String(patterns.size) : ''; $('tc-patronen').classList.toggle('hidden', !patterns.size);
    var stats = $('stats');
    if (!tot) { stats.innerHTML = '<span class="text-sm opacity-60">Nog geen cases.</span>'; renderFilterChips(); return; }
    var dr = perPrio.dringend || 0;
    var opn = all.filter(isTodo), fin = opn.filter(function (c) { return c.domein === 'facturatie' || c.domein === 'abonnement'; }).length;
    var seg = function (v, cls) { return '<div class="h-full ' + cls + '" style="width:' + (v / tot * 100) + '%"></div>'; };
    var leg = function (cls, t) { return '<span class="inline-flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-sm ' + cls + '"></span>' + esc(t) + '</span>'; };
    stats.innerHTML =
      '<div><div class="text-2xl font-semibold tabular-nums leading-none">' + done + ' / ' + tot + '</div><div class="text-xs opacity-60 mt-1">afgehandeld</div></div>'
      + '<div><div class="text-2xl font-semibold tabular-nums leading-none ' + (dr ? 'text-error' : '') + '">' + dr + '</div><div class="text-xs opacity-60 mt-1">dringend nog open</div></div>'
      + '<div><div class="text-2xl font-semibold tabular-nums leading-none">' + fin + ' · ' + (opn.length - fin) + '</div><div class="text-xs opacity-60 mt-1">open: facturen en abonnementen · bedrijven en leads</div></div>'
      + '<div class="flex-1 min-w-[16rem]"><div class="flex h-2.5 rounded-full overflow-hidden bg-base-content/10" role="img" aria-label="' + n.opgelost + ' opgelost, ' + n.geenfout + ' geen fout, ' + n.wacht + ' wacht op goedkeuring, ' + n.bezig + ' bezig, ' + n.open + ' open">'
      + seg(n.opgelost, 'bg-success') + seg(n.geenfout, 'bg-base-content/40') + seg(n.wacht, 'bg-info') + seg(n.bezig, 'bg-warning') + '</div>'
      + '<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70 mt-1.5">' + leg('bg-success', 'Opgelost ' + n.opgelost) + leg('bg-base-content/40', 'Geen fout ' + n.geenfout) + leg('bg-info', 'Wacht ' + n.wacht) + leg('bg-warning', 'Bezig ' + n.bezig) + leg('bg-base-content/10', 'Open ' + n.open) + '</div></div>';
    renderFilterChips();
    if (tab === 'patronen') renderPatterns();
  }

  function renderFilterChips() {
    var all = Array.from(cases.values());
    var mk = function (box, key, items) {
      box.innerHTML = items.map(function (it) {
        var on = filt[key] === it[0];
        return '<button type="button" class="btn btn-xs ' + (on ? 'btn-neutral' : 'btn-ghost') + '" data-action="chip" data-key="' + key + '" data-val="' + esc(it[0]) + '" aria-pressed="' + on + '">' + esc(it[1]) + (it[2] !== undefined ? ' <span class="font-mono opacity-60">' + it[2] + '</span>' : '') + '</button>';
      }).join('');
    };
    mk($('f-status'), 'status', [['todo', 'Te doen', all.filter(isTodo).length], ['wacht', 'Wacht op goedkeuring', all.filter(function (c) { return statusVan(c) === 'wacht'; }).length], ['done', 'Afgehandeld', all.filter(isDone).length], ['all', 'Alle', all.length]]);
    mk($('f-prio'), 'prio', C.PRIO.map(function (p) { return [p.id, p.label, all.filter(function (c) { return c.prio === p.id; }).length]; }));
    mk($('f-domein'), 'domein', C.DOMEIN.map(function (d) { return [d[0], d[1], all.filter(function (c) { return c.domein === d[0]; }).length]; }).filter(function (x) { return x[2]; }));
    var fillSel = function (sel, key, list, allLabel, of) {
      if (document.activeElement === sel) return;
      sel.innerHTML = '<option value="">' + esc(allLabel) + '</option>' + list.map(function (x) {
        var n = all.filter(function (c) { return of(c, x[0]); }).length;
        return n ? '<option value="' + esc(x[0]) + '">' + esc(x[1]) + ' (' + n + ')</option>' : '';
      }).join('');
      sel.value = filt[key];
      if (sel.value !== filt[key]) { filt[key] = ''; }
    };
    fillSel($('f-pat'), 'pat', sortedPatterns().map(function (p) { return [p.id, p.titel]; }).concat([['geen', 'Nog geen patroon']]), 'Alle patronen', function (c, v) { return v === 'geen' ? !patsOf(c).length : patsOf(c).indexOf(v) >= 0; });
    fillSel($('f-soort'), 'soort', C.SOORT, 'Alle soorten fouten', function (c, v) { return (c.soort || 'onbekend') === v; });
    fillSel($('f-zeker'), 'zeker', C.ZEKER, 'Elke zekerheid', function (c, v) { return c.zekerheid === v; });
  }

  // ── Patronen ───────────────────────────────────────────────────────────────

  function patternHtml(p) {
    var all = Array.from(cases.values());
    var cs = all.filter(function (c) { return patsOf(c).indexOf(p.id) >= 0; }).sort(function (a, b) { return a.nr - b.nr; });
    var done = cs.filter(isDone).length, dd = patDirty.get(p.id) || {};
    var mkTa = function (veld, label, ph, rows) {
      return '<label class="form-control w-full"><div class="label py-1"><span class="label-text text-xs font-medium">' + esc(label) + '</span></div>'
        + '<textarea id="p-' + veld + '-' + esc(p.id) + '" class="textarea textarea-bordered textarea-sm w-full leading-snug" rows="' + rows + '" placeholder="' + esc(ph) + '" data-input="pat-tekst" data-id="' + esc(p.id) + '" data-veld="' + veld + '">' + esc(veld in dd ? dd[veld] : (p[veld] || '')) + '</textarea></label>';
    };
    var lessons = cs.filter(function (c) { return c.les || c.wat_gebeurde; });
    return '<article class="card bg-base-100 border border-base-content/10" id="pat-' + esc(p.id) + '" data-pat="' + esc(p.id) + '">'
      + '<div class="card-body p-4 gap-3">'
      + '<div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="text-base font-semibold">' + esc(p.titel) + '</h3>'
      + '<span class="text-xs opacity-60 font-mono">' + (cs.length ? done + ' van ' + cs.length + ' afgehandeld' : 'geen cases') + '</span></div>'
      + mkTa('uitleg', 'Uitleg', 'Wat gaat er mis, en waarom is dat een probleem?', 2)
      + mkTa('regel', 'Regel', 'Wat doe je voortaan, zodat dit niet meer gebeurt?', 2)
      + mkTa('controle', 'Controle', 'Hoe zie je in Odoo dat het goed staat?', 2)
      + '<div class="flex flex-wrap items-center gap-2" data-part="ptools">' + patToolsHtml(p) + '</div>'
      + '<div data-part="rev"></div><div data-part="hist"></div>'
      + (cs.length ? '<div class="flex flex-wrap gap-1.5">' + cs.map(function (c) {
        return '<button type="button" class="btn btn-xs btn-ghost gap-1.5 font-normal" title="' + esc(c.titel || '') + '" data-action="go-case" data-id="' + esc(c.id) + '"><span class="oc-st ' + statusVan(c) + '" style="width:10px;height:10px;margin:0;border-width:1.5px"></span>#' + c.nr + ' ' + esc(c.klant) + '</button>';
      }).join('') + '</div>' : '')
      + (lessons.length ? '<div><div class="text-xs uppercase tracking-wider opacity-60 mb-1">Wat de cases leerden</div><ul class="text-sm space-y-1 list-disc pl-5">' + lessons.map(function (c) {
        return '<li class="oc-tekst">#' + c.nr + ' ' + esc(c.klant) + ': ' + linkHtml([c.wat_gebeurde, c.les ? 'Les: ' + c.les : ''].filter(Boolean).join(' ')) + '</li>';
      }).join('') + '</ul></div>' : '')
      + '</div></article>';
  }

  function patToolsHtml(p) {
    var key = 'pat:' + p.id, st = reviews.get(key), busy = st && st.state === 'busy';
    var tag = patChanged(p) ? '<span class="badge badge-sm badge-warning badge-outline">Gewijzigd' + (p.bijgewerkt ? ' ' + esc(timeLabel(p.bijgewerkt)) : '') + ', nog niet geverifieerd</span>'
      : p.geverifieerd ? '<span class="badge badge-sm badge-success badge-outline">Geverifieerd ' + esc(timeLabel(p.geverifieerd)) + '</span>' : '';
    var all = Array.from(cases.values()).some(function (c) { return patsOf(c).indexOf(p.id) >= 0; });
    return '<button type="button" class="btn btn-sm ' + (patChanged(p) || !p.regel ? 'btn-primary' : 'btn-outline') + '" data-action="review" data-key="' + key + '"' + (busy ? ' disabled' : '')
      + ' title="Claude leest alle cases van dit patroon (ook de lessen die jullie noteerden) en stelt de regel en de controle op of verbetert ze.">'
      + (busy ? '<span class="loading loading-spinner loading-xs"></span> Claude is bezig…' : '<i data-lucide="sparkles" class="w-4 h-4"></i> ' + (p.regel ? 'Verifieer en herschrijf' : 'Stel regel op met Claude')) + '</button>'
      + tag
      + '<button type="button" class="btn btn-ghost btn-xs ml-auto" data-action="history" data-kind="pattern" data-id="' + esc(p.id) + '"><i data-lucide="history" class="w-3.5 h-3.5"></i> Historiek</button>'
      + (me && me.is_admin && !all ? '<button type="button" class="btn btn-ghost btn-xs text-error" data-action="delete-pattern" data-id="' + esc(p.id) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Verwijderen</button>' : '');
  }

  function renderPatterns() {
    var box = $('patList');
    if (document.activeElement && box.contains(document.activeElement)) return;   // niet onder iemands cursor hertekenen
    var list = sortedPatterns();
    box.innerHTML = list.length ? list.map(patternHtml).join('') : '<div class="card bg-base-100 border border-base-content/10"><div class="card-body items-center text-center py-12"><i data-lucide="git-branch" class="w-12 h-12 opacity-40"></i><p class="text-sm text-base-content/60">Nog geen patronen. Laat Claude er een voorstellen vanuit een case.</p></div></div>';
    list.forEach(function (p) { paintReview('pat:' + p.id); paintHist('pat:' + p.id); });
    icons();
  }

  function repaintPattern(id, force) {
    var el = document.querySelector('[data-pat="' + CSS.escape(id) + '"]');
    if (!el) return;
    var p = patterns.get(id); if (!p) { el.remove(); return; }
    if (force || !(document.activeElement && el.contains(document.activeElement))) {
      var tmp = document.createElement('div'); tmp.innerHTML = patternHtml(p);
      el.replaceWith(tmp.firstElementChild);
      paintReview('pat:' + id); paintHist('pat:' + id); icons();
    } else {
      var tools = part(el, 'ptools'); if (tools) { tools.innerHTML = patToolsHtml(p); icons(); }
    }
  }

  function goPattern(pid) {
    setTab('patronen');
    var el = $('pat-' + pid); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('oc-flash'); setTimeout(function () { el.classList.remove('oc-flash'); }, 1800);
  }
  function goCase(id) {
    filt = { status: 'all', prio: '', domein: '', pat: '', soort: '', zeker: '', q: '' }; $('f-q').value = '';
    keep('oc-filt', { status: filt.status, prio: filt.prio, domein: filt.domein });
    setTab('cases'); renderFilterChips(); applyFilters(); setOpen(id, true);
    var el = built.get(id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('oc-flash'); setTimeout(function () { el.classList.remove('oc-flash'); }, 1800); }
  }

  // ── Claude: verifiëren en herschrijven (case en patroon) ───────────────────

  function adapter(key) {
    var isCase = key.slice(0, 5) === 'case:', id = key.slice(isCase ? 5 : 4);
    if (isCase) {
      return {
        id: id, fields: C.CASE_TEKSTEN, exists: function () { return cases.has(id); },
        values: function () { var c = cases.get(id) || {}, o = {}; C.CASE_TEKSTEN.forEach(function (f) { var ta = $('tx-' + f[0] + '-' + id); o[f[0]] = ta ? ta.value : (c[f[0]] || ''); }); return o; },
        flush: function () { flushAllText(id); },
        setText: function (k, v) { var ta = $('tx-' + k + '-' + id); if (ta) ta.value = v; var t = id + '|' + k; clearTimeout(timers.get(t)); timers.delete(t); var d = dirty.get(id); if (d) delete d[k]; basisVan.delete('case|' + id + '|' + k); var c = cases.get(id); if (c) c[k] = v; },
        save: function (patch, msg, basis) { return saveCase(id, patch, { bron: 'claude', msg: msg, basis: basis }); },
        verify: function (msg) { return saveCase(id, { geverifieerd: true }, { msg: msg }); },
        tools: function () { paintTools(id); icons(); },
        panel: function () { var el = built.get(id); return el ? part(el, 'rev') : null; },
        request: function () { var cb = $('odoo-' + id); return api('/cases/' + encodeURIComponent(id) + '/review', { method: 'POST', body: JSON.stringify({ waarden: this.values(), met_odoo: !!(cb && cb.checked) }) }); },
        busyText: 'Claude toetst de case aan de bevinding en de Odoo-referenties…', waitText: 'Dit duurt meestal 15 tot 45 seconden.'
      };
    }
    return {
      id: id, fields: C.PATROON_TEKSTEN, exists: function () { return patterns.has(id); },
      values: function () { var p = patterns.get(id) || {}, o = {}; C.PATROON_TEKSTEN.forEach(function (f) { var ta = $('p-' + f[0] + '-' + id); o[f[0]] = ta ? ta.value : (p[f[0]] || ''); }); return o; },
      flush: function () { flushPatText(id); },
      setText: function (k, v) { var ta = $('p-' + k + '-' + id); if (ta) ta.value = v; var t = id + '|' + k; clearTimeout(patTimers.get(t)); patTimers.delete(t); var d = patDirty.get(id); if (d) delete d[k]; basisVan.delete('pat|' + id + '|' + k); var p = patterns.get(id); if (p) p[k] = v; },
      save: function (patch, msg, basis) { return savePattern(id, patch, { bron: 'claude', msg: msg, basis: basis }); },
      verify: function (msg) { return savePattern(id, { geverifieerd: true }, { msg: msg }); },
      tools: function () { var el = document.querySelector('[data-pat="' + CSS.escape(id) + '"]'); var t = el && part(el, 'ptools'); var p = patterns.get(id); if (t && p) { t.innerHTML = patToolsHtml(p); icons(); } },
      panel: function () { var el = document.querySelector('[data-pat="' + CSS.escape(id) + '"]'); return el ? part(el, 'rev') : null; },
      request: function () { return api('/patterns/' + encodeURIComponent(id) + '/review', { method: 'POST', body: JSON.stringify({ waarden: this.values() }) }); },
      busyText: 'Claude leest de cases en bekijkt de regel…', waitText: 'Nadenken over de regel, de controle en de cases. Dit duurt meestal 20 tot 60 seconden.'
    };
  }

  function runReview(key) {
    var ad = adapter(key); if (!ad.exists()) return;
    ad.flush();
    var st = { state: 'busy', fields: ad.fields, snapshot: ad.values() };
    reviews.set(key, st); paintReview(key); ad.tools();
    ad.request().then(function (res) {
      var r = res.data.voorstel;
      var out = { oordeel: r.oordeel === 'ok' ? 'ok' : 'aanpassen', opmerkingen: Array.isArray(r.opmerkingen) ? r.opmerkingen : [] };
      st.fields.forEach(function (f) { out[f[0]] = typeof r[f[0]] === 'string' ? r[f[0]].trim() : st.snapshot[f[0]]; });
      st.state = 'done'; st.result = out; st.accepted = {}; st.metOdoo = !!res.data.met_odoo;
    }, function (e) {
      st.state = 'error'; st.error = e;
    }).then(function () { if (reviews.get(key) === st) { paintReview(key); ad.tools(); } });
  }

  function changedFields(st) {
    return st.fields.filter(function (f) { return st.result && st.result[f[0]] !== st.snapshot[f[0]] && !st.accepted[f[0]]; });
  }

  function accept(key, keys, force) {
    var st = reviews.get(key), ad = adapter(key); if (!st || !ad.exists()) return;
    var cur = ad.values();
    var conflict = keys.filter(function (k) { return (cur[k] || '') !== st.snapshot[k]; });
    if (conflict.length && !force) { st.conflict = { keys: keys, velden: conflict.map(function (k) { return lbl(st.fields, k); }) }; paintReview(key); return; }
    st.conflict = null;
    var patch = {}, basis = {};
    keys.forEach(function (k) { patch[k] = st.result[k]; basis[k] = force ? (cur[k] || '') : (st.snapshot[k] || ''); st.accepted[k] = true; ad.setText(k, st.result[k]); });
    var left = changedFields(st);
    if (!left.length) patch.geverifieerd = true;    // pas geverifieerd als alles beslist is
    ad.save(patch, 'Overgenomen', basis).then(function () {
      if (!left.length) reviews.delete(key);
      paintReview(key); ad.tools(); if (tab === 'skill') loadSkill();
    });
    paintReview(key);
  }

  function dismiss(key, markOk) {
    var ad = adapter(key);
    if (markOk && ad.exists()) ad.verify('Gemarkeerd als geverifieerd');
    reviews.delete(key); paintReview(key); ad.tools();
  }

  function paintReview(key) {
    var ad = adapter(key), el = ad.panel(); if (!el) return;
    var st = reviews.get(key);
    if (!st) { el.innerHTML = ''; return; }
    var btn = function (t, action, extra, cls) { return '<button type="button" class="btn btn-xs ' + (cls || 'btn-outline') + '" data-action="' + action + '" data-key="' + key + '"' + (extra || '') + '>' + t + '</button>'; };
    var html = '<div class="rounded-lg border border-base-content/20 bg-base-200/50 p-3 mt-2 space-y-2 text-sm">';
    if (st.state === 'busy') {
      html += '<div class="flex items-center justify-between gap-2"><strong><span class="loading loading-spinner loading-xs mr-1"></span>' + esc(ad.busyText) + '</strong></div><p class="text-xs opacity-60">' + esc(ad.waitText) + '</p></div>';
      el.innerHTML = html; return;
    }
    if (st.state === 'error') {
      html += '<div class="flex items-start justify-between gap-2"><strong class="text-error">' + esc(errText(st.error)) + '</strong></div><div class="flex flex-wrap gap-2">' + btn('Opnieuw', 'review') + btn('Sluiten', 'dismiss') + '</div></div>';
      el.innerHTML = html; return;
    }
    var r = st.result, todo = changedFields(st), ok = r.oordeel === 'ok' && !todo.length;
    html += '<div class="flex flex-wrap items-center justify-between gap-2"><strong>Voorstel van Claude' + (st.metOdoo ? ' <span class="font-normal text-xs opacity-60">(met de live chatter uit Odoo)</span>' : '') + '</strong>'
      + '<span class="badge badge-sm ' + (ok ? 'badge-success' : 'badge-warning') + '">' + (ok ? 'Klopt zo' : todo.length + (todo.length === 1 ? ' veld' : ' velden') + ' herschreven') + '</span></div>';
    if (r.opmerkingen.length) html += '<ul class="list-disc pl-5 space-y-0.5 text-sm">' + r.opmerkingen.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    todo.forEach(function (f) {
      html += '<div class="rounded-md border border-base-content/10 bg-base-100 p-2.5 space-y-2"><div class="flex items-center justify-between gap-2"><span class="text-xs font-medium">' + esc(f[1]) + '</span>' + btn('Overnemen', 'accept', ' data-veld="' + f[0] + '"', 'btn-primary') + '</div>'
        + '<div class="grid gap-2 sm:grid-cols-2"><div class="text-sm opacity-70 oc-tekst"><span class="block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">Nu</span>' + esc(st.snapshot[f[0]] || '(leeg)') + '</div>'
        + '<div class="text-sm oc-tekst"><span class="block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">Voorstel</span>' + esc(r[f[0]] || '(leeg)') + '</div></div></div>';
    });
    if (st.conflict) {
      html += '<div class="alert alert-warning text-xs py-2 px-3 flex-wrap"><span>Het veld ' + esc(st.conflict.velden.join(', ')) + ' werd intussen nog gewijzigd. Toch overschrijven met het voorstel?</span>'
        + '<span class="flex gap-2">' + btn('Toch overnemen', 'accept-force', ' data-velden="' + esc(st.conflict.keys.join(',')) + '"', 'btn-warning') + btn('Annuleren', 'conflict-cancel') + '</span></div>';
    }
    html += '<div class="flex flex-wrap gap-2 pt-1">';
    if (todo.length > 1) html += btn('Alles overnemen', 'accept-all', '', 'btn-primary');
    if (!todo.length) html += btn('Markeer als geverifieerd', 'dismiss-ok', '', 'btn-primary');
    if (todo.length) html += btn('Mijn versie houden', 'dismiss-ok');
    html += btn('Sluiten', 'dismiss') + btn('Opnieuw vragen', 'review') + '</div></div>';
    el.innerHTML = html;
  }

  // ── Claude: patroon zoeken of een nieuw maken ──────────────────────────────

  function runPatSearch(id, forceNew) {
    var st = patSugg.get(id); if (!st) return;
    st.state = 'busy'; st.error = null; paintPatSugg(id);
    api('/cases/' + encodeURIComponent(id) + '/pattern-search', { method: 'POST', body: JSON.stringify({ hint: st.hint || '', force_new: !!forceNew }) })
      .then(function (res) { st.result = res.data; st.state = 'done'; }, function (e) { st.state = 'error'; st.error = e; })
      .then(function () { if (patSugg.get(id) === st) paintPatSugg(id); });
  }

  function createPattern(id) {
    var st = patSugg.get(id); if (!st || !st.result) return;
    var r = st.result, get = function (k) { var el = $('np-' + k + '-' + id); return el ? el.value.trim() : (r[k] || ''); };
    var titel = get('titel'); if (!titel) { toast('Geef het patroon een titel.', 'error'); return; }
    st.state = 'saving'; paintPatSugg(id);
    api('/patterns', { method: 'POST', body: JSON.stringify({ titel: titel, uitleg: get('uitleg'), regel: get('regel'), controle: get('controle'), bron_case: id, case_id: id, replace: !!st.replace }) })
      .then(function (res) {
        applyPattern(res.data.pattern); if (res.data.case) applyCase(res.data.case);
        patSugg.delete(id); fill(id); applyFilters(); refreshCounts(); renderFilterChips();
        if (tab === 'patronen') renderPatterns();
        toast('Nieuw patroon aangemaakt en toegevoegd', 'success');
      }, function (e) { st.state = 'done'; paintPatSugg(id); toast('Niet bewaard: ' + e.message, 'error'); });
  }

  function paintPatSugg(id) {
    var el = built.get(id); if (!el) return;
    var box = part(el, 'patpanel'), st = patSugg.get(id);
    el.querySelector('[data-action="pat-search"]').classList.toggle('hidden', !!st);
    if (!st) { box.innerHTML = ''; return; }
    if (document.activeElement && box.contains(document.activeElement) && st.state !== 'busy' && st.state !== 'saving') return;   // niet onder iemands cursor hertekenen
    var b = function (t, action, extra, cls) { return '<button type="button" class="btn btn-xs ' + (cls || 'btn-outline') + '" data-action="' + action + '" data-id="' + id + '"' + (extra || '') + '>' + t + '</button>'; };
    var html = '<div class="rounded-lg border border-base-content/20 bg-base-200/50 p-3 mt-2 space-y-2 text-sm">';
    var close = b('Annuleren', 'pat-close');
    if (st.state === 'ask') {
      html += '<strong>Patroon zoeken</strong><textarea class="textarea textarea-bordered textarea-sm w-full" rows="2" placeholder="Optioneel: wat ging er volgens jou mis? Dat helpt Claude het juiste patroon te vinden." data-input="pat-hint" data-id="' + id + '" id="hint-' + id + '">' + esc(st.hint || '') + '</textarea>'
        + '<div class="flex flex-wrap gap-2">' + b('Zoek patroon', 'pat-run', '', 'btn-primary') + close + '</div></div>';
      box.innerHTML = html; setTimeout(function () { var ta = $('hint-' + id); if (ta) ta.focus(); }, 0); return;
    }
    if (st.state === 'busy' || st.state === 'saving') {
      html += '<strong><span class="loading loading-spinner loading-xs mr-1"></span>' + (st.state === 'saving' ? 'Patroon bewaren…' : 'Claude vergelijkt de case met de bestaande patronen…') + '</strong><p class="text-xs opacity-60">Dit duurt meestal 15 tot 45 seconden.</p></div>';
      box.innerHTML = html; return;
    }
    if (st.state === 'error') {
      html += '<strong class="text-error">' + esc(errText(st.error)) + '</strong><div class="flex flex-wrap gap-2">' + b('Opnieuw', 'pat-run') + close + '</div></div>';
      box.innerHTML = html; return;
    }
    var r = st.result, heeft = patsOf(cases.get(id) || {}).length > 0;
    if (r.keuze === 'bestaand') {
      var p = patterns.get(r.id) || { titel: r.id };
      html += '<div class="flex flex-wrap items-center justify-between gap-2"><strong>Past bij een bestaand patroon</strong><span class="badge badge-sm badge-success">' + esc(p.titel) + '</span></div>'
        + (r.reden ? '<p>' + esc(r.reden) + '</p>' : '')
        + (p.regel ? '<div class="rounded-md bg-base-100 border border-base-content/10 p-2.5"><span class="block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">Regel van dat patroon</span><span class="oc-tekst">' + esc(p.regel) + '</span></div>' : '')
        + (r.alternatief ? '<p class="text-xs opacity-60">Anders bekeken: ' + esc(r.alternatief) + '</p>' : '')
        + '<div class="flex flex-wrap gap-2">' + b('Toevoegen aan de case', 'pat-assign', ' data-pid="' + esc(r.id) + '"', 'btn-primary')
        + (heeft ? b('In plaats van de huidige', 'pat-assign-replace', ' data-pid="' + esc(r.id) + '"') : '')
        + b('Toch een nieuw patroon', 'pat-run-new') + close + '</div></div>';
      box.innerHTML = html; return;
    }
    var mk = function (k, label, rows) {
      return '<label class="form-control w-full"><div class="label py-1"><span class="label-text text-xs font-medium">' + label + '</span></div>'
        + (rows ? '<textarea id="np-' + k + '-' + id + '" class="textarea textarea-bordered textarea-sm w-full" rows="' + rows + '" data-input="np" data-id="' + id + '" data-veld="' + k + '">' + esc(r[k] || '') + '</textarea>'
          : '<input id="np-' + k + '-' + id + '" type="text" class="input input-bordered input-sm w-full" value="' + esc(r[k] || '') + '" data-input="np" data-id="' + id + '" data-veld="' + k + '">') + '</label>';
    };
    html += '<div class="flex flex-wrap items-center justify-between gap-2"><strong>Voorstel voor een nieuw patroon</strong><span class="badge badge-sm badge-warning">nieuw</span></div>'
      + (r.reden ? '<p>' + esc(r.reden) + '</p>' : '')
      + mk('titel', 'Titel') + mk('uitleg', 'Uitleg', 3) + mk('regel', 'Regel', 3) + mk('controle', 'Controle', 2)
      + '<div class="flex flex-wrap gap-2">' + b('Aanmaken en toevoegen', 'pat-create', '', 'btn-primary')
      + (heeft ? b('Aanmaken, in plaats van de huidige', 'pat-create-replace') : '')
      + b('Opnieuw zoeken', 'pat-run') + close + '</div></div>';
    box.innerHTML = html;
  }

  // ── Nakijken in Odoo en historiek ──────────────────────────────────────────

  function paintOdoo(id) {
    var el = built.get(id); if (!el) return;
    var box = part(el, 'odoo'), st = odooPanels.get(id);
    if (!st || !st.open) { box.innerHTML = ''; return; }
    var html = '<div class="rounded-lg border border-base-content/20 bg-base-200/50 p-3 mt-2 space-y-2 text-sm">';
    html += '<div class="flex items-center justify-between gap-2"><strong>Live in Odoo' + (st.data ? ' <span class="font-normal text-xs opacity-60">(' + esc(timeLabel(st.data.opgehaald)) + ')</span>' : '') + '</strong><span class="flex gap-1">'
      + '<button type="button" class="btn btn-ghost btn-xs" data-action="odoo-refresh" data-id="' + id + '" title="Opnieuw ophalen"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i></button>'
      + '<button type="button" class="btn btn-ghost btn-xs" data-action="odoo-close" data-id="' + id + '">Sluiten</button></span></div>';
    if (st.state === 'busy') html += '<p class="text-xs opacity-60"><span class="loading loading-spinner loading-xs mr-1"></span>De records, hun chatter en activiteiten worden uit Odoo gelezen…</p>';
    else if (st.state === 'error') html += '<p class="text-error text-xs">' + esc(st.error && st.error.message) + '</p>';
    else if (st.data) {
      if (!st.data.records.length) html += '<p class="text-xs opacity-60">Deze case heeft geen Odoo-referenties.</p>';
      st.data.records.forEach(function (r, i) {
        html += '<details class="rounded-md border border-base-content/10 bg-base-100"' + (i === 0 ? ' open' : '') + '><summary class="cursor-pointer px-2.5 py-1.5 text-sm flex items-center gap-2"><span class="opacity-60">' + esc(r.soort) + '</span><span class="font-mono font-medium">' + esc(r.label) + '</span>'
          + (r.fout ? '<span class="badge badge-sm badge-error badge-outline">fout</span>' : '<span class="text-xs opacity-60">' + r.berichten.length + ' berichten' + (r.activiteiten.length ? ', ' + r.activiteiten.length + ' activiteiten' : '') + '</span>')
          + '<a class="ml-auto link text-xs" href="' + esc(r.url) + '" target="_blank" rel="noopener">openen</a></summary><div class="px-2.5 pb-2.5 space-y-2">';
        if (r.fout) html += '<p class="text-xs text-error">' + esc(r.fout) + '</p>';
        if (r.velden.length) html += '<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">' + r.velden.map(function (v) { return '<dt class="opacity-60 font-mono">' + esc(v.veld) + '</dt><dd class="break-words">' + esc(v.waarde) + '</dd>'; }).join('') + '</dl>';
        if (r.activiteiten.length) html += '<div><div class="text-[10px] uppercase tracking-wider opacity-60">Open activiteiten</div><ul class="text-xs list-disc pl-4">' + r.activiteiten.map(function (a) { return '<li>' + esc(a.deadline) + ' ' + esc(a.type) + ' ' + esc(a.samenvatting) + (a.wie ? ' (' + esc(a.wie) + ')' : '') + (a.nota ? ': ' + esc(a.nota) : '') + '</li>'; }).join('') + '</ul></div>';
        if (r.berichten.length) html += '<div><div class="text-[10px] uppercase tracking-wider opacity-60">Chatter (recentste eerst)</div><ul class="text-xs space-y-1.5 mt-1">' + r.berichten.map(function (m) {
          return '<li class="border-l-2 border-base-content/10 pl-2"><span class="opacity-60">' + esc(timeLabel(m.datum)) + '</span> <span class="font-medium">' + esc(m.auteur) + '</span>' + (m.subtype ? ' <span class="opacity-60">[' + esc(m.subtype) + ']</span>' : '')
            + (m.tekst ? '<div class="oc-tekst">' + esc(m.tekst) + '</div>' : '')
            + (m.wijzigingen.length ? '<ul class="opacity-80 pl-3 list-disc">' + m.wijzigingen.map(function (w) { return '<li><span class="font-mono">' + esc(w.veld) + '</span>: ' + esc(w.oud || '-') + ' → ' + esc(w.nieuw || '-') + '</li>'; }).join('') + '</ul>' : '') + '</li>';
        }).join('') + '</ul></div>';
        html += '</div></details>';
      });
    }
    box.innerHTML = html + '</div>'; icons();
  }

  function openOdoo(id, refresh) {
    var st = odooPanels.get(id) || {}; st.open = true;
    if (st.data && !refresh) { odooPanels.set(id, st); paintOdoo(id); return; }
    st.state = 'busy'; odooPanels.set(id, st); paintOdoo(id);
    api('/cases/' + encodeURIComponent(id) + '/odoo').then(function (res) { st.data = res.data; st.state = 'done'; }, function (e) { st.state = 'error'; st.error = e; }).then(function () { paintOdoo(id); });
  }

  function paintHist(key) {
    var isCase = key.slice(0, 5) === 'case:', id = key.slice(isCase ? 5 : 4);
    var host = isCase ? built.get(id) : document.querySelector('[data-pat="' + CSS.escape(id) + '"]'); if (!host) return;
    var box = part(host, 'hist'), st = histPanels.get(key);
    if (!st || !st.open) { box.innerHTML = ''; return; }
    var html = '<div class="rounded-lg border border-base-content/20 bg-base-200/50 p-3 mt-2 space-y-1 text-xs"><div class="flex items-center justify-between gap-2 mb-1"><strong class="text-sm">Historiek</strong><button type="button" class="btn btn-ghost btn-xs" data-action="hist-close" data-key="' + key + '">Sluiten</button></div>';
    if (st.state === 'busy') html += '<span class="loading loading-spinner loading-xs"></span>';
    else if (st.state === 'error') html += '<span class="text-error">' + esc(st.error && st.error.message) + '</span>';
    else if (!st.rows.length) html += '<span class="opacity-60">Nog geen wijzigingen vastgelegd.</span>';
    else html += '<ul class="space-y-1">' + st.rows.map(function (r) {
      return '<li class="flex flex-wrap gap-x-2"><span class="opacity-60 font-mono whitespace-nowrap">' + esc(timeLabel(r.tijd)) + '</span><span class="font-medium">' + esc(r.door_naam || (r.bron === 'import' ? 'import' : 'iemand')) + '</span>'
        + (r.bron === 'claude-voorstel-overgenomen' ? '<span class="badge badge-xs badge-outline">voorstel van Claude</span>' : '') + '<span class="font-mono">' + esc(r.veld) + '</span>'
        + '<span class="opacity-70 break-all">' + (r.oud ? esc(String(r.oud).slice(0, 80)) + ' → ' : '') + esc(String(r.nieuw == null ? '' : r.nieuw).slice(0, 120)) + '</span></li>';
    }).join('') + '</ul>';
    box.innerHTML = html + '</div>';
  }

  function openHist(kind, id) {
    var key = (kind === 'case' ? 'case:' : 'pat:') + id, st = histPanels.get(key) || {};
    if (st.open) { st.open = false; histPanels.set(key, st); paintHist(key); return; }
    st.open = true; st.state = 'busy'; histPanels.set(key, st); paintHist(key);
    api('/' + (kind === 'case' ? 'cases' : 'patterns') + '/' + encodeURIComponent(id) + '/history').then(function (res) { st.rows = res.data; st.state = 'done'; }, function (e) { st.state = 'error'; st.error = e; }).then(function () { paintHist(key); });
  }

  // ── Skill-concept, import, nieuwe case ─────────────────────────────────────

  var skillText = '';
  function loadSkill() {
    $('skillMd').textContent = 'Laden…';
    api('/skill').then(function (res) { skillText = res.data.markdown; $('skillMd').textContent = skillText; }, function (e) { $('skillMd').textContent = 'Kon het skill-concept niet maken: ' + e.message; });
  }
  function copySkill() {
    var done = function () { toast('Gekopieerd', 'success'); };
    var fallback = function () { var r = document.createRange(); r.selectNodeContents($('skillMd')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Geselecteerd: kopieer met Ctrl+C'); };
    try { navigator.clipboard.writeText(skillText).then(done, fallback); } catch (e) { fallback(); }
  }
  function downloadSkill() {
    var blob = new Blob([skillText], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'SKILL.md'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function runImport() {
    var f = $('importFile').files[0];
    if (!f) { toast('Kies eerst het bestand data.json.', 'error'); return; }
    var btn = $('importBtn'); btn.disabled = true; $('importResult').textContent = 'Bezig…';
    f.text().then(function (txt) {
      var body; try { body = JSON.parse(txt); } catch (e) { throw new Error('Dit bestand is geen geldige JSON.'); }
      return api('/import', { method: 'POST', body: JSON.stringify(body) });
    }).then(function (res) {
      $('importResult').textContent = 'Geladen: ' + res.data.cases + ' cases, ' + res.data.patterns + ' patronen, ' + res.data.links + ' koppelingen.';
      toast('Export geladen', 'success'); return bootstrap();
    }).catch(function (e) { $('importResult').textContent = ''; toast('Import mislukt: ' + e.message, 'error'); }).then(function () { btn.disabled = false; });
  }

  function openNewCase() {
    var f = $('newCaseForm'); f.reset(); $('nc-error').classList.add('hidden');
    var opt = function (list) { return list.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join(''); };
    $('nc-domein').innerHTML = opt(C.DOMEIN); $('nc-prio').innerHTML = opt(C.PRIO.map(function (p) { return [p.id, p.label]; })); $('nc-prio').value = 'gemiddeld';
    $('nc-zeker').innerHTML = opt(C.ZEKER); $('nc-zeker').value = 'na te kijken'; $('nc-soort').innerHTML = opt(C.SOORT); $('nc-soort').value = 'onbekend';
    var types = {}; cases.forEach(function (c) { if (c.klanttype) types[c.klanttype] = 1; });
    $('klanttypes').innerHTML = Object.keys(types).sort().map(function (t) { return '<option value="' + esc(t) + '"></option>'; }).join('');
    $('newCaseModal').showModal();
  }
  function saveNewCase() {
    var f = $('newCaseForm'), fd = new FormData(f), body = {};
    ['klant', 'klanttype', 'titel', 'domein', 'prio', 'zekerheid', 'soort', 'bedrag', 'categorie', 'deadline', 'vervaldag', 'bevinding', 'voorstel'].forEach(function (k) { body[k] = String(fd.get(k) || '').trim() || null; });
    body.refs = String(fd.get('refs') || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = /^([a-z._]+)[\s,]+(\d+)[\s,]+(.+)$/i.exec(l); return m ? { model: m[1], id: Number(m[2]), label: m[3].trim() } : null;
    }).filter(Boolean);
    var err = $('nc-error');
    if (!body.klant) { err.textContent = 'Geef de klant op.'; err.classList.remove('hidden'); return; }
    var btn = $('nc-save'); btn.disabled = true;
    api('/cases', { method: 'POST', body: JSON.stringify(body) }).then(function (res) {
      applyCase(res.data); buildRefIndex(); layout(); renderFilterChips(); $('newCaseModal').close();
      toast('Case #' + res.data.nr + ' toegevoegd', 'success'); goCase(res.data.id);
    }, function (e) { err.textContent = e.message; err.classList.remove('hidden'); }).then(function () { btn.disabled = false; });
  }

  // ── Tabbladen ──────────────────────────────────────────────────────────────

  function setTab(t) {
    tab = t;
    document.querySelectorAll('[data-action="tab"]').forEach(function (b) { b.classList.toggle('tab-active', b.dataset.tab === t); });
    ['cases', 'patronen', 'skill'].forEach(function (k) { $('p-' + k).classList.toggle('hidden', k !== t); });
    if (t === 'patronen') renderPatterns();
    if (t === 'skill') loadSkill();
    try { history.replaceState(null, '', '#' + t); } catch (e) { /* niet erg */ }
  }

  function notice(text, kind) {
    var el = document.createElement('div'); el.className = 'alert ' + (kind === 'warn' ? 'alert-warning' : 'alert-info') + ' text-sm'; el.innerHTML = '<span>' + esc(text) + '</span>';
    $('notices').appendChild(el);
  }

  // ── Gebeurtenissen (één centrale listener per soort) ───────────────────────

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]'); if (!el) return;
    var a = el.dataset.action, id = el.dataset.id, key = el.dataset.key;
    switch (a) {
      case 'tab': setTab(el.dataset.tab); break;
      case 'toggle': { var on = !open.has(id); setOpen(id, on); break; }
      case 'chip': { var k = el.dataset.key, v = el.dataset.val; filt[k] = (filt[k] === v && k !== 'status') ? '' : v; keep('oc-filt', { status: filt.status, prio: filt.prio, domein: filt.domein }); renderFilterChips(); applyFilters(); break; }
      case 'new-case': openNewCase(); break;
      case 'save-new-case': saveNewCase(); break;
      case 'close-new-case': $('newCaseModal').close(); break;
      case 'task-new': openTaak(id); break;
      case 'task-save': saveTaak(); break;
      case 'task-close': $('taskModal').close(); break;
      case 'remove-pat': setPats(id, patsOf(cases.get(id) || {}).filter(function (x) { return x !== el.dataset.pid; }), 'Patroon weggehaald'); break;
      case 'go-pattern': goPattern(el.dataset.pid); break;
      case 'go-case': goCase(id); break;
      case 'review': runReview(key); break;
      case 'accept': accept(key, [el.dataset.veld]); break;
      case 'accept-all': { var st = reviews.get(key); if (st) accept(key, changedFields(st).map(function (f) { return f[0]; })); break; }
      case 'accept-force': accept(key, el.dataset.velden.split(','), true); break;
      case 'conflict-cancel': { var s2 = reviews.get(key); if (s2) { s2.conflict = null; paintReview(key); } break; }
      case 'dismiss': dismiss(key, false); break;
      case 'dismiss-ok': dismiss(key, true); break;
      case 'pat-search': patSugg.set(id, { state: 'ask', hint: '' }); paintPatSugg(id); break;
      case 'pat-close': patSugg.delete(id); paintPatSugg(id); break;
      case 'pat-run': runPatSearch(id, false); break;
      case 'pat-run-new': runPatSearch(id, true); break;
      case 'pat-assign': patSugg.delete(id); setPats(id, patsOf(cases.get(id) || {}).concat([el.dataset.pid]), 'Patroon toegevoegd'); break;
      case 'pat-assign-replace': patSugg.delete(id); setPats(id, [el.dataset.pid], 'Patroon vervangen'); break;
      case 'pat-create': { var p1 = patSugg.get(id); if (p1) { p1.replace = false; createPattern(id); } break; }
      case 'pat-create-replace': { var p2 = patSugg.get(id); if (p2) { p2.replace = true; createPattern(id); } break; }
      case 'odoo': openOdoo(id, false); break;
      case 'odoo-refresh': openOdoo(id, true); break;
      case 'odoo-close': { var o = odooPanels.get(id); if (o) o.open = false; paintOdoo(id); break; }
      case 'history': openHist(el.dataset.kind, id); break;
      case 'hist-close': { var h = histPanels.get(key); if (h) h.open = false; paintHist(key); break; }
      case 'delete-pattern': deletePattern(id, el); break;
      case 'copy-skill': copySkill(); break;
      case 'download-skill': downloadSkill(); break;
      case 'import': runImport(); break;
      default: break;
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]'); if (!el) return;
    var id = el.dataset.id, c;
    switch (el.dataset.change) {
      case 'vinkje': c = cases.get(id); if (!c) return; c[el.dataset.veld] = el.checked; fill(id); applyFilters(); refreshCounts(); { var p = {}; p[el.dataset.veld] = el.checked; saveCase(id, p); } break;
      case 'soort': c = cases.get(id); if (!c) return; c.soort = el.value; applyFilters(); refreshCounts(); saveCase(id, { soort: el.value }); break;
      case 'add-pat': if (el.value) setPats(id, patsOf(cases.get(id) || {}).concat([el.value]), 'Patroon toegevoegd'); break;
      case 'filter': filt[el.dataset.key] = el.value; applyFilters(); break;
      default: break;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]'); if (!el) return;
    switch (el.dataset.input) {
      case 'tekst': queueText(el.dataset.id, el.dataset.veld, el.value); break;
      case 'pat-tekst': queuePatText(el.dataset.id, el.dataset.veld, el.value); break;
      case 'pat-hint': { var st = patSugg.get(el.dataset.id); if (st) st.hint = el.value; break; }
      case 'np': { var s2 = patSugg.get(el.dataset.id); if (s2 && s2.result) s2.result[el.dataset.veld] = el.value; break; }
      case 'filter-q': filt.q = el.value.trim().toLowerCase(); applyFilters(); break;
      default: break;
    }
  });

  document.addEventListener('focusout', function (e) {
    var el = e.target.closest && e.target.closest('[data-input]'); if (!el) return;
    if (el.dataset.input === 'tekst') flushText(el.dataset.id, el.dataset.veld, el.value);
    if (el.dataset.input === 'pat-tekst') setTimeout(function () { flushPatText(el.dataset.id); }, 0);
  });

  function deletePattern(id, btn) {
    var p = patterns.get(id); if (!p) return;
    if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Zeker? Klik nogmaals om "' + p.titel + '" te verwijderen'; setTimeout(function () { if (btn.isConnected) { btn.dataset.confirm = ''; btn.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Verwijderen'; icons(); } }, 4000); return; }
    api('/patterns/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { patterns.delete(id); renderPatterns(); renderFilterChips(); refreshCounts(); toast('Patroon verwijderd', 'success'); }, function (e) { toast(e.message, 'error'); });
  }

  // ── Opstarten en bijhouden ─────────────────────────────────────────────────

  function bootstrap() {
    return api('/bootstrap').then(function (res) {
      var d = res.data; C = d.constants; me = d.me; meta = d.meta || {}; since = d.now;
      cases = new Map(); d.cases.forEach(function (c) { cases.set(c.id, c); });
      patterns = new Map(); d.patterns.forEach(function (p) { patterns.set(p.id, p); });
      if (meta['info.stand']) $('stand').textContent = 'Odoo · stand ' + dayLabel(meta['info.stand']);
      $('adminCard').classList.toggle('hidden', !me.is_admin);
      buildRefIndex();
      built.forEach(function (el) { el.remove(); }); built = new Map();
      layout();
      if (tab === 'patronen') renderPatterns();
      if (tab === 'skill') loadSkill();
      herstelBackups();
    });
  }

  /** Teksten die getypt zijn maar (nog) niet bij de server aankwamen: terugzetten en bewaren. */
  function herstelBackups() {
    var b = load(BACKUP, {}) || {}, n = 0;
    Object.keys(b).forEach(function (k) {
      var x = b[k]; if (!x || typeof x.waarde !== 'string') { delete b[k]; return; }
      var bron = x.soort === 'pat' ? patterns.get(x.id) : cases.get(x.id);
      if (!bron) { delete b[k]; return; }
      var server = bron[x.veld] || '';
      if (server === x.waarde || (x.waarde.trim() && server.indexOf(x.waarde.trim()) >= 0) || !x.waarde.trim()) { delete b[k]; return; }
      n++;
      var patch = {}; patch[x.veld] = x.waarde;
      var eigen = {}; if (typeof x.basis === 'string') eigen[x.veld] = x.basis;
      if (x.soort === 'pat') {
        var dp = patDirty.get(x.id) || {}; dp[x.veld] = x.waarde; patDirty.set(x.id, dp);
        savePattern(x.id, patch, { basis: eigen });
      } else {
        var dc = dirty.get(x.id) || {}; dc[x.veld] = x.waarde; dirty.set(x.id, dc); fill(x.id);
        saveCase(x.id, patch, { basis: eigen });
      }
    });
    keep(BACKUP, b);
    if (n) toast(n + (n === 1 ? ' tekst die nog niet bewaard was, wordt nu alsnog bewaard.' : ' teksten die nog niet bewaard waren, worden nu alsnog bewaard.'), 'info');
  }

  function poll() {
    if (document.visibilityState !== 'visible' || !since) return;
    api('/changes?since=' + encodeURIComponent(since)).then(function (res) {
      var d = res.data, structural = false, patChanged2 = false;
      d.cases.forEach(function (c) { if (!cases.has(c.id)) structural = true; var oud = cases.get(c.id); applyCase(c); if (cases.get(c.id) !== oud) { buildRefIndex(); if (!structural) fill(c.id); } });
      d.patterns.forEach(function (p) { var oud = patterns.get(p.id); applyPattern(p); if (patterns.get(p.id) !== oud) patChanged2 = true; });
      var ids = new Set(d.pattern_ids); patterns.forEach(function (p, id) { if (!ids.has(id)) { patterns.delete(id); patChanged2 = true; } });
      since = d.now;
      if (structural) layout(); else if (d.cases.length) { applyFilters(); refreshCounts(); }
      if (patChanged2) { renderFilterChips(); built.forEach(function (el, id) { fill(id); }); if (tab === 'patronen') renderPatterns(); }
      $('syncState').textContent = 'Bijgewerkt om ' + new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
    }).catch(function () { /* volgende ronde opnieuw */ });
  }

  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var data = await res.json();
      if (data.navbarHtml && window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
    } catch (e) { /* navbar is niet essentieel */ }
    var savedF = load('oc-filt', null);
    if (savedF && typeof savedF === 'object') { filt.status = savedF.status || 'todo'; filt.prio = savedF.prio || ''; filt.domein = savedF.domein || ''; }
    var hash = (location.hash || '').slice(1);
    try {
      await bootstrap();
      if (hash === 'patronen' || hash === 'skill') setTab(hash);
      else if (hash.slice(0, 5) === 'case/' && cases.has(hash.slice(5))) goCase(hash.slice(5));
      pollTimer = setInterval(poll, POLL_MS);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') poll(); });
    } catch (e) {
      $('caseEmpty').classList.remove('hidden'); $('caseEmptyText').textContent = 'De cases konden niet geladen worden: ' + e.message;
      notice('Laden mislukt: ' + e.message + '. Herlaad de pagina.', 'warn');
    }
    icons();
  }

  init();
})();
