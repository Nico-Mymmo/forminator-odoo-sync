/**
 * Home — login + dashboard (LEGACY ui.js)
 *
 * Regels: uitsluitend string-concatenatie (+), geen backticks,
 * geen variabelen in inline event handlers.
 * Alle interactie via addEventListener / data-action of element-listeners.
 */

import { navbar } from '../../lib/components/navbar.js';

// Gedeelde <head>-regels: vroege thema-init (geen flits) + CDN-assets
function pageHead(title) {
  return [
    '<head>',
    '    <meta charset="UTF-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '    <title>' + title + ' - OpenVME Operations Manager</title>',
    '    <script>(function(){',
    "    var t=localStorage.getItem('selectedTheme')||'light';",
    "    document.documentElement.setAttribute('data-theme',t);",
    '    })()</' + 'script>',
    '    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />',
    '    <script src="https://cdn.tailwindcss.com"></' + 'script>',
    '    <script src="https://unpkg.com/lucide@latest"></' + 'script>',
    '</head>'
  ].join('\n');
}

export function loginPageUI() {
  const loginScript = [
    '<script>',
    '(function () {',
    "  var form = document.getElementById('loginForm');",
    "  var emailInput = document.getElementById('emailInput');",
    "  var passwordInput = document.getElementById('passwordInput');",
    "  var loginBtn = document.getElementById('loginBtn');",
    '',
    '  function setLoading(loading) {',
    "    var label = loginBtn.querySelector('[data-role=\"loginBtnLabel\"]');",
    '    loginBtn.disabled = loading;',
    '    if (loading) {',
    "      label.innerHTML = '<span class=\"loading loading-spinner loading-xs\"></span> Bezig\\u2026';",
    '    } else {',
    "      label.textContent = 'Inloggen';",
    '    }',
    '  }',
    '',
    '  function showError(msg) {',
    "    document.getElementById('loginErrorMessage').textContent = msg;",
    "    document.getElementById('loginError').classList.remove('hidden');",
    '  }',
    '',
    '  function hideError() {',
    "    document.getElementById('loginError').classList.add('hidden');",
    '  }',
    '',
    "  form.addEventListener('submit', async function (e) {",
    '    e.preventDefault();',
    '    if (loginBtn.disabled) return;',
    '',
    '    var email = emailInput.value.trim();',
    '    var password = passwordInput.value;',
    '',
    '    // Client-side validatie vóór de fetch',
    "    emailInput.classList.toggle('input-error', !email);",
    "    passwordInput.classList.toggle('input-error', !password);",
    '    if (!email || !password) {',
    "      showError('Vul je e-mailadres en wachtwoord in');",
    '      return;',
    '    }',
    '',
    '    hideError();',
    '    setLoading(true);',
    '',
    '    try {',
    "      var response = await fetch('/api/auth/login', {",
    "        method: 'POST',",
    "        headers: { 'Content-Type': 'application/json' },",
    "        credentials: 'include',",
    '        body: JSON.stringify({ email: email, password: password })',
    '      });',
    '',
    '      var result = null;',
    '      try { result = await response.json(); } catch (parseErr) { result = null; }',
    '',
    '      if (response.ok && result && result.success) {',
    "        if (result.token) localStorage.setItem('adminToken', result.token);",
    "        window.location.href = '/';",
    '        return;',
    '      }',
    '',
    '      setLoading(false);',
    '      if (response.status === 401) {',
    '        // Foute gegevens: wachtwoord leegmaken, veld markeren, focus terug',
    "        showError('Inloggen mislukt. Controleer je gegevens.');",
    "        passwordInput.value = '';",
    "        passwordInput.classList.add('input-error');",
    '        passwordInput.focus();',
    '      } else {',
    '        // Server-/andere fout: velden blijven staan',
    "        showError('Verbindingsfout. Probeer het opnieuw.');",
    '      }',
    '    } catch (err) {',
    '      // Netwerkfout: velden blijven staan',
    '      setLoading(false);',
    "      showError('Verbindingsfout. Probeer het opnieuw.');",
    '    }',
    '  });',
    '',
    '  lucide.createIcons();',
    '})();',
    '</' + 'script>'
  ].join('\n');

  return '<!DOCTYPE html>\n'
    + '<html lang="nl">\n'
    + pageHead('Inloggen') + '\n'
    + '<body class="bg-base-200">\n'
    + '    <div class="flex items-center justify-center min-h-screen px-4">\n'
    + '      <div class="card bg-base-100 border border-base-200 shadow-sm w-96">\n'
    + '        <div class="card-body">\n'
    + '          <div class="flex flex-col items-center gap-2 mb-4">\n'
    + '            <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">\n'
    + '              <i data-lucide="home" class="w-6 h-6 text-primary"></i>\n'
    + '            </div>\n'
    + '            <h1 class="text-2xl font-bold">Inloggen</h1>\n'
    + '            <p class="text-sm text-base-content/60">OpenVME Operations Manager</p>\n'
    + '          </div>\n'
    + '\n'
    + '          <form id="loginForm" action="#" novalidate>\n'
    + '            <label class="form-control w-full mb-2">\n'
    + '              <div class="label"><span class="label-text">E-mailadres</span></div>\n'
    + '              <input type="email" id="emailInput" placeholder="naam@mymmo.com"\n'
    + '                     class="input input-bordered input-sm w-full" autocomplete="username" required>\n'
    + '            </label>\n'
    + '\n'
    + '            <label class="form-control w-full mb-3">\n'
    + '              <div class="label"><span class="label-text">Wachtwoord</span></div>\n'
    + '              <input type="password" id="passwordInput" placeholder="••••••••"\n'
    + '                     class="input input-bordered input-sm w-full" autocomplete="current-password" required>\n'
    + '            </label>\n'
    + '\n'
    + '            <!-- Foutmelding: vaste plek boven de knop -->\n'
    + '            <div id="loginError" class="alert alert-error text-sm py-2 px-3 mb-3 hidden" role="alert">\n'
    + '              <i data-lucide="alert-circle" class="w-4 h-4 shrink-0"></i>\n'
    + '              <span id="loginErrorMessage"></span>\n'
    + '            </div>\n'
    + '\n'
    + '            <button type="submit" id="loginBtn" class="btn btn-primary btn-sm w-full">\n'
    + '              <i data-lucide="log-in" class="w-4 h-4"></i>\n'
    + '              <span data-role="loginBtnLabel">Inloggen</span>\n'
    + '            </button>\n'
    + '          </form>\n'
    + '\n'
    + '          <p class="text-xs text-base-content/50 text-center mt-3">\n'
    + '            Geen account of wachtwoord vergeten? Vraag je beheerder.\n'
    + '          </p>\n'
    + '        </div>\n'
    + '      </div>\n'
    + '    </div>\n'
    + '\n'
    + loginScript + '\n'
    + '</body>\n'
    + '</html>';
}

// Alias voor consistente naamgeving met andere modules
export const homeLoginUI = loginPageUI;

export function homeDashboardUI(user) {
  // Modules van de gebruiker: module-objecten uit de user_modules-array halen.
  // Verwijderde en utility-modules (navbar-knoppen) horen niet in het grid.
  const REMOVED_MODULES = ['forminator_sync'];
  const UTILITY_MODULES = ['asset_manager', 'admin', 'claude_integration'];
  const userModules = user.modules || [];
  const allModules = userModules
    .map(function (um) { return um.module || um; })
    .filter(function (m) { return m && !REMOVED_MODULES.includes(m.code) && !UTILITY_MODULES.includes(m.code); });

  // Lucide-iconen per module-code
  const iconMap = {
    'home':                    'home',
    'admin':                   'settings',
    'profile':                 'user',
    'forminator_sync_v2':      'arrow-left-right',
    'project_generator':       'folder-plus',
    'sales_insight_explorer':  'bar-chart-2',
    'event_operations':        'calendar',
    'mail_signature_designer': 'pen-tool',
    'asset_manager':           'hard-drive',
    'cx_powerboard':           'layout-dashboard',
    'wp_form_schemas':         'file-code',
    'claude_integration':      'bot'
  };

  const welcomeName = user.full_name || user.username || user.email || '';

  const moduleCards = allModules.map(function (module) {
    const icon = iconMap[module.code] || iconMap[module.icon] || 'box';
    return '<a href="' + module.route + '" class="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all cursor-pointer group">'
      + '<div class="card-body items-center text-center gap-3 py-8">'
      + '<div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">'
      + '<i data-lucide="' + icon + '" class="w-7 h-7 text-primary"></i>'
      + '</div>'
      + '<h2 class="card-title text-base font-semibold">' + module.name + '</h2>'
      + '<p class="text-sm text-base-content/60 leading-relaxed">' + (module.description || '') + '</p>'
      + '</div>'
      + '</a>';
  }).join('');

  // Lege staat: gecentreerd icoon + instructieve tekst
  const emptyState = '<div class="flex flex-col items-center justify-center py-20 text-center">'
    + '<i data-lucide="layout-dashboard" class="w-12 h-12 text-base-content/40 mb-4"></i>'
    + '<p class="text-base-content/40">Je hebt nog geen modules. Vraag je beheerder om toegang.</p>'
    + '</div>';

  const gridSection = allModules.length > 0
    ? '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">' + moduleCards + '</div>'
    : emptyState;

  return '<!DOCTYPE html>\n'
    + '<html lang="nl">\n'
    + pageHead('Home') + '\n'
    + '<body class="bg-base-200">\n'
    + navbar(user) + '\n'
    + '\n'
    + '    <div style="padding-top: 48px;">\n'
    + '      <div class="container mx-auto px-6 py-8 max-w-7xl">\n'
    + '        <!-- Kop -->\n'
    + '        <div class="mb-8">\n'
    + '          <h1 class="text-2xl font-bold">Welkom, ' + welcomeName + '</h1>\n'
    + '          <p class="text-sm text-base-content/60 mt-1">Kies een module om te beginnen</p>\n'
    + '        </div>\n'
    + '\n'
    + '        <!-- Module-grid of lege staat -->\n'
    + '        ' + gridSection + '\n'
    + '      </div>\n'
    + '    </div>\n'
    + '\n'
    + '    <script>\n'
    + '      lucide.createIcons();\n'
    + '    </' + 'script>\n'
    + '</body>\n'
    + '</html>';
}
