/**
 * Project Generator - Client-side UI Logic
 * 
 * ALL dynamic UI rendering and interaction logic.
 * NO template literals for HTML generation.
 * DOM APIs only: createElement, textContent, appendChild.
 */

let editingTemplateId = null;

// Theme management
function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('selectedTheme', theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('selectedTheme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const selector = document.getElementById('themeSelector');
  if (selector) selector.value = savedTheme;
}

// Auth
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  localStorage.removeItem('adminToken');
  window.location.href = '/';
}

// Render a single template row using DOM APIs (safe by default)
function renderTemplateRow(template) {
  const tr = document.createElement('tr');
  
  // Name column
  const nameTd = document.createElement('td');
  nameTd.className = 'font-semibold';
  nameTd.textContent = template.name;
  tr.appendChild(nameTd);
  
  // Description column
  const descTd = document.createElement('td');
  descTd.className = 'text-sm text-base-content/60';
  if (template.description) {
    descTd.textContent = template.description;
  } else {
    const em = document.createElement('em');
    em.className = 'text-base-content/40';
    em.textContent = 'No description';
    descTd.appendChild(em);
  }
  tr.appendChild(descTd);
  
  // Created date column
  const createdTd = document.createElement('td');
  createdTd.className = 'text-sm';
  createdTd.textContent = formatDate(template.created_at);
  tr.appendChild(createdTd);
  
  // Updated date column
  const updatedTd = document.createElement('td');
  updatedTd.className = 'text-sm';
  updatedTd.textContent = formatDate(template.updated_at);
  tr.appendChild(updatedTd);
  
  // Actions column
  const actionsTd = document.createElement('td');
  actionsTd.className = 'text-right';
  
  // Edit Blueprint button
  const blueprintBtn = document.createElement('button');
  blueprintBtn.className = 'btn btn-ghost btn-sm';
  blueprintBtn.title = 'Edit Blueprint';
  blueprintBtn.onclick = () => window.location.href = '/projects/blueprint/' + template.id;
  
  const blueprintIcon = document.createElement('i');
  blueprintIcon.setAttribute('data-lucide', 'layout');
  blueprintIcon.className = 'w-4 h-4';
  blueprintBtn.appendChild(blueprintIcon);
  
  actionsTd.appendChild(blueprintBtn);
  
  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-ghost btn-sm';
  editBtn.title = 'Edit';
  editBtn.onclick = () => editTemplate(template.id);
  
  const editIcon = document.createElement('i');
  editIcon.setAttribute('data-lucide', 'edit-2');
  editIcon.className = 'w-4 h-4';
  editBtn.appendChild(editIcon);
  
  actionsTd.appendChild(editBtn);
  
  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-ghost btn-sm text-error';
  deleteBtn.title = 'Delete';
  deleteBtn.onclick = () => deleteTemplate(template.id, template.name);
  
  const deleteIcon = document.createElement('i');
  deleteIcon.setAttribute('data-lucide', 'trash-2');
  deleteIcon.className = 'w-4 h-4';
  deleteBtn.appendChild(deleteIcon);
  
  actionsTd.appendChild(deleteBtn);
  tr.appendChild(actionsTd);
  
  return tr;
}

// Load templates
async function loadTemplates() {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const templatesTable = document.getElementById('templatesTable');
  const tableBody = document.getElementById('templatesTableBody');
  
  loadingState.style.display = 'flex';
  emptyState.style.display = 'none';
  templatesTable.style.display = 'none';
  
  try {
    const response = await fetch('/projects/api/templates', {
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      const templates = result.data || [];
      
      if (templates.length === 0) {
        loadingState.style.display = 'none';
        emptyState.style.display = 'block';
      } else {
        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Append each row using DOM APIs
        templates.forEach(template => {
          tableBody.appendChild(renderTemplateRow(template));
        });
        
        loadingState.style.display = 'none';
        templatesTable.style.display = 'block';
        
        // Initialize Lucide icons after DOM insertion
        lucide.createIcons();
      }
    } else {
      showToast('Failed to load templates: ' + result.error, 'error');
      loadingState.style.display = 'none';
      emptyState.style.display = 'block';
    }
  } catch (err) {
    console.error('Load templates error:', err);
    showToast('Network error. Please try again.', 'error');
    loadingState.style.display = 'none';
    emptyState.style.display = 'block';
  }
}

// Open create modal
function openCreateModal() {
  editingTemplateId = null;
  document.getElementById('modalTitle').textContent = 'Create Template';
  document.getElementById('submitBtnText').textContent = 'Create Template';
  document.getElementById('templateForm').reset();
  document.getElementById('nameError').style.display = 'none';
  document.getElementById('templateModal').showModal();
}

// Edit template
async function editTemplate(id) {
  try {
    const response = await fetch('/projects/api/templates', {
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      const template = result.data.find(t => t.id === id);
      if (template) {
        editingTemplateId = id;
        document.getElementById('modalTitle').textContent = 'Edit Template';
        document.getElementById('submitBtnText').textContent = 'Save Changes';
        document.getElementById('templateName').value = template.name;
        document.getElementById('templateDescription').value = template.description || '';
        document.getElementById('nameError').style.display = 'none';
        document.getElementById('templateModal').showModal();
      }
    }
  } catch (err) {
    console.error('Edit template error:', err);
    showToast('Failed to load template', 'error');
  }
}

// Close modal
function closeModal() {
  document.getElementById('templateModal').close();
}

// Submit form
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const nameInput = document.getElementById('templateName');
  const descriptionInput = document.getElementById('templateDescription');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitBtnSpinner = document.getElementById('submitBtnSpinner');
  const nameError = document.getElementById('nameError');
  
  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();
  
  // Validate
  if (!name) {
    nameError.textContent = 'Name is required';
    nameError.style.display = 'block';
    nameInput.focus();
    return;
  }
  
  nameError.style.display = 'none';
  submitBtn.disabled = true;
  submitBtnText.style.display = 'none';
  submitBtnSpinner.style.display = 'inline-block';
  
  try {
    const url = editingTemplateId 
      ? `/projects/api/templates/${editingTemplateId}`
      : '/projects/api/templates';
    
    const method = editingTemplateId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, description })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(
        editingTemplateId ? 'Template updated' : 'Template created', 
        'success'
      );
      closeModal();
      loadTemplates();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Network error. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtnText.style.display = 'inline';
    submitBtnSpinner.style.display = 'none';
  }
}

// Delete template
async function deleteTemplate(id, name) {
  // Safe: name is used in confirm(), which doesn't interpret HTML
  if (!confirm('Are you sure you want to delete "' + name + '"?\n\nThis action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`/projects/api/templates/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Template deleted', 'success');
      loadTemplates();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Network error. Please try again.', 'error');
  }
}

// Show toast using DOM APIs (safe by default)
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const alertClass = type === 'success' ? 'alert-success' : 
                    type === 'error' ? 'alert-error' : 'alert-info';
  
  const toast = document.createElement('div');
  toast.className = 'alert ' + alertClass + ' shadow-lg';
  
  const span = document.createElement('span');
  span.textContent = message;  // Auto-escaped
  toast.appendChild(span);
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Utilities
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the blueprint editor page
  if (window.TEMPLATE_ID) {
    initBlueprintEditor();
    return;
  }
  
  // Event listeners for template library
  document.getElementById('newTemplateBtn').addEventListener('click', openCreateModal);
  document.getElementById('emptyStateCreateBtn').addEventListener('click', openCreateModal);
  document.getElementById('templateForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  
  // Initialize
  initTheme();
  lucide.createIcons();
  loadTemplates();
});

// ============================================================================
// BLUEPRINT EDITOR
// ============================================================================

let blueprintState = null;
let savedBlueprintState = null;
let editingStageId = null;
let editingMilestoneId = null;
let editingTaskId = null;
let editingDependencyIndex = null;

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Deep clone object
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Initialize blueprint editor
async function initBlueprintEditor() {
  initTheme();
  
  // Event listeners
  document.getElementById('saveBtn').addEventListener('click', saveBlueprintClick);
  document.getElementById('cancelBtn').addEventListener('click', cancelBlueprintClick);
  
  document.getElementById('addStageBtn').addEventListener('click', () => openStageModal());
  document.getElementById('addMilestoneBtn').addEventListener('click', () => openMilestoneModal());
  document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
  document.getElementById('addDependencyBtn').addEventListener('click', () => openDependencyModal());
  
  document.getElementById('stageForm').addEventListener('submit', handleStageSubmit);
  document.getElementById('milestoneForm').addEventListener('submit', handleMilestoneSubmit);
  document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
  document.getElementById('dependencyForm').addEventListener('submit', handleDependencySubmit);
  
  // Load blueprint
  await loadBlueprint();
  
  lucide.createIcons();
}

// Load blueprint from server
async function loadBlueprint() {
  try {
    const response = await fetch(`/projects/api/blueprint/${window.TEMPLATE_ID}`, {
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      const data = result.data || {};
      
      // Ensure all required properties exist with defaults
      blueprintState = {
        stages: data.stages || [],
        milestones: data.milestones || [],
        tasks: data.tasks || [],
        dependencies: data.dependencies || []
      };
      
      savedBlueprintState = deepClone(blueprintState);
      
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('blueprintContent').style.display = 'block';
      
      renderAllSections();
      validateAndDisplay();
      
    } else {
      showToast('Failed to load blueprint: ' + result.error, 'error');
    }
  } catch (err) {
    console.error('Load blueprint error:', err);
    showToast('Network error loading blueprint', 'error');
  }
}

// Save blueprint to server
async function saveBlueprintClick() {
  const validation = validateBlueprint();
  
  if (!validation.valid) {
    showToast('Cannot save: blueprint has errors', 'error');
    return;
  }
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  
  try {
    const response = await fetch(`/projects/api/blueprint/${window.TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(blueprintState)
    });
    
    const result = await response.json();
    
    if (result.success) {
      savedBlueprintState = deepClone(blueprintState);
      showToast('Blueprint saved successfully', 'success');
      validateAndDisplay();
    } else {
      showToast('Save failed: ' + result.error, 'error');
    }
  } catch (err) {
    console.error('Save blueprint error:', err);
    showToast('Network error saving blueprint', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// Cancel and revert to saved state
function cancelBlueprintClick() {
  if (confirm('Discard unsaved changes?')) {
    blueprintState = deepClone(savedBlueprintState);
    renderAllSections();
    validateAndDisplay();
    showToast('Changes discarded', 'info');
  }
}

// Render all sections
function renderAllSections() {
  renderStages();
  renderMilestones();
  renderTasks();
  renderDependencies();
}

// ============================================================================
// STAGES
// ============================================================================

function renderStages() {
  const list = document.getElementById('stagesList');
  const empty = document.getElementById('emptyStages');
  
  list.innerHTML = '';
  
  if (blueprintState.stages.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  const sortedStages = [...blueprintState.stages].sort((a, b) => a.sequence - b.sequence);
  
  sortedStages.forEach((stage, index) => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 bg-base-200 rounded';
    
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center gap-3';
    
    const seqSpan = document.createElement('span');
    seqSpan.className = 'badge badge-neutral';
    seqSpan.textContent = stage.sequence;
    leftDiv.appendChild(seqSpan);
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold';
    nameSpan.textContent = stage.name;
    leftDiv.appendChild(nameSpan);
    
    div.appendChild(leftDiv);
    
    const btnDiv = document.createElement('div');
    btnDiv.className = 'flex gap-1';
    
    // Up button
    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'btn btn-xs btn-ghost';
      upBtn.title = 'Move up';
      upBtn.onclick = () => moveStage(stage.id, -1);
      const upIcon = document.createElement('i');
      upIcon.setAttribute('data-lucide', 'arrow-up');
      upIcon.className = 'w-3 h-3';
      upBtn.appendChild(upIcon);
      btnDiv.appendChild(upBtn);
    }
    
    // Down button
    if (index < sortedStages.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'btn btn-xs btn-ghost';
      downBtn.title = 'Move down';
      downBtn.onclick = () => moveStage(stage.id, 1);
      const downIcon = document.createElement('i');
      downIcon.setAttribute('data-lucide', 'arrow-down');
      downIcon.className = 'w-3 h-3';
      downBtn.appendChild(downIcon);
      btnDiv.appendChild(downBtn);
    }
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-xs btn-ghost';
    editBtn.title = 'Edit';
    editBtn.onclick = () => openStageModal(stage.id);
    const editIcon = document.createElement('i');
    editIcon.setAttribute('data-lucide', 'edit-2');
    editIcon.className = 'w-3 h-3';
    editBtn.appendChild(editIcon);
    btnDiv.appendChild(editBtn);
    
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-ghost text-error';
    delBtn.title = 'Delete';
    delBtn.onclick = () => deleteStage(stage.id);
    const delIcon = document.createElement('i');
    delIcon.setAttribute('data-lucide', 'trash-2');
    delIcon.className = 'w-3 h-3';
    delBtn.appendChild(delIcon);
    btnDiv.appendChild(delBtn);
    
    div.appendChild(btnDiv);
    list.appendChild(div);
  });
  
  lucide.createIcons();
}

function openStageModal(stageId = null) {
  editingStageId = stageId;
  const modal = document.getElementById('stageModal');
  const title = document.getElementById('stageModalTitle');
  const nameInput = document.getElementById('stageName');
  const seqInput = document.getElementById('stageSequence');
  
  if (stageId) {
    const stage = blueprintState.stages.find(s => s.id === stageId);
    title.textContent = 'Edit Stage';
    nameInput.value = stage.name;
    seqInput.value = stage.sequence;
  } else {
    title.textContent = 'Add Stage';
    nameInput.value = '';
    const maxSeq = Math.max(0, ...blueprintState.stages.map(s => s.sequence));
    seqInput.value = maxSeq + 1;
  }
  
  modal.showModal();
}

function handleStageSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('stageName').value.trim();
  const sequence = parseInt(document.getElementById('stageSequence').value);
  
  if (!name) return;
  
  if (editingStageId) {
    const stage = blueprintState.stages.find(s => s.id === editingStageId);
    stage.name = name;
    stage.sequence = sequence;
  } else {
    blueprintState.stages.push({
      id: generateUUID(),
      name: name,
      sequence: sequence
    });
  }
  
  document.getElementById('stageModal').close();
  renderStages();
  validateAndDisplay();
}

function deleteStage(stageId) {
  const stage = blueprintState.stages.find(s => s.id === stageId);
  if (confirm('Delete stage "' + stage.name + '"?')) {
    blueprintState.stages = blueprintState.stages.filter(s => s.id !== stageId);
    renderStages();
    validateAndDisplay();
  }
}

function moveStage(stageId, direction) {
  const sortedStages = [...blueprintState.stages].sort((a, b) => a.sequence - b.sequence);
  const index = sortedStages.findIndex(s => s.id === stageId);
  const targetIndex = index + direction;
  
  if (targetIndex >= 0 && targetIndex < sortedStages.length) {
    const tempSeq = sortedStages[index].sequence;
    sortedStages[index].sequence = sortedStages[targetIndex].sequence;
    sortedStages[targetIndex].sequence = tempSeq;
    
    renderStages();
    validateAndDisplay();
  }
}

// ============================================================================
// MILESTONES
// ============================================================================

function renderMilestones() {
  const list = document.getElementById('milestonesList');
  const empty = document.getElementById('emptyMilestones');
  
  list.innerHTML = '';
  
  if (blueprintState.milestones.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  blueprintState.milestones.forEach(milestone => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 bg-base-200 rounded';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold';
    nameSpan.textContent = milestone.name;
    div.appendChild(nameSpan);
    
    const btnDiv = document.createElement('div');
    btnDiv.className = 'flex gap-1';
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-xs btn-ghost';
    editBtn.title = 'Edit';
    editBtn.onclick = () => openMilestoneModal(milestone.id);
    const editIcon = document.createElement('i');
    editIcon.setAttribute('data-lucide', 'edit-2');
    editIcon.className = 'w-3 h-3';
    editBtn.appendChild(editIcon);
    btnDiv.appendChild(editBtn);
    
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-ghost text-error';
    delBtn.title = 'Delete';
    delBtn.onclick = () => deleteMilestone(milestone.id);
    const delIcon = document.createElement('i');
    delIcon.setAttribute('data-lucide', 'trash-2');
    delIcon.className = 'w-3 h-3';
    delBtn.appendChild(delIcon);
    btnDiv.appendChild(delBtn);
    
    div.appendChild(btnDiv);
    list.appendChild(div);
  });
  
  lucide.createIcons();
}

function openMilestoneModal(milestoneId = null) {
  editingMilestoneId = milestoneId;
  const modal = document.getElementById('milestoneModal');
  const title = document.getElementById('milestoneModalTitle');
  const nameInput = document.getElementById('milestoneName');
  
  if (milestoneId) {
    const milestone = blueprintState.milestones.find(m => m.id === milestoneId);
    title.textContent = 'Edit Milestone';
    nameInput.value = milestone.name;
  } else {
    title.textContent = 'Add Milestone';
    nameInput.value = '';
  }
  
  modal.showModal();
}

function handleMilestoneSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('milestoneName').value.trim();
  if (!name) return;
  
  if (editingMilestoneId) {
    const milestone = blueprintState.milestones.find(m => m.id === editingMilestoneId);
    milestone.name = name;
  } else {
    blueprintState.milestones.push({
      id: generateUUID(),
      name: name
    });
  }
  
  document.getElementById('milestoneModal').close();
  renderMilestones();
  renderTasks(); // Re-render tasks to update milestone options
  validateAndDisplay();
}

function deleteMilestone(milestoneId) {
  const milestone = blueprintState.milestones.find(m => m.id === milestoneId);
  if (confirm('Delete milestone "' + milestone.name + '"?\n\nTasks assigned to this milestone will become unassigned.')) {
    blueprintState.milestones = blueprintState.milestones.filter(m => m.id !== milestoneId);
    
    // Clear milestone_id from tasks
    blueprintState.tasks.forEach(task => {
      if (task.milestone_id === milestoneId) {
        task.milestone_id = null;
      }
    });
    
    renderMilestones();
    renderTasks();
    validateAndDisplay();
  }
}

// ============================================================================
// TASKS
// ============================================================================

function renderTasks() {
  const list = document.getElementById('tasksList');
  const empty = document.getElementById('emptyTasks');
  
  list.innerHTML = '';
  
  if (blueprintState.tasks.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  // Render parent tasks first
  const parentTasks = blueprintState.tasks.filter(t => !t.parent_id);
  
  parentTasks.forEach(task => {
    renderTaskItem(task, 0, list);
    
    // Render subtasks
    const subtasks = blueprintState.tasks.filter(t => t.parent_id === task.id);
    subtasks.forEach(subtask => {
      renderTaskItem(subtask, 1, list);
    });
  });
  
  lucide.createIcons();
}

function renderTaskItem(task, level, container) {
  const div = document.createElement('div');
  div.className = 'flex items-center justify-between p-3 bg-base-200 rounded';
  if (level > 0) {
    div.style.marginLeft = (level * 2) + 'rem';
    div.className += ' border-l-4 border-primary';
  }
  
  const leftDiv = document.createElement('div');
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'font-semibold';
  if (level > 0) {
    nameSpan.className += ' text-sm';
  }
  nameSpan.textContent = task.name;
  leftDiv.appendChild(nameSpan);
  
  // Show milestone
  if (task.milestone_id) {
    const milestone = blueprintState.milestones.find(m => m.id === task.milestone_id);
    if (milestone) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-sm badge-primary ml-2';
      badge.textContent = milestone.name;
      leftDiv.appendChild(badge);
    }
  }
  
  div.appendChild(leftDiv);
  
  const btnDiv = document.createElement('div');
  btnDiv.className = 'flex gap-1';
  
  // Add subtask button (for parent tasks)
  if (!task.parent_id) {
    const addSubBtn = document.createElement('button');
    addSubBtn.className = 'btn btn-xs btn-ghost';
    addSubBtn.title = 'Add subtask';
    addSubBtn.onclick = () => openTaskModal(null, task.id);
    const addIcon = document.createElement('i');
    addIcon.setAttribute('data-lucide', 'plus-circle');
    addIcon.className = 'w-3 h-3';
    addSubBtn.appendChild(addIcon);
    btnDiv.appendChild(addSubBtn);
  }
  
  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-xs btn-ghost';
  editBtn.title = 'Edit';
  editBtn.onclick = () => openTaskModal(task.id);
  const editIcon = document.createElement('i');
  editIcon.setAttribute('data-lucide', 'edit-2');
  editIcon.className = 'w-3 h-3';
  editBtn.appendChild(editIcon);
  btnDiv.appendChild(editBtn);
  
  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-xs btn-ghost text-error';
  delBtn.title = 'Delete';
  delBtn.onclick = () => deleteTask(task.id);
  const delIcon = document.createElement('i');
  delIcon.setAttribute('data-lucide', 'trash-2');
  delIcon.className = 'w-3 h-3';
  delBtn.appendChild(delIcon);
  btnDiv.appendChild(delBtn);
  
  div.appendChild(btnDiv);
  container.appendChild(div);
}

function openTaskModal(taskId = null, parentId = null) {
  editingTaskId = taskId;
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('taskModalTitle');
  const nameInput = document.getElementById('taskName');
  const milestoneSelect = document.getElementById('taskMilestone');
  const parentSelect = document.getElementById('taskParent');
  
  // Populate milestone options
  milestoneSelect.innerHTML = '<option value="">No milestone</option>';
  blueprintState.milestones.forEach(milestone => {
    const option = document.createElement('option');
    option.value = milestone.id;
    option.textContent = milestone.name;
    milestoneSelect.appendChild(option);
  });
  
  // Populate parent task options (only parent tasks, not subtasks)
  parentSelect.innerHTML = '<option value="">No parent (main task)</option>';
  const parentTasks = blueprintState.tasks.filter(t => !t.parent_id && t.id !== taskId);
  parentTasks.forEach(task => {
    const option = document.createElement('option');
    option.value = task.id;
    option.textContent = task.name;
    parentSelect.appendChild(option);
  });
  
  if (taskId) {
    const task = blueprintState.tasks.find(t => t.id === taskId);
    title.textContent = task.parent_id ? 'Edit Subtask' : 'Edit Task';
    nameInput.value = task.name;
    milestoneSelect.value = task.milestone_id || '';
    parentSelect.value = task.parent_id || '';
  } else {
    title.textContent = parentId ? 'Add Subtask' : 'Add Task';
    nameInput.value = '';
    milestoneSelect.value = '';
    parentSelect.value = parentId || '';
  }
  
  modal.showModal();
}

function handleTaskSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('taskName').value.trim();
  const milestoneId = document.getElementById('taskMilestone').value || null;
  const parentId = document.getElementById('taskParent').value || null;
  
  if (!name) return;
  
  if (editingTaskId) {
    const task = blueprintState.tasks.find(t => t.id === editingTaskId);
    task.name = name;
    task.milestone_id = milestoneId;
    task.parent_id = parentId;
  } else {
    blueprintState.tasks.push({
      id: generateUUID(),
      name: name,
      milestone_id: milestoneId,
      parent_id: parentId
    });
  }
  
  document.getElementById('taskModal').close();
  renderTasks();
  renderDependencies(); // Re-render dependencies to update task options
  validateAndDisplay();
}

function deleteTask(taskId) {
  const task = blueprintState.tasks.find(t => t.id === taskId);
  
  // Check if task has subtasks
  const hasSubtasks = blueprintState.tasks.some(t => t.parent_id === taskId);
  
  let confirmMsg = 'Delete task "' + task.name + '"?';
  if (hasSubtasks) {
    confirmMsg += '\n\nThis will also delete all subtasks.';
  }
  
  if (confirm(confirmMsg)) {
    // Delete task and subtasks
    blueprintState.tasks = blueprintState.tasks.filter(t => 
      t.id !== taskId && t.parent_id !== taskId
    );
    
    // Remove dependencies
    blueprintState.dependencies = blueprintState.dependencies.filter(d =>
      d.task_id !== taskId && d.depends_on_task_id !== taskId
    );
    
    renderTasks();
    renderDependencies();
    validateAndDisplay();
  }
}

// ============================================================================
// DEPENDENCIES
// ============================================================================

function renderDependencies() {
  const list = document.getElementById('dependenciesList');
  const empty = document.getElementById('emptyDependencies');
  
  list.innerHTML = '';
  
  if (blueprintState.dependencies.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  blueprintState.dependencies.forEach((dep, index) => {
    const task = blueprintState.tasks.find(t => t.id === dep.task_id);
    const dependsOn = blueprintState.tasks.find(t => t.id === dep.depends_on_task_id);
    
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 bg-base-200 rounded';
    
    const textDiv = document.createElement('div');
    
    const taskSpan = document.createElement('span');
    taskSpan.className = 'font-semibold';
    taskSpan.textContent = task ? task.name : 'Unknown task';
    textDiv.appendChild(taskSpan);
    
    const arrow = document.createElement('span');
    arrow.className = 'mx-2 text-base-content/40';
    arrow.textContent = '→ depends on →';
    textDiv.appendChild(arrow);
    
    const dependsSpan = document.createElement('span');
    dependsSpan.className = 'font-semibold';
    dependsSpan.textContent = dependsOn ? dependsOn.name : 'Unknown task';
    textDiv.appendChild(dependsSpan);
    
    div.appendChild(textDiv);
    
    const btnDiv = document.createElement('div');
    btnDiv.className = 'flex gap-1';
    
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-ghost text-error';
    delBtn.title = 'Delete';
    delBtn.onclick = () => deleteDependency(index);
    const delIcon = document.createElement('i');
    delIcon.setAttribute('data-lucide', 'trash-2');
    delIcon.className = 'w-3 h-3';
    delBtn.appendChild(delIcon);
    btnDiv.appendChild(delBtn);
    
    div.appendChild(btnDiv);
    list.appendChild(div);
  });
  
  lucide.createIcons();
}

function openDependencyModal() {
  const modal = document.getElementById('dependencyModal');
  const taskSelect = document.getElementById('dependencyTask');
  const dependsOnSelect = document.getElementById('dependencyDependsOn');
  
  // Populate task options
  taskSelect.innerHTML = '<option value="">Select task...</option>';
  dependsOnSelect.innerHTML = '<option value="">Select task...</option>';
  
  blueprintState.tasks.forEach(task => {
    const option1 = document.createElement('option');
    option1.value = task.id;
    option1.textContent = task.name;
    taskSelect.appendChild(option1);
    
    const option2 = document.createElement('option');
    option2.value = task.id;
    option2.textContent = task.name;
    dependsOnSelect.appendChild(option2);
  });
  
  modal.showModal();
}

function handleDependencySubmit(e) {
  e.preventDefault();
  
  const taskId = document.getElementById('dependencyTask').value;
  const dependsOnTaskId = document.getElementById('dependencyDependsOn').value;
  
  if (!taskId || !dependsOnTaskId) return;
  
  // Check if dependency already exists
  const exists = blueprintState.dependencies.some(d =>
    d.task_id === taskId && d.depends_on_task_id === dependsOnTaskId
  );
  
  if (exists) {
    showToast('This dependency already exists', 'error');
    return;
  }
  
  blueprintState.dependencies.push({
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId
  });
  
  document.getElementById('dependencyModal').close();
  renderDependencies();
  validateAndDisplay();
}

function deleteDependency(index) {
  blueprintState.dependencies.splice(index, 1);
  renderDependencies();
  validateAndDisplay();
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateBlueprint() {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  const stages = blueprintState.stages || [];
  const milestones = blueprintState.milestones || [];
  const tasks = blueprintState.tasks || [];
  const dependencies = blueprintState.dependencies || [];
  
  // Validate tasks must have subtasks
  const parentTasks = tasks.filter(t => !t.parent_id);
  parentTasks.forEach(parent => {
    const hasSubtasks = tasks.some(t => t.parent_id === parent.id);
    if (!hasSubtasks) {
      result.errors.push('Task "' + parent.name + '" must have at least one subtask');
    }
  });
  
  // Validate dependencies
  dependencies.forEach(dep => {
    const taskExists = tasks.some(t => t.id === dep.task_id);
    const dependsOnExists = tasks.some(t => t.id === dep.depends_on_task_id);
    
    if (!taskExists) {
      result.errors.push('Dependency references non-existent task');
    }
    if (!dependsOnExists) {
      result.errors.push('Dependency references non-existent dependency target');
    }
    
    if (dep.task_id === dep.depends_on_task_id) {
      result.errors.push('Task cannot depend on itself');
    }
  });
  
  // Detect circular dependencies
  const graph = new Map();
  dependencies.forEach(dep => {
    if (!graph.has(dep.task_id)) {
      graph.set(dep.task_id, []);
    }
    graph.get(dep.task_id).push(dep.depends_on_task_id);
  });
  
  const visited = new Set();
  const recursionStack = new Set();
  
  function detectCycle(node, path) {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (detectCycle(neighbor, [...path])) return true;
      } else if (recursionStack.has(neighbor)) {
        const task = tasks.find(t => t.id === node);
        result.errors.push('Circular dependency detected involving task "' + (task ? task.name : node) + '"');
        return true;
      }
    }
    
    recursionStack.delete(node);
    return false;
  }
  
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      detectCycle(node, []);
    }
  }
  
  // Warnings
  milestones.forEach(milestone => {
    const hasTasksAssigned = tasks.some(t => t.milestone_id === milestone.id);
    if (!hasTasksAssigned) {
      result.warnings.push('Milestone "' + milestone.name + '" has no tasks assigned');
    }
  });
  
  const unassignedTasks = tasks.filter(t => !t.milestone_id && !t.parent_id);
  unassignedTasks.forEach(task => {
    result.warnings.push('Task "' + task.name + '" has no milestone assigned');
  });
  
  if (stages.length > 0 && tasks.length === 0) {
    result.warnings.push('Stages defined but no tasks exist');
  }
  
  result.valid = result.errors.length === 0;
  return result;
}

function validateAndDisplay() {
  const validation = validateBlueprint();
  
  const errorsDiv = document.getElementById('validationErrors');
  const warningsDiv = document.getElementById('validationWarnings');
  const errorsList = document.getElementById('errorList');
  const warningsList = document.getElementById('warningList');
  
  // Display errors
  if (validation.errors.length > 0) {
    errorsDiv.style.display = 'flex';
    errorsList.innerHTML = '';
    validation.errors.forEach(error => {
      const li = document.createElement('li');
      li.textContent = error;
      errorsList.appendChild(li);
    });
  } else {
    errorsDiv.style.display = 'none';
  }
  
  // Display warnings
  if (validation.warnings.length > 0) {
    warningsDiv.style.display = 'flex';
    warningsList.innerHTML = '';
    validation.warnings.forEach(warning => {
      const li = document.createElement('li');
      li.textContent = warning;
      warningsList.appendChild(li);
    });
  } else {
    warningsDiv.style.display = 'none';
  }
  
  lucide.createIcons();
}
