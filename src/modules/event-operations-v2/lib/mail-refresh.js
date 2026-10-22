/**
 * Event Operations v2 — Klaarstaande mails meenemen na het bewaren
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Een mail krijgt zijn inhoud op het moment dat hij klaargezet wordt, en dat
 * is bij het INSCHRIJVEN. Een reminder staat daardoor soms weken in Odoo's
 * wachtrij met de tekst van toen. Paste iemand intussen de mail van het
 * event-type aan, dan veranderde dat enkel de mails van NIEUWE inschrijvers;
 * wat al klaarstond, vertrok met de oude tekst. Zo kreeg event 81 (Live
 * Event, 2026-10-22) een reminder met de inlogtips van een webinar, terwijl
 * die al uit de mail van het type gehaald waren. Niets op het scherm zei dat.
 *
 * Daarom: na elke bewaring van mailblokken (type of event) worden de mails
 * die nog in de wachtrij staan opnieuw opgebouwd via queueMails() met
 * refresh -- dezelfde weg als "Alsnog klaarzetten", dus geen tweede renderer.
 *
 * Wat de nieuwe instelling NIET meer stuurt (reminder uitgezet, of iemand
 * valt nu binnen minLeadHours), wordt GEANNULEERD in plaats van met de oude
 * tekst te laten vertrekken. Wat in de wachtrij staat, hoort te zijn wat de
 * mail nu zegt.
 *
 * Een aparte module en niet in mail-service.js: die wordt door
 * registrations-service.js geïmporteerd, en dit heeft beide nodig.
 */

import { searchRead, write } from '../../../lib/odoo.js';
import { ODOO_MODELS, MAIL_FIELDS } from '../odoo-contract.js';
import { LOG_PREFIX } from '../constants.js';
import { MAIL_KINDS } from './mail-blocks.js';
import { queueMails } from './mail-service.js';
import { getEvent } from './events-service.js';
import { listRegistrationsForMail } from './registrations-service.js';

/** `<evt76-reminder-reg1079@om.mymmo.com>` → { eventId, kind, registrationId } */
function parseMessageId(messageId) {
  const match = /^<evt(\d+)-([a-z]+)-reg(\d+)@/.exec(String(messageId || ''));
  if (!match || !MAIL_KINDS.includes(match[2])) return null;
  return { eventId: Number(match[1]), kind: match[2], registrationId: Number(match[3]) };
}

/**
 * @param {Object} env
 * @param {{ eventTypeId?: number, eventId?: number }} target
 * @param {Object} [actor]
 * @returns {Promise<{ updated: number, cancelled: number, failed: number }>}
 */
export async function refreshQueuedMails(env, target, actor = null) {
  const resultaat = { updated: 0, cancelled: 0, failed: 0 };

  const domain = [
    [MAIL_FIELDS.MODEL, '=', ODOO_MODELS.REGISTRATION],
    [MAIL_FIELDS.STATE, '=', 'outgoing'],
    [MAIL_FIELDS.MESSAGE_ID, '=like', target?.eventId ? `<evt${Number(target.eventId)}-%` : '<evt%']
  ];

  const pending = await searchRead(env, {
    model: ODOO_MODELS.MAIL,
    domain,
    fields: [MAIL_FIELDS.ID, MAIL_FIELDS.MESSAGE_ID],
    limit: false
  });

  // Per event, per soort: welke mail hoort bij welke inschrijving.
  const perEvent = new Map();
  for (const row of pending || []) {
    const sleutel = parseMessageId(row[MAIL_FIELDS.MESSAGE_ID]);
    if (!sleutel) continue;
    if (!perEvent.has(sleutel.eventId)) perEvent.set(sleutel.eventId, new Map());
    const perSoort = perEvent.get(sleutel.eventId);
    if (!perSoort.has(sleutel.kind)) perSoort.set(sleutel.kind, new Map());
    perSoort.get(sleutel.kind).set(sleutel.registrationId, Number(row[MAIL_FIELDS.ID] ?? row.id));
  }

  for (const [eventId, perSoort] of perEvent) {
    let event;
    try {
      ({ event } = await getEvent(env, { id: eventId }, { bypassCache: true }));
    } catch (error) {
      console.error(`${LOG_PREFIX}[mail-refresh] event ${eventId} niet gelezen: ${error?.message}`);
      resultaat.failed += [...perSoort.values()].reduce((n, m) => n + m.size, 0);
      continue;
    }
    if (!event) continue;
    // Bij een type: enkel de events van DAT type. Een event met een eigen
    // override rendert gewoon opnieuw dezelfde inhoud -- onschadelijk.
    if (target?.eventTypeId && Number(event.event_type?.id) !== Number(target.eventTypeId)) continue;

    for (const [kind, mails] of perSoort) {
      try {
        const registrations = await listRegistrationsForMail(env, eventId, {
          kind,
          registrationIds: [...mails.keys()]
        });
        const result = await queueMails(env, { event, registrations, kind, actor, refresh: true });
        const bijgewerkt = new Set((result?.updated || []).map(Number));
        resultaat.updated += bijgewerkt.size;

        // Wat niet bijgewerkt werd en nog klaarstaat, stuurt de nieuwe
        // instelling niet meer (of de inschrijving bestaat niet meer actief).
        const teAnnuleren = [...mails.entries()]
          .filter(([registrationId]) => !bijgewerkt.has(registrationId))
          .map(([, mailId]) => mailId)
          .filter((id) => Number.isInteger(id) && id > 0);

        if (teAnnuleren.length > 0) {
          await write(env, {
            model: ODOO_MODELS.MAIL,
            ids: teAnnuleren,
            values: { [MAIL_FIELDS.STATE]: 'cancel' }
          });
          resultaat.cancelled += teAnnuleren.length;
          const redenen = (result?.skipped || []).map((s) => `${s.id}: ${s.reason}`).join('; ');
          console.log(
            `${LOG_PREFIX}[mail-refresh] event ${eventId} ${kind}: ${teAnnuleren.length} klaarstaande mail(s) ` +
            `geannuleerd, de huidige instelling stuurt ze niet meer${redenen ? ` (${redenen})` : ''}`
          );
        }
      } catch (error) {
        // Niet fataal voor het bewaren zelf, maar wel zichtbaar: deze mails
        // vertrekken anders met de oude tekst.
        console.error(`${LOG_PREFIX}[mail-refresh] event ${eventId} ${kind} niet bijgewerkt: ${error?.message}`);
        resultaat.failed += mails.size;
      }
    }
  }

  return resultaat;
}
