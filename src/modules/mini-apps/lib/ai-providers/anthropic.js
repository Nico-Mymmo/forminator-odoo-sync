/**
 * Mini-Apps — AI-provider: Anthropic (Claude Messages API)
 *
 * Zelfde contract als ai-providers/gemini.js: één `generate()` die een prompt
 * (+ optionele system-instructie) naar Claude stuurt en het antwoord +
 * tokencounts teruggeeft in de vorm die lib/ai.js provider-onafhankelijk
 * verwerkt. Draait op het bestaande Claude-abonnement van het team (eigen
 * ANTHROPIC_API_KEY, geen gratis/train-on-data-laag zoals bij Gemini) --
 * zie CLAUDE.md voor de reden waarom de Google Drive-koppeling dicht blijft
 * tot er een veilige AI-koppeling is; dit is die veilige koppeling.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Overschrijfbaar via env.ANTHROPIC_MODEL.
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * @param {Object} params
 * @param {Object} params.env               Worker env (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
 * @param {string} [params.model]            Overschrijft env.ANTHROPIC_MODEL / DEFAULT_MODEL
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {number} [params.maxOutputTokens]
 * @returns {Promise<{ text: string, tokensIn: number|null, tokensOut: number|null, model: string }>}
 */
export async function generate({ env, model, prompt, system, maxOutputTokens }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('AI-functionaliteit is nog niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt).');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const resolvedModel = model || env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const body = {
    model: resolvedModel,
    max_tokens: maxOutputTokens,
    messages: [{ role: 'user', content: prompt }]
  };
  if (system) {
    body.system = system;
  }

  let resp;
  try {
    resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    const wrapped = new Error(`Claude API onbereikbaar: ${err.message}`);
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
      `Claude API-fout (${resp.status})${detail ? `: ${detail}` : ''}` +
      (resp.status === 429 ? ' -- rate-limit van Anthropic zelf, probeer straks opnieuw.' : '')
    );
    err.code = resp.status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
    throw err;
  }

  const data = await resp.json();
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');

  if (!text) {
    const err = new Error(
      `Claude gaf geen bruikbaar antwoord terug${data?.stop_reason ? ` (${data.stop_reason})` : ''}.`
    );
    err.code = 'AI_EMPTY_RESPONSE';
    throw err;
  }

  return {
    text,
    tokensIn: data?.usage?.input_tokens ?? null,
    tokensOut: data?.usage?.output_tokens ?? null,
    model: resolvedModel
  };
}
