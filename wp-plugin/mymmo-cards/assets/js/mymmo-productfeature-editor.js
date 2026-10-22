/**
 * De productfeature in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Er is GEEN tweede renderer: het voorbeeld in de editor is de render van de
 * server (ServerSideRender), dus wat je hier ziet, is wat op de pagina komt.
 * De tekst pas je niet hier aan maar in de Operations Manager (Productfeatures);
 * hier kies je WELKE feature, WAT ervan getoond wordt en aan welke kant het
 * beeld staat.
 *
 * De keuzelijst komt via de site (GET /wp-json/mymmo-cards/v1/productfeatures):
 * de sitesleutel blijft op de server. De gesloten lijsten komen uit
 * class-productfeature.php via window.MymmoProductfeature.
 */

(function (blocks, element, blockEditor, components, apiFetch, serverSideRender) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !apiFetch) {
    return;
  }

  var el = element.createElement;
  var useState = element.useState;
  var useEffect = element.useEffect;
  var P = window.MymmoProductfeature || { kanten: [], koppen: [], vormen: [], om: '' };

  var InspectorControls = blockEditor.InspectorControls;
  var BlockControls = blockEditor.BlockControls;
  var useBlockProps = blockEditor.useBlockProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var TextControl = components.TextControl;
  var Placeholder = components.Placeholder;
  var Button = components.Button;
  var Notice = components.Notice;
  var Spinner = components.Spinner;
  var ToolbarGroup = components.ToolbarGroup;
  var ToolbarButton = components.ToolbarButton;
  var ExternalLink = components.ExternalLink;
  var ColorPalette = components.ColorPalette;
  var BaseControl = components.BaseControl;

  var ServerSideRender = serverSideRender && (serverSideRender.default || serverSideRender);

  var BLOK = 'mymmo/productfeature';

  function themaPaletLabel() {
    if (blockEditor.useSettings) {
      var w = blockEditor.useSettings('color.palette');
      if (w && w[0]) { return w[0]; }
    }
    if (blockEditor.useSetting) { return blockEditor.useSetting('color.palette') || []; }
    return [];
  }

  /** Zelfde klassen als label_klassen() in class-productfeature.php. */
  function labelKlassen(a) {
    var uit = [];
    if (/^[a-z0-9-]+$/.test(a.labelKleur || '')) { uit.push('has-background has-' + a.labelKleur + '-background-color'); }
    if (/^[a-z0-9-]+$/.test(a.labelTekst || '')) { uit.push('has-text-color has-' + a.labelTekst + '-color'); }
    return uit.join(' ');
  }

  function labelPaneel(a, zet, palet) {
    var kiezer = function (label, sleutel, help) {
      return el(BaseControl, { label: label, help: help, __nextHasNoMarginBottom: true },
        el(ColorPalette, {
          colors: palet,
          value: labelHex(palet, a[sleutel]),
          disableCustomColors: true,
          onChange: function (hex) { var o = {}; o[sleutel] = hex ? labelSlug(palet, hex) : ''; zet(o); }
        }));
    };
    return el(PanelBody, { title: 'Label', initialOpen: false },
      kiezer('Achtergrond van het label', 'labelKleur', 'Uit het palet van de site.'),
      kiezer('Tekst van het label', 'labelTekst', 'Kies een kleur die goed leesbaar is op de achtergrond.'));
  }

  function labelSlug(palet, hex) {
    var g = (palet || []).filter(function (k) { return String(k.color).toLowerCase() === String(hex).toLowerCase(); })[0];
    return g ? g.slug : '';
  }

  function labelHex(palet, slug) {
    var g = (palet || []).filter(function (k) { return k.slug === slug; })[0];
    return g ? g.color : '';
  }


  // ───────────────────────────────────────────────────────────────────────────
  // De keuzelijst: een keer per editor ophalen, gedeeld door alle blokken
  // ───────────────────────────────────────────────────────────────────────────

  var lijstBelofte = null;

  function haalLijst(ververs) {
    if (!lijstBelofte || ververs) {
      lijstBelofte = apiFetch({ path: '/mymmo-cards/v1/productfeatures' + (ververs ? '?ververs=1' : '') })
        .catch(function (err) {
          return { verbonden: false, features: [], fout: (err && err.message) || 'De lijst kon niet geladen worden.' };
        });
    }
    return lijstBelofte;
  }

  function useLijst() {
    var st = useState(null);
    var lijst = st[0];
    var zetLijst = st[1];
    useEffect(function () {
      var actief = true;
      haalLijst(false).then(function (d) { if (actief) { zetLijst(d); } });
      return function () { actief = false; };
    }, []);
    return [lijst, function () {
      zetLijst(null);
      haalLijst(true).then(zetLijst);
    }];
  }

  function opties(lijst) {
    var uit = [{ value: '', label: '— Kies een feature —' }];
    ((lijst && lijst.features) || []).forEach(function (f) {
      uit.push({ value: f.id, label: f.name + (f.category_label ? ' · ' + f.category_label : '') });
    });
    return uit;
  }

  function featureKiezer(lijst, ververs, waarde, zet) {
    if (!lijst) {
      return el('div', { style: { padding: '8px 0' } }, el(Spinner));
    }
    var stukken = [];
    if (lijst.fout) {
      stukken.push(el(Notice, { status: 'warning', isDismissible: false }, lijst.fout));
    } else if (!(lijst.features || []).length) {
      stukken.push(el(Notice, { status: 'info', isDismissible: false },
        'Er is nog geen enkele feature naar de sites gestuurd. Open een feature in de Operations Manager (Productfeatures), klik op Naar de sites sturen en daarna hier op Lijst vernieuwen.'));
    }
    stukken.push(el(SelectControl, {
      label: 'Productfeature',
      help: 'Enkel features die in de Operations Manager naar de sites gestuurd zijn. Staat de jouwe er niet bij? Open ze daar en klik op Naar de sites sturen.',
      value: waarde,
      options: opties(lijst),
      onChange: zet,
      __nextHasNoMarginBottom: true
    }));
    stukken.push(el(
      'div',
      { style: { display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' } },
      el(Button, { variant: 'secondary', size: 'small', onClick: ververs }, 'Lijst vernieuwen'),
      P.om ? el(ExternalLink, { href: P.om }, 'Aanpassen in de OM') : null
    ));
    return el('div', {}, stukken);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Het blok
  // ───────────────────────────────────────────────────────────────────────────

  var TOON = [
    ['toonBeeld', 'Beeld'],
    ['toonLabel', 'Label (boven de titel)'],
    ['toonTitel', 'Header (de titel op de website)'],
    ['toonKort', 'Korte uitleg'],
    ['toonWaarom', 'Waarom we dit gemaakt hebben'],
    ['toonUsps', 'USP\'s (als opsomming)'],
    ['toonKnop', 'Knop naar meer uitleg']
  ];

  blocks.registerBlockType(BLOK, {
    apiVersion: 2,
    title: 'Productfeature',
    description: 'Een feature uit de bibliotheek van de Operations Manager: beeld naast titel, uitleg en USP\'s.',
    category: 'mymmo',
    icon: 'screenoptions',
    keywords: ['productfeature', 'feature', 'functionaliteit', 'usp', 'beeld en tekst', 'product'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    attributes: {
      align: { type: 'string', default: 'wide' },
      featureId: { type: 'string', default: '' },
      kant: { type: 'string', default: 'links' },
      kop: { type: 'string', default: 'h2' },
      vorm: { type: 'string', default: '' },
      toonBeeld: { type: 'boolean', default: true },
      toonLabel: { type: 'boolean', default: false },
      toonTitel: { type: 'boolean', default: true },
      toonKort: { type: 'boolean', default: true },
      toonWaarom: { type: 'boolean', default: false },
      toonUsps: { type: 'boolean', default: true },
      toonKnop: { type: 'boolean', default: false },
      knopTekst: { type: 'string', default: '' },
      labelKleur: { type: 'string', default: '' },
      labelTekst: { type: 'string', default: '' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var l = useLijst();
      var lijst = l[0];
      var ververs = l[1];
      var blockProps = useBlockProps();
      var palet = themaPaletLabel();

      var kiezen = function (w) { zet({ featureId: w }); };

      if (!a.featureId) {
        return el('div', blockProps, el(
          Placeholder,
          { icon: 'screenoptions', label: 'Productfeature', instructions: 'Kies welke feature uit de Operations Manager hier staat. De tekst pas je daar aan, niet hier.' },
          el('div', { style: { width: '100%', maxWidth: '420px' } }, featureKiezer(lijst, ververs, a.featureId, kiezen))
        ));
      }

      var werkbalk = el(
        BlockControls,
        {},
        el(ToolbarGroup, {}, el(ToolbarButton, {
          icon: 'image-flip-horizontal',
          label: a.kant === 'rechts' ? 'Beeld naar links' : 'Beeld naar rechts',
          onClick: function () { zet({ kant: a.kant === 'rechts' ? 'links' : 'rechts' }); }
        }))
      );

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Feature', initialOpen: true },
          featureKiezer(lijst, ververs, a.featureId, kiezen),
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Beeld',
            value: a.kant,
            options: P.kanten,
            onChange: function (w) { zet({ kant: w }); },
            help: 'Op een telefoon staat het beeld altijd bovenaan.',
            __nextHasNoMarginBottom: true
          }),
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Titel als',
            value: a.kop,
            options: P.koppen,
            onChange: function (w) { zet({ kop: w }); },
            help: 'Kop 2 voor een feature op zichzelf, Kop 3 onder een tussentitel.',
            __nextHasNoMarginBottom: true
          })
        ),
        el(
          PanelBody,
          { title: 'Wat je toont', initialOpen: false },
          TOON.map(function (t) {
            return el(ToggleControl, {
              key: t[0],
              label: t[1],
              checked: Boolean(a[t[0]]),
              onChange: function (w) { var o = {}; o[t[0]] = w; zet(o); },
              __nextHasNoMarginBottom: true
            });
          }),
          a.toonKnop ? el(TextControl, {
            label: 'Tekst op de knop',
            value: a.knopTekst,
            placeholder: 'Meer lezen',
            help: 'De link komt uit de Operations Manager. Zonder link daar staat er geen knop.',
            onChange: function (w) { zet({ knopTekst: w }); },
            __nextHasNoMarginBottom: true
          }) : null
        ),
        a.toonLabel ? labelPaneel(a, zet, palet) : null,
        el(
          PanelBody,
          { title: 'Vorm van het beeld', initialOpen: false },
          el(SelectControl, {
            label: 'Vorm',
            value: a.vorm,
            options: P.vormen,
            onChange: function (w) { zet({ vorm: w }); },
            help: 'Een andere vorm bestaat enkel als het beeld in de Operations Manager opgemaakt is. Anders blijft het zoals daar.',
            __nextHasNoMarginBottom: true
          })
        )
      );

      return el(
        'div',
        blockProps,
        werkbalk,
        zijbalk,
        ServerSideRender
          ? el(ServerSideRender, { block: BLOK, attributes: a, httpMethod: 'POST' })
          : el('p', {}, 'Het voorbeeld kan hier niet getoond worden.')
      );
    },

    save: function () {
      return null;
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.apiFetch, window.wp && window.wp.serverSideRender);
