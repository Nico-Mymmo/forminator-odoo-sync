/**
 * Nieuws & updates -- een link in het Google Chat-kanaal wordt een bericht.
 *
 * Wie in het kanaal (Media insights) een link plaatst, krijgt binnen de vijf
 * minuten in dezelfde draad antwoord: het artikel staat klaar in Nieuws &
 * updates als CONCEPT, met de samenvatting, labels en het beeld die de AI
 * voorstelde -- dezelfde weg als "Artikel analyseren" in het scherm
 * (fetchArticle + analyseerArtikel + createSnippet). Een mens kijkt het na en
 * publiceert; pas dan komt het op de site (en volgt de kaart, chat-melding.js).
 *
 * HOE DE OM HET KANAAL LEEST. Een incoming webhook kan enkel posten. Lezen
 * gaat via de Chat API, namens een medewerker die lid is van het kanaal
 * (domeinbrede delegatie van het service-account, src/lib/google-auth.js):
 *   NEWS_CHAT_SPACE   het kanaal, bv. "spaces/AAAA9V4bj9g" (wrangler.jsonc)
 *   NEWS_CHAT_READER  het @mymmo.com-adres waarnamens gelezen wordt
 * Scope: https://www.googleapis.com/auth/chat.messages.readonly -- die moet
 * in de Admin Console bij de domeinbrede delegatie staan. Zolang een van de
 * twee variabelen leeg is, doet dit NIETS: een deploy op zich begint nooit
 * uit zichzelf een kanaal te lezen.
 *
 * Wat er NIET gebeurt: berichten van bots (ook onze eigen kaarten) en oude
 * berichten. Bij de eerste ronde begint de OM bij "nu"; daarna onthoudt ze in
 * KV tot waar ze las. Elke link wordt hoogstens één keer verwerkt (KV), en
 * per ronde hoogstens drie, zodat een lange plak-sessie de cron niet opeet.
 */

import { getGoogleAccessToken } from '../../../lib/google-auth.js';
import { getSupabaseClient } from '../../../lib/database.js';
import { sendSystemChannelPayload } from '../../mini-apps/lib/chat.js';
import { fetchArticle } from './article-fetch.js';
import { analyseerArtikel } from './article-ai.js';
import { createSnippet, listTaxonomy } from './content-service.js';
import { chatKanaal } from './chat-melding.js';
import { LOG_PREFIX } from '../constants.js';

const SCOPE = 'https://www.googleapis.com/auth/chat.messages.readonly';
const SINDS = 'content-feed:chatinbox:sinds';
const PER_RONDE = 3;

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** De links in een chatbericht, zonder leestekens aan het eind. */
export function linksIn(bericht) {
  const tekst = `${bericht?.text || ''} ${bericht?.argumentText || ''}`;
  const gezien = new Set();
  const uit = [];
  for (const m of tekst.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?*_~]+$/, '');
    // Een Chat-, Meet- of Drive-link is geen artikel.
    if (/^https?:\/\/(chat|meet|docs|drive|mail)\.google\.com\//i.test(url)) continue;
    if (!gezien.has(url)) { gezien.add(url); uit.push(url); }
  }
  if (bericht?.matchedUrl?.url && !gezien.has(bericht.matchedUrl.url)) uit.unshift(bericht.matchedUrl.url);
  return uit;
}

async function hash(tekst) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** De OM-gebruiker van de lezer: de AI-analyse hoort bij een gebruiker (grens, logboek). */
async function omGebruiker(env, email) {
  const { data } = await getSupabaseClient(env).from('users').select('id, email, full_name, role')
    .ilike('email', String(email).trim()).maybeSingle();
  return data || null;
}

async function antwoord(env, draad, tekst) {
  try {
    await sendSystemChannelPayload(env, chatKanaal(env), { text: tekst }, { bron: 'Nieuws & updates', threadName: draad });
  } catch (error) {
    console.warn(`${LOG_PREFIX} antwoord in Google Chat mislukt:`, error?.message);
  }
}

async function verwerkLink(env, { url, draad, gebruiker }) {
  let artikel;
  try {
    artikel = await fetchArticle(url);
  } catch (error) {
    await antwoord(env, draad, `⚠️ Ik kon dit artikel niet lezen, dus het staat NIET in Nieuws & updates: ${error?.message || 'onbekende fout'}`);
    return;
  }
  const taxonomy = await listTaxonomy(env);
  const voorstel = await analyseerArtikel(env, gebruiker, artikel, taxonomy.tags || []);
  const type = (taxonomy.types || []).find((t) => t.name === 'Artikel');
  const item = await createSnippet(env, {
    title: voorstel.title,
    summaryTitle: voorstel.summaryTitle,
    summary: voorstel.summary,
    curatorNote: voorstel.curatorNote,
    quote: voorstel.quote,
    url: voorstel.url,
    cta: voorstel.cta,
    source: voorstel.source,
    publishedOn: voorstel.publishedOn || '',
    color: voorstel.color,
    tagIds: voorstel.tagIds || [],
    typeId: type ? type.id : 0,
    status: 'concept',
    imageSourceUrl: voorstel.imageSourceUrl || undefined,
  });
  const om = String(env?.APP_BASE_URL || '').replace(/\/+$/, '');
  const laag = voorstel.relevance === 'laag' ? '\nLet op: dit artikel lijkt weinig op te leveren voor onze doelgroep.' : '';
  await antwoord(env, draad, `✅ Staat klaar in Nieuws & updates: *${item?.summaryTitle || item?.title || voorstel.title}*\nKijk het na en publiceer het: ${om}/content-feed${laag}`);
}

export async function runChatInbox(env) {
  const space = String(env?.NEWS_CHAT_SPACE || '').trim();
  const lezer = String(env?.NEWS_CHAT_READER || '').trim();
  const kv = env?.MAPPINGS_KV || null;
  if (!space || !lezer || !kv) return 0;

  const sinds = await kv.get(SINDS);
  const nu = new Date().toISOString();
  if (!sinds) { await kv.put(SINDS, nu); return 0; }

  const token = await getGoogleAccessToken(env, lezer, SCOPE);
  const params = new URLSearchParams({ filter: `createTime > "${sinds}"`, orderBy: 'createTime asc', pageSize: '50' });
  const res = await fetch(`https://chat.googleapis.com/v1/${space}/messages?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Chat API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const berichten = (await res.json()).messages || [];

  const gebruiker = await omGebruiker(env, lezer);
  let gedaan = 0;
  let laatst = sinds;
  for (const b of berichten) {
    if (b.sender?.type === 'BOT') { laatst = b.createTime || laatst; continue; }
    const links = linksIn(b);
    let gestopt = false;
    for (const url of links) {
      const vlag = `content-feed:chatinbox:link:${await hash(url)}`;
      if (await kv.get(vlag)) continue;
      if (gedaan >= PER_RONDE) { gestopt = true; break; }
      await kv.put(vlag, nu);
      gedaan += 1;
      try {
        if (!gebruiker) throw new Error(`${lezer} heeft geen account in de OM`);
        await verwerkLink(env, { url, draad: b.thread?.name, gebruiker });
      } catch (error) {
        console.error(`${LOG_PREFIX} link uit Chat niet verwerkt (${url}):`, error?.message);
        await antwoord(env, b.thread?.name, `⚠️ Er liep iets mis, dus dit artikel staat NIET in Nieuws & updates: ${error?.message || 'onbekende fout'}`);
      }
    }
    // Een bericht met links die nog moeten wachten, lezen we volgende ronde opnieuw.
    if (gestopt) break;
    laatst = b.createTime || laatst;
  }
  if (laatst !== sinds) await kv.put(SINDS, laatst);
  return gedaan;
}
