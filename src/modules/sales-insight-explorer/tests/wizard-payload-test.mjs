/**
 * Wizard-front-end -> cascade-payload: verificatie zonder browser
 *
 * Draaien:  node src/modules/sales-insight-explorer/tests/wizard-payload-test.mjs
 *
 * Laadt public/semantic-wizard.js in een VM met minimale document/window/fetch-
 * stubs, zet de wizard-toestand op de twee acceptatiescenario's en controleert
 * dat buildPayload() een cascade-query oplevert die de ECHTE servervalidatie
 * (lib/graph/cascade-models.js) goedkeurt. Zo kan de UI niet uit sync lopen met
 * wat de executor aanvaardt.
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getGraph } from '../lib/graph/graph-service.js';
import { validateCascadeQuery, collectAliases } from '../lib/graph/cascade-models.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const wizardSrc = readFileSync(path.join(repoRoot, 'public/semantic-wizard.js'), 'utf-8');

// ---------------------------------------------------------------------------
// Stubs: net genoeg om het bestand te laden en buildPayload() te kunnen roepen
// ---------------------------------------------------------------------------

const graph = getGraph();

const fakeFetch = async (url) => {
  if (String(url).includes('/sales-insights/graph')) {
    return { status: 200, ok: true, json: async () => ({ success: true, data: graph }) };
  }
  return { status: 200, ok: true, json: async () => ({ success: true, data: { sets: [], models: [], presets: [], searches: [] } }) };
};

const noop = () => {};
const fakeEl = {
  style: {}, innerHTML: '', value: '', dataset: {},
  addEventListener: noop, appendChild: noop, querySelector: () => null,
  querySelectorAll: () => [], closest: () => null, classList: { add: noop, remove: noop, toggle: noop }
};

const sandbox = {
  console,
  fetch: fakeFetch,
  setTimeout,
  clearTimeout,
  document: {
    addEventListener: noop,
    getElementById: () => fakeEl,
    querySelector: () => fakeEl,
    querySelectorAll: () => [],
    createElement: () => fakeEl,
    body: fakeEl
  },
  location: { href: '' },
  navigator: { clipboard: { writeText: noop } },
  alert: noop,
  Blob: class { constructor() {} },
  URL: { createObjectURL: () => 'blob:', revokeObjectURL: noop },
  crypto
};
sandbox.window = sandbox;
sandbox.window.__SALES_INSIGHT__ = { userRole: 'admin', modulePermissions: ['admin'] };
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(wizardSrc, context, { filename: 'semantic-wizard.js' });

// De graaf zelf laden zoals de init dat doet
await vm.runInContext('loadGraph()', context);

const wizardState = vm.runInContext('wizardState', context);

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`); }
}

function buildFor(state) {
  wizardState.selectModel(state.root);
  wizardState.submodelSets = state.submodelSets || {};
  wizardState.submodelPaths = state.submodelPaths || {};
  wizardState.subSubmodels = state.subSubmodels || {};
  if (state.timeFilter) Object.assign(wizardState.timeFilter, state.timeFilter);
  if (state.leadEnabled) wizardState.leadEnrichment.enabled = true;
  return wizardState.buildPayload();
}

// ---------------------------------------------------------------------------

console.log('\nGraaf geladen in de wizard');
{
  const modelConfig = vm.runInContext('MODEL_CONFIG', context);
  check('MODEL_CONFIG komt van de server', Object.keys(modelConfig).length === Object.keys(graph.nodes).length, Object.keys(modelConfig));
  check('contactpersonen-node aanwezig', !!modelConfig['res.partner:contact']);
  check('gebouwen-node heeft het juiste Odoo-model', modelConfig['res.partner'].model === 'res.partner');
  const neighbours = vm.runInContext("getNeighbors('crm.lead')", context);
  check('buren van crm.lead uit de graaf', neighbours.includes('res.partner') && neighbours.includes('res.partner:contact'), neighbours);
}

console.log('\nACCEPTATIETEST 1: lead -> gebouw -> contactpersonen');
{
  const payload = buildFor({
    root: 'crm.lead',
    submodelSets: { 'res.partner_enabled': true },
    subSubmodels: { 'res.partner': { 'res.partner:contact_enabled': true } },
    timeFilter: { mode: 'quick', quickPeriod: 'month', field: 'create_date' }
  });

  const validation = validateCascadeQuery(payload);
  check('payload is geldig volgens de servervalidatie', validation.is_valid, validation.errors);
  check('version 2 + root-node', payload.version === 2 && payload.root.node === 'crm.lead');
  check('periode als time_scope op de root', payload.root.time_scope && payload.root.time_scope.mode === 'absolute', payload.root.time_scope);
  check('root-filter type=opportunity', payload.root.filters.some((f) => f.field === 'type'), payload.root.filters);
  check('stap 1 = samengestelde edge naar gebouwen', payload.cascade[0].edge === 'crm.lead>res.partner', payload.cascade[0].edge);
  check('stap 2 = contactpersonen onder het gebouw', payload.cascade[0].cascade[0].edge === 'res.partner>res.partner:contact', payload.cascade[0].cascade);
  const aliases = collectAliases(payload).map((a) => a.alias + '@' + a.depth);
  check('aliassen: __gebouwen@1 + __contactpersonen@2', aliases.join(',') === '__gebouwen@1,__contactpersonen@2', aliases);
}

console.log('\nACCEPTATIETEST 2: visitor -> touchpoints | contactpersonen -> leads');
{
  const payload = buildFor({
    root: 'x_web_visitor',
    submodelSets: { 'x_ad_touchpoint_enabled': true, 'res.partner:contact_enabled': true },
    subSubmodels: { 'res.partner:contact': { 'crm.lead_enabled': true } }
  });

  const validation = validateCascadeQuery(payload);
  check('payload is geldig volgens de servervalidatie', validation.is_valid, validation.errors);
  const edges = payload.cascade.map((s) => s.edge);
  check('twee losse takken vanuit de visitor', edges.length === 2 && edges.includes('x_web_visitor>x_ad_touchpoint') && edges.includes('x_web_visitor>res.partner:contact'), edges);
  const contactStep = payload.cascade.find((s) => s.edge === 'x_web_visitor>res.partner:contact');
  check('leads hangen onder de contactpersonen', contactStep.cascade[0].edge === 'res.partner:contact>crm.lead', contactStep.cascade);
  check('geen touchpoint -> contact-tak (bestaat niet in de graaf)', !JSON.stringify(payload).includes('x_ad_touchpoint>res.partner'));
  check('bounce-filters op het basismodel', payload.root.filters.some((f) => f.field === 'x_studio_possible_bounce'), payload.root.filters);
}

console.log('\nFilters per cascade-stap (nieuw t.o.v. de oude motor)');
{
  wizardState.selectModel('res.partner');
  wizardState.submodelSets = { 'crm.lead_enabled': true };
  wizardState.subSubmodels = {};
  wizardState.leadEnrichment.filters.won_status = ['won'];
  const payload = wizardState.buildPayload();
  const leadStep = payload.cascade.find((s) => s.edge === 'res.partner>crm.lead');
  check('won_status-filter belandt op de LEAD-stap, niet op de root', !!leadStep && leadStep.filters.some((f) => f.field === 'won_status'), leadStep && leadStep.filters);
  check('type=opportunity niet op een cascade-stap', !leadStep.filters.some((f) => f.field === 'type'), leadStep.filters);
  check('payload geldig', validateCascadeQuery(payload).is_valid, validateCascadeQuery(payload).errors);
}

console.log('\nLus-preventie');
{
  wizardState.selectModel('crm.lead');
  wizardState.submodelSets = { 'res.partner:contact_enabled': true };
  wizardState.subSubmodels = { 'res.partner:contact': { 'crm.lead_enabled': true } };
  const payload = wizardState.buildPayload();
  check('dezelfde edge komt niet twee keer in een pad', validateCascadeQuery(payload).is_valid, validateCascadeQuery(payload).errors);
  check('crm.lead onder contactpersoon is een ANDERE edge-richting', JSON.stringify(payload).includes('res.partner:contact>crm.lead'));
}

console.log(`\n${failed === 0 ? 'ALLE TESTS GESLAAGD' : 'TESTS GEFAALD'}: ${passed} ok, ${failed} fout\n`);
if (failed > 0) process.exit(1);
