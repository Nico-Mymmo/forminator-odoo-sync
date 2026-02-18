/**
 * EDITOR CONTROLLER - Event Operations Frontend
 * 
 * Responsibilities:
 * - Manage editorial layer for event descriptions
 * - Load canonical Odoo description
 * - Load optional editorial override
 * - Determine active description
 * - Initialize WYSIWYG editor (Quill.js)
 * - Handle save: update Odoo, snapshot, editorial override
 * - Trigger discrepancy recalculation
 * 
 * Editorial Rules:
 * - If editorial override exists → it becomes active source
 * - If no override → Odoo description is source
 * - User can view canonical Odoo description (read-only)
 * - User can reset editorial to canonical
 * 
 * Part of: ADDENDUM D - Calendar Workspace & Editorial Layer
 * Frontend Refactor Architecture
 */

import { 
  getWebinar, 
  getEditorialOverride, 
  setEditorialOverride,
  clearEditorialOverride,
  getActiveDescription,
  setCurrentEvent
} from './state-store.js';
import { refreshCalendar } from './calendar-controller.js';

let editorInstance = null;
let currentWebinarId = null;
let editorModal = null;

/**
 * Initialize editor modal
 * Call once on page load
 */
export function initializeEditorModal() {
  // Create modal element if it doesn't exist
  if (!document.getElementById('editorial-editor-modal')) {
    createEditorModal();
  }

  editorModal = document.getElementById('editorial-editor-modal');
  
  // Bind close button
  const closeBtn = document.getElementById('close-editor-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeEditor);
  }

  // Bind save button
  const saveBtn = document.getElementById('save-editor-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveDescription);
  }

  // Bind reset button
  const resetBtn = document.getElementById('reset-editor-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToCanonical);
  }

  // Expose to global scope for detail panel
  window.openEditorialEditor = openEditor;
}

/**
 * Create editor modal HTML
 */
function createEditorModal() {
  const modal = document.createElement('dialog');
  modal.id = 'editorial-editor-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-box max-w-4xl">
      <h3 class="font-bold text-lg mb-4">Beschrijving bewerken</h3>
      
      <!-- Mode Toggle -->
      <div class="flex gap-2 mb-4">
        <button id="mode-editorial-btn" class="btn btn-sm btn-outline btn-active">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
          Editorial
        </button>
        <button id="mode-canonical-btn" class="btn btn-sm btn-outline">
          <i data-lucide="database" class="w-4 h-4"></i>
          Odoo (Read-only)
        </button>
      </div>

      <!-- Override Info -->
      <div id="override-info" class="alert alert-info mb-4 hidden">
        <i data-lucide="info" class="w-5 h-5"></i>
        <div>
          <h4 class="font-semibold">Editorial Override Active</h4>
          <p class="text-sm">Deze versie overschrijft de Odoo beschrijving bij publicatie.</p>
        </div>
      </div>

      <!-- Form Picker -->
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text font-semibold">Inschrijfformulier</span>
          <span class="label-text-alt text-xs text-gray-500">Optioneel - wordt onderaan toegevoegd</span>
        </label>
        <select id="form-picker-select" class="select select-bordered">
          <option value="">Geen formulier</option>
          <option value="14547">Webinar Inschrijving (14547)</option>
          <option value="15201">Workshop Inschrijving (15201)</option>
          <option value="16034">Training Enrollment (16034)</option>
        </select>
        <label class="label">
          <span class="label-text-alt text-xs text-gray-500">Het formulier wordt automatisch toegevoegd bij publicatie</span>
        </label>
      </div>

      <!-- Editor Container (Quill.js) -->
      <div class="mb-4">
        <div id="editorial-editor" style="height: 400px; background: white; border: 1px solid #d1d5db; border-radius: 0.5rem;"></div>
      </div>

      <!-- Actions -->
      <div class="modal-action">
        <button id="reset-editor-btn" class="btn btn-ghost">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          Reset naar Odoo
        </button>
        <button id="close-editor-btn" class="btn btn-ghost">Annuleren</button>
        <button id="save-editor-btn" class="btn btn-primary">
          <i data-lucide="save" class="w-4 h-4"></i>
          Opslaan
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  `;
  document.body.appendChild(modal);

  // Bind mode toggle
  const editorialBtn = document.getElementById('mode-editorial-btn');
  const canonicalBtn = document.getElementById('mode-canonical-btn');

  editorialBtn?.addEventListener('click', () => switchMode('editorial'));
  canonicalBtn?.addEventListener('click', () => switchMode('canonical'));
}

/**
 * Open editor for webinar
 */
export async function openEditor(webinarId) {
  currentWebinarId = webinarId;
  const webinar = getWebinar(webinarId);

  if (!webinar) {
    console.error('[EditorController] Webinar not found:', webinarId);
    return;
  }

  // Load descriptions
  const canonicalDescription = webinar.x_studio_webinar_info || '';
  const editorialOverride = getEditorialOverride(webinarId);
  const activeDescription = editorialOverride?.description || canonicalDescription;

  // Show override info if present
  const overrideInfo = document.getElementById('override-info');
  if (overrideInfo) {
    if (editorialOverride) {
      overrideInfo.classList.remove('hidden');
    } else {
      overrideInfo.classList.add('hidden');
    }
  }

  // Initialize form picker
  await initializeFormPicker(webinarId);

  // Initialize Quill.js editor
  initializeQuill(activeDescription);

  // Show modal
  if (editorModal) {
    editorModal.showModal();
  }

  // Re-initialize Lucide icons
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

/**
 * Close editor
 */
function closeEditor() {
  // Quill instance will be garbage collected, no need to manually destroy
  editorInstance = null;

  if (editorModal) {
    editorModal.close();
  }

  currentWebinarId = null;
}

/**
 * Switch mode (editorial vs canonical)
 */
function switchMode(mode) {
  const editorialBtn = document.getElementById('mode-editorial-btn');
  const canonicalBtn = document.getElementById('mode-canonical-btn');

  if (mode === 'editorial') {
    editorialBtn?.classList.add('btn-active');
    canonicalBtn?.classList.remove('btn-active');
    
    const activeDescription = getActiveDescription(currentWebinarId);
    if (editorInstance) {
      editorInstance.root.innerHTML = activeDescription;
      editorInstance.enable(true); // Editable
    }
  } else {
    editorialBtn?.classList.remove('btn-active');
    canonicalBtn?.classList.add('btn-active');
    
    const webinar = getWebinar(currentWebinarId);
    const canonicalDescription = webinar?.x_studio_webinar_info || '';
    if (editorInstance) {
      editorInstance.root.innerHTML = canonicalDescription;
      editorInstance.enable(false); // Read-only
    }
  }
}

/**
 * Initialize Quill.js editor
 */
function initializeQuill(content) {
  // Remove existing instance if present
  const editorContainer = document.getElementById('editorial-editor');
  if (!editorContainer) {
    console.error('[EditorController] Editor container not found');
    return;
  }

  // Remove any existing Quill toolbar (sibling inserted before container)
  const existingToolbar = editorContainer.previousElementSibling;
  if (existingToolbar && existingToolbar.classList.contains('ql-toolbar')) {
    existingToolbar.remove();
  }
  // Also remove any extra toolbars that may have accumulated
  editorContainer.parentElement.querySelectorAll('.ql-toolbar').forEach(tb => tb.remove());

  // Clear container and reset Quill wrapper class
  editorContainer.innerHTML = '';
  editorContainer.className = '';
  editorContainer.setAttribute('style', 'height: 400px; background: white; border: 1px solid #d1d5db; border-radius: 0.5rem;');

  // Initialize Quill.js
  editorInstance = new Quill('#editorial-editor', {
    theme: 'snow',
    placeholder: 'Voer beschrijving in...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean']
      ]
    }
  });

  // Set initial content (guard against non-string values)
  let htmlContent = content || '';
  if (typeof htmlContent === 'object') {
    // editorial_content from Supabase is { blocks: [...], version: 1 }
    if (htmlContent.blocks && Array.isArray(htmlContent.blocks)) {
      htmlContent = htmlContent.blocks.map(b => {
        if (b?.type === 'paragraph') return '<p>' + (b.content || '') + '</p>';
        if (b?.type === 'shortcode' && b.name) return '[' + b.name + ']';
        return '';
      }).filter(Boolean).join('\n');
    } else {
      htmlContent = '';
    }
  }
  editorInstance.root.innerHTML = htmlContent;
}

/**
 * Save description
 */
async function saveDescription() {
  if (!editorInstance || !currentWebinarId) return;

  const newDescription = editorInstance.root.innerHTML;
  const webinar = getWebinar(currentWebinarId);
  const canonicalDescription = webinar?.x_studio_webinar_info || '';

  try {
    // Show loading state
    const saveBtn = document.getElementById('save-editor-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Opslaan...';

    // Determine if this is an override or canonical update
    const isOverride = newDescription !== canonicalDescription;
    console.log('[EditorController] Save start:', { webinarId: currentWebinarId, isOverride, descLength: newDescription.length });

    if (isOverride) {
      // Save as editorial override (local state)
      setEditorialOverride(currentWebinarId, newDescription);
      
      // Update Odoo description
      console.log('[EditorController] Updating Odoo description...');
      await updateOdooDescription(currentWebinarId, newDescription);
      console.log('[EditorController] Odoo description updated');
      
      // Save editorial content to Supabase (persistent storage) with mode=custom
      console.log('[EditorController] Saving editorial content to Supabase...');
      await saveEditorialToSupabase(currentWebinarId, newDescription, 'custom');
      console.log('[EditorController] Editorial content saved to Supabase');
    } else {
      // User reset to canonical → set mode to use_odoo_plain (NOT null!)
      clearEditorialOverride(currentWebinarId);
      
      // Save editorial_mode to Supabase (editorial_content can remain null)
      console.log('[EditorController] Setting editorial_mode to use_odoo_plain...');
      await saveEditorialToSupabase(currentWebinarId, null, 'use_odoo_plain');
      console.log('[EditorController] Editorial mode set to use_odoo_plain');
    }

    // Refresh calendar and detail panel
    refreshCalendar();
    setCurrentEvent(currentWebinarId); // Triggers detail panel update

    // Close editor
    closeEditor();

    // Show success notification
    if (typeof showNotification === 'function') {
      showNotification('Beschrijving opgeslagen', 'success');
    }

  } catch (error) {
    console.error('[EditorController] Save failed:', error);
    
    if (typeof showNotification === 'function') {
      showNotification('Fout bij opslaan', 'error');
    }
  } finally {
    // Always restore save button state
    const saveBtn = document.getElementById('save-editor-btn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Opslaan';
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [saveBtn] });
    }
  }
}

/**
 * Reset to canonical Odoo description
 */
function resetToCanonical() {
  const webinar = getWebinar(currentWebinarId);
  const canonicalDescription = webinar?.x_studio_webinar_info || '';

  if (editorInstance) {
    editorInstance.root.innerHTML = canonicalDescription;
  }

  // Clear editorial override
  clearEditorialOverride(currentWebinarId);

  // Switch to editorial mode
  switchMode('editorial');

  if (typeof showNotification === 'function') {
    showNotification('Reset naar Odoo beschrijving', 'info');
  }
}

/**
 * Update Odoo description via API
 */
async function updateOdooDescription(webinarId, description) {
  console.log('[EditorController] PATCH /events/api/odoo-webinars/' + webinarId);
  const response = await fetch(`/events/api/odoo-webinars/${webinarId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ x_studio_webinar_info: description })
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[EditorController] Odoo PATCH failed:', response.status, errBody);
    throw new Error('Failed to update Odoo description');
  }

  return response.json();
}

/**
 * Convert HTML string to editorial blocks format
 * Expected by Supabase: { blocks: [...], version: 1 }
 */
function htmlToBlocks(html) {
  if (!html) return null;

  // Parse HTML into DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = [];

  // Walk through body children
  for (const node of doc.body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        // Check if it's a shortcode like [forminator_form id="14547"]
        const shortcodeMatch = text.match(/^\[(\w+)(?:\s+(.+?))?\]$/);
        if (shortcodeMatch) {
          const attrs = {};
          if (shortcodeMatch[2]) {
            const attrRegex = /(\w+)="([^"]*)"/g;
            let m;
            while ((m = attrRegex.exec(shortcodeMatch[2]))) {
              attrs[m[1]] = m[2];
            }
          }
          blocks.push({ type: 'shortcode', name: shortcodeMatch[1], attributes: attrs });
        } else {
          blocks.push({ type: 'paragraph', content: text });
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent.trim();
      if (!text) continue;

      // Check for shortcode inside any element
      const shortcodeMatch = text.match(/^\[(\w+)(?:\s+(.+?))?\]$/);
      if (shortcodeMatch) {
        const attrs = {};
        if (shortcodeMatch[2]) {
          const attrRegex = /(\w+)="([^"]*)"/g;
          let m;
          while ((m = attrRegex.exec(shortcodeMatch[2]))) {
            attrs[m[1]] = m[2];
          }
        }
        blocks.push({ type: 'shortcode', name: shortcodeMatch[1], attributes: attrs });
      } else {
        // PRESERVE FULL HTML (not just text!) - use outerHTML to keep formatting
        blocks.push({ type: 'paragraph', content: node.outerHTML });
      }
    }
  }

  return blocks.length > 0 ? { blocks, version: 1 } : null;
}

/**
 * Initialize form picker dropdown
 * Load current selected_form_id and bind change handler
 */
async function initializeFormPicker(webinarId) {
  const formPicker = document.getElementById('form-picker-select');
  if (!formPicker) {
    console.warn('[EditorController] Form picker not found');
    return;
  }

  try {
    // Fetch current snapshot to get selected_form_id
    const response = await fetch(`/events/api/editorial/${webinarId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const result = await response.json();
      // Note: Backend needs to return selected_form_id, not just editorial_content
      // For now, set to empty if not available
      const selectedFormId = result.selectedFormId || '';
      formPicker.value = selectedFormId;
      console.log('[EditorController] Form picker loaded:', selectedFormId || 'none');
    }
  } catch (error) {
    console.error('[EditorController] Failed to load form picker:', error);
  }

  // Bind change handler
  formPicker.onchange = async (e) => {
    const formId = e.target.value || null;
    console.log('[EditorController] Form selection changed:', formId);

    try {
      const response = await fetch(`/events/api/editorial/${webinarId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ selectedFormId: formId })
      });

      if (!response.ok) {
        throw new Error('Failed to save form selection');
      }

      console.log('[EditorController] Form selection saved');
      
      // Show subtle feedback
      if (typeof showNotification === 'function') {
        showNotification(formId ? `Formulier ${formId} geselecteerd` : 'Formulier verwijderd', 'success');
      }
    } catch (error) {
      console.error('[EditorController] Save form selection failed:', error);
      if (typeof showNotification === 'function') {
        showNotification('Fout bij opslaan formulier', 'error');
      }
    }
  };
}

/**
 * Save editorial content to Supabase via PUT /events/api/editorial/:webinarId
 * 
 * @param {string} webinarId - Odoo webinar ID
 * @param {string|null} htmlOrNull - HTML description or null
 * @param {string|null} editorialMode - Editorial mode enum value (null = don't update)
 */
async function saveEditorialToSupabase(webinarId, htmlOrNull, editorialMode = null) {
  const editorialContent = htmlOrNull ? htmlToBlocks(htmlOrNull) : null;
  
  const payload = { editorialContent };
  if (editorialMode) {
    payload.editorialMode = editorialMode;
  }
  
  console.log('[EditorController] PUT /events/api/editorial/' + webinarId, 
    editorialContent ? `${editorialContent.blocks.length} blocks` : 'null (clear)',
    editorialMode ? `mode=${editorialMode}` : '');

  const response = await fetch(`/events/api/editorial/${webinarId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[EditorController] Supabase editorial save failed:', response.status, errBody);
    throw new Error('Failed to save editorial content: ' + errBody);
  }

  const result = await response.json();
  console.log('[EditorController] Supabase editorial save result:', result);
  return result;
}