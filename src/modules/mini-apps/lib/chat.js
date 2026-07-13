/**
 * Mini-Apps — Google Chat (kanalen via incoming webhook)
 *
 * Fase 1 van Chat-integratie: berichten naar een geregistreerd KANAAL
 * (Google Chat space) via een incoming webhook. Geen service-account, geen
 * domain-wide delegation nodig -- volledig los van de Gmail-notify-feature.
 * Rechtstreekse 1-op-1 DM's naar een specifieke persoon zitten hier NIET in
 * -- dat vereist een geregistreerde Chat-app + een nieuwe delegatie-scope,
 * een apart traject (zie overleg in de mini-apps-module-documentatie).
 *
 * Guardrails:
 *  - Een mini-app kent een kanaal ALTIJD enkel via zijn (niet-geheim) id --
 *    de webhook_url wordt nooit teruggegeven aan de client, ook niet in de
 *    kanalenlijst.
 *  - webhook_url wordt bij registratie gevalideerd op het exacte
 *    chat.googleapis.com/v1/spaces/-formaat (ook een DB-CHECK-constraint,
 *    zie migratie) -- voorkomt misbruik als generieke HTTP-relay.
 *  - Bericht-lengte-cap, rate-limits per app per dag EN per (app, kanaal) per
 *    dag, automatische attributie-voettekst, volledige audit-log.
 */

import { getSupabaseClient } from '../../../lib/database.js';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_PER_APP_PER_DAY = 100;
export const MAX_PER_CHANNEL_PER_APP_PER_DAY = 20;

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_URL_PREFIX = 'https://chat.googleapis.com/v1/spaces/';

function chatError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Registreert een nieuw kanaal. De webhook-URL wordt gevalideerd (moet een
 * echte Google Chat-webhook zijn) en daarna nooit meer teruggegeven.
 *
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function registerChannel(env, userId, name, webhookUrl) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) {
    throw chatError('Naam is verplicht en max 100 tekens.', 'INVALID_NAME');
  }
  if (typeof webhookUrl !== 'string' || !webhookUrl.startsWith(WEBHOOK_URL_PREFIX)) {
    throw chatError(
      `Webhook-URL moet beginnen met ${WEBHOOK_URL_PREFIX} -- kopieer de URL uit Google Chat (ruimte-titel -> Apps en integraties -> Webhooks).`,
      'INVALID_WEBHOOK_URL'
    );
  }

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('mini_app_chat_channels')
    .insert({ name: name.trim(), webhook_url: webhookUrl.trim(), created_by_user_id: userId })
    .select('id, name')
    .single();

  if (error) {
    if (error.code === '23505') { // unique_violation op name
      throw chatError('Er bestaat al een kanaal met deze naam.', 'DUPLICATE_NAME');
    }
    throw new Error(error.message);
  }
  return data;
}

/**
 * Lijst van kanalen -- ENKEL id + naam, nooit de webhook-URL.
 */
export async function listChannels(env) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('mini_app_chat_channels')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Verwijdert een kanaal (elke module-gebruiker mag dit -- zelfde
 * laagdrempelige trust-niveau als de rest van de module; wie de webhook per
 * ongeluk verkeerd plakte kan het gewoon opnieuw registreren).
 */
export async function deleteChannel(env, channelId) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase.from('mini_app_chat_channels').delete().eq('id', channelId);
  if (error) throw new Error(error.message);
}

async function getChannel(env, channelId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('mini_app_chat_channels')
    .select('id, name, webhook_url')
    .eq('id', channelId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw chatError('Kanaal niet gevonden.', 'CHANNEL_NOT_FOUND');
  return data;
}

async function checkRateLimit(env, appId, channelId) {
  const supabase = getSupabaseClient(env);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count: appCount, error: appErr } = await supabase
    .from('mini_app_chat_log')
    .select('id', { count: 'exact', head: true })
    .eq('mini_app_id', appId)
    .gte('created_at', since);
  if (appErr) throw new Error(appErr.message);
  if ((appCount || 0) >= MAX_PER_APP_PER_DAY) {
    throw chatError(`Deze app heeft de daglimiet van ${MAX_PER_APP_PER_DAY} chatberichten bereikt.`, 'RATE_LIMIT_APP');
  }

  const { count: channelCount, error: chanErr } = await supabase
    .from('mini_app_chat_log')
    .select('id', { count: 'exact', head: true })
    .eq('mini_app_id', appId)
    .eq('channel_id', channelId)
    .gte('created_at', since);
  if (chanErr) throw new Error(chanErr.message);
  if ((channelCount || 0) >= MAX_PER_CHANNEL_PER_APP_PER_DAY) {
    throw chatError(
      `Deze app heeft de daglimiet van ${MAX_PER_CHANNEL_PER_APP_PER_DAY} berichten naar dit kanaal bereikt.`,
      'RATE_LIMIT_CHANNEL'
    );
  }
}

async function logMessage(env, { appId, channelId, senderUserId, status, errorMessage }) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase.from('mini_app_chat_log').insert({
    mini_app_id: appId,
    channel_id: channelId,
    sender_user_id: senderUserId,
    status,
    error_message: errorMessage || null
  });
  if (error) console.error('[mini-apps] chat audit-log insert failed:', error.message);
}

/**
 * Verstuurt een bericht naar een geregistreerd kanaal.
 *
 * @param {Object} env
 * @param {Object} app     Volledige mini_apps-rij (voor app.title in de voettekst)
 * @param {Object} sender  Huidige gebruiker (context.user)
 * @param {string} channelId
 * @param {string} message
 */
export async function sendChannelMessage(env, app, sender, channelId, message) {
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    throw chatError(`Bericht is verplicht en max ${MAX_MESSAGE_LENGTH} tekens.`, 'INVALID_MESSAGE');
  }
  if (typeof channelId !== 'string' || !channelId.trim()) {
    throw chatError('channelId is verplicht.', 'INVALID_CHANNEL');
  }

  const channel = await getChannel(env, channelId.trim());
  await checkRateLimit(env, app.id, channel.id);

  const senderName = sender.username || sender.email;
  const text =
    `${message.trim()}\n\n` +
    `_Automatisch bericht van de mini-app "${app.title}", verstuurd via de Operations Manager op initiatief van ${senderName}._`;

  try {
    const resp = await fetch(channel.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text })
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Chat webhook failed (${resp.status}): ${body}`);
    }
  } catch (err) {
    await logMessage(env, { appId: app.id, channelId: channel.id, senderUserId: sender.id, status: 'failed', errorMessage: err.message });
    throw err;
  }

  await logMessage(env, { appId: app.id, channelId: channel.id, senderUserId: sender.id, status: 'sent' });
  return { channelName: channel.name };
}
