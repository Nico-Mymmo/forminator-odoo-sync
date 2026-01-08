# Development Best Practices

## Template Syntax Rules

### ALWAYS use `${...}` syntax
```javascript
// ✅ CORRECT
"${field.email}"
"${contact.id}"
"${step.fieldname}"

// ❌ WRONG
"$field.email"
"$contact.id"
```

### Field vs Step References
- **Field references**: `${field.name}` or `${fieldname}` - data from form submission
- **Step references**: `${stepname.fieldname}` - data from previous workflow steps

## Workflow Engine

### Template Processing Flow
1. Input string cleaned: `$contact.id` → `${contact.id}` (automatic fix for broken syntax)
2. Step references resolved first: `${contact.id}` → `906513`
3. Field references resolved second: `${field.email}` → `user@example.com`

### Type Conversion
The workflow engine automatically converts values based on Odoo field types:
- `integer`: Parsed to number (`"123"` → `123`)
- `float`: Parsed to decimal
- `boolean`: Smart conversion (`"true"`, `"1"`, `true` → `true`)
- `many2one`: Extracts ID from `[id, "name"]` arrays

## Admin Interface

### Field Palette
Palette chips store raw field names without `${}`:
```javascript
chip.dataset.field = "contact.id"  // ✅ Correct - no $ prefix
```

### Drop Handlers
Template drop zones add `${}` syntax:
```javascript
updateTemplateValue(idx, fieldKey, '${' + draggedFieldName + '}');
```

### ChipInput Serialization
```javascript
// Multi-value fields (name, partner_id, etc.)
const chips = container.querySelectorAll('.badge');
const values = Array.from(chips).map(chip => chip.dataset.value);
return values.length === 1 ? values[0] : values;
```

## Database Schema

### Workflow JSON Structure
```javascript
{
  "step": "contact",           // Unique step identifier
  "model": "res.partner",      // Odoo model name
  "search": {
    "domain": [...],           // Search conditions (template strings)
    "fields": [...]            // Fields to retrieve
  },
  "create": {                  // Create data (template strings)
    "name": "${field.name}",
    "email": "${field.email}"
  },
  "update": {...},             // Update data (optional)
  "_templateConfig": {         // UI metadata (not used in execution)
    "template": "searchById",
    "values": {...}
  },
  "_ui_metadata": {            // Type hints for conversion
    "create_types": {
      "partner_id": "integer"
    }
  }
}
```

## Common Pitfalls

### ❌ Double Placeholder Syntax
```javascript
// Database has: "${contact.id}"
// Normalization adds: "${{contact.id}}" ← WRONG!
```
**Fix**: Only normalize if value doesn't already have `${...}`

### ❌ Template Literals in String Concatenation
```javascript
// ❌ WRONG - creates literal backslash
`\${${value}}`

// ✅ CORRECT
'${' + value + '}'
```

### ❌ Ignoring Empty Values
```javascript
// ❌ WRONG - skips empty but valid values
if (processed) {
  result[key] = processed;
}

// ✅ CORRECT - check for undefined/null explicitly
if (processed !== undefined && processed !== null) {
  result[key] = processed;
}
```

## Error Handling

### Always Log Context
```javascript
console.log(`🔍 [${timestamp}] RAW create template:`, JSON.stringify(template));
console.log(`✨ [${timestamp}] PROCESSED create data:`, JSON.stringify(data));
```

### Template Resolution Failures
- `null` return = unresolved reference (step not found, field missing)
- Empty string = valid but empty value (e.g., `${field.optional}` when field is empty)

## Testing Checklist

Before deploying workflow changes:
1. ✅ Check generated domain in admin preview
2. ✅ Verify RAW template in logs
3. ✅ Verify PROCESSED data in logs
4. ✅ Confirm Odoo receives correct types (integer vs string)
5. ✅ Test with missing/empty fields
6. ✅ Test with existing records (update path)
7. ✅ Test with new records (create path)

## Deployment

```bash
# 1. Clean build
npm install

# 2. Deploy to Cloudflare
npx wrangler deploy

# 3. Monitor first submission
npx wrangler tail

# 4. Check admin interface loads
curl https://forminator-sync.openvme-odoo.workers.dev/
```

## Architecture Principles

1. **Single Source of Truth**: Database (Supabase) contains workflow config
2. **Stateless Workers**: No persistent state in Worker memory
3. **Idempotent Operations**: Re-running same submission has same result
4. **Progressive Enhancement**: Fallbacks for missing/invalid data
5. **Defensive Programming**: Validate inputs, handle edge cases, log everything
