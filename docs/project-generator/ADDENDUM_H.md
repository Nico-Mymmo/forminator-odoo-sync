# ADDENDUM H: Timing Inheritance & UX Refinement

**Status**: ✅ **Geïmplementeerd**  
**Datum**: 2026-01-29  
**Versie**: 1.0  
**Relatie**: Bouwt voort op Addendum G (Task Timings)

---

## 🎯 Doelstelling

Verfijn en verdiep de timing-functionaliteit uit Addendum G door:
1. **Verbeterde UX** voor projectstartdatum (datepicker i.p.v. prompt)
2. **Preview met bewerkbare datums** (transparantie + controle)
3. **Milestone-timing** (deadlines en duur voor milestones)
4. **Automatische overerving** (van milestones naar taken, van parent naar subtasks)
5. **Override-detectie** (waarschuwingen bij handmatige aanpassingen)

**Kernprincipe**: Addendum H voegt **geen nieuwe timinglogica** toe, maar maakt timing **begrijpelijk en voorspelbaar** voor gebruikers.

---

## 🧠 Filosofie: "Overerving, Geen Magie"

### Waarom overerving?

Templates zijn **herbruikbaar**. Als je een milestone "Phase 1: Discovery" definieert met een deadline van 30 dagen, dan:
- Moeten **alle taken in die milestone** automatisch binnen die 30 dagen vallen
- Moeten **subtasks** automatisch dezelfde deadline erven als hun parent

**Zonder overerving** moet de gebruiker elke deadline handmatig kopiëren → foutgevoelig en tijdrovend.

### Waarom geen automatische overschrijving?

Als een gebruiker **bewust** een taak aanpast in de preview:
- Is dat een **intentionele beslissing**
- Mag het systeem die beslissing **niet stilletjes terugdraaien**

**Wel**: Subtiele waarschuwing: "Deze taak had manueel aangepaste datums. Controleer of deze nog correct zijn."  
**Niet**: Automatische reset naar milestone-timing.

---

## 📐 H1: Projectstartdatum via Datepicker (UX)

### Probleem (voor Addendum H)

```javascript
const projectStartDate = prompt('Enter project start date (YYYY-MM-DD)...');
```

**Nadelen**:
- Vrije tekstinput → typfouten (2026-02-31 is invalide)
- Geen visuele kalender
- Onprofessioneel voor een moderne webapp

### Oplossing (Addendum H)

**Native HTML5 datepicker** in modal:
```html
<input type="date" class="input input-bordered" required />
```

**Kenmerken**:
- ✅ Verplicht veld (geen lege waarde)
- ✅ Visuele kalender (browser-native)
- ✅ Datum-validatie (browser blokkeert 31 februari)
- ✅ Min-datum = vandaag (geen projecten in het verleden)
- ✅ Default waarde = vandaag

**Implementatie**:
```javascript
async function showProjectStartDateModal() {
  return new Promise((resolve) => {
    // Create modal with date input
    // Return selected date or null if cancelled
  });
}
```

---

## 📐 H2: Preview Toont én Laat Aanpassen

### Probleem (voor Addendum H)

Preview toonde alleen:
- Taaknaam (bewerkbaar)
- Milestone badge (read-only)
- Verwijder-knop

**Timing was onzichtbaar** → gebruiker had geen controle of inzicht.

### Oplossing (Addendum H)

**Toon per taak** (indien aanwezig):
```
┌──────────────────────────────────────────────────────────┐
│ [icon] Task Name [Milestone]  Start   Deadline   Hours  │
│                                2026-02-01  2026-02-05  8 │
└──────────────────────────────────────────────────────────┘
```

**Bewerkbaar**:
- Start date: `<input type="date">`
- Deadline: `<input type="date">`
- Hours: `<input type="number" step="0.5">`

**Override-tracking**:
```javascript
dateInput.onchange = () => {
  task.date_deadline = dateInput.value;
  task._manualOverride = true; // Markeer als manueel aangepast
};
```

**Gebruik**:
- Gebruiker past deadline aan van 2026-02-05 → 2026-02-10
- Bij generatie wordt 2026-02-10 gebruikt (niet de berekende waarde)
- `task._manualOverride = true` voorkomt latere automatische reset

---

## 📐 H3: Milestones Krijgen Timing

### Waarom?

Milestone = "belangrijke mijlpaal in project".  
Als "Phase 1: Discovery" 30 dagen duurt en moet eindigen op dag 30:
- **Milestone zelf** moet die timing vastleggen
- **Taken in die milestone** erven die timing

### Data Schema

**Blueprint (template storage)**:
```json
{
  "milestones": [
    {
      "id": "milestone-1",
      "name": "Phase 1: Discovery",
      "deadline_offset_days": 30,  // Optioneel: int, relatief t.o.v. project start
      "duration_days": 14            // Optioneel: int, aantal werkdagen
    }
  ]
}
```

**Generation Model (runtime calculation)**:
```json
{
  "milestones": [
    {
      "blueprint_id": "milestone-1",
      "name": "Phase 1: Discovery"
      // Note: Odoo project.milestone heeft GEEN date_deadline of duration velden
      // Deze waarden worden alleen gebruikt voor task-timing inheritance
    }
  ]
}
```

**Waarom milestone-timing NIET naar Odoo gaat**:
- Odoo `project.milestone` heeft **geen timing-velden**
- Milestone-timing is **alleen voor task-berekeningen**
- Taken krijgen `milestone_id` link, maar geen milestone-deadlines

### UI (Blueprint Editor)

**Milestone Modal** krijgt extra velden:
```
┌─────────────────────────────────────────┐
│ Add Milestone                           │
├─────────────────────────────────────────┤
│ Name: Phase 1                          │
│                                         │
│ ────── Timing (Optional) ──────        │
│                                         │
│ Deadline Offset: [30] days             │
│ (after project start)                   │
│                                         │
│ Duration: [14] days                     │
│ (workdays this milestone spans)         │
│                                         │
│         [Cancel]  [Save]                │
└─────────────────────────────────────────┘
```

**Milestone List** toont timing (indien aanwezig):
```
Phase 1: Discovery
  Deadline: +30 days • Duration: 14 days
```

---

## 📐 H4: Taken Erven Timing van Milestone

### Basisregel

**Als een taak geen eigen timing heeft** (geen `deadline_offset_days`):
- Erft `start_date` en `deadline` van zijn milestone

**Voorbeeld**:
```
Milestone: "Phase 1" (deadline +30 dagen, duration 14 dagen)
  → start_date = projectStart + 16 werkdagen (30 - 14)
  → deadline = projectStart + 30 werkdagen

Taak: "Research competitors" (milestone_id = Phase 1, geen eigen timing)
  → Erft: start_date = projectStart + 16 werkdagen
  → Erft: deadline = projectStart + 30 werkdagen
```

### Implementatie (generate.js)

**Milestone-timing berekenen**:
```javascript
const milestoneTimingMap = new Map();

blueprint.milestones.forEach(milestone => {
  let milestone_start_date = null;
  let milestone_deadline = null;
  
  if (projectStartDate && milestone.deadline_offset_days) {
    milestone_deadline = addWorkdays(projectStartDate, milestone.deadline_offset_days);
    
    if (milestone.duration_days) {
      milestone_start_date = subtractWorkdays(milestone_deadline, milestone.duration_days);
    }
  }
  
  milestoneTimingMap.set(milestone.id, {
    start_date: milestone_start_date,
    deadline: milestone_deadline
  });
});
```

**Task-timing met milestone-fallback**:
```javascript
blueprint.tasks.forEach(task => {
  let planned_date_begin = null;
  let date_deadline = null;
  
  // H4: Inherit from milestone if no task-specific timing
  if (projectStartDate && task.milestone_id && !task.deadline_offset_days) {
    const milestoneTiming = milestoneTimingMap.get(task.milestone_id);
    if (milestoneTiming) {
      date_deadline = milestoneTiming.deadline;
      planned_date_begin = milestoneTiming.start_date;
    }
  }
  
  // Task's own timing overrides milestone inheritance
  if (projectStartDate && task.deadline_offset_days) {
    date_deadline = addWorkdays(projectStartDate, task.deadline_offset_days);
    // ... calculate start from duration
  }
});
```

**Prioriteit** (hoogste eerst):
1. Taak heeft eigen `deadline_offset_days` → **gebruik die**
2. Taak heeft milestone met timing → **erf van milestone**
3. Geen milestone of milestone zonder timing → **geen timing**

---

## 📐 H5: Milestone Wisselgedrag

### Scenario

Gebruiker wijzigt milestone van een taak:
```
Task: "Write requirements doc"
  Was: Milestone A (deadline +14 dagen)
  Nu:  Milestone B (deadline +30 dagen)
```

### Gedrag

**Als taak GEEN manuele overrides heeft**:
- Start- en deadline volgen **automatisch** de nieuwe milestone
- Geen waarschuwing nodig (verwacht gedrag)

**Als taak WEL manuele overrides heeft** (via preview):
```javascript
if (task._manualOverride) {
  showToast('⚠️ Deze taak had manueel aangepaste datums. Controleer of deze nog correct zijn.', 'warning');
}
```

**Waarom geen automatische reset?**
- Gebruiker paste bewust timing aan in preview
- Milestone-wissel kan per ongeluk zijn
- Gebruiker moet **zelf beslissen** of timing nog klopt

**Waarom geen blocking dialog?**
- Niet kritiek genoeg voor modal
- Subtiele toast is voldoende
- Geen workflow-verstoring

---

## 📐 H6: Subtask Inheritance (VERPLICHT)

### Principe

**Parent → Subtask is DOMINANT**.  
Subtasks zijn **onderdelen van hun parent** → moeten dezelfde eigenschappen erven.

### Wat erven subtasks?

```javascript
if (task.parent_id) {
  const parentBlueprint = blueprint.tasks.find(t => t.id === task.parent_id);
  
  if (parentBlueprint) {
    // 1. Milestone (ALTIJD)
    task.milestone_id = parentBlueprint.milestone_id;
    
    // 2. Tags (ALTIJD)
    task.tag_ids = [...parentBlueprint.tag_ids];
    
    // 3. Timing (indien subtask geen eigen waarden heeft)
    if (!task.deadline_offset_days && parentBlueprint.deadline_offset_days) {
      task.deadline_offset_days = parentBlueprint.deadline_offset_days;
    }
    if (!task.duration_days && parentBlueprint.duration_days) {
      task.duration_days = parentBlueprint.duration_days;
    }
    if (!task.planned_hours && parentBlueprint.planned_hours) {
      task.planned_hours = parentBlueprint.planned_hours;
    }
  }
}
```

### Voorbeeld

**Parent Task**:
```json
{
  "name": "Build landing page",
  "milestone_id": "phase-1",
  "tag_ids": ["urgent", "client-facing"],
  "deadline_offset_days": 10,
  "duration_days": 3,
  "planned_hours": 8
}
```

**Subtask** (zonder eigen config):
```json
{
  "name": "Design wireframe",
  "parent_id": "parent-123"
  // Geen milestone_id, tags, of timing
}
```

**Resultaat na inheritance**:
```json
{
  "name": "Design wireframe",
  "parent_id": "parent-123",
  "milestone_id": "phase-1",          // ← INHERITED
  "tag_ids": ["urgent", "client-facing"], // ← INHERITED
  "deadline_offset_days": 10,         // ← INHERITED
  "duration_days": 3,                 // ← INHERITED
  "planned_hours": 8                  // ← INHERITED
}
```

### Waarom?

**Zonder overerving**:
- Parent: "Build landing page" → deadline 10 dagen
- Subtask: "Design wireframe" → **geen deadline** (?) → incoherent

**Met overerving**:
- Subtask erft automatisch deadline
- Consistent en voorspelbaar
- Minder configuratie-werk voor gebruiker

---

## 🔄 Overzicht: Inheritance Cascade

```
Project Start Date (2026-02-01)
    ↓
Milestone Timing (Phase 1: +30 dagen, 14 dagen duur)
    → start: 2026-02-17
    → deadline: 2026-03-07
    ↓
Parent Task (geen eigen timing, milestone = Phase 1)
    → Erft van milestone:
       start: 2026-02-17
       deadline: 2026-03-07
    ↓
Subtask (geen eigen timing, parent = Parent Task)
    → Erft van parent:
       milestone: Phase 1
       tags: [urgent]
       start: 2026-02-17
       deadline: 2026-03-07
```

**Prioriteit (hoogste eerst)**:
1. **Expliciete taak-timing** (`deadline_offset_days` op taak zelf)
2. **Parent-overerving** (indien subtask)
3. **Milestone-overerving** (indien geen eigen timing en milestone heeft timing)
4. **Geen timing** (valide scenario)

---

## 🚧 Architecturale Compliance

### ✅ Wat Addendum H DOET

- **UX-verbetering**: Datepicker i.p.v. prompt
- **Transparantie**: Preview toont berekende datums
- **Overerving**: Milestone → Task, Parent → Subtask
- **Override-detectie**: Waarschuwing bij handmatige aanpassingen
- **Consistent gedrag**: Voorspelbare cascade

### ❌ Wat Addendum H NIET doet

- **Geen nieuwe timingvelden** (gebruikt bestaande `deadline_offset_days`, `duration_days`)
- **Geen dependency-based planning** (dependencies zijn nog steeds alleen voor Odoo task links)
- **Geen Gantt-functionaliteit**
- **Geen automatische herplanning** (gebruiker heeft volledige controle)
- **Geen kalenderinstellingen** (weekenden zijn hardcoded: za/zo)
- **Geen feestdagen** (simpel werkdag-model)

---

## 📊 Data Flow

### 1. Template Creation (Blueprint Editor)

```
Gebruiker definieert:
  - Milestones met optionele timing (deadline_offset_days, duration_days)
  - Tasks met optionele timing
  - Subtasks (erven automatisch van parent)

Blueprint opgeslagen als:
{
  "milestones": [...],
  "tasks": [
    { "id": "parent-1", "deadline_offset_days": 10, ... },
    { "id": "sub-1", "parent_id": "parent-1" } // Geen eigen timing
  ]
}
```

### 2. Generation Preview (Runtime)

```
Gebruiker selecteert projectstartdatum (datepicker):
  → 2026-02-01

System berekent:
  1. Milestone timings (indien gedefinieerd)
  2. Task timings (inherit van milestone of parent, of expliciete waarden)
  3. Subtask timings (inherit van parent)

Preview toont:
  - Berekende datums en uren per taak
  - Editable inputs voor manuele overrides

Gebruiker past aan (optioneel):
  - Task "Write docs" deadline → 2026-02-15 (was 2026-02-10)
  - task._manualOverride = true
```

### 3. Generation Execution

```
Generation model bevat absolute datums:
{
  "tasks": [
    {
      "name": "Write docs",
      "date_deadline": "2026-02-15",  // Override from preview
      "planned_date_begin": "2026-02-12",
      "allocated_hours": 8
    }
  ]
}

Odoo receives:
  - project.task met date_deadline, planned_date_begin, allocated_hours
  - project.milestone (ZONDER timing, alleen name + project_id)
```

---

## 🧪 Validation

### Milestone Timing

**Nieuwe validatieregels** (validation.js):
```javascript
function validateMilestoneTimings(milestones, result) {
  milestones.forEach(milestone => {
    if (milestone.deadline_offset_days !== null && milestone.deadline_offset_days !== undefined) {
      if (typeof milestone.deadline_offset_days !== 'number' || milestone.deadline_offset_days < 0) {
        result.errors.push(`Milestone "${milestone.name}": deadline_offset_days must be ≥ 0`);
      }
    }
    
    if (milestone.duration_days !== null && milestone.duration_days !== undefined) {
      if (typeof milestone.duration_days !== 'number' || milestone.duration_days < 0) {
        result.errors.push(`Milestone "${milestone.name}": duration_days must be ≥ 0`);
      }
    }
  });
}
```

**Waarschuwingen**:
- Milestone heeft `duration_days` maar geen `deadline_offset_days`:
  → "Duration heeft geen effect zonder deadline"

### Subtask Validation

**Bestaande regel blijft**:
- Subtask mag niet zelf parent zijn (geen 3-level hiërarchie)

**Nieuwe gedrag**:
- Subtask erft milestone van parent (geen validatie nodig, automatisch)
- Subtask mag eigen timing hebben (overschrijft parent-timing)

---

## 🔄 Backward Compatibility

### ✅ Bestaande Templates Blijven Geldig

**Template zonder milestone-timing**:
```json
{
  "milestones": [
    { "id": "m1", "name": "Phase 1" } // Geen timing
  ]
}
```
→ **Werkt nog steeds**, milestones worden aangemaakt, taken erven geen timing (want milestone heeft geen timing).

**Template met task-timing maar geen milestone-timing**:
```json
{
  "milestones": [{ "id": "m1", "name": "Phase 1" }],
  "tasks": [
    { "id": "t1", "milestone_id": "m1", "deadline_offset_days": 10 }
  ]
}
```
→ **Werkt nog steeds**, taak gebruikt eigen `deadline_offset_days` (niet milestone-inherited).

**Template met subtasks**:
```json
{
  "tasks": [
    { "id": "parent", "deadline_offset_days": 10 },
    { "id": "sub", "parent_id": "parent" }
  ]
}
```
→ **Werkt beter**, subtask erft nu automatisch timing van parent (voorheen had subtask geen timing).

### ❌ Geen Migraties Nodig

- Milestone-timing is **optioneel** (default: null)
- Overerving gebeurt **runtime** (niet opgeslagen in blueprint)
- Bestaande blueprints zijn **forward-compatible**

---

## 📝 UI Changes Summary

### Template Library

**Geen wijzigingen** (datepicker alleen zichtbaar bij generatie).

### Blueprint Editor

**Milestone Modal** (ui.js):
```html
<!-- NEW: Timing section -->
<div class="divider">Timing (Optional)</div>

<div class="form-control mb-4">
  <label class="label">
    <span class="label-text">Deadline Offset (days after project start)</span>
  </label>
  <input type="number" id="milestoneDeadlineOffset" min="0" />
</div>

<div class="form-control mb-4">
  <label class="label">
    <span class="label-text">Duration (workdays)</span>
  </label>
  <input type="number" id="milestoneDuration" min="0" />
</div>
```

**Milestone List** (client.js):
```javascript
if (milestone.deadline_offset_days || milestone.duration_days) {
  const timingInfo = document.createElement('span');
  timingInfo.className = 'text-xs text-base-content/60 mt-1';
  const parts = [];
  if (milestone.deadline_offset_days) parts.push('Deadline: +' + milestone.deadline_offset_days + ' days');
  if (milestone.duration_days) parts.push('Duration: ' + milestone.duration_days + ' days');
  timingInfo.textContent = parts.join(' • ');
  // Append to milestone row
}
```

### Generation Flow

**Project Start Date Modal** (client.js):
```javascript
async function showProjectStartDateModal() {
  // Create modal with:
  // - Title: "Select Project Start Date"
  // - Description: "All task deadlines will be calculated from this date..."
  // - Date input (type="date", required, min=today, default=today)
  // - Cancel / Continue buttons
  // Returns: ISO date string or null
}
```

**Preview Modal** (client.js):
```javascript
// Per task row:
// - Show start date input (if task.planned_date_begin exists)
// - Show deadline input (if task.date_deadline exists)
// - Show hours input (if task.planned_hours exists)
// - All editable → updates generationModel + sets task._manualOverride
```

---

## 🎯 Acceptance Criteria

### H1: Datepicker UX
- [x] Projectstartdatum via native HTML5 datepicker
- [x] Verplicht veld (geen lege waarde)
- [x] Min-datum = vandaag
- [x] Default = vandaag
- [x] Visuele kalender (browser-native)

### H2: Preview Editable
- [x] Toon start date, deadline, hours (indien aanwezig)
- [x] Inputs zijn bewerkbaar
- [x] Wijzigingen updaten generationModel
- [x] Override-flag wordt gezet bij wijziging

### H3: Milestone Timing
- [x] Milestone modal heeft deadline_offset_days en duration_days velden
- [x] Milestone list toont timing (indien aanwezig)
- [x] Milestone-timing wordt berekend in generateModel
- [x] Timing wordt opgeslagen in blueprint

### H4: Task Inheritance from Milestone
- [x] Task zonder eigen timing erft van milestone
- [x] Task met eigen timing gebruikt eigen waarden (niet milestone)
- [x] Overerving gebeurt in buildGenerationModel

### H5: Milestone Switch Behavior
- [x] Task zonder overrides volgt nieuwe milestone automatisch
- [x] Task met overrides krijgt waarschuwing (indien van toepassing)

### H6: Subtask Inheritance
- [x] Subtask erft milestone van parent (ALTIJD)
- [x] Subtask erft tags van parent (ALTIJD)
- [x] Subtask erft timing van parent (indien geen eigen waarden)
- [x] Overerving gebeurt in buildGenerationModel

### Validation
- [x] Milestone timing validatie (integers ≥ 0)
- [x] Bestaande task timing validatie blijft werken
- [x] Geen breaking changes

### Documentation
- [x] ADDENDUM_H.md volledig gedocumenteerd
- [x] Relatie met Addendum G uitgelegd
- [x] Voorbeelden en use cases toegevoegd

---

## 🔗 Relatie met Addendum G

### Wat Addendum G Deed

- Voegde timing toe aan **taken** (`deadline_offset_days`, `duration_days`, `planned_hours`)
- Berekende absolute datums **runtime** vanaf projectstartdatum
- Gebruikte werkdag-logica (skip weekenden)
- Maakte templates tijdloos (relatieve offsets i.p.v. absolute datums)

### Wat Addendum H Toevoegt

- **UX-verbetering**: Datepicker i.p.v. prompt
- **Transparantie**: Preview toont berekende waarden
- **Milestone-timing**: Milestones krijgen ook deadline/duration
- **Overerving**: Taken erven van milestones, subtasks van parents
- **Override-detectie**: Waarschuwingen bij handmatige aanpassingen

### Geen Conflicten

- Addendum H **hergebruikt** de timing-velden uit Addendum G
- Addendum H **breidt uit** de berekening-logica (inheritance)
- Addendum H **verbetert** de UX (datepicker, preview)
- **Geen breaking changes**: Bestaande templates werken nog steeds

---

## 🚀 Deployment Checklist

- [x] Client-side: Datepicker modal
- [x] Client-side: Preview met editable timing
- [x] Client-side: Milestone modal met timing velden
- [x] Client-side: Milestone list met timing display
- [x] Server-side: buildGenerationModel met inheritance
- [x] Server-side: Milestone timing calculation
- [x] Server-side: Subtask inheritance logic
- [x] Validation: Milestone timing validatie
- [x] Documentation: ADDENDUM_H.md
- [x] Testing: Alle scenario's handmatig getest
- [x] Git: Eén commit met alle wijzigingen

---

## 📚 Gerelateerde Documenten

- [ADDENDUM_G.md](./ADDENDUM_G.md) — Task Timings, Deadlines & Planned Hours
- [ITERATION_4_SUMMARY.md](./ITERATION_4_SUMMARY.md) — Project Generation Pipeline
- [ADDENDUM_F.md](./ADDENDUM_F.md) — Task Colors + Tags
- [ADDENDUM_D.md](./ADDENDUM_D.md) — Milestones (originele implementatie)

---

## 🎓 Lessons Learned

### Wat Goed Werkte

1. **Incrementele overerving**: Milestone → Task → Subtask is intuïtief
2. **Runtime-berekening**: Templates blijven tijdloos en herbruikbaar
3. **Expliciete overrides**: Gebruiker heeft volledige controle
4. **Subtiele waarschuwingen**: Geen blocking dialogs, wel feedback

### Wat Te Vermijden

1. **Automatische overschrijving**: Gebruiker moet altijd controle houden
2. **Complexe dependency-planning**: Scope creep, buiten Addendum H
3. **Te veel validatie**: Timing is optioneel, geen errors forceren

### Future Improvements (Niet in Addendum H)

- **Gantt-view** in preview (visuele tijdlijn)
- **Kalenderinstellingen** (custom feestdagen)
- **Dependency-based scheduling** (auto-adjust deadlines bij dependencies)
- **Stage-assignment** per task in blueprint editor

---

**Addendum H maakt timing begrijpelijk,  
niet slimmer dan de gebruiker.**
