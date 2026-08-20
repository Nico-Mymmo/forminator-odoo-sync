// Test van de nieuwe digest-logica in de mini-app "Actiebladen Insights".
// De app is één HTML-bestand met een DOMContentLoaded-IIFE, dus we snijden de
// pure helpers eruit en voeren die uit met een minimale state-stub. Zo blijft
// dit een echte test (de code wordt uitgevoerd) zonder een DOM te moeten
// nabouwen.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('actiebladen-insights.html', 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const app = blocks[blocks.length - 1];

function extract(name) {
  const re = new RegExp('\\n  (?:async )?function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = app.match(re);
  assert.ok(m, 'functie niet gevonden: ' + name);
  let i = app.indexOf('{', m.index + 1), depth = 0, end = -1;
  for (let j = i; j < app.length; j++) {
    if (app[j] === '{') depth++;
    else if (app[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  assert.ok(end > 0, 'onbalans in ' + name);
  return app.slice(m.index, end);
}
function extractVar(name) {
  const re = new RegExp('\\n  var ' + name + ' = [\\s\\S]*?;\\n');
  const m = app.match(re);
  assert.ok(m, 'var niet gevonden: ' + name);
  return m[0];
}

// Harnas: de state + helpers die de gesneden functies verwachten.
const harness = `
var state = { digestsById: {}, records: [] };
function digestSignature(rec) { return 'SIG:' + rec.id + ':' + (rec.q1 || ''); }
${extractVar('THEME_MASTER_LIST')}
${extractVar('DIGEST_FAILED_GIST')}
${extract('themesFromIndices')}
${extract('mergeDigest')}
${extract('buildBatches')}
${extract('classifySchema')}
${extract('summarySchema')}
${extract('perQuestionSchema')}
${extract('isFatalQuotaError')}
${extractVar('PLATFORM_MAX_OUTPUT_TOKENS')}
${extractVar('JSON_OVERHEAD_TOKENS')}
${extractVar('CLASSIFY_TOKENS_PER_RECORD')}
${extractVar('SUMMARY_TOKENS_PER_RECORD')}
${extract('batchMaxFor')}
${extract('outputBudgetFor')}
${extractVar('MAX_SPLIT_DEPTH')}
${extract('runSplittingOnTruncation')}
var CLASSIFY_BATCH_MAX_RECORDS = batchMaxFor(CLASSIFY_TOKENS_PER_RECORD);
var SUMMARY_BATCH_MAX_RECORDS = batchMaxFor(SUMMARY_TOKENS_PER_RECORD);
var DIGEST_BATCH_MAX_CHARS = 90000;
var console = { info: function () {} };
function formatRecordForDigest(rec) { return '[' + rec.id + '] ' + (rec.q1 || ''); }
return { state, THEME_MASTER_LIST, DIGEST_FAILED_GIST, themesFromIndices, mergeDigest,
         buildBatches, classifySchema, summarySchema, perQuestionSchema, isFatalQuotaError,
         batchMaxFor, outputBudgetFor, runSplittingOnTruncation, MAX_SPLIT_DEPTH,
         PLATFORM_MAX_OUTPUT_TOKENS, SUMMARY_TOKENS_PER_RECORD, CLASSIFY_TOKENS_PER_RECORD,
         CLASSIFY_BATCH_MAX_RECORDS, SUMMARY_BATCH_MAX_RECORDS };
`;
const M = new Function(harness)();

const results = [];
function t(name, fn) {
  try { fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); }
}

t('themesFromIndices mapt indices op de vaste labels', () => {
  assert.deepEqual(M.themesFromIndices([0, 4]), ['Kosten & tarieven', 'Opstart- & overnamebegeleiding']);
});
t('themesFromIndices ontdubbelt eerst en kapt daarna af op 3', () => {
  // Dubbele indices mogen geen geldig thema verdringen: [1,1,2,3,5] moet 3
  // unieke thema's geven, niet 2.
  assert.equal(M.themesFromIndices([1, 1, 2, 3, 5]).length, 3);
  assert.deepEqual(M.themesFromIndices([1, 1]), ['Transparantie financiën']);
  assert.deepEqual(M.themesFromIndices([1, 1, 2, 3, 5]),
    ['Transparantie financiën', 'Zelfbeheer vs. syndicus', 'Ontevredenheid beheerder']);
});
t('themesFromIndices negeert indices buiten de lijst (geen undefined-thema)', () => {
  assert.deepEqual(M.themesFromIndices([99, 0, -1]), ['Kosten & tarieven']);
});
t('themesFromIndices voegt een "Nieuw: "-thema toe', () => {
  assert.deepEqual(M.themesFromIndices([0], 'geluidsoverlast'), ['Kosten & tarieven', 'Nieuw: geluidsoverlast']);
});
t('themesFromIndices negeert een leeg/whitespace nieuw thema', () => {
  assert.deepEqual(M.themesFromIndices([0], '   '), ['Kosten & tarieven']);
});

// ── mergeDigest: de kern van het tweefasen-ontwerp ──────────────────────────
t('fase A alleen (tags) zet GEEN sig -> record blijft openstaan voor fase B', () => {
  M.state.digestsById = {};
  const rec = { id: 1, q1: 'x' };
  M.mergeDigest(rec, { tags: ['Kosten & tarieven'] });
  const d = M.state.digestsById[1];
  assert.deepEqual(d.tags, ['Kosten & tarieven']);
  assert.equal(d.gist, undefined);
  assert.equal(d.sig, undefined, 'sig mag hier NIET gezet zijn');
});
t('fase B alleen (gist zonder tags) zet ook geen sig', () => {
  M.state.digestsById = {};
  const rec = { id: 2, q1: 'y' };
  M.mergeDigest(rec, { gist: 'kort' });
  assert.equal(M.state.digestsById[2].sig, undefined);
});
t('fase A + fase B samen zetten sig, zonder elkaar te overschrijven', () => {
  M.state.digestsById = {};
  const rec = { id: 3, q1: 'z' };
  M.mergeDigest(rec, { tags: ['Digitaal platform'] });
  M.mergeDigest(rec, { gist: 'de kern' });
  const d = M.state.digestsById[3];
  assert.equal(d.gist, 'de kern');
  assert.deepEqual(d.tags, ['Digitaal platform']);
  assert.equal(d.sig, 'SIG:3:z');
});
t('fase C (perQuestion) bewaart gist/tags en de bestaande sig', () => {
  M.state.digestsById = {};
  const rec = { id: 4, q1: 'q' };
  M.mergeDigest(rec, { tags: ['Technisch onderhoud'] });
  M.mergeDigest(rec, { gist: 'g' });
  M.mergeDigest(rec, { perQuestion: { reason: 'r' } });
  const d = M.state.digestsById[4];
  assert.equal(d.gist, 'g');
  assert.deepEqual(d.tags, ['Technisch onderhoud']);
  assert.deepEqual(d.perQuestion, { reason: 'r' });
  assert.equal(d.sig, 'SIG:4:q');
});
t('de mislukt-placeholder telt NOOIT als een geldige samenvatting', () => {
  M.state.digestsById = {};
  const rec = { id: 5, q1: 'p' };
  M.mergeDigest(rec, { tags: ['Administratie & AV'] });
  M.mergeDigest(rec, { gist: M.DIGEST_FAILED_GIST, failed: true });
  const d = M.state.digestsById[5];
  assert.equal(d.failed, true);
  assert.equal(d.sig, undefined, 'een mislukt record mag niet als klaar tellen');
});

// ── batching ───────────────────────────────────────────────────────────────
t('buildBatches respecteert de max-records-grens', () => {
  const recs = Array.from({ length: 250 }, (_, i) => ({ id: i, q1: 'a' }));
  assert.equal(M.buildBatches(recs, 100).length, 3);
  assert.equal(M.buildBatches(recs, 40).length, 7);
  assert.equal(M.buildBatches(recs, 100)[0].length, 100);
});
t('buildBatches respecteert de teken-grens', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ id: i, q1: 'x'.repeat(500) }));
  const b = M.buildBatches(recs, 100, 1200);
  assert.ok(b.length > 1, 'had moeten splitsen op tekens');
  b.forEach(batch => assert.ok(batch.length <= 3));
});
t('buildBatches op een lege lijst geeft geen lege batch', () => {
  assert.deepEqual(M.buildBatches([], 40), []);
});

// ── schema's ───────────────────────────────────────────────────────────────
t('classifySchema begrenst de thema-index via een enum (geen minimum/maximum)', () => {
  const s = M.classifySchema();
  const t_ = s.properties.items.items.properties.t;
  // enum IS ondersteund door Anthropic's constrained decoding; minimum/maximum
  // en maxItems NIET (die gaven een harde 400).
  assert.deepEqual(t_.items.enum, M.THEME_MASTER_LIST.map((_x, i) => i));
  assert.deepEqual(s.properties.items.items.required, ['id', 't', 'n']);
  assert.equal(s.properties.items.items.additionalProperties, false);
});
t('summarySchema vereist enkel id + gist', () => {
  const s = M.summarySchema();
  assert.deepEqual(s.properties.items.items.required, ['id', 'gist']);
  assert.ok(/30 woorden/.test(s.properties.items.items.properties.gist.description));
});
// Regressietest op de 400 die we in productie zagen:
// "For 'array' type, property 'maxItems' is not supported".
t('GEEN van de app-schemas gebruikt een niet-ondersteund JSON-Schema-keyword', () => {
  const verboden = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
    'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems',
    'uniqueItems', 'minProperties', 'maxProperties'];
  const gevonden = [];
  function loop(node, pad) {
    if (Array.isArray(node)) return node.forEach((n, i) => loop(n, pad + '[' + i + ']'));
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (verboden.includes(k)) gevonden.push(pad + '.' + k);
      loop(v, pad + '.' + k);
    }
  }
  loop(M.classifySchema(), 'classify');
  loop(M.summarySchema(), 'summary');
  loop(M.perQuestionSchema(['reason', 'costs']), 'perQuestion');
  assert.deepEqual(gevonden, []);
});
t('perQuestionSchema vereist exact de AANWEZIGE vragen (geen verzinsels)', () => {
  const s = M.perQuestionSchema(['reason', 'costs']);
  assert.deepEqual(s.required, ['reason', 'costs']);
  assert.deepEqual(Object.keys(s.properties), ['reason', 'costs']);
  assert.equal(s.additionalProperties, false);
});

// ── quota-onderscheid ──────────────────────────────────────────────────────
t('isFatalQuotaError onderscheidt onze daglimiet van een provider-ratelimit', () => {
  assert.equal(M.isFatalQuotaError({ code: 'AI_RATE_LIMIT_APP' }), true);
  assert.equal(M.isFatalQuotaError({ code: 'AI_RATE_LIMIT_PLATFORM' }), true);
  assert.equal(M.isFatalQuotaError({ code: 'AI_PROVIDER_RATE_LIMITED' }), false);
  assert.equal(M.isFatalQuotaError({ code: 'AI_STALLED' }), false);
  assert.equal(!!M.isFatalQuotaError(null), false);
});

// ── Tokenbudget: de bug die AI_TRUNCATED veroorzaakte ──────────────────────
// De oorspronkelijke fout was dat batch-grootte (40) en gevraagd tokenbudget
// (40*90+400 = 4000) twee losse getallen waren die elkaar tegenspraken. Deze
// test legt vast dat dat per constructie niet meer kan.
t('het gevraagde budget dekt ALTIJD de grootste toegestane batch', () => {
  for (const tpr of [10, 25, 60, 200, 500, 1000]) {
    const max = M.batchMaxFor(tpr);
    const budget = M.outputBudgetFor(max, tpr);
    assert.ok(budget <= M.PLATFORM_MAX_OUTPUT_TOKENS,
      `budget ${budget} > platformcap bij ${tpr}/record`);
    assert.ok(budget >= max * tpr,
      `budget ${budget} dekt ${max} records x ${tpr} niet`);
  }
});
t('batchMaxFor geeft altijd minstens 1 record, ook bij absurd hoge kost', () => {
  assert.equal(M.batchMaxFor(999999), 1);
});
t('de werkelijk gebruikte batch-groottes passen binnen hun budget', () => {
  assert.ok(M.outputBudgetFor(M.SUMMARY_BATCH_MAX_RECORDS, M.SUMMARY_TOKENS_PER_RECORD) <= M.PLATFORM_MAX_OUTPUT_TOKENS);
  assert.ok(M.outputBudgetFor(M.CLASSIFY_BATCH_MAX_RECORDS, M.CLASSIFY_TOKENS_PER_RECORD) <= M.PLATFORM_MAX_OUTPUT_TOKENS);
  assert.ok(M.SUMMARY_BATCH_MAX_RECORDS < M.CLASSIFY_BATCH_MAX_RECORDS,
    'samenvatten produceert meer output per record, dus kleinere batches');
});

// ── Splitsen bij AI_TRUNCATED ─────────────────────────────────────────────
const truncErr = () => Object.assign(new Error('afgekapt'), { code: 'AI_TRUNCATED', retryable: false });

await (async () => {
  const async_t = async (name, fn) => {
    try { await fn(); results.push(['ok', name]); }
    catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); }
  };

  await async_t('geen splitsing nodig -> één aanroep', async () => {
    let calls = 0;
    const out = await M.runSplittingOnTruncation([1, 2, 3], async (b) => { calls++; return b; });
    assert.deepEqual(out, [1, 2, 3]);
    assert.equal(calls, 1);
  });

  await async_t('AI_TRUNCATED -> batch halveren tot het past, resultaat in ORDE', async () => {
    const batch = [1, 2, 3, 4, 5, 6, 7, 8];
    const gezien = [];
    const out = await M.runSplittingOnTruncation(batch, async (b) => {
      gezien.push(b.length);
      if (b.length > 2) throw truncErr();
      return b;
    });
    // volgorde moet bewaard blijven -- de gists worden per id teruggemapt, maar
    // een omgekeerde volgorde zou wijzen op een fout in de recursie
    assert.deepEqual(out, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(gezien, [8, 4, 2, 2, 4, 2, 2]);
  });

  await async_t('splitsing stopt bij één record en gooit de fout dan door', async () => {
    let calls = 0;
    await assert.rejects(
      () => M.runSplittingOnTruncation([1, 2], async () => { calls++; throw truncErr(); }),
      (e) => { assert.equal(e.code, 'AI_TRUNCATED'); return true; }
    );
    // [1,2] -> faalt, splitst in [1] en [2]; [1] faalt en kan niet verder
    assert.equal(calls, 2);
  });

  await async_t('splitsing respecteert de dieptegrens', async () => {
    const groot = Array.from({ length: 64 }, (_, i) => i);
    let calls = 0;
    await assert.rejects(
      () => M.runSplittingOnTruncation(groot, async () => { calls++; throw truncErr(); }),
      (e) => { assert.equal(e.code, 'AI_TRUNCATED'); return true; }
    );
    // zonder grens zou dit 127 aanroepen zijn; met MAX_SPLIT_DEPTH=4 veel minder
    assert.ok(calls <= 2 ** (M.MAX_SPLIT_DEPTH + 1), 'te veel aanroepen: ' + calls);
  });

  await async_t('splitst NIET bij een andere fout (bv. rate-limit)', async () => {
    let calls = 0;
    await assert.rejects(
      () => M.runSplittingOnTruncation([1, 2, 3, 4], async () => {
        calls++;
        throw Object.assign(new Error('limiet'), { code: 'AI_RATE_LIMIT_PLATFORM' });
      }),
      (e) => { assert.equal(e.code, 'AI_RATE_LIMIT_PLATFORM'); return true; }
    );
    assert.equal(calls, 1, 'een rate-limit mag NOOIT tot splitsen leiden');
  });
})();

let failed = 0;
for (const [s, n] of results) { console.log(s === 'ok' ? '  ✓ ' + n : '  ✗ ' + n); if (s !== 'ok') failed++; }
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
