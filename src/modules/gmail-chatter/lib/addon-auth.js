/**
 * Gmail-add-on — wie klopt er aan?
 *
 * De add-on draait in Gmail, niet in de OM, en heeft dus geen sessiecookie.
 * In plaats van een gedeeld geheim in het script te zetten (dat je nooit meer
 * kan wisselen zonder de add-on opnieuw uit te rollen, en dat iedereen met
 * scriptrechten kan uitlezen) stuurt de add-on een GOOGLE ID-TOKEN mee:
 *
 *   ScriptApp.getIdentityToken()  →  Authorization: Bearer <jwt>
 *
 * Dat token is door Google ondertekend, staat op naam van de ingelogde
 * medewerker en verloopt vanzelf. Wij verifiëren het hier tegen Google's
 * publieke sleutels. Er valt dus niets te lekken: een gestolen token is een uur
 * geldig en zegt alleen wie iemand is.
 *
 * WAT ER GECONTROLEERD WORDT, EN WAAROM ELK ERVAN:
 *  - handtekening  — anders kan iedereen een token verzinnen
 *  - `iss`         — moet van Google komen
 *  - `aud`         — moet ONS script zijn. Zonder deze controle is elk
 *                    Google-token van eender welke app geldig, en dat is het
 *                    klassieke gat in ID-tokenverificatie.
 *  - `exp`/`iat`   — verlopen tokens weigeren
 *  - `email_verified`
 *  - het adres moet een ACTIEVE OM-gebruiker zijn — Google zegt wie je bent,
 *    niet of je hier iets mag.
 */

import { getSupabaseClient } from '../../../lib/database.js';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GELDIGE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Google wisselt zijn sleutels traag; een uur cachen is ruim veilig. */
let jwksCache = { sleutels: null, tot: 0 };

function b64urlNaarBytes(s) {
  const norm = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
}

function b64urlNaarJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlNaarBytes(s)));
}

async function haalSleutels() {
  const nu = Date.now();
  if (jwksCache.sleutels && jwksCache.tot > nu) return jwksCache.sleutels;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Google-sleutels ophalen mislukt (${res.status})`);
  const data = await res.json();
  jwksCache = { sleutels: data.keys || [], tot: nu + 3600_000 };
  return jwksCache.sleutels;
}

/**
 * Een Google ID-token verifiëren en het e-mailadres eruit halen.
 *
 * @returns {Promise<{email: string, hd: string|null}>}
 * @throws bij elk probleem — de aanroeper vertaalt dat naar een 401
 */
export async function verifieerIdToken(env, token) {
  const verwachteAud = String(env?.GMAIL_ADDON_CLIENT_ID || '').trim();
  if (!verwachteAud) throw new Error('GMAIL_ADDON_CLIENT_ID is niet ingesteld');

  const delen = String(token || '').split('.');
  if (delen.length !== 3) throw new Error('Geen geldig token');

  const [kop, lading, handtekening] = delen;
  const header = b64urlNaarJson(kop);
  if (header.alg !== 'RS256') throw new Error(`Onverwacht algoritme: ${header.alg}`);

  const sleutels = await haalSleutels();
  const jwk = sleutels.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Onbekende sleutel-id');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const geldig = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlNaarBytes(handtekening),
    new TextEncoder().encode(`${kop}.${lading}`)
  );
  if (!geldig) throw new Error('Handtekening klopt niet');

  const claims = b64urlNaarJson(lading);
  const nu = Math.floor(Date.now() / 1000);

  if (!GELDIGE_ISSUERS.includes(claims.iss)) throw new Error('Onverwachte issuer');
  if (claims.aud !== verwachteAud) throw new Error('Token is niet voor deze toepassing');
  if (!claims.exp || claims.exp < nu - 60) throw new Error('Token is verlopen');
  if (claims.iat && claims.iat > nu + 300) throw new Error('Token komt uit de toekomst');
  if (!claims.email) throw new Error('Token bevat geen e-mailadres');
  if (claims.email_verified === false) throw new Error('E-mailadres niet geverifieerd');

  return { email: String(claims.email).toLowerCase(), hd: claims.hd || null };
}

/**
 * Van een geverifieerd adres naar een OM-gebruiker.
 *
 * Google zegt WIE iemand is; of die persoon hier iets mag, staat in onze eigen
 * gebruikerstabel. Een oud-collega met een nog werkend Google-account komt er
 * dus niet in.
 */
export async function haalOmGebruiker(env, email) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, is_active')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error(`gebruiker opzoeken mislukt: ${error.message}`);
  if (!data || data.is_active === false) return null;
  return data;
}

/**
 * De volledige poort: token uit de header halen, verifiëren, gebruiker opzoeken.
 *
 * @returns {Promise<{user: Object}|{fout: Response}>}
 */
export async function authenticeerAddon(env, request) {
  const kop = request.headers.get('Authorization') || '';
  const token = kop.startsWith('Bearer ') ? kop.slice(7).trim() : '';
  if (!token) {
    return { fout: new Response(JSON.stringify({ success: false, error: 'Geen token' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    }) };
  }

  try {
    const { email } = await verifieerIdToken(env, token);
    const user = await haalOmGebruiker(env, email);
    if (!user) {
      return { fout: new Response(JSON.stringify({ success: false, error: 'Geen actieve OM-gebruiker' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      }) };
    }
    return { user };
  } catch (err) {
    return { fout: new Response(JSON.stringify({ success: false, error: String(err.message || err) }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    }) };
  }
}
