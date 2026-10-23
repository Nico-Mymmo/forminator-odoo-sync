/**
 * Wat er rond dit gebouw nagekeken moet worden.
 *
 * Twee delen:
 *   extraVragen()  -- de vragen die enkel hiervoor nodig zijn (dubbele
 *                     bedrijven, contacten die ook elders staan, open cases
 *                     van de Odoo-controle). Draait in dezelfde ronde als de
 *                     geschiedenis van het dossier, dus kost geen extra tijd.
 *   nakijkPunten() -- puur: legt alles naast elkaar en zegt wat niet klopt.
 *
 * Het zijn SIGNALEN, geen beslissingen: Claude legt ze voor, de medewerker
 * beslist. Er wordt hier niets aangepast.
 */

import { executeKw } from '../../../lib/odoo.js';
import { getSupabaseClient } from '../../../lib/database.js';
import { statusVan } from '../../odoo-controle/lib/constants.js';

const m2oId = (v) => (Array.isArray(v) ? v[0] : (Number.isInteger(v) ? v : null));
const m2oNaam = (v) => (Array.isArray(v) ? v[1] : null);
const dag = (s) => (s ? String(s).slice(0, 10) : '');
const dagenSinds = (s) => (s ? Math.round((Date.now() - Date.parse(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'))) / 86400000) : null);

function sr(env, model, domain, fields, extra = {}) {
  return executeKw(env, { model, method: 'search_read', args: [domain], kwargs: { fields, ...extra } })
    .catch((err) => { console.error('[claude-sales] nakijken', model, err?.message); return []; });
}

let casesCache = { t: 0, rijen: null };

async function openCases(env) {
  if (casesCache.rijen && Date.now() - casesCache.t < 2 * 60 * 1000) return casesCache.rijen;
  try {
    const { data } = await getSupabaseClient(env).from('controle_cases')
      .select('id, nr, titel, klant, prio, refs, bevinding, voorstel, onderzocht, rechtgezet, geen_fout, vasthouden')
      .limit(2000);
    casesCache = { t: Date.now(), rijen: (data || []).filter((c) => !['opgelost', 'geenfout'].includes(statusVan(c))) };
  } catch {
    casesCache = { t: Date.now(), rijen: [] };
  }
  return casesCache.rijen;
}

const ruim = (s) => String(s || '').toLowerCase().replace(/^(vme|acp|vzw|residentie|résidence|residence)\s+/i, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function extraVragen(env, kern) {
  const g = kern.gebouw;
  const emails = [...new Set(kern.contacten.map((c) => String(c.email || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  const leadEmails = [...new Set(kern.leads.map((l) => String(l.email_from || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  const alleEmails = [...new Set([...emails, ...leadEmails])].slice(0, 20);

  const dubbelDomein = [];
  if (g) {
    const delen = [['name', '=ilike', g.name]];
    if (g.street && g.zip) delen.push(['&', ['street', '=ilike', g.street], ['zip', '=', g.zip]]);
    if (g.x_studio_registration_number) delen.push(['x_studio_registration_number', '=', g.x_studio_registration_number]);
    const plat = [];
    delen.forEach((d, i) => { if (i < delen.length - 1) plat.push('|'); if (d[0] === '&') plat.push(...d); else plat.push(d); });
    dubbelDomein.push(['is_company', '=', true], ['id', '!=', g.id], ...plat);
  }
  const eigen = new Set([g?.id, ...kern.contacten.map((c) => c.id)].filter(Boolean));

  const [dubbels, elders, leadsElders, cases] = await Promise.all([
    g ? sr(env, 'res.partner', dubbelDomein, ['name', 'street', 'zip', 'city', 'x_studio_company_type', 'active'], { limit: 8, context: { active_test: false } }) : [],
    alleEmails.length ? sr(env, 'res.partner', [['email', 'in', alleEmails]], ['name', 'email', 'commercial_partner_id', 'is_company'], { limit: 30 }) : [],
    alleEmails.length ? sr(env, 'crm.lead', [['email_from', 'in', alleEmails]], ['name', 'email_from', 'partner_id', 'stage_id', 'active', 'probability'], { limit: 30, context: { active_test: false } }) : [],
    openCases(env),
  ]);

  return {
    dubbels,
    contactElders: elders.filter((p) => !eigen.has(p.id) && m2oId(p.commercial_partner_id) !== g?.id),
    leadsElders: leadsElders.filter((l) => !kern.leads.some((k) => k.id === l.id)),
    cases,
  };
}

/**
 * @returns {string[]} de punten, belangrijkste eerst
 */
export function nakijkPunten(kern, gesch, extra, web) {
  const p = [];
  const { gebouw: g, contacten, leads, actiebladen } = kern;
  const open = leads.filter((l) => l.active !== false);
  const lopend = (gesch.orders || []).filter((o) => ['3_progress', '4_paused'].includes(o.subscription_state));
  const offertes = (gesch.orders || []).filter((o) => ['draft', 'sent'].includes(o.state));

  // Dubbels en verspreide gegevens
  for (const d of extra.dubbels || []) {
    p.push(`Mogelijk dubbel gebouw in Odoo: "${d.name}" [id ${d.id}]${d.street ? ', ' + d.street + ' ' + (d.zip || '') : ''}${d.active === false ? ' (gearchiveerd)' : ''}. Nakijken of dat hetzelfde gebouw is.`);
  }
  for (const c of extra.contactElders || []) {
    p.push(`${c.email} staat ook bij ${m2oNaam(c.commercial_partner_id) || c.name} [id ${m2oId(c.commercial_partner_id) || c.id}]. Dubbel contact, of dezelfde persoon bij een ander gebouw?`);
  }
  for (const l of extra.leadsElders || []) {
    const fase = l.active === false ? (l.probability === 0 ? 'verloren' : 'gearchiveerd') : m2oNaam(l.stage_id);
    p.push(`Er is nog een lead met ${l.email_from} die niet aan dit gebouw hangt: "${l.name}" [lead ${l.id}, ${fase}]${l.partner_id ? ' bij ' + m2oNaam(l.partner_id) : ', zonder klant'}.`);
  }
  if (open.length > 1) p.push(`${open.length} open leads op dit gebouw (${open.map((l) => l.id).join(', ')}). Nakijken of ze samen moeten.`);

  // Offertes en abonnementen tegenover de lead
  for (const o of offertes) {
    const d = dagenSinds(o.date_order);
    p.push(`Open offerte ${o.name} (${o.state === 'sent' ? 'verstuurd' : 'concept'}, ${dag(o.date_order)}${d !== null ? `, ${d} dagen` : ''}). Opvolgen of annuleren.`);
  }
  if (lopend.length && open.some((l) => l.probability > 0 && l.probability < 100)) {
    p.push(`Er loopt al een abonnement (${lopend.map((o) => o.name).join(', ')}), maar er staat nog een open lead. Is het een upsell, of moet de lead op gewonnen?`);
  }
  if (leads.some((l) => l.probability === 100) && !lopend.length && !(gesch.orders || []).some((o) => o.state === 'sale')) {
    p.push('Er is een gewonnen lead, maar geen bevestigde order of lopend abonnement.');
  }

  // Actieblad
  if (!actiebladen.length && open.some((l) => l.type === 'opportunity')) p.push('Open verkoopkans zonder actieblad.');
  for (const b of actiebladen) {
    const gelinkt = b.x_studio_as_opportunity_ids || [];
    if (!gelinkt.length && leads.length) p.push(`Actieblad ${b.id} is aan geen enkele lead gekoppeld.`);
    if (g && m2oId(b.x_studio_for_company_id) !== g.id) p.push(`Actieblad ${b.id} hangt niet aan dit gebouw (${m2oNaam(b.x_studio_for_company_id) || 'geen gebouw'}).`);
    const cid = m2oId(b.x_studio_contact_id);
    if (cid && !contacten.some((c) => c.id === cid)) p.push(`De contactpersoon op actieblad ${b.id} (${m2oNaam(b.x_studio_contact_id)}) is geen contact van dit gebouw.`);
    if (g && b.x_studio_number_of_plots && g.x_studio_number_of_plots && b.x_studio_number_of_plots !== g.x_studio_number_of_plots) {
      p.push(`Aantal kavels verschilt: actieblad ${b.x_studio_number_of_plots}, gebouw ${g.x_studio_number_of_plots}.`);
    }
  }

  // Lead tegenover gebouw
  for (const l of leads) {
    if (!l.partner_id) p.push(`Lead ${l.id} hangt aan geen klant in Odoo.`);
    if (g && l.x_vme_postcode && g.zip && String(l.x_vme_postcode).trim() !== String(g.zip).trim()) {
      p.push(`Postcode op lead ${l.id} (${l.x_vme_postcode}) is niet die van het gebouw (${g.zip}).`);
    }
    if (l.active !== false && !String(l.description || '').replace(/<[^>]+>/g, '').trim()) p.push(`De interne notitie van lead ${l.id} is leeg.`);
  }
  if (g && !g.street) p.push(leads.some((l) => l.x_vme_straat) ? 'Het gebouw heeft geen adres, maar de lead wel (VME-velden). Overnemen?' : 'Het gebouw heeft geen adres in Odoo.');
  if (g && !g.x_studio_number_of_plots && actiebladen.some((b) => b.x_studio_number_of_plots)) p.push('Aantal kavels staat op het actieblad maar niet op het gebouw.');

  // Contactpersonen
  if (g && !contacten.length) p.push('Geen enkele contactpersoon bij dit gebouw.');
  for (const c of contacten) {
    if (!c.email && !c.phone && !c.mobile) p.push(`Contact ${c.name} heeft geen e-mail en geen telefoon.`);
  }

  // Opvolging
  const nu = Date.now();
  const teLaat = (gesch.activiteiten || []).filter((a) => a.date_deadline && Date.parse(a.date_deadline) < nu - 86400000);
  teLaat.forEach((a) => p.push(`Activiteit over tijd: "${a.summary || m2oNaam(a.activity_type_id) || 'activiteit'}" (${dag(a.date_deadline)}, ${m2oNaam(a.user_id) || '-'}).`));
  if (open.length && !(gesch.activiteiten || []).length) p.push('Open lead zonder geplande volgende stap (geen activiteit).');
  const komend = (gesch.calendly || []).filter((m) => !m.x_studio_cm_iscancelled && Date.parse(m.x_studio_cm_start_time) > nu);
  komend.forEach((m) => p.push(`Afspraak gepland op ${String(m.x_studio_cm_start_time).slice(0, 16)} met ${m2oNaam(m.x_studio_cm_host_name) || '-'}: voorbereiden.`));

  // Website
  (web?.signalen || []).forEach((s) => p.push(s));

  // Odoo-controle
  const ids = { 'res.partner': new Set([g?.id, ...contacten.map((c) => c.id)].filter(Boolean)), 'crm.lead': new Set(leads.map((l) => l.id)) };
  const orderIds = new Set((gesch.orders || []).map((o) => o.id));
  for (const c of extra.cases || []) {
    const raakt = (c.refs || []).some((r) => (ids[r.model]?.has(Number(r.id))) || (r.model === 'sale.order' && orderIds.has(Number(r.id))));
    if (raakt) p.push(`Open case in Odoo-controle #${c.nr} (${c.prio || '-'}): ${c.titel || c.bevinding || ''}${c.voorstel ? ' Voorstel: ' + c.voorstel : ''}`);
  }
  return p;
}
