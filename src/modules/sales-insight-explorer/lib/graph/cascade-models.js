/**
 * Cascade-query: vorm + validatie
 *
 * Eén JSON-vorm voor de wizard, voor opslag (saved_searches -> de afgeleide rij
 * in sales_insight_queries) en voor mini-apps. Geen tweede representatie, geen
 * vertaalslag tussen omgevingen.
 *
 * ```
 * {
 *   version: 2,
 *   root: {
 *     node: 'crm.lead',                  // node-key uit graph-nodes.js
 *     fields: ['name', 'create_date'],
 *     filters: [{ field, operator, value }],
 *     time_scope: { field, mode, ... },  // optioneel
 *     limit: 500                         // optioneel: getal, of 'unlimited'
 *                                        // (= tot de modelgrens node.maxRecords,
 *                                        // zie graph-nodes.js / cascade-executor.js)
 *     order: { field: 'create_date', direction: 'desc' }  // optioneel; bepaalt
 *                                        // welke records een cap overhoudt (zie
 *                                        // cascade-executor.js) -- zonder dit
 *                                        // valt de server terug op het
 *                                        // time_scope-veld, dan het eerste
 *                                        // dateField van de node, dan id
 *     strip_html_fields: ['x_studio_notes']  // optioneel; velden uit `fields`
 *                                        // waarvan HTML-opmaak gestript wordt
 *                                        // (zie lib/html-strip.js). Normaal
 *                                        // per-veld ingesteld op het
 *                                        // informatieset-veld zelf
 *                                        // (information_set_fields.strip_html)
 *                                        // en hier enkel automatisch afgeleid
 *                                        // door de wizard -- geen reden om dit
 *                                        // met de hand te schrijven.
 *   },
 *   cascade: [
 *     {
 *       edge: 'crm.lead>res.partner',    // edge-id uit graph-edges.js
 *       as: '__gebouwen',                // optioneel; default = edge.as
 *       fields: ['name'],
 *       filters: [],
 *       time_scope: { ... },             // per stap, niet enkel op de root
 *       limit: 2000,
 *       cascade: [ ...zelfde vorm, willekeurige diepte... ]
 *     }
 *   ]
 * }
 * ```
 *
 * Regels:
 * - de root-node moet `canBeRoot: true` hebben (leads, contactpersonen,
 *   gebouwen, web visitors, actiebladen -- touchpoints/chatter/activiteiten zijn
 *   wel cascade-doelen maar geen vertrekpunt);
 * - een edge moet vertrekken vanuit de node waar hij onder hangt;
 * - hetzelfde MODEL mag meerdere keren in een pad voorkomen (nodig voor
 *   gebouw -> contactpersonen, beide res.partner); wat verboden is, is dezelfde
 *   EDGE twee keer in hetzelfde pad -- dat zou een lus zijn;
 * - aliassen moeten unieks zijn binnen één niveau.
 *
 * @module modules/sales-insight-explorer/lib/graph/cascade-models
 */

import { getNode } from './graph-nodes.js';
import { getEdge } from './graph-edges.js';

export const CASCADE_VERSION = 2;

/**
 * Is dit een cascade-query (v2) en niet de oude wizard-payload?
 * @param {*} query
 * @returns {boolean}
 */
export function isCascadeQuery(query) {
  return !!query && typeof query === 'object' && query.version === CASCADE_VERSION && !!query.root;
}

/**
 * @param {string} nodeKey
 * @returns {Object} lege cascade-query
 */
export function createEmptyCascadeQuery(nodeKey) {
  return {
    version: CASCADE_VERSION,
    root: { node: nodeKey, fields: [], filters: [] },
    cascade: []
  };
}

const VALID_OPERATORS = new Set([
  '=', '!=', '>', '>=', '<', '<=',
  'like', 'ilike', 'not like', 'not ilike',
  'in', 'not in', 'is set', 'is not set', 'child_of'
]);

function validateFilters(filters, path, errors) {
  if (filters === undefined) return;
  if (!Array.isArray(filters)) {
    errors.push({ code: 'INVALID_FILTERS', message: 'filters moet een array zijn', path });
    return;
  }
  filters.forEach((f, i) => {
    const p = `${path}.filters[${i}]`;
    if (!f || typeof f !== 'object') {
      errors.push({ code: 'INVALID_FILTER', message: 'filter moet een object zijn', path: p });
      return;
    }
    if (!f.field || typeof f.field !== 'string') {
      errors.push({ code: 'INVALID_FILTER', message: 'filter mist `field`', path: p });
    }
    if (!f.operator || !VALID_OPERATORS.has(f.operator)) {
      errors.push({
        code: 'INVALID_OPERATOR',
        message: `onbekende operator: ${f.operator}`,
        path: p
      });
    }
    const needsValue = f.operator !== 'is set' && f.operator !== 'is not set';
    if (needsValue && f.value === undefined) {
      errors.push({ code: 'INVALID_FILTER', message: 'filter mist `value`', path: p });
    }
  });
}

function validateFields(fields, path, errors) {
  if (fields === undefined) return;
  if (!Array.isArray(fields)) {
    errors.push({ code: 'INVALID_FIELDS', message: 'fields moet een array van veldnamen zijn', path });
    return;
  }
  fields.forEach((f, i) => {
    if (typeof f !== 'string' || !f) {
      errors.push({
        code: 'INVALID_FIELD',
        message: 'veldnamen zijn strings in de cascade-vorm (geen {model, field}-objecten)',
        path: `${path}.fields[${i}]`
      });
    }
  });
}

/**
 * root.order bepaalt welke records overblijven bij een cap (zie
 * cascade-executor.js) -- vandaar een aparte, strengere validatie dan een
 * losse string: een typo in het veld mag niet stilzwijgend verkeerd sorteren.
 */
function validateOrder(order, path, errors) {
  if (order === undefined || order === null) return;
  if (typeof order !== 'object' || Array.isArray(order)) {
    errors.push({ code: 'INVALID_ORDER', message: 'order moet een object zijn ({ field, direction })', path });
    return;
  }
  if (!order.field || typeof order.field !== 'string') {
    errors.push({ code: 'INVALID_ORDER', message: 'order mist `field`', path });
  }
  if (order.direction !== undefined && order.direction !== 'asc' && order.direction !== 'desc') {
    errors.push({ code: 'INVALID_ORDER', message: "order.direction moet 'asc' of 'desc' zijn", path });
  }
}

/**
 * strip_html_fields: een simpele lijst veldnamen, maar met een eigen foutcode
 * (i.p.v. de generieke validateFields()) zodat een fout hier duidelijk naar
 * HTML-strippen wijst i.p.v. naar de veldkeuze zelf.
 */
function validateStripHtmlFields(fields, path, errors) {
  if (fields === undefined) return;
  if (!Array.isArray(fields)) {
    errors.push({ code: 'INVALID_STRIP_HTML_FIELDS', message: 'strip_html_fields moet een array van veldnamen zijn', path });
    return;
  }
  fields.forEach((f, i) => {
    if (typeof f !== 'string' || !f) {
      errors.push({
        code: 'INVALID_STRIP_HTML_FIELDS',
        message: 'strip_html_fields[' + i + '] moet een niet-lege veldnaam zijn',
        path: `${path}.strip_html_fields[${i}]`
      });
    }
  });
}

function validateTimeScope(timeScope, path, errors) {
  if (timeScope === undefined || timeScope === null) return;
  if (typeof timeScope !== 'object' || Array.isArray(timeScope)) {
    errors.push({ code: 'INVALID_TIME_SCOPE', message: 'time_scope moet een object zijn', path });
    return;
  }
  if (!timeScope.field) {
    errors.push({ code: 'INVALID_TIME_SCOPE', message: 'time_scope mist `field`', path });
  }
  if (timeScope.mode !== 'absolute' && timeScope.mode !== 'relative') {
    errors.push({
      code: 'INVALID_TIME_SCOPE',
      message: "time_scope.mode moet 'absolute' of 'relative' zijn",
      path
    });
  }
}

function validateSteps(steps, parentNodeKey, usedEdgeIds, path, errors) {
  if (steps === undefined) return;
  if (!Array.isArray(steps)) {
    errors.push({ code: 'INVALID_CASCADE', message: 'cascade moet een array zijn', path });
    return;
  }

  const aliasesAtThisLevel = new Set();

  steps.forEach((step, i) => {
    const p = `${path}.cascade[${i}]`;
    if (!step || typeof step !== 'object') {
      errors.push({ code: 'INVALID_STEP', message: 'stap moet een object zijn', path: p });
      return;
    }
    if (!step.edge || typeof step.edge !== 'string') {
      errors.push({ code: 'MISSING_EDGE', message: 'stap mist `edge`', path: p });
      return;
    }

    const edge = getEdge(step.edge);
    if (!edge) {
      errors.push({
        code: 'UNKNOWN_EDGE',
        message: `onbekende koppeling: ${step.edge}`,
        path: p
      });
      return;
    }
    if (edge.from !== parentNodeKey) {
      errors.push({
        code: 'EDGE_NOT_FROM_PARENT',
        message: `koppeling ${step.edge} vertrekt vanuit ${edge.from}, maar hangt onder ${parentNodeKey}`,
        path: p
      });
      return;
    }
    if (usedEdgeIds.has(step.edge)) {
      errors.push({
        code: 'CYCLIC_PATH',
        message: `koppeling ${step.edge} komt twee keer voor in hetzelfde pad`,
        path: p
      });
      return;
    }

    const alias = step.as || edge.as;
    if (!alias || !alias.startsWith('__')) {
      errors.push({
        code: 'INVALID_ALIAS',
        message: `alias moet met __ beginnen (kreeg: ${alias})`,
        path: p
      });
    } else if (aliasesAtThisLevel.has(alias)) {
      errors.push({
        code: 'DUPLICATE_ALIAS',
        message: `alias ${alias} komt twee keer voor op hetzelfde niveau`,
        path: p
      });
    } else {
      aliasesAtThisLevel.add(alias);
    }

    validateFields(step.fields, p, errors);
    validateFilters(step.filters, p, errors);
    validateTimeScope(step.time_scope, p, errors);
    validateStripHtmlFields(step.strip_html_fields, p, errors);

    const nextUsed = new Set(usedEdgeIds);
    nextUsed.add(step.edge);
    validateSteps(step.cascade, edge.to, nextUsed, p, errors);
  });
}

/**
 * Structurele validatie tegen de graaf. Controleert NIET of de opgegeven
 * veldnamen in Odoo bestaan -- daar is de schema-validatie voor.
 *
 * @param {Object} query - cascade-query (v2)
 * @returns {{is_valid: boolean, errors: Array<{code: string, message: string, path: string}>}}
 */
export function validateCascadeQuery(query) {
  const errors = [];

  if (!query || typeof query !== 'object') {
    return { is_valid: false, errors: [{ code: 'INVALID_QUERY', message: 'query moet een object zijn', path: '' }] };
  }
  if (query.version !== CASCADE_VERSION) {
    errors.push({
      code: 'UNSUPPORTED_VERSION',
      message: `verwacht version: ${CASCADE_VERSION}, kreeg: ${query.version}`,
      path: 'version'
    });
  }
  if (!query.root || typeof query.root !== 'object') {
    errors.push({ code: 'MISSING_ROOT', message: 'query mist `root`', path: 'root' });
    return { is_valid: false, errors };
  }

  const rootNode = getNode(query.root.node);
  if (!rootNode) {
    errors.push({
      code: 'UNKNOWN_NODE',
      message: `onbekend startpunt: ${query.root.node}`,
      path: 'root.node'
    });
    return { is_valid: false, errors };
  }
  if (rootNode.canBeRoot !== true) {
    errors.push({
      code: 'NODE_NOT_ROOTABLE',
      message: `${rootNode.label} kan geen vertrekpunt van een query zijn`,
      path: 'root.node'
    });
  }

  validateFields(query.root.fields, 'root', errors);
  validateFilters(query.root.filters, 'root', errors);
  validateTimeScope(query.root.time_scope, 'root', errors);

  if (query.root.limit !== undefined && query.root.limit !== null && query.root.limit !== 'unlimited') {
    if (typeof query.root.limit !== 'number' || query.root.limit <= 0) {
      errors.push({
        code: 'INVALID_LIMIT',
        message: "limit moet een positief getal zijn, of de tekst 'unlimited'",
        path: 'root.limit'
      });
    }
  }

  validateOrder(query.root.order, 'root.order', errors);
  validateStripHtmlFields(query.root.strip_html_fields, 'root', errors);

  validateSteps(query.cascade, query.root.node, new Set(), '', errors);

  return { is_valid: errors.length === 0, errors };
}

/**
 * Alle aliassen in een cascade-query, met hun node-key. Handig voor de
 * export-laag en voor labels in de UI.
 *
 * @param {Object} query
 * @returns {Array<{alias: string, node: string, edge: string, depth: number, parentAlias: string|null}>}
 */
export function collectAliases(query) {
  const out = [];
  function walk(steps, depth, parentAlias) {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
      const edge = getEdge(step.edge);
      if (!edge) continue;
      const alias = step.as || edge.as;
      out.push({ alias, node: edge.to, edge: edge.id, depth, parentAlias });
      walk(step.cascade, depth + 1, alias);
    }
  }
  walk(query && query.cascade, 1, null);
  return out;
}
