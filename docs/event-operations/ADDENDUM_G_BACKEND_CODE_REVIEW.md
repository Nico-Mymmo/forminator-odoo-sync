# ADDENDUM G – BACKEND CODE REVIEW

Date: February 16, 2026
Reviewer Mode: Strict internal review

## 1. Lead Resolution Verification

### Findings

- Closed-stage detection is partially fragile.
  - Implemented in src/modules/event-operations/services/lead-resolution-service.js via isClosedByStage.
  - It checks optional flags (is_won, is_lost variants) and then falls back to stage name substring matching (won, lost, closed).
  - Fold is not used as primary signal.
  - Result: stage naming conventions can misclassify open stages as closed or closed stages as open.

- Active filtering logic is technically implemented but depends on closed-stage classifier quality.
  - active_non_archived bucket: lead.active !== false and NOT closed by stage classifier.
  - closed_non_archived bucket: lead.active !== false and closed by stage classifier.
  - archived bucket: lead.active === false.

- Sorting order is correct and deterministic.
  - Comparator uses write_date DESC, then create_date DESC, then id DESC.

- Fallback tier sequence is implemented in correct order.
  - active_non_archived -> closed_non_archived -> archived -> null.

### Deviations

1) Reliable closed-stage signal requirement is not fully met.
- fold-based deterministic classification is not implemented.
- Name-based fallback is used as behavioral determinant.

2) Determinism is conditional on data quality of stage naming.
- If stage flags are absent and names are inconsistent, behavior becomes environment-dependent.

## 2. Batched Retrieval Verification

### Findings

- Partner IDs are deduplicated in src/modules/event-operations/services/webinar-registration-service.js.
  - registrationRows -> registered_by/partner_id -> Set(...) -> partnerIds.

- CRM lead retrieval is batched, but not guaranteed single-call for full partner set.
  - In src/modules/event-operations/services/lead-resolution-service.js:
    - uniquePartnerIds are chunked with LEAD_BATCH_SIZE = 200.
    - getLeadsByPartnerIds is called per chunk in a loop.

- No per-registration CRM calls were found.
  - Lead lookup is not executed inside row loop.
  - Stage fetch is also batched by stage IDs.

### Risk / Uncertainty

- Spec phrasing requires a single batched retrieval for the partner set.
- Current implementation performs multiple batched queries when unique partners > 200.
- This is not N+1, but it is not strictly single-query for the complete set.

## 3. Pagination Enforcement Verification

### Findings

- Threshold enforcement exists in src/modules/event-operations/services/webinar-registration-service.js.
  - requiresPagination = total > 120
  - requiresVirtualization = total > 300

- Client cannot request unlimited page size.
  - normalizePageSize clamps perPage to MAX_PAGE_SIZE = 100.
  - Request for 1000 rows is reduced to 100.

- Full-list mode bypasses pagination when total <= 120.
  - effectivePerPage = total (or 1 when total = 0).

### Deviations / Risks

1) No guard on very large page numbers.
- page is validated as positive integer but not bounded.
- Very high page values can create deep offset scans.

2) Route returns requiresVirtualization flag only.
- Backend enforces row count bounds, but does not enforce UI virtualization itself.
- This is acceptable for backend scope, but depends on UI compliance.

## 4. Attendance Write Safety

### Findings

- Audit metadata is written on every attendance write path through service API.
  - applyAttendanceUpdate always supplies attended, updatedByUserId, updatedAt, origin.
  - updateRegistrationAttendance writes all fields in one write call.

- Bulk writes are non-atomic and explicitly partial.
  - Batches of 50.
  - Per-row success/failure captured and returned.
  - No silent drop detected.

### Deviations

1) Operator identity audit does not use authenticated platform user.
- actorOdooUserId defaults to env.UID.
- Route layer does not pass context.user-derived identity mapping.
- Result: all updates may be attributed to integration user, not real operator.

2) origin is client-provided and not constrained.
- No enum/allow-list check.
- Caller can write arbitrary origin string.

## 5. Performance Risks

### Findings

- Potential unbounded field payload retrieval.
  - getWebinarRegistrations uses fields: [] in odoo-client.
  - getLeadStagesByIds also uses fields: [].
  - This can inflate payload size and memory usage unnecessarily.

- allLeads array is accumulated in memory before grouping.
  - Bounded in practice by page size (max 100 when pagination is active, up to 120 in full-list mode).
  - Not a critical spike at current limits, but still avoidable.

- Bulk attendance does Promise.all per batch of 50 writes.
  - Concurrency burst of 50 Odoo writes per batch.
  - Existing global throttle in lib/odoo.js is time-based and not lock-safe under concurrent calls.
  - Risk: burst behavior, rate-limit pressure, non-deterministic timing under load.

- Index assumptions are implicit.
  - Domains rely on x_studio_linked_webinar and partner_id.
  - If these are not indexed in Odoo, high-cardinality scans may degrade.

## 6. Security Risks

### Findings

- Questions content is returned unsanitized by backend.
  - questions field is passed through as raw value.
  - If UI sanitization is bypassed or regresses, this becomes an XSS vector.

- No direct userId injection in Addendum G routes.
  - Routes do not accept user_id from request body/query.

- Route-level auth checks are not local in Addendum G route file.
  - Access depends on module-level auth in src/index.js.
  - Module path protection exists globally; no immediate bypass found in reviewed flow.

### Risk

- Security posture depends on global routing/auth guarantees and frontend sanitization discipline.
- Addendum G routes themselves do not enforce role restrictions for write operations.

## 7. Deviations From Spec

1) Closed-stage reliability requirement not met strictly.
- fold-based deterministic signal is not primary.
- Name matching is used as key classifier.

2) Single batched lead retrieval for full partner set not strictly guaranteed.
- Chunked multi-call retrieval occurs when partner set exceeds 200.

3) Attendance audit operator identity does not represent actual workspace operator.
- Uses env.UID fallback instead of authenticated actor mapping.

4) DTO/data extraction depends on broad field fetch and heuristic field-name fallback.
- Registration query requests fields: [] and then probes multiple candidate names.
- Behavior can drift across environments if unexpected field variants appear.

5) Questions payload is forwarded raw in backend DTO.
- No backend-side classification/sanitization guard.

## 8. Risk Rating

Significant fixes required.

Reason:
- Core flow works, but deterministic closed-stage classification and audit identity traceability are not strict enough for production-grade compliance with Addendum G requirements.
- Additional hardening is needed for reliability and security boundaries before production release.
