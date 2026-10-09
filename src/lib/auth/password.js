/**
 * Wachtwoorden.
 *
 * GEBRUIKERSWACHTWOORDEN gaan door hashUserPassword() / verifyUserPassword():
 * PBKDF2-SHA256 met een eigen zout per wachtwoord.
 *
 * Tot 2026-10-09 stond elk wachtwoord als één ongezoute SHA-256 in
 * users.password_hash (met een `$2a$`-voorvoegsel dat op bcrypt leek, maar het
 * niet was). Twee gebruikers met hetzelfde wachtwoord hadden dezelfde hash, en
 * een gelekte tabel was met een gewone woordenlijst in minuten te kraken.
 * Zo'n oude hash wordt nog EEN keer aanvaard en bij die login meteen
 * herschreven (`needsRehash`), zodat niemand daarvoor iets hoeft te doen.
 *
 * hashPassword() / verifyPassword() blijven bestaan voor de Claude-integratie,
 * die er willekeurige tokens en client-secrets mee hasht en ze daarna OPZOEKT
 * op die hash -- daarvoor moet de hash deterministisch zijn, en met 256 bits
 * toeval is een zout daar ook niet nodig. Gebruik ze NOOIT voor iets dat een
 * mens bedacht heeft.
 */

import { base64UrlDecode, base64UrlEncode, timingSafeEqual } from './crypto.js';

/**
 * Het hoogste aantal iteraties dat Web Crypto in een Worker toelaat; daarboven
 * gooit importKey/deriveBits een fout.
 */
const PBKDF2_ITERATIES = 100000;
const PBKDF2_PREFIX = 'pbkdf2-sha256';

/** Minimale lengte van een NIEUW wachtwoord. Bestaande wachtwoorden blijven geldig. */
export const PASSWORD_MIN_LENGTH = 12;

async function pbkdf2(password, salt, iteraties) {
  const materiaal = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteraties },
    materiaal,
    256
  );
  return new Uint8Array(bits);
}

/**
 * @param {string} password
 * @returns {Promise<string>} `pbkdf2-sha256$<iteraties>$<zout>$<hash>`
 */
export async function hashUserPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIES);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIES}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

/** Een hash waartegen gecontroleerd wordt als het e-mailadres niet bestaat. */
const DUMMY_SALT = new Uint8Array(16);

/**
 * Controleer een gebruikerswachtwoord.
 *
 * Zonder `stored` (onbekend e-mailadres) wordt toch een volledige PBKDF2
 * gerekend: anders verraadt de korte antwoordtijd welke adressen een account
 * hebben.
 *
 * @param {string} password
 * @param {string|null|undefined} stored
 * @returns {Promise<{ valid: boolean, needsRehash: boolean }>}
 */
export async function verifyUserPassword(password, stored) {
  const waarde = String(stored || '');

  if (waarde.startsWith(PBKDF2_PREFIX + '$')) {
    const [, iterTekst, saltTekst, hashTekst] = waarde.split('$');
    const iteraties = parseInt(iterTekst, 10);
    if (!iteraties || !saltTekst || !hashTekst) return { valid: false, needsRehash: false };
    const hash = await pbkdf2(password, base64UrlDecode(saltTekst), iteraties);
    const valid = timingSafeEqual(base64UrlEncode(hash), hashTekst);
    return { valid, needsRehash: valid && iteraties < PBKDF2_ITERATIES };
  }

  if (waarde.startsWith('$2a$')) {
    const valid = timingSafeEqual(await hashPassword(password), waarde);
    return { valid, needsRehash: valid };
  }

  await pbkdf2(password, DUMMY_SALT, PBKDF2_ITERATIES);
  return { valid: false, needsRehash: false };
}

/**
 * Mag dit een nieuw wachtwoord zijn? Geeft een foutmelding of null.
 *
 * Bewust GEEN eisen als "een hoofdletter en een cijfer": die maken
 * wachtwoorden voorspelbaarder (Welkom123!), niet sterker. Lengte doet het
 * werk, en de tweede factor de rest.
 *
 * @param {string} password
 * @param {{ email?: string }} [ctx]
 * @returns {string|null}
 */
export function checkNewPassword(password, { email } = {}) {
  const pw = String(password || '');
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return `Een wachtwoord moet minstens ${PASSWORD_MIN_LENGTH} tekens lang zijn.`;
  }
  if (pw.length > 256) return 'Een wachtwoord mag hoogstens 256 tekens lang zijn.';
  if (/^(.)\1+$/.test(pw)) return 'Een wachtwoord mag niet uit één herhaald teken bestaan.';
  const lokaal = String(email || '').split('@')[0].toLowerCase();
  if (lokaal.length >= 3 && pw.toLowerCase().includes(lokaal)) {
    return 'Een wachtwoord mag je e-mailadres niet bevatten.';
  }
  return null;
}

/**
 * Deterministische SHA-256-hash. ENKEL voor willekeurige tokens (zie boven),
 * nooit voor gebruikerswachtwoorden.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `$2a$${hashHex.slice(0, 2)}$${hashHex.slice(2)}`;
}

/**
 * Tegenhanger van hashPassword(). ENKEL voor willekeurige tokens.
 *
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  return timingSafeEqual(await hashPassword(password), hash);
}

/**
 * @deprecated Gebruik checkNewPassword(). Blijft voor oudere aanroepers.
 */
export function validatePasswordStrength(password) {
  const fout = checkNewPassword(password);
  return { valid: !fout, errors: fout ? [fout] : [] };
}

/**
 * Een willekeurig wachtwoord, zonder tekens die je verwart bij het overtypen
 * (0/O, 1/l/I).
 *
 * @param {number} [length=16]
 * @returns {string}
 */
export function generateRandomPassword(length = 16) {
  const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  const limiet = 256 - (256 % charset.length);
  let password = '';
  while (password.length < length) {
    const array = new Uint8Array(length * 2);
    crypto.getRandomValues(array);
    for (const b of array) {
      if (b < limiet && password.length < length) password += charset[b % charset.length];
    }
  }
  return password;
}
