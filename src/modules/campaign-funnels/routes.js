/**
 * Ad & Sales Campaigns — routes
 *
 * CRUD over campaign_funnels -> campaign_swimlanes -> campaign_cards.
 * Zie supabase/migrations/20260731160000_campaign_funnels_init.sql voor het schema.
 */
import { getSupabaseClient } from '../../lib/database.js';
import { suggestGroups } from './lib/ai-grouping.js';

const STAGES = [
  'onderzoek', 'kernboodschap', 'argument', 'kernargument',
  'onderbouwing', 'product', 'conversie'
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function fail(message, status = 400) {
  return json({ success: false, error: message }, status);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// --- Funnels ---------------------------------------------------------------

async function listFunnels({ env }) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_funnels')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return fail(error.message, 500);
  return json({ success: true, data });
}

async function createFunnel({ env, user, request }) {
  const body = await readBody(request);
  if (!body.name || !body.name.trim()) return fail('name is verplicht');

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_funnels')
    .insert({
      name: body.name.trim(),
      description: body.description || null,
      status: body.status || 'concept',
      created_by: user.id
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return json({ success: true, data }, 201);
}

async function getFunnel({ env, params }) {
  const supabase = getSupabaseClient(env);

  const { data: funnel, error: funnelError } = await supabase
    .from('campaign_funnels')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (funnelError) return fail(funnelError.message, 500);
  if (!funnel) return fail('Funnel niet gevonden', 404);

  const { data: swimlanes, error: swimlaneError } = await supabase
    .from('campaign_swimlanes')
    .select('*')
    .eq('funnel_id', params.id)
    .order('sort_order', { ascending: true });
  if (swimlaneError) return fail(swimlaneError.message, 500);

  const swimlaneIds = (swimlanes || []).map(s => s.id);
  let cards = [];
  if (swimlaneIds.length > 0) {
    const { data: cardRows, error: cardError } = await supabase
      .from('campaign_cards')
      .select('*')
      .in('swimlane_id', swimlaneIds)
      .order('sort_order', { ascending: true });
    if (cardError) return fail(cardError.message, 500);
    cards = cardRows || [];
  }

  const swimlanesWithCards = (swimlanes || []).map(lane => ({
    ...lane,
    cards: cards.filter(c => c.swimlane_id === lane.id)
  }));

  return json({ success: true, data: { funnel, swimlanes: swimlanesWithCards, stages: STAGES } });
}

async function updateFunnel({ env, params, request }) {
  const body = await readBody(request);
  const updates = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (Object.keys(updates).length === 0) return fail('geen velden om te updaten');
  updates.updated_at = new Date().toISOString();

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_funnels')
    .update(updates)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('Funnel niet gevonden', 404);
  return json({ success: true, data });
}

async function deleteFunnel({ env, params }) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('campaign_funnels')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return json({ success: true });
}

// --- Swimlanes ---------------------------------------------------------------

async function createSwimlane({ env, params, request }) {
  const body = await readBody(request);
  if (!body.title || !body.title.trim()) return fail('title is verplicht');

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_swimlanes')
    .insert({
      funnel_id: params.id,
      title: body.title.trim(),
      description: body.description || null,
      sort_order: Number.isFinite(body.sort_order) ? body.sort_order : 0
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return json({ success: true, data }, 201);
}

async function updateSwimlane({ env, params, request }) {
  const body = await readBody(request);
  const updates = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (Object.keys(updates).length === 0) return fail('geen velden om te updaten');

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_swimlanes')
    .update(updates)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('Swimlane niet gevonden', 404);
  return json({ success: true, data });
}

async function deleteSwimlane({ env, params }) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('campaign_swimlanes')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return json({ success: true });
}

// --- Onderzoek-inbox (fase 2) -----------------------------------------------
// Ruwe onderzoeksnotities die nog niet bij een Inzicht (swimlane) horen.
// swimlane_id is dan NULL; funnel_id ligt wel altijd vast. Zie
// supabase/migrations/20260731190000_campaign_funnels_research_inbox.sql.

async function listInbox({ env, params }) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_cards')
    .select('*')
    .eq('funnel_id', params.id)
    .is('swimlane_id', null)
    .order('created_at', { ascending: true });
  if (error) return fail(error.message, 500);
  return json({ success: true, data });
}

async function createInboxCard({ env, params, request }) {
  const body = await readBody(request);
  if (!body.content || !body.content.trim()) return fail('content is verplicht');

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_cards')
    .insert({
      funnel_id: params.id,
      swimlane_id: null,
      stage: 'onderzoek',
      content: body.content.trim(),
      card_type: body.card_type || null,
      sort_order: 0
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return json({ success: true, data }, 201);
}

async function suggestGroupsHandler({ env, params }) {
  const supabase = getSupabaseClient(env);
  const { data: cards, error } = await supabase
    .from('campaign_cards')
    .select('id, content, card_type')
    .eq('funnel_id', params.id)
    .is('swimlane_id', null)
    .order('created_at', { ascending: true });
  if (error) return fail(error.message, 500);
  if (!cards || cards.length === 0) return fail('Geen onderzoeksnotities in de inbox om te groeperen', 400);

  try {
    const proposal = await suggestGroups({ env, cards });
    return json({ success: true, data: proposal });
  } catch (err) {
    return fail(err.message, err.code === 'AI_NOT_CONFIGURED' ? 503 : 502);
  }
}

async function confirmGroupsHandler({ env, params, request }) {
  const body = await readBody(request);
  const groups = Array.isArray(body.groups) ? body.groups : [];
  if (groups.length === 0) return fail('Geen groepen om te bevestigen');

  const supabase = getSupabaseClient(env);

  // Bestaand aantal Inzichten voor deze funnel, voor een oplopende sort_order
  const { count: existingCount, error: countError } = await supabase
    .from('campaign_swimlanes')
    .select('id', { count: 'exact', head: true })
    .eq('funnel_id', params.id);
  if (countError) return fail(countError.message, 500);

  const created = [];
  let sortOrder = existingCount || 0;

  for (const group of groups) {
    const title = (group.title || '').trim();
    const cardIds = Array.isArray(group.card_ids) ? group.card_ids : [];
    if (!title || cardIds.length === 0) continue;
    sortOrder += 1;

    const { data: lane, error: laneError } = await supabase
      .from('campaign_swimlanes')
      .insert({
        funnel_id: params.id,
        title,
        description: (group.description || '').trim() || null,
        sort_order: sortOrder
      })
      .select()
      .single();
    if (laneError) return fail(laneError.message, 500);

    // Enkel kaarten die effectief in de inbox van DEZE funnel zitten mogen gekoppeld worden.
    const { error: updateError } = await supabase
      .from('campaign_cards')
      .update({ swimlane_id: lane.id })
      .in('id', cardIds)
      .eq('funnel_id', params.id)
      .is('swimlane_id', null);
    if (updateError) return fail(updateError.message, 500);

    created.push(lane);
  }

  return json({ success: true, data: created }, 201);
}

// --- Cards ---------------------------------------------------------------

async function createCard({ env, params, request }) {
  const body = await readBody(request);
  if (!body.content || !body.content.trim()) return fail('content is verplicht');
  if (!STAGES.includes(body.stage)) return fail(`stage moet één van ${STAGES.join(', ')} zijn`);

  const supabase = getSupabaseClient(env);

  // funnel_id is NOT NULL op campaign_cards (ook voor kaarten die rechtstreeks
  // aan een bestaand Inzicht/swimlane worden toegevoegd, buiten de inbox om).
  const { data: lane, error: laneError } = await supabase
    .from('campaign_swimlanes')
    .select('funnel_id')
    .eq('id', params.id)
    .maybeSingle();
  if (laneError) return fail(laneError.message, 500);
  if (!lane) return fail('Swimlane niet gevonden', 404);

  const { data, error } = await supabase
    .from('campaign_cards')
    .insert({
      funnel_id: lane.funnel_id,
      swimlane_id: params.id,
      stage: body.stage,
      content: body.content.trim(),
      card_type: body.card_type || null,
      source_ref: body.source_ref || null,
      sort_order: Number.isFinite(body.sort_order) ? body.sort_order : 0
    })
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return json({ success: true, data }, 201);
}

async function updateCard({ env, params, request }) {
  const body = await readBody(request);
  const updates = {};
  if (body.content !== undefined) updates.content = body.content;
  if (body.card_type !== undefined) updates.card_type = body.card_type;
  if (body.source_ref !== undefined) updates.source_ref = body.source_ref;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (body.stage !== undefined) {
    if (!STAGES.includes(body.stage)) return fail(`stage moet één van ${STAGES.join(', ')} zijn`);
    updates.stage = body.stage;
  }
  if (Object.keys(updates).length === 0) return fail('geen velden om te updaten');
  updates.updated_at = new Date().toISOString();

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('campaign_cards')
    .update(updates)
    .eq('id', params.id)
    .select()
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('Card niet gevonden', 404);
  return json({ success: true, data });
}

async function deleteCard({ env, params }) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('campaign_cards')
    .delete()
    .eq('id', params.id);
  if (error) return fail(error.message, 500);
  return json({ success: true });
}

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/campaign-funnels.html', context.request.url))),

  'GET /api/funnels': listFunnels,
  'POST /api/funnels': createFunnel,
  'GET /api/funnels/:id': getFunnel,
  'PATCH /api/funnels/:id': updateFunnel,
  'DELETE /api/funnels/:id': deleteFunnel,

  'POST /api/funnels/:id/swimlanes': createSwimlane,
  'PATCH /api/swimlanes/:id': updateSwimlane,
  'DELETE /api/swimlanes/:id': deleteSwimlane,

  'POST /api/swimlanes/:id/cards': createCard,
  'PATCH /api/cards/:id': updateCard,
  'DELETE /api/cards/:id': deleteCard,

  'GET /api/funnels/:id/inbox': listInbox,
  'POST /api/funnels/:id/inbox': createInboxCard,
  'POST /api/funnels/:id/inbox/suggest-groups': suggestGroupsHandler,
  'POST /api/funnels/:id/inbox/confirm-groups': confirmGroupsHandler
};
