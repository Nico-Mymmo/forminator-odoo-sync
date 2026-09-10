/**
 * Koppelingen — een inzending van een OM-formulier de pipeline in duwen.
 *
 * HARDE REGEL: hier staat GEEN uitvoeringslogica. Dit bestand valideert de
 * inzending, bouwt de payload en geeft die door aan handleGenericWebhook() in
 * worker-handler.js — dezelfde functie die de generieke/Zapier-webhook al
 * gebruikt. Idempotentie, retries, replay, het Indieningen-tabblad en alle
 * stapsoorten (Odoo-record, chatter, activiteit, mailinglijst, send_mail)
 * werken daardoor ongewijzigd.
 *
 * Bouw hier nooit een tweede pad naar Odoo. Dat is precies de fout die de
 * Sales Insight Explorer eerder maakte met twee motoren naast elkaar.
 */

import { handleGenericWebhook } from '../worker-handler.js';
import { validateSubmissionValues, buildPipelinePayload, isLanguage, DEFAULT_LANGUAGE } from './schema.js';

/**
 * @param {object}  env
 * @param {object}  integration  rij uit fs_v2_integrations
 * @param {object}  form         rij uit fs_v2_forms
 * @param {Array}   fields       rijen uit fs_v2_form_fields
 * @param {object}  body         de JSON die de plugin stuurde
 * @param {Request} request      het originele verzoek (voor de URL)
 * @returns {Promise<{ok: boolean, response: Response}>}
 */
export async function submitFormEntry(env, { integration, form, fields, body, request }) {
  // De taal waarin de bezoeker het formulier voor zich had. Ze bepaalt in welke
  // taal een foutmelding terugkomt, en ze gaat als meta_lang mee naar Odoo --
  // een Franstalige lead hoort een Franstalige opvolging te krijgen, en zonder
  // dit veld is dat in Odoo niet te zien.
  //
  // Een onbekende of ontbrekende taal valt terug op de standaardtaal van het
  // formulier: de plugin stuurt hem mee, maar deze API staat open voor iedereen
  // met een sitesleutel en die mag hier niets kunnen forceren.
  const gevraagd = body?.meta?.lang;
  const taal = isLanguage(gevraagd) && (form.languages || []).includes(gevraagd)
    ? gevraagd
    : (isLanguage(form.default_language) ? form.default_language : DEFAULT_LANGUAGE);

  const { errors, values } = validateSubmissionValues(fields, body?.form_data, taal);

  if (errors.length > 0) {
    // 422 en niet 400: de aanvraag is welgevormd, de inhoud voldoet niet. De
    // plugin toont deze meldingen letterlijk aan de bezoeker, dus ze staan in
    // de taal van de bezoeker en gaan over het veld, niet over de techniek.
    return {
      ok: false,
      response: jsonResponse({ success: false, error: errors[0], errors }, 422),
    };
  }

  const payload = buildPipelinePayload(form, values, { ...(body?.meta || {}), lang: taal });

  // handleGenericWebhook() leest de body zelf uit het verzoek. In plaats van die
  // functie aan te passen (en daarmee het bestaande Forminator-pad te raken)
  // krijgt ze hier een verzoek met de omgebouwde payload. Zo blijft
  // worker-handler.js volledig ongewijzigd.
  const pipelineRequest = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Een inactieve koppeling bewaart de inzending wél maar slaat Odoo over.
  // Dat is de bestaande veiligheidsklep van de generieke webhook, en precies
  // wat je wil tijdens fase 3: het formulier staat op een testpagina, de
  // inzendingen komen binnen, en er verandert nog niets in Odoo.
  return {
    ok: true,
    response: await handleGenericWebhook({
      env,
      integration,
      request: pipelineRequest,
      skipPipeline: !integration.is_active,
    }),
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
