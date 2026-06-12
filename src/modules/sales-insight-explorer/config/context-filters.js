/**
 * Context Filters Configuration
 *
 * Definitie van Laag 2: Context & Filtering
 *
 * Correcties t.o.v. vorige versie (geverifieerd juni 2026):
 * - building_size: total_area bestaat NIET op x_estate_stats →
 *   vervangen door plot/appartement-count direct op actieblad
 * - stage_type: x_support_stage.x_stage_type bestaat NIET →
 *   vervangen door echte fase-IDs (live opgehaald: 1,5,7,8,9,10)
 * - owner: veldnaam x_studio_user_id (niet 'owner_id')
 *
 * @module config/context-filters
 */

export const CONTEXT_FILTERS = Object.freeze({

  /**
   * 2.1 Gebouwgrootte
   *
   * Let op: x_estate_stats heeft GEEN total_area veld.
   * Filter werkt op x_studio_number_of_plots direct op het actieblad.
   */
  building_size: {
    id: 'building_size',
    label: 'Gebouwgrootte (kavels)',
    type: 'checkboxes',
    field: 'x_studio_number_of_plots',  // Correct veld op actieblad
    requires_multi_pass: false,          // Direct veld, geen submodel nodig

    options: [
      {
        id: 'small',
        label: 'Klein (< 10 kavels)',
        filter: { operator: '<', value: 10 }
      },
      {
        id: 'medium',
        label: 'Middel (10–30 kavels)',
        filter: { operator: 'between', value: [10, 30] }
      },
      {
        id: 'large',
        label: 'Groot (> 30 kavels)',
        filter: { operator: '>', value: 30 }
      },
      {
        id: 'unknown',
        label: 'Onbekend',
        filter: { operator: 'is not set' }
      }
    ]
  },

  /**
   * 2.2 Procesfase
   *
   * Veld: x_studio_stage_id (many2one → x_support_stage)
   * x_support_stage heeft GEEN x_stage_type veld.
   * Gebruik echte stage-IDs (live opgehaald, juni 2026):
   *   1 = Discovery, 5 = opstartgesprek, 7 = Opstartsessie Expert,
   *   8 = Basisinstellingen gecontroleerd, 9 = Follow-up validatie, 10 = Done
   */
  stage_type: {
    id: 'stage_type',
    label: 'Procesfase',
    type: 'radio',
    field: 'x_studio_stage_id',

    options: [
      {
        id: 'all',
        label: 'Alle fasen',
        filter: null
      },
      {
        id: 'active',
        label: 'Actief (nog niet Done)',
        filter: { operator: 'not in', value: [10] }  // Niet "Done"
      },
      {
        id: 'done',
        label: 'Afgerond (Done)',
        filter: { operator: '=', value: 10 }
      },
      {
        id: 'discovery',
        label: 'Discovery',
        filter: { operator: '=', value: 1 }
      }
    ]
  },

  /**
   * 2.3 Tijdsperiode
   * Op create_date van het actieblad
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
   * 2.4 Eigenaar (Sales Verantwoordelijke)
   *
   * Correctie: veldnaam is x_studio_user_id (niet 'owner_id')
   */
  owner: {
    id: 'owner',
    label: 'Sales Verantwoordelijke',
    type: 'radio',
    field: 'x_studio_user_id',

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
   *
   * Correctie: directe many2many via x_studio_as_opportunity_ids (niet 'lead_id')
   * x_sales_action_sheet heeft een directe many2many naar crm.lead.
   */
  lead_status: {
    id: 'lead_status',
    label: 'Lead-status',
    type: 'radio',
    field: 'x_studio_as_opportunity_ids',

    options: [
      {
        id: 'all',
        label: 'Alle',
        filter: null
      },
      {
        id: 'with_lead',
        label: 'Met gekoppelde lead',
        filter: { operator: 'is set' }
      },
      {
        id: 'without_lead',
        label: 'Zonder lead',
        filter: { operator: 'is not set' }
      }
    ]
  },

  /**
   * 2.6 Tags
   * Veld: x_studio_tag_ids (many2many → x_sales_action_sheet_tag)
   */
  tags: {
    id: 'tags',
    label: 'Labels',
    type: 'checkboxes',
    field: 'x_studio_tag_ids',
    dynamic_options: true,  // Geladen vanuit Odoo bij opstarten
    options: []             // Wordt runtime gevuld
  },

  /**
   * 2.7 Ingestroomd via (Entrypoint) — NIEUW
   * Selectieveld op actieblad zelf.
   */
  entrypoint: {
    id: 'entrypoint',
    label: 'Ingestroomd via',
    type: 'checkboxes',
    field: 'x_studio_entrypoint',
    dynamic_options: true,  // Selection-opties uit Odoo schema laden
    options: []
  },

  /**
   * 2.8 Activiteitsstatus — NIEUW
   * Filter op aanwezigheid van open activiteiten (activity_state).
   */
  activity_status: {
    id: 'activity_status',
    label: 'Activiteitsstatus',
    type: 'radio',
    field: 'activity_state',

    options: [
      {
        id: 'all',
        label: 'Alle',
        filter: null
      },
      {
        id: 'overdue',
        label: 'Vervallen activiteit',
        filter: { operator: '=', value: 'overdue' }
      },
      {
        id: 'today',
        label: 'Activiteit vandaag',
        filter: { operator: '=', value: 'today' }
      },
      {
        id: 'planned',
        label: 'Activiteit gepland',
        filter: { operator: '=', value: 'planned' }
      },
      {
        id: 'no_activity',
        label: 'Geen activiteit',
        filter: { operator: 'is not set' }
      }
    ]
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
    lead_status: 'all',
    activity_status: 'all'
  };
}
