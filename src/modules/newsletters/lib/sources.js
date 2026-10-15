/**
 * Nieuwsbrieven -- de bronnen waaruit een editie zich vult.
 *
 * GEEN eigen Odoo-query voor events of nieuws: `listEvents()` (Eventbeheer) en
 * `listSnippets()` (Nieuws & updates) zijn de motoren van die modules en kennen
 * hun eigen eigenaardigheden. Zelfde regel als events-in-feed.js.
 *
 * Alles hier faalt ZACHT: een storing in Eventbeheer laat de agenda leeg, maar
 * houdt de rest van de editie niet tegen. Wel luid loggen.
 */

import { listEvents } from '../../event-operations-v2/lib/events-service.js';
import { resolvePublicOrigin } from '../../event-operations-v2/lib/mail-service.js';
import { PUBLIC_EVENT_PATH, PUBLICATION_STATE } from '../../event-operations-v2/constants.js';
import { listSnippets } from '../../content-feed/lib/content-service.js';
import { fetchArticle } from '../../content-feed/lib/article-fetch.js';
import { lijstTekeningen, tekeningZoeker } from '../../av-slides/lib/thingies.js';
import { searchRead } from '../../../lib/odoo.js';
import { medewerkersVoorGebruikers, naamVoor } from '../../../lib/medewerkers.js';
import { LOG_PREFIX, ASSET_ORIGIN } from './constants.js';

const DAG_MS = 24 * 60 * 60 * 1000;

// ─── Events ─────────────────────────────────────────────────────────────────

/**
 * De events die in een editie horen: gepubliceerd, van het merk (of gedeeld),
 * en tussen het verzendmoment en ~6 weken later. Een event dat al voorbij is
 * wanneer de mail vertrekt, komt er nooit in.
 */
export async function eventsVoorEditie(env, series, edition) {
  const van = new Date(edition.send_at);
  const tot = new Date(van.getTime() + 45 * DAG_MS);
  try {
    const { events } = await listEvents(env, {
      filters: {
        publication_states: [PUBLICATION_STATE.PUBLISHED],
        brand: series.brand,
        from: van.toISOString(),
        to: tot.toISOString(),
      },
      limit: 12,
      offset: 0,
      order: 'x_studio_event_datetime asc',
    });
    const origin = resolvePublicOrigin(env, series.brand);
    return (events || []).map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      location: e.location?.name || '',
      url: e.slug && origin ? `${origin}${PUBLIC_EVENT_PATH}/${e.slug}/?owid=${Number(e.id)}` : '',
      cta: e.registration?.status?.open ? 'Inschrijven' : 'Meer info',
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} events voor editie ${edition.id} niet gelezen:`, error?.message);
    return [];
  }
}

/** Alle gepubliceerde events (beide merken) in een periode, als laag op de kalender. Faalt zacht. */
export async function eventsTussen(env, van, tot) {
  try {
    const { events } = await listEvents(env, {
      filters: { publication_states: [PUBLICATION_STATE.PUBLISHED], from: new Date(van).toISOString(), to: new Date(tot).toISOString() },
      limit: 80, offset: 0, order: 'x_studio_event_datetime asc',
    });
    return (events || []).map((e) => {
      const origin = resolvePublicOrigin(env, e.brand);
      return { id: e.id, title: e.title, starts_at: e.starts_at, brand: e.brand || '', url: e.slug && origin ? `${origin}${PUBLIC_EVENT_PATH}/${e.slug}/?owid=${Number(e.id)}` : '' };
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} events voor de kalender niet gelezen:`, error?.message);
    return [];
  }
}

// ─── Nieuws & updates ───────────────────────────────────────────────────────

/** Gepubliceerde berichten sinds `sinds` (JJJJ-MM-DD), nieuwste eerst. */
export async function nieuwsSinds(env, sinds, { limit = 12 } = {}) {
  try {
    const { items } = await listSnippets(env, { statuses: ['published'], limit: 40, offset: 0 });
    return (items || [])
      .filter((s) => s.publishedOn && (!sinds || s.publishedOn >= sinds))
      .slice(0, limit)
      .map((s) => ({
        snippet_id: s.id,
        title: s.summaryTitle || s.title,
        note: s.curatorNote || kort(s.summary, 170),
        url: s.url || '',
        published_on: s.publishedOn,
      }));
  } catch (error) {
    console.error(`${LOG_PREFIX} nieuws niet gelezen:`, error?.message);
    return [];
  }
}

function kort(tekst, max) {
  const t = String(tekst || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// ─── Links (ook LinkedIn) ───────────────────────────────────────────────────

/**
 * Titel, tekst en beeld van een link. Gebruikt fetchArticle() uit Nieuws &
 * updates: die heeft de SSRF-grens en leest met HTMLRewriter. Een LinkedIn-post
 * geeft zijn tekst in og:description.
 */
export async function linkVoorbeeld(url) {
  const a = await fetchArticle(url);
  const isLinkedin = /(^|\.)linkedin\.com$/i.test(new URL(a.url).hostname);
  let auteur = '';
  let titel = a.title || '';
  if (isLinkedin) {
    // LinkedIn zet "Naam op LinkedIn: tekst..." in de titel.
    const m = /^(.+?)\s+(?:op|on)\s+LinkedIn\s*[:|-]/i.exec(titel);
    if (m) auteur = m[1].trim();
    titel = titel.replace(/\s*\|\s*LinkedIn\s*$/i, '');
  }
  return {
    url: a.url,
    title: kort(titel, 160),
    text: kort(a.description || a.text, 400),
    image_url: a.imageUrl || '',
    site_name: a.siteName || '',
    is_linkedin: isLinkedin,
    author_name: auteur,
  };
}

// ─── Mensen ─────────────────────────────────────────────────────────────────

/**
 * Naam, functie en foto per OM-gebruiker, voor de naam onder elk stukje en de
 * handtekening. Uit src/lib/medewerkers.js, zoals overal in de OM; nooit een
 * e-mailadres als naam. Nooit fataal: zonder Odoo is het gewoon de naam.
 */
export async function auteurs(env, users) {
  const profielen = await medewerkersVoorGebruikers(env, users || []);
  const perId = {};
  for (const u of users || []) {
    const p = profielen[u.id];
    perId[u.id] = { name: naamVoor(p, u), job_title: p?.functie || '', avatar_url: p?.foto_url || '' };
  }
  return perId;
}

let bedrijfMemo = { at: 0, data: null };

/** Naam en adres van het bedrijf, voor de voettekst (verplichte afzendergegevens). */
export async function bedrijf(env) {
  if (bedrijfMemo.data && Date.now() - bedrijfMemo.at < 6 * 60 * 60 * 1000) return bedrijfMemo.data;
  try {
    const rijen = await searchRead(env, {
      model: 'res.company', domain: [], fields: ['name', 'street', 'zip', 'city'], limit: 1, order: 'id asc',
    });
    const r = rijen?.[0];
    const adres = r ? [r.street, [r.zip, r.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    bedrijfMemo = { at: Date.now(), data: { name: r?.name || 'Mymmo BV', address: adres } };
  } catch (error) {
    console.warn(`${LOG_PREFIX} bedrijfsgegevens niet gelezen:`, error?.message);
    bedrijfMemo = { at: Date.now(), data: { name: 'Mymmo BV', address: '' } };
  }
  return bedrijfMemo.data;
}

// ─── Tekeningen ─────────────────────────────────────────────────────────────

/**
 * Naam -> URL van de PNG-kopie. Gmail en Outlook tonen GEEN SVG, dus in een
 * mail enkel PNG. De kopie wordt door de browser gemaakt (zelfde opslag als
 * AV-slides: av-slides/thingies/<naam>-<etag>.png). Voor het voorbeeld in de
 * OM mag de SVG.
 */
export async function tekeningen(env, { enkelPng = true } = {}) {
  try {
    const lijst = await lijstTekeningen(env);
    return { lijst, url: tekeningZoeker(lijst, ASSET_ORIGIN, { enkelPng }) };
  } catch (error) {
    console.warn(`${LOG_PREFIX} tekeningen niet gelezen:`, error?.message);
    return { lijst: [], url: () => null };
  }
}
