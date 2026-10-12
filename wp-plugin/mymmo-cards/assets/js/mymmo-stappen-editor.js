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
 * thema) komen uit class-stappen.php via window.MymmoWerkstappen -- er staat hier
 * geen tweede kopie van.
 */

(function (blocks, element, blockEditor, components, data) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !data) {
    return;
  }

  var el = element.createElement;
  var S = window.MymmoWerkstappen || { opvullingen: [], groottes: [], lettertypes: [] };

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
  var TextControl = components.TextControl;
  var Button = components.Button;
  var MediaUpload = blockEditor.MediaUpload;
  var MediaUploadCheck = blockEditor.MediaUploadCheck;

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
    var klassen = ['mymmo-werkstap-nummer'];
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
      scroll: { type: 'number', default: 55 },
      hoogte: { type: 'number', default: 640 }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      var klassen = ['mymmo-werkstappen', 'mymmo-werkstappen--pad-' + (a.opvulling || 'normaal')];
      if (a.nummerKleur) {
        klassen.push('mymmo-werkstappen--nummer-kleur');
      }

      var blockProps = useBlockProps({
        className: klassen.join(' '),
        style: {
          '--mk-stappen-bg': kleurCss(a.achtergrond),
          '--mk-nummer-kleur': kleurCss(a.nummerKleur)
        }
      });

      var rij = binnenProps({ className: 'mymmo-werkstappen-rij' }, {
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
              ? 'Vanaf 782px breed staan de stappen als panelen naast elkaar, en terwijl je scrolt opent de ene na de andere. De panelen zijn altijd even hoog: een stap met veel inhoud wordt iets kleiner getoond. Hier in de editor staan ze altijd onder elkaar.'
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
            : null,
          a.horizontaal
            ? el(RangeControl, {
                label: 'Hoogte van de panelen (px)',
                help: 'Standaard 640: past op een gewone laptop. Op een groter scherm blijven de panelen zo hoog, zodat er geen leeg vlak onder de tekst staat. Heeft een stap meer nodig, dan worden ze hoger, tot het scherm vol is.',
                value: a.hoogte,
                min: 400,
                max: 1000,
                step: 10,
                onChange: function (w) { zet({ hoogte: w === undefined ? 640 : w }); },
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
        el('div', { className: 'mymmo-werkstappen-baan' }, el('div', rij.props, rij.kinderen))
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // De illustratie van een stap (zelfde instellingen als de vorm op een kaart)
  // ───────────────────────────────────────────────────────────────────────────

  function getal(w, terugval) {
    return w === undefined || w === null || w === '' ? terugval : Number(w);
  }

  /** Dezelfde variabelen als sier_stijl() in class-stappen.php. */
  function sierStijl(a, stand) {
    var m = stand ? '-m' : '';
    var uit = {};
    uit['--mk-sier-b' + m] = getal(a['sierBreedte' + stand], 70) / 100;
    uit['--mk-sier-x' + m] = getal(a['sierX' + stand], 50) / 100;
    uit['--mk-sier-y' + m] = getal(a['sierY' + stand], 50) + '%';
    uit['--mk-sier-draai' + m] = getal(a['sierDraai' + stand], 0) + 'deg';
    uit['--mk-sier-dekking' + m] = getal(a['sierDekking' + stand], 100) / 100;
    return uit;
  }

  function sierSchuiven(a, zet, stand, achter) {
    function schuif(label, naam, min, max, help) {
      return el(RangeControl, {
        label: label + achter,
        value: a[naam + stand],
        min: min,
        max: max,
        help: help,
        onChange: function (w) { var o = {}; o[naam + stand] = w; zet(o); },
        __nextHasNoMarginBottom: true
      });
    }
    return [
      schuif('Grootte (% van de breedte van de stap)', 'sierBreedte', 5, 1000, stand ? undefined : '100% = zo breed als de stap. De vorm houdt haar eigen verhouding.'),
      schuif('Horizontaal (%)', 'sierX', -300, 400, stand ? undefined : '50 = gecentreerd, 0 = linkerrand, 100 = rechterrand. Wat buiten de stap valt, wordt afgesneden.'),
      schuif('Verticaal (%)', 'sierY', -300, 400),
      schuif('Draaiing (graden)', 'sierDraai', -180, 180),
      schuif('Dekking (%)', 'sierDekking', 0, 100)
    ];
  }

  function sierPaneel(a, zet) {
    return el(
      PanelBody,
      { title: 'Illustratie op de achtergrond', initialOpen: false },
      el('p', { style: { margin: '0 0 8px' } },
        'Een swirl of een blob achter de inhoud van deze stap. Op een computer verschijnt ze wanneer de stap openschuift.'),
      MediaUpload && MediaUploadCheck
        ? el(MediaUploadCheck, null, el(MediaUpload, {
            allowedTypes: ['image'],
            onSelect: function (media) { zet({ sier: media && media.url ? media.url : '' }); },
            render: function (obj) {
              return el(Button, { variant: 'secondary', onClick: obj.open }, a.sier ? 'Andere illustratie kiezen' : 'Illustratie uit de mediabibliotheek');
            }
          }))
        : null,
      el(TextControl, {
        label: 'of een URL',
        value: a.sier || '',
        onChange: function (w) { zet({ sier: w }); },
        placeholder: 'https://link.openvme.be/assets/brand/…',
        help: 'Een SVG of PNG. Leeg = geen illustratie.'
      }),
      a.sier
        ? el(
            element.Fragment,
            null,
            sierSchuiven(a, zet, '', ''),
            el(ToggleControl, {
              label: 'Eigen instellingen op een telefoon',
              checked: !!a.sierMobiel,
              onChange: function (w) { zet({ sierMobiel: w }); },
              help: 'Onder 640px heeft de stap een heel andere vorm. Uit = dezelfde instellingen als op een computer.',
              __nextHasNoMarginBottom: true
            }),
            a.sierMobiel ? sierSchuiven(a, zet, 'Mobiel', ' op een telefoon') : null,
            el(Button, { variant: 'link', isDestructive: true, onClick: function () { zet({ sier: '' }); } }, 'Illustratie verwijderen')
          )
        : null
    );
  }

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
      achtergrond: { type: 'string', default: '' },
      sier: { type: 'string', default: '' },
      sierBreedte: { type: 'number', default: 70 },
      sierX: { type: 'number', default: 50 },
      sierY: { type: 'number', default: 50 },
      sierDraai: { type: 'number', default: 0 },
      sierDekking: { type: 'number', default: 100 },
      sierMobiel: { type: 'boolean', default: false },
      sierBreedteMobiel: { type: 'number', default: 70 },
      sierXMobiel: { type: 'number', default: 50 },
      sierYMobiel: { type: 'number', default: 50 },
      sierDraaiMobiel: { type: 'number', default: 0 },
      sierDekkingMobiel: { type: 'number', default: 100 }
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

      // Zelfde klassen en variabelen als render_stap() en sier_stijl().
      var klassen = ['mymmo-werkstap'];
      var stijl = { '--mk-stap-bg': kleurCss(a.achtergrond) };
      if (a.sier) {
        klassen.push('mymmo-werkstap--sier');
        Object.assign(stijl, sierStijl(a, ''));
        if (a.sierMobiel) {
          klassen.push('mymmo-werkstap--sier-m');
          Object.assign(stijl, sierStijl(a, 'Mobiel'));
        }
      }

      var blockProps = useBlockProps({
        className: klassen.join(' '),
        style: stijl
      });

      var inhoud = binnenProps({ className: 'mymmo-werkstap-inhoud' }, {
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
        ),
        sierPaneel(a, zet)
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        a.sier ? el('span', { className: 'mymmo-werkstap-sier', 'aria-hidden': 'true', style: { backgroundImage: 'url(' + a.sier + ')' } }) : null,
        el('span', { className: nummerKlassen(gegevens.reeks), 'aria-hidden': 'true' }, String(gegevens.index + 1)),
        el('div', inhoud.props, inhoud.kinderen)
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.data);
