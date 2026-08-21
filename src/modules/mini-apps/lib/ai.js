/**
 * Mini-Apps — AI (server-side aanroep van een AI-model namens een mini-app)
 *
 * Laat een mini-app een AI-model aanroepen via window.platform.ai.ask(prompt,
 * {system, maxOutputTokens, ...}) in de iframe-shim (zie public/mini-apps-core.js)
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
 * logica of aan de mini-app-kant.
 *
 * ─── Herziening 2026-08: streaming, schema's, modelkeuze, foutcontract ──────
 * Wat er veranderd is en waarom (volledige onderbouwing in
 * ONTWERP-ai-aanroep-architectuur.md):
 *
 *  1. De providers STREAMEN nu altijd. Deze laag geeft een `onDelta`-callback
 *     door zodat routes.js de tekst als SSE kan doorsturen naar de host-pagina.
 *     Daarmee verdwijnt de reden voor de clientside timeout-cap in
 *     mini-apps-core.js (45s -> 180s -> 300s, drie keer op gevoel opgetrokken):
 *     er is nu continu verkeer, dus een INACTIVITEITS-timeout volstaat en die
 *     hoeft nooit meer bijgesteld te worden.
 *  2. Rate-limit en guardrails gebeuren VOORAF (ongewijzigd), maar het
 *     audit-log gebeurt nu ook correct bij een halverwege afgebroken stream --
 *     inclusief de tokens die dan al verbruikt zijn.
 *  3. `schema` (gestructureerde output) wordt doorgegeven aan de provider. Een
 *     mini-app hoeft geen JSON meer uit tekst te vissen met reguliere
 *     expressies.
 *  4. `model` mag door de mini-app gekozen worden, maar ALLEEN uit een
 *     server-side allowlist (MODEL_ALLOWLIST) -- anders kan een mini-app
 *     ongemerkt naar het duurste model grijpen en is kostenbeheersing weg.
 *     Dit maakt het mogelijk om classificatie op Haiku te doen (~5x goedkoper)
 *     en enkel het echte samenvatwerk op Sonnet.
 *
 * Guardrails:
 *  - Lengte-caps op prompt/system (geen bulk/misbruik als generieke text-API).
 *  - Rate-limit per app: max MAX_PER_APP_PER_DAY aanroepen per app per dag
 *    (rolling 24u-venster, zelfde patroon als notify.js/chat.js).
 *  - Rate-limit platform-breed: max MAX_GLOBAL_PER_DAY aanroepen over ALLE
 *    mini-apps samen per dag (rolling 24u-venster) -- kostenbeheersing op het
 *    Claude-abonnement zelf, los van hoeveel apps er zijn.
 *  - maxOutputTokens is altijd begrensd door MAX_OUTPUT_TOKENS_CAP, ongeacht
 *    wat de mini-app zelf opgeeft.
 *  - Model uit MODEL_ALLOWLIST, schema begrensd op grootte.
 *  - Volledige audit-log in mini_app_ai_calls, ook bij een gefaalde aanroep --
 *    bewust ZONDER de prompt/antwoord-tekst zelf op te slaan (enkel lengtes/
 *    tokencounts/foutcode), zie de migratie voor de motivatie.
 *  - Dit is bewust single-shot (één prompt + optionele system-instructie),
 *    geen multi-turn/chat-geheugen.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import * as anthropicProvider from './ai-providers/anthropic.js';
import * as geminiProvider from './ai-providers/gemini.js';
import { estimateCostUsd } from './ai-pricing.js';
import { AI_ERROR_CODES, AI_ERROR_PHASES, aiError } from './ai-errors.js';

// ─── Provider-registry ───────────────────────────────────────────────────────
// Nieuwe provider toevoegen: hier één regel bijzetten (en optioneel
// AI_PROVIDER in wrangler.jsonc/.env aanpassen om hem als standaard te
// gebruiken) -- de rest van dit bestand blijft ongewijzigd.
const PROVIDERS = {
  anthropic: anthropicProvider,
  gemini: geminiProvider
};

// Welke modellen een mini-app zelf mag kiezen via ai.ask(..., {model}).
// Bewust een ALLOWLIST en geen vrij tekstveld: zonder dit kan een mini-app
// (of iemand die er een prompt in typt) naar Opus/Fable grijpen en de
// platform-brede kostenbeheersing omzeilen -- de daglimiet telt AANROEPEN, niet
// euro's, dus 500 Opus-aanroepen is een heel andere rekening dan 500
// Haiku-aanroepen.
//
// De keuze per taak (zie ONTWERP §3.4): Haiku voor classificatie met een
// gesloten antwoordruimte (weinig output-tokens, 5x goedkoper), Sonnet voor
// begrijpend samenvatten en analyseren. Opus staat er bewust NIET in.
export const MODEL_ALLOWLIST = {
  anthropic: ['claude-sonnet-5', 'claude-haiku-4-5'],
  gemini: ['gemini-flash-lite-latest', 'gemini-flash-latest']
};

// Prompt-cap is in TOKENS, niet tekens -- er zit geen echte tokenizer in deze
// Cloudflare Worker, dus estimateTokens() hieronder gebruikt een ruwe
// vuistregel (±4 tekens per token, gangbaar voor Engels/Nederlands proza).
// Dat is een guardrail tegen misbruik/bulk, geen exacte facturatie-check --
// de echte tokencount komt van de provider zelf (result.tokensIn, zie
// logCall hieronder).
export const MAX_PROMPT_TOKENS = 25000;
export const MAX_SYSTEM_LENGTH = 2000;

/**
 * Ruwe schatting van het aantal tokens in een tekst (±4 tekens/token).
 * Enkel voor de pre-call guardrail hierboven -- geen vervanging van de
 * echte tokencount die de provider teruggeeft.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}
// Was 8192 tot 2026-08 -- dat was GEEN Anthropic-limiet maar een eigen,
// veel te krappe guardrail (claude-sonnet-5 ondersteunt tot 128k
// output-tokens, zie ai-providers/anthropic.js). Elke mini-app die
// meerdere records/objecten per aanroep liet samenvatten (zie bv. de
// Actiebladen Insights-batches) moest daardoor het beschikbare budget per
// aanroep zo krap begroten dat een normale schommeling in antwoordlengte al
// AI_TRUNCATED opleverde -- met als gevolg dat een AL BETAALDE, deels
// gestreamde aanroep werd weggegooid en de batch (opnieuw, opnieuw betaald)
// gesplitst moest worden. Vragen om meer output-tokens kost niets extra
// zolang het model minder schrijft dan het plafond (je betaalt de WERKELIJKE
// output, zie logCall() hieronder) -- dit hoger zetten is dus zuivere winst,
// geen kostenrisico. 32000 geeft ruim de 4x lucht die de meeste mini-apps
// nodig hebben, terwijl een enkele aanroep nog binnen een redelijke duur
// blijft gegeven de client-side noodrem (AI_HARD_MS in mini-apps-core.js,
// mee opgetrokken bij deze wijziging).
export const MAX_OUTPUT_TOKENS_CAP = 32000;
export const MAX_PER_APP_PER_DAY = 200;
// Platform-brede daglimiet over alle mini-apps samen -- kostenbeheersing op
// het gedeelde Claude-abonnement. Los van MAX_PER_APP_PER_DAY: die begrenst
// misbruik door één app, dit begrenst de totale rekening.
export const MAX_GLOBAL_PER_DAY = 500;

// Maximale grootte van een meegegeven JSON-schema (als string). Een schema komt
// uit mini-app-code en gaat mee in élke aanroep; een absurd groot schema zou
// stil de prompt-ruimte opeten en de provider-aanroep laten falen met een
// onbegrijpelijke fout.
export const MAX_SCHEMA_CHARS = 8000;

// Inactiviteits-timeout die we aan de provider doorgeven. Dit is GEEN
// totaalduur-limiet: het is "hoelang mag het stil zijn". Zie de uitgebreide
// motivatie in ai-providers/anthropic.js -- dit is de waarde die de oude,
// telkens opgetrokken clientside cap vervangt en die niet meebeweegt met de
// gevraagde output-lengte.
export const AI_STALL_TIMEOUT_MS = 60000;

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function getProvider(env) {
  const name = (env.AI_PROVIDER || 'anthropic').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw aiError(
      AI_ERROR_CODES.UNKNOWN_PROVIDER,
      `Onbekende AI-provider geconfigureerd: ${name}.`,
      { phase: AI_ERROR_PHASES.GUARDRAIL }
    );
  }
  return { name, ...provider };
}

/**
 * Wachttijd op een daglimiet-telling. Waarom dit bestaat:
 *
 * De twee tellingen hieronder zijn `count(*)` op mini_app_ai_calls -- een tabel
 * die bij ELKE AI-aanroep een rij bijkrijgt, dus ook bij elke
 * samenvattingsbatch van een mini-app. Ze staan VOOR de aanroep naar de
 * provider, en ze hadden geen enkele bovengrens op hun duur: werd de telling
 * traag, dan bleef de hele AI-route stil hangen zonder fout, zonder log en
 * zonder timeout -- de mini-app zag alleen een open stream waar niets uit kwam
 * (precies het beeld uit de diagnose van 21/08: "stream staat OPEN, 60s geen
 * fragment"). Een daglimiet is een BEWAKING, geen kernfunctie: hem even niet
 * kunnen controleren mag nooit betekenen dat er niets meer werkt. Vandaar: max
 * RATE_LIMIT_TIMEOUT_MS wachten, en daarna doorgaan met een luide logregel
 * (fail-open). De audit-log (logCall) blijft ongewijzigd, dus het gebruik blijft
 * volledig traceerbaar -- ook de aanroepen die deze controle oversloegen.
 */
const RATE_LIMIT_TIMEOUT_MS = 4000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} duurde langer dan ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
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
    throw aiError(
      AI_ERROR_CODES.RATE_LIMIT_APP,
      `Deze app heeft de daglimiet van ${MAX_PER_APP_PER_DAY} AI-aanroepen bereikt.`,
      { phase: AI_ERROR_PHASES.RATELIMIT }
    );
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
    throw aiError(
      AI_ERROR_CODES.RATE_LIMIT_PLATFORM,
      `De platform-brede daglimiet van ${MAX_GLOBAL_PER_DAY} AI-aanroepen is bereikt. Probeer morgen opnieuw.`,
      { phase: AI_ERROR_PHASES.RATELIMIT }
    );
  }
}

async function logCall(env, {
  appId, userId, provider, model, promptChars, responseChars,
  tokensIn, tokensOut, cacheReadTokens, cacheWriteTokens,
  status, errorMessage, errorCode, stopReason, durationMs
}) {
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
    cache_read_tokens: cacheReadTokens ?? null,
    cache_write_tokens: cacheWriteTokens ?? null,
    estimated_cost_usd: estimateCostUsd(model, tokensIn, tokensOut, cacheReadTokens, cacheWriteTokens),
    status,
    error_message: errorMessage || null,
    error_code: errorCode || null,
    stop_reason: stopReason || null,
    duration_ms: Number.isFinite(durationMs) ? Math.round(durationMs) : null
  });
  if (error) {
    // Loggen mag nooit de eigenlijke aanroep blokkeren -- enkel console.error.
    console.error('[mini-apps] ai audit-log insert failed:', error.message);
  }
}

/**
 * Valideert alles wat een mini-app meegeeft, vóór er ook maar één token
 * betaald wordt. Aparte functie zodat askAI() leesbaar blijft en zodat de
 * guardrails op één plek staan (ze bepalen samen wat een mini-app maximaal kan
 * aanrichten).
 *
 * @param {Object} providerName
 * @param {Object} options
 * @returns {{prompt: string, system: string|undefined, maxOutputTokens: number, model: string|undefined, schema: Object|undefined}}
 */
function validateRequest(providerName, { prompt, system, maxOutputTokens, model, schema }) {
  if (typeof prompt !== 'string' || !prompt.trim() || estimateTokens(prompt) > MAX_PROMPT_TOKENS) {
    throw aiError(
      AI_ERROR_CODES.INVALID_PROMPT,
      `prompt is verplicht en max ${MAX_PROMPT_TOKENS} tokens (ruwe schatting: ±4 tekens/token).`,
      { phase: AI_ERROR_PHASES.GUARDRAIL }
    );
  }
  if (system != null && (typeof system !== 'string' || system.length > MAX_SYSTEM_LENGTH)) {
    throw aiError(
      AI_ERROR_CODES.INVALID_SYSTEM,
      `system is optioneel maar max ${MAX_SYSTEM_LENGTH} tekens.`,
      { phase: AI_ERROR_PHASES.GUARDRAIL }
    );
  }

  let resolvedModel;
  if (model != null) {
    const allowed = MODEL_ALLOWLIST[providerName] || [];
    if (typeof model !== 'string' || allowed.indexOf(model) === -1) {
      throw aiError(
        AI_ERROR_CODES.INVALID_MODEL,
        `model '${model}' is niet toegestaan. Toegestane modellen voor provider ${providerName}: ${allowed.join(', ')}.`,
        { phase: AI_ERROR_PHASES.GUARDRAIL }
      );
    }
    resolvedModel = model;
  }

  let resolvedSchema;
  if (schema != null) {
    if (typeof schema !== 'object' || Array.isArray(schema)) {
      throw aiError(AI_ERROR_CODES.INVALID_SCHEMA, 'schema moet een JSON-schema-object zijn.', {
        phase: AI_ERROR_PHASES.GUARDRAIL
      });
    }
    let serialized;
    try {
      serialized = JSON.stringify(schema);
    } catch (_err) {
      throw aiError(AI_ERROR_CODES.INVALID_SCHEMA, 'schema is niet serialiseerbaar naar JSON.', {
        phase: AI_ERROR_PHASES.GUARDRAIL
      });
    }
    if (serialized.length > MAX_SCHEMA_CHARS) {
      throw aiError(
        AI_ERROR_CODES.INVALID_SCHEMA,
        `schema is te groot (${serialized.length} tekens, max ${MAX_SCHEMA_CHARS}).`,
        { phase: AI_ERROR_PHASES.GUARDRAIL }
      );
    }
    resolvedSchema = schema;
  }

  const boundedMaxOutputTokens = Math.min(
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : MAX_OUTPUT_TOKENS_CAP,
    MAX_OUTPUT_TOKENS_CAP
  );

  return {
    prompt: prompt.trim(),
    system: system ? system.trim() : undefined,
    maxOutputTokens: boundedMaxOutputTokens,
    model: resolvedModel,
    schema: resolvedSchema
  };
}

/**
 * Roept het AI-model aan namens een mini-app: guardrails -> rate-limits ->
 * provider -> audit-log.
 *
 * De provider streamt altijd; `onDelta` is optioneel en wordt door routes.js
 * gebruikt om de tekst als SSE door te sturen. Zonder `onDelta` gedraagt deze
 * functie zich naar buiten toe exact als vroeger (één Promise met het volledige
 * antwoord), zodat de gewone JSON-route ongewijzigd blijft werken.
 *
 * @param {Object} env
 * @param {Object} app     Volledige mini_apps-rij
 * @param {Object} user    Huidige gebruiker (context.user) -- degene die de actie triggert
 * @param {Object} options
 * @param {string} options.prompt
 * @param {string} [options.system]
 * @param {number} [options.maxOutputTokens]
 * @param {string} [options.model]                 Moet in MODEL_ALLOWLIST staan
 * @param {Object} [options.schema]                JSON-schema -> gegarandeerd geldige JSON
 * @param {boolean} [options.cacheSystem]
 * @param {(delta: string, info: Object) => void} [options.onDelta]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{text: string, json: Object|null, model: string, usage: Object, stopReason: string|null, requestId: string|null}>}
 */
export async function askAI(env, app, user, options = {}) {
  const { name: providerName, generate, DEFAULT_MODEL } = getProvider(env);
  const validated = validateRequest(providerName, options);

  /* Voortgangslogging (wrangler tail). Deze route kan op drie heel
     verschillende plekken lang stil vallen -- de daglimiet-tellingen in
     Supabase, de aanroep naar Claude zelf, of het wegschrijven van de
     audit-regel -- en dat was van buitenaf niet te onderscheiden: de mini-app
     zag enkel "geen fragment ontvangen". Elke stap krijgt daarom een regel met
     een tijdstip erbij; het `t=`-getal is de tijd sinds het begin van deze
     aanroep. */
  const t0 = Date.now();
  /* Dezelfde stap ook naar de AANROEPER (routes.js stuurt ze als `stage`-event
     mee in de SSE-stream). Zonder dit was het serververloop enkel te zien in
     `wrangler tail`; nu staat het gewoon in de diagnose van de mini-app zelf,
     bij de gebruiker die het probleem heeft. */
  const naarClient = typeof options.onStage === 'function' ? options.onStage : null;
  const stap = (wat) => (naarClient && naarClient(wat, Date.now() - t0), console.log(`[mini-apps ai] ${wat} (t=${Date.now() - t0}ms, app ${app.id}, model ${validated.model || DEFAULT_MODEL}, prompt ${validated.prompt.length} tekens${validated.schema ? ', met schema' : ''})`));

  stap('daglimieten nakijken');
  /* Samen i.p.v. na elkaar (het waren twee onafhankelijke tellingen die niets
     van elkaar nodig hebben), en met een plafond op de wachttijd -- zie
     RATE_LIMIT_TIMEOUT_MS hierboven voor het volledige waarom. Een echte
     limiet-fout (AI_RATE_LIMIT_*) moet WEL blijven werken: die gooit een
     aiError met een code, en die laten we door. Enkel een trage of kapotte
     telling wordt overgeslagen. */
  try {
    await withTimeout(
      Promise.all([checkGlobalRateLimit(env), checkRateLimit(env, app.id)]),
      RATE_LIMIT_TIMEOUT_MS,
      'daglimiet-telling'
    );
    stap('daglimieten in orde, aanroep naar de provider vertrekt');
  } catch (err) {
    if (err && err.code) throw err; // echte limiet bereikt -- blijft fataal
    console.warn(`[mini-apps ai] daglimiet-controle OVERGESLAGEN: ${err.message}. De aanroep gaat door; het gebruik wordt nog altijd gelogd (mini_app_ai_calls). Blijft dit zich herhalen, dan is de telling op mini_app_ai_calls te traag geworden -- overweeg een index op (created_at) en (mini_app_id, created_at), of een teller in KV i.p.v. count(*).`);
    stap('daglimieten NIET gecontroleerd (te traag), aanroep naar de provider vertrekt toch');
  }

  const startedAt = Date.now();

  try {
    const result = await generate({
      env,
      prompt: validated.prompt,
      system: validated.system,
      maxOutputTokens: validated.maxOutputTokens,
      model: validated.model,
      schema: validated.schema,
      cacheSystem: options.cacheSystem === true,
      onDelta: typeof options.onDelta === 'function' ? options.onDelta : undefined,
      onProviderEvent: stap,
      signal: options.signal,
      stallTimeoutMs: AI_STALL_TIMEOUT_MS
    });

    stap(`antwoord volledig: ${result.text.length} tekens, ${result.tokensOut || '?'} out-tokens, stop_reason ${result.stopReason || '?'} -- audit-regel wegschrijven`);
    await logCall(env, {
      appId: app.id,
      userId: user.id,
      provider: providerName,
      model: result.model || validated.model || DEFAULT_MODEL,
      promptChars: validated.prompt.length,
      responseChars: result.text.length,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
      status: 'ok',
      stopReason: result.stopReason,
      durationMs: Date.now() - startedAt
    });

    return {
      text: result.text,
      json: result.json ?? null,
      model: result.model || validated.model || DEFAULT_MODEL,
      usage: {
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        cacheReadTokens: result.cacheReadTokens,
        cacheWriteTokens: result.cacheWriteTokens
      },
      stopReason: result.stopReason || null,
      requestId: result.requestId || null
    };
  } catch (err) {
    // Ook bij een fout de tokens loggen die de provider al gerapporteerd heeft
    // (bv. bij AI_TRUNCATED: die aanroep is volledig betaald). Vóór deze
    // wijziging werd hier altijd null/0 gelogd, waardoor het kostenrapport de
    // duurste mislukkingen -- precies degene die we onderzochten -- als gratis
    // toonde.
    await logCall(env, {
      appId: app.id,
      userId: user.id,
      provider: providerName,
      model: validated.model || DEFAULT_MODEL,
      promptChars: validated.prompt.length,
      responseChars: typeof err.partialText === 'string' ? err.partialText.length : 0,
      tokensIn: Number.isFinite(err.tokensIn) ? err.tokensIn : null,
      tokensOut: Number.isFinite(err.tokensOut) ? err.tokensOut : null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      status: 'failed',
      errorMessage: err.message,
      errorCode: err.code || null,
      stopReason: err.stopReason || null,
      durationMs: Date.now() - startedAt
    });
    throw err;
  }
}
