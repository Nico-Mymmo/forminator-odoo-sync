/**
 * Koppelingen — Calendly: de vaste eerste stap.
 *
 * Een Calendly-koppeling synchroniseert ALTIJD naar x_calendlymeeting. Dat is
 * niet instelbaar: aanmaken, verplaatsen en annuleren worden alle drie
 * opgevangen en het Odoo-record volgt. Daarbovenop mag je zelf stappen hangen
 * (contact, lead, notitie, mail) -- die zijn wél gewoon instelbaar.
 *
 * WAAROM DEZE STAP ECHTE RIJEN IS EN GEEN CODE
 * --------------------------------------------
 * Het zou korter zijn om in worker-handler.js een `if (source_type ===
 * 'calendly')` te zetten die rechtstreeks naar Odoo schrijft. Dat is precies de
 * fout die deze repo eerder maakte met twee motoren naast elkaar. Als rijen in
 * fs_v2_resolvers/fs_v2_targets/fs_v2_mappings:
 *
 *   - draait de bestaande pipeline er ongewijzigd op (idempotentie, retries,
 *     replay, foutafhandeling, alles);
 *   - staat de stap in het spoor van elke indiening, dus je ziet wat er gebeurd
 *     is en waarom niet;
 *   - kan een VOLGENDE stap via previous_step_output aan het meeting-id, zonder
 *     dat daar iets voor uitgevonden moet worden.
 *
 * De rijen dragen is_system = true; de routes weigeren ze te wijzigen of te
 * verwijderen. Zonder die vlag is een vaste stap niet van een gewone te
 * onderscheiden en haalt de eerste opruimactie hem weg -- waarna er niets meer
 * in Odoo belandt terwijl het scherm nog "actief" zegt.
 *
 * DEZE FUNCTIE IS IDEMPOTENT. Bij het aanmaken van een koppeling bouwt ze de
 * stappen; bij elke latere save werkt ze ze bij. Bestaande rijen worden
 * bijgewerkt en niet weggegooid-en-opnieuw-gemaakt, want hun id's staan in het
 * spoor van elke eerdere indiening.
 */

import {
  listResolversByIntegration,
  createResolver,
  updateResolver,
  listTargetsByIntegration,
  createTarget,
  updateTarget,
  listMappingsByTarget,
  createMapping,
  updateMapping,
  deleteMapping,
  listFieldTransforms,
  upsertFieldTransform,
} from '../database.js';

export const MEETING_MODEL = 'x_calendlymeeting';
export const HOST_STAP = 'calendly_host';
export const MEETING_STAP = 'calendly_meeting';

/**
 * Calendly's taalcode → de taalcode die Odoo op x_studio_form_language bewaart.
 * De bestaande records staan op 'nl_BE'; Calendly stuurt enkel 'nl'.
 */
const TAALCODES = {
  nl: 'nl_BE', fr: 'fr_BE', en: 'en_US', de: 'de_DE',
  es: 'es_ES', it: 'it_IT', pt: 'pt_PT', uk: 'uk_UA',
};

export function odooTaalcode(locale) {
  const code = String(locale || '').trim().toLowerCase().slice(0, 2);
  return TAALCODES[code] || 'nl_BE';
}

/**
 * De velden die de payload als TEKST levert maar Odoo als iets anders wil.
 *
 * Zonder deze omzetting gaat het stil mis en niet luid: een boolean-veld krijgt
 * de string "false", en Python leest bool("false") als True -- een geannuleerde
 * afspraak zou dus als niet-geannuleerd in Odoo staan. Datzelfde gold al eens
 * voor is_company (2026-09-10). Een datum in ISO-vorm met een Z erachter wordt
 * door Odoo geweigerd, en een duur als tekst belandt als 0 in een integer.
 */
const VELDTYPES = {
  canceled:            'boolean',
  rescheduled:         'boolean',
  is_round_robin:      'boolean',
  duration_minutes:    'integer',
  host_count:          'integer',
  odoo_event_type_id:  'integer',
  start_time:          'datetime',
  end_time:            'datetime',
  booked_at:           'datetime',
  canceled_at:         'datetime',
};

/**
 * De veldkoppelingen van de meeting-stap. `bron` is het platte veld uit
 * calendly/payload.js; `soort` is het source_type van de mapping.
 */
const MEETING_MAPPINGS = [
  { odoo_field: 'x_studio_cm_event_id',        soort: 'form',                  bron: 'event_uuid',         identifier: true,  verplicht: true },
  { odoo_field: 'x_name',                      soort: 'form',                  bron: 'event_name' },
  { odoo_field: 'x_studio_cm_invitee',         soort: 'context',               bron: 'context.partner_id', verplicht: true },
  { odoo_field: 'x_studio_cm_host_name',       soort: 'previous_step_output',  bron: `step.${HOST_STAP}.record_id` },
  { odoo_field: 'x_studio_cm_event_type',      soort: 'form',                  bron: 'odoo_event_type_id' },
  { odoo_field: 'x_studio_cm_start_time',      soort: 'form',                  bron: 'start_time' },
  { odoo_field: 'x_studio_cm_end_time',        soort: 'form',                  bron: 'end_time' },
  { odoo_field: 'x_studio_cm_duration',        soort: 'form',                  bron: 'duration_minutes' },
  { odoo_field: 'x_studio_cm_join_link',       soort: 'form',                  bron: 'location_join_url' },
  { odoo_field: 'x_studio_cm_cancel_link',     soort: 'form',                  bron: 'cancel_url' },
  { odoo_field: 'x_studio_cm_reschedule_link', soort: 'form',                  bron: 'reschedule_url' },
  { odoo_field: 'x_studio_cm_extra_info',      soort: 'form',                  bron: 'questions_html' },
  { odoo_field: 'x_studio_cm_iscancelled',     soort: 'form',                  bron: 'canceled' },
  { odoo_field: 'x_studio_cm_cancel_reason',   soort: 'form',                  bron: 'cancel_reason' },
  { odoo_field: 'x_studio_cm_isroundrobin',    soort: 'form',                  bron: 'is_round_robin' },
  { odoo_field: 'x_studio_form_language',      soort: 'form',                  bron: 'form_language' },
  { odoo_field: 'x_active',                    soort: 'static',                bron: 'true' },
];

/** De veldkoppeling van de host-zoekstap. */
const HOST_MAPPINGS = [
  { odoo_field: 'work_email', soort: 'form', bron: 'host_email', identifier: true },
];

/**
 * De vaste stappen aanmaken of bijwerken voor één Calendly-koppeling.
 *
 * @param {object} env
 * @param {object} integration  rij uit fs_v2_integrations (source_type 'calendly')
 * @returns {Promise<{resolver_id: string, host_target_id: string, meeting_target_id: string}>}
 */
export async function ensureCalendlySystemSteps(env, integration) {
  const integrationId = integration.id;

  // ── 1. De aanvrager: bestaand contact op e-mail, anders een nieuw contact ──
  // create_if_missing staat AAN. Een Calendly-boeking van iemand die nog niet
  // in Odoo staat is juist de interessante: dat is een nieuwe lead. Zou de
  // resolver hier stoppen, dan verloren we precies de boekingen waar het om
  // gaat, en enkel die.
  const resolvers = await listResolversByIntegration(env, integrationId);
  let resolver = resolvers.find((r) => r.is_system === true)
    || resolvers.find((r) => r.resolver_type === 'partner_by_email');

  const resolverWaarden = {
    integration_id: integrationId,
    order_index: 0,
    resolver_type: 'partner_by_email',
    input_source_field: 'invitee_email',
    create_if_missing: true,
    output_context_key: 'context.partner_id',
    is_enabled: true,
    is_system: true,
  };

  resolver = resolver
    ? await updateResolver(env, resolver.id, resolverWaarden)
    : await createResolver(env, resolverWaarden);

  // ── 2. De host opzoeken bij de medewerkers ────────────────────────────────
  // Een zoekstap, geen schrijfstap: de OM maakt nooit een medewerker aan.
  // condition_field zorgt dat de stap zichzelf overslaat als Calendly geen
  // host-e-mail meestuurde (user_email is in hun schema niet verplicht) --
  // zonder die conditie zou een ontbrekend adres de HELE indiening laten
  // falen, want een leeg zoekcriterium is een harde fout.
  // search_on_not_found 'continue_empty': een host die niet als medewerker in
  // Odoo staat is geen reden om de meeting niet te bewaren.
  const targets = await listTargetsByIntegration(env, integrationId);

  const hostWaarden = {
    integration_id: integrationId,
    order_index: 0,
    execution_order: 0,
    odoo_model: 'hr.employee',
    operation_type: 'search',
    identifier_type: 'mapped_fields',
    update_policy: 'always_overwrite',
    label: HOST_STAP,
    search_on_not_found: 'continue_empty',
    condition_field: 'host_email',
    condition_values: ['__exists__'],
    is_enabled: true,
    is_system: true,
  };

  const bestaandeHost = targets.find((t) => t.is_system === true && t.label === HOST_STAP);
  const hostTarget = bestaandeHost
    ? await updateTarget(env, bestaandeHost.id, hostWaarden)
    : await createTarget(env, hostWaarden);

  await syncMappings(env, hostTarget.id, HOST_MAPPINGS);

  // ── 3. De meeting zelf ────────────────────────────────────────────────────
  // upsert op x_studio_cm_event_id: dat veld is per Calendly-afspraak uniek en
  // staat in ELKE webhook, ook die van een annulatie. Aanmaken en bijwerken
  // zijn daardoor dezelfde stap, en een herbezorging kan geen tweede rij maken.
  //
  // LET OP bij VERPLAATSEN: Calendly maakt daar een NIEUWE afspraak van (nieuw
  // event_uuid) en annuleert de oude. Dat levert dus twee records op, waarvan
  // het oude op geannuleerd komt te staan. Dat is geen fout maar Calendly's
  // eigen model, en het is ook wat de Zapier-koppeling deed.
  //
  // operation_type is 'upsert' en NIET 'create_or_update' -- die laatste
  // bestaat niet; worker-handler.js kent create / upsert / update_only /
  // create_activity / send_mail / chatter_message / mailing_list / search.
  // error_strategy 'stop_on_error' (niet 'abort', ook dat bestaat niet):
  // lukt het wegschrijven van de meeting niet, dan hebben de stappen
  // erna geen anker en horen ze niet te draaien.
  const meetingWaarden = {
    integration_id: integrationId,
    order_index: 1,
    execution_order: 1,
    odoo_model: MEETING_MODEL,
    operation_type: 'upsert',
    identifier_type: 'mapped_fields',
    update_policy: 'always_overwrite',
    label: MEETING_STAP,
    error_strategy: 'stop_on_error',
    is_enabled: true,
    is_system: true,
  };

  const bestaandeMeeting = targets.find((t) => t.is_system === true && t.label === MEETING_STAP);
  const meetingTarget = bestaandeMeeting
    ? await updateTarget(env, bestaandeMeeting.id, meetingWaarden)
    : await createTarget(env, meetingWaarden);

  await syncMappings(env, meetingTarget.id, MEETING_MAPPINGS);

  // ── 4. Veldtypes ──────────────────────────────────────────────────────────
  // AANVULLEN, nooit overschrijven -- zelfde regel als bij de OM-formulieren.
  // Iemand kan er bewust iets anders van gemaakt hebben (een value_map op de
  // annulatiereden bijvoorbeeld), en dat stil terugzetten breekt een werkende
  // koppeling zonder zichtbare wijziging.
  const bestaandeTransforms = await listFieldTransforms(env, integrationId);
  const gekend = new Set((bestaandeTransforms || []).map((t) => t.field_name));
  for (const [veld, type] of Object.entries(VELDTYPES)) {
    if (gekend.has(veld)) continue;
    try {
      await upsertFieldTransform(env, integrationId, veld, { field_type: type, value_map: null, value_map_order: [] });
    } catch (_) {
      // Best effort: een mislukt veldtype mag het aanmaken van de koppeling
      // niet tegenhouden. Het is zichtbaar op het tabblad Formuliervelden.
    }
  }

  return {
    resolver_id: resolver.id,
    host_target_id: hostTarget.id,
    meeting_target_id: meetingTarget.id,
  };
}

/**
 * De veldkoppelingen van een systeemstap gelijkzetten met de gewenste lijst.
 *
 * Bestaande rijen worden BIJGEWERKT op odoo_field en niet weggegooid: hun id's
 * kunnen in een eerdere indiening voorkomen. Wat niet meer in de lijst staat
 * gaat wel weg -- anders blijft een veld dat we hebben laten vallen stilletjes
 * meeschrijven naar Odoo.
 */
async function syncMappings(env, targetId, gewenst) {
  const bestaand = await listMappingsByTarget(env, targetId);
  const perVeld = new Map(bestaand.map((m) => [m.odoo_field, m]));

  for (let i = 0; i < gewenst.length; i++) {
    const g = gewenst[i];
    const waarden = {
      target_id: targetId,
      order_index: i,
      odoo_field: g.odoo_field,
      source_type: g.soort,
      source_value: g.bron,
      is_required: g.verplicht === true,
      is_identifier: g.identifier === true,
    };
    const huidig = perVeld.get(g.odoo_field);
    if (huidig) {
      await updateMapping(env, huidig.id, waarden);
      perVeld.delete(g.odoo_field);
    } else {
      await createMapping(env, waarden);
    }
  }

  for (const overbodig of perVeld.values()) {
    await deleteMapping(env, overbodig.id);
  }
}
