# Bug Fix: Field Format Compatibility

## Issue
`TypeError: unhashable type: 'dict'` when executing semantic queries with the new CRM leads feature.

## Root Cause
The semantic wizard's `buildPayload()` function was updated to use the proper QueryDefinition structure with fields as objects:
```javascript
{ model: 'x_sales_action_sheet', field: 'id' }
```

However, the `runSemanticQuery` endpoint was passing these objects directly to Odoo's `search_read` API, which expects an array of strings:
```javascript
['id', 'x_name', 'create_date']
```

Odoo tried to use the dict objects as hash keys and failed with the TypeError.

## Solution
Updated `runSemanticQuery` in [routes.js](src/modules/sales-insight-explorer/routes.js) to:
1. Detect if fields are objects with `{ model, field }` structure
2. Extract only the `field` property from each object
3. Filter to only base model fields (excluding relation fields)
4. Pass clean string array to Odoo's `search_read`

## Code Change

### Before (Broken)
```javascript
const fields = Array.isArray(payload.fields) && payload.fields.length > 0 
  ? payload.fields 
  : ['id'];
```

### After (Fixed)
```javascript
let fields;
if (Array.isArray(payload.fields) && payload.fields.length > 0) {
  // Check if fields are objects with 'field' property or plain strings
  if (typeof payload.fields[0] === 'object' && payload.fields[0].field) {
    // Extract field names from {model, field} objects
    fields = payload.fields
      .filter(f => f.model === model) // Only base model fields
      .map(f => f.field);             // Extract field name
  } else {
    // Already plain strings
    fields = payload.fields;
  }
} else {
  fields = ['id'];
}
```

## Why This Works
1. **Backward Compatible**: Still handles old string format
2. **Forward Compatible**: Handles new object format
3. **Correct Filtering**: Only passes base model fields to `search_read`
4. **Relation Support**: Relations are handled separately (not yet implemented in semantic wizard)

## Testing
Execute a semantic query with:
- CRM leads enabled
- Information sets enabled
- Time filter applied
- Apartments filter applied

Expected: Query executes successfully without TypeError.

## Related Files
- `public/semantic-wizard.js` - Generates object-based fields
- `src/modules/sales-insight-explorer/routes.js` - Fixed to handle both formats
- `src/modules/sales-insight-explorer/lib/query-executor.js` - Already handles object format correctly

## Status
✅ Fixed and tested
