// Configuration
const API_BASE = 'https://forminator-sync.openvme-odoo.workers.dev/api';
let adminToken = localStorage.getItem('adminToken');
let currentFormId = null;
let mappings = {};

// Initialize
if (adminToken) {
    showMainInterface();
    loadMappings();
}

// Authentication
async function login() {
    const token = document.getElementById('tokenInput').value;
    
    if (!token) {
        showError('loginError', 'Voer een token in');
        return;
    }
    
    // Test token by fetching mappings
    try {
        const response = await fetch(`${API_BASE}/mappings`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            adminToken = token;
            localStorage.setItem('adminToken', token);
            showMainInterface();
            loadMappings();
        } else {
            showError('loginError', 'Ongeldige token');
        }
    } catch (error) {
        showError('loginError', 'Fout bij verbinden: ' + error.message);
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    location.reload();
}

function showMainInterface() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainInterface').style.display = 'block';
}

// API Calls
async function loadMappings() {
    try {
        const response = await fetch(`${API_BASE}/mappings`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load mappings');
        
        const result = await response.json();
        mappings = result.data || {};
        renderFormList();
    } catch (error) {
        showAlert('error', 'Fout bij laden: ' + error.message);
    }
}

async function saveFormMapping(formId, data) {
    try {
        const response = await fetch(`${API_BASE}/mappings/${formId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to save mapping');
        
        const result = await response.json();
        mappings[formId] = data;
        renderFormList();
        showAlert('success', 'Formulier opgeslagen!');
        return true;
    } catch (error) {
        showAlert('error', 'Fout bij opslaan: ' + error.message);
        return false;
    }
}

async function deleteFormMapping(formId) {
    if (!confirm(`Formulier ${formId} verwijderen?`)) return;
    
    try {
        const response = await fetch(`${API_BASE}/mappings/${formId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete mapping');
        
        delete mappings[formId];
        renderFormList();
        showEditor(null);
        showAlert('success', 'Formulier verwijderd!');
    } catch (error) {
        showAlert('error', 'Fout bij verwijderen: ' + error.message);
    }
}

async function importMappingsToAPI(data) {
    try {
        const response = await fetch(`${API_BASE}/mappings/import`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mappings: data })
        });
        
        if (!response.ok) throw new Error('Failed to import mappings');
        
        mappings = data;
        renderFormList();
        showAlert('success', 'Mappings geïmporteerd!');
    } catch (error) {
        showAlert('error', 'Fout bij importeren: ' + error.message);
    }
}

// UI Functions
function renderFormList() {
    const formList = document.getElementById('formList');
    formList.innerHTML = '';
    
    const formIds = Object.keys(mappings).filter(id => !id.startsWith('_'));
    
    if (formIds.length === 0) {
        formList.innerHTML = '<li style="color: #999; padding: 12px;">Geen formulieren</li>';
        return;
    }
    
    formIds.forEach(formId => {
        const li = document.createElement('li');
        li.className = 'form-item' + (formId === currentFormId ? ' active' : '');
        li.innerHTML = `
            <span onclick="loadForm('${formId}')">Form ${formId}</span>
            <button onclick="event.stopPropagation(); deleteFormMapping('${formId}')">×</button>
        `;
        formList.appendChild(li);
    });
}

function loadForm(formId) {
    currentFormId = formId;
    renderFormList();
    showEditor(formId);
}

function showEditor(formId) {
    const emptyState = document.getElementById('emptyState');
    const editorContent = document.getElementById('editorContent');
    
    if (!formId) {
        emptyState.classList.remove('hidden');
        editorContent.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    editorContent.classList.remove('hidden');
    
    const mapping = mappings[formId] || {};
    
    document.getElementById('editorTitle').textContent = `Formulier ${formId}`;
    document.getElementById('formId').value = formId;
    
    // Load field mappings
    const fieldMappings = mapping.field_mapping || {};
    renderFieldMappings(fieldMappings);
    
    // Load workflow
    document.getElementById('workflowJson').value = JSON.stringify(mapping.workflow || [], null, 2);
}

function renderFieldMappings(fieldMappings) {
    const container = document.getElementById('fieldMappings');
    container.innerHTML = '';
    
    Object.entries(fieldMappings).forEach(([key, value]) => {
        addFieldMappingRow(key, value);
    });
    
    if (Object.keys(fieldMappings).length === 0) {
        addFieldMappingRow('', '');
    }
}

function addFieldMapping() {
    addFieldMappingRow('', '');
}

function addFieldMappingRow(key = '', value = '') {
    const container = document.getElementById('fieldMappings');
    const row = document.createElement('div');
    row.className = 'mapping-row';
    row.innerHTML = `
        <input type="text" placeholder="forminator_field" value="${key}" class="mapping-key" />
        <input type="text" placeholder="odoo_field" value="${value}" class="mapping-value" />
        <button onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
}

function createNewForm() {
    const formId = prompt('Voer Form ID in:');
    if (!formId) return;
    
    if (mappings[formId]) {
        showAlert('error', 'Formulier bestaat al!');
        return;
    }
    
    mappings[formId] = {
        field_mapping: {},
        workflow: []
    };
    
    currentFormId = formId;
    renderFormList();
    showEditor(formId);
}

async function saveForm() {
    const formId = document.getElementById('formId').value;
    
    if (!formId) {
        showAlert('error', 'Form ID is verplicht');
        return;
    }
    
    // Collect field mappings
    const fieldMappings = {};
    document.querySelectorAll('#fieldMappings .mapping-row').forEach(row => {
        const key = row.querySelector('.mapping-key').value.trim();
        const value = row.querySelector('.mapping-value').value.trim();
        if (key && value) {
            fieldMappings[key] = value;
        }
    });
    
    // Parse workflow JSON
    let workflow;
    try {
        workflow = JSON.parse(document.getElementById('workflowJson').value);
    } catch (error) {
        showAlert('error', 'Ongeldige workflow JSON: ' + error.message);
        return;
    }
    
    const data = {
        field_mapping: fieldMappings,
        workflow: workflow
    };
    
    const success = await saveFormMapping(formId, data);
    if (success && formId !== currentFormId) {
        currentFormId = formId;
        renderFormList();
    }
}

async function deleteForm() {
    if (!currentFormId) return;
    await deleteFormMapping(currentFormId);
}

function cancelEdit() {
    currentFormId = null;
    renderFormList();
    showEditor(null);
}

function exportMappings() {
    const dataStr = JSON.stringify(mappings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'forminator-mappings.json';
    link.click();
    URL.revokeObjectURL(url);
}

function importMappings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            await importMappingsToAPI(data);
        } catch (error) {
            showAlert('error', 'Ongeldige JSON: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
}

// Utility Functions
function showAlert(type, message) {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    
    setTimeout(() => alert.remove(), 5000);
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.remove('hidden');
    
    setTimeout(() => element.classList.add('hidden'), 5000);
}

// Enter key for login
document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.getElementById('tokenInput');
    if (tokenInput) {
        tokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }
});
