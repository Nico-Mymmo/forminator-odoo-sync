/**
 * Het blok "Mymmo academy-knop" in de blok-editor. Zie includes/class-academy.php.
 *
 * Een knop met drie keuzes: de tekst, waar de academy opent (het overzicht of
 * een bepaalde cursus) en optioneel een les. Het venster met het formulier en de
 * academy zelf staan in de voettekst; deze knop zegt enkel waar hij heen wil.
 *
 * Zonder JSX en zonder bouwstap, zoals mymmo-forms-block.js. `save` geeft null:
 * de server rendert de knop, dus een latere wijziging aan de opmaak geeft geen
 * blokvalidatiefout.
 */
(function (blocks, element, blockEditor, components) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components) return;

  var el = element.createElement;
  var InspectorControls = blockEditor.InspectorControls;
  var RichText = blockEditor.RichText;
  var useBlockProps = blockEditor.useBlockProps;
  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var TextControl = components.TextControl;
  var Notice = components.Notice;
  var ExternalLink = components.ExternalLink;

  function data() {
    return window.MymmoAcademyBlock || { courses: [], configured: false, settingsUrl: '' };
  }

  function keuzes(huidig) {
    var uit = [{ label: 'Het overzicht van alle cursussen', value: '' }];
    var gevonden = false;
    (data().courses || []).forEach(function (c) {
      if (c.slug === huidig) gevonden = true;
      uit.push({ label: c.title, value: c.slug });
    });
    // Een cursus die niet (meer) in de lijst staat, niet stil laten verdwijnen.
    if (huidig && !gevonden) uit.push({ label: huidig + ' (niet gevonden in de academy)', value: huidig });
    return uit;
  }

  blocks.registerBlockType('mymmo/academy', {
    apiVersion: 2,
    title: 'Mymmo academy-knop',
    description: 'Een knop naar de academy. Wie nog niet aangemeld is, krijgt eerst het formulier.',
    category: 'widgets',
    icon: 'welcome-learn-more',
    attributes: {
      label: { type: 'string', default: 'Start de cursus' },
      course: { type: 'string', default: '' },
      lesson: { type: 'string', default: '' }
    },
    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var d = data();

      return el(element.Fragment, null,
        el(InspectorControls, null,
          el(PanelBody, { title: 'Academy', initialOpen: true },
            !d.configured && el(Notice, { status: 'warning', isDismissible: false },
              'De academy is nog niet ingesteld. ',
              el(ExternalLink, { href: d.settingsUrl }, 'Instellingen → Mymmo academy')
            ),
            el(SelectControl, {
              label: 'Opent op',
              value: a.course,
              options: keuzes(a.course),
              onChange: function (v) { zet({ course: v, lesson: v ? a.lesson : '' }); }
            }),
            !(d.courses || []).length && el('p', { style: { fontSize: '12px', color: '#757575' } },
              'De cursuslijst kon niet geladen worden; het overzicht werkt altijd.'
            ),
            a.course && el(TextControl, {
              label: 'Meteen naar een les (optioneel)',
              help: 'Het id van de les, zoals in de academy. Leeg = het begin van de cursus.',
              value: a.lesson,
              onChange: function (v) { zet({ lesson: String(v || '').replace(/[^A-Za-z0-9_-]/g, '') }); }
            })
          )
        ),
        el('div', useBlockProps({ className: 'wp-block-buttons' }),
          el('div', { className: 'wp-block-button' },
            el(RichText, {
              tagName: 'span',
              className: 'wp-block-button__link wp-element-button',
              value: a.label,
              allowedFormats: [],
              placeholder: 'Start de cursus',
              onChange: function (v) { zet({ label: v }); }
            })
          )
        )
      );
    },
    save: function () { return null; }
  });
}(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components));
