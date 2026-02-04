# ADDENDUM F: Task Colors (Odoo-native) + Tags in Template Builder

**Status:** ✅ Implemented  
**Datum:** 2026-01-28  
**Relatie:** Extends Project Generator template builder  
**Afhankelijkheden:** Addendum D (milestones), Addendum E (dependency management)

---

## 1. PROBLEEM

De huidige Project Generator mist twee expressiviteitslagen die gebruikers verwachten:

1. **Visuele prioritering**: Geen mogelijkheid om taken visueel te onderscheiden via kleuren
2. **Flexibele classificatie**: Milestones zijn structureel (tijdlijn), maar gebruikers willen ook vrije tags voor categorisatie (bijv. "Urgent", "Client-facing", "Internal")

**Requirement:** Gebruik Odoo-native features (geen custom fields), beide features moeten in template builder configureerbaar zijn.

---

## 2. ONTWERP

### 2.1 Task Colors: Odoo Integer System

Odoo gebruikt **geen RGB kleuren** maar een integer-based color system voor `project.task`:

| Integer | Kleur | Hex (UI) | Tailwind Class |
|---------|-------|----------|----------------|
| 0 | None | `#E5E7EB` | Gray-200 (default) |
| 1 | Red | `#EF4444` | Red-500 |
| 2 | Orange | `#F97316` | Orange-500 |
| 3 | Yellow | `#EAB308` | Yellow-500 |
| 4 | Blue | `#3B82F6` | Blue-500 |
| 5 | Pink | `#EC4899` | Pink-500 |
| 6 | Green | `#22C55E` | Green-500 |
| 7 | Purple | `#A855F7` | Purple-500 |
| 8 | Gray | `#6B7280` | Gray-500 |
| 9 | Violet | `#8B5CF6` | Violet-500 |
| 10 | Cyan | `#06B6D4` | Cyan-500 |
| 11 | Indigo | `#4F46E5` | Indigo-600 |

**Implementatie:**
- UI: 12 klikbare color buttons (inclusief "geen kleur")
- Opslag: Hidden input `taskColor` met integer value
- Validatie: Range 0-11, moet integer zijn
- Blueprint: `task.color` (nullable integer)
- Odoo field: `project.task.color` (standaard Odoo field)
- **Color mapping:** Zie `src/modules/project-generator/color-constants.js` (sinds 2026-02-04)

### 2.2 Tags: Project-scoped Classification

**Verschil Milestones vs Tags:**

| Aspect | Milestones | Tags |
|--------|-----------|------|
| **Doel** | Structurele tijdlijn | Vrije classificatie |
| **Kardinaliteit** | 1 per task (many2one) | N per task (many2many) |
| **Scope** | Project-specifiek | Project-specifiek |
| **Odoo model** | `project.milestone` | `project.tags` |
| **Relatie in task** | `milestone_id` | `tag_ids` |
| **Semantiek** | "Wanneer?" | "Wat voor soort?" |

**Implementatie:**
- UI sectie: Gelijk aan milestones (render, create, edit, delete)
- Task modal: Checkboxes voor multi-select
- Opslag: `task.tag_ids` array of blueprint IDs
- Odoo creation: Link via `[(4, tag_id)]` commands
- Validatie: Tag referenties moeten bestaan

---

## 3. IMPLEMENTATIE

### 3.1 Client-Side (UI)

**Blueprint State Extension:**
```javascript
blueprintState = {
  stages: [],
  milestones: [],
  tags: [],        // NEW: Tag definitions
  tasks: [],       // Updated with color + tag_ids
  dependencies: []
};

// Task schema update:
{
  id: UUID,
  name: string,
  milestone_id: UUID | null,
  parent_id: UUID | null,
  color: int | null,      // NEW: Odoo color 1-11 (null = no color)
  tag_ids: Array<UUID>    // NEW: Array of tag blueprint IDs
}
```

**Tags Section (client.js):**
- `renderTags()`: Render tag list met edit/delete buttons
- `openTagModal(tagId)`: Open modal voor create/edit
- `handleTagSubmit(e)`: Create/update tag
- `deleteTag(tagId)`: Verwijder tag + remove from alle tasks

**Task Modal Updates:**
1. **Color Picker:** 12 clickable buttons met ring-2 feedback
2. **Tag Selector:** Checkboxes voor alle beschikbare tags
3. **Event Listeners:** Color button clicks updaten hidden input

**Task Rendering:**
- Color dot indicator: `<span class="w-3 h-3 rounded-full" style="background: {color}"></span>`
- Tag badges: `<span class="badge badge-sm badge-outline">{tagName}</span>`

### 3.2 Validation (validation.js)

**Nieuwe functies:**
```javascript
validateTags(tags, result)
// - Array type check
// - Duplicate IDs
// - Name presence

validateTaskColors(tasks, result)
// - Must be integer
// - Range 0-11
// - Type check

validateTaskTagReferences(tasks, tags, result)
// - Tag IDs must exist in tags array
// - No orphaned references
```

### 3.3 Generation Model (generate.js)

**Model uitbreiding:**
```javascript
{
  project: {...},
  stages: [...],
  milestones: [...],
  tags: [                        // NEW
    {
      blueprint_id: UUID,
      name: string
    }
  ],
  tasks: [
    {
      blueprint_id: UUID,
      name: string,
      milestone_blueprint_id: UUID | null,
      parent_blueprint_id: UUID | null,
      color: int | null,               // NEW
      tag_blueprint_ids: Array<UUID>,  // NEW
      dependencies: [...],
      generation_order: int
    }
  ]
}
```

### 3.4 Odoo Creator (odoo-creator.js)

**Nieuwe functie:**
```javascript
async function createTag(env, data)
// Model: project.tags
// Fields: name, project_id
// Return: tag ID
```

**createTask() uitbreiding:**
```javascript
// Color support
if (data.color !== null && data.color !== undefined) {
  values.color = data.color;
}

// Tags support (many2many link)
if (data.tag_ids && data.tag_ids.length > 0) {
  values.tag_ids = data.tag_ids.map(id => [4, id]);
}
```

### 3.5 Generation Orchestrator

**STEP 5.5: Create Tags (NEW)**
```javascript
result.step = '5.5-create-tags';
result.odoo_mappings.tags = {};

for (const tag of generationModel.tags) {
  const tagId = await createTag(env, {
    name: tag.name,
    project_id: projectId
  });
  
  result.odoo_mappings.tags[tag.blueprint_id] = tagId;
}
```

**STEP 6: Task Creation uitbreiding**
```javascript
// Map blueprint tag IDs naar Odoo tag IDs
if (task.tag_blueprint_ids && task.tag_blueprint_ids.length > 0) {
  taskData.tag_ids = task.tag_blueprint_ids.map(blueprintId => 
    result.odoo_mappings.tags[blueprintId]
  ).filter(id => id !== undefined);
}

// Color passthrough
if (task.color !== null && task.color !== undefined) {
  taskData.color = task.color;
}
```

---

## 4. GENERATIE FLOW UPDATE

```
1. Validate blueprint
2. Build generation model
3. Create project
4. Create stages
5. Create milestones
5.5. Create tags          ← NEW STEP
6. Create tasks
   ├─ Map color (direct integer)
   └─ Map tag_ids (blueprint → Odoo IDs)
7. Create dependencies
```

**Kritisch:** Tags moeten VOOR tasks gecreëerd worden zodat task creation de tag IDs kan refereren.

---

## 5. UI/UX ONTWERP

### Tags Section (lijkt op Milestones)
```
┌─────────────────────────────────────────┐
│ 🏷️  Tags                    [+ Add Tag] │
├─────────────────────────────────────────┤
│ ● Urgent                      [✏️] [🗑️] │
│ ● Client-facing               [✏️] [🗑️] │
│ ● Internal                    [✏️] [🗑️] │
└─────────────────────────────────────────┘
```

### Task Modal: Color Picker
```
Color (Odoo):
┌─────────────────────────────────────────┐
│ [○] [🔴] [🟠] [🟡] [🔵] [🟣]            │
│ [🩷] [🔵💧] [🟢💡] [🟢🌲] [🩷💡] [⚪]     │
└─────────────────────────────────────────┘
```

### Task Modal: Tag Selector
```
Tags:
☑ Urgent
☐ Client-facing
☑ Internal
```

### Task List: Visual Indicators
```
┌─────────────────────────────────────────────┐
│ Setup Database 🔴 [Phase 1] [Urgent] [Dev] │
│   ├─ Install Postgres                  [2] │
│   └─ Configure connections             [1] │
└─────────────────────────────────────────────┘
         ↑      ↑         ↑        ↑
      color  milestone  tags    dependencies
```

---

## 6. ODOO MODEL COMPLIANCE

### project.task Fields (gebruikt)
```python
color = fields.Integer('Color Index')  # 0-11
tag_ids = fields.Many2many('project.tags', string='Tags')
```

### project.tags Model
```python
# Odoo standaard model
name = fields.Char('Tag Name', required=True)
project_id = fields.Many2one('project.project')
color = fields.Integer('Color')  # Optioneel, niet gebruikt in deze impl.
```

**Waarom geen custom fields?**
- Odoo native = geen migratie issues
- UI/UX gratis in Odoo interface
- Filters/grouping werkt out-of-the-box

---

## 7. TESTING CHECKLIST

### Tags Feature
- [ ] Tag aanmaken in blueprint editor
- [ ] Tag naam wijzigen
- [ ] Tag verwijderen (moet ook uit tasks verdwijnen)
- [ ] Meerdere tags selecteren in task modal
- [ ] Tag badges zichtbaar in task lijst
- [ ] Tags verschijnen in gegenereerd Odoo project
- [ ] Tags zijn project-scoped in Odoo

### Color Feature
- [ ] Color selecteren in task modal (visual feedback)
- [ ] Color wijzigen voor bestaande task
- [ ] "Geen kleur" selecteren (0 of null)
- [ ] Color dot zichtbaar in task lijst
- [ ] Color integer correct in Odoo (1-11)
- [ ] Alle 11 kleuren werken

### Integration
- [ ] Blueprint met tags + colors opslaan
- [ ] Blueprint laden (tags + colors bewaard)
- [ ] Validatie: ongeldige color waarde (moet falen)
- [ ] Validatie: orphaned tag reference (moet falen)
- [ ] Generatie: project met tags + colors in Odoo
- [ ] Odoo: task color visible in kanban
- [ ] Odoo: tags visible in task form/list

---

## 8. TECHNISCHE BESLISSINGEN

### Waarom integer colors i.p.v. RGB?
- Odoo native: `project.task.color` is integer field
- Beperkte palette = betere UX (te veel keuze = paradox)
- Consistent met Odoo UI (dezelfde 11 kleuren)

### Waarom tags gescheiden van milestones?
- **Semantiek:** Milestones = "wanneer?", Tags = "wat?"
- **Kardinaliteit:** Milestone 1:N, Tags M:N
- **Odoo models:** Verschillende relationele structuur
- **Flexibiliteit:** Tags vrij toe te voegen, milestones vaak vast

### Waarom project-scoped tags?
- Odoo `project.tags` heeft `project_id` field
- Voorkomt tag pollution tussen projecten
- Consistent met milestones (ook project-scoped)

### Waarom color nullable?
- Niet alle tasks hebben prioriteit/kleur nodig
- Odoo default = 0 (white/transparent)
- UI: "geen kleur" button = expliciet
- Validatie: null en 0 beiden toegestaan

---

## 9. LIMITATIES

1. **Geen RGB support**: Alleen Odoo's 11 kleuren
2. **Tags niet herbruikbaar**: Elke blueprint heeft eigen tags
3. **Geen tag hierarchie**: Platte lijst (Odoo native limitation)
4. **Geen color per tag**: Tags hebben geen kleur field (mogelijk maar niet geïmplementeerd)

---

## 10. FILES MODIFIED

### Client-Side
- `public/project-generator-client.js`:
  - Tags CRUD functions
  - Color picker event listeners
  - Task modal tag checkboxes
  - Task rendering updates

### Server-Side
- `src/modules/project-generator/validation.js`:
  - `validateTags()`
  - `validateTaskColors()`
  - `validateTaskTagReferences()`

- `src/modules/project-generator/generate.js`:
  - Tags in generation model
  - STEP 5.5: Create tags
  - Task creation: color + tag mapping

- `src/modules/project-generator/odoo-creator.js`:
  - `createTag()` function
  - `createTask()` uitbreiding

### UI Templates
- `src/modules/project-generator/ui.js`:
  - Tags section HTML
  - Tag modal
  - Task modal color picker
  - Task modal tag checkboxes

---

## 11. COMPARISON WITH PREVIOUS ADDENDA

| Addendum | Feature | Complexity | Impact |
|----------|---------|------------|--------|
| D | Milestones | Medium | Semantic correctness |
| E | Inline Dependencies | High | UX improvement (67% click reduction) |
| F | Colors + Tags | Medium | Expressiveness + classification |

**F builds on D:** Tags complement milestones (classification vs structure)  
**F independent of E:** Dependency management orthogonal to colors/tags

---

## 12. GEBRUIKERSHANDLEIDING

### Tags Aanmaken
1. Klik "Add Tag" in Tags sectie
2. Voer tag naam in (bijv. "Urgent")
3. Klik "Save"
4. Tag verschijnt in lijst en is selecteerbaar in tasks

### Task met Color + Tags
1. Open task modal ("Add Task" of edit bestaande)
2. Klik gewenste kleur (ring indicator toont selectie)
3. Vink tags aan die van toepassing zijn
4. Klik "Save"
5. Task toont color dot + tag badges in lijst

### Tags Verwijderen
1. Klik trash icon bij tag
2. Bevestig (tasks behouden tag in blueprint, maar nieuwe projecten niet)
3. Tag verdwijnt uit lijst

**LET OP:** Tags worden uit tasks verwijderd bij delete. Milestone delete doet dit NIET (verschil in semantiek).

---

## 13. ODOO SCREENSHOT VERWACHTINGEN

Na generatie in Odoo:

**Kanban View:**
- Tasks tonen kleur als linker balk
- Tags visible als badges onder task naam

**Form View:**
- Color picker toont selected kleur
- Tags many2many widget toont selected tags
- Tag dropdown toont alleen project-scoped tags

**Filters:**
- "Group by: Tags" werkt out-of-the-box
- Color filter beschikbaar in advanced search

---

## 14. COLOR CONSISTENCY UPDATE (2026-02-04)

**Probleem:** Kleuren waren inconsistent tussen verschillende UI componenten:
- Color picker buttons gebruikten Tailwind classes (`bg-red-500`, `bg-orange-500`, etc.)
- Display dots gebruikten verschillende hex codes voor milestones vs stakeholders
- Task list badges gebruikten DaisyUI color classes die niet overeenkwamen met picker colors

**Oplossing:** Gecentraliseerde color mapping met uniform Odoo color system.

### 14.1 Centralized Color Constants

**Nieuw bestand:** `src/modules/project-generator/color-constants.js`

```javascript
export const ODOO_COLORS_HEX = {
  0: '#E5E7EB',  // Gray-200 - No color
  1: '#EF4444',  // Red-500 - Red
  2: '#F97316',  // Orange-500 - Orange  
  3: '#EAB308',  // Yellow-500 - Yellow
  4: '#3B82F6',  // Blue-500 - Blue
  5: '#EC4899',  // Pink-500 - Pink
  6: '#22C55E',  // Green-500 - Green
  7: '#A855F7',  // Purple-500 - Purple
  8: '#6B7280',  // Gray-500 - Gray
  9: '#8B5CF6',  // Violet-500 - Violet
  10: '#06B6D4', // Cyan-500 - Cyan
  11: '#4F46E5'  // Indigo-600 - Indigo
};
```

**Doel:**
- Single source of truth voor alle color mappings
- Odoo integers 0-11 → consistent hex codes
- Gebruikt in: color pickers, display dots, badges

### 14.2 Implementatie Details

**Voor (inconsistent):**
```javascript
// Milestone display - client.js line ~1375
const colorMap = {
  1: '#EF4444', ..., 8: '#64748B', 9: '#C084FC', 11: '#8B5CF6'
};

// Stakeholder display - client.js line ~1790
const colorMap = {
  1: '#EF4444', ..., 6: '#8B5CF6', 7: '#10B981', 11: '#84CC16'
};

// Task list milestone badges - client.js line ~2495
const colorMap = {
  1: 'badge-error', ..., 11: 'badge-secondary'  // DaisyUI classes
};
```

**Na (consistent):**
```javascript
// Overal dezelfde hex codes
const colorMap = {
  1: '#EF4444', 2: '#F97316', 3: '#EAB308', 4: '#3B82F6', 5: '#EC4899',
  6: '#22C55E', 7: '#A855F7', 8: '#6B7280', 9: '#8B5CF6', 10: '#06B6D4', 11: '#4F46E5'
};

// Badges gebruiken inline styles i.p.v. DaisyUI classes
badge.style.backgroundColor = colorMap[milestone.color];
badge.style.color = 'white';
badge.style.borderColor = colorMap[milestone.color];
```

### 14.3 Aangepaste Componenten

**UI Color Pickers:**
- `src/modules/project-generator/ui.js` (milestone color picker)
- Tailwind class voor color 9: `bg-violet-400` → `bg-violet-500`

**Display Components:**
- Milestone color dots (renderMilestones)
- Stakeholder color dots (renderStakeholders)  
- Stakeholder color picker modal

**Task List Badges:**
- Milestone badges in task metadata
- Stakeholder badges in task metadata
- Van DaisyUI classes naar inline hex styles

### 14.4 Voordelen

✅ **Visual consistency:** Kleur in picker = kleur in lijst = kleur in badge  
✅ **Maintenance:** Wijzig 1 mapping object, update hele systeem  
✅ **Odoo alignment:** Hex codes matchen Tailwind equivalenten van Odoo integers  
✅ **Predictability:** Gebruiker ziet exact wat ze selecteren

### 14.5 Technische Noten

**Waarom inline styles i.p.v. DaisyUI badge classes?**
- DaisyUI heeft beperkte badge color palette (error, warning, info, success, etc.)
- Geen 1-op-1 mapping met Odoo's 11 kleuren mogelijk
- Inline styles garanderen exact match met color picker

**Backwards compatibility:**
- Bestaande blueprints behouden integer colors (0-11)
- Geen migratie nodig, puur UI update
- Odoo generatie ongewijzigd (gebruikt nog steeds integers)

---

## CONCLUSIE

Addendum F voegt twee complementaire expressiviteitslagen toe:

1. **Colors:** Visuele prioritering via Odoo-native integer system
2. **Tags:** Flexibele classificatie naast structurele milestones

Beide features gebruiken standaard Odoo models, geen custom fields. Dit garandeert:
- ✅ Odoo UI/UX gratis
- ✅ Geen migratie issues bij Odoo upgrades
- ✅ Filters en grouping out-of-the-box
- ✅ Consistent met Odoo best practices

**Update 2026-02-04:** Color consistency unified via centralized mapping system.

**Status:** Ready for production testing.

