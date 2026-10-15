/**
 * Nieuwsbrieven -- berichten uit Nieuws & updates ALTIJD actueel.
 *
 * De tekst van een bericht (titel, samenvatting, link, citaat, bron) is van
 * Nieuws & updates, niet van de brief: wie ze wil aanpassen, doet dat op het
 * bericht zelf. Daarom haalt elke weergave (voorbeeld, testmail, verzending:
 * `verzamel()` in editions.js) de huidige versie op en zet ze over wat er
 * bewaard staat. Wat van de BRIEF is, blijft: het label, de vorm, waar het
 * beeld staat en hoe het gevuld is, en wie het deelde.
 *
 * Het beeld: een mail toont enkel een publiek beeld. Is het beeld in Nieuws &
 * updates veranderd (andere `imageVersion`), dan komt er één nieuwe kopie in
 * onze opslag en wordt die bij het blok bewaard; daarna niet opnieuw.
 *
 * Faalt ZACHT: is Nieuws & updates even niet bereikbaar, dan staat er wat er
 * bewaard was.
 */

import { getSnippet, getSnippetImage } from '../../content-feed/lib/content-service.js';
import { updateContribution } from './store.js';
import { BEELDEN_MAP } from './beelden-hosten.js';
import { ASSET_ORIGIN, LOG_PREFIX } from './constants.js';

const BEELD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const MAX_BEELD = 3 * 1024 * 1024;

/** De tekst van het bericht zoals ze in een blok komt. Puur. */
export function tekstVanBericht(x) {
  return {
    title: x.summaryTitle || x.title || '',
    text: x.summary || x.curatorNote || '',
    link_url: x.url || '',
    link_label: x.cta || 'Lees verder',
    quote: x.quote || '',
    source: x.source || '',
  };
}

/** Een bericht als kaartje in "Kort nieuws" (zonder beeld). Puur. */
export function kaartjeVanBericht(x) {
  return {
    snippet_id: x.id,
    title: x.summaryTitle || x.title || '',
    note: x.curatorNote || x.summary || '',
    url: x.url || '',
    source: x.source || '',
  };
}

/** Een publieke kopie van het beeld van een bericht, of null (geen beeld, of WebP). */
export async function hostBerichtBeeld(env, snippetId) {
  if (!env?.R2_ASSETS) return null;
  const img = await getSnippetImage(env, snippetId);
  const ext = img && BEELD_TYPES[img.contentType];
  if (!ext || img.bytes.byteLength > MAX_BEELD) return null;
  const key = `${BEELDEN_MAP}${crypto.randomUUID()}.${ext}`;
  await env.R2_ASSETS.put(key, img.bytes, { httpMetadata: { contentType: img.contentType } });
  return `${ASSET_ORIGIN}/assets/${key}`;
}

/** De kaartjes van "Kort nieuws": tekst en beeld van nu; een nieuw beeld wordt één keer bewaard. */
async function actueelNieuws(env, it) {
  let veranderd = false;
  const items = await Promise.all((it.content.items || []).map(async (n) => {
    const id = Number(n?.snippet_id);
    if (!Number.isInteger(id) || id <= 0) return n;
    try {
      const x = await getSnippet(env, id);
      if (!x) return n;
      const uit = { ...n, ...kaartjeVanBericht(x) };
      const versie = x.hasImage ? String(x.imageVersion || '') : '';
      if (versie !== String(n.beeld_versie || '')) {
        const url = versie ? await hostBerichtBeeld(env, id) : null;
        if (url || !versie) { uit.beeld_url = url || ''; uit.beeld_versie = versie; veranderd = true; }
      }
      return uit;
    } catch (error) {
      console.warn(`${LOG_PREFIX} bericht ${id} niet ververst:`, error?.message);
      return n;
    }
  }));
  const content = { ...it.content, items };
  if (veranderd) await updateContribution(env, it.id, { content }).catch(() => {});
  return { ...it, content };
}

export async function metActueleBerichten(env, items) {
  return Promise.all((items || []).map(async (it) => {
    if (it?.kind === 'news' && Array.isArray(it.content?.items) && it.content.items.some((n) => n?.snippet_id)) return actueelNieuws(env, it);
    const id = Number(it?.content?.snippet_id);
    if (it?.kind !== 'snippet' || !Number.isInteger(id) || id <= 0) return it;
    try {
      const x = await getSnippet(env, id);
      if (!x) return it;
      const content = { ...it.content, ...tekstVanBericht(x) };
      const versie = x.hasImage ? String(x.imageVersion || '') : '';
      if (versie !== String(it.content.beeld_versie || '')) {
        const url = versie ? await hostBerichtBeeld(env, id) : null;
        // Een beeld dat we niet konden overnemen (WebP): het vorige blijft staan.
        if (url || !versie) {
          content.beeld = url
            ? { ...(it.content.beeld || { plaats: 'tekst', na_alinea: 0 }), url, vulling: 'heel', uitsnede: undefined }
            : null;
          content.beeld_versie = versie;
          await updateContribution(env, it.id, { content });
        }
      }
      return { ...it, content };
    } catch (error) {
      console.warn(`${LOG_PREFIX} bericht ${id} niet ververst:`, error?.message);
      return it;
    }
  }));
}
