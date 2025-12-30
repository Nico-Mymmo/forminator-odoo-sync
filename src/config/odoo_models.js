/**
 * Odoo Model Configurations
 * 
 * Defines available models and their common search/create/update patterns
 */

export const ODOO_MODELS = {
  'res.partner': {
    name: 'Contact / Bedrijf',
    description: 'Contactpersoon of bedrijf',
    icon: '👤',
    searchTemplates: [
      {
        name: 'Opzoeken op email',
        description: 'Zoek contact op basis van emailadres',
        fields: {
          email: { type: 'field', label: 'Email veld', required: true }
        },
        filters: [
          {
            name: 'type',
            label: 'Type',
            type: 'radio',
            options: [
              { value: 'both', label: 'Contacten en bedrijven', conditions: [] },
              { value: 'contact', label: 'Alleen contacten', conditions: [['is_company', '=', false]] },
              { value: 'company', label: 'Alleen bedrijven', conditions: [['is_company', '=', true]] }
            ],
            default: 'contact'
          }
        ],
        buildDomain: (values) => {
          const domain = [['email', '=', '${field.' + values.email + '}']];
          if (values.type === 'contact') domain.push(['is_company', '=', false]);
          if (values.type === 'company') domain.push(['is_company', '=', true]);
          return domain;
        },
        defaultFields: ['id', 'name', 'email', 'parent_id', 'is_company']
      },
      {
        name: 'Opzoeken op ID',
        description: 'Zoek contact op basis van ID (bijv. uit vorige stap)',
        fields: {
          contactId: { type: 'field', label: 'Contact ID', required: true }
        },
        buildDomain: (values) => {
          return [['id', '=', '${' + values.contactId + '}']];
        },
        defaultFields: ['id', 'name', 'email', 'is_company']
      }
    ],
    createTemplates: [
      {
        name: 'Nieuw contact aanmaken',
        description: 'Maak een nieuwe contactpersoon aan',
        fields: {
          name: { type: 'text', label: 'Naam', placeholder: '${first_name} ${last_name}', required: true },
          email: { type: 'field', label: 'Email', required: true },
          phone: { type: 'field', label: 'Telefoon', required: false },
          mobile: { type: 'field', label: 'GSM', required: false },
          street: { type: 'text', label: 'Straat + nummer', placeholder: '${field.street} ${field.number}', required: false },
          zip: { type: 'field', label: 'Postcode', required: false },
          city: { type: 'field', label: 'Stad', required: false },
          country_id: { type: 'integer', label: 'Land ID', default: 20, help: '20 = België' },
          is_company: { type: 'boolean', label: 'Is bedrijf?', default: false }
        }
      }
    ],
    updateTemplates: [
      {
        name: 'Contact updaten',
        description: 'Bestaande contactgegevens bijwerken',
        fields: {
          name: { type: 'text', label: 'Naam', required: false },
          email: { type: 'field', label: 'Email', required: false },
          phone: { type: 'field', label: 'Telefoon', required: false },
          parent_id: { type: 'reference', label: 'Bedrijf (parent_id)', help: 'Bijv. $company.id', required: false }
        }
      }
    ]
  },
  
  'crm.lead': {
    name: 'Lead / Opportunity',
    description: 'Verkoopkans of lead',
    icon: '🎯',
    searchTemplates: [
      {
        name: 'Opzoeken op contact',
        description: 'Zoek lead gekoppeld aan contact',
        fields: {
          partnerId: { type: 'reference', label: 'Contact ID', placeholder: '$contact.id', required: true }
        },
        filters: [
          {
            name: 'type',
            label: 'Type',
            type: 'radio',
            options: [
              { value: 'both', label: 'Leads en opportunities', conditions: [] },
              { value: 'lead', label: 'Alleen leads', conditions: [['type', '=', 'lead']] },
              { value: 'opportunity', label: 'Alleen opportunities', conditions: [['type', '=', 'opportunity']] }
            ],
            default: 'both'
          }
        ],
        buildDomain: (values) => {
          const domain = [['partner_id', '=', '${' + values.partnerId + '}']];
          if (values.type === 'lead') domain.push(['type', '=', 'lead']);
          if (values.type === 'opportunity') domain.push(['type', '=', 'opportunity']);
          return domain;
        },
        defaultFields: ['id', 'name', 'partner_id', 'type']
      }
    ],
    createTemplates: [
      {
        name: 'Nieuwe lead aanmaken',
        description: 'Maak een nieuwe lead of opportunity aan',
        fields: {
          name: { type: 'text', label: 'Onderwerp', placeholder: 'Lead voor ${full_name}', required: true },
          partner_id: { type: 'reference', label: 'Contact ID', placeholder: '$contact.id', required: true },
          email_from: { type: 'field', label: 'Email', required: false },
          phone: { type: 'field', label: 'Telefoon', required: false },
          description: { type: 'textarea', label: 'Omschrijving', placeholder: '__html_card__ of handmatige tekst', required: false },
          type: { type: 'select', label: 'Type', options: [{ value: 'lead', label: 'Lead' }, { value: 'opportunity', label: 'Opportunity' }], default: 'opportunity' },
          priority: { type: 'select', label: 'Prioriteit', options: [{ value: '1', label: 'Laag' }, { value: '2', label: 'Normaal' }, { value: '3', label: 'Hoog' }], default: '2' }
        }
      }
    ],
    updateTemplates: [
      {
        name: 'Lead updaten',
        description: 'Bestaande lead bijwerken',
        fields: {
          description: { type: 'textarea', label: 'Omschrijving', required: false },
          priority: { type: 'select', label: 'Prioriteit', options: [{ value: '1', label: 'Laag' }, { value: '2', label: 'Normaal' }, { value: '3', label: 'Hoog' }], required: false }
        }
      }
    ]
  },
  
  'x_web_visitor': {
    name: 'Web Visitor',
    description: 'Website bezoeker tracking',
    icon: '🌐',
    searchTemplates: [
      {
        name: 'Opzoeken op UUID',
        description: 'Zoek visitor op basis van UUID',
        fields: {
          uuid: { type: 'field', label: 'UUID veld', required: true }
        },
        buildDomain: (values) => {
          return [['x_studio_uuid', '=', '${field.' + values.uuid + '}']];
        },
        defaultFields: ['id', 'x_studio_uuid', 'x_studio_email']
      }
    ],
    createTemplates: [
      {
        name: 'Nieuwe visitor',
        description: 'Nieuwe visitor aanmaken (meestal leeg)',
        fields: {}
      }
    ],
    updateTemplates: [
      {
        name: 'Visitor updaten',
        description: 'Visitor gegevens bijwerken',
        fields: {
          x_studio_email: { type: 'field', label: 'Email', required: false }
        }
      }
    ]
  }
};

/**
 * Get model configuration by name
 */
export function getModelConfig(modelName) {
  return ODOO_MODELS[modelName] || null;
}

/**
 * Get all available models
 */
export function getAllModels() {
  return Object.entries(ODOO_MODELS).map(([key, config]) => ({
    value: key,
    label: config.name,
    icon: config.icon,
    description: config.description
  }));
}
