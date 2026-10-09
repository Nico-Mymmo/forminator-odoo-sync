/**
 * Profile Module Routes
 */

import { getSupabaseClient } from '../../lib/database.js';
import { verifyUserPassword, hashUserPassword, checkNewPassword } from '../../lib/auth/password.js';
import { checkLockout, logAuthEvent, requestMeta } from '../../lib/auth/events.js';
import { revokeOtherSessions } from '../../lib/auth/session.js';

/**
 * POST /profile/update
 * Update user profile
 */
export async function handleUpdateProfile(context) {
  const { request, env, user } = context;
  
  if (!user) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const { username } = await request.json();
    
    const supabase = getSupabaseClient(env);
    
    // Check if username is already taken by another user
    if (username) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .neq('id', user.id)
        .single();
      
      if (existingUser) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Username already taken'
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Update username
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        username: username || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    if (updateError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to update profile'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /profile/change-password
 * Change user password
 */
export async function handleChangePassword(context) {
  const { request, env, user } = context;
  
  if (!user) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const { currentPassword, newPassword } = await request.json();
    
    if (!currentPassword || !newPassword) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Current and new password required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = getSupabaseClient(env);
    
    // Get user with password hash
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, password_hash')
      .eq('id', user.id)
      .single();
    
    if (userError || !userData) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Het huidige wachtwoord raden telt mee voor de blokkering, net als bij
    // het inloggen; anders is dit scherm een tweede deur om te raden.
    const meta = requestMeta(request);
    const slot = await checkLockout(env, { email: userData.email, ip: meta.ip_address });
    if (slot.locked) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.'
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify current password
    const { valid: isValid } = await verifyUserPassword(currentPassword, userData.password_hash);

    if (!isValid) {
      await logAuthEvent(env, { event: 'password_failed', userId: user.id, email: userData.email, meta, detail: { reauth: true } });
      return new Response(JSON.stringify({
        success: false,
        error: 'Je huidige wachtwoord klopt niet.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const pwFout = checkNewPassword(newPassword, { email: userData.email });
    if (pwFout) {
      return new Response(JSON.stringify({ success: false, error: pwFout }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash new password
    const newHash = await hashUserPassword(newPassword);
    
    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: newHash,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    if (updateError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to update password'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Een nieuw wachtwoord betekent: wie het oude kende, moet eruit. De
    // sessie waarmee je het wijzigde, blijft.
    const beeindigd = user.sessionId ? await revokeOtherSessions(env, user.id, user.sessionId) : 0;
    await logAuthEvent(env, {
      event: 'password_changed',
      userId: user.id,
      email: userData.email,
      meta,
      detail: { sessions_revoked: beeindigd }
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Password updated successfully',
      sessions_revoked: beeindigd
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
