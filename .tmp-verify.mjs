import { navbar } from './src/lib/components/navbar.js';
import { loginPageUI, homeLoginUI, homeDashboardUI } from './src/modules/home/ui.js';
const user = { username:'nico', full_name:'Nico Plinke', email:'nico@mymmo.com', role:'admin', modules:[
  { module: { code:'event_operations', name:'Event Operations', route:'/events' } },
  { module: { code:'asset_manager', name:'Asset Manager', route:'/assets' } },
  { module: { code:'forminator_sync', name:'OLD', route:'/old' } }
]};
const n = navbar(user);
const l = loginPageUI();
const d = homeDashboardUI(user);
const dEmpty = homeDashboardUI({ email:'x@y.nl', modules:[] });
const nNoUser = navbar(null);
console.log('navbar string:', typeof n === 'string' && n.length > 0);
console.log('login string:', typeof l === 'string', '| alias ok:', homeLoginUI === loginPageUI);
console.log('dash string:', typeof d === 'string', '| navbar(null) string:', typeof nNoUser === 'string');
console.log('Beheer aanwezig:', n.includes('Beheer'), '| geen Administration:', !n.includes('Administration'));
console.log('removed module gefilterd:', !n.includes('/old'));
console.log('aantal themas:', (n.match(/data-action=.setTheme./g)||[]).length);
console.log('welkom-naam (full_name eerst):', d.includes('Welkom, Nico Plinke'));
console.log('email-prefix + lege staat:', dEmpty.includes('Welkom, x') && dEmpty.includes('Je hebt nog geen modules') && dEmpty.includes('layout-grid'));
console.log('geen dropdown-hover:', !n.includes('dropdown-hover'), '| geen select in balk:', !n.includes('<select'));
console.log('lang nl login/dash:', l.includes('lang="nl"'), d.includes('lang="nl"'));
console.log('login: form + geen inline handlers:', l.includes('id="loginForm"') && !/on(click|submit|keypress)=/.test(l));
console.log('navbar: geen inline handlers:', !/on(click|submit|keypress|change)=/.test(n));
console.log('logout niet rood:', !n.includes('text-error'));
console.log('hamburger aanwezig:', n.includes('md:hidden'), '| modules-dropdown desktop:', n.includes('hidden md:block'));
console.log('avatar toont naam+mail+badge:', n.includes('nico@mymmo.com') && n.includes('badge-primary'));
