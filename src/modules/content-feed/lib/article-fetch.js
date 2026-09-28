/**
 * Content Feed — een artikel ophalen en uitlezen
 *
 * Haalt een publieke artikelpagina op en haalt er de metagegevens en de
 * lopende tekst uit. Geen AI hier: dit bestand levert alleen het RUWE
 * materiaal waar article-ai.js daarna een voorstel van maakt.
 *
 * Er wordt met HTMLRewriter geparseerd en NIET met reguliere expressies.
 * HTMLRewriter is de parser van het platform zelf: hij streamt, hij kent de
 * echte HTML-regels, en hij gaat niet onderuit op een attribuut met een `>`
 * erin of op een niet-gesloten tag. Een regex op HTML doet dat wel, en dan
 * krijg je een half artikel zonder dat iets zegt dat er iets mist.
 */

import { LOG_PREFIX } from '../constants.js';

/** Hoelang we op de site van iemand anders wachten. */
const FETCH_TIMEOUT_MS = 12000;

/**
 * Hoeveel tekst we meenemen naar de AI.
 *
 * MAX_PROMPT_TOKENS in mini-apps/lib/ai.js is 25.000 en de ruwe schatting
 * daar is ±4 tekens per token. We blijven daar ruim onder: een artikel dat
 * langer is dan dit, heeft zijn kern sowieso in de eerste 40.000 tekens
 * staan, en de rest is meestal commentaar en "lees ook".
 */
const MAX_TEXT_CHARS = 40000;

/** Een pagina groter dan dit is geen artikel. */
const MAX_HTML_BYTES = 3 * 1024 * 1024;

/**
 * Blokken waarvan de tekst NOOIT meetelt. Zonder dit belandt het
 * cookiebanner-verhaal en de volledige navigatie in de samenvatting.
 */
const NEGEER_TAGS = new Set([
  'script', 'style', 'nav', 'header', 'footer', 'aside', 'form',
  'noscript', 'svg', 'button', 'select', 'template', 'iframe'
]);

/** Waar lopende tekst in staat. */
const TEKST_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote']);

export class ArticleFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArticleFetchError';
    this.code = code;
  }
}

/**
 * De URL controleren vóór we hem ophalen.
 *
 * Alleen http(s), en geen interne adressen: deze functie haalt op wat een
 * gebruiker intypt, en dat is een server-side fetch vanuit onze Worker. Zonder
 * deze grens is dit een SSRF-pad naar alles wat vanaf de Worker bereikbaar is.
 */
export function validateArticleUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new ArticleFetchError('INVALID_URL', 'Dat is geen geldige link.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ArticleFetchError('INVALID_URL', 'Alleen http- en https-links kunnen opgehaald worden.');
  }

  const host = url.hostname.toLowerCase();
  const verboden =
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.internal')
    || host === '[::1]'
    // IPv4-adressen: wij willen een publieke site, geen adres in ons eigen net.
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

  if (verboden) {
    throw new ArticleFetchError('INVALID_URL', 'Deze link wijst niet naar een publieke website.');
  }
  return url;
}

/**
 * De named entities die in de praktijk voorkomen in koppen en lopende tekst.
 *
 * Bewust GEEN volledige HTML5-tabel (dat zijn er ruim 2000, goed voor een
 * paar honderd kB in een Worker). Alles wat hier niet in staat, komt als
 * numerieke entiteit binnen en wordt hieronder sowieso opgelost -- named
 * entities buiten dit lijstje zijn in moderne pagina's zeldzaam.
 */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  bull: '\u2022', middot: '\u00b7', laquo: '\u00ab', raquo: '\u00bb',
  euro: '\u20ac', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  deg: '\u00b0', plusmn: '\u00b1', times: '\u00d7', frac12: '\u00bd',
  eacute: '\u00e9', egrave: '\u00e8', ecirc: '\u00ea', euml: '\u00eb',
  agrave: '\u00e0', acirc: '\u00e2', auml: '\u00e4', aacute: '\u00e1',
  iuml: '\u00ef', icirc: '\u00ee', ouml: '\u00f6', ocirc: '\u00f4',
  oacute: '\u00f3', uuml: '\u00fc', ucirc: '\u00fb', ugrave: '\u00f9',
  ccedil: '\u00e7', ntilde: '\u00f1', szlig: '\u00df'
};

/**
 * HTML-entiteiten omzetten naar echte tekens.
 *
 * NODIG omdat HTMLRewriter attribuutwaarden RUW teruggeeft: een og:title met
 * `&#064;openvme &#x2022; Instagram` kwam anders letterlijk zo in het bericht
 * terecht. Dat was zichtbaar op het scherm én het is wat de AI te lezen kreeg.
 *
 * Eén doorloop, geen herhaling: bij meerdere rondes wordt `&amp;lt;` alsnog
 * `<`, en dan maak je van geescapete tekst weer markup.
 */
export function decodeEntities(value) {
  return String(value || '').replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (heel, code) => {
      if (code[0] === '#') {
        const nummer = code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
        // Geen geldig codepunt: laat staan wat er stond, in plaats van er een
        // vraagteken of een lege plek van te maken.
        if (!Number.isFinite(nummer) || nummer < 0 || nummer > 0x10ffff) return heel;
        try {
          return String.fromCodePoint(nummer);
        } catch {
          return heel;
        }
      }
      const naam = Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, code)
        ? NAMED_ENTITIES[code]
        : null;
      return naam === null ? heel : naam;
    }
  );
}

function schoonTekst(value) {
  return decodeEntities(String(value || '')).replace(/\s+/g, ' ').trim();
}

/**
 * Een datum uit een meta-tag halen.
 * Geeft JJJJ-MM-DD of null -- nooit een half ingevulde datum, want die leest
 * een mens niet als ontbrekend maar als fout.
 */
export function parseDatum(raw) {
  const value = schoonTekst(raw);
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const jaar = d.getUTCFullYear();
  if (jaar < 2000 || jaar > 2100) return null;
  return d.toISOString().slice(0, 10);
}

/** Een relatieve og:image absoluut maken tegen de artikel-URL. */
function absoluut(basis, waarde) {
  const v = schoonTekst(waarde);
  if (!v) return null;
  try {
    return new URL(v, basis).toString();
  } catch {
    return null;
  }
}

/**
 * Haal een artikel op en lees het uit.
 *
 * @returns {Promise<{url, title, description, siteName, imageUrl, publishedOn, text}>}
 */
export async function fetchArticle(url) {
  const doel = validateArticleUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(doel.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Zonder een gewone User-Agent geven veel nieuwssites een 403.
        'User-Agent': 'Mozilla/5.0 (compatible; MymmoContentFeed/1.0; +https://openvme.be)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8'
      }
    });
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === 'AbortError') {
      throw new ArticleFetchError('TIMEOUT', 'De website reageerde niet op tijd.');
    }
    throw new ArticleFetchError('UNREACHABLE', 'De website was niet bereikbaar.');
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new ArticleFetchError(
      'HTTP_ERROR',
      `De website antwoordde met ${response.status}. Staat het artikel achter een betaalmuur of een cookiemelding?`
    );
  }

  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('html')) {
    throw new ArticleFetchError('NOT_HTML', 'Die link geeft geen webpagina terug.');
  }

  const lengte = Number(response.headers.get('Content-Length') || 0);
  if (lengte && lengte > MAX_HTML_BYTES) {
    throw new ArticleFetchError('TOO_LARGE', 'Die pagina is te groot om te verwerken.');
  }

  const meta = {
    url: response.url || doel.toString(),
    title: null,
    description: null,
    siteName: null,
    imageUrl: null,
    publishedOn: null
  };
  const stukken = [];
  let tekstLengte = 0;
  // Hoe diep we in een blok zitten dat we negeren (nav, footer, script, ...).
  let negeerDiepte = 0;
  let inTekstTag = false;
  let inTitle = false;
  let titleBuffer = '';

  const rewriter = new HTMLRewriter()
    .on('meta', {
      element(el) {
        const property = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
        const content = el.getAttribute('content');
        if (!property || !content) return;

        if (property === 'og:image' || property === 'og:image:secure_url' || property === 'twitter:image') {
          if (!meta.imageUrl) meta.imageUrl = absoluut(meta.url, content);
        } else if (property === 'og:title' || property === 'twitter:title') {
          if (!meta.title) meta.title = schoonTekst(content);
        } else if (property === 'og:description' || property === 'description' || property === 'twitter:description') {
          if (!meta.description) meta.description = schoonTekst(content);
        } else if (property === 'og:site_name') {
          meta.siteName = schoonTekst(content);
        } else if (
          property === 'article:published_time'
          || property === 'datepublished'
          || property === 'publish-date'
          || property === 'date'
        ) {
          if (!meta.publishedOn) meta.publishedOn = parseDatum(content);
        }
      }
    })
    .on('title', {
      element() { inTitle = true; },
      text(chunk) {
        if (inTitle) titleBuffer += chunk.text;
        if (chunk.lastInTextNode) { /* wacht op meer */ }
      }
    })
    .on('time', {
      element(el) {
        if (!meta.publishedOn) meta.publishedOn = parseDatum(el.getAttribute('datetime'));
      }
    })
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();

        if (NEGEER_TAGS.has(tag)) {
          negeerDiepte += 1;
          // onEndTag bestaat niet voor zelfsluitende elementen; die hebben
          // ook geen inhoud, dus dan meteen weer terugdraaien.
          if (el.selfClosing || tag === 'svg') {
            negeerDiepte -= 1;
            return;
          }
          el.onEndTag(() => { negeerDiepte = Math.max(0, negeerDiepte - 1); });
          return;
        }

        if (TEKST_TAGS.has(tag) && negeerDiepte === 0) {
          inTekstTag = true;
          stukken.push('\n');
          el.onEndTag(() => { inTekstTag = false; });
        }
      },
      text(chunk) {
        if (negeerDiepte > 0 || !inTekstTag) return;
        if (tekstLengte >= MAX_TEXT_CHARS) return;
        const t = chunk.text;
        if (!t) return;
        stukken.push(t);
        tekstLengte += t.length;
      }
    });

  try {
    // .text() drijft de rewriter aan; zonder dit draait er geen enkele handler.
    await rewriter.transform(response).text();
  } catch (error) {
    console.warn(`${LOG_PREFIX} artikel parsen mislukt (${meta.url}):`, error?.message);
    throw new ArticleFetchError('PARSE_FAILED', 'De pagina kon niet gelezen worden.');
  }

  if (!meta.title) meta.title = schoonTekst(titleBuffer) || null;

  const text = decodeEntities(stukken.join(''))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  // Zonder tekst valt er niets te analyseren. Dat is bijna altijd een
  // betaalmuur of een pagina die haar inhoud pas met JavaScript opbouwt --
  // zeg dat, in plaats van de AI op een lege tekst los te laten en een
  // verzonnen samenvatting terug te geven.
  if (text.length < 200 && !meta.description) {
    throw new ArticleFetchError(
      'NO_CONTENT',
      'Op die pagina staat geen leesbare tekst. Waarschijnlijk een betaalmuur, '
      + 'of een pagina die haar inhoud pas in de browser opbouwt.'
    );
  }

  return { ...meta, text };
}
