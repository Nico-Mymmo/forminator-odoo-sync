import { nietPlatteOpmaak } from '../../lib/mail/render-plain.js';

/** De twee standen van een send_mail-stap. `plain` is de standaard. */
const MAIL_LAYOUTS = ['plain', 'blocks'];

const RESOLVER_TYPES = ['partner_by_email', 'webinar_by_external_id'];
const TARGET_MODELS = ['crm.lead', 'res.partner', 'x_webinarregistrations'];
const UPDATE_POLICIES = ['always_overwrite', 'only_if_incoming_non_empty', 'upsert'];
const IDENTIFIER_TYPES = ['single_email', 'partner_context', 'registration_composite', 'mapped_fields', 'odoo_id'];
const SOURCE_TYPES = ['form', 'context', 'static', 'template', 'previous_step_output', 'html_form_summary', 'generated_unique_id'];
// 'generated_unique_id': geen door de gebruiker getypte waarde -- de pipeline genereert er zelf een
// bij het versturen (zie resolveMappingValue in worker-handler.js). source_value is dan altijd de
// vaste tekst 'uuid_v4' (voor documentatiedoeleinden in de DB, niet de echte waarde).

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function createError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function getMvpConstants() {
  return {
    resolverTypes: [...RESOLVER_TYPES],
    targetModels: [...TARGET_MODELS],
    updatePolicies: [...UPDATE_POLICIES],
    identifierTypes: [...IDENTIFIER_TYPES],
    sourceTypes: [...SOURCE_TYPES],
    maxResolversPerIntegration: 2,
    maxTargetsPerIntegration: 10
  };
}

export function validateIntegrationCreatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid integration payload');
  }

  if (!hasValue(payload.name)) {
    throw createError('Integration name is required');
  }

  // Tracker integrations (trackable short link / QR code) never write to Odoo:
  // no Forminator form, no Odoo connection — but a destination_url is required instead.
  if (payload.source_type === 'tracker') {
    if (!hasValue(payload.destination_url)) {
      throw createError('Destination URL is required for tracker integrations');
    }
    return;
  }

  // generic_webhook integrations get a synthetic forminator_form_id generated server-side
  if (payload.source_type !== 'generic_webhook') {
    if (!hasValue(payload.forminator_form_id)) {
      throw createError('Forminator form is required');
    }
  }

  if (!hasValue(payload.odoo_connection_id)) {
    throw createError('Odoo connection is required');
  }
}

export function validateIntegrationUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid integration update payload');
  }

  if (payload.name !== undefined && !hasValue(payload.name)) {
    throw createError('Integration name cannot be empty');
  }

  if (payload.forminator_form_id !== undefined && !hasValue(payload.forminator_form_id)) {
    throw createError('Forminator form cannot be empty');
  }

  if (payload.odoo_connection_id !== undefined && !hasValue(payload.odoo_connection_id)) {
    throw createError('Odoo connection cannot be empty');
  }
}

export function validateResolverPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid resolver payload');
  }

  if (!RESOLVER_TYPES.includes(payload.resolver_type)) {
    throw createError('Resolver type is not allowed in MVP');
  }

  if (!hasValue(payload.input_source_field)) {
    throw createError('Resolver input field is required');
  }

  if (!hasValue(payload.output_context_key)) {
    throw createError('Resolver output key is required');
  }

  if (payload.resolver_type === 'webinar_by_external_id' && payload.create_if_missing === true) {
    throw createError('webinar_by_external_id cannot create missing records in MVP');
  }
}

export function validateTargetPayload(payload, { allowedModels } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid target payload');
  }

  // chatter_message targets only need an odoo_model — no whitelist, no identifier type, no update policy
  if (payload.operation_type === 'chatter_message') {
    if (!hasValue(payload.odoo_model)) {
      throw createError('chatter_message target vereist een odoo_model.');
    }
    return;
  }

  // create_activity targets only need an odoo_model (the res_model to attach the activity to)
  if (payload.operation_type === 'create_activity') {
    if (!hasValue(payload.odoo_model)) {
      throw createError('create_activity target vereist een odoo_model (het model waarop de activiteit wordt aangemaakt).');
    }
    return;
  }

  // mailing_list targets always write to mailing.contact — not part of the configurable model whitelist,
  // no identifier type / update policy choice (the composer UI fixes those to mapped_fields / always_overwrite)
  if (payload.operation_type === 'mailing_list') {
    if (!hasValue(payload.odoo_model)) {
      throw createError('mailing_list target vereist een odoo_model.');
    }
    return;
  }

  // send_mail: zet één gewone mail klaar in Odoo (mail.mail). Geen model-whitelist,
  // geen identifier_type en geen update_policy -- deze stap SCHRIJFT niets naar het
  // doelmodel, hij leest er alleen de eigenaar en het e-mailadres van.
  //
  // Wat hier WEL hard gecontroleerd wordt, is alles waarvan het stil misgaan pas
  // weken later opvalt: een onbekende layout, een negatieve vertraging, een
  // ontbrekende ontvangerbron, en opmaak in een mail die plat hoort te zijn.
  if (payload.operation_type === 'send_mail') {
    if (!hasValue(payload.odoo_model)) {
      throw createError('send_mail vereist een odoo_model (het record waaraan de mail hangt en waarvan de eigenaar de afzender wordt).');
    }

    const layout = payload.mail_layout === undefined ? 'plain' : String(payload.mail_layout);
    if (!MAIL_LAYOUTS.includes(layout)) {
      throw createError('Onbekende mail_layout: ' + layout + '. Toegestaan: ' + MAIL_LAYOUTS.join(', ') + '.');
    }

    if (!hasValue(payload.mail_subject_template)) {
      throw createError('send_mail vereist een onderwerp.');
    }
    if (!hasValue(payload.mail_recipient_source)) {
      throw createError('send_mail vereist een mail_recipient_source (welk formulierveld of welke stap het e-mailadres levert).');
    }

    if (payload.mail_delay_minutes !== undefined && payload.mail_delay_minutes !== null) {
      const vertraging = Number(payload.mail_delay_minutes);
      if (!Number.isInteger(vertraging) || vertraging < 0) {
        throw createError('mail_delay_minutes moet een geheel getal van 0 of meer zijn (0 = meteen versturen).');
      }
      // Een jaar. Niet omdat er een technische grens is, maar omdat een typefout
      // in dit veld anders een mail over 2039 klaarzet zonder dat iemand het ziet.
      if (vertraging > 525600) {
        throw createError('mail_delay_minutes is meer dan een jaar — dat is bijna zeker een typefout.');
      }
    }

    for (const veld of ['mail_window_start_min', 'mail_window_end_min']) {
      if (payload[veld] === undefined || payload[veld] === null) continue;
      const m = Number(payload[veld]);
      if (!Number.isInteger(m) || m < 0 || m > 1440) {
        throw createError(veld + ' moet een geheel getal tussen 0 en 1440 zijn (minuten sinds middernacht).');
      }
    }

    if (layout === 'plain') {
      if (!hasValue(payload.mail_body_html)) {
        throw createError('send_mail vereist een mailtekst.');
      }
      const vuil = nietPlatteOpmaak(payload.mail_body_html);
      if (vuil.length) {
        throw createError(
          'De tekst bevat opmaak die niet in een platte mail hoort: ' + vuil.join(', ') +
          '. Haal die weg, of zet de stap op layout "blocks".'
        );
      }
    } else if (!Array.isArray(payload.mail_blocks) || payload.mail_blocks.length === 0) {
      throw createError('send_mail met layout "blocks" vereist mail_blocks.');
    }

    return;
  }

  // search: record opzoeken op een ander model, niets schrijven. Geen model-whitelist
  // (elk model mag doorzocht worden) en geen update_policy -- deze stap schrijft niets.
  if (payload.operation_type === 'search') {
    if (!hasValue(payload.odoo_model)) {
      throw createError('search vereist een odoo_model (het model waarop gezocht wordt).');
    }
    if (payload.identifier_type !== 'mapped_fields') {
      throw createError('search vereist identifier_type "mapped_fields" -- de andere identifier-types zijn schrijfmodel-specifiek.');
    }
    if (payload.search_on_not_found !== undefined && payload.search_on_not_found !== null) {
      const allowedNotFound = ['abort', 'skip_step', 'continue_empty'];
      if (!allowedNotFound.includes(payload.search_on_not_found)) {
        throw createError('search_on_not_found is niet toegestaan: ' + payload.search_on_not_found + '. Toegestaan: ' + allowedNotFound.join(', ') + '.');
      }
    }
    return;
  }

  // Use caller-supplied allowedModels (from DB) when available, else fall back to static list
  const modelList = (Array.isArray(allowedModels) && allowedModels.length)
    ? allowedModels
    : TARGET_MODELS;
  if (!modelList.includes(payload.odoo_model)) {
    throw createError('Target model is not allowed: ' + payload.odoo_model);
  }

  if (!IDENTIFIER_TYPES.includes(payload.identifier_type)) {
    throw createError('Identifier type is not allowed in MVP');
  }

  const effectiveUpdatePolicy = payload.update_policy || payload.operation_type;
  if (!UPDATE_POLICIES.includes(effectiveUpdatePolicy)) {
    throw createError('Update policy is not allowed in MVP');
  }

  if (payload.identifier_type !== 'mapped_fields') {
    if (payload.odoo_model === 'crm.lead' && payload.identifier_type !== 'single_email') {
      throw createError('crm.lead requires single_email or mapped_fields identifier');
    }

    if (payload.odoo_model === 'res.partner' && payload.identifier_type !== 'single_email') {
      throw createError('res.partner requires single_email or mapped_fields identifier');
    }

    if (payload.odoo_model === 'x_webinarregistrations' && payload.identifier_type !== 'registration_composite') {
      throw createError('x_webinarregistrations requires registration_composite or mapped_fields identifier');
    }
  }
}

export function validateMappingPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid mapping payload');
  }

  if (!hasValue(payload.odoo_field)) {
    throw createError('Odoo field is required');
  }

  if (!SOURCE_TYPES.includes(payload.source_type)) {
    throw createError('Mapping source type is not allowed in MVP');
  }

  if (!hasValue(payload.source_value)) {
    throw createError('Mapping source value is required');
  }
}

function hasMapping(mappings, fieldName) {
  return (mappings || []).some((mapping) => mapping.odoo_field === fieldName);
}

export function validateRequiredMappingsForTarget(target, mappings) {
  if (!target) {
    throw createError('Target not found');
  }

  if (target.odoo_model === 'crm.lead' && !hasMapping(mappings, 'email_from')) {
    throw createError('crm.lead requires mapping for email_from');
  }

  if (target.odoo_model === 'x_webinarregistrations') {
    if (!hasMapping(mappings, 'partner_id')) {
      throw createError('x_webinarregistrations requires mapping for partner_id');
    }
    if (!hasMapping(mappings, 'webinar_id')) {
      throw createError('x_webinarregistrations requires mapping for webinar_id');
    }
  }
}

export function validateActivationReadiness(bundle, hasSuccessfulTest) {
  if (!bundle?.integration) {
    throw createError('Integration does not exist', 'NOT_FOUND');
  }

  const resolvers = bundle.resolvers || [];
  const targets = bundle.targets || [];

  if (targets.length < 1) {
    throw createError('At least one schrijfdoel is required before activation');
  }

  const resolverTypeSet = new Set();
  for (const resolver of resolvers) {
    validateResolverPayload(resolver);
    if (resolverTypeSet.has(resolver.resolver_type)) {
      throw createError('Duplicate resolver type is not allowed in MVP');
    }
    resolverTypeSet.add(resolver.resolver_type);
  }

  for (const target of targets) {
    validateTargetPayload(target);
    const targetMappings = bundle.mappingsByTarget?.[target.id] || [];

    // Een search-stap zonder identifier zoekt op een leeg domein -- dat faalt pas
    // stil bij de eerste inzending. Dit is de enige harde blokkade voor activatie.
    if (target.operation_type === 'search' && !targetMappings.some((m) => m.is_identifier)) {
      throw createError(`Zoek-stap "${target.label || target.odoo_model}" heeft geen enkel identifierveld gemarkeerd -- activeren zou de stap stil laten mislukken.`);
    }

    if (targetMappings.length < 1) {
      console.warn(`[activation] Target ${target.odoo_model} has no mappings — activating anyway`);
    } else {
      try { validateRequiredMappingsForTarget(target, targetMappings); }
      catch (e) { console.warn('[activation] Required mapping check skipped:', e.message); }
    }
  }

  if (!hasSuccessfulTest) {
    console.warn('[activation] No successful test submission yet — activating anyway');
  }
}
