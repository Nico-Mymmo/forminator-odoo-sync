/**
 * Pipeline Phase 1 — Unit Test Matrix
 * Tests all new logic functions without needing a live DB or Odoo connection.
 * Run: node scripts/test-pipeline-phase1.mjs
 */

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline the pure functions from worker-handler.js for isolated testing
// ─────────────────────────────────────────────────────────────────────────────

function normalizeString(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function resolveContextValue(contextObject, key) {
  const rawKey = normalizeString(key);
  if (!rawKey) return null;
  if (Object.prototype.hasOwnProperty.call(contextObject, rawKey)) return contextObject[rawKey];
  if (rawKey.startsWith('context.')) {
    const stripped = rawKey.slice('context.'.length);
    if (Object.prototype.hasOwnProperty.call(contextObject, stripped)) return contextObject[stripped];
  }
  return null;
}

function classifyFinalSubmissionStatus(targetResults) {
  const failedCount = targetResults.filter((r) => r.action_result === 'failed').length;
  const abortCount  = targetResults.filter((r) => r.skipped_reason === 'pipeline_abort').length;
  if (failedCount === 0 && abortCount === 0) return 'success';
  const totalProblematic = failedCount + abortCount;
  if (totalProblematic < targetResults.length) return 'partial_failed';
  return 'permanent_failed';
}

function shouldSkipOnRetry(latestResult) {
  if (!latestResult) return false;
  if (!['created', 'updated', 'skipped'].includes(latestResult.action_result)) return false;
  if (latestResult.skipped_reason === 'pipeline_abort') return false;
  if (latestResult.skipped_reason === 'dependency_missing') return false;
  return true;
}

function registerTargetOutput(contextObject, target, result) {
  const order = target.execution_order ?? target.order_index ?? 0;
  contextObject[`step.${order}.record_id`] = result.recordId || null;
  contextObject[`step.${order}.action`]    = result.action;
  const label = normalizeString(target.label);
  if (label) {
    contextObject[`step.${label}.record_id`] = result.recordId || null;
    contextObject[`step.${label}.action`]    = result.action;
  }
}

function restoreResolverContext(resolvedContextJson, contextObject) {
  let saved;
  try {
    saved = typeof resolvedContextJson === 'string'
      ? JSON.parse(resolvedContextJson)
      : (resolvedContextJson && typeof resolvedContextJson === 'object' ? resolvedContextJson : {});
  } catch (_) { return; }
  for (const [key, value] of Object.entries(saved)) {
    if (key === 'resolver_logs' || key === 'target_actions' || key.startsWith('step.')) continue;
    contextObject[key] = value;
  }
}

function checkRequiredDependencies(mappings, contextObject) {
  for (const mapping of mappings) {
    if (mapping.source_type !== 'previous_step_output') continue;
    if (!mapping.is_required) continue;
    const val = resolveContextValue(contextObject, mapping.source_value);
    if (val === null || val === undefined) {
      return { hasMissingDependency: true, field: mapping.odoo_field, sourceValue: mapping.source_value };
    }
  }
  return { hasMissingDependency: false };
}

function resolveMappingValue(mapping, normalizedForm, contextObject) {
  if (mapping.source_type === 'form')    return normalizedForm[mapping.source_value] || '';
  if (mapping.source_type === 'context') return resolveContextValue(contextObject, mapping.source_value);
  if (mapping.source_type === 'static')  return mapping.source_value;
  if (mapping.source_type === 'previous_step_output') return resolveContextValue(contextObject, mapping.source_value);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. classifyFinalSubmissionStatus
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. classifyFinalSubmissionStatus');

assert('all success → success',
  classifyFinalSubmissionStatus([
    { action_result: 'created', skipped_reason: null },
    { action_result: 'updated', skipped_reason: null },
  ]) === 'success');

assert('one failed → partial_failed',
  classifyFinalSubmissionStatus([
    { action_result: 'created', skipped_reason: null },
    { action_result: 'failed',  skipped_reason: null },
  ]) === 'partial_failed');

assert('all failed → permanent_failed',
  classifyFinalSubmissionStatus([
    { action_result: 'failed', skipped_reason: null },
    { action_result: 'failed', skipped_reason: null },
  ]) === 'permanent_failed');

assert('1 failed + 1 pipeline_abort (all problematic) → permanent_failed',
  classifyFinalSubmissionStatus([
    { action_result: 'failed',  skipped_reason: null },
    { action_result: 'skipped', skipped_reason: 'pipeline_abort' },
  ]) === 'permanent_failed');

assert('1 success + 1 pipeline_abort → partial_failed',
  classifyFinalSubmissionStatus([
    { action_result: 'created', skipped_reason: null },
    { action_result: 'skipped', skipped_reason: 'pipeline_abort' },
  ]) === 'partial_failed');

assert('success with regular skipped → success',
  classifyFinalSubmissionStatus([
    { action_result: 'created', skipped_reason: null },
    { action_result: 'skipped', skipped_reason: null },
  ]) === 'success');

// ─────────────────────────────────────────────────────────────────────────────
// 2. shouldSkipOnRetry
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. shouldSkipOnRetry');

assert('null result → do not skip', !shouldSkipOnRetry(null));
assert('failed → do not skip', !shouldSkipOnRetry({ action_result: 'failed', skipped_reason: null }));
assert('created → skip', shouldSkipOnRetry({ action_result: 'created', skipped_reason: null }));
assert('updated → skip', shouldSkipOnRetry({ action_result: 'updated', skipped_reason: null }));
assert('skipped (no reason) → skip', shouldSkipOnRetry({ action_result: 'skipped', skipped_reason: null }));
assert('skipped retry_skip_already_successful → skip', shouldSkipOnRetry({ action_result: 'skipped', skipped_reason: 'retry_skip_already_successful' }));
assert('skipped pipeline_abort → do NOT skip (re-run)', !shouldSkipOnRetry({ action_result: 'skipped', skipped_reason: 'pipeline_abort' }));
assert('skipped dependency_missing → do NOT skip (re-run)', !shouldSkipOnRetry({ action_result: 'skipped', skipped_reason: 'dependency_missing' }));

// ─────────────────────────────────────────────────────────────────────────────
// 3. registerTargetOutput + resolveContextValue
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. registerTargetOutput + context resolution');

const ctx = {};
registerTargetOutput(ctx, { execution_order: 1, order_index: 0, label: 'Contact' }, { action: 'created', recordId: 4821 });

assert('step.1.record_id set', ctx['step.1.record_id'] === 4821);
assert('step.1.action set', ctx['step.1.action'] === 'created');
assert('step.Contact.record_id set (label)', ctx['step.Contact.record_id'] === 4821);
assert('resolveContextValue step.1.record_id', resolveContextValue(ctx, 'step.1.record_id') === 4821);
assert('resolveContextValue step.Contact.record_id', resolveContextValue(ctx, 'step.Contact.record_id') === 4821);
assert('resolveContextValue step.2.record_id (absent) → null', resolveContextValue(ctx, 'step.2.record_id') === null);

// No label target
const ctx2 = {};
registerTargetOutput(ctx2, { execution_order: 2, order_index: 1, label: null }, { action: 'updated', recordId: 9034 });
assert('no label: step.2.record_id set', ctx2['step.2.record_id'] === 9034);
assert('no label: step.null.record_id NOT set', !Object.prototype.hasOwnProperty.call(ctx2, 'step..record_id'));

// ─────────────────────────────────────────────────────────────────────────────
// 4. checkRequiredDependencies
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. checkRequiredDependencies');

const ctxFull = { 'step.1.record_id': 4821 };
const ctxEmpty = {};

const mappingsWithRequired = [
  { source_type: 'previous_step_output', source_value: 'step.1.record_id', odoo_field: 'partner_id', is_required: true }
];
const mappingsWithoutRequired = [
  { source_type: 'previous_step_output', source_value: 'step.1.record_id', odoo_field: 'partner_id', is_required: false }
];
const mappingsForm = [
  { source_type: 'form', source_value: 'email', odoo_field: 'email_from', is_required: false }
];

assert('required dep present → no missing', !checkRequiredDependencies(mappingsWithRequired, ctxFull).hasMissingDependency);
assert('required dep absent → missing detected', checkRequiredDependencies(mappingsWithRequired, ctxEmpty).hasMissingDependency);
assert('missing dep returns correct field', checkRequiredDependencies(mappingsWithRequired, ctxEmpty).field === 'partner_id');
assert('missing dep returns correct sourceValue', checkRequiredDependencies(mappingsWithRequired, ctxEmpty).sourceValue === 'step.1.record_id');
assert('is_required false → no block even if absent', !checkRequiredDependencies(mappingsWithoutRequired, ctxEmpty).hasMissingDependency);
assert('form mappings not affected', !checkRequiredDependencies(mappingsForm, ctxEmpty).hasMissingDependency);

// ─────────────────────────────────────────────────────────────────────────────
// 5. resolveMappingValue with previous_step_output
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5. resolveMappingValue — previous_step_output');

const ctxChain = { 'step.1.record_id': 4821, 'context.partner_id': 4821 };
const form = { email: 'test@example.com' };

assert('previous_step_output resolves correctly',
  resolveMappingValue({ source_type: 'previous_step_output', source_value: 'step.1.record_id' }, form, ctxChain) === 4821);

assert('previous_step_output absent → null',
  resolveMappingValue({ source_type: 'previous_step_output', source_value: 'step.99.record_id' }, form, ctxChain) === null);

assert('context source_type still works',
  resolveMappingValue({ source_type: 'context', source_value: 'context.partner_id' }, form, ctxChain) === 4821);

assert('form source_type still works',
  resolveMappingValue({ source_type: 'form', source_value: 'email' }, form, ctxChain) === 'test@example.com');

assert('static source_type still works',
  resolveMappingValue({ source_type: 'static', source_value: 'hello' }, form, ctxChain) === 'hello');

// ─────────────────────────────────────────────────────────────────────────────
// 6. restoreResolverContext
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6. restoreResolverContext');

const restored = {};
const savedCtx = {
  'context.partner_id': 4821,
  'partner_id': 4821,
  'step.1.record_id': 4821,    // should NOT be restored (step output)
  'resolver_logs': [],          // should NOT be restored (metadata)
  'target_actions': []          // should NOT be restored (metadata)
};

restoreResolverContext(savedCtx, restored);
assert('context.partner_id restored', restored['context.partner_id'] === 4821);
assert('partner_id restored (alias)', restored['partner_id'] === 4821);
assert('step.* keys excluded', !Object.prototype.hasOwnProperty.call(restored, 'step.1.record_id'));
assert('resolver_logs excluded', !Object.prototype.hasOwnProperty.call(restored, 'resolver_logs'));
assert('target_actions excluded', !Object.prototype.hasOwnProperty.call(restored, 'target_actions'));

// Corrupt JSON — must not throw
const restored2 = {};
restoreResolverContext('{invalid json', restored2);
assert('corrupt JSON does not throw', Object.keys(restored2).length === 0);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Sorting safety (execution_order fallback)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n7. Target sorting — execution_order with fallback');

const targets = [
  { id: 'c', execution_order: null, order_index: 3 },  // fallback value 3 — unambiguously last
  { id: 'a', execution_order: 1,    order_index: 0 },
  { id: 'b', execution_order: 2,    order_index: 1 },
];

const sorted = [...targets].sort((a, b) => {
  const ao = a.execution_order ?? a.order_index ?? 0;
  const bo = b.execution_order ?? b.order_index ?? 0;
  return ao - bo;
});

assert('sorted[0] is a (execution_order:1)', sorted[0].id === 'a');
assert('sorted[1] is b (execution_order:2)', sorted[1].id === 'b');
assert('sorted[2] is c (fallback order_index:2)', sorted[2].id === 'c');

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Some tests failed — review output above.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.');
}
