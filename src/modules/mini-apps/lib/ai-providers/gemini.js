/**
 * Mini-Apps — AI-provider: Gemini (Google AI Studio / Generative Language API)
 *
 * Eén functie (`generate`) die een prompt (+ optionele system-instructie) naar
 * de Gemini API stuurt en het antwoord + tokencounts teruggeeft, in een vorm
 * die lib/ai.js provider-onafhankelijk kan verwerken (zie de provider-
 * registry daar). Vandaag draait dit op de GRATIS laag van de Gemini API
 * (aparte, token-gebaseerde facturatie los van het Google Workspace-
 * abonnement -- geen "Gemini for Workspace"-koppeling) -- bewust een losse
 * module per provider, zodat een latere overstap naar Claude/een ander model
 * enkel een nieuw bestand hier + een config-wijziging is, geen herschrijving
 * van lib/ai.js of de mini-apps-routes/-shim.
 *
 * BELANGRIJK (gratis laag): Google's voorwaarden laten toe dat prompts/
 * antwoorden op de gratis laag gebruikt worden om hun modellen te verbeteren,
 * en de rate-limits liggen op een paar tientallen requests/minuut (niet enkel
 * per dag) -- zie de daglimiet per app in lib/ai.js, die is los daarvan en
 * dekt dat GEEN vervanging is voor Google's eigen minuut-limiet: een 429 van
 * Google zelf (buiten onze eigen daglimiet om) is dus ook mogelijk en wordt
 * hieronder gewoon doorgegeven als een normale fout.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// gemini-flash-lite-latest (Google-alias, wijst nu naar Gemini 3.1 Flash-Lite)
// i.p.v. gemini-flash-latest (3.5 Flash): veel ruimere gratis-laag-quotum
// (honderden requests/dag i.p.v. enkele tientallen) voor licht lagere
// kwaliteit -- past beter bij de eenvoudige, hoogfrequente taken (samenvatten,
// classificeren) waarvoor mini-apps dit gebruiken. Zelfde generateContent-
// REST-endpoint, geen codewijziging verder nodig om te wisselen.
export const DEFAULT_MODEL = 'gemini-flash-lite-latest';

/**
 * @param {Object} params
 * @param {Object} params.env               Worker env (GEMINI_API_KEY, GEMINI_MODEL)
 * @param {string} [params.model]            Overschrijft env.GEMINI_MODEL / DEFAULT_MODEL
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {number} [params.maxOutputTokens]
 * @returns {Promise<{ text: string, tokensIn: number|null, tokensOut: number|null, model: string }>}
 */
export async function generate({ env, model, prompt, system, maxOutputTokens }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('AI-functionaliteit is nog niet geconfigureerd (GEMINI_API_KEY ontbreekt).');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const resolvedModel = model || env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${API_BASE}/${encodeURIComponent(resolvedModel)}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxOutputTokens }
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      // Key als header (X-goog-api-key), niet als query-param -- komt zo
      // nooit in een URL/request-log terecht (bv. Cloudflare-logging).
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify(body)
    });
  } catch (err) {
    const wrapped = new Error(`Gemini API onbereikbaar: ${err.message}`);
    wrapped.code = 'AI_PROVIDER_UNREACHABLE';
    throw wrapped;
  }

  if (!resp.ok) {
    let detail = '';
    try {
      const errJson = await resp.json();
      detail = errJson?.error?.message || '';
    } catch (_err) { /* geen JSON-body -- negeren */ }
    const err = new Error(
      `Gemini API-fout (${resp.status})${detail ? `: ${detail}` : ''}` +
      (resp.status === 429 ? ' -- waarschijnlijk de rate-limit van de gratis laag, probeer straks opnieuw.' : '')
    );
    err.code = resp.status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
    throw err;
  }

  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map(p => p.text || '').join('');

  if (!text) {
    // bv. geblokkeerd door safety-filters (candidate.finishReason === 'SAFETY')
    const err = new Error(
      `Gemini gaf geen bruikbaar antwoord terug${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`
    );
    err.code = 'AI_EMPTY_RESPONSE';
    throw err;
  }

  return {
    text,
    tokensIn: data?.usageMetadata?.promptTokenCount ?? null,
    tokensOut: data?.usageMetadata?.candidatesTokenCount ?? null,
    model: resolvedModel
  };
}
