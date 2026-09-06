/**
 * Event Operations v2 — Startopzet voor de mails
 *
 * Niemand hoort met een leeg scherm te beginnen. Dit is de bestaande
 * bevestigingsmail (Odoo-template 50/55) omgezet in blokken, plus een
 * reminder en een recap in dezelfde stijl.
 *
 * DIT IS GEEN TWEEDE WAARHEID. Deze opzet wordt ALLEEN gebruikt als iemand in
 * de studio op "Begin met de standaardopzet" klikt; daarna staat de inhoud in
 * Odoo (x_studio_mail_blocks) en wordt hier nooit meer naar gekeken. Er is
 * dus geen pad waarlangs een wijziging hier een bestaande mail verandert.
 *
 * De drie hero-varianten zijn de `t-if`/`t-elif`/`t-else` uit de oude
 * QWeb-template: openvme, syndicoach, en `other` voor iedereen van wie we de
 * site niet kennen -- vandaag nog de grote meerderheid, want
 * x_studio_registration_site bestaat pas sinds kort.
 */

const CDN = 'https://link.openvme.be/assets/banners/mailheaders';

/**
 * De header: één afbeelding per bedrijf, plus een terugval voor wie via een
 * andere weg inschreef. Dit is in de praktijk vaak het ENIGE verschil tussen
 * de sites -- vandaar dat het een eigen veld is en geen blok.
 */
function header() {
  return {
    openvme: { src: `${CDN}/hero_mail_openvme.png`, alt: 'OpenVME', href: '' },
    syndicoach: { src: `${CDN}/hero_mail_syndicoach.png`, alt: 'Syndicoach', href: '' },
    fallback: { src: `${CDN}/hero_mail_openvme.png`, alt: 'Mymmo', href: '' }
  };
}

function closing(prefix) {
  return [
    { id: `${prefix}-card`, type: 'card_break' },
    { id: `${prefix}-signature`, type: 'signature' },
    {
      id: `${prefix}-footer`,
      type: 'footer',
      html:
        '&copy; {{now.year}} Mymmo BV &middot; {{site.name}} by ' +
        '<a href="https://housedrive.com/" style="color:#9ca3af;text-decoration:none;">Housedrive</a>' +
        ' &middot; Made in Antwerp with &#10084;&#65039;'
    }
  ];
}

/**
 * @returns {Object} een blokkendocument in de vorm van normalizeMailBlocks()
 */
export function starterMailBlocks() {
  return {
    confirmation: {
      subject: 'Je bent ingeschreven voor de {{event.type}}: {{event.title}}',
      preheader: '{{event.day}} om {{event.time}} — alle details staan in deze mail.',
      header: header(),
      blocks: [
        { id: 'c-title', type: 'heading', level: 2, text: 'Je bent ingeschreven voor de {{event.type}}' },
        { id: 'c-intro', type: 'text', html: '<p style="margin:0 0 16px 0;">Dag {{registration.first_name}}, goed nieuws: je inschrijving is helemaal in orde! &#9989;</p>' },
        { id: 'c-welkom', type: 'text', html: '<p style="margin:0 0 16px 0;">We kijken ernaar uit om je te verwelkomen op<br><strong>{{event.title}}</strong></p>' },
        { id: 'c-details', type: 'event_details', title: 'Details van het evenement:' },
        { id: 'c-agenda', type: 'text', html: '<p style="margin:0 0 16px 0;">Voeg dit gerust al toe aan je agenda. We sturen je nog een herinnering vlak voor de sessie begint, en achteraf krijg je een mail met de opname.</p>' },
        { id: 'c-outro', type: 'text', html: '<p style="margin:0;">Tot binnenkort. &#128075;</p>' },
        ...closing('c')
      ]
    },
    reminder: {
      subject: '\u{1F514} Morgen om {{event.time}}: {{event.title}}',
      preheader: 'Tot {{event.day}} om {{event.time}}. De deelnamelink staat in deze mail.',
      header: header(),
      blocks: [
        { id: 'r-title', type: 'heading', level: 2, text: 'Morgen is het zover' },
        { id: 'r-intro', type: 'text', html: '<p style="margin:0 0 16px 0;">Dag {{registration.first_name}}, kleine herinnering: <strong>{{event.title}}</strong> vindt morgen plaats.</p>' },
        { id: 'r-details', type: 'event_details', title: 'Praktisch:' },
        { id: 'r-cta', type: 'button', label: 'Neem deel', href: '{{event.link}}' },
        { id: 'r-outro', type: 'text', html: '<p style="margin:0;">Tot morgen! &#128075;</p>' },
        ...closing('r')
      ]
    },
    recap: {
      subject: 'Fijn dat je erbij was: {{event.title}}',
      preheader: 'De opname van {{event.title}} staat klaar.',
      header: header(),
      blocks: [
        { id: 'x-title', type: 'heading', level: 2, text: 'Bedankt voor je deelname' },
        { id: 'x-intro', type: 'text', html: '<p style="margin:0 0 16px 0;">Dag {{registration.first_name}}, fijn dat je erbij was op <strong>{{event.title}}</strong>. Hieronder vind je de opname.</p>' },
        // Leeg gelaten: het blok leest de opname van het event zelf
        // (x_studio_vimeo_url). Zo staat de videolink op één plek.
        { id: 'x-video', type: 'video', label: 'Bekijk de opname' },
        { id: 'x-outro', type: 'text', html: '<p style="margin:0;">Tot een volgende keer! &#128075;</p>' },
        ...closing('x')
      ]
    }
  };
}
