/**
 * Forminator Sync Module
 * 
 * Syncs WordPress Forminator form submissions to Odoo contacts.
 */

import { handleGetMappings, handleGetMapping, handleSaveMapping, handleDeleteMapping, handleImportMappings } from './routes.js';
import { handleGetHistory, handleGetAllHistory, handleRestoreHistory } from './routes.js';
import { handleTestConnection } from './routes.js';
import { handleReceiveForminator } from './routes.js';
import { adminInterfaceHTML } from './ui.js';

export default {
  // Module metadata
  code: 'forminator_sync',
  name: 'Forminator Admin',
  description: 'Sync WordPress Forminator forms to Odoo',
  route: '/forminator',
  icon: 'workflow',
  
  // Module status
  isActive: true,
  requiresAuth: true,  // Requires login
  requiresAdmin: false,  // Not admin-only, but user needs module access
  
  // Route handlers
  routes: {
    // Main UI
    'GET /': async (context) => {
      return new Response(adminInterfaceHTML(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    // Mappings API (relative to /forminator)
    'GET /api/mappings': handleGetMappings,
    'GET /api/mappings/:id': handleGetMapping,
    'POST /api/mappings': handleSaveMapping,
    'POST /api/mappings/:id': handleSaveMapping,  // Save specific form mapping
    'POST /api/mappings/import': handleImportMappings,
    'DELETE /api/mappings/:id': handleDeleteMapping,
    
    // History API
    'GET /api/history': handleGetAllHistory,
    'GET /api/history/:id': handleGetHistory,
    'POST /api/history/:id/restore': handleRestoreHistory,
    
    // Actions (legacy support)
    'POST /api/test-connection': handleTestConnection,
    'POST /api/receive': handleReceiveForminator,
  }
};
