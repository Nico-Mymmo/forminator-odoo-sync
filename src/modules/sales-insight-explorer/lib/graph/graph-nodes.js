/**
 * Graaf-nodes — welke modellen bestaan, en hoe ze zich gedragen
 *
 * Dit bestand is samen met graph-edges.js de ENIGE source of truth voor het
 * querysysteem van Sales Insight Explorer. De wizard (public/semantic-wizard.js)
 * haalt deze declaraties op via GET /insights/api/sales-insights/graph en tekent
 * daar de spiderweb mee; cascade-executor.js voert er queries mee uit. Er is dus
 * geen client-side kopie meer die uit sync kan lopen met wat de server kan.
 *
 * Een node is NIET hetzelfde als een Odoo-model: hetzelfde model kan meerdere
 * rollen hebben. res.partner is in deze instance zowel "Gebouw / VME" (een
 * company) als "Contactpersoon" (een individu onder die company). Dat zijn twee
 * nodes met hetzelfde `model` en een verschillend `baseDomain`, zodat een pad
 * lead -> gebouw -> contactpersonen mogelijk is zonder dat de gebruiker ergens
 * een is_company-filter moet begrijpen.
 *
 * Node-keys volgen de conventie `<odoo-model>` of `<odoo-model>:<rol>`. Dat is
 * bewust: voor elk model zonder rol-splitsing is de node-key gelijk aan de
 * modelnaam, wat de graaf leesbaar houdt in payloads en logs.
 *
 * Alles wat hier declaratief staat, stond vroeger als code verspreid over
 * routes.js#runSemanticQuery en 13 losse enrichment-bestanden:
 *  - `baseDomain`  : model-quirks (crm.lead toont ook gearchiveerde leads,
 *                    res.partner splitst op is_company, mail.message beperkt
 *                    zich tot echte berichten)
 *  - `heavyFields` : velden die zonder filter een Odoo-proxy laten crashen
 *  - `maxRecords`  : bovengrens per cascade-stap
 *  - `canBeRoot`   : mag dit model een vertrekpunt van een query zijn?
 *
 * Een nieuw model toevoegen = hier één node + in graph-edges.js één edge
 * declareren. Geen nieuwe uitvoeringscode.
 *
 * @module modules/sales-insight-explorer/lib/graph/graph-nodes
 */

/**
 * Standaard bovengrens op het aantal records dat één cascade-stap mag ophalen.
 * Bewust een vangnet, geen dagelijkse limiet: bij overschrijding krijgt de
 * gebruiker een nette melding "verfijn je filter" in plaats van een query die
 * minuten hangt of stil afkapt (zoals de oude enrichments met `limit: false`).
 */
export const DEFAULT_MAX_RECORDS_PER_STEP = 5000;

/** Aantal id's/waarden dat maximaal in één Odoo-domain gaat (zie cascade-executor). */
export const ID_BATCH_SIZE = 500;

export const NODES = {
  'x_sales_action_sheet': {
    key: 'x_sales_action_sheet',
    model: 'x_sales_action_sheet',
    label: 'Actiebladen',
    icon: 'file-text',
    nameField: 'x_name',
    canBeRoot: true,
    // Actiebladen worden gearchiveerd i.p.v. verwijderd; zonder dit laat Odoo
    // ze stil weg.
    baseDomain: [['x_active', 'in', [true, false]]],
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
    extraFilters: ['apartments'],
    heavyFields: [],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'crm.lead': {
    key: 'crm.lead',
    model: 'crm.lead',
    label: 'Leads',
    icon: 'users',
    nameField: 'name',
    canBeRoot: true,
    // Verloren leads staan op active=false; zonder dit verdwijnen ze stil uit
    // elk resultaat.
    baseDomain: [['active', 'in', [true, false]]],
    dateFields: [
      { field: 'create_date', label: 'Aanmaakdatum' },
      { field: 'date_last_stage_update', label: 'Laatste stage update' },
      { field: 'date_closed', label: 'Afsluitdatum' }
    ],
    extraFilters: ['won_status', 'stages'],
    heavyFields: [],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'res.partner': {
    key: 'res.partner',
    model: 'res.partner',
    label: "Gebouwen / VME's",
    icon: 'building-2',
    nameField: 'name',
    canBeRoot: true,
    baseDomain: [['is_company', '=', true]],
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
    extraFilters: ['partner_type', 'company_status'],
    heavyFields: [],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'res.partner:contact': {
    key: 'res.partner:contact',
    model: 'res.partner',
    label: 'Contactpersonen',
    icon: 'user',
    nameField: 'name',
    canBeRoot: true,
    baseDomain: [['is_company', '=', false]],
    dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
    extraFilters: ['contact_type'],
    heavyFields: [],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'x_web_visitor': {
    key: 'x_web_visitor',
    model: 'x_web_visitor',
    label: 'Web Visitors',
    icon: 'globe',
    nameField: 'x_name',
    canBeRoot: true,
    baseDomain: [],
    dateFields: [
      { field: 'x_studio_first_seen', label: 'Eerste bezoek' },
      { field: 'x_studio_last_seen', label: 'Laatste bezoek' }
    ],
    extraFilters: ['source_site', 'bounce'],
    // Grote HTML/JSON-aggregaties per record. Odoo.sh's proxy geeft Bad Gateway
    // als deze voor duizenden records tegelijk worden opgevraagd -> filter
    // verplicht. Stond vroeger hardcoded in routes.js (en was daar kapot: de
    // guard las een variabele die pas 60 regels later gedeclareerd werd).
    heavyFields: [
      'x_studio_visitor_timeline_html',
      'x_studio_visitor_kpi_html',
      'x_studio_pages_json'
    ],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'x_ad_touchpoint': {
    key: 'x_ad_touchpoint',
    model: 'x_ad_touchpoint',
    label: 'Ad Touchpoints',
    icon: 'mouse-pointer-click',
    // Geen vertrekpunt: een touchpoint op zichzelf zegt niets en er zijn er
    // ~223.000. Ze komen altijd binnen als kinderen van een reeds gefilterde
    // visitor-selectie.
    canBeRoot: false,
    nameField: 'x_name',
    baseDomain: [],
    dateFields: [{ field: 'x_studio_timestamp', label: 'Tijdstip klik' }],
    extraFilters: ['ad_filters'],
    heavyFields: [],
    maxRecords: 20000,
    defaultOrder: 'x_studio_timestamp asc'
  },

  'x_estate_stats': {
    key: 'x_estate_stats',
    model: 'x_estate_stats',
    label: 'Gebouwstatistieken',
    icon: 'bar-chart-3',
    nameField: 'x_name',
    // Mag zowel apart als vertrekpunt gekozen worden (bv. "alle gebouwen met
    // een openstaand dossier") als als cascade-stap onder Gebouwen/VME's.
    canBeRoot: true,
    baseDomain: [['x_active', 'in', [true, false]]],
    dateFields: [{ field: 'x_studio_last_sync_dt', label: 'Laatste synchronisatie' }],
    extraFilters: [],
    heavyFields: [],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'x_as_expectations': {
    key: 'x_as_expectations',
    model: 'x_as_expectations',
    label: 'Verwachtingen',
    icon: 'list-checks',
    nameField: 'x_name',
    // Vaste, korte lijst (~25 rijen, "many2many_checkboxes"-widget in Odoo) --
    // geen vertrekpunt, enkel cascade-doel vanuit
    // x_sales_action_sheet.x_studio_as_expectations. Zonder deze node-declaratie
    // kwam dat veld enkel als kale id-array binnen wanneer het rechtstreeks als
    // root-veld werd opgevraagd (Odoo's normale many2many-gedrag) -- de
    // fk_forward-hop hieronder (via de edge in graph-edges.js) haalt de
    // bijhorende x_name's op zoals elke andere relatie. Geen apart
    // caching-mechanisme nodig: batchedSearchRead() in cascade-executor.js
    // dedupliceert de aangevinkte id's toch al over ALLE actiebladen in de
    // query heen tot één enkele fetch, ongeacht hoe klein of vast de lijst is.
    canBeRoot: false,
    baseDomain: [],
    dateFields: [],
    extraFilters: [],
    heavyFields: [],
    maxRecords: DEFAULT_MAX_RECORDS_PER_STEP
  },

  'mail.message': {
    key: 'mail.message',
    model: 'mail.message',
    label: 'Chatter Berichten',
    icon: 'message-square',
    canBeRoot: false,
    nameField: 'preview',
    baseDomain: [['message_type', 'in', ['comment', 'email', 'notification']]],
    dateFields: [{ field: 'date', label: 'Datum' }],
    extraFilters: [],
    heavyFields: [],
    maxRecords: 20000,
    defaultOrder: 'date desc'
  },

  'mail.activity': {
    key: 'mail.activity',
    model: 'mail.activity',
    label: 'Activiteiten',
    icon: 'check-square',
    canBeRoot: false,
    nameField: 'summary',
    baseDomain: [],
    dateFields: [{ field: 'date_deadline', label: 'Deadline' }],
    extraFilters: [],
    heavyFields: [],
    maxRecords: 20000,
    defaultOrder: 'date_deadline asc'
  }
};

/**
 * Odoo-model achter een node-key.
 * @param {string} nodeKey
 * @returns {string|null}
 */
export function odooModelOf(nodeKey) {
  const node = NODES[nodeKey];
  return node ? node.model : null;
}

/**
 * @param {string} nodeKey
 * @returns {Object|null}
 */
export function getNode(nodeKey) {
  return NODES[nodeKey] || null;
}

/**
 * Alle nodes die als vertrekpunt van een query gekozen mogen worden.
 * @returns {Array<Object>}
 */
export function rootNodes() {
  return Object.values(NODES).filter((n) => n.canBeRoot === true);
}

/**
 * Velden die voor een node altijd meegehaald moeten worden, ongeacht de
 * veldkeuze van de gebruiker (id + naamveld, zodat elk resultaat leesbaar is).
 * @param {string} nodeKey
 * @returns {Array<string>}
 */
export function mandatoryFields(nodeKey) {
  const node = NODES[nodeKey];
  if (!node) return ['id'];
  return node.nameField ? ['id', node.nameField] : ['id'];
}
