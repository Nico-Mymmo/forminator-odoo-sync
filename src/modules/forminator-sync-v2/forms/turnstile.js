/**
 * Koppelingen — Cloudflare Turnstile, de onzichtbare botcontrole op de
 * OM-formulieren.
 *
 * Hoe het loopt: de publieke payload van een formulier draagt de (publieke)
 * SITESLEUTEL van Turnstile mee (`turnstile.site_key`); de plugin zet die op het
 * <form>, mymmo-forms.js haalt bij de eerste klik in het formulier een token op,
 * PHP stuurt dat mee als `turnstile: {token, error}` in de inzending, en HIER
 * wordt het bij Cloudflare nagekeken met het geheim. Eén geheim, één plek waar
 * beslist wordt -- de plugin weet niets van het beleid.
 *
 * Waarom Turnstile en geen reCAPTCHA: geen Google-cookies op de site, gratis,
 * en het hoort bij dezelfde Cloudflare-account als de Worker.
 *
 * FORMS_TURNSTILE_MODE (wrangler.jsonc):
 *   ""/"off"  niets: geen sitesleutel in de payload, niets nagekeken
 *   "log"     widget actief, token nagekeken, uitkomst gelogd en als
 *             meta_bot_check bij de inzending bewaard -- maar NOOIT geweigerd
 *   "on"      weigeren als het token ontbreekt of ongeldig is
 *
 * Bewust NIET geweigerd, ook niet in "on":
 *   - een inzending ZONDER turnstile-veld: een plugin van voor 1.21.0, of een
 *     pagina die nog met een payload zonder sitesleutel gerenderd werd. Een bot
 *     kan dat niet kiezen -- PHP beslist of het veld meegaat, niet de POST.
 *   - Cloudflare onbereikbaar, of een fout in ONZE instelling (verkeerd geheim):
 *     daarvoor mag geen bezoeker geweigerd worden. De andere lagen (honeypot,
 *     invultijd, nonce, rate limit) blijven gewoon staan.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;
const LOG_PREFIX = '[forms-turnstile]';

// Fouten die over ONS gaan, niet over de bezoeker.
const CONFIG_FOUTEN = new Set(['missing-input-secret', 'invalid-input-secret', 'internal-error']);

let gewaarschuwd = false;

function siteKey(env) {
  const sleutel = String(env?.FORMS_TURNSTILE_SITE_KEY || '').trim();
  return /^[0-9A-Za-z_-]{10,100}$/.test(sleutel) ? sleutel : '';
}

/** 'off' | 'log' | 'on'. Half ingesteld (geen sleutel of geen geheim) = uit. */
export function turnstileMode(env) {
  const modus = String(env?.FORMS_TURNSTILE_MODE || '').trim().toLowerCase();
  if (modus !== 'log' && modus !== 'on') return 'off';

  if (!siteKey(env) || !String(env?.FORMS_TURNSTILE_SECRET || '').trim()) {
    if (!gewaarschuwd) {
      gewaarschuwd = true;
      console.error(`${LOG_PREFIX} FORMS_TURNSTILE_MODE="${modus}" maar FORMS_TURNSTILE_SITE_KEY of het secret FORMS_TURNSTILE_SECRET ontbreekt -- Turnstile staat UIT`);
    }
    return 'off';
  }
  return modus;
}

/** Wat er in de publieke payload komt, of null. De sitesleutel is publiek. */
export function publicTurnstileConfig(env) {
  return turnstileMode(env) === 'off' ? null : { site_key: siteKey(env) };
}

/**
 * Het token uit een inzending nakijken.
 *
 * @param {object} env
 * @param {unknown} veld  `body.turnstile` zoals de plugin het stuurde
 * @returns {Promise<{uitkomst: string, blokkeer: boolean, codes: string[], hostname: string}>}
 *   uitkomst: 'uit' | 'niet_meegestuurd' | 'ok' | 'geen_token' | 'ongeldig' | 'niet_gecontroleerd'
 */
export async function checkTurnstile(env, veld, { fetchImpl = fetch } = {}) {
  const modus = turnstileMode(env);
  const uit = (uitkomst, extra = {}) => ({ uitkomst, blokkeer: false, codes: [], hostname: '', ...extra });

  if (modus === 'off') return uit('uit');
  if (!veld || typeof veld !== 'object') return uit('niet_meegestuurd');

  const token = typeof veld.token === 'string' ? veld.token.trim() : '';
  // Wat de browser zelf meldde (script geblokkeerd, widget-foutcode, te traag).
  // Enkel voor de log: het verandert niets aan de beslissing.
  const clientFout = String(veld.error || '').replace(/[^\w-]/g, '').slice(0, 40);

  if (!token) {
    return { uitkomst: 'geen_token', blokkeer: modus === 'on', codes: clientFout ? [`client:${clientFout}`] : [], hostname: '' };
  }
  // Een Turnstile-token is hoogstens 2048 tekens.
  if (token.length > 2048) {
    return { uitkomst: 'ongeldig', blokkeer: modus === 'on', codes: ['te-lang'], hostname: '' };
  }

  let data;
  try {
    const antwoord = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret: String(env.FORMS_TURNSTILE_SECRET).trim(), response: token }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!antwoord.ok) throw new Error(`siteverify ${antwoord.status}`);
    data = await antwoord.json();
  } catch (err) {
    console.warn(`${LOG_PREFIX} nakijken mislukt, inzending doorgelaten: ${err.message}`);
    return uit('niet_gecontroleerd', { codes: ['onbereikbaar'] });
  }

  const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'].map(String) : [];
  const hostname = String(data?.hostname || '');

  if (data?.success === true) return uit('ok', { codes, hostname });

  if (codes.some((c) => CONFIG_FOUTEN.has(c))) {
    console.error(`${LOG_PREFIX} Turnstile weigert ONZE instelling (${codes.join(',')}) -- inzending doorgelaten. Klopt FORMS_TURNSTILE_SECRET?`);
    return uit('niet_gecontroleerd', { codes, hostname });
  }

  // timeout-or-duplicate, invalid-input-response, ...: dit token is niet goed.
  return { uitkomst: 'ongeldig', blokkeer: modus === 'on', codes, hostname };
}
