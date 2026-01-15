/**
 * Layout Component
 * 
 * Main layout wrapper with navigation and content area
 */

import { navigationHTML } from './navigation.js';

/**
 * Generate full page layout
 * @param {Object} options - Layout options
 * @param {Object} options.user - Current user
 * @param {string} options.activeRoute - Active route
 * @param {string} options.title - Page title
 * @param {string} options.content - Main content HTML
 * @param {string} options.styles - Additional CSS (optional)
 * @param {string} options.scripts - Additional JavaScript (optional)
 * @returns {string} Complete HTML page
 */
export function layoutHTML({ user, activeRoute = '/', title = 'Operations', content = '', styles = '', scripts = '' }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    ${styles ? `<style>${styles}</style>` : ''}
</head>
<body class="bg-base-200">
    ${navigationHTML(user, activeRoute)}
    
    <!-- Main Content Area -->
    <div class="pt-16 min-h-screen">
      ${content}
    </div>
    
    <script>
      // Initialize Lucide icons
      lucide.createIcons();
      
      // Logout handler
      document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
          // Clear session
          localStorage.removeItem('session_token');
          
          // TODO: Call logout API endpoint
          // await fetch('/api/auth/logout', { method: 'POST' });
          
          // Redirect to login
          window.location.href = '/login';
        } catch (error) {
          console.error('Logout failed:', error);
          alert('Logout failed. Please try again.');
        }
      });
      
      ${scripts}
    </script>
</body>
</html>`;
}
