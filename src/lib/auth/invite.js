/**
 * Invite Management
 * 
 * Handle user invitations with secure tokens
 */

import { getSupabaseClient } from '../database.js';

/**
 * Create an invite for a new user
 * 
 * @param {Object} env - Environment variables
 * @param {string} email - Recipient email
 * @param {string} createdBy - Admin user ID
 * @returns {Promise<Object>} Invite data
 */
export async function createInvite(env, email, createdBy) {
  const supabase = getSupabaseClient(env);
  
  // Normalize email
  email = email.toLowerCase().trim();
  
  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .single();
  
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  
  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from('invites')
    .select('id, expires_at')
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (existingInvite) {
    throw new Error('Pending invite already exists for this email');
  }
  
  // Generate secure token
  const token = crypto.randomUUID();
  
  // Set expiry (7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  const { data, error } = await supabase
    .from('invites')
    .insert({
      email,
      token,
      expires_at: expiresAt.toISOString(),
      created_by: createdBy
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create invite: ${error.message}`);
  }
  
  return {
    ...data,
    invite_url: `/invite?token=${token}`
  };
}

/**
 * Validate invite token
 * 
 * @param {Object} env - Environment variables
 * @param {string} token - Invite token
 * @returns {Promise<Object|null>} Invite data or null
 */
export async function validateInviteToken(env, token) {
  if (!token) return null;
  
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('invites')
    .select(`
      *,
      creator:users!created_by (
        full_name,
        email
      )
    `)
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data;
}

/**
 * Accept invite and create user account
 * 
 * @param {Object} env - Environment variables
 * @param {string} token - Invite token
 * @param {Object} userData - User data (full_name, password_hash)
 * @returns {Promise<Object>} Created user
 */
export async function acceptInvite(env, token, userData) {
  const supabase = getSupabaseClient(env);
  
  // Validate invite
  const invite = await validateInviteToken(env, token);
  if (!invite) {
    throw new Error('Invalid or expired invite');
  }
  
  // Create user account
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      email: invite.email,
      password_hash: userData.password_hash,
      full_name: userData.full_name,
      role: 'user',
      is_active: true,
      invited_by: invite.created_by
    })
    .select()
    .single();
  
  if (userError) {
    throw new Error(`Failed to create user: ${userError.message}`);
  }
  
  // Mark invite as accepted
  await supabase
    .from('invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id
    })
    .eq('id', invite.id);
  
  // Default modules are granted automatically via trigger
  
  return user;
}

/**
 * Get all invites (with filters)
 * 
 * @param {Object} env - Environment variables
 * @param {Object} filters - Optional filters (pending_only, email)
 * @returns {Promise<Array>} Invites
 */
export async function getInvites(env, filters = {}) {
  const supabase = getSupabaseClient(env);
  
  let query = supabase
    .from('invites')
    .select(`
      *,
      creator:users!created_by (
        full_name,
        email
      ),
      accepted_user:users!accepted_by (
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false });
  
  if (filters.pending_only) {
    query = query
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString());
  }
  
  if (filters.email) {
    query = query.eq('email', filters.email.toLowerCase());
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch invites: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Revoke/delete an invite
 * 
 * @param {Object} env - Environment variables
 * @param {string} inviteId - Invite ID
 * @returns {Promise<boolean>} Success
 */
export async function revokeInvite(env, inviteId) {
  const supabase = getSupabaseClient(env);
  
  const { error } = await supabase
    .from('invites')
    .delete()
    .eq('id', inviteId)
    .is('accepted_at', null); // Only delete pending invites
  
  return !error;
}

/**
 * Cleanup expired invites
 * 
 * @param {Object} env - Environment variables
 * @returns {Promise<number>} Number of invites deleted
 */
export async function cleanupExpiredInvites(env) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('invites')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .is('accepted_at', null)
    .select();
  
  return data?.length || 0;
}
