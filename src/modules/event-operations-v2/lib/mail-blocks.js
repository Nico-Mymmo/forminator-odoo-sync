/**
 * Event Operations v2 — Mailblokken
 *
 * Pure module: geen I/O, geen env, geen fetch. Alles is te testen met een
 * gewoon object.
 *
 * HET MODEL, IN DRIE ZINNEN
 * -------------------------
 * 1. De HEADER is altijd bedrijfsgebonden en staat apart van de inhoud: één
 *    afbeelding per site, plus een terugval voor wie via een andere weg
 *    inschreef. In de praktijk is dit vaak het enige verschil tussen de sites.
 * 2. De INHOUD is standaard één versie voor iedereen. Geen zichtbaarheid per
 *    blok, geen sitekeuze -- je schrijft één mail.
 * 3. Wil iemand tóch andere inhoud per bedrijf, dan SPLITST hij de mail in
 *    varianten en duidt hij aan welke variant de terugval is.
 *
 * Een eerdere opzet gaf elk blok een `sites`-lijst. Dat was flexibeler en in
 * de praktijk onwerkbaar: je moest per alinea nadenken over zichtbaarheid,
 * terwijl 95% van de mail voor iedereen hetzelfde is. De site-logica zit nu
 * op precies twee plekken: de header, en (optioneel) de variant.
 *
 * WAAR HET WOONT
 * --------------
 * In Odoo, nergens anders (zie de regel in blocks.js: geen tweede waarheid
 * naast Odoo, en geen Supabase in deze module):
 *
 *   x_webinar_event_type.x_studio_mail_blocks      — standaard per event-type
 *   x_webinar.x_studio_mail_blocks_override        — override per event
 *
 * GEEN LOGICA IN DE TEKST
 * -----------------------
 * Placeholders zijn logic-loos en worden puur tekstueel vervangen: geen eval,
 * geen conditionals in de tekst (zelfde veiligheidsprincipe als de
 * mini-apps-templates).
 */

/** Versie van de JSON-vorm. */
export const MAIL_BLOCKS_VERSION = 2;

/** De drie mailsoorten. */
export const MAIL_KIND = {
  CONFIRMATION: 'confirmation',
  REMINDER: 'reminder',
  RECAP: 'recap'
};

export const MAIL_KINDS = Object.values(MAIL_KIND);

/** De bedrijven. `fallback` is wie via een andere weg inschreef. */
export const SITES = ['openvme', 'syndicoach'];
export const SITE_FALLBACK = 'fallback';
export const HEADER_SLOTS = [...SITES, SITE_FALLBACK];

/**
 * Bloktypes. Bewust een GESLOTEN lijst: een onbekend type wordt geweigerd in
 * plaats van als ruwe HTML doorgelaten.
 *
 * Er zit geen `hero` meer bij: de header is geen blok maar een eigen veld,
 * juist omdat hij als enige per bedrijf verschilt.
 */
export const BLOCK_TYPE = {
  HEADING: 'heading',
  TEXT: 'text',
  EVENT_DETAILS: 'event_details',
  BUTTON: 'button',
  MAP: 'map',
  SIGNATURE: 'signature',
  VIDEO: 'video',
  IMAGE: 'image',
  DIVIDER: 'divider',
  SPACER: 'spacer',
  CARD_BREAK: 'card_break',
  FOOTER: 'footer',
  ANNOUNCEMENT: 'announcement'
};

export const BLOCK_TYPES = Object.values(BLOCK_TYPE);

/** Blokken met een knop erin, en dus met een kleurkeuze. */
export const KLEURBARE_BLOKKEN = [BLOCK_TYPE.BUTTON, BLOCK_TYPE.MAP, BLOCK_TYPE.ANNOUNCEMENT];

/**
 * De regels die het "praktisch kader" standaard toont.
 *
 * Elke regel is gewoon een icoon + label + waarde, en die waarde is vrije
 * tekst met placeholders. Daardoor kan een gebruiker zelf regels toevoegen
 * ("Parking", "Prijs", "Meebrengen") zonder dat daar code voor nodig is, en
 * kan hij bestaande regels anders noemen.
 *
 * Een regel waarvan de waarde leeg uitkomt valt weg bij het versturen -- een
 * online event heeft geen locatie, een live event geen deelnamelink.
 */
export const DETAIL_PRESETS = {
  day: { icon: '📅', label: 'Datum', value: '{{event.day}}' },
  time: { icon: '🕒', label: 'Tijd', value: '{{event.time}}' },
  location: { icon: '📍', label: 'Locatie', value: '{{event.location}}' },
  link: { icon: '🔗', label: 'Deelnamelink', value: '{{event.link}}' },
  host: { icon: '👤', label: 'Spreker', value: '{{host.name}}' },
  capacity: { icon: '👥', label: 'Aantal plaatsen', value: '{{event.capacity}}' },
  seats_left: { icon: '🎟️', label: 'Nog vrij', value: '{{event.seats_left}}' },
  custom: { icon: '✏️', label: 'Eigen regel', value: '' }
};

export const DEFAULT_DETAIL_ROWS = ['day', 'time', 'location', 'link'];

/** @param {string} preset @param {number} index @returns {Object} */
export function detailRow(preset, index = 0) {
  const base = DETAIL_PRESETS[preset] || DETAIL_PRESETS.custom;
  return { id: `${preset}-${index}`, icon: base.icon, label: base.label, value: base.value };
}

/**
 * Wanneer een mail vertrekt. Alleen zinvol voor de reminder -- de bevestiging
 * gaat meteen, de recap wanneer iemand op de knop drukt.
 *
 *  enabled      false = helemaal geen reminder voor dit type/event
 *  leadHours    hoeveel uur vóór de start hij vertrekt
 *  minLeadHours schrijft iemand zich later dan dit in, dan krijgt hij géén
 *               reminder meer. 0 = altijd sturen, desnoods meteen -- een
 *               late inschrijver zonder reminder is anders precies het gat
 *               dat de oude Odoo-cron had.
 */
export const DEFAULT_TIMING = { enabled: true, leadHours: 24, minLeadHours: 0 };

/**
 * Hoe het aankondigingsblok zijn event kiest.
 *
 * Bewust GEEN vrij domein of filtertaal in de mail: dat zou betekenen dat de
 * inhoud van een mail pas te begrijpen is door een query te lezen. Vier
 * keuzes dekken wat er in de praktijk gevraagd wordt:
 *
 *   next          het eerstvolgende gepubliceerde event
 *   next_of_type  het eerstvolgende van één event-type ("volgende Q&A")
 *   highlighted   het eerstvolgende dat in Odoo uitgelicht staat
 *                 (x_studio_priority -- hetzelfde vinkje dat de site gebruikt)
 *   fixed         precies dit ene event, op id
 *
 * Het event waar de mail zelf over gaat valt bij de eerste drie altijd weg:
 * een recap die het event aankondigt dat net geweest is, is onzin.
 *
 * Vindt de keuze niets, dan VALT HET BLOK WEG bij het versturen. Een lege
 * kaart met "geen event gevonden" is erger dan geen kaart.
 */
export const ANNOUNCEMENT_PICK = {
  NEXT: 'next',
  NEXT_OF_TYPE: 'next_of_type',
  HIGHLIGHTED: 'highlighted',
  FIXED: 'fixed'
};

export const ANNOUNCEMENT_PICKS = Object.values(ANNOUNCEMENT_PICK);

export const ANNOUNCEMENT_PICK_LABELS = {
  next: 'Het eerstvolgende event',
  next_of_type: 'Het eerstvolgende van een bepaald type',
  highlighted: 'Het eerstvolgende uitgelichte event',
  fixed: 'Eén vast event'
};

/** @returns {Object} een nieuw aankondigingsblok met zinnige standaarden */
export function emptyAnnouncement(index = 0) {
  return {
    id: `announcement-${index}`,
    type: BLOCK_TYPE.ANNOUNCEMENT,
    pick: ANNOUNCEMENT_PICK.NEXT,
    eventTypeId: null,
    eventId: null,
    title: 'Ook interessant',
    label: 'Bekijk en schrijf je in',
    variant: 'brand',
    showSummary: true
  };
}

class MailBlocksError extends Error {}

/** @returns {Object} lege header met drie slots */
export function emptyHeader() {
  return { openvme: null, syndicoach: null, fallback: null };
}

/** @returns {Object} lege, geldige structuur */
export function emptyMailBlocks() {
  const doc = { version: MAIL_BLOCKS_VERSION };
  for (const kind of MAIL_KINDS) {
    doc[kind] = {
      header: emptyHeader(),
      subject: '',
      preheader: '',
      blocks: [],
      // null = één inhoud voor iedereen. Een object = gesplitst per bedrijf.
      variants: null,
      catchAll: SITES[0]
    };
  }
  return doc;
}

/**
 * JSON uit een Studio-Text-veld inlezen.
 *
 * Odoo geeft leegte terug als `false`. Een leeg veld is een geldige toestand,
 * geen fout. Ongeldige JSON is wél een fout: stil terugvallen op leeg zou
 * betekenen dat een typfout in Odoo de mail geruisloos leegmaakt.
 *
 * @param {string|false|null} raw @param {string} [context]
 * @returns {Object|null}
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
    throw new MailBlocksError(`${context}: verwacht een object`);
  }
  return normalizeMailBlocks(parsed, context);
}

/**
 * Een ingelezen document in de canonieke vorm brengen, inclusief migratie van
 * versie 1.
 *
 * @param {Object} doc @param {string} [context] @returns {Object}
 */
export function normalizeMailBlocks(doc, context = 'mail blocks') {
  const out = { version: MAIL_BLOCKS_VERSION };

  for (const kind of MAIL_KINDS) {
    out[kind] = normalizeSection(doc?.[kind], `${context}.${kind}`);
  }
  return out;
}

/** @returns {Object} */
function normalizeSection(section, context) {
  const migrated = migrateV1Section(section);

  const variants = migrated?.variants && typeof migrated.variants === 'object' && !Array.isArray(migrated.variants)
    ? Object.fromEntries(
        SITES
          .filter((site) => migrated.variants[site])
          .map((site) => [site, normalizeVariant(migrated.variants[site], `${context}.${site}`)])
      )
    : null;

  const catchAll = SITES.includes(migrated?.catchAll) ? migrated.catchAll : SITES[0];

  return {
    header: normalizeHeader(migrated?.header),
    timing: normalizeTiming(migrated?.timing),
    ...normalizeVariant(migrated, context),
    // Een lege of onvolledige splitsing is geen splitsing: dan is er één
    // inhoud voor iedereen en blijft de rest van de code simpel.
    variants: variants && Object.keys(variants).length > 0 ? variants : null,
    catchAll
  };
}

/** @returns {{subject:string, preheader:string, blocks:Object[]}} */
function normalizeVariant(variant, context) {
  return {
    subject: typeof variant?.subject === 'string' ? variant.subject : '',
    preheader: typeof variant?.preheader === 'string' ? variant.preheader : '',
    blocks: normalizeBlocks(variant?.blocks, context)
  };
}

/**
 * Grenzen zijn hier niet cosmetisch: een negatieve of absurde voorsprong
 * levert een scheduled_date op die Odoo zonder klagen accepteert en waar
 * niemand ooit naar kijkt.
 *
 * @returns {Object}
 */
function normalizeTiming(timing) {
  const getal = (waarde, standaard, max) => {
    const n = Number(waarde);
    if (!Number.isFinite(n)) return standaard;
    return Math.min(Math.max(Math.round(n), 0), max);
  };

  return {
    enabled: timing?.enabled !== false,
    // Max 30 dagen: verder vooruit plannen dan dat is bijna altijd een typfout.
    leadHours: getal(timing?.leadHours, DEFAULT_TIMING.leadHours, 24 * 30),
    minLeadHours: getal(timing?.minLeadHours, DEFAULT_TIMING.minLeadHours, 24 * 30)
  };
}

/** @returns {Object} */
function normalizeHeader(header) {
  const out = emptyHeader();
  if (!header || typeof header !== 'object') return out;

  for (const slot of HEADER_SLOTS) {
    const value = header[slot];
    if (!value || typeof value !== 'object') continue;
    const src = String(value.src || '').trim();
    if (src === '') continue;
    out[slot] = {
      src,
      alt: String(value.alt || '').trim(),
      href: String(value.href || '').trim()
    };
  }
  return out;
}

/**
 * Versie 1 → 2.
 *
 * In v1 waren de headers gewone `hero`-blokken met een `sites`-lijst, en had
 * elk blok zo'n lijst. Hier worden de hero's uit de blokkenlijst gelicht en
 * in de header gezet; de `sites` op de overige blokken vervallen, want inhoud
 * is voortaan voor iedereen.
 *
 * Deze migratie draait bij ELKE lees-actie, dus een document dat nog in de
 * oude vorm in Odoo staat werkt gewoon door. Bij de eerstvolgende save wordt
 * het in de nieuwe vorm weggeschreven.
 */
function migrateV1Section(section) {
  if (!section || typeof section !== 'object') return section;
  if (!Array.isArray(section.blocks)) return section;

  const heroes = section.blocks.filter((b) => b && b.type === 'hero');
  const hasSiteFlags = section.blocks.some((b) => Array.isArray(b?.sites) && b.sites.length > 0);
  if (heroes.length === 0 && !hasSiteFlags) return section;

  const header = { ...emptyHeader(), ...(section.header || {}) };
  for (const hero of heroes) {
    const sites = Array.isArray(hero.sites) ? hero.sites : [];
    // `other` heette in v1 wat nu `fallback` is.
    const slots = sites.length === 0
      ? HEADER_SLOTS
      : sites.map((s) => (s === 'other' ? SITE_FALLBACK : s)).filter((s) => HEADER_SLOTS.includes(s));

    for (const slot of slots) {
      if (!header[slot]) header[slot] = { src: hero.src, alt: hero.alt || '', href: hero.href || '' };
    }
  }

  return {
    ...section,
    header,
    blocks: section.blocks
      .filter((b) => b && b.type !== 'hero')
      .map((b) => {
        const copy = { ...b };
        delete copy.sites;
        return copy;
      })
  };
}

/** @param {any} waarde @returns {number|null} */
function heelGetalOfNull(waarde) {
  const n = Number(waarde);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** @param {any} blocks @param {string} context @returns {Object[]} */
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
    const copy = { ...block, id: String(block.id || `${type}-${index}`), type };
    // Zichtbaarheid per blok bestaat niet meer -- weggooien, niet bewaren.
    delete copy.sites;

    // Knopkleur: op elk blok dat een knop tekent. `category` = de kleur van
    // de eventcategorie (blijft meeschuiven), of een hex uit de kleurkiezer.
    // Een onbruikbare waarde wordt WEGGEGOOID en niet bewaard: dan valt de
    // knop terug op de oude variant of op blauw, in plaats van dat er
    // `color:undefined` in de mail belandt.
    if (KLEURBARE_BLOKKEN.includes(type)) {
      const kleur = String(copy.color || '').trim().toLowerCase();
      if (kleur === 'category' || /^#[0-9a-f]{6}$/.test(kleur)) copy.color = kleur;
      else delete copy.color;
      copy.outline = copy.outline === true;
    }

    if (type === BLOCK_TYPE.ANNOUNCEMENT) {
      copy.pick = ANNOUNCEMENT_PICKS.includes(copy.pick) ? copy.pick : ANNOUNCEMENT_PICK.NEXT;
      copy.eventTypeId = heelGetalOfNull(copy.eventTypeId);
      copy.eventId = heelGetalOfNull(copy.eventId);
      copy.title = typeof copy.title === 'string' ? copy.title : 'Ook interessant';
      copy.label = typeof copy.label === 'string' ? copy.label : 'Bekijk en schrijf je in';
      copy.showSummary = copy.showSummary !== false;
    }

    if (type === BLOCK_TYPE.EVENT_DETAILS) {
      copy.rows = normalizeDetailRows(copy);
      // `show` was de eerste, veel beperktere vorm: alleen kiezen WELKE van
      // vier vaste regels je toonde. Nu de regels zelf bewerkbaar zijn, is
      // die lijst overbodig en zou hij twee waarheden geven.
      delete copy.show;
    }

    return copy;
  });
}

/**
 * De regels van een praktisch kader in de canonieke vorm.
 *
 * Migreert onderweg de oude vormen: een blok zonder regels krijgt de
 * standaardset, en een blok met alleen `show: ['day','time','host']` krijgt
 * precies die regels als echte, bewerkbare rijen.
 *
 * @param {Object} block @returns {Object[]}
 */
function normalizeDetailRows(block) {
  if (Array.isArray(block.rows) && block.rows.length > 0) {
    return block.rows
      .filter((row) => row && typeof row === 'object')
      .map((row, index) => ({
        id: String(row.id || `regel-${index}`),
        icon: String(row.icon || '').slice(0, 4),
        label: String(row.label || ''),
        value: String(row.value === undefined || row.value === null ? '' : row.value)
      }));
  }

  const keys = Array.isArray(block.show) && block.show.length > 0
    ? block.show.filter((key) => DETAIL_PRESETS[key])
    : DEFAULT_DETAIL_ROWS;

  return keys.map((key, index) => detailRow(key, index));
}

/**
 * Welke header en welke inhoud gelden voor deze ontvanger?
 *
 * @param {Object|null} typeDoc - standaard van het event-type
 * @param {Object|null} eventDoc - override op het event
 * @param {string} kind - MAIL_KIND.*
 * @param {string|null} site - x_studio_registration_site
 * @returns {{ header: Object|null, subject: string, preheader: string, blocks: Object[],
 *            source: 'event'|'event_type'|'none', variant: string|null }}
 */
export function resolveSection(typeDoc, eventDoc, kind, site = null) {
  if (!MAIL_KINDS.includes(kind)) {
    throw new MailBlocksError(`onbekende mailsoort "${kind}"`);
  }

  // Een override op het event wint VOLLEDIG van de standaard van het type --
  // per soort, niet per blok. Half overnemen zou betekenen dat je bij het
  // lezen van een event niet meer kan zien wat er verstuurd wordt.
  const pick = (doc, source) => {
    const section = doc?.[kind];
    if (!section) return null;
    const content = contentFor(section, site);
    if (content.blocks.length === 0) return null;
    return { header: headerFor(section, site), timing: section.timing || DEFAULT_TIMING, ...content, source };
  };

  return (
    pick(eventDoc, 'event') ||
    pick(typeDoc, 'event_type') || {
      header: headerFor(typeDoc?.[kind] || eventDoc?.[kind], site),
      timing: (eventDoc?.[kind] || typeDoc?.[kind])?.timing || DEFAULT_TIMING,
      subject: '',
      preheader: '',
      blocks: [],
      source: 'none',
      variant: null
    }
  );
}

/** De header voor deze site, met de terugval als die site er geen heeft. */
export function headerFor(section, site) {
  const header = section?.header;
  if (!header) return null;
  const key = String(site || '').trim().toLowerCase();
  return (SITES.includes(key) ? header[key] : null) || header[SITE_FALLBACK] || null;
}

/** De inhoud voor deze site: de gedeelde versie, of de juiste variant. */
export function contentFor(section, site) {
  if (!section?.variants) {
    return {
      subject: section?.subject || '',
      preheader: section?.preheader || '',
      blocks: section?.blocks || [],
      variant: null
    };
  }

  const key = String(site || '').trim().toLowerCase();
  const chosen = (SITES.includes(key) && section.variants[key]) || section.variants[section.catchAll];
  const variantKey = (SITES.includes(key) && section.variants[key]) ? key : section.catchAll;

  return {
    subject: chosen?.subject || '',
    preheader: chosen?.preheader || '',
    blocks: chosen?.blocks || [],
    variant: variantKey
  };
}

/**
 * De inhoud splitsen in één versie per bedrijf. Beide varianten beginnen als
 * een kopie van wat er stond, zodat niemand opnieuw hoeft te typen.
 *
 * @param {Object} section @param {string} [catchAll]
 * @returns {Object}
 */
export function splitIntoVariants(section, catchAll = SITES[0]) {
  if (section?.variants) return section;

  const base = { subject: section?.subject || '', preheader: section?.preheader || '', blocks: section?.blocks || [] };
  const variants = {};
  for (const site of SITES) variants[site] = JSON.parse(JSON.stringify(base));

  return { ...section, variants, catchAll: SITES.includes(catchAll) ? catchAll : SITES[0] };
}

/**
 * Terug naar één inhoud voor iedereen. De variant die als terugval is
 * aangeduid blijft staan -- die is per definitie degene die het breedst
 * bedoeld was; de andere gaat weg.
 *
 * @param {Object} section @returns {Object}
 */
export function mergeVariants(section) {
  if (!section?.variants) return section;
  const keep = section.variants[section.catchAll] || Object.values(section.variants)[0] || {};
  return {
    ...section,
    subject: keep.subject || '',
    preheader: keep.preheader || '',
    blocks: keep.blocks || [],
    variants: null
  };
}
