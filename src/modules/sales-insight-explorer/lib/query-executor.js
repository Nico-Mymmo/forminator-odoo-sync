/**
 * Query Execution Engine — enkel nog basisqueries en aggregaties
 *
 * Voert een QueryDefinition uit tegen Odoo met capability-bewuste padkeuze
 * (read_group / search_read / multi_pass) voor het BASISMODEL.
 *
 * RELATIES HOREN HIER NIET MEER. Alles wat gekoppelde records ophaalt loopt via
 * lib/graph/cascade-executor.js, de enige traversal-motor. De vroegere
 * RelationTraversal-code in dit bestand is verwijderd omdat ze structureel fout
 * was en een andere resultaatvorm opleverde dan de wizard en mini-apps nodig
 * hebben:
 *  - many2one werd uitgevoerd als `id in <bron-id's>` i.p.v. op de FK-waarden
 *    uit de bronrecords (dus willekeurig verkeerde records);
 *  - de groepering per ouder gebeurde op een veld dat op het doelrecord niet
 *    bestaat, en de link met het basisrecord was vanaf stap 2 verloren;
 *  - het resultaat was een platte scalaire kolom (`alias.field`) i.p.v. geneste
 *    kindrecords per ouder.
 * Een query met `relations` wordt daarom expliciet geweigerd i.p.v. stil iets
 * verkeerds te doen.
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

  // Relaties horen bij de cascade-motor, niet hier (zie de module-doc).
  if (Array.isArray(query.relations) && query.relations.length > 0) {
    const err = new Error('Gekoppelde modellen lopen via de cascade-motor (lib/graph/cascade-executor.js), niet via query-executor.js. Bouw de zoekopdracht opnieuw op in de wizard.');
    err.code = 'RELATIONS_NOT_SUPPORTED';
    throw err;
  }

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
    
    notes.push('Using read_group for aggregations');
    return 'read_group';
  }
  
  // Path B: search_read — geen aggregaties, geen relaties (die bestaan hier niet
  // meer, zie de guard in executeQuery)
  notes.push('Simple query - using search_read');
  return 'search_read';
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
  
  const allFields = [...new Set(baseFields)];
  
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
  
  return results.map(row => mapFieldsToAliases(row, query.fields));
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
  
  const allFields = [...new Set(['id', ...baseFields])];
  
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
  
  const mapped = baseRecords.map(row => mapFieldsToAliases(row, query.fields));
  
  // Step 2: Apply aggregations if needed (client-side)
  if (query.aggregations && query.aggregations.length > 0) {
    return applyClientSideAggregations(mapped, query, notes);
  }
  
  return mapped;
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
