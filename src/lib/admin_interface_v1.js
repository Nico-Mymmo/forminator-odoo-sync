// Visual workflow editor with block-based interface
export const adminHTML = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forminator Mapping Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; height: 100vh; overflow: hidden; }
        
        /* Login */
        .login-screen { display: flex; align-items: center; justify-content: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .login-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        .login-box h1 { margin-bottom: 1.5rem; color: #333; text-align: center; }
        .login-box input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
        .login-box button { width: 100%; padding: 0.75rem; background: #667eea; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
        .login-box button:hover { background: #5568d3; }
        
        /* Main Layout */
        .admin-interface { display: none; height: 100vh; flex-direction: column; }
        .header { background: #2c3e50; color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; }
        .header button { background: #e74c3c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
        .main-content { display: flex; flex: 1; overflow: hidden; }
        
        /* Sidebar */
        .sidebar { width: 250px; background: white; border-right: 1px solid #ddd; overflow-y: auto; }
        .sidebar h2 { padding: 1rem; background: #ecf0f1; font-size: 1rem; border-bottom: 1px solid #ddd; }
        .form-list { list-style: none; }
        .form-list li { padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid #eee; }
        .form-list li:hover { background: #f8f9fa; }
        .form-list li.active { background: #667eea; color: white; }
        
        /* Editor */
        .editor { flex: 1; overflow-y: auto; padding: 2rem; }
        .editor h2 { margin-bottom: 1.5rem; color: #333; }
        .section { background: white; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section h3 { margin-bottom: 1rem; color: #555; font-size: 1.1rem; }
        
        /* Field Mapping */
        .field-mapping { display: grid; gap: 0.5rem; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.5rem; align-items: center; }
        .field-row input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
        .field-row button { background: #e74c3c; color: white; border: none; padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; }
        
        /* Workflow Steps */
        .workflow-step { background: #f8f9fa; border: 2px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
        .workflow-step.collapsed .step-content { display: none; }
        .workflow-step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; cursor: pointer; }
        .workflow-step-header h4 { color: #2c3e50; font-size: 1.1rem; }
        .workflow-step-header .step-actions { display: flex; gap: 0.5rem; }
        .workflow-step-header button { padding: 0.3rem 0.6rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
        
        .step-basics { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        .step-basics label { display: block; margin-bottom: 0.3rem; color: #555; font-weight: 500; }
        .step-basics input { width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
        
        /* Step Subsections */
        .step-subsection { background: white; border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
        .step-subsection h5 { color: #667eea; margin-bottom: 0.75rem; font-size: 1rem; }
        
        /* Domain & Value Rows */
        .domain-row { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
        .domain-row input, .domain-row select { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
        .domain-row button { background: #e74c3c; color: white; border: none; padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; }
        
        .value-row { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
        .value-row input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
        .value-row button { background: #e74c3c; color: white; border: none; padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; }
        
        /* Fields List */
        .fields-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .field-tag { background: #ecf0f1; padding: 0.4rem 0.8rem; border-radius: 4px; display: flex; align-items: center; gap: 0.5rem; }
        .field-tag button { background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1.1rem; }
        .add-field-input { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
        .add-field-input input { flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
        
        /* Buttons */
        .add-field-btn { margin-top: 0.5rem; background: #27ae60; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
        .add-row-btn { background: #3498db; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
        .btn-collapse { background: #95a5a6; color: white; }
        .btn-delete-step { background: #e74c3c; color: white; }
        .btn-primary { background: #667eea; color: white; }
        .btn-secondary { background: #95a5a6; color: white; }
        .btn-danger { background: #e74c3c; color: white; }
        .btn-success { background: #27ae60; color: white; }
        
        .actions { display: flex; gap: 1rem; margin-top: 2rem; }
        .actions button { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
        
        /* Alert */
        .alert { position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; max-width: 400px; }
        .alert.success { border-left: 4px solid #27ae60; }
        .alert.error { border-left: 4px solid #e74c3c; }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div id="loginScreen" class="login-screen">
        <div class="login-box">
            <h1>🔐 Admin Login</h1>
            <input type="password" id="tokenInput" placeholder="Enter admin token">
            <button onclick="login()">Login</button>
        </div>
    </div>
    
    <div id="adminInterface" class="admin-interface">
        <div class="header">
            <h1>Forminator Mapping Admin</h1>
            <button onclick="logout()">Logout</button>
        </div>
        <div class="main-content">
            <div class="sidebar">
                <h2>Forms</h2>
                <ul id="formList" class="form-list"></ul>
            </div>
            <div class="editor">
                <h2 id="editorTitle">Select a form</h2>
                <div id="editorContent"></div>
            </div>
        </div>
    </div>
    
    <script>
        let token = localStorage.getItem('adminToken');
        let currentFormId = null;
        let mappings = {};
        let workflowSteps = [];
        
        if (token) { showAdmin(); }
        
        function login() {
            token = document.getElementById('tokenInput').value;
            localStorage.setItem('adminToken', token);
            showAdmin();
        }
        
        function logout() {
            localStorage.removeItem('adminToken');
            location.reload();
        }
        
        function showAdmin() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminInterface').style.display = 'flex';
            loadForms();
        }
        
        async function apiCall(path, options = {}) {
            const res = await fetch(path, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': \`Bearer \${token}\`,
                    'Content-Type': 'application/json'
                }
            });
            if (res.status === 401) {
                logout();
                throw new Error('Unauthorized');
            }
            return res;
        }
        
        async function loadForms() {
            try {
                const res = await apiCall('/api/mappings');
                mappings = await res.json();
                const list = document.getElementById('formList');
                list.innerHTML = '';
                Object.keys(mappings).filter(k => !k.startsWith('_')).forEach(formId => {
                    const li = document.createElement('li');
                    li.textContent = \`Form \${formId}\`;
                    li.onclick = () => loadForm(formId);
                    list.appendChild(li);
                });
            } catch (err) {
                showAlert('Failed to load forms: ' + err.message, 'error');
            }
        }
        
        function loadForm(formId) {
            currentFormId = formId;
            document.querySelectorAll('.form-list li').forEach(li => li.classList.remove('active'));
            event.target.classList.add('active');
            const data = mappings[formId];
            workflowSteps = JSON.parse(JSON.stringify(data.workflow || [])); // Deep clone
            
            document.getElementById('editorTitle').textContent = \`Edit Form \${formId}\`;
            document.getElementById('editorContent').innerHTML = \`
                <div class="section">
                    <h3>Field Mapping</h3>
                    <div id="fieldMapping" class="field-mapping"></div>
                    <button class="add-field-btn" onclick="addFieldRow()">+ Add Field</button>
                </div>
                <div class="section">
                    <h3>Workflow Steps</h3>
                    <div id="workflowSteps"></div>
                    <button class="btn-success add-field-btn" onclick="addWorkflowStep()">+ Add Workflow Step</button>
                </div>
                <div class="actions">
                    <button class="btn-primary" onclick="saveForm()">Save Changes</button>
                    <button class="btn-secondary" onclick="exportForm()">Export JSON</button>
                    <button class="btn-danger" onclick="deleteForm()">Delete Form</button>
                </div>
            \`;
            
            renderFieldMapping(data.field_mapping || {});
            renderWorkflowSteps();
        }
        
        // Field Mapping
        function renderFieldMapping(fields) {
            const container = document.getElementById('fieldMapping');
            container.innerHTML = '';
            Object.entries(fields).forEach(([key, value]) => {
                const row = document.createElement('div');
                row.className = 'field-row';
                row.innerHTML = \`
                    <input type="text" value="\${key}" data-type="key">
                    <input type="text" value="\${value}" data-type="value">
                    <button onclick="this.parentElement.remove()">×</button>
                \`;
                container.appendChild(row);
            });
        }
        
        function addFieldRow() {
            const container = document.getElementById('fieldMapping');
            const row = document.createElement('div');
            row.className = 'field-row';
            row.innerHTML = \`
                <input type="text" placeholder="forminator_field" data-type="key">
                <input type="text" placeholder="odoo_field" data-type="value">
                <button onclick="this.parentElement.remove()">×</button>
            \`;
            container.appendChild(row);
        }
        
        // Workflow Steps
        function renderWorkflowSteps() {
            const container = document.getElementById('workflowSteps');
            container.innerHTML = '';
            
            workflowSteps.forEach((step, idx) => {
                const stepEl = document.createElement('div');
                stepEl.className = 'workflow-step';
                stepEl.dataset.index = idx;
                stepEl.innerHTML = \`
                    <div class="workflow-step-header" onclick="toggleStep(\${idx})">
                        <h4>Step: \${step.step || '(unnamed)'} - Model: \${step.model || '(no model)'}</h4>
                        <div class="step-actions" onclick="event.stopPropagation()">
                            <button class="btn-collapse" onclick="toggleStep(\${idx})">▼</button>
                            <button class="btn-delete-step" onclick="deleteStep(\${idx})">×</button>
                        </div>
                    </div>
                    <div class="step-content">
                        <div class="step-basics">
                            <div>
                                <label>Step Name:</label>
                                <input type="text" value="\${step.step || ''}" onchange="updateStepBasic(\${idx}, 'step', this.value)">
                            </div>
                            <div>
                                <label>Odoo Model:</label>
                                <input type="text" value="\${step.model || ''}" onchange="updateStepBasic(\${idx}, 'model', this.value)">
                            </div>
                        </div>
                        
                        <div class="step-subsection">
                            <h5>🔍 Search</h5>
                            <div class="domain-editor">
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500">Domain Conditions:</label>
                                <div id="domain-\${idx}"></div>
                                <button class="add-row-btn" onclick="addDomainRow(\${idx})">+ Add Condition</button>
                            </div>
                            <div class="fields-editor" style="margin-top: 1rem">
                                <label style="display:block; margin-bottom:0.5rem; font-weight:500">Fields to Retrieve:</label>
                                <div class="fields-list" id="fields-\${idx}"></div>
                                <div class="add-field-input">
                                    <input type="text" id="new-field-\${idx}" placeholder="field_name">
                                    <button class="add-row-btn" onclick="addSearchField(\${idx})">+ Add</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="step-subsection">
                            <h5>➕ Create</h5>
                            <div id="create-\${idx}"></div>
                            <button class="add-row-btn" onclick="addCreateValue(\${idx})">+ Add Value</button>
                        </div>
                        
                        <div class="step-subsection">
                            <h5>✏️ Update</h5>
                            <div id="update-\${idx}"></div>
                            <button class="add-row-btn" onclick="addUpdateValue(\${idx})">+ Add Value</button>
                        </div>
                    </div>
                \`;
                container.appendChild(stepEl);
                
                renderDomain(idx, step.search?.domain || []);
                renderSearchFields(idx, step.search?.fields || []);
                renderCreateValues(idx, step.create || {});
                renderUpdateValues(idx, step.update || {});
            });
        }
        
        function toggleStep(idx) {
            const step = document.querySelector(\`.workflow-step[data-index="\${idx}"]\`);
            step.classList.toggle('collapsed');
        }
        
        function deleteStep(idx) {
            if (confirm('Delete this workflow step?')) {
                workflowSteps.splice(idx, 1);
                renderWorkflowSteps();
            }
        }
        
        function updateStepBasic(idx, field, value) {
            workflowSteps[idx][field] = value;
            const header = document.querySelector(\`.workflow-step[data-index="\${idx}"] h4\`);
            header.textContent = \`Step: \${workflowSteps[idx].step || '(unnamed)'} - Model: \${workflowSteps[idx].model || '(no model)'}\`;
        }
        
        function addWorkflowStep() {
            workflowSteps.push({
                step: 'new_step',
                model: '',
                search: { domain: [], fields: [] },
                create: {},
                update: {}
            });
            renderWorkflowSteps();
        }
        
        // Domain Editor
        function renderDomain(stepIdx, domain) {
            const container = document.getElementById(\`domain-\${stepIdx}\`);
            container.innerHTML = '';
            
            domain.forEach((condition, condIdx) => {
                const row = document.createElement('div');
                row.className = 'domain-row';
                const field = condition[0] || '';
                const op = condition[1] || '=';
                const val = condition[2] || '';
                
                row.innerHTML = \`
                    <input type="text" value="\${field}" placeholder="field" onchange="updateDomain(\${stepIdx}, \${condIdx}, 0, this.value)">
                    <select onchange="updateDomain(\${stepIdx}, \${condIdx}, 1, this.value)">
                        <option value="=" \${op === '=' ? 'selected' : ''}>equals (=)</option>
                        <option value="!=" \${op === '!=' ? 'selected' : ''}>not equals (!=)</option>
                        <option value=">" \${op === '>' ? 'selected' : ''}>greater (&gt;)</option>
                        <option value="<" \${op === '<' ? 'selected' : ''}>less (&lt;)</option>
                        <option value=">=" \${op === '>=' ? 'selected' : ''}>greater or equal (&gt;=)</option>
                        <option value="<=" \${op === '<=' ? 'selected' : ''}>less or equal (&lt;=)</option>
                        <option value="like" \${op === 'like' ? 'selected' : ''}>like</option>
                        <option value="ilike" \${op === 'ilike' ? 'selected' : ''}>ilike</option>
                        <option value="in" \${op === 'in' ? 'selected' : ''}>in</option>
                        <option value="not in" \${op === 'not in' ? 'selected' : ''}>not in</option>
                    </select>
                    <input type="text" value="\${val}" placeholder="value" onchange="updateDomain(\${stepIdx}, \${condIdx}, 2, this.value)">
                    <button onclick="deleteDomain(\${stepIdx}, \${condIdx})">×</button>
                \`;
                container.appendChild(row);
            });
        }
        
        function addDomainRow(stepIdx) {
            if (!workflowSteps[stepIdx].search) workflowSteps[stepIdx].search = {};
            if (!workflowSteps[stepIdx].search.domain) workflowSteps[stepIdx].search.domain = [];
            workflowSteps[stepIdx].search.domain.push(['', '=', '']);
            renderDomain(stepIdx, workflowSteps[stepIdx].search.domain);
        }
        
        function updateDomain(stepIdx, condIdx, part, value) {
            workflowSteps[stepIdx].search.domain[condIdx][part] = value;
        }
        
        function deleteDomain(stepIdx, condIdx) {
            workflowSteps[stepIdx].search.domain.splice(condIdx, 1);
            renderDomain(stepIdx, workflowSteps[stepIdx].search.domain);
        }
        
        // Search Fields
        function renderSearchFields(stepIdx, fields) {
            const container = document.getElementById(\`fields-\${stepIdx}\`);
            container.innerHTML = '';
            
            fields.forEach((field, fieldIdx) => {
                const tag = document.createElement('div');
                tag.className = 'field-tag';
                tag.innerHTML = \`\${field} <button onclick="deleteSearchField(\${stepIdx}, \${fieldIdx})">×</button>\`;
                container.appendChild(tag);
            });
        }
        
        function addSearchField(stepIdx) {
            const input = document.getElementById(\`new-field-\${stepIdx}\`);
            const value = input.value.trim();
            if (!value) return;
            
            if (!workflowSteps[stepIdx].search) workflowSteps[stepIdx].search = {};
            if (!workflowSteps[stepIdx].search.fields) workflowSteps[stepIdx].search.fields = [];
            workflowSteps[stepIdx].search.fields.push(value);
            input.value = '';
            renderSearchFields(stepIdx, workflowSteps[stepIdx].search.fields);
        }
        
        function deleteSearchField(stepIdx, fieldIdx) {
            workflowSteps[stepIdx].search.fields.splice(fieldIdx, 1);
            renderSearchFields(stepIdx, workflowSteps[stepIdx].search.fields);
        }
        
        // Create Values
        function renderCreateValues(stepIdx, values) {
            const container = document.getElementById(\`create-\${stepIdx}\`);
            container.innerHTML = '';
            
            Object.entries(values).forEach(([key, value]) => {
                const row = document.createElement('div');
                row.className = 'value-row';
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                row.innerHTML = \`
                    <input type="text" value="\${key}" placeholder="field" data-old-key="\${key}" onchange="updateCreateValue(\${stepIdx}, this.dataset.oldKey, this.value, this.nextElementSibling.nextElementSibling.value)">
                    <span>=</span>
                    <input type="text" value="\${displayValue}" placeholder="value" onchange="updateCreateValue(\${stepIdx}, '\${key}', '\${key}', this.value)">
                    <button onclick="deleteCreateValue(\${stepIdx}, '\${key}')">×</button>
                \`;
                container.appendChild(row);
            });
        }
        
        function addCreateValue(stepIdx) {
            if (!workflowSteps[stepIdx].create) workflowSteps[stepIdx].create = {};
            const key = prompt('Field name:');
            if (!key) return;
            const value = prompt('Field value:');
            workflowSteps[stepIdx].create[key] = value || '';
            renderCreateValues(stepIdx, workflowSteps[stepIdx].create);
        }
        
        function updateCreateValue(stepIdx, oldKey, newKey, value) {
            if (oldKey !== newKey) {
                delete workflowSteps[stepIdx].create[oldKey];
            }
            let parsedValue = value;
            try {
                if (value.startsWith('{') || value.startsWith('[') || value === 'true' || value === 'false' || (!isNaN(value) && value !== '')) {
                    parsedValue = JSON.parse(value);
                }
            } catch (e) {}
            workflowSteps[stepIdx].create[newKey] = parsedValue;
        }
        
        function deleteCreateValue(stepIdx, key) {
            delete workflowSteps[stepIdx].create[key];
            renderCreateValues(stepIdx, workflowSteps[stepIdx].create);
        }
        
        // Update Values
        function renderUpdateValues(stepIdx, updateObj) {
            const container = document.getElementById(\`update-\${stepIdx}\`);
            container.innerHTML = '';
            
            // Handle both { fields: {...} } and direct {...} formats
            const values = updateObj.fields || updateObj;
            
            Object.entries(values).forEach(([key, value]) => {
                if (key === 'enabled') return; // Skip enabled flag
                
                const row = document.createElement('div');
                row.className = 'value-row';
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                row.innerHTML = \`
                    <input type="text" value="\${key}" placeholder="field" data-old-key="\${key}" onchange="updateUpdateValue(\${stepIdx}, this.dataset.oldKey, this.value, this.nextElementSibling.nextElementSibling.value)">
                    <span>=</span>
                    <input type="text" value="\${displayValue}" placeholder="value" onchange="updateUpdateValue(\${stepIdx}, '\${key}', '\${key}', this.value)">
                    <button onclick="deleteUpdateValue(\${stepIdx}, '\${key}')">×</button>
                \`;
                container.appendChild(row);
            });
        }
        
        function addUpdateValue(stepIdx) {
            if (!workflowSteps[stepIdx].update) workflowSteps[stepIdx].update = {};
            const key = prompt('Field name:');
            if (!key) return;
            const value = prompt('Field value:');
            
            // Always use fields structure for updates
            if (!workflowSteps[stepIdx].update.fields) workflowSteps[stepIdx].update.fields = {};
            workflowSteps[stepIdx].update.fields[key] = value || '';
            renderUpdateValues(stepIdx, workflowSteps[stepIdx].update);
        }
        
        function updateUpdateValue(stepIdx, oldKey, newKey, value) {
            if (!workflowSteps[stepIdx].update.fields) workflowSteps[stepIdx].update.fields = {};
            
            if (oldKey !== newKey) {
                delete workflowSteps[stepIdx].update.fields[oldKey];
            }
            
            let parsedValue = value;
            try {
                if (value.startsWith('{') || value.startsWith('[') || value === 'true' || value === 'false' || (!isNaN(value) && value !== '')) {
                    parsedValue = JSON.parse(value);
                }
            } catch (e) {}
            
            workflowSteps[stepIdx].update.fields[newKey] = parsedValue;
        }
        
        function deleteUpdateValue(stepIdx, key) {
            delete workflowSteps[stepIdx].update.fields[key];
            renderUpdateValues(stepIdx, workflowSteps[stepIdx].update);
        }
        
        // Save & Export
        async function saveForm() {
            const fieldMapping = {};
            document.querySelectorAll('#fieldMapping .field-row').forEach(row => {
                const key = row.querySelector('[data-type="key"]').value;
                const value = row.querySelector('[data-type="value"]').value;
                if (key && value) fieldMapping[key] = value;
            });
            
            const data = {
                ...mappings[currentFormId],
                field_mapping: fieldMapping,
                workflow: workflowSteps
            };
            
            try {
                await apiCall(\`/api/mappings/\${currentFormId}\`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                mappings[currentFormId] = data;
                showAlert('Form saved successfully', 'success');
            } catch (err) {
                showAlert('Failed to save: ' + err.message, 'error');
            }
        }
        
        function exportForm() {
            const data = mappings[currentFormId];
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`form_\${currentFormId}.json\`;
            a.click();
        }
        
        async function deleteForm() {
            if (!confirm(\`Delete form \${currentFormId}?\`)) return;
            
            try {
                await apiCall(\`/api/mappings/\${currentFormId}\`, { method: 'DELETE' });
                delete mappings[currentFormId];
                showAlert('Form deleted', 'success');
                loadForms();
                document.getElementById('editorContent').innerHTML = '';
            } catch (err) {
                showAlert('Failed to delete: ' + err.message, 'error');
            }
        }
        
        function showAlert(message, type) {
            const alert = document.createElement('div');
            alert.className = \`alert \${type}\`;
            alert.textContent = message;
            document.body.appendChild(alert);
            setTimeout(() => alert.remove(), 3000);
        }
    </script>
</body>
</html>`;
