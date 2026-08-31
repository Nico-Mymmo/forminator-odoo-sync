/**
 * Event Operations v2 — Contactpersonen
 *
 * De deelnemer van een inschrijving is x_studio_registered_by, een
 * many2one naar res.partner. Het e-mailadres is de identiteit: bestaat er
 * geen partner met dat adres, dan wordt die aangemaakt.
 *
 * Contactgegevens (telefoon, bedrijf) staan op de partner, NIET op de
 * registratie. Odoo blijft functioneel leidend voor CRM-gegevens.
 */

import { searchRead, create, write, messagePost } from '../../../lib/odoo.js';
import { ODOO_MODELS } from '../odoo-contract.js';
import { normalizeEmail } from './validation.js';
import { LOG_PREFIX } from '../constants.js';

const PARTNER_FIELDS = ['id', 'name', 'email', 'phone', 'mobile', 'function', 'parent_id', 'create_date'];

/**
 * Zoek of maak een partner op e-mailadres.
 *
 * Regels:
 *  - zoeken gebeurt case-insensitive op het genormaliseerde adres
 *  - bij een bestaande partner worden alleen LEGE velden aangevuld; een
 *    bestaande waarde wordt nooit overschreven, want de CRM-gegevens in
 *    Odoo zijn leidend over wat iemand in een formulier typt
 *  - bij meerdere treffers wordt de oudste gebruikt en een chatterbericht
 *    op die partner geplaatst; een duplicaat in Odoo mag nooit een
 *    inschrijving blokkeren
 *
 * @param {Object} env
 * @param {string} email
 * @param {Object} [profile]
 * @param {string} [profile.name]
 * @param {string} [profile.phone]
 * @param {string} [profile.company]
 * @returns {Promise<{ partnerId: number, created: boolean, enriched: string[], duplicates: number }>}
 */
export async function resolvePartnerByEmail(env, email, profile = {}) {
  const normalized = normalizeEmail(email);

  const matches = await searchRead(env, {
    model: ODOO_MODELS.PARTNER,
    domain: [['email', '=ilike', normalized]],
    fields: PARTNER_FIELDS,
    order: 'create_date asc, id asc',
    limit: 5,
    context: { active_test: false }
  });

  const rows = Array.isArray(matches) ? matches : [];

  if (rows.length === 0) {
    const values = {
      name: (profile.name || '').trim() || normalized,
      email: normalized
    };
    if (profile.phone) values.phone = String(profile.phone).trim();
    if (profile.company) values.function = String(profile.company).trim();

    const partnerId = await create(env, { model: ODOO_MODELS.PARTNER, values });
    console.log(`${LOG_PREFIX} partner aangemaakt ${partnerId} voor ${normalized}`);

    return { partnerId: Number(partnerId), created: true, enriched: [], duplicates: 0 };
  }

  const partner = rows[0];
  const partnerId = Number(partner.id);
  const duplicates = rows.length - 1;

  if (duplicates > 0) {
    const others = rows.slice(1).map((r) => r.id).join(', ');
    console.warn(`${LOG_PREFIX} meerdere partners op ${normalized}: gebruikt ${partnerId}, ook ${others}`);
    try {
      await messagePost(env, {
        model: ODOO_MODELS.PARTNER,
        id: partnerId,
        body:
          `Event Operations gebruikte dit contact voor een inschrijving op ${normalized}. ` +
          `Er bestaan meerdere contacten met dit e-mailadres (ook: ${others}). ` +
          'Overweeg samenvoegen.'
      });
    } catch (error) {
      // Nooit fataal: het gaat om een notitie, niet om de inschrijving.
      console.warn(`${LOG_PREFIX} duplicaatnotitie mislukt voor partner ${partnerId}:`, error?.message);
    }
  }

  // Alleen aanvullen, nooit overschrijven.
  const fill = {};
  if (!partner.name || partner.name === normalized) {
    const name = (profile.name || '').trim();
    if (name) fill.name = name;
  }
  if (!partner.phone && !partner.mobile && profile.phone) {
    fill.phone = String(profile.phone).trim();
  }
  if (!partner.function && profile.company) {
    fill.function = String(profile.company).trim();
  }

  const enriched = Object.keys(fill);
  if (enriched.length > 0) {
    try {
      await write(env, { model: ODOO_MODELS.PARTNER, ids: [partnerId], values: fill });
    } catch (error) {
      console.warn(`${LOG_PREFIX} partner ${partnerId} aanvullen mislukt:`, error?.message);
    }
  }

  return { partnerId, created: false, enriched, duplicates };
}
