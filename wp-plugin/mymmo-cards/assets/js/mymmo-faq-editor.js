/**
 * De veelgestelde vragen in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Een vraag is ofwel GEKOPPELD aan de bibliotheek (Veelgestelde vragen in het
 * menu links): dan staan de vraag en het antwoord daar, en toont de editor ze
 * hier enkel. Ofwel EIGEN: de vraag typ je in het blok, het antwoord zijn
 * gewone blokken. Een eigen vraag kan je met een klik in de bibliotheek
 * bewaren, een gekoppelde vraag met een klik tot eigen vraag maken.
 *
 * In de editor staan alle antwoorden open: je moet ze kunnen lezen en typen.
 * Op de pagina staat enkel de eerste open (zie render_lijst() in
 * class-faq.php).
 *
 * De gesloten lijsten (opvullingen, koppen) komen uit class-faq.php via
 * window.MymmoFaq -- er staat hier geen tweede kopie van.
 */

(function (blocks, element, blockEditor, components, data) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !data) {
    return;
  }

  var el = element.createElement;
  var useState = element.useState;
  var RawHTML = element.RawHTML;
  var F = window.MymmoFaq || { opvullingen: [], koppen: [], type: 'mymmo_faq', thema: 'mymmo_faq_thema', beheer: '', bewerk: '' };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var RichText = blockEditor.RichText;
  var useBlockProps = blockEditor.useBlockProps;
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps || blockEditor.__experimentalUseInnerBlocksProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var CheckboxControl = components.CheckboxControl;
  var ColorPalette = components.ColorPalette;
  var BaseControl = components.BaseControl;
  var Button = components.Button;
  var ExternalLink = components.ExternalLink;
  var Notice = components.Notice;
  var Spinner = components.Spinner;

  var useSelect = data.useSelect;
  var useDispatch = data.useDispatch;

  var LIJST = 'mymmo/faq';
  var VRAAG = 'mymmo/faq-vraag';

  var ANTWOORD_BLOKKEN = ['core/paragraph', 'core/list', 'core/heading', 'core/image', 'core/buttons', 'core/table'];
  var ANTWOORD_SJABLOON = [
    ['core/paragraph', { placeholder: 'Het antwoord, in twee tot vier zinnen. Begin met het antwoord zelf: ja, nee, een bedrag of een termijn.' }]
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

  /** De tag van de vraag: zelfde keuze als render_vraag() in class-faq.php. */
  function kopTag(kop) {
    return kop && kop !== 'tekst' && waarden(F.koppen).indexOf(kop) !== -1 ? kop : 'span';
  }

  /** Tekst uit wat RichText of de REST API teruggeeft. */
  function tekstVan(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '');
    return (d.textContent || '').trim();
  }

  function titelVan(vraag) {
    if (!vraag || !vraag.title) {
      return '';
    }
    return vraag.title.raw !== undefined ? vraag.title.raw : tekstVan(vraag.title.rendered);
  }

  /** Alle vragen uit de bibliotheek, in hun volgorde. */
  function useBibliotheek(thema) {
    return useSelect(function (select) {
      var query = { per_page: 100, status: 'publish', _fields: 'id,title,menu_order,' + F.thema };
      if (thema) {
        query[F.thema] = thema;
      }
      var core = select('core');
      var lijst = core.getEntityRecords('postType', F.type, query);
      return {
        vragen: lijst ? lijst.slice().sort(function (a, b) {
          return (a.menu_order || 0) - (b.menu_order || 0) || titelVan(a).localeCompare(titelVan(b));
        }) : null,
        themas: core.getEntityRecords('taxonomy', F.thema, { per_page: 100, hide_empty: false }) || []
      };
    }, [thema]);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // De lijst
  // ───────────────────────────────────────────────────────────────────────────

  function Bibliotheek(props) {
    var keuze = useState('');
    var thema = keuze[0];
    var zetThema = keuze[1];

    var bib = useBibliotheek(thema ? parseInt(thema, 10) : 0);

    var kinderen = useSelect(function (select) {
      return select('core/block-editor').getBlocks(props.clientId);
    }, [props.clientId]);

    var bewerker = useDispatch('core/block-editor');

    var gekozen = {};
    kinderen.forEach(function (b) {
      if (b.name === VRAAG && b.attributes.faqId) {
        gekozen[b.attributes.faqId] = b.clientId;
      }
    });

    /** Lege eigen vragen (zoals die van het sjabloon) maken plaats. */
    function legeVragen() {
      return kinderen.filter(function (b) {
        if (b.name !== VRAAG || b.attributes.faqId || tekstVan(b.attributes.vraag) !== '') {
          return false;
        }
        return (b.innerBlocks || []).every(function (d) {
          return d.name === 'core/paragraph' && tekstVan(d.attributes.content) === '';
        });
      }).map(function (b) { return b.clientId; });
    }

    function voegToe(ids) {
      var nieuw = ids.filter(function (id) { return !gekozen[id]; }).map(function (id) {
        return blocks.createBlock(VRAAG, { faqId: id });
      });
      if (nieuw.length === 0) {
        return;
      }
      var leeg = legeVragen();
      bewerker.insertBlocks(nieuw, kinderen.length, props.clientId, false);
      if (leeg.length) {
        bewerker.removeBlocks(leeg, false);
      }
    }

    var themaKeuzes = [{ value: '', label: "Alle thema's" }].concat(bib.themas.map(function (t) {
      return { value: String(t.id), label: tekstVan(t.name) + ' (' + t.count + ')' };
    }));

    var lijst;
    if (bib.vragen === null) {
      lijst = el(Spinner);
    } else if (bib.vragen.length === 0) {
      lijst = el('p', { className: 'mymmo-faq-hulp' }, thema ? 'Nog geen vragen in dit thema.' : 'De bibliotheek is nog leeg. Maak een vraag in het blok en klik op Bewaar in de bibliotheek, of voeg er een toe via Veelgestelde vragen in het menu links.');
    } else {
      lijst = el(
        'div',
        { className: 'mymmo-faq-keuzelijst' },
        bib.vragen.map(function (v) {
          return el(CheckboxControl, {
            key: v.id,
            label: titelVan(v),
            checked: !!gekozen[v.id],
            onChange: function (aan) {
              if (aan) {
                voegToe([v.id]);
              } else if (gekozen[v.id]) {
                bewerker.removeBlocks([gekozen[v.id]], false);
              }
            }
          });
        })
      );
    }

    var nogNiet = (bib.vragen || []).filter(function (v) { return !gekozen[v.id]; });

    return el(
      PanelBody,
      { title: 'Vragen uit de bibliotheek', initialOpen: true },
      el(SelectControl, {
        label: 'Thema',
        value: thema,
        options: themaKeuzes,
        onChange: zetThema,
        __nextHasNoMarginBottom: true
      }),
      lijst,
      thema && nogNiet.length > 0 ? el(Button, {
        variant: 'secondary',
        onClick: function () { voegToe(nogNiet.map(function (v) { return v.id; })); }
      }, 'Alle ' + nogNiet.length + ' vragen van dit thema toevoegen') : null,
      el('p', { className: 'mymmo-faq-hulp' },
        'Een aangevinkte vraag komt onderaan; versleep ze in de lijst. Een vraag uit de bibliotheek pas je op één plek aan, en ze verandert op elke pagina. ',
        F.beheer ? el(ExternalLink, { href: F.beheer }, 'Vragen beheren') : null
      )
    );
  }

  blocks.registerBlockType(LIJST, {
    apiVersion: 2,
    title: 'Veelgestelde vragen',
    description: 'Vragen die openklappen, uit de bibliotheek of eigen aan deze pagina, met de gestructureerde gegevens voor zoekmachines.',
    category: 'mymmo',
    icon: 'editor-help',
    keywords: ['faq', 'veelgestelde vragen', 'vragen', 'accordeon', 'uitklappen', 'questions', 'accordion', 'schema'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    providesContext: { 'mymmo/faq-kop': 'kop' },
    attributes: {
      align: { type: 'string', default: 'wide' },
      eersteOpen: { type: 'boolean', default: true },
      kop: { type: 'string', default: 'tekst' },
      achtergrond: { type: 'string', default: '' },
      opvulling: { type: 'string', default: 'normaal' },
      gegevens: { type: 'boolean', default: true }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      var opvulling = waarden(F.opvullingen).indexOf(a.opvulling) !== -1 ? a.opvulling : 'normaal';

      var blockProps = useBlockProps({
        className: 'mymmo-faq mymmo-faq--pad-' + opvulling,
        style: { '--mk-faq-bg': kleurCss(a.achtergrond) }
      });

      var lijst = binnenProps({ className: 'mymmo-faq-lijst' }, {
        allowedBlocks: [VRAAG],
        template: [[VRAAG], [VRAAG]],
        renderAppender: InnerBlocks.ButtonBlockAppender
      });

      var zijbalk = el(
        InspectorControls,
        {},
        el(Bibliotheek, { clientId: props.clientId }),
        el(
          PanelBody,
          { title: 'Indeling', initialOpen: false },
          el(ToggleControl, {
            label: 'Eerste vraag open',
            help: 'Op de pagina. De andere vragen klap je open door erop te klikken.',
            checked: a.eersteOpen !== false,
            onChange: function (w) { zet({ eersteOpen: w }); },
            __nextHasNoMarginBottom: true
          }),
          el(SelectControl, {
            label: 'De vragen zijn',
            help: 'Gewone tekst oogt zoals op de ontwerpen. Een kop volgt de kopstijl van het thema (groter) en maakt van elke vraag een tussentitel op de pagina. Staat er boven de vragen een Kop 2, kies dan Kop 3.',
            value: a.kop,
            options: F.koppen,
            onChange: function (w) { zet({ kop: w }); },
            __nextHasNoMarginBottom: true
          }),
          el(ToggleControl, {
            label: 'In de gegevens voor zoekmachines',
            help: 'Aan: de vragen gaan als FAQ (schema.org) mee met de pagina. Zet uit als dezelfde vragen al ergens anders op deze pagina staan.',
            checked: a.gegevens !== false,
            onChange: function (w) { zet({ gegevens: w }); },
            __nextHasNoMarginBottom: true
          })
        ),
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: false },
          kleurkiezer('Achtergrond', palet, a.achtergrond, function (w) { zet({ achtergrond: w }); },
            'Leeg = het vlak van de huisstijl.'),
          el(SelectControl, {
            label: 'Opvulling',
            value: opvulling,
            options: F.opvullingen,
            onChange: function (w) { zet({ opvulling: w }); },
            __nextHasNoMarginBottom: true
          })
        )
      );

      return el(
        'div',
        blockProps,
        zijbalk,
        el('div', lijst.props, lijst.kinderen)
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Een vraag
  // ───────────────────────────────────────────────────────────────────────────

  /** Een vraag uit de bibliotheek: hier enkel te lezen. */
  function Gekoppeld(props) {
    var a = props.attributes;
    var tag = kopTag(props.context['mymmo/faq-kop']);

    var stand = useSelect(function (select) {
      var core = select('core');
      var args = ['postType', F.type, a.faqId];
      return {
        vraag: core.getEntityRecord.apply(null, args),
        klaar: core.hasFinishedResolution('getEntityRecord', args)
      };
    }, [a.faqId]);

    var bewerker = useDispatch('core/block-editor');
    var vraag = stand.vraag;

    var blockProps = useBlockProps({ className: 'mymmo-faq-vraag is-open' });

    function maakEigen() {
      var inhoud = vraag && vraag.content ? (vraag.content.raw !== undefined ? vraag.content.raw : vraag.content.rendered) : '';
      var binnen = blocks.parse(inhoud || '');
      bewerker.replaceInnerBlocks(props.clientId, binnen, false);
      props.setAttributes({ faqId: 0, vraag: titelVan(vraag) });
    }

    var zijbalk = el(
      InspectorControls,
      {},
      el(
        PanelBody,
        { title: 'Deze vraag', initialOpen: true },
        el('p', { className: 'mymmo-faq-hulp' }, 'Deze vraag komt uit de bibliotheek. Pas je ze daar aan, dan verandert ze op elke pagina waar ze staat.'),
        vraag ? el('p', {}, el(ExternalLink, { href: F.bewerk + a.faqId }, 'Aanpassen in de bibliotheek')) : null,
        vraag ? el(Button, {
          variant: 'secondary',
          onClick: maakEigen
        }, 'Maak er een eigen vraag van') : null,
        vraag ? el('p', { className: 'mymmo-faq-hulp' }, 'Een eigen vraag geldt enkel op deze pagina: wat je eraan verandert, blijft hier.') : null
      )
    );

    if (!stand.klaar && !vraag) {
      return el('div', blockProps, el(Spinner));
    }

    if (!vraag || (vraag.status && vraag.status !== 'publish')) {
      return el(
        'div',
        blockProps,
        zijbalk,
        el(Notice, { status: 'warning', isDismissible: false },
          'Deze vraag staat niet (meer) gepubliceerd in de bibliotheek en komt niet op de pagina. Verwijder dit blok of publiceer de vraag opnieuw.')
      );
    }

    return el(
      'div',
      blockProps,
      zijbalk,
      el('div', { className: 'mymmo-faq-vraag-kop' },
        el(tag, { className: 'mymmo-faq-vraag-tekst' }, titelVan(vraag))
      ),
      el('div', { className: 'mymmo-faq-vraag-antwoord' },
        el(RawHTML, {}, vraag.content ? vraag.content.rendered : '')
      ),
      el('p', { className: 'mymmo-faq-bron' }, 'Uit de bibliotheek')
    );
  }

  /** Een eigen vraag: de vraag als tekst, het antwoord als gewone blokken. */
  function Eigen(props) {
    var a = props.attributes;
    var zet = props.setAttributes;
    var tag = kopTag(props.context['mymmo/faq-kop']);

    var bezig = useState(false);
    var fout = useState('');

    var binnen = useSelect(function (select) {
      return select('core/block-editor').getBlocks(props.clientId);
    }, [props.clientId]);

    var opslag = useDispatch('core');
    var bewerker = useDispatch('core/block-editor');

    var blockProps = useBlockProps({ className: 'mymmo-faq-vraag is-open' });

    var antwoord = binnenProps({ className: 'mymmo-faq-vraag-antwoord' }, {
      allowedBlocks: ANTWOORD_BLOKKEN,
      template: ANTWOORD_SJABLOON,
      templateLock: false
    });

    var heeftVraag = tekstVan(a.vraag) !== '';

    function bewaar() {
      bezig[1](true);
      fout[1]('');
      opslag.saveEntityRecord('postType', F.type, {
        title: tekstVan(a.vraag),
        content: blocks.serialize(binnen),
        status: 'publish'
      }, { throwOnError: true }).then(function (rec) {
        bezig[1](false);
        if (rec && rec.id) {
          bewerker.replaceInnerBlocks(props.clientId, [], false);
          zet({ faqId: rec.id, vraag: '' });
        }
      }, function (e) {
        bezig[1](false);
        fout[1]((e && e.message) || 'Bewaren lukte niet.');
      });
    }

    var zijbalk = el(
      InspectorControls,
      {},
      el(
        PanelBody,
        { title: 'Deze vraag', initialOpen: true },
        el('p', { className: 'mymmo-faq-hulp' }, 'Een eigen vraag staat enkel op deze pagina. Komt ze ook op andere pagina\'s terug, bewaar ze dan in de bibliotheek: dan pas je ze op één plek aan. Ze krijgt vanzelf een thema.'),
        el(Button, {
          variant: 'secondary',
          isBusy: bezig[0],
          disabled: bezig[0] || !heeftVraag,
          onClick: bewaar
        }, 'Bewaar in de bibliotheek'),
        fout[0] ? el(Notice, { status: 'error', isDismissible: false }, fout[0]) : null
      )
    );

    return el(
      'div',
      blockProps,
      zijbalk,
      el('div', { className: 'mymmo-faq-vraag-kop' },
        el(RichText, {
          tagName: tag,
          className: 'mymmo-faq-vraag-tekst',
          value: a.vraag,
          allowedFormats: [],
          placeholder: 'De vraag, zoals een bezoeker ze stelt',
          onChange: function (w) { zet({ vraag: w }); }
        })
      ),
      el('div', antwoord.props, antwoord.kinderen)
    );
  }

  blocks.registerBlockType(VRAAG, {
    apiVersion: 2,
    title: 'Vraag',
    description: 'Een vraag met haar antwoord, uit de bibliotheek of eigen aan deze pagina.',
    category: 'mymmo',
    icon: 'editor-help',
    parent: [LIJST],
    usesContext: ['mymmo/faq-kop'],
    keywords: ['vraag', 'antwoord', 'faq', 'question'],
    supports: {
      html: false
    },
    attributes: {
      faqId: { type: 'number', default: 0 },
      vraag: { type: 'string', default: '' }
    },

    edit: function (props) {
      return props.attributes.faqId ? el(Gekoppeld, props) : el(Eigen, props);
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.data);
