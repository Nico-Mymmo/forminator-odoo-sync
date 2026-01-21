/**
 * Presentation Modes Configuration
 * 
 * Definitie van Laag 3: Presentatie & Aggregatie
 * Zoals gespecificeerd in ITERATION_8_IMPLEMENTATION.md Section A
 * 
 * @module config/presentation-modes
 */

export const PRESENTATION_MODES = Object.freeze({
  /**
   * 3.1 Groeperen
   */
  group_by: {
    id: 'group_by',
    label: 'Groeperen per',
    type: 'group_by',
    
    // Available fields depend on selected layer
    getAvailableFields: (layerId) => {
      const fieldsByLayer = {
        pain_points: [
          { value: 'x_user_painpoints.name', label: 'Per pijnpunt' },
          { value: 'x_user_painpoints.category', label: 'Per categorie' },
          { value: 'name', label: 'Per actieblad' }
        ],
        meeting_evolution: [
          { value: 'x_meeting_type', label: 'Per meeting type' },
          { value: 'create_date:month', label: 'Per maand' },
          { value: 'name', label: 'Per actieblad' }
        ],
        stage_distribution: [
          { value: 'x_support_stage.name', label: 'Per fase' },
          { value: 'x_support_stage.x_stage_type', label: 'Per status' }
        ],
        building_context: [
          { value: 'x_studio_for_company_id.customer_type', label: 'Per gebouwtype' },
          { value: 'building_size_category', label: 'Per groottecategorie' }
        ],
        sales_outcome: [
          { value: 'x_support_stage.x_stage_type', label: 'Per uitkomst' },
          { value: 'x_won_reason', label: 'Per win reden' },
          { value: 'x_lost_reason', label: 'Per verlies reden' }
        ],
        basic_info: [
          { value: 'create_date:month', label: 'Per maand' },
          { value: 'x_support_stage.name', label: 'Per fase' }
        ]
      };
      
      return fieldsByLayer[layerId] || [];
    }
  },

  /**
   * 3.2 Vergelijken
   */
  compare: {
    id: 'compare',
    label: 'Vergelijken',
    type: 'comparison',
    
    options: [
      {
        id: 'lead_conversion',
        label: 'Voor vs na conversie',
        split_on: { field: 'lead_id', operator: 'exists' },
        labels: ['Zonder lead', 'Met lead']
      },
      {
        id: 'won_vs_lost',
        label: 'Gewonnen vs verloren',
        split_on: { field: 'x_support_stage.x_stage_type' },
        values: ['won', 'lost'],
        labels: ['Gewonnen', 'Verloren']
      },
      {
        id: 'time_comparison',
        label: 'Dit jaar vs vorig jaar',
        type: 'time_comparison',
        periods: ['this_year', 'last_year']
      },
      {
        id: 'team_comparison',
        label: 'Team A vs Team B',
        split_on: { field: 'owner_id' },
        requires_team_picker: true
      }
    ]
  },

  /**
   * 3.3 Trend
   */
  trend: {
    id: 'trend',
    label: 'Trend over tijd',
    type: 'trend',
    requires_date_field: true,
    
    options: [
      {
        id: 'per_month',
        label: 'Per maand',
        group_by: 'create_date:month'
      },
      {
        id: 'per_quarter',
        label: 'Per kwartaal',
        group_by: 'create_date:quarter'
      },
      {
        id: 'per_week',
        label: 'Per week',
        group_by: 'create_date:week'
      }
    ],
    
    // Disabled for these layers
    disabled_for: ['stage_distribution', 'building_context']
  },

  /**
   * 3.4 Top/Bottom
   */
  top_bottom: {
    id: 'top_bottom',
    label: 'Top/Bottom',
    type: 'top_bottom',
    requires_numeric_or_count: true,
    
    options: [
      { value: 5, label: 'Top 5' },
      { value: 10, label: 'Top 10' },
      { value: 20, label: 'Top 20' }
    ],
    
    direction_options: [
      { value: 'desc', label: 'Hoogste' },
      { value: 'asc', label: 'Laagste' }
    ]
  },

  /**
   * 3.5 Samenvatten
   */
  summarize: {
    id: 'summarize',
    label: 'Samenvatten',
    type: 'summary',
    
    options: [
      { value: 'sum', label: 'Totaal (SUM)' },
      { value: 'avg', label: 'Gemiddelde (AVG)' },
      { value: 'min', label: 'Minimum (MIN)' },
      { value: 'max', label: 'Maximum (MAX)' },
      { value: 'count', label: 'Aantal (COUNT)' }
    ]
  }
});

/**
 * Get presentation mode by ID
 */
export function getPresentationMode(modeId) {
  return PRESENTATION_MODES[modeId];
}

/**
 * Get all presentation modes
 */
export function getAllPresentationModes() {
  return Object.values(PRESENTATION_MODES);
}

/**
 * Check if presentation mode is available for layer
 */
export function isPresentationModeAvailable(modeId, layerId) {
  const mode = PRESENTATION_MODES[modeId];
  if (!mode) return false;
  
  if (mode.disabled_for && mode.disabled_for.includes(layerId)) {
    return false;
  }
  
  // Trend requires temporal layers
  if (modeId === 'trend') {
    const temporalLayers = ['meeting_evolution', 'basic_info'];
    return temporalLayers.includes(layerId);
  }
  
  return true;
}
