/**
 * Mini-Apps — favorieten: gedeelde merge/sorteer-logica (persoonlijk + globaal)
 *
 * Gebruikt door zowel session.js (navbar-blokjes bovenaan, bij elke request
 * via validateSession) als routes.js (Favorieten-sectie + herordenen in de
 * Mini-apps-pagina zelf) -- één plek voor de merge/sorteerlogica i.p.v. twee
 * keer dezelfde query/sortering te moeten onderhouden.
 *
 * Model (zie ook supabase/migrations/20260713110000_mini_app_global_favorites_and_ordering.sql):
 * een globaal favoriet-gemaakte app (mini_apps.is_global_favorite) is voor
 * IEDEREEN favoriet, ook zonder eigen rij in mini_app_favorites -- pas zodra
 * een gebruiker de volgorde zelf aanpast (of hem expliciet favoriet/
 * un-favoriet), krijgt hij een eigen rij met een position. Tot dan hangt hij
 * "los" achteraan de balk. Zet een admin een app terug niet meer globaal
 * favoriet, dan blijft een reeds gematerialiseerde persoonlijke rij gewoon
 * bestaan (wordt een gewone eigen favoriet) -- geen aparte opruiming.
 */

/**
 * Haalt de favorietenbalk van één gebruiker op, samengevoegd (persoonlijk +
 * globaal) en gesorteerd (position ascending, NULL/ongezet achteraan, met
 * created_at als tiebreak voor stabiele volgorde bij nog-niet-geordende
 * items).
 *
 * @param {Object} supabase
 * @param {string} userId
 * @returns {Promise<Array<{id:string, title:string, icon:string, position:number|null}>>}
 */
export async function getOrderedFavorites(supabase, userId) {
  const [{ data: favoriteRows }, { data: globalApps }] = await Promise.all([
    supabase
      .from('mini_app_favorites')
      .select('position, created_at, mini_apps(id, title, icon, owner_user_id, visibility, shared_user_ids, is_global_favorite)')
      .eq('user_id', userId),
    supabase
      .from('mini_apps')
      .select('id, title, icon')
      .eq('is_global_favorite', true)
  ]);

  // Zelfde zichtbaarheidsregels als canView() (permissions.js), hier lokaal
  // herhaald i.p.v. geïmporteerd: dit filtert op de geneste mini_apps-rij uit
  // de join hierboven, geen losse canView(app,user)-aanroep per rij nodig.
  const personal = (favoriteRows || [])
    .map(row => ({ app: row.mini_apps, position: row.position, createdAt: row.created_at }))
    .filter(r => r.app && (
      r.app.owner_user_id === userId ||
      r.app.visibility === 'shared' ||
      r.app.is_global_favorite ||
      (r.app.visibility === 'specific' && (r.app.shared_user_ids || []).includes(userId))
    ));

  const personalIds = new Set(personal.map(r => r.app.id));
  const globalOnly = (globalApps || [])
    .filter(app => !personalIds.has(app.id))
    .map(app => ({ app, position: null, createdAt: null }));

  const combined = [...personal, ...globalOnly];
  combined.sort((a, b) => {
    const posA = (a.position === null || a.position === undefined) ? Infinity : a.position;
    const posB = (b.position === null || b.position === undefined) ? Infinity : b.position;
    if (posA !== posB) return posA - posB;
    const caA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
    const caB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
    return caA - caB;
  });

  return combined.map(r => ({ id: r.app.id, title: r.app.title, icon: r.app.icon, position: r.position }));
}

/**
 * Slaat een nieuwe, expliciete volgorde op voor deze gebruiker -- upsert per
 * app-id (materialiseert meteen een persoonlijke mini_app_favorites-rij voor
 * een tot dan toe enkel globaal favoriete app, zie doc bovenaan).
 *
 * @param {Object} supabase
 * @param {string} userId
 * @param {string[]} orderedAppIds
 * @returns {Promise<{error: Object|null}>}
 */
export async function saveFavoritesOrder(supabase, userId, orderedAppIds) {
  if (!Array.isArray(orderedAppIds) || orderedAppIds.length === 0) {
    return { error: null };
  }
  const rows = orderedAppIds.map((appId, index) => ({
    user_id: userId,
    mini_app_id: appId,
    position: index
  }));
  const { error } = await supabase
    .from('mini_app_favorites')
    .upsert(rows, { onConflict: 'user_id,mini_app_id' });
  return { error };
}
