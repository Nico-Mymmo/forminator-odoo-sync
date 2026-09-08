/**
 * Instroom-widget — leads-aanvragen uit crm.lead
 *
 * Eerste widget van de nieuwe dashboards-module, bedoeld om de bestaande
 * Looker Studio-instroomsectie (Odoo -> odoo-proxy -> google-odoo-dataset-sync
 * -> Sheet -> Looker Studio) te vervangen door een rechtstreekse Odoo-
 * bevraging.
 *
 * Merk-groepering (bijgewerkt 2026-09-08, op uitdrukkelijk verzoek van Nico):
 * UITSLUITEND gebaseerd op het Odoo-veld `x_studio_brand_origin` -- geen
 * leadnaam-heuristiek, geen enkele andere afleiding. Alle vijf de
 * selectiewaarden van dat veld krijgen een eigen, ongewijzigde categorie
 * (BRAND_LABELS hieronder gebruikt letterlijk de labels uit Odoo Studio),
 * niets wordt samengevoegd tot "onbekend". Wil je de indeling wijzigen, dan
 * gebeurt dat via een Studio-aanpassing aan het veld zelf (nieuwe/aangepaste
 * property), niet via code hier -- dat was net het punt van de correctie.
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

// Letterlijk de selectiewaarden + labels van x_studio_brand_origin in Odoo
// Studio (ir.model.fields.selection op crm.lead), in dezelfde volgorde als
// daar. Een lead zonder waarde (false) valt bij 'manual' -- inhoudelijk
// betekent 'manual' ook daar al "geen specifiek kanaal geregistreerd"; wie
// dat anders wil, past het veld in Studio aan, niet deze mapping.
const BRAND_KEYS = ['syndicoach', 'openvme', 'directregistration', 'syndicuskiezen', 'manual'];

const BRAND_LABELS = {
  syndicoach: 'Syndicoach (website/meta)',
  openvme: 'OpenVME (website/meta)',
  directregistration: 'Directe registratie',
  syndicuskiezen: 'Syndicus Kiezen',
  manual: 'Manueel aangemaakt'
};

function bucketForBrandOrigin(value) {
  return BRAND_KEYS.includes(value) ? value : 'manual';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Odoo verwacht naïeve UTC-datetimes in dit formaat. */
function toOdooDatetime(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function toDateKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date, months) {
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
 * @param {{period: '30d'|'6m'}} options
 * @returns {Promise<Object>}
 */
export async function getInstroomData(env, { period } = {}) {
  const normalizedPeriod = period === '6m' ? '6m' : '30d';
  const { start, end, prevStart, prevEnd } = getPeriodRange(normalizedPeriod);

  const currentDomain = [...BASE_DOMAIN, ...dateRangeDomain('create_date', start, end)];
  const previousDomain = [...BASE_DOMAIN, ...dateRangeDomain('create_date', prevStart, prevEnd)];
  const allTimeDomain = [...BASE_DOMAIN];

  const [dailyBrandRows, previousCount, allTimeCount, wonStatusRows] = await Promise.all([
    readGroup(env, {
      domain: currentDomain,
      fields: ['id'],
      groupBy: ['create_date:day', 'x_studio_brand_origin']
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
    const bucket = bucketForBrandOrigin(row.x_studio_brand_origin);

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

  return {
    period: normalizedPeriod,
    range: { start: toOdooDatetime(start), end: toOdooDatetime(end) },
    totals: {
      current: { count: currentTotal, byBrand },
      previous: { count: previousCount },
      deltaPct,
      allTime: { count: allTimeCount }
    },
    wonRatio: {
      won,
      total,
      ratioPct: total > 0 ? Math.round((won / total) * 1000) / 10 : null
    },
    daily,
    brandLabels: BRAND_LABELS
  };
}
