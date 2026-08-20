# Ontwerp — AI-aanroep-architectuur voor mini-apps (2026-08)

Structurele herziening van de keten `window.platform.ai.ask()` → postMessage-brug →
`POST /api/apps/:id/ai/ask` → `lib/ai.js` → `ai-providers/*`. Vervangt de reeks
provisorische verhogingen van de clientside timeout-cap (45s → 180s → 300s) door een
ontwerp waarin die cap niet meer nodig is.

---

## 0. Wat er precies misging (diagnose, niet symptoom)

De keten had **drie** onafhankelijke gebreken die elk apart al een fout opleveren, en die
samen precies het waargenomen gedrag produceren (mini-app krijgt "Verzoek verliep
(timeout)" terwijl de rekening al betaald is):

1. **De enige timeout in de hele keten stond op de verkeerde plek.** `send()` in
   `mini-apps-core.js` kapte clientside af. De brug, de Worker-route, `askAI()` en
   `provider.generate()` hadden geen enkele eigen deadline. Een clientside timeout
   *annuleert niets* — hij verlaat enkel de `pending`-entry. De `fetch()` in de
   host-pagina liep door, de Worker liep door, Anthropic genereerde door, het
   audit-record werd geschreven, de rate-limit-teller werd verbruikt. Het antwoord
   kwam vervolgens aan bij een `pending[id]` die niet meer bestond en werd stil
   weggegooid (`if(!p)return;`). Kosten gemaakt, resultaat vernietigd.

2. **Er was geen enkel signaal om een timeout op te baseren.** Een niet-streamende
   `fetch` naar `/v1/messages` levert **nul bytes** tot het antwoord volledig
   gegenereerd is. De brug kon dus per definitie niet onderscheiden tussen "Claude is
   nog aan het werk" en "de verbinding is dood". Elke gekozen waarde is daarom een gok
   — en een gok die per definitie fout schaalt, want de generatietijd hangt af van het
   *werkelijk* gegenereerde aantal tokens, niet van het *gevraagde* maximum waarop
   `aiAskTimeoutMs()` rekende. Dat is de reden dat elke nieuwe cap na een tijdje weer
   te krap bleek: de formule voorspelt iets wat ze niet kan weten.

3. **Alle faalmodi kwamen als dezelfde string aan.** `apiJson()` gooide
   `new Error(body.error)` en liet de `code` uit de server-response vallen. Zowel
   `lib/ai.js` als de providers zetten wél netjes `err.code`, maar die stierf in de
   brug. De mini-app kon daarna enkel nog reguliere expressies op Nederlandse tekst
   loslaten — en doet dat ook, letterlijk: `isTimeoutError()` matcht
   `/timeout|verliep|time-?out/i` en `digestIds()` matcht `/limiet|limit/i`. Dat is
   geen foutafhandeling, dat is tekstarcheologie.

Belangrijke randvoorwaarde die het ontwerp bepaalt: **een Cloudflare Worker heeft geen
wall-clock-limiet zolang de client verbonden blijft** (CPU-limiet 30s is iets anders en
wordt hier nooit geraakt — we wachten, we rekenen niet). Er was dus nooit een
platformlimiet die dit veroorzaakte. Het probleem was volledig zelfgemaakt.

---

## 1. Streaming — ja, en het is de kern van de oplossing

**Beslissing: `stream: true` wordt de enige modus in `ai-providers/anthropic.js`.** Niet
optioneel, niet enkel voor grote aanroepen.

Anthropic's eigen documentatie is expliciet: voor aanroepen boven 10 minuten is
streaming (of de Batch API) vereist, en de officiële SDK's *weigeren* een
niet-streamende aanroep met een grote `max_tokens` omdat netwerken idle verbindingen
laten vallen. Wij zaten met 8192 tokens precies in die zone.

### Wat het oplost, en waarom dat geen cap-tweak is

Streaming verandert niet hoe snel Claude klaar is — het verandert **wat de keten weet
terwijl het gebeurt**. Met SSE komen er continu events binnen (`content_block_delta`,
en `ping` juist tijdens stiltes). Daardoor kan elke schakel de timeout-vraag vervangen
door een fundamenteel andere vraag:

| oud | nieuw |
|---|---|
| "duurt dit langer dan mijn geschatte totaalduur?" (ongokbaar) | "is er de laatste N seconden *iets* gebeurd?" (meetbaar) |

Een **stall-timeout** (inactiviteit) van 60s is verdedigbaar ongeacht of het antwoord
500 of 100.000 tokens wordt, en hoeft dus nooit meer bijgesteld te worden op basis van
wat er net misliep. Dat is het verschil tussen dit ontwerp en de vorige drie ronden.

### Ketenontwerp

```
Anthropic SSE  ──►  anthropic.js          leest SSE, accumuleert tekst,
                    (generate)            roept onDelta() per tekstfragment,
                                          eigen AbortController op stall
                         │
                         ▼
                    lib/ai.js             guardrails + rate-limit VOORAF,
                    (askAI /              audit-log NA afloop (ook bij afbreken),
                     askAIStream)         reikt onDelta door
                         │
                         ▼
                    routes.js             stream:true → text/event-stream
                                          (eigen SSE-protocol, zie §5)
                                          anders → gewone JSON (ongewijzigd)
                         │
                         ▼
                    host-pagina           leest de SSE met een ReadableStream,
                    (mini-apps-core)      relayt elke delta als postMessage
                         │
                         ▼
                    iframe-shim           reset de stall-timer op elk bericht,
                    (window.platform)     bouwt de tekst op, resolvet met string
```

### Blijft `ask()` single-shot? Ja.

`window.platform.ai.ask(prompt, opts)` **resolvet nog steeds met een string**. Streaming
is een transportdetail, geen API-wijziging. Bestaande mini-apps veranderen niet en
profiteren onmiddellijk (de stall-timer vervangt hun cap).

Nieuw en puur additief:

- `opts.onProgress({text, delta})` — wordt bij elk tekstfragment aangeroepen tijdens het
  genereren. Voor een voortgangsbalk die niet meer hoeft te liegen, of om incrementeel
  te renderen.
- `platform.ai.ask.full(prompt, opts)` — resolvet met `{text, json, model, usage,
  stopReason, requestId}` i.p.v. enkel de tekst, voor wie het tokenverbruik wil zien.
- `platform.ai.ask.json(prompt, {schema, ...})` — resolvet met een **geparst object**
  dat door de provider tegen een JSON-schema gedwongen is (§3).
- `opts.model` — kiest een model uit de server-side allowlist (`MODEL_ALLOWLIST` in
  `lib/ai.js`), zodat classificatie op Haiku kan en samenvatten op Sonnet.

Bewust **geen** async iterator (`for await`) als publieke vorm: de shim wordt als
string in het iframe geïnjecteerd en blijft daarom in bewuste ES5-stijl. `onProgress`
dekt exact dezelfde gevallen zonder generatoren in een geconcateneerde string.

---

## 2. Fire-and-forget + polling — nee, en dit is waarom

Het klinkt als het "properdere" patroon, maar het is hier fundamenteel slechter. Drie
redenen, in volgorde van hardheid:

**(a) Een Worker mag geen werk doen nadat het antwoord verzonden is.**
`ctx.waitUntil()` verlengt de uitvoering met **maximaal 30 seconden** na het versturen
van de response of het wegvallen van de client. Een AI-aanroep van 2–4 minuten past daar
niet in. "Server verwerkt async" is in dit platform dus geen kleine refactor maar een
nieuwe infrastructuurlaag: Durable Object, Queue (consumer 15 min) of Workflow, plus
job-tabel/KV, plus statusendpoint, plus opruimlogica voor verweesde jobs, plus
`wrangler.jsonc`-bindings, plus een tweede plek waar rate-limit en audit-log correct
moeten gebeuren. Dat is veel nieuw oppervlak om een probleem op te lossen dat door één
verkeerd geplaatste `setTimeout` veroorzaakt werd.

**(b) Polling maakt het iframe-probleem erger, niet kleiner.** De postMessage-brug is
*request/response* met een `pending`-map op id. Streaming past daar naadloos in: extra
berichten met hetzelfde id, dezelfde promise. Polling vervangt één brug-oproep door
N brug-oproepen op een timer, waarbij de mini-app zelf backoff en opgeven moet
implementeren — en de sluitende iframe laat de job wél doorlopen. Precies het
"kosten gemaakt, niemand luistert"-scenario dat we juist willen wegnemen, nu als
ontwerp i.p.v. als bug.

**(c) Polling levert geen tussentijdse informatie.** Streaming geeft gratis wat de
progress-dialog van Actiebladen Insights nu moet faken. Polling geeft
`status: "running"` — informatiegehalte nul.

**Wanneer polling wél het juiste antwoord is** (nu bewust niet gebouwd, hier
gedocumenteerd zodat de afweging later niet opnieuw van nul begint):

- Werk dat **langer dan ~10 minuten** duurt, of dat door moet lopen als de gebruiker
  wegklikt (nachtelijke herclassificatie van het volledige archief).
- Dan is het antwoord **niet** een eigen job-framework, maar Anthropic's
  **Message Batches API**: die is ontworpen voor exact dit patroon (submit → poll),
  kost **50% minder**, en haalt 300k output-tokens met de `output-300k` beta. Voor "vat
  alle 700 actiebladen 's nachts opnieuw samen" is dat het juiste gereedschap. Het
  hangt dan aan de scheduler (`lib/scheduler.js`), niet aan een mini-app die staat te
  wachten.

Samengevat: **streaming voor interactief, Batch API voor onbemand.** Een
zelfgebouwd polling-pad zit precies in het gat waar geen van beide nodig is.

---

## 3. Gebruiken we de Anthropic-API optimaal? Nee — vier concrete wijzigingen

### 3.1 Structured outputs i.p.v. zelfgeparste NDJSON — ja, invoeren

De huidige aanpak vraagt tekst en hoopt op formaat. Bewijs dat dat niet werkt zit in de
code zelf: `extractJsonObjects()` probeert eerst een array, dan regel-per-regel, dan een
regex `/\{[\s\S]*\}/` per regel, houdt `failedLines` bij, en `digestIds()` heeft een
volledig pad voor records die "niet in het antwoord terugkwamen". Dat is drie lagen
vangnet voor een probleem dat de API kan wegnemen.

`output_config.format = {type: 'json_schema', schema}` **dwingt** geldige JSON af
(constrained decoding, geen beste-poging). Geen beta-header nodig, ondersteund op
Sonnet 5 en Haiku 4.5. Gevolgen:

- `extractJsonObjects()` en `failedLines` verdwijnen.
- Het "sla een vraag over als ze niet aanwezig was" wordt een schema-eigenschap
  (`required` bevat alleen `id` en `gist`) i.p.v. een instructie die de AI kan negeren.
- Instructietokens die nu aan formaatdiscipline opgaan ("GEEN array, GEEN komma's
  tussen regels, GEEN markdown-codeblok, GEEN uitleg", plus het voorbeeldobject)
  verdwijnen uit de prompt — schema's zijn goedkoper dan smeekbedes.

Let op de kleine lettertjes: structured outputs zijn **niet** combineerbaar met
prefilling en citations. Geen van beide gebruiken we.

### 3.2 Themalijst als index, niet als string — de goedkoopste winst in het dossier

De prompt bevat nu een gesloten lijst van 12 thema's, en drie zinnen die vragen om
"LETTERLIJK een van deze labels (geen eigen spelling/variatie)". Met een schema wordt
dat een `enum`, en dan is spellingdrift structureel onmogelijk i.p.v. hoopvol
onwaarschijnlijk.

Nog een stap verder: **tags als integer-index in `THEME_MASTER_LIST`**. `"Opstart- &
overnamebegeleiding"` is ~9 output-tokens; `4` is één token. Bij 3 tags × 25 records is
dat ~600 output-tokens per batch die verdwijnen zonder één bit informatieverlies — de
mini-app mapt indices terug op labels. De `"Nieuw: ..."`-ontsnappingsroute blijft
bestaan als een apart, optioneel `newTheme`-stringveld, zodat de lijst aanvulbaar
blijft.

### 3.3 Prompt caching — hier **niet** zinvol, en dat is een bewuste conclusie

Eerlijke analyse in plaats van een reflex:

- Het statische deel (system + instructies + themalijst) is na de opschoning uit §3.1
  ruwweg 400–600 tokens. Het **minimum voor Sonnet 5 is 1.024 tokens**; daaronder wordt
  caching stil overgeslagen. Het loont dus letterlijk niet.
- De rest van elke prompt (de records) is per batch uniek. Er ís geen herbruikbare
  prefix van betekenis.
- De TTL is 5 minuten (of 1 uur tegen 2× schrijfkosten). Batches lopen achter elkaar
  door, maar delen niets cachebaars.

**Waar het wél kan renderen, en waarvoor de provider het nu ondersteunt:** een retry
(§6) of een gesplitste batch verstuurt dezelfde prefix binnen enkele seconden opnieuw.
De provider krijgt daarom een optionele `cachePrefix`-parameter met `cache_control`, en
`ai-pricing.js` gaat cache-tokens correct verrekenen — maar de digest-prompts zetten
het **uit**, met deze motivatie erbij. Zo staat het er als het ooit wel loont (bv. een
mini-app die een groot vast referentiedocument bij elke vraag meestuurt: dan is het
100% de juiste zet).

### 3.4 Model — `claude-sonnet-4-6` is niet meer de juiste standaard

`DEFAULT_MODEL` staat op `claude-sonnet-4-6`. Sindsdien is **Sonnet 5** uit: goedkoper
op input ($2 vs $3 per MTok), 1M context, 128k output, en beter. Er is geen argument om
op 4-6 te blijven.

Belangrijker dan de standaard: **één model voor alles is hier de eigenlijke fout.** De
digest-taak bestaat uit twee taken met totaal verschillende profielen:

| taak | aard | output | juiste model |
|---|---|---|---|
| thema-tags | classificatie tegen gesloten lijst | ~2 tokens/record | **Haiku 4.5** ($1/$5) |
| samenvattingen | begrijpend samenvatten in het Nederlands | ~50 tokens/record | **Sonnet 5** ($2/$10) |
| trends-analyse | analytisch redeneren over de hele set | ~2.000 tokens, 1×/analyse | **Sonnet 5** |

`askAI()` krijgt daarom een `model`-parameter (begrensd tot een allowlist, zodat een
mini-app niet ongemerkt naar Opus/Fable kan grijpen — kostenbeheersing blijft
server-side).

---

## 4. Promptoptimalisatie voor `digestBatch()` — concreet herontwerp

### Diagnose van de huidige aanroep

Eén aanroep per batch van 25 vraagt per record: een gist (≤30 woorden), **tot zes**
`perQuestion`-samenvattingen (≤20 woorden elk) én tags. Dat is ~190 woorden ≈ **250+
output-tokens per record**, dus 6.000+ per batch — vandaar `maxOutputTokens: 8192` en
vandaar de duur. Het is de duurste mogelijke vorm van deze taak.

### De sleutelobservatie

**`perQuestion` is ~75% van de output-tokens en wordt nergens in de aggregatie
gebruikt.** Nagetrokken in de app:

- `generateTrendsReport()` gebruikt alleen `d.gist` en `d.tags`.
- `computeStats()` gebruikt alleen `d.tags`.
- `renderTable()` gebruikt alleen `d.gist`.
- `perQuestion` verschijnt **uitsluitend** in `openDetail()` — één record, op het moment
  dat een mens er expliciet op klikt.

We betalen dus bij elke batch vooruit voor zes samenvattingen per record die in de
overgrote meerderheid van de gevallen nooit bekeken worden.

### Het herontwerp: drie aanroepen met elk één taak

**Fase A — classificatie (Haiku 4.5, schema, geen streaming nodig)**
Alleen tags, als indices. Output ≈ 6 tokens/record, dus een batch van **100** records
kost ~600 output-tokens en is in seconden klaar. `DIGEST_BATCH_MAX_RECORDS` is voor deze
fase irrelevant geworden.

```json
{"items":[{"id":123,"t":[0,4]},{"id":124,"t":[2],"n":"geluidsoverlast"}]}
```

**Fase B — samenvatting (Sonnet 5, schema, streaming)**
Alleen de gist. Output ≈ 50 tokens/record → een batch van **40** records kost ~2.000
output-tokens, ruim onder elke grens, en streamt zichtbaar door.

```json
{"items":[{"id":123,"gist":"..."}]}
```

**Fase C — per-vraag-detail (Sonnet 5, schema, op aanvraag, 1 record)**
Wordt aangeroepen in `openDetail()` als het record nog geen `perQuestion` heeft, en
gecached als alle andere digest-data. ~150 output-tokens voor één record: onmerkbaar
snel, en betaald door wie er effectief naar kijkt.

### Wat dit oplevert (25 records, ruwe schatting)

| | nu | herontwerp |
|---|---|---|
| output-tokens/batch | ~6.000–8.000 | ~1.250 (B) + ~150 (A, pro rata) |
| `maxOutputTokens` | 8192 (aan de cap) | 2.500 (B), 800 (A) |
| aanroepen | 1 dure | 2 goedkope + N op aanvraag |
| duur tot resultaat | 100–250s, blind | seconden voor tags, streamend voor gists |
| kosten (lijstprijs) | ~$0,10/batch | ~$0,025/batch |
| parse-risico | regex + 3 vangnetten | nul (schema-gedwongen) |

Dat is ~4× goedkoper en ~5× minder output-tokens, **zonder inhoudsverlies**: alle
informatie die de app vandaag toont is er nog, `perQuestion` alleen op het moment dat
iemand kijkt. En omdat tags nu uit een aparte, snelle aanroep komen, vullen de
Kerncijfers-thema's zich vrijwel onmiddellijk in plaats van pas na de volledige
samenvattingsronde.

### Wat verdwijnt uit de app

- `extractJsonObjects()` (regex-parser + `failedLines`) — schema's maken het overbodig.
- `digestBatchResilient()`'s **timeout-halvering**. Die bestond alleen om de clientside
  cap te omzeilen. Wat blijft: één retry bij een *echt* retrybare fout
  (`AI_PROVIDER_OVERLOADED`, `AI_PROVIDER_RATE_LIMITED`), met de `retryAfterMs` die de
  server nu meegeeft i.p.v. een vaste 1.200 ms.
- `isTimeoutError()`'s regex op Nederlandse tekst — vervangen door `err.code`.

---

## 5. Foutcontract

### Ontwerpregel

Eén canonieke enum in `lib/ai-errors.js`, die **ongewijzigd** door elke laag reist tot in
de mini-app. Geen laag mag een code vertalen, inslikken of vervangen door tekst. De
mens-leesbare boodschap blijft ernaast bestaan voor de UI, maar is nooit meer de
informatiedrager voor code.

### De codes

| code | betekenis | retrybaar |
|---|---|---|
| `AI_NOT_CONFIGURED` | API-key ontbreekt in de Worker | nee |
| `AI_INVALID_PROMPT` / `AI_INVALID_SYSTEM` / `AI_INVALID_SCHEMA` / `AI_INVALID_MODEL` | guardrail van het platform | nee (bug in de app) |
| `AI_RATE_LIMIT_APP` | daglimiet van déze app | nee, morgen |
| `AI_RATE_LIMIT_PLATFORM` | platform-brede daglimiet | nee, morgen |
| `AI_PROVIDER_RATE_LIMITED` | 429 van Anthropic zelf | **ja**, `retryAfterMs` |
| `AI_PROVIDER_OVERLOADED` | 529 | **ja**, backoff |
| `AI_PROVIDER_AUTH` | 401/403 | nee |
| `AI_PROVIDER_BAD_REQUEST` | 400/413 | nee (bug) |
| `AI_PROVIDER_TIMEOUT` | 504 van de provider | ja |
| `AI_PROVIDER_UNREACHABLE` | netwerkfout richting provider | ja |
| `AI_PROVIDER_ERROR` | 5xx, overig | ja |
| `AI_STALLED` | **geen byte meer ontvangen binnen de stall-window** | ja |
| `AI_STREAM_INTERRUPTED` | stream brak af vóór `message_stop` | ja |
| `AI_TRUNCATED` | `stop_reason: max_tokens` — antwoord is afgekapt | nee, verhoog `maxOutputTokens` |
| `AI_REFUSED` | model weigerde | nee |
| `AI_EMPTY_RESPONSE` | geen bruikbare inhoud | nee |
| `AI_OUTPUT_INVALID_JSON` | schema-antwoord niet parseerbaar | ja |
| `AI_ABORTED` | de aanroeper heeft afgebroken | n.v.t. |
| `AI_BRIDGE_UNAVAILABLE` | host-pagina niet bereikbaar / iframe weg | nee |
| `AI_INTERNAL` | onverwacht | nee |

De drie belangrijkste zijn nieuw en precies de gevallen die nu niet te onderscheiden
waren: `AI_STALLED` (echt vastgelopen) tegenover `AI_TRUNCATED` (te weinig
output-ruimte gevraagd) tegenover `AI_PROVIDER_RATE_LIMITED` (van Anthropic) tegenover
`AI_RATE_LIMIT_PLATFORM` (van ons). Vier verschillende acties, tot nu toe één string.

### Vorm

Server (JSON en SSE `error`-event delen dit object):

```json
{ "success": false, "error": "Leesbare tekst voor de gebruiker.",
  "code": "AI_PROVIDER_RATE_LIMITED", "retryable": true, "retryAfterMs": 21000,
  "phase": "provider", "providerStatus": 429,
  "requestId": "req_011CSHoEeqs5C35K2UUqR7Fy" }
```

In de mini-app een echte `Error` met velden:

```js
try {
  const txt = await platform.ai.ask(prompt, { maxOutputTokens: 2500 });
} catch (err) {
  if (err.retryable) await retryAfter(err.retryAfterMs ?? 2000);
  else if (err.code === 'AI_TRUNCATED') /* vraag meer tokens of kleinere batch */;
  else if (err.code === 'AI_RATE_LIMIT_PLATFORM') /* stop de wachtrij volledig */;
  else if (err.code === 'AI_RATE_LIMIT_APP') /* stop, morgen opnieuw */;
  else throw err;                              // echte bug: laat 'm zien
}
```

`err.message` blijft leesbaar Nederlands, dus bestaande `catch`-blokken die enkel
`err.message` in een toast zetten blijven ongewijzigd werken. `phase` (`guardrail` /
`ratelimit` / `provider` / `stream` / `parse` / `bridge`) maakt in de audit-log en de
console direct zichtbaar waar het brak.

### Waar het toegepast wordt

- **providers** — zetten `code`/`retryAfterMs`/`providerStatus`/`requestId` (uit de
  `request-id`-header: onmisbaar voor een supportvraag aan Anthropic).
- **`lib/ai.js`** — guardrails/rate-limits met eigen codes; logt `code` en
  `stop_reason` mee in `mini_app_ai_calls`, zodat het admin-rapport eindelijk kan
  laten zien *waarom* aanroepen mislukken.
- **`routes.js`** — passende HTTP-status i.p.v. het huidige "alles met een code is 400":
  429 voor rate-limits (**met `Retry-After`-header**), 503 voor overload, 504 voor
  stall, 400 alleen voor echte guardrail-fouten.
- **brug (`apiJson`)** — behoudt `code`/`retryable`/`retryAfterMs` op het Error-object.
  Dit is de reparatie die de hele keten pas laat werken.
- **shim** — de stall-timeout gooit `AI_STALLED` i.p.v. de generieke
  "Verzoek verliep"-tekst, en `send()` blijft voor niet-AI-acties zijn vaste timeout
  houden (die is daar wél verdedigbaar: opslag/Odoo antwoorden in seconden).

---

## 6. Wat er verwijderd wordt

Expliciet, want dit is de helft van de opdracht:

- **`aiAskTimeoutMs()`** — de token-geschaalde cap (30s + 30ms/token, 45–300s). Volledig
  weg. Vervangen door een vaste `AI_STALL_TIMEOUT_MS = 60000` op inactiviteit, plus een
  ruime absolute noodrem (`AI_HARD_TIMEOUT_MS = 900000`) die er alleen is om een
  oneindig hangende iframe-promise te voorkomen — niet om normaal gedrag te begrenzen.
  Die waarde hangt van niets af en hoeft dus nooit meer "op basis van wat er net
  misliep" bijgesteld te worden.
- **Het commentaarblok** erboven dat de geschiedenis van de drie verhogingen documenteert
  (incl. "Blijft dit ooit tekortschieten, dan is server-side streaming de structurele
  oplossing") — vervangen door de beschrijving van het streaming-ontwerp dat die
  aanbeveling nu uitvoert.
- **De timeout-halvering in `digestBatchResilient()`** (§4).
- **`extractJsonObjects()` + `failedLines`-boekhouding** (§3.1).
- **`isTimeoutError()`** en de `/limiet|limit/i`-match op foutteksten (§5).

---

## 7. Implementatievolgorde

1. `lib/ai-errors.js` (nieuw) — het contract eerst, zodat de rest ernaar kan verwijzen.
2. `ai-providers/anthropic.js` — herschreven op SSE + schema + caching + stall.
3. `ai-providers/gemini.js` — zelfde contract (SSE + `responseSchema`), blijft
   uitwisselbaar.
4. `lib/ai.js` — `askAI()` (compat) + `askAIStream()`, model-allowlist, rijkere audit-log.
5. `routes.js` — SSE-variant + correcte statuscodes.
6. `public/mini-apps-core.js` — streamende brug, `apiJson` behoudt codes, cap-hack eruit.
7. `lib/ai-pricing.js` — Sonnet 5/Haiku 4.5/Opus 5 + cache-tarieven.
8. Actiebladen Insights — driefasige digest, schema's, indices, lazy `perQuestion`.
9. **`BUILD_PROMPT` in `public/mini-apps-list.js`** — de bouw-prompt die collega's
   kopiëren om een AI een mini-app te laten bouwen. Dit is geen documentatie achteraf
   maar onderdeel van de API-oppervlak: alles wat daar niet in staat, wordt in élke
   nieuwe app fout gedaan. Zonder deze stap zou elke gegenereerde mini-app opnieuw JSON
   uit tekst vissen, op foutteksten matchen en `maxOutputTokens` krap zetten — precies de
   drie dingen die deze herziening wegneemt. `tests/build-prompt-test.mjs` klinkt de
   prompt vast aan `lib/ai-errors.js`, `lib/ai.js` en de shim, zodat hij niet opnieuw kan
   wegdrijven.

Elke stap volgens de verplichte editeerprocedure uit `CLAUDE.md` §1 (Python-script,
byte-niveau CR-controle, `node --check`, volledige diff nalezen).
