/**
 * Indeling van de modules voor een gebruiker: departementen en vastgepinde
 * favorieten. Eén bron voor de homepage (src/modules/home/api-module.js) en
 * het Modules-menu in de navbar (via session.js -> user.moduleLayout ->
 * src/lib/components/navbar.js).
 *
 * Beide delen zijn optioneel: faalt een query (bv. de migratie staat nog niet
 * live), dan komt er een lege lijst met `...Ready: false` terug en werkt alles
 * zoals voordien. Dit mag NOOIT een fout gooien: het draait bij elke request.
 *
 * Tabellen: module_departments + modules.department_id
 * (20261016150000_module_departments.sql), user_module_favorites
 * (20261016170000_user_module_favorites.sql).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} moduleIds  - de modules die de gebruiker ziet
 * @returns {Promise<{departments: Array, departmentOf: Object, departmentsReady: boolean,
 *                    favorites: string[], favoritesReady: boolean}>}
 */
export async function getModuleLayout(supabase, userId, moduleIds) {
  const ids = (moduleIds || []).filter(Boolean);
  const layout = {
    departments: [],
    departmentOf: {},
    departmentsReady: true,
    favorites: [],
    favoritesReady: true
  };

  const [deps, mods, favs] = await Promise.all([
    safe(() => supabase.from('module_departments')
      .select('id, name, icon, display_order').order('display_order').order('name')),
    ids.length
      ? safe(() => supabase.from('modules').select('id, department_id').in('id', ids))
      : Promise.resolve({ data: [], error: null }),
    userId
      ? safe(() => supabase.from('user_module_favorites')
        .select('module_id').eq('user_id', userId).order('position').order('created_at'))
      : Promise.resolve({ data: [], error: null })
  ]);

  if (deps.error || mods.error) {
    console.error('[module-layout] departementen laden mislukt:', (deps.error || mods.error).message);
    layout.departmentsReady = false;
  } else {
    layout.departments = deps.data || [];
    for (const m of (mods.data || [])) {
      if (m.department_id) layout.departmentOf[m.id] = m.department_id;
    }
  }

  if (favs.error) {
    console.error('[module-layout] favorieten laden mislukt:', favs.error.message);
    layout.favoritesReady = false;
  } else {
    const allowed = new Set(ids);
    layout.favorites = (favs.data || []).map(f => f.module_id).filter(id => allowed.has(id));
  }

  return layout;
}

async function safe(fn) {
  try {
    const res = await fn();
    return { data: res.data, error: res.error || null };
  } catch (err) {
    return { data: null, error: err || new Error('onbekende fout') };
  }
}
