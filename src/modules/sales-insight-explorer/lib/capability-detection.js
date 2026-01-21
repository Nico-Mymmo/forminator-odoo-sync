/**
 * Capability Detection Service
 * 
 * Detects what query capabilities are supported for each Odoo model.
 * Provides realistic limits based on Odoo's actual capabilities.
 * 
 * SPEC COMPLIANCE:
 * - Correction 3: Explicit capability detection
 * - Enforces realistic Odoo query limits
 * 
 * @module modules/sales-insight-explorer/lib/capability-detection
 */

import { executeKw } from '../../../lib/odoo.js';

/**
 * @typedef {Object} ModelCapabilities
 * @property {boolean} supports_search - Always true for accessible models
 * @property {boolean} supports_read - Always true
 * @property {boolean} supports_read_group - True if has groupable fields
 * @property {boolean} supports_aggregation - True if has numeric fields
 * @property {number} max_group_by_fields - Usually 1-2 reliable, 3+ slow
 * @property {boolean} supports_relation_traversal - True for most models
 * @property {number} max_relation_depth - Usually 1-2, 3+ unreliable
 * @property {'fast'|'medium'|'slow'} relation_traversal_performance
 * @property {number} estimated_record_count - Approximate number of records
 * @property {boolean} large_dataset - True if >10k records
 * @property {boolean} text_search_available - True if has text fields
 * @property {boolean} full_text_search - Only if explicitly indexed
 * @property {Array<string>} limitations - Known limitations
 * @property {Array<string>} warnings - Performance warnings
 */

/**
 * Detect capabilities for a model
 * 
 * @param {Object} env - Worker environment
 * @param {Object} modelDef - ModelDefinition from schema
 * @returns {Promise<ModelCapabilities>}
 */
export async function detectModelCapabilities(env, modelDef) {
  const capabilities = {
    supports_search: true,
    supports_read: true,
    supports_read_group: false,
    supports_aggregation: false,
    max_group_by_fields: 0,
    supports_relation_traversal: true,
    max_relation_depth: 2, // Conservative default
    relation_traversal_performance: 'medium',
    estimated_record_count: 0,
    large_dataset: false,
    text_search_available: true,
    full_text_search: false,
    limitations: [],
    warnings: []
  };
  
  // Analyze fields to determine capabilities
  const fields = Object.values(modelDef.fields);
  
  // Check for groupable fields
  const groupableFields = fields.filter(f =>
    ['selection', 'many2one', 'boolean', 'date'].includes(f.type) &&
    !f.readonly
  );
  
  if (groupableFields.length > 0) {
    capabilities.supports_read_group = true;
    capabilities.max_group_by_fields = Math.min(groupableFields.length, 3);
  }
  
  // Check for numeric fields (enables aggregation)
  const numericFields = fields.filter(f =>
    ['integer', 'float', 'monetary'].includes(f.type)
  );
  
  if (numericFields.length > 0) {
    capabilities.supports_aggregation = true;
  }
  
  // Estimate record count
  try {
    const count = await executeKw(env, {
      model: modelDef.name,
      method: 'search_count',
      args: [[]] // Empty domain = all records
    });
    
    capabilities.estimated_record_count = count;
    capabilities.large_dataset = count > 10000;
    
    // Adjust capabilities based on dataset size
    if (count > 100000) {
      capabilities.warnings.push(
        "Large dataset (>100k records): queries may be slow. Consider adding filters."
      );
      capabilities.max_relation_depth = 1;
      capabilities.relation_traversal_performance = 'slow';
    } else if (count > 50000) {
      capabilities.warnings.push(
        "Medium-large dataset (>50k records): complex queries may be slow."
      );
      capabilities.relation_traversal_performance = 'slow';
    }
  } catch (error) {
    console.warn(`Could not estimate record count for ${modelDef.name}:`, error.message);
    capabilities.limitations.push("Cannot estimate record count");
  }
  
  // Check relational complexity
  const relationalFields = fields.filter(f =>
    ['many2one', 'one2many', 'many2many'].includes(f.type)
  );
  
  if (relationalFields.length > 10) {
    capabilities.warnings.push(
      "Complex relational model: deep relation traversals may be slow"
    );
    capabilities.max_relation_depth = 1;
  }
  
  // Model-specific limitations
  if (modelDef.name.includes('mail.') || modelDef.name.includes('ir.')) {
    capabilities.limitations.push(
      "System model: some operations may be restricted"
    );
    capabilities.max_relation_depth = 1;
    capabilities.supports_read_group = false; // Often unreliable on system models
  }
  
  // Check for polymorphic relations (res_model + res_id pattern)
  const hasPolymorphic = fields.some(f =>
    f.name === 'res_id' || f.name === 'res_model'
  );
  
  if (hasPolymorphic) {
    capabilities.limitations.push(
      "Contains polymorphic relations: these cannot be traversed"
    );
  }
  
  return capabilities;
}

/**
 * Detect capabilities for all models in schema
 * 
 * @param {Object} env - Worker environment
 * @param {Object} schema - SchemaSnapshot
 * @returns {Promise<Map<string, ModelCapabilities>>}
 */
export async function detectAllCapabilities(env, schema) {
  const capabilitiesMap = new Map();
  
  for (const [modelName, modelDef] of Object.entries(schema.models)) {
    try {
      const capabilities = await detectModelCapabilities(env, modelDef);
      capabilitiesMap.set(modelName, capabilities);
    } catch (error) {
      console.error(`Failed to detect capabilities for ${modelName}:`, error.message);
      // Provide minimal fallback capabilities
      capabilitiesMap.set(modelName, getMinimalCapabilities());
    }
  }
  
  return capabilitiesMap;
}

/**
 * Get minimal fallback capabilities
 * 
 * @returns {ModelCapabilities}
 */
function getMinimalCapabilities() {
  return {
    supports_search: true,
    supports_read: true,
    supports_read_group: false,
    supports_aggregation: false,
    max_group_by_fields: 0,
    supports_relation_traversal: false,
    max_relation_depth: 0,
    relation_traversal_performance: 'slow',
    estimated_record_count: 0,
    large_dataset: false,
    text_search_available: true,
    full_text_search: false,
    limitations: ["Capability detection failed - using minimal capabilities"],
    warnings: []
  };
}

/**
 * Serialize capabilities to plain object
 * 
 * Converts Map to object for JSON serialization
 * 
 * @param {Map<string, ModelCapabilities>} capabilitiesMap
 * @returns {Object}
 */
export function serializeCapabilities(capabilitiesMap) {
  const obj = {};
  for (const [modelName, capabilities] of capabilitiesMap) {
    obj[modelName] = capabilities;
  }
  return obj;
}
