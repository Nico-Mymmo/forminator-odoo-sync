/**
 * Event Operations v2 — Reminder-herstelronde
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * De reminder krijgt zijn `scheduled_date` bij het INSCHRIJVEN mee (start
 * - 24u, zie computeScheduledDate in mail-service.js). Dat is precies wat de
 * dagelijkse Odoo-cron 84 / server action 1102 overbodig maakt, inclusief
 * diens gat: wie inschrijft ná de dagelijkse run en binnen 24u vóór het
 * event, kreeg daar nooit een reminder (registratie 1080, 2026-09-05).
 *
 * Eén ding kan een vooraf geplande mail wél nog ongeldig maken: het event
 * wordt verplaatst of geannuleerd nadat de mails al klaarstonden. Daar is
 * deze ronde voor, en enkel daarvoor -- het is geen herberekening van alles,
 * maar een correctie op wat er al klaarstaat:
 *
 *  - event verplaatst  → scheduled_date van de nog niet verzonden reminders
 *                        meeschuiven
 *  - event geannuleerd → die reminders annuleren (state 'cancel'), niet
 *                        verwijderen: het spoor blijft zichtbaar
 *
 * Alles wat al verzonden is (state 'sent') blijft ongemoeid.
 */

import { searchRead, write } from '../../../lib/odoo.js';
import {
  ODOO_MODELS,
  EVENT_FIELDS,
  MAIL_FIELDS,
  fromOdooDatetime,
  toOdooDatetime
} from '../odoo-contract.js';
import { LOG_PREFIX, PUBLICATION_STATE } from '../constants.js';
import { MAIL_KIND } from './mail-blocks.js';
import { computeScheduledDate, loadMailBlocks } from './mail-service.js';
import { resolveSection } from './mail-blocks.js';
import { getStages } from './events-service.js';

/**
 * Standaard AAN, uit te zetten met "0"/"false" zonder deploy -- zelfde
 * afspraak als EVENTS_V2_AUTO_DONE_CRON.
 */
function isEnabled(env) {
  const raw = env?.EVENTS_V2_MAIL_REPAIR_CRON;
  return raw !== '0' && raw !== 'false';
}

/** `<evt76-reminder-reg1079@om.mymmo.com>` → 76 */
function eventIdFromMessageId(messageId) {
  const match = /^<evt(\d+)-/.exec(String(messageId || ''));
  return match ? Number(match[1]) : null;
}

/**
 * @param {Object} env
 * @returns {Promise<{ checked: number, rescheduled: number, cancelled: number }>}
 */
export async function runMailRepairCron(env) {
  const log = (msg) => console.log(`${LOG_PREFIX}[mail-repair] ${msg}`);

  if (!isEnabled(env)) {
    log('uitgeschakeld via env.EVENTS_V2_MAIL_REPAIR_CRON — niets gedaan');
    return { checked: 0, rescheduled: 0, cancelled: 0 };
  }

  // Alleen wat nog moet vertrekken. 'sent' en 'exception' blijven staan:
  // een verzonden mail achteraf herplannen bestaat niet.
  const pending = await searchRead(env, {
    model: ODOO_MODELS.MAIL,
    domain: [
      [MAIL_FIELDS.STATE, '=', 'outgoing'],
      [MAIL_FIELDS.MODEL, '=', ODOO_MODELS.REGISTRATION],
      [MAIL_FIELDS.MESSAGE_ID, 'like', `%-${MAIL_KIND.REMINDER}-reg%`]
    ],
    fields: [MAIL_FIELDS.ID, MAIL_FIELDS.MESSAGE_ID, MAIL_FIELDS.SCHEDULED_DATE],
    limit: false
  });

  if (!pending || pending.length === 0) {
    log('geen openstaande reminders');
    return { checked: 0, rescheduled: 0, cancelled: 0 };
  }

  // Groeperen per event, zodat we één keer per event naar Odoo gaan en
  // daarna één write per nieuwe datum -- niet één call per mail.
  const byEvent = new Map();
  for (const mail of pending) {
    const eventId = eventIdFromMessageId(mail[MAIL_FIELDS.MESSAGE_ID]);
    if (!eventId) continue;
    if (!byEvent.has(eventId)) byEvent.set(eventId, []);
    byEvent.get(eventId).push(mail);
  }

  const eventIds = [...byEvent.keys()];
  const [events, { idByState }] = await Promise.all([
    searchRead(env, {
      model: ODOO_MODELS.EVENT,
      domain: [[EVENT_FIELDS.ID, 'in', eventIds]],
      fields: [EVENT_FIELDS.ID, EVENT_FIELDS.STARTS_AT, EVENT_FIELDS.STAGE, EVENT_FIELDS.EVENT_TYPE],
      limit: false
    }),
    getStages(env)
  ]);

  const cancelledStageId = idByState[PUBLICATION_STATE.CANCELLED] || null;
  const eventById = new Map(events.map((record) => [Number(record[EVENT_FIELDS.ID]), record]));

  const toCancel = [];
  const byNewDate = new Map();
  const now = new Date();

  for (const [eventId, mails] of byEvent) {
    const record = eventById.get(eventId);

    // Event bestaat niet meer of is geannuleerd: de reminder mag niet meer
    // vertrekken. 'cancel' i.p.v. unlink, zodat er een spoor blijft.
    const stageId = Array.isArray(record?.[EVENT_FIELDS.STAGE])
      ? Number(record[EVENT_FIELDS.STAGE][0])
      : null;
    if (!record || (cancelledStageId !== null && stageId === cancelledStageId)) {
      toCancel.push(...mails.map((m) => Number(m[MAIL_FIELDS.ID])));
      continue;
    }

    const startsAt = fromOdooDatetime(record[EVENT_FIELDS.STARTS_AT]);

    // De ingestelde voorsprong van DIT event-type ophalen. Zonder dit zou de
    // herstelronde alles terugzetten op de standaard van 24 uur en daarmee
    // een bewuste instelling stil overschrijven -- precies het soort fout dat
    // niemand opmerkt tot de mails op het verkeerde moment vertrekken.
    let timingRegels;
    try {
      const { typeDoc, eventDoc } = await loadMailBlocks(env, {
        id: eventId,
        event_type: { id: Array.isArray(record[EVENT_FIELDS.EVENT_TYPE]) ? record[EVENT_FIELDS.EVENT_TYPE][0] : null }
      });
      timingRegels = resolveSection(typeDoc, eventDoc, MAIL_KIND.REMINDER, null).timing;
    } catch (error) {
      console.warn(`${LOG_PREFIX}[mail-repair] timing van event ${eventId} niet gelezen: ${error?.message}`);
      timingRegels = undefined;
    }

    const timing = computeScheduledDate(MAIL_KIND.REMINDER, { starts_at: startsAt }, now, timingRegels);

    if (!timing.send) {
      toCancel.push(...mails.map((m) => Number(m[MAIL_FIELDS.ID])));
      continue;
    }

    // `false` betekent "meteen"; Odoo zet dat om in een lege scheduled_date.
    const wanted = timing.scheduledDate === false ? false : timing.scheduledDate;

    for (const mail of mails) {
      const current = mail[MAIL_FIELDS.SCHEDULED_DATE];
      const currentNormalized = current ? toOdooDatetime(fromOdooDatetime(current)) : false;
      if (currentNormalized === wanted) continue;

      const key = wanted === false ? '__now__' : wanted;
      if (!byNewDate.has(key)) byNewDate.set(key, []);
      byNewDate.get(key).push(Number(mail[MAIL_FIELDS.ID]));
    }
  }

  let rescheduled = 0;
  for (const [key, ids] of byNewDate) {
    await write(env, {
      model: ODOO_MODELS.MAIL,
      ids,
      values: { [MAIL_FIELDS.SCHEDULED_DATE]: key === '__now__' ? false : key }
    });
    rescheduled += ids.length;
    log(`${ids.length} reminder(s) verplaatst naar ${key === '__now__' ? 'nu' : key + ' UTC'}`);
  }

  if (toCancel.length > 0) {
    await write(env, {
      model: ODOO_MODELS.MAIL,
      ids: toCancel,
      values: { [MAIL_FIELDS.STATE]: 'cancel' }
    });
    log(`${toCancel.length} reminder(s) geannuleerd (event geannuleerd, verdwenen of al begonnen)`);
  }

  return { checked: pending.length, rescheduled, cancelled: toCancel.length };
}
