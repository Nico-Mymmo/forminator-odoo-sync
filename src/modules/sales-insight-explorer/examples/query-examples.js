/**
 * Example Query Definitions
 * 
 * Sample queries for testing and validation.
 * All examples are schema-driven and demonstrate correct RelationTraversal usage.
 * 
 * @module modules/sales-insight-explorer/examples
 */

/**
 * Example 1: Simple Query - No Relations
 * 
 * Gets basic opportunity fields with filtering
 */
export const simpleOpportunityQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "crm.lead", field: "expected_revenue", alias: "Value" },
    { model: "crm.lead", field: "probability", alias: "Win Probability" },
    { model: "crm.lead", field: "create_date", alias: "Created" }
  ],
  filters: [
    { model: "crm.lead", field: "expected_revenue", operator: ">=", value: 10000 },
    { model: "crm.lead", field: "probability", operator: ">", value: 0 }
  ],
  sorting: [
    { model: "crm.lead", field: "expected_revenue", direction: "desc" }
  ],
  limit: 100
};

/**
 * Example 2: Query with Many2One Relation Traversal
 * 
 * Gets opportunities with customer information
 */
export const opportunityWithCustomerQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "crm.lead", field: "expected_revenue", alias: "Value" },
    { model: "customer", field: "name", alias: "Customer Name" },
    { model: "customer", field: "email", alias: "Customer Email" },
    { model: "customer", field: "city", alias: "City" }
  ],
  filters: [
    { model: "crm.lead", field: "expected_revenue", operator: ">=", value: 5000 }
  ],
  relations: [
    {
      alias: "customer",
      path: [
        {
          from_model: "crm.lead",
          relation_field: "partner_id",
          target_model: "res.partner",
          relation_type: "many2one"
        }
      ],
      aggregation: "first" // many2one always returns single record
    }
  ],
  sorting: [
    { model: "crm.lead", field: "expected_revenue", direction: "desc" }
  ],
  limit: 50
};

/**
 * Example 3: Query with Aggregation
 * 
 * Counts opportunities by stage
 */
export const opportunitiesByStageQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "stage_id", alias: "Stage" }
  ],
  filters: [],
  aggregations: [
    {
      function: "count",
      alias: "Count",
      group_by: ["stage_id"]
    },
    {
      function: "sum",
      field: "expected_revenue",
      alias: "Total Value",
      group_by: ["stage_id"]
    },
    {
      function: "avg",
      field: "expected_revenue",
      alias: "Average Value",
      group_by: ["stage_id"]
    }
  ],
  sorting: [
    { model: "crm.lead", field: "stage_id", direction: "asc" }
  ]
};

/**
 * Example 4: Query with Time Scope
 * 
 * Opportunities created in the last 90 days
 */
export const recentOpportunitiesQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "crm.lead", field: "expected_revenue", alias: "Value" },
    { model: "crm.lead", field: "create_date", alias: "Created" }
  ],
  filters: [],
  time_scope: {
    field: "create_date",
    mode: "relative",
    period: "last_90_days"
  },
  sorting: [
    { model: "crm.lead", field: "create_date", direction: "desc" }
  ],
  limit: 100
};

/**
 * Example 5: Multi-Step Relation Traversal
 * 
 * Opportunities → Customer → Country
 */
export const opportunityWithCountryQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "customer", field: "name", alias: "Customer" },
    { model: "country", field: "name", alias: "Country" }
  ],
  filters: [],
  relations: [
    {
      alias: "customer",
      path: [
        {
          from_model: "crm.lead",
          relation_field: "partner_id",
          target_model: "res.partner",
          relation_type: "many2one"
        }
      ],
      aggregation: "first"
    },
    {
      alias: "country",
      path: [
        {
          from_model: "crm.lead",
          relation_field: "partner_id",
          target_model: "res.partner",
          relation_type: "many2one"
        },
        {
          from_model: "res.partner",
          relation_field: "country_id",
          target_model: "res.country",
          relation_type: "many2one"
        }
      ],
      aggregation: "first"
    }
  ],
  limit: 50
};

/**
 * Example 6: INVALID Query - Demonstrates validation errors
 * 
 * This query will fail validation:
 * - Uses non-existent field
 * - Uses hardcoded field name
 * - Wrong operator for field type
 */
export const invalidQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "crm.lead", field: "x_custom_field_123", alias: "Custom" } // May not exist
  ],
  filters: [
    { model: "crm.lead", field: "expected_revenue", operator: "like", value: "10000" } // Wrong operator for numeric
  ],
  relations: [],
  limit: 100
};

/**
 * Example 7: FORBIDDEN Query - Polymorphic Relation
 * 
 * This query will be rejected:
 * - Uses res_id (polymorphic relation)
 */
export const forbiddenPolymorphicQuery = {
  base_model: "mail.activity",
  fields: [
    { model: "mail.activity", field: "summary", alias: "Activity" }
  ],
  filters: [],
  relations: [
    {
      alias: "related_record",
      path: [
        {
          from_model: "mail.activity",
          relation_field: "res_id", // FORBIDDEN - Polymorphic
          target_model: "unknown",   // Cannot be determined
          relation_type: "many2one"
        }
      ]
    }
  ]
};

/**
 * Example 8: Complex Query with Multiple Relations and Aggregations
 * 
 * Opportunities with customer info and activity count
 */
export const complexOpportunityAnalysisQuery = {
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "crm.lead", field: "expected_revenue", alias: "Value" },
    { model: "crm.lead", field: "stage_id", alias: "Stage" },
    { model: "customer", field: "name", alias: "Customer" },
    { model: "customer", field: "city", alias: "City" }
  ],
  filters: [
    { model: "crm.lead", field: "expected_revenue", operator: ">=", value: 10000 },
    { model: "crm.lead", field: "active", operator: "=", value: true }
  ],
  relations: [
    {
      alias: "customer",
      path: [
        {
          from_model: "crm.lead",
          relation_field: "partner_id",
          target_model: "res.partner",
          relation_type: "many2one"
        }
      ],
      aggregation: "first"
    },
    {
      alias: "activities",
      path: [
        {
          from_model: "crm.lead",
          relation_field: "activity_ids",
          target_model: "mail.activity",
          relation_type: "one2many"
        }
      ],
      aggregation: "count",
      filters: [
        { model: "mail.activity", field: "active", operator: "=", value: true }
      ]
    }
  ],
  time_scope: {
    field: "create_date",
    mode: "relative",
    period: "last_90_days"
  },
  sorting: [
    { model: "crm.lead", field: "expected_revenue", direction: "desc" }
  ],
  limit: 100
};
