/**
 * Mini-Apps — AI-provider: Anthropic (Claude Messages API), STREAMEND
 *
 * Zelfde contract als ai-providers/gemini.js: één `generate()` die een prompt
 * (+ optionele system-instructie) naar Claude stuurt en het antwoord +
 * tokencounts teruggeeft in de vorm die lib/ai.js provider-onafhankelijk
 * verwerkt. Draait op het bestaande Claude-abonnement van het team (eigen
 * ANTHROPIC_API_KEY, geen gratis/train-on-data-laag zoals bij Gemini).
 *
 * ─── Waarom dit ALTIJD streamt (2026-08, herziening) ────────────────────────
 * Tot deze wijziging deed dit bestand één NIET-streamende fetch en wachtte het
 * op het volledige antwoord. Dat leverde nul bytes tot het antwoord af was,
 * waardoor geen enkele laag erboven kon weten of Claude nog werkte of de
 * verbinding dood was. De enige timeout in de keten stond daarom clientside in
 * public/mini-apps-core.js, geschat op basis van het GEVRAAGDE maximum aantal
 * output-tokens -- een gok die per definitie fout schaalt (de duur hangt af van
 * wat er WERKELIJK gegenereerd wordt) en die drie keer op rij opgetrokken is
 * (45s -> 180s -> 300s) telkens nadat er iets misliep. Erger: die clientside
 * timeout annuleerde niets. De Worker liep door, Claude genereerde door, de
 * rate-limit en de kosten werden verbruikt, en het antwoord kwam aan bij een
 * promise die niemand meer vasthield.
 *
 * Met stream:true komen er continu SSE-events binnen (`content_block_delta`, en
 * `ping` juist tijdens stiltes). Daarmee wordt de onmogelijke vraag "hoe lang
 * gaat dit in totaal duren?" vervangen door de meetbare vraag "is er de laatste
 * N seconden iets gebeurd?" -- zie STALL. Anthropic's eigen documentatie schrijft
 * streaming trouwens voor bij grote max_tokens, precies om deze reden (netwerken
 * laten idle verbindingen vallen); wij zaten met 8192 in die zone.
 *
 * Zie ONTWERP-ai-aanroep-architectuur.md §1 en §3.
 */

import {
  AI_ERROR_CODES,
  AI_ERROR_PHASES,
  aiError,
  codeForProviderStatus,
  codeForStopReason,
  retryAfterMsFromHeaders
} from '../ai-errors.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Overschrijfbaar via env.ANTHROPIC_MODEL.
// claude-sonnet-5 i.p.v. het oude claude-sonnet-4-6: goedkoper op input
// ($2 vs $3 per MTok), 1M context, 128k output, en inhoudelijk beter. Voor
// classificatie-achtige taken (weinig output, gesloten antwoordruimte) roept
// lib/ai.js hier expliciet claude-haiku-4-5 aan -- zie de model-allowlist daar.
export const DEFAULT_MODEL = 'claude-sonnet-5';

// Inactiviteits-timeout: hoelang mag het STIL zijn (geen enkel SSE-event, ook
// geen ping) voordat we de verbinding als dood beschouwen? Dit is bewust een
// vaste waarde die NIET van de gevraagde output-lengte afhangt -- dat is precies
// het verschil met de oude clientside cap. Anthropic stuurt pings tijdens het
// genereren, dus 60s stilte betekent echt "er komt niets meer".
const DEFAULT_STALL_TIMEOUT_MS = 60000;

// ─── JSON-schema opschonen voor structured outputs ──────────────────────────
// Anthropic's constrained decoding ondersteunt standaard JSON Schema, maar
// ZONDER de pure validatie-constraints. Een schema met `maxItems` levert een
// harde 400 op: "For 'array' type, property 'maxItems' is not supported".
// Anthropic's eigen officiele SDK's lossen dit op door die keywords te
// verwijderen en de bedoeling in de field-description te zetten; dit doet
// hetzelfde, zodat een mini-app-bouwer een normaal JSON-schema kan schrijven
// zonder deze lijst uit het hoofd te kennen.
//
// GRENS van wat hier weggehaald mag worden: uitsluitend constraints waarvan het
// verwijderen de VORM van een geldig antwoord niet verandert, alleen de
// strengheid. `type`, `properties`, `required`, `items`, `enum`,
// `additionalProperties` en de compositie-keywords ($ref/oneOf/anyOf/allOf)
// blijven dus altijd staan -- die stil weghalen zou de betekenis van het schema
// veranderen, en dat is erger dan een leesbare 400. Wordt zo'n structureel
// keyword niet ondersteund, dan komt dat nu als AI_PROVIDER_BAD_REQUEST met de
// exacte melding van Anthropic naar boven, wat wél te debuggen is.
const UNSUPPORTED_SCHEMA_KEYWORDS = [
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern',
  'minItems', 'maxItems', 'uniqueItems',
  'minProperties', 'maxProperties',
  'default', 'examples'
];

/**
 * Geeft een DIEPE KOPIE van het schema terug zonder de niet-ondersteunde
 * constraints, met de verwijderde beperkingen als leesbare notitie achter de
 * `description` (zodat het model de bedoeling nog kent, ook al wordt ze niet
 * meer hard afgedwongen). Het meegegeven schema wordt nooit gemuteerd -- een
 * mini-app hergebruikt zijn schema-object typisch over meerdere batches.
 *
 * @param {any} node
 * @returns {any}
 */
export function sanitizeSchemaForStructuredOutput(node) {
  if (Array.isArray(node)) return node.map(sanitizeSchemaForStructuredOutput);
  if (node === null || typeof node !== 'object') return node;

  const out = {};
  const stripped = [];
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.indexOf(key) !== -1) {
      stripped.push(`${key}=${JSON.stringify(value)}`);
      continue;
    }
    out[key] = sanitizeSchemaForStructuredOutput(value);
  }

  if (stripped.length > 0) {
    const note = `Beperkingen (niet hard afgedwongen, wel te respecteren): ${stripped.join(', ')}.`;
    out.description = out.description ? `${out.description} ${note}` : note;
  }
  return out;
}

/**
 * Parseert een SSE-bytestream naar losse `{event, data}`-objecten.
 *
 * Bewust een eigen mini-parser i.p.v. een bibliotheek: het formaat is triviaal
 * (velden per regel, berichten gescheiden door een lege regel) en een Worker
 * heeft geen EventSource voor uitgaande fetches. Belangrijk detail: chunks van
 * `fetch` breken WILLEKEURIG af, ook midden in een regel of midden in een
 * UTF-8-teken -- daarom een buffer per bericht (split op '\n\n') én
 * `TextDecoder` met `{stream: true}`, nooit per chunk apart decoderen.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @param {() => void} onActivity  Wordt bij ELKE ontvangen chunk aangeroepen
 *                                 (ook bij een ping of een half bericht), zodat
 *                                 de stall-timer op echt netwerkverkeer reset en
 *                                 niet enkel op nuttige tekst.
 * @returns {AsyncGenerator<{event: string, data: Object}>}
 */
async function* readSseEvents(body, onActivity) {
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

        let eventName = 'message';
        const dataLines = [];
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          // ':'-regels zijn SSE-commentaar (heartbeat) -- negeren, maar ze
          // hebben via onActivity hierboven al hun werk gedaan.
        }
        if (dataLines.length === 0) continue;

        const payload = dataLines.join('\n');
        if (payload === '[DONE]') return;
        try {
          yield { event: eventName, data: JSON.parse(payload) };
        } catch (_err) {
          // Een onparseerbaar data-blok is geen reden om de hele stream te laten
          // vallen (het kan een onbekend/nieuw eventtype zijn) -- overslaan.
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_err) { /* al vrijgegeven */ }
  }
}

/**
 * @param {Object} params
 * @param {Object} params.env                  Worker env (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
 * @param {string} [params.model]              Overschrijft env.ANTHROPIC_MODEL / DEFAULT_MODEL
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {number} [params.maxOutputTokens]
 * @param {Object} [params.schema]             JSON-schema; dwingt geldige JSON af
 *                                             (output_config.format) i.p.v. erop te hopen
 * @param {boolean} [params.cacheSystem]       cache_control op de system-instructie
 * @param {(delta: string, info: Object) => void} [params.onDelta]  Per tekstfragment
 * @param {AbortSignal} [params.signal]        Afbreken door de aanroeper
 * @param {number} [params.stallTimeoutMs]
 * @returns {Promise<{text: string, json: Object|null, tokensIn: number|null, tokensOut: number|null,
 *                    cacheReadTokens: number|null, cacheWriteTokens: number|null,
 *                    model: string, stopReason: string|null, requestId: string|null}>}
 */
export async function generate({
  env, model, prompt, system, maxOutputTokens, schema, cacheSystem,
  onDelta, signal, stallTimeoutMs, onProviderEvent, thinking
}) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw aiError(
      AI_ERROR_CODES.NOT_CONFIGURED,
      'AI-functionaliteit is nog niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt).',
      { phase: AI_ERROR_PHASES.GUARDRAIL }
    );
  }

  const resolvedModel = model || env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const body = {
    model: resolvedModel,
    max_tokens: maxOutputTokens,
    stream: true,
    messages: [{ role: 'user', content: prompt }]
  };
  if (system) {
    // Als tekstblok-array i.p.v. platte string zodra we willen cachen: enkel in
    // die vorm kan er een cache_control-breakpoint op. Let op de minima
    // (Sonnet 5: 1.024 tokens) -- daaronder slaat Anthropic caching STIL over,
    // dus `cacheSystem` op een korte instructie kost niets maar levert ook niets.
    body.system = cacheSystem
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
  }
  /* ─── Redeneren (extended thinking) uitdrukkelijk UIT ─────────────────────
     Waarom dit hier staat, in detail, want het heeft ons een avond gekost: de
     diagnose van 21/08 toonde status 200, `message_start` met 15.876 in-tokens,
     dan `content_block_start` van het type **thinking** -- en daarna 20+
     seconden geen enkele delta, ook geen redeneerfragment. De mini-app zag dus
     een open stream zonder inhoud, en de brug kapte na twee minuten af.
     Bij de nieuwere modellen staat redeneren AAN wanneer je er niets over zegt,
     en dan gaat het (grote) max_tokens-budget eerst naar een denkblok. Voor
     deze aanroepen is dat in alle opzichten verkeerd: we vragen een JSON-object
     volgens een schema, we willen die redenering niet zien, we betalen ze wel,
     en ze duwt het eigenlijke antwoord voorbij elke redelijke wachttijd.
     Wil je het ooit terug: geef `thinking: true` mee, en zet er dan een ruimere
     stall-timeout naast -- een denkend model stuurt lang niets bruikbaars.
     Kent een model dit veld niet (400 met "thinking" in de melding), dan gaat
     de aanroep hieronder nog één keer zonder dat veld. */
  body.thinking = thinking === true
    ? { type: 'enabled', budget_tokens: Math.max(1024, Math.floor(maxOutputTokens / 2)) }
    : { type: 'disabled' };

  if (schema) {
    // Structured outputs: constrained decoding, dus GEGARANDEERD geldige JSON
    // volgens dit schema. Vervangt de zelfgeparste NDJSON-tekst (regex +
    // fallbackparser + per-regel-foutboekhouding) die mini-apps eerder nodig
    // hadden. Geen beta-header vereist; niet combineerbaar met prefilling of
    // citations (gebruiken we niet).
    // ALTIJD via de sanitizer: een schema komt uit mini-app-code en mag geen
    // cryptieke 400 opleveren omdat er een `maxLength` in staat.
    body.output_config = {
      format: { type: 'json_schema', schema: sanitizeSchemaForStructuredOutput(schema) }
    };
  }

  // ─── Stall-detectie ────────────────────────────────────────────────────────
  // Eigen AbortController die de fetch/stream écht afbreekt zodra er te lang
  // niets gebeurt. Dit is de vervanging van de clientside timeout-cap: hier
  // stoppen we de aanroep bij de bron (dus ook de kosten), i.p.v. clientside
  // een promise te laten vallen terwijl alles doorloopt.
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

  const melden = typeof onProviderEvent === 'function' ? onProviderEvent : () => {};
  let resp;
  armStallTimer();
  melden(`POST naar ${API_URL} (max_tokens ${maxOutputTokens}, redeneren ${body.thinking && body.thinking.type === 'enabled' ? 'aan' : 'uit'})`);
  const doePost = () => fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify(body),
    signal: controller.signal
  });
  try {
    resp = await doePost();
    /* Kent dit model het thinking-veld niet? Dan één keer zonder, i.p.v. de
       aanroeper met een cryptieke 400 opzadelen. Enkel bij een 400 die het veld
       ook echt noemt -- elke andere 400 hoort gewoon gemeld te worden. */
    if (resp.status === 400 && body.thinking) {
      let melding = '';
      try { melding = (await resp.clone().json())?.error?.message || ''; } catch (_e) { /* geen JSON */ }
      if (/thinking/i.test(melding)) {
        melden(`model kent het thinking-veld niet (${melding.slice(0, 120)}) -- opnieuw zonder`);
        delete body.thinking;
        resp = await doePost();
      }
    }
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
        `Claude reageerde ${Math.round(stallMs / 1000)}s lang niet -- de verbinding is afgebroken zonder dat er iets ontvangen werd.`,
        { phase: AI_ERROR_PHASES.PROVIDER }
      );
    }
    throw aiError(AI_ERROR_CODES.PROVIDER_UNREACHABLE, `Claude API onbereikbaar: ${err.message}`, {
      phase: AI_ERROR_PHASES.PROVIDER,
      cause: err
    });
  }

  // request-id altijd bewaren: dit is het enige nummer waarmee Anthropic-support
  // een aanroep kan terugvinden, en het hoort dus ook bij een fout thuis.
  const requestId = resp.headers.get('request-id') || null;
  melden(`provider antwoordde met status ${resp.status} (request-id ${requestId || 'geen'})`);

  if (!resp.ok) {
    disarmStallTimer();
    let detail = '';
    let providerErrorType = '';
    try {
      const errJson = await resp.json();
      detail = errJson?.error?.message || '';
      providerErrorType = errJson?.error?.type || '';
    } catch (_err) { /* geen JSON-body -- negeren */ }

    const code = codeForProviderStatus(resp.status);
    const retryAfterMs = retryAfterMsFromHeaders(resp.headers);
    const hint = code === AI_ERROR_CODES.PROVIDER_RATE_LIMITED
      ? ' -- dit is de rate-limit van Anthropic zelf, niet onze daglimiet.'
      : code === AI_ERROR_CODES.PROVIDER_OVERLOADED
        ? ' -- Claude is tijdelijk overbelast; opnieuw proberen helpt meestal.'
        : '';
    throw aiError(
      code,
      `Claude API-fout (${resp.status}${providerErrorType ? `/${providerErrorType}` : ''})${detail ? `: ${detail}` : ''}${hint}`,
      { phase: AI_ERROR_PHASES.PROVIDER, providerStatus: resp.status, requestId, retryAfterMs }
    );
  }

  if (!resp.body) {
    disarmStallTimer();
    throw aiError(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Claude gaf een antwoord zonder inhoud (geen stream).', {
      phase: AI_ERROR_PHASES.STREAM,
      requestId
    });
  }

  // ─── De stream lezen ───────────────────────────────────────────────────────
  let text = '';
  let tokensIn = null;
  let tokensOut = null;
  let cacheReadTokens = null;
  let cacheWriteTokens = null;
  let stopReason = null;
  let sawMessageStop = false;
  /* Wat de stream ons effectief stuurde. Nodig omdat de vorige versie ENKEL
     `delta.text` las: kwam de inhoud in een ander soort delta binnen, dan bleef
     `text` leeg en gebeurde er verder niets zichtbaars -- geen fragment, geen
     fout, minuten stilte, en achteraf een kale "geen bruikbaar antwoord".
     Precies dat beeld gaf de diagnose van 21/08: status 200, message_start met
     15.876 in-tokens, en daarna niets. Deze twee tellers maken dat voortaan
     zichtbaar in de foutmelding zelf. */
  /* Bovengrens op "de stream leeft, maar er komt geen bruikbare inhoud".
     De stall-timer alleen dekt dit NIET: die wordt bij elk SSE-event opnieuw
     gewapend, en ping-events of een lang denkblok houden hem dus eeuwig warm --
     precies waarom de aanroep van 21/08 minuten kon blijven staan zonder fout
     en zonder inhoud. Deze timer loopt vanaf message_start tot het eerste
     bruikbare fragment, en maakt van dat stille geval een NETTE, leesbare fout
     in plaats van een hangende app. */
  const FIRST_CONTENT_TIMEOUT_MS = 90000;
  let geenInhoudTimer = null;
  let geenInhoud = false;
  const armFirstContentTimer = () => {
    if (geenInhoudTimer) return;
    geenInhoudTimer = setTimeout(() => {
      geenInhoud = true;
      try { controller.abort(); } catch (_err) { /* al afgebroken */ }
    }, FIRST_CONTENT_TIMEOUT_MS);
  };
  const disarmFirstContentTimer = () => {
    if (geenInhoudTimer) clearTimeout(geenInhoudTimer);
    geenInhoudTimer = null;
  };

  const blokTypes = [];
  const gemeldeTypes = new Set();
  let denkTekens = 0;
  let laatsteDenkMelding = 0;

  try {
    for await (const { event, data } of readSseEvents(resp.body, armStallTimer)) {
      if (event === 'error' || data?.type === 'error') {
        const providerType = data?.error?.type || '';
        const code = providerType === 'overloaded_error'
          ? AI_ERROR_CODES.PROVIDER_OVERLOADED
          : providerType === 'rate_limit_error'
            ? AI_ERROR_CODES.PROVIDER_RATE_LIMITED
            : AI_ERROR_CODES.PROVIDER_ERROR;
        throw aiError(
          code,
          `Claude meldde een fout tijdens het genereren${data?.error?.message ? `: ${data.error.message}` : ''}.`,
          { phase: AI_ERROR_PHASES.STREAM, requestId }
        );
      }

      const type = data?.type || event;

      if (type === 'message_start') {
        const usage = data?.message?.usage || {};
        tokensIn = usage.input_tokens ?? null;
        cacheReadTokens = usage.cache_read_input_tokens ?? null;
        cacheWriteTokens = usage.cache_creation_input_tokens ?? null;
        // Sommige antwoorden melden hier al output_tokens (meestal 0/1).
        if (usage.output_tokens != null) tokensOut = usage.output_tokens;
        melden(`stream begonnen (message_start, ${tokensIn ?? '?'} in-tokens${cacheReadTokens ? `, ${cacheReadTokens} uit cache` : ''})`);
        armFirstContentTimer();
      } else if (type === 'content_block_start') {
        /* Welk soort blok begint hier: text, thinking, tool_use, ... Dit stond
           er niet, en dat was precies het gat: een `thinking`-blok ziet er in de
           stream identiek uit aan stilte zolang je enkel naar delta.text kijkt. */
        const bt = data?.content_block?.type || 'onbekend';
        blokTypes.push(bt);
        melden(`blok begonnen: ${bt}`);
      } else if (type === 'content_block_delta') {
        const dlt = data?.delta || {};
        const dtype = dlt.type || 'onbekend';
        /* Alle vormen waarin inhoud kan binnenkomen:
           - text_delta         gewone tekst (en, bij structured outputs, de JSON)
           - input_json_delta   JSON in stukken (`partial_json`) -- de vorm die
                                de API gebruikt wanneer de uitvoer via een
                                schema/tool afgedwongen wordt
           - thinking_delta     redeneerstappen; die horen NIET in het antwoord,
                                maar zijn wel een levensteken: een model dat een
                                minuut nadenkt hoort niet als "stilte" te tellen. */
        if (dtype === 'thinking_delta' || typeof dlt.thinking === 'string') {
          denkTekens += (dlt.thinking || '').length;
          // Hoogstens één melding per 2s, anders overstemt dit de logs.
          if (Date.now() - laatsteDenkMelding > 2000) {
            laatsteDenkMelding = Date.now();
            melden(`model denkt nog (${denkTekens} tekens redenering, nog geen antwoord)`);
          }
          armStallTimer();
          continue;
        }
        const piece = typeof dlt.text === 'string' && dlt.text
          ? dlt.text
          : (typeof dlt.partial_json === 'string' ? dlt.partial_json : '');
        /* Een deltavorm die we niet kennen mag nooit stil blijven: dan lijkt het
           wéér alsof er niets gebeurt terwijl er data op de lijn staat. Eén
           melding per soort, met de veldnamen erbij. */
        if (!piece && !gemeldeTypes.has(dtype)) {
          gemeldeTypes.add(dtype);
          melden(`deltavorm zonder bruikbare inhoud: ${dtype} (velden: ${Object.keys(dlt).join(', ') || 'geen'})`);
        }
        if (piece) {
          if (!text) { disarmFirstContentTimer(); melden(`eerste inhoudsfragment ontvangen (${dtype})`); }
          text += piece;
          if (onDelta) {
            try {
              onDelta(piece, { text, outputTokens: tokensOut });
            } catch (_err) {
              // Een fout in de voortgangs-callback mag de AI-aanroep nooit
              // laten mislukken -- het antwoord zelf is het product.
            }
          }
        }
      } else if (type === 'message_delta') {
        // usage.output_tokens in message_delta is CUMULATIEF, niet incrementeel.
        if (data?.usage?.output_tokens != null) tokensOut = data.usage.output_tokens;
        if (data?.delta?.stop_reason) stopReason = data.delta.stop_reason;
      } else if (type === 'message_stop') {
        sawMessageStop = true;
      }
    }
  } catch (err) {
    disarmStallTimer();
    disarmFirstContentTimer();
    if (err && err.name === 'AiError') throw err;
    if (geenInhoud) {
      /* Het geval van 21/08, nu met naam en toenaam i.p.v. een hangende app. */
      throw aiError(
        AI_ERROR_CODES.EMPTY_RESPONSE,
        `Claude hield de verbinding ${Math.round(FIRST_CONTENT_TIMEOUT_MS / 1000)}s open zonder één bruikbaar fragment te sturen`
          + ` -- blokken: ${blokTypes.length ? blokTypes.join(', ') : '(geen)'}`
          + `${denkTekens ? `, ${denkTekens} tekens redenering` : ''}. Aanroep afgebroken.`,
        { phase: AI_ERROR_PHASES.STREAM, requestId, stopReason }
      );
    }
    if (abortedByCaller) {
      throw aiError(AI_ERROR_CODES.ABORTED, 'AI-aanroep afgebroken door de aanroeper.', {
        phase: AI_ERROR_PHASES.STREAM,
        requestId
      });
    }
    if (stalled) {
      // Dit is het geval dat vroeger als "Verzoek verliep (timeout)" bij de
      // mini-app aankwam -- nu expliciet, met de al ontvangen tekst erbij zodat
      // een aanroeper desnoods kan bergen wat er is.
      const err2 = aiError(
        AI_ERROR_CODES.STALLED,
        `Claude stuurde ${Math.round(stallMs / 1000)}s lang niets meer terug -- aanroep afgebroken (er was al ${text.length} tekens ontvangen).`,
        { phase: AI_ERROR_PHASES.STREAM, requestId }
      );
      err2.partialText = text;
      throw err2;
    }
    const err3 = aiError(
      AI_ERROR_CODES.STREAM_INTERRUPTED,
      `De verbinding met Claude brak af tijdens het genereren: ${err.message}`,
      { phase: AI_ERROR_PHASES.STREAM, requestId, cause: err }
    );
    err3.partialText = text;
    throw err3;
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
      phase: AI_ERROR_PHASES.STREAM,
      requestId
    });
  }
  if (stalled) {
    const stallErr2 = aiError(
      AI_ERROR_CODES.STALLED,
      `Claude stuurde ${Math.round(stallMs / 1000)}s lang niets meer terug -- aanroep afgebroken (er was al ${text.length} tekens ontvangen).`,
      { phase: AI_ERROR_PHASES.STREAM,
      requestId }
    );
    stallErr2.partialText = text;
    throw stallErr2;
  }

  disarmFirstContentTimer();

  if (!sawMessageStop) {
    // De stream eindigde zonder message_stop: het antwoord is per definitie
    // onvolledig. Vroeger was dit onzichtbaar (een niet-streamende fetch die
    // halverwege afbrak gaf simpelweg kapotte JSON aan de parser).
    const err = aiError(
      AI_ERROR_CODES.STREAM_INTERRUPTED,
      'De stream van Claude eindigde onverwacht -- het antwoord is onvolledig.',
      { phase: AI_ERROR_PHASES.STREAM, requestId }
    );
    err.partialText = text;
    throw err;
  }

  // stop_reason vóór de inhoudscontrole: een afgekapt antwoord (max_tokens) is
  // een ANDER probleem dan een leeg antwoord, en vraagt een andere reactie
  // (meer output-tokens / kleinere batch, niet "opnieuw proberen").
  const stopCode = codeForStopReason(stopReason);
  if (stopCode === AI_ERROR_CODES.TRUNCATED) {
    const err = aiError(
      AI_ERROR_CODES.TRUNCATED,
      `Het antwoord van Claude is afgekapt omdat de limiet van ${maxOutputTokens} output-tokens bereikt werd. Vraag meer output-tokens of verklein de batch.`,
      { phase: AI_ERROR_PHASES.PROVIDER, requestId, stopReason }
    );
    err.partialText = text;
    err.tokensIn = tokensIn;
    err.tokensOut = tokensOut;
    throw err;
  }
  if (stopCode === AI_ERROR_CODES.REFUSED) {
    throw aiError(AI_ERROR_CODES.REFUSED, 'Claude heeft geweigerd op deze vraag te antwoorden.', {
      phase: AI_ERROR_PHASES.PROVIDER,
      requestId,
      stopReason
    });
  }

  if (!text) {
    /* Met de blok-types en het aantal denk-tekens erbij is dit geen raadsel meer:
       "blokken: thinking" betekent dat het model enkel geredeneerd heeft,
       "blokken: (geen)" dat er echt niets kwam. */
    throw aiError(
      AI_ERROR_CODES.EMPTY_RESPONSE,
      `Claude gaf geen bruikbaar antwoord terug${stopReason ? ` (${stopReason})` : ''}`
        + ` -- blokken: ${blokTypes.length ? blokTypes.join(', ') : '(geen)'}`
        + `${denkTekens ? `, ${denkTekens} tekens redenering` : ''}.`,
      { phase: AI_ERROR_PHASES.PROVIDER, requestId, stopReason }
    );
  }

  // Bij een schema is geldige JSON gegarandeerd door de API zelf; we parsen hier
  // enkel nog. Faalt dat toch, dan is dat een echte anomalie en geen reden om de
  // aanroeper met een tekstblob op te zadelen die hij niet verwacht.
  let json = null;
  if (schema) {
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw aiError(
        AI_ERROR_CODES.OUTPUT_INVALID_JSON,
        `Claude gaf geen geldige JSON terug ondanks een schema: ${err.message}`,
        { phase: AI_ERROR_PHASES.PARSE, requestId, cause: err }
      );
    }
  }

  return {
    text,
    json,
    tokensIn,
    tokensOut,
    cacheReadTokens,
    cacheWriteTokens,
    model: resolvedModel,
    stopReason,
    requestId
  };
}
