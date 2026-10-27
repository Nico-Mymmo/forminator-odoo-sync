/**
 * Het team in de blok-editor.
 *
 * Zonder JSX en zonder bouwstap, zoals de andere editors van deze plugin.
 *
 * Er is GEEN tweede renderer: het voorbeeld in de editor is de render van de
 * server (ServerSideRender), dus wat je hier ziet, is wat op de pagina komt.
 * De teamleden pas je niet hier aan maar in de lijst Team (links in het
 * menu); hier kies je WELKE groep, waar de tekst staat en hoe het eruitziet.
 *
 * De gesloten lijsten komen uit class-team.php via window.MymmoTeam.
 */

(function (blocks, element, blockEditor, components, data, serverSideRender) {
  'use strict';

  if (!blocks || !element || !blockEditor || !components || !data) {
    return;
  }

  var el = element.createElement;
  var T = window.MymmoTeam || { teksten: [], koppen: [], kolommen: [], vormen: [], type: 'mymmo_teamlid', groep: 'mymmo_team_groep', beheer: '', nieuw: '' };

  var InspectorControls = blockEditor.InspectorControls;
  var useBlockProps = blockEditor.useBlockProps;

  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var Placeholder = components.Placeholder;
  var Button = components.Button;
  var Spinner = components.Spinner;
  var ExternalLink = components.ExternalLink;

  var ServerSideRender = serverSideRender && (serverSideRender.default || serverSideRender);

  var BLOK = 'mymmo/team';

  /** De groepen en of er al teamleden zijn, uit de site zelf. */
  function useLijst() {
    return data.useSelect(function (select) {
      var kern = select('core');
      var vraag = { per_page: 1, status: 'publish', _fields: 'id' };
      var leden = kern.getEntityRecords('postType', T.type, vraag);
      var groepen = kern.getEntityRecords('taxonomy', T.groep, { per_page: 100, _fields: 'id,name,slug' });
      return {
        leden: leden,
        groepen: groepen,
        klaar: kern.hasFinishedResolution('getEntityRecords', ['postType', T.type, vraag])
      };
    }, []);
  }

  function groepOpties(groepen) {
    var uit = [{ value: '', label: 'Iedereen' }];
    (groepen || []).forEach(function (g) {
      uit.push({ value: g.slug, label: g.name });
    });
    return uit;
  }

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
      var lijst = useLijst();

      var zijbalk = el(
        InspectorControls,
        {},
        el(
          PanelBody,
          { title: 'Team', initialOpen: true },
          el(SelectControl, {
            label: 'Wie',
            value: a.groep,
            options: groepOpties(lijst.groepen),
            onChange: function (w) { zet({ groep: w }); },
            help: 'Iedereen, of een groep (bv. Directie). Groepen maak je in de lijst Team, onder Groepen.',
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
            'Namen, functies, foto\'s en de volgorde pas je aan in de lijst Team. ',
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

      if (!lijst.klaar) {
        return el('div', blockProps, zijbalk, el(Placeholder, { icon: 'groups', label: 'Team' }, el(Spinner)));
      }

      if (!lijst.leden || !lijst.leden.length) {
        return el('div', blockProps, zijbalk, el(
          Placeholder,
          { icon: 'groups', label: 'Team', instructions: 'Er staat nog niemand in de lijst Team. Voeg een teamlid toe: naam, foto, functie en een korte tekst. Daarna verschijnt het hier.' },
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
})(window.wp && window.wp.blocks, window.wp && window.wp.element, window.wp && window.wp.blockEditor, window.wp && window.wp.components, window.wp && window.wp.data, window.wp && window.wp.serverSideRender);
