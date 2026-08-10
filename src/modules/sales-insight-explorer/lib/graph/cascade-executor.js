/**
 * Cascade-executor — de ENIGE motor die Odoo-data ophaalt voor Sales Insight
 * Explorer en voor mini-apps
 *
 * Vertrekt vanuit één basismodel (root) en cascadeert generiek langs de graaf:
 * per stap worden ENKEL de records opgehaald die aan de al-geselecteerde
 * ouderrecords hangen, en vanuit die records kan verder gecascadeerd worden naar
 * hun eigen buren, willekeurig diep. Een nieuw model of een nieuwe koppeling
 * toevoegen vraagt geen nieuwe code hier: enkel een node/edge-declaratie in
 * graph-nodes.js / graph-edges.js.
 *
 * Dit vervangt 13 hand-geschreven enrichment-bestanden én de relatietak van
 * query-executor.js. Wat daar structureel fout zat en hier bewust anders is:
 *
 *  - many2one werd uitgevoerd als `id in <bron-id's>` i.p.v. op de FK-WAARDEN
 *    die in de bronrecords staan -> haalde willekeurig verkeerde records op.
 *  - de groepering per ouder gebeurde op een veld dat op het doelrecord niet
 *    bestaat, en vanaf stap 2 was de link met het oorspronkelijke basisrecord
 *    verloren -> multi-stap paden konden nooit correct groeperen.
 *  - alle enrichments deden `limit: false` en zetten alle bron-id's in één
 *    domain. Hier: een cap per stap (node.maxRecords) en id's in blokken van
 *    ID_BATCH_SIZE.
 *
 * Resultaatvorm: rijen van het basismodel, met per cascade-stap een geneste
 * `__alias`-sleutel (array, of één object/null bij een many2one). Dat is
 * dezelfde vorm die de wizard en window.platform.odoo.runQuery() al verwachten.
 * Een veld met waarde `false` staat NIET op het record (zie omitFalseValues()
 * hieronder) -- een ontbrekende sleutel betekent dus altijd false, nooit
 * "niet opgehaald". `meta.fields` is de canonieke lijst van velden die de
 * query WEL opvraagt, ongeacht of ze op een specifiek record false waren.
 *
 * @module modules/sales-insight-explorer/lib/graph/cascade-executor
 */

import { searchRead } from '../../../../lib/odoo.js';
import { translateTimeScope } from '../odoo-domain-translator.js';
import { getNode, odooModelOf, mandatoryFields, ID_BATCH_SIZE } from './graph-nodes.js';
import { getEdge } from './graph-edges.js';
import { validateCascadeQuery } from './cascade-models.js';
import { stripHtml } from '../html-strip.js';

/** Aantal basisrecords als de query zelf geen limiet meegeeft. */
export const DEFAULT_ROOT_LIMIT = 1000;

/** Aantal basisrecords in preview-modus (wizard-voorbeeld, mini-app-default). */
export const PREVIEW_LIMIT = 50;

export class CascadeError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'CascadeError';
    this.code = code;
    Object.assign(this, extra);
  }
}

// ============================================================================
// Domain-opbouw
// ============================================================================

const OPERATOR_MAP = {
  '=': '=', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=',
  like: 'like', ilike: 'ilike', 'not like': 'not like', 'not ilike': 'not ilike',
  in: 'in', 'not in': 'not in', child_of: 'child_of'
};

/**
 * Filters + time_scope -> platte lijst domain-leaves (alles impliciet AND).
 * Bewust geen expliciete '&'-operatoren: dat maakt het samenvoegen met het
 * baseDomain van een node en met traversal-condities foutgevoelig.
 *
 * @param {Array} baseDomain
 * @param {Array} filters
 * @param {Object} [timeScope]
 * @returns {Array}
 */
function buildDomain(baseDomain, filters, timeScope) {
  const domain = Array.isArray(baseDomain) ? [...baseDomain] : [];

  if (Array.isArray(filters)) {
    for (const f of filters) {
      if (!f || !f.field || !f.operator) continue;
      if (f.operator === 'is set') {
        domain.push([f.field, '!=', false]);
        continue;
      }
      if (f.operator === 'is not set') {
        domain.push([f.field, '=', false]);
        continue;
      }
      if (f.value === undefined) continue;
      const op = OPERATOR_MAP[f.operator];
      if (!op) continue;
      domain.push([f.field, op, f.value]);
    }
  }

  if (timeScope && timeScope.field && timeScope.mode) {
    domain.push(...translateTimeScope(timeScope));
  }

  return domain;
}

function hasAnyFilter(spec) {
  const filters = spec && spec.filters;
  return (Array.isArray(filters) && filters.length > 0) || !!(spec && spec.time_scope);
}

/**
 * Zware velden (grote HTML/JSON-blobs) mogen niet zonder filter opgevraagd
 * worden -- Odoo's proxy geeft dan Bad Gateway. Generiek per node declareerd
 * (node.heavyFields) i.p.v. hardcoded voor x_web_visitor.
 */
function guardHeavyFields(node, fields, spec, path) {
  if (!node.heavyFields || node.heavyFields.length === 0) return;
  const requested = fields.filter((f) => node.heavyFields.includes(f));
  if (requested.length === 0) return;
  if (hasAnyFilter(spec)) return;

  throw new CascadeError(
    `De velden ${requested.join(', ')} bevatten grote HTML-data per record. Voeg een filter toe (bijvoorbeeld een tijdsperiode) om het aantal records te beperken.`,
    'QUERY_TOO_BROAD',
    { heavy_fields: requested, path }
  );
}

/**
 * Veldkeuze -> effectieve veldlijst: id + naamveld altijd mee, duplicaten en
 * kapotte veldnamen eruit. De 's_studio_'-guard komt uit de oude route: dat is
 * een typo-prefix uit stale Supabase-config, nooit een echt Odoo-veld.
 */
function resolveFields(nodeKey, requested) {
  const out = [];
  const seen = new Set();
  const push = (f) => {
    if (!f || typeof f !== 'string') return;
    if (f.startsWith('s_studio_')) return;
    if (seen.has(f)) return;
    seen.add(f);
    out.push(f);
  };
  mandatoryFields(nodeKey).forEach(push);
  if (Array.isArray(requested)) requested.forEach(push);
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Strip HTML uit de opgegeven velden van elke record, in-place. `fieldNames`
 * komt uit information_set_fields.strip_html (zie cascade-models.js'
 * root.strip_html_fields / step.strip_html_fields) -- een leeg/afwezige lijst
 * is de veelvoorkomende no-op-case, dus die eerst wegchecken.
 */
function applyStripHtml(records, fieldNames) {
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) return;
  for (const record of records) {
    for (const field of fieldNames) {
      if (typeof record[field] === 'string') record[field] = stripHtml(record[field]);
    }
  }
}

/**
 * Vervang de ruwe waarde van selection-velden door hun label, in-place.
 * `selectionMaps` komt uit information_set_fields.selection_map (zie
 * cascade-models.js' root.selection_maps / step.selection_maps) -- eenmalig in
 * de admin-tab "Categorieën" opgehaald bij Odoo via fields_get() (zie
 * routes.js#fetchFieldSelectionMap), i.p.v. bij elke query opnieuw. Een
 * ontbrekende map, of een ruwe waarde die niet in de map voorkomt (bv. na een
 * nieuwe optie in Odoo Studio), laat het veld gewoon ongemoeid -- nooit data
 * laten verdwijnen omdat de mapping stale is.
 */
function applySelectionMap(records, selectionMaps) {
  if (!selectionMaps || typeof selectionMaps !== 'object') return;
  const entries = Object.entries(selectionMaps)
    .filter(([, map]) => map && typeof map === 'object' && Object.keys(map).length > 0);
  if (entries.length === 0) return;
  for (const record of records) {
    for (const [field, map] of entries) {
      const raw = record[field];
      if (raw === undefined || raw === null || raw === false) continue;
      const key = String(raw);
      if (key in map) record[field] = map[key];
    }
  }
}

// ============================================================================
// Resultaat compacteren
// ============================================================================
//
// Een gecascadeerde relatie komt binnen als volledige {id, naam}-objecten per
// kind-record. Voor het UITEINDELIJKE resultaat (wizard-export, mini-apps,
// AI-context) is dat id nog steeds nuttig om het bijhorende record elders terug
// te vinden -- enkel de HERHAALDE key-namen ("id", "x_name", ...) per item zijn
// pure overhead. Daarom: zo'n kind-record wordt, enkel als het NIETS anders
// bevat dan id + het nameField van die node, plat naar Odoo's eigen
// many2one-vorm [id, "naam"] i.p.v. {id: ..., x_name: ...} -- zelfde informatie,
// geen key-namen die zich per item herhalen. Odoo's eigen many2one-velden op
// het basisrecord staan al in exact die vorm en blijven dus ongemoeid.
//
// Zodra er voor die relatie ook maar één extra veld gekozen is, of er hangt een
// diepere cascade onder (die dan zijn eigen __alias-sleutel toevoegt), heeft
// dat kind-record meer dan twee sleutels en blijft het het volledige object --
// er gaat dus nooit data verloren, enkel de key-namen van een "kaal"
// id+naam-record verdwijnen.

/**
 * Eén kind-record van een cascade-relatie plat naar [id, naam], enkel als het
 * NIETS anders bevat dan id + nameField (zie hierboven).
 */
function flattenIfBare(child, nameField) {
  if (!child || typeof child !== 'object' || Array.isArray(child)) return child;
  const keys = Object.keys(child);
  if (keys.length === 2 && 'id' in child && nameField in child) return [child.id, child[nameField]];
  return child;
}

/**
 * Compacteer een volledige record-boom in-place: cascade-aliassen platslaan
 * naar [id, naam]-tuples via hun nameField (opgehaald uit `aliasNameFields`,
 * gevuld met ctx.steps -- zie executeCascade()). Odoo's eigen many2one-velden
 * staan al in die vorm en worden hier niet aangeraakt.
 *
 * @param {*} value - record, array van records, of een geneste waarde
 * @param {Map<string, string>} aliasNameFields - __alias -> nameField van de
 *   node aan het andere eind van die cascade-stap
 */
function compactValue(value, aliasNameFields) {
  if (Array.isArray(value)) {
    value.forEach((item) => compactValue(item, aliasNameFields));
    return value;
  }
  if (!value || typeof value !== 'object') return value;

  for (const [key, v] of Object.entries(value)) {
    compactValue(v, aliasNameFields);
    const nameField = aliasNameFields.get(key);
    if (!nameField) continue;
    value[key] = Array.isArray(v)
      ? v.map((child) => flattenIfBare(child, nameField))
      : flattenIfBare(v, nameField);
  }
  return value;
}

/**
 * __alias -> nameField van de node aan het andere eind, afgeleid uit
 * ctx.steps (gevuld door runSteps() voor elke uitgevoerde cascade-stap, op elk
 * nesting-niveau).
 */
function buildAliasNameFieldMap(ctx) {
  const map = new Map();
  for (const step of ctx.steps) {
    const targetNode = getNode(step.node);
    if (targetNode && targetNode.nameField) map.set(step.alias, targetNode.nameField);
  }
  return map;
}

// ============================================================================
// Prefix-ballast wegfilteren
// ============================================================================
//
// x_ en x_studio_ zijn Odoo Studio's eigen namespace-prefixen -- ze bestaan om
// botsingen met kern-Odoo-velden te vermijden, maar dragen zelf geen
// informatie. Voor het uiteindelijke resultaat (wizard-export, mini-apps,
// AI-context) is dat pure ballast: "x_studio_has_reserve_account" wordt
// "has_reserve_account". Generiek op elke sleutel op elk niveau, NA
// compactValue() (zodat flattenIfBare() hierboven nog gewoon het originele
// nameField als sleutel ziet).

/** Eén sleutel zonder Studio-prefix, of ongewijzigd als er geen prefix is. */
function stripKeyPrefix(key) {
  if (key.startsWith('x_studio_')) return key.slice('x_studio_'.length);
  if (key.startsWith('x_')) return key.slice('x_'.length);
  return key;
}

/**
 * Hernoem in-place elke x_/x_studio_-sleutel op elk niveau van de record-boom.
 * Botsingsveilig: als twee velden na het strippen dezelfde naam zouden krijgen,
 * of de nieuwe naam botst met een bestaand ander veld, blijft die ene sleutel
 * gewoon ongemoeid i.p.v. dat er stilzwijgend data verloren gaat.
 */
function stripFieldPrefixes(value) {
  if (Array.isArray(value)) {
    value.forEach((item) => stripFieldPrefixes(item));
    return value;
  }
  if (!value || typeof value !== 'object') return value;

  // Eerst de diepte in, dan pas deze laag hernoemen.
  for (const v of Object.values(value)) stripFieldPrefixes(v);

  const renames = new Map();
  for (const key of Object.keys(value)) {
    const stripped = stripKeyPrefix(key);
    if (stripped !== key) renames.set(key, stripped);
  }
  if (renames.size === 0) return value;

  const targetCounts = new Map();
  for (const stripped of renames.values()) {
    targetCounts.set(stripped, (targetCounts.get(stripped) || 0) + 1);
  }

  for (const [oldKey, newKey] of renames.entries()) {
    if (targetCounts.get(newKey) > 1) continue; // twee velden botsen op dezelfde nieuwe naam
    if (newKey in value && !renames.has(newKey)) continue; // botst met een bestaand ander veld
    value[newKey] = value[oldKey];
    delete value[oldKey];
  }
  return value;
}

// ============================================================================
// Lege velden weglaten
// ============================================================================
//
// Odoo's `false` is de universele "geen waarde"-sentinel -- niet enkel voor
// booleans, maar ook voor een lege char/text/many2one/selection. In een
// resultaat met tientallen optionele velden per record (bv. Actiebladen:
// ~45 velden, waarvan gemiddeld meer dan de helft `false`) is dat pure
// herhaalde ballast: elke `"veld": false` kost de sleutelnaam nog een keer,
// zonder enige informatie te dragen die "de sleutel ontbreekt" niet even goed
// zou zeggen. Vandaar: elke key met waarde `false` wordt hier verwijderd, op
// elk niveau -- ÉÉN afspraak, overal (wizard-export, mini-apps via
// runSharedQuery(), AI-context): een sleutel die niet op een record staat had
// de waarde false. `null`, `0`, `""` en `[]` zijn bewust ANDERE waarden dan
// "geen waarde" in Odoo en blijven dus altijd staan.

/** Verwijder in-place elke key met waarde `false`, op elk niveau. */
function omitFalseValues(value) {
  if (Array.isArray(value)) {
    value.forEach((item) => omitFalseValues(item));
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  for (const [key, v] of Object.entries(value)) {
    if (v === false) { delete value[key]; continue; }
    omitFalseValues(v);
  }
  return value;
}

/**
 * searchRead met de sleutelwaarden (id's of matchwaarden) in blokken, zodat één
 * domain nooit duizenden waarden bevat.
 *
 * @returns {Promise<Array<Object>>}
 */
async function batchedSearchRead(env, { model, keys, domainFor, fields, cap, order }) {
  const rows = [];
  for (const part of chunk(keys, ID_BATCH_SIZE)) {
    const batch = await searchRead(env, {
      model,
      domain: domainFor(part),
      fields,
      limit: cap ? cap + 1 : undefined,
      ...(order ? { order } : {})
    });
    rows.push(...batch);
    if (cap && rows.length > cap) break;
  }
  return rows;
}

function overflow(node, count, cap, alias) {
  throw new CascadeError(
    `De stap "${alias || node.label}" levert meer dan ${cap} records op. Verfijn je filter of beperk de periode.`,
    'STEP_TOO_LARGE',
    { node: node.key, cap, alias }
  );
}

// ============================================================================
// Relatiewaarden lezen
// ============================================================================

/**
 * Een relatieveld uit een Odoo-record naar een lijst id's.
 * many2one komt terug als [id, "naam"] of false; x2many als [id, id, ...].
 */
function relationValueToIds(value, fieldType) {
  if (value === false || value === null || value === undefined) return [];
  if (fieldType === 'many2one') {
    if (Array.isArray(value)) return typeof value[0] === 'number' ? [value[0]] : [];
    return typeof value === 'number' ? [value] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'number');
}

function normalizeMatchValue(value, normalize) {
  if (value === false || value === null || value === undefined) return null;
  let v = String(value).trim();
  if (!v) return null;
  if (normalize === 'email') v = v.toLowerCase();
  return v;
}

// ============================================================================
// Elementaire hop
// ============================================================================

/**
 * Voer één elementaire hop uit.
 *
 * @param {Object} env
 * @param {Object} edge - resolved edge uit graph-edges.js
 * @param {Array<number>} sourceIds - id's in het bronmodel van deze hop
 * @param {Object} spec
 * @param {Array<string>} spec.fields - velden op te halen op het doelmodel
 * @param {Array} spec.extraDomain - baseDomain van de doelnode + stapfilters
 * @param {number} spec.cap
 * @param {string} [spec.alias]
 * @returns {Promise<{recordsById: Map<number, Object>, parentToChildIds: Map<number, Array<number>>}>}
 */
async function runHop(env, edge, sourceIds, spec) {
  const sourceModel = odooModelOf(edge.from);
  const targetNode = getNode(edge.to);
  const targetModel = targetNode.model;
  const order = targetNode.defaultOrder;
  const cap = spec.cap;

  const recordsById = new Map();
  const parentToChildIds = new Map();
  const addLink = (parentId, childId) => {
    if (!parentToChildIds.has(parentId)) parentToChildIds.set(parentId, []);
    const list = parentToChildIds.get(parentId);
    if (!list.includes(childId)) list.push(childId);
  };

  if (sourceIds.length === 0) return { recordsById, parentToChildIds };

  // --- 1. Doelrecords ophalen + de ruwe koppeling bepalen -------------------

  if (edge.mode === 'fk_forward') {
    // Het koppelveld leeft op het BRONmodel: lees de FK-waarden uit de
    // bronrecords en zoek het doel op die waarden. Dit is precies de stap die
    // de oude motor oversloeg.
    const sourceRows = await batchedSearchRead(env, {
      model: sourceModel,
      keys: sourceIds,
      domainFor: (ids) => [['id', 'in', ids]],
      fields: ['id', edge.field]
    });

    const targetIds = new Set();
    const sourceToTargets = new Map();
    for (const row of sourceRows) {
      const ids = relationValueToIds(row[edge.field], edge.fieldType);
      sourceToTargets.set(row.id, ids);
      ids.forEach((id) => targetIds.add(id));
    }
    if (targetIds.size === 0) return { recordsById, parentToChildIds };

    const targets = await batchedSearchRead(env, {
      model: targetModel,
      keys: [...targetIds],
      domainFor: (ids) => [['id', 'in', ids], ...spec.extraDomain],
      fields: spec.fields,
      cap,
      order
    });
    if (targets.length > cap) overflow(targetNode, targets.length, cap, spec.alias);
    applyStripHtml(targets, spec.stripHtmlFields);
    applySelectionMap(targets, spec.selectionMaps);
    targets.forEach((t) => recordsById.set(t.id, t));

    for (const [sourceId, ids] of sourceToTargets.entries()) {
      ids.filter((id) => recordsById.has(id)).forEach((id) => addLink(sourceId, id));
    }
    return { recordsById, parentToChildIds };
  }

  if (edge.mode === 'fk_reverse') {
    // Het koppelveld leeft op het DOELmodel -> rechtstreeks filteren.
    const fields = spec.fields.includes(edge.field) ? spec.fields : [...spec.fields, edge.field];
    const targets = await batchedSearchRead(env, {
      model: targetModel,
      keys: sourceIds,
      domainFor: (ids) => [[edge.field, 'in', ids], ...spec.extraDomain],
      fields,
      cap,
      order
    });
    if (targets.length > cap) overflow(targetNode, targets.length, cap, spec.alias);
    applyStripHtml(targets, spec.stripHtmlFields);
    applySelectionMap(targets, spec.selectionMaps);

    const sourceSet = new Set(sourceIds);
    for (const t of targets) {
      const parentIds = relationValueToIds(t[edge.field], edge.fieldType);
      if (!spec.fields.includes(edge.field)) delete t[edge.field];
      recordsById.set(t.id, t);
      parentIds.filter((pid) => sourceSet.has(pid)).forEach((pid) => addLink(pid, t.id));
    }
    return { recordsById, parentToChildIds };
  }

  if (edge.mode === 'match_forward' || edge.mode === 'match_reverse') {
    const sourceField = edge.mode === 'match_forward' ? edge.match.fromField : edge.match.toField;
    const targetField = edge.mode === 'match_forward' ? edge.match.toField : edge.match.fromField;
    const normalize = edge.match.normalize;

    const sourceRows = await batchedSearchRead(env, {
      model: sourceModel,
      keys: sourceIds,
      domainFor: (ids) => [['id', 'in', ids]],
      fields: ['id', sourceField]
    });

    const valueToSourceIds = new Map();
    for (const row of sourceRows) {
      const v = normalizeMatchValue(row[sourceField], normalize);
      if (!v) continue;
      if (!valueToSourceIds.has(v)) valueToSourceIds.set(v, []);
      valueToSourceIds.get(v).push(row.id);
    }
    if (valueToSourceIds.size === 0) return { recordsById, parentToChildIds };

    const fields = spec.fields.includes(targetField) ? spec.fields : [...spec.fields, targetField];
    const targets = await batchedSearchRead(env, {
      model: targetModel,
      keys: [...valueToSourceIds.keys()],
      domainFor: (vals) => [[targetField, 'in', vals], ...spec.extraDomain],
      fields,
      cap,
      order
    });
    if (targets.length > cap) overflow(targetNode, targets.length, cap, spec.alias);
    applyStripHtml(targets, spec.stripHtmlFields);
    applySelectionMap(targets, spec.selectionMaps);

    for (const t of targets) {
      const v = normalizeMatchValue(t[targetField], normalize);
      if (!spec.fields.includes(targetField)) delete t[targetField];
      recordsById.set(t.id, t);
      const parents = v ? valueToSourceIds.get(v) : null;
      if (parents) parents.forEach((pid) => addLink(pid, t.id));
    }
    return { recordsById, parentToChildIds };
  }

  if (edge.mode === 'mail') {
    const fields = spec.fields.includes('res_id') ? spec.fields : [...spec.fields, 'res_id'];
    const targets = await batchedSearchRead(env, {
      model: targetModel,
      keys: sourceIds,
      domainFor: (ids) => [
        [edge.resModelField, '=', sourceModel],
        ['res_id', 'in', ids],
        ...spec.extraDomain
      ],
      fields,
      cap,
      order
    });
    if (targets.length > cap) overflow(targetNode, targets.length, cap, spec.alias);
    applyStripHtml(targets, spec.stripHtmlFields);
    applySelectionMap(targets, spec.selectionMaps);

    const sourceSet = new Set(sourceIds);
    for (const t of targets) {
      const pid = t.res_id;
      if (!spec.fields.includes('res_id')) delete t.res_id;
      recordsById.set(t.id, t);
      if (sourceSet.has(pid)) addLink(pid, t.id);
    }
    return { recordsById, parentToChildIds };
  }

  throw new CascadeError(`Onbekend koppelingstype: ${edge.mode}`, 'UNKNOWN_EDGE_MODE');
}

/**
 * Voer een edge uit — elementair of samengesteld. Bij een samengestelde edge
 * worden de tussenliggende hops enkel op id opgehaald (met het baseDomain van
 * de tussennode, zodat bv. een contactpersoon effectief een individu is), en
 * blijft de koppeling met het oorspronkelijke ouderrecord bewaard.
 */
async function traverseEdge(env, edge, sourceIds, spec) {
  if (edge.mode !== 'composite') {
    return runHop(env, edge, sourceIds, spec);
  }

  let linkage = new Map(sourceIds.map((id) => [id, [id]]));
  let recordsById = new Map();

  for (let i = 0; i < edge.hops.length; i++) {
    const hop = edge.hops[i];
    const isLast = i === edge.hops.length - 1;
    const hopNode = getNode(hop.to);
    const currentIds = [...new Set([...linkage.values()].flat())];
    if (currentIds.length === 0) return { recordsById: new Map(), parentToChildIds: new Map() };

    const hopSpec = isLast
      ? spec
      : {
          fields: ['id'],
          extraDomain: Array.isArray(hopNode.baseDomain) ? [...hopNode.baseDomain] : [],
          cap: hopNode.maxRecords,
          alias: spec.alias
        };

    const hopResult = await runHop(env, hop, currentIds, hopSpec);
    recordsById = hopResult.recordsById;

    const next = new Map();
    for (const [rootId, ids] of linkage.entries()) {
      const mapped = [];
      for (const id of ids) {
        const children = hopResult.parentToChildIds.get(id);
        if (children) children.forEach((c) => { if (!mapped.includes(c)) mapped.push(c); });
      }
      if (mapped.length > 0) next.set(rootId, mapped);
    }
    linkage = next;
  }

  return { recordsById, parentToChildIds: linkage };
}

// ============================================================================
// Cascade
// ============================================================================

async function runSteps(env, steps, parentNodeKey, parentRecords, ctx) {
  if (!Array.isArray(steps) || steps.length === 0) return;
  if (parentRecords.length === 0) return;

  for (const step of steps) {
    const edge = getEdge(step.edge);
    const targetNode = getNode(edge.to);
    const alias = step.as || edge.as;

    const fields = resolveFields(edge.to, step.fields);
    guardHeavyFields(targetNode, fields, step, alias);
    // Enkel velden die ook echt opgehaald worden -- een stale strip_html_fields
    // (bv. na een fields-wijziging in de wizard) mag nooit een KeyError-achtige
    // situatie geven, gewoon negeren.
    const stripHtmlFields = Array.isArray(step.strip_html_fields)
      ? step.strip_html_fields.filter((f) => fields.includes(f))
      : [];
    const selectionMaps = step.selection_maps && typeof step.selection_maps === 'object'
      ? step.selection_maps
      : {};

    const cap = Math.min(
      typeof step.limit === 'number' && step.limit > 0 ? step.limit : targetNode.maxRecords,
      targetNode.maxRecords
    );
    const extraDomain = buildDomain(targetNode.baseDomain, step.filters, step.time_scope);

    const started = Date.now();
    const { recordsById, parentToChildIds } = await traverseEdge(
      env,
      edge,
      parentRecords.map((r) => r.id),
      { fields, extraDomain, cap, alias, stripHtmlFields, selectionMaps }
    );

    for (const parent of parentRecords) {
      const childIds = parentToChildIds.get(parent.id) || [];
      const children = childIds.map((id) => recordsById.get(id)).filter(Boolean);
      parent[alias] = edge.cardinality === 'one' ? (children[0] || null) : children;
    }

    ctx.steps.push({
      alias,
      edge: edge.id,
      node: edge.to,
      label: targetNode.label,
      cardinality: edge.cardinality,
      count: recordsById.size,
      duration_ms: Date.now() - started
    });
    ctx.notes.push(`${alias}: ${recordsById.size} ${targetNode.label} via ${edge.id}`);

    // Verder cascaderen vanuit DEZELFDE objectreferenties, zodat kleinkinderen
    // automatisch bij elke ouder zichtbaar zijn die dat kind deelt.
    await runSteps(env, step.cascade, edge.to, [...recordsById.values()], ctx);
  }
}

/**
 * Voer een cascade-query uit.
 *
 * @param {Object} query - cascade-query (v2, zie cascade-models.js)
 * @param {Object} env - Cloudflare Worker environment
 * @param {Object} [options]
 * @param {boolean} [options.preview=false] - beperk het basismodel tot PREVIEW_LIMIT rijen
 * @param {number} [options.limitOverride] - harde limiet op het basismodel (bv. verify-modus)
 * @param {string} [options.orderOverride]
 * @returns {Promise<{records: Array<Object>, meta: Object}>}
 *
 * root.limit aanvaardt ook de tekst 'unlimited': dan wordt de node-eigen
 * maxRecords gebruikt in plaats van DEFAULT_ROOT_LIMIT. Dit is bewust geen
 * echte "geen limiet" (zie de waarschuwing bij DEFAULT_MAX_RECORDS_PER_STEP in
 * graph-nodes.js: nooit limit:false) -- het is de bestaande, al overal
 * afgedwongen bovengrens per model, nu ook bereikbaar als expliciete keuze i.p.v.
 * enkel als impliciet plafond.
 */
export async function executeCascade(query, env, options = {}) {
  const validation = validateCascadeQuery(query);
  if (!validation.is_valid) {
    throw new CascadeError(
      'Zoekopdracht is niet geldig: ' + validation.errors.map((e) => e.message).join('; '),
      'INVALID_QUERY',
      { validation_errors: validation.errors }
    );
  }

  const rootSpec = query.root;
  const node = getNode(rootSpec.node);
  const fields = resolveFields(rootSpec.node, rootSpec.fields);
  guardHeavyFields(node, fields, rootSpec, 'root');
  const stripHtmlFields = Array.isArray(rootSpec.strip_html_fields)
    ? rootSpec.strip_html_fields.filter((f) => fields.includes(f))
    : [];
  const selectionMaps = rootSpec.selection_maps && typeof rootSpec.selection_maps === 'object'
    ? rootSpec.selection_maps
    : {};

  const domain = buildDomain(node.baseDomain, rootSpec.filters, rootSpec.time_scope);

  const isUnlimited = rootSpec.limit === 'unlimited';
  const requested = typeof options.limitOverride === 'number'
    ? options.limitOverride
    : isUnlimited
      ? node.maxRecords
      : (typeof rootSpec.limit === 'number' && rootSpec.limit > 0 ? rootSpec.limit : DEFAULT_ROOT_LIMIT);
  const capped = Math.min(requested, node.maxRecords);
  const limit = options.preview === true ? Math.min(capped, PREVIEW_LIMIT) : capped;

  // Zonder expliciete order viel dit terug op Odoo's eigen volgorde (doorgaans
  // id oplopend) -- bij een afgekapte set kreeg de gebruiker dan stelselmatig
  // de OUDSTE records te zien i.p.v. de nieuwste, zonder dat duidelijk was
  // WAAROP er gesorteerd werd. `rootSpec.order` (zie cascade-models.js) laat de
  // gebruiker dat nu expliciet kiezen (id, een datumveld, ...); ontbreekt die
  // keuze, dan vallen we terug op het veld van de actieve time_scope-filter
  // (logisch: dat is het datumveld waar de gebruiker toch al op filtert), dan
  // het eerste gedeclareerde datumveld van de node, en anders id.
  const explicitOrder = rootSpec.order && rootSpec.order.field
    ? `${rootSpec.order.field} ${rootSpec.order.direction === 'asc' ? 'asc' : 'desc'}`
    : null;
  const timeScopeField = rootSpec.time_scope && rootSpec.time_scope.field;
  const primaryDateField = node.dateFields && node.dateFields[0] && node.dateFields[0].field;
  const fallbackOrder = `${timeScopeField || primaryDateField || 'id'} desc`;
  const order = options.orderOverride || explicitOrder || node.defaultOrder || fallbackOrder;

  const ctx = { steps: [], notes: [] };
  ctx.notes.push(`Basismodel ${node.label} (${node.model}) met ${domain.length} domain-condities, limiet ${limit}${isUnlimited ? ` (onbeperkt, begrensd op modelgrens ${node.maxRecords})` : ''}, sortering "${order}"`);

  const started = Date.now();
  let records = await searchRead(env, {
    model: node.model,
    domain,
    fields,
    limit: limit + 1,
    order
  });

  const truncated = records.length > limit;
  if (truncated) records = records.slice(0, limit);
  applyStripHtml(records, stripHtmlFields);
  applySelectionMap(records, selectionMaps);

  // Eén plek die de afkap-melding formuleert -- zowel de wizard
  // (public/semantic-wizard.js) als elke mini-app die deze query draait via
  // lib/mini-app-bridge.js#runSharedQuery() krijgen exact deze tekst mee in
  // meta.truncated_message, i.p.v. dat elke consument zijn eigen versie van
  // deze waarschuwing zou verzinnen (of, zoals voorheen, helemaal geen).
  const truncatedMessage = truncated
    ? `Er zijn meer dan ${limit} ${node.label.toLowerCase()} die aan deze filter voldoen — dit toont enkel de ${limit} meest recente${isUnlimited ? ` (de modelgrens van ${node.maxRecords})` : ''}. Verfijn je filter${isUnlimited ? '' : ', verhoog de limiet, of kies "onbeperkt"'} om meer te zien.`
    : null;

  ctx.notes.push(`Basismodel gaf ${records.length} records${truncated ? ' (afgekapt op de limiet)' : ''}`);

  await runSteps(env, query.cascade, rootSpec.node, records, ctx);

  // Altijd compacteren -- zie de toelichting bij compactValue() hierboven.
  // ctx.steps staat nu vast (runSteps() is klaar), dus de alias->nameField-kaart
  // dekt ook cascade-stappen op elk nesting-niveau.
  compactValue(records, buildAliasNameFieldMap(ctx));
  stripFieldPrefixes(records);
  omitFalseValues(records);

  return {
    records,
    meta: {
      version: 2,
      node: node.key,
      model: node.model,
      label: node.label,
      domain,
      // Zelfde korte namen als op de records zelf (na stripFieldPrefixes) --
      // dit is de canonieke "welke velden bestaan in deze query"-lijst,
      // onafhankelijk van of een specifiek veld toevallig op elk opgehaald
      // record false was. `fields` zelf (hierboven, gebruikt voor de Odoo-call)
      // blijft de RUWE namen bevatten, want zo heet het veld nu eenmaal in Odoo.
      fields: fields.map(stripKeyPrefix),
      count: records.length,
      truncated,
      truncated_message: truncatedMessage,
      limit,
      limit_mode: isUnlimited ? 'unlimited' : (typeof rootSpec.limit === 'number' && rootSpec.limit > 0 ? 'custom' : 'default'),
      order,
      execution_method: 'cascade',
      duration_ms: Date.now() - started,
      steps: ctx.steps,
      notes: ctx.notes
    }
  };
}
