/**
 * Project Generator Module
 * 
 * Template library for project blueprints.
 */

import { templateLibraryUI, blueprintEditorUI } from './ui.js';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getBlueprintData, saveBlueprintData } from './library.js';

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
    }
  }
};
