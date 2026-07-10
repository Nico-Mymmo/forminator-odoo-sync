/**
 * LEGACY server-rendered navbar — uitsluitend string-concatenatie (+), geen backticks.
 *
 * - Modules-dropdown links (klik via <details>, geen hover)
 * - Avatar-dropdown rechts: naam, e-mail, admin-badge, thema-selector,
 *   profiellink en uitloggen
 * - Mobiel (<768px): hamburger-knop (data-action="toggleMobileMenu"),
 *   het menu klapt uit onder de navbar
 * - Actieve module krijgt aria-current="page" client-side o.b.v. window.location.pathname
 * - Eigen <script> met data-action-listener (geen inline event handlers met variabelen)
 */
export function navbar(user) {
  const REMOVED_MODULES = ['forminator_sync'];
  const UTILITY_MODULES = ['asset_manager', 'admin'];

  const THEMES = [
    'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate',
    'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden',
    'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black',
    'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade',
    'night', 'coffee', 'winter'
  ];

  // Lucide-iconnamen per module-code (gerenderd door lucide.createIcons() op de pagina)
  const MODULE_ICONS = {
    'home': 'home',
    'admin': 'settings',
    'profile': 'user',
    'forminator_sync_v2': 'arrow-left-right',
    'project_generator': 'folder-plus',
    'sales_insight_explorer': 'bar-chart-2',
    'event_operations': 'calendar',
    'mail_signature_designer': 'pen-tool',
    'asset_manager': 'hard-drive',
    'cx_powerboard': 'layout-dashboard',
    'wp_form_schemas': 'file-code',
    'claude_integration': 'bot',
    'mini_apps': 'puzzle'
  };

  // Inline SVG's voor vaste navbar-iconen (onafhankelijk van lucide-init)
  function svg(inner, size) {
    const s = size || 16;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s
      + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + inner + '</svg>';
  }
  const ICONS = {
    home: svg('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', 18),
    grid: svg('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>', 15),
    chevron: svg('<path d="m6 9 6 6 6-6"/>', 13),
    menu: svg('<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>', 20),
    user: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    palette: svg('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'),
    settings: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', 14),
    monitor: svg('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>', 14)
  };

  // Iconnaam voor de favorieten-blokjes -- vrije DB-tekst (door de eigenaar
  // gekozen in de mini-apps-instellingen), dus defensief valideren voor die
  // in een data-lucide-attribuut belandt. Onbekend/leeg -> 'puzzle'.
  function safeIconName(name) {
    return /^[a-z0-9-]+$/.test(String(name || '')) ? name : 'puzzle';
  }

  // HTML-escape voor user-gecontroleerde strings (bv. mini-app-titels) die we
  // hier via string-concatenatie in de navbar-HTML plakken.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- Modules uit user.modules ----------
  const userModules = (user && user.modules) || [];
  const allModules = userModules
    .map(function (um) { return um.module || um; })
    .filter(function (m) { return m && !REMOVED_MODULES.includes(m.code); });

  // Grid-modules = alles behalve utility-modules (die staan rechts als knoppen)
  const gridModules = allModules.filter(function (m) { return !UTILITY_MODULES.includes(m.code); });
  const utilityModules = allModules.filter(function (m) { return UTILITY_MODULES.includes(m.code); });
  if (user && user.role === 'admin' && !utilityModules.find(function (m) { return m.code === 'admin'; })) {
    utilityModules.push({ code: 'admin', name: 'Beheer', route: '/admin' });
  }

  function utilityLabel(m) {
    return m.code === 'admin' ? 'Beheer' : m.name;
  }

  // ---------- Identiteit ----------
  const displayName = (user && (user.full_name || user.username || user.email)) || '';
  const userEmail = (user && user.email) || '';
  const isAdmin = !!(user && user.role === 'admin');

  function initialsOf(name) {
    const parts = String(name).replace('@', ' ').trim().split(/[\s.]+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase();
  }
  const initials = initialsOf(displayName || (user && user.email) || '?');

  // ---------- Bouwstenen ----------
  function moduleItem(m) {
    const icon = MODULE_ICONS[m.code] || 'box';
    return '<li><a href="' + m.route + '" data-role="moduleLink">'
      + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>'
      + m.name
      + '</a></li>';
  }

  const moduleItems = gridModules.map(moduleItem).join('');

  // Modules-dropdown (desktop, klik via <details> — geen hover)
  const modulesMenu = gridModules.length > 0
    ? '<details class="dropdown hidden md:block" data-role="navDropdown">'
      + '<summary class="btn btn-sm btn-ghost gap-2 font-normal">'
      + ICONS.grid + 'Modules' + '<span class="opacity-60">' + ICONS.chevron + '</span>'
      + '</summary>'
      + '<ul class="dropdown-content z-[60] menu p-2 shadow-lg bg-base-100 rounded-box w-64 border border-base-200">'
      + moduleItems
      + '</ul>'
      + '</details>'
    : '';

  // Hamburger-knop (mobiel) — het menu klapt uit onder de navbar
  const mobileUtilityItems = utilityModules.map(function (m) {
    const icon = m.code === 'admin' ? ICONS.settings : ICONS.monitor;
    return '<li><a href="' + m.route + '" data-role="moduleLink">' + icon + utilityLabel(m) + '</a></li>';
  }).join('');

  const hasMobileItems = gridModules.length > 0 || utilityModules.length > 0;

  const mobileToggle = hasMobileItems
    ? '<button type="button" class="btn btn-ghost btn-sm btn-square md:hidden" data-action="toggleMobileMenu" aria-label="Menu" aria-expanded="false">'
      + ICONS.menu
      + '</button>'
    : '';

  const mobileMenu = hasMobileItems
    ? '<nav data-role="mobileMenu" class="hidden md:hidden bg-base-100 border-b border-base-200 shadow-lg" style="position: fixed; top: 48px; left: 0; right: 0; z-index: 49;">'
      + '<ul class="menu p-2">'
      + (gridModules.length > 0 ? '<li class="menu-title text-xs">Modules</li>' + moduleItems : '')
      + (mobileUtilityItems ? '<div class="divider my-1"></div>' + mobileUtilityItems : '')
      + '</ul>'
      + '</nav>'
    : '';

  // Utility-knoppen rechts (alleen desktop)
  const utilityButtons = utilityModules.map(function (m) {
    const icon = m.code === 'admin' ? ICONS.settings : ICONS.monitor;
    return '<a href="' + m.route + '" class="btn btn-xs btn-ghost gap-1.5 font-normal text-base-content/70 hover:text-base-content">'
      + icon + utilityLabel(m) + '</a>';
  }).join('');

  // Favoriete mini-apps rechtsboven -- blokjes vlak naast de andere rechtse
  // knoppen, links uitgelijnd binnen die rechtse sectie (dus naast het
  // midden, niet tegen de avatar aan). Data komt van user.favoriteMiniApps
  // (session.js voegt dit toe tijdens validateSession, o.b.v. de tabel
  // mini_app_favorites) -- navbar.js blijft zelf de enige plek die deze data
  // omzet naar HTML.
  // navbarFavorites-container en -divider staan ALTIJD in de HTML (ook leeg,
  // 0 favorieten -> gewoon geen kinderen, geen zichtbare ruimte-inname) --
  // zo kan mini-apps.js de "Terug"-link altijd als eerste (meest linkse)
  // kind in navbarFavorites zetten zonder de rest van de navbar (utility-
  // knoppen, avatar) van positie te laten verspringen.
  const favoriteApps = (user && Array.isArray(user.favoriteMiniApps)) ? user.favoriteMiniApps : [];
  const favoritesMenu = '<div id="navbarFavorites" class="hidden md:flex items-center gap-1">'
    + favoriteApps.map(function (a) {
        return '<a href="/mini-apps?app=' + encodeURIComponent(a.id) + '" class="btn btn-xs btn-ghost border border-base-300 gap-1.5 font-normal text-base-content/70 hover:text-base-content hover:border-primary/40 max-w-[9rem]" title="' + escapeHtml(a.title) + '">'
          + '<i data-lucide="' + safeIconName(a.icon) + '" class="w-3 h-3"></i>'
          + '<span class="truncate">' + escapeHtml(a.title) + '</span>'
          + '</a>';
      }).join('')
    + '</div>'
    + '<div id="navbarFavoritesDivider" class="w-px h-4 bg-base-300 mx-1' + (favoriteApps.length > 0 ? '' : ' hidden') + '"></div>';

  // Thema-selector (alle 29 daisyUI-thema's) als sub-lijst in het avatar-menu
  const themeItems = THEMES.map(function (t) {
    return '<li><a data-action="setTheme" data-role="themeItem" data-theme="' + t + '" class="capitalize">' + t + '</a></li>';
  }).join('');

  const themeMenu = '<li>'
    + '<details>'
    + '<summary>' + ICONS.palette + 'Thema</summary>'
    + '<ul class="max-h-64 overflow-y-auto">' + themeItems + '</ul>'
    + '</details>'
    + '</li>';

  // Avatar-dropdown rechts: naam, e-mail, admin-badge, Profiel, Thema, Uitloggen
  const adminBadge = isAdmin ? '<span class="badge badge-primary badge-xs ml-2">Admin</span>' : '';
  const avatarMenu = '<details class="dropdown dropdown-end" data-role="navDropdown">'
    + '<summary class="btn btn-ghost btn-sm btn-circle avatar placeholder" aria-label="Account-menu">'
    + '<div class="bg-primary text-primary-content rounded-full w-7"><span class="text-xs">' + initials + '</span></div>'
    + '</summary>'
    + '<ul class="dropdown-content z-[60] menu p-2 shadow-lg bg-base-100 rounded-box w-60 border border-base-200">'
    + '<li class="menu-title px-4 py-2">'
    + '<div class="text-sm font-semibold text-base-content normal-case">' + displayName + adminBadge + '</div>'
    + '<div class="text-xs text-base-content/50 normal-case">' + userEmail + '</div>'
    + '</li>'
    + '<li><a href="/profile">' + ICONS.user + 'Profiel</a></li>'
    + themeMenu
    + '<div class="divider my-1"></div>'
    + '<li><a data-action="logout" class="text-error">' + ICONS.logout + '<span data-role="logoutLabel">Uitloggen</span></a></li>'
    + '</ul>'
    + '</details>';

  // ---------- Navbar-script (één keer geïnitialiseerd, data-action-patroon) ----------
  const script = [
    '<script>',
    '(function () {',
    '  var html = document.documentElement;',
    "  html.setAttribute('lang', 'nl');",
    "  html.setAttribute('data-theme', localStorage.getItem('selectedTheme') || 'light');",
    '  if (window.__omNavbarInit) return;',
    '  window.__omNavbarInit = true;',
    '',
    '  function markActive() {',
    '    var path = window.location.pathname;',
    "    document.querySelectorAll('[data-role=\"moduleLink\"]').forEach(function (a) {",
    "      var route = a.getAttribute('href');",
    "      if (route && route !== '/' && path.indexOf(route) === 0) {",
    "        a.classList.add('active');",
    "        a.setAttribute('aria-current', 'page');",
    '      }',
    '    });',
    "    var cur = localStorage.getItem('selectedTheme') || 'light';",
    "    document.querySelectorAll('[data-role=\"themeItem\"]').forEach(function (a) {",
    "      a.classList.toggle('active', a.getAttribute('data-theme') === cur);",
    '    });',
    '  }',
    '',
    '  function doLogout(el) {',
    "    var label = el.querySelector('[data-role=\"logoutLabel\"]');",
    "    if (label) label.textContent = 'Uitloggen\\u2026';",
    "    el.classList.add('pointer-events-none', 'opacity-60');",
    "    fetch('/api/auth/logout', {",
    "      method: 'POST',",
    "      headers: { 'Content-Type': 'application/json' },",
    "      credentials: 'include'",
    '    }).catch(function () {}).then(function () {',
    "      localStorage.removeItem('adminToken');",
    "      window.location.href = '/';",
    '    });',
    '  }',
    '',
    '  function toggleMobileMenu(btn) {',
    "    var panel = document.querySelector('[data-role=\"mobileMenu\"]');",
    '    if (!panel) return;',
    "    var isHidden = panel.classList.toggle('hidden');",
    "    if (btn) btn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');",
    '  }',
    '',
    "  document.addEventListener('click', function (e) {",
    '    // Open navbar-dropdowns sluiten bij klik erbuiten',
    "    document.querySelectorAll('[data-role=\"navDropdown\"][open]').forEach(function (d) {",
    "      if (!d.contains(e.target)) d.removeAttribute('open');",
    '    });',
    '    // Mobiel menu sluiten bij klik buiten menu en hamburger',
    "    var panel = document.querySelector('[data-role=\"mobileMenu\"]');",
    "    if (panel && !panel.classList.contains('hidden')",
    "        && !panel.contains(e.target) && !e.target.closest('[data-action=\"toggleMobileMenu\"]')) {",
    "      panel.classList.add('hidden');",
    "      var btn = document.querySelector('[data-action=\"toggleMobileMenu\"]');",
    "      if (btn) btn.setAttribute('aria-expanded', 'false');",
    '    }',
    "    var el = e.target.closest('[data-action]');",
    '    if (!el) return;',
    "    var action = el.getAttribute('data-action');",
    "    if (action === 'setTheme') {",
    '      e.preventDefault();',
    "      var theme = el.getAttribute('data-theme');",
    "      document.documentElement.setAttribute('data-theme', theme);",
    "      localStorage.setItem('selectedTheme', theme);",
    "      var sel = document.getElementById('themeSelector');",
    '      if (sel) sel.value = theme;',
    '      markActive();',
    "    } else if (action === 'logout') {",
    '      e.preventDefault();',
    '      doLogout(el);',
    "    } else if (action === 'toggleMobileMenu') {",
    '      e.preventDefault();',
    '      toggleMobileMenu(el);',
    '    }',
    '  });',
    '',
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', markActive);",
    '  } else {',
    '    markActive();',
    '  }',
    '})();',
    '</' + 'script>'
  ].join('\n');

  // ---------- Samenstellen ----------
  return '<header class="flex items-center justify-between bg-base-100 border-b border-base-200 px-4" style="position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;">'
    + '<div class="flex items-center gap-3">'
    + mobileToggle
    + '<a href="/" class="flex items-center gap-2 hover:opacity-75 transition-opacity">'
    + ICONS.home
    + '<span class="text-sm font-semibold tracking-tight">OpenVME Operations Manager</span>'
    + '</a>'
    + (gridModules.length > 0 ? '<div class="w-px h-4 bg-base-300 hidden md:block"></div>' : '')
    + modulesMenu
    + '</div>'
    + '<div id="saveIndicator" class="flex items-center gap-1 text-xs text-base-content/50"></div>'
    + '<div class="flex items-center gap-1">'
    + favoritesMenu
    + (utilityButtons ? '<div class="hidden md:flex items-center gap-1">' + utilityButtons + '<div class="w-px h-4 bg-base-300 mx-1"></div></div>' : '')
    + avatarMenu
    + '</div>'
    + '</header>'
    + mobileMenu
    + script;
}
