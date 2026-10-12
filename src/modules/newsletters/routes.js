/**
 * Nieuwsbrieven -- beheerroutes. Alleen JSON, behalve `GET /`.
 *
 * Rechten:
 *   - schrijven: iedereen met de module, aan de eigen stukjes en in de voorraad
 *   - hoofdredactie (rubrieken, goedkeuren, testen, inplannen): admin, de rol
 *     marketing_signature, of wie in editor_user_ids van de reeks staat
 */

import {
  NewsletterError, listSeries, getSeries, updateSeries, normalizeSeriesPayload,
  listEditions, getEdition, updateEdition, listContributions, listContributionsForEditions,
  listPool, listMine, getContribution, insertContributions, updateContribution, deleteContribution,
  listComments, countComments, addComment, logActivity, listActivity, listUsers, isActiveEdition,
} from './lib/store.js';
import {
  KINDS, isKind, DEFAULT_OPTIONS, EDITION_STATUS, CONTRIBUTION_STATUS, LOG_PREFIX, ASSET_ORIGIN,
  sendMode, testEmails, BRAND,
} from './lib/constants.js';
import { renderEdition, renderContribution, heeftInhoud, kopVan } from './lib/render.js';
import { verzamel, maakEditieOp, vernieuwNieuws } from './lib/editions.js';
import { antwoordLinks, antwoordenVanEditie } from './lib/answers.js';
import { tokenVeldBestaat, verstuurTest, planEchteMailing, leesCijfers } from './lib/odoo-mailing.js';
import { stelStukjeVoor, stelOnderwerpVoor } from './lib/ai.js';
import { linkVoorbeeld, eventsVoorEditie, auteurs, tekeningen } from './lib/sources.js';
import { stuurHerinnering } from './lib/cron.js';
import { lijstTekeningen, pngSleutel, vergeetTekeningen } from '../av-slides/lib/thingies.js';
import { listIntegrations } from '../forminator-sync-v2/database.js';
import { ArticleFetchError } from '../content-feed/lib/article-fetch.js';
import { serializeAiError, httpStatusForAiError } from '../mini-apps/lib/ai-errors.js';
import { sendSystemChannelMessage } from '../mini-apps/lib/chat.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  if (err?.code && String(err.code).startsWith('AI_')) {
    return json({ success: false, ...serializeAiError(err) }, httpStatusForAiError(err));
  }
  const status = err instanceof NewsletterError ? err.status : 500;
  if (status === 500) console.error(LOG_PREFIX, err);
  return json({ success: false, error: err?.message || 'Onbekende fout' }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return {}; }
}

const isHoofdredactie = (user) => user?.role === 'admin' || user?.role === 'marketing_signature';
const isEditorVan = (user, series) => isHoofdredactie(user) || (series?.editor_user_ids || []).includes(user?.id);

function eisEditor(user, series) {
  if (!isEditorVan(user, series)) throw new NewsletterError('Enkel de hoofdredactie kan dit.', 403);
}

async function editieMetReeks(env, id) {
  const edition = await getEdition(env, id);
  if (!edition) throw new NewsletterError('Editie niet gevonden.', 404);
  const series = await getSeries(env, edition.series_id);
  if (!series) throw new NewsletterError('Reeks niet gevonden.', 404);
  return { edition, series };
}

async function stukjeMetContext(env, id) {
  const item = await getContribution(env, id);
  if (!item) throw new NewsletterError('Stukje niet gevonden.', 404);
  let edition = null;
  let series = null;
  if (item.edition_id) {
    edition = await getEdition(env, item.edition_id);
    series = edition ? await getSeries(env, edition.series_id) : null;
  } else if (item.series_ids?.length) {
    series = await getSeries(env, item.series_ids[0]);
  }
  if (!series) series = (await listSeries(env))[0] || null;
  return { item, edition, series };
}

function magSchrijven(user, item, series) {
  return isEditorVan(user, series) || item.owner_user_id === user.id || (!item.edition_id && item.created_by === user.id);
}

// ─── Inhoud nakijken per soort ──────────────────────────────────────────────

const kort = (v, max) => String(v ?? '').trim().slice(0, max);
const url = (v) => {
  const s = String(v || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 1000) : '';
};

function slug(tekst) {
  return String(tekst || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/**
 * De WAARDE van een optie ligt vast zodra ze bestaat: antwoorden verwijzen
 * ernaar. Het label mag altijd wijzigen.
 */
function normaliseerOpties(lijst, kind) {
  const bron = Array.isArray(lijst) && lijst.length ? lijst : DEFAULT_OPTIONS[kind] || [];
  const gezien = new Set();
  const uit = [];
  for (const o of bron.slice(0, 6)) {
    const label = kort(typeof o === 'string' ? o : o?.label, 60);
    if (!label) continue;
    let value = typeof o === 'object' && /^[a-z0-9-]{1,40}$/.test(String(o?.value || '')) ? o.value : slug(label);
    if (!value) value = `optie-${uit.length + 1}`;
    while (gezien.has(value)) value = `${value}-2`.slice(0, 40);
    gezien.add(value);
    uit.push({ value, label });
  }
  return uit;
}

export function normaliseerInhoud(kind, c = {}) {
  switch (kind) {
    case 'intro':
    case 'article':
      return {
        title: kort(c.title, 160), text: kort(c.text, 4000), image_url: url(c.image_url), image_alt: kort(c.image_alt, 160),
        thingie: /^[a-z0-9-]{1,60}$/.test(String(c.thingie || '')) ? c.thingie : '',
        link_url: url(c.link_url), link_label: kort(c.link_label, 60),
      };
    case 'video':
      return {
        title: kort(c.title, 160), text: kort(c.text, 2000), video_url: url(c.video_url),
        thumbnail_url: url(c.thumbnail_url), button_label: kort(c.button_label, 60),
      };
    case 'link':
    case 'linkedin':
      return {
        title: kort(c.title, 200), text: kort(c.text, 1500), url: url(c.url), image_url: url(c.image_url),
        site_name: kort(c.site_name, 80), author_name: kort(c.author_name, 80), link_label: kort(c.link_label, 60),
      };
    case 'quote':
      return { quote: kort(c.quote, 600), person: kort(c.person, 100), role: kort(c.role, 120) };
    case 'statement':
    case 'question':
    case 'poll':
      return {
        question: kort(c.question, 200), intro: kort(c.intro, 500), options: normaliseerOpties(c.options, kind),
        ask_comment: c.ask_comment !== false, show_results: c.show_results !== false,
      };
    case 'events':
      return {
        heading: kort(c.heading, 120) || 'Kom ons ontmoeten',
        exclude_ids: (Array.isArray(c.exclude_ids) ? c.exclude_ids : []).map(Number).filter(Number.isInteger),
      };
    case 'news':
      return {
        heading: kort(c.heading, 120) || 'Wat er speelt',
        items: (Array.isArray(c.items) ? c.items : []).slice(0, 4).map((n) => ({
          snippet_id: Number.isInteger(Number(n?.snippet_id)) ? Number(n.snippet_id) : null,
          title: kort(n?.title, 200), note: kort(n?.note, 300), url: url(n?.url),
        })).filter((n) => n.title),
        suggestions: Array.isArray(c.suggestions) ? c.suggestions.slice(0, 12) : undefined,
      };
    case 'toc':
      return {};
    case 'closing':
      return {
        text: kort(c.text, 1000), button_label: kort(c.button_label, 60), button_url: url(c.button_url),
        together_label: kort(c.together_label, 80),
      };
    default:
      return {};
  }
}

// ─── Hulp bij lijsten ───────────────────────────────────────────────────────

function naamVan(users, id) {
  const u = users.find((x) => x.id === id);
  return u ? (u.full_name || u.email) : null;
}

function voortgang(items) {
  const echt = items.filter((i) => !KINDS[i.kind]?.auto);
  const tel = (s) => echt.filter((i) => i.status === s).length;
  return {
    totaal: echt.length,
    goedgekeurd: tel(CONTRIBUTION_STATUS.APPROVED),
    ingeleverd: tel(CONTRIBUTION_STATUS.SUBMITTED),
    bezig: tel(CONTRIBUTION_STATUS.DRAFT),
    open: tel(CONTRIBUTION_STATUS.OPEN),
  };
}

async function meldInChat(env, series, tekst) {
  if (!series?.chat_channel) return;
  try {
    await sendSystemChannelMessage(env, series.chat_channel, tekst, { bron: 'Nieuwsbrieven' });
  } catch (error) {
    console.warn(`${LOG_PREFIX} chatmelding mislukt:`, error?.message);
  }
}

const MAX_BEELD = 3 * 1024 * 1024;
const BEELD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

// ─── De routes ──────────────────────────────────────────────────────────────

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/newsletters.html', context.request.url))),

  'GET /api/bootstrap': async ({ env, user }) => {
    try {
      const [series, users, tokenVeld] = await Promise.all([listSeries(env), listUsers(env), tokenVeldBestaat(env)]);
      return json({
        success: true,
        data: {
          me: { id: user.id, name: user.full_name || user.email, email: user.email, role: user.role, is_editor: isHoofdredactie(user) },
          send_mode: sendMode(env),
          test_emails: testEmails(env),
          token_field: tokenVeld,
          kinds: KINDS,
          brands: BRAND,
          series: series.map((s) => ({ ...s, is_editor: isEditorVan(user, s) })),
          users: users.map((u) => ({ id: u.id, name: u.full_name || u.email, email: u.email })),
        },
      });
    } catch (err) { return fout(err); }
  },

  'GET /api/overview': async ({ env, user }) => {
    try {
      const [series, users, mine, pool] = await Promise.all([
        listSeries(env), listUsers(env), listMine(env, user.id), listPool(env),
      ]);
      const edities = (await listEditions(env, { limit: 60 })).filter((e) => e.status !== EDITION_STATUS.CANCELLED);
      const items = await listContributionsForEditions(env, edities.map((e) => e.id));
      const perEditie = {};
      for (const it of items) (perEditie[it.edition_id] ||= []).push(it);
      const editieInfo = (e) => ({ ...e, progress: voortgang(perEditie[e.id] || []) });
      return json({
        success: true,
        data: {
          series: series.filter((s) => s.is_active).map((s) => ({
            ...s,
            is_editor: isEditorVan(user, s),
            editions: edities.filter((e) => e.series_id === s.id).slice(0, 6).map(editieInfo),
          })),
          mine: mine.map((m) => {
            const e = edities.find((x) => x.id === m.edition_id);
            const s = e ? series.find((x) => x.id === e.series_id) : null;
            return { ...m, edition: e ? { id: e.id, title: e.title, deadline_at: e.deadline_at } : null, series_name: s?.name || '' };
          }),
          pool: pool.map((p) => ({ ...p, owner_name: naamVan(users, p.owner_user_id) })),
        },
      });
    } catch (err) { return fout(err); }
  },

  // ─── Reeksen ──────────────────────────────────────────────────────────────

  'GET /api/series/:id': async ({ env, params }) => {
    try {
      const s = await getSeries(env, params.id);
      if (!s) throw new NewsletterError('Reeks niet gevonden.', 404);
      return json({ success: true, data: s });
    } catch (err) { return fout(err); }
  },

  'PUT /api/series/:id': async ({ env, user, params, request }) => {
    try {
      const s = await getSeries(env, params.id);
      if (!s) throw new NewsletterError('Reeks niet gevonden.', 404);
      eisEditor(user, s);
      const waarden = normalizeSeriesPayload(await leesBody(request));
      // Wie hoofdredactie is, kan enkel een beheerder wijzigen.
      if (waarden.editor_user_ids !== undefined && user.role !== 'admin') delete waarden.editor_user_ids;
      return json({ success: true, data: await updateSeries(env, s.id, waarden) });
    } catch (err) { return fout(err); }
  },

  'POST /api/series/:id/editions': async ({ env, user, params, request }) => {
    try {
      const s = await getSeries(env, params.id);
      if (!s) throw new NewsletterError('Reeks niet gevonden.', 404);
      eisEditor(user, s);
      const body = await leesBody(request);
      return json({ success: true, data: await maakEditieOp(env, s, { date: body.date, userId: user.id }) }, 201);
    } catch (err) { return fout(err); }
  },

  // ─── Edities ──────────────────────────────────────────────────────────────

  'GET /api/editions/:id': async ({ env, user, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      const [items, users, activity] = await Promise.all([
        listContributions(env, edition.id), listUsers(env), listActivity(env, edition.id),
      ]);
      const [opmerkingen, perUser] = await Promise.all([
        countComments(env, items.map((i) => i.id)),
        auteurs(env, users.filter((u) => items.some((i) => i.owner_user_id === u.id))),
      ]);
      let stats = edition.stats || null;
      if (edition.odoo_mailing_id && edition.status === EDITION_STATUS.SENT) {
        stats = await leesCijfers(env, edition.odoo_mailing_id).catch(() => stats);
      }
      return json({
        success: true,
        data: {
          edition: { ...edition, stats },
          series: { ...series, is_editor: isEditorVan(user, series) },
          items: items.map((i) => ({
            ...i,
            owner_name: naamVan(users, i.owner_user_id),
            author: i.owner_user_id ? perUser[i.owner_user_id] || null : null,
            comment_count: opmerkingen[i.id] || 0,
            has_content: heeftInhoud(i, { events: [{ id: 0 }] }),
            heading: kopVan(i),
          })),
          progress: voortgang(items),
          activity: activity.map((a) => ({ ...a, user_name: naamVan(users, a.user_id) })),
          send_mode: sendMode(env),
          test_emails: testEmails(env),
        },
      });
    } catch (err) { return fout(err); }
  },

  'PUT /api/editions/:id': async ({ env, user, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      if (!isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd of geannuleerd.', 409);
      const b = await leesBody(request);
      const w = {};
      if (b.title !== undefined) w.title = kort(b.title, 120);
      if (b.subject !== undefined) w.subject = kort(b.subject, 200);
      if (b.preheader !== undefined) w.preheader = kort(b.preheader, 200);
      for (const k of ['send_at', 'deadline_at']) {
        if (b[k] !== undefined) {
          const d = new Date(b[k]);
          if (Number.isNaN(d.getTime())) throw new NewsletterError('Ongeldige datum.');
          w[k] = d.toISOString();
        }
      }
      if (w.deadline_at || w.send_at) {
        const deadline = new Date(w.deadline_at || edition.deadline_at);
        const send = new Date(w.send_at || edition.send_at);
        if (deadline > send) throw new NewsletterError('De inleverdatum moet voor het verzendmoment liggen.');
        if (edition.status === EDITION_STATUS.REVIEW && deadline > new Date()) w.status = EDITION_STATUS.COLLECTING;
      }
      return json({ success: true, data: await updateEdition(env, edition.id, w) });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/cancel': async ({ env, user, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      if (edition.status === EDITION_STATUS.SENT) throw new NewsletterError('Een verstuurde editie kan niet geannuleerd worden.', 409);
      if (edition.status === EDITION_STATUS.SCHEDULED) throw new NewsletterError('Deze editie staat ingepland in Odoo. Annuleer de mailing daar eerst.', 409);
      await updateEdition(env, edition.id, { status: EDITION_STATUS.CANCELLED });
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'cancelled', text: 'Editie geannuleerd' });
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'GET /api/editions/:id/preview': async ({ env, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      const mode = new URL(request.url).searchParams.get('mode') === 'test' ? 'test' : 'preview';
      const v = await verzamel(env, series, edition, { png: mode !== 'preview' });
      const { html, open } = renderEdition({
        series, edition, items: v.items, mode,
        ctx: { ...v.ctx, answerLink: antwoordLinks(series, 'preview', false) },
      });
      return json({ success: true, data: { html, open: open.length, events: v.ctx.events } });
    } catch (err) { return fout(err); }
  },

  'GET /api/editions/:id/suggestions': async ({ env, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      const [items, pool, events] = await Promise.all([listContributions(env, edition.id), listPool(env), eventsVoorEditie(env, series, edition)]);
      const nieuws = items.find((i) => i.kind === 'news');
      return json({
        success: true,
        data: {
          pool: pool.filter((p) => !p.series_ids?.length || p.series_ids.includes(series.id)),
          events,
          news_suggestions: nieuws?.content?.suggestions || null,
        },
      });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/contributions': async ({ env, user, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      if (!isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd of geannuleerd.', 409);
      const b = await leesBody(request);
      const items = await listContributions(env, edition.id);
      const laatste = items.reduce((m, i) => Math.max(m, i.position || 0), 0);
      // Voor de afsluiting, niet erna.
      const afsluiting = items.find((i) => i.kind === 'closing');
      const positie = afsluiting ? afsluiting.position - 1 : laatste + 10;

      if (b.from_pool_id) {
        eisEditor(user, series);
        const p = await getContribution(env, b.from_pool_id);
        if (!p || p.edition_id) throw new NewsletterError('Dat idee staat niet (meer) in de voorraad.', 404);
        const bij = await updateContribution(env, p.id, { edition_id: edition.id, position: positie });
        await logActivity(env, { editionId: edition.id, contributionId: p.id, userId: user.id, kind: 'added', text: `"${p.title}" uit de voorraad opgenomen` });
        return json({ success: true, data: bij }, 201);
      }

      const kind = String(b.kind || '');
      if (!isKind(kind)) throw new NewsletterError('Onbekende soort stukje.');
      // Een schrijver mag zichzelf een stukje toevoegen; enkel de hoofdredactie
      // kan het iemand anders toewijzen.
      const eigenaar = isEditorVan(user, series) ? (b.owner_user_id === undefined ? user.id : b.owner_user_id || null) : user.id;
      const [rij] = await insertContributions(env, [{
        edition_id: edition.id,
        section_key: '',
        position: positie,
        kind,
        title: kort(b.title, 120) || KINDS[kind].label,
        content: normaliseerInhoud(kind, b.content || {}),
        owner_user_id: eigenaar,
        status: b.content ? CONTRIBUTION_STATUS.DRAFT : CONTRIBUTION_STATUS.OPEN,
        source: kort(b.source, 300),
        created_by: user.id,
      }]);
      await logActivity(env, { editionId: edition.id, contributionId: rij.id, userId: user.id, kind: 'added', text: `Stukje "${rij.title}" toegevoegd` });
      return json({ success: true, data: rij }, 201);
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/order': async ({ env, user, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      const ids = (await leesBody(request)).ids || [];
      const items = await listContributions(env, edition.id);
      const bekend = new Set(items.map((i) => i.id));
      let pos = 10;
      for (const id of ids) {
        if (!bekend.has(id)) continue;
        await updateContribution(env, id, { position: pos });
        pos += 10;
      }
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/remind': async ({ env, user, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      if (!series.chat_channel) throw new NewsletterError('Deze reeks heeft nog geen chatkanaal. Stel het in bij de reeks.', 409);
      await stuurHerinnering(env, series, edition);
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'reminder', text: 'Herinnering in het chatkanaal' });
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /**
   * De test: via Odoo naar de testadressen (NEWSLETTER_TEST_EMAILS), en NOOIT
   * naar iemand anders. Toont ook wat nog niet ingeleverd is, zodat je de hele
   * editie in je eigen mailbox naleest.
   */
  'POST /api/editions/:id/test': async ({ env, user, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      const tokenVeld = await tokenVeldBestaat(env);
      const v = await verzamel(env, series, edition, { png: true });
      const { html } = renderEdition({
        series, edition, items: v.items, mode: 'test',
        ctx: { ...v.ctx, answerLink: antwoordLinks(series, 'test', tokenVeld) },
      });
      const subject = edition.subject || `${series.name} ${edition.title}`;
      const r = await verstuurTest(env, { series, edition, html, subject, preheader: edition.preheader });
      await updateEdition(env, edition.id, {
        test_mailing_ids: [...(edition.test_mailing_ids || []), r.mailingId],
        last_test_at: new Date().toISOString(),
      });
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'test', text: `Testmail naar ${r.to.join(', ')}` });
      return json({ success: true, data: { ...r, token_field: tokenVeld } });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/schedule': async ({ env, user, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      if (sendMode(env) !== 'live') throw new NewsletterError('Echte verzending staat uit. Enkel testen kan.', 403);
      const b = await leesBody(request);
      if (b.confirm !== 'VERSTUREN') throw new NewsletterError('Bevestig met VERSTUREN.');
      if (!isActiveEdition(edition) || edition.status === EDITION_STATUS.SCHEDULED) {
        throw new NewsletterError('Deze editie is al ingepland, verstuurd of geannuleerd.', 409);
      }
      if (!edition.subject) throw new NewsletterError('Geef de editie eerst een onderwerp.');
      const v = await verzamel(env, series, edition, { png: true });
      const nietKlaar = v.items.filter((i) => !KINDS[i.kind]?.auto && heeftInhoud(i, v.ctx) && i.status !== CONTRIBUTION_STATUS.APPROVED);
      if (nietKlaar.length) {
        throw new NewsletterError(`Nog niet goedgekeurd: ${nietKlaar.map((i) => i.title).join(', ')}.`, 409);
      }
      const { html } = renderEdition({
        series, edition, items: v.items, mode: 'live',
        ctx: { ...v.ctx, answerLink: antwoordLinks(series, 'live', await tokenVeldBestaat(env)) },
      });
      const r = await planEchteMailing(env, { series, edition, html, subject: edition.subject, preheader: edition.preheader });
      await updateEdition(env, edition.id, { status: EDITION_STATUS.SCHEDULED, odoo_mailing_id: r.mailingId });
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'scheduled', text: 'Ingepland in Odoo' });
      return json({ success: true, data: r });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/ai-subject': async ({ env, user, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      const items = await listContributions(env, edition.id);
      return json({ success: true, data: await stelOnderwerpVoor(env, user, { series, edition, items: items.filter((i) => heeftInhoud(i, { events: [] })) }) });
    } catch (err) { return fout(err); }
  },

  'GET /api/editions/:id/answers': async ({ env, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      const [items, rijen] = await Promise.all([listContributions(env, edition.id), antwoordenVanEditie(env, edition.id)]);
      const vragen = items.filter((i) => KINDS[i.kind]?.interactive).map((i) => {
        const eigen = rijen.filter((r) => r.contribution_id === i.id);
        const tel = {};
        for (const r of eigen) tel[r.option_value] = (tel[r.option_value] || 0) + 1;
        return {
          id: i.id, title: i.title, question: i.content?.question || '', options: i.content?.options || [],
          counts: tel, total: eigen.length, with_comment: eigen.filter((r) => r.comment).length,
          anonymous: eigen.filter((r) => !r.verified).length,
        };
      });
      return json({
        success: true,
        data: { questions: vragen, answers: rijen, integration_id: series.answers_integration_id || null },
      });
    } catch (err) { return fout(err); }
  },

  // ─── Stukjes ──────────────────────────────────────────────────────────────

  'GET /api/contributions/:id': async ({ env, user, params }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      const [users, comments] = await Promise.all([listUsers(env), listComments(env, item.id)]);
      const sectie = (series?.sections || []).find((s) => s.key === item.section_key) || null;
      return json({
        success: true,
        data: {
          item: { ...item, owner_name: naamVan(users, item.owner_user_id) },
          edition, series: series ? { ...series, is_editor: isEditorVan(user, series) } : null,
          hint: sectie?.hint || '',
          can_edit: magSchrijven(user, item, series),
          comments: comments.map((c) => ({ ...c, user_name: naamVan(users, c.user_id) })),
        },
      });
    } catch (err) { return fout(err); }
  },

  'PUT /api/contributions/:id': async ({ env, user, params, request }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      if (!magSchrijven(user, item, series)) throw new NewsletterError('Dit is niet jouw stukje.', 403);
      if (edition && !isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd.', 409);
      const b = await leesBody(request);
      const editor = isEditorVan(user, series);
      const w = {};
      const kind = b.kind !== undefined && isKind(b.kind) ? b.kind : item.kind;
      if (kind !== item.kind) w.kind = kind;
      if (b.title !== undefined) w.title = kort(b.title, 120);
      if (b.content !== undefined) w.content = normaliseerInhoud(kind, b.content);
      if (b.raw_notes !== undefined) w.raw_notes = kort(b.raw_notes, 6000);
      if (b.owner_user_id !== undefined && editor) w.owner_user_id = b.owner_user_id || null;
      if (b.series_ids !== undefined && !item.edition_id) w.series_ids = (b.series_ids || []).filter((x) => typeof x === 'string');
      // Een schrijver die verder werkt aan een ingeleverd of goedgekeurd
      // stukje, zet het terug op "ingeleverd": het moet opnieuw nagelezen.
      if (!editor && (w.content || w.title) && item.status === CONTRIBUTION_STATUS.APPROVED) w.status = CONTRIBUTION_STATUS.SUBMITTED;
      if ((w.content || w.title || w.raw_notes) && item.status === CONTRIBUTION_STATUS.OPEN) w.status = CONTRIBUTION_STATUS.DRAFT;
      return json({ success: true, data: await updateContribution(env, item.id, w) });
    } catch (err) { return fout(err); }
  },

  'POST /api/contributions/:id/status': async ({ env, user, params, request }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      const editor = isEditorVan(user, series);
      const doel = String((await leesBody(request)).status || '');
      const nu = new Date().toISOString();
      let w;
      if (doel === CONTRIBUTION_STATUS.SUBMITTED) {
        if (!magSchrijven(user, item, series)) throw new NewsletterError('Dit is niet jouw stukje.', 403);
        if (!heeftInhoud(item, { events: [{ id: 0 }] })) throw new NewsletterError('Er staat nog niets in om in te leveren.');
        w = { status: doel, submitted_at: nu };
      } else if (doel === CONTRIBUTION_STATUS.APPROVED) {
        if (!editor) throw new NewsletterError('Enkel de hoofdredactie keurt goed.', 403);
        w = { status: doel, approved_at: nu, approved_by: user.id };
      } else if (doel === CONTRIBUTION_STATUS.DRAFT) {
        if (!magSchrijven(user, item, series)) throw new NewsletterError('Dit is niet jouw stukje.', 403);
        w = { status: doel };
      } else {
        throw new NewsletterError('Onbekende stand.');
      }
      const bij = await updateContribution(env, item.id, w);
      const wie = user.full_name || user.email;
      const tekst = doel === CONTRIBUTION_STATUS.SUBMITTED ? `${wie} leverde "${item.title}" in`
        : doel === CONTRIBUTION_STATUS.APPROVED ? `${wie} keurde "${item.title}" goed`
          : `"${item.title}" terug naar de schrijver`;
      if (edition) {
        await logActivity(env, { editionId: edition.id, contributionId: item.id, userId: user.id, kind: doel, text: tekst });
        if (doel === CONTRIBUTION_STATUS.SUBMITTED) await meldInChat(env, series, `${series.name} ${edition.title}: ${tekst}.`);
      }
      return json({ success: true, data: bij });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/contributions/:id': async ({ env, user, params }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      const eigenIdee = !item.edition_id && (item.created_by === user.id || item.owner_user_id === user.id);
      if (!isEditorVan(user, series) && !eigenIdee) throw new NewsletterError('Dat mag enkel de hoofdredactie.', 403);
      if (edition && !isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd.', 409);
      await deleteContribution(env, item.id);
      if (edition) await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'removed', text: `"${item.title}" verwijderd` });
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /** Het stukje zoals het in de mail komt, ook voor wat nog niet bewaard is. */
  'POST /api/contributions/:id/preview': async ({ env, params, request }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      const b = await leesBody(request);
      const kind = isKind(b.kind) ? b.kind : item.kind;
      const users = await listUsers(env);
      const eigenaar = users.filter((u) => u.id === item.owner_user_id);
      const [perUser, tek, events] = await Promise.all([
        auteurs(env, eigenaar),
        tekeningen(env, { enkelPng: false }),
        kind === 'events' && edition ? eventsVoorEditie(env, series, edition) : Promise.resolve([]),
      ]);
      const ontwerp = {
        ...item, kind,
        title: b.title !== undefined ? kort(b.title, 120) : item.title,
        content: b.content !== undefined ? normaliseerInhoud(kind, b.content) : item.content,
        author: item.owner_user_id ? perUser[item.owner_user_id] || null : null,
      };
      const html = renderContribution({
        series, item: ontwerp,
        ctx: { events, thingieUrl: tek.url, answerLink: antwoordLinks(series, 'preview', false) },
      });
      return json({ success: true, data: { html } });
    } catch (err) { return fout(err); }
  },

  'POST /api/contributions/:id/ai': async ({ env, user, params, request }) => {
    try {
      const { item, series } = await stukjeMetContext(env, params.id);
      if (!magSchrijven(user, item, series)) throw new NewsletterError('Dit is niet jouw stukje.', 403);
      const b = await leesBody(request);
      const kind = isKind(b.kind) ? b.kind : item.kind;
      const ontwerp = {
        ...item, kind,
        title: b.title !== undefined ? b.title : item.title,
        content: b.content !== undefined ? normaliseerInhoud(kind, b.content) : item.content,
      };
      const voorstel = await stelStukjeVoor(env, user, {
        series, item: ontwerp, action: String(b.action || 'write'), notes: b.notes !== undefined ? b.notes : item.raw_notes,
      });
      return json({ success: true, data: voorstel });
    } catch (err) { return fout(err); }
  },

  'GET /api/contributions/:id/comments': async ({ env, params }) => {
    try {
      const [rijen, users] = await Promise.all([listComments(env, params.id), listUsers(env)]);
      return json({ success: true, data: rijen.map((c) => ({ ...c, user_name: naamVan(users, c.user_id) })) });
    } catch (err) { return fout(err); }
  },

  'POST /api/contributions/:id/comments': async ({ env, user, params, request }) => {
    try {
      const { item, edition } = await stukjeMetContext(env, params.id);
      const c = await addComment(env, item.id, user.id, (await leesBody(request)).body);
      if (edition) {
        await logActivity(env, { editionId: edition.id, contributionId: item.id, userId: user.id, kind: 'comment', text: `Opmerking bij "${item.title}"` });
      }
      return json({ success: true, data: { ...c, user_name: user.full_name || user.email } }, 201);
    } catch (err) { return fout(err); }
  },

  'POST /api/contributions/:id/refresh-news': async ({ env, user, params }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      if (!magSchrijven(user, item, series)) throw new NewsletterError('Dit is niet jouw stukje.', 403);
      if (!edition || item.kind !== 'news') throw new NewsletterError('Enkel voor "Uit het nieuws".');
      return json({ success: true, data: await vernieuwNieuws(env, edition, item) });
    } catch (err) { return fout(err); }
  },

  // ─── Voorraad, links, beelden ─────────────────────────────────────────────

  'POST /api/pool': async ({ env, user, request }) => {
    try {
      const b = await leesBody(request);
      const kind = isKind(b.kind) ? b.kind : 'article';
      const [rij] = await insertContributions(env, [{
        edition_id: null,
        series_ids: (b.series_ids || []).filter((x) => typeof x === 'string'),
        kind,
        title: kort(b.title, 120) || 'Idee',
        content: normaliseerInhoud(kind, b.content || {}),
        raw_notes: kort(b.raw_notes, 6000),
        owner_user_id: user.id,
        status: CONTRIBUTION_STATUS.DRAFT,
        source: kort(b.source, 300) || 'idee',
        created_by: user.id,
      }]);
      return json({ success: true, data: rij }, 201);
    } catch (err) { return fout(err); }
  },

  'POST /api/link-preview': async ({ request }) => {
    try {
      const { url: adres } = await leesBody(request);
      return json({ success: true, data: await linkVoorbeeld(adres) });
    } catch (err) {
      if (err instanceof ArticleFetchError) return json({ success: false, error: err.message, code: err.code }, 422);
      return fout(err);
    }
  },

  /** Een foto voor een stukje, naar R2 (newsletters/). Enkel PNG, JPEG of GIF. */
  'POST /api/upload': async ({ env, request }) => {
    try {
      const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ext = BEELD_TYPES[type];
      if (!ext) throw new NewsletterError('Enkel PNG, JPEG of GIF. Andere beelden zet het scherm eerst om.');
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_BEELD) throw new NewsletterError('Het beeld is leeg of groter dan 3 MB.');
      const key = `newsletters/${crypto.randomUUID()}.${ext}`;
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: type } });
      return json({ success: true, data: { url: `${ASSET_ORIGIN}/assets/${key}` } }, 201);
    } catch (err) { return fout(err); }
  },

  'GET /api/thingies': async ({ env }) => {
    try {
      const lijst = await lijstTekeningen(env);
      return json({
        success: true,
        data: lijst.map((t) => ({ name: t.name, label: t.label, svg: `/assets/${t.svgKey}`, png: t.pngKey ? `/assets/${t.pngKey}` : null })),
      });
    } catch (err) { return fout(err); }
  },

  /**
   * De PNG-kopie van een tekening (Gmail en Outlook tonen geen SVG). Zelfde
   * opslag als AV-slides (av-slides/lib/thingies.js): één kopie per tekening,
   * wie ze ook eerst nodig had.
   */
  'PUT /api/thingies/:name': async ({ env, params, request }) => {
    try {
      const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (type !== 'image/png') throw new NewsletterError('Enkel een PNG.');
      const lijst = await lijstTekeningen(env, { vers: true });
      const t = lijst.find((x) => x.name === params.name);
      if (!t) throw new NewsletterError('Die tekening bestaat niet in de Asset Manager.', 404);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) throw new NewsletterError('De PNG is leeg of groter dan 2 MB.');
      const key = pngSleutel(t.name, t.tag);
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
      vergeetTekeningen();
      return json({ success: true, data: { png: `/assets/${key}` } });
    } catch (err) { return fout(err); }
  },

  'GET /api/integrations': async ({ env }) => {
    try {
      const lijst = await listIntegrations(env);
      return json({
        success: true,
        data: lijst.filter((k) => k.source_type === 'generic_webhook').map((k) => ({ id: k.id, name: k.name, is_active: k.is_active })),
      });
    } catch (err) { return fout(err); }
  },
};
