/**
 * Het inlogbewijs voor de academy (openvme-cursus).
 *
 * WAAROM. De academy laadde en bewaarde de voortgang van wie je maar opgaf: wie
 * andermans e-mailadres in de link zette (`?email=`), zag diens voortgang en kon
 * ze overschrijven. Nu geeft de OM na een geslaagde inzending van een formulier
 * met "Telt in Webgedrag als: Academy" een ONDERTEKEND bewijs mee, en de academy
 * aanvaardt enkel nog zo'n bewijs. Een e-mailadres alleen opent niets meer.
 *
 * Vorm: `v1.<base64url(JSON {e, x})>.<base64url(HMAC-SHA256)>`, met
 * e = het e-mailadres (kleine letters) en x = vervaltijd in seconden. De
 * handtekening gaat over `v1.<payload>`.
 *
 * TWEE KOPIEEN, bewust: deze en `src/lib/learner-token.server.ts` in de
 * openvme-cursus-repo. Twee repo's kunnen geen code delen. Wijzig je de vorm,
 * wijzig ze allebei -- anders aanvaardt de academy geen enkel bewijs meer en
 * staat iedereen voor een formulier dat niets lijkt te doen.
 *
 * Het geheim staat als Worker-secret `ACADEMY_TOKEN_SECRET` in de OM en met
 * dezelfde waarde als secret in Lovable. Zonder geheim geeft deze functie null
 * en loopt de inzending gewoon door: de bezoeker komt dan zonder bewijs bij de
 * academy, die hem opnieuw om zijn gegevens vraagt.
 */

/** Hoe lang een bewijs geldig blijft. De academy verlengt het bij elk gebruik. */
export const ACADEMY_TOKEN_DAYS = 400;

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

/**
 * @param {object} env
 * @param {string} email
 * @returns {Promise<string|null>}
 */
export async function signAcademyToken(env, email) {
  const secret = env?.ACADEMY_TOKEN_SECRET;
  const adres = String(email || '').trim().toLowerCase();
  if (!secret || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres)) return null;
  const x = Math.floor(Date.now() / 1000) + ACADEMY_TOKEN_DAYS * 86400;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ e: adres, x })));
  const sig = b64url(await hmac(secret, `v1.${payload}`));
  return `v1.${payload}.${sig}`;
}
