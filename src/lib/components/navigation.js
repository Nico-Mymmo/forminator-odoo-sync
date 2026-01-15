/**
 * Navigation Component
 * 
 * Top navbar with module tabs and user menu
 */

/**
 * Generate navigation HTML
 * @param {Object} user - Current user with modules array
 * @param {string} activeRoute - Currently active route
 * @returns {string} Navigation HTML
 */
export function navigationHTML(user, activeRoute = '/') {
  const userModules = user?.modules || [];
  
  // Add admin module for admins
  const allModules = [...userModules];
  if (user?.role === 'admin') {
    allModules.push({
      code: 'admin',
      name: 'Admin',
      route: '/admin',
      icon: 'settings'
    });
  }
  
  const userInitials = user?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U';
  
  return `
    <div class="navbar bg-base-100 border-b border-base-300 fixed top-0 z-50">
      <!-- Left: Logo + Module Tabs -->
      <div class="navbar-start gap-2">
        <div class="text-xl font-bold px-4">Operations</div>
        
        <!-- Module Navigation -->
        <div role="tablist" class="tabs tabs-boxed">
          ${allModules.map(module => `
            <a role="tab" 
               class="tab gap-2 ${activeRoute.startsWith(module.route) ? 'tab-active' : ''}" 
               href="${module.route}">
              <i data-lucide="${module.icon}" class="w-4 h-4"></i>
              ${module.name}
            </a>
          `).join('')}
        </div>
      </div>
      
      <!-- Right: User Menu -->
      <div class="navbar-end">
        <div class="dropdown dropdown-end">
          <label tabindex="0" class="btn btn-ghost btn-circle avatar">
            <div class="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center font-semibold">
              ${userInitials}
            </div>
          </label>
          <ul tabindex="0" class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-52 mt-3 border border-base-300">
            <li class="menu-title px-4 py-2">
              <div class="flex flex-col gap-1">
                <span class="font-semibold">${user?.full_name || 'User'}</span>
                <span class="text-xs text-base-content/60">${user?.email || ''}</span>
                <span class="badge badge-sm badge-outline mt-1 w-fit">${user?.role || 'user'}</span>
              </div>
            </li>
            <div class="divider my-1"></div>
            <li><a href="/profile">
              <i data-lucide="user" class="w-4 h-4"></i>
              Profile
            </a></li>
            ${user?.role === 'admin' ? `
              <li><a href="/admin">
                <i data-lucide="settings" class="w-4 h-4"></i>
                Administration
              </a></li>
            ` : ''}
            <div class="divider my-1"></div>
            <li><a id="logoutBtn" class="text-error">
              <i data-lucide="log-out" class="w-4 h-4"></i>
              Logout
            </a></li>
          </ul>
        </div>
      </div>
    </div>
  `;
}
