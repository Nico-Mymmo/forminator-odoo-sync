/**
 * Mini-Apps — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET    /                          → Full-page UI (public/mini-apps.html)
 *
 *  API (authenticated — iedereen met module-toegang)
 *    GET    /api/apps                  → Lijst apps die de user mag zien
 *    POST   /api/apps                  → Upload nieuwe mini-app (multipart)
 *    GET    /api/apps/colleagues       → Lijst actieve gebruikers (share-picker)
 *    GET    /api/apps/:id              → Metadata van één app
 *    GET    /api/apps/:id/content      → HTML-inhoud van één app
 *    PUT    /api/apps/:id              → Metadata bijwerken (owner only)
 *    PUT    /api/apps/:id/content      → HTML-inhoud bijwerken — "tweaken" (owner only)
 *    DELETE /api/apps/:id              → App verwijderen (owner only)
 *    PUT    /api/apps/:id/favorite     → Favoriet markeren (view-only volstaat)
 *    DELETE /api/apps/:id/favorite     → Favoriet verwijderen
 *    GET    /api/apps/:id/storage      → Gedeelde key-value opslag ophalen (view-toegang)
 *    GET    /api/apps/:id/storage/:key → Eén key ophalen (view-toegang)
 *    PUT    /api/apps/:id/storage/:key → Eén key/value zetten (view-toegang, quota's zie lib/storage.js)
 *    DELETE /api/apps/:id/storage/:key → Eén key verwijderen (view-toegang)
 *    GET    /api/apps/:id/storage-usage                    → Quotum-overzicht (view-toegang)
 *    GET    /api/apps/:id/storage/collections/:collection  → Items van een collection ophalen (view-toegang)
 *    POST   /api/apps/:id/storage/collections/:collection  → Item toevoegen, server genereert id (view-toegang)
 *    PUT    /api/apps/:id/storage/collections/:collection/:itemId → Item in-place wijzigen (view-toegang)
 *    DELETE /api/apps/:id/storage/collections/:collection/:itemId → Item verwijderen (view-toegang)
 *    POST   /api/apps/:id/notify                          → Mail sturen naar zichzelf/een collega (view-toegang, guardrails zie lib/notify.js)
 *    GET    /api/apps/:id/mail-subscription               → Ben ik ingeschreven voor mails van deze app? (view-toegang)
 *    PUT    /api/apps/:id/mail-subscription               → In-/uitschrijven (view-toegang, enkel voor jezelf)
 *    GET    /api/apps/chat-channels                       → Lijst Chat-kanalen (id+naam, nooit de webhook-URL)
 *    POST   /api/apps/chat-channels                       → Nieuw kanaal registreren (naam + webhook-URL) -- ADMIN-ONLY
 *    DELETE /api/apps/chat-channels/:channelId             → Kanaal verwijderen -- ADMIN-ONLY
 *    POST   /api/apps/:id/chat-send                        → Bericht naar een kanaal sturen (view-toegang, guardrails zie lib/chat.js)
 *    GET    /api/apps/:id/schedules                        → Geplande taken van deze app (view-toegang, iedereen ziet alle taken)
 *    POST   /api/apps/:id/schedules                        → Nieuwe geplande taak aanmaken (view-toegang, zie lib/scheduler.js)
 *    PUT    /api/apps/:id/schedules/:scheduleId             → Taak bewerken (aanmaker of app-eigenaar)
 *    DELETE /api/apps/:id/schedules/:scheduleId             → Taak verwijderen (aanmaker of app-eigenaar)
 *    POST   /api/apps/:id/schedules/:scheduleId/run-now     → Taak nu al eens testen (aanmaker of app-eigenaar)
 *    GET    /api/apps/:id/condition-tasks                       → Criteria-taken van deze app (view-toegang, iedereen ziet alle taken)
 *    POST   /api/apps/:id/condition-tasks                       → Nieuwe criteria-taak aanmaken (view-toegang, zie lib/condition-scheduler.js)
 *    PUT    /api/apps/:id/condition-tasks/:taskId                → Taak bewerken (aanmaker of app-eigenaar)
 *    DELETE /api/apps/:id/condition-tasks/:taskId                → Taak verwijderen (aanmaker of app-eigenaar)
 *    POST   /api/apps/:id/condition-tasks/:taskId/run-now         → Taak nu al eens testen -- forceert de send, ongeacht edge-triggering (aanmaker of app-eigenaar)
 *
 * ─── Rechten ─────────────────────────────────────────────────────────────────
 *
 *  Zien/draaien: eigenaar, of visibility='shared' (iedereen), of
 *  visibility='specific' + user staat in shared_user_ids.
 *  Tweaken/beheren: uitsluitend de eigenaar (zie permissions.js).
 *  Gedeelde opslag (/storage): lezen én schrijven volstaat met view-toegang —
 *  bewust geen owner-only, want het doel is state delen tussen alle gebruikers
 *  van de app (zie lib/storage.js voor quota's). Opslag zelf staat in R2,
 *  niet in Supabase (zie lib/storage.js voor de motivatie: groter quotum
 *  per app, geen druk op de 500 MB gratis Supabase-databaseopslag).
 *  Collections (/storage/collections/:collection): elk item is een eigen
 *  R2-object met een server-gegenereerde id, zodat gelijktijdige
 *  toevoegingen door verschillende gebruikers nooit botsen.
 *  Notify (/notify): view-toegang volstaat om te TRIGGEREN, maar de
 *  ontvanger wordt altijd server-side herleid via de users-tabel (self of
 *  een actieve collega-id) -- een app kan zelf nooit een e-mailadres
 *  opgeven. Zie lib/notify.js voor rate-limits en de audit-log.
 *  Chat-kanalen: registreren/verwijderen is ADMIN-ONLY (user.role ===
 *  'admin'); de lijst ophalen en berichten sturen mag elke module-gebruiker
 *  (view-toegang volstaat voor het sturen) -- de webhook-URL zelf verlaat de
 *  server nooit (zie lib/chat.js).
 *  Geplande taken (/schedules): view-toegang volstaat om een eigen taak aan
 *  te maken en de volledige lijst van de app te zien (transparantie -- geen
 *  dubbele dagelijkse posts); bewerken/verwijderen/testen is voorbehouden
 *  aan de aanmaker OF de app-eigenaar. De cron (runDueScheduledTasks, zie
 *  lib/scheduler.js + src/index.js#scheduled()) verstuurt via de bestaande
 *  notifyUser()/sendChannelMessage() -- dus dezelfde rate-limits/audit als
 *  een interactieve send, enkel tijd-gebaseerd getriggerd i.p.v. een klik.
 *  Criteria-taken (/condition-tasks): zelfde rechtenmodel als geplande taken
 *  hierboven, maar BEWUST een aparte tabel/cron/lib-bestand (lib/condition-
 *  scheduler.js, eigen "*\/5 * * * *"-cron-tak in src/index.js#scheduled()) --
 *  stuurt wanneer een data-voorwaarde in de eigen sharedStorage overgaat van
 *  niet-waar naar waar (edge-triggered), niet op een vast tijdstip.
 */

import { getSupabaseClient } from '../../lib/database.js';
import { putAppContent, getAppContent, deleteAppContent } from './lib/r2-client.js';
import { canView, canEdit, normalizeSharedUserIds } from './permissions.js';
import {
  listStorage, getStorageValue, setStorageValue, deleteStorageValue,
  listCollectionItems, addCollectionItem, updateCollectionItem, removeCollectionItem, getStorageUsage,
  deleteAllStorage
} from './lib/storage.js';
import { notifyUser, isSubscribed, setSubscription } from './lib/notify.js';
import { registerChannel, listChannels, deleteChannel, sendChannelMessage } from './lib/chat.js';
import { validateTaskPayload, MAX_TASKS_PER_APP, computeNextRun, runTaskNow } from './lib/scheduler.js';
import { validateConditionTaskPayload, MAX_CONDITION_TASKS_PER_APP, runConditionTaskNow } from './lib/condition-scheduler.js';

const LOG_PREFIX = '[mini-apps]';

export const MAX_APP_BYTES = 2 * 1024 * 1024; // 2 MB — ruim voldoende voor single-file HTML/JS/CSS

const SELECT_FIELDS = 'id, title, description, owner_user_id, visibility, shared_user_ids, size_bytes, version, created_at, updated_at, icon';

// ─── Response helpers ────────────────────────────────────────────────────────

function jsonOk(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function jsonError(message, status = 500, code = undefined) {
  return new Response(JSON.stringify({ success: false, error: message, ...(code ? { code } : {}) }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const VALID_VISIBILITIES = ['private', 'shared', 'specific'];

// Lucide-iconnamen die de eigenaar mag kiezen in de Instellingen-tab (dropdown).
// Moet in sync blijven met ICON_OPTIONS in public/mini-apps.js (daar staan ook
// de Nederlandse labels bij). Vrije DB-kolom, maar hier hard gevalideerd zodat
// er nooit een willekeurige string in de HTML-attributen (kaart, navbar) belandt.
const VALID_ICONS = [
  'puzzle', 'calculator', 'wrench', 'gauge', 'file-text', 'table', 'list-checks',
  'clipboard-list', 'dollar-sign', 'percent', 'clock', 'calendar', 'map', 'image',
  'qr-code', 'hash', 'ruler', 'scale', 'banknote', 'receipt', 'timer', 'hourglass',
  'sparkles', 'wand-2', 'package', 'box', 'folder', 'link', 'globe', 'mail', 'phone',
  'users', 'building-2', 'briefcase', 'tag', 'gift', 'lightbulb', 'flask-conical',
  'code', 'terminal', 'database', 'bar-chart-2', 'pie-chart', 'trending-up',
  'shopping-cart', 'truck', 'file-spreadsheet', 'clipboard-check'
];

function looksLikeHtml(file) {
  const name = (file?.name || '').toLowerCase();
  const type = (file?.type || '').toLowerCase();
  return name.endsWith('.html') || name.endsWith('.htm') || type.includes('html') || type.startsWith('text/');
}

// Een mini-app is ÉÉN zelfstandig .html-bestand (zie BUILD_PROMPT in
// public/mini-apps.js) -- er is geen opslag/serving voor bijkomende .js/.css-
// bestanden (r2-client.js slaat exact één blob per app op). Een <script src="app.js">
// of <link href="style.css"> naar een RELATIEF pad kan dus nooit werken in de
// sandbox-iframe (altijd een 404) -- dit vangen we hier af, vóór opslag, i.p.v.
// pas achteraf via een cryptische foutmelding in de iframe. CDN-links
// (https://..., protocol-relative //..., data:-URI's) blijven gewoon toegestaan.
const RELATIVE_ASSET_RE = /<(script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;

function findRelativeAssetReferences(html) {
  const offenders = new Set();
  let m;
  RELATIVE_ASSET_RE.lastIndex = 0;
  while ((m = RELATIVE_ASSET_RE.exec(html)) !== null) {
    const url = m[2].trim();
    if (!url) continue;
    if (/^(https?:)?\/\//i.test(url) || /^data:/i.test(url)) continue; // absoluut/CDN/data-uri -- geen probleem
    offenders.add(url);
  }
  return Array.from(offenders);
}

/**
 * Haalt owner-namen op voor een set apps en plakt ze erbij als `ownerName`.
 * Losse query i.p.v. een embedded relationship-select — voorkomt afhankelijkheid
 * van de exacte (auto-gegenereerde) FK-constraintnaam in Supabase.
 */
async function attachOwnerNames(supabase, apps) {
  const ownerIds = Array.from(new Set(apps.map(a => a.owner_user_id)));
  if (ownerIds.length === 0) return apps;

  const { data: owners } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', ownerIds);

  const ownerMap = new Map((owners || []).map(o => [o.id, o.full_name || o.email]));
  return apps.map(a => ({ ...a, ownerName: ownerMap.get(a.owner_user_id) || 'Onbekend' }));
}

/**
 * Haalt de set mini_app_id's op die deze user als favoriet heeft gemarkeerd.
 */
async function getFavoriteAppIds(supabase, userId) {
  const { data } = await supabase
    .from('mini_app_favorites')
    .select('mini_app_id')
    .eq('user_id', userId);
  return new Set((data || []).map(r => r.mini_app_id));
}

/**
 * Voegt weergavenamen toe aan een lijst geplande taken: naam van de collega
 * (bij target_type='colleague') of het kanaal (bij 'channel'), en de naam
 * van de aanmaker. Losse queries i.p.v. een join -- zelfde reden als
 * attachOwnerNames hierboven (geen afhankelijkheid van FK-constraintnamen).
 */
async function attachScheduleDisplayNames(supabase, env, tasks) {
  if (tasks.length === 0) return tasks;

  const creatorIds = Array.from(new Set(tasks.map(t => t.created_by_user_id)));
  const colleagueIds = Array.from(new Set(tasks.filter(t => t.target_type === 'colleague').map(t => t.target_user_id)));
  const userIds = Array.from(new Set([...creatorIds, ...colleagueIds]));

  const [usersResult, channels] = await Promise.all([
    userIds.length > 0
      ? supabase.from('users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
    tasks.some(t => t.target_type === 'channel') ? listChannels(env) : Promise.resolve([])
  ]);

  const userMap = new Map((usersResult.data || []).map(u => [u.id, u.full_name || u.email]));
  const channelMap = new Map((channels || []).map(c => [c.id, c.name]));

  return tasks.map(t => ({
    ...t,
    createdByName: userMap.get(t.created_by_user_id) || 'Onbekend',
    targetColleagueName: t.target_type === 'colleague' ? (userMap.get(t.target_user_id) || 'Onbekend') : null,
    targetChannelName: t.target_type === 'channel' ? (channelMap.get(t.target_channel_id) || 'Onbekend') : null
  }));
}

/**
 * Zelfde als attachScheduleDisplayNames hierboven, maar voor criteria-taken
 * (mini_app_condition_tasks) -- eigen functie i.p.v. hergebruik omdat de
 * twee tabellen bewust gescheiden blijven (zie routes.js-doc bovenaan).
 */
async function attachConditionTaskDisplayNames(supabase, env, tasks) {
  if (tasks.length === 0) return tasks;

  const creatorIds = Array.from(new Set(tasks.map(t => t.created_by_user_id)));
  const colleagueIds = Array.from(new Set(tasks.filter(t => t.target_type === 'colleague').map(t => t.target_user_id)));
  const userIds = Array.from(new Set([...creatorIds, ...colleagueIds]));

  const [usersResult, channels] = await Promise.all([
    userIds.length > 0
      ? supabase.from('users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
    tasks.some(t => t.target_type === 'channel') ? listChannels(env) : Promise.resolve([])
  ]);

  const userMap = new Map((usersResult.data || []).map(u => [u.id, u.full_name || u.email]));
  const channelMap = new Map((channels || []).map(c => [c.id, c.name]));

  return tasks.map(t => ({
    ...t,
    createdByName: userMap.get(t.created_by_user_id) || 'Onbekend',
    targetColleagueName: t.target_type === 'colleague' ? (userMap.get(t.target_user_id) || 'Onbekend') : null,
    targetChannelName: t.target_type === 'channel' ? (channelMap.get(t.target_channel_id) || 'Onbekend') : null
  }));
}

/**
 * Haalt app + taak op en doet de basischecks (bestaan, taak hoort bij deze
 * app) -- gedeeld door PUT/DELETE/run-now. Rechten-check (aanmaker/eigenaar)
 * gebeurt in de aanroepende route zelf, niet hier.
 */
async function fetchAppAndTask(supabase, params) {
  const { data: app, error: appErr } = await supabase
    .from('mini_apps').select(SELECT_FIELDS).eq('id', params.id).maybeSingle();
  if (appErr) return { errorResponse: jsonError('App ophalen mislukt.', 500) };
  if (!app) return { errorResponse: jsonError('App niet gevonden.', 404) };

  const { data: task, error: taskErr } = await supabase
    .from('mini_app_scheduled_tasks').select('*').eq('id', params.scheduleId).maybeSingle();
  if (taskErr) return { errorResponse: jsonError('Taak ophalen mislukt.', 500) };
  if (!task || task.mini_app_id !== app.id) return { errorResponse: jsonError('Taak niet gevonden.', 404) };

  return { app, task };
}

/**
 * Zelfde als fetchAppAndTask hierboven, maar voor een criteria-taak
 * (mini_app_condition_tasks) -- params.taskId i.p.v. params.scheduleId.
 */
async function fetchAppAndConditionTask(supabase, params) {
  const { data: app, error: appErr } = await supabase
    .from('mini_apps').select(SELECT_FIELDS).eq('id', params.id).maybeSingle();
  if (appErr) return { errorResponse: jsonError('App ophalen mislukt.', 500) };
  if (!app) return { errorResponse: jsonError('App niet gevonden.', 404) };

  const { data: task, error: taskErr } = await supabase
    .from('mini_app_condition_tasks').select('*').eq('id', params.taskId).maybeSingle();
  if (taskErr) return { errorResponse: jsonError('Taak ophalen mislukt.', 500) };
  if (!task || task.mini_app_id !== app.id) return { errorResponse: jsonError('Taak niet gevonden.', 404) };

  return { app, task };
}

/**
 * Valideert dat het opgegeven target (collega/kanaal) echt bestaat -- zelfde
 * soort server-side herleiding als notify.js/chat.js bij het effectief
 * versturen, maar hier al bij aanmaken/bewerken zodat de gebruiker meteen
 * een duidelijke foutmelding krijgt i.p.v. pas bij de volgende cron-run.
 */
async function validateTarget(supabase, env, body) {
  if (body.targetType === 'colleague') {
    const { data: colleague, error } = await supabase
      .from('users').select('id, is_active').eq('id', body.targetUserId).maybeSingle();
    if (error) return jsonError('Collega ophalen mislukt.', 500);
    if (!colleague || !colleague.is_active) return jsonError('Onbekende of inactieve collega.', 400, 'INVALID_RECIPIENT');
  }
  if (body.targetType === 'channel') {
    const channels = await listChannels(env);
    if (!channels.some(c => c.id === body.targetChannelId)) {
      return jsonError('Onbekend Chat-kanaal.', 400, 'INVALID_CHANNEL');
    }
  }
  return null;
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export const routes = {

  // ── UI ────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    return context.env.ASSETS.fetch(new Request(new URL('/mini-apps.html', context.request.url)));
  },

  // ── Lijst ─────────────────────────────────────────────────────────────────
  'GET /api/apps': async ({ env, user }) => {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .or(`owner_user_id.eq.${user.id},visibility.eq.shared,shared_user_ids.cs.{${user.id}}`)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(`${LOG_PREFIX} list error:`, error.message);
      return jsonError('Lijst ophalen mislukt.', 500);
    }

    const [withOwners, favoriteIds] = await Promise.all([
      attachOwnerNames(supabase, data || []),
      getFavoriteAppIds(supabase, user.id)
    ]);
    return jsonOk(withOwners.map(a => ({
      ...a,
      isOwner: a.owner_user_id === user.id,
      isFavorite: favoriteIds.has(a.id)
    })));
  },

  // ── Collega's voor share-picker ──────────────────────────────────────────
  'GET /api/apps/colleagues': async ({ env, user }) => {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .neq('id', user.id)
      .order('full_name', { ascending: true });

    if (error) {
      console.error(`${LOG_PREFIX} colleagues error:`, error.message);
      return jsonError('Gebruikerslijst ophalen mislukt.', 500);
    }

    return jsonOk(data || []);
  },

  // ── Mail-abonnement — status opvragen (view-toegang volstaat) ──────
  'GET /api/apps/:id/mail-subscription': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      const subscribed = await isSubscribed(env, app.id, user.id);
      return jsonOk({ subscribed });
    } catch (err) {
      console.error(`${LOG_PREFIX} mail-subscription get error:`, err.message);
      return jsonError('Ophalen mislukt.', 500);
    }
  },

  // ── Mail-abonnement — in-/uitschrijven, enkel voor jezelf ───────────
  'PUT /api/apps/:id/mail-subscription': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }
    if (typeof body.subscribed !== 'boolean') {
      return jsonError('subscribed (boolean) is verplicht.', 400);
    }

    try {
      await setSubscription(env, app.id, user.id, body.subscribed);
      console.log(`${LOG_PREFIX} MAIL SUBSCRIPTION ${app.id} -> ${body.subscribed} — user ${user.id}`);
      return jsonOk({ subscribed: body.subscribed });
    } catch (err) {
      console.error(`${LOG_PREFIX} mail-subscription set error:`, err.message);
      return jsonError('Bijwerken mislukt.', 500);
    }
  },

  // ── Chat-kanalen — lijst (id + naam, nooit de webhook-URL) ──────────
  'GET /api/apps/chat-channels': async ({ env }) => {
    try {
      const channels = await listChannels(env);
      return jsonOk(channels);
    } catch (err) {
      console.error(`${LOG_PREFIX} chat-channels list error:`, err.message);
      return jsonError('Kanalenlijst ophalen mislukt.', 500);
    }
  },

  // ── Chat-kanalen — registreren ───────────────────────────────────────
  'POST /api/apps/chat-channels': async ({ request, env, user }) => {
    if (user.role !== 'admin') {
      return jsonError('Enkel een admin mag Chat-kanalen koppelen.', 403, 'FORBIDDEN');
    }

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      const channel = await registerChannel(env, user.id, body.name, body.webhookUrl);
      console.log(`${LOG_PREFIX} CHAT CHANNEL CREATE ${channel.id} — user ${user.id}`);
      return jsonOk(channel);
    } catch (err) {
      const status = err.code ? 400 : 500;
      console.error(`${LOG_PREFIX} chat-channel create error:`, err.message);
      return jsonError(err.message, status, err.code);
    }
  },

  // ── Chat-kanalen — verwijderen ───────────────────────────────────────
  'DELETE /api/apps/chat-channels/:channelId': async ({ env, user, params }) => {
    if (user.role !== 'admin') {
      return jsonError('Enkel een admin mag Chat-kanalen verwijderen.', 403, 'FORBIDDEN');
    }

    try {
      await deleteChannel(env, params.channelId);
    } catch (err) {
      console.error(`${LOG_PREFIX} chat-channel delete error:`, err.message);
      return jsonError('Verwijderen mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} CHAT CHANNEL DELETE ${params.channelId} — user ${user.id}`);
    return jsonOk({ id: params.channelId });
  },

  // ── Geplande taken — lijst (view-toegang; iedereen ziet alle taken van de
  // app zodat je geen dubbele dagelijkse post aanmaakt -- bewerken/
  // verwijderen/testen blijft voorbehouden aan de aanmaker of de eigenaar) ──
  'GET /api/apps/:id/schedules': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: appErr } = await supabase
      .from('mini_apps').select(SELECT_FIELDS).eq('id', params.id).maybeSingle();
    if (appErr) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const { data: tasks, error } = await supabase
      .from('mini_app_scheduled_tasks')
      .select('id, name, is_active, recurrence, delivery_method, target_type, target_user_id, target_channel_id, subject_template, message_template, next_run_at, last_run_at, last_run_status, last_run_error, created_by_user_id, created_at, updated_at')
      .eq('mini_app_id', app.id)
      .order('created_at', { ascending: true });
    if (error) {
      console.error(`${LOG_PREFIX} schedules list error:`, error.message);
      return jsonError('Lijst ophalen mislukt.', 500);
    }

    const enriched = await attachScheduleDisplayNames(supabase, env, tasks || []);
    return jsonOk(enriched.map(t => ({
      ...t,
      isMine: t.created_by_user_id === user.id,
      canManage: t.created_by_user_id === user.id || canEdit(app, user)
    })));
  },

  // ── Geplande taken — aanmaken (view-toegang; elke viewer mag zijn eigen
  // taak aanmaken; ontvanger/kanaal wordt server-side herleid/gevalideerd) ─
  'POST /api/apps/:id/schedules': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: appErr } = await supabase
      .from('mini_apps').select(SELECT_FIELDS).eq('id', params.id).maybeSingle();
    if (appErr) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      validateTaskPayload(body);
    } catch (err) {
      return jsonError(err.message, 400, err.code);
    }

    const targetErr = await validateTarget(supabase, env, body);
    if (targetErr) return targetErr;

    const { count, error: countErr } = await supabase
      .from('mini_app_scheduled_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('mini_app_id', app.id);
    if (countErr) return jsonError('Taken tellen mislukt.', 500);
    if ((count || 0) >= MAX_TASKS_PER_APP) {
      return jsonError(`Maximum aantal geplande taken per app (${MAX_TASKS_PER_APP}) bereikt.`, 400, 'TOO_MANY_TASKS');
    }

    let nextRunAt;
    try {
      nextRunAt = computeNextRun(body.recurrence, new Date());
    } catch (err) {
      return jsonError(err.message, 400, err.code);
    }

    const { data: created, error } = await supabase
      .from('mini_app_scheduled_tasks')
      .insert({
        mini_app_id: app.id,
        created_by_user_id: user.id,
        name: body.name.trim(),
        recurrence: body.recurrence,
        delivery_method: body.deliveryMethod,
        target_type: body.targetType,
        target_user_id: body.targetType === 'colleague' ? body.targetUserId : null,
        target_channel_id: body.targetType === 'channel' ? body.targetChannelId : null,
        subject_template: body.deliveryMethod === 'mail' ? body.subjectTemplate.trim() : null,
        message_template: body.messageTemplate.trim(),
        next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
        is_active: true
      })
      .select('id, name, is_active, recurrence, delivery_method, target_type, target_user_id, target_channel_id, subject_template, message_template, next_run_at, created_by_user_id, created_at, updated_at')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} schedule create error:`, error.message);
      return jsonError('Aanmaken mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} SCHEDULE CREATE ${created.id} (app ${app.id}) — user ${user.id}`);
    return jsonOk(created);
  },

  // ── Geplande taken — bewerken (aanmaker of app-eigenaar) ────────────────
  'PUT /api/apps/:id/schedules/:scheduleId': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { app, task, errorResponse } = await fetchAppAndTask(supabase, params);
    if (errorResponse) return errorResponse;
    if (!(task.created_by_user_id === user.id || canEdit(app, user))) {
      return jsonError('Enkel de aanmaker of de app-eigenaar mag deze taak bewerken.', 403, 'FORBIDDEN');
    }

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      validateTaskPayload(body);
    } catch (err) {
      return jsonError(err.message, 400, err.code);
    }
    const targetErr = await validateTarget(supabase, env, body);
    if (targetErr) return targetErr;

    const isActive = typeof body.isActive === 'boolean' ? body.isActive : task.is_active;
    let nextRunAt = null;
    if (isActive) {
      try {
        nextRunAt = computeNextRun(body.recurrence, new Date());
      } catch (err) {
        return jsonError(err.message, 400, err.code);
      }
    }

    const { data: updated, error } = await supabase
      .from('mini_app_scheduled_tasks')
      .update({
        name: body.name.trim(),
        recurrence: body.recurrence,
        delivery_method: body.deliveryMethod,
        target_type: body.targetType,
        target_user_id: body.targetType === 'colleague' ? body.targetUserId : null,
        target_channel_id: body.targetType === 'channel' ? body.targetChannelId : null,
        subject_template: body.deliveryMethod === 'mail' ? body.subjectTemplate.trim() : null,
        message_template: body.messageTemplate.trim(),
        is_active: isActive,
        next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
        last_run_status: null,
        last_run_error: null
      })
      .eq('id', task.id)
      .select('id, name, is_active, recurrence, delivery_method, target_type, target_user_id, target_channel_id, subject_template, message_template, next_run_at, created_by_user_id, created_at, updated_at')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} schedule update error:`, error.message);
      return jsonError('Bijwerken mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} SCHEDULE UPDATE ${task.id} (app ${app.id}) — user ${user.id}`);
    return jsonOk(updated);
  },

  // ── Geplande taken — verwijderen (aanmaker of app-eigenaar) ─────────────
  'DELETE /api/apps/:id/schedules/:scheduleId': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { app, task, errorResponse } = await fetchAppAndTask(supabase, params);
    if (errorResponse) return errorResponse;
    if (!(task.created_by_user_id === user.id || canEdit(app, user))) {
      return jsonError('Enkel de aanmaker of de app-eigenaar mag deze taak verwijderen.', 403, 'FORBIDDEN');
    }

    const { error } = await supabase.from('mini_app_scheduled_tasks').delete().eq('id', task.id);
    if (error) {
      console.error(`${LOG_PREFIX} schedule delete error:`, error.message);
      return jsonError('Verwijderen mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} SCHEDULE DELETE ${task.id} (app ${app.id}) — user ${user.id}`);
    return jsonOk({ id: task.id });
  },

  // ── Geplande taken — nu al eens testen (aanmaker of app-eigenaar) ───────
  'POST /api/apps/:id/schedules/:scheduleId/run-now': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { app, task, errorResponse } = await fetchAppAndTask(supabase, params);
    if (errorResponse) return errorResponse;
    if (!(task.created_by_user_id === user.id || canEdit(app, user))) {
      return jsonError('Enkel de aanmaker of de app-eigenaar mag deze taak testen.', 403, 'FORBIDDEN');
    }

    try {
      const result = await runTaskNow(env, task.id);
      console.log(`${LOG_PREFIX} SCHEDULE RUN-NOW ${task.id} (app ${app.id}) — user ${user.id} — status ${result?.last_run_status}`);
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} schedule run-now error:`, err.message);
      return jsonError(err.message, err.code ? 400 : 500, err.code);
    }
  },

  // ── Criteria-taken — lijst (view-toegang; iedereen ziet alle taken van de
  // app zodat je geen dubbele criteria-taak aanmaakt -- bewerken/
  // verwijderen/testen blijft voorbehouden aan de aanmaker of de eigenaar) ──
  'GET /api/apps/:id/condition-tasks': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: appErr } = await supabase
      .from('mini_apps').select(SELECT_FIELDS).eq('id', params.id).maybeSingle();
    if (appErr) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const { data: tasks, error } = await supabase
      .from('mini_app_condition_tasks')
      .select('id, name, is_active, criteria, last_condition_met, last_checked_at, last_triggered_at, delivery_method, target_type, target_user_id, target_channel_id, subject_template, message_template, last_run_at, last_run_status, last_run_error, created_by_user_id, created_at, updated_at')
      .eq('mini_app_id', app.id)
      .order('created_at', { ascending: true });
    if (error) {
      console.error(`${LOG_PREFIX} condition-tasks list error:`, error.message);
      return jsonError('Lijst ophalen mislukt.', 500);
    }

    const enriched = await attachConditionTaskDisplayNames(supabase, env, tasks || []);
    return jsonOk(enriched.map(t => ({
      ...t,
      isMine: t.created_by_user_id === user.id,
      canManage: t.created_by_user_id === user.id || canEdit(app, user)
    })));
  },

  // ── Criteria-taken — aanmaken (view-toegang; elke viewer mag zijn eigen
  // taak aanmaken; ontvanger/kanaal wordt server-side herleid/gevalideerd) ─
  'POST /api/apps/:id/condition-tasks': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: appErr } = await supabase
      .from('mini_apps').select(SELECT_FIELDS).eq('id', params.id).maybeSingle();
    if (appErr) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      validateConditionTaskPayload(body);
    } catch (err) {
      return jsonError(err.message, 400, err.code);
    }

    const targetErr = await validateTarget(supabase, env, body);
    if (targetErr) return targetErr;

    const { count, error: countErr } = await supabase
      .from('mini_app_condition_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('mini_app_id', app.id);
    if (countErr) return jsonError('Taken tellen mislukt.', 500);
    if ((count || 0) >= MAX_CONDITION_TASKS_PER_APP) {
      return jsonError(`Maximum aantal criteria-taken per app (${MAX_CONDITION_TASKS_PER_APP}) bereikt.`, 400, 'TOO_MANY_TASKS');
    }

    const { data: created, error } = await supabase
      .from('mini_app_condition_tasks')
      .insert({
        mini_app_id: app.id,
        created_by_user_id: user.id,
        name: body.name.trim(),
        criteria: body.criteria,
        delivery_method: body.deliveryMethod,
        target_type: body.targetType,
        target_user_id: body.targetType === 'colleague' ? body.targetUserId : null,
        target_channel_id: body.targetType === 'channel' ? body.targetChannelId : null,
        subject_template: body.deliveryMethod === 'mail' ? body.subjectTemplate.trim() : null,
        message_template: body.messageTemplate.trim(),
        is_active: true
      })
      .select('id, name, is_active, criteria, last_condition_met, delivery_method, target_type, target_user_id, target_channel_id, subject_template, message_template, created_by_user_id, created_at, updated_at')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} condition-task create error:`, error.message);
      return jsonError('Aanmaken mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} CONDITION-TASK CREATE ${created.id} (app ${app.id}) — user ${user.id}`);
    return jsonOk(created);
  },

  // ── Criteria-taken — bewerken (aanmaker of app-eigenaar) ────────────────
  'PUT /api/apps/:id/condition-tasks/:taskId': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { app, task, errorResponse } = await fetchAppAndConditionTask(supabase, params);
    if (errorResponse) return errorResponse;
    if (!(task.created_by_user_id === user.id || canEdit(app, user))) {
      return jsonError('Enkel de aanmaker of de app-eigenaar mag deze taak bewerken.', 403, 'FORBIDDEN');
    }

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      validateConditionTaskPayload(body);
    } catch (err) {
      return jsonError(err.message, 400, err.code);
    }
    const targetErr = await validateTarget(supabase, env, body);
    if (targetErr) return targetErr;

    const isActive = typeof body.isActive === 'boolean' ? body.isActive : task.is_active;

    const { data: updated, error } = await supabase
      .from('mini_app_condition_tasks')
      .update({
        name: body.name.trim(),
        criteria: body.criteria,
        delivery_method: body.deliveryMethod,
        target_type: body.targetType,
        target_user_id: body.targetType === 'colleague' ? body.targetUserId : null,
        target_channel_id: body.targetType === 'channel' ? body.targetChannelId : null,
        subject_template: body.deliveryMethod === 'mail' ? body.subjectTemplate.trim() : null,
        message_template: body.messageTemplate.trim(),
        is_active: isActive,
        // Criteria/actieve status wijzigt -- reset de edge-detectie-state
        // zodat een oude "was al waar"-status niet per ongeluk een terechte
        // nieuwe send onderdrukt.
        last_condition_met: false,
        last_run_status: null,
        last_run_error: null
      })
      .eq('id', task.id)
      .select('id, name, is_active, criteria, last_condition_met, delivery_method, target_type, target_user_id, target_channel_id, subject_template, message_template, created_by_user_id, created_at, updated_at')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} condition-task update error:`, error.message);
      return jsonError('Bijwerken mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} CONDITION-TASK UPDATE ${task.id} (app ${app.id}) — user ${user.id}`);
    return jsonOk(updated);
  },

  // ── Criteria-taken — verwijderen (aanmaker of app-eigenaar) ─────────────
  'DELETE /api/apps/:id/condition-tasks/:taskId': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { app, task, errorResponse } = await fetchAppAndConditionTask(supabase, params);
    if (errorResponse) return errorResponse;
    if (!(task.created_by_user_id === user.id || canEdit(app, user))) {
      return jsonError('Enkel de aanmaker of de app-eigenaar mag deze taak verwijderen.', 403, 'FORBIDDEN');
    }

    const { error } = await supabase.from('mini_app_condition_tasks').delete().eq('id', task.id);
    if (error) {
      console.error(`${LOG_PREFIX} condition-task delete error:`, error.message);
      return jsonError('Verwijderen mislukt.', 500);
    }
    console.log(`${LOG_PREFIX} CONDITION-TASK DELETE ${task.id} (app ${app.id}) — user ${user.id}`);
    return jsonOk({ id: task.id });
  },

  // ── Criteria-taken — nu al eens testen (forceert de send, ongeacht
  // edge-triggering; aanmaker of app-eigenaar) ────────────────────────────
  'POST /api/apps/:id/condition-tasks/:taskId/run-now': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { app, task, errorResponse } = await fetchAppAndConditionTask(supabase, params);
    if (errorResponse) return errorResponse;
    if (!(task.created_by_user_id === user.id || canEdit(app, user))) {
      return jsonError('Enkel de aanmaker of de app-eigenaar mag deze taak testen.', 403, 'FORBIDDEN');
    }

    try {
      const result = await runConditionTaskNow(env, task.id);
      console.log(`${LOG_PREFIX} CONDITION-TASK RUN-NOW ${task.id} (app ${app.id}) — user ${user.id} — status ${result?.last_run_status}`);
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} condition-task run-now error:`, err.message);
      return jsonError(err.message, err.code ? 400 : 500, err.code);
    }
  },

  // ── Upload ────────────────────────────────────────────────────────────────
  'POST /api/apps': async (context) => {
    const { request, env, user } = context;

    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_APP_BYTES) {
      return jsonError(`Bestand te groot. Maximum is ${MAX_APP_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (_err) {
      return jsonError('Ongeldige multipart-body.', 400);
    }

    const file = formData.get('file');
    const title = (formData.get('title') || '').toString().trim();
    const description = (formData.get('description') || '').toString().trim() || null;
    const visibility = (formData.get('visibility') || 'private').toString();
    const iconRaw = (formData.get('icon') || '').toString();
    const icon = VALID_ICONS.includes(iconRaw) ? iconRaw : 'puzzle';
    let sharedUserIdsRaw = [];
    try {
      sharedUserIdsRaw = JSON.parse(formData.get('sharedUserIds') || '[]');
    } catch (_err) {
      return jsonError('sharedUserIds moet een JSON-array zijn.', 400);
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonError('Geen bestand ontvangen.', 400);
    }
    if (!title) {
      return jsonError('Titel is verplicht.', 400);
    }
    if (!VALID_VISIBILITIES.includes(visibility)) {
      return jsonError('Ongeldige visibility-waarde.', 400, 'INVALID_VISIBILITY');
    }
    if (file.size > MAX_APP_BYTES) {
      return jsonError(`Bestand te groot. Maximum is ${MAX_APP_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }
    if (!looksLikeHtml(file)) {
      return jsonError('Upload een single-file .html bestand.', 415, 'NOT_HTML');
    }

    const htmlContent = await file.text();
    const relativeRefs = findRelativeAssetReferences(htmlContent);
    if (relativeRefs.length > 0) {
      return jsonError(
        `Dit bestand verwijst naar losse bestanden die niet meegestuurd worden en dus altijd zullen falen: ${relativeRefs.slice(0, 5).join(', ')}. Een mini-app moet ÉÉN volledig zelfstandig .html-bestand zijn -- gebruik enkel CDN-links (https://...) of plaats alle CSS/JS inline.`,
        415,
        'RELATIVE_ASSET_REFERENCE'
      );
    }
    const sharedUserIds = visibility === 'specific' ? normalizeSharedUserIds(sharedUserIdsRaw, user.id) : [];

    const supabase = getSupabaseClient(env);
    const { data: inserted, error: insertError } = await supabase
      .from('mini_apps')
      .insert({
        title,
        description,
        owner_user_id: user.id,
        visibility,
        shared_user_ids: sharedUserIds,
        icon,
        r2_key: `mini-apps/pending`, // wordt hieronder direct overschreven met het echte, id-afhankelijke key
        size_bytes: file.size,
        version: 1
      })
      .select(SELECT_FIELDS)
      .single();

    if (insertError) {
      console.error(`${LOG_PREFIX} insert error:`, insertError.message);
      return jsonError('Aanmaken van de app mislukt.', 500);
    }

    try {
      const r2Result = await putAppContent(env, inserted.id, htmlContent);
      await supabase.from('mini_apps').update({ r2_key: r2Result.key }).eq('id', inserted.id);
      console.log(`${LOG_PREFIX} CREATE ${inserted.id} — ${r2Result.size} bytes — user ${user.id}`);
      return jsonOk({ ...inserted, r2_key: r2Result.key, isOwner: true });
    } catch (err) {
      console.error(`${LOG_PREFIX} R2 write error:`, err.message);
      await supabase.from('mini_apps').delete().eq('id', inserted.id);
      return jsonError('Opslaan van de app-inhoud mislukt.', 500);
    }
  },

  // ── Eén app — metadata ───────────────────────────────────────────────────
  'GET /api/apps/:id': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} get error:`, error.message);
      return jsonError('App ophalen mislukt.', 500);
    }
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const [[withOwner], favoriteIds] = await Promise.all([
      attachOwnerNames(supabase, [app]),
      getFavoriteAppIds(supabase, user.id)
    ]);
    return jsonOk({ ...withOwner, isOwner: app.owner_user_id === user.id, isFavorite: favoriteIds.has(app.id) });
  },

  // ── Eén app — HTML-inhoud ────────────────────────────────────────────────
  'GET /api/apps/:id/content': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} get content error:`, error.message);
      return jsonError('App ophalen mislukt.', 500);
    }
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const content = await getAppContent(env, app.id);
    if (content === null) return jsonError('App-inhoud niet gevonden in opslag.', 404);

    return jsonOk({ content });
  },

  // ── Metadata bijwerken (owner only) ──────────────────────────────────────
  'PUT /api/apps/:id': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canEdit(app, user)) return jsonError('Alleen de eigenaar mag deze app bewerken.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const update = {};
    if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim();
    if (typeof body.description === 'string' || body.description === null) {
      update.description = body.description ? body.description.trim() : null;
    }
    if (body.visibility !== undefined) {
      if (!VALID_VISIBILITIES.includes(body.visibility)) {
        return jsonError('Ongeldige visibility-waarde.', 400, 'INVALID_VISIBILITY');
      }
      update.visibility = body.visibility;
      update.shared_user_ids = body.visibility === 'specific'
        ? normalizeSharedUserIds(body.sharedUserIds, user.id)
        : [];
    }
    if (body.icon !== undefined) {
      if (!VALID_ICONS.includes(body.icon)) {
        return jsonError('Ongeldig icoon.', 400, 'INVALID_ICON');
      }
      update.icon = body.icon;
    }

    if (Object.keys(update).length === 0) {
      return jsonError('Niets om bij te werken.', 400);
    }

    const { data: updated, error: updateError } = await supabase
      .from('mini_apps')
      .update(update)
      .eq('id', app.id)
      .select(SELECT_FIELDS)
      .single();

    if (updateError) {
      console.error(`${LOG_PREFIX} update error:`, updateError.message);
      return jsonError('Bijwerken mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} UPDATE metadata ${app.id} — user ${user.id}`);
    return jsonOk({ ...updated, isOwner: true });
  },

  // ── HTML-inhoud bijwerken — "tweaken" (owner only) ───────────────────────
  'PUT /api/apps/:id/content': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canEdit(app, user)) return jsonError('Alleen de eigenaar mag deze app tweaken.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const content = body.content;
    if (typeof content !== 'string' || !content.trim()) {
      return jsonError('content is verplicht.', 400);
    }
    const sizeBytes = new TextEncoder().encode(content).byteLength;
    if (sizeBytes > MAX_APP_BYTES) {
      return jsonError(`Inhoud te groot. Maximum is ${MAX_APP_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }
    const relativeRefs = findRelativeAssetReferences(content);
    if (relativeRefs.length > 0) {
      return jsonError(
        `Deze inhoud verwijst naar losse bestanden die niet meegestuurd worden en dus altijd zullen falen: ${relativeRefs.slice(0, 5).join(', ')}. Een mini-app moet ÉÉN volledig zelfstandig .html-bestand zijn -- gebruik enkel CDN-links (https://...) of plaats alle CSS/JS inline.`,
        415,
        'RELATIVE_ASSET_REFERENCE'
      );
    }

    try {
      await putAppContent(env, app.id, content);
    } catch (err) {
      console.error(`${LOG_PREFIX} R2 update error:`, err.message);
      return jsonError('Opslaan van de app-inhoud mislukt.', 500);
    }

    const { data: updated, error: updateError } = await supabase
      .from('mini_apps')
      .update({ size_bytes: sizeBytes, version: (app.version || 1) + 1 })
      .eq('id', app.id)
      .select(SELECT_FIELDS)
      .single();

    if (updateError) {
      console.error(`${LOG_PREFIX} version bump error:`, updateError.message);
      return jsonError('Opslaan gelukt, metadata bijwerken mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} TWEAK ${app.id} → v${updated.version} — user ${user.id}`);
    return jsonOk({ ...updated, isOwner: true });
  },

  // ── Verwijderen (owner only) ─────────────────────────────────────────────
  'DELETE /api/apps/:id': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canEdit(app, user)) return jsonError('Alleen de eigenaar mag deze app verwijderen.', 403, 'FORBIDDEN');

    try {
      await deleteAppContent(env, app.id);
    } catch (err) {
      console.error(`${LOG_PREFIX} R2 delete error:`, err.message);
      // Ga door met het verwijderen van de metadata, ook als R2-delete faalt —
      // een orphaned R2-object is minder erg dan een onverwijderbare rij.
    }

    try {
      await deleteAllStorage(env, app.id);
    } catch (err) {
      console.error(`${LOG_PREFIX} shared-storage cleanup error:`, err.message);
      // Zelfde afweging als hierboven -- een orphaned mini-apps-storage/-object
      // is minder erg dan een onverwijderbare rij. Deze opslag heeft geen
      // eigen databaserij/FK (het zijn losse R2-objecten onder
      // mini-apps-storage/{appId}/), dus zonder deze aanroep zou hij nooit
      // ergens anders automatisch opgeruimd worden.
    }

    const { error: deleteError } = await supabase.from('mini_apps').delete().eq('id', app.id);
    if (deleteError) {
      console.error(`${LOG_PREFIX} delete error:`, deleteError.message);
      return jsonError('Verwijderen mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} DELETE ${app.id} — user ${user.id}`);
    return jsonOk({ id: app.id });
  },

  // ── Favoriet markeren (view-toegang volstaat) ────────────────────
  'PUT /api/apps/:id/favorite': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const { error: favError } = await supabase
      .from('mini_app_favorites')
      .upsert({ user_id: user.id, mini_app_id: app.id }, { onConflict: 'user_id,mini_app_id' });

    if (favError) {
      console.error(`${LOG_PREFIX} favorite error:`, favError.message);
      return jsonError('Favoriet markeren mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} FAVORITE ${app.id} — user ${user.id}`);
    return jsonOk({ id: app.id, isFavorite: true });
  },

  // ── Favoriet verwijderen ────────────────────
  'DELETE /api/apps/:id/favorite': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { error: unfavError } = await supabase
      .from('mini_app_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('mini_app_id', params.id);

    if (unfavError) {
      console.error(`${LOG_PREFIX} unfavorite error:`, unfavError.message);
      return jsonError('Favoriet verwijderen mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} UNFAVORITE ${params.id} — user ${user.id}`);
    return jsonOk({ id: params.id, isFavorite: false });
  },

  // ── Gedeelde opslag — alles ophalen (view-toegang volstaat) ─────────
  'GET /api/apps/:id/storage': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      const data = await listStorage(env, app.id);
      return jsonOk(data);
    } catch (err) {
      console.error(`${LOG_PREFIX} storage list error:`, err.message);
      return jsonError('Opslag ophalen mislukt.', 500);
    }
  },

  // ── Gedeelde opslag — één key ophalen (view-toegang volstaat) ───────
  'GET /api/apps/:id/storage/:key': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      const value = await getStorageValue(env, app.id, params.key);
      return jsonOk({ value });
    } catch (err) {
      console.error(`${LOG_PREFIX} storage get error:`, err.message);
      return jsonError('Opslag ophalen mislukt.', 500);
    }
  },

  // ── Gedeelde opslag — één key zetten (view-toegang volstaat) ─────────
  'PUT /api/apps/:id/storage/:key': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    if (typeof body.value !== 'string') {
      return jsonError('value (string) is verplicht.', 400);
    }

    try {
      await setStorageValue(env, app.id, params.key, body.value);
    } catch (err) {
      const status = err.code ? 400 : 500;
      console.error(`${LOG_PREFIX} storage set error:`, err.message);
      return jsonError(err.message, status, err.code);
    }

    console.log(`${LOG_PREFIX} STORAGE SET ${app.id}/${params.key} — user ${user.id}`);
    return jsonOk({ key: params.key });
  },

  // ── Gedeelde opslag — één key verwijderen (view-toegang volstaat) ──────
  'DELETE /api/apps/:id/storage/:key': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      await deleteStorageValue(env, app.id, params.key);
    } catch (err) {
      console.error(`${LOG_PREFIX} storage delete error:`, err.message);
      return jsonError('Verwijderen mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} STORAGE DELETE ${app.id}/${params.key} — user ${user.id}`);
    return jsonOk({ key: params.key });
  },

  // ── Gedeelde opslag — quotum-overzicht (view-toegang volstaat) ──────
  'GET /api/apps/:id/storage-usage': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      const usage = await getStorageUsage(env, app.id);
      return jsonOk(usage);
    } catch (err) {
      console.error(`${LOG_PREFIX} storage usage error:`, err.message);
      return jsonError('Quotum ophalen mislukt.', 500);
    }
  },

  // ── Collections — items ophalen (view-toegang volstaat) ─────────────
  'GET /api/apps/:id/storage/collections/:collection': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      const items = await listCollectionItems(env, app.id, params.collection);
      return jsonOk(items);
    } catch (err) {
      console.error(`${LOG_PREFIX} collection list error:`, err.message);
      return jsonError('Collection ophalen mislukt.', 500);
    }
  },

  // ── Collections — item toevoegen (view-toegang volstaat) ────────────
  'POST /api/apps/:id/storage/collections/:collection': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    if (typeof body.value !== 'string') {
      return jsonError('value (string) is verplicht.', 400);
    }

    try {
      const item = await addCollectionItem(env, app.id, params.collection, body.value);
      console.log(`${LOG_PREFIX} COLLECTION ADD ${app.id}/${params.collection}/${item.id} — user ${user.id}`);
      return jsonOk(item);
    } catch (err) {
      const status = err.code ? 400 : 500;
      console.error(`${LOG_PREFIX} collection add error:`, err.message);
      return jsonError(err.message, status, err.code);
    }
  },

  // ── Collections — item in-place wijzigen (view-toegang volstaat) ────
  'PUT /api/apps/:id/storage/collections/:collection/:itemId': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    if (typeof body.value !== 'string') {
      return jsonError('value (string) is verplicht.', 400);
    }

    try {
      const item = await updateCollectionItem(env, app.id, params.collection, params.itemId, body.value);
      console.log(`${LOG_PREFIX} COLLECTION UPDATE ${app.id}/${params.collection}/${item.id} — user ${user.id}`);
      return jsonOk(item);
    } catch (err) {
      const status = err.code ? 400 : 500;
      console.error(`${LOG_PREFIX} collection update error:`, err.message);
      return jsonError(err.message, status, err.code);
    }
  },

  // ── Collections — item verwijderen (view-toegang volstaat) ──────────
  'DELETE /api/apps/:id/storage/collections/:collection/:itemId': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    try {
      await removeCollectionItem(env, app.id, params.collection, params.itemId);
    } catch (err) {
      console.error(`${LOG_PREFIX} collection remove error:`, err.message);
      return jsonError('Verwijderen mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} COLLECTION REMOVE ${app.id}/${params.collection}/${params.itemId} — user ${user.id}`);
    return jsonOk({ id: params.itemId });
  },

  // ── Notify — mail naar zichzelf/een collega (view-toegang volstaat) ─
  'POST /api/apps/:id/notify': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      const result = await notifyUser(env, app, user, body.to, body.subject, body.message);
      if (result.skipped) {
        console.log(`${LOG_PREFIX} NOTIFY SKIPPED (uitgeschreven) ${app.id} -> ${result.recipientEmail} — user ${user.id}`);
        return jsonOk({ sent: false, skipped: true });
      }
      console.log(`${LOG_PREFIX} NOTIFY ${app.id} -> ${result.recipientEmail} — user ${user.id}`);
      return jsonOk({ sent: true });
    } catch (err) {
      const status = err.code ? 400 : 500;
      console.error(`${LOG_PREFIX} notify error:`, err.message);
      return jsonError(err.message, status, err.code);
    }
  },

  // ── Chat-send — bericht naar een kanaal (view-toegang volstaat) ────
  'POST /api/apps/:id/chat-send': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    try {
      const result = await sendChannelMessage(env, app, user, body.channelId, body.message);
      console.log(`${LOG_PREFIX} CHAT SEND ${app.id} -> ${result.channelName} — user ${user.id}`);
      return jsonOk({ sent: true });
    } catch (err) {
      const status = err.code ? 400 : 500;
      console.error(`${LOG_PREFIX} chat-send error:`, err.message);
      return jsonError(err.message, status, err.code);
    }
  },

};
