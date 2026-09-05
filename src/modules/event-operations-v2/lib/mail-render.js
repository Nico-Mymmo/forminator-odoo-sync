/**
 * Event Operations v2 — Blokken → HTML
 *
 * Pure module: geen I/O, geen env. De uitvoer is een volledige HTML-mail,
 * klaar om als `body_html` op een `mail.mail` te zetten.
 *
 * TABELLEN, GEEN FLEXBOX. Outlook (Word-renderer) kent geen flex/grid en
 * negeert `<style>`-blokken in de body; alle opmaak staat dus inline en de
 * layout loopt via geneste tabellen. Dat is lelijk om te lezen en de enige
 * vorm die overal aankomt.
 *
 * GEEN QWEB. De mails worden hier gerenderd, niet door Odoo -- dat is het
 * hele punt van deze fase. `mail.mail.body_html` wordt door Odoo NIET nog
 * eens door QWeb gehaald (in tegenstelling tot `mail.template.body_html`),
 * dus wat hier uitkomt is letterlijk wat de ontvanger krijgt.
 */

import { BLOCK_TYPE, blocksForSite } from './mail-blocks.js';
import { TIMEZONE, LOCALE } from '../constants.js';

/** Basiskleuren. Bewust hier en niet in constants.js: dit is mail-opmaak. */
const STYLE = {
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#f4f4f5',
  card: '#ffffff',
  accent: '#0369a1',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  width: 600
};

/**
 * HTML-escape voor tekst die in een attribuut of tussen tags belandt.
 * @param {any} value
 * @returns {string}
 */
export function esc(value) {
  return String(value === null || value === undefined || value === false ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Alleen http(s) doorlaten. Een `javascript:`-URL in een mail doet niets in
 * een mailclient, maar wél in de previewpaneel-iframe in de OM.
 *
 * @param {any} value
 * @returns {string}
 */
export function safeUrl(value) {
  const raw = String(value || '').trim();
  if (raw === '') return '';
  if (!/^https?:\/\//i.test(raw)) return '';
  return esc(raw);
}

/**
 * Placeholders vervangen. Logic-loos: `{{pad.naar.waarde}}` en niets anders.
 * Geen conditionals, geen loops, geen eval -- wie variatie wil, zet `sites`
 * op een blok (zie mail-blocks.js).
 *
 * Een onbekende placeholder wordt een LEGE string, niet zijn eigen naam:
 * `{{event.location}}` in de mail van een online event hoort weg te vallen,
 * niet als accolades bij de ontvanger te belanden.
 *
 * @param {string} template
 * @param {Object} context
 * @returns {string}
 */
export function fillPlaceholders(template, context) {
  if (typeof template !== 'string' || template === '') return '';

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), context);
    if (value === null || value === undefined || value === false) return '';
    return String(value);
  });
}

/**
 * Dag en uur in Europe/Brussels, uit de ISO-startdatum.
 *
 * BEWUST NIET x_studio_starting_day / x_studio_starting_time uit Odoo. Die
 * twee char-velden worden gevuld door Odoo-cron 85 (server action 1109/1110),
 * die `x_studio_event_datetime` uitleest ZONDER tijdzone-conversie -- Odoo
 * bewaart in UTC, dus een event om 23:30 Brussels staat daar op de verkeerde
 * dag. Bovendien schrijft die cron enkel `starting_day`; `starting_time`
 * blijft leeg, terwijl mailtemplate 52/56 het wél in hun onderwerp zetten.
 *
 * Hier afleiden maakt die cron overbodig en houdt de mail correct, ook voor
 * een event dat vandaag nog aangemaakt of verplaatst wordt.
 *
 * @param {string|null} isoStartsAt
 * @returns {{ day: string, time: string }}
 */
export function formatEventMoment(isoStartsAt) {
  if (!isoStartsAt) return { day: '', time: '' };
  const date = new Date(isoStartsAt);
  if (Number.isNaN(date.getTime())) return { day: '', time: '' };

  const day = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date);

  const time = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);

  return { day, time };
}

/**
 * De waarden die in een placeholder gebruikt mogen worden. Bewust een
 * PLATTE, expliciete vorm en niet de ruwe DTO's: dan kan een placeholder
 * nooit per ongeluk een intern veld of een e-mailadres van iemand anders
 * uitlekken.
 *
 * @param {Object} options
 * @param {Object} options.event - DTO uit toEventDto (detailvorm)
 * @param {Object} [options.registration] - DTO uit toRegistrationDto
 * @param {string} [options.hostEmail] - res.users.email van de host; staat
 *   niet in het event-DTO en wordt apart meegegeven door mail-service.js
 * @param {string} [options.publicUrl] - volledige URL van de eventpagina
 * @returns {Object}
 */
export function buildPlaceholderContext({ event, registration = null, hostEmail = '', publicUrl = '' }) {
  const displayName = String(registration?.name || '').trim();
  const firstName = displayName === '' ? '' : displayName.split(/\s+/)[0];
  const moment = formatEventMoment(event?.starts_at);

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
      type: event?.event_type?.name || ''
    },
    host: {
      name: event?.host?.name || '',
      email: hostEmail || ''
    },
    registration: {
      name: displayName,
      first_name: firstName,
      email: registration?.submitted_email || registration?.email || ''
    }
  };
}

/**
 * Eén blok → HTML-fragment (altijd een `<tr>` in de buitenste tabel).
 *
 * @param {Object} block
 * @param {Object} context
 * @returns {string}
 */
function renderBlock(block, context) {
  const fill = (value) => fillPlaceholders(String(value || ''), context);
  const cell = (inner, padding = '0 32px 20px') =>
    `<tr><td style="padding:${padding};font-family:${STYLE.font};">${inner}</td></tr>`;

  switch (block.type) {
    case BLOCK_TYPE.HERO: {
      const src = safeUrl(fill(block.src));
      if (src === '') return '';
      const alt = esc(fill(block.alt));
      const href = safeUrl(fill(block.href));
      const img = `<img src="${src}" alt="${alt}" width="${Number(block.width) || 180}" style="display:block;border:0;max-width:100%;height:auto;">`;
      return cell(href === '' ? img : `<a href="${href}" target="_blank">${img}</a>`, '32px 32px 20px');
    }

    case BLOCK_TYPE.HEADING: {
      const text = esc(fill(block.text));
      if (text === '') return '';
      const level = [1, 2, 3].includes(Number(block.level)) ? Number(block.level) : 2;
      const size = { 1: 26, 2: 20, 3: 16 }[level];
      return cell(
        `<h${level} style="margin:0;font-size:${size}px;line-height:1.3;font-weight:600;color:${STYLE.text};">${text}</h${level}>`
      );
    }

    case BLOCK_TYPE.TEXT: {
      // `html` is redactionele inhoud uit Odoo: vertrouwd, dus niet ge-escaped.
      // Placeholders worden er wél in ingevuld.
      const html = fill(block.html);
      if (html.trim() === '') return '';
      return cell(
        `<div style="margin:0;font-size:15px;line-height:1.6;color:${STYLE.text};">${html}</div>`
      );
    }

    case BLOCK_TYPE.EVENT_DETAILS: {
      // De praktische regels: datum, uur, locatie of link. Wat leeg is valt
      // weg -- een online event heeft geen locatie, een live event geen link.
      const rows = [
        ['Wanneer', [context.event.day, context.event.time].filter(Boolean).join(', ')],
        ['Waar', context.event.location],
        ['Link', context.event.link]
      ]
        .filter(([, value]) => String(value || '').trim() !== '')
        .map(([label, value]) => {
          const isLink = /^https?:\/\//i.test(String(value));
          const shown = isLink
            ? `<a href="${safeUrl(value)}" target="_blank" style="color:${STYLE.accent};">${esc(value)}</a>`
            : esc(value);
          return (
            `<tr>` +
            `<td style="padding:6px 12px 6px 0;font-size:14px;color:${STYLE.muted};white-space:nowrap;vertical-align:top;">${esc(label)}</td>` +
            `<td style="padding:6px 0;font-size:14px;color:${STYLE.text};">${shown}</td>` +
            `</tr>`
          );
        })
        .join('');

      if (rows === '') return '';
      return cell(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
        `style="border-collapse:collapse;border:1px solid ${STYLE.border};border-radius:6px;">` +
        `<tr><td style="padding:12px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>` +
        `</table>`
      );
    }

    case BLOCK_TYPE.BUTTON: {
      const href = safeUrl(fill(block.href));
      const label = esc(fill(block.label));
      if (href === '' || label === '') return '';
      return cell(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td ` +
        `style="background:${STYLE.accent};border-radius:6px;">` +
        `<a href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${STYLE.font};` +
        `font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>` +
        `</td></tr></table>`
      );
    }

    case BLOCK_TYPE.VIDEO: {
      // Geen <iframe> in een mail: mailclients strippen die. Een thumbnail
      // die naar de video linkt is de enige vorm die werkt.
      const href = safeUrl(fill(block.href));
      const thumb = safeUrl(fill(block.thumbnail));
      if (href === '' || thumb === '') return '';
      const alt = esc(fill(block.alt) || 'Bekijk de opname');
      return cell(
        `<a href="${href}" target="_blank"><img src="${thumb}" alt="${alt}" width="${STYLE.width - 64}" ` +
        `style="display:block;border:0;max-width:100%;height:auto;border-radius:6px;"></a>`
      );
    }

    case BLOCK_TYPE.DIVIDER:
      return cell(`<div style="height:1px;background:${STYLE.border};line-height:1px;font-size:0;">&nbsp;</div>`);

    case BLOCK_TYPE.SPACER: {
      const height = Math.min(Math.max(Number(block.height) || 16, 4), 80);
      return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
    }

    default:
      // normalizeMailBlocks() weert onbekende types al; dit is het vangnet.
      return '';
  }
}

/**
 * Volledige mail renderen.
 *
 * @param {Object} options
 * @param {Object[]} options.blocks - uit resolveSection()
 * @param {Object} options.context - uit buildPlaceholderContext()
 * @param {string|null} [options.site] - x_studio_registration_site
 * @param {string} [options.preheader]
 * @returns {string} volledige HTML
 */
export function renderMailHtml({ blocks, context, site = null, preheader = '' }) {
  const visible = blocksForSite(blocks, site);
  const body = visible.map((block) => renderBlock(block, context)).join('');
  const pre = esc(fillPlaceholders(String(preheader || ''), context));

  // De preheader is de voorbeeldtekst in de inbox: zichtbaar in de lijst,
  // onzichtbaar in de mail zelf.
  const preheaderHtml =
    pre === ''
      ? ''
      : `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre}</div>`;

  return (
    `<div style="margin:0;padding:0;background:${STYLE.background};">` +
    preheaderHtml +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;background:${STYLE.background};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${STYLE.width}" ` +
    `style="border-collapse:collapse;width:100%;max-width:${STYLE.width}px;background:${STYLE.card};border-radius:8px;">` +
    body +
    `<tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>` +
    `</table>` +
    `</td></tr></table></div>`
  );
}

/**
 * Onderwerp renderen. Apart van de body omdat het nooit HTML mag zijn:
 * een `<` in een subject komt letterlijk in de inbox terecht.
 *
 * @param {string} subject
 * @param {Object} context
 * @returns {string}
 */
export function renderSubject(subject, context) {
  return fillPlaceholders(String(subject || ''), context).replace(/\s+/g, ' ').trim();
}
