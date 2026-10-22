/* Regio's -- toestand, api en hulpjes. Gedeeld via window.RG. */
(function () {
  var RG = window.RG = window.RG || {};

  RG.PALET = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1', '#d946ef'];

  RG.state = {
    syndicoaches: [],     // [{id, naam, kleur, position}]
    toewijzingen: {},     // postcode -> syndicoach-id
    extra: {},            // nis -> [postcodes met de hand toegevoegd]
    isAdmin: false,
    actief: null,         // id van de actieve syndicoach
    gedetailleerd: false,
    bezig: 0,             // lopende schrijfacties (dan niet verversen)
    // uit de kaartdata
    features: null,
    nisNaarPostcodes: {},
    postcodeNaarNis: {},
    deelgemeente: {},
    gemeente: {},         // nis -> {naam, provincie, gewest}
    featureVan: {},
  };
  var S = RG.state;

  RG.$ = function (id) { return document.getElementById(id); };

  RG.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  RG.iconen = function () { if (window.lucide) window.lucide.createIcons(); };

  RG.toast = function (msg, soort) {
    var root = RG.$('rgToasts');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : soort === 'warn' ? 'alert-warning' : 'alert-success') + ' text-sm shadow-lg';
    el.innerHTML = '<span>' + RG.esc(msg) + '</span>';
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  };

  RG.api = async function (pad, opties) {
    opties = opties || {};
    var res = await fetch('/regios/api' + pad, {
      method: opties.method || 'GET',
      credentials: 'include',
      headers: opties.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = null;
    try { data = await res.json(); } catch (x) { /* leeg */ }
    if (!res.ok || !data || data.success === false) throw new Error((data && data.error) || ('Fout ' + res.status));
    return data.data;
  };

  RG.bewaarStand = function (stand) {
    var el = RG.$('rgBewaarStand');
    if (!el) return;
    if (stand === 'bezig') el.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Bewaren...';
    else if (stand === 'ok') el.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-success"></i> Bewaard';
    else if (stand === 'fout') el.innerHTML = '<i data-lucide="triangle-alert" class="w-3.5 h-3.5 text-error"></i> Bewaren mislukt';
    else el.innerHTML = '';
    RG.iconen();
  };

  /** Voert een schrijfactie uit; bij een fout de echte stand terug ophalen. */
  RG.schrijf = async function (fn, foutTekst) {
    S.bezig++;
    RG.bewaarStand('bezig');
    try {
      var r = await fn();
      RG.bewaarStand('ok');
      return r;
    } catch (err) {
      RG.bewaarStand('fout');
      RG.toast((foutTekst || 'Bewaren mislukt') + ': ' + err.message, 'error');
      await RG.laad(true);
      throw err;
    } finally {
      S.bezig--;
    }
  };

  // ── Opzoeken ───────────────────────────────────────────────────────────
  RG.coach = function (id) {
    for (var i = 0; i < S.syndicoaches.length; i++) if (S.syndicoaches[i].id === id) return S.syndicoaches[i];
    return null;
  };
  RG.postcodesVan = function (nis) { return S.nisNaarPostcodes[nis] || []; };
  RG.eigenaarsVan = function (nis) {
    var uit = [];
    RG.postcodesVan(nis).forEach(function (pc) {
      var id = S.toewijzingen[pc];
      if (id && uit.indexOf(id) === -1) uit.push(id);
    });
    return uit;
  };
  RG.helemaalVan = function (pcs, id) {
    for (var i = 0; i < pcs.length; i++) if (S.toewijzingen[pcs[i]] !== id) return false;
    return true;
  };
  RG.postcodesVanCoach = function (id) {
    return Object.keys(S.toewijzingen).filter(function (pc) { return S.toewijzingen[pc] === id; }).sort();
  };
  RG.gemeenteNaam = function (nis) { return (S.gemeente[nis] || {}).naam || ''; };
  RG.plaatsVan = function (pc) { return S.deelgemeente[pc] || RG.gemeenteNaam(S.postcodeNaarNis[pc]) || ''; };

  RG.volgendeKleur = function () {
    var gebruikt = S.syndicoaches.map(function (s) { return String(s.kleur).toLowerCase(); });
    for (var i = 0; i < RG.PALET.length; i++) if (gebruikt.indexOf(RG.PALET[i]) === -1) return RG.PALET[i];
    return RG.PALET[S.syndicoaches.length % RG.PALET.length];
  };

  // ── Toewijzen (eerst op het scherm, dan bewaren) ───────────────────────
  RG.wijsToe = function (pcs, coachId, label) {
    pcs = pcs.filter(Boolean);
    if (!pcs.length) return Promise.resolve();
    pcs.forEach(function (pc) {
      if (coachId) S.toewijzingen[pc] = coachId; else delete S.toewijzingen[pc];
    });
    RG.teken();
    return RG.schrijf(function () {
      return RG.api('/toewijzen', { method: 'POST', body: { postcodes: pcs, syndicoach_id: coachId || null, label: label || '' } });
    }, 'Toewijzen mislukt');
  };

  // ── Laden en verversen ─────────────────────────────────────────────────
  var laatsteVingerafdruk = '';
  function vingerafdruk(d) {
    return JSON.stringify([d.syndicoaches, d.toewijzingen, d.extra_postcodes]);
  }

  RG.zetStand = function (d) {
    S.syndicoaches = d.syndicoaches || [];
    S.toewijzingen = d.toewijzingen || {};
    S.extra = d.extra_postcodes || {};
    S.isAdmin = !!d.is_admin;
    if (S.actief && !RG.coach(S.actief)) S.actief = null;
    if (RG.voegExtraSamen) RG.voegExtraSamen();
  };

  /** @param {boolean} forceer ook hertekenen als er niets veranderde */
  RG.laad = async function (forceer) {
    var d = await RG.api('/stand');
    var v = vingerafdruk(d);
    if (!forceer && v === laatsteVingerafdruk) return d;
    laatsteVingerafdruk = v;
    RG.zetStand(d);
    RG.teken();
    return d;
  };

  /** Hertekent zijbalk en kaart (gezet in regios.js en regios-kaart.js). */
  RG.teken = function () {
    if (RG.tekenCoaches) RG.tekenCoaches();
    if (RG.kleurKaart) RG.kleurKaart();
  };

  RG.download = function (bestandsnaam, tekst) {
    var blob = new Blob(['﻿' + tekst], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = bestandsnaam;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
})();
