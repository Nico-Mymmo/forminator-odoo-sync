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
  cacheSchema, 
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
  deleteQuery 
} from './lib/query-repository.js';
import { normalizeToExportResult } from './lib/export/export-normalizer.js';
import exportRegistry from './lib/export/export-registry.js';
import jsonExporter from './lib/export/export-json.js';
import csvExporter from './lib/export/export-csv.js';
import { queryBuilderUI } from './ui.js';
import { runPhase0Validation } from './tests/phase0-validation.js';
import { searchRead } from '../../lib/odoo.js';  // ADDED: Use existing Odoo integration

// Register export formats
exportRegistry.register('json', jsonExporter);
exportRegistry.register('csv', csvExporter);

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
            cache_ttl: 3600,
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
    
    // Cache the result
    const cacheData = {
      schema,
      capabilities,
      cached_at: new Date().toISOString()
    };
    
    await env.MAPPINGS_KV.put(
      'sales_insights:schema:current',
      JSON.stringify(cacheData),
      { expirationTtl: 3600 }
    );
    
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
        cache_ttl: 3600,
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
    
    // Cache new schema
    const cacheData = {
      schema: newSchema,
      capabilities,
      cached_at: new Date().toISOString()
    };
    
    await env.MAPPINGS_KV.put(
      'sales_insights:schema:current',
      JSON.stringify(cacheData),
      { expirationTtl: 3600 }
    );
    
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
    const cached = await getCachedSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please fetch schema first.',
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
    const cached = await getCachedSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please fetch schema first.',
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
    
    const cached = await getCachedSchema(env);
    if (!cached) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please refresh schema first.',
          code: 'SCHEMA_NOT_AVAILABLE'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const validation = validateQuery(query, cached.schema, cached.capabilities);
    
    if (!validation.valid) {
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
    const complexity = assessQueryComplexity(query, cached.capabilities);
    
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
    
    const cached = await getCachedSchema(env);
    if (!cached) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please refresh schema first.',
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
    
    if (!validation.valid) {
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
      updated_at: q.updated_at
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
    const cached = await getCachedSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please fetch schema first.',
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
    const cached = await getCachedSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please fetch schema first.',
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
    const cached = await getCachedSchema(env);
    if (!cached || !cached.schema) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Schema not available. Please refresh schema first.',
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
 * POST /api/sales-insights/semantic/run
 * 
 * SIMPLIFIED: Thin translator from wizard payload to Odoo searchRead
 * 
 * No semantic executor. No DSL. Just translation:
 * - wizard payload → Odoo domain + fields → searchRead
 * 
 * Body:
 * {
 *   base_model: 'x_sales_action_sheet',
 *   fields: ['id', 'x_name', 'create_date'],
 *   filters: [
 *     { field: 'create_date', operator: '>=', value: '2026-01-01' }
 *   ]
 * }
 */
async function runSemanticQuery(context) {
  const { request, env } = context;
  
  try {
    const payload = await request.json();
    
    console.log('📦 Received wizard payload:', JSON.stringify(payload, null, 2));
    
    // STEP 1: Extract base model
    const model = payload.base_model;
    if (!model) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Missing required field: base_model',
          code: 'MISSING_BASE_MODEL'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // STEP 2: Extract fields (default to ['id'] if empty)
    const fields = Array.isArray(payload.fields) && payload.fields.length > 0 
      ? payload.fields 
      : ['id'];
    
    // STEP 3: Translate filters to Odoo domain
    const domain = [];
    if (Array.isArray(payload.filters)) {
      for (const filter of payload.filters) {
        // Simple translation: { field, operator, value } → [field, operator, value]
        if (filter.field && filter.operator && filter.value !== undefined) {
          domain.push([filter.field, filter.operator, filter.value]);
        }
      }
    }
    
    console.log('🔄 Translated to Odoo call:');
    console.log('  model:', model);
    console.log('  domain:', JSON.stringify(domain));
    console.log('  fields:', JSON.stringify(fields));
    
    // STEP 4: Call searchRead (existing Odoo integration)
    const records = await searchRead(env, {
      model,
      domain,
      fields,
      limit: 100  // Default limit
    });
    
    console.log(`✅ searchRead returned ${records.length} records`);
    
    // STEP 5: Return results
    return new Response(JSON.stringify({
      success: true,
      data: {
        records,
        meta: {
          model,
          domain,
          fields,
          count: records.length,
          execution_method: 'searchRead'
        }
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Semantic query failed:', error);
    
    // If Odoo error, return it directly
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'ODOO_ERROR',
        stack: error.stack
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Route definitions
 */
export const routes = {
  'GET /': queryBuilderPage,
  'GET /app.js': serveAppJS,
  'GET /components/:filename': serveComponent,
  'GET /lib/:filename': serveLib,
  'GET /config/:filename': serveConfig,
  'GET /api/sales-insights/test/phase0': runPhase0Tests,
  'GET /api/sales-insights/schema': getSchema,
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
  'POST /api/sales-insights/query/run/:id/export': exportSavedQuery
};
