/**
 * Event Operations v2 — Inschrijvingen
 *
 * Odoo is de enige database. Geen Supabase, geen eigen tabel.
 *
 * Dit is het eerste pad dat naar Odoo schrijft op basis van publieke,
 * ongeauthenticeerde input. Drie dingen kunnen hier stil fout gaan en zijn
 * achteraf niet meer terug te vinden:
 *
 *  1. dubbele inschrijvingen — Odoo heeft geen unieke index op
 *     (webinar, partner)
 *  2. dubbele contactpersonen — opgelost in lib/partners.js
 *  3. capaciteit die onder gelijktijdige verzoeken overschreden wordt
 *
 * Voor 1 en 3 gebruiken we een slot in KV plus een controle NA de create.
 * Dat slot is geen echte mutex: KV kent geen conditionele write, dus tussen
 * lezen en schrijven blijft een venster van milliseconden bestaan. Daarom de
 * tweede lijn: na het aanmaken kijken we opnieuw, en als we de wedloop
 * verloren hebben ruimen we ons eigen record weer op. Die combinatie is in
 * de praktijk sluitend; een echte mutex zou een Durable Object vragen.
 */

import { searchRead, executeKw, create, write, messagePost } from '../../../lib/odoo.js';
import {
  ODOO_MODELS,
  REGISTRATION_FIELDS,
  REGISTRATION_LIST_FIELDS,
  toRegistrationDto,
  assertNoForbiddenFields,
  m2oId
} from '../odoo-contract.js';
import { EVENT_BRAND, EVENT_BRANDS } from '../constants.js';
import {
  LOG_PREFIX,
  REGISTRATION_STATE,
  REGISTRATION_SOURCE,
  CACHE_PREFIX
} from '../constants.js';
import { ValidationError, normalizeEmail, normalizePagination } from './validation.js';
import { resolvePartnerByEmail } from './partners.js';
import { getEvent, logToChatter } from './events-service.js';
import { ownsMail, queueMails, cancelPendingMails, revivePendingMails } from './mail-service.js';
import { MAIL_KIND } from './mail-blocks.js';
import { resolveLeadStatesForPartners } from '../../event-operations/services/lead-resolution-service.js';

/** Hoe lang het slot geldig blijft. Kort: alleen de duur van een create. */
const LOCK_TTL_SECONDS = 30;

// ─── Slot ─────────────────────────────────────────────────────────────────────

async function emailFingerprint(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Probeer het slot te nemen voor (event, e-mailadres).
 *
 * @returns {Promise<{ acquired: boolean, release: () => Promise<void> }>}
 */
async function acquireLock(env, eventId, email) {
  const store = env?.MAPPINGS_KV;
  const noop = { acquired: true, release: async () => {} };

  if (!store) return noop;

  const key = `${CACHE_PREFIX}:reglock:${eventId}:${await emailFingerprint(email)}`;

  try {
    const existing = await store.get(key);
    if (existing) {
      return { acquired: false, release: async () => {} };
    }

    await store.put(key, String(Date.now()), { expirationTtl: 60 });

    return {
      acquired: true,
      release: async () => {
        try {
          await store.delete(key);
        } catch (error) {
          // Verloopt zelf na 60s; niet fataal.
          console.warn(`${LOG_PREFIX} slot vrijgeven mislukt (${key}):`, error?.message);
        }
      }
    };
  } catch (error) {
    // Bij een KV-storing liever doorlaten dan een inschrijving weigeren.
    console.warn(`${LOG_PREFIX} slot nemen mislukt, verzoek doorgelaten:`, error?.message);
    return noop;
  }
}

// ─── Tellen ───────────────────────────────────────────────────────────────────

/**
 * Actieve inschrijvingen voor een event (geannuleerde tellen niet mee).
 * @returns {Promise<number>}
 */
export async function countRegistrations(env, eventId) {
  const count = await executeKw(env, {
    model: ODOO_MODELS.REGISTRATION,
    method: 'search_count',
    args: [[
      [REGISTRATION_FIELDS.EVENT, '=', Number(eventId)],
      [REGISTRATION_FIELDS.STATE, '!=', REGISTRATION_STATE.CANCELLED]
    ]]
  });
  return Number(count) || 0;
}

/**
 * Bestaat er al een inschrijving van deze partner op dit event?
 * @returns {Promise<number|null>} het id van de bestaande inschrijving
 */
export async function findExistingRegistration(env, eventId, partnerId) {
  const rows = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain: [
      [REGISTRATION_FIELDS.EVENT, '=', Number(eventId)],
      [REGISTRATION_FIELDS.PARTNER, '=', Number(partnerId)],
      [REGISTRATION_FIELDS.STATE, '!=', REGISTRATION_STATE.CANCELLED]
    ],
    fields: [REGISTRATION_FIELDS.ID],
    order: 'id asc',
    limit: 2
  });

  const list = Array.isArray(rows) ? rows : [];
  return list.length > 0 ? Number(list[0].id) : null;
}

/**
 * Zelfde vraag als findExistingRegistration, maar op het ingevulde e-mailadres
 * in plaats van een partner-id. Bestaat uitsluitend om VOOR de aanmaak parallel
 * te kunnen draaien met resolvePartnerByEmail (zie createRegistration): die
 * laatste moet éérst de partner opzoeken/aanmaken voor er een partnerId is, dus
 * findExistingRegistration(partnerId) kan daar niet los van staan. Deze functie
 * wel, want het ingetypte e-mailadres is al bekend voor er iets over de partner
 * bekend is.
 *
 * Dit is een VOORCONTROLE, geen vervanging: de gezaghebbende controle blijft de
 * partnerId-gebaseerde findExistingRegistration ná het aanmaken (de wedloop-
 * compensatie in createRegistration), want die vangt ook een partner die via
 * een ander e-mailadres al stond ingeschreven.
 *
 * @returns {Promise<number|null>} het id van de bestaande inschrijving
 */
async function findExistingRegistrationByEmail(env, eventId, email) {
  const rows = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain: [
      [REGISTRATION_FIELDS.EVENT, '=', Number(eventId)],
      [REGISTRATION_FIELDS.SUBMITTED_EMAIL, '=ilike', email],
      [REGISTRATION_FIELDS.STATE, '!=', REGISTRATION_STATE.CANCELLED]
    ],
    fields: [REGISTRATION_FIELDS.ID],
    order: 'id asc',
    limit: 2
  });

  const list = Array.isArray(rows) ? rows : [];
  return list.length > 0 ? Number(list[0].id) : null;
}

// ─── Aanmaken ─────────────────────────────────────────────────────────────────

function buildDisplayName(input, email) {
  const name = [input.first_name, input.last_name]
    .map((part) => String(part || '').trim())
    .filter((part) => part !== '')
    .join(' ');
  return name !== '' ? name : email;
}

/**
 * Een inschrijving aanmaken.
 *
 * @param {Object} env
 * @param {Object} options
 * @param {Object} options.event - DTO uit getEvent
 * @param {Object} options.input - het formulier
 * @param {string} [options.source]
 * @param {Object} [options.actor] - de OM-gebruiker bij een handmatige toevoeging
 * @param {Object} [options.ctx] - Cloudflare ctx, om de chatternotitie ná het
 *   antwoord af te handelen; dat scheelt de bezoeker een Odoo-ronde
 * @returns {Promise<{ id: number, state: string, waitlisted: boolean, partnerId: number, contactCreated: boolean }>}
 */
/**
 * De inschrijvingen die een mail van een bepaalde soort nog moeten krijgen.
 *
 * Bewust hier en niet in mail-service.js: dit is een vraag over
 * inschrijvingen, en alle Odoo-toegang tot x_webinarregistrations hoort in
 * dit bestand te blijven.
 *
 * De vlag filtert alleen wanneer er GEEN expliciete id's meegegeven zijn.
 * Kiest een beheerder in de UI zelf een paar ontvangers, dan is dat een
 * bewuste actie; dubbel versturen wordt daar nog steeds tegengehouden door
 * de message_id-sleutel in mail-service.js, niet door de vlag.
 *
 * @param {Object} env
 * @param {number} eventId
 * @param {Object} options
 * @param {string} options.kind - MAIL_KIND.*
 * @param {number[]|null} [options.registrationIds]
 * @returns {Promise<Object[]>} DTO's
 */
/**
 * Een inschrijving archiveren of terughalen.
 *
 * "Verwijderen" in de OM is ARCHIVEREN in Odoo (`x_active = false`), nooit
 * unlink. Reden: een inschrijving is het spoor van een echt persoon die zich
 * heeft opgegeven -- aanwezigheid, verzonden mails, de chatter met de
 * herkomst. Dat weggooien is onomkeerbaar en er is geen enkele situatie
 * waarin het nodig is. Gearchiveerd verdwijnt het uit alle lijsten en uit
 * elke mailselectie (die filteren op x_active = true), maar blijft het
 * terug te halen.
 *
 * @param {Object} env
 * @param {number} id
 * @param {boolean} active
 * @param {Object} [actor]
 * @returns {Promise<{ id: number, active: boolean, event_id: number|null }>}
 */
export async function setRegistrationActive(env, id, active, actor = null) {
  const registrationId = Number(id);
  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    throw new ValidationError('Ongeldig inschrijvings-id', { status: 400 });
  }

  // Ook de gearchiveerde meenemen: anders is een al gearchiveerde
  // inschrijving onvindbaar en kan je hem nooit terughalen.
  const rows = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain: [[REGISTRATION_FIELDS.ID, '=', registrationId]],
    fields: [REGISTRATION_FIELDS.ID, REGISTRATION_FIELDS.NAME, REGISTRATION_FIELDS.EVENT, REGISTRATION_FIELDS.ACTIVE],
    limit: 1,
    context: { active_test: false }
  });

  if (!rows || rows.length === 0) {
    throw new ValidationError(`Inschrijving ${registrationId} niet gevonden`, { status: 404 });
  }

  const record = rows[0];
  const eventId = m2oId(record[REGISTRATION_FIELDS.EVENT]);
  const who = actor?.email || actor?.name || 'onbekende gebruiker';

  await write(env, {
    model: ODOO_MODELS.REGISTRATION,
    ids: [registrationId],
    values: { [REGISTRATION_FIELDS.ACTIVE]: Boolean(active) }
  });

  // Klaarstaande mails meenemen. Odoo's mailcron kijkt niet naar `x_active`
  // op de registratie, dus zonder deze stap krijgt een verwijderde deelnemer
  // alsnog zijn reminder. Bij terughalen gaan alleen mails terug in de
  // wachtrij waarvan het moment nog niet voorbij is.
  const mailGevolg = active
    ? await revivePendingMails(env, [registrationId])
    : await cancelPendingMails(env, [registrationId]);

  // Op het EVENT loggen, niet op de inschrijving: bij archiveren is dat de
  // plek waar iemand later gaat kijken waarom er eentje mist.
  if (eventId) {
    const wie = record[REGISTRATION_FIELDS.NAME] || registrationId;
    const mails = active
      ? (mailGevolg.revived > 0 ? ` — ${mailGevolg.revived} klaarstaande mail(s) weer in de wachtrij` : '')
      : (mailGevolg.cancelled > 0 ? ` — ${mailGevolg.cancelled} klaarstaande mail(s) geannuleerd` : '');

    await logToChatter(
      env,
      eventId,
      (active
        ? `Inschrijving teruggehaald uit het archief: ${wie}`
        : `Inschrijving gearchiveerd: ${wie}`) + mails,
      actor
    );
  }

  console.log(
    `${LOG_PREFIX} inschrijving ${registrationId} ${active ? 'teruggehaald' : 'gearchiveerd'} door ${who}`
  );

  // Zichtbaar op de website: binnen de bestaande TTL, of meteen na een
  // expliciete "Publiceer naar website"-actie (publishToWebsite() in
  // events-service.js) -- niet automatisch bij elke schrijfactie hier.
  return {
    id: registrationId,
    active: Boolean(active),
    event_id: eventId,
    mails_cancelled: mailGevolg.cancelled || 0,
    mails_revived: mailGevolg.revived || 0
  };
}

/**
 * Alle nog actieve inschrijvingen van een event archiveren, in één write.
 *
 * Wordt gebruikt wanneer een event verwijderd wordt: de deelnemers blijven
 * dan bewaard in plaats van mee te verdwijnen.
 *
 * @param {Object} env @param {number} eventId @param {Object} [actor]
 * @returns {Promise<{ archived: number, ids: number[] }>}
 */
export async function archiveRegistrationsForEvent(env, eventId, actor = null) {
  const rows = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain: [
      [REGISTRATION_FIELDS.EVENT, '=', Number(eventId)],
      [REGISTRATION_FIELDS.ACTIVE, '=', true]
    ],
    fields: [REGISTRATION_FIELDS.ID],
    limit: false
  });

  const ids = (Array.isArray(rows) ? rows : [])
    .map((row) => Number(row.id))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (ids.length === 0) return { archived: 0, ids: [] };

  await write(env, {
    model: ODOO_MODELS.REGISTRATION,
    ids,
    values: { [REGISTRATION_FIELDS.ACTIVE]: false }
  });

  // Ook hier de wachtrij leegmaken: anders vertrekken de reminders van een
  // verwijderd event alsnog.
  const { cancelled } = await cancelPendingMails(env, ids);

  const who = actor?.email || actor?.name || 'onbekende gebruiker';
  console.log(
    `${LOG_PREFIX} ${ids.length} inschrijving(en) van event ${eventId} gearchiveerd door ${who}` +
    (cancelled > 0 ? ` (${cancelled} klaarstaande mail(s) geannuleerd)` : '')
  );

  return { archived: ids.length, ids, mails_cancelled: cancelled };
}

export async function listRegistrationsForMail(
  env,
  eventId,
  { kind, registrationIds = null, includeSent = false } = {}
) {
  const sentField = {
    [MAIL_KIND.CONFIRMATION]: REGISTRATION_FIELDS.CONFIRMATION_SENT,
    [MAIL_KIND.REMINDER]: REGISTRATION_FIELDS.REMINDER_SENT,
    [MAIL_KIND.RECAP]: REGISTRATION_FIELDS.RECAP_SENT
  }[kind];

  if (!sentField) {
    throw new ValidationError(`Onbekende mailsoort "${kind}"`);
  }

  const domain = [
    [REGISTRATION_FIELDS.EVENT, '=', Number(eventId)],
    [REGISTRATION_FIELDS.ACTIVE, '=', true],
    // Geannuleerde inschrijvingen krijgen niets. Wachtlijst wél: die persoon
    // is ingeschreven, alleen niet zeker van een plaats.
    [REGISTRATION_FIELDS.STATE, '!=', REGISTRATION_STATE.CANCELLED]
  ];

  if (Array.isArray(registrationIds) && registrationIds.length > 0) {
    domain.push([REGISTRATION_FIELDS.ID, 'in', registrationIds.filter((n) => Number.isInteger(n))]);
  } else if (!includeSent) {
    domain.push([sentField, '=', false]);
  }

  // includeSent negeert de _sent-vlag. Dat is nodig voor HISTORISCHE data: de
  // oude Odoo-serveractie 1099 zette `x_studio_recap_email_sent` op TRUE voor
  // álle registraties van een event, ook die waarvoor de verzending faalde en
  // ook voor de duplicaten die ze net op e-mailadres had weggefilterd. Die
  // vlag is voor bestaande events dus geen betrouwbaar antwoord op "heeft
  // deze persoon de mail gehad".
  //
  // Dubbele mails kan dit niet opleveren: de bewaking zit op de message_id
  // van het mail.mail-record (findAlreadyQueued in mail-service.js), en die
  // is per (event, soort, inschrijving) uniek.

  assertNoForbiddenFields(REGISTRATION_LIST_FIELDS, 'listRegistrationsForMail');

  const records = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain,
    fields: REGISTRATION_LIST_FIELDS,
    limit: false,
    order: `${REGISTRATION_FIELDS.ID} asc`
  });

  return (records || []).map(toRegistrationDto);
}

export async function createRegistration(env, options) {
  const { event, input, source = REGISTRATION_SOURCE.PUBLIC_FORM, actor = null, ctx = null } = options;

  const eventId = Number(event.id);
  const email = normalizeEmail(input?.email);

  const lock = await acquireLock(env, eventId, email);
  if (!lock.acquired) {
    throw new ValidationError('Je inschrijving wordt al verwerkt. Even geduld.', { status: 409 });
  }

  try {
    const capacity = event.registration?.capacity ?? null;

    // Drie onafhankelijke lezingen vóór de create: de partner opzoeken/aanmaken,
    // een voorcontrole op dubbele inschrijving (via het ingetypte e-mailadres,
    // zie findExistingRegistrationByEmail hierboven) en de capaciteitscontrole.
    // Geen van de drie heeft de uitkomst van een ander nodig, dus na elkaar
    // uitvoeren kost alleen extra rondetijd naar Odoo.
    const [partner, existingBySubmittedEmail, takenBeforeCreate] = await Promise.all([
      resolvePartnerByEmail(env, email, {
        name: buildDisplayName(input, email),
        phone: input?.phone,
        company: input?.company
      }),
      findExistingRegistrationByEmail(env, eventId, email),
      capacity !== null ? countRegistrations(env, eventId) : Promise.resolve(null)
    ]);

    if (existingBySubmittedEmail) {
      throw new ValidationError('Je bent al ingeschreven voor dit event.', {
        status: 409,
        details: { registration_id: existingBySubmittedEmail }
      });
    }

    if (capacity !== null && takenBeforeCreate >= capacity) {
      throw new ValidationError('Dit event is volzet.', { status: 409 });
    }

    const values = {
      [REGISTRATION_FIELDS.NAME]: buildDisplayName(input, email),
      [REGISTRATION_FIELDS.EVENT]: eventId,
      [REGISTRATION_FIELDS.PARTNER]: partner.partnerId,
      [REGISTRATION_FIELDS.SUBMITTED_EMAIL]: String(input?.email || '').trim(),
      [REGISTRATION_FIELDS.STATE]: REGISTRATION_STATE.REGISTERED,
      [REGISTRATION_FIELDS.SOURCE]: source,
      [REGISTRATION_FIELDS.CONTACT_CREATED]: partner.created
    };

    // ── De oude Odoo-automations buitenspel zetten, IN DE CREATE ───────────
    //
    // Rules 53 en 62 zijn `on_create_or_write` en filteren op
    // `x_studio_confirmation_email_sent = False`. Odoo voert een
    // base.automation bij een create SYNCHROON uit, tijdens diezelfde
    // create-call. De vlag pas ná de create zetten is dus te laat: de
    // automation heeft dan al gevuurd en de deelnemer krijgt twee mails --
    // de oude van Odoo en de nieuwe van de OM.
    //
    // Daarom wordt het record meteen geboren met beide vlaggen op true. Voor
    // de reminder (rules 58/63, on_time) is het niet kritiek, maar dezelfde
    // redenering geldt en het houdt het symmetrisch.
    //
    // Faalt het klaarzetten hierna, dan zetten we de betrokken vlag weer op
    // false (zie hieronder): de oude automation vuurt dan alsnog op die
    // write, en er is dus geen situatie waarin iemand niets krijgt.
    const claimsMail = ownsMail(env, event);
    if (claimsMail) {
      values[REGISTRATION_FIELDS.CONFIRMATION_SENT] = true;
      values[REGISTRATION_FIELDS.REMINDER_SENT] = true;
    }

    const questions = String(input?.questions || '').trim();
    if (questions !== '') {
      values[REGISTRATION_FIELDS.QUESTIONS] = questions;
    }

    // Welke site (openvme/syndicoach) de bezoeker gebruikte om in te
    // schrijven -- de site-key op de aanvraag legt dit al vast, hier
    // schrijven we het enkel door. Een onbekende/lege waarde laten we
    // gewoon weg i.p.v. te falen: dan blijft het veld leeg in Odoo,
    // net als bij oudere/handmatige inschrijvingen.
    const site = String(input?.site || '').trim().toLowerCase();
    if (EVENT_BRANDS.includes(site) && site !== EVENT_BRAND.BOTH) {
      values[REGISTRATION_FIELDS.SITE] = site;
    }

    assertNoForbiddenFields(Object.keys(values), 'createRegistration');

    const registrationId = Number(await create(env, { model: ODOO_MODELS.REGISTRATION, values }));

    // ── Tweede lijn: controleren of we de wedloop gewonnen hebben ──────────
    //
    // Het slot laat een venster van milliseconden open. Bleek er intussen
    // een oudere inschrijving van dezelfde partner te bestaan, dan ruimen we
    // ons eigen record weer op. Dat is de compensatie die het sluitend maakt.
    const winner = await findExistingRegistration(env, eventId, partner.partnerId);
    if (winner !== null && winner !== registrationId) {
      console.warn(
        `${LOG_PREFIX} wedloop verloren voor ${email} op event ${eventId}: ` +
        `${registrationId} verwijderd, ${winner} blijft staan`
      );
      try {
        await executeKw(env, {
          model: ODOO_MODELS.REGISTRATION,
          method: 'unlink',
          args: [[registrationId]]
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} kon dubbele inschrijving ${registrationId} niet opruimen:`, error?.message);
      }
      throw new ValidationError('Je bent al ingeschreven voor dit event.', { status: 409 });
    }

    // ── Capaciteit na de create ────────────────────────────────────────────
    //
    // Zelfde verhaal: twee gelijktijdige verzoeken kunnen beide de controle
    // passeren. In plaats van de laatste te weigeren nadat hij al bestaat,
    // zetten we hem op de wachtlijst. Dat is eerlijker naar de bezoeker dan
    // een overboeking, en het veld bestaat al in Odoo.
    let waitlisted = false;
    if (capacity !== null) {
      const taken = await countRegistrations(env, eventId);
      if (taken > capacity) {
        await write(env, {
          model: ODOO_MODELS.REGISTRATION,
          ids: [registrationId],
          values: { [REGISTRATION_FIELDS.STATE]: REGISTRATION_STATE.WAITLISTED }
        });
        waitlisted = true;
        console.warn(`${LOG_PREFIX} inschrijving ${registrationId} op de wachtlijst: ${taken}/${capacity}`);
      }
    }

    // ── Herkomst en toestemming naar de chatter ────────────────────────────
    //
    // Bewust GEEN nieuwe Studio-velden hiervoor: dit is context, geen
    // gegeven waarop gerapporteerd wordt. De chatter is traceerbaar en
    // vraagt geen veldwerk in Odoo.
    //
    // NA het antwoord, als de omgeving dat toelaat: de bezoeker hoeft niet
    // op een notitie te wachten. Zonder ctx wél afwachten, anders zou de
    // notitie verloren gaan wanneer de Worker afsluit.
    const chatter = logRegistrationContext(env, registrationId, { input, source, partner, actor, waitlisted });

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(chatter);
    } else {
      await chatter;
    }

    // Zichtbaar op de website: binnen de bestaande 60s-TTL, of meteen na een
    // expliciete "Publiceer naar website"-actie -- niet automatisch bij elke
    // inschrijving. De capaciteitscontrole hierboven leunt hier NIET op (die
    // gaat via countRegistrations()/acquireLock(), niet via deze cache).

    // ── Bevestigings- en reminder-mail ─────────────────────────────────────
    //
    // Alleen als de OM de mails van dit event-type overgenomen heeft
    // (EVENTS_V2_MAIL_OWNER). Staat die vlag niet, dan gebeurt hier niets
    // en blijven de bestaande Odoo-automations 53/62 resp. 58/63 het werk
    // doen -- zo kan een deploy op zich nooit een mail veroorzaken.
    //
    // Fire-and-forget ná het antwoord, zelfde patroon als de chatternotitie
    // hierboven en als pushWpReload(): de bezoeker hoort niet te wachten op
    // twee Odoo-rondes. Zonder ctx (test, cron) wél afwachten.
    //
    // Beide soorten worden hier al klaargezet: de reminder krijgt zijn
    // scheduled_date meteen mee (start - 24u), zodat er geen dagelijkse
    // herberekening meer nodig is. Zie computeScheduledDate() voor waarom
    // dat de bug van Odoo-cron 84 wegneemt.
    if (claimsMail) {
      const registrationForMail = {
        id: registrationId,
        name: values[REGISTRATION_FIELDS.NAME],
        submitted_email: values[REGISTRATION_FIELDS.SUBMITTED_EMAIL] || email,
        site: values[REGISTRATION_FIELDS.SITE] || null,
        state: waitlisted ? REGISTRATION_STATE.WAITLISTED : REGISTRATION_STATE.REGISTERED
      };

      const sentFieldByKind = {
        [MAIL_KIND.CONFIRMATION]: REGISTRATION_FIELDS.CONFIRMATION_SENT,
        [MAIL_KIND.REMINDER]: REGISTRATION_FIELDS.REMINDER_SENT
      };

      const mails = (async () => {
        for (const kind of [MAIL_KIND.CONFIRMATION, MAIL_KIND.REMINDER]) {
          let queued = 0;
          try {
            const result = await queueMails(env, {
              event,
              registrations: [registrationForMail],
              kind,
              actor: actor || { name: 'inschrijfformulier' }
            });
            queued = result?.queued?.length || 0;
          } catch (error) {
            // Nooit fataal: de inschrijving zelf staat al in Odoo en die is
            // het belangrijkste. Wél luid loggen -- een mail die niet
            // klaargezet raakt, mag niet stil verdwijnen.
            console.error(
              `${LOG_PREFIX} ${kind}-mail niet klaargezet voor inschrijving ${registrationId}: ${error?.message}`
            );
          }

          // Niets klaargezet (fout, of geen blokken ingesteld voor deze
          // soort)? Dan de claim teruggeven, zodat de bestaande
          // Odoo-automation alsnog zijn oude mail stuurt. Beter de oude mail
          // dan helemaal geen mail.
          if (queued === 0) {
            try {
              await write(env, {
                model: ODOO_MODELS.REGISTRATION,
                ids: [registrationId],
                values: { [sentFieldByKind[kind]]: false }
              });
              console.warn(
                `${LOG_PREFIX} ${kind} teruggegeven aan de Odoo-automation voor inschrijving ${registrationId}`
              );
            } catch (error) {
              console.error(
                `${LOG_PREFIX} kon ${kind} niet teruggeven voor inschrijving ${registrationId}: ${error?.message}`
              );
            }
          }
        }
      })();

      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(mails);
      } else {
        await mails;
      }
    }

    return {
      id: registrationId,
      state: waitlisted ? REGISTRATION_STATE.WAITLISTED : REGISTRATION_STATE.REGISTERED,
      waitlisted,
      partnerId: partner.partnerId,
      contactCreated: partner.created
    };
  } finally {
    await lock.release();
  }
}

async function logRegistrationContext(env, registrationId, { input, source, partner, actor, waitlisted }) {
  const lines = [`Inschrijving via <b>${escapeHtml(source)}</b>.`];

  if (actor?.email || actor?.name) {
    lines.push(`Toegevoegd door ${escapeHtml(actor.email || actor.name)}.`);
  }
  if (partner.created) {
    lines.push('Nieuw contact aangemaakt in Odoo.');
  } else if (partner.enriched?.length) {
    lines.push(`Bestaand contact aangevuld: ${escapeHtml(partner.enriched.join(', '))}.`);
  }
  if (partner.duplicates > 0) {
    lines.push(`Let op: er bestaan ${partner.duplicates} contact(en) met hetzelfde e-mailadres.`);
  }
  if (waitlisted) {
    lines.push('Op de wachtlijst geplaatst: de capaciteit was net bereikt.');
  }

  lines.push(
    input?.consent
      ? 'Toestemming gegeven voor verdere communicatie.'
      : 'Geen toestemming gegeven voor verdere communicatie.'
  );

  const utm = input?.utm && typeof input.utm === 'object' ? input.utm : null;
  const utmPairs = utm
    ? Object.entries(utm).filter(([, value]) => value !== null && value !== undefined && String(value) !== '')
    : [];
  if (utmPairs.length > 0) {
    lines.push(
      'Herkomst: ' + utmPairs.map(([key, value]) => `${escapeHtml(key)}=${escapeHtml(String(value))}`).join(', ')
    );
  }

  try {
    await messagePost(env, {
      model: ODOO_MODELS.REGISTRATION,
      id: registrationId,
      // isHtml: de body bevat <br/> en elke ingevoegde waarde is hierboven
      // al geescaped -- zonder dit leest de chatter letterlijk "<br/>".
      body: lines.join('<br/>'),
      isHtml: true
    });
  } catch (error) {
    // Nooit fataal: de inschrijving staat er, de notitie is bijzaak.
    console.warn(`${LOG_PREFIX} chatternotitie mislukt voor inschrijving ${registrationId}:`, error?.message);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Lezen ────────────────────────────────────────────────────────────────────

/**
 * Inschrijvingen van een event, met de lead-status per deelnemer.
 *
 * Drie Odoo-calls: search_count voor het totaal, search_read voor de pagina,
 * en de bestaande lead-resolutie in batch. Nooit een call per rij.
 *
 * @param {Object} env
 * @param {number} eventId
 * @param {Object} [query] - page, per_page
 * @returns {Promise<{ rows: Object[], total: number, page: number, perPage: number }>}
 */
export async function listRegistrations(env, eventId, query = {}) {
  const { page, perPage, offset } = normalizePagination(query);

  assertNoForbiddenFields(REGISTRATION_LIST_FIELDS, 'listRegistrations');

  const domain = [[REGISTRATION_FIELDS.EVENT, '=', Number(eventId)]];

  // Gearchiveerde inschrijvingen vallen standaard weg (Odoo's active_test op
  // x_active). Met include_archived komen ze erbij, zodat je ze kan
  // terughalen -- anders zijn ze onzichtbaar en dus onbereikbaar.
  const includeArchived = query?.include_archived === true || query?.include_archived === '1';
  const context = includeArchived ? { active_test: false } : undefined;

  const [total, records] = await Promise.all([
    executeKw(env, {
      model: ODOO_MODELS.REGISTRATION,
      method: 'search_count',
      args: [domain],
      kwargs: context ? { context } : {}
    }),
    searchRead(env, {
      model: ODOO_MODELS.REGISTRATION,
      domain,
      fields: [...REGISTRATION_LIST_FIELDS],
      limit: perPage,
      offset,
      order: 'create_date desc, id desc',
      context
    })
  ]);

  const rows = (Array.isArray(records) ? records : []).map(toRegistrationDto);

  // Lead-status in een keer voor alle partners op deze pagina. Hergebruikt
  // de deterministische resolutie uit v1 — die is goed en blijft ongewijzigd.
  const partnerIds = [...new Set(rows.map((row) => row.partner.id).filter((id) => Number.isInteger(id) && id > 0))];

  if (partnerIds.length > 0) {
    try {
      const leadByPartner = await resolveLeadStatesForPartners(env, partnerIds);
      for (const row of rows) {
        row.lead = row.partner.id ? (leadByPartner.get(row.partner.id) || null) : null;
      }
    } catch (error) {
      // Zonder lead-status is de lijst nog steeds bruikbaar.
      console.warn(`${LOG_PREFIX} lead-resolutie mislukt voor event ${eventId}:`, error?.message);
      for (const row of rows) row.lead = null;
    }
  } else {
    for (const row of rows) row.lead = null;
  }

  return { rows, total: Number(total) || rows.length, page, perPage };
}

// ─── Aanwezigheid ─────────────────────────────────────────────────────────────

/**
 * Aanwezigheid zetten, met het auditspoor.
 *
 * De drie auditvelden gaan in DEZELFDE write als de vlag, en er is
 * BEWUST GEEN try/catch die ze weglaat bij een fout. Precies die
 * constructie zorgde er in v1 voor dat het auditspoor nooit werkte:
 * elke schrijfactie viel stil terug op alleen de vlag. Faalt de write
 * hier, dan faalt de actie en zie je het.
 *
 * @param {Object} env
 * @param {number} registrationId
 * @param {Object} params
 * @param {boolean} params.attended
 * @param {Object} [params.actor] - de OM-gebruiker
 * @param {string} [params.origin]
 * @param {Object} [params.ctx] - Cloudflare ctx voor de chatternotitie
 * @returns {Promise<Object>} het bijgewerkte DTO
 */
export async function setAttendance(env, registrationId, params) {
  const id = Number(registrationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Ongeldig inschrijvings-id', { status: 400 });
  }

  if (typeof params?.attended !== 'boolean') {
    throw new ValidationError('attended moet true of false zijn');
  }

  const odooUserId = Number(env?.UID);
  const values = {
    [REGISTRATION_FIELDS.ATTENDED]: params.attended,
    [REGISTRATION_FIELDS.ATTENDANCE_UPDATED_AT]: toOdooTimestamp(new Date()),
    [REGISTRATION_FIELDS.ATTENDANCE_ORIGIN]: String(params.origin || 'events_v2').slice(0, 64)
  };

  // De Odoo-gebruiker waaronder de Worker werkt. Wie het in de OM deed
  // staat in de chatter, want dat is een OM-gebruiker en geen res.users.
  if (Number.isInteger(odooUserId) && odooUserId > 0) {
    values[REGISTRATION_FIELDS.ATTENDANCE_UPDATED_BY] = odooUserId;
  }

  assertNoForbiddenFields(Object.keys(values), 'setAttendance');

  await write(env, { model: ODOO_MODELS.REGISTRATION, ids: [id], values });

  const who = params.actor?.email || params.actor?.name || 'onbekende gebruiker';
  const chatter = messagePost(env, {
    model: ODOO_MODELS.REGISTRATION,
    id,
    body: `Aanwezigheid ${params.attended ? 'aangevinkt' : 'uitgevinkt'} door ${escapeHtml(who)}.`,
    isHtml: true
  }).catch((error) => {
    console.warn(`${LOG_PREFIX} chatternotitie aanwezigheid mislukt (${id}):`, error?.message);
  });

  if (params.ctx && typeof params.ctx.waitUntil === 'function') {
    params.ctx.waitUntil(chatter);
  } else {
    await chatter;
  }

  // Zichtbaar op de website: binnen de bestaande TTL, of meteen na een
  // expliciete "Publiceer naar website"-actie (publishToWebsite() in
  // events-service.js) -- niet automatisch bij elke schrijfactie hier.

  return getRegistration(env, id);
}

/** Odoo-datetime uit een Date. */
function toOdooTimestamp(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/**
 * Toestand van een inschrijving wijzigen (bv. afmelden).
 * @returns {Promise<Object>}
 */
export async function setRegistrationState(env, registrationId, state, actor = null) {
  const id = Number(registrationId);
  const allowed = Object.values(REGISTRATION_STATE);

  if (!allowed.includes(state)) {
    throw new ValidationError(`Onbekende toestand: ${state}. Verwacht een van ${allowed.join(', ')}.`);
  }

  await write(env, {
    model: ODOO_MODELS.REGISTRATION,
    ids: [id],
    values: { [REGISTRATION_FIELDS.STATE]: state }
  });

  const who = actor?.email || actor?.name || 'onbekende gebruiker';
  try {
    await messagePost(env, {
      model: ODOO_MODELS.REGISTRATION,
      id,
      body: `Toestand gewijzigd naar <b>${escapeHtml(state)}</b> door ${escapeHtml(who)}.`,
      isHtml: true
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} chatternotitie toestand mislukt (${id}):`, error?.message);
  }

  // Zichtbaar op de website: binnen de bestaande TTL, of meteen na een
  // expliciete "Publiceer naar website"-actie (publishToWebsite() in
  // events-service.js) -- niet automatisch bij elke schrijfactie hier.
  return getRegistration(env, id);
}

/**
 * Inschrijvingen van een event met een ingevulde vraag, nieuwste eerst.
 *
 * Vervangt de vroegere inline expando-rij als PRIMAIRE manier om vragen te
 * overlopen (zie public/events-v2-client.js) -- dezelfde onderliggende
 * REGISTRATION_FIELDS.QUESTIONS blijft ook gewoon in de Excel/PDF-export
 * staan, dit is enkel een extra, overzichtelijke weergave.
 *
 * Geen "niet-vraag"-toggle: er is vandaag precies één vraagveld per
 * inschrijving, dus er is niets te markeren.
 *
 * @param {Object} env
 * @param {number} eventId
 * @returns {Promise<Array<{id:number, name:string|null, email:string|null, questions:string, created_at:string|null}>>}
 */
export async function listRegistrationsWithQuestions(env, eventId) {
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Ongeldig event-id', { status: 400 });
  }

  const rows = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain: [
      [REGISTRATION_FIELDS.EVENT, '=', id],
      [REGISTRATION_FIELDS.ACTIVE, '=', true],
      [REGISTRATION_FIELDS.QUESTIONS, '!=', false],
      [REGISTRATION_FIELDS.QUESTIONS, '!=', ''],
      // Handmatig gemarkeerd als "geen echte vraag" -- zie setQuestionIgnored.
      [REGISTRATION_FIELDS.QUESTION_IGNORED, '!=', true]
    ],
    fields: [...REGISTRATION_LIST_FIELDS],
    order: `${REGISTRATION_FIELDS.CREATE_DATE} desc`,
    limit: false
  });

  return (Array.isArray(rows) ? rows : [])
    .map(toRegistrationDto)
    .filter((dto) => typeof dto.questions === 'string' && dto.questions.trim() !== '')
    .map((dto) => ({
      id: dto.id,
      name: dto.name,
      email: dto.submitted_email || dto.partner?.name || null,
      questions: dto.questions,
      created_at: dto.created_at
    }));
}

/**
 * Markeert een ingevulde "vraag" als geen echte vraag (bv. een vrij veld dat
 * voor iets anders werd gebruikt) -- of haalt die markering weg. Filtert 'm
 * meteen uit listRegistrationsWithQuestions; de onderliggende tekst zelf
 * (REGISTRATION_FIELDS.QUESTIONS) blijft gewoon staan, ook in de Excel/PDF-
 * export -- dit is puur een weergavefilter voor het Vragen-overzicht.
 *
 * @param {Object} env
 * @param {number} registrationId
 * @param {boolean} ignored
 * @returns {Promise<Object|null>}
 */
export async function setQuestionIgnored(env, registrationId, ignored) {
  const id = Number(registrationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Ongeldig inschrijvings-id', { status: 400 });
  }
  if (typeof ignored !== 'boolean') {
    throw new ValidationError('ignored moet true of false zijn');
  }

  const values = { [REGISTRATION_FIELDS.QUESTION_IGNORED]: ignored };
  assertNoForbiddenFields(Object.keys(values), 'setQuestionIgnored');

  await write(env, { model: ODOO_MODELS.REGISTRATION, ids: [id], values });
  // Zichtbaar op de website: binnen de bestaande TTL, of meteen na een
  // expliciete "Publiceer naar website"-actie (publishToWebsite() in
  // events-service.js) -- niet automatisch bij elke schrijfactie hier.

  return getRegistration(env, id);
}

/** @returns {Promise<Object|null>} */
export async function getRegistration(env, registrationId) {
  const rows = await searchRead(env, {
    model: ODOO_MODELS.REGISTRATION,
    domain: [[REGISTRATION_FIELDS.ID, '=', Number(registrationId)]],
    fields: [...REGISTRATION_LIST_FIELDS],
    limit: 1
  });

  const record = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return record ? toRegistrationDto(record) : null;
}
