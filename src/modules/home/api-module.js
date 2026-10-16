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
 *
 * Favorieten: elke gebruiker pint zelf modules bovenaan vast
 * (user_module_favorites, 20261016170000_user_module_favorites.sql). Ook die
 * tabel is optioneel: ontbreekt ze, dan verdwijnt enkel de ster.
 */

import { getSupabaseClient } from '../../lib/database.js';
import { getModuleByCode } from '../registry.js';
import { getModuleLayout } from '../../lib/module-layout.js';

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

  // Al geladen door validateSession (session.js), samen met de navbar.
  const layout = user.moduleLayout
    || await getModuleLayout(getSupabaseClient(env), user.id, modules.map(m => m.id));
  const visible = new Set(modules.map(m => m.id));
  const { departments, departmentsReady, favoritesReady } = layout;
  const favorites = layout.favorites.filter(id => visible.has(id));

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
      department_id: layout.departmentOf[m.id] || null
    };
  });

  return json({
    success: true,
    isAdmin: user.role === 'admin',
    departmentsReady,
    departments,
    favoritesReady,
    favorites,
    modules: result
  });
}

/** De modules die deze gebruiker op zijn homepage ziet (enkel die mag hij vastpinnen). */
function visibleModuleIds(user) {
  return new Set((user.modules || [])
    .map(um => um.module || um)
    .filter(m => m && m.id && !REMOVED_MODULES.includes(m.code) && !UTILITY_MODULES.includes(m.code))
    .map(m => m.id));
}

/** PUT /home/api/favorites/:moduleId — vastpinnen, achteraan de favorieten. */
async function addFavorite({ env, user, params }) {
  const moduleId = params.moduleId;
  if (!visibleModuleIds(user).has(moduleId)) return json({ success: false, error: 'Module niet gevonden.' }, 404);
  const supabase = getSupabaseClient(env);
  const { data: last, error: lastError } = await supabase
    .from('user_module_favorites').select('position')
    .eq('user_id', user.id).order('position', { ascending: false }).limit(1);
  if (lastError) return json({ success: false, error: lastError.message }, 500);
  const position = ((last && last[0] && last[0].position) || 0) + 10;
  const { error } = await supabase
    .from('user_module_favorites')
    .upsert({ user_id: user.id, module_id: moduleId, position }, { onConflict: 'user_id,module_id', ignoreDuplicates: true });
  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true });
}

/** DELETE /home/api/favorites/:moduleId — losmaken. */
async function removeFavorite({ env, user, params }) {
  const { error } = await getSupabaseClient(env)
    .from('user_module_favorites').delete()
    .eq('user_id', user.id).eq('module_id', params.moduleId);
  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true });
}

/** PUT /home/api/favorites/order  { ids: [...] } — volgorde van de vastgepinde modules. */
async function reorderFavorites({ env, user, request }) {
  let body = null;
  try { body = await request.json(); } catch (_e) { body = null; }
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : null;
  if (!ids || !ids.length) return json({ success: false, error: 'ids (array) is verplicht' }, 400);
  const supabase = getSupabaseClient(env);
  const results = await Promise.all(ids.map((id, i) =>
    supabase.from('user_module_favorites').update({ position: (i + 1) * 10 })
      .eq('user_id', user.id).eq('module_id', id)
  ));
  const fout = results.find(r => r.error);
  if (fout) return json({ success: false, error: fout.error.message }, 500);
  return json({ success: true });
}

export default {
  code: 'home_api',
  name: 'Home API',
  route: '/home',
  requiresAuth: true,
  openToAllUsers: true,
  isActive: true,
  routes: {
    'GET /api/overview': overview,
    'PUT /api/favorites/order': reorderFavorites,
    'PUT /api/favorites/:moduleId': addFavorite,
    'DELETE /api/favorites/:moduleId': removeFavorite
  }
};
