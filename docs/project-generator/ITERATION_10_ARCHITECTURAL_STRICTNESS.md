# Iteration 10: Architectural Strictness & Final Corrections

## Document Purpose

Dit iteratieverslag documenteert de finale correcties en verstrakking van de V1 architecturale specificaties.

**Dit is GEEN scope-uitbreiding, maar correctie van onnauwkeurigheden en verstrakking van formulering.**

---

## Wat is Aangepast t.o.v. Vorige Versie

### 1. Subtask Formulering Aangescherpt

**Wat was er:**
- Subtasks waren toegevoegd maar niet overal expliciet genoeg geformuleerd
- Sommige secties vermeldden subtasks als "toegevoegd" maar niet als "verplicht"

**Wat is nu:**
- **Expliciet:** Subtasks zijn VERPLICHT in V1, geen nice-to-have
- **Expliciet:** Subtasks zijn echte Odoo `project.task` records met `parent_id`
- **Expliciet:** Subtasks worden NA hun parents aangemaakt (ordering)
- **Expliciet:** Subtasks erven `project_id` en optioneel `milestone_id`
- **Expliciet:** Subtasks mogen dependencies hebben, ook over parent-grenzen heen
- **Expliciet:** Subtasks zijn essentieel voor procesdenken (decomposition)

**Waarom:**
Procesdenken vereist taakdecompositie. Subtasks zijn geen feature, maar kern-functionaliteit.

---

### 2. Undo/Redo Formulering Verstrak

**Wat was er:**
- "Cancel/Undo returns to last saved state"
- Niet expliciet genoeg over wat WEL en NIET gebeurt

**Wat is nu:**
- **Expliciet:** Undo = JA, maar ALLEEN als "Cancel / terug naar laatst opgeslagen staat"
- **Expliciet:** Redo = NEE
- **Expliciet:** GEEN stap-voor-stap undo
- **Expliciet:** GEEN state history
- **Expliciet:** GEEN fancy editor-gedrag
- **Exact geformuleerd:** "Discard all unsaved changes and restore last persisted blueprint state"
- **Expliciet:** Dit is een bewuste UX-keuze voor managers die procesdenken leren, NIET een technische beperking

**Waarom:**
Managers die procesdenken leren hebben een veilige "reset" nodig, maar geen complexe undo/redo historie.

---

### 3. Odoo-Structuur Verstrak: Project vs Task Stages

**Wat was er:**
- Task stages vs project stages onderscheid was gemaakt
- Niet overal even expliciet dat project-level stages NIET worden aangeraakt

**Wat is nu:**

**Project-Level Stages:**
- **Expliciet:** Odoo heeft vaste project-level stages voor projecten zelf
- **Expliciet:** Deze zijn globaal en Odoo-native
- **Expliciet:** Deze worden NIET beheerd door de Project Generator
- **Expliciet:** Deze worden NIET aangepast, aangemaakt of geconfigureerd
- **Expliciet:** De Project Generator raakt deze NOOIT aan

**Task-Level Stages:**
- **Expliciet:** De Project Generator MAG en MOET project-specifieke task stages aanmaken
- **Expliciet:** Via `project.task.type` model
- **Expliciet:** Gekoppeld aan project via `project_ids` field
- **Expliciet:** Benoemd als "Task Stages" OVERAL, nooit gewoon "Stages"

**Waarom:**
Elimineer elke mogelijke verwarring tussen project-level en task-level stages.

---

### 4. Odoo Wordt NIET Aangepast - Absolutisme

**Wat was er:**
- "The Project Generator adapts to Odoo. Odoo is not modified."
- Principe was duidelijk maar niet absoluut genoeg

**Wat is nu:**
- **Expliciet:** Geen enkel Odoo-model wordt uitgebreid
- **Expliciet:** Geen custom fields (NOOIT)
- **Expliciet:** Geen override van flows (NOOIT)
- **Expliciet:** Geen aanpassing van Odoo-logica (NOOIT)
- **Expliciet:** Geen nieuwe concepten bovenop Odoo (NOOIT)
- **Expliciet:** De generator past zich aan Odoo aan, niet omgekeerd
- **Expliciet:** Als iets niet kan binnen Odoo zoals het bestaat → dan zit het niet in V1

**Waarom:**
Odoo is leidend. Elk compromis op dit punt leidt tot technische schuld en onderhoudsproblemen.

---

### 5. Bidirectionele Sync Expliciet Uitgesloten

**Wat was er:**
- "No sync after creation" vermeld
- Niet expliciet genoeg over wat dit betekent

**Wat is nu:**
- **Expliciet:** Na generatie: GEEN sync
- **Expliciet:** Na generatie: GEEN updates
- **Expliciet:** Na generatie: GEEN reflectie terug naar templates
- **Expliciet:** Odoo is daarna volledig autonoom
- **Expliciet:** Template-wijzigingen hebben ENKEL impact op nieuw aangemaakte projecten
- **Expliciet:** Template-wijzigingen zijn NOOIT retroactief
- **Expliciet:** One-way push only: Template → Odoo. Daarna: no connection.

**Waarom:**
Bidirectionele sync is complex, foutgevoelig, en niet nodig voor V1 use case.

---

### 6. Bestaande App-Structuur Strikt Gevolgd

**Wat was er:**
- "Use existing patterns"
- Niet expliciet genoeg over wat NIET mag

**Wat is nu:**
- **Expliciet:** DaisyUI voor ALLE UI (geen custom components)
- **Expliciet:** Gebruik bestaande module-structuur (`src/modules/registry.js`)
- **Expliciet:** Gebruik bestaande Odoo-communicatie:
  - `executeKw` from `src/lib/odoo.js`
  - `searchRead` where needed
  - GEEN nieuwe API-clients
  - GEEN alternatieve abstrahering
  - GEEN wrapper layers
- **Expliciet:** Gebruik bestaande database access (`src/lib/database.js`)
- **Expliciet:** Gebruik bestaande auth flow (`src/lib/auth/*`)

**Waarom:**
Nieuwe patronen introduceren is scope-uitbreiding en technische schuld.

---

## Wat NIET is Aangepast

### Geen Nieuwe Features

- ❌ Geen template versioning toegevoegd
- ❌ Geen audit logging toegevoegd
- ❌ Geen rollback mechanisme toegevoegd
- ❌ Geen error recovery toegevoegd
- ❌ Geen analytics toegevoegd
- ❌ Geen import/export toegevoegd

### Geen Scope Uitbreiding

- ❌ Geen nieuwe data velden
- ❌ Geen nieuwe UI schermen
- ❌ Geen nieuwe API endpoints
- ❌ Geen nieuwe integraties

### Geen Architecturale Wijzigingen

- ❌ Geen nieuwe patterns geïntroduceerd
- ❌ Geen nieuwe libraries toegevoegd
- ❌ Geen nieuwe abstracties gemaakt

**Waarom:**
V1 scope is frozen. Alleen correcties en verduidelijkingen.

---

## Gevalideerde Architecturale Principes

### Principe 1: Odoo is Leidend

```
┌─────────────────────────────────────────┐
│    PROJECT GENERATOR (adapts)           │
│                                          │
│    ↓ one-way push only ↓                │
│                                          │
│    ODOO (unchanged, authoritative)      │
└─────────────────────────────────────────┘
```

**Consequenties:**
- Generator gebruikt bestaande Odoo modellen
- Generator maakt GEEN custom fields
- Generator wijzigt GEEN Odoo logica
- Generator respecteert Odoo's native structuur (parent_id, project_ids, etc.)

---

### Principe 2: Procesdenken Vereist Decompositie

```
Project
  └─ Task Stage (Backlog)
       └─ Milestone (Phase 1)
            └─ Task (Setup Environment)
                 ├─ Subtask (Install Node.js)
                 ├─ Subtask (Configure Git)
                 └─ Subtask (Setup Database)
```

**Consequenties:**
- Subtasks zijn NIET optioneel
- Subtasks zijn NIET "V2 feature"
- Subtasks zijn KERN van procesdenken
- Zonder subtasks → geen decompositie → geen procesdenken

---

### Principe 3: Manager-Vriendelijke UX

**Undo/Redo Keuze:**
- Managers leren procesdenken
- Ze hebben veilige "reset" nodig (Cancel)
- Ze hebben GEEN step-by-step undo nodig (te complex)
- Ze hebben GEEN redo nodig (workflow is vooruit, niet achteruit)

**Formulering:**
"Discard all unsaved changes and restore last persisted blueprint state."

**Implementatie:**
```javascript
let savedBlueprint = null; // Last persisted state

// On load/save
savedBlueprint = JSON.parse(JSON.stringify(currentBlueprint));

// On cancel
function cancelChanges() {
  currentBlueprint = JSON.parse(JSON.stringify(savedBlueprint));
  refreshEditor();
}
```

---

### Principe 4: One-Way Data Flow

```
Template (Supabase)
    ↓ read
Blueprint (Browser)
    ↓ edit
Blueprint (Browser)
    ↓ save
Template (Supabase)
    ↓ generate
Odoo Project
    ↓ DISCONNECTED
Odoo Project (autonomous)
```

**Expliciet:**
- Na "generate" → zero connection
- Template wijzigen → affects only NEW generations
- Odoo wijzigen → affects only that Odoo project
- No sync, no reflection, no updates

---

## Consequenties voor Implementatie

### Database Schema

**Exact Structure:**
```sql
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Blueprint Data (JSONB):**
```json
{
  "taskStages": [
    { "id": "ts_1", "name": "Backlog", "sequence": 1 }
  ],
  "milestones": [
    { "id": "m_1", "name": "Phase 1", "description": "..." }
  ],
  "tasks": [
    {
      "id": "t_1",
      "name": "Setup Environment",
      "milestone_id": "m_1",
      "parent_id": null
    },
    {
      "id": "t_2",
      "name": "Install Node.js",
      "milestone_id": "m_1",
      "parent_id": "t_1"
    }
  ],
  "dependencies": [
    { "task_id": "t_3", "depends_on_id": "t_1" }
  ]
}
```

**Expliciet NIET:**
- ❌ Geen `template_versions` table
- ❌ Geen `generation_history` table
- ❌ Geen `audit_log` table
- ❌ Geen status/state fields

---

### Odoo API Sequence (6 Steps)

**Exact Order:**
```javascript
1. createProject(name)
   → Returns: projectId

2. createTaskStages(projectId, taskStages)
   → Creates: project.task.type records
   → Links: via project_ids = [[6, 0, [projectId]]]
   → Returns: Map<blueprintTaskStageId, odooTaskStageId>

3. createMilestones(projectId, milestones)
   → Creates: project.milestone records
   → Links: via project_id = projectId
   → Returns: Map<blueprintMilestoneId, odooMilestoneId>

4. createParentTasks(projectId, tasks, milestoneMap)
   → Filters: tasks where parent_id === null
   → Creates: project.task records
   → Sets: project_id, milestone_id (if exists)
   → Returns: Map<blueprintTaskId, odooTaskId>

5. createSubtasks(projectId, tasks, milestoneMap, taskMap)
   → Filters: tasks where parent_id !== null
   → Creates: project.task records
   → Sets: project_id, parent_id (from taskMap), milestone_id (if exists)
   → Updates: taskMap with subtask IDs

6. setDependencies(taskMap, dependencies)
   → Updates: project.task records
   → Sets: depend_on_ids = [[4, dependencyId]]
   → Sequential, one by one
```

**Waarom 6 stappen:**
- Stap 4 moet voor stap 5 (parents before children)
- Stap 5 moet voor stap 6 (all tasks exist before dependencies)
- Odoo vereist parent_id om te verwijzen naar bestaand task ID

---

### Validation Rules (Exact)

**Errors (Block Save/Generate):**
1. Empty template name
2. Empty task stage name
3. Empty task name
4. Circular dependency (graph cycle)
5. Circular parent hierarchy (recursive parent check)
6. Invalid parent_id (parent task doesn't exist)
7. Duplicate task stage names
8. Duplicate milestone names
9. Invalid dependency reference (task doesn't exist)
10. Empty project name (on generate)

**Warnings (Allow Save/Generate):**
1. Task has no milestone
2. Task stage has no tasks
3. Task has no dependencies (isolated)
4. No task stages defined
5. No milestones defined

**Implementation:**
```javascript
function detectCircularParentHierarchy(tasks) {
  const parentMap = new Map();
  tasks.forEach(t => {
    if (t.parent_id) parentMap.set(t.id, t.parent_id);
  });

  for (const task of tasks) {
    if (!task.parent_id) continue;
    const visited = new Set();
    let current = task.id;
    
    while (current) {
      if (visited.has(current)) {
        // Cycle found
        return buildCyclePath(visited, current, tasks);
      }
      visited.add(current);
      current = parentMap.get(current);
    }
  }
  return null;
}
```

---

## Documentatie Structuur (Bevestigd)

### Bestaande Documenten (Blijven)

1. **PROJECT_GENERATOR_COMPLETE_V1.md**
   - Single source of truth
   - Conflicts win here
   - Volledig implementeerbaar

2. **FUNCTIONAL_ANALYSIS_V1.md**
   - User-facing capabilities
   - Wat gebruikers kunnen doen

3. **TECHNICAL_ANALYSIS_V1.md**
   - Implementation specification
   - Hoe het te bouwen

4. **EXPLORER_V1.md**
   - Design reasoning
   - Waarom deze keuzes
   - Welke keuzes bewust niet gemaakt

5. **README.md**
   - Quick reference
   - Entry point

### Dit Document

**ITERATION_10_ARCHITECTURAL_STRICTNESS.md**
- Wat is aangepast
- Waarom
- Wat NIET is aangepast

---

## Implementatie Checklist (Exact)

### Pre-Implementation

- [ ] Lees PROJECT_GENERATOR_COMPLETE_V1.md volledig
- [ ] Lees TECHNICAL_ANALYSIS_V1.md volledig
- [ ] Begrijp 6-step Odoo API sequence
- [ ] Begrijp parent_id ordering requirement

### Database

- [ ] Run migration: `supabase/migrations/20260128_project_generator.sql`
- [ ] Verify RLS policies active
- [ ] Test CRUD operations with authenticated user

### Module Files

- [ ] Create `src/modules/project-generator/module.js`
- [ ] Create `src/modules/project-generator/library.js`
- [ ] Create `src/modules/project-generator/editor.js`
- [ ] Create `src/modules/project-generator/generate.js`
- [ ] Create `src/modules/project-generator/validation.js`
- [ ] Create `src/modules/project-generator/odoo-creator.js`
- [ ] Register in `src/modules/registry.js`

### Validation Implementation

- [ ] Implement `validateBlueprint(blueprint)` function
- [ ] Implement `detectCircularDependencies(tasks, dependencies)`
- [ ] Implement `detectCircularParentHierarchy(tasks)`
- [ ] Test all error conditions
- [ ] Test all warning conditions

### Odoo API Implementation

- [ ] Implement `createProject(name)`
- [ ] Implement `createTaskStages(projectId, taskStages)`
- [ ] Implement `createMilestones(projectId, milestones)`
- [ ] Implement `createParentTasks(projectId, tasks, milestoneMap)`
- [ ] Implement `createSubtasks(projectId, tasks, milestoneMap, taskMap)`
- [ ] Implement `setDependencies(taskMap, dependencies)`
- [ ] Test full sequence with real Odoo instance

### UI Implementation

- [ ] Template library (list, delete)
- [ ] Blueprint editor (3 columns: Task Stages, Milestones, Tasks & Subtasks)
- [ ] Cancel button (restore savedBlueprint)
- [ ] Validation display (errors in red, warnings in yellow)
- [ ] Generation modal (project name input)
- [ ] Success/error states

### Testing

- [ ] Create template with 2 task stages, 1 milestone, 2 tasks, 1 subtask, 1 dependency
- [ ] Test Cancel button (verify restore to last saved)
- [ ] Save template
- [ ] Generate project in Odoo
- [ ] Verify in Odoo:
  - [ ] Project exists
  - [ ] Task stages exist (project.task.type)
  - [ ] Milestone exists
  - [ ] Parent task exists
  - [ ] Subtask exists with correct parent_id
  - [ ] Dependency set correctly

---

## Wat NU Absoluut Duidelijk Moet Zijn

### 1. Subtasks

**Status:** VERPLICHT in V1  
**Type:** Odoo `project.task` met `parent_id`  
**Ordering:** Parents first, then children  
**Dependencies:** Allowed, including cross-parent  
**Reden:** Procesdenken vereist decompositie

### 2. Undo/Redo

**Undo:** JA - "Discard all unsaved changes and restore last persisted blueprint state"  
**Redo:** NEE  
**Step-by-step:** NEE  
**State history:** NEE  
**Reden:** Manager-vriendelijke UX, geen complexity

### 3. Stages

**Project-Level Stages:** NIET aangeraakt door generator  
**Task-Level Stages:** WEL aangemaakt via `project.task.type`  
**Terminologie:** ALTIJD "Task Stages", nooit "Stages"  
**Reden:** Elimineer verwarring

### 4. Odoo

**Modificaties:** NOOITA  
**Custom Fields:** NOOIT  
**Extensions:** NOOIT  
**Generator:** Past zich AAN aan Odoo  
**Reden:** Odoo is leidend

### 5. Sync

**Na generatie:** ZERO connection  
**Template updates:** Alleen nieuwe projecten  
**Odoo updates:** Alleen dat project  
**Reden:** Simpel, betrouwbaar

---

## Slot

Na deze iteratie zijn alle architecturale principes:
- ✅ Expliciet geformuleerd
- ✅ Zonder ruimte voor interpretatie
- ✅ Volledig implementeerbaar
- ✅ Zonder semantische discussie

**Volgende stap:** Direct naar implementatie.

**Geen verdere architecturale vragen. Geen verdere scope-discussies. Alleen bouwen.**
