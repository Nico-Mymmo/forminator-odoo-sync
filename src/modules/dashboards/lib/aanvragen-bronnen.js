/**
 * Dashboards — waaruit het tabblad Aanvragen mag lezen.
 *
 * VANGRAIL. Het tabblad Aanvragen (src/modules/dashboards/lib/aanvragen/ en
 * public/dashboard-aanvragen/) is het terrein van David: daar voegt hij zelf
 * samen, zonder review van Nico (.github/CODEOWNERS). Die code mag daarom NIETS
 * schrijven, en enkel lezen langs dit bestand en lib/lead-kanalen.js. De controle
 * (scripts/vangrails/aanvragen.mjs) weigert elke andere import.
 *
 * Bewust smal:
 *  - Odoo: enkel read_group, search_read en search_count, enkel op de modellen
 *    in MODELLEN, en search_read altijd met een veldenlijst en een plafond.
 *    Geen write/create/unlink, geen andere methode.
 *  - Targets: enkel lezen, uit dezelfde tabel als het tabblad Targets.
 *
 * Heeft het tabblad iets anders nodig (een model dat hier niet staat, een tabel in
 * Supabase, de website-tracker in D1), dan komt het HIER bij, in een aparte pull
 * request die op Nico wacht. Zo kan een wijziging aan het dashboard nooit iets in
 * Odoo of in een database veranderen.
 *
 * @module modules/dashboards/lib/aanvragen-bronnen
 */
import { executeKw } from '../../../lib/odoo.js';
import { getTargetsForMonths as targetRijen } from './targets.js';

export { buildTargetTrend } from './targets.js';

/**
 * De aanvraagtargets per maand (Map maand -> waarde), uit dezelfde tabel als het
 * tabblad Targets. Zonder Supabase-gegevens -- de lokale proef van David
 * (scripts/dashboards/aanvragen-proef.mjs), die enkel een eigen Odoo-sleutel heeft --
 * een lege lijst: dan zegt het tabblad "geen target" in plaats van niets te tonen.
 */
export async function getTargetsForMonths(env, opties) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return new Map();
  return targetRijen(env, opties);
}

/** De Odoo-modellen die het tabblad mag lezen. */
export const MODELLEN = [
  'crm.lead',
  'crm.stage',
  'crm.lost.reason',
  'crm.team',
  'res.users',
  'res.partner',
  'utm.source',
  'utm.medium',
  'utm.campaign'
];

/** Meer records per search_read laadt de Worker niet: groepeer dan met leesGroepen(). */
export const MAX_RECORDS = 5000;

function model(naam) {
  if (!MODELLEN.includes(naam)) {
    throw new Error(`Het tabblad Aanvragen mag ${naam} niet lezen. Een model erbij = een regel in MODELLEN (lib/aanvragen-bronnen.js), met een review van Nico.`);
  }
  return naam;
}

// Verloren en gearchiveerde leads tellen wel mee als instroom (de aanvraag is
// binnengekomen): vraag ze dan expliciet mee met ookGearchiveerd.
function context(ookGearchiveerd) {
  return ookGearchiveerd ? { active_test: false } : {};
}

/**
 * Odoo read_group, zonder lazy (alle groupBy-velden in één keer).
 *
 * @param {Object} env
 * @param {string} naam - een model uit MODELLEN
 * @param {{domain?: Array, fields?: string[], groupBy?: string[], orderby?: string, limit?: number, ookGearchiveerd?: boolean}} [opties]
 * @returns {Promise<Array<Object>>} rijen met __count en, per datumgroep, __range
 */
export async function leesGroepen(env, naam, { domain = [], fields = ['id'], groupBy = [], orderby, limit, ookGearchiveerd = false } = {}) {
  const kwargs = { context: context(ookGearchiveerd), lazy: false };
  if (orderby) kwargs.orderby = orderby;
  if (limit) kwargs.limit = limit;
  return executeKw(env, { model: model(naam), method: 'read_group', args: [domain, fields, groupBy], kwargs });
}

/**
 * Odoo search_read. Altijd met een veldenlijst: zonder komen ALLE velden mee, ook
 * zware HTML-velden, voor elk record.
 *
 * @param {Object} env
 * @param {string} naam - een model uit MODELLEN
 * @param {{domain?: Array, fields: string[], order?: string, limit?: number, ookGearchiveerd?: boolean}} opties
 * @returns {Promise<Array<Object>>}
 */
export async function leesRecords(env, naam, { domain = [], fields, order, limit = MAX_RECORDS, ookGearchiveerd = false } = {}) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('leesRecords() vraagt een veldenlijst (fields): zonder komen alle velden van elk record mee.');
  }
  const kwargs = { fields, limit: Math.min(Number(limit) || MAX_RECORDS, MAX_RECORDS), context: context(ookGearchiveerd) };
  if (order) kwargs.order = order;
  return executeKw(env, { model: model(naam), method: 'search_read', args: [domain], kwargs });
}

/**
 * Odoo search_count.
 *
 * @param {Object} env
 * @param {string} naam - een model uit MODELLEN
 * @param {Array} [domain]
 * @param {{ookGearchiveerd?: boolean}} [opties]
 * @returns {Promise<number>}
 */
export async function tel(env, naam, domain = [], { ookGearchiveerd = false } = {}) {
  return executeKw(env, { model: model(naam), method: 'search_count', args: [domain], kwargs: { context: context(ookGearchiveerd) } });
}
