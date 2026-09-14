/**
 * Gmail → chatter — de opslag (Supabase).
 *
 * Twee tabellen, zie `supabase/migrations/20260914160000_gmail_chatter.sql`:
 * `gmail_sync_state` (hoe ver staan we per medewerker) en
 * `gmail_captured_messages` (één rij per bekeken bericht, en meteen de
 * idempotentiesleutel).
 */

import { getSupabaseClient } from '../../../lib/database.js';

export async function getSyncState(env, userEmail) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_sync_state')
    .select('*')
    .eq('user_email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`gmail_sync_state lezen mislukt: ${error.message}`);
  return data || null;
}

export async function saveSyncState(env, userEmail, { historyId, error: foutmelding = null, extraSeen = 0 }) {
  const supabase = getSupabaseClient(env);
  const huidig = await getSyncState(env, userEmail);
  const rij = {
    user_email: userEmail,
    history_id: historyId ?? huidig?.history_id ?? null,
    last_synced_at: new Date().toISOString(),
    last_error: foutmelding,
    messages_seen: Number(huidig?.messages_seen || 0) + Number(extraSeen || 0),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase
    .from('gmail_sync_state')
    .upsert(rij, { onConflict: 'user_email' });
  if (error) throw new Error(`gmail_sync_state schrijven mislukt: ${error.message}`);
}

/**
 * Welke van deze Gmail-berichten kennen we al?
 *
 * Dit is wat voorkomt dat een bericht twee keer in de chatter belandt — en het
 * scheelt bij elke ronde een metadata-call per al bekeken bericht.
 *
 * @returns {Promise<Set<string>>}
 */
export async function reedsGezien(env, messageIds) {
  if (!messageIds.length) return new Set();
  const supabase = getSupabaseClient(env);
  const gevonden = new Set();

  // In blokken: een `in`-filter met honderden waarden wordt een te lange URL.
  for (let i = 0; i < messageIds.length; i += 100) {
    const blok = messageIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from('gmail_captured_messages')
      .select('gmail_message_id')
      .in('gmail_message_id', blok);
    if (error) throw new Error(`gmail_captured_messages lezen mislukt: ${error.message}`);
    for (const r of data || []) gevonden.add(r.gmail_message_id);
  }
  return gevonden;
}

/**
 * Een eerder geplaatst bericht uit dezelfde draad zoeken.
 *
 * `messageIds` komt uit References/In-Reply-To. Vinden we daar een van terug,
 * dan weten we exact bij welke lead dit antwoord hoort — zonder te gokken op
 * een e-mailadres.
 */
export async function zoekDraadMatch(env, messageIds) {
  const kandidaten = (messageIds || []).filter(Boolean).slice(0, 50);
  if (!kandidaten.length) return null;

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_captured_messages')
    .select('odoo_model, odoo_res_id')
    .in('rfc822_message_id', kandidaten)
    .not('odoo_res_id', 'is', null)
    .order('internal_date', { ascending: false })
    .limit(1);
  if (error) throw new Error(`draadmatch zoeken mislukt: ${error.message}`);
  if (!data?.length) return null;

  return { model: data[0].odoo_model, res_id: data[0].odoo_res_id, method: 'draad' };
}

export async function bewaarBericht(env, rij) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase
    .from('gmail_captured_messages')
    .upsert(rij, { onConflict: 'gmail_message_id' });
  if (error) throw new Error(`bericht bewaren mislukt: ${error.message}`);
}

/** De werklijst: wat we niet konden plaatsen. */
export async function nietGeplaatst(env, limit = 100) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_captured_messages')
    .select('*')
    .in('status', ['unmatched', 'failed'])
    .order('internal_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`werklijst lezen mislukt: ${error.message}`);
  return data || [];
}
