/**
 * Mini-app discovery — schema-verkenning voor een AI-gesprek
 *
 * Waarom dit bestaat: een mini-app wordt gebouwd/bijgewerkt in een APART
 * Claude-gesprek, buiten deze applicatie om. Tot nu toe werd daarvoor een
 * statische momentopname (veldnamen + een paar voorbeeldrijen) in de
 * gekopieerde prompt gebakken. Dat is fout zodra de query nadien wijzigt en
 * het schaalt niet naar "welke queries bestaan er eigenlijk?".
 *
 * In plaats daarvan geeft de prompt-generator nu een URL + een kortlevend
 * token mee, en vraagt het model de gegevens zelf op tijdens het gesprek.
 *
 * Grenzen van dit mechanisme (bewust smal):
 * - Enkel LEZEN, en enkel van queries die op het moment van de aanroep zowel
 *   gedeeld zijn met mini-apps (is_shared_mini_apps = true) ALS expliciet
 *   opengesteld voor AI-discovery (is_shared_ai = true) -- twee aparte
 *   vlaggen op sales_insight_queries: een query kan gedeeld zijn met
 *   mini-apps zonder in dit AI-gesprek zichtbaar te zijn. Een query die
 *   ondertussen niet meer gedeeld/AI-opengesteld/verwijderd is, is hier
 *   onmiddellijk onvindbaar.
 * - Het token is GEEN vervanging van de sessie waarmee een live mini-app
 *   echt data ophaalt: dat blijft window.platform.odoo.runQuery() met de
 *   sessie van de ingelogde gebruiker (zie ../../mini-apps/routes.js). Dit
 *   token ontsluit alleen het "hoe ziet deze query eruit"-deel.
 * - Geen schrijfpad: er is geen enkele functie in dit bestand die iets
 *   anders doet dan lezen (behalve het bijhouden van gebruik op het token
 *   zelf).
 *
 * @module modules/sales-insight-explorer/lib/mini-app-discovery
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { getQueryById } from './query-repository.js';
import { listSharedQueries, runSharedQuery } from './mini-app-bridge.js';
import { getNode, mandatoryFields } from './graph/graph-nodes.js';
import { getEdge } from './graph/graph-edges.js';

/** Geldigheidsduur van een discovery-token, in dagen. */
export const DISCOVERY_TOKEN_TTL_DAYS = 7;

/** Maximum aantal voorbeeldrijen dat een discovery-antwoord ooit teruggeeft. */
export const DISCOVERY_SAMPLE_LIMIT = 5;

/**
 * Maak een nieuw discovery-token voor een gebruiker.
 *
 * Eén token per aanroep (dus per keer dat iemand een bouw-/bijwerk-prompt
 * kopieert), niet per query: de scope is altijd "alle queries die NU gedeeld
 * zijn". Dat maakt intrekken eenvoudig (rij verwijderen) en voorkomt dat een
 * token blijft verwijzen naar een query die niet meer gedeeld is.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - Gebruiker die de prompt genereert
 * @param {Object} [options]
 * @param {number} [options.ttlDays=DISCOVERY_TOKEN_TTL_DAYS]
 * @returns {Promise<{token: string, expires_at: string}>}
 */
export async function createDiscoveryToken(env, userId, options = {}) {
  const supabase = getSupabaseClient(env);
  const ttlDays = options.ttlDays || DISCOVERY_TOKEN_TTL_DAYS;
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('mini_app_discovery_tokens')
    .insert({ token, created_by: userId || null, expires_at: expiresAt })
    .select('token, expires_at')
    .single();

  if (error) {
    console.error('[mini-app-discovery] token insert failed:', error.message);
    throw new Error(`Kon geen discovery-token aanmaken: ${error.message}`);
  }

  return { token: data.token, expires_at: data.expires_at };
}

/**
 * Valideer een discovery-token en registreer het gebruik.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} token
 * @returns {Promise<{valid: boolean, reason?: string, record?: Object}>}
 */
export async function validateDiscoveryToken(env, token) {
  if (!token || typeof token !== 'string' || token.length < 16) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('mini_app_discovery_tokens')
    .select('id, token, created_by, expires_at, use_count')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('[mini-app-discovery] token lookup failed:', error.message);
    return { valid: false, reason: 'LOOKUP_FAILED' };
  }
  if (!data) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  // Gebruik bijhouden is fire-and-forget: puur voor auditing, mag de
  // eigenlijke discovery-aanroep nooit doen falen.
  supabase
    .from('mini_app_discovery_tokens')
    .update({ last_used_at: new Date().toISOString(), use_count: (data.use_count || 0) + 1 })
    .eq('id', data.id)
    .then(({ error: updateError }) => {
      if (updateError) console.warn('[mini-app-discovery] token touch failed:', updateError.message);
    });

  return { valid: true, record: data };
}

/**
 * Leid de recordvorm af die deze query zal opleveren.
 *
 * Dit spiegelt de vorm die cascade-executor.js bouwt:
 * - velden van het basismodel staan als gewone sleutels op elk record
 *   (id + het naamveld van de node komen altijd mee);
 * - elke cascade-stap hangt onder zijn alias (`__...`): een array van
 *   gekoppelde records, of één object/null bij een many2one.
 *
 * Zo kan de discovery-lijst de exacte recordsleutels teruggeven ZONDER Odoo aan
 * te spreken. Wijzigt de vorm in cascade-executor.js, dan moet deze functie mee.
 *
 * @param {Object} queryDefinition - cascade-query (version 2)
 * @returns {{base_node: string|null, base_model: string|null, fields: Array<{key: string, model: string, field: string}>, cascade: Array<Object>, aggregations: Array<string>}}
 */
export function describeQueryFields(queryDefinition) {
  const def = queryDefinition || {};
  const rootSpec = def.root || {};
  const node = getNode(rootSpec.node);

  const effectiveFields = (nodeKey, requested) => {
    const out = [];
    const seen = new Set();
    for (const f of [...mandatoryFields(nodeKey), ...(Array.isArray(requested) ? requested : [])]) {
      if (typeof f !== 'string' || !f || seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
    return out;
  };

  const describeSteps = (steps) => {
    if (!Array.isArray(steps)) return [];
    const out = [];
    for (const step of steps) {
      const edge = getEdge(step && step.edge);
      if (!edge) continue;
      const targetNode = getNode(edge.to);
      out.push({
        key: step.as || edge.as,
        edge: edge.id,
        node: edge.to,
        model: targetNode ? targetNode.model : null,
        label: targetNode ? targetNode.label : edge.to,
        shape: edge.cardinality === 'one' ? 'object_or_null' : 'array',
        fields: effectiveFields(edge.to, step.fields),
        cascade: describeSteps(step.cascade)
      });
    }
    return out;
  };

  const fields = effectiveFields(rootSpec.node, rootSpec.fields).map((f) => ({
    key: f,
    model: node ? node.model : null,
    field: f
  }));

  return {
    base_node: rootSpec.node || null,
    base_model: node ? node.model : null,
    fields,
    cascade: describeSteps(def.cascade),
    aggregations: []
  };
}

/**
 * Beschrijf één gedeelde query voor discovery-doeleinden.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} queryId
 * @param {Object} [options]
 * @param {boolean} [options.sample=true] - Ook een klein live voorbeeldresultaat meegeven
 * @returns {Promise<Object|null>} null als de query niet bestaat of niet gedeeld is
 */
export async function describeSharedQuery(env, queryId, options = {}) {
  const saved = await getQueryById(env, queryId);
  if (!saved || !saved.is_shared_mini_apps || !saved.is_shared_ai) return null;

  const described = describeQueryFields(saved.query_definition);
  const { fields, cascade } = described;
  const parameters = Array.isArray(saved.mini_app_parameters) ? saved.mini_app_parameters : [];

  const payload = {
    id: saved.id,
    name: saved.name,
    description: saved.description || null,
    base_node: described.base_node,
    base_model: described.base_model || saved.base_model,
    record_fields: [...fields.map((f) => f.key), ...cascade.map((s) => s.key)],
    field_details: fields,
    cascade: cascade,
    parameters: parameters.map((p) => ({
      name: p.name,
      label: p.label || p.name,
      type: p.type || 'string',
      default: p.default === undefined ? null : p.default
    })),
    updated_at: saved.updated_at || null
  };

  if (options.sample === false) return payload;

  // Een echt voorbeeldresultaat is bewust toegestaan: het is exact wat een
  // model nodig heeft om geen veldnamen te verzinnen, het draait langs
  // runSharedQuery() (dus dezelfde read-only poort en dezelfde
  // is_shared_mini_apps-check als een live mini-app) en het aantal rijen is
  // hard begrensd. Mislukt het, dan is dat geen fout voor de discovery
  // zelf -- de structuur hierboven blijft bruikbaar.
  try {
    const result = await runSharedQuery(env, queryId, {}, { preview: true });
    const records = Array.isArray(result.records) ? result.records : [];
    payload.sample_records = records.slice(0, DISCOVERY_SAMPLE_LIMIT);
    payload.sample_record_count = payload.sample_records.length;
    if (records.length > 0) {
      payload.record_fields_observed = Object.keys(records[0]);
    }
  } catch (err) {
    payload.sample_error = err.message;
  }

  return payload;
}

/**
 * Beschrijf alle gedeelde queries (structuur, geen voorbeeldrijen).
 *
 * Geen voorbeeldrijen hier: dat zou N Odoo-aanroepen betekenen voor één
 * discovery-call. Een model dat een voorbeeld wil, vraagt daarna de
 * detail-endpoint van de query die het effectief gaat gebruiken op.
 *
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Array<Object>>}
 */
export async function describeAllSharedQueries(env) {
  const shared = await listSharedQueries(env);
  const out = [];
  for (const summary of shared) {
    const described = await describeSharedQuery(env, summary.id, { sample: false });
    if (described) out.push(described);
  }
  return out;
}
