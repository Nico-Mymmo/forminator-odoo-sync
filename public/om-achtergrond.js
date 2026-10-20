/**
 * De achtergrondbouwer -- GEDEELD onderdeel (niet aan een module gebonden).
 *
 * Een opgemaakt beeld heeft TWEE LAGEN die apart blijven (zie
 * src/lib/achtergrond.js voor de bewaarde vorm):
 *   - ACHTERGROND: een vlak in een merkkleur, met optioneel een swirl. Vult
 *     altijd het hele vak, welke vorm het ook heeft (de swirl schaalt mee met
 *     de langste zijde).
 *   - VOORGROND: het opgeladen beeld, vast aan een ANKER (midden, een rand
 *     of een hoek) met een marge. Een andere vorm van het vak laat het op
 *     datzelfde anker staan. BIJSNIJDEN gaat zoals in elk fotoprogramma: een
 *     kader met grepen over het hele beeld. Wat binnen dat kader valt, staat
 *     ALTIJD volledig in beeld, welke vorm het vak ook heeft; de ruimte die
 *     overblijft, vult de achtergrond.
 *
 * Gebruik:
 *   OMAchtergrond.open({
 *     beeld: '<adres van de voorgrond>',
 *     waarde: <bewaarde keuzes of null>,
 *     gegevens: { palet, verhoudingen, swirls }   // van bouwerGegevens() op de server
 *     oplaad: async function (bestand) { return '<adres>'; }, // optioneel: "Ander beeld"
 *     opBewaar: async function (keuzes, pngBlob) { ... opladen en bewaren ... },
 *   });
 *   OMAchtergrond.maakAlles(keuzes, gegevens) -> Promise<{ '16:9': Blob, ... }>
 *     zonder venster: de PNG in ELKE vorm, bv. na het wisselen van de voorgrond.
 *   OMAchtergrond.maakPng(keuzes, gegevens) -> Promise<Blob>  (enkel keuzes.verhouding)
 *
 * Bewaren maakt het beeld in ALLE vormen (`opBewaar(keuzes, varianten)`,
 * varianten = { verhouding: Blob }): waar het later gebruikt wordt, kiest
 * men de vorm die past.
 *
 * De bouwer bewaart niets: dat doet wie hem opent (elke module heeft haar
 * eigen map en rechten). `opBewaar` krijgt de keuzes MET `bron` (de voorgrond,
 * die in het venster kan wisselen) en ZONDER `url`; die vult de aanroeper in.
 *
 * Wat je ziet IS wat er bewaard wordt: het voorbeeld en de PNG komen uit
 * dezelfde tekenfunctie, op dezelfde resolutie. Enkel het stippellijntje
 * rond de voorgrond staat alleen in het voorbeeld.
 */
(function () {
  'use strict';

  var BREEDTE = 1600;              // breedte van het voorbeeld
  var VARIANT_BREEDTE = 1200;      // breedte van elke bewaarde vorm (een mail toont hoogstens 560 px)
  var MAX_BYTES = 2.9 * 1024 * 1024; // de upload van de modules weigert boven 3 MB
  var ANKERS = ['linksboven', 'boven', 'rechtsboven', 'links', 'midden', 'rechts', 'linksonder', 'onder', 'rechtsonder'];
  var ANKER_PIJL = { linksboven: '↖', boven: '↑', rechtsboven: '↗', links: '←', midden: '•', rechts: '→', linksonder: '↙', onder: '↓', rechtsonder: '↘' };
  var STANDAARD = {
    verhouding: '16:9',
    kleur: '#f0f9ff',
    swirl: { naam: '', kleur: '#bae6fd', schaal: 1.1, x: 0.75, y: 0.35, draai: 0, dekking: 1 },
    voorgrond: { anker: 'midden', schaal: 0.8, marge: 0.06, snij: { boven: 0, onder: 0, links: 0, rechts: 0 } },
  };

  var svgTekst = {};   // pad -> tekst van de SVG (eenmaal ophalen)
  var beeldCache = {}; // sleutel -> HTMLImageElement

  function e(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function zelfde(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
  function klem(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function verhouding(key) {
    var m = /^(\d+):(\d+)$/.exec(key || '') || [0, 16, 9];
    return Number(m[2]) / Number(m[1]);
  }
  function hor(anker) { return /links/.test(anker) ? 0 : /rechts/.test(anker) ? 2 : 1; }
  function ver(anker) { return /boven/.test(anker) ? 0 : /onder/.test(anker) ? 2 : 1; }

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
   * Waar de voorgrond komt in een vak van W x H. `kader` is het zichtbare
   * (bijgesneden) stuk; `beeld` is waar het HELE beeld getekend wordt (het
   * kader knipt het bij).
   */
  function plaatsVoorgrond(W, H, g, iw, ih) {
    var s = g.snij;
    var sw = Math.max(iw * 0.05, iw * (1 - s.links - s.rechts));
    var sh = Math.max(ih * 0.05, ih * (1 - s.boven - s.onder));
    var m = g.marge * Math.min(W, H);
    var h = hor(g.anker);
    var vv = ver(g.anker);
    // De uitsnede past ALTIJD volledig, ook met de marge erbij.
    var ruimW = Math.max(1, W - (h === 1 ? 0 : m));
    var ruimH = Math.max(1, H - (vv === 1 ? 0 : m));
    var f = Math.min(Math.min(1, g.schaal) * W / sw, Math.min(1, g.schaal) * H / sh, ruimW / sw, ruimH / sh);
    var dw = sw * f;
    var dh = sh * f;
    var x = h === 0 ? m : h === 2 ? W - dw - m : (W - dw) / 2;
    var y = vv === 0 ? m : vv === 2 ? H - dh - m : (H - dh) / 2;
    return {
      kader: { x: x, y: y, w: dw, h: dh },
      beeld: { x: x - s.links * iw * f, y: y - s.boven * ih * f, w: iw * f, h: ih * f },
    };
  }

  /**
   * De ENIGE tekenfunctie: voor het voorbeeld en voor de PNG. Geeft de
   * randen terug van wat er staat (om te kunnen slepen).
   */
  function teken(ctx, W, H, k, imgs) {
    var randen = {};
    ctx.clearRect(0, 0, W, H);
    // Achtergrond: vult altijd het hele vak.
    if (k.kleur) { ctx.fillStyle = k.kleur; ctx.fillRect(0, 0, W, H); }
    if (k.swirl && imgs.swirl) {
      var s = k.swirl;
      var sw = s.schaal * Math.max(W, H);
      var sh = sw * (imgs.swirl.naturalHeight / (imgs.swirl.naturalWidth || 1));
      ctx.save();
      ctx.globalAlpha = s.dekking;
      ctx.translate(s.x * W, s.y * H);
      ctx.rotate(s.draai * Math.PI / 180);
      ctx.drawImage(imgs.swirl, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      randen.swirl = { x: s.x * W - sw / 2, y: s.y * H - sh / 2, w: sw, h: sh };
    }
    // Voorgrond: aan zijn anker, bijgesneden tot zijn kader.
    if (imgs.beeld) {
      var p = plaatsVoorgrond(W, H, k.voorgrond, imgs.beeld.naturalWidth || 1, imgs.beeld.naturalHeight || 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.kader.x, p.kader.y, p.kader.w, p.kader.h);
      ctx.clip();
      ctx.drawImage(imgs.beeld, p.beeld.x, p.beeld.y, p.beeld.w, p.beeld.h);
      ctx.restore();
      randen.kader = p.kader;
      randen.beeld = p.beeld;
    }
    return randen;
  }

  function voorbeeldLijn(ctx, rd, W) {
    if (!rd) return;
    ctx.save();
    ctx.setLineDash([W / 120, W / 160]);
    ctx.lineWidth = Math.max(2, W / 600);
    ctx.strokeStyle = 'rgba(3,105,161,0.75)';
    ctx.strokeRect(rd.x, rd.y, rd.w, rd.h);
    ctx.restore();
  }

  /**
   * De lege rand rond een beeld, als bijsnijding. Met doorzichtigheid: alles
   * wat (bijna) doorzichtig is. Zonder: alles wat de kleur van de hoek heeft.
   */
  function legeRand(img) {
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var f = Math.min(1, 800 / Math.max(iw, ih));
    var w = Math.max(1, Math.round(iw * f));
    var h = Math.max(1, Math.round(ih * f));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, h);
    var d = cx.getImageData(0, 0, w, h).data;
    var hoek = [d[0], d[1], d[2], d[3]];
    var metAlfa = hoek[3] < 250;
    function leeg(i) {
      if (metAlfa) return d[i + 3] < 12;
      return Math.abs(d[i] - hoek[0]) + Math.abs(d[i + 1] - hoek[1]) + Math.abs(d[i + 2] - hoek[2]) < 30;
    }
    var x0 = w;
    var y0 = h;
    var x1 = -1;
    var y1 = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!leeg((y * w + x) * 4)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null; // helemaal leeg
    var r = function (n) { return Math.round(n * 1000) / 1000; };
    return { links: r(x0 / w), rechts: r(1 - (x1 + 1) / w), boven: r(y0 / h), onder: r(1 - (y1 + 1) / h) };
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

  function schuif(label, actie, waarde, min, max, stap, toon) {
    return '<label class="block"><span class="text-xs opacity-70 flex justify-between"><span>' + e(label) + '</span>'
      + (toon ? '<span data-oma-waarde="' + actie + '">' + e(toon(waarde)) + '</span>' : '') + '</span>'
      + '<input type="range" class="range range-xs range-primary" data-oma-schuif="' + actie + '" min="' + min + '" max="' + max + '" step="' + stap + '" value="' + e(waarde) + '"></label>';
  }

  function procent(n) { return Math.round(n * 100) + '%'; }

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

  function ankerRaster(huidig) {
    return '<div class="grid grid-cols-3 gap-1 w-28">' + ANKERS.map(function (a) {
      return '<button type="button" class="btn btn-sm btn-square ' + (a === huidig ? 'btn-primary' : 'btn-ghost border border-base-content/15') + '" data-oma="anker" data-waarde="' + a + '" title="' + e(a) + '">' + ANKER_PIJL[a] + '</button>';
    }).join('') + '</div>';
  }

  function tabKnop(naam, label) {
    return '<button type="button" role="tab" class="tab' + (v.tab === naam ? ' tab-active' : '') + '" data-oma="tab" data-waarde="' + naam + '">' + e(label) + '</button>';
  }

  function tekenBediening() {
    var k = v.keuzes;
    var s = k.swirl;
    var g = k.voorgrond;
    tekenVormen();

    var voorgrond = '<div class="flex flex-col gap-4">'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Beeld</h4><div class="flex flex-wrap gap-1.5">'
      + (v.oplaad ? '<label class="btn btn-xs btn-outline">Ander beeld…<input type="file" accept="image/*" class="hidden" data-oma-bestand></label>' : '')
      + '</div></section>'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Plaats</h4><div class="flex gap-4 items-start">' + ankerRaster(g.anker)
      + '<div class="flex-1 flex flex-col gap-2">'
      + schuif('Grootte', 'vg-schaal', Math.min(1, g.schaal), 0.1, 1, 0.01, procent)
      + schuif('Afstand tot de rand', 'vg-marge', g.marge, 0, 0.3, 0.005, procent)
      + '</div></div><p class="text-xs opacity-60 mt-1">Je kan het beeld ook verslepen: het springt naar het dichtste anker.</p></section>'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Bijsnijden</h4>'
      + '<div class="flex flex-wrap gap-1.5"><button type="button" class="btn btn-sm btn-outline" data-oma="snij-aan"><i data-lucide="crop" class="w-4 h-4"></i> Bijsnijden</button>'
      + (bijgesneden(g.snij) ? '<button type="button" class="btn btn-sm btn-ghost" data-oma="snij-nul">Hele beeld</button>' : '')
      + '</div><p class="text-xs opacity-60 mt-1">Wat je uitsnijdt, staat altijd volledig in beeld. De ruimte die overblijft, vult de achtergrond.</p></section>'
      + '</div>';

    var achtergrond = '<div class="flex flex-col gap-4">'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Kleur</h4>' + kleurKnoppen('kleur', k.kleur, true) + '</section>'
      + '<section><h4 class="font-semibold text-sm mb-1.5">Swirl</h4>' + swirlLijst()
      + (s ? '<div class="mt-2 flex flex-col gap-2">' + kleurKnoppen('swirl-kleur', s.kleur, false)
        + schuif('Grootte', 'swirl-schaal', s.schaal, 0.2, 3, 0.01)
        + schuif('Links - rechts', 'swirl-x', s.x, -0.5, 1.5, 0.01)
        + schuif('Boven - onder', 'swirl-y', s.y, -0.5, 1.5, 0.01)
        + schuif('Draaien', 'swirl-draai', s.draai, -180, 180, 1)
        + schuif('Doorzichtig', 'swirl-dekking', 1.05 - s.dekking, 0.05, 1, 0.01)
        + '</div>' : '')
      + '<p class="text-xs opacity-60 mt-1">De swirl versleep je in het voorbeeld op een plek waar het beeld doorzichtig is.</p></section>'
      + '</div>';

    if (v.snijModus) {
      v.bediening.innerHTML = '<div class="flex flex-col gap-4">'
        + '<section><h4 class="font-semibold text-sm mb-1.5">Bijsnijden</h4>'
        + '<p class="text-sm opacity-80">Sleep aan de hoeken of de randen van het kader. Sleep binnen het kader om het te verplaatsen.</p></section>'
        + '<div class="flex flex-wrap gap-1.5">'
        + '<button type="button" class="btn btn-sm btn-outline" data-oma="rand-weg">Lege rand wegknippen</button>'
        + '<button type="button" class="btn btn-sm btn-ghost" data-oma="snij-nul">Hele beeld</button></div>'
        + '<button type="button" class="btn btn-sm btn-primary self-start" data-oma="snij-klaar">Klaar met bijsnijden</button>'
        + '</div>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    v.bediening.innerHTML = '<div role="tablist" class="tabs tabs-boxed mb-4 w-fit">' + tabKnop('voorgrond', 'Voorgrond') + tabKnop('achtergrond', 'Achtergrond') + '</div>'
      + (v.tab === 'achtergrond' ? achtergrond : voorgrond);
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * De vormen van het vak als knoppen boven het voorbeeld: een klik toont
   * meteen hoe het beeld in die vorm uitkomt. De gekozen vorm is ook die
   * van de PNG die bewaard wordt.
   */
  function tekenVormen() {
    var k = v.keuzes;
    v.vormen.hidden = Boolean(v.snijModus);
    v.vormen.innerHTML = '<span class="text-xs opacity-70">Vorm</span><div class="join">'
      + (v.gegevens.verhoudingen || []).map(function (x) {
        return '<button type="button" class="btn btn-xs join-item ' + (x.key === k.verhouding ? 'btn-primary' : 'btn-ghost border border-base-content/15') + '" data-oma="vorm" data-waarde="' + e(x.key) + '" title="' + e(x.label) + '">' + e(vormNaam(x.key)) + '</button>';
      }).join('') + '</div>'
      + '<span class="text-xs opacity-60 w-full text-center">Het beeld wordt in elke vorm bewaard; waar het gebruikt wordt, komt de vorm die past. De gekozen vorm is die van de kaart.</span>';
  }

  function vormNaam(key) { return key === '1:1' ? 'Vierkant' : key === '3:1' ? 'Hero' : key; }

  function bijgesneden(s) { return s.boven > 0 || s.onder > 0 || s.links > 0 || s.rechts > 0; }

  /**
   * Het bijsnijkader: het HELE beeld, met daarover het kader en zijn grepen.
   * Wat buiten het kader valt, wordt donker. Enkel in het voorbeeld.
   */
  var GREPEN = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function snijVlak(img) {
    var iw = img.naturalWidth || 1;
    var ih = img.naturalHeight || 1;
    return ih > iw ? { W: Math.round(BREEDTE * iw / ih), H: BREEDTE } : { W: BREEDTE, H: Math.round(BREEDTE * ih / iw) };
  }
  function snijRect(W, H) {
    var s = v.keuzes.voorgrond.snij;
    return { x0: s.links * W, y0: s.boven * H, x1: (1 - s.rechts) * W, y1: (1 - s.onder) * H };
  }
  function grepen(r) {
    var mx = (r.x0 + r.x1) / 2;
    var my = (r.y0 + r.y1) / 2;
    return { nw: [r.x0, r.y0], n: [mx, r.y0], ne: [r.x1, r.y0], e: [r.x1, my], se: [r.x1, r.y1], s: [mx, r.y1], sw: [r.x0, r.y1], w: [r.x0, my] };
  }
  function tekenSnij() {
    var img = v.beeld;
    if (!img) return;
    var vlak = snijVlak(img);
    var W = vlak.W;
    var H = vlak.H;
    if (v.canvas.width !== W || v.canvas.height !== H) { v.canvas.width = W; v.canvas.height = H; }
    var ctx = v.canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    var r = snijRect(W, H);
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.fillRect(0, 0, W, r.y0);
    ctx.fillRect(0, r.y1, W, H - r.y1);
    ctx.fillRect(0, r.y0, r.x0, r.y1 - r.y0);
    ctx.fillRect(r.x1, r.y0, W - r.x1, r.y1 - r.y0);
    var lijn = Math.max(2, W / 500);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = lijn / 2;
    for (var i = 1; i < 3; i++) {
      var x = r.x0 + (r.x1 - r.x0) * i / 3;
      var y = r.y0 + (r.y1 - r.y0) * i / 3;
      ctx.beginPath(); ctx.moveTo(x, r.y0); ctx.lineTo(x, r.y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r.x0, y); ctx.lineTo(r.x1, y); ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lijn;
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    var g = grepen(r);
    var d = Math.max(10, W / 90);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0369a1';
    GREPEN.forEach(function (k) {
      ctx.fillRect(g[k][0] - d / 2, g[k][1] - d / 2, d, d);
      ctx.strokeRect(g[k][0] - d / 2, g[k][1] - d / 2, d, d);
    });
    ctx.restore();
  }

  async function hertekenVoorbeeld() {
    if (v.snijModus) { v.teller++; tekenSnij(); return; }
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
    if (!v || nr !== v.teller) return; // intussen al een nieuwere tekening
    var ctx = v.canvas.getContext('2d');
    v.randen = teken(ctx, W, H, k, imgs);
    voorbeeldLijn(ctx, v.randen.kader, W);
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
    'vorm': function (w) { v.keuzes.verhouding = w; wijzig(true); },
    'tab': function (w) { v.tab = w; v.snijModus = false; wijzig(true); },
    'snij-aan': function () { if (v.beeld) { v.snijModus = true; wijzig(true); } },
    'snij-klaar': function () { v.snijModus = false; wijzig(true); },
    'kleur': function (w) { v.keuzes.kleur = w || ''; wijzig(true); },
    'swirl': function (w) {
      if (!w) { v.keuzes.swirl = null; wijzig(true); return; }
      var vorige = v.keuzes.swirl || v.laatsteSwirl || kopie(STANDAARD.swirl);
      v.keuzes.swirl = Object.assign({}, vorige, { naam: w });
      v.laatsteSwirl = v.keuzes.swirl;
      wijzig(true);
    },
    'swirl-kleur': function (w) { if (v.keuzes.swirl) { v.keuzes.swirl.kleur = w; wijzig(true); } },
    'anker': function (w) { if (ANKERS.indexOf(w) >= 0) { v.keuzes.voorgrond.anker = w; wijzig(true); } },
    'rand-weg': function () {
      if (!v.beeld) return;
      var r = null;
      try { r = legeRand(v.beeld); } catch (err) { meld('De rand kon niet gemeten worden.'); return; }
      if (!r) { meld('Het beeld lijkt helemaal leeg.'); return; }
      v.keuzes.voorgrond.snij = r;
      wijzig(true);
    },
    'snij-nul': function () { v.keuzes.voorgrond.snij = { boven: 0, onder: 0, links: 0, rechts: 0 }; wijzig(true); },
    'annuleer': function () { sluit(); },
    'bewaar': bewaar,
  };

  var schuiven = {
    'swirl-schaal': function (n) { v.keuzes.swirl.schaal = n; },
    'swirl-draai': function (n) { v.keuzes.swirl.draai = n; },
    'swirl-x': function (n) { v.keuzes.swirl.x = n; },
    'swirl-y': function (n) { v.keuzes.swirl.y = n; },
    'swirl-dekking': function (n) { v.keuzes.swirl.dekking = Math.round((1.05 - n) * 100) / 100; },
    'vg-schaal': function (n) { v.keuzes.voorgrond.schaal = n; },
    'vg-marge': function (n) { v.keuzes.voorgrond.marge = n; },
  };
  var toonWaarde = { 'vg-schaal': procent, 'vg-marge': procent };

  async function bewaar() {
    var knop = v.dlg.querySelector('[data-oma="bewaar"]');
    knop.disabled = true;
    knop.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Bezig…';
    meld('');
    try {
      var varianten = await alleVormen(v.keuzes, v.imgs || {}, v.gegevens.verhoudingen);
      var keuzes = kopie(v.keuzes);
      keuzes.bron = v.bron;
      await v.opBewaar(keuzes, varianten);
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

  function pngVan(k, imgs, W) {
    var H = Math.round(W * verhouding(k.verhouding));
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    teken(c.getContext('2d'), W, H, k, imgs);
    return new Promise(function (ok, nok) {
      try {
        c.toBlob(function (b) { if (b) ok(b); else nok(new Error('Het beeld kon niet gemaakt worden.')); }, 'image/png');
      } catch (err) { nok(err); }
    });
  }

  async function tekenPng(k, imgs) {
    var blob = await pngVan(k, imgs, VARIANT_BREEDTE);
    if (blob.size > MAX_BYTES) blob = await pngVan(k, imgs, 900);
    if (blob.size > MAX_BYTES) throw new Error('Het beeld wordt te groot. Kies een kleiner beeld.');
    return blob;
  }

  /** Dezelfde opmaak in elke vorm: { '16:9': Blob, '1:1': Blob, ... }. */
  async function alleVormen(k, imgs, verhoudingen) {
    var uit = {};
    var lijst = (verhoudingen || []).map(function (x) { return x.key; });
    if (lijst.indexOf(k.verhouding) < 0) lijst.push(k.verhouding);
    for (var i = 0; i < lijst.length; i++) {
      uit[lijst[i]] = await tekenPng(Object.assign({}, k, { verhouding: lijst[i] }), imgs);
    }
    return uit;
  }

  /**
   * Hoe doorzichtig is het beeld op dit punt (0-255)? Een componentje is
   * meestal grotendeels doorzichtig: wie daar klikt, bedoelt de swirl erachter.
   * Lukt het lezen niet, dan telt het hele kader als beeld.
   */
  var alfa = null; // { img, ctx }
  function alfaOp(img, x, y) {
    try {
      if (!alfa || alfa.img !== img) {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        var cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        alfa = { img: img, ctx: cx };
      }
      return alfa.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3];
    } catch (err) { return 255; }
  }

  /**
   * Waar het beeld naartoe springt als je het loslaat: het anker volgt uit
   * het derde van het vak waarin het midden ligt, de marge uit de afstand tot
   * de rand(en) van dat anker.
   */
  function ankerUitPlaats(kader, W, H) {
    var cx = kader.x + kader.w / 2;
    var cy = kader.y + kader.h / 2;
    var h = cx < W / 3 ? 'links' : cx > W * 2 / 3 ? 'rechts' : '';
    var vv = cy < H / 3 ? 'boven' : cy > H * 2 / 3 ? 'onder' : '';
    var afstanden = [];
    if (h === 'links') afstanden.push(kader.x);
    if (h === 'rechts') afstanden.push(W - kader.x - kader.w);
    if (vv === 'boven') afstanden.push(kader.y);
    if (vv === 'onder') afstanden.push(H - kader.y - kader.h);
    var m = afstanden.length ? Math.min.apply(null, afstanden) : 0;
    return { anker: (h + vv) || 'midden', marge: klem(Math.round(m / Math.min(W, H) * 200) / 200, 0, 0.3) };
  }

  // Slepen in het voorbeeld: eerst het beeld (dat ligt bovenaan, maar enkel
  // waar het niet doorzichtig is), dan de swirl.
  function koppelSlepen() {
    var c = v.canvas;
    var sleep = null;
    function punt(ev) {
      var r = c.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height };
    }
    function binnen(p, rd) { return rd && p.x >= rd.x && p.x <= rd.x + rd.w && p.y >= rd.y && p.y <= rd.y + rd.h; }
    function opBeeld(p) {
      var rd = v.randen || {};
      var img = v.imgs && v.imgs.beeld;
      if (!binnen(p, rd.kader) || !img) return false;
      return alfaOp(img, (p.x - rd.beeld.x) / rd.beeld.w * img.naturalWidth, (p.y - rd.beeld.y) / rd.beeld.h * img.naturalHeight) > 16;
    }
    function laagOp(p) {
      var randen = v.randen || {};
      if (opBeeld(p)) return 'beeld';
      if (v.keuzes.swirl && binnen(p, randen.swirl)) return 'swirl';
      return binnen(p, randen.kader) ? 'beeld' : null;
    }
    // ── Bijsnijden: grepen en kader ──
    var snij = null;
    function tolerantie() { return 14 * c.width / (c.getBoundingClientRect().width || c.width); }
    function snijGreep(p) {
      var r = snijRect(c.width, c.height);
      var g = grepen(r);
      var t = tolerantie();
      for (var i = 0; i < GREPEN.length; i++) {
        var k = GREPEN[i];
        if (Math.abs(p.x - g[k][0]) <= t && Math.abs(p.y - g[k][1]) <= t) return k;
      }
      var inY = p.y >= r.y0 - t && p.y <= r.y1 + t;
      var inX = p.x >= r.x0 - t && p.x <= r.x1 + t;
      if (inY && Math.abs(p.x - r.x0) <= t) return 'w';
      if (inY && Math.abs(p.x - r.x1) <= t) return 'e';
      if (inX && Math.abs(p.y - r.y0) <= t) return 'n';
      if (inX && Math.abs(p.y - r.y1) <= t) return 's';
      if (p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1) return 'move';
      return null;
    }
    var CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };
    function snijSleep(p) {
      var MIN = 0.03;
      var s0 = snij.start;
      var dx = (p.x - snij.p.x) / c.width;
      var dy = (p.y - snij.p.y) / c.height;
      var l = s0.links;
      var t = s0.boven;
      var r = 1 - s0.rechts;
      var b = 1 - s0.onder;
      if (snij.greep === 'move') {
        var bw = r - l;
        var bh = b - t;
        l = klem(l + dx, 0, 1 - bw);
        t = klem(t + dy, 0, 1 - bh);
        r = l + bw;
        b = t + bh;
      } else {
        if (/w/.test(snij.greep)) l = klem(l + dx, 0, r - MIN);
        if (/e/.test(snij.greep)) r = klem(r + dx, l + MIN, 1);
        if (/n/.test(snij.greep)) t = klem(t + dy, 0, b - MIN);
        if (/s/.test(snij.greep)) b = klem(b + dy, t + MIN, 1);
      }
      var rond = function (n) { return Math.round(n * 10000) / 10000; };
      v.keuzes.voorgrond.snij = { links: rond(l), boven: rond(t), rechts: rond(1 - r), onder: rond(1 - b) };
      tekenSnij();
    }

    c.addEventListener('pointerdown', function (ev) {
      var p = punt(ev);
      if (v.snijModus) {
        var greep = snijGreep(p);
        if (!greep) return;
        snij = { greep: greep, p: p, start: Object.assign({}, v.keuzes.voorgrond.snij) };
        c.setPointerCapture(ev.pointerId);
        return;
      }
      var laag = laagOp(p);
      if (!laag) return;
      sleep = laag === 'swirl'
        ? { laag: laag, p: p, x: v.keuzes.swirl.x, y: v.keuzes.swirl.y }
        : { laag: laag, p: p, kader: Object.assign({}, v.randen.kader) };
      c.setPointerCapture(ev.pointerId);
      c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', function (ev) {
      var p = punt(ev);
      if (v.snijModus) {
        if (snij) snijSleep(p);
        else c.style.cursor = CURSOR[snijGreep(p)] || 'default';
        return;
      }
      if (!sleep) {
        c.style.cursor = laagOp(p) ? 'grab' : 'default';
        return;
      }
      var dx = p.x - sleep.p.x;
      var dy = p.y - sleep.p.y;
      if (sleep.laag === 'swirl') {
        var s = v.keuzes.swirl;
        s.x = klem(sleep.x + dx / c.width, -0.5, 1.5);
        s.y = klem(sleep.y + dy / c.height, -0.5, 1.5);
        var sx = v.bediening.querySelector('[data-oma-schuif="swirl-x"]');
        var sy = v.bediening.querySelector('[data-oma-schuif="swirl-y"]');
        if (sx) sx.value = s.x;
        if (sy) sy.value = s.y;
      } else {
        var kader = { x: sleep.kader.x + dx, y: sleep.kader.y + dy, w: sleep.kader.w, h: sleep.kader.h };
        var a = ankerUitPlaats(kader, c.width, c.height);
        if (a.anker === v.keuzes.voorgrond.anker && a.marge === v.keuzes.voorgrond.marge) return;
        v.keuzes.voorgrond.anker = a.anker;
        v.keuzes.voorgrond.marge = a.marge;
        sleep.bediening = true;
      }
      hertekenVoorbeeld();
    });
    function los() {
      snij = null;
      if (sleep && sleep.bediening) tekenBediening();
      sleep = null;
      c.style.cursor = 'default';
    }
    c.addEventListener('pointerup', los);
    c.addEventListener('pointercancel', los);
  }

  async function maakVoorbeeldjes() {
    await Promise.all(v.gegevens.swirls.map(async function (s) {
      try { v.voorbeeldjes[s.naam] = kleurOm(await haalSvg(s.pad), '#4B5563'); } catch (err) { /* dan enkel de naam */ }
    }));
    if (v) tekenBediening();
  }

  /** Bewaarde keuzes (versie 1 of 2) naar de vorm van het venster. */
  function ankerVan(x, y) {
    var h = x < 0.4 ? 'links' : x > 0.6 ? 'rechts' : '';
    var vv = y < 0.4 ? 'boven' : y > 0.6 ? 'onder' : '';
    return (h + vv) || 'midden';
  }
  function begin(waarde, swirls) {
    var k = kopie(STANDAARD);
    if (waarde) {
      k.verhouding = waarde.verhouding || k.verhouding;
      k.kleur = waarde.kleur || '';
      k.swirl = waarde.swirl ? Object.assign(kopie(STANDAARD.swirl), waarde.swirl) : null;
      if (waarde.voorgrond) {
        k.voorgrond = Object.assign(k.voorgrond, waarde.voorgrond);
        k.voorgrond.snij = Object.assign({ boven: 0, onder: 0, links: 0, rechts: 0 }, waarde.voorgrond.snij || {});
        // De eerste versie kende "lege ruimte erbij" (een negatieve snede):
        // die duwde het beeld weg van zijn anker. Nu is een snede altijd >= 0.
        ['boven', 'onder', 'links', 'rechts'].forEach(function (z) { k.voorgrond.snij[z] = klem(Number(k.voorgrond.snij[z]) || 0, 0, 0.97); });
        if (k.voorgrond.snij.links + k.voorgrond.snij.rechts > 0.97) { k.voorgrond.snij.links = 0; k.voorgrond.snij.rechts = 0; }
        if (k.voorgrond.snij.boven + k.voorgrond.snij.onder > 0.97) { k.voorgrond.snij.boven = 0; k.voorgrond.snij.onder = 0; }
        k.voorgrond.schaal = klem(Number(k.voorgrond.schaal) || 0.8, 0.1, 1);
      } else if (waarde.beeld) {
        var b = waarde.beeld;
        k.voorgrond.anker = ankerVan(b.x == null ? 0.5 : b.x, b.y == null ? 0.5 : b.y);
        if (b.schaal) k.voorgrond.schaal = b.schaal;
      }
    } else if (swirls) {
      k.swirl.naam = swirls.length ? swirls[0].naam : '';
      if (!k.swirl.naam) k.swirl = null;
    }
    // Een bewaarde swirl die intussen uit de map verdween: geen swirl.
    if (k.swirl && swirls && !swirls.some(function (s) { return s.naam === k.swirl.naam; })) k.swirl = null;
    return k;
  }

  async function nieuwBeeld(bestand) {
    if (!v || !v.oplaad || !bestand) return;
    meld('');
    var label = v.bediening.querySelector('[data-oma-bestand]');
    if (label && label.parentNode) label.parentNode.classList.add('btn-disabled');
    try {
      var url = await v.oplaad(bestand);
      var img = await laadBeeld(eigenAdres(url));
      if (!v) return;
      v.bron = url;
      v.beeld = img;
      // Een ander beeld heeft een andere rand: niets bijsnijden.
      v.keuzes.voorgrond.snij = { boven: 0, onder: 0, links: 0, rechts: 0 };
      wijzig(true);
    } catch (err) {
      meld(err.message || 'Opladen mislukt.');
      tekenBediening();
    }
  }

  async function open(o) {
    sluit();
    var dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = '<div class="modal-box max-w-6xl w-11/12 p-0 overflow-hidden">'
      + '<div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-base-content/10">'
      + '<h3 class="font-bold text-lg">' + e(o.titel || 'Beeld opmaken') + '</h3>'
      + '<button type="button" class="btn btn-sm btn-ghost btn-circle" data-oma="annuleer" aria-label="Sluiten">✕</button></div>'
      + '<div class="grid lg:grid-cols-[minmax(0,1fr)_340px]">'
      + '<div class="p-5 bg-base-200/60 flex flex-col items-center justify-center gap-3 min-h-[320px]">'
      + '<div class="flex flex-wrap items-center justify-center gap-2" data-oma-vormen></div>'
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
      vormen: dlg.querySelector('[data-oma-vormen]'),
      bediening: dlg.querySelector('[data-oma-bediening]'),
      melding: dlg.querySelector('[data-oma-melding]'),
      gegevens: o.gegevens || { palet: [], verhoudingen: [], swirls: [] },
      opBewaar: o.opBewaar,
      oplaad: o.oplaad || null,
      bron: o.beeld,
      tab: 'voorgrond',
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

    // EEN listener per soort gebeurtenis voor het hele venster (REGEL 3).
    dlg.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-oma]');
      if (!el || !v) return;
      var fn = acties[el.getAttribute('data-oma')];
      if (fn) fn(el.getAttribute('data-waarde'));
    });
    dlg.addEventListener('input', function (ev) {
      var el = ev.target.closest('[data-oma-schuif]');
      if (!el || !v) return;
      var naam = el.getAttribute('data-oma-schuif');
      var fn = schuiven[naam];
      if (!fn) return;
      fn(Number(el.value));
      var toon = v.bediening.querySelector('[data-oma-waarde="' + naam + '"]');
      if (toon && toonWaarde[naam]) {
        toon.textContent = toonWaarde[naam](Number(el.value));
      }
      hertekenVoorbeeld();
    });
    dlg.addEventListener('change', function (ev) {
      if (!v) return;
      var bestand = ev.target.closest('[data-oma-bestand]');
      if (bestand) nieuwBeeld(bestand.files && bestand.files[0]);
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

  /**
   * Zonder venster: de PNG van bewaarde keuzes met hun `bron`. Voor als de
   * voorgrond wisselt en de opmaak moet blijven.
   */
  async function voorbereid(keuzes, gegevens) {
    var k = begin(keuzes, null);
    k.swirl = keuzes.swirl ? Object.assign(kopie(STANDAARD.swirl), keuzes.swirl) : null;
    var imgs = { beeld: await laadBeeld(eigenAdres(keuzes.bron)), swirl: null };
    var swirls = (gegevens && gegevens.swirls) || [];
    var swirl = k.swirl ? swirls.filter(function (x) { return x.naam === k.swirl.naam; })[0] : null;
    if (swirl) imgs.swirl = await swirlBeeld(swirl, k.swirl.kleur);
    return { k: k, imgs: imgs };
  }
  async function maakPng(keuzes, gegevens) {
    var x = await voorbereid(keuzes, gegevens);
    return tekenPng(x.k, x.imgs);
  }
  async function maakAlles(keuzes, gegevens) {
    var x = await voorbereid(keuzes, gegevens);
    return alleVormen(x.k, x.imgs, gegevens && gegevens.verhoudingen);
  }

  window.OMAchtergrond = { open: open, sluit: sluit, maakPng: maakPng, maakAlles: maakAlles, vormNaam: vormNaam };
})();
