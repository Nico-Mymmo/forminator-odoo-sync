// Houdt BUILD_PROMPT (public/mini-apps-list.js) gelijk met wat het platform
// werkelijk kan. Dat is geen cosmetische zorg: die prompt is wat een collega
// kopieert om een AI een nieuwe mini-app te laten bouwen, dus alles wat er NIET
// in staat, wordt in elke nieuwe app fout gedaan. Vóór 2026-08 stond er nog het
// oude contract in, waardoor elke gegenereerde app opnieuw JSON uit tekst zou
// vissen en op foutteksten zou matchen.
//
// De sterkste controle hieronder is de DRIFT-GUARD: elke AI_*-code die de prompt
// noemt moet echt bestaan in lib/ai-errors.js, en de codes die een mini-app
// moet kunnen afhandelen moeten in de prompt staan.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AI_ERROR_CODES } from '../lib/ai-errors.js';

const src = fs.readFileSync('public/mini-apps-list.js', 'utf8');
const marker = 'var BUILD_PROMPT = `';
const start = src.indexOf(marker);
assert.ok(start >= 0, 'BUILD_PROMPT niet gevonden');
const bodyStart = start + marker.length;
const end = src.indexOf('`;', bodyStart);
assert.ok(end > bodyStart, 'einde van BUILD_PROMPT niet gevonden');
const PROMPT = src.slice(bodyStart, end);

// Een NIET-ge-escapte ${ zou bij het laden van de pagina een interpolatie
// uitvoeren en de prompt stil vervormen. In de bron staan bewust een paar
// ge-escapte \${...} (voorbeeldcode die de gebruiker moet lezen als tekst) --
// die zijn correct, een onge-escapte niet.
const onveilig = [...PROMPT.matchAll(/(^|[^\\])\$\{/g)];
assert.deepEqual(onveilig.map(m => m[0]), [],
  'BUILD_PROMPT bevat een niet-ge-escapte template-interpolatie');

const results = [];
function t(name, fn) {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); }
}

t('documenteert het gestructureerde-output-pad (ask.json + schema)', () => {
  for (const s of ['ask.json(', 'schema:', 'additionalProperties', 'GEPARST object']) {
    assert.ok(PROMPT.includes(s), 'ontbreekt: ' + s);
  }
});

t('waarschuwt expliciet tegen een zelfgeschreven JSON-parser', () => {
  assert.match(PROMPT, /geen eigen JSON-parser/i);
  assert.match(PROMPT, /NDJSON/);
});

t('noemt welke schema-keywords NIET werken', () => {
  for (const kw of ['maxItems', 'maxLength', 'minimum', 'pattern']) {
    assert.ok(PROMPT.includes(kw), 'onvermeld keyword: ' + kw);
  }
  assert.match(PROMPT, /gebruik enum/i);
});

t('legt het foutcontract uit via err.code, niet via foutteksten', () => {
  for (const s of ['err.code', 'err.retryable', 'err.retryAfterMs', 'err.message']) {
    assert.ok(PROMPT.includes(s), 'ontbreekt: ' + s);
  }
  assert.match(PROMPT, /Match NOOIT op de fouttekst/i);
});

t('documenteert streaming/voortgang en belooft GEEN timeout-instelling', () => {
  assert.ok(PROMPT.includes('onProgress'));
  assert.match(PROMPT, /nooit een timeout in te stellen/i);
});

t('legt uit dat maxOutputTokens een plafond is, met de afleiding erbij', () => {
  assert.match(PROMPT, /PLAFOND, geen budget/);
  assert.ok(PROMPT.includes('batch_max = Math.floor((8192 - 500)'),
    'de afleiding van de batch-grootte ontbreekt');
});

t('staat splitsen alleen toe bij AI_TRUNCATED', () => {
  assert.match(PROMPT, /UITSLUITEND bij AI_TRUNCATED/);
  assert.match(PROMPT, /nooit bij een rate-limit/i);
});

t('noemt beide toegestane modellen en geen enkel ander', () => {
  assert.ok(PROMPT.includes('claude-sonnet-5'));
  assert.ok(PROMPT.includes('claude-haiku-4-5'));
  for (const verboden of ['claude-opus', 'claude-fable', 'claude-sonnet-4-6', 'gemini-']) {
    assert.ok(!PROMPT.includes(verboden), 'noemt een niet-toegestaan model: ' + verboden);
  }
});

t('noemt ask.full() voor het METEN van tokenverbruik', () => {
  assert.ok(PROMPT.includes('ask.full()'));
  assert.ok(PROMPT.includes('usage.tokensOut'));
});

t('de oude, misleidende voorbeeldregels zijn weg', () => {
  assert.ok(!PROMPT.includes('wordt sowieso begrensd server-side'),
    'de oude suggestie dat maxOutputTokens krap gezet moet worden staat er nog');
  assert.ok(!PROMPT.includes('antwoord is een platte string (het model-antwoord). Dit is bewust single-shot (GEEN chatgeschiedenis/multi-turn-geheugen) -- roep het per losse vraag aan, bewaar zelf in window.sharedStorage wat je van eerdere antwoorden wil onthouden. Max 25000 tokens per prompt (ruwe schatting: ±4 tekens/token), max 200 AI-aanroepen'),
    'de oude, onvolledige slotparagraaf staat er nog');
});

t('de grenzen in de prompt kloppen met lib/ai.js', () => {
  const aiSrc = fs.readFileSync('src/modules/mini-apps/lib/ai.js', 'utf8');
  const num = (re) => Number(aiSrc.match(re)[1]);
  const promptTokens = num(/MAX_PROMPT_TOKENS = (\d+)/);
  const outputCap = num(/MAX_OUTPUT_TOKENS_CAP = (\d+)/);
  const perApp = num(/MAX_PER_APP_PER_DAY = (\d+)/);
  assert.ok(PROMPT.includes(String(promptTokens)), 'prompt-tokencap ' + promptTokens + ' staat niet in de prompt');
  assert.ok(PROMPT.includes(String(outputCap)), 'output-cap ' + outputCap + ' staat niet in de prompt');
  assert.ok(PROMPT.includes(String(perApp)), 'daglimiet ' + perApp + ' staat niet in de prompt');
});

// ── DRIFT-GUARD, beide richtingen ─────────────────────────────────────────────
t('elke AI_*-code in de prompt bestaat echt in lib/ai-errors.js', () => {
  const bestaand = new Set(Object.values(AI_ERROR_CODES));
  const genoemd = [...new Set(PROMPT.match(/AI_[A-Z_]+/g) || [])];
  assert.ok(genoemd.length > 5, 'verdacht weinig foutcodes in de prompt: ' + genoemd.length);
  const verzonnen = genoemd.filter(c => !bestaand.has(c));
  assert.deepEqual(verzonnen, [], 'de prompt noemt niet-bestaande codes');
});

t('de codes die een mini-app MOET kunnen afhandelen staan in de prompt', () => {
  const verplicht = [
    AI_ERROR_CODES.TRUNCATED, AI_ERROR_CODES.RATE_LIMIT_APP, AI_ERROR_CODES.RATE_LIMIT_PLATFORM,
    AI_ERROR_CODES.STALLED, AI_ERROR_CODES.PROVIDER_RATE_LIMITED, AI_ERROR_CODES.PROVIDER_OVERLOADED,
    AI_ERROR_CODES.INVALID_SCHEMA, AI_ERROR_CODES.INVALID_MODEL, AI_ERROR_CODES.NOT_CONFIGURED
  ];
  const ontbreekt = verplicht.filter(c => !PROMPT.includes(c));
  assert.deepEqual(ontbreekt, [], 'niet gedocumenteerde codes');
});

t('elke platform.ai-methode uit de shim wordt in de prompt gedocumenteerd', () => {
  const core = fs.readFileSync('public/mini-apps-core.js', 'utf8');
  // wat de shim daadwerkelijk aanbiedt
  const heeft = {
    'ask(': core.includes("'function ask(prompt,options)"),
    'ask.full': core.includes("'ask.full=function"),
    'ask.json': core.includes("'ask.json=function")
  };
  for (const [naam, aanwezig] of Object.entries(heeft)) {
    assert.ok(aanwezig, 'shim mist ' + naam);
  }
  assert.ok(PROMPT.includes('ai.ask('), 'ask() niet gedocumenteerd');
  assert.ok(PROMPT.includes('ai.ask.json('), 'ask.json() niet gedocumenteerd');
  assert.ok(PROMPT.includes('ask.full()'), 'ask.full() niet gedocumenteerd');
});

let failed = 0;
for (const [s, n] of results) { console.log(s === 'ok' ? '  ✓ ' + n : '  ✗ ' + n); if (s !== 'ok') failed++; }
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
