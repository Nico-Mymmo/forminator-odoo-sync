/**
 * Tabblad Aanvragen — wat GET /dashboards/api/aanvragen teruggeeft.
 *
 * TERREIN VAN DAVID: lees eerst CLAUDE.md in deze map.
 *
 * De route (src/modules/dashboards/routes.js) geeft ALLE queryparameters door
 * en verpakt wat hier terugkomt als { success: true, data }. Een nieuwe filter of
 * een nieuw onderdeel van het antwoord vraagt dus geen wijziging aan de route:
 * lees de parameter hier, valideer hem hier.
 *
 * @module modules/dashboards/lib/aanvragen
 */
import { getTargetsForMonths, buildTargetTrend } from '../aanvragen-bronnen.js';
import { getInstroomData, buildBuckets, buildTargetWindows } from './instroom.js';

/**
 * Alle kalendermaand-sleutels (YYYY-MM-01) die overlappen met [start, end).
 * Gebruikt om vooraf de juiste rijen bij Supabase op te vragen (getTargetsForMonths)
 * vóór buildTargetTrend() de eigenlijke dag-per-dag optelling doet.
 */
function monthKeysInRange(start, end) {
  const keys = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor.getTime() <= last.getTime()) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return keys;
}

/** '2026-09-01' -> '2026-08-01' (shift -1) of '2026-10-01' (shift +1). */
function shiftMonthKey(monthKey, deltaMonths) {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * @param {Object} env
 * @param {Object<string, string>} params - de queryparameters (period, scope, ...)
 * @returns {Promise<Object>}
 */
export async function getAanvragen(env, params = {}) {
  const data = await getInstroomData(env, { period: params.period, scope: params.scope });

  // Marketingbenchmark: per dag geprorateerd op de maand-target van die dag
  // (target_value / dagen in die maand), zodat een rollend 30-dagen-venster (dat
  // meestal 2 kalendermaanden overlapt) én een 6-maanden-venster allebei een
  // eerlijke vergelijking krijgen. Zie lib/targets.js voor de volledige uitleg.
  // Targets zijn scope-gebonden: bij "Syndicoach" gefilterd vergelijken we tegen
  // het Syndicoach-target, niet tegen het totaal-target.
  const rangeStart = new Date(data.range.start.replace(' ', 'T') + 'Z');
  const rangeEnd = new Date(data.range.end.replace(' ', 'T') + 'Z');
  const monthKeys = monthKeysInRange(rangeStart, rangeEnd);
  // Eén maand vóór en na de weergegeven periode meevragen: buildTargetTrend
  // interpoleert tussen maand-MIDDENS, dus die extra maanden maken de curve net
  // aan het begin/einde van de periode vloeiend i.p.v. daar plat te
  // extrapoleren vanaf de eerste/laatste maand die in beeld is.
  const paddedMonthKeys = [monthKeys[0], ...monthKeys, monthKeys[monthKeys.length - 1]]
    .map((key, idx) => (idx === 0 ? shiftMonthKey(key, -1) : idx === monthKeys.length + 1 ? shiftMonthKey(key, 1) : key));
  const targetsByMonth = await getTargetsForMonths(env, { scope: data.scope, periodMonths: [...new Set(paddedMonthKeys)] });
  data.target = buildTargetTrend(targetsByMonth, rangeStart, rangeEnd, monthKeys);

  // De grafieken VOLGEN de periodekeuze (Nico, 2026-09-28):
  //  - series: staafgrafiek per kanaal, per dag/week/maand (PERIOD_GRANULARITY)
  //  - targetWindows: realisatie tegen target, ALTIJD per maand -- een target
  //    per dag of per week wordt bewust nergens getoond.
  const dailyTargets = data.target.value === null ? null : data.target.dailySeries;
  const channelKeys = Object.keys(data.brandLabels);
  data.series = buildBuckets(data.daily, dailyTargets, data.granularity, channelKeys);
  data.targetWindows = buildTargetWindows(data.daily, dailyTargets, data.period, rangeEnd, channelKeys);
  delete data.target.dailySeries;
  delete data.daily; // zit volledig in data.series

  return data;
}
