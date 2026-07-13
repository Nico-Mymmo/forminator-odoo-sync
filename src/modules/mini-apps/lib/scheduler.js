/**
 * Mini-Apps — Geplande taken (4de generieke bouwblok)
 *
 * Laat een mini-app een mail/chat-bericht versturen op een vast tijdstip/
 * interval, OOK als niemand die dag de app opent -- in tegenstelling tot
 * notify()/sendChat(), die enkel iets versturen terwijl een gebruiker de app
 * open heeft. Aangeroepen via window.platform.schedule.create(...) in de
 * iframe-shim (public/mini-apps.js) en de /api/apps/:id/schedules-routes.
 *
 * Veiligheidsprincipe: we voeren de HTML/JS van de mini-app NOOIT onbemand
 * uit (geen headless browser, geen eval/Function van app-code op de server).
 * Een taak slaat in plaats daarvan een DECLARATIEVE definitie op:
 *  - recurrence: pure datum-wiskunde (zie computeNextRun hieronder), geen
 *    cron-string, geen expressie-taal.
 *  - subject/message-template: een logic-less template (zie renderTemplate)
 *    die enkel data uit de EIGEN gedeelde opslag van de app leest (lib/
 *    storage.js) -- {{kv.KEY}}, {{#each collectie}}...{{/each}},
 *    {{#isEmpty collectie}}...{{/isEmpty}}, {{#notEmpty collectie}}...{{/notEmpty}}.
 *    Geen eval, geen Function-constructor, geen willekeurige expressies --
 *    enkel string-substitutie, dus geen code-executie-oppervlak.
 *
 * runDueScheduledTasks(env) is de cron-entry (aangeroepen vanuit
 * src/index.js#scheduled(), elke 15 min): pikt due taken op, bouwt de
 * context, rendert, verstuurt via de BESTAANDE notifyUser()/
 * sendChannelMessage() -- dus dezelfde ontvanger-herleiding, rate-limits en
 * audit-log als een interactieve send vanuit de app zelf. Enkel de trigger
 * is nu tijd-gebaseerd i.p.v. een klik.
 *
 * Tijdzone is vast Europe/Brussels (intern NL/BE-bedrijfsplatform, geen
 * per-taak tijdzone-keuze) en granulariteit is de bestaande 15-min cron --
 * een taak wordt dus binnen 15 minuten na het ingestelde tijdstip verstuurd,
 * nooit exact op de minuut.
 *
 * Later fase (nog NIET gebouwd, bewust niet dichtgetimmerd door dit
 * ontwerp): de template-context hier komt uitsluitend uit lib/storage.js.
 * Wil je later ook data uit andere modules (events, sales-insights, ...)
 * beschikbaar maken in de template, dan breid je buildContext() uit met
 * extra, server-side opgehaalde bronnen (zelfde regel als overal: de
 * mini-app zelf kiest nooit rechtstreeks een databron/query, enkel de
 * kant-en-klare context die wij aanreiken).
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { listStorage, listAllCollections } from './storage.js';
import { notifyUser } from './notify.js';
import { sendChannelMessage } from './chat.js';

export const ORG_TIMEZONE = 'Europe/Brussels';
export const MAX_TASKS_PER_APP = 20;
export const MAX_NAME_LENGTH = 100;
export const MAX_SUBJECT_TEMPLATE_LENGTH = 200;
export const MAX_MESSAGE_TEMPLATE_LENGTH = 4000;
export const MAX_EACH_ITEMS = 200;
export const MAX_RENDERED_MAIL_LENGTH = 4500;   // blijft ruim onder notify.js' MAX_MESSAGE_LENGTH (5000)
export const MAX_RENDERED_CHAT_LENGTH = 3500;   // blijft ruim onder chat.js' MAX_MESSAGE_LENGTH (4000)

const MAX_SEARCH_DAYS = 400;      // ruim > 1 jaar -- vangt elke geldige recurrence op
const MAX_TASKS_PER_RUN = 100;    // hard cap per cron-tick

function schedulerError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ─── Validatie ───────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valideert de recurrence-vorm. Gooit een fout met duidelijke Nederlandse
 * boodschap bij een ongeldige combinatie -- wordt zowel bij aanmaken/
 * bewerken (routes.js) als bij elke cron-run (defense-in-depth) aangeroepen.
 */
export function validateRecurrence(recurrence) {
  if (!recurrence || typeof recurrence !== 'object') {
    throw schedulerError('Recurrence is verplicht.', 'INVALID_RECURRENCE');
  }
  if (typeof recurrence.time !== 'string' || !TIME_RE.test(recurrence.time)) {
    throw schedulerError('Tijdstip moet het formaat HH:mm hebben.', 'INVALID_TIME');
  }

  if (recurrence.frequency === 'daily') {
    return;
  }

  if (recurrence.frequency === 'weekly') {
    const days = recurrence.daysOfWeek;
    if (!Array.isArray(days) || days.length === 0 || days.length > 7) {
      throw schedulerError('Kies minstens één dag van de week.', 'INVALID_DAYS_OF_WEEK');
    }
    const unique = new Set(days);
    if (unique.size !== days.length || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw schedulerError('Dagen van de week moeten unieke gehele getallen 0-6 zijn (0 = zondag).', 'INVALID_DAYS_OF_WEEK');
    }
    return;
  }

  if (recurrence.frequency === 'every_n_days') {
    if (!Number.isInteger(recurrence.intervalDays) || recurrence.intervalDays < 1 || recurrence.intervalDays > 365) {
      throw schedulerError('Interval (dagen) moet een geheel getal tussen 1 en 365 zijn.', 'INVALID_INTERVAL');
    }
    if (typeof recurrence.anchorDate !== 'string' || !DATE_RE.test(recurrence.anchorDate) || isNaN(Date.parse(recurrence.anchorDate))) {
      throw schedulerError('Startdatum (anchorDate) moet het formaat YYYY-MM-DD hebben.', 'INVALID_ANCHOR_DATE');
    }
    return;
  }

  throw schedulerError("Frequency moet 'daily', 'weekly' of 'every_n_days' zijn.", 'INVALID_FREQUENCY');
}

// ─── Datum-wiskunde (Europe/Brussels, DST-veilig) ──────────────────────────
//
// Alles hier is pure, deterministische datum-arithmetiek op basis van
// Intl.DateTimeFormat -- geen library, geen willekeurige code-executie.

function formatPartsInZone(date, timeZone, opts) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', ...opts });
  return dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
}

function getZonedYMD(date, timeZone) {
  const p = formatPartsInZone(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return { y: +p.year, m: +p.month, d: +p.day };
}

/**
 * Offset (in minuten, local = UTC + offset) van timeZone op het moment `date`.
 */
function getTimeZoneOffsetMinutes(date, timeZone) {
  const p = formatPartsInZone(date, timeZone, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Zet een "kalenderwandtijd" (y/m/d hh:mm) in timeZone om naar een echte
 * UTC-Date. DST-veilig via de standaard guess-en-corrigeer-techniek.
 */
function zonedTimeToUtc(y, m, d, hh, mm, timeZone) {
  const guessUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(guessUtc, timeZone);
  return new Date(guessUtc.getTime() - offsetMinutes * 60000);
}

function addCivilDays(ymd, n) {
  const t = Date.UTC(ymd.y, ymd.m - 1, ymd.d) + n * 86400000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function diffCivilDays(a, b) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

function civilWeekday(ymd) {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay(); // 0 = zondag
}

function parseYMD(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function matchesFrequency(recurrence, civil, anchorYMD) {
  if (recurrence.frequency === 'daily') return true;
  if (recurrence.frequency === 'weekly') return recurrence.daysOfWeek.includes(civilWeekday(civil));
  if (recurrence.frequency === 'every_n_days') {
    if (diffCivilDays(anchorYMD, civil) < 0) return false;
    return diffCivilDays(anchorYMD, civil) % recurrence.intervalDays === 0;
  }
  return false;
}

/**
 * Berekent het eerstvolgende moment (UTC Date) STRIKT na `afterUtc` waarop de
 * recurrence afgaat. Retourneert null als er binnen MAX_SEARCH_DAYS niets
 * gevonden wordt (zou enkel bij een ongeldige recurrence mogen gebeuren --
 * validateRecurrence() hoort dat al af te vangen).
 */
export function computeNextRun(recurrence, afterUtc, timeZone = ORG_TIMEZONE) {
  validateRecurrence(recurrence);
  const [hh, mm] = recurrence.time.split(':').map(Number);
  const startYMD = getZonedYMD(afterUtc, timeZone);
  const anchorYMD = recurrence.frequency === 'every_n_days' ? parseYMD(recurrence.anchorDate) : null;

  for (let offset = 0; offset <= MAX_SEARCH_DAYS; offset++) {
    const civil = addCivilDays(startYMD, offset);
    if (!matchesFrequency(recurrence, civil, anchorYMD)) continue;
    const candidate = zonedTimeToUtc(civil.y, civil.m, civil.d, hh, mm, timeZone);
    if (candidate.getTime() > afterUtc.getTime()) {
      return candidate;
    }
  }
  return null;
}

// ─── Logic-less template-renderer (geen eval, enkel string-substitutie) ────

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '… (ingekort)';
}

function renderEachInner(innerTemplate, item) {
  let out = innerTemplate.replace(/\{\{this\}\}/g, String(item.value ?? ''));
  out = out.replace(/\{\{this\.([a-zA-Z0-9_-]+)\}\}/g, (m, field) => {
    try {
      const parsed = JSON.parse(item.value);
      if (parsed && typeof parsed === 'object' && field in parsed) {
        const v = parsed[field];
        return v === null || v === undefined ? '' : String(v);
      }
    } catch (e) {
      // item.value is geen JSON of ontbreekt -- gewoon leeg, geen fout
    }
    return '';
  });
  return out;
}

const BLOCK_RE = /\{\{#(each|isEmpty|notEmpty)\s+([a-zA-Z0-9_-]+)\}\}([\s\S]*?)\{\{\/\1\}\}/;

/**
 * Rendert een template tegen een context { kv: {key: value}, collections:
 * {naam: [{id, value}, ...]} }. Ondersteunt:
 *   {{kv.KEY}}                                   -- platte waarde
 *   {{#each collectie}}...{{this}}/{{this.veld}}...{{/each}}
 *   {{#isEmpty collectie}}...{{/isEmpty}}         -- enkel als collectie leeg is
 *   {{#notEmpty collectie}}...{{/notEmpty}}       -- enkel als collectie niet leeg is
 * Geen nesting van blocks in v1 (bewust simpel gehouden -- elke extra
 * grammatica-laag is extra oppervlak om verkeerd te evalueren). Onbekende/
 * kapotte tags worden stilzwijgend leeg gerenderd, nooit doorgestuurd als
 * ruwe syntax naar de ontvanger.
 */
export function renderTemplate(template, context, maxLength) {
  let out = template;
  const collections = context.collections || {};
  const kv = context.kv || {};

  // Blocks eerst (each/isEmpty/notEmpty) -- max 100 passes als veiligheidsklep
  // tegen kapotte/oneindige input (bv. een niet-gesloten tag).
  for (let i = 0; i < 100; i++) {
    const match = BLOCK_RE.exec(out);
    if (!match) break;
    const [full, kind, name, inner] = match;
    const items = Array.isArray(collections[name]) ? collections[name].slice(0, MAX_EACH_ITEMS) : [];

    let replacement = '';
    if (kind === 'each') {
      replacement = items.map(item => renderEachInner(inner, item)).join('\n');
    } else if (kind === 'isEmpty') {
      replacement = items.length === 0 ? inner : '';
    } else if (kind === 'notEmpty') {
      replacement = items.length > 0 ? inner : '';
    }
    out = out.slice(0, match.index) + replacement + out.slice(match.index + full.length);
  }

  // Dan de platte {{kv.KEY}}-substituties.
  out = out.replace(/\{\{kv\.([a-zA-Z0-9_-]+)\}\}/g, (m, key) => {
    const v = kv[key];
    return v === null || v === undefined ? '' : String(v);
  });

  // Restjes van onherkende {{...}}-syntax nooit doorlaten naar de ontvanger.
  out = out.replace(/\{\{[^}]*\}\}/g, '');

  return typeof maxLength === 'number' ? truncate(out, maxLength) : out;
}

/**
 * Bouwt de template-context voor één app: alle platte kv-waarden + alle
 * collections, in één keer opgehaald (bounded door de bestaande opslag-
 * quota's in lib/storage.js -- max 500 objecten per app).
 */
export async function buildContext(env, appId) {
  const [kv, collections] = await Promise.all([
    listStorage(env, appId),
    listAllCollections(env, appId)
  ]);
  return { kv, collections };
}

// ─── CRUD-helpers (gebruikt door routes.js) ────────────────────────────────

/**
 * Valideert en normaliseert een create/update-payload voor een geplande
 * taak. Gooit een fout met duidelijke Nederlandse boodschap bij een
 * ongeldige combinatie (zelfde regel als de DB-CHECK-constraint in de
 * migratie -- defense-in-depth, niet enkel op de database vertrouwen).
 */
export function validateTaskPayload(body) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > MAX_NAME_LENGTH) {
    throw schedulerError(`Naam is verplicht en max ${MAX_NAME_LENGTH} tekens.`, 'INVALID_NAME');
  }
  validateRecurrence(body.recurrence);

  if (body.deliveryMethod !== 'mail' && body.deliveryMethod !== 'chat') {
    throw schedulerError("deliveryMethod moet 'mail' of 'chat' zijn.", 'INVALID_DELIVERY_METHOD');
  }
  if (!['self', 'colleague', 'channel'].includes(body.targetType)) {
    throw schedulerError("targetType moet 'self', 'colleague' of 'channel' zijn.", 'INVALID_TARGET_TYPE');
  }

  if (body.targetType === 'self') {
    if (body.deliveryMethod !== 'mail') {
      throw schedulerError("targetType 'self' vereist deliveryMethod 'mail'.", 'INVALID_TARGET_COMBINATION');
    }
  } else if (body.targetType === 'colleague') {
    if (body.deliveryMethod !== 'mail' || typeof body.targetUserId !== 'string' || !body.targetUserId.trim()) {
      throw schedulerError("targetType 'colleague' vereist deliveryMethod 'mail' en een targetUserId.", 'INVALID_TARGET_COMBINATION');
    }
  } else if (body.targetType === 'channel') {
    if (body.deliveryMethod !== 'chat' || typeof body.targetChannelId !== 'string' || !body.targetChannelId.trim()) {
      throw schedulerError("targetType 'channel' vereist deliveryMethod 'chat' en een targetChannelId.", 'INVALID_TARGET_COMBINATION');
    }
  }

  if (body.deliveryMethod === 'mail') {
    if (typeof body.subjectTemplate !== 'string' || !body.subjectTemplate.trim() || body.subjectTemplate.length > MAX_SUBJECT_TEMPLATE_LENGTH) {
      throw schedulerError(`Onderwerp-template is verplicht en max ${MAX_SUBJECT_TEMPLATE_LENGTH} tekens.`, 'INVALID_SUBJECT_TEMPLATE');
    }
  }
  if (typeof body.messageTemplate !== 'string' || !body.messageTemplate.trim() || body.messageTemplate.length > MAX_MESSAGE_TEMPLATE_LENGTH) {
    throw schedulerError(`Bericht-template is verplicht en max ${MAX_MESSAGE_TEMPLATE_LENGTH} tekens.`, 'INVALID_MESSAGE_TEMPLATE');
  }
}

// ─── Cron-entry ─────────────────────────────────────────────────────────────

async function fetchAppAndCreator(supabase, appId, creatorUserId) {
  const [{ data: app, error: appErr }, { data: creator, error: creatorErr }] = await Promise.all([
    supabase.from('mini_apps').select('id, title').eq('id', appId).maybeSingle(),
    supabase.from('users').select('id, email, username, is_active').eq('id', creatorUserId).maybeSingle()
  ]);
  if (appErr) throw new Error(appErr.message);
  if (creatorErr) throw new Error(creatorErr.message);
  if (!app) throw schedulerError('Mini-app niet gevonden (verwijderd?).', 'APP_NOT_FOUND');
  if (!creator || !creator.is_active) throw schedulerError('Aanmaker van de taak is niet (meer) actief.', 'CREATOR_INACTIVE');
  return { app, creator };
}

async function logTaskRun(supabase, { taskId, appId, creatorUserId, status, errorMessage, renderedPreview }) {
  const { error } = await supabase.from('mini_app_scheduled_task_log').insert({
    scheduled_task_id: taskId,
    mini_app_id: appId,
    created_by_user_id: creatorUserId,
    status,
    error_message: errorMessage || null,
    rendered_preview: renderedPreview ? renderedPreview.slice(0, 1000) : null
  });
  if (error) console.error('[mini-apps] scheduled-task audit-log insert failed:', error.message);
}

/**
 * Verwerkt ÉÉN due taak: bouwt de context, rendert, verstuurt, logt, en
 * berekent altijd een nieuwe next_run_at (ook bij een fout -- een structureel
 * kapotte taak mag niet elke 15 min opnieuw proberen en de cron vervuilen;
 * de fout blijft zichtbaar via last_run_status/last_run_error voor de
 * eigenaar). Bij een ONHERSTELBARE recurrence (computeNextRun geeft null)
 * wordt de taak gedeactiveerd.
 */
async function processTask(env, supabase, task, now) {
  let status = 'failed';
  let errorMessage = null;
  let renderedPreview = null;
  let deactivate = false;

  try {
    const { app, creator } = await fetchAppAndCreator(supabase, task.mini_app_id, task.created_by_user_id);
    const context = await buildContext(env, task.mini_app_id);

    if (task.delivery_method === 'mail') {
      const subject = renderTemplate(task.subject_template || '', context, MAX_SUBJECT_TEMPLATE_LENGTH);
      const message = renderTemplate(task.message_template, context, MAX_RENDERED_MAIL_LENGTH);
      renderedPreview = `[${subject}] ${message}`;
      const to = task.target_type === 'self' ? 'self' : task.target_user_id;
      const result = await notifyUser(env, app, creator, to, subject, message);
      status = result.skipped ? 'skipped' : 'sent';
    } else {
      const message = renderTemplate(task.message_template, context, MAX_RENDERED_CHAT_LENGTH);
      renderedPreview = message;
      await sendChannelMessage(env, app, creator, task.target_channel_id, message);
      status = 'sent';
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err.message || String(err);
    console.error(`[mini-apps][scheduler] taak ${task.id} (app ${task.mini_app_id}) mislukt:`, errorMessage);
  }

  let nextRunAt = null;
  try {
    nextRunAt = computeNextRun(task.recurrence, now);
    if (!nextRunAt) {
      deactivate = true;
      errorMessage = errorMessage || 'Kan geen volgende uitvoering berekenen (ongeldige recurrence) -- taak uitgeschakeld.';
    }
  } catch (err) {
    deactivate = true;
    errorMessage = errorMessage || err.message;
  }

  const updatePayload = {
    last_run_at: now.toISOString(),
    last_run_status: status,
    last_run_error: errorMessage,
    next_run_at: nextRunAt ? nextRunAt.toISOString() : null
  };
  if (deactivate) updatePayload.is_active = false;

  const { error: updateErr } = await supabase
    .from('mini_app_scheduled_tasks')
    .update(updatePayload)
    .eq('id', task.id);
  if (updateErr) console.error('[mini-apps][scheduler] next_run_at-update mislukt voor taak', task.id, updateErr.message);

  await logTaskRun(supabase, {
    taskId: task.id,
    appId: task.mini_app_id,
    creatorUserId: task.created_by_user_id,
    status,
    errorMessage,
    renderedPreview
  });
}

/**
 * Cron-entry, aangeroepen vanuit src/index.js#scheduled() (elke 15 min).
 * Verwerkt taken sequentieel en isoleert fouten per taak -- één kapotte taak
 * mag de rest van de cron-tick nooit blokkeren.
 */
export async function runDueScheduledTasks(env) {
  const supabase = getSupabaseClient(env);
  const now = new Date();

  const { data: dueTasks, error } = await supabase
    .from('mini_app_scheduled_tasks')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(MAX_TASKS_PER_RUN);

  if (error) {
    console.error('[mini-apps][scheduler] due-taken ophalen mislukt:', error.message);
    return;
  }
  if (!dueTasks || dueTasks.length === 0) return;

  for (const task of dueTasks) {
    await processTask(env, supabase, task, now);
  }
}

/**
 * Voert ÉÉN taak onmiddellijk uit, los van de cron -- gebruikt door de
 * "Nu testen"-knop (POST /api/apps/:id/schedules/:scheduleId/run-now) zodat
 * een app-bouwer zijn template/recurrence kan verifiëren zonder tot de
 * volgende due-tijd te moeten wachten. Zelfde verwerking (context/render/
 * versturen/loggen/next_run_at-herberekening) als een normale cron-tick --
 * geen apart "test-only"-pad dat uit sync zou kunnen raken.
 */
export async function runTaskNow(env, taskId) {
  const supabase = getSupabaseClient(env);
  const { data: task, error } = await supabase
    .from('mini_app_scheduled_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) throw schedulerError('Taak niet gevonden.', 'TASK_NOT_FOUND');

  await processTask(env, supabase, task, new Date());

  const { data: updated, error: refetchErr } = await supabase
    .from('mini_app_scheduled_tasks')
    .select('id, last_run_status, last_run_error, next_run_at, is_active')
    .eq('id', taskId)
    .maybeSingle();
  if (refetchErr) throw new Error(refetchErr.message);
  return updated;
}
