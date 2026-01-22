/**
 * Manual Test Script for Lead Enrichment
 * 
 * This script validates the lead enrichment implementation
 * by simulating the data flow and verifying behavior.
 */

// Test 1: Validation Function
console.log('=== Test 1: Validation Function ===');

import { validateLeadEnrichment } from './src/modules/sales-insight-explorer/lib/semantic-validator.js';

// Test 1a: Valid include mode
const valid1 = validateLeadEnrichment({
  enabled: true,
  mode: 'include',
  filters: {
    stage_ids: [1, 2, 3],
    won_status: ['won', 'lost']
  }
});
console.log('Valid include mode:', valid1.valid ? 'PASS' : 'FAIL', valid1);

// Test 1b: Invalid mode
const invalid1 = validateLeadEnrichment({
  enabled: true,
  mode: 'invalid_mode',
  filters: {}
});
console.log('Invalid mode:', !invalid1.valid ? 'PASS' : 'FAIL', invalid1);

// Test 1c: Invalid stage_ids type
const invalid2 = validateLeadEnrichment({
  enabled: true,
  mode: 'include',
  filters: {
    stage_ids: 'not_an_array'
  }
});
console.log('Invalid stage_ids:', !invalid2.valid ? 'PASS' : 'FAIL', invalid2);

// Test 1d: Invalid won_status value
const invalid3 = validateLeadEnrichment({
  enabled: true,
  mode: 'include',
  filters: {
    won_status: ['invalid_status']
  }
});
console.log('Invalid won_status:', !invalid3.valid ? 'PASS' : 'FAIL', invalid3);

// Test 1e: Unknown filter key
const invalid4 = validateLeadEnrichment({
  enabled: true,
  mode: 'include',
  filters: {
    unknown_key: 'value'
  }
});
console.log('Unknown key:', !invalid4.valid ? 'PASS' : 'FAIL', invalid4);

// Test 1f: Disabled enrichment (should be valid)
const valid2 = validateLeadEnrichment({
  enabled: false
});
console.log('Disabled enrichment:', valid2.valid ? 'PASS' : 'FAIL', valid2);

console.log('\n=== Test 2: Set Operations Logic ===');

// Simulate set operations
function testSetOperations() {
  // Mock data
  const actionSheets = [
    { id: 1, x_name: 'AS-001' },
    { id: 2, x_name: 'AS-002' },
    { id: 3, x_name: 'AS-003' },
    { id: 4, x_name: 'AS-004' },
    { id: 5, x_name: 'AS-005' }
  ];

  const setA = new Set([1, 2, 3, 4, 5]);
  const setB = new Set([2, 3, 4]); // Referenced by leads
  const mapM = new Map([
    [2, [{ id: 10, name: 'Lead 10' }]],
    [3, [{ id: 11, name: 'Lead 11' }, { id: 12, name: 'Lead 12' }]],
    [4, [{ id: 13, name: 'Lead 13' }]]
  ]);

  const notes = [];

  // Test include mode
  const includeResult = applySetOperation(actionSheets, setA, setB, mapM, 'include', notes);
  console.log('Include mode:');
  console.log('  Total:', includeResult.length, '(expected: 5)');
  console.log('  With leads:', includeResult.filter(r => r.leads).length, '(expected: 3)');
  console.log('  Without leads:', includeResult.filter(r => !r.leads).length, '(expected: 2)');
  console.log('  PASS:', includeResult.length === 5 && includeResult.filter(r => r.leads).length === 3);

  // Test exclude mode
  const excludeResult = applySetOperation(actionSheets, setA, setB, mapM, 'exclude', notes);
  console.log('Exclude mode:');
  console.log('  Total:', excludeResult.length, '(expected: 3)');
  console.log('  All have leads:', excludeResult.every(r => r.leads), '(expected: true)');
  console.log('  PASS:', excludeResult.length === 3 && excludeResult.every(r => r.leads));

  // Test only_without_lead mode
  const onlyWithoutResult = applySetOperation(actionSheets, setA, setB, mapM, 'only_without_lead', notes);
  console.log('Only without lead mode:');
  console.log('  Total:', onlyWithoutResult.length, '(expected: 2)');
  console.log('  None have leads:', onlyWithoutResult.every(r => !r.leads), '(expected: true)');
  console.log('  PASS:', onlyWithoutResult.length === 2 && onlyWithoutResult.every(r => !r.leads));
}

function applySetOperation(actionSheets, setA, setB, mapM, mode, notes) {
  const intersection = new Set([...setA].filter(id => setB.has(id)));
  const difference = new Set([...setA].filter(id => !setB.has(id)));

  switch (mode) {
    case 'include':
      return actionSheets.map(as => {
        if (intersection.has(as.id)) {
          return { ...as, leads: mapM.get(as.id) };
        }
        return as;
      });

    case 'exclude':
      return actionSheets
        .filter(as => intersection.has(as.id))
        .map(as => ({ ...as, leads: mapM.get(as.id) }));

    case 'only_without_lead':
      return actionSheets.filter(as => difference.has(as.id));

    default:
      throw new Error(`Invalid mode: ${mode}`);
  }
}

testSetOperations();

console.log('\n=== All Tests Complete ===');
