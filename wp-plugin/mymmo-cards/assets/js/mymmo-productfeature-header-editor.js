/**
 * De productfeature-header in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Anders dan het blok Productfeature tekent deze editor de header ZELF (met
 * dezelfde klassen en variabelen als render() in class-productfeature-header.php):
 * de knoppen zijn gewone blokken IN de header, en die kan een voorbeeld van de
 * server niet bewerkbaar tonen. De tekst komt van de site
 * (GET /wp-json/mymmo-cards/v1/productfeature/<id>), dus exact wat de pagina
 * ook toont; aanpassen gebeurt in de Operations Manager.
 *
 * De gesloten lijsten komen uit PHP via window.MymmoProductfeatureHeader.
 */

(function (blocks, element, blockEditor, components, apiFetch) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !apiFetch) {
    return;
  }

  var el = element.createElement;
  var useState = element.useState;
  var useEffect = element.useEffect;
  var H = window.MymmoProductfeatureHeader || { indelingen: [], kanten: [], koppen: [], vormen: [], om: '' };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var BlockControls = blockEditor.BlockControls;
  var useBlockProps = blockEditor.useBlockProps;
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps || blockEditor.__experimentalUseInnerBlocksProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var Placeholder = components.Placeholder;
  var Button = components.Button;
  var Notice = components.Notice;
  var Spinner = components.Spinner;
  var ColorPalette = components.ColorPalette;
  var BaseControl = components.BaseControl;
  var ToolbarGroup = components.ToolbarGroup;
  var ToolbarButton = components.ToolbarButton;
  var ExternalLink = components.ExternalLink;

  var BLOK = 'mymmo/productfeature-header';

  var KNOPPEN_SJABLOON = [
    ['core/buttons', {}, [['core/button', { placeholder: 'Bv. Vraag een demo' }]]]
  ];

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

  // ───────────────────────────────────────────────────────────────────────────
  // Gegevens van de site: de keuzelijst, de feature, de swirls
  // ───────────────────────────────────────────────────────────────────────────

  var beloften = {};

  function haal(pad, ververs) {
    if (!beloften[pad] || ververs) {
      beloften[pad] = apiFetch({ path: pad + (ververs ? (pad.indexOf('?') === -1 ? '?' : '&') + 'ververs=1' : '') })
        .catch(function (err) { return { fout: (err && (err.fout || err.message)) || 'Kon niet geladen worden.' }; });
    }
    return beloften[pad];
  }

  function useGegevens(pad) {
    var st = useState(null);
    useEffect(function () {
      var actief = true;
      st[1](null);
      if (pad) {
        haal(pad, false).then(function (d) { if (actief) { st[1](d); } });
      }
      return function () { actief = false; };
    }, [pad]);
    return [st[0], function () {
      st[1](null);
      haal(pad, true).then(st[1]);
    }];
  }

  function featureKiezer(lijst, ververs, waarde, zet) {
    if (!lijst) {
      return el('div', { style: { padding: '8px 0' } }, el(Spinner));
    }
    var opties = [{ value: '', label: '— Kies een feature —' }].concat((lijst.features || []).map(function (f) {
      return { value: f.id, label: f.name + (f.category_label ? ' · ' + f.category_label : '') };
    }));
    return el(
      'div',
      {},
      lijst.fout ? el(Notice, { status: 'warning', isDismissible: false }, lijst.fout) : null,
      !lijst.fout && !(lijst.features || []).length
        ? el(Notice, { status: 'info', isDismissible: false }, 'Er is nog geen enkele feature naar de sites gestuurd. Open een feature in de Operations Manager (Productfeatures), klik op Naar de sites sturen en daarna hier op Lijst vernieuwen.')
        : null,
      el(SelectControl, {
        label: 'Productfeature',
        help: 'Label, header, korte uitleg en beeld komen uit de Operations Manager. De knoppen zet je zelf in het blok.',
        value: waarde,
        options: opties,
        onChange: zet,
        __nextHasNoMarginBottom: true
      }),
      el(
        'div',
        { style: { display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' } },
        el(Button, { variant: 'secondary', size: 'small', onClick: ververs }, 'Lijst vernieuwen'),
        H.om ? el(ExternalLink, { href: H.om }, 'Aanpassen in de OM') : null
      )
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Het blok
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType(BLOK, {
    apiVersion: 2,
    title: 'Productfeature-header',
    description: 'De header van een pagina uit een feature van de Operations Manager: kop, uitleg, beeld en je eigen knoppen.',
    category: 'mymmo',
    icon: 'cover-image',
    keywords: ['productfeature', 'header', 'hero', 'kop', 'feature', 'banner'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    attributes: {
      align: { type: 'string', default: 'wide' },
      featureId: { type: 'string', default: '' },
      indeling: { type: 'string', default: 'naast' },
      kant: { type: 'string', default: 'rechts' },
      kop: { type: 'string', default: 'h1' },
      vorm: { type: 'string', default: '' },
      toonLabel: { type: 'boolean', default: true },
      toonKort: { type: 'boolean', default: true },
      toonBeeld: { type: 'boolean', default: true },
      achtergrond: { type: 'string', default: '' },
      swirl: { type: 'string', default: '' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();
      var l = useGegevens('/mymmo-cards/v1/productfeatures');
      var fData = useGegevens(a.featureId ? '/mymmo-cards/v1/productfeature/' + a.featureId : '');
      var sw = useGegevens(a.indeling === 'vlak' ? '/mymmo-cards/v1/swirls' : '');
      var f = fData[0];
      var kiezen = function (w) { zet({ featureId: w }); };

      // Dezelfde regels als render() in PHP.
      var beeldSrc = '';
      if (f && !f.fout && a.toonBeeld) {
        var varianten = f.beelden || {};
        beeldSrc = (a.vorm && varianten[a.vorm]) ? varianten[a.vorm] : (f.image_url || '');
      }
      var titel = f && !f.fout ? (String(f.header || '').trim() || f.name || '') : '';

      var klassen = 'mymmo-pfh mymmo-pfh--' + (a.indeling || 'naast') + ' mymmo-pfh--beeld-' + (a.kant || 'rechts')
        + (beeldSrc ? ' mymmo-pfh--met-beeld' : ' mymmo-pfh--zonder-beeld');
      var stijl = {};
      if (a.indeling === 'vlak') {
        stijl['--mk-pfh-bg'] = kleurCss(a.achtergrond);
        if (a.swirl) {
          stijl['--mk-pfh-swirl'] = 'url(' + a.swirl + ')';
        }
      }
      var blockProps = useBlockProps(a.featureId && f && !f.fout ? { className: klassen, style: stijl } : {});

      var knoppen = binnenProps({ className: 'mymmo-pfh-extra' }, {
        allowedBlocks: ['core/buttons', 'core/paragraph'],
        template: KNOPPEN_SJABLOON
      });

      if (!a.featureId) {
        return el('div', blockProps, el(
          Placeholder,
          { icon: 'cover-image', label: 'Productfeature-header', instructions: 'Kies welke feature uit de Operations Manager deze header toont. De tekst pas je daar aan; de knoppen zet je hier.' },
          el('div', { style: { width: '100%', maxWidth: '420px' } }, featureKiezer(l[0], l[1], a.featureId, kiezen))
        ));
      }

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Header', initialOpen: true },
          featureKiezer(l[0], l[1], a.featureId, kiezen),
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Indeling',
            value: a.indeling,
            options: H.indelingen,
            onChange: function (w) { zet({ indeling: w }); },
            __nextHasNoMarginBottom: true
          }),
          a.indeling !== 'gecentreerd' ? el('div', { style: { height: '16px' } }) : null,
          a.indeling !== 'gecentreerd' ? el(SelectControl, {
            label: 'Beeld',
            value: a.kant,
            options: H.kanten,
            onChange: function (w) { zet({ kant: w }); },
            help: 'Op een telefoon staat het beeld altijd onder de tekst.',
            __nextHasNoMarginBottom: true
          }) : null,
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Kop',
            value: a.kop,
            options: H.koppen,
            onChange: function (w) { zet({ kop: w }); },
            help: 'Een pagina heeft een kop 1. Kies kop 2 als het thema er al een zet.',
            __nextHasNoMarginBottom: true
          })
        ),
        el(
          PanelBody,
          { title: 'Wat je toont', initialOpen: false },
          el(ToggleControl, { label: 'Label (boven de kop)', checked: Boolean(a.toonLabel), onChange: function (w) { zet({ toonLabel: w }); }, __nextHasNoMarginBottom: true }),
          el(ToggleControl, { label: 'Korte uitleg', checked: Boolean(a.toonKort), onChange: function (w) { zet({ toonKort: w }); }, __nextHasNoMarginBottom: true }),
          el(ToggleControl, { label: 'Beeld', checked: Boolean(a.toonBeeld), onChange: function (w) { zet({ toonBeeld: w }); }, __nextHasNoMarginBottom: true }),
          el(SelectControl, {
            label: 'Vorm van het beeld',
            value: a.vorm,
            options: H.vormen,
            onChange: function (w) { zet({ vorm: w }); },
            help: 'Een andere vorm bestaat enkel als het beeld in de Operations Manager opgemaakt is.',
            __nextHasNoMarginBottom: true
          })
        ),
        a.indeling === 'vlak' ? el(
          PanelBody,
          { title: 'Vlak', initialOpen: false },
          el(
            BaseControl,
            { label: 'Kleur van het vlak', help: 'Leeg = het vlak van de huisstijl.', __nextHasNoMarginBottom: true },
            el(ColorPalette, {
              colors: palet,
              value: naarHex(palet, a.achtergrond),
              disableCustomColors: true,
              onChange: function (hex) { zet({ achtergrond: hex ? naarSlug(palet, hex) : '' }); }
            })
          ),
          !sw[0] ? el(Spinner) : el(SelectControl, {
            label: 'Swirl',
            value: a.swirl,
            options: [{ value: '', label: 'Geen' }].concat((Array.isArray(sw[0]) ? sw[0] : []).map(function (s) { return { value: s.url, label: s.label }; })),
            onChange: function (w) { zet({ swirl: w }); },
            help: 'De swirls uit de Asset Manager (brand/swirls). De kleur zit in het bestand.',
            __nextHasNoMarginBottom: true
          })
        ) : null
      );

      var werkbalk = a.indeling !== 'gecentreerd' ? el(
        BlockControls,
        {},
        el(ToolbarGroup, {}, el(ToolbarButton, {
          icon: 'image-flip-horizontal',
          label: a.kant === 'links' ? 'Beeld naar rechts' : 'Beeld naar links',
          onClick: function () { zet({ kant: a.kant === 'links' ? 'rechts' : 'links' }); }
        }))
      ) : null;

      if (!f) {
        return el('div', blockProps, zijbalk, el(Spinner));
      }
      if (f.fout) {
        return el('div', blockProps, zijbalk, el('div', { className: 'mymmo-pf-melding' }, el('p', {}, f.fout)));
      }

      var tekst = [];
      if (a.toonLabel && f.eyebrow) {
        tekst.push(el('p', { key: 'l', className: 'mymmo-pfh-label has-small-font-size' }, f.eyebrow));
      }
      if (titel) {
        tekst.push(el(a.kop === 'h2' ? 'h2' : 'h1', { key: 't', className: 'wp-block-heading mymmo-pfh-titel' }, titel));
      }
      if (a.toonKort && f.summary) {
        String(f.summary).trim().split(/\n{2,}/).forEach(function (alinea, i) {
          if (alinea.trim()) {
            tekst.push(el('p', { key: 'k' + i, className: 'mymmo-pfh-kort' }, alinea.trim()));
          }
        });
      }
      tekst.push(el('div', Object.assign({ key: 'x' }, knoppen.props), knoppen.kinderen));

      return el(
        'div',
        blockProps,
        zijbalk,
        werkbalk,
        a.indeling === 'vlak' && a.swirl ? el('span', { className: 'mymmo-pfh-swirl', 'aria-hidden': 'true' }) : null,
        el('div', { className: 'mymmo-pfh-tekst' }, tekst),
        beeldSrc ? el('div', { className: 'mymmo-pfh-beeld' }, el('img', { className: 'mymmo-pfh-img', src: beeldSrc, alt: '' })) : null
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.apiFetch);
