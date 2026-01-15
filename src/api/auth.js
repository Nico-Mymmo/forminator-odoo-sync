/**
 * Authentication API Routes
 * 
 * Public auth endpoints for login, logout, and user info
 */

import { getSupabaseClient } from '../lib/database.js';
import { createSession, invalidateSession } from '../lib/auth/session.js';
import { verifyPassword } from '../lib/auth/password.js';

/**
 * POST /api/auth/login
 * 
 * Login with email and password
 */
export async function handleLogin({ request, env }) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Email and password required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = getSupabaseClient(env);
    
    // Get user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    
    if (error || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid credentials'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    
    if (!isValid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid credentials'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if account is active
    if (!user.is_active) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Account not activated'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create session
    const { token, expires_at } = await createSession(env, user.id, {
      user_agent: request.headers.get('User-Agent'),
      ip_address: request.headers.get('CF-Connecting-IP')
    });
    
    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);
    
    // Get user modules
    const { data: userModules } = await supabase
      .from('user_modules')
      .select(`
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
      .eq('user_id', user.id)
      .eq('is_enabled', true)
      .eq('module.is_active', true)
      .order('module(display_order)');
    
    // Return session and user data
    return new Response(JSON.stringify({
      success: true,
      token,
      expires_at,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        role: user.role,
        modules: (userModules || []).map(um => um.module)
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/auth/logout
 * 
 * Invalidate current session
 */
export async function handleLogout({ request, env }) {
  try {
    // Check Authorization header first
    const authHeader = request.headers.get('Authorization');
    let token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    // If no auth header, check cookies
    if (!token) {
      const cookieHeader = request.headers.get('Cookie');
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        const sessionCookie = cookies.find(c => c.startsWith('session='));
        if (sessionCookie) {
          token = sessionCookie.split('=')[1];
        }
      }
    }
    
    if (token) {
      await invalidateSession(env, token);
    }
    
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
      }
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/auth/me
 * 
 * Get current user info (requires auth)
 */
export async function handleMe({ user }) {
  return new Response(JSON.stringify({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
      last_login_at: user.last_login_at,
      modules: user.modules
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/auth/refresh
 * 
 * Refresh session token (extends expiry)
 */
export async function handleRefresh({ request, env }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;
    
    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { refreshSession } = await import('../lib/auth/session.js');
    const result = await refreshSession(env, token);
    
    if (!result) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid or expired token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      expires_at: result.expires_at
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Refresh error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
