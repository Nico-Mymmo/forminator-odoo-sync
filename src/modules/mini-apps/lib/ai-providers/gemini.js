/**
 * Mini-Apps — AI-provider: Gemini (Google AI Studio / Generative Language API)
 *
 * Eén functie (`generate`) die een prompt (+ optionele system-instructie) naar
 * de Gemini API stuurt en het antwoord + tokencounts teruggeeft, in een vorm
 * die lib/ai.js provider-onafhankelijk kan verwerken (zie de provider-
 * registry daar). Vandaag draait dit op de GRATIS laag van de Gemini API
 * (aparte, token-gebaseerde facturatie los van het Google Workspace-
 * abonnement -- geen "Gemini for Workspace"-koppeling) -- bewust een losse
 * module per provider, zodat een overstap naar een ander model enkel een nieuw
 * bestand hier + een config-wijziging is, geen herschrijving van lib/ai.js of
 * de mini-apps-routes/-shim.
 *
 * BELANGRIJK (gratis laag): Google's voorwaarden laten toe dat prompts/
 * antwoorden op de gratis laag gebruikt worden om hun modellen te verbeteren,
 * en de rate-limits liggen op een paar tientallen requests/minuut (niet enkel
 * per dag) -- zie de daglimiet per app in lib/ai.js, die is los daarvan en
 * dekt dat GEEN vervanging is voor Google's eigen minuut-limiet: een 429 van
 * Google zelf (buiten onze eigen daglimiet om) is dus ook mogelijk en komt
 * hieronder als AI_PROVIDER_RATE_LIMITED naar boven.
 *
 * ─── Aangelijnd op het streamende providercontract (2026-08) ────────────────
 * Deze provider moet exact hetzelfde contract nakomen als
 * ai-providers/anthropic.js, want AI_PROVIDER omwisselen mag GEEN wijziging aan
 * lib/ai.js, de routes, de brug of de mini-apps vragen. Concreet betekent dat:
 * streamen (`streamGenerateContent` met `alt=sse`), `onDelta` per fragment,
 * eigen stall-detectie i.p.v. een clientside timeout-gok, gestructureerde
 * output via `responseSchema`, en foutcodes uit lib/ai-errors.js.
 * Zie ONTWERP-ai-aanroep-architectuur.md §1.
 */

import {
  AI_ERROR_CODES,
  AI_ERROR_PHASES,
  aiError,
  codeForProviderStatus,
  retryAfterMsFromHeaders
} from '../ai-errors.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// gemini-flash-lite-latest (Google-alias, wijst nu naar Gemini 3.1 Flash-Lite)
// i.p.v. gemini-flash-latest (3.5 Flash): veel ruimere gratis-laag-quotum
// (honderden requests/dag i.p.v. enkele tientallen) voor licht lagere
// kwaliteit -- past beter bij de eenvoudige, hoogfrequente taken (samenvatten,
// classificeren) waarvoor mini-apps dit gebruiken.
export const DEFAULT_MODEL = 'gemini-flash-lite-latest';

const DEFAULT_STALL_TIMEOUT_MS = 60000;

/**
 * Zelfde mini-SSE-parser als in anthropic.js (chunks breken willekeurig af, dus
 * bufferen op '\n\n' en decoderen met {stream:true}). Bewust gedupliceerd i.p.v.
 * gedeeld: de twee providers moeten onafhankelijk van elkaar aanpasbaar blijven
 * -- dat is het hele punt van de provider-map -- en het is ~25 regels.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @param {() => void} onActivity
 * @returns {AsyncGenerator<Object>}
 */
async function* readSseData(body, onActivity) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (onActivity) onActivity();
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines = raw
          .split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join('\n');
        if (payload === '[DONE]') return;
        try {
          yield JSON.parse(payload);
        } catch (_err) { /* onbekend/incompleet blok -- overslaan */ }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_err) { /* al vrijgegeven */ }
  }
}

/**
 * @param {Object} params
 * @param {Object} params.env                  Worker env (GEMINI_API_KEY, GEMINI_MODEL)
 * @param {string} [params.model]              Overschrijft env.GEMINI_MODEL / DEFAULT_MODEL
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {number} [params.maxOutputTokens]
 * @param {Object} [params.schema]             JSON-schema -> responseSchema + JSON-mimetype
 * @param {boolean} [params.cacheSystem]       Genegeerd (Gemini's context-caching is een
 *                                             aparte, expliciet beheerde resource -- geen
 *                                             inline breakpoint zoals bij Anthropic)
 * @param {(delta: string, info: Object) => void} [params.onDelta]
 * @param {AbortSignal} [params.signal]
 * @param {number} [params.stallTimeoutMs]
 * @returns {Promise<{text: string, json: Object|null, tokensIn: number|null, tokensOut: number|null,
 *                    cacheReadTokens: number|null, cacheWriteTokens: number|null,
 *                    model: string, stopReason: string|null, requestId: string|null}>}
 */
export async function generate({
  env, model, prompt, system, maxOutputTokens, schema,
  onDelta, signal, stallTimeoutMs
}) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw aiError(
      AI_ERROR_CODES.NOT_CONFIGURED,
      'AI-functionaliteit is nog niet geconfigureerd (GEMINI_API_KEY ontbreekt).',
      { phase: AI_ERROR_PHASES.GUARDRAIL }
    );
  }

  const resolvedModel = model || env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${API_BASE}/${encodeURIComponent(resolvedModel)}:streamGenerateContent?alt=sse`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxOutputTokens }
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  if (schema) {
    // Gemini's equivalent van Anthropic's output_config.format: JSON-mimetype +
    // schema. Zelfde effect voor de aanroeper (geldige JSON i.p.v. zelf parsen).
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }

  const stallMs = Number.isFinite(stallTimeoutMs) && stallTimeoutMs > 0
    ? stallTimeoutMs
    : DEFAULT_STALL_TIMEOUT_MS;
  const controller = new AbortController();
  let stalled = false;
  let stallTimer = null;
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      try { controller.abort(); } catch (_err) { /* al afgebroken */ }
    }, stallMs);
  };
  const disarmStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };

  let abortedByCaller = false;
  const onCallerAbort = () => {
    abortedByCaller = true;
    try { controller.abort(); } catch (_err) { /* al afgebroken */ }
  };
  if (signal) {
    if (signal.aborted) onCallerAbort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  let resp;
  armStallTimer();
  try {
    resp = await fetch(url, {
      // Key als header (X-goog-api-key), niet als query-param -- komt zo
      // nooit in een URL/request-log terecht (bv. Cloudflare-logging).
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    disarmStallTimer();
    if (abortedByCaller) {
      throw aiError(AI_ERROR_CODES.ABORTED, 'AI-aanroep afgebroken door de aanroeper.', {
        phase: AI_ERROR_PHASES.PROVIDER
      });
    }
    if (stalled) {
      throw aiError(
        AI_ERROR_CODES.STALLED,
        `Gemini reageerde ${Math.round(stallMs / 1000)}s lang niet -- de verbinding is afgebroken.`,
        { phase: AI_ERROR_PHASES.PROVIDER }
      );
    }
    throw aiError(AI_ERROR_CODES.PROVIDER_UNREACHABLE, `Gemini API onbereikbaar: ${err.message}`, {
      phase: AI_ERROR_PHASES.PROVIDER,
      cause: err
    });
  }

  if (!resp.ok) {
    disarmStallTimer();
    let detail = '';
    try {
      const errJson = await resp.json();
      detail = errJson?.error?.message || '';
    } catch (_err) { /* geen JSON-body -- negeren */ }
    const code = codeForProviderStatus(resp.status);
    const hint = code === AI_ERROR_CODES.PROVIDER_RATE_LIMITED
      ? ' -- waarschijnlijk de rate-limit van de gratis laag (per minuut), niet onze daglimiet.'
      : '';
    throw aiError(code, `Gemini API-fout (${resp.status})${detail ? `: ${detail}` : ''}${hint}`, {
      phase: AI_ERROR_PHASES.PROVIDER,
      providerStatus: resp.status,
      retryAfterMs: retryAfterMsFromHeaders(resp.headers)
    });
  }

  if (!resp.body) {
    disarmStallTimer();
    throw aiError(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Gemini gaf een antwoord zonder inhoud (geen stream).', {
      phase: AI_ERROR_PHASES.STREAM
    });
  }

  let text = '';
  let tokensIn = null;
  let tokensOut = null;
  let cacheReadTokens = null;
  let finishReason = null;

  try {
    for await (const data of readSseData(resp.body, armStallTimer)) {
      if (data?.error) {
        throw aiError(
          AI_ERROR_CODES.PROVIDER_ERROR,
          `Gemini meldde een fout tijdens het genereren${data.error.message ? `: ${data.error.message}` : ''}.`,
          { phase: AI_ERROR_PHASES.STREAM }
        );
      }
      const candidate = data?.candidates?.[0];
      const piece = (candidate?.content?.parts || []).map(p => p.text || '').join('');
      if (piece) {
        text += piece;
        if (onDelta) {
          try {
            onDelta(piece, { text, outputTokens: tokensOut });
          } catch (_err) { /* voortgangs-callback mag nooit de aanroep breken */ }
        }
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (data?.usageMetadata) {
        tokensIn = data.usageMetadata.promptTokenCount ?? tokensIn;
        tokensOut = data.usageMetadata.candidatesTokenCount ?? tokensOut;
        cacheReadTokens = data.usageMetadata.cachedContentTokenCount ?? cacheReadTokens;
      }
    }
  } catch (err) {
    disarmStallTimer();
    if (err && err.name === 'AiError') throw err;
    if (abortedByCaller) {
      throw aiError(AI_ERROR_CODES.ABORTED, 'AI-aanroep afgebroken door de aanroeper.', {
        phase: AI_ERROR_PHASES.STREAM
      });
    }
    if (stalled) {
      const stallErr = aiError(
        AI_ERROR_CODES.STALLED,
        `Gemini stuurde ${Math.round(stallMs / 1000)}s lang niets meer terug -- aanroep afgebroken.`,
        { phase: AI_ERROR_PHASES.STREAM }
      );
      stallErr.partialText = text;
      throw stallErr;
    }
    const streamErr = aiError(
      AI_ERROR_CODES.STREAM_INTERRUPTED,
      `De verbinding met Gemini brak af tijdens het genereren: ${err.message}`,
      { phase: AI_ERROR_PHASES.STREAM, cause: err }
    );
    streamErr.partialText = text;
    throw streamErr;
  }
  disarmStallTimer();
  if (signal) {
    try { signal.removeEventListener('abort', onCallerAbort); } catch (_err) { /* niets */ }
  }

  // Afbreken kan de stream ook STIL beëindigen i.p.v. de read te laten falen
  // (afhankelijk van de runtime: undici/workerd gedragen zich hier niet
  // identiek). Daarom hier nog eens expliciet op de vlaggen controleren -- zonder
  // deze check zou een stall of een abort als AI_STREAM_INTERRUPTED naar buiten
  // komen, en dan zijn we terug bij het oorspronkelijke probleem: verschillende
  // oorzaken die als dezelfde fout aankomen.
  if (abortedByCaller) {
    throw aiError(AI_ERROR_CODES.ABORTED, 'AI-aanroep afgebroken door de aanroeper.', {
      phase: AI_ERROR_PHASES.STREAM
    });
  }
  if (stalled) {
    const stallErr2 = aiError(
      AI_ERROR_CODES.STALLED,
      `Gemini stuurde ${Math.round(stallMs / 1000)}s lang niets meer terug -- aanroep afgebroken.`,
      { phase: AI_ERROR_PHASES.STREAM }
    );
    stallErr2.partialText = text;
    throw stallErr2;
  }

  // Gemini's finishReason op onze codes: MAX_TOKENS is een afgekapt antwoord
  // (aanroeper moet meer output-tokens vragen), SAFETY/RECITATION/BLOCKLIST is
  // een weigering. Zelfde onderscheid als bij Anthropic's stop_reason, zodat een
  // mini-app niet hoeft te weten welke provider eronder zit.
  if (finishReason === 'MAX_TOKENS') {
    const err = aiError(
      AI_ERROR_CODES.TRUNCATED,
      `Het antwoord van Gemini is afgekapt omdat de limiet van ${maxOutputTokens} output-tokens bereikt werd. Vraag meer output-tokens of verklein de batch.`,
      { phase: AI_ERROR_PHASES.PROVIDER, stopReason: finishReason }
    );
    err.partialText = text;
    throw err;
  }
  if (finishReason && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].indexOf(finishReason) !== -1) {
    throw aiError(AI_ERROR_CODES.REFUSED, `Gemini heeft het antwoord geblokkeerd (${finishReason}).`, {
      phase: AI_ERROR_PHASES.PROVIDER,
      stopReason: finishReason
    });
  }

  if (!text) {
    throw aiError(
      AI_ERROR_CODES.EMPTY_RESPONSE,
      `Gemini gaf geen bruikbaar antwoord terug${finishReason ? ` (${finishReason})` : ''}.`,
      { phase: AI_ERROR_PHASES.PROVIDER, stopReason: finishReason }
    );
  }

  let json = null;
  if (schema) {
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw aiError(
        AI_ERROR_CODES.OUTPUT_INVALID_JSON,
        `Gemini gaf geen geldige JSON terug ondanks een schema: ${err.message}`,
        { phase: AI_ERROR_PHASES.PARSE, cause: err }
      );
    }
  }

  return {
    text,
    json,
    tokensIn,
    tokensOut,
    cacheReadTokens,
    cacheWriteTokens: null,
    model: resolvedModel,
    stopReason: finishReason,
    requestId: null
  };
}
