/**
 * Dashboards — flexibele targets (Supabase)
 *
 * Targets zijn applicatie-configuratie (Nico stelt ze zelf per maand in
 * vanuit de widget), geen Odoo-CRM-data -- horen dus in Supabase, via de
 * centrale getSupabaseClient(env) (zie src/lib/database.js), niet in Odoo.
 *
 * Eén rij per (metric, scope, period_month); period_month is altijd de 1e
 * van de maand. Zie de migratie 20260908103000_dashboard_targets.sql.
 *
 * Twee dingen die bij de eerste versie fout zaten en hier bewust anders
 * zijn opgelost:
 *
 * 1. Het venster van instelbare maanden was enkel VOORUITKIJKEND (huidige
 *    maand + 6 vooruit). Maar de "laatste 6 maanden"-vergelijking in de
 *    widget heeft net de VOORBIJE maanden nodig om iets te kunnen optellen.
 *    listTargetWindow() toont daarom standaard een venster dat ook
 *    terugkijkt (monthsBack), niet enkel vooruit.
 *
 * 2. Een rollend venster van 30 dagen valt zelden samen met een kalender-
 *    maand (het loopt meestal over twee maanden heen). "De target van de
 *    kalendermaand van vandaag" was dus geen eerlijke vergelijking.
 *    sumProratedTarget() rekent nu per DAG: elke dag in de opgevraagde
 *    periode telt mee voor (target_value van die maand / aantal dagen in
 *    die maand), ongeacht of de periode 30 dagen of 6 maanden beslaat.
 *
 * @module modules/dashboards/lib/targets
 */

import { getSupabaseClient } from '../../../lib/database.js';

const TABLE = 'dashboard_targets';
const DEFAULT_METRIC = 'leads_instroom';
const DEFAULT_SCOPE = 'all';

function db(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return getSupabaseClient(env);
}

/** @returns {string} bv. '2026-09-01' voor de 1e van de maand van `date`. */
function toMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function addMonthsUTC(date, months) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function daysInMonth(year, monthIndexZeroBased) {
  return new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();
}

/**
 * Venster van maand-targets rond vandaag, zowel terug- als vooruitkijkend,
 * inclusief maanden zonder rij (target_value: null) zodat de UI ze meteen
 * als leeg invulveld kan tonen.
 *
 * @param {Object} env
 * @param {{ metric?: string, scope?: string, monthsBack?: number, monthsAhead?: number }} [options]
 * @returns {Promise<Array<{periodMonth: string, targetValue: number|null}>>}
 */
export async function listTargetWindow(env, { metric = DEFAULT_METRIC, scope = DEFAULT_SCOPE, monthsBack = 5, monthsAhead = 6 } = {}) {
  const now = new Date();
  const startMonth = toMonthKey(addMonthsUTC(now, -monthsBack));
  const endMonth = toMonthKey(addMonthsUTC(now, monthsAhead));

  const { data, error } = await db(env)
    .from(TABLE)
    .select('period_month, target_value')
    .eq('metric', metric)
    .eq('scope', scope)
    .gte('period_month', startMonth)
    .lte('period_month', endMonth)
    .order('period_month', { ascending: true });

  if (error) throw new Error(`listTargetWindow: ${error.message}`);

  const byMonth = new Map((data ?? []).map((row) => [row.period_month, row.target_value]));
  const months = [];
  for (let i = -monthsBack; i <= monthsAhead; i += 1) {
    const monthKey = toMonthKey(addMonthsUTC(now, i));
    months.push({ periodMonth: monthKey, targetValue: byMonth.has(monthKey) ? byMonth.get(monthKey) : null });
  }
  return months;
}

/**
 * Haal de targets op voor een expliciete lijst maandsleutels.
 *
 * @param {Object} env
 * @param {{ metric?: string, scope?: string, periodMonths: string[] }} options
 * @returns {Promise<Map<string, number>>} maandsleutel -> target_value (enkel maanden met een ingestelde waarde)
 */
export async function getTargetsForMonths(env, { metric = DEFAULT_METRIC, scope = DEFAULT_SCOPE, periodMonths }) {
  if (!periodMonths || periodMonths.length === 0) return new Map();

  const { data, error } = await db(env)
    .from(TABLE)
    .select('period_month, target_value')
    .eq('metric', metric)
    .eq('scope', scope)
    .in('period_month', periodMonths);

  if (error) throw new Error(`getTargetsForMonths: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.period_month, row.target_value]));
}

/**
 * @param {string} monthKey - 'YYYY-MM-01'
 * @returns {Date} de dag in het MIDDEN van die kalendermaand (UTC)
 */
function monthMidpoint(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const totalDays = daysInMonth(year, month - 1);
  return new Date(Date.UTC(year, month - 1, Math.ceil(totalDays / 2)));
}

/**
 * Zet elke (maand -> target_value) om in een ankerpunt op het MIDDEN van
 * die maand, met als waarde de gemiddelde dagelijkse rate voor die maand
 * (target_value / dagen in die maand) -- gesorteerd op datum.
 */
function buildAnchors(targetsByMonth) {
  const anchors = [];
  for (const [monthKey, value] of targetsByMonth.entries()) {
    const [year, month] = monthKey.split('-').map(Number);
    const totalDays = daysInMonth(year, month - 1);
    anchors.push({ date: monthMidpoint(monthKey), dailyRate: value / totalDays });
  }
  anchors.sort((a, b) => a.date.getTime() - b.date.getTime());
  return anchors;
}

/**
 * Dagelijkse target-rate op datum `date`, LINEAIR geïnterpoleerd tussen de
 * twee dichtstbijzijnde maand-middens (vóór de eerste of na de laatste
 * anker wordt die rand-waarde plat doorgetrokken). Dit is de kern van de
 * "vloeiende" target: in plaats van een harde sprong op elke 1e van de
 * maand (augustus 120 -> 1 sept plots 150), schuift de dagelijkse rate
 * geleidelijk op tussen 15 augustus en 15 september.
 */
function dailyRateAt(anchors, date) {
  if (anchors.length === 0) return null;
  const t = date.getTime();
  if (t <= anchors[0].date.getTime()) return anchors[0].dailyRate;
  const last = anchors[anchors.length - 1];
  if (t >= last.date.getTime()) return last.dailyRate;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (t >= a.date.getTime() && t <= b.date.getTime()) {
      const frac = (t - a.date.getTime()) / (b.date.getTime() - a.date.getTime());
      return a.dailyRate + frac * (b.dailyRate - a.dailyRate);
    }
  }
  return last.dailyRate;
}

/**
 * Bouw een vloeiende, dag-per-dag target-trend over [rangeStart, rangeEnd).
 * Vervangt de vorige "platte proratie per kalendermaand" -- die sprong hard
 * op elke maandgrens. Hier interpoleren we lineair tussen de MIDDENS van
 * opeenvolgende maand-targets, zodat het target dag na dag geleidelijk
 * aanzwelt/afneemt i.p.v. abrupt te springen (Nico, 2026-09-08).
 *
 * Geef `targetsByMonth` gerust ook de maand vóór en na de weergegeven
 * periode mee (routes.js vraagt die extra op) -- dat maakt de interpolatie
 * net aan het begin/einde van de periode vloeiender in plaats van daar plat
 * te extrapoleren vanaf de eerste/laatste maand die toevallig in beeld is.
 *
 * @param {Map<string, number>} targetsByMonth - maandsleutel -> target_value (mag breder zijn dan de weergegeven periode)
 * @param {Date} rangeStart - inclusief
 * @param {Date} rangeEnd - exclusief
 * @param {string[]} monthsInRange - de kalendermaand-sleutels die de weergegeven periode zelf raakt (voor de "complete"-vlag)
 * @returns {{ value: number|null, complete: boolean, dailySeries: Array<{date: string, dailyTarget: number}> }}
 */
export function buildTargetTrend(targetsByMonth, rangeStart, rangeEnd, monthsInRange) {
  const anchors = buildAnchors(targetsByMonth);
  const dailySeries = [];
  let sum = 0;
  let anyDay = false;

  let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()));
  const end = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), rangeEnd.getUTCDate()));

  while (cursor.getTime() < end.getTime()) {
    anyDay = true;
    const rate = dailyRateAt(anchors, cursor) || 0;
    sum += rate;
    dailySeries.push({ date: toMonthKeyDay(cursor), dailyTarget: rate });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const complete = anchors.length > 0 && (monthsInRange || []).every((key) => targetsByMonth.has(key));

  if (!anyDay) return { value: null, complete: false, dailySeries: [] };
  return { value: anchors.length > 0 ? Math.round(sum) : null, complete, dailySeries };
}

/** @returns {string} bv. '2026-09-08' -- volledige datumsleutel (i.t.t. toMonthKey, dat altijd -01 gebruikt). */
function toMonthKeyDay(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Meerdere maand-targets in één keer opslaan (één druk op "Opslaan" in de
 * widget i.p.v. een aparte knop per maandrij) -- één Supabase upsert-call
 * met een array van rijen, i.p.v. N losse round-trips.
 *
 * @param {Object} env
 * @param {{ metric?: string, scope?: string, items: Array<{periodMonth: string, targetValue: number}>, userId?: string|null }} params
 * @returns {Promise<Array>} de opgeslagen rijen
 */
export async function upsertTargets(env, { metric = DEFAULT_METRIC, scope = DEFAULT_SCOPE, items, userId = null }) {
  const rows = (items || [])
    .filter((item) => item.periodMonth && /^\d{4}-\d{2}-01$/.test(item.periodMonth))
    .map((item) => {
      const value = Number.parseInt(item.targetValue, 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Ongeldige targetValue voor ${item.periodMonth}: ${item.targetValue}`);
      }
      return {
        metric,
        scope,
        period_month: item.periodMonth,
        target_value: value,
        updated_by: userId,
        updated_at: new Date().toISOString()
      };
    });

  if (rows.length === 0) return [];

  const { data, error } = await db(env)
    .from(TABLE)
    .upsert(rows, { onConflict: 'metric,scope,period_month' })
    .select('period_month, target_value');

  if (error) throw new Error(`upsertTargets: ${error.message}`);
  return data;
}

/**
 * Het voortschrijdend-30-dagen-benchmarklijntje: voor elke dag in
 * [displayStart, displayEnd) vergelijkt dit de som van de REALISATIE van de
 * voorbije 30 dagen (tot en met die dag) met de som van de TARGET-LIJN
 * (de rechte stukken tussen de maandelijkse target-punten, zie buildAnchors/
 * dailyRateAt) over datzelfde venster. Dit is bewust GEEN cumulatieve som
 * sinds het begin van de periode -- dat kan alleen maar stijgen. Een
 * rollend venster kan op en neer gaan, wat precies laat zien of je op een
 * bepaald moment aan het versnellen of vertragen was t.o.v. de (vloeiende)
 * target-trend (Nico, 2026-09-08).
 *
 * @param {Array<{date: string, count: number}>} dailyActualSeries - dag-per-dag realisatie, moet [displayStart - trailingDays, displayEnd) volledig dekken
 * @param {Map<string, number>} targetsByMonth - maandsleutel -> target_value, ruim genoeg rond de periode voor vloeiende interpolatie
 * @param {Date} displayStart - eerste dag die we tonen (inclusief)
 * @param {Date} displayEnd - exclusief
 * @param {number} trailingDays - breedte van het rollend venster (standaard 30)
 * @returns {Array<{date: string, pct: number|null, avgDailyTarget: number, actualTrailing: number, targetTrailing: number}>}
 */
export function buildRollingBenchmarkSeries(dailyActualSeries, targetsByMonth, displayStart, displayEnd, trailingDays = 30) {
  const anchors = buildAnchors(targetsByMonth);

  // dailyActualSeries dekt [displayStart - trailingDays, displayEnd) -- index 0
  // is dus de dag (displayStart - trailingDays), aflopend tot displayEnd - 1 dag.
  const actualByIndex = dailyActualSeries.map((d) => d.count);
  const targetByIndex = dailyActualSeries.map((d) => {
    const [y, m, day] = d.date.split('-').map(Number);
    return dailyRateAt(anchors, new Date(Date.UTC(y, m - 1, day))) || 0;
  });

  // Prefix-sommen zodat elk rollend venster van 30 dagen O(1) i.p.v. O(30) is.
  const prefixActual = [0];
  const prefixTarget = [0];
  for (let i = 0; i < actualByIndex.length; i += 1) {
    prefixActual.push(prefixActual[i] + actualByIndex[i]);
    prefixTarget.push(prefixTarget[i] + targetByIndex[i]);
  }

  const totalDisplayDays = Math.round((displayEnd.getTime() - displayStart.getTime()) / 86400000);
  const series = [];
  for (let k = 0; k < totalDisplayDays; k += 1) {
    // Dag k (0-indexed vanaf displayStart) zit op index (trailingDays + k) in
    // dailyActualSeries. Het venster van `trailingDays` dagen dat op die dag
    // eindigt (inclusief) is index (k+1) t.e.m. (trailingDays+k).
    const windowEndIdx = trailingDays + k;
    const actualTrailing = prefixActual[windowEndIdx + 1] - prefixActual[k + 1];
    const targetTrailing = prefixTarget[windowEndIdx + 1] - prefixTarget[k + 1];

    const dateStr = dailyActualSeries[windowEndIdx].date;
    series.push({
      date: dateStr,
      pct: targetTrailing > 0 ? Math.round((actualTrailing / targetTrailing) * 1000) / 10 : null,
      avgDailyTarget: Math.round((targetTrailing / trailingDays) * 10) / 10,
      actualTrailing,
      targetTrailing: Math.round(targetTrailing)
    });
  }
  return series;
}

/**
 * Eén maand-target aanmaken/bijwerken (upsert op de unieke (metric, scope, period_month)).
 *
 * @param {Object} env
 * @param {{ metric?: string, scope?: string, periodMonth: string, targetValue: number, userId?: string|null }} params
 */
export async function upsertTarget(env, { metric = DEFAULT_METRIC, scope = DEFAULT_SCOPE, periodMonth, targetValue, userId = null }) {
  if (!periodMonth || !/^\d{4}-\d{2}-01$/.test(periodMonth)) {
    throw new Error(`Ongeldige periodMonth (verwacht YYYY-MM-01): ${periodMonth}`);
  }
  const value = Number.parseInt(targetValue, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Ongeldige targetValue: ${targetValue}`);
  }

  const { data, error } = await db(env)
    .from(TABLE)
    .upsert(
      { metric, scope, period_month: periodMonth, target_value: value, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: 'metric,scope,period_month' }
    )
    .select('period_month, target_value')
    .single();

  if (error) throw new Error(`upsertTarget: ${error.message}`);
  return data;
}
