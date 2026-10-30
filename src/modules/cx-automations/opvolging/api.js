/**
 * Opvolging -- de handlers achter de groep "Bellen (uit Odoo)" in Mijn taken
 * (Projecten) en het venster "Gesprek afronden". De routes staan in
 * src/modules/projecten/routes.js, want daar leeft de takenlijst; het werk
 * zelf gebeurt hier, bij CX Automations.
 *
 * De beltaken blijven activiteiten in Odoo: de OM toont ze en rondt ze af.
 */

import { leesLead, activiteiten, gesprekken, beltakenVoor, leadUrl } from './odoo-data.js';
import { rondGesprekAf, odooVan } from './gesprek.js';
import { OpvolgingError, UITKOMSTEN, vandaag, dagenTussen, plusWerkdagen } from './constants.js';
import { searchRead } from '../../../lib/odoo.js';

export { OpvolgingError };

const naam = (m2o) => (Array.isArray(m2o) ? m2o[1] : '') || '';

function gesprekDto(g) {
  return g ? { uitkomst: g.uitkomst, label: UITKOMSTEN[g.uitkomst].label, soort: UITKOMSTEN[g.uitkomst].soort,
    datum: g.datum ? g.datum.toISOString() : null, door: g.door } : null;
}

function kansBasis(env, lead) {
  return {
    id: lead.id,
    naam: lead.name,
    contact: naam(lead.partner_id) || lead.contact_name || lead.partner_name || '',
    telefoon: lead.phone || '',
    fase: naam(lead.stage_id),
    verkoper: naam(lead.user_id),
    heeft_verkoper: !!lead.user_id,
    url: leadUrl(env, lead.id),
  };
}

/**
 * Mijn beltaken uit Odoo, tot en met vandaag (later gepland: enkel het aantal).
 * Geeft { odoo: false } als de gebruiker geen Odoo-gebruiker heeft.
 */
export async function mijnBeltaken(env, user) {
  const odoo = await odooVan(env, user);
  const nu = vandaag();
  const basis = { vandaag: nu, standaard_volgende: plusWerkdagen(nu, 2) };
  if (!odoo) return { ...basis, odoo: false, taken: [], later: 0 };
  const alle = await beltakenVoor(env, odoo.uid);
  const nuTeDoen = alle.filter(t => !t.deadline || t.deadline <= nu);
  const leadIds = [...new Set(nuTeDoen.map(t => t.leadId))];
  const [leads, gespr] = await Promise.all([
    leadIds.length ? searchRead(env, { model: 'crm.lead', domain: [['id', 'in', leadIds]],
      fields: ['id', 'name', 'partner_id', 'contact_name', 'partner_name', 'phone', 'stage_id', 'user_id'] }) : [],
    gesprekken(env, leadIds, { perLead: 1 }),
  ]);
  const perId = new Map((leads || []).map(l => [l.id, l]));
  const gezien = new Set();
  const taken = [];
  for (const t of nuTeDoen) {
    const lead = perId.get(t.leadId);
    if (!lead || gezien.has(t.leadId)) continue; // een kans een keer, ook met twee beltaken
    gezien.add(t.leadId);
    taken.push({
      ...kansBasis(env, lead),
      deadline: t.deadline,
      dagen_te_laat: t.deadline ? dagenTussen(t.deadline, nu) : 0,
      samenvatting: t.samenvatting,
      laatste_gesprek: gesprekDto((gespr.get(t.leadId) || [])[0]),
    });
  }
  return { ...basis, odoo: true, taken, later: alle.length - nuTeDoen.length };
}

/** Een kans voor het venster "Gesprek afronden". */
export async function kansVoorGesprek(env, id) {
  const lead = await leesLead(env, id);
  if (!lead) throw new OpvolgingError('Deze kans bestaat niet (meer).', 404);
  const [acts, gespr] = await Promise.all([activiteiten(env, [id]), gesprekken(env, [id], { perLead: 5 })]);
  const a = acts.get(id) || [];
  const nu = vandaag();
  return {
    ...kansBasis(env, lead),
    open: lead.active && lead.type === 'opportunity',
    beltaken: a.filter(x => x.bellen).length,
    gesprekken: (gespr.get(id) || []).map(gesprekDto),
    vandaag: nu,
    standaard_volgende: plusWerkdagen(nu, 2),
  };
}

export { rondGesprekAf };
