// Functionele test van de streamende Anthropic-provider met een gestubde fetch.
// Doel: de nieuwe SSE-parser, stall-detectie, stop_reason-mapping en
// foutcodes echt uitvoeren i.p.v. enkel syntactisch te controleren.
import assert from 'node:assert/strict';
import { generate, sanitizeSchemaForStructuredOutput } from '../lib/ai-providers/anthropic.js';

const enc = new TextEncoder();
function sse(chunks, { status = 200, headers = {}, delayMs = 0, endWithoutClose = false } = {}) {
  return new Response(
    new ReadableStream({
      async start(c) {
        for (const ch of chunks) {
          if (delayMs) await new Promise(r => setTimeout(r, delayMs));
          c.enqueue(enc.encode(ch));
        }
        if (!endWithoutClose) c.close();
      }
    }),
    { status, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test123', ...headers } }
  );
}
const ev = (name, obj) => `event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`;
const env = { ANTHROPIC_API_KEY: 'k' };
let lastBody = null;
const stub = (resp) => { global.fetch = async (_u, o) => { lastBody = JSON.parse(o.body); return resp(); }; };

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); }
}

// 1 — happy path, met schema en deltas
await t('happy path: tekst, json, tokens, onDelta, cache-tokens', async () => {
  stub(() => sse([
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 120, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 0 } } }),
    ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"items":[' } }),
    ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"id":1,"gist":"kort"}]}' } }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } }),
    ev('message_stop', { type: 'message_stop' })
  ]));
  const deltas = [];
  const r = await generate({
    env, prompt: 'p', system: 's', maxOutputTokens: 500,
    schema: { type: 'object' }, cacheSystem: true,
    onDelta: (d) => deltas.push(d)
  });
  assert.equal(r.text, '{"items":[{"id":1,"gist":"kort"}]}');
  assert.deepEqual(r.json, { items: [{ id: 1, gist: 'kort' }] });
  assert.equal(r.tokensIn, 120);
  assert.equal(r.tokensOut, 42);
  assert.equal(r.cacheReadTokens, 900);
  assert.equal(r.stopReason, 'end_turn');
  assert.equal(r.requestId, 'req_test123');
  assert.equal(deltas.length, 2);
  // request-body-controle: streamt, heeft schema, en system als cachebaar blok
  assert.equal(lastBody.stream, true);
  assert.equal(lastBody.output_config.format.type, 'json_schema');
  assert.equal(lastBody.system[0].cache_control.type, 'ephemeral');
});

// 2 — SSE-berichten die MIDDEN in een chunk afbreken (het realistische geval)
await t('chunk-grenzen midden in een event worden correct gebufferd', async () => {
  const full = ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 1 } } })
    + ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hallo wereld' } })
    + ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } })
    + ev('message_stop', { type: 'message_stop' });
  const pieces = [];
  for (let i = 0; i < full.length; i += 7) pieces.push(full.slice(i, i + 7));
  stub(() => sse(pieces));
  const r = await generate({ env, prompt: 'p', maxOutputTokens: 100 });
  assert.equal(r.text, 'Hallo wereld');
});

// 3 — afgekapt antwoord: AI_TRUNCATED, niet "opnieuw proberen"
await t('stop_reason max_tokens -> AI_TRUNCATED met partialText', async () => {
  stub(() => sse([
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 10 } } }),
    ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"items":[{"id":1' } }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 500 } }),
    ev('message_stop', { type: 'message_stop' })
  ]));
  await assert.rejects(
    () => generate({ env, prompt: 'p', maxOutputTokens: 500, schema: { type: 'object' } }),
    (e) => {
      assert.equal(e.code, 'AI_TRUNCATED');
      assert.equal(e.retryable, false);
      assert.equal(e.partialText, '{"items":[{"id":1');
      assert.equal(e.httpStatus, 422);
      return true;
    }
  );
});

// 4 — 429 met retry-after
await t('429 -> AI_PROVIDER_RATE_LIMITED met retryAfterMs uit de header', async () => {
  global.fetch = async () => new Response(JSON.stringify({ error: { type: 'rate_limit_error', message: 'slow down' } }), {
    status: 429, headers: { 'retry-after': '21', 'request-id': 'req_x' }
  });
  await assert.rejects(() => generate({ env, prompt: 'p', maxOutputTokens: 10 }), (e) => {
    assert.equal(e.code, 'AI_PROVIDER_RATE_LIMITED');
    assert.equal(e.retryable, true);
    assert.equal(e.retryAfterMs, 21000);
    assert.equal(e.httpStatus, 429);
    assert.equal(e.requestId, 'req_x');
    return true;
  });
});

// 5 — 529 overloaded
await t('529 -> AI_PROVIDER_OVERLOADED (retrybaar)', async () => {
  global.fetch = async () => new Response('{}', { status: 529 });
  await assert.rejects(() => generate({ env, prompt: 'p', maxOutputTokens: 10 }), (e) => {
    assert.equal(e.code, 'AI_PROVIDER_OVERLOADED');
    assert.equal(e.retryable, true);
    return true;
  });
});

// 6 — stall: stilte tijdens de stream
await t('stilte tijdens de stream -> AI_STALLED met de al ontvangen tekst', async () => {
  stub(() => new Response(new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 5 } } })));
      c.enqueue(enc.encode(ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'begin...' } })));
      await new Promise(r => setTimeout(r, 5000)); // nooit meer iets
      c.close();
    }
  }), { status: 200 }));
  await assert.rejects(
    () => generate({ env, prompt: 'p', maxOutputTokens: 10, stallTimeoutMs: 250 }),
    (e) => {
      assert.equal(e.code, 'AI_STALLED');
      assert.equal(e.retryable, true);
      assert.equal(e.partialText, 'begin...');
      assert.equal(e.httpStatus, 504);
      return true;
    }
  );
});

// 7 — stream stopt zonder message_stop
await t('stream eindigt zonder message_stop -> AI_STREAM_INTERRUPTED', async () => {
  stub(() => sse([
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 5 } } }),
    ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'half' } })
  ]));
  await assert.rejects(() => generate({ env, prompt: 'p', maxOutputTokens: 10 }), (e) => {
    assert.equal(e.code, 'AI_STREAM_INTERRUPTED');
    assert.equal(e.partialText, 'half');
    return true;
  });
});

// 8 — error-event midden in de stream
await t('error-event in de stream -> juiste providercode', async () => {
  stub(() => sse([
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 5 } } }),
    ev('error', { type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } })
  ]));
  await assert.rejects(() => generate({ env, prompt: 'p', maxOutputTokens: 10 }), (e) => {
    assert.equal(e.code, 'AI_PROVIDER_OVERLOADED');
    return true;
  });
});

// 9 — afbreken door de aanroeper
await t('AbortSignal van de aanroeper -> AI_ABORTED', async () => {
  stub(() => new Response(new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(ev('message_start', { type: 'message_start', message: { usage: {} } })));
      await new Promise(r => setTimeout(r, 3000));
      c.close();
    }
  }), { status: 200 }));
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 150);
  await assert.rejects(() => generate({ env, prompt: 'p', maxOutputTokens: 10, signal: ac.signal }), (e) => {
    assert.equal(e.code, 'AI_ABORTED');
    return true;
  });
});

// 10 — geen API-key
await t('ontbrekende key -> AI_NOT_CONFIGURED', async () => {
  await assert.rejects(() => generate({ env: {}, prompt: 'p', maxOutputTokens: 10 }), (e) => {
    assert.equal(e.code, 'AI_NOT_CONFIGURED');
    return true;
  });
});

// 11 — refusal
await t('stop_reason refusal -> AI_REFUSED', async () => {
  stub(() => sse([
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 5 } } }),
    ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'nee' } }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 2 } }),
    ev('message_stop', { type: 'message_stop' })
  ]));
  await assert.rejects(() => generate({ env, prompt: 'p', maxOutputTokens: 10 }), (e) => {
    assert.equal(e.code, 'AI_REFUSED');
    return true;
  });
});

// ── Schema-sanitizer ────────────────────────────────────────────────────────
// Anthropic's structured outputs weigeren pure validatie-constraints met een
// harde 400 ("For 'array' type, property 'maxItems' is not supported"). De
// provider strippt die nu zelf, zoals Anthropic's eigen SDK's doen.
await t('sanitizer verwijdert niet-ondersteunde constraints en noteert ze in description', async () => {
  const cleaned = sanitizeSchemaForStructuredOutput({
    type: 'object',
    additionalProperties: false,
    required: ['t'],
    properties: {
      t: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 11 } },
      naam: { type: 'string', maxLength: 40, description: 'Het label.' }
    }
  });
  assert.equal(cleaned.properties.t.maxItems, undefined);
  assert.equal(cleaned.properties.t.minItems, undefined);
  assert.equal(cleaned.properties.t.items.minimum, undefined);
  assert.equal(cleaned.properties.t.items.maximum, undefined);
  assert.equal(cleaned.properties.naam.maxLength, undefined);
  // de bedoeling blijft leesbaar voor het model
  assert.match(cleaned.properties.t.description, /maxItems=3/);
  assert.match(cleaned.properties.naam.description, /^Het label\. .*maxLength=40/);
});
await t('sanitizer laat structurele keywords ONGEMOEID (vorm mag niet wijzigen)', async () => {
  const src = {
    type: 'object', additionalProperties: false, required: ['a', 'b'],
    properties: {
      a: { type: 'string', enum: ['x', 'y'] },
      b: { type: 'array', items: { $ref: '#/$defs/thing' } }
    },
    $defs: { thing: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] } }
  };
  const cleaned = sanitizeSchemaForStructuredOutput(src);
  assert.deepEqual(cleaned, src, 'een schema zonder verboden keywords moet identiek terugkomen');
});
await t('sanitizer muteert het meegegeven schema niet (apps hergebruiken het)', async () => {
  const src = { type: 'array', maxItems: 3, items: { type: 'integer' } };
  const kopie = JSON.parse(JSON.stringify(src));
  sanitizeSchemaForStructuredOutput(src);
  assert.deepEqual(src, kopie);
});
await t('de schema die ECHT verstuurd wordt bevat geen verboden keyword', async () => {
  stub(() => sse([
    ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 1 } } }),
    ev('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"ok":true}' } }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }),
    ev('message_stop', { type: 'message_stop' })
  ]));
  await generate({
    env, prompt: 'p', maxOutputTokens: 100,
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, minProperties: 1 }
  });
  const verzonden = JSON.stringify(lastBody.output_config.format.schema);
  for (const bad of ['minProperties', 'maxItems', 'maxLength', 'minimum']) {
    assert.ok(!verzonden.includes('"' + bad + '"'), bad + ' zit nog in de verstuurde schema');
  }
});

let failed = 0;
for (const [s, n] of results) { console.log(s === 'ok' ? '  ✓ ' + n : '  ✗ ' + n); if (s !== 'ok') failed++; }
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
