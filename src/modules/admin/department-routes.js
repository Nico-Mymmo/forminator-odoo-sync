/**
 * Admin — departementen en module-instellingen voor de homepage.
 *
 * Gebruikt door public/home.js (linkerkolom + tandwiel op een tegel).
 * Wie toegang heeft tot een module, loopt via de bestaande
 * GET/PUT /admin/api/modules/:id/users (routes.js).
 *
 * Tabel: module_departments + modules.department_id
 * (supabase/migrations/20261016150000_module_departments.sql).
 */

import { getSupabaseClient } from '../../lib/database.js';

const ICON_RE = /^[a-z0-9-]{1,40}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function forbidden(user) {
  return user?.role !== 'admin' ? json({ success: false, error: 'Forbidden' }, 403) : null;
}

async function readBody(request) {
  try { return await request.json(); } catch (_e) { return null; }
}

function cleanName(v) {
  const name = String(v || '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 60 ? name : null;
}

function cleanIcon(v) {
  if (v === null || v === undefined || v === '') return null;
  const icon = String(v).trim().toLowerCase();
  return ICON_RE.test(icon) ? icon : undefined;
}

/** POST /admin/api/departments  { name, icon? } */
export async function handleCreateDepartment({ env, user, request }) {
  const deny = forbidden(user); if (deny) return deny;
  const body = await readBody(request);
  const name = cleanName(body?.name);
  if (!name) return json({ success: false, error: 'Geef een naam van 1 tot 60 tekens.' }, 400);
  const icon = cleanIcon(body?.icon);
  if (icon === undefined) return json({ success: false, error: 'Ongeldige icoonnaam.' }, 400);

  const supabase = getSupabaseClient(env);
  const { data: last } = await supabase
    .from('module_departments').select('display_order')
    .order('display_order', { ascending: false }).limit(1);
  const display_order = ((last && last[0] && last[0].display_order) || 0) + 10;

  const { data, error } = await supabase
    .from('module_departments')
    .insert({ name, icon, display_order })
    .select('id, name, icon, display_order')
    .single();
  if (error) {
    const dubbel = error.code === '23505';
    return json({ success: false, error: dubbel ? 'Er bestaat al een departement met die naam.' : error.message }, dubbel ? 409 : 500);
  }
  return json({ success: true, department: data });
}

/** PUT /admin/api/departments/:id  { name?, icon? } */
export async function handleUpdateDepartment({ env, user, request, params }) {
  const deny = forbidden(user); if (deny) return deny;
  const body = await readBody(request);
  const patch = {};
  if (body && 'name' in body) {
    const name = cleanName(body.name);
    if (!name) return json({ success: false, error: 'Geef een naam van 1 tot 60 tekens.' }, 400);
    patch.name = name;
  }
  if (body && 'icon' in body) {
    const icon = cleanIcon(body.icon);
    if (icon === undefined) return json({ success: false, error: 'Ongeldige icoonnaam.' }, 400);
    patch.icon = icon;
  }
  if (!Object.keys(patch).length) return json({ success: false, error: 'Niets om te bewaren.' }, 400);

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('module_departments').update(patch).eq('id', params.id)
    .select('id, name, icon, display_order').maybeSingle();
  if (error) {
    const dubbel = error.code === '23505';
    return json({ success: false, error: dubbel ? 'Er bestaat al een departement met die naam.' : error.message }, dubbel ? 409 : 500);
  }
  if (!data) return json({ success: false, error: 'Departement niet gevonden.' }, 404);
  return json({ success: true, department: data });
}

/** DELETE /admin/api/departments/:id — de modules erin komen onder "Overige". */
export async function handleDeleteDepartment({ env, user, params }) {
  const deny = forbidden(user); if (deny) return deny;
  const supabase = getSupabaseClient(env);
  const { error: unlinkError } = await supabase
    .from('modules').update({ department_id: null }).eq('department_id', params.id);
  if (unlinkError) return json({ success: false, error: unlinkError.message }, 500);
  const { error } = await supabase.from('module_departments').delete().eq('id', params.id);
  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true });
}

/** PUT /admin/api/departments/order  { ids: [...] } — volgorde in de linkerkolom. */
export async function handleReorderDepartments({ env, user, request }) {
  const deny = forbidden(user); if (deny) return deny;
  const body = await readBody(request);
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : null;
  if (!ids || !ids.length) return json({ success: false, error: 'ids (array) is verplicht' }, 400);

  const supabase = getSupabaseClient(env);
  const results = await Promise.all(ids.map((id, i) =>
    supabase.from('module_departments').update({ display_order: (i + 1) * 10 }).eq('id', id)
  ));
  const fout = results.find(r => r.error);
  if (fout) return json({ success: false, error: fout.error.message }, 500);
  return json({ success: true });
}

/** GET /admin/api/modules/:id/settings — wat het tandwiel op de homepage toont. */
export async function handleGetModuleSettings({ env, user, params }) {
  const deny = forbidden(user); if (deny) return deny;
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('modules')
    .select('id, code, name, description, route, icon, is_active, department_id')
    .eq('id', params.id).maybeSingle();
  if (error) return json({ success: false, error: error.message }, 500);
  if (!data) return json({ success: false, error: 'Module niet gevonden.' }, 404);
  return json({ success: true, module: data });
}

/** PUT /admin/api/modules/:id/settings  { department_id?, icon?, description? } */
export async function handleUpdateModuleSettings({ env, user, request, params }) {
  const deny = forbidden(user); if (deny) return deny;
  const body = await readBody(request);
  if (!body) return json({ success: false, error: 'Ongeldige JSON-body' }, 400);

  const patch = {};
  if ('department_id' in body) {
    patch.department_id = body.department_id ? String(body.department_id) : null;
  }
  if ('icon' in body) {
    const icon = cleanIcon(body.icon);
    if (icon === undefined) return json({ success: false, error: 'Ongeldige icoonnaam (enkel kleine letters, cijfers en -).' }, 400);
    patch.icon = icon;
  }
  if ('description' in body) {
    const description = String(body.description || '').trim();
    if (description.length > 300) return json({ success: false, error: 'De beschrijving is te lang (max. 300 tekens).' }, 400);
    patch.description = description || null;
  }
  if (!Object.keys(patch).length) return json({ success: false, error: 'Niets om te bewaren.' }, 400);

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('modules').update(patch).eq('id', params.id)
    .select('id, code, name, description, icon, department_id').maybeSingle();
  if (error) {
    const fk = error.code === '23503';
    return json({ success: false, error: fk ? 'Dat departement bestaat niet meer.' : error.message }, fk ? 400 : 500);
  }
  if (!data) return json({ success: false, error: 'Module niet gevonden.' }, 404);
  return json({ success: true, module: data });
}
