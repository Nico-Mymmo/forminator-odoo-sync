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
  
  // Generate Project button
  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn-primary btn-sm';
  generateBtn.title = 'Generate Project';
  generateBtn.onclick = () => generateProjectFromTemplate(template.id);
  
  const generateIcon = document.createElement('i');
  generateIcon.setAttribute('data-lucide', 'play');
  generateIcon.className = 'w-4 h-4';
  generateBtn.appendChild(generateIcon);
  
  actionsTd.appendChild(generateBtn);
  
  // View History button
  const historyBtn = document.createElement('button');
  historyBtn.className = 'btn btn-ghost btn-sm';
  historyBtn.title = 'View Generation History';
  historyBtn.onclick = () => window.location.href = '/projects/generations/' + template.id;
  
  const historyIcon = document.createElement('i');
  historyIcon.setAttribute('data-lucide', 'history');
  historyIcon.className = 'w-4 h-4';
  historyBtn.appendChild(historyIcon);
  
  actionsTd.appendChild(historyBtn);
  
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

// Generate project from template
async function generateProjectFromTemplate(templateId) {
  // STEP 0: Ask for project start date (Addendum H - datepicker UX)
  const projectStartDate = await showProjectStartDateModal();
  
  if (!projectStartDate) {
    // User cancelled
    return;
  }
  
  // Show loading toast for user fetching
  showToast('Fetching Odoo users...', 'info');
  
  // STEP 0.5: Fetch Odoo users (Addendum J)
  let odooUsers = [];
  try {
    const usersResponse = await fetch('/projects/api/odoo-users', {
      credentials: 'include'
    });
    const usersResult = await usersResponse.json();
    
    if (!usersResult.success) {
      showToast('Failed to fetch Odoo users: ' + usersResult.error, 'error');
      return;
    }
    
    odooUsers = usersResult.users || [];
  } catch (err) {
    console.error('Users fetch error:', err);
    showToast('Network error fetching users. Please try again.', 'error');
    return;
  }
  
  // STEP 0.6: Ask for stakeholder → user mapping (Addendum J)
  const stakeholderMapping = await showStakeholderMappingModal(templateId, odooUsers);
  
  if (!stakeholderMapping) {
    // User cancelled
    return;
  }
  
  // Show loading toast
  showToast('Loading generation preview...', 'info');
  
  try {
    // STEP 1: Fetch generation preview with projectStartDate and stakeholderMapping (Addendum J)
    const previewResponse = await fetch(`/projects/api/generate-preview/${templateId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        projectStartDate,  // Addendum G
        stakeholderMapping // Addendum J
      })
    });
    
    const previewResult = await previewResponse.json();
    
    if (!previewResult.success) {
      showToast('Failed to load preview: ' + previewResult.error, 'error');
      return;
    }
    
    // STEP 2: Show preview modal with editable model
    await showGenerationPreviewModal(previewResult.generationModel, templateId, projectStartDate, stakeholderMapping);
    
  } catch (err) {
    console.error('Preview error:', err);
    showToast('Network error loading preview. Please try again.', 'error');
  }
}

/**
 * Show modal with date picker for project start date
 * Addendum H: Replace prompt() with proper datepicker UX
 * 
 * @returns {Promise<string|null>} ISO date string (YYYY-MM-DD) or null if cancelled
 */
async function showProjectStartDateModal() {
  return new Promise((resolve) => {
    // Create modal
    const modal = document.createElement('dialog');
    modal.className = 'modal modal-open';
    modal.id = 'projectStartDateModal';
    
    const modalBox = document.createElement('div');
    modalBox.className = 'modal-box';
    
    // Header
    const title = document.createElement('h2');
    title.className = 'text-xl font-bold mb-2';
    title.textContent = 'Select Project Start Date';
    modalBox.appendChild(title);
    
    const description = document.createElement('p');
    description.className = 'text-base-content/60 mb-4';
    description.textContent = 'All task deadlines will be calculated from this date. Weekends will be skipped automatically.';
    modalBox.appendChild(description);
    
    // Date input
    const inputGroup = document.createElement('div');
    inputGroup.className = 'form-control mb-6';
    
    const label = document.createElement('label');
    label.className = 'label';
    const labelText = document.createElement('span');
    labelText.className = 'label-text font-semibold';
    labelText.textContent = 'Start Date';
    label.appendChild(labelText);
    inputGroup.appendChild(label);
    
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'input input-bordered w-full';
    dateInput.required = true;
    // Set min to today to prevent past dates
    dateInput.min = new Date().toISOString().split('T')[0];
    // Set default to today
    dateInput.value = new Date().toISOString().split('T')[0];
    inputGroup.appendChild(dateInput);
    
    modalBox.appendChild(inputGroup);
    
    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'flex gap-3 justify-end';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      modal.close();
      modal.remove();
      resolve(null);
    };
    actions.appendChild(cancelBtn);
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Continue';
    confirmBtn.onclick = () => {
      const selectedDate = dateInput.value;
      if (!selectedDate) {
        showToast('Please select a start date', 'error');
        return;
      }
      modal.close();
      modal.remove();
      resolve(selectedDate);
    };
    actions.appendChild(confirmBtn);
    
    modalBox.appendChild(actions);
    modal.appendChild(modalBox);
    document.body.appendChild(modal);
    
    // Auto-focus date input
    dateInput.focus();
    
    // Allow Enter to confirm
    dateInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });
    
    modal.showModal();
  });
}

/**
 * Show modal for stakeholder → user mapping
 * Addendum J: Map blueprint stakeholders to real Odoo users
 */
async function showStakeholderMappingModal(templateId, odooUsers) {
  return new Promise(async (resolve) => {
    let blueprint = null;
    try {
      const response = await fetch(`/projects/api/blueprint/${templateId}`, {
        credentials: 'include'
      });
      const result = await response.json();
      if (result.success) {
        blueprint = result.data || {};
      } else {
        showToast('Failed to load blueprint: ' + result.error, 'error');
        resolve(null);
        return;
      }
    } catch (err) {
      console.error('Blueprint fetch error:', err);
      showToast('Network error loading blueprint', 'error');
      resolve(null);
      return;
    }
    
    const stakeholders = blueprint.stakeholders || [];
    const modal = document.createElement('dialog');
    modal.className = 'modal modal-open';
    const modalBox = document.createElement('div');
    modalBox.className = 'modal-box max-w-2xl';
    
    const title = document.createElement('h2');
    title.className = 'text-xl font-bold mb-2';
    title.textContent = 'Map Stakeholders to Users';
    modalBox.appendChild(title);
    
    const description = document.createElement('p');
    description.className = 'text-base-content/60 mb-4';
    description.textContent = 'Assign real Odoo users to blueprint stakeholders.';
    modalBox.appendChild(description);
    
    const responsibleGroup = document.createElement('div');
    responsibleGroup.className = 'form-control mb-6';
    const responsibleLabel = document.createElement('label');
    responsibleLabel.className = 'label';
    const responsibleLabelText = document.createElement('span');
    responsibleLabelText.className = 'label-text font-semibold';
    responsibleLabelText.textContent = 'Project Responsible ';
    const requiredSpan = document.createElement('span');
    requiredSpan.className = 'text-error';
    requiredSpan.textContent = '*';
    responsibleLabelText.appendChild(requiredSpan);
    responsibleLabel.appendChild(responsibleLabelText);
    responsibleGroup.appendChild(responsibleLabel);
    
    const responsibleSelect = document.createElement('select');
    responsibleSelect.className = 'select select-bordered w-full';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select User --';
    responsibleSelect.appendChild(defaultOption);
    odooUsers.forEach(user => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.name} (${user.login})`;
      responsibleSelect.appendChild(option);
    });
    responsibleGroup.appendChild(responsibleSelect);
    modalBox.appendChild(responsibleGroup);
    
    if (stakeholders.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'divider';
      divider.textContent = 'Stakeholder Assignments (Optional)';
      modalBox.appendChild(divider);
      
      const stakeholderMappingsDiv = document.createElement('div');
      stakeholderMappingsDiv.className = 'space-y-4 mb-6';
      
      stakeholders.forEach(stakeholder => {
        const stakeholderGroup = document.createElement('div');
        stakeholderGroup.className = 'form-control';
        const label = document.createElement('label');
        label.className = 'label';
        const labelText = document.createElement('span');
        labelText.className = 'label-text';
        labelText.textContent = stakeholder.name;
        label.appendChild(labelText);
        if (stakeholder.description) {
          const labelAlt = document.createElement('span');
          labelAlt.className = 'label-text-alt text-base-content/60';
          labelAlt.textContent = stakeholder.description;
          label.appendChild(labelAlt);
        }
        stakeholderGroup.appendChild(label);
        
        // Selected users badges container
        const selectedUsersDiv = document.createElement('div');
        selectedUsersDiv.className = 'flex flex-wrap gap-2 mb-2 min-h-[2rem] items-center';
        selectedUsersDiv.dataset.stakeholderId = stakeholder.id;
        selectedUsersDiv.dataset.selectedUsers = JSON.stringify([]);
        stakeholderGroup.appendChild(selectedUsersDiv);
        
        // Dropdown to add users
        const selectWrapper = document.createElement('div');
        selectWrapper.className = 'flex gap-2';
        const select = document.createElement('select');
        select.className = 'select select-bordered w-full select-sm';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Add user --';
        select.appendChild(defaultOption);
        odooUsers.forEach(user => {
          const option = document.createElement('option');
          option.value = user.id;
          option.dataset.userName = user.name;
          option.dataset.userLogin = user.login;
          option.textContent = `${user.name} (${user.login})`;
          select.appendChild(option);
        });
        
        select.onchange = () => {
          const userId = parseInt(select.value, 10);
          if (!userId) return;
          
          const userName = select.options[select.selectedIndex].dataset.userName;
          const userLogin = select.options[select.selectedIndex].dataset.userLogin;
          
          // Get current selected users
          let selectedUsers = JSON.parse(selectedUsersDiv.dataset.selectedUsers || '[]');
          
          // Check if already added
          if (selectedUsers.includes(userId)) {
            showToast('User already added', 'warning');
            select.value = '';
            return;
          }
          
          // Add user
          selectedUsers.push(userId);
          selectedUsersDiv.dataset.selectedUsers = JSON.stringify(selectedUsers);
          
          // Create badge
          const badge = document.createElement('div');
          badge.className = 'badge badge-secondary gap-1';
          badge.dataset.userId = userId;
          const userIcon = document.createElement('i');
          userIcon.setAttribute('data-lucide', 'user');
          userIcon.className = 'w-3 h-3';
          badge.appendChild(userIcon);
          const nameSpan = document.createElement('span');
          nameSpan.textContent = userName;
          badge.appendChild(nameSpan);
          const removeBtn = document.createElement('button');
          removeBtn.className = 'ml-1';
          removeBtn.type = 'button';
          removeBtn.onclick = () => {
            selectedUsers = selectedUsers.filter(id => id !== userId);
            selectedUsersDiv.dataset.selectedUsers = JSON.stringify(selectedUsers);
            badge.remove();
          };
          const removeIcon = document.createElement('i');
          removeIcon.setAttribute('data-lucide', 'x');
          removeIcon.className = 'w-3 h-3';
          removeBtn.appendChild(removeIcon);
          badge.appendChild(removeBtn);
          
          selectedUsersDiv.appendChild(badge);
          lucide.createIcons();
          
          // Reset select
          select.value = '';
        };
        
        selectWrapper.appendChild(select);
        stakeholderGroup.appendChild(selectWrapper);
        
        stakeholderMappingsDiv.appendChild(stakeholderGroup);
      });
      modalBox.appendChild(stakeholderMappingsDiv);
    }
    
    const actions = document.createElement('div');
    actions.className = 'flex gap-3 justify-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      modal.close();
      modal.remove();
      resolve(null);
    };
    actions.appendChild(cancelBtn);
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Continue';
    confirmBtn.onclick = () => {
      const projectResponsible = parseInt(responsibleSelect.value, 10);
      if (!projectResponsible) {
        showToast('Please select a project responsible', 'error');
        return;
      }
      const mapping = {
        project_responsible: projectResponsible,
        stakeholders: {}
      };
      stakeholders.forEach(stakeholder => {
        const selectedUsersDiv = modalBox.querySelector(`[data-stakeholder-id="${stakeholder.id}"]`);
        if (selectedUsersDiv) {
          const userIds = JSON.parse(selectedUsersDiv.dataset.selectedUsers || '[]');
          if (userIds.length > 0) {
            mapping.stakeholders[stakeholder.id] = userIds;
          }
        }
      });
      modal.close();
      modal.remove();
      resolve(mapping);
    };
    actions.appendChild(confirmBtn);
    
    modalBox.appendChild(actions);
    modal.appendChild(modalBox);
    document.body.appendChild(modal);
    responsibleSelect.focus();
    modal.showModal();
    lucide.createIcons();
  });
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
  // Check if we're on the generation history page
  if (window.VIEW_MODE === 'generation-history') {
    initGenerationHistory();
    return;
  }
  
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
let editingTagId = null;
let editingStakeholderId = null; // Addendum J
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
  document.getElementById('addTagBtn').addEventListener('click', () => openTagModal());
  document.getElementById('addStakeholderBtn').addEventListener('click', () => openStakeholderModal()); // Addendum J
  document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
  
  document.getElementById('stageForm').addEventListener('submit', handleStageSubmit);
  document.getElementById('milestoneForm').addEventListener('submit', handleMilestoneSubmit);
  document.getElementById('tagForm').addEventListener('submit', handleTagSubmit);
  document.getElementById('stakeholderForm').addEventListener('submit', handleStakeholderSubmit); // Addendum J
  document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
  
  // I3: Grouping and sorting event listeners
  const taskGroupingEl = document.getElementById('taskGrouping');
  const taskGrouping2El = document.getElementById('taskGrouping2');
  const taskSortingEl = document.getElementById('taskSorting');
  if (taskGroupingEl) {
    taskGroupingEl.addEventListener('change', renderTasks);
  }
  if (taskGrouping2El) {
    taskGrouping2El.addEventListener('change', renderTasks);
  }
  if (taskSortingEl) {
    taskSortingEl.addEventListener('change', renderTasks);
  }
  
  // Color picker event listeners
  document.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('ring-2', 'ring-primary'));
      this.classList.add('ring-2', 'ring-primary');
      document.getElementById('taskColor').value = this.dataset.color;
    });
  });
  
  // Milestone color picker event listeners (Addendum I)
  document.querySelectorAll('[data-milestone-color]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('[data-milestone-color]').forEach(b => b.classList.remove('ring-2', 'ring-primary'));
      this.classList.add('ring-2', 'ring-primary');
      const colorInput = document.getElementById('milestoneColor');
      if (colorInput) {
        colorInput.value = this.dataset.milestoneColor;
      }
    });
  });
  
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
        description: data.description || '',  // Template description
        stages: data.stages || [],
        milestones: data.milestones || [],
        tags: data.tags || [],
        stakeholders: data.stakeholders || [], // Addendum J
        tasks: data.tasks || [],
        dependencies: data.dependencies || []
      };
      
      // Auto-fix duplicate stakeholder IDs and sequences
      const seenStakeholderIds = new Set();
      const seenSequences = new Set();
      let hasStakeholderFixes = false;
      
      blueprintState.stakeholders.forEach((stakeholder, index) => {
        // Fix duplicate IDs
        if (seenStakeholderIds.has(stakeholder.id)) {
          stakeholder.id = generateUUID();
          hasStakeholderFixes = true;
          console.warn(`Fixed duplicate stakeholder ID for: ${stakeholder.name}`);
        }
        seenStakeholderIds.add(stakeholder.id);
        
        // Fix missing or duplicate sequences
        if (!stakeholder.sequence || seenSequences.has(stakeholder.sequence)) {
          stakeholder.sequence = index + 1;
          hasStakeholderFixes = true;
          console.warn(`Fixed duplicate/missing sequence for stakeholder: ${stakeholder.name} -> ${stakeholder.sequence}`);
        }
        seenSequences.add(stakeholder.sequence);
      });
      
      if (hasStakeholderFixes) {
        showToast('Auto-fixed duplicate stakeholder sequences. Please save the blueprint.', 'warning');
      }
      
      savedBlueprintState = deepClone(blueprintState);
      
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('blueprintContent').style.display = 'block';
      
      // Update header with template name
      const templateNameDisplay = document.getElementById('templateNameDisplay');
      if (templateNameDisplay && window.TEMPLATE_NAME) {
        templateNameDisplay.textContent = window.TEMPLATE_NAME;
      }
      
      renderAllSections();
      
      // H.1: Calculate relative timing inheritance after blueprint load
      recalculateRelativeTiming();
      
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
  await persistBlueprint('manual_save');
}

// Shared persistence helper - called after every blueprint modification
async function persistBlueprint(saveReason = 'auto') {
  // Validate before persisting
  const validation = validateBlueprint();
  
  if (!validation.valid) {
    showToast('Cannot save: blueprint has errors', 'error');
    throw new Error('Blueprint validation failed');
  }
  
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
      if (saveReason === 'manual_save') {
        showToast('Blueprint saved successfully', 'success');
      }
      validateAndDisplay();
    } else {
      showToast('Save failed: ' + result.error, 'error');
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Save blueprint error:', err);
    showToast('Network error saving blueprint', 'error');
    throw err;
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
  renderTags();
  renderStakeholders(); // Addendum J
  renderTasks();
  validateAndDisplay();
}

// ============================================================================
// STAGES
// ============================================================================

function renderStages() {
  const list = document.getElementById('stagesList');
  const empty = document.getElementById('emptyStages');
  const countBadge = document.getElementById('stagesCount');
  
  list.innerHTML = '';
  
  // I1: Update count badge
  if (countBadge) {
    countBadge.textContent = blueprintState.stages.length;
  }
  
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

async function handleStageSubmit(e) {
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
  
  // Persist immediately
  await persistBlueprint('stage_save');
}

async function deleteStage(stageId) {
  const stage = blueprintState.stages.find(s => s.id === stageId);
  if (confirm('Delete stage "' + stage.name + '"?')) {
    blueprintState.stages = blueprintState.stages.filter(s => s.id !== stageId);
    renderStages();
    validateAndDisplay();
    
    // Persist immediately
    await persistBlueprint('stage_delete');
  }
}

async function moveStage(stageId, direction) {
  const sortedStages = [...blueprintState.stages].sort((a, b) => a.sequence - b.sequence);
  const index = sortedStages.findIndex(s => s.id === stageId);
  const targetIndex = index + direction;
  
  if (targetIndex >= 0 && targetIndex < sortedStages.length) {
    const tempSeq = sortedStages[index].sequence;
    sortedStages[index].sequence = sortedStages[targetIndex].sequence;
    sortedStages[targetIndex].sequence = tempSeq;
    
    renderStages();
    validateAndDisplay();
    
    // Persist immediately
    await persistBlueprint('stage_move');
  }
}

// ============================================================================
// MILESTONES
// ============================================================================

function renderMilestones() {
  const list = document.getElementById('milestonesList');
  const empty = document.getElementById('emptyMilestones');
  const countBadge = document.getElementById('milestonesCount');
  
  list.innerHTML = '';
  
  // I1: Update count badge
  if (countBadge) {
    countBadge.textContent = blueprintState.milestones.length;
  }
  
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
    
    const leftContent = document.createElement('div');
    leftContent.className = 'flex items-center gap-3';
    
    // Color indicator
    if (milestone.color && milestone.color > 0 && milestone.color <= 11) {
      const colorMap = {
        1: '#EF4444', 2: '#F97316', 3: '#EAB308', 4: '#3B82F6', 5: '#EC4899',
        6: '#22C55E', 7: '#A855F7', 8: '#64748B', 9: '#C084FC', 10: '#06B6D4', 11: '#8B5CF6'
      };
      const colorDot = document.createElement('span');
      colorDot.className = 'w-3 h-3 rounded-full flex-shrink-0';
      colorDot.style.backgroundColor = colorMap[milestone.color];
      colorDot.title = 'Color';
      leftContent.appendChild(colorDot);
    }
    
    const textContainer = document.createElement('div');
    textContainer.className = 'flex flex-col';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold';
    nameSpan.textContent = milestone.name;
    textContainer.appendChild(nameSpan);
    
    // Show timing info if exists (Addendum H)
    if (milestone.deadline_offset_days || milestone.duration_days) {
      const timingInfo = document.createElement('span');
      timingInfo.className = 'text-xs text-base-content/60 mt-1';
      const parts = [];
      if (milestone.deadline_offset_days) parts.push('Deadline: +' + milestone.deadline_offset_days + ' days');
      if (milestone.duration_days) parts.push('Duration: ' + milestone.duration_days + ' days');
      timingInfo.textContent = parts.join(' • ');
      textContainer.appendChild(timingInfo);
    }
    
    leftContent.appendChild(textContainer);
    div.appendChild(leftContent);
    
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
  const deadlineOffsetInput = document.getElementById('milestoneDeadlineOffset');
  const durationInput = document.getElementById('milestoneDuration');
  const colorInput = document.getElementById('milestoneColor');
  
  if (milestoneId) {
    const milestone = blueprintState.milestones.find(m => m.id === milestoneId);
    title.textContent = 'Edit Milestone';
    nameInput.value = milestone.name;
    deadlineOffsetInput.value = milestone.deadline_offset_days || '';
    durationInput.value = milestone.duration_days || '';
    
    // Set color
    if (colorInput) {
      colorInput.value = milestone.color || '';
      document.querySelectorAll('[data-milestone-color]').forEach(btn => btn.classList.remove('ring-2', 'ring-primary'));
      if (milestone.color !== null && milestone.color !== undefined) {
        const selectedBtn = document.querySelector('[data-milestone-color="' + milestone.color + '"]');
        if (selectedBtn) selectedBtn.classList.add('ring-2', 'ring-primary');
      }
    }
  } else {
    title.textContent = 'Add Milestone';
    nameInput.value = '';
    deadlineOffsetInput.value = '';
    durationInput.value = '';
    if (colorInput) {
      colorInput.value = '';
      document.querySelectorAll('[data-milestone-color]').forEach(btn => btn.classList.remove('ring-2', 'ring-primary'));
    }
  }
  
  modal.showModal();
}

async function handleMilestoneSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('milestoneName').value.trim();
  if (!name) return;
  
  // Get timing values (Addendum H)
  const deadlineOffsetStr = document.getElementById('milestoneDeadlineOffset').value;
  const durationStr = document.getElementById('milestoneDuration').value;
  
  const deadline_offset_days = deadlineOffsetStr ? parseInt(deadlineOffsetStr, 10) : null;
  const duration_days = durationStr ? parseInt(durationStr, 10) : null;
  
  // Get color (Addendum I)
  const colorInput = document.getElementById('milestoneColor');
  const color = colorInput && colorInput.value ? parseInt(colorInput.value, 10) : null;
  
  if (editingMilestoneId) {
    const milestone = blueprintState.milestones.find(m => m.id === editingMilestoneId);
    milestone.name = name;
    milestone.deadline_offset_days = deadline_offset_days;
    milestone.duration_days = duration_days;
    milestone.color = color;
  } else {
    blueprintState.milestones.push({
      id: generateUUID(),
      name: name,
      deadline_offset_days: deadline_offset_days,
      duration_days: duration_days,
      color: color
    });
  }
  
  document.getElementById('milestoneModal').close();
  renderMilestones();
  
  // H.1: Trigger recalculation when milestone timing changes
  recalculateRelativeTiming();
  
  validateAndDisplay();
  
  // Persist immediately
  await persistBlueprint('milestone_save');
}

async function deleteMilestone(milestoneId) {
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
    
    // Persist immediately
    await persistBlueprint('milestone_delete');
  }
}

// ============================================================================
// TAGS (Addendum F)
// ============================================================================

function renderTags() {
  const list = document.getElementById('tagsList');
  const empty = document.getElementById('emptyTags');
  const countBadge = document.getElementById('tagsCount');
  
  list.innerHTML = '';
  
  // I1: Update count badge
  if (countBadge) {
    countBadge.textContent = blueprintState.tags.length;
  }
  
  if (blueprintState.tags.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  blueprintState.tags.forEach(tag => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 bg-base-200 rounded';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold';
    nameSpan.textContent = tag.name;
    div.appendChild(nameSpan);
    
    const btnDiv = document.createElement('div');
    btnDiv.className = 'flex gap-1';
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-xs btn-ghost';
    editBtn.title = 'Edit';
    editBtn.onclick = () => openTagModal(tag.id);
    const editIcon = document.createElement('i');
    editIcon.setAttribute('data-lucide', 'edit-2');
    editIcon.className = 'w-3 h-3';
    editBtn.appendChild(editIcon);
    btnDiv.appendChild(editBtn);
    
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-ghost text-error';
    delBtn.title = 'Delete';
    delBtn.onclick = () => deleteTag(tag.id);
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

function openTagModal(tagId = null) {
  editingTagId = tagId;
  const modal = document.getElementById('tagModal');
  const title = document.getElementById('tagModalTitle');
  const nameInput = document.getElementById('tagName');
  
  if (tagId) {
    const tag = blueprintState.tags.find(t => t.id === tagId);
    title.textContent = 'Edit Tag';
    nameInput.value = tag.name;
  } else {
    title.textContent = 'Add Tag';
    nameInput.value = '';
  }
  
  modal.showModal();
}

async function handleTagSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('tagName').value.trim();
  if (!name) return;
  
  if (editingTagId) {
    const tag = blueprintState.tags.find(t => t.id === editingTagId);
    tag.name = name;
  } else {
    blueprintState.tags.push({
      id: generateUUID(),
      name: name
    });
  }
  
  document.getElementById('tagModal').close();
  renderTags();
  validateAndDisplay();
  
  // Persist immediately
  await persistBlueprint('tag_save');
}

async function deleteTag(tagId) {
  const tag = blueprintState.tags.find(t => t.id === tagId);
  if (confirm('Delete tag "' + tag.name + '"?\n\nTasks with this tag will keep the tag (removed from new projects).')) {
    blueprintState.tags = blueprintState.tags.filter(t => t.id !== tagId);
    
    // Remove tag from tasks
    blueprintState.tasks.forEach(task => {
      if (task.tag_ids && task.tag_ids.includes(tagId)) {
        task.tag_ids = task.tag_ids.filter(tid => tid !== tagId);
      }
    });
    
    renderTags();
    renderTasks();
    validateAndDisplay();
    
    // Persist immediately
    await persistBlueprint('tag_delete');
  }
}

// ============================================================================
// STAKEHOLDERS (Addendum J)
// ============================================================================

function renderStakeholders() {
  const list = document.getElementById('stakeholdersList');
  const empty = document.getElementById('emptyStakeholders');
  const countBadge = document.getElementById('stakeholdersCount');
  
  list.innerHTML = '';
  
  // Update count badge
  if (countBadge) {
    countBadge.textContent = blueprintState.stakeholders.length;
  }
  
  if (blueprintState.stakeholders.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  // Sort by sequence
  const sortedStakeholders = [...blueprintState.stakeholders].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  
  sortedStakeholders.forEach((stakeholder, index) => {
    const div = document.createElement('div');
    div.className = 'flex items-start justify-between p-3 bg-base-200 rounded';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'flex-1 flex items-start gap-2';
    
    // Sequence badge
    const seqSpan = document.createElement('span');
    seqSpan.className = 'badge badge-neutral badge-sm mt-0.5 flex-shrink-0';
    seqSpan.textContent = stakeholder.sequence || index + 1;
    contentDiv.appendChild(seqSpan);
    
    // Color dot (if color is set)
    if (stakeholder.color && stakeholder.color > 0 && stakeholder.color <= 11) {
      const colorMap = {
        1: '#EF4444', 2: '#F97316', 3: '#EAB308', 4: '#3B82F6', 5: '#EC4899',
        6: '#8B5CF6', 7: '#10B981', 8: '#06B6D4', 9: '#6366F1', 10: '#F59E0B', 11: '#84CC16'
      };
      const colorDot = document.createElement('div');
      colorDot.className = 'w-3 h-3 rounded-full mt-0.5 flex-shrink-0';
      colorDot.style.backgroundColor = colorMap[stakeholder.color];
      contentDiv.appendChild(colorDot);
    }
    
    const textDiv = document.createElement('div');
    textDiv.className = 'flex-1';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold';
    nameSpan.textContent = stakeholder.name;
    textDiv.appendChild(nameSpan);
    
    if (stakeholder.description) {
      const descSpan = document.createElement('span');
      descSpan.className = 'text-xs text-base-content/60 block mt-1';
      descSpan.textContent = stakeholder.description;
      textDiv.appendChild(descSpan);
    }
    
    contentDiv.appendChild(textDiv);
    div.appendChild(contentDiv);
    
    const btnDiv = document.createElement('div');
    btnDiv.className = 'flex gap-1';
    
    // Up button
    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'btn btn-xs btn-ghost';
      upBtn.title = 'Move up';
      upBtn.onclick = () => moveStakeholder(stakeholder.id, -1);
      const upIcon = document.createElement('i');
      upIcon.setAttribute('data-lucide', 'arrow-up');
      upIcon.className = 'w-3 h-3';
      upBtn.appendChild(upIcon);
      btnDiv.appendChild(upBtn);
    }
    
    // Down button
    if (index < sortedStakeholders.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'btn btn-xs btn-ghost';
      downBtn.title = 'Move down';
      downBtn.onclick = () => moveStakeholder(stakeholder.id, 1);
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
    editBtn.onclick = () => openStakeholderModal(stakeholder.id);
    const editIcon = document.createElement('i');
    editIcon.setAttribute('data-lucide', 'edit-2');
    editIcon.className = 'w-3 h-3';
    editBtn.appendChild(editIcon);
    btnDiv.appendChild(editBtn);
    
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-ghost text-error';
    delBtn.title = 'Delete';
    delBtn.onclick = () => deleteStakeholder(stakeholder.id);
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

function openStakeholderModal(stakeholderId = null) {
  editingStakeholderId = stakeholderId;
  const modal = document.getElementById('stakeholderModal');
  const title = document.getElementById('stakeholderModalTitle');
  const nameInput = document.getElementById('stakeholderName');
  const descInput = document.getElementById('stakeholderDescription');
  
  // Render color picker
  const colorPicker = document.getElementById('stakeholderColorPicker');
  colorPicker.innerHTML = '';
  
  const colorMap = {
    0: { hex: '#9CA3AF', label: 'No color' },
    1: { hex: '#EF4444', label: 'Red' },
    2: { hex: '#F97316', label: 'Orange' },
    3: { hex: '#EAB308', label: 'Yellow' },
    4: { hex: '#3B82F6', label: 'Blue' },
    5: { hex: '#EC4899', label: 'Pink' },
    6: { hex: '#8B5CF6', label: 'Purple' },
    7: { hex: '#10B981', label: 'Green' },
    8: { hex: '#06B6D4', label: 'Cyan' },
    9: { hex: '#6366F1', label: 'Indigo' },
    10: { hex: '#F59E0B', label: 'Amber' },
    11: { hex: '#84CC16', label: 'Lime' }
  };
  
  let selectedColor = 0;
  
  if (stakeholderId) {
    const stakeholder = blueprintState.stakeholders.find(s => s.id === stakeholderId);
    title.textContent = 'Edit Stakeholder';
    nameInput.value = stakeholder.name;
    descInput.value = stakeholder.description || '';
    selectedColor = stakeholder.color || 0;
  } else {
    title.textContent = 'Add Stakeholder';
    nameInput.value = '';
    descInput.value = '';
    selectedColor = 0;
  }
  
  // Create color buttons
  Object.entries(colorMap).forEach(([colorCode, colorData]) => {
    const colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.className = 'w-8 h-8 rounded-full transition-all';
    colorBtn.style.backgroundColor = colorData.hex;
    colorBtn.title = colorData.label;
    
    if (parseInt(colorCode) === selectedColor) {
      colorBtn.className += ' ring-2 ring-offset-2 ring-primary';
    }
    
    colorBtn.onclick = () => {
      selectedColor = parseInt(colorCode);
      // Update dataset so form submit gets the correct value
      colorPicker.dataset.selectedColor = selectedColor;
      // Update all color buttons
      colorPicker.querySelectorAll('button').forEach(btn => {
        btn.className = 'w-8 h-8 rounded-full transition-all';
        btn.style.backgroundColor = btn.style.backgroundColor; // Preserve color
      });
      colorBtn.className = 'w-8 h-8 rounded-full transition-all ring-2 ring-offset-2 ring-primary';
    };
    
    colorPicker.appendChild(colorBtn);
  });
  
  // Store selected color for form submit
  colorPicker.dataset.selectedColor = selectedColor;
  
  modal.showModal();
}

async function handleStakeholderSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('stakeholderName').value.trim();
  const description = document.getElementById('stakeholderDescription').value.trim();
  const colorPicker = document.getElementById('stakeholderColorPicker');
  const selectedColor = colorPicker.dataset.selectedColor ? parseInt(colorPicker.dataset.selectedColor) : 0;
  
  if (!name) return;
  
  if (editingStakeholderId) {
    const stakeholder = blueprintState.stakeholders.find(s => s.id === editingStakeholderId);
    stakeholder.name = name;
    stakeholder.description = description;
    stakeholder.color = selectedColor;
  } else {
    const maxSeq = Math.max(0, ...blueprintState.stakeholders.map(s => s.sequence || 0));
    blueprintState.stakeholders.push({
      id: generateUUID(),
      name: name,
      description: description,
      color: selectedColor,
      sequence: maxSeq + 1
    });
  }
  
  document.getElementById('stakeholderModal').close();
  renderStakeholders();
  renderTasks(); // Update task stakeholder badges
  validateAndDisplay();
  
  // Persist immediately
  await persistBlueprint('stakeholder_save');
}

async function deleteStakeholder(stakeholderId) {
  const stakeholder = blueprintState.stakeholders.find(s => s.id === stakeholderId);
  
  // Check if stakeholder is used by any tasks
  const usedByTasks = blueprintState.tasks.filter(task => 
    task.stakeholder_ids && task.stakeholder_ids.includes(stakeholderId)
  );
  
  if (usedByTasks.length > 0) {
    const taskNames = usedByTasks.slice(0, 3).map(t => t.name).join(', ');
    const more = usedByTasks.length > 3 ? ' and ' + (usedByTasks.length - 3) + ' more' : '';
    
    if (!confirm('Stakeholder "' + stakeholder.name + '" is used by ' + usedByTasks.length + ' task(s) (' + taskNames + more + ').\n\nDelete anyway? Tasks will lose this stakeholder assignment.')) {
      return;
    }
  }
  
  blueprintState.stakeholders = blueprintState.stakeholders.filter(s => s.id !== stakeholderId);
  
  // Remove stakeholder from tasks
  blueprintState.tasks.forEach(task => {
    if (task.stakeholder_ids && task.stakeholder_ids.includes(stakeholderId)) {
      task.stakeholder_ids = task.stakeholder_ids.filter(sid => sid !== stakeholderId);
    }
  });
  
  renderStakeholders();
  renderTasks();
  validateAndDisplay();
  
  // Persist immediately
  await persistBlueprint('stakeholder_delete');
}

async function moveStakeholder(stakeholderId, direction) {
  const sortedStakeholders = [...blueprintState.stakeholders].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const index = sortedStakeholders.findIndex(s => s.id === stakeholderId);
  const targetIndex = index + direction;
  
  if (targetIndex >= 0 && targetIndex < sortedStakeholders.length) {
    // Ensure both have sequence values
    if (!sortedStakeholders[index].sequence) sortedStakeholders[index].sequence = index + 1;
    if (!sortedStakeholders[targetIndex].sequence) sortedStakeholders[targetIndex].sequence = targetIndex + 1;
    
    // Swap sequences
    const tempSeq = sortedStakeholders[index].sequence;
    sortedStakeholders[index].sequence = sortedStakeholders[targetIndex].sequence;
    sortedStakeholders[targetIndex].sequence = tempSeq;
    
    renderStakeholders();
    validateAndDisplay();
    
    // Persist immediately
    await persistBlueprint('stakeholder_move');
  }
}

// ============================================================================
// RELATIVE TIMING INHERITANCE (Addendum H.1)
// Blueprint-level inheritance engine - marks tasks that inherit, NO data copying
// ============================================================================

/**
 * Recalculate relative timing inheritance flags across blueprint
 * This is RELATIONAL, not data-copying. Tasks are marked as inheriting.
 * 
 * Called after:
 * - Milestone save
 * - Task milestone change
 * - Task timing change
 * - Parent change
 * - Blueprint load
 * 
 * Addendum H.1: Timing inheritance happens at blueprint level (relative),
 * not just at preview level (absolute)
 */
function recalculateRelativeTiming() {
  if (!blueprintState || !blueprintState.tasks) return;
  
  // Create milestone timing map (for inheritance detection)
  const milestoneTimingMap = new Map();
  if (blueprintState.milestones) {
    blueprintState.milestones.forEach(milestone => {
      milestoneTimingMap.set(milestone.id, {
        hasDeadline: milestone.deadline_offset_days !== null && milestone.deadline_offset_days !== undefined,
        hasDuration: milestone.duration_days !== null && milestone.duration_days !== undefined,
        name: milestone.name
      });
    });
  }
  
  // Create parent map (for subtask lookups)
  const parentMap = new Map();
  blueprintState.tasks.forEach(task => {
    parentMap.set(task.id, task);
  });
  
  // Process each task
  blueprintState.tasks.forEach(task => {
    // Clear previous inheritance flags
    task._inheritsTimingFromMilestone = false;
    task._inheritsTimingFromParent = false;
    task._inheritedMilestoneName = null;
    task._inheritsFromParentName = null;
    
    // H.1: SUBTASK INHERITANCE (DOMINANT)
    // Subtasks inherit milestone, tags, and timing from parent
    if (task.parent_id) {
      const parent = parentMap.get(task.parent_id);
      if (parent) {
        // Subtask always inherits milestone from parent (auto-sync, not just marking)
        if (parent.milestone_id && task.milestone_id !== parent.milestone_id) {
          task.milestone_id = parent.milestone_id;
        }
        
        // Subtask inherits tags from parent (auto-sync)
        if (parent.tag_ids && parent.tag_ids.length > 0) {
          // Only inherit if subtask doesn't have explicit tags already
          if (!task.tag_ids || task.tag_ids.length === 0) {
            task.tag_ids = [...parent.tag_ids];
          }
        }
        
        // J6: Subtask inherits stakeholders from parent (auto-sync) - Addendum J
        if (parent.stakeholder_ids && parent.stakeholder_ids.length > 0) {
          // Only inherit if subtask doesn't have explicit stakeholders already
          if (!task.stakeholder_ids || task.stakeholder_ids.length === 0) {
            task.stakeholder_ids = [...parent.stakeholder_ids];
          }
        }
        
        // Mark timing inheritance from parent if subtask has no own timing
        if (!task.deadline_offset_days && !task.duration_days && !task.planned_hours) {
          if (parent.deadline_offset_days || parent.duration_days || parent.planned_hours) {
            task._inheritsTimingFromParent = true;
            task._inheritsFromParentName = parent.name;
          }
        }
      }
    }
    
    // H.1: MILESTONE INHERITANCE
    // Tasks without own timing inherit from milestone
    if (task.milestone_id && !task.deadline_offset_days) {
      const milestoneTiming = milestoneTimingMap.get(task.milestone_id);
      if (milestoneTiming && (milestoneTiming.hasDeadline || milestoneTiming.hasDuration)) {
        task._inheritsTimingFromMilestone = true;
        task._inheritedMilestoneName = milestoneTiming.name;
      }
    }
  });
  
  // Re-render tasks to show updated inheritance indicators
  renderTasks();
}

// ============================================================================
// TASKS (I2 & I3: Enhanced UX with grouping and sorting)
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
  
  // I3: Get grouping and sorting preferences
  const groupingEl = document.getElementById('taskGrouping');
  const grouping2El = document.getElementById('taskGrouping2');
  const sortingEl = document.getElementById('taskSorting');
  const grouping = groupingEl ? groupingEl.value : 'none';
  const grouping2 = grouping2El ? grouping2El.value : 'none';
  const sorting = sortingEl ? sortingEl.value : 'manual';
  
  // Get parent tasks (with their subtasks embedded)
  let taskGroups = getTasksGroupedAndSorted(grouping, grouping2, sorting);
  
  // Render groups
  taskGroups.forEach(group => {
    if (group.header) {
      // Render group header with icon - style based on level
      const headerDiv = document.createElement('div');
      
      if (group.level === 1) {
        // Primary group header - bold, larger
        headerDiv.className = 'flex items-center gap-2 text-base font-bold text-base-content mt-6 mb-3 px-2';
      } else {
        // Secondary group header - lighter, smaller, indented
        headerDiv.className = 'flex items-center gap-2 text-sm font-semibold text-base-content/60 mt-4 mb-2 px-2 ml-6';
      }
      
      // Add icon based on group type
      const icon = document.createElement('i');
      icon.className = group.level === 1 ? 'w-5 h-5' : 'w-4 h-4';
      if (group.iconName) {
        icon.setAttribute('data-lucide', group.iconName);
      }
      headerDiv.appendChild(icon);
      
      const textSpan = document.createElement('span');
      textSpan.textContent = group.header;
      headerDiv.appendChild(textSpan);
      
      list.appendChild(headerDiv);
    }
    
    // Render tasks in this group
    const indentLevel = group.level === 2 ? 1 : 0;
    group.tasks.forEach(task => {
      renderTaskItem(task, indentLevel, list, group.header ? true : false);
      
      // Render subtasks
      const subtasks = blueprintState.tasks.filter(t => t.parent_id === task.id);
      if (sorting !== 'manual') {
        // Apply sorting to subtasks if needed
        sortTasks(subtasks, sorting);
      }
      subtasks.forEach(subtask => {
        renderTaskItem(subtask, indentLevel + 1, list, group.header ? true : false);
      });
    });
  });
  
  lucide.createIcons();
}

// I3: Group and sort tasks (presentational only)
function getTasksGroupedAndSorted(grouping, grouping2, sorting) {
  const parentTasks = blueprintState.tasks.filter(t => !t.parent_id);
  
  let groups = [];
  
  // If no primary grouping, return single group
  if (grouping === 'none') {
    const sorted = [...parentTasks];
    sortTasks(sorted, sorting);
    groups.push({ header: null, iconName: null, level: 1, tasks: sorted });
    return groups;
  }
  
  // Primary grouping
  const primaryGroups = getTasksByGroup(grouping, parentTasks, sorting);
  
  // If no secondary grouping, return primary groups as level 1
  if (grouping2 === 'none' || grouping2 === grouping) {
    // Mark all as level 1 for consistent styling (single-level grouping uses big headers)
    primaryGroups.forEach(group => {
      group.level = 1;
    });
    return primaryGroups;
  }
  
  // Two-level grouping: nest secondary groups within primary
  const nestedGroups = [];
  primaryGroups.forEach(primaryGroup => {
    // Add primary header
    nestedGroups.push({
      header: primaryGroup.header,
      iconName: primaryGroup.iconName,
      level: 1,
      tasks: []
    });
    
    // Get secondary groups for tasks in this primary group
    const secondaryGroups = getTasksByGroup(grouping2, primaryGroup.tasks, sorting);
    secondaryGroups.forEach(secondaryGroup => {
      nestedGroups.push({
        header: secondaryGroup.header,
        iconName: secondaryGroup.iconName,
        level: 2,
        tasks: secondaryGroup.tasks
      });
    });
  });
  
  return nestedGroups;
}

// Helper: Get tasks grouped by a specific grouping type
function getTasksByGroup(grouping, tasks, sorting) {
  const groups = [];
  
  if (grouping === 'none') {
    const sorted = [...tasks];
    sortTasks(sorted, sorting);
    groups.push({ header: null, iconName: null, tasks: sorted });
    
  } else if (grouping === 'milestone') {
    // Group by milestone
    const tasksByMilestone = new Map();
    
    // Group: No milestone
    tasksByMilestone.set('__none__', []);
    
    // Group: Each milestone
    blueprintState.milestones.forEach(m => {
      tasksByMilestone.set(m.id, []);
    });
    
    tasks.forEach(task => {
      const key = task.milestone_id || '__none__';
      if (!tasksByMilestone.has(key)) {
        tasksByMilestone.set(key, []);
      }
      tasksByMilestone.get(key).push(task);
    });
    
    // Build groups
    blueprintState.milestones.forEach(m => {
      const tasks = tasksByMilestone.get(m.id) || [];
      if (tasks.length > 0) {
        sortTasks(tasks, sorting);
        groups.push({
          header: `${m.name} (${tasks.length})`,
          iconName: 'flag',
          tasks: tasks
        });
      }
    });
    
    // Add "No milestone" group
    const noMilestoneTasks = tasksByMilestone.get('__none__') || [];
    if (noMilestoneTasks.length > 0) {
      sortTasks(noMilestoneTasks, sorting);
      groups.push({
        header: `No milestone (${noMilestoneTasks.length})`,
        iconName: 'circle-dashed',
        tasks: noMilestoneTasks
      });
    }
    
  } else if (grouping === 'tag') {
    // Group by tag (tasks can appear in multiple groups)
    const tasksByTag = new Map();
    
    // Build tag groups
    blueprintState.tags.forEach(tag => {
      const tasksWithTag = tasks.filter(t => 
        t.tag_ids && t.tag_ids.includes(tag.id)
      );
      if (tasksWithTag.length > 0) {
        sortTasks(tasksWithTag, sorting);
        tasksByTag.set(tag.id, {
          header: `${tag.name} (${tasksWithTag.length})`,
          iconName: 'tag',
          tasks: tasksWithTag
        });
      }
    });
    
    // Add groups
    tasksByTag.forEach(group => groups.push(group));
    
    // Add "No tags" group
    const noTagTasks = tasks.filter(t => !t.tag_ids || t.tag_ids.length === 0);
    if (noTagTasks.length > 0) {
      sortTasks(noTagTasks, sorting);
      groups.push({
        header: `No tags (${noTagTasks.length})`,
        iconName: 'circle-dashed',
        tasks: noTagTasks
      });
    }
    
  } else if (grouping === 'stakeholder') {
    // Group by stakeholder (tasks can appear in multiple groups)
    const tasksByStakeholder = new Map();
    
    // Build stakeholder groups (sorted by sequence)
    const sortedStakeholders = [...blueprintState.stakeholders].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    sortedStakeholders.forEach(stakeholder => {
      const tasksWithStakeholder = tasks.filter(t => 
        t.stakeholder_ids && t.stakeholder_ids.includes(stakeholder.id)
      );
      if (tasksWithStakeholder.length > 0) {
        sortTasks(tasksWithStakeholder, sorting);
        tasksByStakeholder.set(stakeholder.id, {
          header: `${stakeholder.name} (${tasksWithStakeholder.length})`,
          iconName: 'users',
          tasks: tasksWithStakeholder
        });
      }
    });
    
    // Add groups
    tasksByStakeholder.forEach(group => groups.push(group));
    
    // Add "No stakeholders" group
    const noStakeholderTasks = tasks.filter(t => !t.stakeholder_ids || t.stakeholder_ids.length === 0);
    if (noStakeholderTasks.length > 0) {
      sortTasks(noStakeholderTasks, sorting);
      groups.push({
        header: `No stakeholders (${noStakeholderTasks.length})`,
        iconName: 'circle-dashed',
        tasks: noStakeholderTasks
      });
    }
    
  } else if (grouping === 'dependency') {
    // Group by dependency status
    const withDeps = tasks.filter(t => 
      blueprintState.dependencies.some(d => d.task_id === t.id)
    );
    const withoutDeps = tasks.filter(t => 
      !blueprintState.dependencies.some(d => d.task_id === t.id)
    );
    
    if (withDeps.length > 0) {
      sortTasks(withDeps, sorting);
      groups.push({
        header: `Has dependencies (${withDeps.length})`,
        iconName: 'git-branch',
        tasks: withDeps
      });
    }
    
    if (withoutDeps.length > 0) {
      sortTasks(withoutDeps, sorting);
      groups.push({
        header: `No dependencies (${withoutDeps.length})`,
        iconName: 'circle-dashed',
        tasks: withoutDeps
      });
    }
  }
  
  return groups;
}

// I3: Sort tasks array in place
function sortTasks(tasks, sorting) {
  if (sorting === 'alphabetical') {
    tasks.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sorting === 'start-date') {
    tasks.sort((a, b) => {
      const aOffset = a.deadline_offset_days || Infinity;
      const bOffset = b.deadline_offset_days || Infinity;
      return aOffset - bOffset;
    });
  } else if (sorting === 'deadline') {
    tasks.sort((a, b) => {
      const aOffset = a.deadline_offset_days || Infinity;
      const bOffset = b.deadline_offset_days || Infinity;
      return aOffset - bOffset;
    });
  }
  // 'manual' = no sorting
}

// I2: Compact task item with better visual hierarchy
function renderTaskItem(task, level, container, isGrouped = false) {
  const div = document.createElement('div');
  div.className = 'flex items-center gap-3 p-2.5 bg-base-200 rounded hover:bg-base-300 transition-colors';
  
  // I2: Indent for grouped tasks
  if (isGrouped && level === 0) {
    div.style.marginLeft = '1.5rem';
  }
  
  // I2: Subtask visual distinction
  if (level > 0) {
    div.style.marginLeft = isGrouped ? '3.5rem' : '2rem';
    div.className = div.className.replace('bg-base-200', 'bg-base-100');
    div.className += ' border-l-2 border-base-300';
  }
  
  // Left: Task info
  const leftDiv = document.createElement('div');
  leftDiv.className = 'flex-1 min-w-0 flex items-center gap-2 flex-wrap';
  
  // Task name (primary)
  const nameSpan = document.createElement('span');
  nameSpan.className = level > 0 ? 'font-medium text-sm' : 'font-semibold';
  nameSpan.textContent = task.name;
  leftDiv.appendChild(nameSpan);
  
  // Metadata row (secondary)
  const metaDiv = document.createElement('div');
  metaDiv.className = 'flex items-center gap-1 flex-wrap';
  
  // I2: Color dot (compact)
  if (task.color && task.color > 0 && task.color <= 11) {
    const colorMap = {
      1: '#EF4444', 2: '#F97316', 3: '#EAB308', 4: '#3B82F6', 5: '#EC4899',
      6: '#22C55E', 7: '#A855F7', 8: '#64748B', 9: '#C084FC', 10: '#06B6D4', 11: '#8B5CF6'
    };
    const colorDot = document.createElement('span');
    colorDot.className = 'w-2.5 h-2.5 rounded-full';
    colorDot.style.backgroundColor = colorMap[task.color];
    colorDot.title = 'Color';
    metaDiv.appendChild(colorDot);
  }
  
  // I2: Milestone badge (compact met kleur)
  if (task.milestone_id) {
    const milestone = blueprintState.milestones.find(m => m.id === task.milestone_id);
    if (milestone) {
      const badge = document.createElement('span');
      
      // Use milestone color if available
      if (milestone.color && milestone.color > 0 && milestone.color <= 11) {
        const colorMap = {
          1: 'badge-error', 2: 'badge-warning', 3: 'badge-warning', 4: 'badge-info', 
          5: 'badge-secondary', 6: 'badge-success', 7: 'badge-secondary', 8: 'badge-neutral',
          9: 'badge-secondary', 10: 'badge-info', 11: 'badge-secondary'
        };
        badge.className = `badge badge-xs ${colorMap[milestone.color]} gap-1`;
      } else {
        badge.className = 'badge badge-xs badge-primary gap-1';
      }
      
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'flag');
      icon.className = 'w-2.5 h-2.5';
      badge.appendChild(icon);
      badge.title = milestone.name;
      metaDiv.appendChild(badge);
    }
  }
  
  // I2: Tags (verbeterde leesbaarheid)
  if (task.tag_ids && task.tag_ids.length > 0) {
    task.tag_ids.slice(0, 2).forEach(tagId => {
      const tag = blueprintState.tags.find(t => t.id === tagId);
      if (tag) {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'badge badge-sm badge-outline';
        tagBadge.textContent = tag.name;
        tagBadge.title = tag.name;
        metaDiv.appendChild(tagBadge);
      }
    });
    if (task.tag_ids.length > 2) {
      const moreBadge = document.createElement('span');
      moreBadge.className = 'badge badge-sm badge-ghost';
      moreBadge.textContent = `+${task.tag_ids.length - 2}`;
      moreBadge.title = 'More tags';
      metaDiv.appendChild(moreBadge);
    }
  }
  
  // J2: Stakeholders (Addendum J)
  if (task.stakeholder_ids && task.stakeholder_ids.length > 0) {
    task.stakeholder_ids.slice(0, 2).forEach(stakeholderId => {
      const stakeholder = blueprintState.stakeholders.find(s => s.id === stakeholderId);
      if (stakeholder) {
        const stakeholderBadge = document.createElement('span');
        
        // Use stakeholder color if available (Addendum J + I5 pattern)
        if (stakeholder.color && stakeholder.color > 0 && stakeholder.color <= 11) {
          const colorMap = {
            1: 'badge-error', 2: 'badge-warning', 3: 'badge-warning', 4: 'badge-info', 
            5: 'badge-secondary', 6: 'badge-success', 7: 'badge-secondary', 8: 'badge-neutral',
            9: 'badge-secondary', 10: 'badge-info', 11: 'badge-success'
          };
          stakeholderBadge.className = `badge badge-sm ${colorMap[stakeholder.color]} gap-1`;
        } else {
          stakeholderBadge.className = 'badge badge-sm badge-secondary gap-1';
        }
        
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'user');
        icon.className = 'w-2.5 h-2.5';
        stakeholderBadge.appendChild(icon);
        
        const text = document.createTextNode(stakeholder.name);
        stakeholderBadge.appendChild(text);
        stakeholderBadge.title = stakeholder.description || stakeholder.name;
        metaDiv.appendChild(stakeholderBadge);
      }
    });
    if (task.stakeholder_ids.length > 2) {
      const moreBadge = document.createElement('span');
      moreBadge.className = 'badge badge-sm badge-ghost';
      moreBadge.textContent = `+${task.stakeholder_ids.length - 2}`;
      moreBadge.title = 'More stakeholders';
      metaDiv.appendChild(moreBadge);
    }
  }
  
  // I2: Timing icons with tooltips (duidelijker)
  if (task._inheritsTimingFromMilestone) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-sm badge-info gap-1';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'arrow-down');
    icon.className = 'w-3 h-3';
    badge.appendChild(icon);
    const text = document.createElement('span');
    text.textContent = 'Milestone';
    badge.appendChild(text);
    badge.title = `Inherits timing from ${task._inheritedMilestoneName}`;
    metaDiv.appendChild(badge);
  } else if (task._inheritsTimingFromParent) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-sm badge-info gap-1';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'arrow-down');
    icon.className = 'w-3 h-3';
    badge.appendChild(icon);
    const text = document.createElement('span');
    text.textContent = 'Parent';
    badge.appendChild(text);
    badge.title = 'Inherits timing from parent';
    metaDiv.appendChild(badge);
  } else if (task.deadline_offset_days || task.planned_hours) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-sm badge-ghost gap-1';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'clock');
    icon.className = 'w-3 h-3';
    badge.appendChild(icon);
    const parts = [];
    if (task.deadline_offset_days) parts.push(`${task.deadline_offset_days}d`);
    if (task.planned_hours) parts.push(`${task.planned_hours}h`);
    const text = document.createElement('span');
    text.textContent = parts.join(' / ');
    badge.appendChild(text);
    badge.title = parts.join(', ');
    metaDiv.appendChild(badge);
  }
  
  // I2: Dependencies icon with count
  const taskDependencies = blueprintState.dependencies.filter(d => d.task_id === task.id);
  if (taskDependencies.length > 0) {
    const depContainer = document.createElement('span');
    depContainer.className = 'flex items-center gap-0.5';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'git-branch');
    icon.className = 'w-3.5 h-3.5 text-base-content/50';
    depContainer.appendChild(icon);
    const count = document.createElement('span');
    count.className = 'text-xs text-base-content/50';
    count.textContent = taskDependencies.length;
    depContainer.appendChild(count);
    depContainer.title = `${taskDependencies.length} dependencies`;
    metaDiv.appendChild(depContainer);
  }
  
  leftDiv.appendChild(metaDiv);
  div.appendChild(leftDiv);
  
  // I4: Right: Actions (grouped, subtle)
  const btnDiv = document.createElement('div');
  btnDiv.className = 'flex gap-0.5 items-center opacity-60 hover:opacity-100 transition-opacity';
  
  // Dependencies button
  const depsBtn = document.createElement('button');
  depsBtn.className = 'btn btn-xs btn-ghost';
  depsBtn.title = 'Dependencies';
  depsBtn.onclick = () => openTaskDependenciesModal(task.id);
  const depsIcon = document.createElement('i');
  depsIcon.setAttribute('data-lucide', 'git-branch');
  depsIcon.className = 'w-3 h-3';
  depsBtn.appendChild(depsIcon);
  btnDiv.appendChild(depsBtn);
  
  // Add subtask (parent tasks only)
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
  
  // Edit
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-xs btn-ghost';
  editBtn.title = 'Edit';
  editBtn.onclick = () => openTaskModal(task.id);
  const editIcon = document.createElement('i');
  editIcon.setAttribute('data-lucide', 'edit-2');
  editIcon.className = 'w-3 h-3';
  editBtn.appendChild(editIcon);
  btnDiv.appendChild(editBtn);
  
  // Delete
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
  const colorInput = document.getElementById('taskColor');
  const tagsContainer = document.getElementById('taskTagsContainer');
  
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
  
  // Populate tag checkboxes
  tagsContainer.innerHTML = '';
  if (blueprintState.tags.length === 0) {
    tagsContainer.innerHTML = '<span class="text-base-content/40">No tags defined yet</span>';
  } else {
    blueprintState.tags.forEach(tag => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-2 cursor-pointer';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox checkbox-sm';
      checkbox.value = tag.id;
      checkbox.dataset.tagId = tag.id;
      
      const span = document.createElement('span');
      span.textContent = tag.name;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      tagsContainer.appendChild(label);
    });
  }
  
  // Populate stakeholder checkboxes (Addendum J)
  const stakeholdersContainer = document.getElementById('taskStakeholdersContainer');
  stakeholdersContainer.innerHTML = '';
  if (blueprintState.stakeholders.length === 0) {
    stakeholdersContainer.innerHTML = '<span class="text-base-content/40">No stakeholders defined yet</span>';
  } else {
    blueprintState.stakeholders.forEach(stakeholder => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-2 cursor-pointer';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox checkbox-sm';
      checkbox.value = stakeholder.id;
      checkbox.dataset.stakeholderId = stakeholder.id;
      
      const span = document.createElement('span');
      span.textContent = stakeholder.name;
      
      label.appendChild(checkbox);
      label.appendChild(span);
      stakeholdersContainer.appendChild(label);
    });
  }
  
  if (taskId) {
    const task = blueprintState.tasks.find(t => t.id === taskId);
    title.textContent = task.parent_id ? 'Edit Subtask' : 'Edit Task';
    nameInput.value = task.name;
    milestoneSelect.value = task.milestone_id || '';
    parentSelect.value = task.parent_id || '';
    
    // Set color
    colorInput.value = task.color || '';
    document.querySelectorAll('[data-color]').forEach(btn => btn.classList.remove('ring-2', 'ring-primary'));
    if (task.color !== null && task.color !== undefined) {
      const selectedBtn = document.querySelector('[data-color="' + task.color + '"]');
      if (selectedBtn) selectedBtn.classList.add('ring-2', 'ring-primary');
    }
    
    // Set tags
    if (task.tag_ids) {
      task.tag_ids.forEach(tagId => {
        const checkbox = tagsContainer.querySelector('[data-tag-id="' + tagId + '"]');
        if (checkbox) checkbox.checked = true;
      });
    }
    
    // Set stakeholders (Addendum J)
    if (task.stakeholder_ids) {
      task.stakeholder_ids.forEach(stakeholderId => {
        const checkbox = stakeholdersContainer.querySelector('[data-stakeholder-id="' + stakeholderId + '"]');
        if (checkbox) checkbox.checked = true;
      });
    }
    
    // Set timing (Addendum G)
    document.getElementById('taskDeadlineOffset').value = task.deadline_offset_days || '';
    document.getElementById('taskDuration').value = task.duration_days || '';
    document.getElementById('taskPlannedHours').value = task.planned_hours || '';
  } else {
    title.textContent = parentId ? 'Add Subtask' : 'Add Task';
    nameInput.value = '';
    milestoneSelect.value = '';
    parentSelect.value = parentId || '';
    colorInput.value = '';
    document.querySelectorAll('[data-color]').forEach(btn => btn.classList.remove('ring-2', 'ring-primary'));
    
    // Clear timing (Addendum G)
    document.getElementById('taskDeadlineOffset').value = '';
    document.getElementById('taskDuration').value = '';
    document.getElementById('taskPlannedHours').value = '';
  }
  
  modal.showModal();
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('taskName').value.trim();
  const milestoneId = document.getElementById('taskMilestone').value || null;
  const parentId = document.getElementById('taskParent').value || null;
  const colorValue = document.getElementById('taskColor').value;
  const color = colorValue === '' || colorValue === '0' ? null : parseInt(colorValue, 10);
  
  // Get selected tags
  const tagCheckboxes = document.querySelectorAll('#taskTagsContainer input[type="checkbox"]:checked');
  const tag_ids = Array.from(tagCheckboxes).map(cb => cb.value);
  
  // Get selected stakeholders (Addendum J)
  const stakeholderCheckboxes = document.querySelectorAll('#taskStakeholdersContainer input[type="checkbox"]:checked');
  const stakeholder_ids = Array.from(stakeholderCheckboxes).map(cb => cb.value);
  
  // Get timing values (Addendum G)
  const deadlineOffsetStr = document.getElementById('taskDeadlineOffset').value;
  const durationStr = document.getElementById('taskDuration').value;
  const plannedHoursStr = document.getElementById('taskPlannedHours').value;
  
  const deadline_offset_days = deadlineOffsetStr ? parseInt(deadlineOffsetStr, 10) : null;
  const duration_days = durationStr ? parseInt(durationStr, 10) : null;
  const planned_hours = plannedHoursStr ? parseFloat(plannedHoursStr) : null;
  
  if (!name) return;
  
  if (editingTaskId) {
    const task = blueprintState.tasks.find(t => t.id === editingTaskId);
    task.name = name;
    task.milestone_id = milestoneId;
    task.parent_id = parentId;
    task.color = color;
    task.tag_ids = tag_ids;
    task.stakeholder_ids = stakeholder_ids; // Addendum J
    task.deadline_offset_days = deadline_offset_days;
    task.duration_days = duration_days;
    task.planned_hours = planned_hours;
  } else {
    blueprintState.tasks.push({
      id: generateUUID(),
      name: name,
      milestone_id: milestoneId,
      parent_id: parentId,
      color: color,
      tag_ids: tag_ids,
      stakeholder_ids: stakeholder_ids, // Addendum J
      deadline_offset_days: deadline_offset_days,
      duration_days: duration_days,
      planned_hours: planned_hours
    });
  }
  
  document.getElementById('taskModal').close();
  
  // H.1: Trigger recalculation when task milestone or timing changes
  recalculateRelativeTiming();
  
  validateAndDisplay();
  
  // Persist immediately
  await persistBlueprint('task_save');
}

async function deleteTask(taskId) {
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
    validateAndDisplay();
    
    // Persist immediately
    await persistBlueprint('task_delete');
  }
}

// ============================================================================
// DEPENDENCIES (Addendum E - Inline per-task management)
// ============================================================================

/**
 * Open inline dependency management modal for a specific task
 * Allows multi-select of dependencies with cycle detection
 */
function openTaskDependenciesModal(taskId) {
  const task = blueprintState.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  // Get current dependencies for this task
  const currentDeps = blueprintState.dependencies
    .filter(d => d.task_id === taskId)
    .map(d => d.depends_on_task_id);
  
  // Create modal
  const modal = document.createElement('dialog');
  modal.className = 'modal modal-open';
  
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box';
  
  // Header
  const title = document.createElement('h3');
  title.className = 'font-bold text-lg mb-2';
  title.textContent = 'Manage Dependencies';
  modalBox.appendChild(title);
  
  const subtitle = document.createElement('p');
  subtitle.className = 'text-sm text-base-content/60 mb-4';
  subtitle.textContent = `Task: ${task.name}`;
  modalBox.appendChild(subtitle);
  
  // Instructions
  const instructions = document.createElement('p');
  instructions.className = 'text-sm mb-4';
  instructions.textContent = 'Select tasks that this task depends on (must complete before this task can start):';
  modalBox.appendChild(instructions);
  
  // Task list with checkboxes
  const taskListContainer = document.createElement('div');
  taskListContainer.className = 'max-h-96 overflow-y-auto border border-base-300 rounded-lg p-3 mb-4';
  
  // Get available tasks (exclude self and subtasks of current task)
  const availableTasks = blueprintState.tasks.filter(t => 
    t.id !== taskId && t.parent_id !== taskId
  );
  
  if (availableTasks.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'text-center text-base-content/40';
    emptyMsg.textContent = 'No other tasks available';
    taskListContainer.appendChild(emptyMsg);
  } else {
    availableTasks.forEach(availableTask => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-2 p-2 hover:bg-base-200 rounded cursor-pointer';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox checkbox-sm';
      checkbox.value = availableTask.id;
      checkbox.checked = currentDeps.includes(availableTask.id);
      label.appendChild(checkbox);
      
      const taskName = document.createElement('span');
      taskName.className = 'flex-1';
      taskName.textContent = availableTask.name;
      
      // Add visual indicator if subtask
      if (availableTask.parent_id) {
        taskName.className += ' ml-4 text-sm text-base-content/60';
      }
      
      label.appendChild(taskName);
      taskListContainer.appendChild(label);
    });
  }
  
  modalBox.appendChild(taskListContainer);
  
  // Error message area
  const errorMsg = document.createElement('div');
  errorMsg.className = 'alert alert-error hidden mb-4';
  errorMsg.id = 'dependencyErrorMsg';
  modalBox.appendChild(errorMsg);
  
  // Actions
  const actions = document.createElement('div');
  actions.className = 'modal-action';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    modal.close();
    modal.remove();
  };
  actions.appendChild(cancelBtn);
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save Dependencies';
  saveBtn.onclick = async () => {
    // Get selected dependencies
    const checkboxes = taskListContainer.querySelectorAll('input[type="checkbox"]');
    const selectedDeps = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    
    // Validate: no self-reference (already filtered out, but double-check)
    if (selectedDeps.includes(taskId)) {
      showDependencyError(errorMsg, 'Task cannot depend on itself');
      return;
    }
    
    // Validate: no circular dependencies
    const cycleCheck = validateNoCycles(taskId, selectedDeps);
    if (!cycleCheck.valid) {
      showDependencyError(errorMsg, cycleCheck.error);
      return;
    }
    
    // Update dependencies
    // Remove old dependencies for this task
    blueprintState.dependencies = blueprintState.dependencies.filter(d => d.task_id !== taskId);
    
    // Add new dependencies
    selectedDeps.forEach(depId => {
      blueprintState.dependencies.push({
        task_id: taskId,
        depends_on_task_id: depId
      });
    });
    
    // Re-render tasks to update badges
    renderTasks();
    validateAndDisplay();
    
    modal.close();
    modal.remove();
    
    // Persist immediately
    await persistBlueprint('dependencies_save');
    
    showToast('Dependencies updated', 'success');
  };
  actions.appendChild(saveBtn);
  
  modalBox.appendChild(actions);
  modal.appendChild(modalBox);
  document.body.appendChild(modal);
  
  modal.showModal();
}

/**
 * Show error message in dependency modal
 */
function showDependencyError(errorElement, message) {
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
}

/**
 * Validate that adding dependencies will not create cycles
 * Returns {valid: boolean, error: string|null}
 */
function validateNoCycles(taskId, newDependsOnIds) {
  // Build temporary dependency graph with proposed changes
  const tempDeps = blueprintState.dependencies.filter(d => d.task_id !== taskId);
  newDependsOnIds.forEach(depId => {
    tempDeps.push({ task_id: taskId, depends_on_task_id: depId });
  });
  
  // Build adjacency graph
  const graph = new Map();
  tempDeps.forEach(dep => {
    if (!graph.has(dep.task_id)) {
      graph.set(dep.task_id, []);
    }
    graph.get(dep.task_id).push(dep.depends_on_task_id);
  });
  
  // DFS cycle detection
  const visited = new Set();
  const recursionStack = new Set();
  let cycleFound = null;
  
  function dfs(node, path) {
    if (cycleFound) return;
    
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat(neighbor);
        const taskNames = cycle.map(id => {
          const t = blueprintState.tasks.find(task => task.id === id);
          return t ? t.name : id;
        });
        cycleFound = `Circular dependency: ${taskNames.join(' → ')}`;
        return;
      }
    }
    
    path.pop();
    recursionStack.delete(node);
  }
  
  // Check all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
      if (cycleFound) break;
    }
  }
  
  if (cycleFound) {
    return { valid: false, error: cycleFound };
  }
  
  return { valid: true, error: null };
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
  
  // Addendum A: Subtasks are now optional (removed validation requirement)
  // Tasks can exist standalone without subtasks
  
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

// ============================================================================
// GENERATION HISTORY
// ============================================================================

// Initialize generation history view
async function initGenerationHistory() {
  initTheme();
  
  // Set template name in header
  const templateNameDisplay = document.getElementById('templateNameDisplay');
  if (window.TEMPLATE_NAME) {
    templateNameDisplay.textContent = window.TEMPLATE_NAME;
  }
  
  lucide.createIcons();
  loadGenerationHistory();
}

// Load generation history from API
async function loadGenerationHistory() {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const historyTable = document.getElementById('historyTable');
  const helpText = document.getElementById('helpText');
  
  try {
    const response = await fetch('/projects/api/generations/' + window.TEMPLATE_ID, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load generation history');
    }
    
    const result = await response.json();
    
    loadingState.style.display = 'none';
    
    if (!result.success || !result.data || result.data.length === 0) {
      emptyState.style.display = 'block';
      lucide.createIcons();
      return;
    }
    
    renderGenerationHistory(result.data);
    historyTable.style.display = 'block';
    helpText.style.display = 'flex';
    lucide.createIcons();
    
  } catch (error) {
    console.error('Failed to load generation history:', error);
    loadingState.style.display = 'none';
    showToast('Failed to load generation history', 'error');
  }
}

// Render generation history table
function renderGenerationHistory(generations) {
  const tbody = document.getElementById('historyTableBody');
  tbody.innerHTML = '';
  
  generations.forEach(generation => {
    const tr = document.createElement('tr');
    
    // Status column
    const statusTd = document.createElement('td');
    const statusBadge = createStatusBadge(generation.status);
    statusTd.appendChild(statusBadge);
    tr.appendChild(statusTd);
    
    // Started column
    const startedTd = document.createElement('td');
    startedTd.className = 'text-sm';
    startedTd.textContent = formatDateTime(generation.started_at);
    tr.appendChild(startedTd);
    
    // Duration column
    const durationTd = document.createElement('td');
    durationTd.className = 'text-sm';
    if (generation.completed_at) {
      durationTd.textContent = calculateDuration(generation.started_at, generation.completed_at);
    } else if (generation.status === 'in_progress') {
      durationTd.textContent = 'In progress...';
    } else {
      durationTd.textContent = '-';
    }
    tr.appendChild(durationTd);
    
    // Result column
    const resultTd = document.createElement('td');
    
    if (generation.status === 'completed' && generation.odoo_project_url) {
      const link = document.createElement('a');
      link.href = generation.odoo_project_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'link link-primary flex items-center gap-2';
      
      const linkText = document.createElement('span');
      linkText.textContent = 'View in Odoo';
      link.appendChild(linkText);
      
      const linkIcon = document.createElement('i');
      linkIcon.setAttribute('data-lucide', 'external-link');
      linkIcon.className = 'w-4 h-4';
      link.appendChild(linkIcon);
      
      resultTd.appendChild(link);
    } else if (generation.status === 'failed') {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'text-sm';
      
      const failedStepText = document.createElement('div');
      failedStepText.className = 'font-semibold text-error mb-1';
      failedStepText.textContent = 'Failed at: ' + (generation.failed_step || 'unknown');
      errorDiv.appendChild(failedStepText);
      
      if (generation.error_message) {
        const errorText = document.createElement('div');
        errorText.className = 'text-base-content/60';
        errorText.textContent = generation.error_message;
        errorDiv.appendChild(errorText);
      }
      
      const cleanupNote = document.createElement('div');
      cleanupNote.className = 'text-xs text-base-content/40 mt-2';
      cleanupNote.textContent = 'Manual cleanup in Odoo may be required';
      errorDiv.appendChild(cleanupNote);
      
      resultTd.appendChild(errorDiv);
    } else if (generation.status === 'in_progress') {
      const spinner = document.createElement('span');
      spinner.className = 'loading loading-spinner loading-sm';
      resultTd.appendChild(spinner);
    } else {
      resultTd.textContent = '-';
    }
    
    tr.appendChild(resultTd);
    tbody.appendChild(tr);
  });
}

// Create status badge
function createStatusBadge(status) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  
  let icon = '';
  let badgeClass = '';
  
  switch (status) {
    case 'completed':
      badgeClass = 'badge-success';
      icon = 'check-circle';
      badge.textContent = 'Completed';
      break;
    case 'failed':
      badgeClass = 'badge-error';
      icon = 'x-circle';
      badge.textContent = 'Failed';
      break;
    case 'in_progress':
      badgeClass = 'badge-warning';
      icon = 'loader';
      badge.textContent = 'In Progress';
      break;
    case 'pending':
      badgeClass = 'badge-ghost';
      icon = 'clock';
      badge.textContent = 'Pending';
      break;
    default:
      badge.textContent = status;
  }
  
  badge.className += ' ' + badgeClass + ' gap-1';
  
  if (icon) {
    const iconEl = document.createElement('i');
    iconEl.setAttribute('data-lucide', icon);
    iconEl.className = 'w-3 h-3';
    badge.insertBefore(iconEl, badge.firstChild);
  }
  
  return badge;
}

// Format date and time
function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Calculate duration between two timestamps
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return '-';
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end - start;
  
  if (durationMs < 0) return '-';
  
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ============================================================================
// GENERATION PREVIEW MODAL (Addendum C)
// ============================================================================

/**
 * Show generation preview modal with editable task list
 * 
 * @param {Object} generationModel - The canonical generation model
 * @param {string} templateId - Template ID for generation
 */
async function showGenerationPreviewModal(generationModel, templateId, projectStartDate, stakeholderMapping) {
  // Create modal backdrop
  const modal = document.createElement('dialog');
  modal.className = 'modal modal-open';
  modal.id = 'generationPreviewModal';
  
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box w-11/12 max-w-5xl';
  
  // Header
  const header = document.createElement('div');
  header.className = 'mb-4';
  
  const title = document.createElement('h2');
  title.className = 'text-2xl font-bold mb-2';
  title.textContent = 'Review Project Generation';
  header.appendChild(title);
  
  const subtitle = document.createElement('p');
  subtitle.className = 'text-base-content/60';
  subtitle.textContent = 'Review and customize the project structure before creating it in Odoo.';
  header.appendChild(subtitle);
  
  modalBox.appendChild(header);
  
  // Project name (editable)
  const projectSection = document.createElement('div');
  projectSection.className = 'mb-6';
  
  const projectLabel = document.createElement('label');
  projectLabel.className = 'font-semibold text-sm text-base-content/60 mb-1 block';
  projectLabel.textContent = 'Project Name';
  projectSection.appendChild(projectLabel);
  
  const projectNameInput = document.createElement('input');
  projectNameInput.type = 'text';
  projectNameInput.className = 'input input-bordered w-full';
  projectNameInput.value = generationModel.project.name;
  projectNameInput.onchange = () => {
    generationModel.project.name = projectNameInput.value.trim() || generationModel.project.name;
  };
  projectSection.appendChild(projectNameInput);
  
  modalBox.appendChild(projectSection);
  
  // Task list container
  const taskSection = document.createElement('div');
  taskSection.className = 'mb-6';
  
  const taskLabel = document.createElement('div');
  taskLabel.className = 'font-semibold text-sm text-base-content/60 mb-2';
  taskLabel.textContent = 'Tasks & Subtasks';
  taskSection.appendChild(taskLabel);
  
  const taskList = document.createElement('div');
  taskList.className = 'space-y-2 max-h-96 overflow-y-auto border border-base-300 rounded-lg p-4';
  taskList.id = 'previewTaskList';
  
  // Render tasks hierarchically
  renderPreviewTasks(taskList, generationModel);
  
  taskSection.appendChild(taskList);
  modalBox.appendChild(taskSection);
  
  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'flex gap-3 justify-end';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    modal.close();
    modal.remove();
  };
  actions.appendChild(cancelBtn);
  
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.id = 'confirmGenerationBtn';
  confirmBtn.onclick = async () => {
    await executeGenerationWithOverride(templateId, generationModel, projectStartDate, stakeholderMapping);
    modal.close();
    modal.remove();
  };
  
  const confirmIcon = document.createElement('i');
  confirmIcon.setAttribute('data-lucide', 'play');
  confirmIcon.className = 'w-4 h-4';
  confirmBtn.appendChild(confirmIcon);
  
  const confirmText = document.createElement('span');
  confirmText.textContent = 'Confirm & Generate';
  confirmBtn.appendChild(confirmText);
  
  actions.appendChild(confirmBtn);
  modalBox.appendChild(actions);
  
  modal.appendChild(modalBox);
  document.body.appendChild(modal);
  
  // Initialize Lucide icons
  lucide.createIcons();
  
  modal.showModal();
}

/**
 * Render tasks hierarchically with inline edit/remove
 */
function renderPreviewTasks(container, generationModel) {
  container.innerHTML = ''; // Clear existing
  
  // Group tasks by parent
  const parentTasks = generationModel.tasks.filter(t => !t.parent_blueprint_id);
  const subtaskMap = new Map();
  
  generationModel.tasks.forEach(task => {
    if (task.parent_blueprint_id) {
      if (!subtaskMap.has(task.parent_blueprint_id)) {
        subtaskMap.set(task.parent_blueprint_id, []);
      }
      subtaskMap.get(task.parent_blueprint_id).push(task);
    }
  });
  
  // Render parent tasks
  parentTasks.forEach(task => {
    const taskRow = createPreviewTaskRow(task, generationModel, false);
    container.appendChild(taskRow);
    
    // Render subtasks
    const subtasks = subtaskMap.get(task.blueprint_id) || [];
    subtasks.forEach(subtask => {
      const subtaskRow = createPreviewTaskRow(subtask, generationModel, true);
      container.appendChild(subtaskRow);
    });
  });
}

/**
 * Create a single task row with rename/remove actions and timing
 * Addendum H: Show and allow editing of calculated dates and hours
 */
function createPreviewTaskRow(task, generationModel, isSubtask) {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 p-3 border border-base-300 rounded hover:bg-base-200';
  row.dataset.taskId = task.blueprint_id;
  
  if (isSubtask) {
    row.className += ' ml-8';
  }
  
  // Left side: icon + name
  const leftSide = document.createElement('div');
  leftSide.className = 'flex items-center gap-2 flex-1 min-w-0';
  
  // Task icon
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', isSubtask ? 'corner-down-right' : 'square');
  icon.className = 'w-4 h-4 text-base-content/40 flex-shrink-0';
  leftSide.appendChild(icon);
  
  // Task name (editable)
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input input-sm input-ghost flex-1 min-w-0';
  nameInput.value = task.name;
  nameInput.onchange = () => {
    task.name = nameInput.value.trim() || task.name; // Update in-memory
  };
  leftSide.appendChild(nameInput);
  
  // Milestone badge (if exists)
  if (task.milestone_name) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-sm badge-outline flex-shrink-0';
    badge.textContent = task.milestone_name;
    leftSide.appendChild(badge);
  }
  
  row.appendChild(leftSide);
  
  // Right side: timing fields
  const timingContainer = document.createElement('div');
  timingContainer.className = 'flex items-center gap-2 flex-shrink-0';
  
  // Start date (if exists)
  if (task.planned_date_begin) {
    const startGroup = document.createElement('div');
    startGroup.className = 'flex flex-col';
    
    const startLabel = document.createElement('label');
    startLabel.className = 'text-xs text-base-content/60';
    startLabel.textContent = 'Start';
    startGroup.appendChild(startLabel);
    
    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.className = 'input input-xs input-bordered w-32';
    startInput.value = task.planned_date_begin;
    startInput.onchange = () => {
      task.planned_date_begin = startInput.value;
      task._manualOverride = true; // Mark as manually overridden (Addendum H)
    };
    startGroup.appendChild(startInput);
    
    timingContainer.appendChild(startGroup);
  }
  
  // Deadline (if exists)
  if (task.date_deadline) {
    const deadlineGroup = document.createElement('div');
    deadlineGroup.className = 'flex flex-col';
    
    const deadlineLabel = document.createElement('label');
    deadlineLabel.className = 'text-xs text-base-content/60';
    deadlineLabel.textContent = 'Deadline';
    deadlineGroup.appendChild(deadlineLabel);
    
    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'date';
    deadlineInput.className = 'input input-xs input-bordered w-32';
    deadlineInput.value = task.date_deadline;
    deadlineInput.onchange = () => {
      task.date_deadline = deadlineInput.value;
      task._manualOverride = true; // Mark as manually overridden (Addendum H)
    };
    deadlineGroup.appendChild(deadlineInput);
    
    timingContainer.appendChild(deadlineGroup);
  }
  
  // Planned hours (if exists)
  if (task.planned_hours !== null && task.planned_hours !== undefined) {
    const hoursGroup = document.createElement('div');
    hoursGroup.className = 'flex flex-col';
    
    const hoursLabel = document.createElement('label');
    hoursLabel.className = 'text-xs text-base-content/60';
    hoursLabel.textContent = 'Hours';
    hoursGroup.appendChild(hoursLabel);
    
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.step = '0.5';
    hoursInput.min = '0';
    hoursInput.className = 'input input-xs input-bordered w-20';
    hoursInput.value = task.planned_hours;
    hoursInput.onchange = () => {
      const value = parseFloat(hoursInput.value);
      task.planned_hours = isNaN(value) ? null : value;
      task._manualOverride = true; // Mark as manually overridden (Addendum H)
    };
    hoursGroup.appendChild(hoursInput);
    
    timingContainer.appendChild(hoursGroup);
  }
  
  row.appendChild(timingContainer);
  
  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-ghost btn-xs btn-square flex-shrink-0';
  removeBtn.title = 'Remove task';
  removeBtn.onclick = () => {
    removeTaskFromModel(task.blueprint_id, generationModel);
    // Re-render task list
    const taskList = document.getElementById('previewTaskList');
    renderPreviewTasks(taskList, generationModel);
    lucide.createIcons();
  };
  
  const removeIcon = document.createElement('i');
  removeIcon.setAttribute('data-lucide', 'x');
  removeIcon.className = 'w-4 h-4';
  removeBtn.appendChild(removeIcon);
  
  row.appendChild(removeBtn);
  
  return row;
}

/**
 * Remove task and its dependencies from generation model
 */
function removeTaskFromModel(taskId, generationModel) {
  // Remove task itself
  generationModel.tasks = generationModel.tasks.filter(t => t.blueprint_id !== taskId);
  
  // Remove any subtasks
  generationModel.tasks = generationModel.tasks.filter(t => t.parent_blueprint_id !== taskId);
  
  // Remove dependencies pointing to this task
  generationModel.tasks.forEach(task => {
    if (task.dependencies && Array.isArray(task.dependencies)) {
      task.dependencies = task.dependencies.filter(depId => depId !== taskId);
    }
  });
}

/**
 * Execute generation with override model
 */
/**
 * Execute generation with override model (Addendum C + J)
 * 
 * @param {string} templateId - Template ID
 * @param {Object} overrideModel - Modified generation model
 * @param {string|null} projectStartDate - Project start date
 * @param {Object|null} stakeholderMapping - Stakeholder to user mapping (Addendum J)
 * @param {boolean} confirmOverwrite - Force generation despite conflicts
 */
async function executeGenerationWithOverride(templateId, overrideModel, projectStartDate = null, stakeholderMapping = null, confirmOverwrite = false) {
  showToast('Generating project... This may take a moment.', 'info');
  
  try {
    const response = await fetch(`/projects/api/generate/${templateId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overrideModel: overrideModel,
        projectStartDate: projectStartDate,  // Addendum G
        stakeholderMapping: stakeholderMapping,  // Addendum J
        confirmOverwrite: confirmOverwrite
      })
    });
    
    const result = await response.json();
    
    if (response.status === 409) {
      showBlockedGenerationModal(result, templateId, overrideModel, projectStartDate, stakeholderMapping);
    } else if (result.success) {
      showSuccessGenerationModal(result, templateId);
    } else {
      showFailureGenerationModal(result, templateId);
    }
  } catch (err) {
    console.error('Generate error:', err);
    showToast('Network error during generation. Please check Odoo manually.', 'error');
  }
}

// ============================================================================
// GENERATION FEEDBACK MODALS
// ============================================================================

/**
 * Show success modal after successful project generation
 */
function showSuccessGenerationModal(result, templateId) {
  const modal = createGenerationModal('success');
  const body = modal.querySelector('.modal-body');
  
  // Success message
  const message = document.createElement('p');
  message.className = 'text-lg mb-4';
  message.textContent = 'Project generated successfully!';
  body.appendChild(message);
  
  // Buttons container
  const btnContainer = document.createElement('div');
  btnContainer.className = 'flex gap-3 justify-end';
  
  // View in Odoo button (primary action)
  if (result.odoo_project_url) {
    const odooBtn = document.createElement('a');
    odooBtn.href = result.odoo_project_url;
    odooBtn.target = '_blank';
    odooBtn.rel = 'noopener noreferrer';
    odooBtn.className = 'btn btn-primary';
    
    const odooIcon = document.createElement('i');
    odooIcon.setAttribute('data-lucide', 'external-link');
    odooIcon.className = 'w-4 h-4';
    odooBtn.appendChild(odooIcon);
    
    const odooText = document.createElement('span');
    odooText.textContent = 'View project in Odoo';
    odooBtn.appendChild(odooText);
    
    btnContainer.appendChild(odooBtn);
  }
  
  // View history button (secondary action)
  const historyBtn = document.createElement('button');
  historyBtn.className = 'btn btn-ghost';
  historyBtn.onclick = () => {
    closeGenerationModal(modal);
    window.location.href = '/projects/generations/' + templateId;
  };
  
  const historyIcon = document.createElement('i');
  historyIcon.setAttribute('data-lucide', 'history');
  historyIcon.className = 'w-4 h-4';
  historyBtn.appendChild(historyIcon);
  
  const historyText = document.createElement('span');
  historyText.textContent = 'View generation history';
  historyBtn.appendChild(historyText);
  
  btnContainer.appendChild(historyBtn);
  body.appendChild(btnContainer);
  
  document.body.appendChild(modal);
  modal.showModal();
  lucide.createIcons();
}

/**
 * Show failure modal after generation error
 */
function showFailureGenerationModal(result, templateId) {
  const modal = createGenerationModal('error');
  const body = modal.querySelector('.modal-body');
  
  // Failure message
  const message = document.createElement('p');
  message.className = 'text-lg font-semibold mb-3';
  message.textContent = 'Project generation failed';
  body.appendChild(message);
  
  // Failed step (if available)
  if (result.step) {
    const stepDiv = document.createElement('div');
    stepDiv.className = 'mb-2';
    
    const stepLabel = document.createElement('span');
    stepLabel.className = 'font-semibold';
    stepLabel.textContent = 'Failed step: ';
    stepDiv.appendChild(stepLabel);
    
    const stepValue = document.createElement('span');
    stepValue.textContent = result.step;
    stepDiv.appendChild(stepValue);
    
    body.appendChild(stepDiv);
  }
  
  // Error message (if available)
  if (result.error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'mb-4';
    
    const errorLabel = document.createElement('span');
    errorLabel.className = 'font-semibold';
    errorLabel.textContent = 'Error: ';
    errorDiv.appendChild(errorLabel);
    
    const errorValue = document.createElement('span');
    errorValue.className = 'text-error';
    errorValue.textContent = result.error;
    errorDiv.appendChild(errorValue);
    
    body.appendChild(errorDiv);
  }
  
  // Manual cleanup warning (if partial project created)
  if (result.odoo_project_id) {
    const warning = document.createElement('div');
    warning.className = 'alert alert-warning mb-4';
    
    const warningIcon = document.createElement('i');
    warningIcon.setAttribute('data-lucide', 'alert-triangle');
    warningIcon.className = 'w-5 h-5';
    warning.appendChild(warningIcon);
    
    const warningText = document.createElement('span');
    warningText.textContent = 'Partial project created in Odoo. Manual cleanup may be required.';
    warning.appendChild(warningText);
    
    body.appendChild(warning);
  }
  
  // Buttons container
  const btnContainer = document.createElement('div');
  btnContainer.className = 'flex gap-3 justify-end';
  
  // Retry button (primary action)
  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-primary';
  retryBtn.onclick = async () => {
    closeGenerationModal(modal);
    await generateProjectFromTemplate(templateId);
  };
  
  const retryIcon = document.createElement('i');
  retryIcon.setAttribute('data-lucide', 'refresh-cw');
  retryIcon.className = 'w-4 h-4';
  retryBtn.appendChild(retryIcon);
  
  const retryText = document.createElement('span');
  retryText.textContent = 'Retry generation';
  retryBtn.appendChild(retryText);
  
  btnContainer.appendChild(retryBtn);
  
  // View history button (secondary action)
  const historyBtn = document.createElement('button');
  historyBtn.className = 'btn btn-ghost';
  historyBtn.onclick = () => {
    closeGenerationModal(modal);
    window.location.href = '/projects/generations/' + templateId;
  };
  
  const historyIcon = document.createElement('i');
  historyIcon.setAttribute('data-lucide', 'history');
  historyIcon.className = 'w-4 h-4';
  historyBtn.appendChild(historyIcon);
  
  const historyText = document.createElement('span');
  historyText.textContent = 'View generation history';
  historyBtn.appendChild(historyText);
  
  btnContainer.appendChild(historyBtn);
  body.appendChild(btnContainer);
  
  document.body.appendChild(modal);
  modal.showModal();
  lucide.createIcons();
}

/**
 * Show blocked modal when generation is prevented by conflict
 */
function showBlockedGenerationModal(result, templateId, overrideModel = null, projectStartDate = null, stakeholderMapping = null) {
  const modal = createGenerationModal('warning');
  const body = modal.querySelector('.modal-body');
  
  // Determine blocking reason and message
  const isInProgress = result.blocking_status === 'in_progress';
  
  // Blocked message
  const message = document.createElement('p');
  message.className = 'text-lg font-semibold mb-3';
  message.textContent = isInProgress 
    ? 'Generation already in progress' 
    : 'Project already generated';
  body.appendChild(message);
  
  // Explanation text
  const explanation = document.createElement('p');
  explanation.className = 'mb-4';
  explanation.textContent = isInProgress
    ? 'A generation for this template is currently running. Please wait for it to complete or check the generation history.'
    : 'This template has already been used to generate a project. You can view the existing generation or generate a new one (will create a separate project).';
  body.appendChild(explanation);
  
  // Buttons container
  const btnContainer = document.createElement('div');
  btnContainer.className = 'flex gap-3 justify-end';
  
  // Conditional: Generate Again button (only for completed status)
  if (!isInProgress) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.onclick = async () => {
      closeGenerationModal(modal);
      // Retry with confirmOverwrite flag, override model, and projectStartDate
      await executeGenerationWithOverride(templateId, overrideModel, projectStartDate, stakeholderMapping, true);
    };
    
    const retryIcon = document.createElement('i');
    retryIcon.setAttribute('data-lucide', 'plus-circle');
    retryIcon.className = 'w-4 h-4';
    retryBtn.appendChild(retryIcon);
    
    const retryText = document.createElement('span');
    retryText.textContent = 'Generate again';
    retryBtn.appendChild(retryText);
    
    btnContainer.appendChild(retryBtn);
  }
  
  // View history button (secondary action)
  const historyBtn = document.createElement('button');
  historyBtn.className = 'btn btn-ghost';
  historyBtn.onclick = () => {
    closeGenerationModal(modal);
    window.location.href = '/projects/generations/' + templateId;
  };
  
  const historyIcon = document.createElement('i');
  historyIcon.setAttribute('data-lucide', 'history');
  historyIcon.className = 'w-4 h-4';
  historyBtn.appendChild(historyIcon);
  
  const historyText = document.createElement('span');
  historyText.textContent = 'View generation history';
  historyBtn.appendChild(historyText);
  
  btnContainer.appendChild(historyBtn);
  body.appendChild(btnContainer);
  
  document.body.appendChild(modal);
  modal.showModal();
  lucide.createIcons();
}

/**
 * Create base modal structure for generation feedback
 */
function createGenerationModal(type) {
  const modal = document.createElement('dialog');
  modal.className = 'modal';
  
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box';
  
  // Close button (top-right X)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm btn-circle btn-ghost absolute right-2 top-2';
  closeBtn.onclick = () => closeGenerationModal(modal);
  closeBtn.textContent = '✕';
  modalBox.appendChild(closeBtn);
  
  // Icon based on type
  const iconContainer = document.createElement('div');
  iconContainer.className = 'flex justify-center mb-4';
  
  const icon = document.createElement('i');
  icon.className = 'w-12 h-12';
  
  if (type === 'success') {
    icon.setAttribute('data-lucide', 'check-circle');
    icon.style.color = 'hsl(var(--su))';
  } else if (type === 'error') {
    icon.setAttribute('data-lucide', 'x-circle');
    icon.style.color = 'hsl(var(--er))';
  } else if (type === 'warning') {
    icon.setAttribute('data-lucide', 'alert-circle');
    icon.style.color = 'hsl(var(--wa))';
  }
  
  iconContainer.appendChild(icon);
  modalBox.appendChild(iconContainer);
  
  // Body container (will be populated by specific modal functions)
  const body = document.createElement('div');
  body.className = 'modal-body';
  modalBox.appendChild(body);
  
  modal.appendChild(modalBox);
  
  // Backdrop (click to close)
  const backdrop = document.createElement('form');
  backdrop.method = 'dialog';
  backdrop.className = 'modal-backdrop';
  modal.appendChild(backdrop);
  
  return modal;
}

/**
 * Close and remove generation modal
 */
function closeGenerationModal(modal) {
  modal.close();
  setTimeout(() => modal.remove(), 300);
}
