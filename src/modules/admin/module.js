/**
 * Admin Module
 * 
 * Platform administration: user management, invites, module assignments
 */

import { 
  handleGetUsers, 
  handleCreateUser,
  handleUpdateUserRole, 
  handleUpdateUserModules,
  handleUpdateUserOdooUid,
  handleToggleUserStatus,
  handleGetInvites,
  handleCreateInvite,
  handleDeleteInvite,
  handleGetModules
} from './routes.js';

export default {
  // Module metadata
  code: 'admin',
  name: 'Administration',
  description: 'Manage users, invites, and module access',
  route: '/admin',
  icon: 'settings',
  
  // Module status
  isActive: true,
  requiresAdmin: true,  // Only admins can access
  
  // Route handlers
  routes: {
    // Main dashboard - serve static HTML
    'GET /': async (context) => {
      // Verify admin role
      if (context.user?.role !== 'admin') {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'Admin access required'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Serve static HTML file
      const html = await context.env.ASSETS.fetch(new Request('https://placeholder/admin-dashboard.html'));
      return new Response(await html.text(), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    // Users API
    'GET /api/users': handleGetUsers,
    'POST /api/users': handleCreateUser,
    'PUT /api/users/:id/role': handleUpdateUserRole,
    'PUT /api/users/:id/modules': handleUpdateUserModules,
    'PUT /api/users/:id/odoo-uid': handleUpdateUserOdooUid,
    'PUT /api/users/:id/toggle': handleToggleUserStatus,
    
    // Invites API
    'GET /api/invites': handleGetInvites,
    'POST /api/invites': handleCreateInvite,
    'DELETE /api/invites/:id': handleDeleteInvite,
    
    // Modules API
    'GET /api/modules': handleGetModules
  }
};
