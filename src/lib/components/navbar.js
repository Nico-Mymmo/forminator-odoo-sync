export function navbar(user) {
  // Extract module objects from user_modules array
  const REMOVED_MODULES = ['forminator_sync'];
  const UTILITY_MODULES = ['asset_manager', 'admin'];
  const userModules = user?.modules || [];
  const allModules = userModules
    .map(function(um) { return um.module || um; })
    .filter(function(m) { return !REMOVED_MODULES.includes(m.code); });

  // Grid modules (shown in Modules dropdown)
  const gridModules = allModules.filter(function(m) { return !UTILITY_MODULES.includes(m.code); });

  // Utility modules shown as navbar buttons
  const utilityModules = allModules.filter(function(m) { return UTILITY_MODULES.includes(m.code); });
  // Always show Administration for admins even if not in user_modules
  if (user && user.role === 'admin' && !utilityModules.find(function(m) { return m.code === 'admin'; })) {
    utilityModules.push({ code: 'admin', name: 'Administration', route: '/admin' });
  }

  const modulesMenu = gridModules.length > 0
    ? '<div class="dropdown dropdown-hover">'
      + '<div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2 font-normal">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>'
      + 'Modules'
      + '</div>'
      + '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-200">'
      + gridModules.map(function(m) { return '<li><a href="' + m.route + '">' + m.name + '</a></li>'; }).join('')
      + '</ul>'
      + '</div>'
    : '';

  // Icon map for utility buttons
  const utilityIconMap = {
    'asset_manager': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
    'admin':         '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  const utilityButtons = utilityModules.map(function(m) {
    const icon = utilityIconMap[m.code] || '';
    return '<a href="' + m.route + '" class="btn btn-xs btn-ghost gap-1.5 font-normal text-base-content/70 hover:text-base-content">'
      + icon
      + m.name
      + '</a>';
  }).join('');

  return '<header class="flex items-center justify-between bg-base-100 border-b border-base-200 px-4" style="position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;">'
    + '<div class="flex items-center gap-3">'
    + '<a href="/" class="flex items-center gap-2 hover:opacity-75 transition-opacity">'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    + '<span class="text-sm font-semibold tracking-tight">OpenVME Operations Manager</span>'
    + '</a>'
    + (gridModules.length > 0 ? '<div class="w-px h-4 bg-base-300"></div>' : '')
    + modulesMenu
    + '</div>'
    + '<div id="saveIndicator" class="flex items-center gap-1 text-xs text-base-content/50"></div>'
    + '<div class="flex items-center gap-1">'
    + utilityButtons
    + (utilityButtons ? '<div class="w-px h-4 bg-base-300 mx-1"></div>' : '')
    + '<select id="themeSelector" class="select select-xs select-ghost border-0 text-xs text-base-content/60 hover:text-base-content focus:outline-none bg-transparent w-24" onchange="changeTheme(this.value)">'
    + '<option value="light">Light</option>'
    + '<option value="dark">Dark</option>'
    + '<option value="cupcake">Cupcake</option>'
    + '<option value="bumblebee">Bumblebee</option>'
    + '<option value="emerald">Emerald</option>'
    + '<option value="corporate">Corporate</option>'
    + '<option value="synthwave">Synthwave</option>'
    + '<option value="retro">Retro</option>'
    + '<option value="cyberpunk">Cyberpunk</option>'
    + '<option value="valentine">Valentine</option>'
    + '<option value="halloween">Halloween</option>'
    + '<option value="garden">Garden</option>'
    + '<option value="forest">Forest</option>'
    + '<option value="aqua">Aqua</option>'
    + '<option value="lofi">Lofi</option>'
    + '<option value="pastel">Pastel</option>'
    + '<option value="fantasy">Fantasy</option>'
    + '<option value="wireframe">Wireframe</option>'
    + '<option value="black">Black</option>'
    + '<option value="luxury">Luxury</option>'
    + '<option value="dracula">Dracula</option>'
    + '<option value="cmyk">CMYK</option>'
    + '<option value="autumn">Autumn</option>'
    + '<option value="business">Business</option>'
    + '<option value="acid">Acid</option>'
    + '<option value="lemonade">Lemonade</option>'
    + '<option value="night">Night</option>'
    + '<option value="coffee">Coffee</option>'
    + '<option value="winter">Winter</option>'
    + '</select>'
    + '<a href="/profile" class="btn btn-ghost btn-xs btn-circle" title="Profile">'
    + '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>'
    + '</a>'
    + '<button onclick="logout()" class="btn btn-ghost btn-xs text-error hover:bg-error/10">Logout</button>'
    + '</div>'
    + '</header>';
}
