/**
 * Session Management
 * 
 * Handles session creation, validation, and lifecycle
 */

import { getSupabaseClient } from '../database.js';

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
  
  // Set expiry (24 hours)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  
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
  
  // Get user's enabled modules
  const { data: userModules } = await supabase
    .from('user_modules')
    .select(`
      is_enabled,
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
  
  const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  
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
