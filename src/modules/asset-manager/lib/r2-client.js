/**
 * Asset Manager — R2 Client
 *
 * Dunne abstractielaag om env.R2_ASSETS.
 * Alle R2-aanroepen gaan via deze module — routes.js raakt R2 nooit direct aan.
 *
 * Log prefix: [asset-manager]
 * Binding: env.R2_ASSETS — nooit env.ASSETS
 */

const LOG_PREFIX = '[asset-manager]';

/**
 * Bouwt een consistent fout-object voor R2-fouten.
 *
 * @param {string} operation
 * @param {Error}  err
 * @returns {Error}
 */
function r2Error(operation, err) {
  const message = `${LOG_PREFIX} R2 ${operation} failed: ${err?.message || err}`;
  console.error(message);
  const out = new Error(message);
  out.r2Operation = operation;
  return out;
}

/**
 * Lijst R2 objecten op met optionele prefix, cursor en limiet.
 *
 * @param {Object} env
 * @param {Object} options
 * @param {string} [options.prefix]
 * @param {string} [options.cursor]
 * @param {number} [options.limit=50]
 * @returns {Promise<{ objects: Array, truncated: boolean, cursor: string|null }>}
 */
export async function listObjects(env, { prefix, cursor, limit = 50 } = {}) {
  const opts = { limit: Math.min(Number(limit) || 50, 1000) };
  if (prefix) opts.prefix = prefix;
  if (cursor) opts.cursor = cursor;

  try {
    const result = await env.R2_ASSETS.list(opts);
    const objects = result.objects.map(obj => ({
      key:           obj.key,
      size:          obj.size,
      uploaded:      obj.uploaded?.toISOString?.() ?? null,
      etag:          obj.etag,
      contentType:   obj.httpMetadata?.contentType ?? null,
      customMetadata: obj.customMetadata ?? {},
    }));
    return {
      objects,
      truncated: result.truncated,
      cursor:    result.truncated ? result.cursor : null,
    };
  } catch (err) {
    throw r2Error('list', err);
  }
}

/**
 * Plaatst een object in R2.
 *
 * @param {Object} env
 * @param {string} key
 * @param {ReadableStream|ArrayBuffer|string} body
 * @param {Object} options
 * @param {string} [options.contentType]
 * @param {Object} [options.customMetadata]
 * @returns {Promise<{ key: string, etag: string, size: number }>}
 */
export async function putObject(env, key, body, { contentType, customMetadata } = {}) {
  const putOptions = {};
  if (contentType || customMetadata) {
    putOptions.httpMetadata  = contentType ? { contentType } : undefined;
    putOptions.customMetadata = customMetadata ?? undefined;
  }

  try {
    const obj = await env.R2_ASSETS.put(key, body, putOptions);
    console.log(`${LOG_PREFIX} PUT ${key} — ${obj?.size ?? '?'} bytes`);
    return {
      key,
      etag: obj?.etag ?? '',
      size: obj?.size ?? 0,
    };
  } catch (err) {
    throw r2Error('put', err);
  }
}

/**
 * Haalt een object op uit R2.
 *
 * @param {Object} env
 * @param {string} key
 * @returns {Promise<R2ObjectBody|null>}
 */
export async function getObject(env, key) {
  try {
    return await env.R2_ASSETS.get(key);
  } catch (err) {
    throw r2Error('get', err);
  }
}

/**
 * Verwijdert een object uit R2.
 *
 * @param {Object} env
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteObject(env, key) {
  try {
    await env.R2_ASSETS.delete(key);
    console.log(`${LOG_PREFIX} DELETE ${key}`);
  } catch (err) {
    throw r2Error('delete', err);
  }
}

/**
 * Haalt metadata op van een R2 object zonder de body te laden.
 *
 * @param {Object} env
 * @param {string} key
 * @returns {Promise<R2Object|null>}
 */
export async function headObject(env, key) {
  try {
    return await env.R2_ASSETS.head(key);
  } catch (err) {
    throw r2Error('head', err);
  }
}

/**
 * Kopieert een R2 object naar een nieuwe key.
 * R2 heeft geen native copy — haalt op en schrijft opnieuw.
 *
 * @param {Object} env
 * @param {string} sourceKey
 * @param {string} destKey
 * @returns {Promise<{ key: string }>}
 */
export async function copyObject(env, sourceKey, destKey) {
  let source;
  try {
    source = await env.R2_ASSETS.get(sourceKey);
  } catch (err) {
    throw r2Error('copy (get source)', err);
  }
  if (!source) {
    const msg = `${LOG_PREFIX} R2 copy failed: source key not found: ${sourceKey}`;
    console.error(msg);
    throw new Error(msg);
  }

  try {
    const body = await source.arrayBuffer();
    await env.R2_ASSETS.put(destKey, body, {
      httpMetadata:   source.httpMetadata,
      customMetadata: source.customMetadata,
    });
    console.log(`${LOG_PREFIX} COPY ${sourceKey} → ${destKey}`);
    return { key: destKey };
  } catch (err) {
    throw r2Error('copy (put dest)', err);
  }
}
