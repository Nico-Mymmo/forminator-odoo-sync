/**
 * Mini-apps <-> Sales Insight Explorer bridge
 *
 * Read-only bridge that lets mini-apps (src/modules/mini-apps/) execute
 * saved Sales Insight Explorer queries, but ONLY queries an admin has
 * explicitly marked as `is_shared_mini_apps = true` (see migration
 * 20260731190000_sales_insight_queries_mini_apps_sharing.sql).
 *
 * Cross-module access in this repo always goes through direct lib
 * imports, never internal HTTP - src/modules/mini-apps/routes.js imports
 * this file directly.
 *
 * @module modules/sales-insight-explorer/lib/mini-app-bridge
 */

import { listQueries, getQueryById } from './query-repository.js';
import { executeQuery } from './query-executor.js';
import { getCachedSchema } from './schema-service.js';

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

/**
 * Substitute {{param.NAME}} placeholders inside a query_definition's
 * filters (top-level and inside relation traversals) with caller-supplied
 * values.
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
      return supplied[name];
    }
    if (declared.default !== undefined && declared.default !== null) {
      return declared.default;
    }
    throw new Error(`Missing required parameter: ${name}`);
  }

  function resolveFilters(filters) {
    if (!Array.isArray(filters)) return filters;
    return filters.map((filter) => ({ ...filter, value: resolveValue(filter.value) }));
  }

  const resolved = {
    ...queryDefinition,
    filters: resolveFilters(queryDefinition.filters)
  };

  if (Array.isArray(queryDefinition.relations)) {
    resolved.relations = queryDefinition.relations.map((relation) => ({
      ...relation,
      filters: resolveFilters(relation.filters)
    }));
  }

  return resolved;
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

  if (!savedQuery) {
    throw new Error(`Query not found: ${queryId}`);
  }

  if (!savedQuery.is_shared_mini_apps) {
    throw new Error('This query is not shared with mini-apps');
  }

  const allowedParams = Array.isArray(savedQuery.mini_app_parameters) ? savedQuery.mini_app_parameters : [];
  const resolvedDefinition = resolveQueryParameters(savedQuery.query_definition, params, allowedParams);

  const cached = await getCachedSchema(env);
  if (!cached || !cached.schema) {
    throw new Error('Schema not available. Please refresh the Sales Insight Explorer schema first.');
  }

  const { schema, capabilities } = cached;
  const preview = options.preview !== false;

  const result = await executeQuery(resolvedDefinition, schema, capabilities || {}, env, { preview });

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
