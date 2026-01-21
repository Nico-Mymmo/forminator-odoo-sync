/**
 * Fase 0: Pre-Implementation Validation
 * 
 * Tests om te verifiëren dat foundation solid is voordat implementatie start.
 * - Schema introspection voor x_sales_action_sheet + 7 gerelateerde modellen
 * - Query executor smoke tests voor 3 execution paths
 * 
 * @module tests/phase0-validation
 */

/**
 * Fase 0.1: Schema Introspection Validatie
 * 
 * Verify:
 * - Schema cache werkt voor x_sales_action_sheet
 * - Relatie-navigatie naar alle 7 gerelateerde modellen
 * - Field types correct gedetecteerd
 */
export async function validateSchemaIntrospection(env, schemaService) {
  const results = {
    phase: '0.1 Schema Introspection',
    tests: [],
    success: true
  };

  // Test 1: x_sales_action_sheet exists
  try {
    const schema = await schemaService.introspectSchema(env, ['x_sales_action_sheet']);
    const actionSheet = schema.models['x_sales_action_sheet'];
    
    results.tests.push({
      name: 'x_sales_action_sheet model exists',
      passed: !!actionSheet,
      details: actionSheet ? `Found ${Object.keys(actionSheet.fields).length} fields` : 'Model not found'
    });
    
    if (!actionSheet) {
      results.success = false;
      return results;
    }

    // Test 2: Critical relation fields exist
    const criticalRelations = [
      'x_action_sheet_pain_points',
      'x_as_meetings',
      'x_support_stage',
      'x_studio_for_company_id',
      'lead_id',
      'x_sales_action_sheet_tag'
    ];

    for (const fieldName of criticalRelations) {
      const field = actionSheet.fields[fieldName];
      results.tests.push({
        name: `Relation field: ${fieldName}`,
        passed: !!field,
        details: field ? `Type: ${field.type}, Target: ${field.relation || 'N/A'}` : 'Field not found'
      });
      
      if (!field) {
        results.success = false;
      }
    }

    // Test 3: Navigate to target models
    const targetModels = [
      'x_action_sheet_pain_points',
      'x_user_painpoints',
      'x_as_meetings',
      'x_support_stage',
      'res.partner',
      'crm.lead',
      'x_sales_action_sheet_tag'
    ];

    const modelSchema = await schemaService.introspectSchema(env, targetModels);
    
    for (const modelName of targetModels) {
      const model = modelSchema.models[modelName];
      results.tests.push({
        name: `Target model: ${modelName}`,
        passed: !!model,
        details: model ? `${Object.keys(model.fields).length} fields` : 'Model not found'
      });
      
      if (!model) {
        results.success = false;
      }
    }

    // Test 4: x_action_sheet_pain_points has score field
    const painPointsModel = modelSchema.models['x_action_sheet_pain_points'];
    if (painPointsModel) {
      const scoreField = painPointsModel.fields['score'];
      results.tests.push({
        name: 'Pain points score field',
        passed: !!scoreField,
        details: scoreField ? `Type: ${scoreField.type}` : 'Field not found'
      });
      
      if (!scoreField) {
        results.success = false;
      }
    }

    // Test 5: x_as_meetings has x_date field
    const meetingsModel = modelSchema.models['x_as_meetings'];
    if (meetingsModel) {
      const dateField = meetingsModel.fields['x_date'];
      results.tests.push({
        name: 'Meetings x_date field',
        passed: !!dateField,
        details: dateField ? `Type: ${dateField.type}` : 'Field not found'
      });
      
      if (!dateField) {
        results.success = false;
      }
    }

  } catch (error) {
    results.tests.push({
      name: 'Schema introspection execution',
      passed: false,
      details: `Error: ${error.message}`
    });
    results.success = false;
  }

  return results;
}

/**
 * Fase 0.2: Query Executor Smoke Test
 * 
 * Verify:
 * - 3 execution paths werken voor x_sales_action_sheet
 * - Benchmark performance
 */
export async function validateQueryExecutor(env, schemaService, queryExecutor, capabilities) {
  const results = {
    phase: '0.2 Query Executor',
    tests: [],
    success: true,
    benchmarks: {}
  };

  try {
    const schema = await schemaService.introspectSchema(env);

    // Test 1: Simple COUNT query (should use read_group)
    const simpleQuery = {
      base_model: 'x_sales_action_sheet',
      fields: ['id'],
      filters: [],
      aggregations: [{
        field: 'id',
        function: 'count'
      }]
    };

    const start1 = Date.now();
    const result1 = await queryExecutor.executeQuery(simpleQuery, schema, capabilities, env);
    const duration1 = Date.now() - start1;

    results.tests.push({
      name: 'Simple COUNT query',
      passed: result1.records && result1.meta.execution_path === 'read_group',
      details: `${result1.records.length} records, ${duration1}ms, path: ${result1.meta.execution_path}`
    });
    results.benchmarks['simple_count'] = duration1;

    if (!result1.records || result1.meta.execution_path !== 'read_group') {
      results.success = false;
    }

    // Test 2: Pain points with score AVG (multi-pass likely)
    const painPointsQuery = {
      base_model: 'x_sales_action_sheet',
      relations: [{
        path: [{
          relation_field: 'x_action_sheet_pain_points',
          target_model: 'x_action_sheet_pain_points'
        }],
        fields: ['score']
      }],
      aggregations: [{
        field: 'x_action_sheet_pain_points.score',
        function: 'avg'
      }]
    };

    const start2 = Date.now();
    const result2 = await queryExecutor.executeQuery(painPointsQuery, schema, capabilities, env);
    const duration2 = Date.now() - start2;

    results.tests.push({
      name: 'Pain points AVG(score) query',
      passed: !!result2.records,
      details: `${result2.records.length} records, ${duration2}ms, path: ${result2.meta.execution_path}`
    });
    results.benchmarks['pain_points_avg'] = duration2;

    if (!result2.records) {
      results.success = false;
    }

    // Performance check: < 1s for pain points
    if (duration2 > 1000) {
      results.tests.push({
        name: 'Pain points performance',
        passed: false,
        details: `Too slow: ${duration2}ms > 1000ms target`
      });
      results.success = false;
    }

    // Test 3: Search read query
    const searchQuery = {
      base_model: 'x_sales_action_sheet',
      fields: ['name', 'create_date'],
      filters: [],
      limit: 10
    };

    const start3 = Date.now();
    const result3 = await queryExecutor.executeQuery(searchQuery, schema, capabilities, env);
    const duration3 = Date.now() - start3;

    results.tests.push({
      name: 'Search read query',
      passed: result3.records && result3.records.length <= 10,
      details: `${result3.records.length} records, ${duration3}ms, path: ${result3.meta.execution_path}`
    });
    results.benchmarks['search_read'] = duration3;

    if (!result3.records || result3.records.length > 10) {
      results.success = false;
    }

  } catch (error) {
    results.tests.push({
      name: 'Query executor execution',
      passed: false,
      details: `Error: ${error.message}`
    });
    results.success = false;
  }

  return results;
}

/**
 * Run all Fase 0 validations
 */
export async function runPhase0Validation(env, schemaService, queryExecutor, capabilities) {
  console.log('🧪 Starting Phase 0 Pre-Implementation Validation\n');

  const schemaResults = await validateSchemaIntrospection(env, schemaService);
  console.log(`\n${schemaResults.phase}:`);
  console.log(`  Overall: ${schemaResults.success ? '✅ PASS' : '❌ FAIL'}`);
  for (const test of schemaResults.tests) {
    console.log(`  ${test.passed ? '✅' : '❌'} ${test.name}: ${test.details}`);
  }

  if (!schemaResults.success) {
    console.log('\n❌ Schema validation failed. Cannot proceed with implementation.');
    return { success: false, phase: 0 };
  }

  const executorResults = await validateQueryExecutor(env, schemaService, queryExecutor, capabilities);
  console.log(`\n${executorResults.phase}:`);
  console.log(`  Overall: ${executorResults.success ? '✅ PASS' : '❌ FAIL'}`);
  for (const test of executorResults.tests) {
    console.log(`  ${test.passed ? '✅' : '❌'} ${test.name}: ${test.details}`);
  }
  
  if (executorResults.benchmarks) {
    console.log('\n  Performance Benchmarks:');
    for (const [name, duration] of Object.entries(executorResults.benchmarks)) {
      const status = duration < 500 ? '🚀' : duration < 1000 ? '✅' : '⚠️';
      console.log(`    ${status} ${name}: ${duration}ms`);
    }
  }

  const allSuccess = schemaResults.success && executorResults.success;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Phase 0 Validation: ${allSuccess ? '✅ PASS - Ready for implementation' : '❌ FAIL - Fix issues before proceeding'}`);
  console.log('='.repeat(60));

  return {
    success: allSuccess,
    phase: 0,
    schema: schemaResults,
    executor: executorResults
  };
}
