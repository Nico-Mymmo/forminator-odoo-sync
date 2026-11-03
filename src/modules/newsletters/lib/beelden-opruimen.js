/**
 * Nieuwsbrieven -- beelden in public/nieuwsbrieven/ die niemand nog gebruikt,
 * weghalen. Eens per dag, in de cron.
 *
 * Wat er weg gaat: elk bestand dat de nieuwsbrief zelf oplaadde (opladen,
 * bijsnijden, overnemen uit Nieuws & updates) en dat:
 *   - in geen enkel blok staat, van geen enkele mailing, ook niet van een
 *     verstuurde, en ook niet in de voorraad;
 *   - niet in de kop van een mailing of in de instellingen van een soort staat;
 *   - in geen enkele mailing in Odoo staat (body_html van mailing.mailing,
 *     dus ook testmails en mailings die iemand in Odoo zelf maakte): een mail
 *     die vertrok, wijst ernaar, ook als het blok nadien een ander beeld kreeg;
 *   - langer dan een dag bestaat: wie aan een blok werkt, kan het net
 *     opgeladen hebben zonder te bewaren.
 *
 * Wat altijd blijft: de map mail/ (de kopieen die bij een test of verzending
 * gemaakt worden) en wat iemand via Assetbeheer of een andere module in de map
 * zette (customMetadata.module is dan iets anders dan 'newsletters'). Een
 * bestand zonder customMetadata is van voor 2026-11-03, toen de nieuwsbrief
 * het nog niet meegaf: dat is ook van de nieuwsbrief.
 *
 * Faalt het lezen van wat in gebruik is (database of Odoo), dan gooit dit en
 * gaat er NIETS weg.
 */

import { searchRead } from '../../../lib/odoo.js';
import { BEELDEN_MAP } from './beelden-hosten.js';
import { beeldVerwijzingen } from './store.js';
import { LOG_PREFIX } from './constants.js';

export const BEELD_MODULE = 'newsletters';
const GRATIE_MS = 24 * 3600 * 1000;
const EIGEN_BEELD = /\/assets\/(public\/nieuwsbrieven\/[^"'\s?#)<>\\]+)/g;

export function sleutelsIn(tekst, uit = new Set()) {
  for (const m of String(tekst || '').matchAll(EIGEN_BEELD)) {
    try { uit.add(decodeURIComponent(m[1])); } catch { uit.add(m[1]); }
  }
  return uit;
}

async function inOdoo(env, inGebruik) {
  const STAP = 100;
  for (let offset = 0; ; offset += STAP) {
    const rijen = await searchRead(env, {
      model: 'mailing.mailing',
      domain: [['body_html', 'ilike', 'public/nieuwsbrieven/']],
      fields: ['body_html'],
      limit: STAP,
      offset,
      order: 'id',
      context: { active_test: false },
    });
    for (const r of rijen || []) sleutelsIn(r.body_html, inGebruik);
    if (!rijen || rijen.length < STAP) return;
  }
}

/**
 * @returns {Promise<{ weg: number, bewaard: number }>}
 */
export async function ruimBeeldenOp(env) {
  if (!env?.R2_ASSETS) return { weg: 0, bewaard: 0 };
  const inGebruik = new Set();
  for (const v of await beeldVerwijzingen(env)) sleutelsIn(JSON.stringify(v), inGebruik);
  await inOdoo(env, inGebruik);

  const grens = Date.now() - GRATIE_MS;
  const kandidaten = [];
  let bewaard = 0;
  let cursor;
  do {
    const lijst = await env.R2_ASSETS.list({ prefix: BEELDEN_MAP, cursor, limit: 1000, include: ['customMetadata'] });
    for (const o of lijst.objects || []) {
      const module = o.customMetadata?.module;
      if (o.key.startsWith(`${BEELDEN_MAP}mail/`) || (module && module !== BEELD_MODULE)) continue;
      if (inGebruik.has(o.key) || new Date(o.uploaded).getTime() >= grens) { bewaard++; continue; }
      kandidaten.push(o.key);
    }
    cursor = lijst.truncated ? lijst.cursor : undefined;
  } while (cursor);

  for (let i = 0; i < kandidaten.length; i += 1000) await env.R2_ASSETS.delete(kandidaten.slice(i, i + 1000));
  console.log(LOG_PREFIX, `beelden opgeruimd: ${kandidaten.length} weg, ${bewaard} bewaard`);
  return { weg: kandidaten.length, bewaard };
}
