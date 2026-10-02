/**
 * Webgedrag — trends en flows over ALLE bezoeken, ook de anonieme.
 *
 * Zelfde aanpak als het dashboard (dashboards/lib/web-visits.js): de server
 * stuurt compacte SESSIES voor de gekozen periode en de vorige, even lange; de
 * browser segmenteert (bron, campagne, conversie, gekend, toestel, ...) en telt.
 * Zo kost een andere filter of een klik in de padverkenner geen nieuwe query.
 *
 * Wat dit scherm extra nodig heeft t.o.v. het dashboard: de pagina's IN
 * VOLGORDE met hun tijdstip (voor paden en tijd per pagina), en of de bezoeker
 * gekend is (e-mailadres) of aan een lead hangt. De sessie-SQL en de
 * kanaalindeling zijn dezelfde (readSessionRows + channelOf): geen tweede versie.
 *
 * Tijd op een pagina = tot de volgende pagina in dezelfde sessie (de "geschatte"
 * tijd uit §5.3 van ontwerp-web-visitor-events.md). De gemeten dwell zit daar
 * niet in; de laatste pagina van een sessie heeft dus geen tijd.
 *
 * ACTIES IN HET PAD (kolom 12, `acts`): de padverkenner toont een formulier, een
 * afspraak, een inschrijving of een registratie als eigen STAP, direct na de
 * pagina waarop het gebeurde. Daarvoor stuurt de sessie-SQL `cv` mee (tijdstip
 * en type van elke actie) en hangt elke actie hier aan de laatste pagina tot op
 * dat tijdstip. Een actie die de OM meldt heeft het tijdstip van de SERVER, een
 * pagina dat van de BROWSER: een scheve klok kan een actie dus een pagina te
 * vroeg of te laat zetten. Een actie vóór de eerste pagina hangt aan de eerste.
 */

import { hasWebEvents, readWebEvents } from '../../../lib/web-events.js';
import { readSessionRows, channelOf, CHANNELS, WEB_PERIODS, readFirstLogins, isCustomerSession, isLoginOnly, isTestPage, readReopenedClicks } from '../../dashboards/lib/web-visits.js';

const CACHE_SECONDS = 600;
export const FLAGS = {
  engaged: 1, isNew: 2, historic: 4, previous: 8, known: 16, linked: 32,
  form: 64, calendly: 128, event: 256, contact: 512,
  customer: 1024,   // sessie van een klant: op of na diens eerste login (web-visits.js)
  loginOnly: 2048,  // enkel om in te loggen
  newsletter: 4096, academy: 8192, register: 16384,  // eigen acties, geen aanvraag
  reopened: 32768,      // heropende advertentielink: telt als Direct, geen nieuwe klik (channelOf)
  klikOnbekend: 65536,  // advertentieklik uit de oude historiek: of het een nieuwe klik was, is niet bewaard
};
// De soorten actie in `acts`. Dezelfde codes staan als ACT in
// public/webgedrag-behaviour.js; wijzig ze samen. `register` is geen type in D1
// maar een klik met exit_type 'register' (zie `cv` in web-visits.js).
export const ACT_KINDS = {
  form_submission: 1, calendly: 2, event_registration: 3, newsletter_signup: 4, academy_signup: 5, register: 6,
};

function fmt(d) { return d.toISOString().substring(0, 19).replace('T', ' '); }
function unix(ts) { return Math.round(Date.parse(String(ts).replace(' ', 'T') + 'Z') / 1000); }

export async function getBehaviourData(env, { period }) {
  if (!hasWebEvents(env)) return { available: false, reason: 'De D1-binding WEB_EVENTS ontbreekt.' };
  const days = WEB_PERIODS[period] || 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const prevStart = new Date(start.getTime() - days * 86400000);

  // PERSONEN: een browser hoort bij het eerste (herleide) adres dat hij gebruikte,
  // zelfde regel als personKey() in identities.js. Zo kan het scherm zeggen dat 7
  // bezoeken van 1 persoon kwamen; een anonieme browser telt als eigen persoon.
  const [{ rows, meta }, linkedRes, firstLogins, reopened, emailRes] = await Promise.all([
    readSessionRows(env, fmt(prevStart), fmt(end)),
    readWebEvents(env, `SELECT DISTINCT visitor_uuid AS u FROM visitor_links WHERE status <> 'afgewezen'`),
    readFirstLogins(env),
    readReopenedClicks(env),
    readWebEvents(env, `SELECT visitor_uuid AS u, email_norm AS n FROM visitor_emails ORDER BY first_seen`),
  ]);
  const linked = new Set((linkedRes.results || []).map(r => r.u));
  const personOf = new Map();
  for (const x of emailRes.results || []) if (!personOf.has(x.u)) personOf.set(x.u, x.n);

  const dict = { v: [], p: [], ch: CHANNELS.slice(), det: [], site: [], dev: [], pe: [] };
  const idx = {};
  const id = (kind, value) => {
    if (value === null || value === undefined || value === '') return -1;
    const key = kind + '\u0000' + value;
    if (idx[key] === undefined) { idx[key] = dict[kind].length; dict[kind].push(value); }
    return idx[key];
  };
  CHANNELS.forEach((c, i) => { idx['ch\u0000' + c] = i; });

  const startTs = fmt(start);
  const sessions = [];
  for (const r of rows) {
    // pg en pt staan op dezelfde posities (NULL voor wat geen pagina is): eerst
    // koppelen, dan op tijd sorteren -- de volgorde van json_group_array ligt niet vast.
    let pg = [], pt = [];
    try { pg = JSON.parse(r.pg || '[]'); pt = JSON.parse(r.pt || '[]'); } catch (_) { pg = []; pt = []; }
    const views = [];
    for (let i = 0; i < pg.length; i++) if (pg[i] && pt[i]) views.push([pt[i], pg[i]]);
    if (views.some(v => isTestPage(v[1]))) continue;   // een testbezoek telt nergens mee
    views.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const st = unix(r.st);
    const viewT = views.map(v => unix(v[0]));
    // cv = "tijdstip~type,tijdstip~type" (GROUP_CONCAT laat de NULLs weg, de volgorde
    // ligt niet vast). Per actie: [positie van de pagina, soort, seconden na de start].
    const acts = [];
    for (const part of String(r.cv || '').split(',')) {
      const cut = part.lastIndexOf('~');
      const kind = cut > 0 ? ACT_KINDS[part.slice(cut + 1)] : undefined;
      const t = kind ? unix(part.slice(0, cut)) : NaN;
      if (!Number.isFinite(t)) continue;
      let at = views.length ? 0 : -1;
      while (at + 1 < viewT.length && viewT[at + 1] <= t) at++;
      acts.push([at, kind, Math.max(0, t - st), t]);
    }
    acts.sort((a, b) => a[3] - b[3]);
    const [ch, det, kanaalMeta] = channelOf(r, reopened);
    const conv = (r.ca || 0) + (r.er || 0) + (r.fs || 0) + (r.nb || 0) + (r.ac || 0) + (r.rg || 0);
    const distinct = new Set(views.map(v => v[1])).size;
    const engaged = distinct > 1 || (r.ck || 0) > 0 || conv > 0 || (r.pl || 0) > 0 || (r.rs || 0) > 0
      || (Number(r.md) || 0) > 5 || (Number(r.sd) || 0) >= 75;
    const isNew = !!(r.vf && Math.abs(Date.parse(r.st + 'Z') - Date.parse(r.vf + 'Z')) < 30 * 60 * 1000);
    const flags = (engaged ? FLAGS.engaged : 0) | (isNew ? FLAGS.isNew : 0) | (r.hi ? FLAGS.historic : 0)
      | (r.st < startTs ? FLAGS.previous : 0) | (r.kn ? FLAGS.known : 0) | (linked.has(r.u) ? FLAGS.linked : 0)
      | ((r.fs || 0) > 0 ? FLAGS.form : 0) | ((r.ca || 0) > 0 ? FLAGS.calendly : 0) | ((r.er || 0) > 0 ? FLAGS.event : 0)
      | ((r.nb || 0) > 0 ? FLAGS.newsletter : 0) | ((r.ac || 0) > 0 ? FLAGS.academy : 0) | ((r.rg || 0) > 0 ? FLAGS.register : 0)
      | ((r.ct || 0) > 0 ? FLAGS.contact : 0)
      | (isCustomerSession(firstLogins, r) ? FLAGS.customer : 0) | (isLoginOnly(r) ? FLAGS.loginOnly : 0)
      | (kanaalMeta && kanaalMeta.reopened ? FLAGS.reopened : 0) | (kanaalMeta && kanaalMeta.klikOnbekend ? FLAGS.klikOnbekend : 0);
    sessions.push([
      id('v', r.u),                                                     // 0 bezoeker
      st,                                                               // 1 start (unix s)
      Math.max(0, unix(r.en) - st, Number(r.md) || 0),                  // 2 duur (s)
      id('site', r.site),                                               // 3 site
      idx['ch\u0000' + ch],                                             // 4 kanaal
      id('det', det),                                                   // 5 bron/campagne
      views.map(v => id('p', v[1])),                                    // 6 pagina's in volgorde
      viewT.map(t => Math.max(0, t - st)),                              // 7 seconden na de start
      flags,                                                            // 8 vlaggen
      id('dev', r.dv),                                                  // 9 toestel
      Number(r.sd) || 0,                                                // 10 hoogste scroll (%)
      r.ck || 0,                                                        // 11 klikken
      acts.length ? acts.map(a => a.slice(0, 3)) : 0,                   // 12 acties (0 = geen)
      kanaalMeta && kanaalMeta.reopened ? unix(kanaalMeta.reopened) : 0, // 13 heropende link: de eerste klik
    ]);
  }
  // persons[i] = de persoon van dict.v[i]: volgnummer in dict.pe, of -1 (anoniem).
  const persons = dict.v.map(u => (personOf.has(u) ? id('pe', personOf.get(u)) : -1));
  return {
    available: true, period, days,
    range: { start: fmt(start), end: fmt(end), prevStart: fmt(prevStart) },
    cols: ['v', 'start', 'dur', 'site', 'ch', 'det', 'pages', 'offs', 'flags', 'dev', 'scroll', 'clicks', 'acts', 'reo'],
    flags: FLAGS, actKinds: ACT_KINDS, dict, persons, sessions,
    meta: { rowsRead: meta.rows_read ?? null, ms: meta.duration ?? null },
  };
}

export async function getBehaviourCached(env, ctx, { period }) {
  // v3: personen + heropende advertentielinks (kolom 13). v2: de acties (kolom 12).
  // Een nieuwe sleutel, zodat na een deploy niet nog tien minuten een antwoord zonder
  // die kolommen geserveerd wordt.
  const key = new Request(`https://om-cache.internal/web-story/behaviour/v3/${period}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }
  const data = await getBehaviourData(env, { period });
  if (cache && data.available) {
    const put = cache.put(key, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
    }));
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  return data;
}
