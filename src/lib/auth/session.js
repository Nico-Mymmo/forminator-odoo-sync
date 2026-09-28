/**
 * Session Management
 * 
 * Handles session creation, validation, and lifecycle
 */

import { getSupabaseClient } from '../database.js';
import { getOrderedFavorites } from '../../modules/mini-apps/lib/favorites.js';

/**
 * Hoe lang een sessie geldig is: 30 dagen, GLIJDEND.
 *
 * Iedereen die inlogt is een interne gebruiker, en de OM wordt vanuit Odoo
 * aangeklikt (een offerte in de chatter, een link in een notitie). Met 24 uur
 * vast stond je bij zo'n klik bijna altijd op het loginscherm. Glijdend: wie
 * de OM gebruikt, blijft ingelogd; pas na 30 dagen niets moet je opnieuw.
 * Uitloggen en een gedeactiveerd account (is_active) blijven meteen werken.
 */
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Pas verlengen als er minder dan zoveel over is. Zo kost een gewone dag
 * werken hoogstens één schrijfactie op `sessions`, niet een per verzoek.
 */
const VERLENG_ALS_MINDER_DAN_MS = (SESSION_DAYS - 1) * 24 * 60 * 60 * 1000;

/**
 * Create a new session for a user
 * 
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @param {Object} metadata - Optional session metadata (user_agent, ip_address)
 * @returns {Promise<Object>} Session token and data
 */
export async function createSession(env, userId, metadata = {}) {
  const supabase = getSupabaseClient(env);
  
  // Generate secure token
  const token = crypto.randomUUID();
  
  const expiresAt = new Date(Date.now() + SESSION_MS);
  
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
      user_agent: metadata.user_agent || null,
      ip_address: metadata.ip_address || null
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }
  
  return {
    token,
    expires_at: expiresAt,
    session: data
  };
}

/**
 * Validate session token and return user with modules
 * 
 * @param {Object} env - Environment variables
 * @param {string} token - Session token
 * @returns {Promise<Object|null>} User object with modules or null
 */
export async function validateSession(env, token) {
  if (!token) return null;
  
  const supabase = getSupabaseClient(env);
  
  // Get session with user and modules in one query
  const { data: session, error } = await supabase
    .from('sessions')
    .select(`
      *,
      user:users!inner (
        id,
        email,
        username,
        full_name,
        avatar_url,
        role,
        is_active,
        last_login_at
      )
    `)
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error || !session) {
    return null;
  }
  
  // Check if user is active
  if (!session.user.is_active) {
    return null;
  }

  // Glijdend verlengen (zie SESSION_DAYS). Mislukt dat, dan is de sessie
  // gewoon nog geldig tot haar huidige einde -- geen reden om te weigeren.
  if (new Date(session.expires_at).getTime() - Date.now() < VERLENG_ALS_MINDER_DAN_MS) {
    const { error: verlengFout } = await supabase
      .from('sessions')
      .update({
        expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('token', token);
    if (verlengFout) console.error('Session verlengen mislukt:', verlengFout.message);
  }
  
  // Get user's enabled modules
  const { data: userModules } = await supabase
    .from('user_modules')
    .select(`
      is_enabled,
      permissions,
      module:modules!inner (
        id,
        code,
        name,
        description,
        route,
        icon,
        display_order
      )
    `)
    .eq('user_id', session.user.id)
    .eq('is_enabled', true)
    .eq('module.is_active', true)
    .order('module(display_order)');
  
  // Attach full user_modules to user (includes is_enabled flag and module data)
  session.user.modules = userModules || [];

  // Favoriete mini-apps (voor de blokjes rechtsboven in de navbar, zie
  // src/lib/components/navbar.js + supabase/migrations/*_mini_app_favorites.sql).
  // Persoonlijke favorieten + apps die een admin globaal favoriet gemaakt
  // heeft (mini_apps.is_global_favorite), samengevoegd en gesorteerd op de
  // door de gebruiker zelf gekozen volgorde -- zie
  // src/modules/mini-apps/lib/favorites.js (zelfde logica als de
  // "Favorieten"-sectie in de Mini-apps-pagina zelf, één plek voor de
  // merge/sorteerlogica). Apps waar de user geen toegang meer toe heeft
  // (privé gemaakt, share ingetrokken) vallen er automatisch uit, tenzij
  // alsnog globaal favoriet.
  const orderedFavorites = await getOrderedFavorites(supabase, session.user.id);
  session.user.favoriteMiniApps = orderedFavorites.map(f => ({ id: f.id, title: f.title, icon: f.icon }));

  // Build modulePermissions map: { module_code: string[] }
  session.user.modulePermissions = {};
  for (const um of (userModules || [])) {
    if (um.module?.code && Array.isArray(um.permissions) && um.permissions.length > 0) {
      session.user.modulePermissions[um.module.code] = um.permissions;
    }
  }
  
  // Update last activity (fire and forget)
  supabase
    .from('sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', session.id)
    .then(() => {});
  
  return session.user;
}

/**
 * Invalidate a session (logout)
 * 
 * @param {Object} env - Environment variables
 * @param {string} token - Session token
 * @returns {Promise<boolean>} Success
 */
export async function invalidateSession(env, token) {
  const supabase = getSupabaseClient(env);
  
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('token', token);
  
  return !error;
}

/**
 * Invalidate all sessions for a user
 * 
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success
 */
export async function invalidateAllUserSessions(env, userId) {
  const supabase = getSupabaseClient(env);
  
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('user_id', userId);
  
  return !error;
}

/**
 * Refresh session expiry
 * 
 * @param {Object} env - Environment variables
 * @param {string} token - Session token
 * @returns {Promise<Object|null>} New expiry or null
 */
export async function refreshSession(env, token) {
  const supabase = getSupabaseClient(env);
  
  const newExpiresAt = new Date(Date.now() + SESSION_MS);
  
  const { data, error } = await supabase
    .from('sessions')
    .update({ 
      expires_at: newExpiresAt.toISOString(),
      last_activity_at: new Date().toISOString()
    })
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .select()
    .single();
  
  if (error) return null;
  
  return {
    expires_at: newExpiresAt,
    session: data
  };
}

/**
 * Cleanup expired sessions
 * 
 * @param {Object} env - Environment variables
 * @returns {Promise<number>} Number of sessions deleted
 */
export async function cleanupExpiredSessions(env) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select();
  
  return data?.length || 0;
}