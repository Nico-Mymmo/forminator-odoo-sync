/**
 * Nieuwsbrieven -- een beeld mailklaar maken: kleiner en lichter, zonder dat
 * een GIF stilvalt. Elk beeld dat in een nieuwsbrief komt (opladen of uit
 * Assetbeheer kiezen) gaat hierdoor voor het naar /api/upload gaat.
 *
 *   Foto (PNG, JPEG, WebP, ...): hoogstens MAX_BREEDTE breed (2x de breedste
 *     plek in de mail, scherp op een gsm), JPEG -- of PNG als er
 *     doorzichtigheid in zit (een logo of uitgeknipt beeld). Is het origineel
 *     al klein genoeg, dan blijft het origineel.
 *   GIF: met gifsicle (WebAssembly, in de browser): -O3, hoogstens GIF_BREEDTE
 *     breed, en steeds iets meer "lossy" tot hij onder DOEL_BYTES zit. Een
 *     bewegende GIF blijft bewegen; enkel 1x breed, want 2x maakt hem vier
 *     keer zo zwaar en een mail met een GIF van 5 MB laadt traag.
 *
 * Bijsnijden van een GIF ("kader vullen") kan een canvas niet zonder de
 * animatie te verliezen; NB.gifSnij doet het met gifsicle (--crop).
 *
 * gifsicle wordt pas geladen bij de eerste GIF (~340 kB).
 */
(function () {
  'use strict';
  var NB = window.NB;

  var GIFSICLE = 'https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.16/dist/gifsicle.min.js';
  var MAX_BREEDTE = 1200;
  var GIF_BREEDTE = 600;
  var DOEL_BYTES = 1.5 * 1024 * 1024;
  var MAX_BYTES = 3 * 1024 * 1024; // = MAX_BEELD op de server

  var laden = null;
  function gifsicle() {
    if (!laden) laden = import(GIFSICLE).then(function (m) { return m.default; }).catch(function (err) { laden = null; throw err; });
    return laden;
  }

  async function draai(blob, opdracht) {
    var g = await gifsicle();
    var uit = await g.run({ input: [{ file: blob, name: 'in.gif' }], command: [opdracht + ' in.gif -o /out/uit.gif'] });
    if (!uit || !uit[0]) throw new Error('De GIF kon niet verwerkt worden.');
    return new Blob([await uit[0].arrayBuffer()], { type: 'image/gif' });
  }

  function isGif(blob) { return blob && blob.type === 'image/gif'; }

  /** Van licht naar zwaar comprimeren; de eerste die onder DOEL_BYTES zit, wint. */
  var GIF_STAPPEN = [
    { lossy: 60, breedte: GIF_BREEDTE },
    { lossy: 100, kleuren: 192, breedte: GIF_BREEDTE },
    { lossy: 150, kleuren: 128, breedte: GIF_BREEDTE },
    { lossy: 200, kleuren: 96, breedte: 480 },
  ];

  async function gifKlaar(blob, crop) {
    if (!crop && blob.size <= DOEL_BYTES) {
      var maat = await createImageBitmap(blob);
      if (maat.width <= GIF_BREEDTE) return blob;
    }
    var beste = null;
    for (var i = 0; i < GIF_STAPPEN.length; i++) {
      var s = GIF_STAPPEN[i];
      var opdracht = (crop ? '--crop ' + crop + ' ' : '') + '-O3 --resize-fit-width ' + s.breedte + ' --lossy=' + s.lossy + (s.kleuren ? ' --colors ' + s.kleuren : '');
      var uit = await draai(blob, opdracht);
      if (!beste || uit.size < beste.size) beste = uit;
      if (uit.size <= DOEL_BYTES) break;
    }
    if (!crop && blob.size < beste.size) beste = blob;
    if (beste.size > MAX_BYTES) throw new Error('Deze GIF blijft ook na comprimeren groter dan 3 MB. Maak hem korter of kleiner.');
    return beste;
  }

  function heeftDoorzichtigheid(ctx, w, h) {
    var d = ctx.getImageData(0, 0, w, h).data;
    for (var i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true;
    return false;
  }

  function naarBlob(c, type, kwaliteit) {
    return new Promise(function (ok, nok) { c.toBlob(function (b) { b ? ok(b) : nok(new Error('Beeld omzetten mislukt')); }, type, kwaliteit); });
  }

  async function fotoKlaar(blob) {
    var bron;
    try { bron = await createImageBitmap(blob); } catch (e) { throw new Error('Dit beeld kan niet gelezen worden.'); }
    var schaal = Math.min(1, MAX_BREEDTE / bron.width);
    var w = Math.max(1, Math.round(bron.width * schaal));
    var h = Math.max(1, Math.round(bron.height * schaal));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bron, 0, 0, w, h);
    var uit;
    if (blob.type !== 'image/jpeg' && heeftDoorzichtigheid(ctx, w, h)) {
      uit = await naarBlob(c, 'image/png');
    } else {
      var kwaliteiten = [0.85, 0.75, 0.65];
      for (var i = 0; i < kwaliteiten.length; i++) {
        uit = await naarBlob(c, 'image/jpeg', kwaliteiten[i]);
        if (uit.size <= DOEL_BYTES) break;
      }
    }
    var origineelBruikbaar = (blob.type === 'image/png' || blob.type === 'image/jpeg') && schaal === 1;
    if (origineelBruikbaar && blob.size <= uit.size) uit = blob;
    if (uit.size > MAX_BYTES) throw new Error('Dit beeld blijft ook na comprimeren groter dan 3 MB.');
    return uit;
  }

  /** Elk beeld (bestand of blob) mailklaar: kleiner, lichter, GIF blijft bewegen. */
  NB.mailbeeld = function (blob) {
    return isGif(blob) ? gifKlaar(blob) : fotoKlaar(blob);
  };

  /** Een GIF bijsnijden tot { x, y, w, h } (pixels van het origineel), bewegend en gecomprimeerd. */
  NB.gifSnij = function (blob, r) {
    var crop = Math.round(r.x) + ',' + Math.round(r.y) + '+' + Math.round(r.w) + 'x' + Math.round(r.h);
    return gifKlaar(blob, crop);
  };

  NB.isGifUrl = function (adres) { return /\.gif(\?|#|$)/i.test(String(adres || '')); };
})();
