/**
 * Cascade-executor — verificatie zonder Odoo-verbinding
 *
 * Draaien:  node src/modules/sales-insight-explorer/tests/cascade-executor-test.mjs
 *
 * Stubt globalThis.fetch met een mini-Odoo die search_read afhandelt op
 * fixtures. Die fixtures zijn overgenomen uit ECHTE records van de mymmo-
 * instance (lead 11332 "Michel Dumont Michel's verkoopkans" -> contactpersoon
 * 933417 -> gebouw 933416 "Duinenpark"; visitor 29758 met twee touchpoints),
 * zodat de vormen (many2one als [id, "naam"], many2many als [id, ...]) exact
 * overeenkomen met wat Odoo teruggeeft.
 *
 * Verifieert de twee acceptatietests plus de zaken die in de oude motor
 * structureel fout zaten: many2one op FK-WAARDEN i.p.v. bron-id's, groepering
 * per ouder bij een pad van meerdere stappen, en de caps/guards.
 */

import { executeCascade, CascadeError } from '../lib/graph/cascade-executor.js';

// ============================================================================
// Fixtures (overgenomen uit de echte instance)
// ============================================================================

const DB = {
  'crm.lead': [
    { id: 11332, name: "Michel Dumont Michel's verkoopkans", active: true, type: 'opportunity', partner_id: [933417, 'Duinenpark, Michel Dumont Michel'], create_date: '2026-08-03 08:36:10' },
    { id: 11330, name: "Rudolf Walle's verkoopkans", active: true, type: 'opportunity', partner_id: [933263, 'Eglantierlaan 43, Rudolf Walle'], create_date: '2026-08-02 16:44:17' },
    { id: 11334, name: 'VME Check: Herman Jocquet', active: true, type: 'opportunity', partner_id: [933420, 'Herman Jocquet'], create_date: '2026-08-03 11:09:28' },
    { id: 11300, name: 'Tweede lead op Duinenpark', active: false, type: 'opportunity', partner_id: [933419, 'Duinenpark, Anna Peeters'], create_date: '2026-07-01 09:00:00' }
  ],
  'res.partner': [
    { id: 933416, name: 'Duinenpark', is_company: true, commercial_partner_id: [933416, 'Duinenpark'], email: false, create_date: '2026-08-03 08:30:00' },
    { id: 933262, name: 'Eglantierlaan 43', is_company: true, commercial_partner_id: [933262, 'Eglantierlaan 43'], email: false, create_date: '2026-08-02 16:40:00' },
    { id: 933417, name: 'Michel Dumont Michel', is_company: false, commercial_partner_id: [933416, 'Duinenpark'], email: 'michel.h.dumont@gmail.com', create_date: '2026-08-03 08:35:00' },
    { id: 933419, name: 'Anna Peeters', is_company: false, commercial_partner_id: [933416, 'Duinenpark'], email: 'anna.peeters@example.com', create_date: '2026-07-01 08:00:00' },
    { id: 933263, name: 'Rudolf Walle', is_company: false, commercial_partner_id: [933262, 'Eglantierlaan 43'], email: 'ruudwalle@mailbox.org', create_date: '2026-08-02 16:41:00' },
    { id: 933420, name: 'Herman Jocquet', is_company: false, commercial_partner_id: [933420, 'Herman Jocquet'], email: 'herman.jocquet@telenet.be', create_date: '2026-08-03 11:05:00' }
  ],
  'x_web_visitor': [
    { id: 29758, x_name: 'Visitor 484f7e07', x_studio_email: 'michel.h.dumont@gmail.com', x_studio_lead_ids: [11332], x_studio_first_seen: '2026-04-28 09:21:25', x_studio_visitor_kpi_html: '<b>zwaar</b>' },
    { id: 47357, x_name: 'Visitor 120c8617', x_studio_email: 'herman.jocquet@telenet.be', x_studio_lead_ids: [11334], x_studio_first_seen: '2026-08-03 11:09:28', x_studio_visitor_kpi_html: '<b>zwaar</b>' },
    { id: 47386, x_name: 'Visitor 8ff23032', x_studio_email: false, x_studio_lead_ids: [], x_studio_first_seen: '2026-08-03 13:54:29', x_studio_visitor_kpi_html: '<b>zwaar</b>' }
  ],
  'x_ad_touchpoint': [
    { id: 223129, x_name: 'tp-1', x_studio_visitor: [29758, 'Visitor 484f7e07'], x_studio_source: 'google', x_studio_timestamp: '2026-08-03 12:31:57' },
    { id: 223127, x_name: 'tp-2', x_studio_visitor: [29758, 'Visitor 484f7e07'], x_studio_source: 'google', x_studio_timestamp: '2026-08-03 12:26:45' },
    { id: 223130, x_name: 'tp-3', x_studio_visitor: [47386, 'Visitor 8ff23032'], x_studio_source: 'facebook', x_studio_timestamp: '2026-08-03 13:54:29' }
  ],
  'mail.message': [
    { id: 5001, preview: 'Eerste contact', model: 'crm.lead', res_id: 11332, message_type: 'comment', date: '2026-08-03 09:00:00' },
    { id: 5002, preview: 'Notitie', model: 'crm.lead', res_id: 11332, message_type: 'comment', date: '2026-08-03 10:00:00' },
    { id: 5003, preview: 'Niet relevant', model: 'res.partner', res_id: 933416, message_type: 'comment', date: '2026-08-03 10:00:00' },
    { id: 5004, preview: 'Systeem', model: 'crm.lead', res_id: 11330, message_type: 'user_notification', date: '2026-08-03 10:00:00' }
  ],
  'mail.activity': [],
  'x_sales_action_sheet': [],
  'x_estate_stats': [
    { id: 31403, x_name: 'Duinenpark - Stats', x_studio_estate_id: [933416, 'Duinenpark'], x_active: true, x_studio_stage_id: [1, 'Nieuw'], x_stats_total_open_projects: 2 },
    { id: 31144, x_name: 'Eglantierlaan 43 - Stats', x_studio_estate_id: [933262, 'Eglantierlaan 43'], x_active: true, x_studio_stage_id: [1, 'Nieuw'], x_stats_total_open_projects: 0 }
  ]
};

// ============================================================================
// Mini-Odoo: domain-evaluatie (platte AND-lijst, zoals de executor bouwt)
// ============================================================================

let CALL_LOG = [];

function valueOf(record, field) {
  return Object.prototype.hasOwnProperty.call(record, field) ? record[field] : false;
}

function leafMatches(record, [field, op, value]) {
  const raw = valueOf(record, field);
  // many2one -> vergelijk op id; x2many -> op de id-lijst
  const scalar = Array.isArray(raw) && raw.length === 2 && typeof raw[0] === 'number' && typeof raw[1] === 'string'
    ? raw[0]
    : raw;

  switch (op) {
    case '=': return scalar === value;
    case '!=': return scalar !== value;
    case '>=': return String(scalar) >= String(value);
    case '<=': return String(scalar) <= String(value);
    case '>': return String(scalar) > String(value);
    case '<': return String(scalar) < String(value);
    case 'in':
      if (Array.isArray(scalar)) return scalar.some((v) => value.includes(v));
      return value.includes(scalar);
    case 'not in':
      if (Array.isArray(scalar)) return !scalar.some((v) => value.includes(v));
      return !value.includes(scalar);
    default:
      throw new Error(`mini-Odoo kent operator niet: ${op}`);
  }
}

function fakeSearchRead(model, domain, kwargs) {
  const rows = DB[model] || [];
  let out = rows.filter((r) => domain.every((leaf) => {
    if (typeof leaf === 'string') throw new Error('mini-Odoo verwacht een platte AND-lijst, kreeg operator: ' + leaf);
    return leafMatches(r, leaf);
  }));

  if (kwargs.order) {
    const [field, dir] = String(kwargs.order).split(/\s+/);
    out = [...out].sort((a, b) => {
      const av = String(valueOf(a, field));
      const bv = String(valueOf(b, field));
      return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }

  const fields = Array.isArray(kwargs.fields) && kwargs.fields.length ? kwargs.fields : null;
  const projected = out.map((r) => {
    if (!fields) return { ...r };
    const o = { id: r.id };
    for (const f of fields) if (f !== 'id') o[f] = valueOf(r, f);
    return o;
  });

  const offset = kwargs.offset || 0;
  const limit = typeof kwargs.limit === 'number' && kwargs.limit !== false ? kwargs.limit : undefined;
  return limit === undefined ? projected.slice(offset) : projected.slice(offset, offset + limit);
}

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const [, , , model, method, args, kwargs] = body.params.args;
  if (method !== 'search_read') throw new Error(`mini-Odoo kent methode niet: ${method}`);
  CALL_LOG.push({ model, domain: args[0], fields: kwargs.fields, limit: kwargs.limit });
  return {
    ok: true,
    text: async () => JSON.stringify({ jsonrpc: '2.0', result: fakeSearchRead(model, args[0], kwargs) })
  };
};

const env = { DB_NAME: 'fake', UID: '2', API_KEY: 'fake' };

// ============================================================================
// Test-helpers
// ============================================================================

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ' -> ' + JSON.stringify(detail) : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  CALL_LOG = [];
}

// ============================================================================
// ACCEPTATIETEST 1 — lead -> gebouw/VME -> contactpersonen van dat gebouw
// ============================================================================

section('ACCEPTATIETEST 1: crm.lead -> gebouw -> contactpersonen');
{
  const query = {
    version: 2,
    root: { node: 'crm.lead', fields: ['name', 'create_date'], filters: [], limit: 100 },
    cascade: [
      {
        edge: 'crm.lead>res.partner',
        fields: ['name'],
        cascade: [
          { edge: 'res.partner>res.partner:contact', fields: ['name', 'email'] }
        ]
      }
    ]
  };

  const { records, meta } = await executeCascade(query, env);
  const lead11332 = records.find((r) => r.id === 11332);
  const lead11334 = records.find((r) => r.id === 11334);

  check('gearchiveerde lead komt mee (active in [true,false])', records.some((r) => r.id === 11300), records.map((r) => r.id));
  check('lead 11332 heeft gebouw Duinenpark', lead11332.__gebouwen && lead11332.__gebouwen.id === 933416, lead11332.__gebouwen);
  check('many2one-cascade geeft één object, geen array', !Array.isArray(lead11332.__gebouwen));
  check(
    'gebouw heeft BEIDE contactpersonen (933417 + 933419)',
    lead11332.__gebouwen.__contactpersonen.map((c) => c.id).sort().join(',') === '933417,933419',
    lead11332.__gebouwen.__contactpersonen
  );
  check(
    'contactpersonen zijn individuen, geen companies (baseDomain per node)',
    lead11332.__gebouwen.__contactpersonen.every((c) => c.id !== 933416)
  );
  check(
    'lead met contact zonder company krijgt geen gebouw',
    lead11334.__gebouwen === null,
    lead11334.__gebouwen
  );
  check('meta bevat beide cascade-stappen', meta.steps.length === 2, meta.steps);
  check(
    'geen enkele query zoekt res.partner op lead-id\'s (de oude many2one-bug)',
    !CALL_LOG.some((c) => c.model === 'res.partner' && JSON.stringify(c.domain).includes('11332')),
    CALL_LOG.filter((c) => c.model === 'res.partner').map((c) => c.domain)
  );
}

// ============================================================================
// ACCEPTATIETEST 2 — visitor -> touchpoints (tak a) + contacten -> leads (tak b)
// ============================================================================

section('ACCEPTATIETEST 2: x_web_visitor -> touchpoints | contactpersonen -> leads');
{
  const query = {
    version: 2,
    root: { node: 'x_web_visitor', fields: ['x_name', 'x_studio_email'], filters: [], limit: 100 },
    cascade: [
      { edge: 'x_web_visitor>x_ad_touchpoint', fields: ['x_studio_source', 'x_studio_timestamp'] },
      {
        edge: 'x_web_visitor>res.partner:contact',
        fields: ['name', 'email'],
        cascade: [
          { edge: 'res.partner:contact>crm.lead', fields: ['name'] }
        ]
      }
    ]
  };

  const { records, meta } = await executeCascade(query, env);
  const v29758 = records.find((r) => r.id === 29758);
  const v47386 = records.find((r) => r.id === 47386);

  check('visitor 29758 heeft 2 touchpoints', v29758.__touchpoints.length === 2, v29758.__touchpoints);
  check(
    'touchpoints van andere visitors lekken niet door',
    v29758.__touchpoints.every((t) => t.id !== 223130),
    v29758.__touchpoints.map((t) => t.id)
  );
  check('visitor 47386 heeft 1 touchpoint', v47386.__touchpoints.length === 1);
  check(
    'e-mailmatch vindt contactpersoon 933417',
    v29758.__contactpersonen.length === 1 && v29758.__contactpersonen[0].id === 933417,
    v29758.__contactpersonen
  );
  check('visitor zonder e-mailadres krijgt geen contactpersonen', v47386.__contactpersonen.length === 0);
  check(
    'derde niveau: lead 11332 hangt onder contactpersoon 933417',
    v29758.__contactpersonen[0].__leads.map((l) => l.id).join(',') === '11332',
    v29758.__contactpersonen[0].__leads
  );
  check('twee takken naast elkaar in meta', meta.steps.filter((s) => s.edge.startsWith('x_web_visitor>')).length === 2, meta.steps);
}

// ============================================================================
// x_estate_stats — nieuwe node, many2one naar res.partner via x_studio_estate_id
// ============================================================================

section('x_estate_stats als vertrekpunt -> gebouw/VME');
{
  const query = {
    version: 2,
    root: { node: 'x_estate_stats', fields: ['x_name', 'x_stats_total_open_projects'], filters: [] },
    cascade: [{ edge: 'x_estate_stats>res.partner', fields: ['name'] }]
  };

  const { records } = await executeCascade(query, env);
  const stat31403 = records.find((r) => r.id === 31403);
  const stat31144 = records.find((r) => r.id === 31144);

  check('stat 31403 heeft gebouw Duinenpark', stat31403.__gebouw && stat31403.__gebouw.id === 933416, stat31403.__gebouw);
  check('many2one-cascade geeft één object, geen array', !Array.isArray(stat31403.__gebouw));
  check('stat 31144 heeft gebouw Eglantierlaan 43', stat31144.__gebouw && stat31144.__gebouw.id === 933262, stat31144.__gebouw);
  check(
    'geen enkele query zoekt res.partner op estate_stats-id\'s (de oude many2one-bug)',
    !CALL_LOG.some((c) => c.model === 'res.partner' && JSON.stringify(c.domain).includes('31403')),
    CALL_LOG.filter((c) => c.model === 'res.partner').map((c) => c.domain)
  );
}

section('Gebouw/VME -> x_estate_stats (inverse edge, toevoeging op gebouwen)');
{
  const { records } = await executeCascade({
    version: 2,
    root: { node: 'res.partner', fields: ['name'], filters: [] },
    cascade: [{ edge: 'res.partner>x_estate_stats', fields: ['x_name', 'x_stats_total_open_projects'] }]
  }, env);

  const duinenpark = records.find((r) => r.id === 933416);
  const eglantier = records.find((r) => r.id === 933262);

  check('inverse edge levert een ARRAY (cardinality many)', Array.isArray(duinenpark.__estate_stats));
  check('Duinenpark heeft precies zijn eigen stat-record', duinenpark.__estate_stats.length === 1 && duinenpark.__estate_stats[0].id === 31403, duinenpark.__estate_stats);
  check('Eglantierlaan 43 heeft zijn eigen stat-record, geen kruisbesmetting', eglantier.__estate_stats.length === 1 && eglantier.__estate_stats[0].id === 31144, eglantier.__estate_stats);
}

// ============================================================================
// Mail-patroon
// ============================================================================

section('Mail-patroon (chatter per node, gegenereerde edge)');
{
  const { records } = await executeCascade({
    version: 2,
    root: { node: 'crm.lead', fields: ['name'], filters: [] },
    cascade: [{ edge: 'crm.lead>mail.message', fields: ['preview', 'date'] }]
  }, env);

  const lead11332 = records.find((r) => r.id === 11332);
  const lead11330 = records.find((r) => r.id === 11330);
  check('2 berichten op lead 11332', lead11332.__chatter.length === 2, lead11332.__chatter);
  check('bericht van res.partner lekt niet naar crm.lead', lead11332.__chatter.every((m) => m.id !== 5003));
  check(
    'baseDomain van mail.message filtert user_notification weg',
    lead11330.__chatter.length === 0,
    lead11330.__chatter
  );
}

// ============================================================================
// Guards
// ============================================================================

section('Guards');
{
  let err = null;
  try {
    await executeCascade({
      version: 2,
      root: { node: 'x_web_visitor', fields: ['x_studio_visitor_kpi_html'], filters: [] },
      cascade: []
    }, env);
  } catch (e) { err = e; }
  check('zwaar veld zonder filter -> QUERY_TOO_BROAD', err instanceof CascadeError && err.code === 'QUERY_TOO_BROAD', err && err.code);

  err = null;
  try {
    await executeCascade({
      version: 2,
      root: {
        node: 'x_web_visitor',
        fields: ['x_studio_visitor_kpi_html'],
        time_scope: { field: 'x_studio_first_seen', mode: 'absolute', from: '2026-08-01' }
      },
      cascade: []
    }, env);
  } catch (e) { err = e; }
  check('zwaar veld MET tijdsfilter mag wel', err === null, err && err.message);

  err = null;
  try {
    await executeCascade({
      version: 2,
      root: { node: 'crm.lead', fields: ['name'] },
      cascade: [{ edge: 'crm.lead>res.partner:contact', fields: ['name'], limit: 1 }]
    }, env);
  } catch (e) { err = e; }
  check('cap per stap -> STEP_TOO_LARGE', err instanceof CascadeError && err.code === 'STEP_TOO_LARGE', err && err.code);

  err = null;
  try {
    await executeCascade({ version: 2, root: { node: 'x_ad_touchpoint' }, cascade: [] }, env);
  } catch (e) { err = e; }
  check('touchpoint als vertrekpunt geweigerd', err instanceof CascadeError && err.code === 'INVALID_QUERY', err && err.code);

  err = null;
  try {
    await executeCascade({
      version: 2,
      root: { node: 'crm.lead' },
      cascade: [{ edge: 'x_web_visitor>x_ad_touchpoint' }]
    }, env);
  } catch (e) { err = e; }
  check('edge die niet vanuit de ouder vertrekt geweigerd', err instanceof CascadeError && err.code === 'INVALID_QUERY', err && err.code);
}

// ============================================================================
// Filters + periode per stap (niet enkel op de root)
// ============================================================================

section('Filters en periode per cascade-stap');
{
  CALL_LOG = [];
  const { records } = await executeCascade({
    version: 2,
    root: { node: 'x_web_visitor', fields: ['x_name'] },
    cascade: [{
      edge: 'x_web_visitor>x_ad_touchpoint',
      fields: ['x_studio_source'],
      filters: [{ field: 'x_studio_source', operator: '=', value: 'google' }],
      time_scope: { field: 'x_studio_timestamp', mode: 'absolute', from: '2026-08-03 12:30:00' }
    }]
  }, env);

  const v29758 = records.find((r) => r.id === 29758);
  check('stapfilter + periode toegepast op de cascade-stap', v29758.__touchpoints.length === 1 && v29758.__touchpoints[0].id === 223129, v29758.__touchpoints);
  const tpCall = CALL_LOG.find((c) => c.model === 'x_ad_touchpoint');
  check('domain van de stap bevat filter én periode', JSON.stringify(tpCall.domain).includes('google') && JSON.stringify(tpCall.domain).includes('12:30'), tpCall.domain);
}

// ============================================================================
// Batching
// ============================================================================

section('ID-batching (blokken van 500)');
{
  const many = [];
  for (let i = 1; i <= 1200; i++) many.push({ id: 900000 + i, name: 'bulk ' + i, is_company: false, commercial_partner_id: [933416, 'Duinenpark'], email: false, create_date: '2026-01-01 00:00:00' });
  DB['res.partner'].push(...many);
  const leads = [];
  for (let i = 1; i <= 1200; i++) leads.push({ id: 800000 + i, name: 'bulk lead ' + i, active: true, type: 'opportunity', partner_id: [900000 + i, 'bulk ' + i], create_date: '2026-01-01 00:00:00' });
  DB['crm.lead'].push(...leads);

  CALL_LOG = [];
  const { records } = await executeCascade({
    version: 2,
    root: { node: 'crm.lead', fields: ['name'], limit: 2000 },
    cascade: [{ edge: 'crm.lead>res.partner:contact', fields: ['name'] }]
  }, env);

  const contactCalls = CALL_LOG.filter((c) => c.model === 'res.partner');
  check('meer dan één batch gebruikt', contactCalls.length >= 3, contactCalls.length);
  check(
    'geen enkele batch bevat meer dan 500 id\'s',
    contactCalls.every((c) => {
      const leaf = c.domain.find((l) => Array.isArray(l) && l[0] === 'id' && l[1] === 'in');
      return !leaf || leaf[2].length <= 500;
    })
  );
  check('alle 1200 bulk-leads hebben hun contactpersoon', records.filter((r) => r.id > 800000 && r.__contactpersoon).length === 1200);

  DB['res.partner'] = DB['res.partner'].filter((r) => r.id < 900001);
  DB['crm.lead'] = DB['crm.lead'].filter((r) => r.id < 800001);
}

// ============================================================================

console.log(`\n${failed === 0 ? 'ALLE TESTS GESLAAGD' : 'TESTS GEFAALD'}: ${passed} ok, ${failed} fout\n`);
if (failed > 0) process.exit(1);
