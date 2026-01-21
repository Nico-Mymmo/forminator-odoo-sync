/**
 * Semantic Layers Configuration
 * 
 * Definitie van alle semantic layers zoals gespecificeerd in ITERATION_8_IMPLEMENTATION.md
 * Section A: Definitieve Semantische Keuzelagen
 * 
 * LOCKED PROPERTIES (niet configureerbaar via admin UI):
 * - base_model
 * - mandatory_fields
 * - incompatible_with
 * - execution_hint
 * - validate function
 * 
 * CONFIGURABLE PROPERTIES (via admin UI):
 * - label
 * - description
 * - icon
 * - tooltips
 * - help_text
 * 
 * @module config/semantic-layers
 */

/**
 * @typedef {Object} SemanticLayer
 * @property {string} id - Unique identifier
 * @property {string} label - User-facing name (CONFIGURABLE)
 * @property {string} description - User-facing description (CONFIGURABLE)
 * @property {string} icon - Icon identifier (CONFIGURABLE)
 * @property {'metric'|'temporal'|'categorical'|'indirect'|'result'|'overview'} type - Layer type (LOCKED)
 * @property {string} base_model - Always 'x_sales_action_sheet' (LOCKED)
 * @property {Array<string>} mandatory_fields - Required fields (LOCKED)
 * @property {Array<string>} incompatible_with - Incompatible layer IDs (LOCKED)
 * @property {'read_group'|'multi_pass'|'search_read'} execution_hint - Performance hint (LOCKED)
 * @property {Function} validate - Validation function (LOCKED)
 * @property {Object} relations - Relation path definition (LOCKED)
 * @property {Array<Object>} sub_options - Sub-layer choices (structure LOCKED, labels CONFIGURABLE)
 */

export const SEMANTIC_LAYERS = Object.freeze({
  /**
   * 1.1 Pijnpunten & Obstakels (Metric Layer)
   */
  pain_points: {
    id: 'pain_points',
    label: 'Pijnpunten & Obstakels',
    description: 'Welke obstakels ervaren klanten?',
    icon: 'alert-triangle',
    type: 'metric',
    
    // LOCKED
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_action_sheet_pain_points.score', 'x_user_painpoints.name'],
    incompatible_with: ['stage_distribution'],
    execution_hint: 'read_group',
    
    relations: {
      path: [
        {
          relation_field: 'x_action_sheet_pain_points',
          target_model: 'x_action_sheet_pain_points'
        },
        {
          relation_field: 'x_user_painpoints',
          target_model: 'x_user_painpoints'
        }
      ],
      fields: ['name', 'score']
    },
    
    sub_options: [
      {
        id: 'most_common',
        label: 'Meest voorkomend',
        description: 'Aantal actiebladen per pijnpunt',
        aggregation: { field: 'id', function: 'count', group_by: 'x_user_painpoints.name' }
      },
      {
        id: 'most_severe',
        label: 'Meest ernstig',
        description: 'Gemiddelde score per pijnpunt',
        aggregation: { field: 'x_action_sheet_pain_points.score', function: 'avg', group_by: 'x_user_painpoints.name' }
      },
      {
        id: 'biggest_impact',
        label: 'Grootste impact',
        description: 'Totaal score × frequentie',
        aggregation: { field: 'x_action_sheet_pain_points.score', function: 'sum', group_by: 'x_user_painpoints.name' }
      }
    ],
    
    validate: Object.freeze((query) => {
      if (!query.aggregation) {
        return {
          valid: false,
          code: 'PAIN_POINTS_REQUIRE_AGGREGATION',
          message: 'Pijnpunten kunnen niet zonder aggregatie getoond worden',
          explanation: 'Pijnpunten bestaan alleen met een score in context van actiebladen',
          suggestions: [
            'Groepeer per pijnpunt (meest voorkomend)',
            'Gemiddelde ernst per pijnpunt',
            'Totale impact per pijnpunt'
          ]
        };
      }
      
      if (!query.fields || !query.fields.includes('x_action_sheet_pain_points.score')) {
        return {
          valid: false,
          code: 'PAIN_POINTS_REQUIRE_SCORE',
          message: 'Score is verplicht veld voor pijnpunten',
          explanation: 'Score (0-5) is kerngegevens van pijnpunt-analyse'
        };
      }
      
      return { valid: true };
    })
  },

  /**
   * 1.2 Meeting-Evolutie (Temporele Layer)
   */
  meeting_evolution: {
    id: 'meeting_evolution',
    label: 'Meeting-Evolutie',
    description: 'Hoe ontwikkelt klantcontact zich?',
    icon: 'calendar',
    type: 'temporal',
    
    // LOCKED
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_as_meetings.x_date'],
    incompatible_with: ['stage_distribution', 'tag_clustering'],
    execution_hint: 'multi_pass',
    
    relations: {
      path: [
        {
          relation_field: 'x_as_meetings',
          target_model: 'x_as_meetings'
        }
      ],
      fields: ['x_date', 'x_meeting_type']
    },
    
    sub_options: [
      {
        id: 'frequency',
        label: 'Frequentie',
        description: 'Aantal meetings per tijdsperiode',
        aggregation: { field: 'id', function: 'count', temporal: true }
      },
      {
        id: 'timing',
        label: 'Timing',
        description: 'Eerste vs laatste contact',
        aggregation: [
          { field: 'x_date', function: 'min' },
          { field: 'x_date', function: 'max' }
        ]
      },
      {
        id: 'before_after_conversion',
        label: 'Voor/na conversie',
        description: 'Causale vergelijking',
        comparison: { split_on: 'x_converted_date' }
      },
      {
        id: 'type_distribution',
        label: 'Type-verdeling',
        description: 'Intake, pitch, follow-up',
        aggregation: { field: 'id', function: 'count', group_by: 'x_meeting_type' }
      }
    ],
    
    validate: Object.freeze((query) => {
      if (!query.fields || !query.fields.includes('x_as_meetings.x_date')) {
        return {
          valid: false,
          code: 'MEETINGS_REQUIRE_DATE',
          message: 'Meeting-analyse vereist datum-informatie',
          explanation: 'Meetings zijn temporele gebeurtenissen. Zonder tijd is er geen context.'
        };
      }
      
      return { valid: true };
    })
  },

  /**
   * 1.3 Fase-Verdeling (Categorische Layer)
   */
  stage_distribution: {
    id: 'stage_distribution',
    label: 'Fase-Verdeling',
    description: 'Waar zitten deals in het proces?',
    icon: 'layers',
    type: 'categorical',
    
    // LOCKED
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_support_stage.name', 'x_support_stage.sequence'],
    incompatible_with: ['meeting_evolution', 'trend_analysis'],
    execution_hint: 'read_group',
    
    relations: {
      path: [
        {
          relation_field: 'x_support_stage',
          target_model: 'x_support_stage'
        }
      ],
      fields: ['name', 'sequence', 'fold']
    },
    
    sub_options: [
      {
        id: 'distribution_per_stage',
        label: 'Verdeling per fase',
        description: 'Aantal actiebladen per fase',
        aggregation: { field: 'id', function: 'count', group_by: 'x_support_stage.name', order_by: 'x_support_stage.sequence' }
      },
      {
        id: 'conversion_rate',
        label: 'Conversie-percentage',
        description: 'Won vs total',
        aggregation: { field: 'id', function: 'conversion_rate' }
      },
      {
        id: 'drop_off',
        label: 'Drop-off punten',
        description: 'Waar vallen deals uit',
        aggregation: { field: 'id', function: 'sequential_drop_off' }
      }
    ],
    
    validate: Object.freeze((query) => {
      if (query.temporal_filters) {
        return {
          valid: false,
          code: 'CATEGORICAL_NO_TEMPORAL',
          message: 'Fase-verdeling is categorisch, geen temporele filters',
          explanation: 'Stages zijn statusssen, geen tijdsreeks'
        };
      }
      
      return { valid: true };
    })
  },

  /**
   * 1.4 Gebouw & VME Context (Indirecte Layer)
   */
  building_context: {
    id: 'building_context',
    label: 'Gebouw & VME Context',
    description: 'Welk type vastgoed behandelen we?',
    icon: 'building',
    type: 'indirect',
    
    // LOCKED
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['res.partner.name'],
    incompatible_with: [],
    execution_hint: 'read_group', // Basic sub-layer
    
    relations: {
      path: [
        {
          relation_field: 'x_studio_for_company_id',
          target_model: 'res.partner'
        }
      ],
      fields: ['name', 'customer_type']
    },
    
    sub_options: [
      {
        id: 'basic',
        label: 'Basis (snel)',
        description: 'Type & locatie via res.partner',
        execution_hint: 'read_group',
        relations: {
          path: [{ relation_field: 'x_studio_for_company_id', target_model: 'res.partner' }],
          fields: ['name', 'customer_type']
        }
      },
      {
        id: 'technical',
        label: 'Technisch (langzaam)',
        description: 'm², units via estate stats',
        execution_hint: 'multi_pass',
        performance_warning: {
          message: 'Deze analyse vereist extra verwerkingstijd (2-3 seconden)',
          explanation: 'Technische gebouwdata zijn niet direct gekoppeld aan actiebladen',
          estimated_duration: '2-3s'
        },
        relations: {
          path: [
            { relation_field: 'x_studio_for_company_id', target_model: 'res.partner' },
            { relation_field: 'x_estate_stats', target_model: 'x_estate_stats' }
          ],
          fields: ['total_area', 'num_units', 'construction_year']
        }
      }
    ],
    
    validate: Object.freeze((query) => {
      return { valid: true };
    })
  },

  /**
   * 1.5 Salesuitkomst (Resultaat Layer)
   */
  sales_outcome: {
    id: 'sales_outcome',
    label: 'Salesuitkomst',
    description: 'Wat zijn de resultaten?',
    icon: 'target',
    type: 'result',
    
    // LOCKED
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_support_stage.x_stage_type'],
    incompatible_with: [],
    execution_hint: 'read_group',
    
    relations: {
      path: [
        {
          relation_field: 'x_support_stage',
          target_model: 'x_support_stage'
        }
      ],
      fields: ['x_stage_type', 'name']
    },
    
    sub_options: [
      {
        id: 'status_distribution',
        label: 'Status-verdeling',
        description: 'Hoeveel per status (won/lost/active)',
        aggregation: { field: 'id', function: 'count', group_by: 'x_support_stage.x_stage_type' }
      },
      {
        id: 'win_loss_analysis',
        label: 'Win/loss analyse',
        description: 'Redenen voor winst/verlies',
        fields: ['x_won_reason', 'x_lost_reason']
      },
      {
        id: 'conversion_stats',
        label: 'Conversie-statistiek',
        description: 'Met/zonder lead',
        comparison: { split_on: { field: 'lead_id', operator: 'exists' } }
      }
    ],
    
    validate: Object.freeze((query) => {
      return { valid: true };
    })
  },

  /**
   * 1.6 Basisinformatie (Overzicht Layer)
   */
  basic_info: {
    id: 'basic_info',
    label: 'Basisinformatie',
    description: 'Toon actiebladen met kerngegevens',
    icon: 'list',
    type: 'overview',
    
    // LOCKED
    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['name', 'create_date'],
    incompatible_with: [],
    execution_hint: 'search_read',
    
    relations: {
      path: [],
      fields: ['name', 'create_date', 'x_studio_for_company_id', 'x_support_stage']
    },
    
    sub_options: [
      {
        id: 'list',
        label: 'Lijst',
        description: 'Simpele overzicht zonder aggregatie'
      },
      {
        id: 'count_total',
        label: 'Totaal aantal',
        description: 'COUNT totaal',
        aggregation: { field: 'id', function: 'count' }
      },
      {
        id: 'trend_over_time',
        label: 'Trend over tijd',
        description: 'Evolutie per maand/kwartaal',
        aggregation: { field: 'id', function: 'count', group_by: 'create_date:month' }
      }
    ],
    
    validate: Object.freeze((query) => {
      return { valid: true };
    })
  }
});

/**
 * Get semantic layer by ID
 */
export function getSemanticLayer(layerId) {
  return SEMANTIC_LAYERS[layerId];
}

/**
 * Get all semantic layers as array
 */
export function getAllSemanticLayers() {
  return Object.values(SEMANTIC_LAYERS);
}

/**
 * Check if two layers are compatible
 */
export function areLayersCompatible(layer1Id, layer2Id) {
  const layer1 = SEMANTIC_LAYERS[layer1Id];
  if (!layer1) return false;
  
  return !layer1.incompatible_with.includes(layer2Id);
}
