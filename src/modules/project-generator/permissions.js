/**
 * Addendum N: Template Visibility & Permissions
 * 
 * Permission enforcement layer for project templates.
 * 
 * RULES (from ADDENDUM_N.md):
 * - All permission checks are server-side
 * - Fail-hard on violations (403 Forbidden)
 * - Log all violations
 * - No implicit permissions
 * - Privacy invariant: Private templates cannot be inferred by non-owners
 */

/**
 * Check if user can READ a template
 * 
 * Rules:
 * - PRIVATE → Owner only
 * - PUBLIC_GENERATE → Everyone
 * - PUBLIC_EDIT → Everyone
 * 
 * @param {Object} template - Template object with visibility and owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if user can read
 */
export function canRead(template, userId) {
  if (template.visibility === 'private') {
    return template.owner_user_id === userId;
  }
  return true; // public_generate or public_edit
}

/**
 * Check if user can GENERATE from a template
 * 
 * Rules:
 * - PRIVATE → Owner only
 * - PUBLIC_GENERATE → Everyone
 * - PUBLIC_EDIT → Everyone
 * 
 * @param {Object} template - Template object with visibility and owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if user can generate
 */
export function canGenerate(template, userId) {
  if (template.visibility === 'private') {
    return template.owner_user_id === userId;
  }
  return true; // public_generate or public_edit
}

/**
 * Check if user can EDIT a template
 * 
 * Rules:
 * - PRIVATE → Owner only
 * - PUBLIC_GENERATE → Owner only
 * - PUBLIC_EDIT → Everyone (simplified collaboration model)
 * 
 * NOTE: The permission model is intentionally simplified.
 * public_edit allows all authenticated users to edit.
 * Fine-grained editor control may be reintroduced in a future iteration.
 * 
 * @param {Object} template - Template object with visibility, owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if user can edit
 */
export function canEdit(template, userId) {
  // Owner always has edit rights
  if (template.owner_user_id === userId) {
    return true;
  }
  
  // Public edit mode: everyone can edit
  if (template.visibility === 'public_edit') {
    return true;
  }
  
  // Private or public_generate: no one else can edit
  return false;
}

/**
 * Check if user can DELETE a template
 * 
 * Rules:
 * - Only owner can delete in ALL modes
 * 
 * @param {Object} template - Template object with owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if user can delete
 */
export function canDelete(template, userId) {
  return template.owner_user_id === userId;
}

/**
 * Check if user can MANAGE EDITORS (add/remove editors)
 * 
 * NOTE: Editor management is currently unused as public_edit allows all users.
 * This function is kept for backward compatibility but has no practical effect.
 * 
 * Rules:
 * - Only owner can manage editors
 * 
 * @param {Object} template - Template object with owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if user can manage editors
 */
export function canManageEditors(template, userId) {
  return template.owner_user_id === userId;
}

/**
 * Check if user can CHANGE VISIBILITY mode
 * 
 * Rules:
 * - Only owner can change visibility
 * 
 * @param {Object} template - Template object with owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if user can change visibility
 */
export function canChangeVisibility(template, userId) {
  return template.owner_user_id === userId;
}

/**
 * Check if user can SEE TEMPLATE IN LIST
 * 
 * CRITICAL PRIVACY INVARIANT:
 * A user must never be able to infer the existence of a PRIVATE template they do not own.
 * 
 * This differs from canRead in purpose:
 * - canRead: Can the user fetch/view template content?
 * - canSeeTemplateInList: Should the template appear in list/search results?
 * 
 * Rules:
 * - PRIVATE → Owner only (template must not appear in lists for others)
 * - PUBLIC_GENERATE → Everyone
 * - PUBLIC_EDIT → Everyone
 * 
 * @param {Object} template - Template object with visibility and owner_user_id
 * @param {string} userId - User UUID
 * @returns {boolean} True if template should be visible in lists
 */
export function canSeeTemplateInList(template, userId) {
  if (template.visibility === 'private') {
    return template.owner_user_id === userId;
  }
  return true; // public_generate or public_edit
}

/**
 * Create permission violation error
 * 
 * Returns 403 Forbidden error with structured logging data
 * 
 * @param {string} templateId - Template UUID
 * @param {string} userId - User UUID
 * @param {string} action - Attempted action (read, edit, generate, delete)
 * @param {string} visibility - Template visibility mode
 * @returns {Response} 403 Forbidden response
 */
export function createPermissionDeniedResponse(templateId, userId, action, visibility) {
  const errorData = {
    error: 'Forbidden',
    message: `You do not have permission to ${action} this template`,
    details: {
      template_id: templateId,
      required_permission: action,
      visibility: visibility
    }
  };
  
  // Log violation
  console.warn('[Permission Violation]', {
    user_id: userId,
    template_id: templateId,
    action: action,
    visibility: visibility,
    timestamp: new Date().toISOString()
  });
  
  return new Response(JSON.stringify(errorData), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Create not found error (for private template privacy)
 * 
 * When a user attempts to access a private template they don't own,
 * we return 404 instead of 403 to avoid leaking the template's existence.
 * 
 * @param {string} templateId - Template UUID
 * @returns {Response} 404 Not Found response
 */
export function createNotFoundResponse(templateId) {
  return new Response(JSON.stringify({
    error: 'Not Found',
    message: 'Template not found'
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Validate visibility mode
 * 
 * @param {string} visibility - Visibility mode to validate
 * @returns {boolean} True if valid
 */
export function isValidVisibility(visibility) {
  return ['private', 'public_generate', 'public_edit'].includes(visibility);
}

/**
 * Hard guard function: Assert user can edit or throw 403
 * 
 * SECURITY INVARIANT: This function MUST stop execution if permission denied.
 * DO NOT use canEdit() directly - always use this guard.
 * 
 * @param {Object} template - Template object
 * @param {string} userId - User UUID
 * @throws {Response} 403 Forbidden if user cannot edit
 */
export function assertCanEdit(template, userId) {
  // Normalize user IDs to prevent type mismatches
  const normalizedUserId = String(userId);
  const normalizedOwnerId = String(template.owner_user_id);
  const normalizedEditors = (template.editor_user_ids || []).map(String);
  
  const normalizedTemplate = {
    ...template,
    owner_user_id: normalizedOwnerId,
    editor_user_ids: normalizedEditors
  };
  
  if (!canEdit(normalizedTemplate, normalizedUserId)) {
    console.warn('[SECURITY] Forbidden blueprint edit', {
      user_id: normalizedUserId,
      template_id: template.id,
      visibility: template.visibility,
      owner_id: normalizedOwnerId
    });
    
    const error = new Error('You do not have permission to edit this template');
    error.status = 403;
    error.code = 'FORBIDDEN';
    error.details = {
      template_id: template.id,
      required_permission: 'edit',
      visibility: template.visibility
    };
    throw error;
  }
}

/**
 * Validate editor list
 * 
 * Rules:
 * - Must be an array
 * - All elements must be valid UUIDs
 * - Owner cannot be in editor list (redundant)
 * 
 * @param {Array<string>} editorUserIds - Array of user UUIDs
 * @param {string} ownerUserId - Owner user UUID
 * @returns {Object} {valid: boolean, error: string|null}
 */
export function validateEditorList(editorUserIds, ownerUserId) {
  if (!Array.isArray(editorUserIds)) {
    return { valid: false, error: 'editor_user_ids must be an array' };
  }
  
  // UUID validation regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  for (const editorId of editorUserIds) {
    if (!uuidRegex.test(editorId)) {
      return { valid: false, error: `Invalid UUID in editor list: ${editorId}` };
    }
    
    if (editorId === ownerUserId) {
      return { valid: false, error: 'Owner cannot be in editor list (redundant)' };
    }
  }
  
  return { valid: true, error: null };
}
