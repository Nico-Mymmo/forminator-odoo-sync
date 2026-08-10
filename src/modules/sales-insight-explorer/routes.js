/**
 * Sales Insight Explorer Routes
 * 
 * API endpoints for schema introspection and query operations.
 * 
 * SPEC COMPLIANCE:
 * - Section 3.1: Schema endpoints
 * - Section 3.2: Query endpoints
 * 
 * @module modules/sales-insight-explorer/routes
 */

import { 
  introspectSchema, 
  getCachedSchema, 
  ensureSchema,
  cacheSchema, 
  SCHEMA_CACHE_TTL_SECONDS,
  invalidateSchemaCache,
  detectSchemaChanges
} from './lib/schema-service.js';
import { 
  detectAllCapabilities, 
  serializeCapabilities 
} from './lib/capability-detection.js';
import { validateQuery, assessQueryComplexity } from './lib/query-validator.js';
import { validateQueryStructure } from './lib/query-models.js';
import { executeQuery } from './lib/query-executor.js';
import { validateSemanticQuery, SemanticError } from './lib/semantic-validator.js';
import { translateSemanticQuery, describeSemanticQuery } from './lib/semantic-translator.js';
import { generatePresetQueries } from './lib/preset-generator.js';
import { 
  saveQuery, 
  getQueryById, 
  listQueries, 
  deleteQuery, 
  updateQuery 
} from './lib/query-repository.js';
import {
  syncSharedQueryForSavedSearch,
  removeSharedQueryForSavedSearch
} from './lib/saved-search-sharing.js';
import {
  validateDiscoveryToken,
  describeSharedQuery,
  describeAllSharedQueries
} from './lib/mini-app-discovery.js';
import { normalizeToExportResult } from './lib/export/export-normalizer.js';
import exportRegistry from './lib/export/export-registry.js';
import jsonExporter from './lib/export/export-json.js';
import xlsxExporter from './lib/export/export-xlsx.js';
import { queryBuilderUI } from './ui.js';
import { runPhase0Validation } from './tests/phase0-validation.js';
import { searchRead, executeKw } from '../../lib/odoo.js';
// Graph-driven querysysteem: één graaf, één cascade-motor, voor de wizard EN
// voor mini-apps (via lib/mini-app-bridge.js). De 13 hand-geschreven
// enrichment-bestanden die hier vroeger geimporteerd werden zijn vervangen door
// declaraties in lib/graph/graph-nodes.js + lib/graph/graph-edges.js.
import { executeCascade, CascadeError } from './lib/graph/cascade-executor.js';
import { isCascadeQuery, collectAliases } from './lib/graph/cascade-models.js';
import { getGraph } from './lib/graph/graph-service.js';
import { requireAuth } from '../../lib/auth/middleware.js';
import { leadWebActivity, listWebVisitors } from './web-activity-routes.js';
import { getSupabaseClient } from '../../lib/database.js';
// Register export formats
exportRegistry.register('json', jsonExporter);
exportRegistry.register('xlsx', xlsxExporter);

/**
 * GET /api/sales-insights/schema
 * 
 * Retrieve current Odoo schema snapshot with capabilities
 * 
 * Query params:
 * - models: Comma-separated list of specific models (optional)
 * - force_refresh: Set to 'true' to bypass cache (optional)
 */
async function getSchema(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('force_refresh') === 'true';
  const modelsParam = url.searchParams.get('models');
  const modelNames = modelsParam ? modelsParam.split(',').map(m => m.trim()) : null;
  
  try {
    let schemaData;
    
    // Try cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedSchema(env);
      if (cached) {
        console.log('📦 Returning cached schema');
        
        // Generate presets from cached schema
        const presets = generatePresetQueries(cached.schema, cached.capabilities || {});
        
        // Return cached data
        return new Response(JSON.stringify({
          success: true,
          data: {
            schema: cached.schema,
            capabilities: cached.capabilities || {},
            presets,
            cached_at: cached.cached_at,
            cache_ttl: SCHEMA_CACHE_TTL_SECONDS,
            from_cache: true
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    console.log('🔄 Introspecting Odoo schema...');
    
    // Introspect schema
    const schema = await introspectSchema(env, modelNames);
    
    console.log('🔍 Detecting model capabilities...');
    
    // Detect capabilities
    const capabilitiesMap = await detectAllCapabilities(env, schema);
    const capabilities = serializeCapabilities(capabilitiesMap);
    
    // Cache the result -- via cacheSchema(), zodat de TTL op één plek staat
    // (SCHEMA_CACHE_TTL_SECONDS) en het formaat gelijk blijft met ensureSchema().
    const cacheData = {
      schema,
      capabilities,
      cached_at: new Date().toISOString()
    };
    
    await cacheSchema(env, schema, capabilities);
    
    console.log('✅ Schema introspection complete');
    
    // Generate presets
    console.log('🎯 Generating preset queries...');
    const presets = generatePresetQueries(schema, capabilities);
    console.log(`✅ Generated ${presets.length} valid preset queries`);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        schema,
        capabilities,
        presets,
        cached_at: cacheData.cached_at,
        cache_ttl: SCHEMA_CACHE_TTL_SECONDS,
        from_cache: false
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Schema introspection failed:', error);
    console.error('Error stack:', error.stack);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'SCHEMA_INTROSPECTION_FAILED',
        stack: error.stack,
        hint: 'Check Odoo credentials (DB_NAME, UID, API_KEY) in .dev.vars'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/schema/refresh
 * 
 * Force schema refresh and detect changes
 * 
 * Body:
 * - full_refresh: boolean (default false)
 */
async function refreshSchema(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const fullRefresh = body.full_refresh || false;
    
    console.log('🔄 Refreshing schema...');
    
    // Get old schema for comparison
    let oldSchema = null;
    if (!fullRefresh) {
      const cached = await getCachedSchema(env);
      if (cached && cached.schema) {
        oldSchema = cached.schema;
      }
    }
    
    // Invalidate cache
    await invalidateSchemaCache(env);
    
    // Get new schema
    const newSchema = await introspectSchema(env);
    
    // Detect capabilities
    const capabilitiesMap = await detectAllCapabilities(env, newSchema);
    const capabilities = serializeCapabilities(capabilitiesMap);
    
    // Detect changes
    let changes = null;
    if (oldSchema) {
      changes = detectSchemaChanges(oldSchema, newSchema);
      console.log('📊 Schema changes detected:', {
        models_added: changes.models_added.length,
        models_removed: changes.models_removed.length,
        fields_added: changes.fields_added.length,
        fields_removed: changes.fields_removed.length,
        fields_modified: changes.fields_modified.length
      });
    }
    
    // Cache new schema -- via cacheSchema(), zodat de TTL op één plek staat
    // (SCHEMA_CACHE_TTL_SECONDS) en het formaat gelijk blijft met ensureSchema().
    await cacheSchema(env, newSchema, capabilities);
    
    console.log('✅ Schema refresh complete');
    
    // Generate presets
    console.log('🎯 Generating preset queries...');
    const presets = generatePresetQueries(newSchema, capabilities);
    console.log(`✅ Generated ${presets.length} valid preset queries`);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        schema: newSchema,
        capabilities,
        presets,
        changes: changes || {
          models_added: [],
          models_removed: [],
          fields_added: [],
          fields_removed: [],
          fields_modified: []
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Schema refresh failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'SCHEMA_REFRESH_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/query/validate
 * 
 * Validate query definition without execution
 * 
 * Body:
 * - query: QueryDefinition object
 */
async function validateQueryEndpoint(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    if (!body.query) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required field: query',
          code: 'MISSING_QUERY'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const query = body.query;
    
    // Structural validation
    const structureCheck = validateQueryStructure(query);
    if (!structureCheck.is_valid) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          is_valid: false,
          errors: structureCheck.errors.map(msg => ({
            path: 'query',
            message: msg,
            code: 'STRUCTURAL_ERROR'
          })),
          warnings: []
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get schema and capabilities
    const cached = await ensureSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { schema, capabilities } = cached;
    
    // Validate against schema and capabilities
    const validation = validateQuery(query, schema, capabilities || {});
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        is_valid: validation.is_valid,
        errors: validation.errors,
        warnings: validation.warnings,
        complexity_assessment: validation.complexity,
        capabilities_check: {
          model: query.base_model,
          meets_requirements: validation.is_valid,
          limitations: capabilities?.[query.base_model]?.limitations || []
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Query validation failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'VALIDATION_ERROR'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/query/run
 * 
 * Execute query and return results
 * 
 * Body:
 * - query: QueryDefinition object
 * - mode: "preview" | "full" (default: "full")
 */
async function runQuery(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    if (!body.query) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required field: query',
          code: 'MISSING_QUERY'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const query = body.query;
    const mode = body.mode || 'full';
    const isPreview = mode === 'preview';
    
    console.log(`🚀 Executing query: ${query.base_model} (mode: ${mode})`);
    
    // Get schema and capabilities
    const cached = await ensureSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { schema, capabilities } = cached;
    
    // Execute query
    const result = await executeQuery(
      query,
      schema,
      capabilities || {},
      env,
      { preview: isPreview }
    );
    
    console.log(`✅ Query executed: ${result.records.length} records, path: ${result.meta.execution_path}`);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        records: result.records,
        meta: result.meta,
        schema_context: {
          version: schema.version,
          base_model: query.base_model,
          fields: query.fields,
          generated_at: new Date().toISOString()
        },
        query_definition: query
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Query execution failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'QUERY_EXECUTION_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/query/preview
 * 
 * Execute query in preview mode (convenience endpoint)
 * 
 * Body:
 * - query: QueryDefinition object
 */
async function previewQuery(context) {
  const { request, env } = context;
  // Reuse runQuery but force preview mode
  const body = await request.json();
  const modifiedRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      mode: 'preview'
    })
  });
  
  return runQuery({ ...context, request: modifiedRequest });
}

/**
 * POST /api/sales-insights/query/save
 * 
 * Save a validated query to database
 * 
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - query: QueryDefinition (required)
 * - source: 'preset' | 'user' (default: 'user')
 */
async function saveQueryEndpoint(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    // Validate request body
    if (!body.name || !body.query) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required fields: name, query',
          code: 'INVALID_REQUEST'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { name, description, query, source = 'user' } = body;
    
    // MANDATORY VALIDATION
    console.log('🔍 Validating query before save...');
    
    const cached = await ensureSchema(env);
    if (!cached) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const validation = validateQuery(query, cached.schema, cached.capabilities);
    
    if (!validation.is_valid) {
      console.log('❌ Validation failed - query NOT saved');
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Query validation failed',
          code: 'VALIDATION_FAILED',
          validation_errors: validation.errors
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Assess complexity
    const complexity = assessQueryComplexity(query, cached.schema, cached.capabilities[query.base_model] || {});
    
    // Save to database
    console.log('💾 Saving validated query...');
    const savedQuery = await saveQuery(env, {
      name,
      description,
      query_definition: query,
      source,
      complexity_hint: complexity.guidance_level
    });
    
    console.log('✅ Query saved:', savedQuery.id);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: savedQuery.id,
        name: savedQuery.name,
        description: savedQuery.description,
        base_model: savedQuery.base_model,
        source: savedQuery.source,
        complexity_hint: savedQuery.complexity_hint,
        created_at: savedQuery.created_at
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Save query failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'SAVE_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/query/instantiate-preset
 * 
 * Turn a preset into a saved user query
 * 
 * Body:
 * - preset_id: string (required)
 * - name: string (optional - uses preset name if not provided)
 */
async function instantiatePreset(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    if (!body.preset_id) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required field: preset_id',
          code: 'INVALID_REQUEST'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { preset_id, name } = body;
    
    // Get current schema and presets
    console.log('🔍 Fetching preset:', preset_id);
    
    const cached = await ensureSchema(env);
    if (!cached) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate presets
    const presets = generatePresetQueries(cached.schema, cached.capabilities);
    
    // Find preset by ID
    const preset = presets.find(p => p.id === preset_id);
    
    if (!preset) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: `Preset not found: ${preset_id}`,
          code: 'PRESET_NOT_FOUND'
        }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // VALIDATE AGAIN (preset might have become invalid)
    console.log('🔍 Re-validating preset...');
    const validation = validateQuery(preset.query, cached.schema, cached.capabilities);
    
    if (!validation.is_valid) {
      console.log('❌ Preset is no longer valid - cannot instantiate');
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Preset is no longer valid (schema may have changed)',
          code: 'PRESET_INVALID',
          validation_errors: validation.errors
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Save as user query
    console.log('💾 Instantiating preset as user query...');
    const savedQuery = await saveQuery(env, {
      name: name || preset.name,
      description: preset.description,
      query_definition: preset.query,
      source: 'user', // Instantiated presets become user queries
      complexity_hint: preset.complexity_hint
    });
    
    console.log('✅ Preset instantiated:', savedQuery.id);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: savedQuery.id,
        name: savedQuery.name,
        description: savedQuery.description,
        base_model: savedQuery.base_model,
        source: savedQuery.source,
        complexity_hint: savedQuery.complexity_hint,
        created_at: savedQuery.created_at,
        original_preset_id: preset_id
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Instantiate preset failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'INSTANTIATE_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/sales-insights/query/list
 * 
 * List all saved queries
 * 
 * Query params:
 * - base_model: Filter by base model (optional)
 * - source: Filter by source ('preset' or 'user') (optional)
 * - limit: Max results (default: 100)
 * - offset: Pagination offset (default: 0)
 */
async function listSavedQueries(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const baseModel = url.searchParams.get('base_model');
    const source = url.searchParams.get('source');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    
    console.log('📋 Listing saved queries...');
    
    const queries = await listQueries(env, {
      base_model: baseModel,
      source,
      limit,
      offset
    });
    
    // Return summary only (not full query_definition)
    const summary = queries.map(q => ({
      id: q.id,
      name: q.name,
      description: q.description,
      base_model: q.base_model,
      source: q.source,
      complexity_hint: q.complexity_hint,
      created_at: q.created_at,
      updated_at: q.updated_at,
      is_shared_mini_apps: q.is_shared_mini_apps || false,
      mini_app_parameters: Array.isArray(q.mini_app_parameters) ? q.mini_app_parameters : []
    }));
    
    console.log(`✅ Found ${summary.length} queries`);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        queries: summary,
        count: summary.length,
        limit,
        offset
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ List queries failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'LIST_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/query/run/:id
 * 
 * Execute a saved query by ID
 * 
 * URL params:
 * - id: Query UUID
 * 
 * Body (optional):
 * - mode: 'preview' | 'full' (default: 'full')
 */
async function runSavedQuery(context) {
  const { request, env, params } = context;
  try {
    const queryId = params.id;
    
    if (!queryId) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing query ID',
          code: 'INVALID_REQUEST'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log('🔍 Fetching saved query:', queryId);
    
    // Fetch saved query
    const savedQuery = await getQueryById(env, queryId);
    
    if (!savedQuery) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: `Query not found: ${queryId}`,
          code: 'QUERY_NOT_FOUND'
        }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get mode from body (if provided)
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || 'full';
    
    console.log(`🚀 Executing saved query: ${savedQuery.name}`);
    
    // Get schema and capabilities
    const cached = await ensureSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { schema, capabilities } = cached;
    
    // Execute using existing engine
    const result = await executeQuery(
      savedQuery.query_definition,
      schema,
      capabilities || {},
      env,
      { preview: mode === 'preview' }
    );
    
    console.log('✅ Query executed successfully');
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        ...result,
        saved_query_info: {
          id: savedQuery.id,
          name: savedQuery.name,
          description: savedQuery.description,
          source: savedQuery.source,
          created_at: savedQuery.created_at
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Run saved query failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'EXECUTION_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/query/run/:id/export
 * 
 * Export a saved query to specified format.
 * 
 * Flow: Fetch → Execute → Normalize → Export → Download
 * 
 * Body:
 * - format: 'json' | 'csv' (required)
 * - mode: 'preview' | 'full' (optional, default: 'full')
 */
async function exportSavedQuery(context) {
  const { request, env, params } = context;
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const format = body.format;
    const mode = body.mode || 'full';
    
    // Validate format parameter
    if (!format) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required parameter: format',
          code: 'MISSING_PARAMETER',
          details: {
            supported_formats: exportRegistry.listFormats()
          }
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!exportRegistry.supports(format)) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: `Unsupported export format: ${format}`,
          code: 'UNSUPPORTED_FORMAT',
          details: {
            requested_format: format,
            supported_formats: exportRegistry.listFormats()
          }
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate mode parameter
    if (mode !== 'preview' && mode !== 'full') {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Invalid mode. Must be "preview" or "full"',
          code: 'INVALID_PARAMETER'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📤 Exporting saved query ${params.id} to ${format} (mode: ${mode})`);
    
    // Step 1: Fetch saved query
    const savedQuery = await getQueryById(env, params.id);
    
    if (!savedQuery) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Query not found',
          code: 'NOT_FOUND',
          details: { query_id: params.id }
        }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`  Found query: "${savedQuery.name}"`);
    
    // Step 2: Get schema and capabilities
    const cached = await ensureSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { schema, capabilities } = cached;
    
    // Step 3: Execute query
    const result = await executeQuery(
      savedQuery.query_definition,
      schema,
      capabilities || {},
      env,
      { preview: mode === 'preview' }
    );
    
    if (!result || !result.records) {
      throw new Error('Query execution failed to return records');
    }
    
    console.log(`  Executed query: ${result.records.length} records`);
    
    // Step 4: Normalize to ExportResult
    const exportResult = normalizeToExportResult(result, {
      id: savedQuery.id,
      name: savedQuery.name
    });
    
    console.log(`  Normalized to ExportResult: ${exportResult.fields.length} fields, ${exportResult.rows.length} rows`);
    
    // Step 5: Export to requested format
    const exportedContent = exportRegistry.export(format, exportResult);
    
    console.log(`  Exported to ${format}: ${exportedContent.length} bytes`);
    
    // Step 6: Return as downloadable file
    const mimeType = exportRegistry.getMimeType(format);
    const fileExtension = exportRegistry.getFileExtension(format);
    const filename = `${sanitizeFilename(savedQuery.name)}_${params.id.slice(0, 8)}${fileExtension}`;
    
    console.log('✅ Export complete');
    
    return new Response(exportedContent, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Query-ID': savedQuery.id,
        'X-Query-Name': savedQuery.name,
        'X-Export-Format': format,
        'X-Record-Count': String(exportResult.rows.length)
      }
    });
    
  } catch (error) {
    console.error('❌ Export failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'EXPORT_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Sanitize filename for safe download.
 * 
 * @param {string} name - Original name
 * @returns {string} - Safe filename
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')  // Replace unsafe chars with underscore
    .replace(/\s+/g, '_')                 // Replace spaces with underscore
    .substring(0, 100);                   // Limit length
}

/**
 * GET / (module root)
 * 
 * Query Builder UI
 */
async function queryBuilderPage(context) {
  if (!context.user) {
    return Response.redirect(new URL('/', context.request.url), 302);
  }
  
  return new Response(queryBuilderUI(context.user), {
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * GET /app.js
 * 
 * Serve client-side JavaScript application
 */
async function serveAppJS(context) {
  try {
    // Read from public directory
    const appJS = await context.env.ASSETS.fetch(new URL('/sales-insights-app.js', context.request.url));
    return appJS;
  } catch (error) {
    return new Response('// App JS not found', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
}

/**
 * GET /components/:filename
 * 
 * Serve component modules
 */
async function serveComponent(context) {
  const { params } = context;
  const filename = params.filename;
  
  try {
    // Dynamically import and serve component
    let componentModule;
    
    switch (filename) {
      case 'guided-wizard.js':
        componentModule = await import('./components/guided-wizard.js');
        break;
      case 'layer1-selector.js':
        componentModule = await import('./components/layer1-selector.js');
        break;
      case 'layer2-filters.js':
        componentModule = await import('./components/layer2-filters.js');
        break;
      case 'layer3-presentation.js':
        componentModule = await import('./components/layer3-presentation.js');
        break;
      default:
        return new Response('Component not found', { status: 404 });
    }
    
    // Re-export the module
    const exports = Object.keys(componentModule).map(key => 
      `export { ${key} } from './components/${filename}';`
    ).join('\n');
    
    return new Response(exports, {
      headers: { 
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Component serve error:', error);
    return new Response(`// Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
}

/**
 * GET /lib/:filename
 * 
 * Serve library modules
 */
async function serveLib(context) {
  const { params } = context;
  const filename = params.filename;
  
  try {
    let libModule;
    
    switch (filename) {
      case 'semantic-validator.js':
        libModule = await import('./lib/semantic-validator.js');
        break;
      case 'semantic-translator.js':
        libModule = await import('./lib/semantic-translator.js');
        break;
      default:
        return new Response('Library not found', { status: 404 });
    }
    
    // Re-export the module
    const exports = Object.keys(libModule).map(key => 
      `export { ${key} } from './lib/${filename}';`
    ).join('\n');
    
    return new Response(exports, {
      headers: { 
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Library serve error:', error);
    return new Response(`// Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
}

/**
 * GET /config/:filename
 * 
 * Serve config modules
 */
async function serveConfig(context) {
  const { params } = context;
  const filename = params.filename;
  
  try {
    let configModule;
    
    switch (filename) {
      case 'semantic-layers.js':
        configModule = await import('./config/semantic-layers.js');
        break;
      case 'context-filters.js':
        configModule = await import('./config/context-filters.js');
        break;
      case 'presentation-modes.js':
        configModule = await import('./config/presentation-modes.js');
        break;
      default:
        return new Response('Config not found', { status: 404 });
    }
    
    // Re-export the module
    const exports = Object.keys(configModule).map(key => 
      `export { ${key} } from './config/${filename}';`
    ).join('\n');
    
    return new Response(exports, {
      headers: { 
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Config serve error:', error);
    return new Response(`// Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
}

/**
 * GET /api/sales-insights/test/phase0
 * 
 * Run Phase 0 pre-implementation validation tests
 */
async function runPhase0Tests(context) {
  try {
    const { introspectSchema, getCachedSchema } = await import('./lib/schema-service.js');
    const { executeQuery } = await import('./lib/query-executor.js');
    const { detectAllCapabilities } = await import('./lib/capability-detection.js');

    // Get or create schema
    let schema = await getCachedSchema(context.env);
    if (!schema) {
      schema = await introspectSchema(context.env);
    }

    // Get capabilities
    const capabilities = await detectAllCapabilities(context.env, schema);

    // Run validation
    const results = await runPhase0Validation(
      context.env,
      { introspectSchema, getCachedSchema },
      { executeQuery },
      capabilities
    );

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Phase 0 validation failed:', error);
    return new Response(JSON.stringify({
      success: false,
      phase: 0,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/semantic/validate
 * 
 * Validate semantic query definition
 * 
 * Body:
 * - query: SemanticQuery object
 */
async function validateSemanticQueryEndpoint(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    if (!body.query) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required field: query',
          code: 'MISSING_QUERY'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const semanticQuery = body.query;
    
    // Validate semantic query
    try {
      const validation = validateSemanticQuery(semanticQuery);
      
      return new Response(JSON.stringify({
        success: true,
        data: validation
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      if (error instanceof SemanticError) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            valid: false,
            message: error.message,
            explanation: error.explanation,
            suggestions: error.suggestions
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Semantic validation failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'SEMANTIC_VALIDATION_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/semantic/preview
 * 
 * Preview semantic query (10 rows)
 * 
 * Body:
 * - query: SemanticQuery object
 */
async function previewSemanticQuery(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    if (!body.query) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required field: query',
          code: 'MISSING_QUERY'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const semanticQuery = body.query;
    
    console.log('🔍 Validating semantic query...');
    
    // Step 1: Validate semantic query
    try {
      const validation = validateSemanticQuery(semanticQuery);
      if (!validation.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            message: validation.message,
            explanation: validation.explanation,
            suggestions: validation.suggestions,
            code: 'SEMANTIC_VALIDATION_FAILED'
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      if (error instanceof SemanticError) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            message: error.message,
            explanation: error.explanation,
            suggestions: error.suggestions,
            code: 'SEMANTIC_ERROR'
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }
    
    console.log('✅ Semantic validation passed');
    
    // Step 2: Get schema
    const cached = await ensureSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { schema, capabilities } = cached;
    
    console.log('🔄 Translating semantic query to technical query...');
    
    // Step 3: Translate to technical query
    const technicalQuery = translateSemanticQuery(semanticQuery, schema);
    
    console.log('✅ Translation complete');
    console.log('� Technical query:', JSON.stringify(technicalQuery, null, 2));
    console.log('🔍 Validating technical query...');
    
    // Step 4: Validate technical query
    const technicalValidation = await validateQuery(technicalQuery, schema, capabilities || {});
    console.log('📋 Technical validation result:', JSON.stringify(technicalValidation, null, 2));
    if (!technicalValidation.is_valid) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Technical query validation failed',
          technical_errors: technicalValidation.errors,
          technical_query: technicalQuery,
          code: 'TECHNICAL_VALIDATION_FAILED'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ Technical validation passed');
    console.log('⚡ Executing preview query...');
    
    // Step 5: Execute in preview mode
    const result = await executeQuery(
      technicalQuery,
      schema,
      capabilities || {},
      env,
      { preview: true }
    );
    
    console.log(`✅ Preview executed: ${result.records.length} records`);
    
    // Step 6: Generate natural language description
    const description = describeSemanticQuery(semanticQuery);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        records: result.records,
        meta: {
          ...result.meta,
          semantic_description: description,
          preview_mode: true,
          max_records: 10
        },
        semantic_query: semanticQuery,
        technical_query: technicalQuery
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Semantic preview failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'SEMANTIC_PREVIEW_FAILED',
        stack: error.stack
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/sales-insights/graph
 *
 * De volledige graaf (nodes + edges) waarmee de wizard de spiderweb tekent en
 * bepaalt welke cascade-stappen mogelijk zijn. Eén source of truth: de client
 * heeft geen eigen kopie meer, dus de UI kan per definitie niets aanbieden dat
 * de server niet kan uitvoeren.
 */
async function getGraphDefinition() {
  return new Response(JSON.stringify({ success: true, data: getGraph() }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/sales-insights/semantic/run
 *
 * Dunne wrapper rond executeCascade(). Alle uitvoeringslogica zit in
 * lib/graph/cascade-executor.js -- exact dezelfde functie die mini-apps
 * gebruiken via lib/mini-app-bridge.js#runSharedQuery(). Een zoekopdracht die
 * hier draait geeft in een mini-app dus per definitie hetzelfde resultaat.
 *
 * Verwacht een cascade-query (version: 2), zie lib/graph/cascade-models.js.
 *
 * Wat hier vroeger stond en nu declaratief in de graaf zit:
 * - de blokkade op relaties naar crm.lead (die verwees naar een veld
 *   `x_sales_action_sheet.lead_id` dat nooit heeft bestaan -- de echte
 *   koppeling is x_studio_as_opportunity_ids, een many2many);
 * - twaalf if-blokken die elk een eigen enrichment-functie inschakelden;
 * - de model-quirks (crm.lead ook gearchiveerd, res.partner is_company,
 *   mail.message message_type) -> node.baseDomain;
 * - de "zware HTML-velden vereisen een filter"-guard -> node.heavyFields.
 */
async function runSemanticQuery(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();

    if (!isCascadeQuery(payload)) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Deze zoekopdracht heeft een verouderde vorm en kan niet meer uitgevoerd worden. Bouw ze opnieuw op in de wizard.',
          code: 'UNSUPPORTED_QUERY_FORMAT',
          hint: 'Verwacht een cascade-query met version: 2 en een root-node.'
        }
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const isVerifyMode = payload._verify_mode === true;

    const result = await executeCascade(payload, env, {
      preview: payload._preview === true,
      ...(isVerifyMode ? { limitOverride: 25, orderOverride: 'id desc' } : {})
    });

    const exportFormat = payload.export;
    if (exportFormat === 'xlsx' || exportFormat === 'json') {
      console.log(`📤 Exporteren naar ${exportFormat}`);

      // Basisvelden + één synthetisch veld per cascade-alias, zodat de
      // export-laag de geneste __alias-arrays als kolom meeneemt.
      const exportFields = result.meta.fields.map((f) => ({
        field: f,
        model: result.meta.model,
        alias: f
      }));
      for (const entry of collectAliases(payload)) {
        if (entry.depth !== 1) continue;
        exportFields.push({
          field: entry.alias,
          model: result.meta.model,
          alias: entry.alias,
          type: 'json',
          source: 'derived',
          is_synthetic: true,
          description: `Gekoppelde records via ${entry.edge}`
        });
      }

      const exportResult = normalizeToExportResult({
        records: result.records,
        meta: { ...result.meta, preview_mode: false, execution_path: 'cascade' },
        query_definition: { base_model: result.meta.model, fields: exportFields },
        schema_context: { schema_version: 'cascade_v2' }
      }, {
        id: 'cascade_query',
        name: `Cascade Query - ${result.meta.label}`
      });

      const exportedContent = exportRegistry.export(exportFormat, exportResult);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const filename = `sales_insight_${result.meta.model}_${timestamp}${exportRegistry.getFileExtension(exportFormat)}`;

      return new Response(exportedContent, {
        headers: {
          'Content-Type': exportRegistry.getMimeType(exportFormat),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Record-Count': String(result.records.length)
        }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: { records: result.records, meta: result.meta }
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    if (error instanceof CascadeError) {
      console.warn('⚠️ Cascade-query geweigerd:', error.code, error.message);
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: error.message,
          code: error.code,
          ...(error.validation_errors ? { validation_errors: error.validation_errors } : {}),
          ...(error.heavy_fields ? { heavy_fields: error.heavy_fields } : {}),
          ...(error.cap ? { cap: error.cap } : {})
        }
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.error('❌ Cascade-query mislukt:', error);
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message, code: 'ODOO_ERROR', stack: error.stack }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// Sales Insight Admin role guard
// Role: sales_insight_admin or admin
// ============================================================
function hasSalesInsightAdminRole(context) {
  if (!context.user) return false;
  if (context.user.role === 'admin') return true;
  const perms = context.user.modulePermissions?.sales_insight_explorer || [];
  return perms.includes('admin');
}
function guardSalesInsightAdmin(context) {
  if (!hasSalesInsightAdminRole(context)) {
    return new Response(JSON.stringify({ success: false, error: { message: 'Forbidden: Sales Insight admin permission required', code: 'FORBIDDEN' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

/**
 * GET /admin - Sales Insight admin page, manage module permissions.
 * Requires global admin role.
 */
async function salesInsightAdminPage(context) {
  if (!context.user || context.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const { queryBuilderAdminUI } = await import('./ui-admin.js');
  return new Response(queryBuilderAdminUI(context.user), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * GET /api/sales-insights/admin/users
 * Returns users with module access + their permissions.
 */
async function getModuleUsers(context) {
  if (!context.user || context.user.role !== 'admin') return new Response(JSON.stringify({ success: false, error: { message: 'Forbidden' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  try {
    const supabase = getSupabaseClient(context.env);

    // Fetch all active users
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active')
      .eq('is_active', true)
      .order('full_name');
    if (usersError) throw new Error(usersError.message);

    // Fetch user_modules for this module to know who has access + permissions
    const { data: moduleUsers, error: muError } = await supabase
      .from('user_modules')
      .select('id, user_id, permissions, is_enabled, module:modules!inner(code)')
      .eq('module.code', 'sales_insight_explorer');
    if (muError) throw new Error(muError.message);

    // Build lookup: user_id -> user_module record
    const muMap = new Map((moduleUsers || []).map(um => [um.user_id, um]));

    // Merge: every user gets their module status + permissions
    const users = (allUsers || []).map(u => {
      const um = muMap.get(u.id);
      return {
        user: u,
        user_module_id: um?.id || null,
        has_module_access: um?.is_enabled === true,
        permissions: um?.permissions || [],
      };
    });

    return new Response(JSON.stringify({ success: true, data: { users } }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * PUT /api/sales-insights/admin/users/:user_module_id/permissions
 * Update module permissions for a user.
 */
async function toggleModuleAccess(context) {
  if (!context.user || context.user.role !== 'admin') return new Response(JSON.stringify({ success: false, error: { message: 'Forbidden' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  try {
    const { request, env, params } = context;
    const userId = params?.user_id;
    if (!userId) return new Response(JSON.stringify({ success: false, error: { message: 'user_id required' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const body = await request.json();
    const enable = body.enable === true;
    const supabase = getSupabaseClient(env);
    const { data: mod, error: modErr } = await supabase.from('modules').select('id').eq('code', 'sales_insight_explorer').single();
    if (modErr || !mod) throw new Error('Module not found');
    if (enable) {
      const { error } = await supabase.from('user_modules')
        .upsert({ user_id: userId, module_id: mod.id, is_enabled: true, granted_by: context.user.id }, { onConflict: 'user_id,module_id' });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('user_modules')
        .update({ is_enabled: false })
        .eq('user_id', userId).eq('module_id', mod.id);
      if (error) throw new Error(error.message);
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function updateUserModulePermissions(context) {
  if (!context.user || context.user.role !== 'admin') return new Response(JSON.stringify({ success: false, error: { message: 'Forbidden' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  try {
    const { request, env, params } = context;
    const userModuleId = params?.user_module_id;
    if (!userModuleId) return new Response(JSON.stringify({ success: false, error: { message: 'user_module_id required' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const body = await request.json();
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('user_modules').update({ permissions }).eq('id', userModuleId).select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/sales-insights/information-sets
 */
async function getInformationSets(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const model = url.searchParams.get('model') || null;
  try {
    const supabase = getSupabaseClient(env);
    let query = supabase.from('information_sets')
      .select('id, label, description, model, is_submodel_only, sort_order, information_set_fields(id, field_key, label, description, sort_order, strip_html, selection_map)')
      .eq('is_active', true).order('sort_order');
    if (model) query = query.eq('model', model);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const sets = (data || []).map(s => ({ ...s, information_set_fields: (s.information_set_fields || []).sort((a, b) => a.sort_order - b.sort_order) }));
    return new Response(JSON.stringify({ success: true, data: { sets } }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * POST /api/sales-insights/information-sets
 * Create a new information set. Requires sales_insight_admin role.
 */
async function createInformationSet(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  const { request, env } = context;
  try {
    const body = await request.json();
    const { id, label, description, model, sort_order } = body;
    if (!id || !label || !model) return new Response(JSON.stringify({ success: false, error: { message: 'id, label and model are required' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('information_sets')
      .insert({ id, label, description: description || null, model, sort_order: sort_order || 99 })
      .select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * POST /api/sales-insights/information-set-fields
 * Add a field to an information set. Requires sales_insight_admin role.
 */
async function createInformationSetField(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  const { request, env } = context;
  try {
    const body = await request.json();
    const { set_id, field_key, label, description, sort_order, strip_html } = body;
    if (!set_id || !field_key) return new Response(JSON.stringify({ success: false, error: { message: 'set_id and field_key are required' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('information_set_fields')
      .insert({ set_id, field_key, label: label || null, description: description || null, sort_order: sort_order || 99, strip_html: strip_html === true })
      .select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/sales-insights/ai-export-presets
 */
async function getAiExportPresets(context) {
  const { env } = context;
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('ai_export_presets').select('id, label, description, instruction, sort_order').eq('is_active', true).order('sort_order');
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data: { presets: data || [] } }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * POST /api/sales-insights/models
 * Admin only. Create a new model entry.
 * Body: { id, odoo_model, label, description?, can_be_startpoint?, can_be_submodel?, sort_order? }
 */
async function createModel(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { request, env } = context;
    const body = await request.json();
    const { id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order, base_fields } = body ?? {};
    if (!id || !odoo_model || !label) {
      return new Response(JSON.stringify({ success: false, error: { message: 'id, odoo_model en label zijn verplicht' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('models').insert({
      id: id.trim(),
      odoo_model: odoo_model.trim(),
      label: label.trim(),
      description: description || null,
      can_be_startpoint: can_be_startpoint ?? true,
      can_be_submodel: can_be_submodel ?? false,
      sort_order: sort_order ?? 0,
      base_fields: Array.isArray(base_fields) ? base_fields : [],
      is_active: true
    }).select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * PATCH /api/sales-insights/models/:id
 * Admin only. Update label, description, sort_order, can_be_startpoint, can_be_submodel, is_active.
 */
async function updateModel(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { request, env, params } = context;
    const id = params?.id;
    const body = await request.json();
    const updates = {};
    if (body.label       !== undefined) updates.label             = body.label;
    if (body.description !== undefined) updates.description       = body.description;
    if (body.sort_order  !== undefined) updates.sort_order        = body.sort_order;
    if (body.can_be_startpoint !== undefined) updates.can_be_startpoint = body.can_be_startpoint;
    if (body.can_be_submodel   !== undefined) updates.can_be_submodel   = body.can_be_submodel;
    if (body.is_active   !== undefined) updates.is_active         = body.is_active;
    if (body.base_fields !== undefined) updates.base_fields       = Array.isArray(body.base_fields) ? body.base_fields : [];
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('models').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * PATCH /api/sales-insights/query/:id
 * Bewerkt een bestaande opgeslagen query IN PLACE (zelfde id blijft
 * behouden) -- dit is bewust de manier om een query uit te breiden (bv.
 * een veld toevoegen) zonder dat mini-apps die deze query gebruiken
 * opnieuw geconfigureerd moeten worden: mini-apps verwijzen altijd naar
 * een query via het id (window.platform.odoo.runQuery(queryId, ...)), niet
 * naar een kopie van de velden/filters, dus is_shared_mini_apps en
 * mini_app_parameters blijven ongewijzigd en de volgende runQuery()-call
 * geeft gewoon de uitgebreide data terug.
 *
 * Body:
 * - query: QueryDefinition (required) -- wordt opnieuw volledig gevalideerd
 *   tegen de huidige schema/capabilities, net als bij POST .../query/save
 * - name: string (optional)
 * - description: string (optional)
 */
async function updateQueryDefinition(context) {
  const { request, env, params } = context;
  try {
    const id = params?.id;
    const body = await request.json();

    if (!body.query) {
      return new Response(JSON.stringify({
        success: false,
        error: { message: 'Missing required field: query', code: 'MISSING_QUERY' }
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const existing = await getQueryById(env, id);
    if (!existing) {
      return new Response(JSON.stringify({
        success: false,
        error: { message: `Query not found: ${id}`, code: 'QUERY_NOT_FOUND' }
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const cached = await ensureSchema(env);
    if (!cached) {
      return new Response(JSON.stringify({
        success: false,
        error: { message: 'Schema kon niet opgebouwd worden (Odoo onbereikbaar?). Probeer het opnieuw of ververs het schema handmatig.', code: 'SCHEMA_NOT_AVAILABLE' }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const validation = validateQuery(body.query, cached.schema, cached.capabilities);
    if (!validation.is_valid) {
      return new Response(JSON.stringify({
        success: false,
        error: { message: 'Query validation failed', code: 'VALIDATION_FAILED', validation_errors: validation.errors }
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const complexity = assessQueryComplexity(body.query, cached.schema, cached.capabilities[body.query.base_model] || {});
    const updates = { query_definition: body.query, complexity_hint: complexity.guidance_level };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const savedQuery = await updateQuery(env, id, updates);
    return new Response(JSON.stringify({ success: true, data: savedQuery }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('❌ Update query failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message, code: 'UPDATE_FAILED' }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * DELETE /api/sales-insights/models/:id
 * Admin only. Soft-delete (sets is_active = false).
 */
async function deactivateModel(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { env, params } = context;
    const id = params?.id;
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('models').update({ is_active: false }).eq('id', id);
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, deactivated: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/sales-insights/models-config
 */
async function getModelsConfig(context) {
  const { env } = context;
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('models').select('id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order, base_fields').eq('is_active', true).order('sort_order');
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data: { models: data || [] } }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/sales-insights/stages
 * 
 * Fetch CRM stages ordered by sequence
 * Used by UI for chronological stage filtering
 */
async function getCrmStages(context) {
  const { env } = context;
  
  try {
    console.log('🔍 Fetching CRM stages...');
    
    // Fetch crm.stage records ordered by sequence
    const stages = await searchRead(env, {
      model: 'crm.stage',
      domain: [],
      fields: ['id', 'name', 'sequence'],
      order: 'sequence ASC',
      limit: null
    });
    
    console.log(`✅ Found ${stages.length} CRM stages`);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        stages
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Failed to fetch CRM stages:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'STAGE_FETCH_FAILED'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * PATCH /api/sales-insights/information-sets/:id
 * Update label/description of an information set. Requires SI admin.
 */
async function updateInformationSet(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { request, env, params } = context;
    const id = params?.id;
    const body = await request.json();
    const updates = {};
    if (body.label !== undefined)       updates.label       = body.label;
    if (body.description !== undefined) updates.description = body.description;
    if (body.sort_order !== undefined)  updates.sort_order  = body.sort_order;
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('information_sets').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * DELETE /api/sales-insights/information-sets/:id
 * Soft-delete (sets is_active = false). Requires SI admin.
 */
async function deleteInformationSet(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { env, params } = context;
    const id = params?.id;
    if (!id) return new Response(JSON.stringify({ success: false, error: { message: 'id is verplicht' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('information_sets').update({ is_active: false }).eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return new Response(JSON.stringify({ success: false, error: { message: `Categorie '${id}' niet gevonden of al verwijderd` } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * PATCH /api/sales-insights/information-set-fields/:id
 * Update label/description of a field. Requires SI admin.
 */
async function updateInformationSetField(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { request, env, params } = context;
    const id = params?.id;
    const body = await request.json();
    const updates = {};
    if (body.label !== undefined)       updates.label       = body.label;
    if (body.description !== undefined) updates.description = body.description;
    if (body.strip_html !== undefined)  updates.strip_html  = body.strip_html === true;
    if (body.selection_map !== undefined) updates.selection_map = body.selection_map;
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('information_set_fields').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * POST /api/sales-insights/information-set-fields/:id/selection-map
 *
 * Haalt de waarde->label-mapping van een Odoo selection-veld ÉÉNMALIG op via
 * fields_get() en slaat ze op information_set_fields.selection_map.
 * cascade-executor.js#applySelectionMap() past die mapping nadien toe op elke
 * query die dit veld ophaalt (root.selection_maps / step.selection_maps,
 * gevuld door de wizard uit exact deze kolom) -- geen herhaalde Odoo-call per
 * query, enkel deze ene keer per veld, met een expliciete "ververs"-knop in de
 * admin-tab "Categorieën" als Odoo Studio de opties ooit wijzigt.
 */
async function fetchFieldSelectionMap(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { env, params } = context;
    const id = params?.id;
    const supabase = getSupabaseClient(env);

    const { data: field, error: fieldError } = await supabase
      .from('information_set_fields')
      .select('id, field_key, set_id, information_sets(model)')
      .eq('id', id)
      .single();
    if (fieldError) throw new Error(fieldError.message);
    const model = field?.information_sets?.model;
    if (!model) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Veld of bijhorend model niet gevonden' } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // De labels van een selectieveld komen standaard terug in de taal van de
    // API-gebruiker (env.UID) -- meestal Engels voor een technische
    // integratie-user. Deze admin-tab is Nederlandstalig, dus vraag de
    // Nederlandse vertaling expliciet op via de context. (nl_BE: dit is een
    // Belgische Odoo-omgeving; zet dit naar nl_NL als die taal in plaats
    // daarvan geïnstalleerd is.)
    const fieldsData = await executeKw(env, {
      model,
      method: 'fields_get',
      args: [[field.field_key]],
      kwargs: { attributes: ['type', 'selection'], context: { lang: 'nl_BE' } }
    });
    const fieldDef = fieldsData && fieldsData[field.field_key];
    if (!fieldDef) {
      return new Response(JSON.stringify({ success: false, error: { message: `Veld "${field.field_key}" bestaat niet (meer) op ${model}` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (fieldDef.type !== 'selection' || !Array.isArray(fieldDef.selection)) {
      return new Response(JSON.stringify({ success: false, error: { message: `"${field.field_key}" is geen selectieveld (type: ${fieldDef.type})` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const selectionMap = {};
    for (const [value, label] of fieldDef.selection) selectionMap[String(value)] = label;

    const { data, error } = await supabase.from('information_set_fields').update({ selection_map: selectionMap }).eq('id', id).select().single();
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * DELETE /api/sales-insights/information-set-fields/:id
 * Admin only. Verwijder een veld uit een informatieset.
 */
async function deleteInformationSetField(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { env, params } = context;
    const id = params?.id;
    if (!id) return new Response(JSON.stringify({ success: false, error: { message: 'id is verplicht' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('information_set_fields').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================================
// SAVED SEARCHES
// ============================================================================

/**
 * GET /api/sales-insights/saved-searches
 * Geeft alle opgeslagen zoekopdrachten van de huidige gebruiker terug.
 */
async function listSavedSearches(context) {
  const { env, user } = context;
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('saved_searches')
      .select('id, name, wizard_state, mini_app_query_id, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    // is_shared_mini_apps is afgeleid, niet apart opgeslagen: een zoekopdracht
    // is gedeeld zodra ze naar een afgeleide query verwijst (zie
    // lib/saved-search-sharing.js). Zo bestaat er maar EEN waarheid.
    const rows = (data || []).map(s => ({
      ...s,
      is_shared_mini_apps: !!s.mini_app_query_id
    }));
    return new Response(JSON.stringify({ success: true, data: rows }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/sales-insights/saved-searches
 * Slaat een nieuwe zoekopdracht op.
 * Body: { name: string, wizard_state: object }
 */
async function createSavedSearch(context) {
  const { env, user, request } = context;
  try {
    const body = await request.json();
    const { name, wizard_state, share_with_mini_apps, query } = body ?? {};
    if (!name?.trim()) {
      return new Response(JSON.stringify({ success: false, error: { message: 'name is verplicht' } }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delen met mini-apps zit BEWUST in dezelfde actie als het opslaan zelf --
    // geen apart scherm, geen aparte query. Enkel een Sales Insight-admin mag
    // die vlag zetten; wie dat niet is, bewaart gewoon zijn zoekopdracht.
    if (share_with_mini_apps === true) {
      const deny = guardSalesInsightAdmin(context);
      if (deny) return deny;
    }

    let miniAppQueryId = null;
    if (share_with_mini_apps === true) {
      try {
        const sync = await syncSharedQueryForSavedSearch(env, {
          currentQueryId: null,
          share: true,
          query,
          name: name.trim()
        });
        miniAppQueryId = sync.mini_app_query_id;
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: { message: e.message, code: e.code || 'SHARING_FAILED', validation_errors: e.validation_errors }
        }), { status: e.code === 'SCHEMA_NOT_AVAILABLE' ? 503 : 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: user.id,
        name: name.trim(),
        wizard_state: wizard_state || {},
        mini_app_query_id: miniAppQueryId
      })
      .select()
      .single();
    if (error) {
      // Rollback: laat geen verweesde gedeelde query achter als de
      // zoekopdracht zelf niet bewaard raakte.
      await removeSharedQueryForSavedSearch(env, miniAppQueryId);
      throw new Error(error.message);
    }
    return new Response(JSON.stringify({
      success: true,
      data: { ...data, is_shared_mini_apps: !!data.mini_app_query_id }
    }), {
      status: 201, headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * PATCH /api/sales-insights/saved-searches/:id
 * Werkt naam en/of wizard_state bij (enkel eigen records).
 * Body: { name?: string, wizard_state?: object }
 */
async function updateSavedSearch(context) {
  const { env, user, request, params } = context;
  const id = params?.id;
  try {
    const body = await request.json();
    const supabase = getSupabaseClient(env);

    // Huidige rij eerst lezen: we moeten weten of deze zoekopdracht al gedeeld
    // is (mini_app_query_id) voordat we beslissen of er een afgeleide query
    // aangemaakt, bijgewerkt of verwijderd moet worden.
    const { data: current, error: currentError } = await supabase
      .from('saved_searches')
      .select('id, name, mini_app_query_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Niet gevonden of geen toegang' } }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    const updates = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.wizard_state !== undefined) updates.wizard_state = body.wizard_state;

    const wantsSharingChange = body.share_with_mini_apps !== undefined;
    const alreadyShared = !!current.mini_app_query_id;

    if ((wantsSharingChange && body.share_with_mini_apps === true) || (alreadyShared && body.query)) {
      const deny = guardSalesInsightAdmin(context);
      if (deny) return deny;
    }

    // Naamwijziging van een gedeelde zoekopdracht ook doortrekken: die naam is
    // wat een mini-app te zien krijgt in window.platform.odoo.listQueries().
    const renamesShared = alreadyShared && !body.query && updates.name !== undefined && updates.name !== current.name;

    // De afgeleide query wordt bij elke save herschreven vanuit de meegestuurde
    // payload -- zo volgt de mini-app-kant automatisch mee met een gewijzigde
    // zoekopdracht, zonder dat er iets in de mini-app zelf aangepast moet worden.
    if (wantsSharingChange || (alreadyShared && body.query) || renamesShared) {
      try {
        const sync = await syncSharedQueryForSavedSearch(env, {
          currentQueryId: current.mini_app_query_id,
          share: wantsSharingChange ? !!body.share_with_mini_apps : undefined,
          query: body.query,
          name: updates.name !== undefined ? updates.name : current.name
        });
        updates.mini_app_query_id = sync.mini_app_query_id;
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: { message: e.message, code: e.code || 'SHARING_FAILED', validation_errors: e.validation_errors }
        }), { status: e.code === 'SCHEMA_NOT_AVAILABLE' ? 503 : 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (!Object.keys(updates).length) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Geen updates opgegeven' } }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('saved_searches')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) {
      return new Response(JSON.stringify({ success: false, error: { message: 'Niet gevonden of geen toegang' } }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      data: { ...data, is_shared_mini_apps: !!data.mini_app_query_id }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * DELETE /api/sales-insights/saved-searches/:id
 * Verwijdert een opgeslagen zoekopdracht (enkel eigen records).
 */
async function deleteSavedSearchRoute(context) {
  const { env, user, params } = context;
  const id = params?.id;
  try {
    const supabase = getSupabaseClient(env);
    // Eerst opzoeken of er een afgeleide, gedeelde query aan hangt: die moet
    // mee verdwijnen, zodat mini-app-toegang automatisch stopt wanneer de
    // gebruiker zijn zoekopdracht verwijdert.
    const { data: current } = await supabase
      .from('saved_searches')
      .select('mini_app_query_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);

    await removeSharedQueryForSavedSearch(env, current?.mini_app_query_id || null);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/sales-insights/touchpoint-filter-values
 *
 * Geeft distinct source, medium en campaign_name waarden terug van x_ad_touchpoint.
 * Gebruikt door de wizard voor de ad-filter pills.
 */
async function getTouchpointFilterValues(context) {
  const { env } = context;
  try {
    const records = await searchRead(env, {
      model: 'x_ad_touchpoint',
      domain: [],
      fields: ['x_studio_source', 'x_studio_medium', 'x_studio_campaign_name'],
      limit: false
    });

    const clean = (v) => v && typeof v === 'string' && v !== '{campaignname}';

    const sources   = [...new Set(records.map(r => r.x_studio_source).filter(clean))].sort();
    const mediums   = [...new Set(records.map(r => r.x_studio_medium).filter(clean))].sort();
    const campaigns = [...new Set(records.map(r => r.x_studio_campaign_name).filter(clean))].sort();

    return new Response(JSON.stringify({ success: true, data: { sources, mediums, campaigns } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/sales-insights/source-sites
 *
 * Geeft alle unieke x_studio_source_site waarden terug van x_web_visitor.
 * Gebruikt door de wizard voor de source-site pill filter.
 */
async function getSourceSites(context) {
  const { env } = context;
  try {
    const records = await searchRead(env, {
      model: 'x_web_visitor',
      domain: [['x_studio_source_site', '!=', false]],
      fields: ['x_studio_source_site'],
      limit: false
    });
    const sites = [...new Set(
      records.map(r => r.x_studio_source_site).filter(Boolean)
    )].sort();
    return new Response(JSON.stringify({ success: true, data: { sites } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: { message: e.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Route definitions
 */
/**
 * DELETE /api/sales-insights/query/:id
 *
 * Verwijdert een opgeslagen query definitief. Admin-only.
 *
 * Normaal gesproken hoort niemand deze route nodig te hebben: een gedeelde
 * query is een AFGELEIDE rij van een opgeslagen zoekopdracht en verdwijnt
 * automatisch wanneer die zoekopdracht verwijderd wordt of het deel-vinkje
 * uitgaat (zie lib/saved-search-sharing.js). Deze route bestaat voor de losse,
 * oudere rijen die nog uit het vroegere "mini-app-query"-mechanisme stammen en
 * aan geen enkele zoekopdracht hangen -- die kunnen hier opgeruimd worden.
 *
 * saved_searches.mini_app_query_id staat op ON DELETE SET NULL, dus een
 * zoekopdracht die toevallig nog naar deze rij verwees blijft bestaan en staat
 * daarna simpelweg niet meer gedeeld.
 */
async function deleteSavedQueryEndpoint(context) {
  const deny = guardSalesInsightAdmin(context);
  if (deny) return deny;
  try {
    const { env, params } = context;
    const id = params?.id;
    const existing = await getQueryById(env, id);
    if (!existing) {
      return new Response(JSON.stringify({
        success: false,
        error: { message: `Query niet gevonden: ${id}`, code: 'QUERY_NOT_FOUND' }
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    await deleteQuery(env, id);
    return new Response(JSON.stringify({ success: true, data: { id, name: existing.name } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('\u274c Delete query failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message, code: 'DELETE_FAILED' }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ============================================================
// Mini-app discovery (token-auth, GEEN sessie)
//
// Deze twee routes bestaan zodat een AI-gesprek dat een mini-app bouwt of
// bijwerkt de structuur van gedeelde queries zelf kan opvragen, in plaats van
// dat er een statische momentopname in een gekopieerde prompt gebakken wordt.
// Ze worden bereikt via src/router/public-routes.js (dus buiten de auth-gate
// om) en zijn uitsluitend leesbaar met een geldig, kortlevend discovery-token
// -- zie lib/mini-app-discovery.js voor de grenzen van dat token.
//
// Wat hier NIET gebeurt: echt data ophalen voor een draaiende mini-app. Dat
// blijft window.platform.odoo.runQuery() met de sessie van de ingelogde
// gebruiker (src/modules/mini-apps/routes.js).
// ============================================================
function discoveryTokenFromRequest(request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const auth = request.headers.get('Authorization') || '';
  const [scheme, value] = auth.split(' ');
  if (scheme === 'Bearer' && value) return value;
  return null;
}

async function guardDiscoveryToken(context) {
  const token = discoveryTokenFromRequest(context.request);
  const check = await validateDiscoveryToken(context.env, token);
  if (check.valid) return null;
  const expired = check.reason === 'TOKEN_EXPIRED';
  return new Response(JSON.stringify({
    success: false,
    error: {
      message: expired
        ? 'Dit discovery-token is verlopen. Vraag in de Mini-apps-module een nieuwe bouw-/bijwerk-prompt aan.'
        : 'Ongeldig of ontbrekend discovery-token.',
      code: check.reason || 'INVALID_TOKEN'
    }
  }), { status: 401, headers: { 'Content-Type': 'application/json' } });
}

/**
 * GET /api/sales-insights/mini-app-discovery/queries?token=...
 * Alle queries die op dit moment gedeeld zijn met mini-apps, met hun
 * structuur (veldnamen zoals ze in een record terugkomen + parameters).
 * Geen voorbeeldrijen -- vraag daarvoor de detail-route van de query op.
 */
async function discoveryListQueries(context) {
  const deny = await guardDiscoveryToken(context);
  if (deny) return deny;
  try {
    const queries = await describeAllSharedQueries(context.env);
    return new Response(JSON.stringify({
      success: true,
      data: {
        queries,
        count: queries.length,
        usage: 'Een mini-app draait een query met window.platform.odoo.runQuery(id, params). Deze lijst is enkel bedoeld om te weten welke queries bestaan en welke velden ze teruggeven.'
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('\u274c Discovery list failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message, code: 'DISCOVERY_FAILED' }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/sales-insights/mini-app-discovery/queries/:id?token=...&sample=0
 * Eén gedeelde query: structuur + (standaard) een klein live voorbeeldresultaat.
 * sample=0 slaat het voorbeeld over en spreekt Odoo dus niet aan.
 */
async function discoveryGetQuery(context) {
  const deny = await guardDiscoveryToken(context);
  if (deny) return deny;
  try {
    const { request, env, params } = context;
    const url = new URL(request.url);
    const sampleParam = url.searchParams.get('sample');
    const wantsSample = !(sampleParam === '0' || sampleParam === 'false');

    const described = await describeSharedQuery(env, params?.id, { sample: wantsSample });
    if (!described) {
      // Bewust hetzelfde antwoord voor "bestaat niet" en "niet (meer) gedeeld":
      // een mini-app/model hoeft die twee niet te kunnen onderscheiden, en de
      // gevraagde fallback in de app is in beide gevallen dezelfde melding.
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Deze query bestaat niet (meer) of is niet gedeeld met mini-apps.',
          code: 'QUERY_NOT_AVAILABLE'
        }
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, data: described }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('\u274c Discovery detail failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: { message: error.message, code: 'DISCOVERY_FAILED' }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const routes = {
  'GET /': queryBuilderPage,
  'GET /app.js': serveAppJS,
  'GET /components/:filename': serveComponent,
  'GET /lib/:filename': serveLib,
  'GET /config/:filename': serveConfig,
  'GET /admin': salesInsightAdminPage,
  'GET /api/sales-insights/admin/users': getModuleUsers,
  'POST /api/sales-insights/admin/users/:user_id/module-access': toggleModuleAccess,
  'PUT /api/sales-insights/admin/users/:user_module_id/permissions': updateUserModulePermissions,
  'GET /api/sales-insights/information-sets': getInformationSets,
  'POST /api/sales-insights/information-sets': createInformationSet,
  'POST /api/sales-insights/information-set-fields': createInformationSetField,
  'PATCH /api/sales-insights/information-sets/:id': updateInformationSet,
  'DELETE /api/sales-insights/information-sets/:id': deleteInformationSet,
  'PATCH /api/sales-insights/information-set-fields/:id': updateInformationSetField,
  'POST /api/sales-insights/information-set-fields/:id/selection-map': fetchFieldSelectionMap,
  'DELETE /api/sales-insights/information-set-fields/:id': deleteInformationSetField,
  'GET /api/sales-insights/saved-searches': listSavedSearches,
  'POST /api/sales-insights/saved-searches': createSavedSearch,
  'PATCH /api/sales-insights/saved-searches/:id': updateSavedSearch,
  'DELETE /api/sales-insights/saved-searches/:id': deleteSavedSearchRoute,
  'GET /api/sales-insights/ai-export-presets': getAiExportPresets,
  'GET /api/sales-insights/models-config': getModelsConfig,
  'POST /api/sales-insights/models': createModel,
  'PATCH /api/sales-insights/models/:id': updateModel,
  'DELETE /api/sales-insights/models/:id': deactivateModel,
  'GET /api/sales-insights/test/phase0': runPhase0Tests,
  'GET /api/sales-insights/graph': getGraphDefinition,
  'GET /api/sales-insights/schema': getSchema,
  'GET /api/sales-insights/stages': getCrmStages,
  'GET /api/sales-insights/source-sites': getSourceSites,
  'GET /api/sales-insights/touchpoint-filter-values': getTouchpointFilterValues,
  'GET /api/sales-insights/web-visitors': listWebVisitors,
  'POST /api/sales-insights/leads/web-activity': leadWebActivity,
  'POST /api/sales-insights/schema/refresh': refreshSchema,
  'POST /api/sales-insights/query/validate': validateQueryEndpoint,
  'POST /api/sales-insights/query/run': runQuery,
  'POST /api/sales-insights/query/preview': previewQuery,
  'POST /api/sales-insights/semantic/validate': validateSemanticQueryEndpoint,
  'POST /api/sales-insights/semantic/preview': previewSemanticQuery,
  'POST /api/sales-insights/semantic/run': runSemanticQuery,
  'POST /api/sales-insights/query/save': saveQueryEndpoint,
  'POST /api/sales-insights/query/instantiate-preset': instantiatePreset,
  'GET /api/sales-insights/query/list': listSavedQueries,
  'POST /api/sales-insights/query/run/:id': runSavedQuery,
  'POST /api/sales-insights/query/run/:id/export': exportSavedQuery,
  'PATCH /api/sales-insights/query/:id': updateQueryDefinition,
  'DELETE /api/sales-insights/query/:id': deleteSavedQueryEndpoint,
  // Token-auth, bereikbaar zonder sessie via src/router/public-routes.js
  'GET /api/sales-insights/mini-app-discovery/queries': discoveryListQueries,
  'GET /api/sales-insights/mini-app-discovery/queries/:id': discoveryGetQuery
};
