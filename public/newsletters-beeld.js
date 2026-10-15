/**
 * Nieuwsbrieven -- het beeldvenster. EEN venster voor elk beeld in een
 * nieuwsbrief (woordje vooraf, tekst en foto, video, link), naar het voorbeeld
 * van de gangbare editors (WordPress, Mailchimp, Squarespace):
 *
 *   1. Welk beeld: een foto opladen of een tekening kiezen.
 *   2. Waar: pictogrammen -- naast de tekst (rechts/links), als tweede kolom
 *      over het hele blok (rechts/links), of tussen de alinea's.
 *   3. Hoe: het kader VULLEN (bijsnijden) of het beeld HEEL tonen.
 *   4. Bij vullen: klik op wat zeker in beeld moet blijven (het focuspunt);
 *      ernaast zie je meteen de uitsnede.
 *
 * Een mailprogramma kan zelf niet bijsnijden (geen object-fit in Gmail en
 * Outlook). Daarom maakt dit venster bij "vullen" een eigen, bijgesneden kopie
 * (canvas -> JPEG -> /api/upload), en die gaat in de mail. Het origineel blijft
 * bewaard, zodat je later een ander focuspunt of een andere plek kan kiezen.
 *
 * De kaders (breedte en verhouding per plek) komen van de server
 * (BEELD_KADERS in lib/constants.js, via /api/bootstrap): dezelfde getallen als
 * de renderer, dus de uitsnede past altijd.
 *
 * Gebruik: NB.beeld.open({ beeld, plaatsen, vast, opslaan(beeldOfNull) })
 *   beeld     het huidige beeld of null
 *   plaatsen  true = de plek kiezen (woordje vooraf, tekst en foto)
 *   vast      bij een vaste plek: 'video' of 'link'
 *   opslaan   krijgt het nieuwe beeld, of null als het weg moet
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  var PLAATSEN = [
    { key: 'rechts', label: 'Naast de alinea, rechts' },
    { key: 'links', label: 'Naast de alinea, links' },
    { key: 'kolom-rechts', label: 'Halve blok, rechts' },
    { key: 'kolom-links', label: 'Halve blok, links' },
    { key: 'tekst', label: 'Tussen de tekst' },
    { key: 'hoek-rechts', label: 'Rechtsboven in de hoek' },
  ];

  /** De grootte van een tekening (TEKENING_MATEN op de server, via /api/bootstrap). */
  var MATEN = [
    { key: 'klein', label: 'Klein' },
    { key: 'middel', label: 'Middel' },
    { key: 'groot', label: 'Groot' },
  ];

  function maatPx(b) {
    var m = (NB.state.boot && NB.state.boot.tekening_maten) || { klein: 110, middel: 170, groot: 240 };
    return m[(b && b.maat) || 'middel'] || m.middel;
  }

  var st = null; // { beeld, opties, stap }

  /** Een beeld van vroeger (enkel een URL of tekening) als beeld-object. */
  NB.beeldVan = function (c, fotoVeld, plaats) {
    c = c || {};
    if (c.beeld && (c.beeld.url || c.beeld.thingie)) return c.beeld;
    if (c.thingie) return { thingie: c.thingie, plaats: 'rechts', vulling: 'heel' };
    if (c[fotoVeld || 'image_url']) return { url: c[fotoVeld || 'image_url'], plaats: plaats || 'rechts', vulling: 'heel' };
    return null;
  };

  function kader(b) {
    var k = (NB.state.boot && NB.state.boot.beeld_kaders) || {};
    var sleutel = st.opties.vast || (b && b.plaats) || 'rechts';
    return k[sleutel] || { breedte: 560, verhouding: 16 / 9 };
  }

  function tekening(naam) {
    return (NB.state.tekeningen || []).find(function (t) { return t.name === naam; }) || null;
  }

  function bronUrl(b) {
    if (!b) return '';
    if (b.thingie) { var t = tekening(b.thingie); return t ? t.svg : ''; }
    return b.url || '';
  }

  /** Het pictogram van een plek: grijze lijnen = tekst, groen = het beeld. */
  function pictogram(plaats) {
    var lijnen = function (x, w) {
      return '<rect x="' + x + '" y="9" width="' + (w * 0.7) + '" height="4" rx="2" fill="currentColor" opacity=".55"/>'
        + [17, 23, 29, 35].map(function (y) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join('');
    };
    var beeld = function (x, y, w, h) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="#2dd4bf"/>'; };
    var vak = '<rect x=".5" y=".5" width="63" height="43" rx="4" fill="none" stroke="currentColor" opacity=".25"/>';
    var inhoud = {
      rechts: '<rect x="6" y="5" width="36" height="4" rx="2" fill="currentColor" opacity=".55"/>' + beeld(42, 12, 16, 16)
        + [13, 18, 23].map(function (y) { return '<rect x="6" y="' + y + '" width="32" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join('')
        + [31, 36].map(function (y) { return '<rect x="6" y="' + y + '" width="52" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join(''),
      links: '<rect x="6" y="5" width="36" height="4" rx="2" fill="currentColor" opacity=".55"/>' + beeld(6, 12, 16, 16)
        + [13, 18, 23].map(function (y) { return '<rect x="26" y="' + y + '" width="32" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join('')
        + [31, 36].map(function (y) { return '<rect x="6" y="' + y + '" width="52" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join(''),
      'kolom-rechts': lijnen(6, 26) + beeld(38, 1, 25, 42),
      'kolom-links': beeld(1, 1, 25, 42) + lijnen(32, 26),
      tekst: '<rect x="6" y="5" width="36" height="4" rx="2" fill="currentColor" opacity=".55"/><rect x="6" y="12" width="52" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>' + beeld(6, 17, 52, 17) + '<rect x="6" y="37" width="52" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>',
      'hoek-rechts': beeld(42, 4, 18, 18) + '<rect x="6" y="8" width="30" height="4" rx="2" fill="currentColor" opacity=".55"/>'
        + [16, 21].map(function (y) { return '<rect x="6" y="' + y + '" width="32" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join('')
        + [27, 32, 37].map(function (y) { return '<rect x="6" y="' + y + '" width="52" height="2.5" rx="1.2" fill="currentColor" opacity=".3"/>'; }).join(''),
    }[plaats];
    return '<svg viewBox="0 0 64 44" width="64" height="44" aria-hidden="true">' + vak + inhoud + '</svg>';
  }

  function vullingPictogram(vullen) {
    return '<svg viewBox="0 0 64 44" width="64" height="44" aria-hidden="true"><rect x=".5" y=".5" width="63" height="43" rx="4" fill="none" stroke="currentColor" opacity=".35"/>'
      + (vullen
        ? '<rect x="2" y="2" width="60" height="40" rx="3" fill="#2dd4bf"/><circle cx="32" cy="22" r="7" fill="#fff" opacity=".85"/>'
        : '<rect x="18" y="4" width="28" height="36" rx="2" fill="#2dd4bf"/><circle cx="32" cy="22" r="5" fill="#fff" opacity=".85"/>')
      + '</svg>';
  }

  function keuzeKnop(actie, waarde, actief, svg, label) {
    return '<button type="button" class="flex flex-col items-center gap-1 rounded-xl border p-2 text-xs leading-tight text-center '
      + (actief ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-base-content/10 hover:border-primary/50') + '" data-action="' + actie + '" data-waarde="' + waarde + '">'
      + svg + '<span>' + e(label) + '</span></button>';
  }

  // ─── De twee stappen ──────────────────────────────────────────────────────

  function stapBron() {
    var lijst = NB.state.tekeningen || [];
    var gekozen = st.beeld && st.beeld.thingie;
    return '<h3 class="font-bold text-lg mb-1">Beeld kiezen</h3>'
      + '<p class="text-sm opacity-70 mb-4">Laad een foto op, of kies een van onze tekeningen.</p>'
      + '<label class="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 p-6 cursor-pointer mb-5 text-primary font-semibold">'
      + '<i data-lucide="upload" class="w-5 h-5"></i> Foto opladen<input type="file" accept="image/*" class="hidden" data-change="beeld-dlg-foto"></label>'
      + (lijst.length
        ? '<div class="text-sm font-semibold mb-2">Of een tekening</div><div class="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[45vh] overflow-y-auto pr-1">'
          + (st.opties.vast ? '' : '') + lijst.map(function (t) {
            return '<button type="button" class="rounded-xl border p-2 hover:border-primary ' + (t.name === gekozen ? 'border-primary bg-primary/10' : 'border-base-content/10') + '" data-action="beeld-dlg-tekening" data-naam="' + e(t.name) + '" title="' + e(t.label) + '"><img src="' + e(t.svg) + '" alt="' + e(t.label) + '" class="w-full aspect-square object-contain"></button>';
          }).join('') + '</div>'
        : '')
      + '<div class="modal-action">' + (st.beeld ? '<button class="btn btn-ghost btn-sm mr-auto" data-action="beeld-dlg-terug">Terug</button>' : '')
      + '<button class="btn btn-ghost btn-sm" data-action="sluit-dialoog" data-dialoog="dlgBeeld">Annuleren</button></div>';
  }

  /** Bij welke alinea: tussen de tekst = "na alinea n", naast = "naast alinea n+1". */
  function alineaKiezer(b) {
    var n = b.na_alinea || 0;
    var naast = b.plaats !== 'tekst';
    var getal = naast ? n + 1 : n;
    var uitleg = naast ? 'de tekst loopt rond het beeld' : (n === 0 ? 'boven de tekst' : 'tussen de alinea\'s');
    return '<div class="flex flex-wrap items-center gap-2 mt-2 text-sm"><span>' + (naast ? 'Naast alinea' : 'Na alinea') + '</span>'
      + '<div class="join"><button class="btn btn-xs join-item" data-action="beeld-dlg-alinea" data-waarde="-1" aria-label="Eerder"' + (n <= 0 ? ' disabled' : '') + '>−</button>'
      + '<span class="join-item px-3 flex items-center bg-base-200 font-semibold">' + getal + '</span>'
      + '<button class="btn btn-xs join-item" data-action="beeld-dlg-alinea" data-waarde="1" aria-label="Later">+</button></div>'
      + '<span class="opacity-60 text-xs">' + uitleg + '</span></div>';
  }

  function stapOpmaak() {
    var b = st.beeld;
    var foto = !b.thingie;
    var vullen = foto && b.vulling === 'vullen';
    var k = kader(b);
    var src = bronUrl(b);
    var fx = Math.round((b.focus ? b.focus.x : 0.5) * 100);
    var fy = Math.round((b.focus ? b.focus.y : 0.5) * 100);

    var links = '<div class="flex flex-col gap-3 min-w-0">'
      + (vullen
        ? '<div class="text-sm font-semibold">Klik op wat zeker in beeld moet blijven</div>'
          + '<div id="bdFocus" class="relative rounded-xl overflow-hidden bg-base-200 cursor-crosshair select-none touch-none">'
          + '<img src="' + e(src) + '" alt="" class="block w-full max-h-[46vh] object-contain pointer-events-none" draggable="false">'
          + '<span id="bdPunt" class="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(2,132,199,.9),0_2px_8px_rgba(0,0,0,.35)] bg-sky-500/40 pointer-events-none" style="left:' + fx + '%;top:' + fy + '%"></span></div>'
        : '<div class="rounded-xl bg-base-200 p-3 flex items-center justify-center"><img src="' + e(src) + '" alt="" class="block max-w-full max-h-[46vh] object-contain"></div>')
      + '</div>';

    var voorbeeld = '<div><div class="text-sm font-semibold mb-1.5">Zo komt het in de mail</div>'
      + '<div class="rounded-lg overflow-hidden bg-base-200 mx-auto" style="width:' + Math.min(260, foto ? k.breedte : maatPx(b)) + 'px;' + (vullen ? 'aspect-ratio:' + k.verhouding : '') + '">'
      + '<img id="bdVoorbeeld" src="' + e(src) + '" alt="" class="block w-full ' + (vullen ? 'h-full object-cover' : 'h-auto') + '" style="object-position:' + fx + '% ' + fy + '%"></div></div>';

    var plaats = st.opties.plaatsen
      ? '<div><div class="text-sm font-semibold mb-1.5">Waar</div><div class="grid grid-cols-3 gap-2">'
        + PLAATSEN.map(function (p) { return keuzeKnop('beeld-dlg-plaats', p.key, b.plaats === p.key, pictogram(p.key), p.label); }).join('')
        + '</div>'
        + (['tekst', 'rechts', 'links'].indexOf(b.plaats) >= 0 ? alineaKiezer(b) : '')
        + '</div>'
      : '';

    var vulling = foto
      ? '<div><div class="text-sm font-semibold mb-1.5">Hoe</div><div class="grid grid-cols-2 gap-2">'
        + keuzeKnop('beeld-dlg-vulling', 'vullen', vullen, vullingPictogram(true), 'Kader vullen')
        + keuzeKnop('beeld-dlg-vulling', 'heel', !vullen, vullingPictogram(false), 'Heel tonen')
        + '</div><p class="text-xs opacity-60 mt-1.5">' + (vullen ? 'Het beeld wordt bijgesneden tot het kader vol is.' : 'Het hele beeld, zonder bijsnijden.') + '</p></div>'
      : '<div><div class="text-sm font-semibold mb-1.5">Grootte</div><div class="join">'
        + MATEN.map(function (m) { return '<button type="button" class="btn btn-sm join-item' + ((b.maat || 'middel') === m.key ? ' btn-primary' : '') + '" data-action="beeld-dlg-maat" data-waarde="' + m.key + '">' + e(m.label) + '</button>'; }).join('')
        + '</div><p class="text-xs opacity-60 mt-1.5">Onze tekeningen zijn herkenbare iconen: zet ze gerust groot. Ze worden nooit bijgesneden.</p></div>';

    return '<h3 class="font-bold text-lg mb-4">Beeld</h3>'
      + '<div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">'
      + links
      + '<div class="flex flex-col gap-4">' + plaats + vulling + voorbeeld + '</div>'
      + '</div>'
      + '<div class="modal-action flex-wrap">'
      + '<button class="btn btn-ghost btn-sm" data-action="beeld-dlg-ander"><i data-lucide="replace" class="w-4 h-4"></i> Ander beeld</button>'
      + '<button class="btn btn-ghost btn-sm text-error mr-auto" data-action="beeld-dlg-weg"><i data-lucide="trash-2" class="w-4 h-4"></i> Weghalen</button>'
      + '<button class="btn btn-ghost btn-sm" data-action="sluit-dialoog" data-dialoog="dlgBeeld">Annuleren</button>'
      + '<button class="btn btn-primary btn-sm" data-action="beeld-dlg-klaar">Klaar</button></div>';
  }

  function teken() {
    var bak = document.getElementById('dlgBeeldInhoud');
    bak.innerHTML = st.stap === 'bron' ? stapBron() : stapOpmaak();
    NB.ikons();
    var vlak = document.getElementById('bdFocus');
    if (vlak) koppelFocus(vlak);
  }

  /** Klikken of slepen op de foto zet het focuspunt; de uitsnede volgt meteen. */
  function koppelFocus(vlak) {
    var neer = false;
    var zet = function (ev) {
      var img = vlak.querySelector('img');
      var r = img.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      var y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      st.beeld.focus = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
      var px = (x * 100).toFixed(1) + '%';
      var py = (y * 100).toFixed(1) + '%';
      var punt = document.getElementById('bdPunt');
      // Het punt staat op het beeld, dat binnen het vlak gecentreerd kan zijn.
      var v = vlak.getBoundingClientRect();
      punt.style.left = (r.left - v.left + x * r.width) + 'px';
      punt.style.top = (r.top - v.top + y * r.height) + 'px';
      var vb = document.getElementById('bdVoorbeeld');
      if (vb) vb.style.objectPosition = px + ' ' + py;
    };
    vlak.addEventListener('pointerdown', function (ev) { neer = true; vlak.setPointerCapture(ev.pointerId); zet(ev); });
    vlak.addEventListener('pointermove', function (ev) { if (neer) zet(ev); });
    vlak.addEventListener('pointerup', function () { neer = false; });
    // Het beginpunt goed zetten zodra de foto geladen is (ze kan smaller zijn dan het vlak).
    var img = vlak.querySelector('img');
    var plaatsPunt = function () {
      var r = img.getBoundingClientRect();
      var v = vlak.getBoundingClientRect();
      var f = st.beeld.focus || { x: 0.5, y: 0.5 };
      var punt = document.getElementById('bdPunt');
      if (punt && r.width) { punt.style.left = (r.left - v.left + f.x * r.width) + 'px'; punt.style.top = (r.top - v.top + f.y * r.height) + 'px'; }
    };
    if (img.complete) plaatsPunt(); else img.addEventListener('load', plaatsPunt);
  }

  // ─── Bijsnijden ───────────────────────────────────────────────────────────

  /** Een beeld van elders eerst naar onze opslag: een canvas leest enkel eigen beelden. */
  async function eigenUrl(adres) {
    var origin = (NB.state.boot && NB.state.boot.asset_origin) || '';
    if (origin && adres.indexOf(origin + '/assets/') === 0) return adres;
    var r = await NB.api('/api/beeld-importeer', { method: 'POST', body: { url: adres } });
    return r.url;
  }

  /**
   * De uitsnede: zelfde verhouding als het kader (of `verhouding` als die
   * gemeten werd, zie kolomPassen in newsletters-edition.js), rond het
   * focuspunt, 2x scherp.
   */
  async function snij(b, verhouding) {
    var k = kader(b);
    if (verhouding) k = { breedte: k.breedte, verhouding: verhouding };
    var origin = (NB.state.boot && NB.state.boot.asset_origin) || '';
    var pad = b.url.indexOf(origin + '/assets/') === 0 ? b.url.slice(origin.length) : b.url;
    var res = await fetch(pad, { credentials: 'include' });
    if (!res.ok) throw new Error('Het beeld kon niet gelezen worden.');
    var bron = await createImageBitmap(await res.blob());
    var W = bron.width;
    var H = bron.height;
    var r = k.verhouding;
    var cw = W / H > r ? H * r : W;
    var ch = W / H > r ? H : W / r;
    var f = b.focus || { x: 0.5, y: 0.5 };
    var cx = Math.max(0, Math.min(W - cw, f.x * W - cw / 2));
    var cy = Math.max(0, Math.min(H - ch, f.y * H - ch / 2));
    var uitW = Math.round(Math.min(cw, k.breedte * 2));
    var uitH = Math.round(uitW / r);
    var c = document.createElement('canvas');
    c.width = uitW;
    c.height = uitH;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bron, cx, cy, cw, ch, 0, 0, uitW, uitH);
    var blob = await new Promise(function (ok, nok) { c.toBlob(function (x) { x ? ok(x) : nok(new Error('Uitsnede maken mislukt')); }, 'image/jpeg', 0.88); });
    return (await NB.upload('/api/upload', blob)).url;
  }

  // ─── Openen en acties ─────────────────────────────────────────────────────

  NB.beeld = {
    /** Opnieuw bijsnijden met een andere verhouding (zelfde focuspunt). */
    snij: async function (b, verhouding) {
      st = st || { opties: {} };
      b.url = await eigenUrl(b.url);
      return snij(b, verhouding);
    },
    open: async function (opties) {
      st = { opties: opties || {}, beeld: opties && opties.beeld ? JSON.parse(JSON.stringify(opties.beeld)) : null, stap: 'bron' };
      if (st.beeld) {
        st.stap = 'opmaak';
        if (!st.beeld.focus) st.beeld.focus = { x: 0.5, y: 0.5 };
        if (st.opties.plaatsen && !st.beeld.plaats) st.beeld.plaats = 'rechts';
      }
      document.getElementById('dlgBeeldInhoud').innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner"></span></div>';
      NB.dialoog('dlgBeeld').showModal();
      await NB.laadTekeningen();
      teken();
    },
  };

  function nieuw(deel) {
    var oud = st.beeld || {};
    var plaats = st.opties.vast || oud.plaats || 'rechts';
    st.beeld = Object.assign({ plaats: plaats, na_alinea: oud.na_alinea || 0, focus: { x: 0.5, y: 0.5 } }, deel);
    st.stap = 'opmaak';
    teken();
  }

  NB.actions['beeld-dlg-tekening'] = function (el) {
    var naam = el.dataset.naam;
    NB.zorgVoorPng(naam).catch(function (err) { NB.toast('PNG van de tekening maken mislukt: ' + err.message, 'warning'); });
    nieuw({ thingie: naam, url: '', vulling: 'heel', maat: (st.beeld && st.beeld.maat) || 'middel' });
  };

  NB.changes['beeld-dlg-foto'] = async function (el) {
    var bestand = el.files && el.files[0];
    if (!bestand) return;
    document.getElementById('dlgBeeldInhoud').innerHTML = '<div class="flex flex-col items-center gap-3 py-10"><span class="loading loading-spinner"></span><span class="text-sm opacity-70">Foto opladen…</span></div>';
    try {
      var blob = await NB.naarMailbeeld(bestand);
      var r = await NB.upload('/api/upload', blob);
      // Een foto vult standaard het kader: dat oogt in een mail het rustigst.
      nieuw({ url: r.url, thingie: '', vulling: 'vullen' });
    } catch (err) { NB.fout(err); teken(); }
  };

  NB.actions['beeld-dlg-plaats'] = function (el) { st.beeld.plaats = el.dataset.waarde; teken(); };
  NB.actions['beeld-dlg-vulling'] = function (el) { st.beeld.vulling = el.dataset.waarde; teken(); };
  NB.actions['beeld-dlg-maat'] = function (el) { st.beeld.maat = el.dataset.waarde; teken(); };
  NB.actions['beeld-dlg-alinea'] = function (el) {
    st.beeld.na_alinea = Math.max(0, Math.min(30, (st.beeld.na_alinea || 0) + Number(el.dataset.waarde)));
    teken();
  };
  NB.actions['beeld-dlg-ander'] = function () { st.stap = 'bron'; teken(); };
  NB.actions['beeld-dlg-terug'] = function () { st.stap = 'opmaak'; teken(); };

  NB.actions['beeld-dlg-weg'] = function () {
    NB.dialoog('dlgBeeld').close();
    if (st.opties.opslaan) st.opties.opslaan(null);
  };

  NB.actions['beeld-dlg-klaar'] = async function (el) {
    var b = st.beeld;
    el.disabled = true;
    try {
      if (!b.thingie && b.vulling === 'vullen') {
        el.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Uitsnede maken…';
        b.url = await eigenUrl(b.url);
        b.uitsnede = await snij(b);
      } else {
        b.uitsnede = '';
      }
      NB.dialoog('dlgBeeld').close();
      if (st.opties.opslaan) st.opties.opslaan(b);
    } catch (err) {
      NB.fout(err);
      el.disabled = false;
      el.textContent = 'Klaar';
    }
  };
})();
