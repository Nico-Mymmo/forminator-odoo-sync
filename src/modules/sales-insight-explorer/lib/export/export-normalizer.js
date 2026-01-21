/**
 * Export Normalizer
 * 
 * Converts query execution results to a canonical, format-agnostic ExportResult structure.
 * 
 * RULES:
 * - NO interpretation
 * - NO semantic assumptions
 * - NO data transformation beyond normalization
 * - Schema-driven only
 * - Lossless conversion
 * 
 * Purpose: Single source of truth for all export formats.
 */

/**
 * @typedef {Object} ExportResultMeta
 * @property {string} [query_id] - UUID of saved query (if applicable)
 * @property {string} [query_name] - Name of saved query (if applicable)
 * @property {string} base_model - Base Odoo model
 * @property {string} schema_version - Schema version used
 * @property {string} executed_at - ISO 8601 timestamp
 * @property {number} record_count - Number of records returned
 * @property {string} execution_path - 'search_read' | 'read_group' | 'multi_pass'
 * @property {number} [relations_used] - Number of relations traversed
 * @property {number} [aggregations_used] - Number of aggregations applied
 * @property {boolean} preview_mode - Whether executed in preview mode
 */

/**
 * @typedef {Object} ExportField
 * @property {string} key - Stable key for this field (used as column/property identifier)
 * @property {string} label - Human-readable label (alias or field string)
 * @property {string} model - Source model
 * @property {string} [field] - Field name (if not aggregation)
 * @property {string} [type] - Odoo field type (char, integer, many2one, etc.)
 * @property {string} [aggregation] - Aggregation function (count, sum, avg, etc.)
 * @property {string} [relation_path] - Dot-separated relation path (if field from related model)
 */

/**
 * @typedef {Object} ExportResult
 * @property {ExportResultMeta} meta - Execution metadata
 * @property {ExportField[]} fields - Field definitions
 * @property {Array<Record<string, any>>} rows - Data rows (normalized)
 */

/**
 * Normalize query execution result to canonical ExportResult.
 * 
 * @param {Object} executionResult - Result from executeQuery()
 * @param {Object} [savedQueryInfo] - Optional saved query metadata
 * @returns {ExportResult}
 */
export function normalizeToExportResult(executionResult, savedQueryInfo = null) {
  if (!executionResult || !executionResult.records) {
    throw new Error('Invalid execution result: missing records');
  }

  const { records, meta, query_definition, schema_context } = executionResult;

  // Build metadata
  const exportMeta = {
    base_model: query_definition.base_model,
    schema_version: schema_context?.schema_version || 'unknown',
    executed_at: new Date().toISOString(),
    record_count: records.length,
    execution_path: meta.execution_path,
    relations_used: meta.relations_used || 0,
    aggregations_used: meta.aggregations_used || 0,
    preview_mode: meta.preview_mode || false,
  };

  // Add saved query info if provided
  if (savedQueryInfo) {
    exportMeta.query_id = savedQueryInfo.id;
    exportMeta.query_name = savedQueryInfo.name;
  }

  // Build field definitions
  const fields = buildFieldDefinitions(query_definition, schema_context);

  // Normalize rows (use exact keys from field definitions)
  const rows = normalizeRows(records, fields);

  return {
    meta: exportMeta,
    fields,
    rows,
  };
}

/**
 * Build field definitions from query definition.
 * 
 * @param {Object} queryDefinition - QueryDefinition object
 * @param {Object} schemaContext - Schema context (models, capabilities)
 * @returns {ExportField[]}
 */
function buildFieldDefinitions(queryDefinition, schemaContext) {
  const fields = [];
  const { fields: queryFields, aggregations = [], relations = [] } = queryDefinition;

  // Process regular fields
  if (queryFields && queryFields.length > 0) {
    for (const fieldDef of queryFields) {
      const field = {
        key: fieldDef.alias || fieldDef.field,
        label: fieldDef.alias || fieldDef.field,
        model: fieldDef.model,
        field: fieldDef.field,
      };

      // Add type if available in schema
      if (schemaContext?.models?.[fieldDef.model]?.fields?.[fieldDef.field]) {
        const schemaField = schemaContext.models[fieldDef.model].fields[fieldDef.field];
        field.type = schemaField.type;
      }

      // Add relation path if field is from related model
      if (fieldDef.model !== queryDefinition.base_model) {
        const relationPath = findRelationPath(relations, queryDefinition.base_model, fieldDef.model);
        if (relationPath) {
          field.relation_path = relationPath;
        }
      }

      fields.push(field);
    }
  }

  // Process aggregations
  if (aggregations && aggregations.length > 0) {
    for (const aggDef of aggregations) {
      const field = {
        key: aggDef.alias || `${aggDef.function}_${aggDef.field || 'count'}`,
        label: aggDef.alias || `${aggDef.function}_${aggDef.field || 'count'}`,
        model: aggDef.model,
        aggregation: aggDef.function,
      };

      // Add field if not count(*)
      if (aggDef.field) {
        field.field = aggDef.field;
      }

      // Add type if available
      if (aggDef.field && schemaContext?.models?.[aggDef.model]?.fields?.[aggDef.field]) {
        const schemaField = schemaContext.models[aggDef.model].fields[aggDef.field];
        field.type = schemaField.type;
      }

      fields.push(field);
    }
  }

  return fields;
}

/**
 * Find relation path from base model to target model.
 * 
 * @param {Array} relations - Relations from query definition
 * @param {string} baseModel - Base model
 * @param {string} targetModel - Target model
 * @returns {string|null} - Dot-separated path or null
 */
function findRelationPath(relations, baseModel, targetModel) {
  if (!relations || relations.length === 0) {
    return null;
  }

  // Simple case: direct relation
  const directRelation = relations.find(rel => 
    rel.from_model === baseModel && rel.to_model === targetModel
  );
  if (directRelation) {
    return directRelation.field;
  }

  // Complex case: traverse relation chain
  // Build path by following relations
  const visited = new Set();
  const queue = [{ model: baseModel, path: [] }];

  while (queue.length > 0) {
    const { model, path } = queue.shift();

    if (visited.has(model)) continue;
    visited.add(model);

    // Find all relations from current model
    const outgoingRelations = relations.filter(rel => rel.from_model === model);

    for (const rel of outgoingRelations) {
      const newPath = [...path, rel.field];

      if (rel.to_model === targetModel) {
        return newPath.join('.');
      }

      queue.push({
        model: rel.to_model,
        path: newPath,
      });
    }
  }

  return null;
}

/**
 * Normalize rows to use consistent keys from field definitions.
 * 
 * @param {Array<Record<string, any>>} records - Raw records from execution
 * @param {ExportField[]} fields - Field definitions
 * @returns {Array<Record<string, any>>} - Normalized rows
 */
function normalizeRows(records, fields) {
  return records.map(record => {
    const normalizedRow = {};

    for (const field of fields) {
      // Use field.key as the canonical key
      const key = field.key;

      // Find value in record (might be under label, alias, or field name)
      let value = record[key];

      // Fallback: try label if different from key
      if (value === undefined && field.label !== key) {
        value = record[field.label];
      }

      // Fallback: try field name if present
      if (value === undefined && field.field) {
        value = record[field.field];
      }

      // Store with canonical key
      normalizedRow[key] = value !== undefined ? value : null;
    }

    return normalizedRow;
  });
}

/**
 * Validate that execution result can be normalized.
 * 
 * @param {Object} executionResult - Result from executeQuery()
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateExecutionResult(executionResult) {
  const errors = [];

  if (!executionResult) {
    errors.push('Execution result is null or undefined');
    return { valid: false, errors };
  }

  if (!executionResult.records) {
    errors.push('Execution result missing records array');
  }

  if (!executionResult.meta) {
    errors.push('Execution result missing meta object');
  }

  if (!executionResult.query_definition) {
    errors.push('Execution result missing query_definition');
  }

  if (!executionResult.query_definition?.base_model) {
    errors.push('Query definition missing base_model');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
