/**
 * Query Definition Models
 * 
 * Core data structures for query definitions.
 * Implements RelationTraversal (NOT SQL joins) as per Hardening Addendum.
 * 
 * SPEC COMPLIANCE:
 * - Section 2.3: QueryDefinition
 * - Correction 1: RelationTraversal (replaces Join)
 * - Zero hardcoded field names
 * - Schema-driven only
 * 
 * @module modules/sales-insight-explorer/lib/query-models
 */

/**
 * @typedef {Object} RelationPath
 * @property {string} from_model - Source model (e.g., "crm.lead")
 * @property {string} relation_field - Field name in source model (must exist in schema)
 * @property {string} target_model - Target model (validated from schema)
 * @property {'many2one'|'one2many'|'many2many'} relation_type - Type of relation
 */

/**
 * @typedef {'exists'|'count'|'first'|'avg'|'sum'|'min'|'max'} TraversalAggregation
 */

/**
 * @typedef {Object} RelationTraversal
 * @property {string} alias - Identifier for this relation (e.g., "customer", "activities")
 * @property {Array<RelationPath>} path - Step-by-step relation path
 * @property {TraversalAggregation} [aggregation] - How to aggregate x2many relations
 * @property {Array<Filter>} [filters] - Filters applied after traversal
 */

/**
 * @typedef {Object} FieldSelection
 * @property {string} model - Model name (base or relation alias)
 * @property {string} field - Field name
 * @property {string} [alias] - Display name in results
 * @property {Object} [transform] - Field transformation (reserved for future)
 */

/**
 * @typedef {Object} Filter
 * @property {string} model - Model to filter on
 * @property {string} field - Field to filter
 * @property {FilterOperator} operator - Comparison operator
 * @property {*} value - Filter value
 * @property {boolean} [case_sensitive] - For string comparisons
 */

/**
 * @typedef {'='|'!='|'>'|'>='|'<'|'<='|'like'|'ilike'|'not like'|'not ilike'|'in'|'not in'|'is set'|'is not set'|'between'} FilterOperator
 */

/**
 * @typedef {Object} Aggregation
 * @property {'count'|'sum'|'avg'|'min'|'max'|'distinct_count'} function - Aggregate function
 * @property {string} [field] - Field to aggregate (not needed for COUNT(*))
 * @property {string} alias - Result column name
 * @property {Array<string>} [group_by] - Fields to group by
 */

/**
 * @typedef {Object} SortRule
 * @property {string} model - Model to sort on
 * @property {string} field - Field to sort by
 * @property {'asc'|'desc'} direction - Sort direction
 * @property {'first'|'last'} [nulls] - How to handle nulls
 */

/**
 * @typedef {Object} TimeScope
 * @property {string} field - Which date field to filter
 * @property {'absolute'|'relative'} mode - Filter mode
 * @property {string} [from] - ISO date (absolute mode)
 * @property {string} [to] - ISO date (absolute mode)
 * @property {'today'|'this_week'|'this_month'|'this_quarter'|'this_year'|'last_7_days'|'last_30_days'|'last_90_days'|'last_year'} [period] - Relative period
 * @property {number} [relative_amount] - Custom relative amount
 * @property {'days'|'weeks'|'months'|'years'} [relative_unit] - Custom relative unit
 * @property {'past'|'future'} [relative_direction] - Custom relative direction
 */

/**
 * @typedef {Object} QueryDefinition
 * @property {string} base_model - Primary model being queried
 * @property {Array<FieldSelection>} fields - Fields to select
 * @property {Array<Filter>} filters - Filter conditions
 * @property {Array<RelationTraversal>} [relations] - Relation traversals (NOT joins)
 * @property {Array<Aggregation>} [aggregations] - Aggregations
 * @property {Array<SortRule>} [sorting] - Sort rules
 * @property {TimeScope} [time_scope] - Time-based filter
 * @property {number} [limit] - Result limit
 * @property {number} [offset] - Result offset
 */

/**
 * Validate QueryDefinition structure
 * 
 * Basic structural validation (does not check against schema)
 * 
 * @param {QueryDefinition} query - Query to validate
 * @returns {{is_valid: boolean, errors: Array<string>}}
 */
export function validateQueryStructure(query) {
  const errors = [];
  
  // Required fields
  if (!query.base_model || typeof query.base_model !== 'string') {
    errors.push('base_model is required and must be a string');
  }
  
  if (!Array.isArray(query.fields)) {
    errors.push('fields must be an array');
  }
  
  if (!Array.isArray(query.filters)) {
    errors.push('filters must be an array');
  }
  
  // Validate field selections
  if (Array.isArray(query.fields)) {
    query.fields.forEach((field, idx) => {
      if (!field.model || !field.field) {
        errors.push(`fields[${idx}]: model and field are required`);
      }
    });
  }
  
  // Validate filters
  if (Array.isArray(query.filters)) {
    query.filters.forEach((filter, idx) => {
      if (!filter.model || !filter.field || !filter.operator) {
        errors.push(`filters[${idx}]: model, field, and operator are required`);
      }
    });
  }
  
  // Validate relations
  if (query.relations && Array.isArray(query.relations)) {
    query.relations.forEach((relation, idx) => {
      if (!relation.alias) {
        errors.push(`relations[${idx}]: alias is required`);
      }
      
      if (!Array.isArray(relation.path) || relation.path.length === 0) {
        errors.push(`relations[${idx}]: path must be a non-empty array`);
      } else {
        relation.path.forEach((step, stepIdx) => {
          if (!step.from_model || !step.relation_field || !step.target_model || !step.relation_type) {
            errors.push(`relations[${idx}].path[${stepIdx}]: from_model, relation_field, target_model, and relation_type are required`);
          }
        });
      }
    });
  }
  
  return {
    is_valid: errors.length === 0,
    errors
  };
}

/**
 * Create empty query definition
 * 
 * @param {string} baseModel - Base model name
 * @returns {QueryDefinition}
 */
export function createEmptyQuery(baseModel) {
  return {
    base_model: baseModel,
    fields: [],
    filters: [],
    relations: [],
    aggregations: [],
    sorting: []
  };
}
