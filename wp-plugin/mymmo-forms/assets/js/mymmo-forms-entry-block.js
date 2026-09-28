/**
 * Het blok "Mymmo ingang" in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals mymmo-forms-block.js. Het blok toont in
 * de editor het ECHTE resultaat via ServerSideRender -- dezelfde render als op
 * de pagina, geen nabootsing.
 */

(function (blocks, element, blockEditor, components, serverSideRender) {
  'use strict';

  if (!blocks || !element || !serverSideRender) return;

  var el = element.createElement;
  var C = window.MymmoFormsEntryBlock || { ingangen: [], settingsUrl: '' };

  var InspectorControls = blockEditor.InspectorControls;
  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var Placeholder = components.Placeholder;
  var ExternalLink = components.ExternalLink;

  var SOORTEN = {
    knop: 'knop',
    klasse: 'klasse-haak',
    callout: 'callout'
  };

  function keuzes() {
    var uit = [{ label: '— kies een ingang —', value: '' }];
    (C.ingangen || []).forEach(function (i) {
      uit.push({ label: i.name + ' (' + (SOORTEN[i.soort] || i.soort) + ')', value: i.id });
    });
    return uit;
  }

  function ingangVan(id) {
    return (C.ingangen || []).filter(function (i) { return i.id === id; })[0] || null;
  }

  blocks.registerBlockType('mymmo/ingang', {
    apiVersion: 2,
    title: 'Mymmo ingang',
    description: 'Een ingang uit Mymmo Forms: een knop, een callout of alleen het formulier. Wat het is, staat bij de ingang zelf.',
    icon: 'external',
    category: 'widgets',
    keywords: ['formulier', 'offerte', 'callout', 'ingang', 'venster'],
    supports: { html: false, align: ['wide', 'full'] },

    attributes: {
      ingang: { type: 'string', default: '' },
      kaal: { type: 'boolean', default: false },
      vak: { type: 'boolean', default: true }
    },

    edit: function (props) {
      var id = props.attributes.ingang || '';
      var kaal = !!props.attributes.kaal;
      var vak = props.attributes.vak !== false;
      var gekozen = ingangVan(id);
      var blokProps = blockEditor.useBlockProps ? blockEditor.useBlockProps() : {};

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'Ingang', initialOpen: true },
          el(SelectControl, {
            label: 'Welke ingang',
            value: id,
            options: keuzes(),
            onChange: function (w) { props.setAttributes({ ingang: w }); },
            help: 'De teksten, de kleuren en het venster horen bij de ingang. Pas je die aan, dan verandert elke pagina mee waar dezelfde ingang staat.'
          }),
          el(ToggleControl, {
            label: 'Kaal tonen',
            checked: kaal,
            onChange: function (w) { props.setAttributes({ kaal: w }); },
            help: kaal
              ? 'Enkel het formulier of de stap, plus de knop. Titel, tekst en achtergrond komen dan van wat eromheen staat — zet dit aan als de ingang in een kaart staat.'
              : 'Uit: de ingang brengt haar eigen kaartje mee (titel, tekst, achtergrond). Staat ze in een kaart, zet dit dan aan.'
          }),
          kaal
            ? el(ToggleControl, {
                label: 'Met wit vak',
                checked: vak,
                onChange: function (w) { props.setAttributes({ vak: w }); },
                help: vak
                  ? 'Het onderdeel staat op een wit vlak met een zachte schaduw — hetzelfde vak als in de callout. Dat laat de bediening opvallen op een gekleurde kaart.'
                  : 'Zonder vak: het onderdeel staat rechtstreeks op wat eromheen zit. Voor een kaart die zelf al wit is.'
              })
            : null,
          C.settingsUrl
            ? el(ExternalLink, { href: C.settingsUrl }, 'Ingangen beheren')
            : null
        )
      );

      var inhoud = id
        ? el(serverSideRender, {
            block: 'mymmo/ingang',
            attributes: { ingang: id, kaal: kaal, vak: vak },
            httpMethod: 'POST'
          })
        : el(
            Placeholder,
            {
              icon: 'external',
              label: 'Mymmo ingang',
              instructions: (C.ingangen || []).length
                ? 'Kies rechts in de zijbalk welke ingang hier moet staan.'
                : 'Er zijn nog geen ingangen. Maak er een bij Instellingen → Mymmo Forms → Ingangen.'
            },
            C.settingsUrl
              ? el(ExternalLink, { href: C.settingsUrl }, 'Naar Ingangen')
              : null
          );

      return el(
        'div',
        blokProps,
        zijbalk,
        inhoud,
        gekozen
          ? el('p', { style: { margin: '6px 0 0', fontSize: '12px', color: '#646970' } },
              'Ingang: ' + gekozen.name + (kaal ? (vak ? ' — kaal, met vak' : ' — kaal, zonder vak') : ''))
          : null
      );
    },

    save: function () { return null; }
  });
}(
  window.wp && window.wp.blocks,
  window.wp && window.wp.element,
  window.wp && window.wp.blockEditor,
  window.wp && window.wp.components,
  window.wp && window.wp.serverSideRender
));
