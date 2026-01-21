/**
 * Schema-Driven Preset Generator
 * 
 * Generates starter queries by analyzing SchemaSnapshot + ModelCapabilities.
 * 100% generic, heuristic-based, zero hardcoded fields or models.
 * 
 * RULES:
 * - All detection is schema-driven
 * - Every preset validated through existing validator
 * - Invalid presets discarded (never auto-fixed)
 * - Respects capability limits
 * - No execution, no optimization, just definitions
 */

import { validateQuery, assessQueryComplexity } from './query-validator.js';

/**
 * @typedef {Object} PresetQuery
 * @property {string} id - Deterministic hash
 * @property {string} name - Human readable
 * @property {string} description - Explains insight
 * @property {PresetCategory} category
 * @property {string} base_model
 * @property {QueryDefinition} query
 * @property {string} reasoning - Why this is interesting
 * @property {'simple'|'moderate'|'complex'} complexity_hint
 */

/**
 * @typedef {'overview'|'trend'|'segmentation'|'distribution'|'activity'|'risk'} PresetCategory
 */

/**
 * @typedef {Object} FieldRole
 * @property {string} field_name
 * @property {string} field_type
 * @property {boolean} required
 * @property {any} field_meta - Full field metadata from schema
 */

/**
 * @typedef {Object} ModelAnalysis
 * @property {string} model_name
 * @property {FieldRole[]} identifiers
 * @property {FieldRole[]} temporal
 * @property {FieldRole[]} numeric
 * @property {FieldRole[]} categorical
 * @property {FieldRole[]} status_like
 * @property {FieldRole[]} relational
 */

/**
 * Generate preset queries from schema analysis
 * 
 * @param {SchemaSnapshot} schema
 * @param {Record<string, ModelCapabilities>} capabilities
 * @returns {PresetQuery[]}
 */
export function generatePresetQueries(schema, capabilities) {
  const presets = [];
  const stats = { generated: 0, accepted: 0, rejected: 0, reasons: {} };

  // Step 1: Detect candidate models
  const candidateModels = detectCandidateModels(schema, capabilities);

  // Step 2: Analyze each candidate
  for (const modelName of candidateModels) {
    const modelAnalysis = analyzeModel(schema, modelName);
    const modelCaps = capabilities[modelName];

    // Step 3: Apply preset patterns
    const patterns = [
      ...generateOverviewPresets(modelName, modelAnalysis, modelCaps, schema, capabilities),
      ...generateTrendPresets(modelName, modelAnalysis, modelCaps, schema, capabilities),
      ...generateSegmentationPresets(modelName, modelAnalysis, modelCaps, schema, capabilities),
      ...generateActivityPresets(modelName, modelAnalysis, modelCaps, schema, capabilities),
      ...generateRiskPresets(modelName, modelAnalysis, modelCaps, schema, capabilities)
    ];

    // Step 5: Validation loop (MANDATORY)
    for (const preset of patterns) {
      stats.generated++;

      const validation = validateQuery(preset.query, schema, capabilities);

      if (!validation.valid) {
        stats.rejected++;
        const reason = validation.errors[0]?.message || 'validation_failed';
        stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
        continue; // Discard invalid preset
      }

      // Check complexity
      const complexity = assessQueryComplexity(preset.query, capabilities);
      preset.complexity_hint = complexity.guidance_level;

      // Accept preset
      stats.accepted++;
      presets.push(preset);
    }
  }

  // Log generation statistics (for debugging/monitoring)
  console.log('[Preset Generator]', stats);

  return presets;
}

/**
 * Step 1: Detect Candidate Models
 * 
 * A model is eligible if:
 * - supports_search = true
 * - estimated_record_count > 0
 * - not a system/technical model
 * - has ≥ 3 fields usable for analysis
 */
function detectCandidateModels(schema, capabilities) {
  const candidates = [];

  for (const [modelName, modelSchema] of Object.entries(schema.models)) {
    const caps = capabilities[modelName];

    // Must support search
    if (!caps?.supports_search) continue;

    // Must have records (estimated)
    if (caps.estimated_record_count === 0) continue;

    // Skip system/technical models (heuristic: starts with underscore or has "base" in name)
    if (modelName.startsWith('_') || modelName.startsWith('base.')) continue;

    // Must have usable fields (at least 3)
    const usableFields = Object.values(modelSchema).filter(f => 
      f.type && !f.readonly && f.store !== false
    );
    if (usableFields.length < 3) continue;

    candidates.push(modelName);
  }

  return candidates;
}

/**
 * Step 2: Analyze Model - Detect Field Roles
 * 
 * Heuristic-based role detection:
 * - Identifier: char/text + required
 * - Temporal: date/datetime
 * - Numeric: integer/float/monetary
 * - Categorical: selection, many2one
 * - Status-like: selection with likely low cardinality
 * - Relational: many2one, one2many, many2many
 */
function analyzeModel(schema, modelName) {
  const modelSchema = schema.models[modelName];
  const analysis = {
    model_name: modelName,
    identifiers: [],
    temporal: [],
    numeric: [],
    categorical: [],
    status_like: [],
    relational: []
  };

  for (const [fieldName, fieldMeta] of Object.entries(modelSchema)) {
    const fieldType = fieldMeta.type;
    const required = fieldMeta.required || false;

    // Skip computed/function fields without store
    if (fieldMeta.store === false) continue;

    const role = {
      field_name: fieldName,
      field_type: fieldType,
      required,
      field_meta: fieldMeta
    };

    // Identifier: char/text + required
    if ((fieldType === 'char' || fieldType === 'text') && required) {
      analysis.identifiers.push(role);
    }

    // Temporal: date/datetime
    if (fieldType === 'date' || fieldType === 'datetime') {
      analysis.temporal.push(role);
    }

    // Numeric: integer/float/monetary
    if (fieldType === 'integer' || fieldType === 'float' || fieldType === 'monetary') {
      analysis.numeric.push(role);
    }

    // Categorical: selection or many2one
    if (fieldType === 'selection' || fieldType === 'many2one') {
      analysis.categorical.push(role);
      
      // Status-like: selection fields (heuristic: likely enum-like)
      if (fieldType === 'selection') {
        analysis.status_like.push(role);
      }
    }

    // Relational: many2one, one2many, many2many
    if (fieldType === 'many2one' || fieldType === 'one2many' || fieldType === 'many2many') {
      analysis.relational.push(role);
    }
  }

  return analysis;
}

/**
 * Pattern 1: Overview (Distribution)
 * Count records grouped by categorical field
 */
function generateOverviewPresets(modelName, analysis, capabilities, schema, allCapabilities) {
  const presets = [];

  // Only if read_group supported
  if (!capabilities.supports_read_group) return presets;

  // Limit to max_group_by_fields
  const maxGroupBy = capabilities.max_group_by_fields || 3;

  // Try each categorical field
  for (const catField of analysis.categorical.slice(0, maxGroupBy)) {
    const query = {
      base_model: modelName,
      fields: [
        { model: modelName, field: catField.field_name, alias: formatFieldName(catField.field_name) }
      ],
      aggregations: [
        {
          function: 'count',
          alias: 'Count',
          group_by: [catField.field_name]
        }
      ],
      filters: [],
      relations: [],
      sorting: [],
      limit: 100
    };

    const preset = {
      id: generatePresetId(query),
      name: `Distribution by ${formatFieldName(catField.field_name)}`,
      description: `Count of records grouped by ${formatFieldName(catField.field_name)}`,
      category: 'distribution',
      base_model: modelName,
      query,
      reasoning: `Provides overview of record distribution across ${catField.field_type} field`,
      complexity_hint: 'simple'
    };

    presets.push(preset);
  }

  return presets;
}

/**
 * Pattern 2: Trend
 * Count or sum over time with time_scope
 */
function generateTrendPresets(modelName, analysis, capabilities, schema, allCapabilities) {
  const presets = [];

  // Requires temporal field
  if (analysis.temporal.length === 0) return presets;

  // Use first temporal field
  const timeField = analysis.temporal[0];

  // Trend 1: Record count over time (last 90 days)
  const countQuery = {
    base_model: modelName,
    fields: [],
    aggregations: [
      {
        function: 'count',
        alias: 'Count'
      }
    ],
    filters: [],
    relations: [],
    sorting: [],
    time_scope: {
      field: timeField.field_name,
      mode: 'relative',
      period: 'last_90_days'
    },
    limit: 1000
  };

  presets.push({
    id: generatePresetId(countQuery),
    name: `Record Trend (Last 90 Days)`,
    description: `Count of records created in the last 90 days based on ${formatFieldName(timeField.field_name)}`,
    category: 'trend',
    base_model: modelName,
    query: countQuery,
    reasoning: `Shows activity trend using temporal field ${timeField.field_name}`,
    complexity_hint: 'simple'
  });

  // Trend 2: If numeric field exists, sum over time
  if (analysis.numeric.length > 0 && capabilities.supports_read_group) {
    const numField = analysis.numeric[0];

    const sumQuery = {
      base_model: modelName,
      fields: [],
      aggregations: [
        {
          function: 'sum',
          field: numField.field_name,
          alias: `Total ${formatFieldName(numField.field_name)}`
        }
      ],
      filters: [],
      relations: [],
      sorting: [],
      time_scope: {
        field: timeField.field_name,
        mode: 'relative',
        period: 'last_90_days'
      },
      limit: 1000
    };

    presets.push({
      id: generatePresetId(sumQuery),
      name: `${formatFieldName(numField.field_name)} Trend (Last 90 Days)`,
      description: `Sum of ${formatFieldName(numField.field_name)} over the last 90 days`,
      category: 'trend',
      base_model: modelName,
      query: sumQuery,
      reasoning: `Shows numeric trend for ${numField.field_name} field`,
      complexity_hint: 'simple'
    });
  }

  return presets;
}

/**
 * Pattern 3: Segmentation
 * Numeric aggregate grouped by category
 */
function generateSegmentationPresets(modelName, analysis, capabilities, schema, allCapabilities) {
  const presets = [];

  // Only if read_group supported
  if (!capabilities.supports_read_group) return presets;

  // Requires both numeric and categorical fields
  if (analysis.numeric.length === 0 || analysis.categorical.length === 0) return presets;

  const numField = analysis.numeric[0];
  const catField = analysis.categorical[0];

  // Respect max_group_by_fields
  const maxGroupBy = capabilities.max_group_by_fields || 3;
  if (maxGroupBy < 1) return presets;

  const query = {
    base_model: modelName,
    fields: [
      { model: modelName, field: catField.field_name, alias: formatFieldName(catField.field_name) }
    ],
    aggregations: [
      {
        function: 'sum',
        field: numField.field_name,
        alias: `Total ${formatFieldName(numField.field_name)}`,
        group_by: [catField.field_name]
      },
      {
        function: 'count',
        alias: 'Count',
        group_by: [catField.field_name]
      }
    ],
    filters: [],
    relations: [],
    sorting: [],
    limit: 100
  };

  presets.push({
    id: generatePresetId(query),
    name: `${formatFieldName(numField.field_name)} by ${formatFieldName(catField.field_name)}`,
    description: `Sum and count of ${formatFieldName(numField.field_name)} grouped by ${formatFieldName(catField.field_name)}`,
    category: 'segmentation',
    base_model: modelName,
    query,
    reasoning: `Segments numeric data by categorical dimension`,
    complexity_hint: 'simple'
  });

  return presets;
}

/**
 * Pattern 4: Activity / Relation
 * One relation traversal with count/exists aggregation
 */
function generateActivityPresets(modelName, analysis, capabilities, schema, allCapabilities) {
  const presets = [];

  // Requires relational fields
  if (analysis.relational.length === 0) return presets;

  // Respect max_relation_depth
  const maxDepth = capabilities.max_relation_depth || 0;
  if (maxDepth < 1) return presets;

  // Try first one2many or many2many relation (activity-like)
  for (const relField of analysis.relational) {
    if (relField.field_type !== 'one2many' && relField.field_type !== 'many2many') continue;

    const targetModel = relField.field_meta.relation;
    if (!targetModel) continue;

    // Verify target model exists in schema
    if (!schema.models[targetModel]) continue;

    // Build relation traversal
    const relationPath = [{
      from_model: modelName,
      relation_field: relField.field_name,
      target_model: targetModel,
      relation_type: relField.field_type
    }];

    const query = {
      base_model: modelName,
      fields: [
        { model: modelName, field: 'id', alias: 'ID' }
      ],
      aggregations: [],
      filters: [],
      relations: [
        {
          alias: formatFieldName(relField.field_name),
          path: relationPath,
          aggregation: 'count'
        }
      ],
      sorting: [],
      limit: 50
    };

    presets.push({
      id: generatePresetId(query),
      name: `Records with Related ${formatFieldName(relField.field_name)}`,
      description: `List of records with count of related ${formatFieldName(relField.field_name)}`,
      category: 'activity',
      base_model: modelName,
      query,
      reasoning: `Shows relationship activity via ${relField.field_type} field`,
      complexity_hint: 'moderate'
    });

    // Only generate one activity preset per model
    break;
  }

  return presets;
}

/**
 * Pattern 5: Risk / Outlier
 * Stale records, missing relations, low activity
 */
function generateRiskPresets(modelName, analysis, capabilities, schema, allCapabilities) {
  const presets = [];

  // Risk 1: Stale records (temporal field older than 90 days)
  if (analysis.temporal.length > 0) {
    const timeField = analysis.temporal[0];

    const staleQuery = {
      base_model: modelName,
      fields: [
        { model: modelName, field: timeField.field_name, alias: formatFieldName(timeField.field_name) }
      ],
      aggregations: [],
      filters: [],
      relations: [],
      sorting: [
        { field: timeField.field_name, direction: 'asc' }
      ],
      time_scope: {
        field: timeField.field_name,
        mode: 'relative',
        period: { value: 90, unit: 'days', direction: 'past' },
        comparison: 'before'
      },
      limit: 50
    };

    presets.push({
      id: generatePresetId(staleQuery),
      name: `Stale Records (>90 Days)`,
      description: `Records with ${formatFieldName(timeField.field_name)} older than 90 days`,
      category: 'risk',
      base_model: modelName,
      query: staleQuery,
      reasoning: `Identifies potentially outdated records`,
      complexity_hint: 'simple'
    });
  }

  // Risk 2: Missing relation (many2one not set)
  for (const relField of analysis.relational) {
    if (relField.field_type !== 'many2one') continue;
    if (relField.required) continue; // Skip required fields

    const missingQuery = {
      base_model: modelName,
      fields: [
        { model: modelName, field: relField.field_name, alias: formatFieldName(relField.field_name) }
      ],
      aggregations: [],
      filters: [
        {
          model: modelName,
          field: relField.field_name,
          operator: 'is not set'
        }
      ],
      relations: [],
      sorting: [],
      limit: 50
    };

    presets.push({
      id: generatePresetId(missingQuery),
      name: `Records Missing ${formatFieldName(relField.field_name)}`,
      description: `Records where ${formatFieldName(relField.field_name)} is not set`,
      category: 'risk',
      base_model: modelName,
      query: missingQuery,
      reasoning: `Identifies incomplete records with missing relation`,
      complexity_hint: 'simple'
    });

    // Only one missing relation preset per model
    break;
  }

  return presets;
}

/**
 * Generate deterministic preset ID from query definition
 */
function generatePresetId(query) {
  const content = JSON.stringify({
    base_model: query.base_model,
    fields: query.fields,
    aggregations: query.aggregations,
    filters: query.filters,
    relations: query.relations,
    time_scope: query.time_scope
  });

  // Simple deterministic hash (djb2 algorithm)
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to hex string (16 chars)
  return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
}

/**
 * Format field name for human readability
 * Examples: "expected_revenue" -> "Expected Revenue"
 */
function formatFieldName(fieldName) {
  return fieldName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
