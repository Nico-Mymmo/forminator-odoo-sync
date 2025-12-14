// Enhanced admin interface with integrated value mapping and tabs
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
        .main-content { display: flex; flex: 1; overflow: hidden; position: relative; }
        
        /* Sidebar */
        .sidebar { width: 250px; background: white; border-right: 1px solid #ddd; overflow-y: auto; }
        .sidebar h2 { padding: 1rem; background: #ecf0f1; font-size: 1rem; border-bottom: 1px solid #ddd; }
        .form-list { list-style: none; }
        .form-list li { padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid #eee; }
        .form-list li:hover { background: #f8f9fa; }
        .form-list li.active { background: #667eea; color: white; }
        
        /* Editor */
        .editor { flex: 1; overflow-y: auto; padding: 2rem; padding-right: 220px; }
        .editor h2 { margin-bottom: 1rem; color: #333; }
        
        /* Tabs */
        .tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid #ddd; }
        .tab { padding: 0.75rem 1.5rem; background: none; border: none; border-bottom: 3px solid transparent; cursor: pointer; font-size: 1rem; color: #666; transition: all 0.2s; }
        .tab:hover { color: #667eea; }
        .tab.active { color: #667eea; border-bottom-color: #667eea; font-weight: 600; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        /* Field Palette */
        .field-palette { position: fixed; right: 0; top: 60px; width: 200px; height: calc(100vh - 60px); background: white; border-left: 2px solid #667eea; overflow-y: auto; padding: 1rem; box-shadow: -2px 0 8px rgba(0,0,0,0.1); z-index: 100; }
        .field-palette h3 { margin-bottom: 1rem; color: #667eea; font-size: 1rem; }
        .field-palette-content { display: flex; flex-direction: column; gap: 0.5rem; }
        .draggable-field { 
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.35rem 0.65rem; 
            background: #667eea; 
            color: white; 
            border-radius: 14px; 
            cursor: grab; 
            font-size: 0.85rem; 
            text-align: center; 
            user-select: none; 
            transition: all 0.2s;
            font-weight: 500;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .draggable-field::before {
            content: '⋮⋮';
            opacity: 0.6;
            font-size: 0.9em;
            letter-spacing: -2px;
        }
        .draggable-field:hover { 
            transform: translateY(-2px); 
            background: #5568d3;
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .draggable-field:active { cursor: grabbing; transform: scale(0.95); }
        .draggable-field.dragging { opacity: 0.5; transform: scale(1.05); }
        
        /* Drop Zones */
        .drop-zone { position: relative; }
        .drop-zone-active { border: 2px dashed #667eea !important; background: #f0f4ff !important; }
        
        /* Section */
        .section { background: white; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section h3 { margin-bottom: 1rem; color: #555; font-size: 1.1rem; }
        
        /* Field Mapping with Inline Value Mapping */
        .field-mapping { display: grid; gap: 0.5rem; }
        .field-row-container { background: white; padding: 0.75rem; border-radius: 4px; border: 1px solid #ddd; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 0.5rem; align-items: center; }
        .field-row input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
        .field-row .btn-value-mapping { background: #667eea; color: white; border: none; padding: 0.4rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
        .field-row .btn-delete { background: #e74c3c; color: white; border: none; padding: 0.4rem 0.6rem; border-radius: 4px; cursor: pointer; }
        
        /* Inline Value Mapping */
        .value-mapping-inline { display: none; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #eee; }
        .value-mapping-inline.expanded { display: block; }
        .value-mapping-inline h5 { color: #667eea; margin-bottom: 0.5rem; font-size: 0.9rem; }
        .value-mapping-controls { margin-bottom: 0.75rem; }
        .value-mapping-controls label { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer; font-size: 0.9rem; }
        .value-mapping-controls input[type="checkbox"] { width: auto; }
        .default-value-container { margin-top: 0.5rem; margin-left: 1.5rem; }
        .default-value-container label { display: block; margin-bottom: 0.25rem; color: #666; font-size: 0.85rem; }
        .default-value-container input { width: 100%; padding: 0.4rem; border: 1px solid #ddd; border-radius: 3px; font-size: 0.9rem; }
        
        .value-mappings-list { display: grid; gap: 0.35rem; margin-bottom: 0.5rem; }
        .value-mapping-row { display: grid; grid-template-columns: 1fr 30px 1fr 30px; gap: 0.4rem; align-items: center; }
        .value-mapping-row input { padding: 0.35rem 0.5rem; border: 1px solid #ddd; border-radius: 3px; font-size: 0.85rem; }
        .value-mapping-row .arrow { color: #999; font-size: 0.85rem; text-align: center; }
        .value-mapping-row button { background: #e74c3c; color: white; border: none; padding: 0.25rem 0.4rem; border-radius: 3px; cursor: pointer; font-size: 0.85rem; line-height: 1; }
        
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
        .value-row input, .value-row textarea { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
        .value-row textarea { resize: vertical; min-height: 60px; }
        .value-row button { background: #e74c3c; color: white; border: none; padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; }
        
        /* Chip-enabled inputs */
        .chip-input {
            min-height: 38px;
            padding: 0.5rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            cursor: text;
            font-family: inherit;
            font-size: inherit;
            line-height: 1.5;
            overflow-wrap: break-word;
            word-wrap: break-word;
        }
        .chip-input:empty:before {
            content: attr(data-placeholder);
            color: #999;
            pointer-events: none;
        }
        .chip-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
        }
        .chip-input.drop-zone-active {
            border-color: #667eea;
            background: rgba(102, 126, 234, 0.05);
        }
        .field-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            background: #667eea;
            color: white;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 500;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
            margin: 0 1px;
            vertical-align: middle;
        }
        .field-chip:hover {
            background: #5568d3;
        }
        .field-chip:focus {
            outline: 2px solid #667eea;
            outline-offset: 2px;
        }
        .field-chip .chip-remove {
            margin-left: 0.15rem;
            cursor: pointer;
            font-weight: bold;
            opacity: 0.7;
        }
        .field-chip .chip-remove:hover {
            opacity: 1;
        }
        .chip-text {
            display: inline;
        }
        
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
            <div class="field-palette">
                <h3>📋 Available Fields</h3>
                <div id="fieldPaletteContent" class="field-palette-content"></div>
            </div>
        </div>
    </div>
    
    <script>
        let token = localStorage.getItem('adminToken');
        let currentFormId = null;
        let mappings = {};
        let fieldMapping = {};
        let valueMapping = {};
        let workflowSteps = [];
        let draggedFieldName = null;
        let expandedValueMappings = {};
        
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
            fieldMapping = JSON.parse(JSON.stringify(data.field_mapping || {}));
            
            // Normalize value_mapping: convert Odoo field names to Forminator field names
            const rawValueMapping = JSON.parse(JSON.stringify(data.value_mapping || {}));
            valueMapping = {};
            Object.entries(rawValueMapping).forEach(([key, mappings]) => {
                // Find the forminator field that maps to this odoo field
                const formField = Object.keys(fieldMapping).find(f => fieldMapping[f] === key);
                if (formField) {
                    valueMapping[formField] = mappings;
                } else {
                    // Keep original key if no mapping found
                    valueMapping[key] = mappings;
                }
            });
            
            workflowSteps = JSON.parse(JSON.stringify(data.workflow || []));
            expandedValueMappings = {};
            
            document.getElementById('editorTitle').textContent = \`Edit Form \${formId}\`;
            document.getElementById('editorContent').innerHTML = \`
                <div class="tabs">
                    <button class="tab active" onclick="switchTab('mapping')">Field & Value Mapping</button>
                    <button class="tab" onclick="switchTab('workflow')">Workflow Steps</button>
                </div>
                
                <div id="tab-mapping" class="tab-content active">
                    <div class="section">
                        <h3>Field Mapping & Value Mapping</h3>
                        <div id="fieldMapping" class="field-mapping"></div>
                        <button class="add-field-btn" onclick="addFieldRow()">+ Add Field</button>
                    </div>
                </div>
                
                <div id="tab-workflow" class="tab-content">
                    <div class="section">
                        <h3>Workflow Steps</h3>
                        <div id="workflowSteps"></div>
                        <button class="btn-success add-field-btn" onclick="addWorkflowStep()">+ Add Workflow Step</button>
                    </div>
                </div>
                
                <div class="actions">
                    <button class="btn-primary" onclick="saveForm()">Save Changes</button>
                    <button class="btn-secondary" onclick="exportForm()">Export JSON</button>
                    <button class="btn-danger" onclick="deleteForm()">Delete Form</button>
                </div>
            \`;
            
            renderFieldMapping();
            renderWorkflowSteps();
            updateFieldPalette();
            initializeDragAndDrop();
        }
        
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(\`tab-\${tabName}\`).classList.add('active');
        }
        
        // Field Mapping with Inline Value Mapping
        function renderFieldMapping() {
            const container = document.getElementById('fieldMapping');
            container.innerHTML = '';
            
            Object.entries(fieldMapping).forEach(([formField, odooField]) => {
                const containerDiv = document.createElement('div');
                containerDiv.className = 'field-row-container';
                containerDiv.dataset.field = formField;
                
                const rowDiv = document.createElement('div');
                rowDiv.className = 'field-row';
                rowDiv.innerHTML = \`
                    <input type="text" value="\${formField}" data-type="key" onchange="updateFieldKey('\${formField}', this.value)">
                    <input type="text" value="\${odooField}" data-type="value" onchange="updateFieldValue('\${formField}', this.value)">
                    <button class="btn-value-mapping" onclick="toggleValueMapping('\${formField}')">⚙️ Values</button>
                    <button class="btn-delete" onclick="deleteField('\${formField}')">×</button>
                \`;
                
                containerDiv.appendChild(rowDiv);
                
                // Add inline value mapping section
                const valueMappingDiv = document.createElement('div');
                valueMappingDiv.className = 'value-mapping-inline';
                valueMappingDiv.id = \`value-mapping-\${formField}\`;
                if (expandedValueMappings[formField]) {
                    valueMappingDiv.classList.add('expanded');
                }
                valueMappingDiv.innerHTML = \`
                    <h5>Value Mapping for "\${formField}"</h5>
                    <div class="value-mapping-controls">
                        <label>
                            <input type="checkbox" onchange="toggleSkip('\${formField}', this.checked)" 
                                \${valueMapping[formField]?._skip ? 'checked' : ''}>
                            Skip unmapped values
                        </label>
                        <div class="default-value-container" id="default-\${formField}" style="display:\${valueMapping[formField]?._skip ? 'none' : 'block'}">
                            <label>Default value for unmapped values:</label>
                            <input type="text" value="\${valueMapping[formField]?._default || ''}" 
                                onchange="updateDefaultValue('\${formField}', this.value)">
                        </div>
                    </div>
                    <div class="value-mappings-list" id="mappings-\${formField}"></div>
                    <button class="add-row-btn" onclick="addValueMappingRow('\${formField}')">+ Add Value Mapping</button>
                \`;
                
                containerDiv.appendChild(valueMappingDiv);
                container.appendChild(containerDiv);
                
                // Auto-expand if value mappings exist
                const hasValueMappings = valueMapping[formField] && Object.keys(valueMapping[formField]).some(k => !k.startsWith('_'));
                if (hasValueMappings && !expandedValueMappings.hasOwnProperty(formField)) {
                    expandedValueMappings[formField] = true;
                    valueMappingDiv.classList.add('expanded');
                }
                
                // Always render value mapping rows (even if empty)
                renderValueMappingRows(formField);
            });
        }
        
        function renderValueMappingRows(formField) {
            const container = document.getElementById(\`mappings-\${formField}\`);
            if (!container) return;
            
            container.innerHTML = '';
            const mappings = valueMapping[formField] || {};
            
            Object.entries(mappings).forEach(([key, value]) => {
                if (key.startsWith('_')) return; // Skip _skip, _default, _comment
                
                const row = document.createElement('div');
                row.className = 'value-mapping-row';
                row.innerHTML = \`
                    <input type="text" value="\${key}" data-old-key="\${key}" 
                        onchange="updateValueMappingKey('\${formField}', this.dataset.oldKey, this.value)">
                    <span class="arrow">→</span>
                    <input type="text" value="\${value}" 
                        onchange="updateValueMappingValue('\${formField}', '\${key}', this.value)">
                    <button onclick="deleteValueMappingRow('\${formField}', '\${key}')">×</button>
                \`;
                container.appendChild(row);
            });
        }
        
        function toggleValueMapping(formField) {
            expandedValueMappings[formField] = !expandedValueMappings[formField];
            const element = document.getElementById(\`value-mapping-\${formField}\`);
            if (expandedValueMappings[formField]) {
                element.classList.add('expanded');
            } else {
                element.classList.remove('expanded');
            }
        }
        
        function toggleSkip(formField, checked) {
            if (!valueMapping[formField]) valueMapping[formField] = {};
            
            if (checked) {
                valueMapping[formField]._skip = true;
                delete valueMapping[formField]._default;
                document.getElementById(\`default-\${formField}\`).style.display = 'none';
            } else {
                delete valueMapping[formField]._skip;
                document.getElementById(\`default-\${formField}\`).style.display = 'block';
            }
        }
        
        function updateDefaultValue(formField, value) {
            if (!valueMapping[formField]) valueMapping[formField] = {};
            if (value.trim()) {
                valueMapping[formField]._default = value;
            } else {
                delete valueMapping[formField]._default;
            }
        }
        
        function addValueMappingRow(formField) {
            const key = prompt('Enter original value:');
            if (!key) return;
            const value = prompt('Enter mapped value:');
            
            if (!valueMapping[formField]) valueMapping[formField] = {};
            valueMapping[formField][key] = value || '';
            renderValueMappingRows(formField);
        }
        
        function updateValueMappingKey(formField, oldKey, newKey) {
            if (oldKey === newKey) return;
            const value = valueMapping[formField][oldKey];
            delete valueMapping[formField][oldKey];
            valueMapping[formField][newKey] = value;
            event.target.dataset.oldKey = newKey;
        }
        
        function updateValueMappingValue(formField, key, value) {
            valueMapping[formField][key] = value;
        }
        
        function deleteValueMappingRow(formField, key) {
            delete valueMapping[formField][key];
            renderValueMappingRows(formField);
        }
        
        function updateFieldKey(oldKey, newKey) {
            if (oldKey === newKey) return;
            fieldMapping[newKey] = fieldMapping[oldKey];
            delete fieldMapping[oldKey];
            if (valueMapping[oldKey]) {
                valueMapping[newKey] = valueMapping[oldKey];
                delete valueMapping[oldKey];
            }
            renderFieldMapping();
            updateFieldPalette();
        }
        
        function updateFieldValue(key, value) {
            fieldMapping[key] = value;
        }
        
        function deleteField(key) {
            delete fieldMapping[key];
            delete valueMapping[key];
            renderFieldMapping();
            updateFieldPalette();
        }
        
        function addFieldRow() {
            const key = prompt('Forminator field name:');
            if (!key) return;
            const value = prompt('Odoo field name:');
            fieldMapping[key] = value || '';
            renderFieldMapping();
            updateFieldPalette();
        }
        
        // Field Palette for Drag & Drop
        function updateFieldPalette() {
            const palette = document.getElementById('fieldPaletteContent');
            palette.innerHTML = '';
            
            Object.entries(fieldMapping).forEach(([formField, odooField]) => {
                const chip = document.createElement('div');
                chip.className = 'draggable-field';
                chip.textContent = odooField; // Show Odoo field name
                chip.title = \`Forminator: \${formField}\`; // Tooltip with forminator name
                chip.draggable = true;
                chip.dataset.field = odooField;
                chip.dataset.formfield = formField;
                chip.addEventListener('dragstart', handleDragStart);
                chip.addEventListener('dragend', handleDragEnd);
                palette.appendChild(chip);
            });
        }
        
        function handleDragStart(e) {
            draggedFieldName = e.target.dataset.field;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
        }
        
        function handleDragEnd(e) {
            e.target.classList.remove('dragging');
        }
        
        function initializeDragAndDrop() {
            document.querySelectorAll('.value-row input[type="text"], .value-row textarea').forEach(element => {
                convertToChipInput(element);
            });
        }
        
        function convertToChipInput(originalInput) {
            // Skip if already converted
            if (originalInput.hasAttribute('data-chip-converted')) {
                console.log('Input already converted, skipping');
                return;
            }
            originalInput.setAttribute('data-chip-converted', 'true');
            
            // Store original value
            const originalValue = originalInput.value || '';
            const placeholder = originalInput.placeholder || '';
            const isTextarea = originalInput.tagName === 'TEXTAREA';
            
            console.log('=== Converting input to chip input ===');
            console.log('Input type:', originalInput.tagName);
            console.log('Original value:', originalValue);
            console.log('Placeholder:', placeholder);
            
            // Create chip input container
            const chipInput = document.createElement('div');
            chipInput.className = 'chip-input drop-zone';
            chipInput.setAttribute('contenteditable', 'true');
            chipInput.setAttribute('data-placeholder', placeholder);
            
            // Create hidden input to store actual value
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = originalInput.name || '';
            hiddenInput.value = originalValue;
            
            // Copy event handlers
            const changeHandler = originalInput.getAttribute('onchange');
            if (changeHandler) {
                hiddenInput.setAttribute('onchange', changeHandler);
                console.log('Copied onchange handler');
            }
            
            // Replace original input
            originalInput.parentNode.insertBefore(chipInput, originalInput);
            originalInput.parentNode.insertBefore(hiddenInput, originalInput);
            originalInput.remove();
            
            console.log('Replaced input with chip input');
            
            // Parse initial value and render chips
            if (originalValue) {
                console.log('Will render chips for value:', originalValue);
                renderChipContent(chipInput, originalValue);
            } else {
                console.log('No initial value to render');
            }
            
            // Event listeners
            chipInput.addEventListener('input', function(e) {
                // Small delay to let browser finish the input
                setTimeout(function() {
                    normalizeChipContent(chipInput);
                    updateHiddenValue(chipInput, hiddenInput);
                }, 0);
            });
            
            chipInput.addEventListener('blur', function() {
                normalizeChipContent(chipInput);
                updateHiddenValue(chipInput, hiddenInput);
                if (changeHandler) {
                    hiddenInput.dispatchEvent(new Event('change'));
                }
            });
            
            chipInput.addEventListener('keydown', function(e) {
                // Handle backspace on chips
                if (e.key === 'Backspace') {
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        // Check if cursor is right after a chip
                        if (range.collapsed && range.startOffset === 0 && range.startContainer.previousSibling) {
                            const prev = range.startContainer.previousSibling;
                            if (prev.classList && prev.classList.contains('field-chip')) {
                                e.preventDefault();
                                prev.remove();
                                updateHiddenValue(chipInput, hiddenInput);
                            }
                        }
                    }
                }
                // Handle delete on chips
                if (e.key === 'Delete') {
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        // Check if cursor is right before a chip
                        if (range.collapsed && range.startContainer.nextSibling) {
                            const next = range.startContainer.nextSibling;
                            if (next.classList && next.classList.contains('field-chip')) {
                                e.preventDefault();
                                next.remove();
                                updateHiddenValue(chipInput, hiddenInput);
                            }
                        }
                    }
                }
            });
            
            chipInput.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                chipInput.classList.add('drop-zone-active');
            });
            chipInput.addEventListener('dragleave', function(e) {
                // Only remove if we're actually leaving the chip input
                if (!chipInput.contains(e.relatedTarget)) {
                    chipInput.classList.remove('drop-zone-active');
                }
            });
            chipInput.addEventListener('drop', function(e) {
                handleChipDrop(e, chipInput, hiddenInput);
            });
            chipInput.addEventListener('dragenter', function(e) {
                e.preventDefault();
            });
            
            // Store reference for later access
            chipInput._hiddenInput = hiddenInput;
        }
        
        function renderChipContent(chipInput, value) {
            console.log('renderChipContent called with value:', value);
            chipInput.innerHTML = '';
            
            if (!value) {
                console.log('No value to render');
                return;
            }
            
            // Parse value and create chips and text nodes
            // Match both dollar-brace-field.xxx-brace and dollar-brace-xxx-brace formats
            const pattern = new RegExp('\\\\\\$\\\\\\{(?:field\\\\.)?([a-zA-Z0-9_]+)\\\\\\}', 'g');
            console.log('Testing pattern against value, pattern:', pattern);
            console.log('Pattern test result:', pattern.test(value));
            pattern.lastIndex = 0; // Reset after test
            
            let lastIndex = 0;
            let match;
            let chipCount = 0;
            
            while ((match = pattern.exec(value)) !== null) {
                console.log('Found field placeholder:', match[0], 'field name:', match[1]);
                
                // Add text before chip
                if (match.index > lastIndex) {
                    const textBefore = value.substring(lastIndex, match.index);
                    if (textBefore) {
                        const textNode = document.createTextNode(textBefore);
                        chipInput.appendChild(textNode);
                        console.log('Added text before chip:', textBefore);
                    }
                }
                
                // Add chip
                const chip = createFieldChip(match[1]);
                chipInput.appendChild(chip);
                chipCount++;
                console.log('Added chip for field:', match[1]);
                
                lastIndex = pattern.lastIndex;
            }
            
            // Add remaining text
            if (lastIndex < value.length) {
                const textAfter = value.substring(lastIndex);
                if (textAfter) {
                    const textNode = document.createTextNode(textAfter);
                    chipInput.appendChild(textNode);
                    console.log('Added text after chips:', textAfter);
                }
            }
            
            console.log('renderChipContent complete. Added', chipCount, 'chips');
        }
        
        function createFieldChip(fieldName, isDraggableWithin = true) {
            const chip = document.createElement('span');
            chip.className = 'field-chip';
            chip.contentEditable = 'false';
            chip.setAttribute('data-field', fieldName);
            chip.setAttribute('spellcheck', 'false');
            
            if (isDraggableWithin) {
                chip.draggable = true;
                chip.addEventListener('dragstart', function(e) {
                    e.stopPropagation();
                    chip.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', fieldName);
                    // Store reference to the chip being moved
                    chip._isMoving = true;
                });
                chip.addEventListener('dragend', function(e) {
                    chip.classList.remove('dragging');
                    chip._isMoving = false;
                });
                chip.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
            
            const label = document.createElement('span');
            label.textContent = fieldName;
            chip.appendChild(label);
            
            const remove = document.createElement('span');
            remove.className = 'chip-remove';
            remove.textContent = '×';
            remove.onclick = function(e) {
                e.stopPropagation();
                chip.remove();
                const chipInput = chip.closest('.chip-input');
                if (chipInput) {
                    updateHiddenValue(chipInput, chipInput._hiddenInput);
                    if (chipInput._hiddenInput) {
                        chipInput._hiddenInput.dispatchEvent(new Event('change'));
                    }
                }
            };
            chip.appendChild(remove);
            
            return chip;
        }
        
        function normalizeChipContent(chipInput) {
            // Clean up any text nodes that might have placeholder syntax
            const walker = document.createTreeWalker(
                chipInput,
                NodeFilter.SHOW_TEXT,
                null
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }
            
            textNodes.forEach(textNode => {
                const text = textNode.textContent;
                // Match both dollar-brace-field.xxx-brace and dollar-brace-xxx-brace formats
                const pattern = new RegExp('\\\\\\$\\\\\\{(?:field\\\\.)?([a-zA-Z0-9_]+)\\\\\\}', 'g');
                
                if (pattern.test(text)) {
                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;
                    let match;
                    pattern.lastIndex = 0;
                    
                    while ((match = pattern.exec(text)) !== null) {
                        if (match.index > lastIndex) {
                            fragment.appendChild(
                                document.createTextNode(text.substring(lastIndex, match.index))
                            );
                        }
                        fragment.appendChild(createFieldChip(match[1]));
                        lastIndex = pattern.lastIndex;
                    }
                    
                    if (lastIndex < text.length) {
                        fragment.appendChild(
                            document.createTextNode(text.substring(lastIndex))
                        );
                    }
                    
                    textNode.parentNode.replaceChild(fragment, textNode);
                }
            });
        }
        
        function updateHiddenValue(chipInput, hiddenInput) {
            if (!hiddenInput) return;
            
            let value = '';
            chipInput.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    value += node.textContent;
                } else if (node.classList && node.classList.contains('field-chip')) {
                    const fieldName = node.getAttribute('data-field');
                    value += '$' + '{field.' + fieldName + '}';
                }
            });
            
            hiddenInput.value = value;
        }
        
        function handleChipDrop(e, chipInput, hiddenInput) {
            e.preventDefault();
            e.stopPropagation();
            chipInput.classList.remove('drop-zone-active');
            
            // Check if we're moving an existing chip within this input
            const movingChip = Array.from(chipInput.querySelectorAll('.field-chip')).find(c => c._isMoving);
            
            let chip;
            if (movingChip) {
                // Moving existing chip
                chip = movingChip;
                chip.remove(); // Remove from current position
            } else if (draggedFieldName) {
                // Adding new chip from palette
                chip = createFieldChip(draggedFieldName);
            } else {
                return;
            }
            
            // Find the drop position based on mouse coordinates
            let insertBeforeElement = null;
            const rect = chipInput.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Find the element at the drop position
            Array.from(chipInput.childNodes).forEach(node => {
                if (node === chip) return; // Skip the chip being moved
                
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const nodeRect = node.getBoundingClientRect();
                    const nodeX = nodeRect.left - rect.left;
                    const nodeY = nodeRect.top - rect.top;
                    const nodeWidth = nodeRect.width;
                    const nodeHeight = nodeRect.height;
                    
                    // Check if drop is before this element
                    if (y < nodeY + nodeHeight && y >= nodeY) {
                        if (x < nodeX + nodeWidth / 2) {
                            insertBeforeElement = node;
                        }
                    }
                }
            });
            
            // Insert the chip
            if (insertBeforeElement) {
                chipInput.insertBefore(chip, insertBeforeElement);
            } else {
                chipInput.appendChild(chip);
            }
            
            // Add a space after if needed
            if (!chip.nextSibling || (chip.nextSibling.nodeType === Node.ELEMENT_NODE)) {
                chipInput.insertBefore(document.createTextNode(' '), chip.nextSibling);
            }
            
            updateHiddenValue(chipInput, hiddenInput);
            hiddenInput.dispatchEvent(new Event('change'));
            chipInput.focus();
        }
        
        function makeDropZone(element) {
            element.classList.add('drop-zone');
            element.addEventListener('dragover', handleDragOver);
            element.addEventListener('dragleave', handleDragLeave);
            element.addEventListener('drop', handleDrop);
        }
        
        function handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            e.target.classList.add('drop-zone-active');
        }
        
        function handleDragLeave(e) {
            e.target.classList.remove('drop-zone-active');
        }
        
        function handleDrop(e) {
            e.preventDefault();
            e.target.classList.remove('drop-zone-active');
            
            // This is for non-chip inputs only (chip inputs use handleChipDrop)
            if (draggedFieldName && e.target.tagName === 'INPUT') {
                const placeholder = '$' + '{field.' + draggedFieldName + '}';
                const input = e.target;
                const cursorPos = input.selectionStart || input.value.length;
                const newValue = input.value.substring(0, cursorPos) + placeholder + input.value.substring(cursorPos);
                input.value = newValue;
                input.dispatchEvent(new Event('input'));
                input.dispatchEvent(new Event('change'));
            }
        }
        
        // Workflow Steps (unchanged from previous version)
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
            
            // Re-initialize drag and drop for newly rendered elements
            initializeDragAndDrop();
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
            
            // Convert inputs to chip inputs after a small delay to ensure values are set
            setTimeout(() => {
                container.querySelectorAll('input[type="text"]').forEach(convertToChipInput);
            }, 0);
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
            console.log('=== renderCreateValues ===', 'stepIdx:', stepIdx, 'values:', values);
            const container = document.getElementById(\`create-\${stepIdx}\`);
            container.innerHTML = '';
            
            Object.entries(values).forEach(([key, value]) => {
                const row = document.createElement('div');
                row.className = 'value-row';
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                const useTextarea = displayValue.length > 40;
                
                console.log('Creating value row:', key, '=', displayValue);
                
                row.innerHTML = \`
                    <input type="text" value="\${key}" placeholder="field" data-old-key="\${key}" 
                        onchange="updateCreateValue(\${stepIdx}, this.dataset.oldKey, this.value, this.nextElementSibling.nextElementSibling.value)">
                    <span>=</span>
                    \${useTextarea 
                        ? \`<textarea onchange="updateCreateValue(\${stepIdx}, '\${key}', '\${key}', this.value)">\${displayValue}</textarea>\`
                        : \`<input type="text" value="\${displayValue}" placeholder="value" onchange="updateCreateValue(\${stepIdx}, '\${key}', '\${key}', this.value)">\`
                    }
                    <button onclick="deleteCreateValue(\${stepIdx}, '\${key}')">×</button>
                \`;
                container.appendChild(row);
            });
            
            // Convert inputs to chip inputs after a small delay to ensure values are set
            setTimeout(() => {
                const inputs = container.querySelectorAll('input[type="text"], textarea');
                console.log('Converting', inputs.length, 'inputs to chip inputs');
                inputs.forEach(convertToChipInput);
            }, 0);
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
            
            const values = updateObj.fields || updateObj;
            
            Object.entries(values).forEach(([key, value]) => {
                if (key === 'enabled') return;
                
                const row = document.createElement('div');
                row.className = 'value-row';
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                const useTextarea = displayValue.length > 40;
                
                row.innerHTML = \`
                    <input type="text" value="\${key}" placeholder="field" data-old-key="\${key}" 
                        onchange="updateUpdateValue(\${stepIdx}, this.dataset.oldKey, this.value, this.nextElementSibling.nextElementSibling.value)">
                    <span>=</span>
                    \${useTextarea 
                        ? \`<textarea onchange="updateUpdateValue(\${stepIdx}, '\${key}', '\${key}', this.value)">\${displayValue}</textarea>\`
                        : \`<input type="text" value="\${displayValue}" placeholder="value" onchange="updateUpdateValue(\${stepIdx}, '\${key}', '\${key}', this.value)">\`
                    }
                    <button onclick="deleteUpdateValue(\${stepIdx}, '\${key}')">×</button>
                \`;
                container.appendChild(row);
            });
            
            // Convert inputs to chip inputs after a small delay to ensure values are set
            setTimeout(() => {
                container.querySelectorAll('input[type="text"], textarea').forEach(convertToChipInput);
            }, 0);
        }
        
        function addUpdateValue(stepIdx) {
        }
        
        function addCreateValue(stepIdx) {
            if (!workflowSteps[stepIdx].update) workflowSteps[stepIdx].update = {};
            const key = prompt('Field name:');
            if (!key) return;
            const value = prompt('Field value:');
            
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
            // Convert value_mapping back to Odoo field names and clean up empty mappings
            const cleanedValueMapping = {};
            Object.entries(valueMapping).forEach(([formField, mappings]) => {
                const cleaned = {};
                let hasContent = false;
                
                Object.entries(mappings).forEach(([key, value]) => {
                    if (key.startsWith('_')) {
                        cleaned[key] = value;
                        hasContent = true;
                    } else if (key && value !== undefined) {
                        cleaned[key] = value;
                        hasContent = true;
                    }
                });
                
                if (hasContent) {
                    // Convert forminator field name to odoo field name for storage
                    const odooField = fieldMapping[formField] || formField;
                    cleanedValueMapping[odooField] = cleaned;
                }
            });
            
            const data = {
                ...mappings[currentFormId],
                field_mapping: fieldMapping,
                value_mapping: cleanedValueMapping,
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
