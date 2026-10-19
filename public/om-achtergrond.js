/**
 * De achtergrondbouwer -- GEDEELD onderdeel (niet aan een module gebonden).
 *
 * Zet een beeld met een doorzichtige achtergrond (een componentje) op een
 * vlak in een merkkleur, met optioneel een swirl erachter in een tweede
 * merkkleur, en maakt er een PNG van. De serverkant (keuzes nakijken, de
 * lijst swirls, het palet) is src/lib/achtergrond.js.
 *
 * Gebruik:
 *   OMAchtergrond.open({
 *     beeld: '<adres van het componentje>',
 *     waarde: <bewaarde keuzes of null>,
 *     gegevens: { palet, verhoudingen, swirls }   // van bouwerGegevens() op de server
 *     opBewaar: async function (keuzes, pngBlob) { ... opladen en bewaren ... },
 *   });
 *
 * De bouwer laadt zelf niets op en bewaart niets: dat doet wie hem opent
 * (elke module heeft haar eigen map en rechten). `opBewaar` krijgt de keuzes
 * ZONDER `url` en `bron`; die vult de aanroeper in.
 *
 * Wat je ziet IS wat er bewaard wordt: het voorbeeld en de PNG komen uit
 * dezelfde tekenfunctie, op dezelfde resolutie.
 */
(function () {
  'use strict';

  var BREEDTE = 1600;              // breedte van de gemaakte PNG
  var MAX_BYTES = 2.9 * 1024 * 1024; // de upload van de modules weigert boven 3 MB
  var STANDAARD = {
    verhouding: '16:9',
    kleur: '#f0f9ff',
    swirl: { naam: '', kleur: '#bae6fd', schaal: 1.1, x: 0.75, y: 0.35, draai: 0, dekking: 1 },
    beeld: { schaal: 0.8, x: 0.5, y: 0.5 },
  };

  var svgTekst = {};   // pad -> tekst van de SVG (eenmaal ophalen)
  var beeldCache = {}; // sleutel -> HTMLImageElement

  function e(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function zelfde(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }

  function verhouding(key) {
    var m = /^(\d+):(\d+)$/.exec(key || '') || [0, 16, 9];
    return Number(m[2]) / Number(m[1]);
  }

  /**
   * Een beeld van onze eigen opslag (link.openvme.be/assets/..., of een ander
   * domein met dezelfde /assets/-route) halen we via de EIGEN oorsprong: een
   * canvas met een beeld van een andere oorsprong kan je niet meer bewaren.
   */
  function eigenAdres(url) {
    var m = /^https?:\/\/([^/]+)\/assets\/(.+)$/i.exec(url || '');
    if (m && (/^link\.(openvme|syndicoach)\.be$/i.test(m[1]) || m[1] === location.host)) return location.origin + '/assets/' + m[2];
    return url;
  }

  function laadBeeld(src, sleutel) {
    sleutel = sleutel || src;
    if (beeldCache[sleutel]) return Promise.resolve(beeldCache[sleutel]);
    return new Promise(function (ok, nok) {
      var img = new Image();
      if (!/^(data:|blob:)/.test(src) && src.indexOf(location.origin) !== 0) img.crossOrigin = 'anonymous';
      img.onload = function () { beeldCache[sleutel] = img; ok(img); };
      img.onerror = function () { nok(new Error('Het beeld kon niet geladen worden.')); };
      img.src = src;
    });
  }

  async function haalSvg(pad) {
    if (svgTekst[pad]) return svgTekst[pad];
    var res = await fetch(pad, { credentials: 'include' });
    if (!res.ok) throw new Error('Swirl niet gevonden: ' + pad);
    svgTekst[pad] = await res.text();
    return svgTekst[pad];
  }

  /**
   * Een SVG met EEN kleur in een andere kleur. Elke fill/stroke behalve
   * "none" krijgt de nieuwe kleur. Zonder width/height (enkel een viewBox)
   * heeft een SVG-beeld geen eigen maat; die zetten we er dan bij.
   */
  function kleurOm(tekst, kleur) {
    var s = tekst
      .replace(/(fill|stroke)\s*=\s*"(?!none")[^"]*"/gi, '$1="' + kleur + '"')
      .replace(/(fill|stroke)\s*:\s*(?!none)[^;"']+/gi, '$1:' + kleur);
    if (!/<svg[^>]*\swidth=/i.test(s)) {
      var vb = /viewBox\s*=\s*"[\d.\-]+[\s,]+[\d.\-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/i.exec(s);
      if (vb) s = s.replace(/<svg/i, '<svg width="' + vb[1] + '" height="' + vb[2] + '"');
    }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  async function swirlBeeld(swirl, kleur) {
    var tekst = await haalSvg(swirl.pad);
    return laadBeeld(kleurOm(tekst, kleur), swirl.pad + '|' + kleur);
  }

  /**
   * De ENIGE tekenfunctie: voor het voorbeeld en voor de PNG. Geeft de
   * randen terug van wat er staat (om te kunnen slepen).
   */
  function teken(ctx, W, H, k, imgs) {
    var randen = {};
    ctx.clearRect(0, 0, W, H);
    if (k.kleur) { ctx.fillStyle = k.kleur; ctx.fillRect(0, 0, W, H); }
    if (k.swirl && imgs.swirl) {
      var s = k.swirl;
      var sw = s.schaal * W;
      var sh = sw * (imgs.swirl.naturalHeight / (imgs.swirl.naturalWidth || 1));
      ctx.save();
      ctx.globalAlpha = s.dekking;
      ctx.translate(s.x * W, s.y * H);
      ctx.rotate(s.draai * Math.PI / 180);
      ctx.drawImage(imgs.swirl, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      randen.swirl = { x: s.x * W - sw / 2, y: s.y * H - sh / 2, w: sw, h: sh };
    }
    if (imgs.beeld) {
      var b = k.beeld;
      var iw = imgs.beeld.naturalWidth || 1;
      var ih = imgs.beeld.naturalHeight || 1;
      var f = Math.min(b.schaal * W / iw, b.schaal * H / ih);
      var bw = iw * f;
      var bh = ih * f;
      var bx = b.x * W - bw / 2;
      var by = b.y * H - bh / 2;
      ctx.drawImage(imgs.beeld, bx, by, bw, bh);
      randen.beeld = { x: bx, y: by, w: bw, h: bh };
    }
    return randen;
  }

  // ── Het venster ─────────────────────────────────────────────────────────

  var v = null; // de toestand van het open venster

  function sluit() {
    if (!v) return;
    v.dlg.close();
    v.dlg.remove();
    v = null;
  }

  function kleurKnoppen(actie, huidige, metGeen) {
    var palet = v.gegevens.palet || [];
    return '<div class="flex flex-col gap-1.5">'
      + palet.map(function (f) {
        return '<div class="flex flex-wrap gap-1.5" title="' + e(f.familie) + '">' + f.kleuren.map(function (kl) {
          var aan = zelfde(kl, huidige);
          return '<button type="button" class="w-7 h-7 rounded-full border border-base-content/20 hover:scale-110 transition-transform' + (aan ? ' ring-2 ring-offset-2 ring-primary' : '') + '" style="background-color:' + e(kl) + '" data-oma="' + actie + '" data-waarde="' + e(kl) + '" aria-label="' + e(kl) + '"></button>';
        }).join('') + '</div>';
      }).join('')
      + (metGeen ? '<button type="button" class="btn btn-xs ' + (!huidige ? 'btn-primary' : 'btn-ghost') + ' self-start" data-oma="' + actie + '" data-waarde="">Geen (doorzichtig)</button>' : '')
      + '</div>';
  }

  function schuif(label, actie, waarde, min, max, stap) {
    return '<label class="block"><span class="text-xs opacity-70">' + e(label) + '</span>'
      + '<input type="range" class="range range-xs range-primary" data-oma-schuif="' + actie + '" min="' + min + '" max="' + max + '" step="' + stap + '" value="' + e(waarde) + '"></label>';
  }

  function swirlLijst() {
    var k = v.keuzes;
    var aan = k.swirl ? k.swirl.naam : '';
    return '<div class="grid grid-cols-4 gap-1.5">'
      + '<button type="button" class="h-14 rounded-lg border text-xs ' + (!aan ? 'border-primary ring-2 ring-primary' : 'border-base-content/15') + '" data-oma="swirl" data-waarde="">Geen</button>'
      + v.gegevens.swirls.map(function (s) {
        var voorbeeld = v.voorbeeldjes[s.naam];
        return '<button type="button" class="h-14 rounded-lg border bg-base-200/60 p-1 ' + (aan === s.naam ? 'border-primary ring-2 ring-primary' : 'border-base-content/15') + '" data-oma="swirl" data-waarde="' + e(s.naam) + '" title="' + e(s.label) + '">'
          + (voorbeeld ? '<img src="' + e(voorbeeld) + '" alt="" class="w-full h-full object-contain">' : '<span class="text-[10px]">' + e(s.label) + '</span>')
          + '</button>';
      }).join('') + '</div>';
  }

  function tekenBediening() {
    var k = v.keuzes;
    var s = k.swirl;
    v.bediening.innerHTML = ''
      + '<div class="flex flex-col gap-4">'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Vlak</h4>'
      + '<select class="select select-bordered select-sm w-full mb-2" data-oma-keuze="verhouding">'
      + (v.gegevens.verhoudingen || []).map(function (x) { return '<option value="' + e(x.key) + '"' + (x.key === k.verhouding ? ' selected' : '') + '>' + e(x.label) + '</option>'; }).join('')
      + '</select>' + kleurKnoppen('kleur', k.kleur, true) + '</section>'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Swirl</h4>' + swirlLijst()
      + (s ? '<div class="mt-2 flex flex-col gap-2">' + kleurKnoppen('swirl-kleur', s.kleur, false)
        + schuif('Grootte', 'swirl-schaal', s.schaal, 0.2, 3, 0.01)
        + schuif('Draaien', 'swirl-draai', s.draai, -180, 180, 1)
        + schuif('Doorzichtig', 'swirl-dekking', 1.05 - s.dekking, 0.05, 1, 0.01)
        + '</div>' : '')
      + '</section>'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Beeld</h4>'
      + schuif('Grootte', 'beeld-schaal', k.beeld.schaal, 0.2, 1.4, 0.01)
      + '<div class="flex gap-1.5 mt-1"><button type="button" class="btn btn-xs btn-ghost" data-oma="beeld-midden">Beeld in het midden</button></div>'
      + '</section>'
      + '<p class="text-xs opacity-60">Versleep het beeld of de swirl in het voorbeeld om ze te verplaatsen. Wat buiten het vlak valt, wordt afgesneden.</p>'
      + '</div>';
  }

  async function hertekenVoorbeeld() {
    var k = v.keuzes;
    var W = BREEDTE;
    var H = Math.round(W * verhouding(k.verhouding));
    if (v.canvas.width !== W || v.canvas.height !== H) { v.canvas.width = W; v.canvas.height = H; }
    var nr = ++v.teller;
    var swirl = k.swirl ? v.gegevens.swirls.filter(function (x) { return x.naam === k.swirl.naam; })[0] : null;
    var imgs = { beeld: v.beeld, swirl: null };
    if (swirl) {
      try { imgs.swirl = await swirlBeeld(swirl, k.swirl.kleur); } catch (err) { meld(err.message); }
    }
    if (nr !== v.teller || !v) return; // intussen al een nieuwere tekening
    v.randen = teken(v.canvas.getContext('2d'), W, H, k, imgs);
    v.imgs = imgs;
  }

  function meld(tekst) {
    if (!v) return;
    v.melding.textContent = tekst || '';
    v.melding.hidden = !tekst;
  }

  function wijzig(tekenOpnieuwBediening) {
    if (tekenOpnieuwBediening) tekenBediening();
    hertekenVoorbeeld();
  }

  var acties = {
    'kleur': function (w) { v.keuzes.kleur = w || ''; wijzig(true); },
    'swirl': function (w) {
      if (!w) { v.keuzes.swirl = null; wijzig(true); return; }
      var vorige = v.keuzes.swirl || v.laatsteSwirl || kopie(STANDAARD.swirl);
      v.keuzes.swirl = Object.assign({}, vorige, { naam: w });
      v.laatsteSwirl = v.keuzes.swirl;
      wijzig(true);
    },
    'swirl-kleur': function (w) { if (v.keuzes.swirl) { v.keuzes.swirl.kleur = w; wijzig(true); } },
    'beeld-midden': function () { v.keuzes.beeld.x = 0.5; v.keuzes.beeld.y = 0.5; wijzig(false); },
    'annuleer': function () { sluit(); },
    'bewaar': bewaar,
  };

  var schuiven = {
    'swirl-schaal': function (n) { v.keuzes.swirl.schaal = n; },
    'swirl-draai': function (n) { v.keuzes.swirl.draai = n; },
    'swirl-dekking': function (n) { v.keuzes.swirl.dekking = Math.round((1.05 - n) * 100) / 100; },
    'beeld-schaal': function (n) { v.keuzes.beeld.schaal = n; },
  };

  async function bewaar() {
    var knop = v.dlg.querySelector('[data-oma="bewaar"]');
    knop.disabled = true;
    knop.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Bezig…';
    meld('');
    try {
      await hertekenVoorbeeld();
      var blob = await naarPng(BREEDTE);
      if (blob.size > MAX_BYTES) blob = await naarPng(1200);
      if (blob.size > MAX_BYTES) throw new Error('Het beeld wordt te groot. Kies een kleiner componentje.');
      var keuzes = kopie(v.keuzes);
      await v.opBewaar(keuzes, blob);
      sluit();
    } catch (err) {
      if (!v) return;
      meld(err && err.name === 'SecurityError'
        ? 'Dit beeld staat op een andere website en mag daarom niet bewerkt worden. Laad het op of kies het uit de Asset Manager.'
        : (err.message || 'Bewaren mislukt.'));
      knop.disabled = false;
      knop.textContent = 'Bewaren';
    }
  }

  function naarPng(W) {
    var k = v.keuzes;
    var H = Math.round(W * verhouding(k.verhouding));
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    teken(c.getContext('2d'), W, H, k, v.imgs || {});
    return new Promise(function (ok, nok) {
      try {
        c.toBlob(function (b) { if (b) ok(b); else nok(new Error('Het beeld kon niet gemaakt worden.')); }, 'image/png');
      } catch (err) { nok(err); }
    });
  }

  // Slepen in het voorbeeld: eerst het beeld (dat ligt bovenaan), dan de swirl.
  function koppelSlepen() {
    var c = v.canvas;
    var sleep = null;
    function punt(ev) {
      var r = c.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height };
    }
    function binnen(p, rd) { return rd && p.x >= rd.x && p.x <= rd.x + rd.w && p.y >= rd.y && p.y <= rd.y + rd.h; }
    c.addEventListener('pointerdown', function (ev) {
      var p = punt(ev);
      var randen = v.randen || {};
      var laag = binnen(p, randen.beeld) ? 'beeld' : (binnen(p, randen.swirl) && v.keuzes.swirl ? 'swirl' : null);
      if (!laag) return;
      var doel = v.keuzes[laag];
      sleep = { laag: laag, p: p, x: doel.x, y: doel.y };
      c.setPointerCapture(ev.pointerId);
      c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', function (ev) {
      var p = punt(ev);
      if (!sleep) {
        var randen = v.randen || {};
        c.style.cursor = binnen(p, randen.beeld) || (v.keuzes.swirl && binnen(p, randen.swirl)) ? 'grab' : 'default';
        return;
      }
      var doel = v.keuzes[sleep.laag];
      doel.x = Math.min(1.5, Math.max(-0.5, sleep.x + (p.x - sleep.p.x) / c.width));
      doel.y = Math.min(1.5, Math.max(-0.5, sleep.y + (p.y - sleep.p.y) / c.height));
      hertekenVoorbeeld();
    });
    function los() { sleep = null; c.style.cursor = 'default'; }
    c.addEventListener('pointerup', los);
    c.addEventListener('pointercancel', los);
  }

  async function maakVoorbeeldjes() {
    await Promise.all(v.gegevens.swirls.map(async function (s) {
      try { v.voorbeeldjes[s.naam] = kleurOm(await haalSvg(s.pad), '#4B5563'); } catch (err) { /* dan enkel de naam */ }
    }));
    if (v) tekenBediening();
  }

  function begin(waarde, swirls) {
    var k = kopie(STANDAARD);
    if (waarde) {
      k.verhouding = waarde.verhouding || k.verhouding;
      k.kleur = waarde.kleur || '';
      k.swirl = waarde.swirl ? Object.assign(kopie(STANDAARD.swirl), waarde.swirl) : null;
      k.beeld = Object.assign(k.beeld, waarde.beeld || {});
    } else {
      k.swirl.naam = swirls.length ? swirls[0].naam : '';
      if (!k.swirl.naam) k.swirl = null;
    }
    // Een bewaarde swirl die intussen uit de map verdween: geen swirl.
    if (k.swirl && !swirls.some(function (s) { return s.naam === k.swirl.naam; })) k.swirl = null;
    return k;
  }

  async function open(o) {
    sluit();
    var dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = '<div class="modal-box max-w-6xl w-11/12 p-0 overflow-hidden">'
      + '<div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-base-content/10">'
      + '<h3 class="font-bold text-lg">' + e(o.titel || 'Achtergrond maken') + '</h3>'
      + '<button type="button" class="btn btn-sm btn-ghost btn-circle" data-oma="annuleer" aria-label="Sluiten">✕</button></div>'
      + '<div class="grid lg:grid-cols-[minmax(0,1fr)_320px]">'
      + '<div class="p-5 bg-base-200/60 flex items-center justify-center min-h-[320px]">'
      + '<canvas data-oma-canvas class="rounded-xl shadow" style="max-width:100%;max-height:62vh;width:auto;height:auto;'
      + 'background-color:#fff;background-image:conic-gradient(#e5e7eb 25%,transparent 0 50%,#e5e7eb 0 75%,transparent 0);background-size:24px 24px"></canvas></div>'
      + '<div class="p-5 overflow-y-auto" style="max-height:72vh" data-oma-bediening><span class="loading loading-spinner"></span></div></div>'
      + '<div class="flex items-center gap-2 px-5 py-3 border-t border-base-content/10">'
      + '<p class="text-sm text-error flex-1" data-oma-melding hidden></p><span class="flex-1"></span>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-oma="annuleer">Annuleren</button>'
      + '<button type="button" class="btn btn-sm btn-primary" data-oma="bewaar">Bewaren</button></div></div>';
    document.body.appendChild(dlg);
    v = {
      dlg: dlg,
      canvas: dlg.querySelector('[data-oma-canvas]'),
      bediening: dlg.querySelector('[data-oma-bediening]'),
      melding: dlg.querySelector('[data-oma-melding]'),
      gegevens: o.gegevens || { palet: [], verhoudingen: [], swirls: [] },
      opBewaar: o.opBewaar,
      voorbeeldjes: {},
      teller: 0,
      keuzes: null,
      laatsteSwirl: null,
      beeld: null,
      imgs: null,
      randen: null,
    };
    v.gegevens.swirls = v.gegevens.swirls || [];
    v.keuzes = begin(o.waarde, v.gegevens.swirls);

    // EEN listener voor het hele venster (REGEL 3).
    dlg.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-oma]');
      if (!el || !v) return;
      var fn = acties[el.getAttribute('data-oma')];
      if (fn) fn(el.getAttribute('data-waarde'));
    });
    dlg.addEventListener('input', function (ev) {
      var el = ev.target.closest('[data-oma-schuif]');
      if (!el || !v) return;
      var fn = schuiven[el.getAttribute('data-oma-schuif')];
      if (fn) { fn(Number(el.value)); hertekenVoorbeeld(); }
    });
    dlg.addEventListener('change', function (ev) {
      var el = ev.target.closest('[data-oma-keuze="verhouding"]');
      if (el && v) { v.keuzes.verhouding = el.value; hertekenVoorbeeld(); }
    });
    dlg.addEventListener('close', function () { if (v && v.dlg === dlg) { dlg.remove(); v = null; } });
    dlg.showModal();
    koppelSlepen();

    try {
      v.beeld = await laadBeeld(eigenAdres(o.beeld));
    } catch (err) {
      meld('Het beeld kon niet geladen worden. Kies een beeld uit de Asset Manager of laad het op.');
    }
    if (!v) return;
    tekenBediening();
    hertekenVoorbeeld();
    maakVoorbeeldjes();
  }

  window.OMAchtergrond = { open: open, sluit: sluit };
})();
