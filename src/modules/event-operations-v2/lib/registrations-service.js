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
  assertNoForbiddenFields
} from '../odoo-contract.js';
import {
  LOG_PREFIX,
  REGISTRATION_STATE,
  REGISTRATION_SOURCE,
  CACHE_PREFIX
} from '../constants.js';
import { ValidationError, normalizeEmail, normalizePagination } from './validation.js';
import { resolvePartnerByEmail } from './partners.js';
import { getEvent } from './events-service.js';
import { invalidateEvents } from './cache.js';
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
 * @returns {Promise<{ id: number, state: string, waitlisted: boolean, partnerId: number, contactCreated: boolean }>}
 */
export async function createRegistration(env, options) {
  const { event, input, source = REGISTRATION_SOURCE.PUBLIC_FORM, actor = null } = options;

  const eventId = Number(event.id);
  const email = normalizeEmail(input?.email);

  const lock = await acquireLock(env, eventId, email);
  if (!lock.acquired) {
    throw new ValidationError('Je inschrijving wordt al verwerkt. Even geduld.', { status: 409 });
  }

  try {
    // De contactpersoon eerst: het e-mailadres is de identiteit, en we
    // hebben zijn id nodig om op dubbels te controleren.
    const partner = await resolvePartnerByEmail(env, email, {
      name: buildDisplayName(input, email),
      phone: input?.phone,
      company: input?.company
    });

    const existing = await findExistingRegistration(env, eventId, partner.partnerId);
    if (existing) {
      throw new ValidationError('Je bent al ingeschreven voor dit event.', {
        status: 409,
        details: { registration_id: existing }
      });
    }

    const capacity = event.registration?.capacity ?? null;
    if (capacity !== null) {
      const taken = await countRegistrations(env, eventId);
      if (taken >= capacity) {
        throw new ValidationError('Dit event is volzet.', { status: 409 });
      }
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

    const questions = String(input?.questions || '').trim();
    if (questions !== '') {
      values[REGISTRATION_FIELDS.QUESTIONS] = questions;
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
    await logRegistrationContext(env, registrationId, { input, source, partner, actor, waitlisted });

    await invalidateEvents(env);

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
      body: lines.join('<br/>')
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
