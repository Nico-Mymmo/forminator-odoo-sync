/**
 * De getuigenissen in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Een getuigenis bestaat uit gewone blokken: een afbeelding (de foto) en drie
 * alinea's (het citaat, de naam, wie de persoon is). Die alinea's dragen een
 * klasse uit het sjabloon, zodat de CSS ze herkent -- zie class-getuigenissen.php.
 *
 * De gesloten lijsten (opvullingen, de vorm van de foto, het aantal kolommen)
 * komen uit class-getuigenissen.php via window.MymmoGetuigenissen -- er staat
 * hier geen tweede kopie van.
 */

(function (blocks, element, blockEditor, components, data) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !data) {
    return;
  }

  var el = element.createElement;
  var G = window.MymmoGetuigenissen || { opvullingen: [], fotos: [], kolommen: [] };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var useBlockProps = blockEditor.useBlockProps;
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps || blockEditor.__experimentalUseInnerBlocksProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ColorPalette = components.ColorPalette;
  var BaseControl = components.BaseControl;

  var useSelect = data.useSelect;

  var RIJ = 'mymmo/getuigenissen';
  var GETUIGENIS = 'mymmo/getuigenis';

  // ───────────────────────────────────────────────────────────────────────────
  // Gereedschap (zelfde als in mymmo-stappen-editor.js)
  // ───────────────────────────────────────────────────────────────────────────

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

  function waarden(lijst) {
    return (lijst || []).map(function (rij) { return rij.value; });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // De rij
  // ───────────────────────────────────────────────────────────────────────────

  var GETUIGENIS_SJABLOON = [
    ['core/image', { sizeSlug: 'medium' }],
    ['core/paragraph', { className: 'mymmo-getuigenis-citaat', placeholder: 'Wat de klant zegt, zonder aanhalingstekens: die zet het blok zelf.' }],
    ['core/paragraph', { className: 'mymmo-getuigenis-naam', placeholder: 'Naam' }],
    ['core/paragraph', { className: 'mymmo-getuigenis-wie', placeholder: 'Wie (bv. Mede-eigenaar, Residentie Zonneveld, Gent)' }]
  ];

  blocks.registerBlockType(RIJ, {
    apiVersion: 2,
    title: 'Getuigenissen',
    description: 'Klanten die aan het woord komen: citaten met foto, naast elkaar.',
    category: 'mymmo',
    icon: 'format-quote',
    keywords: ['getuigenissen', 'getuigenis', 'klanten', 'reviews', 'citaat', 'testimonials', 'testimonial', 'quote'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    attributes: {
      align: { type: 'string', default: 'wide' },
      kolommen: { type: 'string', default: '3' },
      foto: { type: 'string', default: 'rond' },
      achtergrond: { type: 'string', default: '' },
      opvulling: { type: 'string', default: 'normaal' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      var aantal = useSelect(function (select) {
        return select('core/block-editor').getBlockCount(props.clientId);
      }, [props.clientId]);

      // Dezelfde telling als render_rij() in class-getuigenissen.php.
      var maximum = waarden(G.kolommen).indexOf(a.kolommen) !== -1 ? parseInt(a.kolommen, 10) : 3;
      var kolommen = Math.max(1, Math.min(aantal || 1, maximum));
      var foto = waarden(G.fotos).indexOf(a.foto) !== -1 ? a.foto : 'rond';

      var blockProps = useBlockProps({
        className: 'mymmo-getuigenissen mymmo-getuigenissen--pad-' + (a.opvulling || 'normaal') + ' mymmo-getuigenissen--foto-' + foto,
        style: {
          '--mk-kolommen': kolommen,
          '--mk-getuigenissen-bg': kleurCss(a.achtergrond)
        }
      });

      var rij = binnenProps({ className: 'mymmo-getuigenissen-rij' }, {
        allowedBlocks: [GETUIGENIS],
        template: [[GETUIGENIS], [GETUIGENIS], [GETUIGENIS]],
        orientation: 'horizontal',
        renderAppender: InnerBlocks.ButtonBlockAppender
      });

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Indeling', initialOpen: true },
          el(SelectControl, {
            label: 'Hoogstens naast elkaar',
            help: 'Op een computer. Meer getuigenissen schuiven door naar een volgende rij. Smaller dan 782px staan ze onder elkaar.',
            value: a.kolommen,
            options: G.kolommen,
            onChange: function (w) { zet({ kolommen: w }); },
            __nextHasNoMarginBottom: true
          }),
          el(SelectControl, {
            label: 'Foto',
            value: a.foto,
            options: G.fotos,
            onChange: function (w) { zet({ foto: w }); },
            __nextHasNoMarginBottom: true
          })
        ),
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: false },
          kleurkiezer('Achtergrond van de getuigenissen', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); },
            'Leeg = het vlak van de huisstijl. Een getuigenis kan zelf een andere kleur krijgen.'),
          el(SelectControl, {
            label: 'Opvulling',
            value: a.opvulling,
            options: G.opvullingen,
            onChange: function (w) { zet({ opvulling: w }); },
            __nextHasNoMarginBottom: true
          })
        )
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        el('div', rij.props, rij.kinderen)
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Een getuigenis
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType(GETUIGENIS, {
    apiVersion: 2,
    title: 'Getuigenis',
    description: 'Een klant aan het woord: foto, citaat, naam en wie die persoon is.',
    category: 'mymmo',
    icon: 'format-quote',
    parent: [RIJ],
    keywords: ['getuigenis', 'testimonial'],
    supports: {
      html: false,
      anchor: true
    },
    attributes: {
      achtergrond: { type: 'string', default: '' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      var blockProps = useBlockProps({
        className: 'mymmo-getuigenis',
        style: { '--mk-getuigenis-bg': kleurCss(a.achtergrond) }
      });

      var inhoud = binnenProps({ className: 'mymmo-getuigenis-inhoud' }, {
        allowedBlocks: ['core/image', 'core/paragraph'],
        template: GETUIGENIS_SJABLOON,
        templateLock: false
      });

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: true },
          kleurkiezer('Achtergrond van deze getuigenis', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); },
            'Leeg = de achtergrond van de rij.')
        )
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        el('div', inhoud.props, inhoud.kinderen)
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.data);
