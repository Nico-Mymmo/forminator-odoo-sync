# ADDENDUM J: Stakeholders, User Mapping & Project Ownership

**Status**: ✅ **Geïmplementeerd**  
**Datum**: 2026-01-29  
**Versie**: 1.0  
**Relatie**: Uitbreiding op Project Generator Module

---

## 🎯 Doelstelling

Introduceer **stakeholders** als herbruikbare persona's in blueprints, met **mapping naar echte Odoo users** tijdens generatie. Dit maakt templates abstract en herbruikbaar, terwijl taken correct worden toegewezen aan echte mensen.

**Kernprincipe**: Blueprints zijn generiek, generatie is specifiek.

---

## 🧩 Conceptueel Model

### Drie Niveaus

1. **Blueprint-niveau**: Abstracte rollen (stakeholders)
2. **Generatie-niveau**: Concrete users (res.users)
3. **Odoo-niveau**: Effectieve toewijzingen (project.user_id, task.user_ids)

### Waarom?

**Templates zijn herbruikbaar**. Als je een template maakt voor "Website Redesign", definieer je:
- Stakeholder: "Project Manager"
- Stakeholder: "UX Designer"
- Stakeholder: "Client Contact"

Bij generatie map je deze stakeholders naar **echte mensen**:
- "Project Manager" → John Doe, Sarah Smith
- "UX Designer" → Alice Johnson
- "Client Contact" → Bob Williams

**Zonder stakeholders** zou je elke keer bij generatie alle gebruikers handmatig moeten toewijzen → niet schaalbaar.

---

## 📐 J1: Blueprint Stakeholders

### Schema-uitbreiding

```json
{
  "stakeholders": [
    {
      "id": "uuid-1",
      "name": "Project Manager",
      "description": "Overall responsibility for project delivery"
    },
    {
      "id": "uuid-2",
      "name": "UX Designer",
      "description": "User experience and interface design"
    }
  ],
  "tasks": [
    {
      "id": "task-uuid-1",
      "name": "Design wireframes",
      "stakeholder_ids": ["uuid-2"]  // Assigned to UX Designer
    },
    {
      "id": "task-uuid-2",
      "name": "Review and approve",
      "stakeholder_ids": ["uuid-1", "uuid-2"]  // Multiple stakeholders
    }
  ]
}
```

**Regels**:
- `id`: UUID (consistent met andere entities)
- `name`: Verplicht, uniek binnen blueprint
- `description`: Optioneel
- `stakeholder_ids` op tasks: Array van stakeholder UUIDs (meerdere toegestaan)

### UI: Stakeholders Section

**Collapsible sectie** (consistent met Addendum I):
```
▼ Stakeholders (4)
  Project Manager  
    Overall responsibility
    [Edit] [Delete]
  
  UX Designer
    User experience design
    [Edit] [Delete]
```

**CRUD operations**:
- Create: Nieuwe stakeholder definiëren
- Update: Naam en beschrijving aanpassen
- Delete: Alleen toegestaan als geen tasks meer verwijzen

**Verwijderen met usage check**:
```javascript
const usedByTasks = blueprintState.tasks.filter(task => 
  task.stakeholder_ids && task.stakeholder_ids.includes(stakeholderId)
);

if (usedByTasks.length > 0) {
  confirm('Stakeholder is used by 5 task(s). Delete anyway?');
}
```

---

## 📐 J2: Taken Koppelen aan Stakeholders

### Task Modal

**Multi-select stakeholders** (na tags):
```
┌─────────────────────────────────┐
│ Tags                             │
│ ☑ Urgent  ☐ Client-facing       │
│                                  │
│ Stakeholders                     │
│ ☑ Project Manager               │
│ ☑ UX Designer                    │
│ ☐ Developer                      │
└─────────────────────────────────┘
```

**Implementatie**:
```javascript
const stakeholdersContainer = document.getElementById('taskStakeholdersContainer');
blueprintState.stakeholders.forEach(stakeholder => {
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = stakeholder.id;
  checkbox.dataset.stakeholderId = stakeholder.id;
  // ... append to label
  stakeholdersContainer.appendChild(label);
});
```

**Save logic**:
```javascript
const stakeholderCheckboxes = document.querySelectorAll(
  '#taskStakeholdersContainer input[type="checkbox"]:checked'
);
task.stakeholder_ids = Array.from(stakeholderCheckboxes).map(cb => cb.value);
```

### Task List Rendering

**Stakeholder badges** (na tags):
```
Task Name  [Phase 1]  [Urgent]  [👤 PM]  [👤 UX Designer]
```

**Badge styling**:
```javascript
stakeholderBadge.className = 'badge badge-sm badge-secondary gap-1';
// Icon: user (lucide)
// Tooltip: stakeholder.description || stakeholder.name
```

---

## 📐 J3: Generatie Flow met User Mapping

### Stap 1: Projectstartdatum (Addendum H)

Bestaand gedrag blijft.

### Stap 2: Fetch Odoo Users (NIEUW)

**Client**:
```javascript
const usersResponse = await fetch('/projects/api/odoo-users', {
  credentials: 'include'
});
const usersResult = await usersResponse.json();
const odooUsers = usersResult.users || [];
```

**Server** (module.js):
```javascript
'GET /api/odoo-users': async (context) => {
  const users = await getActiveUsers(env);
  return Response.json({ success: true, users });
}
```

**Odoo API** (odoo-creator.js):
```javascript
export async function getActiveUsers(env) {
  return await searchRead(env, {
    model: 'res.users',
    domain: [
      ['active', '=', true],
      ['share', '=', false]  // Internal users only
    ],
    fields: ['id', 'name', 'login'],
    order: 'name asc'
  });
}
```

### Stap 3: Stakeholder Mapping Modal (NIEUW)

**Modal flow**:
```
┌────────────────────────────────────────┐
│ Map Stakeholders to Users              │
├────────────────────────────────────────┤
│ Project Responsible *                  │
│ [-- Select User --                  ▼] │
│                                         │
│ ────── Stakeholder Assignments ───────│
│                                         │
│ Project Manager                        │
│ [John Doe        ] (multi-select)      │
│ [Sarah Smith     ]                      │
│                                         │
│ UX Designer                             │
│ [Alice Johnson   ]                      │
│                                         │
│           [Cancel]  [Continue]          │
└────────────────────────────────────────┘
```

**Project Responsible**:
- **Verplicht**: Elk project moet een verantwoordelijke hebben
- Single-select dropdown
- Wordt opgeslagen als `project.project.user_id`

**Stakeholder Assignments**:
- **Optioneel**: Stakeholders mogen leeg blijven
- Multi-select per stakeholder (Ctrl/Cmd)
- Meerdere users per stakeholder toegestaan

**Return value**:
```javascript
{
  project_responsible: 42,  // Odoo user ID
  stakeholders: {
    "uuid-1": [42, 15],     // Project Manager → 2 users
    "uuid-2": [23]          // UX Designer → 1 user
  }
}
```

### Stap 4: Preview (Bestaand)

Preview blijft ongewijzigd. Timing is bewerkbaar (Addendum H), stakeholders zijn al gemapped.

### Stap 5: Generatie

**buildGenerationModel** krijgt stakeholder mapping mee:
```javascript
export function buildGenerationModel(
  blueprint, 
  templateName, 
  projectStartDate = null,
  stakeholderMapping = null  // NIEUW
) {
  const model = {
    project: {
      name: `${templateName} (${timestamp})`,
      user_id: stakeholderMapping?.project_responsible || null  // Project responsible
    },
    tasks: []
  };
  
  // Voor elke taak: map stakeholder_ids → user_ids
  blueprint.tasks.forEach(task => {
    let user_ids = [];
    if (stakeholderMapping && task.stakeholder_ids) {
      task.stakeholder_ids.forEach(stakeholderId => {
        const mappedUsers = stakeholderMapping.stakeholders[stakeholderId];
        if (mappedUsers) {
          user_ids.push(...mappedUsers);
        }
      });
      // Remove duplicates
      user_ids = [...new Set(user_ids)];
    }
    
    model.tasks.push({
      name: task.name,
      user_ids: user_ids,  // Mapped Odoo user IDs
      // ... other fields
    });
  });
  
  return model;
}
```

---

## 📐 J4: Odoo Project & Task Creation

### Project Responsible

**createProject** (odoo-creator.js):
```javascript
export async function createProject(env, data) {
  const values = {
    name: data.name
  };
  
  if (data.user_id) {
    values.user_id = data.user_id;  // Addendum J
  }
  
  return await create(env, {
    model: 'project.project',
    values: values
  });
}
```

**Odoo veld**: `project.project.user_id` (many2one → res.users)

### Task Users

**createTask** (odoo-creator.js):
```javascript
export async function createTask(env, data) {
  const values = {
    name: data.name,
    project_id: data.project_id
  };
  
  // Addendum J: User assignment
  if (data.user_ids && data.user_ids.length > 0) {
    values.user_ids = data.user_ids.map(id => [4, id]);  // [(4, id)] = link existing
  }
  
  return await create(env, {
    model: 'project.task',
    values: values
  });
}
```

**Odoo veld**: `project.task.user_ids` (many2many → res.users)

---

## 📐 J5: Preview Aanpassingen (Optioneel)

### Preview Toont Users

**Niet geïmplementeerd in eerste versie**, maar voorbereid.

Toekomstige uitbreiding:
```
┌─────────────────────────────────────────────────┐
│ Task Name          Start      Deadline   Users  │
│ Design wireframes  2026-02-01 2026-02-05 [👤 2] │
└─────────────────────────────────────────────────┘
```

Op klik: Modal met user-lijst, bewerkbaar.

**Waarom niet nu?**:
- Stakeholder mapping gebeurt al **vóór** preview
- Preview is primair voor timing-controle (Addendum H)
- User-wijzigingen in preview compliceren flow (twee mapping-momenten)

**Toekomstige scope**:
- Users toevoegen/verwijderen in preview
- Override stakeholder mapping per taak

---

## 📐 J6: Subtask Inheritance

### Principe

**Subtasks erven stakeholders van parent** (consistent met tags, Addendum H).

### Implementatie

**buildGenerationModel**:
```javascript
if (task.parent_id) {
  const parent = blueprint.tasks.find(t => t.id === task.parent_id);
  if (parent) {
    // J6: Inherit stakeholders
    if (parent.stakeholder_ids && parent.stakeholder_ids.length > 0) {
      if (!task.stakeholder_ids || task.stakeholder_ids.length === 0) {
        task.stakeholder_ids = [...parent.stakeholder_ids];
      }
    }
  }
}
```

**Blueprint editor** (client.js):
```javascript
function recalculateRelativeTiming() {
  blueprintState.tasks.forEach(task => {
    if (task.parent_id) {
      const parent = parentMap.get(task.parent_id);
      if (parent) {
        // Subtask inherits stakeholders from parent (auto-sync)
        if (parent.stakeholder_ids && parent.stakeholder_ids.length > 0) {
          if (!task.stakeholder_ids || task.stakeholder_ids.length === 0) {
            task.stakeholder_ids = [...parent.stakeholder_ids];
          }
        }
      }
    }
  });
}
```

**Gedrag**:
- Parent heeft stakeholders → subtask erft automatisch
- Subtask heeft eigen stakeholders → geen overerving (expliciet wint)

---

## 🔄 Data Flow Overzicht

```
BLUEPRINT
  stakeholders: ["PM", "Designer"]
  tasks:
    - name: "Design wireframe"
      stakeholder_ids: ["Designer"]
      
    ↓

GENERATION MODAL
  User kiest:
    Project responsible: John Doe (ID: 42)
    Designer → Alice (ID: 23)
    
  stakeholderMapping = {
    project_responsible: 42,
    stakeholders: {
      "Designer": [23]
    }
  }
  
    ↓

GENERATION MODEL
  project:
    user_id: 42
  tasks:
    - name: "Design wireframe"
      user_ids: [23]  // Mapped from stakeholder "Designer"
      
    ↓

ODOO
  project.project
    user_id: 42
  project.task
    user_ids: [(4, 23)]  // M2M link
```

---

## 🧪 Validation

### Stakeholder Schema

**validation.js**:
```javascript
function validateStakeholders(stakeholders, result) {
  if (!Array.isArray(stakeholders)) {
    result.errors.push('Stakeholders must be an array');
    return;
  }
  
  const seenIds = new Set();
  const seenNames = new Set();
  
  stakeholders.forEach((stakeholder, index) => {
    // Validate ID
    if (!stakeholder.id) {
      result.errors.push(`Stakeholder at index ${index} missing id`);
    } else if (seenIds.has(stakeholder.id)) {
      result.errors.push(`Duplicate stakeholder id: ${stakeholder.id}`);
    } else {
      seenIds.add(stakeholder.id);
    }
    
    // Validate name
    if (!stakeholder.name || stakeholder.name.trim().length === 0) {
      result.errors.push(`Stakeholder at index ${index} missing name`);
    } else {
      const lowerName = stakeholder.name.trim().toLowerCase();
      if (seenNames.has(lowerName)) {
        result.warnings.push(`Duplicate stakeholder name: ${stakeholder.name}`);
      } else {
        seenNames.add(lowerName);
      }
    }
  });
}
```

### Task Stakeholder References

```javascript
function validateTaskStakeholderReferences(tasks, stakeholders, result) {
  const stakeholderIds = new Set(stakeholders.map(s => s.id));
  
  tasks.forEach((task, index) => {
    if (task.stakeholder_ids && Array.isArray(task.stakeholder_ids)) {
      task.stakeholder_ids.forEach(stakeholderId => {
        if (!stakeholderIds.has(stakeholderId)) {
          result.errors.push(
            `Task "${task.name || index}" references non-existent stakeholder: ${stakeholderId}`
          );
        }
      });
    }
  });
}
```

**Geen user-validatie op blueprint-niveau**: Users bestaan pas bij generatie.

---

## 🔒 Beperkingen (EXPRES)

### Wat Addendum J NIET doet

❌ **Geen nieuwe Odoo modellen**  
Gebruikt bestaande `res.users`, `project.project.user_id`, `project.task.user_ids`

❌ **Geen wijzigingen aan res.users**  
Alleen lezen, geen aanmaken/bewerken

❌ **Geen automatische partner-mapping**  
Geen koppeling met `res.partner` of `project.project.partner_id`

❌ **Geen rol-rechtenlogica**  
Geen validatie of user toegang heeft tot project (Odoo verantwoordelijkheid)

❌ **Geen synchronisatie na generatie**  
Als users wijzigen in Odoo, synchroniseert blueprint niet terug

❌ **Geen user-selector in preview**  
Users zijn al gemapped vóór preview (toekomstige scope)

❌ **Geen team-assignments**  
Geen ondersteuning voor Odoo `project.project.collaborator_ids` (toekomstig)

### Waarom?

**Scope control**. Addendum J voegt **enkel** stakeholder-mapping toe:
- Blueprint blijft abstract (herbruikbaar)
- Generatie vraagt concrete users
- Odoo krijgt standaard velden gevuld

**Alles meer** zou:
- Complexiteit exponentieel verhogen
- Odoo-specifieke business logic vereisen
- Synchronisatie-problemen introduceren

---

## 🔄 Backward Compatibility

### ✅ Bestaande Templates Blijven Geldig

**Template zonder stakeholders**:
```json
{
  "tasks": [
    { "name": "Task 1" }  // Geen stakeholder_ids
  ]
}
```
→ **Werkt nog steeds**, geen users toegewezen (valide Odoo-scenario)

**Template met stakeholders maar geen mapping**:
- Bij generatie: project_responsible is **verplicht**
- Stakeholder-mapping is **optioneel** (stakeholders mogen leeg blijven)
- Taken zonder gemapte stakeholders krijgen **geen users**

### ❌ Geen Migraties Nodig

- `stakeholders` is **nieuwe top-level property** (default: `[]`)
- `stakeholder_ids` op tasks is **nieuw veld** (default: `[]`)
- Bestaande blueprints worden automatisch geüpgraded bij laden

---

## 📝 Files Modified

### Frontend

**public/project-generator-client.js**:
- `blueprintState.stakeholders` toegevoegd
- `renderStakeholders()` functie (CRUD)
- Stakeholder checkboxes in task modal
- `showStakeholderMappingModal()` functie
- `generateProjectFromTemplate()` flow uitgebreid
- Preview modal signature updated
- `executeGenerationWithOverride()` met stakeholderMapping

### Backend

**src/modules/project-generator/odoo-creator.js**:
- `getActiveUsers()` functie (GET res.users)
- `createProject()` met `user_id` parameter
- `createTask()` met `user_ids` parameter

**src/modules/project-generator/generate.js**:
- `buildGenerationModel()` signature: `stakeholderMapping` parameter
- Subtask stakeholder inheritance (J6)
- Stakeholder → user mapping logic (J3)
- `createProject()` call met `user_id`
- `createTask()` call met `user_ids`

**src/modules/project-generator/validation.js**:
- `validateStakeholders()` functie
- `validateTaskStakeholderReferences()` functie
- Calls toegevoegd aan `validateBlueprint()`

**src/modules/project-generator/module.js**:
- `GET /api/odoo-users` route
- `POST /api/generate-preview/:id` parse stakeholderMapping
- `POST /api/generate/:id` parse stakeholderMapping
- Import van `getActiveUsers`

**src/modules/project-generator/ui.js**:
- Stakeholders collapsible section HTML
- Stakeholder modal HTML
- Stakeholders container in task modal

---

## 🎓 Lessons Learned

### Wat Goed Werkte

1. **Abstractie-scheiding**: Blueprint ≠ Generatie ≠ Odoo  
   Maakt templates herbruikbaar en universeel.

2. **Mapping vóór preview**: Simplificeer flow  
   Geen dubbele mapping-momenten.

3. **Multi-select voor stakeholders**: Flexibiliteit  
   Stakeholders kunnen meerdere users zijn (realistisch).

4. **Project responsible verplicht**: Duidelijke ownership  
   Elk Odoo project moet een verantwoordelijke hebben.

### Wat Te Vermijden

1. **User-wijzigingen in preview**: Scope creep  
   Twee mapping-momenten compliceren UX (toekomstige scope).

2. **Automatische partner-mapping**: Te specifiek  
   Odoo `res.partner` logica is business-dependent.

3. **Synchronisatie**: Bi-directioneel is complex  
   Blueprint → Odoo is eenrichtingsverkeer.

### Toekomstige Verbeteringen (Niet in Addendum J)

- **User-selector in preview**: Users toevoegen/verwijderen per taak
- **Team-assignments**: Support voor `project.collaborator_ids`
- **Role-based suggestions**: "Suggest Designer → [all users with Designer role]"
- **Partner-mapping**: Optionele koppeling met `res.partner`

---

## 📚 Gerelateerde Documenten

- [ITERATION_4_SUMMARY.md](./ITERATION_4_SUMMARY.md) — Project Generation Pipeline
- [ADDENDUM_F.md](./ADDENDUM_F.md) — Task Colors + Tags
- [ADDENDUM_H.md](./ADDENDUM_H.md) — Timing Inheritance
- [ADDENDUM_I.md](./ADDENDUM_I.md) — Blueprint Editor UX Refinement

---

**Addendum J maakt templates herbruikbaar,  
generatie concrete.**
