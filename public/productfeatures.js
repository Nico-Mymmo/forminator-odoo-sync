/**
 * Productfeatures -- het scherm.
 *
 * Links de boom (hoofdfeatures met hun onderliggende features), rechts het
 * formulier van de gekozen feature. REGEL 3 uit CLAUDE.md: alle knoppen via
 * data-action en EEN centrale listener; wijzigingen via data-change.
 * Praat uitsluitend met /productfeatures/api/*.
 */

(function () {
  'use strict';

  var BASE = '/productfeatures/api';

  var state = {
    boot: null,
    items: [],
    tree: [],
    gekozen: null,      // id van de gekozen feature
    concept: null,      // kopie waarin getypt wordt
    nieuw: null,        // { parent_id } als er een nieuwe gemaakt wordt
    vuil: false,
    zoek: '',
    categorie: '',
    open: {},           // id -> true/false (ingeklapt of niet)
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function e(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }
  function ikons() { if (window.lucide) window.lucide.createIcons(); }

  function toast(tekst, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : soort === 'warning' ? 'alert-warning' : 'alert-success') + ' shadow-lg max-w-md text-sm';
    el.textContent = tekst;
    $('pfToast').appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  async function api(pad, opties) {
    opties = opties || {};
    var res = await fetch(BASE + pad, {
      method: opties.method || 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: opties.body ? JSON.stringify(opties.body) : undefined,
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || ('Fout ' + res.status));
    return data.data;
  }

  async function upload(blob) {
    var res = await fetch(BASE + '/upload', { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || 'Opladen mislukt');
    return data.data;
  }

  function kanBewerken() { return Boolean(state.boot && state.boot.me.can_edit); }
  function perId(id) { return state.items.filter(function (f) { return f.id === id; })[0] || null; }
  function categorie(key) { return (state.boot.categorieen || []).filter(function (c) { return c.key === key; })[0] || null; }
  function label(lijst, key) { var x = (lijst || []).filter(function (c) { return c.key === key; })[0]; return x ? x.label : key; }

  /** Alle (klein)kinderen van een feature: die kunnen geen ouder worden. */
  function nakomelingen(id) {
    var uit = {};
    var loop = function (pid) {
      state.items.forEach(function (f) { if (f.parent_id === pid && !uit[f.id]) { uit[f.id] = true; loop(f.id); } });
    };
    loop(id);
    return uit;
  }

  function pad(f) {
    var delen = [];
    var x = f;
    var n = 0;
    while (x && n < 10) { delen.unshift(x.name); x = x.parent_id ? perId(x.parent_id) : null; n++; }
    return delen;
  }

  // ── Laden ─────────────────────────────────────────────────────────────────

  async function laad() {
    var d = await api('/features');
    state.items = d.items || [];
    state.tree = d.tree || [];
    tekenKnoppen();
    tekenBoom();
    tekenFormulier();
  }

  // ── De boom ───────────────────────────────────────────────────────────────

  function pastBijFilter(f) {
    if (state.categorie && f.category !== state.categorie) return false;
    if (state.zoek) {
      var z = state.zoek.toLowerCase();
      return (f.name + ' ' + f.summary + ' ' + f.eyebrow + ' ' + (f.usps || []).join(' ')).toLowerCase().indexOf(z) >= 0;
    }
    return true;
  }

  /** Een knoop blijft zichtbaar als hij zelf past of een nakomeling past. */
  function zichtbaar(knoop) {
    if (pastBijFilter(knoop)) return true;
    return (knoop.children || []).some(zichtbaar);
  }

  function knoopHtml(knoop) {
    if (!zichtbaar(knoop)) return '';
    var cat = categorie(knoop.category);
    var kinderen = (knoop.children || []).filter(zichtbaar);
    var dicht = state.open[knoop.id] === false;
    var gekozen = state.gekozen === knoop.id;
    return '<div>'
      + '<div class="pf-knoop' + (gekozen ? ' pf-gekozen' : '') + (knoop.is_active ? '' : ' pf-uit') + '" data-action="kies" data-id="' + e(knoop.id) + '">'
      + (kinderen.length || (knoop.children || []).length
        ? '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="klap" data-id="' + e(knoop.id) + '" title="' + (dicht ? 'Open' : 'Klap in') + '"><i data-lucide="' + (dicht ? 'chevron-right' : 'chevron-down') + '" class="w-3.5 h-3.5"></i></button>'
        : '<span class="w-6 inline-block"></span>')
      + '<span class="pf-stip" style="background:' + (cat ? cat.kleur : '#9ca3af') + '" title="' + e(cat ? cat.label : 'Geen categorie') + '"></span>'
      + '<span class="flex-1 min-w-0 truncate' + (knoop.diepte === 0 ? ' font-semibold' : '') + '">' + e(knoop.name) + '</span>'
      + (knoop.plan ? '<span class="badge badge-ghost badge-xs">' + e(label(state.boot.pakketten, knoop.plan)) + '</span>' : '')
      + (!knoop.is_active ? '<span class="badge badge-ghost badge-xs">uit</span>' : '')
      + (kanBewerken() ? '<span class="pf-acties">'
        + '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="omhoog" data-id="' + e(knoop.id) + '" title="Omhoog"><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>'
        + '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="omlaag" data-id="' + e(knoop.id) + '" title="Omlaag"><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>'
        + '<button type="button" class="btn btn-ghost btn-xs btn-square" data-action="nieuw-onder" data-id="' + e(knoop.id) + '" title="Onderliggende feature toevoegen"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>'
        + '</span>' : '')
      + '</div>'
      + (kinderen.length && !dicht ? '<div class="pf-kinderen">' + kinderen.map(knoopHtml).join('') + '</div>' : '')
      + '</div>';
  }

  function tekenBoom() {
    var bak = $('pfBoom');
    var sel = $('pfCategorie');
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">Alle categorieën</option>' + (state.boot.categorieen || []).map(function (c) { return '<option value="' + e(c.key) + '">' + e(c.label) + '</option>'; }).join('');
    }
    var html = state.tree.map(knoopHtml).join('');
    bak.innerHTML = html || '<p class="opacity-60 py-6 text-center">Niets gevonden.</p>';
    ikons();
  }

  function tekenKnoppen() {
    $('pfKnoppen').innerHTML = kanBewerken()
      ? '<button class="btn btn-sm btn-primary" data-action="nieuw-hoofd"><i data-lucide="plus" class="w-4 h-4"></i> Hoofdfeature</button>'
      : '<span class="text-xs opacity-60">Je kan lezen; beheerders en marketing bewerken.</span>';
    ikons();
  }

  // ── Het formulier ─────────────────────────────────────────────────────────

  function veld(labelTekst, naam, waarde, opties) {
    opties = opties || {};
    var uit = kanBewerken() ? '' : ' disabled';
    var invoer = opties.rijen
      ? '<textarea class="textarea textarea-bordered textarea-sm w-full" rows="' + opties.rijen + '" data-change="veld" data-veld="' + naam + '" placeholder="' + e(opties.hint || '') + '"' + uit + '>' + e(waarde || '') + '</textarea>'
      : '<input type="' + (opties.type || 'text') + '" class="input input-bordered input-sm w-full" data-change="veld" data-veld="' + naam + '" value="' + e(waarde || '') + '" placeholder="' + e(opties.hint || '') + '"' + uit + (opties.max ? ' maxlength="' + opties.max + '"' : '') + '>';
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1">' + e(labelTekst) + '</span>' + invoer
      + (opties.uitleg ? '<span class="label-text-alt opacity-60 mt-1">' + e(opties.uitleg) + '</span>' : '') + '</label>';
  }

  function chips(naam, lijst, gekozen) {
    gekozen = gekozen || [];
    return '<div class="flex flex-wrap gap-1.5">' + lijst.map(function (x) {
      return '<label class="pf-chip" title="' + e(x.uitleg || '') + '"><input type="checkbox" data-change="chip" data-veld="' + naam + '" value="' + e(x.key) + '"' + (gekozen.indexOf(x.key) >= 0 ? ' checked' : '') + (kanBewerken() ? '' : ' disabled') + '><span>' + e(x.label) + '</span></label>';
    }).join('') + '</div>';
  }

  function ouderKeuze(f) {
    var verboden = f.id ? nakomelingen(f.id) : {};
    var opties = '<option value="">Geen: dit is een hoofdfeature</option>';
    var loop = function (knopen, diepte) {
      knopen.forEach(function (k) {
        if (k.id === f.id || verboden[k.id]) return;
        opties += '<option value="' + e(k.id) + '"' + (k.id === f.parent_id ? ' selected' : '') + '>' + e(new Array(diepte + 1).join(' ') + k.name) + '</option>';
        loop(k.children || [], diepte + 1);
      });
    };
    loop(state.tree, 0);
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1">Bovenliggende feature</span><select class="select select-bordered select-sm" data-change="veld" data-veld="parent_id"' + (kanBewerken() ? '' : ' disabled') + '>' + opties + '</select></label>';
  }

  function keuze(labelTekst, naam, lijst, waarde, opties) {
    opties = opties || {};
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1">' + e(labelTekst) + '</span><select class="select select-bordered select-sm" data-change="veld" data-veld="' + naam + '"' + (kanBewerken() ? '' : ' disabled') + '>'
      + (opties.leeg !== undefined ? '<option value="">' + e(opties.leeg) + '</option>' : '')
      + lijst.map(function (x) { return '<option value="' + e(x.key) + '"' + (x.key === (waarde || '') ? ' selected' : '') + '>' + e(x.label) + '</option>'; }).join('')
      + '</select></label>';
  }

  function tekenFormulier() {
    var bak = $('pfFormulier');
    var f = state.concept;
    if (!f) {
      bak.innerHTML = '<div class="card bg-base-100 border border-base-content/10"><div class="card-body items-center text-center py-16">'
        + '<i data-lucide="blocks" class="w-12 h-12 opacity-30"></i>'
        + '<p class="opacity-60 max-w-sm">Kies links een feature, of maak een nieuwe. Elke feature is een blok dat marketing in een mail zet.</p>'
        + '</div></div>';
      ikons();
      return;
    }
    var b = state.boot;
    var mag = kanBewerken();
    var kinderen = state.items.filter(function (x) { return x.parent_id === f.id; }).length;
    bak.innerHTML = '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-4">'
      + '<div class="flex items-start justify-between gap-3">'
      + '<div class="min-w-0"><div class="text-xs opacity-60 truncate">' + e(f.id ? pad(f).slice(0, -1).join(' › ') || 'Hoofdfeature' : (f.parent_id ? 'Nieuw onder ' + e((perId(f.parent_id) || {}).name || '') : 'Nieuwe hoofdfeature')) + '</div>'
      + '<h2 class="text-lg font-bold leading-tight truncate">' + e(f.name || 'Nieuwe feature') + '</h2></div>'
      + (f.id ? '<span class="text-xs opacity-60 shrink-0">' + (kinderen ? kinderen + (kinderen === 1 ? ' onderliggende' : ' onderliggende') : 'geen onderliggende') + '</span>' : '')
      + '</div>'
      + '<div class="rounded-xl bg-base-200/70 p-3 text-xs flex items-start gap-2"><i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0"></i><span><strong>Toon:</strong> feitelijk en concreet. Schrijf wat het doet, voor wie, wat het kost of vraagt. Geen "revolutionair", "naadloos" of "zorgeloos".</span></div>'
      + '<div class="grid sm:grid-cols-2 gap-3">'
      + veld('Titel', 'name', f.name, { max: 120, hint: 'Bv. Bankkoppeling' })
      + veld('Label boven de titel', 'eyebrow', f.eyebrow, { max: 60, hint: 'Bv. Financieel beheer', uitleg: 'Het pilletje boven de titel in een mail.' })
      + '</div>'
      + ouderKeuze(f)
      + '<div class="grid sm:grid-cols-3 gap-3">'
      + keuze('Categorie', 'category', b.categorieen, f.category, { leeg: 'Geen categorie' })
      + keuze('Vanaf pakket', 'plan', b.pakketten, f.plan)
      + keuze('Merk', 'brand', (b.merken || []).map(function (m) { return { key: m, label: m === 'openvme' ? 'OpenVME' : 'Syndicoach' }; }), f.brand || 'openvme')
      + '</div>'
      + veld('Korte uitleg: wat doet het', 'summary', f.summary, { rijen: 3, hint: 'Eén tot drie zinnen. Wat doet de feature, concreet.' })
      + veld('Waarom we dit gemaakt hebben', 'why', f.why, { rijen: 2, hint: 'Het probleem dat het oplost. Mag leeg.' })
      + veld('USP\'s: één per regel (max. ' + b.max_usps + ')', 'usps', (f.usps || []).join('\n'), { rijen: 5, hint: 'Korte, controleerbare punten. Cijfers mogen: "€5 per rekening per maand".' })
      + '<div><span class="label-text text-xs mb-1 block">Voordelen voor de klant</span>' + chips('benefits', b.voordelen, f.benefits) + '</div>'
      + '<div><span class="label-text text-xs mb-1 block">Voor wie</span>' + chips('audiences', b.doelgroepen, f.audiences) + '</div>'
      + veld('Link naar de webpagina', 'url', f.url, { type: 'url', hint: 'https://openvme.be/…' })
      + '<div><span class="label-text text-xs mb-1 block">Beeld</span><div class="flex items-center gap-3">'
      + (f.image_url ? '<img src="' + e(f.image_url) + '" alt="" class="h-20 w-32 object-cover rounded-lg border border-base-content/10">' : '<div class="h-20 w-32 rounded-lg border border-dashed border-base-content/20 flex items-center justify-center text-xs opacity-50">geen beeld</div>')
      + (mag ? '<div class="flex flex-col gap-1.5"><label class="btn btn-sm btn-outline"><i data-lucide="upload" class="w-4 h-4"></i> Beeld opladen<input type="file" accept="image/*" class="hidden" data-change="beeld"></label>'
        + (f.image_url ? '<button type="button" class="btn btn-sm btn-ghost" data-action="beeld-weg">Weghalen</button>' : '') + '</div>' : '')
      + '</div>' + veld('Of een adres van een beeld', 'image_url', f.image_url, { type: 'url', hint: 'https://' }) + '</div>'
      + '<label class="label cursor-pointer justify-start gap-3"><input type="checkbox" class="checkbox checkbox-sm" data-change="veld" data-veld="is_active"' + (f.is_active !== false ? ' checked' : '') + (mag ? '' : ' disabled') + '><span class="label-text">Actief (uit = niet te kiezen in een mail, blijft in de lijst)</span></label>'
      + (mag ? '<div class="flex flex-wrap items-center gap-2 pt-2 border-t border-base-content/10">'
        + '<button class="btn btn-sm btn-primary" data-action="bewaar"><i data-lucide="save" class="w-4 h-4"></i> ' + (f.id ? 'Bewaren' : 'Aanmaken') + '</button>'
        + (f.id ? '<button class="btn btn-sm btn-ghost" data-action="nieuw-onder" data-id="' + e(f.id) + '"><i data-lucide="plus" class="w-4 h-4"></i> Onderliggende feature</button>' : '')
        + '<span class="flex-1"></span>'
        + (f.id ? '<button class="btn btn-sm btn-ghost text-error" data-action="weg" data-id="' + e(f.id) + '"><i data-lucide="trash-2" class="w-4 h-4"></i> Weghalen</button>' : '<button class="btn btn-sm btn-ghost" data-action="annuleer">Annuleren</button>')
        + '</div>' : '')
      + '</div></div>';
    ikons();
  }

  // ── Acties ────────────────────────────────────────────────────────────────

  function kies(id) {
    if (state.vuil && !confirm('Je hebt wijzigingen die nog niet bewaard zijn. Toch verder?')) return;
    var f = perId(id);
    state.gekozen = id;
    state.concept = f ? JSON.parse(JSON.stringify(f)) : null;
    state.nieuw = null;
    state.vuil = false;
    tekenBoom();
    tekenFormulier();
  }

  var actions = {
    'kies': function (el) { kies(el.dataset.id); },
    'klap': function (el) { state.open[el.dataset.id] = state.open[el.dataset.id] === false; tekenBoom(); },
    'nieuw-hoofd': function () { nieuw(null); },
    'nieuw-onder': function (el) { nieuw(el.dataset.id); state.open[el.dataset.id] = true; tekenBoom(); },
    'annuleer': function () { state.concept = null; state.nieuw = null; state.vuil = false; state.gekozen = null; tekenBoom(); tekenFormulier(); },
    'beeld-weg': function () { state.concept.image_url = ''; state.vuil = true; tekenFormulier(); },
    'bewaar': bewaar,
    'weg': weg,
    'omhoog': function (el) { verschuif(el.dataset.id, -1); },
    'omlaag': function (el) { verschuif(el.dataset.id, 1); },
  };

  function nieuw(parentId) {
    if (state.vuil && !confirm('Je hebt wijzigingen die nog niet bewaard zijn. Toch verder?')) return;
    var ouder = parentId ? perId(parentId) : null;
    state.gekozen = null;
    state.nieuw = { parent_id: parentId };
    state.concept = {
      id: null, parent_id: parentId, name: '', eyebrow: ouder ? ouder.name : '', summary: '', why: '', usps: [],
      benefits: [], audiences: ouder ? (ouder.audiences || []).slice() : [], category: ouder ? ouder.category : null,
      plan: ouder ? ouder.plan : '', brand: ouder ? ouder.brand : 'openvme', url: '', image_url: '', is_active: true,
    };
    state.vuil = false;
    tekenBoom();
    tekenFormulier();
    var eerste = document.querySelector('#pfFormulier [data-veld="name"]');
    if (eerste) eerste.focus();
  }

  async function bewaar() {
    var f = state.concept;
    if (!f) return;
    if (!String(f.name || '').trim()) { toast('Geef de feature een titel.', 'warning'); return; }
    var body = {
      name: f.name, eyebrow: f.eyebrow, summary: f.summary, why: f.why, usps: f.usps, benefits: f.benefits, audiences: f.audiences,
      category: f.category || '', plan: f.plan || '', brand: f.brand || 'openvme', url: f.url, image_url: f.image_url, is_active: f.is_active !== false,
      parent_id: f.parent_id || null,
    };
    try {
      var bij = f.id ? await api('/features/' + f.id, { method: 'PUT', body: body }) : await api('/features', { method: 'POST', body: body });
      toast(f.id ? 'Bewaard.' : 'Aangemaakt.');
      state.vuil = false;
      state.gekozen = bij.id;
      if (bij.parent_id) state.open[bij.parent_id] = true;
      await laad();
      kies(bij.id);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function weg(el) {
    var f = perId(el.dataset.id);
    if (!f) return;
    var kinderen = state.items.filter(function (x) { return x.parent_id === f.id; }).length;
    if (!confirm('"' + f.name + '" weghalen?' + (kinderen ? ' De ' + kinderen + ' onderliggende feature(s) schuiven een niveau omhoog.' : '') + ' Mails waar ze al in staat, veranderen niet.')) return;
    try {
      await api('/features/' + f.id, { method: 'DELETE' });
      toast('Weggehaald.');
      state.gekozen = null; state.concept = null; state.vuil = false;
      await laad();
    } catch (err) { toast(err.message, 'error'); }
  }

  /** Eén plaats omhoog of omlaag tussen de broers en zussen. */
  async function verschuif(id, richting) {
    var f = perId(id);
    if (!f) return;
    var broers = state.items.filter(function (x) { return (x.parent_id || null) === (f.parent_id || null); })
      .sort(function (a, b) { return (a.position - b.position) || a.name.localeCompare(b.name, 'nl'); });
    var i = broers.findIndex(function (x) { return x.id === id; });
    var j = i + richting;
    if (j < 0 || j >= broers.length) return;
    var t = broers[i]; broers[i] = broers[j]; broers[j] = t;
    try {
      await api('/features/order', { method: 'POST', body: { ids: broers.map(function (x) { return x.id; }) } });
      await laad();
    } catch (err) { toast(err.message, 'error'); }
  }

  var changes = {
    'zoek': function (el) { state.zoek = el.value.trim(); tekenBoom(); },
    'filter-categorie': function (el) { state.categorie = el.value; tekenBoom(); },
    'veld': function (el) {
      if (!state.concept) return;
      var naam = el.dataset.veld;
      var waarde = el.type === 'checkbox' ? el.checked : el.value;
      if (naam === 'usps') waarde = String(waarde).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (naam === 'parent_id') waarde = waarde || null;
      if (naam === 'category') waarde = waarde || null;
      state.concept[naam] = waarde;
      state.vuil = true;
      if (naam === 'name') { var h = document.querySelector('#pfFormulier h2'); if (h) h.textContent = waarde || 'Nieuwe feature'; }
    },
    'chip': function (el) {
      if (!state.concept) return;
      var naam = el.dataset.veld;
      var lijst = (state.concept[naam] || []).slice();
      var i = lijst.indexOf(el.value);
      if (el.checked && i < 0) lijst.push(el.value);
      if (!el.checked && i >= 0) lijst.splice(i, 1);
      state.concept[naam] = lijst;
      state.vuil = true;
    },
    'beeld': async function (el) {
      var bestand = el.files && el.files[0];
      if (!bestand || !state.concept) return;
      try {
        var r = await upload(bestand);
        state.concept.image_url = r.url;
        state.vuil = true;
        tekenFormulier();
      } catch (err) { toast(err.message, 'error'); }
      el.value = '';
    },
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    // Een knop in een knoop: niet ook de knoop zelf kiezen.
    if (el.dataset.action !== 'kies') ev.stopPropagation();
    var fn = actions[el.dataset.action];
    if (fn) Promise.resolve(fn(el)).catch(function (err) { toast(err.message, 'error'); });
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target.closest('[data-change]');
    if (!el) return;
    var fn = changes[el.dataset.change];
    if (fn) Promise.resolve(fn(el)).catch(function (err) { toast(err.message, 'error'); });
  });
  document.addEventListener('input', function (ev) {
    var el = ev.target.closest('[data-change="veld"], [data-change="zoek"]');
    if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
    changes[el.dataset.change](el);
  });
  window.addEventListener('beforeunload', function (ev) { if (state.vuil) { ev.preventDefault(); ev.returnValue = ''; } });

  // ── Opstarten ─────────────────────────────────────────────────────────────

  async function start() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (window.renderSharedNavbar && me.navbarHtml) window.renderSharedNavbar(me.navbarHtml);
    } catch (err) { /* de navbar is geen reden om niet verder te gaan */ }
    try {
      state.boot = await api('/bootstrap');
      await laad();
      var hash = (location.hash || '').replace(/^#\/?/, '');
      if (hash && perId(hash)) kies(hash);
    } catch (err) {
      $('pfBoom').innerHTML = '<div class="alert alert-error text-sm">' + e(err.message) + '</div>';
    }
  }

  start();
})();
