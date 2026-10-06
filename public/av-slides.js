/**
 * AV-slides -- scherm.
 *
 * REGEL 3 uit CLAUDE.md: event handlers via data-attributen + één centrale
 * listener. Praat uitsluitend met /av-slides/api/*.
 *
 * Het voorbeeld tekent wat de SERVER berekent (POST /api/layout): dezelfde
 * vormen die ook naar Google Slides gaan. Hier wordt enkel geschilderd; er staat
 * geen enkele maat of positie in dit bestand. Wil je iets op de slide anders,
 * dan is dat src/modules/av-slides/lib/layout.js.
 */

(function () {
  'use strict';

  var BASE = '/av-slides/api';
  var LH = 1.22;          // = LINE_HEIGHT in layout.js
  var ROUND = 1 / 6;      // = ROUND_RATIO in layout.js

  var BLOK_NAMEN = { birthdays: 'Hipperdepiep (verjaardagen)', weetje: 'Wist je dat… (weetje)', review: 'Review' };
  var STIJLEN = [['mint', 'Mint'], ['sky', 'Blauw'], ['pink', 'Roze'], ['yellow', 'Geel'], ['white', 'Wit met rand']];
  var SOORT = { event: 'Event', birthday: 'Verjaardag', holiday: 'Feestdag', custom: 'Eigen kaart' };
  var GROEP = { cijfer: 'Cijfers', website: 'Website' };

  var state = {
    month: null,
    edition: null,
    defaults: null,
    tab: 'wist',
    layout: null,
    saveTimer: null,
    previewTimer: null,
    saving: null,
    fonts: {},
    thingies: [],
    thingyDefaults: {}
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function toast(bericht, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : 'alert-success') + ' text-sm';
    el.textContent = bericht;
    $('toastHost').appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  async function api(pad, opties) {
    var res = await fetch(BASE + pad, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, opties || {}));
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) {
      var err = new Error(data.error || ('Fout ' + res.status));
      err.code = data.code || null;
      err.data = data;
      throw err;
    }
    return data;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function C() { return state.edition.content; }

  function zetPad(obj, pad, waarde) {
    var delen = pad.split('.');
    var o = obj;
    for (var i = 0; i < delen.length - 1; i++) {
      if (!o[delen[i]] || typeof o[delen[i]] !== 'object') o[delen[i]] = {};
      o = o[delen[i]];
    }
    o[delen[delen.length - 1]] = waarde;
  }

  function blokVan(key) {
    return (C().wist.blocks || []).find(function (b) { return b.key === key; });
  }

  function kaartVan(key) {
    return (C().prikbord.cards || []).find(function (k) { return k.key === key; });
  }

  function huidigeMaand() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function uur(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ── Bewaren en voorbeeld ───────────────────────────────────────────────────

  function gewijzigd() {
    planVoorbeeld(300);
    planBewaren();
  }

  function planBewaren() {
    $('saveState').textContent = 'Niet bewaard…';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(bewaar, 1000);
  }

  async function bewaar() {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (!state.edition) return;
    var maand = state.month;
    $('saveState').textContent = 'Bewaren…';
    state.saving = api('/editions/' + maand, {
      method: 'PUT',
      body: JSON.stringify({ av_date: state.edition.av_date, content: C() })
    }).then(function () {
      $('saveState').textContent = 'Bewaard om ' + uur(new Date());
    }).catch(function (err) {
      $('saveState').textContent = 'Niet bewaard: ' + err.message;
      toast('Bewaren mislukt: ' + err.message, 'error');
    });
    await state.saving;
    state.saving = null;
  }

  async function bewaarNu() {
    if (state.saveTimer) await bewaar();
    else if (state.saving) await state.saving;
  }

  function planVoorbeeld(wacht) {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(laadVoorbeeld, wacht);
  }

  async function laadVoorbeeld() {
    if (!state.edition) return;
    try {
      laadLettertypes(C().style || {});
      state.layout = (await api('/layout', { method: 'POST', body: JSON.stringify({ content: C() }) })).data;
      schilderVoorbeeld();
    } catch (err) {
      toast('Voorbeeld mislukt: ' + err.message, 'error');
    }
  }

  function laadLettertypes(stijl) {
    [stijl.titleFont, stijl.bodyFont].forEach(function (naam) {
      if (!naam || state.fonts[naam]) return;
      state.fonts[naam] = true;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(naam).replace(/%20/g, '+') + ':wght@400;700&display=swap';
      // Een lettertype zonder vet geeft een fout op die vraag: dan zonder gewicht.
      link.onerror = function () {
        link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(naam).replace(/%20/g, '+') + '&display=swap';
        link.onerror = null;
      };
      document.head.appendChild(link);
    });
  }

  // ── Het voorbeeld schilderen ───────────────────────────────────────────────

  var VERTICAAL = { TOP: 'flex-start', MIDDLE: 'center', BOTTOM: 'flex-end' };
  var HORIZONTAAL = { START: 'left', CENTER: 'center', END: 'right' };

  function schilder(host, elementen) {
    host.innerHTML = '';
    var binnen = document.createElement('div');
    binnen.className = 'av-slide-binnen';
    (elementen || []).forEach(function (el) {
      var d = document.createElement(el.type === 'image' ? 'img' : 'div');
      d.className = 'av-el' + (el.type === 'text' ? ' av-tekst' : '');
      d.style.left = el.x + 'px';
      d.style.top = el.y + 'px';
      d.style.width = el.w + 'px';
      d.style.height = el.h + 'px';
      if (el.rotate) d.style.transform = 'rotate(' + el.rotate + 'deg)';

      if (el.type === 'image') {
        d.src = el.url;
        d.alt = '';
        d.style.objectFit = 'contain';
      } else if (el.type === 'shape') {
        d.style.background = el.fill;
        if (el.shape === 'ELLIPSE') d.style.borderRadius = '50%';
        else if (el.shape === 'ROUND_RECTANGLE') d.style.borderRadius = (Math.min(el.w, el.h) * ROUND) + 'px';
        if (el.line) {
          // Slides tekent een rand OP de omtrek (half binnen, half buiten).
          d.style.outline = el.line.weight + 'px solid ' + el.line.color;
          d.style.outlineOffset = (-el.line.weight / 2) + 'px';
        }
      } else if (el.type === 'text') {
        d.style.padding = el.inset + 'px';
        d.style.justifyContent = VERTICAAL[el.valign] || 'flex-start';
        var t = document.createElement('div');
        t.style.textAlign = HORIZONTAAL[el.align] || 'left';
        t.style.lineHeight = String(LH * (el.lineSpacing || 100) / 100);
        el.runs.forEach(function (r) {
          var s = document.createElement('span');
          s.textContent = r.text;
          s.style.fontFamily = "'" + r.font + "', sans-serif";
          s.style.fontSize = r.size + 'px';
          s.style.fontWeight = r.bold ? '700' : '400';
          s.style.color = r.color;
          t.appendChild(s);
        });
        d.appendChild(t);
      }
      binnen.appendChild(d);
    });
    host.appendChild(binnen);
    schaal();
  }

  function schaal() {
    var host = $('preview');
    var binnen = host.querySelector('.av-slide-binnen');
    if (binnen) binnen.style.transform = 'scale(' + (host.clientWidth / 960) + ')';
  }

  function schilderVoorbeeld() {
    if (!state.layout) return;
    schilder($('preview'), state.tab === 'wist' ? state.layout.wist : state.layout.prik);
    var w = state.layout.warnings || [];
    $('warnings').innerHTML = w.map(function (t) {
      return '<div class="alert alert-warning text-sm py-2">' + esc(t) + '</div>';
    }).join('');
  }

  // ── Editor: Wist-je-weetje ─────────────────────────────────────────────────

  function kaart(inhoud) {
    return '<div class="card bg-base-100"><div class="card-body p-4 gap-2">' + inhoud + '</div></div>';
  }

  function tekeningUrl(naam) {
    var t = state.thingies.find(function (x) { return x.name === naam; });
    return t ? (t.png || t.svg) : '';
  }

  /** Keuzelijst met de tekeningetjes uit de Asset Manager, met een miniatuur ervoor. */
  function tekeningKeuze(attrs, huidig, leegLabel) {
    var url = tekeningUrl(huidig);
    var bekend = !huidig || state.thingies.some(function (t) { return t.name === huidig; });
    return `<span class="inline-flex items-center gap-1">
      <span class="w-6 h-6 inline-flex items-center justify-center shrink-0">${url ? `<img src="${esc(url)}" alt="" class="w-6 h-6 object-contain">` : ''}</span>
      <select class="select select-bordered select-xs" ${attrs} title="Tekening">
        <option value="" ${!huidig ? 'selected' : ''}>${esc(leegLabel || 'Geen tekening')}</option>
        ${bekend ? '' : `<option value="${esc(huidig)}" selected>${esc(huidig)} (niet gevonden)</option>`}
        ${state.thingies.map(function (t) { return `<option value="${esc(t.name)}" ${t.name === huidig ? 'selected' : ''}>${esc(t.label)}</option>`; }).join('')}
      </select>
    </span>`;
  }

  function stijlKeuze(b) {
    return `<select class="select select-bordered select-xs" data-block-key="${esc(b.key)}" data-block-field="style" title="Kleur">
      ${STIJLEN.map(function (s) { return `<option value="${s[0]}" ${b.style === s[0] ? 'selected' : ''}>${s[1]}</option>`; }).join('')}
    </select>`;
  }

  // Het weetjesblok bewaart één weetje per regel in `text`; op de slide wordt
  // dat een opsomming (layout.js, blokRegels).
  function weetjesRegels(b) {
    var t = String((b && b.text) || '');
    return t === '' ? [] : t.split('\n');
  }

  function staatErin(tekst) {
    return weetjesRegels(blokVan('weetje')).some(function (r) { return r.trim() === String(tekst).trim(); });
  }

  function weetjesInvoer(b) {
    var regels = weetjesRegels(b);
    var rijen = regels.map(function (r, i) {
      return `<div class="flex gap-1 items-start">
        <textarea class="textarea textarea-bordered textarea-sm flex-1 leading-snug" rows="2" data-weetje-index="${i}">${esc(r)}</textarea>
        <button class="btn btn-ghost btn-xs btn-square mt-1" data-action="weetje-remove" data-index="${i}" title="Weghalen"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>`;
    }).join('');
    return `<div class="space-y-1">
      ${rijen || '<p class="text-xs opacity-60">Nog geen weetjes. Voeg er een toe uit de voorstellen hieronder, of schrijf er zelf een.</p>'}
      <button class="btn btn-xs" data-action="weetje-add-own"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Eigen weetje</button>
    </div>`;
  }

  function weetjesLijst() {
    var lijst = C().insights || [];
    if (!lijst.length) {
      return '<p class="text-xs opacity-60">Geen weetjes gevonden voor de vorige maand. Klik op "Gegevens ophalen".</p>';
    }
    var html = '<div class="text-xs font-medium opacity-70 mt-2">Voorstellen, uit de cijfers van vorige maand. Wat je toevoegt, kan je hierboven herschrijven.</div>';
    ['cijfer', 'website'].forEach(function (groep) {
      var deel = lijst.map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return x.w.group === groep; });
      if (!deel.length) return;
      html += `<div class="text-xs uppercase tracking-wide opacity-50 mt-2">${GROEP[groep]}</div>`;
      html += deel.map(function (x) {
        return `<div class="rounded-lg bg-base-200 p-2 text-xs space-y-1">
          <div class="font-medium">${esc(x.w.label)}</div>
          <div>${esc(x.w.text)}</div>
          ${x.w.note ? `<div class="opacity-60 italic">${esc(x.w.note)}</div>` : ''}
          <div class="flex gap-1 pt-1">
            ${staatErin(x.w.text)
              ? '<span class="badge badge-success badge-sm">staat erin</span>'
              : `<button class="btn btn-xs" data-action="insight-add" data-index="${x.i}"><i data-lucide="plus" class="w-3 h-3"></i> Toevoegen</button>`}
          </div>
        </div>`;
      }).join('');
    });
    return html;
  }

  function blokKaart(b, i, n) {
    var k = esc(b.key);
    var kop = `<div class="flex items-center gap-2">
      <input type="checkbox" class="checkbox checkbox-sm" data-block-key="${k}" data-block-field="include" ${b.include !== false ? 'checked' : ''} title="Op de slide">
      <h3 class="font-semibold text-sm flex-1">${esc(BLOK_NAMEN[b.key] || b.key)}</h3>
      ${stijlKeuze(b)}
      <button class="btn btn-ghost btn-xs btn-square" data-action="block-up" data-key="${k}" ${i === 0 ? 'disabled' : ''} title="Hoger"><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>
      <button class="btn btn-ghost btn-xs btn-square" data-action="block-down" data-key="${k}" ${i === n - 1 ? 'disabled' : ''} title="Lager"><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>
    </div>`;

    if (b.type === 'review') {
      return kaart(kop + `
        <p class="text-xs opacity-60">Plak een review van Google, LinkedIn of een mail van een klant.</p>
        <div class="grid grid-cols-2 gap-2">
          <input class="input input-bordered input-sm" placeholder="Naam" data-block-key="${k}" data-block-field="name" value="${esc(b.name)}">
          <input class="input input-bordered input-sm" placeholder="Bron (Google)" data-block-key="${k}" data-block-field="source" value="${esc(b.source)}">
          <select class="select select-bordered select-sm" data-block-key="${k}" data-block-field="stars">
            ${[5, 4, 3, 2, 1].map(function (s) { return `<option value="${s}" ${Number(b.stars) === s ? 'selected' : ''}>${s} ster${s > 1 ? 'ren' : ''}</option>`; }).join('')}
          </select>
          <input class="input input-bordered input-sm" placeholder="Wanneer (een week geleden)" data-block-key="${k}" data-block-field="when" value="${esc(b.when)}">
        </div>
        <textarea class="textarea textarea-bordered textarea-sm w-full" rows="4" placeholder="De review zelf" data-block-key="${k}" data-block-field="text">${esc(b.text)}</textarea>`);
    }

    var extra = '';
    if (b.key === 'birthdays') {
      extra = `<div class="flex justify-end"><button class="btn btn-ghost btn-xs" data-action="reset-birthdays"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Standaardtekst</button></div>`;
    }
    if (b.key === 'weetje') extra = weetjesLijst();
    return kaart(kop + `
      <input class="input input-bordered input-sm w-full" placeholder="Kop" data-block-key="${k}" data-block-field="title" value="${esc(b.title)}">
      <div class="flex items-center gap-2 text-xs"><span class="opacity-70">Tekening rechtsboven</span>${tekeningKeuze(`data-block-key="${k}" data-block-field="thingy"`, b.thingy || '', 'Geen')}</div>
      ${b.key === 'weetje'
        ? weetjesInvoer(b)
        : `<textarea class="textarea textarea-bordered textarea-sm w-full" rows="5" data-block-key="${k}" data-block-field="text">${esc(b.text)}</textarea>`}
      ${extra}`);
  }

  function renderWist() {
    var w = C().wist;
    var html = kaart(`<label class="form-control">
        <span class="label-text text-xs mb-1">Titel</span>
        <input class="input input-bordered input-sm w-full" data-field="wist.title" value="${esc(w.title)}">
      </label>`);

    html += kaart(`<div class="flex items-center justify-between">
        <h3 class="font-semibold text-sm">Beeld links</h3>
        ${w.image ? '<button class="btn btn-ghost btn-xs" data-action="remove-image">Weghalen</button>' : ''}
      </div>
      <div class="av-drop rounded-lg p-4 text-center cursor-pointer" data-action="pick-image" data-drop="image">
        ${w.image
          ? `<img src="/assets/${esc(w.image.key)}" alt="" class="max-h-40 mx-auto rounded pointer-events-none">`
          : '<i data-lucide="image-plus" class="w-6 h-6 mx-auto opacity-50 pointer-events-none"></i>'}
        <p class="text-xs opacity-70 mt-2 pointer-events-none">Klik, sleep een beeld hierheen, of plak een screenshot (Ctrl+V).</p>
      </div>
      <p class="text-xs opacity-60">Bijvoorbeeld een nieuwe functie of een stuk van de academy. Zonder beeld nemen de blokken de volle breedte.</p>`);

    var blokken = w.blocks || [];
    blokken.forEach(function (b, i) { html += blokKaart(b, i, blokken.length); });

    html += kaart(`<h3 class="font-semibold text-sm">Lettertypes</h3>
      <p class="text-xs opacity-60">Namen van Google Fonts, zodat de slides passen bij de rest van de presentatie. Gelden voor beide slides.</p>
      <div class="grid grid-cols-2 gap-2">
        <label class="form-control"><span class="label-text text-xs mb-1">Titels</span>
          <input class="input input-bordered input-sm" data-field="style.titleFont" value="${esc((C().style || {}).titleFont)}"></label>
        <label class="form-control"><span class="label-text text-xs mb-1">Tekst</span>
          <input class="input input-bordered input-sm" data-field="style.bodyFont" value="${esc((C().style || {}).bodyFont)}"></label>
      </div>`);

    $('editorWist').innerHTML = html;
  }

  // ── Editor: Prikbord ───────────────────────────────────────────────────────

  function gesorteerdeKaarten() {
    return (C().prikbord.cards || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }

  function kaartRij(k) {
    var key = esc(k.key);
    var metTekst = k.kind === 'event' || k.kind === 'custom';
    var soort = SOORT[k.kind] || k.kind;
    if (k.meta && k.meta.type) soort += ' · ' + k.meta.type;
    return `<div class="py-2 border-t border-base-content/10 space-y-1 ${k.include === false ? 'opacity-50' : ''}" data-card-row="${key}">
      <div class="flex flex-wrap items-center gap-2">
        <input type="checkbox" class="checkbox checkbox-sm" data-card-key="${key}" data-card-field="include" ${k.include !== false ? 'checked' : ''} title="Op het prikbord">
        <input type="date" class="input input-bordered input-xs" data-card-key="${key}" data-card-field="date" value="${esc(k.date)}">
        <span class="badge badge-ghost badge-sm">${esc(soort)}</span>
        <span class="ml-auto"></span>
        ${tekeningKeuze(`data-card-key="${key}" data-card-field="thingy"`, k.thingy || '', 'Emoji')}
        ${k.thingy ? '' : `<input class="input input-bordered input-xs w-12 text-center" data-card-key="${key}" data-card-field="emoji" value="${esc(k.emoji)}" title="Emoji (als er geen tekening is)">`}
        <select class="select select-bordered select-xs" data-card-key="${key}" data-card-field="span" title="Breedte">
          <option value="1" ${k.span !== 2 ? 'selected' : ''}>Smal</option>
          <option value="2" ${k.span === 2 ? 'selected' : ''}>Breed</option>
        </select>
        ${k.kind === 'custom' ? `<button class="btn btn-ghost btn-xs btn-square" data-action="card-delete" data-key="${key}" title="Weghalen"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
      </div>
      <input class="input input-bordered input-xs w-full" data-card-key="${key}" data-card-field="title" value="${esc(k.title)}" placeholder="${metTekst ? 'Vetgedrukt deel' : 'Naam'}">
      ${metTekst ? `<input class="input input-bordered input-xs w-full" data-card-key="${key}" data-card-field="text" value="${esc(k.text)}" placeholder="Gewone tekst">` : ''}
    </div>`;
  }

  function renderPrik() {
    var p = C().prikbord;
    var kaarten = gesorteerdeKaarten();
    var aan = kaarten.filter(function (k) { return k.include !== false; }).length;
    var html = kaart(`<label class="form-control">
        <span class="label-text text-xs mb-1">Titel</span>
        <input class="input input-bordered input-sm w-full" data-field="prikbord.title" value="${esc(p.title)}">
      </label>
      <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <div class="flex items-center gap-2"><span class="opacity-70">Bij de titel</span>${tekeningKeuze('data-field="prikbord.icon"', p.icon === undefined ? (state.thingyDefaults.icon || '') : p.icon, 'Geen')}</div>
        <div class="flex items-center gap-2"><span class="opacity-70">Rechtsboven</span>${tekeningKeuze('data-field="prikbord.decor"', p.decor === undefined ? (state.thingyDefaults.decor || '') : p.decor, 'Geen')}</div>
      </div>
      <p class="text-xs opacity-60">Venster: ${esc(p.from || '?')} tot en met ${esc(p.until || '?')}. Pas het bovenaan aan en klik op "Gegevens ophalen".</p>`);

    html += kaart(`<div class="flex items-center justify-between">
        <h3 class="font-semibold text-sm">Kaarten <span class="opacity-60 font-normal">(${aan} van ${kaarten.length} op het prikbord)</span></h3>
        <button class="btn btn-xs" data-action="card-add"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Eigen kaart</button>
      </div>
      <p class="text-xs opacity-60">Een brede kaart neemt twee plaatsen in. Zes plaatsen per rij; meer dan vier rijen maakt alles klein.</p>
      <div>${kaarten.map(kaartRij).join('') || '<p class="text-xs opacity-60 py-2">Geen kaarten in dit venster.</p>'}</div>`);

    $('editorPrik').innerHTML = html;
  }

  function renderEditor() {
    renderWist();
    renderPrik();
    refreshIcons();
  }

  // ── Scherm ─────────────────────────────────────────────────────────────────

  function render() {
    var heeft = Boolean(state.edition);
    $('emptyState').classList.toggle('hidden', heeft);
    $('workspace').classList.toggle('hidden', !heeft);
    if (!heeft) {
      $('preview').innerHTML = '';
      refreshIcons();
      return;
    }
    renderEditor();
    toonTab();
    planVoorbeeld(0);
  }

  function toonTab() {
    document.querySelectorAll('[data-av-tab]').forEach(function (t) {
      t.classList.toggle('tab-active', t.dataset.avTab === state.tab);
    });
    $('editorWist').classList.toggle('hidden', state.tab !== 'wist');
    $('editorPrik').classList.toggle('hidden', state.tab !== 'prik');
    schilderVoorbeeld();
  }

  function zetControles() {
    var e = state.edition;
    var d = state.defaults || {};
    var p = e && e.content && e.content.prikbord ? e.content.prikbord : {};
    $('fMonth').value = state.month;
    $('fAvDate').value = (e && e.av_date) || d.av_date || '';
    $('fFrom').value = p.from || d.from || '';
    $('fUntil').value = p.until || d.until || '';
    $('fPresentation').value = (e && e.presentation_url) || '';
    $('insertResult').innerHTML = e && e.inserted_at
      ? `<p class="text-xs opacity-60">Laatst ingevoegd op ${esc(new Date(e.inserted_at).toLocaleString('nl-BE'))}.</p>`
      : '';
  }

  function toonMeldingen(lijst) {
    var el = $('meldingen');
    if (!lijst || !lijst.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.innerHTML = '<div class="alert alert-warning text-sm"><div>' +
      lijst.map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('') + '</div></div>';
    el.classList.remove('hidden');
  }

  async function laadMaand(maand) {
    await bewaarNu();
    state.month = maand;
    state.layout = null;
    toonMeldingen([]);
    var u = new URL(window.location.href);
    u.searchParams.set('maand', maand);
    window.history.replaceState(null, '', u);
    try {
      var res = await api('/editions/' + maand);
      state.edition = res.data;
      state.defaults = res.defaults;
    } catch (err) {
      state.edition = null;
      toast(err.message, 'error');
    }
    $('saveState').textContent = '';
    zetControles();
    render();
  }

  async function haalGegevens() {
    var knoppen = document.querySelectorAll('[data-action="generate"]');
    knoppen.forEach(function (b) { b.disabled = true; b.classList.add('loading'); });
    try {
      await bewaarNu();
      var res = await api('/editions/' + state.month + '/generate', {
        method: 'POST',
        body: JSON.stringify({ av_date: $('fAvDate').value, from: $('fFrom').value, until: $('fUntil').value })
      });
      state.edition = res.data;
      toonMeldingen(res.meldingen);
      zetControles();
      render();
      $('saveState').textContent = 'Bewaard om ' + uur(new Date());
      toast('Gegevens opgehaald.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      knoppen.forEach(function (b) { b.disabled = false; b.classList.remove('loading'); });
    }
  }

  async function zetInPresentatie() {
    var url = $('fPresentation').value.trim();
    if (!url) { toast('Plak eerst de link van de presentatie.', 'error'); return; }
    var knop = $('insertBtn');
    knop.disabled = true;
    knop.classList.add('loading');
    $('insertResult').innerHTML = '<p class="text-xs opacity-60">Bezig… dit duurt een paar seconden.</p>';
    try {
      await bewaarNu();
      var voegIn = function () {
        return api('/editions/' + state.month + '/insert', {
          method: 'POST',
          body: JSON.stringify({ presentation_url: url, google_email: namensAdres() })
        }).then(function (res) { return res.data; });
      };
      var r;
      try {
        r = await voegIn();
      } catch (err) {
        // Google Slides kent geen SVG: de server zegt welke tekeningen nog een
        // PNG-kopie nodig hebben, die maken we hier en dan opnieuw.
        if (err.code !== 'DRAWINGS_MISSING') throw err;
        $('insertResult').innerHTML = '<p class="text-xs opacity-60">Tekeningen omzetten naar PNG…</p>';
        await maakPngs((err.data && err.data.missing) || []);
        r = await voegIn();
      }
      $('insertResult').innerHTML = `<div class="alert alert-success text-sm py-2">
        <span>Staat erin${r.title ? ' (' + esc(r.title) + ')' : ''}${r.replaced ? ', de vorige versie is vervangen' : ''}.</span>
        <a class="btn btn-xs" href="${esc(r.url)}" target="_blank" rel="noopener">Open presentatie</a>
      </div>`;
    } catch (err) {
      $('insertResult').innerHTML = '<div class="alert alert-error text-sm py-2">' + esc(err.message) + '</div>';
      if (err.code === 'SCOPE_NOT_AUTHORIZED' || err.code === 'API_DISABLED') $('setupHelp').open = true;
    } finally {
      knop.disabled = false;
      knop.classList.remove('loading');
    }
  }

  // Namens welk Google-account (enkel voor beheerders zichtbaar; de server
  // controleert het opnieuw). Onthouden in deze browser.
  function namensAdres() {
    var el = $('fGoogleAs');
    var v = el && !$('googleAsRow').classList.contains('hidden') ? el.value.trim().toLowerCase() : '';
    try { localStorage.setItem('av-slides-google-as', v); } catch (_) { /* geen opslag */ }
    return v;
  }

  async function controleerInstelling() {
    var el = $('setupCheck');
    el.innerHTML = '<p class="opacity-60">Bezig…</p>';
    try {
      var d = (await api('/setup/check' + (namensAdres() ? '?als=' + encodeURIComponent(namensAdres()) : ''))).data;
      var regel = function (naam, r) {
        return `<div class="flex gap-2 items-start">
          <span class="${r.ok ? 'text-success' : 'text-error'} font-bold">${r.ok ? '✓' : '✗'}</span>
          <span><strong>${esc(naam)}</strong>${r.ok ? '' : ': ' + esc(r.error)}</span>
        </div>`;
      };
      var uitleg = d.slides.ok
        ? 'Alles klopt: je kan de slides invoegen.'
        : d.controle.ok
          ? 'Het service-account werkt, alleen de scope voor Slides is (nog) niet actief. Staat ze al in de Admin Console, dan heeft Google de wijziging nog niet doorgevoerd: dat kan tot 24 uur duren.'
          : 'Ook een scope die al lang werkt, wordt geweigerd: dan klopt het service-account zelf niet (een ander client-ID of een andere sleutel).';
      el.innerHTML = regel('Slides (presentations)', d.slides) + regel('Controle (gmail.settings.basic)', d.controle) +
        `<p class="pt-1">${esc(uitleg)}</p><p class="opacity-60">Getest namens ${esc(d.email)}, client-ID ${esc(d.client_id || '?')}.</p>`;
    } catch (err) {
      el.innerHTML = '<p class="text-error">' + esc(err.message) + '</p>';
    }
  }

  // ── Tekeningen: SVG -> PNG ─────────────────────────────────────────────────

  async function svgNaarPng(url, maat) {
    var tekst = await (await fetch(url, { credentials: 'include' })).text();
    var svg = new DOMParser().parseFromString(tekst, 'image/svg+xml').documentElement;
    var vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    var w = vb.length === 4 && vb[2] > 0 ? vb[2] : (parseFloat(svg.getAttribute('width')) || maat);
    var h = vb.length === 4 && vb[3] > 0 ? vb[3] : (parseFloat(svg.getAttribute('height')) || maat);
    var s = maat / Math.max(w, h);
    var bw = Math.round(w * s);
    var bh = Math.round(h * s);
    // Een SVG met enkel een viewBox heeft geen eigen maat: die zetten we erop.
    svg.setAttribute('width', String(bw));
    svg.setAttribute('height', String(bh));
    var objUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      var img = new Image();
      img.src = objUrl;
      await img.decode();
      var c = document.createElement('canvas');
      c.width = bw;
      c.height = bh;
      c.getContext('2d').drawImage(img, 0, 0, bw, bh);
      return await new Promise(function (ok, nok) {
        c.toBlob(function (b) { if (b) ok(b); else nok(new Error('geen PNG')); }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  async function maakPngs(namen) {
    for (var i = 0; i < namen.length; i++) {
      var t = state.thingies.find(function (x) { return x.name === namen[i]; });
      if (!t) continue;
      var png = await svgNaarPng(t.svg, 512);
      var res = await fetch(BASE + '/thingies/' + encodeURIComponent(t.name), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'image/png' },
        body: png
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.success === false) throw new Error('Tekening "' + t.label + '" omzetten mislukt: ' + (data.error || res.status));
      t.png = data.data.png;
    }
  }

  // ── Exporteren, zonder Google-koppeling ───────────────────────────────────
  //
  // Beide gaan uit van dezelfde vormen als het voorbeeld (POST /api/layout):
  // de PNG is het voorbeeld zelf, gefotografeerd; de PowerPoint zet elke vorm om
  // naar een PowerPoint-vorm. Google Slides maakt er bij "Slides importeren"
  // gewone, bewerkbare vormen van.

  var SLIDES = [['wist', 'Wist-je-weetje'], ['prik', 'Prikbord']];
  var INCH = 10 / 960;   // een 16:9-dia is 10 x 5,625 inch
  var PPT_H = { START: 'left', CENTER: 'center', END: 'right' };
  var PPT_V = { TOP: 'top', MIDDLE: 'middle', BOTTOM: 'bottom' };

  function laadScript(src, globaal) {
    if (window[globaal]) return Promise.resolve(window[globaal]);
    return new Promise(function (ok, nok) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { if (window[globaal]) ok(window[globaal]); else nok(new Error(globaal + ' niet geladen')); };
      s.onerror = function () { nok(new Error('Kon ' + src + ' niet laden')); };
      document.head.appendChild(s);
    });
  }

  async function metKnop(knop, fn, gelukt) {
    knop.disabled = true;
    knop.classList.add('loading');
    try {
      await fn();
      toast(gelukt);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      knop.disabled = false;
      knop.classList.remove('loading');
    }
  }

  async function verseLayout() {
    await bewaarNu();
    state.layout = (await api('/layout', { method: 'POST', body: JSON.stringify({ content: C() }) })).data;
    return state.layout;
  }

  function download(href, naam) {
    var a = document.createElement('a');
    a.href = href;
    a.download = naam;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function exportPng() {
    var lib = await laadScript('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js', 'htmlToImage');
    var layout = await verseLayout();
    for (var i = 0; i < SLIDES.length; i++) {
      // Buiten beeld, op ware grootte: niet het geschaalde voorbeeld fotograferen.
      var host = document.createElement('div');
      host.className = 'av-slide';
      host.style.cssText = 'position:fixed;left:-20000px;top:0;width:960px;';
      document.body.appendChild(host);
      try {
        schilder(host, layout[SLIDES[i][0]]);
        var binnen = host.querySelector('.av-slide-binnen');
        binnen.style.transform = 'none';
        await document.fonts.ready;
        await Promise.all(Array.prototype.map.call(host.querySelectorAll('img'), function (img) {
          return img.decode().catch(function () { /* een beeld dat niet laadt, valt weg */ });
        }));
        var png = await lib.toPng(binnen, { width: 960, height: 540, pixelRatio: 2, backgroundColor: '#ffffff' });
        download(png, 'AV ' + state.month + ' - ' + SLIDES[i][1] + '.png');
      } finally {
        host.remove();
      }
    }
  }

  function pptKleur(hex) {
    return String(hex || '#000000').replace('#', '').toUpperCase();
  }

  async function beeldVoorPptx(url) {
    var blob = /\.svg(\?|$)/i.test(url) ? await svgNaarPng(url, 512) : await (await fetch(url, { credentials: 'include' })).blob();
    if (['image/png', 'image/jpeg', 'image/gif'].indexOf(blob.type) < 0) blob = await naarPng(blob);
    var bmp = await createImageBitmap(blob);
    var data = await new Promise(function (ok) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.readAsDataURL(blob);
    });
    return { data: String(data).replace(/^data:/, ''), w: bmp.width, h: bmp.height };
  }

  async function exportPptx() {
    var Pptx = await laadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', 'PptxGenJS');
    var layout = await verseLayout();
    var pptx = new Pptx();
    pptx.layout = 'LAYOUT_16x9';
    var beelden = {};
    for (var i = 0; i < SLIDES.length; i++) {
      var dia = pptx.addSlide();
      var els = layout[SLIDES[i][0]] || [];
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (el.type === 'shape') {
          // Een roundRect zonder eigen straal krijgt de standaard van 1/6 van de
          // kortste zijde: exact ROUND_RATIO uit layout.js.
          dia.addShape(el.shape === 'ELLIPSE' ? pptx.ShapeType.ellipse : (el.shape === 'ROUND_RECTANGLE' ? pptx.ShapeType.roundRect : pptx.ShapeType.rect), {
            x: el.x * INCH, y: el.y * INCH, w: el.w * INCH, h: el.h * INCH,
            fill: { color: pptKleur(el.fill) },
            line: el.line ? { color: pptKleur(el.line.color), width: el.line.weight * 0.75 } : { type: 'none' },
            rotate: el.rotate || 0
          });
        } else if (el.type === 'text') {
          // Op het vlak waarin de tekst moet staan, zonder binnenmarge: zo hangt
          // het niet af van welke standaardmarge het programma invult.
          dia.addText(el.runs.map(function (r) {
            return { text: r.text, options: { fontFace: r.font, fontSize: Math.round(r.size * 0.75 * 10) / 10, bold: Boolean(r.bold), color: pptKleur(r.color) } };
          }), {
            x: (el.x + el.inset) * INCH, y: (el.y + el.inset) * INCH,
            w: (el.w - 2 * el.inset) * INCH, h: (el.h - 2 * el.inset) * INCH,
            margin: 0,
            align: PPT_H[el.align] || 'left',
            valign: PPT_V[el.valign] || 'top',
            lineSpacingMultiple: (el.lineSpacing || 100) / 100,
            paraSpaceBefore: 0,
            paraSpaceAfter: 0,
            fit: 'none',
            wrap: true,
            rotate: el.rotate || 0
          });
        } else if (el.type === 'image') {
          var b = beelden[el.url] || (beelden[el.url] = await beeldVoorPptx(el.url));
          // Passend in het vak, zoals Google Slides en het voorbeeld (contain).
          var f = Math.min(el.w / b.w, el.h / b.h);
          var bw = b.w * f;
          var bh = b.h * f;
          dia.addImage({
            data: b.data,
            x: (el.x + (el.w - bw) / 2) * INCH, y: (el.y + (el.h - bh) / 2) * INCH,
            w: bw * INCH, h: bh * INCH,
            rotate: el.rotate || 0
          });
        }
      }
    }
    await pptx.writeFile({ fileName: 'AV-slides ' + state.month + '.pptx' });
  }

  // ── Beeld ──────────────────────────────────────────────────────────────────

  function naarPng(bestand) {
    return createImageBitmap(bestand).then(function (bmp) {
      var c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      return new Promise(function (ok) { c.toBlob(ok, 'image/png'); });
    });
  }

  async function laadBeeldOp(bestand) {
    if (!bestand || !/^image\//.test(bestand.type)) { toast('Dat is geen beeld.', 'error'); return; }
    try {
      // Google Slides aanvaardt enkel PNG, JPEG en GIF: de rest wordt PNG.
      var blob = ['image/png', 'image/jpeg', 'image/gif'].indexOf(bestand.type) >= 0 ? bestand : await naarPng(bestand);
      var bmp = await createImageBitmap(blob);
      var res = await fetch(BASE + '/images', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': blob.type },
        body: blob
      });
      if (res.status === 401) { window.location.href = '/'; return; }
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.success === false) throw new Error(data.error || ('Fout ' + res.status));
      C().wist.image = { key: data.data.key, width: bmp.width, height: bmp.height };
      renderWist();
      refreshIcons();
      gewijzigd();
    } catch (err) {
      toast('Beeld niet opgeladen: ' + err.message, 'error');
    }
  }

  // ── Acties ─────────────────────────────────────────────────────────────────

  function verplaatsBlok(key, stap) {
    var lijst = C().wist.blocks;
    var i = lijst.findIndex(function (b) { return b.key === key; });
    var j = i + stap;
    if (i < 0 || j < 0 || j >= lijst.length) return;
    var tmp = lijst[i];
    lijst[i] = lijst[j];
    lijst[j] = tmp;
    renderWist();
    refreshIcons();
    gewijzigd();
  }

  function zetWeetjes(b, regels) {
    b.text = regels.join('\n');
    b.edited = true;
    renderWist();
    refreshIcons();
    gewijzigd();
  }

  function gebruikWeetje(index) {
    var w = (C().insights || [])[index];
    var b = blokVan('weetje');
    if (!w || !b) return;
    var regels = weetjesRegels(b).filter(function (r) { return r.trim(); });
    if (regels.indexOf(w.text) < 0) regels.push(w.text);
    b.include = true;
    zetWeetjes(b, regels);
  }

  function verwijderWeetje(index) {
    var b = blokVan('weetje');
    if (!b) return;
    var regels = weetjesRegels(b);
    regels.splice(index, 1);
    zetWeetjes(b, regels);
  }

  function eigenWeetje() {
    var b = blokVan('weetje');
    if (!b) return;
    var regels = weetjesRegels(b).filter(function (r) { return r.trim(); });
    regels.push('');
    b.include = true;
    zetWeetjes(b, regels);
    var velden = document.querySelectorAll('[data-weetje-index]');
    if (velden.length) velden[velden.length - 1].focus();
  }

  function nieuweKaart() {
    var p = C().prikbord;
    p.cards.push({
      key: 'custom:' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      kind: 'custom',
      date: p.from || $('fAvDate').value,
      emoji: '📌',
      thingy: state.thingyDefaults.custom || '',
      tint: '#fef3c7',
      title: '',
      text: '',
      span: 2,
      include: true,
      edited: true
    });
    renderPrik();
    refreshIcons();
    gewijzigd();
  }

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-av-tab]');
    if (tab) {
      state.tab = tab.dataset.avTab;
      toonTab();
      return;
    }
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var a = el.dataset.action;
    if (a === 'generate') haalGegevens();
    else if (a === 'insert') zetInPresentatie();
    else if (a === 'check-setup') controleerInstelling();
    else if (a === 'pick-image') $('imageInput').click();
    else if (a === 'remove-image') { C().wist.image = null; renderWist(); refreshIcons(); gewijzigd(); }
    else if (a === 'block-up') verplaatsBlok(el.dataset.key, -1);
    else if (a === 'block-down') verplaatsBlok(el.dataset.key, 1);
    else if (a === 'reset-birthdays') {
      var b = blokVan('birthdays');
      if (b) { b.text = C().birthdaysText || ''; b.edited = false; renderWist(); refreshIcons(); gewijzigd(); }
    }
    else if (a === 'insight-add') gebruikWeetje(Number(el.dataset.index));
    else if (a === 'weetje-remove') verwijderWeetje(Number(el.dataset.index));
    else if (a === 'weetje-add-own') eigenWeetje();
    else if (a === 'export-png') metKnop(el, exportPng, 'De PNG\'s zijn gedownload.');
    else if (a === 'export-pptx') metKnop(el, exportPptx, 'De PowerPoint is gedownload.');
    else if (a === 'card-add') nieuweKaart();
    else if (a === 'card-delete') {
      C().prikbord.cards = C().prikbord.cards.filter(function (k) { return k.key !== el.dataset.key; });
      renderPrik();
      refreshIcons();
      gewijzigd();
    }
  });

  // Typen: de toestand bijwerken, NIET de editor hertekenen (dan springt de cursor).
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!state.edition) return;
    if (t.dataset.weetjeIndex !== undefined) {
      var wb = blokVan('weetje');
      if (!wb) return;
      var regels = weetjesRegels(wb);
      regels[Number(t.dataset.weetjeIndex)] = t.value.replace(/\s*\n+\s*/g, ' ');
      wb.text = regels.join('\n');
      wb.edited = true;
      gewijzigd();
      return;
    }
    // Lettertypes pas bij het verlaten van het veld: anders laadt elke
    // tussenstand ("Yo", "You", ...) een eigen Google Fonts-link.
    if (t.dataset.field && t.dataset.field.indexOf('style.') !== 0) {
      zetPad(C(), t.dataset.field, t.value);
      gewijzigd();
    } else if (t.dataset.blockKey && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      var b = blokVan(t.dataset.blockKey);
      if (!b) return;
      b[t.dataset.blockField] = t.value;
      if (t.dataset.blockField === 'text' || t.dataset.blockField === 'title') b.edited = true;
      gewijzigd();
    } else if (t.dataset.cardKey && t.type !== 'checkbox' && t.type !== 'date' && t.tagName !== 'SELECT') {
      var k = kaartVan(t.dataset.cardKey);
      if (!k) return;
      k[t.dataset.cardField] = t.value;
      k.edited = true;
      gewijzigd();
    }
  });

  // Aanvinken, kiezen, datums: die mogen de lijst wel opnieuw schikken.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'fMonth') { if (t.value) laadMaand(t.value); return; }
    if (t.id === 'imageInput') { laadBeeldOp(t.files && t.files[0]); t.value = ''; return; }
    if (!state.edition) return;
    if (t.id === 'fAvDate') {
      if (t.value) { state.edition.av_date = t.value; planBewaren(); }
      return;
    }
    if (t.dataset.field === 'prikbord.icon' || t.dataset.field === 'prikbord.decor') {
      renderPrik();
      refreshIcons();
      return;
    }
    if (t.dataset.field && t.dataset.field.indexOf('style.') === 0) {
      if (t.value.trim()) { zetPad(C(), t.dataset.field, t.value.trim()); gewijzigd(); }
      return;
    }
    if (t.dataset.blockKey && (t.type === 'checkbox' || t.tagName === 'SELECT')) {
      var b = blokVan(t.dataset.blockKey);
      if (!b) return;
      var veld = t.dataset.blockField;
      b[veld] = t.type === 'checkbox' ? t.checked : (veld === 'stars' ? Number(t.value) : t.value);
      if (veld === 'thingy') { renderWist(); refreshIcons(); }
      gewijzigd();
    } else if (t.dataset.cardKey && (t.type === 'checkbox' || t.type === 'date' || t.tagName === 'SELECT')) {
      var k = kaartVan(t.dataset.cardKey);
      if (!k) return;
      var v = t.dataset.cardField;
      if (v === 'include') k.include = t.checked;
      else if (v === 'span') { k.span = Number(t.value) === 2 ? 2 : 1; k.edited = true; }
      else if (v === 'date') { if (!t.value) return; k.date = t.value; k.edited = true; }
      else if (v === 'thingy') { k.thingy = t.value; k.edited = true; }
      if (v === 'date' || v === 'thingy') { renderPrik(); refreshIcons(); }
      else if (v === 'include') {
        var rij = t.closest('[data-card-row]');
        if (rij) rij.classList.toggle('opacity-50', !k.include);
      }
      gewijzigd();
    }
  });

  // Een screenshot plakken, of een beeld op het vak slepen.
  document.addEventListener('paste', function (e) {
    if (!state.edition || state.tab !== 'wist') return;
    var doel = e.target;
    if (doel && (doel.tagName === 'INPUT' || doel.tagName === 'TEXTAREA')) return;
    var items = (e.clipboardData && e.clipboardData.files) || [];
    for (var i = 0; i < items.length; i++) {
      if (/^image\//.test(items[i].type)) { e.preventDefault(); laadBeeldOp(items[i]); return; }
    }
  });

  document.addEventListener('dragover', function (e) {
    var zone = e.target.closest && e.target.closest('[data-drop="image"]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.add('is-over');
  });

  document.addEventListener('dragleave', function (e) {
    var zone = e.target.closest && e.target.closest('[data-drop="image"]');
    if (zone) zone.classList.remove('is-over');
  });

  document.addEventListener('drop', function (e) {
    var zone = e.target.closest && e.target.closest('[data-drop="image"]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('is-over');
    laadBeeldOp(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  window.addEventListener('resize', schaal);
  window.addEventListener('beforeunload', function (e) {
    if (state.saveTimer || state.saving) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
    } catch (_) { /* navbar is niet kritisch */ }

    try {
      var th = await api('/thingies');
      state.thingies = th.data || [];
      state.thingyDefaults = th.defaults || {};
    } catch (_) { /* zonder lijst: enkel emoji */ }

    api('/setup').then(function (r) {
      $('setupClientId').textContent = r.data.client_id || '(onbekend: GOOGLE_SERVICE_ACCOUNT_KEY ontbreekt)';
      $('setupScope').textContent = r.data.scope;
      if (r.data.can_choose_google) {
        $('googleAsRow').classList.remove('hidden');
        $('fGoogleAs').placeholder = r.data.email || '';
        try { $('fGoogleAs').value = localStorage.getItem('av-slides-google-as') || ''; } catch (_) { /* geen opslag */ }
      }
    }).catch(function () { /* enkel uitleg */ });

    var gevraagd = new URLSearchParams(window.location.search).get('maand');
    await laadMaand(/^\d{4}-\d{2}$/.test(gevraagd || '') ? gevraagd : huidigeMaand());
  }

  init();
}());
