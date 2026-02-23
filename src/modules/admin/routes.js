/**
 * Admin Module Routes
 * Handles user management, invites, and role assignments
 */

import { createClient } from '@supabase/supabase-js';

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
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Get all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, is_active, created_at')
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
      role: u.role,
      isActive: u.is_active,
      createdAt: u.created_at,
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
    
    if (!['admin', 'manager', 'user', 'marketing_signature'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
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
  
  const userId = params.id;
  const body = await context.request.json();
  const { role } = body;
  
  if (!['admin', 'manager', 'user', 'marketing_signature'].includes(role)) {
    return new Response(JSON.stringify({ error: 'Invalid role' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('users')
    .update({ role })
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
  
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
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
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
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
 * Get all invites
 */
export async function handleGetInvites(context) {
  const { env, user } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: invites, error } = await supabase
    .from('invites')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ invites }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Create new invite
 */
export async function handleCreateInvite(context) {
  const { env, user } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const body = await context.request.json();
  const { email, role, modules } = body;
  
  if (!email || !role) {
    return new Response(JSON.stringify({ error: 'Email and role required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!['admin', 'manager', 'user', 'marketing_signature'].includes(role)) {
    return new Response(JSON.stringify({ error: 'Invalid role' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  
  if (existingUser) {
    return new Response(JSON.stringify({ error: 'User already exists' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Check if invite already exists and is pending
  const { data: existingInvite } = await supabase
    .from('invites')
    .select('id, status')
    .eq('email', email)
    .eq('status', 'pending')
    .single();
  
  if (existingInvite) {
    return new Response(JSON.stringify({ error: 'Pending invite already exists' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Generate invite token (simple UUID for now)
  const token = crypto.randomUUID();
  
  // Set expiry (7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  // Create invite
  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      email,
      role,
      default_modules: modules || [],
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
      created_by: user.id
    })
    .select()
    .single();
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // TODO: Send email with invite link
  const inviteLink = `${context.request.url.split('/')[0]}//${context.request.url.split('/')[2]}/invite?token=${token}`;
  
  return new Response(JSON.stringify({ 
    invite,
    inviteLink,
    message: 'Invite created. Send this link to the user: ' + inviteLink
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Delete/revoke invite
 */
export async function handleDeleteInvite(context) {
  const { env, user, params } = context;
  
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const inviteId = params.id;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { error } = await supabase
    .from('invites')
    .delete()
    .eq('id', inviteId);
  
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
  
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
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
  
  // Normalize snake_case DB columns to camelCase for the frontend
  const normalized = (modules || []).map(m => ({
    ...m,
    isActive: m.is_active ?? m.isActive ?? false
  }));
  
  return new Response(JSON.stringify({ modules: normalized }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
