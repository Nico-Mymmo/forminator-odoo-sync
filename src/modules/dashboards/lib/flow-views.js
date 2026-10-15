/**
 * Marketing — bewaarde weergaven van de padverkenner, met een mini-doel (2026-10-13).
 *
 * Een weergave = de filters links + de stand van "Hoe bezoekers door de site gaan"
 * (stand, doel, pagina of actie in het midden, stappen, vastgezette kaarten). De
 * browser maakt en leest `state` (encodeView/decodeView in
 * public/dashboards-marketing-behaviour.js) en rekent ook het aantal en de ratio
 * uit: de sessies staan daar al. Hier enkel bewaren, met een grens op de grootte.
 *
 * Mini-doel: target_pct (waar we naartoe willen) en baseline_pct (de ratio toen het
 * doel gezet werd). Gedeeld met iedereen die Dashboards heeft.
 * Tabel: marketing_flow_views (migratie 20261013150000).
 */

import { getSupabaseClient } from '../../../lib/database.js';

const TABLE = 'marketing_flow_views';
const KOLOMMEN = 'id, name, state, target_pct, baseline_pct, target_set_at, created_by_email, created_at, updated_at';
const MAX_STATE = 8000;   // tekens JSON: ruim voor filters en spelden
const MAX_VIEWS = 60;

function pctOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Een percentage ligt tussen 0 en 100.');
  return Math.round(n * 100) / 100;
}

function cleanName(v) {
  const name = String(v || '').trim().slice(0, 80);
  if (!name) throw new Error('Geef de weergave een naam.');
  return name;
}

function cleanState(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Ongeldige weergave.');
  if (JSON.stringify(v).length > MAX_STATE) throw new Error('Deze weergave is te groot om te bewaren.');
  return v;
}

export async function listViews(env) {
  const { data, error } = await getSupabaseClient(env).from(TABLE).select(KOLOMMEN).order('created_at', { ascending: true });
  if (error) throw new Error(`Bewaarde weergaven: ${error.message}`);
  return data || [];
}

/** body: { name, state, target_pct?, baseline_pct? } */
export async function createView(env, user, body) {
  const sb = getSupabaseClient(env);
  const { count } = await sb.from(TABLE).select('id', { count: 'exact', head: true });
  if ((count || 0) >= MAX_VIEWS) throw new Error(`Er staan al ${MAX_VIEWS} weergaven; verwijder er eerst een.`);
  const target = pctOrNull(body.target_pct);
  const row = {
    name: cleanName(body.name),
    state: cleanState(body.state),
    target_pct: target,
    baseline_pct: target === null ? null : pctOrNull(body.baseline_pct),
    target_set_at: target === null ? null : new Date().toISOString(),
    created_by: user?.id || null,
    created_by_email: user?.email || '',
  };
  const { data, error } = await sb.from(TABLE).insert(row).select(KOLOMMEN).single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * body: { name?, state?, target_pct?, baseline_pct? }. Een nieuw doel (ander
 * target_pct) zet ook een nieuw vertrekpunt en een nieuwe datum; target_pct null
 * haalt het doel weg.
 */
export async function updateView(env, id, body) {
  const sb = getSupabaseClient(env);
  const patch = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = cleanName(body.name);
  if (body.state !== undefined) patch.state = cleanState(body.state);
  if (body.target_pct !== undefined) {
    const target = pctOrNull(body.target_pct);
    const { data: old, error: e1 } = await sb.from(TABLE).select('target_pct, baseline_pct').eq('id', id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!old) return null;
    patch.target_pct = target;
    if (target === null) { patch.baseline_pct = null; patch.target_set_at = null; }
    else if (Number(old.target_pct) !== target || old.target_pct === null || body.baseline_pct !== undefined) {
      patch.baseline_pct = body.baseline_pct !== undefined ? pctOrNull(body.baseline_pct) : old.baseline_pct;
      patch.target_set_at = new Date().toISOString();
    }
  }
  const { data, error } = await sb.from(TABLE).update(patch).eq('id', id).select(KOLOMMEN).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteView(env, id) {
  const { error } = await getSupabaseClient(env).from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
