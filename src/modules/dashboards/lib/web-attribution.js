/**
 * Dashboard "Website-bezoeken": wat leidde tot de conversie? Zie
 * website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §3.3.
 *
 * Anders dan de rest van dit tabblad gebeurt dit op de SERVER: een eerste
 * aanraking ligt vaak ver voor de gekozen periode, dus de browser heeft daar de
 * sessies niet voor. Hier worden voor wie in de periode converteerde ALLE
 * bezoeken opgehaald -- per PERSOON (zelfde e-mailadres = zelfde persoon, ook op
 * een ander toestel), niet per browser.
 *
 * Per conversie dezelfde lezing als op de lead (buildJourney in web-story):
 * eerste aanraking, laatste niet-directe, het pad. Opgeteld per kanaal:
 *   eerste  -- hoe vaak het kanaal de eerste aanraking was
 *   laatste -- hoe vaak het de laatste niet-directe was
 *   assist  -- hoe vaak het in het pad stond ZONDER de laatste te zijn
 *   positie -- 40% eerste, 40% laatste, 20% verdeeld over wat ertussen zat
 * Het verschil tussen die kolommen is het inzicht: veel assist en weinig laatste
 * = een kanaal dat deuren opent maar niet afsluit.
 */

import { readWebEvents, hasWebEvents } from '../../../lib/web-events.js';
import { readVisitorSessions, WEB_PERIODS } from './web-visits.js';
import { buildJourney } from '../../web-story/lib/journey.js';
import { exclusionKey } from '../../web-story/lib/exclusions.js';

const CACHE_SECONDS = 600;
const MAX_PERSONEN = 600;

function fmt(d) { return d.toISOString().substring(0, 19).replace('T', ' '); }
function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param {{period: string, excl?: object}} opts excl = loadExclusions() uit
 *        web-story/lib/exclusions.js: wie daar uitgesloten is, telt hier niet mee.
 */
export async function getWebAttribution(env, { period, excl = null }) {
  if (!hasWebEvents(env)) return { available: false };
  const uit = u => !!(excl && excl.uuids.has(u));
  const days = WEB_PERIODS[period] || 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  // 1. Wie converteerde in de periode?
  const conv = await readWebEvents(env,
    `SELECT DISTINCT e.visitor_uuid AS u, lower(v.email) AS email
     FROM events e JOIN visitors v ON v.uuid = e.visitor_uuid
     WHERE e.type IN ('form_submission','calendly') AND e.ts >= ? AND e.ts < ?
       AND v.is_internal = 0 AND v.is_bot = 0`, [fmt(start), fmt(end)]);
  const alle = conv.results || [];
  const rows = alle.filter(r => !uit(r.u));
  const uitgesloten = new Set(alle.filter(r => uit(r.u)).map(r => r.email || r.u)).size;

  // 2. Persoon = e-mailadres (anders de browser); alle browsers met dat adres erbij.
  const personVan = new Map();
  for (const r of rows) personVan.set(r.u, r.email || r.u);
  const emails = [...new Set(rows.map(r => r.email).filter(Boolean))];
  for (let i = 0; i < emails.length; i += 90) {
    const part = emails.slice(i, i + 90);
    const res = await readWebEvents(env,
      `SELECT uuid, lower(email) AS email FROM visitors WHERE lower(email) IN (${part.map(() => '?').join(',')})
         AND is_internal = 0 AND is_bot = 0`, part);
    for (const r of res.results || []) if (!uit(r.uuid)) personVan.set(r.uuid, r.email);
  }
  const personen = [...new Set(personVan.values())];
  const afgekapt = Math.max(0, personen.length - MAX_PERSONEN);
  const gekozen = new Set(personen.slice(0, MAX_PERSONEN));
  const uuids = [...personVan.entries()].filter(([, p]) => gekozen.has(p)).map(([u]) => u);

  // 3. Alle sessies van die browsers, per persoon.
  const sessions = await readVisitorSessions(env, uuids);
  const perPersoon = new Map();
  for (const s of sessions) {
    const p = personVan.get(s.uuid);
    if (!perPersoon.has(p)) perPersoon.set(p, []);
    perPersoon.get(p).push(s);
  }

  // 4. Per persoon de EERSTE conversie in de periode; het pad tot daar.
  const kanalen = {};
  const kanaal = ch => (kanalen[ch] = kanalen[ch] || { eerste: 0, laatste: 0, assist: 0, positie: 0 });
  const paden = new Map();
  const dagen = [];
  const bezoeken = [];
  const startTs = fmt(start);
  let conversies = 0;
  for (const list of perPersoon.values()) {
    const conversie = list.find(s => s.start >= startTs && s.conversions.calendly + s.conversions.forms > 0);
    if (!conversie) continue;
    const tot = list.filter(s => s.start <= conversie.start);
    const j = buildJourney(tot, { atConversion: conversie.start });
    if (!j) continue;
    conversies++;
    kanaal(j.eerste.channel).eerste++;
    if (j.laatste) kanaal(j.laatste.channel).laatste++;
    const inPad = new Set(j.pad.map(p => p.channel));
    if (j.laatste) inPad.delete(j.laatste.channel);
    for (const ch of inPad) kanaal(ch).assist++;
    // Positie: per bezoek, niet per samengevoegde stap.
    const reeks = [];
    for (const p of j.pad) for (let k = 0; k < p.n; k++) reeks.push(p.channel);
    if (reeks.length === 1) kanaal(reeks[0]).positie += 1;
    else if (reeks.length === 2) { kanaal(reeks[0]).positie += 0.5; kanaal(reeks[1]).positie += 0.5; }
    else {
      kanaal(reeks[0]).positie += 0.4;
      kanaal(reeks[reeks.length - 1]).positie += 0.4;
      const midden = reeks.slice(1, -1);
      for (const ch of midden) kanaal(ch).positie += 0.2 / midden.length;
    }
    const sleutel = j.pad.map(p => p.channel).join(' → ');
    paden.set(sleutel, (paden.get(sleutel) || 0) + 1);
    if (j.dagen !== null) dagen.push(j.dagen);
    bezoeken.push(j.sessies);
  }

  return {
    available: true,
    period,
    conversies,
    afgekapt,
    uitgesloten,   // personen die converteerden maar op de uitgesloten lijst staan
    kanalen: Object.entries(kanalen).map(([channel, v]) => ({ channel, ...v, positie: Math.round(v.positie * 10) / 10 }))
      .sort((a, b) => b.positie - a.positie),
    paden: [...paden.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pad, n]) => ({ pad, n })),
    mediaan_dagen: median(dagen),
    mediaan_bezoeken: median(bezoeken),
    meer_dan_een_bezoek: bezoeken.filter(n => n > 1).length,
  };
}

export async function getWebAttributionCached(env, ctx, { period, excl = null }) {
  // De uitgesloten lijst zit in de sleutel: wie er een persoon bijzet of weghaalt,
  // ziet het meteen en niet pas na tien minuten.
  const key = new Request(`https://om-cache.internal/dashboards/web-attribution/${period}/${exclusionKey(excl)}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }
  const data = await getWebAttribution(env, { period, excl });
  if (cache && data.available) {
    const put = cache.put(key, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
    }));
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  return data;
}
