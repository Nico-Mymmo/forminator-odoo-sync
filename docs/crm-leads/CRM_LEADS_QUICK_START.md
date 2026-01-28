# Quick Start: CRM Leads Feature

## How to Use

### 1. Enable CRM Leads (Step 1)

Navigate to the Sales Insight Explorer wizard.

In **Step 1: Wat wil je ophalen?**, scroll to the bottom where you'll find:

```
┌─────────────────────────────────────────────┐
│ CRM Leads (Optioneel)                       │
│                                             │
│ ☐ Include CRM Leads                        │
│   Voeg lead informatie toe: id, name,      │
│   stage_id, active, won_status             │
└─────────────────────────────────────────────┘
```

Check the box to include CRM lead data.

**What happens:** The system will add a RelationTraversal from `x_sales_action_sheet.lead_id` to `crm.lead`, including these 5 fields:
- `id`
- `name`
- `stage_id` (includes id + display name)
- `active`
- `won_status`

### 2. Apply Lead Filters (Step 2)

Click **Volgende →** to proceed to Step 2.

If you enabled CRM leads, you'll see a new section at the bottom:

```
┌─────────────────────────────────────────────┐
│ Lead Filters (Optioneel)                    │
│                                             │
│ Won Status (multi-select)                   │
│ ☐ Won   ☐ Lost   ☐ Pending                │
│                                             │
│ CRM Stages (multi-select)                   │
│ ☐ [1] Qualification                        │
│ ☐ [2] Needs Analysis                       │
│ ☐ [3] Proposal                             │
│ ...                                         │
│                                             │
│ [Select all stages] [Clear stages]          │
└─────────────────────────────────────────────┘
```

**Won Status Filter:**
- Select one or more: Won, Lost, Pending
- Leave unchecked for all statuses

**Stage Filter:**
- Stages are ordered by sequence (chronological)
- Check specific stages you want to include
- Use "Select all stages" to select all at once
- Use "Clear stages" to deselect all

### 3. Execute and Export

Click **Uitvoeren** to run the query.

Results will include lead data with the `lead.` prefix:
```
id | x_name           | lead.id | lead.name        | lead.won_status
1  | Action Sheet A   | 101     | Lead ABC Corp    | won
2  | Action Sheet B   | 102     | Lead XYZ Inc     | lost
3  | Action Sheet C   | null    | null             | null
```

Export results using:
- **Export XLSX** - Full data with HTML content handling
- **Export JSON** - Raw data for further processing

## Common Scenarios

### Scenario 1: Find All Lost Leads
1. Enable CRM leads
2. In Step 2, check only **Lost** under Won Status
3. Leave stages unchecked (all stages)
4. Execute

**Use case:** Identify all action sheets where the lead was lost

### Scenario 2: Drop-Off Analysis
1. Enable CRM leads
2. In Step 2:
   - Check **Lost** under Won Status
   - Select specific stages (e.g., stages 2 and 3)
3. Execute

**Use case:** Find where leads drop off in the pipeline

### Scenario 3: Won Leads Only
1. Enable CRM leads
2. In Step 2, check only **Won** under Won Status
3. Execute

**Use case:** Success analysis - what action sheets led to won deals

### Scenario 4: Early-Stage Analysis
1. Enable CRM leads
2. In Step 2:
   - Leave Won Status unchecked (all)
   - Select only first 2-3 stages
3. Execute

**Use case:** Focus on early pipeline activity

## Important Notes

### When Toggle is OFF
- No lead data is fetched
- No lead fields in results
- No performance impact

### When Toggle is ON
- 5 lead fields are always included
- No defaults - you control the filters
- Empty filters = all leads

### Stage Filtering
- Stages displayed in chronological order (by sequence)
- Select explicit stage IDs only
- No automatic "up to stage X" calculation in backend
- UI helpers make selection easier

### Combined Filters
- Both won_status and stage_id can be applied together
- Filters use AND logic (both must match)
- Example: "lost" AND "stage in [2,3]" = leads lost at stages 2 or 3

## Payload Preview

Before execution, check the payload in the console:

```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    { "model": "x_sales_action_sheet", "field": "id" },
    { "model": "lead", "field": "id" },
    { "model": "lead", "field": "name" },
    { "model": "lead", "field": "stage_id" },
    { "model": "lead", "field": "active" },
    { "model": "lead", "field": "won_status" }
  ],
  "relations": [
    {
      "alias": "lead",
      "path": [...],
      "filters": [
        { "model": "lead", "field": "won_status", "operator": "in", "value": ["lost"] }
      ]
    }
  ]
}
```

This payload is:
- ✅ Fully explicit
- ✅ Schema-validated
- ✅ Deterministic
- ✅ Inspectable

## Troubleshooting

### "Failed to load CRM stages"
- Refresh the page
- Check Odoo connection
- Verify `crm.stage` model exists in your Odoo instance

### No lead data in results
- Ensure toggle is enabled in Step 1
- Check if action sheets have `lead_id` set
- Action sheets without leads will show null values

### Stage filter not working
- Verify stage IDs are valid
- Check payload preview to confirm filter structure
- Remember: filters use AND logic (all must match)

## Advanced Usage

### Combining with Other Filters
You can combine lead filters with:
- Time filter (create_date)
- Apartments filter (x_studio_number_of_apartments)
- Information sets (other action sheet fields)

Example: "Lost leads in Q1 2024 for buildings with 10+ apartments"

### Export for Analysis
1. Run query with desired filters
2. Export to XLSX
3. Open in Excel/Google Sheets
4. Create pivot tables or charts
5. Analyze drop-off patterns

## What This Feature Does NOT Do

❌ Automatically aggregate leads
❌ Calculate conversion rates
❌ Infer "best" stages
❌ Recommend actions
❌ Apply default filters
❌ Join tables (uses RelationTraversal)

This is a **data retrieval tool**, not an analytics platform.
You control what data to fetch and how to filter it.
