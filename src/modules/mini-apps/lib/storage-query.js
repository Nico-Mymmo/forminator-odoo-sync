/**
 * Mini-Apps — Gedeelde opslag: filteren, sorteren en pagineren (puur)
 *
 * Geen env, geen fetch, geen database: zet een filter uit een mini-app om
 * naar een geparametriseerd stukje SQL voor de SQLite-database van die app
 * (lib/storage-do.js). Eén plek, zodat listItems(), countItems() en straks
 * de verzendvoorwaarde van een geplande post (onlyIf) exact dezelfde regels
 * volgen.
 *
 * Vorm, zoals een mini-app hem meegeeft:
 *   {
 *     where:   { date: "2026-10-06", status: { ne: "closed" }, prijs: { gte: 10 } },
 *     orderBy: "date",        // veld in de JSON-waarde, of _created / _updated / _id / _value
 *     order:   "desc",        // "asc" (standaard) of "desc"
 *     limit:   20,
 *     offset:  0
 *   }
 *
 * Een waarde in `where` is een kale waarde (= gelijk aan) of een object met
 * een of meer operatoren: eq, ne, gt, gte, lt, lte, in (lijst), contains
 * (tekst, hoofdletterongevoelig voor a-z) en exists (true/false). Alles
 * samen is EN; OF bestaat bewust niet -- `in` dekt het gewone geval, en een
 * filter moet leesbaar blijven als gegevens.
 *
 * Velden lezen uit de JSON-waarde van een item (`date` = `$.date`, `a.b` =
 * `$.a.b`). Een item waarvan de waarde geen geldige JSON is, voldoet aan
 * geen enkel veldfilter -- nooit een fout. `_value` is de ruwe waarde zelf,
 * `_id` het item-id.
 *
 * Veiligheid: veldnamen gaan door een strikte regex en komen pas DAN als
 * letterlijk JSON-pad in de SQL; elke WAARDE is een bound parameter. Er komt
 * nooit tekst van een app ongefilterd in de query.
 *
 * `ne` neemt items ZONDER dat veld mee ({ status: { ne: "closed" } } geeft
 * ook items die geen status hebben). Dat is wat je meestal bedoelt met
 * "alles behalve gesloten"; wie enkel items mét het veld wil, zet er
 * { exists: true } bij. De andere vergelijkingen slaan een ontbrekend veld
 * over.
 *
 * Typen: json_extract geeft getallen terug als getal, tekst als tekst en
 * true/false als 1/0. Vergelijk dus getallen met getallen en tekst met tekst:
 * een getal dat als "5" is opgeslagen, is tekst. Datums als "YYYY-MM-DD"
 * vergelijken correct als tekst.
 */

export const MAX_WHERE_FIELDS = 10;
export const MAX_IN_VALUES = 50;
export const MAX_BOUND_VALUES = 80;   // DO-SQLite staat 100 parameters per query toe; de rest is voor de query zelf
export const MAX_LIMIT = 10000;
export const MAX_OFFSET = 1000000;
export const MAX_TEXT_VALUE_LENGTH = 1000;

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,4}$/;
const PSEUDO_FIELDS = ['_id', '_value'];
const PSEUDO_ORDER = ['_created', '_updated', '_id', '_value'];
const COMPARE_OPS = { eq: '=', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const ALL_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists'];

function queryError(message) {
  const err = new Error(message);
  err.code = 'INVALID_QUERY';
  return err;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function checkField(field) {
  if (PSEUDO_FIELDS.includes(field)) return;
  if (typeof field !== 'string' || !FIELD_RE.test(field)) {
    throw queryError(`Ongeldige veldnaam in het filter: "${field}". Gebruik letters, cijfers en _, eventueel genest met een punt (bv. "adres.postcode").`);
  }
}

function checkScalar(value, field, op) {
  if (value === null) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw queryError(`Filter op "${field}" (${op}): geen geldig getal.`);
    return;
  }
  if (typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_VALUE_LENGTH) throw queryError(`Filter op "${field}" (${op}): tekst langer dan ${MAX_TEXT_VALUE_LENGTH} tekens.`);
    return;
  }
  throw queryError(`Filter op "${field}" (${op}): enkel tekst, getal, true/false of null is toegestaan.`);
}

/**
 * Controleert en normaliseert een filter. Geeft null terug als er niets te
 * filteren, sorteren of beperken valt -- dan gedraagt listItems() zich exact
 * zoals vroeger (alles, in volgorde van toevoegen). Gooit een fout met code
 * INVALID_QUERY en een Nederlandse uitleg bij alles wat niet klopt; een
 * filter dat stil genegeerd wordt, geeft een lijst die er goed uitziet en
 * toch fout is.
 */
export function normalizeQuery(raw) {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) throw queryError('Het filter moet een object zijn, bv. { where: { status: "open" } }.');

  const known = ['where', 'orderBy', 'order', 'limit', 'offset'];
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) throw queryError(`Onbekende filteroptie "${key}". Toegestaan: ${known.join(', ')}.`);
  }

  const conditions = [];
  let boundValues = 0;
  if (raw.where !== undefined && raw.where !== null) {
    if (!isPlainObject(raw.where)) throw queryError('where moet een object zijn, bv. { status: "open" }.');
    const fields = Object.keys(raw.where);
    if (fields.length > MAX_WHERE_FIELDS) throw queryError(`Maximaal ${MAX_WHERE_FIELDS} velden in één filter.`);
    for (const field of fields) {
      checkField(field);
      const spec = raw.where[field];
      const ops = isPlainObject(spec) ? spec : { eq: spec };
      const opNames = Object.keys(ops);
      if (opNames.length === 0) throw queryError(`Filter op "${field}" is leeg.`);
      for (const op of opNames) {
        if (!ALL_OPS.includes(op)) throw queryError(`Onbekende operator "${op}" bij "${field}". Toegestaan: ${ALL_OPS.join(', ')}.`);
        const value = ops[op];
        if (op === 'in') {
          if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IN_VALUES) {
            throw queryError(`"in" bij "${field}" vraagt een lijst van 1 tot ${MAX_IN_VALUES} waarden.`);
          }
          value.forEach(v => {
            if (v === null) throw queryError(`"in" bij "${field}": null kan niet in de lijst, gebruik { eq: null }.`);
            checkScalar(v, field, op);
          });
          boundValues += value.length;
        } else if (op === 'exists') {
          if (typeof value !== 'boolean') throw queryError(`"exists" bij "${field}" moet true of false zijn.`);
        } else if (op === 'contains') {
          if (typeof value !== 'string' || !value) throw queryError(`"contains" bij "${field}" vraagt een niet-lege tekst.`);
          checkScalar(value, field, op);
          boundValues += 1;
        } else {
          checkScalar(value, field, op);
          if (value === null && op !== 'eq' && op !== 'ne') {
            throw queryError(`"${op}" bij "${field}" kan niet met null vergelijken.`);
          }
          if (value !== null) boundValues += 1;
        }
        conditions.push({ field, op, value });
      }
    }
  }
  if (boundValues > MAX_BOUND_VALUES) throw queryError(`Het filter bevat te veel waarden (${boundValues}, max ${MAX_BOUND_VALUES}).`);

  let orderBy = null;
  if (raw.orderBy !== undefined && raw.orderBy !== null) {
    if (typeof raw.orderBy !== 'string') throw queryError('orderBy moet een veldnaam zijn.');
    if (!PSEUDO_ORDER.includes(raw.orderBy)) checkField(raw.orderBy);
    orderBy = raw.orderBy;
  }
  let desc = false;
  if (raw.order !== undefined && raw.order !== null) {
    if (raw.order !== 'asc' && raw.order !== 'desc') throw queryError('order moet "asc" of "desc" zijn.');
    desc = raw.order === 'desc';
  }

  let limit = null;
  if (raw.limit !== undefined && raw.limit !== null) {
    if (!Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > MAX_LIMIT) throw queryError(`limit moet een geheel getal van 1 tot ${MAX_LIMIT} zijn.`);
    limit = raw.limit;
  }
  let offset = 0;
  if (raw.offset !== undefined && raw.offset !== null) {
    if (!Number.isInteger(raw.offset) || raw.offset < 0 || raw.offset > MAX_OFFSET) throw queryError(`offset moet een geheel getal van 0 tot ${MAX_OFFSET} zijn.`);
    offset = raw.offset;
  }

  if (!conditions.length && !orderBy && !desc && limit === null && offset === 0) return null;
  return { conditions, orderBy, desc, limit, offset };
}

function bindable(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

function fieldExpr(field) {
  if (field === '_id') return 'id';
  if (field === '_value') return 'value';
  // FIELD_RE laat enkel [A-Za-z0-9_.] door, dus het pad kan letterlijk in de SQL.
  return `(CASE WHEN json_valid(value) THEN json_extract(value, '$.${field}') END)`;
}

function existsExpr(field) {
  if (field === '_id' || field === '_value') return '1';
  return `(CASE WHEN json_valid(value) THEN json_type(value, '$.${field}') END) IS NOT NULL`;
}

/**
 * Zet een genormaliseerd filter om naar SQL voor de tabel `items`
 * (kolommen id, value, seq, updated_at). Geeft { where, params, order,
 * limit, limitParams } -- `where` begint met " AND " of is leeg, zodat de
 * aanroeper hem achter `collection = ?` kan plakken.
 */
export function compileQuery(q) {
  const parts = [];
  const params = [];
  for (const c of (q && q.conditions) || []) {
    const expr = fieldExpr(c.field);
    if (c.op === 'exists') {
      parts.push(c.value ? existsExpr(c.field) : `NOT (${existsExpr(c.field)})`);
    } else if (c.op === 'in') {
      parts.push(`${expr} IN (${c.value.map(() => '?').join(', ')})`);
      c.value.forEach(v => params.push(bindable(v)));
    } else if (c.op === 'contains') {
      parts.push(`instr(lower(CAST(${expr} AS TEXT)), lower(?)) > 0`);
      params.push(c.value);
    } else if (c.value === null) {
      parts.push(c.op === 'eq' ? `${expr} IS NULL` : `${expr} IS NOT NULL`);
    } else if (c.op === 'ne') {
      parts.push(`${expr} IS NOT ?`); // null-veilig: een ontbrekend veld telt als "niet gelijk"
      params.push(bindable(c.value));
    } else {
      parts.push(`${expr} ${COMPARE_OPS[c.op]} ?`);
      params.push(bindable(c.value));
    }
  }

  const dir = q && q.desc ? 'DESC' : 'ASC';
  let order;
  if (!q || !q.orderBy || q.orderBy === '_created') order = `seq ${dir}`;
  else if (q.orderBy === '_updated') order = `updated_at ${dir}, seq ${dir}`;
  else order = `${fieldExpr(q.orderBy)} ${dir}, seq ${dir}`;

  return {
    where: parts.length ? ' AND ' + parts.join(' AND ') : '',
    params,
    order,
    limit: ' LIMIT ? OFFSET ?',
    limitParams: [q && q.limit ? q.limit : -1, q ? q.offset : 0]
  };
}
