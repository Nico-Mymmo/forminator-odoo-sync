/**
 * Mini-Apps — AI-foutcontract (één canonieke lijst foutcodes voor de hele keten)
 *
 * Waarom dit bestand bestaat: vóór 2026-08 zette elke laag zijn eigen `err.code`
 * (of geen), en de postMessage-brug in public/mini-apps-core.js liet die code
 * vervolgens vallen (`apiJson()` deed `new Error(body.error)`). Een mini-app kon
 * daarna enkel nog reguliere expressies op Nederlandse foutteksten loslaten om te
 * weten wat er misging -- in Actiebladen Insights letterlijk
 * `/timeout|verliep|time-?out/i` en `/limiet|limit/i`. Daardoor waren een
 * clientside timeout, een 429 van Anthropic, onze eigen daglimiet, een afgekapt
 * antwoord en een echte bug niet van elkaar te onderscheiden, terwijl elk daarvan
 * een ANDERE reactie vraagt (opnieuw proberen / wachten / stoppen / meer
 * output-tokens vragen / melden).
 *
 * Regel: de code die hier gezet wordt reist ONGEWIJZIGD door provider ->
 * lib/ai.js -> routes.js -> brug -> window.platform.ai.ask(). Geen laag mag een
 * code vertalen, inslikken of vervangen door tekst. De mens-leesbare boodschap
 * (err.message) blijft ernaast bestaan voor de UI, maar is nooit de
 * informatiedrager voor code.
 *
 * Zie ONTWERP-ai-aanroep-architectuur.md §5 voor de volledige motivatie.
 */

// ─── Codes ───────────────────────────────────────────────────────────────────
// Bewust een platte, stabiele enum: deze strings staan in mini-app-code van
// gebruikers en mogen dus NOOIT hernoemd worden. Nieuwe gevallen komen erbij,
// oude verdwijnen niet.
export const AI_ERROR_CODES = {
  // Configuratie / platform-guardrails -- altijd een bug of instelfout, nooit retrybaar.
  NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  INVALID_PROMPT: 'AI_INVALID_PROMPT',
  INVALID_SYSTEM: 'AI_INVALID_SYSTEM',
  INVALID_SCHEMA: 'AI_INVALID_SCHEMA',
  INVALID_MODEL: 'AI_INVALID_MODEL',
  UNKNOWN_PROVIDER: 'AI_UNKNOWN_PROVIDER',

  // Onze eigen rate-limits (lib/ai.js) -- niet retrybaar binnen de dag.
  RATE_LIMIT_APP: 'AI_RATE_LIMIT_APP',
  RATE_LIMIT_PLATFORM: 'AI_RATE_LIMIT_PLATFORM',

  // De provider zelf.
  PROVIDER_RATE_LIMITED: 'AI_PROVIDER_RATE_LIMITED',
  PROVIDER_OVERLOADED: 'AI_PROVIDER_OVERLOADED',
  PROVIDER_AUTH: 'AI_PROVIDER_AUTH',
  PROVIDER_BAD_REQUEST: 'AI_PROVIDER_BAD_REQUEST',
  PROVIDER_TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  PROVIDER_UNREACHABLE: 'AI_PROVIDER_UNREACHABLE',
  PROVIDER_ERROR: 'AI_PROVIDER_ERROR',

  // Streaming-specifiek -- deze drie bestonden vóór het streaming-ontwerp niet en
  // zijn precies de gevallen die eerder allemaal als "timeout" aankwamen.
  STALLED: 'AI_STALLED',
  STREAM_INTERRUPTED: 'AI_STREAM_INTERRUPTED',
  ABORTED: 'AI_ABORTED',

  // Inhoud van het antwoord.
  TRUNCATED: 'AI_TRUNCATED',
  REFUSED: 'AI_REFUSED',
  EMPTY_RESPONSE: 'AI_EMPTY_RESPONSE',
  OUTPUT_INVALID_JSON: 'AI_OUTPUT_INVALID_JSON',

  // Brug/host-pagina (wordt door mini-apps-core.js gezet, staat hier zodat de
  // volledige enum op één plek te lezen is).
  BRIDGE_UNAVAILABLE: 'AI_BRIDGE_UNAVAILABLE',

  INTERNAL: 'AI_INTERNAL'
};

// In welke laag de fout ontstond -- puur diagnostisch, maar het scheelt in de
// audit-log en de browserconsole direct een zoektocht.
export const AI_ERROR_PHASES = {
  GUARDRAIL: 'guardrail',
  RATELIMIT: 'ratelimit',
  PROVIDER: 'provider',
  STREAM: 'stream',
  PARSE: 'parse',
  BRIDGE: 'bridge',
  INTERNAL: 'internal'
};

// Retrybaar = "dezelfde aanroep kan straks lukken zonder dat er iets aan de
// aanvraag hoeft te veranderen". Dus NIET AI_TRUNCATED (daar moet de aanroeper
// eerst maxOutputTokens verhogen of de batch verkleinen) en NIET onze eigen
// daglimieten (die lopen pas na 24u af -- opnieuw proberen is daar zinloos en
// zou de audit-log vervuilen).
const RETRYABLE_CODES = new Set([
  AI_ERROR_CODES.PROVIDER_RATE_LIMITED,
  AI_ERROR_CODES.PROVIDER_OVERLOADED,
  AI_ERROR_CODES.PROVIDER_TIMEOUT,
  AI_ERROR_CODES.PROVIDER_UNREACHABLE,
  AI_ERROR_CODES.PROVIDER_ERROR,
  AI_ERROR_CODES.STALLED,
  AI_ERROR_CODES.STREAM_INTERRUPTED,
  AI_ERROR_CODES.OUTPUT_INVALID_JSON
]);

// Welke HTTP-status de Worker-route teruggeeft per code. Vóór deze wijziging gaf
// routes.js "alles met een code" een 400, waardoor een rate-limit en een bug in
// de prompt er voor de client identiek uitzagen -- en waardoor een 429 geen
// Retry-After-header kon meekrijgen.
const HTTP_STATUS_BY_CODE = {
  [AI_ERROR_CODES.NOT_CONFIGURED]: 503,
  [AI_ERROR_CODES.INVALID_PROMPT]: 400,
  [AI_ERROR_CODES.INVALID_SYSTEM]: 400,
  [AI_ERROR_CODES.INVALID_SCHEMA]: 400,
  [AI_ERROR_CODES.INVALID_MODEL]: 400,
  [AI_ERROR_CODES.UNKNOWN_PROVIDER]: 500,
  [AI_ERROR_CODES.RATE_LIMIT_APP]: 429,
  [AI_ERROR_CODES.RATE_LIMIT_PLATFORM]: 429,
  [AI_ERROR_CODES.PROVIDER_RATE_LIMITED]: 429,
  [AI_ERROR_CODES.PROVIDER_OVERLOADED]: 503,
  [AI_ERROR_CODES.PROVIDER_AUTH]: 502,
  [AI_ERROR_CODES.PROVIDER_BAD_REQUEST]: 502,
  [AI_ERROR_CODES.PROVIDER_TIMEOUT]: 504,
  [AI_ERROR_CODES.PROVIDER_UNREACHABLE]: 502,
  [AI_ERROR_CODES.PROVIDER_ERROR]: 502,
  [AI_ERROR_CODES.STALLED]: 504,
  [AI_ERROR_CODES.STREAM_INTERRUPTED]: 502,
  [AI_ERROR_CODES.ABORTED]: 499,
  [AI_ERROR_CODES.TRUNCATED]: 422,
  [AI_ERROR_CODES.REFUSED]: 422,
  [AI_ERROR_CODES.EMPTY_RESPONSE]: 502,
  [AI_ERROR_CODES.OUTPUT_INVALID_JSON]: 502,
  [AI_ERROR_CODES.INTERNAL]: 500
};

/**
 * Bouwt een Error met het volledige contract erop. Altijd deze functie gebruiken
 * i.p.v. `new Error()` + losse `.code`, zodat retryable/phase/http nooit ergens
 * vergeten worden.
 *
 * @param {string} code            Een waarde uit AI_ERROR_CODES
 * @param {string} message         Leesbaar Nederlands voor de eindgebruiker
 * @param {Object} [extra]
 * @param {string} [extra.phase]           AI_ERROR_PHASES-waarde
 * @param {number} [extra.retryAfterMs]    Hoelang wachten vóór een retry zin heeft
 * @param {number} [extra.providerStatus]  HTTP-status die de provider gaf
 * @param {string} [extra.requestId]       request-id-header van de provider (support!)
 * @param {string} [extra.stopReason]      stop_reason van het model, indien bekend
 * @param {Error}  [extra.cause]
 * @returns {Error}
 */
export function aiError(code, message, extra = {}) {
  const err = new Error(message);
  err.name = 'AiError';
  err.code = code;
  err.retryable = RETRYABLE_CODES.has(code);
  err.phase = extra.phase || AI_ERROR_PHASES.INTERNAL;
  err.httpStatus = HTTP_STATUS_BY_CODE[code] || 500;
  if (extra.retryAfterMs != null) err.retryAfterMs = extra.retryAfterMs;
  if (extra.providerStatus != null) err.providerStatus = extra.providerStatus;
  if (extra.requestId) err.requestId = extra.requestId;
  if (extra.stopReason) err.stopReason = extra.stopReason;
  if (extra.cause) err.cause = extra.cause;
  return err;
}

/**
 * Serialiseert een fout naar het object dat over de lijn gaat -- gebruikt door
 * zowel de JSON-foutrespons als het SSE `error`-event, zodat beide paden exact
 * hetzelfde contract hebben en een mini-app niet hoeft te weten via welk
 * transport de fout kwam.
 *
 * @param {Error} err
 * @returns {Object}
 */
export function serializeAiError(err) {
  const code = err && err.code && String(err.code).startsWith('AI_')
    ? err.code
    : AI_ERROR_CODES.INTERNAL;
  return {
    error: (err && err.message) || 'Onbekende AI-fout.',
    code,
    retryable: err && typeof err.retryable === 'boolean' ? err.retryable : RETRYABLE_CODES.has(code),
    ...(err && err.retryAfterMs != null ? { retryAfterMs: err.retryAfterMs } : {}),
    phase: (err && err.phase) || AI_ERROR_PHASES.INTERNAL,
    ...(err && err.providerStatus != null ? { providerStatus: err.providerStatus } : {}),
    ...(err && err.requestId ? { requestId: err.requestId } : {}),
    ...(err && err.stopReason ? { stopReason: err.stopReason } : {})
  };
}

/**
 * HTTP-status voor een fout, met een veilige val-terug voor fouten die niet uit
 * dit contract komen (bv. een onverwachte Supabase-fout in de rate-limit-check).
 * @param {Error} err
 * @returns {number}
 */
export function httpStatusForAiError(err) {
  if (err && Number.isFinite(err.httpStatus)) return err.httpStatus;
  if (err && HTTP_STATUS_BY_CODE[err.code]) return HTTP_STATUS_BY_CODE[err.code];
  return 500;
}

/**
 * Vertaalt een HTTP-status van een AI-provider naar onze code. Eén plek, zodat
 * anthropic.js en gemini.js niet elk hun eigen (afwijkende) mapping hebben --
 * dat was eerder wél zo: beide kenden enkel 429 en "de rest".
 *
 * @param {number} status
 * @returns {string}
 */
export function codeForProviderStatus(status) {
  if (status === 429) return AI_ERROR_CODES.PROVIDER_RATE_LIMITED;
  if (status === 529 || status === 503) return AI_ERROR_CODES.PROVIDER_OVERLOADED;
  if (status === 401 || status === 403) return AI_ERROR_CODES.PROVIDER_AUTH;
  if (status === 400 || status === 413 || status === 404 || status === 409) return AI_ERROR_CODES.PROVIDER_BAD_REQUEST;
  if (status === 504 || status === 408) return AI_ERROR_CODES.PROVIDER_TIMEOUT;
  return AI_ERROR_CODES.PROVIDER_ERROR;
}

/**
 * Leest de `retry-after`-header (seconden óf een HTTP-datum, beide zijn geldig)
 * en geeft milliseconden terug. Zonder deze waarde moet een mini-app gokken hoe
 * lang ze moet wachten na een 429 -- Actiebladen Insights deed dat met een vaste
 * 1.200 ms, wat bij een echte Anthropic-rate-limit gegarandeerd te kort is.
 *
 * @param {Headers} headers
 * @returns {number|null}
 */
export function retryAfterMsFromHeaders(headers) {
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

/**
 * Mapt het `stop_reason` van het model op een code, of null als er niets aan de
 * hand is. `max_tokens` is hier het belangrijkste geval: dat betekende voorheen
 * een stil AFGEKAPT antwoord dat als "geldig" door de parser ging (bij NDJSON:
 * een halve laatste regel), terwijl de juiste actie "vraag meer output-tokens"
 * is -- niet "probeer opnieuw".
 *
 * @param {string|null} stopReason
 * @returns {string|null}
 */
export function codeForStopReason(stopReason) {
  if (stopReason === 'max_tokens') return AI_ERROR_CODES.TRUNCATED;
  if (stopReason === 'refusal') return AI_ERROR_CODES.REFUSED;
  return null;
}
