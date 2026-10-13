/**
 * Nieuwsbrieven -- elk beeld in een verstuurde mail staat op onze eigen,
 * publieke opslag, op het domein van het merk.
 *
 * WAAROM. Een mailprogramma haalt elk beeld op bij het openen (Gmail via een
 * eigen proxy). Wat daar misloopt:
 *   - een beeld op een andere server verdwijnt, verhuist of wordt geblokkeerd
 *     (het beeld bij een link, een logo op WordPress);
 *   - een Odoo-foto (`/web/image/<id>`) werkt enkel als die bijlage publiek is,
 *     anders krijgt de lezer een gebroken beeld of een aanmeldpagina;
 *   - een R2-bestand buiten `public/` krijgt `Cache-Control: private,
 *     no-store` (src/router/public-routes.js), wat proxies en mailprogramma's
 *     slecht verdragen.
 * Daarom kopieert deze stap, vlak voor een test of een echte verzending, elk
 * beeld naar `public/nieuwsbrieven/mail/` (zichtbaar in Assetbeheer, map
 * public/nieuwsbrieven) en zet de mail het adres op link.<merk>/assets/...
 * Dezelfde bron levert altijd dezelfde sleutel (hash van het adres), dus een
 * tweede test kopieert niets opnieuw.
 *
 * Enkel PNG, JPEG en GIF: dat tonen alle mailprogramma's. Een beeld dat niet
 * gekopieerd kan worden, blijft staan en komt in `problemen`, zodat het scherm
 * het kan melden.
 */

import { ASSET_ORIGIN, BRAND } from './constants.js';
import { searchRead } from '../../../lib/odoo.js';
import { odooOrigin } from '../../../lib/medewerkers.js';

/** De map in Assetbeheer (categorie public/) voor alle nieuwsbriefbeelden. */
export const BEELDEN_MAP = 'public/nieuwsbrieven/';

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif' };
const MAX = 3 * 1024 * 1024;
const EIGEN = [...new Set([ASSET_ORIGIN, ...Object.values(BRAND).map((b) => b.linkHost)])];

async function hash(tekst) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64NaarBytes(b64) {
  const bin = atob(b64);
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

/** Een eigen R2-sleutel uit een adres op onze /assets/, of null. */
function eigenSleutel(adres) {
  for (const o of EIGEN) {
    if (adres.startsWith(`${o}/assets/`)) return decodeURIComponent(adres.slice(`${o}/assets/`.length).split('?')[0]);
  }
  return null;
}

/** De bytes van een beeld, waar het ook staat. */
async function haal(env, adres) {
  if (adres.startsWith('data:')) {
    const m = /^data:([^;,]+);base64,(.+)$/i.exec(adres);
    return m ? { type: m[1].toLowerCase(), bytes: base64NaarBytes(m[2]) } : null;
  }
  const sleutel = eigenSleutel(adres);
  if (sleutel) {
    const o = await env.R2_ASSETS.get(sleutel);
    if (!o) return null;
    const type = String(o.httpMetadata?.contentType || '').toLowerCase()
      || (/\.png$/i.test(sleutel) ? 'image/png' : /\.gif$/i.test(sleutel) ? 'image/gif' : 'image/jpeg');
    return { type, bytes: new Uint8Array(await o.arrayBuffer()) };
  }
  // Een Odoo-bijlage via de API: werkt ook als ze niet publiek staat.
  const odoo = new RegExp(`^${odooOrigin(env).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/web/image/(\\d+)`).exec(adres);
  if (odoo) {
    const [r] = await searchRead(env, { model: 'ir.attachment', domain: [['id', '=', Number(odoo[1])]], fields: ['datas', 'mimetype'], limit: 1 });
    return r?.datas ? { type: String(r.mimetype || 'image/jpeg').toLowerCase(), bytes: base64NaarBytes(r.datas) } : null;
  }
  if (!/^https:\/\//i.test(adres)) return null;
  const res = await fetch(adres, { redirect: 'follow', headers: { Accept: 'image/png,image/jpeg,image/gif' } });
  if (!res.ok) return null;
  return { type: String(res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase(), bytes: new Uint8Array(await res.arrayBuffer()) };
}

/**
 * @param {object} env
 * @param {string} html  de mail zoals de renderer hem maakte (modus test/live)
 * @param {object} opts.series  voor het domein van het merk
 * @returns {Promise<{ html: string, problemen: string[] }>}
 */
export async function hostBeelden(env, html, { series }) {
  const host = (BRAND[series?.brand] || BRAND.openvme).linkHost;
  const bronnen = new Set();
  for (const m of String(html).matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/gi)) bronnen.add(m[1]);

  const nieuw = new Map();
  const problemen = [];
  for (const src of bronnen) {
    const adres = src.replace(/&amp;/g, '&');
    const sleutel = eigenSleutel(adres);
    // Al publiek bij ons: enkel het domein van het merk.
    if (sleutel && sleutel.startsWith('public/')) {
      nieuw.set(src, `${host}/assets/${sleutel}`);
      continue;
    }
    try {
      const naam = `${BEELDEN_MAP}mail/${await hash(adres)}`;
      let doel = null;
      for (const ext of ['jpg', 'png', 'gif']) {
        if (await env.R2_ASSETS.head(`${naam}.${ext}`)) { doel = `${naam}.${ext}`; break; }
      }
      if (!doel) {
        const b = await haal(env, adres);
        const ext = b && TYPES[b.type];
        if (!ext || !b.bytes.byteLength || b.bytes.byteLength > MAX) { problemen.push(adres); continue; }
        doel = `${naam}.${ext}`;
        await env.R2_ASSETS.put(doel, b.bytes, { httpMetadata: { contentType: b.type === 'image/jpg' ? 'image/jpeg' : b.type } });
      }
      nieuw.set(src, `${host}/assets/${doel}`);
    } catch (error) {
      console.warn('[newsletters] beeld niet gekopieerd:', adres, error?.message);
      problemen.push(adres);
    }
  }

  let uit = String(html);
  for (const [oud, naar] of nieuw) uit = uit.split(`src="${oud}"`).join(`src="${naar}"`);
  return { html: uit, problemen };
}
