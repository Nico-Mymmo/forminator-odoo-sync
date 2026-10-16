/**
 * Home API — gegevens voor de homepage (public/home.html).
 *
 * De homepage zelf hangt op '/', en een module op '/' matcht enkel dat ene pad
 * (zie getModuleByRoute), dus de API staat in een eigen module op '/home'.
 * `openToAllUsers`: elke ingelogde gebruiker mag hier, zonder rij in
 * user_modules (zie auth-gate.js), net zoals home en profile.
 *
 * Wat de homepage toont, komt uit de sessie (user.modules, dezelfde bron als de
 * navbar). Hier komt enkel het departement en het icoon bij. Lukt dat niet
 * (bv. de migratie 20261016150000_module_departments.sql staat nog niet live),
 * dan krijgt de pagina gewoon alle modules zonder groepering.
 */

import { getSupabaseClient } from '../../lib/database.js';
import { getModuleByCode } from '../registry.js';

// Verwijderde modules en modules met een eigen knop in de navbar horen niet
// tussen de tegels.
const REMOVED_MODULES = ['forminator_sync'];
const UTILITY_MODULES = ['asset_manager', 'admin', 'claude_integration'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function overview({ env, user }) {
  const modules = (user.modules || [])
    .map(um => um.module || um)
    .filter(m => m && !REMOVED_MODULES.includes(m.code) && !UTILITY_MODULES.includes(m.code));

  let departments = [];
  let extra = new Map();
  let departmentsReady = true;

  try {
    const supabase = getSupabaseClient(env);
    const ids = modules.map(m => m.id).filter(Boolean);
    const [deps, mods] = await Promise.all([
      supabase.from('module_departments').select('id, name, icon, display_order').order('display_order').order('name'),
      ids.length
        ? supabase.from('modules').select('id, department_id').in('id', ids)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (deps.error) throw deps.error;
    if (mods.error) throw mods.error;
    departments = deps.data || [];
    extra = new Map((mods.data || []).map(m => [m.id, m]));
  } catch (err) {
    console.error('[home] departementen laden mislukt:', err && err.message);
    departments = [];
    departmentsReady = false;
  }

  const result = modules.map(m => {
    const reg = getModuleByCode(m.code);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      description: m.description || '',
      route: m.route,
      icon: m.icon || (reg && reg.icon) || 'box',
      display_order: m.display_order || 0,
      department_id: (extra.get(m.id) || {}).department_id || null
    };
  });

  return json({
    success: true,
    isAdmin: user.role === 'admin',
    departmentsReady,
    departments,
    modules: result
  });
}

export default {
  code: 'home_api',
  name: 'Home API',
  route: '/home',
  requiresAuth: true,
  openToAllUsers: true,
  isActive: true,
  routes: {
    'GET /api/overview': overview
  }
};
