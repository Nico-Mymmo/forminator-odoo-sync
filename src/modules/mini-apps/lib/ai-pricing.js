/**
 * Mini-Apps — AI-kostprijstabel (schatting, geen officiële facturatie)
 *
 * Eén plek met $/miljoen-tokentarieven per model, gebruikt om bij elke
 * AI-aanroep (lib/ai.js -> logCall) een estimated_cost_usd te berekenen en
 * op te slaan in mini_app_ai_calls. Dit is een SCHATTING op basis van de
 * publieke lijstprijzen (juli 2026) -- geen prompt-caching-korting (-90% op
 * cache-hits) of batch-korting (-50%) verrekend, omdat window.platform.ai.ask()
 * bewust single-shot/real-time is (geen caching/batching-pad). De echte
 * Anthropic-factuur is dus normaliter <= deze schatting, nooit hoger (behalve
 * bij een prijswijziging na het laatste onderhoud van deze tabel).
 *
 * Nieuw model toevoegen/prijs wijzigen: enkel deze tabel aanpassen, geen
 * andere code -- lib/ai.js en de admin-rapportage lezen alles hieruit.
 */

// Tarieven in USD per 1.000.000 tokens (input/output apart).
const PRICING_PER_MILLION_TOKENS = {
  // Anthropic (Claude) -- lijstprijzen juli 2026
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  // Google Gemini -- gratis laag (fallback-provider), $0 want geen facturatie
  'gemini-flash-lite-latest': { input: 0, output: 0 },
  'gemini-flash-latest': { input: 0, output: 0 }
};

// Onbekend/nieuw model: val terug op de Sonnet-tarieven als voorzichtige
// schatting i.p.v. stil 0 te tonen (zou kosten onzichtbaar maken in het
// admin-rapport).
const FALLBACK_PRICING = PRICING_PER_MILLION_TOKENS['claude-sonnet-4-6'];

/**
 * @param {string} model
 * @param {number|null} tokensIn
 * @param {number|null} tokensOut
 * @returns {number|null}  USD, afgerond op 6 decimalen; null als tokencounts ontbreken
 */
export function estimateCostUsd(model, tokensIn, tokensOut) {
  if (!Number.isFinite(tokensIn) && !Number.isFinite(tokensOut)) return null;

  const pricing = PRICING_PER_MILLION_TOKENS[model] || FALLBACK_PRICING;
  const inCost = (Number.isFinite(tokensIn) ? tokensIn : 0) / 1_000_000 * pricing.input;
  const outCost = (Number.isFinite(tokensOut) ? tokensOut : 0) / 1_000_000 * pricing.output;

  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
}

export { PRICING_PER_MILLION_TOKENS };
