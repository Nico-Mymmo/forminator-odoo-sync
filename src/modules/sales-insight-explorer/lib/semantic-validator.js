/**
 * Semantic Validator
 * 
 * Validates semantic queries volgens constraints gedefinieerd in semantic layers.
 * Implementeert alle blokkerende combinaties uit ITERATION_8_IMPLEMENTATION.md Section C.
 * 
 * @module lib/semantic-validator
 */

import { SEMANTIC_LAYERS } from '../config/semantic-layers.js';
import { isPresentationModeAvailable } from '../config/presentation-modes.js';

/**
 * @typedef {Object} SemanticValidationResult
 * @property {boolean} valid
 * @property {string} [code] - Error code
 * @property {string} [message] - User-facing error message
 * @property {string} [explanation] - Detailed explanation
 * @property {Array<string>} [suggestions] - Suggested actions
 */

/**
 * @typedef {Object} SemanticQuery
 * @property {string} layer_id - Selected semantic layer
 * @property {string} [sub_option] - Selected sub-option within layer
 * @property {Object} context - Context filters
 * @property {Object} presentation - Presentation mode
 * @property {Object} [aggregation] - Aggregation config
 * @property {Array<string>} [fields] - Selected fields
 */

/**
 * Validate layer combination
 */
export function validateLayerCombination(layer1Id, layer3Type) {
  const layer1 = SEMANTIC_LAYERS[layer1Id];
  if (!layer1) {
    return {
      valid: false,
      code: 'INVALID_LAYER',
      message: 'Ongeldige semantic layer',
      explanation: `Layer '${layer1Id}' bestaat niet`
    };
  }

  // Check if presentation mode is available for this layer
  if (!isPresentationModeAvailable(layer3Type, layer1Id)) {
    const reasons = {
      trend: 'Categorische data kan niet als trend getoond worden',
      top_bottom: 'Vereist numerieke velden of COUNT aggregatie'
    };

    return {
      valid: false,
      code: 'INCOMPATIBLE_PRESENTATION',
      message: `${layer3Type} is niet beschikbaar voor ${layer1.label}`,
      explanation: reasons[layer3Type] || 'Incompatibele combinatie',
      suggestions: getAlternativePresentations(layer1Id)
    };
  }

  return { valid: true };
}

/**
 * Validate mandatory fields
 */
export function validateMandatoryFields(layerId, query) {
  const layer = SEMANTIC_LAYERS[layerId];
  if (!layer) {
    return { valid: false, message: 'Invalid layer' };
  }

  const missingFields = [];
  
  for (const mandatoryField of layer.mandatory_fields) {
    if (!query.fields || !query.fields.includes(mandatoryField)) {
      missingFields.push(mandatoryField);
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      code: 'MISSING_MANDATORY_FIELDS',
      message: `Verplichte velden ontbreken: ${missingFields.join(', ')}`,
      explanation: 'Deze velden zijn essentieel voor semantische correctheid',
      auto_fix: missingFields // Will be auto-added
    };
  }

  return { valid: true };
}

/**
 * Check incompatibilities
 */
export function checkIncompatibilities(selectedLayers) {
  if (selectedLayers.length < 2) {
    return { valid: true };
  }

  for (let i = 0; i < selectedLayers.length; i++) {
    const layer1 = SEMANTIC_LAYERS[selectedLayers[i]];
    if (!layer1) continue;

    for (let j = i + 1; j < selectedLayers.length; j++) {
      const layer2Id = selectedLayers[j];
      
      if (layer1.incompatible_with.includes(layer2Id)) {
        const layer2 = SEMANTIC_LAYERS[layer2Id];
        return {
          valid: false,
          code: 'INCOMPATIBLE_LAYERS',
          message: `${layer1.label} en ${layer2.label} kunnen niet gecombineerd worden`,
          explanation: getIncompatibilityReason(layer1.id, layer2Id),
          suggestions: [
            `Maak twee aparte queries`,
            `Gebruik ${layer1.label} als primair en ${layer2.label} als filter`,
            `Gebruik "Vergelijken" modus als alternatief`
          ]
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate complete semantic query
 */
export function validateSemanticQuery(semanticQuery) {
  const { layer_id, sub_option, context, presentation, aggregation, fields } = semanticQuery;

  // 1. Layer exists
  const layer = SEMANTIC_LAYERS[layer_id];
  if (!layer) {
    return {
      valid: false,
      code: 'INVALID_LAYER',
      message: 'Ongeldige semantic layer'
    };
  }

  // 2. Run layer-specific validation
  const layerValidation = layer.validate(semanticQuery);
  if (!layerValidation.valid) {
    return layerValidation;
  }

  // 3. Validate layer + presentation combination
  if (presentation && presentation.type) {
    const combinationValidation = validateLayerCombination(layer_id, presentation.type);
    if (!combinationValidation.valid) {
      return combinationValidation;
    }
  }

  // 4. Validate mandatory fields - skip for now, translator handles base fields via schema
  // Mandatory fields are layer-specific and should be resolved via schema, not hardcoded
  // const fieldsValidation = validateMandatoryFields(layer_id, { fields });
  // if (!fieldsValidation.valid) {
  //   ...
  // }

  // 5. Check specific blokkades
  const blockadeCheck = checkSpecificBlockades(semanticQuery);
  if (!blockadeCheck.valid) {
    return blockadeCheck;
  }

  // 6. Validate lead enrichment if present
  if (semanticQuery.lead_enrichment) {
    const leadEnrichmentValidation = validateLeadEnrichment(semanticQuery.lead_enrichment);
    if (!leadEnrichmentValidation.valid) {
      return leadEnrichmentValidation;
    }
  }

  return { valid: true };
}

/**
 * Check specific blokkades uit ITERATION_8_IMPLEMENTATION Section C
 */
function checkSpecificBlockades(query) {
  const { layer_id, presentation, aggregation, fields } = query;

  // Blokkade 1: Pain Points zonder Score
  if (layer_id === 'pain_points' && (!fields || !fields.includes('x_action_sheet_pain_points.score'))) {
    return {
      valid: false,
      code: 'PAIN_POINTS_REQUIRE_SCORE',
      message: 'Pijnpunten kunnen niet zonder score getoond worden',
      explanation: 'Score is kerngegevens. Een pain point zonder score is een lege naam.',
      auto_fix: ['x_action_sheet_pain_points.score']
    };
  }

  // Blokkade 2: Meetings zonder Datum
  if (layer_id === 'meeting_evolution' && (!fields || !fields.includes('x_as_meetings.x_date'))) {
    return {
      valid: false,
      code: 'MEETINGS_REQUIRE_DATE',
      message: 'Meeting-analyse vereist datum-informatie',
      explanation: 'Meetings zijn temporele gebeurtenissen. Zonder tijd is er geen context.',
      auto_fix: ['x_as_meetings.x_date']
    };
  }

  // Blokkade 3: Meetings + Stage Groepering
  if (layer_id === 'meeting_evolution' && presentation?.group_by?.startsWith('x_support_stage')) {
    return {
      valid: false,
      code: 'TEMPORAL_CATEGORICAL_CONFLICT',
      message: 'Meeting-evolutie kan niet gegroepeerd worden per fase',
      explanation: 'Meetings zijn temporeel (tijd), Stages zijn categorisch (status). Dit zijn orthogonale dimensies.',
      suggestions: [
        'Filter op een specifieke fase en analyseer meetings daarbinnen',
        'Maak twee aparte queries: één voor meetings, één voor stages',
        'Gebruik "Voor/na conversie" voor temporele vergelijking'
      ]
    };
  }

  // Blokkade 4: Stage Distribution + Temporal Filters
  if (layer_id === 'stage_distribution' && presentation?.type === 'trend') {
    return {
      valid: false,
      code: 'CATEGORICAL_NO_TREND',
      message: 'Fase-verdeling kan niet als trend getoond worden',
      explanation: 'Stages zijn categorisch (status op moment X), geen tijdsreeks',
      suggestions: [
        'Gebruik "Groeperen per fase" voor verdeling',
        'Kies "Meeting-evolutie" voor temporele analyse',
        'Maak een snapshot per periode (aparte queries)'
      ]
    };
  }

  // Blokkade 9: Aggregatie zonder Groepering (auto-correct)
  if (aggregation && aggregation.function !== 'summary' && !presentation?.group_by) {
    // Auto-add default group_by
    const defaultGroupBy = getDefaultGroupBy(layer_id);
    if (defaultGroupBy) {
      query.presentation = query.presentation || {};
      query.presentation.group_by = defaultGroupBy;
      console.log(`Auto-fixed: Added default group_by ${defaultGroupBy}`);
    }
  }

  return { valid: true };
}

/**
 * Get incompatibility reason
 */
function getIncompatibilityReason(layer1Id, layer2Id) {
  const reasons = {
    'meeting_evolution_stage_distribution': 'Meetings zijn temporeel, stages zijn categorisch - orthogonale dimensies',
    'pain_points_stage_distribution': 'Metrics (met score) en categorieën kunnen niet gecombineerd worden'
  };

  const key = `${layer1Id}_${layer2Id}`;
  return reasons[key] || reasons[`${layer2Id}_${layer1Id}`] || 'Semantisch incompatibel';
}

/**
 * Get alternative presentations for layer
 */
function getAlternativePresentations(layerId) {
  const alternatives = {
    stage_distribution: ['Groeperen per fase', 'Vergelijken (won vs lost)'],
    building_context: ['Groeperen per type', 'Top 10'],
    pain_points: ['Groeperen', 'Top 10', 'Samenvatten']
  };

  return alternatives[layerId] || ['Groeperen', 'Vergelijken'];
}

/**
 * Get default group_by for layer
 */
function getDefaultGroupBy(layerId) {
  const defaults = {
    pain_points: 'x_user_painpoints.name',
    meeting_evolution: 'name',
    stage_distribution: 'x_support_stage.name',
    building_context: 'x_studio_for_company_id.customer_type',
    sales_outcome: 'x_support_stage.x_stage_type'
  };

  return defaults[layerId];
}

/**
 * Semantic Error class
 */
export class SemanticError extends Error {
  constructor(validation) {
    super(validation.message);
    this.code = validation.code;
    this.explanation = validation.explanation;
    this.suggestions = validation.suggestions;
  }
}

/**
 * Validate lead enrichment configuration
 * 
 * Validates the lead_enrichment payload structure according to
 * two-phase set operations specification.
 * 
 * @param {Object} leadEnrichment - Lead enrichment configuration
 * @returns {SemanticValidationResult}
 */
export function validateLeadEnrichment(leadEnrichment) {
  // Validate enabled field
  if (typeof leadEnrichment.enabled !== 'boolean') {
    return {
      valid: false,
      code: 'INVALID_LEAD_ENRICHMENT_ENABLED',
      message: 'lead_enrichment.enabled must be a boolean',
      explanation: 'The enabled field must be true or false'
    };
  }

  // If not enabled, no further validation needed
  if (!leadEnrichment.enabled) {
    return { valid: true };
  }

  // Validate mode field
  const validModes = ['include', 'exclude', 'only_without_lead'];
  if (!validModes.includes(leadEnrichment.mode)) {
    return {
      valid: false,
      code: 'INVALID_LEAD_ENRICHMENT_MODE',
      message: `lead_enrichment.mode must be one of: ${validModes.join(', ')}`,
      explanation: `Got: ${leadEnrichment.mode}`,
      suggestions: ['Use "include" for enrichment only', 'Use "exclude" for filtering to only records with leads', 'Use "only_without_lead" for filtering to only records without leads']
    };
  }

  // Validate filters object (optional)
  if (leadEnrichment.filters) {
    const filters = leadEnrichment.filters;

    // Validate stage_ids
    if (filters.stage_ids !== undefined) {
      if (!Array.isArray(filters.stage_ids)) {
        return {
          valid: false,
          code: 'INVALID_STAGE_IDS',
          message: 'lead_enrichment.filters.stage_ids must be an array',
          explanation: `Got: ${typeof filters.stage_ids}`
        };
      }

      if (!filters.stage_ids.every(id => Number.isInteger(id))) {
        return {
          valid: false,
          code: 'INVALID_STAGE_IDS',
          message: 'lead_enrichment.filters.stage_ids must contain only integers',
          explanation: 'Stage IDs must be numeric Odoo record IDs'
        };
      }
    }

    // Validate won_status
    if (filters.won_status !== undefined) {
      if (!Array.isArray(filters.won_status)) {
        return {
          valid: false,
          code: 'INVALID_WON_STATUS',
          message: 'lead_enrichment.filters.won_status must be an array',
          explanation: `Got: ${typeof filters.won_status}`
        };
      }

      const validStatuses = ['won', 'lost', 'pending'];
      for (const status of filters.won_status) {
        if (!validStatuses.includes(status)) {
          return {
            valid: false,
            code: 'INVALID_WON_STATUS',
            message: `lead_enrichment.filters.won_status contains invalid value: ${status}`,
            explanation: `Valid values are: ${validStatuses.join(', ')}`
          };
        }
      }
    }

    // Check for unknown keys
    const allowedKeys = ['stage_ids', 'won_status'];
    const unknownKeys = Object.keys(filters).filter(key => !allowedKeys.includes(key));
    if (unknownKeys.length > 0) {
      return {
        valid: false,
        code: 'UNKNOWN_LEAD_FILTER_KEYS',
        message: `Unknown keys in lead_enrichment.filters: ${unknownKeys.join(', ')}`,
        explanation: `Allowed keys are: ${allowedKeys.join(', ')}`
      };
    }
  }

  // Check for unknown keys in lead_enrichment
  const allowedTopKeys = ['enabled', 'mode', 'filters', 'property_groups'];
  const unknownTopKeys = Object.keys(leadEnrichment).filter(key => !allowedTopKeys.includes(key));
  if (unknownTopKeys.length > 0) {
    return {
      valid: false,
      code: 'UNKNOWN_LEAD_ENRICHMENT_KEYS',
      message: `Unknown keys in lead_enrichment: ${unknownTopKeys.join(', ')}`,
      explanation: `Allowed keys are: ${allowedTopKeys.join(', ')}`
    };
  }

  // Validate property_groups
  if (leadEnrichment.property_groups !== undefined) {
    if (!Array.isArray(leadEnrichment.property_groups)) {
      return {
        valid: false,
        code: 'INVALID_PROPERTY_GROUPS',
        message: 'lead_enrichment.property_groups must be an array',
        explanation: `Got: ${typeof leadEnrichment.property_groups}`
      };
    }

    const validGroups = ['time_flow', 'origin_marketing', 'business_signals'];
    for (const group of leadEnrichment.property_groups) {
      if (!validGroups.includes(group)) {
        return {
          valid: false,
          code: 'INVALID_PROPERTY_GROUP',
          message: `lead_enrichment.property_groups contains invalid value: ${group}`,
          explanation: `Valid values are: ${validGroups.join(', ')}. Note: status_outcome is always enabled.`
        };
      }
    }
  }

  return { valid: true };
}
