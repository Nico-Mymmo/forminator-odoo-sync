/**
 * Nieuwsbrieven -- edities: datums, automatisch aanmaken, en alles bij elkaar
 * zetten wat de renderer nodig heeft.
 */

import {
  listSeries, listEditions, insertEdition, insertContributions, listContributions,
  logActivity, listUsers, updateContribution, NewsletterError,
} from './store.js';
import { EDITION_STATUS, CONTRIBUTION_STATUS, KINDS, DEFAULT_OPTIONS, LOG_PREFIX } from './constants.js';
import { eventsVoorEditie, nieuwsSinds, auteurs, bedrijf, tekeningen } from './sources.js';
import { maandLabel } from './render.js';

const DAG_MS = 24 * 60 * 60 * 1000;

// ─── Tijd in Europe/Brussels ────────────────────────────────────────────────

function brusselsDelen(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date);
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return {
    y: Number(v.year), m: Number(v.month), d: Number(v.day),
    h: Number(v.hour) % 24, min: Number(v.minute), weekday: v.weekday,
  };
}

/** Een tijdstip in Brussel (lokale klok) naar een echte Date. */
export function brussel(y, m, d, h = 0, min = 0) {
  // Eerst doen alsof het UTC is, dan het verschil met Brussel op dat moment
  // eraf halen. Twee rondes vangen de zomer-/wintertijdgrens.
  let t = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 2; i++) {
    const b = brusselsDelen(new Date(t));
    const alsUtc = Date.UTC(b.y, b.m - 1, b.d, b.h, b.min);
    t += Date.UTC(y, m - 1, d, h, min) - alsUtc;
  }
  return new Date(t);
}

/** N werkdagen (ma-vr) vóór een datum, om 17:00 Brussel. */
export function inleverdatum(sendAt, werkdagen) {
  const b = brusselsDelen(new Date(sendAt));
  let dag = new Date(Date.UTC(b.y, b.m - 1, b.d));
  let teller = 0;
  while (teller < werkdagen) {
    dag = new Date(dag.getTime() - DAG_MS);
    const wd = dag.getUTCDay();
    if (wd !== 0 && wd !== 6) teller += 1;
  }
  return brussel(dag.getUTCFullYear(), dag.getUTCMonth() + 1, dag.getUTCDate(), 17, 0);
}

/**
 * Het eerstvolgende verzendmoment volgens het ritme van de reeks, waarvan de
 * inleverdatum nog niet voorbij is. Valt de verzenddag in het weekend, dan
 * schuift ze naar de maandag erna.
 */
export function volgendVerzendmoment(series, nu = new Date()) {
  const b = brusselsDelen(nu);
  for (let stap = 0; stap < 3; stap++) {
    const maand0 = b.m - 1 + stap;
    const y = b.y + Math.floor(maand0 / 12);
    const m = (maand0 % 12) + 1;
    let send = brussel(y, m, series.send_day, series.send_hour, 0);
    const wd = new Date(Date.UTC(y, m - 1, series.send_day)).getUTCDay();
    if (wd === 6) send = new Date(send.getTime() + 2 * DAG_MS);
    if (wd === 0) send = new Date(send.getTime() + DAG_MS);
    const deadline = inleverdatum(send, series.deadline_workdays);
    if (deadline.getTime() > nu.getTime()) return { send, deadline };
  }
  return null;
}

// ─── Een editie aanmaken ────────────────────────────────────────────────────

function startInhoud(sectie) {
  const kind = sectie.kind;
  if (KINDS[kind]?.interactive) {
    return { question: '', intro: '', options: DEFAULT_OPTIONS[kind] || DEFAULT_OPTIONS.question, ask_comment: true, show_results: true };
  }
  if (kind === 'events') return { heading: 'Kom ons ontmoeten', exclude_ids: [] };
  if (kind === 'news') return { heading: 'Wat er speelt', items: [] };
  if (kind === 'closing') return { text: '', button_label: '', button_url: '' };
  return {};
}

/**
 * Een editie met per rubriek een opdracht. Automatische rubrieken (agenda,
 * inhoudstafel, afsluiting) staan meteen op goedgekeurd; "Uit het nieuws"
 * wordt voorgevuld met wat sinds de vorige editie verscheen en wacht op
 * nalezing.
 */
export async function maakEditie(env, series, { send, deadline, userId = null, title = '' }) {
  const editie = await insertEdition(env, {
    series_id: series.id,
    title: title || maandLabel(send.toISOString()),
    send_at: send.toISOString(),
    deadline_at: deadline.toISOString(),
    status: EDITION_STATUS.COLLECTING,
    created_by: userId,
  });
  if (!editie) return null; // bestond al (unieke index)

  const vorige = (await listEditions(env, { seriesId: series.id, statuses: [EDITION_STATUS.SENT], limit: 1 }))[0];
  const sinds = (vorige?.send_at || new Date(Date.now() - 45 * DAG_MS).toISOString()).slice(0, 10);
  const nieuws = (series.sections || []).some((s) => s.kind === 'news') ? await nieuwsSinds(env, sinds, { limit: 4 }) : [];

  const rijen = (series.sections || []).map((s, i) => {
    const content = startInhoud(s);
    let status = KINDS[s.kind]?.auto ? CONTRIBUTION_STATUS.APPROVED : CONTRIBUTION_STATUS.OPEN;
    if (s.kind === 'news' && nieuws.length) {
      content.items = nieuws.slice(0, 2);
      status = CONTRIBUTION_STATUS.SUBMITTED;
    }
    return {
      edition_id: editie.id,
      section_key: s.key,
      position: (i + 1) * 10,
      kind: s.kind,
      title: s.title,
      content,
      owner_user_id: s.owner_user_id || null,
      status,
      source: s.kind === 'news' && nieuws.length ? 'nieuws-en-updates' : '',
      created_by: userId,
    };
  });
  await insertContributions(env, rijen);
  await logActivity(env, { editionId: editie.id, userId, kind: 'created', text: userId ? 'Editie aangemaakt' : 'Editie automatisch aangemaakt' });
  return editie;
}

/**
 * De cron: per actieve reeks met een ritme de eerstvolgende editie aanmaken
 * zodra ze binnen `create_days_ahead` valt. Idempotent dankzij de unieke index
 * op (reeks, verzendmoment).
 */
export async function zorgVoorEdities(env, nu = new Date()) {
  const reeksen = await listSeries(env, { activeOnly: true });
  let gemaakt = 0;
  for (const series of reeksen) {
    if (series.cadence !== 'monthly') continue;
    const volgend = volgendVerzendmoment(series, nu);
    if (!volgend) continue;
    if (volgend.send.getTime() - nu.getTime() > series.create_days_ahead * DAG_MS) continue;
    const bestaand = await listEditions(env, { seriesId: series.id, limit: 10 });
    const al = bestaand.some((e) => e.status !== EDITION_STATUS.CANCELLED
      && Math.abs(new Date(e.send_at).getTime() - volgend.send.getTime()) < 20 * DAG_MS);
    if (al) continue;
    try {
      const e = await maakEditie(env, series, volgend);
      if (e) {
        gemaakt += 1;
        console.log(`${LOG_PREFIX} editie aangemaakt: ${series.name} ${e.title}`);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} editie voor ${series.name} niet aangemaakt:`, error?.message);
    }
  }
  return gemaakt;
}

/** Een manueel aangevraagde editie, op een gekozen dag. */
export async function maakEditieOp(env, series, { date, userId }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) throw new NewsletterError('Kies een verzenddag (JJJJ-MM-DD).');
  const send = brussel(Number(m[1]), Number(m[2]), Number(m[3]), series.send_hour, 0);
  if (send.getTime() < Date.now()) throw new NewsletterError('Die dag ligt in het verleden.');
  const deadline = inleverdatum(send, series.deadline_workdays);
  const e = await maakEditie(env, series, { send, deadline, userId });
  if (!e) throw new NewsletterError('Er bestaat al een editie op dat moment.', 409);
  return e;
}

/** Het nieuws opnieuw ophalen voor een "Uit het nieuws"-rubriek. */
export async function vernieuwNieuws(env, editie, item) {
  const vorige = (await listEditions(env, { seriesId: editie.series_id, statuses: [EDITION_STATUS.SENT], limit: 1 }))[0];
  const sinds = (vorige?.send_at || new Date(Date.now() - 45 * DAG_MS).toISOString()).slice(0, 10);
  const nieuws = await nieuwsSinds(env, sinds, { limit: 8 });
  return updateContribution(env, item.id, { content: { ...(item.content || {}), suggestions: nieuws } });
}

// ─── Alles samen voor de renderer ───────────────────────────────────────────

/**
 * Bijdragen met hun auteur, en de context die de renderer nodig heeft.
 * `png`: true voor een mail (Gmail toont geen SVG), false voor het voorbeeld.
 */
export async function verzamel(env, series, editie, { png = true, items = null } = {}) {
  const [bijdragen, users, events, comp, tek] = await Promise.all([
    items ? Promise.resolve(items) : listContributions(env, editie.id),
    listUsers(env),
    eventsVoorEditie(env, series, editie),
    bedrijf(env),
    tekeningen(env, { enkelPng: png }),
  ]);
  const perUser = await auteurs(env, users.filter((u) => bijdragen.some((b) => b.owner_user_id === u.id)));
  const metAuteur = bijdragen.map((b) => ({ ...b, author: b.owner_user_id ? perUser[b.owner_user_id] || null : null }));
  return {
    items: metAuteur,
    users,
    ctx: { events, company: comp, thingieUrl: tek.url, now: Date.now() },
    thingies: tek.lijst,
  };
}
