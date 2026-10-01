/**
 * Praten met de website-tracker. De OM schrijft NIET rechtstreeks in D1 (één
 * schrijver: de tracker); koppelingen en tijdlijnen lopen via deze twee routes.
 * Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §1.
 *
 * Via de service binding TRACKER als die er is (niet over het internet), anders
 * de publieke URL. Zelfde secret als de conversies: WEB_CONVERSION_SECRET.
 */

const PUBLIC_BASE = 'https://website-tracker.openvme-odoo.workers.dev';

async function post(env, path, body) {
  if (!env.WEB_CONVERSION_SECRET) throw new Error('WEB_CONVERSION_SECRET ontbreekt');
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Conversion-Secret': env.WEB_CONVERSION_SECRET },
    body: JSON.stringify(body),
  };
  const res = env.TRACKER
    ? await env.TRACKER.fetch(new Request('https://website-tracker.internal' + path, init))
    : await fetch(PUBLIC_BASE + path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`tracker ${path}: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** links: [{ uuid, model, res_id, bron, sterkte, status?, detail? }] */
export async function saveLinks(env, links) {
  let total = { bewaard: 0, geweigerd: 0, changes: 0 };
  for (let i = 0; i < links.length; i += 1000) {
    const r = await post(env, '/internal/links', { links: links.slice(i, i + 1000) });
    total.bewaard += r.bewaard || 0;
    total.geweigerd += r.geweigerd || 0;
    total.changes += r.changes || 0;
  }
  return total;
}

/** Tijdlijn + KPI-HTML voor een set bezoekers (max 50 per aanroep, zie lib/story.js in de tracker). */
export async function fetchTimeline(env, uuids, { omUrl = null } = {}) {
  return post(env, '/internal/timeline', { uuids: uuids.slice(0, 50), om_url: omUrl });
}
