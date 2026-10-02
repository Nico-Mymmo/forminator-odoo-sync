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
import { offerteFormulieren } from '../../../lib/web-conversions.js';

export const WEB_PERIODS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
const CACHE_SECONDS = 600;

// ─── Inloggen en ruisklikken ─────────────────────────────────────────────────
// Gemeten sept 2026: 13% van alle bezoeken was ENKEL inloggen (homepage, klik op
// "Inloggen", weg) en 11% van de bezoekers logt ooit in. Dat zijn klanten op weg
// naar het platform, geen prospecten: ze drukken de duur en blazen "doet er iets
// mee" op. EEN definitie, hier, voor dashboard, Webgedrag, het verhaal op de lead
// en de attributie.
//   - een inlogklik: exit_type 'login' (de snippet zet dat) of een van LOGIN_TEXTS;
//   - een bezoek dat ENKEL inloggen is: isLoginOnly();
//   - een KLANT vanaf zijn eerste login (readFirstLogins + isCustomerSession): zijn
//     bezoeken daarvoor blijven prospectgedrag -- dat is net de weg naar ons toe.
// Klikken op de cookiebanner en de inlogklik zelf tellen niet als betrokkenheid.
export const LOGIN_TEXTS = ['Inloggen', 'Login', 'Log in', 'Se connecter', 'Connexion'];
const NOISE_TEXTS = ['', '×', 'x', 'X', 'Accepteer alles', 'Alles accepteren', 'Alles afwijzen', 'Alles weigeren',
  'Voorkeuren opslaan', 'Tout accepter', 'Tout refuser', 'Accepter', 'Refuser'];
const sqlList = list => list.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
const LOGIN_CLICK = `(type = 'click' AND (json_extract(data,'$.exit_type') = 'login' OR json_extract(data,'$.text') IN (${sqlList(LOGIN_TEXTS)})))`;

/** Homepage, een inlogklik, en verder niets: geen andere pagina, geen advertentie, geen aanvraag. */
export function isLoginOnly(r) {
  return (r.lg || 0) > 0 && (r.op || 0) === 0 && !r.tp && !((r.ca || 0) + (r.er || 0) + (r.fs || 0));
}

/** uuid -> tijdstip van de eerste inlogklik (of partner-login), over de hele historiek. */
export async function readFirstLogins(env) {
  const res = await readWebEvents(env,
    `SELECT visitor_uuid AS u, MIN(ts) AS t FROM events
     WHERE ${LOGIN_CLICK} OR type = 'partner_login'
     GROUP BY visitor_uuid`);
  return new Map((res.results || []).map(r => [r.u, r.t]));
}

/** Een sessie is van een klant als ze eindigt op of na diens eerste login. */
export function isCustomerSession(firstLogins, r) {
  const t = firstLogins.get(r.u);
  return !!t && r.en >= t;
}

// ─── Heropende advertentielinks (2026-10-02) ─────────────────────────────────
// Google maakt bij ELKE advertentieklik een nieuwe gclid. Staat dezelfde gclid er
// later opnieuw, dan is dat geen nieuwe klik maar dezelfde link, opnieuw geopend:
// een bladwijzer, de suggestie in de adresbalk, een herstelde tab, of een link die
// iemand doorstuurde. De tracker maakt bij elke URL met advertentieparameters een
// touchpoint, dus zonder deze regel telde zo'n bezoek als "Betaald zoeken" -- ook
// als laatste aanraking voor een conversie. Gemeten 2026-10-02: een prospect opende
// zo sinds 27 juni ~90 keer dezelfde pmax-link (zelfde gclid, nooit een verwijzer).
// Over alle touchpoints met een klik-id: 263 hergebruikt, waarvan 253 in een ANDERE
// browser dan de eerste klik (cookie verlopen, ander toestel). Daarom globaal op de
// klik-id en niet per bezoeker.
// De sleutel is het stuk landingspagina VANAF de klik-parameter (64 tekens): een
// identieke URL geeft een identieke sleutel. Enkel touchpoints met de volledige
// landingspagina hebben er een (live sinds 29-09-2026, en het deel van de oude
// historiek dat uit x_ad_touchpoint kwam). Voor de rest van de oude historiek is het
// NIET na te gaan en blijft het een advertentieklik, met die vermelding erbij
// (`klikOnbekend`). "Zelfde persoon, campagne en pagina" als vervanging is gemeten
// en verworpen: 14 echte nieuwe kliks tegen 10 heropende -- vaker fout dan juist.
const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id'];
function clickKeySql(col) {
  return 'CASE ' + CLICK_PARAMS.map(p => `WHEN instr(${col}, '${p}=') > 0 THEN substr(${col}, instr(${col}, '${p}='), 64)`).join(' ') + ' END';
}
const REOPENED_SQL = `
WITH t AS (SELECT ts, json_extract(data,'$.odoo.x_studio_landing_page') AS lp FROM events WHERE type = 'touchpoint'),
k AS (SELECT ts, ${clickKeySql('lp')} AS ck FROM t)
SELECT ck AS k, MIN(ts) AS t FROM k WHERE ck IS NOT NULL GROUP BY ck HAVING COUNT(*) > 1`;
const REOPENED_MEMO_MS = 10 * 60 * 1000;
let reopenedMemo = null;

/**
 * Klik-sleutel -> tijdstip van de EERSTE klik, enkel voor sleutels die meer dan eens
 * voorkomen (de rest kan niet heropend zijn). Tien minuten in het geheugen van de
 * isolate: de push naar Odoo vraagt dit per lead op.
 */
export async function readReopenedClicks(env) {
  if (reopenedMemo && Date.now() - reopenedMemo.at < REOPENED_MEMO_MS) return reopenedMemo.map;
  const res = await readWebEvents(env, REOPENED_SQL);
  const map = new Map((res.results || []).map(r => [r.k, r.t]));
  reopenedMemo = { at: Date.now(), map };
  return map;
}

// ─── Popup en formulieren (mymmo-forms >= 1.22) ──────────────────────────────
// `fu` hieronder: per sessie de popup-events (type form_ui: open, tab, stap, start,
// submit, close), de inzendingen (verstuurd, met de formulier-slug) en -- voor de
// tijd van VOOR die events bestonden -- de klikken waaruit de offertetrechter
// GESCHAT wordt (web-story/lib/behaviour.js, funnelVan). Bewust enkel de teksten van
// de offertepopup op syndicoach.be: die bestaan nergens anders op de site. Een
// tekst die ook buiten de popup voorkomt, zou de schatting vervalsen.
export const POPUP_KLIKKEN = ['vraag je offerte aan', 'bereken je prijsofferte', 'volgende', 'vorige', 'versturen'];

// __WHERE__ wordt ingevuld: een periode voor het dashboard, een set bezoekers
// voor het verhaal op een lead (readVisitorSessions). Dezelfde sessie-indeling.
// ACTIES (2026-10-03). Een AANVRAAG = fs + ca. De rest zijn eigen acties:
//   fs  form_submission    contact- of offerteformulier (de OM meldt het, soort 'aanvraag')
//   ca  calendly           een NIEUWE boeking (kennismaking, demo)
//   er  event_registration inschrijving voor een event
//   nb  newsletter_signup  nieuwsbrief
//   ac  academy_signup     academy
//   rg  klik naar het app-domein (exit_type 'register'): registratie GESTART -- of ze
//       daar afgerond werd, ziet de tracker niet.
//   cv  dezelfde zes, als lijst "tijdstip~type": WAAR in het bezoek ze gebeurden, voor
//       de padverkenner van Webgedrag (web-story/lib/behaviour.js). Volgt de SUM's
//       hieronder: wijzig je een voorwaarde, wijzig ze op beide plekken.
//   tk  "tijdstip|klik-sleutel" van het eerste touchpoint: is het een heropende
//       advertentielink? (readReopenedClicks hierboven, channelOf hieronder)
//   fu  popup en formulieren: "tijdstip~act~form~stap_n~stappen~stap" per event (zie
//       POPUP_KLIKKEN hierboven); gelezen door funnelVan() in web-story/lib/behaviour.js.
//   oq  OFFERTE: een form_submission van een koppeling met web_action 'offerte'.
//       Telt OOK in fs (een offerte is een aanvraag) en staat in cv als '~offerte'.
//       __OFFERTE__ wordt ingevuld door offerteSql() hieronder, bij het LEZEN: zo
//       geldt het ook voor inzendingen van voor iemand "Offerte" aanduidde.
// De soort van een formulier komt uit conversieSoort() in src/lib/web-conversions.js.
// (Bewust geen SQL-commentaar in de query zelf: een '--' op een samengevoegde regel
// zou de rest van de query uitschakelen.)
const SESSIONS_SQL_TEMPLATE = `
WITH ev AS (
  SELECT e.visitor_uuid AS u, e.ts, e.type, e.page, e.data, e.bron,
         CASE WHEN e.type = 'touchpoint' THEN json_extract(e.data,'$.odoo.x_studio_landing_page') END AS lp,
         COALESCE(e.site, v.site) AS site, v.first_seen AS vfirst, v.first_utm AS fu,
         (v.email IS NOT NULL AND v.email <> '') AS kn
  FROM events e JOIN visitors v ON v.uuid = e.visitor_uuid
  WHERE __WHERE__
    __INTERNAL__ AND v.is_bot = 0 AND e.type <> 'scroll'
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
  json_group_array(CASE WHEN type = 'page' THEN ts END) AS pt,
  json_group_array(CASE WHEN type = 'page' THEN json_extract(data,'$.search') END) AS zq,
  GROUP_CONCAT(CASE WHEN type = 'form_submission' AND (__OFFERTE__) THEN ts || '~offerte'
                    WHEN type IN ('form_submission','calendly','event_registration','newsletter_signup','academy_signup') THEN ts || '~' || type
                    WHEN type = 'click' AND json_extract(data,'$.exit_type') = 'register' THEN ts || '~register' END, ',') AS cv,
  GROUP_CONCAT(CASE
      WHEN type = 'form_ui' THEN ts || '~' || COALESCE(json_extract(data,'$.act'),'') || '~' || COALESCE(json_extract(data,'$.form'),'')
           || '~' || COALESCE(json_extract(data,'$.stap_n'),'') || '~' || COALESCE(json_extract(data,'$.stappen'),'') || '~' || COALESCE(json_extract(data,'$.stap'),'')
      WHEN type IN ('form_submission','newsletter_signup','academy_signup','form_other') THEN ts || '~verstuurd~' || COALESCE(json_extract(data,'$.form_slug'),'') || '~~~'
      WHEN type = 'calendly' THEN ts || '~verstuurd~calendly~~~'
      WHEN type = 'click' AND lower(COALESCE(json_extract(data,'$.text'),'')) IN (${sqlList(POPUP_KLIKKEN)})
           THEN ts || '~klik~' || lower(json_extract(data,'$.text')) || '~~~'
    END, ',') AS fu,
  MIN(CASE WHEN type IN ('touchpoint','ai_referral','email_referral')
      THEN ts || '|' || COALESCE(json_extract(data,'$.medium'),'') || '|' || COALESCE(json_extract(data,'$.source'),'')
           || '|' || COALESCE(json_extract(data,'$.campaign'),'') END) AS tp,
  MIN(CASE WHEN type = 'touchpoint' THEN ts || '|' || COALESCE(${clickKeySql('lp')}, '') END) AS tk,
  MIN(CASE WHEN type = 'page' THEN ts || '|' || COALESCE(json_extract(data,'$.utm.medium'),'') || '|'
           || COALESCE(json_extract(data,'$.utm.source'),'') || '|' || COALESCE(json_extract(data,'$.utm.campaign'),'') END) AS ut,
  MIN(CASE WHEN type = 'page' THEN ts || '|' || COALESCE(json_extract(data,'$.referer'),'') END) AS rf,
  SUM(type = 'click' AND COALESCE(json_extract(data,'$.text'),'') NOT IN (${sqlList(NOISE_TEXTS)}) AND NOT ${LOGIN_CLICK}) AS ck,
  SUM(${LOGIN_CLICK}) AS lg,
  SUM(type = 'page' AND page <> '/') AS op,
  SUM(type = 'click' AND (json_extract(data,'$.text') LIKE '%+32%' OR json_extract(data,'$.text') LIKE '%@%')) AS ct,
  SUM(type = 'calendly') AS ca, SUM(type = 'event_registration') AS er, SUM(type = 'form_submission') AS fs,
  SUM(type = 'form_submission' AND (__OFFERTE__)) AS oq,
  SUM(type = 'newsletter_signup') AS nb, SUM(type = 'academy_signup') AS ac,
  SUM(type = 'click' AND json_extract(data,'$.exit_type') = 'register') AS rg,
  SUM(type = 'partner_login') AS pl, SUM(type = 'resume') AS rs,
  MAX(COALESCE(json_extract(data,'$.duration'), json_extract(data,'$.dwell_s'), 0)) AS md,
  MAX(COALESCE(json_extract(data,'$.sd'), 0)) AS sd,
  MIN(CASE WHEN type = 'page' THEN json_extract(data,'$.device.device_type') END) AS dv,
  MIN(CASE WHEN type = 'page' THEN json_extract(data,'$.device.in_app') END) AS ia,
  MIN(CASE WHEN type = 'page' THEN json_extract(data,'$.cf_country') END) AS co,
  MAX(bron = 'odoo-historiek') AS hi, MAX(kn) AS kn
FROM s0 GROUP BY u, sid`;
const ZONDER_INTERN = 'AND v.is_internal = 0';
const PERIODE_WHERE = 'e.ts >= ?1 AND e.ts < ?2';

/**
 * Wanneer is een form_submission een OFFERTE? Een eigen soort (de tracker bewaart
 * 'offerte' vanaf nu), of de naam of formulier-slug van een koppeling met
 * web_action 'offerte' (offerteFormulieren() in src/lib/web-conversions.js). De
 * namen komen uit de database: sqlList() escapet de aanhalingstekens.
 */
export function offerteSql({ names = [], slugs = [] } = {}) {
  return "json_extract(data,'$.soort') = 'offerte'"
    + (slugs.length ? ` OR json_extract(data,'$.form_slug') IN (${sqlList(slugs)})` : '')
    + (names.length ? ` OR json_extract(data,'$.form_name') IN (${sqlList(names)})` : '');
}

/** De sessie-SQL, ingevuld. Eén plek; een functie als vervanging, zodat een `$` in een naam niets doet. */
function sessionsSql(where, internal, offerte) {
  return SESSIONS_SQL_TEMPLATE.replace('__WHERE__', () => where).replace('__INTERNAL__', () => internal)
    .replace(/__OFFERTE__/g, () => offerteSql(offerte || {}));
}

/**
 * Een testpagina van onze eigen sites. Een BEZOEK met zo'n pagina is een test en
 * telt nergens mee -- de BROWSER blijft wie hij is (sinds 2026-10-02 maakt een
 * testpagina niemand meer intern; intern gaat enkel nog op het e-mailadres).
 * Dezelfde regel als isInternalPage() in de tracker (lib/events-store.js); twee
 * repo's, wijzig ze samen. Bewust op een PADDEEL, niet "bevat test": anders
 * valt /video/testimonials/ of een asbestattest-event er ook onder.
 */
export function isTestPage(page) {
  if (!page || typeof page !== 'string') return false;
  return page.split('?')[0].toLowerCase().split('/').some(seg =>
    seg === 'test' || seg.startsWith('test-') || seg.endsWith('-test') || seg.includes('updatetest') || seg === 'testevnt');
}

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

/** De klik-sleutel van het touchpoint dat het kanaal van de sessie bepaalt, of null. */
function clickOf(row) {
  if (!row.tk || !row.tp) return null;
  const i = row.tk.indexOf('|');
  const key = row.tk.slice(i + 1);
  return key && row.tk.slice(0, i) === part(row.tp, 0) ? key : null;
}

/**
 * @param reopened readReopenedClicks(); zonder telt elk touchpoint als nieuwe klik.
 * @returns [kanaal, detail, meta] -- meta = { reopened: tijdstip van de eerste klik }
 *          bij een heropende advertentielink, { klikOnbekend: true } bij een
 *          advertentieklik uit de oude historiek die niet na te gaan is, anders leeg.
 */
export function channelOf(row, reopened = null) {
  // 1. touchpoint in de sessie -- tenzij het dezelfde advertentielink is als bij een
  //    EERDERE klik: dan kwam de bezoeker op eigen houtje terug (Direct), en dan telt
  //    dit bezoek ook niet als laatste aanraking (GEEN_OORZAAK in journey.js).
  if (row.tp) {
    const [medium, source, campaign] = [part(row.tp, 1), part(row.tp, 2), part(row.tp, 3)];
    const ch = classifyTagged(medium, source);
    const klik = clickOf(row);
    const eerste = klik && reopened ? reopened.get(klik) : null;
    if (ch && eerste && eerste < row.st) {
      const c = campaign && campaign !== 'unknown' ? ` (${campaign})` : '';
      return ['Direct / onbekend', 'heropende advertentielink' + c, { reopened: eerste }];
    }
    if (ch) return [ch, detailOf(ch, medium, source, campaign), !klik && row.hi && ch.startsWith('Betaald') ? { klikOnbekend: true } : null];
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

  const offerte = await offerteFormulieren(env);
  const [res, firstLogins, reopened] = await Promise.all([
    readWebEvents(env, sessionsSql(PERIODE_WHERE, ZONDER_INTERN, offerte), [fmt(prevStart), fmt(end)]),
    readFirstLogins(env),
    readReopenedClicks(env),
  ]);
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
    if (pages.some(isTestPage)) continue;
    // Zoektermen in kleine letters: "Syndicus" en "syndicus" zijn dezelfde vraag.
    let zoek = [];
    try { zoek = JSON.parse(r.zq || '[]').filter(Boolean).map(z => String(z).trim().toLowerCase()).filter(Boolean); } catch (_) { zoek = []; }
    const [ch, det] = channelOf(r, reopened);
    const dur = Math.max(0, Math.round((Date.parse(r.en + 'Z') - Date.parse(r.st + 'Z')) / 1000), Number(r.md) || 0);
    const distinct = new Set(pages).size;
    // Voor de betrokkenheid telt ELKE actie, niet enkel een aanvraag.
    const conv = (r.ca || 0) + (r.er || 0) + (r.fs || 0) + (r.nb || 0) + (r.ac || 0) + (r.rg || 0);
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
      (engaged ? 1 : 0) | (isNew ? 2 : 0) | (r.hi ? 4 : 0) | (r.st < startTs ? 8 : 0)
        | (isCustomerSession(firstLogins, r) ? 16 : 0) | (isLoginOnly(r) ? 32 : 0), // 7 vlaggen
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
      r.nb || 0,                          // 18 nieuwsbrief
      r.ac || 0,                          // 19 academy
      r.rg || 0,                          // 20 registratie gestart (klik naar de app)
    ]);
  }

  return {
    available: true,
    period, days,
    range: { start: fmt(start), end: fmt(end), prevStart: fmt(prevStart) },
    generatedAt: fmt(end),
    oudsteLive,
    flags: { engaged: 1, isNew: 2, historic: 4, previous: 8, customer: 16, loginOnly: 32 },
    cols: ['v', 'start', 'dur', 'site', 'ch', 'det', 'pages', 'flags', 'clicks', 'contact', 'calendly', 'events', 'forms', 'dev', 'co', 'inapp', 'firstSeen', 'search', 'newsletter', 'academy', 'register'],
    dict,
    sessions,
    meta: { rowsRead: res.meta?.rows_read ?? null, ms: res.meta?.duration ?? null },
  };
}

/**
 * Ruwe sessierijen van een periode, voor Webgedrag (src/modules/web-story/lib/behaviour.js).
 * Zelfde SQL en kanaalindeling als hierboven; `pt` (tijdstip per pagina, op
 * dezelfde posities als `pg`), `kn` (bezoeker heeft een e-mailadres) en `cv` (de
 * acties met hun tijdstip) zijn er voor dat scherm bijgekomen en worden door het
 * dashboard genegeerd.
 */
export async function readSessionRows(env, startTs, endTs) {
  const res = await readWebEvents(env, sessionsSql(PERIODE_WHERE, ZONDER_INTERN, await offerteFormulieren(env)), [startTs, endTs]);
  return { rows: res.results || [], meta: res.meta || {} };
}

/**
 * De sessies van een set bezoekers, met hun kanaal: de bron voor het verhaal op
 * een lead of actieblad (src/modules/web-story). Zelfde SQL en zelfde
 * kanaalindeling als het dashboard; er bestaat geen tweede versie van een van beide.
 * @returns {Promise<Array<{uuid, start, end, site, channel, detail, pages, conversions, historic}>>}
 */
export async function readVisitorSessions(env, uuids, { includeInternal = false } = {}) {
  const list = [...new Set(uuids || [])];
  const out = [];
  const reopened = list.length ? await readReopenedClicks(env) : null;
  const offerte = list.length ? await offerteFormulieren(env) : null;
  for (let i = 0; i < list.length; i += 50) {
    const part = list.slice(i, i + 50);
    // includeInternal: voor het verhaal op een (test)lead -- in de cijfers nooit.
    const sql = sessionsSql(`e.visitor_uuid IN (${part.map(() => '?').join(',')})`, includeInternal ? '' : ZONDER_INTERN, offerte);
    const res = await readWebEvents(env, sql, part);
    for (const r of res.results || []) {
      let pages = [];
      try { pages = JSON.parse(r.pg || '[]').filter(Boolean); } catch (_) { pages = []; }
      const [channel, detail, meta] = channelOf(r, reopened);
      out.push({
        uuid: r.u, start: r.st, end: r.en, site: r.site || null, channel, detail: detail || '',
        reopened: (meta && meta.reopened) || null, klikOnbekend: !!(meta && meta.klikOnbekend),
        pages, conversions: { calendly: r.ca || 0, events: r.er || 0, forms: r.fs || 0, offerte: r.oq || 0, newsletter: r.nb || 0, academy: r.ac || 0, register: r.rg || 0 },
        historic: !!r.hi,
        loginOnly: isLoginOnly(r),
        test: pages.some(isTestPage),
      });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Met edge-cache: dezelfde periode wordt hoogstens elke 10 minuten opnieuw berekend. */
export async function getWebVisitsCached(env, ctx, { period }) {
  // v2: heropende advertentielinks tellen als Direct (channelOf).
  const key = new Request(`https://om-cache.internal/dashboards/web-visits/v2/${period}`);
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
