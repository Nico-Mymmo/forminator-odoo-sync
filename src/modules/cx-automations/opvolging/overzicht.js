/**
 * Opvolging -- het overzicht voor CX Powerboard (tabblad "Opvolging").
 *
 * Alle open beltaken op kansen, van het hele team, met wat er niet klopt
 * (taak op een verloren of gewonnen kans, bij een andere persoon dan de
 * verkoper, twee beltaken op dezelfde kans), plus de open kansen waarop
 * helemaal geen volgende stap staat. Enkel lezen.
 */

import { searchRead } from '../../../lib/odoo.js';
import { openKansen, activiteiten, gesprekken, meetings, leadUrl } from './odoo-data.js';
import { BEL_CATEGORIE, UITKOMSTEN, vandaag, dagenTussen } from './constants.js';

const naam = (m2o) => (Array.isArray(m2o) ? m2o[1] : '') || '';
const id = (m2o) => (Array.isArray(m2o) ? m2o[0] : null);

const SIGNAAL = {
  verloren: 'Kans is verloren of gearchiveerd',
  gewonnen: 'Kans is al gewonnen',
  lead: 'Nog een lead, geen kans',
  andere: 'Taak staat bij iemand anders dan de verkoper',
  geen_verkoper: 'Kans heeft geen verkoper',
  dubbel: 'Meer dan een beltaak op deze kans',
};

function gesprekDto(g) {
  if (!g) return null;
  return { uitkomst: g.uitkomst, label: UITKOMSTEN[g.uitkomst].label,
    datum: g.datum ? g.datum.toISOString() : null, door: g.door };
}

function kansDto(env, l) {
  return {
    id: l.id, naam: l.name || '', url: leadUrl(env, l.id),
    contact: naam(l.partner_id) || l.contact_name || l.partner_name || '',
    telefoon: l.phone || '', fase: naam(l.stage_id), verkoper: naam(l.user_id),
  };
}

export async function opvolgingOverzicht(env) {
  const nu = vandaag();
  const types = (await searchRead(env, { model: 'mail.activity.type', domain: [['category', '=', BEL_CATEGORIE]], fields: ['id'] })) || [];
  const belIds = types.map(t => t.id);

  const [taken, open] = await Promise.all([
    belIds.length ? searchRead(env, {
      model: 'mail.activity',
      domain: [['res_model', '=', 'crm.lead'], ['activity_type_id', 'in', belIds]],
      fields: ['id', 'res_id', 'activity_type_id', 'date_deadline', 'user_id', 'summary'],
      order: 'date_deadline asc', limit: 2000,
    }) : [],
    openKansen(env, { limit: 2000 }),
  ]);

  const leadIds = [...new Set((taken || []).map(t => t.res_id))];
  const [leads, gespr, acts, meet] = await Promise.all([
    leadIds.length ? searchRead(env, {
      model: 'crm.lead', domain: [['id', 'in', leadIds]], context: { active_test: false },
      fields: ['id', 'name', 'partner_id', 'contact_name', 'partner_name', 'phone', 'stage_id', 'user_id', 'active', 'type', 'probability'],
    }) : [],
    gesprekken(env, [...new Set([...leadIds, ...open.map(k => k.id)])], { perLead: 1 }),
    activiteiten(env, open.map(k => k.id)),
    meetings(env, open),
  ]);
  const perLead = new Map((leads || []).map(l => [l.id, l]));
  const perKansAantal = new Map();
  for (const t of taken || []) perKansAantal.set(t.res_id, (perKansAantal.get(t.res_id) || 0) + 1);

  const wonStages = new Set(((await searchRead(env, { model: 'crm.stage', domain: [['is_won', '=', true]], fields: ['id'] })) || []).map(s => s.id));

  const rijen = [];
  for (const t of taken || []) {
    const l = perLead.get(t.res_id);
    if (!l) continue;
    const signalen = [];
    if (!l.active) signalen.push('verloren');
    else if (wonStages.has(id(l.stage_id))) signalen.push('gewonnen');
    if (l.type === 'lead') signalen.push('lead');
    if (!l.user_id) signalen.push('geen_verkoper');
    else if (id(t.user_id) !== id(l.user_id)) signalen.push('andere');
    if (perKansAantal.get(t.res_id) > 1) signalen.push('dubbel');
    rijen.push({
      taak_id: t.id,
      kans: kansDto(env, l),
      toegewezen_aan: naam(t.user_id),
      toegewezen_id: id(t.user_id),
      type: naam(t.activity_type_id),
      samenvatting: t.summary || '',
      deadline: t.date_deadline || null,
      dagen_te_laat: t.date_deadline ? dagenTussen(t.date_deadline, nu) : 0,
      laatste_gesprek: gesprekDto((gespr.get(t.res_id) || [])[0]),
      signalen: signalen.map(s => ({ code: s, tekst: SIGNAAL[s] })),
    });
  }

  // Open kansen zonder enige taak en zonder komende afspraak.
  const nuMs = Date.now();
  const zonderStap = open
    .filter(k => !(acts.get(k.id) || []).length && !(meet.get(k.id) || []).some(m => m.start && m.start.getTime() > nuMs))
    .map(k => ({ kans: kansDto(env, k), laatste_gesprek: gesprekDto((gespr.get(k.id) || [])[0]) }));

  return { vandaag: nu, taken: rijen, zonder_stap: zonderStap, signalen: SIGNAAL };
}
