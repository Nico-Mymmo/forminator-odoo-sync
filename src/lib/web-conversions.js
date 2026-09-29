/**
 * Een conversie die de OM zeker weet, doorgeven aan de website-tracker.
 *
 * Waarom dit bestaat: de tracker raadde een conversie in de browser, uit een klik
 * op een knop met exact de tekst "Verzenden" en uit een bezoek aan de
 * Calendly-bedankpagina. Dat mistte elke formulierinzending (429 klikken op
 * "Verzenden", 0 inzendingen) en telde het herladen van een bedankpagina als een
 * nieuwe afspraak. De OM ontvangt de inzending en de boeking zelf, met de
 * bezoeker-UUID erbij (`meta_ovme_uuid` / `ovme_uuid` / Calendly's
 * `salesforce_uuid`). Zie website-tracker/docs/ontwerp-web-visitor-events.md §5.1.
 *
 * Mag NOOIT de inzending doen mislukken: een fout wordt gelogd, niet gegooid, en
 * het verzoek heeft een korte tijdslimiet.
 *
 * Secret: WEB_CONVERSION_SECRET (Worker-secret, hier én in de tracker als
 * CONVERSION_SECRET). Zonder die secret gebeurt er niets.
 */

const TRACKER_URL = 'https://website-tracker.openvme-odoo.workers.dev/internal/conversion';
const UUID_VORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidUit(form) {
  for (const k of ['meta_ovme_uuid', 'ovme_uuid', 'salesforce_uuid']) {
    const v = form?.[k];
    if (typeof v === 'string' && UUID_VORM.test(v.trim())) return v.trim().toLowerCase();
  }
  return null;
}

/**
 * @param {object} env
 * @param {{integration: object, normalizedForm: object, submissionId: string|number, receivedAt?: string}} args
 */
export async function reportWebConversion(env, { integration, normalizedForm, submissionId, receivedAt }) {
  try {
    if (!env.WEB_CONVERSION_SECRET) return;
    const uuid = uuidUit(normalizedForm);
    if (!uuid) return;

    const isCalendly = integration?.source_type === 'calendly';
    const f = normalizedForm || {};
    const body = {
      uuid,
      kind: isCalendly ? 'calendly' : 'form',
      ts: receivedAt || new Date().toISOString(),
      // Dezelfde inzending (retry, replay) mag de tracker één keer tellen.
      ref: `fsv2:${integration?.id}:${isCalendly ? (f.invitee_uuid || f.event_uuid || submissionId) + ':' + (f.booking_action || '') : submissionId}`,
      data: isCalendly
        ? {
            booking_action: f.booking_action || null,
            event_name: f.event_name || null,
            invitee_name: f.name || null,
            invitee_email: f.invitee_email || null,
            host_name: f.host_name || null,
            start_time: f.start_time || null,
            integration: integration?.name || null,
          }
        : {
            form_name: integration?.name || null,
            form_slug: f.meta_form_slug || null,
            source_type: integration?.source_type || null,
            site: f.meta_site || null,
            email: f.email || f['email-1'] || null,
          },
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(TRACKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Conversion-Secret': env.WEB_CONVERSION_SECRET },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) console.warn('[web-conversion] tracker antwoordde', res.status, await res.text().catch(() => ''));
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('[web-conversion] niet doorgegeven:', e?.message || e);
  }
}
