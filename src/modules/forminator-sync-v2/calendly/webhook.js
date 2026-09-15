/**
 * Koppelingen — Calendly: de boeking binnenhalen.
 *
 * HARDE REGEL, zelfde als bij forms/submit.js: hier staat GEEN uitvoeringslogica.
 * Dit bestand kijkt de handtekening na, kiest de juiste koppeling, slaat de
 * payload plat en geeft die door aan handleGenericWebhook() in worker-handler.js
 * -- dezelfde functie die de generieke webhook en de OM-formulieren al gebruiken.
 * Idempotentie, retries, replay, het Indieningen-tabblad en alle stapsoorten
 * werken daardoor ongewijzigd. Bouw hier nooit een tweede pad naar Odoo.
 *
 * EEN URL, MEERDERE KOPPELINGEN. Calendly kan een webhook-subscription niet op
 * eventtype filteren -- `scope` is enkel organization, user of group. Er is dus
 * één subscription voor de hele module, en de routering naar de juiste
 * koppeling gebeurt hier, op scheduled_event.event_type.
 */

import { handleGenericWebhook } from '../worker-handler.js';
import { flattenCalendlyPayload, verifyCalendlySignature, HANDLED_EVENTS } from './payload.js';
import { listCalendlySubscriptions, findCalendlyIntegrationForEventType } from './database.js';
import { odooTaalcode } from './system-step.js';

export const CALENDLY_WEBHOOK_PATH = '/forminator-v2/api/calendly/webhook';

export function isCalendlyWebhookPath(pathname, method) {
  return pathname === CALENDLY_WEBHOOK_PATH && method === 'POST';
}

export async function handleCalendlyWebhook(request, env) {
  // De RUWE body, vóór JSON.parse. De handtekening gaat over exact deze bytes;
  // JSON.stringify(geparste body) verschilt in sleutelvolgorde en witruimte en
  // zou de handtekening altijd doen mislukken.
  const ruweBody = await request.text();
  const handtekening = request.headers.get('Calendly-Webhook-Signature')
    || request.headers.get('calendly-webhook-signature');

  // Alle sleutels die we ooit hebben aangemeld, nieuwste eerst. Bij het opnieuw
  // aanmelden kunnen er bezorgingen onderweg zijn die nog met de VORIGE sleutel
  // ondertekend zijn; zouden we enkel de actieve proberen, dan verdwijnen die
  // boekingen stil achter een 401.
  let subscriptions;
  try {
    subscriptions = await listCalendlySubscriptions(env, { limit: 5 });
  } catch (err) {
    console.error('[calendly] kan subscriptions niet lezen:', err.message);
    return json({ success: false, error: 'Calendly subscription lookup failed' }, 500);
  }

  if (!subscriptions.length) {
    console.warn('[calendly] bezorging ontvangen maar er is geen aangemelde subscription');
    return json({ success: false, error: 'No Calendly subscription registered' }, 401);
  }

  let geverifieerd = false;
  let laatsteReden = 'signature_mismatch';
  for (const sub of subscriptions) {
    const uitslag = await verifyCalendlySignature(handtekening, ruweBody, sub.signing_key);
    if (uitslag.ok) { geverifieerd = true; break; }
    laatsteReden = uitslag.reason || laatsteReden;
  }

  if (!geverifieerd) {
    console.warn('[calendly] handtekening afgekeurd:', laatsteReden);
    return json({ success: false, error: 'Invalid signature', reason: laatsteReden }, 401);
  }

  let envelope;
  try {
    envelope = JSON.parse(ruweBody);
  } catch (_) {
    return json({ success: false, error: 'Invalid JSON' }, 400);
  }

  const soort = String(envelope?.event || '');
  if (!HANDLED_EVENTS.includes(soort)) {
    // 200 en niet 400: Calendly zou een 4xx als mislukt zien en blijven
    // herbezorgen. Een gebeurtenis waar we niets mee doen is geen fout.
    console.log('[calendly] gebeurtenis genegeerd:', soort);
    return json({ success: true, ignored: soort || 'unknown_event' });
  }

  const eventTypeUri = envelope?.payload?.scheduled_event?.event_type || '';

  let integration;
  try {
    integration = await findCalendlyIntegrationForEventType(env, eventTypeUri);
  } catch (err) {
    console.error('[calendly] koppeling opzoeken mislukt:', err.message);
    return json({ success: false, error: 'Integration lookup failed' }, 500);
  }

  if (!integration) {
    // Ook hier 200. Er mogen eventtypes in Calendly staan die de OM bewust niet
    // volgt; dat is geen storing en mag Calendly's subscription niet in de
    // problemen brengen (te veel mislukte bezorgingen zet ze op disabled).
    console.log('[calendly] geen koppeling voor eventtype:', eventTypeUri || '(geen)');
    return json({ success: true, ignored: 'no_integration', event_type: eventTypeUri });
  }

  const plat = flattenCalendlyPayload(envelope);

  // Drie velden die niet uit Calendly's payload komen maar uit de KOPPELING.
  // Ze horen hier en niet als vaste waarde in de mapping, om twee redenen: een
  // vaste waarde gaat als string naar Odoo (en een many2one wil een getal), en
  // wie het eventtype op de koppeling wijzigt zou anders ook de mapping moeten
  // laten herschrijven. Nu volgt het vanzelf.
  plat.odoo_event_type_id = integration.calendly_odoo_event_type_id
    ? String(integration.calendly_odoo_event_type_id)
    : '';
  plat.is_round_robin = integration.calendly_pooling_type === 'round_robin' ? 'true' : 'false';
  plat.form_language = odooTaalcode(integration.calendly_locale);
  plat.integration_name = integration.name || '';

  console.log('[calendly]', soort, '| koppeling:', integration.name,
    '| eventtype:', plat.event_name || eventTypeUri,
    '| afspraak:', plat.event_uuid,
    '| aanvrager:', plat.invitee_email,
    '| geannuleerd:', plat.canceled);

  // De vorm die normalizeFormValues() verwacht: form_data als tweede kandidaat,
  // form_id als eerste. Geverifieerd tegen worker-handler.js -- er is niets aan
  // die functies gewijzigd voor Calendly.
  const pipelineRequest = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ form_id: integration.forminator_form_id, form_data: plat }),
  });

  const antwoord = await handleGenericWebhook({
    env,
    integration,
    request: pipelineRequest,
    // Een koppeling die uit staat bewaart de boeking wél maar slaat Odoo over.
    // Dat is de bestaande veiligheidsklep en precies wat je wil tijdens het
    // parallel draaien met Zapier: de boekingen komen binnen, je ziet de
    // velden, en er verandert nog niets in Odoo.
    skipPipeline: !integration.is_active,
  });

  // Is de boeking BEWAARD maar liep de pipeline stuk, dan is 200 het eerlijke
  // antwoord aan Calendly: wij hebben hem, en herbezorgen lost niets op --
  // een ontbrekend Odoo-veld wordt niet beter van een tweede poging. De OM
  // heeft zijn eigen retry en de Replay-knop. Zou hier een 5xx staan, dan
  // blijft Calendly herbezorgen en zet ze de subscription uiteindelijk op
  // disabled, waarna ALLE koppelingen stilvallen.
  if (antwoord.status >= 500) {
    const body = await veiligJson(antwoord);
    if (body?.data?.submission_id) {
      console.warn('[calendly] pipeline mislukt maar boeking bewaard | indiening:', body.data.submission_id, '|', body.error);
      return json({
        success: true,
        accepted: true,
        note: 'Boeking bewaard; verwerking naar Odoo mislukt en wordt in de OM opgevolgd.',
        data: body.data,
        error: body.error || null,
      }, 202);
    }
    return antwoord;
  }

  return antwoord;
}

async function veiligJson(response) {
  try {
    return await response.clone().json();
  } catch (_) {
    return null;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
