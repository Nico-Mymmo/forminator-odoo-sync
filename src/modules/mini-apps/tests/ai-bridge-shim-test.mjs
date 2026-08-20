// Integratietest van de AI-brug IN de geïnjecteerde shim (MINI_APP_SHIM in
// public/mini-apps-core.js). De shim is een string die in het iframe belandt,
// dus die kan alleen getest worden door hem echt uit te voeren -- met een
// nagebootst window/parent-paar dat de rol van de host-pagina speelt.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('public/mini-apps-core.js', 'utf8');
const start = src.indexOf('var MINI_APP_SHIM =');
const endMarker = "+ 'script>';";
const end = src.indexOf(endMarker, start);
let SHIM;
eval(src.slice(start, end + endMarker.length).replace('var MINI_APP_SHIM =', 'SHIM ='));
const innerCode = SHIM.replace(/^<script>/, '').replace(/<\/\s*script>$/, '');

// Minimale iframe-omgeving. `parent.postMessage` = wat de host-pagina ontvangt.
function makeWindow(onOutbound) {
  const listeners = [];
  const win = {
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
    removeEventListener: () => {},
    parent: { postMessage: (msg) => onOutbound(msg) },
    setTimeout, clearTimeout,
    // deliver = de host die een bericht terugstuurt naar het iframe
    deliver: (data) => listeners.forEach(fn => fn({ data }))
  };
  win.window = win;
  return win;
}
function boot(onOutbound) {
  const win = makeWindow(onOutbound);
  // De shim praat tegen `window` en definieert window.platform / window.sharedStorage.
  new Function('window', 'setTimeout', 'clearTimeout', 'Object', innerCode)(
    win, setTimeout, clearTimeout, Object
  );
  return win;
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + (e && e.message)]); }
}

// 1 — ask() resolvet met een STRING (compat met bestaande mini-apps) + onProgress
await t('ask() geeft een string terug, onProgress krijgt de deltas', async () => {
  let sent = null;
  const win = boot(m => { sent = m; });
  const chunks = [];
  const p = win.platform.ai.ask('mijn prompt', {
    maxOutputTokens: 2500,
    system: 'sys',
    onProgress: (i) => chunks.push(i.delta)
  });
  assert.equal(sent.action, 'aiAsk');
  assert.equal(sent.prompt, 'mijn prompt');
  assert.equal(sent.maxOutputTokens, 2500);
  const id = sent.id;
  win.deliver({ __miniAppAiEvent: true, id, event: 'open', payload: {} });
  win.deliver({ __miniAppAiEvent: true, id, event: 'delta', delta: 'Hallo ' });
  win.deliver({ __miniAppAiEvent: true, id, event: 'delta', delta: 'wereld' });
  win.deliver({ __miniAppAiEvent: true, id, event: 'done', payload: { text: 'Hallo wereld', model: 'claude-sonnet-5' } });
  const out = await p;
  assert.equal(typeof out, 'string');
  assert.equal(out, 'Hallo wereld');
  assert.deepEqual(chunks, ['Hallo ', 'wereld']);
});

// 2 — ask.json() geeft een geparst object
await t('ask.json() geeft het geparste object uit het schema-antwoord', async () => {
  let sent = null;
  const win = boot(m => { sent = m; });
  const p = win.platform.ai.ask.json('p', { schema: { type: 'object' } });
  assert.deepEqual(sent.schema, { type: 'object' });
  win.deliver({ __miniAppAiEvent: true, id: sent.id, event: 'done', payload: { text: '{"items":[]}', json: { items: [] } } });
  assert.deepEqual(await p, { items: [] });
});

// 3 — ask.json() zonder schema faalt meteen met een duidelijke code
await t('ask.json() zonder schema -> AI_INVALID_SCHEMA', async () => {
  const win = boot(() => {});
  await assert.rejects(() => win.platform.ai.ask.json('p', {}), (e) => {
    assert.equal(e.code, 'AI_INVALID_SCHEMA');
    return true;
  });
});

// 4 — het foutcontract komt volledig door (dit is wat vroeger een string was)
await t('error-event -> Error met code/retryable/retryAfterMs/requestId', async () => {
  let sent = null;
  const win = boot(m => { sent = m; });
  const p = win.platform.ai.ask('p');
  win.deliver({
    __miniAppAiEvent: true, id: sent.id, event: 'error',
    payload: {
      error: 'Claude is tijdelijk overbelast.', code: 'AI_PROVIDER_OVERLOADED',
      retryable: true, retryAfterMs: 4000, phase: 'provider', providerStatus: 529,
      requestId: 'req_abc'
    }
  });
  await assert.rejects(() => p, (e) => {
    assert.equal(e.code, 'AI_PROVIDER_OVERLOADED');
    assert.equal(e.retryable, true);
    assert.equal(e.retryAfterMs, 4000);
    assert.equal(e.phase, 'provider');
    assert.equal(e.providerStatus, 529);
    assert.equal(e.requestId, 'req_abc');
    // err.message blijft leesbaar Nederlands -> bestaande toasts blijven werken
    assert.match(e.message, /overbelast/);
    return true;
  });
});

// 5 — AI_TRUNCATED houdt de al ontvangen tekst vast
await t('AI_TRUNCATED levert partialText mee', async () => {
  let sent = null;
  const win = boot(m => { sent = m; });
  const p = win.platform.ai.ask('p');
  win.deliver({ __miniAppAiEvent: true, id: sent.id, event: 'error',
    payload: { error: 'afgekapt', code: 'AI_TRUNCATED', retryable: false, partialText: '{"items":[{' } });
  await assert.rejects(() => p, (e) => {
    assert.equal(e.code, 'AI_TRUNCATED');
    assert.equal(e.retryable, false);
    assert.equal(e.partialText, '{"items":[{');
    return true;
  });
});

// 6 — DE KERN: de stall-timer reset op elke delta, dus een LANGE aanroep met
//     regelmatig verkeer loopt NIET af. Dit is precies wat de opgetrokken
//     timeout-cap moest doen en nooit betrouwbaar kon.
await t('lange aanroep met regelmatige deltas loopt niet af (stall-timer reset)', async () => {
  let sent = null;
  const win = boot(m => { sent = m; });
  // Stall-window kunstmatig verkleinen zou de shim moeten patchen; i.p.v. dat
  // testen we het reset-gedrag: 40 deltas over 1,2s, ruim binnen AI_STALL_MS,
  // en daarna een done. Zonder reset zou een naïeve implementatie na de eerste
  // timer-periode al opgegeven hebben.
  const p = win.platform.ai.ask('p');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 30));
    win.deliver({ __miniAppAiEvent: true, id: sent.id, event: 'delta', delta: 'x' });
  }
  win.deliver({ __miniAppAiEvent: true, id: sent.id, event: 'done', payload: { text: 'x'.repeat(40) } });
  assert.equal((await p).length, 40);
});

// 7 — de host-pagina onbereikbaar -> AI_BRIDGE_UNAVAILABLE i.p.v. stille hang
await t('postMessage faalt -> AI_BRIDGE_UNAVAILABLE', async () => {
  const win = boot(() => { throw new Error('geen parent'); });
  await assert.rejects(() => win.platform.ai.ask('p'), (e) => {
    assert.equal(e.code, 'AI_BRIDGE_UNAVAILABLE');
    return true;
  });
});

// 8 — de oude, gokkende timeout-functie mag echt niet meer bestaan
await t('aiAskTimeoutMs bestaat niet meer in de shim', async () => {
  assert.ok(!SHIM.includes('aiAskTimeoutMs'), 'oude cap-functie zit er nog in');
  assert.ok(!SHIM.includes('300000'), 'oude 5-minuten-cap zit er nog in');
});

let failed = 0;
for (const [s, n] of results) { console.log(s === 'ok' ? '  ✓ ' + n : '  ✗ ' + n); if (s !== 'ok') failed++; }
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
