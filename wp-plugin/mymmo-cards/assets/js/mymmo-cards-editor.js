/**
 * Mymmo Cards in de blok-editor.
 *
 * Bewust ZONDER JSX en zonder bouwstap, net als het blok "Mymmo formulier" in
 * Mymmo Forms: wp.element.createElement doet hetzelfde, en een bouwstap in deze
 * map zou betekenen dat niemand een kleine wijziging meer kan doen zonder npm.
 *
 * WAT DE EDITOR TOONT, IS DE ECHTE MARKUP -- en dat is hier geen mooi voornemen
 * maar de reden dat `useInnerBlocksProps` gebruikt wordt in plaats van
 * `<InnerBlocks>`.
 *
 * Met een gewone `<InnerBlocks>` zet de editor TWEE eigen wikkels tussen jouw
 * element en de blokken erin (`.block-editor-inner-blocks` en
 * `.block-editor-block-list__layout`). Voor gewone tekst maakt dat niets uit,
 * maar `.mymmo-kaart-raster` is een GRID: met die wikkels ertussen heeft dat
 * grid nog maar EEN kind, en dan staan twee kolommen in de editor onder elkaar
 * terwijl ze op de pagina naast elkaar staan. Precies het soort verschil
 * waardoor een redacteur zijn pagina niet meer kan vertrouwen.
 *
 * `useInnerBlocksProps` geeft die props aan JOUW element, zodat de kolommen er
 * rechtstreeks in zitten -- net als in de PHP-render.
 *
 * GEEN ENKELE TYPOGRAFIE-INSTELLING. De inhoud van een kaart zijn gewone
 * core-blokken; kop, tekst en kleur komen uit het thema en uit de gereedschappen
 * die de editor daar zelf voor heeft. Zet hier dus nooit een lettergrootte of
 * een kleur voor tekst bij -- dat is precies het probleem dat deze plugin
 * oplost.
 */

(function (blocks, element, blockEditor, components, data) {
  'use strict';

  if (!blocks || !element || !blockEditor) {
    return;
  }

  var el = element.createElement;
  var C = window.MymmoCards || { opvullingen: [], verhoudingen: [] };

  var InnerBlocks = blockEditor.InnerBlocks;
  var InspectorControls = blockEditor.InspectorControls;
  var useBlockProps = blockEditor.useBlockProps;

  /* Stabiel sinds WP 6.0; daarvoor met een underscore-voorvoegsel. Welke van de
     twee bestaat, wisselt niet tussen twee rendervoorbeelden van dezelfde
     pagina -- dit is dus geen voorwaardelijke hook. */
  var useInnerBlocksProps = blockEditor.useInnerBlocksProps
    || blockEditor.__experimentalUseInnerBlocksProps;

  var MediaUpload = blockEditor.MediaUpload;
  var MediaUploadCheck = blockEditor.MediaUploadCheck;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var RangeControl = components.RangeControl;
  var TextControl = components.TextControl;
  var Button = components.Button;
  var ColorPalette = components.ColorPalette;

  /** De keuzelijsten komen van de server; zie Mymmo_Cards_Blocks::register(). */
  function keuzes(lijst, leegLabel) {
    var uit = leegLabel ? [{ label: leegLabel, value: '' }] : [];
    (lijst || []).forEach(function (rij) {
      uit.push({ label: rij.label, value: rij.value });
    });
    return uit;
  }

  /**
   * De inhoud van een element, met de blokken er RECHTSTREEKS in.
   *
   * LET OP MET `children`. useInnerBlocksProps geeft de blokken terug ALS PROP
   * (`props.children`), niet als los element. Geef je daarna nog eigen kinderen
   * mee aan createElement -- en dat moet hier, want InspectorControls hoort
   * erbij -- dan negeert React die prop en verdwijnt de hele inhoud van het
   * blok. In de editor zie je dan een lege kaart: geen foutmelding, geen
   * kolommen, niets. Daarom wordt `children` er hier uit gehaald en apart
   * teruggegeven, zodat de aanroeper hem zelf op de juiste plek zet.
   *
   * Valt terug op een gewone <InnerBlocks> op een oudere WordPress; dan staan
   * de kolommen in de editor onder elkaar (op de pagina niet), en dat is de
   * veilige kant op.
   */
  function binnenProps(eigen, opties) {
    if (useInnerBlocksProps) {
      var alles = useInnerBlocksProps(eigen, opties);
      var props = {};

      Object.keys(alles).forEach(function (sleutel) {
        if (sleutel !== 'children') {
          props[sleutel] = alles[sleutel];
        }
      });

      return { props: props, kinderen: alles.children };
    }

    return { props: eigen, kinderen: el(InnerBlocks, opties) };
  }

  /**
   * Het kleurenpalet van het THEMA.
   *
   * useSettings (6.5+) of useSetting (ouder). Beide zijn hooks, dus ze worden
   * onvoorwaardelijk aangeroepen binnen een edit-functie; welke van de twee
   * bestaat, wisselt niet tussen twee rendervoorbeelden van dezelfde pagina.
   */
  function themaPalet() {
    if (blockEditor.useSettings) {
      var waarden = blockEditor.useSettings('color.palette');
      if (waarden && waarden[0]) {
        return waarden[0];
      }
    }
    if (blockEditor.useSetting) {
      return blockEditor.useSetting('color.palette') || [];
    }
    return [];
  }

  /**
   * Een kleur uit het palet wordt als SLUG bewaard, niet als hex.
   *
   * Dan schuift de kaart mee als het merk ooit van tint verandert -- hetzelfde
   * voordeel als een `var(--wp--preset--color--…)` in de stylesheet. Een kleur
   * buiten het palet wordt gewoon haar hex.
   */
  function naarSlug(palet, hex) {
    var gevonden = (palet || []).filter(function (kleur) {
      return String(kleur.color).toLowerCase() === String(hex).toLowerCase();
    })[0];

    return gevonden ? gevonden.slug : hex;
  }

  function naarHex(palet, waarde) {
    if (!waarde) {
      return '';
    }
    if (String(waarde).charAt(0) === '#') {
      return waarde;
    }
    var gevonden = (palet || []).filter(function (kleur) {
      return kleur.slug === waarde;
    })[0];

    return gevonden ? gevonden.color : '';
  }

  /**
   * De afronding uit de huisstijl die het dichtst bij een bewaarde waarde ligt.
   * Zelfde regel als mymmo_cards_afronding() in helpers.php: 16 wordt klein, 35
   * en 48 worden groot. Geeft de rij uit de lijst ({ value, label, css }) of null.
   */
  function afronding(ruw) {
    if (ruw === '' || ruw === null || ruw === undefined || isNaN(parseFloat(ruw))) {
      return null;
    }
    var getal = parseFloat(ruw);
    var beste = null;
    (C.afrondingen || []).forEach(function (rij) {
      var afstand = Math.abs(getal - parseFloat(rij.value));
      if (!beste || afstand < beste.afstand) {
        beste = { afstand: afstand, rij: rij };
      }
    });
    return beste ? beste.rij : null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // De stapel
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType('mymmo/cards', {
    apiVersion: 2,
    title: 'Kaartenstapel',
    description: 'Kaarten die tijdens het scrollen op elkaar blijven liggen. De inhoud van een kaart maak je met gewone blokken, dus de letter volgt je thema.',
    icon: 'images-alt2',
    category: 'mymmo',
    keywords: ['kaarten', 'stapel', 'stack', 'scroll'],
    supports: { html: false, align: ['wide', 'full'], anchor: true },

    attributes: {
      // Volle breedte tenzij de redacteur het zelf wijzigt -- zie
      // attributen_stapel() in class-blocks.php voor het waarom.
      align: { type: 'string', default: 'full' },
      stap: { type: 'number', default: 16 },
      gap: { type: 'number', default: 40 },
      opvulling: { type: 'string', default: 'normaal' },
      hoeken: { type: 'number', default: 28 },
      breedte: { type: 'number', default: 1200 },
      hoogte: { type: 'string', default: 'gelijk' },
      animatie: { type: 'string', default: 'schaal' },
      kleven: { type: 'boolean', default: true },
      kleeftMobiel: { type: 'boolean', default: true },
      paginakleur: { type: 'string', default: '' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var palet = themaPalet();

      var klassen = ['mymmo-kaarten', 'mymmo-kaarten--editor', 'mymmo-kaarten--pad-' + (a.opvulling || 'normaal')];
      if (a.hoogte !== 'gelijk') {
        klassen.push('mymmo-kaarten--natuurlijk');
      }

      var blokProps = useBlockProps({
        className: klassen.join(' '),
        style: {
          '--mk-stap': (a.stap || 0) + 'px',
          '--mk-gap': (a.gap || 0) + 'px',
          '--mk-hoeken': (afronding(a.hoeken) || { css: 'var(--mymmo-afronding-l)' }).css,
          '--mk-max': (a.breedte || 1200) + 'px'
        }
      });

      var binnen = binnenProps(blokProps, {
        allowedBlocks: ['mymmo/cards-kop', 'mymmo/card'],
        template: [['mymmo/cards-kop'], ['mymmo/card']],
        templateLock: false,
        orientation: 'vertical'
      });

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'De stapel', initialOpen: true },
          el(SelectControl, {
            label: 'Opvulling van de kaarten',
            value: a.opvulling || 'normaal',
            options: keuzes(C.opvullingen, null),
            onChange: function (w) { zet({ opvulling: w }); },
            help: 'Geldt voor alle kaarten. Een kaart mag hiervan afwijken, maar standaard staan ze gelijk — dat is het hele punt.'
          }),
          el(RangeControl, {
            label: 'Maximale breedte van een kaart',
            value: a.breedte,
            min: 480,
            max: 2400,
            step: 20,
            onChange: function (w) { zet({ breedte: w }); },
            help: 'De stapel zelf loopt over de volle breedte; de kaart blijft hierbinnen en staat gecentreerd. Onder 640px komen haar kolommen onder elkaar.'
          }),
          el(RangeControl, {
            label: 'Zichtbare rand per kaart',
            value: a.stap,
            min: 0,
            max: 48,
            onChange: function (w) { zet({ stap: w }); },
            help: 'Hoeveel van de kaart eronder zichtbaar blijft.'
          }),
          el(RangeControl, {
            label: 'Scrollafstand tussen kaarten',
            value: a.gap,
            min: 0,
            max: 160,
            onChange: function (w) { zet({ gap: w }); }
          }),
          el(SelectControl, {
            label: 'Hoeken',
            value: (afronding(a.hoeken) || { value: '28' }).value,
            options: keuzes(C.afrondingen, null),
            onChange: function (w) { zet({ hoeken: parseInt(w, 10) }); },
            help: 'De maten komen uit de huisstijl, zodat elke kaart op de site dezelfde hoeken heeft. Een kaart mag afwijken.'
          }),
          el(SelectControl, {
            label: 'Hoogte van de kaarten',
            value: a.hoogte || 'gelijk',
            options: [
              { label: 'Allemaal even hoog (gemeten)', value: 'gelijk' },
              { label: 'Elk zo hoog als haar inhoud', value: 'natuurlijk' }
            ],
            onChange: function (w) { zet({ hoogte: w }); },
            help: 'Even hoog wordt op de pagina gemeten aan de hoogste kaart. Je hoeft dus nergens een hoogte in te typen.'
          })
        ),
        el(
          PanelBody,
          { title: 'Beweging', initialOpen: false },
          el(SelectControl, {
            label: 'Terwijl de volgende kaart eroverheen schuift',
            value: a.animatie || 'schaal',
            options: [
              { label: 'De kaart krimpt een beetje', value: 'schaal' },
              { label: 'Niets', value: 'geen' }
            ],
            onChange: function (w) { zet({ animatie: w }); },
            help: 'De krimp telt op: elke kaart die er nog overheen komt maakt deze kaart iets kleiner, zodat de randen als een waaier uit elkaar lopen. Bezoekers die beweging afwijzen in hun systeem krijgen dit sowieso niet.'
          }),
          el(ToggleControl, {
            label: 'Kaarten laten kleven',
            checked: a.kleven !== false,
            onChange: function (w) { zet({ kleven: w }); },
            help: 'Uit = gewoon onder elkaar.'
          }),
          el(ToggleControl, {
            label: 'Ook laten kleven op een telefoon',
            checked: a.kleeftMobiel !== false,
            onChange: function (w) { zet({ kleeftMobiel: w }); }
          })
        ),
        el(
          PanelBody,
          { title: 'Achtergrond van de pagina', initialOpen: false },
          el('p', { style: { margin: '0 0 8px', fontSize: '12px', color: '#646970' } },
            'De kop blijft staan terwijl de kaarten eronder doorschuiven. Zet hier dezelfde kleur als de pagina, anders lees je de tekst van een kaart dwars door de kop heen. Leeg = de paginakleur van de huisstijl.'),
          ColorPalette
            ? el(ColorPalette, {
                colors: palet,
                value: naarHex(palet, a.paginakleur) || a.paginakleur,
                disableCustomColors: true,
                clearable: true,
                onChange: function (w) { zet({ paginakleur: w ? naarSlug(palet, w) : '' }); }
              })
            : null
        )
      );

      return el('div', binnen.props, zijbalk, binnen.kinderen);
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // De kop
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType('mymmo/cards-kop', {
    apiVersion: 2,
    title: 'Kop van de stapel',
    description: 'De titel die blijft staan terwijl de kaarten eronder schuiven. Vul hem met gewone blokken.',
    icon: 'editor-textcolor',
    category: 'mymmo',
    parent: ['mymmo/cards'],
    supports: { html: false, reusable: false },

    edit: function () {
      var blokProps = useBlockProps({ className: 'mymmo-kaarten-kop' });

      var binnen = binnenProps({ className: 'mymmo-kaarten-kop-binnen' }, {
        template: [['core/heading', { level: 2, placeholder: 'Kop boven de stapel' }]],
        templateLock: false
      });

      return el('div', blokProps, el('div', binnen.props, binnen.kinderen));
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // De kaart
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType('mymmo/card', {
    apiVersion: 2,
    title: 'Kaart',
    description: 'Een kaart in de stapel. Een of twee kolommen; onder 640px komen ze onder elkaar.',
    icon: 'index-card',
    category: 'mymmo',
    parent: ['mymmo/cards'],
    supports: { html: false, anchor: true, reusable: false },

    attributes: {
      verhouding: { type: 'string', default: '40-60' },
      achtergrond: { type: 'string', default: '' },
      hoeken: { type: 'string', default: '' },
      opvulling: { type: 'string', default: '' },
      mobiel: { type: 'string', default: 'links-eerst' },
      uitlijning: { type: 'string', default: 'midden' },
      uitlijningMobiel: { type: 'string', default: 'boven' },
      sier: { type: 'string', default: '' },
      // Het label is "Grootte"; de attribuutnaam blijft sierBreedte, zodat
      // pagina's die al een vorm hebben niet opnieuw ingesteld moeten worden.
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

      /* Het aantal kolommen bepaalt de indeling -- er is geen apart
         "indeling"-veld. Eén kolom is een brede kaart, twee is een kaart met
         een verhouding. Zo hoeft een redacteur geen twee dingen gelijk te
         houden die hetzelfde zeggen. */
      var aantal = data && data.useSelect
        ? data.useSelect(function (select) {
            var blok = select('core/block-editor').getBlock(props.clientId);
            return blok ? blok.innerBlocks.length : 0;
          }, [props.clientId])
        : 2;

      var klassen = ['mymmo-kaart', 'mymmo-kaart--k' + Math.min(3, Math.max(1, aantal))];
      if (a.uitlijning === 'boven' || a.uitlijning === 'onder') {
        klassen.push('mymmo-kaart--' + a.uitlijning);
      }
      if (a.uitlijningMobiel === 'midden' || a.uitlijningMobiel === 'onder') {
        klassen.push('mymmo-kaart--mob-' + a.uitlijningMobiel);
      }
      if (a.mobiel === 'rechts-eerst') {
        klassen.push('mymmo-kaart--rechts-eerst');
      }
      if (a.opvulling) {
        klassen.push('mymmo-kaart--pad-' + a.opvulling);
      }
      if (a.sier) {
        klassen.push('mymmo-kaart--bijgesneden');
        if (a.sierMobiel) {
          klassen.push('mymmo-kaart--sier-m');
        }
      }

      var stijl = {};
      var verhouding = (C.verhoudingen || []).filter(function (r) { return r.value === a.verhouding; })[0];
      if (verhouding && verhouding.css) {
        stijl['--mk-verhouding'] = verhouding.css;
      }
      var hex = naarHex(palet, a.achtergrond);
      if (hex) {
        stijl['--mk-bg'] = hex;
      }
      var eigenHoeken = afronding(a.hoeken);
      if (eigenHoeken) {
        stijl['--mk-hoeken'] = eigenHoeken.css;
      }
      if (a.sier) {
        stijl['--mk-sier-breedte'] = (a.sierBreedte === undefined ? 70 : a.sierBreedte) + '%';
        stijl['--mk-sier-x'] = (a.sierX === undefined ? 50 : a.sierX) + '%';
        stijl['--mk-sier-y'] = (a.sierY === undefined ? 50 : a.sierY) + '%';
        stijl['--mk-sier-draai'] = (a.sierDraai || 0) + 'deg';
        stijl['--mk-sier-dekking'] = (a.sierDekking === undefined ? 100 : a.sierDekking) / 100;

        if (a.sierMobiel) {
          stijl['--mk-sier-breedte-m'] = (a.sierBreedteMobiel === undefined ? 70 : a.sierBreedteMobiel) + '%';
          stijl['--mk-sier-x-m'] = (a.sierXMobiel === undefined ? 50 : a.sierXMobiel) + '%';
          stijl['--mk-sier-y-m'] = (a.sierYMobiel === undefined ? 50 : a.sierYMobiel) + '%';
          stijl['--mk-sier-draai-m'] = (a.sierDraaiMobiel || 0) + 'deg';
          stijl['--mk-sier-dekking-m'] = (a.sierDekkingMobiel === undefined ? 100 : a.sierDekkingMobiel) / 100;
        }
      }

      var blokProps = useBlockProps({ className: klassen.join(' '), style: stijl });

      var binnen = binnenProps({ className: 'mymmo-kaart-raster' }, {
        allowedBlocks: ['mymmo/card-kolom'],
        template: [['mymmo/card-kolom'], ['mymmo/card-kolom']],
        templateLock: false,
        orientation: 'horizontal'
      });

      var sierPaneel = el(
        PanelBody,
        { title: 'Vorm op de achtergrond', initialOpen: false },
        el('p', { style: { margin: '0 0 8px', fontSize: '12px', color: '#646970' } },
          'Een swirl of een blob die achter de inhoud doorloopt. Zet hem breder dan 100% en schuif hem naar een hoek: wat buiten de kaart valt, wordt afgesneden.'),
        MediaUpload && MediaUploadCheck
          ? el(
              MediaUploadCheck,
              null,
              el(MediaUpload, {
                allowedTypes: ['image'],
                onSelect: function (media) { zet({ sier: media && media.url ? media.url : '' }); },
                render: function (obj) {
                  return el(Button, {
                    variant: 'secondary',
                    onClick: obj.open,
                    style: { marginBottom: '8px' }
                  }, a.sier ? 'Andere vorm kiezen' : 'Vorm uit de mediabibliotheek');
                }
              })
            )
          : null,
        el(TextControl, {
          label: 'of een URL',
          value: a.sier || '',
          onChange: function (w) { zet({ sier: w }); },
          placeholder: 'https://link.openvme.be/assets/brand/…',
          help: 'Een SVG of PNG. Leeg = geen vorm.'
        }),
        a.sier
          ? el(
              element.Fragment,
              null,
              el(RangeControl, {
                label: 'Grootte (% van de kaartbreedte)',
                value: a.sierBreedte,
                min: 5,
                max: 1000,
                onChange: function (w) { zet({ sierBreedte: w }); },
                help: '100% = zo breed als de kaart. De vorm houdt haar eigen hoogte-breedteverhouding.'
              }),
              el(RangeControl, {
                label: 'Horizontaal (%)',
                value: a.sierX,
                min: -300,
                max: 400,
                onChange: function (w) { zet({ sierX: w }); },
                help: '50 = gecentreerd, 0 = linkerrand, 100 = rechterrand. Daarbuiten steekt de vorm uit de kaart.'
              }),
              el(RangeControl, {
                label: 'Verticaal (%)',
                value: a.sierY,
                min: -300,
                max: 400,
                onChange: function (w) { zet({ sierY: w }); }
              }),
              el(RangeControl, {
                label: 'Draaiing (graden)',
                value: a.sierDraai,
                min: -180,
                max: 180,
                onChange: function (w) { zet({ sierDraai: w }); }
              }),
              el(RangeControl, {
                label: 'Dekking (%)',
                value: a.sierDekking,
                min: 0,
                max: 100,
                onChange: function (w) { zet({ sierDekking: w }); }
              }),
              el(ToggleControl, {
                label: 'Eigen instellingen op een smal scherm',
                checked: !!a.sierMobiel,
                onChange: function (w) { zet({ sierMobiel: w }); },
                help: 'Onder 640px heeft de kaart een heel andere vorm: wat op 1200px een hoek vult, ligt op 375px over de halve tekst.'
              }),
              a.sierMobiel
                ? el(
                    element.Fragment,
                    null,
                    el(RangeControl, {
                      label: 'Grootte op smal scherm (%)',
                      value: a.sierBreedteMobiel,
                      min: 5,
                      max: 1000,
                      onChange: function (w) { zet({ sierBreedteMobiel: w }); }
                    }),
                    el(RangeControl, {
                      label: 'Horizontaal op smal scherm (%)',
                      value: a.sierXMobiel,
                      min: -300,
                      max: 400,
                      onChange: function (w) { zet({ sierXMobiel: w }); }
                    }),
                    el(RangeControl, {
                      label: 'Verticaal op smal scherm (%)',
                      value: a.sierYMobiel,
                      min: -300,
                      max: 400,
                      onChange: function (w) { zet({ sierYMobiel: w }); }
                    }),
                    el(RangeControl, {
                      label: 'Draaiing op smal scherm (graden)',
                      value: a.sierDraaiMobiel,
                      min: -180,
                      max: 180,
                      onChange: function (w) { zet({ sierDraaiMobiel: w }); }
                    }),
                    el(RangeControl, {
                      label: 'Dekking op smal scherm (%)',
                      value: a.sierDekkingMobiel,
                      min: 0,
                      max: 100,
                      onChange: function (w) { zet({ sierDekkingMobiel: w }); }
                    })
                  )
                : null,
              el(Button, {
                variant: 'link',
                isDestructive: true,
                onClick: function () { zet({ sier: '' }); }
              }, 'Vorm verwijderen')
            )
          : null
      );

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'Deze kaart', initialOpen: true },
          aantal > 1
            ? el(SelectControl, {
                label: 'Verdeling van de kolommen',
                value: a.verhouding || '40-60',
                options: keuzes(C.verhoudingen, null),
                onChange: function (w) { zet({ verhouding: w }); }
              })
            : el('p', { style: { margin: '0 0 8px', fontSize: '12px', color: '#646970' } },
                'Eén kolom: de inhoud loopt over de volle breedte. Voeg een tweede kolom toe voor een verdeling.'),
          el(SelectControl, {
            label: 'Op een smal scherm bovenaan',
            value: a.mobiel || 'links-eerst',
            options: [
              { label: 'De eerste kolom', value: 'links-eerst' },
              { label: 'De tweede kolom', value: 'rechts-eerst' }
            ],
            onChange: function (w) { zet({ mobiel: w }); },
            help: 'Twee kolommen komen onder 640px onder elkaar. Wat er dan bovenaan hoort, is een keuze.'
          }),
          el(SelectControl, {
            label: 'Inhoud verticaal — naast elkaar',
            value: a.uitlijning || 'midden',
            options: [
              { label: 'Gecentreerd', value: 'midden' },
              { label: 'Bovenaan', value: 'boven' },
              { label: 'Onderaan', value: 'onder' }
            ],
            onChange: function (w) { zet({ uitlijning: w }); },
            help: 'Waar de inhoud hangt als de kaart hoger is dan wat erin staat. Een kolom mag hiervan afwijken.'
          }),
          el(SelectControl, {
            label: 'Inhoud verticaal — gestapeld',
            value: a.uitlijningMobiel || 'boven',
            options: [
              { label: 'Bovenaan', value: 'boven' },
              { label: 'Gecentreerd', value: 'midden' },
              { label: 'Onderaan', value: 'onder' }
            ],
            onChange: function (w) { zet({ uitlijningMobiel: w }); },
            help: 'Onder 640px staan de kolommen onder elkaar. Bovenaan is daar de standaard: anders verspringt de bovenmarge per kaart met hoeveel tekst erin staat.'
          }),
          el(SelectControl, {
            label: 'Opvulling',
            value: a.opvulling || '',
            options: keuzes(C.opvullingen, '— die van de stapel —'),
            onChange: function (w) { zet({ opvulling: w }); },
            help: 'Laat dit leeg tenzij deze kaart echt moet afwijken.'
          }),
          el(SelectControl, {
            label: 'Hoeken',
            value: (afronding(a.hoeken) || { value: '' }).value,
            options: keuzes(C.afrondingen, '— die van de stapel —'),
            onChange: function (w) { zet({ hoeken: w }); }
          })
        ),
        el(
          PanelBody,
          { title: 'Achtergrond', initialOpen: false },
          ColorPalette
            ? el(ColorPalette, {
                colors: palet,
                value: naarHex(palet, a.achtergrond),
                disableCustomColors: true,
                clearable: true,
                onChange: function (w) { zet({ achtergrond: w ? naarSlug(palet, w) : '' }); }
              })
            : null
        ),
        sierPaneel
      );

      /* De vorm staat ook in de editor, met dezelfde klasse en dezelfde
         variabelen: je moet kunnen zien waar hij landt en hoe de kaart hem
         afsnijdt. Een VLAK met een achtergrond, net als in de render --
         anders meet de editor de maat anders dan de pagina. `aria-hidden`
         want het is versiering. */
      var sier = a.sier
        ? el('span', {
            className: 'mymmo-kaart-sier',
            'aria-hidden': 'true',
            style: { backgroundImage: 'url(' + a.sier + ')' }
          })
        : null;

      return el('article', blokProps, zijbalk, sier, el('div', binnen.props, binnen.kinderen));
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // De kolom
  // ───────────────────────────────────────────────────────────────────────────

  blocks.registerBlockType('mymmo/card-kolom', {
    apiVersion: 2,
    title: 'Kolom van een kaart',
    description: 'Vul met wat je wil: een kop, tekst, een afbeelding, een video, of het blok "Mymmo ingang".',
    icon: 'columns',
    category: 'mymmo',
    parent: ['mymmo/card'],
    supports: { html: false, reusable: false },

    attributes: {
      vol: { type: 'boolean', default: false },
      uitlijning: { type: 'string', default: '' },
      pad: { type: 'number', default: 0 },
      padMobiel: { type: 'number', default: -1 }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;

      var klassen = ['mymmo-kaart-kolom'];
      if (a.vol) {
        klassen.push('mymmo-kaart-kolom--vol');
      }
      if (a.uitlijning) {
        klassen.push('mymmo-kaart-kolom--' + a.uitlijning);
      }

      var stijl = {};
      if (a.pad) {
        stijl['--mk-kolom-pad'] = a.pad + 'px';
      }
      if (a.padMobiel >= 0) {
        stijl['--mk-kolom-pad-m'] = a.padMobiel + 'px';
      }

      var blokProps = useBlockProps({ className: klassen.join(' '), style: stijl });
      var binnen = binnenProps(blokProps, { templateLock: false });

      return el(
        'div',
        binnen.props,
        el(
          InspectorControls,
          null,
          el(
            PanelBody,
            { title: 'Deze kolom', initialOpen: true },
            el(SelectControl, {
              label: 'Verticaal uitlijnen',
              value: a.uitlijning || '',
              options: [
                { label: '— die van de kaart —', value: '' },
                { label: 'Bovenaan', value: 'boven' },
                { label: 'Gecentreerd', value: 'midden' },
                { label: 'Onderaan', value: 'onder' }
              ],
              onChange: function (w) { zet({ uitlijning: w }); },
              help: 'Geldt als de kolommen naast elkaar staan. Gestapeld is elke kolom zo hoog als haar inhoud, en bepaalt de kaart waar het geheel hangt.'
            }),
            el(RangeControl, {
              label: 'Binnenmarge',
              value: a.pad,
              min: 0,
              max: 200,
              onChange: function (w) { zet({ pad: w }); },
              help: 'Bovenop de opvulling van de kaart. Voor tekst die naast een beeld staat dat tot de rand loopt.'
            }),
            el(RangeControl, {
              label: 'Binnenmarge op een smal scherm',
              value: a.padMobiel,
              min: -1,
              max: 200,
              onChange: function (w) { zet({ padMobiel: w }); },
              help: '-1 = dezelfde als hierboven.'
            }),
            el(ToggleControl, {
              label: 'Tot de rand van de kaart',
              checked: !!a.vol,
              onChange: function (w) { zet({ vol: !!w }); },
              help: 'Voor een afbeelding of video die tot in de hoek doorloopt: de opvulling van de kaart valt weg en het beeld vult de hele kolom. De kaart snijdt bij op haar hoeken.'
            })
          )
        ),
        binnen.kinderen
      );
    },

    save: function () {
      return el(InnerBlocks.Content);
    }
  });
}(
  window.wp && window.wp.blocks,
  window.wp && window.wp.element,
  window.wp && window.wp.blockEditor,
  window.wp && window.wp.components,
  window.wp && window.wp.data
));
