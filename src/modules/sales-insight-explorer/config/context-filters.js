/**
 * Context Filters Configuration
 * 
 * Definitie van Laag 2: Context & Filtering
 * Zoals gespecificeerd in ITERATION_8_IMPLEMENTATION.md Section A
 * 
 * @module config/context-filters
 */

export const CONTEXT_FILTERS = Object.freeze({
  /**
   * 2.1 Gebouwgrootte
   */
  building_size: {
    id: 'building_size',
    label: 'Gebouwgrootte',
    type: 'checkboxes',
    field: 'x_studio_for_company_id.x_estate_stats.total_area',
    requires_multi_pass: true,
    
    options: [
      {
        id: 'small',
        label: 'Klein (< 1000m²)',
        filter: { operator: '<', value: 1000 }
      },
      {
        id: 'medium',
        label: 'Middel (1000-5000m²)',
        filter: { operator: 'between', value: [1000, 5000] }
      },
      {
        id: 'large',
        label: 'Groot (> 5000m²)',
        filter: { operator: '>', value: 5000 }
      }
    ]
  },

  /**
   * 2.2 Procesfase
   */
  stage_type: {
    id: 'stage_type',
    label: 'Status',
    type: 'radio',
    field: 'x_support_stage.x_stage_type',
    
    options: [
      {
        id: 'all',
        label: 'Alle',
        filter: null
      },
      {
        id: 'active',
        label: 'Actief (in behandeling)',
        filter: { operator: '=', value: 'in_progress' }
      },
      {
        id: 'won',
        label: 'Gewonnen',
        filter: { operator: '=', value: 'won' }
      },
      {
        id: 'lost',
        label: 'Verloren',
        filter: { operator: '=', value: 'lost' }
      }
    ]
  },

  /**
   * 2.3 Tijdsperiode
   */
  time_period: {
    id: 'time_period',
    label: 'Periode',
    type: 'radio',
    field: 'create_date',
    
    options: [
      {
        id: 'this_year',
        label: 'Dit jaar',
        time_scope: { period: 'this_year' }
      },
      {
        id: 'this_quarter',
        label: 'Dit kwartaal',
        time_scope: { period: 'this_quarter' }
      },
      {
        id: 'last_30_days',
        label: 'Laatste 30 dagen',
        time_scope: { period: 'last_30_days' }
      },
      {
        id: 'custom',
        label: 'Custom',
        time_scope: { period: 'custom' },
        requires_date_picker: true
      }
    ]
  },

  /**
   * 2.4 Eigenaar
   */
  owner: {
    id: 'owner',
    label: 'Eigenaar',
    type: 'radio',
    field: 'owner_id',
    
    options: [
      {
        id: 'my_sheets',
        label: 'Mijn actiebladen',
        filter: { operator: '=', value: '{{current_user.id}}' }
      },
      {
        id: 'my_team',
        label: 'Mijn team',
        filter: { operator: 'in', value: '{{current_user.team_ids}}' }
      },
      {
        id: 'specific_user',
        label: 'Specifieke gebruiker',
        requires_user_picker: true
      },
      {
        id: 'all',
        label: 'Alle',
        filter: null
      }
    ]
  },

  /**
   * 2.5 Lead-status
   */
  lead_status: {
    id: 'lead_status',
    label: 'Lead-status',
    type: 'radio',
    field: 'lead_id',
    
    options: [
      {
        id: 'all',
        label: 'Alle',
        filter: null
      },
      {
        id: 'converted',
        label: 'Geconverteerd (lead bestaat)',
        filter: { operator: 'exists' }
      },
      {
        id: 'not_converted',
        label: 'Niet geconverteerd',
        filter: { operator: 'not_exists' }
      }
    ]
  },

  /**
   * 2.6 Tags
   */
  tags: {
    id: 'tags',
    label: 'Tags',
    type: 'checkboxes',
    field: 'x_sales_action_sheet_tag',
    dynamic_options: true, // Loaded from Odoo
    
    // Will be populated at runtime
    options: []
  }
});

/**
 * Get context filter by ID
 */
export function getContextFilter(filterId) {
  return CONTEXT_FILTERS[filterId];
}

/**
 * Get all context filters
 */
export function getAllContextFilters() {
  return Object.values(CONTEXT_FILTERS);
}

/**
 * Get default filter values
 */
export function getDefaultFilterValues() {
  return {
    time_period: 'this_year',
    owner: 'my_sheets',
    stage_type: 'all',
    lead_status: 'all'
  };
}
