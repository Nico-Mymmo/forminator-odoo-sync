/**
 * Een gebouw vinden op wat een salesmedewerker toevallig weet: de naam, een
 * stuk adres, het ondernemingsnummer, de naam of het mailadres van een
 * contactpersoon, een telefoonnummer, de naam van de lead of het actieblad.
 *
 * Alles in EEN ronde naar Odoo (vier zoekopdrachten tegelijk), daarna nog een
 * ronde om de gevonden gebouwen samen te vatten. Samen een kwart seconde.
 */

import { executeKw } from '../../../lib/odoo.js';

const m2oId = (v) => (Array.isArray(v) ? v[0] : (Number.isInteger(v) ? v : null));
const m2oNaam = (v) => (Array.isArray(v) ? v[1] : null);

function sr(env, model, domain, fields, extra = {}) {
  return executeKw(env, { model, method: 'search_read', args: [domain], kwargs: { fields, ...extra } })
    .catch((err) => { console.error('[claude-sales] zoeken', model, err?.message); return []; });
}

/** Een OR over velden: ['|','|',[a,'ilike',q],[b,'ilike',q],[c,'ilike',q]] */
function ofIlike(velden, q) {
  const delen = velden.map((v) => [v, 'ilike', q]);
  return [...Array(Math.max(0, delen.length - 1)).fill('|'), ...delen];
}

/**
 * @returns {Promise<Array<{gebouw_id, lead_id, naam, adres, type, gevonden_via, leads}>>}
 */
export async function zoekGebouw(env, zoekterm) {
  const q = String(zoekterm || '').trim();
  if (q.length < 2) return [];
  const cijfers = q.replace(/\D/g, '');
  const isTelefoon = cijfers.length >= 6 && cijfers.length >= q.replace(/[\s+./()-]/g, '').length - 1;
  // Een telefoonnummer staat in Odoo in allerlei vormen; de laatste acht
  // cijfers zonder spaties vinden we via phone_mobile_search.
  const telQ = isTelefoon ? cijfers.slice(-8) : null;

  const [bedrijven, personen, leads, bladen] = await Promise.all([
    sr(env, 'res.partner',
      [['is_company', '=', true], ...(telQ ? [['phone_mobile_search', 'ilike', telQ]]
        : ofIlike(['name', 'street', 'city', 'zip', 'email', 'x_studio_registration_number'], q))],
      ['id'], { limit: 15 }),
    sr(env, 'res.partner',
      [['is_company', '=', false], ...(telQ ? [['phone_mobile_search', 'ilike', telQ]] : ofIlike(['name', 'email'], q))],
      ['commercial_partner_id', 'name'], { limit: 15 }),
    sr(env, 'crm.lead',
      telQ ? ['|', ['phone', 'ilike', telQ], ['x_studio_mobile', 'ilike', telQ]]
        : ofIlike(['name', 'partner_name', 'contact_name', 'email_from', 'x_vme_naam', 'x_vme_straat'], q),
      ['partner_id', 'name'], { limit: 15, context: { active_test: false }, order: 'write_date desc' }),
    telQ ? Promise.resolve([]) : sr(env, 'x_sales_action_sheet', [['x_name', 'ilike', q]],
      ['x_studio_for_company_id', 'x_name'], { limit: 10 }),
  ]);

  const via = new Map(); // gebouw_id -> Set(reden)
  const zet = (id, reden) => {
    if (!id) return;
    if (!via.has(id)) via.set(id, new Set());
    via.get(id).add(reden);
  };
  bedrijven.forEach((b) => zet(b.id, 'gebouw'));
  personen.forEach((p) => zet(m2oId(p.commercial_partner_id), `contact ${p.name}`));
  bladen.forEach((b) => zet(m2oId(b.x_studio_for_company_id), 'actieblad'));

  // Een lead hangt aan een contactpersoon; het gebouw is diens bedrijf.
  const leadPartners = [...new Set(leads.map((l) => m2oId(l.partner_id)).filter(Boolean))];
  const losseLeads = leads.filter((l) => !m2oId(l.partner_id));
  const partnerInfo = leadPartners.length
    ? await sr(env, 'res.partner', [['id', 'in', leadPartners]], ['commercial_partner_id'], { context: { active_test: false } })
    : [];
  const commercieel = new Map(partnerInfo.map((p) => [p.id, m2oId(p.commercial_partner_id)]));
  leads.forEach((l) => zet(commercieel.get(m2oId(l.partner_id)), `lead ${l.name}`));

  const ids = [...via.keys()].slice(0, 12);
  const [info, leadsPerGebouw, leden] = ids.length ? await Promise.all([
    sr(env, 'res.partner', [['id', 'in', ids]],
      ['name', 'street', 'zip', 'city', 'is_company', 'x_studio_company_type', 'x_studio_number_of_plots'],
      { context: { active_test: false } }),
    sr(env, 'crm.lead', [['partner_id', 'child_of', ids]],
      ['name', 'stage_id', 'user_id', 'active', 'probability', 'partner_id'],
      { context: { active_test: false }, order: 'create_date desc', limit: 60 }),
    // crm.lead kent geen commercial_partner_id: welke partner bij welk gebouw hoort.
    sr(env, 'res.partner', [['commercial_partner_id', 'in', ids]], ['commercial_partner_id'],
      { context: { active_test: false }, limit: 500 }),
  ]) : [[], [], []];
  const gebouwVan = new Map(leden.map((p) => [p.id, m2oId(p.commercial_partner_id)]));

  const resultaat = info.map((p) => {
    const eigenLeads = leadsPerGebouw.filter((l) => gebouwVan.get(m2oId(l.partner_id)) === p.id).slice(0, 4);
    return {
      gebouw_id: p.id,
      naam: p.name,
      adres: [p.street, [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
      type: m2oNaam(p.x_studio_company_type) || (p.is_company ? 'bedrijf' : 'persoon'),
      kavels: p.x_studio_number_of_plots || null,
      gevonden_via: [...(via.get(p.id) || [])].slice(0, 3).join('; '),
      leads: eigenLeads.map((l) => ({
        lead_id: l.id, naam: l.name,
        fase: l.active === false ? (l.probability === 0 ? 'verloren' : 'gearchiveerd') : m2oNaam(l.stage_id),
        verantwoordelijke: m2oNaam(l.user_id),
      })),
    };
  });
  // Volgorde: eerst wat op naam/adres van het gebouw zelf gevonden werd.
  resultaat.sort((a, b) => (via.get(b.gebouw_id)?.has('gebouw') ? 1 : 0) - (via.get(a.gebouw_id)?.has('gebouw') ? 1 : 0));

  // Leads zonder klant in Odoo: die hebben (nog) geen gebouw, maar wel een dossier.
  for (const l of losseLeads.slice(0, 5)) {
    resultaat.push({ gebouw_id: null, lead_id: l.id, naam: l.name, adres: null, type: 'lead zonder klant', gevonden_via: 'lead', leads: [] });
  }
  return resultaat;
}
