/**
 * Welke adressen gebruikte een browser, en wanneer? Uit `visitor_emails` in D1
 * (de tracker bewaart elk adres, ook het tweede en derde, met de herleide vorm:
 * nico+test@x.be -> nico@x.be). Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §2.
 *
 * Twee dingen die hieruit volgen en die het verhaal eerlijk moeten zeggen:
 *   - een GEDEELDE browser: twee of meer herleid verschillende adressen (een koppel,
 *     of een collega die met een ander adres test). Welk bezoek van wie is, is dan
 *     een benadering.
 *   - het ACTIEVE adres van een bezoek: het laatste adres dat die browser vóór het
 *     einde van dat bezoek gebruikte; vóór het eerste adres het eerste adres dat
 *     daarna kwam. Daarom staat bij een gedeelde browser altijd een label.
 */

import { readWebEvents } from '../../../lib/web-events.js';

/** uuid -> [{ email, norm, first_seen, last_seen }], oudste eerst. */
export async function readIdentities(env, uuids) {
  const out = new Map();
  const list = [...new Set(uuids || [])];
  for (let i = 0; i < list.length; i += 90) {
    const part = list.slice(i, i + 90);
    const res = await readWebEvents(env,
      `SELECT visitor_uuid AS u, email, email_norm AS norm, first_seen, last_seen FROM visitor_emails
       WHERE visitor_uuid IN (${part.map(() => '?').join(',')}) ORDER BY first_seen`, part);
    for (const r of res.results || []) {
      if (!out.has(r.u)) out.set(r.u, []);
      out.get(r.u).push({ email: r.email, norm: r.norm, first_seen: r.first_seen, last_seen: r.last_seen });
    }
  }
  return out;
}

export function isShared(ids) {
  return new Set((ids || []).map(i => i.norm)).size > 1;
}

/** Het adres dat in gebruik was tijdens een bezoek (zie de uitleg bovenaan). */
export function activeEmail(ids, sessionEnd) {
  if (!ids || !ids.length) return null;
  let cur = null;
  for (const i of ids) if (i.first_seen <= sessionEnd) cur = i;
  return (cur || ids[0]).email;
}

/** De persoon achter een browser voor het tellen van "personen": zijn eerste herleide adres. */
export function personKey(ids, uuid) {
  return ids && ids.length ? ids[0].norm : uuid;
}
