/**
 * Authentication API Routes
 * 
 * Public auth endpoints for login, logout, and user info
 */

import { invalidateSession, SESSION_DAYS } from '../lib/auth/session.js';
import { logAuthEvent, requestMeta } from '../lib/auth/events.js';
import { navbar } from '../lib/components/navbar.js';

// Het inloggen zelf (wachtwoord, 2FA, wachtwoord kiezen) staat in
// ./auth-login.js.

/**
 * De sessiecookie.
 *
 * `SameSite=Lax`, NIET `Strict`. Met Strict stuurt de browser de cookie niet
 * mee als je vanuit een ANDERE site binnenkomt -- en dat is precies hoe de OM
 * gebruikt wordt: een offerte aanklikken in de chatter van Odoo. Je was dan
 * gewoon ingelogd en kreeg toch het loginscherm. Lax stuurt haar mee bij het
 * volgen van een link (een GET op het hoogste niveau), en nog altijd niet bij
 * een POST of fetch vanaf een andere site; daar zit de CSRF-bescherming.
 *
 * Max-Age volgt de sessie (SESSION_DAYS); /api/auth/me zet haar bij elk
 * bezoek opnieuw, zodat de cookie meeglijdt met de sessie in de database.
 *
 * @param {string} token @returns {string}
 */
export function sessionCookie(token) {
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
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
      const { userId } = await invalidateSession(env, token);
      if (userId) await logAuthEvent(env, { event: 'logout', userId, meta: requestMeta(request) });
    }
    
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
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
export async function handleMe({ user, token = null }) {
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
    },
    navbarHtml: navbar(user)
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Laat de cookie meeglijden met de sessie (zie sessionCookie()).
      ...(token ? { 'Set-Cookie': sessionCookie(token) } : {})
    }
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
