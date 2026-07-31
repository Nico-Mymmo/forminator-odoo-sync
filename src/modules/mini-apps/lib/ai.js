/**
 * Mini-Apps — AI (server-side aanroep van een AI-model namens een mini-app)
 *
 * Laat een mini-app een AI-model aanroepen via window.platform.ai.ask(prompt,
 * {system, maxOutputTokens}) in de iframe-shim (zie public/mini-apps-core.js)
 * en POST /api/apps/:id/ai/ask in routes.js. Zelfde opzet als lib/notify.js/
 * lib/chat.js: guardrails + rate-limit + audit-log in dit ene bestand, de
 * route zelf blijft dun.
 *
 * Provider-onafhankelijk met opzet: de eigenlijke API-aanroep zit in een apart
 * bestand per provider (./ai-providers/<naam>.js, export `generate()` +
 * `DEFAULT_MODEL`). Sinds 2026-07 draait dit op Anthropic/Claude (eigen
 * team-abonnement, geen train-on-data-laag zoals Gemini's gratis tier --
 * zie ai-providers/anthropic.js). Gemini blijft geregistreerd als fallback/
 * alternatief (ai-providers/gemini.js) -- wisselen is enkel AI_PROVIDER in
 * wrangler.jsonc/.env aanpassen, GEEN wijziging aan de rate-limit/audit-
 * logica of aan de mini-app-kant (window.platform.ai.ask() blijft exact
 * hetzelfde werken).
 *
 * Guardrails:
 *  - Lengte-caps op prompt/system (geen bulk/misbruik als generieke text-API).
 *  - Rate-limit per app: max MAX_PER_APP_PER_DAY aanroepen per app per dag
 *    (rolling 24u-venster, zelfde patroon als notify.js/chat.js).
 *  - Rate-limit platform-breed: max MAX_GLOBAL_PER_DAY aanroepen over ALLE
 *    mini-apps samen per dag (rolling 24u-venster) -- kostenbeheersing op het
 *    Claude-abonnement zelf, los van hoeveel apps er zijn. Faalt hard met
 *    RATE_LIMIT_GLOBAL zodra bereikt, ongeacht welke app het aanvraagt.
 *  - maxOutputTokens is altijd begrensd door MAX_OUTPUT_TOKENS_CAP, ongeacht
 *    wat de mini-app zelf opgeeft -- voorkomt één dure aanroep die de hele
 *    daglimiet in kosten opsoupeert.
 *  - Volledige audit-log in mini_app_ai_calls, ook bij een gefaalde aanroep --
 *    bewust ZONDER de prompt/antwoord-tekst zelf op te slaan (enkel lengtes/
 *    tokencounts), zie de migratie voor de motivatie.
 *  - Dit is bewust single-shot (één prompt + optionele system-instructie),
 *    geen multi-turn/chat-geheugen -- eenvoudiger te beveiligen/beheersen,
 *    en dekt de meeste mini-app-taken (samenvatten, classificeren,
 *    herschrijven, ideeën genereren).
 */

import { getSupabaseClient } from '../../../lib/database.js';
import * as anthropicProvider from './ai-providers/anthropic.js';
import * as geminiProvider from './ai-providers/gemini.js';
import { estimateCostUsd } from './ai-pricing.js';

// ─── Provider-registry ───────────────────────────────────────────────────────
// Nieuwe provider toevoegen: hier één regel bijzetten (en optioneel
// AI_PROVIDER in wrangler.jsonc/.env aanpassen om hem als standaard te
// gebruiken) -- de rest van dit bestand blijft ongewijzigd.
const PROVIDERS = {
  anthropic: anthropicProvider,
  gemini: geminiProvider
};

export const MAX_PROMPT_LENGTH = 8000;
export const MAX_SYSTEM_LENGTH = 2000;
export const MAX_OUTPUT_TOKENS_CAP = 1024;
export const MAX_PER_APP_PER_DAY = 200;
// Platform-brede daglimiet over alle mini-apps samen -- kostenbeheersing op
// het gedeelde Claude-abonnement. Los van MAX_PER_APP_PER_DAY: die begrenst
// misbruik door één app, dit begrenst de totale rekening.
export const MAX_GLOBAL_PER_DAY = 500;

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function aiError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function getProvider(env) {
  const name = (env.AI_PROVIDER || 'anthropic').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw aiError(`Onbekende AI-provider geconfigureerd: ${name}.`, 'UNKNOWN_AI_PROVIDER');
  }
  return { name, ...provider };
}

async function checkRateLimit(env, appId) {
  const supabase = getSupabaseClient(env);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from('mini_app_ai_calls')
    .select('id', { count: 'exact', head: true })
    .eq('mini_app_id', appId)
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  if ((count || 0) >= MAX_PER_APP_PER_DAY) {
    throw aiError(`Deze app heeft de daglimiet van ${MAX_PER_APP_PER_DAY} AI-aanroepen bereikt.`, 'RATE_LIMIT_APP');
  }
}

async function checkGlobalRateLimit(env) {
  const supabase = getSupabaseClient(env);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from('mini_app_ai_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  if ((count || 0) >= MAX_GLOBAL_PER_DAY) {
    throw aiError(`De platform-brede daglimiet van ${MAX_GLOBAL_PER_DAY} AI-aanroepen is bereikt. Probeer morgen opnieuw.`, 'RATE_LIMIT_GLOBAL');
  }
}

async function logCall(env, { appId, userId, provider, model, promptChars, responseChars, tokensIn, tokensOut, status, errorMessage }) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase.from('mini_app_ai_calls').insert({
    mini_app_id: appId,
    user_id: userId,
    provider,
    model,
    prompt_chars: promptChars,
    response_chars: responseChars,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: estimateCostUsd(model, tokensIn, tokensOut),
    status,
    error_message: errorMessage || null
  });
  if (error) {
    // Loggen mag nooit de eigenlijke aanroep blokkeren -- enkel console.error.
    console.error('[mini-apps] ai audit-log insert failed:', error.message);
  }
}

/**
 * @param {Object} env
 * @param {Object} app     Volledige mini_apps-rij
 * @param {Object} user    Huidige gebruiker (context.user) -- degene die de actie triggert
 * @param {string} prompt
 * @param {string} [system]
 * @param {number} [maxOutputTokens]
 * @returns {Promise<{ text: string, model: string }>}
 */
export async function askAI(env, app, user, prompt, system, maxOutputTokens) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
    throw aiError(`prompt is verplicht en max ${MAX_PROMPT_LENGTH} tekens.`, 'INVALID_PROMPT');
  }
  if (system != null && (typeof system !== 'string' || system.length > MAX_SYSTEM_LENGTH)) {
    throw aiError(`system is optioneel maar max ${MAX_SYSTEM_LENGTH} tekens.`, 'INVALID_SYSTEM');
  }

  const boundedMaxOutputTokens = Math.min(
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : MAX_OUTPUT_TOKENS_CAP,
    MAX_OUTPUT_TOKENS_CAP
  );

  await checkGlobalRateLimit(env);
  await checkRateLimit(env, app.id);

  const { name: providerName, generate, DEFAULT_MODEL } = getProvider(env);

  try {
    const result = await generate({
      env,
      prompt: prompt.trim(),
      system: system ? system.trim() : undefined,
      maxOutputTokens: boundedMaxOutputTokens
    });

    await logCall(env, {
      appId: app.id,
      userId: user.id,
      provider: providerName,
      model: result.model || DEFAULT_MODEL,
      promptChars: prompt.length,
      responseChars: result.text.length,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      status: 'ok'
    });

    return { text: result.text, model: result.model || DEFAULT_MODEL };
  } catch (err) {
    await logCall(env, {
      appId: app.id,
      userId: user.id,
      provider: providerName,
      model: DEFAULT_MODEL,
      promptChars: prompt.length,
      responseChars: 0,
      tokensIn: null,
      tokensOut: null,
      status: 'failed',
      errorMessage: err.message
    });
    throw err;
  }
}
