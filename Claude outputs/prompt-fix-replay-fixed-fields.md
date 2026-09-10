# Vaste/automatisch ingevulde velden ontbreken richting Odoo (vooral bij replay)

## Lees eerst
- `src/modules/forminator-sync-v2/worker-handler.js`
- `src/modules/forminator-sync-v2/odoo-client.js`
- `src/modules/forminator-sync-v2/routes.js`
- `src/modules/forminator-sync-v2/tests/replay-status-parity-test.mjs`
- `CLAUDE.md`

## Context

De end-to-end flow werkt: formulierbuilder → WordPress-plugin → Worker → Odoo. Bij **replay** van een submission lijken de vaste, automatisch ingevulde velden (mappings met `source_type: 'static'`, en mogelijk velden die via een resolver in `contextObject` terechtkomen en dan via `source_type: 'context'` gemapt worden) niet mee te komen in de Odoo-payload.

Ik heb de code al doorgenomen in `worker-handler.js` en twee concrete plekken gevonden die de moeite waard zijn om eerst te verifiëren, vóór er iets wordt aangepast:

**1. `replaySubmission()` (rond regel 1870-1924)**
Deze functie pakt `originalSubmission.source_payload` en roept `runSubmissionAttempt(env, { submission, integrationBundle, rawPayload: sourcePayload, mode: 'initial' })` aan — dus **hetzelfde codepad** als een live webhook-call (`handleForminatorV2Webhook` doet uiteindelijk ook `runSubmissionAttempt(..., mode: 'initial')`). Er is dus geen apart "replay-only" transformatiepad dat de vaste velden zou kunnen overslaan puur op basis van hoe de payload wordt opgebouwd — `resolveMappingValue()` (regel 451-522) behandelt `source_type === 'static'` volledig onafhankelijk van form-data of request-context (regel 481-488: `return mapping.source_value` met alleen boolean-coercie). Dat pleit er dus tegen dat "static" mappings zelf stuk zijn — check dit eerst met een concrete test in plaats van er blind van uit te gaan.

**2. Silent-swallowed resolver-fouten (regel 784-794)**
```js
for (const resolver of integrationBundle.resolvers) {
  try {
    await runResolver(env, resolver, normalizedForm, contextObject, resolverLogs);
  } catch (resolverError) {
    if (needsResolver) throw resolverError;
    console.log(attemptTag, 'resolver warning (non-fatal):', resolverError.message);
    resolverLogs.push({ resolver_type: resolver.resolver_type, action: 'skipped', error: resolverError.message });
  }
}
```
`needsResolver` is alleen `true` als er een `registration_composite`-target in de integratie zit (regel 772). Voor targets die alléén `mapped_fields` gebruiken, faalt een resolver dus **stil** — geen submission-failure, geen zichtbare fout, gewoon een lege `contextObject`-key. Als een van de "vaste velden" via `source_type: 'context'` wordt gevuld door zo'n resolver, en die resolver om wat voor reden dan ook faalt (bv. omgevingsverschil, ontbrekende binding, timing), dan verdwijnt dat veld geruisloos — in zowel live als replay, maar het valt vermoedelijk het eerst op bij replay omdat je daar bewust naar output zit te kijken.

## Wat je implementeert

1. **Reproduceer en isoleer eerst.** Pak een concrete submission-id die net gereplayed is waarbij vaste velden ontbraken. Haal de bijbehorende rij op uit de submissions-tabel (via `getSubmissionById` / de admin-UI) en bekijk `resolved_context` en de `resolver_logs` erin. Als je daar `action: 'skipped'`-entries ziet voor de resolver die de vaste velden zou moeten vullen, is hypothese 2 bevestigd.

2. **Als het een resolver-mapping is (source_type: 'context'):**
   Bepaal samen met mij of het acceptabel is dat zo'n resolver-fout de hele target laat falen (fail-loud) in plaats van stil overslaan, of dat we specifiek willen loggen/alarmeren wanneer een non-fatal resolver-fout een mapping treft die niet optioneel hoort te zijn. Stel dit voor als concreet diff-voorstel voor je het doorvoert — dit raakt gedrag voor alle bestaande integraties, niet alleen deze.

3. **Als het toch een `source_type: 'static'` mapping betreft:**
   Controleer of de mapping-rij zelf in de database wel `source_type = 'static'` heeft en een niet-lege `source_value`, en of `listMappingsByTarget(env, target.id)` (regel ~803) die rij ook echt teruggeeft voor de betreffende target — er kan een discrepantie zitten tussen wat de mapping-UI toont en wat er in de DB staat (bv. een mapping die alleen aan een ándere/oudere target hangt).

4. **Voeg een gerichte test toe** in `src/modules/forminator-sync-v2/tests/` die een submission met minstens één `static`-mapping en één `context`-mapping via `runSubmissionAttempt` (of `replaySubmission`) laat lopen en verifieert dat beide velden in de uiteindelijke Odoo-`vals` terechtkomen — zowel bij een verse (`mode: 'initial'`) als bij een replay-run.

## Wat je NIET aanraakt

- Geen wijzigingen aan `resolveMappingValue()` se semantiek voor `source_type: 'form'` of `'template'` — die lijken niet gerelateerd aan dit probleem.
- Geen wijzigingen aan de retry-flow (`isRetryAttempt` / `restoreResolverContext`) tenzij blijkt dat replay en retry per ongeluk hetzelfde codepad gebruiken op een plek waar dat niet hoort.
- Geen aanpassingen aan de WordPress-plugin of formulierbuilder-UI.
- Geen nieuwe UI — dit is een backend/Worker-fix.
- Raak geen legacy `ui.js`-bestanden aan.

Lees ook `CLAUDE.md` voor de projectregels.
