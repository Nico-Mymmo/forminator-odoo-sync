/**
 * Webgedrag — INHAALRONDE voor conversies (2026-10-02).
 *
 * Elke inzending meldt zichzelf aan de tracker (reportWebConversion in
 * src/lib/web-conversions.js). Die melding mag de inzending nooit doen mislukken en
 * slikt dus elke fout in -- met als gevolg dat een melding die niet aankomt, stil
 * weg is. Dat gebeurde twee keer:
 *   - vóór 29-09-2026 bestond de melding nog niet: de popup op syndicoach.be draaide
 *     al sinds half september, maar geen enkele inzending ervan stond in D1;
 *   - tussen 29-09 en 03-10-2026 faalde elke melding (workers.dev in plaats van de
 *     service binding).
 * Deze ronde loopt elk uur mee met de matching (push.js): ze neemt de inzendingen
 * van de laatste dagen, bouwt per inzending EXACT dezelfde melding als de pipeline
 * (buildWebConversion + normalizeFormValues), rekent de id uit die de tracker eraan
 * zou geven (conversionEventId) en meldt enkel wat nog niet in D1 staat. Dubbel
 * melden kan dus niet: dezelfde inzending geeft dezelfde id.
 *
 * De eerste volledige ronde kijkt EERSTE_DAGEN terug (de popup en de inzendingen van
 * voor 29-09), daarna enkel de laatste DAGEN.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { readWebEvents } from '../../../lib/web-events.js';
import { buildWebConversion, conversionEventId, postConversion } from '../../../lib/web-conversions.js';
import { normalizeFormValues } from '../../forminator-sync-v2/worker-handler.js';

const KV_VOLLEDIG = 'webstory:conv_catchup_full';
const EERSTE_DAGEN = 60;
const DAGEN = 7;
const MAX_PER_RONDE = 200;
// Zelfde regel als de pipeline: een inzending van een koppeling die UIT stond
// ('received', skipPipeline) of een dubbel verzoek wordt niet gemeld.
const NIET_MELDEN = new Set(['received', 'duplicate_inflight']);

export async function catchUpConversions(env) {
  if (!env.WEB_CONVERSION_SECRET || !env.MAPPINGS_KV) return null;
  const volledig = await env.MAPPINGS_KV.get(KV_VOLLEDIG);
  const dagen = volledig ? DAGEN : EERSTE_DAGEN;
  const sinds = new Date(Date.now() - dagen * 86400000).toISOString();
  const sb = getSupabaseClient(env);

  // Oude replay-rijen (replay_of_submission_id) zijn een kopie van een andere
  // inzending met een eigen id: die melden zou dezelfde aanvraag twee keer tellen.
  const { data: subs, error } = await sb.from('fs_v2_submissions')
    .select('id, integration_id, source_payload, status, created_at')
    .gte('created_at', sinds).is('replay_of_submission_id', null)
    .order('created_at', { ascending: true }).limit(5000);
  if (error) throw new Error(`inzendingen: ${error.message}`);
  const lijst = subs || [];
  const ids = [...new Set(lijst.map(s => s.integration_id).filter(Boolean))];
  if (!ids.length) return { dagen, inzendingen: 0 };
  const { data: ints, error: e2 } = await sb.from('fs_v2_integrations').select('id, name, source_type, web_action').in('id', ids);
  if (e2) throw new Error(`koppelingen: ${e2.message}`);
  const perId = new Map((ints || []).map(i => [i.id, i]));

  const kandidaten = [];
  for (const s of lijst) {
    if (NIET_MELDEN.has(s.status)) continue;
    const integration = perId.get(s.integration_id);
    if (!integration) continue;
    const body = buildWebConversion({
      integration, normalizedForm: normalizeFormValues(s.source_payload), submissionId: s.id, receivedAt: s.created_at,
    });
    if (!body) continue;   // geen bezoeker-UUID: niets om te melden
    kandidaten.push({ body, id: await conversionEventId(body.ref) });
  }

  const bestaand = new Set();
  for (let i = 0; i < kandidaten.length; i += 90) {
    const part = kandidaten.slice(i, i + 90).map(k => k.id);
    const res = await readWebEvents(env, `SELECT id FROM events WHERE id IN (${part.map(() => '?').join(',')})`, part);
    for (const r of res.results || []) bestaand.add(r.id);
  }
  const ontbrekend = kandidaten.filter(k => !bestaand.has(k.id));
  let gemeld = 0, mislukt = 0;
  for (const k of ontbrekend.slice(0, MAX_PER_RONDE)) {
    if (await postConversion(env, k.body)) gemeld++; else mislukt++;
  }
  const rest = Math.max(0, ontbrekend.length - MAX_PER_RONDE);
  // Pas als alles van de eerste, lange ronde binnen is, naar het korte venster.
  if (!volledig && !rest && !mislukt) await env.MAPPINGS_KV.put(KV_VOLLEDIG, new Date().toISOString());
  return { dagen, inzendingen: lijst.length, met_bezoeker: kandidaten.length, ontbrekend: ontbrekend.length, gemeld, mislukt, rest };
}
