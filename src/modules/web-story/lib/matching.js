/**
 * Wie hoort bij welke lead? Op e-mailadres, elk uur. Vervangt Odoo-serveractie
 * 1147 (geplande actie 95). Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §2.
 *
 * Odoo wordt hier alleen GELEZEN. De koppelingen gaan naar D1 via de tracker,
 * met bron en sterkte:
 *   sterk  'email-lead'    het adres staat op de lead zelf
 *   sterk  'email-contact' het adres is dat van de klant op de lead
 *   middel 'vme-collega'   het adres is van iemand anders bij dezelfde VME/firma
 *
 * Zelfde regel als 1147, met twee verschillen die bewust zijn: verloren en
 * gewone leads tellen mee (een verloren lead komt soms terug), en een collega
 * bij de VME wordt als 'middel' gemarkeerd in plaats van ongezien bijgevoegd.
 *
 * Een koppeling wordt nooit afgezwakt en nooit verwijderd door deze ronde; wat
 * een mens bevestigde of afwees, laat de tracker staan.
 */

import { searchRead } from '../../../lib/odoo.js';
import { readWebEvents } from '../../../lib/web-events.js';
import { saveLinks } from './tracker.js';

const RANG = { middel: 1, sterk: 2, zeker: 3 };
const CHUNK = 200;
const MAX_LEADS_PER_FIRMA = 10;

function chunks(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const ctx = { active_test: false };
const m2oId = v => (Array.isArray(v) ? v[0] : v || null);

export async function runMatching(env, { dry = false } = {}) {
  const vis = await readWebEvents(env,
    `SELECT uuid, lower(trim(email)) AS email FROM visitors
     WHERE email IS NOT NULL AND email <> '' AND is_internal = 0 AND is_bot = 0`);
  const uuidsPerEmail = new Map();
  for (const v of vis.results || []) {
    if (!uuidsPerEmail.has(v.email)) uuidsPerEmail.set(v.email, []);
    uuidsPerEmail.get(v.email).push(v.uuid);
  }
  const emails = [...uuidsPerEmail.keys()];

  const kandidaten = new Map(); // `${uuid}|${leadId}` -> {bron, sterkte}
  function voeg(email, leadId, bron, sterkte) {
    for (const uuid of uuidsPerEmail.get(email) || []) {
      const key = `${uuid}|${leadId}`;
      const cur = kandidaten.get(key);
      if (!cur || RANG[sterkte] > RANG[cur.sterkte]) kandidaten.set(key, { uuid, leadId, bron, sterkte });
    }
  }

  for (const part of chunks(emails, CHUNK)) {
    // 1. het adres staat op de lead
    const leads = await searchRead(env, { model: 'crm.lead', domain: [['email_normalized', 'in', part]],
      fields: ['id', 'email_normalized'], context: ctx });
    for (const l of leads || []) voeg(l.email_normalized, l.id, 'email-lead', 'sterk');

    // 2. het adres is dat van een contact
    const partners = await searchRead(env, { model: 'res.partner', domain: [['email_normalized', 'in', part]],
      fields: ['id', 'email_normalized', 'commercial_partner_id', 'is_company'], context: ctx });
    if (!partners?.length) continue;
    const emailVanPartner = new Map(partners.map(p => [p.id, p.email_normalized]));
    const eigen = await searchRead(env, { model: 'crm.lead', domain: [['partner_id', 'in', [...emailVanPartner.keys()]]],
      fields: ['id', 'partner_id'], context: ctx });
    for (const l of eigen || []) voeg(emailVanPartner.get(m2oId(l.partner_id)), l.id, 'email-contact', 'sterk');

    // 3. een collega bij dezelfde VME/firma (enkel als die firma een bedrijf is,
    //    anders is de "firma" de persoon zelf en zou dit stap 2 herhalen)
    const perFirma = new Map();
    for (const p of partners) {
      const cp = m2oId(p.commercial_partner_id);
      if (!cp || cp === p.id) continue;
      if (!perFirma.has(cp)) perFirma.set(cp, []);
      perFirma.get(cp).push(p);
    }
    if (!perFirma.size) continue;
    const firmaLeads = await searchRead(env, { model: 'crm.lead',
      domain: [['partner_id.commercial_partner_id', 'in', [...perFirma.keys()]]],
      fields: ['id', 'partner_id'], context: ctx });
    const firmaVanPartner = new Map();
    if (firmaLeads?.length) {
      const lp = [...new Set(firmaLeads.map(l => m2oId(l.partner_id)).filter(Boolean))];
      const lps = await searchRead(env, { model: 'res.partner', domain: [['id', 'in', lp]],
        fields: ['id', 'commercial_partner_id'], context: ctx });
      for (const p of lps || []) firmaVanPartner.set(p.id, m2oId(p.commercial_partner_id));
    }
    // Een firma met veel leads is geen VME maar een organisatie (een syndicus,
    // een beheerkantoor): daar is "collega" geen signaal meer.
    const leadsPerFirma = new Map();
    for (const l of firmaLeads || []) {
      const f = firmaVanPartner.get(m2oId(l.partner_id));
      leadsPerFirma.set(f, (leadsPerFirma.get(f) || 0) + 1);
    }
    for (const l of firmaLeads || []) {
      const leadPartner = m2oId(l.partner_id);
      const firma = firmaVanPartner.get(leadPartner);
      if ((leadsPerFirma.get(firma) || 0) > MAX_LEADS_PER_FIRMA) continue;
      for (const p of perFirma.get(firma) || []) {
        if (p.id !== leadPartner) voeg(p.email_normalized, l.id, 'vme-collega', 'middel');
      }
    }
  }

  // Alleen wat nieuw is of sterker wordt naar de tracker sturen.
  const bestaand = new Map();
  const ex = await readWebEvents(env, `SELECT visitor_uuid, res_id, sterkte FROM visitor_links WHERE model = 'crm.lead'`);
  for (const r of ex.results || []) bestaand.set(`${r.visitor_uuid}|${r.res_id}`, r.sterkte);
  const nieuw = [];
  for (const [key, k] of kandidaten) {
    const cur = bestaand.get(key);
    if (cur && RANG[cur] >= RANG[k.sterkte]) continue;
    nieuw.push({ uuid: k.uuid, model: 'crm.lead', res_id: k.leadId, bron: k.bron, sterkte: k.sterkte });
  }
  const result = { emails: emails.length, kandidaten: kandidaten.size, nieuw: nieuw.length };
  if (!dry && nieuw.length) Object.assign(result, await saveLinks(env, nieuw));
  return result;
}
