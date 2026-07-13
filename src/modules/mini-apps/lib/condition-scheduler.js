/**
 * Mini-Apps — Criteria-taken (5de generieke bouwblok)
 *
 * Laat een mini-app een mail/chat-bericht versturen ZODRA een voorwaarde in
 * de eigen gedeelde opslag waar wordt (bv. "een collection-item met
 * status=nieuw", "een kv-waarde die vandaag betekent"), OOK als niemand die
 * dag de app opent. Aangeroepen via window.platform.condition.create(...) in
 * de iframe-shim (public/mini-apps.js) en de /api/apps/:id/condition-tasks-
 * routes (routes.js).
 *
 * BEWUST VOLLEDIG GESCHEIDEN van lib/scheduler.js (mini_app_scheduled_tasks,
 * 4de bouwblok): dat bouwblok stuurt op een VAST TIJDSTIP/INTERVAL (pure
 * datum-wiskunde); dit bouwblok stuurt wanneer een DATA-VOORWAARDE overgaat
 * van niet-waar naar waar (edge-triggered), ongeacht het tijdstip. Eigen
 * tabel (mini_app_condition_tasks), eigen cron-tak ("*\/5 * * * *", zie
 * event.cron-gate in src/index.js#scheduled()), eigen renderer/date-helpers
 * hieronder -- geen gedeelde code met scheduler.js, op expliciet verzoek.
 *
 * Veiligheidsprincipe (zelfde lijn als scheduler.js): we voeren de HTML/JS
 * van de mini-app NOOIT onbemand uit (geen headless browser, geen eval/
 * Function-constructor van app-code op de server). Een taak slaat in plaats
 * daarvan een DECLARATIEVE voorwaarde op (pure data-vergelijking, zie
 * evaluateCriteria hieronder) + een logic-less tekst-template (renderTemplate)
 * die enkel data uit de eigen gedeelde opslag van de app leest.
 *
 * Edge-triggered dedup: elke taak onthoudt last_condition_met (was de
 * voorwaarde de VORIGE tick al waar?). Enkel de overgang false -> true
 * triggert een send -- zo blijft de app niet elke 5 min hetzelfde bericht
 * spammen zolang de voorwaarde waar blijft.
 *
 * runDueConditionTasks(env) is de cron-entry (aangeroepen vanuit
 * src/index.js#scheduled(), enkel op de "*\/5 * * * *"-trigger): evalueert
 * ELKE actieve taak van ELKE app, groepeert per app (één storage-fetch per
 * app per tick, ongeacht hoeveel taken die app heeft), en verstuurt via de
 * BESTAANDE notifyUser()/sendChannelMessage() -- dus dezelfde
 * ontvanger-herleiding, rate-limits en audit-log als een interactieve send.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { listStorage, listAllCollections } from './storage.js';
import { notifyUser } from './notify.js';
import { sendChannelMessage } from './chat.js';

export const ORG_TIMEZONE = 'Europe/Brussels';
export const MAX_CONDITION_TASKS_PER_APP = 20;
export const MAX_NAME_LENGTH = 100;
export const MAX_SUBJECT_TEMPLATE_LENGTH = 200;
export const MAX_MESSAGE_TEMPLATE_LENGTH = 4000;
export const MAX_EACH_ITEMS = 200;
export const MAX_ROTATION_ITEMS = 50;
export const MAX_RENDERED_MAIL_LENGTH = 4500;   // blijft ruim onder notify.js' MAX_MESSAGE_LENGTH (5000)
export const MAX_RENDERED_CHAT_LENGTH = 3500;   // blijft ruim onder chat.js' MAX_MESSAGE_LENGTH (4000)

const MAX_TASKS_PER_RUN = 300; // hard cap per cron-tick (over alle apps samen)

function conditionError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ─── Datum-wiskunde (Europe/Brussels, DST-veilig) ──────────────────────────
//
// Eigen, kleine kopie van dezelfde pure Intl-gebaseerde arithmetiek als
// lib/scheduler.js -- bewust NIET gedeeld (zie bestandskop hierboven).

function formatPartsInZone(date, timeZone, opts) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', ...opts });
  return dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
}

function getZonedYMD(date, timeZone) {
  const p = formatPartsInZone(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return { y: +p.year, m: +p.month, d: +p.day };
}

function civilWeekday(ymd) {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay(); // 0 = zondag
}

function diffCivilDays(a, b) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

function parseYMD(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymdToString(ymd) {
  return `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}`;
}

const WEEKDAY_NAMES_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO-8601 weeknummer + weekjaar voor een civiele datum. Standaardalgoritme
 * (nearest-Thursday-methode), volledig op UTC-basis -- geen library nodig.
 */
function isoWeekInfo(ymd) {
  const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  const dayNum = (date.getUTCDay() + 6) % 7; // maandag = 0 .. zondag = 6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // dichtstbijzijnde donderdag
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const isoWeek = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { isoWeek, isoYear };
}

/**
 * Berekent de "dag-context" builtins voor criteria-vergelijking EN de
 * template-renderer, op basis van `now` in `timeZone`. Geeft enkel strings
 * terug (criteria/template-waarden zijn altijd strings).
 */
function computeBuiltins(now, timeZone) {
  const civil = getZonedYMD(now, timeZone);
  const { isoWeek, isoYear } = isoWeekInfo(civil);
  return {
    today: ymdToString(civil),
    weekday: String(civilWeekday(civil)),
    weekdayName: WEEKDAY_NAMES_NL[civilWeekday(civil)],
    isoWeek: String(isoWeek),
    isoYear: String(isoYear)
  };
}

const BUILTIN_NAMES = ['today', 'weekday', 'weekdayName', 'isoWeek', 'isoYear'];
const BUILTIN_RE = new RegExp(`\\{\\{(${BUILTIN_NAMES.join('|')})\\}\\}`, 'g');

/**
 * Vult {{today}}/{{weekday}}/... in binnen een criteria- of
 * template-attribuutwaarde (bv. equals="{{today}}") -- puur string-
 * substitutie, geen expressie-taal.
 */
function resolveBuiltinRefs(raw, builtins) {
  if (raw === undefined) return undefined;
  return raw.replace(BUILTIN_RE, (m, name) => {
    const v = builtins[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

// ─── Rotations (beurtrol met interval + uitzonderingen, pure datum-wiskunde) ─

const ROTATION_KEY_RE = /^__rotation_(.+)__$/;

/**
 * Zoekt rotation-definities in de platte kv-opslag van de app -- gereserveerde
 * key-conventie `__rotation_NAAM__`, waarde = JSON:
 *   { anchorDate: "YYYY-MM-DD", intervalDays: 14, items: ["Jan","Piet",...],
 *     exceptionsCollection?: "afwezigheden", exceptionDateField?: "date",
 *     exceptionPersonField?: "person" }
 * Geen aparte opslag-API nodig -- dit hergebruikt de bestaande kv-store
 * (lib/storage.js). Ongeldige/kapotte definities worden stilzwijgend
 * overgeslagen (nooit crashen op app-data).
 */
function parseRotationDefinitions(kv) {
  const defs = {};
  for (const [key, value] of Object.entries(kv)) {
    const m = ROTATION_KEY_RE.exec(key);
    if (!m) continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0 && parsed.items.length <= MAX_ROTATION_ITEMS) {
        defs[m[1]] = parsed;
      }
    } catch (e) {
      // ongeldige JSON in een __rotation_..__-key -- overslaan, nooit crashen.
    }
  }
  return defs;
}

/**
 * Berekent wie/wat VANDAAG aan de beurt is voor één rotation-definitie: pure
 * datum-arithmetiek -- géén eval, geen headless uitvoering van app-code.
 * Cyclus = floor((vandaag - anchorDate) / intervalDays); wraparound via
 * modulo binnen `items`. Uitzonderingen (bv. vakantiedagen) komen uit een
 * gewone collection en slaan de aan-de-beurt-persoon voor vandaag over,
 * cascaderend naar de volgende in de rotatie-volgorde. Als IEDEREEN vandaag
 * een uitzondering heeft, geven we toch de oorspronkelijk geplande persoon
 * terug (beter een naam tonen dan een leeg bericht).
 */
function computeRotationActive(def, todayCivil, collections) {
  if (!def || !Array.isArray(def.items) || def.items.length === 0) return null;
  if (typeof def.anchorDate !== 'string' || !DATE_RE.test(def.anchorDate) || isNaN(Date.parse(def.anchorDate))) return null;

  const intervalDays = Number.isInteger(def.intervalDays) && def.intervalDays > 0 ? def.intervalDays : 7;
  const anchorYMD = parseYMD(def.anchorDate);
  const diff = diffCivilDays(anchorYMD, todayCivil);
  const cycleIndex = Math.floor(diff / intervalDays);
  const n = def.items.length;
  const basePos = ((cycleIndex % n) + n) % n;

  const exceptionsToday = new Set();
  if (typeof def.exceptionsCollection === 'string' && def.exceptionsCollection) {
    const dateField = typeof def.exceptionDateField === 'string' && def.exceptionDateField ? def.exceptionDateField : 'date';
    const personField = typeof def.exceptionPersonField === 'string' && def.exceptionPersonField ? def.exceptionPersonField : 'person';
    const items = Array.isArray(collections[def.exceptionsCollection]) ? collections[def.exceptionsCollection] : [];
    const todayStr = ymdToString(todayCivil);
    for (const item of items) {
      try {
        const parsed = JSON.parse(item.value);
        if (parsed && parsed[dateField] === todayStr && typeof parsed[personField] === 'string') {
          exceptionsToday.add(parsed[personField]);
        }
      } catch (e) {
        // geen geldige JSON -- gewoon geen uitzondering, niet crashen.
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const pos = (basePos + i) % n;
    if (!exceptionsToday.has(def.items[pos])) return def.items[pos];
  }
  return def.items[basePos]; // iedereen afwezig -- toch iemand tonen i.p.v. niets.
}

// ─── Criteria: validatie + evaluatie (pure data-vergelijking, geen eval) ───

/**
 * Valideert de criteria-vorm. Twee soorten:
 *   { source: 'kv', key: string, equals?: string, notEquals?: string }
 *   { source: 'collection', collection: string, field: string,
 *     equals?: string, notEquals?: string }
 * Minstens één van equals/notEquals is verplicht. Beide mogen
 * {{today}}/{{weekday}}/{{weekdayName}}/{{isoWeek}}/{{isoYear}} bevatten.
 */
export function validateCriteria(criteria) {
  if (!criteria || typeof criteria !== 'object') {
    throw conditionError('Criteria is verplicht.', 'INVALID_CRITERIA');
  }
  if (criteria.source !== 'kv' && criteria.source !== 'collection') {
    throw conditionError("Criteria source moet 'kv' of 'collection' zijn.", 'INVALID_CRITERIA_SOURCE');
  }
  if (criteria.source === 'kv') {
    if (typeof criteria.key !== 'string' || !criteria.key.trim()) {
      throw conditionError('Criteria key is verplicht bij source "kv".', 'INVALID_CRITERIA_KEY');
    }
  } else {
    if (typeof criteria.collection !== 'string' || !criteria.collection.trim()) {
      throw conditionError('Criteria collection is verplicht bij source "collection".', 'INVALID_CRITERIA_COLLECTION');
    }
    if (typeof criteria.field !== 'string' || !criteria.field.trim()) {
      throw conditionError('Criteria field is verplicht bij source "collection".', 'INVALID_CRITERIA_FIELD');
    }
  }
  if (criteria.equals === undefined && criteria.notEquals === undefined) {
    throw conditionError('Geef minstens equals of notEquals op.', 'INVALID_CRITERIA_COMPARISON');
  }
  if (criteria.equals !== undefined && typeof criteria.equals !== 'string') {
    throw conditionError('equals moet een string zijn.', 'INVALID_CRITERIA_EQUALS');
  }
  if (criteria.notEquals !== undefined && typeof criteria.notEquals !== 'string') {
    throw conditionError('notEquals moet een string zijn.', 'INVALID_CRITERIA_NOT_EQUALS');
  }
}

/**
 * Evalueert of een criteria-taak NU waar is, tegen de gebouwde context van
 * de app ({ kv, collections, builtins }). Puur string-vergelijking -- geen
 * expressie-taal, geen eval.
 */
export function evaluateCriteria(criteria, context) {
  const builtins = context.builtins || {};
  const equalsVal = resolveBuiltinRefs(criteria.equals, builtins);
  const notEqualsVal = resolveBuiltinRefs(criteria.notEquals, builtins);

  function passesComparison(v) {
    if (equalsVal !== undefined && v !== equalsVal) return false;
    if (notEqualsVal !== undefined && v === notEqualsVal) return false;
    return true;
  }

  if (criteria.source === 'kv') {
    const v = context.kv ? context.kv[criteria.key] : undefined;
    if (v === undefined || v === null) return false;
    return passesComparison(v);
  }

  if (criteria.source === 'collection') {
    const items = Array.isArray(context.collections?.[criteria.collection]) ? context.collections[criteria.collection] : [];
    return items.some(item => {
      let parsed;
      try {
        parsed = JSON.parse(item.value);
      } catch (e) {
        return false;
      }
      if (!parsed || typeof parsed !== 'object' || !(criteria.field in parsed)) return false;
      const v = parsed[criteria.field] === null || parsed[criteria.field] === undefined ? '' : String(parsed[criteria.field]);
      return passesComparison(v);
    });
  }

  return false;
}

// ─── Logic-less template-renderer (geen eval, enkel string-substitutie) ────
// Zelfde grammatica als lib/scheduler.js's renderTemplate, bewust als eigen
// kopie hier (zie bestandskop) + uitgebreid met {{#eachWhere}}.

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
const EACH_WHERE_RE = /\{\{#eachWhere\s+([a-zA-Z0-9_-]+)\s+field="([a-zA-Z0-9_-]+)"(?:\s+equals="([^"]*)")?(?:\s+notEquals="([^"]*)")?\}\}([\s\S]*?)\{\{\/eachWhere\}\}/;

/**
 * Rendert een template tegen een context { kv, collections, builtins,
 * rotations }. Ondersteunt:
 *   {{kv.KEY}}                                   -- platte waarde
 *   {{today}} / {{weekday}} / {{weekdayName}} / {{isoWeek}} / {{isoYear}}
 *     -- server-berekende dag-context (Europe/Brussels)
 *   {{rotation.NAAM}}                            -- actieve rotation-item
 *   {{#each collectie}}...{{this}}/{{this.veld}}...{{/each}}
 *   {{#eachWhere collectie field="x" equals="y"}}...{{/eachWhere}}
 *     -- gefilterde iteratie (equals/notEquals mogen builtins bevatten)
 *   {{#isEmpty collectie}}...{{/isEmpty}}         -- enkel als collectie leeg is
 *   {{#notEmpty collectie}}...{{/notEmpty}}       -- enkel als collectie niet leeg is
 * Geen nesting van blocks (bewust simpel gehouden). Onbekende/kapotte tags
 * worden stilzwijgend leeg gerenderd, nooit doorgestuurd als ruwe syntax naar
 * de ontvanger. Alles hier blijft pure string-substitutie/-vergelijking en
 * datum-arithmetiek -- geen eval, geen Function-constructor.
 */
export function renderTemplate(template, context, maxLength) {
  let out = template;
  const collections = context.collections || {};
  const kv = context.kv || {};
  const builtins = context.builtins || {};
  const rotations = context.rotations || {};

  for (let i = 0; i < 100; i++) {
    const blockMatch = BLOCK_RE.exec(out);
    const eachWhereMatch = EACH_WHERE_RE.exec(out);
    if (!blockMatch && !eachWhereMatch) break;

    if (eachWhereMatch && (!blockMatch || eachWhereMatch.index <= blockMatch.index)) {
      const [full, name, field, equalsRaw, notEqualsRaw, inner] = eachWhereMatch;
      const equalsVal = resolveBuiltinRefs(equalsRaw, builtins);
      const notEqualsVal = resolveBuiltinRefs(notEqualsRaw, builtins);
      const items = Array.isArray(collections[name]) ? collections[name].slice(0, MAX_EACH_ITEMS) : [];
      const filtered = items.filter(item => {
        let parsed;
        try {
          parsed = JSON.parse(item.value);
        } catch (e) {
          return false;
        }
        if (!parsed || typeof parsed !== 'object' || !(field in parsed)) return false;
        const v = parsed[field] === null || parsed[field] === undefined ? '' : String(parsed[field]);
        if (equalsVal !== undefined && v !== equalsVal) return false;
        if (notEqualsVal !== undefined && v === notEqualsVal) return false;
        return true;
      });
      const replacement = filtered.map(item => renderEachInner(inner, item)).join('\n');
      out = out.slice(0, eachWhereMatch.index) + replacement + out.slice(eachWhereMatch.index + full.length);
      continue;
    }

    const [full, kind, name, inner] = blockMatch;
    const items = Array.isArray(collections[name]) ? collections[name].slice(0, MAX_EACH_ITEMS) : [];

    let replacement = '';
    if (kind === 'each') {
      replacement = items.map(item => renderEachInner(inner, item)).join('\n');
    } else if (kind === 'isEmpty') {
      replacement = items.length === 0 ? inner : '';
    } else if (kind === 'notEmpty') {
      replacement = items.length > 0 ? inner : '';
    }
    out = out.slice(0, blockMatch.index) + replacement + out.slice(blockMatch.index + full.length);
  }

  out = out.replace(/\{\{kv\.([a-zA-Z0-9_-]+)\}\}/g, (m, key) => {
    const v = kv[key];
    return v === null || v === undefined ? '' : String(v);
  });

  out = out.replace(BUILTIN_RE, (m, name) => {
    const v = builtins[name];
    return v === undefined || v === null ? '' : String(v);
  });

  out = out.replace(/\{\{rotation\.([a-zA-Z0-9_-]+)\}\}/g, (m, name) => {
    const v = rotations[name];
    return v === undefined || v === null ? '' : String(v);
  });

  out = out.replace(/\{\{[^}]*\}\}/g, '');

  return typeof maxLength === 'number' ? truncate(out, maxLength) : out;
}

/**
 * Bouwt de context voor één app: alle platte kv-waarden + alle collections
 * (bounded door de bestaande opslag-quota's in lib/storage.js -- max 500
 * objecten per app), plus de server-berekende dag-context (builtins) en
 * actieve rotation-items. `now`/`timeZone` optioneel (default: huidig
 * moment, Europe/Brussels) zodat de cron en "Nu testen" altijd tegen
 * dezelfde klok werken.
 */
export async function buildContext(env, appId, now = new Date(), timeZone = ORG_TIMEZONE) {
  const [kv, collections] = await Promise.all([
    listStorage(env, appId),
    listAllCollections(env, appId)
  ]);

  const todayCivil = getZonedYMD(now, timeZone);
  const builtins = computeBuiltins(now, timeZone);

  const rotations = {};
  for (const [name, def] of Object.entries(parseRotationDefinitions(kv))) {
    const active = computeRotationActive(def, todayCivil, collections);
    if (active !== null) rotations[name] = active;
  }

  return { kv, collections, builtins, rotations };
}

// ─── CRUD-helpers (gebruikt door routes.js) ────────────────────────────────

/**
 * Valideert en normaliseert een create/update-payload voor een criteria-
 * taak. Zelfde target/delivery-regels als lib/scheduler.js#validateTaskPayload
 * (geen recurrence hier, wel criteria).
 */
export function validateConditionTaskPayload(body) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > MAX_NAME_LENGTH) {
    throw conditionError(`Naam is verplicht en max ${MAX_NAME_LENGTH} tekens.`, 'INVALID_NAME');
  }
  validateCriteria(body.criteria);

  if (body.deliveryMethod !== 'mail' && body.deliveryMethod !== 'chat') {
    throw conditionError("deliveryMethod moet 'mail' of 'chat' zijn.", 'INVALID_DELIVERY_METHOD');
  }
  if (!['self', 'colleague', 'channel'].includes(body.targetType)) {
    throw conditionError("targetType moet 'self', 'colleague' of 'channel' zijn.", 'INVALID_TARGET_TYPE');
  }

  if (body.targetType === 'self') {
    if (body.deliveryMethod !== 'mail') {
      throw conditionError("targetType 'self' vereist deliveryMethod 'mail'.", 'INVALID_TARGET_COMBINATION');
    }
  } else if (body.targetType === 'colleague') {
    if (body.deliveryMethod !== 'mail' || typeof body.targetUserId !== 'string' || !body.targetUserId.trim()) {
      throw conditionError("targetType 'colleague' vereist deliveryMethod 'mail' en een targetUserId.", 'INVALID_TARGET_COMBINATION');
    }
  } else if (body.targetType === 'channel') {
    if (body.deliveryMethod !== 'chat' || typeof body.targetChannelId !== 'string' || !body.targetChannelId.trim()) {
      throw conditionError("targetType 'channel' vereist deliveryMethod 'chat' en een targetChannelId.", 'INVALID_TARGET_COMBINATION');
    }
  }

  if (body.deliveryMethod === 'mail') {
    if (typeof body.subjectTemplate !== 'string' || !body.subjectTemplate.trim() || body.subjectTemplate.length > MAX_SUBJECT_TEMPLATE_LENGTH) {
      throw conditionError(`Onderwerp-template is verplicht en max ${MAX_SUBJECT_TEMPLATE_LENGTH} tekens.`, 'INVALID_SUBJECT_TEMPLATE');
    }
  }
  if (typeof body.messageTemplate !== 'string' || !body.messageTemplate.trim() || body.messageTemplate.length > MAX_MESSAGE_TEMPLATE_LENGTH) {
    throw conditionError(`Bericht-template is verplicht en max ${MAX_MESSAGE_TEMPLATE_LENGTH} tekens.`, 'INVALID_MESSAGE_TEMPLATE');
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
  if (!app) throw conditionError('Mini-app niet gevonden (verwijderd?).', 'APP_NOT_FOUND');
  if (!creator || !creator.is_active) throw conditionError('Aanmaker van de taak is niet (meer) actief.', 'CREATOR_INACTIVE');
  return { app, creator };
}

async function logConditionTaskRun(supabase, { taskId, appId, creatorUserId, status, errorMessage, renderedPreview }) {
  const { error } = await supabase.from('mini_app_condition_task_log').insert({
    condition_task_id: taskId,
    mini_app_id: appId,
    created_by_user_id: creatorUserId,
    status,
    error_message: errorMessage || null,
    rendered_preview: renderedPreview ? renderedPreview.slice(0, 1000) : null
  });
  if (error) console.error('[mini-apps] condition-task audit-log insert failed:', error.message);
}

/**
 * Verwerkt ÉÉN criteria-taak tegen een al-opgebouwde context (gedeeld per
 * app binnen dezelfde tick, zie runDueConditionTasks). Edge-triggered: stuurt
 * enkel als de voorwaarde nu waar is EN de vorige tick nog niet waar was
 * (tenzij opts.forceTrigger, gebruikt door "Nu testen"). Werkt altijd
 * last_condition_met/last_checked_at bij, ook als er niet verstuurd wordt --
 * dat is precies hoe de edge-detectie werkt.
 */
async function processConditionTask(env, supabase, task, context, now, opts = {}) {
  let conditionMet = false;
  try {
    conditionMet = evaluateCriteria(task.criteria, context);
  } catch (err) {
    console.error(`[mini-apps][condition-scheduler] criteria evalueren mislukt voor taak ${task.id}:`, err.message);
    await supabase.from('mini_app_condition_tasks').update({ last_checked_at: now.toISOString() }).eq('id', task.id);
    return;
  }

  const wasMetBefore = !!task.last_condition_met;
  const shouldTrigger = opts.forceTrigger || (conditionMet && !wasMetBefore);

  const updatePayload = {
    last_condition_met: conditionMet,
    last_checked_at: now.toISOString()
  };

  if (!shouldTrigger) {
    const { error: updateErr } = await supabase.from('mini_app_condition_tasks').update(updatePayload).eq('id', task.id);
    if (updateErr) console.error('[mini-apps][condition-scheduler] state-update mislukt voor taak', task.id, updateErr.message);
    return;
  }

  let status = 'failed';
  let errorMessage = null;
  let renderedPreview = null;

  try {
    const { app, creator } = await fetchAppAndCreator(supabase, task.mini_app_id, task.created_by_user_id);

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
    console.error(`[mini-apps][condition-scheduler] taak ${task.id} (app ${task.mini_app_id}) mislukt:`, errorMessage);
  }

  updatePayload.last_triggered_at = now.toISOString();
  updatePayload.last_run_at = now.toISOString();
  updatePayload.last_run_status = status;
  updatePayload.last_run_error = errorMessage;

  const { error: updateErr } = await supabase
    .from('mini_app_condition_tasks')
    .update(updatePayload)
    .eq('id', task.id);
  if (updateErr) console.error('[mini-apps][condition-scheduler] update mislukt voor taak', task.id, updateErr.message);

  await logConditionTaskRun(supabase, {
    taskId: task.id,
    appId: task.mini_app_id,
    creatorUserId: task.created_by_user_id,
    status,
    errorMessage,
    renderedPreview
  });
}

/**
 * Cron-entry, aangeroepen vanuit src/index.js#scheduled() -- ENKEL op de
 * "*\/5 * * * *"-trigger (zie event.cron-gate daar), volledig los van de
 * "*\/15 * * * *"-trigger van runDueScheduledTasks (lib/scheduler.js).
 * Groepeert taken per app zodat storage (kv+collections) maar één keer per
 * app opgehaald wordt, ongeacht hoeveel criteria-taken die app heeft.
 * Verwerkt taken sequentieel en isoleert fouten per taak/app -- één kapotte
 * taak of app mag de rest van de cron-tick nooit blokkeren.
 */
export async function runDueConditionTasks(env) {
  const supabase = getSupabaseClient(env);
  const now = new Date();

  const { data: tasks, error } = await supabase
    .from('mini_app_condition_tasks')
    .select('*')
    .eq('is_active', true)
    .limit(MAX_TASKS_PER_RUN);

  if (error) {
    console.error('[mini-apps][condition-scheduler] actieve taken ophalen mislukt:', error.message);
    return;
  }
  if (!tasks || tasks.length === 0) return;

  const byApp = new Map();
  for (const task of tasks) {
    if (!byApp.has(task.mini_app_id)) byApp.set(task.mini_app_id, []);
    byApp.get(task.mini_app_id).push(task);
  }

  for (const [appId, appTasks] of byApp) {
    let context;
    try {
      context = await buildContext(env, appId, now);
    } catch (err) {
      console.error(`[mini-apps][condition-scheduler] context ophalen mislukt voor app ${appId}:`, err.message);
      continue;
    }
    for (const task of appTasks) {
      await processConditionTask(env, supabase, task, context, now);
    }
  }
}

/**
 * Voert ÉÉN criteria-taak onmiddellijk uit, los van de cron -- gebruikt door
 * de "Nu testen"-knop (POST /api/apps/:id/condition-tasks/:taskId/run-now).
 * Forceert de send ONGEACHT de edge-triggering (opts.forceTrigger) zodat een
 * app-bouwer zijn criteria/template kan verifiëren zonder eerst zelf de
 * voorwaarde false->true te moeten laten overgaan -- last_condition_met wordt
 * wel gewoon bijgewerkt naar de ACTUELE waarde, zodat de eerstvolgende
 * cron-tick niet per ongeluk nog eens (dubbel) triggert.
 */
export async function runConditionTaskNow(env, taskId) {
  const supabase = getSupabaseClient(env);
  const { data: task, error } = await supabase
    .from('mini_app_condition_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) throw conditionError('Taak niet gevonden.', 'TASK_NOT_FOUND');

  const now = new Date();
  const context = await buildContext(env, task.mini_app_id, now);
  await processConditionTask(env, supabase, task, context, now, { forceTrigger: true });

  const { data: updated, error: refetchErr } = await supabase
    .from('mini_app_condition_tasks')
    .select('id, last_run_status, last_run_error, last_condition_met, last_triggered_at, is_active')
    .eq('id', taskId)
    .maybeSingle();
  if (refetchErr) throw new Error(refetchErr.message);
  return updated;
}
