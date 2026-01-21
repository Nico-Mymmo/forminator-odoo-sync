/**
 * Preset Generator Examples
 * 
 * Demonstrates how presets are generated from different schema configurations.
 * These are NOT real queries - they show what the generator WOULD produce
 * given different schema inputs.
 * 
 * IMPORTANT: All field names here are EXAMPLES. The real generator
 * never hardcodes these - it discovers them from the schema.
 */

/**
 * Example 1: Model with Status Field
 * 
 * Schema Input:
 * - Model: "project.task"
 * - Fields:
 *   - name (char, required)
 *   - stage_id (many2one → project.stage)
 *   - date_deadline (date)
 *   - planned_hours (float)
 * - Capabilities:
 *   - supports_read_group: true
 *   - estimated_record_count: 450
 * 
 * Generated Presets:
 */
export const exampleTaskPresets = [
  {
    id: "a1b2c3d4e5f6g7h8",
    name: "Distribution by Stage Id",
    description: "Count of records grouped by Stage Id",
    category: "distribution",
    base_model: "project.task",
    query: {
      base_model: "project.task",
      fields: [
        { model: "project.task", field: "stage_id", alias: "Stage Id" }
      ],
      aggregations: [
        { function: "count", alias: "Count", group_by: ["stage_id"] }
      ],
      filters: [],
      relations: [],
      sorting: [],
      limit: 100
    },
    reasoning: "Provides overview of record distribution across many2one field",
    complexity_hint: "simple"
  },
  {
    id: "b2c3d4e5f6g7h8i9",
    name: "Record Trend (Last 90 Days)",
    description: "Count of records created in the last 90 days based on Date Deadline",
    category: "trend",
    base_model: "project.task",
    query: {
      base_model: "project.task",
      fields: [],
      aggregations: [
        { function: "count", alias: "Count" }
      ],
      filters: [],
      relations: [],
      sorting: [],
      time_scope: {
        field: "date_deadline",
        mode: "relative",
        period: "last_90_days"
      },
      limit: 1000
    },
    reasoning: "Shows activity trend using temporal field date_deadline",
    complexity_hint: "simple"
  },
  {
    id: "c3d4e5f6g7h8i9j0",
    name: "Planned Hours by Stage Id",
    description: "Sum and count of Planned Hours grouped by Stage Id",
    category: "segmentation",
    base_model: "project.task",
    query: {
      base_model: "project.task",
      fields: [
        { model: "project.task", field: "stage_id", alias: "Stage Id" }
      ],
      aggregations: [
        {
          function: "sum",
          field: "planned_hours",
          alias: "Total Planned Hours",
          group_by: ["stage_id"]
        },
        {
          function: "count",
          alias: "Count",
          group_by: ["stage_id"]
        }
      ],
      filters: [],
      relations: [],
      sorting: [],
      limit: 100
    },
    reasoning: "Segments numeric data by categorical dimension",
    complexity_hint: "simple"
  },
  {
    id: "d4e5f6g7h8i9j0k1",
    name: "Stale Records (>90 Days)",
    description: "Records with Date Deadline older than 90 days",
    category: "risk",
    base_model: "project.task",
    query: {
      base_model: "project.task",
      fields: [
        { model: "project.task", field: "date_deadline", alias: "Date Deadline" }
      ],
      aggregations: [],
      filters: [],
      relations: [],
      sorting: [
        { field: "date_deadline", direction: "asc" }
      ],
      time_scope: {
        field: "date_deadline",
        mode: "relative",
        period: { value: 90, unit: "days", direction: "past" },
        comparison: "before"
      },
      limit: 50
    },
    reasoning: "Identifies potentially outdated records",
    complexity_hint: "simple"
  }
];

/**
 * Example 2: Model with Relations
 * 
 * Schema Input:
 * - Model: "sale.order"
 * - Fields:
 *   - name (char, required)
 *   - state (selection: ['draft', 'sent', 'sale', 'done', 'cancel'])
 *   - partner_id (many2one → res.partner)
 *   - order_line (one2many ← sale.order.line)
 *   - amount_total (monetary)
 *   - date_order (datetime)
 * - Capabilities:
 *   - supports_read_group: true
 *   - max_relation_depth: 2
 *   - estimated_record_count: 1200
 * 
 * Generated Presets:
 */
export const exampleSaleOrderPresets = [
  {
    id: "e5f6g7h8i9j0k1l2",
    name: "Distribution by State",
    description: "Count of records grouped by State",
    category: "distribution",
    base_model: "sale.order",
    query: {
      base_model: "sale.order",
      fields: [
        { model: "sale.order", field: "state", alias: "State" }
      ],
      aggregations: [
        { function: "count", alias: "Count", group_by: ["state"] }
      ],
      filters: [],
      relations: [],
      sorting: [],
      limit: 100
    },
    reasoning: "Provides overview of record distribution across selection field",
    complexity_hint: "simple"
  },
  {
    id: "f6g7h8i9j0k1l2m3",
    name: "Amount Total Trend (Last 90 Days)",
    description: "Sum of Amount Total over the last 90 days",
    category: "trend",
    base_model: "sale.order",
    query: {
      base_model: "sale.order",
      fields: [],
      aggregations: [
        { function: "sum", field: "amount_total", alias: "Total Amount Total" }
      ],
      filters: [],
      relations: [],
      sorting: [],
      time_scope: {
        field: "date_order",
        mode: "relative",
        period: "last_90_days"
      },
      limit: 1000
    },
    reasoning: "Shows numeric trend for amount_total field",
    complexity_hint: "simple"
  },
  {
    id: "g7h8i9j0k1l2m3n4",
    name: "Records with Related Order Line",
    description: "List of records with count of related Order Line",
    category: "activity",
    base_model: "sale.order",
    query: {
      base_model: "sale.order",
      fields: [
        { model: "sale.order", field: "id", alias: "ID" }
      ],
      aggregations: [],
      filters: [],
      relations: [
        {
          alias: "Order Line",
          path: [
            {
              from_model: "sale.order",
              relation_field: "order_line",
              target_model: "sale.order.line",
              relation_type: "one2many"
            }
          ],
          aggregation: "count"
        }
      ],
      sorting: [],
      limit: 50
    },
    reasoning: "Shows relationship activity via one2many field",
    complexity_hint: "moderate"
  },
  {
    id: "h8i9j0k1l2m3n4o5",
    name: "Records Missing Partner Id",
    description: "Records where Partner Id is not set",
    category: "risk",
    base_model: "sale.order",
    query: {
      base_model: "sale.order",
      fields: [
        { model: "sale.order", field: "partner_id", alias: "Partner Id" }
      ],
      aggregations: [],
      filters: [
        {
          model: "sale.order",
          field: "partner_id",
          operator: "is not set"
        }
      ],
      relations: [],
      sorting: [],
      limit: 50
    },
    reasoning: "Identifies incomplete records with missing relation",
    complexity_hint: "simple"
  }
];

/**
 * Example 3: Model WITHOUT read_group Support
 * 
 * Schema Input:
 * - Model: "mail.message"
 * - Fields:
 *   - subject (char)
 *   - date (datetime, required)
 *   - model (char)
 *   - res_id (integer)
 * - Capabilities:
 *   - supports_read_group: FALSE
 *   - supports_search: true
 *   - estimated_record_count: 50000
 * 
 * Generated Presets:
 * (Limited - no aggregations, only trend and risk patterns)
 */
export const exampleMailMessagePresets = [
  {
    id: "i9j0k1l2m3n4o5p6",
    name: "Record Trend (Last 90 Days)",
    description: "Count of records created in the last 90 days based on Date",
    category: "trend",
    base_model: "mail.message",
    query: {
      base_model: "mail.message",
      fields: [],
      aggregations: [
        { function: "count", alias: "Count" }
      ],
      filters: [],
      relations: [],
      sorting: [],
      time_scope: {
        field: "date",
        mode: "relative",
        period: "last_90_days"
      },
      limit: 1000
    },
    reasoning: "Shows activity trend using temporal field date",
    complexity_hint: "simple"
  },
  {
    id: "j0k1l2m3n4o5p6q7",
    name: "Stale Records (>90 Days)",
    description: "Records with Date older than 90 days",
    category: "risk",
    base_model: "mail.message",
    query: {
      base_model: "mail.message",
      fields: [
        { model: "mail.message", field: "date", alias: "Date" }
      ],
      aggregations: [],
      filters: [],
      relations: [],
      sorting: [
        { field: "date", direction: "asc" }
      ],
      time_scope: {
        field: "date",
        mode: "relative",
        period: { value: 90, unit: "days", direction: "past" },
        comparison: "before"
      },
      limit: 50
    },
    reasoning: "Identifies potentially outdated records",
    complexity_hint: "simple"
  }
  // Note: No distribution, segmentation, or activity presets
  // because read_group is not supported and no relations exist
];

/**
 * Example 4: Invalid Preset (Would Be Rejected)
 * 
 * This pattern would be GENERATED but then REJECTED during validation.
 */
export const exampleRejectedPreset = {
  id: "k1l2m3n4o5p6q7r8",
  name: "Distribution by Invalid Field",
  description: "Would fail validation",
  category: "distribution",
  base_model: "crm.lead",
  query: {
    base_model: "crm.lead",
    fields: [
      { model: "crm.lead", field: "nonexistent_field", alias: "Invalid" }
      // ❌ Field doesn't exist in schema
    ],
    aggregations: [
      { function: "count", alias: "Count", group_by: ["nonexistent_field"] }
    ],
    filters: [],
    relations: [],
    sorting: [],
    limit: 100
  },
  reasoning: "This would be generated then discarded",
  complexity_hint: "simple"
};

// Validation result:
// {
//   valid: false,
//   errors: [
//     {
//       field: "fields.0.field",
//       message: "Field 'nonexistent_field' not found in model 'crm.lead'"
//     }
//   ]
// }
// 
// Action: DISCARD (stats.rejected++, never auto-fix)

/**
 * Example 5: Capability-Limited Preset
 * 
 * This shows how capability limits prevent invalid presets.
 */
export const exampleCapabilityLimited = {
  // Scenario: Model has max_relation_depth = 0
  // 
  // Generator would TRY to create activity preset:
  // {
  //   relations: [{ path: [...] }]
  // }
  // 
  // But validator would reject:
  // {
  //   valid: false,
  //   errors: [
  //     {
  //       field: "relations.0",
  //       message: "Relation depth 1 exceeds max_relation_depth 0 for model"
  //     }
  //   ]
  // }
  // 
  // Result: Preset discarded, never returned to user
};

/**
 * Statistics Example
 * 
 * Console output from preset generation:
 */
export const exampleGenerationStats = {
  generated: 45,    // Total patterns attempted across all models
  accepted: 28,     // Passed validation
  rejected: 17,     // Failed validation
  reasons: {
    "Field 'X' not found in model 'Y'": 8,
    "Relation depth exceeds max_relation_depth": 5,
    "Model does not support read_group": 3,
    "Target model 'Z' not found in schema": 1
  }
};

// Logged as:
// [Preset Generator] {
//   generated: 45,
//   accepted: 28,
//   rejected: 17,
//   reasons: { ... }
// }
