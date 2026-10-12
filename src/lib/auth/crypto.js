/**
 * Cryptobouwstenen voor het inloggen: willekeurige tokens, hashes,
 * vergelijken in vaste tijd, en versleutelen van de 2FA-geheimen.
 *
 * Puur Web Crypto (Workers), geen afhankelijkheden, geen env behalve
 * AUTH_SECRET_KEY voor de versleuteling.
 *
 * @module lib/auth/crypto
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array|ArrayBuffer} bytes @returns {string} */
export function base64UrlEncode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} str @returns {Uint8Array} */
export function base64UrlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Een willekeurig token (standaard 256 bits), base64url.
 * @param {number} [bytes=32] @returns {string}
 */
export function randomToken(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return base64UrlEncode(b);
}

/** @param {string} text @returns {Promise<string>} 64 hex-tekens */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(text)));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Twee teksten vergelijken zonder dat de duur verraadt waar ze verschillen.
 * @param {string} a @param {string} b @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a ?? ''));
  const y = enc.encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

/**
 * Fout als AUTH_SECRET_KEY ontbreekt. Bewust een eigen soort: de loginroute
 * zet ze om naar een duidelijke 503 in plaats van een 500 zonder uitleg.
 */
export class AuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = 'AUTH_NOT_CONFIGURED';
  }
}

/** @param {object} env @returns {boolean} */
export function hasAuthSecret(env) {
  return typeof env?.AUTH_SECRET_KEY === 'string' && env.AUTH_SECRET_KEY.length >= 32;
}

const sleutelCache = new Map();

/**
 * De AES-sleutel voor de 2FA-geheimen, afgeleid (HKDF) uit AUTH_SECRET_KEY.
 *
 * Een EIGEN secret en geen afleiding van de Supabase-sleutel: wie de
 * database (of een back-up ervan) in handen krijgt, mag de 2FA-geheimen niet
 * kunnen lezen, en het roteren van de Supabase-sleutel mag niet stil ieders
 * authenticator onbruikbaar maken.
 */
async function aesSleutel(env) {
  if (!hasAuthSecret(env)) {
    throw new AuthConfigError('AUTH_SECRET_KEY ontbreekt of is korter dan 32 tekens.');
  }
  const raw = env.AUTH_SECRET_KEY;
  if (sleutelCache.has(raw)) return sleutelCache.get(raw);
  const materiaal = await crypto.subtle.importKey('raw', enc.encode(raw), 'HKDF', false, ['deriveKey']);
  const sleutel = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('om-auth'), info: enc.encode('mfa-secret-v1') },
    materiaal,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  sleutelCache.set(raw, sleutel);
  return sleutel;
}

/**
 * Versleutel een geheim, gebonden aan een context (de gebruikers-id): een
 * versleuteld geheim dat naar de rij van een ander gekopieerd wordt, gaat
 * daar niet open.
 *
 * @param {object} env @param {string} plaintext @param {string} context
 * @returns {Promise<string>} `v1.<iv>.<ciphertext>`
 */
export async function encryptSecret(env, plaintext, context) {
  const sleutel = await aesSleutel(env);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(String(context)) },
    sleutel,
    enc.encode(String(plaintext))
  );
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(ct)}`;
}

/**
 * @param {object} env @param {string} stored @param {string} context
 * @returns {Promise<string>}
 */
export async function decryptSecret(env, stored, context) {
  const delen = String(stored || '').split('.');
  if (delen.length !== 3 || delen[0] !== 'v1') {
    throw new Error('Onbekende vorm van een versleuteld geheim');
  }
  const sleutel = await aesSleutel(env);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(delen[1]), additionalData: enc.encode(String(context)) },
    sleutel,
    base64UrlDecode(delen[2])
  );
  return dec.decode(pt);
}
