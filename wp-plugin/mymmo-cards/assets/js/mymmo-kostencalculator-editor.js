/**
 * De kostencalculator in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Wat je hier ziet, is wat er op de pagina komt: dezelfde klassen en dezelfde
 * rekensom als render() in class-kostencalculator.php. Min en plus werken ook
 * hier, zodat je de prijzen kan nakijken voor een ander aantal kavels; het
 * aantal waarmee de pagina opent, stel je in de zijbalk in.
 *
 * De tekst naast de calculator zijn gewone blokken (kop, alinea, knoppen).
 *
 * De gesloten lijsten (opvullingen, de lettergroottes van het thema) en het
 * bereik van de teller komen uit class-kostencalculator.php via
 * window.MymmoKostencalculator -- er staat hier geen tweede kopie van.
 */

(function (blocks, element, blockEditor, components) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components) {
    return;
  }

  var el = element.createElement;
  var useState = element.useState;
  var K = window.MymmoKostencalculator || { opvullingen: [], vlakken: [], groottes: [], min: 2, max: 200 };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var useBlockProps = blockEditor.useBlockProps;
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps || blockEditor.__experimentalUseInnerBlocksProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var TextControl = components.TextControl;
  var ColorPalette = components.ColorPalette;
  var BaseControl = components.BaseControl;

  var BLOK = 'mymmo/kostencalculator';

  // ───────────────────────────────────────────────────────────────────────────
  // Gereedschap (zelfde als in mymmo-getuigenissen-editor.js)
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

  function slugs(lijst) {
    return (lijst || []).map(function (rij) { return rij.slug; });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // De rekensom (zelfde als class-kostencalculator.php en mymmo-kostencalculator.js)
  // ───────────────────────────────────────────────────────────────────────────

  function bedrag(waarde) {
    var g = parseFloat(waarde);
    if (isNaN(g)) {
      return 0;
    }
    return Math.round(Math.max(0, Math.min(100000, g)) * 100) / 100;
  }

  function binnen(aantal) {
    var g = parseInt(aantal, 10);
    if (isNaN(g)) {
      g = K.min;
    }
    return Math.max(K.min, Math.min(K.max, g));
  }

  function euro(cent, altijd) {
    var decimalen = (altijd || cent % 100 !== 0) ? 2 : 0;
    var tekst = (cent / 100).toFixed(decimalen).split('.');
    tekst[0] = tekst[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return tekst.join(',');
  }

  /** Zelfde klassen als totaal_klassen() in class-kostencalculator.php. */
  function totaalKlassen(a) {
    var klassen = ['mymmo-kosten-groot'];
    var groottes = slugs(K.groottes);
    var grootte = groottes.indexOf(a.totaalGrootte) !== -1 ? a.totaalGrootte : groottes[groottes.length - 1];
    if (grootte) {
      klassen.push('has-' + grootte + '-font-size');
    }
    return klassen.join(' ');
  }

  var TEKST_SJABLOON = [
    ['core/heading', { level: 2, placeholder: 'Kop naast de calculator' }],
    ['core/paragraph', { placeholder: 'Wat de bezoeker moet weten voor die het aantal kavels instelt.' }],
    ['core/buttons', {}, [['core/button', { placeholder: 'Knop' }]]]
  ];

  blocks.registerBlockType(BLOK, {
    apiVersion: 2,
    title: 'Kostencalculator',
    description: 'Wat het pakket per jaar kost voor een gebouw: de bezoeker stelt het aantal kavels in.',
    category: 'mymmo',
    icon: 'calculator',
    keywords: ['calculator', 'kosten', 'prijs', 'kavels', 'bankkosten', 'rekenmodule', 'price', 'pricing', 'cost'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    attributes: {
      align: { type: 'string', default: 'wide' },
      pakket: { type: 'string', default: 'OpenVME Basic' },
      prijsPerKavel: { type: 'number', default: 4 },
      vast: { type: 'string', default: 'Mollie · werk- en reserverekening' },
      prijsVast: { type: 'number', default: 9 },
      kavels: { type: 'number', default: 4 },
      totaalGrootte: { type: 'string', default: '' },
      vlak: { type: 'string', default: 'grijs' },
      achtergrond: { type: 'string', default: '' },
      opvulling: { type: 'string', default: 'normaal' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      // Het aantal in de editor zelf; null = het aantal uit de zijbalk.
      var staat = useState(null);
      var aantal = binnen(staat[0] === null ? a.kavels : staat[0]);
      var zetAantal = staat[1];

      var prijs = Math.round(bedrag(a.prijsPerKavel) * 100);
      var vast = Math.round(bedrag(a.prijsVast) * 100);
      var maand = prijs * aantal + vast;
      var jaar = maand * 12;

      var blockProps = useBlockProps({
        className: 'mymmo-kosten mymmo-kosten--met-tekst mymmo-kosten--pad-' + (a.opvulling || 'normaal')
          + ' mymmo-kosten--vlak-' + (a.vlak === 'wit' ? 'wit' : 'grijs'),
        style: { '--mk-kosten-bg': kleurCss(a.achtergrond) }
      });

      var tekst = binnenProps({ className: 'mymmo-kosten-tekst' }, {
        allowedBlocks: ['core/heading', 'core/paragraph', 'core/list', 'core/buttons'],
        template: TEKST_SJABLOON,
        templateLock: false
      });

      function knop(stap, label, uit) {
        return el('button', {
          type: 'button',
          className: 'mymmo-kosten-knop mymmo-kosten-knop--' + (stap < 0 ? 'min' : 'plus'),
          'aria-label': label,
          disabled: uit,
          onClick: function () { zetAantal(binnen(aantal + stap)); }
        });
      }

      var vak = el(
        'div',
        { className: 'mymmo-kosten-vak' },
        el(
          'div',
          { className: 'mymmo-kosten-rij mymmo-kosten-rij--teller' },
          el('span', { className: 'mymmo-kosten-label' }, el('strong', {}, 'Aantal kavels')),
          el(
            'div',
            { className: 'mymmo-kosten-teller', role: 'group', 'aria-label': 'Aantal kavels' },
            knop(-1, 'Eén kavel minder', aantal <= K.min),
            el('span', { className: 'mymmo-kosten-aantal' }, String(aantal)),
            knop(1, 'Eén kavel meer', aantal >= K.max)
          )
        ),
        el(
          'div',
          { className: 'mymmo-kosten-rij' },
          el('span', {}, (a.pakket ? a.pakket + ' · ' : '') + aantal + ' × €' + euro(prijs, false) + ' / maand'),
          el('span', { className: 'mymmo-kosten-bedrag' }, '€' + euro(prijs * aantal, false) + ' / maand')
        ),
        el(
          'div',
          { className: 'mymmo-kosten-rij' },
          el('span', {}, a.vast || ''),
          el('span', { className: 'mymmo-kosten-bedrag' }, '€' + euro(vast, false) + ' / maand')
        ),
        el(
          'div',
          { className: 'mymmo-kosten-totaal' },
          el(
            'p',
            { className: 'mymmo-kosten-jaar' },
            el('strong', { className: totaalKlassen(a) }, '€' + euro(jaar, false)),
            ' per jaar voor het gebouw'
          ),
          el(
            'p',
            { className: 'mymmo-kosten-noot' },
            '€' + euro(maand, false) + ' per maand · €' + euro(Math.round(jaar / aantal), true) + ' per kavel per jaar'
          )
        )
      );

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Prijzen', initialOpen: true },
          el(TextControl, {
            label: 'Naam van het pakket',
            value: a.pakket,
            onChange: function (w) { zet({ pakket: w }); },
            __nextHasNoMarginBottom: true
          }),
          el(TextControl, {
            label: 'Prijs per kavel per maand (€)',
            type: 'number',
            min: 0,
            step: 0.01,
            value: a.prijsPerKavel,
            onChange: function (w) { zet({ prijsPerKavel: bedrag(w) }); },
            __nextHasNoMarginBottom: true
          }),
          el(TextControl, {
            label: 'Vaste kost',
            help: 'Wat per gebouw betaald wordt, los van het aantal kavels.',
            value: a.vast,
            onChange: function (w) { zet({ vast: w }); },
            __nextHasNoMarginBottom: true
          }),
          el(TextControl, {
            label: 'Vaste kost per maand (€)',
            type: 'number',
            min: 0,
            step: 0.01,
            value: a.prijsVast,
            onChange: function (w) { zet({ prijsVast: bedrag(w) }); },
            __nextHasNoMarginBottom: true
          }),
          el(TextControl, {
            label: 'Aantal kavels bij het openen',
            help: 'Van ' + K.min + ' tot ' + K.max + '. De bezoeker past het aan met min en plus.',
            type: 'number',
            min: K.min,
            max: K.max,
            step: 1,
            value: a.kavels,
            onChange: function (w) {
              zet({ kavels: binnen(w) });
              zetAantal(null);
            },
            __nextHasNoMarginBottom: true
          })
        ),
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: false },
          K.groottes && K.groottes.length
            ? el(SelectControl, {
                label: 'Grootte van het totaal',
                value: a.totaalGrootte,
                options: [{ label: 'De grootste van het thema', value: '' }].concat(K.groottes.map(function (rij) {
                  return { label: rij.name, value: rij.slug };
                })),
                onChange: function (w) { zet({ totaalGrootte: w }); },
                __nextHasNoMarginBottom: true
              })
            : null,
          el(SelectControl, {
            label: 'Achtergrond van de calculator',
            value: a.vlak,
            options: K.vlakken,
            onChange: function (w) { zet({ vlak: w, achtergrond: '' }); },
            __nextHasNoMarginBottom: true
          }),
          el(
            BaseControl,
            { label: 'Of een kleur uit het palet', help: 'Een kleur hier gaat voor op grijs of wit. Wissen = terug naar grijs of wit.', __nextHasNoMarginBottom: true },
            el(ColorPalette, {
              colors: palet,
              value: naarHex(palet, a.achtergrond),
              disableCustomColors: true,
              onChange: function (hex) { zet({ achtergrond: hex ? naarSlug(palet, hex) : '' }); }
            })
          ),
          el(SelectControl, {
            label: 'Opvulling',
            value: a.opvulling,
            options: K.opvullingen,
            onChange: function (w) { zet({ opvulling: w }); },
            __nextHasNoMarginBottom: true
          })
        )
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        el('div', tekst.props, tekst.kinderen),
        vak
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components);
