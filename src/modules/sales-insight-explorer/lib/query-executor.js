/**
 * Query Execution Engine
 * 
 * Executes QueryDefinitions against Odoo using capability-aware path selection.
 * Dynamically chooses between read_group, search_read, or multi-pass execution.
 * 
 * SPEC COMPLIANCE:
 * - Iteration 2: Query execution
 * - Capability-aware execution
 * - RelationTraversal step-by-step execution
 * - No SQL assumptions
 * 
 * @module modules/sales-insight-explorer/lib/query-executor
 */

import { executeKw } from '../../../lib/odoo.js';
import { translateToOdooDomain, translateSorting } from './odoo-domain-translator.js';
import { validateQuery } from './query-validator.js';

/**
 * @typedef {'read_group'|'search_read'|'multi_pass'} ExecutionPath
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {Array} records - Query result records
 * @property {Object} meta - Execution metadata
 */

/**
 * Execute query against Odoo
 * 
 * @param {Object} query - QueryDefinition
 * @param {Object} schema - SchemaSnapshot
 * @param {Object} capabilities - Model capabilities
 * @param {Object} env - Worker environment
 * @param {Object} [options] - Execution options
 * @param {boolean} [options.preview=false] - Preview mode (limit results)
 * @returns {Promise<ExecutionResult>}
 */
export async function executeQuery(query, schema, capabilities, env, options = {}) {
  const { preview = false } = options;
  
  // Validate query first (gatekeeper)
  const validation = validateQuery(query, schema, capabilities);
  if (!validation.is_valid) {
    throw new Error(`Query validation failed: ${validation.errors[0].message}`);
  }
  
  const modelCaps = capabilities[query.base_model];
  const warnings = [...validation.warnings];
  const notes = [];
  
  // Select execution path
  const executionPath = selectExecutionPath(query, modelCaps, notes);
  
  // Apply preview limit if needed
  const effectiveQuery = preview ? applyPreviewLimit(query) : query;
  
  // Execute based on selected path
  let records;
  
  try {
    switch (executionPath) {
      case 'read_group':
        records = await executeViaReadGroup(effectiveQuery, schema, env, notes);
        break;
        
      case 'search_read':
        records = await executeViaSearchRead(effectiveQuery, schema, env, notes);
        break;
        
      case 'multi_pass':
        records = await executeViaMultiPass(effectiveQuery, schema, capabilities, env, notes);
        break;
        
      default:
        throw new Error(`Unknown execution path: ${executionPath}`);
    }
    
    return {
      records,
      meta: {
        execution_path: executionPath,
        records_returned: records.length,
        relations_used: query.relations?.length || 0,
        aggregations_used: query.aggregations?.length || 0,
        capability_warnings: warnings,
        execution_notes: notes,
        preview_mode: preview,
        complexity: validation.complexity
      }
    };
    
  } catch (error) {
    console.error('Query execution failed:', error);
    throw new Error(`Query execution failed: ${error.message}`);
  }
}

/**
 * Select execution path based on query structure and capabilities
 * 
 * @param {Object} query - QueryDefinition
 * @param {Object} modelCaps - Model capabilities
 * @param {Array} notes - Execution notes (mutated)
 * @returns {ExecutionPath}
 */
function selectExecutionPath(query, modelCaps, notes) {
  // Decision tree for execution path
  
  // Path A: read_group
  // Conditions:
  // - Has aggregations
  // - read_group supported
  // - No complex relation traversals
  // - Within capability limits
  if (query.aggregations && query.aggregations.length > 0) {
    if (!modelCaps.supports_read_group) {
      notes.push('read_group not supported - falling back to multi_pass');
      return 'multi_pass';
    }
    
    const groupByCount = query.aggregations[0]?.group_by?.length || 0;
    if (groupByCount > modelCaps.max_group_by_fields) {
      notes.push(`group_by count (${groupByCount}) exceeds limit (${modelCaps.max_group_by_fields}) - falling back to multi_pass`);
      return 'multi_pass';
    }
    
    // Check if relations are simple enough for read_group
    const hasComplexRelations = (query.relations || []).some(r => r.path.length > 1);
    if (hasComplexRelations) {
      notes.push('Complex relations detected - using multi_pass for aggregations');
      return 'multi_pass';
    }
    
    notes.push('Using read_group for aggregations');
    return 'read_group';
  }
  
  // Path B: search_read
  // Conditions:
  // - No aggregations
  // - Simple or no relations
  // - Within capability limits
  if (!query.relations || query.relations.length === 0) {
    notes.push('Simple query without relations - using search_read');
    return 'search_read';
  }
  
  const maxDepth = Math.max(...query.relations.map(r => r.path.length));
  if (maxDepth <= modelCaps.max_relation_depth && maxDepth <= 1) {
    notes.push('Simple relations - using search_read with post-processing');
    return 'search_read';
  }
  
  // Path C: multi_pass
  // All other cases
  notes.push(`Multi-pass execution required (relation depth: ${maxDepth}, max: ${modelCaps.max_relation_depth})`);
  return 'multi_pass';
}

/**
 * Apply preview limit to query
 * 
 * @param {Object} query - QueryDefinition
 * @returns {Object} Modified query with preview limit
 */
function applyPreviewLimit(query) {
  const PREVIEW_LIMIT = 50;
  
  return {
    ...query,
    limit: Math.min(query.limit || PREVIEW_LIMIT, PREVIEW_LIMIT)
  };
}

/**
 * Execute query via Odoo read_group
 * 
 * @param {Object} query - QueryDefinition
 * @param {Object} schema - SchemaSnapshot
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<Array>}
 */
async function executeViaReadGroup(query, schema, env, notes) {
  const domain = translateToOdooDomain(query);
  
  // Extract base model fields
  const baseFields = query.fields
    .filter(f => f.model === query.base_model)
    .map(f => f.field);
  
  // Get group_by fields from first aggregation
  const groupBy = query.aggregations[0]?.group_by || [];
  
  // Build aggregation fields (field:function format for Odoo)
  const aggregationFields = query.aggregations
    .filter(agg => agg.field) // Skip count(*) which doesn't need field
    .map(agg => `${agg.field}:${agg.function}`);
  
  const allFields = [...new Set([...baseFields, ...groupBy, ...aggregationFields])];
  
  notes.push(`read_group: domain=${JSON.stringify(domain)}, fields=${allFields.join(',')}, groupby=${groupBy.join(',')}`);
  
  const results = await executeKw(env, {
    model: query.base_model,
    method: 'read_group',
    args: [domain, allFields, groupBy],
    kwargs: {
      offset: query.offset || 0,
      limit: query.limit || 1000,
      orderby: translateSorting(query.sorting)
    }
  });
  
  // Transform read_group results to our format
  return results.map(row => {
    const record = {};
    
    // Map fields to aliases
    for (const field of query.fields) {
      const alias = field.alias || field.field;
      record[alias] = row[field.field];
    }
    
    // Map aggregation results
    for (const agg of query.aggregations) {
      const alias = agg.alias;
      
      if (agg.function === 'count') {
        record[alias] = row['__count'] || row[`${agg.field}_count`] || 0;
      } else if (agg.field) {
        record[alias] = row[agg.field];
      }
    }
    
    return record;
  });
}

/**
 * Execute query via Odoo search_read
 * 
 * @param {Object} query - QueryDefinition
 * @param {Object} schema - SchemaSnapshot
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<Array>}
 */
async function executeViaSearchRead(query, schema, env, notes) {
  const domain = translateToOdooDomain(query);
  
  // Extract base model fields
  const baseFields = query.fields
    .filter(f => f.model === query.base_model)
    .map(f => f.field);
  
  // Add relation fields that we need to traverse
  const relationFields = (query.relations || [])
    .filter(r => r.path.length === 1 && r.path[0].relation_type === 'many2one')
    .map(r => r.path[0].relation_field);
  
  const allFields = [...new Set([...baseFields, ...relationFields])];
  
  notes.push(`search_read: domain=${JSON.stringify(domain)}, fields=${allFields.join(',')}`);
  
  const results = await executeKw(env, {
    model: query.base_model,
    method: 'search_read',
    args: [domain],
    kwargs: {
      fields: allFields,
      offset: query.offset || 0,
      limit: query.limit || 1000,
      order: translateSorting(query.sorting)
    }
  });
  
  // If no relations, just map fields to aliases
  if (!query.relations || query.relations.length === 0) {
    return results.map(row => mapFieldsToAliases(row, query.fields));
  }
  
  // Execute relation traversals
  return await enrichWithRelations(results, query, schema, env, notes);
}

/**
 * Execute query via multi-pass approach
 * 
 * Complex queries that require multiple Odoo calls
 * 
 * @param {Object} query - QueryDefinition
 * @param {Object} schema - SchemaSnapshot
 * @param {Object} capabilities - All capabilities
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<Array>}
 */
async function executeViaMultiPass(query, schema, capabilities, env, notes) {
  notes.push('Multi-pass execution: fetching base records first');
  
  // Step 1: Fetch base records
  const domain = translateToOdooDomain(query);
  const baseFields = query.fields
    .filter(f => f.model === query.base_model)
    .map(f => f.field);
  
  // Add ID and relation fields
  const relationFields = (query.relations || [])
    .filter(r => r.path.length > 0)
    .map(r => r.path[0].relation_field);
  
  const allFields = [...new Set(['id', ...baseFields, ...relationFields])];
  
  const baseRecords = await executeKw(env, {
    model: query.base_model,
    method: 'search_read',
    args: [domain],
    kwargs: {
      fields: allFields,
      offset: query.offset || 0,
      limit: query.limit || 1000,
      order: translateSorting(query.sorting)
    }
  });
  
  notes.push(`Fetched ${baseRecords.length} base records`);
  
  if (baseRecords.length === 0) {
    return [];
  }
  
  // Step 2: Execute relation traversals
  const enrichedRecords = await enrichWithRelations(baseRecords, query, schema, env, notes);
  
  // Step 3: Apply aggregations if needed (client-side)
  if (query.aggregations && query.aggregations.length > 0) {
    return applyClientSideAggregations(enrichedRecords, query, notes);
  }
  
  return enrichedRecords;
}

/**
 * Enrich records with relation data
 * 
 * @param {Array} baseRecords - Base model records
 * @param {Object} query - QueryDefinition
 * @param {Object} schema - SchemaSnapshot
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<Array>}
 */
async function enrichWithRelations(baseRecords, query, schema, env, notes) {
  if (!query.relations || query.relations.length === 0) {
    return baseRecords.map(row => mapFieldsToAliases(row, query.fields));
  }
  
  // Execute each relation traversal
  const relationData = new Map();
  
  for (const relation of query.relations) {
    notes.push(`Executing relation traversal: ${relation.alias}`);
    
    const relatedData = await executeRelationTraversal(
      relation,
      baseRecords,
      query,
      schema,
      env,
      notes
    );
    
    relationData.set(relation.alias, relatedData);
  }
  
  // Merge base records with relation data
  return baseRecords.map(baseRow => {
    const record = mapFieldsToAliases(baseRow, query.fields.filter(f => f.model === query.base_model));
    
    // Add relation fields
    for (const [alias, relData] of relationData) {
      const relationFields = query.fields.filter(f => f.model === alias);
      
      const relatedRecord = relData.get(baseRow.id);
      if (relatedRecord) {
        for (const field of relationFields) {
          const fieldAlias = field.alias || `${alias}.${field.field}`;
          record[fieldAlias] = relatedRecord[field.field];
        }
      }
    }
    
    return record;
  });
}

/**
 * Execute single relation traversal
 * 
 * Steps through relation path and applies aggregation
 * 
 * @param {Object} relation - RelationTraversal
 * @param {Array} baseRecords - Source records
 * @param {Object} query - Full QueryDefinition
 * @param {Object} schema - SchemaSnapshot
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<Map>} Map of base record ID to related data
 */
async function executeRelationTraversal(relation, baseRecords, query, schema, env, notes) {
  const resultMap = new Map();
  
  // Step through relation path
  let currentRecords = baseRecords.map(r => ({ id: r.id, source_id: r.id }));
  
  for (const [stepIdx, step] of relation.path.entries()) {
    notes.push(`Relation ${relation.alias} step ${stepIdx + 1}: ${step.from_model}.${step.relation_field} -> ${step.target_model}`);
    
    const currentIds = currentRecords.map(r => r.id).filter(id => id != null);
    
    if (currentIds.length === 0) {
      notes.push(`No IDs to traverse at step ${stepIdx + 1}`);
      break;
    }
    
    // Build domain for this traversal step
    const traversalDomain = buildTraversalDomain(step, currentIds);
    
    // Get fields needed for this relation
    const relationFields = query.fields
      .filter(f => f.model === relation.alias)
      .map(f => f.field);
    
    // Always include ID
    const fields = [...new Set(['id', step.relation_field, ...relationFields])];
    
    // Fetch related records
    const relatedRecords = await executeKw(env, {
      model: step.target_model,
      method: 'search_read',
      args: [traversalDomain],
      kwargs: {
        fields,
        limit: 10000 // Large limit for relations
      }
    });
    
    notes.push(`Found ${relatedRecords.length} records at step ${stepIdx + 1}`);
    
    // Apply filters if specified on this relation
    let filteredRecords = relatedRecords;
    if (relation.filters && relation.filters.length > 0) {
      filteredRecords = applyClientSideFilters(relatedRecords, relation.filters);
      notes.push(`Filtered to ${filteredRecords.length} records`);
    }
    
    // Update currentRecords for next step
    if (stepIdx < relation.path.length - 1) {
      currentRecords = filteredRecords.map(r => ({
        id: r.id,
        source_id: r.source_id || r.id
      }));
    } else {
      // Last step - apply aggregation
      const aggregated = applyRelationAggregation(
        filteredRecords,
        currentRecords,
        step,
        relation.aggregation,
        notes
      );
      
      // Map back to source IDs
      for (const [sourceId, value] of aggregated) {
        resultMap.set(sourceId, value);
      }
    }
  }
  
  return resultMap;
}

/**
 * Build domain for relation traversal step
 * 
 * @param {Object} step - RelationPath step
 * @param {Array} sourceIds - IDs from previous step
 * @returns {Array} Odoo domain
 */
function buildTraversalDomain(step, sourceIds) {
  switch (step.relation_type) {
    case 'many2one':
      // Source records have foreign key pointing to target
      // Domain: id IN (values from source records)
      return [['id', 'in', sourceIds]];
      
    case 'one2many':
    case 'many2many':
      // Target records point back to source
      // Domain: relation_field IN (source IDs)
      return [[step.relation_field, 'in', sourceIds]];
      
    default:
      throw new Error(`Unknown relation type: ${step.relation_type}`);
  }
}

/**
 * Apply aggregation to relation traversal results
 * 
 * @param {Array} relatedRecords - Records from traversal
 * @param {Array} sourceRecords - Original source records
 * @param {Object} step - Current relation step
 * @param {string} aggregation - Aggregation type
 * @param {Array} notes - Execution notes
 * @returns {Map} Map of source ID to aggregated value
 */
function applyRelationAggregation(relatedRecords, sourceRecords, step, aggregation, notes) {
  const resultMap = new Map();
  
  if (!aggregation) {
    aggregation = step.relation_type === 'many2one' ? 'first' : 'count';
  }
  
  notes.push(`Applying aggregation: ${aggregation}`);
  
  // Group related records by source ID
  const grouped = new Map();
  for (const record of relatedRecords) {
    const sourceId = record[step.relation_field];
    if (!grouped.has(sourceId)) {
      grouped.set(sourceId, []);
    }
    grouped.get(sourceId).push(record);
  }
  
  // Apply aggregation
  for (const sourceRecord of sourceRecords) {
    const relatedGroup = grouped.get(sourceRecord.id) || [];
    
    let value;
    
    switch (aggregation) {
      case 'first':
        value = relatedGroup.length > 0 ? relatedGroup[0] : null;
        break;
        
      case 'count':
        value = relatedGroup.length;
        break;
        
      case 'exists':
        value = relatedGroup.length > 0;
        break;
        
      case 'sum':
      case 'avg':
      case 'min':
      case 'max':
        // These require a numeric field - not implemented in this iteration
        value = null;
        notes.push(`Warning: Numeric aggregation ${aggregation} not yet implemented`);
        break;
        
      default:
        value = relatedGroup;
    }
    
    resultMap.set(sourceRecord.source_id, value);
  }
  
  return resultMap;
}

/**
 * Apply client-side filters to records
 * 
 * @param {Array} records - Records to filter
 * @param {Array} filters - Filter conditions
 * @returns {Array} Filtered records
 */
function applyClientSideFilters(records, filters) {
  return records.filter(record => {
    return filters.every(filter => {
      const value = record[filter.field];
      
      switch (filter.operator) {
        case '=':
          return value === filter.value;
        case '!=':
          return value !== filter.value;
        case '>':
          return value > filter.value;
        case '>=':
          return value >= filter.value;
        case '<':
          return value < filter.value;
        case '<=':
          return value <= filter.value;
        case 'in':
          return Array.isArray(filter.value) && filter.value.includes(value);
        case 'not in':
          return Array.isArray(filter.value) && !filter.value.includes(value);
        case 'is set':
          return value != null && value !== false;
        case 'is not set':
          return value == null || value === false;
        default:
          return true;
      }
    });
  });
}

/**
 * Apply client-side aggregations
 * 
 * @param {Array} records - Records to aggregate
 * @param {Object} query - QueryDefinition
 * @param {Array} notes - Execution notes
 * @returns {Array} Aggregated results
 */
function applyClientSideAggregations(records, query, notes) {
  notes.push('Applying client-side aggregations');
  
  const groupBy = query.aggregations[0]?.group_by || [];
  
  if (groupBy.length === 0) {
    // No grouping - single aggregation result
    const result = {};
    
    for (const agg of query.aggregations) {
      result[agg.alias] = calculateAggregation(records, agg);
    }
    
    return [result];
  }
  
  // Group records
  const groups = new Map();
  
  for (const record of records) {
    const key = groupBy.map(field => record[field]).join('|');
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }
  
  // Calculate aggregations for each group
  const results = [];
  
  for (const [key, groupRecords] of groups) {
    const result = {};
    
    // Add group-by values
    const keyParts = key.split('|');
    for (let i = 0; i < groupBy.length; i++) {
      result[groupBy[i]] = keyParts[i];
    }
    
    // Add aggregations
    for (const agg of query.aggregations) {
      result[agg.alias] = calculateAggregation(groupRecords, agg);
    }
    
    results.push(result);
  }
  
  return results;
}

/**
 * Calculate single aggregation
 * 
 * @param {Array} records - Records to aggregate
 * @param {Object} agg - Aggregation definition
 * @returns {*} Aggregation result
 */
function calculateAggregation(records, agg) {
  switch (agg.function) {
    case 'count':
      return records.length;
      
    case 'sum':
      return records.reduce((sum, r) => sum + (parseFloat(r[agg.field]) || 0), 0);
      
    case 'avg': {
      const sum = records.reduce((s, r) => s + (parseFloat(r[agg.field]) || 0), 0);
      return records.length > 0 ? sum / records.length : 0;
    }
      
    case 'min':
      return Math.min(...records.map(r => parseFloat(r[agg.field]) || 0));
      
    case 'max':
      return Math.max(...records.map(r => parseFloat(r[agg.field]) || 0));
      
    case 'distinct_count': {
      const distinct = new Set(records.map(r => r[agg.field]));
      return distinct.size;
    }
      
    default:
      return null;
  }
}

/**
 * Map record fields to query field aliases
 * 
 * @param {Object} record - Odoo record
 * @param {Array} fields - Field selections
 * @returns {Object} Record with aliased fields
 */
function mapFieldsToAliases(record, fields) {
  const result = {};
  
  for (const field of fields) {
    const alias = field.alias || field.field;
    result[alias] = record[field.field];
  }
  
  return result;
}
