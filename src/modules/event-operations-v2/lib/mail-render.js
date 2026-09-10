/**
 * Event Operations v2 — placeholders en mailopmaak voor events
 *
 * De OPMAAK zelf (blokken → HTML) staat sinds de `send_mail`-stap in
 * Koppelingen in `src/lib/mail/render-blocks.js`, omdat twee modules dezelfde
 * mails moeten kunnen bouwen en twee kopieën van een renderer onvermijdelijk
 * uit elkaar gaan lopen. Wat hier staat, is wat écht over events gaat:
 *
 *   TOKEN_LABELS            — welke placeholders een event kent en hoe ze heten
 *   formatEventMoment       — dag en uur in Europe/Brussels uit starts_at
 *   buildPlaceholderContext — event + inschrijving + host → placeholderwaarden
 *
 * `renderMailHtml` en `tokenizeToChips` worden hier omhuld zodat ze de
 * event-labels automatisch meekrijgen; al het andere wordt gewoon
 * her-geexporteerd. Bestaande imports uit dit bestand blijven dus werken --
 * mail-service.js, routes.js en de tests hoefden niet aangepast te worden.
 *
 * Pure module: geen I/O, geen env. Opzoekwerk (welk event kondigt een
 * aankondigingsblok aan) hoort in mail-service.js.
 */

import { TIMEZONE, LOCALE } from '../constants.js';
import {
  renderMailHtml as renderMailHtmlBase,
  tokenizeToChips as tokenizeToChipsBase
} from '../../../lib/mail/render-blocks.js';

// Ongewijzigd doorgegeven: deze hebben geen event-context nodig.
export {
  esc,
  safeUrl,
  fillPlaceholders,
  renderSubject,
  knopStijl,
  leesbareTekstkleur
} from '../../../lib/mail/render-blocks.js';

/**
 * Merknaam per site, voor {{site.name}}.
 *
 * Staat hier en niet bij de gedeelde renderer: hij vult uitsluitend een
 * waarde in de placeholdercontext, en die context is per module anders.
 * De oorspronkelijke template zette hier hard "OpenVME" neer, ook in de
 * mail van iemand die op syndicoach.be inschreef.
 */
const SITE_NAME = { openvme: 'OpenVME', syndicoach: 'Syndicoach' };

/**
 * Leesbare naam per placeholder. Wordt getoond in de chip in de editor -- een
 * gebruiker hoort "Titel van het event" te zien, niet `{{event.title}}`.
 */
export const TOKEN_LABELS = {
  'event.title': 'Titel van het event',
  'event.summary': 'Samenvatting',
  'event.day': 'Datum',
  'event.time': 'Uur',
  'event.starts_at': 'Startmoment',
  'event.location': 'Locatie',
  'event.maps_url': 'Route naar de locatie',
  'event.link': 'Deelnamelink',
  'event.url': 'Link naar de eventpagina',
  'event.type': 'Soort event',
  'event.video_url': 'Link naar de opname',
  'event.video_thumbnail': 'Beeld van de opname',
  'event.recap_html': 'Nabeschouwing van het event',
  'event.capacity': 'Aantal plaatsen',
  'event.seats_left': 'Nog vrije plaatsen',
  'host.name': 'Naam van de host',
  'host.email': 'E-mail van de host',
  'host.job_title': 'Functie van de host',
  'host.avatar_url': 'Foto van de host',
  'site.name': 'Naam van het bedrijf',
  'site.key': 'Bedrijfssleutel',
  'registration.name': 'Naam van de deelnemer',
  'registration.first_name': 'Voornaam van de deelnemer',
  'registration.email': 'E-mail van de deelnemer',
  'now.year': 'Huidig jaar'
};

/**
 * Placeholders als chip tonen, met de LABELS VAN EEN EVENT erin.
 *
 * De generieke versie in render-blocks.js kent geen labels; die krijgt ze als
 * parameter. Deze omhulling bestaat zodat elke bestaande aanroep binnen de
 * events-module ongewijzigd de juiste namen blijft tonen.
 *
 * @param {string} html @returns {string}
 */
export function tokenizeToChips(html) {
  return tokenizeToChipsBase(html, TOKEN_LABELS);
}

/**
 * Dag en uur in Europe/Brussels, afgeleid uit de ISO-startdatum.
 *
 * BEWUST NIET x_studio_starting_day / x_studio_starting_time. Die char-velden
 * worden door Odoo-cron 85 (server action 1109) uit `x_studio_event_datetime`
 * geschreven ZONDER tijdzone-conversie, terwijl Odoo in UTC bewaart: een event
 * na 22:00 UTC komt daar op de verkeerde dag te staan. Ze worden bovendien
 * alleen dagelijks bijgewerkt, dus een event dat vandaag verplaatst wordt
 * heeft tot de volgende run een verkeerde dag in de mail.
 *
 * @param {string|null} isoStartsAt @returns {{ day: string, time: string }}
 */
export function formatEventMoment(isoStartsAt) {
  if (!isoStartsAt) return { day: '', time: '' };
  const date = new Date(isoStartsAt);
  if (Number.isNaN(date.getTime())) return { day: '', time: '' };

  // Vorm: "dinsdag, 8 september" -- met komma, precies zoals de bestaande
  // mails het tonen. `nl-BE` laat die komma weg, dus de delen worden hier
  // zelf samengesteld in plaats van op de opmaak van de locale te vertrouwen.
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).formatToParts(date);

  const part = (type) => parts.find((p) => p.type === type)?.value || '';
  const day = `${part('weekday')}, ${part('day')} ${part('month')}`;

  const time = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);

  return { day, time };
}

/**
 * De waarden die in een placeholder gebruikt mogen worden. Bewust een PLATTE,
 * expliciete vorm en niet de ruwe DTO's: dan kan een placeholder nooit per
 * ongeluk een intern veld of het e-mailadres van iemand anders uitlekken.
 *
 * @param {Object} options
 * @param {Object} options.event - DTO uit toEventDto (detailvorm)
 * @param {Object} [options.registration] - DTO uit toRegistrationDto
 * @param {Object} [options.host] - { email, jobTitle, avatarUrl } uit resolveSender()
 * @param {string} [options.publicUrl]
 * @param {Date} [options.now]
 * @returns {Object}
 */
export function buildPlaceholderContext({
  event,
  registration = null,
  host = {},
  publicUrl = '',
  typeColor = '',
  // Per aankondigingsblok het event dat het blok aankondigt, op blok-id:
  // { [blockId]: { title, day, time, location, link, url, type, summary } }.
  // Dit staat NIET in de placeholders: er kunnen meerdere aankondigingen in
  // één mail staan, dus "{{announcement.title}}" zou dubbelzinnig zijn. De
  // renderer haalt het per blok op. Opzoeken gebeurt in mail-service.js --
  // deze module blijft puur.
  announcements = {},
  now = new Date()
}) {
  const displayName = String(registration?.name || '').trim();
  const firstName = displayName === '' ? '' : displayName.split(/\s+/)[0];
  const moment = formatEventMoment(event?.starts_at);
  const siteKey = String(registration?.site || '').trim().toLowerCase();

  return {
    event: {
      title: event?.title || '',
      summary: event?.summary || '',
      day: moment.day,
      time: moment.time,
      starts_at: event?.starts_at || '',
      // location is in het DTO een object ({ name }), online_url een string.
      location: event?.location?.name || '',
      link: event?.online_url || '',
      url: publicUrl || '',
      type: event?.event_type?.name || '',
      // De kleur van de eventcategorie, voor knoppen in de huisstijl. Komt
      // uit x_studio_type_color_hex op het event-type, met terugval op
      // EVENT_TYPE_PRESENTATION in constants.js -- dezelfde bron als de
      // kalender op de website gebruikt, zodat mail en site niet uit elkaar
      // lopen.
      type_color: typeColor || '',
      // De opname hoort BIJ HET EVENT (x_studio_vimeo_url), niet bij de mail.
      // Het recapblok leest ze hiervandaan, zodat niemand een videolink in een
      // mailsjabloon hoeft te plakken en er nooit twee versies van bestaan.
      video_url: event?.recap?.video_url || '',
      video_thumbnail: event?.recap?.thumbnail_url || '',
      // Vrije nabeschouwing per event (x_studio_followup_html). Template 53
      // toonde die met een t-if; als blok-placeholder valt hij vanzelf weg
      // wanneer het veld leeg is.
      recap_html: event?.recap?.body_html || '',
      // Route naar de locatie. `google.com/maps/search/?api=1` is de vorm die
      // Google zelf documenteert voor alle platformen: op iOS en Android
      // opent die de Maps-app als die geïnstalleerd is, en anders de
      // browser. Een `geo:`- of `maps://`-link doet dat maar op één van de
      // twee en breekt op desktop.
      maps_url: event?.location?.name
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location.name)}`
        : '',
      capacity: event?.registration?.capacity ? String(event.registration.capacity) : '',
      seats_left: event?.registration?.seats_left === null || event?.registration?.seats_left === undefined
        ? ''
        : String(event.registration.seats_left)
    },
    host: {
      name: event?.host?.name || '',
      email: host?.email || '',
      job_title: host?.jobTitle || '',
      avatar_url: host?.avatarUrl || ''
    },
    // De oorspronkelijke template zette hier hard "OpenVME" neer, ook in de
    // mail van iemand die op syndicoach.be inschreef. Nu volgt het de site.
    site: {
      key: siteKey,
      name: SITE_NAME[siteKey] || 'Mymmo'
    },
    registration: {
      name: displayName,
      first_name: firstName,
      email: registration?.submitted_email || registration?.email || ''
    },
    now: { year: String(now.getFullYear()) },
    announcements: announcements || {}
  };
}

/**
 * Volledige mail renderen, met de event-labels voor de chips in de editor.
 *
 * Alle overige opties gaan ongewijzigd door naar de gedeelde renderer; zie
 * `renderMailHtml` in `src/lib/mail/render-blocks.js` voor de vorm. Een
 * meegegeven `tokenLabels` wint van de standaard, zodat een aanroeper die
 * eigen labels heeft niet vastzit aan de event-lijst.
 *
 * @param {Object} options @returns {string}
 */
export function renderMailHtml(options) {
  return renderMailHtmlBase({ tokenLabels: TOKEN_LABELS, ...options });
}
