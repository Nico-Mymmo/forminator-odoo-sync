/**
 * Event Operations v2 — Auto-done cron
 *
 * Er is niets dat een gepubliceerd event na zijn (berekende) einddatum
 * automatisch afsluit. Zonder deze cron blijft een afgelopen event
 * `published` staan en dus in de publieke lijst -- "Afgerond" was tot nu
 * toe een handmatige actie die iemand moet onthouden.
 *
 * Odoo is de enige database voor deze module (zie constants.js) -- deze
 * cron gebruikt dus GEEN Supabase, in tegenstelling tot cx-automations/cron.js
 * (dat patroon is enkel qua STRUCTUUR het voorbeeld, niet qua opslag).
 *
 * Regels uit PROMPT-events-v2-dropdown-en-openstaand.md, punt C:
 *  - alleen events met stage 'published' waarvan computeEndsAt() (het
 *    ENIGE plek die de einddatum berekent, zie odoo-contract.js) voorbij is
 *  - één search_read + één write over alle betrokken ids, geen call per event
 *  - loggen + een chatterbericht per omgezet event (via logToChatter)
 *  - schakelbaar via env.EVENTS_V2_AUTO_DONE_CRON, zonder deploy uit te zetten
 */

import { searchRead, write } from '../../../lib/odoo.js';
import { ODOO_MODELS, EVENT_FIELDS, fromOdooDatetime, computeEndsAt } from '../odoo-contract.js';
import { LOG_PREFIX, PUBLICATION_STATE } from '../constants.js';
import { getStages, logToChatter } from './events-service.js';
import { invalidateEvents } from './cache.js';

const CRON_ACTOR = { name: 'auto-done cron' };

/**
 * Staat de cron aan? Standaard AAN -- expliciet "0" of "false" zet hem uit,
 * zonder dat daar een deploy voor nodig is (een Worker-variabele aanpassen
 * via het dashboard volstaat).
 */
function isEnabled(env) {
  const raw = env?.EVENTS_V2_AUTO_DONE_CRON;
  return raw !== '0' && raw !== 'false';
}

/**
 * Zet elk gepubliceerd event waarvan de berekende einddatum voorbij is op
 * de 'done'-stage.
 *
 * @param {Object} env
 * @returns {Promise<{ checked: number, closed: number, ids: number[] }>}
 */
export async function runAutoDoneCron(env) {
  const log = (msg) => console.log(`${LOG_PREFIX}[auto-done-cron] ${msg}`);

  if (!isEnabled(env)) {
    log('uitgeschakeld via env.EVENTS_V2_AUTO_DONE_CRON — niets gedaan');
    return { checked: 0, closed: 0, ids: [] };
  }

  const { stages, idByState } = await getStages(env);
  const publishedStageIds = stages
    .filter((stage) => stage.state === PUBLICATION_STATE.PUBLISHED)
    .map((stage) => stage.id);
  const doneStageId = idByState[PUBLICATION_STATE.DONE];

  if (publishedStageIds.length === 0) {
    log('geen stage met status "published" gevonden in Odoo — cron gestopt');
    return { checked: 0, closed: 0, ids: [] };
  }
  if (!doneStageId) {
    log('geen stage met status "done" gevonden in Odoo — cron gestopt');
    return { checked: 0, closed: 0, ids: [] };
  }

  // Eén search_read voor alle gepubliceerde events. Alleen de velden die
  // computeEndsAt() nodig heeft -- geen fields: [] en geen call per event.
  const records = await searchRead(env, {
    model: ODOO_MODELS.EVENT,
    domain: [[EVENT_FIELDS.STAGE, 'in', publishedStageIds]],
    fields: [EVENT_FIELDS.ID, EVENT_FIELDS.STARTS_AT, EVENT_FIELDS.DURATION_MINUTES]
  });

  const now = Date.now();
  const dueIds = [];

  for (const record of records) {
    const startsAt = fromOdooDatetime(record[EVENT_FIELDS.STARTS_AT]);
    const endsAt = computeEndsAt(startsAt, record[EVENT_FIELDS.DURATION_MINUTES]);
    if (!endsAt) continue; // Geen startdatum: kan niet berekend worden, blijft staan.
    if (new Date(endsAt).getTime() <= now) {
      dueIds.push(Number(record[EVENT_FIELDS.ID]));
    }
  }

  if (dueIds.length === 0) {
    log(`${records.length} gepubliceerde event(en) bekeken, geen enkele voorbij zijn einddatum`);
    return { checked: records.length, closed: 0, ids: [] };
  }

  // Eén write over alle betrokken ids.
  await write(env, {
    model: ODOO_MODELS.EVENT,
    ids: dueIds,
    values: { [EVENT_FIELDS.STAGE]: doneStageId }
  });

  await invalidateEvents(env);

  log(`${dueIds.length} event(en) automatisch afgerond: ${dueIds.join(', ')}`);

  // Chatterbericht per event -- messagePost werkt altijd per record, dus dit
  // kan niet gebatcht worden. logToChatter is zelf nooit fataal.
  for (const id of dueIds) {
    await logToChatter(
      env,
      id,
      'Automatisch afgerond: de berekende einddatum (start + duur) is voorbij',
      CRON_ACTOR
    );
  }

  return { checked: records.length, closed: dueIds.length, ids: dueIds };
}
