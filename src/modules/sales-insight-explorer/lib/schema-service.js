/**
 * Schema Service
 * 
 * Handles Odoo schema introspection, versioning, and caching.
 * Provides SchemaSnapshot with full model and field definitions.
 * 
 * SPEC COMPLIANCE:
 * - Section 2.1: SchemaSnapshot structure
 * - Section 3.1: Schema endpoints
 * - Correction 3: Capability detection
 * 
 * @module modules/sales-insight-explorer/lib/schema-service
 */

import { executeKw } from '../../../lib/odoo.js';

/**
 * @typedef {Object} FieldDefinition
 * @property {string} name - Technical name (e.g., "partner_id")
 * @property {string} label - Human-readable label
 * @property {string} [description] - Field help text
 * @property {string} type - Field type: char, text, integer, float, monetary, boolean, date, datetime, selection, many2one, one2many, many2many, html, binary
 * @property {boolean} required - Whether field is required
 * @property {boolean} readonly - Whether field is readonly
 * @property {string} [relation] - Target model for relational fields (e.g., "res.partner")
 * @property {string} [relation_field] - Reverse field name for o2m/m2m
 * @property {Array<{key: string, label: string}>} [selection] - Options for selection fields
 * @property {[number, number]} [digits] - Precision for float/monetary [total_digits, decimal_places]
 */

/**
 * @typedef {Object} ModelDefinition
 * @property {string} name - Technical model name (e.g., "crm.lead")
 * @property {string} label - Human-readable label
 * @property {string} [description] - Model description
 * @property {Object.<string, FieldDefinition>} fields - Map of field definitions
 */

/**
 * @typedef {Object} SchemaSnapshot
 * @property {string} version - Semver or timestamp-based version
 * @property {string} generated_at - ISO timestamp of generation
 * @property {string} odoo_version - Odoo version information
 * @property {Object.<string, ModelDefinition>} models - Map of model definitions
 */

/**
 * Introspect Odoo schema for specified models
 * 
 * @param {Object} env - Worker environment
 * @param {Array<string>} [modelNames] - Specific models to introspect (defaults to key models)
 * @returns {Promise<SchemaSnapshot>}
 */
export async function introspectSchema(env, modelNames = null) {
  const targetModels = modelNames || getDefaultModels();
  const models = {};
  const errors = {}; // Track errors per model
  
  // DEBUG: Log environment
  console.log('🔍 SCHEMA SERVICE DEBUG:');
  console.log('  env.DB_NAME:', JSON.stringify(env.DB_NAME));
  console.log('  env.DB_NAME length:', env.DB_NAME ? env.DB_NAME.length : 'null');
  console.log('  env.DB_NAME bytes:', env.DB_NAME ? Array.from(env.DB_NAME).map(c => c.charCodeAt(0)) : 'null');
  
  // Get Odoo version
  const odooVersion = await getOdooVersion(env);
  
  // Introspect each model
  for (const modelName of targetModels) {
    try {
      console.log(`🔍 Introspecting model: ${modelName}`);
      const modelDef = await introspectModel(env, modelName);
      if (modelDef) {
        models[modelName] = modelDef;
        console.log(`✅ Successfully introspected ${modelName}: ${Object.keys(modelDef.fields).length} fields`);
      } else {
        console.log(`⚠️  Model ${modelName} returned null`);
        errors[modelName] = 'Returned null';
      }
    } catch (error) {
      console.error(`❌ Failed to introspect model ${modelName}:`, error.message);
      console.error(`   Stack:`, error.stack);
      errors[modelName] = error.message;
      // Continue with other models
    }
  }
  
  console.log(`📊 Introspection complete: ${Object.keys(models).length}/${targetModels.length} models successful`);
  if (Object.keys(errors).length > 0) {
    console.log(`❌ Errors:`, errors);
  }
  
  return {
    version: generateSchemaVersion(),
    generated_at: new Date().toISOString(),
    odoo_version: odooVersion,
    models,
    _debug: {
      errors,
      attempted_models: targetModels,
      env_db_name: env.DB_NAME,
      env_db_name_length: env.DB_NAME ? env.DB_NAME.length : null,
      env_db_name_bytes: env.DB_NAME ? Array.from(env.DB_NAME).map(c => c.charCodeAt(0)) : null
    }
  };
}

/**
 * Introspect single Odoo model
 * 
 * Uses Odoo's fields_get() method to retrieve complete field definitions
 * 
 * @param {Object} env - Worker environment
 * @param {string} modelName - Technical model name
 * @returns {Promise<ModelDefinition>}
 */
async function introspectModel(env, modelName) {
  // Get model info from ir.model
  const modelInfo = await getModelInfo(env, modelName);
  
  // Get all fields using fields_get()
  const fieldsData = await executeKw(env, {
    model: modelName,
    method: 'fields_get',
    args: [],
    kwargs: {
      attributes: [
        'string',        // Label
        'help',          // Description
        'type',          // Field type
        'required',      // Required flag
        'readonly',      // Readonly flag
        'relation',      // Target model for relational fields
        'relation_field', // Reverse field
        'selection',     // Selection options
        'digits'         // Precision for numeric fields
      ]
    }
  });
  
  // Transform to our FieldDefinition format
  const fields = {};
  for (const [fieldName, fieldData] of Object.entries(fieldsData)) {
    fields[fieldName] = normalizeFieldDefinition(fieldName, fieldData);
  }
  
  return {
    name: modelName,
    label: modelInfo?.name || modelName,
    description: modelInfo?.info || undefined,
    fields
  };
}

/**
 * Get model metadata from ir.model
 * 
 * @param {Object} env - Worker environment
 * @param {string} modelName - Technical model name
 * @returns {Promise<Object|null>}
 */
async function getModelInfo(env, modelName) {
  try {
    const results = await executeKw(env, {
      model: 'ir.model',
      method: 'search_read',
      args: [[['model', '=', modelName]]],
      kwargs: {
        fields: ['name', 'info', 'model'],
        limit: 1
      }
    });
    
    return results && results.length > 0 ? results[0] : null;
  } catch (error) {
    console.warn(`Could not fetch ir.model info for ${modelName}:`, error.message);
    return null;
  }
}

/**
 * Normalize Odoo field data to FieldDefinition format
 * 
 * @param {string} fieldName - Technical field name
 * @param {Object} fieldData - Raw Odoo field data
 * @returns {FieldDefinition}
 */
function normalizeFieldDefinition(fieldName, fieldData) {
  const definition = {
    name: fieldName,
    label: fieldData.string || fieldName,
    type: normalizeFieldType(fieldData.type),
    required: fieldData.required || false,
    readonly: fieldData.readonly || false
  };
  
  // Add description if available
  if (fieldData.help) {
    definition.description = fieldData.help;
  }
  
  // Add relational field properties
  if (fieldData.relation) {
    definition.relation = fieldData.relation;
  }
  
  if (fieldData.relation_field) {
    definition.relation_field = fieldData.relation_field;
  }
  
  // Add selection options
  if (fieldData.selection && Array.isArray(fieldData.selection)) {
    definition.selection = fieldData.selection.map(([key, label]) => ({
      key: String(key),
      label: String(label)
    }));
  }
  
  // Add numeric precision
  if (fieldData.digits && Array.isArray(fieldData.digits)) {
    definition.digits = fieldData.digits;
  }
  
  return definition;
}

/**
 * Normalize Odoo field type to our standard types
 * 
 * @param {string} odooType - Odoo's field type
 * @returns {string}
 */
function normalizeFieldType(odooType) {
  // Map Odoo types to our standard types
  const typeMap = {
    'char': 'char',
    'text': 'text',
    'integer': 'integer',
    'float': 'float',
    'monetary': 'monetary',
    'boolean': 'boolean',
    'date': 'date',
    'datetime': 'datetime',
    'selection': 'selection',
    'many2one': 'many2one',
    'one2many': 'one2many',
    'many2many': 'many2many',
    'html': 'html',
    'binary': 'binary'
  };
  
  return typeMap[odooType] || odooType;
}

/**
 * Get Odoo version information
 * 
 * @param {Object} env - Worker environment
 * @returns {Promise<string>}
 */
async function getOdooVersion(env) {
  try {
    // Try to get version from server_version endpoint
    const version = await executeKw(env, {
      model: 'ir.config_parameter',
      method: 'get_param',
      args: ['web.base.version.community.version']
    });
    
    return version || 'unknown';
  } catch (error) {
    console.warn('Could not fetch Odoo version:', error.message);
    return 'unknown';
  }
}

/**
 * Generate schema version identifier
 * 
 * Uses timestamp-based versioning for simplicity
 * 
 * @returns {string} Version string (e.g., "2026.01.21.143052")
 */
function generateSchemaVersion() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  
  return `${year}.${month}.${day}.${hour}${minute}${second}`;
}

/**
 * Get default models to introspect
 * 
 * Focuses on key sales-related models
 * 
 * @returns {Array<string>}
 */
function getDefaultModels() {
  return [
    'crm.lead',           // Opportunities/Leads
    'res.partner',        // Customers/Contacts
    'crm.stage',          // CRM Stages
    'mail.activity',      // Activities
    'calendar.event',     // Meetings/Events
    'sale.order',         // Sales Orders (if available)
    'product.product'     // Products (if available)
  ];
}

/**
 * Detect schema changes between two snapshots
 * 
 * @param {SchemaSnapshot} oldSchema - Previous schema
 * @param {SchemaSnapshot} newSchema - New schema
 * @returns {Object} Change summary
 */
export function detectSchemaChanges(oldSchema, newSchema) {
  const changes = {
    models_added: [],
    models_removed: [],
    fields_added: [],
    fields_removed: [],
    fields_modified: []
  };
  
  const oldModels = new Set(Object.keys(oldSchema.models));
  const newModels = new Set(Object.keys(newSchema.models));
  
  // Detect added/removed models
  for (const model of newModels) {
    if (!oldModels.has(model)) {
      changes.models_added.push(model);
    }
  }
  
  for (const model of oldModels) {
    if (!newModels.has(model)) {
      changes.models_removed.push(model);
    }
  }
  
  // Detect field changes in common models
  const commonModels = [...newModels].filter(m => oldModels.has(m));
  
  for (const modelName of commonModels) {
    const oldFields = oldSchema.models[modelName].fields;
    const newFields = newSchema.models[modelName].fields;
    
    const oldFieldNames = new Set(Object.keys(oldFields));
    const newFieldNames = new Set(Object.keys(newFields));
    
    // Added fields
    for (const field of newFieldNames) {
      if (!oldFieldNames.has(field)) {
        changes.fields_added.push({ model: modelName, field });
      }
    }
    
    // Removed fields
    for (const field of oldFieldNames) {
      if (!newFieldNames.has(field)) {
        changes.fields_removed.push({ model: modelName, field });
      }
    }
    
    // Modified fields (type change, relation change, etc.)
    for (const field of newFieldNames) {
      if (oldFieldNames.has(field)) {
        const oldDef = oldFields[field];
        const newDef = newFields[field];
        
        const modifications = [];
        
        if (oldDef.type !== newDef.type) {
          modifications.push(`type: ${oldDef.type} → ${newDef.type}`);
        }
        
        if (oldDef.relation !== newDef.relation) {
          modifications.push(`relation: ${oldDef.relation} → ${newDef.relation}`);
        }
        
        if (oldDef.required !== newDef.required) {
          modifications.push(`required: ${oldDef.required} → ${newDef.required}`);
        }
        
        if (modifications.length > 0) {
          changes.fields_modified.push({
            model: modelName,
            field,
            changes: modifications
          });
        }
      }
    }
  }
  
  return changes;
}

/**
 * Cache schema snapshot in KV
 * 
 * @param {Object} env - Worker environment
 * @param {SchemaSnapshot} schema - Schema to cache
 * @param {number} [ttl=3600] - TTL in seconds (default 1 hour)
 */
export async function cacheSchema(env, schema, ttl = 3600) {
  const cacheKey = 'sales_insights:schema:current';
  
  await env.MAPPINGS_KV.put(cacheKey, JSON.stringify({
    schema,
    cached_at: new Date().toISOString()
  }), {
    expirationTtl: ttl
  });
}

/**
 * Retrieve cached schema from KV
 * 
 * @param {Object} env - Worker environment
 * @returns {Promise<{schema: SchemaSnapshot, cached_at: string}|null>}
 */
export async function getCachedSchema(env) {
  const cacheKey = 'sales_insights:schema:current';
  
  const cached = await env.MAPPINGS_KV.get(cacheKey, 'json');
  return cached;
}

/**
 * Invalidate schema cache
 * 
 * @param {Object} env - Worker environment
 */
export async function invalidateSchemaCache(env) {
  const cacheKey = 'sales_insights:schema:current';
  await env.MAPPINGS_KV.delete(cacheKey);
}
