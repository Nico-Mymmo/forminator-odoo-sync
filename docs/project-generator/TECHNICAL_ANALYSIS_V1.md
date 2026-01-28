# Project Generator - Technical Analysis (V1 MVP Scope)

## Executive Summary

This document specifies **exactly how** to implement the Project Generator V1 using the **existing** application infrastructure.

**No new patterns. No new abstractions. No new libraries.**

Uses:
- Existing `src/modules/registry.js` for module registration
- Existing `src/lib/odoo.js` for all Odoo communication
- Existing `src/lib/database.js` for Supabase queries
- Existing `src/lib/auth/*` for authentication
- DaisyUI components matching existing app style

---

## Architecture Integration

### Module Registration (Existing Pattern)

**File: `src/modules/project-generator/module.js`**
```javascript
export default {
  id: 'project-generator',
  name: 'Project Generator',
  description: 'Design and deploy project templates to Odoo',
  icon: '📋',
  enabled: true,
  routes: [
    { path: '/project-generator', component: 'TemplateLibrary' },
    { path: '/project-generator/edit/:id?', component: 'BlueprintEditor' },
    { path: '/project-generator/generate/:id', component: 'ProjectGeneration' }
  ]
};
```

**Registration: `src/modules/registry.js`**
```javascript
import projectGenerator from './project-generator/module.js';

export const modules = [
  // existing modules...
  projectGenerator
];
```

**No new routing system. No new module loader.**

---

## File Structure

```
src/modules/project-generator/
├── module.js               # Module definition
├── ui.js                   # Main UI component router
├── library.js              # Template library screen
├── editor.js               # Blueprint editor screen
├── generate.js             # Project generation screen
├── validation.js           # Validation logic (pure functions)
├── odoo-creator.js         # Odoo API orchestration
└── styles.css              # Minimal additional styles (if needed)
```

**No `services/` folder. No `models/` folder. No `utils/` folder beyond validation.**

---

## Database Layer

### Migration File

**File: `supabase/migrations/20260128_project_generator.sql`**

```sql
-- Project Templates Table
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX idx_project_templates_user_id ON project_templates(user_id);

-- RLS Policies
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON project_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON project_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON project_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON project_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Updated trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**No additional tables. No version history table. No audit table in V1.**

---

### Database Access (Use Existing Pattern)

**File: `src/modules/project-generator/library.js`**

```javascript
import { supabase } from '../../lib/database.js';

// List all templates for current user
export async function listTemplates() {
  const { data, error } = await supabase
    .from('project_templates')
    .select('id, name, description, created_at')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

// Get single template with blueprint data
export async function getTemplate(id) {
  const { data, error } = await supabase
    .from('project_templates')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

// Create template
export async function createTemplate(name, description, blueprintData) {
  const { data, error } = await supabase
    .from('project_templates')
    .insert({
      name,
      description,
      blueprint_data: blueprintData
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Update template
export async function updateTemplate(id, name, description, blueprintData) {
  const { data, error } = await supabase
    .from('project_templates')
    .update({
      name,
      description,
      blueprint_data: blueprintData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Delete template
export async function deleteTemplate(id) {
  const { error } = await supabase
    .from('project_templates')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}
```

**Uses existing `supabase` import. No new database wrapper.**

---

## Validation Logic

**File: `src/modules/project-generator/validation.js`**

```javascript
// Pure validation functions

export function validateBlueprint(blueprint) {
  const errors = [];
  const warnings = [];

  // Check stages
  if (!blueprint.stages || blueprint.stages.length === 0) {
    warnings.push('No stages defined');
  }

  const stageNames = new Set();
  blueprint.stages?.forEach((stage, index) => {
    if (!stage.name || stage.name.trim() === '') {
      errors.push(`Stage ${index + 1} has no name`);
    }
    if (stageNames.has(stage.name)) {
      errors.push(`Duplicate stage name: "${stage.name}"`);
    }
    stageNames.add(stage.name);
  });

  // Check milestones
  if (!blueprint.milestones || blueprint.milestones.length === 0) {
    warnings.push('No milestones defined');
  }

  const milestoneNames = new Set();
  blueprint.milestones?.forEach((milestone, index) => {
    if (!milestone.name || milestone.name.trim() === '') {
      errors.push(`Milestone ${index + 1} has no name`);
    }
    if (milestoneNames.has(milestone.name)) {
      errors.push(`Duplicate milestone name: "${milestone.name}"`);
    }
    milestoneNames.add(milestone.name);
  });

  // Check tasks
  const taskIds = new Set(blueprint.tasks?.map(t => t.id) || []);
  blueprint.tasks?.forEach((task, index) => {
    if (!task.name || task.name.trim() === '') {
      errors.push(`Task ${index + 1} has no name`);
    }
    if (!task.milestone_id) {
      warnings.push(`Task "${task.name}" has no milestone`);
    }
  });

  // Check dependencies for circular references
  const circularDep = detectCircularDependencies(
    blueprint.tasks || [],
    blueprint.dependencies || []
  );
  if (circularDep) {
    errors.push(`Circular dependency detected: ${circularDep}`);
  }

  // Check for invalid dependency references
  blueprint.dependencies?.forEach(dep => {
    if (!taskIds.has(dep.task_id)) {
      errors.push(`Invalid dependency: task ${dep.task_id} not found`);
    }
    if (!taskIds.has(dep.depends_on_id)) {
      errors.push(`Invalid dependency: task ${dep.depends_on_id} not found`);
    }
  });

  // Check for isolated tasks
  const isolatedTasks = findIsolatedTasks(
    blueprint.tasks || [],
    blueprint.dependencies || []
  );
  if (isolatedTasks.length > 0) {
    warnings.push(`${isolatedTasks.length} task(s) have no dependencies`);
  }

  return { errors, warnings };
}

function detectCircularDependencies(tasks, dependencies) {
  // Build adjacency list
  const graph = new Map();
  tasks.forEach(task => {
    graph.set(task.id, []);
  });
  dependencies.forEach(dep => {
    if (graph.has(dep.task_id)) {
      graph.get(dep.task_id).push(dep.depends_on_id);
    }
  });

  // DFS cycle detection
  const visited = new Set();
  const recursionStack = new Set();

  function hasCycle(taskId, path = []) {
    if (recursionStack.has(taskId)) {
      // Found cycle
      const cycleStart = path.indexOf(taskId);
      const cycle = path.slice(cycleStart).concat(taskId);
      const taskNames = cycle.map(id =>
        tasks.find(t => t.id === id)?.name || id
      );
      return taskNames.join(' → ');
    }
    if (visited.has(taskId)) {
      return null;
    }

    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const neighbors = graph.get(taskId) || [];
    for (const neighbor of neighbors) {
      const result = hasCycle(neighbor, [...path]);
      if (result) return result;
    }

    recursionStack.delete(taskId);
    return null;
  }

  for (const taskId of graph.keys()) {
    const result = hasCycle(taskId);
    if (result) return result;
  }

  return null;
}

function findIsolatedTasks(tasks, dependencies) {
  const connected = new Set();
  dependencies.forEach(dep => {
    connected.add(dep.task_id);
    connected.add(dep.depends_on_id);
  });

  return tasks
    .filter(task => !connected.has(task.id))
    .map(task => task.name);
}
```

**No validation framework. No schema library. Pure functions only.**

---

## Odoo API Integration

### Use Existing `odoo.js` Exclusively

**File: `src/modules/project-generator/odoo-creator.js`**

```javascript
import { executeKw } from '../../lib/odoo.js';

/**
 * Generates Odoo project from blueprint
 * Returns { success: boolean, projectId?: number, error?: string }
 */
export async function generateProject(projectName, blueprint) {
  try {
    // Step 1: Create project
    const projectId = await createProject(projectName);

    // Step 2: Create stages
    const stageMap = await createStages(projectId, blueprint.stages);

    // Step 3: Create milestones
    const milestoneMap = await createMilestones(projectId, blueprint.milestones);

    // Step 4: Create tasks (pass 1 - without dependencies)
    const taskMap = await createTasks(projectId, blueprint.tasks, milestoneMap);

    // Step 5: Set task dependencies (pass 2)
    await setDependencies(taskMap, blueprint.dependencies);

    return { success: true, projectId };
  } catch (error) {
    console.error('Project generation failed:', error);
    return { success: false, error: error.message };
  }
}

async function createProject(name) {
  const [projectId] = await executeKw(
    'project.project',
    'create',
    [{
      name: name
    }]
  );
  return projectId;
}

async function createStages(projectId, stages) {
  const stageMap = new Map();
  
  for (const stage of stages) {
    const [stageId] = await executeKw(
      'project.task.type',
      'create',
      [{
        name: stage.name,
        project_ids: [[6, 0, [projectId]]],
        sequence: stage.sequence
      }]
    );
    stageMap.set(stage.id, stageId);
  }
  
  return stageMap;
}

async function createMilestones(projectId, milestones) {
  const milestoneMap = new Map();
  
  for (const milestone of milestones) {
    const [milestoneId] = await executeKw(
      'project.milestone',
      'create',
      [{
        name: milestone.name,
        project_id: projectId
      }]
    );
    milestoneMap.set(milestone.id, milestoneId);
  }
  
  return milestoneMap;
}

async function createTasks(projectId, tasks, milestoneMap) {
  const taskMap = new Map();
  
  for (const task of tasks) {
    const taskData = {
      name: task.name,
      project_id: projectId
    };
    
    if (task.milestone_id && milestoneMap.has(task.milestone_id)) {
      taskData.milestone_id = milestoneMap.get(task.milestone_id);
    }
    
    const [taskId] = await executeKw(
      'project.task',
      'create',
      [taskData]
    );
    taskMap.set(task.id, taskId);
  }
  
  return taskMap;
}

async function setDependencies(taskMap, dependencies) {
  for (const dep of dependencies) {
    const taskId = taskMap.get(dep.task_id);
    const dependsOnId = taskMap.get(dep.depends_on_id);
    
    if (!taskId || !dependsOnId) continue;
    
    // Set dependency using Odoo's depend_on_ids field
    await executeKw(
      'project.task',
      'write',
      [
        [taskId],
        {
          depend_on_ids: [[4, dependsOnId]] // Add to many2many
        }
      ]
    );
  }
}
```

**Key Points:**
- Uses only `executeKw` from existing `odoo.js`
- Sequential API calls (not parallel - simpler, more reliable)
- No error rollback in V1 (keep it simple)
- Returns simple success/error object
- No logging, no audit trail in V1

---

## UI Components

### Screen 1: Template Library

**File: `src/modules/project-generator/library.js` (UI portion)**

```javascript
import { html } from '../../lib/utils.js';
import { listTemplates, deleteTemplate } from './data.js';

export async function renderTemplateLibrary() {
  const templates = await listTemplates();

  return html`
    <div class="container mx-auto p-4">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">Project Templates</h1>
        <a href="/project-generator/edit" class="btn btn-primary">
          New Template
        </a>
      </div>

      ${templates.length === 0 ? html`
        <div class="alert alert-info">
          <span>No templates yet. Create your first template to get started.</span>
        </div>
      ` : html`
        <table class="table table-zebra w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${templates.map(template => html`
              <tr>
                <td>${template.name}</td>
                <td>${new Date(template.created_at).toLocaleDateString()}</td>
                <td>
                  <a href="/project-generator/edit/${template.id}" class="btn btn-sm btn-ghost">
                    Edit
                  </a>
                  <button
                    class="btn btn-sm btn-ghost text-error"
                    onclick="deleteTemplateConfirm('${template.id}', '${template.name}')"
                  >
                    Delete
                  </button>
                  <a href="/project-generator/generate/${template.id}" class="btn btn-sm btn-primary">
                    Generate
                  </a>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
    </div>
  `;
}

window.deleteTemplateConfirm = async function(id, name) {
  if (!confirm(`Delete template "${name}"?`)) return;
  
  try {
    await deleteTemplate(id);
    window.location.reload();
  } catch (error) {
    alert('Failed to delete template: ' + error.message);
  }
};
```

**DaisyUI components used:**
- `btn`, `btn-primary`, `btn-sm`, `btn-ghost`
- `table`, `table-zebra`
- `alert`, `alert-info`
- `container`, `mx-auto`, `p-4` (Tailwind utilities)

**No custom components. No state management library.**

---

### Screen 2: Blueprint Editor

**File: `src/modules/project-generator/editor.js`**

```javascript
import { html } from '../../lib/utils.js';
import { getTemplate, createTemplate, updateTemplate } from './data.js';
import { validateBlueprint } from './validation.js';

let currentBlueprint = {
  stages: [],
  milestones: [],
  tasks: [],
  dependencies: []
};

let templateId = null;
let templateName = '';
let templateDescription = '';

export async function renderBlueprintEditor(id) {
  if (id) {
    // Load existing template
    const template = await getTemplate(id);
    templateId = id;
    templateName = template.name;
    templateDescription = template.description || '';
    currentBlueprint = template.blueprint_data;
  } else {
    // New template
    templateId = null;
    templateName = '';
    templateDescription = '';
    currentBlueprint = {
      stages: [],
      milestones: [],
      tasks: [],
      dependencies: []
    };
  }

  return renderEditor();
}

function renderEditor() {
  const validation = validateBlueprint(currentBlueprint);

  return html`
    <div class="container mx-auto p-4">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">
          ${templateId ? 'Edit Template' : 'New Template'}
        </h1>
        <div class="space-x-2">
          <button onclick="validateOnly()" class="btn btn-ghost">
            Validate
          </button>
          <button onclick="saveTemplate()" class="btn btn-primary">
            Save
          </button>
          <a href="/project-generator" class="btn btn-ghost">
            Cancel
          </a>
        </div>
      </div>

      ${validation.errors.length > 0 ? html`
        <div class="alert alert-error mb-4">
          <h3 class="font-bold">Errors (must fix before saving):</h3>
          <ul class="list-disc list-inside">
            ${validation.errors.map(err => html`<li>${err}</li>`)}
          </ul>
        </div>
      ` : ''}

      ${validation.warnings.length > 0 ? html`
        <div class="alert alert-warning mb-4">
          <h3 class="font-bold">Warnings:</h3>
          <ul class="list-disc list-inside">
            ${validation.warnings.map(warn => html`<li>${warn}</li>`)}
          </ul>
        </div>
      ` : ''}

      <div class="grid grid-cols-3 gap-4">
        ${renderStagesColumn()}
        ${renderMilestonesColumn()}
        ${renderTasksColumn()}
      </div>
    </div>
  `;
}

function renderStagesColumn() {
  return html`
    <div class="card bg-base-200">
      <div class="card-body">
        <h2 class="card-title">Stages</h2>
        ${currentBlueprint.stages.map((stage, index) => html`
          <div class="flex gap-2 items-center mb-2">
            <input
              type="text"
              value="${stage.name}"
              onchange="updateStageName(${index}, this.value)"
              class="input input-sm input-bordered flex-1"
              placeholder="Stage name"
            />
            <button onclick="removeStage(${index})" class="btn btn-sm btn-ghost btn-circle">
              ✕
            </button>
          </div>
        `)}
        <button onclick="addStage()" class="btn btn-sm btn-primary mt-2">
          Add Stage
        </button>
      </div>
    </div>
  `;
}

function renderMilestonesColumn() {
  return html`
    <div class="card bg-base-200">
      <div class="card-body">
        <h2 class="card-title">Milestones</h2>
        ${currentBlueprint.milestones.map((milestone, index) => html`
          <div class="mb-4 p-2 border border-base-300 rounded">
            <div class="flex gap-2 items-center mb-2">
              <input
                type="text"
                value="${milestone.name}"
                onchange="updateMilestoneName(${index}, this.value)"
                class="input input-sm input-bordered flex-1"
                placeholder="Milestone name"
              />
              <button onclick="removeMilestone(${index})" class="btn btn-sm btn-ghost btn-circle">
                ✕
              </button>
            </div>
            <textarea
              onchange="updateMilestoneDescription(${index}, this.value)"
              class="textarea textarea-sm textarea-bordered w-full"
              placeholder="Description (optional)"
            >${milestone.description || ''}</textarea>
          </div>
        `)}
        <button onclick="addMilestone()" class="btn btn-sm btn-primary mt-2">
          Add Milestone
        </button>
      </div>
    </div>
  `;
}

function renderTasksColumn() {
  return html`
    <div class="card bg-base-200">
      <div class="card-body">
        <h2 class="card-title">Tasks</h2>
        ${currentBlueprint.tasks.map((task, index) => html`
          <div class="mb-4 p-2 border border-base-300 rounded">
            <div class="flex gap-2 items-center mb-2">
              <input
                type="text"
                value="${task.name}"
                onchange="updateTaskName(${index}, this.value)"
                class="input input-sm input-bordered flex-1"
                placeholder="Task name"
              />
              <button onclick="removeTask(${index})" class="btn btn-sm btn-ghost btn-circle">
                ✕
              </button>
            </div>
            <select
              onchange="updateTaskMilestone(${index}, this.value)"
              class="select select-sm select-bordered w-full mb-2"
            >
              <option value="">No milestone</option>
              ${currentBlueprint.milestones.map(milestone => html`
                <option
                  value="${milestone.id}"
                  ${task.milestone_id === milestone.id ? 'selected' : ''}
                >
                  ${milestone.name}
                </option>
              `)}
            </select>
            <div class="text-xs">
              <div class="font-bold mb-1">Dependencies:</div>
              ${getDependenciesForTask(task.id).map(depId => {
                const depTask = currentBlueprint.tasks.find(t => t.id === depId);
                return html`
                  <div class="flex gap-2 items-center mb-1">
                    <span class="flex-1">${depTask?.name || 'Unknown'}</span>
                    <button
                      onclick="removeDependency('${task.id}', '${depId}')"
                      class="btn btn-xs btn-ghost"
                    >
                      ✕
                    </button>
                  </div>
                `;
              })}
              <button onclick="addDependency('${task.id}')" class="btn btn-xs btn-ghost mt-1">
                + Add Dependency
              </button>
            </div>
          </div>
        `)}
        <button onclick="addTask()" class="btn btn-sm btn-primary mt-2">
          Add Task
        </button>
      </div>
    </div>
  `;
}

// Event handlers (window scope for onclick)
window.addStage = function() {
  currentBlueprint.stages.push({
    id: `stage_${Date.now()}`,
    name: '',
    sequence: currentBlueprint.stages.length + 1
  });
  refreshEditor();
};

window.updateStageName = function(index, name) {
  currentBlueprint.stages[index].name = name;
};

window.removeStage = function(index) {
  currentBlueprint.stages.splice(index, 1);
  // Resequence
  currentBlueprint.stages.forEach((stage, i) => {
    stage.sequence = i + 1;
  });
  refreshEditor();
};

window.addMilestone = function() {
  currentBlueprint.milestones.push({
    id: `milestone_${Date.now()}`,
    name: '',
    description: ''
  });
  refreshEditor();
};

window.updateMilestoneName = function(index, name) {
  currentBlueprint.milestones[index].name = name;
};

window.updateMilestoneDescription = function(index, description) {
  currentBlueprint.milestones[index].description = description;
};

window.removeMilestone = function(index) {
  const milestoneId = currentBlueprint.milestones[index].id;
  // Remove milestone
  currentBlueprint.milestones.splice(index, 1);
  // Clear milestone references from tasks
  currentBlueprint.tasks.forEach(task => {
    if (task.milestone_id === milestoneId) {
      task.milestone_id = null;
    }
  });
  refreshEditor();
};

window.addTask = function() {
  currentBlueprint.tasks.push({
    id: `task_${Date.now()}`,
    name: '',
    milestone_id: null
  });
  refreshEditor();
};

window.updateTaskName = function(index, name) {
  currentBlueprint.tasks[index].name = name;
};

window.updateTaskMilestone = function(index, milestoneId) {
  currentBlueprint.tasks[index].milestone_id = milestoneId || null;
};

window.removeTask = function(index) {
  const taskId = currentBlueprint.tasks[index].id;
  // Remove task
  currentBlueprint.tasks.splice(index, 1);
  // Remove dependencies
  currentBlueprint.dependencies = currentBlueprint.dependencies.filter(
    dep => dep.task_id !== taskId && dep.depends_on_id !== taskId
  );
  refreshEditor();
};

window.addDependency = function(taskId) {
  const otherTasks = currentBlueprint.tasks.filter(t => t.id !== taskId);
  if (otherTasks.length === 0) {
    alert('No other tasks available for dependency');
    return;
  }

  const taskNames = otherTasks.map(t => t.name || 'Unnamed').join('\n');
  const selectedName = prompt(`Select task (enter name):\n${taskNames}`);
  if (!selectedName) return;

  const selectedTask = otherTasks.find(t => t.name === selectedName);
  if (!selectedTask) {
    alert('Task not found');
    return;
  }

  currentBlueprint.dependencies.push({
    task_id: taskId,
    depends_on_id: selectedTask.id
  });
  refreshEditor();
};

window.removeDependency = function(taskId, dependsOnId) {
  currentBlueprint.dependencies = currentBlueprint.dependencies.filter(
    dep => !(dep.task_id === taskId && dep.depends_on_id === dependsOnId)
  );
  refreshEditor();
};

window.validateOnly = function() {
  refreshEditor();
};

window.saveTemplate = async function() {
  const validation = validateBlueprint(currentBlueprint);
  
  if (validation.errors.length > 0) {
    alert('Cannot save: please fix errors first');
    return;
  }

  if (!templateName || templateName.trim() === '') {
    const name = prompt('Enter template name:');
    if (!name) return;
    templateName = name;
  }

  try {
    if (templateId) {
      await updateTemplate(templateId, templateName, templateDescription, currentBlueprint);
    } else {
      await createTemplate(templateName, templateDescription, currentBlueprint);
    }
    window.location.href = '/project-generator';
  } catch (error) {
    alert('Failed to save template: ' + error.message);
  }
};

function getDependenciesForTask(taskId) {
  return currentBlueprint.dependencies
    .filter(dep => dep.task_id === taskId)
    .map(dep => dep.depends_on_id);
}

function refreshEditor() {
  // Re-render entire editor
  const container = document.querySelector('#app');
  container.innerHTML = renderEditor();
}
```

**Key Points:**
- Uses inline DaisyUI components only
- State in module-scoped variables (no Redux, no Zustand)
- Event handlers attached via `window` scope (simple onclick)
- Manual re-render with `refreshEditor()`
- Prompt for dependency selection (simple, no modal in V1)

**NOT IN V1:**
- ❌ Drag-and-drop
- ❌ Visual dependency graph
- ❌ Fancy modals
- ❌ Auto-save
- ❌ Undo/redo

---

### Screen 3: Project Generation

**File: `src/modules/project-generator/generate.js`**

```javascript
import { html } from '../../lib/utils.js';
import { getTemplate } from './data.js';
import { generateProject } from './odoo-creator.js';

let template = null;
let projectName = '';
let generating = false;
let result = null;

export async function renderProjectGeneration(id) {
  template = await getTemplate(id);
  projectName = '';
  generating = false;
  result = null;
  
  return renderGenerate();
}

function renderGenerate() {
  if (result) {
    return html`
      <div class="container mx-auto p-4">
        <div class="max-w-md mx-auto">
          ${result.success ? html`
            <div class="alert alert-success mb-4">
              <h3 class="font-bold">Project Created Successfully!</h3>
              <p>Odoo project "${projectName}" has been created.</p>
            </div>
            <div class="flex gap-2">
              <a href="/project-generator" class="btn btn-primary flex-1">
                Back to Templates
              </a>
              <button onclick="generateAnother()" class="btn btn-ghost flex-1">
                Generate Another
              </button>
            </div>
          ` : html`
            <div class="alert alert-error mb-4">
              <h3 class="font-bold">Generation Failed</h3>
              <p>${result.error}</p>
            </div>
            <div class="flex gap-2">
              <button onclick="retryGeneration()" class="btn btn-primary flex-1">
                Try Again
              </button>
              <a href="/project-generator" class="btn btn-ghost flex-1">
                Cancel
              </a>
            </div>
          `}
        </div>
      </div>
    `;
  }

  return html`
    <div class="container mx-auto p-4">
      <div class="max-w-md mx-auto">
        <h1 class="text-3xl font-bold mb-6">Generate Project</h1>
        
        <div class="mb-4">
          <label class="label">
            <span class="label-text font-bold">Template:</span>
          </label>
          <div class="p-2 bg-base-200 rounded">
            ${template.name}
          </div>
        </div>

        <div class="form-control mb-6">
          <label class="label">
            <span class="label-text font-bold">Project Name:</span>
          </label>
          <input
            type="text"
            value="${projectName}"
            onchange="updateProjectName(this.value)"
            class="input input-bordered"
            placeholder="Enter project name"
            ${generating ? 'disabled' : ''}
          />
        </div>

        <div class="flex gap-2">
          <button
            onclick="startGeneration()"
            class="btn btn-primary flex-1"
            ${generating || !projectName ? 'disabled' : ''}
          >
            ${generating ? html`
              <span class="loading loading-spinner"></span>
              Generating...
            ` : 'Create Project'}
          </button>
          <a
            href="/project-generator"
            class="btn btn-ghost flex-1"
            ${generating ? 'disabled' : ''}
          >
            Cancel
          </a>
        </div>
      </div>
    </div>
  `;
}

window.updateProjectName = function(name) {
  projectName = name;
  refreshGenerate();
};

window.startGeneration = async function() {
  if (!projectName || projectName.trim() === '') {
    alert('Please enter a project name');
    return;
  }

  generating = true;
  refreshGenerate();

  const generationResult = await generateProject(
    projectName,
    template.blueprint_data
  );

  generating = false;
  result = generationResult;
  refreshGenerate();
};

window.generateAnother = function() {
  result = null;
  projectName = '';
  refreshGenerate();
};

window.retryGeneration = function() {
  result = null;
  refreshGenerate();
};

function refreshGenerate() {
  const container = document.querySelector('#app');
  container.innerHTML = renderGenerate();
}
```

**Features:**
- Simple form with one input
- Loading state with spinner
- Success/error states
- No progress bar (API calls happen in background)
- No confetti animation

---

## Deployment Checklist

### Database
1. Run migration: `supabase/migrations/20260128_project_generator.sql`
2. Verify RLS policies active
3. Test SELECT/INSERT/UPDATE/DELETE with authenticated user

### Module
1. Create `src/modules/project-generator/` folder
2. Copy all files:
   - `module.js`
   - `library.js` (data + UI)
   - `editor.js`
   - `generate.js`
   - `validation.js`
   - `odoo-creator.js`
3. Register in `src/modules/registry.js`

### Testing
1. Login as user
2. Create template with 2 stages, 1 milestone, 2 tasks, 1 dependency
3. Save template
4. Generate project
5. Verify in Odoo:
   - Project exists
   - Stages exist
   - Milestone exists
   - Tasks exist
   - Dependency set correctly

### What NOT to Deploy
- ❌ No separate service files
- ❌ No new database helper libraries
- ❌ No new Odoo client
- ❌ No custom validation framework
- ❌ No analytics tracking
- ❌ No audit logging
- ❌ No versioning tables

---

## Performance Targets

- Template list load: <1s
- Blueprint editor initial render: <500ms
- Validation run: <200ms
- Template save: <1s
- Project generation (50 tasks): <10s

**No optimization in V1 beyond basic sequential API calls.**

---

## Error Handling

### Database Errors
- Supabase error → Show error message to user
- No retry logic in V1

### Odoo Errors
- API call fails → Show error message
- No rollback attempt in V1
- Partial creates may occur

### Validation Errors
- Errors shown in red alert
- Warnings shown in yellow alert
- Save button disabled if errors present

**No sophisticated error recovery in V1.**

---

## Explicitly NOT Implemented

### Technical Elements
- ❌ Service layer abstraction
- ❌ Repository pattern
- ❌ Dependency injection
- ❌ State management library (Redux/Zustand)
- ❌ Custom event system
- ❌ WebSocket connections
- ❌ Background workers
- ❌ Queue system
- ❌ Caching layer
- ❌ GraphQL endpoints
- ❌ API versioning

### Features
- ❌ Undo/redo
- ❌ Auto-save
- ❌ Conflict resolution
- ❌ Version control
- ❌ Audit logging
- ❌ Analytics tracking
- ❌ Usage metrics
- ❌ Performance monitoring
- ❌ Error reporting service (Sentry)
- ❌ Rollback on failed generation

### UX Elements
- ❌ Drag-and-drop
- ❌ Keyboard shortcuts
- ❌ Context menus
- ❌ Tooltips
- ❌ Loading skeletons
- ❌ Animations
- ❌ Confetti
- ❌ Toast notifications
- ❌ Modal dialogs (using prompt/confirm)

---

## Summary

This technical specification defines a **minimal, functional** Project Generator V1 that:

1. Integrates into existing app architecture (no new patterns)
2. Uses existing libraries exclusively (odoo.js, database.js, DaisyUI)
3. Implements only essential features (create/edit/delete template, generate project)
4. Has zero dependencies beyond what already exists
5. Can be built in **days**, not weeks

**This is the source of truth for V1 implementation.**
