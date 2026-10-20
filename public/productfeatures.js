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
    bewerken: false,    // false = de kaart (voorbeeld), true = het formulier
    kiezer: null,       // de beeldkiezer: { prefix, folders, files, laden }
    achtergrond: null,  // palet, vormen en swirls voor de achtergrondbouwer (eenmaal ophalen)
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

  async function upload(blob, naam) {
    var res = await fetch(BASE + '/upload?naam=' + encodeURIComponent(naam || ''), { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
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

  function voorVme(f) { return f.plan !== 'geen' && f.plan !== 'pro'; }
  function voorPro(f) { return f.pro === undefined || f.pro === null ? f.plan === 'pro' : Boolean(f.pro); }

  /** Twee labeltjes: het pakket voor gewone VME's en (apart) OpenVME Pro. */
  function pakketBadges(f) {
    var p = (state.boot.pakketten || []).find(function (x) { return x.key === (f.plan || ''); });
    return (voorVme(f) && p ? '<span class="badge badge-ghost badge-xs" title="Voor VME\'s: ' + e(p.label) + '">' + e(p.kort || p.label) + '</span>' : '')
      + (voorPro(f) ? '<span class="badge badge-xs border-0 text-white" style="background:#0369a1" title="Ook in OpenVME Pro">Pro</span>' : '');
  }

  function pastBijFilter(f) {
    if (state.categorie && f.category !== state.categorie) return false;
    if (state.voor === 'vme' && !voorVme(f)) return false;
    if (state.voor === 'pro' && !voorPro(f)) return false;
    if (state.voor === 'enkel-pro' && (voorVme(f) || !voorPro(f))) return false;
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
      + pakketBadges(knoop)
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

  // ── De kaart: hoe de feature eruitziet in een mail of op de site ─────────

  var HUIS = { primary: '#0369a1', pil: '#e0f2fe', mint: '#5eead4', titel: '#0f172a', tekst: '#334155', zacht: '#64748b', rand: '#e2e8f0' };

  function tekstHtml(t) {
    return String(t || '').split(/\n{2,}/).map(function (alinea) { return '<p style="margin:0 0 10px">' + e(alinea).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  /** De kaart zelf, altijd licht zoals in een mail: beeld, label, titel, uitleg, USP's, waarom, link. */
  function kaartHtml(f) {
    var h = HUIS;
    var labelTekst = String(f.eyebrow || '').trim() || (f.parent_id ? ((perId(f.parent_id) || {}).name || '') : '');
    var usps = (f.usps || []).filter(Boolean);
    return '<article style="background:#ffffff;border:1px solid ' + h.rand + ';border-radius:14px;overflow:hidden;color:' + h.tekst + ';font-size:15px;line-height:1.55;max-width:560px;margin:0 auto;width:100%">'
      + (f.image_url ? '<img src="' + e(f.image_url) + '" alt="" style="display:block;width:100%;max-height:300px;object-fit:cover">' : '')
      + '<div style="padding:22px 24px 24px">'
      + (labelTekst ? '<span style="display:inline-block;background:' + h.pil + ';color:' + h.primary + ';font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px">' + e(labelTekst) + '</span>' : '')
      + '<div style="font-size:24px;line-height:1.2;font-weight:700;color:' + h.titel + ';margin:12px 0 10px">' + e(f.name || 'Nog geen titel') + '</div>'
      + (String(f.summary || '').trim() ? tekstHtml(f.summary) : '<p style="margin:0 0 10px;color:' + h.zacht + ';font-style:italic">Nog geen korte uitleg.</p>')
      + (usps.length ? '<ul style="list-style:none;padding:0;margin:12px 0 0">' + usps.map(function (u) {
        return '<li style="display:flex;gap:8px;margin:0 0 6px"><span style="color:' + h.primary + ';font-weight:700">&#10003;</span><span>' + e(u) + '</span></li>';
      }).join('') + '</ul>' : '')
      + (String(f.why || '').trim() ? '<div style="margin-top:14px;padding:12px 14px;border-left:3px solid ' + h.mint + ';font-size:14px;color:' + h.zacht + '"><strong style="color:#1e293b">Waarom we dit maakten.</strong> ' + e(f.why) + '</div>' : '')
      + (f.url ? '<div style="margin-top:16px"><a href="' + e(f.url) + '" target="_blank" rel="noopener" style="color:' + h.primary + ';font-weight:600;text-decoration:none">Meer over deze functie &rarr;</a></div>' : '')
      + '</div></article>';
  }

  function feit(labelTekst, inhoud) {
    return '<div><div class="text-xs opacity-60 mb-1">' + e(labelTekst) + '</div><div class="text-sm">' + inhoud + '</div></div>';
  }

  function badges(lijst, keys, leeg) {
    keys = keys || [];
    if (!keys.length) return '<span class="opacity-50">' + e(leeg) + '</span>';
    return '<div class="flex flex-wrap gap-1">' + keys.map(function (k) { return '<span class="badge badge-ghost badge-sm">' + e(label(lijst, k)) + '</span>'; }).join('') + '</div>';
  }

  function tekenKaart(f) {
    var b = state.boot;
    var cat = categorie(f.category);
    var kinderen = state.items.filter(function (x) { return x.parent_id === f.id; })
      .sort(function (a, c) { return (a.position - c.position) || a.name.localeCompare(c.name, 'nl'); });
    $('pfFormulier').innerHTML = '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-4">'
      + '<div class="flex items-start justify-between gap-3">'
      + '<div class="min-w-0"><div class="text-xs opacity-60 truncate">' + e(pad(f).slice(0, -1).join(' › ') || 'Hoofdfeature') + '</div>'
      + '<div class="flex items-center gap-2 mt-0.5"><span class="text-xs font-semibold uppercase tracking-wide opacity-60">Voorbeeld</span>'
      + (f.is_active === false ? '<span class="badge badge-ghost badge-sm">uit: niet te kiezen in een mail</span>' : '') + '</div></div>'
      + (kanBewerken() ? '<button class="btn btn-sm btn-primary shrink-0" data-action="bewerk"><i data-lucide="pencil" class="w-4 h-4"></i> Bewerken</button>' : '')
      + '</div>'
      + '<div class="rounded-2xl bg-base-200/70 p-4 sm:p-6">' + kaartHtml(f) + '</div>'
      + '<div class="grid sm:grid-cols-4 gap-4 pt-1">'
      + feit('Categorie', cat ? '<span class="inline-flex items-center gap-1.5"><span class="pf-stip" style="background:' + cat.kleur + '"></span>' + e(cat.label) + '</span>' : '<span class="opacity-50">Geen categorie</span>')
      + feit('Voor VME\'s', voorVme(f) ? e(label(b.pakketten, f.plan || '')) : '<span class="opacity-50">Niet</span>')
      + feit('OpenVME Pro', voorPro(f) ? 'Ja' : '<span class="opacity-50">Niet</span>')
      + feit('Merk', f.brand === 'syndicoach' ? 'Syndicoach' : 'OpenVME')
      + '</div>'
      + '<div class="grid sm:grid-cols-2 gap-4">'
      + feit('Voor wie', badges(b.doelgroepen, f.audiences, 'Niet ingevuld'))
      + feit('Voordelen voor de klant', badges(b.voordelen, f.benefits, 'Niet ingevuld'))
      + '</div>'
      + (kinderen.length ? feit('Onderliggende features', '<div class="flex flex-wrap gap-1.5">' + kinderen.map(function (k) {
        return '<button type="button" class="btn btn-xs btn-outline" data-action="kies" data-id="' + e(k.id) + '">' + e(k.name) + '</button>';
      }).join('') + '</div>') : '')
      + (kanBewerken() ? '<div class="flex flex-wrap items-center gap-2 pt-2 border-t border-base-content/10">'
        + '<button class="btn btn-sm btn-ghost" data-action="nieuw-onder" data-id="' + e(f.id) + '"><i data-lucide="plus" class="w-4 h-4"></i> Onderliggende feature</button>'
        + '</div>' : '')
      + '</div></div>';
    ikons();
  }

  // ── De beeldkiezer: uit de Asset Manager ─────────────────────────────────

  async function kiezerLaad(prefix) {
    state.kiezer = { prefix: prefix, folders: [], files: [], laden: true };
    tekenKiezer();
    try {
      var d = await api('/beelden?prefix=' + encodeURIComponent(prefix));
      state.kiezer = { prefix: prefix, folders: d.folders || [], files: d.files || [], laden: false };
    } catch (err) {
      state.kiezer = { prefix: prefix, folders: [], files: [], laden: false, fout: err.message };
    }
    tekenKiezer();
  }

  function tekenKiezer() {
    var k = state.kiezer;
    var dlg = $('pfKiezer');
    if (!k || !dlg) return;
    var delen = k.prefix ? k.prefix.replace(/\/$/, '').split('/') : [];
    var kruimels = '<button type="button" class="link link-hover" data-action="kiezer-map" data-prefix="">Asset Manager</button>'
      + delen.map(function (d, i) {
        var p = delen.slice(0, i + 1).join('/') + '/';
        var naam = p === 'public/' ? 'Publiek' : p.indexOf('users/') === 0 && i <= 1 ? 'Mijn bestanden' : d;
        if (p === 'users/') return '';
        return ' <span class="opacity-40">›</span> <button type="button" class="link link-hover" data-action="kiezer-map" data-prefix="' + e(p) + '">' + e(naam) + '</button>';
      }).join('');
    var inhoud;
    if (k.laden) inhoud = '<div class="py-10 text-center"><span class="loading loading-spinner"></span></div>';
    else if (k.fout) inhoud = '<div class="alert alert-error text-sm">' + e(k.fout) + '</div>';
    else if (!k.folders.length && !k.files.length) inhoud = '<p class="opacity-60 py-8 text-center text-sm">Geen beelden in deze map.</p>';
    else {
      inhoud = (k.folders.length ? '<div class="flex flex-wrap gap-2 mb-4">' + k.folders.map(function (m) {
        return '<button type="button" class="btn btn-sm btn-outline" data-action="kiezer-map" data-prefix="' + e(m.prefix) + '"><i data-lucide="folder" class="w-4 h-4"></i> ' + e(m.name) + '</button>';
      }).join('') + '</div>' : '')
      + (k.files.length ? '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' + k.files.map(function (b) {
        return '<button type="button" class="group text-left" data-action="kiezer-kies" data-url="' + e(b.url) + '" title="' + e(b.name) + '">'
          + '<img src="' + e(b.url) + '" alt="" loading="lazy" class="w-full aspect-[4/3] object-cover rounded-lg border border-base-content/10 group-hover:ring-2 group-hover:ring-primary">'
          + '<span class="block text-xs truncate mt-1 opacity-70">' + e(b.name) + '</span></button>';
      }).join('') + '</div>' : '');
    }
    dlg.innerHTML = '<div class="modal-box max-w-3xl">'
      + '<div class="flex items-center justify-between gap-3 mb-1"><h3 class="font-bold text-lg">Kies een beeld</h3>'
      + '<button type="button" class="btn btn-sm btn-ghost btn-square" data-action="kiezer-dicht"><i data-lucide="x" class="w-4 h-4"></i></button></div>'
      + '<div class="text-sm mb-4">' + kruimels + '</div>'
      + inhoud
      + '</div><form method="dialog" class="modal-backdrop"><button>sluiten</button></form>';
    if (!dlg.open) dlg.showModal();
    ikons();
  }

  // ── Het formulier ─────────────────────────────────────────────────────────

  function tekenFormulier() {
    var bak = $('pfFormulier');
    var f = state.concept;
    if (f && f.id && !state.bewerken) { tekenKaart(f); return; }
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
      + keuze('Voor VME\'s', 'plan', b.pakketten, f.plan === 'pro' ? 'geen' : f.plan)
      + keuze('Merk', 'brand', (b.merken || []).map(function (m) { return { key: m, label: m === 'openvme' ? 'OpenVME' : 'Syndicoach' }; }), f.brand || 'openvme')
      + '</div>'
      + '<label class="label cursor-pointer justify-start gap-3 py-0"><input type="checkbox" class="checkbox checkbox-sm" data-change="veld" data-veld="pro"' + (voorPro(f) ? ' checked' : '') + (mag ? '' : ' disabled') + '><span class="label-text">Ook in <strong>OpenVME Pro</strong> (voor professionele syndici, los van het pakket hierboven)</span></label>'
      + veld('Korte uitleg: wat doet het', 'summary', f.summary, { rijen: 3, hint: 'Eén tot drie zinnen. Wat doet de feature, concreet.' })
      + veld('Waarom we dit gemaakt hebben', 'why', f.why, { rijen: 2, hint: 'Het probleem dat het oplost. Mag leeg.' })
      + veld('USP\'s: één per regel (max. ' + b.max_usps + ')', 'usps', (f.usps || []).join('\n'), { rijen: 5, hint: 'Korte, controleerbare punten. Cijfers mogen: "€5 per rekening per maand".' })
      + '<div><span class="label-text text-xs mb-1 block">Voordelen voor de klant</span>' + chips('benefits', b.voordelen, f.benefits) + '</div>'
      + '<div><span class="label-text text-xs mb-1 block">Voor wie</span>' + chips('audiences', b.doelgroepen, f.audiences) + '</div>'
      + veld('Link naar de webpagina', 'url', f.url, { type: 'url', hint: 'https://openvme.be/…' })
      + '<div><span class="label-text text-xs mb-1 block">Beeld</span><div class="flex items-center gap-3">'
      + (f.image_url ? '<img src="' + e(f.image_url) + '" alt="" class="h-20 w-32 object-cover rounded-lg border border-base-content/10">' : '<div class="h-20 w-32 rounded-lg border border-dashed border-base-content/20 flex items-center justify-center text-xs opacity-50">geen beeld</div>')
      + (mag ? '<div class="flex flex-col gap-1.5"><label class="btn btn-sm btn-outline"><i data-lucide="upload" class="w-4 h-4"></i> Beeld opladen<input type="file" accept="image/*" class="hidden" data-change="beeld"></label>'
        + '<button type="button" class="btn btn-sm btn-outline" data-action="kiezer-open"><i data-lucide="images" class="w-4 h-4"></i> Kies uit Asset Manager</button>'
        + (f.image_url ? '<button type="button" class="btn btn-sm btn-outline" data-action="achtergrond"><i data-lucide="palette" class="w-4 h-4"></i> ' + (f.achtergrond ? 'Achtergrond aanpassen' : 'Achtergrond maken') + '</button>' : '')
        + (f.achtergrond ? '<button type="button" class="btn btn-sm btn-ghost" data-action="achtergrond-weg">Achtergrond weghalen</button>' : '')
        + (f.image_url ? '<button type="button" class="btn btn-sm btn-ghost" data-action="beeld-weg">Weghalen</button>' : '') + '</div>' : '')
      + '</div>' + veld('Of een adres van een beeld', 'image_url', f.image_url, { type: 'url', hint: 'https://', uitleg: 'Wat je oplaadt, komt in de Asset Manager terecht (map Publiek › productfeatures).' }) + '</div>'
      + '<label class="label cursor-pointer justify-start gap-3"><input type="checkbox" class="checkbox checkbox-sm" data-change="veld" data-veld="is_active"' + (f.is_active !== false ? ' checked' : '') + (mag ? '' : ' disabled') + '><span class="label-text">Actief (uit = niet te kiezen in een mail, blijft in de lijst)</span></label>'
      + (mag ? '<div class="flex flex-wrap items-center gap-2 pt-2 border-t border-base-content/10">'
        + '<button class="btn btn-sm btn-primary" data-action="bewaar"><i data-lucide="save" class="w-4 h-4"></i> ' + (f.id ? 'Bewaren' : 'Aanmaken') + '</button>'
        + '<button class="btn btn-sm btn-ghost" data-action="annuleer">Annuleren</button>'
        + '<span class="flex-1"></span>'
        + (f.id ? '<button class="btn btn-sm btn-ghost text-error" data-action="weg" data-id="' + e(f.id) + '"><i data-lucide="trash-2" class="w-4 h-4"></i> Weghalen</button>' : '')
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
    state.bewerken = false;
    tekenBoom();
    tekenFormulier();
  }

  var actions = {
    'kies': function (el) { kies(el.dataset.id); },
    'klap': function (el) { state.open[el.dataset.id] = state.open[el.dataset.id] === false; tekenBoom(); },
    'nieuw-hoofd': function () { nieuw(null); },
    'nieuw-onder': function (el) { nieuw(el.dataset.id); state.open[el.dataset.id] = true; tekenBoom(); },
    'annuleer': function () {
      var f = state.concept;
      if (state.vuil && !confirm('Je wijzigingen weggooien?')) return;
      state.vuil = false;
      state.bewerken = false;
      if (f && f.id) { state.concept = JSON.parse(JSON.stringify(perId(f.id) || f)); tekenFormulier(); return; }
      state.concept = null; state.nieuw = null; state.gekozen = null; tekenBoom(); tekenFormulier();
    },
    'bewerk': function () {
      state.bewerken = true;
      tekenFormulier();
      var eerste = document.querySelector('#pfFormulier [data-veld="name"]');
      if (eerste) eerste.focus();
    },
    'kiezer-open': function () { return kiezerLaad(state.kiezer && !state.kiezer.fout ? state.kiezer.prefix : 'public/productfeatures/'); },
    'kiezer-map': function (el) { return kiezerLaad(el.dataset.prefix || ''); },
    'kiezer-kies': function (el) {
      if (state.concept) { state.concept.image_url = el.dataset.url; state.concept.achtergrond = null; state.vuil = true; }
      $('pfKiezer').close();
      tekenFormulier();
    },
    'kiezer-dicht': function () { $('pfKiezer').close(); },
    'beeld-weg': function () { state.concept.image_url = ''; state.concept.achtergrond = null; state.vuil = true; tekenFormulier(); },
    'achtergrond': achtergrondOpen,
    'achtergrond-weg': function () {
      var ag = state.concept && state.concept.achtergrond;
      if (!ag) return;
      state.concept.image_url = ag.bron || '';
      state.concept.achtergrond = null;
      state.vuil = true;
      tekenFormulier();
    },
    'bewaar': bewaar,
    'weg': weg,
    'omhoog': function (el) { verschuif(el.dataset.id, -1); },
    'omlaag': function (el) { verschuif(el.dataset.id, 1); },
  };

  /**
   * De achtergrondbouwer (public/om-achtergrond.js). Het beeld wordt het
   * gemaakte PNG; het oorspronkelijke componentje blijft in achtergrond.bron,
   * zodat je de achtergrond later kan bijstellen of weghalen.
   */
  async function achtergrondOpen() {
    var f = state.concept;
    if (!f || !f.image_url) return;
    if (!state.achtergrond) state.achtergrond = await api('/achtergrond');
    var ag = f.achtergrond;
    var bron = (ag && ag.bron) || f.image_url;
    window.OMAchtergrond.open({
      titel: 'Achtergrond voor "' + (f.name || 'deze feature') + '"',
      beeld: bron,
      waarde: ag,
      gegevens: state.achtergrond,
      opBewaar: async function (keuzes, blob) {
        var r = await upload(blob, (f.name || 'feature') + '-achtergrond');
        keuzes.bron = bron;
        keuzes.url = r.url;
        if (state.concept !== f) return;
        f.achtergrond = keuzes;
        f.image_url = r.url;
        state.vuil = true;
        state.bewerken = true;
        tekenFormulier();
        toast('Achtergrond klaar. Vergeet niet te bewaren.');
      },
    });
  }

  function nieuw(parentId) {
    if (state.vuil && !confirm('Je hebt wijzigingen die nog niet bewaard zijn. Toch verder?')) return;
    var ouder = parentId ? perId(parentId) : null;
    state.gekozen = null;
    state.nieuw = { parent_id: parentId };
    state.concept = {
      id: null, parent_id: parentId, name: '', eyebrow: ouder ? ouder.name : '', summary: '', why: '', usps: [],
      benefits: [], audiences: ouder ? (ouder.audiences || []).slice() : [], category: ouder ? ouder.category : null,
      plan: ouder ? ouder.plan : '', pro: ouder ? Boolean(ouder.pro) : false, brand: ouder ? ouder.brand : 'openvme', url: '', image_url: '', is_active: true,
    };
    state.vuil = false;
    state.bewerken = true;
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
      category: f.category || '', plan: f.plan || '', pro: voorPro(f), brand: f.brand || 'openvme', url: f.url, image_url: f.image_url, is_active: f.is_active !== false,
      achtergrond: f.achtergrond || null,
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
      state.gekozen = null; state.concept = null; state.vuil = false; state.bewerken = false;
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
    'filter-voor': function (el) { state.voor = el.value; tekenBoom(); },
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
        var r = await upload(bestand, state.concept.name);
        state.concept.image_url = r.url;
        state.concept.achtergrond = null;
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
