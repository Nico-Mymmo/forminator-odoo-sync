/**
 * Semantic-to-Technical Translator
 * 
 * Vertaalt semantic queries naar technical QueryDefinition
 * Compatible met bestaande validator en executor
 * 
 * Implementeert ITERATION_8_IMPLEMENTATION.md Section B (Query Sjablonen)
 * 
 * @module lib/semantic-translator
 */

import { SEMANTIC_LAYERS } from '../config/semantic-layers.js';
import { CONTEXT_FILTERS } from '../config/context-filters.js';
import { validateSemanticQuery, SemanticError } from './semantic-validator.js';

/**
 * @typedef {Object} SemanticQuery
 * @property {string} layer_id
 * @property {string} [sub_option]
 * @property {Object} context - Filter selections
 * @property {Object} presentation - Presentation mode config
 * @property {Array<string>} [fields]
 */

/**
 * @typedef {Object} QueryDefinition
 * @property {string} base_model - Always 'x_sales_action_sheet'
 * @property {Array} [relations]
 * @property {Array<string>} fields
 * @property {Array} filters
 * @property {Array} [aggregations]
 * @property {Object} [time_scope]
 * @property {number} [limit]
 * @property {string} [execution_hint]
 */

/**
 * Translate semantic query to technical query definition
 * 
 * @param {SemanticQuery} semanticQuery
 * @param {Object} schema - SchemaSnapshot
 * @returns {QueryDefinition}
 */
export function translateSemanticQuery(semanticQuery, schema) {
  // Validate first
  const validation = validateSemanticQuery(semanticQuery);
  if (!validation.valid) {
    throw new SemanticError(validation);
  }

  const { layer_id, sub_option, context, presentation } = semanticQuery;
  const layer = SEMANTIC_LAYERS[layer_id];

  // Start with base
  const query = {
    base_model: 'x_sales_action_sheet',
    fields: [],
    filters: [],
    aggregations: [],
    execution_hint: layer.execution_hint
  };

  // 1. Add relations from layer
  if (layer.relations && layer.relations.path && layer.relations.path.length > 0) {
    query.relations = [{
      path: layer.relations.path,
      fields: layer.relations.fields || []
    }];

    // Add relation fields to query fields
    for (const field of (layer.relations.fields || [])) {
      const fullField = getFullFieldPath(layer.relations.path, field);
      query.fields.push(fullField);
    }
  }

  // 2. Add mandatory fields
  for (const mandatoryField of layer.mandatory_fields) {
    if (!query.fields.includes(mandatoryField)) {
      query.fields.push(mandatoryField);
    }
  }

  // 3. Add base fields - resolve from schema metadata
  const displayField = getDisplayNameField(schema, query.base_model);
  const baseFields = ['id', displayField, 'create_date'];
  for (const field of baseFields) {
    if (field && !query.fields.includes(field)) {
      query.fields.push(field);
    }
  }

  // 4. Apply context filters
  if (context) {
    applyContextFilters(query, context);
  }

  // 5. Apply sub-option configuration
  if (sub_option) {
    applySubOption(query, layer, sub_option);
  }

  // 6. Apply presentation mode
  if (presentation) {
    applyPresentationMode(query, presentation, layer);
  }

  // 7. Handle special cases
  handleSpecialCases(query, layer, semanticQuery);

  // 8. Convert fields to proper format (model + field objects)
  query.fields = query.fields.map(fieldStr => parseFieldString(fieldStr, query.base_model));

  return query;
}

/**
 * Get display name field from schema
 * 
 * @param {Object} schema - SchemaSnapshot
 * @param {string} modelName - Model name
 * @returns {string|null} Display field name or null if not found
 */
function getDisplayNameField(schema, modelName) {
  const model = schema.models[modelName];
  if (!model) {
    throw new Error(`Model ${modelName} not found in schema`);
  }
  
  // Check for display_name (Odoo auto-generated)
  if (model.fields['display_name']) {
    return 'display_name';
  }
  
  // Check for name field
  if (model.fields['name']) {
    return 'name';
  }
  
  // Check for x_name (custom field)
  if (model.fields['x_name']) {
    return 'x_name';
  }
  
  // Fail explicitly - no display field found
  throw new Error(
    `No display name field found for model '${modelName}'. ` +
    `Available fields: ${Object.keys(model.fields).slice(0, 10).join(', ')}. ` +
    `Update semantic layer configuration to specify the display field explicitly.`
  );
}

/**
 * Parse field string into {model, field} object
 * 
 * @param {string} fieldStr - Field string (e.g., "name" or "res.partner.name")
 * @param {string} baseModel - Base model name
 * @returns {Object} Field selection object
 */
function parseFieldString(fieldStr, baseModel) {
  // If field contains a dot, it's a relation field
  if (fieldStr.includes('.')) {
    const parts = fieldStr.split('.');
    // Last part is the field, everything before is the model
    const field = parts.pop();
    const model = parts.join('.');
    return { model, field };
  }
  
  // Simple field belongs to base model
  return {
    model: baseModel,
    field: fieldStr
  };
}

/**
 * Get full field path for relation
 */
function getFullFieldPath(relationPath, field) {
  if (relationPath.length === 0) {
    return field;
  }

  const targetModel = relationPath[relationPath.length - 1].target_model;
  const modelPrefix = targetModel.replace('.', '_');
  
  // If field already has prefix, don't add again
  if (field.includes('.')) {
    return field;
  }

  return `${targetModel}.${field}`;
}

/**
 * Apply context filters
 */
function applyContextFilters(query, context) {
  for (const [filterId, value] of Object.entries(context)) {
    if (!value || value === 'all') continue;

    const filterDef = CONTEXT_FILTERS[filterId];
    if (!filterDef) continue;

    // Handle different filter types
    if (filterDef.type === 'radio') {
      const option = filterDef.options.find(opt => opt.id === value);
      if (option && option.filter) {
        addFilter(query, filterDef.field, option.filter);
      } else if (option && option.time_scope) {
        query.time_scope = option.time_scope;
      }
    } else if (filterDef.type === 'checkboxes' && Array.isArray(value)) {
      // Multiple selections - combine with OR
      const orFilters = [];
      for (const selectedValue of value) {
        const option = filterDef.options.find(opt => opt.id === selectedValue);
        if (option && option.filter) {
          orFilters.push({ field: filterDef.field, ...option.filter });
        }
      }
      if (orFilters.length > 0) {
        query.filters.push({ or: orFilters });
      }
    }

    // Mark if multi-pass required
    if (filterDef.requires_multi_pass) {
      query.execution_hint = 'multi_pass';
    }
  }
}

/**
 * Add filter to query
 */
function addFilter(query, field, filter) {
  query.filters.push({
    field,
    operator: filter.operator,
    value: filter.value
  });
}

/**
 * Apply sub-option configuration
 */
function applySubOption(query, layer, subOptionId) {
  const subOption = layer.sub_options?.find(opt => opt.id === subOptionId);
  if (!subOption) return;

  // Add sub-option specific fields
  if (subOption.fields) {
    for (const field of subOption.fields) {
      if (!query.fields.includes(field)) {
        query.fields.push(field);
      }
    }
  }

  // Add sub-option aggregation
  if (subOption.aggregation) {
    if (Array.isArray(subOption.aggregation)) {
      query.aggregations.push(...subOption.aggregation);
    } else {
      query.aggregations.push(subOption.aggregation);
    }
  }

  // Override execution hint if specified
  if (subOption.execution_hint) {
    query.execution_hint = subOption.execution_hint;
  }

  // Add performance warning if needed
  if (subOption.performance_warning) {
    query._performance_warning = subOption.performance_warning;
  }

  // Handle comparison mode
  if (subOption.comparison) {
    query._comparison_mode = subOption.comparison;
  }

  // Update relations if sub-option has different path
  if (subOption.relations) {
    query.relations = [{
      path: subOption.relations.path,
      fields: subOption.relations.fields
    }];
  }
}

/**
 * Apply presentation mode
 */
function applyPresentationMode(query, presentation, layer) {
  const { type, group_by, order_by, limit, direction, function: aggFunc } = presentation;

  switch (type) {
    case 'group_by':
      if (group_by) {
        // Add to all aggregations
        for (const agg of query.aggregations) {
          if (!agg.group_by) {
            agg.group_by = group_by;
          }
        }

        // If no aggregations yet, add default COUNT
        if (query.aggregations.length === 0) {
          query.aggregations.push({
            field: 'id',
            function: 'count',
            group_by
          });
        }

        // Add group_by field to fields
        if (!query.fields.includes(group_by)) {
          query.fields.push(group_by);
        }
      }
      break;

    case 'trend':
      // Temporal grouping
      const dateField = 'create_date';
      const interval = presentation.interval || 'month';
      const groupByTemporal = `${dateField}:${interval}`;

      query.aggregations.push({
        field: 'id',
        function: 'count',
        group_by: groupByTemporal,
        order_by: dateField,
        order_direction: 'asc'
      });
      break;

    case 'top_bottom':
      const topLimit = limit || 10;
      const topDirection = direction || 'desc';

      // Add order_by and limit to aggregations
      for (const agg of query.aggregations) {
        agg.order_by = order_by || agg.function;
        agg.order_direction = topDirection;
        agg.limit = topLimit;
      }
      break;

    case 'summary':
      // Single value aggregation (no group_by)
      if (aggFunc) {
        query.aggregations = [{
          field: presentation.field || 'id',
          function: aggFunc
        }];
      }
      break;

    case 'comparison':
      // Mark for comparison execution
      query._comparison_mode = presentation.comparison || {};
      break;
  }
}

/**
 * Handle special cases
 */
function handleSpecialCases(query, layer, semanticQuery) {
  // Pain points: ensure score aggregation
  if (layer.id === 'pain_points') {
    const hasScoreAgg = query.aggregations.some(agg => 
      agg.field && agg.field.includes('score')
    );

    if (!hasScoreAgg && query.aggregations.length > 0) {
      // Add AVG score as secondary aggregation
      query.aggregations.push({
        field: 'x_action_sheet_pain_points.score',
        function: 'avg',
        group_by: query.aggregations[0].group_by
      });
    }
  }

  // Meetings: ensure temporal context
  if (layer.id === 'meeting_evolution') {
    if (!query.fields.includes('x_as_meetings.x_date')) {
      query.fields.push('x_as_meetings.x_date');
    }
  }

  // Building technical: force multi-pass
  if (layer.id === 'building_context' && semanticQuery.sub_option === 'technical') {
    query.execution_hint = 'multi_pass';
  }
}

/**
 * Translate comparison query
 * 
 * Returns two queries for side-by-side execution
 */
export function translateComparisonQuery(semanticQuery, schema) {
  const baseQuery = translateSemanticQuery(semanticQuery, schema);
  const comparisonConfig = baseQuery._comparison_mode || semanticQuery.presentation.comparison;

  if (!comparisonConfig) {
    throw new Error('No comparison configuration found');
  }

  // Create queryA and queryB
  const queryA = { ...baseQuery };
  const queryB = { ...baseQuery };

  // Remove comparison marker
  delete queryA._comparison_mode;
  delete queryB._comparison_mode;

  // Apply split logic
  if (comparisonConfig.split_on) {
    const { field, operator, values } = comparisonConfig.split_on;

    if (operator === 'exists') {
      queryA.filters.push({ field, operator: 'not_exists' });
      queryB.filters.push({ field, operator: 'exists' });
    } else if (values && values.length === 2) {
      queryA.filters.push({ field, operator: '=', value: values[0] });
      queryB.filters.push({ field, operator: '=', value: values[1] });
    }
  } else if (comparisonConfig.split_field) {
    // Temporal split (before/after)
    const splitField = comparisonConfig.split_field;
    queryA.filters.push({
      custom: `x_as_meetings.x_date < x_sales_action_sheet.${splitField}`
    });
    queryB.filters.push({
      custom: `x_as_meetings.x_date > x_sales_action_sheet.${splitField}`
    });
  }

  return {
    type: 'comparison',
    queryA,
    queryB,
    labels: comparisonConfig.labels || ['A', 'B']
  };
}

/**
 * Generate human-readable description of semantic query
 */
export function describeSemanticQuery(semanticQuery) {
  const { layer_id, sub_option, context, presentation } = semanticQuery;
  const layer = SEMANTIC_LAYERS[layer_id];
  
  let description = '';

  // Base action
  if (sub_option) {
    const subOpt = layer.sub_options?.find(opt => opt.id === sub_option);
    description = subOpt?.description || layer.description;
  } else {
    description = layer.description;
  }

  // Add context
  const contextParts = [];
  
  if (context) {
    if (context.building_size) {
      const filter = CONTEXT_FILTERS.building_size;
      const options = Array.isArray(context.building_size) ? context.building_size : [context.building_size];
      const labels = options.map(id => filter.options.find(opt => opt.id === id)?.label).filter(Boolean);
      if (labels.length > 0) {
        contextParts.push(`bij ${labels.join(' en ')}`);
      }
    }

    if (context.stage_type && context.stage_type !== 'all') {
      const filter = CONTEXT_FILTERS.stage_type;
      const option = filter.options.find(opt => opt.id === context.stage_type);
      if (option) {
        contextParts.push(option.label.toLowerCase());
      }
    }

    if (context.time_period) {
      const filter = CONTEXT_FILTERS.time_period;
      const option = filter.options.find(opt => opt.id === context.time_period);
      if (option) {
        contextParts.push(option.label.toLowerCase());
      }
    }
  }

  if (contextParts.length > 0) {
    description += ` ${contextParts.join(', ')}`;
  }

  return description.charAt(0).toUpperCase() + description.slice(1);
}
