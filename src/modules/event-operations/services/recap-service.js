/**
 * Event Operations — Recap Service
 *
 * Handles:
 *  - Video URL parsing (YouTube / Vimeo)
 *  - Server-side thumbnail fetching & R2 storage
 *  - Recap readiness computation
 *
 * Design principles:
 *  - No binary data sent to Odoo (URLs only)
 *  - R2 is single source of truth for assets
 *  - BASE_ASSET_URL configurable via env.BASE_ASSET_URL
 */

import { putObject } from '../../asset-manager/lib/r2-client.js';
import { BASE_ASSET_URL } from '../constants.js';

const LOG_PREFIX = '[event-operations/recap]';

// ─── Asset path helpers ───────────────────────────────────────────────────────

/**
 * R2 key for a webinar thumbnail.
 * @param {number|string} webinarId
 * @returns {string}  e.g. "webinars/42/thumbnail.jpg"
 */
export function thumbnailKey(webinarId) {
  return `webinars/${webinarId}/thumbnail.jpg`;
}

/**
 * Public URL for a stored R2 asset.
 * Uses env.BASE_ASSET_URL if set, else falls back to the constant.
 *
 * @param {Object} env
 * @param {string} key  R2 key (no leading slash)
 * @returns {string}
 */
export function getPublicAssetUrl(env, key) {
  const base = (env.BASE_ASSET_URL || BASE_ASSET_URL).replace(/\/$/, '');
  return `${base}/assets/${key}`;
}

// ─── Video URL parsing ────────────────────────────────────────────────────────

/**
 * Parse a YouTube or Vimeo URL into a platform + id tuple.
 *
 * @param {string} url
 * @returns {{ platform: 'youtube'|'vimeo', id: string } | null}
 */
export function parseVideoUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // YouTube
  const ytPatterns = [
    /(?:youtube\.com\/watch[?&]v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of ytPatterns) {
    const m = trimmed.match(pattern);
    if (m) return { platform: 'youtube', id: m[1] };
  }

  // Vimeo
  const vimeoPatterns = [
    /vimeo\.com\/(\d+)(?:[/?#]|$)/,
    /vimeo\.com\/video\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/
  ];
  for (const pattern of vimeoPatterns) {
    const m = trimmed.match(pattern);
    if (m) return { platform: 'vimeo', id: m[1] };
  }

  return null;
}

// ─── Thumbnail fetching ───────────────────────────────────────────────────────

/**
 * Fetch thumbnail binary for a parsed video reference.
 *
 * YouTube: requests maxresdefault (1280×720); falls back to hqdefault.
 * Vimeo:   uses the oEmbed API to resolve the largest available thumbnail.
 *
 * @param {{ platform: string, id: string }} parsed
 * @returns {Promise<{ buffer: ArrayBuffer, mimeType: string }>}
 */
export async function fetchVideoThumbnailBuffer(parsed) {
  if (parsed.platform === 'youtube') {
    return _fetchYouTubeThumbnail(parsed.id);
  }
  if (parsed.platform === 'vimeo') {
    return _fetchVimeoThumbnail(parsed.id);
  }
  throw new Error(`${LOG_PREFIX} Unsupported platform: ${parsed.platform}`);
}

async function _fetchYouTubeThumbnail(videoId) {
  // Try highest quality first; YouTube returns a 120x90 grey placeholder for
  // non-existent maxresdefault — detected by the tiny content-length.
  const candidates = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  ];

  for (const thumbUrl of candidates) {
    const res = await fetch(thumbUrl);
    if (!res.ok) continue;
    const cl = Number(res.headers.get('content-length') || 0);
    // Placeholder images are ~1176 bytes
    if (cl > 0 && cl <= 1200) continue;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength <= 1200) continue; // extra guard after read
    return { buffer, mimeType: 'image/jpeg' };
  }

  throw new Error(`${LOG_PREFIX} Could not fetch a valid YouTube thumbnail for ${videoId}`);
}

async function _fetchVimeoThumbnail(videoId) {
  const oembedUrl = `https://vimeo.com/api/v2/video/${videoId}.json`;
  const oembedRes = await fetch(oembedUrl, {
    headers: { Accept: 'application/json' }
  });
  if (!oembedRes.ok) {
    throw new Error(`${LOG_PREFIX} Vimeo oEmbed error ${oembedRes.status} for ${videoId}`);
  }

  const data = await oembedRes.json();
  const videoData = Array.isArray(data) ? data[0] : data;
  const thumbUrl = videoData?.thumbnail_large
    || videoData?.thumbnail_medium
    || videoData?.thumbnail_small;

  if (!thumbUrl) {
    throw new Error(`${LOG_PREFIX} No thumbnail URL in Vimeo response for ${videoId}`);
  }

  const res = await fetch(thumbUrl);
  if (!res.ok) {
    throw new Error(`${LOG_PREFIX} Vimeo thumbnail fetch failed: ${res.status} ${thumbUrl}`);
  }

  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { buffer, mimeType };
}

// ─── R2 storage ───────────────────────────────────────────────────────────────

/**
 * Store a thumbnail buffer in R2 and return its key + public URL.
 *
 * The key is always "webinars/{webinarId}/thumbnail.jpg" so the URL stays
 * stable even when the thumbnail is replaced.
 *
 * @param {Object} env
 * @param {number|string} webinarId
 * @param {ArrayBuffer} buffer
 * @param {string} mimeType
 * @param {string} [source='auto']  'auto' | 'upload'
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function storeThumbnailInR2(env, webinarId, buffer, mimeType, source = 'auto') {
  const key = thumbnailKey(webinarId);
  await putObject(env, key, buffer, {
    contentType: mimeType,
    customMetadata: {
      webinarId: String(webinarId),
      source,
      storedAt: new Date().toISOString()
    }
  });
  const url = getPublicAssetUrl(env, key);
  console.log(`${LOG_PREFIX} Stored thumbnail → ${key} (${buffer.byteLength} bytes)`);
  return { key, url };
}

// ─── Recap readiness ──────────────────────────────────────────────────────────

/**
 * Compute whether a webinar is ready for recap sending.
 *
 * Ready = all four conditions met:
 *  1. video_url present
 *  2. thumbnail_url present
 *  3. followup_html present (non-empty)
 *  4. event date is in the past
 *
 * @param {Object} webinar  Odoo webinar record (recap fields included)
 * @returns {{ ready: boolean, reasons: string[] }}
 */
export function computeRecapReady(webinar) {
  const reasons = [];

  if (!webinar.x_studio_vimeo_url) {
    reasons.push('video URL ontbreekt');
  }
  if (!webinar.x_studio_vimeo_thumbnail_url) {
    reasons.push('thumbnail ontbreekt');
  }
  if (!webinar.x_studio_followup_html || webinar.x_studio_followup_html.trim() === '') {
    reasons.push('recap HTML ontbreekt');
  }

  const eventDateMs = webinar.x_studio_event_datetime
    ? Date.parse(webinar.x_studio_event_datetime)
    : null;
  if (!eventDateMs || eventDateMs >= Date.now()) {
    reasons.push('webinar heeft nog niet plaatsgevonden');
  }

  return { ready: reasons.length === 0, reasons };
}
