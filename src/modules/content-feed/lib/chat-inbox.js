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
 *
 * WIE HET DEELDE wordt de eigenaar van het bericht (en staat zo onder het
 * artikel in de nieuwsbrief). De Chat API geeft enkel "users/<id>"; het adres
 * komt uit de Directory (viewType=domain_public, scope
 * admin.directory.user.readonly -- al gedelegeerd voor de handtekeningen), de
 * Odoo-gebruiker daarna uit src/lib/medewerkers.js. Lukt dat niet, dan blijft
 * de eigenaar leeg: het bericht komt er wel.
 */

import { getGoogleAccessToken } from '../../../lib/google-auth.js';
import { getSupabaseClient } from '../../../lib/database.js';
import { sendSystemChannelPayload } from '../../mini-apps/lib/chat.js';
import { fetchArticle } from './article-fetch.js';
import { analyseerArtikel } from './article-ai.js';
import { createSnippet, listTaxonomy } from './content-service.js';
import { chatKanaal, bouwKaart, publiekBeeld } from './chat-melding.js';
import { medewerkerVoorGebruiker } from '../../../lib/medewerkers.js';
import { LOG_PREFIX } from '../constants.js';

const SCOPE = 'https://www.googleapis.com/auth/chat.messages.readonly';
const DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly';
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

/** Bekende bronnen: de naam zoals een lezer ze kent. Anders de domeinnaam. */
const BRONNEN = {
  'hln.be': 'HLN', 'nieuwsblad.be': 'Het Nieuwsblad', 'standaard.be': 'De Standaard', 'demorgen.be': 'De Morgen',
  'tijd.be': 'De Tijd', 'gva.be': 'Gazet van Antwerpen', 'hbvl.be': 'Het Belang van Limburg', 'vrt.be': 'VRT NWS',
  'knack.be': 'Knack', 'trends.be': 'Trends', 'bruzz.be': 'BRUZZ', 'nieuws.vtm.be': 'VTM Nieuws',
};

/**
 * Een RUW concept als de site ons het artikel niet laat lezen (betaalmuur,
 * cookiemuur, botblokkering -- HLN en de andere DPG-titels geven een 403).
 * Enkel wat we zeker weten: de link, de bron, een titel uit de URL en wat de
 * deler er zelf bij schreef. Geen samenvatting: die verzinnen we niet.
 * Puur, zodat het te testen is.
 */
export function ruwConcept(url, opmerking = '') {
  let host = '';
  let stuk = '';
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, '').toLowerCase();
    stuk = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
  } catch { /* geen geldige URL: dan blijft alles leeg */ }
  const bron = BRONNEN[host] || Object.entries(BRONNEN).find(([d]) => host.endsWith(`.${d}`))?.[1] || host;
  const woorden = stuk.replace(/~.*$/, '').replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const titel = woorden && /[a-z]{3}/i.test(woorden) && !/^\d+$/.test(woorden)
    ? woorden.charAt(0).toUpperCase() + woorden.slice(1)
    : `Artikel van ${bron || 'het web'}`;
  return {
    title: titel.slice(0, 200),
    summaryTitle: titel.slice(0, 120),
    summary: '',
    curatorNote: String(opmerking || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 200),
    url,
    source: bron,
    cta: 'Lees het artikel',
  };
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

/** De Odoo-gebruiker (res.users-id) van wie het bericht in Chat zette, of 0. */
async function odooGebruikerVan(env, lezer, sender, memo) {
  const id = String(sender?.name || '').replace(/^users\//, '');
  if (!/^\d+$/.test(id)) return 0;
  if (memo.has(id)) return memo.get(id);
  let uid = 0;
  try {
    const token = await getGoogleAccessToken(env, lezer, DIRECTORY_SCOPE);
    const res = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${id}?viewType=domain_public`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const email = (await res.json()).primaryEmail;
      const p = email ? await medewerkerVoorGebruiker(env, { email }) : null;
      uid = p?.user_id || 0;
    } else {
      console.warn(`${LOG_PREFIX} wie in Chat deelde niet gevonden: Directory ${res.status}`);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} wie in Chat deelde niet gevonden:`, error?.message);
  }
  memo.set(id, uid);
  return uid;
}

async function antwoord(env, draad, tekst) {
  return antwoordMet(env, draad, { text: tekst });
}

async function antwoordMet(env, draad, bericht) {
  try {
    await sendSystemChannelPayload(env, chatKanaal(env), bericht, { bron: 'Nieuws & updates', threadName: draad });
  } catch (error) {
    console.warn(`${LOG_PREFIX} antwoord in Google Chat mislukt:`, error?.message);
  }
}

async function verwerkLink(env, { url, draad, gebruiker, eigenaar, opmerking }) {
  let artikel;
  try {
    artikel = await fetchArticle(url);
  } catch (error) {
    // Een ongeldige link of geen webpagina: daar valt niets van te maken.
    if (['INVALID_URL', 'NOT_HTML', 'BLOCKED_HOST'].includes(error?.code)) {
      const fout = `Ik kon dit artikel niet lezen: ${error?.message || 'onbekende fout'}`;
      await antwoord(env, draad, `⚠️ ${fout} Het staat dus NIET in Nieuws & updates.`);
      return { ok: false, fout };
    }
    return ruwInNieuws(env, { url, draad, eigenaar, opmerking, reden: error?.message || 'onbekende fout' });
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
    ...(eigenaar ? { ownerId: eigenaar } : {}),
    imageSourceUrl: voorstel.imageSourceUrl || undefined,
  });
  const om = String(env?.APP_BASE_URL || '').replace(/\/+$/, '');
  const laag = voorstel.relevance === 'laag' ? '\nLet op: dit artikel lijkt weinig op te leveren voor onze doelgroep.' : '';
  const titel = item?.summaryTitle || item?.title || voorstel.title;
  const tekst = `✅ Nieuwsbericht staat klaar: *${titel}*\nKijk het na en publiceer het: ${om}/content-feed${laag}`;
  if (!item) { await antwoord(env, draad, tekst); return { ok: true, titel }; }
  // De herwerkte versie als kaart, in dezelfde draad als de link.
  const kaart = bouwKaart(item, {
    beeldUrl: await publiekBeeld(env, item),
    omUrl: om ? `${om}/content-feed` : '',
    kop: '✅ Nieuwsbericht staat klaar',
    ondertitel: laag ? 'Concept · lijkt weinig op te leveren voor onze doelgroep' : 'Concept · kijk het na en publiceer het',
    omLabel: 'Nakijken en publiceren',
    tekst,
  });
  await antwoordMet(env, draad, kaart);
  return { ok: true, titel, id: item.id };
}

/** De site laat ons niet binnen: een ruw concept, en dat eerlijk zeggen. */
async function ruwInNieuws(env, { url, draad, eigenaar, opmerking, reden }) {
  const taxonomy = await listTaxonomy(env).catch(() => ({ types: [] }));
  const type = (taxonomy.types || []).find((t) => t.name === 'Artikel');
  const ruw = ruwConcept(url, opmerking);
  const item = await createSnippet(env, {
    ...ruw,
    typeId: type ? type.id : 0,
    status: 'concept',
    ...(eigenaar ? { ownerId: eigenaar } : {}),
  });
  const om = String(env?.APP_BASE_URL || '').replace(/\/+$/, '');
  const titel = item?.summaryTitle || ruw.summaryTitle;
  const tekst = `📝 Ruw concept staat klaar: *${titel}*\n${ruw.source} liet ons het artikel niet lezen (${reden}). Vul de samenvatting zelf aan en publiceer het: ${om}/content-feed`;
  if (item) {
    await antwoordMet(env, draad, bouwKaart(item, {
      omUrl: om ? `${om}/content-feed` : '',
      kop: '📝 Ruw concept staat klaar',
      ondertitel: `${ruw.source} liet ons het artikel niet lezen · vul de samenvatting zelf aan`,
      omLabel: 'Aanvullen en publiceren',
      tekst,
    }));
  } else {
    await antwoord(env, draad, tekst);
  }
  return { ok: true, ruw: true, titel, id: item?.id };
}

/**
 * Eén ronde. Geeft { status, gedaan, sinds, gelezen, metLinks }: status 'uit'
 * (niet ingesteld), 'start' (de eerste ronde: vanaf nu wordt gelezen) of 'ok';
 * `gelezen` = berichten van mensen sinds `sinds`, `metLinks` = waarvan met een
 * link. De 5-minuten-cron roept dit aan, en de knop "Chat nu ophalen" in
 * Nieuws & updates ook.
 *
 * `terugMinuten` (enkel de knop): lees opnieuw vanaf zoveel minuten geleden.
 * Veilig: een link die al verwerkt is, heeft een vlag en komt er niet twee keer in.
 */
export async function runChatInbox(env, { terugMinuten = 0 } = {}) {
  const space = String(env?.NEWS_CHAT_SPACE || '').trim();
  const lezer = String(env?.NEWS_CHAT_READER || '').trim();
  const kv = env?.MAPPINGS_KV || null;
  if (!space || !lezer || !kv) return { status: 'uit', gedaan: 0 };

  const nu = new Date().toISOString();
  const terug = Math.min(Math.max(Number(terugMinuten) || 0, 0), 24 * 60);
  let sinds = await kv.get(SINDS);
  if (terug) {
    const vanaf = new Date(Date.now() - terug * 60000).toISOString();
    if (!sinds || vanaf < sinds) sinds = vanaf;
  }
  if (!sinds) { await kv.put(SINDS, nu); return { status: 'start', gedaan: 0, sinds: nu, gelezen: 0, metLinks: 0 }; }

  const token = await getGoogleAccessToken(env, lezer, SCOPE);
  const params = new URLSearchParams({ filter: `createTime > "${sinds}"`, orderBy: 'createTime asc', pageSize: '50' });
  const res = await fetch(`https://chat.googleapis.com/v1/${space}/messages?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Chat API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const berichten = (await res.json()).messages || [];

  const gebruiker = await omGebruiker(env, lezer);
  const wie = new Map();
  let gedaan = 0;
  const resultaten = [];
  let gelezen = 0;
  let metLinks = 0;
  let laatst = sinds;
  for (const b of berichten) {
    if (b.sender?.type === 'BOT') { laatst = b.createTime || laatst; continue; }
    const links = linksIn(b);
    gelezen += 1;
    if (links.length) metLinks += 1;
    let gestopt = false;
    for (const url of links) {
      const vlag = `content-feed:chatinbox:link:${await hash(url)}`;
      const stand = await kv.get(vlag);
      // Gelukt = nooit opnieuw. Mislukt (of van vóór deze vlaggen) = enkel opnieuw via de knop (`terug`),
      // niet elke 5 minuten (dat zou de draad volzetten met dezelfde fout).
      if (stand && !(terug && !String(stand).startsWith('ok:'))) continue;
      if (gedaan >= PER_RONDE) { gestopt = true; break; }
      await kv.put(vlag, `bezig:${nu}`);
      gedaan += 1;
      let r;
      try {
        if (!gebruiker) throw new Error(`${lezer} heeft geen account in de OM`);
        const eigenaar = await odooGebruikerVan(env, lezer, b.sender, wie);
        r = await verwerkLink(env, { url, draad: b.thread?.name, gebruiker, eigenaar, opmerking: b.text || '' });
      } catch (error) {
        const reden = [error?.code, error?.message].filter(Boolean).join(': ') || 'onbekende fout';
        console.error(`${LOG_PREFIX} link uit Chat niet verwerkt (${url}):`, reden);
        await antwoord(env, b.thread?.name, `⚠️ Er liep iets mis, dus dit artikel staat NIET in Nieuws & updates: ${reden}`);
        r = { ok: false, fout: reden };
      }
      await kv.put(vlag, r?.ok ? `ok:${nu}` : `fout:${nu}`);
      resultaten.push({ url, ...r });
    }
    // Een bericht met links die nog moeten wachten, lezen we volgende ronde opnieuw.
    if (gestopt) break;
    laatst = b.createTime || laatst;
  }
  // Nooit terug in de tijd: na "het laatste uur opnieuw" blijft de stand waar ze was.
  const opgeslagen = await kv.get(SINDS);
  if (laatst !== sinds && (!opgeslagen || laatst > opgeslagen)) await kv.put(SINDS, laatst);
  console.log(`${LOG_PREFIX} Chat-inbox: ${gelezen} bericht(en) sinds ${sinds}, ${metLinks} met een link, ${gedaan} verwerkt`);
  return { status: 'ok', gedaan, sinds, gelezen, metLinks, resultaten };
}
