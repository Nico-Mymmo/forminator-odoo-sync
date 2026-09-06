/**
 * Event Operations v2 — Mails klaarzetten in Odoo
 *
 * Odoo blijft de enige database: de blokken staan in Studio-velden, de mails
 * in `mail.mail`, het verzendspoor in datzelfde `mail.mail`-record. Geen
 * Supabase, geen KV als bron van waarheid.
 *
 * WAT DIT VERVANGT
 * ----------------
 * Vandaag verstuurt Odoo zelf, via `mail.template` + `base.automation`:
 *
 *   rule 53 → actie 1084 (mail_post, template 50)  + 1096 (zet confirmation_sent)
 *   rule 62 → actie 1153 (mail_post, template 55)  + 1154   [kopie voor live events]
 *   rule 58 → actie 1103 (mail_post, template 52)  + 1104 (zet reminder_sent)
 *   rule 63 → actie 1155 (mail_post, template 56)  + 1156   [kopie voor live events]
 *   knop    → actie 1099 (recap, template uit x_studio_recap_template_id)
 *
 * Elke variatie kost daar een gekopieerd sjabloon PLUS een gekopieerde regel
 * met een filter erop -- rule 62 filtert zelfs op `x_studio_event_type`, het
 * veld dat nooit gelezen mag worden (zie FORBIDDEN_FIELDS). Hier is de
 * variatie een eigenschap van een blok en is er niets om te kopiëren.
 *
 * DE VLAG IS NIET DE WAARHEID
 * ---------------------------
 * In v1 brak het aanwezigheidsspoor doordat de vlag de waarheid wás en een
 * `catch` hem kon overslaan. Vlag en mail leven bovendien op twee modellen,
 * dus "in dezelfde schrijfactie" bestaat niet -- dat zijn per definitie twee
 * Odoo-calls.
 *
 * Daarom draait de idempotentie hier op het mail.mail-record zelf, via een
 * afgeleide `message_id`:
 *
 *   <evt{eventId}-{soort}-reg{registratieId}@om.mymmo.com>
 *
 * Volgorde: zoeken op die sleutel → bestaat er al een, dan overslaan →
 * anders `create` → dán pas de boolean schrijven. Mislukt die laatste write,
 * dan kan er nog steeds geen dubbele mail ontstaan, want de volgende ronde
 * vindt het bestaande mail.mail-record. De boolean is een spiegel voor de
 * UI, niet het bewijs.
 *
 * Daarom staat `auto_delete` ook expliciet op `false`: de bestaande templates
 * zetten hem op `true`, waardoor een verzonden mail zichzelf opruimt en er
 * achteraf niets meer te controleren valt.
 */

import { searchRead, create, write, batchCreate } from '../../../lib/odoo.js';
import {
  ODOO_MODELS,
  EVENT_FIELDS,
  EVENT_TYPE_FIELDS,
  REGISTRATION_FIELDS,
  MAIL_FIELDS,
  toOdooDatetime,
  m2oId
} from '../odoo-contract.js';
import { LOG_PREFIX, REGISTRATION_STATE, PUBLIC_EVENT_PATH } from '../constants.js';
import {
  MAIL_KIND,
  MAIL_KINDS,
  parseMailBlocks,
  emptyMailBlocks,
  normalizeMailBlocks,
  resolveSection
} from './mail-blocks.js';
import { buildPlaceholderContext, renderMailHtml, renderSubject } from './mail-render.js';
import { optionalFieldAvailable, logToChatter } from './events-service.js';

/** Domein voor de message_id-sleutel. Puur een identifier, geen adres. */
const MESSAGE_ID_DOMAIN = 'om.mymmo.com';

/** Hoe lang vóór de start de reminder vertrekt. */
const REMINDER_LEAD_MINUTES = 24 * 60;

/** Welke vlag hoort bij welke mailsoort. */
const SENT_FIELD_BY_KIND = {
  [MAIL_KIND.CONFIRMATION]: REGISTRATION_FIELDS.CONFIRMATION_SENT,
  [MAIL_KIND.REMINDER]: REGISTRATION_FIELDS.REMINDER_SENT,
  [MAIL_KIND.RECAP]: REGISTRATION_FIELDS.RECAP_SENT
};

export class MailError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MailError';
    this.status = options.status || 400;
    this.code = options.code || 'MAIL_ERROR';
  }
}

// ─── Overnamevlag ─────────────────────────────────────────────────────────────

/**
 * Neemt de OM de mails van dit event over, of laat hij ze aan de bestaande
 * Odoo-automations?
 *
 * `EVENTS_V2_MAIL_OWNER` is een kommagescheiden lijst van event-type-id's,
 * of `*` voor alles. Leeg/afwezig = de OM stuurt niets en alles blijft bij
 * het oude -- dat is bewust de veilige standaard, zodat een deploy op zich
 * nooit een mail veroorzaakt.
 *
 * Zolang de oude rules aan blijven staan, is dit géén dubbele verzending:
 * hun filter is exact `x_studio_confirmation_email_sent = False` resp.
 * `x_studio_reminder_email_sent = False`. De OM zet die vlag, dus de
 * automation vindt het record niet meer. Ze blijven wel liggen als vangnet
 * voor alles wat de OM (nog) niet overneemt.
 *
 * @param {Object} env
 * @param {Object} event - DTO uit getEvent
 * @returns {boolean}
 */
export function ownsMail(env, event) {
  const raw = String(env?.EVENTS_V2_MAIL_OWNER || '').trim();
  if (raw === '') return false;
  if (raw === '*') return true;

  const typeId = Number(event?.event_type?.id);
  if (!Number.isInteger(typeId)) return false;

  return raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n))
    .includes(typeId);
}

// ─── Blokken lezen en schrijven ───────────────────────────────────────────────

/** Bestaat het blokkenveld op het event-type? */
async function eventTypeBlocksAvailable(env) {
  return fieldExists(env, ODOO_MODELS.EVENT_TYPE, EVENT_TYPE_FIELDS.MAIL_BLOCKS);
}

/** Bestaat het overridveld op het event? Zelfde patroon als brandFieldAvailable. */
async function eventOverrideAvailable(env) {
  return optionalFieldAvailable(env, EVENT_FIELDS.MAIL_BLOCKS_OVERRIDE);
}

/**
 * Generieke veldcontrole voor modellen waarvoor events-service.js geen
 * cache heeft. Niet gecached: dit draait alleen op beheerroutes en op de
 * cron, niet op het publieke pad.
 */
async function fieldExists(env, model, field) {
  try {
    const { executeKw } = await import('../../../lib/odoo.js');
    const fields = await executeKw(env, {
      model,
      method: 'fields_get',
      args: [[field]],
      kwargs: { attributes: ['type'] }
    });
    return Boolean(fields && fields[field]);
  } catch (error) {
    console.warn(`${LOG_PREFIX} fields_get ${model}.${field} mislukt:`, error?.message);
    return false;
  }
}

/**
 * De blokken die voor dit event gelden: de standaard van het event-type plus
 * de eventuele override op het event zelf.
 *
 * @param {Object} env
 * @param {Object} event - DTO uit getEvent
 * @returns {Promise<{ typeDoc: Object|null, eventDoc: Object|null }>}
 */
export async function loadMailBlocks(env, event) {
  const typeId = Number(event?.event_type?.id);

  const [typeDoc, eventDoc] = await Promise.all([
    Number.isInteger(typeId) && (await eventTypeBlocksAvailable(env))
      ? readBlocksField(env, ODOO_MODELS.EVENT_TYPE, typeId, EVENT_TYPE_FIELDS.MAIL_BLOCKS)
      : Promise.resolve(null),
    (await eventOverrideAvailable(env))
      ? readBlocksField(env, ODOO_MODELS.EVENT, Number(event.id), EVENT_FIELDS.MAIL_BLOCKS_OVERRIDE)
      : Promise.resolve(null)
  ]);

  return { typeDoc, eventDoc };
}

async function readBlocksField(env, model, id, field) {
  const records = await searchRead(env, {
    model,
    domain: [['id', '=', Number(id)]],
    fields: ['id', field],
    limit: 1
  });
  if (!records || records.length === 0) return null;
  return parseMailBlocks(records[0][field], `${model}#${id}.${field}`);
}

/**
 * Blokken opslaan. Altijd via normalizeMailBlocks, zodat er nooit een vorm
 * in Odoo belandt die de renderer niet aankan.
 *
 * @param {Object} env
 * @param {Object} target - { eventTypeId } of { eventId }
 * @param {Object} doc
 * @param {Object} [actor]
 * @returns {Promise<Object>} het opgeslagen document
 */
export async function saveMailBlocks(env, target, doc, actor = null) {
  const normalized = normalizeMailBlocks(doc || emptyMailBlocks(), 'opslaan');
  const payload = JSON.stringify(normalized);

  if (target?.eventTypeId) {
    if (!(await eventTypeBlocksAvailable(env))) {
      throw new MailError(
        `Het Studio-veld ${EVENT_TYPE_FIELDS.MAIL_BLOCKS} bestaat niet op ${ODOO_MODELS.EVENT_TYPE}.`,
        { status: 409, code: 'MAIL_BLOCKS_FIELD_MISSING' }
      );
    }
    await write(env, {
      model: ODOO_MODELS.EVENT_TYPE,
      ids: [Number(target.eventTypeId)],
      values: { [EVENT_TYPE_FIELDS.MAIL_BLOCKS]: payload }
    });
    return normalized;
  }

  if (target?.eventId) {
    if (!(await eventOverrideAvailable(env))) {
      throw new MailError(
        `Het Studio-veld ${EVENT_FIELDS.MAIL_BLOCKS_OVERRIDE} bestaat niet op ${ODOO_MODELS.EVENT}.`,
        { status: 409, code: 'MAIL_BLOCKS_FIELD_MISSING' }
      );
    }
    await write(env, {
      model: ODOO_MODELS.EVENT,
      ids: [Number(target.eventId)],
      values: { [EVENT_FIELDS.MAIL_BLOCKS_OVERRIDE]: payload }
    });
    await logToChatter(env, Number(target.eventId), 'Mailblokken van dit event aangepast', actor);
    return normalized;
  }

  throw new MailError('saveMailBlocks vereist een eventTypeId of een eventId', { status: 400 });
}

// ─── Renderen ─────────────────────────────────────────────────────────────────

/**
 * De afzender. De bestaande templates halen die uit
 * `x_studio_linked_webinar.x_studio_user_id` -- dezelfde host dus, en
 * daarom staat host ook al als verplicht veld in validation.js.
 *
 * @param {Object} env
 * @param {Object} event
 * @returns {Promise<{ email: string, formatted: string }>}
 */
export async function resolveSender(env, event) {
  const hostId = Number(event?.host?.id);
  if (!Number.isInteger(hostId)) {
    throw new MailError('Dit event heeft geen host; die is de afzender van de mails.', {
      status: 409,
      code: 'MAIL_NO_SENDER'
    });
  }

  // employee_id erbij: functietitel en profielfoto staan op hr.employee en
  // worden in de afzenderkaart gebruikt (zoals de bestaande template dat via
  // `employee_id.job_title` en `x_public_image_attachment_id` deed).
  const users = await searchRead(env, {
    model: ODOO_MODELS.USER,
    domain: [['id', '=', hostId]],
    fields: ['id', 'name', 'email', 'employee_id'],
    limit: 1
  });

  const email = String(users?.[0]?.email || '').trim();
  if (email === '') {
    throw new MailError('De host van dit event heeft geen e-mailadres in Odoo.', {
      status: 409,
      code: 'MAIL_NO_SENDER'
    });
  }

  const name = String(users?.[0]?.name || event?.host?.name || '').trim();
  const employeeId = m2oId(users?.[0]?.employee_id);
  const profile = employeeId ? await resolveHostProfile(env, employeeId) : { jobTitle: '', avatarUrl: '' };

  return {
    email,
    formatted: name === '' ? email : `"${name}" <${email}>`,
    jobTitle: profile.jobTitle,
    avatarUrl: profile.avatarUrl
  };
}

/**
 * Functietitel en profielfoto van de host.
 *
 * De foto komt uit `x_public_image_attachment_id` op hr.employee. De
 * oorspronkelijke template bouwde daar een RELATIEVE URL mee (`/web/image/%s`),
 * wat in een mail niet werkt -- een mailclient heeft geen basis-URL. Hier
 * wordt het een absolute URL op de Odoo-host.
 *
 * Nooit fataal: zonder foto of functietitel valt dat deel van de
 * afzenderkaart gewoon weg.
 *
 * @param {Object} env @param {number} employeeId
 * @returns {Promise<{ jobTitle: string, avatarUrl: string }>}
 */
async function resolveHostProfile(env, employeeId) {
  try {
    const rows = await searchRead(env, {
      model: 'hr.employee',
      domain: [['id', '=', employeeId]],
      fields: ['id', 'job_title', 'x_public_image_attachment_id'],
      limit: 1
    });

    const attachmentId = m2oId(rows?.[0]?.x_public_image_attachment_id);
    const base = String(env?.ODOO_WEB_ORIGIN || 'https://mymmo.odoo.com').replace(/\/+$/, '');

    return {
      jobTitle: String(rows?.[0]?.job_title || '').trim(),
      avatarUrl: attachmentId ? `${base}/web/image/${attachmentId}` : ''
    };
  } catch (error) {
    console.warn(`${LOG_PREFIX} profiel van host ${employeeId} niet gelezen: ${error?.message}`);
    return { jobTitle: '', avatarUrl: '' };
  }
}

/**
 * Eén mail renderen voor één (event, registratie, soort).
 *
 * @param {Object} options
 * @param {Object} options.event
 * @param {Object|null} options.registration
 * @param {string} options.kind
 * @param {Object|null} options.typeDoc
 * @param {Object|null} options.eventDoc
 * @param {Object} [options.host] - { email, jobTitle, avatarUrl } uit resolveSender()
 * @param {string} [options.publicBaseUrl]
 * @returns {{ subject: string, html: string, source: string, empty: boolean }}
 */
export function renderMailForRegistration({
  event,
  registration,
  kind,
  typeDoc,
  eventDoc,
  host = {},
  publicBaseUrl = '',
  // Alleen waar voor het voorbeeldpaneel in de OM: dan krijgt elk blok een
  // data-om-block/data-om-edit-marker zodat de editor erop kan werken.
  // queueMails() roept dit ZONDER editable aan, dus de verzonden mail bevat
  // die attributen niet.
  editable = false
}) {
  // De site bepaalt hier TWEE dingen, en verder niets: welke header, en --
  // alleen als iemand de inhoud uitdrukkelijk gesplitst heeft -- welke
  // variant. De blokken zelf worden nergens meer gefilterd.
  const section = resolveSection(typeDoc, eventDoc, kind, registration?.site || null);

  const context = buildPlaceholderContext({
    event,
    registration,
    host,
    publicUrl: buildPublicUrl(publicBaseUrl, event)
  });

  const subject = renderSubject(section.subject, context);
  const html = renderMailHtml({
    header: section.header,
    blocks: section.blocks,
    context,
    preheader: section.preheader,
    editable
  });

  return {
    subject,
    html,
    source: section.source,
    variant: section.variant,
    empty: section.blocks.length === 0 || subject === ''
  };
}

/**
 * Welke site-URL hoort in de mail?
 *
 * BEWUST GEEN eigen basis-URL-variabele: die twee bestaan al. Een vaste
 * waarde zou bovendien fout zijn -- wie op syndicoach.be inschreef, hoort
 * een syndicoach-link te krijgen, niet een openvme-link.
 *
 *  1. de site van de inschrijving (x_studio_registration_site) opzoeken in
 *     EVENTS_PUBLIC_ORIGINS, op hostnaam
 *  2. lukt dat niet (site onbekend, of het merk staat niet in de lijst):
 *     EVENTS_SHARED_CANONICAL_ORIGIN -- dezelfde terugval als de canonieke
 *     URL in het publieke DTO gebruikt
 *
 * Is geen van beide gezet, dan blijft {{event.url}} leeg. Dat is zichtbaar
 * in het voorbeeldpaneel, en beter dan een link naar de verkeerde site.
 *
 * @param {Object} env
 * @param {string|null} site
 * @returns {string}
 */
export function resolvePublicOrigin(env, site) {
  const origins = String(env?.EVENTS_PUBLIC_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o !== '');

  const key = String(site || '').trim().toLowerCase();
  if (key !== '') {
    const match = origins.find((origin) => {
      try {
        return new URL(origin).hostname.toLowerCase().includes(key);
      } catch (error) {
        return false;
      }
    });
    if (match) return match;
  }

  return String(env?.EVENTS_SHARED_CANONICAL_ORIGIN || '').trim().replace(/\/+$/, '');
}

/** @returns {string} */
function buildPublicUrl(base, event) {
  const root = String(base || '').replace(/\/+$/, '');
  const slug = String(event?.slug || '').trim();
  if (root === '' || slug === '') return '';
  return `${root}${PUBLIC_EVENT_PATH}/${slug}/?owid=${Number(event.id)}`;
}

// ─── Klaarzetten in mail.mail ─────────────────────────────────────────────────

/**
 * De idempotentiesleutel. Deterministisch uit (event, soort, registratie),
 * zodat twee gelijktijdige of herhaalde aanroepen dezelfde sleutel bouwen.
 *
 * @param {number} eventId
 * @param {string} kind
 * @param {number} registrationId
 * @returns {string}
 */
export function buildMessageId(eventId, kind, registrationId) {
  return `<evt${Number(eventId)}-${kind}-reg${Number(registrationId)}@${MESSAGE_ID_DOMAIN}>`;
}

/**
 * Wanneer deze soort mag vertrekken.
 *
 * De reminder krijgt zijn `scheduled_date` HIER, bij het klaarzetten -- niet
 * uit een dagelijkse Odoo-cron die alle registraties herberekent (cron 84 /
 * server action 1102). Die cron laat namelijk iedereen die inschrijft ná zijn
 * dagelijkse run én binnen 24u vóór het event zonder reminder achter;
 * registratie 1080 (2026-09-05) is daar een live voorbeeld van.
 *
 * Ligt het reminder-moment al in het verleden maar is het event nog niet
 * begonnen, dan vertrekt de reminder meteen -- een late inschrijver hoort
 * nog steeds iets te krijgen. Is het event al bezig of voorbij, dan komt er
 * geen reminder meer.
 *
 * @param {string} kind
 * @param {Object} event
 * @param {Date} [now]
 * @returns {{ send: boolean, scheduledDate: string|false, reason: string|null }}
 */
export function computeScheduledDate(kind, event, now = new Date()) {
  if (kind !== MAIL_KIND.REMINDER) {
    return { send: true, scheduledDate: false, reason: null };
  }

  const startsAt = event?.starts_at ? new Date(event.starts_at) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return { send: false, scheduledDate: false, reason: 'geen startdatum' };
  }
  if (startsAt.getTime() <= now.getTime()) {
    return { send: false, scheduledDate: false, reason: 'event is al begonnen' };
  }

  const moment = new Date(startsAt.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000);
  if (moment.getTime() <= now.getTime()) {
    return { send: true, scheduledDate: false, reason: 'late inschrijving, meteen versturen' };
  }

  return { send: true, scheduledDate: toOdooDatetime(moment), reason: null };
}

/**
 * Welke van deze registraties hebben al een mail van deze soort klaarstaan
 * of verstuurd gekregen? Eén search_read over alle sleutels tegelijk.
 *
 * @param {Object} env
 * @param {number} eventId
 * @param {string} kind
 * @param {number[]} registrationIds
 * @returns {Promise<Set<number>>} registratie-id's die al bediend zijn
 */
export async function findAlreadyQueued(env, eventId, kind, registrationIds) {
  if (registrationIds.length === 0) return new Set();

  const keys = registrationIds.map((id) => buildMessageId(eventId, kind, id));
  const existing = await searchRead(env, {
    model: ODOO_MODELS.MAIL,
    domain: [[MAIL_FIELDS.MESSAGE_ID, 'in', keys]],
    fields: [MAIL_FIELDS.ID, MAIL_FIELDS.MESSAGE_ID],
    limit: false
  });

  const done = new Set();
  for (const record of existing || []) {
    const match = /-reg(\d+)@/.exec(String(record[MAIL_FIELDS.MESSAGE_ID] || ''));
    if (match) done.add(Number(match[1]));
  }
  return done;
}

/**
 * Mails klaarzetten voor een lijst registraties.
 *
 * @param {Object} env
 * @param {Object} options
 * @param {Object} options.event - DTO uit getEvent (detailvorm)
 * @param {Object[]} options.registrations - DTO's uit toRegistrationDto
 * @param {string} options.kind
 * @param {Object} [options.actor]
 * @param {Date} [options.now]
 * @returns {Promise<{ queued: number[], skipped: Array<{id:number, reason:string}> }>}
 */
export async function queueMails(env, { event, registrations, kind, actor = null, now = new Date() }) {
  if (!MAIL_KINDS.includes(kind)) {
    throw new MailError(`Onbekende mailsoort "${kind}"`, { status: 400 });
  }

  const timing = computeScheduledDate(kind, event, now);
  if (!timing.send) {
    return { queued: [], skipped: registrations.map((r) => ({ id: r.id, reason: timing.reason })) };
  }

  const skipped = [];
  const candidates = [];

  for (const registration of registrations) {
    // Geannuleerde inschrijvingen krijgen niets. Wachtlijst wél: die persoon
    // is ingeschreven, alleen niet zeker van een plaats.
    if (registration.state === REGISTRATION_STATE.CANCELLED) {
      skipped.push({ id: registration.id, reason: 'inschrijving geannuleerd' });
      continue;
    }
    const to = String(registration.submitted_email || registration.partner?.email || '').trim();
    if (to === '') {
      skipped.push({ id: registration.id, reason: 'geen e-mailadres' });
      continue;
    }
    candidates.push({ registration, to });
  }

  if (candidates.length === 0) return { queued: [], skipped };

  const alreadyQueued = await findAlreadyQueued(
    env,
    event.id,
    kind,
    candidates.map((c) => c.registration.id)
  );

  const [{ typeDoc, eventDoc }, sender] = await Promise.all([
    loadMailBlocks(env, event),
    resolveSender(env, event)
  ]);

  const values = [];
  const queuedIds = [];

  for (const { registration, to } of candidates) {
    if (alreadyQueued.has(registration.id)) {
      skipped.push({ id: registration.id, reason: 'stond al klaar' });
      continue;
    }

    const rendered = renderMailForRegistration({
      event,
      registration,
      kind,
      typeDoc,
      eventDoc,
      host: sender,
      // Per ontvanger, want de site verschilt per inschrijving.
      publicBaseUrl: resolvePublicOrigin(env, registration.site)
    });

    if (rendered.empty) {
      // Niets ingesteld voor deze soort: dat is een configuratiefout, geen
      // reden om een lege mail te versturen.
      skipped.push({ id: registration.id, reason: 'geen blokken of onderwerp ingesteld' });
      continue;
    }

    values.push({
      [MAIL_FIELDS.SUBJECT]: rendered.subject,
      [MAIL_FIELDS.BODY_HTML]: rendered.html,
      [MAIL_FIELDS.EMAIL_FROM]: sender.formatted,
      [MAIL_FIELDS.REPLY_TO]: sender.formatted,
      [MAIL_FIELDS.EMAIL_TO]: to,
      [MAIL_FIELDS.SCHEDULED_DATE]: timing.scheduledDate,
      [MAIL_FIELDS.MODEL]: ODOO_MODELS.REGISTRATION,
      [MAIL_FIELDS.RES_ID]: Number(registration.id),
      [MAIL_FIELDS.MESSAGE_ID]: buildMessageId(event.id, kind, registration.id),
      [MAIL_FIELDS.AUTO_DELETE]: false
    });
    queuedIds.push(Number(registration.id));
  }

  if (values.length === 0) return { queued: [], skipped };

  // Eerst de mails aanmaken, dan pas de vlaggen. Deze volgorde is het hele
  // punt: het mail.mail-record is het bewijs, de boolean is de spiegel.
  if (values.length === 1) {
    await create(env, { model: ODOO_MODELS.MAIL, values: values[0] });
  } else {
    await batchCreate(env, { model: ODOO_MODELS.MAIL, valuesArray: values });
  }

  const sentField = SENT_FIELD_BY_KIND[kind];
  try {
    await write(env, {
      model: ODOO_MODELS.REGISTRATION,
      ids: queuedIds,
      values: { [sentField]: true }
    });
  } catch (error) {
    // Bewust NIET stilzwijgend doorgaan: dit moet zichtbaar zijn. Er kan
    // geen dubbele mail uit volgen -- de volgende ronde vindt de bestaande
    // mail.mail-records via findAlreadyQueued() en slaat ze over.
    console.error(
      `${LOG_PREFIX} mails ${kind} staan klaar voor event ${event.id}, maar ${sentField} kon niet ` +
      `geschreven worden voor ${queuedIds.join(', ')}: ${error?.message}`
    );
  }

  await logToChatter(
    env,
    Number(event.id),
    `${queuedIds.length} ${kind}-mail(s) klaargezet${timing.scheduledDate ? ` voor ${timing.scheduledDate} UTC` : ''}`,
    actor
  );

  return { queued: queuedIds, skipped };
}
