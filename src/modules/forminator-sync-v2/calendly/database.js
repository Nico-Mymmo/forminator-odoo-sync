/**
 * Koppelingen — Calendly: de twee database-vragen die alleen deze bron heeft.
 *
 *  1. Welke webhook-subscription is er aangemeld, en met welke signing key?
 *  2. Welke koppeling hoort bij het eventtype van deze boeking?
 *
 * Al de rest (koppelingen, stappen, indieningen) loopt via de gedeelde
 * database.js van de module; hier komt bewust geen tweede kopie van.
 */

import { getSupabaseClient } from '../../../lib/database.js';

const TABEL = 'fs_v2_calendly_subscriptions';
const KOPPELINGEN = 'fs_v2_integrations';

function db(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return getSupabaseClient(env);
}

/** De subscription waarop we nu boekingen verwachten. Hoogstens één actief. */
export async function getActiveCalendlySubscription(env) {
  const { data, error } = await db(env)
    .from(TABEL)
    .select('*')
    .eq('state', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to read Calendly subscription: ${error.message}`);
  return (data && data[0]) || null;
}

/**
 * Alle subscriptions, nieuwste eerst -- inclusief de met pensioen gestuurde.
 *
 * Die oude rijen zijn geen archief voor de sier: bij het opnieuw aanmelden
 * kunnen er nog bezorgingen onderweg zijn die met de VORIGE sleutel ondertekend
 * zijn. Zou de verificatie enkel de actieve sleutel proberen, dan verdwijnen
 * die boekingen stil met een 401 op een moment dat niemand kijkt.
 */
export async function listCalendlySubscriptions(env, { limit = 10 } = {}) {
  const { data, error } = await db(env)
    .from(TABEL)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list Calendly subscriptions: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

export async function insertCalendlySubscription(env, rij) {
  const { data, error } = await db(env)
    .from(TABEL)
    .insert(rij)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to store Calendly subscription: ${error.message}`);
  return data;
}

export async function retireCalendlySubscriptions(env) {
  const { error } = await db(env)
    .from(TABEL)
    .update({ state: 'retired', retired_at: new Date().toISOString() })
    .eq('state', 'active');
  if (error) throw new Error(`Failed to retire Calendly subscriptions: ${error.message}`);
  return true;
}

export async function listCalendlyIntegrations(env) {
  const { data, error } = await db(env)
    .from(KOPPELINGEN)
    .select('*')
    .eq('source_type', 'calendly')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list Calendly integrations: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

/**
 * De koppeling vinden die deze boeking hoort te verwerken.
 *
 * Eerst een koppeling die exact op dit eventtype staat; anders de VANGNET-
 * koppeling (calendly_event_type_uri leeg), die alles opvangt waarvoor geen
 * eigen koppeling bestaat. Zijn er meerdere kandidaten, dan wint de oudste --
 * een willekeurige keuze zou betekenen dat dezelfde boeking vandaag in Odoo
 * staat en morgen niet.
 *
 * Geeft null als niets past. Dat is GEEN fout: er mogen eventtypes in Calendly
 * staan die de OM bewust niet volgt.
 */
export async function findCalendlyIntegrationForEventType(env, eventTypeUri) {
  const koppelingen = await listCalendlyIntegrations(env);
  if (!koppelingen.length) return null;

  const uri = String(eventTypeUri || '').trim();
  if (uri) {
    const exact = koppelingen.find((k) => String(k.calendly_event_type_uri || '').trim() === uri);
    if (exact) return exact;
  }

  return koppelingen.find((k) => !String(k.calendly_event_type_uri || '').trim()) || null;
}
