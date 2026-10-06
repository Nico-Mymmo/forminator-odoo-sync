/**
 * De aanvragen op de kaart — EEN component voor twee plekken.
 *
 *   Dashboards → tab Kaart          alle koppelingen, met aan/uit per koppeling
 *                                   (public/dashboards-map.js)
 *   Koppelingen → tabblad Kaart     één koppeling, enkel als haar formulier een
 *                                   postcodeveld heeft
 *                                   (public/forminator-sync-v2-detail-kaart-tab.js)
 *
 * Twee kaarten die elk hun eigen tekencode hebben, lopen uit elkaar zodra er aan
 * één iets verandert -- daarom tekent dit bestand ze allebei, en geeft de plek
 * enkel mee waar de data vandaan komt. Aan de serverkant idem: beide routes
 * roepen getAanvragenKaart() in src/modules/dashboards/lib/aanvragen-kaart.js.
 *
 *   var kaart = window.OMAanvragenKaart.maak(host, {
 *     laad: function (periode) { return Promise<data>; },  // het antwoord van de route
 *     koppelingenFilter: true,                             // knoppen per koppeling
 *     leegTekst: 'Nog geen ...'                            // als er geen postcodeveld is
 *   });
 *   kaart.toon();       // bij het tonen van het tabblad (laadt de eerste keer)
 *   kaart.verwijder();  // bij het wisselen naar een andere koppeling
 *
 * Kaart: Leaflet + leaflet.heat van cdnjs, pas geladen bij het eerste tonen.
 * Ondergrond: OpenStreetMap in grijs, zodat de aanvragen de enige kleur zijn.
 * Kleur: EEN tint, licht naar donker -- een hoeveelheid, geen categorie. De
 * standaardkleuren van leaflet.heat zijn een regenboog en suggereren grenzen die
 * er niet zijn. In een donker thema een eigen schaal: daar hoort "bijna niets"
 * donker te zijn, weg tegen de ondergrond.
 */
(function () {
  'use strict';

  var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  var LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  var HEAT_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js';

  var BELGIE = [[49.45, 2.5], [51.55, 6.45]];
  var SCHAAL_LICHT = { 0.25: '#86b6ef', 0.5: '#3987e5', 0.75: '#1c5cab', 1: '#0d366b' };
  var SCHAAL_DONKER = { 0.25: '#184f95', 0.5: '#256abf', 0.75: '#5598e7', 1: '#cde2fb' };
  var BOL_LICHT = '#2a78d6';
  var BOL_DONKER = '#5598e7';

  var PERIODES = [['30d', '30 dagen'], ['90d', '90 dagen'], ['12m', '12 maanden'], ['alles', 'Alles']];
  var WEERGAVES = [['warmte', 'Warmtekaart'], ['bollen', 'Bollen']];

  // Leaflet zet z-indexen tot 1000 op zijn eigen lagen; isolation houdt die
  // binnen de kaart, anders schuiven de zoomknoppen over de navbar.
  var STIJL = [
    '.om-kaart { position: relative; z-index: 0; isolation: isolate; background: oklch(var(--b2)); }',
    '.om-kaart .leaflet-tile-pane { filter: grayscale(1) contrast(0.9) brightness(1.04); }',
    '.om-kaart.om-kaart--donker .leaflet-tile-pane { filter: grayscale(1) invert(1) brightness(0.8) contrast(0.9); }',
    '.om-kaart .leaflet-heatmap-layer { pointer-events: none; }',
    '.om-kaart .leaflet-tooltip { background: oklch(var(--b1)); color: oklch(var(--bc)); border: 1px solid oklch(var(--bc) / 0.1); box-shadow: 0 2px 8px rgb(0 0 0 / 0.12); font-size: 12px; }',
    '.om-kaart .leaflet-tooltip-top:before { border-top-color: oklch(var(--b1)); }'
  ].join('\n');

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getal(n) {
    return Number(n || 0).toLocaleString('nl-BE');
  }

  function donker() {
    try {
      return String(getComputedStyle(document.documentElement).colorScheme || '').indexOf('dark') !== -1;
    } catch (_) {
      return false;
    }
  }

  // ── Leaflet en de stijl: een keer per pagina ────────────────────────────

  function zetStijl() {
    if (document.getElementById('om-aanvragen-kaart-stijl')) return;
    var el = document.createElement('style');
    el.id = 'om-aanvragen-kaart-stijl';
    el.textContent = STIJL;
    document.head.appendChild(el);
  }

  function laadScript(src) {
    return new Promise(function (ok, fout) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { fout(new Error(`Kon ${src} niet laden`)); };
      document.head.appendChild(s);
    });
  }

  var leafletKlaar = null;
  function laadLeaflet() {
    if (window.L && typeof window.L.heatLayer === 'function') return Promise.resolve();
    if (leafletKlaar) return leafletKlaar;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    // leaflet.heat hangt aan L, dus pas na Leaflet zelf.
    leafletKlaar = (window.L ? Promise.resolve() : laadScript(LEAFLET_JS)).then(function () { return laadScript(HEAT_JS); });
    leafletKlaar.catch(function () { leafletKlaar = null; });
    return leafletKlaar;
  }

  // ── Het component ───────────────────────────────────────────────────────

  function maak(host, opties) {
    var opts = opties || {};
    var st = {
      periode: '12m',
      weergave: 'warmte',
      uit: {},            // koppeling-id -> true als uitgevinkt
      data: null,
      kaart: null,
      lagen: [],
      geladen: false,
      bezig: false,
      ingezoomd: false,
      weg: false
    };

    zetStijl();
    host.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <div data-ak="koppelingen" class="flex flex-wrap items-center gap-2"></div>
        <div class="flex flex-wrap gap-2 ml-auto">
          <div class="join">
            ${WEERGAVES.map(function (w) {
              return `<button class="btn btn-sm join-item" data-ak-action="weergave" data-value="${w[0]}">${w[1]}</button>`;
            }).join('')}
          </div>
          <div class="join">
            ${PERIODES.map(function (p) {
              return `<button class="btn btn-sm join-item" data-ak-action="periode" data-value="${p[0]}">${p[1]}</button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div data-ak="status" class="mb-3"></div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 card bg-base-100 border border-base-content/10 shadow-sm">
          <div class="card-body p-3">
            <div data-ak="kaart" class="om-kaart rounded-box" style="height: 520px;"></div>
            <div class="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-base-content/60">
              <div data-ak="legende"></div>
              <div data-ak="bron"></div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-4">
          <div class="card bg-base-100 border border-base-content/10 shadow-sm">
            <div class="card-body p-4" data-ak="kpi"></div>
          </div>
          <div class="card bg-base-100 border border-base-content/10 shadow-sm">
            <div class="card-body p-4">
              <h3 class="font-semibold text-sm mb-2">Per provincie</h3>
              <div data-ak="provincies"></div>
            </div>
          </div>
          <div class="card bg-base-100 border border-base-content/10 shadow-sm">
            <div class="card-body p-4">
              <h3 class="font-semibold text-sm mb-2">Meeste aanvragen</h3>
              <div data-ak="top"></div>
            </div>
          </div>
        </div>
      </div>`;

    function deel(naam) { return host.querySelector(`[data-ak="${naam}"]`); }

    // ── Data ──────────────────────────────────────────────────────────────

    /** De punten met enkel de aangevinkte koppelingen. */
    function zichtbarePunten() {
      var uit = [];
      ((st.data && st.data.punten) || []).forEach(function (p) {
        var n = 0;
        Object.keys(p.k || {}).forEach(function (id) { if (!st.uit[id]) n += p.k[id]; });
        if (n > 0) uit.push(Object.assign({}, p, { n: n }));
      });
      return uit.sort(function (a, b) { return b.n - a.n; });
    }

    function zichtbareKoppelingen() {
      return ((st.data && st.data.koppelingen) || []).filter(function (k) { return !st.uit[k.id]; });
    }

    /**
     * Waar de schaal "vol" is. Niet het maximum: één drukke postcode (Antwerpen,
     * Gent) zou dan alles anders bleek maken. Het 90e percentiel, minstens 1.
     */
    function bovengrens(punten) {
      if (!punten.length) return 1;
      var n = punten.map(function (p) { return p.n; }).sort(function (a, b) { return a - b; });
      return Math.max(1, n[Math.min(n.length - 1, Math.floor(n.length * 0.9))]);
    }

    // ── Tekenen ───────────────────────────────────────────────────────────

    function naamVan(p) {
      if (p.plaats && p.gemeente && p.plaats !== p.gemeente) return `${p.plaats} (${p.gemeente})`;
      return p.plaats || p.gemeente || '';
    }

    function tooltip(p) {
      var regels = `<strong>${esc(p.postcode + ' ' + naamVan(p))}</strong><br>${getal(p.n)} ${p.n === 1 ? 'aanvraag' : 'aanvragen'}`;
      var koppelingen = zichtbareKoppelingen().filter(function (k) { return p.k && p.k[k.id]; });
      if (koppelingen.length > 1) {
        regels += koppelingen.map(function (k) {
          return `<br><span style="opacity:.7">${esc(k.name)}: ${getal(p.k[k.id])}</span>`;
        }).join('');
      }
      return regels;
    }

    function tekenKaart(punten) {
      var L = window.L;
      var el = deel('kaart');
      if (!L || !el) return;
      var isDonker = donker();
      el.classList.toggle('om-kaart--donker', isDonker);

      if (!st.kaart) {
        st.kaart = L.map(el, { minZoom: 6, maxZoom: 13, zoomSnap: 0.25, scrollWheelZoom: false });
        st.kaart.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'
        }).addTo(st.kaart);
        st.kaart.fitBounds(BELGIE);
        // Scrollen zoomt pas na een klik in de kaart: anders vangt de kaart het
        // scrollen van de pagina op en raak je er niet meer voorbij.
        st.kaart.on('click', function () { st.kaart.scrollWheelZoom.enable(); });
        st.kaart.on('mouseout', function () { st.kaart.scrollWheelZoom.disable(); });
      }

      st.lagen.forEach(function (laag) { st.kaart.removeLayer(laag); });
      st.lagen = [];

      var grens = bovengrens(punten);
      var maxN = punten.length ? punten[0].n : 1;

      if (st.weergave === 'warmte' && punten.length && typeof L.heatLayer === 'function') {
        st.lagen.push(L.heatLayer(punten.map(function (p) { return [p.lat, p.lng, p.n]; }), {
          radius: 26, blur: 20, maxZoom: 9, max: grens, minOpacity: 0.3,
          gradient: isDonker ? SCHAAL_DONKER : SCHAAL_LICHT
        }).addTo(st.kaart));
      }

      // De bollen: zichtbaar bij "Bollen", en bij de warmtekaart ONZICHTBAAR maar
      // aanwijsbaar -- zo krijg je ook daar per postcode het aantal te zien.
      var zichtbaar = st.weergave === 'bollen';
      var ring = isDonker ? '#1a1a19' : '#ffffff';
      var bollen = punten.slice().reverse().map(function (p) {
        var r = zichtbaar ? 4 + 14 * Math.sqrt(p.n / maxN) : 12;
        return L.circleMarker([p.lat, p.lng], {
          radius: r,
          weight: zichtbaar ? 2 : 0,
          color: ring,
          opacity: zichtbaar ? 1 : 0,
          fillColor: isDonker ? BOL_DONKER : BOL_LICHT,
          fillOpacity: zichtbaar ? 0.75 : 0.01
        }).bindTooltip(tooltip(p), { direction: 'top', offset: [0, -4] });
      });
      st.lagen.push(L.layerGroup(bollen).addTo(st.kaart));

      // Liggen er punten buiten België (een Nederlands formulier), dan alles in beeld.
      var buiten = punten.some(function (p) {
        return p.lat < BELGIE[0][0] || p.lat > BELGIE[1][0] || p.lng < BELGIE[0][1] || p.lng > BELGIE[1][1];
      });
      if (buiten && !st.ingezoomd) {
        var b = L.latLngBounds(BELGIE);
        punten.forEach(function (p) { b.extend([p.lat, p.lng]); });
        st.kaart.fitBounds(b, { padding: [20, 20] });
      }
      st.ingezoomd = true;

      tekenLegende(grens, maxN, isDonker);
    }

    function tekenLegende(grens, maxN, isDonker) {
      var el = deel('legende');
      if (!el) return;
      if (st.weergave === 'warmte') {
        var s = isDonker ? SCHAAL_DONKER : SCHAAL_LICHT;
        var verloop = Object.keys(s).map(function (k) { return `${s[k]} ${Math.round(Number(k) * 100)}%`; }).join(', ');
        el.innerHTML = `
          <span class="inline-flex items-center gap-2">minder
            <span class="inline-block w-28 h-2 rounded" style="background-image:linear-gradient(90deg,${esc(verloop)})"></span>
            meer · vol vanaf ${getal(grens)} per postcode
          </span>`;
      } else {
        var kleur = isDonker ? BOL_DONKER : BOL_LICHT;
        el.innerHTML = `
          <span class="inline-flex items-center gap-2">
            <span class="inline-block rounded-full" style="width:8px;height:8px;background-color:${kleur}"></span>1
            <span class="inline-block rounded-full" style="width:28px;height:28px;background-color:${kleur};opacity:.75"></span>${getal(maxN)} aanvragen
          </span>`;
      }
    }

    function tekenKoppelingen() {
      var el = deel('koppelingen');
      var lijst = (st.data && st.data.koppelingen) || [];
      if (!el) return;
      if (!opts.koppelingenFilter || lijst.length < 2) { el.innerHTML = ''; return; }
      el.innerHTML = `<span class="text-xs text-base-content/60">Koppelingen:</span>${lijst.map(function (k) {
        var aan = !st.uit[k.id];
        return `<button class="btn btn-xs ${aan ? 'btn-active' : 'btn-ghost text-base-content/50'} gap-1"
                        data-ak-action="koppeling" data-id="${esc(k.id)}" aria-pressed="${aan ? 'true' : 'false'}"
                        ${k.is_active ? '' : 'title="Deze koppeling staat uit"'}>
                  ${esc(k.name)} <span class="text-base-content/60">${getal(k.met_postcode)}</span>
                </button>`;
      }).join('')}`;
    }

    function tekenKpi(punten) {
      var el = deel('kpi');
      if (!el) return;
      var ks = zichtbareKoppelingen();
      var som = function (veld) { return ks.reduce(function (t, k) { return t + (k[veld] || 0); }, 0); };
      var met = som('met_postcode');
      var totaal = som('aanvragen');
      var onbekend = som('onbekend');
      var zonder = som('zonder_postcode');
      var voorbeelden = ((st.data && st.data.onbekend) || []).map(function (o) { return `${o.waarde} (${o.n})`; }).join(', ');

      el.innerHTML = `
        <div class="text-xs text-base-content/60">Aanvragen op de kaart</div>
        <div class="text-4xl font-bold mt-1">${getal(met)}</div>
        <div class="text-sm text-base-content/60 mt-1">
          van ${getal(totaal)} aanvragen in deze periode, ${getal(punten.length)} ${punten.length === 1 ? 'postcode' : 'postcodes'}
        </div>
        ${(zonder || onbekend) ? `
          <div class="text-xs text-base-content/60 mt-3">
            ${zonder ? `${getal(zonder)} zonder postcode` : ''}${zonder && onbekend ? ' · ' : ''}${onbekend ? `
              <span class="underline decoration-dotted" ${voorbeelden ? `title="${esc('Bv. ' + voorbeelden)}"` : ''}>
                ${getal(onbekend)} met een postcode die we niet herkennen
              </span>` : ''}
          </div>` : ''}`;
    }

    function tekenProvincies(punten) {
      var el = deel('provincies');
      if (!el) return;
      var per = {};
      punten.forEach(function (p) {
        var naam = p.provincie || (p.land === 'NL' ? 'Nederland' : 'Onbekend');
        per[naam] = (per[naam] || 0) + p.n;
      });
      var rijen = Object.keys(per).map(function (k) { return [k, per[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      if (!rijen.length) { el.innerHTML = '<p class="text-sm text-base-content/50">Nog niets te tonen.</p>'; return; }
      var max = rijen[0][1];
      var kleur = donker() ? BOL_DONKER : BOL_LICHT;
      el.innerHTML = `<div class="flex flex-col gap-1.5">${rijen.map(function (r) {
        return `
          <div class="text-sm">
            <div class="flex justify-between gap-2"><span>${esc(r[0])}</span><span class="tabular-nums text-base-content/70">${getal(r[1])}</span></div>
            <div class="h-1.5 rounded bg-base-content/10 mt-0.5">
              <div class="h-1.5 rounded" style="width:${Math.max(2, Math.round(100 * r[1] / max))}%;background-color:${kleur}"></div>
            </div>
          </div>`;
      }).join('')}</div>`;
    }

    function tekenTop(punten) {
      var el = deel('top');
      if (!el) return;
      if (!punten.length) { el.innerHTML = '<p class="text-sm text-base-content/50">Nog niets te tonen.</p>'; return; }
      el.innerHTML = `
        <table class="table table-xs">
          <thead><tr><th>Postcode</th><th>Plaats</th><th class="text-right">Aanvragen</th></tr></thead>
          <tbody>${punten.slice(0, 15).map(function (p) {
            return `<tr><td class="tabular-nums">${esc(p.postcode)}</td><td>${esc(naamVan(p))}</td><td class="text-right tabular-nums">${getal(p.n)}</td></tr>`;
          }).join('')}</tbody>
        </table>
        ${punten.length > 15 ? `<p class="text-xs text-base-content/50 mt-1">en ${getal(punten.length - 15)} andere postcodes</p>` : ''}`;
    }

    function tekenBron() {
      var el = deel('bron');
      if (!el || !st.data) return;
      el.textContent = 'Postcodes: ' + (st.data.bronnen || []).map(function (b) {
        return `${b.bron} (${b.licentie})`;
      }).join(', ');
    }

    function tekenKnoppen() {
      host.querySelectorAll('[data-ak-action="periode"]').forEach(function (b) {
        b.classList.toggle('btn-active', b.dataset.value === st.periode);
      });
      host.querySelectorAll('[data-ak-action="weergave"]').forEach(function (b) {
        b.classList.toggle('btn-active', b.dataset.value === st.weergave);
      });
    }

    function tekenAlles() {
      tekenKnoppen();
      if (!st.data) return;
      var status = deel('status');
      status.innerHTML = (st.data.koppelingen || []).length ? '' : `
        <div class="alert">${opts.leegTekst || 'Nog geen formulier met een postcodeveld.'}</div>`;
      var punten = zichtbarePunten();
      tekenKoppelingen();
      tekenKpi(punten);
      tekenProvincies(punten);
      tekenTop(punten);
      tekenBron();
      tekenKaart(punten);
    }

    async function laad() {
      if (st.bezig || st.weg) return;
      st.bezig = true;
      var status = deel('status');
      status.innerHTML = `
        <div class="flex items-center gap-2 text-sm text-base-content/60">
          <span class="loading loading-spinner loading-sm"></span> Aanvragen laden…
        </div>`;
      tekenKnoppen();
      try {
        var resultaat = await Promise.all([opts.laad(st.periode), laadLeaflet()]);
        if (st.weg) return;
        st.data = resultaat[0] || { koppelingen: [], punten: [] };
        tekenAlles();
      } catch (err) {
        if (!st.weg) status.innerHTML = `<div class="alert alert-error">Kon de kaart niet laden: ${esc(err.message)}</div>`;
        console.error('aanvragen-kaart', err);
      } finally {
        st.bezig = false;
      }
    }

    function opKlik(e) {
      var el = e.target.closest('[data-ak-action]');
      if (!el || !host.contains(el)) return;
      var actie = el.dataset.akAction;
      if (actie === 'periode') {
        if (st.periode === el.dataset.value) return;
        st.periode = el.dataset.value;
        laad();
      } else if (actie === 'weergave') {
        st.weergave = el.dataset.value;
        tekenAlles();
      } else if (actie === 'koppeling') {
        var id = el.dataset.id;
        if (st.uit[id]) delete st.uit[id]; else st.uit[id] = true;
        tekenAlles();
      }
    }
    host.addEventListener('click', opKlik);
    tekenKnoppen();

    return {
      /** Bij het tonen van de plek: de eerste keer laden, daarna enkel opnieuw meten. */
      toon: function () {
        if (!st.geladen) {
          st.geladen = true;
          laad();
        } else if (st.kaart) {
          // Een verborgen kaart heeft geen afmetingen; na het tonen opnieuw meten.
          st.kaart.invalidateSize();
        }
      },
      herlaad: function () { laad(); },
      verwijder: function () {
        st.weg = true;
        host.removeEventListener('click', opKlik);
        if (st.kaart) { st.kaart.remove(); st.kaart = null; }
        host.innerHTML = '';
      }
    };
  }

  window.OMAanvragenKaart = { maak: maak };
})();
