/**
 * Nieuws & updates -- een gepubliceerd bericht als kaart in Google Chat
 * (kanaal "Media insights").
 *
 * Wanneer: de eerste keer dat een bericht in de OM op "gepubliceerd" komt
 * (aanmaken of bewaren). Een vlag in KV (`content-feed:chat:gemeld:<id>`)
 * maakt dat een bericht nooit twee keer gemeld wordt, ook niet als iemand het
 * later opnieuw bewaart.
 *
 * Het kanaal staat in het kanaalregister van de OM (Mini-apps -> Chat-kanalen),
 * op naam: CONTENT_FEED_CHAT_CHANNEL in wrangler.jsonc, standaard
 * "Media insights". De webhook-URL bevat een sleutel en staat dus NOOIT in de
 * code. Is het kanaal niet geregistreerd, dan gebeurt er niets (enkel een
 * regel in de log).
 *
 * Het beeld: Google Chat haalt het beeld van een kaart zelf op, dus het moet
 * publiek staan. De beeldroute van Nieuws & updates vraagt een sitesleutel;
 * daarom komt er een kopie in R2 onder `public/nieuws-en-updates/` (een eigen
 * map in Assetbeheer).
 */

import { sendSystemChannelPayload } from '../../mini-apps/lib/chat.js';
import { getSnippetImage } from './content-service.js';
import { LOG_PREFIX } from '../constants.js';

const BEELD_MAP = 'public/nieuws-en-updates/';
const ASSET_ORIGIN = 'https://link.openvme.be';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

export function chatKanaal(env) {
  return String(env?.CONTENT_FEED_CHAT_CHANNEL || 'Media insights').trim();
}

function omOrigin(env) {
  return String(env?.APP_BASE_URL || '').replace(/\/+$/, '');
}

/** Tekst voor een kaart: Google Chat kent een klein beetje HTML. */
function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function kort(tekst, max) {
  const t = String(tekst || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export async function publiekBeeld(env, item) {
  if (!item.hasImage || !env?.R2_ASSETS) return null;
  try {
    const sleutelBasis = `${BEELD_MAP}${item.id}-${item.imageVersion || '0'}`;
    for (const ext of Object.values(EXT)) {
      if (await env.R2_ASSETS.head(`${sleutelBasis}.${ext}`)) return `${ASSET_ORIGIN}/assets/${sleutelBasis}.${ext}`;
    }
    const img = await getSnippetImage(env, item.id);
    const ext = img && EXT[img.contentType];
    if (!ext) return null;
    await env.R2_ASSETS.put(`${sleutelBasis}.${ext}`, img.bytes, { httpMetadata: { contentType: img.contentType } });
    return `${ASSET_ORIGIN}/assets/${sleutelBasis}.${ext}`;
  } catch (error) {
    console.warn(`${LOG_PREFIX} beeld voor de chatkaart niet klaargezet:`, error?.message);
    return null;
  }
}

/** De kaart zelf. Puur, zodat ze getest kan worden. */
export function bouwKaart(item, {
  door = '', beeldUrl = null, omUrl = '',
  kop = 'Nieuw in Nieuws & updates', ondertitel = '', omLabel = 'Open in de OM', tekst = '',
} = {}) {
  const titel = item.summaryTitle || item.title || 'Nieuw bericht';
  const label = [item.type?.name, item.source].filter(Boolean).join(' · ');
  const widgets = [];
  if (beeldUrl) widgets.push({ image: { imageUrl: beeldUrl, altText: titel } });
  widgets.push({ decoratedText: { topLabel: label || 'Nieuws & updates', text: `<b>${esc(titel)}</b>`, wrapText: true } });
  if (item.summary) widgets.push({ textParagraph: { text: esc(kort(item.summary, 400)) } });
  if (item.curatorNote) widgets.push({ decoratedText: { topLabel: 'Waarom we dit delen', text: esc(kort(item.curatorNote, 200)), wrapText: true } });
  const knoppen = [];
  if (item.url) knoppen.push({ text: item.cta || 'Lees het artikel', onClick: { openLink: { url: item.url } } });
  if (omUrl) knoppen.push({ text: omLabel, onClick: { openLink: { url: omUrl } } });
  if (knoppen.length) widgets.push({ buttonList: { buttons: knoppen } });
  return {
    text: tekst || `${kop}: ${titel}`,
    cardsV2: [{
      cardId: `nieuws-${item.id}`,
      card: {
        header: { title: kop, subtitle: ondertitel || (door ? `Toegevoegd door ${door}` : 'Nieuws & updates') },
        sections: [{ widgets }],
      },
    }],
  };
}

/**
 * Meld een bericht in het kanaal als het gepubliceerd is en nog niet gemeld.
 * Nooit fataal: wie bewaart, merkt niets van een chatstoring.
 */
export async function meldGepubliceerd(env, item, { door = '' } = {}) {
  if (!item || item.status !== 'published' || !item.id) return false;
  const kv = env?.MAPPINGS_KV || null;
  const vlag = `content-feed:chat:gemeld:${item.id}`;
  try {
    if (kv && await kv.get(vlag)) return false;
    const kaart = bouwKaart(item, { door, beeldUrl: await publiekBeeld(env, item), omUrl: omOrigin(env) ? `${omOrigin(env)}/content-feed` : '' });
    await sendSystemChannelPayload(env, chatKanaal(env), kaart, { bron: 'Nieuws & updates' });
    if (kv) await kv.put(vlag, new Date().toISOString());
    return true;
  } catch (error) {
    console.warn(`${LOG_PREFIX} melding in Google Chat mislukt (${chatKanaal(env)}):`, error?.message);
    return false;
  }
}
