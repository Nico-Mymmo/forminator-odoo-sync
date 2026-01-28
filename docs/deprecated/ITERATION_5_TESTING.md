# Iteration 5 - Testing Guide

**Module:** Sales Insight Explorer - Export Engine  
**Date:** January 21, 2026

---

## 🧪 Complete Testing Workflow

### Prerequisites

1. Worker deployed with Iteration 5 code
2. Database migration from Iteration 4 executed
3. At least one saved query exists
4. Authorization token available

---

## Test Scenario 1: Basic JSON Export

### Step 1: Get a saved query ID

```bash
curl -X GET "http://localhost:8787/api/sales-insights/query/list" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "queries": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "High Value Opportunities",
        "base_model": "crm.lead",
        "source": "user"
      }
    ]
  }
}
```

**Copy the ID** from the first query.

---

### Step 2: Export to JSON

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json"
  }' \
  --output test-export.json
```

**Expected Result:**
- File `test-export.json` created
- HTTP 200 status
- Headers include `Content-Disposition: attachment`

---

### Step 3: Verify JSON structure

```bash
cat test-export.json | jq '.'
```

**Expected Structure:**
```json
{
  "meta": {
    "query_id": "550e8400-...",
    "query_name": "High Value Opportunities",
    "base_model": "crm.lead",
    "schema_version": "...",
    "executed_at": "2026-01-21T...",
    "record_count": 47,
    "execution_path": "search_read",
    "relations_used": 0,
    "aggregations_used": 0,
    "preview_mode": false
  },
  "fields": [
    {
      "key": "name",
      "label": "name",
      "model": "crm.lead",
      "field": "name",
      "type": "char"
    }
  ],
  "rows": [
    {
      "name": "Building Retrofit Project"
    }
  ]
}
```

**Validation Checks:**
- ✅ `meta` object exists with all required fields
- ✅ `fields` array has entries with `key`, `label`, `model`
- ✅ `rows` array has data (length > 0)
- ✅ Row keys match field keys
- ✅ All metadata preserved (query_id, name, etc.)

---

## Test Scenario 2: CSV Export

### Export to CSV

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "csv"
  }' \
  --output test-export.csv
```

**Expected Result:**
- File `test-export.csv` created
- HTTP 200 status
- `Content-Type: text/csv`

---

### Verify CSV content

```bash
cat test-export.csv
```

**Expected Format:**
```csv
name,expected_revenue,stage_id
Building Retrofit Project,25000,3
Solar Installation,18500,5
Office Expansion,32000,3
```

**Validation Checks:**
- ✅ First line is header (field keys)
- ✅ Subsequent lines are data rows
- ✅ Commas separate columns
- ✅ No extra quotes (unless needed for escaping)
- ✅ Can open in Excel/Google Sheets

---

### Test CSV escaping

Create a query with fields that need escaping, then export:

**Expected Handling:**
- Commas in values → wrapped in quotes
- Quotes in values → doubled and wrapped
- Newlines in values → wrapped in quotes
- Objects/arrays → JSON stringified

---

## Test Scenario 3: Preview Mode

### Export in preview mode

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "mode": "preview"
  }' \
  --output test-preview.json
```

**Expected Result:**
```json
{
  "meta": {
    "record_count": 10,
    "preview_mode": true
  },
  "rows": [/* max 10 rows */]
}
```

**Validation Checks:**
- ✅ `preview_mode: true` in meta
- ✅ Max 10 records (or configured preview limit)

---

## Test Scenario 4: Error Handling

### Test 1: Missing format parameter

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "message": "Missing required parameter: format",
    "code": "MISSING_PARAMETER",
    "details": {
      "supported_formats": ["json", "csv"]
    }
  }
}
```

**HTTP Status:** 400

---

### Test 2: Unsupported format

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "xml"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "message": "Unsupported export format: xml",
    "code": "UNSUPPORTED_FORMAT",
    "details": {
      "requested_format": "xml",
      "supported_formats": ["json", "csv"]
    }
  }
}
```

**HTTP Status:** 400

---

### Test 3: Invalid mode

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "mode": "invalid"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid mode. Must be \"preview\" or \"full\"",
    "code": "INVALID_PARAMETER"
  }
}
```

**HTTP Status:** 400

---

### Test 4: Query not found

```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/00000000-0000-0000-0000-000000000000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "message": "Query not found",
    "code": "NOT_FOUND",
    "details": {
      "query_id": "00000000-0000-0000-0000-000000000000"
    }
  }
}
```

**HTTP Status:** 404

---

## Test Scenario 5: Header Validation

### Check response headers

```bash
curl -i -X POST "http://localhost:8787/api/sales-insights/query/run/550e8400-e29b-41d4-a716-446655440000/export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json"
  }'
```

**Expected Headers:**
```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Disposition: attachment; filename="High_Value_Opportunities_550e8400.json"
X-Query-ID: 550e8400-e29b-41d4-a716-446655440000
X-Query-Name: High Value Opportunities
X-Export-Format: json
X-Record-Count: 47
```

**Validation Checks:**
- ✅ Content-Type matches format
- ✅ Content-Disposition includes filename
- ✅ Filename is sanitized (no special chars)
- ✅ Custom headers present (X-Query-ID, X-Export-Format)

---

## Test Scenario 6: Filename Sanitization

### Test query with special characters in name

**Create query with name:** `"High Value Opportunities (2024) - Q4 Sales!"`

**Export and check filename:**

```bash
curl -i -X POST ".../export" \
  -d '{"format": "json"}' | grep "Content-Disposition"
```

**Expected:**
```
Content-Disposition: attachment; filename="High_Value_Opportunities__2024____Q4_Sales__550e8400.json"
```

**Validation:**
- ✅ Spaces → underscores
- ✅ Special chars → underscores
- ✅ Length limited to 100 chars
- ✅ Extension preserved

---

## Test Scenario 7: Complex Query Export

### Test with relations and aggregations

**Create query with:**
- Multiple fields
- Relation traversal
- Aggregations
- Filters

**Export and verify:**

```bash
curl -X POST ".../export" \
  -d '{"format": "json"}' \
  --output complex-export.json

cat complex-export.json | jq '.fields'
```

**Expected:**
```json
{
  "fields": [
    {
      "key": "name",
      "label": "Opportunity Name",
      "model": "crm.lead",
      "field": "name",
      "type": "char"
    },
    {
      "key": "customer_name",
      "label": "Customer",
      "model": "res.partner",
      "field": "name",
      "type": "char",
      "relation_path": "partner_id"
    },
    {
      "key": "total_revenue",
      "label": "Total Revenue",
      "model": "crm.lead",
      "field": "expected_revenue",
      "aggregation": "sum",
      "type": "float"
    }
  ]
}
```

**Validation:**
- ✅ Regular fields have `field` and `type`
- ✅ Related fields have `relation_path`
- ✅ Aggregations have `aggregation` property
- ✅ All rows have values for all field keys

---

## Test Scenario 8: ChatGPT Integration

### Export for AI analysis

```bash
curl -X POST ".../export" \
  -d '{"format": "json"}' \
  --output chatgpt-export.json
```

**Paste into ChatGPT:**
```
Analyze this Odoo data export:

[paste entire JSON]

Questions:
1. What is the average expected revenue?
2. Which stage has the most opportunities?
3. Are there any data quality issues?
```

**Expected:**
- ✅ ChatGPT can parse the JSON
- ✅ Understands metadata (base_model, fields)
- ✅ Can analyze rows
- ✅ Provides insights based on data

---

## Test Scenario 9: Excel Integration

### Import CSV into Excel

```bash
curl -X POST ".../export" \
  -d '{"format": "csv"}' \
  --output excel-import.csv
```

**Steps:**
1. Open Excel
2. Import CSV file
3. Verify columns match field keys
4. Verify data integrity

**Validation:**
- ✅ All columns imported correctly
- ✅ No extra rows/columns
- ✅ Data types preserved (numbers as numbers)
- ✅ Special characters display correctly

---

## Test Scenario 10: Performance

### Large dataset export

**Create/use query that returns 1000+ records**

```bash
time curl -X POST ".../export" \
  -d '{"format": "json"}' \
  --output large-export.json
```

**Measure:**
- Export time
- File size
- Memory usage (check worker logs)

**Validation:**
- ✅ Completes without timeout
- ✅ File size reasonable (not duplicated data)
- ✅ JSON properly formatted
- ✅ All records present

---

## Regression Testing

### Verify existing endpoints still work

**Test 1:** Schema endpoint
```bash
curl -X GET "http://localhost:8787/api/sales-insights/schema"
```

**Test 2:** Query execution
```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/run/..."
```

**Test 3:** Query save
```bash
curl -X POST "http://localhost:8787/api/sales-insights/query/save"
```

**Validation:**
- ✅ All previous endpoints work
- ✅ No breaking changes
- ✅ Same response formats

---

## ✅ Testing Checklist

- [ ] JSON export works (basic)
- [ ] CSV export works (basic)
- [ ] Preview mode limits records
- [ ] Missing format parameter returns 400
- [ ] Unsupported format returns 400
- [ ] Invalid mode returns 400
- [ ] Query not found returns 404
- [ ] Response headers correct
- [ ] Filename sanitization works
- [ ] Complex queries export correctly
- [ ] Relations preserved in export
- [ ] Aggregations preserved in export
- [ ] ChatGPT can parse JSON export
- [ ] Excel can import CSV export
- [ ] Large datasets export successfully
- [ ] CSV escaping works (commas, quotes, newlines)
- [ ] All previous endpoints still work
- [ ] No errors in worker logs

---

**All tests passing = Ready for production**
