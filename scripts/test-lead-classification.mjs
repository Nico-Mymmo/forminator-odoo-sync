/**
 * Unit Tests: Lead Classification (Iteration 9.2)
 * 
 * Tests the canonical OPEN/WON/LOST/IGNORED classification logic
 * and IGNORED lead filtering.
 * 
 * Run: node test-lead-classification.mjs
 */

// Mock classifyLead function (extracted from lead-enrichment.js)
function classifyLead(lead) {
  if (lead.active === true) {
    if (lead.won_status === 'won') {
      return 'WON';
    } else if (lead.won_status === 'pending') {
      return 'OPEN';
    } else {
      return 'OPEN'; // Default to OPEN for active leads
    }
  } else {
    // active=false
    if (lead.won_status === 'lost' && lead.lost_reason_id) {
      return 'LOST';
    } else {
      return 'IGNORED';
    }
  }
}

// Mock filterIgnoredLeads function
function filterIgnoredLeads(leads, notes) {
  const classificationCounts = {
    OPEN: 0,
    WON: 0,
    LOST: 0,
    IGNORED: 0
  };
  
  const filteredLeads = [];
  
  for (const lead of leads) {
    const classification = classifyLead(lead);
    classificationCounts[classification]++;
    
    if (classification !== 'IGNORED') {
      filteredLeads.push(lead);
    }
  }
  
  if (classificationCounts.IGNORED > 0) {
    notes.push(`⚠️  Filtered out ${classificationCounts.IGNORED} IGNORED leads`);
  }
  
  return { filteredLeads, classificationCounts };
}

// Test suite
const tests = [
  {
    name: 'OPEN: active=true, won_status=pending',
    input: { id: 1, active: true, won_status: 'pending', lost_reason_id: null },
    expected: 'OPEN'
  },
  {
    name: 'WON: active=true, won_status=won',
    input: { id: 2, active: true, won_status: 'won', lost_reason_id: null },
    expected: 'WON'
  },
  {
    name: 'LOST: active=false, won_status=lost, lost_reason_id IS SET',
    input: { id: 3, active: false, won_status: 'lost', lost_reason_id: 123 },
    expected: 'LOST'
  },
  {
    name: 'IGNORED: active=false, won_status=lost, lost_reason_id IS NULL',
    input: { id: 4, active: false, won_status: 'lost', lost_reason_id: null },
    expected: 'IGNORED'
  },
  {
    name: 'IGNORED: active=false, won_status=pending',
    input: { id: 5, active: false, won_status: 'pending', lost_reason_id: null },
    expected: 'IGNORED'
  },
  {
    name: 'IGNORED: active=false, won_status=won (edge case)',
    input: { id: 6, active: false, won_status: 'won', lost_reason_id: null },
    expected: 'IGNORED'
  },
  {
    name: 'OPEN: active=true, won_status=null (edge case)',
    input: { id: 7, active: true, won_status: null, lost_reason_id: null },
    expected: 'OPEN'
  },
  {
    name: 'filterIgnoredLeads: Mixed classifications',
    type: 'filtering',
    input: [
      { id: 1, active: true, won_status: 'pending', lost_reason_id: null },
      { id: 2, active: true, won_status: 'won', lost_reason_id: null },
      { id: 3, active: false, won_status: 'lost', lost_reason_id: 456 },
      { id: 4, active: false, won_status: 'lost', lost_reason_id: null }, // IGNORED
      { id: 5, active: false, won_status: 'pending', lost_reason_id: null } // IGNORED
    ],
    expected: {
      filteredCount: 3,
      counts: { OPEN: 1, WON: 1, LOST: 1, IGNORED: 2 }
    }
  },
  {
    name: 'filterIgnoredLeads: All OPEN/WON/LOST (no IGNORED)',
    type: 'filtering',
    input: [
      { id: 1, active: true, won_status: 'pending', lost_reason_id: null },
      { id: 2, active: true, won_status: 'won', lost_reason_id: null },
      { id: 3, active: false, won_status: 'lost', lost_reason_id: 789 }
    ],
    expected: {
      filteredCount: 3,
      counts: { OPEN: 1, WON: 1, LOST: 1, IGNORED: 0 }
    }
  },
  {
    name: 'filterIgnoredLeads: All IGNORED',
    type: 'filtering',
    input: [
      { id: 1, active: false, won_status: 'lost', lost_reason_id: null },
      { id: 2, active: false, won_status: 'pending', lost_reason_id: null }
    ],
    expected: {
      filteredCount: 0,
      counts: { OPEN: 0, WON: 0, LOST: 0, IGNORED: 2 }
    }
  },
  {
    name: 'CRITICAL PROOF: LOST lead with active=false is retrievable',
    type: 'proof',
    input: { id: 999, active: false, won_status: 'lost', lost_reason_id: 555 },
    expected: 'LOST',
    proof: 'This lead has active=false but is classified as LOST (not IGNORED) because lost_reason_id IS SET. It MUST be included in analysis.'
  },
  {
    name: 'CRITICAL PROOF: Archived non-LOST lead is IGNORED',
    type: 'proof',
    input: { id: 888, active: false, won_status: 'pending', lost_reason_id: null },
    expected: 'IGNORED',
    proof: 'This lead has active=false but is NOT LOST (no lost_reason_id). It is archived/soft-deleted and MUST be discarded.'
  }
];

// Run tests
let passed = 0;
let failed = 0;

console.log('🧪 Lead Classification Tests (Iteration 9.2)\n');

for (const test of tests) {
  try {
    if (test.type === 'filtering') {
      const notes = [];
      const result = filterIgnoredLeads(test.input, notes);
      
      const countsMatch = JSON.stringify(result.classificationCounts) === JSON.stringify(test.expected.counts);
      const filteredCountMatch = result.filteredLeads.length === test.expected.filteredCount;
      
      if (countsMatch && filteredCountMatch) {
        console.log(`✅ ${test.name}`);
        console.log(`   Filtered: ${result.filteredLeads.length}/${test.input.length}`);
        console.log(`   Counts: ${JSON.stringify(result.classificationCounts)}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Expected counts: ${JSON.stringify(test.expected.counts)}`);
        console.log(`   Actual counts: ${JSON.stringify(result.classificationCounts)}`);
        console.log(`   Expected filtered: ${test.expected.filteredCount}`);
        console.log(`   Actual filtered: ${result.filteredLeads.length}`);
        failed++;
      }
    } else if (test.type === 'proof') {
      const result = classifyLead(test.input);
      
      if (result === test.expected) {
        console.log(`✅ ${test.name}`);
        console.log(`   Input: active=${test.input.active}, won_status=${test.input.won_status}, lost_reason_id=${test.input.lost_reason_id}`);
        console.log(`   Result: ${result}`);
        console.log(`   Proof: ${test.proof}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Expected: ${test.expected}`);
        console.log(`   Got: ${result}`);
        failed++;
      }
    } else {
      // Classification test
      const result = classifyLead(test.input);
      
      if (result === test.expected) {
        console.log(`✅ ${test.name} → ${result}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Expected: ${test.expected}`);
        console.log(`   Got: ${result}`);
        failed++;
      }
    }
  } catch (error) {
    console.log(`❌ ${test.name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
  
  console.log('');
}

// Summary
console.log('═'.repeat(60));
console.log(`Total: ${tests.length} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('═'.repeat(60));

if (failed === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
