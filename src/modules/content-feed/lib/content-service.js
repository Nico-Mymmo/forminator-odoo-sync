/**
 * Content Feed — Odoo-toegang
 *
 * De ENIGE plek in deze module die met Odoo praat. Alles hier werkt met de
 * nette namen uit odoo-contract.js; `x_`-veldnamen komen uitsluitend uit dat
 * contract, nooit als letterlijke string in dit bestand.
 */

import { searchRead, create, write, executeKw } from '../../../lib/odoo.js';
import {
  ODOO_MODELS,
  SNIPPET_FIELDS,
  SNIPPET_LIST_FIELDS,
  IMAGE_ID_DOMAIN,
  SORT_ORDER,
  WRITABLE_FIELDS,
  toSnippetDto,
  toTaxonomyDto,
  isPubliclyVisible,
  normalizeStatus,
  normalizeColor
} from '../odoo-contract.js';
import {
  LOG_PREFIX,
  PUBLIC_VISIBLE_STATUSES,
  CACHE_NS,
  CACHE_TTL,
  PAGINATION
} from '../constants.js';
import { readThrough, invalidateItems, invalidateTaxonomy } from './cache.js';

const MAX_SLUG_LENGTH = 80;

/** Naam → slug. Dezelfde regels als lib/slug.js van events-v2. */
export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Welke van deze id's hebben een afbeelding?
 *
 * Een APARTE query die enkel id's teruggeeft. Het beeldveld is binair, dus
 * het meenemen in de lijstquery zou elke afbeelding als base64 door de
 * JSON-RPC-respons sturen -- bij 23 afbeeldingen is dat megabytes per
 * pageview. Deze query leest geen enkele byte van de beelden zelf.
 */
async function idsWithImage(env, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return new Set();
  try {
    const rows = await searchRead(env, {
      model: ODOO_MODELS.SNIPPET,
      domain: [[SNIPPET_FIELDS.ID, 'in', ids], ...IMAGE_ID_DOMAIN],
      fields: [SNIPPET_FIELDS.ID],
      limit: ids.length,
      context: { active_test: false }
    });
    return new Set((rows || []).map((r) => Number(r.id)));
  } catch (error) {
    // Een mislukte beeldcontrole mag de lijst niet laten falen: dan staat er
    // geen beeld bij, en dat is oneindig veel beter dan een lege pagina.
    console.warn(`${LOG_PREFIX} beeldcontrole mislukt:`, error?.message);
    return new Set();
  }
}

function buildDomain({
  statuses, typeId, tagId, typeIds, tagIds, search, includeArchived
}) {
  const domain = [];

  if (Array.isArray(statuses) && statuses.length > 0) {
    domain.push([SNIPPET_FIELDS.STATUS, 'in', statuses]);
  }
  if (!includeArchived) {
    domain.push([SNIPPET_FIELDS.ACTIVE, '=', true]);
  }
  // Meerdere types/labels tegelijk: de shortcode van de plugin kiest welke
  // categorieen een pagina toont, en de filterbalk kan er meerdere aanzetten.
  const types = (Array.isArray(typeIds) ? typeIds : [typeId])
    .map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const tags = (Array.isArray(tagIds) ? tagIds : [tagId])
    .map(Number).filter((n) => Number.isInteger(n) && n > 0);

  if (types.length) domain.push([SNIPPET_FIELDS.TYPE, 'in', types]);
  if (tags.length) domain.push([SNIPPET_FIELDS.TAGS, 'in', tags]);
  if (search) {
    domain.push('|', '|',
      [SNIPPET_FIELDS.TITLE, 'ilike', search],
      [SNIPPET_FIELDS.SUMMARY_TITLE, 'ilike', search],
      [SNIPPET_FIELDS.SOURCE, 'ilike', search]
    );
  }

  // Er wordt hier NIET op site gefilterd: welke berichten een site toont,
  // staat in haar shortcode. Zie de toelichting bovenaan constants.js.
  return domain;
}

/**
 * Berichten ophalen.
 *
 * @param {Object} env
 * @param {Object} options
 * Welke berichten een SITE toont, staat in haar shortcode -- niet hier en
 * niet op het bericht. Zie de toelichting bovenaan constants.js.
 * @param {string[]} [options.statuses]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @param {boolean} [options.includeArchived]
 * @param {boolean} [options.bypassCache]
 * @returns {Promise<{ items: Object[], cached: boolean }>}
 */
export async function listSnippets(env, options = {}) {
  const {
    statuses = null,
    typeId = null,
    tagId = null,
    typeIds = null,
    tagIds = null,
    search = null,
    limit = PAGINATION.DEFAULT_LIMIT,
    offset = 0,
    includeArchived = false,
    bypassCache = false,
    ttlSeconds = CACHE_TTL.PUBLIC_LIST_SECONDS
  } = options;

  const veilig = Math.min(Math.max(Number(limit) || PAGINATION.DEFAULT_LIMIT, 1), PAGINATION.MAX_LIMIT);
  const start = Math.max(Number(offset) || 0, 0);

  const { value, cached } = await readThrough(
    env,
    {
      namespace: CACHE_NS.ITEMS,
      parts: [
        'list', (statuses || []).join(','),
        (typeIds || [typeId]).filter(Boolean).join('.'),
        (tagIds || [tagId]).filter(Boolean).join('.'),
        search, veilig, start, includeArchived
      ],
      ttlSeconds,
      bypass: bypassCache
    },
    async () => {
      const domain = buildDomain({
        statuses, typeId, tagId, typeIds, tagIds, search, includeArchived
      });

      const rows = await searchRead(env, {
        model: ODOO_MODELS.SNIPPET,
        domain,
        fields: await lijstVelden(env),
        order: SORT_ORDER,
        limit: veilig,
        offset: start,
        context: includeArchived ? { active_test: false } : undefined
      });

      const pagina = rows || [];
      const beelden = await idsWithImage(env, pagina.map((r) => Number(r.id)));
      return pagina.map((row) => toSnippetDto(row, {
        hasImage: beelden.has(Number(row.id))
      }));
    }
  );

  return { items: value, cached };
}

/** Eén bericht, of null. */
export async function getSnippet(env, id, { bypassCache = false } = {}) {
  const snippetId = Number(id);
  if (!Number.isInteger(snippetId) || snippetId <= 0) return null;

  const { value } = await readThrough(
    env,
    {
      namespace: CACHE_NS.ITEMS,
      parts: ['item', snippetId],
      ttlSeconds: CACHE_TTL.PUBLIC_DETAIL_SECONDS,
      bypass: bypassCache
    },
    async () => {
      const rows = await searchRead(env, {
        model: ODOO_MODELS.SNIPPET,
        domain: [[SNIPPET_FIELDS.ID, '=', snippetId]],
        fields: await lijstVelden(env),
        limit: 1,
        context: { active_test: false }
      });
      const row = (rows || [])[0];
      if (!row) return null;
      const beelden = await idsWithImage(env, [snippetId]);
      return toSnippetDto(row, { hasImage: beelden.has(snippetId) });
    }
  );

  return value;
}

/**
 * De ruwe bytes van de afbeelding van een bericht.
 *
 * Dit is de ENIGE plek die het binaire veld leest. Geeft `null` als er geen
 * beeld is; de route maakt daar een 404 van.
 *
 * @returns {Promise<{ bytes: Uint8Array, contentType: string }|null>}
 */
export async function getSnippetImage(env, id) {
  const snippetId = Number(id);
  if (!Number.isInteger(snippetId) || snippetId <= 0) return null;

  const rows = await searchRead(env, {
    model: ODOO_MODELS.SNIPPET,
    domain: [[SNIPPET_FIELDS.ID, '=', snippetId]],
    fields: [SNIPPET_FIELDS.ID, SNIPPET_FIELDS.IMAGE],
    limit: 1,
    context: { active_test: false }
  });

  const base64 = (rows || [])[0]?.[SNIPPET_FIELDS.IMAGE];
  if (typeof base64 !== 'string' || base64.length === 0) return null;

  let binair;
  try {
    binair = atob(base64);
  } catch (error) {
    console.warn(`${LOG_PREFIX} beeld ${snippetId} is geen geldige base64:`, error?.message);
    return null;
  }

  const bytes = new Uint8Array(binair.length);
  for (let i = 0; i < binair.length; i += 1) bytes[i] = binair.charCodeAt(i);

  return { bytes, contentType: sniffImageType(bytes) };
}

/**
 * Het bestandstype uit de EERSTE BYTES, niet uit een bestandsnaam -- die
 * bestaat hier niet, Odoo bewaart enkel de bytes. Onbekend wordt PNG: dat is
 * wat de bestaande uploads zijn, en een verkeerd type toont een gebroken
 * afbeelding in plaats van een fout die iemand ziet.
 */
function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (bytes.length >= 12
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  if (bytes.length >= 4 && bytes[0] === 0x3c) {
    return 'image/svg+xml';
  }
  return 'image/png';
}

/** Types en labels. Samen, want ze veranderen zelden en de UI wil allebei. */
export async function listTaxonomy(env, { bypassCache = false } = {}) {
  const { value } = await readThrough(
    env,
    { namespace: CACHE_NS.TAXONOMY, parts: ['all'], ttlSeconds: CACHE_TTL.TAXONOMY_SECONDS, bypass: bypassCache },
    async () => {
      const [types, tags] = await Promise.all([
        searchRead(env, {
          model: ODOO_MODELS.TYPE,
          domain: [],
          fields: ['id', 'x_name', 'display_name'],
          limit: 100
        }),
        searchRead(env, {
          model: ODOO_MODELS.TAG,
          domain: [],
          fields: ['id', 'x_name', 'display_name'],
          limit: 200
        })
      ]);
      return {
        types: (types || []).map((r) => toTaxonomyDto(r, { slugify })).filter(Boolean),
        tags: (tags || []).map((r) => toTaxonomyDto(r, { slugify })).filter(Boolean)
      };
    }
  );
  return value;
}

/** De medewerkers die als verantwoordelijke gekozen kunnen worden. */
export async function listOwners(env) {
  const rows = await searchRead(env, {
    model: ODOO_MODELS.USER,
    domain: [['share', '=', false]],
    fields: ['id', 'name'],
    order: 'name asc',
    limit: 200
  });
  return (rows || []).map((r) => ({ id: Number(r.id), name: r.name || null }));
}

/**
 * Van UI-payload naar Odoo-waarden.
 *
 * Gesloten lijst: alleen WRITABLE_FIELDS komt erdoor. Zonder die grens kan
 * een beheerscherm per ongeluk `x_studio_content` of een wordpress-id
 * schrijven -- precies de velden die we net aan het uitfaseren zijn.
 */
export function buildOdooValues(payload = {}) {
  const values = {};

  if (payload.title !== undefined) values[WRITABLE_FIELDS.title] = payload.title || false;
  if (payload.status !== undefined) values[WRITABLE_FIELDS.status] = normalizeStatus(payload.status);
  if (payload.publishedOn !== undefined) {
    values[WRITABLE_FIELDS.publishedOn] = payload.publishedOn || false;
  }
  if (payload.typeId !== undefined) {
    values[WRITABLE_FIELDS.typeId] = Number(payload.typeId) > 0 ? Number(payload.typeId) : false;
  }
  if (payload.ownerId !== undefined) {
    values[WRITABLE_FIELDS.ownerId] = Number(payload.ownerId) > 0 ? Number(payload.ownerId) : false;
  }
  if (payload.tagIds !== undefined) {
    const ids = Array.isArray(payload.tagIds)
      ? payload.tagIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    // Odoo x2many-commando 6: vervang de volledige verzameling.
    values[WRITABLE_FIELDS.tagIds] = [[6, 0, ids]];
  }
  if (payload.source !== undefined) values[WRITABLE_FIELDS.source] = payload.source || false;
  if (payload.url !== undefined) values[WRITABLE_FIELDS.url] = payload.url || false;
  if (payload.cta !== undefined) values[WRITABLE_FIELDS.cta] = payload.cta || false;
  if (payload.summary !== undefined) values[WRITABLE_FIELDS.summary] = payload.summary || false;
  if (payload.summaryTitle !== undefined) {
    values[WRITABLE_FIELDS.summaryTitle] = payload.summaryTitle || false;
  }
  if (payload.color !== undefined) values[WRITABLE_FIELDS.color] = normalizeColor(payload.color);
  if (payload.audience !== undefined) {
    values[WRITABLE_FIELDS.audience] = payload.audience || false;
  }
  if (payload.quote !== undefined) values[WRITABLE_FIELDS.quote] = payload.quote || false;
  if (payload.curatorNote !== undefined) {
    values[WRITABLE_FIELDS.curatorNote] = payload.curatorNote || false;
  }
  if (payload.active !== undefined) values[WRITABLE_FIELDS.active] = payload.active !== false;

  return values;
}

/**
 * Welke velden bestaan er echt op het model?
 *
 * Nodig voor de OPTIONELE velden (vandaag: QUOTE). Een onbekend veld in een
 * `fields`-lijst of in een `create` laat de hele aanroep falen met een
 * Odoo-fout die niets uitlegt -- dus vragen we het één keer en onthouden we
 * het. Bij een fout gaan we uit van "bestaat niet": dan mist er hoogstens een
 * citaat, in plaats van dat er niets meer bewaard kan worden.
 */
export async function beschikbareVelden(env) {
  const { value } = await readThrough(
    env,
    { namespace: CACHE_NS.TAXONOMY, parts: ['fields'], ttlSeconds: CACHE_TTL.TAXONOMY_SECONDS },
    async () => {
      try {
        // Ook `selection` opvragen: daarmee kennen we meteen de mogelijke
        // doelgroepen, zonder een tweede aanroep en zonder een kopie van die
        // lijst in deze code.
        const velden = await executeKw(env, {
          model: ODOO_MODELS.SNIPPET,
          method: 'fields_get',
          args: [[], ['type', 'string', 'selection']]
        });
        return velden || {};
      } catch (error) {
        console.warn(`${LOG_PREFIX} fields_get mislukt:`, error?.message);
        return {};
      }
    }
  );
  return value;
}

/** De OPTIONELE velden: ze bestaan pas als iemand ze in Studio aanmaakt. */
const OPTIONELE_VELDEN = [
  { veld: SNIPPET_FIELDS.QUOTE, type: 'Text', wat: 'het citaat' },
  { veld: SNIPPET_FIELDS.AUDIENCE, type: 'Selection', wat: 'de doelgroep' },
  { veld: SNIPPET_FIELDS.CURATOR_NOTE, type: 'Text', wat: 'de curatorsnoot' }
];

async function veldBestaat(env, naam) {
  const velden = await beschikbareVelden(env);
  return Object.prototype.hasOwnProperty.call(velden, naam);
}

export async function quoteFieldAvailable(env) {
  return veldBestaat(env, SNIPPET_FIELDS.QUOTE);
}

export async function audienceFieldAvailable(env) {
  return veldBestaat(env, SNIPPET_FIELDS.AUDIENCE);
}

/**
 * De doelgroepen, zoals ze in Odoo staan.
 *
 * Odoo geeft een selection terug als `[[waarde, label], ...]`. Bestaat het
 * veld niet, dan is dit een lege lijst en verbergt de UI de keuze -- geen
 * foutmelding, want een doelgroep is optioneel.
 */
export async function listAudiences(env) {
  const velden = await beschikbareVelden(env);
  const def = velden[SNIPPET_FIELDS.AUDIENCE];
  if (!def || !Array.isArray(def.selection)) return [];
  return def.selection
    .filter((paar) => Array.isArray(paar) && paar.length >= 2)
    .map(([value, label]) => ({
      value: String(value),
      label: leesbaarDoelgroepLabel(value, label)
    }));
}

/**
 * Een doelgroeplabel dat een mens (en een taalmodel) iets zegt.
 *
 * Studio zet het label soms gelijk aan de technische waarde, en dan staat er
 * `geen-formeel-beheer` in het keuzemenu EN in de prompt. Het label stuurt bij
 * ons de samenvatting en de keuze van het citaat, dus dat verschil is niet
 * cosmetisch voor het resultaat: "Mede-eigenaars zonder formeel beheer" geeft
 * een andere tekst dan een slug.
 *
 * Dit is COSMETISCHE normalisatie, geen tweede lijst: er komt geen doelgroep
 * bij en er wordt geen betekenis verzonnen. Staat er in Studio een echt label,
 * dan wint dat altijd en doet deze functie niets -- Studio blijft de bron.
 */
function leesbaarDoelgroepLabel(value, label) {
  const l = String(label || '').trim();
  const v = String(value || '').trim();
  if (l && l !== v) return l;
  if (!v) return '';
  const woorden = v.replace(/[-_]+/g, ' ').trim();
  return woorden.charAt(0).toUpperCase() + woorden.slice(1);
}

/** De lijstvelden, met de optionele velden erbij die echt bestaan. */
async function lijstVelden(env) {
  const velden = await beschikbareVelden(env);
  const extra = OPTIONELE_VELDEN
    .map((o) => o.veld)
    .filter((naam) => Object.prototype.hasOwnProperty.call(velden, naam));
  return extra.length ? [...SNIPPET_LIST_FIELDS, ...extra] : SNIPPET_LIST_FIELDS;
}

/**
 * Haal de optionele velden eruit die Odoo (nog) niet kent.
 *
 * Zonder dit faalt een `create` volledig op een veld dat niet bestaat, en dan
 * kan er niets meer bewaard worden -- terwijl het enige gevolg zou moeten zijn
 * dat er één gegeven ontbreekt. De waarschuwing noemt het veldtype erbij,
 * zodat wie de log leest meteen weet wat hij in Studio moet aanmaken.
 */
async function stripOnbekendeVelden(env, values) {
  const velden = await beschikbareVelden(env);
  let kopie = values;
  for (const { veld, type, wat } of OPTIONELE_VELDEN) {
    if (values[veld] === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(velden, veld)) continue;
    if (kopie === values) kopie = { ...values };
    delete kopie[veld];
    console.warn(
      `${LOG_PREFIX} ${wat} is niet bewaard: ${veld} bestaat nog niet in Odoo `
      + `(Studio-veld, type ${type}).`
    );
  }
  return kopie;
}

export async function createSnippet(env, payload) {
  const values = await stripOnbekendeVelden(env, buildOdooValues(payload));
  const id = await create(env, { model: ODOO_MODELS.SNIPPET, values });

  // De afbeelding komt NA het aanmaken: pas dan is er een record om ze aan te
  // hangen, en een mislukte download mag het bericht niet tegenhouden.
  if (payload.imageSourceUrl) {
    await importImageFromUrl(env, id, payload.imageSourceUrl);
  }

  await invalidateItems(env);
  return getSnippet(env, id, { bypassCache: true });
}

export async function updateSnippet(env, id, payload) {
  const snippetId = Number(id);
  const values = await stripOnbekendeVelden(env, buildOdooValues(payload));

  if (payload.imageSourceUrl) {
    await importImageFromUrl(env, snippetId, payload.imageSourceUrl);
  }

  if (Object.keys(values).length === 0) return getSnippet(env, snippetId, { bypassCache: true });
  await write(env, { model: ODOO_MODELS.SNIPPET, ids: [snippetId], values });
  await invalidateItems(env);
  return getSnippet(env, snippetId, { bypassCache: true });
}

/** Een afbeelding groter dan dit slaan we over. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Haal een afbeelding op van een externe URL en zet ze in het binaire
 * Odoo-veld.
 *
 * BEST EFFORT: mislukt dit, dan wordt er gelogd en gaat het bericht gewoon
 * door zonder beeld. Een ontbrekende illustratie is geen reden om een bericht
 * niet te kunnen bewaren -- en de gebruiker kan er in Odoo altijd zelf een
 * zetten.
 */
export async function importImageFromUrl(env, id, imageUrl) {
  let doel;
  try {
    doel = new URL(String(imageUrl));
    if (doel.protocol !== 'http:' && doel.protocol !== 'https:') return false;
  } catch {
    return false;
  }

  try {
    const res = await fetch(doel.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MymmoContentFeed/1.0)' }
    });
    if (!res.ok) {
      console.warn(`${LOG_PREFIX} beeld ophalen gaf ${res.status} (${doel.host})`);
      return false;
    }

    const type = res.headers.get('Content-Type') || '';
    if (!type.startsWith('image/')) {
      console.warn(`${LOG_PREFIX} beeld-URL gaf geen afbeelding maar ${type || 'onbekend'}`);
      return false;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`${LOG_PREFIX} beeld overgeslagen: ${buffer.byteLength} bytes`);
      return false;
    }

    const bytes = new Uint8Array(buffer);
    // In blokken naar een binaire string: `String.fromCharCode(...bytes)` in
    // één keer blaast de call-stack op zodra de afbeelding wat groter is.
    let binair = '';
    const BLOK = 8192;
    for (let i = 0; i < bytes.length; i += BLOK) {
      binair += String.fromCharCode.apply(null, bytes.subarray(i, i + BLOK));
    }

    await write(env, {
      model: ODOO_MODELS.SNIPPET,
      ids: [Number(id)],
      values: { [SNIPPET_FIELDS.IMAGE]: btoa(binair) }
    });
    return true;
  } catch (error) {
    console.warn(`${LOG_PREFIX} beeld importeren mislukt (${doel.host}):`, error?.message);
    return false;
  }
}

/**
 * Verwijderen is ARCHIVEREN. Zelfde regel als bij de inschrijvingen van
 * events-v2: een bericht is een spoor (het stond op de site, het zat
 * mogelijk in een nieuwsbrief) en er is geen situatie waarin het echt weg
 * moet. Gearchiveerd verdwijnt het uit elke lijst en van de feed, maar het
 * blijft terug te halen.
 */
export async function setSnippetActive(env, id, active) {
  const snippetId = Number(id);
  await write(env, {
    model: ODOO_MODELS.SNIPPET,
    ids: [snippetId],
    values: { [SNIPPET_FIELDS.ACTIVE]: active !== false }
  });
  await invalidateItems(env);
  return getSnippet(env, snippetId, { bypassCache: true });
}

export { invalidateItems, invalidateTaxonomy, isPubliclyVisible, PUBLIC_VISIBLE_STATUSES };
