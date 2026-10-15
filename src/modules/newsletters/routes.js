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
  listEditions, listEditionsRange, getEdition, updateEdition, listContributions, listContributionsForEditions,
  listPool, listMine, getContribution, insertContributions, updateContribution, deleteContribution,
  listComments, countComments, addComment, logActivity, listActivity, listUsers, isActiveEdition,
} from './lib/store.js';
import {
  KINDS, isKind, DEFAULT_OPTIONS, EDITION_STATUS, CONTRIBUTION_STATUS, LOG_PREFIX, ASSET_ORIGIN,
  sendMode, testEmails, BRAND, BEELD_KADERS, BEELD_PLAATSEN, TEKENING_MATEN, TITEL_NIVEAUS, MERKKLEUREN, merkkleur, BERICHT_VORMEN,
  VRAAG_SOORTEN, VRAAG_STIJLEN, VRAAG_STANDAARD, VRAAG_OUDE_KLEUREN, NIEUWS_VORMEN, NIEUWS_MAX,
} from './lib/constants.js';
import { renderEdition, renderContribution, heeftInhoud, kopVan, inToc } from './lib/render.js';
import { verzamel, maakEditieOp, vernieuwNieuws, ondertekenaarId, metOndertekening } from './lib/editions.js';
import { antwoordLinks, antwoordenVanEditie } from './lib/answers.js';
import { tokenVeldBestaat, verstuurTest, leesCijfers } from './lib/odoo-mailing.js';
import { voorgesteldMoment, controleerMoment, bouwEchteMail, datumKort } from './lib/verzending.js';
import { stelStukjeVoor, stelOnderwerpVoor } from './lib/ai.js';
import { linkVoorbeeld, eventsVoorEditie, auteurs, tekeningen, eventsTussen } from './lib/sources.js';
import { stuurHerinnering } from './lib/cron.js';
import { hostBeelden, BEELDEN_MAP } from './lib/beelden-hosten.js';
import { naamVoor, medewerkerVoorOdooGebruiker, medewerkersVoorGebruikers } from '../../lib/medewerkers.js';
import { isEmail } from './lib/constants.js';
import { lijstTekeningen, pngSleutel, vergeetTekeningen } from '../av-slides/lib/thingies.js';
import { listIntegrations } from '../forminator-sync-v2/database.js';
import { listVimeoVideos, getVimeoVideo, idFromVimeoUrl, resolveVideoWithoutToken } from '../event-operations-v2/lib/vimeo.js';
import { ArticleFetchError } from '../content-feed/lib/article-fetch.js';
import { listSnippets, getSnippet, getSnippetImage, listTaxonomy, importImageFromUrl } from '../content-feed/lib/content-service.js';
import { hostBerichtBeeld, kaartjeVanBericht } from './lib/berichten.js';
import { bedenkLabel } from '../content-feed/lib/article-ai.js';
import { serializeAiError, httpStatusForAiError } from '../mini-apps/lib/ai-errors.js';
import { sendSystemChannelMessage, listChannels } from '../mini-apps/lib/chat.js';
import { searchRead } from '../../lib/odoo.js';
import { checklist } from './lib/checklist.js';

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

/** Eén beeld, voor elke plek (zie BEELD_KADERS). Null = geen beeld. */
function normaliseerBeeld(b, vastePlaats = null) {
  if (!b || typeof b !== 'object') return null;
  const thingie = /^[a-z0-9-]{1,60}$/.test(String(b.thingie || '')) ? b.thingie : '';
  const adres = thingie ? '' : url(b.url);
  if (!thingie && !adres) return null;
  const getal = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0.5));
  return {
    url: adres,
    thingie,
    plaats: vastePlaats || (BEELD_PLAATSEN.includes(b.plaats) ? b.plaats : 'rechts'),
    na_alinea: Math.max(0, Math.min(30, Number.parseInt(b.na_alinea, 10) || 0)),
    vulling: !thingie && b.vulling === 'vullen' ? 'vullen' : 'heel',
    focus: { x: getal(b.focus?.x), y: getal(b.focus?.y) },
    uitsnede: thingie ? '' : url(b.uitsnede),
    // Enkel een tekening heeft een grootte; een foto volgt het kader van haar plek.
    ...(thingie ? { maat: Object.prototype.hasOwnProperty.call(TEKENING_MATEN, b.maat) ? b.maat : 'middel' } : {}),
  };
}

/**
 * De inhoud van een stukje, per soort. Daarbij voor elke soort: een eigen
 * achtergrond, enkel uit de merkkleuren (MERKKLEUREN).
 */
export function normaliseerInhoud(kind, c = {}) {
  const uit = inhoudPerSoort(kind, c);
  const bg = merkkleur(c?.achtergrond);
  if (bg) uit.achtergrond = bg;
  // In of uit de inhoudstafel, als marketing dat uitdrukkelijk koos (anders de standaard per soort, inToc()).
  if (c?.in_toc === false || c?.in_toc === true) uit.in_toc = c.in_toc;
  return uit;
}

/**
 * Label en "gedeeld door" van een bericht uit Nieuws & updates. EEN plek voor
 * het overnemen van een bericht en voor het aanvullen van oudere blokken.
 */
async function berichtExtra(env, user, x, vermijd = []) {
  const [taxonomy, eigenaar] = await Promise.all([
    listTaxonomy(env).catch(() => ({ tags: [] })),
    x.owner?.id ? medewerkerVoorOdooGebruiker(env, x.owner.id) : null,
  ]);
  const tags = (x.tagIds || []).map((id) => (taxonomy.tags || []).find((t) => t.id === id)).filter(Boolean);
  const tag = await bedenkLabel(env, user, { ...x, tags }, { vermijd });
  const doorNaam = eigenaar?.naam || x.owner?.name || '';
  // "Administrator" en co. zijn geen collega: dan liever niemand.
  const door = doorNaam && !/^(administrator|admin|odoobot)$/i.test(doorNaam.trim())
    ? { name: doorNaam, job_title: eigenaar?.functie || '', avatar_url: eigenaar?.foto_url || '' }
    : null;
  return { tag, door };
}

/**
 * Blokken met een bericht van vóór het label en "gedeeld door": één keer
 * aanvullen en bewaren (`door` staat daarna altijd in de inhoud, ook als
 * null). Hoogstens vier per keer, zodat een editie altijd vlot opent.
 */
async function vulBerichtenAan(env, user, items) {
  const oud = items.filter((i) => i.kind === 'snippet' && i.content?.snippet_id
    && (i.content.door === undefined || !String(i.content.tag || '').trim())).slice(0, 4);
  for (const it of oud) {
    try {
      const x = await getSnippet(env, it.content.snippet_id);
      if (!x) continue;
      const vermijd = items.filter((i) => i.kind === 'snippet' && i.id !== it.id).map((i) => i.content?.tag).filter(Boolean);
      const extra = await berichtExtra(env, user, x, vermijd);
      const content = {
        ...it.content,
        tag: String(it.content.tag || '').trim() || extra.tag,
        door: it.content.door === undefined ? extra.door : it.content.door,
        quote: it.content.quote || x.quote || '',
        source: it.content.source || x.source || '',
      };
      await updateContribution(env, it.id, { content: normaliseerInhoud('snippet', content) });
      it.content = normaliseerInhoud('snippet', content);
    } catch (error) {
      console.warn(`${LOG_PREFIX} bericht ${it.id} niet aangevuld:`, error?.message);
    }
  }
}

/** Wie een bericht deelde: enkel naam, functie en de publieke pasfoto. */
function normaliseerDoor(d) {
  if (!d || typeof d !== 'object' || !String(d.name || '').trim()) return null;
  return { name: kort(d.name, 100), job_title: kort(d.job_title, 120), avatar_url: url(d.avatar_url) };
}

function inhoudPerSoort(kind, c = {}) {
  switch (kind) {
    case 'heading':
      return {
        title: kort(c.title, 120), text: kort(c.text, 300),
        niveau: TITEL_NIVEAUS.some((n) => n.key === c.niveau) ? c.niveau : 'h1',
        // Een tekening als icoon voor de titel (optioneel).
        icoon: /^[a-z0-9-]{1,60}$/.test(String(c.icoon || '')) ? c.icoon : '',
      };
    case 'intro':
      return {
        title: kort(c.title, 160), text: kort(c.text, 4000),
        // Rechts naast de tekst: een tekening OF een foto.
        thingie: /^[a-z0-9-]{1,60}$/.test(String(c.thingie || '')) ? c.thingie : '',
        image_url: url(c.image_url),
        beeld: normaliseerBeeld(c.beeld),
        // Wie ondertekent (een OM-gebruiker); leeg = de schrijver.
        signer_user_id: /^[0-9a-f-]{36}$/i.test(String(c.signer_user_id || '')) ? c.signer_user_id : '',
      };
    case 'article':
      return {
        title: kort(c.title, 160), subtitle: kort(c.subtitle, 200), text: kort(c.text, 4000), image_url: url(c.image_url), image_alt: kort(c.image_alt, 160),
        thingie: /^[a-z0-9-]{1,60}$/.test(String(c.thingie || '')) ? c.thingie : '',
        link_url: url(c.link_url), link_label: kort(c.link_label, 60),
        beeld: normaliseerBeeld(c.beeld),
      };
    case 'snippet':
      return {
        snippet_id: Number.isInteger(Number(c.snippet_id)) && Number(c.snippet_id) > 0 ? Number(c.snippet_id) : null,
        // Het pilletje boven het bericht (Nieuws & updates stelt het voor).
        tag: kort(c.tag, 40),
        beeld_versie: kort(c.beeld_versie, 40),
        vorm: BERICHT_VORMEN.some((v) => v.key === c.vorm) ? c.vorm : 'klassiek',
        title: kort(c.title, 160), text: kort(c.text, 4000),
        quote: kort(c.quote, 400), source: kort(c.source, 80),
        link_url: url(c.link_url), link_label: kort(c.link_label, 60),
        beeld: normaliseerBeeld(c.beeld),
        // Wie het bericht in Nieuws & updates zette (de eigenaar in Odoo).
        door: normaliseerDoor(c.door),
      };
    case 'video':
      return {
        title: kort(c.title, 160), text: kort(c.text, 2000), video_url: url(c.video_url),
        thumbnail_url: url(c.thumbnail_url), button_label: kort(c.button_label, 60),
        beeld: normaliseerBeeld(c.beeld, 'video'),
      };
    case 'link':
    case 'linkedin':
      return {
        title: kort(c.title, 200), text: kort(c.text, 1500), url: url(c.url), image_url: url(c.image_url),
        site_name: kort(c.site_name, 80), author_name: kort(c.author_name, 80), link_label: kort(c.link_label, 60),
        beeld: normaliseerBeeld(c.beeld, 'link'),
      };
    case 'quote':
      return { quote: kort(c.quote, 600), person: kort(c.person, 100), role: kort(c.role, 120) };
    case 'image':
      return { beeld: normaliseerBeeld(c.beeld, 'vol'), bijschrift: kort(c.bijschrift, 200), link_url: url(c.link_url) };
    case 'statement':
    case 'question':
    case 'poll':
      return {
        question: kort(c.question, 200), intro: kort(c.intro, 500), options: normaliseerOpties(c.options, kind),
        ask_comment: c.ask_comment !== false, show_results: c.show_results !== false,
        // Hoe opvallend en in welke kleur (zonder keuze: zoals vroeger).
        stijl: VRAAG_STIJLEN.some((s) => s.key === c.stijl) ? c.stijl : VRAAG_STANDAARD[kind].stijl,
        // Enkel een merkkleur (de kleurkiezer); een oude kleurnaam wordt haar merkkleur.
        kleur: merkkleur(c.kleur) || merkkleur(VRAAG_OUDE_KLEUREN[c.kleur]) || VRAAG_STANDAARD[kind].kleur,
      };
    case 'events':
      return {
        heading: kort(c.heading, 120) || 'Kom ons ontmoeten',
        exclude_ids: (Array.isArray(c.exclude_ids) ? c.exclude_ids : []).map(Number).filter(Number.isInteger),
      };
    case 'news':
      return {
        // Leeg mag (dan staat er geen kop); nooit ingevuld = de vroegere standaard.
        heading: c.heading === undefined ? 'Wat er speelt' : kort(c.heading, 120),
        // Zonder keuze: zoals een oud nieuwsblok eruitzag (kaders zonder beeld).
        vorm: NIEUWS_VORMEN.some((v) => v.key === c.vorm) ? c.vorm : 'tekst',
        items: (Array.isArray(c.items) ? c.items : []).slice(0, 4).map((n) => ({
          snippet_id: Number.isInteger(Number(n?.snippet_id)) ? Number(n.snippet_id) : null,
          title: kort(n?.title, 200), note: kort(n?.note, 300), url: url(n?.url),
          source: kort(n?.source, 80), beeld_url: url(n?.beeld_url), beeld_versie: kort(n?.beeld_versie, 40),
          // Een tekening als beeld, wanneer het bericht zelf geen foto heeft.
          beeld_thingie: /^[a-z0-9-]{1,60}$/.test(String(n?.beeld_thingie || '')) ? n.beeld_thingie : '',
          // De foto bijgesneden op 16:9 (door het scherm gemaakt), zodat elk kaartje even hoog is.
          beeld_uitsnede: url(n?.beeld_uitsnede), beeld_versie_uitsnede: kort(n?.beeld_versie_uitsnede, 40),
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
  return u ? naamVoor(null, u) : null;
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

/**
 * Wie een testmail mag krijgen: de collega's met een OM-account en de adressen
 * uit NEWSLETTER_TEST_EMAILS. Niemand anders, ook niet als iemand het
 * intypt: zo blijft een test altijd intern.
 */
async function testOntvangers(env, user) {
  const users = await listUsers(env);
  const profielen = await medewerkersVoorGebruikers(env, users).catch(() => ({}));
  const standaard = testEmails(env);
  const lijst = [];
  const gezien = new Set();
  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!isEmail(email) || gezien.has(email)) continue;
    gezien.add(email);
    lijst.push({ email, name: naamVoor(profielen[u.id], u), standaard: standaard.includes(email), mij: email === String(user?.email || '').toLowerCase() });
  }
  for (const email of standaard) {
    if (gezien.has(email)) continue;
    gezien.add(email);
    lijst.push({ email, name: email, standaard: true, mij: email === String(user?.email || '').toLowerCase() });
  }
  lijst.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  return lijst;
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
          beeld_kaders: BEELD_KADERS,
          tekening_maten: TEKENING_MATEN,
          titel_niveaus: TITEL_NIVEAUS,
          merkkleuren: MERKKLEUREN,
          bericht_vormen: BERICHT_VORMEN,
          nieuws_vormen: NIEUWS_VORMEN,
          nieuws_max: NIEUWS_MAX,
          vraag_soorten: VRAAG_SOORTEN,
          vraag_stijlen: VRAAG_STIJLEN,
          vraag_standaard: VRAAG_STANDAARD,
          vraag_oude_kleuren: VRAAG_OUDE_KLEUREN,
          default_options: DEFAULT_OPTIONS,
          asset_origin: ASSET_ORIGIN,
          series: series.map((s) => ({ ...s, is_editor: isEditorVan(user, s) })),
          users: users.map((u) => ({ id: u.id, name: naamVoor(null, u), email: u.email })),
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

  /**
   * De kalender: edities (verzenddag en inleverdatum) in een periode, over
   * alle reeksen heen, met wat er nog open staat, plus de events uit
   * Eventbeheer als laag eronder.
   */
  'GET /api/kalender': async ({ env, user, request }) => {
    try {
      const u = new URL(request.url);
      const from = new Date(u.searchParams.get('from') || Date.now() - 31 * 86400000);
      const to = new Date(u.searchParams.get('to') || Date.now() + 62 * 86400000);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new NewsletterError('Ongeldige periode.');
      const [series, users, edities] = await Promise.all([listSeries(env), listUsers(env), listEditionsRange(env, { from: from.toISOString(), to: to.toISOString() })]);
      const items = await listContributionsForEditions(env, edities.map((e) => e.id));
      const perEditie = {};
      for (const it of items) (perEditie[it.edition_id] ||= []).push(it);
      const editions = edities.map((e) => {
        const lijst = (perEditie[e.id] || []).sort((a, b) => (a.position || 0) - (b.position || 0));
        const s = series.find((x) => x.id === e.series_id);
        const open = lijst.filter((i) => !KINDS[i.kind]?.auto && i.status !== CONTRIBUTION_STATUS.APPROVED)
          .map((i) => ({ id: i.id, title: i.title || KINDS[i.kind]?.label || 'Stukje', kind: i.kind, status: i.status, owner_user_id: i.owner_user_id, owner_name: naamVan(users, i.owner_user_id), mine: i.owner_user_id === user.id }));
        return {
          ...e, series_name: s?.name || '', series_code: s?.code || '', brand: s?.brand || '',
          is_editor: isEditorVan(user, s), progress: voortgang(lijst), open,
        };
      });
      const events = await eventsTussen(env, from, to);
      return json({ success: true, data: { editions, events, series: series.filter((s) => s.is_active).map((s) => ({ id: s.id, code: s.code, name: s.name, brand: s.brand, is_editor: isEditorVan(user, s) })) } });
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
      await vulBerichtenAan(env, user, items);
      const [opmerkingen, perUser] = await Promise.all([
        countComments(env, items.map((i) => i.id)),
        auteurs(env, users.filter((u) => items.some((i) => i.owner_user_id === u.id))),
      ]);
      let stats = edition.stats || null;
      if (edition.odoo_mailing_id && edition.status === EDITION_STATUS.SENT) {
        stats = await leesCijfers(env, edition.odoo_mailing_id).catch(() => stats);
      }
      // De checklist "klaar om te verzenden?": dezelfde als bij het inplannen.
      const tokenVeld = isActiveEdition(edition) && items.some((i) => KINDS[i.kind]?.interactive)
        ? await tokenVeldBestaat(env).catch(() => false) : true;
      const lijst = checklist({ series, edition, items, ctx: { events: [{ id: 0 }] }, tokenVeld, env });
      return json({
        success: true,
        data: {
          edition: { ...edition, stats },
          checklist: lijst,
          voorgesteld_moment: isActiveEdition(edition) ? voorgesteldMoment(series, edition).toISOString() : null,
          series: { ...series, is_editor: isEditorVan(user, series) },
          items: items.map((i) => ({
            ...i,
            owner_name: naamVan(users, i.owner_user_id),
            author: i.owner_user_id ? perUser[i.owner_user_id] || null : null,
            comment_count: opmerkingen[i.id] || 0,
            has_content: heeftInhoud(i, { events: [{ id: 0 }] }),
            heading: kopVan(i),
            in_toc: inToc(i),
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
      const b = await leesBody(request);
      if (edition.status === EDITION_STATUS.SCHEDULED) {
        // Ingepland: enkel het verzendmoment mag nog, en enkel zolang Odoo ze niet heeft.
        if (edition.odoo_mailing_id) throw new NewsletterError('Deze editie is al aan Odoo gegeven en vertrekt.', 409);
        if (b.send_at === undefined) throw new NewsletterError('Deze editie is ingepland. Haal ze eerst terug om iets te wijzigen.', 409);
        const d = controleerMoment(b.send_at);
        const bij = await updateEdition(env, edition.id, { send_at: d.toISOString() });
        await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'rescheduled', text: `Verzendmoment verplaatst naar ${datumKort(d)}` });
        return json({ success: true, data: bij });
      }
      if (!isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd of geannuleerd.', 409);
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
      // Verslepen op de kalender: enkel een nieuwe verzenddag; de inleverdatum schuift evenveel mee.
      if (w.send_at && !w.deadline_at && b.schuif_inleverdatum) {
        const delta = new Date(w.send_at).getTime() - new Date(edition.send_at).getTime();
        w.deadline_at = new Date(new Date(edition.deadline_at).getTime() + delta).toISOString();
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
      if (edition.status === EDITION_STATUS.SCHEDULED) throw new NewsletterError('Deze editie is ingepland. Haal ze eerst terug.', 409);
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

  /**
   * Hetzelfde voorbeeld, maar met EEN stukje zoals het nu in het schrijfpaneel
   * staat (nog niet bewaard). Zo ziet de schrijver zijn tekst meteen op zijn
   * plek in de brief, met dezelfde renderer als de mail.
   */
  'POST /api/editions/:id/preview': async ({ env, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      const b = await leesBody(request);
      const mode = b.mode === 'test' ? 'test' : 'preview';
      const v = await verzamel(env, series, edition, { png: mode !== 'preview' });
      const o = b.override && typeof b.override === 'object' ? b.override : null;
      let items = o?.id ? v.items.map((it) => {
        if (it.id !== o.id) return it;
        const kind = isKind(o.kind) ? o.kind : it.kind;
        return {
          ...it, kind,
          title: o.title !== undefined ? kort(o.title, 120) : it.title,
          content: o.content !== undefined ? normaliseerInhoud(kind, o.content) : it.content,
        };
      }) : v.items;
      // Net een andere ondertekenaar gekozen: diens foto en functie erbij.
      const nieuw = items.map(ondertekenaarId).filter((id) => id && !v.auteurs[id]);
      if (nieuw.length) Object.assign(v.auteurs, await auteurs(env, v.users.filter((u) => nieuw.includes(u.id))));
      items = items.map((it) => metOndertekening(it, v.auteurs));
      const { html, open } = renderEdition({
        series, edition, items, mode,
        ctx: { ...v.ctx, answerLink: antwoordLinks(series, 'preview', false) },
      });
      return json({ success: true, data: { html, open: open.length } });
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

      // Gekozen plek in de brief: `after_id` = het stukje waarna het komt,
      // '' = helemaal bovenaan. Iedereen die iets toevoegt, kiest zijn plek;
      // de hoofdredactie kan het nadien nog verschuiven.
      const plaats = async (nieuwId) => {
        if (b.after_id === undefined || b.after_id === null) return;
        const volgorde = items.map((i) => i.id).filter((id) => id !== nieuwId);
        const na = b.after_id ? volgorde.indexOf(String(b.after_id)) : -1;
        if (b.after_id && na < 0) return;
        volgorde.splice(na + 1, 0, nieuwId);
        const oud = new Map(items.map((i) => [i.id, i.position]));
        let pos = 10;
        for (const id of volgorde) {
          if (oud.get(id) !== pos) await updateContribution(env, id, { position: pos });
          pos += 10;
        }
      };

      if (b.from_pool_id) {
        eisEditor(user, series);
        const p = await getContribution(env, b.from_pool_id);
        if (!p || p.edition_id) throw new NewsletterError('Dat idee staat niet (meer) in de voorraad.', 404);
        const bij = await updateContribution(env, p.id, { edition_id: edition.id, position: positie });
        await plaats(p.id);
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
        // Een leeg labeltje mag (een gewoon tekstblok heeft er geen); geen titel = de soort.
        title: b.title === '' ? '' : kort(b.title, 120) || KINDS[kind].label,
        content: normaliseerInhoud(kind, b.content || {}),
        owner_user_id: eigenaar,
        // Een titel zet de hoofdredactie zelf: dat is opmaak, niets om nog te bevestigen.
        status: kind === 'heading' && isEditorVan(user, series) ? CONTRIBUTION_STATUS.APPROVED
          : b.content ? CONTRIBUTION_STATUS.DRAFT : CONTRIBUTION_STATUS.OPEN,
        source: kort(b.source, 300),
        created_by: user.id,
      }]);
      await plaats(rij.id);
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
  /** Wie je kan aanvinken voor een testmail. */
  'GET /api/test-ontvangers': async ({ env, user }) => {
    try {
      return json({ success: true, data: await testOntvangers(env, user) });
    } catch (err) { return fout(err); }
  },

  'POST /api/editions/:id/test': async ({ env, user, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      // Enkel aangevinkte collega's; wat niet in de lijst staat, valt stil weg.
      const b = await leesBody(request);
      const toegelaten = new Set((await testOntvangers(env, user)).map((x) => x.email));
      const gekozen = (Array.isArray(b.emails) ? b.emails : []).map((x) => String(x || '').trim().toLowerCase()).filter((x) => toegelaten.has(x));
      const adressen = gekozen.length ? gekozen : testEmails(env);
      if (!adressen.length) throw new NewsletterError('Kies minstens één collega voor de testmail.');
      const tokenVeld = await tokenVeldBestaat(env);
      const v = await verzamel(env, series, edition, { png: true });
      const { html } = renderEdition({
        series, edition, items: v.items, mode: 'test',
        ctx: { ...v.ctx, answerLink: antwoordLinks(series, 'test', tokenVeld) },
      });
      const subject = edition.subject || `${series.name} ${edition.title}`;
      // Elk beeld op onze eigen, publieke opslag (lib/beelden-hosten.js).
      const gehost = await hostBeelden(env, html, { series });
      const r = await verstuurTest(env, { series, edition, html: gehost.html, subject, preheader: edition.preheader, adressen });
      await updateEdition(env, edition.id, {
        test_mailing_ids: [...(edition.test_mailing_ids || []), r.mailingId],
        last_test_at: new Date().toISOString(),
      });
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'test', text: `Testmail naar ${r.to.join(', ')}` });
      return json({ success: true, data: { ...r, token_field: tokenVeld, beeld_problemen: gehost.problemen } });
    } catch (err) { return fout(err); }
  },

  /**
   * "Verzenden": de editie op Ingepland zetten met een verzendmoment. Er
   * wordt NIETS in Odoo klaargezet; de cron verstuurt op het moment zelf
   * (lib/verzending.js). Tot dan kan marketing verplaatsen of terughalen.
   */
  'POST /api/editions/:id/schedule': async ({ env, user, params, request }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      if (sendMode(env) !== 'live') throw new NewsletterError('Echte verzending staat uit. Enkel testen kan.', 403);
      const b = await leesBody(request);
      if (b.confirm !== 'VERSTUREN') throw new NewsletterError('Bevestig met VERSTUREN.');
      if (!isActiveEdition(edition)) throw new NewsletterError('Deze editie is al ingepland, verstuurd of geannuleerd.', 409);
      const moment = controleerMoment(b.send_at || voorgesteldMoment(series, edition).toISOString());
      // Dezelfde checklist als in het scherm: wat daar rood staat, houdt hier tegen.
      const { items, ctx, tokenVeld, problemen } = await bouwEchteMail(env, series, edition);
      const lijst = checklist({ series, edition, items, ctx, tokenVeld, env });
      const tegen = lijst.items.filter((p) => p.blokkeert && !p.ok);
      if (tegen.length) {
        throw new NewsletterError(`Nog niet klaar om te verzenden: ${tegen.map((p) => p.label + (p.uitleg ? ` (${p.uitleg})` : '')).join('; ')}.`, 409);
      }
      // Een beeld dat niet op onze opslag kan, zou bij de lezer gebroken zijn: nu al zeggen.
      if (problemen.length) {
        throw new NewsletterError(`Deze beelden konden niet klaargezet worden voor de mail: ${problemen.join(', ')}. Laad ze opnieuw op als PNG of JPEG.`, 409);
      }
      const bij = await updateEdition(env, edition.id, { status: EDITION_STATUS.SCHEDULED, send_at: moment.toISOString(), odoo_mailing_id: null });
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'scheduled', text: `Verzenden ingepland op ${datumKort(moment)}` });
      await meldInChat(env, series, `${series.name} ${edition.title} vertrekt op ${datumKort(moment)}. Tot dan kan marketing ze nog terughalen in de OM.`);
      return json({ success: true, data: bij });
    } catch (err) { return fout(err); }
  },

  /** Terughalen: terug naar Nalezen, zolang Odoo de mailing nog niet heeft. */
  'POST /api/editions/:id/unschedule': async ({ env, user, params }) => {
    try {
      const { edition, series } = await editieMetReeks(env, params.id);
      eisEditor(user, series);
      if (edition.status !== EDITION_STATUS.SCHEDULED) throw new NewsletterError('Deze editie is niet ingepland.', 409);
      if (edition.odoo_mailing_id) throw new NewsletterError('Te laat: deze editie is al aan Odoo gegeven en vertrekt.', 409);
      const bij = await updateEdition(env, edition.id, { status: EDITION_STATUS.REVIEW });
      await logActivity(env, { editionId: edition.id, userId: user.id, kind: 'unscheduled', text: 'Teruggehaald, terug naar Nalezen' });
      await meldInChat(env, series, `${series.name} ${edition.title} is teruggehaald en vertrekt voorlopig niet.`);
      return json({ success: true, data: bij });
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
      // Staat de koppeling aan? Zo niet, dan is "doorgezet" enkel bewaard, niets in Odoo.
      let actieveKoppeling = false;
      if (series.answers_integration_id) {
        try {
          const k = (await listIntegrations(env)).find((x) => x.id === series.answers_integration_id);
          actieveKoppeling = Boolean(k?.is_active);
        } catch { /* dan onbekend */ }
      }
      return json({
        success: true,
        data: { questions: vragen, answers: rijen, integration_id: series.answers_integration_id || null, integration_active: actieveKoppeling },
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
      if (b.content !== undefined) {
        // Stijl en kleur van een vraag zet de hoofdredactie in de opmaakstand:
        // wie zijn tekst bewaart zonder ze mee te sturen, wist ze niet.
        const metOpmaak = { ...b.content };
        if (metOpmaak.stijl === undefined && item.content?.stijl) metOpmaak.stijl = item.content.stijl;
        if (metOpmaak.kleur === undefined && item.content?.kleur) metOpmaak.kleur = item.content.kleur;
        if (metOpmaak.in_toc === undefined && typeof item.content?.in_toc === 'boolean') metOpmaak.in_toc = item.content.in_toc;
        w.content = normaliseerInhoud(kind, metOpmaak);
        // De achtergrond zet de hoofdredactie in de opmaakstand; een schrijver
        // die zijn tekst bewaart, wist ze niet.
        if (b.content.achtergrond === undefined && item.content?.achtergrond) w.content.achtergrond = item.content.achtergrond;
      }
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
        : doel === CONTRIBUTION_STATUS.APPROVED ? `${wie} bevestigde "${item.title}"`
          : `"${item.title}" terug naar de schrijver`;
      if (edition) {
        await logActivity(env, { editionId: edition.id, contributionId: item.id, userId: user.id, kind: doel, text: tekst });
        if (doel === CONTRIBUTION_STATUS.SUBMITTED) await meldInChat(env, series, `${series.name} ${edition.title}: ${tekst}.`);
      }
      return json({ success: true, data: bij });
    } catch (err) { return fout(err); }
  },

  /**
   * De achtergrondkleur van één blok (opmaakstand). Apart van het bewaren van
   * de inhoud: het verandert de stand van het stukje niet.
   */
  'POST /api/contributions/:id/achtergrond': async ({ env, user, params, request }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      eisEditor(user, series);
      if (edition && !isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd.', 409);
      const kleur = merkkleur((await leesBody(request)).kleur);
      const content = { ...(item.content || {}) };
      if (kleur) content.achtergrond = kleur; else delete content.achtergrond;
      return json({ success: true, data: await updateContribution(env, item.id, { content }) });
    } catch (err) { return fout(err); }
  },

  /** In de inhoudstafel of niet (opmaakstand), zoals de achtergrond. */
  'POST /api/contributions/:id/in-toc': async ({ env, user, params, request }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      eisEditor(user, series);
      if (edition && !isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd.', 409);
      // Uitdrukkelijk erin of eruit: de standaard per soort (inToc) telt dan niet meer.
      const aan = (await leesBody(request)).in_toc !== false;
      const content = { ...(item.content || {}), in_toc: aan };
      return json({ success: true, data: await updateContribution(env, item.id, { content }) });
    } catch (err) { return fout(err); }
  },

  /** Stijl en kleur van een vraag (opmaakstand), zoals de achtergrond. */
  'POST /api/contributions/:id/vraagstijl': async ({ env, user, params, request }) => {
    try {
      const { item, edition, series } = await stukjeMetContext(env, params.id);
      eisEditor(user, series);
      if (edition && !isActiveEdition(edition)) throw new NewsletterError('Deze editie is al verstuurd.', 409);
      if (!KINDS[item.kind]?.interactive) throw new NewsletterError('Enkel voor een vraag aan de lezer.');
      const b = await leesBody(request);
      const content = normaliseerInhoud(item.kind, {
        ...(item.content || {}),
        ...(b.stijl !== undefined ? { stijl: b.stijl } : {}),
        ...(b.kleur !== undefined ? { kleur: b.kleur } : {}),
      });
      if (item.content?.achtergrond) content.achtergrond = item.content.achtergrond;
      return json({ success: true, data: await updateContribution(env, item.id, { content }) });
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
      const ondertekenaar = kind === 'intro' ? (b.content?.signer_user_id ?? item.content?.signer_user_id) : null;
      const eigenaar = users.filter((u) => u.id === item.owner_user_id || u.id === ondertekenaar);
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
        series, item: metOndertekening(ontwerp, perUser),
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
      // Het woordje vooraf zegt wat er in de editie staat: geef de titels mee.
      const inhoud = kind === 'intro' && item.edition_id
        ? (await listContributions(env, item.edition_id))
          .filter((i) => i.id !== item.id && !['toc', 'closing', 'intro', 'image'].includes(i.kind) && heeftInhoud(i, { events: [{ id: 0 }] }))
          .map(kopVan).filter(Boolean)
        : [];
      const voorstel = await stelStukjeVoor(env, user, {
        series, item: ontwerp, action: String(b.action || 'write'), notes: b.notes !== undefined ? b.notes : item.raw_notes, inhoud,
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
      const key = `${BEELDEN_MAP}${crypto.randomUUID()}.${ext}`;
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: type } });
      return json({ success: true, data: { url: `${ASSET_ORIGIN}/assets/${key}` } }, 201);
    } catch (err) { return fout(err); }
  },

  /**
   * Een beeld van elders (link-voorbeeld, Odoo) naar onze opslag, zodat het
   * scherm er een uitsnede van kan maken (een canvas mag enkel beelden van de
   * eigen site lezen) en de mail niet van een andere site afhangt.
   */
  'POST /api/beeld-importeer': async ({ env, request }) => {
    try {
      const adres = url((await leesBody(request)).url);
      if (!adres) throw new NewsletterError('Geen geldige link naar een beeld.');
      if (adres.startsWith(`${ASSET_ORIGIN}/assets/`)) return json({ success: true, data: { url: adres } });
      const res = await fetch(adres, { redirect: 'follow', headers: { Accept: 'image/png,image/jpeg,image/gif' } });
      const type = String(res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ext = BEELD_TYPES[type];
      if (!res.ok || !ext) throw new NewsletterError('Dit beeld kan niet in een mail. Laad het zelf op als PNG of JPEG.');
      const bytes = await res.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_BEELD) throw new NewsletterError('Het beeld is leeg of groter dan 3 MB.');
      const key = `${BEELDEN_MAP}${crypto.randomUUID()}.${ext}`;
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: type } });
      return json({ success: true, data: { url: `${ASSET_ORIGIN}/assets/${key}` } }, 201);
    } catch (err) { return fout(err); }
  },

  // ─── Berichten uit Nieuws & updates ──────────────────────────────────────

  /** De gepubliceerde berichten, nieuwste eerst, voor de keuzelijst. */
  'GET /api/snippets': async ({ env }) => {
    try {
      const { items } = await listSnippets(env, { statuses: ['published'], limit: 60, offset: 0 });
      console.log(`${LOG_PREFIX} berichten uit Nieuws & updates: ${(items || []).length}`);
      return json({
        success: true,
        data: (items || []).map((x) => ({
          id: x.id, title: x.summaryTitle || x.title, published_on: x.publishedOn || '', type: x.type?.name || '',
        })),
      });
    } catch (err) { return fout(err); }
  },

  /**
   * Eén bericht als inhoud van een blok: titel, tekst, link en beeld. Het beeld
   * gaat meteen naar onze eigen opslag (public/nieuwsbrieven/), zodat het in
   * de mail zeker werkt. Een WebP kan een mail niet tonen en kan de server
   * niet omzetten: dat geeft de route als data-URI terug, het scherm zet het om
   * naar JPEG en laadt het op.
   */
  'POST /api/snippets/:id/overnemen': async ({ env, request, params, user }) => {
    try {
      const body = await leesBody(request);
      const x = await getSnippet(env, params.id);
      if (!x) throw new NewsletterError('Dat bericht bestaat niet (meer).', 404);
      // De labels die al in de brief staan: het nieuwe moet anders klinken.
      const vermijd = (Array.isArray(body.vermijd) ? body.vermijd : []).map((v) => kort(v, 40)).filter(Boolean).slice(0, 12);
      const { tag, door } = await berichtExtra(env, user, x, vermijd);
      const inhoud = {
        snippet_id: x.id,
        tag,
        title: x.summaryTitle || x.title || '',
        text: x.summary || x.curatorNote || '',
        quote: x.quote || '',
        source: x.source || '',
        link_url: x.url || '',
        link_label: x.cta || 'Lees verder',
        beeld: null,
        // Welke versie van het beeld we overnamen: verandert het in Nieuws &
        // updates, dan neemt lib/berichten.js het nieuwe over.
        beeld_versie: x.hasImage ? String(x.imageVersion || '') : '',
        door,
      };
      let beeld_data = null;
      if (x.hasImage) {
        const img = await getSnippetImage(env, x.id);
        const ext = img && BEELD_TYPES[img.contentType];
        if (ext && img.bytes.byteLength <= MAX_BEELD) {
          const key = `${BEELDEN_MAP}${crypto.randomUUID()}.${ext}`;
          await env.R2_ASSETS.put(key, img.bytes, { httpMetadata: { contentType: img.contentType } });
          inhoud.beeld = { url: `${ASSET_ORIGIN}/assets/${key}`, plaats: 'tekst', na_alinea: 0, vulling: 'heel' };
        } else if (img && img.contentType === 'image/webp' && img.bytes.byteLength <= MAX_BEELD) {
          let bin = '';
          for (let i = 0; i < img.bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, img.bytes.subarray(i, i + 0x8000));
          beeld_data = `data:image/webp;base64,${btoa(bin)}`;
        }
      }
      return json({ success: true, data: { inhoud, beeld_data } });
    } catch (err) { return fout(err); }
  },

  /**
   * Een bericht als klein kaartje in "Kort nieuws": titel, korte tekst, link,
   * bron en een publieke kopie van het beeld (geen AI-label: daarvoor is het
   * kaartje te klein).
   */
  'POST /api/snippets/:id/kort': async ({ env, params }) => {
    try {
      const x = await getSnippet(env, params.id);
      if (!x) throw new NewsletterError('Dat bericht bestaat niet (meer).', 404);
      const beeld = x.hasImage ? await hostBerichtBeeld(env, x.id).catch(() => null) : null;
      return json({
        success: true,
        data: {
          ...kaartjeVanBericht(x),
          beeld_url: beeld || '',
          beeld_versie: x.hasImage && beeld ? String(x.imageVersion || '') : '',
        },
      });
    } catch (err) { return fout(err); }
  },

  /**
   * Een beeld dat in de brief bij een bericht gekozen werd, ook op het
   * bericht zelf zetten in Nieuws & updates (en dus op de site). Een
   * tekening gaat als haar PNG-kopie. Faalt zacht: de brief heeft het beeld
   * al; het bericht krijgt het bij een volgende poging.
   */
  'POST /api/snippets/:id/beeld': async ({ env, params, request, user }) => {
    try {
      const adres = url((await leesBody(request)).url);
      if (!adres) throw new NewsletterError('Geen geldig beeld.');
      const x = await getSnippet(env, params.id);
      if (!x) throw new NewsletterError('Dat bericht bestaat niet (meer).', 404);
      const gelukt = await importImageFromUrl(env, x.id, adres);
      if (gelukt) console.log(`${LOG_PREFIX} beeld op bericht ${x.id} gezet door ${user?.email || '?'}`);
      return json({ success: true, data: { gelukt } });
    } catch (err) { return fout(err); }
  },

  /** Een ander label voor een bericht (de knop naast het label in het scherm). */
  'POST /api/snippets/:id/label': async ({ env, request, params, user }) => {
    try {
      const body = await leesBody(request);
      const x = await getSnippet(env, params.id);
      if (!x) throw new NewsletterError('Dat bericht bestaat niet (meer).', 404);
      const vermijd = (Array.isArray(body.vermijd) ? body.vermijd : []).map((v) => kort(v, 40)).filter(Boolean).slice(0, 12);
      const taxonomy = await listTaxonomy(env).catch(() => ({ tags: [] }));
      const tags = (x.tagIds || []).map((id) => (taxonomy.tags || []).find((t) => t.id === id)).filter(Boolean);
      return json({ success: true, data: { tag: await bedenkLabel(env, user, { ...x, tags }, { vermijd }) } });
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

  /**
   * De Odoo-lijsten (mailing.list) met hun aantal contacten, voor de
   * keuzelijst bij een reeks: niemand typt nog nummers over.
   */
  'GET /api/mailing-lists': async ({ env }) => {
    try {
      let rijen;
      try {
        rijen = await searchRead(env, { model: 'mailing.list', domain: [['active', '=', true]], fields: ['id', 'name', 'contact_count'], limit: 100, order: 'name asc' });
      } catch {
        rijen = await searchRead(env, { model: 'mailing.list', domain: [['active', '=', true]], fields: ['id', 'name'], limit: 100, order: 'name asc' });
      }
      return json({ success: true, data: (rijen || []).map((r) => ({ id: r.id, name: r.name, contacts: Number.isFinite(Number(r.contact_count)) ? Number(r.contact_count) : null })) });
    } catch (err) { return fout(err); }
  },

  /** De chatkanalen uit het kanaalregister (Mini-apps), enkel naam. */
  'GET /api/chat-channels': async ({ env }) => {
    try {
      return json({ success: true, data: (await listChannels(env)).map((k) => ({ id: k.id, name: k.name })) });
    } catch (err) { return fout(err); }
  },

  // ─── Video: dezelfde Vimeo-kiezer als bij de events ──────────────────────

  /** De video's uit het Vimeo-account (lib/vimeo.js van Eventbeheer; zonder token: `configured: false`). */
  'GET /api/vimeo/videos': async ({ env, request }) => {
    try {
      const u = new URL(request.url);
      return json({ success: true, data: await listVimeoVideos(env, { query: u.searchParams.get('q') || '', page: u.searchParams.get('page') || 1 }) });
    } catch (err) { return fout(err); }
  },

  /**
   * Eén video: titel, link en stilstaand beeld, uit de Vimeo-API (met token)
   * of de publieke oEmbed (ook YouTube). Body: { vimeo_id } of { url }.
   */
  'POST /api/video': async ({ env, request }) => {
    try {
      const b = await leesBody(request);
      const raw = String(b.url || '').trim();
      const vimeoId = b.vimeo_id ? String(b.vimeo_id).replace(/\D/g, '') : idFromVimeoUrl(raw);
      let video = vimeoId ? await getVimeoVideo(env, vimeoId) : null;
      if (!video) video = await resolveVideoWithoutToken(raw || `https://vimeo.com/${vimeoId}`);
      if (!video) throw new NewsletterError('Geen geldige Vimeo- of YouTube-link herkend.');
      return json({ success: true, data: { url: video.url, title: video.title, thumbnail_url: video.thumbnail_url } });
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
