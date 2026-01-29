# ADDENDUM G: Task Timings, Deadlines & Planned Hours

**Status**: ✅ **Geïmplementeerd**  
**Datum**: 2025  
**Versie**: 1.0  

---

## 🎯 Doelstelling

Voeg **voorspellende timing-functionaliteit** toe aan Project Generator templates:
- **Deadlines** (wanneer moet taak af zijn)
- **Duur** (hoeveel werkdagen neemt taak)
- **Geplande uren** (resource planning)

**Kernprincipe**: Templates blijven **tijdloos** — alle datums worden **runtime berekend** vanaf een projectstartdatum.

---

## 🧠 Filosofie: "Templates Are Timeless"

### Waarom GEEN absolute datums in templates?

Templates zijn **herbruikbare blauwdrukken**. Absolute datums (bijv. "2025-03-15") maken templates:
- ❌ Eenmalig bruikbaar
- ❌ Verouderd binnen dagen
- ❌ Niet schaalbaar voor meerdere projecten

### ✅ Relatieve timing: "Start + 14 werkdagen"

In plaats daarvan slaan we op:
- `deadline_offset_days: 14` → "Deadline is 14 werkdagen na projectstart"
- `duration_days: 5` → "Taak duurt 5 werkdagen"
- `planned_hours: 8` → "Budget 8 uur voor deze taak"

**Op generatiemoment** berekenen we:
```javascript
projectStartDate = '2025-06-01'  // Input van gebruiker
deadline = projectStartDate + 14 workdays = '2025-06-19'
start_date = deadline - 5 workdays = '2025-06-12'
```

---

## 📐 Werkdag Berekeningen

### Wat is een "werkdag"?

**Maandag t/m vrijdag** (weekenden overgeslagen):
```javascript
function addWorkdays(startDate, days) {
  let current = new Date(startDate);
  let remaining = days;
  
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {  // Skip Sunday (0) and Saturday (6)
      remaining--;
    }
  }
  
  return current.toISOString().split('T')[0];
}
```

**Voorbeeld**:
```
start: 2025-06-01 (maandag)
+ 3 werkdagen:
  - 2025-06-02 (di) → 1 werkdag
  - 2025-06-03 (wo) → 2 werkdagen
  - 2025-06-04 (do) → 3 werkdagen
result: 2025-06-04
```

**Weekend-scenario**:
```
start: 2025-06-06 (vrijdag)
+ 3 werkdagen:
  - 2025-06-09 (ma) → 1 werkdag  (weekend overgeslagen)
  - 2025-06-10 (di) → 2 werkdagen
  - 2025-06-11 (wo) → 3 werkdagen
result: 2025-06-11
```

### Deadline vs Start Date

**Forward calculation** (deadline):
```javascript
deadline = addWorkdays(projectStartDate, deadline_offset_days)
```

**Backward calculation** (start):
```javascript
// Eerst deadline berekenen, dan terugrekenen
if (task.duration_days && task.deadline_offset_days) {
  const deadline = addWorkdays(projectStartDate, task.deadline_offset_days);
  // Trek duration af van deadline voor start_date
  start_date = subtractWorkdays(deadline, task.duration_days);
}
```

**Implementatie detail**: We gebruiken negatieve offset voor achterwaartse berekening:
```javascript
start_date = addWorkdays(deadline, -task.duration_days)
```

---

## 🗂️ Data Schema

### Blueprint (Template Storage)

```json
{
  "tasks": [
    {
      "id": "task-1",
      "name": "Requirements Analysis",
      "deadline_offset_days": 5,      // Optioneel: int, relatief t.o.v. project start
      "duration_days": 3,              // Optioneel: int, aantal werkdagen
      "planned_hours": 24.0            // Optioneel: float, geschat aantal uren → mapped to allocated_hours
    }
  ]
}
```

**Validatieregels** (`validateTaskTimings()`):
- `deadline_offset_days`: integer ≥ 0
- `duration_days`: integer ≥ 0
- `planned_hours`: float ≥ 0 (mapped to Odoo `allocated_hours`)
- ⚠️ Waarschuwing: `duration_days` zonder `deadline_offset_days` heeft geen effect op Odoo start date

### Generation Model (Runtime Calculation)

```json
{
  "tasks": [
    {
      "name": "Requirements Analysis",
      "date_deadline": "2025-06-06",       // Absolute ISO date (calculated)
      "planned_date_begin": "2025-06-03",  // Absolute ISO date (calculated)
      "allocated_hours": 24.0              // Mapped from blueprint planned_hours
    }
  ]
}
```

**Note**: Blueprint `planned_hours` is mapped to Odoo `allocated_hours` field.

### Odoo Native Fields

| Odoo Field           | Type     | Status              | Beschrijving                     |
|----------------------|----------|---------------------|----------------------------------|
| `date_deadline`      | Date     | ✅ **Supported**    | Hard deadline voor taak          |
| `planned_date_begin` | Date     | ✅ **Supported**    | Geplande startdatum              |
| `allocated_hours`    | Float    | ✅ **Supported**    | Geschat aantal uren (mapped from blueprint `planned_hours`) |

**Field Mapping**:
- Blueprint field `planned_hours` → Odoo field `allocated_hours`
- Native field in `project.task` model (no module dependency)

---

## 🔄 Generation Flow

### 1. Gebruiker Initieert Preview

```javascript
async function generateProjectFromTemplate(templateId) {
  // Prompt for project start date
  const projectStartDate = prompt(
    'Enter project start date (YYYY-MM-DD):',
    new Date().toISOString().split('T')[0]
  );
  
  if (!projectStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(projectStartDate)) {
    return alert('Invalid date format');
  }
  
  // Generate preview with start date
  const response = await fetch(`/api/generate-preview/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectStartDate })
  });
  
  const generationModel = await response.json();
  showGenerationPreviewModal(generationModel, templateId, projectStartDate);
}
```

### 2. Backend Berekent Absolute Datums

```javascript
function buildGenerationModel(blueprint, templateName, projectStartDate = null) {
  return {
    project: { name: templateName },
    tasks: blueprint.tasks.map(task => {
      const generatedTask = { name: task.name };
      
      // Calculate timing if projectStartDate provided
      if (projectStartDate && task.deadline_offset_days !== undefined) {
        const deadline = addWorkdays(projectStartDate, task.deadline_offset_days);
        generatedTask.date_deadline = deadline;
        
        // Calculate start date if duration specified
        if (task.duration_days) {
          generatedTask.planned_date_begin = addWorkdays(deadline, -task.duration_days);
        }
      }
      
      if (task.planned_hours !== undefined) {
        generatedTask.planned_hours = task.planned_hours;
      }
      
      return generatedTask;
    })
  };
}
```

### 3. Preview Modal Toont Berekende Datums

```javascript
function showGenerationPreviewModal(generationModel, templateId, projectStartDate) {
  // Modal shows:
  // - Project name
  // - List of tasks with calculated dates
  // - Confirm button executes generation with projectStartDate
  
  confirmBtn.onclick = async () => {
    await executeGenerationWithOverride(templateId, generationModel, projectStartDate);
  };
}
```

### 4. Definitieve Generatie

```javascript
async function executeGenerationWithOverride(templateId, overrideModel, projectStartDate, confirmOverwrite = false) {
  const response = await fetch(`/api/generate/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      overrideModel,
      projectStartDate,
      confirmOverwrite
    })
  });
  
  // Handle 409 conflict (existing in-progress generation)
  if (response.status === 409) {
    showBlockedGenerationModal(result, templateId, overrideModel, projectStartDate);
  }
}
```

---

## 🎨 UI Components

### Task Editor Modal

**Timing sectie** toegevoegd aan task modal:

```html
<div class="divider text-sm font-medium text-base-content/50">
  ⏱️ Timing (Optional)
</div>

<!-- Deadline Offset -->
<div class="form-control">
  <label class="label">
    <span class="label-text">Deadline Offset (workdays)</span>
  </label>
  <input type="number" id="deadline-offset-input" min="0" step="1"
         class="input input-bordered" placeholder="e.g., 14">
  <label class="label">
    <span class="label-text-alt text-base-content/60">
      Days after project start (weekends excluded)
    </span>
  </label>
</div>

<!-- Duration -->
<div class="form-control">
  <label class="label">
    <span class="label-text">Duration (workdays)</span>
  </label>
  <input type="number" id="duration-input" min="0" step="1"
         class="input input-bordered" placeholder="e.g., 5">
  <label class="label">
    <span class="label-text-alt text-base-content/60">
      Task duration relative to its deadline
    </span>
  </label>
</div>

<!-- Planned Hours -->
<div class="form-control">
  <label class="label">
    <span class="label-text">Planned Hours</span>
  </label>
  <input type="number" id="planned-hours-input" min="0" step="0.5"
         class="input input-bordered" placeholder="e.g., 8">
  <label class="label">
    <span class="label-text-alt text-base-content/60">
      Estimated effort in hours
    </span>
  </label>
</div>
```

### Task List Badge

Visual indicator voor tasks met timing:

```javascript
if (task.deadline_offset_days !== undefined || task.planned_hours !== undefined) {
  const timingBadge = document.createElement('div');
  timingBadge.className = 'badge badge-ghost badge-sm gap-1';
  timingBadge.innerHTML = `
    <i data-lucide="clock" class="w-3 h-3"></i>
    ${task.deadline_offset_days !== undefined ? task.deadline_offset_days + 'd' : ''}
    ${task.planned_hours !== undefined ? ' / ' + task.planned_hours + 'h' : ''}
  `;
  taskItem.appendChild(timingBadge);
}
```

**Voorbeeld badge**: `⏱️ 14d / 8h`

---

## 🔍 Validatie

### Client-Side Validation

```javascript
function validateTaskTimings(task) {
  const errors = [];
  const warnings = [];
  
  // Deadline offset must be non-negative integer
  if (task.deadline_offset_days !== undefined) {
    if (!Number.isInteger(task.deadline_offset_days) || task.deadline_offset_days < 0) {
      errors.push(`Task "${task.name}": deadline_offset_days must be non-negative integer`);
    }
  }
  
  // Duration must be non-negative integer
  if (task.duration_days !== undefined) {
    if (!Number.isInteger(task.duration_days) || task.duration_days < 0) {
      errors.push(`Task "${task.name}": duration_days must be non-negative integer`);
    }
    
    // Warning: duration without deadline has no effect
    if (task.deadline_offset_days === undefined) {
      warnings.push(`Task "${task.name}": duration_days without deadline_offset_days won't set start date in Odoo`);
    }
  }
  
  // Planned hours must be non-negative float
  if (task.planned_hours !== undefined) {
    if (typeof task.planned_hours !== 'number' || task.planned_hours < 0) {
      errors.push(`Task "${task.name}": planned_hours must be non-negative number`);
    }
  }
  
  return { errors, warnings };
}
```

### Backend Validation

Geen extra backend validatie — Odoo accepteert:
- `date_deadline`: ISO date string
- `planned_date_begin`: ISO date string
- `planned_hours`: float

---

## 🧪 Testing Scenario

### 1. Template Aanmaken

```
Template: "Website Redesign"

Task 1: "Requirements Gathering"
- Deadline offset: 5 werkdagen
- Duration: 3 werkdagen
- Planned hours: 24

Task 2: "Design Mockups"
- Deadline offset: 10 werkdagen
- Duration: 5 werkdagen
- Planned hours: 40
```

### 2. Preview Genereren

```
Input: projectStartDate = '2025-06-02' (maandag)

Expected calculation:
Task 1:
  - deadline = 2025-06-02 + 5 workdays = 2025-06-09 (maandag)
  - start_date = 2025-06-09 - 3 workdays = 2025-06-04 (woensdag)
  - planned_hours = 24

Task 2:
  - deadline = 2025-06-02 + 10 workdays = 2025-06-16 (maandag)
  - start_date = 2025-06-16 - 5 workdays = 2025-06-09 (maandag)
  - planned_hours = 40
```

### 3. Odoo Verificatie

Na generatie, check in Odoo project.task:
```
Task 1:
  - name: "Requirements Gathering"
  - date_deadline: 2025-06-09
  - planned_date_begin: 2025-06-04
  - allocated_hours: 24.0

Task 2:
  - name: "Design Mockups"
  - date_deadline: 2025-06-16
  - planned_date_begin: 2025-06-09
  - allocated_hours: 40.0
```

**Note**: Blueprint field `planned_hours` is automatically mapped to Odoo field `allocated_hours`.

---

## 🔄 Retry Scenario

Als generatie geblokkeerd wordt door bestaande in-progress generatie:

```javascript
// Response 409: Conflict
{
  "success": false,
  "message": "Generation already in progress",
  "inProgressStartedAt": "2025-06-01T10:30:00Z"
}

// Blocked modal toont:
showBlockedGenerationModal(result, templateId, overrideModel, projectStartDate);

// Retry button herstart generatie met zelfde projectStartDate:
retryBtn.onclick = async () => {
  await executeGenerationWithOverride(templateId, overrideModel, projectStartDate, true);
};
```

**Belangrijk**: `projectStartDate` wordt **persistent** doorgegeven door retry flow, zodat datums consistent blijven.

---

## 🔙 Backwards Compatibility

### Legacy Templates Zonder Timing

Templates zonder `deadline_offset_days`, `duration_days`, of `planned_hours`:
- ✅ Blijven volledig functioneel
- ✅ Genereren tasks zonder timing velden
- ✅ Geen validatiefouten

### API Contract

```javascript
// Optioneel projectStartDate in POST /api/generate/:id
{
  "overrideModel": { /* ... */ },
  "projectStartDate": "2025-06-01",  // Optioneel
  "confirmOverwrite": false
}

// Als projectStartDate NIET meegegeven:
// - Timing velden worden NIET berekend
// - Tasks hebben geen date_deadline/planned_date_begin
```

---

## 📊 Comparison: Addendum F vs G

| Aspect              | **Addendum F** (Colors + Tags)       | **Addendum G** (Timings)              |
|---------------------|--------------------------------------|---------------------------------------|
| **Data Type**       | Static metadata (color_index, tags) | Dynamic calculations (dates)          |
| **Storage**         | Direct in blueprint                  | Relative offsets in blueprint         |
| **Generation Time** | Copy verbatim to Odoo                | Calculate absolute dates from offset  |
| **User Input**      | Design-time (template editor)        | Runtime (project start date prompt)   |
| **Odoo Fields**     | Native fields (color, tag_ids)       | Native fields (deadlines, hours)      |
| **Validation**      | Tag references exist                 | Non-negative integers/floats          |
| **Global Data**     | Tags (project.tags, no project_id)   | None (task-level only)                |

---

## 🎓 Lessons Learned

### 1. **Templates moeten tijdloos zijn**
Absolute datums maken templates wegwerpbaar. Relatieve offsets maken ze **herbruikbaar**.

### 2. **Workday berekeningen zijn complex**
Simpel "+14 dagen" telt weekenden mee → foutieve planning. Dedicated `addWorkdays()` functie essentieel.

### 3. **Backward calculation vereist negatieve offset**
JavaScript `Date` API heeft geen "subtract workdays" → hergebruik `addWorkdays(date, -days)`.

### 4. **Preview vereist projectStartDate vroeg in proces**
Native `prompt()` dialog **voor** preview laadt zorgt voor consistente datumberekeningen.

### 5. **Retry flow moet projectStartDate preserveren**
Blocked modal moet `projectStartDate` doorgeven aan retry button, anders herberekening met verkeerde datum.

---

## ✅ Acceptance Criteria

- [x] Blueprint schema: `deadline_offset_days`, `duration_days`, `planned_hours`
- [x] UI: Task modal met timing inputs en helper text
- [x] UI: Timing badge in task list (bijv. "14d / 8h")
- [x] Validatie: Non-negative integers/floats, warning bij duration zonder deadline
- [x] Workday calculator: `addWorkdays()` skip Sa/Su
- [x] Date calculation: Forward voor deadline, backward voor start
- [x] API: `/api/generate-preview/:id` accepts `projectStartDate`
- [x] API: `/api/generate/:id` accepts `projectStartDate`
- [x] Client: Prompt voor projectStartDate met validatie
- [x] Retry: Blocked modal preserveert `projectStartDate`
- [x] Odoo: `createTask()` mapt timing velden correct
- [x] Backwards compatibility: Legacy templates zonder timing werken

---

## ⚠️ Known Limitations

_No known limitations at this time. All timing features fully supported._

---

## 🚀 Future Enhancements (Out of Scope)

- **Preview UI**: Toon berekende datums in preview modal (currently only in Odoo after generation)
- **Dependencies**: "Task B start = Task A deadline + 2 dagen"
- **Holidays**: National holidays database voor accurate workday calculation
- **Resource leveling**: Automatic task scheduling based on team capacity
- **Gantt chart**: Visual timeline in template editor
- **Time tracking**: Actual hours vs planned hours reporting

---

**Implementatie complete** ✅  
**Documentatie versie**: 1.0  
**Laatste update**: 2025
