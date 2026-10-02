/**
 * De knop die een venster opent -- in de blok-editor.
 *
 * Dit is geen nieuw blok maar een UITBREIDING van de gewone WordPress-knop: één
 * attribuut en één paneeltje in de zijbalk. Daardoor houdt de knop elke
 * eigenschap die core kent (kleur, rand, typografie, breedte, opvulling,
 * stijlvarianten) en stijlt het thema hem net als elke andere knop.
 *
 * Bewust ZONDER JSX en zonder bouwstap, net als de rest van deze plugin.
 *
 * DE KEUZE IS EEN TABBLAD VAN EEN OPSTELLING, geen ingang. Een ingang zegt HOE
 * een venster opengaat (knop, klasse, callout); wat je hier kiest is WAT de
 * bezoeker te zien krijgt. Die twee door elkaar halen gaf een keuzelijst vol
 * ingangen die enkel bestonden om ergens een knop te kunnen zetten -- en het
 * tabblad dat je wilde openen stond er niet eens in.
 *
 * WAAROM HET ATTRIBUUT GEEN `source` HEEFT: zonder `source` bewaart WordPress de
 * waarde in het blok-commentaar (`<!-- wp:button {"mymmoVenster":"..."} -->`) in
 * plaats van in de markup. Dat is hier precies goed -- de trigger-klasse komt
 * bij het RENDEREN op de knop (zie class-knop.php), niet bij het opslaan. Stond
 * ze in de opgeslagen inhoud, dan bleef ze staan op elke pagina waar iemand de
 * keuze later weghaalde.
 */

(function (hooks, compose, element, blocks, blockEditor, components) {
  'use strict';

  if (!hooks || !compose || !element || !blockEditor || !components) {
    return;
  }

  var el = element.createElement;

  var C = window.MymmoCardsVensters || { actief: false, vensters: [] };
  var VENSTERS = C.vensters || [];

  var BLOK = 'core/button';
  var ATTR = 'mymmoVenster';

  var InspectorControls = blockEditor.InspectorControls;
  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var TextControl = components.TextControl;

  /* ── 1. Het attribuut op de kern-knop ───────────────────────────────────── */

  hooks.addFilter(
    'blocks.registerBlockType',
    'mymmo-cards/knop-venster',
    function (settings, naam) {
      if (naam !== BLOK) {
        return settings;
      }

      var attrs = {};
      attrs[ATTR] = { type: 'string', 'default': '' };
      /* Het attribuut van 1.6.0 blijft geregistreerd, anders gooit de editor het
         bij de eerste bewaaractie weg -- en dan kan class-knop.php niet meer
         zeggen dat die knop opnieuw ingesteld moet worden. */
      attrs.mymmoIngang = { type: 'string', 'default': '' };
      /* Waar de academy opent, als de gekozen popup die van de academy is. */
      attrs.mymmoAcademyCursus = { type: 'string', 'default': '' };
      attrs.mymmoAcademyLes = { type: 'string', 'default': '' };
      /* Waar de academy opent, als pad ("/", "/courses/<slug>"). Vervangt
         mymmoAcademyCursus, dat blijft voor knoppen van 1.8.5-1.8.7. */
      attrs.mymmoAcademyPad = { type: 'string', 'default': '' };

      return Object.assign({}, settings, {
        attributes: Object.assign({}, settings.attributes, attrs)
      });
    }
  );

  /* ── 2. De keuzelijst ───────────────────────────────────────────────────── */

  /**
   * De opties, plat.
   *
   * Met MEER dan één opstelling staat haar naam ervoor ("ContactPopup —
   * Offertetool"), met één opstelling niet: dan is die naam op elke regel
   * hetzelfde en voegt hij enkel ruis toe aan een lijst van drie.
   */
  function opties(huidig) {
    var uit = [{ label: 'Geen — gewone knop', value: '' }];
    var meerdere = VENSTERS.length > 1;
    var gevonden = false;

    VENSTERS.forEach(function (v) {
      v.tabbladen.forEach(function (t) {
        var waarde = v.id + '|' + t.tab;
        if (waarde === huidig) {
          gevonden = true;
        }
        uit.push({
          label: meerdere ? v.name + ' — ' + t.label : t.label,
          value: waarde
        });
      });
    });

    /* Een keuze die intussen niet meer bestaat, mag niet stil uit de lijst
       verdwijnen: dan lijkt de knop op "gewone knop" te staan terwijl er in de
       inhoud nog een verwijzing zit. */
    if (huidig && !gevonden) {
      uit.push({ label: huidig + ' — bestaat niet meer', value: huidig });
    }

    return uit;
  }

  function hulptekst(huidig) {
    if (!C.actief) {
      return 'Mymmo Forms staat niet aan op deze site, dus er is niets te openen.';
    }
    if (!VENSTERS.length) {
      return 'Er zijn nog geen opstellingen. Maak er een bij Instellingen → Mymmo Forms.';
    }
    if (!huidig) {
      return 'Kies wat deze knop opent. Zonder keuze blijft het een gewone knop.';
    }

    if (isAcademy(huidig)) {
      return 'Dit is de popup van de academy. Wie nog niet aangemeld is, krijgt het formulier; '
        + 'daarna, en de volgende keer meteen, opent de academy.';
    }

    return 'De knop opent de pop-up meteen op dit tabblad.';
  }

  var ACADEMY = C.academy || { preset: '', courses: [] };

  /** Is de gekozen popup die van de academy (Instellingen → Mymmo academy)? */
  function isAcademy(huidig) {
    var id = String(huidig || '').split('|')[0];
    if (!id) return false;
    for (var i = 0; i < VENSTERS.length; i += 1) {
      if (VENSTERS[i].id === id && VENSTERS[i].academy) return true;
    }
    return !!ACADEMY.preset && id === ACADEMY.preset;
  }

  /** Het pad van deze knop; een knop van 1.8.5-1.8.7 heeft enkel een cursus. */
  function padVan(a) {
    if (a.mymmoAcademyPad) return a.mymmoAcademyPad;
    return a.mymmoAcademyCursus ? '/courses/' + a.mymmoAcademyCursus : '/';
  }

  /**
   * De keuzelijst van bestemmingen, gegroepeerd. GENERIEK: de lijst komt uit
   * de academy zelf (/api/catalog), dus een nieuwe cursus of pagina staat er
   * vanzelf in.
   */
  function bestemmingKeuze(a, zet) {
    var lijst = ACADEMY.destinations && ACADEMY.destinations.length
      ? ACADEMY.destinations
      : [{ path: '/', label: 'Inhoudspagina (alle cursussen)', group: "Pagina's" }];
    var huidig = padVan(a);
    var groepen = [];
    var perGroep = {};
    var gevonden = false;
    lijst.forEach(function (d) {
      var g = d.group || '';
      if (!perGroep[g]) { perGroep[g] = []; groepen.push(g); }
      perGroep[g].push(d);
      if (d.path === huidig) gevonden = true;
    });
    var kinderen = groepen.map(function (g) {
      var opties = perGroep[g].map(function (d) {
        return el('option', { key: d.path, value: d.path }, d.label);
      });
      return g ? el('optgroup', { key: g, label: g }, opties) : opties;
    });
    // Een bestemming die er intussen niet meer is (cursus offline gehaald), niet
    // stil laten verdwijnen: dan lijkt de knop op iets anders te staan.
    if (!gevonden) kinderen.push(el('option', { key: '_weg', value: huidig }, huidig + ' — niet (meer) in de academy'));

    return el(SelectControl, {
      label: 'Opent in de academy',
      value: huidig,
      help: ACADEMY.destinations && ACADEMY.destinations.length
        ? 'Komt uit de academy zelf: een nieuwe cursus of pagina staat hier vanzelf bij.'
        : 'De lijst uit de academy kon niet geladen worden; enkel de inhoudspagina staat erin.',
      onChange: function (v) {
        zet({ mymmoAcademyPad: v, mymmoAcademyCursus: '', mymmoAcademyLes: v.indexOf('/courses/') === 0 ? a.mymmoAcademyLes : '' });
      }
    }, kinderen);
  }

  var metPaneel = compose.createHigherOrderComponent(function (BlockEdit) {
    return function (props) {
      if (props.name !== BLOK) {
        return el(BlockEdit, props);
      }

      var huidig = props.attributes[ATTR] || '';
      var oud = props.attributes.mymmoIngang || '';

      return el(element.Fragment, null,
        el(BlockEdit, props),
        el(InspectorControls, null,
          el(PanelBody, { title: 'Opent een venster', initialOpen: !!huidig || !!oud },
            oud && !huidig
              ? el('p', { style: { color: '#b32d2e', fontSize: '12px', marginTop: 0 } },
                  'Deze knop stond met een oudere versie op een ingang. Kies hieronder opnieuw.')
              : null,
            el(SelectControl, {
              label: 'Opent',
              value: huidig,
              options: opties(huidig),
              disabled: !C.actief,
              help: hulptekst(huidig),
              onChange: function (v) {
                var nieuw = {};
                nieuw[ATTR] = v;
                /* De oude keuze meteen opruimen: twee waarden voor hetzelfde
                   lopen ooit uiteen, en de melding hoort weg te zijn zodra de
                   knop opnieuw ingesteld is. */
                if (oud) {
                  nieuw.mymmoIngang = '';
                }
                props.setAttributes(nieuw);
              }
            }),
            isAcademy(huidig) ? bestemmingKeuze(props.attributes, props.setAttributes) : null,
            isAcademy(huidig) && padVan(props.attributes).indexOf('/courses/') === 0
              ? el(TextControl, {
                  label: 'Meteen naar een les (optioneel)',
                  help: 'Het id van de les. Leeg = het begin van de cursus.',
                  value: props.attributes.mymmoAcademyLes || '',
                  onChange: function (v) {
                    props.setAttributes({ mymmoAcademyLes: String(v || '').replace(/[^A-Za-z0-9_-]/g, '') });
                  }
                })
              : null,
            huidig
              ? el('p', { style: { marginTop: '12px', fontSize: '12px', color: '#757575' } },
                  'De link van de knop blijft de terugval voor wie geen JavaScript heeft. '
                  + 'Laat je hem leeg, dan doet de knop enkel dit venster.')
              : null
          )
        )
      );
    };
  }, 'mymmoKnopVenster');

  hooks.addFilter('editor.BlockEdit', 'mymmo-cards/knop-venster', metPaneel);

  /* ── 3. Vindbaar in de inserter ─────────────────────────────────────────── */

  /*
   * Een variant van core/BUTTONS en niet van core/button: dat laatste blok heeft
   * `parent: ['core/buttons']` en verschijnt dus alleen in de inserter als je al
   * in een knoppenrij staat. Wie een knop wil neerzetten, zoekt hem bovenaan.
   *
   * De variant zet zelf niets in: ze is een wegwijzer. Zonder haar bestaat deze
   * mogelijkheid alleen voor wie toevallig in de zijbalk van een knop kijkt.
   */
  if (blocks && blocks.registerBlockVariation) {
    var leeg = {};
    leeg[ATTR] = '';

    blocks.registerBlockVariation('core/buttons', {
      name: 'mymmo-venster',
      title: 'Knop die een venster opent',
      description: 'Een gewone knop. Kies er in de zijbalk bij welk tabblad van welke '
        + 'pop-up hij opent.',
      scope: ['inserter'],
      innerBlocks: [['core/button', leeg]]
    });
  }
}(
  window.wp.hooks,
  window.wp.compose,
  window.wp.element,
  window.wp.blocks,
  window.wp.blockEditor,
  window.wp.components
));
