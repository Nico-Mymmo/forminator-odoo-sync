/**
 * Sales Insight Explorer - Query Builder UI
 * 
 * Schema-driven query builder interface.
 * Follows existing module conventions (daisyUI + Tailwind only).
 * 
 * RULES:
 * - No hardcoded models or fields
 * - No interpretation or analysis
 * - UI only assembles QueryDefinition JSON
 * - Backend validation is mandatory
 */

import { navbar } from '../../lib/components/navbar.js';

export function queryBuilderUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Builder - Sales Insight Explorer</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-7xl">
        
        <!-- Header -->
        <div class="flex justify-between items-center mb-6">
          <div>
            <h1 class="text-3xl font-bold">Query Builder</h1>
            <p class="text-base-content/60 mt-1">Build schema-driven queries for Odoo data export</p>
          </div>
          <div class="flex gap-2">
            <button onclick="loadSavedQueries()" class="btn btn-ghost btn-sm">
              <i data-lucide="folder-open" class="w-4 h-4"></i>
              Load Saved
            </button>
            <button onclick="loadPresets()" class="btn btn-ghost btn-sm">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
              Presets
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div id="loadingState" class="flex justify-center items-center py-20">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4 text-lg">Loading schema...</span>
        </div>

        <!-- Main Content (hidden until schema loads) -->
        <div id="mainContent" style="display: none;">
          
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <!-- Left Column: Query Builder -->
            <div class="lg:col-span-2 space-y-4">
              
              <!-- Step 1: Model Selection -->
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title">
                    <span class="badge badge-primary">1</span>
                    Select Base Model
                  </h2>
                  <div class="form-control">
                    <select id="baseModelSelect" class="select select-bordered" onchange="onModelSelect()">
                      <option value="">Choose a model...</option>
                    </select>
                  </div>
                  <div id="modelInfo" class="alert alert-info mt-2" style="display: none;">
                    <i data-lucide="info" class="w-4 h-4"></i>
                    <div>
                      <div class="font-bold" id="modelName"></div>
                      <div class="text-sm" id="modelCapabilities"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Step 2: Field Selection -->
              <div id="fieldSelectionCard" class="card bg-base-100 shadow-xl" style="display: none;">
                <div class="card-body">
                  <h2 class="card-title">
                    <span class="badge badge-primary">2</span>
                    Select Fields
                  </h2>
                  <div class="form-control">
                    <input type="text" id="fieldSearch" placeholder="Search fields..." class="input input-bordered input-sm mb-2" oninput="filterFields()">
                  </div>
                  <div id="fieldList" class="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                    <!-- Fields populated dynamically -->
                  </div>
                  <div class="mt-2">
                    <span class="text-sm text-base-content/60">Selected: <span id="selectedFieldCount" class="font-bold">0</span></span>
                  </div>
                </div>
              </div>

              <!-- Step 3: Filters (Optional) -->
              <div id="filterCard" class="card bg-base-100 shadow-xl" style="display: none;">
                <div class="card-body">
                  <div class="flex justify-between items-center">
                    <h2 class="card-title">
                      <span class="badge">3</span>
                      Filters (Optional)
                    </h2>
                    <button onclick="addFilter()" class="btn btn-sm btn-ghost">
                      <i data-lucide="plus" class="w-4 h-4"></i>
                      Add Filter
                    </button>
                  </div>
                  <div id="filterList" class="space-y-2">
                    <!-- Filters populated dynamically -->
                  </div>
                </div>
              </div>

              <!-- Step 4: Aggregations (Optional) -->
              <div id="aggregationCard" class="card bg-base-100 shadow-xl" style="display: none;">
                <div class="card-body">
                  <div class="flex justify-between items-center">
                    <h2 class="card-title">
                      <span class="badge">4</span>
                      Aggregations (Optional)
                    </h2>
                    <button onclick="toggleAggregationMode()" class="btn btn-sm btn-ghost">
                      <i data-lucide="function-square" class="w-4 h-4"></i>
                      <span id="aggregationModeText">Enable</span>
                    </button>
                  </div>
                  <div id="aggregationContent" style="display: none;">
                    <div class="alert alert-warning mb-2">
                      <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                      <span class="text-sm">Aggregation mode: selected fields will be used for GROUP BY</span>
                    </div>
                    <button onclick="addAggregation()" class="btn btn-sm btn-outline w-full">
                      <i data-lucide="plus" class="w-4 h-4"></i>
                      Add Aggregation
                    </button>
                    <div id="aggregationList" class="space-y-2 mt-2">
                      <!-- Aggregations populated dynamically -->
                    </div>
                  </div>
                </div>
              </div>

              <!-- Step 5: Relations (Advanced) -->
              <div id="relationCard" class="card bg-base-100 shadow-xl" style="display: none;">
                <div class="card-body">
                  <div class="collapse collapse-arrow bg-base-200">
                    <input type="checkbox" /> 
                    <div class="collapse-title font-medium">
                      <span class="badge">5</span>
                      Advanced: Relations
                    </div>
                    <div class="collapse-content">
                      <div class="alert alert-info mb-2">
                        <i data-lucide="info" class="w-4 h-4"></i>
                        <span class="text-sm">Traverse related models (e.g., lead → partner)</span>
                      </div>
                      <button onclick="addRelation()" class="btn btn-sm btn-outline w-full">
                        <i data-lucide="git-branch" class="w-4 h-4"></i>
                        Add Relation
                      </button>
                      <div id="relationList" class="space-y-2 mt-2">
                        <!-- Relations populated dynamically -->
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <!-- Right Column: Actions & Preview -->
            <div class="space-y-4">
              
              <!-- Actions Panel -->
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title text-sm">Actions</h2>
                  
                  <button onclick="validateQuery()" class="btn btn-outline btn-sm w-full">
                    <i data-lucide="check-circle" class="w-4 h-4"></i>
                    Validate
                  </button>
                  
                  <button onclick="saveQuery()" class="btn btn-primary btn-sm w-full" disabled id="saveBtn">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    Save Query
                  </button>
                  
                  <div class="divider my-2"></div>
                  
                  <button onclick="runQuery(false)" class="btn btn-success btn-sm w-full" disabled id="runBtn">
                    <i data-lucide="play" class="w-4 h-4"></i>
                    Run Query
                  </button>
                  
                  <button onclick="runQuery(true)" class="btn btn-ghost btn-sm w-full" disabled id="previewBtn">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                    Preview (10 records)
                  </button>
                  
                  <div class="divider my-2"></div>
                  
                  <div class="text-sm text-base-content/60 mb-1">Export Results</div>
                  <button onclick="exportQuery('json')" class="btn btn-outline btn-sm w-full" disabled id="exportJsonBtn">
                    <i data-lucide="file-json" class="w-4 h-4"></i>
                    Export JSON
                  </button>
                  
                  <button onclick="exportQuery('csv')" class="btn btn-outline btn-sm w-full" disabled id="exportCsvBtn">
                    <i data-lucide="file-text" class="w-4 h-4"></i>
                    Export CSV
                  </button>
                </div>
              </div>

              <!-- Query Preview -->
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <div class="flex justify-between items-center">
                    <h2 class="card-title text-sm">Query Definition</h2>
                    <button onclick="copyQuery()" class="btn btn-ghost btn-xs">
                      <i data-lucide="copy" class="w-3 h-3"></i>
                    </button>
                  </div>
                  <textarea id="queryPreview" class="textarea textarea-bordered font-mono text-xs h-64" readonly></textarea>
                </div>
              </div>

              <!-- Status Messages -->
              <div id="statusArea"></div>

            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- Saved Queries Modal -->
    <dialog id="savedQueriesModal" class="modal">
      <div class="modal-box w-11/12 max-w-3xl">
        <h3 class="font-bold text-lg mb-4">Saved Queries</h3>
        <div id="savedQueriesList" class="space-y-2 max-h-96 overflow-y-auto">
          <!-- Populated dynamically -->
        </div>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>

    <!-- Presets Modal -->
    <dialog id="presetsModal" class="modal">
      <div class="modal-box w-11/12 max-w-3xl">
        <h3 class="font-bold text-lg mb-4">Query Presets</h3>
        <div id="presetsList" class="space-y-2 max-h-96 overflow-y-auto">
          <!-- Populated dynamically -->
        </div>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>

    <!-- Results Modal -->
    <dialog id="resultsModal" class="modal">
      <div class="modal-box w-11/12 max-w-5xl">
        <h3 class="font-bold text-lg mb-4">Query Results</h3>
        <div id="resultsContent" class="overflow-x-auto">
          <!-- Populated dynamically -->
        </div>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>

    <script src="/insights/app.js"></script>
    <script>
      lucide.createIcons();
    </script>
</body>
</html>`;
}
