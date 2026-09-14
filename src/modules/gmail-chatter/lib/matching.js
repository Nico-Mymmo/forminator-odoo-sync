/**
 * Gmail → chatter — bepalen of een bericht ergens bij hoort, en waarbij.
 *
 * Dit bestand beslist twee dingen, in deze volgorde:
 *
 *   1. MOETEN WE DIT BERICHT ÜBERHAUPT BEKIJKEN? Interne mail, nieuwsbrieven,
 *      automatische antwoorden en onze eigen Odoo-notificaties vallen af. Die
 *      beslissing wordt op de HEADERS genomen, dus vóór er een body opgehaald
 *      is — dat is het hele punt van de privacy-opzet (zie gmail-read-client.js).
 *
 *   2. BIJ WELKE LEAD HOORT HET? Eerst via de draad (In-Reply-To/References
 *      tegen wat we eerder al geplaatst hebben), dan via het e-mailadres van de
 *      tegenpartij. De draad wint, want een adres kan bij meerdere leads horen
 *      maar een draad hoort bij precies één gesprek.
 *
 * WAT HIER NIET GEBEURT: gokken. Levert stap 2 niets op, dan is het antwoord
 * `null` en belandt het bericht in de werklijst voor handmatige toewijzing.
 * Een mail aan de verkeerde lead hangen is erger dan een mail die wacht.
 */

import { searchRead } from '../../../lib/odoo.js';

/**
 * Onze eigen domeinen. Mail waarbij ALLE tegenpartijen hierop zitten is intern
 * verkeer en hoort niet in de chatter van een klant.
 *
 * Instelbaar via `GMAIL_CHATTER_OWN_DOMAINS` (kommagescheiden), met de bekende
 * domeinen als standaard — inclusief de domeinaliassen die Workspace
 * automatisch aanmaakt, want daar komt evengoed post op binnen.
 */
const STANDAARD_EIGEN_DOMEINEN = [
  'mymmo.com', 'openvme.be', 'openvme.com', 'syndicoach.be',
  'syndicusonline.com', 'openacp.be', 'cindy.eu'
];

export function eigenDomeinen(env) {
  const ruw = String(env?.GMAIL_CHATTER_OWN_DOMAINS || '').trim();
  if (!ruw) return STANDAARD_EIGEN_DOMEINEN;
  return ruw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
}

/**
 * Adressen uit een headerwaarde halen.
 * Werkt op `"Naam" <a@b.c>, ander@d.e` en op een kaal adres.
 */
export function parseAddresses(waarde) {
  if (!waarde) return [];
  const uit = [];
  const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m;
  while ((m = re.exec(waarde)) !== null) uit.push(m[1].toLowerCase());
  return [...new Set(uit)];
}

function domeinVan(adres) {
  const i = String(adres).lastIndexOf('@');
  return i === -1 ? '' : adres.slice(i + 1).toLowerCase();
}

/**
 * Message-id's uit een References/In-Reply-To-header.
 * Die bevat `<a@b> <c@d>` — soms tientallen.
 */
export function parseMessageIds(waarde) {
  if (!waarde) return [];
  const uit = [];
  const re = /<([^<>\s]+)>/g;
  let m;
  while ((m = re.exec(waarde)) !== null) uit.push(m[1]);
  return uit;
}

/**
 * Richting en tegenpartij bepalen.
 *
 * @param {Object} headers - kleingeschreven headermap
 * @param {string} userEmail - de medewerker wiens mailbox we lezen
 * @param {string[]} onzeDomeinen
 * @returns {{direction: 'outgoing'|'incoming', counterparts: string[]}}
 */
export function bepaalRichting(headers, userEmail, onzeDomeinen) {
  const van = parseAddresses(headers['from']);
  const naar = [...parseAddresses(headers['to']), ...parseAddresses(headers['cc'])];

  const afzenderIsIntern = van.some(a => onzeDomeinen.includes(domeinVan(a)));
  const direction = afzenderIsIntern ? 'outgoing' : 'incoming';

  const kandidaten = direction === 'outgoing' ? naar : van;
  const counterparts = kandidaten.filter(a => !onzeDomeinen.includes(domeinVan(a)));

  return { direction, counterparts };
}

/**
 * Lokale delen waarachter nooit een gesprekspartner zit.
 *
 * Zonder deze filter loopt de werklijst vol met leveranciersmail: de droogloop
 * op één mailbox leverde meteen `noreply@odoo.sh` en `noreply@tm.openai.com`
 * op. Die worden nooit een lead, en een werklijst die je moet leegvegen wordt
 * een werklijst die je niet meer bekijkt.
 */
const GEEN_MENS = [
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'bounce', 'bounces', 'automated', 'notification'
];

function isGeautomatiseerdAdres(adres) {
  const lokaal = String(adres || '').split('@')[0].toLowerCase();
  return GEEN_MENS.some(p => lokaal === p || lokaal.startsWith(p + '-') || lokaal.startsWith(p + '.') || lokaal.startsWith(p + '+'));
}

/**
 * Moeten we dit bericht overslaan? Zo ja, met welke reden.
 *
 * De reden wordt bewaard, zodat je achteraf kan zien waarom een mail niet in de
 * chatter staat in plaats van je af te vragen of de sync wel gelopen heeft.
 *
 * @returns {string|null} reden, of null als het bericht verwerkt mag worden
 */
export function skipReden(headers, richting) {
  if (headers['auto-submitted'] && headers['auto-submitted'].toLowerCase() !== 'no') {
    return 'automatisch antwoord';
  }
  if (headers['x-autoreply']) return 'automatisch antwoord';
  if (headers['list-unsubscribe']) return 'nieuwsbrief of massamail';
  const pre = String(headers['precedence'] || '').toLowerCase();
  if (pre === 'bulk' || pre === 'list' || pre === 'junk') return 'bulkmail';

  if (!richting.counterparts.length) return 'intern verkeer';

  // Een tegenpartij die zelf geen mens is, hoeft niet in de werklijst.
  if (richting.counterparts.every(isGeautomatiseerdAdres)) return 'geautomatiseerde afzender';

  // Onze eigen Odoo-notificaties: die staan al in de chatter, ze horen er niet
  // een tweede keer in te komen als "ontvangen mail".
  const van = parseAddresses(headers['from']);
  if (van.some(a => a.startsWith('notifications@') || a.startsWith('catchall@') || a.startsWith('bounce@'))) {
    return 'Odoo-notificatie';
  }

  return null;
}

/**
 * De lead zoeken die bij een e-mailadres hoort.
 *
 * Voorkeur voor de meest recent bijgewerkte lead: als iemand twee keer een
 * formulier invulde, gaat een antwoord over het laatste gesprek.
 *
 * @returns {Promise<{model: string, res_id: number, method: string}|null>}
 */
export async function zoekLeadOpAdres(env, adres) {
  const email = String(adres || '').trim().toLowerCase();
  if (!email) return null;

  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain: [['email_from', '=ilike', email]],
    fields: ['id'],
    order: 'write_date desc',
    limit: 1,
    context: { active_test: false }
  });
  if (leads.length) return { model: 'crm.lead', res_id: leads[0].id, method: 'lead-op-adres' };

  // Geen lead op het adres zelf: misschien hangt het aan een contact dat wél
  // aan een lead gekoppeld is.
  const partners = await searchRead(env, {
    model: 'res.partner',
    domain: [['email', '=ilike', email]],
    fields: ['id'],
    order: 'write_date desc',
    limit: 1
  });
  if (!partners.length) return null;

  const viaPartner = await searchRead(env, {
    model: 'crm.lead',
    domain: [['partner_id', '=', partners[0].id]],
    fields: ['id'],
    order: 'write_date desc',
    limit: 1,
    context: { active_test: false }
  });
  if (viaPartner.length) {
    return { model: 'crm.lead', res_id: viaPartner[0].id, method: 'lead-via-contact' };
  }

  return null;
}
