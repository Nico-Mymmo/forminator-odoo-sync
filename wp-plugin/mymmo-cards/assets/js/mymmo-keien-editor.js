/**
 * De keienwolk in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals mymmo-cards-editor.js. Alles wat je
 * instelt, stel je hier in -- per wolk, per kei en per keitje -- niet in een
 * instellingenscherm van de plugin. Dezelfde wolk kan op twee pagina's dus
 * volledig anders staan.
 *
 * IN DE EDITOR BEWEEGT ER NIETS. Geen zweven, geen parallax: een keitje dat
 * onder je muis wegschuift is niet aan te klikken. Wat je ziet, is de stand die
 * een bezoeker krijgt als de wolk in het MIDDEN van zijn scherm staat.
 *
 * Een keitje verplaats je door het te selecteren en aan het rondje met de
 * pijltjes te slepen. "Keitjes rondom schikken" MEET de omtrek van de keien en
 * legt de keitjes er onregelmatig tegenaan -- soms in een paartje, soms half
 * over de rand. Elke klik geeft een andere schikking; ongedaan maken kan.
 *
 * De plaats van een keitje is een percentage van de KERN (de keien samen), niet
 * van de hele breedte: zo blijft het tegen de keien aan liggen op elk scherm.
 *
 * Geen typografie: de tekst in een kei is een gewone alinea of kop.
 */

(function (blocks, element, blockEditor, components, data) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !data) {
    return;
  }

  var el = element.createElement;
  var K = window.MymmoKeien || { tekeningen: [], zweven: [], opvullingen: [], vormen: 4 };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var BlockControls = blockEditor.BlockControls;
  var useBlockProps = blockEditor.useBlockProps;
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps || blockEditor.__experimentalUseInnerBlocksProps;
  var MediaUpload = blockEditor.MediaUpload;
  var MediaUploadCheck = blockEditor.MediaUploadCheck;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var RangeControl = components.RangeControl;
  var TextControl = components.TextControl;
  var Button = components.Button;
  var ColorPalette = components.ColorPalette;
  var ToolbarGroup = components.ToolbarGroup;
  var ToolbarButton = components.ToolbarButton;
  var BaseControl = components.BaseControl;

  var useSelect = data.useSelect;

  var WOLK = 'mymmo/keien';
  var KEI = 'mymmo/kei';
  var KEITJE = 'mymmo/keitje';

  // ───────────────────────────────────────────────────────────────────────────
  // Gereedschap
  // ───────────────────────────────────────────────────────────────────────────

  function klem(w, min, max) {
    return Math.max(min, Math.min(max, w));
  }

  /** Zie binnenProps() in mymmo-cards-editor.js: `children` apart houden. */
  function binnenProps(eigen, opties) {
    if (useInnerBlocksProps) {
      var alles = useInnerBlocksProps(eigen, opties);
      var props = {};
      Object.keys(alles).forEach(function (s) {
        if (s !== 'children') {
          props[s] = alles[s];
        }
      });
      return { props: props, kinderen: alles.children };
    }
    return { props: eigen, kinderen: el(InnerBlocks, opties) };
  }

  function themaPalet() {
    if (blockEditor.useSettings) {
      var w = blockEditor.useSettings('color.palette');
      if (w && w[0]) {
        return w[0];
      }
    }
    if (blockEditor.useSetting) {
      return blockEditor.useSetting('color.palette') || [];
    }
    return [];
  }

  /** Een kleur uit het palet bewaren als SLUG: dan volgt ze het merk mee. */
  function naarSlug(palet, hex) {
    var g = (palet || []).filter(function (k) {
      return String(k.color).toLowerCase() === String(hex).toLowerCase();
    })[0];
    return g ? g.slug : hex;
  }

  function naarHex(palet, waarde) {
    if (!waarde) {
      return '';
    }
    if (String(waarde).charAt(0) === '#') {
      return waarde;
    }
    var g = (palet || []).filter(function (k) { return k.slug === waarde; })[0];
    return g ? g.color : '';
  }

  /** Wat de server in een style-attribuut zet (zie mymmo_cards_color()). */
  function kleurCss(waarde) {
    if (!waarde) {
      return undefined;
    }
    if (String(waarde).charAt(0) === '#') {
      return waarde;
    }
    return 'var(--wp--preset--color--' + String(waarde).toLowerCase() + ')';
  }

  function kleurkiezer(label, palet, waarde, zetKleur, help) {
    return el(
      BaseControl,
      { label: label, help: help, __nextHasNoMarginBottom: true },
      el(ColorPalette, {
        colors: palet,
        value: naarHex(palet, waarde),
        disableCustomColors: true,
        onChange: function (hex) { zetKleur(hex ? naarSlug(palet, hex) : ''); }
      })
    );
  }

  function vormKeuzes() {
    var uit = [{ label: 'Automatisch (om de beurt)', value: '0' }];
    for (var i = 1; i <= (K.vormen || 4); i++) {
      uit.push({ label: 'Vorm ' + i, value: String(i) });
    }
    return uit;
  }

  /** De plaats van dit blok tussen de broers van hetzelfde soort. */
  function useIndex(clientId, naam) {
    return useSelect(function (select) {
      var st = select('core/block-editor');
      var ouder = st.getBlockRootClientId(clientId);
      var zelfde = st.getBlockOrder(ouder).filter(function (id) {
        return st.getBlockName(id) === naam;
      });
      return Math.max(0, zelfde.indexOf(clientId));
    }, [clientId, naam]);
  }

  /**
   * Staat het voorbeeld van de editor op MOBIEL? Dan tekent het canvas de
   * telefoonstand (de media query van de stylesheet slaat aan in dat smalle
   * voorbeeld), en bewaren slepen en "Rondom schikken" de TELEFOONwaarden.
   * WP 6.5+ heeft getDeviceType in core/editor; ouder zit het in edit-post of
   * edit-site. Een store die niet bestaat, mag hier niets breken.
   */
  function useTelefoon() {
    return useSelect(function (select) {
      var bronnen = [
        ['core/editor', 'getDeviceType'],
        ['core/edit-post', '__experimentalGetPreviewDeviceType'],
        ['core/edit-site', '__experimentalGetPreviewDeviceType']
      ];
      for (var i = 0; i < bronnen.length; i++) {
        try {
          var st = select(bronnen[i][0]);
          if (st && typeof st[bronnen[i][1]] === 'function') {
            var type = st[bronnen[i][1]]();
            if (type) {
              return type === 'Mobile';
            }
          }
        } catch (e) { /* store bestaat niet in dit scherm */ }
      }
      return false;
    }, []);
  }

  /** Een getal met eenheid, of niets (dan valt de CSS terug op de computer). */
  function maatOfNiets(w, eenheid) {
    return typeof w === 'number' && !isNaN(w) ? w + eenheid : undefined;
  }

  /**
   * Een schuif voor een TELEFOONwaarde. Niet ingevuld = volgt de computer; de
   * schuif toont dan die waarde, en "Herstellen" wist de telefoonwaarde weer.
   */
  function telefoonSchuif(a, zet, sleutel, label, terug, min, max, stap, help) {
    var gezet = typeof a[sleutel] === 'number';
    return el(RangeControl, {
      label: label + (gezet ? '' : ' (volgt de computer)'),
      value: gezet ? a[sleutel] : terug,
      min: min,
      max: max,
      step: stap || 1,
      allowReset: true,
      onChange: function (w) {
        var o = {};
        o[sleutel] = typeof w === 'number' && !isNaN(w) ? w : undefined;
        zet(o);
      },
      help: help
    });
  }

  function wisTelefoon(zet, sleutels) {
    var o = {};
    sleutels.forEach(function (k) { o[k] = undefined; });
    zet(o);
  }

  function telefoonUitleg(telefoon) {
    return el('p', { style: { fontSize: '12px', margin: '0 0 12px', color: telefoon ? '#1a7f37' : '#646970' } },
      telefoon
        ? 'Je bewerkt nu de TELEFOONSTAND. Slepen en "Rondom schikken" bewaren de plaats voor een telefoon; de computer blijft zoals hij was.'
        : 'Zet het voorbeeld bovenaan op Mobiel om de telefoonstand te zien en keitjes daarvoor te verslepen. Wat je hier niet invult, volgt de computer.');
  }

  function tekening(slug) {
    var g = (K.tekeningen || []).filter(function (t) { return t.slug === slug; })[0];
    return g ? g.value : '';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Schikken en toevoegen
  // ───────────────────────────────────────────────────────────────────────────

  /** Het element van de kern in het canvas (een iframe sinds WP 6.3, of niet). */
  function kernVan(clientId) {
    var docs = [];
    var iframe = document.querySelector('iframe[name="editor-canvas"]');
    if (iframe && iframe.contentDocument) {
      docs.push(iframe.contentDocument);
    }
    docs.push(document);
    for (var i = 0; i < docs.length; i++) {
      var b = docs[i].querySelector('[data-block="' + clientId + '"]');
      var kern = b ? b.querySelector('.mymmo-keien-kern') : null;
      if (kern) {
        return kern;
      }
    }
    return null;
  }

  /**
   * De OMTREK van de keien samen: elke kei als ellips, en enkel de punten die
   * niet binnen een buur vallen. Op volgorde rond het midden, met de afgelegde
   * lengte erbij, zodat je er keitjes langs kan leggen.
   */
  function omtrek(kern) {
    var r = kern.getBoundingClientRect();
    var ellipsen = Array.prototype.filter.call(kern.children, function (c) {
      return c.classList.contains('mymmo-kei');
    }).map(function (c) {
      var q = (c.querySelector('.mymmo-kei-vorm') || c).getBoundingClientRect();
      return { cx: q.left + q.width / 2 - r.left, cy: q.top + q.height / 2 - r.top, rx: q.width / 2 * 0.95, ry: q.height / 2 * 0.95 };
    });
    if (!ellipsen.length || !r.width || !r.height) {
      return null;
    }

    var punten = [];
    ellipsen.forEach(function (e, i) {
      for (var t = 0; t < 90; t++) {
        var a = t / 90 * Math.PI * 2;
        var x = e.cx + e.rx * Math.cos(a);
        var y = e.cy + e.ry * Math.sin(a);
        var binnen = ellipsen.some(function (o, j) {
          if (j === i) {
            return false;
          }
          var dx = (x - o.cx) / o.rx;
          var dy = (y - o.cy) / o.ry;
          return dx * dx + dy * dy < 0.97;
        });
        if (!binnen) {
          var nx = Math.cos(a) / e.rx;
          var ny = Math.sin(a) / e.ry;
          var l = Math.sqrt(nx * nx + ny * ny) || 1;
          punten.push({ x: x, y: y, nx: nx / l, ny: ny / l });
        }
      }
    });

    var mx = r.width / 2;
    var my = r.height / 2;
    punten.sort(function (p, q) {
      return Math.atan2(p.y - my, p.x - mx) - Math.atan2(q.y - my, q.x - mx);
    });
    var lengte = 0;
    punten.forEach(function (p, i) {
      if (i) {
        lengte += Math.sqrt(Math.pow(p.x - punten[i - 1].x, 2) + Math.pow(p.y - punten[i - 1].y, 2));
      }
      p.s = lengte;
    });

    return { punten: punten, lengte: lengte, b: r.width, h: r.height };
  }

  function puntOp(o, afstand) {
    for (var i = 0; i < o.punten.length; i++) {
      if (o.punten[i].s >= afstand) {
        return o.punten[i];
      }
    }
    return o.punten[o.punten.length - 1];
  }

  /** Een plaats in % van de kern: `d` px naar buiten (negatief = over de kei). */
  function plaatsBij(o, p, d) {
    return {
      x: klem(Math.round((p.x + p.nx * d) / o.b * 100), 2, 98),
      y: klem(Math.round((p.y + p.ny * d) / o.h * 100), -30, 130)
    };
  }

  /**
   * Alle keitjes TEGEN de keien aan, onregelmatig. Bewust willekeurig: een
   * vaste formule gaf een ring met gelijke tussenruimtes, en dat is precies wat
   * dit niet mag zijn. Wat de willekeur in toom houdt: een keitje ligt altijd op
   * de omtrek (van half over de rand tot net ernaast), een op de drie krijgt een
   * buurtje, en niets schuift door een ander keitje heen.
   */
  function schik(clientId, telefoon) {
    var st = data.select('core/block-editor');
    var zet = data.dispatch('core/block-editor');
    var ids = st.getBlockOrder(clientId).filter(function (id) {
      return st.getBlockName(id) === KEITJE;
    });
    var kern = kernVan(clientId);
    var o = kern ? omtrek(kern) : null;
    if (!ids.length || !o || !o.punten.length) {
      return;
    }

    var n = ids.length;
    // Op een telefoon kleiner: daar is de wolk smal en liggen ze anders op de tekst.
    var schaal = telefoon ? 0.72 : 1;
    var maten = ids.map(function () { return Math.round((52 + Math.random() * 40) * schaal); });
    var gem = o.lengte / n;

    // Eerst alle plaatsen langs de omtrek, dan samendrukken als het niet past.
    var posities = [];
    var pos = Math.random() * gem * 0.5;
    maten.forEach(function (maat, i) {
      posities.push(pos);
      var volgende = maten[i + 1] || maat;
      var buurtje = Math.random() < 0.33;
      pos += buurtje
        ? (maat + volgende) / 2 * 0.9
        : Math.max((maat + volgende) / 2 * 1.2, gem * (0.55 + Math.random() * 0.9));
    });
    var laatste = posities[posities.length - 1] || 1;
    var passen = laatste > o.lengte * 0.96 ? (o.lengte * 0.96) / laatste : 1;

    ids.forEach(function (id, i) {
      var maat = maten[i];
      var d = (-0.2 + Math.random() * 0.55) * maat;
      var plek = plaatsBij(o, puntOp(o, posities[i] * passen), d);

      var draai = Math.round(Math.random() * 28 - 14);

      // In de telefoonstand enkel de telefoonwaarden: de computer blijft staan.
      // De laag hoort bij het keitje, niet bij het scherm.
      zet.updateBlockAttributes(id, telefoon
        ? { xM: plek.x, yM: plek.y, maatM: maat, draaiM: draai }
        : {
            x: plek.x,
            y: plek.y,
            maat: maat,
            draai: draai,
            // Over de rand van een kei = ervoor: daar zit de overlap.
            laag: d < 0 ? 'voor' : 'achter'
          });
    });
  }

  function voegToe(clientId, naam, telefoon) {
    var st = data.select('core/block-editor');
    var ids = st.getBlockOrder(clientId);

    if (naam === KEI) {
      data.dispatch('core/block-editor').insertBlock(
        blocks.createBlock(KEI, {}, keiInhoud('')),
        undefined,
        clientId
      );
      return;
    }

    // Een tekening die nog niet in deze wolk staat, anders de volgende.
    var gebruikt = ids.map(function (id) { return (st.getBlockAttributes(id) || {}).beeld; });
    var vrij = (K.tekeningen || []).filter(function (t) { return gebruikt.indexOf(t.value) === -1; })[0];
    var n = ids.length;
    var plek = { x: 10 + ((n * 37) % 80), y: n % 2 ? 8 : 92 };
    var kern = kernVan(clientId);
    var o = kern ? omtrek(kern) : null;
    if (o && o.punten.length) {
      plek = plaatsBij(o, o.punten[Math.floor(Math.random() * o.punten.length)], 10);
    }

    var eigen = {
      beeld: vrij ? vrij.value : '',
      x: plek.x,
      y: plek.y,
      draai: ((n * 29) % 24) - 12
    };
    if (telefoon) {
      // Gemeten in de telefoonstand: dat is dan ook de telefoonplaats.
      eigen.xM = plek.x;
      eigen.yM = plek.y;
    }
    var nieuw = blocks.createBlock(KEITJE, eigen);
    data.dispatch('core/block-editor').insertBlock(nieuw, undefined, clientId);
  }

  function keiInhoud(tekst) {
    return [
      blocks.createBlock('core/image', {}),
      blocks.createBlock('core/paragraph', { align: 'center', placeholder: tekst || '“Wat zegt de klant?”' })
    ];
  }

  // Het vertrekpunt van een nieuwe wolk: de drie uitspraken van de huidige
  // "Klinkt dit bekend?", in de kleuren van syndicoach.be, met tien keitjes
  // uit de stappen eromheen. Alles daarvan is daarna vrij te wijzigen.
  var SJABLOON = [
    [KEI, { achtergrond: 'custom-fbcfe-8', draai: -6, hoogte: 20 }, [
      ['core/image', {}], ['core/paragraph', { align: 'center', placeholder: '“Wij weten niet wat onze syndicus doet”' }]
    ]],
    [KEI, { achtergrond: 'custom-fce-7-f-3-pink-100', draai: 3, hoogte: -30, schaal: 105 }, [
      ['core/image', {}], ['core/paragraph', { align: 'center', placeholder: '“We vinden geen syndicus”' }]
    ]],
    [KEI, { achtergrond: 'custom-fdf-2-f-8-1', draai: 7, hoogte: 35 }, [
      ['core/image', {}], ['core/paragraph', { align: 'center', placeholder: '“Ons gebouw wordt niet goed beheerd”' }]
    ]],
    // In % van de KERN, tegen de omtrek van de drie keien aan (naar de schets
    // van 2026-09-25): een paartje linksonder en een boven tussen kei 2 en 3.
    [KEITJE, { beeld: tekening('lift'),              x: 9,  y: 14,  maat: 72, snelheid: 30, laag: 'achter', draai: -8 }],
    [KEITJE, { beeld: tekening('aktentas'),          x: 7,  y: 91,  maat: 84, snelheid: 22, laag: 'voor',   draai: 6 }],
    [KEITJE, { beeld: tekening('spaarvarken'),       x: 2,  y: 80,  maat: 58, snelheid: 38, laag: 'achter', draai: -10 }],
    [KEITJE, { beeld: tekening('kapotte-lamp'),      x: 34, y: 99,  maat: 70, snelheid: 26, laag: 'achter', draai: 4 }],
    [KEITJE, { beeld: tekening('brieven'),           x: 32, y: 14,  maat: 56, snelheid: 34, laag: 'voor',   draai: 10 }],
    [KEITJE, { beeld: tekening('calendar1'),         x: 58, y: -4,  maat: 76, snelheid: 20, laag: 'achter', draai: -10 }],
    [KEITJE, { beeld: tekening('zonnepaneel'),       x: 66, y: 10,  maat: 58, snelheid: 40, laag: 'voor',   draai: 12 }],
    [KEITJE, { beeld: tekening('openstaande-vraag'), x: 93, y: 22,  maat: 68, snelheid: 28, laag: 'achter', draai: -6 }],
    [KEITJE, { beeld: tekening('vergrootglas'),      x: 70, y: 100, maat: 64, snelheid: 32, laag: 'voor',   draai: 8 }],
    [KEITJE, { beeld: tekening('telefoon'),          x: 86, y: 99,  maat: 72, snelheid: 24, laag: 'achter', draai: -4 }]
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // De wolk
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType(WOLK, {
    apiVersion: 2,
    title: 'Keienwolk',
    description: 'Grote zwevende keien met eigen inhoud, omringd door kleine keitjes die voorbijschuiven.',
    icon: 'marker',
    category: 'mymmo',
    keywords: ['keien', 'kei', 'wolk', 'parallax', 'zweven', 'organisch'],
    supports: { html: false, align: ['wide', 'full'], anchor: true },

    attributes: {
      align: { type: 'string', default: 'full' },
      keiBreedte: { type: 'number', default: 380 },
      breedte: { type: 'number', default: 1200 },
      overlap: { type: 'number', default: 60 },
      ruimte: { type: 'number', default: 100 },
      ruimteMobiel: { type: 'number', default: 90 },
      zweven: { type: 'string', default: 'zacht' },
      ademen: { type: 'boolean', default: true },
      parallax: { type: 'number', default: 100 },
      keitjeMobiel: { type: 'number', default: 70 },
      keiRand: { type: 'string', default: '' },
      keiRandDikte: { type: 'number', default: 2 },
      keiBreedteMobiel: { type: 'number', default: 300 },
      overlapMobiel: { type: 'number', default: 30 }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var id = props.clientId;
      var palet = themaPalet();
      var telefoon = useTelefoon();

      var klassen = ['mymmo-keien', 'mymmo-keien--editor'];

      var blokProps = useBlockProps({
        className: klassen.join(' '),
        style: {
          '--mk-kei-breedte': (a.keiBreedte || 380) + 'px',
          '--mk-max': (a.breedte || 1200) + 'px',
          '--mk-overlap': (a.overlap || 0) + 'px',
          '--mk-ruimte': (a.ruimte || 0) + 'px',
          '--mk-ruimte-m': (a.ruimteMobiel || 0) + 'px',
          '--mk-keitje-m': (a.keitjeMobiel || 70) / 100,
          '--mk-kei-breedte-m': (a.keiBreedteMobiel || 300) + 'px',
          '--mk-overlap-m': (a.overlapMobiel || 0) + 'px',
          '--mk-kei-rand': a.keiRand ? kleurCss(a.keiRand) : undefined,
          '--mk-kei-rand-dikte': a.keiRand ? 'var(--mymmo-rand)' : undefined
        }
      });

      var binnen = binnenProps({ className: 'mymmo-keien-kern' }, {
        allowedBlocks: [KEI, KEITJE],
        template: SJABLOON,
        templateLock: false,
        orientation: 'horizontal',
        renderAppender: false
      });

      var werkbalk = el(
        BlockControls,
        { group: 'block' },
        el(ToolbarGroup, null,
          el(ToolbarButton, { icon: 'plus-alt2', label: 'Kei toevoegen', onClick: function () { voegToe(id, KEI, telefoon); } }),
          el(ToolbarButton, { icon: 'marker', label: 'Keitje toevoegen', onClick: function () { voegToe(id, KEITJE, telefoon); } }),
          el(ToolbarButton, {
            icon: 'image-rotate',
            label: telefoon ? 'Keitjes rondom schikken (telefoon)' : 'Keitjes rondom schikken',
            onClick: function () { schik(id, telefoon); }
          })
        )
      );

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'De keien', initialOpen: true },
          el(RangeControl, {
            label: 'Breedte van een kei',
            value: a.keiBreedte, min: 200, max: 640, step: 10,
            onChange: function (w) { zet({ keiBreedte: w }); },
            help: 'Op 100%. Een kei kan groter of kleiner, bij "Deze kei".'
          }),
          el(RangeControl, {
            label: 'Overlap tussen de keien',
            value: a.overlap, min: 0, max: 240, step: 5,
            onChange: function (w) { zet({ overlap: w }); },
            help: 'Hoeveel pixels twee buren over elkaar schuiven. De volgorde ligt vast: de rechtse buur ligt erop.'
          }),
          el(RangeControl, {
            label: 'Maximale breedte van het geheel',
            value: a.breedte, min: 480, max: 2400, step: 20,
            onChange: function (w) { zet({ breedte: w }); },
            help: 'Keien die er samen niet in passen, komen op een tweede rij. De keitjes liggen altijd tegen de keien aan.'
          }),
          kleurkiezer('Randkleur van de keien', palet, a.keiRand, function (w) { zet({ keiRand: w }); },
            'Voor alle keien. Een kei kan een eigen rand krijgen. Leeg = geen rand. De dikte komt uit de huisstijl.')
        ),
        el(
          PanelBody,
          { title: 'Beweging', initialOpen: true },
          el(SelectControl, {
            label: 'Zweven',
            value: a.zweven || 'zacht',
            options: K.zweven,
            onChange: function (w) { zet({ zweven: w }); }
          }),
          el(ToggleControl, {
            label: 'De vormen ademen',
            checked: !!a.ademen,
            onChange: function (w) { zet({ ademen: !!w }); },
            help: 'De rand van een kei golft traag van de ene vorm naar de andere.'
          }),
          el(RangeControl, {
            label: 'Sterkte van de parallax (%)',
            value: a.parallax, min: 0, max: 200, step: 5,
            onChange: function (w) { zet({ parallax: w }); },
            help: 'Hoe ver de keitjes wegschuiven als de wolk het scherm in- of uitgaat. Hun tempo volgt vanzelf uit maat en laag: groot en vooraan gaat sneller. Midden op het scherm liggen ze stil op hun plek. 0 = geen parallax.'
          }),
          el('p', { style: { fontSize: '12px', color: '#646970', margin: '0' } },
            'In de editor beweegt niets. Je ziet de stand die een bezoeker krijgt als de wolk midden op zijn scherm staat. Wie beweging heeft uitgezet in zijn toestel, krijgt alles stil.')
        ),
        el(
          PanelBody,
          { title: 'Keitjes', initialOpen: true },
          el('p', { style: { fontSize: '12px', color: '#646970', marginTop: 0 } },
            'Selecteer een keitje en sleep het aan het rondje met de pijltjes, of stel het precies in bij "Dit keitje".'),
          el(Button, { variant: 'secondary', onClick: function () { voegToe(id, KEITJE, telefoon); }, style: { marginRight: '8px', marginBottom: '8px' } }, 'Keitje toevoegen'),
          el(Button, { variant: 'secondary', onClick: function () { schik(id, telefoon); }, style: { marginBottom: '8px' } },
            telefoon ? 'Rondom schikken (telefoon)' : 'Rondom schikken'),
          el('p', { style: { fontSize: '12px', color: '#646970', margin: '0 0 8px' } },
            'Elke klik geeft een andere schikking tegen de keien aan. Ongedaan maken kan.'),
          el(Button, { variant: 'secondary', onClick: function () { voegToe(id, KEI, telefoon); }, style: { display: 'block', marginBottom: '16px' } }, 'Kei toevoegen')
        ),
        el(
          PanelBody,
          { title: 'Op een telefoon', initialOpen: telefoon },
          telefoonUitleg(telefoon),
          el(RangeControl, {
            label: 'Breedte van een kei',
            value: a.keiBreedteMobiel, min: 140, max: 600, step: 10,
            onChange: function (w) { zet({ keiBreedteMobiel: w }); },
            help: 'Nooit breder dan het scherm. Een kei kan groter of kleiner, bij "Deze kei".'
          }),
          el(RangeControl, {
            label: 'Overlap tussen de keien',
            value: a.overlapMobiel, min: 0, max: 240, step: 5,
            onChange: function (w) { zet({ overlapMobiel: w }); },
            help: 'Hier staan ze onder elkaar, dus de overlap is verticaal.'
          }),
          el(RangeControl, {
            label: 'Lucht boven en onder',
            value: a.ruimteMobiel, min: 0, max: 400, step: 10,
            onChange: function (w) { zet({ ruimteMobiel: w }); }
          }),
          el(RangeControl, {
            label: 'Keitjes zonder eigen telefoonmaat (%)',
            value: a.keitjeMobiel, min: 30, max: 150, step: 5,
            onChange: function (w) { zet({ keitjeMobiel: w }); },
            help: 'Hoe groot een keitje hier is tegenover de computer, zolang het zelf geen telefoonmaat heeft.'
          })
        ),
        el(
          PanelBody,
          { title: 'Ruimte', initialOpen: false },
          el(RangeControl, {
            label: 'Lucht boven en onder',
            value: a.ruimte, min: 0, max: 400, step: 10,
            onChange: function (w) { zet({ ruimte: w }); },
            help: 'Daar zweven de keitjes in. Te weinig, en ze liggen over de keien. Voor een telefoon: zie "Op een telefoon".'
          })
        )
      );

      return el('div', blokProps, werkbalk, zijbalk, el('div', binnen.props, binnen.kinderen));
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Een grote kei
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType(KEI, {
    apiVersion: 2,
    title: 'Kei',
    description: 'Een grote kei. Zet er gewone blokken in: een afbeelding, een uitspraak.',
    icon: 'format-quote',
    category: 'mymmo',
    parent: [WOLK],
    supports: { html: false, reusable: false },

    attributes: {
      achtergrond: { type: 'string', default: '' },
      vorm: { type: 'number', default: 0 },
      schaal: { type: 'number', default: 100 },
      draai: { type: 'number', default: 0 },
      hoogte: { type: 'number', default: 0 },
      opvulling: { type: 'string', default: 'normaal' },
      rand: { type: 'string', default: '' },
      randDikte: { type: 'number', default: -1 },
      snelheid: { type: 'number', default: 0 },
      // Telefoonstand: bewust zonder standaard, leeg = volgt de computer.
      schaalM: { type: 'number' },
      draaiM: { type: 'number' },
      xM: { type: 'number' },
      hoogteM: { type: 'number' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();
      var index = useIndex(props.clientId, KEI);
      var vorm = a.vorm || ((index % (K.vormen || 4)) + 1);
      var telefoon = useTelefoon();

      var blokProps = useBlockProps({
        className: [
          'mymmo-kei',
          'mymmo-kei--vorm-' + vorm,
          'mymmo-kei--pad-' + (a.opvulling || 'normaal'),
          index % 2 ? 'mymmo-kei--even' : 'mymmo-kei--oneven'
        ].join(' '),
        style: {
          '--mk-schaal': (a.schaal || 100) / 100,
          '--mk-draai': (a.draai || 0) + 'deg',
          '--mk-hoogte': (a.hoogte || 0) + 'px',
          '--mk-kei-bg': kleurCss(a.achtergrond),
          '--mk-kei-rand': a.rand ? kleurCss(a.rand) : undefined,
          '--mk-kei-rand-dikte': a.randDikte === 0
            ? '0px'
            : (a.rand || a.randDikte > 0 ? 'var(--mymmo-rand)' : undefined),
          '--mk-schaal-m': typeof a.schaalM === 'number' ? a.schaalM / 100 : undefined,
          '--mk-draai-m': maatOfNiets(a.draaiM, 'deg'),
          '--mk-x-m': maatOfNiets(a.xM, '%'),
          '--mk-hoogte-m': maatOfNiets(a.hoogteM, 'px')
        }
      });

      var binnen = binnenProps({ className: 'mymmo-kei-vorm' }, {
        template: [
          ['core/image', {}],
          ['core/paragraph', { align: 'center', placeholder: '“Wat zegt de klant?”' }]
        ],
        templateLock: false
      });

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'Deze kei', initialOpen: true },
          kleurkiezer('Kleur', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); },
            'Uit het palet van het thema, dan schuift de kei mee als het merk verandert.'),
          el(SelectControl, {
            label: 'Vorm',
            value: String(a.vorm || 0),
            options: vormKeuzes(),
            onChange: function (w) { zet({ vorm: parseInt(w, 10) || 0 }); }
          }),
          el(RangeControl, {
            label: 'Grootte (%)',
            value: a.schaal, min: 50, max: 160, step: 5,
            onChange: function (w) { zet({ schaal: w }); }
          }),
          el(RangeControl, {
            label: 'Scheef (graden)',
            value: a.draai, min: -25, max: 25,
            onChange: function (w) { zet({ draai: w }); }
          }),
          el(RangeControl, {
            label: 'Hoger of lager (px)',
            value: a.hoogte, min: -240, max: 240, step: 5,
            onChange: function (w) { zet({ hoogte: w }); },
            help: 'Negatief = hoger dan de buren. Op een telefoon staan de keien onder elkaar en telt dit niet.'
          }),
          el(SelectControl, {
            label: 'Opvulling',
            value: a.opvulling || 'normaal',
            options: K.opvullingen,
            onChange: function (w) { zet({ opvulling: w }); },
            help: 'Hoe ver de inhoud van de rand blijft. Een kei is rond: bij krap raakt lange tekst de bocht.'
          }),
          kleurkiezer('Randkleur', palet, a.rand, function (w) { zet({ rand: w }); },
            'Leeg = de rand van de wolk.'),
          el(SelectControl, {
            label: 'Rand',
            value: String(a.randDikte > 0 ? 2 : (a.randDikte === 0 ? 0 : -1)),
            options: [
              { label: 'Zoals de wolk', value: '-1' },
              { label: 'Geen rand', value: '0' },
              { label: 'Wel een rand', value: '2' }
            ],
            onChange: function (w) { zet({ randDikte: parseInt(w, 10) }); },
            help: 'De dikte komt uit de huisstijl. Kies je hierboven een kleur, dan krijgt deze kei een rand in die kleur.'
          }),
          el(RangeControl, {
            label: 'Parallax van deze kei',
            value: a.snelheid, min: -100, max: 100, step: 5,
            onChange: function (w) { zet({ snelheid: w }); },
            help: 'Standaard 0: een kei draagt tekst, en tekst die wegschuift leest slecht. Een beetje (10 à 20) geeft diepte.'
          })
        ),
        el(
          PanelBody,
          { title: 'Op een telefoon', initialOpen: telefoon },
          telefoonUitleg(telefoon),
          telefoonSchuif(a, zet, 'schaalM', 'Grootte (%)', a.schaal || 100, 50, 160, 5),
          telefoonSchuif(a, zet, 'draaiM', 'Scheef (graden)', a.draai || 0, -25, 25, 1),
          telefoonSchuif(a, zet, 'xM', 'Naar links of rechts (%)', index % 2 ? 5 : -5, -40, 40, 1,
            'Standaard om de beurt een beetje links en rechts.'),
          telefoonSchuif(a, zet, 'hoogteM', 'Hoger of lager (px)', 0, -240, 240, 5),
          el(Button, {
            variant: 'link',
            onClick: function () { wisTelefoon(zet, ['schaalM', 'draaiM', 'xM', 'hoogteM']); }
          }, 'Alles zoals op de computer')
        )
      );

      // Hetzelfde vlak als de PHP-render (Mymmo_Cards_Keien::vlak), zonder het
      // ademen: in de editor beweegt niets. De paden komen van de server.
      var paden = K.paden || {};
      var pad = (paden[vorm] || paden[1] || [''])[0];
      var vlak = el('svg', {
        className: 'mymmo-kei-vlak',
        viewBox: '0 0 100 100',
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
        focusable: 'false'
      }, el('path', { d: pad, vectorEffect: 'non-scaling-stroke' }));

      return el('div', blokProps, zijbalk, el('div', binnen.props, vlak, binnen.kinderen));
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Een klein keitje
  // ───────────────────────────────────────────────────────────────────────────

  /** Slepen aan de greep: x/y in procent van de wolk, gemeten aan het MIDDEN. */
  function startSlepen(ev, zet, telefoon) {
    var greep = ev.currentTarget;
    var keitje = greep.closest('.mymmo-keitje');
    var wolk = keitje ? keitje.closest('.mymmo-keien-kern') : null;
    if (!wolk) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();

    var r = wolk.getBoundingClientRect();
    var k = keitje.getBoundingClientRect();
    // Waar je het vastpakt, blijft onder je muis: geen sprong bij de eerste beweging.
    var dx = (k.left + k.width / 2) - ev.clientX;
    var dy = (k.top + k.height / 2) - ev.clientY;

    try { greep.setPointerCapture(ev.pointerId); } catch (e) { /* oudere browser */ }

    function beweeg(e) {
      var x = klem(Math.round((e.clientX + dx - r.left) / r.width * 100), -10, 110);
      var y = klem(Math.round((e.clientY + dy - r.top) / r.height * 100), -30, 130);
      // In de telefoonstand verschuif je de telefoonplaats, nooit de computer.
      zet(telefoon ? { xM: x, yM: y } : { x: x, y: y });
    }
    function los() {
      greep.removeEventListener('pointermove', beweeg);
      greep.removeEventListener('pointerup', los);
      greep.removeEventListener('pointercancel', los);
    }
    greep.addEventListener('pointermove', beweeg);
    greep.addEventListener('pointerup', los);
    greep.addEventListener('pointercancel', los);
  }

  blocks.registerBlockType(KEITJE, {
    apiVersion: 2,
    title: 'Keitje',
    description: 'Een klein keitje met een tekening, dat parallax voorbijschuift.',
    icon: 'marker',
    category: 'mymmo',
    parent: [WOLK],
    supports: { html: false, reusable: false },

    attributes: {
      beeld: { type: 'string', default: '' },
      achtergrond: { type: 'string', default: '' },
      rand: { type: 'boolean', default: true },
      maat: { type: 'number', default: 80 },
      x: { type: 'number', default: 50 },
      y: { type: 'number', default: 10 },
      draai: { type: 'number', default: 0 },
      vorm: { type: 'number', default: 0 },
      snelheid: { type: 'number', default: 30 },
      laag: { type: 'string', default: 'achter' },
      mobiel: { type: 'boolean', default: true },
      // Telefoonstand: bewust zonder standaard, leeg = volgt de computer.
      xM: { type: 'number' },
      yM: { type: 'number' },
      maatM: { type: 'number' },
      draaiM: { type: 'number' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();
      var index = useIndex(props.clientId, KEITJE);
      var vorm = a.vorm || (((index + 2) % (K.vormen || 4)) + 1);
      var telefoon = useTelefoon();
      // De maat die een keitje zonder eigen telefoonmaat krijgt, komt van de wolk.
      var wolkFactor = useSelect(function (select) {
        var st = select('core/block-editor');
        var ouder = st.getBlockRootClientId(props.clientId);
        var w = ouder ? (st.getBlockAttributes(ouder) || {}).keitjeMobiel : null;
        return typeof w === 'number' ? w : 70;
      }, [props.clientId]);

      var klassen = ['mymmo-keitje', 'mymmo-keitje--vorm-' + vorm, 'mymmo-keitje--' + (a.laag === 'voor' ? 'voor' : 'achter')];
      if (!a.rand) {
        klassen.push('mymmo-keitje--kaal');
      }
      if (!a.mobiel) {
        klassen.push('mymmo-keitje--niet-mobiel');
      }

      var blokProps = useBlockProps({
        className: klassen.join(' '),
        style: {
          '--mk-x': a.x + '%',
          '--mk-y': a.y + '%',
          '--mk-maat': (a.maat || 80) + 'px',
          '--mk-draai': (a.draai || 0) + 'deg',
          '--mk-keitje-bg': kleurCss(a.achtergrond),
          '--mk-x-m': maatOfNiets(a.xM, '%'),
          '--mk-y-m': maatOfNiets(a.yM, '%'),
          '--mk-maat-m': maatOfNiets(a.maatM, 'px'),
          '--mk-draai-m': maatOfNiets(a.draaiM, 'deg')
        }
      });

      var inLijst = (K.tekeningen || []).some(function (t) { return t.value === a.beeld; });

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'Dit keitje', initialOpen: true },
          el(SelectControl, {
            label: 'Tekening',
            value: inLijst ? a.beeld : '',
            options: [{ label: a.beeld && !inLijst ? '— eigen afbeelding —' : '— geen tekening —', value: '' }]
              .concat((K.tekeningen || []).map(function (t) { return { label: t.label, value: t.value }; })),
            onChange: function (w) { zet({ beeld: w }); },
            help: 'Uit de stappen van het formulier. Leeg = gewoon een steentje.'
          }),
          MediaUpload && MediaUploadCheck
            ? el(MediaUploadCheck, null,
                el(MediaUpload, {
                  allowedTypes: ['image'],
                  onSelect: function (m) { zet({ beeld: (m && m.url) || '' }); },
                  render: function (o) {
                    return el(Button, { variant: 'secondary', onClick: o.open, style: { marginBottom: '12px' } }, 'Eigen afbeelding kiezen');
                  }
                }))
            : null,
          el(TextControl, {
            label: 'Of een link naar een afbeelding',
            value: a.beeld || '',
            onChange: function (w) { zet({ beeld: w }); }
          }),
          el(RangeControl, {
            label: 'Maat (px)',
            value: a.maat, min: 24, max: 260, step: 2,
            onChange: function (w) { zet({ maat: w }); }
          }),
          el(RangeControl, {
            label: 'Links ↔ rechts (%)',
            value: a.x, min: -10, max: 110,
            onChange: function (w) { zet({ x: w }); }
          }),
          el(RangeControl, {
            label: 'Boven ↕ onder (%)',
            value: a.y, min: -30, max: 130,
            onChange: function (w) { zet({ y: w }); }
          }),
          el(SelectControl, {
            label: 'Laag',
            value: a.laag === 'voor' ? 'voor' : 'achter',
            options: [
              { label: 'Achter de keien', value: 'achter' },
              { label: 'Voor de keien', value: 'voor' }
            ],
            onChange: function (w) { zet({ laag: w }); },
            help: 'Voor de keien geeft overlap, maar kan tekst afdekken. Houd die aan de rand. Vooraan schuift ook iets sneller voorbij dan achteraan, net als een groter keitje.'
          })
        ),
        el(
          PanelBody,
          { title: 'Vorm en kleur', initialOpen: false },
          kleurkiezer('Kleur', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); }, 'Leeg = wit.'),
          el(ToggleControl, {
            label: 'Dunne rand',
            checked: !!a.rand,
            onChange: function (w) { zet({ rand: !!w }); }
          }),
          el(SelectControl, {
            label: 'Vorm',
            value: String(a.vorm || 0),
            options: vormKeuzes(),
            onChange: function (w) { zet({ vorm: parseInt(w, 10) || 0 }); }
          }),
          el(RangeControl, {
            label: 'Scheef (graden)',
            value: a.draai, min: -45, max: 45,
            onChange: function (w) { zet({ draai: w }); }
          })
        ),
        el(
          PanelBody,
          { title: 'Op een telefoon', initialOpen: telefoon },
          telefoonUitleg(telefoon),
          el(ToggleControl, {
            label: 'Tonen op een telefoon',
            checked: !!a.mobiel,
            onChange: function (w) { zet({ mobiel: !!w }); },
            help: 'Een smal scherm heeft minder plaats. Verberg wat enkel vulsel is.'
          }),
          a.mobiel
            ? el('div', null,
                telefoonSchuif(a, zet, 'maatM', 'Maat (px)', Math.round((a.maat || 80) * wolkFactor / 100), 16, 260, 2),
                telefoonSchuif(a, zet, 'xM', 'Links ↔ rechts (%)', a.x, -10, 110, 1),
                telefoonSchuif(a, zet, 'yM', 'Boven ↕ onder (%)', a.y, -30, 130, 1),
                telefoonSchuif(a, zet, 'draaiM', 'Scheef (graden)', a.draai || 0, -45, 45, 1),
                el(Button, {
                  variant: 'link',
                  onClick: function () { wisTelefoon(zet, ['xM', 'yM', 'maatM', 'draaiM']); }
                }, 'Alles zoals op de computer'))
            : null
        )
      );

      var greep = props.isSelected
        ? el('span', {
            className: 'mymmo-keitje-greep' + (telefoon ? ' mymmo-keitje-greep--telefoon' : ''),
            draggable: false,
            title: telefoon ? 'Slepen: plaats op een telefoon' : 'Slepen om te verplaatsen',
            onPointerDown: function (ev) { startSlepen(ev, zet, telefoon); }
          }, el(components.Dashicon, { icon: 'move' }))
        : null;

      return el(
        'div',
        blokProps,
        zijbalk,
        el('div', { className: 'mymmo-keitje-vorm' },
          a.beeld ? el('img', { src: a.beeld, alt: '', width: 400, height: 400, draggable: false }) : null
        ),
        greep
      );
    },

    save: function () {
      return null;
    }
  });
}(
  window.wp && window.wp.blocks,
  window.wp && window.wp.element,
  window.wp && window.wp.blockEditor,
  window.wp && window.wp.components,
  window.wp && window.wp.data
));
