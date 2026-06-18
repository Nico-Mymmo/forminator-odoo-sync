/**
 * Visitor → Partner Enrichment
 *
 * Haalt res.partner op voor x_web_visitor records via email-match.
 * Koppelingslogica: x_web_visitor.x_studio_email → res.partner.email
 *
 * Er is geen Many2one-link — email is de enige identifier.
 * Bezoekers zonder e-mailadres krijgen geen __partner.
 * Bezoekers waarbij geen partner gevonden wordt ook niet.
 *
 * Output: elke visitor krijgt (alleen als gevonden) __partner: { id, ... }
 *
 * @module modules/sales-insight-explorer/lib/visitor-partner-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

const BASE_PARTNER_FIELDS = ['id', 'name', 'email'];

/**
 * Enrich web visitors met hun res.partner record (via e-mail).
 *
 * @param {Array}  visitors - Primaire query resultaten (x_web_visitor)
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {string[]} [config.fields]  - Extra res.partner veldnamen
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichVisitorsWithPartner(visitors, config, env, notes) {
  const startTime = Date.now();
  notes.push('🤝 Visitor → Partner enrichment gestart (via e-mail)');

  if (!visitors.length) {
    return { records: visitors, meta: { partners_fetched: 0, execution_time_ms: 0 } };
  }

  // Verzamel unieke e-mailadressen
  const emailSet = new Set();
  for (const v of visitors) {
    if (v.x_studio_email) emailSet.add(v.x_studio_email.toLowerCase().trim());
  }

  if (!emailSet.size) {
    notes.push('Visitor→Partner: geen e-mailadressen gevonden, enrichment overgeslagen');
    return { records: visitors, meta: { partners_fetched: 0, execution_time_ms: Date.now() - startTime } };
  }

  const emails = Array.from(emailSet);
  notes.push(`Visitor→Partner: ${emails.length} unieke e-mailadressen`);

  // Veldlijst: basis + extra velden
  const extraFields = Array.isArray(config.fields) ? config.fields : [];
  const fields = Array.from(new Set([...BASE_PARTNER_FIELDS, ...extraFields]));

  const partners = await searchRead(env, {
    model: 'res.partner',
    domain: [['email', 'in', emails]],
    fields,
    limit: false
  });

  notes.push(`res.partner: ${partners.length} partners opgehaald voor ${emails.length} e-mailadressen`);

  if (!partners.length) {
    return { records: visitors, meta: { partners_fetched: 0, execution_time_ms: Date.now() - startTime } };
  }

  // Bouw email → partner map (lowercase)
  const partnerByEmail = new Map();
  for (const p of partners) {
    if (p.email) partnerByEmail.set(p.email.toLowerCase().trim(), p);
  }

  // Koppel __partner aan elke visitor — alleen als gevonden
  let visitorsWithPartner = 0;
  const enriched = visitors.map(v => {
    if (!v.x_studio_email) return v;
    const partner = partnerByEmail.get(v.x_studio_email.toLowerCase().trim());
    if (!partner) return v;
    visitorsWithPartner++;
    return { ...v, __partner: partner };
  });

  const meta = {
    execution_method: 'visitor_partner_enrichment',
    emails_queried: emails.length,
    partners_fetched: partners.length,
    visitors_with_partner: visitorsWithPartner,
    visitors_without_partner: visitors.length - visitorsWithPartner,
    fields_fetched: fields,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Visitor→Partner klaar: ${visitorsWithPartner}/${visitors.length} bezoekers gekoppeld aan partner`);
  return { records: enriched, meta };
}
