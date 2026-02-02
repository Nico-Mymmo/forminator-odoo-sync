/**
 * Project Generator Module
 * 
 * Template library for project blueprints.
 * Addendum N: Permission enforcement at API layer
 */

import { templateLibraryUI, blueprintEditorUI, generationHistoryUI } from './ui.js';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getBlueprintData, saveBlueprintData, getTemplate, getGenerationsForTemplate } from './library.js';
import { generateProject, buildGenerationModel } from './generate.js';
import { validateBlueprint } from './validation.js';
import { validateGenerationStart, startGeneration, markGenerationSuccess, markGenerationFailure } from './generation-lifecycle.js';
import { getActiveUsers } from './odoo-creator.js'; // Addendum J
import { 
  canRead, 
  canGenerate, 
  canEdit, 
  canDelete, 
  canManageEditors,
  canChangeVisibility,
  assertCanEdit,
  createPermissionDeniedResponse, 
  createNotFoundResponse,
  isValidVisibility,
  validateEditorList
} from './permissions.js'; // Addendum N

export default {
  // Module metadata
  code: 'project_generator',
  name: 'Project Generator',
  description: 'Manage project templates',
  route: '/projects',
  icon: 'folder-plus',
  
  // Module status
  isActive: true,
  
  // Route handlers
  routes: {
    // Main UI
    'GET /': async (context) => {
      return new Response(templateLibraryUI(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    // List templates
    'GET /api/templates': async (context) => {
      const { env, user } = context;
      
      try {
        const templates = await getTemplates(env, user.id);
        
        return new Response(JSON.stringify({
          success: true,
          data: templates
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Get templates failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Create template
    'POST /api/templates': async (context) => {
      const { request, env, user } = context;
      
      try {
        const data = await request.json();
        const template = await createTemplate(env, user.id, data);
        
        return new Response(JSON.stringify({
          success: true,
          data: template
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Create template failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: error.message.includes('required') ? 400 : 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Update template
    'PUT /api/templates/:id': async (context) => {
      const { request, env, params, user } = context;
      
      try {
        const updates = await request.json();
        
        // Addendum N: Fetch template and check permissions
        const template = await getTemplate(env, params.id, user.id);
        
        if (!template) {
          return createNotFoundResponse(params.id);
        }
        
        // Addendum N: HARD GUARD - Must pass before any mutation
        assertCanEdit(template, user.id);
        
        // Addendum N: Validate visibility change (owner only)
        if (updates.visibility !== undefined) {
          if (!canChangeVisibility(template, user.id)) {
            return createPermissionDeniedResponse(params.id, user.id, 'change visibility', template.visibility);
          }
          if (!isValidVisibility(updates.visibility)) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Invalid visibility mode. Must be: private, public_generate, or public_edit'
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
        
        // NOTE: Editor management is currently disabled.
        // public_edit allows all users to edit without restriction.
        // This code is kept for backward compatibility but has no effect.
        if (updates.editor_user_ids !== undefined) {
          // Skip validation - editor list is not enforced
          console.log('[Project Generator] editor_user_ids update ignored (public_edit allows all users)');
        }
        
        const updatedTemplate = await updateTemplate(env, params.id, updates);
        
        return new Response(JSON.stringify({
          success: true,
          data: updatedTemplate
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Update template failed:', error);
        
        const status = error.status || 
                      (error.code === 'FORBIDDEN' ? 403 :
                       error.message?.includes('not found') ? 404 :
                       error.message?.includes('empty') ? 400 : 500);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message || 'Unknown error',
          code: error.code || 'ERROR',
          details: error.details
        }), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Delete template
    'DELETE /api/templates/:id': async (context) => {
      const { env, params, user } = context;
      
      try {
        // Addendum N: Fetch template and check permissions
        const template = await getTemplate(env, params.id, user.id);
        
        if (!template) {
          return createNotFoundResponse(params.id);
        }
        
        // Addendum N: Check delete permission (owner only)
        if (!canDelete(template, user.id)) {
          return createPermissionDeniedResponse(params.id, user.id, 'delete', template.visibility);
        }
        
        const deleted = await deleteTemplate(env, params.id);
        
        if (!deleted) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Template not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({
          success: true
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Delete template failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Blueprint editor UI
    'GET /blueprint/:id': async (context) => {
      const { user, params } = context;
      
      return new Response(blueprintEditorUI(user, params.id), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    // Get blueprint data
    'GET /api/blueprint/:id': async (context) => {
      const { env, params, user } = context;
      
      try {
        // Addendum N: Fetch template and check read permission
        const template = await getTemplate(env, params.id, user.id);
        
        if (!template) {
          return createNotFoundResponse(params.id);
        }
        
        if (!canRead(template, user.id)) {
          return createPermissionDeniedResponse(params.id, user.id, 'read', template.visibility);
        }
        
        const blueprintData = await getBlueprintData(env, params.id);
        
        return new Response(JSON.stringify({
          success: true,
          data: blueprintData
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Get blueprint failed:', error);
        
        const status = error.message.includes('not found') ? 404 : 500;
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Save blueprint data
    'PUT /api/blueprint/:id': async (context) => {
      const { request, env, params, user } = context;
      
      try {
        console.log('[Project Generator] PUT /api/blueprint/:id - Start', { templateId: params.id, userId: user?.id });
        
        if (!user) {
          console.error('[Project Generator] No user in context');
          return new Response(JSON.stringify({
            success: false,
            error: 'User not authenticated'
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Addendum N: Fetch template first (for permission check)
        const template = await getTemplate(env, params.id, user.id);
        
        if (!template) {
          console.error('[Project Generator] Template not found:', params.id);
          return createNotFoundResponse(params.id);
        }
        
        // Addendum N: HARD GUARD - Must pass before any mutation
        assertCanEdit(template, user.id);
        
        const blueprintData = await request.json();
        console.log('[Project Generator] Blueprint data received, saving...');
        
        const updatedTemplate = await saveBlueprintData(env, params.id, blueprintData);
        
        console.log('[Project Generator] Blueprint saved successfully');
        return new Response(JSON.stringify({
          success: true,
          data: updatedTemplate
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Save blueprint failed:', error);
        console.error('[Project Generator] Error stack:', error.stack);
        
        // Check for specific error codes
        const status = error.status || 
                      (error.code === 'FORBIDDEN' ? 403 :
                       error.message?.includes('not found') ? 404 :
                       error.message?.includes('must be') ? 400 : 500);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message || 'Unknown error',
          code: error.code || 'ERROR',
          details: error.details
        }), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Get Odoo users for stakeholder mapping (Addendum J)
    'GET /api/odoo-users': async (context) => {
      const { env } = context;
      
      try {
        const users = await getActiveUsers(env);
        
        return new Response(JSON.stringify({
          success: true,
          users: users
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Get users failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Preview generation model (Addendum C)
    'POST /api/generate-preview/:id': async (context) => {
      const { request, env, params, user } = context;
      
      try {
        // Addendum N: Fetch template and check read permission
        const template = await getTemplate(env, params.id, user.id);
        
        if (!template) {
          return createNotFoundResponse(params.id);
        }
        
        if (!canRead(template, user.id)) {
          return createPermissionDeniedResponse(params.id, user.id, 'read', template.visibility);
        }
        
        // Parse request body for projectStartDate and stakeholderMapping (Addendum G + J)
        let projectStartDate = null;
        let stakeholderMapping = null;
        try {
          const body = await request.json();
          projectStartDate = body.projectStartDate || null;
          stakeholderMapping = body.stakeholderMapping || null;  // Addendum J
        } catch {
          // No body, proceed without date or mapping
        }
        
        // Validate blueprint
        const blueprintData = await getBlueprintData(env, params.id);
        const validation = validateBlueprint(blueprintData);
        
        if (!validation.valid) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Blueprint validation failed: ' + validation.errors.join(', ')
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Build generation model with projectStartDate and stakeholderMapping (Addendum G + J)
        const generationModel = buildGenerationModel(blueprintData, template.name, projectStartDate, stakeholderMapping);
        
        return new Response(JSON.stringify({
          success: true,
          generationModel: generationModel
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Generate preview failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Generate project from template
    'POST /api/generate/:id': async (context) => {
      const { request, env, params, user } = context;
      
      try {
        // Addendum N: Fetch template and check generate permission
        const template = await getTemplate(env, params.id, user.id);
        
        if (!template) {
          return createNotFoundResponse(params.id);
        }
        
        // Addendum N: Check generate permission
        if (!canGenerate(template, user.id)) {
          return createPermissionDeniedResponse(params.id, user.id, 'generate from', template.visibility);
        }
        
        // Parse request body for confirmOverwrite flag and overrideModel
        let confirmOverwrite = false;
        let overrideModel = null;
        let projectStartDate = null;  // Addendum G
        let stakeholderMapping = null;  // Addendum J
        try {
          const body = await request.json();
          confirmOverwrite = body.confirmOverwrite === true;
          overrideModel = body.overrideModel || null;
          projectStartDate = body.projectStartDate || null;  // Addendum G: ISO YYYY-MM-DD
          stakeholderMapping = body.stakeholderMapping || null;  // Addendum J
        } catch {
          // No body or invalid JSON, proceed with default
        }
        
        // LIFECYCLE STEP 1: Validate generation can proceed
        const validation = await validateGenerationStart(env, user.id, params.id, confirmOverwrite);
        
        if (!validation.canProceed) {
          return new Response(JSON.stringify({
            success: false,
            error: validation.reason,
            existingGeneration: validation.existingGeneration
          }), {
            status: 409, // Conflict
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Execute generation with lifecycle tracking
        let generationId = null;
        let generationModel = null;
        let lifecycleClosed = false; // ADDENDUM L: Track whether lifecycle was explicitly closed
        
        try {
          // LIFECYCLE STEP 2: Build generation model (or use override)
          if (overrideModel) {
            console.log('[Project Generator] Using override model from preview (Addendum C)');
            generationModel = overrideModel;
          } else {
            // Build from blueprint
            const blueprintData = await getBlueprintData(env, params.id);
            generationModel = buildGenerationModel(blueprintData, template.name, projectStartDate, stakeholderMapping);
          }
          
          // LIFECYCLE STEP 3: Start generation record BEFORE Odoo calls
          generationId = await startGeneration(env, user.id, params.id, generationModel);
          
          // LIFECYCLE STEP 4: Execute Odoo generation (use generationModel which may be override)
          const result = await generateProject(env, params.id, template.name, projectStartDate, generationModel);
          
          if (result.success) {
            // LIFECYCLE STEP 5: Mark success
            await markGenerationSuccess(env, generationId, result);
            lifecycleClosed = true; // ADDENDUM L: Lifecycle explicitly closed
            
            return new Response(JSON.stringify({
              success: true,
              generationId: generationId,
              odoo_project_id: result.odoo_project_id,
              odoo_project_url: result.odoo_project_url
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } else {
            // LIFECYCLE STEP 6: Mark failure
            await markGenerationFailure(env, generationId, result.step, result.error);
            lifecycleClosed = true; // ADDENDUM L: Lifecycle explicitly closed
            
            return new Response(JSON.stringify({
              success: false,
              generationId: generationId,
              step: result.step,
              error: result.error
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
        } catch (generationError) {
          // LIFECYCLE STEP 7: Mark unexpected failure
          if (generationId && !lifecycleClosed) {
            try {
              await markGenerationFailure(env, generationId, 'unknown', generationError.message);
              lifecycleClosed = true;
            } catch (lifecycleError) {
              // ADDENDUM L: If lifecycle update fails here, log but continue to throw original error
              console.error('[Project Generator] Failed to mark generation failure in catch block:', lifecycleError);
            }
          }
          throw generationError;
        } finally {
          // ADDENDUM L: GUARANTEED LIFECYCLE CLOSURE
          // This runs even if Worker is killed, exception thrown, or early return
          if (generationId && !lifecycleClosed) {
            console.warn('[Project Generator] FINALLY BLOCK: Lifecycle not closed, forcing failure state');
            try {
              await markGenerationFailure(env, generationId, 'incomplete', 'Generation did not complete normally');
            } catch (finallyError) {
              console.error('[Project Generator] CRITICAL: Finally block lifecycle update failed:', finallyError);
              // Nothing more we can do - at least we tried
            }
          }
        }
        
      } catch (error) {
        console.error('[Project Generator] Generate project failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          step: 'unknown',
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Generation history UI
    'GET /generations/:id': async (context) => {
      const { params, user, env } = context;
      
      try {
        // Get template to check ownership and get name
        const template = await getTemplate(env, params.id);
        
        if (!template) {
          return new Response('Template not found', { status: 404 });
        }
        
        return new Response(generationHistoryUI(user, params.id, template.name), {
          headers: { 'Content-Type': 'text/html' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Generation history UI failed:', error);
        return new Response('Error loading generation history', { status: 500 });
      }
    },
    
    // Get generations for template (API)
    'GET /api/generations/:id': async (context) => {
      const { env, user, params } = context;
      
      try {
        const generations = await getGenerationsForTemplate(env, user.id, params.id);
        
        return new Response(JSON.stringify({
          success: true,
          data: generations
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Get generations failed:', error);
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
};
