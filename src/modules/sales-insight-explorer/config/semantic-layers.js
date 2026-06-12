/**
 * Semantic Layers Configuration
 *
 * Definitie van alle semantic layers.
 *
 * Veldnamen zijn geverifieerd tegen live Odoo (juni 2026).
 * Vorige versie had meerdere verkeerde veldnamen (x_date, name, sequence, x_stage_type…)
 * die hier allemaal zijn gecorrigeerd.
 *
 * LOCKED PROPERTIES (niet configureerbaar via admin UI):
 * - base_model, mandatory_fields, incompatible_with, execution_hint, validate
 *
 * CONFIGURABLE PROPERTIES (via admin UI):
 * - label, description, icon, tooltips, help_text
 *
 * @module config/semantic-layers
 */

/**
 * @typedef {Object} SemanticLayer
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} icon
 * @property {'metric'|'temporal'|'categorical'|'indirect'|'result'|'overview'} type
 * @property {string} base_model
 * @property {Array<string>} mandatory_fields
 * @property {Array<string>} incompatible_with
 * @property {'read_group'|'multi_pass'|'search_read'} execution_hint
 * @property {Function} validate
 */

export const SEMANTIC_LAYERS = Object.freeze({

  /**
   * 1.1 Pijnpunten & Obstakels (Metric Layer)
   *
   * Correcties t.o.v. vorige versie:
   * - relation_field: 'x_studio_action_sheet_pain_points_scores' (was 'x_action_sheet_pain_points')
   * - pain_point relation: 'x_studio_pain_point_id' (was 'x_user_painpoints')
   * - score field: 'x_studio_score' (was 'score')
   * - name field: 'x_name' (was 'name')
   */
  pain_points: {
    id: 'pain_points',
    label: 'Pijnpunten & Obstakels',
    description: 'Welke obstakels ervaren klanten?',
    icon: 'alert-triangle',
    type: 'metric',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_studio_action_sheet_pain_points_scores.x_studio_score'],
    incompatible_with: ['stage_distribution'],
    execution_hint: 'read_group',

    relations: {
      path: [
        {
          relation_field: 'x_studio_action_sheet_pain_points_scores',
          target_model: 'x_action_sheet_pain_po'
        },
        {
          relation_field: 'x_studio_pain_point_id',
          target_model: 'x_user_painpoints'
        }
      ],
      // Lean: alleen naam + score — geen html-velden
      fields: ['x_name', 'x_studio_score']
    },

    sub_options: [
      {
        id: 'most_common',
        label: 'Meest voorkomend',
        description: 'Aantal actiebladen per pijnpunt',
        aggregation: { field: 'id', function: 'count', group_by: 'x_studio_pain_point_id.x_name' }
      },
      {
        id: 'most_severe',
        label: 'Meest ernstig',
        description: 'Gemiddelde score per pijnpunt',
        aggregation: { field: 'x_studio_score', function: 'avg', group_by: 'x_studio_pain_point_id.x_name' }
      },
      {
        id: 'biggest_impact',
        label: 'Grootste impact',
        description: 'Totaal score × frequentie',
        aggregation: { field: 'x_studio_score', function: 'sum', group_by: 'x_studio_pain_point_id.x_name' }
      }
    ],

    validate: Object.freeze((query) => {
      if (!query.aggregation) {
        return {
          valid: false,
          code: 'PAIN_POINTS_REQUIRE_AGGREGATION',
          message: 'Pijnpunten kunnen niet zonder aggregatie getoond worden',
          suggestions: ['Groepeer per pijnpunt (meest voorkomend)', 'Gemiddelde ernst', 'Totale impact']
        };
      }
      if (!query.fields || !query.fields.includes('x_studio_action_sheet_pain_points_scores.x_studio_score')) {
        return {
          valid: false,
          code: 'PAIN_POINTS_REQUIRE_SCORE',
          message: 'Score (x_studio_score) is verplicht veld voor pijnpunten'
        };
      }
      return { valid: true };
    })
  },

  /**
   * 1.2 Meeting-Evolutie (Temporele Layer)
   *
   * Correcties t.o.v. vorige versie:
   * - relation_field: 'x_studio_linked_as_meetings_ids' (was 'x_as_meetings')
   * - date field: 'x_studio_date' (was 'x_date')
   * - meeting_type field: 'x_studio_meeting_type' (was 'x_meeting_type')
   * - Lean: x_studio_duration en x_studio_stage_id toegevoegd
   */
  meeting_evolution: {
    id: 'meeting_evolution',
    label: 'Meeting-Evolutie',
    description: 'Hoe ontwikkelt klantcontact zich?',
    icon: 'calendar',
    type: 'temporal',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_studio_linked_as_meetings_ids.x_studio_date'],
    incompatible_with: ['stage_distribution', 'tag_clustering'],
    execution_hint: 'multi_pass',

    relations: {
      path: [
        {
          relation_field: 'x_studio_linked_as_meetings_ids',
          target_model: 'x_as_meetings'
        }
      ],
      // Lean: datum + type + duur + fase — geen html-notities
      fields: ['x_studio_date', 'x_studio_meeting_type', 'x_studio_duration', 'x_studio_stage_id', 'x_studio_user_id']
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
          { field: 'x_studio_date', function: 'min' },
          { field: 'x_studio_date', function: 'max' }
        ]
      },
      {
        id: 'before_after_conversion',
        label: 'Voor/na conversie',
        description: 'Causale vergelijking',
        comparison: { split_on: 'x_studio_converted_date' }
      },
      {
        id: 'type_distribution',
        label: 'Type-verdeling',
        description: 'Discovery Call, Demo, Opstartsessie…',
        aggregation: { field: 'id', function: 'count', group_by: 'x_studio_meeting_type' }
      }
    ],

    validate: Object.freeze((query) => {
      if (!query.fields || !query.fields.includes('x_studio_linked_as_meetings_ids.x_studio_date')) {
        return {
          valid: false,
          code: 'MEETINGS_REQUIRE_DATE',
          message: 'Meeting-analyse vereist datum-informatie (x_studio_date)'
        };
      }
      return { valid: true };
    })
  },

  /**
   * 1.3 Fase-Verdeling (Categorische Layer)
   *
   * Correcties t.o.v. vorige versie:
   * - relation_field: 'x_studio_stage_id' (was 'x_support_stage')
   * - name field: 'x_name' (was 'name')
   * - sequence field: 'x_studio_sequence' (was 'sequence')
   * - fold field: 'x_studio_fold' (was 'fold')
   * - Verwijderd: x_stage_type — bestaat NIET op x_support_stage
   *
   * Echte fasen (live): Discovery(1) → opstartgesprek(5) → Opstartsessie Expert(7)
   *   → Basisinstellingen gecontroleerd(8) → Follow-up validatie(9) → Done(10)
   */
  stage_distribution: {
    id: 'stage_distribution',
    label: 'Fase-Verdeling',
    description: 'Waar zitten actiebladen in het proces?',
    icon: 'layers',
    type: 'categorical',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_studio_stage_id.x_name', 'x_studio_stage_id.x_studio_sequence'],
    incompatible_with: ['meeting_evolution'],
    execution_hint: 'read_group',

    relations: {
      path: [
        {
          relation_field: 'x_studio_stage_id',
          target_model: 'x_support_stage'
        }
      ],
      // Lean: naam + volgorde + fold-status
      fields: ['x_name', 'x_studio_sequence', 'x_studio_fold']
    },

    sub_options: [
      {
        id: 'distribution_per_stage',
        label: 'Verdeling per fase',
        description: 'Aantal actiebladen per fase',
        aggregation: {
          field: 'id',
          function: 'count',
          group_by: 'x_studio_stage_id.x_name',
          order_by: 'x_studio_stage_id.x_studio_sequence'
        }
      },
      {
        id: 'drop_off',
        label: 'Drop-off punten',
        description: 'Waar stokt de progressie',
        aggregation: { field: 'id', function: 'sequential_drop_off' }
      },
      {
        id: 'done_vs_active',
        label: 'Done vs actief',
        description: 'Afgerond (Done) vs in behandeling',
        // Stage "Done" heeft id=10
        aggregation: { field: 'id', function: 'count', group_by: 'x_studio_stage_id.x_name' }
      }
    ],

    validate: Object.freeze((query) => {
      return { valid: true };
    })
  },

  /**
   * 1.4 Gebouw & VME Context (Indirecte Layer)
   *
   * Correcties t.o.v. vorige versie:
   * - technical sub_option: total_area/num_units/construction_year bestaan NIET op x_estate_stats
   *   → vervangen door x_studio_total_active_owners, x_studio_total_documents, x_studio_total_invited_owners
   * - relation_field voor estate stats: 'x_studio_as_estate_stats_id' (was 'x_estate_stats')
   */
  building_context: {
    id: 'building_context',
    label: 'Gebouw & VME Context',
    description: 'Welk type vastgoed behandelen we?',
    icon: 'building',
    type: 'indirect',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_studio_for_company_id.name'],
    incompatible_with: [],
    execution_hint: 'read_group',

    relations: {
      path: [
        {
          relation_field: 'x_studio_for_company_id',
          target_model: 'res.partner'
        }
      ],
      // Lean: naam partner — de eigenlijke gebouwcijfers zitten op het actieblad zelf
      fields: ['name']
    },

    sub_options: [
      {
        id: 'basic',
        label: 'Partner (snel)',
        description: 'Naam gebouw/VME via res.partner',
        execution_hint: 'read_group',
        relations: {
          path: [{ relation_field: 'x_studio_for_company_id', target_model: 'res.partner' }],
          fields: ['name']
        }
      },
      {
        id: 'action_sheet_counts',
        label: 'Gebouwprofiel (actieblad)',
        description: 'Kavels, bewoners, HOA-status — direct op actieblad',
        execution_hint: 'search_read',
        // Deze velden zitten op x_sales_action_sheet zelf, niet op een submodel
        fields_on_base: [
          'x_studio_number_of_plots',
          'x_studio_number_of_apartments',
          'x_studio_number_of_co_owners',
          'x_studio_hoa_established',
          'x_studio_has_commercial_plots'
        ]
      },
      {
        id: 'estate_stats',
        label: 'Estate Stats (platform)',
        description: 'Actieve gebruikers, documenten via x_estate_stats',
        execution_hint: 'multi_pass',
        performance_warning: {
          message: 'Vereist extra verwerking (2-3 seconden)',
          estimated_duration: '2-3s'
        },
        relations: {
          path: [
            { relation_field: 'x_studio_as_estate_stats_id', target_model: 'x_estate_stats' }
          ],
          // Lean: alleen platform-statistieken — geen html of relaties
          fields: ['x_name', 'x_studio_total_active_owners', 'x_studio_total_documents', 'x_studio_total_invited_owners']
        }
      }
    ],

    validate: Object.freeze((query) => {
      return { valid: true };
    })
  },

  /**
   * 1.5 Salesuitkomst (Resultaat Layer)
   *
   * Correcties t.o.v. vorige versie:
   * - x_support_stage.x_stage_type bestaat NIET → verwijderd
   * - Fase-verdeling gebruikt nu x_studio_stage_id.x_name
   * - "Done" = stage_id = 10
   * - Won/lost bestaat niet in dit model (wel in crm.lead via lead enrichment)
   */
  sales_outcome: {
    id: 'sales_outcome',
    label: 'Salesuitkomst',
    description: 'Resultaten en afronding van actiebladen',
    icon: 'target',
    type: 'result',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_studio_stage_id.x_name'],
    incompatible_with: [],
    execution_hint: 'read_group',

    relations: {
      path: [
        {
          relation_field: 'x_studio_stage_id',
          target_model: 'x_support_stage'
        }
      ],
      fields: ['x_name', 'x_studio_sequence']
    },

    sub_options: [
      {
        id: 'status_distribution',
        label: 'Fase-verdeling',
        description: 'Hoeveel actiebladen per fase',
        aggregation: { field: 'id', function: 'count', group_by: 'x_studio_stage_id.x_name' }
      },
      {
        id: 'done_rate',
        label: 'Done-rate',
        description: 'Aandeel afgeronde actiebladen (fase "Done", id=10)',
        // filter: x_studio_stage_id = 10
        aggregation: { field: 'id', function: 'count', filter_field: 'x_studio_stage_id', filter_value: 10 }
      },
      {
        id: 'with_lead',
        label: 'Actiebladen met lead',
        description: 'Gekoppeld aan crm.lead via x_studio_as_opportunity_ids',
        // Via lead enrichment (twee-fase)
        requires_lead_enrichment: true
      }
    ],

    validate: Object.freeze((query) => {
      return { valid: true };
    })
  },

  /**
   * 1.6 Basisinformatie (Overzicht Layer)
   *
   * Correcties t.o.v. vorige versie:
   * - fields: x_studio_stage_id (was 'x_support_stage'), x_studio_for_company_id, x_studio_user_id
   * - x_name (niet 'name') als omschrijving-veld
   */
  basic_info: {
    id: 'basic_info',
    label: 'Basisinformatie',
    description: 'Toon actiebladen met kerngegevens',
    icon: 'list',
    type: 'overview',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['x_name', 'create_date'],
    incompatible_with: [],
    execution_hint: 'search_read',

    relations: {
      path: [],
      // Lean basisset — geen html-velden
      fields: ['id', 'x_name', 'create_date', 'x_studio_stage_id', 'x_studio_for_company_id', 'x_studio_user_id', 'x_active']
    },

    sub_options: [
      {
        id: 'list',
        label: 'Lijst',
        description: 'Overzicht zonder aggregatie'
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
  },

  /**
   * 1.7 Chatter Berichten (Indirecte Layer) — NIEUW
   *
   * Haalt conversatiegeschiedenis op via mail.message.
   * Lean velden: date, author_id, message_type, preview (geen body-html).
   * Filter: alleen 'comment' en 'email' — geen systeem-notificaties.
   *
   * Uitvoering: twee-fase (haal actieblad-IDs op, dan batch mail.message)
   */
  chatter_messages: {
    id: 'chatter_messages',
    label: 'Chatter Berichten',
    description: 'Conversatiegeschiedenis van actiebladen',
    icon: 'message-square',
    type: 'indirect',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['message_ids'],
    incompatible_with: [],
    execution_hint: 'multi_pass',

    relations: {
      path: [
        {
          relation_field: 'message_ids',
          target_model: 'mail.message'
        }
      ],
      // Lean: preview i.p.v. body (geen html) — author als [id, name] tuple
      fields: ['date', 'author_id', 'message_type', 'preview'],
      // Interne filter: geen systeem-notificaties
      domain_on_target: [['message_type', 'in', ['comment', 'email']]]
    },

    sub_options: [
      {
        id: 'recent_messages',
        label: 'Recente berichten',
        description: 'Laatste N berichten per actieblad (lean)',
        limit_per_record: 5,
        order: 'date desc'
      },
      {
        id: 'message_count',
        label: 'Berichtenvolume',
        description: 'Aantal berichten per actieblad',
        aggregation: { field: 'id', function: 'count', group_by: 'res_id' }
      },
      {
        id: 'last_contact_date',
        label: 'Laatste contact',
        description: 'Datum van meest recente bericht',
        aggregation: { field: 'date', function: 'max', group_by: 'res_id' }
      }
    ],

    validate: Object.freeze((query) => {
      return { valid: true };
    })
  },

  /**
   * 1.8 Activiteiten (Indirecte Layer) — NIEUW
   *
   * Open en afgeronde activiteiten (Call, To-Do, Email…) via mail.activity.
   * Lean velden: type, deadline, samenvatting, staat, verantwoordelijke.
   * Geen note-html in standaard output.
   *
   * Relevante activiteitstypen voor actiebladen:
   *   Call(2), To-Do(4), Email(1), Calendly Ondersteuning(16)
   */
  activities: {
    id: 'activities',
    label: 'Activiteiten',
    description: 'Open en geplande activiteiten per actieblad',
    icon: 'check-square',
    type: 'indirect',

    base_model: 'x_sales_action_sheet',
    mandatory_fields: ['activity_ids'],
    incompatible_with: [],
    execution_hint: 'multi_pass',

    relations: {
      path: [
        {
          relation_field: 'activity_ids',
          target_model: 'mail.activity'
        }
      ],
      // Lean: geen note-html tenzij expliciet aangevraagd
      fields: ['activity_type_id', 'date_deadline', 'summary', 'state', 'user_id'],
      domain_on_target: []  // Geen filter: zowel open als overdue meenemen
    },

    sub_options: [
      {
        id: 'open_activities',
        label: 'Open activiteiten',
        description: 'Alles behalve "done"',
        domain_on_target: [['state', 'in', ['today', 'planned', 'overdue']]]
      },
      {
        id: 'overdue_activities',
        label: 'Vervallen activiteiten',
        description: 'Deadline verstreken — opvolging nodig',
        domain_on_target: [['state', '=', 'overdue']]
      },
      {
        id: 'activity_distribution',
        label: 'Activiteitstype-verdeling',
        description: 'Hoeveel Call vs To-Do vs Email…',
        aggregation: { field: 'id', function: 'count', group_by: 'activity_type_id.name' }
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
