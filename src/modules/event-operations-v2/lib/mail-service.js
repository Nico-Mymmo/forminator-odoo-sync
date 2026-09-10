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
  m2oId,
  eventTypePresentation
} from '../odoo-contract.js';
import { LOG_PREFIX, REGISTRATION_STATE, PUBLIC_EVENT_PATH, PUBLICATION_STATE } from '../constants.js';
import { buildMailTrackingHeaders, chatterLabel } from './postmark-tracking.js';
import {
  MAIL_KIND,
  MAIL_KINDS,
  DEFAULT_TIMING,
  parseMailBlocks,
  emptyMailBlocks,
  normalizeMailBlocks,
  resolveSection,
  BLOCK_TYPE,
  ANNOUNCEMENT_PICK
} from './mail-blocks.js';
import { buildPlaceholderContext, renderMailHtml, renderSubject, formatEventMoment } from './mail-render.js';
import { optionalFieldAvailable, logToChatter, listEventTypes, listEvents, getEvent } from './events-service.js';

/** Domein voor de message_id-sleutel. Puur een identifier, geen adres. */
const MESSAGE_ID_DOMAIN = 'om.mymmo.com';

/**
 * De ir.mail_server waarlangs de events-mails moeten vertrekken.
 *
 * WAAROM DIT EXPLICIET MOET. Zonder `mail_server_id` kiest Odoo de server
 * met de laagste sequence, en dat is hier `Postmark` (id 4) met SMTP-gebruiker
 * `PM-B-newsletter-...` -- de BROADCAST-stream van de nieuwsbrief. Een
 * Postmark SMTP-token zit vast aan één stream, dus een
 * `X-PM-Message-Stream`-header krijgt de mail daar NIET weg; dat kan alleen
 * met andere SMTP-inloggegevens, en dus met een andere ir.mail_server.
 *
 * Twee gevolgen van de oude situatie, en dat is de reden dat dit hier staat:
 * de webhook van die stream kreeg elke nieuwsbriefgebeurtenis mee (ruis), en
 * een broadcaststream onderdrukt adressen die zich uitschreven -- iemand die
 * de nieuwsbrief opzegde kreeg zijn eventbevestiging daardoor stil niet.
 *
 * Leeg/afwezig = Odoo kiest zelf (het oude gedrag), zodat een deploy zonder
 * deze instelling niets stilzwijgend verandert.
 *
 * @returns {number|null}
 */
function resolveMailServerId(env) {
  const raw = Number(env?.EVENTS_V2_MAIL_SERVER_ID);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

// De voorsprong van de reminder is INSTELBAAR per event-type (en per event
// via de override): section.timing in mail-blocks.js. DEFAULT_TIMING daar is
// de standaard; hier staat bewust geen tweede getal.

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
 * De kleur van de eventcategorie, voor knoppen in de huisstijl.
 *
 * Komt uit `x_studio_type_color_hex` op het event-type; is die leeg, dan uit
 * EVENT_TYPE_PRESENTATION in constants.js op naam. Dat is exact dezelfde
 * bron als de kalender op de website gebruikt (zie eventTypePresentation in
 * odoo-contract.js), zodat de kleur in de mail en op de site niet uit elkaar
 * kunnen lopen.
 *
 * listEventTypes() is 5 minuten gecached, dus dit kost in de praktijk geen
 * extra Odoo-ronde. Nooit fataal: zonder kleur valt de knop terug op blauw.
 *
 * @param {Object} env @param {Object} event
 * @returns {Promise<string>}
 */
export async function resolveTypeColor(env, event) {
  const typeId = Number(event?.event_type?.id);
  const naam = event?.event_type?.name || '';

  try {
    if (Number.isInteger(typeId)) {
      const { types } = await listEventTypes(env);
      const gevonden = (types || []).find((type) => Number(type.id) === typeId);
      if (gevonden?.color) return gevonden.color;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} kleur van event-type niet gelezen: ${error?.message}`);
  }

  return eventTypePresentation(naam).color;
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
  typeColor = '',
  // Per aankondigingsblok het opgezochte event, op blok-id. Opzoeken gebeurt
  // in resolveAnnouncements() -- de renderer is puur en doet geen Odoo.
  announcements = {},
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
    typeColor,
    announcements,
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

// ─── Aankondigingen ──────────────────────────────────────────────────────────

/**
 * De events opzoeken die de aankondigingsblokken van deze mail aankondigen.
 *
 * WAAROM HIER EN NIET IN DE RENDERER: mail-render.js is puur -- geen env,
 * geen fetch. Een blok dat zelf Odoo zou bevragen maakt de renderer
 * onbruikbaar in tests en in het voorbeeldpaneel.
 *
 * WAAROM BIJ HET KLAARZETTEN EN NIET BIJ HET VERSTUREN: de mail wordt in
 * Odoo als afgewerkte HTML opgeslagen. Wat hier gevonden wordt, staat dus
 * vast op het moment van klaarzetten. Voor de bevestiging is dat direct, voor
 * de reminder het inschrijfmoment. Wijzigt de agenda daarna nog, dan werkt
 * `refresh` (zie queueMails) de klaarstaande mails bij -- dat is precies
 * waarvoor die bestaat.
 *
 * Drie zaken zijn bewust hard:
 *   - alleen GEPUBLICEERDE events (een concept aankondigen is een lek)
 *   - alleen events die nog MOETEN komen (from = nu)
 *   - nooit het event waar de mail zelf over gaat
 *
 * En de site van de inschrijving filtert op merk: wie via syndicoach.be
 * inschreef, krijgt geen openvme-only event aangekondigd. Events zonder merk
 * gelden als "beide" (brandsVisibleTo in odoo-contract.js).
 *
 * @param {Object} env
 * @param {Object[]} blocks - de blokken van de sectie die verstuurd wordt
 * @param {Object} options
 * @param {Object} options.event - het event waar de mail over gaat
 * @param {string|null} [options.site]
 * @param {string} [options.publicBaseUrl]
 * @param {Date} [options.now]
 * @returns {Promise<Object>} { [blockId]: { title, day, time, location, link, url, type, summary } }
 */
export async function resolveAnnouncements(env, blocks, { event, site = null, publicBaseUrl = '', now = new Date() }) {
  const aankondigingen = (blocks || []).filter((block) => block?.type === BLOCK_TYPE.ANNOUNCEMENT);
  if (aankondigingen.length === 0) return {};

  const out = {};
  // Twee blokken met dezelfde keuze kosten één Odoo-ronde. Klinkt overbodig
  // tot iemand dezelfde aankondiging boven én onder de mail zet.
  const gezocht = new Map();

  for (const block of aankondigingen) {
    const sleutel = JSON.stringify([block.pick, block.eventTypeId, block.eventId, site]);

    if (!gezocht.has(sleutel)) {
      let gevonden = null;
      try {
        gevonden = await zoekAankondiging(env, block, { event, site, now });
      } catch (error) {
        // Nooit fataal: een mislukte opzoeking laat het blok wegvallen, ze
        // mag de hele mail niet tegenhouden.
        console.warn(`${LOG_PREFIX} aankondiging niet opgezocht (blok ${block.id}): ${error?.message}`);
      }
      gezocht.set(sleutel, gevonden);
    }

    const ander = gezocht.get(sleutel);
    if (!ander) continue;

    const moment = formatEventMoment(ander.starts_at);
    out[block.id] = {
      id: Number(ander.id),
      title: ander.title || '',
      day: moment.day,
      time: moment.time,
      location: ander.location?.name || '',
      link: ander.online_url || '',
      type: ander.event_type?.name || '',
      summary: ander.summary || '',
      url: buildPublicUrl(publicBaseUrl, ander)
    };
  }

  return out;
}

/** @returns {Promise<Object|null>} het aangekondigde event, of null */
async function zoekAankondiging(env, block, { event, site, now }) {
  const merk = String(site || '').trim().toLowerCase();

  // Eén vast event: precies dat, op id. Geen datumgrens -- wie uitdrukkelijk
  // dit event kiest, bedoelt dit event.
  if (block.pick === ANNOUNCEMENT_PICK.FIXED) {
    if (!Number.isInteger(Number(block.eventId))) return null;
    const { event: vast } = await getEvent(env, { id: Number(block.eventId) });
    return vast || null;
  }

  if (block.pick === ANNOUNCEMENT_PICK.NEXT_OF_TYPE && !Number.isInteger(Number(block.eventTypeId))) {
    return null;
  }

  const filters = {
    publication_state: PUBLICATION_STATE.PUBLISHED,
    from: new Date(now).toISOString()
  };
  if (merk !== '') filters.brand = merk;
  if (block.pick === ANNOUNCEMENT_PICK.NEXT_OF_TYPE) filters.event_type_id = Number(block.eventTypeId);
  if (block.pick === ANNOUNCEMENT_PICK.HIGHLIGHTED) filters.highlighted = true;

  const { events } = await listEvents(env, {
    filters,
    order: `${EVENT_FIELDS.STARTS_AT} asc`,
    // Twee: het eerste kan het event zijn waar deze mail over gaat.
    limit: 2,
    detail: true
  });

  return (events || []).find((kandidaat) => Number(kandidaat.id) !== Number(event?.id)) || null;
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
export function computeScheduledDate(kind, event, now = new Date(), timing = DEFAULT_TIMING) {
  if (kind !== MAIL_KIND.REMINDER) {
    return { send: true, scheduledDate: false, reason: null };
  }

  const regels = { ...DEFAULT_TIMING, ...(timing || {}) };

  // Uitgezet voor dit event-type (of voor dit ene event).
  if (regels.enabled === false) {
    return { send: false, scheduledDate: false, reason: 'reminder staat uit' };
  }

  const startsAt = event?.starts_at ? new Date(event.starts_at) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return { send: false, scheduledDate: false, reason: 'geen startdatum' };
  }
  if (startsAt.getTime() <= now.getTime()) {
    return { send: false, scheduledDate: false, reason: 'event is al begonnen' };
  }

  // De ondergrens (minLeadHours) staat HIER NIET: die gaat over het moment
  // waarop iemand zich INSCHREEF, niet over het moment waarop deze functie
  // draait. Zie reminderTooLate(). Dat verschil is een echte bug geweest:
  // wie handmatig reminders klaarzette voor mensen die zich een week eerder
  // hadden ingeschreven, kreeg er nul -- de grens werd tegen "nu" gemeten en
  // niet tegen hun inschrijfmoment.
  const moment = new Date(startsAt.getTime() - regels.leadHours * 3600000);
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
/**
 * Heeft deze inschrijver nog iets aan een reminder?
 *
 * De grens `minLeadHours` gaat over het moment waarop iemand zich INSCHREEF:
 * wie zich twee uur voor de start inschrijft, heeft niets aan een
 * herinnering "morgen begint het". Ze gaat NIET over het moment waarop de
 * mails klaargezet worden -- anders zou een handmatige inhaalronde vlak voor
 * het event iedereen overslaan, ook mensen die zich een week eerder hadden
 * ingeschreven. Precies dat gebeurde bij event 76: minLeadHours stond op 48,
 * het event begon over 29 uur, en dus kreeg niemand van de twintig
 * inschrijvers een reminder klaargezet -- zonder zichtbare reden.
 *
 * Standaard staat de grens op 0: dan gaat de reminder altijd, desnoods
 * meteen. Een late inschrijver zonder reminder is anders precies het gat dat
 * de oude Odoo-cron had.
 *
 * @param {Object} event
 * @param {Object} timing
 * @param {Date|string|null} registeredAt - create_date van de inschrijving
 * @returns {string|null} de reden om over te slaan, of null
 */
export function reminderTooLate(event, timing, registeredAt) {
  const regels = { ...DEFAULT_TIMING, ...(timing || {}) };
  if (!(regels.minLeadHours > 0)) return null;

  const startsAt = event?.starts_at ? new Date(event.starts_at) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return null;

  const ingeschreven = registeredAt ? new Date(registeredAt) : null;
  // Geen inschrijfmoment bekend? Dan de grens niet toepassen. Iemand
  // overslaan op grond van een ontbrekend veld is de verkeerde kant om te
  // falen: dan krijgt een echte deelnemer stil geen herinnering.
  if (!ingeschreven || Number.isNaN(ingeschreven.getTime())) return null;

  const urenVoorStart = (startsAt.getTime() - ingeschreven.getTime()) / 3600000;
  if (urenVoorStart >= regels.minLeadHours) return null;

  return `ingeschreven binnen ${regels.minLeadHours} uur voor de start`;
}

export async function findAlreadyQueued(env, eventId, kind, registrationIds) {
  const bestaand = await findExistingMails(env, eventId, kind, registrationIds);
  return new Set(bestaand.keys());
}

/**
 * Hetzelfde, maar met de TOESTAND erbij: `outgoing` (staat klaar, nog niet
 * de deur uit), `sent`, `cancel` of `exception`.
 *
 * Dat onderscheid is het hele verschil tussen "overslaan" en "bijwerken".
 * Een klaarstaande mail mag je nog herschrijven; een verstuurde niet -- die
 * is de deur uit en blijft staan zoals ze verstuurd is.
 *
 * @param {Object} env
 * @param {number} eventId
 * @param {string} kind
 * @param {number[]} registrationIds
 * @returns {Promise<Map<number, { mailId: number, state: string }>>} op registratie-id
 */
export async function findExistingMails(env, eventId, kind, registrationIds) {
  const ids = (registrationIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return new Map();

  const keys = ids.map((id) => buildMessageId(eventId, kind, id));
  const existing = await searchRead(env, {
    model: ODOO_MODELS.MAIL,
    domain: [[MAIL_FIELDS.MESSAGE_ID, 'in', keys]],
    fields: [MAIL_FIELDS.ID, MAIL_FIELDS.MESSAGE_ID, MAIL_FIELDS.STATE],
    limit: false
  });

  const done = new Map();
  for (const record of existing || []) {
    const match = /-reg(\d+)@/.exec(String(record[MAIL_FIELDS.MESSAGE_ID] || ''));
    if (!match) continue;
    done.set(Number(match[1]), {
      mailId: Number(record[MAIL_FIELDS.ID] ?? record.id),
      state: String(record[MAIL_FIELDS.STATE] || '')
    });
  }
  return done;
}

/**
 * Klaarstaande mails van deze inschrijvingen annuleren.
 *
 * Nodig zodra iemand een inschrijving "verwijdert" (= archiveert): de mails
 * staan al in Odoo's uitgaande wachtrij met een `scheduled_date` in de
 * toekomst, en Odoo's mailcron trekt zich niets aan van `x_active` op de
 * registratie. Zonder deze stap krijgt een verwijderde deelnemer alsnog zijn
 * reminder -- en dat is precies het soort mail waar iemand over belt.
 *
 * ANNULEREN, niet unlinken: `state = 'cancel'` laat het record staan, dus je
 * kan achteraf nog zien dat er een mail klaarstond en waarom hij niet
 * vertrokken is. Dat is dezelfde afweging als bij de inschrijving zelf.
 *
 * Alleen `outgoing` wordt geraakt. Een al verzonden mail (`sent`) laat je met
 * rust: die is de deur uit, daar verandert annuleren niets meer aan.
 *
 * @param {Object} env
 * @param {number[]} registrationIds
 * @returns {Promise<{ cancelled: number, ids: number[] }>}
 */
export async function cancelPendingMails(env, registrationIds) {
  const ids = (registrationIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { cancelled: 0, ids: [] };

  try {
    const pending = await searchRead(env, {
      model: ODOO_MODELS.MAIL,
      domain: [
        [MAIL_FIELDS.MODEL, '=', ODOO_MODELS.REGISTRATION],
        [MAIL_FIELDS.RES_ID, 'in', ids],
        [MAIL_FIELDS.STATE, '=', 'outgoing']
      ],
      fields: [MAIL_FIELDS.ID],
      limit: false
    });

    const mailIds = (Array.isArray(pending) ? pending : [])
      .map((row) => Number(row.id))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (mailIds.length === 0) return { cancelled: 0, ids: [] };

    await write(env, {
      model: ODOO_MODELS.MAIL,
      ids: mailIds,
      values: { [MAIL_FIELDS.STATE]: 'cancel' }
    });

    console.log(
      `${LOG_PREFIX} ${mailIds.length} klaarstaande mail(s) geannuleerd voor inschrijving(en) ${ids.join(', ')}`
    );
    return { cancelled: mailIds.length, ids: mailIds };
  } catch (error) {
    // Niet fataal: het archiveren zelf is gelukt en dat is het belangrijkste.
    // Wél luid loggen -- een niet-geannuleerde mail vertrekt straks alsnog.
    console.error(`${LOG_PREFIX} kon klaarstaande mails niet annuleren voor ${ids.join(', ')}: ${error?.message}`);
    return { cancelled: 0, ids: [] };
  }
}

/**
 * Geannuleerde mails weer in de wachtrij zetten, bij het terughalen van een
 * inschrijving uit het archief.
 *
 * Alleen mails waarvan het verzendmoment nog in de TOEKOMST ligt. Een mail
 * zonder `scheduled_date` betekende "meteen versturen", en dat moment is
 * inmiddels voorbij: die weer op `outgoing` zetten zou een reminder de deur
 * uit sturen voor een event dat misschien al geweest is.
 *
 * @param {Object} env
 * @param {number[]} registrationIds
 * @param {Date} [now]
 * @returns {Promise<{ revived: number }>}
 */
export async function revivePendingMails(env, registrationIds, now = new Date()) {
  const ids = (registrationIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { revived: 0 };

  try {
    const cancelled = await searchRead(env, {
      model: ODOO_MODELS.MAIL,
      domain: [
        [MAIL_FIELDS.MODEL, '=', ODOO_MODELS.REGISTRATION],
        [MAIL_FIELDS.RES_ID, 'in', ids],
        [MAIL_FIELDS.STATE, '=', 'cancel'],
        [MAIL_FIELDS.SCHEDULED_DATE, '>', toOdooDatetime(now)]
      ],
      fields: [MAIL_FIELDS.ID],
      limit: false
    });

    const mailIds = (Array.isArray(cancelled) ? cancelled : [])
      .map((row) => Number(row.id))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (mailIds.length === 0) return { revived: 0 };

    await write(env, {
      model: ODOO_MODELS.MAIL,
      ids: mailIds,
      values: { [MAIL_FIELDS.STATE]: 'outgoing' }
    });

    console.log(`${LOG_PREFIX} ${mailIds.length} mail(s) weer in de wachtrij voor ${ids.join(', ')}`);
    return { revived: mailIds.length };
  } catch (error) {
    console.error(`${LOG_PREFIX} kon mails niet terugzetten voor ${ids.join(', ')}: ${error?.message}`);
    return { revived: 0 };
  }
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
 * @param {boolean} [options.refresh] - klaarstaande mails HERSCHRIJVEN met de
 *   huidige inhoud in plaats van ze over te slaan. Standaard aan: wie op
 *   "klaarzetten" drukt nadat hij de mail heeft aangepast, verwacht dat de
 *   aanpassing meegaat. Verstuurde mails blijven altijd onaangeroerd.
 * @returns {Promise<{ queued: number[], updated: number[], skipped: Array<{id:number, reason:string}> }>}
 */
export async function queueMails(env, { event, registrations, kind, actor = null, now = new Date(), refresh = true }) {
  if (!MAIL_KINDS.includes(kind)) {
    throw new MailError(`Onbekende mailsoort "${kind}"`, { status: 400 });
  }

  // De blokken EERST lezen: daar staat ook de timing van de reminder in, dus
  // die kan niet bepaald worden voordat we weten welke sectie geldt.
  const { typeDoc, eventDoc } = await loadMailBlocks(env, event);
  const sectie = resolveSection(typeDoc, eventDoc, kind, registrations[0]?.site || null);

  // Een recap ZONDER opname is geen recap. Het videoblok zou stil wegvallen
  // en dan vertrekt er een mail die naar een opname verwijst die er niet is
  // -- precies de mail waar mensen over terugmailen. Liever weigeren met de
  // reden erbij dan half versturen.
  if (kind === MAIL_KIND.RECAP) {
    const heeftVideoblok = sectie.blocks.some((block) => block.type === 'video');
    if (heeftVideoblok && !event?.recap?.video_url) {
      throw new MailError(
        'Er hangt nog geen opname aan dit event, en de recapmail bevat een opnameblok. ' +
        'Kies eerst een opname (knop "Opname kiezen"), of haal het opnameblok uit de mail.',
        { status: 409, code: 'MAIL_RECAP_NO_VIDEO' }
      );
    }
  }

  // Eenmalig per aanroep, niet per ontvanger: dit zijn instellingen, geen
  // per-mail-gegevens.
  const mailServerId = resolveMailServerId(env);

  const timing = computeScheduledDate(kind, event, now, sectie.timing);
  if (!timing.send) {
    return { queued: [], updated: [], skipped: registrations.map((r) => ({ id: r.id, reason: timing.reason })) };
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
    if (kind === MAIL_KIND.REMINDER) {
      // Per inschrijving, want deze grens hangt af van HET INSCHRIJFMOMENT
      // van deze persoon en niet van het moment waarop wij dit draaien.
      const teLaat = reminderTooLate(event, sectie.timing, registration.created_at || now);
      if (teLaat) {
        skipped.push({ id: registration.id, reason: teLaat });
        continue;
      }
    }
    const to = String(registration.submitted_email || registration.partner?.email || '').trim();
    if (to === '') {
      skipped.push({ id: registration.id, reason: 'geen e-mailadres' });
      continue;
    }
    candidates.push({ registration, to });
  }

  if (candidates.length === 0) return { queued: [], updated: [], skipped };

  const bestaandeMails = await findExistingMails(
    env,
    event.id,
    kind,
    candidates.map((c) => c.registration.id)
  );

  const [sender, typeColor] = await Promise.all([
    resolveSender(env, event),
    resolveTypeColor(env, event)
  ]);

  // Aankondigingsblokken zoeken hun event op in Odoo. Dat hoort per SITE te
  // gebeuren (een syndicoach-inschrijver krijgt geen openvme-only event te
  // zien) maar niet per ontvanger -- vandaar één ronde per site.
  const aankondigingenPerSite = new Map();
  for (const site of new Set(candidates.map((kandidaat) => kandidaat.registration.site || null))) {
    const sectieVanSite = resolveSection(typeDoc, eventDoc, kind, site);
    aankondigingenPerSite.set(
      site,
      await resolveAnnouncements(env, sectieVanSite.blocks, {
        event,
        site,
        publicBaseUrl: resolvePublicOrigin(env, site),
        now
      })
    );
  }

  const values = [];
  const queuedIds = [];
  // Klaarstaande mails die herschreven moeten worden: per mail apart, want
  // onderwerp en body verschillen per ontvanger.
  const bijwerken = [];

  for (const { registration, to } of candidates) {
    const bestaand = bestaandeMails.get(Number(registration.id));

    // Verstuurd is verstuurd. Die mail staat in iemands inbox; hem hier
    // herschrijven zou een archief vervalsen zonder dat de ontvanger er iets
    // van merkt.
    if (bestaand && bestaand.state === 'sent') {
      skipped.push({ id: registration.id, reason: 'al verstuurd' });
      continue;
    }
    // Geannuleerd hoort bij een gearchiveerde inschrijving (cancelPendingMails).
    // Die weer tot leven wekken is de taak van het terughalen, niet van deze.
    if (bestaand && bestaand.state === 'cancel') {
      skipped.push({ id: registration.id, reason: 'mail geannuleerd (inschrijving gearchiveerd?)' });
      continue;
    }
    if (bestaand && !refresh) {
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
      typeColor,
      announcements: aankondigingenPerSite.get(registration.site || null) || {},
      // Per ontvanger, want de site verschilt per inschrijving.
      publicBaseUrl: resolvePublicOrigin(env, registration.site)
    });

    if (rendered.empty) {
      // Niets ingesteld voor deze soort: dat is een configuratiefout, geen
      // reden om een lege mail te versturen.
      skipped.push({ id: registration.id, reason: 'geen blokken of onderwerp ingesteld' });
      continue;
    }

    if (bestaand) {
      // Alleen de velden die de INHOUD bepalen, plus het verzendmoment:
      // wijzigde de gebruiker de voorsprong van de reminder, dan hoort de
      // klaarstaande mail mee te schuiven. state en message_id blijven af --
      // de sleutel moet dezelfde blijven, anders is de idempotentie weg.
      bijwerken.push({
        mailId: bestaand.mailId,
        registrationId: Number(registration.id),
        values: {
          [MAIL_FIELDS.SUBJECT]: rendered.subject,
          [MAIL_FIELDS.BODY_HTML]: rendered.html,
          [MAIL_FIELDS.EMAIL_FROM]: sender.formatted,
          [MAIL_FIELDS.REPLY_TO]: sender.formatted,
          [MAIL_FIELDS.EMAIL_TO]: to,
          [MAIL_FIELDS.SCHEDULED_DATE]: timing.scheduledDate,
          // Trackingheaders ook hier bijwerken: een mail die nog klaarstond
          // van voor 2026-09-10 heeft ze niet (of enkel de reminder), en
          // zonder metadata kan de webhook hem niet plaatsen.
          [MAIL_FIELDS.HEADERS]: buildMailTrackingHeaders({
            eventId: Number(event.id),
            kind,
            registrationId: Number(registration.id)
          }),
          // Ook de server bijwerken: een mail die nog klaarstond is
          // aangemaakt toen Odoo zelf de standaardserver koos (de
          // newsletter-broadcaststream). Zonder dit vertrekt hij daar nog
          // over, ook al is de instelling inmiddels gezet.
          ...(mailServerId ? { [MAIL_FIELDS.MAIL_SERVER]: mailServerId } : {})
        }
      });
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
      [MAIL_FIELDS.AUTO_DELETE]: false,
      // ALLE DRIE de soorten krijgen open/klik-tracking en de metadata
      // waarmee de webhook de mail terugvindt -- zie postmark-tracking.js.
      // Voorheen kreeg alleen de reminder headers, waardoor "geopend" en
      // "geklikt" voor bevestiging en recap per definitie leeg bleven.
      [MAIL_FIELDS.HEADERS]: buildMailTrackingHeaders({
        eventId: Number(event.id),
        kind,
        registrationId: Number(registration.id)
      }),
      ...(mailServerId ? { [MAIL_FIELDS.MAIL_SERVER]: mailServerId } : {})
    });
    queuedIds.push(Number(registration.id));
  }

  // Eerst het bijwerken: dat kan ook zonder dat er iets nieuws bijkomt.
  const bijgewerkt = await herschrijfMails(env, bijwerken);

  if (values.length === 0) {
    if (bijgewerkt.length > 0) {
      await logToChatter(
        env,
        Number(event.id),
        `${bijgewerkt.length} klaarstaande ${kind}-mail(s) bijgewerkt met de huidige inhoud`,
        actor
      );
    }
    return { queued: [], updated: bijgewerkt, skipped };
  }

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
    `${queuedIds.length} ${kind}-mail(s) klaargezet${timing.scheduledDate ? ` voor ${timing.scheduledDate} UTC` : ''}` +
    (bijgewerkt.length > 0 ? `, ${bijgewerkt.length} klaarstaande mail(s) bijgewerkt` : ''),
    actor
  );

  return { queued: queuedIds, updated: bijgewerkt, skipped };
}

/**
 * Klaarstaande mails herschrijven.
 *
 * Eén write per mail: onderwerp en body verschillen per ontvanger, dus een
 * gedeelde write bestaat hier niet. In blokken van tien parallel -- bij een
 * event met tweehonderd inschrijvingen zijn tweehonderd opeenvolgende
 * JSON-RPC-rondes te veel voor één worker-aanroep.
 *
 * Een mislukte write is niet fataal: de rest gaat door en het mislukte
 * exemplaar blijft staan zoals het was (met de OUDE inhoud, dus zichtbaar
 * verkeerd in Odoo -- beter dan een half herschreven mail).
 *
 * @param {Object} env
 * @param {Array<{mailId:number, registrationId:number, values:Object}>} opdrachten
 * @returns {Promise<number[]>} registratie-id's waarvan de mail is bijgewerkt
 */
async function herschrijfMails(env, opdrachten) {
  const gelukt = [];
  const GROEP = 10;

  for (let i = 0; i < opdrachten.length; i += GROEP) {
    const groep = opdrachten.slice(i, i + GROEP);
    const uitkomsten = await Promise.all(
      groep.map(async (opdracht) => {
        try {
          await write(env, { model: ODOO_MODELS.MAIL, ids: [opdracht.mailId], values: opdracht.values });
          return opdracht.registrationId;
        } catch (error) {
          console.error(
            `${LOG_PREFIX} kon klaarstaande mail ${opdracht.mailId} niet bijwerken: ${error?.message}`
          );
          return null;
        }
      })
    );
    for (const uitkomst of uitkomsten) if (uitkomst !== null) gelukt.push(uitkomst);
  }

  return gelukt;
}

/**
 * Afgeleverd/geopend/geklikt per mailsoort, live uit Odoo (geen eigen tabel
 * -- zie lib/mail-webhook.js). Twee zoekopdrachten TOTAAL voor de hele
 * zichtbare lijst (niet per rij, niet per soort): één op mail.mail (state,
 * voor "afgeleverd") en één op de chatter (mail.message, voor "geopend"/
 * "geklikt" -- enkel mogelijk bij de reminder, want alleen die krijgt
 * open/klik-trackingheaders, zie postmark-tracking.js).
 *
 * VIJF FASEN (2026-09-10): klaargezet, verstuurd, afgeleverd, geopend,
 * geklikt -- voor elk van de drie soorten. "Afgeleverd" staat er bewust in
 * naast "verstuurd": dat verschil is wat een bounce zichtbaar maakt, en bij
 * een event is dat het verschil tussen "hij komt niet" en "hij heeft de mail
 * nooit gehad".
 *
 * LET OP: dit was voordien getReminderMailStatus, enkel voor de reminder.
 * Verbreed naar alle drie de soorten zodat de Mails-kolom in de UI voor
 * elke mail (bevestiging/reminder/recap) dezelfde compacte punten-funnel
 * kan tonen -- "afgeleverd" via Postmark's delivery-event geldt voor elke
 * verstuurde mail op die stream, ongeacht trackingheaders.
 *
 * @param {Object} env
 * @param {number} eventId
 * @param {number[]} registrationIds
 * @returns {Promise<Map<number, Record<string, {delivered:boolean, opened:boolean, clicked:boolean}>>>}
 */
export async function getMailStatus(env, eventId, registrationIds) {
  const ids = (Array.isArray(registrationIds) ? registrationIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);

  // Vijf fasen per soort. `queued` en `sent` komen uit de STATE van het
  // mail.mail-record, niet uit de `_sent`-boolean op de inschrijving: die
  // vlag is voor oudere events geen betrouwbaar antwoord op "heeft deze
  // persoon de mail gehad" (zie include_sent in queueMails).
  const leegPerSoort = () => ({
    queued: false,
    sent: false,
    delivered: false,
    opened: false,
    clicked: false
  });
  const leeg = () => ({
    [MAIL_KIND.CONFIRMATION]: leegPerSoort(),
    [MAIL_KIND.REMINDER]: leegPerSoort(),
    [MAIL_KIND.RECAP]: leegPerSoort()
  });

  const result = new Map();
  for (const id of ids) result.set(id, leeg());
  if (ids.length === 0) return result;

  // message_id → {registrationId, kind}, voor alle drie de soorten van elke
  // registratie -- zelfbeschrijvend, geen aparte koppeltabel nodig (zie
  // buildMessageId).
  const kindByMessageId = new Map();
  const messageIds = [];
  for (const id of ids) {
    for (const kind of [MAIL_KIND.CONFIRMATION, MAIL_KIND.REMINDER, MAIL_KIND.RECAP]) {
      const messageId = buildMessageId(eventId, kind, id);
      kindByMessageId.set(messageId, { registrationId: id, kind });
      messageIds.push(messageId);
    }
  }

  try {
    const mails = await searchRead(env, {
      model: ODOO_MODELS.MAIL,
      domain: [[MAIL_FIELDS.MESSAGE_ID, 'in', messageIds]],
      fields: [MAIL_FIELDS.MESSAGE_ID, MAIL_FIELDS.STATE]
    });
    for (const mail of Array.isArray(mails) ? mails : []) {
      const match = kindByMessageId.get(mail[MAIL_FIELDS.MESSAGE_ID]);
      if (!match || !result.has(match.registrationId)) continue;
      const state = mail[MAIL_FIELDS.STATE];
      const vak = result.get(match.registrationId)[match.kind];

      // 'cancel' = de inschrijving werd gearchiveerd en de klaarstaande mail
      // is geannuleerd. Die telt als niets: hij is niet klaargezet meer.
      if (state === 'cancel') continue;

      // Het mail.mail-record bestaat => klaargezet. 'sent' betekent dat Odoo
      // hem aan Postmark overhandigde; 'received' wordt UITSLUITEND door
      // mail-webhook.js gezet op een bevestigd delivery-event -- pas dat
      // laatste bewijst dat hij ook echt aankwam.
      vak.queued = true;
      if (state === 'sent' || state === 'received') vak.sent = true;
      if (state === 'received') vak.delivered = true;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} mail-status (afgeleverd) ophalen mislukt: ${error?.message}`);
  }

  try {
    // Geen extra body-filter hier: res_id is al beperkt tot precies deze
    // registraties, en het chatter-volume per registratie is klein genoeg
    // dat "alles ophalen, in JS filteren" simpeler is dan een ilike die
    // exact de labeltekst van mail-webhook.js moet blijven volgen.
    const notes = await searchRead(env, {
      model: 'mail.message',
      domain: [
        ['model', '=', ODOO_MODELS.REGISTRATION],
        ['res_id', 'in', ids]
      ],
      fields: ['res_id', 'body']
    });
    for (const note of Array.isArray(notes) ? notes : []) {
      const registrationId = Number(note.res_id);
      if (!result.has(registrationId)) continue;
      // Hoofdletterongevoelig vergelijken met exact de tekst die
      // mail-webhook.js schreef. Die tekst komt uit chatterLabel() in
      // postmark-tracking.js en wordt hier UIT DEZELFDE FUNCTIE opgehaald --
      // niet overgetypt. Een kopie hier zou betekenen dat een spelwijziging
      // aan de schrijverskant deze kolom stil leeg laat, en dat is precies
      // het soort fout dat je pas weken later opmerkt.
      //
      // Alle drie de soorten, niet enkel de reminder: sinds 2026-09-10
      // krijgen bevestiging en recap dezelfde trackingheaders.
      const body = String(note.body || '').toLowerCase();
      for (const kind of [MAIL_KIND.CONFIRMATION, MAIL_KIND.REMINDER, MAIL_KIND.RECAP]) {
        const openLabel = String(chatterLabel(kind, 'open') || '').toLowerCase();
        const clickLabel = String(chatterLabel(kind, 'click') || '').toLowerCase();
        if (openLabel !== '' && body.indexOf(openLabel) !== -1) {
          result.get(registrationId)[kind].opened = true;
        }
        if (clickLabel !== '' && body.indexOf(clickLabel) !== -1) {
          result.get(registrationId)[kind].clicked = true;
        }
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} mail-status (geopend/geklikt) ophalen mislukt: ${error?.message}`);
  }

  return result;
}
