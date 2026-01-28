/**
 * Project Generator Module
 * 
 * Template library for project blueprints.
 */

import { templateLibraryUI, blueprintEditorUI, generationHistoryUI } from './ui.js';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getBlueprintData, saveBlueprintData, getTemplate, getGenerationsForTemplate } from './library.js';
import { generateProject } from './generate.js';
import { validateGenerationStart, startGeneration, markGenerationSuccess, markGenerationFailure } from './generation-lifecycle.js';

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
      const { request, env, params } = context;
      
      try {
        const updates = await request.json();
        const template = await updateTemplate(env, params.id, updates);
        
        return new Response(JSON.stringify({
          success: true,
          data: template
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Update template failed:', error);
        
        const status = error.message.includes('not found') ? 404 :
                      error.message.includes('empty') ? 400 : 500;
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Delete template
    'DELETE /api/templates/:id': async (context) => {
      const { env, params } = context;
      
      try {
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
      const { env, params } = context;
      
      try {
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
      const { request, env, params } = context;
      
      try {
        const blueprintData = await request.json();
        const template = await saveBlueprintData(env, params.id, blueprintData);
        
        return new Response(JSON.stringify({
          success: true,
          data: template
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('[Project Generator] Save blueprint failed:', error);
        
        const status = error.message.includes('not found') ? 404 :
                      error.message.includes('must be') ? 400 : 500;
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
    
    // Generate project from template
    'POST /api/generate/:id': async (context) => {
      const { request, env, params, user } = context;
      
      try {
        // Get template to access name and user_id
        const template = await getTemplate(env, params.id);
        
        if (!template) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Template not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Parse request body for confirmOverwrite flag
        let confirmOverwrite = false;
        try {
          const body = await request.json();
          confirmOverwrite = body.confirmOverwrite === true;
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
        
        try {
          // LIFECYCLE STEP 2: Build generation model (without Odoo calls)
          const blueprintData = await getBlueprintData(env, params.id);
          
          // Import buildGenerationModel or replicate logic
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
          const projectName = `${template.name} (${timestamp})`;
          
          // Build minimal model for tracking (full model built in generateProject)
          generationModel = {
            project: { name: projectName, description: null },
            stages: blueprintData.stages || [],
            tasks: blueprintData.tasks || [],
            milestones: blueprintData.milestones || [],
            dependencies: blueprintData.dependencies || []
          };
          
          // LIFECYCLE STEP 3: Start generation record BEFORE Odoo calls
          generationId = await startGeneration(env, user.id, params.id, generationModel);
          
          // LIFECYCLE STEP 4: Execute Odoo generation
          const result = await generateProject(env, params.id, template.name);
          
          if (result.success) {
            // LIFECYCLE STEP 5: Mark success
            await markGenerationSuccess(env, generationId, result);
            
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
          if (generationId) {
            await markGenerationFailure(env, generationId, 'unknown', generationError.message);
          }
          throw generationError;
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
