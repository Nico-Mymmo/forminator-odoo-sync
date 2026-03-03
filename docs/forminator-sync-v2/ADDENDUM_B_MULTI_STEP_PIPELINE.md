# Addendum B — Multi-Step Execution Pipeline

> **Module**: `forminator-sync-v2`
> **Status**: Architectural analysis — no implementation started
> **Date**: 2026-03-02
> **Author**: Systems Architecture Review
> **Prerequisite**: Familiarity with the base schema (`20260225142000_forminator_sync_v2_phase1_base_schema.sql`) and `worker-handler.js`

---

## 1. Executive Summary

The current execution model treats all targets in a submission run as **flat and independent**. Each target reads from the same form payload and the same shared context object, but no target can consume the output of another target that ran before it in the same pipeline.

This limits the system to scenarios where all Odoo data can be resolved before targets run (via resolvers) or comes directly from the form. It makes chained scenarios — create Contact → get ID → create Lead with that contact ID → update Website Visitor with a third key — architecturally unreachable without preloading everything into resolvers.

The proposed evolution introduces a true **ordered execution pipeline** with three structural additions:

1. **Deterministic per-submission execution order** (already partially present via `order_index`, but not semantically enforced)
2. **A target output registry** that captures `odoo_record_id` and other resolved values from each executed step and makes them available to subsequent steps
3. **A new mapping `source_type: previous_step_output`** that lets mappings in step N reference the output of step N-1 (or any earlier step by label)

Additionally, operation-type differentiation (`create`, `upsert`, `update_only`) and an explicit error strategy (`stop_on_error` / `allow_partial`) are introduced at the target level, replacing implicit behavior that is currently baked into `upsertRecordStrict`.

---

## 2. Current State Analysis

### 2.1 How targets are executed today

In `runSubmissionAttempt` (`worker-handler.js`, lines ~441–555), targets are iterated in the order returned by `getIntegrationBundle`, which calls `listTargetsByIntegration` → Supabase query with `.order('order_index', { ascending: true })`.

The loop is:

```
for (const target of integrationBundle.targets) {
  mappings = await listMappingsByTarget(env, target.id)
  identifierDomain = buildIdentifierDomainForTarget(target, mappings, normalizedForm, contextObject)
  incomingValues  = buildIncomingValuesFromMappings(mappings, normalizedForm, contextObject)
  updateValues    = buildUpdateValuesFromMappings(mappings, normalizedForm, contextObject)
  result = await upsertRecordStrict(...)
  await createSubmissionTargetResult(env, targetResult)
  targetResults.push(targetResult)
}
```

Each target runs `upsertRecordStrict` unconditionally. There is no operation-type concept beyond `update_policy` (`always_overwrite` / `only_if_incoming_non_empty`), which controls field-level write behavior, not whether a create or update is attempted.

### 2.2 How context is built today

`contextObject` starts empty at the top of `runSubmissionAttempt`. It is populated exclusively by **resolvers** (the pre-target loop). Each resolver calls `setContextValue(contextObject, resolver.output_context_key, record_id)`.

Resolvers are typed (`partner_by_email`, `webinar_by_external_id`). They write named keys into `contextObject`. Mappings can then use `source_type: 'context'` to reference those keys.

### 2.3 How mapping values are resolved today

`resolveMappingValue` (`worker-handler.js`, lines ~224–243) handles four source types:

| `source_type` | Resolution |
|---|---|
| `form` | `lookupFormValue(normalizedForm, source_value)` |
| `context` | `resolveContextValue(contextObject, source_value)` |
| `static` | `source_value` literal |
| `template` | `{field_id}` placeholder expansion from `normalizedForm` |

There is no `previous_step_output` source type.

### 2.4 How target results are stored today

After each target, `createSubmissionTargetResult(env, { submission_id, target_id, action_result, odoo_record_id, error_detail, processed_at })` writes to `fs_v2_submission_targets`.

The `odoo_record_id` is stored as `text`. After the entire loop, `target_actions` is serialized into `resolved_context` on the submission row (as a JSON array of `{ model, action, record_id }`).

Critically: **the worker never reads `fs_v2_submission_targets` during the loop for the current submission**. The stored results are only used for retry-skip logic (checking if a target already succeeded in a previous attempt).

### 2.5 How execution order is determined today

`order_index integer NOT NULL DEFAULT 0` exists on `fs_v2_targets`. The DB query orders ascending. But:

- All targets start with `order_index = 0` by default (migration line: `order_index integer NOT NULL DEFAULT 0`)
- The UI wizard does not expose ordering controls
- The system does not enforce uniqueness on `order_index` per integration
- There is no dependency declaration between targets — ordering is positional only

### 2.6 Current limitations

| Limitation | Impact |
|---|---|
| No target-to-target context propagation | Cannot pipe `record_id` from step 1 into a field of step 2 |
| `upsertRecordStrict` always attempts find-or-create | Cannot express "update only, skip if not found" or "always create new record" |
| No `stop_on_error` | A failed step 1 still allows step 2 to run, potentially creating orphaned Odoo records |
| `order_index` not enforced | Ambiguous ordering if two targets share the same index |
| No step labeling | Cannot reference "the output of the Contact step" — no stable name to bind to |
| Context populated only pre-run | To use a partner ID in a lead mapping, a resolver must pre-resolve the partner — even if the partner is being created in step 1 of the same run |

---

## 3. Architectural Gaps

### 3.1 No context propagation between targets

The resolver system exists precisely to pre-populate `contextObject` before targets run. But resolvers are limited to lookup-only operations against existing Odoo records. They cannot reference the output of a target that is about to be created.

If a Contact does not exist yet, no resolver can put its `id` into context — because the Contact does not exist until step 1 creates it. The only current workaround is `create_if_missing: true` on a `partner_by_email` resolver, which means the resolver itself creates the record — a design coupling that conflates resolution with creation.

### 3.2 No target result registry

`fs_v2_submission_targets` is a write-only log within a pipeline run. The loop never calls `listSubmissionTargetResultsBySubmission` during execution. There is no in-memory registry of `{ target_output_key → resolved_value }` that subsequent mappings could query.

For chaining to work, such a registry must exist at runtime and be queryable by step output key (not by target UUID, which is an opaque ID).

### 3.3 No operation type differentiation

`upsertRecordStrict` always attempts both a find and potentially a create. The current `update_policy` controls only which fields are written on update — not whether a create should happen at all. There is no way to say:

- "Always create a new record for this target" (e.g., a CRM activity or note, where duplicates are valid)
- "Only update if found, skip silently if not found" (a website visitor enrichment where the visitor may not exist in Odoo)

These are first-class operation types, not policy variants.

### 3.4 No stop_on_error strategy

Step failure currently silently continues. The `targetResults` accumulator collects failures, and `classifyFinalSubmissionStatus` summarizes them at the end. But step 2 runs even if step 1 failed.

This creates a correctness problem in a chained flow: if step 1 (Contact creation) fails, step 2 (Lead creation with `partner_id` from step 1) will run with a missing value — producing either a malformed Odoo record or another failure. The integration author has no way to prevent this.

### 3.5 Ambiguous ordering

Two targets with `order_index = 0` (the default) are sorted by database insertion order — which is non-deterministic from the perspective of migration and future bulk updates. A pipeline with chaining semantics requires that step order is unambiguous and stable.

---

## 4. Proposed Execution Model

### 4.1 Execution ordering

Each target receives a **unique, explicit `execution_order` integer** within its integration. This replaces the current dual-purpose of `order_index` (which serves both UI display order and execution order). The DB should enforce `UNIQUE (integration_id, execution_order)`.

The worker sorts targets by `execution_order ASC` and processes them strictly sequentially.

### 4.2 Context engine extension

The existing `contextObject` is extended, not replaced. After each target executes successfully, the worker calls a new function `registerTargetOutput(contextObject, target, result)` that writes:

```
contextObject['step.<execution_order>.record_id']   = result.recordId
contextObject['step.<label>.record_id']             = result.recordId   (if target has a label)
contextObject['step.<execution_order>.action']      = result.action
```

`label` is a new optional text field on `fs_v2_targets` (see §5). This allows mappings to reference `step.contact.record_id` instead of `step.1.record_id`, which is brittle to reordering.

Existing `context.*` keys written by resolvers remain in `contextObject` and continue to work unchanged.

### 4.3 New mapping source type: `previous_step_output`

| Field | Value |
|---|---|
| `source_type` | `'previous_step_output'` |
| `source_value` | A step reference key, e.g. `step.contact.record_id` or `step.1.record_id` |

`resolveMappingValue` gains a new branch:

```
if (mapping.source_type === 'previous_step_output') {
  return resolveContextValue(contextObject, mapping.source_value)
}
```

This is architecturally identical to the existing `context` source type. The distinction is semantic: it communicates intent (this value comes from the pipeline, not from a pre-run resolver) and enables future validation (warn if the referenced step has not yet run at the time of resolution).

### 4.4 Operation types

A new `operation_type` field on `fs_v2_targets` (see §5) replaces the implicit "always upsert" behavior. Three values:

| `operation_type` | Behavior |
|---|---|
| `upsert` | Current behavior: find-or-create, then update. Default for backward compatibility. |
| `create` | Always create a new record. Never search for an existing record. Use for models where duplicates are valid (activities, notes, registrations with unique external IDs). |
| `update_only` | Search for record by identifier. If found, update. If not found, skip (result: `skipped`) rather than create. Use for enrichment steps where the target record may not exist. |

`upsertRecordStrict` is split into three functions in `odoo-client.js`. The worker dispatches based on `target.operation_type`.

### 4.5 Error strategy

A new `error_strategy` field on `fs_v2_targets` (see §5). Two values:

| `error_strategy` | Behavior |
|---|---|
| `allow_partial` | Current behavior: log failure, continue to next target. |
| `stop_on_error` | If this target fails, abort the pipeline. Mark remaining targets as `skipped_due_to_pipeline_abort`. Classify submission as `partial_failed`. |

The worker checks `error_strategy` after each target fails:

```
if (target.error_strategy === 'stop_on_error') {
  // mark remaining targets as aborted
  // break loop
}
```

### 4.6 How this fits into the current architecture

The changes are **additive**. The core loop structure in `runSubmissionAttempt` remains. No new modules are required:

- `worker-handler.js`: loop gains `registerTargetOutput`, dispatch on `operation_type`, and `stop_on_error` guard
- `odoo-client.js`: `upsertRecordStrict` extended or split for `create` and `update_only` operation types
- `database.js`: new fields on queries; no structural query changes
- `resolveMappingValue`: one new `if` branch for `previous_step_output`

---

## 5. Database Impact

### 5.1 `fs_v2_targets`

| New field | Type | Default | Motivation | Backward compat |
|---|---|---|---|---|
| `label` | `text` | `null` | Human-readable step name for context key reference (`step.<label>.record_id`) and UI display. Optional. | Safe — nullable, ignored if absent |
| `operation_type` | `text` | `'upsert'` | Distinguishes create / upsert / update_only behavior. Replaces implicit "always upsert". | Safe — default is current behavior |
| `error_strategy` | `text` | `'allow_partial'` | Controls whether a failure stops the pipeline. | Safe — default is current behavior |
| `execution_order` | `integer` | `null` initially, then back-filled | Explicit, unique execution sequence. Separate from `order_index` (UI display order). | Requires migration with back-fill |

**Note on `execution_order` vs `order_index`**: Rather than repurposing `order_index`, a separate `execution_order` field with a `UNIQUE (integration_id, execution_order)` constraint is safer. `order_index` may legitimately be non-unique in display contexts (e.g., grouping). `execution_order` must be unique for deterministic pipeline semantics.

### 5.2 `fs_v2_submission_targets`

| New field | Type | Default | Motivation | Backward compat |
|---|---|---|---|---|
| `execution_order` | `integer` | `null` | Records at which pipeline step this result was produced. Needed for audit and replay logic. | Safe — nullable |
| `skipped_reason` | `text` | `null` | Distinguishes `retry_skip_already_successful` (existing) from `pipeline_abort` (new). Existing `error_detail` column is overloaded — cleaner as a separate code field. | Safe — nullable |

**No changes needed** to `fs_v2_submissions`. The `resolved_context` JSONB column already stores `target_actions` and the full `contextObject` — it will naturally include the extended step output registry after the pipeline runs.

### 5.3 `fs_v2_mappings`

No schema changes needed. The new `source_type: 'previous_step_output'` is a new text value in the existing `source_type` column. Existing rows are unaffected.

---

## 6. Worker Refactor Impact

### What changes

**`runSubmissionAttempt` loop**:

1. After each successful target result, call `registerTargetOutput(contextObject, target, result)` to write step output keys into `contextObject`
2. Before dispatching to odoo-client, read `target.operation_type` and call the appropriate function (`upsertRecordStrict`, `createRecord`, `updateOnlyRecord`)
3. After a target failure, check `target.error_strategy`. If `stop_on_error`: mark remaining targets as `pipeline_abort`, break loop, set submission status `partial_failed`

**`resolveMappingValue`**:

- Add branch for `source_type === 'previous_step_output'` → delegates to `resolveContextValue(contextObject, mapping.source_value)`

**`odoo-client.js`**:

- Extract `createRecord` and `updateOnlyRecord` as first-class exported functions (create already exists as an internal function)
- `upsertRecordStrict` remains unchanged for the `upsert` operation type

### What stays the same

- Resolver loop runs before target loop — no change
- `contextObject` structure — only extended, not restructured
- `createSubmissionTargetResult` call — unchanged, extended with `execution_order` / `skipped_reason` fields
- Retry skip logic — reads `action_result` from `fs_v2_submission_targets` — unchanged
- `classifyFinalSubmissionStatus` — already handles partial failures correctly

### Where context must be extended

`contextObject` at end of run is serialized into `resolved_context` on the submission row. After the refactor, this will include all step output keys (`step.1.record_id`, `step.contact.record_id`, etc.). No new column is needed — the JSONB field accommodates it.

### How target results must be stored

`createSubmissionTargetResult` gains two optional fields: `execution_order` (copied from `target.execution_order`) and `skipped_reason` (set to `'pipeline_abort'` for targets skipped due to `stop_on_error` upstream). Existing records without these fields read as `null` — backward compatible.

---

## 7. UI Impact

### 7.1 Wizard restructuring

The wizard currently shows targets as a flat list without explicit ordering. The step sequence must become visible to the user because it now has semantic meaning (step output references require a stable, predictable order).

The wizard restructures to show targets as **numbered execution steps** in a vertical timeline layout. Each step has:

- A step number badge (derived from `execution_order`)
- An optional label field ("Naam van deze stap", e.g. "Contact aanmaken")
- Operation type selector: `Upsert (vind of maak)` / `Alleen aanmaken` / `Alleen bijwerken`
- Error strategy selector: `Doorgaan bij fout` / `Stop pipeline bij fout`

### 7.2 Drag-to-reorder

Drag-to-reorder is desirable but carries a non-trivial correctness risk: reordering steps that have `previous_step_output` mappings referencing each other by `execution_order` number would silently break those references.

**Recommendation**: Implement drag-to-reorder with a validation pass after each reorder. If any mapping's `source_value` references a step that now comes after the current step, display a warning. Allow the user to fix or cancel.

Alternatively, reordering should only be allowed if the target has no `previous_step_output` mappings, or should automatically renumber `execution_order` while updating all `source_value` references.

### 7.3 Target dependency visualization

In the detail view (per-target mapping editor), the "Bron" column for a mapping should show the source type visually. When `source_type: 'previous_step_output'`, the dropdown shows a third option: **"Vorige stap"**, which expands into a sub-selector of available step output keys based on steps that precede the current step in `execution_order`.

This requires the detail view to know the full target list of the integration (already loaded in state via `S().detail.targets`).

### 7.4 New mapping source: `previous_step_output`

User-facing label: **"Vorige stap — uitvoer"**. Sub-options generated dynamically from preceding steps with `label` filled in (e.g., "Contact stap → record_id"). If `label` is absent for a step, fall back to "Stap N → record_id".

For marketers, this is conceptually: "gebruik de Odoo-ID die uit stap X kwam als waarde voor dit veld."

### 7.5 Keeping it intuitive

The majority of integrations will remain single-target (one Odoo model). For those, nothing changes in the wizard UI — operation type defaults to `upsert`, error strategy defaults to `allow_partial`, and no pipeline-chaining UI is shown.

Pipeline-chaining controls should be progressive disclosure: only visible when the integration has ≥ 2 targets.

---

## 8. Backward Compatibility Strategy

### Existing integrations (no migration breaks)

All new fields default to the current implicit behavior:

| Field | Default | Current implicit behavior it maps to |
|---|---|---|
| `operation_type = 'upsert'` | Always upsert via `upsertRecordStrict` |
| `error_strategy = 'allow_partial'` | Continue on target failure |
| `label = null` | No step label — step referenced only by `step.{order}` |
| `execution_order = null` | Worker falls back to `order_index` sort if `execution_order` is null |

The migration back-fills `execution_order` from `order_index` for all existing targets, ensuring no execution order change after migration.

### Existing mappings

All existing `source_type` values (`form`, `context`, `static`, `template`) are unchanged. No existing mapping rows need modification. The new `previous_step_output` value is only used for newly created mappings.

### Replay / retry

`runSubmissionAttempt` with `mode: 'retry'` already skips targets with successful prior results. The extended pipeline abort tracking must also treat `pipeline_abort` skips as restartable — aborted steps are not counted as "already successful" and will be retried.

---

## 9. Risk Analysis

### 9.1 Complexity

The pipeline executor adds conditional branching into the target loop. Each new configuration dimension (`operation_type` × `error_strategy`) creates a new code path. The combinatorial space is 3 × 2 = 6 target configurations, each of which must be tested for success, failure, and retry.

Risk: **Medium**. The core loop structure is simple. The most complex path is `stop_on_error` + subsequent target cleanup, which requires careful isolation of the abort logic.

### 9.2 Data integrity risks

If `stop_on_error` is not handled atomically — i.e., step 1 creates a Contact and step 2 fails and stops the pipeline — the Contact now exists in Odoo but the Lead was never created. This is a partial write at the integration level.

This is not a new risk (it exists today with `allow_partial`), but `stop_on_error` makes it more visible. The correct mental model is **the pipeline is not transactional**. Odoo has no rollback API. The system should document this clearly, and retry logic should account for it: on retry, step 1 (Contact) will be skipped if already successful, and step 2 (Lead) will be retried with the context output from step 1 recovered from `resolved_context` on the submission row.

For this to work, **replay must restore step output context** from the original submission's `resolved_context` before re-running failed targets. This requires a `restoreContextFromSubmission(submission, contextObject)` helper in the retry path.

### 9.3 Race conditions

`upsertRecordStrict` already performs a double-lookup to handle race conditions on record creation. The new `create` operation type (always create) is inherently race-safe (no lookup). The `update_only` operation type (find then update) is subject to TOCTOU if the record is deleted between find and update — but this is an Odoo data integrity concern, not a pipeline concern. The worker should treat "not found on update-only" as a non-error `skipped` result.

### 9.4 Idempotency impact

The idempotency key is currently based on `(integration_id, forminator_form_id, payload_hash)`. This remains correct for pipeline-chained runs — the payload has not changed, only the processing logic has. Re-submitted identical payloads will still be deduplicated.

However, if `operation_type: 'create'` is used for a target, re-running the same submission (e.g., a manual replay) will create a second Odoo record. This is only correct intentionally (e.g., registration entries). The UI should warn the integration author when a `create` target is present that replays will produce duplicate Odoo records.

### 9.5 Retry impact

The existing retry-skip logic checks `fs_v2_submission_targets` for `['created', 'updated', 'skipped']`. The new `pipeline_abort` skipped reason must be treated differently:

- `skipped` with `skipped_reason: 'retry_skip_already_successful'` → **do not re-run** (current behavior, preserve)
- `skipped` with `skipped_reason: 'pipeline_abort'` → **re-run** (step was aborted, not successful)

This distinction requires the retry-skip check to also inspect `skipped_reason`, not only `action_result`.

---

*End of Addendum B — Multi-Step Execution Pipeline*
