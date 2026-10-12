/**
 * Nieuwsbrieven -- gedeelde staat en hulpjes. Elk ander newsletters-*.js-bestand
 * hangt zijn functies aan window.NB; event handlers gaan via data-action en de
 * centrale listener in newsletters-bootstrap.js (REGEL 3).
 */
(function () {
  'use strict';

  var NB = window.NB = window.NB || {};
  NB.state = NB.state || { boot: null };
  NB.actions = NB.actions || {};
  NB.views = NB.views || {};

  NB.esc = function (v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  NB.api = async function (pad, opties) {
    opties = opties || {};
    var init = { method: opties.method || 'GET', credentials: 'include', headers: {} };
    if (opties.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opties.body);
    }
    var res = await fetch('/nieuwsbrieven' + pad, init);
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = null;
    try { data = await res.json(); } catch (e) { /* geen json */ }
    if (!res.ok || !data || data.success === false) {
      var fout = new Error((data && (data.error || data.message)) || ('Fout ' + res.status));
      if (data && data.code) fout.code = data.code;
      throw fout;
    }
    return data.data;
  };

  NB.upload = async function (pad, blob) {
    var res = await fetch('/nieuwsbrieven' + pad, {
      method: pad.indexOf('/api/thingies/') === 0 ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || 'Upload mislukt');
    return data.data;
  };

  NB.toast = function (tekst, soort) {
    var bak = document.getElementById('nbToast');
    if (!bak) return;
    var kleur = soort === 'error' ? 'alert-error' : soort === 'warning' ? 'alert-warning' : soort === 'info' ? 'alert-info' : 'alert-success';
    var el = document.createElement('div');
    el.className = 'alert ' + kleur + ' shadow-lg max-w-md text-sm';
    el.textContent = tekst;
    bak.appendChild(el);
    setTimeout(function () { el.remove(); }, soort === 'error' ? 7000 : 3500);
  };

  NB.fout = function (err) {
    NB.toast(err && err.message ? err.message : String(err), 'error');
  };

  // ─── Datums ───────────────────────────────────────────────────────────────

  NB.datum = function (iso, opties) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('nl-BE', Object.assign({ timeZone: 'Europe/Brussels' }, opties || {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })).format(new Date(iso));
    } catch (e) { return iso; }
  };

  NB.teller = function (iso) {
    var ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return { voorbij: true, d: 0, u: 0, m: 0 };
    var m = Math.floor(ms / 60000);
    return { voorbij: false, d: Math.floor(m / 1440), u: Math.floor((m % 1440) / 60), m: m % 60 };
  };

  NB.tellerTekst = function (iso) {
    var t = NB.teller(iso);
    if (t.voorbij) return 'voorbij';
    if (t.d > 0) return 'nog ' + t.d + ' ' + (t.d === 1 ? 'dag' : 'dagen');
    if (t.u > 0) return 'nog ' + t.u + ' uur';
    return 'nog ' + t.m + ' min';
  };

  /** Voor een <input type="datetime-local"> in Brussel-tijd. */
  NB.lokaal = function (iso) {
    if (!iso) return '';
    var p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    var v = {};
    p.forEach(function (x) { v[x.type] = x.value; });
    return v.year + '-' + v.month + '-' + v.day + 'T' + (v.hour === '24' ? '00' : v.hour) + ':' + v.minute;
  };

  /** Terug van datetime-local (Brussel) naar ISO. */
  NB.vanLokaal = function (waarde) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(waarde || ''));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    for (var i = 0; i < 2; i++) {
      var terug = NB.lokaal(new Date(t).toISOString());
      var mm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(terug);
      var alsUtc = Date.UTC(+mm[1], +mm[2] - 1, +mm[3], +mm[4], +mm[5]);
      t += Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - alsUtc;
    }
    return new Date(t).toISOString();
  };

  // ─── Labels ───────────────────────────────────────────────────────────────

  NB.STATUS = {
    open: { label: 'Open', klasse: 'badge-ghost', kleur: '#e5e7eb' },
    draft: { label: 'Bezig', klasse: 'badge-warning', kleur: '#fdba74' },
    submitted: { label: 'Ingeleverd', klasse: 'badge-info', kleur: '#38bdf8' },
    approved: { label: 'Goedgekeurd', klasse: 'badge-success', kleur: '#14b8a6' },
  };

  NB.EDITIE_STATUS = {
    collecting: { label: 'Stukjes verzamelen', klasse: 'badge-warning' },
    review: { label: 'Nalezen', klasse: 'badge-info' },
    scheduled: { label: 'Ingepland', klasse: 'badge-primary' },
    sent: { label: 'Verzonden', klasse: 'badge-success' },
    cancelled: { label: 'Geannuleerd', klasse: 'badge-ghost' },
  };

  NB.statusBadge = function (status) {
    var s = NB.STATUS[status] || NB.STATUS.open;
    return '<span class="badge badge-sm ' + s.klasse + '">' + s.label + '</span>';
  };

  NB.editieBadge = function (status) {
    var s = NB.EDITIE_STATUS[status] || NB.EDITIE_STATUS.collecting;
    return '<span class="badge ' + s.klasse + '">' + s.label + '</span>';
  };

  NB.soort = function (kind) {
    var k = NB.state.boot && NB.state.boot.kinds && NB.state.boot.kinds[kind];
    return k ? k.label : kind;
  };

  NB.isAuto = function (kind) {
    var k = NB.state.boot && NB.state.boot.kinds && NB.state.boot.kinds[kind];
    return Boolean(k && k.auto);
  };

  NB.isVraag = function (kind) {
    var k = NB.state.boot && NB.state.boot.kinds && NB.state.boot.kinds[kind];
    return Boolean(k && k.interactive);
  };

  NB.initialen = function (naam) {
    var d = String(naam || '').trim().split(/\s+/).filter(Boolean);
    if (!d.length) return '?';
    return (d[0][0] + (d.length > 1 ? d[d.length - 1][0] : '')).toUpperCase();
  };

  NB.gezicht = function (naam, maat) {
    maat = maat || 'w-7';
    if (!naam) return '<div class="avatar placeholder"><div class="bg-base-300 text-base-content/50 rounded-full ' + maat + '"><span class="text-xs">?</span></div></div>';
    return '<div class="avatar placeholder" title="' + NB.esc(naam) + '"><div class="bg-primary/15 text-primary rounded-full ' + maat + '"><span class="text-xs font-bold">' + NB.esc(NB.initialen(naam)) + '</span></div></div>';
  };

  /** Segmentbalk: één vakje per niet-automatisch stukje, gekleurd per stand. */
  NB.balk = function (items) {
    var echt = (items || []).filter(function (i) { return !NB.isAuto(i.kind); });
    if (!echt.length) return '';
    return '<div class="nb-balk">' + echt.map(function (i) {
      return '<span title="' + NB.esc(i.title) + '" style="background:' + (NB.STATUS[i.status] || NB.STATUS.open).kleur + '"></span>';
    }).join('') + '</div>';
  };

  NB.balkUitVoortgang = function (p) {
    var vakjes = [];
    var push = function (n, s) { for (var i = 0; i < n; i++) vakjes.push(s); };
    push(p.goedgekeurd, 'approved'); push(p.ingeleverd, 'submitted'); push(p.bezig, 'draft'); push(p.open, 'open');
    if (!vakjes.length) return '';
    return '<div class="nb-balk">' + vakjes.map(function (s) { return '<span style="background:' + NB.STATUS[s].kleur + '"></span>'; }).join('') + '</div>';
  };

  NB.reeks = function (id) {
    return ((NB.state.boot && NB.state.boot.series) || []).find(function (s) { return s.id === id; }) || null;
  };

  NB.gebruikersOpties = function (gekozen, metLeeg) {
    var users = (NB.state.boot && NB.state.boot.users) || [];
    return (metLeeg ? '<option value="">Nog niemand</option>' : '') + users.map(function (u) {
      return '<option value="' + NB.esc(u.id) + '"' + (u.id === gekozen ? ' selected' : '') + '>' + NB.esc(u.name) + '</option>';
    }).join('');
  };

  NB.ikons = function () {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  };

  NB.ga = function (hash) {
    if (window.location.hash === hash) NB.route(); else window.location.hash = hash;
  };

  // ─── Beelden ──────────────────────────────────────────────────────────────

  /** Een SVG (url) naar een PNG-blob, via canvas. */
  NB.svgNaarPng = function (url, maat) {
    return new Promise(function (ok, nok) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = maat; c.height = maat;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, maat, maat);
        c.toBlob(function (b) { b ? ok(b) : nok(new Error('PNG maken mislukt')); }, 'image/png');
      };
      img.onerror = function () { nok(new Error('Tekening niet geladen')); };
      img.src = url;
    });
  };

  /** Mail kent geen SVG: zorg dat er een PNG-kopie van de tekening bestaat. */
  NB.zorgVoorPng = async function (naam) {
    var lijst = NB.state.tekeningen || [];
    var t = lijst.find(function (x) { return x.name === naam; });
    if (!t || t.png) return;
    var blob = await NB.svgNaarPng(t.svg, 400);
    var r = await NB.upload('/api/thingies/' + encodeURIComponent(naam), blob);
    t.png = r.png;
  };

  NB.laadTekeningen = async function () {
    if (NB.state.tekeningen) return NB.state.tekeningen;
    try { NB.state.tekeningen = await NB.api('/api/thingies'); } catch (e) { NB.state.tekeningen = []; }
    return NB.state.tekeningen;
  };

  /** Een gekozen bestand naar PNG/JPEG/GIF (mail kent geen WebP/HEIC). */
  NB.naarMailbeeld = function (bestand) {
    if (['image/png', 'image/jpeg', 'image/gif'].indexOf(bestand.type) >= 0) return Promise.resolve(bestand);
    return new Promise(function (ok, nok) {
      var url = URL.createObjectURL(bestand);
      var img = new Image();
      img.onload = function () {
        var max = 1600;
        var schaal = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * schaal); c.height = Math.round(img.height * schaal);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); b ? ok(b) : nok(new Error('Omzetten mislukt')); }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { nok(new Error('Dit beeld kan niet gelezen worden')); };
      img.src = url;
    });
  };

  NB.dialoog = function (id) { return document.getElementById(id); };
})();
