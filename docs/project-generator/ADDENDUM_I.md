# ADDENDUM I: Blueprint Editor UX/UI Refinement

**Status**: ✅ **Geïmplementeerd**  
**Datum**: 2026-01-29  
**Versie**: 1.0  
**Relatie**: Bouwt voort op alle voorgaande addenda (A–H.1)

---

## 🎯 Doelstelling

De Blueprint Editor **functioneel compleet** maken zonder nieuwe features toe te voegen, maar met focus op:

1. **Rustiger ogen** – Minder visuele ruis, meer overzicht
2. **Sneller scanbaar** – Duidelijke hiërarchie tussen primaire en secundaire informatie
3. **Beter schaalbaar** – Geschikt voor templates met 50+ taken zonder overweldigend te worden
4. **Meer controle** – Gebruiker bepaalt wat zichtbaar is en hoe data gesorteerd wordt

**Kernprincipe**: Deze UX-refinement voegt **geen nieuwe functionaliteit** toe aan de data of generatie. Het is puur **presentational** – layout, visuele hiërarchie, en gebruikersinteractie.

---

## 🧠 Filosofie: "Calm UI, Powerful Controls"

### Waarom dit addendum nodig was

Na implementatie van Addenda A–H.1 was de Blueprint Editor:
- ✅ Functioneel compleet (stages, milestones, tags, tasks, dependencies, timing, inheritance)
- ❌ Visueel overweldigend bij grote templates
- ❌ Veel informatie altijd zichtbaar (ook als niet relevant)
- ❌ Moeilijk te scannen bij >20 taken
- ❌ Geen flexibiliteit in hoe data wordt getoond

### Het probleem met "always visible"

**Voor Addendum I**:
```
[Stages Section - ALTIJD OPEN]
  - Stage 1: To Do
  - Stage 2: In Progress
  - Stage 3: Done
  (6 items, altijd 200px verticale ruimte)

[Milestones Section - ALTIJD OPEN]
  - Milestone 1: Kickoff
  - Milestone 2: Design Review
  - ...
  (7 items, altijd 250px)

[Tags Section - ALTIJD OPEN]
  - Tag 1: Urgent
  - Tag 2: Client-facing
  - ...
  (6 items, altijd 200px)

[Tasks Section - ALTIJD OPEN]
  - 30+ taken met ALLE metadata inline
```

**Resultaat**: 650px aan "boilerplate" voordat de gebruiker bij taken komt. Taken zelf zijn druk en moeilijk scanbaar.

### Het doel van Addendum I

**Na Addendum I**:
```
▶ Task Stages (6)        ← Collapsed by default
▶ Milestones (7)         ← Collapsed by default  
▶ Tags (6)               ← Collapsed by default

[Tasks & Subtasks]       ← Direct zichtbaar, rustig design
  Group by: [Milestone ▼]
  Sort by: [Manual ▼]
  
  🏁 Phase 1: Discovery (8)
    ● Design wireframe    🏷️ •• ⏱   [🔗][+][✏️][🗑️]
    ● Write copy          🏷️ 🏷️ •• ↓  [🔗][+][✏️][🗑️]
      └─ Proofread copy   ••        [🔗][✏️][🗑️]
```

**Resultaat**: 
- Stages/Milestones/Tags nemen ~80px (collapsed)
- Taken zijn overzichtelijk en snel scanbaar
- Metadata is zichtbaar maar subtiel (iconen i.p.v. badges)
- Acties zijn gegroepeerd en subtiel
- Gebruiker heeft controle (grouping, sorting)

---

## 📐 I1: Collapsible Sections (Progressive Disclosure)

### Probleem

Stages, Milestones en Tags zijn **configuratie-secties**:
- Nodig bij het **opzetten** van een template
- Minder relevant tijdens **dagelijks bewerken** van taken

Maar ze waren altijd open → **visuele ruis** + **scroll-afstand**.

### Oplossing: DaisyUI Collapse

**Implementatie**:
```html
<!-- VOOR (card, always visible) -->
<div class="card bg-base-100 shadow-xl mb-6">
  <div class="card-body">
    <h2 class="card-title">Milestones</h2>
    <div id="milestonesList">...</div>
  </div>
</div>

<!-- NA (collapse, default closed) -->
<div class="collapse collapse-arrow bg-base-100 shadow-xl mb-4">
  <input type="checkbox" id="milestonesCollapseToggle" /> 
  <div class="collapse-title">
    <i data-lucide="flag"></i>
    <span>Milestones</span>
    <span class="badge badge-neutral badge-sm">7</span>
  </div>
  <div class="collapse-content">
    <div id="milestonesList">...</div>
  </div>
</div>
```

**Kenmerken**:
- ✅ DaisyUI native `collapse` component
- ✅ Chevron-indicator (visuele affordance)
- ✅ Count badge (inzicht zonder te openen: "7 milestones")
- ✅ Default collapsed (minder visuele ruis)
- ✅ State niet bewaard (per page load resetten = OK)

### Waarom geen state persistence?

**Argument voor**: "Gebruiker opent een sectie, wil die open blijven"  
**Argument tegen**: 
- Extra complexity (localStorage of server state)
- Template editor wordt niet vaak genoeg gebruikt om persistentie waardevol te maken
- Default collapsed is het **rustiger** (primaire doel)

**Besluit**: **Geen persistence**. Sections resetten naar collapsed bij elke page load.

---

## 📐 I2: Task List – Rust, Hiërarchie, Schaalbaarheid

### Probleem

**Voor Addendum I** (per task row):
```
[Background box 48px height, 12px padding]
  Task Name [Milestone badge] [Color dot] [Tag] [Tag] [Timing badge: "Erft van Phase 1"] [Dep badge: 2]
  [Dep button] [Add subtask] [Edit] [Delete]
```

**Issues**:
- Te veel verticale ruimte (3px padding)
- Alle metadata inline → lange rijen
- Badges voor alles → visuele overload
- Acties altijd zichtbaar → visuele ruis

### Oplossing: Compact, Layered Design

**Principes**:
1. **Primair vs Secundair**:
   - Taaknaam = primair (bold, prominent)
   - Metadata = secundair (iconen, kleine badges, muted)
   - Acties = tertiair (subtiel, hover-opacity)

2. **Iconografie**:
   - Milestone: 🏁 flag icon (geen tekst)
   - Tags: kleine outline badges (max 2, dan "+3")
   - Timing: ⏱ clock icon (tooltip met details)
   - Inheritance: ↓ arrow icon (tooltip: "Inherits from X")
   - Dependencies: 🔗 branch icon + count

3. **Compactheid**:
   - Padding: 2px (was 3px) → -25% ruimte
   - Hover-only actions: opacity 60% → 100%
   - Metadata inline met gap-1 (4px spacing)

**Implementatie** (simplified):
```javascript
// Task name (primary)
const nameSpan = document.createElement('span');
nameSpan.className = level > 0 ? 'font-medium text-sm' : 'font-semibold';

// Metadata (secondary, compact)
const metaDiv = document.createElement('div');
metaDiv.className = 'flex items-center gap-1';

// Color dot (2.5px, no text)
if (task.color) {
  const dot = createElement('span');
  dot.className = 'w-2.5 h-2.5 rounded-full';
  dot.style.backgroundColor = colorMap[task.color];
  metaDiv.appendChild(dot);
}

// Milestone (icon only)
if (task.milestone_id) {
  const icon = createElement('i');
  icon.setAttribute('data-lucide', 'flag');
  icon.className = 'w-3.5 h-3.5 text-primary';
  metaDiv.appendChild(icon);
}

// Actions (right-aligned, subtle)
const btnDiv = createElement('div');
btnDiv.className = 'opacity-60 hover:opacity-100 transition-opacity';
```

### Subtask Visual Distinction

**Voor**:
```
[Parent Task]                     [Actions]
  [Subtask] (marginLeft: 32px, border-left-4)
```

**Na**:
```
[Parent Task]                     [Actions]
  └─ [Subtask]  (indent 2rem, lighter background, border-left-2)
```

**Waarom beter**:
- Duidelijkere parent-child relatie (visuele hiërarchie)
- Minder padding op subtasks → compacter
- Lichtere achtergrond → subtiel verschil

---

## 📐 I3: Grouping & Sorting (Presentational Only)

### Doel

Gebruikers moeten kunnen **filteren op context** zonder de data zelf te wijzigen:
- "Toon alle taken per milestone"
- "Sorteer alfabetisch voor overzicht"
- "Groepeer op tag om cross-cutting concerns te zien"

**Kritiek**: Dit is **presentational only**. Grouping/sorting wijzigt:
- ❌ NIET de blueprint data
- ❌ NIET de volgorde in Odoo
- ✅ WEL de weergave in de editor

### Grouping Options

**UI**:
```html
<select id="taskGrouping">
  <option value="none">No grouping</option>
  <option value="milestone">Milestone</option>
  <option value="tag">Tag</option>
  <option value="dependency">Dependency status</option>
</select>
```

**Gedrag**:

1. **No grouping** (default):
   - Alle taken in één lijst
   - Sorting toegepast op hele lijst

2. **Group by Milestone**:
   ```
   🏁 Phase 1: Discovery (8)
     - Task A
     - Task B
   
   🏁 Phase 2: Design (5)
     - Task C
   
   No milestone (2)
     - Task D
   ```

3. **Group by Tag**:
   ```
   🏷️ Urgent (4)
     - Task A
     - Task C
   
   🏷️ Client-facing (6)
     - Task B
     - Task C  (kan in meerdere groepen)
   
   No tags (3)
     - Task D
   ```

4. **Group by Dependency**:
   ```
   🔗 Has dependencies (7)
     - Task A (2 deps)
     - Task B (1 dep)
   
   No dependencies (15)
     - Task C
   ```

### Sorting Options

**UI**:
```html
<select id="taskSorting">
  <option value="manual">Manual order</option>
  <option value="alphabetical">Alphabetical</option>
  <option value="start-date">Start date</option>
  <option value="deadline">Deadline</option>
</select>
```

**Gedrag**:
- **Manual**: Volgorde zoals opgeslagen in blueprint (default)
- **Alphabetical**: A-Z op naam
- **Start date**: Sorteer op `deadline_offset_days - duration_days`
- **Deadline**: Sorteer op `deadline_offset_days`

**Fallback**: Taken zonder timing komen achteraan (Infinity als offset).

### Implementatie

**Core logic**:
```javascript
function getTasksGroupedAndSorted(grouping, sorting) {
  const parentTasks = blueprintState.tasks.filter(t => !t.parent_id);
  let groups = [];
  
  if (grouping === 'milestone') {
    // Group tasks by milestone
    const tasksByMilestone = new Map();
    parentTasks.forEach(task => {
      const key = task.milestone_id || '__none__';
      if (!tasksByMilestone.has(key)) tasksByMilestone.set(key, []);
      tasksByMilestone.get(key).push(task);
    });
    
    // Build groups with headers
    blueprintState.milestones.forEach(m => {
      const tasks = tasksByMilestone.get(m.id) || [];
      if (tasks.length > 0) {
        sortTasks(tasks, sorting);
        groups.push({ header: `🏁 ${m.name} (${tasks.length})`, tasks });
      }
    });
  }
  // ... other grouping logic
  
  return groups;
}
```

**Triggers**:
- Change event op `#taskGrouping` → `renderTasks()`
- Change event op `#taskSorting` → `renderTasks()`

**State**: Niet bewaard (reset bij reload).

---

## 📐 I4: Action Buttons – Subtle & Grouped

### Probleem

**Voor**: Elke task had 4–5 buttons altijd zichtbaar → visuele overload.

### Oplossing: Grouped Right, Hover-Opacity

**Implementatie**:
```javascript
const btnDiv = document.createElement('div');
btnDiv.className = 'flex gap-0.5 items-center opacity-60 hover:opacity-100 transition-opacity';

// Dependencies button
const depsBtn = createElement('button');
depsBtn.className = 'btn btn-xs btn-ghost';
depsBtn.title = 'Dependencies'; // Tooltip alleen
```

**Kenmerken**:
- ✅ Gegroepeerd rechts (consistent)
- ✅ Opacity 60% → 100% on hover (minder ruis)
- ✅ Tooltip i.p.v. tekst (ruimtebesparing)
- ✅ Gap 0.5 (2px spacing, compact)

**Button volgorde** (left to right):
1. Dependencies (🔗)
2. Add Subtask (+) (alleen voor parent tasks)
3. Edit (✏️)
4. Delete (🗑️)

---

## 📐 I5: DaisyUI Consistency

### Design System Compliance

Alle wijzigingen gebruiken **DaisyUI native components**:

| Component | DaisyUI Class | Usage |
|-----------|---------------|-------|
| Collapse | `collapse collapse-arrow` | Stages/Milestones/Tags sections |
| Badge | `badge badge-xs badge-neutral` | Counts in collapse headers |
| Badge | `badge badge-xs badge-primary` | Milestone indicator (compact) |
| Badge | `badge badge-xs badge-outline` | Tags (max 2 visible) |
| Button | `btn btn-xs btn-ghost` | Actions (subtle) |
| Select | `select select-bordered select-sm` | Grouping/sorting dropdowns |

**Custom CSS**: **GEEN**. Alles is DaisyUI utility classes.

### Tone & Aesthetics

**Richtlijnen**:
- ✅ Rustig (geen felle kleuren, subtiele acties)
- ✅ Zakelijk (geen speelse elementen)
- ✅ Productivity-first (snelle scanning, geen afleidingen)
- ✅ Consistent spacing (DaisyUI gaps: 1, 2, 3, 4)

**Kleuren**:
- Primaire info: `text-base-content` (default)
- Secundaire info: `text-base-content/60` (muted)
- Hover states: `hover:bg-base-300` (subtiel)
- Iconen: `w-3 h-3` (klein), `w-3.5 h-3.5` (medium)

---

## 🔄 Data Flow (Geen wijzigingen)

### Wat NIET is veranderd

**Blueprint schema**: Ongewijzigd  
**Generation logic**: Ongewijzigd  
**Validation**: Ongewijzigd  
**API calls**: Ongewijzigd  

**Enige wijziging**: Presentatie-laag (rendering functions).

### Wat WEL is veranderd

**Rendering functions**:
```javascript
// OLD
function renderTasks() {
  parentTasks.forEach(task => {
    renderTaskItem(task, 0, list);
  });
}

// NEW
function renderTasks() {
  const grouping = document.getElementById('taskGrouping').value;
  const sorting = document.getElementById('taskSorting').value;
  const taskGroups = getTasksGroupedAndSorted(grouping, sorting);
  
  taskGroups.forEach(group => {
    if (group.header) renderGroupHeader(group.header);
    group.tasks.forEach(task => renderTaskItem(task, 0, list));
  });
}
```

**Helper functions toegevoegd**:
- `getTasksGroupedAndSorted(grouping, sorting)` → Array van groepen
- `sortTasks(tasks, sorting)` → In-place sort (mutates array)

---

## 🚧 Architecturale Compliance

### ✅ Wat Addendum I DOET

- **UX-verbetering**: Collapsible sections, compacte task rows
- **Flexibiliteit**: Grouping en sorting voor overzicht
- **Consistentie**: DaisyUI components, geen custom CSS
- **Schaalbaarheid**: Geschikt voor templates met 50+ taken

### ❌ Wat Addendum I NIET doet

- **Geen nieuwe features**: Geen bulk edit, geen search, geen filters
- **Geen data-wijzigingen**: Grouping/sorting is presentational only
- **Geen state persistence**: Collapse state en grouping resetten bij reload
- **Geen API-wijzigingen**: Alleen client-side rendering

---

## 📊 Voorbeelden

### Voorbeeld 1: Default View (No Grouping)

```
▶ Task Stages (6)
▶ Milestones (7)
▶ Tags (6)

[Tasks & Subtasks]
  Group by: [No grouping ▼]
  Sort by: [Manual ▼]
  
  ● Design homepage wireframe    🏁 •• ⏱ 🔗2   [🔗][+][✏️][🗑️]
  ● Write landing page copy       🏁 🏷️ •• ⏱  [🔗][+][✏️][🗑️]
    └─ Proofread copy             ••         [🔗][✏️][🗑️]
  ● Setup analytics               •• ↓       [🔗][+][✏️][🗑️]
```

**Kenmerken**:
- Collapsed sections nemen ~80px
- Taken zijn compact (2px padding)
- Metadata is iconografisch (geen lange badges)
- Acties zijn subtiel (hover-opacity)

### Voorbeeld 2: Grouped by Milestone

```
[Tasks & Subtasks]
  Group by: [Milestone ▼]
  Sort by: [Deadline ▼]

  🏁 Phase 1: Discovery (8)
    ● Market research             🏷️ •• ⏱    [🔗][+][✏️][🗑️]
    ● Competitor analysis         🏷️ •• ⏱    [🔗][+][✏️][🗑️]
    ...
  
  🏁 Phase 2: Design (5)
    ● Design wireframes           •• ↓       [🔗][+][✏️][🗑️]
    ...
  
  No milestone (2)
    ● Setup project board         ••         [🔗][+][✏️][🗑️]
```

**Kenmerken**:
- Group headers met emoji + count
- Sorting per group (hier: deadline)
- Overzichtelijk bij veel taken

### Voorbeeld 3: Large Template (50+ tasks)

**Voor Addendum I**:
- Stages/Milestones/Tags: ~650px verticale ruimte
- Taken: 50 × 48px padding = 2400px
- **Totaal**: ~3050px scroll-afstand

**Na Addendum I**:
- Stages/Milestones/Tags collapsed: ~80px
- Taken: 50 × 36px padding = 1800px (25% minder)
- Grouping per milestone: 5–10 taken per groep → overzichtelijk
- **Totaal**: ~1880px scroll-afstand (**-38% ruimte**)

---

## 🎓 Lessons Learned

### Wat Goed Werkte

1. **Progressive Disclosure**: Collapsed sections verminderen visuele ruis zonder functionaliteit te verliezen
2. **Iconografie**: Iconen + tooltips zijn compacter dan badges + tekst
3. **Hover-opacity**: Acties zijn beschikbaar maar niet opdringerig
4. **Presentational grouping**: Flexibiliteit voor gebruiker zonder data-complexity

### Wat Te Vermijden

1. **State persistence te vroeg**: Complexiteit niet waard bij lage gebruiksfrequentie
2. **Te veel grouping options**: 4 opties is voldoende, meer = overweldigend
3. **Custom CSS**: DaisyUI biedt alles wat nodig is

### Future Improvements (Niet in Addendum I)

**Potentiële verbeteringen** (buiten scope):
- **Search/Filter**: Tekstuele zoekfunctie voor taken
- **Bulk edit**: Selecteer meerdere taken, wijzig milestone/tags
- **Drag & drop**: Visuele volgorde-aanpassing
- **Keyboard shortcuts**: Sneltoetsen voor veelvoorkomende acties
- **State persistence**: LocalStorage voor collapse/grouping state

**Waarom niet nu?**
- Scope creep (I is een UX-refinement, geen feature-toevoeging)
- Complexity vs value trade-off (huidige oplossing is voldoende)
- Backward compatibility risico's

---

## 🔗 Relatie met Voorgaande Addenda

### Bouwt Voort Op

- **Addendum A–D**: Basis blueprint structuur (stages, milestones, dependencies, tags)
- **Addendum E**: Task dependencies (nu getoond als icoon + count)
- **Addendum F**: Task colors + tags (nu compact weergegeven)
- **Addendum G**: Task timings (nu iconografisch)
- **Addendum H**: Milestone timing + inheritance (iconen i.p.v. badges)
- **Addendum H.1**: Blueprint-level timing inheritance (iconen blijven)

### Geen Conflicten

- **Data schema**: Ongewijzigd
- **Validation**: Ongewijzigd
- **Generation**: Ongewijzigd
- **Rendering**: Verbeterd (backward compatible)

**Alle bestaande functionaliteit blijft werken**, alleen de presentatie is rustiger en schaalbaarder.

---

## ✅ Acceptatiecriteria

### I1: Collapsible Sections
- [x] Stages, Milestones, Tags zijn collapsible
- [x] DaisyUI collapse component gebruikt
- [x] Count badges tonen aantal items
- [x] Default collapsed state
- [x] Chevron indicator aanwezig

### I2: Task List UX
- [x] Compactere rows (2px padding i.p.v. 3px)
- [x] Subtasks visueel onderscheiden (indent, lighter background)
- [x] Metadata iconografisch (milestone, tags, timing, deps)
- [x] Inheritance iconen i.p.v. badges
- [x] Primaire info prominent, secundaire info muted

### I3: Grouping & Sorting
- [x] Grouping selector met 4 opties (none, milestone, tag, dependency)
- [x] Sorting selector met 4 opties (manual, alphabetical, start-date, deadline)
- [x] Grouping en sorting wijzigen data NIET (presentational only)
- [x] Group headers tonen emoji + count
- [x] Event listeners triggeren renderTasks()

### I4: Action Buttons
- [x] Acties gegroepeerd rechts
- [x] Hover-opacity (60% → 100%)
- [x] Tooltips i.p.v. tekst
- [x] Consistente volgorde (deps, add subtask, edit, delete)

### I5: DaisyUI Consistency
- [x] Alleen DaisyUI components en utilities
- [x] Geen custom CSS
- [x] Rustige, zakelijke tone
- [x] Consistente spacing (gap-1, gap-2, etc.)

### Geen Regressies
- [x] Alle bestaande functionaliteit werkt nog
- [x] Blueprint save/load ongewijzigd
- [x] Validation ongewijzigd
- [x] Generation ongewijzigd

---

## 🚀 Deployment Checklist

- [x] UI aangepast: Collapsible sections (ui.js)
- [x] Client-side: renderStages/Milestones/Tags met count badges
- [x] Client-side: Nieuwe renderTasks met grouping/sorting
- [x] Client-side: Nieuwe renderTaskItem (compact, iconografisch)
- [x] Client-side: Event listeners voor grouping/sorting
- [x] Client-side: getTasksGroupedAndSorted() helper
- [x] Client-side: sortTasks() helper
- [x] Documentation: ADDENDUM_I.md
- [x] Testing: Handmatig getest (alle grouping/sorting combinaties)
- [x] Git: Eén commit met alle wijzigingen

---

## 📝 Files Modified

### UI Structure
- `src/modules/project-generator/ui.js`:
  - Stages section → collapse component
  - Milestones section → collapse component
  - Tags section → collapse component
  - Tasks section → grouping/sorting controls toegevoegd

### Client Logic
- `public/project-generator-client.js`:
  - `renderStages()`: Count badge update toegevoegd
  - `renderMilestones()`: Count badge update toegevoegd
  - `renderTags()`: Count badge update toegevoegd
  - `renderTasks()`: Compleet herschreven met grouping/sorting
  - `renderTaskItem()`: Compleet herschreven (compact, iconografisch)
  - `getTasksGroupedAndSorted()`: Nieuwe helper (grouping logic)
  - `sortTasks()`: Nieuwe helper (sorting logic)
  - Event listeners: taskGrouping en taskSorting change events

### Documentation
- `docs/project-generator/ADDENDUM_I.md`: Complete documentatie

**Totaal**: 2 files modified, 1 file created

---

## 📚 Gerelateerde Documenten

- [ADDENDUM_H.md](./ADDENDUM_H.md) — Timing Inheritance & UX Refinement
- [ADDENDUM_H1.md](./ADDENDUM_H1.md) — Blueprint-Level Timing Inheritance
- [ADDENDUM_F.md](./ADDENDUM_F.md) — Task Colors + Tags
- [ADDENDUM_E.md](./ADDENDUM_E.md) — Task Dependencies
- [MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md](./MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md) — Volledige module geschiedenis

---

**Addendum I maakt de Blueprint Editor rustig en schaalbaar,  
zonder functionaliteit op te offeren.**
