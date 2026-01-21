# Serialization Contract (LOCKED)

**Version**: 1.0.0  
**Status**: LOCKED - No future changes allowed without major version bump  
**Enforcement**: Backend validation (HTTP 400 on violation)

---

## Canonical Format

All dynamic workflow values MUST be **strings** containing ONLY:

1. **Plain text** (any characters)
2. **Interpolation tokens** in the format: `${namespace.field}`

### Token Specification

```
${namespace.field}
  │         │
  │         └─ Field name: [A-Za-z0-9_]+
  │
  └─ Namespace: "field" OR known step name
```

**Valid Examples:**
```
"John Doe"
"${field.name}"
"Hello ${field.name}, your email is ${field.email}"
"${Create_Contact.partner_id}"
"Order total: ${field.total} EUR"
```

**Invalid Examples:**
```
["value"]                    ❌ JSON array
{"key": "value"}             ❌ JSON object
${{"value": "x"}}            ❌ Nested braces
${field}                     ❌ Missing dot separator
${}                          ❌ Empty token
${field.name.extra}          ❌ Multiple dots
${field-name.value}          ❌ Hyphens not allowed
null                         ❌ Non-string type
undefined                    ❌ Non-string type
42                           ❌ Non-string type
true                         ❌ Non-string type
```

---

## Validation Rules

### 1. Type Check
- Value MUST be `typeof value === 'string'`
- Empty string `""` is valid
- `null`, `undefined`, numbers, booleans, objects, arrays are **rejected**

### 2. Structural Check
- NO `[` or `]` characters (JSON array syntax)
- NO `{` or `}` characters EXCEPT within `${...}` tokens

### 3. Token Parsing
All `${...}` tokens MUST:
- Contain exactly **one dot** (`.`)
- Split into `[namespace, field]` where:
  - `namespace` matches `/^[A-Za-z0-9_]+$/`
  - `field` matches `/^[A-Za-z0-9_]+$/`

### 4. Semantic Validation
- Namespace MUST be:
  - `"field"` (Forminator field reference), OR
  - A known workflow step name (alphanumeric + underscore)
- Field MUST be alphanumeric + underscore only

---

## Enforcement

### Frontend (admin.js)
- `normalizeInputValueForTagify()` - Pre-gate before Tagify initialization
  - Migrates legacy formats (`[{value:"x"}]`, `${{"value":"x"}}`, `${field}`)
  - Converts to canonical format
  - Throws error if normalization impossible

- `initializeTagInput()` - Single initialization point
  - Calls `normalizeInputValueForTagify()` FIRST
  - Creates Tagify instance (NO try-catch needed after normalization)

- `getInputValue()` - Single serialization source
  - Returns canonical string format
  - Used by ALL event handlers

### Backend (src/actions/mappings_api.js)
- `validateWorkflowValue(value, context)` - Per-value validator
  - Type check (string only)
  - Structural check (no `[]{` except `${`)
  - Token regex validation
  - Throws descriptive errors with context

- `validateMappingData(data)` - Recursive structure validator
  - Validates ALL workflow step values:
    - `workflow[i].values[j].value` (create/update actions)
    - `workflow[i].domain[j][2]` (search action)
  - Called by:
    - `saveMapping()` - Before database write
    - `importMappings()` - Before bulk import
    - `restoreMappingFromHistory()` - Before snapshot restore

### Error Response
```json
{
  "success": false,
  "error": "validation_failed",
  "message": "CONTRACT VIOLATION at workflow[2].values[0].value (step: Create_Contact): Token '${field}' must have format '${namespace.field}'. Value: Contact: ${field}"
}
```
**HTTP Status**: `400 Bad Request`

---

## Migration Path

Legacy data formats are **automatically normalized** on frontend load:

1. **JSON Arrays**: `[{value:"x"}]` → `${x}`
2. **Nested JSON**: `${{"value":"x"}}` → `${x}`
3. **Old Syntax**: `${zip}` → `${field.zip}`

After normalization, all data MUST comply with canonical format.

**Backend does NOT accept legacy formats** - frontend MUST normalize before save.

---

## Contract Lock

This contract is **LOCKED** as of deployment version `a4241243` (2025-01-XX).

### Change Policy:
- **NO silent coercion** - All violations rejected with HTTP 400
- **NO auto-fix** - Backend does not normalize or repair data
- **NO legacy support** - Only canonical format accepted
- **NO exceptions** - Contract applies to ALL dynamic values

### Breaking Changes:
Any modification to this contract requires:
1. Major version bump (2.0.0)
2. Migration script for existing data
3. Coordination between frontend and backend deployments
4. User notification of breaking changes

---

## Testing

### Valid Payloads
```javascript
// Plain text
{ value: "John Doe" }

// Single token
{ value: "${field.email}" }

// Mixed content
{ value: "Hello ${field.name}, total: ${field.amount} EUR" }

// Step reference
{ value: "${Create_Contact.partner_id}" }

// Empty string
{ value: "" }
```

### Invalid Payloads (expect HTTP 400)
```javascript
// JSON array
{ value: ["test"] }

// JSON object
{ value: {"key": "value"} }

// Nested braces
{ value: "${{"nested": "x"}}" }

// Missing dot
{ value: "${field}" }

// Non-string
{ value: null }
{ value: 42 }
{ value: true }
```

---

## References

- Frontend Implementation: [public/admin.js](public/admin.js)
  - Lines 1406-1518: `normalizeInputValueForTagify()`
  - Lines 1520-1655: `initializeTagInput()`
  - Lines 1657-1684: `getInputValue()`

- Backend Implementation: [src/actions/mappings_api.js](src/actions/mappings_api.js)
  - Lines 1-118: Contract documentation + validators
  - Lines 270-288: `saveMapping()` validation injection
  - Lines 428-436: `importMappings()` validation injection
  - Lines 530-548: `restoreMappingFromHistory()` validation injection

- Architecture Document: [ARCHITECTURE.md](ARCHITECTURE.md)
  - Section: "Week 5: Backend Validation Layer"
