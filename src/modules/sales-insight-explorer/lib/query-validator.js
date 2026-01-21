/**
 * Query Validator
 * 
 * Validates QueryDefinitions against schema and capabilities.
 * Enforces RelationTraversal rules (NOT SQL join rules).
 * 
 * SPEC COMPLIANCE:
 * - Section 3.2: Query validation
 * - Correction 1: RelationTraversal validation (forbids polymorphic, validates schema)
 * - Correction 3: Capability enforcement
 * - Correction 5: Complexity as heuristic guidance
 * 
 * @module modules/sales-insight-explorer/lib/query-validator
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} path - Path to error location (e.g., "filters[0].field")
 * @property {string} message - Human-readable error message
 * @property {string} code - Machine-readable error code
 * @property {string} [suggestion] - Optional suggestion to fix
 */

/**
 * @typedef {Object} ComplexityFactor
 * @property {string} factor - Factor name
 * @property {'low'|'medium'|'high'} impact - Impact level
 * @property {string} description - Description
 */

/**
 * @typedef {Object} ComplexityAssessment
 * @property {'simple'|'moderate'|'complex'} guidance_level - Heuristic classification
 * @property {Array<ComplexityFactor>} factors - Contributing factors
 * @property {Array<string>} recommendations - Suggestions
 * @property {Array<string>} warnings - Performance warnings
 * @property {'seconds'|'tens_of_seconds'|'minutes_or_timeout'} estimated_duration_range - Rough indication
 * @property {string} disclaimer - Honesty disclaimer
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} is_valid - Whether query is valid
 * @property {Array<ValidationError>} errors - Validation errors
 * @property {Array<string>} warnings - Non-fatal warnings
 * @property {ComplexityAssessment} [complexity] - Complexity assessment (if valid)
 */

/**
 * Validate complete query against schema and capabilities
 * 
 * @param {Object} query - QueryDefinition to validate
 * @param {Object} schema - SchemaSnapshot
 * @param {Map<string, Object>|Object} capabilities - Model capabilities
 * @returns {ValidationResult}
 */
export function validateQuery(query, schema, capabilities) {
  const errors = [];
  const warnings = [];
  
  // Convert capabilities to Map if it's an object
  const capsMap = capabilities instanceof Map 
    ? capabilities 
    : new Map(Object.entries(capabilities || {}));
  
  // 1. Validate base model exists
  if (!schema.models[query.base_model]) {
    errors.push({
      path: 'base_model',
      message: `Model '${query.base_model}' not found in schema`,
      code: 'MODEL_NOT_FOUND',
      suggestion: `Available models: ${Object.keys(schema.models).slice(0, 5).join(', ')}`
    });
    
    // Cannot continue validation without valid base model
    return { is_valid: false, errors, warnings };
  }
  
  const baseModelDef = schema.models[query.base_model];
  const modelCaps = capsMap.get(query.base_model);
  
  // 2. Validate field selections
  for (const [idx, fieldSel] of query.fields.entries()) {
    const fieldErrors = validateFieldSelection(fieldSel, query, schema, idx);
    errors.push(...fieldErrors);
  }
  
  // 3. Validate filters
  for (const [idx, filter] of query.filters.entries()) {
    const filterErrors = validateFilter(filter, query, schema, idx);
    errors.push(...filterErrors);
  }
  
  // 4. Validate relation traversals
  if (query.relations && Array.isArray(query.relations)) {
    for (const [idx, relation] of query.relations.entries()) {
      const relationErrors = validateRelationTraversal(relation, schema, idx);
      errors.push(...relationErrors);
    }
  }
  
  // 5. Validate aggregations
  if (query.aggregations && Array.isArray(query.aggregations)) {
    for (const [idx, agg] of query.aggregations.entries()) {
      const aggErrors = validateAggregation(agg, query, schema, modelCaps, idx);
      errors.push(...aggErrors);
    }
  }
  
  // 6. Validate sorting
  if (query.sorting && Array.isArray(query.sorting)) {
    for (const [idx, sort] of query.sorting.entries()) {
      const sortErrors = validateSortRule(sort, query, schema, idx);
      errors.push(...sortErrors);
    }
  }
  
  // 7. Validate time scope
  if (query.time_scope) {
    const timeScopeErrors = validateTimeScope(query.time_scope, query, schema);
    errors.push(...timeScopeErrors);
  }
  
  // 8. Enforce capability constraints
  if (modelCaps) {
    const capabilityErrors = enforceCapabilities(query, modelCaps);
    errors.push(...capabilityErrors.errors);
    warnings.push(...capabilityErrors.warnings);
  }
  
  // 9. Assess complexity (if valid)
  let complexity = null;
  if (errors.length === 0 && modelCaps) {
    complexity = assessQueryComplexity(query, schema, modelCaps);
    warnings.push(...complexity.warnings);
  }
  
  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    complexity
  };
}

/**
 * Validate field selection
 * 
 * @param {Object} fieldSel - Field selection
 * @param {Object} query - Full query
 * @param {Object} schema - Schema snapshot
 * @param {number} idx - Index for error path
 * @returns {Array<ValidationError>}
 */
function validateFieldSelection(fieldSel, query, schema, idx) {
  const errors = [];
  const path = `fields[${idx}]`;
  
  // Determine which model definition to check
  let modelDef;
  
  if (fieldSel.model === query.base_model) {
    modelDef = schema.models[query.base_model];
  } else {
    // Check if it's a relation alias
    const relation = query.relations?.find(r => r.alias === fieldSel.model);
    if (relation) {
      // Get target model from last path step
      const lastStep = relation.path[relation.path.length - 1];
      modelDef = schema.models[lastStep.target_model];
    } else {
      errors.push({
        path: `${path}.model`,
        message: `Model '${fieldSel.model}' is not the base model or a defined relation alias`,
        code: 'INVALID_MODEL_REFERENCE'
      });
      return errors;
    }
  }
  
  // Check field exists
  if (!modelDef.fields[fieldSel.field]) {
    errors.push({
      path: `${path}.field`,
      message: `Field '${fieldSel.field}' not found in model '${fieldSel.model}'`,
      code: 'FIELD_NOT_FOUND',
      suggestion: `Available fields: ${Object.keys(modelDef.fields).slice(0, 5).join(', ')}`
    });
  }
  
  return errors;
}

/**
 * Validate filter
 * 
 * @param {Object} filter - Filter
 * @param {Object} query - Full query
 * @param {Object} schema - Schema snapshot
 * @param {number} idx - Index for error path
 * @returns {Array<ValidationError>}
 */
function validateFilter(filter, query, schema, idx) {
  const errors = [];
  const path = `filters[${idx}]`;
  
  // Get model definition
  const modelDef = schema.models[filter.model];
  if (!modelDef) {
    errors.push({
      path: `${path}.model`,
      message: `Model '${filter.model}' not found in schema`,
      code: 'MODEL_NOT_FOUND'
    });
    return errors;
  }
  
  // Check field exists
  const fieldDef = modelDef.fields[filter.field];
  if (!fieldDef) {
    errors.push({
      path: `${path}.field`,
      message: `Field '${filter.field}' not found in model '${filter.model}'`,
      code: 'FIELD_NOT_FOUND'
    });
    return errors;
  }
  
  // Validate operator is compatible with field type
  const operatorErrors = validateOperatorForFieldType(filter.operator, fieldDef, path);
  errors.push(...operatorErrors);
  
  return errors;
}

/**
 * Validate operator is compatible with field type
 * 
 * @param {string} operator - Filter operator
 * @param {Object} fieldDef - Field definition
 * @param {string} path - Error path
 * @returns {Array<ValidationError>}
 */
function validateOperatorForFieldType(operator, fieldDef, path) {
  const errors = [];
  
  const numericOperators = ['=', '!=', '>', '>=', '<', '<=', 'between'];
  const textOperators = ['like', 'ilike', 'not like', 'not ilike'];
  const listOperators = ['in', 'not in'];
  const existenceOperators = ['is set', 'is not set'];
  
  // Numeric fields should use numeric operators
  if (['integer', 'float', 'monetary'].includes(fieldDef.type)) {
    if (textOperators.includes(operator)) {
      errors.push({
        path: `${path}.operator`,
        message: `Operator '${operator}' not valid for numeric field type '${fieldDef.type}'`,
        code: 'INVALID_OPERATOR_FOR_TYPE',
        suggestion: `Use numeric operators: ${numericOperators.join(', ')}`
      });
    }
  }
  
  // Text fields with LIKE operators
  if (['char', 'text', 'html'].includes(fieldDef.type)) {
    if (operator === 'between') {
      errors.push({
        path: `${path}.operator`,
        message: `Operator 'between' not valid for text field type '${fieldDef.type}'`,
        code: 'INVALID_OPERATOR_FOR_TYPE'
      });
    }
  }
  
  return errors;
}

/**
 * Validate relation traversal (CRITICAL: Hardening Addendum Correction 1)
 * 
 * Enforces:
 * - All models and fields must exist in schema
 * - Relation fields must be actual relational fields
 * - Target models must match schema definition
 * - Relation types must match schema
 * - NO polymorphic relations (res_id)
 * 
 * @param {Object} relation - RelationTraversal
 * @param {Object} schema - Schema snapshot
 * @param {number} idx - Index for error path
 * @returns {Array<ValidationError>}
 */
export function validateRelationTraversal(relation, schema, idx) {
  const errors = [];
  const basePath = `relations[${idx}]`;
  
  if (!relation.path || !Array.isArray(relation.path) || relation.path.length === 0) {
    errors.push({
      path: `${basePath}.path`,
      message: 'Relation path must be a non-empty array',
      code: 'INVALID_RELATION_PATH'
    });
    return errors;
  }
  
  // Validate each step in the path
  for (const [stepIdx, step] of relation.path.entries()) {
    const stepPath = `${basePath}.path[${stepIdx}]`;
    
    // 1. Verify source model exists
    const sourceModel = schema.models[step.from_model];
    if (!sourceModel) {
      errors.push({
        path: stepPath,
        message: `Source model '${step.from_model}' not found in schema`,
        code: 'MODEL_NOT_FOUND'
      });
      continue;
    }
    
    // 2. Verify relation field exists
    const relationField = sourceModel.fields[step.relation_field];
    if (!relationField) {
      errors.push({
        path: stepPath,
        message: `Field '${step.relation_field}' not found in model '${step.from_model}'`,
        code: 'FIELD_NOT_FOUND',
        suggestion: `Available fields: ${Object.keys(sourceModel.fields).slice(0, 5).join(', ')}`
      });
      continue;
    }
    
    // 3. Verify field is relational
    if (!['many2one', 'one2many', 'many2many'].includes(relationField.type)) {
      errors.push({
        path: stepPath,
        message: `Field '${step.relation_field}' is not a relational field (type: ${relationField.type})`,
        code: 'NOT_RELATIONAL_FIELD',
        suggestion: 'Only many2one, one2many, and many2many fields can be traversed'
      });
      continue;
    }
    
    // 4. Verify target model matches schema definition
    if (relationField.relation !== step.target_model) {
      errors.push({
        path: stepPath,
        message: `Target model mismatch: expected '${relationField.relation}', got '${step.target_model}'`,
        code: 'TARGET_MODEL_MISMATCH',
        suggestion: `Use '${relationField.relation}' as target_model`
      });
    }
    
    // 5. Verify relation type matches
    if (relationField.type !== step.relation_type) {
      errors.push({
        path: stepPath,
        message: `Relation type mismatch: expected '${relationField.type}', got '${step.relation_type}'`,
        code: 'RELATION_TYPE_MISMATCH',
        suggestion: `Use '${relationField.type}' as relation_type`
      });
    }
    
    // 6. FORBIDDEN: Polymorphic relations (res_model + res_id)
    if (step.relation_field === 'res_id' || step.from_model.includes('mail.')) {
      errors.push({
        path: stepPath,
        message: 'Polymorphic relations (res_id) are not supported',
        code: 'POLYMORPHIC_RELATION_FORBIDDEN',
        suggestion: 'Use direct relational fields only'
      });
    }
    
    // 7. Verify target model exists (if not already errored)
    if (!schema.models[step.target_model]) {
      errors.push({
        path: stepPath,
        message: `Target model '${step.target_model}' not found in schema`,
        code: 'MODEL_NOT_FOUND'
      });
    }
  }
  
  // Validate aggregation is valid for relation type
  if (relation.aggregation) {
    const lastStep = relation.path[relation.path.length - 1];
    
    if (lastStep.relation_type === 'many2one' && 
        !['exists', 'first'].includes(relation.aggregation)) {
      errors.push({
        path: `${basePath}.aggregation`,
        message: `Aggregation '${relation.aggregation}' invalid for many2one relation`,
        code: 'INVALID_AGGREGATION',
        suggestion: "Use 'exists' or 'first' for many2one relations"
      });
    }
  }
  
  return errors;
}

/**
 * Validate aggregation
 * 
 * @param {Object} agg - Aggregation
 * @param {Object} query - Full query
 * @param {Object} schema - Schema snapshot
 * @param {Object} modelCaps - Model capabilities
 * @param {number} idx - Index for error path
 * @returns {Array<ValidationError>}
 */
function validateAggregation(agg, query, schema, modelCaps, idx) {
  const errors = [];
  const path = `aggregations[${idx}]`;
  
  // Check capability support
  if (modelCaps && !modelCaps.supports_aggregation) {
    errors.push({
      path,
      message: `Model '${query.base_model}' does not support aggregations`,
      code: 'AGGREGATION_NOT_SUPPORTED'
    });
    return errors;
  }
  
  // Validate field if specified
  if (agg.field) {
    const baseModel = schema.models[query.base_model];
    const fieldDef = baseModel.fields[agg.field];
    
    if (!fieldDef) {
      errors.push({
        path: `${path}.field`,
        message: `Field '${agg.field}' not found in base model`,
        code: 'FIELD_NOT_FOUND'
      });
    } else if (['sum', 'avg', 'min', 'max'].includes(agg.function)) {
      // Numeric aggregations require numeric fields
      if (!['integer', 'float', 'monetary'].includes(fieldDef.type)) {
        errors.push({
          path: `${path}.field`,
          message: `Aggregation '${agg.function}' requires a numeric field, got '${fieldDef.type}'`,
          code: 'INVALID_FIELD_TYPE_FOR_AGGREGATION'
        });
      }
    }
  }
  
  // Validate group_by fields
  if (agg.group_by && Array.isArray(agg.group_by)) {
    if (modelCaps && agg.group_by.length > modelCaps.max_group_by_fields) {
      errors.push({
        path: `${path}.group_by`,
        message: `Maximum ${modelCaps.max_group_by_fields} group-by fields supported, got ${agg.group_by.length}`,
        code: 'TOO_MANY_GROUP_BY_FIELDS'
      });
    }
  }
  
  return errors;
}

/**
 * Validate sort rule
 * 
 * @param {Object} sort - Sort rule
 * @param {Object} query - Full query
 * @param {Object} schema - Schema snapshot
 * @param {number} idx - Index for error path
 * @returns {Array<ValidationError>}
 */
function validateSortRule(sort, query, schema, idx) {
  const errors = [];
  const path = `sorting[${idx}]`;
  
  const modelDef = schema.models[sort.model];
  if (!modelDef) {
    errors.push({
      path: `${path}.model`,
      message: `Model '${sort.model}' not found in schema`,
      code: 'MODEL_NOT_FOUND'
    });
    return errors;
  }
  
  if (!modelDef.fields[sort.field]) {
    errors.push({
      path: `${path}.field`,
      message: `Field '${sort.field}' not found in model '${sort.model}'`,
      code: 'FIELD_NOT_FOUND'
    });
  }
  
  return errors;
}

/**
 * Validate time scope
 * 
 * @param {Object} timeScope - Time scope
 * @param {Object} query - Full query
 * @param {Object} schema - Schema snapshot
 * @returns {Array<ValidationError>}
 */
function validateTimeScope(timeScope, query, schema) {
  const errors = [];
  const path = 'time_scope';
  
  const baseModel = schema.models[query.base_model];
  const fieldDef = baseModel.fields[timeScope.field];
  
  if (!fieldDef) {
    errors.push({
      path: `${path}.field`,
      message: `Field '${timeScope.field}' not found in base model`,
      code: 'FIELD_NOT_FOUND'
    });
    return errors;
  }
  
  if (!['date', 'datetime'].includes(fieldDef.type)) {
    errors.push({
      path: `${path}.field`,
      message: `Time scope field must be date or datetime, got '${fieldDef.type}'`,
      code: 'INVALID_FIELD_TYPE'
    });
  }
  
  return errors;
}

/**
 * Enforce capability constraints
 * 
 * @param {Object} query - Query definition
 * @param {Object} modelCaps - Model capabilities
 * @returns {{errors: Array<ValidationError>, warnings: Array<string>}}
 */
function enforceCapabilities(query, modelCaps) {
  const errors = [];
  const warnings = [];
  
  // Check relation depth
  const maxDepth = Math.max(
    ...(query.relations || []).map(r => r.path.length),
    0
  );
  
  if (maxDepth > modelCaps.max_relation_depth) {
    warnings.push(
      `Relation depth ${maxDepth} exceeds recommended limit (${modelCaps.max_relation_depth}). May be slow or unreliable.`
    );
  }
  
  // Check dataset size vs complexity
  if (modelCaps.large_dataset) {
    if (!query.limit || query.limit > 1000) {
      warnings.push(
        "Large dataset without limit: query may be very slow. Consider adding limit."
      );
    }
    
    if (query.filters.length === 0) {
      warnings.push(
        "No filters on large dataset: consider adding filters to improve performance."
      );
    }
  }
  
  // Add model-specific warnings
  warnings.push(...modelCaps.warnings);
  
  return { errors, warnings };
}

/**
 * Assess query complexity (HEURISTIC ONLY - Correction 5)
 * 
 * @param {Object} query - Query definition
 * @param {Object} schema - Schema snapshot
 * @param {Object} modelCaps - Model capabilities
 * @returns {ComplexityAssessment}
 */
export function assessQueryComplexity(query, schema, modelCaps) {
  const factors = [];
  const recommendations = [];
  const warnings = [];
  
  let complexityScore = 0;
  
  // Factor 1: Dataset size
  if (modelCaps.estimated_record_count > 100000) {
    complexityScore += 3;
    factors.push({
      factor: "Large dataset",
      impact: "high",
      description: `~${modelCaps.estimated_record_count.toLocaleString()} records in ${query.base_model}`
    });
  } else if (modelCaps.estimated_record_count > 10000) {
    complexityScore += 1;
    factors.push({
      factor: "Medium dataset",
      impact: "medium",
      description: `~${modelCaps.estimated_record_count.toLocaleString()} records`
    });
  }
  
  // Factor 2: Relation traversals
  const relationCount = query.relations?.length || 0;
  const maxDepth = Math.max(...(query.relations || []).map(r => r.path.length), 0);
  
  if (relationCount > 0) {
    complexityScore += relationCount;
    factors.push({
      factor: "Relation traversals",
      impact: relationCount > 2 ? "high" : "medium",
      description: `${relationCount} relation(s), max depth ${maxDepth}`
    });
    
    if (maxDepth > modelCaps.max_relation_depth) {
      complexityScore += 2;
      warnings.push(
        `Relation depth (${maxDepth}) exceeds recommended limit (${modelCaps.max_relation_depth}). May be slow or unreliable.`
      );
    }
  }
  
  // Factor 3: Aggregations
  if (query.aggregations && query.aggregations.length > 0) {
    const groupByCount = query.aggregations[0]?.group_by?.length || 0;
    complexityScore += groupByCount;
    
    factors.push({
      factor: "Aggregation",
      impact: groupByCount > 2 ? "high" : groupByCount > 0 ? "medium" : "low",
      description: `Grouping by ${groupByCount} field(s)`
    });
    
    if (groupByCount > 2) {
      warnings.push(
        "Grouping by multiple fields can be slow on large datasets."
      );
    }
  }
  
  // Factor 4: Text search
  const hasTextSearch = query.filters.some(f => 
    ['like', 'ilike', 'not like', 'not ilike'].includes(f.operator)
  );
  
  if (hasTextSearch) {
    complexityScore += 1;
    factors.push({
      factor: "Text search",
      impact: "medium",
      description: "Contains text pattern matching"
    });
    
    if (modelCaps.large_dataset) {
      warnings.push(
        "Text search on large dataset may be slow. Consider more specific filters."
      );
    }
  }
  
  // Factor 5: No limit
  if (!query.limit || query.limit > 1000) {
    complexityScore += 1;
    recommendations.push(
      "Consider adding a limit to improve response time."
    );
  }
  
  // Determine guidance level (heuristic only)
  let guidance_level;
  let estimated_duration_range;
  
  if (complexityScore <= 2) {
    guidance_level = "simple";
    estimated_duration_range = "seconds";
  } else if (complexityScore <= 5) {
    guidance_level = "moderate";
    estimated_duration_range = "tens_of_seconds";
    recommendations.push("This query may take a moment to execute.");
  } else {
    guidance_level = "complex";
    estimated_duration_range = "minutes_or_timeout";
    warnings.push(
      "This query is complex and may be slow or timeout. Consider simplifying."
    );
    recommendations.push("Try reducing relation depth, group-by fields, or adding filters.");
  }
  
  return {
    guidance_level,
    factors,
    recommendations,
    warnings,
    estimated_duration_range,
    disclaimer: "These are estimates based on heuristics. Actual performance varies depending on Odoo server load, database indexes, and data distribution."
  };
}
