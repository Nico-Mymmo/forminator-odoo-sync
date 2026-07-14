/**
 * Admin Module Routes
 * Handles user management, invites, and role assignments
 */

import { getSupabaseClient } from '../../lib/database.js';
import { MODULES } from '../registry.js';
import { hashPassword, generateRandomPassword } from '../../lib/auth/password.js';
import { invalidateAllUserSessions } from '../../lib/auth/session.js';

/**
 * Get all users with their modules
 */
export async function handleGetUsers(context) {
  const { env, user } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Simple test - just return basic user info
    const supabase = getSupabaseClient(env);
    
    // Get all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, username, role, is_active, created_at, odoo_uid, last_login_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return new Response(JSON.stringify({ error: error.message, details: error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all user_modules with module details (manual join – no FK constraint exists)
    const { data: userModuleRows, error: umError } = await supabase
      .from('user_modules')
      .select('user_id, module_id, is_enabled')
      .in('user_id', users.map(u => u.id));

    const { data: allModuleRows, error: modError } = await supabase
      .from('modules')
      .select('id, code, name');

    if (umError)  console.error('[admin] user_modules fetch error:', umError.message);
    if (modError) console.error('[admin] modules fetch error:', modError.message);

    // Build module lookup map: id → { code, name }
    const moduleMap = {};
    for (const m of (allModuleRows || [])) moduleMap[m.id] = m;

    // Group user_modules by user_id
    const userModuleMap = {};
    for (const um of (userModuleRows || [])) {
      if (um.is_enabled === false) continue;
      if (!userModuleMap[um.user_id]) userModuleMap[um.user_id] = [];
      const mod = moduleMap[um.module_id];
      if (mod) userModuleMap[um.user_id].push({ code: mod.code, name: mod.name });
    }

    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username ?? null,
      role: u.role,
      isActive: u.is_active,
      createdAt: u.created_at,
      odooUid: u.odoo_uid ?? null,
      lastLoginAt: u.last_login_at ?? null,
      modules: userModuleMap[u.id] || []
    }));
    
    return new Response(JSON.stringify({ users: formattedUsers }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('handleGetUsers error:', err);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      message: err.message,
      stack: err.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Create new user directly (no invite)
 */
export async function handleCreateUser(context) {
  const { env, user } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body = await context.request.json();
    const { email, password, role, modules } = body;
    
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!['admin', 'manager', 'user', 'marketing_signature', 'cx_powerboard_manager'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = getSupabaseClient(env);
    
    // Hash password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const passwordHash = `$2a$${hashHex.slice(0,2)}$${hashHex.slice(2)}`;
    
    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        role,
        is_active: true
      })
      .select()
      .single();
    
    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Assign modules if provided
    if (modules && modules.length > 0) {
      const moduleAssignments = modules.map(moduleCode => ({
        user_id: newUser.id,
        module_code: moduleCode,
        is_enabled: true
      }));
      
      const { error: moduleError } = await supabase
        .from('user_modules')
        .insert(moduleAssignments);
      
      if (moduleError) {
        console.error('Failed to assign modules:', moduleError);
      }
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('handleCreateUser error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Update user role
 */
export async function handleUpdateUserRole(context) {
  const { env, user, params } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const userId = params?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await context.request.json();
    const { role } = body;

    if (!['admin', 'manager', 'user', 'marketing_signature', 'cx_powerboard_manager'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = getSupabaseClient(env);

    // Update the user's role
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[admin] handleUpdateUserRole – Supabase error:', error);
      return new Response(JSON.stringify({ error: error.message, details: error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Auto-grant mail_signature_designer to marketing_signature users
    // (mirrors the pattern from the roles & layers migration)
    if (role === 'marketing_signature') {
      const { data: module } = await supabase
        .from('modules')
        .select('id')
        .eq('code', 'mail_signature_designer')
        .single();

      if (module?.id) {
        await supabase
          .from('user_modules')
          .upsert(
            { user_id: userId, module_id: module.id, is_enabled: true, granted_by: userId },
            { onConflict: 'user_id,module_id' }
          );
      }
    }

    // Auto-grant cx_powerboard to cx_powerboard_manager users
    if (role === 'cx_powerboard_manager') {
      const { data: cxModule } = await supabase
        .from('modules')
        .select('id')
        .eq('code', 'cx_powerboard')
        .single();

      if (cxModule?.id) {
        await supabase
          .from('user_modules')
          .upsert(
            { user_id: userId, module_id: cxModule.id, is_enabled: true, granted_by: userId },
            { onConflict: 'user_id,module_id' }
          );
      }
    }

    return new Response(JSON.stringify({ user: data }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[admin] handleUpdateUserRole – unexpected error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Reset (opnieuw instellen) van het wachtwoord van een gebruiker.
 *
 * Body optioneel: { newPassword }. Als leeg/ontbrekend wordt er een sterk
 * wachtwoord gegenereerd en EENMALIG in de response teruggegeven (nooit
 * opgeslagen of gelogd in plaintext). Alle bestaande sessies van de
 * gebruiker worden ongeldig gemaakt zodat opnieuw ingelogd moet worden
 * met het nieuwe wachtwoord.
 */
export async function handleResetUserPassword(context) {
  const { env, user, params, request } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = params?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_err) {
    body = {};
  }

  let newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
  let generated = false;

  if (!newPassword) {
    newPassword = generateRandomPassword(16);
    generated = true;
  } else if (newPassword.length < 8) {
    return new Response(JSON.stringify({
      error: 'Wachtwoord moet minstens 8 tekens lang zijn'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);

  const { data: targetUser, error: fetchError } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .single();

  if (fetchError || !targetUser) {
    return new Response(JSON.stringify({ error: 'Gebruiker niet gevonden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const passwordHash = await hashPassword(newPassword);

  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) {
    console.error('[admin] handleResetUserPassword â Supabase error:', updateError.message);
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Bestaande sessies intrekken â gebruiker moet met het nieuwe wachtwoord opnieuw inloggen
  await invalidateAllUserSessions(env, userId);

  console.log(`[admin] password reset for user ${userId} (generated=${generated}) by admin ${user.id}`);

  return new Response(JSON.stringify({
    success: true,
    generated,
    newPassword: generated ? newPassword : undefined,
    email: targetUser.email
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Update user modules
 */
export async function handleUpdateUserModules(context) {
  const { env, user, params } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const userId = params.id;
  const body = await context.request.json();
  const { modules } = body; // Array of module codes
  
  const supabase = getSupabaseClient(env);
  
  // Get module IDs from codes
  const { data: moduleData, error: moduleError } = await supabase
    .from('modules')
    .select('id, code')
    .in('code', modules);
  
  if (moduleError) {
    return new Response(JSON.stringify({ error: moduleError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Delete existing module assignments
  const { error: deleteError } = await supabase
    .from('user_modules')
    .delete()
    .eq('user_id', userId);
  
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Insert new module assignments
  if (moduleData.length > 0) {
    const assignments = moduleData.map(m => ({
      user_id: userId,
      module_id: m.id
    }));
    
    const { error: insertError } = await supabase
      .from('user_modules')
      .insert(assignments);
    
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({ 
    success: true,
    modules: moduleData.map(m => m.code)
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Toggle user active status
 */
export async function handleToggleUserStatus(context) {
  const { env, user, params } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const userId = params.id;
  const supabase = getSupabaseClient(env);
  
  // Get current status
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('is_active')
    .eq('id', userId)
    .single();
  
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Toggle status
  const { data, error } = await supabase
    .from('users')
    .update({ is_active: !currentUser.is_active })
    .eq('id', userId)
    .select()
    .single();
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ user: data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Set / clear odoo_uid for a user (admin only, useful for testing)
 */
export async function handleUpdateUserOdooUid(context) {
  const { env, user, params } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = params?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await context.request.json();
  // Accept null to clear, or a positive integer
  const rawUid = body.odoo_uid;
  const odooUid = rawUid === null || rawUid === '' ? null : parseInt(rawUid, 10);

  if (odooUid !== null && (!Number.isFinite(odooUid) || odooUid <= 0)) {
    return new Response(JSON.stringify({ error: 'odoo_uid must be a positive integer or null' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('users')
    .update({ odoo_uid: odooUid })
    .eq('id', userId)
    .select('id, email, odoo_uid')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, user: data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Set / clear username for a user (admin only, can set for any user)
 */
export async function handleUpdateUserUsername(context) {
  const { env, user, params } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = params?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await context.request.json();
  const rawUsername = typeof body.username === 'string' ? body.username.trim() : body.username;
  const username = rawUsername === null || rawUsername === '' ? null : rawUsername;

  const supabase = getSupabaseClient(env);

  // Check if username is already taken by another user
  if (username) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .neq('id', userId)
      .single();

    if (existingUser) {
      return new Response(JSON.stringify({ error: 'Username already taken' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email, username')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, user: data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Registry codes die daadwerkelijk in de codebase geregistreerd zijn.
// Afgeleid uit registry.js zelf (i.p.v. een handmatig onderhouden lijst) --
// een hardcoded lijst raakt onvermijdelijk verouderd zodra er een nieuwe
// module bijkomt (zo werd bv. mini_apps hier aanvankelijk gemist, waardoor
// hij ten onrechte als "Verouderd" gemarkeerd stond EN via handleDeleteModule
// verwijderbaar was, ondanks dat hij nog gewoon actief geregistreerd is).
//
// BELANGRIJK: dit is een functie, geen top-level const. registry.js importeert
// (via de module-keten) uiteindelijk ook admin/module.js -> admin/routes.js,
// wat een circulaire import met registry.js oplevert. Zolang MODULES pas
// gelezen wordt ZODRA een handler daadwerkelijk draait (request-time) is dat
// geen probleem -- maar bij het lezen van MODULES.map() op module-load-time
// (top-level) was registry.js zijn eigen "export const MODULES = [...]" nog
// niet bereikt tijdens die cyclus, en was MODULES hier nog undefined. Gaf een
// Worker-brede crash bij elke (re)start: "Cannot read properties of
// undefined (reading 'map')".
function getRegistryCodes() {
  return new Set(MODULES.map(m => m.code));
}

/**
 * Get all modules
 */
export async function handleGetModules(context) {
  const { env, user } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);

  const { data: modules, error } = await supabase
    .from('modules')
    .select('*')
    .order('name');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Normalize snake_case DB columns to camelCase; flag orphaned modules
  const normalized = (modules || []).map(m => ({
    ...m,
    isActive: m.is_active ?? m.isActive ?? false,
    inRegistry: getRegistryCodes().has(m.code)
  }));

  return new Response(JSON.stringify({ modules: normalized }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Toggle module active status
 */
export async function handleToggleModule(context) {
  const { env, user, params } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const moduleId = params?.id;
  if (!moduleId) {
    return new Response(JSON.stringify({ error: 'Module ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);

  const { data: current, error: fetchError } = await supabase
    .from('modules')
    .select('is_active')
    .eq('id', moduleId)
    .single();

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { data, error } = await supabase
    .from('modules')
    .update({ is_active: !current.is_active })
    .eq('id', moduleId)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, module: data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Delete a module (orphaned modules only)
 */
export async function handleDeleteModule(context) {
  const { env, user, params } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const moduleId = params?.id;
  if (!moduleId) {
    return new Response(JSON.stringify({ error: 'Module ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);

  // Safety check: refuse to delete modules that are still in the registry
  const { data: mod, error: fetchError } = await supabase
    .from('modules')
    .select('id, code')
    .eq('id', moduleId)
    .single();

  if (fetchError || !mod) {
    return new Response(JSON.stringify({ error: 'Module niet gevonden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (getRegistryCodes().has(mod.code)) {
    return new Response(JSON.stringify({ error: 'Kan geen actieve module verwijderen' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Remove user_modules references first
  await supabase.from('user_modules').delete().eq('module_id', moduleId);

  const { error } = await supabase.from('modules').delete().eq('id', moduleId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Lijst alle gebruikers + welke van hen toegang hebben tot deze module.
 * Tegenhanger van handleUpdateUserModules, maar dan module-centrisch
 * (vanuit de Modules-tab i.p.v. per-gebruiker in de Gebruikers-tab).
 */
export async function handleGetModuleUsers(context) {
  const { env, user, params } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const moduleId = params?.id;
  if (!moduleId) {
    return new Response(JSON.stringify({ error: 'Module ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);

  const { data: allUsersData, error: usersError } = await supabase
    .from('users')
    .select('id, email, full_name, is_active')
    .order('email', { ascending: true });

  if (usersError) {
    return new Response(JSON.stringify({ error: usersError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { data: assignments, error: assignError } = await supabase
    .from('user_modules')
    .select('user_id, is_enabled')
    .eq('module_id', moduleId);

  if (assignError) {
    return new Response(JSON.stringify({ error: assignError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const enabledIds = new Set(
    (assignments || []).filter(a => a.is_enabled !== false).map(a => a.user_id)
  );

  const users = (allUsersData || []).map(u => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name || null,
    isActive: u.is_active,
    hasAccess: enabledIds.has(u.id)
  }));

  return new Response(JSON.stringify({ users }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Zet de volledige set gebruikers die toegang hebben tot deze module.
 * Body: { userIds: string[] } -- exact deze gebruikers krijgen toegang,
 * alle anderen worden ontkoppeld (zelfde delete+insert-patroon als
 * handleUpdateUserModules, maar dan module-centrisch).
 */
export async function handleUpdateModuleUsers(context) {
  const { env, user, params, request } = context;

  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const moduleId = params?.id;
  if (!moduleId) {
    return new Response(JSON.stringify({ error: 'Module ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: 'Ongeldige JSON-body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userIds = Array.isArray(body.userIds) ? body.userIds : null;
  if (!userIds) {
    return new Response(JSON.stringify({ error: 'userIds (array) is verplicht' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = getSupabaseClient(env);

  const { data: mod, error: modError } = await supabase
    .from('modules')
    .select('id')
    .eq('id', moduleId)
    .single();

  if (modError || !mod) {
    return new Response(JSON.stringify({ error: 'Module niet gevonden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { error: deleteError } = await supabase
    .from('user_modules')
    .delete()
    .eq('module_id', moduleId);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (userIds.length > 0) {
    const rows = userIds.map(uid => ({
      user_id: uid,
      module_id: moduleId,
      is_enabled: true,
      granted_by: user.id
    }));

    const { error: insertError } = await supabase
      .from('user_modules')
      .insert(rows);

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ success: true, count: userIds.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
