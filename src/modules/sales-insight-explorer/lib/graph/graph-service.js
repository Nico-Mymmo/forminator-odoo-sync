/**
 * Graph-service — de graaf serialiseren voor de client
 *
 * De wizard (public/semantic-wizard.js) tekent de spiderweb en bepaalt de
 * mogelijke cascade-stappen uitsluitend op basis van wat hier uitkomt. Zo kan de
 * UI per definitie niets aanbieden dat de server niet kan uitvoeren -- het
 * omgekeerde van de oude situatie, waarin een hardcoded GRAPH_EDGES-kopie in de
 * client de spiderweb tekende terwijl de uitvoering langs 13 losse
 * enrichment-bestanden liep.
 *
 * @module modules/sales-insight-explorer/lib/graph/graph-service
 */

import { NODES } from './graph-nodes.js';
import { allEdges, edgesFrom } from './graph-edges.js';

/**
 * Serialiseerbare graaf voor de client.
 *
 * @returns {{nodes: Object, edges: Array<Object>, roots: Array<string>}}
 */
export function getGraph() {
  const nodes = {};
  for (const [key, node] of Object.entries(NODES)) {
    nodes[key] = {
      key,
      model: node.model,
      label: node.label,
      icon: node.icon,
      nameField: node.nameField,
      canBeRoot: node.canBeRoot === true,
      dateFields: node.dateFields || [],
      extraFilters: node.extraFilters || [],
      heavyFields: node.heavyFields || [],
      maxRecords: node.maxRecords
    };
  }

  return {
    version: 2,
    nodes,
    edges: allEdges(),
    roots: Object.keys(nodes).filter((k) => nodes[k].canBeRoot)
  };
}

/**
 * Mogelijke vervolgstappen vanuit een node, met uitsluiting van edges die al in
 * het pad zitten (een edge mag niet twee keer in hetzelfde pad).
 *
 * @param {string} nodeKey
 * @param {Array<string>} [usedEdgeIds]
 * @returns {Array<{id: string, to: string, label: string, as: string, cardinality: string, type: string}>}
 */
export function nextSteps(nodeKey, usedEdgeIds = []) {
  const used = new Set(usedEdgeIds);
  return edgesFrom(nodeKey)
    .filter((e) => !used.has(e.id))
    .map((e) => ({
      id: e.id,
      to: e.to,
      label: e.label,
      as: e.as,
      cardinality: e.cardinality,
      type: e.type
    }));
}
