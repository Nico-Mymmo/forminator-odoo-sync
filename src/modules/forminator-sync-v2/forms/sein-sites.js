/**
 * Na het bewaren van een OM-formulier de sites een seintje geven, zodat ze de
 * nieuwe versie meteen ophalen in plaats van na hun bewaartijd (tot een uur).
 *
 * Zelfde opzet als de productfeatures (product-features/lib/websites.js): het
 * seintje draagt GEEN inhoud, enkel de slug. De site haalt zelf op wat de
 * publieke API geeft, met haar eigen sitesleutel. Een site die het formulier
 * niet toont, doet er niets mee. Mislukt het, dan komt de wijziging gewoon na
 * de bewaartijd door -- het seintje faalt nooit naar buiten.
 *
 * Welke sites: die van FORMS_PUBLIC_ORIGINS en BOOKING_LINK_SITES.
 */
import { hostVan } from '../../product-features/lib/websites.js';

export async function seinFormulier(env, slug) {
  const s = String(slug || '').trim();
  if (!/^[a-z0-9-]{1,80}$/.test(s)) return [];
  const hosts = [...new Set([env?.FORMS_PUBLIC_ORIGINS, env?.BOOKING_LINK_SITES]
    .flatMap((v) => String(v || '').split(','))
    .map((r) => r.trim().replace(/^[a-z0-9-]+:(?=https?:\/\/)/i, ''))
    .map((h) => hostVan(h).replace(/^www\./, ''))
    .filter(Boolean))];
  await Promise.all(hosts.map(async (host) => {
    try {
      const res = await fetch(`https://${host}/wp-json/mymmo-forms/v1/formulier/ververs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: s }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) console.warn('[forms] seintje naar', host, res.status);
    } catch (err) {
      console.warn('[forms] seintje naar', host, 'mislukt:', err?.message);
    }
  }));
  return hosts;
}
