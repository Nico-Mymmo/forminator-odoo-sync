/**
 * Het blok "Mymmo formulier" in de blok-editor.
 *
 * Bewust ZONDER JSX en zonder bouwstap: deze plugin heeft er geen, en één blok
 * met één keuzelijst is dat niet waard. wp.element.createElement doet hetzelfde.
 *
 * Het blok toont in de editor het ECHTE resultaat via ServerSideRender: die
 * vraagt de server om de HTML van dit blok, met precies dezelfde render als op
 * de pagina. Geen nabootsing in de editor dus -- zelfde afweging als het levende
 * voorbeeld in de bouwer.
 *
 * `save` geeft null: de HTML staat niet in de pagina-inhoud. Daardoor volgt een
 * pagina automatisch een gewijzigde opstelling, en kan er nooit een
 * blokvalidatiefout ontstaan als de opmaak van het venster verandert.
 */

(function (blocks, element, blockEditor, components, serverSideRender) {
  'use strict';

  if (!blocks || !element || !serverSideRender) return;

  var el = element.createElement;
  var C = window.MymmoFormsBlock || { presets: [], settingsUrl: '' };

  var InspectorControls = blockEditor.InspectorControls;
  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var Placeholder = components.Placeholder;
  var ExternalLink = components.ExternalLink;

  /** De keuzelijst: eerst niets gekozen, dan de opstellingen op naam. */
  function keuzes() {
    var uit = [{ label: '— kies een opstelling —', value: '' }];
    (C.presets || []).forEach(function (p) {
      uit.push({
        label: p.name + (p.soort === 'inline' ? ' (formulier op de pagina)' : ' (knop met venster)'),
        value: p.id
      });
    });
    return uit;
  }

  function naamVan(id) {
    var gevonden = (C.presets || []).filter(function (p) { return p.id === id; })[0];
    return gevonden ? gevonden.name : '';
  }

  blocks.registerBlockType('mymmo/forms', {
    apiVersion: 2,
    title: 'Mymmo formulier',
    description: 'Een formulier uit de Operations Manager, in de opstelling die je bij Instellingen → Mymmo Forms bewaarde.',
    icon: 'feedback',
    category: 'widgets',
    keywords: ['formulier', 'offerte', 'contact', 'calendly'],
    supports: { html: false, align: ['wide', 'full'] },

    attributes: {
      preset: { type: 'string', default: '' }
    },

    edit: function (props) {
      var preset = props.attributes.preset || '';
      var blokProps = blockEditor.useBlockProps ? blockEditor.useBlockProps() : {};

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'Opstelling', initialOpen: true },
          el(SelectControl, {
            label: 'Welke opstelling',
            value: preset,
            options: keuzes(),
            onChange: function (waarde) { props.setAttributes({ preset: waarde }); },
            help: 'De teksten, de kleur en de agenda horen bij de opstelling. '
              + 'Pas je die aan, dan verandert elke pagina mee die dezelfde opstelling gebruikt.'
          }),
          C.settingsUrl
            ? el(ExternalLink, { href: C.settingsUrl }, 'Opstellingen beheren')
            : null
        )
      );

      // Nog niets gekozen: geen ServerSideRender aanroepen voor een leeg
      // resultaat, maar zeggen wat er te doen staat.
      var inhoud = preset
        ? el(serverSideRender, {
            block: 'mymmo/forms',
            attributes: { preset: preset },
            // Zonder dit knippert het blok bij elke toetsaanslag elders in de
            // editor; de inhoud hangt maar van één attribuut af.
            httpMethod: 'POST'
          })
        : el(
            Placeholder,
            {
              icon: 'feedback',
              label: 'Mymmo formulier',
              instructions: (C.presets || []).length
                ? 'Kies rechts in de zijbalk welke opstelling hier moet staan.'
                : 'Er zijn nog geen opstellingen. Maak er een bij Instellingen → Mymmo Forms; '
                  + 'daar staat een voorbeeld waarin je alles kan zetten.'
            },
            C.settingsUrl
              ? el(ExternalLink, { href: C.settingsUrl }, 'Naar Mymmo Forms')
              : null
          );

      return el('div', blokProps, zijbalk, inhoud, preset
        ? el('p', {
            style: { margin: '6px 0 0', fontSize: '12px', color: '#646970' }
          }, 'Opstelling: ' + (naamVan(preset) || preset))
        : null);
    },

    // Server-side gerenderd; er staat dus niets van dit blok in de pagina zelf.
    save: function () { return null; }
  });
}(
  window.wp && window.wp.blocks,
  window.wp && window.wp.element,
  window.wp && window.wp.blockEditor,
  window.wp && window.wp.components,
  window.wp && window.wp.serverSideRender
));
