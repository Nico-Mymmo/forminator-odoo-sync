/**
 * De stappen in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * IN DE EDITOR STAAN DE STAPPEN ALTIJD ONDER ELKAAR. Het openschuiven naast
 * elkaar is gedrag op de pagina (mymmo-stappen.js): een paneel dat dichtklapt
 * terwijl je erin typt, is niet te bewerken. De zijbalk zegt dat erbij.
 *
 * De inhoud van een stap zijn gewone blokken (kop, alinea, lijst, knoppen,
 * kolommen, video). Het nummer zet de plugin zelf; dat typ je niet.
 *
 * De gesloten lijsten (opvullingen, de lettergroottes en lettertypes van het
 * thema) komen uit class-stappen.php via window.MymmoStappen -- er staat hier
 * geen tweede kopie van.
 */

(function (blocks, element, blockEditor, components, data) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !data) {
    return;
  }

  var el = element.createElement;
  var S = window.MymmoStappen || { opvullingen: [], groottes: [], lettertypes: [] };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var useBlockProps = blockEditor.useBlockProps;
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps || blockEditor.__experimentalUseInnerBlocksProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var RangeControl = components.RangeControl;
  var ColorPalette = components.ColorPalette;
  var BaseControl = components.BaseControl;

  var useSelect = data.useSelect;

  var REEKS = 'mymmo/stappen';
  var STAP = 'mymmo/stap';

  // ───────────────────────────────────────────────────────────────────────────
  // Gereedschap (zelfde als in mymmo-keien-editor.js)
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

  function slugs(lijst) {
    return (lijst || []).map(function (rij) { return rij.slug; });
  }

  /** Dezelfde klassen als nummer_klassen() in class-stappen.php. */
  function nummerKlassen(a) {
    var klassen = ['mymmo-stap-nummer'];
    var groottes = slugs(S.groottes);
    var grootte = groottes.indexOf(a.nummerGrootte) !== -1 ? a.nummerGrootte : groottes[groottes.length - 1];
    if (grootte) {
      klassen.push('has-' + grootte + '-font-size');
    }
    if (a.nummerLetter && slugs(S.lettertypes).indexOf(a.nummerLetter) !== -1) {
      klassen.push('has-' + a.nummerLetter + '-font-family');
    }
    return klassen.join(' ');
  }

  function keuzes(lijst, leeg) {
    return [{ label: leeg, value: '' }].concat((lijst || []).map(function (rij) {
      return { label: rij.name, value: rij.slug };
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // De reeks
  // ───────────────────────────────────────────────────────────────────────────

  var STAP_SJABLOON = [
    ['core/heading', { level: 3, placeholder: 'Titel van de stap' }],
    ['core/paragraph', { placeholder: 'Wat er in deze stap gebeurt.' }]
  ];

  blocks.registerBlockType(REEKS, {
    apiVersion: 2,
    title: 'Stappen',
    description: 'Een genummerde reeks stappen die op een computer een voor een openschuiven terwijl je scrolt.',
    category: 'mymmo',
    icon: 'editor-ol',
    keywords: ['stappen', 'werkwijze', 'stappenplan', 'proces', 'steps', 'process', 'timeline'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    attributes: {
      align: { type: 'string', default: 'wide' },
      achtergrond: { type: 'string', default: '' },
      opvulling: { type: 'string', default: 'normaal' },
      nummerKleur: { type: 'string', default: '' },
      nummerGrootte: { type: 'string', default: '' },
      nummerLetter: { type: 'string', default: '' },
      horizontaal: { type: 'boolean', default: true },
      boven: { type: 'number', default: 96 },
      scroll: { type: 'number', default: 55 }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      var klassen = ['mymmo-stappen', 'mymmo-stappen--pad-' + (a.opvulling || 'normaal')];
      if (a.nummerKleur) {
        klassen.push('mymmo-stappen--nummer-kleur');
      }

      var blockProps = useBlockProps({
        className: klassen.join(' '),
        style: {
          '--mk-stappen-bg': kleurCss(a.achtergrond),
          '--mk-nummer-kleur': kleurCss(a.nummerKleur)
        }
      });

      var rij = binnenProps({ className: 'mymmo-stappen-rij' }, {
        allowedBlocks: [STAP],
        template: [[STAP], [STAP], [STAP]],
        orientation: 'vertical',
        renderAppender: InnerBlocks.ButtonBlockAppender
      });

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Indeling', initialOpen: true },
          el(ToggleControl, {
            label: 'Op een computer naast elkaar openschuiven',
            checked: !!a.horizontaal,
            help: a.horizontaal
              ? 'Vanaf 782px breed staan de stappen als panelen naast elkaar, en terwijl je scrolt opent de ene na de andere. Past een stap niet in het scherm, dan blijven ze onder elkaar staan. Hier in de editor staan ze altijd onder elkaar.'
              : 'De stappen staan overal onder elkaar.',
            onChange: function (w) { zet({ horizontaal: w }); },
            __nextHasNoMarginBottom: true
          }),
          a.horizontaal
            ? el(RangeControl, {
                label: 'Ruimte voor de vaste kop bovenaan (px)',
                help: 'Zo hoog als de vaste kop van de site, zodat de panelen er niet onder schuiven.',
                value: a.boven,
                min: 0,
                max: 240,
                onChange: function (w) { zet({ boven: w === undefined ? 96 : w }); },
                __nextHasNoMarginBottom: true
              })
            : null
        ),
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: false },
          kleurkiezer('Achtergrond van de stappen', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); },
            'Leeg = het vlak van de huisstijl. Een stap kan zelf een andere kleur krijgen.'),
          el(SelectControl, {
            label: 'Opvulling',
            value: a.opvulling,
            options: S.opvullingen,
            onChange: function (w) { zet({ opvulling: w }); },
            __nextHasNoMarginBottom: true
          }),
          kleurkiezer('Kleur van het nummer', palet, a.nummerKleur, function (w) { zet({ nummerKleur: w }); },
            'Leeg = de tekstkleur, zacht. Ook de vinkjes in een lijst krijgen deze kleur.'),
          el(SelectControl, {
            label: 'Grootte van het nummer',
            value: a.nummerGrootte,
            options: keuzes(S.groottes, 'De grootste van het thema'),
            onChange: function (w) { zet({ nummerGrootte: w }); },
            __nextHasNoMarginBottom: true
          }),
          S.lettertypes && S.lettertypes.length
            ? el(SelectControl, {
                label: 'Lettertype van het nummer',
                value: a.nummerLetter,
                options: keuzes(S.lettertypes, 'Zoals de tekst'),
                onChange: function (w) { zet({ nummerLetter: w }); },
                __nextHasNoMarginBottom: true
              })
            : null
        ),
        a.horizontaal
          ? el(
              PanelBody,
              { title: 'Beweging', initialOpen: false },
              el(RangeControl, {
                label: 'Scrollen per stap (% van de schermhoogte)',
                help: 'Hoe ver je scrolt voor de volgende stap opent. Wie beweging uitzet, krijgt geen animatie.',
                value: a.scroll,
                min: 25,
                max: 120,
                onChange: function (w) { zet({ scroll: w === undefined ? 55 : w }); },
                __nextHasNoMarginBottom: true
              })
            )
          : null
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        el('div', { className: 'mymmo-stappen-baan' }, el('div', rij.props, rij.kinderen))
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Een stap
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType(STAP, {
    apiVersion: 2,
    title: 'Stap',
    description: 'Een stap in de reeks: een titel, uitleg en eventueel knoppen, een lijst of een video.',
    category: 'mymmo',
    icon: 'editor-ol',
    parent: [REEKS],
    keywords: ['stap', 'step'],
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

      var gegevens = useSelect(function (select) {
        var be = select('core/block-editor');
        var ouder = be.getBlockRootClientId(props.clientId);
        return {
          index: be.getBlockIndex(props.clientId),
          reeks: ouder ? be.getBlockAttributes(ouder) || {} : {}
        };
      }, [props.clientId]);

      var blockProps = useBlockProps({
        className: 'mymmo-stap',
        style: { '--mk-stap-bg': kleurCss(a.achtergrond) }
      });

      var inhoud = binnenProps({ className: 'mymmo-stap-inhoud' }, {
        template: STAP_SJABLOON,
        templateLock: false
      });

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: true },
          kleurkiezer('Achtergrond van deze stap', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); },
            'Leeg = de achtergrond van de reeks.')
        )
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        el('span', { className: nummerKlassen(gegevens.reeks), 'aria-hidden': 'true' }, String(gegevens.index + 1)),
        el('div', inhoud.props, inhoud.kinderen)
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.data);
