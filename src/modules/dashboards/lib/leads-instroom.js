/**
 * Instroom-widget — leads-aanvragen uit crm.lead
 *
 * Eerste widget van de nieuwe dashboards-module, bedoeld om de bestaande
 * Looker Studio-instroomsectie (Odoo -> odoo-proxy -> google-odoo-dataset-sync
 * -> Sheet -> Looker Studio) te vervangen door een rechtstreekse Odoo-
 * bevraging.
 *
 * Kanaal-indeling (bijgewerkt 2026-09-08, tweede iteratie):
 * Naast `x_studio_brand_origin` (het merk) gebruiken we nu ook het nieuwe
 * Studio-veld `x_studio_lead_channel` (fijnmaziger kanaal binnen dat merk,
 * bv. "VME-Check", "Contactform", "Telefoon"). Beide zijn properties op de
 * lead zelf -- geen leadnaam-heuristiek in DEZE code. Het eenmalig vullen
 * van `x_studio_lead_channel` op oudere leads (op basis van leadnaam)
 * gebeurt bewust apart, via een manueel te draaien Odoo Server Action, niet
 * hier -- dat blijft een menselijk gecontroleerde, eenmalige data-cleanup.
 *
 * Twee uitzonderingen die WEL hier in code horen: `x_studio_brand_origin
 * === 'directregistration'` betekent altijd `openvme_opstarters`, en
 * `=== 'syndicuskiezen'` betekent altijd `syndicoach_syndicus_kiezen` --
 * dat zijn geen gokken maar bevestigde 1-op-1 bedrijfsregels (Nico,
 * 2026-09-08), dus die mogen rechtstreeks op de betrouwbare brand_origin-
 * property worden toegepast i.p.v. te wachten tot elke individuele lead
 * een los kanaalveld heeft.
 *
 * Voor leads waar `x_studio_lead_channel` (nog) niet is ingevuld en het
 * merk niet in die twee uitzonderingen valt, vallen we terug op een
 * "overig"-categorie per merk (bv. "Syndicoach: overig/onbekend") --
 * expliciet zichtbaar als "nog niet verfijnd", nooit stilzwijgend
 * weggelaten of fout-gecategoriseerd.
 *
 * Merk-filter (toegevoegd 2026-08-09, derde iteratie): de widget-brede
 * Alles/Syndicoach/OpenVME/Onbekend-toggle uit de referentie-mockup. Dit
 * filtert op Odoo-domainniveau (scopeDomain hieronder), gebaseerd op
 * dezelfde bevestigde brand_origin-regels -- dus geen aparte "onbekend"-
 * queries nodig, gewoon het merk uitsluiten/insluiten in het domain vóór
 * we het ophalen. "Onbekend" = alles wat niet in de 4 gekende merken valt
 * (in de praktijk vrijwel altijd 'manual').
 *
 * "Won-ratio vanaf MQL": MQL (crm.stage id=1) is de instapstage -- vrijwel
 * elke nieuwe lead start daar. We benaderen "vanaf MQL binnen periode X"
 * daarom als "aangemaakt binnen periode X", i.p.v. de volledige
 * stage-historie (duration_tracking) te parsen zoals het Apps Script
 * funnel-sheet (google-odoo-dataset-sync/importLeads.js) doet -- eenvoudiger,
 * en voor een instroom-widget (i.t.t. een doorlooptijd-widget) het juiste
 * precisieniveau. Kan later verfijnd worden indien nodig.
 *
 * Geen relatie-traversal nodig (alles staat op crm.lead zelf), dus
 * rechtstreeks via lib/odoo.js -- de cascade-motor van sales-insight-explorer
 * (single source of truth voor RELATIES tussen modellen) is hier niet van
 * toepassing; dit is het "enkel basismodel + aggregaties"-geval, dus via
 * Odoo's read_group (geen per-lead detail nodig zolang we op property
 * groeperen).
 *
 * @module modules/dashboards/lib/leads-instroom
 */

import { executeKw } from '../../../lib/odoo.js';

// Kanalen zoals ze letterlijk bestaan als selectiewaarden van
// x_studio_lead_channel in Odoo Studio (ir.model.fields.selection op
// crm.lead), aangevuld met een "overig"-vangnet per merk voor leads die
// (nog) geen kanaaldetail hebben. Volgorde bepaalt de volgorde in de
// legende/grafiek -- gegroepeerd per merk.
const BRAND_KEYS = [
  'syndicoach_vme_check',
  'syndicoach_meta_lead_ad',
  'syndicoach_contact_form',
  'syndicoach_syndicus_kiezen',
  'syndicoach_telefoon',
  'syndicoach_email',
  'syndicoach_overig',
  'openvme_contact_form',
  'openvme_opstarters',
  'openvme_telefoon',
  'openvme_email',
  'openvme_meta_lead_ad',
  'openvme_overig',
  'manual_overig'
];

const BRAND_LABELS = {
  syndicoach_vme_check: 'Syndicoach: VME-Check',
  syndicoach_meta_lead_ad: 'Syndicoach: Meta lead ad',
  syndicoach_contact_form: 'Syndicoach: Contactform',
  syndicoach_syndicus_kiezen: 'Syndicoach: Syndicus kiezen',
  syndicoach_telefoon: 'Syndicoach: Telefoon',
  syndicoach_email: 'Syndicoach: E-mail',
  syndicoach_overig: 'Syndicoach: overig/onbekend',
  openvme_contact_form: 'OpenVME: Contactformulier',
  openvme_opstarters: 'OpenVME: Zelfstarters',
  openvme_telefoon: 'OpenVME: Telefoon',
  openvme_email: 'OpenVME: E-mail',
  openvme_meta_lead_ad: 'OpenVME: Meta lead ad',
  openvme_overig: 'OpenVME: overig/onbekend',
  manual_overig: 'Manueel/overig'
};

// Set van de kanaalwaarden die ECHT als zodanig in Odoo bestaan (i.t.t. de
// lokale "overig"-vangnetcategorieën hierboven, die geen Odoo-waarde zijn).
const KNOWN_CHANNEL_VALUES = new Set([
  'syndicoach_vme_check',
  'syndicoach_meta_lead_ad',
  'syndicoach_contact_form',
  'syndicoach_syndicus_kiezen',
  'syndicoach_telefoon',
  'syndicoach_email',
  'openvme_contact_form',
  'openvme_opstarters',
  'openvme_telefoon',
  'openvme_email',
  'openvme_meta_lead_ad'
]);

/**
 * @param {string|false} brandOrigin - x_studio_brand_origin
 * @param {string|false} channelValue - x_studio_lead_channel
 * @returns {string} één van BRAND_KEYS
 */
function resolveChannel(brandOrigin, channelValue) {
  // Bevestigde bedrijfsregels, geen gok: rechtstreeks op de betrouwbare
  // brand_origin-property toepassen, zodat dit ook al werkt vóór elke
  // individuele lead een los kanaalveld heeft.
  if (brandOrigin === 'directregistration') return 'openvme_opstarters';
  if (brandOrigin === 'syndicuskiezen') return 'syndicoach_syndicus_kiezen';

  if (channelValue && KNOWN_CHANNEL_VALUES.has(channelValue)) return channelValue;

  switch (brandOrigin) {
    case 'syndicoach': return 'syndicoach_overig';
    case 'openvme': return 'openvme_overig';
    default: return 'manual_overig';
  }
}

/**
 * Odoo-domain-uitbreiding voor de widget-brede merk-toggle. Gebaseerd op
 * dezelfde bevestigde brand_origin-regels als resolveChannel() hierboven --
 * 'directregistration' hoort bij OpenVME, 'syndicuskiezen' bij Syndicoach.
 * "Onbekend" is alles wat niet in de 4 gekende merken valt.
 *
 * @param {'all'|'syndicoach'|'openvme'|'onbekend'} scope
 */
function scopeDomain(scope) {
  switch (scope) {
    case 'syndicoach': return [['x_studio_brand_origin', 'in', ['syndicoach', 'syndicuskiezen']]];
    case 'openvme': return [['x_studio_brand_origin', 'in', ['openvme', 'directregistration']]];
    case 'onbekend': return [['x_studio_brand_origin', 'not in', ['syndicoach', 'openvme', 'directregistration', 'syndicuskiezen']]];
    default: return [];
  }
}

/** Enkel de BRAND_KEYS die relevant zijn voor de gekozen scope (voor een opgekuiste legende/badges). */
function relevantKeysForScope(scope) {
  if (scope === 'syndicoach') return BRAND_KEYS.filter((k) => k.startsWith('syndicoach'));
  if (scope === 'openvme') return BRAND_KEYS.filter((k) => k.startsWith('openvme'));
  if (scope === 'onbekend') return ['manual_overig'];
  return BRAND_KEYS;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Odoo verwacht naïeve UTC-datetimes in dit formaat. */
function toOdooDatetime(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

export function toDateKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * @param {'30d'|'6m'} period
 * @returns {{start: Date, end: Date, prevStart: Date, prevEnd: Date}}
 */
function getPeriodRange(period) {
  const now = new Date();
  const end = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()
  ));

  const start = period === '6m' ? addMonths(end, -6) : addDays(end, -30);
  const prevStart = period === '6m' ? addMonths(start, -6) : addDays(start, -30);
  const prevEnd = start;

  return { start, end, prevStart, prevEnd };
}

// Enkel echte opportunities tellen als "aanvraag" -- zelfde conventie als
// google-odoo-dataset-sync/importLeads.js ("Filter enkel type = opportunity").
const BASE_DOMAIN = [['type', '=', 'opportunity']];
// active_test: false -- verloren/gearchiveerde leads blijven meetellen als
// instroom (de aanvraag is wel degelijk binnengekomen), zelfde bedoeling als
// de baseDomain van de crm.lead-node in sales-insight-explorer/lib/graph.
const BASE_CONTEXT = { active_test: false };

function dateRangeDomain(field, start, end) {
  return [[field, '>=', toOdooDatetime(start)], [field, '<', toOdooDatetime(end)]];
}

async function readGroup(env, { domain, fields, groupBy }) {
  return executeKw(env, {
    model: 'crm.lead',
    method: 'read_group',
    args: [domain, fields, groupBy],
    kwargs: { context: BASE_CONTEXT, lazy: false }
  });
}

async function countLeads(env, domain) {
  const rows = await readGroup(env, { domain, fields: ['id'], groupBy: [] });
  return rows[0] ? (rows[0].__count || 0) : 0;
}

function emptyDailySeries(start, end) {
  const days = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor.getTime() < last.getTime()) {
    const row = { date: toDateKey(cursor) };
    for (const key of BRAND_KEYS) row[key] = 0;
    days.push(row);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * @param {Object} env - Worker environment
 * @param {{period: '30d'|'6m', scope?: 'all'|'syndicoach'|'openvme'|'onbekend'}} options
 * @returns {Promise<Object>}
 */
/**
 * Totaal aantal (opportunity-)leads per dag, zero-filled, voor een
 * willekeurige periode -- gebruikt voor het voortschrijdend-30-dagen-
 * benchmarklijntje (dat een veel langere/andere periode beslaat dan de
 * 30d/6m-toggle van de widget zelf, dus een aparte, lichtere query dan
 * getInstroomData()).
 *
 * @param {Object} env
 * @param {{ scope?: string, start: Date, end: Date }} options
 * @returns {Promise<Array<{date: string, count: number}>>}
 */
export async function getDailyTotalsSeries(env, { scope, start, end } = {}) {
  const normalizedScope = ['syndicoach', 'openvme', 'onbekend'].includes(scope) ? scope : 'all';
  const domain = [...BASE_DOMAIN, ...scopeDomain(normalizedScope), ...dateRangeDomain('create_date', start, end)];

  const rows = await readGroup(env, { domain, fields: ['id'], groupBy: ['create_date:day'] });
  const countByDate = new Map();
  for (const row of rows) {
    const rangeInfo = row.__range && row.__range['create_date:day'];
    const dateKey = rangeInfo && rangeInfo.from ? rangeInfo.from.slice(0, 10) : null;
    if (dateKey) countByDate.set(dateKey, (countByDate.get(dateKey) || 0) + (row.__count || 0));
  }

  const series = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor.getTime() < last.getTime()) {
    const key = toDateKey(cursor);
    series.push({ date: key, count: countByDate.get(key) || 0 });
    cursor = addDays(cursor, 1);
  }
  return series;
}

export async function getInstroomData(env, { period, scope } = {}) {
  const normalizedPeriod = period === '6m' ? '6m' : '30d';
  const normalizedScope = ['syndicoach', 'openvme', 'onbekend'].includes(scope) ? scope : 'all';
  const { start, end, prevStart, prevEnd } = getPeriodRange(normalizedPeriod);

  const scopedBase = [...BASE_DOMAIN, ...scopeDomain(normalizedScope)];
  const currentDomain = [...scopedBase, ...dateRangeDomain('create_date', start, end)];
  const previousDomain = [...scopedBase, ...dateRangeDomain('create_date', prevStart, prevEnd)];
  const allTimeDomain = [...scopedBase];

  const [dailyBrandRows, previousCount, allTimeCount, wonStatusRows] = await Promise.all([
    readGroup(env, {
      domain: currentDomain,
      fields: ['id'],
      groupBy: ['create_date:day', 'x_studio_brand_origin', 'x_studio_lead_channel']
    }),
    countLeads(env, previousDomain),
    countLeads(env, allTimeDomain),
    readGroup(env, {
      domain: currentDomain,
      fields: ['id'],
      groupBy: ['won_status']
    })
  ]);

  // Dagreeks nul-gevuld opbouwen zodat de grafiek geen gaten toont.
  const daily = emptyDailySeries(start, end);
  const dailyByKey = new Map(daily.map((row) => [row.date, row]));

  const byBrand = Object.fromEntries(BRAND_KEYS.map((key) => [key, 0]));
  let currentTotal = 0;

  for (const row of dailyBrandRows) {
    const rangeInfo = row.__range && row.__range['create_date:day'];
    const count = row.__count || 0;
    const bucket = resolveChannel(row.x_studio_brand_origin, row.x_studio_lead_channel);

    currentTotal += count;
    byBrand[bucket] += count;

    const dateKey = rangeInfo && rangeInfo.from ? rangeInfo.from.slice(0, 10) : null;
    const dayRow = dateKey && dailyByKey.get(dateKey);
    if (dayRow) dayRow[bucket] += count;
  }

  let won = 0;
  let total = 0;
  for (const row of wonStatusRows) {
    const count = row.__count || 0;
    total += count;
    if (row.won_status === 'won') won += count;
  }

  const deltaPct = previousCount > 0
    ? Math.round(((currentTotal - previousCount) / previousCount) * 1000) / 10
    : null;

  // Enkel de voor deze scope relevante kanalen teruggeven (opgekuiste
  // legende/badges/grafiek i.p.v. 14 grotendeels-op-nul categorieën tonen
  // wanneer bv. enkel Syndicoach gefilterd is).
  const relevantKeys = relevantKeysForScope(normalizedScope);
  const scopedBrandLabels = Object.fromEntries(relevantKeys.map((k) => [k, BRAND_LABELS[k]]));
  const scopedByBrand = Object.fromEntries(relevantKeys.map((k) => [k, byBrand[k]]));
  const scopedDaily = daily.map((row) => {
    const filtered = { date: row.date };
    for (const k of relevantKeys) filtered[k] = row[k];
    return filtered;
  });

  return {
    period: normalizedPeriod,
    scope: normalizedScope,
    range: { start: toOdooDatetime(start), end: toOdooDatetime(end) },
    totals: {
      current: { count: currentTotal, byBrand: scopedByBrand },
      previous: { count: previousCount },
      deltaPct,
      allTime: { count: allTimeCount }
    },
    wonRatio: {
      won,
      total,
      ratioPct: total > 0 ? Math.round((won / total) * 1000) / 10 : null
    },
    daily: scopedDaily,
    brandLabels: scopedBrandLabels
  };
}
