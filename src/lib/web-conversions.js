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
 *
 * VIA DE SERVICE BINDING `TRACKER`, nooit via het publieke workers.dev-adres.
 * Cloudflare laat een Worker een andere Worker van hetzelfde account niet via
 * dat adres aanroepen; tussen 29-09 en 03-10-2026 faalde daardoor ELKE melding
 * stil (13 inzendingen met een bezoeker-UUID, 0 conversies in D1) -- de fout
 * wordt hier bewust ingeslikt, dus niemand zag het. Het publieke adres blijft
 * enkel als terugval voor een omgeving zonder binding (lokaal).
 *
 * REGEL (2026-10-03): ELK punt waar een bezoeker zich bekendmaakt -- een
 * formulier, een Calendly-boeking, een event-inschrijving, later de academy --
 * meldt dat hier, met de bezoeker-UUID en het adres. Zonder die melding telt de
 * conversie niet, hangt de bezoeker niet aan zijn lead, en zie je zijn weg naar
 * ons nergens. Een koppeling heeft daar GEEN aparte stap voor nodig.
 *
 * SOORT (`soort`): aanvraag | nieuwsbrief | academy | event. Zie conversieSoort().
 */

const TRACKER_PUBLIC = 'https://website-tracker.openvme-odoo.workers.dev';

async function postTracker(env, path, body) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Conversion-Secret': env.WEB_CONVERSION_SECRET },
    body: JSON.stringify(body),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = env.TRACKER
      ? await env.TRACKER.fetch(new Request('https://website-tracker.internal' + path, { ...init, signal: ctrl.signal }))
      : await fetch(TRACKER_PUBLIC + path, { ...init, signal: ctrl.signal });
    if (!res.ok) console.warn('[web-conversion]', path, 'tracker antwoordde', res.status, await res.text().catch(() => ''));
    return res.ok;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Welke soort actie is een inzending van deze koppeling?
 * Eerst wat op de koppeling gekozen is ("Telt in Webgedrag als", kolom
 * `web_action`); staat daar niets, dan op de naam:
 *   calendly                        -> aanvraag (kennismaking, demo)
 *   "nieuwsbrief"/"newsletter"      -> nieuwsbrief
 *   "academy"/"cursus"              -> academy
 *   al de rest (contact, offerte...) -> aanvraag
 * 'geen' = telt nergens als actie; de bezoeker wordt wel herkend (adres, koppeling).
 */
const WEB_ACTIONS = ['aanvraag', 'nieuwsbrief', 'academy', 'event', 'geen'];
export function conversieSoort(integration) {
  if (WEB_ACTIONS.includes(integration?.web_action)) return integration.web_action;
  if (integration?.source_type === 'calendly') return 'aanvraag';
  const naam = String(integration?.name || '').toLowerCase();
  if (/nieuwsbrief|newsletter/.test(naam)) return 'nieuwsbrief';
  if (/academy|cursus/.test(naam)) return 'academy';
  return 'aanvraag';
}
const UUID_VORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_VORM = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;
// De koppelingen gebruiken verschillende veldnamen voor hetzelfde adres
// (`email`, `email-1`, `e_mailadres`). Eerst die, dan het enige veld dat op een
// adres lijkt -- twee verschillende adressen in één formulier: geen keuze maken.
const EMAIL_SLEUTELS = ['email', 'email-1', 'e_mailadres', 'e-mailadres', 'invitee_email'];
function emailUit(form) {
  const f = form || {};
  for (const k of EMAIL_SLEUTELS) {
    const v = typeof f[k] === 'string' ? f[k].trim().toLowerCase() : '';
    if (EMAIL_VORM.test(v)) return v;
  }
  const gevonden = new Set();
  for (const [k, v] of Object.entries(f)) {
    if (k.startsWith('meta_') || typeof v !== 'string') continue;
    const s = v.trim().toLowerCase();
    if (EMAIL_VORM.test(s)) gevonden.add(s);
  }
  return gevonden.size === 1 ? [...gevonden][0] : null;
}

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

    // Een Calendly-koppeling die bewust iets anders dan een aanvraag is (bv. 'geen'
    // voor een intern overleg), gaat mee als formulier met die soort.
    const isCalendly = integration?.source_type === 'calendly' && conversieSoort(integration) === 'aanvraag';
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
            soort: conversieSoort(integration),
            form_slug: f.meta_form_slug || null,
            source_type: integration?.source_type || null,
            site: f.meta_site || null,
            email: emailUit(f),
          },
    };
    await postTracker(env, '/internal/conversion', body);
  } catch (e) {
    console.warn('[web-conversion] niet doorgegeven:', e?.message || e);
  }
}

/**
 * Een inschrijving voor een event (Eventbeheer, publieke API). De bezoeker-UUID
 * komt van de plugin mymmo-events, die de cookie server-side leest.
 * Faalt nooit.
 *
 * @param {{uuid: string, refUuid?: string, email?: string, eventName?: string, eventId?: number, registrationId?: number, ts?: string}} args
 */
export async function reportEventConversion(env, { uuid, refUuid, email, eventName, eventId, registrationId, ts }) {
  try {
    if (!env.WEB_CONVERSION_SECRET) return;
    const u = typeof uuid === 'string' && UUID_VORM.test(uuid.trim()) ? uuid.trim().toLowerCase() : null;
    if (!u) return;
    await postTracker(env, '/internal/conversion', {
      uuid: u,
      kind: 'event',
      ts: ts || new Date().toISOString(),
      ref: `evtv2:${eventId || '?'}:${registrationId || email || u}`,
      data: { event_name: eventName || null, event_id: eventId || null, email: email || null, soort: 'event' },
    });
    const r = typeof refUuid === 'string' && UUID_VORM.test(refUuid.trim()) ? refUuid.trim().toLowerCase() : null;
    if (r && r !== u && email) {
      await postTracker(env, '/internal/conversion', {
        uuid: r, kind: 'event', ts: ts || new Date().toISOString(),
        ref: `evtv2:${eventId || '?'}:${registrationId || email}:ref`,
        data: { event_name: eventName || null, event_id: eventId || null, email, soort: 'event' },
      });
    }
  } catch (e) {
    console.warn('[web-conversion] event niet doorgegeven:', e?.message || e);
  }
}

/**
 * Na de pipeline: de records die deze inzending in Odoo maakte of vond, koppelen
 * aan de bezoeker. Dat is de ZEKERE koppeling (docs ontwerp-odoo-zonder-bezoekers.md
 * §2.1 in de tracker-repo); de matching op e-mail komt er elk uur bovenop.
 * Vervangt de stap "x_web_visitor bijwerken" in de koppelingen. Faalt nooit.
 *
 * @param {{normalizedForm: object, sortedTargets: Array, targetResults: Array}} args
 */
const LINK_MODELLEN = new Set(['crm.lead', 'res.partner', 'x_sales_action_sheet']);
const MISLUKT = new Set(['failed', 'skipped', 'mail_failed', 'pdf_failed']);

export async function reportWebLinks(env, { normalizedForm, sortedTargets, targetResults }) {
  try {
    if (!env.WEB_CONVERSION_SECRET) return;
    const uuid = uuidUit(normalizedForm);
    if (!uuid) return;
    const ref = typeof normalizedForm?.meta_ovme_ref_uuid === 'string' && UUID_VORM.test(normalizedForm.meta_ovme_ref_uuid.trim())
      ? normalizedForm.meta_ovme_ref_uuid.trim().toLowerCase() : null;
    const links = [];
    const gezien = new Set();
    for (const r of targetResults || []) {
      const t = (sortedTargets || []).find(x => x.id === r.target_id);
      const model = t?.odoo_model;
      const resId = Number(r.odoo_record_id);
      if (!LINK_MODELLEN.has(model) || !Number.isInteger(resId) || resId <= 0 || MISLUKT.has(r.action_result)) continue;
      if (gezien.has(model + resId)) continue;
      gezien.add(model + resId);
      links.push({ uuid, model, res_id: resId, bron: 'inzending', sterkte: 'zeker' });
      // De bezoeker op de andere site (doorklik openvme <-> syndicoach) is dezelfde browser-gebruiker.
      if (ref && ref !== uuid) links.push({ uuid: ref, model, res_id: resId, bron: 'inzending-andere-site', sterkte: 'zeker' });
    }
    if (!links.length) return;
    await postTracker(env, '/internal/links', { links });
  } catch (e) {
    console.warn('[web-links] niet doorgegeven:', e?.message || e);
  }
}
