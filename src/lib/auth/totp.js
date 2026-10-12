/**
 * TOTP (RFC 6238) — de codes van een authenticator-app.
 *
 * HMAC-SHA1, 6 cijfers, 30 seconden: de standaard die Google Authenticator,
 * Microsoft Authenticator, 1Password en Bitwarden allemaal zonder vragen
 * aannemen. Een andere keuze (SHA-256, 8 cijfers) staat wel in de standaard,
 * maar meerdere apps negeren die parameters stil en tonen dan codes die nooit
 * kloppen.
 *
 * @module lib/auth/totp
 */

import { timingSafeEqual } from './crypto.js';

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

/**
 * Hoeveel stappen ernaast nog aanvaard worden (±30 s). Een telefoon waarvan
 * de klok een halve minuut afwijkt, mag niemand buitensluiten.
 */
export const TOTP_WINDOW = 1;

/** Naam in de authenticator-app. */
export const TOTP_ISSUER = 'mymmo Operations Manager';

/** @param {Uint8Array} bytes @returns {string} */
export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALFABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABET[(value << (5 - bits)) & 31];
  return out;
}

/** @param {string} str @returns {Uint8Array} */
export function base32Decode(str) {
  const schoon = String(str || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of schoon) {
    const idx = ALFABET.indexOf(ch);
    if (idx < 0) throw new Error('Ongeldige base32-tekst');
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Een nieuw geheim van 160 bits (de lengte die RFC 4226 aanbeveelt). */
export function generateTotpSecret() {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return base32Encode(b);
}

async function hmacSleutel(secret) {
  return crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
}

async function codeVoorStap(sleutel, stap) {
  const msg = new Uint8Array(8);
  let c = stap;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', sleutel, msg));
  const off = mac[mac.length - 1] & 0x0f;
  const getal = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(getal % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * De code voor een bepaald moment (enkel nodig om te controleren; de
 * gebruiker leest ze af van zijn app).
 *
 * @param {string} secret base32 @param {number} [now=Date.now()]
 * @returns {Promise<string>}
 */
export async function totpCode(secret, now = Date.now()) {
  const sleutel = await hmacSleutel(secret);
  return codeVoorStap(sleutel, Math.floor(now / 1000 / TOTP_PERIOD));
}

/**
 * Klopt deze code? Geeft de STAP terug waarop ze klopte, anders null.
 *
 * `lastStep` is de stap van de laatst aanvaarde code van deze gebruiker:
 * een code van die stap of vroeger wordt geweigerd, ook als ze klopt. Zo kan
 * een code die iemand over je schouder zag, of die in een proxy bleef
 * hangen, geen tweede keer gebruikt worden.
 *
 * @param {string} secret base32
 * @param {string} code
 * @param {{ lastStep?: number|null, now?: number }} [opts]
 * @returns {Promise<number|null>}
 */
export async function verifyTotp(secret, code, { lastStep = null, now = Date.now() } = {}) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const sleutel = await hmacSleutel(secret);
  const huidig = Math.floor(now / 1000 / TOTP_PERIOD);
  const laatste = lastStep == null ? null : Number(lastStep);
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    const stap = huidig + d;
    if (laatste != null && stap <= laatste) continue;
    if (timingSafeEqual(await codeVoorStap(sleutel, stap), c)) return stap;
  }
  return null;
}

/**
 * De link die in de QR-code staat.
 *
 * @param {string} secret base32 @param {string} account (het e-mailadres)
 * @returns {string}
 */
export function otpauthUrl(secret, account) {
  const label = encodeURIComponent(TOTP_ISSUER) + ':' + encodeURIComponent(account);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}`
    + `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}
