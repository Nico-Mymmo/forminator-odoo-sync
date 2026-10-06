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
 *    {{#isEmpty collectie}}...{{/isEmpty}}, {{#notEmpty collectie}}...{{/notEmpty}},
 *    plus (sinds 2026-07, zie git-historie) dezelfde server-berekende dag-
 *    context als condition-scheduler.js: {{today}}/{{weekday}}/{{weekdayName}}/
 *    {{isoWeek}}/{{isoYear}} en {{#eachWhere collectie field="x" equals="y"}}.
 *    Dit was bewust ENKEL bij criteria-taken beschikbaar tot bleek dat een
 *    vast-tijdstip-taak die "vandaag"-data wil versturen anders afhankelijk
 *    is van een client-side ververste kv-waarde (die stil verouderd blijft
 *    als niemand de app die dag opent, ook al vuurt de cron zelf wel op tijd)
 *    -- zie het incident met de winkeldienst-mini-app. Rotation ({{rotation.*}})
 *    blijft wel enkel bij condition-scheduler.js, geen vraag naar hier.
 *    Geen eval, geen Function-constructor, geen willekeurige expressies --
 *    enkel string-substitutie, dus geen code-executie-oppervlak.
 *  - onlyIf (sinds 2026-10): een VERZENDVOORWAARDE, nagekeken op het moment
 *    van versturen -- "alleen als er in collectie X een item is dat aan dit
 *    filter voldoet". Het filter is hetzelfde als bij
 *    sharedStorage.listItems() (lib/storage-query.js) en wordt in de eigen
 *    database van de app geteld. Zo bepaalt de APP met haar eigen gegevens
 *    (een rooster, gesloten dagen) of er vandaag iets vertrekt, in plaats
 *    van dat die regel ook nog eens in de recurrence moet staan. Niet
 *    voldaan = status 'skipped' met de reden in last_run_error.
 *  - key (sinds 2026-10): een sleutel die de app zelf kiest, uniek per app.
 *    Daarmee kan een app met ensure() zeggen "zo moet deze taak eruitzien";
 *    de server vergelijkt de HELE instelling en werkt de taak ter plekke
 *    bij (zelfde id, zelfde historiek). Winkellijst vergeleek zelf enkel de
 *    berichttekst, en daardoor bleef een oude recurrence maanden staan.
 *
 * Naar buiten (routes.js -> de app) gaat een taak ALTIJD door taskRowToDto():
 * dezelfde veldnamen als bij het aanmaken (targetChannelId, niet
 * target_channel_id), plus recurrenceText ("ma-vr om 09:30") en nextRunAt.
 * Tot 2026-10 kwam de databaserij rechtstreeks terug, en moest een app raden
 * onder welke naam het kanaal stond.
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
import { listStorage, listAllCollections, countCollectionItems, MAX_COLLECTION_LENGTH } from './storage.js';
import { normalizeQuery } from './storage-query.js';
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymdToString(ymd) {
  return `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}`;
}

const WEEKDAY_NAMES_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

/**
 * ISO-8601 weeknummer + weekjaar voor een civiele datum. Standaardalgoritme
 * (nearest-Thursday-methode), volledig op UTC-basis -- geen library nodig.
 * Zelfde implementatie als condition-scheduler.js#isoWeekInfo.
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
 * Berekent de "dag-context" builtins voor de template-renderer, op basis van
 * `now` in `timeZone`. Geeft enkel strings terug (template-waarden zijn
 * altijd strings). Zelfde implementatie als condition-scheduler.js#computeBuiltins.
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
 * Vult {{today}}/{{weekday}}/... in binnen een template-attribuutwaarde (bv.
 * equals="{{today}}") -- puur string-substitutie, geen expressie-taal.
 * Zelfde implementatie als condition-scheduler.js#resolveBuiltinRefs.
 */
function resolveBuiltinRefs(raw, builtins) {
  if (raw === undefined) return undefined;
  return raw.replace(BUILTIN_RE, (m, name) => {
    const v = builtins[name];
    return v === undefined || v === null ? '' : String(v);
  });
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
const EACH_WHERE_RE = /\{\{#eachWhere\s+([a-zA-Z0-9_-]+)\s+field="([a-zA-Z0-9_-]+)"(?:\s+equals="([^"]*)")?(?:\s+notEquals="([^"]*)")?\}\}([\s\S]*?)\{\{\/eachWhere\}\}/;

/**
 * Rendert een template tegen een context { kv, collections, builtins }.
 * Ondersteunt:
 *   {{kv.KEY}}                                   -- platte waarde
 *   {{today}} / {{weekday}} / {{weekdayName}} / {{isoWeek}} / {{isoYear}}
 *     -- server-berekende dag-context (Europe/Brussels)
 *   {{#each collectie}}...{{this}}/{{this.veld}}...{{/each}}
 *   {{#eachWhere collectie field="x" equals="y"}}...{{/eachWhere}}
 *     -- gefilterde iteratie (equals/notEquals mogen builtins bevatten, bv.
 *     equals="{{today}}" -- dit was de ontbrekende stap die de winkeldienst-
 *     mini-app trof: zonder deze filter kon een vast-tijdstip-taak "vandaag"
 *     niet uit een collectie halen en moest ze op een client-ververste
 *     kv-waarde vertrouwen die verouderde als niemand de app die dag opende)
 *   {{#isEmpty collectie}}...{{/isEmpty}}         -- enkel als collectie leeg is
 *   {{#notEmpty collectie}}...{{/notEmpty}}       -- enkel als collectie niet leeg is
 * Geen nesting van blocks (bewust simpel gehouden -- elke extra
 * grammatica-laag is extra oppervlak om verkeerd te evalueren). Onbekende/
 * kapotte tags worden stilzwijgend leeg gerenderd, nooit doorgestuurd als
 * ruwe syntax naar de ontvanger. Zelfde grammatica als condition-scheduler.js
 * op dit punt (bewust in sync gehouden), enkel {{rotation.*}} blijft daar
 * exclusief.
 */
export function renderTemplate(template, context, maxLength) {
  let out = template;
  const collections = context.collections || {};
  const kv = context.kv || {};
  const builtins = context.builtins || {};

  // Blocks eerst (each/isEmpty/notEmpty/eachWhere) -- max 100 passes als
  // veiligheidsklep tegen kapotte/oneindige input (bv. een niet-gesloten tag).
  for (let i = 0; i < 100; i++) {
    const blockMatch = BLOCK_RE.exec(out);
    const eachWhereMatch = EACH_WHERE_RE.exec(out);
    if (!blockMatch && !eachWhereMatch) break;

    if (eachWhereMatch && (!blockMatch || eachWhereMatch.index <= blockMatch.index)) {
      const [full, name, field, equalsRaw, notEqualsRaw, inner] = eachWhereMatch;
      const equalsVal = resolveBuiltinRefs(equalsRaw, builtins);
      const notEqualsVal = resolveBuiltinRefs(notEqualsRaw, builtins);
      // Eerst filteren, DAN afknippen: anders valt bv. de rij van vandaag in een
      // rooster voor een heel jaar buiten de eerste MAX_EACH_ITEMS en is het
      // bericht stil leeg.
      const items = Array.isArray(collections[name]) ? collections[name] : [];
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
      const replacement = filtered.slice(0, MAX_EACH_ITEMS).map(item => renderEachInner(inner, item)).join('\n');
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

  // Dan de platte {{kv.KEY}}-substituties.
  out = out.replace(/\{\{kv\.([a-zA-Z0-9_-]+)\}\}/g, (m, key) => {
    const v = kv[key];
    return v === null || v === undefined ? '' : String(v);
  });

  // Dag-context builtins ({{today}}/{{weekday}}/...).
  out = out.replace(BUILTIN_RE, (m, name) => {
    const v = builtins[name];
    return v === undefined || v === null ? '' : String(v);
  });

  // Restjes van onherkende {{...}}-syntax nooit doorlaten naar de ontvanger.
  out = out.replace(/\{\{[^}]*\}\}/g, '');

  return typeof maxLength === 'number' ? truncate(out, maxLength) : out;
}

/**
 * Bouwt de template-context voor één app: alle platte kv-waarden + alle
 * collections (bounded door de bestaande opslag-quota's in lib/storage.js --
 * max 500 objecten per app), plus de server-berekende dag-context (builtins).
 * `now`/`timeZone` optioneel (default: huidig moment, Europe/Brussels) zodat
 * de cron en "Nu testen" altijd tegen dezelfde klok werken -- zelfde patroon
 * als condition-scheduler.js#buildContext. Geen rotations hier: die blijven
 * exclusief bij criteria-taken (geen vraag naar bij vast-tijdstip-taken).
 */
export async function buildContext(env, appId, now = new Date(), timeZone = ORG_TIMEZONE) {
  const [kv, collections] = await Promise.all([
    listStorage(env, appId),
    listAllCollections(env, appId)
  ]);
  const builtins = computeBuiltins(now, timeZone);
  return { kv, collections, builtins };
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
  if (body.key !== undefined && body.key !== null) validateTaskKey(body.key);
  validateOnlyIf(body.onlyIf);
}

// ─── Sleutel, verzendvoorwaarde en de vorm naar buiten ─────────────────────

export const MAX_TASK_KEY_LENGTH = 100;
export const MAX_ONLY_IF_CONDITIONS = 5;
const TASK_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

/** Een sleutel die de app zelf kiest, bv. "dagelijkse-post:<kanaal-id>". */
export function validateTaskKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_TASK_KEY_LENGTH || !TASK_KEY_RE.test(key)) {
    throw schedulerError(
      `key moet 1-${MAX_TASK_KEY_LENGTH} tekens zijn: letters, cijfers en _ . : - (beginnend met een letter of cijfer).`,
      'INVALID_KEY'
    );
  }
}

/**
 * onlyIf = één voorwaarde of een lijst (max 5, allemaal waar = versturen):
 *   { collection: "geplande_dagen", where: { date: "{{today}}", status: { ne: "closed" } } }
 * "Waar" betekent: minstens één item in die collectie voldoet aan het filter.
 * Het filter is exact dat van sharedStorage.listItems(); tekstwaarden mogen
 * {{today}}/{{weekday}}/{{weekdayName}}/{{isoWeek}}/{{isoYear}} bevatten.
 * Geeft de genormaliseerde vorm terug (altijd een lijst), of null.
 */
export function validateOnlyIf(onlyIf) {
  if (onlyIf === undefined || onlyIf === null) return null;
  const list = Array.isArray(onlyIf) ? onlyIf : [onlyIf];
  if (list.length === 0) return null;
  if (list.length > MAX_ONLY_IF_CONDITIONS) {
    throw schedulerError(`onlyIf: maximaal ${MAX_ONLY_IF_CONDITIONS} voorwaarden.`, 'INVALID_ONLY_IF');
  }
  return list.map((cond, i) => {
    const label = list.length > 1 ? `onlyIf[${i}]` : 'onlyIf';
    if (!cond || typeof cond !== 'object' || Array.isArray(cond)) {
      throw schedulerError(`${label} moet een object zijn: { collection, where }.`, 'INVALID_ONLY_IF');
    }
    const extra = Object.keys(cond).filter(k => k !== 'collection' && k !== 'where');
    if (extra.length) {
      throw schedulerError(`${label}: onbekende sleutel "${extra[0]}". Toegestaan: collection, where.`, 'INVALID_ONLY_IF');
    }
    if (typeof cond.collection !== 'string' || !cond.collection || cond.collection.length > MAX_COLLECTION_LENGTH) {
      throw schedulerError(`${label}.collection is verplicht (1-${MAX_COLLECTION_LENGTH} tekens).`, 'INVALID_ONLY_IF');
    }
    if (!cond.where || typeof cond.where !== 'object' || Array.isArray(cond.where) || !Object.keys(cond.where).length) {
      throw schedulerError(`${label}.where is verplicht, bv. { status: "open" }.`, 'INVALID_ONLY_IF');
    }
    try {
      normalizeQuery({ where: cond.where });
    } catch (err) {
      throw schedulerError(`${label}: ${err.message}`, 'INVALID_ONLY_IF');
    }
    return { collection: cond.collection, where: cond.where };
  });
}

function resolveWhereBuiltins(where, builtins) {
  const fill = v => (typeof v === 'string' ? resolveBuiltinRefs(v, builtins) : v);
  const out = {};
  for (const [field, spec] of Object.entries(where)) {
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      const ops = {};
      for (const [op, v] of Object.entries(spec)) ops[op] = Array.isArray(v) ? v.map(fill) : fill(v);
      out[field] = ops;
    } else {
      out[field] = fill(spec);
    }
  }
  return out;
}

const OP_TEXT = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is een van', contains: 'bevat' };

function describeWhere(where) {
  const show = v => (typeof v === 'string' ? `"${v}"` : Array.isArray(v) ? v.map(show).join(', ') : String(v));
  const parts = [];
  for (const [field, spec] of Object.entries(where)) {
    const ops = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : { eq: spec };
    for (const [op, v] of Object.entries(ops)) {
      if (op === 'exists') parts.push(`${field} ${v ? 'ingevuld' : 'leeg'}`);
      else parts.push(`${field} ${OP_TEXT[op] || op} ${show(v)}`);
    }
  }
  return parts.join(' en ');
}

/**
 * Kijkt de verzendvoorwaarde na tegen de database van de app, op `now`.
 * { met: true } of { met: false, reason } -- de reden is leesbaar en komt in
 * last_run_error en het log: een overgeslagen post moet zeggen WAAROM.
 */
export async function evaluateOnlyIf(env, appId, onlyIf, now = new Date(), timeZone = ORG_TIMEZONE) {
  const list = Array.isArray(onlyIf) ? onlyIf : (onlyIf ? [onlyIf] : []);
  if (!list.length) return { met: true };
  const builtins = computeBuiltins(now, timeZone);
  for (const cond of list) {
    const where = resolveWhereBuiltins(cond.where, builtins);
    const count = await countCollectionItems(env, appId, cond.collection, { where });
    if (count === 0) {
      return { met: false, reason: `Niet verstuurd: geen item in "${cond.collection}" met ${describeWhere(where)}.` };
    }
  }
  return { met: true };
}

/** Recurrence in vaste vorm: enkel de velden die bij de frequentie horen, dagen gesorteerd. */
export function normalizeRecurrence(recurrence) {
  validateRecurrence(recurrence);
  if (recurrence.frequency === 'daily') return { frequency: 'daily', time: recurrence.time };
  if (recurrence.frequency === 'weekly') {
    return { frequency: 'weekly', time: recurrence.time, daysOfWeek: [...recurrence.daysOfWeek].sort((a, b) => a - b) };
  }
  return { frequency: 'every_n_days', time: recurrence.time, intervalDays: recurrence.intervalDays, anchorDate: recurrence.anchorDate };
}

const DAY_SHORT_NL = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // maandag eerst

/** "elke dag om 11:00", "ma-vr om 09:30", "di en do om 08:00", "om de 14 dagen om 08:30 (vanaf 7 juli 2026)". */
export function describeRecurrence(recurrence) {
  const r = normalizeRecurrence(recurrence);
  if (r.frequency === 'daily') return `elke dag om ${r.time}`;
  if (r.frequency === 'weekly') {
    if (r.daysOfWeek.length === 7) return `elke dag om ${r.time}`;
    const idx = r.daysOfWeek.map(d => WEEK_ORDER.indexOf(d)).sort((a, b) => a - b);
    const runs = [];
    for (const i of idx) {
      const last = runs[runs.length - 1];
      if (last && i === last[last.length - 1] + 1) last.push(i);
      else runs.push([i]);
    }
    const parts = [];
    for (const run of runs) {
      if (run.length >= 3) parts.push(`${DAY_SHORT_NL[WEEK_ORDER[run[0]]]}-${DAY_SHORT_NL[WEEK_ORDER[run[run.length - 1]]]}`);
      else run.forEach(i => parts.push(DAY_SHORT_NL[WEEK_ORDER[i]]));
    }
    const days = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}` : parts[0];
    return `${days} om ${r.time}`;
  }
  const anchor = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${r.anchorDate}T00:00:00Z`));
  return `om de ${r.intervalDays} dagen om ${r.time} (vanaf ${anchor})`;
}

/**
 * De ENIGE vorm waarin een taak de app bereikt: dezelfde veldnamen als bij
 * create()/ensure(), zodat een app een taak kan vergelijken met wat ze zelf
 * zou meegeven. lastRunMessage = de fout of, bij 'skipped', de reden.
 */
export function taskRowToDto(row) {
  let recurrenceText = null;
  try { recurrenceText = describeRecurrence(row.recurrence); } catch (_err) { /* ongeldige oude rij: geen tekst */ }
  return {
    id: row.id,
    key: row.task_key || null,
    name: row.name,
    isActive: row.is_active,
    recurrence: row.recurrence,
    recurrenceText,
    deliveryMethod: row.delivery_method,
    targetType: row.target_type,
    targetUserId: row.target_user_id || null,
    targetChannelId: row.target_channel_id || null,
    subjectTemplate: row.subject_template || null,
    messageTemplate: row.message_template,
    onlyIf: row.only_if || null,
    nextRunAt: row.next_run_at || null,
    lastRunAt: row.last_run_at || null,
    lastRunStatus: row.last_run_status || null,
    lastRunMessage: row.last_run_error || null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Databaserij -> instelling in de vorm van create()/update(). */
export function taskRowToConfig(row) {
  return {
    key: row.task_key || null,
    name: row.name,
    isActive: row.is_active,
    recurrence: row.recurrence,
    deliveryMethod: row.delivery_method,
    targetType: row.target_type,
    targetUserId: row.target_user_id || undefined,
    targetChannelId: row.target_channel_id || undefined,
    subjectTemplate: row.subject_template || undefined,
    messageTemplate: row.message_template,
    onlyIf: row.only_if || null
  };
}

const CONFIG_FIELDS = ['key', 'name', 'isActive', 'recurrence', 'deliveryMethod', 'targetType', 'targetUserId',
  'targetChannelId', 'subjectTemplate', 'messageTemplate', 'onlyIf'];

/** update() mag één veld zijn: de rest blijft wat er stond. */
export function mergeTaskConfig(row, patch) {
  const merged = taskRowToConfig(row);
  for (const field of CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, field)) merged[field] = patch[field];
  }
  return merged;
}

/**
 * Een gevalideerde instelling -> de kolommen van mini_app_scheduled_tasks
 * (zonder is_active, next_run_at en de runvelden). Recurrence en onlyIf in
 * vaste vorm, zodat dezelfde instelling altijd dezelfde rij geeft.
 */
export function taskConfigToColumns(config) {
  return {
    task_key: config.key || null,
    name: config.name.trim(),
    recurrence: normalizeRecurrence(config.recurrence),
    delivery_method: config.deliveryMethod,
    target_type: config.targetType,
    target_user_id: config.targetType === 'colleague' ? config.targetUserId : null,
    target_channel_id: config.targetType === 'channel' ? config.targetChannelId : null,
    subject_template: config.deliveryMethod === 'mail' ? config.subjectTemplate.trim() : null,
    message_template: config.messageTemplate.trim(),
    only_if: validateOnlyIf(config.onlyIf)
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

const COLUMN_TO_FIELD = {
  name: 'name', recurrence: 'recurrence', delivery_method: 'deliveryMethod', target_type: 'targetType',
  target_user_id: 'targetUserId', target_channel_id: 'targetChannelId', subject_template: 'subjectTemplate',
  message_template: 'messageTemplate', only_if: 'onlyIf', task_key: 'key', is_active: 'isActive'
};

/**
 * Welke velden verschillen tussen de rij en de nieuwe kolommen -- over de
 * HELE instelling, niet over één veld. Geeft veldnamen in de vorm van de app
 * terug (bv. ['recurrence', 'onlyIf']).
 */
export function diffTaskColumns(row, columns) {
  const changed = [];
  for (const [column, value] of Object.entries(columns)) {
    let current = row[column];
    if (column === 'recurrence') {
      try { current = normalizeRecurrence(current); } catch (_err) { /* ongeldige oude rij: telt als verschil */ }
    }
    if (canonicalJson(current ?? null) !== canonicalJson(value ?? null)) changed.push(COLUMN_TO_FIELD[column] || column);
  }
  return changed;
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

    // Eerst de verzendvoorwaarde: een post die vandaag niet hoort te
    // vertrekken, hoeft ook geen context op te bouwen.
    const verdict = await evaluateOnlyIf(env, task.mini_app_id, task.only_if, now);
    if (!verdict.met) {
      status = 'skipped';
      errorMessage = verdict.reason;
      console.log(`[mini-apps][scheduler] taak ${task.id} (app ${task.mini_app_id}) overgeslagen: ${verdict.reason}`);
    } else {
      const context = await buildContext(env, task.mini_app_id, now);

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
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (refetchErr) throw new Error(refetchErr.message);
  // Ook "Nu testen" volgt onlyIf: lastRunStatus 'skipped' + lastRunMessage
  // zegt dan waarom er niets vertrok, in plaats van een test die iets anders
  // doet dan de echte verzending.
  return updated ? taskRowToDto(updated) : null;
}
