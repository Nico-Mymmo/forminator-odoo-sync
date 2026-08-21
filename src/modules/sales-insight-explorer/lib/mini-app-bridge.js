/**
 * Mini-apps <-> Sales Insight Explorer bridge
 *
 * Read-only bridge that lets mini-apps (src/modules/mini-apps/) execute
 * saved Sales Insight Explorer queries, but ONLY queries marked as
 * `is_shared_mini_apps = true`.
 *
 * Zo'n rij wordt niet apart beheerd: ze is een AFGELEIDE van een opgeslagen
 * zoekopdracht waarbij de gebruiker in de opslaan-flow van de wizard
 * "Ook beschikbaar voor mini-apps" heeft aangevinkt. Zie
 * lib/saved-search-sharing.js (de enige plek die zulke rijen aanmaakt,
 * bijwerkt en verwijdert) en migratie
 * 20260803090000_saved_search_mini_apps_sharing.sql.
 *
 * Cross-module access in this repo always goes through direct lib
 * imports, never internal HTTP - src/modules/mini-apps/routes.js imports
 * this file directly.
 *
 * @module modules/sales-insight-explorer/lib/mini-app-bridge
 */

import { listQueries, getQueryById } from './query-repository.js';
import { executeCascade } from './graph/cascade-executor.js';
import { isCascadeQuery } from './graph/cascade-models.js';

/**
 * List queries shared with mini-apps.
 *
 * Returns summaries only (no query_definition) plus the declared
 * mini_app_parameters, so a mini-app can build a small form/UI for them
 * without ever seeing the underlying filters/relations.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Array<{id: string, name: string, description: string, base_model: string, parameters: Array}>>}
 */
export async function listSharedQueries(env) {
  const queries = await listQueries(env, { is_shared_mini_apps: true, limit: 200 });
  return queries
    .filter((q) => q.is_shared_mini_apps === true)
    .map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      base_model: q.base_model,
      parameters: Array.isArray(q.mini_app_parameters) ? q.mini_app_parameters : []
    }));
}

const PLACEHOLDER_PATTERN = /^\{\{param\.([a-zA-Z0-9_]+)\}\}$/;

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERN.test(value);
}

/**
 * Auto-detect which parts of a query_definition should become mini-app
 * parameters, and rewrite the query in place to use {{param.NAME}}
 * placeholders for them. Dit draait bij ELKE save van een gedeelde
 * zoekopdracht (zie lib/saved-search-sharing.js) en is bewust
 * deterministisch: dezelfde zoekopdracht levert altijd dezelfde parameters
 * op. Er is geen handmatige bijstuur-UI meer -- het vroegere tekstvak met
 * "naam|label"-regels is samen met het aparte beheerscherm verdwenen.
 *
 * Heuristics (deliberately conservative - only touches things that look
 * unambiguous; leaves everything else exactly as saved):
 * - A top-level boolean filter whose field name suggests active/status
 *   (e.g. x_active) becomes an "in"-filter parametrized as
 *   {{param.status_<field>}}, with the ORIGINAL value wrapped in an array
 *   as default -- "in" (rather than "=") is what lets a mini-app later
 *   send [true, false] for "alle" without changing the operator again.
 * - ANY time_scope (relative periode, "vanaf datum" of een eigen bereik --
 *   mode 'relative' of 'absolute', maakt niet uit) wordt in zijn geheel
 *   vervangen door {{param.periode}} (type 'period_override'). Zonder
 *   override blijft het ORIGINELE time_scope-object gelden (de `default`);
 *   met override bouwt resolveQueryParameters() een nieuw time_scope-object
 *   met het oorspronkelijke datumveld + wat de mini-app doorgeeft (een
 *   period-enum-string als kortere notatie, of een volledig object).
 * - A numeric top-level `limit` becomes {{param.aantal}}.
 *
 * These generated names/types (status_* + boolean_or_all, periode +
 * period_override, aantal + number) are intentionally the same ones
 * public/odoo-query-verkenner.html's detectParamKind() already recognizes
 * to render a dedicated dropdown/number field instead of a plain text box
 * -- keep both in sync if either changes.
 *
 * @param {Object} queryDefinition - QueryDefinition to analyze (not mutated)
 * @returns {{query_definition: Object, parameters: Array}}
 */
export function autoDetectMiniAppParameters(queryDefinition) {
  const cloned = JSON.parse(JSON.stringify(queryDefinition || {}));
  const parameters = [];

  // In de cascade-vorm (version 2) zitten de basisfilters, de periode en de
  // limiet onder `root`. De detectie kijkt bewust ALLEEN naar dat basisniveau:
  // de periode en de status van het BASISMODEL zijn wat een mini-app moet
  // kunnen overrulen; filters diep in een cascade-stap horen bij de zoekopdracht
  // zelf en blijven vastliggen zoals de auteur ze bewaarde.
  const target = cloned && cloned.root && typeof cloned.root === 'object' ? cloned.root : cloned;

  if (Array.isArray(target.filters)) {
    target.filters = target.filters.map((filter) => {
      if (isPlaceholder(filter.value)) return filter;
      const looksLikeStatus = /activ|status/i.test(filter.field || '') && typeof filter.value === 'boolean';
      if (!looksLikeStatus) return filter;

      const paramName = 'status_' + String(filter.field).replace(/[^a-zA-Z0-9_]/g, '');
      parameters.push({
        name: paramName,
        label: 'Status (' + filter.field + ')',
        type: 'boolean_or_all',
        default: [filter.value]
      });
      return { ...filter, operator: 'in', value: `{{param.${paramName}}}` };
    });
  }

  // Periode-override: dit dekt bewust ELK time_scope, niet enkel een
  // relatieve periode -- of de zoekopdracht nu met een snelle keuze,
  // "vanaf datum" of een eigen bereik is opgeslagen (mode 'relative' of
  // 'absolute'), een mini-app moet de periode altijd zelf kunnen overrulen.
  // Zonder dit zou een mini-app voor altijd vastzitten aan de datums die
  // toevallig geldig waren op het moment van opslaan -- net het probleem dat
  // al eerder is vastgesteld bij de vast-tijdstip-taken in mini-apps
  // (zie CLAUDE.md, "dag-context"-uitzondering).
  //
  // Het hele time_scope-object wordt vervangen door één placeholder; de
  // parameter onthoudt zelf het oorspronkelijke datumveld (`field`) zodat
  // een mini-app enkel de periode moet doorgeven, niet het veld. Zonder
  // override valt resolveQueryParameters() terug op `default`, het
  // ORIGINELE time_scope-object -- dus ongewijzigd gedrag als er niet
  // overruled wordt.
  if (target.time_scope && typeof target.time_scope === 'object' && !isPlaceholder(target.time_scope)) {
    parameters.push({
      name: 'periode',
      label: 'Periode',
      type: 'period_override',
      field: target.time_scope.field,
      default: target.time_scope
    });
    target.time_scope = '{{param.periode}}';
  }

  if (typeof target.limit === 'number') {
    parameters.push({ name: 'aantal', label: 'Aantal records', type: 'number', default: target.limit });
    target.limit = '{{param.aantal}}';
  }

  return { query_definition: cloned, parameters };
}

/**
 * Substitute {{param.NAME}} placeholders ANYWHERE inside a query_definition
 * (filters, relations, time_scope, limit, ...) with caller-supplied values.
 *
 * Deliberately generic: rather than special-casing "filters" and
 * "relations[].filters" only, this walks the whole query_definition tree
 * (arrays and plain objects) and replaces any string value that is
 * EXACTLY "{{param.NAME}}" -- so the same mechanism that parametrizes a
 * filter value also works for e.g. query.limit (a "last N records" test
 * control) or query.time_scope.period/relative_amount (a period picker),
 * with no extra code per field. A value that merely CONTAINS a placeholder
 * (not an exact match) is left untouched -- no partial string interpolation.
 *
 * Only names present in `allowedParams` (the query's own
 * mini_app_parameters whitelist) may be substituted - an unknown
 * placeholder, an unsupplied param without a default, or a param the
 * caller supplied but the query never declared, all throw. A mini-app can
 * therefore never smuggle an arbitrary Odoo domain value through this
 * path; it can only fill in the blanks the query's author explicitly
 * allowed.
 *
 * @param {Object} queryDefinition - QueryDefinition (see query-models.js)
 * @param {Object} params - Caller-supplied parameter values, keyed by name
 * @param {Array<{name: string, default?: *}>} allowedParams - Declared mini_app_parameters
 * @returns {Object} A new query_definition with placeholders resolved
 */
export function resolveQueryParameters(queryDefinition, params, allowedParams) {
  const declaredList = Array.isArray(allowedParams) ? allowedParams : [];
  const declaredByName = new Map(declaredList.map((p) => [p.name, p]));
  const supplied = params && typeof params === 'object' ? params : {};

  for (const key of Object.keys(supplied)) {
    if (!declaredByName.has(key)) {
      throw new Error(`Unknown parameter: ${key}`);
    }
  }

  const placeholderPattern = /^\{\{param\.([a-zA-Z0-9_]+)\}\}$/;

  function resolveValue(value) {
    if (typeof value !== 'string') return value;
    const match = value.match(placeholderPattern);
    if (!match) return value;

    const name = match[1];
    const declared = declaredByName.get(name);
    if (!declared) {
      throw new Error(`Query references undeclared parameter: ${name}`);
    }
    if (Object.prototype.hasOwnProperty.call(supplied, name)) {
      const suppliedValue = supplied[name];
      // period_override is het enige parametertype dat een heel object (of
      // een korte string-notatie) mag doorgeven i.p.v. één scalaire waarde --
      // zie de doc-comment bij autoDetectMiniAppParameters(). `field` komt
      // altijd van de parameter-declaratie, nooit van de aanroeper: zo kan
      // een mini-app de periode overrulen zonder het onderliggende datumveld
      // te moeten kennen of te kunnen wijzigen.
      if (declared.type === 'period_override') {
        const overrideBody = typeof suppliedValue === 'string'
          ? { mode: 'relative', period: suppliedValue }
          : suppliedValue;
        if (overrideBody && typeof overrideBody === 'object' && !Array.isArray(overrideBody)) {
          return { ...overrideBody, field: declared.field };
        }
      }
      return suppliedValue;
    }
    if (declared.default !== undefined && declared.default !== null) {
      return declared.default;
    }
    throw new Error(`Missing required parameter: ${name}`);
  }

  function resolveDeep(node) {
    if (Array.isArray(node)) {
      return node.map(resolveDeep);
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const key of Object.keys(node)) {
        out[key] = resolveDeep(node[key]);
      }
      return out;
    }
    return resolveValue(node);
  }

  return resolveDeep(queryDefinition);
}

/**
 * Run a saved query on behalf of a mini-app.
 *
 * Refuses to run unless the query is marked is_shared_mini_apps = true -
 * this is the single enforcement point for the whole feature; every
 * route that lets a mini-app touch Odoo data must go through this
 * function rather than calling executeQuery()/query-repository.js
 * directly. Read-only: this only ever calls executeQuery(), never a
 * write path.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} queryId - Saved query UUID
 * @param {Object} [params] - Values for the query's declared mini_app_parameters
 * @param {Object} [options]
 * @param {boolean} [options.preview=true] - Defaults to preview (limited rows) for mini-apps
 * @returns {Promise<{records: Array, meta: Object, query_info: Object}>}
 */
export async function runSharedQuery(env, queryId, params = {}, options = {}) {
  const savedQuery = await getQueryById(env, queryId);

  // Eén onderscheidbare fout voor beide gevallen "bestaat niet meer" en "niet
  // langer gedeeld": een mini-app moet die twee niet kunnen onderscheiden (dat
  // zou vertellen dat er een query met dat id bestaat), en de fallback in de
  // app is in beide gevallen dezelfde melding. De code QUERY_NOT_AVAILABLE
  // maakt het wel onderscheidbaar van een gewone uitvoeringsfout -- zie de
  // verplichte fallback-patronen in odooDiscoveryPromptSection()
  // (public/mini-apps-core.js).
  if (!savedQuery || !savedQuery.is_shared_mini_apps) {
    const err = new Error('Deze query is niet meer beschikbaar voor mini-apps (verwijderd of niet langer gedeeld).');
    err.code = 'QUERY_NOT_AVAILABLE';
    throw err;
  }

  const allowedParams = Array.isArray(savedQuery.mini_app_parameters) ? savedQuery.mini_app_parameters : [];
  const resolvedDefinition = resolveQueryParameters(savedQuery.query_definition, params, allowedParams);

  // Een oude, niet-cascade definitie kan niet meer uitgevoerd worden. Bewust
  // dezelfde onderscheidbare code als "niet meer gedeeld": voor de mini-app is
  // het resultaat hetzelfde (deze query is niet beschikbaar) en de verplichte
  // fallback in de app is identiek. De eigenaar moet de zoekopdracht opnieuw
  // bewaren in de wizard.
  if (!isCascadeQuery(resolvedDefinition)) {
    const err = new Error('Deze query heeft een verouderde vorm en moet opnieuw bewaard worden in Sales Insight Explorer.');
    err.code = 'QUERY_NOT_AVAILABLE';
    throw err;
  }

  // ÉÉN motor voor wizard en mini-apps: executeCascade() is letterlijk dezelfde
  // functie die routes.js#runSemanticQuery aanroept. Er is geen tweede
  // uitvoeringspad meer waarin een mini-app stil enrichments zou missen.
  const preview = options.preview !== false;
  /* offset: laat een mini-app een grote set in stukken ophalen (zie
     meta.has_more/meta.next_offset in cascade-executor.js). Bewust GEEN
     mini_app_parameter: het is geen eigenschap van de bewaarde zoekopdracht
     maar van de manier waarop een app ze uitvoert -- de query zelf, haar
     filters en haar limiet blijven exact zoals de auteur ze bewaarde. */
  const offset = Number.isFinite(options.offset) && options.offset > 0 ? Math.floor(options.offset) : 0;
  const result = await executeCascade(resolvedDefinition, env, { preview, offset });

  return {
    records: result.records,
    meta: result.meta,
    query_info: {
      id: savedQuery.id,
      name: savedQuery.name,
      description: savedQuery.description
    }
  };
}
