/**
 * Mini-Apps — R2 client (dunne laag rond env.R2_ASSETS)
 *
 * Elke mini-app is precies één HTML-bestand in R2 onder de key
 * "mini-apps/{appId}.html". Geen aparte JS/CSS-bestanden — mini-apps zijn
 * bewust single-file (zelfde patroon als het voorbeeld dat gebruikers
 * uploaden: alles inline in één .html).
 *
 * routes.js raakt env.R2_ASSETS nooit rechtstreeks aan — altijd via deze
 * functies (zelfde patroon als src/modules/asset-manager/lib/r2-client.js).
 */

const PREFIX = 'mini-apps/';

export function buildAppKey(appId) {
  return `${PREFIX}${appId}.html`;
}

/**
 * Schrijft de volledige HTML-inhoud van een mini-app naar R2.
 *
 * @param {Object} env
 * @param {string} appId
 * @param {string} htmlContent
 * @returns {Promise<{key: string, etag: string, size: number}>}
 */
export async function putAppContent(env, appId, htmlContent) {
  const key = buildAppKey(appId);
  const body = new TextEncoder().encode(htmlContent);
  const obj = await env.R2_ASSETS.put(key, body, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' }
  });
  return { key, etag: obj?.etag ?? '', size: body.byteLength };
}

/**
 * Leest de HTML-inhoud van een mini-app uit R2.
 *
 * NOOIT ongevangen laten falen: een R2-object dat wél bestaat maar
 * beschadigd/onvolledig is (bv. door een afgebroken upload) kan
 * env.R2_ASSETS.get() laten GOOIEN in plaats van gewoon `null`
 * teruggeven (gezien 2026-08, lokale wrangler dev: "R2 error response
 * does not contain the CF-R2-Error header" -> unhandled 500 i.p.v. een
 * nette 404). We behandelen elke fout hier hetzelfde als "niet gevonden"
 * -- de aanroepende route (GET /api/apps/:id/content) verwacht toch al
 * `null` als signaal voor "App-inhoud niet gevonden in opslag." (404),
 * dus dit voorkomt een crash zonder de bestaande foutafhandeling elders
 * te moeten aanpassen.
 *
 * @param {Object} env
 * @param {string} appId
 * @returns {Promise<string|null>} null als het object niet bestaat OF niet leesbaar is
 */
export async function getAppContent(env, appId) {
  let obj;
  try {
    obj = await env.R2_ASSETS.get(buildAppKey(appId));
  } catch (err) {
    console.error(`[mini-apps] R2 get() mislukt voor app ${appId}:`, err.message);
    return null;
  }
  if (!obj) return null;
  try {
    return await obj.text();
  } catch (err) {
    console.error(`[mini-apps] R2 object.text() mislukt voor app ${appId}:`, err.message);
    return null;
  }
}

/**
 * Verwijdert de HTML-inhoud van een mini-app uit R2.
 *
 * @param {Object} env
 * @param {string} appId
 */
export async function deleteAppContent(env, appId) {
  await env.R2_ASSETS.delete(buildAppKey(appId));
}
