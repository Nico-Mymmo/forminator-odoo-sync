/**
 * De MARKEERSTIFT in de blok-editor.
 *
 * Dit is geen blok maar een OPMAAK: een knop in de werkbalk van de tekst zelf,
 * naast vet en cursief. Je selecteert een woord in eender welke kop of alinea,
 * kiest een streep en een kleur, en klaar. Dat is de reden dat het een opmaak
 * is en geen blok: een blok zou betekenen dat een marketeer zijn kop in stukken
 * moet knippen om er een woord uit te lichten.
 *
 * Bewust ZONDER JSX en zonder bouwstap, net als de rest van deze plugin.
 *
 * WAAROM `class` EN OOK `className`: `className` bepaalt WANNEER de editor een
 * stuk tekst als deze opmaak herkent (`mymmo-mark` staat er altijd op); het
 * `class`-attribuut eronder draagt de KEUZES (welke streep, welke kleur). Dat is
 * exact hoe core's eigen tekstkleur-opmaak werkt -- de twee vechten niet, ze
 * worden samengevoegd tot een `class`-attribuut.
 *
 * WAAROM KLASSEN EN GEEN INLINE STIJL: wie geen `unfiltered_html` heeft (een
 * auteur, een redacteur op een multisite) ziet zijn `style`-attribuut bij het
 * bewaren gefilterd worden. Een klasse komt er altijd door. De kleur zelf staat
 * in een regel die de plugin genereert uit het palet van het thema.
 */

(function (richText, blockEditor, components, element) {
  'use strict';

  if (!richText || !blockEditor || !components || !element) {
    return;
  }

  var el = element.createElement;
  var useState = element.useState;

  var C = window.MymmoMarkering
    || { vormen: [], kleuren: [], lettertypes: [], gewichten: [] };

  var NAAM = 'mymmo/markering';
  var BASIS = 'mymmo-mark';
  var VORM_PREFIX = BASIS + '--';
  var KLEUR_PREFIX = BASIS + '--kleur-';
  var FONT_PREFIX = BASIS + '--font-';
  var GEWICHT_PREFIX = BASIS + '--gewicht-';

  /* Alles wat OOK met `mymmo-mark--` begint maar geen vorm is. Staat een
     voorvoegsel hier niet in, dan wordt die klasse voor een vorm aangezien en
     bij de eerstvolgende wijziging weggegooid -- zichtbaar als een instelling
     die zichzelf terugzet. */
  var ANDERE_PREFIXEN = [KLEUR_PREFIX, FONT_PREFIX, GEWICHT_PREFIX];

  var RichTextToolbarButton = blockEditor.RichTextToolbarButton;
  var Popover = components.Popover;
  var Button = components.Button;
  var ToggleControl = components.ToggleControl;
  var SelectControl = components.SelectControl;

  /* `useAnchor` hangt de kiezer aan het geselecteerde woord (WP 6.1+). Bestaat
     hij niet, dan valt de kiezer terug op de standaardplek van de popover --
     minder mooi, maar bruikbaar. De keuze wordt EEN keer gemaakt, bij het laden,
     dus dit is geen voorwaardelijke hook. */
  var useAnchor = richText.useAnchor || function () { return undefined; };

  /* ── Lezen en schrijven van de klassenlijst ───────────────────────────────
   *
   * De actieve keuzes staan in het `class`-attribuut. Alles wat niet van ons is
   * blijft staan: een thema of een andere plugin kan er een klasse bij gezet
   * hebben, en die stil weggooien is een wijziging die niemand ziet gebeuren.
   */

  function klassen(attrs) {
    var ruw = (attrs && attrs['class']) || '';
    return ruw.split(/\s+/).filter(Boolean);
  }

  function isVormklasse(k) {
    if (k === BASIS) {
      return false;
    }
    for (var i = 0; i < ANDERE_PREFIXEN.length; i++) {
      if (k.indexOf(ANDERE_PREFIXEN[i]) === 0) {
        return false;
      }
    }
    return k.indexOf(VORM_PREFIX) === 0;
  }

  /** De waarde achter een voorvoegsel, of '' als die klasse er niet staat. */
  function waardeVan(attrs, prefix) {
    var gevonden = '';
    klassen(attrs).forEach(function (k) {
      if (k.indexOf(prefix) === 0) {
        gevonden = k.slice(prefix.length);
      }
    });
    return gevonden;
  }

  function huidigeVorm(attrs) {
    var gevonden = '';
    klassen(attrs).forEach(function (k) {
      if (isVormklasse(k)) {
        gevonden = k.slice(VORM_PREFIX.length);
      }
    });
    return gevonden;
  }

  function huidigeKleur(attrs) {
    return waardeVan(attrs, KLEUR_PREFIX);
  }

  function bouwKlasse(attrs, keuzes) {
    var rest = klassen(attrs).filter(function (k) {
      if (k === BASIS || isVormklasse(k)) {
        return false;
      }
      for (var i = 0; i < ANDERE_PREFIXEN.length; i++) {
        if (k.indexOf(ANDERE_PREFIXEN[i]) === 0) {
          return false;
        }
      }
      return true;
    });

    if (keuzes.vorm) {
      rest.push(VORM_PREFIX + keuzes.vorm);
    }
    if (keuzes.kleur) {
      rest.push(KLEUR_PREFIX + keuzes.kleur);
    }
    if (keuzes.font) {
      rest.push(FONT_PREFIX + keuzes.font);
    }
    if (keuzes.gewicht) {
      rest.push(GEWICHT_PREFIX + keuzes.gewicht);
    }

    return rest.join(' ');
  }

  function standaardVorm() {
    return C.vormen.length ? C.vormen[0].slug : '';
  }

  /* ── De kiezer ────────────────────────────────────────────────────────────
   *
   * Eigen knopjes in plaats van een `ColorPalette`: een streep kiezen betekent
   * de streep ZIEN, en een kleur kiezen betekent de merknaam lezen. Een
   * kleurkiezer met een hex-veld nodigt bovendien uit om buiten het palet te
   * gaan, en dat is precies wat hier niet hoort te kunnen.
   */

  function Kiezer(props) {
    var anker = useAnchor({
      editableContentElement: props.contentRef ? props.contentRef.current : null,
      settings: { tagName: 'mark', className: BASIS }
    });

    var huidig = {
      vorm: huidigeVorm(props.activeAttributes) || standaardVorm(),
      kleur: huidigeKleur(props.activeAttributes),
      font: waardeVan(props.activeAttributes, FONT_PREFIX),
      gewicht: waardeVan(props.activeAttributes, GEWICHT_PREFIX)
    };
    var vorm = huidig.vorm;
    var kleur = huidig.kleur;
    var cursief = !!richText.getActiveFormat(props.value, 'core/italic');

    /** Eén keuze wijzigen; de andere drie blijven zoals ze staan. */
    function zet(sleutel, waarde) {
      var keuzes = {
        vorm: huidig.vorm,
        kleur: huidig.kleur,
        font: huidig.font,
        gewicht: huidig.gewicht
      };
      keuzes[sleutel] = waarde;

      props.onChange(richText.applyFormat(props.value, {
        type: NAAM,
        attributes: { 'class': bouwKlasse(props.activeAttributes, keuzes) }
      }));
    }

    var vormknoppen = C.vormen.map(function (v) {
      return el('button', {
        key: v.slug,
        type: 'button',
        className: 'mymmo-markering-vorm' + (v.slug === vorm ? ' is-gekozen' : ''),
        onClick: function () { zet('vorm', v.slug); },
        'aria-pressed': v.slug === vorm,
        title: v.label
      }, el('span', {
        /* Het voorbeeldje toont de MIDDELSTE lengte van die stift. Welke
           lengte er op de pagina komt, kiest mymmo-markering-front.js per
           woord -- dat is niets om een redacteur mee lastig te vallen. */
        className: 'mymmo-markering-proef',
        style: {
          WebkitMaskImage: 'url("' + v.standaard + '")',
          maskImage: 'url("' + v.standaard + '")'
        }
      }), el('span', { className: 'mymmo-markering-vorm-naam' }, v.label));
    });

    var kleurknoppen = [el('button', {
      key: '__auto',
      type: 'button',
      className: 'mymmo-markering-kleur' + (kleur === '' ? ' is-gekozen' : ''),
      onClick: function () { zet('kleur', ''); },
      'aria-pressed': kleur === '',
      title: 'Zelfde kleur als de tekst'
    }, el('span', {
      className: 'mymmo-markering-staal mymmo-markering-staal--auto'
    }))];

    C.kleuren.forEach(function (k) {
      kleurknoppen.push(el('button', {
        key: k.slug,
        type: 'button',
        className: 'mymmo-markering-kleur' + (k.slug === kleur ? ' is-gekozen' : ''),
        onClick: function () { zet('kleur', k.slug); },
        'aria-pressed': k.slug === kleur,
        title: k.name
      }, el('span', {
        className: 'mymmo-markering-staal',
        style: { background: k.color }
      })));
    });

    return el(Popover, {
      anchor: anker,
      className: 'mymmo-markering-kiezer',
      placement: 'bottom-start',
      onClose: props.onClose,
      focusOnMount: false
    }, el('div', { className: 'mymmo-markering-paneel' },
      el('p', { className: 'mymmo-markering-kop' }, 'Streep'),
      el('div', { className: 'mymmo-markering-vormen' }, vormknoppen),
      el('p', { className: 'mymmo-markering-kop' }, 'Kleur'),
      C.kleuren.length
        ? el('div', { className: 'mymmo-markering-kleuren' }, kleurknoppen)
        : el('p', { className: 'mymmo-markering-leeg' },
            'Dit thema geeft geen kleurenpalet door. De streep krijgt de kleur van de tekst.'),
      /*
       * Lettertype en dikte staan als KEUZELIJST en niet als knoppenrij: het
       * zijn geen visuele keuzes zoals een streep of een kleur, en een rij
       * knopjes met lettertypenamen leest als rommel in een paneel van 240px.
       *
       * "Zelfde als de tekst" is de lege waarde -- dan staat er geen klasse en
       * erft het woord gewoon van de kop eromheen. Dat hoort de standaard te
       * zijn: een markering die ongevraagd van lettertype verandert, is een
       * wijziging die niemand gevraagd heeft.
       */
      (C.lettertypes || []).length ? el(SelectControl, {
        label: 'Lettertype',
        value: huidig.font,
        options: [{ label: 'Zelfde als de tekst', value: '' }].concat(
          (C.lettertypes || []).map(function (f) {
            return { label: f.name, value: f.slug };
          })
        ),
        onChange: function (v) { zet('font', v); }
      }) : null,

      el(SelectControl, {
        label: 'Dikte',
        /* Absolute waarden. `<strong>` is `font-weight: bolder` en dus
           relatief: in een kop die al op 700 staat betekent dat 900, en heeft
           het lettertype geen 900, dan verandert er niets. Daarom werkte de
           knop "vet" hier niet. */
        value: huidig.gewicht,
        options: [{ label: 'Zelfde als de tekst', value: '' }].concat(
          (C.gewichten || []).map(function (g) {
            return { label: g.label, value: String(g.waarde) };
          })
        ),
        onChange: function (v) { zet('gewicht', v); }
      }),

      el(ToggleControl, {
        label: 'Ook cursief',
        checked: cursief,
        onChange: function () {
          props.onChange(richText.toggleFormat(props.value, { type: 'core/italic' }));
        }
      }),
      el(Button, {
        variant: 'tertiary',
        isDestructive: true,
        onClick: function () {
          props.onChange(richText.removeFormat(props.value, NAAM));
          props.onClose();
        }
      }, 'Markering weghalen')
    ));
  }

  function Bewerk(props) {
    var open = useState(false);
    var isOpen = open[0];
    var zetOpen = open[1];

    /* Een lege selectie zonder bestaande markering heeft niets om te markeren.
       De knop dan uitschakelen is duidelijker dan een kiezer die niets doet. */
    var leeg = props.value.start === props.value.end && !props.isActive;

    function klik() {
      if (leeg) {
        return;
      }
      if (!props.isActive) {
        /* Meteen markeren met de eerste streep: ging de kiezer open boven tekst
           die nog niet gemarkeerd is, dan toont hij een voorbeeld van niets. */
        props.onChange(richText.applyFormat(props.value, {
          type: NAAM,
          attributes: { 'class': bouwKlasse(null, { vorm: standaardVorm() }) }
        }));
      }
      zetOpen(true);
    }

    var knoppen = [el(RichTextToolbarButton, {
      key: 'knop',
      icon: el('svg', { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true },
        el('path', {
          d: 'M4 17.5 9.2 16l8.3-8.3a1.8 1.8 0 0 0 0-2.5l-.7-.7a1.8 1.8 0 0 0-2.5 0L6 12.8 4 17.5Z',
          fill: 'currentColor'
        }),
        el('rect', { x: 3, y: 19, width: 18, height: 2, rx: 1, fill: 'currentColor' })),
      title: 'Markeren',
      onClick: klik,
      isActive: props.isActive,
      isDisabled: leeg
    })];

    if (isOpen && props.isActive) {
      knoppen.push(el(Kiezer, {
        key: 'kiezer',
        value: props.value,
        onChange: props.onChange,
        activeAttributes: props.activeAttributes,
        contentRef: props.contentRef,
        onClose: function () { zetOpen(false); }
      }));
    }

    return el(element.Fragment, null, knoppen);
  }

  richText.registerFormatType(NAAM, {
    title: 'Markeren',
    tagName: 'mark',
    className: BASIS,
    attributes: { 'class': 'class' },
    edit: Bewerk
  });
}(window.wp.richText, window.wp.blockEditor, window.wp.components, window.wp.element));
