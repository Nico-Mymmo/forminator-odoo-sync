
        let token = localStorage.getItem('adminToken');
        let currentFormId = null;
        let mappings = {};
        let fieldMapping = {};
        let valueMapping = {};
        let workflowSteps = [];
        let draggedFieldName = null;
        let expandedValueMappings = {};
        let currentHtmlCardStepIdx = null;
        let htmlCardElements = [];
        
        // Auto-save debounce timer
        let autoSaveTimeout = null;
        
        // Debounced auto-save function
        function debouncedAutoSave() {
            if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                if (currentFormId) {
                    saveForm(true); // true = silent save (no success message)
                }
            }, 1000); // 1 second debounce
        }
        
        // Odoo Model Templates
        const ODOO_MODELS = {
            'res.partner': {
                name: '👤 Contact / Bedrijf',
                description: 'Contactpersoon of bedrijf',
                searchTemplates: {
                    'email': {
                        name: 'Opzoeken op email',
                        fields: { email: { label: 'Email veld', dropOnly: true } },
                        typeFilter: true,
                        buildDomain: (values, typeFilter) => {
                            const domain = [['email', '=', '${field.' + values.email + '}']];
                            if (typeFilter === 'contact') domain.push(['is_company', '=', false]);
                            if (typeFilter === 'company') domain.push(['is_company', '=', true]);
                            return domain;
                        },
                        defaultFields: ['id', 'name', 'email', 'parent_id', 'is_company']
                    },
                    'id': {
                        name: 'Opzoeken op ID',
                        fields: { contactId: { label: 'Contact ID', dropOnly: true } },
                        typeFilter: false,
                        buildDomain: (values) => {
                            return [['id', '=', '${' + values.contactId + '}']];
                        },
                        defaultFields: ['id', 'name', 'email', 'is_company']
                    },
                    'name': {
                        name: 'Opzoeken op naam',
                        fields: { name: { label: 'Naam veld', dropOnly: true } },
                        typeFilter: true,
                        buildDomain: (values, typeFilter) => {
                            const domain = [['name', '=', '${field.' + values.name + '}']];
                            if (typeFilter === 'contact') domain.push(['is_company', '=', false]);
                            if (typeFilter === 'company') domain.push(['is_company', '=', true]);
                            return domain;
                        },
                        defaultFields: ['id', 'name', 'email', 'parent_id', 'is_company']
                    }
                }
            },
            'crm.lead': {
                name: '🎯 Lead / Opportunity',
                description: 'Verkoopkans of lead',
                searchTemplates: {
                    'partner': {
                        name: 'Opzoeken op contact',
                        fields: { partnerId: { label: 'Contact ID', dropOnly: true } },
                        typeFilter: false,
                        buildDomain: (values) => {
                            return [['partner_id', '=', '${' + values.partnerId + '}']];
                        },
                        defaultFields: ['id', 'name', 'partner_id', 'type']
                    }
                }
            },
            'x_web_visitor': {
                name: '🌐 Web Visitor',
                description: 'Website bezoeker tracking',
                searchTemplates: {
                    'uuid': {
                        name: 'Opzoeken op UUID',
                        fields: { uuid: { label: 'UUID veld', dropOnly: true } },
                        typeFilter: false,
                        buildDomain: (values) => {
                            return [['x_studio_uuid', '=', '${field.' + values.uuid + '}']];
                        },
                        defaultFields: ['id', 'x_studio_uuid', 'x_studio_email']
                    }
                }
            },
            'custom': {
                name: '⚙️ Aangepast model',
                description: 'Vrij in te vullen model (zoals nu)',
                searchTemplates: {}
            }
        };
        
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
        
        async function syncProdData() {
            if (!confirm('Sync production data to dev? This will overwrite local changes.')) {
                return;
            }
            
            try {
                showAlert('Syncing production data...', 'info');
                const res = await apiCall('/api/mappings/sync-prod', { method: 'POST' });
                const result = await res.json();
                
                if (result.success) {
                    showAlert(result.message, 'success');
                    await loadForms(); // Reload forms
                } else {
                    showAlert('Sync failed: ' + result.error, 'error');
                }
            } catch (err) {
                showAlert('Sync failed: ' + err.message, 'error');
            }
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
                    'Authorization': `Bearer ${token}`,
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
                    const a = document.createElement('a');
                    const formName = mappings[formId]?.name || formId;
                    a.textContent = formName;
                    a.title = `ID: ${formId}`;
                    a.onclick = () => loadForm(formId);
                    if (formId === currentFormId) {
                        a.className = 'active';
                    }
                    li.appendChild(a);
                    list.appendChild(li);
                });
            } catch (err) {
                showAlert('Failed to load forms: ' + err.message, 'error');
            }
        }
        
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function loadForm(formId) {
            currentFormId = formId;
            document.querySelectorAll('#formList a').forEach(a => a.classList.remove('active'));
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
            
            // Restore custom domain conditions and field types from metadata
            workflowSteps.forEach(step => {
                // Restore custom domain with field types
                if (step.search?._customDomain) {
                    // _customDomain exists in saved data (new format)
                    if (step._ui_metadata?.custom_domain_types) {
                        step.search._customDomain = step.search._customDomain.map((condition, idx) => {
                            const fieldType = step._ui_metadata.custom_domain_types[idx] || 'text';
                            const value = typeof condition[2] === 'string' ? condition[2].trim() : condition[2];
                            return [condition[0], condition[1], value, fieldType];
                        });
                    } else {
                        // Add default type if missing
                        step.search._customDomain = step.search._customDomain.map(condition => {
                            if (condition.length === 3) {
                                return [...condition, 'text'];
                            }
                            return condition;
                        });
                    }
                } else if (step.model && ODOO_MODELS[step.model]?.searchTemplates && step.search?.domain) {
                    // OLD FORMAT: Migration from old data where domain contained everything
                    // Treat existing domain as custom domain (template values are in _templateConfig)
                    step.search._customDomain = [...step.search.domain];
                    
                    if (step._ui_metadata?.domain_types) {
                        step.search._customDomain = step.search._customDomain.map((condition, idx) => {
                            const fieldType = step._ui_metadata.domain_types[idx] || 'text';
                            const value = typeof condition[2] === 'string' ? condition[2].trim() : condition[2];
                            return [condition[0], condition[1], value, fieldType];
                        });
                    } else {
                        step.search._customDomain = step.search._customDomain.map(condition => {
                            if (condition.length === 3) {
                                return [...condition, 'text'];
                            }
                            return condition;
                        });
                    }
                } else {
                    // No custom domain
                    if (!step.search) step.search = {};
                    step.search._customDomain = [];
                }
                
                // Clean update field values
                if (step.update?.fields) {
                    Object.keys(step.update.fields).forEach(key => {
                        const value = step.update.fields[key];
                        if (typeof value === 'string') {
                            step.update.fields[key] = value.trim();
                        }
                    });
                }
                
                // Clean create field values
                if (step.create) {
                    Object.keys(step.create).forEach(key => {
                        const value = step.create[key];
                        if (typeof value === 'string') {
                            step.create[key] = value.trim();
                        }
                    });
                }
            });
            
            expandedValueMappings = {};
            
            const formName = data.name || formId;
            const escapedFormName = escapeHtml(data.name || '');
            const escapedFormId = escapeHtml(formId);
            const webhookUrl = `https://forminator-sync.openvme-odoo.workers.dev/?action=receive_forminator&token=openvmeform`;
            const escapedWebhookUrl = escapeHtml(webhookUrl);
            document.getElementById('editorTitle').textContent = `Edit: ${formName}`;
            document.getElementById('editorContent').innerHTML = `
                <!-- Form Details Card -->
                <div class="card bg-base-100 shadow-sm mb-4">
                    <div class="card-body">
                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div class="form-control">
                                <label class="label"><span class="label-text font-semibold">Form Name</span></label>
                                <input type="text" id="formName" value="${escapedFormName}" placeholder="Enter a display name" class="input input-bordered" onchange="updateFormName()">
                            </div>
                            <div class="form-control">
                                <label class="label"><span class="label-text font-semibold">Forminator Form ID</span></label>
                                <input type="text" id="formId" value="${escapedFormId}" readonly class="input input-bordered input-disabled" title="Form ID cannot be changed">
                            </div>
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text font-semibold">Webhook URL</span>
                                <span class="label-text-alt">Gebruik deze URL in Forminator webhook instellingen</span>
                            </label>
                            <div class="join w-full">
                                <input type="text" value="${escapedWebhookUrl}" readonly class="input input-bordered join-item flex-1 font-mono text-sm">
                                <button class="btn btn-primary join-item" onclick="copyWebhookUrl('${escapedWebhookUrl}')">
                                    📋 Kopieer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- DaisyUI Radio Tabs Lifted with Tab Content -->
                <div role="tablist" class="tabs tabs-lifted">
                    <input type="radio" name="main_tabs" role="tab" class="tab whitespace-nowrap" aria-label="📋 Mapping" checked="checked" />
                    <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6 w-full">
                        <h3 class="text-lg font-bold mb-3">Field Mapping & Value Mapping</h3>
                        <div id="fieldMapping" class="space-y-2"></div>
                        <button class="btn btn-primary btn-sm mt-3" onclick="addFieldRow()">+ Add Field</button>
                    </div>
                    
                    <input type="radio" name="main_tabs" role="tab" class="tab whitespace-nowrap" aria-label="⚙️ Workflow" />
                    <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6 w-full">
                        <h3 class="text-lg font-bold mb-3">Workflow Steps</h3>
                        <div id="workflowSteps"></div>
                        <button class="btn btn-success btn-sm mt-3" onclick="addWorkflowStep()">+ Add Workflow Step</button>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="flex gap-2 mt-4">
                    <button class="btn btn-primary" onclick="saveForm()">Save Changes</button>
                    <button class="btn btn-outline" onclick="exportForm()">Export JSON</button>
                    <button class="btn btn-error btn-outline" onclick="deleteForm()">Delete Form</button>
                </div>
            `;
            
            renderFieldMapping();
            renderWorkflowSteps();
            updateFieldPalette();
            initializeDragAndDrop();
        }
        
        // Field Mapping with Inline Value Mapping
        function renderFieldMapping() {
            const container = document.getElementById('fieldMapping');
            container.innerHTML = '';
            
            Object.entries(fieldMapping).forEach(([formField, odooField]) => {
                const containerDiv = document.createElement('div');
                containerDiv.className = 'collapse collapse-arrow bg-base-200 mb-2';
                containerDiv.dataset.field = formField;
                
                const rowDiv = document.createElement('div');
                rowDiv.className = 'flex gap-2 items-center p-3';
                rowDiv.innerHTML = `
                    <input type="text" value="${formField}" data-type="key" class="input input-bordered input-sm flex-1" onchange="updateFieldKey('${formField}', this.value)">
                    <span class="text-base-content/50">→</span>
                    <input type="text" value="${odooField}" data-type="value" class="input input-bordered input-sm flex-1" onchange="updateFieldValue('${formField}', this.value)">
                    <button class="btn btn-sm btn-primary" onclick="toggleValueMapping('${formField}')">⚙️</button>
                    <button class="btn btn-sm btn-error btn-circle" onclick="deleteField('${formField}')">×</button>
                `;
                
                containerDiv.appendChild(rowDiv);
                
                // Add inline value mapping section
                const valueMappingDiv = document.createElement('div');
                valueMappingDiv.className = 'bg-base-200 p-4';
                valueMappingDiv.id = `value-mapping-${formField}`;
                
                // Auto-expand if value mappings exist
                const hasValueMappings = valueMapping[formField] && Object.keys(valueMapping[formField]).some(k => !k.startsWith('_'));
                if (hasValueMappings) {
                    expandedValueMappings[formField] = true;
                }
                valueMappingDiv.style.display = expandedValueMappings[formField] ? 'block' : 'none';
                valueMappingDiv.innerHTML = `
                    <div class="divider text-sm">Value Mapping for "${formField}"</div>
                    <div class="form-control mb-3">
                        <label class="label cursor-pointer justify-start gap-2">
                            <input type="checkbox" class="checkbox checkbox-sm" onchange="toggleSkip('${formField}', this.checked)" 
                                ${valueMapping[formField]?._skip ? 'checked' : ''}>
                            <span class="label-text">Skip unmapped values</span>
                        </label>
                        <div class="ml-6 mt-2" id="default-${formField}" style="display:${valueMapping[formField]?._skip ? 'none' : 'block'}">
                            <label class="label"><span class="label-text text-xs">Default value for unmapped:</span></label>
                            <input type="text" value="${valueMapping[formField]?._default || ''}" class="input input-bordered input-sm w-full" 
                                onchange="updateDefaultValue('${formField}', this.value)">
                        </div>
                    </div>
                    <div id="mappings-${formField}" class="space-y-1"></div>
                    <button class="btn btn-sm btn-outline mt-2" onclick="addValueMappingRow('${formField}')">+ Add Value Mapping</button>
                `;
                
                containerDiv.appendChild(valueMappingDiv);
                container.appendChild(containerDiv);
                
                // Always render value mapping rows (even if empty)
                renderValueMappingRows(formField);
            });
        }
        
        function renderValueMappingRows(formField) {
            const container = document.getElementById(`mappings-${formField}`);
            if (!container) return;
            
            container.innerHTML = '';
            const mappings = valueMapping[formField] || {};
            
            Object.entries(mappings).forEach(([key, value]) => {
                if (key.startsWith('_')) return; // Skip _skip, _default, _comment
                
                const row = document.createElement('div');
                row.className = 'flex gap-2 items-center';
                row.innerHTML = `
                    <input type="text" value="${key}" data-old-key="${key}" class="input input-bordered input-sm flex-1"
                        onchange="updateValueMappingKey('${formField}', this.dataset.oldKey, this.value)">
                    <span class="text-base-content/50">→</span>
                    <input type="text" value="${value}" class="input input-bordered input-sm flex-1"
                        onchange="updateValueMappingValue('${formField}', '${key}', this.value)">
                    <button class="btn btn-sm btn-error btn-circle" onclick="deleteValueMappingRow('${formField}', '${key}')">×</button>
                `;
                container.appendChild(row);
            });
        }
        
        function toggleValueMapping(formField) {
            expandedValueMappings[formField] = !expandedValueMappings[formField];
            const element = document.getElementById(`value-mapping-${formField}`);
            element.style.display = expandedValueMappings[formField] ? 'block' : 'none';
        }
        
        function toggleSkip(formField, checked) {
            if (!valueMapping[formField]) valueMapping[formField] = {};
            
            if (checked) {
                valueMapping[formField]._skip = true;
                delete valueMapping[formField]._default;
                document.getElementById(`default-${formField}`).style.display = 'none';
            } else {
                delete valueMapping[formField]._skip;
                document.getElementById(`default-${formField}`).style.display = 'block';
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
            updateFieldPalette();
        }
        
        function deleteField(key) {
            delete fieldMapping[key];
            delete valueMapping[key];
            renderFieldMapping();
            updateFieldPalette();
        }
        
        function addFieldRow() {
            // Add empty row directly - user can fill it in
            const tempKey = `field_${Date.now()}`;
            fieldMapping[tempKey] = '';
            renderFieldMapping();
            updateFieldPalette();
            
            // Focus on the first input of the new row
            setTimeout(() => {
                const container = document.getElementById('fieldMapping');
                const lastRow = container.lastElementChild;
                if (lastRow) {
                    const firstInput = lastRow.querySelector('input[data-type="key"]');
                    if (firstInput) {
                        firstInput.select();
                    }
                }
            }, 0);
        }
        
        // Field Palette for Drag & Drop
        function updateFieldPalette(currentStepIdx = null) {
            const palette = document.getElementById('fieldPaletteContent');
            palette.innerHTML = '';
            
            // Form fields section
            const formFieldsSection = document.createElement('div');
            const formFieldsHeader = document.createElement('div');
            formFieldsHeader.className = 'text-xs font-semibold mb-2 text-base-content/60 uppercase';
            formFieldsHeader.textContent = 'Form Fields';
            formFieldsSection.appendChild(formFieldsHeader);
            
            const formFieldsContainer = document.createElement('div');
            formFieldsContainer.className = 'flex flex-wrap gap-2';
            
            Object.entries(fieldMapping).forEach(([formField, odooField]) => {
                const chip = document.createElement('div');
                chip.className = 'badge badge-primary badge-sm';
                chip.textContent = odooField;
                chip.title = `Forminator: ${formField}`;
                chip.draggable = true;
                chip.dataset.field = odooField;
                chip.dataset.formfield = formField;
                chip.dataset.chipType = 'field';
                chip.addEventListener('dragstart', handleDragStart);
                chip.addEventListener('dragend', handleDragEnd);
                formFieldsContainer.appendChild(chip);
            });
            
            formFieldsSection.appendChild(formFieldsContainer);
            palette.appendChild(formFieldsSection);
            
            // Step results section (only show steps before current step)
            const availableSteps = currentStepIdx !== null 
                ? workflowSteps.slice(0, currentStepIdx)
                : workflowSteps;
            
            if (availableSteps.some(s => s.step)) {
                const stepResultsSection = document.createElement('div');
                stepResultsSection.className = 'mt-4';
                
                const stepResultsHeader = document.createElement('div');
                stepResultsHeader.className = 'text-xs font-semibold mb-2 text-base-content/60 uppercase';
                stepResultsHeader.textContent = 'Step Results';
                stepResultsSection.appendChild(stepResultsHeader);
                
                const stepResultsContainer = document.createElement('div');
                stepResultsContainer.className = 'flex flex-wrap gap-2';
                
                availableSteps.forEach((step, idx) => {
                    if (!step.step) return;
                    
                    const fields = step.search?.fields || ['id'];
                    fields.forEach(field => {
                        const chip = document.createElement('div');
                        chip.className = 'badge badge-secondary badge-sm';
                        chip.textContent = `${step.step} ${field}`;
                        chip.title = `Step ${idx + 1}: ${step.model}`;
                        chip.draggable = true;
                        chip.dataset.field = `${step.step}.${field}`;
                        chip.dataset.stepRef = 'true';
                        chip.dataset.chipType = 'step';
                        chip.addEventListener('dragstart', handleDragStart);
                        chip.addEventListener('dragend', handleDragEnd);
                        stepResultsContainer.appendChild(chip);
                    });
                });
                
                stepResultsSection.appendChild(stepResultsContainer);
                palette.appendChild(stepResultsSection);
            }
        }
        
        function handleDragStart(e) {
            if (!e.target.dataset || !e.target.dataset.field) {
                console.warn('Drag started on element without data-field:', e.target);
                return;
            }
            draggedFieldName = e.target.dataset.field;
            e.target.classList.add('opacity-50');
            e.dataTransfer.effectAllowed = 'copy';
        }
        
        function handleDragEnd(e) {
            if (e.target && e.target.classList) {
                e.target.classList.remove('opacity-50');
            }
        }
        
        function initializeDragAndDrop() {
            document.querySelectorAll('.value-row input[type="text"], .value-row textarea').forEach(convertToChipInput);
        }
        
        function convertToChipInput(originalInput) {
            // Skip if already converted
            if (originalInput.hasAttribute('data-chip-converted')) {
                return;
            }
            originalInput.setAttribute('data-chip-converted', 'true');
            
            // Store original value
            const originalValue = originalInput.value || '';
            const placeholder = originalInput.placeholder || '';
            
            // Create wrapper with relative positioning and inherit width
            const wrapper = document.createElement('div');
            wrapper.className = 'relative';
            // Copy width styling from original input
            if (originalInput.style.width) {
                wrapper.style.width = originalInput.style.width;
            }
            if (originalInput.className.includes('flex-1')) {
                wrapper.classList.add('flex-1');
            }
            
            // Create contenteditable div styled as DaisyUI input
            const chipInput = document.createElement('div');
            chipInput.className = 'input input-sm input-bordered flex flex-wrap items-center gap-1 h-auto min-h-[2rem] focus-within:input-accent leading-tight w-full';
            chipInput.contentEditable = 'true';
            
            // Create placeholder span
            const placeholderSpan = document.createElement('span');
            placeholderSpan.className = 'absolute top-2 left-3 pointer-events-none opacity-50 text-sm leading-tight';
            placeholderSpan.textContent = placeholder || 'Typ een waarde of sleep een veld hiernaartoe';
            
            wrapper.appendChild(chipInput);
            wrapper.appendChild(placeholderSpan);
            
            // Create hidden input to store actual value
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = originalInput.name || '';
            hiddenInput.value = originalValue;
            
            // Copy event handlers
            const changeHandler = originalInput.getAttribute('onchange');
            if (changeHandler) {
                hiddenInput.setAttribute('onchange', changeHandler);
            }
            
            // Replace original input
            originalInput.parentNode.insertBefore(wrapper, originalInput);
            originalInput.parentNode.insertBefore(hiddenInput, originalInput);
            originalInput.remove();
            
            // Store references
            chipInput._hiddenInput = hiddenInput;
            chipInput._placeholder = placeholderSpan;
            
            // Parse and render initial value
            if (originalValue) {
                renderMixedContent(originalValue);
            }
            
            // Update placeholder visibility
            updatePlaceholder();
            
            function updatePlaceholder() {
                const isEmpty = chipInput.textContent.trim() === '' && chipInput.querySelectorAll('[data-field]').length === 0;
                if (placeholderSpan) {
                    placeholderSpan.style.display = isEmpty ? 'block' : 'none';
                }
            }
            
            function renderMixedContent(value) {
                chipInput.innerHTML = '';
                
                // Find all placeholders (both types)
                const fieldPattern = /\$\{(?:field\.)?([a-zA-Z0-9_]+)\}/g;
                const stepPattern = /\$([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/g;
                
                const matches = [];
                let match;
                
                while ((match = fieldPattern.exec(value)) !== null) {
                    matches.push({
                        type: 'field',
                        value: match[1],
                        start: match.index,
                        end: match.index + match[0].length
                    });
                }
                
                fieldPattern.lastIndex = 0;
                while ((match = stepPattern.exec(value)) !== null) {
                    matches.push({
                        type: 'step',
                        value: match[1] + '.' + match[2],
                        start: match.index,
                        end: match.index + match[0].length
                    });
                }
                
                // Sort by position
                matches.sort((a, b) => a.start - b.start);
                
                // Build content with text and chips
                let lastIndex = 0;
                matches.forEach(m => {
                    // Add text before chip
                    if (m.start > lastIndex) {
                        chipInput.appendChild(document.createTextNode(value.substring(lastIndex, m.start)));
                    }
                    // Add chip
                    chipInput.appendChild(createBadge(m.value, m.type));
                    lastIndex = m.end;
                });
                
                // Add remaining text
                if (lastIndex < value.length) {
                    chipInput.appendChild(document.createTextNode(value.substring(lastIndex)));
                }
            }
            
            function createBadge(fieldName, chipType) {
                const isStep = chipType === 'step';
                const badge = document.createElement('span');
                badge.className = isStep ? 'badge badge-secondary badge-sm gap-1 cursor-move' : 'badge badge-primary badge-sm gap-1 cursor-move';
                badge.contentEditable = 'false';
                badge.draggable = true;
                badge.setAttribute('data-field', fieldName);
                badge.setAttribute('data-chip-type', chipType);
                badge.textContent = fieldName;
                
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'btn btn-ghost btn-xs btn-circle p-0';
                removeBtn.textContent = '×';
                removeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    badge.remove();
                    updatePlaceholder();
                    serializeValue();
                };
                
                badge.appendChild(removeBtn);
                
                // Drag event for moving chips
                badge.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    badge.classList.add('opacity-50');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', fieldName);
                    badge._isMoving = true;
                });
                
                badge.addEventListener('dragend', (e) => {
                    badge.classList.remove('opacity-50');
                    badge._isMoving = false;
                });
                
                return badge;
            }
            
            function serializeValue() {
                let value = '';
                
                const walk = (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        value += node.textContent;
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.hasAttribute('data-field')) {
                            const fieldName = node.getAttribute('data-field');
                            const chipType = node.getAttribute('data-chip-type');
                            if (chipType === 'step') {
                                value += '$' + fieldName;
                            } else {
                                value += '${field.' + fieldName + '}';
                            }
                        } else {
                            // Walk children for other elements
                            Array.from(node.childNodes).forEach(walk);
                        }
                    }
                };
                
                Array.from(chipInput.childNodes).forEach(walk);
                
                hiddenInput.value = value;
                updatePlaceholder();
            }
            
            // Event listeners
            chipInput.addEventListener('input', () => {
                serializeValue();
            });
            
            chipInput.addEventListener('blur', () => {
                serializeValue();
                if (changeHandler) {
                    hiddenInput.dispatchEvent(new Event('change'));
                }
            });
            
            // Drag and drop support
            chipInput.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                chipInput.classList.add('input-accent');
            });
            
            chipInput.addEventListener('dragleave', function(e) {
                if (!chipInput.contains(e.relatedTarget)) {
                    chipInput.classList.remove('input-accent');
                }
            });
            
            chipInput.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                chipInput.classList.remove('input-accent');
                
                // Check if we're moving an existing chip
                const movingChip = Array.from(chipInput.querySelectorAll('[data-field]')).find(c => c._isMoving);
                
                let badge;
                if (movingChip) {
                    // Moving existing chip
                    badge = movingChip;
                } else if (draggedFieldName) {
                    // Adding new chip from palette
                    const chipType = draggedFieldName.includes('.') ? 'step' : 'field';
                    badge = createBadge(draggedFieldName, chipType);
                }
                
                if (badge) {
                    // Get cursor position
                    let range;
                    if (document.caretPositionFromPoint) {
                        const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                        if (pos) {
                            range = document.createRange();
                            range.setStart(pos.offsetNode, pos.offset);
                        }
                    } else if (document.caretRangeFromPoint) {
                        range = document.caretRangeFromPoint(e.clientX, e.clientY);
                    }
                    
                    if (range && chipInput.contains(range.startContainer)) {
                        // Remove chip from old position if moving
                        if (movingChip && badge.parentNode) {
                            badge.remove();
                        }
                        
                        // Insert at cursor position
                        if (range.startContainer.nodeType === Node.TEXT_NODE) {
                            const textNode = range.startContainer;
                            const offset = range.startOffset;
                            
                            if (offset > 0 && offset < textNode.length) {
                                const afterText = textNode.splitText(offset);
                                textNode.parentNode.insertBefore(badge, afterText);
                                textNode.parentNode.insertBefore(document.createTextNode(' '), afterText);
                            } else if (offset === 0) {
                                textNode.parentNode.insertBefore(badge, textNode);
                                textNode.parentNode.insertBefore(document.createTextNode(' '), textNode);
                            } else {
                                textNode.parentNode.insertBefore(badge, textNode.nextSibling);
                                textNode.parentNode.insertBefore(document.createTextNode(' '), textNode.nextSibling);
                            }
                        } else {
                            range.insertNode(badge);
                            badge.parentNode.insertBefore(document.createTextNode(' '), badge.nextSibling);
                        }
                    } else if (!movingChip) {
                        // Fallback: append at end
                        chipInput.appendChild(badge);
                        chipInput.appendChild(document.createTextNode(' '));
                    }
                    
                    serializeValue();
                    chipInput.focus();
                }
            });
            
            chipInput.addEventListener('dragenter', function(e) {
                e.preventDefault();
            });
        }
        
        function renderChipContent(chipInput, value, placeholder = null) {
            // Get placeholder from parameter or stored reference
            const placeholderElement = placeholder || chipInput._placeholder;
            chipInput.innerHTML = '';
            
            if (!value) {
                if (placeholderElement) placeholderElement.style.display = 'block';
                return;
            }
            
            if (placeholderElement) placeholderElement.style.display = 'none';
            
            // Parse value and create chips and text nodes
            // Match both field.xxx and xxx for form fields, and stepname.field for step references
            const fieldPattern = new RegExp('\\$\\\{(?:field\.)?([a-zA-Z0-9_]+)\\\}', 'g');
            const stepPattern = new RegExp('\\$([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)', 'g');
            
            // Combine both patterns to find all placeholders in order
            const allMatches = [];
            
            // Find all field matches
            let match;
            while ((match = fieldPattern.exec(value)) !== null) {
                allMatches.push({
                    type: 'field',
                    index: match.index,
                    length: match[0].length,
                    fieldName: match[1],
                    fullMatch: match[0]
                });
            }
            
            // Find all step reference matches
            stepPattern.lastIndex = 0;
            while ((match = stepPattern.exec(value)) !== null) {
                allMatches.push({
                    type: 'step',
                    index: match.index,
                    length: match[0].length,
                    fieldName: match[1] + '.' + match[2],
                    fullMatch: match[0]
                });
            }
            
            // Sort by position
            allMatches.sort((a, b) => a.index - b.index);
            
            let lastIndex = 0;
            allMatches.forEach(matchInfo => {
                // Add text before chip
                if (matchInfo.index > lastIndex) {
                    const textBefore = value.substring(lastIndex, matchInfo.index);
                    if (textBefore) {
                        chipInput.appendChild(document.createTextNode(textBefore));
                    }
                }
                
                // Add chip
                const chip = createFieldChip(matchInfo.fieldName, matchInfo.type);
                chipInput.appendChild(chip);
                
                lastIndex = matchInfo.index + matchInfo.length;
            });
            
            // Add remaining text
            if (lastIndex < value.length) {
                const textAfter = value.substring(lastIndex);
                if (textAfter) {
                    chipInput.appendChild(document.createTextNode(textAfter));
                }
            }
            
            // Update placeholder visibility after rendering content
            if (placeholderElement) {
                const hasVisibleContent = Array.from(chipInput.childNodes).some(node => {
                    if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim().length > 0;
                    return node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute('data-field');
                });
                placeholderElement.style.display = hasVisibleContent ? 'none' : 'block';
            }
        }
        
        function createFieldChip(fieldName, chipType = 'field', isDraggableWithin = true) {
            const chip = document.createElement('span');
            const isStepChip = chipType === 'step' || fieldName.includes('.');
            chip.className = isStepChip ? 'badge badge-secondary badge-sm' : 'badge badge-primary badge-sm';
            chip.contentEditable = 'false';
            chip.setAttribute('data-field', fieldName);
            chip.setAttribute('data-chip-type', isStepChip ? 'step' : 'field');
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
            
            const remove = document.createElement('button');
            remove.className = 'btn btn-xs btn-ghost btn-circle p-0 ml-1';
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
                
                // Match both field patterns and step references
                const fieldPattern = new RegExp('\\$\\\{(?:field\.)?([a-zA-Z0-9_]+)\\\}', 'g');
                const stepPattern = new RegExp('\\$([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)', 'g');
                
                // Find all matches
                const allMatches = [];
                let match;
                
                while ((match = fieldPattern.exec(text)) !== null) {
                    allMatches.push({
                        type: 'field',
                        index: match.index,
                        length: match[0].length,
                        fieldName: match[1]
                    });
                }
                
                stepPattern.lastIndex = 0;
                while ((match = stepPattern.exec(text)) !== null) {
                    allMatches.push({
                        type: 'step',
                        index: match.index,
                        length: match[0].length,
                        fieldName: match[1] + '.' + match[2]
                    });
                }
                
                if (allMatches.length > 0) {
                    // Sort by position
                    allMatches.sort((a, b) => a.index - b.index);
                    
                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;
                    
                    allMatches.forEach(matchInfo => {
                        if (matchInfo.index > lastIndex) {
                            fragment.appendChild(
                                document.createTextNode(text.substring(lastIndex, matchInfo.index))
                            );
                        }
                        fragment.appendChild(createFieldChip(matchInfo.fieldName, matchInfo.type));
                        lastIndex = matchInfo.index + matchInfo.length;
                    });
                    
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
            
            // Get placeholder from stored reference
            const placeholder = chipInput._placeholder;
            
            let value = '';
            let hasContent = false;
            chipInput.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent.trim();
                    if (text) hasContent = true;
                    value += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute('data-field')) {
                    // Check if it's a chip by looking for data-field attribute (more reliable than class names)
                    hasContent = true;
                    const fieldName = node.getAttribute('data-field');
                    const chipType = node.getAttribute('data-chip-type');
                    
                    if (chipType === 'step' || fieldName.includes('.')) {
                        // Step reference
                        value += '$' + fieldName;
                    } else {
                        // Form field
                        value += '$' + '{' + 'field.' + fieldName + '}';
                    }
                }
            });
            
            // Trim leading and trailing whitespace
            hiddenInput.value = value.trim();
            
            // Toggle placeholder visibility
            if (placeholder) {
                placeholder.style.display = hasContent ? 'none' : 'block';
            }
        }
        
        function handleChipDrop(e, chipInput, hiddenInput) {
            e.preventDefault();
            e.stopPropagation();
            chipInput.classList.remove('!border-primary', 'bg-primary/10');
            
            // Get placeholder from stored reference
            const placeholder = chipInput._placeholder;
            
            // Check if we're moving an existing chip within this input
            const movingChip = Array.from(chipInput.querySelectorAll('[data-field]')).find(c => c._isMoving);
            
            let chip;
            if (movingChip) {
                // Moving existing chip
                chip = movingChip;
                chip.remove(); // Remove from current position
            } else if (draggedFieldName) {
                // Adding new chip from palette - determine type by checking if it's a step reference
                const chipType = draggedFieldName.includes('.') ? 'step' : 'field';
                chip = createFieldChip(draggedFieldName, chipType);
            } else {
                return;
            }
            
            // Find the drop position using caret position from mouse coordinates
            let dropRange;
            if (document.caretPositionFromPoint) {
                const position = document.caretPositionFromPoint(e.clientX, e.clientY);
                if (position) {
                    dropRange = document.createRange();
                    dropRange.setStart(position.offsetNode, position.offset);
                }
            } else if (document.caretRangeFromPoint) {
                dropRange = document.caretRangeFromPoint(e.clientX, e.clientY);
            }
            
            // Insert the chip at the cursor position
            if (dropRange && dropRange.startContainer) {
                // If we're in a text node, split it at the cursor position
                if (dropRange.startContainer.nodeType === Node.TEXT_NODE) {
                    const textNode = dropRange.startContainer;
                    const offset = dropRange.startOffset;
                    
                    // Split the text node if we're in the middle
                    if (offset > 0 && offset < textNode.length) {
                        const afterText = textNode.splitText(offset);
                        textNode.parentNode.insertBefore(chip, afterText);
                    } else if (offset === 0) {
                        textNode.parentNode.insertBefore(chip, textNode);
                    } else {
                        textNode.parentNode.insertBefore(chip, textNode.nextSibling);
                    }
                } else {
                    // Insert at the specified container and offset
                    const container = dropRange.startContainer === chipInput ? chipInput : dropRange.startContainer.parentNode;
                    if (container === chipInput || chipInput.contains(container)) {
                        if (dropRange.startOffset < container.childNodes.length) {
                            container.insertBefore(chip, container.childNodes[dropRange.startOffset]);
                        } else {
                            container.appendChild(chip);
                        }
                    } else {
                        chipInput.appendChild(chip);
                    }
                }
            } else {
                // Fallback: append at the end
                chipInput.appendChild(chip);
            }
            
            // Ensure there's a text node after the chip for cursor placement
            let textNodeAfter = chip.nextSibling;
            if (!textNodeAfter || textNodeAfter.nodeType !== Node.TEXT_NODE) {
                textNodeAfter = document.createTextNode(' ');
                chipInput.insertBefore(textNodeAfter, chip.nextSibling);
            }
            
            // Hide placeholder immediately when chip is added
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            
            // Force update placeholder visibility
            updateHiddenValue(chipInput, hiddenInput);
            
            // Trigger change event
            hiddenInput.dispatchEvent(new Event('change'));
            
            // Set cursor after the chip with a small delay to let DOM update
            setTimeout(() => {
                chipInput.focus();
                const selection = window.getSelection();
                const cursorRange = document.createRange();
                try {
                    // Ensure text node still exists and set cursor at the start of it
                    const targetNode = textNodeAfter.nodeType === Node.TEXT_NODE ? textNodeAfter : chipInput;
                    const offset = targetNode === chipInput ? 0 : 0;
                    cursorRange.setStart(targetNode, offset);
                    cursorRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(cursorRange);
                } catch (e) {
                    // Fallback: just focus the input
                    console.warn('Could not set cursor position:', e);
                }
            }, 10);
        }
        
        function makeDropZone(element) {
            element.addEventListener('dragover', handleDragOver);
            element.addEventListener('dragleave', handleDragLeave);
            element.addEventListener('drop', handleDrop);
        }
        
        function makeEmptyDropZone(element, type, stepIdx) {
            element.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                element.classList.add('!border-primary', 'bg-primary/10', 'text-primary');
            });
            
            element.addEventListener('dragleave', (e) => {
                if (e.target === element) {
                    element.classList.remove('!border-primary', 'bg-primary/10', 'text-primary');
                }
            });
            
            element.addEventListener('drop', (e) => {
                e.preventDefault();
                element.classList.remove('!border-primary', 'bg-primary/10', 'text-primary');
                
                if (!draggedFieldName) {
                    return;
                }
                
                if (type === 'domain') {
                    if (!workflowSteps[stepIdx].search._customDomain) workflowSteps[stepIdx].search._customDomain = [];
                    workflowSteps[stepIdx].search._customDomain.push([draggedFieldName, '=', '', 'text']);
                    renderDomain(stepIdx, workflowSteps[stepIdx].search._customDomain);
                } else if (type === 'fields') {
                    if (!workflowSteps[stepIdx].search.fields) workflowSteps[stepIdx].search.fields = [];
                    workflowSteps[stepIdx].search.fields.push(draggedFieldName);
                    renderSearchFields(stepIdx, workflowSteps[stepIdx].search.fields);
                } else if (type === 'create') {
                    if (!workflowSteps[stepIdx].create) workflowSteps[stepIdx].create = {};
                    workflowSteps[stepIdx].create[draggedFieldName] = '$' + '{field.' + draggedFieldName + '}';
                    renderCreateValues(stepIdx, workflowSteps[stepIdx].create);
                } else if (type === 'update') {
                    if (!workflowSteps[stepIdx].update.fields) workflowSteps[stepIdx].update.fields = {};
                    workflowSteps[stepIdx].update.fields[draggedFieldName] = '$' + '{field.' + draggedFieldName + '}';
                    console.log('Added field to update:', draggedFieldName, 'Step:', stepIdx, 'Update object:', workflowSteps[stepIdx].update);
                    renderUpdateValues(stepIdx, workflowSteps[stepIdx].update);
                }
            });
        }
        
        function handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (!e.target.classList.contains('border-primary')) {
                e.target.classList.add('!border-primary', 'bg-primary/10');
            }
        }
        
        function handleDragLeave(e) {
            // Only remove if we're actually leaving the element
            if (e.target === e.currentTarget) {
                e.target.classList.remove('!border-primary', 'bg-primary/10');
            }
        }
        
        function handleDrop(e) {
            e.preventDefault();
            e.target.classList.remove('!border-primary', 'bg-primary/10');
            
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
        
        // Workflow Steps
        function renderWorkflowSteps() {
            const container = document.getElementById('workflowSteps');
            container.innerHTML = '';
            
            workflowSteps.forEach((step, idx) => {
                const stepEl = document.createElement('div');
                stepEl.className = 'workflow-step collapsed';
                stepEl.dataset.index = idx;
                
                const resultBadge = step.step ? `<div class="badge badge-accent">$${step.step}</div>` : '';
                
                stepEl.innerHTML = `
                    <div class="collapse collapse-arrow bg-base-100 shadow mb-4">
                        <input type="checkbox" id="step-toggle-${idx}" checked /> 
                        <div class="collapse-title p-4 min-h-0">
                            <div class="flex items-center justify-between pr-8">
                                <h3 class="text-base font-semibold">Step: ${step.step || '(unnamed)'} - Model: ${step.model || '(no model)'}</h3>
                                <div class="flex gap-2 shrink-0">
                                    ${resultBadge}
                                    <button class="btn btn-sm btn-ghost btn-square" onclick="deleteStep(${idx}); event.stopPropagation();">×</button>
                                </div>
                            </div>
                        </div>
                        <div class="collapse-content p-4 pt-0">
                                <div class="grid grid-cols-2 gap-3 mb-4">
                                    <div class="form-control">
                                        <label class="label py-1"><span class="label-text">Step Name:</span></label>
                                        <input type="text" class="input input-sm input-bordered" value="${step.step || ''}" onchange="updateStepBasic(${idx}, 'step', this.value)">
                                    </div>
                                    <div class="form-control">
                                        <label class="label py-1"><span class="label-text">Odoo Model:</span></label>
                                        <select class="select select-sm select-bordered" onchange="updateStepModel(${idx}, this.value)">
                                            <option value="">Selecteer model...</option>
                                            ${Object.entries(ODOO_MODELS).map(([key, config]) => `
                                                <option value="${key}" ${step.model === key ? 'selected' : ''}>${config.name}</option>
                                            `).join('')}
                                        </select>
                                        ${step.model && !ODOO_MODELS[step.model] ? `<input type="text" class="input input-sm input-bordered mt-1" value="${step.model}" onchange="updateStepBasic(${idx}, 'model', this.value)" placeholder="Custom model naam">` : ''}
                                    </div>
                                </div>
                                ${step.model && ODOO_MODELS[step.model] && ODOO_MODELS[step.model].description ? `
                                <div class="alert alert-info py-2 text-xs mb-3">
                                    ℹ️ ${ODOO_MODELS[step.model].description}
                                </div>
                                ` : ''}
                        
                        <div class="collapse collapse-arrow bg-base-200 mb-2">
                            <input type="checkbox" ${(step.search?.domain?.length > 0 || step.search?.fields?.length > 0) ? 'checked' : ''} /> 
                            <div class="collapse-title text-sm font-medium">
                                🔍 Search
                            </div>
                            <div class="collapse-content">
                                ${renderSearchTemplate(idx, step)}
                            </div>
                        </div>
                        
                        <div class="collapse collapse-arrow bg-base-200 mb-2">
                            <input type="checkbox" ${(step.create && Object.keys(step.create).length > 0) ? 'checked' : ''} /> 
                            <div class="collapse-title text-sm font-medium">
                                ➕ Create
                            </div>
                            <div class="collapse-content">
                                <div id="create-${idx}" class="space-y-2"></div>
                                <button class="btn btn-sm btn-outline mt-2" onclick="addCreateValue(${idx})">+ Add Value</button>
                            </div>
                        </div>
                        
                        <div class="collapse collapse-arrow bg-base-200 mb-2">
                            <input type="checkbox" ${(step.update?.fields && Object.keys(step.update.fields).length > 0) ? 'checked' : ''} /> 
                            <div class="collapse-title text-sm font-medium">
                                ✏️ Update
                            </div>
                            <div class="collapse-content">
                                <div id="update-${idx}" class="space-y-2"></div>
                                <button class="btn btn-sm btn-outline mt-2" onclick="addUpdateValue(${idx})">+ Add Value</button>
                            </div>
                        </div>
                        
                        <div class="collapse collapse-arrow bg-base-200 mb-2">
                            <input type="checkbox" ${step.html_card ? 'checked' : ''} /> 
                            <div class="collapse-title text-sm font-medium">
                                🎨 HTML Card
                            </div>
                            <div class="collapse-content">
                                <p class="text-sm text-base-content/70 mb-3">
                                    Build a custom HTML card/form with drag & drop field placeholders
                                </p>
                                <button class="btn btn-sm btn-primary mb-3" onclick="openHtmlCardEditor(${idx})">
                                    ${step.html_card ? '✏️ Edit HTML Card' : '➕ Create HTML Card'}
                                </button>
                                ${step.html_card ? '<div class="alert alert-success py-2"><strong>HTML Card configured</strong> - ' + (function(){try{const d=JSON.parse(step.html_card);return d.elements?d.elements.length+' elements':'1 element';}catch(e){return 'legacy format';}}()) + '</div>' : ''}
                            </div>
                        </div>
                        </div>
                    </div>
                `;
                container.appendChild(stepEl);
            });
            
            // Render sub-components after DOM is updated
            setTimeout(() => {
                workflowSteps.forEach((step, idx) => {
                    renderDomain(idx, step.search?._customDomain || []);
                    renderSearchFields(idx, step.search?.fields || []);
                    renderCreateValues(idx, step.create || {});
                    renderUpdateValues(idx, step.update || {});
                    renderStepResultChips(idx, step);
                });
            }, 0);
            
            // Re-initialize drag and drop for newly rendered elements
            initializeDragAndDrop();
        }
        
        function deleteStep(idx) {
            if (confirm('Delete this workflow step?')) {
                workflowSteps.splice(idx, 1);
                renderWorkflowSteps();
            }
        }
        
        function updateStepBasic(idx, field, value) {
            workflowSteps[idx][field] = value;
            const stepEl = document.querySelector(`.workflow-step[data-index="${idx}"]`);
            const header = stepEl?.querySelector('h3');
            if (header) {
                header.textContent = `Step: ${workflowSteps[idx].step || '(unnamed)'} - Model: ${workflowSteps[idx].model || '(no model)'}`;
            }
            
            // Update the result badge if step name changed
            if (field === 'step') {
                const badge = stepEl?.querySelector('.badge-accent');
                if (badge) {
                    badge.textContent = value ? `$${value}` : '';
                    badge.style.display = value ? '' : 'none';
                }
                renderStepResultChips(idx, workflowSteps[idx]);
                updateFieldPalette();
            }
        }
        
        function updateStepModel(idx, modelValue) {
            workflowSteps[idx].model = modelValue;
            
            // If model has templates, initialize with template
            if (modelValue && ODOO_MODELS[modelValue] && ODOO_MODELS[modelValue].searchTemplates) {
                const templates = ODOO_MODELS[modelValue].searchTemplates;
                const firstTemplate = Object.values(templates)[0];
                
                if (firstTemplate) {
                    // Initialize search with template defaults
                    workflowSteps[idx].search = workflowSteps[idx].search || {};
                    // Only set default fields if no fields exist yet
                    if (!workflowSteps[idx].search.fields || workflowSteps[idx].search.fields.length === 0) {
                        workflowSteps[idx].search.fields = [...(firstTemplate.defaultFields || [])];
                    }
                    workflowSteps[idx]._templateConfig = {
                        template: Object.keys(templates)[0],
                        values: {},
                        typeFilter: firstTemplate.typeFilter ? 'contact' : null
                    };
                }
            }
            
            renderWorkflowSteps();
        }
        
        function renderStepResultChips(idx, step) {
            const container = document.getElementById(`result-chips-${idx}`);
            if (!container) return;
            
            container.innerHTML = '';
            
            if (!step.step) {
                container.innerHTML = '<em style="color: #999;">Name the step first to enable result references</em>';
                return;
            }
            
            const fields = step.search?.fields || ['id'];
            fields.forEach(field => {
                const chipItem = document.createElement('div');
                chipItem.className = 'step-result-chip-item';
                chipItem.innerHTML = `
                    <span>$${step.step}.${field}</span>
                    <code>$${step.step}.${field}</code>
                `;
                container.appendChild(chipItem);
            });
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
        
        // Render search template or fallback to manual mode
        function renderSearchTemplate(idx, step) {
            const model = step.model;
            const modelConfig = ODOO_MODELS[model];
            
            // Fallback to manual mode if no model or custom model
            if (!model || !modelConfig || !modelConfig.searchTemplates || Object.keys(modelConfig.searchTemplates).length === 0) {
                return `
                    <div class="form-control mb-3">
                        <label class="label py-1"><span class="label-text font-medium">Domain Conditions:</span></label>
                        <div id="domain-${idx}" class="space-y-2"></div>
                        <button class="btn btn-sm btn-outline mt-2" onclick="addDomainRow(${idx})">+ Add Condition</button>
                    </div>
                    <div class="form-control">
                        <label class="label py-1"><span class="label-text font-medium">Fields to Retrieve:</span></label>
                        <div id="fields-${idx}" class="flex flex-wrap gap-1 mb-2"></div>
                        <div class="join join-horizontal w-full">
                            <input type="text" id="new-field-${idx}" placeholder="field_name" class="input input-sm input-bordered join-item flex-1">
                            <button class="btn btn-sm btn-outline join-item" onclick="addSearchField(${idx})">+ Add</button>
                        </div>
                    </div>
                `;
            }
            
            // Template mode - show all templates side by side
            const templateConfig = step._templateConfig || {};
            
            let html = `<div class="space-y-3">`;
            
            // Info text
            html += `
                <div class="text-xs text-base-content/70 mb-2">
                    Sleep velden naar de drop zones hieronder. Alleen ingevulde velden worden gebruikt voor zoeken.
                </div>
            `;
            
            // Render all templates in a grid
            html += `<div class="grid grid-cols-3 gap-3">`;
            
            Object.entries(modelConfig.searchTemplates).forEach(([templateKey, template]) => {
                const allFields = Object.entries(template.fields);
                const hasValues = allFields.some(([fieldKey]) => templateConfig.values?.[`${templateKey}_${fieldKey}`]);
                
                html += `
                    <div class="card bg-base-200 shadow-sm ${hasValues ? 'ring-2 ring-primary' : ''}">
                        <div class="card-body p-3">
                            <h4 class="card-title text-sm">${template.name}</h4>
                            <div class="space-y-2">
                `;
                
                allFields.forEach(([fieldKey, fieldConfig]) => {
                    const label = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.label;
                    const dropOnly = typeof fieldConfig === 'object' ? fieldConfig.dropOnly : false;
                    const currentValue = templateConfig.values?.[`${templateKey}_${fieldKey}`] || '';
                    
                    html += `
                        <div class="form-control">
                            <label class="label py-0 pb-1">
                                <span class="label-text text-xs">${label}</span>
                            </label>
                            ${dropOnly ? `
                                <div class="badge badge-outline badge-lg drop-zone w-full cursor-pointer h-8 justify-start px-2 text-xs border-dashed" 
                                     ondragover="handleDragOver(event)"
                                     ondragleave="handleDragLeave(event)"
                                     ondrop="handleTemplateFieldDrop(event, ${idx}, '${templateKey}_${fieldKey}')"
                                     onclick="clearTemplateField(${idx}, '${templateKey}_${fieldKey}')"
                                     title="Sleep een veld hierheen of klik om te wissen">
                                    ${currentValue ? `<span class="font-mono">${currentValue}</span>` : '<span class="text-base-content/40">Sleep veld hier 👆</span>'}
                                </div>
                            ` : `
                                <input 
                                    type="text" 
                                    class="input input-xs input-bordered" 
                                    value="${currentValue}"
                                    placeholder="$contact.id"
                                    onchange="updateTemplateValue(${idx}, '${templateKey}_${fieldKey}', this.value)"
                                >
                            `}
                        </div>
                    `;
                });
                
                html += `
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`; // Close grid
            
            // Type filter (contact/bedrijf) for res.partner
            const hasTypeFilter = Object.values(modelConfig.searchTemplates).some(t => t.typeFilter);
            if (hasTypeFilter) {
                const currentType = templateConfig.typeFilter || 'contact';
                html += `
                    <div class="bg-base-300 rounded-lg p-3 mb-2">
                        <div class="text-xs font-medium mb-2">🏢 Type filter</div>
                        <div class="btn-group w-full">
                            <input type="radio" name="type-${idx}" value="both" class="btn btn-sm flex-1" aria-label="Beide" ${currentType === 'both' ? 'checked' : ''} onchange="updateTemplateTypeFilter(${idx}, this.value)">
                            <input type="radio" name="type-${idx}" value="contact" class="btn btn-sm flex-1" aria-label="Contacten" ${currentType === 'contact' ? 'checked' : ''} onchange="updateTemplateTypeFilter(${idx}, this.value)">
                            <input type="radio" name="type-${idx}" value="company" class="btn btn-sm flex-1" aria-label="Bedrijven" ${currentType === 'company' ? 'checked' : ''} onchange="updateTemplateTypeFilter(${idx}, this.value)">
                        </div>
                    </div>
                `;
            }
            
            // Custom conditions section
            html += `
                <div class="collapse collapse-arrow bg-base-300">
                    <input type="checkbox" /> 
                    <div class="collapse-title text-xs font-medium py-2 min-h-0">
                        ➕ Aangepaste condities (optioneel)
                    </div>
                    <div class="collapse-content">
                        <div class="form-control mb-2">
                            <label class="label py-1"><span class="label-text text-xs">Extra domain condities:</span></label>
                            <div id="domain-${idx}" class="space-y-2"></div>
                            <button class="btn btn-xs btn-outline mt-2" onclick="addDomainRow(${idx})">+ Add Condition</button>
                        </div>
                    </div>
                </div>
            `;
            
            // Show generated domain preview
            const previewDomain = generateDomainFromTemplate(idx, step);
            const hasAnyValues = templateConfig.values && Object.values(templateConfig.values).some(v => v);
            const hasCustomConditions = step.search?._customDomain && step.search._customDomain.length > 0;
            const isSuccess = hasAnyValues || hasCustomConditions;
            
            html += `
                <div class="collapse collapse-arrow ${isSuccess ? 'bg-success' : 'bg-warning'} ${isSuccess ? 'text-success-content' : 'text-warning-content'}">
                    <input type="checkbox" checked /> 
                    <div class="collapse-title text-xs font-medium py-2 min-h-0">
                        📋 Generated domain (${previewDomain.length} conditions)
                    </div>
                    <div id="domain-preview-${idx}" class="collapse-content">
                        <pre class="text-[10px] overflow-x-auto whitespace-pre-wrap break-all">${JSON.stringify(previewDomain, null, 2)}</pre>
                        ${isSuccess ? '<div class="text-xs mt-1">✓ Klaar om op te slaan</div>' : '<div class="text-xs mt-1">⚠ Sleep velden naar de drop zones hierboven</div>'}
                    </div>
                </div>
            `;
            
            // Fields to retrieve
            html += `
                <div class="collapse collapse-arrow bg-base-300">
                    <input type="checkbox" ${(step.search?.fields && step.search.fields.length > 0) ? 'checked' : ''} /> 
                    <div class="collapse-title text-xs font-medium py-2 min-h-0">
                        🔍 Op te halen velden (${step.search?.fields?.length || 0})
                    </div>
                    <div class="collapse-content">
                        <div class="text-xs text-base-content/70 mb-2">Velden die worden opgehaald na zoeken in Odoo</div>
                        <div id="fields-${idx}" class="flex flex-wrap gap-1.5 min-h-[2rem] mb-3"></div>
                        <div class="join w-full">
                            <input id="new-field-${idx}" type="text" placeholder="Voeg veld toe..." class="input input-sm input-bordered join-item flex-1" onkeydown="if(event.key === 'Enter') addSearchField(${idx})">
                            <button class="btn btn-sm btn-primary join-item" onclick="addSearchField(${idx})">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Toevoegen
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            html += `</div>`;
            return html;
        }
        
        function generateDomainFromTemplate(idx, step) {
            const model = step.model;
            const modelConfig = ODOO_MODELS[model];
            if (!modelConfig || !modelConfig.searchTemplates) return step.search?._customDomain || [];
            
            const templateConfig = step._templateConfig || {};
            let combinedDomain = [];
            
            // Combine all templates that have values
            Object.entries(modelConfig.searchTemplates).forEach(([templateKey, template]) => {
                if (!template.buildDomain) return;
                
                // Extract values for this specific template
                const templateValues = {};
                Object.entries(templateConfig.values || {}).forEach(([key, value]) => {
                    if (key.startsWith(templateKey + '_') && value) {
                        const fieldKey = key.substring(templateKey.length + 1);
                        templateValues[fieldKey] = value;
                    }
                });
                
                // Only add domain if this template has values
                if (Object.keys(templateValues).length > 0) {
                    const domain = template.buildDomain(templateValues, templateConfig.typeFilter);
                    combinedDomain = combinedDomain.concat(domain);
                }
            });
            
            // Add custom domain conditions from separate storage (NOT step.search.domain)
            if (step.search?._customDomain && Array.isArray(step.search._customDomain)) {
                combinedDomain = combinedDomain.concat(step.search._customDomain);
            }
            
            return combinedDomain;
        }
        
        function updateSearchTemplate(idx, templateKey) {
            const modelConfig = ODOO_MODELS[workflowSteps[idx].model];
            const template = modelConfig.searchTemplates[templateKey];
            
            workflowSteps[idx]._templateConfig = {
                template: templateKey,
                values: {},
                typeFilter: template.typeFilter ? 'contact' : null
            };
            workflowSteps[idx].search.fields = template.defaultFields || [];
            
            renderWorkflowSteps();
        }
        
        function updateTemplateValue(idx, fieldKey, value) {
            if (!workflowSteps[idx]._templateConfig) {
                workflowSteps[idx]._templateConfig = { values: {} };
            }
            workflowSteps[idx]._templateConfig.values = workflowSteps[idx]._templateConfig.values || {};
            workflowSteps[idx]._templateConfig.values[fieldKey] = value;
            
            // Re-render to update preview (generateDomainFromTemplate will be called during render)
            renderWorkflowSteps();
            
            // Auto-save
            debouncedAutoSave();
        }
        
        function handleTemplateFieldDrop(e, idx, fieldKey) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.remove('!border-primary', 'bg-primary/10');
            
            if (draggedFieldName) {
                updateTemplateValue(idx, fieldKey, draggedFieldName);
            }
        }
        
        function clearTemplateField(idx, fieldKey) {
            if (workflowSteps[idx]._templateConfig?.values?.[fieldKey]) {
                updateTemplateValue(idx, fieldKey, '');
            }
        }
        
        function updateTemplateTypeFilter(idx, type) {
            if (!workflowSteps[idx]._templateConfig) {
                workflowSteps[idx]._templateConfig = {};
            }
            workflowSteps[idx]._templateConfig.typeFilter = type;
            
            // Re-render to update preview
            renderWorkflowSteps();
            
            // Auto-save
            debouncedAutoSave();
        }
        
        // Domain Editor
        function renderDomain(stepIdx, domain) {
            console.log('renderDomain called for step', stepIdx, 'domain:', domain);
            const container = document.getElementById(`domain-${stepIdx}`);
            container.innerHTML = '';
            
            // Ensure we're using _customDomain for custom conditions
            if (!workflowSteps[stepIdx].search._customDomain) {
                workflowSteps[stepIdx].search._customDomain = [];
            }
            
            const customDomain = workflowSteps[stepIdx].search._customDomain;
            
            if (customDomain.length === 0) {
                return;
            }
            
            domain.forEach((condition, condIdx) => {
                const row = document.createElement('div');
                row.className = 'flex gap-2 items-center';
                
                // Support both old format [field, op, val] and new format [field, op, val, type]
                const field = condition[0] || '';
                const op = condition[1] || '=';
                const val = condition[2] !== undefined ? condition[2] : '';
                const fieldType = condition[3] || 'text';
                
                row.innerHTML = `
                    <input type="text" class="input input-sm input-bordered flex-1" value="${field}" placeholder="field" 
                        onchange="updateDomain(${stepIdx}, ${condIdx}, 0, this.value)">
                    <select class="select select-sm select-bordered" onchange="updateDomainType(${stepIdx}, ${condIdx}, this.value)">
                        <option value="text" ${fieldType === 'text' ? 'selected' : ''}>Text</option>
                        <option value="integer" ${fieldType === 'integer' ? 'selected' : ''}>Integer</option>
                        <option value="float" ${fieldType === 'float' ? 'selected' : ''}>Float</option>
                        <option value="boolean" ${fieldType === 'boolean' ? 'selected' : ''}>Boolean</option>
                        <option value="datetime" ${fieldType === 'datetime' ? 'selected' : ''}>DateTime</option>
                    </select>
                    <select class="select select-sm select-bordered" onchange="updateDomain(${stepIdx}, ${condIdx}, 1, this.value)">
                        <option value="=" ${op === '=' ? 'selected' : ''}>equals (=)</option>
                        <option value="!=" ${op === '!=' ? 'selected' : ''}>not equals (!=)</option>
                        <option value=">" ${op === '>' ? 'selected' : ''}>greater (&gt;)</option>
                        <option value="<" ${op === '<' ? 'selected' : ''}>less (&lt;)</option>
                        <option value=">=" ${op === '>=' ? 'selected' : ''}>greater or equal (&gt;=)</option>
                        <option value="<=" ${op === '<=' ? 'selected' : ''}>less or equal (&lt;=)</option>
                        <option value="like" ${op === 'like' ? 'selected' : ''}>like</option>
                        <option value="ilike" ${op === 'ilike' ? 'selected' : ''}>ilike</option>
                        <option value="in" ${op === 'in' ? 'selected' : ''}>in</option>
                        <option value="not in" ${op === 'not in' ? 'selected' : ''}>not in</option>
                    </select>
                    <div id="value-${stepIdx}-${condIdx}" class="flex-1"></div>
                    <button class="btn btn-sm btn-ghost btn-square" onclick="deleteDomain(${stepIdx}, ${condIdx})">×</button>
                `;
                container.appendChild(row);
                
                // Render the value input based on field type
                renderDomainValue(stepIdx, condIdx, val, fieldType);
            });
        }
        
        function renderDomainValue(stepIdx, condIdx, value, fieldType) {
            const container = document.getElementById(`value-${stepIdx}-${condIdx}`);
            if (!container) return;
            
            container.innerHTML = '';
            
            if (fieldType === 'boolean') {
                // Boolean: true/false select
                const select = document.createElement('select');
                select.className = 'select select-sm select-bordered w-full';
                select.onchange = function() {
                    const boolVal = this.value === 'true';
                    updateDomain(stepIdx, condIdx, 2, boolVal);
                };
                
                const trueOpt = document.createElement('option');
                trueOpt.value = 'true';
                trueOpt.textContent = 'True';
                trueOpt.selected = value === true;
                
                const falseOpt = document.createElement('option');
                falseOpt.value = 'false';
                falseOpt.textContent = 'False';
                falseOpt.selected = value === false;
                
                select.appendChild(trueOpt);
                select.appendChild(falseOpt);
                container.appendChild(select);
                
            } else if (fieldType === 'integer') {
                // Integer input
                const input = document.createElement('input');
                input.className = 'input input-sm input-bordered w-full';
                input.type = 'number';
                input.step = '1';
                input.value = value;
                input.placeholder = 'integer value';
                input.onchange = function() {
                    updateDomain(stepIdx, condIdx, 2, parseInt(this.value) || 0);
                };
                container.appendChild(input);
                
            } else if (fieldType === 'float') {
                // Float input
                const input = document.createElement('input');
                input.className = 'input input-sm input-bordered w-full';
                input.type = 'number';
                input.step = 'any';
                input.value = value;
                input.placeholder = 'decimal value';
                input.onchange = function() {
                    updateDomain(stepIdx, condIdx, 2, parseFloat(this.value) || 0);
                };
                container.appendChild(input);
                
            } else if (fieldType === 'datetime') {
                // DateTime input
                const input = document.createElement('input');
                input.className = 'input input-sm input-bordered w-full';
                input.type = 'datetime-local';
                input.value = value;
                input.placeholder = 'YYYY-MM-DD HH:MM';
                input.onchange = function() {
                    updateDomain(stepIdx, condIdx, 2, this.value);
                };
                container.appendChild(input);
                
            } else {
                // Text input with chip support
                const input = document.createElement('input');
                input.className = 'input input-sm input-bordered w-full';
                input.type = 'text';
                input.value = value;
                input.placeholder = 'value';
                input.setAttribute('onchange', 'updateDomain(' + stepIdx + ', ' + condIdx + ', 2, this.value)');
                container.appendChild(input);
                
                // Convert to chip input after a small delay
                setTimeout(() => {
                    convertToChipInput(input);
                }, 0);
            }
        }
        
        function updateDomainType(stepIdx, condIdx, newType) {
            if (!workflowSteps[stepIdx].search._customDomain) {
                workflowSteps[stepIdx].search._customDomain = [];
            }
            // Update the field type
            if (workflowSteps[stepIdx].search._customDomain[condIdx].length === 3) {
                // Convert from old format [field, op, val] to new format [field, op, val, type]
                workflowSteps[stepIdx].search._customDomain[condIdx].push(newType);
            } else {
                workflowSteps[stepIdx].search._customDomain[condIdx][3] = newType;
            }
            
            // Get current value and convert it based on new type
            let currentVal = workflowSteps[stepIdx].search._customDomain[condIdx][2];
            
            if (newType === 'boolean') {
                currentVal = currentVal === 'true' || currentVal === true || currentVal === 1;
            } else if (newType === 'integer') {
                currentVal = parseInt(currentVal) || 0;
            } else if (newType === 'float') {
                currentVal = parseFloat(currentVal) || 0;
            } else {
                currentVal = String(currentVal || '');
            }
            
            workflowSteps[stepIdx].search._customDomain[condIdx][2] = currentVal;
            
            // Re-render the value input
            renderDomainValue(stepIdx, condIdx, currentVal, newType);
            updateDomainPreview(stepIdx);
        }
        
        function addDomainRow(stepIdx) {
            if (!workflowSteps[stepIdx].search) workflowSteps[stepIdx].search = {};
            if (!workflowSteps[stepIdx].search._customDomain) workflowSteps[stepIdx].search._customDomain = [];
            // New format: [field, operator, value, type]
            workflowSteps[stepIdx].search._customDomain.push(['', '=', '', 'text']);
            renderDomain(stepIdx, workflowSteps[stepIdx].search._customDomain);
            updateDomainPreview(stepIdx);
        }
        
        function updateDomain(stepIdx, condIdx, part, value) {
            if (!workflowSteps[stepIdx].search._customDomain) {
                workflowSteps[stepIdx].search._customDomain = [];
            }
            workflowSteps[stepIdx].search._customDomain[condIdx][part] = value;
            updateDomainPreview(stepIdx);
        }
        
        function deleteDomain(stepIdx, condIdx) {
            if (!workflowSteps[stepIdx].search._customDomain) {
                workflowSteps[stepIdx].search._customDomain = [];
            }
            workflowSteps[stepIdx].search._customDomain.splice(condIdx, 1);
            renderDomain(stepIdx, workflowSteps[stepIdx].search._customDomain);
            updateDomainPreview(stepIdx);
        }
        
        function updateDomainPreview(stepIdx) {
            const step = workflowSteps[stepIdx];
            const previewDomain = generateDomainFromTemplate(stepIdx, step);
            const templateConfig = step._templateConfig || {};
            const hasAnyValues = templateConfig.values && Object.values(templateConfig.values).some(v => v);
            const hasCustomConditions = step.search?._customDomain && step.search._customDomain.length > 0;
            const isSuccess = hasAnyValues || hasCustomConditions;
            
            // Update the preview container content
            const previewContainer = document.getElementById(`domain-preview-${stepIdx}`);
            if (previewContainer) {
                previewContainer.innerHTML = `
                    <pre class="text-[10px] overflow-x-auto whitespace-pre-wrap break-all">${JSON.stringify(previewDomain, null, 2)}</pre>
                    ${isSuccess ? '<div class="text-xs mt-1">✓ Klaar om op te slaan</div>' : '<div class="text-xs mt-1">⚠ Sleep velden naar de drop zones hierboven</div>'}
                `;
                
                // Update the collapse background color and text color
                const collapseElement = previewContainer.closest('.collapse');
                if (collapseElement) {
                    // Remove old color classes
                    collapseElement.classList.remove('bg-success', 'bg-warning', 'text-success-content', 'text-warning-content');
                    // Add new color classes
                    if (isSuccess) {
                        collapseElement.classList.add('bg-success', 'text-success-content');
                    } else {
                        collapseElement.classList.add('bg-warning', 'text-warning-content');
                    }
                    
                    // Update the collapse title with condition count
                    const collapseTitle = collapseElement.querySelector('.collapse-title');
                    if (collapseTitle) {
                        collapseTitle.innerHTML = `📋 Generated domain (${previewDomain.length} conditions)`;
                    }
                }
            }
            
            // Auto-save after preview update
            debouncedAutoSave();
        }
        
        // Search Fields
        function renderSearchFields(stepIdx, fields) {
            const container = document.getElementById(`fields-${stepIdx}`);
            if (!container) return; // Container doesn't exist yet
            
            container.innerHTML = '';
            
            if (fields.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'text-xs text-base-content/50 italic';
                emptyMsg.textContent = 'Geen velden geselecteerd';
                container.appendChild(emptyMsg);
                return;
            }
            
            fields.forEach((field, fieldIdx) => {
                const tag = document.createElement('div');
                tag.className = 'badge badge-lg badge-neutral gap-2 pr-1';
                tag.innerHTML = `
                    <span>${field}</span>
                    <button class="btn btn-xs btn-ghost btn-circle" onclick="deleteSearchField(${stepIdx}, ${fieldIdx})">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                `;
                container.appendChild(tag);
            });
        }
        
        function addSearchField(stepIdx) {
            const input = document.getElementById(`new-field-${stepIdx}`);
            const value = input.value.trim();
            if (!value) return;
            
            if (!workflowSteps[stepIdx].search) workflowSteps[stepIdx].search = {};
            if (!workflowSteps[stepIdx].search.fields) workflowSteps[stepIdx].search.fields = [];
            workflowSteps[stepIdx].search.fields.push(value);
            input.value = '';
            renderSearchFields(stepIdx, workflowSteps[stepIdx].search.fields);
            renderStepResultChips(stepIdx, workflowSteps[stepIdx]);
            updateFieldPalette();
        }
        
        function deleteSearchField(stepIdx, fieldIdx) {
            workflowSteps[stepIdx].search.fields.splice(fieldIdx, 1);
            renderSearchFields(stepIdx, workflowSteps[stepIdx].search.fields);
            renderStepResultChips(stepIdx, workflowSteps[stepIdx]);
            updateFieldPalette();
        }
        
        // Create Values
        function renderCreateValues(stepIdx, values) {
            console.log('=== renderCreateValues ===', 'stepIdx:', stepIdx, 'values:', values);
            const container = document.getElementById(`create-${stepIdx}`);
            container.innerHTML = '';
            
            if (Object.keys(values).length === 0) {
                return;
            }
            
            // Get field types from metadata
            const fieldTypes = workflowSteps[stepIdx]._ui_metadata?.create_types || {};
            
            Object.entries(values).forEach(([key, value]) => {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2 w-full';
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                const useTextarea = displayValue.length > 40;
                const fieldType = fieldTypes[key] || 'auto';
                
                console.log('Creating value row:', key, '=', displayValue, 'type:', fieldType);
                
                row.innerHTML = `
                    <input type="text" value="${key}" placeholder="field" data-old-key="${key}" 
                        class="input input-sm input-bordered flex-1"
                        onchange="updateCreateValueFromRow(${stepIdx}, this)">
                    <span class="text-base-content/50 flex-shrink-0">=</span>
                    ${useTextarea 
                        ? `<textarea id="create-value-${stepIdx}-${key.replace(/\W/g, '_')}" class="textarea textarea-sm textarea-bordered chip-enabled min-h-[2rem] flex-1" onchange="updateCreateValueFromInput(${stepIdx}, '${key}', this)">${displayValue}</textarea>`
                        : `<input id="create-value-${stepIdx}-${key.replace(/\W/g, '_')}" type="text" value="${displayValue}" placeholder="value" class="input input-sm input-bordered chip-enabled flex-1" onchange="updateCreateValueFromInput(${stepIdx}, '${key}', this)">`
                    }
                    <select class="select select-sm select-bordered flex-shrink-0" onchange="updateCreateFieldType(${stepIdx}, '${key}', this.value)" title="Data type">
                        <option value="auto" ${fieldType === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="string" ${fieldType === 'string' ? 'selected' : ''}>String</option>
                        <option value="integer" ${fieldType === 'integer' ? 'selected' : ''}>Integer</option>
                        <option value="float" ${fieldType === 'float' ? 'selected' : ''}>Float</option>
                        <option value="boolean" ${fieldType === 'boolean' ? 'selected' : ''}>Boolean</option>
                    </select>
                    <button class="btn btn-sm btn-ghost btn-square flex-shrink-0" onclick="deleteCreateValue(${stepIdx}, '${key}')">×</button>
                `;
                container.appendChild(row);
            });
            
            // Convert ONLY value inputs (not field name inputs) to chip inputs
            setTimeout(() => {
                const inputs = container.querySelectorAll('.chip-enabled');
                console.log('Converting', inputs.length, 'value inputs to chip inputs');
                inputs.forEach(convertToChipInput);
            }, 0);
        }
        
        function addCreateValue(stepIdx) {
            if (!workflowSteps[stepIdx].create) workflowSteps[stepIdx].create = {};
            
            // Add empty row
            const key = '';
            const value = '';
            workflowSteps[stepIdx].create[key] = value;
            
            // Add only the new row instead of re-rendering everything
            const container = document.getElementById(`create-${stepIdx}`);
            const fieldTypes = workflowSteps[stepIdx]._ui_metadata?.create_types || {};
            const displayValue = '';
            const useTextarea = false;
            const fieldType = 'auto';
            
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 w-full';
            row.innerHTML = `
                <input type="text" value="" placeholder="field" data-old-key="" 
                    class="input input-sm input-bordered flex-1"
                    onchange="updateCreateValueFromRow(${stepIdx}, this)">
                <span class="text-base-content/50 flex-shrink-0">=</span>
                <input id="create-value-${stepIdx}-new" type="text" value="" placeholder="value" class="input input-sm input-bordered chip-enabled flex-1" onchange="updateCreateValueFromInput(${stepIdx}, '', this)">
                <select class="select select-sm select-bordered flex-shrink-0" onchange="updateCreateFieldType(${stepIdx}, '', this.value)" title="Data type">
                    <option value="auto" selected>Auto</option>
                    <option value="string">String</option>
                    <option value="integer">Integer</option>
                    <option value="float">Float</option>
                    <option value="boolean">Boolean</option>
                </select>
                <button class="btn btn-sm btn-ghost btn-square flex-shrink-0" onclick="deleteCreateValue(${stepIdx}, '')">×</button>
            `;
            container.appendChild(row);
            
            // Convert only the new input to chip input
            setTimeout(() => {
                const newInput = row.querySelector('.chip-enabled');
                if (newInput) convertToChipInput(newInput);
            }, 0);
        }
        
        function updateCreateValueFromRow(stepIdx, fieldInput) {
            const oldKey = fieldInput.dataset.oldKey;
            const newKey = fieldInput.value;
            // Find the value input/wrapper in the same row
            const row = fieldInput.parentElement;
            const valueWrapper = row.querySelector('.relative');
            let value;
            if (valueWrapper) {
                // Chip input - get value from hidden input
                const hiddenInput = valueWrapper.nextElementSibling;
                value = hiddenInput ? hiddenInput.value : '';
            } else {
                // Normal input - get value directly
                const valueInput = row.querySelector('.chip-enabled');
                value = valueInput ? valueInput.value : '';
            }
            updateCreateValue(stepIdx, oldKey, newKey, value);
            fieldInput.dataset.oldKey = newKey;
        }
        
        function updateCreateValueFromInput(stepIdx, key, inputElement) {
            // Check if this has been converted to chip input
            const wrapper = inputElement.parentElement?.classList.contains('relative') ? inputElement.parentElement : null;
            let value;
            if (wrapper) {
                // Chip input - value is in hidden sibling
                const hiddenInput = wrapper.nextElementSibling;
                value = hiddenInput ? hiddenInput.value : inputElement.value;
            } else {
                // Normal input
                value = inputElement.value;
            }
            updateCreateValue(stepIdx, key, key, value);
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
        
        function updateCreateFieldType(stepIdx, key, type) {
            if (!workflowSteps[stepIdx]._ui_metadata) workflowSteps[stepIdx]._ui_metadata = {};
            if (!workflowSteps[stepIdx]._ui_metadata.create_types) workflowSteps[stepIdx]._ui_metadata.create_types = {};
            workflowSteps[stepIdx]._ui_metadata.create_types[key] = type;
        }
        
        function deleteCreateValue(stepIdx, key) {
            delete workflowSteps[stepIdx].create[key];
            // Also delete type metadata
            if (workflowSteps[stepIdx]._ui_metadata?.create_types) {
                delete workflowSteps[stepIdx]._ui_metadata.create_types[key];
            }
            renderCreateValues(stepIdx, workflowSteps[stepIdx].create);
        }
        
        // Update Values
        function renderUpdateValues(stepIdx, updateObj) {
            console.log('renderUpdateValues called for step', stepIdx, 'updateObj:', updateObj);
            console.log('updateObj type:', typeof updateObj, 'is array?', Array.isArray(updateObj));
            console.log('updateObj.fields:', updateObj?.fields);
            const container = document.getElementById(`update-${stepIdx}`);
            if (!container) {
                console.error('Update container not found for step', stepIdx);
                return;
            }
            container.innerHTML = '';
            
            // Get search fields as options
            const searchFields = workflowSteps[stepIdx].search?.fields || [];
            const searchFieldOptions = searchFields.length > 0 
                ? searchFields.map(f => `<option value="${f}">${f}</option>`).join('')
                : '';
            
            const values = updateObj.fields || updateObj;
            console.log('Update values to render:', values);
            console.log('Object.keys(values):', Object.keys(values));
            
            if (Object.keys(values).length === 0 || (Object.keys(values).length === 1 && values.enabled !== undefined)) {
                console.log('No values to render for update');
                return;
            }
            
            // Get field types from metadata
            const fieldTypes = workflowSteps[stepIdx]._ui_metadata?.update_types || {};
            
            Object.entries(values).forEach(([key, value]) => {
                if (key === 'enabled') return;
                
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2 w-full';
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                const useTextarea = displayValue.length > 40;
                const fieldType = fieldTypes[key] || 'auto';
                
                row.innerHTML = `
                    <select class="select select-sm select-bordered flex-1" onchange="updateUpdateValueKey(${stepIdx}, '${key}', this.value)">
                        <option value="">-- Select field --</option>
                        ${searchFieldOptions}
                        <option value="${key}" ${!searchFields.includes(key) && key ? 'selected' : ''}>${key || '(custom)'}</option>
                    </select>
                    <span class="text-base-content/50 flex-shrink-0">=</span>
                    ${useTextarea 
                        ? `<textarea id="update-value-${stepIdx}-${key.replace(/\W/g, '_')}" class="textarea textarea-sm textarea-bordered chip-enabled min-h-[2rem] flex-1" onchange="updateUpdateValueFromInput(${stepIdx}, '${key}', this)">${displayValue}</textarea>`
                        : `<input id="update-value-${stepIdx}-${key.replace(/\W/g, '_')}" type="text" value="${displayValue}" placeholder="value" class="input input-sm input-bordered chip-enabled flex-1" onchange="updateUpdateValueFromInput(${stepIdx}, '${key}', this)">`
                    }
                    <select class="select select-sm select-bordered flex-shrink-0" onchange="updateUpdateFieldType(${stepIdx}, '${key}', this.value)" title="Data type">
                        <option value="auto" ${fieldType === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="string" ${fieldType === 'string' ? 'selected' : ''}>String</option>
                        <option value="integer" ${fieldType === 'integer' ? 'selected' : ''}>Integer</option>
                        <option value="float" ${fieldType === 'float' ? 'selected' : ''}>Float</option>
                        <option value="boolean" ${fieldType === 'boolean' ? 'selected' : ''}>Boolean</option>
                    </select>
                    <button class="btn btn-sm btn-ghost btn-square flex-shrink-0" onclick="deleteUpdateValue(${stepIdx}, '${key}')">×</button>
                `;
                container.appendChild(row);
                
                // Set correct selection
                const select = row.querySelector('select');
                if (searchFields.includes(key)) {
                    select.value = key;
                }
            });
            
            // Convert ONLY value inputs (not field selects) to chip inputs
            setTimeout(() => {
                container.querySelectorAll('.chip-enabled').forEach(convertToChipInput);
            }, 0);
        }
        
        function updateUpdateValueFromInput(stepIdx, key, inputElement) {
            // Check if this has been converted to chip input
            const wrapper = inputElement.parentElement?.classList.contains('relative') ? inputElement.parentElement : null;
            let value;
            if (wrapper) {
                // Chip input - value is in hidden sibling
                const hiddenInput = wrapper.nextElementSibling;
                value = hiddenInput ? hiddenInput.value : inputElement.value;
            } else {
                // Normal input
                value = inputElement.value;
            }
            updateUpdateValue(stepIdx, key, key, value);
        }
        
        function updateUpdateValueKey(stepIdx, oldKey, newKey) {
            if (!workflowSteps[stepIdx].update.fields) workflowSteps[stepIdx].update.fields = {};
            
            const value = workflowSteps[stepIdx].update.fields[oldKey];
            delete workflowSteps[stepIdx].update.fields[oldKey];
            workflowSteps[stepIdx].update.fields[newKey] = value || '';
            
            renderUpdateValues(stepIdx, workflowSteps[stepIdx].update);
        }
        
        function addUpdateValue(stepIdx) {
            if (!workflowSteps[stepIdx].update) workflowSteps[stepIdx].update = {};
            if (!workflowSteps[stepIdx].update.fields) workflowSteps[stepIdx].update.fields = {};
            
            // Add empty row
            const key = '';
            const value = '';
            workflowSteps[stepIdx].update.fields[key] = value;
            
            // Add only the new row
            const container = document.getElementById(`update-${stepIdx}`);
            const searchFields = workflowSteps[stepIdx].search?.fields || [];
            const searchFieldOptions = searchFields.length > 0 
                ? searchFields.map(f => `<option value="${f}">${f}</option>`).join('')
                : '';
            const fieldTypes = workflowSteps[stepIdx]._ui_metadata?.update_types || {};
            const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
            const useTextarea = displayValue.length > 40;
            const fieldType = fieldTypes[key] || 'auto';
            
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 w-full';
            row.innerHTML = `
                <select class="select select-sm select-bordered flex-1" onchange="updateUpdateValueKey(${stepIdx}, '${key}', this.value)">
                    <option value="">-- Select field --</option>
                    ${searchFieldOptions}
                </select>
                <span class="text-base-content/50 flex-shrink-0">=</span>
                <input id="update-value-${stepIdx}-new" type="text" value="${displayValue}" placeholder="value" class="input input-sm input-bordered chip-enabled flex-1" onchange="updateUpdateValueFromInput(${stepIdx}, '', this)">
                <select class="select select-sm select-bordered flex-shrink-0" onchange="updateUpdateFieldType(${stepIdx}, '', this.value)" title="Data type">
                    <option value="auto" selected>Auto</option>
                    <option value="string">String</option>
                    <option value="integer">Integer</option>
                    <option value="float">Float</option>
                    <option value="boolean">Boolean</option>
                </select>
                <button class="btn btn-sm btn-ghost btn-square flex-shrink-0" onclick="deleteUpdateValue(${stepIdx}, '')">×</button>
            `;
            container.appendChild(row);
            
            // Convert only the new input to chip input
            setTimeout(() => {
                const newInput = row.querySelector('.chip-enabled');
                if (newInput) convertToChipInput(newInput);
            }, 0);
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
        
        function updateUpdateFieldType(stepIdx, key, type) {
            if (!workflowSteps[stepIdx]._ui_metadata) workflowSteps[stepIdx]._ui_metadata = {};
            if (!workflowSteps[stepIdx]._ui_metadata.update_types) workflowSteps[stepIdx]._ui_metadata.update_types = {};
            workflowSteps[stepIdx]._ui_metadata.update_types[key] = type;
        }
        
        function deleteUpdateValue(stepIdx, key) {
            delete workflowSteps[stepIdx].update.fields[key];
            // Also delete type metadata
            if (workflowSteps[stepIdx]._ui_metadata?.update_types) {
                delete workflowSteps[stepIdx]._ui_metadata.update_types[key];
            }
            renderUpdateValues(stepIdx, workflowSteps[stepIdx].update);
        }
        
        // Save & Export
        async function saveForm(silent = false) {
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
            
            // Clean workflow steps: preserve custom domain conditions and template config
            const cleanedWorkflow = workflowSteps.map((step, idx) => {
                const cleanedStep = { ...step };
                
                // Generate final domain from templates + custom conditions FOR EXECUTION
                const finalDomain = generateDomainFromTemplate(idx, step);
                
                // Store custom domain conditions separately (for UI editing on reload)
                if (cleanedStep.search?._customDomain) {
                    // Extract custom domain types to metadata
                    const customDomainTypes = cleanedStep.search._customDomain.map(condition => {
                        return condition[3] || 'text';
                    });
                    
                    if (!cleanedStep._ui_metadata) {
                        cleanedStep._ui_metadata = {};
                    }
                    cleanedStep._ui_metadata.custom_domain_types = customDomainTypes;
                    
                    // Save custom domain (without type info) 
                    cleanedStep.search._customDomain = cleanedStep.search._customDomain.map(condition => {
                        return condition.slice(0, 3);
                    });
                }
                
                // Store the final combined domain (for Odoo execution)
                if (finalDomain && finalDomain.length > 0) {
                    if (!cleanedStep.search) cleanedStep.search = {};
                    cleanedStep.search.domain = finalDomain.map(condition => {
                        return condition.slice(0, 3);
                    });
                } else {
                    // Clear domain if no conditions
                    if (cleanedStep.search) {
                        cleanedStep.search.domain = [];
                    }
                }
                
                return cleanedStep;
            });
            
            // Get current form name from input
            const formNameInput = document.getElementById('formName');
            const currentFormName = formNameInput ? formNameInput.value.trim() : (mappings[currentFormId]?.name || '');
            
            const data = {
                ...mappings[currentFormId],
                name: currentFormName,
                field_mapping: fieldMapping,
                value_mapping: cleanedValueMapping,
                workflow: cleanedWorkflow
            };
            
            console.log('Saving form data:', JSON.stringify(data, null, 2));
            console.log('Original workflowSteps:', JSON.stringify(workflowSteps, null, 2));
            
            try {
                await apiCall(`/api/mappings/${currentFormId}`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                mappings[currentFormId] = data;
                if (!silent) {
                    console.log('Form saved successfully, mappings updated:', mappings[currentFormId]);
                    showAlert('Form saved successfully', 'success');
                }
            } catch (err) {
                if (!silent) {
                    showAlert('Failed to save: ' + err.message, 'error');
                }
            }
        }
        
        function exportForm() {
            const data = mappings[currentFormId];
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `form_${currentFormId}.json`;
            a.click();
        }
        
        async function deleteForm() {
            if (!confirm(`Delete form ${currentFormId}?`)) return;
            
            try {
                await apiCall(`/api/mappings/${currentFormId}`, { method: 'DELETE' });
                delete mappings[currentFormId];
                showAlert('Form deleted', 'success');
                loadForms();
                document.getElementById('editorContent').innerHTML = '';
            } catch (err) {
                showAlert('Failed to delete: ' + err.message, 'error');
            }
        }
        
        function updateFormName() {
            const newName = document.getElementById('formName').value.trim();
            if (!currentFormId) return;
            
            if (!mappings[currentFormId]) {
                mappings[currentFormId] = { field_mapping: {}, value_mapping: {}, workflow: [] };
            }
            
            mappings[currentFormId].name = newName;
            document.getElementById('editorTitle').textContent = `Edit: ${newName || currentFormId}`;
            
            // Update list item text directly without reloading from server
            const list = document.getElementById('formList');
            const activeItem = list.querySelector('.active');
            if (activeItem) {
                activeItem.textContent = newName || currentFormId;
                activeItem.title = `ID: ${currentFormId}`;
            }
        }
        
        function createNewForm() {
            const formId = prompt('Enter Forminator Form ID:');
            if (!formId) return;
            
            if (mappings[formId]) {
                showAlert('Form ID already exists!', 'error');
                return;
            }
            
            const formName = prompt('Enter Form Name (display name):', formId);
            
            // Create new empty form
            currentFormId = formId;
            fieldMapping = {};
            valueMapping = {};
            workflowSteps = [];
            expandedValueMappings = {};
            
            mappings[formId] = {
                name: formName || formId,
                field_mapping: {},
                value_mapping: {},
                workflow: []
            };
            
            // Reload forms list to show new form with name
            loadForms();
            
            // Load in editor
            loadForm(formId);
            showAlert(`Created new form: ${formName || formId}`, 'success');
        }
        
        // HTML Card Editor Functions
        
        function openHtmlCardEditor(stepIdx) {
            currentHtmlCardStepIdx = stepIdx;
            const modal = document.getElementById('htmlCardModal');
            modal.classList.add('active');
            
            // Load existing HTML card if present
            if (workflowSteps[stepIdx].html_card) {
                parseHtmlCardToElements(workflowSteps[stepIdx].html_card);
            } else {
                htmlCardElements = [];
            }
            
            // Populate available fields
            populateHtmlCardFields();
            
            // Render canvas
            renderHtmlCardCanvas();
            
            // Initialize drag and drop
            initializeHtmlCardDragDrop();
        }
        
        function closeHtmlCardEditor() {
            document.getElementById('htmlCardModal').classList.remove('active');
            currentHtmlCardStepIdx = null;
            htmlCardElements = [];
        }
        
        function populateHtmlCardFields() {
            const container = document.getElementById('htmlCardFields');
            container.innerHTML = '';
            
            // Add form fields with their Odoo field names (renamed)
            Object.entries(fieldMapping).forEach(([formField, odooField]) => {
                const div = document.createElement('div');
                div.className = 'html-card-draggable';
                div.draggable = true;
                div.dataset.type = 'field';
                div.dataset.field = formField;
                div.dataset.odooField = odooField;
                div.innerHTML = `<span>📝</span> ${odooField || formField}`;
                container.appendChild(div);
            });
            
            // Add step results
            workflowSteps.forEach((step, idx) => {
                if (idx < currentHtmlCardStepIdx && step.step) {
                    const fields = step.search?.fields || ['id'];
                    fields.forEach(field => {
                        const div = document.createElement('div');
                        div.className = 'html-card-draggable';
                        div.draggable = true;
                        div.dataset.type = 'step-field';
                        div.dataset.field = `${step.step}.${field}`;
                        div.innerHTML = `<span>📦</span> ${step.step}.${field}`;
                        container.appendChild(div);
                    });
                }
            });
        }
        
        function initializeHtmlCardDragDrop() {
            const canvas = document.getElementById('htmlCardCanvas');
            const draggables = document.querySelectorAll('.html-card-draggable');
            
            draggables.forEach(draggable => {
                draggable.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('type', draggable.dataset.type);
                    if (draggable.dataset.field) {
                        e.dataTransfer.setData('field', draggable.dataset.field);
                    }
                    if (draggable.dataset.odooField) {
                        e.dataTransfer.setData('odooField', draggable.dataset.odooField);
                    }
                    draggable.classList.add('dragging');
                });
                
                draggable.addEventListener('dragend', (e) => {
                    draggable.classList.remove('dragging');
                });
            });
            
            canvas.addEventListener('dragover', (e) => {
                e.preventDefault();
                canvas.classList.add('dragover');
            });
            
            canvas.addEventListener('dragleave', () => {
                canvas.classList.remove('dragover');
            });
            
            canvas.addEventListener('drop', (e) => {
                e.preventDefault();
                canvas.classList.remove('dragover');
                
                // Check if dropping into a container (not the canvas itself)
                const containerElement = e.target.closest('[data-container-id]');
                if (containerElement && containerElement !== canvas) {
                    return; // Let container handle it
                }
                
                const existingPath = e.dataTransfer.getData('existingPath');
                if (existingPath) {
                    // Moving existing element to root
                    const path = JSON.parse(existingPath);
                    moveHtmlCardElement(path, null);
                } else {
                    // Adding new element to root
                    const type = e.dataTransfer.getData('type');
                    const field = e.dataTransfer.getData('field');
                    const odooField = e.dataTransfer.getData('odooField');
                    addHtmlCardElement(type, field, odooField, null);
                }
            });
        }
        
        function addHtmlCardElement(type, field = null, odooField = null, containerId = null) {
            const element = {
                id: Date.now() + Math.random(),
                type: type,
                field: field,
                odooField: odooField
            };
            
            // Add default values based on type
            if (type === 'heading') {
                element.text = 'Heading Text';
                element.level = 'h2';
            } else if (type === 'text') {
                element.text = 'Text content here...';
            } else if (type === 'divider') {
                // No extra properties
            } else if (type === 'container') {
                element.title = 'Container Title';
                element.layout = 'vertical'; // or 'horizontal', 'grid'
                element.children = [];
            } else if (type === 'field' || type === 'step-field') {
                element.label = odooField || field;
                console.log('Created field element:', element);
            }
            
            // Add to container or root
            if (containerId) {
                const container = findElementById(containerId);
                if (container && container.children) {
                    container.children.push(element);
                }
            } else {
                htmlCardElements.push(element);
            }
            
            renderHtmlCardCanvas();
        }
        
        function findElementById(id) {
            for (const el of htmlCardElements) {
                if (el.id === id) return el;
                if (el.children) {
                    const found = findInChildren(el.children, id);
                    if (found) return found;
                }
            }
            return null;
        }
        
        function findInChildren(children, id) {
            for (const child of children) {
                if (child.id === id) return child;
                if (child.children) {
                    const found = findInChildren(child.children, id);
                    if (found) return found;
                }
            }
            return null;
        }
        
        function moveHtmlCardElement(fromPath, toContainerId) {
            // Get the element
            let source = htmlCardElements;
            for (let i = 0; i < fromPath.length - 1; i++) {
                source = source[fromPath[i]];
            }
            const element = source[fromPath[fromPath.length - 1]];
            
            // Remove from old location
            source.splice(fromPath[fromPath.length - 1], 1);
            
            // Add to new location
            if (toContainerId) {
                const container = findElementById(toContainerId);
                if (container && container.children) {
                    container.children.push(element);
                }
            } else {
                htmlCardElements.push(element);
            }
            
            renderHtmlCardCanvas();
        }
        
        function renderHtmlCardCanvas() {
            const canvas = document.getElementById('htmlCardCanvas');
            
            if (htmlCardElements.length === 0) {
                canvas.innerHTML = '<p style="color: #999; text-align: center; margin-top: 2rem;">Drag elements here to build your HTML card</p>';
                return;
            }
            
            canvas.innerHTML = '';
            renderElements(htmlCardElements, canvas, []);
        }
        
        function renderElements(elements, container, path) {
            elements.forEach((element, idx) => {
                const currentPath = [...path, idx];
                const div = document.createElement('div');
                div.className = 'html-card-element';
                
                if (element.type === 'container') {
                    div.classList.add('html-card-container');
                }
                
                // Serialize path as JSON string for safe passing to functions
                const pathJson = JSON.stringify(currentPath);
                const pathStr = pathJson.replace(/"/g, '&quot;');
                
                // Create drag handle
                const dragHandle = document.createElement('div');
                dragHandle.className = 'html-card-element-drag-handle';
                dragHandle.draggable = true;
                
                dragHandle.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('existingPath', JSON.stringify(currentPath));
                    div.style.opacity = '0.5';
                });
                dragHandle.addEventListener('dragend', (e) => {
                    div.style.opacity = '1';
                });
                
                div.appendChild(dragHandle);
                
                // Create controls
                const controls = document.createElement('div');
                controls.className = 'html-card-element-controls';
                controls.innerHTML = '<button data-path="' + pathJson + '" onclick="removeHtmlCardElementByPathJson(this.getAttribute(\'data-path\'))" title="Remove">×</button>';
                div.appendChild(controls);
                
                // Create content
                const content = document.createElement('div');
                content.innerHTML = renderHtmlCardElementPreview(element, currentPath);
                div.appendChild(content);
                
                // Render children if it's a container
                if (element.type === 'container') {
                    // Initialize children array if it doesn't exist
                    if (!element.children) {
                        element.children = [];
                    }
                    
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = 'html-card-container-children';
                    childrenContainer.setAttribute('data-container-id', element.id);
                    childrenContainer.style.cssText = element.layout === 'horizontal' 
                        ? 'display: flex; gap: 0.5rem; flex-wrap: wrap;' 
                        : element.layout === 'grid'
                        ? 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;'
                        : 'display: flex; flex-direction: column; gap: 0.5rem;';
                    
                    // Show empty state if no children
                    if (element.children.length === 0) {
                        const emptyState = document.createElement('div');
                        emptyState.style.cssText = 'padding: 1rem; background: #f0f4ff; border: 2px dashed #667eea; border-radius: 4px; text-align: center; min-height: 80px; display: flex; align-items: center; justify-content: center;';
                        emptyState.innerHTML = '<small style="color: #667eea; font-weight: 500;">📦 Sleep elementen hierheen</small>';
                        childrenContainer.appendChild(emptyState);
                    }
                    
                    // Add drop zone handlers
                    childrenContainer.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        childrenContainer.classList.add('dragover');
                    });
                    childrenContainer.addEventListener('dragleave', (e) => {
                        e.stopPropagation();
                        childrenContainer.classList.remove('dragover');
                    });
                    childrenContainer.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        childrenContainer.classList.remove('dragover');
                        
                        const existingPath = e.dataTransfer.getData('existingPath');
                        if (existingPath) {
                            // Moving existing element
                            const path = JSON.parse(existingPath);
                            moveHtmlCardElement(path, element.id);
                        } else {
                            // Adding new element
                            const type = e.dataTransfer.getData('type');
                            const field = e.dataTransfer.getData('field');
                            const odooField = e.dataTransfer.getData('odooField');
                            addHtmlCardElement(type, field, odooField, element.id);
                        }
                    });
                    
                    div.appendChild(childrenContainer);
                    if (element.children.length > 0) {
                        renderElements(element.children, childrenContainer, currentPath.concat(['children']));
                    }
                }
                
                container.appendChild(div);
            });
        }
        
        function renderHtmlCardElementPreview(element, path) {
            const pathStr = path.join(',');
            
            if (element.type === 'heading') {
                const pathJson = JSON.stringify(path);
                return `
                    <input type="text" value="${element.text}" data-path='${pathJson}' 
                        oninput="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'text', this.value, true)" 
                        onchange="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'text', this.value, false)" 
                        style="width: 100%; font-size: 1.2rem; font-weight: bold; border: 1px solid #ddd; padding: 0.5rem; border-radius: 4px;">
                    <select data-path='${pathJson}' class="select select-sm select-bordered w-full mt-2" onchange="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'level', this.value, false)">
                        <option value="h1" ${element.level === 'h1' ? 'selected' : ''}>H1</option>
                        <option value="h2" ${element.level === 'h2' ? 'selected' : ''}>H2</option>
                        <option value="h3" ${element.level === 'h3' ? 'selected' : ''}>H3</option>
                    </select>
                `;
            } else if (element.type === 'text') {
                const pathJson = JSON.stringify(path);
                return `
                    <textarea data-path='${pathJson}' 
                        oninput="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'text', this.value, true)" 
                        onchange="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'text', this.value, false)" 
                        style="width: 100%; min-height: 60px; border: 1px solid #ddd; padding: 0.5rem; border-radius: 4px; font-family: inherit;">${element.text}</textarea>
                `;
            } else if (element.type === 'divider') {
                return '<hr style="border: none; border-top: 2px solid #ddd; margin: 0.5rem 0;">';
            } else if (element.type === 'container') {
                const pathJson = JSON.stringify(path);
                return `
                    <div style="margin-bottom: 0.5rem;">
                        <input type="text" value="${element.title}" data-path='${pathJson}' 
                            oninput="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'title', this.value, true)" 
                            onchange="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'title', this.value, false)" 
                            style="width: 100%; font-weight: 600; border: 1px solid #ddd; padding: 0.5rem; border-radius: 4px;">
                    </div>
                    <select data-path='${pathJson}' class="select select-sm select-bordered w-full" onchange="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'layout', this.value, false)">
                        <option value="vertical" ${element.layout === 'vertical' ? 'selected' : ''}>Vertical</option>
                        <option value="horizontal" ${element.layout === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                        <option value="grid" ${element.layout === 'grid' ? 'selected' : ''}>Grid (2 columns)</option>
                    </select>
                `;
            } else if (element.type === 'field' || element.type === 'step-field') {
                const labelValue = escapeHtml(element.label || element.odooField || element.field);
                const pathJson = JSON.stringify(path);
                return `
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <input type="text" value="${labelValue}" 
                            data-path='${pathJson}'
                            oninput="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'label', this.value, true)" 
                            onchange="updateHtmlCardElementByPathJson(this.getAttribute('data-path'), 'label', this.value, false)" 
                            placeholder="Label" style="flex: 1; border: 1px solid #ddd; padding: 0.5rem; border-radius: 4px;">
                        <span class="${element.type === 'step-field' ? 'step-chip' : 'field-chip'}" style="flex-shrink: 0;">
                            ${element.odooField || element.field}
                        </span>
                    </div>
                `;
            }
            return '';
        }
        
        function updateHtmlCardElementByPathJson(pathJson, property, value, skipRender) {
            const path = JSON.parse(pathJson);
            updateHtmlCardElementByPath(path, property, value, skipRender);
        }
        
        function updateHtmlCardElementByPath(path, property, value, skipRender) {
            console.log('updateHtmlCardElementByPath called:', { path, property, value, skipRender });
            
            let current = htmlCardElements;
            
            // Navigate through the path to find the target element
            for (let i = 0; i < path.length - 1; i++) {
                const key = path[i];
                
                if (key === 'children') {
                    // Next key should be the index in children array
                    if (current.children) {
                        current = current.children;
                    }
                } else if (typeof key === 'number') {
                    // Numeric index
                    current = current[key];
                } else {
                    // Property name
                    current = current[key];
                }
            }
            
            // Update the property on the final element
            const lastKey = path[path.length - 1];
            
            if (current && current[lastKey]) {
                current[lastKey][property] = value;
                console.log('Updated element:', current[lastKey]);
                
                // Only re-render if not skipped (e.g., on blur/change, not on input)
                if (!skipRender) {
                    renderHtmlCardCanvas();
                }
            } else {
                console.error('Could not find element at path:', path, 'current:', current);
            }
        }
        
        function removeHtmlCardElementByPathJson(pathJson) {
            const path = JSON.parse(pathJson);
            removeHtmlCardElementByPath(path);
        }
        
        function removeHtmlCardElementByPath(path) {
            let current = htmlCardElements;
            
            // Navigate through the path to find the parent array
            for (let i = 0; i < path.length - 1; i++) {
                const key = path[i];
                if (key === 'children') {
                    // Next key should be the index in children array
                    if (current.children) {
                        current = current.children;
                    }
                } else if (typeof key === 'number') {
                    // Numeric index
                    current = current[key];
                } else {
                    // Property name
                    current = current[key];
                }
            }
            
            // Remove the element at the last index
            const lastKey = path[path.length - 1];
            if (Array.isArray(current) && typeof lastKey === 'number') {
                current.splice(lastKey, 1);
            } else {
                console.error('Could not remove element at path:', path);
            }
            
            renderHtmlCardCanvas();
        }
        
        function saveHtmlCard() {
            // Save as JSON instead of HTML for easy re-editing
            const cardData = {
                version: 1,
                elements: htmlCardElements
            };
            
            console.log('Saving HTML Card data:', cardData);
            
            // Save to workflow step
            workflowSteps[currentHtmlCardStepIdx].html_card = JSON.stringify(cardData);
            
            console.log('Saved to workflow step:', workflowSteps[currentHtmlCardStepIdx].html_card);
            
            // Re-render workflow to show the updated HTML card
            renderWorkflowSteps();
            
            closeHtmlCardEditor();
            showAlert('HTML Card saved!', 'success');
        }
        
        function parseHtmlCardToElements(cardDataStr) {
            console.log('parseHtmlCardToElements called with:', cardDataStr);
            try {
                const cardData = JSON.parse(cardDataStr);
                console.log('Parsed cardData:', cardData);
                if (cardData.version === 1 && cardData.elements) {
                    htmlCardElements = cardData.elements;
                    console.log('Loaded elements:', htmlCardElements);
                } else {
                    // Legacy or invalid format
                    console.log('Legacy or invalid format, resetting elements');
                    htmlCardElements = [];
                }
            } catch (e) {
                // Invalid JSON, start fresh
                htmlCardElements = [];
            }
        }
        
        function generateHtmlFromElements(elements) {
            let html = '';
            elements.forEach(element => {
                if (element.type === 'heading') {
                    html += `<${element.level}>${element.text}</${element.level}>`;
                } else if (element.type === 'text') {
                    html += `<p>${element.text}</p>`;
                } else if (element.type === 'divider') {
                    html += '<hr>';
                } else if (element.type === 'container') {
                    const layoutClass = element.layout === 'horizontal' ? 'flex-row' : element.layout === 'grid' ? 'grid-2col' : 'flex-col';
                    html += `<div class="container ${layoutClass}"><h4>${element.title}</h4>`;
                    if (element.children && element.children.length > 0) {
                        html += `<div class="container-content">${generateHtmlFromElements(element.children)}</div>`;
                    }
                    html += '</div>';
                } else if (element.type === 'field') {
                    html += `<div class="field"><label>${element.label}:</label> <span>\${field.${element.field}}</span></div>`;
                } else if (element.type === 'step-field') {
                    html += `<div class="field"><label>${element.label}:</label> <span>\$${element.field}</span></div>`;
                }
            });
            return html;
        }
        
        function showAlert(message, type) {
            const alert = document.createElement('div');
            alert.className = `alert ${type}`;
            alert.textContent = message;
            document.body.appendChild(alert);
            setTimeout(() => alert.remove(), 3000);
        }
        
        function copyWebhookUrl(url) {
            navigator.clipboard.writeText(url).then(() => {
                showAlert('Webhook URL gekopieerd naar klembord!', 'alert-success');
            }).catch(err => {
                showAlert('Kopiëren mislukt: ' + err.message, 'alert-error');
            });
        }
    