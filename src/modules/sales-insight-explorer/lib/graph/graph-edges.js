/**
 * Graaf-edges — hoe de nodes aan elkaar hangen
 *
 * Elke koppeling wordt hier ÉÉN keer gedeclareerd; de tegenrichting wordt
 * automatisch afgeleid. Dat is het hele punt van dit bestand: vroeger stond
 * dezelfde relatie op drie plekken (GRAPH_EDGES en RELATION_META in
 * semantic-wizard.js, plus het bijhorende enrichment-bestand) met onderling
 * afwijkende veldnamen en types -- en nergens werd die declaratie gebruikt om
 * de query effectief uit te voeren.
 *
 * Vier soorten koppelingen, alle vier uitgevoerd door dezelfde traversal-code
 * in cascade-executor.js:
 *
 *  1. `relation`    — een echte Odoo-relatie. `field` leeft ALTIJD op het
 *                     `from`-model. Dat laatste is precies wat de oude
 *                     generieke motor fout deed: die zocht bij many2one op
 *                     `id in <bron-id's>` in plaats van op de FK-WAARDEN die
 *                     in de bronrecords staan.
 *  2. `value_match`  — join op veldwaarde i.p.v. FK, voor het geval waar Odoo
 *                     geen relatie heeft: x_web_visitor heeft alleen een char
 *                     `x_studio_email`, geen partner-FK. Dit behoudt exact het
 *                     gedrag van de oude visitor-partner-enrichment.
 *  3. `mail`         — het standaard Odoo-patroon (`model`/`res_model` +
 *                     `res_id`) voor chatter en activiteiten. Wordt automatisch
 *                     voor elke data-node gegenereerd; geen 10 losse
 *                     declaraties meer.
 *  4. `composite`    — een edge die uit bestaande hops bestaat, voor een
 *                     koppeling die in Odoo niet direct bestaat maar
 *                     ondubbelzinnig is. Concreet één geval: crm.lead.partner_id
 *                     wijst naar de CONTACTPERSOON, nooit naar de company, dus
 *                     "lead -> gebouw/VME" loopt via `commercial_partner_id`
 *                     van die contactpersoon. Dat is exact wat de oude
 *                     partner-lead-enrichment deed met het dotted domain
 *                     `partner_id.commercial_partner_id`.
 *
 * BEWUST GEEN edge touchpoint -> contactpersoon: die verbinding bestaat niet en
 * loopt over de visitor. Een touchpoint is ook nooit een vertrekpunt, dus een
 * gebruiker start bij de web visitor en haalt daar twee losse takken op: de
 * contactpersonen (via het e-mailadres) en de touchpoints.
 *
 * @module modules/sales-insight-explorer/lib/graph/graph-edges
 */

import { NODES } from './graph-nodes.js';

/** Nodes die via het mail-patroon aan elke data-node hangen. */
const MAIL_NODES = [
  { node: 'mail.message', resModelField: 'model', as: '__chatter', label: 'Chatter' },
  { node: 'mail.activity', resModelField: 'res_model', as: '__activities', label: 'Activiteiten' }
];

/** Data-nodes die chatter/activiteiten hebben (alles behalve de mail-nodes zelf). */
const MAIL_ENABLED_NODES = [
  'x_sales_action_sheet',
  'crm.lead',
  'res.partner',
  'res.partner:contact',
  'x_web_visitor',
  'x_ad_touchpoint',
  'x_estate_stats'
];

/**
 * Handmatig gedeclareerde koppelingen. `field` leeft op `from`.
 *
 * `as` / `inverseAs` bepalen onder welke sleutel de gekoppelde records in het
 * resultaat hangen (altijd met `__`-prefix). Die namen zijn met opzet dezelfde
 * als de sleutels die de oude enrichments gebruikten, zodat bestaande
 * mini-apps en de verify-export in de wizard hun weg blijven vinden.
 */
export const DECLARED_EDGES = [
  {
    from: 'x_ad_touchpoint',
    to: 'x_web_visitor',
    kind: 'relation',
    type: 'many2one',
    field: 'x_studio_visitor',
    label: 'Bezoeker',
    as: '__visitor',
    inverseLabel: 'Ad Touchpoints',
    inverseAs: '__touchpoints'
  },
  {
    from: 'x_web_visitor',
    to: 'crm.lead',
    kind: 'relation',
    type: 'many2many',
    field: 'x_studio_lead_ids',
    label: 'Leads',
    as: '__leads',
    inverseLabel: 'Web Visitors',
    inverseAs: '__visitors'
  },
  {
    from: 'x_sales_action_sheet',
    to: 'crm.lead',
    kind: 'relation',
    type: 'many2many',
    field: 'x_studio_as_opportunity_ids',
    label: 'Gekoppelde Leads',
    as: '__leads',
    inverseLabel: 'Actiebladen',
    inverseAs: '__actiebladen'
  },
  {
    from: 'x_sales_action_sheet',
    to: 'res.partner',
    kind: 'relation',
    type: 'many2one',
    field: 'x_studio_for_company_id',
    label: 'Gebouw',
    as: '__gebouw',
    inverseLabel: 'Actiebladen',
    inverseAs: '__actiebladen'
  },
  {
    from: 'x_sales_action_sheet',
    to: 'res.partner:contact',
    kind: 'relation',
    type: 'many2one',
    field: 'x_studio_contact_id',
    label: 'Contactpersoon',
    as: '__contactpersoon',
    inverseLabel: 'Actiebladen',
    inverseAs: '__actiebladen'
  },
  {
    from: 'crm.lead',
    to: 'res.partner:contact',
    kind: 'relation',
    type: 'many2one',
    field: 'partner_id',
    label: 'Contactpersoon',
    as: '__contactpersoon',
    inverseLabel: 'Leads',
    inverseAs: '__leads'
  },
  {
    from: 'res.partner:contact',
    to: 'res.partner',
    kind: 'relation',
    type: 'many2one',
    field: 'commercial_partner_id',
    label: 'Gebouw / VME',
    as: '__gebouw',
    inverseLabel: 'Contactpersonen',
    inverseAs: '__contactpersonen'
  },
  {
    from: 'x_web_visitor',
    to: 'res.partner:contact',
    kind: 'value_match',
    type: 'value_match',
    match: { fromField: 'x_studio_email', toField: 'email', normalize: 'email' },
    label: 'Contactpersonen (via e-mailadres)',
    as: '__contactpersonen',
    inverseLabel: 'Web Visitors (via e-mailadres)',
    inverseAs: '__visitors'
  },
  {
    // crm.lead.partner_id wijst naar de contactpersoon, niet naar de company.
    // Deze samengestelde edge maakt "lead -> gebouw" één keuze voor de
    // gebruiker, uitgevoerd als twee gewone hops.
    from: 'crm.lead',
    to: 'res.partner',
    kind: 'composite',
    via: ['crm.lead>res.partner:contact', 'res.partner:contact>res.partner'],
    label: 'Gebouw / VME (via contactpersoon)',
    as: '__gebouwen',
    inverseLabel: 'Leads (via contactpersoon)',
    inverseAs: '__leads'
  },
  {
    from: 'x_estate_stats',
    to: 'res.partner',
    kind: 'relation',
    type: 'many2one',
    field: 'x_studio_estate_id',
    label: 'Gebouw / VME',
    as: '__gebouw',
    inverseLabel: 'Gebouwstatistieken',
    inverseAs: '__estate_stats'
  },
  {
    // Vaste checklist ("many2many_checkboxes" in Odoo): welke verwachtingen
    // zijn aangevinkt op dit actieblad. Los van de root-veldkeuze declareren
    // als edge levert de x_name's van de aangevinkte rijen op i.p.v. de kale
    // id-array die je krijgt door x_studio_as_expectations rechtstreeks als
    // root-veld te kiezen.
    from: 'x_sales_action_sheet',
    to: 'x_as_expectations',
    kind: 'relation',
    type: 'many2many',
    field: 'x_studio_as_expectations',
    label: 'Verwachtingen',
    as: '__verwachtingen',
    inverseLabel: 'Actiebladen',
    inverseAs: '__actiebladen'
  }
];

/** @param {string} from @param {string} to @returns {string} */
export function edgeId(from, to) {
  return `${from}>${to}`;
}

function invertRelationType(type) {
  if (type === 'many2one') return 'one2many';
  if (type === 'one2many') return 'many2one';
  return type;
}

/**
 * Bouw de volledige edge-index: gedeclareerde edges, hun automatisch afgeleide
 * tegenrichting, en de gegenereerde mail-edges.
 *
 * Een "resolved" edge is wat cascade-executor.js consumeert:
 *
 *   {
 *     id, from, to, as, label,
 *     mode: 'fk_forward' | 'fk_reverse' | 'match_forward' | 'match_reverse' | 'mail',
 *     field?, match?, type, cardinality: 'one' | 'many',
 *     hops?: [resolved edge, ...]   // enkel bij een samengestelde edge
 *   }
 *
 * @returns {Map<string, Object>}
 */
function buildEdgeIndex() {
  const index = new Map();

  for (const decl of DECLARED_EDGES) {
    if (decl.kind === 'composite') continue; // in tweede ronde, hops moeten bestaan

    if (decl.kind === 'relation') {
      index.set(edgeId(decl.from, decl.to), {
        id: edgeId(decl.from, decl.to),
        from: decl.from,
        to: decl.to,
        as: decl.as,
        label: decl.label,
        mode: 'fk_forward',
        field: decl.field,
        type: decl.type,
        // Het type zoals het veld op zijn EIGEN model bestaat -- bepaalt hoe de
        // waarde gelezen moet worden ([id, "naam"] bij many2one, [id, ...] bij x2many).
        fieldType: decl.type,
        // Alleen een many2one levert per bronrecord maximaal één doelrecord op.
        cardinality: decl.type === 'many2one' ? 'one' : 'many'
      });
      index.set(edgeId(decl.to, decl.from), {
        id: edgeId(decl.to, decl.from),
        from: decl.to,
        to: decl.from,
        as: decl.inverseAs,
        label: decl.inverseLabel,
        mode: 'fk_reverse',
        field: decl.field,
        type: invertRelationType(decl.type),
        // Het veld leeft op het doelmodel van deze richting en houdt daar zijn
        // oorspronkelijke type.
        fieldType: decl.type,
        cardinality: 'many'
      });
      continue;
    }

    if (decl.kind === 'value_match') {
      index.set(edgeId(decl.from, decl.to), {
        id: edgeId(decl.from, decl.to),
        from: decl.from,
        to: decl.to,
        as: decl.as,
        label: decl.label,
        mode: 'match_forward',
        match: decl.match,
        type: 'value_match',
        cardinality: 'many'
      });
      index.set(edgeId(decl.to, decl.from), {
        id: edgeId(decl.to, decl.from),
        from: decl.to,
        to: decl.from,
        as: decl.inverseAs,
        label: decl.inverseLabel,
        mode: 'match_reverse',
        match: decl.match,
        type: 'value_match',
        cardinality: 'many'
      });
    }
  }

  // Mail-edges: één patroon, automatisch voor elke data-node.
  for (const nodeKey of MAIL_ENABLED_NODES) {
    const node = NODES[nodeKey];
    if (!node) continue;
    for (const mail of MAIL_NODES) {
      index.set(edgeId(nodeKey, mail.node), {
        id: edgeId(nodeKey, mail.node),
        from: nodeKey,
        to: mail.node,
        as: mail.as,
        label: mail.label,
        mode: 'mail',
        resModelField: mail.resModelField,
        type: 'one2many',
        cardinality: 'many'
      });
    }
  }

  // Samengestelde edges: pas nu, want de hops moeten bestaan.
  for (const decl of DECLARED_EDGES) {
    if (decl.kind !== 'composite') continue;

    const hops = decl.via.map((hopId) => {
      const hop = index.get(hopId);
      if (!hop) throw new Error(`Samengestelde edge verwijst naar onbekende hop: ${hopId}`);
      return hop;
    });
    const inverseHops = [...decl.via].reverse().map((hopId) => {
      const hop = index.get(hopId);
      const inverseId = edgeId(hop.to, hop.from);
      const inverse = index.get(inverseId);
      if (!inverse) throw new Error(`Samengestelde edge mist tegenrichting voor hop: ${hopId}`);
      return inverse;
    });

    const cardinality = hops.every((h) => h.cardinality === 'one') ? 'one' : 'many';

    index.set(edgeId(decl.from, decl.to), {
      id: edgeId(decl.from, decl.to),
      from: decl.from,
      to: decl.to,
      as: decl.as,
      label: decl.label,
      mode: 'composite',
      type: 'composite',
      cardinality,
      hops
    });
    index.set(edgeId(decl.to, decl.from), {
      id: edgeId(decl.to, decl.from),
      from: decl.to,
      to: decl.from,
      as: decl.inverseAs,
      label: decl.inverseLabel,
      mode: 'composite',
      type: 'composite',
      cardinality: inverseHops.every((h) => h.cardinality === 'one') ? 'one' : 'many',
      hops: inverseHops
    });
  }

  return index;
}

const EDGE_INDEX = buildEdgeIndex();

/**
 * @param {string} id - `${fromNode}>${toNode}`
 * @returns {Object|null}
 */
export function getEdge(id) {
  return EDGE_INDEX.get(id) || null;
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {Object|null}
 */
export function findEdge(from, to) {
  return EDGE_INDEX.get(edgeId(from, to)) || null;
}

/**
 * Alle edges die vanuit een node vertrekken -- dit is wat de wizard nodig heeft
 * om te tonen welke vervolgstappen mogelijk zijn.
 *
 * @param {string} nodeKey
 * @returns {Array<Object>}
 */
export function edgesFrom(nodeKey) {
  return [...EDGE_INDEX.values()].filter((e) => e.from === nodeKey);
}

/**
 * Volledige, serialiseerbare edge-lijst voor de client.
 * @returns {Array<Object>}
 */
export function allEdges() {
  return [...EDGE_INDEX.values()].map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    as: e.as,
    label: e.label,
    type: e.type,
    cardinality: e.cardinality
  }));
}
