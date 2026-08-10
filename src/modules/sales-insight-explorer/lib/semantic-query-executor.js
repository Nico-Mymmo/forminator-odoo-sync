/**
 * Semantic query executor — de ECHTE motor achter de wizard
 *
 * Geëxtraheerd uit routes.js#runSemanticQuery() (de handler achter
 * POST /api/sales-insights/semantic/run, wat de wizard gebruikt bij elke
 * "Uitvoeren"/"Preview"). Pure functie, geen HTTP: geeft { records, ... }
 * terug of gooit een SemanticQueryError met een `.code` (dezelfde codes als
 * de oude inline Response-objecten: INVALID_LEAD_RELATION, INVALID_LEAD_FIELD,
 * MISSING_BASE_MODEL, QUERY_TOO_BROAD, SECONDARY_QUERY_TRUNCATED).
 *
 * WAAROM dit een apart bestand is: mini-apps mogen een gedeelde zoekopdracht
 * exact zo uitvoeren als de wizard dat zelf doet -- inclusief alle 12+
 * enrichment-stappen (lead/chatter/activity/partner/visitor/touchpoint, ...)
 * die het GENERIEKE query-executor.js (relations/aggregations) niet kent.
 * Voorheen liep mini-app-uitvoering via dat generieke systeem, waardoor
 * enrichment-velden stilzwijgend werden weggelaten. Nu roepen zowel de
 * live-wizard-route (routes.js#runSemanticQuery, dunne HTTP-wrapper) als
 * mini-app-bridge.js#runSharedQuery() DEZELFDE functie hieronder aan -- één
 * uitvoeringsmotor, geen twee losse implementaties die uit sync kunnen lopen.
 *
 * @module modules/sales-insight-explorer/lib/semantic-query-executor
 */

import { searchRead } from '../../../lib/odoo.js';
import { translateTimeScope } from './odoo-domain-translator.js';
import { enrichWithLeads } from './lead-enrichment.js';
import { enrichWithChatter } from './chatter-enrichment.js';
import { enrichWithActivities } from './activity-enrichment.js';
import { enrichPartnersWithLeads } from './partner-lead-enrichment.js';
import { enrichPartnersWithActionSheets } from './partner-actionsheet-enrichment.js';
import { enrichVisitorsWithTouchpoints } from './visitor-touchpoint-enrichment.js';
import { enrichVisitorsWithLeads as enrichVisitorsWithLeadsFn } from './visitor-lead-enrichment.js';
import { enrichTouchpointsWithVisitor } from './touchpoint-visitor-enrichment.js';
import { enrichActiesheetsWithPartner } from './actionsheet-partner-enrichment.js';
import { enrichLeadsWithPartner } from './lead-partner-enrichment.js';
import { enrichLeadsWithActionSheets } from './lead-actionsheet-enrichment.js';
import { enrichLeadsWithVisitors } from './lead-visitor-enrichment.js';
import { enrichVisitorsWithPartner } from './visitor-partner-enrichment.js';

export class SemanticQueryError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * Voer een semantisch wizard-payload uit (zelfde vorm als
 * wizardState.buildPayload()/buildShareablePayload() in semantic-wizard.js).
 *
 * @param {Object} payload - base_model, fields, filters, time_scope, en/of
 *        enrichment-vlaggen (lead_enrichment, visitor_touchpoint_enrichment, ...)
 * @param {Object} env - Cloudflare Worker environment
 * @param {Object} [options]
 * @param {boolean} [options.isVerifyMode=false] - limit 25 + id desc i.p.v. alles
 * @returns {Promise<{records: Array, model: string, domain: Array, fields: Array<string>, notes: Array<string>, metas: Object}>}
 * @throws {SemanticQueryError}
 */
export async function executeSemanticPayload(payload, env, options = {}) {
  const isVerifyMode = options.isVerifyMode === true || payload._verify_mode === true;

  // STEP 1: Validate no forbidden lead relations (BLOCKER)
  if (payload.base_model === 'x_sales_action_sheet') {
    if (payload.relations && Array.isArray(payload.relations)) {
      for (const relation of payload.relations) {
        if (relation.path) {
          for (const step of relation.path) {
            if (step.target_model === 'crm.lead') {
              throw new SemanticQueryError(
                'Relations to crm.lead are not allowed. Use lead_enrichment instead.',
                'INVALID_LEAD_RELATION',
                { explanation: 'x_sales_action_sheet.lead_id does not exist. Use two-phase lead enrichment.',
                  hint: 'Enable lead enrichment in the wizard instead of using relations.' }
              );
            }
          }
        }
      }
    }

    if (payload.fields && Array.isArray(payload.fields)) {
      for (const field of payload.fields) {
        if (typeof field === 'object' && (field.model === 'lead' || field.model === 'crm.lead')) {
          throw new SemanticQueryError(
            'Fields with model "lead" or "crm.lead" are not allowed. Use lead_enrichment instead.',
            'INVALID_LEAD_FIELD',
            { explanation: 'Lead fields cannot be fetched via relations. Use two-phase lead enrichment.',
              hint: 'Enable lead enrichment in the wizard to fetch lead data.' }
          );
        }
      }
    }
  }

  // STEP 2: Extract base model
  const model = payload.base_model;
  if (!model) {
    throw new SemanticQueryError('Missing required field: base_model', 'MISSING_BASE_MODEL');
  }

  // STEP 3: Extract fields (default to ['id'] if empty)
  let fields;
  if (Array.isArray(payload.fields) && payload.fields.length > 0) {
    if (typeof payload.fields[0] === 'object' && payload.fields[0].field) {
      fields = payload.fields
        .filter((f) => f.model === model)
        .map((f) => f.field);
    } else {
      fields = payload.fields;
    }
  } else {
    fields = ['id'];
  }

  // Guard: verwijder duidelijk verkeerde veldnamen vóór de Odoo-call.
  const seenFields = new Set();
  fields = fields.filter((f) => {
    if (!f || f.startsWith('s_studio_')) {
      console.warn(`[semantic-query-executor] Veld '${f}' gefilterd — ongeldige prefix (waarschijnlijk stale Supabase data)`);
      return false;
    }
    if (seenFields.has(f)) return false;
    seenFields.add(f);
    return true;
  });

  // Guard: x_web_visitor met HTML-blob velden vereist filters.
  if (model === 'x_web_visitor') {
    const HEAVY_VISITOR_FIELDS = new Set([
      'x_studio_visitor_timeline_html',
      'x_studio_visitor_kpi_html',
      'x_studio_pages_json'
    ]);
    const heavyFieldsRequested = fields.filter((f) => HEAVY_VISITOR_FIELDS.has(f));
    if (heavyFieldsRequested.length > 0) {
      // Nota: dit checkt enkel payload.filters, niet payload.time_scope --
      // een time_scope (bv. via een mini-app periode-override) telt hier
      // ook als "er is een filter", want die wordt hieronder alsnog naar
      // concrete domain-condities vertaald.
      const hasFilter = (Array.isArray(payload.filters) && payload.filters.length > 0) || !!payload.time_scope;
      if (!hasFilter && !isVerifyMode) {
        throw new SemanticQueryError(
          `De velden ${heavyFieldsRequested.join(', ')} bevatten grote HTML-data per bezoeker. Voeg een filter toe (bijv. een tijdsperiode of source site) om het aantal records te beperken — anders crasht de query bij grote datasets.`,
          'QUERY_TOO_BROAD',
          { hint: 'Voeg een tijdsfilter toe (bijv. "eerste bezoek" van de laatste 30 dagen) of filter op source site om het resultaat te beperken.',
            heavy_fields: heavyFieldsRequested }
        );
      }
    }
  }

  // STEP 3b: Translate filters to Odoo domain
  const domain = [];

  if (model === 'crm.lead') {
    domain.push(['active', 'in', [true, false]]);
  }

  if (Array.isArray(payload.filters)) {
    for (const filter of payload.filters) {
      if (filter.field && filter.operator && filter.value !== undefined) {
        domain.push([filter.field, filter.operator, filter.value]);
      }
    }
  }

  // time_scope: enkel gezet door buildShareablePayload() (mini-app-sharing) --
  // de live wizard bakt een periode altijd al in als concrete >=/<=-filters
  // (zie resolvedTimeFilter() in semantic-wizard.js) en stuurt dus nooit
  // time_scope mee. Hier vertalen we 'm naar dezelfde concrete condities, met
  // dezelfde datumlogica als de generieke engine (odoo-domain-translator.js)
  // zodat een mini-app-periode-override (resolveQueryParameters() in
  // mini-app-bridge.js) ook effectief het opgehaalde tijdvak verandert.
  if (payload.time_scope) {
    domain.push(...translateTimeScope(payload.time_scope));
  }

  if (payload.lead_enrichment?.enabled && model === 'x_sales_action_sheet') {
    if (!fields.includes('x_studio_as_opportunity_ids')) {
      fields.push('x_studio_as_opportunity_ids');
    }
  }

  if (payload.touchpoint_visitor_enrichment?.enabled && model === 'x_ad_touchpoint') {
    if (!fields.includes('x_studio_visitor')) {
      fields.push('x_studio_visitor');
    }
  }

  const notes = [];
  notes.push(`Primary query: ${model} with ${domain.length} filters`);

  // STEP 4: Call searchRead — verify mode uses limit 25 + id desc, otherwise no limit
  let records = await searchRead(env, {
    model,
    domain,
    fields,
    limit: isVerifyMode ? 25 : false,
    ...(isVerifyMode ? { order: 'id desc' } : {})
  });

  notes.push(`Primary query returned ${records.length} records`);

  // STEP 5: Enrichments
  const metas = {};

  if (payload.lead_enrichment && payload.lead_enrichment.enabled) {
    try {
      const enriched = await enrichWithLeads(records, payload.lead_enrichment, env, notes);
      records = enriched.records;
      metas.lead_enrichment = enriched.meta;
    } catch (error) {
      if (error.code === 'SECONDARY_QUERY_TRUNCATED') {
        throw new SemanticQueryError(error.message, 'SECONDARY_QUERY_TRUNCATED', {
          hint: 'Voeg meer specifieke lead-filters toe om de resultaatset te beperken',
          mode: payload.lead_enrichment.mode
        });
      }
      throw error;
    }
  }

  if (payload.chatter_enrichment && payload.chatter_enrichment.enabled) {
    const chatterResult = await enrichWithChatter(records, { ...payload.chatter_enrichment, odoo_model: model }, env, notes);
    records = chatterResult.records;
    metas.chatter_enrichment = chatterResult.meta;
  }

  if (payload.activity_enrichment && payload.activity_enrichment.enabled) {
    const activityResult = await enrichWithActivities(records, { ...payload.activity_enrichment, odoo_model: model }, env, notes);
    records = activityResult.records;
    metas.activity_enrichment = activityResult.meta;
  }

  if (payload.partner_lead_enrichment && payload.partner_lead_enrichment.enabled && model === 'res.partner') {
    const partnerLeadResult = await enrichPartnersWithLeads(records, payload.partner_lead_enrichment, env, notes);
    records = partnerLeadResult.records;
    metas.partner_lead_enrichment = partnerLeadResult.meta;
  }

  if (payload.partner_actionsheet_enrichment && payload.partner_actionsheet_enrichment.enabled && model === 'res.partner') {
    const partnerAsResult = await enrichPartnersWithActionSheets(records, payload.partner_actionsheet_enrichment, env, notes);
    records = partnerAsResult.records;
    metas.partner_actionsheet_enrichment = partnerAsResult.meta;
  }

  if (payload.visitor_touchpoint_enrichment?.enabled && model === 'x_web_visitor') {
    const vtResult = await enrichVisitorsWithTouchpoints(records, payload.visitor_touchpoint_enrichment, env, notes);
    records = vtResult.records;
    metas.visitor_touchpoint_enrichment = vtResult.meta;
  }

  if (payload.visitor_lead_enrichment?.enabled && model === 'x_web_visitor') {
    const vlResult = await enrichVisitorsWithLeadsFn(records, payload.visitor_lead_enrichment, env, notes);
    records = vlResult.records;
    metas.visitor_lead_enrichment = vlResult.meta;
  }

  if (payload.touchpoint_visitor_enrichment?.enabled && model === 'x_ad_touchpoint') {
    const tvResult = await enrichTouchpointsWithVisitor(records, payload.touchpoint_visitor_enrichment, env, notes);
    records = tvResult.records;
    metas.touchpoint_visitor_enrichment = tvResult.meta;
  }

  if (payload.actionsheet_partner_enrichment?.enabled && model === 'x_sales_action_sheet') {
    const apResult = await enrichActiesheetsWithPartner(records, payload.actionsheet_partner_enrichment, env, notes);
    records = apResult.records;
    metas.actionsheet_partner_enrichment = apResult.meta;

    if (payload.actionsheet_partner_enrichment.lead_enrichment?.enabled) {
      const apLeadCfg = payload.actionsheet_partner_enrichment.lead_enrichment;
      const pIds = [];
      for (const rec of records) {
        if (rec.__partner?.id && !pIds.includes(rec.__partner.id)) pIds.push(rec.__partner.id);
      }
      if (pIds.length) {
        const leadDomain = [['partner_id', 'in', pIds], ['type', '=', 'opportunity'], ['active', 'in', [true, false]]];
        if (apLeadCfg.filters?.won_status?.length) {
          leadDomain.push(['won_status', 'in', apLeadCfg.filters.won_status]);
        }
        const partnerLeadsAP = await searchRead(env, {
          model: 'crm.lead',
          domain: leadDomain,
          fields: ['id', 'name', 'won_status', 'stage_id', 'partner_id'],
          limit: false
        });
        notes.push(`Actieblad→Partner→Lead: ${partnerLeadsAP.length} leads voor ${pIds.length} partners`);
        const leadsByPartner = {};
        for (const lead of partnerLeadsAP) {
          const pid = Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id;
          if (!leadsByPartner[pid]) leadsByPartner[pid] = [];
          leadsByPartner[pid].push(lead);
        }
        records = records.map((rec) => {
          if (!rec.__partner) return rec;
          return { ...rec, __partner: { ...rec.__partner, __leads: leadsByPartner[rec.__partner.id] || [] } };
        });
      }
    }
  }

  if (payload.lead_enrichment?.partner_enrichment?.enabled && model === 'x_sales_action_sheet') {
    const lpResult = await enrichLeadsWithPartner(records, payload.lead_enrichment.partner_enrichment, env, notes);
    records = lpResult.records;
    metas.lead_partner_enrichment = lpResult.meta;
  }

  if (payload.lead_actionsheet_enrichment?.enabled && model === 'crm.lead') {
    const laResult = await enrichLeadsWithActionSheets(records, payload.lead_actionsheet_enrichment, env, notes);
    records = laResult.records;
    metas.lead_actionsheet_enrichment = laResult.meta;
  }

  if (payload.lead_enrichment?.visitor_enrichment?.enabled) {
    const lvResult = await enrichLeadsWithVisitors(records, payload.lead_enrichment.visitor_enrichment, env, notes);
    records = lvResult.records;
    metas.lead_visitor_enrichment = lvResult.meta;
  }

  if (payload.visitor_partner_enrichment?.enabled && model === 'x_web_visitor') {
    const vpResult = await enrichVisitorsWithPartner(records, payload.visitor_partner_enrichment, env, notes);
    records = vpResult.records;
    metas.visitor_partner_enrichment = vpResult.meta;
  }

  return { records, model, domain, fields, notes, metas };
}
