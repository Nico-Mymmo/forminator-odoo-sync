const RESOLVER_TYPES = ['partner_by_email', 'webinar_by_external_id'];
const TARGET_MODELS = ['crm.lead', 'res.partner', 'x_webinarregistrations'];
const UPDATE_POLICIES = ['always_overwrite', 'only_if_incoming_non_empty', 'upsert'];
const IDENTIFIER_TYPES = ['single_email', 'partner_context', 'registration_composite', 'mapped_fields', 'odoo_id'];
const SOURCE_TYPES = ['form', 'context', 'static', 'template', 'previous_step_output'];

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
    maxTargetsPerIntegration: 2
  };
}

export function validateIntegrationCreatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid integration payload');
  }

  if (!hasValue(payload.name)) {
    throw createError('Integration name is required');
  }

  if (!hasValue(payload.forminator_form_id)) {
    throw createError('Forminator form is required');
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

export function validateTargetPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createError('Invalid target payload');
  }

  if (!TARGET_MODELS.includes(payload.odoo_model)) {
    throw createError('Target model is not allowed in MVP');
  }

  if (!IDENTIFIER_TYPES.includes(payload.identifier_type)) {
    throw createError('Identifier type is not allowed in MVP');
  }

  if (!UPDATE_POLICIES.includes(payload.update_policy)) {
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

  if (resolvers.length < 1) {
    throw createError('At least one herkenning is required before activation');
  }

  if (resolvers.length > 2) {
    throw createError('MVP allows maximum two herkenningen per integratie');
  }

  if (targets.length < 1) {
    throw createError('At least one schrijfdoel is required before activation');
  }

  if (targets.length > 2) {
    throw createError('MVP allows maximum two schrijfdoelen per integratie');
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

    if (targetMappings.length < 1) {
      throw createError(`Target ${target.odoo_model} requires at least one mapping`);
    }

    validateRequiredMappingsForTarget(target, targetMappings);
  }

  if (!hasSuccessfulTest) {
    throw createError('Activation blocked: run a successful test first');
  }
}
