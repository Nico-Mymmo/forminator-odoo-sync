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
    // ── Bevestiging — uit mail.template 50/55 ───────────────────────────────
    confirmation: {
      header: header(),
      subject: 'Je bent ingeschreven voor de {{event.type}}: {{event.title}}',
      preheader: '{{event.day}} om {{event.time}} — alle details staan in deze mail.',
      blocks: [
        { id: 'c-title', type: 'heading', level: 2, text: 'Je bent ingeschreven voor de {{event.type}}' },
        { id: 'c-intro', type: 'text', html: '<p style="margin:0 0 16px 0;">Goed nieuws, je inschrijving is helemaal in orde! &#9989;</p>' },
        { id: 'c-welkom', type: 'text', html: '<p style="margin:0 0 16px 0;">We kijken ernaar uit om je binnenkort te verwelkomen op onze {{event.type}}.<br><strong>{{event.title}}</strong></p>' },
        { id: 'c-details', type: 'event_details', title: 'Details van het evenement:' },
        { id: 'c-agenda', type: 'text', html: '<p style="margin:0 0 16px 0;">Voeg dit gerust al toe aan je agenda. We sturen je nog een herinnering vlak voor de sessie van start gaat. Je krijgt achteraf ook een mail met de opname.</p>' },
        { id: 'c-outro', type: 'text', html: '<p style="margin:0;">Tot binnenkort. &#128075;<br>We kijken ernaar uit!</p>' },
        ...closing('c')
      ]
    },

    // ── Reminder — uit mail.template 52/56 ──────────────────────────────────
    reminder: {
      header: header(),
      subject: '\u{1F514} Reminder voor de {{event.type}} om {{event.time}} — {{event.title}}',
      preheader: 'Tot {{event.day}} om {{event.time}}. De deelnamelink staat in deze mail.',
      blocks: [
        { id: 'r-title', type: 'heading', level: 2, text: '\u23F0 Morgen is het zover' },
        { id: 'r-intro', type: 'text', html: '<p style="margin:0 0 16px 0;">Dit is een vriendelijke herinnering dat je morgen deelneemt aan onze <strong>{{event.type}}</strong>.</p>' },
        { id: 'r-zin', type: 'text', html: '<p style="margin:0 0 16px 0;">We hebben er zin in en kijken ernaar uit om je erbij te hebben!</p>' },
        // Datum, tijd en spreker in het kader; de deelnamelink staat eronder
        // als knop -- precies zoals template 52 het deed.
        { id: 'r-details', type: 'event_details', title: 'Nog een paar details:', show: ['day', 'time', 'host'] },
        { id: 'r-cta', type: 'button', label: 'Deelnemen aan de sessie', href: '{{event.link}}' },
        { id: 'r-tips', type: 'text', html: '<p style="margin:0 0 16px 0;">Enkele praktische tips:</p><ul style="margin:0 0 16px 20px;padding:0 0 0 12px;"><li>Log een paar minuten vooraf in.</li><li>Zorg voor een stabiele internetverbinding.</li><li>Heb je vragen? Noteer ze alvast, er is ruimte voorzien voor interactie.</li></ul>' },
        { id: 'r-afwezig', type: 'text', html: '<p style="margin:0 0 16px 0;">Kan je er toch niet bij zijn? Geen probleem. Laat het ons even weten, dan houden we je op de hoogte van toekomstige sessies.</p>' },
        { id: 'r-outro', type: 'text', html: '<p style="margin:0;">Tot morgen &#128075;<br>We kijken ernaar uit om samen een waardevolle sessie neer te zetten.</p>' },
        ...closing('r')
      ]
    },

    // ── Recap — uit mail.template 53 ────────────────────────────────────────
    recap: {
      header: header(),
      subject: 'Fijn dat je erbij was tijdens de {{event.type}}: {{event.title}}',
      preheader: 'De opname van {{event.title}} staat klaar.',
      blocks: [
        { id: 'x-title', type: 'heading', level: 2, text: 'Fijn dat je erbij was!' },
        { id: 'x-hallo', type: 'text', html: '<p style="margin:0 0 12px 0;">Beste {{registration.first_name}},</p>' },
        { id: 'x-dank', type: 'text', html: '<p style="margin:0 0 12px 0;">Bedankt dat je deelnam aan <strong>{{event.title}}</strong>.</p>' },
        { id: 'x-opname-intro', type: 'text', html: '<p style="margin:0;">Hieronder kan je de opname opnieuw bekijken.</p>' },
        // Eigen kaart voor de opname, zoals in template 53. Het blok leest de
        // video van het event; is er geen, dan valt de hele kaart weg.
        { id: 'x-card-video', type: 'card_break' },
        { id: 'x-video', type: 'video', label: 'Bekijk de opname' },
        // Vrije nabeschouwing per event (x_studio_followup_html). Leeg = weg.
        { id: 'x-card-followup', type: 'card_break' },
        { id: 'x-followup', type: 'text', html: '{{event.recap_html}}' },
        ...closing('x')
      ]
    }
  };
}
