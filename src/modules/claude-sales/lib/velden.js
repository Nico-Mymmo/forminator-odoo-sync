/**
 * Welke velden de connector mag lezen en invullen, en hoe een waarde van
 * Claude een geldige Odoo-waarde wordt.
 *
 * De OM beslist wat er geschreven mag worden, niet Claude. Een veld dat hier
 * niet staat, weigert de connector. Wat Odoo niet (meer) kent of wat alleen
 * gelezen kan worden (een berekend veld), valt vanzelf weg: de lijst wordt
 * getoetst aan fields_get. Een veld erbij = een regel in BEWERKBAAR.
 *
 * De interne notitie van een lead (`description`) staat hier bewust NIET in:
 * die gaat enkel via `interne_notitie` in dossier_bijwerken, dat de vorige
 * versie eerst in de chatter bewaart.
 */

import { executeKw } from '../../../lib/odoo.js';
import { htmlNaarTekst, tekstNaarHtml } from './tekst.js';

/** Soort record in een dossier -> Odoo-model. */
export const MODELLEN = {
  gebouw: 'res.partner',
  contact: 'res.partner',
  lead: 'crm.lead',
  actieblad: 'x_sales_action_sheet',
};

export const BEWERKBAAR = {
  gebouw: [
    'name', 'street', 'street2', 'zip', 'city', 'phone', 'email', 'website',
    'x_studio_company_type', 'x_studio_registration_number',
    'x_studio_number_of_plots', 'x_studio_number_of_apartments', 'x_studio_number_of_co_owners',
    'x_studio_andere_kavels', 'x_studio_has_commercial_plots', 'x_studio_hoa_established',
    'x_studio_current_syndic', 'x_studio_current_syndic_type',
    'x_studio_average_tenant_age', 'x_studio_age_group',
  ],
  contact: [
    'name', 'x_studio_first_name', 'email', 'phone', 'mobile', 'function', 'lang',
    'x_studio_contact_type', 'x_studio_job_description',
    'x_studio_digital_skill_level', 'x_studio_communication_skill_level', 'x_studio_legal_skill_level',
    'x_studio_age_group',
  ],
  lead: [
    'name', 'contact_name', 'partner_name', 'email_from', 'phone', 'x_studio_mobile', 'function',
    'expected_revenue', 'date_deadline', 'priority',
    // Naam, straat, postcode, plaats en KBO van de VME op de lead zijn doorgeefvelden naar het
    // gebouw (partner_id.parent_id): die vul je op het gebouw in, niet hier.
    'x_vme_huisnummer', 'x_vme_land',
    'x_studio_search_syndic_amount_plots', 'x_studio_search_syndic_current_admin', 'x_studio_oprichting_vme',
    'x_studio_search_syndic_need_communication', 'x_studio_search_syndic_need_finance',
    'x_studio_search_syndic_need_legal', 'x_studio_search_syndic_need_management',
    'x_studio_search_syndic_need_premiums', 'x_syndicoach_pack',
  ],
  actieblad: [
    'x_studio_contact_id', 'x_studio_contact_email', 'x_studio_contact_phone_number',
    'x_studio_number_of_plots', 'x_studio_number_of_apartments', 'x_studio_number_of_co_owners',
    'x_studio_has_commercial_plots', 'x_studio_hoa_established',
    'x_studio_current_syndic', 'x_studio_current_syndic_type', 'x_studio_current_way_of_working',
    'x_studio_first_meeting_type', 'x_studio_communication_methods', 'x_studio_as_expectations',
    'x_studio_has_registration_number', 'x_studio_has_operating_account', 'x_studio_has_reserve_account',
    'x_studio_has_insurance', 'x_studio_has_allocation_keys', 'x_studio_has_advance_payments',
    'x_studio_has_annual_statement', 'x_studio_has_doubly_entry_accounting',
    'x_studio_digital_skill_level', 'x_studio_communication_skill_level', 'x_studio_legal_skill_level',
    'x_studio_interpersonal_relationship', 'x_studio_average_tenant_age', 'x_studio_age_group',
    'x_studio_job_description',
    'x_studio_open_question_reason_for_contact', 'x_studio_open_question_current_situation',
    'x_studio_open_question_expected_solution', 'x_studio_open_question_running_costs',
    'x_studio_open_question_self_management', 'x_studio_open_question_technical_management',
    'x_last_response_date', 'x_syndicoach_pack', 'x_openvme_package', 'x_openvme_package_qty',
    'x_studio_tag_ids',
  ],
};

/**
 * Relaties waarvan de mogelijke waarden in het dossier meekomen (kleine
 * keuzelijsten uit Studio). Andere relaties (een syndicus, een contact) geef
 * je op met id of naam.
 */
const KEUZELIJSTEN = new Set([
  'x_company_type', 'x_contact_type', 'x_partnerjobcategory', 'x_current_wayofworking',
  'x_communication_method', 'x_as_expectations', 'x_sales_meeting_type', 'x_sales_action_sheet_tag',
]);

const BEWAAR_MS = 10 * 60 * 1000;
const fieldsCache = new Map(); // model -> { t, velden }
const optiesCache = new Map(); // relatie -> { t, opties }

/** fields_get van een model (10 minuten bewaard). */
export async function veldenVan(env, model) {
  const hit = fieldsCache.get(model);
  if (hit && Date.now() - hit.t < BEWAAR_MS) return hit.velden;
  const velden = await executeKw(env, {
    model, method: 'fields_get', args: [],
    kwargs: { attributes: ['string', 'type', 'selection', 'relation', 'readonly', 'related'], context: { lang: 'nl_BE' } },
  });
  fieldsCache.set(model, { t: Date.now(), velden });
  return velden;
}

/** Enkel de velden die het model echt heeft. */
export async function bestaande(env, model, namen) {
  const v = await veldenVan(env, model);
  return namen.filter((n) => v[n]);
}

async function optiesVan(env, relatie) {
  const hit = optiesCache.get(relatie);
  if (hit && Date.now() - hit.t < BEWAAR_MS) return hit.opties;
  let opties = [];
  try {
    const rijen = await executeKw(env, {
      model: relatie, method: 'search_read', args: [[]],
      kwargs: { fields: ['display_name'], limit: 100, order: 'id', context: { lang: 'nl_BE' } },
    });
    opties = rijen.map((r) => ({ id: r.id, naam: r.display_name }));
  } catch { /* geen keuzelijst: dan maar zonder */ }
  optiesCache.set(relatie, { t: Date.now(), opties });
  return opties;
}

/**
 * De bewerkbare velden van een soort record, met type, label en keuzes.
 * @returns {Promise<Array<{naam, label, type, relatie?, keuzes?}>>}
 */
export async function catalogus(env, soort) {
  const velden = await veldenVan(env, MODELLEN[soort]);
  const lijst = [];
  for (const naam of BEWERKBAAR[soort]) {
    const f = velden[naam];
    if (!f || f.readonly) continue;
    const item = { naam, label: f.string, type: f.type };
    // Veel vragen op het actieblad zijn in Odoo een DOORGEEFVELD naar het gebouw of het
    // contact (related, bv. x_studio_for_company_id.x_studio_number_of_plots). Odoo bewaart ze
    // daar; zonder gebouw of contact gaat de waarde stil verloren. bijwerken.js weigert dan.
    if (typeof f.related === 'string') {
      if (f.related.startsWith('x_studio_for_company_id.')) item.via = 'gebouw';
      else if (f.related.startsWith('x_studio_contact_id.')) item.via = 'contact';
    }
    if (f.type === 'selection' && Array.isArray(f.selection)) item.keuzes = f.selection.map(([k, l]) => ({ waarde: k, label: l }));
    if ((f.type === 'many2one' || f.type === 'many2many') && f.relation) {
      item.relatie = f.relation;
      if (KEUZELIJSTEN.has(f.relation)) item.keuzes = (await optiesVan(env, f.relation)).map((o) => ({ waarde: o.id, label: o.naam }));
    }
    lijst.push(item);
  }
  return lijst;
}

/** Een waarde uit Odoo leesbaar maken (voor het dossier). */
export function toonWaarde(item, waarde) {
  if (item.type === 'boolean') return waarde ? 'ja' : 'nee';
  if (waarde === false || waarde === null || waarde === undefined || waarde === '') return null;
  switch (item.type) {
    case 'selection': {
      const k = (item.keuzes || []).find((x) => x.waarde === waarde);
      return k ? k.label : String(waarde);
    }
    case 'many2one': return Array.isArray(waarde) ? `${waarde[1]} [id ${waarde[0]}]` : String(waarde);
    case 'many2many': case 'one2many': {
      if (!Array.isArray(waarde) || !waarde.length) return null;
      return waarde.map((id) => {
        const k = (item.keuzes || []).find((x) => x.waarde === id);
        return k ? k.label : `id ${id}`;
      }).join(', ');
    }
    case 'html': return htmlNaarTekst(waarde, 1500) || null;
    case 'integer': case 'float': case 'monetary': return waarde === 0 ? null : String(waarde);
    default: return String(waarde);
  }
}

/** Is dit veld nog niet ingevuld? Een vinkje telt nooit als "onbekend". */
export function isLeeg(item, waarde) {
  if (item.type === 'boolean') return false;
  return toonWaarde(item, waarde) === null;
}

const JA = ['ja', 'yes', 'true', 'waar', '1', 'oui'];
const NEE = ['nee', 'no', 'false', 'onwaar', '0', 'non'];

/**
 * Een waarde van Claude omzetten naar wat Odoo verwacht.
 * `zoekPartner(naam)` lost een naam van een syndicus/contact op (of gooit).
 * @returns {Promise<any>} de Odoo-waarde
 */
export async function naarOdoo(item, waarde, { zoekPartner, dossierContacten } = {}) {
  const leeg = waarde === null || waarde === undefined || waarde === '' || (Array.isArray(waarde) && !waarde.length);
  if (leeg) return item.type === 'many2many' ? [[6, 0, []]] : false;

  switch (item.type) {
    case 'char': case 'text': {
      const s = String(waarde).trim();
      if (s.length > 5000) throw new Error('te lang (max 5000 tekens)');
      return s;
    }
    case 'html': return tekstNaarHtml(String(waarde));
    case 'integer': {
      const n = Number.parseInt(String(waarde).replace(/[^\d-]/g, ''), 10);
      if (!Number.isFinite(n)) throw new Error('geen geheel getal');
      return n;
    }
    case 'float': case 'monetary': {
      const n = Number(String(waarde).replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(n)) throw new Error('geen getal');
      return n;
    }
    case 'boolean': {
      if (typeof waarde === 'boolean') return waarde;
      const s = String(waarde).trim().toLowerCase();
      if (JA.includes(s)) return true;
      if (NEE.includes(s)) return false;
      throw new Error('verwacht ja of nee');
    }
    case 'date': {
      const s = String(waarde).trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/) || s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (!m) throw new Error('verwacht een datum als JJJJ-MM-DD');
      const [j, mnd, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
      return `${j}-${String(mnd).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    case 'selection': {
      const keuzes = item.keuzes || [];
      const s = String(waarde).trim().toLowerCase();
      const k = keuzes.find((x) => String(x.waarde).toLowerCase() === s) || keuzes.find((x) => String(x.label).toLowerCase() === s);
      if (!k) throw new Error(`kies uit: ${keuzes.map((x) => `${x.waarde} (${x.label})`).join(', ')}`);
      return k.waarde;
    }
    case 'many2one': return relatieId(item, waarde, { zoekPartner, dossierContacten });
    case 'many2many': {
      const lijst = Array.isArray(waarde) ? waarde : [waarde];
      const ids = [];
      for (const w of lijst) ids.push(await relatieId(item, w, { zoekPartner, dossierContacten }));
      return [[6, 0, [...new Set(ids)]]];
    }
    default:
      throw new Error(`veldtype ${item.type} kan de connector niet invullen`);
  }
}

async function relatieId(item, waarde, { zoekPartner, dossierContacten }) {
  const keuzes = item.keuzes;
  const id = Number(waarde);
  if (keuzes) {
    const k = Number.isInteger(id) && id > 0
      ? keuzes.find((x) => x.waarde === id)
      : keuzes.find((x) => String(x.label).toLowerCase() === String(waarde).trim().toLowerCase());
    if (!k) throw new Error(`kies uit: ${keuzes.map((x) => `${x.waarde} (${x.label})`).join(', ')}`);
    return k.waarde;
  }
  if (item.naam === 'x_studio_contact_id') {
    // Enkel een contactpersoon van DIT gebouw.
    const c = (dossierContacten || []).find((x) => x.id === id
      || String(x.name).toLowerCase() === String(waarde).trim().toLowerCase());
    if (!c) throw new Error('geef het id van een contactpersoon van dit gebouw');
    return c.id;
  }
  if (Number.isInteger(id) && id > 0) return id;
  if (item.relatie === 'res.partner' && zoekPartner) return zoekPartner(String(waarde));
  throw new Error('geef het id van het record');
}
