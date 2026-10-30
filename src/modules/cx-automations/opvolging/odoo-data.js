/**
 * Opvolging -- lezen uit Odoo. Alles in bulk (een paar vragen voor honderden
 * kansen), want het controlepaneel wordt voor alle open kansen tegelijk berekend.
 */

import { searchRead, executeKw } from '../../../lib/odoo.js';
import { odooOrigin } from '../../../lib/medewerkers.js';
import { BEL_CATEGORIE, uitkomstUitTekst, odooDatum } from './constants.js';

const LEAD_VELDEN = ['id', 'name', 'partner_id', 'contact_name', 'partner_name', 'phone', 'email_from',
  'stage_id', 'user_id', 'active', 'type'];

export function leadUrl(env, id) {
  return `${odooOrigin(env)}/web#id=${id}&model=crm.lead&view_type=form`;
}

/** Open kansen: verkoopkansen die niet gewonnen en niet verloren (gearchiveerd) zijn. */
export async function openKansen(env, { userIds = null, limit = 1000 } = {}) {
  const domain = [['type', '=', 'opportunity'], ['active', '=', true], ['stage_id.is_won', '=', false]];
  if (userIds) domain.push(['user_id', 'in', userIds]);
  return (await searchRead(env, { model: 'crm.lead', domain, fields: LEAD_VELDEN, limit, order: 'id desc' })) || [];
}

export async function leesLead(env, id) {
  const [lead] = (await searchRead(env, {
    model: 'crm.lead', domain: [['id', '=', id]], fields: LEAD_VELDEN, context: { active_test: false },
  })) || [];
  return lead || null;
}

let typeCache = null; // { t, map: Map(id -> category) }

async function belTypes(env) {
  if (typeCache && Date.now() - typeCache.t < 10 * 60 * 1000) return typeCache.map;
  const rijen = (await searchRead(env, { model: 'mail.activity.type', domain: [], fields: ['id', 'category'] })) || [];
  typeCache = { t: Date.now(), map: new Map(rijen.map(r => [r.id, r.category])) };
  return typeCache.map;
}

/**
 * Open activiteiten per kans: Map(leadId -> [{ id, type, typeNaam, bellen, deadline, userId, userNaam, samenvatting }]),
 * oudste deadline eerst.
 */
export async function activiteiten(env, leadIds) {
  const per = new Map();
  if (!leadIds.length) return per;
  const cat = await belTypes(env);
  for (let i = 0; i < leadIds.length; i += 400) {
    const rijen = (await searchRead(env, {
      model: 'mail.activity',
      domain: [['res_model', '=', 'crm.lead'], ['res_id', 'in', leadIds.slice(i, i + 400)]],
      fields: ['id', 'res_id', 'activity_type_id', 'date_deadline', 'user_id', 'summary'],
      order: 'date_deadline asc',
    })) || [];
    for (const r of rijen) {
      const typeId = Array.isArray(r.activity_type_id) ? r.activity_type_id[0] : null;
      if (!per.has(r.res_id)) per.set(r.res_id, []);
      per.get(r.res_id).push({
        id: r.id,
        type: typeId,
        typeNaam: Array.isArray(r.activity_type_id) ? r.activity_type_id[1] : '',
        bellen: cat.get(typeId) === BEL_CATEGORIE,
        deadline: r.date_deadline || null,
        userId: Array.isArray(r.user_id) ? r.user_id[0] : null,
        userNaam: Array.isArray(r.user_id) ? r.user_id[1] : '',
        samenvatting: r.summary || '',
      });
    }
  }
  return per;
}

/**
 * De open beltaken op kansen die aan deze Odoo-gebruiker toegewezen zijn,
 * oudste deadline eerst: [{ id, leadId, deadline, samenvatting }].
 */
export async function beltakenVoor(env, odooUid) {
  const cat = await belTypes(env);
  const belIds = [...cat.entries()].filter(([, c]) => c === BEL_CATEGORIE).map(([id]) => id);
  if (!belIds.length) return [];
  const rijen = (await searchRead(env, {
    model: 'mail.activity',
    domain: [['res_model', '=', 'crm.lead'], ['user_id', '=', odooUid], ['activity_type_id', 'in', belIds]],
    fields: ['id', 'res_id', 'date_deadline', 'summary'],
    order: 'date_deadline asc',
    limit: 500,
  })) || [];
  return rijen.map(r => ({ id: r.id, leadId: r.res_id, deadline: r.date_deadline || null, samenvatting: r.summary || '' }));
}

/**
 * De gesprekken in de chatter: notities met "Oproep: ..." (van de oude knoppen
 * en van de OM), nieuwste eerst. Map(leadId -> [{ uitkomst, datum: Date, door }]).
 */
export async function gesprekken(env, leadIds, { perLead = 5 } = {}) {
  const per = new Map();
  if (!leadIds.length) return per;
  for (let i = 0; i < leadIds.length; i += 400) {
    const rijen = (await searchRead(env, {
      model: 'mail.message',
      domain: [['model', '=', 'crm.lead'], ['res_id', 'in', leadIds.slice(i, i + 400)], ['body', 'ilike', 'Oproep:']],
      fields: ['res_id', 'date', 'body', 'author_id'],
      order: 'date desc',
      limit: 4000,
    })) || [];
    for (const r of rijen) {
      const uitkomst = uitkomstUitTekst(r.body);
      if (!uitkomst) continue;
      if (!per.has(r.res_id)) per.set(r.res_id, []);
      const lijst = per.get(r.res_id);
      if (lijst.length >= perLead) continue;
      lijst.push({ uitkomst, datum: odooDatum(r.date), door: Array.isArray(r.author_id) ? r.author_id[1] : '' });
    }
  }
  return per;
}

/** Bestaan deze velden op het model? (Studio-velden die nog aangemaakt moeten worden.) */
export async function heeftVelden(env, model, namen) {
  try {
    const f = await executeKw(env, { model, method: 'fields_get', args: [namen], kwargs: { attributes: ['type'] } });
    return namen.every(n => f && f[n]);
  } catch (_) {
    return false;
  }
}
