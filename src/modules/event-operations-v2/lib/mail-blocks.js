/**
 * Event Operations v2 — Mailblokken
 *
 * Pure module: geen I/O, geen env, geen fetch. Alles is te testen met een
 * gewoon object. Alles wat Odoo moet aanroepen staat in mail-service.js.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Vandaag is elke variatie in een event-mail een KOPIE: een gekopieerd
 * `mail.template` plus een gekopieerde `base.automation` met een filter erop
 * (rules 62/63 filteren zelfs op `x_studio_event_type`, het rommelveld dat
 * nooit gelezen mag worden). Structuur en copy laten afwijken per event-type
 * of per site kost dus telkens twee nieuwe Odoo-records.
 *
 * Hier is variatie een EIGENSCHAP van een blok in plaats van een kopie van
 * het geheel: `sites: ['syndicoach']` op een blok vervangt de QWeb
 * `t-if`-constructie op `x_studio_registration_site` in template 50/55.
 *
 * WAAR DE BLOKKEN WONEN
 * ---------------------
 * In Odoo, nergens anders (zie de regel in blocks.js: geen tweede waarheid
 * naast Odoo, en geen Supabase in deze module):
 *
 *   x_webinar_event_type.x_studio_mail_blocks      — standaard per event-type
 *   x_webinar.x_studio_mail_blocks_override        — override per event
 *
 * Allebei Text-velden met JSON in de vorm die `parseMailBlocks()` hieronder
 * accepteert. KV mag hier hoogstens een wegwerpbare kopie van zijn.
 *
 * GEEN LOGICA IN DE TEMPLATE
 * --------------------------
 * Placeholders zijn logic-loos en worden puur tekstueel vervangen: geen eval,
 * geen Function-constructor, geen conditionals in de tekst (zelfde
 * veiligheidsprincipe als de mini-apps-templates). Wie een conditie wil,
 * gebruikt `sites` op een blok.
 */

/** Versie van de JSON-vorm. Bij een breaking change: ophogen en migreren. */
export const MAIL_BLOCKS_VERSION = 1;

/** De drie mailsoorten. Elke soort heeft een eigen subject + blokkenlijst. */
export const MAIL_KIND = {
  CONFIRMATION: 'confirmation',
  REMINDER: 'reminder',
  RECAP: 'recap'
};

export const MAIL_KINDS = Object.values(MAIL_KIND);

/**
 * Bloktypes. Bewust een GESLOTEN lijst: een onbekend type wordt overgeslagen
 * in plaats van als ruwe HTML doorgelaten. De inhoud komt uit Odoo en is dus
 * vertrouwd, maar een typfout hoort geen kapotte mail op te leveren.
 */
export const BLOCK_TYPE = {
  HERO: 'hero',
  HEADING: 'heading',
  TEXT: 'text',
  EVENT_DETAILS: 'event_details',
  BUTTON: 'button',
  DIVIDER: 'divider',
  SPACER: 'spacer',
  VIDEO: 'video'
};

export const BLOCK_TYPES = Object.values(BLOCK_TYPE);

/** Sites waarvoor een blok zichtbaar kan zijn. Leeg/afwezig = alle sites. */
export const BLOCK_SITES = ['openvme', 'syndicoach'];

class MailBlocksError extends Error {}

/**
 * Lege, geldige structuur. Gebruikt als een event-type nog niets heeft
 * ingesteld, zodat de rest van de code nooit met null hoeft te werken.
 *
 * @returns {Object}
 */
export function emptyMailBlocks() {
  const doc = { version: MAIL_BLOCKS_VERSION };
  for (const kind of MAIL_KINDS) {
    doc[kind] = { subject: '', preheader: '', blocks: [] };
  }
  return doc;
}

/**
 * JSON uit een Studio-Text-veld inlezen.
 *
 * Odoo geeft leegte terug als `false`, niet als null of ''. Een leeg veld is
 * een geldige toestand (nog niets ingesteld), geen fout. Ongeldige JSON is
 * wél een fout: stil terugvallen op leeg zou betekenen dat een typfout in
 * Odoo de mail geruisloos leegmaakt.
 *
 * @param {string|false|null} raw
 * @param {string} [context] - voor de foutmelding
 * @returns {Object|null} null als er niets ingesteld is
 */
export function parseMailBlocks(raw, context = 'mail blocks') {
  if (raw === false || raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.trim() === '') return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new MailBlocksError(`${context}: ongeldige JSON (${error?.message})`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MailBlocksError(`${context}: verwacht een object, kreeg ${Array.isArray(parsed) ? 'een array' : typeof parsed}`);
  }

  return normalizeMailBlocks(parsed, context);
}

/**
 * Een ingelezen object in de canonieke vorm brengen: elke soort bestaat,
 * elk blok heeft een id en een geldig type. Onbekende bloktypes worden
 * verwijderd (met hun eigen reden in de fout), onbekende sleutels op het
 * document blijven staan zodat een toekomstige uitbreiding niets sloopt.
 *
 * @param {Object} doc
 * @param {string} [context]
 * @returns {Object}
 */
export function normalizeMailBlocks(doc, context = 'mail blocks') {
  const out = { ...doc, version: MAIL_BLOCKS_VERSION };

  for (const kind of MAIL_KINDS) {
    const section = doc?.[kind];
    out[kind] = {
      subject: typeof section?.subject === 'string' ? section.subject : '',
      preheader: typeof section?.preheader === 'string' ? section.preheader : '',
      blocks: normalizeBlocks(section?.blocks, `${context}.${kind}`)
    };
  }

  return out;
}

/**
 * @param {any} blocks
 * @param {string} context
 * @returns {Object[]}
 */
function normalizeBlocks(blocks, context) {
  if (!Array.isArray(blocks)) return [];

  return blocks.map((block, index) => {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      throw new MailBlocksError(`${context}[${index}]: verwacht een object`);
    }
    const type = String(block.type || '');
    if (!BLOCK_TYPES.includes(type)) {
      throw new MailBlocksError(
        `${context}[${index}]: onbekend bloktype "${type}" (toegestaan: ${BLOCK_TYPES.join(', ')})`
      );
    }

    const sites = Array.isArray(block.sites)
      ? block.sites.map((s) => String(s).trim().toLowerCase()).filter((s) => BLOCK_SITES.includes(s))
      : [];

    return { ...block, id: String(block.id || `${type}-${index}`), type, sites };
  });
}

/**
 * Welke blokkenset geldt voor dit event?
 *
 * Een override op het EVENT wint volledig van de standaard op het
 * EVENT-TYPE — per soort, niet per blok. Half overnemen ("de hero van het
 * type, de tekst van het event") zou betekenen dat je bij het lezen van het
 * event niet meer kan zien wat er verstuurd wordt; dat is precies de
 * ondoorzichtigheid die we van de automations afhalen.
 *
 * @param {Object|null} typeDoc - uit x_webinar_event_type.x_studio_mail_blocks
 * @param {Object|null} eventDoc - uit x_webinar.x_studio_mail_blocks_override
 * @param {string} kind - MAIL_KIND.*
 * @returns {{ subject: string, preheader: string, blocks: Object[], source: 'event'|'event_type'|'none' }}
 */
export function resolveSection(typeDoc, eventDoc, kind) {
  if (!MAIL_KINDS.includes(kind)) {
    throw new MailBlocksError(`onbekende mailsoort "${kind}"`);
  }

  const fromEvent = eventDoc?.[kind];
  if (fromEvent && Array.isArray(fromEvent.blocks) && fromEvent.blocks.length > 0) {
    return { ...fromEvent, source: 'event' };
  }

  const fromType = typeDoc?.[kind];
  if (fromType && Array.isArray(fromType.blocks) && fromType.blocks.length > 0) {
    return { ...fromType, source: 'event_type' };
  }

  return { subject: '', preheader: '', blocks: [], source: 'none' };
}

/**
 * Blokken filteren op site.
 *
 * Een registratie ZONDER site (alle inschrijvingen van vóór
 * x_studio_registration_site, en handmatige toevoegingen) ziet de blokken
 * die voor iedereen bedoeld zijn. Een site-specifiek blok verschijnt dus
 * nooit bij iemand van wie we de site niet kennen -- liever een blok minder
 * dan het verkeerde logo.
 *
 * @param {Object[]} blocks
 * @param {string|null} site
 * @returns {Object[]}
 */
export function blocksForSite(blocks, site) {
  const key = String(site || '').trim().toLowerCase();
  return (blocks || []).filter((block) => {
    if (!Array.isArray(block.sites) || block.sites.length === 0) return true;
    return key !== '' && block.sites.includes(key);
  });
}
