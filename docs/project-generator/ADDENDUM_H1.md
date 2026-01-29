# ADDENDUM H.1: Blueprint-Level Timing Inheritance (Relatief)

**Status**: ✅ **Geïmplementeerd**  
**Datum**: 2026-01-29  
**Versie**: 1.0  
**Relatie**: Corrigeert en verfijnt Addendum H

---

## 🎯 Probleem Met Addendum H

Addendum H implementeerde timing-overerving **alleen bij preview/generatie**.

Dit betekende:
- ✅ Berekening van absolute datums werkte correct
- ✅ Overerving van milestone naar task werkte bij generatie
- ❌ **Blueprint-aanpassingen reflecteerden niet in de editor**
- ❌ **Gebruiker zag geen feedback over inheritance**

### Concreet Voorbeeld

```
Gebruiker in template editor:
1. Maakt milestone "Phase 1" met deadline +30 dagen
2. Maakt task "Research" met milestone = Phase 1 (geen eigen timing)
3. Wijzigt milestone deadline naar +45 dagen

Resultaat VOOR Addendum H.1:
- Editor toont: Task "Research" heeft geen timing-indicator
- Preview toont: Correct, deadline = projectstart + 45 dagen ✓
- Maar: Gebruiker ziet geen relatie in editor ✗

Resultaat NA Addendum H.1:
- Editor toont: Task "Research" → badge "Erft van Phase 1" ✓
- Preview toont: Correct, deadline = projectstart + 45 dagen ✓
- Gebruiker begrijpt: Task volgt milestone ✓
```

---

## 🧠 Kernprincipe: Drie Lagen

### Laag 1: Blueprint (RELATIEF)

**Wat**: Template-definitie met relatieve timing

**Data**:
```json
{
  "milestones": [
    {
      "id": "m1",
      "name": "Phase 1",
      "deadline_offset_days": 30,
      "duration_days": 14
    }
  ],
  "tasks": [
    {
      "id": "t1",
      "name": "Research",
      "milestone_id": "m1",
      "deadline_offset_days": null  // Geen eigen timing = erven
    }
  ]
}
```

**Gedrag**:
- Timing is **relatief** (offsets, geen datums)
- Inheritance is **relationeel** (task → milestone link)
- UI toont **inheritance-indicators** (badges)
- **Tijdloos** (geen projectstartdatum nodig)

**Addendum H.1 Toevoeging**:
```json
// Runtime flags (niet opgeslagen, alleen in-memory)
{
  "tasks": [
    {
      "id": "t1",
      "name": "Research",
      "_inheritsTimingFromMilestone": true,  // FLAG
      "_inheritedMilestoneName": "Phase 1"   // Voor UI
    }
  ]
}
```

---

### Laag 2: Preview (ABSOLUUT)

**Wat**: Berekende weergave met absolute datums

**Input**: Blueprint + projectstartdatum (user input)

**Data**:
```json
{
  "tasks": [
    {
      "name": "Research",
      "date_deadline": "2026-03-07",      // ABSOLUUT
      "planned_date_begin": "2026-02-17"  // ABSOLUUT
    }
  ]
}
```

**Gedrag**:
- Timing is **absoluut** (ISO datums)
- Berekend vanaf projectstartdatum
- **Bewerkbaar** (user kan overschrijven)
- **Tijdelijk** (alleen voor deze generatie)

---

### Laag 3: Generatie (DEFINITIEF)

**Wat**: Daadwerkelijke Odoo-creatie

**Input**: Preview model (evt. met overrides)

**Output**: Odoo project + tasks met absolute datums

**Gedrag**:
- Timing is **definitief** (naar Odoo geschreven)
- **Onveranderbaar** (geen rollback)
- Gebruikt preview-data (incl. overrides)

---

## 📐 Wat Addendum H.1 Toevoegt

### 1. Blueprint-Level Inheritance Engine

**Nieuwe functie**: `recalculateRelativeTiming()`

**Doel**: Markeer taken die timing erven (RELATIONEEL, niet data-kopiërend)

**Implementatie**:
```javascript
function recalculateRelativeTiming() {
  // Voor elke task:
  blueprintState.tasks.forEach(task => {
    // Clear oude flags
    task._inheritsTimingFromMilestone = false;
    task._inheritsTimingFromParent = false;
    
    // H.1: SUBTASK INHERITANCE (DOMINANT)
    if (task.parent_id) {
      const parent = parentMap.get(task.parent_id);
      
      // Auto-sync milestone en tags van parent
      if (parent.milestone_id) {
        task.milestone_id = parent.milestone_id;
      }
      if (parent.tag_ids && parent.tag_ids.length > 0) {
        task.tag_ids = [...parent.tag_ids];
      }
      
      // Markeer timing inheritance (geen data kopiëren!)
      if (!task.deadline_offset_days && parent heeft timing) {
        task._inheritsTimingFromParent = true;
      }
    }
    
    // H.1: MILESTONE INHERITANCE
    if (task.milestone_id && !task.deadline_offset_days) {
      const milestone = milestoneMap.get(task.milestone_id);
      if (milestone heeft timing) {
        task._inheritsTimingFromMilestone = true;
        task._inheritedMilestoneName = milestone.name;
      }
    }
  });
  
  // Re-render UI
  renderTasks();
}
```

**Cruciale Details**:
- ❌ **GEEN data kopiëren** (`task.deadline_offset_days` blijft null)
- ✅ **WEL flags zetten** (`_inheritsTimingFromMilestone = true`)
- ✅ **Relationeel** (task → milestone link blijft leidend)

---

### 2. UI Inheritance Indicators

**In task list** (blueprint editor):

**Vóór Addendum H.1**:
```
┌────────────────────────────────────┐
│ Research [Phase 1]                 │  ← Alleen milestone naam
└────────────────────────────────────┘
```

**Na Addendum H.1**:
```
┌────────────────────────────────────────────────────┐
│ Research [Phase 1] [↓ Erft van Phase 1]           │
│                      ^^^ NIEUWE BADGE              │
└────────────────────────────────────────────────────┘
```

**Implementatie**:
```javascript
if (task._inheritsTimingFromMilestone) {
  const badge = document.createElement('span');
  badge.className = 'badge badge-sm badge-info ml-2';
  badge.innerHTML = '<i data-lucide="arrow-down-from-line"></i> Erft van ' + task._inheritedMilestoneName;
  badge.title = 'Deze taak erft timing van milestone (relatief)';
  leftDiv.appendChild(badge);
}
```

**Varianten**:
- **Erft van milestone**: Badge met icoon `arrow-down-from-line`
- **Erft van parent**: Badge met icoon `corner-down-right` (subtask)
- **Expliciete timing**: Bestaande klok-badge met dagen/uren

---

### 3. Trigger Points

**Wanneer wordt `recalculateRelativeTiming()` aangeroepen?**

| Event | Waarom | Effect |
|-------|--------|--------|
| **Milestone save** | Timing kan zijn gewijzigd | Alle tasks met die milestone herberekenen flags |
| **Task milestone change** | Nieuwe inheritance-relatie | Task flags updaten |
| **Task timing change** | Van expliciete → inheritance of vice versa | Flags updaten |
| **Blueprint load** | Initiële state | Alle inheritance flags initialiseren |
| **Task parent change** | Subtask krijgt nieuwe parent | Parent inheritance toepassen |

**Code**:
```javascript
// Na milestone save
function handleMilestoneSubmit(e) {
  // ... milestone save logic ...
  
  recalculateRelativeTiming();  // ← TRIGGER
  validateAndDisplay();
}

// Na task save
function handleTaskSubmit(e) {
  // ... task save logic ...
  
  recalculateRelativeTiming();  // ← TRIGGER
  validateAndDisplay();
}

// Na blueprint load
async function loadBlueprint() {
  // ... load logic ...
  
  renderAllSections();
  recalculateRelativeTiming();  // ← TRIGGER
}
```

---

## 🔄 Data Flow: Blueprint → Preview → Generatie

### Scenario: Milestone Timing Wijzigen

**STAP 1: Blueprint Editor (RELATIEF)**

```
Gebruiker wijzigt milestone "Phase 1":
  deadline_offset_days: 30 → 45

recalculateRelativeTiming() triggert:
  - Task "Research" (milestone = Phase 1, geen eigen timing):
    _inheritsTimingFromMilestone = true
    _inheritedMilestoneName = "Phase 1"

UI toont:
  Research [Phase 1] [↓ Erft van Phase 1]
              ^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^
              bestaand  NIEUW (Addendum H.1)
```

**Blueprint data** (opgeslagen):
```json
{
  "milestones": [
    { "id": "m1", "name": "Phase 1", "deadline_offset_days": 45, "duration_days": 14 }
  ],
  "tasks": [
    { 
      "id": "t1", 
      "name": "Research", 
      "milestone_id": "m1",
      "deadline_offset_days": null  // ← BLIJFT NULL (geen data kopiëren!)
    }
  ]
}
```

**Runtime flags** (niet opgeslagen):
```json
{
  "tasks": [
    {
      "id": "t1",
      "_inheritsTimingFromMilestone": true,
      "_inheritedMilestoneName": "Phase 1"
    }
  ]
}
```

---

**STAP 2: Preview (ABSOLUUT)**

```
Gebruiker klikt "Generate Project"
  → showProjectStartDateModal()
  → Kiest: 2026-02-01

buildGenerationModel() berekent:
  1. Milestone "Phase 1" timing:
     deadline = 2026-02-01 + 45 werkdagen = 2026-04-03
     start = 2026-04-03 - 14 werkdagen = 2026-03-14
  
  2. Task "Research" (geen eigen timing, heeft milestone):
     deadline = milestone.deadline = 2026-04-03
     start = milestone.start = 2026-03-14

Preview toont:
  Research  │ Start: 2026-03-14  │ Deadline: 2026-04-03  │
            │ [edit] [edit]       │ ← Bewerkbaar          │
```

**Generation Model** (tijdelijk):
```json
{
  "tasks": [
    {
      "blueprint_id": "t1",
      "name": "Research",
      "planned_date_begin": "2026-03-14",  // ABSOLUUT
      "date_deadline": "2026-04-03"        // ABSOLUUT
    }
  ]
}
```

---

**STAP 3: Generatie (DEFINITIEF)**

```
Gebruiker klikt "Confirm & Generate"

generateProject() schrijft naar Odoo:
  - project.task "Research":
    planned_date_begin: 2026-03-14
    date_deadline: 2026-04-03
```

---

## 🔍 Verschil: Data Kopiëren vs Relationeel Markeren

### ❌ Verkeerd: Data Kopiëren (NIET doen)

```javascript
// FOUT: Kopieer offset van milestone naar task
if (task.milestone_id && !task.deadline_offset_days) {
  const milestone = milestones.find(m => m.id === task.milestone_id);
  task.deadline_offset_days = milestone.deadline_offset_days;  // ← FOUT!
}
```

**Problemen**:
- Task heeft nu **eigen data** (`deadline_offset_days = 30`)
- Bij milestone-wijziging blijft task **oude waarde** houden
- **Geen inheritance meer** (task is "losgeraakt")

---

### ✅ Correct: Relationeel Markeren (Addendum H.1)

```javascript
// CORRECT: Markeer inheritance met flag
if (task.milestone_id && !task.deadline_offset_days) {
  const milestone = milestones.find(m => m.id === task.milestone_id);
  if (milestone.deadline_offset_days) {
    task._inheritsTimingFromMilestone = true;  // ← FLAG
    task._inheritedMilestoneName = milestone.name;
    // task.deadline_offset_days blijft null!
  }
}
```

**Voordelen**:
- Task **blijft null** (`deadline_offset_days = null`)
- Bij milestone-wijziging **update automatisch** (re-calculate flags)
- **Inheritance blijft intact** (relationeel)

---

## 🎨 UI/UX Voorbeelden

### Scenario 1: Expliciete Timing

**Blueprint**:
```json
{
  "tasks": [
    {
      "name": "Build prototype",
      "deadline_offset_days": 20,
      "duration_days": 5,
      "planned_hours": 16
    }
  ]
}
```

**UI toont**:
```
Build prototype [⏰ 20d, 5d, 16h]
                 ^^^^^^^^^^^^^^^^
                 Expliciete timing
```

---

### Scenario 2: Milestone Inheritance

**Blueprint**:
```json
{
  "milestones": [
    { "id": "m1", "name": "Discovery", "deadline_offset_days": 14 }
  ],
  "tasks": [
    {
      "name": "User interviews",
      "milestone_id": "m1",
      "deadline_offset_days": null
    }
  ]
}
```

**UI toont**:
```
User interviews [Discovery] [↓ Erft van Discovery]
                ^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^
                milestone    inheritance indicator
```

---

### Scenario 3: Parent Inheritance (Subtask)

**Blueprint**:
```json
{
  "tasks": [
    {
      "id": "p1",
      "name": "Build landing page",
      "deadline_offset_days": 10
    },
    {
      "id": "s1",
      "name": "Design header",
      "parent_id": "p1",
      "deadline_offset_days": null
    }
  ]
}
```

**UI toont**:
```
Build landing page [⏰ 10d]
  └─ Design header [↪ Erft van parent]
                    ^^^^^^^^^^^^^^^^^^
                    parent inheritance
```

---

## 🚧 Architecturale Beslissingen

### Waarom Runtime Flags?

**Vraag**: Waarom `_inheritsTimingFromMilestone` niet opslaan in database?

**Antwoord**: Omdat het **afgeleid** is, niet primair.

**Analogie**: Index in een database
- **Primaire data**: milestone_id, deadline_offset_days
- **Afgeleide data**: _inheritsTimingFromMilestone (berekend van primaire data)

**Voordelen**:
- ✅ Single source of truth (milestone timing)
- ✅ Geen sync-problemen
- ✅ Herberekening is goedkoop (pure function)

---

### Waarom Geen Automatische Preview Updates?

**Vraag**: Als milestone wijzigt, waarom preview niet automatisch updaten?

**Antwoord**: Preview is **gebruikerscontext**, niet blueprint.

**Scenario**:
```
1. Gebruiker opent preview (projectstart = 2026-02-01)
2. Past deadline aan: 2026-02-05 → 2026-02-10
3. Annuleert preview
4. Wijzigt milestone in blueprint
5. Opent preview opnieuw (projectstart = 2026-03-01)

Resultaat:
- Preview berekent opnieuw vanaf blueprint (geen oude overrides)
- Gebruiker ziet nieuwe datums (nieuwe projectstart)
```

**Principe**: Preview is **stateless per sessie**.

---

## ✅ Acceptatiecriteria

### Blueprint Editor

- [x] Milestone-timing wijziging reflecteert onmiddellijk op onderliggende taken
- [x] Tasks tonen "Erft van [milestone]" badge indien inheritance
- [x] Subtasks tonen "Erft van parent" badge indien inheritance
- [x] Expliciete timing blijft zichtbaar met klok-badge
- [x] Geen absolute datums in editor (blijft tijdloos)

### Preview

- [x] Berekent correcte absolute datums vanaf blueprint
- [x] Gebruikt inheritance-regels (milestone → task, parent → subtask)
- [x] Preview-overrides blijven mogelijk (bewerkbare inputs)
- [x] Override-flag wordt gezet bij manuele wijziging

### Blueprint Data

- [x] Inheritance flags zijn runtime-only (niet opgeslagen)
- [x] `deadline_offset_days` blijft null bij inheritance (geen data-kopi\u00ebren)
- [x] Relationele integriteit blijft behouden (milestone_id link)

### Backward Compatibility

- [x] Bestaande blueprints zonder timing blijven werken
- [x] Bestaande blueprints met expliciete timing blijven werken
- [x] Geen migraties nodig
- [x] Geen breaking changes

---

## 🔗 Relatie met Addendum H

### Wat Addendum H Deed

- ✅ Milestone-timing schema (`deadline_offset_days`, `duration_days`)
- ✅ Task-timing schema (idem)
- ✅ Preview berekent absolute datums
- ✅ Generatie gebruikt absolute datums
- ✅ Inheritance logica in `buildGenerationModel()`

### Wat Addendum H Miste

- ❌ **Blueprint-level feedback** (geen UI indicators)
- ❌ **Reactieve inheritance** (wijzigingen niet zichtbaar in editor)
- ❌ **Gebruikersinzicht** (relaties onduidelijk)

### Wat Addendum H.1 Toevoegt

- ✅ **Runtime inheritance flags** (`_inheritsTimingFromMilestone`)
- ✅ **UI indicators** (badges in task list)
- ✅ **Trigger mechanisme** (`recalculateRelativeTiming()`)
- ✅ **Blueprint-level reactivity** (wijzigingen onmiddellijk zichtbaar)

### Geen Conflicten

- Addendum H.1 **breidt uit** de blueprint-laag
- Addendum H.1 **hergebruikt** de preview/generatie logica
- **Geen wijzigingen** aan data schema (alleen runtime flags)
- **Geen breaking changes**

---

## 📊 Before/After Comparison

### Milestone Timing Wijziging

**VOOR Addendum H.1**:
```
Editor:
  Milestone "Phase 1": deadline +30 dagen → +45 dagen
  Task "Research" (milestone = Phase 1):
    UI: [Phase 1]  ← Geen timing info
    Data: deadline_offset_days = null

Preview:
  Task "Research":
    deadline = 2026-04-03  ✓ (correct berekend)

Probleem: Gebruiker ziet geen relatie tussen milestone en task timing
```

**NA Addendum H.1**:
```
Editor:
  Milestone "Phase 1": deadline +30 dagen → +45 dagen
  Task "Research" (milestone = Phase 1):
    UI: [Phase 1] [↓ Erft van Phase 1]  ← NIEUW
    Data: deadline_offset_days = null
    Flag: _inheritsTimingFromMilestone = true  ← NIEUW

Preview:
  Task "Research":
    deadline = 2026-04-03  ✓ (correct berekend)

Oplossing: Gebruiker ziet inheritance, begrijpt relatie
```

---

## 🚀 Deployment Checklist

- [x] Client-side: `recalculateRelativeTiming()` functie
- [x] Client-side: UI badges voor inheritance
- [x] Client-side: Triggers na milestone/task save
- [x] Client-side: Trigger na blueprint load
- [x] Documentation: ADDENDUM_H1.md
- [x] Testing: Alle scenario's handmatig getest
- [x] Git: Eén commit met alle wijzigingen

---

## 📚 Gerelateerde Documenten

- [ADDENDUM_H.md](./ADDENDUM_H.md) — Timing Inheritance & UX Refinement (origineel)
- [ADDENDUM_G.md](./ADDENDUM_G.md) — Task Timings, Deadlines & Planned Hours
- [ITERATION_4_SUMMARY.md](./ITERATION_4_SUMMARY.md) — Project Generation Pipeline

---

## 🎓 Lessons Learned

### Wat Goed Werkte

1. **Scheiding van concerns**: Blueprint (relatief) vs Preview (absoluut)
2. **Relationele flags**: Geen data kopiëren, alleen markeren
3. **UI feedback**: Inheritance onmiddellijk zichtbaar
4. **Stateless preview**: Geen verborgen state, altijd herberekend

### Wat Te Vermijden

1. **Data duplicatie**: Offsets NIET kopiëren naar tasks
2. **Impliciete state**: Preview-overrides NIET in blueprint opslaan
3. **Automatische updates**: Preview NIET auto-updaten bij blueprint-wijziging

### Future Improvements (Niet in H.1)

- **Bulk inheritance toggle**: "Pas milestone timing toe op alle taken"
- **Inheritance visualization**: Graph view van milestone → task relaties
- **Conflict detection**: Waarschuwing bij timing overlap tussen parent en subtask

---

**Blueprint bepaalt relaties.  
Preview bepaalt datums.  
Generatie volgt preview.**
