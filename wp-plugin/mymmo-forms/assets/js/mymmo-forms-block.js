/**
 * Het blok "Mymmo formulier" in de blok-editor.
 *
 * Bewust ZONDER JSX en zonder bouwstap: deze plugin heeft er geen, en één blok
 * met drie keuzes is dat niet waard. wp.element.createElement doet hetzelfde.
 *
 * Je kiest een FORMULIER uit de Operations Manager en ziet het meteen staan via
 * ServerSideRender: die vraagt de server om de HTML van dit blok, met precies
 * dezelfde render als op de pagina. Geen nabootsing in de editor dus -- zelfde
 * afweging als het levende voorbeeld in de bouwer.
 *
 * Een bewaarde OPSTELLING kiezen kan nog (zo werkte het blok tot 1.18), maar
 * staat eronder, dichtgeklapt: voor een formulier op de pagina is die omweg niet
 * meer nodig.
 *
 * `save` geeft null: de HTML staat niet in de pagina-inhoud. Daardoor volgt een
 * pagina automatisch een gewijzigd formulier, en kan er nooit een
 * blokvalidatiefout ontstaan als de opmaak verandert.
 */

(function (blocks, element, blockEditor, components, serverSideRender) {
  'use strict';

  if (!blocks || !element || !serverSideRender) return;

  var el = element.createElement;

  function data() {
    return window.MymmoFormsBlock || { forms: [], presets: [], settingsUrl: '' };
  }

  var InspectorControls = blockEditor.InspectorControls;
  var PanelBody = components.PanelBody;
  var SelectControl = components.SelectControl;
  var ToggleControl = components.ToggleControl;
  var Placeholder = components.Placeholder;
  var ExternalLink = components.ExternalLink;
  var Notice = components.Notice;

  var TAALNAMEN = { nl: 'Nederlands', fr: 'Frans', en: 'Engels', de: 'Duits' };

  function formulier(slug) {
    return (data().forms || []).filter(function (f) { return f.slug === slug; })[0] || null;
  }

  function formulierKeuzes() {
    var uit = [{ label: '— kies een formulier —', value: '' }];
    (data().forms || []).forEach(function (f) {
      uit.push({ label: f.name, value: f.slug });
    });
    return uit;
  }

  function taalKeuzes(slug) {
    var f = formulier(slug);
    var uit = [{ label: 'Volg de pagina', value: '' }];
    ((f && f.languages) || []).forEach(function (t) {
      uit.push({ label: TAALNAMEN[t] || t.toUpperCase(), value: t });
    });
    return uit;
  }

  function opstellingKeuzes() {
    var uit = [{ label: '— geen —', value: '' }];
    (data().presets || []).forEach(function (p) {
      uit.push({
        label: p.name + (p.soort === 'inline' ? ' (formulier op de pagina)' : ' (knop met venster)'),
        value: p.id
      });
    });
    return uit;
  }

  function naamVanOpstelling(id) {
    var gevonden = (data().presets || []).filter(function (p) { return p.id === id; })[0];
    return gevonden ? gevonden.name : id;
  }

  blocks.registerBlockType('mymmo/forms', {
    apiVersion: 2,
    title: 'Mymmo formulier',
    description: 'Een formulier uit de Operations Manager, rechtstreeks op de pagina.',
    icon: 'feedback',
    category: 'widgets',
    keywords: ['formulier', 'offerte', 'contact', 'calendly'],
    supports: { html: false, align: ['wide', 'full'] },

    attributes: {
      slug: { type: 'string', default: '' },
      lang: { type: 'string', default: '' },
      title: { type: 'boolean', default: true },
      preset: { type: 'string', default: '' }
    },

    edit: function (props) {
      var a = props.attributes;
      var C = data();
      var blokProps = blockEditor.useBlockProps ? blockEditor.useBlockProps() : {};
      var talen = taalKeuzes(a.slug);

      var fout = C.formsError
        ? el(Notice, { status: 'error', isDismissible: false },
            'De formulieren konden niet opgehaald worden: ' + C.formsError)
        : (C.configured === false
          ? el(Notice, { status: 'warning', isDismissible: false },
              'De verbinding met de Operations Manager is nog niet ingesteld.')
          : null);

      var zijbalk = el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: 'Formulier', initialOpen: true },
          fout,
          el(SelectControl, {
            label: 'Welk formulier',
            value: a.slug,
            options: formulierKeuzes(),
            // Een ander formulier kan andere talen hebben; een taal die het
            // nieuwe niet kent zou stil terugvallen op de standaardtaal.
            onChange: function (waarde) { props.setAttributes({ slug: waarde, lang: '' }); },
            help: 'Formulieren maak en wijzig je in de Operations Manager, onder Koppelingen. '
              + 'Alleen gepubliceerde formulieren staan in deze lijst.'
          }),
          a.slug && talen.length > 2
            ? el(SelectControl, {
                label: 'Taal',
                value: a.lang,
                options: talen,
                onChange: function (waarde) { props.setAttributes({ lang: waarde }); }
              })
            : null,
          a.slug
            ? el(ToggleControl, {
                label: 'Titel van het formulier tonen',
                checked: a.title !== false,
                onChange: function (waarde) { props.setAttributes({ title: !!waarde }); }
              })
            : null
        ),
        el(
          PanelBody,
          { title: 'Of: een bewaarde opstelling', initialOpen: !a.slug && !!a.preset },
          el(SelectControl, {
            label: 'Opstelling',
            value: a.preset,
            options: opstellingKeuzes(),
            onChange: function (waarde) { props.setAttributes({ preset: waarde }); },
            help: a.slug
              ? 'Er is hierboven een formulier gekozen; dat wint. Zet het formulier op "kies" om een opstelling te tonen.'
              : 'Bijvoorbeeld een knop die het venster opent. Opstellingen maak je bij Instellingen → Mymmo Forms.'
          }),
          C.settingsUrl
            ? el(ExternalLink, { href: C.settingsUrl }, 'Opstellingen beheren')
            : null
        )
      );

      var attributen = a.slug
        ? { slug: a.slug, lang: a.lang, title: a.title !== false }
        : { preset: a.preset };

      // Nog niets gekozen: geen ServerSideRender aanroepen voor een leeg
      // resultaat, maar zeggen wat er te doen staat.
      var inhoud = (a.slug || a.preset)
        ? el(serverSideRender, {
            block: 'mymmo/forms',
            attributes: attributen,
            httpMethod: 'POST'
          })
        : el(
            Placeholder,
            {
              icon: 'feedback',
              label: 'Mymmo formulier',
              instructions: (C.forms || []).length
                ? 'Kies hieronder of rechts in de zijbalk welk formulier hier moet staan.'
                : 'Er zijn nog geen gepubliceerde formulieren. Maak er een in de Operations Manager, onder Koppelingen.'
            },
            (C.forms || []).length
              ? el(SelectControl, {
                  label: 'Formulier',
                  hideLabelFromVision: true,
                  value: a.slug,
                  options: formulierKeuzes(),
                  onChange: function (waarde) { props.setAttributes({ slug: waarde, lang: '' }); }
                })
              : null
          );

      var onderschrift = null;
      if (a.slug) {
        var f = formulier(a.slug);
        onderschrift = 'Formulier: ' + (f ? f.name : a.slug);
      } else if (a.preset) {
        onderschrift = 'Opstelling: ' + naamVanOpstelling(a.preset);
      }

      return el('div', blokProps, zijbalk, inhoud, onderschrift
        ? el('p', { style: { margin: '6px 0 0', fontSize: '12px', color: '#646970' } }, onderschrift)
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
