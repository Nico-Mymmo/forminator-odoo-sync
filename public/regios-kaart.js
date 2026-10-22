/* Regio's -- de kaart (d3 + topojson). Kaartdata: /regios-kaart.json. */
(function () {
  var RG = window.RG;
  var S = RG.state;
  var svg, laag, projectie, pad, zoom, defs, fc;
  var basis = null; // de postcodes zoals in de kaartdata, zonder de handmatige

  var VRIJ_STREEP = 'oklch(var(--b3))';
  var patronen = {};

  RG.laadKaart = async function () {
    var res = await fetch('/regios-kaart.json', { credentials: 'include' });
    if (!res.ok) throw new Error('Kaartdata niet gevonden (' + res.status + ')');
    var bundel = await res.json();
    var topo = bundel.topology;
    S.features = topojson.feature(topo, topo.objects.municipalities).features;
    basis = { nisNaarPostcodes: bundel.nisToPostcodes || {}, postcodeNaarNis: bundel.postcodeToNis || {} };
    S.deelgemeente = bundel.postcodeToSubname || {};
    S.features.forEach(function (f) {
      var p = f.properties;
      S.gemeente[p.nis] = { naam: p.nl || p.fr || '', provincie: p.prov || '', gewest: p.reg || '' };
      S.featureVan[p.nis] = f;
    });
    RG.voegExtraSamen();
    tekenKaart(topo);
  };

  /** De kaartdata plus wat iemand met de hand toevoegde. */
  RG.voegExtraSamen = function () {
    if (!basis) return;
    var n2p = {};
    Object.keys(basis.nisNaarPostcodes).forEach(function (nis) { n2p[nis] = basis.nisNaarPostcodes[nis].slice(); });
    var p2n = Object.assign({}, basis.postcodeNaarNis);
    Object.keys(S.extra).forEach(function (nis) {
      (S.extra[nis] || []).forEach(function (pc) {
        if (!n2p[nis]) n2p[nis] = [];
        if (n2p[nis].indexOf(pc) === -1) n2p[nis].push(pc);
        if (!p2n[pc]) p2n[pc] = nis;
      });
    });
    S.nisNaarPostcodes = n2p;
    S.postcodeNaarNis = p2n;
  };

  function maat() {
    var vak = RG.$('rgKaartVak');
    return [vak.clientWidth || 800, vak.clientHeight || 600];
  }

  function tekenKaart(topo) {
    svg = d3.select('#rgKaart');
    var m = maat();
    svg.attr('viewBox', '0 0 ' + m[0] + ' ' + m[1]).attr('preserveAspectRatio', 'xMidYMid meet');
    defs = svg.append('defs');
    projectie = d3.geoMercator();
    fc = { type: 'FeatureCollection', features: S.features };
    projectie.fitSize(m, fc);
    pad = d3.geoPath().projection(projectie);

    laag = svg.append('g');
    laag.selectAll('path.rg-gemeente')
      .data(S.features)
      .join('path')
      .attr('class', 'rg-gemeente')
      .attr('d', pad)
      .on('click', function (ev, d) { RG.verbergTip(); RG.opGemeenteKlik(d); })
      .on('mousemove', function (ev, d) { toonTip(ev, d); })
      .on('mouseleave', RG.verbergTip);

    laag.append('path')
      .datum(topojson.mesh(topo, topo.objects.provinces))
      .attr('class', 'rg-provincie')
      .attr('d', pad);

    zoom = d3.zoom().scaleExtent([1, 10]).on('zoom', function (ev) { laag.attr('transform', ev.transform); });
    svg.call(zoom).on('dblclick.zoom', null);

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var m2 = maat();
        svg.attr('viewBox', '0 0 ' + m2[0] + ' ' + m2[1]);
        projectie.fitSize(m2, fc);
        laag.selectAll('path.rg-gemeente').attr('d', pad);
        laag.select('path.rg-provincie').attr('d', pad);
      }, 200);
    });

    RG.$('rgLaden').classList.add('hidden');
    RG.kleurKaart();
  }

  RG.zoomIn = function () { svg && svg.transition().duration(200).call(zoom.scaleBy, 1.5); };
  RG.zoomUit = function () { svg && svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.5); };
  RG.zoomReset = function () { svg && svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity); };

  function streepPatroon(kleuren) {
    var sleutel = kleuren.join('|');
    if (patronen[sleutel]) return patronen[sleutel];
    var id = 'rg-pat-' + Object.keys(patronen).length;
    patronen[sleutel] = id;
    var b = 4;
    var p = defs.append('pattern')
      .attr('id', id)
      .attr('width', b * kleuren.length).attr('height', b * kleuren.length)
      .attr('patternTransform', 'rotate(-45)')
      .attr('patternUnits', 'userSpaceOnUse');
    kleuren.forEach(function (k, i) {
      p.append('rect').attr('x', 0).attr('y', i * b).attr('width', b * kleuren.length).attr('height', b).attr('fill', k);
    });
    return id;
  }

  RG.kleurKaart = function () {
    if (!laag) return;
    patronen = {};
    defs.selectAll('pattern').remove();
    laag.selectAll('path.rg-gemeente').each(function (d) {
      var nis = d.properties.nis;
      var pcs = RG.postcodesVan(nis);
      var eigenaars = RG.eigenaarsVan(nis);
      var el = d3.select(this);
      if (!pcs.length) el.attr('fill', 'oklch(var(--bc) / 0.12)');
      else if (!eigenaars.length) el.attr('fill', 'oklch(var(--b3))');
      else if (eigenaars.length === 1 && RG.helemaalVan(pcs, eigenaars[0])) {
        var s = RG.coach(eigenaars[0]);
        el.attr('fill', s ? s.kleur : 'oklch(var(--bc) / 0.4)');
      } else {
        var vrij = pcs.some(function (pc) { return !S.toewijzingen[pc]; });
        // vaste volgorde: die van de lijst links, niet die van het toewijzen
        var kleuren = S.syndicoaches.filter(function (s) { return eigenaars.indexOf(s.id) !== -1; }).map(function (s) { return s.kleur; });
        if (vrij) kleuren.push(VRIJ_STREEP);
        el.attr('fill', 'url(#' + streepPatroon(kleuren) + ')');
      }
    });
  };

  function toonTip(ev, d) {
    var tip = RG.$('rgTip');
    var naam = d.properties.nl || d.properties.fr || 'Onbekend';
    var regels = RG.postcodesVan(d.properties.nis).slice().sort().map(function (pc) {
      var s = RG.coach(S.toewijzingen[pc]);
      return RG.esc(pc + ' ' + (S.deelgemeente[pc] || naam) + ' -- ' + (s ? s.naam : 'vrij'));
    });
    tip.innerHTML = '<strong>' + RG.esc(naam) + '</strong><br>' + (regels.length ? regels.join('<br>') : 'Geen postcode gekend');
    tip.style.left = (ev.clientX + 14) + 'px';
    tip.style.top = (ev.clientY + 14) + 'px';
    tip.classList.remove('hidden');
  }
  RG.verbergTip = function () { RG.$('rgTip').classList.add('hidden'); };

  // ── Zoeken op gemeente of postcode ─────────────────────────────────────
  RG.zoek = function (q) {
    q = String(q || '').trim().toLowerCase();
    if (!q || !S.features) return [];
    var uit = [];
    var gezien = {};
    var pcs = Object.keys(S.postcodeNaarNis).sort();
    for (var i = 0; i < pcs.length && uit.length < 8; i++) {
      var pc = pcs[i];
      var nis = S.postcodeNaarNis[pc];
      var gem = RG.gemeenteNaam(nis);
      var sub = S.deelgemeente[pc] || gem;
      if ((pc.indexOf(q) !== -1 || sub.toLowerCase().indexOf(q) !== -1) && S.featureVan[nis]) {
        uit.push({ nis: nis, pc: pc, sub: sub, gemeente: gem });
        gezien[nis] = true;
      }
    }
    for (var k = 0; k < S.features.length && uit.length < 8; k++) {
      var p = S.features[k].properties;
      var naam = p.nl || p.fr || '';
      if (!gezien[p.nis] && naam.toLowerCase().indexOf(q) !== -1) {
        uit.push({ nis: p.nis, pc: null, sub: null, gemeente: naam });
        gezien[p.nis] = true;
      }
    }
    return uit;
  };

  RG.markeer = function (nis) {
    var f = S.featureVan[nis];
    if (!f || !laag) return;
    var m = maat();
    var b = pad.bounds(f);
    var dx = Math.max(b[1][0] - b[0][0], 1), dy = Math.max(b[1][1] - b[0][1], 1);
    var cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    var schaal = Math.max(1, Math.min(8, 0.55 * Math.min(m[0] / dx, m[1] / dy)));
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(m[0] / 2 - schaal * cx, m[1] / 2 - schaal * cy).scale(schaal));
    laag.selectAll('path.rg-gemeente').classed('rg-gezocht', false)
      .filter(function (d) { return d.properties.nis === nis; })
      .classed('rg-gezocht', true).raise();
  };
})();
