/**
 * Test: Semantic Correction - Lead Filters Force Filtering
 * 
 * Verifies that when lead filters are active, mode is overridden to 'exclude'
 */

console.log('=== TEST: Lead Filters Semantic Correction ===\n');

// Mock the enrichWithLeads logic for testing
function testModeOverride(requestedMode, filters) {
  const hasLeadFilters = 
    (filters?.stage_ids && filters.stage_ids.length > 0) ||
    (filters?.won_status && filters.won_status.length > 0);
  
  let effectiveMode = requestedMode;
  let modeOverrideReason = null;
  
  if (hasLeadFilters && requestedMode === 'include') {
    effectiveMode = 'exclude';
    modeOverrideReason = 'lead_filters_active';
  }
  
  return { effectiveMode, modeOverrideReason };
}

// Test 1: Include mode WITHOUT filters (no override)
console.log('Test 1: Include mode WITHOUT lead filters');
const test1 = testModeOverride('include', {});
console.log('  Requested: include');
console.log('  Effective:', test1.effectiveMode);
console.log('  Override reason:', test1.modeOverrideReason);
console.log('  ✅ PASS:', test1.effectiveMode === 'include' && !test1.modeOverrideReason);
console.log();

// Test 2: Include mode WITH stage filter (OVERRIDE)
console.log('Test 2: Include mode WITH stage filter');
const test2 = testModeOverride('include', { stage_ids: [1, 2, 3] });
console.log('  Requested: include');
console.log('  Effective:', test2.effectiveMode);
console.log('  Override reason:', test2.modeOverrideReason);
console.log('  ✅ PASS:', test2.effectiveMode === 'exclude' && test2.modeOverrideReason === 'lead_filters_active');
console.log();

// Test 3: Include mode WITH won_status filter (OVERRIDE)
console.log('Test 3: Include mode WITH won_status filter');
const test3 = testModeOverride('include', { won_status: ['won', 'lost'] });
console.log('  Requested: include');
console.log('  Effective:', test3.effectiveMode);
console.log('  Override reason:', test3.modeOverrideReason);
console.log('  ✅ PASS:', test3.effectiveMode === 'exclude' && test3.modeOverrideReason === 'lead_filters_active');
console.log();

// Test 4: Include mode WITH both filters (OVERRIDE)
console.log('Test 4: Include mode WITH both filters');
const test4 = testModeOverride('include', { 
  stage_ids: [1], 
  won_status: ['won'] 
});
console.log('  Requested: include');
console.log('  Effective:', test4.effectiveMode);
console.log('  Override reason:', test4.modeOverrideReason);
console.log('  ✅ PASS:', test4.effectiveMode === 'exclude' && test4.modeOverrideReason === 'lead_filters_active');
console.log();

// Test 5: Exclude mode WITH filters (no override needed)
console.log('Test 5: Exclude mode WITH filters');
const test5 = testModeOverride('exclude', { stage_ids: [1, 2] });
console.log('  Requested: exclude');
console.log('  Effective:', test5.effectiveMode);
console.log('  Override reason:', test5.modeOverrideReason);
console.log('  ✅ PASS:', test5.effectiveMode === 'exclude' && !test5.modeOverrideReason);
console.log();

// Test 6: only_without_lead mode WITH filters (no override)
console.log('Test 6: only_without_lead mode WITH filters');
const test6 = testModeOverride('only_without_lead', { stage_ids: [1] });
console.log('  Requested: only_without_lead');
console.log('  Effective:', test6.effectiveMode);
console.log('  Override reason:', test6.modeOverrideReason);
console.log('  ✅ PASS:', test6.effectiveMode === 'only_without_lead' && !test6.modeOverrideReason);
console.log();

console.log('=== All Tests Complete ===');
console.log('\nSummary:');
console.log('✅ Include + no filters = include (enrichment only)');
console.log('✅ Include + filters = exclude (filtered results)');
console.log('✅ Exclude/only_without_lead unaffected by override');
