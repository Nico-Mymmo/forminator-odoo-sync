/**
 * Dashboards — tab "Website-bezoeken".
 *
 * Bron: de D1-database van de website-tracker (src/lib/web-events.js, alleen
 * lezen). Eén rij per event; sessies, duur, kanaal en engagement zijn NERGENS
 * opgeslagen en worden hier afgeleid, met dezelfde regels als de tracker
 * (website-tracker/docs/ontwerp-web-visitor-events.md §5):
 *   - sessie: nieuw na 30 min stilte of na een exit-klik (§5.2)
 *   - geëngageerd: >1 pagina, een betekenisvolle klik, een conversie, een
 *     terugkeer naar de tab, >5 s op een pagina of >= 75% gescrold (§5.7)
 *
 * De server doet het zware werk (één SQL-query die per sessie samenvat) en
 * stuurt COMPACTE SESSIES naar de browser; filteren en doorklikken gebeurt daar,
 * zodat een klik op een kanaal of landingspagina geen nieuwe query kost.
 * De vorige, even lange periode komt mee voor de vergelijking.
 *
 * Kosten: één query per periode, en het antwoord wordt 10 minuten in de
 * edge-cache bewaard. D1 rekent per gelezen rij; een jaar bezoeken is enkele
 * honderdduizenden rijen, tegen 25 miljard inbegrepen per maand.
 */
import { readWebEvents, hasWebEvents } from '../../../lib/web-events.js';

export const WEB_PERIODS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
const CACHE_SECONDS = 600;

// __WHERE__ wordt ingevuld: een periode voor het dashboard, een set bezoekers
// voor het verhaal op een lead (readVisitorSessions). Dezelfde sessie-indeling.
const SESSIONS_SQL_TEMPLATE = `
WITH ev AS (
  SELECT e.visitor_uuid AS u, e.ts, e.type, e.page, e.data, e.bron,
         COALESCE(e.site, v.site) AS site, v.first_seen AS vfirst, v.first_utm AS fu
  FROM events e JOIN visitors v ON v.uuid = e.visitor_uuid
  WHERE __WHERE__
    AND v.is_internal = 0 AND v.is_bot = 0 AND e.type <> 'scroll'
),
g AS (
  SELECT ev.*,
    CASE WHEN LAG(ts) OVER w IS NULL
           OR (julianday(ts) - julianday(LAG(ts) OVER w)) * 86400 >= 1800
           OR json_extract(LAG(data) OVER w, '$.is_exit') = 1
         THEN 1 ELSE 0 END AS ns
  FROM ev WINDOW w AS (PARTITION BY u ORDER BY ts)
),
s0 AS (
  SELECT g.*, SUM(ns) OVER (PARTITION BY u ORDER BY ts ROWS UNBOUNDED PRECEDING) AS sid FROM g
)
SELECT u,
  MIN(ts) AS st, MAX(ts) AS en, MAX(site) AS site, MAX(vfirst) AS vf, MAX(fu) AS fu,
  json_group_array(CASE WHEN type = 'page' THEN page END) AS pg,
  json_group_array(CASE WHEN type = 'page' THEN json_extract(data,'$.search') END) AS zq,
  MIN(CASE WHEN type IN ('touchpoint','ai_referral','email_referral')
      THEN ts || '|' || COALESCE(json_extract(data,'$.medium'),'') || '|' || COALESCE(json_extract(data,'$.source'),'')
           || '|' || COALESCE(json_extract(data,'$.campaign'),'') END) AS tp,
  MIN(CASE WHEN type = 'page' THEN ts || '|' || COALESCE(json_extract(data,'$.utm.medium'),'') || '|'
           || COALESCE(json_extract(data,'$.utm.source'),'') || '|' || COALESCE(json_extract(data,'$.utm.campaign'),'') END) AS ut,
  MIN(CASE WHEN type = 'page' THEN ts || '|' || COALESCE(json_extract(data,'$.referer'),'') END) AS rf,
  SUM(type = 'click' AND COALESCE(json_extract(data,'$.text'),'') NOT IN ('','×','x','X')) AS ck,
  SUM(type = 'click' AND (json_extract(data,'$.text') LIKE '%+32%' OR json_extract(data,'$.text') LIKE '%@%')) AS ct,
  SUM(type = 'calendly') AS ca, SUM(type = 'event_registration') AS er, SUM(type = 'form_submission') AS fs,
  SUM(type = 'partner_login') AS pl, SUM(type = 'resume') AS rs,
  MAX(COALESCE(json_extract(data,'$.duration'), json_extract(data,'$.dwell_s'), 0)) AS md,
  MAX(COALESCE(json_extract(data,'$.sd'), 0)) AS sd,
  MIN(CASE WHEN type = 'page' THEN json_extract(data,'$.device.device_type') END) AS dv,
  MIN(CASE WHEN type = 'page' THEN json_extract(data,'$.device.in_app') END) AS ia,
  MIN(CASE WHEN type = 'page' THEN json_extract(data,'$.cf_country') END) AS co,
  MAX(bron = 'odoo-historiek') AS hi
FROM s0 GROUP BY u, sid`;
const SESSIONS_SQL = SESSIONS_SQL_TEMPLATE.replace('__WHERE__', 'e.ts >= ?1 AND e.ts < ?2');

// ─── Kanalen ─────────────────────────────────────────────────────────────────
// Eén plek. Volgorde van de bronnen: het touchpoint van de sessie (advertentie-
// of UTM-klik), dan de UTM op de eerste pagina, dan (enkel voor de allereerste
// sessie van een bezoeker) de UTM die op de bezoeker staat, en pas dan de
// verwijzer. Oude historiek heeft geen verwijzer: daar is "Direct / onbekend"
// dus groter dan het in werkelijkheid was.

export const CHANNELS = [
  'Betaald zoeken', 'Betaalde social', 'Betaald overig', 'E-mail', 'Organisch zoeken',
  'Social organisch', 'AI-assistenten', 'Verwijzing', 'Eigen sites', 'Direct / onbekend',
];

const SEARCH_HOSTS = /(^|\.)(google|bing|ecosia|duckduckgo|yahoo|qwant|startpage|brave|yandex|baidu)\./;
const SOCIAL_HOSTS = /(^|\.)(facebook|fb|instagram|linkedin|lnkd|t|x|twitter|tiktok|youtube|pinterest|reddit)\.(com|co|be|in|me)$/;
const AI_HOSTS = /(chatgpt\.com|openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com|mistral\.ai)/;
const OWN_HOSTS = /(^|\.)(openvme\.be|syndicoach\.be)$/;
// Een klik in een mailapp heeft geen UTM maar wel deze verwijzer (gemeten:
// android-app://com.google.android.gm/). Zonder deze regel was dat "Verwijzing".
const MAIL_HOSTS = /(^|\.)(mail\.google\.com|com\.google\.android\.gm|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|com\.microsoft\.office\.outlook|mail\.yahoo\.com|webmail\.[a-z.]+)$/;

function classifyTagged(medium, source) {
  const m = (medium || '').toLowerCase();
  const s = (source || '').toLowerCase();
  if (!m && !s) return null;
  if (m === 'ai_organic' || AI_HOSTS.test(s) || /chatgpt|perplexity|copilot|gemini/.test(s)) return 'AI-assistenten';
  if (/e-?mail|newsletter|nieuwsbrief/.test(m) || /mail/.test(s)) return 'E-mail';
  if (/cpc|ppc|paid|display|cpm/.test(m)) {
    if (/google|bing|adwords/.test(s)) return 'Betaald zoeken';
    if (/facebook|meta|instagram|linkedin|tiktok|fb/.test(s)) return 'Betaalde social';
    return m === 'cpc' ? 'Betaald zoeken' : 'Betaald overig';
  }
  if (/social/.test(m)) return 'Social organisch';
  if (/organic/.test(m)) return 'Organisch zoeken';
  if (/referral|website/.test(m)) return 'Verwijzing';
  return 'Betaald overig';
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { return null; }
}

function part(str, i) {
  if (!str) return '';
  const p = str.split('|');
  return p[i] || '';
}

export function channelOf(row) {
  // 1. touchpoint in de sessie
  if (row.tp) {
    const [medium, source, campaign] = [part(row.tp, 1), part(row.tp, 2), part(row.tp, 3)];
    const ch = classifyTagged(medium, source);
    if (ch) return [ch, detailOf(ch, medium, source, campaign)];
  }
  // 2. UTM op de eerste pagina
  if (row.ut) {
    const [medium, source, campaign] = [part(row.ut, 1), part(row.ut, 2), part(row.ut, 3)];
    const ch = classifyTagged(medium, source);
    if (ch) return [ch, detailOf(ch, medium, source, campaign)];
  }
  // 3. eerste sessie van de bezoeker: de UTM op de bezoeker
  if (row.fu && row.vf && Math.abs(Date.parse(row.st + 'Z') - Date.parse(row.vf + 'Z')) < 30 * 60 * 1000) {
    try {
      const u = JSON.parse(row.fu);
      const ch = classifyTagged(u.medium, u.source);
      if (ch) return [ch, detailOf(ch, u.medium, u.source, u.campaign)];
    } catch (_) { /* geen geldige utm */ }
  }
  // 4. verwijzer
  const ref = row.rf ? row.rf.slice(row.rf.indexOf('|') + 1) : '';
  const host = ref ? hostOf(ref) : null;
  if (host) {
    const own = (row.site || '').replace(/^www\./, '');
    if (own && (host === own || host.endsWith('.' + own))) return ['Direct / onbekend', '(binnen de site)'];
    if (MAIL_HOSTS.test(host)) return ['E-mail', host];
    if (AI_HOSTS.test(host)) return ['AI-assistenten', host];
    if (SEARCH_HOSTS.test(host)) return ['Organisch zoeken', host];
    if (SOCIAL_HOSTS.test(host)) return ['Social organisch', host];
    if (OWN_HOSTS.test(host)) return ['Eigen sites', host];
    return ['Verwijzing', host];
  }
  return ['Direct / onbekend', ''];
}

function detailOf(ch, medium, source, campaign) {
  const c = campaign && campaign !== 'unknown' ? campaign : '';
  const s = source && source !== 'unknown' ? source : '';
  if (ch === 'E-mail') return c || s || medium || '';
  if (ch === 'AI-assistenten') return s || medium;
  return c ? (s ? `${c} (${s})` : c) : (s || medium || '');
}

// ─── Compacte vorm ───────────────────────────────────────────────────────────

function fmt(d) { return d.toISOString().substring(0, 19).replace('T', ' '); }

/**
 * Sessies van [start - lengte, eind): de huidige periode en de vorige.
 * Kolommen per sessie (zie `cols` in het antwoord). Strings zitten in
 * woordenboeken (`dict`) zodat een pad of kanaal één keer over de lijn gaat.
 */
export async function getWebVisitsData(env, { period }) {
  if (!hasWebEvents(env)) {
    return { available: false, reason: 'De D1-binding WEB_EVENTS is nog niet ingesteld op deze Worker.' };
  }
  const days = WEB_PERIODS[period] || 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const prevStart = new Date(start.getTime() - days * 86400000);

  const res = await readWebEvents(env, SESSIONS_SQL, [fmt(prevStart), fmt(end)]);
  const rows = res.results || [];

  const dict = { v: [], p: [], ch: CHANNELS.slice(), det: [], site: [], dev: [], co: [], ia: [], zk: [] };
  const idx = {};
  function id(kind, value) {
    if (value === null || value === undefined || value === '') return -1;
    const key = kind + '\u0000' + value;
    if (idx[key] === undefined) { idx[key] = dict[kind].length; dict[kind].push(value); }
    return idx[key];
  }
  for (let i = 0; i < CHANNELS.length; i++) idx['ch\u0000' + CHANNELS[i]] = i;

  const startTs = fmt(start);
  const sessions = [];
  let oudsteLive = null;
  for (const r of rows) {
    let pages = [];
    try { pages = JSON.parse(r.pg || '[]').filter(Boolean); } catch (_) { pages = []; }
    // Zoektermen in kleine letters: "Syndicus" en "syndicus" zijn dezelfde vraag.
    let zoek = [];
    try { zoek = JSON.parse(r.zq || '[]').filter(Boolean).map(z => String(z).trim().toLowerCase()).filter(Boolean); } catch (_) { zoek = []; }
    const [ch, det] = channelOf(r);
    const dur = Math.max(0, Math.round((Date.parse(r.en + 'Z') - Date.parse(r.st + 'Z')) / 1000), Number(r.md) || 0);
    const distinct = new Set(pages).size;
    const conv = (r.ca || 0) + (r.er || 0) + (r.fs || 0);
    const engaged = distinct > 1 || (r.ck || 0) > 0 || conv > 0 || (r.pl || 0) > 0 || (r.rs || 0) > 0
      || (Number(r.md) || 0) > 5 || (Number(r.sd) || 0) >= 75;
    const isNew = !!(r.vf && Math.abs(Date.parse(r.st + 'Z') - Date.parse(r.vf + 'Z')) < 30 * 60 * 1000);
    if (!r.hi && (!oudsteLive || r.st < oudsteLive)) oudsteLive = r.st;
    sessions.push([
      id('v', r.u),                       // 0 bezoeker
      Math.round(Date.parse(r.st + 'Z') / 1000), // 1 start (unix s)
      dur,                                // 2 duur (s)
      id('site', r.site),                 // 3 site
      idx['ch\u0000' + ch],               // 4 kanaal
      id('det', det),                     // 5 kanaaldetail (campagne, bron, host)
      pages.map(p => id('p', p)),         // 6 pagina's, in volgorde
      (engaged ? 1 : 0) | (isNew ? 2 : 0) | (r.hi ? 4 : 0) | (r.st < startTs ? 8 : 0), // 7 vlaggen
      r.ck || 0,                          // 8 klikken
      r.ct || 0,                          // 9 contactklikken (tel/mail)
      r.ca || 0,                          // 10 afspraken (Calendly)
      r.er || 0,                          // 11 event-inschrijvingen
      r.fs || 0,                          // 12 formulieren
      id('dev', r.dv),                    // 13 toestel
      id('co', r.co),                     // 14 land
      id('ia', r.ia),                     // 15 in-app-browser
      r.vf ? Math.round(Date.parse(r.vf + 'Z') / 1000) : null, // 16 eerste bezoek ooit
      zoek.map(z => id('zk', z)),         // 17 zoektermen op de site
    ]);
  }

  return {
    available: true,
    period, days,
    range: { start: fmt(start), end: fmt(end), prevStart: fmt(prevStart) },
    generatedAt: fmt(end),
    oudsteLive,
    flags: { engaged: 1, isNew: 2, historic: 4, previous: 8 },
    cols: ['v', 'start', 'dur', 'site', 'ch', 'det', 'pages', 'flags', 'clicks', 'contact', 'calendly', 'events', 'forms', 'dev', 'co', 'inapp', 'firstSeen', 'search'],
    dict,
    sessions,
    meta: { rowsRead: res.meta?.rows_read ?? null, ms: res.meta?.duration ?? null },
  };
}

/**
 * De sessies van een set bezoekers, met hun kanaal: de bron voor het verhaal op
 * een lead of actieblad (src/modules/web-story). Zelfde SQL en zelfde
 * kanaalindeling als het dashboard; er bestaat geen tweede versie van een van beide.
 * @returns {Promise<Array<{uuid, start, end, site, channel, detail, pages, conversions, historic}>>}
 */
export async function readVisitorSessions(env, uuids) {
  const list = [...new Set(uuids || [])];
  const out = [];
  for (let i = 0; i < list.length; i += 50) {
    const part = list.slice(i, i + 50);
    const sql = SESSIONS_SQL_TEMPLATE.replace('__WHERE__', `e.visitor_uuid IN (${part.map(() => '?').join(',')})`);
    const res = await readWebEvents(env, sql, part);
    for (const r of res.results || []) {
      let pages = [];
      try { pages = JSON.parse(r.pg || '[]').filter(Boolean); } catch (_) { pages = []; }
      const [channel, detail] = channelOf(r);
      out.push({
        uuid: r.u, start: r.st, end: r.en, site: r.site || null, channel, detail: detail || '',
        pages, conversions: { calendly: r.ca || 0, events: r.er || 0, forms: r.fs || 0 },
        historic: !!r.hi,
      });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Met edge-cache: dezelfde periode wordt hoogstens elke 10 minuten opnieuw berekend. */
export async function getWebVisitsCached(env, ctx, { period }) {
  const key = new Request(`https://om-cache.internal/dashboards/web-visits/${period}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }
  const data = await getWebVisitsData(env, { period });
  if (cache && data.available) {
    const resp = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
    });
    const put = cache.put(key, resp);
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  return data;
}
