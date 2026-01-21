# Debug Snapshot - Workflow Builder State/Contract Issue

## 1. Wat is volgens mij het EINDDOEL?

De gebruiker moet een visuele workflow builder gebruiken om Forminator-formulieren te mappen naar Odoo acties (create, update, search). Workflow values moeten dynamische tekst bevatten met placeholders in de vorm `${namespace.field}`. Tagify biedt een mix-mode editor waar gebruikers kunnen typen, drag-and-drop velden invoegen, en tokens visueel kunnen beheren. Bij save moet de workflow naar de backend als JSON met uitsluitend strings. Bij reload moeten deze strings weer in Tagify geladen worden zonder data verlies. Het contract (`${namespace.field}`) moet end-to-end gehandhaafd blijven.

## 2. Wat betekent "WERKEND"?

**UI gedrag:**
- Typen van `${field.name}` in Tagify toont een tag
- Drag & drop van een field badge voegt `${field.fieldname}` toe
- Deleten van een tag update de underlying string
- Rechterkolom "result chips" zijn draggable badges met `${stepname.field}` syntax

**State vorm:**
```javascript
workflowSteps[0].create = {
  name: "${field.first_name} ${field.last_name}",
  email: "${field.email}"
}
// Altijd strings, nooit arrays of objects
```

**Save payload:**
```json
{
  "workflow": [{
    "create": {
      "name": "${field.first_name} ${field.last_name}"
    }
  }]
}
```

**Reload gedrag:**
- Backend stuurt strings terug
- Frontend laadt strings in Tagify zonder normalisatie errors
- UI toont correcte tags
- State blijft strings

## 3. Waar staan we NU?

**Wat werkt correct:**
- Backend validator werkt (HTTP 400 op contractbreuk)
- `normalizeInputValueForTagify()` migreert legacy formaten
- `getInputValue()` serialiseert Tagify naar strings
- `updateCreateValue()` en `updateUpdateValue()` slaan `String(value)` op
- Tagify initialiseert synchronous

**Wat werkt niet:**
- Rechterkolom chips tonen `$stepname.field` ipv `${stepname.field}`
- Domain values gebruiken niet `getInputValue()` voor serialization
- `JSON.parse(data.workflow)` laadt oude arrays/objects direct in state zonder validatie
- 11 verschillende state-write punten zonder centrale contract enforcement

**Primaire blokkade:**
Deserialization op regel 560 plaatst backend data direct in `workflowSteps` zonder contractvalidatie, waardoor oude arrays/objects de state verontreinigen.

## 4. Functionele analyse (samengevat)

- **UI laag**: Tagify mix-mode editor, drag & drop handlers, render functies
- **State laag**: `workflowSteps` array met create/update/search objects
- **Serialization laag**: `getInputValue()` voor Tagify → string, `normalizeInputValueForTagify()` voor string → Tagify
- **Mapping laag**: 11 functies schrijven naar `workflowSteps` (create, update, domain)
- **Backend laag**: `validateMappingData()` valideert contract voor save
- **Verantwoordelijkheidslek**: State writes gebeuren overal zonder centrale validatie
- **Contract breekt bij**: Load (regel 560), domain updates (regel 2659), key updates (regel 3114)
- **Normalisatie is reactive**: Alleen bij render, niet bij load of direct state mutation
- **Type metadata**: `_ui_metadata.create_types` bestaat maar wordt genegeerd sinds String(value) refactor
- **Save/load asymmetrie**: Backend valideert, frontend deserialiseert blind

## 5. Harde aannames die jij momenteel maakt

**Over state:**
- `workflowSteps` is de single source of truth
- Alle dynamic values zitten in `.create[key]`, `.update.fields[key]`, `.search._customDomain[i][2]`
- State bevat ALLEEN data die gesaved moet worden (+ UI metadata in `._ui_metadata`)

**Over Tagify:**
- `tagify.value` is altijd een string in mix-mode (geen array van objects)
- Tagify accepteert strings met `${...}` tokens zonder crashes
- Tagify is read-only voor serialization (nooit bron van state)

**Over serialization:**
- `getInputValue(input)` is de enige correcte manier om van input → string te gaan
- `String(value)` is voldoende voor state storage (geen parsing nodig)
- `normalizeInputValueForTagify()` moet VOOR Tagify init draaien, niet na state write

**Over save/reload:**
- Backend accepteert alleen contract-compliant strings (hard validator)
- Backend stuurt exact terug wat hij ontving (geen transformatie)
- Reload betekent backend data → state → Tagify init
- Oude data in database kan non-compliant zijn

## 6. Open vragen of onzekerheden

1. **Waarom bestaat `updateUpdateValueKey` (regel 3114) nog met `value || ''` ipv `String(value)`?**
   - Is dit een gemiste refactor of intentioneel?

2. **Hoe moet `_customDomain[i][2]` values worden behandeld?**
   - Zijn dit strings met `${...}` tokens of primitives (integers, booleans)?
   - Moet `updateDomain` ook `getInputValue()` gebruiken?

3. **Wat gebeurt er met oude data in de database?**
   - Crashed backend validator op bestaande mappings?
   - Is er een migratie nodig?

4. **Waarom zijn er 2 add-functies (`addCreateValue`, `addUpdateValue`) die direct `workflowSteps[x][key] = value` schrijven?**
   - Kunnen deze via `updateCreateValue` / `updateUpdateValue` routen?

5. **Moet `normalizeInputValueForTagify()` ook bij load gedraaid worden op alle values?**
   - Of is het voldoende om alleen bij Tagify init te normaliseren?

6. **Hoe zit het met step result chips (`$stepname.field` → `${stepname.field}`)?**
   - Is dit een render bug of moet het format echt anders zijn?
   - Moeten deze chips Tagify-compatible worden?

7. **Zijn er implicit assumptions over `fieldType` die nog state beïnvloeden?**
   - Type metadata wordt opgeslagen maar niet meer gebruikt sinds String(value)
   - Kan dit volledig verwijderd worden?

---

This snapshot represents my best understanding of the system at this moment.
