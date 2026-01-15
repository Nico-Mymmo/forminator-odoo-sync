export function navbar(user) {
  // Extract module objects from user_modules array
  const userModules = user?.modules || [];
  const modules = userModules.map(um => um.module || um);
  
  const modulesMenu = modules.length > 0 ? `
    <div class="dropdown dropdown-hover">
      <div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="7" height="7" x="3" y="3" rx="1"/>
          <rect width="7" height="7" x="14" y="3" rx="1"/>
          <rect width="7" height="7" x="14" y="14" rx="1"/>
          <rect width="7" height="7" x="3" y="14" rx="1"/>
        </svg>
        Modules
      </div>
      <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
        ${modules.map(m => `<li><a href="${m.route}">${m.name}</a></li>`).join('')}
      </ul>
    </div>
  ` : '';
  
  return `
<header class="flex items-center justify-between bg-base-100 shadow-sm px-4" style="position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;">
    <div class="flex items-center gap-4">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span class="text-base font-semibold">OpenVME Operations Manager</span>
      </a>
      ${modulesMenu}
    </div>
    <div id="saveIndicator" class="flex items-center gap-1 text-sm"></div>
    <div class="flex gap-2 items-center">
        <select id="themeSelector" class="select select-xs select-bordered" onchange="changeTheme(this.value)">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="cupcake">Cupcake</option>
            <option value="bumblebee">Bumblebee</option>
            <option value="emerald">Emerald</option>
            <option value="corporate">Corporate</option>
            <option value="synthwave">Synthwave</option>
            <option value="retro">Retro</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="valentine">Valentine</option>
            <option value="halloween">Halloween</option>
            <option value="garden">Garden</option>
            <option value="forest">Forest</option>
            <option value="aqua">Aqua</option>
            <option value="lofi">Lofi</option>
            <option value="pastel">Pastel</option>
            <option value="fantasy">Fantasy</option>
            <option value="wireframe">Wireframe</option>
            <option value="black">Black</option>
            <option value="luxury">Luxury</option>
            <option value="dracula">Dracula</option>
            <option value="cmyk">CMYK</option>
            <option value="autumn">Autumn</option>
            <option value="business">Business</option>
            <option value="acid">Acid</option>
            <option value="lemonade">Lemonade</option>
            <option value="night">Night</option>
            <option value="coffee">Coffee</option>
            <option value="winter">Winter</option>
        </select>
        <a href="/profile" class="btn btn-ghost btn-xs" title="Profile">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        </a>
        <button onclick="syncProdData()" class="btn btn-info btn-xs" title="Sync production data to dev">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Prod
        </button>
        <button onclick="logout()" class="btn btn-error btn-xs">Logout</button>
    </div>
</header>
`;
}
