/**
 * Mini-Apps — AI-kostprijstabel (schatting, geen officiële facturatie)
 *
 * Eén plek met $/miljoen-tokentarieven per model, gebruikt om bij elke
 * AI-aanroep (lib/ai.js -> logCall) een estimated_cost_usd te berekenen en
 * op te slaan in mini_app_ai_calls. Dit is een SCHATTING op basis van de
 * publieke lijstprijzen (augustus 2026) -- geen batch-korting (-50%, Message
 * Batches API) verrekend, want window.platform.ai.ask() is bewust real-time.
 * Prompt-caching wordt sinds 2026-08 WEL verrekend (zie estimateCostUsd) omdat
 * de providers de cache-tokens apart rapporteren en een cache-hit 10x goedkoper
 * is -- zonder die correctie overschatte het admin-rapport de kosten van een
 * cachende mini-app met bijna een factor 10.
 *
 * Nieuw model toevoegen/prijs wijzigen: enkel deze tabel aanpassen, geen
 * andere code -- lib/ai.js en de admin-rapportage lezen alles hieruit.
 */

// Tarieven in USD per 1.000.000 tokens (input/output apart).
const PRICING_PER_MILLION_TOKENS = {
  // Anthropic (Claude) -- lijstprijzen augustus 2026
  'claude-sonnet-5': { input: 2.00, output: 10.00 },
  'claude-opus-5': { input: 5.00, output: 25.00 },
  'claude-fable-5': { input: 10.00, output: 50.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  // Legacy -- niet meer de standaard (DEFAULT_MODEL staat sinds 2026-08 op
  // claude-sonnet-5), maar blijft hier staan zodat historische rijen in
  // mini_app_ai_calls correct herrekend blijven worden in het admin-rapport.
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
  // Google Gemini -- gratis laag (fallback-provider), $0 want geen facturatie
  'gemini-flash-lite-latest': { input: 0, output: 0 },
  'gemini-flash-latest': { input: 0, output: 0 }
};

// Onbekend/nieuw model: val terug op de Sonnet-tarieven als voorzichtige
// schatting i.p.v. stil 0 te tonen (zou kosten onzichtbaar maken in het
// admin-rapport).
const FALLBACK_PRICING = PRICING_PER_MILLION_TOKENS['claude-sonnet-5'];

// Prompt-caching-multipliers op het INPUT-tarief (Anthropic, identiek voor alle
// modellen): schrijven kost 1,25x (5 min TTL) of 2x (1 uur), lezen 0,1x. We
// rekenen conservatief met de 5-minuten-schrijfprijs, want dat is wat de
// providers hier gebruiken (ttl wordt niet op '1h' gezet).
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

/**
 * @param {string} model
 * @param {number|null} tokensIn           Niet-gecachede input-tokens
 * @param {number|null} tokensOut
 * @param {number|null} [cacheReadTokens]  Uit de cache gelezen input-tokens (0,1x)
 * @param {number|null} [cacheWriteTokens] Naar de cache geschreven input-tokens (1,25x)
 * @returns {number|null}  USD, afgerond op 6 decimalen; null als alle tokencounts ontbreken
 */
export function estimateCostUsd(model, tokensIn, tokensOut, cacheReadTokens, cacheWriteTokens) {
  const anyKnown = [tokensIn, tokensOut, cacheReadTokens, cacheWriteTokens].some(v => Number.isFinite(v));
  if (!anyKnown) return null;

  const pricing = PRICING_PER_MILLION_TOKENS[model] || FALLBACK_PRICING;
  const num = v => (Number.isFinite(v) ? v : 0);

  const inCost = num(tokensIn) / 1_000_000 * pricing.input;
  const cacheReadCost = num(cacheReadTokens) / 1_000_000 * pricing.input * CACHE_READ_MULTIPLIER;
  const cacheWriteCost = num(cacheWriteTokens) / 1_000_000 * pricing.input * CACHE_WRITE_MULTIPLIER;
  const outCost = num(tokensOut) / 1_000_000 * pricing.output;

  return Math.round((inCost + cacheReadCost + cacheWriteCost + outCost) * 1_000_000) / 1_000_000;
}

export { PRICING_PER_MILLION_TOKENS };
