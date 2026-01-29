/**
 * Project Generator Module - UI
 * 
 * Server-side static HTML skeleton only.
 * ALL dynamic logic is in /project-generator-client.js
 */

import { navbar } from '../../lib/components/navbar.js';

export function templateLibraryUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Generator</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-6xl">
        
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
          <div>
            <h1 class="text-4xl font-bold mb-2">Project Generator</h1>
            <p class="text-base-content/60">Manage your project templates</p>
          </div>
          <button id="newTemplateBtn" class="btn btn-primary">
            <i data-lucide="plus" class="w-4 h-4 mr-2"></i>
            New Template
          </button>
        </div>

        <!-- Loading State -->
        <div id="loadingState" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Loading templates...</span>
        </div>

        <!-- Empty State -->
        <div id="emptyState" class="card bg-base-100 shadow-xl" style="display: none;">
          <div class="card-body items-center text-center py-16">
            <i data-lucide="folder-open" class="w-16 h-16 text-base-content/30 mb-4"></i>
            <h2 class="card-title text-2xl mb-2">No templates yet</h2>
            <p class="text-base-content/60 mb-6">Create your first template to get started</p>
            <button id="emptyStateCreateBtn" class="btn btn-primary">
              <i data-lucide="plus" class="w-4 h-4 mr-2"></i>
              Create Template
            </button>
          </div>
        </div>

        <!-- Templates Table -->
        <div id="templatesTable" class="card bg-base-100 shadow-xl" style="display: none;">
          <div class="card-body">
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Created</th>
                    <th>Updated</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody id="templatesTableBody">
                  <!-- Rows inserted by client.js -->
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Create/Edit Modal -->
    <dialog id="templateModal" class="modal">
      <div class="modal-box">
        <h3 id="modalTitle" class="font-bold text-lg mb-4">Create Template</h3>
        
        <form id="templateForm">
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Template Name <span class="text-error">*</span></span>
            </label>
            <input 
              type="text" 
              id="templateName" 
              name="name"
              placeholder="My Project Template" 
              class="input input-bordered" 
              required 
              maxlength="100"
            />
            <label class="label">
              <span class="label-text-alt text-error" id="nameError" style="display: none;"></span>
            </label>
          </div>
          
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Description</span>
            </label>
            <textarea 
              id="templateDescription" 
              name="description"
              placeholder="Optional description of your template" 
              class="textarea textarea-bordered h-24" 
              maxlength="500"
            ></textarea>
          </div>
          
          <div class="modal-action">
            <button type="button" id="cancelBtn" class="btn">Cancel</button>
            <button type="submit" id="submitBtn" class="btn btn-primary">
              <span id="submitBtnText">Create Template</span>
              <span id="submitBtnSpinner" class="loading loading-spinner loading-sm" style="display: none;"></span>
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>

    <!-- Toast Container -->
    <div id="toastContainer" class="toast toast-top toast-end">
      <!-- Toasts inserted by client.js -->
    </div>

    <script src="/project-generator-client.js"></script>
</body>
</html>`;
}

/**
 * Blueprint Editor UI
 * 
 * Server-side static HTML skeleton for blueprint editor.
 * ALL dynamic logic is in /project-generator-client.js
 * 
 * @param {Object} user - User object
 * @param {string} templateId - Template UUID
 * @returns {string} HTML string
 */
export function blueprintEditorUI(user, templateId) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blueprint Editor</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-6xl">
        
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
          <div>
            <a href="/projects" class="btn btn-ghost btn-sm mb-2">
              <i data-lucide="arrow-left" class="w-4 h-4 mr-2"></i>
              Back to Templates
            </a>
            <h1 class="text-4xl font-bold mb-2">Blueprint Editor</h1>
            <p class="text-base-content/60" id="templateNameDisplay">Loading...</p>
          </div>
          <div class="flex gap-2">
            <button id="cancelBtn" class="btn btn-ghost">Cancel</button>
            <button id="saveBtn" class="btn btn-primary">
              <i data-lucide="save" class="w-4 h-4 mr-2"></i>
              Save Blueprint
            </button>
          </div>
        </div>

        <!-- Validation Messages -->
        <div id="validationErrors" class="alert alert-error mb-4" style="display: none;">
          <i data-lucide="alert-circle" class="w-5 h-5"></i>
          <div>
            <h3 class="font-bold">Errors (must fix before saving)</h3>
            <ul id="errorList" class="list-disc list-inside mt-2"></ul>
          </div>
        </div>

        <div id="validationWarnings" class="alert alert-warning mb-4" style="display: none;">
          <i data-lucide="alert-triangle" class="w-5 h-5"></i>
          <div>
            <h3 class="font-bold">Warnings</h3>
            <ul id="warningList" class="list-disc list-inside mt-2"></ul>
          </div>
        </div>

        <!-- Loading State -->
        <div id="loadingState" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Loading blueprint...</span>
        </div>

        <!-- Blueprint Sections -->
        <div id="blueprintContent" style="display: none;">
          
          <!-- Stages Section -->
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div class="flex justify-between items-center mb-4">
                <h2 class="card-title">
                  <i data-lucide="layers" class="w-5 h-5 mr-2"></i>
                  Task Stages
                </h2>
                <button id="addStageBtn" class="btn btn-sm btn-primary">
                  <i data-lucide="plus" class="w-4 h-4 mr-1"></i>
                  Add Stage
                </button>
              </div>
              <div id="stagesList" class="space-y-2">
                <!-- Stages inserted by client.js -->
              </div>
              <div id="emptyStages" class="text-center py-8 text-base-content/40" style="display: none;">
                No stages defined
              </div>
            </div>
          </div>

          <!-- Milestones Section -->
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div class="flex justify-between items-center mb-4">
                <h2 class="card-title">
                  <i data-lucide="flag" class="w-5 h-5 mr-2"></i>
                  Milestones
                </h2>
                <button id="addMilestoneBtn" class="btn btn-sm btn-primary">
                  <i data-lucide="plus" class="w-4 h-4 mr-1"></i>
                  Add Milestone
                </button>
              </div>
              <div id="milestonesList" class="space-y-2">
                <!-- Milestones inserted by client.js -->
              </div>
              <div id="emptyMilestones" class="text-center py-8 text-base-content/40" style="display: none;">
                No milestones defined
              </div>
            </div>
          </div>

          <!-- Tasks Section -->
          <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
              <div class="flex justify-between items-center mb-4">
                <h2 class="card-title">
                  <i data-lucide="check-square" class="w-5 h-5 mr-2"></i>
                  Tasks & Subtasks
                </h2>
                <button id="addTaskBtn" class="btn btn-sm btn-primary">
                  <i data-lucide="plus" class="w-4 h-4 mr-1"></i>
                  Add Task
                </button>
              </div>
              <div id="tasksList" class="space-y-2">
                <!-- Tasks inserted by client.js -->
              </div>
              <div id="emptyTasks" class="text-center py-8 text-base-content/40" style="display: none;">
                No tasks defined
              </div>
            </div>
          </div>

          <!-- Dependencies Section (Addendum E - now managed inline per task) -->
          <div class="alert alert-info mb-6">
            <i data-lucide="info" class="w-5 h-5"></i>
            <div>
              <h3 class="font-semibold">Dependencies are now managed per task</h3>
              <p class="text-sm">Click the dependency icon (<i data-lucide="git-branch" class="w-3 h-3 inline"></i>) next to any task to set up its dependencies.</p>
            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- Stage Modal -->
    <dialog id="stageModal" class="modal">
      <div class="modal-box">
        <h3 id="stageModalTitle" class="font-bold text-lg mb-4">Add Stage</h3>
        <form id="stageForm">
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Stage Name <span class="text-error">*</span></span>
            </label>
            <input 
              type="text" 
              id="stageName" 
              placeholder="To Do" 
              class="input input-bordered" 
              required 
              maxlength="50"
            />
          </div>
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Sequence <span class="text-error">*</span></span>
            </label>
            <input 
              type="number" 
              id="stageSequence" 
              placeholder="1" 
              class="input input-bordered" 
              required 
              min="1"
            />
          </div>
          <div class="modal-action">
            <button type="button" class="btn" onclick="stageModal.close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </dialog>

    <!-- Milestone Modal -->
    <dialog id="milestoneModal" class="modal">
      <div class="modal-box">
        <h3 id="milestoneModalTitle" class="font-bold text-lg mb-4">Add Milestone</h3>
        <form id="milestoneForm">
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Milestone Name <span class="text-error">*</span></span>
            </label>
            <input 
              type="text" 
              id="milestoneName" 
              placeholder="Phase 1" 
              class="input input-bordered" 
              required 
              maxlength="100"
            />
          </div>
          <div class="modal-action">
            <button type="button" class="btn" onclick="milestoneModal.close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </dialog>

    <!-- Task Modal -->
    <dialog id="taskModal" class="modal">
      <div class="modal-box">
        <h3 id="taskModalTitle" class="font-bold text-lg mb-4">Add Task</h3>
        <form id="taskForm">
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Task Name <span class="text-error">*</span></span>
            </label>
            <input 
              type="text" 
              id="taskName" 
              placeholder="Main Task" 
              class="input input-bordered" 
              required 
              maxlength="200"
            />
          </div>
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Milestone</span>
            </label>
            <select id="taskMilestone" class="select select-bordered">
              <option value="">No milestone</option>
              <!-- Options inserted by client.js -->
            </select>
          </div>
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Parent Task (for subtasks)</span>
            </label>
            <select id="taskParent" class="select select-bordered">
              <option value="">No parent (main task)</option>
              <!-- Options inserted by client.js -->
            </select>
          </div>
          <div class="modal-action">
            <button type="button" class="btn" onclick="taskModal.close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </dialog>

    <!-- Dependency Modal removed - now managed inline per task (Addendum E) -->

    <!-- Toast Container -->
    <div id="toastContainer" class="toast toast-top toast-end"></div>

    <!-- Store template ID for client.js -->
    <script>
      window.TEMPLATE_ID = '${templateId}';
    </script>
    <script src="/project-generator-client.js"></script>
</body>
</html>`;
}

/**
 * Generation History UI
 * 
 * Read-only view of all generation attempts for a template.
 * Static HTML shell only - dynamic logic in client.js
 */
export function generationHistoryUI(user, templateId, templateName) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generation History - ${templateName}</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-6xl">
        
        <!-- Header with Back Navigation -->
        <div class="mb-8">
          <a href="/projects" class="btn btn-ghost btn-sm mb-4">
            <i data-lucide="arrow-left" class="w-4 h-4 mr-2"></i>
            Back to Templates
          </a>
          <h1 class="text-4xl font-bold mb-2">Generation History</h1>
          <p class="text-base-content/60" id="templateNameDisplay">Loading...</p>
        </div>

        <!-- Loading State -->
        <div id="loadingState" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Loading generation history...</span>
        </div>

        <!-- Empty State -->
        <div id="emptyState" class="card bg-base-100 shadow-xl" style="display: none;">
          <div class="card-body items-center text-center py-16">
            <i data-lucide="history" class="w-16 h-16 text-base-content/30 mb-4"></i>
            <h2 class="card-title text-2xl mb-2">No generations yet</h2>
            <p class="text-base-content/60 mb-2">This template has not been generated to Odoo.</p>
            <p class="text-base-content/60 text-sm">Generation history will appear here after you click "Generate Project".</p>
          </div>
        </div>

        <!-- Generation History Table -->
        <div id="historyTable" class="card bg-base-100 shadow-xl" style="display: none;">
          <div class="card-body">
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody id="historyTableBody">
                  <!-- Rows inserted by client.js -->
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Help Text -->
        <div id="helpText" class="alert mt-6" style="display: none;">
          <i data-lucide="info" class="w-5 h-5"></i>
          <div>
            <h3 class="font-bold">About Generation History</h3>
            <p class="text-sm mt-1">This page shows all attempts to generate Odoo projects from this template. Failed generations may require manual cleanup in Odoo.</p>
          </div>
        </div>

      </div>
    </div>

    <!-- Toast Container -->
    <div id="toastContainer" class="toast toast-top toast-end"></div>

    <!-- Store template ID for client.js -->
    <script>
      window.TEMPLATE_ID = '${templateId}';
      window.TEMPLATE_NAME = '${templateName}';
      window.VIEW_MODE = 'generation-history';
    </script>
    <script src="/project-generator-client.js"></script>
</body>
</html>`;
}
