/**
 * Event Operations v2 — Slugs
 *
 * De slug staat in x_studio_slug en is de publieke URL. Op alle bestaande
 * records is dat veld leeg; die worden bij de cutover eenmalig gevuld.
 */

import { searchRead } from '../../../lib/odoo.js';
import { ODOO_MODELS, EVENT_FIELDS } from '../odoo-contract.js';

const MAX_SLUG_LENGTH = 80;

/**
 * Titel → slug. Diakritieken weg, alles wat geen letter of cijfer is een
 * streepje, geen streepjes aan de randen.
 *
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Unieke slug voor een event, gecontroleerd tegen Odoo.
 *
 * Er is geen unique-constraint op x_studio_slug, dus dit is de enige
 * bescherming tegen twee events op dezelfde URL. Bij gelijktijdig
 * aanmaken kan er alsnog een botsing ontstaan; die wordt bij het
 * publiceren opgemerkt door de validatie.
 *
 * @param {Object} env
 * @param {string} desired
 * @param {number|null} [excludeId] - eigen id bij een wijziging
 * @returns {Promise<string>}
 */
export async function ensureUniqueSlug(env, desired, excludeId = null) {
  const base = slugify(desired) || 'event';

  const domain = [[EVENT_FIELDS.SLUG, 'like', `${base}%`]];
  if (excludeId) {
    domain.push([EVENT_FIELDS.ID, '!=', excludeId]);
  }

  const existing = await searchRead(env, {
    model: ODOO_MODELS.EVENT,
    domain,
    fields: [EVENT_FIELDS.SLUG],
    context: { active_test: false }
  });

  const taken = new Set(
    (existing || [])
      .map((row) => row[EVENT_FIELDS.SLUG])
      .filter((s) => typeof s === 'string' && s !== '')
  );

  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${base}-${Date.now()}`;
}
