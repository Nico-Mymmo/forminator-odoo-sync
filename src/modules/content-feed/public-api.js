/**
 * Content Feed — Publieke API
 *
 * Contract met de WordPress-plugin. Geen sessie, wel een sitesleutel.
 *
 * HARDE REGEL: elk bericht in een respons komt uit toPublicSnippetDto().
 * Die functie is de enige garantie dat de verantwoordelijke en de status
 * nooit publiek worden. Stel hier NOOIT zelf een object samen.
 *
 * De richting is HALEN, niet duwen: de site vraagt, wij antwoorden. Daarmee
 * bestaat er geen tussenstap meer die kan mislukken -- zie
 * docs/ontwerp-om-nieuws.md §1 voor wat de oude duw-keten kostte.
 */

import {
  LOG_PREFIX,
  PUBLIC_PREFIX,
  PUBLIC_SHAPE_VERSION,
  PUBLIC_RATE_LIMIT,
  PUBLIC_VISIBLE_STATUSES,
  PAGINATION,
  CACHE_TTL,
  CACHE_NS
} from './constants.js';
import { toPublicSnippetDto } from './odoo-contract.js';
import { listFeedEvents, EVENT_FEED_TYPE } from './lib/events-in-feed.js';
import {
  listSnippets,
  getSnippet,
  listTaxonomy
} from './lib/content-service.js';
import { weakEtag, checkRateLimitLocal, namespaceVersion } from './lib/cache.js';
import { serveSnippetImage } from './lib/image.js';

// ─── Sitesleutel ──────────────────────────────────────────────────────────────

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

/**
 * De sitesleutel valideren EN de sitenaam eruit halen.
 *
 * CONTENT_FEED_PUBLIC_SITE_KEYS is komma-gescheiden, elke sleutel optioneel
 * met een merk ervoor:
 *
 *   "openvme:abc123,syndicoach:def456"
 *
 * Het voorvoegsel is de NAAM van de site. Het filtert NIET -- welke
 * berichten een site toont, staat in haar shortcode. De sleutel is dus
 * authenticatie ("mag deze site ons bevragen"), geen autorisatie per bericht.
 * De naam komt in `meta.site` en in de logs, zodat je kan zien wie er bevraagt.
 *
 * Gevolg dat je moet kennen: elke geldige sleutel kan elk GEPUBLICEERD
 * bericht ophalen. Zie de toelichting bovenaan constants.js.
 */
function validateSiteKey(request, env) {
  const submitted = request.headers.get('X-Mymmo-Site-Key') || '';
  if (!submitted) return null;

  const configured = String(env?.CONTENT_FEED_PUBLIC_SITE_KEYS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (configured.length === 0) {
    console.warn(`${LOG_PREFIX} CONTENT_FEED_PUBLIC_SITE_KEYS is niet ingesteld; publieke API geweigerd`);
    return null;
  }

  for (const entry of configured) {
    const separator = entry.indexOf(':');
    const prefix = separator > 0 ? entry.slice(0, separator).trim().toLowerCase() : '';
    const key = separator > 0 ? entry.slice(separator + 1).trim() : entry;
    if (key !== '' && timingSafeEqual(submitted, key)) {
      return { key, site: prefix || null };
    }
  }
  return null;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env?.CONTENT_FEED_PUBLIC_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o !== '');

  const headers = { Vary: 'Origin, X-Mymmo-Site-Key, Accept-Encoding' };

  if (origin && allowed.includes(origin.replace(/\/$/, ''))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Mymmo-Site-Key, If-None-Match';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

// ─── Responses ────────────────────────────────────────────────────────────────

function errorResponse(message, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
      ...extraHeaders
    }
  });
}

/**
 * De ETag gaat over de DATA, niet over het moment van antwoorden.
 *
 * `meta.generated_at` staat in elke respons en verandert bij elk verzoek.
 * Telde het mee, dan matchte het If-None-Match van de plugin NOOIT en haalde
 * elke verversing de volledige body op -- exact de bug die events-v2 had.
 * Het veld blijft staan, het telt alleen niet mee.
 */
export async function etagForPayload(payload) {
  return weakEtag(
    JSON.stringify(payload, (naam, waarde) => (naam === 'generated_at' ? undefined : waarde))
  );
}

async function cachedJsonResponse(payload, request, env, { ttl, cacheHit }) {
  const body = JSON.stringify(payload);
  const etag = await etagForPayload(payload);

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${ttl * 5}`,
    ETag: etag,
    'X-Cache': cacheHit ? 'hit' : 'miss',
    ...corsHeaders(request, env)
  };

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

function meta(count, site = null) {
  return {
    shape_version: PUBLIC_SHAPE_VERSION,
    count,
    site,
    generated_at: new Date().toISOString()
  };
}

/** De basis-URL van deze Worker, zodat een beeld-URL absoluut wordt. */
function originOf(request) {
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleList(request, env, site) {
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || PAGINATION.DEFAULT_LIMIT, 1),
    PAGINATION.MAX_LIMIT
  );
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const taxonomy = await listTaxonomy(env);
  const tagsById = new Map(taxonomy.tags.map((t) => [t.id, t]));
  const typesById = new Map(taxonomy.types.map((t) => [t.id, t]));

  /* Komma-gescheiden slugs: de shortcode van de plugin kiest welke
     categorieen een pagina toont, en de filterbalk kan meerdere labels
     tegelijk aanzetten. Een onbekende slug geeft `-1` en dus een LEGE lijst,
     geen volledige -- stil alles tonen bij een typefout is hoe een pagina er
     goed uitziet terwijl ze het verkeerde toont. */
  const nietHerkend = [];
  const gevraagd = (param) => (url.searchParams.get(param) || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const slugsNaarIds = (param, slugs, lijst) => {
    if (slugs.length === 0) return null;
    return slugs.map((slug) => {
      const treffer = lijst.find((t) => t.slug === slug);
      if (!treffer) nietHerkend.push(`${param}:${slug}`);
      return treffer ? treffer.id : -1;
    });
  };

  const tagSlugs = gevraagd('tag');
  const typeSlugs = gevraagd('type');

  /* `evenement` is een SYNTHETISCH type: er is geen rij voor in Odoo, dus het
     mag nooit als snippet-slug opgezocht worden -- dan zou het als onbekend
     gelden en de hele lijst leegmaken. Het staat wel gewoon in de taxonomie,
     zodat een shortcode het kan noemen en de filterbalk het kan tonen. */
  const snippetTypeSlugs = typeSlugs.filter((slug) => slug !== EVENT_FEED_TYPE.slug);

  const tagIds = slugsNaarIds('tag', tagSlugs, taxonomy.tags);
  const typeIds = slugsNaarIds('type', snippetTypeSlugs, taxonomy.types);

  /* Geen type gevraagd = alles, dus ook events. Wel een type gevraagd, dan
     tellen events enkel mee als `evenement` erbij staat.

     Een LABELfilter sluit events uit: een event draagt de labels van de
     nieuwsberichten niet, dus het kan er per definitie nooit aan voldoen.
     Ze dan toch tonen zou betekenen dat een labelfilter meer teruggeeft dan
     het label belooft. */
  const wilEvents = (typeSlugs.length === 0 || typeSlugs.includes(EVENT_FEED_TYPE.slug))
    && tagSlugs.length === 0;
  const wilSnippets = typeSlugs.length === 0 || snippetTypeSlugs.length > 0;

  /* Een onbekende slug geeft een LEGE lijst, geen volledige -- stil alles
     tonen bij een typefout is hoe een pagina er goed uitziet terwijl ze het
     verkeerde toont. Maar stil NIETS tonen is even erg: dan is een typefout
     in een shortcode niet te onderscheiden van een storing of van een feed
     die echt nog leeg is. Daarom zegt het antwoord WELKE slug niet herkend
     werd, en noemt de log de slugs die er wel zijn. */
  if (nietHerkend.length > 0) {
    console.warn(
      `${LOG_PREFIX} onbekende slug(s): ${nietHerkend.join(', ')}`
      + ` | bekende types: ${taxonomy.types.map((t) => t.slug).join(', ')}`
      + ` | bekende labels: ${taxonomy.tags.map((t) => t.slug).join(', ')}`
    );
    return cachedJsonResponse(
      {
        items: [],
        meta: {
          ...meta(0, site),
          unknown: nietHerkend,
          known_types: taxonomy.types.map((t) => t.slug),
          known_tags: taxonomy.tags.map((t) => t.slug)
        }
      },
      request,
      env,
      { ttl: CACHE_TTL.PUBLIC_LIST_SECONDS, cacheHit: false }
    );
  }

  /* TWEE GESORTEERDE BRONNEN samenvoegen en dan pas snijden -- anders klopt
     de paginering niet. Elk van beide levert daarom `offset + limit` rijen:
     in het slechtste geval (alles komt uit een bron) is dat precies genoeg om
     de gevraagde pagina te vullen. Minder ophalen zou betekenen dat pagina 2
     items overslaat die pagina 1 al voorbij was. */
  const venster = Math.min(offset + limit, PAGINATION.MAX_LIMIT);

  const [snippetBron, eventLijst] = await Promise.all([
    wilSnippets
      ? listSnippets(env, {
        statuses: PUBLIC_VISIBLE_STATUSES,
        tagIds,
        typeIds,
        limit: venster,
        offset: 0
      })
      : Promise.resolve({ items: [], cached: false }),
    wilEvents ? listFeedEvents(env, { limit: venster }) : Promise.resolve([])
  ]);

  const origin = originOf(request);
  const snippets = snippetBron.items.map(
    (dto) => toPublicSnippetDto(dto, { tagsById, typesById, origin })
  );

  const alles = [...snippets, ...eventLijst].sort(vergelijkFeedItems);
  const publiek = alles.slice(offset, offset + limit);

  return cachedJsonResponse(
    {
      items: publiek,
      meta: {
        ...meta(publiek.length, site),
        // De plugin leidt hieruit af of er een "Meer laden"-knop moet staan.
        // Een echte totaalteller zou een tweede Odoo-query kosten voor iets
        // wat je met deze twee getallen ook weet.
        limit,
        offset,
        // Beide bronnen zijn op `venster` afgekapt, dus `alles` kan nooit
        // MEER bevatten dan er is -- maar wel evenveel. Dit meldt dus nooit
        // ten onrechte "er is niets meer"; hoogstens een keer een lege
        // volgende pagina, en dat is de goede kant om op te falen.
        has_more: alles.length > offset + limit
      }
    },
    request,
    env,
    { ttl: CACHE_TTL.PUBLIC_LIST_SECONDS, cacheHit: snippetBron.cached }
  );
}

/**
 * De volgorde van de samengevoegde tijdlijn: publicatiedatum aflopend, items
 * zonder datum onderaan.
 *
 * Dit spiegelt bewust wat Odoo met `desc nulls last` doet voor de snippets --
 * anders zou een event zonder datum bovenaan komen terwijl een snippet zonder
 * datum onderaan staat, en dan hangt de volgorde af van welke bron iets
 * toevallig miste.
 */
function vergelijkFeedItems(a, b) {
  const da = a?.publishedOn || '';
  const db = b?.publishedOn || '';
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? 1 : -1;
  }
  // Gelijke datum: een vaste tiebreak, anders wisselt de volgorde tussen twee
  // verversingen en leest dat op het scherm als een fout.
  return String(b?.id ?? '').localeCompare(String(a?.id ?? ''), undefined, { numeric: true });
}

async function handleDetail(request, env, site, id) {
  const dto = await getSnippet(env, id);

  // Niet gepubliceerd of gearchiveerd: 404, geen 403. Dat iets bestaat is
  // zelf informatie -- zelfde regel als bij een concept-formulier in
  // forminator-sync-v2.
  if (!dto || !publiekZichtbaar(dto)) {
    return errorResponse('Niet gevonden', 404, request, env);
  }

  const taxonomy = await listTaxonomy(env);
  const tagsById = new Map(taxonomy.tags.map((t) => [t.id, t]));
  const typesById = new Map(taxonomy.types.map((t) => [t.id, t]));

  return cachedJsonResponse(
    {
      item: toPublicSnippetDto(dto, { tagsById, typesById, origin: originOf(request) }),
      meta: meta(1, site)
    },
    request,
    env,
    { ttl: CACHE_TTL.PUBLIC_DETAIL_SECONDS, cacheHit: false }
  );
}

/**
 * Zichtbaarheid op het DTO (niet op het ruwe Odoo-record).
 * Het DTO is al genormaliseerd, dus dit is een simpele vergelijking.
 */
function publiekZichtbaar(dto) {
  if (!dto) return false;
  return dto.active && PUBLIC_VISIBLE_STATUSES.includes(dto.status);
}

async function handleTaxonomy(request, env, site) {
  const taxonomy = await listTaxonomy(env);
  // Events staan als eigen type in de lijst, zodat een shortcode ze kan
  // noemen (`categories="artikel,evenement"`) en de filterbalk ze kan tonen.
  // Achteraan: de bestaande types houden zo hun volgorde.
  const types = [...taxonomy.types, EVENT_FEED_TYPE];
  return cachedJsonResponse(
    { types, tags: taxonomy.tags, meta: meta(taxonomy.tags.length, site) },
    request,
    env,
    { ttl: CACHE_TTL.TAXONOMY_SECONDS, cacheHit: false }
  );
}

/**
 * De afbeelding van een bericht.
 *
 * De bytes komen uit het binaire Odoo-veld. De URL bevat een versiedeel
 * (`?v=`) dat uit write_date komt, dus een gewijzigd beeld krijgt een andere
 * URL -- daarom mag de cache hier een jaar staan.
 */
async function handleImage(request, env, ctx, id) {
  const dto = await getSnippet(env, id);
  if (!dto || !publiekZichtbaar(dto)) {
    return errorResponse('Niet gevonden', 404, request, env);
  }

  const versie = new URL(request.url).searchParams.get('v') || dto.imageVersion || '0';
  const res = await serveSnippetImage(env, ctx, id, versie, {
    extraHeaders: corsHeaders(request, env)
  });
  if (!res) return errorResponse('Niet gevonden', 404, request, env);
  return res;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function isContentFeedPublicApiPath(pathname) {
  return pathname.startsWith(`${PUBLIC_PREFIX}/`) || pathname === PUBLIC_PREFIX;
}

export async function handleContentFeedPublicApi(request, env, ctx, pathname) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405, request, env, { Allow: 'GET, OPTIONS' });
  }

  const subPath = pathname.slice(PUBLIC_PREFIX.length) || '/';
  const beeldPad = subPath.match(/^\/items\/(\d+)\/image\/?$/);

  /* De AFBEELDING vraagt GEEN sitesleutel, en dat kan ook niet anders: deze
     URL staat in een `<img src>` op een publieke pagina, en een browser stuurt
     daar geen `X-Mymmo-Site-Key`-header bij mee. Met de sleutel erop kon geen
     enkel beeld ooit laden -- 401 op elke afbeelding.

     Dat geeft niets prijs: `publiekZichtbaar()` blijft staan, dus enkel het
     beeld van een GEPUBLICEERD bericht komt eruit, en dat beeld staat per
     definitie al op een publieke pagina. Een concept blijft 404.

     De grens per seconde blijft wel, maar dan op het IP: er is hier geen
     sitesleutel om op te tellen. */
  if (beeldPad) {
    const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
    const beeldRate = checkRateLimitLocal(`cfeed:img:${ip}`, {
      windowSeconds: PUBLIC_RATE_LIMIT.WINDOW_SECONDS,
      maxRequests: PUBLIC_RATE_LIMIT.MAX_REQUESTS
    });
    if (!beeldRate.allowed) {
      return errorResponse('Te veel verzoeken', 429, request, env, {
        'Retry-After': String(beeldRate.retryAfter)
      });
    }
    try {
      return await handleImage(request, env, ctx, Number(beeldPad[1]));
    } catch (error) {
      console.error(`${LOG_PREFIX} publieke API faalde (${subPath}):`, error?.message);
      return errorResponse('Tijdelijk niet beschikbaar', 503, request, env);
    }
  }

  const site = validateSiteKey(request, env);
  if (!site) {
    return errorResponse('Ongeldige of ontbrekende sitesleutel', 401, request, env);
  }

  const rate = checkRateLimitLocal(`cfeed:${site.key}`, {
    windowSeconds: PUBLIC_RATE_LIMIT.WINDOW_SECONDS,
    maxRequests: PUBLIC_RATE_LIMIT.MAX_REQUESTS
  });
  if (!rate.allowed) {
    return errorResponse('Te veel verzoeken', 429, request, env, {
      'Retry-After': String(rate.retryAfter)
    });
  }

  // LAAG 1: de edge-cache van deze locatie. Gratis, per datacenter, en hij
  // zit VOOR alles: een treffer kost geen KV-read, geen Odoo-call en geen
  // rekenwerk. De sleutel bevat het versienummer plus de SITESLEUTEL --
  // nooit de echte URL, anders kan een respons van site A aan site B
  // geserveerd worden.
  const versie = await namespaceVersion(env, CACHE_NS.ITEMS);
  const url = new URL(request.url);
  const cacheKey = new Request(
    `https://content-feed.cache/${versie}/${site.key}${subPath}${url.search}`,
    { method: 'GET' }
  );
  const edge = caches.default;

  try {
    const treffer = await edge.match(cacheKey);
    if (treffer) {
      const headers = new Headers(treffer.headers);
      // CORS hoort BIJ HET VERZOEK, niet bij de opgeslagen respons.
      for (const [naam, waarde] of Object.entries(corsHeaders(request, env))) {
        headers.set(naam, waarde);
      }
      headers.set('X-Cache', 'edge');
      const ifNoneMatch = request.headers.get('If-None-Match');
      const etag = headers.get('ETag');
      if (ifNoneMatch && etag && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(treffer.body, { status: treffer.status, headers });
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} edge-cache lezen mislukt:`, error?.message);
  }

  let response;
  try {
    if (subPath === '/' || subPath === '' || subPath === '/items' || subPath === '/items/') {
      response = await handleList(request, env, site.site);
    } else if (subPath === '/taxonomy' || subPath === '/taxonomy/') {
      response = await handleTaxonomy(request, env, site.site);
    } else {
      const detail = subPath.match(/^\/items\/(\d+)\/?$/);
      if (detail) {
        response = await handleDetail(request, env, site.site, Number(detail[1]));
      } else {
        return errorResponse('Niet gevonden', 404, request, env);
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} publieke API faalde (${subPath}):`, error?.message);
    return errorResponse('Tijdelijk niet beschikbaar', 503, request, env);
  }

  if (response.status === 200) {
    try {
      const opslaan = response.clone();
      const headers = new Headers(opslaan.headers);
      // CORS NIET meebewaren: die hangt van de Origin van het verzoek af.
      headers.delete('Access-Control-Allow-Origin');
      ctx?.waitUntil?.(
        edge.put(cacheKey, new Response(opslaan.body, { status: 200, headers }))
      );
    } catch (error) {
      console.warn(`${LOG_PREFIX} edge-cache schrijven mislukt:`, error?.message);
    }
  }

  return response;
}
