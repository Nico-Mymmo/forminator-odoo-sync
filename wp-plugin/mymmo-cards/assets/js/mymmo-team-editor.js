/**
 * Het team in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Er is GEEN tweede renderer: het voorbeeld in de editor is de render van de
 * server (ServerSideRender), dus wat je hier ziet, is wat op de pagina komt.
 * De teamleden pas je niet hier aan maar in de lijst Team op de bron
 * (openvme.be); hier kies je WELKE groep, waar de tekst staat en hoe het
 * eruitziet.
 *
 * De gesloten lijsten, de groepen en het aantal teamleden komen uit
 * class-team.php via window.MymmoTeam: op de andere site komen ze van de bron,
 * dus niet uit de eigen REST van WordPress.
 */

(function (blocks, element, blockEditor, components, serverSideRender) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components) {
    return;
  }

  var el = element.createElement;
  var T = window.MymmoTeam || { teksten: [], koppen: [], kolommen: [], vormen: [], groepen: [], aantal: 0, isBron: true, bron: '', beheer: '', nieuw: '' };

  var InspectorControls = blockEditor.InspectorControls;
  var useBlockProps = blockEditor.useBlockProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var Placeholder = components.Placeholder;
  var Button = components.Button;
  var ExternalLink = components.ExternalLink;

  var ServerSideRender = serverSideRender && (serverSideRender.default || serverSideRender);

  var BLOK = 'mymmo/team';

  blocks.registerBlockType(BLOK, {
    apiVersion: 2,
    title: 'Team',
    description: 'Het team met foto, naam en functie, uit de lijst Team. De tekst over iemand verschijnt in de foto; op een telefoon veeg je erdoor.',
    category: 'mymmo',
    icon: 'groups',
    keywords: ['team', 'medewerkers', 'over ons', 'collega\'s', 'people', 'staff', 'about'],
    supports: {
      html: false,
      anchor: true,
      align: ['wide', 'full']
    },
    attributes: {
      align: { type: 'string', default: 'wide' },
      groep: { type: 'string', default: '' },
      tekst: { type: 'string', default: 'aanwijzen' },
      kop: { type: 'string', default: 'h3' },
      kolommen: { type: 'string', default: '4' },
      vorm: { type: 'string', default: 'hoog' }
    },

    edit: function (props) {
      var a = props.attributes;
      var zet = props.setAttributes;
      var blockProps = useBlockProps();

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Team', initialOpen: true },
          el(SelectControl, {
            label: 'Wie',
            value: a.groep,
            options: T.groepen && T.groepen.length ? T.groepen : [{ value: '', label: 'Iedereen' }],
            onChange: function (w) { zet({ groep: w }); },
            help: 'Iedereen, of een groep (bv. Directie). Groepen maak je in de lijst Team, onder Groepen.' + (T.isBron ? '' : ' Die lijst staat op ' + T.bron + '.'),
            __nextHasNoMarginBottom: true
          }),
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Tekst over de persoon',
            value: a.tekst,
            options: T.teksten,
            onChange: function (w) { zet({ tekst: w }); },
            help: 'In de foto: verschijnt bij aanwijzen met de muis, of na een tik op een telefoon. Een lange tekst maakt alle foto\'s in de rij wat hoger.',
            __nextHasNoMarginBottom: true
          }),
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Naam als',
            value: a.kop,
            options: T.koppen,
            onChange: function (w) { zet({ kop: w }); },
            help: 'Kop 3 onder een tussentitel (Kop 2) van de pagina. Vetgedrukte tekst als het team geen koppen mag toevoegen.',
            __nextHasNoMarginBottom: true
          }),
          el('p', { style: { marginTop: '16px' } },
            T.isBron
              ? 'Namen, functies, foto\'s en de volgorde pas je aan in de lijst Team. Ze gelden ook op de andere site. '
              : 'Het team komt van ' + T.bron + ': daar pas je namen, functies, foto\'s en de volgorde aan. Hier staat het binnen het kwartier. ',
            T.beheer ? el(ExternalLink, { href: T.beheer }, 'Team openen') : null)
        ),
        el(
          PanelBody,
          { title: 'Uitzicht', initialOpen: false },
          el(SelectControl, {
            label: 'Naast elkaar op een computer',
            value: a.kolommen,
            options: T.kolommen,
            onChange: function (w) { zet({ kolommen: w }); },
            help: 'Hoogstens. Op een telefoon en een tablet veeg je door het team.',
            __nextHasNoMarginBottom: true
          }),
          el('div', { style: { height: '16px' } }),
          el(SelectControl, {
            label: 'Vorm van de foto',
            value: a.vorm,
            options: T.vormen,
            onChange: function (w) { zet({ vorm: w }); },
            __nextHasNoMarginBottom: true
          })
        )
      );

      if (!T.aantal) {
        return el('div', blockProps, zijbalk, el(
          Placeholder,
          { icon: 'groups', label: 'Team', instructions: 'Er staat nog niemand in de lijst Team' + (T.isBron ? '' : ' op ' + T.bron) + '. Voeg een teamlid toe: naam, foto, functie en een korte tekst. Daarna verschijnt het hier (laad de pagina opnieuw).' },
          T.nieuw ? el(Button, { variant: 'primary', href: T.nieuw, target: '_blank' }, 'Nieuw teamlid') : null
        ));
      }

      return el(
        'div',
        blockProps,
        zijbalk,
        ServerSideRender
          ? el(ServerSideRender, {
            block: BLOK,
            attributes: a,
            httpMethod: 'POST',
            EmptyResponsePlaceholder: function () {
              return el(Placeholder, { icon: 'groups', label: 'Team', instructions: 'Niemand in deze groep. Kies rechts een andere groep, of zet teamleden in deze groep in de lijst Team.' });
            }
          })
          : el('p', {}, 'Het voorbeeld kan hier niet getoond worden.')
      );
    },

    save: function () {
      return null;
    }
  });
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.serverSideRender);
